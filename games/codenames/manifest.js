// 🕵️ Mật Danh (Codenames) — thông tin hiển thị ở hub + tuỳ chọn phòng chờ.
// Ghế xếp theo khối 5: 0–4 đội Đỏ, 5–9 Lam, 10–14 Lục (chỉ chế độ 3 đội). Ghế đầu mỗi khối là Trưởng nhóm.
const TEAM = [['Đỏ', '#d2483f'], ['Lam', '#2f6fc9'], ['Lục', '#2a8a52']];
const seats = TEAM.flatMap(([name, color]) => Array.from({ length: 5 }, (_, i) => ({
  name: `${name} ${i ? i : ''}`.trim(), color, label: i ? '🔎 Đoán' : '🕵️ Gợi ý',
})));

export default {
  id: 'codenames',
  name: 'Mật Danh',
  icon: '🕵️',
  tagline: 'Một từ gợi ý, cả đội đoán lá',
  description: 'Codenames — hai (hoặc ba) đội điệp viên. Trưởng nhóm biết lá nào của đội mình và chỉ được nói MỘT từ + một con số; đồng đội bỏ phiếu chỉ lá. Lật hết lá của đội trước thì thắng, lật trúng 💀 sát thủ là thua ngay. Có biến cố, kỹ năng, lá đặc biệt và chế độ hình emoji.',
  minPlayers: 4,
  maxPlayers: 15,
  tags: ['Đố chữ', 'Đồng đội', 'Đông người'],
  order: 8,
  turnMs: 60000,
  seats,
  // Chế độ 2 đội thì khối ghế đội Lục bị đóng.
  seatOn: (i, o) => i < (o.teams === 3 ? 15 : 10),
  options: [
    { key: 'teams', label: 'Số đội', default: 2,
      choices: [{ value: 2, label: '2 đội — bàn 5×5' }, { value: 3, label: '3 đội — bàn 6×6' }] },
    { key: 'pack', label: 'Bộ từ', default: 'all',
      choices: [{ value: 'all', label: '📚 Tổng hợp' }, { value: 'life', label: '🏠 Đời sống' }, { value: 'nature', label: '🌿 Thiên nhiên' },
        { value: 'fantasy', label: '🐉 Phiêu lưu & tưởng tượng' }, { value: 'pic', label: '🖼️ Hình emoji (không chữ)' }] },
    { key: 'events', label: 'Sự kiện bất ngờ', default: true,
      choices: [{ value: true, label: '🌋 Bật — 2–3 lượt bốc 1 biến cố' }, { value: false, label: 'Tắt' }] },
    { key: 'skills', label: 'Kỹ năng đội', default: true,
      choices: [{ value: true, label: '🎴 Bật — mỗi đội 2 kỹ năng dùng 1 lần' }, { value: false, label: 'Tắt' }] },
    { key: 'specials', label: 'Lá đặc biệt', default: true,
      choices: [{ value: true, label: '💰 Bật — kho báu, bom, kẻ phản bội...' }, { value: false, label: 'Tắt' }] },
    { key: 'pace', label: 'Thời gian', default: 'normal',
      choices: [{ value: 'calm', label: '🐢 Thong thả (gợi ý 150s, đoán 90s)' }, { value: 'normal', label: '🙂 Vừa (100s / 60s)' },
        { value: 'fast', label: '⚡ Gấp (60s / 35s)' }] },
  ],
  // Mô phỏng bot: 2 đội ~7.5 lượt, 3 đội ~11 lượt; người thật ~45s ra gợi ý + ~15s mỗi lần chọn lá.
  estimate(o, players) {
    const m = (o.teams === 3 ? 15 : 10) * (o.pace === 'fast' ? 0.8 : o.pace === 'calm' ? 1.2 : 1) + players * 0.1;
    return `~${Math.round(m)} phút`;
  },
};
