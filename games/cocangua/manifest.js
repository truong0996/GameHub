// Thông tin hiển thị ở hub + tuỳ chọn phòng chờ. Dữ liệu thuần, gửi nguyên cho client (trừ hàm estimate).
import { SEATS } from './rules.js';

export default {
  id: 'cocangua',
  name: 'Cờ Cá Ngựa',
  icon: '🐴',
  tagline: 'Lục Mã Hỗn Chiến',
  description: 'Cờ cá ngựa 2–6 người, bàn đổi hình theo số người (vuông, tam giác... tới lục giác): đá ngựa, ô bí ẩn, cổng dịch chuyển, thẻ kỹ năng và biến cố toàn bàn.',
  minPlayers: 2,
  maxPlayers: 6,
  order: 1,
  turnMs: 30000,
  seats: SEATS.map(s => ({ name: s.name, color: s.color, label: s.horse })),
  options: [
    { key: 'horses', label: 'Số ngựa mỗi người', default: 4,
      choices: [{ value: 2, label: '2 ngựa' }, { value: 3, label: '3 ngựa' }, { value: 4, label: '4 ngựa' }] },
    { key: 'home', label: 'Về chuồng', default: 'fast',
      choices: [{ value: 'fast', label: '⚡ Nhanh (dư bước vẫn vào)' }, { value: 'classic', label: '🏯 Truyền thống (đúng cửa, từng bậc)' }] },
    { key: 'block', label: 'Luật cản', default: true,
      choices: [{ value: true, label: '🚧 Có — không nhảy qua đầu' }, { value: false, label: 'Không' }] },
    { key: 'chaos', label: 'Chế độ Hỗn Loạn', default: true,
      choices: [{ value: true, label: '🔥 Bật — ô bí ẩn, thẻ, biến cố' }, { value: false, label: '😇 Tắt — cờ thuần' }] },
    { key: 'eventEvery', label: 'Biến cố toàn bàn', default: 10,
      choices: [{ value: 6, label: 'Mỗi 6 lượt' }, { value: 10, label: 'Mỗi 10 lượt' }, { value: 15, label: 'Mỗi 15 lượt' }] },
  ],
  // Ước tính từ mô phỏng bot (tools/simulate.js ... players=n). Bàn nhỏ lại theo số người nên ván ít người ngắn hẳn;
  // tắt Hỗn Loạn thì ngựa kẹt nhau vì luật cản, càng đông càng lâu.
  estimate(o, players) {
    const n = Math.min(6, Math.max(2, players));
    const byPlayers = { 2: 0.3, 3: 0.48, 4: 0.58, 5: 0.79, 6: 1 }[n];
    const calm = { 2: 1.2, 3: 1.4, 4: 2.1, 5: 3, 6: 4.3 }[n];
    const m = { 2: 15, 3: 25, 4: 37 }[o.horses] * byPlayers * (o.home === 'classic' ? 1.8 : 1) * (o.chaos ? 1 : calm);
    return `~${Math.round(m)} phút`;
  },
};
