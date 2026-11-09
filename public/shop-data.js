// Cửa hàng đồ trang trí (dùng chung server + client): danh sách món, ô trang bị, độ hiếm, công thức thưởng credit.
// Đồ chỉ để khoe — không ảnh hưởng luật chơi. Hai tầng: đồ của hub (mọi game: khung ảnh, tên, danh hiệu, khung chat, hiệu ứng thắng,
// gói biểu cảm) và đồ trong game (grp 'game': lưng bài, xúc xắc, mũ, khung tranh — chỉ các game ghi trong 'games' vẽ, đọc qua ctx.skin).
// Màu ghế trong game KHÔNG bị đổi (nhiều game dùng màu ghế làm luật: đội, quân cờ).

// Credit mỗi ván (chỉ ván được ghi vào lịch sử: ≥2 người đăng nhập, chơi đến hết):
//   base × trọng số thời lượng (×1…×3, như bảng xếp hạng), hạng 1 (kể cả đồng hạng 1) nhân thêm winMul.
//   Mỗi tài khoản nhận tối đa dayCap credit mỗi ngày (giờ Việt Nam). Ván bỏ dở: không ai được, không ai bị trừ.
export const CREDIT = { base: 10, winMul: 1.5, dayCap: 300 };

export const SLOTS = [
  { id: 'frame', name: 'Khung ảnh', icon: '🖼️', hint: 'Viền quanh ảnh đại diện ở phòng chờ' },
  { id: 'name', name: 'Hiệu ứng tên', icon: '✨', hint: 'Tên lấp lánh ở phòng chờ, khung chat, bảng xếp hạng' },
  { id: 'title', name: 'Danh hiệu', icon: '🎖️', hint: 'Hiện cạnh tên ở phòng chờ, khung chat, bảng xếp hạng' },
  { id: 'bubble', name: 'Khung chat', icon: '💬', hint: 'Tin nhắn trong khung chat và bong bóng lời thoại tại ghế' },
  { id: 'fx', name: 'Hiệu ứng thắng', icon: '🎆', hint: 'Cả phòng thấy khi bạn thắng ván (và khi bạn ngồi vào ghế)' },
  { id: 'back', grp: 'game', name: 'Lưng bài', icon: '🂠', games: 'UNO, Mèo Nổ, Coup', hint: 'Mặt lưng các lá bài úp trên tay bạn — người khác nhìn thấy' },
  { id: 'dice', grp: 'game', name: 'Xúc xắc', icon: '🎲', games: 'Cờ Cá Ngựa, Cờ Tỷ Phú', hint: 'Xúc xắc đổi kiểu tới lượt bạn gieo' },
  { id: 'hat', grp: 'game', name: 'Mũ', icon: '🎩', games: 'Kẻ Mạo Danh', hint: 'Đội trên đầu nhân vật của bạn (bị Biến Hình/Ngụy Trang thì mũ đổi theo hình dạng)' },
  { id: 'easel', grp: 'game', name: 'Khung tranh', icon: '🖼️', games: 'Vẽ Đoán', hint: 'Viền quanh bức tranh lúc bạn vẽ (cả phòng thấy) và quanh tranh của bạn trong Phòng tranh' },
  { id: 'emote', name: 'Gói biểu cảm', icon: '😎', hint: 'Thêm biểu cảm vào thanh emoji trong game — mua là dùng được, không cần trang bị' },
];

// c thường · r hiếm · e sử thi · l huyền thoại
export const RARITY = {
  c: { name: 'Thường', color: '#8a8f98' },
  r: { name: 'Hiếm', color: '#2f8fff' },
  e: { name: 'Sử thi', color: '#b04dff' },
  l: { name: 'Huyền thoại', color: '#ff8a00' },
};

// id cũng là tên class CSS (public/shop.css: .lk-<id>). Đổi giá thì người đã mua không bị ảnh hưởng (đã trừ theo giá lúc mua).
export const ITEMS = [
  // Khung ảnh
  { id: 'fr-jade', slot: 'frame', name: 'Ngọc Bích', rar: 'r', price: 120 },
  { id: 'fr-sakura', slot: 'frame', name: 'Hoa Anh Đào', rar: 'r', price: 150 },
  { id: 'fr-gold', slot: 'frame', name: 'Vương Miện Vàng', rar: 'e', price: 350 },
  { id: 'fr-fire', slot: 'frame', name: 'Hoả Diệm', rar: 'e', price: 400 },
  { id: 'fr-rainbow', slot: 'frame', name: 'Cầu Vồng Xoay', rar: 'l', price: 700 },
  { id: 'fr-galaxy', slot: 'frame', name: 'Thiên Hà', rar: 'l', price: 900 },
  // Hiệu ứng tên
  { id: 'nx-sunset', slot: 'name', name: 'Hoàng Hôn', rar: 'r', price: 150 },
  { id: 'nx-ocean', slot: 'name', name: 'Đại Dương', rar: 'r', price: 150 },
  { id: 'nx-gold', slot: 'name', name: 'Ánh Kim', rar: 'e', price: 400 },
  { id: 'nx-fire', slot: 'name', name: 'Lửa Cháy', rar: 'e', price: 450 },
  { id: 'nx-rainbow', slot: 'name', name: 'Cầu Vồng', rar: 'l', price: 800 },
  { id: 'nx-galaxy', slot: 'name', name: 'Tinh Vân', rar: 'l', price: 850 },
  // Danh hiệu (text = chữ hiện ra)
  { id: 't-newbie', slot: 'title', name: 'Tân Binh', text: '🌱 Tân Binh', rar: 'c', price: 40 },
  { id: 't-player', slot: 'title', name: 'Tay Chơi', text: '😎 Tay Chơi', rar: 'c', price: 80 },
  { id: 't-pro', slot: 'title', name: 'Cao Thủ', text: '⚔️ Cao Thủ', rar: 'r', price: 200 },
  { id: 't-cards', slot: 'title', name: 'Thần Bài', text: '🃏 Thần Bài', rar: 'r', price: 250 },
  { id: 't-rich', slot: 'title', name: 'Đại Gia', text: '💰 Đại Gia', rar: 'e', price: 500 },
  { id: 't-king', slot: 'title', name: 'Vua Trò Chơi', text: '👑 Vua Trò Chơi', rar: 'e', price: 600 },
  { id: 't-legend', slot: 'title', name: 'Huyền Thoại', text: '🐉 Huyền Thoại', rar: 'l', price: 1000 },
  // Khung chat
  { id: 'bb-sakura', slot: 'bubble', name: 'Hoa Anh Đào', rar: 'r', price: 150 },
  { id: 'bb-ocean', slot: 'bubble', name: 'Đại Dương', rar: 'r', price: 150 },
  { id: 'bb-gold', slot: 'bubble', name: 'Dát Vàng', rar: 'e', price: 400 },
  { id: 'bb-neon', slot: 'bubble', name: 'Đèn Lồng Đêm', rar: 'e', price: 450 },
  { id: 'bb-rainbow', slot: 'bubble', name: 'Cầu Vồng', rar: 'l', price: 700 },
  // Hiệu ứng thắng
  { id: 'fx-confetti', slot: 'fx', name: 'Pháo Giấy', rar: 'r', price: 200 },
  { id: 'fx-gold', slot: 'fx', name: 'Mưa Vàng', rar: 'e', price: 450 },
  { id: 'fx-fireworks', slot: 'fx', name: 'Pháo Hoa Rực Rỡ', rar: 'e', price: 500 },
  { id: 'fx-stars', slot: 'fx', name: 'Mưa Sao Băng', rar: 'l', price: 800 },
  { id: 'fx-dragon', slot: 'fx', name: 'Rồng Lửa', rar: 'l', price: 950 },
  // Lưng bài (motif = hình to ở giữa lá, chỉ hiện khi lá đủ lớn — vd xem trước trong cửa hàng)
  { id: 'bk-sakura', slot: 'back', name: 'Anh Đào', motif: '🌸', rar: 'r', price: 150 },
  { id: 'bk-ocean', slot: 'back', name: 'Sóng Biển', motif: '🌊', rar: 'r', price: 150 },
  { id: 'bk-gold', slot: 'back', name: 'Lá Vàng Ròng', motif: '💰', rar: 'e', price: 400 },
  { id: 'bk-neon', slot: 'back', name: 'Neon Đêm', motif: '⚡', rar: 'e', price: 450 },
  { id: 'bk-dragon', slot: 'back', name: 'Long Ấn', motif: '🐉', rar: 'l', price: 800 },
  { id: 'bk-galaxy', slot: 'back', name: 'Dải Ngân Hà', motif: '🌌', rar: 'l', price: 900 },
  // Xúc xắc
  { id: 'dc-jade', slot: 'dice', name: 'Ngọc Lục Bảo', rar: 'r', price: 120 },
  { id: 'dc-ruby', slot: 'dice', name: 'Hồng Ngọc', rar: 'r', price: 150 },
  { id: 'dc-gold', slot: 'dice', name: 'Vàng Ròng', rar: 'e', price: 400 },
  { id: 'dc-neon', slot: 'dice', name: 'Neon', rar: 'e', price: 450 },
  { id: 'dc-fire', slot: 'dice', name: 'Hoả Ngục', rar: 'l', price: 800 },
  { id: 'dc-galaxy', slot: 'dice', name: 'Sao Trời', rar: 'l', price: 900 },
  // Mũ (Kẻ Mạo Danh): emoji = đội nguyên emoji; draw = kiểu vẽ riêng trong shop.js (drawHat); glow = màu phát sáng
  { id: 'h-cap', slot: 'hat', name: 'Mũ Lưỡi Trai', emoji: '🧢', rar: 'c', price: 60 },
  { id: 'h-bow', slot: 'hat', name: 'Nơ Hồng', emoji: '🎀', rar: 'c', price: 80 },
  { id: 'h-flower', slot: 'hat', name: 'Hoa Cài Đầu', emoji: '🌺', rar: 'r', price: 120 },
  { id: 'h-grad', slot: 'hat', name: 'Mũ Tốt Nghiệp', emoji: '🎓', rar: 'r', price: 150 },
  { id: 'h-top', slot: 'hat', name: 'Mũ Ảo Thuật', emoji: '🎩', rar: 'r', price: 200 },
  { id: 'h-crown', slot: 'hat', name: 'Vương Miện', emoji: '👑', glow: '#ffcc33', rar: 'e', price: 450 },
  { id: 'h-horns', slot: 'hat', name: 'Sừng Quỷ', draw: 'horns', glow: '#ff2a2a', rar: 'e', price: 500 },
  { id: 'h-halo', slot: 'hat', name: 'Hào Quang Thiên Thần', draw: 'halo', glow: '#ffe066', rar: 'l', price: 800 },
  { id: 'h-flame', slot: 'hat', name: 'Đầu Rực Lửa', draw: 'flame', glow: '#ff6a00', rar: 'l', price: 900 },
  // Khung tranh (Vẽ Đoán)
  { id: 'ez-oak', slot: 'easel', name: 'Gỗ Sồi Viền Vàng', rar: 'r', price: 120 },
  { id: 'ez-sakura', slot: 'easel', name: 'Anh Đào', rar: 'r', price: 150 },
  { id: 'ez-gold', slot: 'easel', name: 'Khung Bảo Tàng', rar: 'e', price: 400 },
  { id: 'ez-neon', slot: 'easel', name: 'Đèn Neon', rar: 'e', price: 450 },
  { id: 'ez-rainbow', slot: 'easel', name: 'Cầu Vồng Xoay', rar: 'l', price: 800 },
  { id: 'ez-galaxy', slot: 'easel', name: 'Tinh Vân', rar: 'l', price: 900 },
  // Gói biểu cảm
  { id: 'em-mood', slot: 'emote', name: 'Cảm Xúc+', emojis: ['🥳', '🤯', '😱', '🫡'], rar: 'c', price: 100 },
  { id: 'em-party', slot: 'emote', name: 'Lễ Hội', emojis: ['🎉', '🧧', '🏮', '🎆'], rar: 'r', price: 150 },
  { id: 'em-beast', slot: 'emote', name: 'Thần Thú', emojis: ['🐉', '🦄', '🦊', '🐯'], rar: 'r', price: 200 },
  { id: 'em-royal', slot: 'emote', name: 'Hoàng Gia', emojis: ['👑', '💎', '🏆', '💰'], rar: 'e', price: 300 },
];

// Không có prototype: tra ITEM["constructor"], ITEM["__proto__"]... phải ra undefined (nếu không thì "mua" được món ma không giá → số dư NaN → mua gì cũng qua).
export const ITEM = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(ITEMS.map(x => [x.id, x]))));
// Ô trang bị được (gói biểu cảm mua là dùng, không trang bị).
export const WEAR = SLOTS.map(s => s.id).filter(s => s !== 'emote');
