// 🕵️ Mật Danh — bot. Trưởng nhóm bot ra gợi ý bằng "chủ đề" chung nhiều lá đội mình nhất (words.js), tránh chủ đề dính
// sát thủ/đội khác. Người đoán bot chỉ dùng thứ người đoán được thấy: chữ trên lá (trừ lá bị Sương Mù), lá đã lật,
// dấu ⭐ của đội mình, các gợi ý — không đọc màu lá chưa lật.
import { INF, clueProblem } from './data.js';
import { tagsOf, clueTags, clueCandidates } from './words.js';

const rnd = n => (Math.random() * n) | 0;
const pick = a => a[rnd(a.length)];
const SLIP = 0.12;   // người đoán bot thỉnh thoảng nghĩ lệch sang lá liên quan thứ nhì
const FUZZ = 0.35;   // mỗi bot hiểu gợi ý hơi khác nhau (nhiễu cộng vào độ khớp)
const FALLBACK = ['manh mối', 'bí ẩn', 'điệp viên', 'linh tinh', 'mật thư', 'ám hiệu'];

const hiddenIdx = st => st.cards.map((c, i) => (c.rev ? -1 : i)).filter(i => i >= 0);

// ---------- Trưởng nhóm ----------
// Mọi gợi ý một-chủ-đề hợp lệ cho đội t, xếp từ tốt nhất. Trưởng nhóm "đóng vai" người đoán: xếp lá chưa lật theo độ khớp
// với gợi ý (cùng hàm fit), lấy các lá đội mình đứng đầu cho tới lá lạ đầu tiên → n; lá lạ khớp gần bằng thì trừ điểm rủi ro.
const RISK = { a: 4, n: 0.45 };
function cluePlans(st, t) {
  const hid = hiddenIdx(st), own = hid.filter(i => st.cards[i].k === t);
  const cand = new Set(own.flatMap(i => [...clueCandidates(st.cards[i].w)]));
  const plans = [];
  for (const tag of cand) {
    if (clueProblem(tag, st.cards)) continue;
    const ct = clueTags(tag);
    const ranked = hid.map(i => [i, fit(st.cards[i].w, ct)]).filter(x => x[1] >= 0.3).sort((a, b) => b[1] - a[1]);
    // Người thật phải hiểu được: gợi ý khớp THẲNG ít nhất 1 lá, và chỉ được kèm tối đa 1 lá liên tưởng gián tiếp.
    const mine = [];
    let k = 0, loose = 0;
    while (k < ranked.length && st.cards[ranked[k][0]].k === t && mine.length < 4) {
      if (ranked[k][1] < 0.9 && ++loose > 1) break;
      mine.push(ranked[k++][0]);
    }
    if (!mine.length || loose >= mine.length) continue;
    const last = ranked[k - 1][1];
    let risk = 0;
    for (const [i, f] of ranked.slice(k)) {
      if (f < last * 0.75) break;
      const c = st.cards[i];
      risk += (RISK[c.k] ?? 1.3) * (f >= last ? 1 : 0.5) + (c.sp === 'bomb' || c.sp === 'traitor' ? 0.5 : 0);
    }
    if (ranked.slice(k).some(([i, f]) => st.cards[i].k === 'a' && f >= 0.5)) risk += 1.5;
    const strength = mine.reduce((s, i) => s + Math.min(1, fit(st.cards[i].w, ct)), 0) / mine.length;
    const score = mine.length * (0.75 + 0.25 * strength) - risk + Math.random() * 0.4;
    plans.push({ w: tag, n: mine.length, cards: mine, score, pure: risk === 0 });
  }
  return plans.sort((a, b) => b.score - a.score);
}

// Lá của đội ít "bạn" nhất (khó gợi ý chung) — ứng viên cho Đổi Chữ.
function loneliest(st, t) {
  const own = hiddenIdx(st).filter(i => st.cards[i].k === t);
  let best = null, bs = Infinity;
  for (const i of own) {
    const tg = new Set(tagsOf(st.cards[i].w));
    const links = own.filter(j => j !== i && tagsOf(st.cards[j].w).some(x => tg.has(x))).length;
    if (links < bs) { bs = links; best = i; }
  }
  return best;
}

function fallbackClue(st, t) {
  const own = hiddenIdx(st).filter(i => st.cards[i].k === t);
  for (const i of own) for (const tag of tagsOf(st.cards[i].w)) if (!clueProblem(tag, st.cards)) return { w: tag, n: 1 };
  return { w: FALLBACK.find(w => !clueProblem(w, st.cards)) || 'manh mối', n: 1 };
}

function spyMove(st, seat, timeout) {
  const t = st.cur, tm = st.teams[t];
  const plans = cluePlans(st, t), best = plans[0];
  const has = k => tm.skills.some(s => s.k === k && !s.used);
  if (!timeout && tm.skills.length) {
    if (has('jam') && Math.random() < 0.45) return { type: 'skill', k: 'jam' };
    if (has('mark') && tm.left <= 3 && Math.random() < 0.7) {
      const own = hiddenIdx(st).filter(i => st.cards[i].k === t && !st.cards[i].mk.includes(t));
      if (own.length) return { type: 'skill', k: 'mark', c: pick(own) };
    }
    if (has('swap') && tm.left >= 3 && (!best || best.n < 2)) {
      const c = loneliest(st, t);
      if (c != null) return { type: 'skill', k: 'swap', c };
    }
    if (has('shield') && !st.fx.shield && best && (best.n >= 3 || !best.pure)) return { type: 'skill', k: 'shield' };
    if (has('double') && !st.fx.double && best && best.n >= 2 && !st.fx.limit) {
      const two = plans.find(p => p !== best && p.n >= 2 && p.cards.every(i => !best.cards.includes(i)));
      if (two) return { type: 'skill', k: 'double' };
    }
  }
  const cap = n => (st.fx.limit ? Math.max(1, Math.min(2, n)) : n >= 4 && Math.random() < 0.3 ? n - 1 : n);
  const first = best ? { w: best.w, n: cap(best.n) } : fallbackClue(st, t);
  const a = { type: 'clue', ...first };
  if (st.fx.double) {
    const two = plans.find(p => p.w !== first.w && (!best || p.cards.every(i => !best.cards.includes(i))))
      || plans.find(p => p.w !== first.w);
    const second = two ? { w: two.w, n: cap(two.n) } : null;
    if (second) { a.w2 = second.w; a.n2 = second.n; }
    else { a.w2 = FALLBACK.find(w => w !== first.w && !clueProblem(w, st.cards)) || 'ám hiệu'; a.n2 = 1; }
  }
  return a;
}

// ---------- người đoán ----------
// Độ khớp của chữ trên lá với một gợi ý (Map chủ đề → độ tin).
function fit(w, ct) {
  if (w == null) return 0;
  let s = 0;
  for (const tg of tagsOf(w)) s += ct.get(tg) || 0;
  return Math.min(1.6, s);
}

function guess(st, seat) {
  const t = st.cur, tm = st.teams[t], clue = st.clue, hid = hiddenIdx(st);
  const seen = i => (st.cards[i].fog ? null : st.cards[i].w);
  const now = [clue.w, clue.w2].filter(Boolean).map(clueTags);
  // Gợi ý cũ của đội còn thiếu lá (đoán được chưa đủ số) → vẫn có thể nhắm tới.
  const old = st.hist.slice(0, -1).filter(h => h.team === t && h.n != null && h.n !== 0 && h.n !== INF)
    .filter(h => h.got.filter(i => st.cards[i].k === t).length < h.n + (h.n2 || 0))
    .flatMap(h => [h.w, h.w2].filter(Boolean)).map(clueTags);
  const score = new Map(hid.map(i => {
    let s = 0;
    for (const ct of now) s += fit(seen(i), ct);
    for (const ct of old) s += 0.5 * fit(seen(i), ct);
    if (st.cards[i].mk.includes(t)) s += 3;
    return [i, s + Math.random() * FUZZ];
  }));
  const ranked = hid.slice().sort((a, b) => score.get(b) - score.get(a));
  const top = ranked[0], bestS = score.get(top);
  const made = clue.made;
  const want = clue.n == null ? 2 : clue.n === 0 || clue.n === INF ? 3 : clue.n + (clue.n2 || 0);
  const vote = c => ({ type: 'vote', c });

  // Nghe theo đồng đội: người thật trước, rồi bot khác (để cả đội nhanh chóng thống nhất).
  const mates = tm.ops.filter(s => s !== seat && st.votes[s] != null && st.votes[s] !== 'any');
  for (const s of mates.sort((a, b) => (st.players[a].kind === 'human' ? -1 : 0) - (st.players[b].kind === 'human' ? -1 : 0))) {
    const v = st.votes[s], human = st.players[s].kind === 'human';
    if (v === 'pass') { if (made >= 1 && Math.random() < (human ? 0.75 : 0.6)) return vote('pass'); continue; }
    if (score.get(v) >= bestS * (human ? 0.4 : 0.7) || bestS < 0.5) return vote(v);
  }

  if (made >= want) {
    // Lượt đoán thêm: chỉ liều khi chắc (lá có ⭐ hoặc khớp rõ một gợi ý cũ).
    if (bestS >= 3 || (bestS >= 1 && old.length && Math.random() < 0.5)) return vote(top);
    return vote('pass');
  }
  if (bestS < 0.3) return made >= 1 ? vote('pass') : vote(pick(ranked.slice(0, Math.min(5, ranked.length))));
  if (Math.random() < SLIP && ranked[1] != null && score.get(ranked[1]) > 0.3) return vote(ranked[1]);
  return vote(top);
}

export function botAction(st, seat, { timeout } = {}) {
  if (st.phase === 'clue') return spyMove(st, seat, timeout);
  if (st.split) return { type: 'settle' };
  if (timeout) return { type: 'vote', c: 'any' };
  return guess(st, seat);
}
