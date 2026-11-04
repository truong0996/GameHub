// Mô phỏng nhiều ván chỉ có bot để kiểm tra luật (không lỗi, không kẹt) và ước lượng độ dài ván.
//   node tools/simulate.js <gameId> [số ván] [key=value ...]
//   vd: node tools/simulate.js cocangua 50 horses=4 chaos=false
// Game theo lượt: dùng turn() + bot(). Game real-time: gọi tick() với đồng hồ giả (tickRate).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGames, defaultOpts } from '../hub/registry.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id, nArg, ...kv] = process.argv.slice(2);
const games = await loadGames(path.join(ROOT, 'games'), { dev: true });
if (!id || !games.has(id)) {
  console.log('Dùng: node tools/simulate.js <gameId> [số ván] [key=value ...]\nCác game: ' + [...games.keys()].join(', '));
  process.exit(1);
}
const { manifest: M, logic: L } = games.get(id);
const opts = defaultOpts(M);
for (const pair of kv) {
  const [k, v] = pair.split('=');
  opts[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
}
const N = +nArg || 20, MAX_STEPS = 200000;
let steps = 0, simMs = 0, stuck = 0;
const t0 = Date.now();

for (let g = 0; g < N; g++) {
  const seats = Array.from({ length: M.maxPlayers }, (_, i) => ({ kind: 'bot', name: 'Bot ' + i }));
  let now = 1e12;
  const { state } = L.create({ seats, opts: { ...opts }, now });
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
  steps += s;
  simMs += now - 1e12;
}

console.log(`${M.icon} ${M.name} — ${N} ván, ${M.maxPlayers} bot, opts ${JSON.stringify(opts)}`);
console.log(`  bước TB/ván: ${Math.round(steps / N)} · thời lượng TB (giả lập): ${(simMs / N / 60000).toFixed(1)} phút · kẹt: ${stuck} · chạy mất ${Date.now() - t0} ms`);
if (stuck) process.exit(1);
