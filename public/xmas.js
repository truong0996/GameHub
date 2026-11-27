// 🎄 Theme Giáng Sinh: mặc định bật, nút bật/tắt ở góc thẻ trang chủ (nhớ trong localStorage.hub_xmas).
// Mọi trang trí nằm trong xmas.css dưới html[data-theme="xmas"]; file này chỉ dựng một lần lớp nền #xm (dây đèn, đồi tuyết,
// xe tuần lộc, bông tuyết). Tuyết rơi bằng animation transform của CSS — không có vòng lặp JS; đang chơi thì ẩn hẳn.
const KEY = 'hub_xmas', root = document.documentElement;
const rnd = (a, b, d = 1) => (a + Math.random() * (b - a)).toFixed(d);

const deco = document.createElement('div');
deco.id = 'xm';
deco.setAttribute('aria-hidden', 'true');
const flakes = Array.from({ length: innerWidth < 640 ? 16 : 30 }, () =>
  `<i style="--x:${rnd(0, 100)}vw;--s:${rnd(3, 7)}px;--w:${rnd(-50, 50, 0)}px;--d:${rnd(10, 20)}s;--t:-${rnd(0, 20)}s"></i>`).join('');
deco.innerHTML = `<div class="xm-lights"></div><div class="xm-ground"></div><div class="xm-sleigh">🦌🦌🛷</div>${flakes}`;
document.body.prepend(deco);

const home = document.querySelector('.home');   // trang /report không có nút — theo lựa chọn đã lưu
const btn = home && home.appendChild(Object.assign(document.createElement('button'), { id: 'xm-toggle', className: 'ghost', type: 'button' }));
function set(on) {
  if (on) root.dataset.theme = 'xmas'; else delete root.dataset.theme;
  localStorage.setItem(KEY, on ? '1' : '0');
  if (btn) { btn.textContent = on ? '🎄 Noel' : '🎄 Noel: tắt'; btn.title = on ? 'Tắt trang trí Giáng Sinh' : 'Bật trang trí Giáng Sinh'; }
}
if (btn) btn.onclick = () => set(root.dataset.theme !== 'xmas');
set(localStorage.getItem(KEY) !== '0');
