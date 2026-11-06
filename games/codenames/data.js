// 🕵️ Mật Danh — dữ liệu dùng chung server + client: đội, biến cố, kỹ năng, lá đặc biệt, kiểm tra gợi ý, thời lượng animation.

// Ghế xếp theo khối: ghế 0–4 đội Đỏ, 5–9 Lam, 10–14 Lục. Người ngồi ghế nhỏ nhất của khối là Trưởng nhóm.
export const BLOCK = 5;
export const TEAMS = [
  { name: 'Đỏ', color: '#d2483f', icon: '🔴' },
  { name: 'Lam', color: '#2f6fc9', icon: '🔵' },
  { name: 'Lục', color: '#2a8a52', icon: '🟢' },
];
export const teamOfSeat = i => Math.floor(i / BLOCK);
export const UNLIMITED = 99;   // số lượt đoán khi gợi ý "0" hoặc "∞"
export const INF = 10;         // giá trị n của gợi ý "∞"

// Thời gian mỗi pha (ms): ra gợi ý / mỗi lần bỏ phiếu chọn lá.
export const PACE = {
  calm: { clue: 150000, guess: 90000 },
  normal: { clue: 100000, guess: 60000 },
  fast: { clue: 60000, guess: 35000 },
};

// Biến cố (bật "Sự kiện bất ngờ"): bốc đầu lượt, cứ 2–3 lượt một lần.
export const EVENTS = {
  quake: { icon: '🌋', name: 'Động Đất', desc: 'Mọi lá chưa lật bị xáo lại chỗ ngồi. Ai nhớ vị trí thì quên đi!' },
  fog: { icon: '🌫️', name: 'Sương Mù', desc: 'Chữ trên 4 lá bị sương che suốt lượt này (Trưởng nhóm vẫn thấy).' },
  retreat: { icon: '🏳️', name: 'Rút Lui', desc: 'Một điệp viên của đội đang thua rút lui — lá đó thành dân thường.' },
  whisper: { icon: '🤫', name: 'Mách Nước', desc: 'Đội đang thua được đánh dấu ⭐ một lá chắc chắn của mình.' },
  mirror: { icon: '🪞', name: 'Gương Thần', desc: 'Hai lá chưa lật của hai đội bí mật đổi màu cho nhau.' },
  renew: { icon: '🔤', name: 'Đổi Gió', desc: '3 lá chưa lật được thay chữ mới (màu giữ nguyên).' },
  rush: { icon: '⏱️', name: 'Gấp Gáp', desc: 'Lượt này thời gian suy nghĩ chỉ còn một nửa.' },
  bonus: { icon: '🎁', name: 'Hào Phóng', desc: 'Lượt này đội được đoán thêm 1 lá.' },
  limit: { icon: '🤐', name: 'Kiệm Lời', desc: 'Lượt này gợi ý chỉ được số 1 hoặc 2.' },
};
export const EVENT_KEYS = Object.keys(EVENTS);

// Kỹ năng đội (bật "Thẻ kỹ năng"): mỗi đội 2 kỹ năng ngẫu nhiên, Trưởng nhóm dùng trước khi ra gợi ý, mỗi cái 1 lần.
export const SKILLS = {
  double: { icon: '➕', name: 'Gợi Ý Kép', desc: 'Lượt này ra 2 gợi ý cùng lúc (đoán được tổng hai số + 1).' },
  shield: { icon: '🛡️', name: 'Lá Chắn', desc: 'Lượt này lật nhầm lá thường/đội khác lần đầu không mất lượt (sát thủ thì vẫn chết).' },
  mark: { icon: '🎯', name: 'Đánh Dấu', desc: 'Gắn ⭐ lên 1 lá của đội mình — đồng đội thấy ngay.', pick: true },
  swap: { icon: '🔄', name: 'Đổi Chữ', desc: 'Thay chữ trên 1 lá chưa lật bất kỳ (màu giữ nguyên).', pick: true },
  jam: { icon: '📡', name: 'Nhiễu Sóng', desc: 'Lượt kế của đội tiếp theo: người đoán không thấy con số trong gợi ý.' },
};
export const SKILL_KEYS = Object.keys(SKILLS);

// Lá đặc biệt (bật "Lá đặc biệt"): Trưởng nhóm thấy biểu tượng, người đoán chỉ biết khi lật.
export const SPECIALS = {
  gold: { icon: '💰', name: 'Kho Báu', on: 'n', desc: 'Lá thường có kho báu: lật trúng không mất lượt, còn được đoán thêm 1.' },
  orb: { icon: '🔮', name: 'Quả Cầu', on: 'n', desc: 'Lá thường có quả cầu: hết lượt nhưng được đánh dấu ⭐ một lá của đội mình.' },
  traitor: { icon: '🐍', name: 'Kẻ Phản Bội', on: 'n', desc: 'Lá thường có kẻ phản bội: hết lượt và một lá thường khác biến thành lá của đội mình (phải tìm thêm 1).' },
  bomb: { icon: '💣', name: 'Bom', on: 'n', desc: 'Lá thường có bom: hết lượt và đội mình mất luôn lượt kế tiếp.' },
  star: { icon: '🌟', name: 'Ngôi Sao', on: 't', desc: 'Lá của đội có ngôi sao: chính đội đó lật trúng thì được đoán thêm 1.' },
};

// ---------- gợi ý ----------
export const normClue = s => String(s || '').normalize('NFC').toLocaleLowerCase('vi').replace(/[\s_]+/g, ' ').trim();
const syl = s => normClue(s).split(/[\s-]+/).filter(Boolean);
// a (mảng âm tiết) có chứa đoạn liền b không
function hasRun(a, b) {
  for (let i = 0; i + b.length <= a.length; i++) if (b.every((x, j) => a[i + j] === x)) return true;
  return false;
}
// Lỗi của gợi ý (chuỗi tiếng Việt) hoặc null. cards: [{ w, nm?, rev }] — nm = tên của lá hình.
export function clueProblem(word, cards) {
  const w = normClue(word);
  if (!w) return 'Hãy nhập một từ gợi ý';
  if (w.length > 24) return 'Gợi ý dài quá (tối đa 24 ký tự)';
  if (!/^[\p{L}\- ]+$/u.test(w)) return 'Gợi ý chỉ gồm chữ cái (không số, không ký hiệu)';
  const s = syl(w);
  if (s.length > 4) return 'Gợi ý chỉ được một từ (tối đa 4 tiếng)';
  for (const c of cards) {
    if (c.rev) continue;
    if (c.nm != null) { if (normClue(c.nm) === w) return 'Gợi ý không được là tên của hình trên bàn'; continue; }
    if (c.w == null) continue;
    const cw = syl(c.w);
    if (hasRun(cw, s) || hasRun(s, cw)) return `«${w}» trùng với từ «${c.w}» trên bàn — chọn từ khác`;
  }
  return null;
}
export const nLabel = n => (n == null ? '?' : n === INF ? '∞' : String(n));

// ---------- animation ----------
const DUR = { start: 600, turn: 700, ev: 2600, skill: 1300, clue: 1500, flip: 1100, sp: 1500, shield: 1100, out: 1600, skip: 1300, stop: 500, over: 1500 };
export const animDuration = evs => evs.reduce((s, e) => s + (DUR[e.t] || 0), 0);
