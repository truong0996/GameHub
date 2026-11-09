// Ví credit + cửa hàng đồ trang trí phía client: vẽ tên/khung ảnh/danh hiệu/khung chat theo đồ đang mặc (look),
// hiệu ứng thắng, thông báo credit sau ván, bảng cửa hàng. Danh sách món + công thức ở shop-data.js (dùng chung với server).
import { $, el, esc, pick, toast, openModal, closeModal, floatAt, spawn, burst, confetti, PALETTE } from './ui.js';
import { sfx, tone } from './sfx.js';
import { CREDIT, SLOTS, RARITY, ITEMS, ITEM } from './shop-data.js';

let W = null;      // ví của mình { credits, earned, today, cap, owned, eq } — null = chưa đăng nhập
let O = null;      // { request(t, data) → Promise, name() → tên mình, loggedIn() → bool, onChange() }
let paintShop = null;
let tab = 'frame', tryOn = {};   // tab đang mở, đồ đang "thử" trong bảng cửa hàng (chưa mua)

export function initShop(o) { O = o; }
export const myWallet = () => W;
export function setWallet(w) {
  W = w || null;
  if (O) O.onChange();
  if (paintShop && $('#modal .shop')) paintShop(); else paintShop = null;
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
  const it = look && ITEM[look.title];
  return it ? ` <span class="lk-ttl rar-${it.rar}">${esc(it.text)}</span>` : '';
}
export const frameCls = look => { const c = cls(look, 'frame'); return c ? ' lk-fr ' + c : ''; };
export const bubbleCls = look => { const c = cls(look, 'bubble'); return c ? ' lk-bub ' + c : ''; };

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
function rain(chars, n, size = 30) {
  for (let i = 0; i < n; i++) spawn({ text: pick(chars), x: Math.random() * innerWidth, y: -40 - Math.random() * innerHeight * 0.7,
    vx: (Math.random() - 0.5) * 1.5, vy: 2.5 + Math.random() * 2.5, g: 0.035, drag: 0.995, life: 2.2, decay: 0.0055,
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
    for (let j = 0; j < (small ? 3 : 6); j++) spawn({ x: hx, y: hy, vx: -4 - Math.random() * 6, vy: (Math.random() - 0.5) * 3, g: -0.03, life: 1,
      decay: 0.03 + Math.random() * 0.02, size: 3 + Math.random() * 5, color: pick(FIRE) });
    if (Math.random() < 0.35) spawn({ text: '🔥', x: r.right - r.width * 0.2, y: hy + 10, vx: 1 + Math.random(), vy: 1, g: 0.08, life: 1, decay: 0.025, size: 22 });
  }, 30);
  setTimeout(() => { clearInterval(iv); d.remove(); }, small ? 1700 : 2600);
}

export const FX = {
  'fx-confetti': { icon: '🎊', play(pt, small) {
    burst(pt.x, pt.y, PALETTE, small ? 45 : 80, small ? 6 : 9);
    pop(pt, ['🎊', '🎉'], small ? 5 : 10);
    if (!small) confetti(240);
    sfx.pop();
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
    const n = small ? 2 : 8;
    for (let i = 0; i < n; i++) setTimeout(() => {
      if (small) shootingStar(pt.x - 140 - Math.random() * 40, pt.y - 120 - Math.random() * 40, 5, 4, 30);
      else shootingStar(innerWidth * (-0.05 + Math.random() * 0.6), innerHeight * (-0.05 + Math.random() * 0.25), 9 + Math.random() * 4, 5 + Math.random() * 3);
      tone(1200 + Math.random() * 800, 0.4, { type: 'sine', v: 0.06, to: 600 });
    }, i * 230);
    if (!small) rain(['✨', '⭐', '🌟'], 30, 24);
  } },
  'fx-dragon': { icon: '🐉', play(pt, small) {
    if (small) { pop(pt, ['🐉', '🔥', '🔥'], 7, 7); burst(pt.x, pt.y, FIRE, 60, 7); sfx.whoosh(); return; }
    dragon(innerHeight * 0.32, false);
    setTimeout(() => { burst(innerWidth / 2, innerHeight * 0.4, FIRE, 120, 11); rain(['🔥', '🧧', '✨'], 30, 28); }, 1300);
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
    fxBusy = setTimeout(() => document.body.classList.remove('lk-fxing'), 4000);
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
      toast(`💰 <b>+${m.gain}</b> credit${m.win ? ` <span class="lk-ttl rar-l">Thắng ×${CREDIT.winMul}</span>` : ''} · số dư <b>${fmt(m.wallet.credits)}</b>` +
        (m.wallet.today >= m.wallet.cap ? ` · <span class="small">đã đủ ${CREDIT.dayCap} hôm nay</span>` : ''), 4000);
    } else if (m.wallet.today >= m.wallet.cap) toast(`💰 Hôm nay bạn đã nhận đủ ${CREDIT.dayCap} credit — mai chơi tiếp nhé!`, 3500);
  }, m.delay || 0);
}

// ---------- bảng cửa hàng ----------
const SAMPLE = 'Chào cả phòng! 👋';
function preview(it, name, initial) {
  const look = { [it.slot]: it.id };
  switch (it.slot) {
    case 'frame': return `<div class="sh-ava${frameCls(look)}">${esc(initial)}</div>`;
    case 'name': return `<div class="sh-nm">${nameHtml(name, look)}</div>`;
    case 'title': return `<div class="sh-nm">${titleHtml(look)}</div>`;
    case 'bubble': return `<div class="cm sh-bub${bubbleCls(look)}">${esc(SAMPLE)}</div>`;
    case 'fx': return `<div class="sh-fx" title="Bấm để xem thử">${FX[it.id] ? FX[it.id].icon : '✨'}<span>▶ xem thử</span></div>`;
    case 'back': return `<div class="sh-backs">${backHtml(it)}${backHtml(it)}</div>`;
    case 'dice': return `<div class="sh-dice">${dieHtml(it.id)}${dieHtml(it.id, [0, 4, 8])}</div>`;
    case 'hat': return hatHtml(it.id);
    case 'easel': return easelHtml(it.id);
    case 'emote': return `<div class="sh-em">${it.emojis.map(e => `<span>${e}</span>`).join('')}</div>`;
  }
  return '';
}

export function openShop(startTab) {
  if (startTab) tab = startTab;
  tryOn = {};
  const card = openModal(`<div class="sh-head"><h2>🛍️ Cửa hàng</h2><span class="grow"></span><span class="sh-bal"></span>
    <button class="ghost" data-x title="Đóng (Esc)">✕</button></div>
    <div class="sh-sub small muted"></div>
    <details class="sh-how small"><summary>💡 Kiếm credit thế nào?</summary><ul>
      <li>Chơi hết một ván <b>được tính vào 🏆</b> (≥2 người đã đăng nhập): <b>${CREDIT.base} credit × trọng số thời lượng</b> (×1 tới ×3, ván dài được nhiều hơn — như bảng xếp hạng).</li>
      <li><b>Nhất bàn ×${CREDIT.winMul}</b>. Thua vẫn có credit!</li>
      <li>Tối đa <b>${CREDIT.dayCap} credit mỗi ngày</b>. Ván bỏ dở: không ai được, cũng không ai bị trừ.</li>
      <li>Đồ chỉ để khoe — <b>không ảnh hưởng thắng thua</b>. Màu ghế trong game giữ nguyên.</li>
    </ul></details>
    <div class="sh-hero"></div>
    <div class="gp-tags sh-tabs"></div>
    <div class="sh-grid"></div>`);
  card.classList.add('shop');
  card.querySelector('[data-x]').onclick = closeModal;
  const hero = card.querySelector('.sh-hero'), tabs = card.querySelector('.sh-tabs'), grid = card.querySelector('.sh-grid');

  const paint = () => {
    setTimeout(hatLoop);
    const name = O.name() || 'Bạn', initial = ([...name][0] || '?').toUpperCase(), on = !!W;
    const owned = new Set(W ? W.owned : []), eq = W ? W.eq : {};
    card.querySelector('.sh-bal').innerHTML = on ? `💰 <b>${fmt(W.credits)}</b>` : '<span class="small">Khách</span>';
    card.querySelector('.sh-sub').innerHTML = on
      ? `Hôm nay đã nhận <b>${fmt(W.today)}</b>/${fmt(W.cap)} · tổng đã kiếm <b>${fmt(W.earned)}</b> · đã có ${owned.size}/${ITEMS.length} món`
      : `👀 Bạn đang xem như khách — <b>đăng nhập ở trang chủ</b> để nhận credit sau mỗi ván và mua đồ.`;

    // hero: trông mình thế nào với đồ đang mặc + đồ đang thử
    const look = { ...eq, ...tryOn };
    const trying = Object.keys(tryOn).length;
    hero.innerHTML = `<div class="sh-ava big${frameCls(look)}">${esc(initial)}</div>
      <div class="sh-me"><div>${nameHtml(name, look)}${titleHtml(look)}</div>
      <div class="cm sh-bub${bubbleCls(look)}">${esc(SAMPLE)}</div>
      <div class="small muted">${trying ? '👗 Đang thử đồ — chưa mua' : on ? 'Bạn trong mắt cả phòng' : 'Bấm vào món để thử'}${look.fx ? ` · ${FX[look.fx].icon} ${esc(ITEM[look.fx].name)}` : ''}</div></div>
      ${look.back || look.dice || look.hat || look.easel ? `<div class="sh-ingame" title="Đồ trong game">${look.back ? backHtml(ITEM[look.back]) : ''}${look.dice ? dieHtml(look.dice) : ''}${look.hat ? hatHtml(look.hat, 64) : ''}${look.easel ? easelHtml(look.easel) : ''}</div>` : ''}`;

    // 2 hàng: đồ của hub (mọi game) và đồ trong từng game, mỗi hàng một nhãn
    tabs.innerHTML = '';
    for (const [grp, label] of [['hub', '✨ Mọi game'], ['game', '🎮 Trong game']]) {
      const row = el('div', 'sh-tabrow', `<span class="sh-grp small muted">${label}</span><div class="sh-tablist"></div>`), list = row.lastChild;
      for (const s of SLOTS.filter(x => (x.grp || 'hub') === grp)) {
        const n = ITEMS.filter(x => x.slot === s.id && owned.has(x.id)).length;
        const b = el('button', 'gp-tag' + (s.id === tab ? ' on' : ''), `${s.icon} ${esc(s.name)}${n ? ` <span>${n}</span>` : ''}`);
        b.title = s.hint + (s.games ? ` (${s.games})` : '');
        b.onclick = () => { tab = s.id; paint(); };
        list.appendChild(b);
      }
      tabs.appendChild(row);
    }

    grid.innerHTML = '';
    const S = SLOTS.find(s => s.id === tab);
    if (S && S.games) grid.appendChild(el('div', 'sh-note small', `🎮 Dùng trong <b>${esc(S.games)}</b> — ${esc(S.hint)}`));
    for (const it of ITEMS.filter(x => x.slot === tab)) {
      const has = owned.has(it.id), wearing = eq[it.slot] === it.id, R = RARITY[it.rar];
      const c = el('div', `sh-item rar-${it.rar}${has ? ' owned' : ''}${wearing ? ' on' : ''}${tryOn[it.slot] === it.id ? ' try' : ''}`);
      c.style.setProperty('--rc', R.color);
      c.innerHTML = `<div class="sh-prev">${preview(it, name, initial)}</div><div class="sh-name">${esc(it.name)}</div><div class="sh-rar">${R.name}</div>`;
      let btn;
      if (it.slot === 'emote') btn = has ? el('button', 'ghost', '✔ Đã có') : null;
      else if (wearing) { btn = el('button', 'ghost sh-on', '✔ Đang dùng'); btn.title = 'Bấm để tháo'; btn.onclick = e => { e.stopPropagation(); equip(it.slot, null); }; }
      else if (has) { btn = el('button', '', 'Trang bị'); btn.onclick = e => { e.stopPropagation(); equip(it.slot, it.id); }; }
      if (!btn) {
        const short = on ? it.price - W.credits : 0;
        btn = el('button', 'gold sh-buy', `💰 ${fmt(it.price)}`);
        btn.disabled = !on || short > 0;
        btn.title = !on ? 'Đăng nhập để mua' : short > 0 ? `Còn thiếu ${fmt(short)} credit` : 'Mua';
        btn.onclick = e => { e.stopPropagation(); buy(it, c); };
      } else if (it.slot === 'emote') btn.disabled = true;
      c.appendChild(btn);
      c.onclick = () => {
        if (it.slot === 'fx') { const r = c.querySelector('.sh-fx').getBoundingClientRect(); playFx(it.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, false); }
        if (it.slot === 'emote') { const r = c.getBoundingClientRect(); it.emojis.forEach((e, i) => setTimeout(() => floatAt({ x: r.left + r.width * (0.2 + 0.2 * i), y: r.top + 20 }, e, 'emote'), i * 120)); return; }
        if (tryOn[it.slot] === it.id) delete tryOn[it.slot]; else tryOn[it.slot] = it.id;
        sfx.click();
        paint();
      };
      grid.appendChild(c);
    }
  };

  async function buy(it, c) {
    if (!confirm(`Mua "${it.name}" (${RARITY[it.rar].name}) giá ${fmt(it.price)} credit?`)) return;
    const r = await O.request('buy', { item: it.id });
    if (!r.ok) return;
    delete tryOn[it.slot];
    const box = c.getBoundingClientRect(), pt = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    setWallet(r.wallet);
    burst(pt.x, pt.y, [RARITY[it.rar].color, '#ffd23f', '#fff'], 70, 8);
    pop(pt, ['✨', '💰'], 6);
    sfx.win();
    toast(`🎉 Đã mua <b>${esc(it.name)}</b>${it.slot === 'emote' ? ' — biểu cảm mới có trong thanh emoji của game' : ' — đã trang bị'}`, 3000);
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
