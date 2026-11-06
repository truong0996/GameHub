// 🎭 Coup — luật + bot (chạy trên server, KHÔNG gửi cho client vì biết mọi lá úp và chồng bài).
// Hàm thuần: không I/O, không Date.now(). Xem "Game server interface" trong CLAUDE.md.
//
// Lượt: người đến lượt (cur) chọn 1 hành động (có thể tự nhận 1 vai — nói thật hay bịp tuỳ ý) → mở CỬA SỔ PHẢN ỨNG:
//   mọi người cùng lúc Cho qua / Thách thức / Chặn (turn() trả { seats, key, ms }) → bị chặn thì mở cửa sổ thách thức
//   người chặn → thi hành → hết lượt. Thua thách thức hoặc bị đánh trúng = mất 1 ảnh hưởng (tự chọn lật ngửa 1 lá).
//   Hết lá úp = bị loại. Người cuối cùng còn ảnh hưởng thắng.
// Các bước sau khi tuyên bố nằm trong hàng chờ st.q (cửa sổ, thi hành, mất lá, đổi bài, bói bài...). run() chạy dần
// các bước tự động, dừng ở bước cần người quyết định (st.phase), hành động của người đó xử lý xong thì run() tiếp.
import {
  ROLES, SLOTS, SLOT_KEYS, CLASSIC, copiesOf, ACTIONS, blockersOf, ecoRole, EVENTS, EVENT_KEYS, EVENT_P, ITEMS, ITEM_KEYS,
  GHOST, costOf, MUST_COUP, animDuration,
} from './data.js';

const rnd = n => (Math.random() * n) | 0;
const pick = a => a[rnd(a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fail = err => ({ ok: false, err });
const hidden = pl => pl.cards.filter(c => !c.dead);
const hasRole = (pl, r) => pl.cards.some(c => !c.dead && c.r === r);
const alive = (st, p) => !!(st.players[p] && st.players[p].active && st.players[p].alive);
const aliveSeats = st => st.players.map((pl, i) => (pl.active && pl.alive ? i : -1)).filter(i => i >= 0);
function nextAlive(st, from) {
  const n = st.players.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (alive(st, i)) return i; }
  return from;
}
// Phe phái: không được nhắm vào người cùng phe — trừ khi mọi người còn sống đều cùng một phe.
const factionLock = st => st.factions && new Set(aliveSeats(st).map(p => st.players[p].faction)).size > 1;
const canTarget = (st, a, t) => alive(st, t) && a !== t && !(factionLock(st) && st.players[a].faction === st.players[t].faction);
const TARGET_ERR = st => 'Chọn 1 người còn sống' + (factionLock(st) ? ' và khác phe' : '');

// ---------- tạo ván ----------
function create({ seats, opts }) {
  const chaos = !!opts.chaos, factions = !!opts.factions;
  const n = seats.filter(Boolean).length;
  let roles = CLASSIC.slice();
  if (chaos) {   // mỗi ô bốc vai gốc hay vai mới, ít nhất 2 vai mới
    let alt;
    do alt = SLOT_KEYS.map(() => Math.random() < 0.5); while (alt.filter(Boolean).length < 2);
    roles = SLOT_KEYS.map((s, i) => SLOTS[s][alt[i] ? 1 : 0]);
  }
  const st = {
    chaos, factions, reactMs: (+opts.react || 10) * 1000, roles, copies: copiesOf(n), uid: 0, deck: [], players: [],
    cur: 0, round: 1, turnNo: 0, phase: 'act', q: [], pend: null, win: null, wid: 0, ex: null, inq: null,
    event: null, market: [], bought: false, alms: 0, outSeq: 0, winner: null,
  };
  for (const r of roles) for (let k = 0; k < st.copies; k++) st.deck.push({ id: ++st.uid, r });
  shuffle(st.deck);
  let fi = rnd(2);
  st.players = seats.map(s => {
    if (!s) return { active: false };
    return {
      active: true, kind: s.kind, name: s.name, coins: 2, cards: [st.deck.pop(), st.deck.pop()].map(c => ({ ...c, dead: false })),
      alive: true, ghost: false, faction: factions ? fi++ % 2 : null, items: [], claims: [], caught: [], know: {}, gUsed: false, outAt: 0,
      bluff: 0.3 + Math.random() * 0.5, doubt: 0.8 + Math.random() * 0.5,   // tính cách bot
    };
  });
  st.cur = pick(aliveSeats(st));
  if (n === 2) st.players[st.cur].coins = 1;   // luật 2 người: người đi đầu chỉ có 1 xu
  if (chaos) st.market = shuffle(ITEM_KEYS.slice()).slice(0, 2);
  return { state: st, events: [{ t: 'start', roles, market: st.market }, { t: 'turn', p: st.cur, round: 1 }] };
}

// ---------- tiện ích ----------
function claim(pl, r) { if (!pl.claims.includes(r)) pl.claims.push(r); }
function unclaim(pl, r) { pl.claims = pl.claims.filter(x => x !== r); if (!pl.caught.includes(r)) pl.caught.push(r); }
// Lá về chồng bài: không ai còn biết lá đó nằm đâu.
function forget(st, id) { for (const pl of st.players) if (pl.active) delete pl.know[id]; }
function toDeck(st, card) { forget(st, card.id); st.deck.push({ id: card.id, r: card.r }); shuffle(st.deck); }
function takeItem(pl, k) { const i = pl.items.indexOf(k); if (i < 0) return false; pl.items.splice(i, 1); return true; }
function coins(st, ch, why, ev) {   // ch = [{ p, d }]
  ch = ch.filter(c => c.d);
  for (const c of ch) st.players[c.p].coins += c.d;
  if (ch.length) ev.push({ t: 'coins', ch, why });
}
function peek(st, p, s, src, ev) {
  const hs = hidden(st.players[s]);
  if (!hs.length) return;
  const c = pick(hs);
  st.players[p].know[c.id] = c.r;
  ev.push({ t: 'peek', p, s, id: c.id, r: c.r, src });
}
// Thay 1 lá trên tay ghế p (vd vừa chứng minh xong) bằng lá mới từ chồng bài.
function redraw(st, p, card, ev) {
  const pl = st.players[p], i = pl.cards.indexOf(card);
  toDeck(st, card);
  const nc = st.deck.pop();
  pl.cards[i] = { ...nc, dead: false };
  ev.push({ t: 'redraw', p, id: nc.id, r: nc.r, old: card.id });
}

// ---------- tuyên bố hành động ----------
function declare(st, p, a, ev) {
  const A = ACTIONS[a.type], pl = st.players[p];
  if (!A || (A.faction && !st.factions)) return 'Hành động không hợp lệ';
  if (A.role && !st.roles.includes(A.role)) return 'Ván này không có vai ' + (ROLES[A.role] ? ROLES[A.role].name : '');
  if (a.type === 'coup' && st.event === 'martial') return '🪖 Thiết Quân Luật: đang cấm Đảo Chính';
  if (pl.coins >= MUST_COUP && st.event !== 'martial' && a.type !== 'coup') return `Có từ ${MUST_COUP} xu là bắt buộc Đảo Chính`;
  let t = null, cost = costOf(a.type, st.event);
  if (A.target) {
    t = a.target;
    if (!canTarget(st, p, t)) return TARGET_ERR(st);
  }
  if (a.type === 'convert') {
    t = a.target == null ? p : a.target;
    if (!alive(st, t)) return 'Chọn 1 người còn sống';
    cost = t === p ? 1 : 2;
  }
  if (a.type === 'embezzle' && !st.alms) return 'Quỹ Từ Thiện đang trống';
  if (pl.coins < cost) return `Cần ${cost} xu`;
  if (cost) coins(st, [{ p, d: -cost }], 'pay', ev);
  if (a.type === 'convert') st.alms += cost;
  st.pend = { act: a.type, by: p, t, role: A.role || null, cost: a.type === 'convert' ? 0 : cost, block: null };
  if (A.role) claim(pl, A.role);
  ev.push({ t: 'declare', p, a: a.type, s: t, cost });
  st.q = ['income', 'coup', 'convert'].includes(a.type) ? [{ k: 'resolve' }, { k: 'end' }] : [{ k: 'win', mode: 'act' }, { k: 'resolve' }, { k: 'end' }];
  run(st, ev);
  return null;
}

// ---------- cửa sổ phản ứng ----------
// mode 'act': thách thức người làm / chặn; 'blockOnly': chỉ chặn (sau khi thách thức thất bại); 'block': thách thức người chặn.
function windowFor(st, mode) {
  const P = st.pend, seats = [], opts = {}, silent = st.event === 'silence';
  if (mode === 'block') {
    if (silent) return null;
    for (const s of aliveSeats(st)) if (s !== P.block.by) { seats.push(s); opts[s] = { ch: true, bl: [] }; }
  } else {
    const ch = !silent && mode === 'act' && !!(P.role || P.act === 'embezzle');
    const bl = blockersOf(P.act, st.roles), tAlive = P.t == null || alive(st, P.t);
    for (const s of aliveSeats(st)) {
      if (s === P.by) continue;
      let b = [];
      if (bl.length && tAlive) {
        if (P.act === 'aid') b = factionLock(st) && st.players[s].faction === st.players[P.by].faction ? [] : bl;
        else b = s === P.t ? bl : bl.filter(r => r === 'guard');   // Vệ Sĩ chặn giúp được người khác
      }
      if (ch || b.length) { seats.push(s); opts[s] = { ch, bl: b }; }
    }
  }
  return seats.length ? { mode, key: ++st.wid, seats, opts, passed: [] } : null;
}
const undecided = st => st.win.seats.filter(s => !st.win.passed.includes(s) && alive(st, s));

// Chặn thành công: hành động hỏng, chi phí đã trả thì mất.
function blockStands(st, ev, pre = []) {
  ev.push({ t: 'blocked', p: st.pend.block.by, r: st.pend.block.role, a: st.pend.act, s: st.pend.by });
  st.q = [...pre, { k: 'end' }];
}

function closeWindow(st, ev) {
  const W = st.win;
  st.q.shift();
  st.win = null;
  if (W.mode === 'block') blockStands(st, ev);
  run(st, ev);
}

function doChallenge(st, c, ev) {
  const W = st.win, P = st.pend, blockMode = W.mode === 'block';
  const who = blockMode ? P.block.by : P.by, cl = st.players[who];
  const anti = !blockMode && P.act === 'embezzle';
  const role = anti ? ecoRole(st.roles) : blockMode ? P.block.role : P.role;
  const truth = anti ? !hasRole(cl, role) : hasRole(cl, role);
  ev.push({ t: 'challenge', p: c, s: who, r: role, anti });
  st.q.shift();
  st.win = null;
  const rest = st.q;
  if (truth) {
    ev.push({ t: 'prove', p: who, r: role, anti });
    if (!anti) redraw(st, who, cl.cards.find(x => !x.dead && x.r === role), ev);
    const lose = { k: 'lose', p: c, why: 'challenge' };
    if (blockMode) blockStands(st, ev, [lose]);
    else st.q = [lose, { k: 'win', mode: 'blockOnly' }, ...rest];
  } else {
    ev.push({ t: 'caught', p: who, r: role, anti });
    if (!anti) unclaim(cl, role);
    if (st.event === 'trial') coins(st, [{ p: c, d: 2 }], 'trial', ev);
    const pre = [];
    if (takeItem(cl, 'mask')) ev.push({ t: 'mask', p: who });
    else pre.push({ k: 'lose', p: who, why: 'caught' });
    if (blockMode) { P.block = null; st.q = [...pre, ...rest]; }   // chặn hỏng → hành động vẫn diễn ra
    else {
      if (P.cost) coins(st, [{ p: who, d: P.cost }], 'refund', ev);   // bị bắt bài: hành động hỏng, trả lại xu
      st.q = [...pre, { k: 'end' }];
    }
  }
  run(st, ev);
}

// ---------- thi hành ----------
function resolve(st, ev) {
  const P = st.pend, p = P.by, pl = st.players[p], T = P.t != null ? st.players[P.t] : null;
  if (!pl.alive) return;
  ev.push({ t: 'resolve', p, a: P.act, s: P.t });
  switch (P.act) {
    case 'income': coins(st, [{ p, d: st.event === 'inflation' ? 2 : 1 }], 'income', ev); break;
    case 'aid': coins(st, [{ p, d: st.event === 'harvest' ? 3 : 2 }], 'aid', ev); break;
    case 'tax': coins(st, [{ p, d: 3 }], 'tax', ev); break;
    case 'gamble': {
      const win = Math.random() < 0.5;
      ev.push({ t: 'gamble', p, win });
      coins(st, [{ p, d: win ? 4 : 2 }], 'gamble', ev);
      break;
    }
    case 'coup': st.q.unshift({ k: 'lose', p: P.t, why: 'coup' }); break;
    case 'kill': if (T.alive) st.q.unshift({ k: 'lose', p: P.t, why: 'kill' }); break;
    case 'poison': if (T.alive) st.q.unshift({ k: 'poison', p: P.t, by: p }); break;
    case 'steal': { const n = Math.min(2, T.coins); coins(st, [{ p: P.t, d: -n }, { p, d: n }], 'steal', ev); break; }
    case 'spy': {
      if (!T.alive) break;
      const n = Math.min(1, T.coins);
      coins(st, [{ p: P.t, d: -n }, { p, d: n }], 'spy', ev);
      peek(st, p, P.t, 'spy', ev);
      break;
    }
    case 'exchange': startExchange(st, p, 2, ev); break;
    case 'inquire': if (T.alive) st.q.unshift({ k: 'show', p: P.t, by: p }); break;
    case 'convert': T.faction ^= 1; ev.push({ t: 'convert', p, s: P.t, f: T.faction }); break;
    case 'embezzle': { const n = st.alms; st.alms = 0; ev.push({ t: 'embezzle', p, n }); coins(st, [{ p, d: n }], 'embezzle', ev); break; }
  }
}

function startExchange(st, p, n, ev) {
  const drawn = [];
  for (let i = 0; i < n && st.deck.length; i++) drawn.push(st.deck.pop());
  st.ex = { p, drawn };
  st.q.unshift({ k: 'exchange', p });
  ev.push({ t: 'exdraw', p, cards: drawn });
}

// ---------- mất ảnh hưởng ----------
function loseCard(st, p, id, why, ev) {
  const pl = st.players[p], c = pl.cards.find(x => x.id === id && !x.dead);
  c.dead = true;
  forget(st, c.id);
  ev.push({ t: 'lose', p, id: c.id, r: c.r, why });
  if (hidden(pl).length) return;
  pl.alive = false;
  pl.ghost = st.chaos;
  pl.outAt = ++st.outSeq;
  pl.items = [];
  ev.push({ t: 'out', p, ghost: pl.ghost });
  const al = aliveSeats(st);
  if (al.length === 1) {
    st.phase = 'over';
    st.winner = al[0];
    st.q = [];
    st.win = null;
    ev.push({ t: 'over', p: al[0] });
  }
}

// ---------- chạy hàng chờ ----------
function run(st, ev) {
  while (st.phase !== 'over') {
    const s = st.q[0];
    if (!s) { st.phase = 'act'; st.win = null; return; }
    if (s.k === 'win') {
      if (!s.open) {
        st.win = windowFor(st, s.mode);
        if (!st.win) {
          st.q.shift();
          if (s.mode === 'block') blockStands(st, ev);   // không ai được thách thức người chặn (vd Im Lặng)
          continue;
        }
        s.open = true;
      }
      st.phase = 'react';
      return;
    }
    st.win = null;
    if (s.k === 'resolve') { st.q.shift(); resolve(st, ev); continue; }
    if (s.k === 'end') { st.q.shift(); nextTurn(st, ev); return; }
    const pl = st.players[s.p];
    if (!pl.alive) {   // người phải quyết định đã bị loại → bỏ bước này
      st.q.shift();
      if (s.k === 'exchange' && st.ex) { for (const c of st.ex.drawn) toDeck(st, c); st.ex = null; }
      continue;
    }
    if (s.k === 'lose') {
      if (['coup', 'kill', 'poison'].includes(s.why) && takeItem(pl, 'armor')) { ev.push({ t: 'armor', p: s.p, why: s.why }); st.q.shift(); continue; }
      st.phase = 'lose';
      return;
    }
    if (s.k === 'poison' && pl.coins < 3) { st.q[0] = { k: 'lose', p: s.p, why: 'poison' }; continue; }
    st.phase = s.k;   // 'poison' | 'exchange' | 'show' | 'force'
    return;
  }
}

// ---------- vòng bàn ----------
function nextTurn(st, ev) {
  Object.assign(st, { pend: null, win: null, ex: null, inq: null, bought: false, q: [] });
  const prev = st.cur, nx = nextAlive(st, prev);
  if (nx <= prev) newRound(st, ev);
  if (st.phase === 'over') return;
  st.cur = alive(st, nx) ? nx : nextAlive(st, nx);
  st.turnNo++;
  st.phase = 'act';
  ev.push({ t: 'turn', p: st.cur, round: st.round });
}

function newRound(st, ev) {
  st.round++;
  for (const pl of st.players) if (pl.active) pl.gUsed = false;
  if (!st.chaos) { st.event = null; ev.push({ t: 'round', r: st.round }); return; }
  st.market = shuffle(ITEM_KEYS.slice()).slice(0, 2);
  st.event = Math.random() < EVENT_P ? pick(EVENT_KEYS) : null;
  ev.push({ t: 'round', r: st.round, event: st.event, market: st.market });
  if (st.event) ev.push({ t: 'event', e: st.event });
  const al = aliveSeats(st);
  if (st.event === 'windfall') coins(st, al.map(p => ({ p, d: 1 })), 'windfall', ev);
  if (st.event === 'robin' && al.length > 1) {
    const by = (f) => shuffle(al.slice()).reduce((a, x) => (f(st.players[x].coins, st.players[a].coins) ? x : a));
    const rich = by((a, b) => a > b), poor = by((a, b) => a < b), n = Math.min(2, st.players[rich].coins);
    if (rich !== poor && n) { ev.push({ t: 'robin', p: rich, s: poor, n }); coins(st, [{ p: rich, d: -n }, { p: poor, d: n }], 'robin', ev); }
  }
  if (st.event === 'shuffle' && al.length > 1) {
    const moves = al.map((p, i) => ({ from: p, to: al[(i + 1) % al.length], c: pick(hidden(st.players[p])) }));
    for (const m of moves) { const pl = st.players[m.from]; pl.cards.splice(pl.cards.indexOf(m.c), 1); }
    for (const m of moves) { st.players[m.to].cards.push(m.c); st.players[m.from].know[m.c.id] = m.c.r; }
    ev.push({ t: 'shuffle', moves: moves.map(m => ({ from: m.from, to: m.to, id: m.c.id, r: m.c.r })) });
  }
  // Hồn ma bot quậy ngay đầu vòng.
  st.players.forEach((pl, p) => {
    if (!pl.active || !pl.ghost || pl.kind !== 'bot' || Math.random() > 0.45 || al.length < 2) return;
    if (Math.random() < 0.5) ghostAct(st, p, 'curse', pick(al), ev);
    else ghostAct(st, p, 'bless', pick(al), ev);
  });
}

function ghostAct(st, p, g, s, ev) {
  st.players[p].gUsed = true;
  ev.push({ t: 'ghost', p, g, s });
  if (g === 'whisper') peek(st, p, s, 'ghost', ev);
  if (g === 'curse' && st.players[s].coins) coins(st, [{ p: s, d: -1 }], 'curse', ev);
  if (g === 'bless') coins(st, [{ p: s, d: 1 }], 'bless', ev);
}

// ---------- hành động ----------
// Lượt mình:   { type: <hành động trong ACTIONS>, target? } | { type: 'buy', item, target? } (chợ đen, trước khi hành động)
// Cửa sổ:      { type: 'pass' | 'challenge' } | { type: 'block', r } — kèm key (st.win.key) để bấm trễ không rơi sang cửa sổ sau
// Quyết định:  { type: 'lose', id } | { type: 'keep', ids } (đổi bài) | { type: 'poison', pay } | { type: 'show', id } | { type: 'force', yes }
// Hồn ma:      { type: 'ghost', g: 'whisper'|'curse'|'bless', target } — mỗi vòng bàn 1 lần, lúc nào cũng được
function act(st, seat, a) {
  a = a || {};
  const pl = st.players[seat], ev = [];
  if (st.phase === 'over') return fail('Ván đã kết thúc');
  if (!pl || !pl.active) return fail('Bạn không ở trong ván này');
  if (a.type === 'ghost') {
    if (!st.chaos || !pl.ghost) return fail('Chỉ hồn ma mới làm được');
    if (pl.gUsed) return fail('Vòng bàn này bạn quậy rồi, chờ vòng sau nhé');
    if (!GHOST[a.g]) return fail('Chọn việc để làm');
    if (!alive(st, a.target)) return fail('Chọn 1 người còn sống');
    ghostAct(st, seat, a.g, a.target, ev);
    return { ok: true, events: ev };
  }
  if (!pl.alive) return fail('Bạn đã bị loại');
  const s = st.q[0];
  let e = null;
  switch (st.phase) {
    case 'act':
      if (seat !== st.cur) return fail('Chưa tới lượt bạn');
      e = a.type === 'buy' ? buy(st, seat, a, ev) : declare(st, seat, a, ev);
      break;
    case 'react': {
      const W = st.win, o = W.opts[seat];
      if (!o || !undecided(st).includes(seat)) return fail('Bạn không cần phản ứng lúc này');
      // Client gửi kèm key của cửa sổ: bấm trễ rơi sang cửa sổ mới thì bỏ, không thách thức nhầm người.
      if (a.key != null && a.key !== W.key) return fail('Tình huống đã thay đổi — xem lại nhé');
      if (a.type === 'pass') {
        W.passed.push(seat);
        ev.push({ t: 'pass', p: seat });
        if (!undecided(st).length) closeWindow(st, ev);
      } else if (a.type === 'challenge') {
        if (!o.ch) return fail(st.event === 'silence' ? '🤐 Im Lặng: không ai được thách thức' : 'Hành động này không thách thức được');
        doChallenge(st, seat, ev);
      } else if (a.type === 'block') {
        if (!o.bl.includes(a.r)) return fail('Không chặn được bằng vai đó');
        st.pend.block = { by: seat, r: a.r, role: a.r };
        claim(pl, a.r);
        ev.push({ t: 'block', p: seat, r: a.r, a: st.pend.act, s: st.pend.by });
        st.q.shift();
        st.q.unshift({ k: 'win', mode: 'block' });
        st.win = null;
        run(st, ev);
      } else return fail('Cho qua, thách thức hoặc chặn');
      break;
    }
    case 'lose': {
      if (seat !== s.p) return fail('Chưa tới lượt bạn');
      if (a.type !== 'lose' || !pl.cards.some(c => c.id === a.id && !c.dead)) return fail('Chọn 1 lá úp để lật bỏ');
      st.q.shift();
      loseCard(st, seat, a.id, s.why, ev);
      run(st, ev);
      break;
    }
    case 'poison': {
      if (seat !== s.p) return fail('Chưa tới lượt bạn');
      if (a.type !== 'poison') return fail('Nộp 3 xu hay mất 1 ảnh hưởng?');
      if (a.pay) {   // thuốc giải mua của chính kẻ đầu độc
        st.q.shift();
        ev.push({ t: 'poisoned', p: seat, pay: true, by: s.by });
        coins(st, [{ p: seat, d: -3 }, { p: s.by, d: 3 }], 'antidote', ev);
      }
      else { ev.push({ t: 'poisoned', p: seat, pay: false }); st.q[0] = { k: 'lose', p: seat, why: 'poison' }; }
      run(st, ev);
      break;
    }
    case 'exchange': {
      if (seat !== s.p) return fail('Chưa tới lượt bạn');
      const hs = hidden(pl), pool = [...hs, ...st.ex.drawn], ids = [...new Set(a.ids || [])];
      if (a.type !== 'keep' || ids.length !== hs.length || !ids.every(id => pool.some(c => c.id === id))) return fail(`Chọn đúng ${hs.length} lá để giữ`);
      const keep = pool.filter(c => ids.includes(c.id)), back = pool.filter(c => !ids.includes(c.id));
      pl.cards = [...pl.cards.filter(c => c.dead), ...keep.map(c => ({ id: c.id, r: c.r, dead: false }))];
      for (const c of back) toDeck(st, c);
      ev.push({ t: 'exdone', p: seat, n: back.length, kept: keep.map(c => ({ id: c.id, r: c.r })) });
      st.ex = null;
      st.q.shift();
      run(st, ev);
      break;
    }
    case 'show': {
      if (seat !== s.p) return fail('Chưa tới lượt bạn');
      const c = a.type === 'show' && pl.cards.find(x => x.id === a.id && !x.dead);
      if (!c) return fail('Chọn 1 lá úp để cho xem');
      st.inq = { by: s.by, t: seat, id: c.id, r: c.r };
      st.players[s.by].know[c.id] = c.r;
      ev.push({ t: 'show', p: seat, by: s.by, id: c.id, r: c.r });
      st.q[0] = { k: 'force', p: s.by, t: seat };
      run(st, ev);
      break;
    }
    case 'force': {
      if (seat !== s.p) return fail('Chưa tới lượt bạn');
      if (a.type !== 'force') return fail('Bắt đổi lá hay thôi?');
      const T = st.players[s.t], c = T.cards.find(x => x.id === st.inq.id && !x.dead);
      ev.push({ t: 'force', p: seat, s: s.t, yes: !!a.yes });
      if (a.yes && c) redraw(st, s.t, c, ev);
      st.inq = null;
      st.q.shift();
      run(st, ev);
      break;
    }
    default: return fail('Chưa tới lượt bạn');
  }
  return e ? fail(e) : { ok: true, events: ev };
}

function buy(st, p, a, ev) {
  const pl = st.players[p], I = ITEMS[a.item];
  if (!st.chaos || !I || !st.market.includes(a.item)) return 'Chợ đen vòng này không bán món đó';
  if (st.bought) return 'Mỗi lượt chỉ mua 1 món';
  if (pl.items.includes(a.item)) return 'Bạn đang có món này rồi';
  if (pl.coins < I.cost) return `Cần ${I.cost} xu`;
  if (a.item === 'glass' && !(alive(st, a.target) && a.target !== p)) return 'Chọn 1 người để soi';
  if (a.item === 'forge' && !st.deck.length) return 'Chồng bài hết lá';
  st.bought = true;
  coins(st, [{ p, d: -I.cost }], 'buy', ev);
  ev.push({ t: 'buy', p, item: a.item, s: a.item === 'glass' ? a.target : null });
  if (a.item === 'glass') peek(st, p, a.target, 'glass', ev);
  else if (a.item === 'forge') { startExchange(st, p, 1, ev); run(st, ev); }
  else pl.items.push(a.item);
  return null;
}

function turn(st) {
  if (st.phase === 'over') return null;
  const s = st.q[0];
  switch (st.phase) {
    case 'act': return { seat: st.cur };
    case 'react': return { seats: undecided(st), key: 'w' + st.win.key, ms: st.reactMs };
    case 'lose': case 'show': {
      const hs = hidden(st.players[s.p]);
      return hs.length === 1 ? { seat: s.p, auto: { type: st.phase, id: hs[0].id }, autoDelay: 700 } : { seat: s.p };
    }
    default: return { seat: s.p };
  }
}

// ---------- bot ----------
// Bot chỉ dùng thông tin mình được biết: lá của mình, lá đã lật ngửa, lá đã xem trộm (pl.know), lời tuyên bố công khai.
const VAL = { duke: 5, gambler: 4.6, assassin: 4.6, poisoner: 4, captain: 4, spy: 3.8, ambassador: 3.2, seer: 3.2, contessa: 4.5, guard: 4.6 };
function cardVal(pl, r, others) {
  return VAL[r] + (pl.claims.includes(r) ? 1.2 : 0) - (others.includes(r) ? 1.5 : 0);
}
const deadCount = (st, r) => st.players.reduce((n, pl) => n + (pl.active ? pl.cards.filter(c => c.dead && c.r === r).length : 0), 0);
// Người khác có thể tin mình có vai r không (chưa lộ hết số lá của vai đó, chưa bị bắt bài vai đó).
const believable = (st, b, r) => st.copies - deadCount(st, r) > 0 && !st.players[b].caught.includes(r);

// Xác suất (theo góc nhìn ghế b) ghế s đang giữ ít nhất 1 lá vai r.
function pHas(st, b, s, r) {
  const me = st.players[b], S = st.players[s];
  if (hidden(S).some(c => me.know[c.id] === r)) return 1;
  let U = st.deck.length, k = st.copies - deadCount(st, r) - hidden(me).filter(c => c.r === r).length, h = 0;
  for (const [o, pl] of st.players.entries()) {
    if (o === b || !pl.active || !pl.alive) continue;
    for (const c of hidden(pl)) {
      if (me.know[c.id]) { if (me.know[c.id] === r) k--; } else { U++; if (o === s) h++; }
    }
  }
  if (k <= 0 || !h) return 0;
  let q = 1;
  for (let i = 0; i < h; i++) q *= Math.max(0, U - k - i) / (U - i);
  return 1 - q;
}

function botTurn(st, b, timeout) {
  const me = st.players[b], H = hidden(me), mine = H.map(c => c.r), c = me.coins;
  const targets = aliveSeats(st).filter(t => canTarget(st, b, t));
  const threat = t => { const T = st.players[t]; return hidden(T).length * 3 + T.coins * 0.6 + (T.kind === 'human' ? 0.3 : 0) + Math.random(); };
  const best = (arr, f) => arr.reduce((a, x) => (f(x) > f(a) ? x : a), arr[0]);
  const coupCost = costOf('coup', st.event), canCoup = st.event !== 'martial' && c >= coupCost && targets.length;
  if (c >= MUST_COUP && st.event !== 'martial') return { type: 'coup', target: best(targets, threat) };
  if (timeout) return { type: 'income' };
  if (st.chaos && !st.bought) { const bAct = botBuy(st, b); if (bAct) return bAct; }
  if (canCoup && Math.random() < 0.85) return { type: 'coup', target: best(targets, threat) };

  const nAl = aliveSeats(st).length, opts = [];
  const add = (score, a) => opts.push([score + Math.random() * 1.3, a]);
  const claimsAny = (t, rs) => rs.some(r => st.players[t].claims.includes(r));
  add(2, { type: 'income' });
  const aidBlock = blockersOf('aid', st.roles);
  add(aliveSeats(st).some(t => t !== b && claimsAny(t, aidBlock)) ? 1 : 3.1, { type: 'aid' });
  for (const R of st.roles) {
    const A = ROLES[R].act;
    if (!A) continue;
    const honest = mine.includes(R);
    if (!honest && !believable(st, b, R)) continue;
    const m = honest || st.event === 'silence' ? 1 : me.bluff * (me.claims.includes(R) ? 1.3 : 0.8) * (H.length === 1 ? 0.55 : 1) * Math.max(0.4, 1 - 0.07 * (nAl - 2));
    const cost = costOf(A, st.event);
    if (c < cost) continue;
    const blk = blockersOf(A, st.roles);
    if (A === 'tax') add(5.5 * m, { type: A });
    else if (A === 'gamble') add(5 * m, { type: A });
    else if ((A === 'kill' || A === 'poison') && targets.length) {
      const t = best(targets, x => threat(x) - (claimsAny(x, blk) ? 4 : 0));
      add((A === 'kill' ? 7 : 5) * m - (claimsAny(t, blk) ? 2.5 : 0), { type: A, target: t });
    } else if ((A === 'steal' || A === 'spy') && targets.length) {
      const t = best(targets, x => st.players[x].coins - (claimsAny(x, blk) ? 3 : 0) + Math.random());
      const gain = Math.min(A === 'steal' ? 2 : 1, st.players[t].coins);
      add((2.6 + gain * 1.1) * m - (claimsAny(t, blk) ? 2.5 : 0), { type: A, target: t });
    } else if (A === 'exchange') add((2.6 + (new Set(mine).size < mine.length ? 1.5 : 0) + (me.caught.some(r => mine.includes(r)) ? 1 : 0)) * m, { type: A });
    else if (A === 'inquire' && targets.length) add(2.4 * m, { type: A, target: pick(targets) });
  }
  if (st.factions && st.alms >= 2) {
    const eco = ecoRole(st.roles), honest = !mine.includes(eco);
    add(honest ? 2 + st.alms * 0.9 : st.alms * 0.5 * me.bluff, { type: 'embezzle' });
  }
  if (st.factions && c >= 3 && !targets.length) add(3, { type: 'convert' });
  return opts.reduce((a, x) => (x[0] > a[0] ? x : a))[1];
}

function botBuy(st, b) {
  const me = st.players[b], H = hidden(me).length, c = me.coins, has = k => st.market.includes(k) && !me.items.includes(k) && c >= ITEMS[k].cost;
  const others = aliveSeats(st).filter(t => t !== b);
  if (has('armor') && ((H === 1 && Math.random() < 0.5) || (c >= 6 && Math.random() < 0.15))) return { type: 'buy', item: 'armor' };
  if (has('mask') && c >= 3 && me.bluff > 0.5 && Math.random() < 0.2) return { type: 'buy', item: 'mask' };
  if (has('glass') && c >= 4 && Math.random() < 0.06) return { type: 'buy', item: 'glass', target: pick(others) };
  if (has('forge') && c >= 5 && st.deck.length && Math.random() < 0.12) return { type: 'buy', item: 'forge' };
  return null;
}

function botReact(st, b, timeout) {
  const pass = { type: 'pass' }, ch = { type: 'challenge' };
  if (timeout) return pass;
  const W = st.win, o = W.opts[b] || { ch: false, bl: [] }, P = st.pend, me = st.players[b], H = hidden(me).length;
  if (W.mode === 'block') {
    if (!o.ch) return pass;
    const p = pHas(st, b, P.block.by, P.block.role);
    if (p === 0) return ch;
    const thr = (b === P.by ? (P.act === 'kill' || P.act === 'poison' ? 0.32 : 0.22) : 0.05) * me.doubt;
    return p < thr && (H > 1 || p < 0.12) ? ch : pass;
  }
  const tgt = P.t === b;
  const lethal = tgt && H === 1 && !me.items.includes('armor') && (P.act === 'kill' || (P.act === 'poison' && me.coins < 3));
  if (o.bl.length) {
    const real = o.bl.filter(r => hasRole(me, r));
    if (real.length) {
      if ((tgt || P.act === 'aid') && Math.random() < 0.9) return { type: 'block', r: pick(real) };
      if (!tgt && P.act !== 'aid' && Math.random() < 0.3) return { type: 'block', r: real[0] };   // Vệ Sĩ che cho người khác
    } else if (tgt || P.act === 'aid') {
      const cands = o.bl.filter(r => believable(st, b, r));
      const want = lethal ? 0.75 : P.act === 'kill' ? 0.4 : P.act === 'poison' ? 0.25 : P.act === 'aid' ? 0.15 * me.bluff : 0.4 * me.bluff;
      if (cands.length && Math.random() < want) return { type: 'block', r: cands.find(r => me.claims.includes(r)) || pick(cands) };
    }
  }
  if (o.ch) {
    const R = P.act === 'embezzle' ? ecoRole(st.roles) : P.role;
    const p = P.act === 'embezzle' ? 1 - pHas(st, b, P.by, R) : pHas(st, b, P.by, R);
    if (p === 0 || lethal) return ch;
    let thr = 0.1;
    if (tgt) thr += P.act === 'kill' ? 0.22 : 0.12;
    if (st.players[P.by].caught.length) thr += 0.06;
    if (P.act === 'tax' || P.act === 'gamble') thr += 0.04;
    if (st.event === 'trial') thr += 0.08;
    if (H === 1) thr -= 0.06;
    if (p < thr * me.doubt) return ch;
  }
  return pass;
}

// Lá ít giá trị nhất trong các lá úp (để bỏ / để cho xem): giá trị mỗi lá tính theo các lá còn lại.
function worstCard(pl) {
  const hs = hidden(pl), v = x => cardVal(pl, x.r, hs.filter(c => c !== x).map(c => c.r));
  return hs.reduce((a, x) => (v(x) < v(a) ? x : a), hs[0]);
}

function botAction(st, b, { timeout } = {}) {
  const me = st.players[b], s = st.q[0];
  switch (st.phase) {
    case 'act': return botTurn(st, b, timeout);
    case 'react': return botReact(st, b, timeout);
    case 'lose': return { type: 'lose', id: timeout ? pick(hidden(me)).id : worstCard(me).id };
    case 'poison': {
      const H = hidden(me).length;
      if (timeout) return { type: 'poison', pay: me.coins >= 3 };
      return { type: 'poison', pay: H === 1 || me.coins >= 7 || Math.random() < 0.35 };
    }
    case 'exchange': {
      const hs = hidden(me);
      if (timeout) return { type: 'keep', ids: hs.map(c => c.id) };
      const pool = [...hs, ...st.ex.drawn], keep = [];
      while (keep.length < hs.length) {
        const rs = keep.map(c => c.r);
        const left = pool.filter(c => !keep.includes(c));
        keep.push(left.reduce((a, x) => (cardVal(me, x.r, rs) + Math.random() * 0.3 > cardVal(me, a.r, rs) ? x : a), left[0]));
      }
      return { type: 'keep', ids: keep.map(c => c.id) };
    }
    case 'show': return { type: 'show', id: timeout ? hidden(me)[0].id : worstCard(me).id };
    case 'force': return { type: 'force', yes: !timeout && st.inq && (VAL[st.inq.r] >= 4.5 || Math.random() < 0.35) };
  }
  return { type: 'pass' };
}

// ---------- che thông tin ----------
function view(st, seat) {
  const over = st.phase === 'over', me = st.players[seat], my = me && me.active ? me : null;
  const { deck, players, ex, inq, q, win, ...rest } = st;
  const W = win && {
    mode: win.mode, key: win.key, seats: undecided(st), passed: win.passed, opts: win.opts[seat] || null,
  };
  return {
    ...rest,
    deck: deck.length,
    step: q[0] ? { k: q[0].k, p: q[0].p, why: q[0].why || null, by: q[0].by ?? null, t: q[0].t ?? null } : null,
    win: W,
    ex: ex ? (ex.p === seat ? { p: ex.p, drawn: ex.drawn } : { p: ex.p, n: ex.drawn.length }) : null,
    inq: inq ? (seat === inq.by || seat === inq.t ? inq : { by: inq.by, t: inq.t }) : null,
    players: players.map((pl, i) => {
      if (!pl.active) return { active: false };
      const mine = i === seat;
      return {
        active: true, kind: pl.kind, name: pl.name, coins: pl.coins, alive: pl.alive, ghost: pl.ghost, faction: pl.faction,
        claims: pl.claims, caught: pl.caught, gUsed: pl.gUsed, outAt: pl.outAt, nItems: pl.items.length,
        cards: pl.cards.map(c => (c.dead || mine || over ? { id: c.id, r: c.r, dead: c.dead } : { k: (my && my.know[c.id]) || null })),
        ...(mine || over ? { items: pl.items } : {}),
      };
    }),
  };
}

function viewEvents(evs, seat, st) {
  if (st.phase === 'over') return evs;
  return evs.map(e => {
    switch (e.t) {
      case 'redraw': return e.p === seat ? e : { t: e.t, p: e.p };
      case 'peek': return e.p === seat ? e : { t: e.t, p: e.p, s: e.s, src: e.src };
      case 'exdraw': return e.p === seat ? e : { t: e.t, p: e.p, n: e.cards.length };
      case 'exdone': return e.p === seat ? e : { t: e.t, p: e.p, n: e.n };
      case 'show': return e.p === seat || e.by === seat ? e : { t: e.t, p: e.p, by: e.by };
      case 'shuffle': return { ...e, moves: e.moves.map(m => (m.from === seat || m.to === seat ? m : { from: m.from, to: m.to })) };
      case 'buy': return e.p === seat || ITEMS[e.item].use ? e : { t: e.t, p: e.p };
      default: return e;
    }
  });
}

export default {
  create,
  act,
  isOver: st => st.phase === 'over',
  // Thứ hạng: người thắng, rồi ai bị loại càng muộn càng cao.
  result: st => [{ p: st.winner }, ...st.players.map((pl, p) => ({ p, pl })).filter(x => x.pl.active && x.p !== st.winner)
    .sort((a, b) => b.pl.outAt - a.pl.outAt).map(({ p }) => ({ p }))],
  turn,
  bot: botAction,
  animDuration,
  view,
  viewEvents,
};
