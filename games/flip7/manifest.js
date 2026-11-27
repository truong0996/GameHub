// 🃏 Flip 7 — thông tin hiển thị ở hub + tuỳ chọn phòng chờ.
export default {
  id: 'flip7',
  name: 'Flip 7',
  icon: '🃏',
  tagline: 'Rút thêm hay dừng? Trùng số là cháy!',
  description: 'Lần lượt Rút lá hoặc Dừng để giữ điểm. Rút trùng số đã có là CHÁY, mất trắng điểm vòng. Gom đủ 7 số khác nhau thì Flip 7: +15 và kết thúc vòng ngay. Đóng Băng, Lật Ba Lá, Cơ Hội Thứ Hai để phá nhau. Ai đạt điểm mục tiêu trước thắng.',
  minPlayers: 2,
  maxPlayers: 8,
  tags: ['Bài', 'Mạo hiểm', 'Đông người'],
  order: 4,
  turnMs: 20000,
  seats: [
    { name: 'Đỏ', color: '#ff4d6d', label: '🦊' }, { name: 'Cam', color: '#ff9f1c', label: '🐯' },
    { name: 'Vàng', color: '#ffd23f', label: '🐥' }, { name: 'Lục', color: '#2ec76b', label: '🐸' },
    { name: 'Lam', color: '#3a9bff', label: '🐳' }, { name: 'Tím', color: '#b06cff', label: '🦄' },
    { name: 'Hồng', color: '#ff6fb5', label: '🐷' }, { name: 'Ngọc', color: '#20c4c4', label: '🐙' },
  ],
  options: [
    { key: 'chaos', label: 'Chế độ', default: true,
      choices: [{ value: true, label: '🎁 Bất Ngờ — lá hành động mới, sự kiện mỗi vòng, Sương Mù' }, { value: false, label: '😇 Cổ điển' }] },
    { key: 'target', label: 'Điểm để thắng', default: 200,
      choices: [{ value: 200, label: '200 điểm (chuẩn)' }, { value: 100, label: '100 điểm (nhanh)' }, { value: 300, label: '300 điểm (dài)' }] },
  ],
  estimate(o, players) {
    const m = (2 + players * 0.9) * (o.target / 200) * (o.chaos ? 1.1 : 1);
    return `~${Math.max(2, Math.round(m))} phút`;
  },
};
