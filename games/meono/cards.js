// 💣 Mèo Nổ — danh sách lá bài + tiện ích dùng chung cho server và client (không có logic ẩn ở đây).
export const CARDS = {
  bomb:     { icon: '💣', name: 'Mèo Nổ', color: '#e63946', desc: 'Rút phải là NỔ — trừ khi bạn có Gỡ Bom.' },
  defuse:   { icon: '🧯', name: 'Gỡ Bom', color: '#2ec76b', desc: 'Tự dùng khi bạn rút phải Mèo Nổ. Sau đó bạn lén nhét Mèo Nổ lại vào chồng bài ở chỗ tuỳ thích.' },
  nope:     { icon: '🙅', name: 'Không!', color: '#ff4d6d', desc: 'Chặn lá vừa đánh. Dùng được bất cứ lúc nào, kể cả ngoài lượt. "Không!" chồng "Không!" thì huỷ nhau.' },
  attack:   { icon: '⚔️', name: 'Tấn Công', color: '#ff9f1c', desc: 'Kết thúc lượt, không rút. Người kế tiếp phải chơi 2 lượt. Đang bị tấn công mà đánh tiếp thì số lượt cộng dồn +2.' },
  skip:     { icon: '⏭️', name: 'Bỏ Lượt', color: '#3a9bff', desc: 'Kết thúc 1 lượt mà không phải rút bài.' },
  favor:    { icon: '🙏', name: 'Xin Bài', color: '#c77dff', desc: 'Bắt 1 người đưa cho bạn 1 lá — họ được chọn đưa lá nào.' },
  shuffle:  { icon: '🔀', name: 'Xáo Bài', color: '#8d99ae', desc: 'Xáo đều chồng bài.' },
  future:   { icon: '🔮', name: 'Xem Trước', color: '#7b2cbf', desc: 'Lén xem 3 lá trên cùng của chồng bài.' },
  taco:     { icon: '🌮', name: 'Mèo Taco', color: '#f4a261', cat: true },
  melon:    { icon: '🍉', name: 'Mèo Dưa Hấu', color: '#e76f51', cat: true },
  potato:   { icon: '🥔', name: 'Mèo Khoai Tây', color: '#bc8a5f', cat: true },
  beard:    { icon: '🧔', name: 'Mèo Râu Xồm', color: '#6c757d', cat: true },
  rainbow:  { icon: '🌈', name: 'Mèo Cầu Vồng', color: '#4cc9f0', cat: true },
  // ---- Chế độ Hỗn Loạn ----
  timebomb: { icon: '⏳', name: 'Mèo Hẹn Giờ', color: '#ff006e', chaos: true, desc: 'Rút lần 1: lật ngửa, bạn chọn chỗ nhét lại — cả bàn thấy nó cách mặt bài bao nhiêu lá. Rút lần 2: NỔ, Gỡ Bom cũng không cứu được.' },
  catomic:  { icon: '☢️', name: 'Bom Tổng Lực', color: '#d00000', chaos: true, desc: 'Gom TẤT CẢ Mèo Nổ lên đầu chồng bài (cả bàn đều biết), xáo phần còn lại, rồi kết thúc 1 lượt không rút.' },
  swap:     { icon: '🎭', name: 'Đổi Phận', color: '#9d4edd', chaos: true, desc: 'Đổi toàn bộ bài trên tay bạn với 1 người.' },
  alter:    { icon: '🪄', name: 'Cải Số', color: '#5a189a', chaos: true, desc: 'Xem 3 lá trên cùng rồi sắp xếp lại tuỳ ý.' },
  bottom:   { icon: '⬇️', name: 'Rút Đáy', color: '#2a9d8f', chaos: true, desc: 'Kết thúc lượt bằng cách rút lá DƯỚI ĐÁY thay vì lá trên cùng.' },
  reverse:  { icon: '🔄', name: 'Đảo Chiều', color: '#00b4d8', chaos: true, desc: 'Đảo chiều vòng chơi và kết thúc 1 lượt không rút.' },
  target:   { icon: '🎯', name: 'Chỉ Điểm', color: '#f77f00', chaos: true, desc: 'Như Tấn Công nhưng bạn chọn ai phải lãnh 2 lượt.' },
  feral:    { icon: '🐈', name: 'Mèo Hoang', color: '#495057', cat: true, chaos: true, desc: 'Lá mèo đa năng: ghép với bất kỳ lá mèo nào.' },
};
for (const c of Object.values(CARDS)) if (c.cat && !c.desc) c.desc = 'Lá mèo: đánh đôi để rút ngẫu nhiên 1 lá của người khác, bộ ba để đòi đích danh 1 lá.';

export const ORDER = Object.keys(CARDS);
export const isKiller = c => c === 'bomb' || c === 'timebomb';
export const SINGLE = ['attack', 'skip', 'favor', 'shuffle', 'future', 'catomic', 'swap', 'alter', 'bottom', 'reverse', 'target'];
export const TARGETED = ['favor', 'swap', 'target'];

// Bộ combo: 'pair' (2 lá giống nhau), 'triple' (3 lá giống nhau), 'five' (5 lá khác loại) hoặc null.
// Mèo Hoang thay được cho bất kỳ lá mèo nào.
export function comboKind(cards) {
  if (!Array.isArray(cards) || cards.some(c => !CARDS[c] || isKiller(c))) return null;
  if (cards.length === 5) return new Set(cards).size === 5 ? 'five' : null;
  if (cards.length !== 2 && cards.length !== 3) return null;
  const rest = new Set(cards.filter(c => c !== 'feral'));
  if (rest.size > 1) return null;
  if (rest.size === 1 && cards.includes('feral') && !CARDS[[...rest][0]].cat) return null;
  return cards.length === 2 ? 'pair' : 'triple';
}

// Thời lượng animation phía client (ms) — hub chờ hết rồi mới cho bot/hẹn giờ chạy tiếp.
export const DUR = {
  play: 650, nope: 900, noped: 700, draw: 800, defuse: 1400, boom: 2600, arm: 1600, bury: 600, shuffle: 1000, future: 300,
  give: 900, steal: 900, stealFail: 800, take: 800, takeFail: 500, swap: 1400, reverse: 700, attack: 900, skip: 500, catomic: 2000,
  alter: 300, altered: 400, favorAsk: 400, favorEmpty: 500, turn: 250, win: 1500,
};
export const animDuration = evs => evs.reduce((t, e) => t + (DUR[e.t] || 0), 0);
