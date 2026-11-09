// 🎨 Vẽ Đoán — thông tin hiển thị ở hub + tuỳ chọn phòng chờ.
import { PACKS } from './data.js';

const SEATS = [
  ['Đỏ', '#e5383b'], ['Lam', '#2f63e0'], ['Lục', '#1f9d4c'], ['Cam', '#f28c18'], ['Tím', '#7d45d6'], ['Hồng', '#e05fb5'],
  ['Lơ', '#1fb3c2'], ['Nâu', '#8b5a3c'], ['Vàng', '#d9a91a'], ['Xám', '#5d6470'], ['Rêu', '#6c8a2a'], ['Đào', '#e8735a'],
].map(([name, color]) => ({ name, color }));

export default {
  id: 'vedoan',
  name: 'Vẽ Đoán',
  icon: '🎨',
  tagline: 'Một người vẽ, cả bàn đoán chữ',
  description: 'Tới lượt thì chọn 1 trong 3 từ rồi vẽ cho cả bàn đoán. Ai gõ đúng càng sớm càng nhiều điểm, hoạ sĩ được điểm theo số người đoán ra. Gõ không dấu vẫn tính. Hết giờ dần dần lộ chữ cái. Có biến cố cọ vẽ (Gương, Mực Phai, Đèn Pin, Vẽ Mù...), vật phẩm cho người đoán, từ đặc biệt (độ khó, Từ Vàng, Song Hoạ) và bình chọn tranh + phòng tranh cuối ván. Bot vẽ bằng cách phác hoạ emoji.',
  minPlayers: 2,
  maxPlayers: 12,
  tags: ['Đố chữ', 'Vẽ', 'Vui nhộn', 'Đông người'],
  order: 9,
  seats: SEATS,
  options: [
    { key: 'pack', label: 'Chủ đề', default: 'all', choices: Object.entries(PACKS).map(([value, p]) => ({ value, label: `${p.icon} ${p.name}` })) },
    { key: 'rounds', label: 'Số vòng (mỗi vòng ai cũng vẽ 1 lần)', default: 2,
      choices: [{ value: 1, label: '1 vòng' }, { value: 2, label: '2 vòng' }, { value: 3, label: '3 vòng' }, { value: 4, label: '4 vòng' }] },
    { key: 'time', label: 'Thời gian vẽ', default: 80,
      choices: [{ value: 50, label: '⚡ 50 giây' }, { value: 80, label: '🙂 80 giây' }, { value: 110, label: '🐢 110 giây' }] },
    { key: 'events', label: 'Biến cố cọ vẽ', default: true,
      choices: [{ value: true, label: '🌀 Bật — Gương, Mực Phai, Đèn Pin, Vẽ Mù, Ba Nét...' }, { value: false, label: 'Tắt' }] },
    { key: 'items', label: 'Vật phẩm người đoán', default: true,
      choices: [{ value: true, label: '🎒 Bật — trả bằng điểm trong ván: Soi Chữ, Bom Khói, Đặt Cược...' }, { value: false, label: 'Tắt' }] },
    { key: 'specials', label: 'Từ đặc biệt', default: true,
      choices: [{ value: true, label: '⭐ Bật — chọn độ khó, Từ Vàng ×2, Song Hoạ' }, { value: false, label: 'Tắt — 3 từ ngẫu nhiên' }] },
    { key: 'vote', label: 'Bình chọn & phòng tranh', default: true,
      choices: [{ value: true, label: '❤️ Bật — thả tim cho tranh, cuối ván xem lại cả phòng tranh' }, { value: false, label: 'Tắt' }] },
  ],
  // Mỗi lượt ≈ chọn từ 8s + vẽ (thường xong sớm hơn hạn ~25%) + xem đáp án 6s.
  estimate: (o, n) => `~${Math.max(3, Math.round(n * o.rounds * (o.time * 0.75 + 14) / 60))} phút`,
};
