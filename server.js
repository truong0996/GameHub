/* Cờ Cá Ngựa — Lục Mã Hỗn Chiến : server online (Node thuần, không cần npm install)
 * Chạy:  node server.js        (đổi cổng: PORT=8080 node server.js)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const G = require('./game.js');

const PORT = Number(process.env.PORT) || 3000;
const TURN_MS = 30000;      // thời gian suy nghĩ mỗi lượt
const OFFLINE_MS = 3000;    // người chơi mất kết nối → tự đi sau 3s
const BOT_NAMES = ['Tí', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ'];
const EMOTES = ['😂', '😎', '😡', '😭', '🔥', '👏', '🐴', '💀', '🙏', '🤡'];
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/game.js': ['game.js', 'application/javascript; charset=utf-8'],
};

const rooms = new Map();

const id = n => crypto.randomBytes(n).toString('hex');
const cleanName = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 16) || 'Ẩn danh';

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  return out;
}

function makeRoom() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do code = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  while (rooms.has(code));
  const room = {
    code, host: null, members: new Map(), // pid(bí mật) -> { uid(công khai), name, conns:Set }
    seats: Array.from({ length: G.NP }, () => ({ kind: 'open', pid: null })),
    opts: { horses: 3, block: true, chaos: true, eventEvery: 10, home: 'fast' },
    game: null, gameId: 0, seq: 0, timer: null, busyUntil: 0, deadline: 0, touched: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function addMember(room, name) {
  const m = { pid: id(12), uid: id(4), name, conns: new Set(), lastEmote: 0 };
  room.members.set(m.pid, m);
  return m;
}

const online = (room, pid) => { const m = room.members.get(pid); return !!(m && m.conns.size); };
const seatOf = (room, pid) => room.seats.findIndex(s => s.kind === 'human' && s.pid === pid);
function seatName(room, i) {
  const s = room.seats[i];
  if (s.kind === 'human') return (room.members.get(s.pid) || {}).name || '?';
  if (s.kind === 'bot') return 'Bot ' + BOT_NAMES[i];
  return '';
}

function publicRoom(room) {
  const hostM = [...room.members.values()].find(m => m.uid === room.host);
  return {
    code: room.code, host: room.host, opts: room.opts, gameId: room.gameId, turnMs: TURN_MS,
    seats: room.seats.map((s, i) => ({
      kind: s.kind, uid: s.pid ? (room.members.get(s.pid) || {}).uid : null, name: seatName(room, i),
      online: s.kind === 'bot' || (s.kind === 'human' && online(room, s.pid)),
    })),
    members: [...room.members.values()].map(m => ({ uid: m.uid, name: m.name, online: m.conns.size > 0, seat: seatOf(room, m.pid) })),
    hostName: hostM ? hostM.name : '',
  };
}

function sendAll(room, obj) {
  const data = `data: ${JSON.stringify(obj)}\n\n`;
  for (const m of room.members.values()) for (const res of m.conns) res.write(data);
}

function broadcast(room, events = []) {
  room.seq++;
  sendAll(room, {
    type: 'state', seq: room.seq, room: publicRoom(room), game: room.game, events,
    deadlineIn: room.deadline ? Math.max(0, room.deadline - Date.now()) : 0,
  });
}

function afterAction(room, events) {
  room.busyUntil = Math.max(Date.now(), room.busyUntil) + G.animDuration(events);
  schedule(room);
  broadcast(room, events);
}

// Hẹn giờ cho bot / tự đi khi chỉ có 1 lựa chọn / hết giờ suy nghĩ.
function schedule(room) {
  clearTimeout(room.timer);
  room.timer = null;
  room.deadline = 0;
  const g = room.game;
  if (!g || g.phase === 'over') return;
  const p = g.turn, seat = room.seats[p];
  const wait = Math.max(0, room.busyUntil - Date.now());
  let delay, mode;
  if (seat.kind === 'bot') { delay = wait + 450 + Math.random() * 600; mode = 'bot'; }
  else if (g.phase === 'move' && G.distinctMoves(g) === 1) { delay = wait + 300; mode = 'single'; }
  else {
    delay = wait + (online(room, seat.pid) ? TURN_MS : OFFLINE_MS);
    mode = 'timeout';
    room.deadline = Date.now() + delay;
  }
  room.timer = setTimeout(() => {
    if (room.game !== g || g.phase === 'over' || g.turn !== p) return;
    const a = mode === 'single' ? { type: 'move', h: g.legal[0].h } : G.botAction(g, p, mode === 'timeout');
    const r = G.act(g, p, a);
    if (!r.ok) { console.error('[auto] lỗi:', r.err, a); return; }
    if (mode === 'timeout') r.events.unshift({ t: 'auto', p });
    afterAction(room, r.events);
  }, delay);
}

function handle(b) {
  const a = b.action;
  if (a === 'create') {
    const room = makeRoom();
    const m = addMember(room, cleanName(b.name));
    room.host = m.uid;
    return { code: room.code, pid: m.pid, uid: m.uid, lan: lanUrls() };
  }
  const room = rooms.get(String(b.code || '').toUpperCase().trim());
  if (!room) throw new Error('Không tìm thấy phòng (có thể server đã khởi động lại)');
  room.touched = Date.now();

  if (a === 'join') {
    let m = room.members.get(b.pid);
    if (!m && !b.name) throw new Error('Phiên cũ đã hết hạn, hãy vào lại phòng');
    if (!m) m = addMember(room, cleanName(b.name));
    else if (b.name && !room.game) m.name = cleanName(b.name);
    if (!room.host) room.host = m.uid;
    broadcast(room);
    return { code: room.code, pid: m.pid, uid: m.uid, lan: lanUrls() };
  }

  const m = room.members.get(b.pid);
  if (!m) throw new Error('Bạn chưa vào phòng này');
  const isHost = room.host === m.uid;
  const needHost = () => { if (!isHost) throw new Error('Chỉ chủ phòng mới làm được'); };
  const needLobby = () => { if (room.game) throw new Error('Ván đang diễn ra'); };

  switch (a) {
    case 'ping': return {};
    case 'sit': {
      needLobby();
      const i = b.seat | 0, s = room.seats[i];
      if (!s || s.kind !== 'open') throw new Error('Ghế này không trống');
      const cur = seatOf(room, b.pid);
      if (cur >= 0) room.seats[cur] = { kind: 'open', pid: null };
      room.seats[i] = { kind: 'human', pid: b.pid };
      break;
    }
    case 'unsit': {
      needLobby();
      const cur = seatOf(room, b.pid);
      if (cur >= 0) room.seats[cur] = { kind: 'open', pid: null };
      break;
    }
    case 'seatKind': {
      needHost(); needLobby();
      const i = b.seat | 0;
      if (!room.seats[i] || !['open', 'bot', 'closed'].includes(b.kind)) throw new Error('Ghế không hợp lệ');
      room.seats[i] = { kind: b.kind, pid: null };
      break;
    }
    case 'fillBots': {
      needHost(); needLobby();
      room.seats.forEach((s, i) => { if (s.kind === 'open') room.seats[i] = { kind: 'bot', pid: null }; });
      break;
    }
    case 'opts': {
      needHost(); needLobby();
      const o = b.opts || {};
      if ([2, 3, 4].includes(o.horses)) room.opts.horses = o.horses;
      if (typeof o.block === 'boolean') room.opts.block = o.block;
      if (typeof o.chaos === 'boolean') room.opts.chaos = o.chaos;
      if ([6, 10, 15].includes(o.eventEvery)) room.opts.eventEvery = o.eventEvery;
      if (['fast', 'classic'].includes(o.home)) room.opts.home = o.home;
      break;
    }
    case 'start': {
      needHost();
      if (room.game && room.game.phase !== 'over') throw new Error('Ván đang diễn ra');
      const info = room.seats.map((s, i) => (s.kind === 'human' || s.kind === 'bot' ? { kind: s.kind, name: seatName(room, i) } : null));
      if (info.filter(Boolean).length < 2) throw new Error('Cần ít nhất 2 người chơi (người hoặc bot)');
      const g = G.newGame(info, room.opts);
      room.game = g.state;
      room.gameId++;
      room.busyUntil = Date.now();
      afterAction(room, g.events);
      return {};
    }
    case 'lobby': {
      needHost();
      clearTimeout(room.timer);
      room.game = null;
      room.deadline = 0;
      break;
    }
    case 'roll': case 'move': case 'card': {
      if (!room.game) throw new Error('Chưa bắt đầu ván');
      const seat = seatOf(room, b.pid);
      if (seat < 0) throw new Error('Bạn đang ở chế độ xem');
      const r = G.act(room.game, seat, { type: a, h: b.h, card: b.card, value: b.value, target: b.target });
      if (!r.ok) throw new Error(r.err);
      afterAction(room, r.events);
      return {};
    }
    case 'emote': {
      if (!EMOTES.includes(b.e) || Date.now() - m.lastEmote < 600) return {};
      m.lastEmote = Date.now();
      sendAll(room, { type: 'emote', uid: m.uid, name: m.name, seat: seatOf(room, b.pid), e: b.e });
      return {};
    }
    default: throw new Error('Hành động không hợp lệ');
  }
  broadcast(room);
  return {};
}

function sse(req, res, url) {
  const room = rooms.get((url.searchParams.get('code') || '').toUpperCase());
  const pid = url.searchParams.get('pid');
  const m = room && room.members.get(pid);
  if (!m) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  m.conns.add(res);
  room.touched = Date.now();
  const myTurn = () => room.game && seatOf(room, pid) === room.game.turn;
  if (myTurn()) schedule(room);
  broadcast(room);
  req.on('close', () => {
    m.conns.delete(res);
    if (myTurn()) schedule(room);
    broadcast(room);
    // Chủ phòng rời đi lâu → chuyển quyền cho người khác đang online.
    if (room.host === m.uid) setTimeout(() => {
      if (m.conns.size || room.host !== m.uid) return;
      const next = [...room.members.values()].find(x => x.conns.size);
      if (next) { room.host = next.uid; broadcast(room); }
    }, 15000);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && STATIC[url.pathname]) {
    const [file, type] = STATIC[url.pathname];
    fs.readFile(path.join(__dirname, file), (err, buf) => {
      if (err) { res.writeHead(500); res.end('Lỗi đọc file'); return; }
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/events') return sse(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let out;
      try { out = { ok: true, ...handle(JSON.parse(body || '{}')) }; }
      catch (e) { out = { ok: false, err: e.message || String(e) }; }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
});

// Giữ kết nối SSE sống + dọn phòng bỏ hoang.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    let conns = 0;
    for (const m of room.members.values()) for (const res of m.conns) { res.write(': ping\n\n'); conns++; }
    if (!conns && now - room.touched > 30 * 60 * 1000) { clearTimeout(room.timer); rooms.delete(code); }
  }
}, 20000);

server.listen(PORT, () => {
  console.log('\n🐴  Cờ Cá Ngựa — Lục Mã Hỗn Chiến đã chạy!\n');
  console.log(`   Máy này:          http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`   Bạn bè cùng wifi: ${u}`);
  console.log('\n   Chơi qua Internet: chạy thêm  npx cloudflared tunnel --url http://localhost:' + PORT);
  console.log('   rồi gửi link https://....trycloudflare.com cho bạn bè.\n');
});
