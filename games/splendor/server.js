// 💎 Splendor — luật + bot (server giữ chồng thẻ nên không lộ ra client). Xem "Game server interface" trong CLAUDE.md.
// Trạng thái:
//   bank: ngọc trong ngân hàng { w, u, g, r, k, o }. decks[lv]: chồng thẻ úp cấp lv (lá trên cùng ở CUỐI mảng). board[lv]: các ô thẻ lật (null = hết thẻ).
//   players[p]: { on, gems, cards, res (thẻ giữ chỗ, blind = giữ úp từ chồng), nobles, pts, prism (giảm giá bất kỳ), obj (mục tiêu bí mật) }.
//   turn: ghế đang đi; first: ghế đi đầu mỗi vòng bàn (ván kết thúc khi vòng có người đạt điểm mục tiêu quay về ghế này).
//   asks: hàng chờ quyết định phát sinh sau hành động (năng lực thẻ). ask: quyết định đang chờ { seat, k, opts?, n?, lv? }
//     — k: 'discard' (trả bớt ngọc về 10) | 'noble' (chọn quý tộc) | 'steal' | 'snatch' | 'gift'.
//   tf: cờ của lượt hiện tại { noble: đã xét quý tộc, extra: được đi thêm lượt }.
import {
  COLORS, SUPPLY, MAX_GEMS, MAX_RES, buildCards, buildNobles, ABILITY_POOL, PERK_KEYS, EVENTS, EVENT_KEYS, OBJECTIVES,
  objDone, bonusOf, gemCount, priceOf, nobleOk, nobleShort, wildOf, animDuration,
} from './data.js';

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = a => a[Math.floor(Math.random() * a.length)];
const emptyGems = () => ({ w: 0, u: 0, g: 0, r: 0, k: 0, o: 0 });
const seated = st => st.players.map((pl, i) => (pl.on ? i : -1)).filter(i => i >= 0);
const nextSeat = (st, p) => { const n = st.players.length; for (let k = 1; k <= n; k++) { const q = (p + k) % n; if (st.players[q].on) return q; } return p; };
const boardCards = st => [1, 2, 3].flatMap(lv => st.board[lv].filter(Boolean));
const freshTf = () => ({ noble: false, extra: false });
const isInt = v => Number.isInteger(v) && v >= 0;

// Lấy 1 thẻ từ chồng cấp lv (null nếu hết).
const drawCard = (st, lv) => (st.decks[lv].length ? st.decks[lv].pop() : null);

// Tìm thẻ lật trên bàn theo id → { lv, i } hoặc null.
function findOnBoard(st, id) {
  for (const lv of [1, 2, 3]) { const i = st.board[lv].findIndex(c => c && c.id === id); if (i >= 0) return { lv, i }; }
  return null;
}
// Lấy thẻ khỏi bàn và lật thẻ mới vào ô đó; trả về thẻ mới (có thể null).
function takeFromBoard(st, lv, i) {
  const nc = drawCard(st, lv);
  st.board[lv][i] = nc;
  return nc;
}
// Màu ngọc (không tính vàng) người chơi có nhiều nhất; null nếu không có viên nào.
function mostColor(g) {
  let best = null;
  for (const c of COLORS) if (g[c] > 0 && (best === null || g[c] > g[best])) best = c;
  return best;
}

// ================= VÒNG BÀN & SỰ KIỆN =================
function startRound(st, ev) {
  st.round++;
  if (st.chaos) {
    if (st.round === 1) st.event = 'calm';
    else {
      if (!st.bag.length) st.bag = shuffle(EVENT_KEYS.filter(k => k !== st.event));
      st.event = st.bag.pop();
    }
    st.evColor = EVENTS[st.event].color ? rnd(COLORS) : null;
  }
  ev.push({ t: 'round', n: st.round, event: st.event, color: st.evColor });
  if (st.event === 'tax') {
    const loss = [];
    for (const p of seated(st)) {
      const pl = st.players[p];
      if (gemCount(pl.gems) < 7) continue;
      const g = {};
      for (let k = 0; k < 2; k++) { const c = mostColor(pl.gems) || (pl.gems.o ? 'o' : null); if (!c) break; pl.gems[c]--; st.bank[c]++; g[c] = (g[c] || 0) + 1; }
      loss.push({ p, gems: g });
    }
    ev.push({ t: 'evtax', loss });
  }
  if (st.event === 'market') {
    st.board[1] = st.board[1].map(c => { if (c) st.decks[1].unshift(c); return null; });
    st.board[1] = st.board[1].map(() => drawCard(st, 1));
    ev.push({ t: 'refresh', lv: 1, cards: st.board[1] });
  }
}

function endTurn(st, ev) {
  const p = st.turn, pl = st.players[p];
  if (!st.lastRound && pl.pts >= st.target) { st.lastRound = true; ev.push({ t: 'last', p }); }
  if (st.tf.extra) { st.tf = freshTf(); ev.push({ t: 'extra', p }); return; }
  const q = nextSeat(st, p);
  st.tf = freshTf();
  if (q === st.first) {
    // Lưới an toàn: cả bàn không ai đi được gì suốt một vòng, hoặc ván quá dài → kết thúc.
    if (st.lastRound || st.passes >= seated(st).length || st.round >= 80) { finish(st, ev); return; }
    st.turn = q;
    startRound(st, ev);
  } else st.turn = q;
}

function finish(st, ev) {
  st.phase = 'over';
  st.ask = null; st.asks = [];
  if (st.chaos) {
    const res = [];
    for (const p of seated(st)) {
      const pl = st.players[p];
      if (!pl.obj) continue;
      const done = objDone(pl.obj, pl);
      if (done) pl.pts += pl.obj.pts;
      pl.objDone = done;
      res.push({ p, obj: pl.obj, done });
    }
    ev.push({ t: 'reveal', res });
  }
  const rows = seated(st).map(p => ({ p, pts: st.players[p].pts, cards: st.players[p].cards.length }))
    .sort((a, b) => b.pts - a.pts || a.cards - b.cards);
  st.results = rows;
  st.winners = rows.filter(r => r.pts === rows[0].pts && r.cards === rows[0].cards).map(r => r.p);
  ev.push({ t: 'over', winners: st.winners, results: rows });
}

// ================= SAU HÀNH ĐỘNG =================
// Chạy tiếp lượt: quyết định do năng lực → trả bớt ngọc → quý tộc → hết lượt. Dừng khi cần ai đó chọn.
function settle(st, ev) {
  for (let guard = 0; guard < 50; guard++) {
    if (st.phase === 'over') return;
    st.ask = null;
    const p = st.turn, pl = st.players[p];
    if (st.asks.length) {
      const a = st.asks[0], opts = askOpts(st, a);
      if (!opts.length) { st.asks.shift(); ev.push({ t: 'fizzle', p: a.seat, k: a.k }); continue; }
      st.ask = { ...a, opts };
      return;
    }
    const over = gemCount(pl.gems) - MAX_GEMS;
    if (over > 0) { st.ask = { seat: p, k: 'discard', n: over }; return; }
    if (!st.tf.noble) {
      st.tf.noble = true;
      const ok = st.nobles.filter(n => nobleOk(st, pl, n));
      if (ok.length === 1) { giveNoble(st, p, ok[0], ev); continue; }
      if (ok.length > 1) { st.ask = { seat: p, k: 'noble', opts: ok.map(n => n.id) }; return; }
    }
    endTurn(st, ev);
    return;
  }
  throw new Error('splendor: settle() lặp quá nhiều');
}

function askOpts(st, a) {
  const me = st.players[a.seat], others = seated(st).filter(q => q !== a.seat);
  switch (a.k) {
    case 'steal': return others.filter(q => COLORS.some(c => st.players[q].gems[c] > 0));
    case 'snatch': return me.res.length >= MAX_RES ? [] : others.filter(q => st.players[q].res.length);
    case 'gift': return [1, 2].filter(lv => lv < a.lv).flatMap(lv => st.board[lv].filter(Boolean).map(c => c.id));
  }
  return [];
}

function giveNoble(st, p, n, ev) {
  const pl = st.players[p];
  st.nobles.splice(st.nobles.indexOf(n), 1);
  pl.nobles.push(n);
  pl.pts += n.pts;
  const gain = {};
  if (n.perk === 'gold') { const k = Math.min(2, st.bank.o); if (k) { st.bank.o -= k; pl.gems.o += k; gain.o = k; } }
  else if (n.perk === 'prism') pl.prism++;
  else if (n.perk === 'again') st.tf.extra = true;
  else if (n.perk === 'gems') {
    for (const c of COLORS.filter(c => st.bank[c] > 0).sort((a, b) => st.bank[b] - st.bank[a]).slice(0, 3)) { st.bank[c]--; pl.gems[c]++; gain[c] = 1; }
  }
  ev.push({ t: 'noble', p, n, gain });
}

// Mua thẻ: trả giá, nhận thẻ, kích hoạt năng lực (Bất Ngờ).
function buyCard(st, p, card, from, where, ev) {
  const pl = st.players[p], { pay } = priceOf(st, pl, card);
  for (const [c, v] of Object.entries(pay)) { pl.gems[c] -= v; st.bank[c] += v; }
  let nc = null;
  if (from === 'board') nc = takeFromBoard(st, where.lv, where.i);
  else pl.res.splice(pl.res.indexOf(card), 1);
  delete card.blind;
  pl.cards.push(card);
  const rush = st.event === 'rush' ? 1 : 0;
  pl.pts += card.pts + rush;
  ev.push({ t: 'buy', p, card, pay, from, lv: where && where.lv, i: where && where.i, nc, rush });
  if (!st.chaos || !card.ab) return;
  switch (card.ab) {
    case 'mine': {
      const k = Math.min(card.lv, st.bank[card.c]);
      if (k) { st.bank[card.c] -= k; pl.gems[card.c] += k; }
      ev.push({ t: 'mine', p, c: card.c, n: k });
      break;
    }
    case 'prism': pl.prism++; break;
    case 'again': st.tf.extra = true; break;
    case 'gift': case 'steal': case 'snatch': st.asks.push({ seat: p, k: card.ab, lv: card.lv }); break;
    case 'tax': {
      const from = [];
      for (const q of seated(st)) {
        if (q === p || gemCount(st.players[q].gems) < 5) continue;
        const c = mostColor(st.players[q].gems);
        if (!c) continue;
        st.players[q].gems[c]--; pl.gems[c]++;
        from.push({ q, c });
      }
      ev.push({ t: 'tax', p, from });
      break;
    }
  }
}

// ================= HÀNH ĐỘNG HỢP LỆ =================
const maxDiff = st => (st.event === 'fair' ? 4 : 3);
const pairMin = st => (st.event === 'plenty' ? 2 : 4);
function checkTake(st, gems) {
  if (!gems || typeof gems !== 'object') return 'Chọn ngọc muốn lấy';
  const ks = Object.keys(gems).filter(c => gems[c]);
  if (!ks.length) return 'Chọn ngọc muốn lấy';
  if (ks.some(c => !COLORS.includes(c) || !isInt(gems[c]))) return 'Không lấy được vàng — vàng chỉ có khi giữ chỗ thẻ';
  if (ks.length === 1 && gems[ks[0]] === 2) {
    if (st.event === 'drought') return 'Hạn Hán: không được lấy 2 ngọc cùng màu';
    if (st.bank[ks[0]] < pairMin(st)) return `Chỉ lấy 2 viên cùng màu khi chồng còn từ ${pairMin(st)} viên`;
    return null;
  }
  if (ks.some(c => gems[c] !== 1)) return 'Lấy các ngọc khác màu (mỗi màu 1 viên) hoặc 2 viên cùng một màu';
  if (ks.length > maxDiff(st)) return `Chỉ được lấy tối đa ${maxDiff(st)} ngọc khác màu`;
  if (ks.some(c => st.bank[c] < 1)) return 'Ngân hàng đã hết ngọc màu đó';
  return null;
}
const canTakeAny = st => COLORS.some(c => st.bank[c] > 0);
const canReserveAny = (st, pl) => pl.res.length < MAX_RES && ([1, 2, 3].some(lv => st.decks[lv].length) || boardCards(st).length > 0);
const canBuyAny = (st, pl) => [...boardCards(st), ...pl.res].some(c => priceOf(st, pl, c).ok);

// ================= BOT =================
// Bot chỉ dùng thông tin công khai + của chính mình (không đọc chồng thẻ, thẻ giữ úp hay mục tiêu bí mật của người khác).
const AB_VALUE = { mine: 1.2, double: 1.3, prism: 2.6, again: 2.2, gift: 2.2, steal: 1.1, snatch: 1.2, tax: 1.0 };
const lateness = st => Math.min(1, Math.max(...seated(st).map(q => st.players[q].pts)) / st.target);

function colorWorth(st, pl, color) {
  const b = bonusOf(pl);
  let w = 0.7 + (1 - lateness(st)); // đầu ván giảm giá đáng tiền hơn (còn nhiều lượt để dùng)
  // Quý tộc: mỗi thẻ góp một phần điểm của quý tộc còn thiếu thẻ màu này (càng gần càng đáng).
  for (const n of st.nobles) if ((n.req[color] || 0) > b[color]) w += (n.pts / Math.max(1, nobleShort(pl, n))) * 0.9;
  // Thẻ trên bàn cần màu này (nhất là thẻ có điểm) → giảm giá màu này đáng tiền hơn.
  for (const c of boardCards(st)) if ((c.cost[color] || 0) > b[color]) w += c.pts ? 0.12 : 0.04;
  if (pl.obj && st.chaos) {
    if (pl.obj.k === 'color' && pl.obj.c === color) w += 1;
    if (pl.obj.k === 'rainbow' && b[color] < 2) w += 0.8;
  }
  if (b[color] >= 6) w *= 0.5;
  return w;
}

function cardValue(st, p, c) {
  const pl = st.players[p], L = lateness(st);
  let v = c.pts * (1.1 + 2.6 * L);
  v += colorWorth(st, pl, c.c) * (c.ab === 'double' ? 2 : 1) * (1 - 0.6 * L);
  if (st.chaos && c.ab) v += (AB_VALUE[c.ab] || 0) * (1 - 0.5 * L);
  if (st.event === 'rush') v += 1.5;
  if (pl.pts + c.pts >= st.target) v += 8;
  if (st.chaos && pl.obj) {
    if (pl.obj.k === 'elite' && c.lv === 3) v += 1;
    if (pl.obj.k === 'humble' && c.lv === 1) v += 0.6;
    if (pl.obj.k === 'collector' && c.ab) v += 0.8;
  }
  return v;
}

// Còn thiếu bao nhiêu ngọc để mua: theo màu (sau giảm giá + ngọc đang có) và tổng (đã trừ vàng + giảm giá bất kỳ).
function shortOf(st, pl, card) {
  const b = bonusOf(pl), short = {};
  let tot = 0, stuck = false;
  for (const c of COLORS) {
    let v = card.cost[c] || 0;
    if (v && st.event === 'storm' && st.evColor === c) v++;
    short[c] = Math.max(0, v - b[c] - pl.gems[c]);
    tot += short[c];
    if (short[c] > st.bank[c] + 1) stuck = true; // ngân hàng không đủ — khó mà gom
  }
  return { short, tot: Math.max(0, tot - pl.gems.o - wildOf(st, pl)), stuck };
}

function rankTargets(st, p) {
  const pl = st.players[p];
  return [...boardCards(st), ...pl.res].map(c => {
    const s = shortOf(st, pl, c), ok = priceOf(st, pl, c).ok;
    const turns = ok ? 0 : Math.ceil(s.tot / 3) + (s.stuck ? 3 : 0);
    const goldUse = ok ? priceOf(st, pl, c).pay.o : 0;
    return { c, ok, s, turns, eff: (cardValue(st, p, c) - goldUse * 0.25) / (1 + turns) };
  }).sort((a, b) => b.eff - a.eff);
}

function botTake(st, p, ranked) {
  const pl = st.players[p], held = gemCount(pl.gems), room = MAX_GEMS - held, lim = maxDiff(st);
  const t = ranked.find(r => !r.ok);
  const order = [];
  const add = c => { if (!order.includes(c) && st.bank[c] > 0) order.push(c); };
  if (t) {
    // 2 viên cùng màu khi mục tiêu cần nhiều một màu.
    const need = COLORS.filter(c => t.s.short[c] > 0);
    const big = need.find(c => t.s.short[c] >= 2 && st.bank[c] >= pairMin(st));
    if (big && st.event !== 'drought' && room >= 2 && (need.filter(c => st.bank[c] > 0).length <= 1 || t.s.short[big] >= 3))
      return { type: 'take', gems: { [big]: 2 } };
    need.sort((a, b) => t.s.short[b] - t.s.short[a]).forEach(add);
  }
  for (const r of ranked.slice(0, 5)) if (!r.ok) COLORS.filter(c => r.s.short[c] > 0).sort((a, b) => r.s.short[b] - r.s.short[a]).forEach(add);
  // Ngọc "lấp chỗ" chỉ khi đang ít ngọc — ôm nhiều quá lại phải trả.
  if (held + Math.min(lim, order.length) <= 7) COLORS.slice().sort((a, b) => colorWorth(st, pl, b) - colorWorth(st, pl, a)).forEach(add);
  const pick = order.slice(0, Math.min(lim, Math.max(1, room)));
  if (!pick.length) return null;
  return { type: 'take', gems: Object.fromEntries(pick.map(c => [c, 1])) };
}

function botAsk(st, p, a, timeout) {
  const pl = st.players[p];
  const ranked = rankTargets(st, p);
  const needOf = c => Math.max(0, ...ranked.slice(0, 3).map(r => r.s.short[c] + Math.min(pl.gems[c], (r.c.cost[c] || 0))));
  switch (a.k) {
    case 'discard': {
      const g = { ...pl.gems }, out = {};
      for (let k = 0; k < a.n; k++) {
        let best = null, bs = Infinity;
        for (const c of COLORS) if (g[c] > 0) { const s = (needOf(c) - g[c]) * 10 + colorWorth(st, pl, c); if (s < bs) { bs = s; best = c; } }
        if (!best) best = 'o';
        g[best]--; out[best] = (out[best] || 0) + 1;
      }
      return { type: 'discard', gems: out };
    }
    case 'noble': {
      const pv = { pts: 5, again: 4, prism: 3, gems: 2, gold: 2 };
      const ns = a.opts.map(id => st.nobles.find(n => n.id === id));
      ns.sort((x, y) => (pv[y.perk] || 0) - (pv[x.perk] || 0));
      return { type: 'noble', id: ns[0].id };
    }
    case 'steal': {
      let best = null, bs = -Infinity;
      const lead = Math.max(...a.opts.map(q => st.players[q].pts));
      for (const q of a.opts) for (const c of COLORS) {
        const h = st.players[q].gems[c];
        if (!h) continue;
        const s = (timeout ? 0 : needOf(c) * 2) + Math.min(h, a.lv) + (st.players[q].pts === lead ? 1 : 0) + Math.random() * 0.1;
        if (s > bs) { bs = s; best = { to: q, color: c }; }
      }
      return { type: 'steal', ...best };
    }
    case 'snatch': {
      const to = a.opts.slice().sort((x, y) => st.players[y].pts - st.players[x].pts)[0];
      const vis = st.players[to].res.filter(c => !c.blind);
      const card = vis.length ? vis.sort((x, y) => cardValue(st, p, y) - cardValue(st, p, x))[0] : rnd(st.players[to].res);
      return { type: 'snatch', to, id: card.id };
    }
    case 'gift': {
      const cs = a.opts.map(id => boardCards(st).find(c => c.id === id));
      cs.sort((x, y) => cardValue(st, p, y) - cardValue(st, p, x));
      return { type: 'gift', id: cs[0].id };
    }
  }
  return null;
}

function bot(st, seat, { timeout } = {}) {
  if (st.ask) return botAsk(st, seat, st.ask, timeout);
  const pl = st.players[seat];
  const ranked = rankTargets(st, seat);
  const take = () => (canTakeAny(st) ? botTake(st, seat, ranked) : null);
  const buyBest = () => { const r = ranked.find(x => x.ok); return r ? { type: 'buy', id: r.c.id } : null; };
  const reserveOf = c => ({ type: 'reserve', id: c.id });
  const fallback = () => buyBest() || (canReserveAny(st, pl)
    ? (boardCards(st).length ? reserveOf(boardCards(st).sort((x, y) => cardValue(st, seat, y) - cardValue(st, seat, x))[0]) : { type: 'reserve', lv: [3, 2, 1].find(lv => st.decks[lv].length) })
    : { type: 'pass' });
  // Hết giờ: đi nước an toàn — lấy ngọc hướng tới thẻ tốt nhất, không giữ chỗ.
  if (timeout) return take() || buyBest() || fallback();

  // Thắng được ngay (đủ điểm mục tiêu) → mua.
  const win = ranked.filter(r => r.ok && pl.pts + r.c.pts >= st.target).sort((a, b) => b.c.pts - a.c.pts)[0];
  if (win) return { type: 'buy', id: win.c.id };
  // Chặn: đối thủ mua được thẻ trên bàn để chạm điểm mục tiêu → giữ chỗ thẻ đó.
  if (pl.res.length < MAX_RES && lateness(st) >= 0.6) {
    for (const q of seated(st)) {
      if (q === seat) continue;
      const o = st.players[q];
      const threat = boardCards(st).filter(c => priceOf(st, o, c).ok && o.pts + c.pts >= st.target && o.pts + c.pts >= pl.pts)
        .sort((a, b) => b.pts - a.pts)[0];
      if (threat) return reserveOf(threat);
    }
  }
  const top = ranked[0], aff = ranked.find(r => r.ok);
  // Mua được thẻ khá tốt (hoặc đang ôm nhiều ngọc) thì mua luôn — thẻ là giảm giá vĩnh viễn.
  if (aff && (aff === top || aff.eff >= top.eff * 0.6 || gemCount(pl.gems) >= 8)) return { type: 'buy', id: aff.c.id };
  // Thẻ đắt rất đáng giá trên bàn: thỉnh thoảng giữ chỗ để lấy vàng + giữ thẻ.
  if (top && !pl.res.includes(top.c) && pl.res.length < 2 && top.c.lv >= 2 && top.s.tot >= 4 && st.bank.o > 0 && Math.random() < 0.22)
    return reserveOf(top.c);
  const t = take();
  if (t) {
    const room = MAX_GEMS - gemCount(pl.gems);
    // Đang đầy ngọc mà không mua được gì: giữ chỗ để có vàng thay vì phải trả ngọc.
    if (room <= 0 && top && !pl.res.includes(top.c) && pl.res.length < MAX_RES && st.bank.o > 0) return reserveOf(top.c);
    return t;
  }
  if (top && !pl.res.includes(top.c) && pl.res.length < MAX_RES) return reserveOf(top.c);
  return fallback();
}

// ================= INTERFACE =================
function create({ seats, opts }) {
  const chaos = !!opts.chaos;
  const sat = seats.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
  const S = SUPPLY(sat.length);
  const raw = buildCards(sat.length);
  const decks = [null];
  let id = 1;
  for (const lv of [1, 2, 3]) {
    const d = shuffle(raw[lv]);
    if (chaos) ABILITY_POOL[lv].forEach((ab, i) => { d[i].ab = ab; });
    shuffle(d).forEach(c => { c.id = id++; });
    decks.push(d);
  }
  const perks = shuffle(PERK_KEYS.concat(PERK_KEYS));
  const nobles = shuffle(buildNobles()).slice(0, S.nobles).map((n, i) => {
    const x = { ...n, id: 'n' + i };
    if (chaos) { x.perk = perks[i]; if (x.perk === 'pts') x.pts = 4; }
    return x;
  });
  const objs = shuffle(OBJECTIVES.slice());
  const players = seats.map(s => (s
    ? { on: true, kind: s.kind, name: s.name, gems: emptyGems(), cards: [], res: [], nobles: [], pts: 0, prism: 0, obj: chaos ? objs.pop() : null }
    : { on: false }));
  const bank = { o: S.gold };
  for (const c of COLORS) bank[c] = S.gem;
  const st = {
    phase: 'play', chaos, target: +opts.target || 15, slots: S.slots, bank, decks, board: [null], nobles, players,
    first: rnd(sat), turn: 0, round: 0, lastRound: false, passes: 0, event: null, evColor: null, bag: [],
    ask: null, asks: [], tf: freshTf(), winners: [], results: [],
  };
  for (const lv of [1, 2, 3]) st.board.push(Array.from({ length: S.slots }, () => drawCard(st, lv)));
  st.turn = st.first;
  // Bất Ngờ làm ván nhanh hơn nên đi trước lợi hơn hẳn (đo bằng mô phỏng: 2 người 59/41) → người đi thứ k (tính từ 0)
  // nhận sẵn k ngọc khác màu ngẫu nhiên, tối đa 3 — đưa tỉ lệ thắng theo thứ tự về gần đều.
  const comp = [];
  if (chaos) {
    for (let k = 1, q = nextSeat(st, st.first); q !== st.first; k++, q = nextSeat(st, q)) {
      const g = {};
      for (const c of shuffle(COLORS.slice()).slice(0, Math.min(3, k))) { st.bank[c]--; st.players[q].gems[c]++; g[c] = 1; }
      comp.push({ p: q, gems: g });
    }
  }
  const ev = [{ t: 'start', first: st.first, comp }];
  startRound(st, ev);
  return { state: st, events: ev };
}

function act(st, seat, a, now) {
  if (st.phase === 'over') return { ok: false, err: 'Ván đã kết thúc' };
  if (!a || typeof a !== 'object') return { ok: false, err: 'Hành động không hợp lệ' };
  const ev = [];
  const ask = st.ask;
  if (ask) {
    if (seat !== ask.seat) return { ok: false, err: 'Chờ người khác quyết định' };
    const pl = st.players[seat];
    if (ask.k === 'discard') {
      if (a.type !== 'discard' || !a.gems || typeof a.gems !== 'object') return { ok: false, err: `Hãy chọn ${ask.n} ngọc để trả lại` };
      const g = a.gems, ks = Object.keys(g).filter(c => g[c]);
      if (ks.some(c => !(c in pl.gems) || !isInt(g[c]) || g[c] > pl.gems[c])) return { ok: false, err: 'Bạn không có đủ ngọc đó' };
      if (ks.reduce((s, c) => s + g[c], 0) !== ask.n) return { ok: false, err: `Phải trả đúng ${ask.n} ngọc` };
      for (const c of ks) { pl.gems[c] -= g[c]; st.bank[c] += g[c]; }
      ev.push({ t: 'discard', p: seat, gems: Object.fromEntries(ks.map(c => [c, g[c]])) });
    } else if (ask.k === 'noble') {
      const n = st.nobles.find(x => x.id === a.id);
      if (a.type !== 'noble' || !n || !ask.opts.includes(a.id)) return { ok: false, err: 'Hãy chọn một quý tộc' };
      giveNoble(st, seat, n, ev);
    } else {
      if (a.type !== ask.k) return { ok: false, err: 'Hãy hoàn tất năng lực thẻ trước' };
      if (ask.k === 'steal') {
        if (!ask.opts.includes(a.to) || !COLORS.includes(a.color) || !(st.players[a.to].gems[a.color] > 0)) return { ok: false, err: 'Hãy chọn người và màu ngọc họ đang có' };
        const v = st.players[a.to], k = Math.min(ask.lv, v.gems[a.color]);
        v.gems[a.color] -= k; pl.gems[a.color] += k;
        ev.push({ t: 'steal', p: seat, from: a.to, c: a.color, n: k });
      } else if (ask.k === 'snatch') {
        if (!ask.opts.includes(a.to)) return { ok: false, err: 'Hãy chọn người có thẻ giữ chỗ' };
        const v = st.players[a.to];
        const card = v.res.find(c => c.id === a.id) || rnd(v.res);
        v.res.splice(v.res.indexOf(card), 1);
        pl.res.push(card);
        ev.push({ t: 'snatch', p: seat, from: a.to, card });
      } else if (ask.k === 'gift') {
        const w = findOnBoard(st, a.id);
        if (!w || !ask.opts.includes(a.id)) return { ok: false, err: 'Hãy chọn 1 thẻ cấp thấp hơn trên bàn' };
        const card = st.board[w.lv][w.i];
        const nc = takeFromBoard(st, w.lv, w.i);
        pl.cards.push(card);
        pl.pts += card.pts;
        ev.push({ t: 'gift', p: seat, card, lv: w.lv, i: w.i, nc });
      }
      st.asks.shift();
    }
    settle(st, ev);
    return { ok: true, events: ev };
  }

  if (seat !== st.turn) return { ok: false, err: 'Chưa đến lượt bạn' };
  const pl = st.players[seat];
  switch (a.type) {
    case 'take': {
      const err = checkTake(st, a.gems);
      if (err) return { ok: false, err };
      const g = {};
      for (const c of COLORS) if (a.gems[c]) { st.bank[c] -= a.gems[c]; pl.gems[c] += a.gems[c]; g[c] = a.gems[c]; }
      ev.push({ t: 'take', p: seat, gems: g });
      break;
    }
    case 'buy': {
      const w = findOnBoard(st, a.id);
      const card = w ? st.board[w.lv][w.i] : pl.res.find(c => c.id === a.id);
      if (!card) return { ok: false, err: 'Không tìm thấy thẻ đó' };
      const pr = priceOf(st, pl, card);
      if (!pr.ok) return { ok: false, err: `Chưa đủ ngọc — còn thiếu ${pr.short} viên` };
      buyCard(st, seat, card, w ? 'board' : 'res', w, ev);
      break;
    }
    case 'reserve': {
      if (pl.res.length >= MAX_RES) return { ok: false, err: `Chỉ được giữ chỗ tối đa ${MAX_RES} thẻ` };
      let card, w = null;
      if (a.id != null) {
        w = findOnBoard(st, a.id);
        if (!w) return { ok: false, err: 'Không tìm thấy thẻ đó' };
        card = st.board[w.lv][w.i];
      } else {
        if (![1, 2, 3].includes(a.lv) || !st.decks[a.lv].length) return { ok: false, err: 'Chồng thẻ đó đã hết' };
        card = drawCard(st, a.lv);
        card.blind = true;
      }
      const nc = w ? takeFromBoard(st, w.lv, w.i) : null;
      pl.res.push(card);
      const gold = Math.min(st.bank.o, st.event === 'rain' ? 2 : 1);
      st.bank.o -= gold; pl.gems.o += gold;
      ev.push({ t: 'reserve', p: seat, card, blind: !w, lv: w ? w.lv : a.lv, i: w ? w.i : -1, nc, gold });
      break;
    }
    case 'pass': {
      if (canTakeAny(st) || canBuyAny(st, pl) || canReserveAny(st, pl)) return { ok: false, err: 'Bạn vẫn còn nước đi' };
      ev.push({ t: 'pass', p: seat });
      st.passes++;
      settle(st, ev);
      return { ok: true, events: ev };
    }
    default: return { ok: false, err: 'Hành động không hợp lệ' };
  }
  st.passes = 0;
  settle(st, ev);
  return { ok: true, events: ev };
}

function turn(st) {
  if (st.phase === 'over') return null;
  if (st.ask) return { seat: st.ask.seat };
  return { seat: st.turn };
}

const HIDE = c => ({ id: c.id, lv: c.lv, blind: true, hid: true });

function view(st, seat) {
  const over = st.phase === 'over';
  return {
    ...st,
    decks: undefined, bag: undefined, asks: undefined,
    deckN: [0, st.decks[1].length, st.decks[2].length, st.decks[3].length],
    players: st.players.map((pl, q) => {
      if (!pl.on || q === seat || over) return pl;
      return { ...pl, res: pl.res.map(c => (c.blind ? HIDE(c) : c)), obj: pl.obj ? { hid: true } : null };
    }),
  };
}

function viewEvents(events, seat, st) {
  if (st.phase === 'over') return events;
  return events.map(e => {
    if (e.t === 'reserve' && e.blind && e.p !== seat) return { ...e, card: HIDE(e.card) };
    if (e.t === 'snatch' && e.card.blind && e.p !== seat && e.from !== seat) return { ...e, card: HIDE(e.card) };
    return e;
  });
}

// Thứ hạng: điểm cao hơn; bằng điểm thì ai ít thẻ hơn xếp trên (luật gốc); bằng cả hai là đồng hạng.
const result = st => st.results.map(r => ({ p: r.p, s: [r.pts, -r.cards] }));

export default { create, act, isOver: st => st.phase === 'over', result, turn, bot, animDuration, view, viewEvents };
