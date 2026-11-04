// Cờ Cá Ngựa — Lục Mã Hỗn Chiến: luật chơi thuần (không I/O), dùng chung cho server và trình duyệt.

const NP = 6;            // số ghế
const SIDE = 12;         // số ô mỗi cạnh lục giác
const L = NP * SIDE;     // 72 ô đường đua
const HOME = 6;          // 6 bậc chuồng đích
const GATE = L - 1;      // progress của cửa chuồng (ô góc ngay trước ô xuất phát)
const MAX_CARDS = 3;

const SEATS = [
  { color: '#ff4d6d', name: 'Đỏ',   horse: 'Xích Thố' },
  { color: '#ff9f1c', name: 'Cam',  horse: 'Hỏa Long' },
  { color: '#ffd23f', name: 'Vàng', horse: 'Kim Phong' },
  { color: '#2ec76b', name: 'Lục',  horse: 'Thanh Vân' },
  { color: '#3a9bff', name: 'Lam',  horse: 'Thủy Mã' },
  { color: '#b06cff', name: 'Tím',  horse: 'Tử Điện' },
];

const CARDS = {
  shield: { icon: '🛡️', name: 'Khiên Thần',   desc: 'Bảo vệ 1 ngựa trên đường đua khỏi bị đá, sao băng, hoán đổi... cho tới lượt sau của bạn.' },
  golden: { icon: '🎯', name: 'Xúc Xắc Vàng', desc: 'Tự chọn số xúc xắc (1–6) cho lần gieo này.' },
  swap:   { icon: '🔄', name: 'Hoán Đổi',     desc: 'Đổi chỗ 1 ngựa của bạn với 1 ngựa đối thủ trên đường đua.' },
  freeze: { icon: '❄️', name: 'Đóng Băng',    desc: 'Một đối thủ bị mất lượt kế tiếp.' },
  ghost:  { icon: '👻', name: 'Bóng Ma',      desc: 'Lần đi này ngựa bay qua đầu ngựa khác (bỏ qua luật cản).' },
  turbo:  { icon: '🚀', name: 'Tên Lửa',      desc: 'Số bước trên đường đua lần này được nhân đôi.' },
};
const CARD_KEYS = Object.keys(CARDS);

const MYSTERY = {
  boost:  { w: 20, icon: '🌈', name: 'Cầu Vồng',      desc: 'phi nước đại tới trước tối đa 4 ô!' },
  back:   { w: 14, icon: '💨', name: 'Gió Ngược',     desc: 'bị thổi lùi tối đa 3 ô!' },
  extra:  { w: 14, icon: '⭐', name: 'Sao May Mắn',   desc: 'được thêm 1 lượt!' },
  card:   { w: 16, icon: '🎁', name: 'Quà Bí Ẩn',     desc: 'nhận 1 thẻ kỹ năng!' },
  shield: { w: 10, icon: '😇', name: 'Thiên Thần',    desc: 'được gắn khiên bảo vệ!' },
  hole:   { w: 6,  icon: '🕳️', name: 'Hố Đen',        desc: 'rơi xuống hố — về chuồng!' },
  swap:   { w: 10, icon: '🔀', name: 'Cổng Hỗn Loạn', desc: 'đổi chỗ với 1 ngựa đối thủ ngẫu nhiên!' },
  sleep:  { w: 10, icon: '😴', name: 'Ngủ Quên',      desc: 'mất lượt kế tiếp!' },
};

const EVENTS = {
  tsunami:  { icon: '🌊', name: 'Sóng Thần',     desc: 'Mọi ngựa trên đường đua bị cuốn lùi 3 ô!' },
  tailwind: { icon: '🍃', name: 'Gió Thuận',     desc: 'Mọi ngựa trên đường đua được đẩy tới 2 ô!' },
  tornado:  { icon: '🌪️', name: 'Lốc Xoáy',      desc: 'Vài cặp ngựa bị cuốn đổi chỗ cho nhau!' },
  meteor:   { icon: '☄️', name: 'Mưa Sao Băng',  desc: 'Ô có dấu ☄️ sẽ bị sao băng đánh sau 1 vòng — chạy mau!' },
  quake:    { icon: '🌋', name: 'Địa Chấn',      desc: 'Bàn cờ rung chuyển — các ô đặc biệt đổi chỗ!' },
  festival: { icon: '🎉', name: 'Lễ Hội',        desc: 'Ai cũng được tặng 1 thẻ kỹ năng!' },
};

// Thời lượng animation (ms) — server dùng để canh nhịp bot, client dùng để phát.
const DUR = {
  start: 1500, turn: 350, roll: 1100, hop: 150, kick: 950, fly: 750, swap: 950,
  card: 700, useCard: 900, shield: 600, freeze: 1000, skip: 1100, mystery: 1400,
  global: 2600, meteorStrike: 1700, extra: 500, nomove: 700, divine: 1600, win: 4000, msg: 400, auto: 0,
};

// ---------- tiện ích ----------
const rnd = n => (Math.random() * n) | 0;
const pick = a => a[rnd(a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function weighted(obj) {
  const keys = Object.keys(obj); let t = 0; for (const k of keys) t += obj[k].w;
  let r = Math.random() * t; for (const k of keys) { r -= obj[k].w; if (r < 0) return k; }
  return keys[0];
}
const randCard = () => pick(CARD_KEYS);

const startCell = p => (p * SIDE + 1) % L;
const gateCell = p => p * SIDE;
const absOf = (p, prog) => (startCell(p) + prog) % L;
const progOf = (p, cell) => ((cell - startCell(p)) % L + L) % L;
const isCorner = c => c % SIDE === 0;
const isStart = c => c % SIDE === 1;
const newHorse = () => ({ loc: 'stable', prog: 0, step: 0, shield: false });

function occMap(st) {
  const m = {};
  st.players.forEach((pl, p) => {
    if (!pl.active) return;
    pl.horses.forEach((hs, h) => { if (hs.loc === 'track') m[absOf(p, hs.prog)] = { p, h }; });
  });
  return m;
}
const horseOf = (st, x) => st.players[x.p].horses[x.h];
const specialAt = (st, c) => st.specials.find(s => s.cell === c) || null;
const homeOcc = (pl, s) => pl.horses.some(hs => hs.loc === 'home' && hs.step === s);
function trackHorses(st) {
  const out = [];
  st.players.forEach((pl, p) => pl.active && pl.horses.forEach((hs, h) => { if (hs.loc === 'track') out.push({ p, h }); }));
  return out;
}
function locKey(st, p, h) {
  const hs = st.players[p].horses[h];
  if (hs.loc === 'track') return 'T' + absOf(p, hs.prog);
  if (hs.loc === 'home') return 'H' + p + ':' + hs.step;
  return 'S' + p + ':' + h;
}
function scoreOf(pl) {
  let s = 0;
  for (const hs of pl.horses) s += hs.loc === 'track' ? hs.prog + 1 : hs.loc === 'home' ? GATE + 1 + hs.step : 0;
  return s;
}
const maxScore = pl => pl.horses.length * (GATE + 1 + HOME);

// ---------- ô đặc biệt ----------
function placeSpecials(st) {
  const o = occMap(st);
  const free = shuffle([...Array(L).keys()].filter(c => !isCorner(c) && !isStart(c) && !o[c]));
  const taken = new Set();
  const ok = c => !taken.has(c) && !taken.has((c + 1) % L) && !taken.has((c + L - 1) % L);
  const take = (cond = () => true) => {
    const i = free.findIndex(c => ok(c) && cond(c));
    if (i < 0) return null;
    const c = free.splice(i, 1)[0]; taken.add(c); return c;
  };
  const sp = [];
  for (let pair = 0; pair < 2; pair++) {
    const a = take(); if (a == null) break;
    const b = take(c => Math.min((c - a + L) % L, (a - c + L) % L) >= 18);
    if (b == null) { taken.delete(a); continue; }
    sp.push({ cell: a, type: 'portal', pair }, { cell: b, type: 'portal', pair });
  }
  for (let i = 0; i < 6; i++) { const c = take(); if (c != null) sp.push({ cell: c, type: 'card' }); }
  for (let i = 0; i < 5; i++) { const c = take(); if (c != null) sp.push({ cell: c, type: 'mystery' }); }
  st.specials = sp;
}
function freeSpecialCell(st) {
  const o = occMap(st);
  const near = c => st.specials.some(s => s.cell === c || s.cell === (c + 1) % L || s.cell === (c + L - 1) % L);
  const cells = [...Array(L).keys()].filter(c => !isCorner(c) && !isStart(c) && !o[c] && !near(c));
  return cells.length ? pick(cells) : null;
}

// ---------- tạo ván ----------
function newGame(seatInfo, opts) {
  opts = Object.assign({ horses: 3, block: true, chaos: true, eventEvery: 10, home: 'fast' }, opts);
  const players = seatInfo.map(s => ({
    active: !!s, kind: s ? s.kind : null, name: s ? s.name : '',
    horses: s ? Array.from({ length: opts.horses }, newHorse) : [],
    cards: [], frozen: 0, sixStreak: 0, finished: false,
  }));
  const actives = players.map((pl, i) => (pl.active ? i : -1)).filter(i => i >= 0);
  const st = {
    opts, players, turn: pick(actives), phase: 'roll', dice: null, moveVal: null, legal: [],
    cardUsed: false, ghost: false, turbo: false, specials: [], meteors: null,
    turnCount: 0, nextEventIn: opts.eventEvery, lastEvent: null, winner: null,
  };
  if (opts.chaos) {
    placeSpecials(st);
    actives.forEach(p => players[p].cards.push(randCard()));
  }
  return { state: st, events: [{ t: 'start' }, { t: 'turn', p: st.turn }] };
}

// ---------- nước đi hợp lệ ----------
function legalMoves(st, p, d) {
  const pl = st.players[p], o = occMap(st), res = [];
  const mv = st.turbo ? d * 2 : d;
  const block = st.opts.block && !st.ghost, fast = st.opts.home !== 'classic';
  const blockedBy = x => x && (x.p === p || horseOf(st, x).shield);
  pl.horses.forEach((hs, h) => {
    if (hs.loc === 'stable') {
      if (d !== 1 && d !== 6) return;
      const c = startCell(p), x = o[c];
      if (blockedBy(x)) return;
      res.push({ h, kind: 'out', to: 'T' + c, kick: x || null });
    } else if (hs.loc === 'track') {
      // Đứng ở cửa chuồng: gieo n → lên bậc n.  Luật nhanh: dư bước thì trượt thẳng vào chuồng.
      const np = hs.prog + (hs.prog === GATE ? d : mv);
      if (hs.prog === GATE || np > GATE) {
        const step = hs.prog === GATE ? d : np - GATE;
        if (hs.prog !== GATE && !fast) return;
        if (step > HOME) return;
        if (block) for (let k = hs.prog + 1; k <= GATE; k++) if (o[absOf(p, k)]) return;
        for (let s = 1; s <= step; s++) if (homeOcc(pl, s)) return;
        res.push({ h, kind: 'enter', to: 'H' + p + ':' + step, step, kick: null });
        return;
      }
      if (block) for (let k = 1; k < mv; k++) if (o[absOf(p, hs.prog + k)]) return;
      const c = absOf(p, np), x = o[c];
      if (blockedBy(x)) return;
      res.push({ h, kind: 'track', to: 'T' + c, kick: x || null });
    } else {
      // Trong chuồng. Truyền thống: phải gieo đúng bậc kế tiếp. Nhanh: gieo số lớn hơn là lên tới bậc đó.
      const step = fast ? d : hs.step + 1;
      if (step <= hs.step || step > HOME || (!fast && d !== step)) return;
      for (let s = hs.step + 1; s <= step; s++) if (homeOcc(pl, s)) return;
      res.push({ h, kind: 'home', to: 'H' + p + ':' + step, step, kick: null });
    }
  });
  return res;
}
const distinctMoves = st => new Set(st.legal.map(m => m.kind + m.to)).size;

// ---------- hành động ----------
function act(st, p, a) {
  const ev = [];
  const fail = err => ({ ok: false, err });
  if (st.phase === 'over') return fail('Ván đã kết thúc');
  if (p !== st.turn) return fail('Chưa tới lượt bạn');
  if (a.type === 'roll') {
    if (st.phase !== 'roll') return fail('Bạn đã gieo rồi, hãy chọn ngựa');
    doRoll(st, p, 1 + rnd(6), ev, false);
  } else if (a.type === 'move') {
    if (st.phase !== 'move') return fail('Hãy gieo xúc xắc trước');
    const m = st.legal.find(m => m.h === a.h);
    if (!m) return fail('Ngựa này không đi được');
    doMove(st, p, m, ev);
  } else if (a.type === 'card') {
    if (!st.opts.chaos) return fail('Ván này tắt chế độ Hỗn Loạn');
    if (st.phase !== 'roll') return fail('Chỉ dùng thẻ trước khi gieo');
    if (st.cardUsed) return fail('Mỗi lượt chỉ được dùng 1 thẻ');
    const e = useCard(st, p, a, ev);
    if (e) return fail(e);
  } else return fail('Hành động không hợp lệ');
  return { ok: true, events: ev };
}

function useCard(st, p, a, ev) {
  const pl = st.players[p], idx = pl.cards.indexOf(a.card);
  if (idx < 0) return 'Bạn không có thẻ này';
  let after;
  switch (a.card) {
    case 'shield': {
      const hs = pl.horses[a.h];
      if (!hs || hs.loc !== 'track') return 'Chọn 1 ngựa của bạn đang trên đường đua';
      if (hs.shield) return 'Ngựa này đã có khiên';
      after = () => { hs.shield = true; ev.push({ t: 'shield', p, h: a.h }); };
      break;
    }
    case 'golden': {
      const v = a.value | 0;
      if (v < 1 || v > 6) return 'Chọn số từ 1 đến 6';
      after = () => doRoll(st, p, v, ev, true);
      break;
    }
    case 'swap': {
      const mine = pl.horses[a.h], t = a.target || {}, tp = st.players[t.p];
      if (!mine || mine.loc !== 'track') return 'Chọn ngựa của bạn trên đường đua';
      if (!tp || !tp.active || t.p === p) return 'Chọn 1 ngựa đối thủ';
      const th = tp.horses[t.h];
      if (!th || th.loc !== 'track') return 'Ngựa đối thủ phải ở trên đường đua';
      if (th.shield) return 'Ngựa đối thủ đang có khiên';
      after = () => swapHorses(st, { p, h: a.h }, { p: t.p, h: t.h }, ev, 'card');
      break;
    }
    case 'freeze': {
      const tp = st.players[a.target];
      if (!tp || !tp.active || tp.finished || a.target === p) return 'Chọn 1 đối thủ';
      after = () => { tp.frozen++; ev.push({ t: 'freeze', p: a.target, by: p }); };
      break;
    }
    case 'ghost': after = () => { st.ghost = true; }; break;
    case 'turbo': after = () => { st.turbo = true; }; break;
    default: return 'Thẻ không hợp lệ';
  }
  pl.cards.splice(idx, 1);
  st.cardUsed = true;
  ev.push({ t: 'useCard', p, card: a.card, target: a.target, h: a.h, value: a.value });
  after();
  return null;
}

function doRoll(st, p, v, ev, golden) {
  const pl = st.players[p];
  st.dice = v;
  st.moveVal = st.turbo ? v * 2 : v;
  ev.push({ t: 'roll', p, v, golden, turbo: st.turbo, ghost: st.ghost });
  if (v === 6) {
    pl.sixStreak++;
    if (pl.sixStreak >= 3) {
      pl.sixStreak = 0;
      if (st.opts.chaos) { ev.push({ t: 'divine', p }); gainCard(st, p, 'ghost', ev); }
    }
  } else pl.sixStreak = 0;
  st.legal = legalMoves(st, p, v);
  if (st.legal.length) { st.phase = 'move'; return; }
  ev.push({ t: 'nomove', p });
  st.ghost = st.turbo = false;
  if (v === 6) { st.phase = 'roll'; ev.push({ t: 'extra', p, reason: 'six' }); }
  else endTurn(st, ev);
}

function doMove(st, p, m, ev) {
  const pl = st.players[p], hs = pl.horses[m.h];
  let extra = st.dice === 6;
  const path = [];
  if (m.kind === 'out') {
    path.push(m.to); hs.loc = 'track'; hs.prog = 0;
  } else if (m.kind === 'track') {
    for (let k = 1; k <= st.moveVal; k++) path.push('T' + absOf(p, hs.prog + k));
    hs.prog += st.moveVal;
  } else if (m.kind === 'enter') {
    for (let k = hs.prog + 1; k <= GATE; k++) path.push('T' + absOf(p, k));
    for (let s = 1; s <= m.step; s++) path.push('H' + p + ':' + s);
    hs.loc = 'home'; hs.step = m.step; hs.shield = false;
  } else {
    for (let s = hs.step + 1; s <= m.step; s++) path.push('H' + p + ':' + s);
    hs.step = m.step;
  }
  ev.push({ t: 'move', p, h: m.h, path, kind: m.kind });
  if (m.kick) {
    kick(st, m.kick, p, ev);
    if (st.opts.chaos) gainCard(st, p, randCard(), ev);
  }
  if (st.opts.chaos && hs.loc === 'track' && landSpecial(st, p, m.h, ev)) extra = true;
  st.ghost = st.turbo = false;
  st.legal = [];
  if (pl.horses.every(x => x.loc === 'home' && x.step > HOME - pl.horses.length)) {
    pl.finished = true; st.winner = p; st.phase = 'over';
    ev.push({ t: 'win', p });
    return;
  }
  if (extra) { st.phase = 'roll'; ev.push({ t: 'extra', p, reason: st.dice === 6 ? 'six' : 'bonus' }); }
  else endTurn(st, ev);
}

function kick(st, x, by, ev, reason) {
  const from = locKey(st, x.p, x.h);
  st.players[x.p].horses[x.h] = newHorse();
  ev.push({ t: 'kick', p: x.p, h: x.h, by, from, reason: reason || 'kick' });
}

function gainCard(st, p, card, ev) {
  const pl = st.players[p];
  if (pl.cards.length >= MAX_CARDS) { ev.push({ t: 'msg', p, text: 'túi thẻ đã đầy (tối đa 3)' }); return; }
  pl.cards.push(card);
  ev.push({ t: 'card', p, card });
}

function swapHorses(st, A, B, ev, kind) {
  const ha = horseOf(st, A), hb = horseOf(st, B);
  const ca = absOf(A.p, ha.prog), cb = absOf(B.p, hb.prog);
  ha.prog = progOf(A.p, cb);
  hb.prog = progOf(B.p, ca);
  const moves = [{ p: A.p, h: A.h, from: 'T' + ca, to: 'T' + cb }, { p: B.p, h: B.h, from: 'T' + cb, to: 'T' + ca }];
  if (ev) ev.push({ t: 'swap', kind, moves });
  return moves;
}

// Trả về true nếu được thêm lượt.
function landSpecial(st, p, h, ev) {
  const pl = st.players[p], hs = pl.horses[h];
  const cell = absOf(p, hs.prog), sp = specialAt(st, cell);
  if (!sp) return false;
  if (sp.type === 'card') { gainCard(st, p, randCard(), ev); return false; }
  if (sp.type === 'portal') {
    const dest = st.specials.find(s => s.type === 'portal' && s.pair === sp.pair && s.cell !== cell);
    if (!dest) return false;
    const x = occMap(st)[dest.cell];
    if (x && (x.p === p || horseOf(st, x).shield)) { ev.push({ t: 'msg', p, text: 'cổng dịch chuyển bị chặn 🌀' }); return false; }
    if (x) kick(st, x, p, ev);
    hs.prog = progOf(p, dest.cell);
    ev.push({ t: 'fly', p, h, from: 'T' + cell, to: 'T' + dest.cell, kind: 'portal' });
    return false;
  }
  // mystery
  const outcome = weighted(MYSTERY);
  ev.push({ t: 'mystery', p, h, outcome });
  let extra = false;
  const o = occMap(st);
  switch (outcome) {
    case 'boost': case 'back': {
      const dir = outcome === 'boost' ? 1 : -1, max = outcome === 'boost' ? 4 : 3;
      for (let k = max; k >= 1; k--) {
        const np = hs.prog + dir * k;
        if (np < 0 || np > GATE || o[absOf(p, np)]) continue;
        ev.push({ t: 'fly', p, h, from: 'T' + cell, to: 'T' + absOf(p, np), kind: outcome });
        hs.prog = np; break;
      }
      break;
    }
    case 'extra': extra = true; break;
    case 'card': gainCard(st, p, randCard(), ev); break;
    case 'shield': hs.shield = true; ev.push({ t: 'shield', p, h }); break;
    case 'hole': if (hs.shield) ev.push({ t: 'msg', p, text: 'khiên đã cứu ngựa khỏi hố đen!' }); else kick(st, { p, h }, null, ev, 'hole'); break;
    case 'swap': {
      const cands = trackHorses(st).filter(x => x.p !== p && !horseOf(st, x).shield);
      if (cands.length) swapHorses(st, { p, h }, pick(cands), ev, 'mystery');
      else ev.push({ t: 'msg', p, text: 'không có ai để đổi chỗ' });
      break;
    }
    case 'sleep': pl.frozen++; ev.push({ t: 'freeze', p, by: null }); break;
  }
  const nc = freeSpecialCell(st);
  if (nc != null) sp.cell = nc;
  return extra;
}

function endTurn(st, ev) {
  st.phase = 'roll'; st.dice = null; st.moveVal = null; st.legal = [];
  st.ghost = st.turbo = false; st.cardUsed = false;
  st.players[st.turn].sixStreak = 0;
  st.turnCount++;
  if (st.meteors && --st.meteors.in <= 0) strikeMeteors(st, ev);
  if (st.opts.chaos && --st.nextEventIn <= 0) { triggerGlobal(st, ev); st.nextEventIn = st.opts.eventEvery; }
  let p = st.turn;
  for (let guard = 0; guard < 60; guard++) {
    p = (p + 1) % NP;
    const pl = st.players[p];
    if (!pl.active || pl.finished) continue;
    if (pl.frozen > 0) { pl.frozen--; ev.push({ t: 'skip', p }); continue; }
    break;
  }
  st.turn = p;
  st.players[p].horses.forEach(hs => { hs.shield = false; });
  ev.push({ t: 'turn', p });
}

function shiftAll(st, delta, moves) {
  for (const x of shuffle(trackHorses(st).filter(x => !horseOf(st, x).shield))) {
    const hs = horseOf(st, x);
    if (delta > 0 && hs.prog === GATE) continue;
    for (let k = Math.abs(delta); k >= 1; k--) {
      const np = hs.prog + Math.sign(delta) * k;
      if (np < 0 || np > GATE) continue;
      const c = absOf(x.p, np);
      if (occMap(st)[c]) continue;
      moves.push({ p: x.p, h: x.h, from: 'T' + absOf(x.p, hs.prog), to: 'T' + c });
      hs.prog = np;
      break;
    }
  }
}

function triggerGlobal(st, ev) {
  const kinds = Object.keys(EVENTS).filter(k => k !== st.lastEvent && !(k === 'meteor' && st.meteors));
  const kind = pick(kinds);
  st.lastEvent = kind;
  const e = { t: 'global', kind, moves: [] };
  switch (kind) {
    case 'tsunami': shiftAll(st, -3, e.moves); break;
    case 'tailwind': shiftAll(st, 2, e.moves); break;
    case 'tornado': {
      const list = shuffle(trackHorses(st).filter(x => !horseOf(st, x).shield));
      for (let pairs = 0; pairs < 3 && list.length >= 2; pairs++) {
        const a = list.shift(), j = list.findIndex(x => x.p !== a.p);
        if (j < 0) break;
        e.moves.push(...swapHorses(st, a, list.splice(j, 1)[0], null));
      }
      break;
    }
    case 'meteor': {
      const o = occMap(st);
      const cand = [...Array(L).keys()].filter(c => !isCorner(c) && !isStart(c));
      const hot = shuffle(cand.filter(c => o[c] && !horseOf(st, o[c]).shield)).slice(0, 2);
      const cells = hot.concat(shuffle(cand.filter(c => !hot.includes(c))).slice(0, 5 - hot.length));
      st.meteors = { cells, in: st.players.filter(pl => pl.active && !pl.finished).length };
      e.cells = cells;
      break;
    }
    case 'quake': placeSpecials(st); e.specials = st.specials; break;
    case 'festival':
      e.gains = [];
      st.players.forEach((pl, p) => {
        if (!pl.active || pl.finished || pl.cards.length >= MAX_CARDS) return;
        const c = randCard(); pl.cards.push(c); e.gains.push({ p, card: c });
      });
      break;
  }
  ev.push(e);
}

function strikeMeteors(st, ev) {
  const o = occMap(st), hits = [];
  for (const c of st.meteors.cells) {
    const x = o[c];
    if (x && !horseOf(st, x).shield) { hits.push({ p: x.p, h: x.h, from: 'T' + c }); st.players[x.p].horses[x.h] = newHorse(); }
  }
  ev.push({ t: 'meteorStrike', cells: st.meteors.cells, hits });
  st.meteors = null;
}

function animDuration(evs) {
  let t = 0;
  for (const e of evs) {
    if (e.t === 'move') t += DUR.hop * e.path.length + 150;
    else if (e.t === 'global') t += DUR.global + (e.moves.length ? DUR.fly : 0);
    else t += DUR[e.t] || 0;
  }
  return t;
}

// ---------- Bot ----------
function danger(st, p, cell) {
  let d = 0;
  st.players.forEach((pl, q) => {
    if (q === p || !pl.active || pl.finished) return;
    pl.horses.forEach(hs => {
      if (hs.loc !== 'track') return;
      const dist = ((cell - absOf(q, hs.prog)) % L + L) % L;
      if (dist >= 1 && dist <= 6 && hs.prog + dist <= GATE) d++;
    });
    if (cell === startCell(q) && pl.horses.some(hs => hs.loc === 'stable')) d++;
  });
  return d;
}

function scoreMove(st, p, m, d, mv) {
  const pl = st.players[p], hs = pl.horses[m.h];
  let s = Math.random() * 4;
  if (m.kick) s += 60 + horseOf(st, m.kick).prog * 0.5;
  if (m.kind === 'out') s += 32 - danger(st, p, startCell(p)) * 6;
  else if (m.kind === 'enter') s += 42 + m.step;
  else if (m.kind === 'home') s += 38;
  else {
    const np = hs.prog + mv, c = absOf(p, np), from = absOf(p, hs.prog);
    s += mv * 0.8 + np * 0.05;
    const sp = st.opts.chaos ? specialAt(st, c) : null;
    if (sp && sp.type === 'card') s += pl.cards.length < MAX_CARDS ? 14 : 2;
    if (sp && sp.type === 'mystery') s += 7;
    if (sp && sp.type === 'portal') {
      const dst = st.specials.find(x => x.type === 'portal' && x.pair === sp.pair && x.cell !== c);
      if (dst) s += (progOf(p, dst.cell) - np) * 0.7;
    }
    if (np === GATE) s += 14;
    if (!hs.shield) s += (danger(st, p, from) - danger(st, p, c)) * (8 + hs.prog * 0.35);
    if (st.meteors) {
      if (st.meteors.cells.includes(c)) s -= 45;
      if (st.meteors.cells.includes(from)) s += 35;
    }
  }
  return s;
}

function botCard(st, p) {
  const pl = st.players[p], has = c => pl.cards.includes(c);
  if (!pl.cards.length) return null;
  const my = scoreOf(pl);
  if (has('freeze')) {
    let lead = -1, ls = -1;
    st.players.forEach((q, i) => {
      if (i === p || !q.active || q.finished || q.frozen) return;
      const s = scoreOf(q); if (s > ls) { ls = s; lead = i; }
    });
    if (lead >= 0 && ls >= my * 0.9 && Math.random() < 0.6) return { type: 'card', card: 'freeze', target: lead };
  }
  if (has('golden')) {
    let bestV = 0, bestS = 0;
    for (let v = 1; v <= 6; v++) for (const m of legalMoves(st, p, v)) {
      const s = scoreMove(st, p, m, v, v);
      if (s > bestS) { bestS = s; bestV = v; }
    }
    if (bestS >= 60) return { type: 'card', card: 'golden', value: bestV };
  }
  if (has('shield')) {
    const h = pl.horses.findIndex(hs => hs.loc === 'track' && !hs.shield && hs.prog > 20 && danger(st, p, absOf(p, hs.prog)) > 0);
    if (h >= 0) return { type: 'card', card: 'shield', h };
  }
  if (has('swap')) {
    let best = null, gain = 30;
    pl.horses.forEach((hs, h) => {
      if (hs.loc !== 'track') return;
      st.players.forEach((q, qi) => {
        if (qi === p || !q.active) return;
        q.horses.forEach((th, thi) => {
          if (th.loc !== 'track' || th.shield) return;
          const g = progOf(p, absOf(qi, th.prog)) - hs.prog;
          if (g > gain) { gain = g; best = { h, target: { p: qi, h: thi } }; }
        });
      });
    });
    if (best) return { type: 'card', card: 'swap', h: best.h, target: best.target };
  }
  const onTrack = pl.horses.some(hs => hs.loc === 'track' && hs.prog < GATE - 8);
  if (onTrack && has('turbo') && Math.random() < 0.3) return { type: 'card', card: 'turbo' };
  if (onTrack && has('ghost') && Math.random() < 0.25) return { type: 'card', card: 'ghost' };
  return null;
}

function botAction(st, p, noCards) {
  if (st.phase === 'roll') {
    if (!noCards && !st.cardUsed && st.opts.chaos) { const c = botCard(st, p); if (c) return c; }
    return { type: 'roll' };
  }
  let best = st.legal[0], bs = -1e9;
  for (const m of st.legal) {
    const s = scoreMove(st, p, m, st.dice, st.moveVal);
    if (s > bs) { bs = s; best = m; }
  }
  return { type: 'move', h: best.h };
}

export {
  NP, SIDE, L, HOME, GATE, MAX_CARDS, SEATS, CARDS, MYSTERY, EVENTS, DUR,
  startCell, gateCell, absOf, progOf, occMap, specialAt, locKey, scoreOf, maxScore,
  legalMoves, distinctMoves, newGame, act, botAction, animDuration,
};
