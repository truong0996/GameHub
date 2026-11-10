// Ảnh đại diện: hộp chỉnh ảnh (chọn/dán/kéo thả ảnh, kéo để căn, lăn chuột/kéo thanh/chụm hai ngón để phóng to, xoay)
// rồi cắt vuông OUT×OUT px và nén WebP (trình duyệt không hỗ trợ thì JPEG) ngay trong trình duyệt — server chỉ lưu
// (xem hub/avatars.js). Ảnh hiện tròn ở mọi nơi; ai không có ảnh thì vẫn là chấm màu ghế như cũ.
import { esc, openModal, closeModal, toast } from './ui.js';

const OUT = 192;              // cạnh ảnh lưu (px) — đủ nét cho ô ~64px trên màn hình mật độ 3x
const MAX_B64 = 120000;       // ~88KB sau giải mã, dưới giới hạn server (hub/avatars.js AVATAR_MAX)
const VIEW = 260;             // cạnh khung chỉnh (px CSS)

// <img> tròn nhỏ cạnh tên (phòng chờ, danh sách người xem, chat...). url null → ''.
export const avImg = (url, cls = '') => (url ? `<img class="av-img${cls ? ' ' + cls : ''}" src="${esc(url)}" alt="" loading="lazy" draggable="false">` : '');

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Không đọc được ảnh này'));
    im.src = src;
  });
}

// current: URL ảnh đang dùng (null = chưa có). save(dataUrl | null) → Promise<{ ok }> (null = xoá ảnh).
export function openAvatarEditor({ current, save }) {
  const card = openModal(`<div class="ave"><h2>🖼️ Ảnh đại diện</h2>
    <p class="small muted">Chọn ảnh, kéo để căn giữa, lăn chuột / kéo thanh (điện thoại: chụm hai ngón) để phóng to. Dán ảnh (Ctrl+V) hoặc kéo thả ảnh vào khung cũng được.
    Ảnh hiện cho cả phòng — ở phòng chờ và trong mọi trò chơi.</p>
    <div class="ave-stage"><canvas width="${VIEW * 2}" height="${VIEW * 2}"></canvas><div class="ave-empty">📷<br>Chưa chọn ảnh<br><small>Bấm để chọn</small></div></div>
    <div class="ave-tools">
      <button class="ghost" data-pick>📁 Chọn ảnh...</button>
      <button class="ghost" data-rot title="Xoay 90°">⟳</button>
      <input type="range" min="1" max="4" step="0.01" value="1" data-zoom title="Phóng to">
    </div>
    <input type="file" accept="image/*" class="hidden" data-file>
    <div class="err"></div>
    <div class="btns">${current ? '<button class="ghost danger" data-del>🗑️ Xoá ảnh</button>' : ''}<span class="grow"></span>
      <button class="ghost" data-x>Huỷ</button><button class="gold" data-save disabled>Lưu</button></div></div>`);
  const cv = card.querySelector('canvas'), g = cv.getContext('2d');
  const zoom = card.querySelector('[data-zoom]'), file = card.querySelector('[data-file]'), err = card.querySelector('.err');
  const saveBtn = card.querySelector('[data-save]'), empty = card.querySelector('.ave-empty');
  const S = cv.width;   // toạ độ trong canvas (gấp đôi px CSS cho nét)
  let img = null, rot = 0, base = 1, k = 1, x = 0, y = 0, dirty = false;

  // Kích thước ảnh sau khi xoay, tỉ lệ nhỏ nhất để ảnh phủ kín khung.
  const dims = () => (rot % 2 ? [img.height, img.width] : [img.width, img.height]);
  function clamp() {
    const [w, h] = dims(), s = base * k;
    const mx = Math.max(0, (w * s - S) / 2), my = Math.max(0, (h * s - S) / 2);
    x = Math.min(mx, Math.max(-mx, x));
    y = Math.min(my, Math.max(-my, y));
  }
  function drawTo(c, size) {
    const f = size / S;
    c.save();
    c.fillStyle = '#fff';
    c.fillRect(0, 0, size, size);
    c.translate(size / 2 + x * f, size / 2 + y * f);
    c.rotate(rot * Math.PI / 2);
    const s = base * k * f;
    c.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s);
    c.restore();
  }
  function paint() {
    g.clearRect(0, 0, S, S);
    empty.classList.toggle('hidden', !!img);
    saveBtn.disabled = !img || !dirty;
    if (!img) return;
    drawTo(g, S);
    // phủ mờ phần ngoài vòng tròn (phần sẽ bị khuất khi hiện tròn)
    g.save();
    g.fillStyle = 'rgba(30,26,22,.55)';
    g.beginPath(); g.rect(0, 0, S, S); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2, true); g.fill('evenodd');
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  function setZoom(v, cx = S / 2, cy = S / 2) {
    v = Math.min(4, Math.max(1, v));
    // giữ điểm dưới con trỏ đứng yên khi phóng to
    const r = v / k;
    x = (x - (cx - S / 2)) * r + (cx - S / 2);
    y = (y - (cy - S / 2)) * r + (cy - S / 2);
    k = v;
    zoom.value = String(v);
    clamp();
    dirty = true;
    paint();
  }
  async function useSource(src, isNew = true) {
    err.textContent = '';
    try {
      img = await loadImage(src);
    } catch (e) { err.textContent = e.message; return; }
    rot = 0; k = 1; x = 0; y = 0; zoom.value = '1';
    const [w, h] = dims();
    base = Math.max(S / w, S / h);
    dirty = isNew;
    clamp();
    paint();
  }
  function useFile(f) {
    if (!f) return;
    if (!/^image\//.test(f.type)) { err.textContent = 'Đây không phải file ảnh'; return; }
    if (f.size > 25 * 1024 * 1024) { err.textContent = 'Ảnh quá lớn (tối đa 25MB)'; return; }
    const url = URL.createObjectURL(f);
    useSource(url).finally(() => setTimeout(() => URL.revokeObjectURL(url), 1000));
  }

  // Kéo để căn, hai ngón để phóng to.
  const ptrs = new Map();
  let pinch = null;
  const toCanvas = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * S / r.width, (e.clientY - r.top) * S / r.height]; };
  cv.addEventListener('pointerdown', e => {
    if (!img) { file.click(); return; }
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, toCanvas(e));
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k }; }
  });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const p = toCanvas(e), prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, p);
    if (ptrs.size >= 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      setZoom(pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / (pinch.d || 1), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    } else if (ptrs.size === 1) {
      x += p[0] - prev[0]; y += p[1] - prev[1];
      clamp(); dirty = true; paint();
    }
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { if (!img) return; e.preventDefault(); const [cx, cy] = toCanvas(e); setZoom(k * Math.exp(-e.deltaY * 0.0015), cx, cy); }, { passive: false });
  empty.onclick = () => file.click();
  zoom.oninput = () => img && setZoom(+zoom.value);
  card.querySelector('[data-pick]').onclick = () => file.click();
  card.querySelector('[data-rot]').onclick = () => {
    if (!img) return;
    rot = (rot + 1) % 4;
    [x, y] = [-y, x];
    const [w, h] = dims();
    base = Math.max(S / w, S / h);
    clamp(); dirty = true; paint();
  };
  file.onchange = () => { useFile(file.files[0]); file.value = ''; };
  // Kéo thả / dán ảnh.
  const stage = card.querySelector('.ave-stage');
  stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drop'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
  stage.addEventListener('drop', e => { e.preventDefault(); stage.classList.remove('drop'); useFile(e.dataTransfer.files[0]); });
  const onPaste = e => {
    if (!card.isConnected) return removeEventListener('paste', onPaste);
    const it = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.kind === 'file' && /^image\//.test(i.type));
    if (it) { e.preventDefault(); useFile(it.getAsFile()); }
  };
  addEventListener('paste', onPaste);

  const close = () => { removeEventListener('paste', onPaste); closeModal(); };
  card.querySelector('[data-x]').onclick = close;
  const del = card.querySelector('[data-del]');
  if (del) del.onclick = async () => {
    if (!confirm('Xoá ảnh đại diện? (sẽ hiện lại chấm màu ghế như cũ)')) return;
    del.disabled = true;
    const r = await save(null);
    del.disabled = false;
    if (r.ok) { close(); toast('🗑️ Đã xoá ảnh đại diện'); }
  };
  saveBtn.onclick = async () => {
    const out = document.createElement('canvas');
    out.width = out.height = OUT;
    drawTo(out.getContext('2d'), OUT);
    let data = out.toDataURL('image/webp', 0.86);
    if (!data.startsWith('data:image/webp')) data = out.toDataURL('image/jpeg', 0.88);   // Safari cũ không nén được WebP
    for (let q = 0.75; data.length > MAX_B64 && q > 0.3; q -= 0.15) data = out.toDataURL('image/jpeg', q);
    if (data.length > MAX_B64) { err.textContent = 'Ảnh quá phức tạp, không nén đủ nhỏ — thử ảnh khác'; return; }
    saveBtn.disabled = true;
    const r = await save(data);
    if (r.ok) { close(); toast('🖼️ Đã cập nhật ảnh đại diện'); }
    else { err.textContent = r.err || 'Lỗi lưu ảnh'; saveBtn.disabled = false; }
  };

  // Có ảnh rồi thì mở sẵn ảnh đó để chỉnh lại (căn/phóng to), hoặc chọn ảnh khác.
  if (current) useSource(current, false); else paint();
}
