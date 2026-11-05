// 🎴 UNO — dữ liệu dùng chung server + client: màu, lá, sự kiện, luật "đánh được không", điểm, thời lượng animation.
// Không có logic ẩn ở đây (luật + bot nằm trong server.js để không lộ chồng bài).
// Lá: { id, c: 'r'|'y'|'g'|'b' (màu) | 'w' (lá đổi màu), v: 0..9 | tên lá trong CARDS }.

export const COLORS = {
  r: { name: 'Đỏ', hex: '#d33b3b' },
  y: { name: 'Vàng', hex: '#e9a812' },
  g: { name: 'Xanh lá', hex: '#2f9a52' },
  b: { name: 'Xanh dương', hex: '#2c6fcf' },
};
export const COLOR_KEYS = Object.keys(COLORS);

// Lá chức năng. n = số lá MỖI MÀU (lá màu) hoặc tổng số lá (lá đổi màu, wild: true); chaos = chỉ có ở chế độ Bất Ngờ; pts = điểm khi còn trên tay.
export const CARDS = {
  skip:   { icon: '⊘', name: 'Mất Lượt', n: 2, pts: 20, desc: 'Người kế tiếp mất lượt.' },
  rev:    { icon: '⇄', name: 'Đảo Chiều', n: 2, pts: 20, desc: 'Đổi chiều chơi (2 người thì như Mất Lượt).' },
  d2:     { icon: '+2', name: 'Rút Hai', n: 2, pts: 20, desc: 'Người kế tiếp rút 2 lá và mất lượt.' },
  wild:   { icon: '★', name: 'Đổi Màu', n: 4, wild: true, pts: 50, desc: 'Đánh lên bất kỳ lá nào, chọn màu tiếp theo.' },
  d4:     { icon: '+4', name: 'Rút Bốn', n: 4, wild: true, pts: 50, desc: 'Chọn màu tiếp theo; người kế tiếp rút 4 lá và mất lượt.' },
  // ---- Bất Ngờ ----
  mirror: { icon: '🪞', name: 'Gương', n: 1, chaos: true, pts: 20, desc: 'Đang bị +2/+4 dồn tới thì đánh ra BẤT KỂ MÀU để dội cả phạt về người vừa đánh. Đánh thường thì như Đảo Chiều.' },
  bomb:   { icon: '💣', name: 'Bom Màu', n: 1, chaos: true, pts: 30, desc: 'Đánh ra rồi xả luôn MỌI lá cùng màu còn trên tay (lá đổi màu không tính).' },
  gift:   { icon: '🎁', name: 'Quà', n: 1, chaos: true, pts: 20, desc: 'Tặng 1 lá trên tay bạn cho người bạn chọn.' },
  again:  { icon: '⏩', name: 'Tăng Tốc', n: 1, chaos: true, pts: 20, desc: 'Mọi người khác mất lượt — bạn đi tiếp ngay.' },
  swap:   { icon: '🔀', name: 'Đổi Tay', n: 2, wild: true, chaos: true, pts: 50, desc: 'Chọn màu tiếp theo và ĐỔI CẢ TAY BÀI với người bạn chọn.' },
  storm:  { icon: '🌪️', name: 'Lốc Xoáy', n: 2, wild: true, chaos: true, pts: 50, desc: 'Chọn màu tiếp theo; mọi người chuyền cả tay bài cho người kế tiếp theo chiều chơi.' },
};

// Sự kiện (chế độ Bất Ngờ): cứ khoảng mỗi vòng bàn bốc 1. lap = kéo dài 1 vòng bàn, còn lại xảy ra ngay.
export const EVENTS = {
  rain:   { icon: '🌧️', name: 'Mưa Bài', desc: 'Mọi người rút 1 lá.' },
  pass:   { icon: '🔄', name: 'Chuyền Tay', desc: 'Mọi người chuyền cả tay bài cho người kế tiếp theo chiều chơi.' },
  flip:   { icon: '🌀', name: 'Đảo Chiều', desc: 'Chiều chơi đảo ngược.' },
  paint:  { icon: '🎨', name: 'Đổi Màu', desc: 'Màu hiện tại đổi sang một màu ngẫu nhiên.' },
  lixi:   { icon: '🧧', name: 'Lì Xì', desc: 'Ai nhiều bài nhất được bỏ 2 lá ngẫu nhiên.' },
  crown:  { icon: '👑', name: 'Gánh Nặng', desc: 'Ai ít bài nhất phải rút 2 lá.' },
  ban:    { icon: '🚫', name: 'Màu Cấm', lap: true, desc: 'Trong 1 vòng bàn, không ai được đánh hay chọn màu này.' },
  open:   { icon: '👐', name: 'Bài Ngửa', lap: true, desc: 'Trong 1 vòng bàn, ai cũng thấy bài trên tay nhau.' },
  hot:    { icon: '🔥', name: 'Nóng Bỏng', lap: true, desc: 'Trong 1 vòng bàn, +2 thành +4 và +4 thành +8.' },
  ladder: { icon: '🪜', name: 'Bậc Thang', lap: true, desc: 'Trong 1 vòng bàn, lá số được đánh lên lá số hơn/kém 1 đơn vị, bất kể màu.' },
};
export const EVENT_KEYS = Object.keys(EVENTS);

export const isWild = c => c.c === 'w';
export const cardPts = c => (typeof c.v === 'number' ? c.v : CARDS[c.v].pts);
export const handPts = hand => hand.reduce((s, c) => s + cardPts(c), 0);
// Số lá phạt của +2/+4 (Nóng Bỏng nhân đôi).
export const penalty = (v, ev) => (v === 'd2' ? 2 : 4) * (ev && ev.k === 'hot' ? 2 : 1);
// Màu không được đánh/chọn lúc này (Màu Cấm).
export const bannedColor = s => (s.ev && s.ev.k === 'ban' ? s.ev.color : null);

// Lá c có đánh được lên bàn s không (theo lượt bình thường). s = { top, color, stack, ev, opts } — dùng cho cả state server lẫn view client.
export function playable(s, c) {
  if (s.stack) {
    if (c.v === 'mirror') return true;
    if (!s.opts.stack) return false;
    return c.v === 'd4' || (c.v === 'd2' && s.stack.k === 'd2');
  }
  if (c.c === bannedColor(s)) return false;
  if (isWild(c)) return true;
  const top = s.top;
  if (c.c === s.color || c.v === top.v) return true;
  return !!(s.ev && s.ev.k === 'ladder' && typeof c.v === 'number' && typeof top.v === 'number' && Math.abs(c.v - top.v) === 1);
}
// Chặn ngang: lá y hệt lá trên cùng (cùng màu + cùng số/ký hiệu, không phải lá đổi màu).
export const identical = (s, c) => !isWild(c) && c.c === s.top.c && c.v === s.top.v && c.c !== bannedColor(s);

// Thời lượng animation phía client (ms) — hub chờ hết rồi mới cho bot/hẹn giờ chạy tiếp.
export const CATCH_MS = 3000;
export const DUR = {
  start: 200, round: 1300, deal: 1300, flip: 600, play: 560, uno: 650, catchOpen: 250, caught: 700, safe: 250,
  skip: 550, rev: 550, stack: 250, reflect: 750, swap: 1100, rotate: 1200, gift: 800, again: 550, pass: 200,
  event: 1900, eventEnd: 250, shuffle: 700, roundEnd: 4300, over: 1500,
};
const drawDur = n => 260 + 110 * Math.min(n - 1, 8);
export const animDuration = evs => evs.reduce((t, e) => t + (e.t === 'draw' ? drawDur(e.n ?? e.cards.length) : e.t === 'dump' ? 300 + 140 * e.cards.length : DUR[e.t] || 0), 0);
