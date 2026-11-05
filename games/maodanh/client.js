// 🛸 Kẻ Mạo Danh — client: vẽ bản đồ + người chơi trên canvas, sương mù theo tầm nhìn, tự đi trước (gửi vị trí 15 lần/giây),
// HUD (nhiệm vụ, nút hành động), mini-game, bản đồ nhỏ + phá hoại, họp/bỏ phiếu, màn hình vai trò/đẩy ra/kết thúc.
import { getMap, mapInfo, ray, moveStep, roomAt, closedSet, blocked } from './maps.js';
import { TASKS, ROLES, SABS, EVENTS, ITEMS, COLORS, TEAMS, KILL_R, REPORT_R, USE_R, BUTTON_R, ABIL_R, PRINT_MS } from './data.js';
import { moveMods, waterLevel, tunnelOn } from './rules.js';
import { openGame } from './minigames.js';

const TS = 40;   // px mỗi ô của ảnh bản đồ vẽ sẵn
let CTX, UI, SFX, ROOT, V, M, MID, off, cv, g, fogCv, fg, raf, prevT;
let me, disp, keys, joy, srvOff, sentAt, sentPos, task, cam, visR, volKey, follow, anchors, seen, alarmAt, hudAt, mapOpen, sabPick, lastAlive, lastPhase;
let handlers = [];
const $ = s => ROOT.querySelector(s);
const esc = s => UI.esc(s);
const srvNow = () => Date.now() - srvOff;
const colOf = l => (l >= 0 ? COLORS[l].color : '#8b9099');
const nameOfLook = l => (l >= 0 ? (V.names[l] || COLORS[l].name) : '???');
const pn = (l, txt) => `<b class="pn" style="--c:${colOf(l)}">${esc(txt ?? nameOfLook(l))}</b>`;
const secs = t => Math.max(0, Math.ceil((t - srvNow()) / 1000));
const mySeat = () => (V ? V.me : -1);
const S = () => V && V.self;
const alive = () => !!(S() && S().alive);
const dynNow = () => closedSet(M, V.doors.map(d => d.r), V.sealed);

// ---------- vẽ nhân vật ----------
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  const f = c => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
// Hình người (hạt đậu có kính): (x, y) = tâm, u = px mỗi ô.
function bean(c, x, y, u, col, o = {}) {
  const w = u * 0.62, h = u * 0.78, t = o.t || 0;
  c.save();
  c.translate(x, y);
  if (o.alpha != null) c.globalAlpha = o.alpha;
  if (!o.ghost) { c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(0, h * 0.46, w * 0.58, h * 0.11, 0, 0, 7); c.fill(); }
  if ((o.dir || 1) < 0) c.scale(-1, 1);
  const bob = o.moving ? Math.abs(Math.sin(t * 12)) * -u * 0.05 : o.ghost ? Math.sin(t * 3) * u * 0.06 : 0;
  const dark = shade(col, -0.38);
  c.lineWidth = Math.max(1.5, u * 0.045);
  c.strokeStyle = 'rgba(20,20,30,.85)';
  if (!o.ghost) {
    const sw = o.moving ? Math.sin(t * 12) * u * 0.07 : 0;
    c.fillStyle = dark;
    rr(c, -w * 0.4, h * 0.12 + bob, w * 0.34, h * 0.3 + sw, w * 0.12); c.fill(); c.stroke();
    rr(c, w * 0.06, h * 0.12 + bob, w * 0.34, h * 0.3 - sw, w * 0.12); c.fill(); c.stroke();
  }
  c.fillStyle = dark;
  rr(c, -w * 0.66, -h * 0.16 + bob, w * 0.26, h * 0.44, w * 0.1); c.fill(); c.stroke();
  c.fillStyle = col;
  if (o.ghost) {
    c.beginPath();
    c.moveTo(-w / 2, h * 0.2 + bob);
    c.arc(0, -h * 0.12 + bob, w / 2, Math.PI, 0);
    c.lineTo(w / 2, h * 0.3 + bob);
    for (let i = 0; i < 4; i++) c.quadraticCurveTo(w / 2 - (i + 0.5) * w / 4, h * (i % 2 ? 0.3 : 0.42) + bob, w / 2 - (i + 1) * w / 4, h * 0.3 + bob);
    c.closePath(); c.fill(); c.stroke();
  } else { rr(c, -w / 2, -h * 0.5 + bob, w, h * 0.8, [w * 0.48, w * 0.48, w * 0.16, w * 0.16]); c.fill(); c.stroke(); }
  c.fillStyle = '#9fd3e8';
  c.beginPath(); c.ellipse(w * 0.14, -h * 0.2 + bob, w * 0.33, h * 0.14, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.75)';
  c.beginPath(); c.ellipse(w * 0.24, -h * 0.25 + bob, w * 0.12, h * 0.045, 0, 0, 7); c.fill();
  if (o.frozen) { c.fillStyle = 'rgba(180,225,255,.45)'; rr(c, -w * 0.6, -h * 0.55 + bob, w * 1.2, h, w * 0.3); c.fill(); }
  c.restore();
}
function corpse(c, x, y, u, col) {
  const w = u * 0.62, h = u * 0.78, dark = shade(col, -0.38);
  c.save(); c.translate(x, y);
  c.lineWidth = Math.max(1.5, u * 0.045); c.strokeStyle = 'rgba(20,20,30,.85)';
  c.fillStyle = 'rgba(120,0,0,.35)'; c.beginPath(); c.ellipse(0, h * 0.35, w * 0.8, h * 0.16, 0, 0, 7); c.fill();
  c.fillStyle = dark;
  rr(c, -w * 0.4, h * 0.12, w * 0.34, h * 0.3, w * 0.12); c.fill(); c.stroke();
  rr(c, w * 0.06, h * 0.12, w * 0.34, h * 0.3, w * 0.12); c.fill(); c.stroke();
  c.fillStyle = col;
  rr(c, -w / 2, -h * 0.05, w, h * 0.35, [0, 0, w * 0.16, w * 0.16]); c.fill(); c.stroke();
  c.fillStyle = '#f4efe2';
  rr(c, -w * 0.07, -h * 0.3, w * 0.14, h * 0.28, 3); c.fill(); c.stroke();
  c.beginPath(); c.arc(-w * 0.07, -h * 0.3, w * 0.08, 0, 7); c.arc(w * 0.07, -h * 0.3, w * 0.08, 0, 7); c.fill();
  c.restore();
}
// Ảnh nhỏ (dataURL) của một người — dùng trong thẻ bỏ phiếu, màn hình vai trò.
const imgCache = new Map();
function beanImg(col, ghost = false) {
  const k = col + ghost;
  if (!imgCache.has(k)) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    bean(c.getContext('2d'), 48, 46, 100, col, { ghost, alpha: ghost ? 0.7 : 1 });
    imgCache.set(k, c.toDataURL());
  }
  return imgCache.get(k);
}
const beanTag = (l, cls = '', ghost = false) => `<img class="bean ${cls}" src="${beanImg(colOf(l), ghost)}" alt="">`;

// ---------- vẽ sẵn bản đồ ----------
function buildMap() {
  const T = M.theme, c = document.createElement('canvas');
  c.width = M.w * TS; c.height = M.h * TS;
  const x = c.getContext('2d');
  x.fillStyle = T.bg; x.fillRect(0, 0, c.width, c.height);
  // nền ngoài tàu
  const R = (a, b) => a + Math.random() * (b - a);
  if (T.stars) for (let i = 0; i < M.w * M.h / 3; i++) { x.fillStyle = `rgba(255,255,255,${R(0.2, 0.9)})`; x.fillRect(R(0, c.width), R(0, c.height), R(1, 2.6), R(1, 2.6)); }
  if (T.bubbles) for (let i = 0; i < M.w * M.h / 5; i++) { x.strokeStyle = `rgba(150,210,255,${R(0.1, 0.35)})`; x.lineWidth = 1.5; x.beginPath(); x.arc(R(0, c.width), R(0, c.height), R(2, 7), 0, 7); x.stroke(); }
  if (T.bulbs) for (let i = 0; i < M.w * M.h / 8; i++) { x.fillStyle = ['#ffd23f', '#ff6f91', '#7ae7ff', '#b4ff8a'][i % 4]; x.globalAlpha = R(0.25, 0.7); x.beginPath(); x.arc(R(0, c.width), R(0, c.height), R(1.5, 3.5), 0, 7); x.fill(); x.globalAlpha = 1; }
  if (T.rails) { x.fillStyle = '#16211b'; x.fillRect(0, 4.4 * TS, c.width, 1.2 * TS); x.fillRect(0, 15.2 * TS, c.width, 1.6 * TS); x.fillStyle = '#5b4a3a'; for (let i = 0; i < c.width; i += TS * 0.8) { x.fillRect(i, 15.3 * TS, TS * 0.25, 1.4 * TS); } x.fillStyle = '#8a8f99'; x.fillRect(0, 15.55 * TS, c.width, 4); x.fillRect(0, 16.45 * TS, c.width, 4); }
  if (T.snow) for (let i = 0; i < M.w * M.h / 2; i++) { x.fillStyle = `rgba(160,180,200,${R(0.1, 0.3)})`; x.beginPath(); x.arc(R(0, c.width), R(0, c.height), R(1, 3), 0, 7); x.fill(); }
  const floor = (tx, ty) => tx >= 0 && ty >= 0 && tx < M.w && ty < M.h && M.grid[ty * M.w + tx] !== 0;
  for (let ty = 0; ty < M.h; ty++) for (let tx = 0; tx < M.w; tx++) {
    const k = ty * M.w + tx, v = M.grid[k];
    if (v === 0) continue;
    const ri = M.room[k], r = ri >= 0 ? M.rooms[ri] : null;
    x.fillStyle = r ? (r.floor || T.floor) : T.hall;
    x.fillRect(tx * TS, ty * TS, TS, TS);
    x.strokeStyle = T.line; x.lineWidth = 1;
    x.strokeRect(tx * TS + 0.5, ty * TS + 0.5, TS - 1, TS - 1);
    if (r && r.ice) { x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(tx * TS + 6, ty * TS + 8, TS * 0.5, 3); }
    if (!r && M.hallOut) { x.fillStyle = 'rgba(200,215,230,.5)'; x.beginPath(); x.arc(tx * TS + TS * 0.3, ty * TS + TS * 0.6, 3, 0, 7); x.fill(); }
  }
  // tường: ô đặc sát sàn
  for (let ty = 0; ty < M.h; ty++) for (let tx = 0; tx < M.w; tx++) {
    if (M.grid[ty * M.w + tx] !== 0) continue;
    let nearF = false;
    for (let dy = -1; dy <= 1 && !nearF; dy++) for (let dx = -1; dx <= 1; dx++) if (floor(tx + dx, ty + dy)) { nearF = true; break; }
    if (!nearF) continue;
    x.fillStyle = T.wall; x.fillRect(tx * TS, ty * TS, TS, TS);
    if (floor(tx, ty + 1)) { x.fillStyle = T.top; x.fillRect(tx * TS, ty * TS + TS * 0.55, TS, TS * 0.45); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(tx * TS, ty * TS + TS - 4, TS, 4); }
  }
  // đồ đạc
  for (let ty = 0; ty < M.h; ty++) for (let tx = 0; tx < M.w; tx++) if (M.grid[ty * M.w + tx] === 2) {
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(tx * TS + 3, ty * TS + 6, TS - 4, TS - 4);
    x.fillStyle = shade(T.wall, 0.25); rr(x, tx * TS + 2, ty * TS + 2, TS - 4, TS - 6, 6); x.fill();
    x.fillStyle = shade(T.wall, 0.45); x.fillRect(tx * TS + 5, ty * TS + 4, TS - 10, 5);
  }
  // trang trí + tên phòng
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const r of M.rooms) {
    x.globalAlpha = 0.85;
    for (const [e, dx, dy] of r.deco || []) { x.font = `${TS * 0.8}px serif`; x.fillText(e, (r.x + dx) * TS, (r.y + dy) * TS); }
    x.globalAlpha = 1;
    if (r.mirror) { x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 3; for (let i = 0; i < r.w; i += 2) { x.beginPath(); x.moveTo((r.x + i) * TS + 4, r.y * TS + 4); x.lineTo((r.x + i + 1) * TS, r.y * TS + TS * 0.8); x.stroke(); } }
    x.font = `800 ${TS * 0.42}px "Segoe UI", system-ui, sans-serif`;
    x.fillStyle = 'rgba(0,0,0,.28)';
    x.fillText(r.name.toUpperCase(), (r.x + r.w / 2) * TS, (r.y + r.h - 0.5) * TS);
  }
  // đồ vật tĩnh
  for (const o of M.objs) {
    const ox = o.x * TS, oy = o.y * TS;
    if (o.k === 'vent') {
      x.fillStyle = '#3a3f47'; rr(x, ox - TS * 0.42, oy - TS * 0.3, TS * 0.84, TS * 0.6, 6); x.fill();
      x.fillStyle = '#20242a'; for (let i = 0; i < 4; i++) x.fillRect(ox - TS * 0.34, oy - TS * 0.22 + i * TS * 0.13, TS * 0.68, TS * 0.06);
    } else if (o.k === 'button') {
      x.fillStyle = '#7d8a99'; x.beginPath(); x.ellipse(ox, oy + 6, TS * 1.5, TS * 1.0, 0, 0, 7); x.fill();
      x.fillStyle = '#a7b3c0'; x.beginPath(); x.ellipse(ox, oy, TS * 1.5, TS * 1.0, 0, 0, 7); x.fill();
      x.fillStyle = '#c62b2b'; x.beginPath(); x.arc(ox, oy - 2, TS * 0.32, 0, 7); x.fill();
      x.fillStyle = '#ff6b6b'; x.beginPath(); x.arc(ox - 3, oy - 6, TS * 0.12, 0, 7); x.fill();
    } else if (o.k === 'task' || o.k === 'fix' || o.k === 'pump' || o.k === 'sonar') {
      x.fillStyle = '#4b5563'; rr(x, ox - TS * 0.36, oy - TS * 0.36, TS * 0.72, TS * 0.72, 7); x.fill();
      x.fillStyle = o.k === 'task' ? '#9bb3c7' : o.k === 'pump' ? '#5aa6d6' : o.k === 'sonar' ? '#5ad6a6' : '#d6a65a';
      rr(x, ox - TS * 0.26, oy - TS * 0.26, TS * 0.52, TS * 0.4, 4); x.fill();
      x.font = `${TS * 0.42}px serif`;
      x.fillText(o.k === 'task' ? TASKS[o.t].icon : o.k === 'pump' ? '🚰' : o.k === 'sonar' ? '📡' : o.s === 'lights' ? '💡' : o.s === 'core' ? M.core.icon : SABS[o.s]?.icon || '🔧', ox, oy - 2);
    } else if (o.k === 'ladder') { x.font = `${TS * 0.8}px serif`; x.fillText('🪜', ox, oy); }
    else if (o.k === 'coaster') { x.font = `${TS * 0.9}px serif`; x.fillText('🚃', ox, oy); }
  }
  return c;
}

// ---------- vòng lặp vẽ ----------
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const c of [cv, fogCv]) { c.width = innerWidth * dpr; c.height = innerHeight * dpr; }
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
}
const unit = () => Math.max(26, Math.min(64, Math.min(innerWidth, innerHeight) / 14));

function inputVec() {
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x--;
  if (keys.has('d') || keys.has('arrowright')) x++;
  if (keys.has('w') || keys.has('arrowup')) y--;
  if (keys.has('s') || keys.has('arrowdown')) y++;
  if (joy && joy.on) { x = joy.x; y = joy.y; }
  const l = Math.hypot(x, y);
  return l > 1 ? [x / l, y / l] : [x, y];
}
const canMove = () => V && V.phase === 'play' && S() && me && S().vent == null && !S().ride && !task && !mapOpen;

function frame(t) {
  raf = requestAnimationFrame(frame);
  if (!V || !M) return;
  const dt = Math.min(0.05, (t - (prevT || t)) / 1000);
  prevT = t;
  const nowS = srvNow();
  // tự đi trước
  if (canMove()) {
    const [ix, iy] = inputVec();
    const view = { now: nowS, sab: V.sab, ev: V.ev };
    const mods = moveMods(view, { alive: S().alive, fx: S().fx, frozen: S().frozen, x: me.x, y: me.y }, M);
    const bx = me.x, by = me.y;
    moveStep(M, dynNow(), me, ix, iy, dt, mods);
    if (Math.abs(me.x - bx) > 0.001) me.dir = me.x > bx ? 1 : -1;
    me.moving = Math.hypot(me.x - bx, me.y - by) > 0.002;
    sendPos();
  } else if (me) me.moving = false;
  // vị trí hiển thị người khác (nội suy)
  const k = 1 - Math.exp(-dt * 14);
  for (const p of V.ps) {
    const d = disp[p.p];
    if (!d || Math.hypot(d.x - p.x, d.y - p.y) > 3) disp[p.p] = { x: p.x, y: p.y };
    else { d.x += (p.x - d.x) * k; d.y += (p.y - d.y) * k; }
  }
  draw(t / 1000, dt);
  if (Date.now() - hudAt > 200) { hudAt = Date.now(); hudTick(); }
}

// Gửi vị trí tự tính lên server (~15 lần/giây); force = gửi ngay (trước một hành động cần đúng khoảng cách).
function sendPos(force) {
  if (!me || !S() || V.phase !== 'play' || S().vent != null || S().ride) return;
  if (!force && Date.now() - sentAt <= 66) return;
  if (Math.abs(me.x - sentPos.x) <= 0.01 && Math.abs(me.y - sentPos.y) <= 0.01) return;
  sentAt = Date.now(); sentPos = { x: me.x, y: me.y };
  CTX.send({ type: 'mv', x: Math.round(me.x * 1000) / 1000, y: Math.round(me.y * 1000) / 1000, w: me.warp });
}

function camTarget() {
  if (S() && me && !S().ride) return me;
  if (S() && S().ride) { const o = M.objs[S().ride.to]; return { x: o.x, y: o.y }; }
  const f = V.ps.find(p => p.p === follow) || V.ps[0];
  return f ? disp[f.p] || f : M.spawn;
}

function draw(t, dt) {
  const dpr = cv.width / innerWidth, W = innerWidth, H = innerHeight, u = unit();
  const tgt = camTarget();
  cam.x += (tgt.x - cam.x) * Math.min(1, dt * 10); cam.y += (tgt.y - cam.y) * Math.min(1, dt * 10);
  if (Math.hypot(tgt.x - cam.x, tgt.y - cam.y) > 6) { cam.x = tgt.x; cam.y = tgt.y; }
  const X = x => (x - cam.x) * u + W / 2, Y = y => (y - cam.y) * u + H / 2;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = M.theme.bg; g.fillRect(0, 0, W, H);
  // bản đồ
  const sx = (cam.x - W / 2 / u) * TS, sy = (cam.y - H / 2 / u) * TS;
  g.imageSmoothingEnabled = true;
  g.drawImage(off, sx, sy, W / u * TS, H / u * TS, 0, 0, W, H);
  const nowS = srvNow();
  // khoang bị niêm phong / nước dâng / cửa sập
  for (const ri of V.sealed) { const r = M.rooms[ri]; g.fillStyle = 'rgba(10,25,45,.78)'; g.fillRect(X(r.x), Y(r.y), r.w * u, r.h * u); label(g, '🔒 ĐÃ NIÊM PHONG', X(r.x + r.w / 2), Y(r.y + r.h / 2), u * 0.5, '#9cc8ff'); }
  if (V.sab && V.sab.k === 'flood') {
    const r = M.rooms[V.sab.r], lv = waterLevel({ sab: V.sab, now: nowS });
    g.fillStyle = `rgba(40,120,200,${0.15 + lv * 0.45})`; g.fillRect(X(r.x), Y(r.y + r.h * (1 - lv)), r.w * u, r.h * lv * u);
    g.strokeStyle = 'rgba(200,235,255,.7)'; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= r.w * 4; i++) g.lineTo(X(r.x + i / 4), Y(r.y + r.h * (1 - lv)) + Math.sin(t * 4 + i) * 3);
    g.stroke();
  }
  for (const d of V.doors) for (const kk of M.rooms[d.r].doors) {
    const tx = kk % M.w, ty = (kk / M.w) | 0;
    g.fillStyle = '#5b2b2b'; g.fillRect(X(tx), Y(ty), u, u);
    g.fillStyle = '#c0392b'; for (let i = 0; i < 3; i++) g.fillRect(X(tx) + u * (0.15 + i * 0.3), Y(ty) + 2, u * 0.12, u - 4);
  }
  // nhiệm vụ của mình: phát sáng
  if (S()) for (const tk of S().tasks) {
    if (tk.done) continue;
    const o = M.objs[tk.o];
    if (V.sealed.includes(o.room)) continue;
    g.strokeStyle = `rgba(255,214,64,${0.55 + Math.sin(t * 5) * 0.35})`; g.lineWidth = 3;
    rr(g, X(o.x) - u * 0.42, Y(o.y) - u * 0.42, u * 0.84, u * 0.84, 8); g.stroke();
  }
  // bàn sửa phá hoại
  if (V.sab) for (const o of M.objs) if (fixableObj(o)) {
    g.strokeStyle = `rgba(255,70,70,${0.6 + Math.sin(t * 8) * 0.4})`; g.lineWidth = 4;
    rr(g, X(o.x) - u * 0.5, Y(o.y) - u * 0.5, u, u, 10); g.stroke();
  }
  // dấu chân
  for (const [px, py, l, a, age] of V.prints) {
    const al = Math.max(0, 1 - age * 100 / PRINT_MS) * 0.8;
    g.save(); g.translate(X(px / 10), Y(py / 10)); g.rotate(a / 10);
    g.globalAlpha = al; g.fillStyle = l >= 0 ? colOf(l) : '#777';
    g.beginPath(); g.ellipse(0, -u * 0.08, u * 0.1, u * 0.06, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(-u * 0.04, u * 0.09, u * 0.1, u * 0.06, 0, 0, 7); g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
  // thùng tiếp tế
  for (const c of V.crates) { const b = Math.sin(t * 3 + c.id) * u * 0.06; g.font = `${u * 0.62}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🎁', X(c.x), Y(c.y) + b); }
  // xác
  for (const b of V.bodies) corpse(g, X(b.x), Y(b.y), u, colOf(b.p));
  // người + ma-nơ-canh (xếp theo y)
  const list = [];
  for (const d of V.dolls) list.push({ y: d.y, f: () => { bean(g, X(d.x), Y(d.y), u, colOf(d.l), { dir: 1 }); if (d.l >= 0) nameTag(X(d.x), Y(d.y), u, d.l); } });
  anchors = {};
  for (const p of V.ps) {
    const self = p.p === mySeat() && me;
    const pos = self ? me : disp[p.p] || p;
    if (p.vent && !self) continue;
    const ghostP = !!p.g;
    const alpha = p.inv ? 0.35 : ghostP ? 0.55 : self && S().vent != null ? 0.35 : 1;
    list.push({ y: pos.y, f: () => {
      if (p.sc) scanFx(X(pos.x), Y(pos.y), u, t);
      bean(g, X(pos.x), Y(pos.y), u, colOf(p.l), { dir: self ? me.dir : p.d, moving: self ? me.moving : p.m, t: t + p.p, ghost: ghostP, alpha, frozen: p.fr });
      if (p.l >= 0 || self) nameTag(X(pos.x), Y(pos.y), u, p.l >= 0 ? p.l : p.p, self && p.l < 0, mates().includes(p.p) && p.l === p.p);
      if (V.lovers?.[p.p] != null || (S() && S().lover === p.p)) heart(X(pos.x) + u * 0.32, Y(pos.y) - u * 0.55, u);
    } });
    anchors[p.p] = { x: X(pos.x), y: Y(pos.y) - u * 0.7 };
  }
  // phản chiếu trong Nhà Gương: thấy thêm bóng ảo đối xứng qua giữa phòng
  const mr = me && roomAt(M, me.x, me.y);
  if (mr && mr.mirror) for (const p of V.ps) {
    const pos = p.p === mySeat() ? me : disp[p.p] || p;
    const pr = roomAt(M, pos.x, pos.y);
    if (!pr || pr.i !== mr.i || p.g) continue;
    const fx = mr.x * 2 + mr.w - pos.x;
    list.push({ y: pos.y, f: () => { bean(g, X(fx), Y(pos.y), u, colOf(p.l), { dir: -(p.p === mySeat() ? me.dir : p.d), moving: p.m, t, alpha: 0.75 }); if (p.l >= 0) nameTag(X(fx), Y(pos.y), u, p.l); } });
  }
  list.sort((a, b) => a.y - b.y).forEach(x => x.f());
  // sương mù tầm nhìn
  const blind = alive() && V.phase === 'play';
  if (blind) {
    const want = S().vision;
    visR = visR == null ? want : visR + (want - visR) * Math.min(1, dt * 4);
    fog(X, Y, u, W, H, dpr);
  }
  // hiệu ứng phía trên sương mù
  if (V.spot) { const sp = V.spot; g.strokeStyle = 'rgba(255,240,160,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(X(sp.x), Y(sp.y), u * (0.9 + Math.sin(t * 6) * 0.1), 0, 7); g.stroke(); edgeArrow(X(sp.x), Y(sp.y), W, H, '#ffe680', '🔦'); }
  if (V.radar) for (const r of V.radar) { g.fillStyle = `rgba(80,255,160,${0.6 + Math.sin(t * 10) * 0.3})`; g.beginPath(); g.arc(X(r.x), Y(r.y), u * 0.22, 0, 7); g.fill(); edgeArrow(X(r.x), Y(r.y), W, H, '#50ffa0', '•'); }
  if (V.compass && me) edgeArrow(X(V.compass.x), Y(V.compass.y), W, H, '#ff6b6b', '💀', true);
  if (V.sab && alive() && SABS[V.sab.k].crit) for (const o of M.objs) if (fixableObj(o)) edgeArrow(X(o.x), Y(o.y), W, H, '#ff5050', '⚠️');
  if (V.tunnel && V.phase === 'play' && nowS >= V.tunnel.at && nowS < V.tunnel.until) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H); }
  if (V.ev && V.ev.k === 'blizzard') snowFx(W, H, t);
  if (V.sab && V.sab.k === 'lights' && !blind) { g.fillStyle = 'rgba(0,0,20,.25)'; g.fillRect(0, 0, W, H); }
  if (S() && S().vent != null && me) { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, W, H); }
}
function fixableObj(o) {
  const k = V.sab && V.sab.k;
  if (!k) return false;
  if (o.k === 'pump') return k === 'flood' && o.room === V.sab.r;
  return o.k === 'fix' && o.s === k;
}
function label(c, txt, x, y, size, col) { c.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y); }
function nameTag(x, y, u, l, hidden, mate) {
  if (hidden) return;
  const n = V.names[l] || COLORS[l].name;
  g.font = `700 ${Math.max(11, u * 0.3)}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(n, x, y - u * 0.48);
  g.fillStyle = mate ? '#ff5a4f' : '#fff'; g.fillText(n, x, y - u * 0.48);
}
function heart(x, y, u) { g.font = `${u * 0.3}px serif`; g.textAlign = 'center'; g.fillText('💞', x, y); }
function scanFx(x, y, u, t) {
  g.save(); g.strokeStyle = 'rgba(90,220,255,.85)'; g.lineWidth = 3;
  const k = (Math.sin(t * 4) + 1) / 2;
  g.beginPath(); g.ellipse(x, y + u * 0.4 - k * u * 0.9, u * 0.5, u * 0.12, 0, 0, 7); g.stroke();
  g.fillStyle = 'rgba(90,220,255,.15)'; g.beginPath(); g.ellipse(x, y + u * 0.35, u * 0.6, u * 0.18, 0, 0, 7); g.fill();
  g.restore();
}
function snowFx(W, H, t) {
  g.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < 160; i++) { const x = (i * 97 + t * 160 * (1 + (i % 3))) % W, y = (i * 53 + t * 90 * (1 + (i % 4))) % H; g.fillRect(x, y, 2.5, 2.5); }
}
// Mũi tên ở mép màn hình chỉ về điểm nằm ngoài khung nhìn.
function edgeArrow(x, y, W, H, col, icon, always) {
  const m = 34;
  if (!always && x > m && x < W - m && y > m && y < H - m) return;
  const cx = W / 2, cy = H / 2, a = Math.atan2(y - cy, x - cx);
  const k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
  const ax = always ? cx + Math.cos(a) * Math.min(90, Math.hypot(x - cx, y - cy)) : cx + Math.cos(a) * k;
  const ay = always ? cy + Math.sin(a) * Math.min(90, Math.hypot(x - cx, y - cy)) : cy + Math.sin(a) * k;
  g.save(); g.translate(ax, ay); g.rotate(a);
  g.fillStyle = col; g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -9); g.lineTo(-8, 9); g.closePath(); g.fill();
  g.restore();
  g.font = '15px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, ax - Math.cos(a) * 18, ay - Math.sin(a) * 18);
}
function fog(X, Y, u, W, H, dpr) {
  fg.setTransform(dpr, 0, 0, dpr, 0, 0);
  fg.globalCompositeOperation = 'source-over';
  fg.clearRect(0, 0, W, H);
  fg.fillStyle = 'rgba(4,6,14,.86)';
  fg.fillRect(0, 0, W, H);
  fg.globalCompositeOperation = 'destination-out';
  const px = X(me.x), py = Y(me.y), R = Math.max(1, visR), dyn = dynNow();
  const grad = fg.createRadialGradient(px, py, R * u * 0.55, px, py, R * u);
  grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  fg.fillStyle = grad;
  fg.beginPath();
  const n = 180;
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, d = Math.min(R, ray(M, dyn, me.x, me.y, a, R) + 0.35);
    const x = px + Math.cos(a) * d * u, y = py + Math.sin(a) * d * u;
    if (i) fg.lineTo(x, y); else fg.moveTo(x, y);
  }
  fg.closePath(); fg.fill();
  fg.globalCompositeOperation = 'source-over';
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(fogCv, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const mates = () => (V.mates || []);

// ---------- tương tác ----------
function targets() {
  const s = S(), out = {};
  if (!s || V.phase !== 'play' || s.ride || !me) return out;
  const d = o => Math.hypot(o.x - me.x, o.y - me.y);
  const imp = s.team === 'imp';
  if (s.vent != null) { out.use = { k: 'vent', o: M.objs[s.vent] }; return out; }
  let best = null;
  const consider = (o, r, k, pr = 0) => { const dd = d(o); if (dd <= r - 0.1 && (!best || dd - pr < best.dd)) best = { k, o, dd: dd - pr }; };
  for (const o of M.objs) {
    if (V.sealed.includes(o.room)) continue;
    if (s.alive && fixableObj(o)) consider(o, USE_R, 'fix', 2);
    if (o.k === 'task' && s.tasks.some(t => t.o === o.i && !t.done)) consider(o, USE_R, 'task', 1);
    if (!s.alive) continue;
    if (o.k === 'button' && !(V.sab && SABS[V.sab.k].crit)) consider(o, BUTTON_R, 'button');
    if (o.k === 'vent' && (imp || s.role === 'engineer')) consider(o, USE_R, 'vent', -0.5);
    if (o.k === 'ladder' || o.k === 'coaster' || o.k === 'sonar') consider(o, USE_R, o.k);
  }
  if (imp && s.alive) V.dolls.forEach((dl, i) => { if (dl.by || d(dl) <= USE_R) consider({ ...dl, i }, dl.by ? 99 : USE_R, 'doll', dl.by ? 5 : 0); });
  out.use = best;
  if (s.alive) {
    const near = (r, f) => V.ps.filter(p => p.p !== mySeat() && !p.g && !p.vent && f(p)).map(p => ({ p, dd: Math.hypot(p.x - me.x, p.y - me.y) })).filter(x => x.dd <= r - 0.2).sort((a, b) => a.dd - b.dd)[0];
    if (imp) out.kill = near(KILL_R, p => !mates().includes(p.p));
    const body = V.bodies.map(b => ({ b, dd: d(b) })).filter(x => x.dd <= REPORT_R - 0.15).sort((a, b) => a.dd - b.dd)[0];
    out.report = body;
    if (s.role === 'sheriff') out.ab = near(KILL_R, () => true);
    if (s.role === 'guard') out.ab = near(ABIL_R, () => true);
    if (s.role === 'detective') out.ab = body && !s.seen.includes(body.b.p) ? body : null;
    if (s.role === 'shifter' || s.role === 'phantom') out.ab = { self: true };
  }
  return out;
}

async function doUse() {
  const tg = targets().use;
  if (!tg) return;
  const o = tg.o, s = S();
  sendPos(true);
  if (tg.k === 'vent' && s.vent != null) return CTX.send({ type: 'unvent' });
  if (tg.k === 'doll') return CTX.send({ type: 'doll', d: tg.o.i });
  const r = await CTX.send({ type: 'use', o: o.i });
  if (!r.ok) return;
  if (tg.k === 'task') {
    const t = TASKS[o.t];
    openTask({ o: o.i, type: o.t, name: o.n, icon: t.icon, target: { space: '☄️', train: '🐀', arctic: '🐧', carnival: '🎈', sub: '🐙' }[V.map] });
  } else if (tg.k === 'fix' && o.s === 'lights') openTask({ fix: o.i, type: 'switches', name: 'Gạt cầu dao', icon: '💡', hint: 'Gạt hết các cần lên' });
  else if (tg.k === 'fix' || tg.k === 'fix') SFX.click();
}

function openTask(t) {
  closeTask();
  const box = $('.mdn-task');
  box.classList.remove('hidden');
  const start = Date.now();
  task = { ...t, start };
  const panel = box.querySelector('.mg');
  task.close = openGame(panel, {
    type: t.type, name: t.name, icon: t.icon, hint: t.hint, target: t.target, sfx: SFX,
    onDone: () => {
      const cur = task;
      if (!cur || cur.start !== start) return;
      const need = t.o != null ? TASKS[t.type].ms * 0.85 - (Date.now() - start) : 0;
      setTimeout(async () => {
        if (task !== cur) return;
        if (t.o != null) { const r = await CTX.send({ type: 'task', o: t.o }); if (r.ok) UI.floatAt(anchors[mySeat()] || { x: innerWidth / 2, y: innerHeight / 2 }, '✔', 'big'); }
        else if (t.fix != null) await CTX.send({ type: 'fix', o: t.fix });
        if (task === cur) closeTask(true);
      }, Math.max(0, need));
    },
  });
}
function closeTask(done) {
  if (!task) return;
  const t = task;
  task = null;
  t.close && t.close();
  $('.mdn-task').classList.add('hidden');
  if (!done && t.o != null && V && V.phase === 'play') CTX.send({ type: 'stop' });
}

function doKill() { const k = targets().kill; if (k) sendPos(true), CTX.send({ type: 'kill', to: k.p.p }); }
function doReport() { const r = targets().report; if (r) sendPos(true), CTX.send({ type: 'report', b: r.b.p }); }
function doItem() { if (S() && S().item) CTX.send({ type: 'item' }); }
function doAbility() {
  const s = S(), tg = targets().ab;
  if (!s || !tg) return;
  sendPos(true);
  if (s.role === 'detective') return CTX.send({ type: 'ability', b: tg.b.p });
  if (s.role === 'phantom') return CTX.send({ type: 'ability' });
  if (s.role === 'shifter') {
    const opts = V.names.map((n, i) => ({ n, i })).filter(x => x.n && x.i !== mySeat() && !V.dead[x.i]).map(x => ({ html: esc(x.n), value: x.i, color: colOf(x.i) }));
    return UI.pickModal('🎭 Biến thành ai?', opts, to => CTX.send({ type: 'ability', to }));
  }
  CTX.send({ type: 'ability', to: tg.p.p });
}

// ---------- HUD ----------
function buildHud() {
  const hud = $('.mdn-hud');
  hud.innerHTML = `
    <div class="mdn-tl"><div class="mdn-role"></div><div class="mdn-tasks"></div></div>
    <div class="mdn-tc"></div>
    <div class="mdn-tr"><button class="ghost mdn-mapbtn" title="Bản đồ (Tab)">🗺️</button><div class="mdn-tools"></div></div>
    <div class="mdn-br">
      <button class="act" data-a="item"><span class="ic">🎒</span><span class="lb">Vật phẩm</span><kbd>G</kbd></button>
      <button class="act" data-a="ab"><span class="ic">✨</span><span class="lb">Kỹ năng</span><kbd>F</kbd><i class="cd"></i></button>
      <button class="act" data-a="sab"><span class="ic">🧨</span><span class="lb">Phá hoại</span><kbd>X</kbd><i class="cd"></i></button>
      <button class="act" data-a="kill"><span class="ic">🔪</span><span class="lb">Giết</span><kbd>Q</kbd><i class="cd"></i></button>
      <button class="act" data-a="report"><span class="ic">📢</span><span class="lb">Báo cáo</span><kbd>R</kbd></button>
      <button class="act big" data-a="use"><span class="ic">✋</span><span class="lb">Dùng</span><kbd>E</kbd></button>
    </div>
    <div class="mdn-vent hidden"></div>`;
  UI.toolbar($('.mdn-tools'), { help: showHelp });
  $('.mdn').appendChild($('.mdn-tr'));   // thanh công cụ nằm trên cả màn họp/kết thúc (vẫn thoát/tắt tiếng được)
  $('.mdn-mapbtn').onclick = () => toggleMap();
  const acts = { use: doUse, kill: doKill, report: doReport, item: doItem, ab: doAbility, sab: () => toggleMap(true) };
  for (const b of hud.querySelectorAll('.act')) b.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); if (!b.disabled) acts[b.dataset.a](); };
}

function setBtn(a, show, on, txt, icon, cd) {
  const b = $(`.act[data-a="${a}"]`);
  b.classList.toggle('hidden', !show);
  b.disabled = !on;
  if (txt) b.querySelector('.lb').textContent = txt;
  if (icon) b.querySelector('.ic').textContent = icon;
  const c = b.querySelector('.cd');
  if (c) c.textContent = cd > 0 ? cd : '';
}

function hudTick() {
  if (!V) return;
  const s = S(), tg = targets(), nowS = srvNow();
  const play = V.phase === 'play' && s;
  $('.mdn-mapbtn').classList.toggle('hidden', V.phase !== 'play' && V.phase !== 'meet');
  // nút hành động
  const useNames = { task: ['Làm', '🛠️'], fix: ['Sửa', '🔧'], button: ['Họp khẩn', '🚨'], vent: [s && s.vent != null ? 'Chui ra' : 'Chui cống', '🕳️'], ladder: ['Leo thang', '🪜'], coaster: ['Tàu lượn', '🎢'], sonar: ['Sonar', '📡'], doll: [V.dolls.some(d => d.by) ? 'Thả' : 'Kéo', '🧍'] };
  const un = tg.use ? useNames[tg.use.k] : ['Dùng', '✋'];
  setBtn('use', !!play, !!tg.use, un[0], un[1]);
  setBtn('report', !!play && s.alive, !!tg.report);
  const imp = s && s.team === 'imp';
  setBtn('kill', !!play && imp && s.alive, !!tg.kill && nowS >= s.killCd, null, null, s ? secs(s.killCd) : 0);
  setBtn('sab', !!play && imp, true, null, null, imp && V.sabCd ? secs(V.sabCd) : 0);
  const R = s && ROLES[s.role];
  const hasAb = play && s.alive && R && (R.ab || s.role === 'detective');
  setBtn('ab', !!hasAb, !!tg.ab && (!s.abCd || nowS >= s.abCd), R && R.ab ? R.ab.n : 'Soi xác', R && R.ab ? R.ab.i : '🔍', s && s.abCd ? secs(s.abCd) : 0);
  setBtn('item', !!play && s.alive && !!s.item, !!(s && s.item), s && s.item ? ITEMS[s.item].name : '', s && s.item ? ITEMS[s.item].icon : '🎒');
  // khung vai trò + nhiệm vụ
  if (s) {
    const R2 = ROLES[s.role];
    $('.mdn-role').innerHTML = `<span class="rb" style="--t:${TEAMS[s.team].color}">${R2.icon} ${esc(R2.name)}</span>` +
      (mates().length > 1 ? `<span class="small"> · đồng bọn: ${mates().filter(x => x !== mySeat()).map(x => pn(x)).join(', ')}</span>` : '') +
      (s.lover != null ? `<span class="small"> · 💞 ${pn(s.lover)}</span>` : '') + (s.shield ? ' <span title="Đang có khiên">🛡️</span>' : '') +
      (!s.alive ? ' <span class="small">· 👻 hồn ma</span>' : '');
    const fake = s.team !== 'crew';
    const bar = Math.round(V.bar * 100);
    $('.mdn-tasks').innerHTML = `<div class="tb"><i style="width:${bar}%"></i><span>Nhiệm vụ cả đội ${bar}%</span></div>` +
      (fake ? '<div class="small muted2">Nhiệm vụ giả (để trà trộn):</div>' : '') +
      s.tasks.map(tk => { const o = M.objs[tk.o]; return `<div class="tk${tk.done ? ' done' : ''}">${TASKS[o.t].icon} ${esc(M.rooms[o.room].name)}: ${esc(o.n)}</div>`; }).join('');
  } else $('.mdn-role').innerHTML = '<span class="rb">👀 Đang xem</span>', $('.mdn-tasks').innerHTML = `<div class="tb"><i style="width:${Math.round(V.bar * 100)}%"></i><span>Nhiệm vụ ${Math.round(V.bar * 100)}%</span></div>`;
  // băng thông báo
  const ban = [];
  if (V.sab) {
    const SB = SABS[V.sab.k];
    const nm = V.sab.k === 'core' ? M.core.name : SB.name;
    const tleft = V.sab.until ? ` — ${secs(V.sab.until)}s` : '';
    let how = V.sab.k === 'core' ? M.core.fix : SB.desc;
    if (V.sab.k === 'core') how += ` (${V.sab.held || 0}/2 đang giữ)`;
    if (SB.fix === 'hold') how = (V.sab.k === 'flood' ? `${M.rooms[V.sab.r].name}: ` : '') + `giữ tay 3 giây để sửa · ${Math.round((V.sab.prog || 0) / 30)}%`;
    if (V.sab.k === 'airlock') how = `${M.rooms[V.sab.r].name} sắp bị hút khí!`;
    ban.push(`<div class="ban ${SB.crit ? 'crit' : ''}">${V.sab.k === 'core' ? M.core.icon : SB.icon} <b>${esc(nm)}${tleft}</b><span>${esc(how)}</span></div>`);
    if (SB.crit && nowS - alarmAt > 1000 && V.phase === 'play') { alarmAt = nowS; SFX.tone(880, 0.25, { type: 'square', v: 0.05 }); SFX.tone(660, 0.25, { type: 'square', v: 0.05, delay: 0.3 }); }
  }
  if (V.ev) { const E = EVENTS[V.ev.k]; ban.push(`<div class="ban ev">${E.icon} <b>${esc(E.name)} — ${secs(V.ev.until)}s</b><span>${esc(E.desc)}</span></div>`); }
  if (V.tunnel && V.phase === 'play') {
    if (nowS < V.tunnel.at && V.tunnel.at - nowS < 4000) ban.push(`<div class="ban ev">🚇 <b>Sắp chui hầm — ${secs(V.tunnel.at)}s</b><span>Cả tàu sẽ tối đen</span></div>`);
    else if (nowS >= V.tunnel.at && nowS < V.tunnel.until) ban.push('<div class="ban crit">🚇 <b>Trong hầm!</b><span>Không thấy gì cả...</span></div>');
  }
  if (s && s.frozen) ban.push('<div class="ban ev">🥶 <b>Bị cóng</b><span>Vào nhà ấm để đi nhanh lại</span></div>');
  if (s && s.alive && s.fx) for (const [k, until] of Object.entries(s.fx)) if (until > nowS) ban.push(`<div class="ban fx">${ITEMS[k].icon} ${esc(ITEMS[k].name)} — ${secs(until)}s</div>`);
  if (V.phase === 'intro') ban.push(`<div class="ban ev">⏳ <b>Bắt đầu sau ${secs(V.phaseEnd)}s</b></div>`);
  $('.mdn-tc').innerHTML = ban.join('');
  // cống
  const vb = $('.mdn-vent');
  if (s && s.vent != null && V.phase === 'play') {
    const from = M.objs[s.vent];
    const others = M.objs.filter(o => o.k === 'vent' && o.g === from.g && o.i !== from.i && !V.sealed.includes(o.room));
    const key = s.vent + ':' + others.length;
    if (vb.dataset.k !== key) {
      vb.dataset.k = key;
      vb.innerHTML = `<b>🕳️ Trong cống — ${esc(M.rooms[from.room].name)}</b>` + others.map(o => {
        const a = Math.atan2(o.y - from.y, o.x - from.x) * 180 / Math.PI;
        return `<button data-v="${o.i}"><span style="display:inline-block;transform:rotate(${a}deg)">➜</span> ${esc(M.rooms[o.room].name)}</button>`;
      }).join('') + '<button class="gold" data-out>⬆️ Chui ra</button>';
      for (const b of vb.querySelectorAll('[data-v]')) b.onclick = () => { SFX.whoosh(); CTX.send({ type: 'vent', to: +b.dataset.v }); };
      vb.querySelector('[data-out]').onclick = () => CTX.send({ type: 'unvent' });
    }
    vb.classList.remove('hidden');
  } else { vb.classList.add('hidden'); vb.dataset.k = ''; }
  if (V.phase === 'meet' || V.phase === 'eject') paintMeetTimer();
  if (mapOpen) paintMap();
}

// ---------- bản đồ nhỏ + phá hoại ----------
function toggleMap(force) {
  mapOpen = force ?? !mapOpen;
  sabPick = null;
  $('.mdn-map').classList.toggle('hidden', !mapOpen);
  if (mapOpen) { paintMap(); SFX.click(); }
}
function paintMap() {
  const box = $('.mdn-map'), c = box.querySelector('canvas'), x = c.getContext('2d');
  const W = Math.min(innerWidth - 24, 1400), H = Math.min(innerHeight - 190, W * M.h / M.w);
  const k = Math.min(W / M.w, H / M.h), dpr = Math.min(2, devicePixelRatio || 1);
  c.width = M.w * k * dpr; c.height = M.h * k * dpr; c.style.width = M.w * k + 'px'; c.style.height = M.h * k + 'px';
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.drawImage(off, 0, 0, M.w * k, M.h * k);
  x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 0, M.w * k, M.h * k);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const r of M.rooms) {
    if (V.sealed.includes(r.i)) { x.fillStyle = 'rgba(10,25,45,.8)'; x.fillRect(r.x * k, r.y * k, r.w * k, r.h * k); }
    if (sabPick && sabOk(r)) { x.strokeStyle = '#ff5a4f'; x.lineWidth = 3; x.strokeRect(r.x * k + 2, r.y * k + 2, r.w * k - 4, r.h * k - 4); }
    if (V.doors.some(d => d.r === r.i)) { x.strokeStyle = '#c0392b'; x.lineWidth = 3; x.setLineDash([6, 4]); x.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k); x.setLineDash([]); }
    x.font = `700 ${Math.max(10, k * 0.8)}px "Segoe UI", sans-serif`; x.fillStyle = '#fff'; x.strokeStyle = 'rgba(0,0,0,.7)'; x.lineWidth = 3;
    x.strokeText(r.name, (r.x + r.w / 2) * k, (r.y + r.h / 2) * k); x.fillText(r.name, (r.x + r.w / 2) * k, (r.y + r.h / 2) * k);
  }
  if (S()) for (const tk of S().tasks) if (!tk.done) { const o = M.objs[tk.o]; x.font = `${Math.max(12, k)}px serif`; x.fillText('❗', o.x * k, o.y * k); }
  if (V.sab) for (const o of M.objs) if (fixableObj(o)) { x.font = `${Math.max(14, k * 1.2)}px serif`; x.fillText('⚠️', o.x * k, o.y * k); }
  if (me && S()) { x.fillStyle = colOf(mySeat()); x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(me.x * k, me.y * k, Math.max(5, k * 0.5), 0, 7); x.fill(); x.stroke(); }
  // phá hoại (Kẻ Mạo Danh)
  const sb = box.querySelector('.sabs'), s = S();
  if (s && s.team === 'imp' && V.phase === 'play') {
    const cd = secs(V.sabCd), busy = !!V.sab, sp = M.special;
    const btn = (k2, icon, name, need) => `<button class="${sabPick === k2 ? 'gold' : ''}" data-k="${k2}" ${(k2 !== 'doors' && (busy || cd > 0)) ? 'disabled' : ''}>${icon} ${esc(name)}${need ? ' 👆' : ''}</button>`;
    const html = `<div class="small">🧨 Phá hoại${busy ? ' — đang có sự cố' : cd > 0 ? ` — hồi ${cd}s` : ''}${sabPick ? ' · <b>bấm vào một phòng trên bản đồ</b>' : ''}</div>` +
      btn('lights', '💡', SABS.lights.name) + btn('core', M.core.icon, M.core.name) + btn(sp, SABS[sp].icon, SABS[sp].name, sp === 'airlock' || sp === 'flood') + btn('doors', '🚪', 'Sập cửa', true);
    if (sb.dataset.h !== html) {
      sb.dataset.h = html; sb.innerHTML = html;
      for (const b of sb.querySelectorAll('[data-k]')) b.onclick = () => {
        const k2 = b.dataset.k;
        if (k2 === 'doors' || k2 === 'airlock' || k2 === 'flood') { sabPick = sabPick === k2 ? null : k2; paintMap(); return; }
        CTX.send({ type: 'sab', k: k2 }).then(r => { if (r.ok) toggleMap(false); });
      };
    }
    sb.classList.remove('hidden');
  } else sb.classList.add('hidden');
  c.onclick = e => {
    if (!sabPick) return;
    const rc = c.getBoundingClientRect(), tx = (e.clientX - rc.left) / k, ty = (e.clientY - rc.top) / k;
    const r = M.rooms.find(r => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
    if (!r || !sabOk(r)) return UI.toast('Chọn một phòng được viền đỏ');
    CTX.send({ type: 'sab', k: sabPick, r: r.i }).then(res => { if (res.ok) toggleMap(false); });
  };
}
function sabOk(r) {
  if (V.sealed.includes(r.i) || r.id === 'roof') return false;
  if (sabPick === 'flood') return !!r.sealable;
  if (sabPick === 'airlock') return r.i !== M.objs[M.button].room;
  return r.doors.length > 0;
}

// ---------- họp ----------
function paintMeet() {
  const box = $('.mdn-meet'), m = V.meet;
  if (!m || V.phase !== 'meet') { box.classList.add('hidden'); box.dataset.mid = ''; return; }
  box.classList.remove('hidden');
  const s = S(), canVote = s && s.alive && srvNow() >= m.talkEnd && !m.voted.includes(mySeat());
  const title = m.body != null ? `💀 Phát hiện xác ${pn(m.body)}` : '🚨 Họp khẩn cấp';
  const seats = V.names.map((n, i) => ({ n, i })).filter(x => x.n);
  const html = `<div class="mt-head"><h2>${title}</h2><div class="small">Người gọi: ${pn(m.by)}</div><div class="mt-timer"></div></div>
    <div class="mt-grid">${seats.map(({ n, i }) => {
      const dead = V.dead[i], voted = m.voted.includes(i);
      return `<button class="mt-card${dead ? ' dead' : ''}${i === mySeat() ? ' me' : ''}" data-s="${i}" ${!canVote || dead || i === mySeat() ? 'disabled' : ''}>
        ${beanTag(i, '', false)}<span class="nm">${pn(i, n)}${V.bots[i] ? ' 🤖' : ''}</span>${dead ? '<span class="x">✖</span>' : ''}${voted ? '<span class="vd">✅ đã bỏ phiếu</span>' : ''}
        ${m.by === i ? '<span class="mg">📢</span>' : ''}</button>`;
    }).join('')}</div>
    <div class="mt-foot"><button class="ghost" data-skip ${canVote ? '' : 'disabled'}>⏭️ Bỏ qua (không vote ai)</button>
    <span class="small">${s && !s.alive ? '👻 Hồn ma không bỏ phiếu — chat 💬 chỉ hồn ma đọc được' : '💬 Bấm <b>Enter</b> hoặc nút 💬 để bàn luận · 🗺️ <b>Tab</b> xem bản đồ'}${m.voted.includes(mySeat()) ? ' · bạn đã bỏ phiếu ✔' : ''}</span></div>`;
  if (box.dataset.h !== html) {
    box.dataset.h = html;
    box.innerHTML = `<div class="mt">${html}</div>`;
    for (const b of box.querySelectorAll('[data-s]')) b.onclick = () => confirmVote(+b.dataset.s);
    box.querySelector('[data-skip]').onclick = () => confirmVote(-1);
  }
  paintMeetTimer();
}
function confirmVote(to) {
  const txt = to < 0 ? 'Bỏ qua lượt bỏ phiếu này?' : `Bỏ phiếu đẩy ${pn(to)} ra ngoài?`;
  const c = UI.openModal(`<h2 class="center">🗳️ ${txt}</h2><div class="btns"><button class="ghost" data-x>Huỷ</button><button class="gold" data-y>Chắc chắn</button></div>`);
  c.querySelector('[data-x]').onclick = UI.closeModal;
  c.querySelector('[data-y]').onclick = () => { UI.closeModal(); CTX.send({ type: 'vote', to }); };
}
function paintMeetTimer() {
  const el = $('.mt-timer');
  if (!el || !V.meet) return;
  const now = srvNow(), m = V.meet;
  el.innerHTML = now < m.talkEnd ? `💬 Thảo luận: <b>${secs(m.talkEnd)}s</b>` : `🗳️ Bỏ phiếu: <b>${secs(m.voteEnd)}s</b>`;
  // vừa hết giờ thảo luận → mở khoá nút bỏ phiếu
  const canVote = S() && S().alive && now >= m.talkEnd && !m.voted.includes(mySeat());
  if (canVote && $('.mt-card:not(.dead):not(.me)')?.disabled) { $('.mdn-meet').dataset.h = ''; paintMeet(); }
}

// ---------- màn hình lớn: vai trò / chết / đẩy ra / kết thúc ----------
function full(html, cls = '', ms = 0) {
  const f = $('.mdn-full');
  f.className = 'mdn-full ' + cls;
  f.innerHTML = html;
  clearTimeout(f._t);
  if (ms) f._t = setTimeout(() => f.classList.add('hidden'), ms);
  return f;
}
function showIntro() {
  const s = S(), info = mapInfo().find(x => x.id === V.map);
  if (!s) return full(`<div class="fi"><div class="big">${info.icon} ${esc(info.name)}</div><p>${esc(info.blurb)}</p></div>`, 'intro', 5000);
  const R = ROLES[s.role], T = TEAMS[s.team];
  const crew = V.names.map((n, i) => (n ? i : -1)).filter(i => i >= 0);
  const show = s.team === 'imp' ? mates() : crew;
  full(`<div class="fi"><div class="sub">Bạn là</div><div class="big" style="color:${T.color}">${R.icon} ${esc(R.name)}</div>
    <div class="beans">${show.map(i => beanTag(i)).join('')}</div>
    <p>${esc(R.desc)}</p>
    ${s.team === 'imp' && mates().length > 1 ? `<p>Đồng bọn: ${mates().filter(x => x !== mySeat()).map(x => pn(x)).join(', ')}</p>` : ''}
    ${s.lover != null ? `<p>💞 Bạn và ${pn(s.lover)} là <b>Cặp Đôi</b> — một người chết, người kia chết theo. Cùng sống tới cuối thì cùng thắng!</p>` : ''}
    <div class="mapi">${info.icon} <b>${esc(info.name)}</b> — ${esc(info.blurb)}</div></div>`, 'intro ' + s.team, 0);
}
function showEject() {
  const e = V.eject;
  const votes = e.votes || {};
  const by = {};
  for (const [v, t] of Object.entries(votes)) (by[t] ||= []).push(+v);
  const tally = Object.entries(by).map(([t, vs]) => `<div class="vt">${+t < 0 ? '⏭️ Bỏ qua' : pn(+t)}: ${vs.map(v => `<img class="mini" src="${beanImg(colOf(v))}">`).join('')}</div>`).join('');
  let text;
  if (e.p == null) text = e.tie ? 'Hoà phiếu — không ai bị đẩy ra.' : 'Không ai bị đẩy ra.';
  else {
    const R = e.role ? ROLES[e.role] : null;
    text = `${esc(V.names[e.p])} đã bị đẩy ra ngoài.` + (R ? (e.role === 'jester' ? ` ${esc(V.names[e.p])} là KẺ NGỐC 🤡 — và đó chính là điều hắn muốn!`
      : e.team === 'imp' ? ` ${esc(V.names[e.p])} LÀ Kẻ Mạo Danh ${R.icon}.` : ` ${esc(V.names[e.p])} KHÔNG phải Kẻ Mạo Danh (${R.icon} ${esc(R.name)}).`) : '');
  }
  const lov = (e.lovers || []).map(x => `<p>💔 ${pn(x)} không chịu nổi mất mát và ra đi theo...</p>`).join('');
  full(`<div class="fe">${e.p != null ? `<img class="flyer" src="${beanImg(colOf(e.p))}">` : ''}<div class="tally">${tally}</div><div class="typed">${text}</div>${lov}</div>`, 'eject ' + V.map, 0);
  SFX.whoosh();
}
function showDeath(l) {
  full(`<div class="fd"><div class="big">💀</div><div class="sub">Bạn đã bị ${l != null ? pn(l) : 'ai đó'} giết!</div><p>Giờ bạn là hồn ma 👻 — bay xuyên tường${S() && S().team === 'crew' ? ', vẫn làm nhiệm vụ giúp đội được' : ''} và chat với các hồn ma khác.</p></div>`, 'death', 3500);
}
function showOver() {
  const w = V.win, s = S(), mine = s && w.seats.includes(mySeat());
  const T = w.team === 'neutral' ? { name: 'Kẻ Ngốc', color: TEAMS.neutral.color } : TEAMS[w.team];
  const rows = V.names.map((n, i) => (n ? i : -1)).filter(i => i >= 0).map(i => {
    const R = ROLES[V.roles[i]];
    return `<div class="or${w.seats.includes(i) ? ' win' : ''}">${beanTag(i, '', V.dead[i])}${pn(i, V.names[i])}<span>${R.icon} ${esc(R.name)}${V.lovers && V.lovers[i] != null ? ' 💞' : ''}</span>${w.seats.includes(i) ? '🏆' : ''}</div>`;
  }).join('');
  const host = CTX.me().isHost;
  const f = full(`<div class="fo"><div class="big" style="color:${T.color}">${mine ? '🏆 CHIẾN THẮNG!' : s ? '😵 THẤT BẠI' : '🏁 Kết thúc'}</div>
    <div class="sub">${esc(T.name)} thắng — ${esc(w.why)}</div><div class="rows">${rows}</div>
    <div class="btns">${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted2">Chờ chủ phòng...</span>'}</div></div>`, 'over', 0);
  const b = (a, fn) => { const x = f.querySelector(`[data-a="${a}"]`); if (x) x.onclick = fn; };
  b('lobby', () => CTX.backToLobby());
  b('again', () => CTX.restart());
  if (mine) { SFX.win(); UI.confetti(); } else SFX.tone(220, 0.8, { type: 'sawtooth', v: 0.08, to: 110 });
}
function showHelp() {
  const info = mapInfo();
  UI.openModal(`<div class="help"><h2>🛸 Kẻ Mạo Danh — luật chơi</h2>
    <h3>Mục tiêu</h3><ul><li><b>Phi Hành Đoàn</b>: làm xong mọi nhiệm vụ, hoặc bỏ phiếu đẩy hết Kẻ Mạo Danh ra ngoài.</li>
    <li><b>Kẻ Mạo Danh</b>: giết tới khi số Kẻ Mạo Danh bằng số người còn lại, hoặc để một sự cố nguy cấp (đồng hồ đỏ) hết giờ.</li></ul>
    <h3>Điều khiển</h3><ul><li>Đi: <b>WASD</b>/phím mũi tên, hoặc kéo trên màn hình (điện thoại).</li><li><b>E</b> dùng/làm nhiệm vụ · <b>R</b> báo cáo xác · <b>Q</b> giết · <b>F</b> kỹ năng · <b>G</b> vật phẩm · <b>X</b> phá hoại · <b>Tab</b> bản đồ (cả lúc họp) · <b>M</b> tắt mic.</li>
    <li>Chỉ chat/nói chuyện được trong cuộc họp (đàm thoại theo khoảng cách thì nghe người đứng gần). Hồn ma có kênh 👻 riêng.</li></ul>
    <h3>Vai trò</h3><ul>${Object.values(ROLES).map(r => `<li>${r.icon} <b>${esc(r.name)}</b>: ${esc(r.desc)}</li>`).join('')}<li>💞 <b>Cặp Đôi</b>: hai người gắn kết sống chết; cùng sống tới cuối thì cùng thắng.</li></ul>
    <h3>Bản đồ</h3><ul>${info.map(m => `<li>${m.icon} <b>${esc(m.name)}</b>: ${esc(m.blurb)}</li>`).join('')}</ul>
    <h3>Biến cố bất ngờ</h3><ul>${Object.values(EVENTS).map(e => `<li>${e.icon} <b>${esc(e.name)}</b>: ${esc(e.desc)}</li>`).join('')}</ul>
    <h3>Vật phẩm (thùng 🎁)</h3><ul>${Object.values(ITEMS).map(e => `<li>${e.icon} <b>${esc(e.name)}</b>: ${esc(e.desc)}</li>`).join('')}</ul>
    <div class="btns"><button class="gold" data-x>Đã hiểu</button></div></div>`).querySelector('[data-x]').onclick = UI.closeModal;
}

// ---------- nhận trạng thái ----------
function update(msg, { backlog, hidden } = {}) {
  const prev = V;
  V = msg.state;
  srvOff = (msg.recvAt || Date.now()) - V.now;
  if (!M || M.id !== V.map) { M = getMap(V.map); off = buildMap(); disp = {}; cam = { ...M.spawn }; }
  if (MID !== msg.matchId) { MID = msg.matchId; me = null; seen = {}; lastAlive = null; lastPhase = null; }
  const s = S();
  // vị trí của mình: server dời (warp) thì nhảy theo, không thì giữ vị trí tự tính
  if (s) {
    if (!me || me.warp !== s.warp) { me = { x: s.x, y: s.y, vx: 0, vy: 0, warp: s.warp, dir: 1 }; sentPos = { x: s.x, y: s.y }; }
  } else me = null;
  if (follow == null && !s && V.ps.length) follow = V.ps[0].p;
  for (const e of msg.events) onEvent(e, hidden);
  // màn hình theo pha
  if (V.phase !== lastPhase) {
    if (V.phase === 'intro') { showIntro(); SFX.gong(); }
    if (V.phase === 'play' && lastPhase && lastPhase !== 'play') { $('.mdn-full').classList.add('hidden'); UI.closeModal(); }
    if (V.phase === 'meet') { closeTask(); toggleMap(false); $('.mdn-full').classList.add('hidden'); }
    if (V.phase === 'eject' && V.eject) { toggleMap(false); $('.mdn-meet').classList.add('hidden'); UI.closeModal(); showEject(); }
    if (V.phase === 'over' && V.win) { closeTask(); toggleMap(false); $('.mdn-meet').classList.add('hidden'); UI.closeModal(); showOver(); }
    if (V.phase === 'play' && !lastPhase) $('.mdn-full').classList.add('hidden');
    lastPhase = V.phase;
  }
  if (s && lastAlive && !s.alive) { closeTask(); }
  if (s) lastAlive = s.alive;
  paintMeet();
  if (task && task.fix != null && !(V.sab && V.sab.k === 'lights')) closeTask(true);
  hudTick();
  voices();
}

function onEvent(e, hidden) {
  const my = mySeat(), at = (x, y) => ({ x: (x - cam.x) * unit() + innerWidth / 2, y: (y - cam.y) * unit() + innerHeight / 2 });
  switch (e.t) {
    case 'go': SFX.myTurn(); break;
    case 'kill':
      if (e.v === my) { showDeath(e.l); SFX.boom(); }
      else { SFX.noise(0.25, { v: 0.4, f: 900 }); SFX.tone(140, 0.3, { type: 'sawtooth', v: 0.15, to: 60 }); if (!hidden) UI.burst(at(e.x, e.y).x, at(e.x, e.y).y, ['#b00', '#e33', '#600'], 26, 5); }
      break;
    case 'shieldBreak': SFX.tone(1400, 0.3, { type: 'triangle', v: 0.15 }); UI.floatAt(at(e.x, e.y), '🛡️💥', 'big'); if (S() && S().team === 'imp' && e.v !== my) UI.toast('🛡️ Mục tiêu có khiên — nhát giết bị chặn!'); if (e.v === my) UI.toast('🛡️ Khiên của bạn vừa đỡ một nhát giết!'); break;
    case 'shot': SFX.noise(0.3, { v: 0.6, f: 2000 }); UI.floatAt(at(e.x, e.y), '💥', 'big'); if (e.s === my) UI.toast(e.hit ? '🎯 Bắn trúng Kẻ Mạo Danh!' : '😵 Bắn nhầm người tốt — bạn đã chết!'); if (e.v === my && e.hit) showDeath(e.s); break;
    case 'meet': SFX.gong(); SFX.tone(700, 0.4, { type: 'square', v: 0.08 }); SFX.tone(500, 0.4, { type: 'square', v: 0.08, delay: 0.4 }); break;
    case 'voted': SFX.tick(); break;
    case 'task': if (e.p === my) SFX.card(); break;
    case 'sab': if (SABS[e.k].crit) SFX.tone(220, 0.6, { type: 'sawtooth', v: 0.1, to: 440 }); else SFX.tone(400, 0.5, { type: 'sine', v: 0.15, to: 80 }); break;
    case 'fixed': SFX.tone(660, 0.15, { type: 'triangle', v: 0.12 }); SFX.tone(990, 0.25, { type: 'triangle', v: 0.12, delay: 0.12 }); break;
    case 'seal': UI.toast(`🔒 ${esc(M.rooms[e.r].name)} đã bị niêm phong${e.dead.length ? ' — ' + e.dead.map(x => esc(V.names[x])).join(', ') + ' mắc kẹt bên trong 💀' : ''}`, 4500); SFX.boom(); if (e.dead.includes(my)) full('<div class="fd"><div class="big">🌊</div><div class="sub">Bạn bị kẹt lại trong khoang bị niêm phong!</div></div>', 'death', 3500); break;
    case 'doors': SFX.noise(0.3, { v: 0.3, f: 200, ft: 'lowpass' }); break;
    case 'ev': { const E = EVENTS[e.k]; UI.toast(`${E.icon} <b>${esc(E.name)}</b> — ${esc(E.desc)}`, 3500); SFX.tele(); break; }
    case 'vent': SFX.whoosh(); if (!hidden && e.l !== undefined) UI.floatAt(at(e.x, e.y), '🕳️'); break;
    case 'ride': UI.toast(`🎢 ${e.l >= 0 ? pn(e.l) : '???'} đang đi tàu lượn: ${esc(M.rooms[e.from].name)} → ${esc(M.rooms[e.to].name)}`, 3000); SFX.whoosh(); break;
    case 'ping': SFX.tone(1200, 0.6, { v: 0.12, to: 1150 }); SFX.tone(1200, 0.6, { v: 0.05, delay: 0.5 }); UI.toast('📡 Ai đó vừa dùng Sonar...', 1800); break;
    case 'pick': if (e.p === my) { SFX.pop(); UI.toast(`🎁 Nhặt được ${ITEMS[e.k].icon} <b>${esc(ITEMS[e.k].name)}</b> — ${esc(ITEMS[e.k].desc)}`, 3000); } break;
    case 'useItem': SFX.tele(); break;
    case 'poof': SFX.whoosh(); if (!hidden) UI.burst(at(e.x, e.y).x, at(e.x, e.y).y, ['#999', '#ccc', '#666'], 30, 4); break;
    case 'inspect': {
      const c = UI.openModal(`<h2 class="center">🔍 Kết quả soi xác ${pn(e.b)}</h2><p class="center">Chết khoảng <b>${e.sec}</b> giây trước.</p>
        <p class="center">${e.sus.length ? `Hung thủ là một trong: ${e.sus.map(x => pn(x)).join(' hoặc ')}` : 'Không tìm được dấu vết hung thủ.'}</p><div class="btns"><button class="gold" data-x>Đã nhớ</button></div>`);
      c.querySelector('[data-x]').onclick = UI.closeModal;
      break;
    }
    case 'suck': UI.toast(`🌀 Khoang khí mở toang — ${esc(M.rooms[e.r].name)}!`, 3000); SFX.whoosh(); SFX.noise(1.2, { v: 0.4, f: 300, fto: 2000 }); break;
    case 'tunnel': SFX.noise(5, { v: 0.12, f: 120, ft: 'lowpass' }); break;
    case 'heart': UI.floatAt(at(e.x, e.y), '💔', 'big'); if (e.p === my) full('<div class="fd"><div class="big">💔</div><div class="sub">Người thương của bạn đã chết... và bạn đi theo.</div></div>', 'death', 3500); break;
    case 'guard': if (S() && S().role === 'guard' && S().alive) UI.toast(`🛡️ Đã đặt khiên cho ${pn(e.v)}`); break;
    case 'ladder': SFX.click(); break;
    case 'win': break;
  }
}

// Đàm thoại: âm lượng nghe từng người do server tính (hear: ghế → 0..1); người xem thì người sống không nghe được.
function voices() {
  const room = CTX.room();
  if (!room) return;
  const map = {}, my = CTX.me().uid;
  const omni = !S() || !S().alive || V.phase === 'over' || V.o.voice === 'all';
  for (const m of room.members) {
    if (m.uid === my) continue;
    map[m.uid] = m.seat >= 0 ? (V.hear[m.seat] ?? (omni ? 1 : 0)) : (omni ? 1 : 0);
  }
  const k = JSON.stringify(map);
  if (k !== volKey) { volKey = k; CTX.voice && CTX.voice.volumes(map); }
}

// ---------- điều khiển ----------
function bindInput() {
  const kd = e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); if (k.startsWith('arrow')) e.preventDefault(); }
    if (e.repeat) return;
    // bản đồ mở được cả lúc họp (để xem tên phòng khi bàn luận)
    if (k === 'tab') { e.preventDefault(); if (V && (V.phase === 'play' || V.phase === 'meet')) toggleMap(); }
    if (k === 'escape' && mapOpen && V && V.phase === 'meet') return toggleMap(false);
    if (!V || V.phase !== 'play') return;
    if (k === 'e' || k === ' ') { e.preventDefault(); doUse(); }
    if (k === 'q') doKill();
    if (k === 'r') doReport();
    if (k === 'f') doAbility();
    if (k === 'g') doItem();
    if (k === 'x' && S() && S().team === 'imp') toggleMap();
    if (k === 'escape') { if (task) closeTask(); else if (mapOpen) toggleMap(false); }
  };
  const ku = e => keys.delete(e.key.toLowerCase());
  const blur = () => keys.clear();
  addEventListener('keydown', kd);
  addEventListener('keyup', ku);
  addEventListener('blur', blur);
  addEventListener('resize', resize);
  handlers.push(['keydown', kd], ['keyup', ku], ['blur', blur], ['resize', resize]);
  // joystick: chạm/kéo bất cứ đâu trên bản đồ
  const jEl = $('.mdn-joy'), knob = jEl.querySelector('i');
  cv.onpointerdown = e => {
    if (!S()) { const ids = V ? V.ps.map(p => p.p) : []; if (ids.length) follow = ids[(ids.indexOf(follow) + 1) % ids.length]; return; }
    cv.setPointerCapture(e.pointerId);
    joy = { id: e.pointerId, cx: e.clientX, cy: e.clientY, x: 0, y: 0, on: true };
    jEl.style.left = e.clientX + 'px'; jEl.style.top = e.clientY + 'px';
    jEl.classList.remove('hidden');
    knob.style.transform = '';
  };
  cv.onpointermove = e => {
    if (!joy || joy.id !== e.pointerId) return;
    const dx = e.clientX - joy.cx, dy = e.clientY - joy.cy, l = Math.hypot(dx, dy), R = 55;
    const k = l > R ? R / l : 1;
    joy.x = l > 8 ? dx * k / R : 0; joy.y = l > 8 ? dy * k / R : 0;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };
  cv.onpointerup = cv.onpointercancel = e => { if (joy && joy.id === e.pointerId) { joy = null; jEl.classList.add('hidden'); } };
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root;
    V = null; M = null; MID = null; off = null; me = null; disp = {}; keys = new Set(); joy = null; srvOff = 0; sentAt = 0; sentPos = { x: 0, y: 0 };
    task = null; cam = { x: 0, y: 0 }; visR = null; volKey = ''; follow = null; anchors = {}; seen = {}; alarmAt = 0; hudAt = 0; mapOpen = false; sabPick = null;
    lastAlive = null; lastPhase = null; handlers = []; prevT = 0;
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = `<div class="mdn dark">
      <canvas class="mdn-cv"></canvas>
      <div class="mdn-hud"></div>
      <div class="mdn-joy hidden"><i></i></div>
      <div class="mdn-task hidden"><div class="mgw"><div class="mg"></div><button class="ghost mg-x" title="Đóng (Esc)">✕</button></div></div>
      <div class="mdn-map hidden"><div class="mm"><div class="mm-head"><b>🗺️ Bản đồ</b><button class="ghost" data-x>✕</button></div><canvas></canvas><div class="sabs hidden"></div></div></div>
      <div class="mdn-meet hidden"></div>
      <div class="mdn-full hidden"></div>
    </div>`;
    cv = $('.mdn-cv'); g = cv.getContext('2d');
    fogCv = document.createElement('canvas'); fg = fogCv.getContext('2d');
    resize();
    buildHud();
    $('.mg-x').onclick = () => closeTask();
    $('.mdn-map [data-x]').onclick = () => toggleMap(false);
    $('.mdn-map').onclick = e => { if (e.target === $('.mdn-map')) toggleMap(false); };
    bindInput();
    // móc kiểm thử tự động (localStorage.mdn_debug = 1): script trong trang đọc trạng thái + lái nhân vật như joystick
    if (localStorage.getItem('mdn_debug')) window.__mdn = { get V() { return V; }, get me() { return me; }, get M() { return M; }, targets, doUse, doKill, doReport,
      steer: (x, y) => { joy = x == null ? null : { id: -1, x, y, on: true }; } };
    raf = requestAnimationFrame(frame);
    return {
      update,
      onRoom: () => { if (V) voices(); },
      emoteAnchor(seat) {
        if (V && V.phase === 'meet') { const c = $(`.mt-card[data-s="${seat}"]`); if (c) { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 8 }; } }
        return anchors[seat] || null;
      },
      unmount() {
        cancelAnimationFrame(raf);
        for (const [ev, fn] of handlers) removeEventListener(ev, fn);
        if (task) task.close && task.close();
      },
    };
  },
};
