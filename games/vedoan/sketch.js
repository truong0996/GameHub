// 🎨 Vẽ Đoán — "bot vẽ": vẽ emoji ra canvas ẩn, dò viền (mép trong suốt + chỗ đổi màu mạnh), nối thành các nét
// rồi phác dần lên tranh như đang vẽ tay, cuối cùng tô màu mờ dần. Chỉ chạy ở client (mỗi máy tự dò theo font emoji của nó).
import { W, H } from './data.js';

const CACHE = new Map();
const FONT = s => `${s}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif`;
const S = 200;          // độ phân giải dò viền
const BOX = 470;        // cạnh lớn nhất của hình trên tranh 800×600

function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function sketchOf(emoji) {
  if (CACHE.has(emoji)) return CACHE.get(emoji);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = FONT(Math.round(S * 0.78));
  g.fillText(emoji, S / 2, S / 2 + S * 0.03);
  const px = g.getImageData(0, 0, S, S).data;
  const a = i => px[i * 4 + 3];
  const lum = i => { const al = px[i * 4 + 3] / 255; return (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) * al + 255 * (1 - al); };
  // Khung bao của phần có màu → co giãn vào giữa tranh.
  let x0 = S, y0 = S, x1 = 0, y1 = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (a(y * S + x) > 60) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 <= x0) { x0 = y0 = 0; x1 = y1 = S - 1; }
  const k = BOX / Math.max(x1 - x0 + 1, y1 - y0 + 1), ox = W / 2 - ((x0 + x1) / 2) * k, oy = H / 2 - ((y0 + y1) / 2) * k;
  // Điểm viền: 2 = mép ngoài (cạnh nền trong suốt), 1 = chỗ đổi màu mạnh bên trong.
  const edge = new Uint8Array(S * S);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const i = y * S + x;
    if (a(i) < 110) continue;
    const nb = [i - 1, i + 1, i - S, i + S];
    if (nb.some(j => a(j) < 110)) edge[i] = 2;
    else if (nb.some(j => Math.abs(lum(i) - lum(j)) > 62)) edge[i] = 1;
  }
  // Dò đường: đi theo điểm viền kề nhau (ưu tiên giữ hướng), "ăn" luôn các điểm kề bên để nét không bị đúp.
  const seen = new Uint8Array(S * S), lines = [];
  const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  for (const kind of [2, 1]) {
    for (let i = 0; i < S * S; i++) {
      if (edge[i] !== kind || seen[i]) continue;
      const pts = [];
      let x = i % S, y = (i / S) | 0, dir = 0;
      seen[i] = 1;
      for (;;) {
        pts.push(x, y);
        let nx = -1, ny = -1, nd = -1;
        for (let t = 0; t < 8; t++) {
          const d = (dir + [0, 1, 7, 2, 6, 3, 5, 4][t]) % 8, xx = x + D8[d][0], yy = y + D8[d][1], j = yy * S + xx;
          if (xx < 0 || yy < 0 || xx >= S || yy >= S || seen[j] || !edge[j]) continue;
          if (nd < 0) { nx = xx; ny = yy; nd = d; } else seen[j] = 1;
        }
        if (nd < 0) break;
        seen[ny * S + nx] = 1;
        x = nx; y = ny; dir = nd;
      }
      if (pts.length < (kind === 2 ? 10 : 14)) continue;
      // Bỏ bớt điểm (mỗi 3 điểm lấy 1) + đổi sang toạ độ tranh.
      const out = [];
      for (let j = 0; j < pts.length; j += 6) out.push(ox + pts[j] * k, oy + pts[j + 1] * k);
      out.push(ox + pts[pts.length - 2] * k, oy + pts[pts.length - 1] * k);
      lines.push({ d: out, kind });
    }
  }
  // Rung tay nhẹ cho giống vẽ thật (cố định theo emoji để máy nào cũng giống nhau giữa các lần vẽ lại).
  const rnd = seeded([...emoji].reduce((s, ch) => s * 31 + ch.codePointAt(0), 7));
  let len = 0;
  for (const l of lines) {
    for (let j = 0; j < l.d.length; j++) l.d[j] += (rnd() - 0.5) * 3;
    l.len = 0;
    for (let j = 2; j < l.d.length; j += 2) l.len += Math.hypot(l.d[j] - l.d[j - 2], l.d[j + 1] - l.d[j - 1]);
    len += l.len;
  }
  // Ảnh màu nét cao để tô.
  const big = document.createElement('canvas'), bs = Math.round(S * k);
  big.width = big.height = bs;
  const bg = big.getContext('2d');
  bg.textAlign = 'center';
  bg.textBaseline = 'middle';
  bg.font = FONT(Math.round(bs * 0.78));
  bg.fillText(emoji, bs / 2, bs / 2 + bs * 0.03);
  const sk = { lines, len, img: big, ox, oy };
  CACHE.set(emoji, sk);
  return sk;
}

// prog = phần nét đã phác (0..1), color = độ đậm phần tô màu (0..1).
export function drawSketch(g, sk, prog, color) {
  if (color > 0) {
    g.save();
    g.globalAlpha = Math.min(1, color) * 0.88;
    g.drawImage(sk.img, sk.ox, sk.oy);
    g.restore();
  }
  let budget = sk.len * Math.min(1, prog);
  g.save();
  g.strokeStyle = '#2b2622';
  g.lineCap = g.lineJoin = 'round';
  for (const l of sk.lines) {
    if (budget <= 0) break;
    g.lineWidth = l.kind === 2 ? 4.5 : 3;
    g.beginPath();
    g.moveTo(l.d[0], l.d[1]);
    for (let j = 2; j < l.d.length; j += 2) {
      const seg = Math.hypot(l.d[j] - l.d[j - 2], l.d[j + 1] - l.d[j - 1]);
      if (seg > budget) {
        const f = budget / seg;
        g.lineTo(l.d[j - 2] + (l.d[j] - l.d[j - 2]) * f, l.d[j - 1] + (l.d[j + 1] - l.d[j - 1]) * f);
        budget = 0;
        break;
      }
      budget -= seg;
      g.lineTo(l.d[j], l.d[j + 1]);
    }
    g.stroke();
  }
  g.restore();
  return budget <= 0;
}
