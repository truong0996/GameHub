// 🛸 Kẻ Mạo Danh — luật dùng chung server + client (client tự đi trước bằng đúng công thức server dùng để kiểm tra).
import { SPEED, GHOST_SPEED } from './data.js';
import { roomAt } from './maps.js';

// Mức nước của khoang đang rò rỉ: 0..1.
export function waterLevel(st) {
  const s = st.sab;
  if (!s || s.k !== 'flood') return 0;
  return Math.max(0, Math.min(1, (st.now - s.at) / (s.until - s.at)));
}

// Thông số di chuyển của một người: st = trạng thái (server) hoặc bản view (client) — cùng có now, sab, ev; p có alive, fx, frozen, x, y.
export function moveMods(st, p, M) {
  if (!p.alive) return { speed: GHOST_SPEED, slip: 0, drift: null, ghost: true };
  let speed = SPEED, slip = 0, drift = null;
  if (p.fx && p.fx.shoes > st.now) speed *= 1.5;
  if (p.frozen) speed *= 0.6;
  const r = roomAt(M, p.x, p.y);
  if (st.sab && st.sab.k === 'flood' && r && r.i === st.sab.r) speed *= 1 - 0.5 * waterLevel(st);
  if (r && r.ice) slip = 0.85;
  if (st.ev && st.ev.k === 'ice') slip = 0.85;
  if (st.ev && st.ev.k === 'zerog') slip = 0.96;
  if (st.ev && st.ev.k === 'current' && st.ev.dir) drift = st.ev.dir;
  return { speed, slip, drift, ghost: false };
}

export const tunnelOn = st => !!(st.tunnel && st.now >= st.tunnel.at && st.now < st.tunnel.until);
