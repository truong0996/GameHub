// Ví credit + cửa hàng đồ trang trí phía client: vẽ tên/khung ảnh/danh hiệu/khung chat theo đồ đang mặc (look),
// hiệu ứng thắng, thông báo credit sau ván, bảng cửa hàng. Danh sách món + công thức ở shop-data.js (dùng chung với server).
import { $, el, esc, pick, toast, openModal, closeModal, floatAt, spawn, burst, confetti, PALETTE } from './ui.js';
import { sfx, tone } from './sfx.js';
import { CREDIT, SLOTS, COLLECTIONS, RARITY, ITEMS, ITEM, itemPrice } from './shop-data.js';
import { TITLE } from './achievements-data.js';

let W = null;      // ví của mình { credits, earned, today, cap, owned, eq } — null = chưa đăng nhập
let O = null;      // { request(t, data) → Promise, name() → tên mình, avatar() → URL ảnh đại diện | null, loggedIn() → bool, onChange() }
let paintShop = null;
let tab = 'xmas', tryOn = {};   // tab đang mở, đồ đang "thử" trong bảng cửa hàng (chưa mua)

export function initShop(o) { O = o; }
export const myWallet = () => W;
export const renameCards = () => (W && W.bag && W.bag.cards && W.bag.cards['u-rename']) || 0;
export function setWallet(w) {
  W = w || null;
  if (O) O.onChange();
  // modal Thành tựu cũng mang class .shop (mượn giao diện) → loại ra, không thì vẽ nhầm vào cửa hàng đã đóng
  if (paintShop && $('#modal .shop:not(.ach)')) paintShop(); else paintShop = null;
}
export const fmt = n => Number(n || 0).toLocaleString('vi-VN');
// Biểu cảm thêm từ các gói đã mua (thanh emoji trong game).
export const extraEmotes = () => (W ? W.owned.flatMap(id => (ITEM[id] && ITEM[id].emojis) || []) : []);

// ---------- vẽ theo đồ đang mặc ----------
const cls = (look, slot) => (look && look[slot] && ITEM[look[slot]] ? 'lk-' + look[slot] : '');
// Tên: color = màu ghế (in kiểu .pn) hoặc bỏ trống. Có hiệu ứng tên thì hiệu ứng thay màu.
export function nameHtml(name, look, color) {
  const c = cls(look, 'name');
  return `<b class="${color ? 'pn' : 'nm'}${c ? ' lk-nx ' + c : ''}"${color ? ` style="--c:${esc(color)}"` : ''}>${esc(name)}</b>`;
}
export function titleHtml(look) {
  const it = look && (TITLE[look.title] || ITEM[look.title]);
  return it ? ` <span class="lk-ttl rar-${it.rar}${it.fx ? ` ttl-${it.fx}` : ''}">${esc(it.text)}</span>` : '';
}
export const frameCls = look => { const c = cls(look, 'frame'); return c ? ' lk-fr ' + c : ''; };
export const bubbleCls = look => { const c = cls(look, 'bubble'); return c ? ' lk-bub ' + c : ''; };
const COMBO = {
  sakura: { icon: '🌸', name: 'Hoa Anh Đào', colors: ['#ff7eb3', '#ffd1e3', '#fff'] },
  ocean: { icon: '🫧', name: 'Đại Dương', colors: ['#38c8ff', '#9fe1ff', '#fff'] },
  gold: { icon: '👑', name: 'Hoàng Kim', colors: ['#ffd23f', '#ffe999', '#fff'] },
  fire: { icon: '🔥', name: 'Hoả Diệm', colors: ['#ff4d00', '#ffb000', '#fff2a8'] },
  xmas: { icon: '🎄', name: 'Giáng Sinh', colors: ['#c23b3b', '#276749', '#ffd23f', '#fff'] },
  rainbow: { icon: '🌈', name: 'Cầu Vồng', colors: PALETTE },
  galaxy: { icon: '🪐', name: 'Thiên Hà', colors: ['#00e5ff', '#7c4dff', '#ffe9a8', '#fff'] },
};
export function comboSet(look) {
  const f = look && look.frame && look.frame.startsWith('fr-') ? look.frame.slice(3) : '';
  const n = look && look.name && look.name.startsWith('nx-') ? look.name.slice(3) : '';
  return f && f === n && COMBO[f] ? f : null;
}
export const comboCls = look => { const s = comboSet(look); return s ? ` lk-cb lk-cb-${s}` : ''; };
export const comboFx = look => { const s = comboSet(look); return s ? `<i class="lk-fx lk-fx-${s}" aria-hidden="true"></i>` : ''; };
export const comboStage = look => { const s = comboSet(look); return s ? `<i class="lk-cb-bg lk-cb-bg-${s}" aria-hidden="true"></i>` : ''; };

// ---------- đồ trong game (game đọc qua ctx.skin) ----------
// Lưng bài: gắn ' lk-bk lk-<id>' vào phần tử lá úp. Khung tranh: ' lk-ez lk-<id>' vào khung chứa tranh. Xúc xắc: ' lk-dc lk-<id>' vào khung xúc xắc, mặt xúc xắc có class lk-df, chấm có class pip.
const BASE = { back: 'lk-bk', dice: 'lk-dc', easel: 'lk-ez' };
export const skinCls = (look, slot) => { const c = cls(look, slot); return c && BASE[slot] ? ` ${BASE[slot]} ${c}` : ''; };
// Đổi skin của một phần tử có sẵn (gỡ class lk-* cũ).
export function setSkin(node, look, slot) {
  if (!node) return;
  node.classList.remove(...[...node.classList].filter(k => k.startsWith('lk-')));
  const s = skinCls(look, slot).trim();
  if (s) node.classList.add(...s.split(' '));
}

// Mũ: vẽ trong hệ toạ độ của nhân vật — (0, top) = đỉnh đầu, w = bề ngang người, t = giây (đồ động). Đã save/restore.
function star4(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, k = i % 2 ? r * 0.28 : r; c.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
  c.closePath(); c.fill();
}
export function drawHat(c, id, w, top, t = 0) {
  const it = ITEM[id];
  if (!it || it.slot !== 'hat') return;
  c.save();
  if (it.emoji) {
    const sz = w * 0.85;
    if (it.glow) { c.shadowColor = it.glow; c.shadowBlur = w * (0.35 + 0.15 * Math.sin(t * 4)); }
    c.font = `${sz}px serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(it.emoji, w * 0.04, top - sz * 0.16);
    if (it.glow) {   // lấp lánh
      c.shadowBlur = w * 0.2; c.fillStyle = '#fff';
      const k = (t * 1.3) % 2;
      if (k < 1) star4(c, w * (0.36 - 0.5 * Math.floor(t * 0.65 % 2)), top - sz * 0.42, w * 0.13 * Math.sin(k * Math.PI));
    }
  } else if (it.draw === 'horns') {
    c.shadowColor = it.glow; c.shadowBlur = w * (0.3 + 0.15 * Math.sin(t * 5));
    const gr = c.createLinearGradient(0, top - w * 0.5, 0, top + w * 0.1);
    gr.addColorStop(0, '#ffe0a0'); gr.addColorStop(0.25, '#ff3b1f'); gr.addColorStop(1, '#7a0010');
    c.fillStyle = gr; c.strokeStyle = 'rgba(40,0,0,.85)'; c.lineWidth = Math.max(1, w * 0.05);
    for (const sx of [-1, 1]) {
      const x0 = sx * w * 0.24;
      c.beginPath();
      c.moveTo(x0 - sx * w * 0.13, top + w * 0.1);
      c.quadraticCurveTo(x0 - sx * w * 0.02, top - w * 0.28, x0 + sx * w * 0.2, top - w * 0.5);
      c.quadraticCurveTo(x0 + sx * w * 0.06, top - w * 0.2, x0 + sx * w * 0.14, top + w * 0.08);
      c.closePath(); c.fill(); c.stroke();
    }
  } else if (it.draw === 'halo') {
    const y = top - w * 0.3 + Math.sin(t * 2.5) * w * 0.04;
    c.shadowColor = it.glow; c.shadowBlur = w * (0.5 + 0.2 * Math.sin(t * 3));
    c.strokeStyle = '#fff3b0'; c.lineWidth = w * 0.11;
    c.beginPath(); c.ellipse(0, y, w * 0.42, w * 0.13, 0, 0, 7); c.stroke();
    c.strokeStyle = '#ffc400'; c.lineWidth = w * 0.05;
    c.beginPath(); c.ellipse(0, y, w * 0.42, w * 0.13, 0, 0, 7); c.stroke();
    c.fillStyle = '#fff'; c.shadowBlur = w * 0.25;
    for (let k = 0; k < 3; k++) {
      const a = t * 2 + k * 2.094, s = 0.6 + 0.4 * Math.sin(t * 6 + k);
      star4(c, Math.cos(a) * w * 0.42, y + Math.sin(a) * w * 0.13, w * 0.11 * s);
    }
  } else if (it.draw === 'flame') {
    c.globalCompositeOperation = 'lighter';
    c.shadowColor = it.glow; c.shadowBlur = w * 0.4;
    for (let k = 0; k < 5; k++) {
      const x = (k - 2) * w * 0.17, fh = w * (0.42 + 0.16 * Math.sin(t * 9 + k * 1.7) + (k === 2 ? 0.18 : 0)), fw = w * 0.15;
      const sway = Math.sin(t * 6 + k) * w * 0.05, y0 = top + w * 0.1;
      const gr = c.createLinearGradient(0, y0, 0, y0 - fh);
      gr.addColorStop(0, '#ffef80'); gr.addColorStop(0.4, '#ff9a00'); gr.addColorStop(1, 'rgba(255,30,0,0)');
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(x - fw, y0);
      c.quadraticCurveTo(x - fw * 1.1, y0 - fh * 0.5, x + sway, y0 - fh);
      c.quadraticCurveTo(x + fw * 1.1, y0 - fh * 0.5, x + fw, y0);
      c.closePath(); c.fill();
    }
    c.fillStyle = '#ffd23f';
    const a0 = c.globalAlpha;   // giữ độ mờ của nhân vật (tàng hình, hồn ma)
    for (let k = 0; k < 4; k++) {   // tàn lửa bay lên
      const p = (t * 0.9 + k * 0.25) % 1;
      c.globalAlpha = a0 * (1 - p);
      c.beginPath(); c.arc(Math.sin(k * 2.3 + t * 3) * w * 0.3, top - w * (0.2 + p * 0.7), w * 0.035, 0, 7); c.fill();
    }
  } else if (it.draw === 'santa') {
    const sway = Math.sin(t * 3.5) * w * 0.06, y0 = top + w * 0.06;
    c.shadowColor = 'rgba(255,70,70,.45)'; c.shadowBlur = w * 0.24;
    // thân mũ đỏ cong rủ sang một bên
    const gr = c.createLinearGradient(0, y0 - w * 0.6, 0, y0);
    gr.addColorStop(0, '#e63946'); gr.addColorStop(1, '#9e1b24');
    c.fillStyle = gr; c.strokeStyle = 'rgba(60,10,10,.7)'; c.lineWidth = Math.max(1, w * 0.045);
    c.beginPath();
    c.moveTo(-w * 0.44, y0);
    c.quadraticCurveTo(-w * 0.22, y0 - w * 0.56, w * 0.14 + sway * 0.5, y0 - w * 0.54);
    c.quadraticCurveTo(w * 0.48 + sway, y0 - w * 0.46, w * 0.5 + sway, y0 - w * 0.18);
    c.quadraticCurveTo(w * 0.34, y0 - w * 0.14, w * 0.44, y0);
    c.closePath(); c.fill(); c.stroke();
    // viền lông trắng mịn
    c.fillStyle = '#fffdf9'; c.strokeStyle = 'rgba(180,190,195,.85)';
    c.beginPath(); c.roundRect(-w * 0.48, y0 - w * 0.13, w * 0.96, w * 0.2, w * 0.1); c.fill(); c.stroke();
    // quả bông trắng ở chóp mũ
    c.beginPath(); c.arc(w * 0.5 + sway, y0 - w * 0.17, w * 0.125, 0, 7); c.fill(); c.stroke();
    const k = (t * 1.2) % 2;
    if (k < 1) { c.fillStyle = '#fff'; c.shadowColor = '#ffd23f'; c.shadowBlur = w * 0.2; star4(c, -w * 0.12, y0 - w * 0.38, w * 0.1 * Math.sin(k * Math.PI)); }
  } else if (it.draw === 'antlers') {
    const y0 = top + w * 0.06;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#6f4222'; c.lineWidth = Math.max(2, w * 0.11);
    c.shadowColor = 'rgba(217,138,60,.45)'; c.shadowBlur = w * 0.2;
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.moveTo(sx * w * 0.2, y0);
      c.quadraticCurveTo(sx * w * 0.38, y0 - w * 0.24, sx * w * 0.46, y0 - w * 0.5);
      c.moveTo(sx * w * 0.32, y0 - w * 0.2);
      c.lineTo(sx * w * 0.16, y0 - w * 0.38);
      c.moveTo(sx * w * 0.4, y0 - w * 0.35);
      c.lineTo(sx * w * 0.56, y0 - w * 0.32);
      c.stroke();
      c.strokeStyle = '#9c6238'; c.lineWidth = Math.max(1, w * 0.045);
      c.stroke();
      c.strokeStyle = '#6f4222'; c.lineWidth = Math.max(2, w * 0.11);
    }
    // lá nhựa ruồi + quả đỏ ở giữa
    c.fillStyle = '#276749';
    c.beginPath(); c.ellipse(-w * 0.1, y0 - w * 0.04, w * 0.1, w * 0.05, -0.35, 0, 7); c.fill();
    c.beginPath(); c.ellipse(w * 0.1, y0 - w * 0.04, w * 0.1, w * 0.05, 0.35, 0, 7); c.fill();
    c.fillStyle = '#d62828';
    c.beginPath(); c.arc(0, y0 - w * 0.03, w * 0.065, 0, 7); c.fill();
  }
  c.restore();
}
// Nhân vật mẫu (xem trước mũ trong cửa hàng): hạt đậu đơn giản.
function miniBean(c, x, y, u, col, id, t) {
  const w = u * 0.62, h = u * 0.78;
  c.save(); c.translate(x, y);
  c.lineWidth = Math.max(1.5, u * 0.045); c.strokeStyle = 'rgba(20,20,30,.85)';
  c.fillStyle = col;
  c.beginPath(); c.roundRect(-w / 2, -h * 0.5, w, h * 0.92, [w * 0.48, w * 0.48, w * 0.16, w * 0.16]); c.fill(); c.stroke();
  c.fillStyle = '#9fd3e8';
  c.beginPath(); c.ellipse(w * 0.14, -h * 0.2, w * 0.33, h * 0.14, 0, 0, 7); c.fill(); c.stroke();
  drawHat(c, id, w, -h * 0.5, t);
  c.restore();
}
// Vẽ (và cho chuyển động) mọi canvas xem trước mũ đang có trên trang; tự dừng khi không còn canvas nào.
let hatRaf = 0;
function hatLoop() {
  if (hatRaf) return;
  const step = ms => {
    const list = document.querySelectorAll('canvas.sh-hat');
    if (!list.length) { hatRaf = 0; return; }
    for (const cv of list) {
      const c = cv.getContext('2d'), s = cv.width;
      c.clearRect(0, 0, s, s);
      miniBean(c, s / 2, s * 0.68, s * 0.8, '#3fb6a8', cv.dataset.id, ms / 1000);
    }
    hatRaf = requestAnimationFrame(step);
  };
  hatRaf = requestAnimationFrame(step);
}
const PIP5 = [0, 2, 4, 6, 8];
const dieHtml = (id, pips = PIP5) => `<div class="sh-die lk-dc lk-${id}"><div class="lk-df">${Array.from({ length: 9 }, (_, j) => `<i class="${pips.includes(j) ? 'pip' : ''}"></i>`).join('')}</div></div>`;
const backHtml = it => `<div class="sh-back lk-bk lk-${it.id}"><span>${it.motif || ''}</span></div>`;
const easelHtml = id => `<div class="sh-easel lk-ez lk-${id}"><span>🎨</span></div>`;
const hatHtml = (id, size = 76) => `<canvas class="sh-hat" width="${size * 2}" height="${size * 2}" style="width:${size}px;height:${size}px" data-id="${id}"></canvas>`;

// ---------- hiệu ứng thắng ----------
const GOLD = ['#ffd23f', '#ffb300', '#fff2a8', '#e0a100', '#ffffff'];
const FIRE = ['#ff2a00', '#ff6a00', '#ffb000', '#ffe066'];
const STAR = ['#ffffff', '#bfe3ff', '#8fd3ff', '#ffe98f'];
const SNOW = ['#ffffff', '#d8f3ff', '#b8e8ff', '#ffe699'];
const XMAS = ['#c23b3b', '#276749', '#ffd23f', '#ffffff'];
const center = () => ({ x: innerWidth / 2, y: innerHeight * 0.45 });

// emoji bắn ra từ một điểm
function pop(pt, chars, n, spd = 6, size = 28) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = spd * (0.4 + Math.random());
    spawn({ text: pick(chars), x: pt.x, y: pt.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3, g: 0.14, life: 1.4, decay: 0.012,
      size: size * (0.7 + Math.random() * 0.6), rot: (Math.random() - 0.5) * 0.8, vr: (Math.random() - 0.5) * 0.08 });
  }
}
// emoji rơi từ trên xuống cả màn hình
function rain(chars, n, size = 30, { life = 2.4, decay = 0.0048, vy = 2.3 } = {}) {
  for (let i = 0; i < n; i++) spawn({ text: pick(chars), x: Math.random() * innerWidth, y: -40 - Math.random() * innerHeight * 0.8,
    vx: (Math.random() - 0.5) * 1.6, vy: vy + Math.random() * 2.4, g: 0.03, drag: 0.995, life, decay,
    size: size * (0.7 + Math.random() * 0.6), rot: (Math.random() - 0.5) * 0.8, vr: (Math.random() - 0.5) * 0.06 });
}
// sao băng: đầu sao + vệt sáng
function shootingStar(x0, y0, vx, vy, frames = 45) {
  let k = 0;
  const iv = setInterval(() => {
    const x = x0 + vx * k, y = y0 + vy * k;
    for (let j = 0; j < 3; j++) spawn({ x, y, vx: (Math.random() - 0.5) * 0.8 - vx * 0.05, vy: (Math.random() - 0.5) * 0.8, g: 0.02, life: 1,
      decay: 0.03 + Math.random() * 0.03, size: 1.5 + Math.random() * 2.5, color: pick(STAR) });
    if (k % 6 === 0) spawn({ text: '✨', x, y, vx: 0, vy: 0.5, g: 0.02, life: 1, decay: 0.03, size: 16 });
    if (++k > frames) { clearInterval(iv); burst(x, y, STAR, 30, 5); }
  }, 16);
  spawn({ text: '🌟', x: x0, y: y0, vx, vy, g: 0, drag: 1, life: 1, decay: 1 / frames, size: 34, vr: 0.15 });
}
// rồng bay ngang màn hình, vừa bay vừa phun lửa
function dragon(y, small) {
  const d = el('div', 'lk-dragon' + (small ? ' small' : ''), '🐉');
  d.style.top = y + 'px';
  document.body.appendChild(d);
  sfx.whoosh();
  const iv = setInterval(() => {
    const r = d.getBoundingClientRect();
    if (!r.width) return;
    const hx = r.left + r.width * 0.15, hy = r.top + r.height * 0.45;
    for (let j = 0; j < (small ? 3 : 8); j++) spawn({ x: hx, y: hy, vx: -4 - Math.random() * 6, vy: (Math.random() - 0.5) * 3.5, g: -0.025, life: 1.1,
      decay: 0.025 + Math.random() * 0.02, size: 3 + Math.random() * 5.5, color: pick(FIRE) });
    if (Math.random() < 0.5) spawn({ text: pick(['🔥', '✨']), x: r.right - r.width * 0.2, y: hy + 10, vx: 1 + Math.random() * 1.5, vy: 0.8 + Math.random(), g: 0.07, life: 1.15, decay: 0.02, size: 22 });
  }, 30);
  setTimeout(() => { clearInterval(iv); d.remove(); }, small ? 1700 : 2600);
}
// xe tuần lộc ông già Noel bay ngang màn hình, thả quà & tuyết
function santaSleigh(y, small) {
  const d = el('div', 'lk-sleigh' + (small ? ' small' : ''), '🎅🦌🦌🛷');
  d.style.top = y + 'px';
  document.body.appendChild(d);
  sfx.whoosh();
  const iv = setInterval(() => {
    const r = d.getBoundingClientRect();
    if (!r.width) return;
    const x = r.left + r.width * 0.72, hy = r.top + r.height * 0.55;
    for (let j = 0; j < (small ? 2 : 5); j++) spawn({ x, y: hy, vx: 1 + Math.random() * 2.5, vy: 1 + Math.random() * 2.5, g: 0.04, life: 1.2,
      decay: 0.02 + Math.random() * 0.015, size: 2.5 + Math.random() * 4, color: pick(XMAS) });
    if (Math.random() < 0.55) spawn({ text: pick(['🎁', '❄️', '✨', '🎄']), x, y: hy, vx: (Math.random() - 0.5) * 1.8, vy: 1.4 + Math.random() * 1.4, g: 0.06, life: 1.35, decay: 0.018, size: small ? 18 : 24 });
  }, 55);
  setTimeout(() => { clearInterval(iv); d.remove(); }, small ? 1700 : 2600);
}

export const FX = {
  'fx-confetti': { icon: '🎊', play(pt, small) {
    burst(pt.x, pt.y, PALETTE, small ? 45 : 80, small ? 6 : 9);
    pop(pt, ['🎊', '🎉'], small ? 5 : 10);
    if (!small) confetti(240);
    sfx.pop();
  } },
  'fx-snow': { icon: '❄️', play(pt, small) {
    burst(pt.x, pt.y, SNOW, small ? 45 : 85, small ? 6 : 9);
    pop(pt, ['❄️', '❅', '🔔'], small ? 6 : 11, 6);
    if (!small) { confetti(140, SNOW); rain(['❄️', '❅', '✨', '🔔'], 55, 26, { life: 2.8, decay: 0.004 }); }
    tone(1046, 0.12, { type: 'sine', v: 0.06 }); tone(1319, 0.16, { type: 'sine', v: 0.06, delay: 0.07 }); tone(1568, 0.25, { type: 'sine', v: 0.06, delay: 0.14 });
  } },
  'fx-gold': { icon: '💰', play(pt, small) {
    burst(pt.x, pt.y, GOLD, small ? 50 : 90, small ? 7 : 10);
    pop(pt, ['💰', '🪙'], small ? 7 : 12, 7);
    if (!small) { confetti(160, GOLD); rain(['💰', '🪙', '🪙', '💎'], 45); }
    coin();
  } },
  'fx-fireworks': { icon: '🎆', play(pt, small) {
    const n = small ? 3 : 9;
    for (let i = 0; i < n; i++) setTimeout(() => {
      const x = small ? pt.x + (Math.random() - 0.5) * 160 : innerWidth * (0.12 + Math.random() * 0.76);
      const y = small ? pt.y - 30 - Math.random() * 80 : innerHeight * (0.1 + Math.random() * 0.45);
      const c = [pick(PALETTE), pick(PALETTE), '#fff'];
      burst(x, y, c, small ? 60 : 110, small ? 6 : 10);
      setTimeout(() => burst(x, y, ['#fff', '#ffe98f'], 25, 3), 160);
      tone(160 + Math.random() * 120, 0.5, { type: 'triangle', v: 0.12, to: 40 });
    }, i * (small ? 220 : 260));
  } },
  'fx-stars': { icon: '🌠', play(pt, small) {
    const n = small ? 3 : 14;
    for (let i = 0; i < n; i++) setTimeout(() => {
      if (small) shootingStar(pt.x - 140 - Math.random() * 40, pt.y - 120 - Math.random() * 40, 5, 4, 32);
      else shootingStar(innerWidth * (-0.08 + Math.random() * 0.72), innerHeight * (-0.08 + Math.random() * 0.3), 8.5 + Math.random() * 4, 4.8 + Math.random() * 3, 56);
      tone(1200 + Math.random() * 800, 0.4, { type: 'sine', v: 0.05, to: 600 });
    }, i * 210);
    if (!small) {
      burst(pt.x, pt.y, STAR, 70, 8);
      rain(['✨', '⭐', '🌟', '💫'], 55, 25, { life: 2.8, decay: 0.004 });
      setTimeout(() => rain(['✨', '⭐', '🌟', '🌠'], 50, 23, { life: 2.8, decay: 0.004 }), 1100);
    }
  } },
  'fx-santa': { icon: '🎅', play(pt, small) {
    if (small) { pop(pt, ['🎅', '🎁', '❄️'], 7, 7); burst(pt.x, pt.y, XMAS, 60, 7); sfx.whoosh(); return; }
    santaSleigh(innerHeight * 0.24, false);
    rain(['❄️', '🎁', '✨'], 45, 26, { life: 2.8, decay: 0.0042 });
    setTimeout(() => { burst(innerWidth * 0.55, innerHeight * 0.38, XMAS, 110, 10); rain(['🎁', '🎄', '❄️', '🎅'], 55, 28, { life: 2.8, decay: 0.004 }); }, 900);
    setTimeout(() => { burst(innerWidth * 0.35, innerHeight * 0.44, XMAS, 95, 9); rain(['❄️', '🔔', '✨', '🎁'], 45, 26, { life: 2.8, decay: 0.0042 }); }, 1800);
    tone(784, 0.12, { type: 'triangle', v: 0.08 }); tone(988, 0.12, { type: 'triangle', v: 0.08, delay: 0.12 }); tone(1175, 0.26, { type: 'triangle', v: 0.08, delay: 0.24 });
  } },
  'fx-dragon': { icon: '🐉', play(pt, small) {
    if (small) { pop(pt, ['🐉', '🔥', '🔥'], 7, 7); burst(pt.x, pt.y, FIRE, 60, 7); sfx.whoosh(); return; }
    dragon(innerHeight * 0.3, false);
    rain(['🔥', '✨', '🧧'], 45, 26, { life: 2.8, decay: 0.0042 });
    setTimeout(() => { burst(innerWidth * 0.55, innerHeight * 0.38, FIRE, 120, 11); rain(['🔥', '🧧', '✨', '🐉'], 55, 28, { life: 2.8, decay: 0.004 }); }, 950);
    setTimeout(() => { burst(innerWidth * 0.35, innerHeight * 0.44, FIRE, 100, 10); rain(['🔥', '✨', '🏮', '🧧'], 45, 26, { life: 2.8, decay: 0.0042 }); }, 1850);
  } },
};
function coin() { tone(988, 0.08, { type: 'square', v: 0.07 }); tone(1319, 0.3, { type: 'square', v: 0.07, delay: 0.08 }); }

// Trong lúc hiệu ứng lớn đang chạy thì tạm dừng animation CSS của cửa hàng (viền xoay, chữ chạy...) cho đỡ giật.
let fxBusy = 0;
export function playFx(id, pt, small = false) {
  const f = FX[id];
  if (!f || document.hidden) return;
  if (!small) {
    document.body.classList.add('lk-fxing');
    clearTimeout(fxBusy);
    fxBusy = setTimeout(() => document.body.classList.remove('lk-fxing'), 4800);
  }
  f.play(pt || center(), small);
}

// Tin 'credit' sau ván: cập nhật ví, chờ animation cuối ván rồi báo số credit vừa nhận.
export function creditNotice(m) {
  setWallet(m.wallet);
  setTimeout(() => {
    if (m.gain > 0) {
      floatAt(center(), `+${m.gain} 💰`, 'lk-gain');
      coin();
      toast(`💰 <b>+${m.gain}</b> credit${m.win ? ` <span class="lk-ttl rar-l">Hạng 1 ×${CREDIT.winMul}</span>` : ''} · Số dư: <b>${fmt(m.wallet.credits)}</b>` +
        (m.wallet.today >= m.wallet.cap ? ` · <span class="small">Đã đạt giới hạn ${CREDIT.dayCap}/ngày</span>` : ''), 4000);
    } else if (m.wallet.today >= m.wallet.cap) toast(`💰 Bạn đã đạt giới hạn ${CREDIT.dayCap} credit hôm nay — hãy quay lại vào ngày mai nhé.`, 3500);
  }, m.delay || 0);
}

// ---------- bảng cửa hàng ----------
const SAMPLE = 'Xin chào mọi người! 👋';
// Chấm ảnh đại diện để xem thử khung: có ảnh đại diện thì dùng ảnh, không thì chữ cái đầu tên.
function avaHtml(cls, look, initial) {
  const av = O.avatar && O.avatar();
  return `<div class="sh-ava${cls}${frameCls(look)}${comboCls(look)}${av ? ' has-av' : ''}"${av ? ` style="background-image:url('${esc(av)}')"` : ''}>${av ? '' : esc(initial)}${comboFx(look)}</div>`;
}
function preview(it, name, initial) {
  const look = { [it.slot]: it.id };
  switch (it.slot) {
    case 'frame': return avaHtml('', look, initial);
    case 'name': return `<div class="sh-nm">${nameHtml(name, look)}</div>`;
    case 'bubble': return `<div class="cm sh-bub${bubbleCls(look)}">${esc(SAMPLE)}</div>`;
    case 'fx': return `<div class="sh-fx" title="Nhấn để xem thử hiệu ứng"><i class="sh-fxi">${FX[it.id] ? FX[it.id].icon : '✨'}</i><span><svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M2 1.2l7.2 3.8-7.2 3.8z"/></svg> Xem thử</span></div>`;
    case 'back': return `<div class="sh-backs">${backHtml(it)}${backHtml(it)}</div>`;
    case 'dice': return `<div class="sh-dice">${dieHtml(it.id)}${dieHtml(it.id, [0, 4, 8])}</div>`;
    case 'hat': return hatHtml(it.id);
    case 'easel': return easelHtml(it.id);
    case 'emote': return `<div class="sh-em">${it.emojis.map(e => `<span>${e}</span>`).join('')}</div>`;
    case 'util': return `<div class="sh-ticket" aria-hidden="true"><div class="sh-tk-top"><span>🪪 PASS</span><i>★</i></div><div class="sh-tk-mid"><span>A…</span><b>→</b><span>B…</span></div></div>`;
  }
  return '';
}

export function openRenameModal({ fromShop = false } = {}) {
  if (!W) { toast('Đăng nhập ở trang chủ để đổi tên tài khoản.'); return; }
  const cnt = renameCards();
  if (cnt < 1) {
    const it = ITEM['u-rename'], price = itemPrice(it, W);
    const card = openModal(`<div class="ren-modal"><h2>🪪 Cần Thẻ Đổi Tên</h2>
      <p class="small muted">Chỉ có thể đổi tên tài khoản khi sở hữu <b>Thẻ Đổi Tên</b> trong Cửa hàng.</p>
      <div class="ren-note small">Giá: <b>${fmt(price)} 💰</b>${price < it.price ? ` (giảm <b>${it.firstSale}%</b> thẻ đầu từ <s>${fmt(it.price)}</s>)` : ''} · Số dư của bạn: <b>${fmt(W.credits)} 💰</b></div>
      <div class="btns"><button class="ghost" data-x>Đóng</button><button class="gold" data-buy>🛍️ Tới Cửa hàng</button></div></div>`);
    card.querySelector('[data-x]').onclick = closeModal;
    card.querySelector('[data-buy]').onclick = () => { sfx.pop(); openShop('util'); };
    return;
  }
  const curName = O.name() || '';
  const card = openModal(`<div class="ren-modal"><h2>🪪 Đổi tên tài khoản</h2>
    <p class="small muted">Tên hiện tại: <b>${esc(curName)}</b> · Đang có: <b>${cnt}</b> Thẻ Đổi Tên (dùng 1 thẻ mỗi lần đổi).</p>
    <label>Tên mới (2–16 ký tự) <input id="ren-in" maxlength="16" placeholder="Nhập tên mới..." autocomplete="off"></label>
    <div class="err"></div>
    <div class="btns"><button class="ghost" data-x>Huỷ</button><button class="gold" data-go>🪪 Đổi tên (1 thẻ)</button></div></div>`);
  const inp = card.querySelector('#ren-in'), err = card.querySelector('.err'), goBtn = card.querySelector('[data-go]');
  card.querySelector('[data-x]').onclick = () => (fromShop ? openShop('util') : closeModal());
  const submit = async () => {
    err.textContent = '';
    goBtn.disabled = true;
    const r = await O.request('rename', { name: inp.value });
    goBtn.disabled = false;
    if (!r.ok) { err.textContent = r.err; sfx.error(); return; }
    if (O.onRename) O.onRename(r.user);
    setWallet(r.wallet);
    sfx.win();
    toast(`🪪 Đã đổi tên thành <b>${esc(r.user.name)}</b>!`, 3200);
    if (fromShop) openShop('util'); else closeModal();
  };
  goBtn.onclick = submit;
  inp.onkeydown = e => { if (e.key === 'Enter') submit(); };
  inp.focus();
}

const colOf = id => COLLECTIONS.find(c => c.id === id);
export function openShop(startTab) {
  if (startTab) tab = startTab;
  if (!colOf(tab) && !SLOTS.some(s => s.id === tab)) tab = 'xmas';
  tryOn = {};
  const card = openModal(`<div class="sh-head"><h2>🛍️ Cửa hàng<span class="sh-wide"> vật phẩm</span></h2><span class="grow"></span>
    <button class="ghost" data-ach title="Xem Thành tựu để nhận xu và danh hiệu">🎖️<span class="sh-wide"> Thành tựu</span></button>
    <span class="sh-bal"></span>
    <button class="ghost" data-x title="Đóng (Esc)">✕</button></div>
    <div class="sh-subrow"><div class="sh-sub small muted"></div>
    <details class="sh-how small"><summary>💡 Cách tích luỹ credit</summary><ul>
      <li>Hoàn tất mỗi ván đấu <b>được xếp hạng</b> (từ 2 tài khoản đăng nhập trở lên): nhận <b>${CREDIT.base} credit × hệ số thời lượng</b> (×1 đến ×3 tuỳ độ dài ván đấu).</li>
      <li><b>Hạng 1 nhận ×${CREDIT.winMul}</b> tiền thưởng; các thứ hạng còn lại vẫn được cộng credit.</li>
      <li>Hoàn thành <b>🎖️ Thành tựu</b> trong các trò chơi để nhận thêm <b>credit</b> thưởng và mở khoá <b>Danh hiệu</b> độc quyền.</li>
      <li>Giới hạn tối đa <b>${CREDIT.dayCap} credit/ngày</b> (không tính thưởng thành tựu). Ván kết thúc sớm (bỏ dở) không cộng hay trừ credit.</li>
      <li>Mọi vật phẩm chỉ mang tính <b>trang trí cá nhân</b> — không ảnh hưởng tới luật chơi hay màu ghế.</li>
    </ul></details></div>
    <div class="sh-body"><nav class="sh-side"></nav>
      <div class="sh-main"><div class="sh-hero"></div><div class="sh-grid"></div></div></div>`);
  card.classList.add('shop');
  card.querySelector('[data-x]').onclick = closeModal;
  // hướng dẫn mở dạng bảng nổi → bấm ra ngoài thì đóng
  const how = card.querySelector('.sh-how');
  card.addEventListener('click', e => { if (how.open && !how.contains(e.target)) how.open = false; });
  card.querySelector('[data-ach]').onclick = () => { sfx.pop(); O && O.openAch && O.openAch(); };
  const bal = card.querySelector('.sh-bal');
  bal.onclick = () => {
    const r = bal.getBoundingClientRect(), pt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    burst(pt.x, pt.y, GOLD, 22, 5);
    pop(pt, ['💰', '🪙', '✨'], 5, 4, 20);
    coin();
  };
  const hero = card.querySelector('.sh-hero'), tabs = card.querySelector('.sh-side'), grid = card.querySelector('.sh-grid');

  const paint = () => {
    setTimeout(hatLoop);
    const name = O.name() || 'Bạn', initial = ([...name][0] || '?').toUpperCase(), on = !!W;
    const owned = new Set(W ? W.owned : []), eq = W ? W.eq : {};
    const permItems = ITEMS.filter(x => !x.consumable);
    const shopOwned = [...owned].filter(id => ITEM[id] && !ITEM[id].consumable).length;
    bal.innerHTML = on ? `<span class="sh-coin">💰</span> <b>${fmt(W.credits)}</b>` : '<span class="sh-coin">💰</span> <span class="small">Chế độ Khách</span>';
    bal.title = on ? `Số dư hiện có: ${fmt(W.credits)} credit` : 'Đăng nhập để tích luỹ credit';
    card.querySelector('.sh-sub').innerHTML = on
      ? `Hôm nay: <b>${fmt(W.today)}</b>/${fmt(W.cap)} credit · Tổng tích luỹ: <b>${fmt(W.earned)}</b> · Sở hữu: <b>${shopOwned}/${permItems.length}</b> vật phẩm`
      : `Bạn đang xem ở chế độ Khách — hãy <b>đăng nhập ở trang chủ</b> để tích luỹ credit và mở khoá vật phẩm.`;

    // hero: trông mình thế nào với đồ đang mặc + đồ đang thử
    const look = { ...eq, ...tryOn };
    const trying = Object.keys(tryOn).length, cb = comboSet(look);
    hero.className = 'sh-hero' + comboCls(look);
    hero.innerHTML = `${comboStage(look)}${avaHtml(' big', look, initial)}
      <div class="sh-me"><div>${nameHtml(name, look)}${titleHtml(look)}</div>
      <div class="cm sh-bub${bubbleCls(look)}">${esc(SAMPLE)}</div>
      <div class="small muted">${trying ? '👗 Đang xem thử trang bị (chưa sở hữu)' : on ? 'Hiển thị thực tế trong phòng chờ' : 'Nhấn vào từng vật phẩm bên dưới để xem thử'}${cb ? ` · ${COMBO[cb].icon} Hiệu ứng bộ ${COMBO[cb].name}` : ''}${look.fx ? ` · ${FX[look.fx].icon} ${esc(ITEM[look.fx].name)}` : ''}</div></div>
      ${look.back || look.dice || look.hat || look.easel ? `<div class="sh-ingame" title="Trang bị trong trò chơi">${look.back ? backHtml(ITEM[look.back]) : ''}${look.dice ? dieHtml(look.dice) : ''}${look.hat ? hatHtml(look.hat, 64) : ''}${look.easel ? easelHtml(look.easel) : ''}</div>` : ''}`;

    // menu dọc bên trái (điện thoại: 1 hàng cuộn ngang): bộ sưu tập theo chủ đề, đồ của hub (mọi game), đồ trong từng game
    const sideScroll = tabs.scrollTop, sideScrollX = tabs.scrollLeft;
    tabs.innerHTML = '';
    const navBtn = (id, icon, label, cnt, title, extra = '') => {
      const b = el('button', `sh-nav${extra}${tab === id ? ' on' : ''}`, `<i>${icon}</i><span class="sh-nav-nm">${esc(label)}</span>${cnt ? `<span class="sh-nav-n">${cnt}</span>` : ''}`);
      b.title = title;
      b.onclick = () => { if (tab === id) return; tab = id; grid.scrollTop = 0; sfx.click(); paint(); };
      return b;
    };
    tabs.appendChild(el('div', 'sh-grp', '🎨<span> Bộ sưu tập</span>'));
    for (const c of COLLECTIONS) {
      const items = ITEMS.filter(x => x.col === c.id);
      const n = items.reduce((sum, x) => sum + (owned.has(x.id) ? 1 : 0), 0);
      tabs.appendChild(navBtn(c.id, c.icon, c.name, `${n}/${items.length}`, `${c.desc} (Trang bị Khung + Tên cùng bộ để bật hiệu ứng combo)`, c.season ? ' sh-xmas-tab' : ''));
    }
    for (const [grp, label] of [['hub', '✨<span> Toàn hệ thống</span>'], ['game', '🎮<span> Trong game</span>']]) {
      tabs.appendChild(el('div', 'sh-grp', label));
      for (const s of SLOTS.filter(x => (x.grp || 'hub') === grp)) {
        const n = ITEMS.filter(x => x.slot === s.id).reduce((sum, x) => sum + (x.consumable ? ((W && W.bag && W.bag.cards && W.bag.cards[x.id]) || 0) : (owned.has(x.id) ? 1 : 0)), 0);
        tabs.appendChild(navBtn(s.id, s.icon, s.name, n ? String(n) : '', s.hint + (s.games ? ` (${s.games})` : '')));
      }
    }
    tabs.scrollTop = sideScroll; tabs.scrollLeft = sideScrollX;

    const gridScroll = grid.scrollTop;   // vẽ lại (thử đồ, mua, trang bị) giữ nguyên vị trí cuộn
    grid.innerHTML = '';
    const C = colOf(tab), S = SLOTS.find(s => s.id === tab);
    const shown = C ? ITEMS.filter(x => x.col === C.id) : ITEMS.filter(x => x.slot === tab);
    if (C) {
      const note = el('div', `sh-note small sh-col-note${C.season ? ' sh-xmas-note' : ''}`,
        `<span>${C.icon} <b>Bộ sưu tập ${esc(C.name)}</b> — ${esc(C.desc)} Trang bị <b>Khung ảnh + Hiệu ứng tên</b> cùng bộ để bật hiệu ứng combo!</span>`);
      const tryAll = el('button', 'ghost sh-try-all', '👗 Thử cả bộ');
      tryAll.onclick = () => {
        tryOn = {};
        for (const it of shown) if (it.slot !== 'emote' && !it.consumable) tryOn[it.slot] = it.id;
        sfx.pop();
        paint();
        const r = hero.getBoundingClientRect();
        if (COMBO[C.id]) burst(r.left + 58, r.top + r.height / 2, COMBO[C.id].colors, 28, 6);
      };
      note.appendChild(tryAll);
      grid.appendChild(note);
    } else if (S && S.games) {
      grid.appendChild(el('div', 'sh-note small', `🎮 Áp dụng trong <b>${esc(S.games)}</b> — ${esc(S.hint)}`));
    }
    for (const it of shown) {
      const R = RARITY[it.rar];
      if (it.consumable) {
        const price = itemPrice(it, W), sale = !!(it.firstSale && price < it.price);
        const cnt = (W && W.bag && W.bag.cards && W.bag.cards[it.id]) || 0;
        const short = on ? price - W.credits : 0;
        const c = el('div', `sh-item sh-util-card rar-${it.rar}${cnt ? ' owned' : ''}`);
        c.style.setProperty('--rc', R.color);
        c.innerHTML = `<div class="sh-prev">${preview(it, name, initial)}</div>` +
          `<div class="sh-uinfo">` +
            `<div class="sh-utop"><span class="sh-name">${esc(it.name)}</span><span class="sh-urar">${R.name}</span>` +
              `${sale ? `<span class="sh-sale">-${it.firstSale}% THẺ ĐẦU</span>` : ''}` +
              `${on ? `<span class="sh-card-cnt">Đang có: <b>${cnt}</b></span>` : ''}</div>` +
            `<div class="sh-udesc small muted">${esc(it.desc || '')}</div>` +
            `<div class="sh-uprice small">${sale ? `Ưu đãi thẻ đầu: <s>${fmt(it.price)}</s> <b>${fmt(price)} 💰</b>` : `Giá: <b>${fmt(price)} 💰</b>`}</div>` +
          `</div>`;
        const acts = el('div', 'sh-uacts');
        const buyBtn = el('button', 'gold sh-buy', sale ? `🛍️ Mua · <s>${fmt(it.price)}</s> ${fmt(price)} 💰` : `🛍️ Mua · ${fmt(price)} 💰`);
        buyBtn.disabled = !on || short > 0;
        buyBtn.title = !on ? 'Vui lòng đăng nhập để mua vật phẩm' : short > 0 ? `Còn thiếu ${fmt(short)} credit` : sale ? `Ưu đãi thẻ đầu giảm ${it.firstSale}%` : 'Mua thẻ này';
        buyBtn.onclick = e => { e.stopPropagation(); buy(it, c); };
        acts.appendChild(buyBtn);
        if (cnt > 0 && it.id === 'u-rename') {
          const useBtn = el('button', '', '🪪 Đổi tên ngay');
          useBtn.onclick = e => { e.stopPropagation(); sfx.pop(); openRenameModal({ fromShop: true }); };
          acts.appendChild(useBtn);
        }
        c.appendChild(acts);
        grid.appendChild(c);
        continue;
      }
      const has = owned.has(it.id), wearing = eq[it.slot] === it.id;
      const slotInfo = C ? SLOTS.find(s => s.id === it.slot) : null;
      const c = el('div', `sh-item rar-${it.rar}${has ? ' owned' : ''}${wearing ? ' on' : ''}${tryOn[it.slot] === it.id ? ' try' : ''}${it.col === 'xmas' ? ' is-xmas' : ''}`);
      c.style.setProperty('--rc', R.color);
      c.innerHTML = `${it.col === 'xmas' && !C ? '<span class="sh-season">🎄 Noel</span>' : ''}` +
        `${slotInfo ? `<div class="sh-slot">${slotInfo.icon} ${esc(slotInfo.name)}</div>` : ''}` +
        `<div class="sh-prev">${preview(it, name, initial)}</div><div class="sh-name">${esc(it.name)}</div><div class="sh-rar">${R.name}</div>`;
      let btn;
      if (it.slot === 'emote') btn = has ? el('button', 'ghost', '✔ Đã sở hữu') : null;
      else if (wearing) { btn = el('button', 'ghost sh-on', '✔ Đang sử dụng'); btn.title = 'Nhấn để gỡ trang bị'; btn.onclick = e => { e.stopPropagation(); equip(it.slot, null); }; }
      else if (has) { btn = el('button', '', 'Trang bị'); btn.onclick = e => { e.stopPropagation(); equip(it.slot, it.id); }; }
      if (!btn) {
        const short = on ? it.price - W.credits : 0;
        btn = el('button', 'gold sh-buy', `💰 ${fmt(it.price)}`);
        btn.disabled = !on || short > 0;
        btn.title = !on ? 'Vui lòng đăng nhập để mua vật phẩm' : short > 0 ? `Còn thiếu ${fmt(short)} credit` : 'Mua vật phẩm này';
        btn.onclick = e => { e.stopPropagation(); buy(it, c); };
      } else if (it.slot === 'emote') btn.disabled = true;
      c.appendChild(btn);
      c.onclick = () => {
        if (it.slot === 'fx') { const r = c.querySelector('.sh-fx').getBoundingClientRect(); playFx(it.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, false); }
        if (it.slot === 'emote') { const r = c.getBoundingClientRect(); it.emojis.forEach((e, i) => setTimeout(() => floatAt({ x: r.left + r.width * (0.2 + 0.2 * i), y: r.top + 20 }, e, 'emote'), i * 120)); return; }
        const prevCb = comboSet({ ...eq, ...tryOn });
        if (tryOn[it.slot] === it.id) delete tryOn[it.slot]; else tryOn[it.slot] = it.id;
        const nextCb = comboSet({ ...eq, ...tryOn });
        sfx.click();
        paint();
        if (nextCb && nextCb !== prevCb) {
          const r = hero.getBoundingClientRect();
          burst(r.left + 58, r.top + r.height / 2, COMBO[nextCb].colors, 26, 6);
          tone(660, 0.14, { type: 'sine', v: 0.06 }); tone(990, 0.22, { type: 'sine', v: 0.06, delay: 0.06 });
        }
      };
      grid.appendChild(c);
    }
    grid.scrollTop = gridScroll;
  };

  async function buy(it, c) {
    const price = itemPrice(it, W), sale = it.firstSale && price < it.price;
    const msg = sale
      ? `Xác nhận mua "${it.name}" với giá ưu đãi thẻ đầu ${fmt(price)} credit (giảm ${it.firstSale}% từ ${fmt(it.price)})?`
      : `Xác nhận mua "${it.name}" (${RARITY[it.rar].name}) với giá ${fmt(price)} credit?`;
    if (!confirm(msg)) return;
    const r = await O.request('buy', { item: it.id });
    if (!r.ok) return;
    delete tryOn[it.slot];
    const box = c.getBoundingClientRect(), pt = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    setWallet(r.wallet);
    burst(pt.x, pt.y, [RARITY[it.rar].color, '#ffd23f', '#fff'], 70, 8);
    pop(pt, ['✨', '💰'], 6);
    sfx.win();
    if (it.consumable) {
      const cnt = (r.wallet.bag && r.wallet.bag.cards && r.wallet.bag.cards[it.id]) || 0;
      toast(`🎉 Đã mua <b>${esc(it.name)}</b> — hiện có <b>${cnt}</b> thẻ.`, 3200);
    } else {
      toast(`🎉 Đã sở hữu <b>${esc(it.name)}</b>${it.slot === 'emote' ? ' — biểu cảm mới đã được thêm vào bảng cảm xúc.' : ' — vật phẩm đã được trang bị.'}`, 3000);
    }
  }
  async function equip(slot, id) {
    const r = await O.request('equip', { slot, item: id });
    if (!r.ok) return;
    delete tryOn[slot];
    sfx.pop();
    setWallet(r.wallet);
  }

  paintShop = paint;
  paint();
}
