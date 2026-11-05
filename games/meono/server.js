// 💣 Mèo Nổ — luật + bot (chạy trên server, KHÔNG gửi cho client vì chứa chồng bài và bài trên tay mọi người).
// Hàm thuần: thời gian lấy từ tham số `now`. Xem "Game server interface" trong CLAUDE.md.
//
// Vòng đời một lượt:  play → (đánh lá) → react (cửa sổ "Không!") → hiệu ứng → play ... → draw → lượt kế.
// Pha phụ: favor (người bị Xin Bài chọn lá đưa), bury (nhét Mèo Nổ/Mèo Hẹn Giờ lại), alter (Cải Số).
import { CARDS, isKiller, SINGLE, TARGETED, comboKind, animDuration } from './cards.js';

const SCALE = { 2: 0.6, 3: 0.75, 4: 0.9, 5: 1, 6: 1.15 };
const BASE = { attack: 4, skip: 4, favor: 4, shuffle: 4, future: 5, nope: 5, taco: 4, melon: 4, potato: 4, beard: 4, rainbow: 4 };
const CHAOS = { swap: 2, alter: 3, bottom: 3, reverse: 3, target: 3, feral: 4 };
// Giá trị bài theo con mắt bot: thấp = sẵn sàng cho đi.
const VALUE = { taco: 1, melon: 1, potato: 1, beard: 1, rainbow: 1, feral: 2, shuffle: 3, future: 4, favor: 4, bottom: 5, reverse: 5,
  alter: 6, swap: 6, target: 7, skip: 7, attack: 8, catomic: 8, nope: 9, defuse: 20 };

const rnd = n => (Math.random() * n) | 0;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const take = (arr, c) => { const i = arr.indexOf(c); if (i < 0) return false; arr.splice(i, 1); return true; };
const fail = err => ({ ok: false, err });
const name = (st, p) => st.players[p].name;

// ---------- tạo ván ----------
function create({ seats, opts }) {
  const n = seats.filter(Boolean).length, chaos = !!opts.chaos, f = SCALE[n] || 1;
  const deck = [];
  const add = (c, k) => { for (let i = 0; i < k; i++) deck.push(c); };
  for (const [c, k] of Object.entries(BASE)) add(c, Math.max(2, Math.round(k * f)));
  if (chaos) { for (const [c, k] of Object.entries(CHAOS)) add(c, Math.max(1, Math.round(k * f))); add('catomic', 1); }
  shuffle(deck);
  const players = seats.map(s => (s ? { active: true, kind: s.kind, name: s.name, alive: true, hand: [], know: [] } : { active: false }));
  for (const pl of players) if (pl.active) { pl.hand = deck.splice(0, opts.hand); pl.hand.push('defuse'); }
  add('defuse', n <= 3 ? 2 : 1);
  if (chaos) { add('bomb', Math.max(1, n - 2)); add('timebomb', 1); } else add('bomb', n - 1);
  shuffle(deck);
  const seatsIn = players.map((p, i) => (p.active ? i : -1)).filter(i => i >= 0);
  const st = {
    chaos, nopeMs: opts.nopeMs, players, deck, discard: [], turn: seatsIn[rnd(seatsIn.length)], dir: 1, turnsLeft: 1, attacked: false,
    phase: 'play', react: null, favor: null, bury: null, alter: null, tbArmed: false, dead: [], winner: null, seq: 0,
  };
  return { state: st, events: [{ t: 'start' }, { t: 'turn', p: st.turn, turns: 1 }] };
}

// ---------- tiện ích lượt ----------
const aliveSeats = st => st.players.map((p, i) => (p.active && p.alive ? i : -1)).filter(i => i >= 0);
function nextAlive(st, from) {
  const L = st.players.length;
  let i = from;
  for (let k = 0; k < L; k++) {
    i = (i + st.dir + L) % L;
    if (st.players[i].active && st.players[i].alive) return i;
  }
  return from;
}
function startTurn(st, p, turns, attacked, ev) {
  Object.assign(st, { turn: p, turnsLeft: turns, attacked, phase: 'play' });
  ev.push({ t: 'turn', p, turns });
}
function endOneTurn(st, ev) {
  st.phase = 'play';
  if (--st.turnsLeft > 0) ev.push({ t: 'turn', p: st.turn, turns: st.turnsLeft });
  else startTurn(st, nextAlive(st, st.turn), 1, false, ev);
}
// Tấn Công/Chỉ Điểm: người bị tấn công đánh tiếp thì chuyển (số lượt còn lại + 2).
function passAttack(st, from, to, kind, ev) {
  const turns = (st.attacked ? st.turnsLeft : 0) + 2;
  ev.push({ t: 'attack', p: from, to, turns, kind });
  startTurn(st, to, turns, true, ev);
}
const validTarget = (st, me, t) => Number.isInteger(t) && t !== me && st.players[t] && st.players[t].active && st.players[t].alive;

// ---------- chồng bài + "trí nhớ" (know = các lá trên cùng mà người đó chắc chắn biết) ----------
function eachPlayer(st, fn) { st.players.forEach((pl, i) => { if (pl.active) fn(pl, i); }); }
function drawFrom(st, bottom) {
  const N = st.deck.length;
  const c = bottom ? st.deck.pop() : st.deck.shift();
  eachPlayer(st, pl => { if (!bottom) pl.know.shift(); else if (pl.know.length >= N) pl.know.pop(); });
  return c;
}
function insertCard(st, p, c, pos, isPublic) {
  st.deck.splice(pos, 0, c);
  eachPlayer(st, (pl, i) => {
    if (i === p || isPublic) { if (pos <= pl.know.length) pl.know.splice(pos, 0, c); }
    else pl.know = [];
  });
}

function drawCard(st, p, bottom, ev) {
  const pl = st.players[p];
  const c = drawFrom(st, bottom);
  ev.push({ t: 'draw', p, card: c, bottom: !!bottom });
  if (c === 'timebomb') {
    if (st.tbArmed) return explode(st, p, c, ev);
    st.tbArmed = true;
    ev.push({ t: 'arm', p });
    st.phase = 'bury'; st.bury = { p, card: c };
    return;
  }
  if (c === 'bomb') {
    if (!take(pl.hand, 'defuse')) return explode(st, p, c, ev);
    st.discard.push('defuse');
    ev.push({ t: 'defuse', p });
    st.phase = 'bury'; st.bury = { p, card: c };
    return;
  }
  pl.hand.push(c);
  endOneTurn(st, ev);
}

function explode(st, p, c, ev) {
  const pl = st.players[p];
  pl.alive = false;
  st.dead.push(p);
  if (c === 'timebomb') st.tbArmed = false;
  // 👻 Hỗn Loạn: hồn ma giữ lại các lá "Không!" để phá đám người còn sống.
  const keep = st.chaos ? pl.hand.filter(x => x === 'nope') : [];
  st.discard.push(...pl.hand.filter(x => !keep.includes(x)));
  pl.hand = keep;
  pl.know = [];
  ev.push({ t: 'boom', p, card: c, ghost: keep.length });
  const left = aliveSeats(st);
  if (left.length <= 1) {
    st.phase = 'over'; st.winner = left[0]; st.react = st.favor = st.bury = st.alter = null;
    ev.push({ t: 'win', p: st.winner });
    return;
  }
  startTurn(st, nextAlive(st, p), 1, false, ev);
}

// ---------- cửa sổ "Không!" ----------
function openReact(st, info, now, ev) {
  st.phase = 'react';
  st.react = { ...info, nopes: [], id: ++st.seq };
  setWindow(st, now, ev);
}
function setWindow(st, now, ev) {
  st.react.until = now + animDuration(ev) + st.nopeMs;
  st.react.bot = botNopeDecision(st);
}
// Ai bị thiệt nếu lá này có hiệu lực.
function victimsOf(st, r) {
  if (r.kind === 'attack' || r.kind === 'catomic') return [nextAlive(st, r.p)];
  if (r.target != null) return [r.target];
  return [];
}

function resolve(st, r, ev) {
  const p = r.p, pl = st.players[p], tg = r.target != null ? st.players[r.target] : null;
  switch (r.kind) {
    case 'attack': return passAttack(st, p, nextAlive(st, p), 'attack', ev);
    case 'target': return passAttack(st, p, r.target, 'target', ev);
    case 'skip': ev.push({ t: 'skip', p }); return endOneTurn(st, ev);
    case 'reverse': st.dir = -st.dir; ev.push({ t: 'reverse', p, dir: st.dir }); return endOneTurn(st, ev);
    case 'shuffle':
      shuffle(st.deck);
      eachPlayer(st, x => { x.know = []; });
      return ev.push({ t: 'shuffle', p });
    case 'future': {
      const top = st.deck.slice(0, 3);
      pl.know = top.concat(pl.know.slice(top.length));
      return ev.push({ t: 'future', p, cards: top });
    }
    case 'alter':
      st.phase = 'alter';
      st.alter = { p, cards: st.deck.slice(0, 3) };
      return ev.push({ t: 'alter', p });
    case 'bottom': return drawCard(st, p, true, ev);
    case 'catomic': {
      const ks = shuffle(st.deck.filter(isKiller)), rest = shuffle(st.deck.filter(c => !isKiller(c)));
      st.deck = ks.concat(rest);
      eachPlayer(st, x => { x.know = ks.slice(); });
      ev.push({ t: 'catomic', p, k: ks.length });
      return endOneTurn(st, ev);
    }
    case 'favor':
      if (!tg.hand.length) return ev.push({ t: 'favorEmpty', p, from: r.target });
      st.phase = 'favor';
      st.favor = { from: r.target, to: p };
      return ev.push({ t: 'favorAsk', from: r.target, to: p });
    case 'swap':
      [pl.hand, tg.hand] = [tg.hand, pl.hand];
      return ev.push({ t: 'swap', a: p, b: r.target });
    case 'pair':
    case 'triple': {
      const c = r.kind === 'pair' ? tg.hand[rnd(tg.hand.length)] : (tg.hand.includes(r.name) ? r.name : null);
      if (!c) return ev.push({ t: 'stealFail', from: r.target, to: p, name: r.name || null });
      take(tg.hand, c);
      pl.hand.push(c);
      return ev.push({ t: 'steal', from: r.target, to: p, card: c, named: r.kind === 'triple' });
    }
    case 'five': {
      const i = st.discard.lastIndexOf(r.take);
      if (i < 0) return ev.push({ t: 'takeFail', p, card: r.take });
      st.discard.splice(i, 1);
      pl.hand.push(r.take);
      return ev.push({ t: 'take', p, card: r.take });
    }
  }
}

// ---------- hành động ----------
function act(st, seat, a, now) {
  if (st.phase === 'over') return fail('Ván đã kết thúc');
  const pl = st.players[seat];
  if (!pl || !pl.active) return fail('Bạn không ở trong ván này');
  a = a || {};
  const ev = [];
  const myTurn = () => {
    if (st.phase === 'react') return 'Chờ xem có ai hô "Không!" đã...';
    if (st.phase !== 'play' || seat !== st.turn) return 'Chưa tới lượt bạn';
    return null;
  };

  switch (a.type) {
    case 'draw': {
      const e = myTurn(); if (e) return fail(e);
      drawCard(st, seat, false, ev);
      break;
    }
    case 'play': {
      const e = myTurn(); if (e) return fail(e);
      const c = a.card;
      if (!SINGLE.includes(c)) return fail('Lá này không đánh lẻ được');
      if (!pl.hand.includes(c)) return fail('Bạn không có lá này');
      let target = null;
      if (TARGETED.includes(c)) {
        target = a.target;
        if (!validTarget(st, seat, target)) return fail('Hãy chọn một người chơi còn sống');
        if (c === 'favor' && !st.players[target].hand.length) return fail(`${name(st, target)} không còn lá nào`);
      }
      take(pl.hand, c);
      st.discard.push(c);
      ev.push({ t: 'play', p: seat, cards: [c], kind: c, target });
      openReact(st, { p: seat, kind: c, cards: [c], target }, now, ev);
      break;
    }
    case 'combo': {
      const e = myTurn(); if (e) return fail(e);
      const cards = Array.isArray(a.cards) ? a.cards.map(String) : [];
      const kind = comboKind(cards);
      if (!kind) return fail('Bộ bài không hợp lệ: cần 2 hoặc 3 lá giống nhau, hoặc 5 lá khác loại');
      const left = pl.hand.slice();
      if (!cards.every(c => take(left, c))) return fail('Bạn không có đủ các lá này');
      const info = { p: seat, kind, cards };
      if (kind === 'five') {
        if (!CARDS[a.take] || (!st.discard.includes(a.take) && !cards.includes(a.take))) return fail('Chồng bài bỏ không có lá đó');
        info.take = a.take;
      } else {
        if (!validTarget(st, seat, a.target)) return fail('Hãy chọn một người chơi còn sống');
        if (!st.players[a.target].hand.length) return fail(`${name(st, a.target)} không còn lá nào`);
        info.target = a.target;
        if (kind === 'triple') {
          if (!CARDS[a.name] || isKiller(a.name)) return fail('Hãy chọn tên lá muốn đòi');
          info.name = a.name;
        }
      }
      pl.hand = left;
      st.discard.push(...cards);
      ev.push({ t: 'play', p: seat, cards, kind, target: info.target ?? null, name: info.name || null, take: info.take || null });
      openReact(st, info, now, ev);
      break;
    }
    case 'nope': {
      if (st.phase !== 'react') return fail('Muộn rồi — không có gì để "Không!" lúc này');
      const r = st.react;
      if (!pl.alive && !st.chaos) return fail('Bạn đã nổ rồi');
      if (!pl.hand.includes('nope')) return fail('Bạn không có lá Không!');
      if (r.nopes.at(-1) === seat) return fail('Bạn vừa hô "Không!" rồi');
      if (!r.nopes.length && seat === r.p) return fail('Không tự chặn lá của chính mình được');
      take(pl.hand, 'nope');
      st.discard.push('nope');
      r.nopes.push(seat);
      ev.push({ t: 'nope', p: seat, n: r.nopes.length, ghost: !pl.alive });
      setWindow(st, now, ev);
      break;
    }
    case 'resolve': {
      if (st.phase !== 'react' || seat !== st.react.p) return fail('Không hợp lệ');
      if (now < st.react.until - 150) return fail('Còn đang chờ mọi người hô "Không!"');
      const r = st.react;
      st.react = null;
      st.phase = 'play';
      if (r.nopes.length % 2) ev.push({ t: 'noped', p: r.p, kind: r.kind, cards: r.cards });
      else resolve(st, r, ev);
      break;
    }
    case 'give': {
      if (st.phase !== 'favor' || seat !== st.favor.from) return fail('Không ai xin bài bạn lúc này');
      if (!pl.hand.includes(a.card)) return fail('Bạn không có lá này');
      const to = st.favor.to;
      take(pl.hand, a.card);
      st.players[to].hand.push(a.card);
      st.favor = null;
      st.phase = 'play';
      ev.push({ t: 'give', from: seat, to, card: a.card });
      break;
    }
    case 'bury': {
      if (st.phase !== 'bury' || seat !== st.bury.p) return fail('Không hợp lệ');
      const pos = Math.max(0, Math.min(st.deck.length, a.pos | 0));
      const c = st.bury.card;
      insertCard(st, seat, c, pos, c === 'timebomb');
      st.bury = null;
      ev.push({ t: 'bury', p: seat, card: c, pos });
      endOneTurn(st, ev);
      break;
    }
    case 'order': {
      if (st.phase !== 'alter' || seat !== st.alter.p) return fail('Không hợp lệ');
      const k = st.alter.cards.length, o = a.order;
      if (!Array.isArray(o) || o.length !== k || new Set(o).size !== k || o.some(i => !(i >= 0 && i < k))) return fail('Thứ tự không hợp lệ');
      const fresh = o.map(i => st.alter.cards[i]);
      st.deck.splice(0, k, ...fresh);
      eachPlayer(st, (x, i) => { x.know = i === seat ? fresh.concat(x.know.slice(k)) : []; });
      st.alter = null;
      st.phase = 'play';
      ev.push({ t: 'altered', p: seat, cards: fresh });
      break;
    }
    default: return fail('Hành động không hợp lệ');
  }
  return { ok: true, events: ev };
}

// ---------- bot ----------
function botNopeDecision(st) {
  const r = st.react, happen = r.nopes.length % 2 === 0, last = r.nopes.at(-1), victims = victimsOf(st, r);
  const heavy = ['attack', 'target', 'catomic', 'swap'].includes(r.kind);
  const cands = [];
  st.players.forEach((pl, i) => {
    if (!pl.active || pl.kind !== 'bot' || !pl.hand.includes('nope') || i === last) return;
    if (!pl.alive && !st.chaos) return;
    if (!r.nopes.length && i === r.p) return;
    let w;
    if (!pl.alive) w = happen ? 0.2 : 0.08;                       // hồn ma phá đám cho vui
    else if (happen) w = victims.includes(i) ? (heavy ? 0.7 : 0.45) : 0.04;
    else w = i === r.p ? 0.55 : 0.02;                             // bị chặn → chặn lại
    if (Math.random() < w) cands.push(i);
  });
  if (!cands.length) return null;
  const hi = Math.max(900, Math.min(st.nopeMs - 400, 2600));
  return { seat: cands[rnd(cands.length)], delay: Math.round(600 + Math.random() * (hi - 600)) };
}

function findCombo(hand) {
  const cnt = {};
  for (const c of hand) cnt[c] = (cnt[c] || 0) + 1;
  const cats = Object.keys(cnt).filter(c => CARDS[c].cat && c !== 'feral');
  const t = cats.find(c => cnt[c] >= 3);
  if (t) return [t, t, t];
  const p = cats.find(c => cnt[c] >= 2);
  if (p) return [p, p];
  if (cnt.feral && cats.length) return [cats[0], 'feral'];
  return null;
}

function botPlay(st, p) {
  const pl = st.players[p], h = pl.hand, has = c => h.includes(c);
  const N = st.deck.length, killers = st.deck.filter(isKiller).length;
  const tbAt = st.tbArmed ? st.deck.indexOf('timebomb') : -1;
  const k0 = pl.know[0];
  const topBad = tbAt === 0 ? true : k0 ? isKiller(k0) : null;   // null = chưa biết
  const risk = topBad === null ? killers / N : topBad ? 1 : 0;
  const opp = aliveSeats(st).filter(i => i !== p);
  const byCards = opp.slice().sort((a, b) => st.players[b].hand.length - st.players[a].hand.length);
  const rich = byCards[0], weak = byCards.at(-1);
  const play = (card, target) => (target == null ? { type: 'play', card } : { type: 'play', card, target });

  const mustEscape = topBad === true && (!has('defuse') || tbAt === 0 || Math.random() < 0.8);
  const scared = topBad === null && risk > (has('defuse') ? 0.35 : 0.15) && Math.random() < 0.5;
  if (mustEscape || scared) {
    const bottomBad = tbAt === N - 1 || (pl.know.length >= N && isKiller(pl.know[N - 1]));
    for (const c of ['skip', 'attack', 'target', 'reverse', 'bottom', 'catomic', 'alter', 'shuffle']) {
      if (!has(c) || (c === 'bottom' && bottomBad) || (c === 'shuffle' && topBad !== true)) continue;
      return play(c, c === 'target' ? weak : null);
    }
  }
  if (topBad === null && risk > 0.1 && has('future') && Math.random() < 0.6) return play('future');
  if (topBad === null && risk > 0.2 && has('alter') && Math.random() < 0.4) return play('alter');
  if (st.turnsLeft >= 2 && topBad !== false && has('attack') && Math.random() < 0.6) return play('attack');

  const richHas = rich != null && st.players[rich].hand.length > 0;
  const combo = findCombo(h);
  if (combo && richHas && Math.random() < 0.5) {
    const a = { type: 'combo', cards: combo, target: rich };
    if (combo.length === 3) a.name = !has('defuse') || Math.random() < 0.5 ? 'defuse' : 'nope';
    return a;
  }
  const distinct = [...new Set(h)];
  if (distinct.length >= 5 && !has('defuse') && st.discard.includes('defuse') && Math.random() < 0.7) {
    const five = distinct.sort((a, b) => VALUE[a] - VALUE[b]).slice(0, 5);
    return { type: 'combo', cards: five, take: 'defuse' };
  }
  if (has('favor') && richHas && Math.random() < 0.3) return play('favor', rich);
  if (has('swap') && !has('defuse') && richHas && st.players[rich].hand.length >= h.length + 2 && Math.random() < 0.4) return play('swap', rich);
  return { type: 'draw' };
}

function botAction(st, seat, { timeout } = {}) {
  const pl = st.players[seat];
  switch (st.phase) {
    case 'play': return timeout ? { type: 'draw' } : botPlay(st, seat);
    case 'favor': return { type: 'give', card: pl.hand.slice().sort((a, b) => VALUE[a] - VALUE[b])[0] };
    case 'bury': {
      const N = st.deck.length;
      if (timeout) return { type: 'bury', pos: rnd(N + 1) };
      const r = Math.random();
      if (st.bury.card === 'timebomb') return { type: 'bury', pos: Math.min(N, rnd(3)) };
      return { type: 'bury', pos: r < 0.45 ? 0 : r < 0.65 ? Math.min(1, N) : rnd(N + 1) };
    }
    case 'alter': {
      const idx = st.alter.cards.map((c, i) => i);
      if (timeout) return { type: 'order', order: idx };
      return { type: 'order', order: idx.sort((a, b) => isKiller(st.alter.cards[a]) - isKiller(st.alter.cards[b])) };
    }
    case 'react': // bình thường hub tự làm qua turn().auto; dự phòng
      return seat === st.react.p ? { type: 'resolve' } : { type: 'nope' };
  }
  return { type: 'draw' };
}

// ---------- che thông tin ----------
function askSeat(st) {
  return { play: st.turn, favor: st.favor && st.favor.from, bury: st.bury && st.bury.p, alter: st.alter && st.alter.p }[st.phase] ?? null;
}
function view(st, seat) {
  const { deck, ...rest } = st;
  return {
    ...rest,
    deckCount: deck.length,
    killers: deck.filter(isKiller).length,
    tbPos: st.tbArmed ? deck.indexOf('timebomb') : -1,
    ask: askSeat(st),
    react: st.react && { ...st.react, bot: undefined },
    alter: st.alter && (st.alter.p === seat ? st.alter : { p: st.alter.p }),
    players: st.players.map((pl, i) => (!pl.active ? pl : {
      ...pl, count: pl.hand.length, hand: i === seat ? pl.hand : undefined, know: i === seat ? pl.know : undefined,
    })),
  };
}
function viewEvents(evs, seat) {
  return evs.map(e => {
    switch (e.t) {
      case 'draw': return e.p === seat || isKiller(e.card) ? e : { ...e, card: null };
      case 'future': case 'altered': return e.p === seat ? e : { ...e, cards: null };
      case 'give': case 'steal': return e.from === seat || e.to === seat ? e : { ...e, card: e.named ? e.card : null };
      case 'bury': return e.p === seat || e.card === 'timebomb' ? e : { ...e, pos: null };
      default: return e;
    }
  });
}

export default {
  create,
  act,
  isOver: st => st.phase === 'over',
  // Thứ hạng (bảng xếp hạng của hub): người sống sót nhất, còn lại ai nổ sau xếp trên.
  result: st => [st.winner, ...[...st.dead].reverse()].map(p => ({ p })),
  turn(st) {
    switch (st.phase) {
      case 'play': return { seat: st.turn };
      case 'react': {
        const b = st.react.bot;
        return b ? { seat: b.seat, auto: { type: 'nope' }, autoDelay: b.delay } : { seat: st.react.p, auto: { type: 'resolve' }, autoDelay: st.nopeMs };
      }
      case 'favor': return { seat: st.favor.from };
      case 'bury': return { seat: st.bury.p };
      case 'alter': return { seat: st.alter.p };
    }
    return null;
  },
  bot: botAction,
  animDuration,
  view,
  viewEvents,
};
