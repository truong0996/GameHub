// Lịch sử ván đấu + bảng xếp hạng. Mỗi ván kết thúc (hoặc bị bỏ dở) có ≥2 người đã đăng nhập thì ghi một dòng
// vào <data>/matches.jsonl.
// Điểm một ván (−1…+1, bàn mấy người cũng vậy): xét từng cặp người đã đăng nhập — ai xếp trên +1, xếp dưới −1, bằng hạng 0
// (bot và khách không tính) — rồi chia cho (số người − 1). Nhất bàn = +1, bét bàn = −1; tổng cả bàn luôn bằng 0.
// Trọng số ván theo thời lượng thật (weightOf): cứ 10 phút là ×1, làm tròn 0.5, trong khoảng ×1…×3 — ván Tỷ Phú 30 phút nặng hơn ván UNO 2 phút,
// và cùng một game thì bàn đông (lâu hơn) cũng nặng hơn bàn vắng.
// Chỉ số xếp hạng (−100…+100) = trung bình có trọng số, cộng thêm PRIOR ván hoà ảo để vài ván ăn may không vọt lên đầu:
//   chỉ số = Σ(trọng số × điểm ván) / (Σ trọng số + PRIOR) × 100. Vắng mặt không thiệt cũng không lợi.
import fs from 'node:fs';
import path from 'node:path';

export const MIN_GAMES = 5;       // ít ván hơn thì bảng xếp hạng gắn nhãn "chưa đủ ván"
export const PRIOR = 3;           // số "ván hoà ảo" (trọng số 1) cộng vào mẫu số
export const weightOf = dur => Math.min(3, Math.max(1, Math.round((dur || 0) / 300000) / 2));

// Thứ hạng từng ghế (1 = nhất, bằng nhau thì cùng hạng, null = không xếp hạng) từ kết quả ván của game.
// Game khai báo result(state) → [{ p, s? }] xếp từ tốt nhất; hai phần tử liền nhau có `s` giống nhau (so bằng JSON) là đồng hạng.
// Game không có result() thì dùng state.winners / state.winner: người thắng hạng 1, còn lại đồng hạng 2.
export function ranksOf(L, st, seated) {
  const ranks = new Map();
  if (L.result) {
    const list = L.result(st) || [];
    list.forEach((x, i) => {
      const tie = i > 0 && x.s !== undefined && JSON.stringify(x.s) === JSON.stringify(list[i - 1].s);
      ranks.set(x.p, tie ? ranks.get(list[i - 1].p) : i + 1);
    });
  } else {
    const w = st.winners || (st.winner != null ? [st.winner] : []);
    if (w.length) for (const p of seated) ranks.set(p, w.includes(p) ? 1 : 2);
  }
  return seated.map(p => ranks.get(p) ?? null);
}

export function createStats(dir) {
  const file = path.join(dir, 'matches.jsonl');
  const matches = [];
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { matches.push(JSON.parse(line)); } catch { console.error('[stats] bỏ qua dòng hỏng trong', file); }
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return {
    add(rec) {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(file, JSON.stringify(rec) + '\n');
      matches.push(rec);
    },
    list: () => matches,
  };
}

// q = { from, to (ms), game (id hoặc '') }; nameOf(acctId) → tên hiện tại; gameInfo(id) → { name, icon }.
export function buildReport(matches, { from = 0, to = Infinity, game = '' } = {}, nameOf, gameInfo) {
  const inRange = matches.filter(m => m.at >= from && m.at < to);
  const counts = {};
  for (const m of inRange) if (!m.aborted) counts[m.game] = (counts[m.game] || 0) + 1;
  const list = inRange.filter(m => !game || m.game === game);
  const P = new Map();      // acct → thống kê
  const pl = id => {
    if (!P.has(id)) P.set(id, { id, name: nameOf(id) || '?', sum: 0, weight: 0, games: 0, wins: 0, aborts: 0, byGame: {}, form: [] });
    return P.get(id);
  };
  const h2h = {};           // h2h[a][b] = số lần a xếp trên b
  for (const m of list) {
    if (m.aborted) { if (m.by) pl(m.by).aborts++; continue; }
    const ppl = m.players.filter(x => x.acct && x.rank != null);
    const delta = new Map(ppl.map(x => [x.acct, 0]));
    for (let i = 0; i < ppl.length; i++) for (let j = i + 1; j < ppl.length; j++) {
      const a = ppl[i], b = ppl[j];
      if (a.rank === b.rank) continue;
      const [hi, lo] = a.rank < b.rank ? [a, b] : [b, a];
      delta.set(hi.acct, delta.get(hi.acct) + 1);
      delta.set(lo.acct, delta.get(lo.acct) - 1);
      ((h2h[hi.acct] ??= {})[lo.acct] ??= 0);
      h2h[hi.acct][lo.acct]++;
    }
    if (ppl.length < 2) continue;
    const w = weightOf(m.dur);
    for (const x of ppl) {
      const s = pl(x.acct), d = delta.get(x.acct) / (ppl.length - 1), g = (s.byGame[m.game] ??= { games: 0, wins: 0, sum: 0 });
      s.sum += w * d; s.weight += w; s.games++; g.games++; g.sum += d;
      if (x.rank === 1) { s.wins++; g.wins++; }
      s.form.push(x.rank === 1 ? 'w' : d > 0 ? 'u' : d < 0 ? 'd' : 'e');
    }
  }
  const players = [...P.values()].filter(s => s.games).map(s => ({
    ...s, sum: Math.round(s.sum * 100) / 100, score: Math.round((s.sum / (s.weight + PRIOR)) * 100),
    avg: Math.round((s.sum / s.weight) * 100), rate: s.wins / s.games, form: s.form.slice(-6),
    best: Object.entries(s.byGame).filter(([, g]) => g.wins).sort((a, b) => b[1].wins - a[1].wins || b[1].sum - a[1].sum)
      .slice(0, 2).map(([id]) => id),
    enough: s.games >= MIN_GAMES,
  })).sort((a, b) => b.enough - a.enough || b.score - a.score || b.wins - a.wins || a.games - b.games || a.name.localeCompare(b.name, 'vi'));
  const ids = players.map(s => s.id);
  const recent = list.slice(-40).reverse().map(m => ({
    at: m.at, dur: m.dur, w: m.aborted ? null : weightOf(m.dur), game: m.game, aborted: !!m.aborted, by: m.by ? nameOf(m.by) : null,
    players: m.players.map(x => ({ name: x.acct ? nameOf(x.acct) || x.name : x.name, bot: !!x.bot, guest: !x.bot && !x.acct, rank: x.rank })),
  }));
  const games = {};
  for (const id of new Set([...Object.keys(counts), ...recent.map(r => r.game), ...players.flatMap(p => Object.keys(p.byGame))])) games[id] = gameInfo(id);
  return {
    from, to: Number.isFinite(to) ? to : null, game, minGames: MIN_GAMES, prior: PRIOR,
    counts, games, players,
    h2h: { ids, m: ids.map(a => ids.map(b => (h2h[a] && h2h[a][b]) || 0)) },
    recent,
    aborts: [...P.values()].filter(s => s.aborts).sort((a, b) => b.aborts - a.aborts).map(s => ({ name: s.name, n: s.aborts })),
  };
}
