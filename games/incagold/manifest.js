// 💎 Kho Báu Inca (Incan Gold) — thông tin hiển thị ở hub + tuỳ chọn phòng chờ.
export default {
  id: 'incagold',
  name: 'Kho Báu Inca',
  icon: '💎',
  tagline: 'Liều đào tiếp hay ôm ngọc chạy?',
  description: 'Cả đoàn cùng vào đền Inca. Mỗi lượt lật 1 lá: kho báu chia đều cho người trong hang, hiểm hoạ thứ hai cùng loại là chết sạch. Mọi người BÍ MẬT chọn cùng lúc: ở lại đào tiếp hay về lều cất ngọc. 5 ngôi đền, ai nhiều ngọc nhất thắng.',
  minPlayers: 2,
  maxPlayers: 8,
  order: 3,
  turnMs: 20000,
  seats: [
    { name: 'Đỏ', color: '#ff4d6d', label: '🦙' }, { name: 'Cam', color: '#ff9f1c', label: '🦅' },
    { name: 'Vàng', color: '#ffd23f', label: '🐆' }, { name: 'Lục', color: '#2ec76b', label: '🐸' },
    { name: 'Lam', color: '#3a9bff', label: '🦜' }, { name: 'Tím', color: '#b06cff', label: '🐒' },
    { name: 'Hồng', color: '#ff6fb5', label: '🦩' }, { name: 'Ngọc', color: '#20c4c4', label: '🦎' },
  ],
  options: [
    { key: 'chaos', label: 'Chế độ', default: true,
      choices: [{ value: true, label: '🔥 Hỗn Loạn — bùa, lá bí ẩn, đền có luật riêng, chơi xấu' }, { value: false, label: '😇 Cổ điển' }] },
    { key: 'rounds', label: 'Số đền', default: 5,
      choices: [{ value: 5, label: '5 đền (chuẩn)' }, { value: 3, label: '3 đền (nhanh)' }] },
  ],
  // Ước tính từ mô phỏng bot (mỗi pha chọn ~1.5s + animation).
  estimate(o, players) {
    const m = (4 + players * 0.35) * (o.rounds / 5) * (o.chaos ? 1.2 : 1);
    return `~${Math.max(2, Math.round(m))} phút`;
  },
};
