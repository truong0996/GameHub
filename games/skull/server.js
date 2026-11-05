// 💀 Hoa & Sọ (Skull) — luật + bot (chạy trên server, KHÔNG gửi cho client vì biết mọi đĩa úp).
// Hàm thuần: không I/O, không Date.now(). Xem "Game server interface" trong CLAUDE.md.
//
// Vòng: mọi người BÍ MẬT đặt đĩa đầu tiên cùng lúc (turn() trả { seats, key }) → lần lượt: đặt thêm 1 đĩa HOẶC cược
//   "lật được n Hoa" → đấu giá vòng quanh (nâng hoặc bỏ) → người cược cao nhất lật n đĩa, chồng TRƯỚC MẶT MÌNH trước
//   → lật đủ n mà không trúng Sọ = thắng 1 thử thách; trúng Sọ = mất đĩa (Sọ của chính mình thì tự chọn đĩa bỏ,
//   Sọ người khác thì mất ngẫu nhiên). Hết đĩa = bị loại (Hỗn Loạn: thành hồn ma, mỗi vòng được ám 1 chồng).
import { SPECIALS, OMEN_KEYS, OMEN_P, isSafe, animDuration } from './data.js';

const rnd = n => (Math.random() * n) | 0;
const pick = a => a[rnd(a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fail = err => ({ ok: false, err });
const aliveSeats = st => st.players.map((pl, i) => (pl.active && pl.alive ? i : -1)).filter(i => i >= 0);
const total = st => st.stacks.reduce((s, x) => s + x.length, 0);
function nextAlive(st, from) {
  const n = st.players.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (st.players[i].active && st.players[i].alive) return i; }
  return from;
}
const topOf = stack => { for (let i = stack.length - 1; i >= 0; i--) if (!stack[i].fl) return stack[i]; return null; };
const unflipped = stack => stack.filter(d => !d.fl).length;
const resolveMask = d => { if (d.k === 'mask' && !d.res) d.res = Math.random() < 0.5 ? 'skull' : 'rose'; };

// ---------- tạo ván ----------
function create({ seats, opts }) {
  const chaos = !!opts.chaos, need = opts.need === 3 ? 3 : 2;
  const st = { chaos, need, round: 0, uid: 0, phase: 'place0', players: [], stacks: [], hauntOn: [], first: 0, turn: 0,
    omen: null, started: false, bid: null, flip: null, discard: null, pendingPeek: [], winner: null };
  st.players = seats.map(s => {
    if (!s) return { active: false };
    const hand = ['rose', 'rose', 'rose', 'skull'];
    if (chaos) hand.push(pick(SPECIALS));
    return {
      active: true, kind: s.kind, name: s.name, alive: true, ghost: false, wins: 0,
      hand: hand.map(k => ({ id: ++st.uid, k })), lost: [], know: {}, placed0: false, haunted: null,
      bluff: 0.15 + Math.random() * 0.35, bold: 0.85 + Math.random() * 0.3,   // tính cách bot
    };
  });
  st.stacks = st.players.map(() => []);
  st.hauntOn = st.players.map(() => []);
  st.first = pick(aliveSeats(st));
  const ev = [{ t: 'start' }];
  startRound(st, ev);
  return { state: st, events: ev };
}

// ---------- vòng ----------
function startRound(st, ev) {
  st.round++;
  st.omen = st.chaos && Math.random() < OMEN_P ? pick(OMEN_KEYS) : null;
  Object.assign(st, { phase: 'place0', started: false, bid: null, flip: null, discard: null, pendingPeek: [], turn: st.first });
  st.stacks = st.players.map(() => []);
  st.hauntOn = st.players.map(() => []);
  for (const pl of st.players) if (pl.active) Object.assign(pl, { placed0: false, know: {}, haunted: null });
  ev.push({ t: 'round', r: st.round, first: st.first, omen: st.omen });
  // Hồn ma bot ám ngay đầu vòng (hồn ma người thì ám lúc nào cũng được, trước khi bắt đầu lật).
  st.players.forEach((pl, p) => { if (pl.active && pl.ghost && pl.kind === 'bot' && Math.random() < 0.85) haunt(st, p, pick(aliveSeats(st)), ev); });
}

// Trả mọi đĩa trên bàn về tay chủ.
function collect(st) {
  for (const stack of st.stacks) for (const d of stack) st.players[d.o].hand.push({ id: d.id, k: d.k });
  st.stacks = st.players.map(() => []);
  st.hauntOn = st.players.map(() => []);
}

function finish(st, winner, ev) {
  st.phase = 'over';
  st.winner = winner;
  st.turn = winner;
  ev.push({ t: 'over', p: winner });
}

// ---------- đặt đĩa ----------
function placeDisc(st, seat, k, peek, ev) {
  const pl = st.players[seat];
  const i = pl.hand.findIndex(d => d.k === k);
  if (i < 0) return 'Bạn không còn đĩa này';
  if (k === 'eye') {
    const ok = st.phase === 'place0' ? st.players[peek]?.active && st.players[peek].alive : st.stacks[peek]?.length;
    if (peek === seat || !ok) return 'Chọn 1 người khác để nhìn trộm';
  }
  const [d] = pl.hand.splice(i, 1);
  st.stacks[seat].push({ id: d.id, k: d.k, o: seat });
  ev.push({ t: 'place', p: seat, k: d.k, id: d.id });
  if (k === 'eye') {
    if (st.phase === 'place0') st.pendingPeek.push({ p: seat, s: peek });   // chờ mọi người đặt xong mới nhìn
    else doPeek(st, seat, peek, ev);
  }
  return null;
}
function doPeek(st, p, s, ev) {
  const d = topOf(st.stacks[s]);
  if (!d) return;
  st.players[p].know[d.id] = d.k;
  ev.push({ t: 'peek', p, s, id: d.id, k: d.k });
}

function haunt(st, ghost, s, ev) {
  st.players[ghost].haunted = s;
  if (s == null) return;
  st.hauntOn[s].push(ghost);
  ev.push({ t: 'haunt', p: ghost, s });
}

// Người đầu tiên cược = bắt đầu thử thách: điềm Lốc Xoáy / Gió Lật kích hoạt lúc này.
function startOmen(st, ev) {
  st.started = true;
  if (st.omen === 'twister') {
    const al = aliveSeats(st), ns = st.players.map(() => []), nh = st.players.map(() => []);
    for (const p of al) { const to = nextAlive(st, p); ns[to] = st.stacks[p]; nh[to] = st.hauntOn[p]; }
    st.stacks = ns;
    st.hauntOn = nh;
    for (const pl of st.players) if (pl.active && pl.haunted >= 0 && pl.haunted !== null) pl.haunted = nextAlive(st, pl.haunted);
    ev.push({ t: 'twist' });
  }
  if (st.omen === 'wind') {
    const all = st.stacks.flatMap((stack, s) => stack.map(d => ({ d, s })));
    const { d, s } = pick(all);
    resolveMask(d);
    d.up = true;
    ev.push({ t: 'wind', s, id: d.id, k: d.k, res: d.res || null });
  }
}

function placeBid(st, seat, n, ev) {
  const T = total(st), min = st.bid ? st.bid.n + 1 : 1;
  n = Math.floor(+n);
  if (!(n >= min && n <= T)) return T < min ? 'Không thể cược cao hơn nữa' : `Cược từ ${min} đến ${T}`;
  const first = !st.bid;
  st.bid = { n, by: seat, passed: st.bid ? st.bid.passed : [] };
  ev.push({ t: 'bid', p: seat, n, first });
  if (first) startOmen(st, ev);
  if (n >= T) return beginFlip(st, ev), null;
  st.phase = 'bid';
  advanceBid(st, seat, ev);
  return null;
}
function advanceBid(st, from, ev) {
  let p = from;
  do p = nextAlive(st, p); while (st.bid.passed.includes(p) && p !== st.bid.by);
  if (p === st.bid.by) return beginFlip(st, ev);
  st.turn = p;
}

// ---------- lật ----------
function beginFlip(st, ev) {
  const { n, by } = st.bid;
  st.phase = 'flip';
  st.turn = by;
  st.flip = { by, need: Math.min(n, total(st)), got: 0, shield: false, hit: [] };
  ev.push({ t: 'challenge', p: by, n });
}
// Chồng được phép lật: chồng trước mặt mình trước (Đêm Đen: sau cùng).
function flipOptions(st) {
  const by = st.flip.by, own = unflipped(st.stacks[by]) > 0;
  const others = st.stacks.map((s, i) => (i !== by && unflipped(s) ? i : -1)).filter(i => i >= 0);
  if (st.omen === 'night') return others.length ? others : own ? [by] : [];
  return own ? [by] : others;
}

function flipDisc(st, s, ev) {
  const F = st.flip, d = topOf(st.stacks[s]);
  d.fl = true;
  resolveMask(d);
  ev.push({ t: 'flip', p: F.by, s, id: d.id, o: d.o, k: d.k, res: d.res || null });
  if (!isSafe(d)) return challengeFailed(st, d.o, ev);
  F.got++;
  const T = total(st);
  if (d.k === 'pit' && F.need < T) { F.need++; ev.push({ t: 'pit', p: F.by, need: F.need }); }
  if (d.k === 'shield' && !F.shield) { F.shield = true; ev.push({ t: 'shieldGet', p: F.by }); }
  if (st.hauntOn[s].length && !F.hit.includes(s)) {
    F.hit.push(s);
    F.need = Math.min(T, F.need + st.hauntOn[s].length);
    ev.push({ t: 'hauntHit', s, ghosts: st.hauntOn[s].slice(), need: F.need });
  }
  if (F.got >= F.need) challengeWon(st, ev);
}

function challengeWon(st, ev) {
  const by = st.flip.by, pl = st.players[by];
  pl.wins++;
  collect(st);
  ev.push({ t: 'success', p: by, wins: pl.wins });
  if (st.omen === 'blessing' && pl.lost.length) {
    const d = pl.lost.splice(rnd(pl.lost.length), 1)[0];
    pl.hand.push(d);
    ev.push({ t: 'restore', p: by, k: d.k });
  }
  if (pl.wins >= st.need) return finish(st, by, ev);
  st.first = by;
  startRound(st, ev);
}

function challengeFailed(st, owner, ev) {
  const by = st.flip.by, pl = st.players[by], n = st.omen === 'bloodmoon' ? 2 : 1;
  ev.push({ t: 'fail', p: by, o: owner, n });
  collect(st);
  st.flip.owner = owner;
  if (st.flip.shield) { ev.push({ t: 'saved', p: by }); return afterPenalty(st, ev); }
  if (owner === by && pl.hand.length > n) {   // Sọ của chính mình: tự chọn đĩa bỏ
    st.phase = 'discard';
    st.discard = { p: by, n };
    st.turn = by;
    return;
  }
  for (let k = 0; k < n && pl.hand.length; k++) loseDisc(st, by, rnd(pl.hand.length), ev);
  afterPenalty(st, ev);
}
function loseDisc(st, p, i, ev) {
  const pl = st.players[p], [d] = pl.hand.splice(i, 1);
  pl.lost.push(d);
  ev.push({ t: 'lose', p, k: d.k, left: pl.hand.length });
}

function afterPenalty(st, ev) {
  const { by, owner } = st.flip, pl = st.players[by];
  if (!pl.hand.length) {
    pl.alive = false;
    pl.ghost = st.chaos;
    ev.push({ t: 'out', p: by, ghost: pl.ghost });
  }
  const al = aliveSeats(st);
  if (al.length === 1) return finish(st, al[0], ev);
  st.first = pl.alive ? by : owner !== by && st.players[owner].alive ? owner : nextAlive(st, by);
  startRound(st, ev);
}

// ---------- hành động ----------
// { type: 'place', k, peek? } — đặt 1 đĩa loại k (Mắt Thần: kèm ghế muốn nhìn trộm)
// { type: 'bid', n } | { type: 'pass' } — cược / bỏ
// { type: 'flip', s } — lật đĩa trên cùng của chồng trước mặt ghế s
// { type: 'discard', k } — bỏ 1 đĩa (khi trúng Sọ của chính mình)
// { type: 'haunt', s } — hồn ma ám chồng trước mặt ghế s (s = null: thôi không ám vòng này)
function act(st, seat, a) {
  a = a || {};
  const pl = st.players[seat], ev = [];
  if (st.phase === 'over') return fail('Ván đã kết thúc');
  if (!pl || !pl.active) return fail('Bạn không ở trong ván này');
  if (a.type === 'haunt') {
    if (!st.chaos || !pl.ghost) return fail('Chỉ hồn ma mới ám được');
    if (pl.haunted !== null) return fail('Vòng này bạn ám rồi');
    if (!['place0', 'place', 'bid'].includes(st.phase)) return fail('Đang lật rồi, chờ vòng sau nhé');
    if (a.s != null && !(st.players[a.s]?.active && st.players[a.s].alive)) return fail('Chọn chồng đĩa của người còn sống');
    haunt(st, seat, a.s ?? null, ev);
    if (a.s == null) pl.haunted = -1;   // -1 = đã bỏ qua vòng này
    return { ok: true, events: ev };
  }
  if (!pl.alive) return fail('Bạn đã bị loại');

  if (st.phase === 'place0') {
    if (a.type !== 'place') return fail('Hãy đặt đĩa đầu tiên');
    if (pl.placed0) return fail('Bạn đặt rồi, chờ mọi người');
    const e = placeDisc(st, seat, a.k, a.peek, ev);
    if (e) return fail(e);
    pl.placed0 = true;
    if (aliveSeats(st).every(p => st.players[p].placed0)) {
      for (const { p, s } of st.pendingPeek) doPeek(st, p, s, ev);
      st.pendingPeek = [];
      st.phase = 'place';
      st.turn = st.first;
    }
    return { ok: true, events: ev };
  }

  const asked = st.phase === 'discard' ? st.discard.p : st.turn;
  if (asked !== seat) return fail('Chưa tới lượt bạn');
  let e = null;
  if (st.phase === 'place') {
    if (a.type === 'place') {
      e = placeDisc(st, seat, a.k, a.peek, ev);
      if (!e) st.turn = nextAlive(st, seat);
    } else if (a.type === 'bid') e = placeBid(st, seat, a.n, ev);
    else e = 'Đặt thêm đĩa hoặc cược';
  } else if (st.phase === 'bid') {
    if (a.type === 'bid') e = placeBid(st, seat, a.n, ev);
    else if (a.type === 'pass') {
      st.bid.passed.push(seat);
      ev.push({ t: 'pass', p: seat });
      advanceBid(st, seat, ev);
    } else e = 'Nâng cược hoặc bỏ';
  } else if (st.phase === 'flip') {
    if (a.type !== 'flip') e = 'Hãy lật đĩa';
    else if (!flipOptions(st).includes(a.s)) e = st.omen === 'night' && a.s === seat ? '🌑 Đêm Đen: lật chồng người khác trước' : 'Phải lật hết chồng trước mặt bạn trước';
    else flipDisc(st, a.s, ev);
  } else if (st.phase === 'discard') {
    const i = a.type === 'discard' ? pl.hand.findIndex(d => d.k === a.k) : -1;
    if (i < 0) e = 'Chọn 1 đĩa để bỏ';
    else {
      loseDisc(st, seat, i, ev);
      if (--st.discard.n <= 0 || !pl.hand.length) { st.discard = null; afterPenalty(st, ev); }
    }
  }
  return e ? fail(e) : { ok: true, events: ev };
}

function turn(st) {
  if (st.phase === 'over') return null;
  if (st.phase === 'place0') return { seats: aliveSeats(st).filter(p => !st.players[p].placed0), key: 'r' + st.round };
  if (st.phase === 'discard') return { seat: st.discard.p };
  if (st.phase === 'flip') {
    const o = flipOptions(st);
    return o.length === 1 ? { seat: st.flip.by, auto: { type: 'flip', s: o[0] }, autoDelay: 450 } : { seat: st.flip.by };
  }
  return { seat: st.turn };
}

// ---------- bot ----------
// Bot chỉ dùng thông tin mình được biết: đĩa của mình, đĩa đã lật/ngửa, đĩa đã nhìn trộm.
function pSafe(st, seat, d) {
  if (d.fl || d.up) return isSafe(d) ? 1 : 0;
  const k = d.o === seat ? d.k : st.players[seat].know[d.id];
  if (k) return k === 'skull' ? 0 : k === 'mask' ? 0.5 : 1;
  return 0.62;
}
// Chồng đĩa "sẽ" nằm trước mặt mỗi người khi lật (tính trước Lốc Xoáy nếu chưa xoay).
function projected(st) {
  if (st.omen !== 'twister' || st.started) return st.stacks;
  const ns = st.players.map(() => []);
  for (const p of aliveSeats(st)) ns[nextAlive(st, p)] = st.stacks[p];
  return ns;
}
// Xác suất lật đủ n Hoa nếu mình thách đấu (lật tham lam: luôn chọn đĩa an toàn nhất được phép).
function successP(st, seat, n) {
  const stacks = projected(st).map(s => s.filter(d => !d.fl));
  let p = 1;
  for (let got = 0; got < n; got++) {
    const own = stacks[seat].length > 0, others = stacks.map((s, i) => (i !== seat && s.length ? i : -1)).filter(i => i >= 0);
    const opts = st.omen === 'night' ? (others.length ? others : own ? [seat] : []) : own ? [seat] : others;
    if (!opts.length) return 0;
    let best = opts[0], bp = -1;
    for (const s of opts) { const q = pSafe(st, seat, stacks[s].at(-1)); if (q > bp) { bp = q; best = s; } }
    p *= bp;
    stacks[best].pop();
    if (p < 0.01) return 0;
  }
  return p;
}
function bestBid(st, seat) {
  const pl = st.players[seat], T = total(st), thr = 0.5 / pl.bold;
  let n = 0;
  while (n < T && successP(st, seat, n + 1) >= thr) n++;
  return n;
}

function botPlace(st, seat, timeout) {
  const pl = st.players[seat], has = k => pl.hand.some(d => d.k === k);
  const others = aliveSeats(st).filter(p => p !== seat);
  const place = k => (k === 'eye' ? { type: 'place', k, peek: pick(others) } : { type: 'place', k });
  if (timeout) return place(has('rose') ? 'rose' : pl.hand[0].k);
  const first = st.phase === 'place0';
  const wantChallenge = pl.wins === 0 || Math.random() < 0.5;
  if (has('skull') && Math.random() < (first ? 0.35 : 0.2) + pl.bluff * 0.6) return place('skull');
  if (has('eye') && Math.random() < 0.45) return place('eye');
  if (has('shield') && wantChallenge && Math.random() < 0.35) return place('shield');
  if (has('pit') && Math.random() < 0.3) return place('pit');
  if (has('mask') && Math.random() < pl.bluff) return place('mask');
  if (has('rose')) return place('rose');
  return place(pick(pl.hand).k);
}

function botAction(st, seat, { timeout } = {}) {
  const pl = st.players[seat];
  if (st.phase === 'place0') return botPlace(st, seat, timeout);
  if (st.phase === 'discard') {
    const order = ['rose', 'pit', 'shield', 'eye', 'mask', 'skull'];
    return { type: 'discard', k: order.find(k => pl.hand.some(d => d.k === k)) || pl.hand[0].k };
  }
  if (st.phase === 'flip') {
    const o = flipOptions(st);
    let best = o[0], bp = -1;
    for (const s of shuffle(o.slice())) { const q = pSafe(st, seat, topOf(st.stacks[s])); if (q > bp) { bp = q; best = s; } }
    return { type: 'flip', s: best };
  }
  if (st.phase === 'bid') {
    if (timeout) return { type: 'pass' };
    const n = bestBid(st, seat), h = st.bid.n;
    if (n > h && Math.random() < 0.85) return { type: 'bid', n: Math.min(n, h + (Math.random() < 0.25 ? 2 : 1)) };
    // Chặn: người đang cược sắp thắng chung cuộc, hoặc cược thấp quá (chỉ cần lật chồng mình) → liều nâng 1.
    const leader = st.players[st.bid.by], cheap = h <= st.stacks[st.bid.by].length;
    const myStack = projected(st)[seat];
    if (h < total(st) && myStack.every(d => d.k !== 'skull' && d.k !== 'mask')
      && ((leader.wins >= st.need - 1 && successP(st, seat, h + 1) >= 0.2) || (cheap && Math.random() < 0.45 && successP(st, seat, h + 1) >= 0.3))) return { type: 'bid', n: h + 1 };
    return { type: 'pass' };
  }
  // place: đặt thêm hay mở cược?
  const T = total(st);
  if (!pl.hand.length) return { type: 'bid', n: Math.max(1, Math.min(T, Math.ceil(bestBid(st, seat) * 0.8))) };
  if (timeout) return botPlace(st, seat, true);
  const n = bestBid(st, seat), height = st.stacks[seat].length;
  if (n >= 2 && Math.random() < 0.2 + 0.15 * height + (n >= 3 ? 0.15 : 0)) return { type: 'bid', n: Math.max(1, Math.round(n * (0.6 + Math.random() * 0.3))) };
  return botPlace(st, seat, false);
}

// ---------- che thông tin ----------
function view(st, seat) {
  const me = st.players[seat], over = st.phase === 'over';
  const { players, stacks, hauntOn, pendingPeek, ...rest } = st;
  return {
    ...rest,
    total: total(st),
    options: st.phase === 'flip' ? flipOptions(st) : [],
    stacks: stacks.map(stack => stack.map(d => {
      const known = d.fl || d.up || over || d.o === seat || (me && me.active && me.know[d.id]);
      return { id: d.id, o: d.o, fl: !!d.fl, up: !!d.up, k: known ? d.k : null, res: d.fl || d.up ? d.res || null : null, peek: !!(me && me.active && me.know[d.id] && d.o !== seat) };
    })),
    players: players.map((pl, i) => {
      if (!pl.active) return pl;
      const mine = i === seat;
      return {
        active: true, kind: pl.kind, name: pl.name, alive: pl.alive, ghost: pl.ghost, wins: pl.wins, placed0: pl.placed0,
        nHand: pl.hand.length, nLost: pl.lost.length, haunting: pl.haunted != null && pl.haunted >= 0,
        ...(mine || over ? { hand: pl.hand.map(d => d.k), lost: pl.lost.map(d => d.k) } : {}),
        ...(mine ? { haunted: pl.haunted } : {}),
      };
    }),
  };
}
const SECRET = { place: 'k', peek: 'k', lose: 'k', restore: 'k', haunt: 's' };
function viewEvents(evs, seat, st) {
  return evs.map(e => {
    const f = SECRET[e.t];
    if (!f || e.p === seat || st.phase === 'over') return e;
    const { [f]: _, id, ...rest } = e;
    return e.t === 'place' ? { ...rest, id } : rest;   // đĩa vừa đặt: lộ id (để vẽ) nhưng không lộ loại
  });
}

export default {
  create,
  act,
  isOver: st => st.phase === 'over',
  // Thứ hạng (bảng xếp hạng của hub): người thắng nhất; còn lại người chưa bị loại, nhiều lần thắng thử thách, mất ít đĩa hơn xếp trên.
  result: st => [{ p: st.winner, s: 'win' }, ...st.players.map((pl, p) => ({ p, pl })).filter(x => x.pl.active && x.p !== st.winner)
    .map(({ p, pl }) => ({ p, s: [pl.alive ? 1 : 0, pl.wins, -pl.lost.length] }))
    .sort((a, b) => b.s[0] - a.s[0] || b.s[1] - a.s[1] || b.s[2] - a.s[2])],
  turn,
  bot: botAction,
  animDuration,
  view,
  viewEvents,
};
