// Tiện ích giao diện dùng chung cho hub và mọi game: DOM, toast, modal, chữ bay, hiệu ứng hạt.
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pick = a => a[Math.floor(Math.random() * a.length)];
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function toast(html, ms = 2200) {
  const t = $('#toast');
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), ms);
}

export function openModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="card">${html}</div>`;
  m.classList.remove('hidden');
  return m.firstElementChild;
}
export function closeModal() {
  const m = $('#modal');
  m.classList.add('hidden');
  m.innerHTML = '';
}
export const modalOpen = () => !$('#modal').classList.contains('hidden');

// options: [{ html, value, color? }]
export function pickModal(title, options, cb) {
  openModal(`<h2 class="center">${title}</h2><div class="pick"></div><div class="btns"><button class="ghost" data-x>Huỷ</button></div>`);
  const box = $('#modal .pick');
  for (const o of options) {
    const b = el('button', o.color ? 'pl' : '', o.html);
    if (o.color) b.style.setProperty('--c', o.color);
    b.onclick = () => { closeModal(); cb(o.value); };
    box.appendChild(b);
  }
  $('#modal [data-x]').onclick = closeModal;
}

// Chữ/emoji bay lên tại toạ độ màn hình {x, y}.
export function floatAt(pt, html, cls = '') {
  const d = el('div', 'floater ' + cls, html);
  d.style.left = pt.x + 'px';
  d.style.top = pt.y + 'px';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2300);
}

// ---------- hiệu ứng hạt trên canvas toàn màn hình ----------
const FX = { cv: null, ctx: null, parts: [], raf: 0, dpr: 1 };
export const PALETTE = ['#ff4d6d', '#ff9f1c', '#ffd23f', '#2ec76b', '#3a9bff', '#b06cff', '#ffffff'];
function fxResize() {
  FX.dpr = Math.min(2, devicePixelRatio || 1);
  FX.cv.width = innerWidth * FX.dpr;
  FX.cv.height = innerHeight * FX.dpr;
}
export function initFx(canvas) {
  FX.cv = canvas;
  FX.ctx = canvas.getContext('2d');
  fxResize();
  addEventListener('resize', fxResize);
}
export function spawn(p) {
  FX.parts.push(p);
  if (!FX.raf) FX.raf = requestAnimationFrame(fxLoop);
}
function fxLoop() {
  const { ctx, dpr } = FX;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  FX.parts = FX.parts.filter(p => p.life > 0);
  for (const p of FX.parts) {
    const dr = p.drag ?? 0.985;
    p.vx *= dr; p.vy = p.vy * dr + (p.g ?? 0.15); p.x += p.vx; p.y += p.vy; p.life -= p.decay; p.rot = (p.rot || 0) + (p.vr || 0);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillStyle = p.color;
    if (p.shape === 'r') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  FX.raf = FX.parts.length ? requestAnimationFrame(fxLoop) : 0;
}
export function burst(x, y, colors = PALETTE, n = 30, spd = 7) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = spd * (0.3 + Math.random());
    spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0.12, life: 1, decay: 0.012 + Math.random() * 0.02, size: 2 + Math.random() * 3.5,
      color: colors[i % colors.length], shape: Math.random() < 0.4 ? 'r' : 'c', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 });
  }
}
export function confetti(n = 240, colors = PALETTE) {
  for (let i = 0; i < n; i++) spawn({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.6, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3,
    g: 0.03, drag: 0.995, life: 1.8, decay: 0.0035, size: 4 + Math.random() * 4, color: pick(colors), shape: 'r', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.25 });
}
export function fireworks(n = 5, onPop) {
  for (let i = 0; i < n; i++) setTimeout(() => {
    burst(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.12 + Math.random() * 0.4), [pick(PALETTE), '#fff', '#ffd23f'], 70, 8);
    if (onPop) onPop();
  }, i * 280);
}
