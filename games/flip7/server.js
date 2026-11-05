// 🃏 Flip 7 — luật + bot (server giữ chồng bài nên không lộ ra client). Xem "Game server interface" trong CLAUDE.md.
// Trạng thái:
//   deck: mảng lá, lá trên cùng ở CUỐI mảng (pop). discard: chồng bỏ (xáo lại khi hết bài).
//   players[p]: { status: 'in'|'stay'|'frozen'|'bust'|'flip7'|'off', nums, mods, sc, bustCard, bonus, total }
//   pend: hàng chờ lá hành động cần người rút chọn mục tiêu — { seat, card, opts?, see? }. Chỉ phần tử đầu đang chờ quyết định.
//   dealQ: ghế còn chờ được chia lá đầu vòng. turn/turnDone: ghế đang tới lượt Rút/Dừng.
// Lá: { id, k: 'n' (số, v 0..12) | 'w' (Cầu Vồng) | 'm' (cộng, v 2..10 | 'x2') | 'a' (hành động, v tên) }, g:1 = lá ảo (Ân Huệ) không vào chồng bỏ.
import { NUM_COUNT, MODS, ACTIONS, RAINBOW, EVENT_KEYS, flipNeed, flipBonus, roundScore, animDuration } from './cards.js';

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const numVal = c => (c.k === 'n' ? c.v : 0);
const biggest = nums => nums.reduce((a, b) => (numVal(b) > numVal(a) ? b : a));

function buildDeck(chaos) {
  const d = [];
  let id = 0;
  for (let n = 0; n <= 12; n++) for (let i = 0; i < NUM_COUNT(n); i++) d.push({ id: id++, k: 'n', v: n });
  for (const v of MODS) d.push({ id: id++, k: 'm', v });
  for (const [v, A] of Object.entries(ACTIONS)) if (chaos || !A.chaos) for (let i = 0; i < A.n; i++) d.push({ id: id++, k: 'a', v });
  if (chaos) for (let i = 0; i < RAINBOW.n; i++) d.push({ id: id++, k: 'w' });
  return { deck: shuffle(d), nextId: id };
}

const seated = st => st.players.map((pl, i) => (pl.status !== 'off' ? i : -1)).filter(i => i >= 0);
const inSeats = st => st.players.map((pl, i) => (pl.status === 'in' ? i : -1)).filter(i => i >= 0);
const nextFrom = (st, p, ok) => { const n = st.players.length; for (let k = 1; k <= n; k++) { const q = (p + k) % n; if (ok(st.players[q])) return q; } return -1; };
const isFog = st => st.event === 'fog';

function toDiscard(st, c) { if (c && !c.g) st.discard.push(c); }

function drawCard(st, ev) {
  if (!st.deck.length) {
    if (!st.discard.length) return null;
    st.deck = shuffle(st.discard);
    st.discard = [];
    ev.push({ t: 'shuffle', n: st.deck.length });
  }
  return st.deck.pop();
}

// Thêm lá số vào hàng của p: trùng thì dùng Cơ Hội Thứ Hai hoặc cháy; đủ số lá khác nhau thì Flip 7.
function addNumber(st, p, c, ev) {
  const pl = st.players[p];
  if (c.k === 'n' && pl.nums.some(x => x.k === 'n' && x.v === c.v)) {
    if (pl.sc) {
      ev.push({ t: 'save', p, c });
      toDiscard(st, c); toDiscard(st, pl.sc);
      pl.sc = null;
      return;
    }
    pl.status = 'bust';
    pl.bustCard = c;
    ev.push({ t: 'bust', p, c });
    return;
  }
  pl.nums.push(c);
  if (pl.nums.length >= flipNeed(st.event)) {
    pl.status = 'flip7';
    st.flip7 = p;
    ev.push({ t: 'flip7', p });
  }
}

function drawTo(st, p, ev, why) {
  const c = drawCard(st, ev);
  if (!c) return false;
  const pl = st.players[p];
  ev.push({ t: 'draw', p, c, why, ...(isFog(st) ? { fog: 1 } : {}) });
  if (c.k === 'n' || c.k === 'w') addNumber(st, p, c, ev);
  else if (c.k === 'm') pl.mods.push(c);
  else if (c.v === 'second' && !pl.sc) pl.sc = c;
  else st.pend.push({ seat: p, card: c });
  return true;
}

// Những ai có thể nhận lá hành động `v` do p rút.
function targets(st, p, v) {
  const me = st.players[p], others = inSeats(st).filter(q => q !== p);
  switch (v) {
    case 'freeze': case 'three': return inSeats(st);
    case 'second': return others.filter(q => !st.players[q].sc);
    case 'swap': return others.filter(q => st.players[q].nums.length);
    case 'magnet': return others.filter(q => { const o = st.players[q]; return o.mods.length || (o.sc && !me.sc) || o.nums.length; });
    default: return [];
  }
}

function startRound(st, ev) {
  st.round++;
  st.dealer = st.round === 1 ? st.dealer : nextFrom(st, st.dealer, pl => pl.status !== 'off');
  if (st.chaos) {
    if (!st.bag.length) st.bag = shuffle(EVENT_KEYS.slice());
    st.event = st.bag.pop();
  }
  for (const pl of st.players) {
    if (pl.status === 'off') continue;
    Object.assign(pl, { status: 'in', nums: [], mods: [], sc: null, bustCard: null, bonus: 0 });
    if (st.event === 'grace') pl.sc = { id: st.nextId++, k: 'a', v: 'second', g: 1 };
  }
  st.flip7 = null;
  st.firstStay = null;
  st.pend = [];
  const order = [];
  for (let q = nextFrom(st, st.dealer, pl => pl.status !== 'off'), k = 0; k < seated(st).length; k++, q = nextFrom(st, q, pl => pl.status !== 'off')) order.push(q);
  st.dealQ = st.event === 'double' ? order.concat(order) : order;
  st.turn = st.dealer;
  st.turnDone = true;
  ev.push({ t: 'round', n: st.round, dealer: st.dealer, event: st.event });
}

function endRound(st, ev) {
  const res = [];
  const live = seated(st).filter(p => st.players[p].status !== 'bust');
  if (st.event === 'brave' && live.length) {
    const most = Math.max(...live.map(p => st.players[p].nums.length));
    if (most > 0) for (const p of live) if (st.players[p].nums.length === most) st.players[p].bonus += 15;
  }
  for (const p of seated(st)) {
    const pl = st.players[p];
    const pts = roundScore(pl, st.event);
    pl.total += pts;
    res.push({ p, pts, total: pl.total, status: pl.status, nums: pl.nums, bonus: pl.bonus });
  }
  ev.push({ t: 'roundEnd', n: st.round, res });
  for (const d of st.pend) toDiscard(st, d.card);
  st.pend = [];
  st.dealQ = [];
  const top = Math.max(...seated(st).map(p => st.players[p].total));
  const leaders = seated(st).filter(p => st.players[p].total === top);
  // Có người đạt điểm mục tiêu: cao nhất thắng; hoà điểm cao nhất thì đánh thêm vòng.
  if (top >= st.target && leaders.length === 1) {
    st.phase = 'over';
    st.winners = leaders;
    st.results = seated(st).map(p => ({ p, total: st.players[p].total })).sort((a, b) => b.total - a.total);
    ev.push({ t: 'over', winners: leaders });
    return; // giữ nguyên lá trên bàn để mọi người xem lại vòng cuối
  }
  // Dọn bàn: mọi lá về chồng bỏ.
  for (const p of seated(st)) {
    const pl = st.players[p];
    for (const c of [...pl.nums, ...pl.mods, pl.sc, pl.bustCard]) toDiscard(st, c);
    Object.assign(pl, { nums: [], mods: [], sc: null, bustCard: null });
  }
}

const roundDone = st => st.flip7 != null || !inSeats(st).length;

// Chạy tiếp cho tới khi cần ai đó quyết định (hoặc hết ván).
function advance(st, ev) {
  for (let guard = 0; guard < 1000; guard++) {
    if (st.phase === 'over') return;
    if (roundDone(st)) {
      endRound(st, ev);
      if (st.phase === 'over') return;
      startRound(st, ev);
      continue;
    }
    if (st.pend.length) {
      const d = st.pend[0];
      if (d.opts || d.see) return;
      if (st.players[d.seat].status !== 'in') { fizzle(st, ev, 'out'); continue; }
      if (d.card.v === 'peek') {
        if (!st.deck.length && st.discard.length) { st.deck = shuffle(st.discard); st.discard = []; ev.push({ t: 'shuffle', n: st.deck.length }); }
        if (!st.deck.length) { fizzle(st, ev, 'empty'); continue; }
        d.see = st.deck.slice(-3).reverse();
        ev.push({ t: 'peek', p: d.seat, n: d.see.length });
        return;
      }
      const opts = targets(st, d.seat, d.card.v);
      if (!opts.length) { fizzle(st, ev, 'none'); continue; }
      d.opts = opts;
      return;
    }
    if (st.dealQ.length) {
      const p = st.dealQ.shift();
      if (st.players[p].status === 'in' && !drawTo(st, p, ev, 'deal')) st.dealQ = [];
      continue;
    }
    if (st.turnDone || st.players[st.turn].status !== 'in') {
      st.turn = nextFrom(st, st.turn, pl => pl.status === 'in');
      st.turnDone = false;
    }
    return;
  }
  throw new Error('flip7: advance() lặp quá nhiều');
}

function fizzle(st, ev, why) {
  const d = st.pend.shift();
  toDiscard(st, d.card);
  ev.push({ t: 'fizzle', p: d.seat, c: d.card, why });
}

function resolveAction(st, d, to, ev) {
  const { seat: p, card: c } = d;
  const me = st.players[p], tg = st.players[to];
  ev.push({ t: 'act', p, to, c });
  switch (c.v) {
    case 'freeze':
      tg.status = 'frozen';
      toDiscard(st, c);
      break;
    case 'second':
      tg.sc = c;
      break;
    case 'three': {
      toDiscard(st, c);
      // Lá hành động rút được trong lúc Lật Ba Lá được xử lý ngay sau 3 lá, trước những lá đang chờ khác.
      const rest = st.pend.splice(0);
      for (let i = 0; i < 3 && tg.status === 'in' && st.flip7 == null; i++) if (!drawTo(st, to, ev, 'three')) break;
      st.pend.push(...rest);
      break;
    }
    case 'swap': {
      toDiscard(st, c);
      // Chưa có lá số thì chỉ lấy, không phải đưa.
      const give = me.nums.length ? me.nums.reduce((a, b) => (numVal(b) < numVal(a) ? b : a)) : null;
      const take = biggest(tg.nums);
      if (give) me.nums.splice(me.nums.indexOf(give), 1);
      tg.nums.splice(tg.nums.indexOf(take), 1);
      ev.push({ t: 'swap', p, to, give, take, ...(isFog(st) ? { fog: 1 } : {}) });
      addNumber(st, p, take, ev);
      if (give) addNumber(st, to, give, ev);
      break;
    }
    case 'magnet': {
      toDiscard(st, c);
      const x2 = tg.mods.find(m => m.v === 'x2');
      const best = x2 || tg.mods.reduce((a, b) => (!a || b.v > a.v ? b : a), null);
      if (best) { tg.mods.splice(tg.mods.indexOf(best), 1); me.mods.push(best); ev.push({ t: 'steal', p, from: to, c: best }); }
      else if (tg.sc && !me.sc) { me.sc = tg.sc; tg.sc = null; ev.push({ t: 'steal', p, from: to, c: me.sc }); }
      else {
        const num = biggest(tg.nums);
        tg.nums.splice(tg.nums.indexOf(num), 1);
        ev.push({ t: 'steal', p, from: to, c: num });
        addNumber(st, p, num, ev);
      }
      break;
    }
  }
}

// ================= BOT =================
// Bot chỉ dùng thông tin mà ghế đó được thấy (giống view): lá úp của người khác trong Sương Mù coi như chưa biết.
function unseenFor(st, seat) {
  const cnt = Array(13).fill(0);
  // Hết bài thì lần rút tới sẽ xáo chồng bỏ thành chồng mới.
  const pile = st.deck.length ? st.deck : st.discard;
  let total = pile.length;
  for (const c of pile) if (c.k === 'n') cnt[c.v]++;
  if (isFog(st)) st.players.forEach((pl, q) => { if (q !== seat) for (const c of pl.nums) { total++; if (c.k === 'n') cnt[c.v]++; } });
  return { cnt, total: Math.max(1, total) };
}
function bustRisk(st, seat) {
  const pl = st.players[seat], u = unseenFor(st, seat);
  return pl.nums.reduce((s, c) => s + (c.k === 'n' ? u.cnt[c.v] : 0), 0) / u.total;
}
const visScore = (st, viewer, q) => {
  const pl = st.players[q];
  if (isFog(st) && q !== viewer) return pl.nums.length * 6 + pl.mods.reduce((s, c) => s + (c.v === 'x2' ? 0 : c.v), 0);
  return roundScore(pl, st.event) || 0;
};

function botHit(st, seat, timeout) {
  if (timeout) return false;
  const pl = st.players[seat], risk = bustRisk(st, seat), cur = roundScore(pl, st.event);
  if (pl.sc) return risk < 0.7 || cur < 25;
  const others = seated(st).filter(q => q !== seat);
  const bestOther = Math.max(0, ...others.map(q => st.players[q].total));
  // Đủ điểm thắng và đang dẫn → dừng chắc ăn.
  if (pl.total + cur >= st.target && pl.total + cur > bestOther) return false;
  // Đối thủ sắp thắng mà mình còn xa → liều hơn.
  const desperate = bestOther >= st.target * 0.85 && pl.total + cur < bestOther;
  let gain = 6.5;
  if (st.event === 'odd') gain += 2;
  if (pl.nums.length === flipNeed(st.event) - 1) gain += flipBonus(st.event);
  if (pl.mods.some(c => c.v === 'x2')) gain += 5;
  const lose = st.event === 'mercy' ? cur / 2 : cur;
  const bold = (st.botBold[seat] || 1) * (desperate ? 1.8 : 1);
  return (1 - risk) * gain * bold > risk * lose;
}

function botTarget(st, d) {
  const p = d.seat, opts = d.opts, others = opts.filter(q => q !== p);
  if (opts.length === 1) return opts[0];
  const total = q => st.players[q].total + visScore(st, p, q);
  const byMax = (arr, f) => arr.reduce((a, b) => (f(b) > f(a) ? b : a));
  switch (d.card.v) {
    case 'freeze': {
      const me = st.players[p], cur = roundScore(me, st.event);
      if (opts.includes(p) && bustRisk(st, p) >= 0.3 && cur >= 18) return p;
      if (!others.length) return p;
      // Đóng băng người đang dẫn khi họ còn ít điểm vòng này; không thì người có ít điểm vòng nhất.
      const lead = byMax(others, total);
      if (visScore(st, p, lead) < 15) return lead;
      return byMax(others, q => -visScore(st, p, q));
    }
    case 'three': {
      if (!others.length) return p;
      const me = st.players[p];
      if (opts.includes(p) && me.nums.length <= 1 && !me.sc && others.every(q => st.players[q].nums.length >= 4)) return p;
      return byMax(others, q => bustRisk(st, q) * (visScore(st, p, q) + 10) + (st.players[q].sc ? -5 : 0));
    }
    case 'second': return byMax(others, q => -total(q));
    case 'swap': case 'magnet': {
      // Lá số lấy về: lớn nhất của họ — tránh người mà lá đó trùng với số mình đang có.
      const mine = new Set(st.players[p].nums.filter(c => c.k === 'n').map(c => c.v));
      const gainNum = q => {
        if (isFog(st)) return st.players[q].nums.length + Math.random();
        const b = biggest(st.players[q].nums);
        return b.k === 'n' && mine.has(b.v) ? -50 : numVal(b) + 1;
      };
      if (d.card.v === 'swap') return byMax(others, gainNum);
      const me = st.players[p];
      return byMax(others, q => {
        const o = st.players[q];
        if (o.mods.some(c => c.v === 'x2')) return 99;
        if (o.mods.length) return 20 + Math.max(...o.mods.map(c => c.v));
        if (o.sc && !me.sc) return 18;
        return gainNum(q);
      });
    }
  }
  return opts[0];
}

// Ai sẽ rút lá kế tiếp (để Tiên Tri quyết định chôn hay giữ).
function nextDrawer(st, p) {
  if (st.dealQ.length) return st.dealQ.find(q => st.players[q].status === 'in') ?? p;
  return st.turnDone ? nextFrom(st, st.turn, pl => pl.status === 'in') : st.turn;
}
function botPeek(st, d) {
  const top = d.see[0], q = nextDrawer(st, d.seat), pl = st.players[q];
  const bad = top.k === 'n' && pl && pl.nums.some(c => c.k === 'n' && c.v === top.v) && !pl.sc;
  return q === d.seat ? bad : !bad && (top.k === 'm' || top.k === 'w' || top.k === 'n');
}

function bot(st, seat, { timeout } = {}) {
  const d = st.pend[0];
  if (d) {
    if (d.see) return { type: 'peek', bury: timeout ? false : botPeek(st, d) };
    return { type: 'target', to: botTarget(st, d) };
  }
  return { type: botHit(st, seat, timeout) ? 'hit' : 'stay' };
}

// ================= INTERFACE =================
function create({ seats, opts }) {
  const chaos = !!opts.chaos;
  const { deck, nextId } = buildDeck(chaos);
  const players = seats.map(s => (s
    ? { status: 'in', kind: s.kind, name: s.name, total: 0, nums: [], mods: [], sc: null, bustCard: null, bonus: 0 }
    : { status: 'off', total: 0, nums: [], mods: [] }));
  const st = {
    phase: 'play', chaos, target: +opts.target || 200, round: 0, event: null, bag: [], deck, discard: [], nextId, players,
    pend: [], dealQ: [], turn: 0, turnDone: true, flip7: null, firstStay: null, winners: [], results: [],
    botBold: players.map(() => 0.75 + Math.random() * 0.6),
  };
  const sat = seated(st);
  st.dealer = sat[Math.floor(Math.random() * sat.length)];
  const ev = [{ t: 'start' }];
  startRound(st, ev);
  advance(st, ev);
  return { state: st, events: ev };
}

function act(st, seat, a, now) {
  if (st.phase === 'over') return { ok: false, err: 'Ván đã kết thúc' };
  if (!a || typeof a !== 'object') return { ok: false, err: 'Hành động không hợp lệ' };
  const ev = [];
  const d = st.pend[0];
  if (d) {
    if (d.seat !== seat) return { ok: false, err: 'Chờ người khác dùng lá hành động' };
    if (d.see) {
      if (a.type !== 'peek') return { ok: false, err: 'Hãy chọn giữ hay chôn lá trên cùng' };
      st.pend.shift();
      toDiscard(st, d.card);
      if (a.bury && st.deck.length > 1) st.deck.unshift(st.deck.pop());
      ev.push({ t: 'peeked', p: seat, bury: !!a.bury });
    } else {
      if (a.type !== 'target' || !d.opts.includes(a.to)) return { ok: false, err: 'Hãy chọn một người hợp lệ' };
      st.pend.shift();
      resolveAction(st, d, a.to, ev);
    }
  } else {
    if (seat !== st.turn) return { ok: false, err: 'Chưa đến lượt bạn' };
    const pl = st.players[seat];
    if (a.type === 'hit') {
      if (!drawTo(st, seat, ev, 'hit')) { pl.status = 'stay'; ev.push({ t: 'stay', p: seat, empty: true }); }
    } else if (a.type === 'stay') {
      pl.status = 'stay';
      let bonus = 0;
      if (st.event === 'early' && st.firstStay == null) { st.firstStay = seat; pl.bonus += 10; bonus = 10; }
      ev.push({ t: 'stay', p: seat, bonus });
    } else return { ok: false, err: 'Hành động không hợp lệ' };
    st.turnDone = true;
  }
  advance(st, ev);
  return { ok: true, events: ev };
}

function turn(st) {
  if (st.phase === 'over') return null;
  const d = st.pend[0];
  if (d) {
    if (d.opts && d.opts.length === 1) return { seat: d.seat, auto: { type: 'target', to: d.opts[0] }, autoDelay: 1100 };
    return { seat: d.seat };
  }
  return { seat: st.turn };
}

const HIDDEN = c => (c ? { id: c.id, k: 'h' } : c);

function view(st, seat) {
  const fog = isFog(st);
  const u = unseenFor(st, seat);
  return {
    ...st,
    deck: undefined, discard: undefined, bag: undefined, botBold: undefined,
    ask: st.phase === 'play' ? (st.pend.length ? st.pend[0].seat : st.turn) : null,
    deckN: st.deck.length, discardN: st.discard.length, unseen: u.cnt, unseenTotal: u.total,
    players: st.players.map((pl, q) => (fog && q !== seat && pl.status !== 'off' ? { ...pl, nums: pl.nums.map(HIDDEN) } : pl)),
    pend: st.pend.map(d => (d.see && d.seat !== seat ? { ...d, see: undefined, n: d.see.length } : d)),
  };
}

function viewEvents(events, seat) {
  return events.map(e => {
    if (e.t === 'draw' && e.fog && e.p !== seat && (e.c.k === 'n' || e.c.k === 'w')) return { ...e, c: HIDDEN(e.c) };
    if (e.t === 'swap' && e.fog && seat !== e.p && seat !== e.to) return { ...e, give: HIDDEN(e.give), take: HIDDEN(e.take) };
    return e;
  });
}

export default { create, act, isOver: st => st.phase === 'over', turn, bot, animDuration, view, viewEvents };
