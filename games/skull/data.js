// 💀 Hoa & Sọ (Skull) — danh sách đĩa, điềm báo, thời lượng animation. Dùng chung server + client (không có logic ẩn ở đây).
export const DISCS = {
  rose:   { icon: '🌹', name: 'Hoa', desc: 'An toàn — người thách đấu lật trúng thì đếm tiếp.' },
  skull:  { icon: '💀', name: 'Sọ', desc: 'Ai lật trúng là thua thử thách và mất đĩa.' },
  // ---- Hỗn Loạn: mỗi người được thêm 1 đĩa đặc biệt (ngẫu nhiên, người khác không biết là đĩa gì) ----
  mask:   { icon: '🎭', name: 'Mặt Nạ', chaos: true, desc: 'Lúc bị lật mới tung đồng xu: 50% thành 💀 Sọ, 50% thành 🌹 Hoa. Chính chủ cũng không biết trước.' },
  eye:    { icon: '👁️', name: 'Mắt Thần', chaos: true, desc: 'Đặt xuống là được lén xem đĩa trên cùng của 1 người. Bị lật thì tính là Hoa.' },
  pit:    { icon: '🕳️', name: 'Hố Sâu', chaos: true, desc: 'Tính là Hoa, nhưng ai lật trúng phải lật THÊM 1 đĩa nữa mới thắng.' },
  shield: { icon: '🛡️', name: 'Khiên', chaos: true, desc: 'Tính là Hoa. Người thách đấu lật trúng được che chắn: lần này có dính Sọ cũng không mất đĩa.' },
};
export const SPECIALS = ['mask', 'eye', 'pit', 'shield'];
export const isSafe = d => d.k !== 'skull' && !(d.k === 'mask' && d.res === 'skull');

// Đầu mỗi vòng (Hỗn Loạn) có thể hiện 1 điềm báo cho cả bàn.
export const OMENS = {
  twister:  { icon: '🌪️', name: 'Lốc Xoáy', desc: 'Khi có người bắt đầu đấu giá, mọi chồng đĩa xoay sang người bên trái. Đĩa của ai vẫn là của người đó.' },
  bloodmoon:{ icon: '🌕', name: 'Trăng Máu', desc: 'Lật trúng Sọ mất 2 đĩa thay vì 1.' },
  night:    { icon: '🌑', name: 'Đêm Đen', desc: 'Người thách đấu phải lật chồng người khác trước, chồng trước mặt mình lật sau cùng.' },
  wind:     { icon: '💨', name: 'Gió Lật', desc: 'Khi có người bắt đầu đấu giá, 1 đĩa ngẫu nhiên trên bàn bị gió lật ngửa cho cả bàn thấy.' },
  blessing: { icon: '🎁', name: 'Phúc Lành', desc: 'Thách đấu thành công còn được trả lại 1 đĩa đã mất.' },
};
export const OMEN_KEYS = Object.keys(OMENS);
export const OMEN_P = 0.6;   // xác suất có điềm báo mỗi vòng

// Thời lượng animation phía client (ms) — hub chờ hết rồi mới cho bot/hẹn giờ chạy tiếp.
export const DUR = {
  round: 1400, place: 380, haunt: 0, peek: 250, bid: 600, pass: 300, twist: 1700, wind: 1500, challenge: 1100,
  flip: 800, pit: 700, hauntHit: 1000, shieldGet: 600, success: 1800, fail: 1900, lose: 800, saved: 900,
  restore: 800, out: 1300, over: 1500,
};
export const animDuration = evs => evs.reduce((t, e) => t + (DUR[e.t] || 0), 0);
