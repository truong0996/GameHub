// WebSocket server tối giản theo RFC 6455 — không dùng thư viện ngoài.
// Hỗ trợ: text/binary frame, phân mảnh (continuation), ping/pong, close. Không hỗ trợ nén (permessage-deflate).
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 256 * 1024;
const HEARTBEAT_MS = 25000;

const live = new Set();

export class WebSocketConn extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.fragLen = 0;
    this.fragOp = 0x1;
    this.open = true;
    this.alive = true;
    socket.setNoDelay(true);
    socket.on('data', d => this._onData(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => { socket.destroy(); this._closed(); });
    live.add(this);
  }

  _onData(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        if (b.readUInt32BE(2) !== 0) return this.close(1009);
        len = b.readUInt32BE(6); off = 10;
      }
      if (len > MAX_PAYLOAD) return this.close(1009);
      if (!masked) return this.close(1002); // client bắt buộc phải mask
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      off += 4;
      const data = Buffer.from(b.subarray(off, off + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + len);
      this._frame(fin, op, data);
    }
  }

  _frame(fin, op, data) {
    if (op === 0x8) return this.close();
    if (op === 0x9) return this._send(0xA, data);
    if (op === 0xA) { this.alive = true; return; }
    if (op > 0x2) return this.close(1002);
    if (op) this.fragOp = op;
    this.frags.push(data);
    this.fragLen += data.length;
    if (this.fragLen > MAX_PAYLOAD) return this.close(1009);
    if (!fin) return;
    const buf = Buffer.concat(this.frags);
    this.frags = []; this.fragLen = 0;
    this.alive = true;
    if (this.fragOp === 0x2) this.emit('binary', buf);
    else this.emit('message', buf.toString('utf8'));
  }

  _send(op, payload) {
    if (!this.open || this.socket.destroyed) return;
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(len, 6); }
    this.socket.write(Buffer.concat([head, payload]));
  }

  send(str) { this._send(0x1, Buffer.from(str, 'utf8')); }
  sendBinary(buf) { this._send(0x2, buf); }
  get buffered() { return this.socket.writableLength; }
  ping() { this._send(0x9, Buffer.alloc(0)); }

  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code);
    this._send(0x8, p);
    this.open = false;
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 1000).unref();
    this._closed();
  }

  _closed() {
    if (this._done) return;
    this._done = true;
    this.open = false;
    live.delete(this);
    this.emit('close');
  }
}

// Gọi từ sự kiện 'upgrade' của http.Server. Trả về WebSocketConn hoặc null.
export function acceptUpgrade(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`, '', '',
  ].join('\r\n'));
  const ws = new WebSocketConn(socket);
  if (head && head.length) ws._onData(head);
  return ws;
}

// Phát hiện kết nối chết (mất wifi, đóng nắp máy...) để giải phóng ghế kịp thời.
setInterval(() => {
  for (const ws of live) {
    if (!ws.alive) { ws.socket.destroy(); ws._closed(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS).unref();
