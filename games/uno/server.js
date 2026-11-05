// 🎴 UNO — luật + bot (server giữ chồng bài và bài trên tay nên không lộ ra client). Xem "Game server interface" trong CLAUDE.md.
// Trạng thái:
//   deck: lá trên cùng ở CUỐI mảng (pop). discard: chồng bỏ, lá trên cùng ở cuối. color: màu đang yêu cầu (lá đổi màu không giữ màu).
//   players[p]: { kind, name, hand, score } hoặc { off: true } (ghế trống). dir: 1 | -1. turn: ghế đang tới lượt.
//   stack: { n, k: 'd2'|'d4', from } = phạt +2/+4 đang dồn vào st.turn (chỉ tồn tại khi người đó có lá đỡ được: cộng dồn / Gương).
//   drawn: id lá vừa rút được và đánh được — chỉ được đánh lá đó hoặc bỏ lượt.
//   phase 'catch' + catchW { p, until, bot }: p vừa đánh còn 1 lá mà quên hô UNO — cửa sổ để người khác "Bắt!".
//   jb: bot định chặn ngang { seat, a, delay } (hub làm qua turn().auto). ev: sự kiện kéo dài { k, left, color? } (Bất Ngờ).
import { COLOR_KEYS, CARDS, EVENTS, EVENT_KEYS, isWild, cardPts, handPts, penalty, bannedColor, playable, identical, CATCH_MS, animDuration } from './cards.js';

const HAND = 7;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];

function buildDeck(chaos) {
  const d = [];
  let id = 0;
  for (const c of COLOR_KEYS) {
    d.push({ id: id++, c, v: 0 });
    for (let v = 1; v <= 9; v++) for (let i = 0; i < 2; i++) d.push({ id: id++, c, v });
    for (const [v, C] of Object.entries(CARDS)) if (!C.wild && (chaos || !C.chaos)) for (let i = 0; i < C.n; i++) d.push({ id: id++, c, v });
  }
  for (const [v, C] of Object.entries(CARDS)) if (C.wild && (chaos || !C.chaos)) for (let i = 0; i < C.n; i++) d.push({ id: id++, c: 'w', v });
  return shuffle(d);
}

const active = st => st.players.map((pl, i) => (pl.off ? -1 : i)).filter(i => i >= 0);
// Ghế thứ k tính từ `from` theo chiều dir (bỏ qua ghế trống).
function step(st, from, k = 1, dir = st.dir) {
  const n = st.players.length;
  let q = from;
  for (let i = 0; i < k;) { q = (q + dir + n) % n; if (!st.players[q].off) i++; }
  return q;
}
const topOf = st => st.discard[st.discard.length - 1];
const table = st => ({ top: topOf(st), color: st.color, stack: st.stack, ev: st.ev, opts: st.opts });
const counts = st => st.players.map(pl => pl.hand.length);

// ---------- rút bài ----------
function drawOne(st, ev) {
  if (!st.deck.length) {
    if (st.discard.length <= 1) return null;
    const t = st.discard.pop();
    st.deck = shuffle(st.discard);
    st.discard = [t];
    ev.push({ t: 'shuffle', n: st.deck.length });
  }
  return st.deck.pop();
}
function give(st, p, n, ev, why) {
  const cards = [];
  for (let i = 0; i < n; i++) { const c = drawOne(st, ev); if (!c) break; cards.push(c); }
  if (cards.length) { st.players[p].hand.push(...cards); ev.push({ t: 'draw', p, cards, why }); }
  return cards;
}
// Bỏ lá xuống chồng bỏ nhưng nằm DƯỚI lá trên cùng (Bom Màu, Lì Xì) để không đổi lá/màu đang yêu cầu.
const tuck = (st, cards) => st.discard.splice(st.discard.length - 1, 0, ...cards);

function rotateHands(st, dir, ev, why) {
  const seats = active(st), hands = seats.map(p => st.players[p].hand);
  seats.forEach((p, i) => { st.players[step(st, p, 1, dir)].hand = hands[i]; });
  ev.push({ t: 'rotate', dir, ns: counts(st), why, hands: st.players.map(pl => pl.hand.slice()) });
}
function swapHands(st, a, b, ev, why) {
  const A = st.players[a], B = st.players[b];
  [A.hand, B.hand] = [B.hand, A.hand];
  ev.push({ t: 'swap', p: a, to: b, ns: counts(st), why, hands: st.players.map(pl => pl.hand.slice()) });
}

// ---------- lượt ----------
// Chuyển lượt cho q. Mỗi lần chuyển = 1 "lượt" để đếm vòng bàn cho sự kiện (Bất Ngờ).
function setTurn(st, q, ev) {
  st.turn = q;
  st.drawn = null;
  st.turns++;
  if (!st.chaos) return;
  if (st.ev && --st.ev.left <= 0) { ev.push({ t: 'eventEnd', k: st.ev.k }); st.ev = null; }
  if (st.turns >= st.evAt && !st.stack) fireEvent(st, ev);
}

function fireEvent(st, ev) {
  const n = active(st).length;
  st.evAt = st.turns + n + 1 + Math.floor(Math.random() * n);   // sự kiện kế tiếp sau n+1 … 2n lượt
  if (!st.bag.length) st.bag = shuffle(EVENT_KEYS.slice());
  const k = st.bag.pop(), E = EVENTS[k], e = { t: 'event', k };
  if (E.lap) {
    st.ev = { k, left: n };
    if (k === 'ban') st.ev.color = e.color = pick(COLOR_KEYS.filter(c => c !== st.color));
  }
  ev.push(e);
  switch (k) {
    case 'rain': for (let i = 0, q = st.turn; i < n; i++, q = step(st, q)) give(st, q, 1, ev, 'rain'); break;
    case 'pass': rotateHands(st, st.dir, ev, 'event'); break;
    case 'flip': st.dir = -st.dir; e.dir = st.dir; break;
    case 'paint': st.color = e.color = pick(COLOR_KEYS.filter(c => c !== st.color)); break;
    case 'lixi': {
      const most = Math.max(...active(st).map(p => st.players[p].hand.length));
      for (const p of active(st)) {
        const h = st.players[p].hand;
        if (h.length !== most) continue;
        const cards = shuffle(h.slice()).slice(0, Math.min(2, h.length - 1));
        if (!cards.length) continue;
        st.players[p].hand = h.filter(c => !cards.includes(c));
        tuck(st, cards);
        ev.push({ t: 'dump', p, cards, why: 'lixi' });
      }
      break;
    }
    case 'crown': {
      const few = Math.min(...active(st).map(p => st.players[p].hand.length));
      for (const p of active(st)) if (st.players[p].hand.length === few) give(st, p, 2, ev, 'crown');
      break;
    }
  }
}

// Phạt +2/+4 dồn vào q: có lá đỡ (cộng dồn / Gương) thì cho q quyết định, không thì rút luôn.
function facePenalty(st, q, ev) {
  const tb = table(st);
  if (st.players[q].hand.some(c => playable(tb, c))) {
    ev.push({ t: 'stack', p: q, n: st.stack.n });
    setTurn(st, q, ev);
  } else takePenalty(st, q, ev);
}
function takePenalty(st, q, ev) {
  const n = st.stack.n;
  st.stack = null;
  give(st, q, n, ev, 'pen');
  setTurn(st, step(st, q), ev);   // rút phạt là mất lượt
}

// ---------- ván / vòng ----------
function startRound(st, ev) {
  st.round++;
  const seats = active(st);
  st.dealer = st.round === 1 ? pick(seats) : step(st, st.dealer, 1, 1);
  Object.assign(st, { deck: buildDeck(st.chaos), discard: [], dir: 1, stack: null, drawn: null, ev: null, phase: 'play', catchW: null, jb: null, stall: 0 });
  for (const p of seats) st.players[p].hand = st.deck.splice(-HAND);
  ev.push({ t: 'round', n: st.round, dealer: st.dealer });
  ev.push({ t: 'deal', hands: st.players.map(pl => (pl.off ? null : pl.hand.slice())) });
  // Lá mở bàn: lá số đầu tiên từ trên xuống.
  let i = st.deck.length - 1;
  while (typeof st.deck[i].v !== 'number') i--;
  const [c] = st.deck.splice(i, 1);
  st.discard.push(c);
  st.color = c.c;
  ev.push({ t: 'flip', c });
  st.turn = step(st, st.dealer, 1, 1);
  st.turns = 0;
  st.evAt = seats.length + 1 + Math.floor(Math.random() * seats.length);
}

function endRound(st, w, ev) {
  const res = active(st).map(p => ({ p, hand: st.players[p].hand, pts: handPts(st.players[p].hand) }));
  const gain = res.reduce((s, r) => s + r.pts, 0);
  if (st.target) st.players[w].score += gain;
  ev.push({ t: 'roundEnd', w, gain: st.target ? gain : 0, res, scores: st.players.map(pl => pl.score) });
  st.stack = st.drawn = st.catchW = st.jb = null;
  if (!st.target || st.players[w].score >= st.target) {
    st.phase = 'over';
    st.winner = w;
    st.results = st.target
      ? active(st).map(p => ({ p, score: st.players[p].score })).sort((a, b) => b.score - a.score)
      : res.map(r => ({ p: r.p, pts: r.pts, n: r.hand.length })).sort((a, b) => (a.p === w ? -1 : b.p === w ? 1 : a.pts - b.pts));
    ev.push({ t: 'over', w });
    return;
  }
  startRound(st, ev);
}

// ---------- đánh bài ----------
function play(st, seat, a, now, ev) {
  const pl = st.players[seat];
  const i = pl.hand.findIndex(c => c.id === a.id);
  if (i < 0) return 'Bạn không có lá này';
  const c = pl.hand[i], tb = table(st), jump = seat !== st.turn;
  if (jump) {
    if (!st.opts.jump) return 'Chưa đến lượt bạn';
    if (st.stack) return 'Đang có phạt dồn — không chặn ngang được';
    if (!identical(tb, c)) return 'Chưa đến lượt bạn — chỉ chặn ngang được bằng lá Y HỆT lá trên cùng';
  } else {
    if (st.drawn != null && c.id !== st.drawn) return 'Bạn vừa rút bài — chỉ được đánh lá vừa rút, hoặc bỏ lượt';
    if (!playable(tb, c)) {
      if (st.stack) return `Đang bị phạt +${st.stack.n}: chỉ đỡ được bằng ${st.opts.stack ? (st.stack.k === 'd2' ? '+2, +4' : '+4') : ''}${st.opts.stack && st.chaos ? ' hoặc ' : ''}${st.chaos ? '🪞 Gương' : ''} — không thì nhận phạt`;
      return c.c === bannedColor(st) ? 'Màu này đang bị cấm' : 'Lá này không hợp — cần cùng màu hoặc cùng số/ký hiệu';
    }
  }
  // Lựa chọn đi kèm (gửi luôn trong action): màu, người nhận, lá tặng.
  const last = pl.hand.length === 1, others = active(st).filter(q => q !== seat);
  let to = null, gift = null;
  if (isWild(c) && (!COLOR_KEYS.includes(a.color) || a.color === bannedColor(st))) return a.color === bannedColor(st) ? 'Màu này đang bị cấm' : 'Hãy chọn màu';
  if (!last && (c.v === 'swap' || c.v === 'gift' || (c.v === 7 && st.opts.sevenO))) {
    to = a.to;
    if (!others.includes(to)) return 'Hãy chọn một người';
  }
  if (!last && c.v === 'gift') {
    gift = pl.hand.find(x => x.id === a.give && x.id !== c.id);
    if (!gift) return 'Hãy chọn lá để tặng';
  }

  const wasStack = st.stack;
  pl.hand.splice(i, 1);
  st.discard.push(c);
  st.color = isWild(c) ? a.color : c.c;
  st.drawn = null;
  st.stall = 0;
  if (jump) st.turn = seat;   // chặn ngang: lượt nhảy sang người chặn (không tính là lượt mới)
  ev.push({ t: 'play', p: seat, c, color: st.color, ...(jump ? { jump: 1 } : {}), ...(wasStack && c.v === 'mirror' ? { mirror: 1 } : {}) });
  if (c.v === 'bomb') {
    const dump = pl.hand.filter(x => x.c === c.c);
    if (dump.length) { pl.hand = pl.hand.filter(x => x.c !== c.c); tuck(st, dump); ev.push({ t: 'dump', p: seat, cards: dump, why: 'bomb' }); }
  }
  if (gift) {
    pl.hand.splice(pl.hand.indexOf(gift), 1);
    st.players[to].hand.push(gift);
    ev.push({ t: 'gift', p: seat, to, c: gift });
  }
  if (!pl.hand.length) { endRound(st, seat, ev); return; }
  const shouted = pl.hand.length === 1 && !!a.uno;
  if (shouted) ev.push({ t: 'uno', p: seat });

  const n = active(st).length;
  const reverse = () => {
    if (n === 2) { ev.push({ t: 'skip', p: step(st, seat) }); setTurn(st, seat, ev); return; }
    st.dir = -st.dir;
    ev.push({ t: 'rev', p: seat, dir: st.dir });
    setTurn(st, step(st, seat), ev);
  };
  switch (c.v) {
    case 'skip': ev.push({ t: 'skip', p: step(st, seat) }); setTurn(st, step(st, seat, 2), ev); break;
    case 'rev': reverse(); break;
    case 'mirror':
      if (!wasStack) { reverse(); break; }
      ev.push({ t: 'reflect', p: seat, to: wasStack.from, n: wasStack.n });
      st.stack = { ...wasStack, from: seat };
      facePenalty(st, wasStack.from, ev);
      break;
    case 'd2': case 'd4':
      st.stack = { n: (wasStack ? wasStack.n : 0) + penalty(c.v, st.ev), k: c.v, from: seat };
      facePenalty(st, step(st, seat), ev);
      break;
    case 'again': ev.push({ t: 'again', p: seat }); setTurn(st, seat, ev); break;
    case 'swap': swapHands(st, seat, to, ev, 'swap'); setTurn(st, step(st, seat), ev); break;
    case 'storm': rotateHands(st, st.dir, ev, 'storm'); setTurn(st, step(st, seat), ev); break;
    default:
      if (st.opts.sevenO && c.v === 7) swapHands(st, seat, to, ev, 'seven');
      else if (st.opts.sevenO && c.v === 0) rotateHands(st, st.dir, ev, 'zero');
      setTurn(st, step(st, seat), ev);
  }
  // Đánh xong còn 1 lá mà chưa hô UNO → mở cửa sổ bắt lỗi.
  if (pl.hand.length === 1 && !shouted && st.phase === 'play') openCatch(st, seat, now, ev);
}

function draw(st, seat, ev) {
  if (seat !== st.turn) return 'Chưa đến lượt bạn';
  if (st.stack) { takePenalty(st, seat, ev); return; }
  if (st.drawn != null) return 'Bạn đã rút rồi — đánh lá vừa rút hoặc bỏ lượt';
  const pl = st.players[seat], got = [];
  for (let k = 0; k < (st.opts.drawUntil ? 500 : 1); k++) {
    const c = drawOne(st, ev);
    if (!c) break;
    got.push(c);
    pl.hand.push(c);
    if (playable(table(st), c)) break;
  }
  if (got.length) ev.push({ t: 'draw', p: seat, cards: got, why: 'draw' });
  const lastC = got[got.length - 1];
  if (lastC && playable(table(st), lastC)) { st.drawn = lastC.id; return; }
  ev.push({ t: 'pass', p: seat, empty: got.length ? undefined : 1 });
  // Hết sạch bài để rút mà cả bàn không ai đánh được: ai ít điểm bài nhất thắng vòng.
  if (!got.length && ++st.stall >= active(st).length * 2) {
    const w = active(st).reduce((a, b) => (handPts(st.players[b].hand) < handPts(st.players[a].hand) ? b : a));
    endRound(st, w, ev);
    return;
  }
  setTurn(st, step(st, seat), ev);
}

// ---------- hô UNO / bắt lỗi ----------
function openCatch(st, p, now, ev) {
  st.phase = 'catch';
  ev.push({ t: 'catchOpen', p });
  st.catchW = { p, until: now + animDuration(ev) + CATCH_MS, bot: botCatch(st, p) };
}
function closeCatch(st) { st.phase = 'play'; st.catchW = null; }

function actCatch(st, seat, a, now, ev) {
  const w = st.catchW;
  switch (a.type) {
    case 'uno':
      if (seat !== w.p) return 'Bạn không cần hô UNO';
      ev.push({ t: 'uno', p: seat, late: 1 });
      closeCatch(st);
      return;
    case 'catch':
      if (seat === w.p) return 'Hô UNO! đi chứ, sao lại tự bắt mình?';
      if (now > w.until + 400) return 'Muộn rồi!';
      ev.push({ t: 'caught', p: w.p, by: seat });
      give(st, w.p, 2, ev, 'catch');
      closeCatch(st);
      return;
    case 'safe':
      if (seat !== w.p || now < w.until - 150) return 'Còn đang chờ xem có ai bắt lỗi';
      ev.push({ t: 'safe', p: seat });
      closeCatch(st);
      return;
  }
  return w.p === seat ? 'Bạn còn 1 lá mà chưa hô — bấm UNO! ngay!' : 'Chờ chút — có người quên hô UNO! Bắt lỗi đi!';
}

// ================= BOT =================
// Bot chỉ dùng bài của mình + số lá trên tay người khác (thông tin công khai).
const nOf = (st, q) => st.players[q].hand.length;
function fewest(st, seat) {
  const others = active(st).filter(q => q !== seat);
  const m = Math.min(...others.map(q => nOf(st, q)));
  return pick(others.filter(q => nOf(st, q) === m));
}
function bestColor(st, hand, except) {
  const ban = bannedColor(st), cnt = {};
  for (const c of hand) if (c !== except && !isWild(c) && c.c !== ban) cnt[c.c] = (cnt[c.c] || 0) + cardPts(c) / 10 + 1;
  const ks = Object.keys(cnt);
  if (!ks.length) return pick(COLOR_KEYS.filter(c => c !== ban));
  const m = Math.max(...ks.map(k => cnt[k]));
  return pick(ks.filter(k => cnt[k] === m));
}
// Action đánh lá c kèm đủ lựa chọn.
function playAction(st, seat, c, timeout) {
  const pl = st.players[seat], a = { type: 'play', id: c.id, uno: timeout || Math.random() < 0.88 };
  if (isWild(c)) a.color = bestColor(st, pl.hand, c);
  if (c.v === 'swap' || c.v === 'gift' || (c.v === 7 && st.opts.sevenO)) a.to = fewest(st, seat);
  if (c.v === 'gift') {
    const rest = pl.hand.filter(x => x !== c), nums = rest.filter(x => typeof x.v === 'number'), plain = rest.filter(x => !isWild(x) && x.v !== 'd2');
    const g = (nums.length ? nums : plain.length ? plain : rest).reduce((x, y) => (cardPts(y) > cardPts(x) ? y : x), rest[0]);
    if (g) a.give = g.id;
  }
  return a;
}
function botScore(st, seat, c) {
  const pl = st.players[seat], me = pl.hand.length - 1;
  const nextN = nOf(st, step(st, seat)), prevN = nOf(st, step(st, seat, 1, -st.dir));
  const minOther = Math.min(...active(st).filter(q => q !== seat).map(q => nOf(st, q)));
  const sameColor = pl.hand.filter(x => x !== c && x.c === c.c).length;
  const threat = nextN <= 2 ? 3 : nextN <= 4 ? 1 : 0;
  let s = cardPts(c) / 10 + Math.random() * 2;
  if (!isWild(c)) s += sameColor * 1.5;
  switch (c.v) {
    case 'skip': s += 4 * threat; break;
    case 'rev': case 'mirror': s += 2 * threat; break;
    case 'd2': s += 2 + 5 * threat; break;
    case 'wild': s -= me > 1 ? 12 : 0; break;
    case 'd4': s += threat ? 6 * threat : me > 1 ? -10 : 5; break;
    case 'bomb': s += sameColor * 6; break;
    case 'gift': s += me > 1 ? 6 : 0; break;
    case 'again': s += me > 1 ? 7 : -2; break;
    case 'swap': s += minOther < me - 1 ? 10 + (me - minOther) * 3 : -25; break;
    case 'storm': s += prevN < me - 1 ? 8 + (me - prevN) * 2 : -20; break;
    case 7: if (st.opts.sevenO) s += minOther < me - 1 ? 8 + (me - minOther) * 2 : -6; break;
    case 0: if (st.opts.sevenO) s += prevN < me - 1 ? 6 : -4; break;
  }
  return s;
}

function bot(st, seat, { timeout } = {}) {
  if (st.phase === 'catch') return seat === st.catchW.p ? { type: 'uno' } : { type: 'catch' };
  const pl = st.players[seat], tb = table(st);
  if (st.drawn != null) {
    const c = pl.hand.find(x => x.id === st.drawn);
    return c ? playAction(st, seat, c, timeout) : { type: 'pass' };
  }
  const cands = pl.hand.filter(c => playable(tb, c));
  if (!cands.length) return { type: 'draw' };
  if (st.stack) {
    const mirror = cands.find(c => c.v === 'mirror'), stackers = cands.filter(c => c.v !== 'mirror');
    const c = mirror && (!stackers.length || st.stack.n >= 6) ? mirror : stackers.find(x => x.v === 'd2') || stackers[0] || mirror;
    return playAction(st, seat, c, timeout);
  }
  const best = cands.reduce((x, y) => (botScore(st, seat, y) > botScore(st, seat, x) ? y : x));
  return playAction(st, seat, best, timeout);
}

// Bot bắt lỗi người quên hô UNO (hoặc tự nhớ ra nếu chính nó quên). Chọn phản ứng sớm nhất.
function botCatch(st, p) {
  const cands = [];
  for (const q of active(st)) {
    if (st.players[q].kind !== 'bot') continue;
    if (q === p) { if (Math.random() < 0.45) cands.push({ seat: q, a: { type: 'uno' }, delay: 900 + Math.random() * 1600 }); }
    else if (Math.random() < 0.35) cands.push({ seat: q, a: { type: 'catch' }, delay: 700 + Math.random() * 1900 });
  }
  return cands.reduce((x, y) => (!x || y.delay < x.delay ? y : x), null);
}
// Bot chặn ngang (luật Chặn ngang): bot không tới lượt mà có lá y hệt thì có thể chen vào.
function botJump(st) {
  if (!st.opts.jump || st.phase !== 'play' || st.stack) return null;
  const tb = table(st);
  for (const q of shuffle(active(st))) {
    if (q === st.turn || st.players[q].kind !== 'bot') continue;
    const c = st.players[q].hand.find(x => identical(tb, x));
    if (c && Math.random() < 0.5) return { seat: q, a: playAction(st, q, c, false), delay: 600 + Math.random() * 1000 };
  }
  return null;
}

// ================= INTERFACE =================
function create({ seats, opts }) {
  const players = seats.map(s => (s ? { kind: s.kind, name: s.name, hand: [], score: 0 } : { off: true, hand: [], score: 0 }));
  const st = {
    phase: 'play', chaos: !!opts.chaos, target: +opts.target || 0,
    opts: { stack: !!opts.stack, sevenO: !!opts.sevenO, jump: !!opts.jump, drawUntil: !!opts.drawUntil },
    round: 0, dealer: 0, deck: [], discard: [], color: null, dir: 1, turn: 0, turns: 0, evAt: 0, ev: null, bag: [],
    stack: null, drawn: null, catchW: null, jb: null, stall: 0, players, winner: null, results: [],
  };
  const ev = [{ t: 'start' }];
  startRound(st, ev);
  st.jb = botJump(st);
  return { state: st, events: ev };
}

function act(st, seat, a, now) {
  if (st.phase === 'over') return { ok: false, err: 'Ván đã kết thúc' };
  if (!a || typeof a !== 'object' || !st.players[seat] || st.players[seat].off) return { ok: false, err: 'Hành động không hợp lệ' };
  const ev = [];
  let err;
  if (st.phase === 'catch') err = actCatch(st, seat, a, now, ev);
  else switch (a.type) {
    case 'play': err = play(st, seat, a, now, ev); break;
    case 'draw': err = draw(st, seat, ev); break;
    case 'pass':
      if (seat !== st.turn) err = 'Chưa đến lượt bạn';
      else if (st.drawn == null) err = st.stack ? 'Hãy đỡ phạt hoặc nhận phạt' : 'Phải rút 1 lá trước đã';
      else { ev.push({ t: 'pass', p: seat }); setTurn(st, step(st, seat), ev); }
      break;
    case 'uno': err = 'Không cần hô lúc này — bấm UNO! trước khi đánh lá áp chót'; break;
    case 'catch': err = 'Muộn rồi — không có ai để bắt'; break;
    default: err = 'Hành động không hợp lệ';
  }
  if (err) return { ok: false, err };
  st.jb = botJump(st);
  return { ok: true, events: ev };
}

function turn(st) {
  if (st.phase === 'over') return null;
  if (st.phase === 'catch') {
    const w = st.catchW, b = w.bot;
    return b ? { seat: b.seat, auto: b.a, autoDelay: b.delay } : { seat: w.p, auto: { type: 'safe' }, autoDelay: CATCH_MS };
  }
  if (st.jb) return { seat: st.jb.seat, auto: st.jb.a, autoDelay: st.jb.delay };
  return { seat: st.turn };
}

function view(st, seat) {
  const open = (st.ev && st.ev.k === 'open') || st.phase === 'over';
  return {
    ...st, deck: undefined, discard: undefined, bag: undefined, jb: undefined, evAt: undefined,
    top: topOf(st), deckN: st.deck.length, discardN: st.discard.length,
    catchW: st.catchW && { p: st.catchW.p },
    players: st.players.map((pl, q) => ({ ...pl, n: pl.hand.length, hand: q === seat || open ? pl.hand : null })),
  };
}

function viewEvents(events, seat) {
  return events.map(e => {
    switch (e.t) {
      case 'draw': return e.p === seat ? e : { ...e, cards: undefined, n: e.cards.length };
      case 'deal': return { t: 'deal', ns: e.hands.map(h => (h ? h.length : 0)), mine: e.hands[seat] || null };
      case 'gift': return e.p === seat || e.to === seat ? e : { ...e, c: null };
      case 'swap': case 'rotate': return { ...e, hands: undefined, mine: e.hands[seat] || null };
      default: return e;
    }
  });
}

// Thứ hạng (bảng xếp hạng của hub): chơi tới điểm thì theo điểm; chơi một ván thì người hết bài nhất, còn lại ít điểm trên tay hơn xếp trên.
const result = st => st.results.map(r => ({ p: r.p, s: r.p === st.winner ? 'win' : st.target ? r.score : r.pts }));

export default { create, act, isOver: st => st.phase === 'over', result, turn, bot, animDuration, view, viewEvents };
