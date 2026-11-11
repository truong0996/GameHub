// Celestials Game Hub — chơi game cùng bạn bè qua LAN / Internet. Node thuần (≥ 22.13), không cần npm install.
//   node server.js                 chạy ở cổng 3000
//   PORT=8080 node server.js       đổi cổng
//   HUB_DEV=1 node server.js       hiện cả các game trong thư mục bắt đầu bằng "_" (vd _template)
//   node server.js --online        mở luôn tunnel Cloudflare để chơi qua Internet (= npm run online)
//   HUB_DATA=<thư mục>             nơi lưu tài khoản + lịch sử ván + ví credit (mặc định ./data, file hub.db)
//   HUB_WORKERS=<n>                số tiến trình phòng (mặc định = số lõi CPU; 1 = chạy gọn trong một tiến trình)
//
// Nhiều tiến trình: mỗi phòng chỉ sống trong MỘT tiến trình, chọn theo mã phòng (shardOf). Tiến trình chính chỉ nhận kết nối TCP,
// đọc dòng đầu của request rồi chuyển nguyên socket cho tiến trình phòng: /ws?room=<mã> → tiến trình giữ phòng đó, còn lại (trang web,
// /ws chưa có phòng) → xoay vòng. Kết nối đi qua proxy dùng lại kết nối cũ (Cloudflare, Azure) có thể lạc sang tiến trình khác —
// tiến trình đó gửi trả socket về tiến trình chính để chuyển tiếp. Dữ liệu dùng chung nằm trong hub.db (SQLite).
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import cluster from 'node:cluster';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { loadGames } from './hub/registry.js';
import { createHub, shardOf } from './hub/rooms.js';
import { acceptUpgrade } from './hub/ws.js';
import { startTunnel } from './hub/tunnel.js';
import { openDb, migrateLegacy } from './hub/db.js';
import { createAccounts } from './hub/accounts.js';
import { createStats } from './hub/stats.js';
import { createWallet } from './hub/wallet.js';
import { createAvatars } from './hub/avatars.js';
import { createReporter } from './hub/report.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const GAMES = path.join(ROOT, 'games');
const DATA = path.resolve(process.env.HUB_DATA || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT) || 3000;
const DEV = process.env.HUB_DEV === '1';
const ONLINE = process.argv.includes('--online') || process.env.HUB_ONLINE === '1';
const WORKERS = Math.max(1, Number(process.env.HUB_WORKERS) || os.availableParallelism());
const MULTI = WORKERS > 1;
const LOAD_MS = 5000;   // chu kỳ tiến trình phòng báo tải (GET /api/health)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.woff2': 'font/woff2',
};
const GZIP = /^(text\/|application\/json|image\/svg)/;

// Link LAN gửi kèm mỗi lần vào phòng. os.networkInterfaces() rất chậm trên Windows (hàng chục ms — đo được chiếm ~1/4 CPU
// lúc nhiều người vào phòng) nên nhớ kết quả 60s.
let lanCache = null, lanAt = 0;
function lanUrls() {
  if (lanCache && Date.now() - lanAt < 60000) return lanCache;
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker|Loopback/i.test(name)) continue; // card mạng ảo
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  lanAt = Date.now();
  return (lanCache = out);
}

function banner(gameList) {
  console.log('\n🪐  Celestials Game Hub đã chạy!\n');
  console.log('   Game: ' + gameList + (DEV ? '   (chế độ dev)' : ''));
  if (MULTI) console.log(`   ${WORKERS} tiến trình phòng (HUB_WORKERS)`);
  console.log(`\n   Máy này:          http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`   Bạn bè cùng wifi: ${u}`);
  if (!ONLINE) console.log(`\n   Chơi qua Internet: chạy  npm run online  (hoặc node server.js --online)\n`);
}
function tunnel(onUrl) {
  if (!ONLINE) return;
  console.log('\n   🌐 Đang mở tunnel Cloudflare để chơi qua Internet... (lần đầu có thể mất ~30s để tải cloudflared)');
  startTunnel(PORT, {
    onUrl: url => {
      onUrl(url);
      console.log(`\n   🌐 Chơi qua Internet: ${url}   ← gửi link này cho bạn bè (nút "Copy link mời" cũng dùng link này)\n`);
    },
    onExit: why => { onUrl(null); console.log(`\n   ⚠️  Tunnel Cloudflare đã dừng (${why}). Vẫn chơi được qua wifi/LAN.\n`); },
  });
}

if (MULTI && cluster.isPrimary) primary();
else await worker(MULTI ? Number(process.env.HUB_SHARD) : 0);

// ================= TIẾN TRÌNH CHÍNH (chỉ khi HUB_WORKERS > 1) =================
function primary() {
  const db = openDb(DATA);
  migrateLegacy(db, DATA);
  db.close();

  const workers = [], ready = [], queued = [], loads = [];
  let publicUrl = null, rr = 0, stopping = false, bannerShown = false;
  const all = msg => { for (let i = 0; i < WORKERS; i++) if (ready[i]) workers[i].send(msg); };

  function fork(i) {
    ready[i] = false;
    queued[i] ||= [];
    const w = cluster.fork({ HUB_SHARD: String(i) });
    workers[i] = w;
    w.on('message', (m, sock) => {
      if (m.t === 'ready') {
        ready[i] = true;
        w.send({ t: 'pub', url: publicUrl });
        for (const [s, h] of queued[i].splice(0)) deliver(i, s, h);
        if (!bannerShown && ready.filter(Boolean).length === WORKERS) { bannerShown = true; banner(m.games); tunnel(url => { publicUrl = url; all({ t: 'pub', url }); }); }
      } else if (m.t === 'fwd' && sock) deliver(m.shard, sock, Buffer.from(m.head, 'base64'));
      else if (m.t === 'acct') { for (let k = 0; k < WORKERS; k++) if (k !== i && ready[k]) workers[k].send(m); }
      else if (m.t === 'load') loads[i] = m.load;
    });
    w.on('exit', (code, sig) => {
      if (stopping) return;
      console.error(`[hub] tiến trình phòng ${i} dừng (${sig || code}) — khởi động lại (mất các phòng của nó)`);
      loads[i] = null;
      setTimeout(() => fork(i), 1000);
    });
  }
  for (let i = 0; i < WORKERS; i++) fork(i);
  // Bảng tải chung gửi cho mọi tiến trình (ai nhận GET /api/health cũng trả lời được).
  setInterval(() => all({ t: 'loads', loads }), LOAD_MS).unref();

  function deliver(i, sock, head) {
    if (!ready[i]) { queued[i].push([sock, head]); return; }
    workers[i].send({ t: 'sock', head: head.toString('base64') }, sock, err => { if (err) sock.destroy(); });
  }
  // Đọc tới hết phần đầu request (hoặc 16KB), rồi chọn tiến trình.
  const server = net.createServer({ pauseOnConnect: true }, sock => {
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => sock.destroy(), 15000);
    const onData = d => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      if (buf.indexOf('\r\n\r\n') < 0 && buf.length < 16384) return;
      clearTimeout(timer);
      sock.removeListener('data', onData);
      sock.pause();
      const line = buf.toString('latin1', 0, Math.max(0, buf.indexOf('\r\n')));
      const m = /^[A-Z]+ (\S+) HTTP/.exec(line);
      let i = -1;
      if (m) {
        try {
          const u = new URL(m[1], 'http://x'), code = u.searchParams.get('room');
          if (u.pathname === '/ws' && code) i = shardOf(code, WORKERS);
        } catch {}
      }
      deliver(i >= 0 ? i : rr++ % WORKERS, sock, buf);
    };
    sock.on('data', onData);
    sock.on('error', () => { clearTimeout(timer); sock.destroy(); });
    sock.on('close', () => clearTimeout(timer));
    sock.resume();
  });
  server.listen(PORT);
  const stop = () => { stopping = true; for (const w of workers) w.kill(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// ================= TIẾN TRÌNH PHÒNG =================
async function worker(shard) {
  const games = await loadGames(GAMES, { dev: DEV });
  const gameDirs = new Set([...games.values()].map(g => g.dir));
  const gameInfo = Object.fromEntries([...games].map(([id, g]) => [id, { name: g.manifest.name, icon: g.manifest.icon }]));
  const db = openDb(DATA);
  if (!MULTI) migrateLegacy(db, DATA);
  const accounts = createAccounts(db), stats = createStats(db), wallet = createWallet(db), avatars = createAvatars(DATA);
  const reporter = createReporter(DATA, gameInfo);
  let publicUrl = null, loads = [];
  const hub = createHub({ games, lanUrls, publicUrl: () => publicUrl, accounts, stats, wallet, avatars,
    shard, shards: WORKERS, onAcct: id => { if (MULTI) process.send({ t: 'acct', id }); } });

  // Độ trễ vòng lặp sự kiện (p99) — tiến trình quá tải thì số này tăng trước tiên.
  // cpu = % một lõi tiến trình này dùng trong chu kỳ vừa rồi (gần 100 = tiến trình đã bão hoà, cần thêm tiến trình/máy).
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();
  let cpu0 = process.cpuUsage(), t0 = performance.now(), cpu = 0;
  const myLoad = () => ({ shard, ...hub.load(), cpu, lagMs: Math.round(lag.percentile(99) / 1e6),
    rssMB: Math.round(process.memoryUsage.rss() / 1048576), heapMB: Math.round(process.memoryUsage().heapUsed / 1048576) });
  setInterval(() => {
    const c = process.cpuUsage(cpu0), t = performance.now();
    cpu = Math.round((c.user + c.system) / 10 / (t - t0));
    cpu0 = process.cpuUsage(); t0 = t;
    const l = myLoad();
    lag.reset();
    if (MULTI) process.send({ t: 'load', load: l }); else loads = [l];
  }, LOAD_MS).unref();

  // GET /api/report?from=<ms>&to=<ms>&game=<id> → bảng xếp hạng (public/report.html vẽ). Tính ở luồng nền, nhớ 30s.
  function report(url, res) {
    const q = url.searchParams, num = k => (q.get(k) && Number.isFinite(+q.get(k)) ? +q.get(k) : undefined);
    reporter.get({ from: num('from') ?? 0, to: num('to') ?? null, game: q.get('game') || '' }).then(R => {
      const body = JSON.stringify({ ...R, players: R.players.map(p => ({ ...p, av: avatars.url(p.id) })) });
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(body);
    }, e => {
      console.error('[report]', e);
      res.writeHead(500); res.end('Lỗi tạo báo cáo');
    });
  }

  // GET /avatar/<id tài khoản>?v=<phiên bản> → ảnh đại diện. URL đổi theo nội dung nên cho cache lâu.
  // nosniff + CSP chặn trình duyệt hiểu ảnh thành thứ khác (dù server đã chỉ nhận JPEG/PNG/WebP).
  function avatar(id, req, res) {
    const a = avatars.file(id);
    if (!a) { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end(); return; }
    fs.readFile(a.file, (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': a.type, 'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  // Chỉ phục vụ file nằm trong base; chặn ../ và chặn file logic phía server của game.
  function resolveStatic(urlPath) {
    let parts;
    try { parts = decodeURIComponent(urlPath).split('/').filter(Boolean); } catch { return null; }
    if (parts[0] === 'games') {
      const [, dir, ...rest] = parts;
      if (!gameDirs.has(dir) || !rest.length) return null;
      if (/^server/i.test(rest[0])) return null;   // mọi file/thư mục tên server* (server.js, server-bot.js, server-words.js, server/...) chỉ dành cho server
      return safeJoin(path.join(GAMES, dir), rest);
    }
    return safeJoin(PUBLIC, parts.length ? parts : ['index.html']);
  }
  function safeJoin(base, parts) {
    const file = path.resolve(base, ...parts);
    return file.startsWith(base + path.sep) ? file : null;
  }

  // File tĩnh: giữ trong RAM theo (mtime, size) — sửa file là tự nạp lại. ETag → trình duyệt hỏi lại được trả 304 (không gửi lại nội dung);
  // file chữ > 1KB nén gzip một lần mỗi phiên bản.
  const files = new Map();
  async function serveStatic(file, req, res) {
    let st;
    try { st = await fs.promises.stat(file); } catch { st = null; }
    if (!st || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    let c = files.get(file);
    if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
      let buf;
      try { buf = await fs.promises.readFile(file); } catch { res.writeHead(404); res.end('Not found'); return; }
      c = { mtimeMs: st.mtimeMs, size: st.size, buf, gz: null, etag: `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"` };
      files.set(file, c);
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: c.etag };
    const zip = GZIP.test(type) && c.buf.length > 1024;
    if (zip) headers.Vary = 'Accept-Encoding';
    if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, headers); res.end(); return; }
    let body = c.buf;
    if (zip && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      c.gz ||= zlib.gzipSync(c.buf);
      body = c.gz;
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/report') return report(url, res);
    if (url.pathname === '/api/health') {
      const list = MULTI ? loads.filter(Boolean) : [myLoad()];
      const sum = k => list.reduce((n, l) => n + l[k], 0);
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ workers: WORKERS, rooms: sum('rooms'), playing: sum('playing'), conns: sum('conns'), list }));
      return;
    }
    const av = /^\/avatar\/([0-9a-f]+)$/.exec(url.pathname);
    if (av) return avatar(av[1], req, res);
    const file = resolveStatic(url.pathname === '/report' ? '/report.html' : url.pathname);
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    serveStatic(file, req, res).catch(e => { console.error('[static]', e); if (!res.headersSent) { res.writeHead(500); res.end(); } });
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const code = url.searchParams.get('room');
    if (MULTI && code && shardOf(code, WORKERS) !== shard) {
      // Lạc tiến trình (proxy dùng lại kết nối cũ): dựng lại phần đầu request rồi gửi socket về tiến trình chính để chuyển tiếp.
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      const raw = Buffer.concat([Buffer.from(lines.join('\r\n') + '\r\n\r\n', 'latin1'), head || Buffer.alloc(0)]);
      process.send({ t: 'fwd', shard: shardOf(code, WORKERS), head: raw.toString('base64') }, socket);
      return;
    }
    const ws = acceptUpgrade(req, socket, head);
    if (ws) hub.handleConnection(ws);
  });

  const gameList = hub.catalog.map(g => `${g.icon} ${g.name}`).join(' · ');
  if (!MULTI) {
    server.listen(PORT, () => { banner(gameList); tunnel(url => { publicUrl = url; }); });
    return;
  }
  // Tiến trình chính chuyển socket sang: nạp vào máy chủ HTTP như kết nối mới, "phát lại" phần đầu đã đọc.
  process.on('message', (m, sock) => {
    if (m.t === 'sock' && sock) {
      server.emit('connection', sock);
      sock.emit('data', Buffer.from(m.head, 'base64'));
      sock.resume();
    } else if (m.t === 'pub') publicUrl = m.url;
    else if (m.t === 'acct') hub.acctChanged(m.id);
    else if (m.t === 'loads') loads = m.loads;
  });
  process.on('disconnect', () => process.exit(0));   // tiến trình chính đã thoát
  process.send({ t: 'ready', games: gameList });
}
