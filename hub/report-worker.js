// Luồng nền tính bảng xếp hạng (GET /api/report) từ hub.db — truy vấn gộp có thể mất vài giây khi lịch sử rất dài,
// chạy ở đây để vòng lặp sự kiện của tiến trình phòng không bị chặn. Nhận { id, q }, trả { id, R } hoặc { id, err }.
import { parentPort, workerData } from 'node:worker_threads';
import { openDb } from './db.js';
import { MIN_GAMES, PRIOR, weightOf } from './stats.js';
import { EARNED_SQL, lookOfRow } from './wallet.js';
import { CREDIT } from '../public/shop-data.js';

const TOP = 200;          // số người hiện trên bảng xếp hạng
const H2H = 20;           // ma trận đối đầu: chừng này người đứng đầu
const RECENT = 40;
const { dir, gameInfo } = workerData;
const db = openDb(dir, { readOnly: true });
// Điều kiện chung: trong khoảng thời gian, lọc game nếu có (tham số :f, :t, :g).
const W = (a = '') => `${a}at >= :f AND ${a}at < :t AND (:g = '' OR ${a}game = :g)`;
// Mỗi câu chỉ dùng một phần tham số chung → cho phép tham số thừa.
const prep = sql => { const s = db.prepare(sql); s.setAllowUnknownNamedParameters(true); return s; };
const q = {
  counts: prep('SELECT game, COUNT(*) n FROM matches WHERE aborted = 0 AND at >= :f AND at < :t GROUP BY game'),
  agg: prep(`SELECT m.acct id, u.name, SUM(w(m.dur) * m.d) sum, SUM(w(m.dur)) weight, COUNT(*) games, SUM(m.rank = 1) wins
    FROM mp m LEFT JOIN users u ON u.id = m.acct WHERE m.d IS NOT NULL AND ${W('m.')} GROUP BY m.acct`),
  byGame: prep(`SELECT acct, game, COUNT(*) games, SUM(rank = 1) wins, SUM(d) sum FROM mp
    WHERE d IS NOT NULL AND ${W()} AND acct IN (SELECT value FROM json_each(:ids)) GROUP BY acct, game`),
  form: prep(`SELECT rank, d FROM mp WHERE acct = :a AND d IS NOT NULL AND ${W()} ORDER BY at DESC, mid DESC LIMIT 6`),
  h2h: prep(`SELECT a.acct a, b.acct b, COUNT(*) n FROM mp a JOIN mp b ON b.mid = a.mid
    WHERE a.d IS NOT NULL AND b.d IS NOT NULL AND a.rank < b.rank AND ${W('a.')}
      AND a.acct IN (SELECT value FROM json_each(:ids)) AND b.acct IN (SELECT value FROM json_each(:ids)) GROUP BY a.acct, b.acct`),
  recent: prep(`SELECT rec FROM matches WHERE ${W()} ORDER BY at DESC, id DESC LIMIT ${RECENT}`),
  aborts: prep(`SELECT m.by id, u.name, COUNT(*) n FROM matches m LEFT JOIN users u ON u.id = m.by
    WHERE m.aborted = 1 AND m.by IS NOT NULL AND ${W('m.')} GROUP BY m.by ORDER BY n DESC LIMIT 50`),
  name: prep('SELECT name FROM users WHERE id = ?'),
  wallet: prep('SELECT owned, eq, spent FROM wallet WHERE acct = ?'),
  earned: prep(EARNED_SQL),
};
const nameOf = id => (id && (q.name.get(id) || {}).name) || null;

function build({ from = 0, to = null, game = '' }) {
  const P = { f: from, t: to == null ? Number.MAX_SAFE_INTEGER : to, g: game };
  const counts = {};
  for (const r of q.counts.all(P)) counts[r.game] = r.n;

  let players = q.agg.all(P).map(s => ({
    id: s.id, name: s.name || '?', sum: Math.round(s.sum * 100) / 100, weight: s.weight, games: s.games, wins: s.wins,
    score: Math.round((s.sum / (s.weight + PRIOR)) * 100), avg: Math.round((s.sum / s.weight) * 100), rate: s.wins / s.games,
    enough: s.games >= MIN_GAMES,
  })).sort((a, b) => b.enough - a.enough || b.score - a.score || b.wins - a.wins || a.games - b.games || a.name.localeCompare(b.name, 'vi'));
  const total = players.length;
  players = players.slice(0, TOP);

  // Chi tiết chỉ cho những người hiện trên bảng.
  const ids = JSON.stringify(players.map(p => p.id)), by = new Map(players.map(p => [p.id, p]));
  for (const p of players) p.byGame = {};
  for (const r of q.byGame.all({ ...P, ids })) by.get(r.acct).byGame[r.game] = { games: r.games, wins: r.wins, sum: r.sum };
  for (const p of players) {
    p.form = q.form.all({ ...P, a: p.id }).reverse().map(r => (r.rank === 1 ? 'w' : r.d > 0 ? 'u' : r.d < 0 ? 'd' : 'e'));
    p.best = Object.entries(p.byGame).filter(([, g]) => g.wins).sort((a, b) => b[1].wins - a[1].wins || b[1].sum - a[1].sum)
      .slice(0, 2).map(([id]) => id);
    // Đồ trang trí đang mặc + credit hiện có (không theo kỳ đang lọc).
    const wr = q.wallet.get(p.id);
    p.look = lookOfRow(wr);
    p.credits = q.earned.get(CREDIT.dayCap, p.id).n - (wr ? wr.spent : 0);
  }

  const hIds = players.slice(0, H2H).map(p => p.id), hIdx = new Map(hIds.map((id, i) => [id, i]));
  const m = hIds.map(() => hIds.map(() => 0));
  if (hIds.length > 1) for (const r of q.h2h.all({ ...P, ids: JSON.stringify(hIds) })) m[hIdx.get(r.a)][hIdx.get(r.b)] = r.n;

  const recent = q.recent.all(P).map(r => {
    const x = JSON.parse(r.rec);
    return { at: x.at, dur: x.dur, w: x.aborted ? null : weightOf(x.dur), game: x.game, aborted: !!x.aborted, by: x.by ? nameOf(x.by) : null,
      players: x.players.map(y => ({ name: y.acct ? nameOf(y.acct) || y.name : y.name, bot: !!y.bot, guest: !y.bot && !y.acct, rank: y.rank })) };
  });
  const games = {};
  for (const id of new Set([...Object.keys(counts), ...recent.map(r => r.game), ...players.flatMap(p => Object.keys(p.byGame))]))
    games[id] = gameInfo[id] || { name: id, icon: '🎲' };
  return {
    from, to, game, minGames: MIN_GAMES, prior: PRIOR, total,
    counts, games, players, h2h: { ids: hIds, m }, recent,
    aborts: q.aborts.all(P).map(a => ({ name: a.name || '?', n: a.n })),
  };
}

parentPort.on('message', ({ id, q: query }) => {
  try { parentPort.postMessage({ id, R: build(query) }); } catch (e) { parentPort.postMessage({ id, err: e.message }); }
});
