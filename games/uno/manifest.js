// 🎴 UNO — thông tin hiển thị ở hub + tuỳ chọn phòng chờ.
const onOff = (on, off) => [{ value: true, label: on }, { value: false, label: off }];

export default {
  id: 'uno',
  name: 'UNO',
  icon: '🎴',
  tagline: 'Cùng màu hay cùng số — còn 1 lá thì hô UNO!',
  description: 'Đánh lá cùng màu hoặc cùng số/ký hiệu với lá trên cùng, không có thì rút. Mất Lượt, Đảo Chiều, +2, +4 để phá nhau. Ai hết bài trước thắng — nhưng còn 1 lá mà quên hô UNO! là bị bắt phạt. Chế độ Bất Ngờ: Gương dội phạt, Bom Màu, Đổi Tay, Lốc Xoáy và sự kiện bất ngờ mỗi vòng bàn.',
  minPlayers: 2,
  maxPlayers: 8,
  tags: ['Bài', 'Đông người'],
  order: 5,
  turnMs: 20000,
  seats: [
    { name: 'Đỏ', color: '#ff4d6d', label: '🦊' }, { name: 'Cam', color: '#ff9f1c', label: '🐯' },
    { name: 'Vàng', color: '#ffd23f', label: '🐥' }, { name: 'Lục', color: '#2ec76b', label: '🐸' },
    { name: 'Lam', color: '#3a9bff', label: '🐳' }, { name: 'Tím', color: '#b06cff', label: '🦄' },
    { name: 'Hồng', color: '#ff6fb5', label: '🐷' }, { name: 'Ngọc', color: '#20c4c4', label: '🐙' },
  ],
  options: [
    { key: 'chaos', label: 'Chế độ', default: true,
      choices: onOff('🎁 Bất Ngờ — lá mới (Gương, Bom Màu, Đổi Tay...) + sự kiện mỗi vòng bàn', '😇 Cổ điển') },
    { key: 'target', label: 'Thắng khi', default: 0,
      choices: [{ value: 0, label: 'Hết bài trước — 1 ván' }, { value: 200, label: 'Tính điểm — tới 200' }, { value: 500, label: 'Tính điểm — tới 500 (chuẩn)' }] },
    { key: 'stack', label: 'Cộng dồn +2/+4', default: true, choices: onOff('✅ Có — bị +2 thì đánh +2/+4 chuyền tiếp', '❌ Không') },
    { key: 'sevenO', label: 'Đổi bài 7-0', default: false, choices: onOff('✅ Có — 7: đổi tay với 1 người, 0: cả bàn chuyền tay', '❌ Không') },
    { key: 'jump', label: 'Chặn ngang', default: false, choices: onOff('✅ Có — lá y hệt lá trên cùng thì đánh chen ngay', '❌ Không') },
    { key: 'drawUntil', label: 'Khi không đánh được', default: false, choices: onOff('Rút tới khi đánh được', 'Rút 1 lá') },
  ],
  estimate(o, players) {
    const m = (2 + players * 0.6) * (o.target ? o.target / 120 : 1) * (o.chaos ? 1.1 : 1);
    return `~${Math.max(3, Math.round(m))} phút`;
  },
};
