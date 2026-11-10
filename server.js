// Celestials Game Hub — chơi game cùng bạn bè qua LAN / Internet. Node thuần, không cần npm install.
//   node server.js                 chạy ở cổng 3000
//   PORT=8080 node server.js       đổi cổng
//   HUB_DEV=1 node server.js       hiện cả các game trong thư mục bắt đầu bằng "_" (vd _template)
//   node server.js --online        mở luôn tunnel Cloudflare để chơi qua Internet (= npm run online)
//   HUB_DATA=<thư mục>             nơi lưu tài khoản + lịch sử ván + ví credit (mặc định ./data)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadGames } from './hub/registry.js';
import { createHub } from './hub/rooms.js';
import { acceptUpgrade } from './hub/ws.js';
import { startTunnel } from './hub/tunnel.js';
import { createAccounts } from './hub/accounts.js';
import { createStats, buildReport } from './hub/stats.js';
import { createWallet } from './hub/wallet.js';
import { createAvatars } from './hub/avatars.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const GAMES = path.join(ROOT, 'games');
const DATA = path.resolve(process.env.HUB_DATA || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT) || 3000;
const DEV = process.env.HUB_DEV === '1';
const ONLINE = process.argv.includes('--online') || process.env.HUB_ONLINE === '1';
let publicUrl = null; // link tunnel *.trycloudflare.com khi chạy --online

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.woff2': 'font/woff2',
};

function lanUrls() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker|Loopback/i.test(name)) continue; // card mạng ảo
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

const games = await loadGames(GAMES, { dev: DEV });
const gameDirs = new Set([...games.values()].map(g => g.dir));
const accounts = createAccounts(DATA), stats = createStats(DATA), wallet = createWallet(DATA, stats), avatars = createAvatars(DATA);
const hub = createHub({ games, lanUrls, publicUrl: () => publicUrl, accounts, stats, wallet, avatars });

// GET /api/report?from=<ms>&to=<ms>&game=<id> → bảng xếp hạng (public/report.html vẽ).
function report(url, res) {
  const q = url.searchParams, num = k => (q.get(k) && Number.isFinite(+q.get(k)) ? +q.get(k) : undefined);
  const gameInfo = id => { const g = games.get(id); return g ? { name: g.manifest.name, icon: g.manifest.icon } : { name: id, icon: '🎲' }; };
  let body;
  try {
    const R = buildReport(stats.list(), { from: num('from'), to: num('to'), game: q.get('game') || '' },
      id => (accounts.get(id) || {}).name, gameInfo);
    // Đồ trang trí đang mặc (hiệu ứng tên, danh hiệu) + credit hiện có (không theo kỳ đang lọc).
    for (const p of R.players) { p.look = wallet.look(p.id); p.credits = wallet.info(p.id).credits; p.av = avatars.url(p.id); }
    body = JSON.stringify(R);
  } catch (e) {
    console.error('[report]', e);
    res.writeHead(500); res.end('Lỗi tạo báo cáo'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body);
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
  const parts = decodeURIComponent(urlPath).split('/').filter(Boolean);
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

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/report') return report(url, res);
  const av = /^\/avatar\/([0-9a-f]+)$/.exec(url.pathname);
  if (av) return avatar(av[1], req, res);
  const file = resolveStatic(url.pathname === '/report' ? '/report.html' : url.pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
});

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/ws') { socket.destroy(); return; }
  const ws = acceptUpgrade(req, socket, head);
  if (ws) hub.handleConnection(ws);
});

server.listen(PORT, () => {
  console.log('\n🪐  Celestials Game Hub đã chạy!\n');
  console.log('   Game: ' + hub.catalog.map(g => `${g.icon} ${g.name}`).join(' · ') + (DEV ? '   (chế độ dev)' : ''));
  console.log(`\n   Máy này:          http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`   Bạn bè cùng wifi: ${u}`);
  if (!ONLINE) { console.log(`\n   Chơi qua Internet: chạy  npm run online  (hoặc node server.js --online)\n`); return; }
  console.log('\n   🌐 Đang mở tunnel Cloudflare để chơi qua Internet... (lần đầu có thể mất ~30s để tải cloudflared)');
  startTunnel(PORT, {
    onUrl: url => {
      publicUrl = url;
      console.log(`\n   🌐 Chơi qua Internet: ${url}   ← gửi link này cho bạn bè (nút "Copy link mời" cũng dùng link này)\n`);
    },
    onExit: why => { publicUrl = null; console.log(`\n   ⚠️  Tunnel Cloudflare đã dừng (${why}). Vẫn chơi được qua wifi/LAN.\n`); },
  });
});
