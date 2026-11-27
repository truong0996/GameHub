// 💣 Mèo Nổ — thông tin hiển thị ở hub + tuỳ chọn phòng chờ.
export default {
  id: 'meono',
  name: 'Mèo Nổ',
  icon: '💣',
  tagline: 'Rút bài và cầu trời đừng nổ',
  description: 'Lần lượt rút bài — ai rút phải Mèo Nổ mà không có Gỡ Bom thì NỔ và bị loại. Người cuối cùng còn sống thắng. Đánh bài để né, xem trước, tấn công, xin bài... và hô "Không!" để phá nhau bất cứ lúc nào.',
  minPlayers: 2,
  maxPlayers: 6,
  tags: ['Bài', 'Vui nhộn'],
  order: 2,
  turnMs: 30000,
  seats: [
    { name: 'Đỏ', color: '#ff4d6d', label: '🐱' }, { name: 'Cam', color: '#ff9f1c', label: '😺' }, { name: 'Vàng', color: '#ffd23f', label: '😸' },
    { name: 'Lục', color: '#2ec76b', label: '😼' }, { name: 'Lam', color: '#3a9bff', label: '😻' }, { name: 'Tím', color: '#b06cff', label: '😽' },
  ],
  options: [
    { key: 'chaos', label: 'Chế độ', default: true,
      choices: [{ value: true, label: '🔥 Hỗn Loạn — Mèo Hẹn Giờ, Bom Tổng Lực, Đổi Phận, hồn ma...' }, { value: false, label: '😇 Cổ điển' }] },
    { key: 'hand', label: 'Bài khởi đầu', default: 7,
      choices: [{ value: 7, label: '7 lá + 1 Gỡ Bom' }, { value: 4, label: '4 lá + 1 Gỡ Bom (nhanh, căng)' }] },
    { key: 'nopeMs', label: 'Thời gian hô "Không!"', default: 3000,
      choices: [{ value: 2000, label: '2 giây — nhanh tay' }, { value: 3000, label: '3 giây' }, { value: 5000, label: '5 giây — thong thả' }] },
  ],
  // Ước tính từ mô phỏng bot (mỗi quyết định ~3s): 2 người ~3.5', 4 người ~7.5', 6 người ~9' (Hỗn Loạn, 7 lá).
  estimate(o, players) {
    const m = (1.5 + players * 1.3) * (o.chaos ? 1 : 0.8) * (o.hand === 4 ? 0.85 : 1) * (o.nopeMs / 3000 * 0.3 + 0.7);
    return `~${Math.max(3, Math.round(m))} phút`;
  },
};
