// 💀 Hoa & Sọ (Skull) — thông tin hiển thị ở hub + tuỳ chọn phòng chờ.
export default {
  id: 'skull',
  name: 'Hoa & Sọ',
  icon: '💀',
  tagline: 'Hoa hồng hay đầu lâu? Bịp tới cùng',
  description: 'Skull — trò bịp kinh điển. Mỗi người có 3 đĩa 🌹 Hoa và 1 đĩa 💀 Sọ, lần lượt đặt úp thành chồng. Ai dám cược lật được bao nhiêu đĩa Hoa? Người cược cao nhất phải lật đủ số đó — chồng mình trước — trúng Sọ là mất đĩa. Thắng 2 thử thách hoặc là người cuối cùng còn đĩa thì thắng.',
  minPlayers: 3,
  maxPlayers: 6,
  tags: ['Bịp', 'Đông người'],
  order: 4,
  turnMs: 25000,
  seats: [
    { name: 'Đỏ', color: '#ff4d6d', label: '🦊' }, { name: 'Cam', color: '#ff9f1c', label: '🐯' },
    { name: 'Vàng', color: '#ffd23f', label: '🦁' }, { name: 'Lục', color: '#2ec76b', label: '🐸' },
    { name: 'Lam', color: '#3a9bff', label: '🐺' }, { name: 'Tím', color: '#b06cff', label: '🦉' },
  ],
  options: [
    { key: 'chaos', label: 'Chế độ', default: true,
      choices: [{ value: true, label: '🔥 Hỗn Loạn — đĩa đặc biệt, điềm báo mỗi vòng, hồn ma' }, { value: false, label: '😇 Cổ điển' }] },
    { key: 'need', label: 'Thắng khi', default: 2,
      choices: [{ value: 2, label: 'Thắng 2 thử thách (chuẩn)' }, { value: 3, label: 'Thắng 3 thử thách (dài hơn)' }] },
  ],
  // Ước tính từ mô phỏng bot.
  estimate(o, players) {
    const m = (2 + players * 0.9) * (o.need === 3 ? 1.4 : 1) * (o.chaos ? 1.1 : 1);
    return `~${Math.max(3, Math.round(m))} phút`;
  },
};
