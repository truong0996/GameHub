// Mô phỏng nhiều ván chỉ có bot để kiểm tra luật (không lỗi, không kẹt) và ước lượng độ dài ván.
//   node tools/simulate.js <gameId> [số ván] [key=value ...]
//   vd: node tools/simulate.js cocangua 50 horses=4 chaos=false
//   players=<n>: chỉ có n bot, ngồi ở n ghế ngẫu nhiên (mặc định ngồi kín maxPlayers ghế)
// Game theo lượt: dùng turn() + bot(). Game real-time: gọi tick() với đồng hồ giả (tickRate).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGames, defaultOpts } from '../hub/registry.js';
import { ranksOf } from '../hub/stats.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id, nArg, ...kv] = process.argv.slice(2);
const games = await loadGames(path.join(ROOT, 'games'), { dev: true });
if (!id || !games.has(id)) {
  console.log('Dùng: node tools/simulate.js <gameId> [số ván] [key=value ...]\nCác game: ' + [...games.keys()].join(', '));
  process.exit(1);
}
const { manifest: M, logic: L } = games.get(id);
const opts = defaultOpts(M);
let players = 0;
for (const pair of kv) {
  const [k, v] = pair.split('=');
  if (k === 'players') { players = +v; continue; }
  opts[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
}
// Ghế dùng được với tuỳ chọn này (manifest.seatOn), mặc định ngồi kín.
const usable = [...Array(M.maxPlayers).keys()].filter(i => !M.seatOn || M.seatOn(i, opts));
players = Math.max(M.minPlayers, Math.min(usable.length, players || usable.length));
const N = +nArg || 20, MAX_STEPS = 200000;
let steps = 0, simMs = 0, stuck = 0;
const rankTally = { one: 0, tie: 0 };
const t0 = Date.now();

for (let g = 0; g < N; g++) {
  // create() được quyền từ chối cách ngồi (vd một đội thiếu người) → bốc ghế lại.
  let sat, state, now = 1e12;
  for (let tries = 0; ; tries++) {
    sat = new Set(usable.slice().sort(() => Math.random() - 0.5).slice(0, players));
    const seats = Array.from({ length: M.maxPlayers }, (_, i) => (sat.has(i) ? { kind: 'bot', name: 'Bot ' + i } : null));
    try { ({ state } = L.create({ seats, opts: { ...opts }, now })); break; } catch (e) { if (tries > 200) throw e; }
  }
  let s = 0, lastKey;
  for (; s < MAX_STEPS && !L.isOver(state); s++) {
    const t = L.turn ? L.turn(state) : null;
    if (t) {
      // Quyết định cùng lúc ({ seats, key }): cả nhóm mất ~1.5s mỗi pha; theo lượt: hub chờ autoDelay, hoặc thời gian "suy nghĩ".
      const seat = t.seats ? t.seats[0] : t.seat;
      if (t.seats) { if (t.key !== lastKey) now += 1500; lastKey = t.key; }
      else now += t.auto ? (t.autoDelay ?? 300) : 800;
      const a = t.auto || L.bot(state, seat, {});
      const r = L.act(state, seat, a, now);
      if (!r.ok) throw new Error(`Ván ${g}: hành động bot bị từ chối: ${r.err} ${JSON.stringify(a)}`);
      now += L.animDuration ? L.animDuration(r.events || []) : 0;
    } else if (L.tickRate) {
      now += 1000 / L.tickRate;
      L.tick(state, now);
    } else throw new Error('turn() trả về null nhưng game không có tick() — ván bị kẹt');
  }
  if (!L.isOver(state)) stuck++;
  else {
    // Thứ hạng ghi vào bảng xếp hạng: mọi ghế có người đều phải có hạng, có đúng người hạng 1.
    const seated = [...sat].sort((a, b) => a - b), ranks = ranksOf(L, state, seated);
    if (ranks.some(r => !Number.isInteger(r) || r < 1 || r > seated.length) || !ranks.includes(1) ||
      (L.result && new Set(L.result(state).map(x => x.p)).size !== seated.length))
      throw new Error(`Ván ${g}: result() xếp hạng sai: ${JSON.stringify(L.result ? L.result(state) : ranks)} (ghế ${seated})`);
    rankTally[ranks.filter(r => r === 1).length > 1 ? 'tie' : 'one']++;
  }
  steps += s;
  simMs += now - 1e12;
}

console.log(`${M.icon} ${M.name} — ${N} ván, ${players} bot, opts ${JSON.stringify(opts)}`);
console.log(`  bước TB/ván: ${Math.round(steps / N)} · thời lượng TB (giả lập): ${(simMs / N / 60000).toFixed(1)} phút · kẹt: ${stuck} · đồng hạng nhất: ${rankTally.tie} · chạy mất ${Date.now() - t0} ms`);
if (stuck) process.exit(1);
