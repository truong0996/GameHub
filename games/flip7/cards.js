// 🃏 Flip 7 — dữ liệu dùng chung server + client: bộ bài, tên lá, sự kiện vòng, cách tính điểm, thời lượng animation.
// Không có logic ẩn ở đây (luật + bot nằm trong server.js để không lộ chồng bài).

// Lá số: số n có n lá (riêng số 0 có 1 lá) → 79 lá.
export const NUM_COUNT = n => (n === 0 ? 1 : n);
export const NUM_COLORS = ['#7d8597', '#a0616a', '#c9733a', '#c99a0e', '#6f9a2e', '#23946a', '#178f9b', '#2f7fd1', '#5a5fd6', '#8a4fd0', '#b8449c', '#d1435b', '#7a4a2a'];

// Lá cộng điểm (mỗi loại 1 lá). x2 nhân đôi tổng LÁ SỐ (không nhân lá cộng).
export const MODS = [2, 4, 6, 8, 10, 'x2'];

// Lá hành động. n = số lá trong bộ bài; chaos = chỉ có ở chế độ Bất Ngờ.
export const ACTIONS = {
  freeze: { icon: '❄️', name: 'Đóng Băng', color: '#3a8fd1', n: 3, desc: 'Chọn 1 người còn trong vòng (kể cả bạn): người đó phải Dừng ngay, giữ điểm đang có.' },
  three:  { icon: '🎲', name: 'Lật Ba Lá', color: '#d9762b', n: 3, desc: 'Chọn 1 người còn trong vòng (kể cả bạn): người đó phải rút liền 3 lá (dừng sớm nếu cháy hoặc đủ Flip 7). Lá hành động rút được sẽ xử lý sau.' },
  second: { icon: '💖', name: 'Cơ Hội Thứ Hai', color: '#d6457a', n: 3, desc: 'Giữ lại: lần tới rút trùng số thì bỏ lá trùng + lá này, không bị cháy. Đã có rồi thì phải tặng cho người khác (chưa có).' },
  // ---- Bất Ngờ ----
  swap:   { icon: '🔀', name: 'Đổi Chác', color: '#7b4fc9', n: 2, chaos: true, desc: 'Chọn 1 người: bạn lấy lá số LỚN NHẤT của họ và đưa họ lá số NHỎ NHẤT của bạn (chưa có lá số thì chỉ lấy). Ai nhận phải số trùng thì cháy!' },
  magnet: { icon: '🧲', name: 'Nam Châm', color: '#c23b3b', n: 2, chaos: true, desc: 'Chọn 1 người: hút về lá x2 của họ, không có thì lá cộng lớn nhất, rồi đến Cơ Hội Thứ Hai, cuối cùng là lá số lớn nhất (hút phải số trùng thì bạn cháy!).' },
  peek:   { icon: '🔮', name: 'Tiên Tri', color: '#4b3a8f', n: 2, chaos: true, desc: 'Lén xem 3 lá trên cùng chồng bài, rồi chọn để nguyên hoặc chôn lá trên cùng xuống đáy.' },
};
export const RAINBOW = { icon: '🌈', name: 'Cầu Vồng', n: 2, desc: 'Lá số đặc biệt (0 điểm): không bao giờ bị trùng, tính là 1 số riêng để gom Flip 7.' };

// Sự kiện vòng (chế độ Bất Ngờ): đầu mỗi vòng bốc 1 sự kiện, hết túi thì xáo lại.
export const EVENTS = {
  calm:   { icon: '🌤️', name: 'Yên Bình', desc: 'Không có gì đặc biệt. Tận hưởng đi...' },
  rich:   { icon: '💰', name: 'Thần Tài', desc: 'Lá cộng điểm (+2 … +10) có giá trị gấp đôi.' },
  six:    { icon: '🎰', name: 'Lục Phát', desc: 'Chỉ cần 6 số khác nhau là Flip (vẫn thưởng +15, vòng kết thúc ngay).' },
  greed:  { icon: '🔥', name: 'Tham Lam', desc: 'Flip 7 thưởng +40 thay vì +15.' },
  early:  { icon: '🐦', name: 'Chim Sớm', desc: 'Người chủ động Dừng đầu tiên vòng này được +10.' },
  odd:    { icon: '🌗', name: 'Ngày Lẻ', desc: 'Lá số lẻ tính gấp đôi điểm.' },
  grace:  { icon: '😇', name: 'Ân Huệ', desc: 'Mọi người bắt đầu vòng với 1 Cơ Hội Thứ Hai miễn phí.' },
  double: { icon: '✌️', name: 'Chia Đôi', desc: 'Mỗi người được chia 2 lá đầu vòng thay vì 1.' },
  brave:  { icon: '🦁', name: 'Gan Dạ', desc: 'Cuối vòng, ai giữ nhiều lá số nhất (không cháy) được +15.' },
  mercy:  { icon: '🩹', name: 'Đỡ Đòn', desc: 'Cháy vẫn giữ được một nửa điểm lá số.' },
  fog:    { icon: '🌫️', name: 'Sương Mù', desc: 'Lá số của người khác bị úp — chỉ lộ ra khi họ cháy hoặc hết vòng.' },
};
export const EVENT_KEYS = Object.keys(EVENTS);

export const flipNeed = ev => (ev === 'six' ? 6 : 7);
export const flipBonus = ev => (ev === 'greed' ? 40 : 15);

// Điểm vòng của một người (pl.nums / pl.mods / pl.status / pl.bonus). Lá úp (k:'h') không tính được → trả null.
export function roundScore(pl, ev) {
  if (!pl || pl.status === 'off') return 0;
  if (pl.nums.some(c => c.k === 'h')) return null;
  let n = 0;
  for (const c of pl.nums) if (c.k === 'n') n += ev === 'odd' && c.v % 2 ? c.v * 2 : c.v;
  if (pl.mods.some(c => c.v === 'x2')) n *= 2;
  if (pl.status === 'bust') return ev === 'mercy' ? Math.floor(n / 2) : 0;
  const m = pl.mods.reduce((s, c) => s + (c.v === 'x2' ? 0 : c.v), 0) * (ev === 'rich' ? 2 : 1);
  return n + m + (pl.status === 'flip7' ? flipBonus(ev) : 0) + (pl.bonus || 0);
}

// Thời lượng animation phía client (ms) — hub chờ hết rồi mới cho bot/hẹn giờ chạy tiếp.
export const DUR = {
  start: 300, round: 1900, deal: 420, draw: 620, bust: 1300, save: 1100, flip7: 2400, stay: 450, act: 900, swap: 1400, steal: 950,
  peek: 300, peeked: 500, fizzle: 500, roundEnd: 3800, over: 1500, shuffle: 900,
};
export const animDuration = evs => evs.reduce((t, e) => t + (e.t === 'draw' && e.why === 'deal' ? DUR.deal : DUR[e.t] || 0), 0);
