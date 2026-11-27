// Cửa hàng đồ trang trí (dùng chung server + client): danh sách món, ô trang bị, độ hiếm, công thức thưởng credit.
// Đồ chỉ để khoe — không ảnh hưởng luật chơi. Hai tầng: đồ của hub (mọi game: khung ảnh, tên, khung chat, hiệu ứng thắng,
// gói biểu cảm) và đồ trong game (grp 'game': lưng bài, xúc xắc, mũ, khung tranh — chỉ các game ghi trong 'games' vẽ, đọc qua ctx.skin).
// Danh hiệu (slot 'title') nhận qua Thành tựu (public/achievements-data.js), không bán trong cửa hàng.
// Màu ghế trong game KHÔNG bị đổi (nhiều game dùng màu ghế làm luật: đội, quân cờ).
import { TITLE } from './achievements-data.js';

// Credit mỗi ván (chỉ ván được ghi vào lịch sử: ≥2 người đăng nhập, chơi đến hết):
//   base × trọng số thời lượng (×1…×3, như bảng xếp hạng), hạng 1 (kể cả đồng hạng 1) nhân thêm winMul.
//   Mỗi tài khoản nhận tối đa dayCap credit mỗi ngày (giờ Việt Nam). Ván bỏ dở: không ai được, không ai bị trừ.
export const CREDIT = { base: 15, winMul: 1.5, dayCap: 300 };

export const SLOTS = [
  { id: 'frame', name: 'Khung ảnh', icon: '🖼️', hint: 'Viền trang trí bao quanh ảnh đại diện tại phòng chờ' },
  { id: 'name', name: 'Hiệu ứng tên', icon: '✨', hint: 'Hiệu ứng màu chữ hiển thị tại phòng chờ, trò chuyện và bảng xếp hạng' },
  { id: 'bubble', name: 'Khung chat', icon: '💬', hint: 'Giao diện riêng cho tin nhắn trò chuyện và lời thoại tại bàn' },
  { id: 'fx', name: 'Hiệu ứng thắng', icon: '🎆', hint: 'Hiệu ứng ăn mừng xuất hiện khi bạn chiến thắng hoặc ngồi vào bàn' },
  { id: 'back', grp: 'game', name: 'Lưng bài', icon: '🂠', games: 'UNO, Mèo Nổ, Coup', hint: 'Hoạ tiết mặt sau của lá bài úp hiển thị với những người chơi khác' },
  { id: 'dice', grp: 'game', name: 'Xúc xắc', icon: '🎲', games: 'Cờ Cá Ngựa, Cờ Tỷ Phú', hint: 'Giao diện xúc xắc riêng mỗi khi đến lượt bạn gieo' },
  { id: 'hat', grp: 'game', name: 'Mũ', icon: '🎩', games: 'Kẻ Mạo Danh', hint: 'Phụ kiện đội đầu cho nhân vật (tự đồng bộ khi ngụy trang)' },
  { id: 'easel', grp: 'game', name: 'Khung tranh', icon: '🖼️', games: 'Vẽ Đoán', hint: 'Khung viền bảng vẽ của bạn trong lúc vẽ và tại Phòng trưng bày' },
  { id: 'emote', name: 'Gói biểu cảm', icon: '😎', hint: 'Mở khoá thêm biểu cảm mới trong trò chơi (tự động kích hoạt sau khi mua)' },
  { id: 'util', name: 'Tiện ích', icon: '🎟️', hint: 'Thẻ tiêu hao dùng cho tài khoản (có thể mua nhiều lần)' },
];

// c thường · r hiếm · e sử thi · l huyền thoại
export const RARITY = {
  c: { name: 'Thường', color: '#8a8f98' },
  r: { name: 'Hiếm', color: '#2f8fff' },
  e: { name: 'Sử thi', color: '#b04dff' },
  l: { name: 'Huyền thoại', color: '#ff8a00' },
};

export const COLLECTIONS = [
  { id: 'xmas', name: 'Giáng Sinh', icon: '🎄', season: true, desc: 'Sắc đỏ xanh lễ hội, tuyết rơi và quà Giáng Sinh.' },
  { id: 'sakura', name: 'Hoa Anh Đào', icon: '🌸', desc: 'Sắc hồng dịu nhẹ cùng cánh hoa anh đào bay.' },
  { id: 'ocean', name: 'Đại Dương', icon: '🫧', desc: 'Sắc xanh biển sâu mát lành và bọt sóng lung linh.' },
  { id: 'gold', name: 'Hoàng Kim', icon: '👑', desc: 'Ánh vàng vương giả lấp lánh sang trọng.' },
  { id: 'fire', name: 'Hoả Diệm', icon: '🔥', desc: 'Ngọn lửa rực cháy đầy uy lực.' },
  { id: 'rainbow', name: 'Cầu Vồng', icon: '🌈', desc: 'Đa sắc cầu vồng rực rỡ chuyển động.' },
  { id: 'galaxy', name: 'Thiên Hà', icon: '🪐', desc: 'Vũ trụ huyền bí với tinh vân và ánh sao.' },
];

// id cũng là tên class CSS (public/shop.css: .lk-<id>). Đổi giá thì người đã mua không bị ảnh hưởng (đã trừ theo giá lúc mua).
export const ITEMS = [
  // Khung ảnh (7 bộ đồng nhất: Hoa Anh Đào, Đại Dương, Hoàng Kim, Hoả Diệm, Giáng Sinh, Cầu Vồng, Thiên Hà)
  { id: 'fr-sakura', slot: 'frame', col: 'sakura', name: 'Hoa Anh Đào', rar: 'r', price: 100 },
  { id: 'fr-ocean', slot: 'frame', col: 'ocean', name: 'Đại Dương', rar: 'r', price: 100 },
  { id: 'fr-gold', slot: 'frame', col: 'gold', name: 'Hoàng Kim', rar: 'e', price: 220 },
  { id: 'fr-fire', slot: 'frame', col: 'fire', name: 'Hoả Diệm', rar: 'e', price: 250 },
  { id: 'fr-xmas', slot: 'frame', col: 'xmas', name: 'Giáng Sinh', rar: 'e', price: 240 },
  { id: 'fr-rainbow', slot: 'frame', col: 'rainbow', name: 'Cầu Vồng', rar: 'l', price: 400 },
  { id: 'fr-galaxy', slot: 'frame', col: 'galaxy', name: 'Thiên Hà', rar: 'l', price: 480 },
  // Hiệu ứng tên
  { id: 'nx-sakura', slot: 'name', col: 'sakura', name: 'Hoa Anh Đào', rar: 'r', price: 100 },
  { id: 'nx-ocean', slot: 'name', col: 'ocean', name: 'Đại Dương', rar: 'r', price: 100 },
  { id: 'nx-gold', slot: 'name', col: 'gold', name: 'Hoàng Kim', rar: 'e', price: 220 },
  { id: 'nx-fire', slot: 'name', col: 'fire', name: 'Hoả Diệm', rar: 'e', price: 250 },
  { id: 'nx-xmas', slot: 'name', col: 'xmas', name: 'Giáng Sinh', rar: 'e', price: 240 },
  { id: 'nx-rainbow', slot: 'name', col: 'rainbow', name: 'Cầu Vồng', rar: 'l', price: 400 },
  { id: 'nx-galaxy', slot: 'name', col: 'galaxy', name: 'Thiên Hà', rar: 'l', price: 480 },
  // Khung chat
  { id: 'bb-sakura', slot: 'bubble', col: 'sakura', name: 'Hoa Anh Đào', rar: 'r', price: 100 },
  { id: 'bb-ocean', slot: 'bubble', col: 'ocean', name: 'Đại Dương', rar: 'r', price: 100 },
  { id: 'bb-gold', slot: 'bubble', col: 'gold', name: 'Hoàng Kim', rar: 'e', price: 220 },
  { id: 'bb-fire', slot: 'bubble', col: 'fire', name: 'Hoả Diệm', rar: 'e', price: 250 },
  { id: 'bb-xmas', slot: 'bubble', col: 'xmas', name: 'Giáng Sinh', rar: 'e', price: 240 },
  { id: 'bb-rainbow', slot: 'bubble', col: 'rainbow', name: 'Cầu Vồng', rar: 'l', price: 400 },
  { id: 'bb-galaxy', slot: 'bubble', col: 'galaxy', name: 'Thiên Hà', rar: 'l', price: 480 },
  // Hiệu ứng thắng
  { id: 'fx-confetti', slot: 'fx', col: 'rainbow', name: 'Pháo Giấy', rar: 'r', price: 120 },
  { id: 'fx-snow', slot: 'fx', col: 'xmas', name: 'Bão Tuyết Noel', rar: 'r', price: 140 },
  { id: 'fx-gold', slot: 'fx', col: 'gold', name: 'Mưa Vàng', rar: 'e', price: 250 },
  { id: 'fx-fireworks', slot: 'fx', name: 'Pháo Hoa Rực Rỡ', rar: 'e', price: 280 },
  { id: 'fx-stars', slot: 'fx', col: 'galaxy', name: 'Mưa Sao Băng', rar: 'l', price: 450 },
  { id: 'fx-santa', slot: 'fx', col: 'xmas', name: 'Ông Già Noel', rar: 'l', price: 460 },
  { id: 'fx-dragon', slot: 'fx', col: 'fire', name: 'Rồng Lửa', rar: 'l', price: 520 },
  // Lưng bài (motif = hình to ở giữa lá, chỉ hiện khi lá đủ lớn — vd xem trước trong cửa hàng)
  { id: 'bk-sakura', slot: 'back', col: 'sakura', name: 'Hoa Anh Đào', motif: '🌸', rar: 'r', price: 100 },
  { id: 'bk-ocean', slot: 'back', col: 'ocean', name: 'Đại Dương', motif: '🫧', rar: 'r', price: 100 },
  { id: 'bk-gold', slot: 'back', col: 'gold', name: 'Hoàng Kim', motif: '👑', rar: 'e', price: 220 },
  { id: 'bk-fire', slot: 'back', col: 'fire', name: 'Hoả Diệm', motif: '🔥', rar: 'e', price: 250 },
  { id: 'bk-xmas', slot: 'back', col: 'xmas', name: 'Giáng Sinh', motif: '🎄', rar: 'e', price: 240 },
  { id: 'bk-rainbow', slot: 'back', col: 'rainbow', name: 'Cầu Vồng', motif: '🌈', rar: 'l', price: 400 },
  { id: 'bk-galaxy', slot: 'back', col: 'galaxy', name: 'Thiên Hà', motif: '🪐', rar: 'l', price: 480 },
  // Xúc xắc
  { id: 'dc-sakura', slot: 'dice', col: 'sakura', name: 'Hoa Anh Đào', rar: 'r', price: 100 },
  { id: 'dc-ocean', slot: 'dice', col: 'ocean', name: 'Đại Dương', rar: 'r', price: 100 },
  { id: 'dc-gold', slot: 'dice', col: 'gold', name: 'Hoàng Kim', rar: 'e', price: 220 },
  { id: 'dc-fire', slot: 'dice', col: 'fire', name: 'Hoả Diệm', rar: 'e', price: 250 },
  { id: 'dc-xmas', slot: 'dice', col: 'xmas', name: 'Giáng Sinh', rar: 'e', price: 240 },
  { id: 'dc-rainbow', slot: 'dice', col: 'rainbow', name: 'Cầu Vồng', rar: 'l', price: 400 },
  { id: 'dc-galaxy', slot: 'dice', col: 'galaxy', name: 'Thiên Hà', rar: 'l', price: 480 },
  // Mũ (Kẻ Mạo Danh): emoji = đội nguyên emoji; draw = kiểu vẽ riêng trong shop.js (drawHat); glow = màu phát sáng
  { id: 'h-cap', slot: 'hat', name: 'Mũ Lưỡi Trai', emoji: '🧢', rar: 'c', price: 40 },
  { id: 'h-bow', slot: 'hat', name: 'Nơ Hồng', emoji: '🎀', rar: 'c', price: 50 },
  { id: 'h-flower', slot: 'hat', name: 'Hoa Cài Đầu', emoji: '🌺', rar: 'r', price: 80 },
  { id: 'h-grad', slot: 'hat', name: 'Mũ Tốt Nghiệp', emoji: '🎓', rar: 'r', price: 100 },
  { id: 'h-top', slot: 'hat', name: 'Mũ Ảo Thuật', emoji: '🎩', rar: 'r', price: 120 },
  { id: 'h-antlers', slot: 'hat', col: 'xmas', name: 'Sừng Tuần Lộc', draw: 'antlers', glow: '#d98a3c', rar: 'r', price: 120 },
  { id: 'h-crown', slot: 'hat', col: 'gold', name: 'Vương Miện', emoji: '👑', glow: '#ffcc33', rar: 'e', price: 240 },
  { id: 'h-santa', slot: 'hat', col: 'xmas', name: 'Mũ Ông Già Noel', draw: 'santa', glow: '#ff4d4d', rar: 'e', price: 240 },
  { id: 'h-horns', slot: 'hat', name: 'Sừng Quỷ', draw: 'horns', glow: '#ff2a2a', rar: 'e', price: 280 },
  { id: 'h-halo', slot: 'hat', name: 'Hào Quang Thiên Thần', draw: 'halo', glow: '#ffe066', rar: 'l', price: 420 },
  { id: 'h-flame', slot: 'hat', col: 'fire', name: 'Đầu Rực Lửa', draw: 'flame', glow: '#ff6a00', rar: 'l', price: 480 },
  // Khung tranh (Vẽ Đoán)
  { id: 'ez-sakura', slot: 'easel', col: 'sakura', name: 'Hoa Anh Đào', rar: 'r', price: 100 },
  { id: 'ez-ocean', slot: 'easel', col: 'ocean', name: 'Đại Dương', rar: 'r', price: 100 },
  { id: 'ez-gold', slot: 'easel', col: 'gold', name: 'Hoàng Kim', rar: 'e', price: 220 },
  { id: 'ez-fire', slot: 'easel', col: 'fire', name: 'Hoả Diệm', rar: 'e', price: 250 },
  { id: 'ez-xmas', slot: 'easel', col: 'xmas', name: 'Giáng Sinh', rar: 'e', price: 240 },
  { id: 'ez-rainbow', slot: 'easel', col: 'rainbow', name: 'Cầu Vồng', rar: 'l', price: 400 },
  { id: 'ez-galaxy', slot: 'easel', col: 'galaxy', name: 'Thiên Hà', rar: 'l', price: 480 },
  // Gói biểu cảm
  { id: 'em-mood', slot: 'emote', name: 'Cảm Xúc+', emojis: ['🥳', '🤯', '😱', '🫡'], rar: 'c', price: 60 },
  { id: 'em-party', slot: 'emote', name: 'Lễ Hội', emojis: ['🎉', '🧧', '🏮', '🎆'], rar: 'r', price: 100 },
  { id: 'em-xmas', slot: 'emote', col: 'xmas', name: 'Giáng Sinh', emojis: ['🎄', '🎅', '🎁', '⛄'], rar: 'r', price: 100 },
  { id: 'em-beast', slot: 'emote', name: 'Thần Thú', emojis: ['🐉', '🦄', '🦊', '🐯'], rar: 'r', price: 120 },
  { id: 'em-royal', slot: 'emote', name: 'Hoàng Gia', emojis: ['👑', '💎', '🏆', '💰'], rar: 'e', price: 180 },
  // Tiện ích (tiêu hao)
  { id: 'u-rename', slot: 'util', name: 'Thẻ Đổi Tên', icon: '🪪', rar: 'e', price: 1000, firstSale: 99, consumable: true,
    desc: 'Dùng để đổi tên tài khoản 1 lần (chỉ đổi tên được khi có thẻ).' },
];

// Giá thực tế của một món (áp dụng giảm giá lần đầu nếu là vật phẩm tiêu hao có firstSale).
export function itemPrice(it, wallet) {
  if (!it) return 0;
  if (it.firstSale && !(wallet && wallet.bag && wallet.bag.bought && wallet.bag.bought[it.id] > 0)) {
    return Math.round(it.price * (100 - it.firstSale) / 100);
  }
  return it.price;
}

// Không có prototype: tra ITEM["constructor"], ITEM["__proto__"]... phải ra undefined (nếu không thì "mua" được món ma không giá → số dư NaN → mua gì cũng qua).
export const ITEM = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(ITEMS.map(x => [x.id, x]))));
// Mọi vật phẩm trang trí hợp lệ (đồ cửa hàng + danh hiệu từ thành tựu).
export const COSMETIC = id => ITEM[id] || TITLE[id] || null;
// Ô trang bị được (gói biểu cảm & thẻ tiện ích không trang bị; 'title' mở qua thành tựu).
export const WEAR = [...SLOTS.map(s => s.id).filter(s => s !== 'emote' && s !== 'util'), 'title'];
