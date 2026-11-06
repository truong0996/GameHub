// 💎 Splendor — thông tin hiển thị ở hub + tuỳ chọn phòng chờ.
export default {
  id: 'splendor',
  name: 'Splendor',
  icon: '💎',
  tagline: 'Gom ngọc, mua mỏ, đón quý tộc — ai giàu uy tín nhất?',
  description: 'Mỗi lượt lấy ngọc, giữ chỗ một thẻ (kèm 1 vàng) hoặc mua thẻ. Thẻ đã mua giảm giá vĩnh viễn cho các thẻ sau; gom đủ thẻ thì quý tộc ghé thăm. Ai đạt điểm mục tiêu thì chơi nốt vòng, điểm cao nhất thắng. Chế độ Bất Ngờ: thẻ năng lực (Mỏ Lộ Thiên, Lăng Kính, Kẻ Cắp, Móc Túi...), sự kiện mỗi vòng bàn, quý tộc có quyền lợi riêng và mục tiêu bí mật.',
  minPlayers: 2,
  maxPlayers: 6,
  tags: ['Chiến thuật', 'Bài'],
  order: 7,
  turnMs: 40000,
  seats: [
    { name: 'Đỏ', color: '#ff4d6d', label: '🦊' }, { name: 'Cam', color: '#ff9f1c', label: '🐯' },
    { name: 'Vàng', color: '#ffd23f', label: '🐥' }, { name: 'Lục', color: '#2ec76b', label: '🐸' },
    { name: 'Lam', color: '#3a9bff', label: '🐳' }, { name: 'Tím', color: '#b06cff', label: '🦄' },
  ],
  options: [
    { key: 'chaos', label: 'Chế độ', default: true,
      choices: [{ value: true, label: '🎁 Bất Ngờ — thẻ năng lực, sự kiện mỗi vòng, quý tộc đặc quyền, mục tiêu bí mật' }, { value: false, label: '😇 Cổ điển' }] },
    { key: 'target', label: 'Điểm để thắng', default: 15,
      choices: [{ value: 15, label: '15 điểm (chuẩn)' }, { value: 10, label: '10 điểm (nhanh)' }, { value: 21, label: '21 điểm (dài)' }] },
  ],
  estimate(o, players) {
    const m = (6 + players * 4.5) * (o.target / 15);
    return `~${Math.max(8, Math.round(m))} phút`;
  },
};
