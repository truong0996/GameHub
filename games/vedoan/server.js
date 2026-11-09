// 🎨 Vẽ Đoán — luật (server giữ trạng thái). Game real-time: hub gọi tick() 10 lần/giây, mọi hẹn giờ nằm trong state.
// Pha mỗi lượt: choose (hoạ sĩ chọn 1/3 từ) → draw (vẽ + đoán) → reveal (lộ đáp án, thả tim) → lượt kế / over.
// Nét vẽ: hoạ sĩ gửi { type:'ink', ops } (quiet) → gom vào st.out, tick sau phát thành sự kiện 'ink' có số thứ tự q.
// State gửi xuống KHÔNG kèm cả tranh, trừ "khung chốt" (st.kf, ~4s một lần hoặc khi có người xin 'sync') và ngoài pha vẽ.
import { EVENTS, EVENT_CHANCE, ITEMS, SMOKE_MS, REACTS, REACT_PTS, DIFF, GOLD_MULT, TOPICS, T, applyOps, judge, leaks, isLetter } from './data.js';
import { wordsOf } from './server-words.js';

const KF_MS = 4000, MAX_OPS = 400, BOT_KEY = 0x5a5a;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const r5 = x => Math.max(5, Math.round(x / 5) * 5);
const clamp01 = x => Math.max(0, Math.min(1, x));
const POOL = new Map();
const pool = pack => { if (!POOL.has(pack)) POOL.set(pack, wordsOf(pack)); return POOL.get(pack); };
const guessers = st => st.order.filter(p => !st.drawers.includes(p));
const letterIdx = w => [...w].map((c, i) => (isLetter(c) ? i : -1)).filter(i => i >= 0);

function create({ seats, opts, now }) {
  const players = seats.map(s => (s ? { active: true, kind: s.kind, name: s.name, score: 0, gain: 0, firsts: 0, fans: 0, hits: 0,
    peek: [], seeTopic: false, used: {}, bet: false, lg: 0 } : { active: false }));
  const order = players.map((p, i) => (p.active ? i : -1)).filter(i => i >= 0);
  const rounds = +opts.rounds || 3;
  const st = {
    o: { pack: opts.pack || 'all', rounds, time: (+opts.time || 80) * 1000, events: !!opts.events, items: !!opts.items, specials: !!opts.specials, vote: !!opts.vote },
    players, order, n: -1, round: 0, total: order.length * rounds, phase: 'intro', until: now + T.intro, now,
    drawers: [], choices: [], wi: null, rev: [], hintAt: [], ev: null, lastEv: null, mult: 1, dur: 0, drawAt: 0, firstInk: 0,
    ink: { items: [], open: {} }, inkSeq: 0, rules: {}, kf: false, kfAt: 0, out: [],
    guessed: [], bots: {}, botPickAt: 0, botReact: [], smoke: null, reacts: {}, gal: [], galCur: -1, used: [], bd: null, allIn: 0, why: null,
  };
  return { state: st, events: [{ t: 'start' }] };
}

// ---------- lượt ----------
function makeChoices(st, bot) {
  let all = pool(st.o.pack);
  if (bot) all = all.filter(x => x.e);
  let free = all.filter(x => !st.used.includes(x.w));
  if (free.length < 3) free = all.slice();
  shuffle(free);
  let ch;
  if (st.o.specials) {
    // Mỗi độ khó một từ (thiếu thì lấy từ bất kỳ), xếp Dễ → Khó.
    ch = [];
    for (const d of [1, 2, 3]) { const x = free.find(y => y.d === d && !ch.includes(y)); if (x) ch.push(x); }
    for (const x of free) { if (ch.length >= 3) break; if (!ch.includes(x)) ch.push(x); }
    ch.sort((a, b) => a.d - b.d);
  } else ch = free.slice(0, 3);
  ch = ch.map(x => ({ ...x }));
  if (st.o.specials && Math.random() < 0.25) pick(ch).g = true;
  return ch;
}

function resetTurn(st) {
  for (const pl of st.players) if (pl.active) Object.assign(pl, { gain: 0, peek: [], seeTopic: false, used: {}, bet: false });
  Object.assign(st, { ink: { items: [], open: {} }, inkSeq: 0, rules: {}, out: [], guessed: [], bots: {}, botReact: [], smoke: null, reacts: {},
    bd: null, wi: null, rev: [], hintAt: [], allIn: 0, why: null, firstInk: 0, galCur: -1, choices: [], kfAt: 0 });
}

function nextTurn(st, now, out) {
  st.n++;
  resetTurn(st);
  if (st.n >= st.total) {
    st.phase = 'over'; st.until = 0; st.drawers = []; st.ev = null;
    out.push({ t: 'over' });
    return;
  }
  const len = st.order.length, d = st.order[st.n % len], bot = st.players[d].kind === 'bot';
  st.round = Math.floor(st.n / len) + 1;
  st.drawers = [d];
  // Song Hoạ: hai người thật cùng vẽ một từ (bàn ≥3 người để còn người đoán).
  if (st.o.specials && !bot && len >= 3 && Math.random() < 0.2) {
    const mates = st.order.filter(p => p !== d && st.players[p].kind === 'human');
    if (mates.length) st.drawers.push(pick(mates));
  }
  st.ev = null;
  if (st.o.events && st.n > 0 && Math.random() < EVENT_CHANCE) {
    const keys = Object.keys(EVENTS).filter(k => k !== st.lastEv && (!bot || EVENTS[k].bot));
    st.ev = st.lastEv = pick(keys);
  }
  st.choices = makeChoices(st, bot);
  st.phase = 'choose';
  st.until = now + T.choose;
  st.botPickAt = bot ? now + rnd(1200, 2600) : 0;
  out.push({ t: 'turn', n: st.n, round: st.round, drawers: st.drawers.slice(), ev: st.ev });
}

function pickWord(st, i, now, out) {
  const wi = st.choices[i];
  st.wi = wi;
  st.used.push(wi.w);
  const E = st.ev ? EVENTS[st.ev] : null;
  st.phase = 'draw';
  st.dur = Math.round(st.o.time * (E && E.time ? E.time : 1));
  st.drawAt = now;
  st.until = now + st.dur;
  // Hệ số dồn (độ khó × Từ Vàng × biến cố) tối đa ×3 để một lượt may mắn không quyết định cả ván.
  st.mult = Math.min(3, (st.o.specials ? DIFF[wi.d].m : 1) * (wi.g ? GOLD_MULT : 1) * (E ? E.m : 1));
  for (const p of st.drawers) st.rules[p] = E && E.rule ? { ...E.rule, ...(E.rule.strokes ? { left: E.rule.strokes } : {}) } : {};
  // Gợi ý chữ cái: lộ dần lúc 50% / 68% / 84% thời gian, không bao giờ lộ hết.
  const L = letterIdx(wi.w).length, nh = L <= 2 ? 0 : L <= 4 ? 1 : L <= 7 ? 2 : 3;
  st.hintAt = [0.5, 0.68, 0.84].slice(0, nh).map(f => now + f * st.dur);
  if (st.players[st.drawers[0]].kind === 'bot') {
    // Bot vẽ: client phác viền emoji trong khoảng [t0, t0+a], tô màu tới t0+b.
    st.bd = { k: [...wi.e].map(c => c.codePointAt(0) ^ BOT_KEY), t0: now + 600, a: Math.round(st.dur * 0.5), b: Math.round(st.dur * 0.78) };
    st.firstInk = now + 600;
  }
  planBots(st);
  out.push({ t: 'draw', p: st.drawers[0], ev: st.ev, dur: st.dur, d: wi.d, g: !!wi.g });
}

// Bot đoán: không nhìn tranh được nên "đoán ra" sau một quãng ngẫu nhiên tính từ lúc tranh có nét đầu tiên, khó thì lâu & hay trượt.
function planBots(st) {
  const botDraw = !!st.bd, d = st.wi.d;
  // Bot không nhìn được tranh người vẽ nên chơi "vừa sức": hay đoán ra ở nửa sau, khó thì thường chịu thua — để người thật vẫn có cửa.
  const pOk = Math.min(0.9, { 1: 0.78, 2: 0.6, 3: 0.42 }[d] + (botDraw ? 0.1 : 0));
  const span = { 1: [0.22, 0.75], 2: [0.32, 0.88], 3: [0.42, 0.97] }[d];
  for (const p of guessers(st)) {
    if (st.players[p].kind !== 'bot') continue;
    const ok = Math.random() < pOk, f = rnd(...span);
    const wrong = Array.from({ length: Math.floor(rnd(0, 2.7)) }, () => rnd(0.04, ok ? f : 0.97)).sort((a, b) => a - b);
    st.bots[p] = { f: ok ? f : null, wrong };
  }
}
function wrongWord(st) {
  const ws = pool(st.o.pack);
  for (let i = 0; i < 20; i++) { const x = pick(ws).w; if (!judge(x, st.wi.w)) return x; }
  return '???';
}

function endDraw(st, now, why, out) {
  st.phase = 'reveal';
  st.why = why;
  st.until = now + (st.o.vote ? T.revealVote : T.reveal);
  st.smoke = null;
  if (st.o.vote) {
    const r = {};
    for (const k of Object.values(st.reacts)) r[k] = (r[k] || 0) + 1;
    st.gal.push({ d: st.drawers.slice(), w: st.wi.w, ev: st.ev, e: st.bd ? st.wi.e : null,
      items: st.bd ? [] : st.ink.items.map(({ at, ...it }) => it), r });
    st.galCur = st.gal.length - 1;
    for (const p of st.order) {
      if (st.drawers.includes(p) || st.reacts[p] || st.players[p].kind !== 'bot' || Math.random() > 0.55) continue;
      st.botReact.push({ p, at: now + rnd(700, 4500), r: pick(Object.keys(REACTS)) });
    }
  }
  out.push({ t: 'reveal', w: st.wi.w, why, drawers: st.drawers.slice() });
}

function guessRight(st, p, now, out) {
  const pl = st.players[p], k = st.guessed.length, ng = guessers(st).length;
  const base = (50 + 250 * clamp01((st.until - now) / st.dur) + (k === 0 ? 30 : 0)) * st.mult;
  const pts = r5(base * (pl.bet ? 2 : 1));
  pl.score += pts; pl.gain += pts; pl.hits++;
  if (k === 0) pl.firsts++;
  st.guessed.push(p);
  // Hoạ sĩ ăn 75% điểm gốc chia đều theo số người đoán (bàn 2 người mà ăn bằng nhau thì ván nào cũng hoà).
  const dp = r5(base * 0.75 / ng);
  for (const d of st.drawers) { st.players[d].score += dp; st.players[d].gain += dp; }
  out.push({ t: 'hit', p, pts, k, bet: pl.bet, dp });
  if (st.guessed.length >= ng && !st.allIn) st.allIn = now + T.allIn;
}

// ---------- hành động ----------
function act(st, seat, a, now) {
  st.now = now;
  st.kf = false;
  const pl = st.players[seat];
  if (!pl || !pl.active) return { ok: false, err: 'Bạn không chơi ván này' };
  if (!a || typeof a !== 'object') return { ok: false, err: 'Hành động lạ' };
  switch (a.type) {
    case 'ink': {
      // Nét gửi trễ lúc vừa hết giờ thì lặng lẽ bỏ qua, khỏi báo lỗi.
      if (st.phase !== 'draw' || !st.drawers.includes(seat)) return { ok: true, quiet: true };
      if (!Array.isArray(a.ops) || a.ops.length > MAX_OPS) return { ok: false, err: 'Dữ liệu nét vẽ hỏng' };
      const err = applyOps(st.ink, seat, a.ops, now, st.rules[seat]);
      if (err) { st.kfAt = 0; return { ok: false, err }; }   // có thể đã áp một phần → tick sau gửi khung chốt
      if (!st.firstInk) st.firstInk = now;
      st.out.push({ t: 'ink', p: seat, q: ++st.inkSeq, ops: a.ops });
      return { ok: true, quiet: true };
    }
    case 'sync':   // client lệch số thứ tự nét → xin khung chốt ở tick sau
      st.kfAt = 0;
      return { ok: true, quiet: true };
    case 'pick': {
      if (st.phase !== 'choose' || seat !== st.drawers[0]) return { ok: false, err: 'Chưa tới lượt bạn chọn từ' };
      const i = +a.i;
      if (!(i >= 0 && i < st.choices.length)) return { ok: false, err: 'Từ không hợp lệ' };
      const out = [];
      pickWord(st, i, now, out);
      return { ok: true, events: out };
    }
    case 'guess': return guess(st, seat, pl, a, now);
    case 'buy': return buy(st, seat, pl, a, now);
    case 'react': {
      if (!st.o.vote) return { ok: false, err: 'Ván này không bật bình chọn' };
      if (st.phase !== 'draw' && st.phase !== 'reveal') return { ok: false, err: 'Chưa có tranh để thả' };
      if (st.drawers.includes(seat)) return { ok: false, err: 'Không tự thả tim cho mình được 😄' };
      if (!REACTS[a.r]) return { ok: false, err: 'Cảm xúc lạ' };
      if (st.reacts[seat]) return { ok: false, err: 'Bạn đã thả cho bức này rồi' };
      return { ok: true, events: react(st, seat, a.r) };
    }
  }
  return { ok: false, err: 'Hành động lạ' };
}

function react(st, p, r) {
  st.reacts[p] = r;
  for (const d of st.drawers) { const x = st.players[d]; x.score += REACT_PTS; x.gain += REACT_PTS; x.fans++; }
  if (st.phase === 'reveal' && st.galCur >= 0) { const g = st.gal[st.galCur].r; g[r] = (g[r] || 0) + 1; }
  return [{ t: 'react', p, r }];
}

function guess(st, seat, pl, a, now) {
  const text = String(a.text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!text) return { ok: false, err: 'Gõ gì đó đã' };
  if (now - pl.lg < 350) return { ok: false, err: 'Gõ chậm lại chút!' };
  pl.lg = now;
  if (st.phase !== 'draw') return { ok: true, events: [{ t: 'msg', p: seat, text }] };
  const w = st.wi.w;
  if (st.drawers.includes(seat) || st.guessed.includes(seat)) {
    // Hoạ sĩ + người đã đoán ra nói chuyện riêng với nhau, cấm gõ đáp án.
    if (leaks(text, w)) return { ok: false, err: 'Suỵt! Đừng lộ đáp án 🤫' };
    return { ok: true, events: [{ t: 'msg', p: seat, text, sec: true }] };
  }
  const j = judge(text, w);
  const out = [];
  if (j === 'hit') guessRight(st, seat, now, out);
  else {
    out.push({ t: 'msg', p: seat, text });
    if (j === 'near') out.push({ t: 'near', p: seat });
  }
  return { ok: true, events: out };
}

function buy(st, seat, pl, a, now) {
  if (!st.o.items) return { ok: false, err: 'Ván này không bật vật phẩm' };
  const it = ITEMS[a.k];
  if (!it) return { ok: false, err: 'Vật phẩm lạ' };
  if (st.phase !== 'draw') return { ok: false, err: 'Chỉ dùng được lúc đang vẽ' };
  if (st.drawers.includes(seat)) return { ok: false, err: 'Hoạ sĩ không dùng vật phẩm' };
  if (st.guessed.includes(seat)) return { ok: false, err: 'Bạn đoán ra rồi mà!' };
  if (pl.used[a.k]) return { ok: false, err: `Mỗi lượt chỉ dùng ${it.name} 1 lần` };
  if (pl.score < it.cost) return { ok: false, err: `Cần ${it.cost} điểm để dùng ${it.name}` };
  if (a.k === 'peek') {
    const hidden = letterIdx(st.wi.w).filter(i => !st.rev.includes(i) && !pl.peek.includes(i));
    if (hidden.length <= 1) return { ok: false, err: 'Chỉ còn 1 chữ — tự đoán đi nào!' };
    pl.peek.push(pick(hidden));
  } else if (a.k === 'topic') pl.seeTopic = true;
  else if (a.k === 'smoke') {
    if (st.smoke && st.smoke.until > now) return { ok: false, err: 'Khói vẫn đang bay' };
    st.smoke = { by: seat, until: now + SMOKE_MS };
  } else if (a.k === 'bet') pl.bet = true;
  pl.used[a.k] = true;
  pl.score -= it.cost;
  pl.gain -= it.cost;
  return { ok: true, events: [{ t: 'buy', p: seat, k: a.k }] };
}

// ---------- đồng hồ ----------
function tick(st, now) {
  st.now = now;
  st.kf = false;
  const out = st.out;
  st.out = [];
  let changed = false;
  if (st.phase === 'intro') {
    if (now >= st.until) nextTurn(st, now, out);
  } else if (st.phase === 'choose') {
    // Bot chọn sau 1–2.5s; người hết giờ thì máy chọn giúp.
    if ((st.botPickAt && now >= st.botPickAt) || now >= st.until) pickWord(st, Math.floor(Math.random() * st.choices.length), now, out);
  } else if (st.phase === 'draw') {
    while (st.hintAt.length && now >= st.hintAt[0]) {
      st.hintAt.shift();
      const hidden = letterIdx(st.wi.w).filter(i => !st.rev.includes(i));
      if (hidden.length > 1) { st.rev.push(pick(hidden)); out.push({ t: 'hint' }); }
    }
    if (st.firstInk && now >= st.firstInk) {
      const span = st.drawAt + st.dur - st.firstInk;
      for (const [p, b] of Object.entries(st.bots)) {
        const s = +p;
        if (st.guessed.includes(s)) continue;
        while (b.wrong.length && now >= st.firstInk + b.wrong[0] * span) {
          b.wrong.shift();
          out.push({ t: 'msg', p: s, text: wrongWord(st) });
        }
        if (b.f != null && now >= st.firstInk + b.f * span) guessRight(st, s, now, out);
      }
    }
    if (st.smoke && now >= st.smoke.until) { st.smoke = null; changed = true; }
    const human = st.players[st.drawers[0]].kind === 'human';
    if (human && !st.firstInk && now >= st.drawAt + Math.max(T.idleMin, T.idleFrac * st.dur)) endDraw(st, now, 'idle', out);
    else if (st.allIn && now >= st.allIn) endDraw(st, now, 'all', out);
    else if (now >= st.until) endDraw(st, now, 'time', out);
    else if (st.inkSeq && now - st.kfAt >= KF_MS) { st.kf = true; st.kfAt = now; changed = true; }
  } else if (st.phase === 'reveal') {
    for (const x of st.botReact.filter(x => now >= x.at)) {
      st.botReact.splice(st.botReact.indexOf(x), 1);
      if (!st.reacts[x.p]) out.push(...react(st, x.p, x.r));
    }
    if (now >= st.until) nextTurn(st, now, out);
  } else return null;
  return out.length || changed ? { events: out, changed: true } : null;
}

// ---------- che thông tin ----------
const seesWord = (st, seat) => st.phase === 'reveal' || st.phase === 'over' || st.drawers.includes(seat) || st.guessed.includes(seat);

function view(st, seat) {
  const me = seat >= 0 && st.players[seat] && st.players[seat].active ? st.players[seat] : null;
  const wi = st.wi, sees = seesWord(st, seat);
  const counts = {};
  for (const r of Object.values(st.reacts)) counts[r] = (counts[r] || 0) + 1;
  return {
    phase: st.phase, o: st.o, n: st.n, total: st.total, round: st.round, now: st.now, until: st.until, dur: st.dur, drawAt: st.drawAt,
    order: st.order, drawers: st.drawers, guessed: st.guessed, ev: st.ev, mult: st.mult, why: st.why,
    players: st.players.map(p => (p.active ? { active: true, kind: p.kind, name: p.name, score: p.score, gain: p.gain, firsts: p.firsts,
      fans: p.fans, hits: p.hits, bet: p.bet } : { active: false })),
    me: me ? { peek: me.peek, seeTopic: me.seeTopic, used: me.used } : null,
    word: wi && sees ? wi.w : null,
    mask: wi ? [...wi.w].map((c, i) => (sees || !isLetter(c) || st.rev.includes(i) || (me && me.peek.includes(i)) ? c : '_')) : null,
    d: wi ? wi.d : null, g: wi ? !!wi.g : false,
    topic: wi && (sees || (me && me.seeTopic)) ? TOPICS[wi.t] : null,
    choices: st.phase === 'choose' && seat === st.drawers[0] ? st.choices.map(c => ({ w: c.w, d: c.d, g: !!c.g })) : null,
    left: st.rules[seat] && st.rules[seat].left != null ? st.rules[seat].left : null,
    inkSeq: st.inkSeq, ink: st.kf || st.phase !== 'draw' ? st.ink.items : null,
    bd: st.bd, smoke: st.smoke, reacts: counts, myReact: seat >= 0 ? st.reacts[seat] || null : null,
    gal: st.phase === 'over' ? st.gal : null,
  };
}

function viewEvents(events, seat, st) {
  const inside = st.drawers.includes(seat) || st.guessed.includes(seat) || st.phase !== 'draw';
  return events.filter(e => (e.t === 'msg' && e.sec ? inside : e.t === 'near' ? e.p === seat : true));
}

// Trong lúc vẽ: hoạ sĩ + người đã đoán ra chỉ chat được với nhau (khỏi lộ đáp án).
function chatTo(st, seat) {
  if (st.phase !== 'draw' || seat < 0 || !(st.drawers.includes(seat) || st.guessed.includes(seat))) return undefined;
  return { to: [...st.drawers, ...st.guessed], tag: '🤫' };
}

const result = st => st.order.map(p => ({ p, s: st.players[p].score })).sort((a, b) => b.s - a.s);

export default {
  tickRate: 10,
  create,
  act,
  tick,
  isOver: st => st.phase === 'over',
  result,
  view,
  viewEvents,
  chatTo,
};
