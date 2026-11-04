// 💎 Kho Báu Inca — dữ liệu dùng chung server + client (tên lá, bùa, đền, thời lượng animation). Không có logic ẩn ở đây.
export const TREASURES = [1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17];

export const HAZARDS = {
  snake:  { icon: '🐍', name: 'Rắn Độc', color: '#3f9b4f' },
  spider: { icon: '🕷️', name: 'Nhện Khổng Lồ', color: '#a8324a' },
  mummy:  { icon: '🧟', name: 'Xác Ướp', color: '#9a8455' },
  fire:   { icon: '🔥', name: 'Biển Lửa', color: '#d9542b' },
  rock:   { icon: '🪨', name: 'Đá Lở', color: '#7a7068' },
};
export const HAZ_KEYS = Object.keys(HAZARDS);

// Mỗi vòng thêm 1 cổ vật vào chồng bài. 3 cổ vật đầu tiên được mang về đáng 5 ngọc, từ cái thứ 4 đáng 10.
export const ARTIFACTS = [
  { icon: '🏺', name: 'Bình Gốm Cổ' },
  { icon: '🗿', name: 'Tượng Thần Đá' },
  { icon: '🦙', name: 'Lạc Đà Vàng' },
  { icon: '🎭', name: 'Mặt Nạ Vàng' },
  { icon: '👑', name: 'Vương Miện Mặt Trời' },
];
export const artifactValue = (claimed, temple) => (claimed < 3 ? 5 : 10) * (temple === 'holy' ? 2 : 1);

// ---- Hỗn Loạn: lá bí ẩn trộn vào đường hầm ----
export const MYSTERY = {
  vein:     { icon: '💠', name: 'Mạch Ngọc Lớn', desc: 'Mỗi người đang trong hang nhận ngay 4 ngọc — không phải chia!' },
  shortcut: { icon: '🕳️', name: 'Đường Tắt', desc: 'Ai về lều ngay lượt này được nhặt GẤP ĐÔI số ngọc rơi trên đường.' },
  fog:      { icon: '🌫️', name: 'Sương Mù', desc: '2 hiểm hoạ tiếp theo lật ÚP — không ai biết là gì cho tới khi trùng.' },
  curse:    { icon: '🗿', name: 'Tượng Nguyền', desc: 'Ai đang trong hang đánh rơi 1/3 ngọc trong túi xuống lá này (người về sau nhặt).' },
  echo:     { icon: '🔊', name: 'Tiếng Vọng', desc: 'Cả đoàn nghe được lá kế tiếp có phải hiểm hoạ hay không.' },
};

// ---- Hỗn Loạn: bùa (mỗi người 3 bùa ngẫu nhiên, mỗi bùa dùng 1 lần, chỉ dùng khi đang trong hang và chưa chốt) ----
// secret: người khác chỉ thấy "dùng một bùa bí ẩn" cho tới khi bùa phát tác.
export const CHARMS = {
  torch:  { icon: '🔦', name: 'Đuốc', desc: 'Lén xem lá sắp lật.' },
  condor: { icon: '🦅', name: 'Mắt Kền Kền', desc: 'Thấy ai đã chốt Ở/Về trong lượt này.' },
  amulet: { icon: '🛡️', name: 'Bùa Hộ Mệnh', secret: true, desc: 'Cả vòng này: nếu gặp hiểm hoạ chết người, bạn thoát về lều cùng ngọc trong túi.' },
  magnet: { icon: '🧲', name: 'Nam Châm', secret: true, desc: 'Nếu lượt này bạn về: hút hết ngọc rơi + cổ vật trên đường, kể cả khi có người về cùng (2 nam châm thì triệt tiêu).' },
  pick:   { icon: '🎒', name: 'Móc Túi', dirty: true, desc: 'Lấy 1/3 số ngọc trong túi của người giàu nhất đang ở trong hang.' },
  push:   { icon: '😈', name: 'Đẩy Ngã', dirty: true, secret: true, target: true, desc: 'Chọn 1 người. Nếu lượt này bạn VỀ còn họ Ở LẠI, họ ngã và đánh rơi nửa túi ngọc xuống đường — bạn nhặt luôn.' },
  trap:   { icon: '🪤', name: 'Đặt Bẫy', dirty: true, secret: true, desc: 'Sau khi mọi người chốt, gài 1 hiểm hoạ ngẫu nhiên lên đầu chồng bài. Trùng loại đã có là cả hang toang — nhớ chạy trước!' },
};
export const CHARM_KEYS = Object.keys(CHARMS);

// ---- Hỗn Loạn: mỗi vòng vào một ngôi đền có luật riêng ----
export const TEMPLES = {
  sun:      { icon: '🌞', name: 'Đền Mặt Trời', desc: 'Kho báu lật ra giá trị ×1.5.' },
  dark:     { icon: '🌑', name: 'Đền Bóng Tối', desc: 'Mọi hiểm hoạ đều lật ÚP — chỉ biết loại khi đã quá muộn.' },
  collapse: { icon: '🏚️', name: 'Đền Sắp Sập', desc: 'Từ lá thứ 8 trở đi, mỗi lần lật có 15% hang sập — ai còn trong hang mất sạch.' },
  holy:     { icon: '⛩️', name: 'Đền Thiêng', desc: 'Cổ vật giá trị ×2.' },
  greed:    { icon: '💰', name: 'Đền Tham Lam', desc: 'Những người rời hang CUỐI CÙNG (còn sống) chia nhau 10 ngọc thưởng.' },
  twin:     { icon: '♊', name: 'Đền Song Sinh', desc: 'Mỗi lượt lật 2 lá liền.' },
};
export const TEMPLE_KEYS = Object.keys(TEMPLES);

// Thời lượng animation phía client (ms) — hub chờ hết rồi mới cho bot/hẹn giờ chạy tiếp.
export const DUR = {
  round: 2200, flip: 750, reveal: 1300, collect: 650, push: 900, pushFail: 300, trap: 1000, death: 2400, collapse: 2400,
  roundEnd: 1200, bonus: 800, steal: 900, charm: 350, vein: 900, curse: 900, echo: 900, fog: 600, shortcut: 600, over: 1500,
};
export const animDuration = evs => evs.reduce((t, e) => t + (DUR[e.t] || 0), 0);
