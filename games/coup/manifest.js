// 🎭 Coup — thông tin hiển thị ở hub + tuỳ chọn phòng chờ.
const onOff = (on, off) => [{ value: true, label: on }, { value: false, label: off }];

export default {
  id: 'coup',
  name: 'Coup',
  icon: '🎭',
  tagline: 'Nhận bừa là Công Tước — dám thách thức không?',
  description: 'Mỗi người giữ 2 lá vai úp kín (ảnh hưởng). Tới lượt thì lấy xu hoặc dùng sức mạnh của một vai — nhận bừa cũng được! Ai nghi thì thách thức: người nói dối mất 1 ảnh hưởng, nghi oan thì người thách thức mất. Gom đủ 7 xu để Đảo Chính. Mất cả 2 lá là bị loại, người cuối cùng còn trụ thắng. Chế độ Bất Ngờ: vai mới (Nhà Cái, Kẻ Đầu Độc, Gián Điệp, Thầy Bói, Vệ Sĩ), biến cố mỗi vòng bàn, chợ đen, hồn ma.',
  minPlayers: 2,
  maxPlayers: 8,
  tags: ['Bịp', 'Bài', 'Đông người'],
  order: 7,
  turnMs: 30000,
  seats: [
    { name: 'Đỏ', color: '#ff4d6d', label: '🦊' }, { name: 'Cam', color: '#ff9f1c', label: '🐯' },
    { name: 'Vàng', color: '#ffd23f', label: '🦁' }, { name: 'Lục', color: '#2ec76b', label: '🐸' },
    { name: 'Lam', color: '#3a9bff', label: '🐺' }, { name: 'Tím', color: '#b06cff', label: '🦉' },
    { name: 'Hồng', color: '#ff6fb5', label: '🐷' }, { name: 'Ngọc', color: '#20c4c4', label: '🐙' },
  ],
  options: [
    { key: 'chaos', label: 'Chế độ', default: true,
      choices: onOff('🎁 Bất Ngờ — vai mới, biến cố mỗi vòng bàn, chợ đen, hồn ma', '😇 Cổ điển — 5 vai gốc') },
    { key: 'factions', label: 'Phe phái', default: false,
      choices: onOff('🦁🦅 Có — chia 2 phe, không được đánh người cùng phe; Đổi Phe, Biển Thủ', '❌ Không') },
    { key: 'react', label: 'Thời gian thách thức/chặn', default: 10,
      choices: [{ value: 7, label: '⚡ 7 giây' }, { value: 10, label: '10 giây' }, { value: 15, label: '🐢 15 giây' }] },
  ],
  // Ước tính từ mô phỏng bot.
  estimate(o, players) {
    const m = (1.5 + players * 1.1) * (o.chaos ? 1.1 : 1) * (o.factions ? 1.15 : 1);
    return `~${Math.max(3, Math.round(m))} phút`;
  },
};
