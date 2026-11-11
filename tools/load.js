// Đo tải: mở nhiều phòng cùng lúc với một server đang chạy (Node 22+), mỗi phòng vài "người" (kết nối WebSocket) + bot lấp ghế còn lại.
//   node tools/load.js <gameId> [số phòng] [người/phòng] [giây] [port]
//   vd: node tools/load.js maodanh 200 4 30 3917
// "Người" ngồi yên (game theo lượt thì máy đi giúp khi hết giờ, real-time thì bot vẫn chơi) — đủ để đo phần nặng nhất là phát state.
// In ra: số tin + băng thông server gửi xuống, tỉ lệ so với gửi nguyên state (dựng lại state ở một kết nối mỗi phòng),
// và GET /api/health (độ trễ vòng lặp sự kiện p99, RAM, số kết nối của từng tiến trình phòng).
// Lưu ý: bản thân máy chạy load.js cũng tốn CPU parse tin — đo tải thật lớn thì chạy load.js ở máy khác / nhiều tiến trình.
import { apply as applyDelta } from '../public/delta.js';

const [gameId = 'maodanh', nRooms = '50', perRoom = '3', secs = '20', port = '3000'] = process.argv.slice(2);
const BASE = `localhost:${port}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tot = { msgs: 0, bytes: 0, game: 0, trackBytes: 0, trackFull: 0, errors: 0 };

function client(code, track) {
  const ws = new WebSocket(`ws://${BASE}/ws${code ? '?room=' + code : ''}`);
  const c = { ws, seq: 0, pending: new Map(), state: null, matchId: null };
  ws.onmessage = e => {
    tot.msgs++; tot.bytes += e.data.length;
    if (e.data.startsWith('{"t":"res"')) { const m = JSON.parse(e.data); c.pending.get(m.id)?.(m); c.pending.delete(m.id); return; }
    if (!e.data.startsWith('{"t":"game"')) return;
    tot.game++;
    if (!track) return;
    // Kết nối theo dõi: dựng lại state để so dung lượng delta với gửi nguyên state.
    const m = JSON.parse(e.data);
    if (m.ds) { if (c.matchId !== m.matchId) { tot.errors++; return; } c.state = applyDelta(c.state, m.ds); }
    else { c.state = m.state; c.matchId = m.matchId; }
    tot.trackBytes += e.data.length;
    tot.trackFull += e.data.length - (m.ds ? JSON.stringify(m.ds).length - JSON.stringify(c.state).length : 0);
  };
  ws.onerror = () => { tot.errors++; };
  c.req = (t, data = {}) => new Promise(res => { const id = ++c.seq; c.pending.set(id, res); ws.send(JSON.stringify({ id, t, ...data })); });
  c.ready = new Promise((res, rej) => { ws.onopen = res; ws.addEventListener('error', rej); });
  return c;
}

async function room() {
  const host = client(null, true);
  await host.ready;
  const r = await host.req('create', { name: 'Tải', game: gameId });
  if (!r.ok) throw new Error(r.err);
  await host.req('selectGame', { game: gameId });
  await host.req('sit', { seat: 0 });
  const others = [];
  for (let i = 1; i < +perRoom; i++) {
    const c = client(r.code, false);
    await c.ready;
    const j = await c.req('join', { code: r.code, name: 'Tải ' + i });
    if (!j.ok) throw new Error(j.err);
    await c.req('sit', { seat: i });
    others.push(c);
  }
  await host.req('fillBots');
  const s = await host.req('start');
  if (!s.ok) throw new Error(s.err);
  return [host, ...others];
}

const health = async () => (await fetch(`http://${BASE}/api/health`)).json();
const t0 = Date.now();
const conns = [];
// Mở phòng theo từng đợt 20 phòng.
for (let i = 0; i < +nRooms; i += 20) {
  const batch = await Promise.all(Array.from({ length: Math.min(20, +nRooms - i) }, () => room().catch(e => { tot.errors++; console.error(e.message); return []; })));
  conns.push(...batch.flat());
}
console.log(`Đã mở ${nRooms} phòng ${gameId}, ${conns.length} kết nối trong ${((Date.now() - t0) / 1000).toFixed(1)}s. Đo ${secs}s...`);
Object.assign(tot, { msgs: 0, bytes: 0, game: 0, trackBytes: 0, trackFull: 0 });
const m0 = Date.now();
let peak = null;
for (let k = 0; k < +secs; k += 5) {
  await sleep(Math.min(5, +secs - k) * 1000);
  const h = await health();
  if (k >= 5 && (!peak || Math.max(...h.list.map(l => l.cpu)) > Math.max(...peak.list.map(l => l.cpu)))) peak = h;
}
const dt = (Date.now() - m0) / 1000, h = await health();
console.log(`\nServer gửi xuống: ${(tot.msgs / dt).toFixed(0)} tin/s, ${(tot.bytes / dt / 1024).toFixed(0)} KB/s` +
  ` (${(tot.bytes / dt / conns.length / 1024).toFixed(1)} KB/s mỗi kết nối); tin game ${(tot.game / dt).toFixed(0)}/s`);
if (tot.trackFull) console.log(`Delta: ${(tot.trackBytes / tot.trackFull * 100).toFixed(0)}% dung lượng so với gửi nguyên state`);
console.log(`Tiến trình phòng (chu kỳ 5s bận nhất trong lúc đo; CPU = % một lõi):`);
for (const l of (peak || h).list.sort((a, b) => a.shard - b.shard)) console.log(`  #${l.shard}: ${l.rooms} phòng, ${l.conns} kết nối, CPU ${l.cpu}%, trễ p99 ${l.lagMs}ms, RAM ${l.rssMB}MB` +
  (l.heapMB != null ? ` (heap ${l.heapMB}MB)` : ''));
console.log(`Tổng: ${h.rooms} phòng (${h.playing} đang chơi), ${h.conns} kết nối; lỗi phía đo: ${tot.errors}`);
for (const c of conns) c.ws.close();
await sleep(300);
process.exit(0);
