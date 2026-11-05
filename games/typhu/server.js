// 🎩 Cờ Tỷ Phú — luật + bot. Xem "Game server interface" trong CLAUDE.md.
// Trạng thái:
//   phase: 'roll' | 'jail' | 'buy' | 'auction' | 'rent' | 'buyout' | 'casino' | 'train' | 'stock' | 'over'
//   cur: ghế đang tới lượt; first: ghế mở đầu mỗi vòng; dbl: số lần đổ đôi liên tiếp; again: được đổ tiếp (vừa đổ đôi).
//   own[i]: ghế sở hữu ô i (null = ngân hàng); lv[i]: 0–4 nhà, 5 = khách sạn.
//   pend: ngữ cảnh của quyết định đang chờ ({ cell, amt?, to? }).
//   auc: đấu giá kín { cell, bids: {ghế: giá}, key, flash, next } — mọi người đặt giá cùng lúc qua turn() → { seats, key }.
//   ev: biến cố của vòng hiện tại { k, g? } (chỉ Bất Ngờ). endAt: hết giờ — hết vòng mà now >= endAt thì kết thúc ván.
//   players[p]: { on, kind, name, cash, pos, jail, jailCards, hand: [mã thẻ kỹ năng], fest: ô lễ hội, stock: tiền đang đầu tư }
import {
  boardOf, isProp, CARDS, MYSTERY, SKILLS, SKILL_BAG, EVENTS, GROUPS, START_CASH, SALARY, BAIL, MIN_BID, HAND_MAX, EVENT_EVERY,
  groupCells, hasSet, setsOf, countKind, evNow, houseCost, buyoutPrice, rentOf, worth, animDuration,
} from './data.js';

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const d6 = () => 1 + Math.floor(Math.random() * 6);
const B = st => boardOf(st.chaos);
const alive = st => st.players.map((pl, i) => (pl.on ? i : -1)).filter(i => i >= 0);
const others = (st, p) => alive(st).filter(q => q !== p);
const diceSum = st => st.dice[0] + st.dice[1];

// ================= TIỀN =================
// p trả amt cho `to` (ghế, -1 = ngân hàng, 'pot' = Hũ Vàng). Thiếu thì tự bán tài sản; vẫn thiếu → phá sản, hết ván.
function payTo(st, p, to, amt, ev, why, cell) {
  const pl = st.players[p];
  if (amt <= 0) return true;
  if (pl.cash < amt) raise(st, p, amt, ev);
  const paid = Math.min(pl.cash, amt);
  pl.cash -= paid;
  if (to === 'pot') st.pot += paid;
  else if (to >= 0) st.players[to].cash += paid;
  ev.push({ t: 'pay', p, to, amt: paid, why, cell });
  if (paid < amt) { gameOver(st, ev, 'bankrupt', p); return false; }
  return true;
}
function gain(st, p, amt, ev, why) {
  st.players[p].cash += amt;
  ev.push({ t: 'gain', p, amt, why });
}

// Gom đủ tiền: bán nhà (nửa giá xây, nhóm rẻ trước), rồi bán đất cho ngân hàng (nửa giá, đất lẻ rẻ trước, đất đủ bộ sau cùng).
function raise(st, p, need, ev) {
  const pl = st.players[p], b = B(st);
  while (pl.cash < need) {
    let h = -1;
    for (let i = 0; i < 40; i++) {
      if (st.own[i] !== p || !st.lv[i]) continue;
      if (h < 0 || GROUPS[b[i].g].hc < GROUPS[b[h].g].hc || (GROUPS[b[i].g].hc === GROUPS[b[h].g].hc && st.lv[i] > st.lv[h])) h = i;
    }
    if (h >= 0) {
      const amt = GROUPS[b[h].g].hc / 2;
      st.lv[h]--; pl.cash += amt;
      ev.push({ t: 'sell', p, cell: h, house: 1, amt });
      continue;
    }
    const score = i => b[i].price + (b[i].k === 'p' && hasSet(st, p, b[i].g) ? 1000 : 0);
    let l = -1;
    for (let i = 0; i < 40; i++) if (st.own[i] === p && (l < 0 || score(i) < score(l))) l = i;
    if (l < 0) return;
    const amt = b[l].price / 2;
    st.own[l] = null;
    if (pl.fest === l) pl.fest = null;
    pl.cash += amt;
    ev.push({ t: 'sell', p, cell: l, amt });
  }
}

function gameOver(st, ev, reason, who) {
  st.phase = 'over';
  st.pend = null;
  st.auc = null;
  const res = alive(st).map(p => ({ p, worth: worth(st, p), cash: st.players[p].cash, broke: reason === 'bankrupt' && p === who }));
  res.sort((a, b) => (a.broke - b.broke) || (b.worth - a.worth));
  st.results = res;
  st.winners = reason === 'mono' ? [who] : res.filter(r => !r.broke && r.worth === res[0].worth).map(r => r.p);
  st.reason = reason;
  ev.push({ t: 'over', reason, p: who, winners: st.winners, results: res });
}

// Sở hữu đủ 3 bộ màu → thắng ngay (nếu bật).
function checkMono(st, p, ev) {
  if (st.instant && st.phase !== 'over' && setsOf(st, p).length >= 3) { gameOver(st, ev, 'mono', p); return true; }
  return false;
}

function giveSkill(st, p, ev, why) {
  const pl = st.players[p];
  if (!st.chaos || pl.hand.length >= HAND_MAX) return;
  const k = pick(SKILL_BAG);
  pl.hand.push(k);
  ev.push({ t: 'skill', p, k, why });
}

// ================= DI CHUYỂN =================
function passGo(st, p, ev) {
  const pl = st.players[p];
  gain(st, p, evNow(st, 'bonus') ? SALARY * 2 : SALARY, ev, 'go');
  if (pl.stock) {
    const mul = pick([0, 0.5, 1, 1.5, 2, 3]), amt = Math.round(pl.stock * mul);
    ev.push({ t: 'dividend', p, inv: pl.stock, mul, amt });
    pl.cash += amt;
    pl.stock = 0;
  }
  if (st.chaos && Math.random() < 0.5) giveSkill(st, p, ev, 'go');
}
// Đi n bước (âm = lùi). Đi tới qua Xuất Phát thì nhận lương.
function moveBy(st, p, n, ev) {
  const pl = st.players[p], from = pl.pos;
  pl.pos = (from + n + 40) % 40;
  ev.push({ t: 'move', p, from, n });
  if (n > 0 && from + n >= 40) passGo(st, p, ev);
}
// Bay thẳng tới ô `to` theo chiều đi (salary: qua Xuất Phát có nhận lương không).
function jumpTo(st, p, to, ev, how, salary = true) {
  const pl = st.players[p], from = pl.pos;
  pl.pos = to;
  ev.push({ t: 'jump', p, from, to, how });
  if (salary && to < from) passGo(st, p, ev);
}
function goJail(st, p, ev) {
  const pl = st.players[p];
  pl.pos = 10;
  pl.jail = true;
  if (p === st.cur) st.again = false;
  ev.push({ t: 'jail', p });
}

// ================= LƯỢT & VÒNG =================
function beginTurn(st, p, ev) {
  st.cur = p;
  st.dbl = 0;
  st.again = false;
  st.pend = null;
  st.phase = st.players[p].jail ? 'jail' : 'roll';
  ev.push({ t: 'turn', p });
}

// Ô vừa dừng đã xử lý xong: đổ đôi thì đổ tiếp, không thì sang người kế.
function settle(st, ev) {
  if (st.phase === 'over') return;
  st.pend = null;
  if (st.again && !st.players[st.cur].jail) {
    st.again = false;
    st.phase = 'roll';
    ev.push({ t: 'again', p: st.cur });
    return;
  }
  nextTurn(st, ev);
}

function nextTurn(st, ev) {
  const order = alive(st), nx = order[(order.indexOf(st.cur) + 1) % order.length];
  if (nx === st.first) {
    newRound(st, ev);
    if (st.phase === 'over') return;
    if (st.auc) { st.auc.next = nx; return; } // Đấu Giá Chớp Nhoáng chen vào trước lượt đầu vòng
  }
  beginTurn(st, nx, ev);
}

function newRound(st, ev) {
  if (st.now >= st.endAt) { gameOver(st, ev, 'time'); return; }
  st.round++;
  st.ev = null;
  ev.push({ t: 'round', n: st.round, last: false });
  if (st.chaos && st.round % EVENT_EVERY === 0) fireEvent(st, ev);
}

function fireEvent(st, ev) {
  const b = B(st), ok = {
    storm: () => st.lv.some(l => l > 0),
    flash: () => b.some((c, i) => c.k === 'p' && st.own[i] == null) && alive(st).some(p => st.players[p].cash >= MIN_BID),
    tour: () => st.own.some((o, i) => o != null && b[i].k === 'p'),
  };
  let k;
  for (let tries = 0; tries < 20; tries++) {
    if (!st.bag.length) st.bag = shuffle(Object.keys(EVENTS));
    k = st.bag.pop();
    if (!ok[k] || ok[k]()) break;
    k = null;
  }
  if (!k) return;
  st.ev = { k };
  const e = { t: 'event', k };
  switch (k) {
    case 'storm': {
      const hit = shuffle(st.lv.map((l, i) => (l > 0 ? i : -1)).filter(i => i >= 0)).slice(0, 3);
      for (const i of hit) st.lv[i]--;
      e.hit = hit;
      break;
    }
    case 'tour': {
      const gs = [...new Set(st.own.map((o, i) => (o != null && b[i].k === 'p' ? b[i].g : null)).filter(Boolean))];
      st.ev.g = e.g = pick(gs);
      break;
    }
    case 'flash': {
      const free = b.map((c, i) => (c.k === 'p' && st.own[i] == null ? i : -1)).filter(i => i >= 0);
      e.cell = pick(free);
      break;
    }
  }
  ev.push(e);
  if (k === 'robin') {
    const ps = alive(st).map(p => ({ p, w: worth(st, p) })).sort((a, b2) => b2.w - a.w);
    if (ps.length > 1) payTo(st, ps[0].p, ps[ps.length - 1].p, 200, ev, 'robin');
  } else if (k === 'cards') for (const p of alive(st)) giveSkill(st, p, ev, 'event');
  else if (k === 'tax') { for (const p of alive(st)) if (!payTo(st, p, 'pot', Math.floor(st.players[p].cash / 10), ev, 'tax')) return; }
  else if (k === 'flash') startAuction(st, e.cell, ev, true);
}

// ================= ĐẤU GIÁ (kín, cùng lúc) =================
const aucSeats = st => alive(st).filter(p => !(p in st.auc.bids) && st.players[p].cash >= MIN_BID);
function startAuction(st, cell, ev, flash = false) {
  st.auc = { cell, bids: {}, key: 'a' + ++st.aucN, flash, next: null };
  st.phase = 'auction';
  st.pend = null;
  ev.push({ t: 'auction', cell, flash });
  if (!aucSeats(st).length) { resolveAuction(st, ev); return false; }
  return true;
}
function resolveAuction(st, ev) {
  const a = st.auc, bids = a.bids;
  const top = Math.max(0, ...Object.values(bids));
  let win = null;
  if (top >= MIN_BID) {
    // Hoà giá: ai gần người đang tới lượt nhất (theo chiều chơi) thắng.
    const order = alive(st), base = order.indexOf(st.cur);
    win = order.map((_, k) => order[(base + k) % order.length]).find(p => bids[p] === top);
  }
  st.auc = null;
  st.phase = 'roll';
  if (win != null) {
    st.players[win].cash -= top;
    st.own[a.cell] = win;
    ev.push({ t: 'won', p: win, cell: a.cell, amt: top, bids });
    if (checkMono(st, win, ev)) return;
  } else ev.push({ t: 'nobid', cell: a.cell, bids });
  if (a.flash) beginTurn(st, a.next ?? st.cur, ev);
  else settle(st, ev);
}

// ================= Ô CỜ =================
// Trả về true nếu đang chờ một quyết định (phase đã đổi), false nếu ô đã xử lý xong.
function land(st, p, ev, opt = {}) {
  if (st.phase === 'over') return false;
  const pl = st.players[p], i = pl.pos, c = B(st)[i];
  switch (c.k) {
    case 'p': case 'r': case 'u': return landProp(st, p, i, ev, opt);
    case 'ch': case 'cc': return drawCard(st, p, c.k, ev);
    case 'tax': payTo(st, p, st.chaos ? 'pot' : -1, c.amt, ev, 'tax', i); return false;
    case 'tojail': goJail(st, p, ev); return false;
    case 'park':
      if (st.chaos && st.pot > 0) { const amt = st.pot; st.pot = 0; pl.cash += amt; ev.push({ t: 'pot', p, amt }); }
      return false;
    case 'casino':
      if (pl.cash < 100) return false;
      st.phase = 'casino'; st.pend = { cell: i };
      return true;
    case 'stock':
      if (pl.stock || pl.cash < 100) return false;
      st.phase = 'stock'; st.pend = { cell: i };
      return true;
    case 'train':
      st.phase = 'train'; st.pend = { cell: i };
      return true;
    case 'portal': {
      const dests = B(st).map((x, j) => (j !== i && !['portal', 'tojail', 'train'].includes(x.k) ? j : -1)).filter(j => j >= 0);
      jumpTo(st, p, pick(dests), ev, 'portal', false);
      return land(st, p, ev);
    }
    default: return false;
  }
}

function landProp(st, p, i, ev, opt) {
  const pl = st.players[p], c = B(st)[i], o = st.own[i];
  if (o == null) {
    if (pl.cash >= c.price) { st.phase = 'buy'; st.pend = { cell: i }; return true; }
    return startAuction(st, i, ev);
  }
  if (o === p) return false;
  const amt = Math.floor(rentOf(st, i, diceSum(st)) * (opt.mult || 1));
  if (amt > 0) {
    if (pl.hand.includes('shield')) { st.phase = 'rent'; st.pend = { cell: i, amt, to: o }; return true; }
    if (!payTo(st, p, o, amt, ev, 'rent', i)) return false;
  }
  return offerBuyout(st, p, i);
}

// Mua lại cưỡng chế: trả xong tiền thuê thì được mua lại ô (trừ khách sạn) với giá ×2 (đất + nhà), chủ cũ nhận tiền.
function offerBuyout(st, p, i) {
  const amt = buyoutPrice(st, i);
  if (st.lv[i] >= 5 || st.players[p].cash < amt) return false;
  st.phase = 'buyout'; st.pend = { cell: i, amt, to: st.own[i] };
  return true;
}

function drawCard(st, p, deck, ev) {
  const d = st.decks[deck], id = d.shift();
  d.push(id);
  const C = CARDS[deck][id], pl = st.players[p];
  ev.push({ t: 'card', p, deck, id });
  if (C.go != null) { jumpTo(st, p, C.go, ev, 'card'); return land(st, p, ev); }
  if (C.near) {
    const b = B(st);
    let to = pl.pos;
    do to = (to + 1) % 40; while (b[to].k !== C.near);
    jumpTo(st, p, to, ev, 'card');
    return land(st, p, ev, { mult: C.near === 'r' ? 2 : 1 });
  }
  if (C.back) { moveBy(st, p, -C.back, ev); return land(st, p, ev); }
  if (C.jail) { goJail(st, p, ev); return false; }
  if (C.jailcard) { pl.jailCards++; return false; }
  if (C.gain) { gain(st, p, C.gain, ev, 'card'); return false; }
  if (C.pay) { payTo(st, p, st.chaos ? 'pot' : -1, C.pay, ev, 'card'); return false; }
  if (C.repair) {
    let amt = 0;
    for (let i = 0; i < 40; i++) if (st.own[i] === p && st.lv[i]) amt += st.lv[i] === 5 ? C.repair[1] : st.lv[i] * C.repair[0];
    payTo(st, p, st.chaos ? 'pot' : -1, amt, ev, 'card');
    return false;
  }
  if (C.payEach) { for (const q of others(st, p)) if (!payTo(st, p, q, C.payEach, ev, 'card')) break; return false; }
  if (C.collectEach) { for (const q of others(st, p)) if (!payTo(st, q, p, C.collectEach, ev, 'card')) break; return false; }
  if (C.skill) { if (pl.hand.length < HAND_MAX) giveSkill(st, p, ev, 'card'); else ev.push({ t: 'gain', p, amt: 0, why: 'full' }); return false; }
  if (C.mystery) { gain(st, p, pick(MYSTERY), ev, 'mystery'); return false; }
  if (C.train) { st.phase = 'train'; st.pend = { cell: pl.pos }; return true; }
  return false;
}

// Đổ xúc xắc (fixed = tổng tự chọn của thẻ 🎯) rồi đi và xử lý ô dừng.
function roll(st, p, ev, fixed) {
  let a, b;
  if (fixed) { a = Math.min(6, Math.floor(fixed / 2) + 1); b = fixed - a; if (b < 1) a = b = 1; }
  else { a = d6(); b = d6(); }
  const dbl = !fixed && a === b;
  st.dice = [a, b];
  ev.push({ t: 'dice', p, d: [a, b], dbl, fixed: !!fixed });
  if (dbl && ++st.dbl >= 3) { ev.push({ t: 'speed', p }); goJail(st, p, ev); settle(st, ev); return; }
  st.again = dbl;
  moveBy(st, p, a + b, ev);
  if (!land(st, p, ev)) settle(st, ev);
}

// ================= HÀNH ĐỘNG =================
const ERR = m => ({ ok: false, err: m });

function canBuild(st, p, i) {
  const c = B(st)[i];
  if (!c || c.k !== 'p' || st.own[i] !== p) return 'Chỉ xây được trên đất của bạn';
  if (!hasSet(st, p, c.g)) return `Cần sở hữu đủ nhóm ${GROUPS[c.g].name} mới được xây`;
  if (st.lv[i] >= 5) return 'Ô này đã có khách sạn';
  if (st.players[p].cash < houseCost(st, i)) return 'Không đủ tiền xây';
  return null;
}

function useSkill(st, p, a, ev) {
  const pl = st.players[p], k = a.k, idx = pl.hand.indexOf(k);
  if (idx < 0 || !SKILLS[k] || !SKILLS[k].pre) return 'Bạn không có thẻ này';
  if (k === 'dice') {
    const v = Math.round(+a.v);
    if (!(v >= 2 && v <= 12)) return 'Chọn tổng từ 2 đến 12';
    pl.hand.splice(idx, 1);
    ev.push({ t: 'use', p, k, v });
    roll(st, p, ev, v);
    return null;
  }
  if (k === 'swap') {
    const q = +a.to;
    if (!others(st, p).includes(q) || st.players[q].jail) return 'Chọn một người chơi khác (không ở trong tù)';
    pl.hand.splice(idx, 1);
    const pq = st.players[q], from = pl.pos;
    pl.pos = pq.pos; pq.pos = from;
    ev.push({ t: 'use', p, k, to: q, a: pl.pos, b: pq.pos });
    return null;
  }
  if (k === 'bomb') {
    const i = +a.cell;
    if (st.own[i] == null || st.own[i] === p || !(st.lv[i] > 0)) return 'Chọn một ô có nhà của đối thủ';
    pl.hand.splice(idx, 1);
    st.lv[i]--;
    ev.push({ t: 'use', p, k, cell: i, to: st.own[i] });
    return null;
  }
  if (k === 'fest') {
    const i = +a.cell;
    if (st.own[i] !== p || B(st)[i].k !== 'p') return 'Chọn một ô đất của bạn';
    pl.hand.splice(idx, 1);
    pl.fest = i;
    ev.push({ t: 'use', p, k, cell: i });
    return null;
  }
  return 'Thẻ này không dùng lúc này';
}

function act(st, seat, a, now) {
  if (st.phase === 'over') return ERR('Ván đã kết thúc');
  if (!a || typeof a !== 'object') return ERR('Hành động không hợp lệ');
  st.now = now;
  const ev = [];
  if (st.phase === 'auction') {
    if (a.type !== 'bid') return ERR('Đang đấu giá — hãy đặt giá');
    if (!aucSeats(st).includes(seat)) return ERR('Bạn đã đặt giá rồi');
    const amt = Math.floor(+a.amt) || 0;
    if (amt < 0 || amt > st.players[seat].cash) return ERR('Giá đặt vượt quá tiền mặt của bạn');
    if (amt && amt < MIN_BID) return ERR(`Giá tối thiểu $${MIN_BID}`);
    st.auc.bids[seat] = amt;
    ev.push({ t: 'bid', p: seat });
    if (!aucSeats(st).length) resolveAuction(st, ev);
    return { ok: true, events: ev };
  }
  if (seat !== st.cur) return ERR('Chưa đến lượt bạn');
  const pl = st.players[seat], P = st.pend;
  switch (st.phase) {
    case 'roll':
      if (a.type === 'roll') roll(st, seat, ev);
      else if (a.type === 'build') {
        const i = +a.cell, err = canBuild(st, seat, i);
        if (err) return ERR(err);
        const cost = houseCost(st, i);
        pl.cash -= cost;
        st.lv[i]++;
        ev.push({ t: 'build', p: seat, cell: i, lv: st.lv[i], cost });
      } else if (a.type === 'card') {
        const err = useSkill(st, seat, a, ev);
        if (err) return ERR(err);
      } else return ERR('Hãy đổ xúc xắc');
      break;
    case 'jail':
      if (a.type === 'bail' || a.type === 'jailcard') {
        if (a.type === 'bail') { if (pl.cash < BAIL) return ERR(`Cần $${BAIL} để nộp phạt`); payTo(st, seat, st.chaos ? 'pot' : -1, BAIL, ev, 'bail'); }
        else { if (!pl.jailCards) return ERR('Bạn không có Thẻ Ra Tù'); pl.jailCards--; }
        pl.jail = false;
        ev.push({ t: 'free', p: seat, how: a.type });
        st.phase = 'roll';
      } else if (a.type === 'roll') {
        const d = [d6(), d6()];
        st.dice = d;
        ev.push({ t: 'dice', p: seat, d, dbl: d[0] === d[1], jail: true });
        pl.jail = false; // không ra được thì cũng chỉ ngồi 1 lượt: lượt sau tự do
        if (d[0] === d[1]) {
          ev.push({ t: 'free', p: seat, how: 'dbl' });
          moveBy(st, seat, d[0] + d[1], ev);
          if (!land(st, seat, ev)) settle(st, ev);
        } else { ev.push({ t: 'stay', p: seat }); settle(st, ev); }
      } else return ERR('Hãy chọn cách ra tù');
      break;
    case 'buy':
      if (a.type === 'buy') {
        const c = B(st)[P.cell];
        if (pl.cash < c.price) return ERR('Không đủ tiền');
        pl.cash -= c.price;
        st.own[P.cell] = seat;
        ev.push({ t: 'buy', p: seat, cell: P.cell, amt: c.price });
        if (!checkMono(st, seat, ev)) settle(st, ev);
      } else if (a.type === 'pass') startAuction(st, P.cell, ev); // không ai đủ tiền đặt giá thì tự kết thúc ngay
      else return ERR('Mua hay bỏ qua?');
      break;
    case 'rent':
      if (a.type === 'shield') {
        const k = pl.hand.indexOf('shield');
        if (k < 0) return ERR('Bạn không có thẻ Miễn Thuê');
        pl.hand.splice(k, 1);
        ev.push({ t: 'use', p: seat, k: 'shield', cell: P.cell, to: P.to, amt: P.amt });
      } else if (a.type === 'pay') { if (!payTo(st, seat, P.to, P.amt, ev, 'rent', P.cell)) break; }
      else return ERR('Trả tiền thuê hay dùng thẻ?');
      if (!offerBuyout(st, seat, P.cell)) settle(st, ev);
      break;
    case 'buyout':
      if (a.type === 'buyout') {
        const amt = buyoutPrice(st, P.cell), from = st.own[P.cell];
        if (pl.cash < amt) return ERR('Không đủ tiền');
        pl.cash -= amt;
        st.players[from].cash += amt;
        if (st.players[from].fest === P.cell) st.players[from].fest = null;
        st.own[P.cell] = seat;
        ev.push({ t: 'buyout', p: seat, from, cell: P.cell, amt });
        if (!checkMono(st, seat, ev)) settle(st, ev);
      } else if (a.type === 'skip') settle(st, ev);
      else return ERR('Mua lại hay thôi?');
      break;
    case 'casino': {
      const amt = Math.floor(+a.amt) || 0;
      if (a.type !== 'bet' || ![0, 100, 300].includes(amt)) return ERR('Chọn mức cược');
      if (amt > pl.cash) return ERR('Không đủ tiền cược');
      if (amt) {
        const win = Math.random() < 0.5;
        if (win) pl.cash += amt; else { pl.cash -= amt; st.pot += amt; }
        ev.push({ t: 'casino', p: seat, amt, win });
      }
      settle(st, ev);
      break;
    }
    case 'stock': {
      const amt = Math.floor(+a.amt) || 0;
      if (a.type !== 'invest' || ![0, 100, 200].includes(amt)) return ERR('Chọn mức đầu tư');
      if (amt > pl.cash) return ERR('Không đủ tiền');
      if (amt) { pl.cash -= amt; pl.stock = amt; ev.push({ t: 'invest', p: seat, amt }); }
      settle(st, ev);
      break;
    }
    case 'train': {
      if (a.type !== 'train') return ERR('Chọn ô muốn tới');
      const to = Math.floor(+a.to);
      if (to === -1) { settle(st, ev); break; }
      if (!(to >= 0 && to < 40) || to === pl.pos || ['tojail', 'train'].includes(B(st)[to].k)) return ERR('Không tới ô đó được');
      jumpTo(st, seat, to, ev, 'train');
      if (!land(st, seat, ev)) settle(st, ev);
      break;
    }
    default: return ERR('Hành động không hợp lệ');
  }
  return { ok: true, events: ev };
}

// ================= BOT =================
// Giá trị một ô với ghế p: hoàn thành bộ ×2, chặn bộ của người khác ×1.5, đã có ô cùng nhóm ×1.25.
function valueFor(st, p, i) {
  const c = B(st)[i];
  if (c.k === 'r') return c.price * (1 + 0.25 * countKind(st, p, 'r'));
  if (c.k === 'u') return c.price * 0.8;
  const cells = groupCells(st.chaos, c.g).filter(j => j !== i);
  const mine = cells.filter(j => st.own[j] === p).length;
  if (mine === cells.length) return c.price * 2.2;
  const owners = new Set(cells.map(j => st.own[j]));
  if (owners.size === 1 && !owners.has(null) && !owners.has(p)) return c.price * 1.6;
  return c.price * (mine ? 1.3 : 1);
}
// Tiền nên giữ lại: tuỳ tiền thuê đắt nhất của đối thủ đang có trên bàn.
function reserve(st, p) {
  let top = 0;
  for (let i = 0; i < 40; i++) if (st.own[i] != null && st.own[i] !== p) top = Math.max(top, rentOf(st, i, 7));
  return Math.min(450, 60 + top * 0.5);
}

function botBuild(st, p) {
  const pl = st.players[p], keep = reserve(st, p) + 50;
  let best = -1, bestScore = 0;
  for (const g of setsOf(st, p)) for (const i of groupCells(st.chaos, g)) {
    if (st.lv[i] >= 5) continue;
    const cost = houseCost(st, i);
    if (pl.cash - cost < keep) continue;
    const c = B(st)[i], gainR = c.rent[st.lv[i] + 1] - (st.lv[i] ? c.rent[st.lv[i]] : c.rent[0] * 2);
    const score = gainR / cost - st.lv[i] * 0.05; // xây đều: ưu tiên ô ít nhà
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

// Rủi ro tiền thuê nếu đứng ở ô pos rồi đổ xúc xắc (kỳ vọng).
function riskAt(st, p, pos) {
  let r = 0;
  for (let s = 2; s <= 12; s++) {
    const i = (pos + s) % 40, prob = (6 - Math.abs(7 - s)) / 36;
    if (st.own[i] != null && st.own[i] !== p) r += prob * rentOf(st, i, s);
  }
  return r;
}
// Điểm của việc dừng ở ô i (cho thẻ 🎯).
function landScore(st, p, i) {
  const c = B(st)[i], pl = st.players[p];
  if (isProp(c)) {
    if (st.own[i] == null) return pl.cash >= c.price ? valueFor(st, p, i) - c.price * 0.6 : 0;
    return st.own[i] === p ? 0 : -rentOf(st, i, 7);
  }
  return { tojail: -60, tax: -(c.amt || 0), ch: 10, cc: 10, park: st.chaos ? st.pot : 0, train: 40, go: 0 }[c.k] ?? 0;
}

function botSkill(st, p) {
  const pl = st.players[p], b = B(st);
  for (const k of pl.hand) {
    if (k === 'fest' && (pl.fest == null || st.own[pl.fest] !== p)) {
      let best = -1;
      for (let i = 0; i < 40; i++) if (st.own[i] === p && b[i].k === 'p' && (best < 0 || rentOf(st, i) > rentOf(st, best))) best = i;
      if (best >= 0 && rentOf(st, best) >= 20) return { type: 'card', k, cell: best };
    }
    if (k === 'bomb') {
      let best = -1;
      for (let i = 0; i < 40; i++) if (st.own[i] != null && st.own[i] !== p && st.lv[i] > 0 && (best < 0 || rentOf(st, i) > rentOf(st, best))) best = i;
      if (best >= 0 && rentOf(st, best) >= 150) return { type: 'card', k, cell: best };
    }
    if (k === 'swap') {
      const mine = riskAt(st, p, pl.pos);
      const opts = others(st, p).filter(q => !st.players[q].jail).map(q => ({ q, r: riskAt(st, p, st.players[q].pos) })).sort((x, y) => x.r - y.r);
      if (opts.length && mine > 120 && opts[0].r < mine * 0.4) return { type: 'card', k, to: opts[0].q };
    }
    if (k === 'dice') {
      let best = 2, bestS = -Infinity, avg = 0;
      for (let s = 2; s <= 12; s++) {
        const v = landScore(st, p, (pl.pos + s) % 40);
        avg += v * (6 - Math.abs(7 - s)) / 36;
        if (v > bestS) { bestS = v; best = s; }
      }
      if (bestS - avg > 90) return { type: 'card', k, v: best };
    }
  }
  return null;
}

function botBid(st, p) {
  const pl = st.players[p], c = B(st)[st.auc.cell];
  const cap = Math.min(pl.cash - reserve(st, p) * 0.5, valueFor(st, p, st.auc.cell) * (0.75 + Math.random() * 0.35));
  if (cap < MIN_BID) return 0;
  const bid = Math.floor(Math.min(cap, c.price * (0.5 + Math.random() * 0.6)) / 5) * 5;
  return bid >= MIN_BID ? bid : 0;
}

function botTrain(st, p) {
  const pl = st.players[p], b = B(st);
  let best = 0, bestV = SALARY * 0.5;
  for (let i = 0; i < 40; i++) {
    if (i === pl.pos || ['tojail', 'train'].includes(b[i].k)) continue;
    const v = landScore(st, p, i) + (i < pl.pos ? SALARY : 0);
    if (v > bestV) { bestV = v; best = i; }
  }
  return best === pl.pos ? -1 : best;
}

function bot(st, seat, { timeout } = {}) {
  const pl = st.players[seat], P = st.pend;
  switch (st.phase) {
    case 'auction': return { type: 'bid', amt: timeout ? 0 : botBid(st, seat) };
    case 'roll': {
      if (timeout) return { type: 'roll' };
      const i = botBuild(st, seat);
      if (i >= 0) return { type: 'build', cell: i };
      return botSkill(st, seat) || { type: 'roll' };
    }
    case 'jail': {
      if (timeout) return { type: 'roll' };
      const free = B(st).filter((c, i) => isProp(c) && st.own[i] == null).length;
      if (free > 8 && pl.jailCards) return { type: 'jailcard' };
      if (free > 8 && pl.cash > 300) return { type: 'bail' };
      return { type: 'roll' };
    }
    case 'buy': {
      if (timeout) return { type: 'pass' };
      const c = B(st)[P.cell], left = pl.cash - c.price;
      const want = left >= reserve(st, seat) || (valueFor(st, seat, P.cell) >= c.price * 1.5 && left >= 40);
      return { type: want ? 'buy' : 'pass' };
    }
    case 'rent': return { type: P.amt > pl.cash || (!timeout && P.amt >= 100) ? 'shield' : 'pay' };
    case 'buyout': {
      if (timeout) return { type: 'skip' };
      const left = pl.cash - P.amt, v = valueFor(st, seat, P.cell), c = B(st)[P.cell];
      const completes = v >= c.price * 2;
      const breaks = c.k === 'p' && hasSet(st, P.to, c.g);
      const ok = (completes && left >= reserve(st, seat) * 0.5) || (breaks && left >= reserve(st, seat) * 1.5 && Math.random() < 0.5);
      return { type: ok ? 'buyout' : 'skip' };
    }
    case 'casino': return { type: 'bet', amt: !timeout && pl.cash > 900 && Math.random() < 0.5 ? (pl.cash > 1600 && Math.random() < 0.4 ? 300 : 100) : 0 };
    case 'stock': return { type: 'invest', amt: timeout || pl.cash < 600 ? 0 : pl.cash > 1000 ? 200 : 100 };
    case 'train': return { type: 'train', to: timeout ? -1 : botTrain(st, seat) };
  }
  return { type: 'roll' };
}

// ================= INTERFACE =================
function create({ seats, opts, now }) {
  const chaos = !!opts.chaos, minutes = +opts.minutes || 30;
  const players = seats.map(s => (s
    ? { on: true, kind: s.kind, name: s.name, cash: START_CASH, pos: 0, jail: false, jailCards: 0, hand: [], fest: null, stock: 0 }
    : { on: false }));
  const deckIds = k => shuffle(CARDS[k].map((c, i) => ((chaos ? !c.classic : !c.chaos) ? i : -1)).filter(i => i >= 0));
  const st = {
    phase: 'roll', chaos, instant: !!opts.instant, minutes, endAt: now + minutes * 60000, now, round: 1,
    cur: 0, first: 0, dbl: 0, again: false, dice: [1, 1], players, own: Array(40).fill(null), lv: Array(40).fill(0),
    pend: null, auc: null, aucN: 0, ev: null, pot: 0, decks: { ch: deckIds('ch'), cc: deckIds('cc') }, bag: [],
    winners: [], results: [], reason: null,
  };
  const sat = alive(st);
  st.first = pick(sat);
  const ev = [{ t: 'start' }];
  // Chia sẵn đất ngẫu nhiên (luật "ván ngắn" của bản gốc) — tránh chia trọn một bộ màu cho ai.
  const deal = +opts.deal || 0;
  if (deal) {
    const lands = shuffle(B(st).map((c, i) => (c.k === 'p' ? i : -1)).filter(i => i >= 0));
    const got = {};
    for (let r = 0; r < deal; r++) for (const p of sat) {
      const k = lands.findIndex(i => { st.own[i] = p; const ok = !hasSet(st, p, B(st)[i].g); st.own[i] = null; return ok; });
      if (k < 0) continue;
      const i = lands.splice(k, 1)[0];
      st.own[i] = p;
      (got[p] = got[p] || []).push(i);
    }
    ev.push({ t: 'deal', got });
  }
  beginTurn(st, st.first, ev);
  return { state: st, events: ev };
}

function turn(st) {
  if (st.phase === 'over') return null;
  if (st.phase === 'auction') return { seats: aucSeats(st), key: st.auc.key };
  return { seat: st.cur };
}

function view(st, seat) {
  return {
    ...st,
    decks: undefined, bag: undefined,
    ask: st.phase === 'over' || st.phase === 'auction' ? null : st.cur,
    players: st.players.map((pl, q) => (pl.on && q !== seat ? { ...pl, hand: pl.hand.map(() => '?') } : pl)),
    auc: st.auc && { ...st.auc, bids: Object.fromEntries(Object.entries(st.auc.bids).map(([q, v]) => [q, +q === seat ? v : -1])) },
  };
}

function viewEvents(events, seat) {
  return events.map(e => (e.t === 'skill' && e.p !== seat ? { ...e, k: '?' } : e));
}

export default { create, act, isOver: st => st.phase === 'over', turn, bot, animDuration, view, viewEvents };
