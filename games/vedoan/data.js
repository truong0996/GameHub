// 🎨 Vẽ Đoán — dữ liệu dùng chung server + client: bảng màu, cọ, biến cố, vật phẩm, mô hình nét vẽ, so đáp án.
// Kho từ nằm trong server-words.js (không gửi xuống trình duyệt).

export const W = 800, H = 600;           // toạ độ logic của tranh (client co giãn theo màn hình)

export const PALETTE = [
  '#1d1b19', '#ffffff', '#9b9690', '#5a5550', '#e53935', '#8e1c1c', '#fb8c00', '#fdd835', '#ffe9a8',
  '#7cc242', '#1f8a3b', '#4fc3f7', '#1e6fd9', '#22307a', '#8e44ad', '#f48fb1', '#8d5a3b', '#f2c9a0',
];
export const BLACK = 0, WHITE = 1;       // tẩy = vẽ màu trắng
export const SIZES = [3, 7, 14, 26, 44];

export const PACKS = {
  all: { icon: '📚', name: 'Tổng hợp' },
  animal: { icon: '🐾', name: 'Con vật' },
  food: { icon: '🍜', name: 'Ăn uống' },
  thing: { icon: '🧸', name: 'Đồ vật & xe cộ' },
  people: { icon: '🧑‍🍳', name: 'Con người & hoạt động' },
  world: { icon: '🌍', name: 'Thiên nhiên & nơi chốn' },
  vn: { icon: '🏮', name: 'Việt Nam' },
  easy: { icon: '🧒', name: 'Dễ (cho cả nhà)' },
};
// Chủ đề nhỏ của từng từ (vật phẩm Xem Chủ Đề cho biết cái này).
export const TOPICS = {
  animal: '🐾 Con vật', food: '🍜 Ăn uống', object: '🧸 Đồ vật', vehicle: '🚗 Xe cộ', job: '🧑‍🍳 Nghề nghiệp & nhân vật',
  action: '🏃 Hành động', sport: '⚽ Thể thao & giải trí', nature: '🌿 Thiên nhiên', place: '🏛️ Nơi chốn', vn: '🏮 Việt Nam',
};

export const DIFF = { 1: { name: 'Dễ', icon: '🟢', m: 1 }, 2: { name: 'Vừa', icon: '🟡', m: 1.3 }, 3: { name: 'Khó', icon: '🔴', m: 1.6 } };
export const GOLD_MULT = 2;

// Biến cố cọ vẽ. m = hệ số điểm bù (khó hơn thì nhiều điểm hơn), bot: dùng được khi bot vẽ,
// rule = ràng buộc server kiểm tra (mono: chỉ đen/tẩy, broom: chỉ cọ to nhất, strokes: tổng số nét, noFill, noUndo).
export const EVENTS = {
  mirror: { icon: '🪞', name: 'Gương Thần', desc: 'Người đoán thấy tranh bị lật ngược trái–phải.', m: 1.2, bot: true },
  fade: { icon: '👻', name: 'Mực Phai', desc: 'Nét vẽ mờ dần rồi biến mất sau vài giây. Không có xô tô màu.', m: 1.3, rule: { noFill: true } },
  three: { icon: '✌️', name: 'Ba Nét', desc: 'Cả lượt chỉ được 3 nét (tô màu cũng tính 1 nét), không hoàn tác, không xoá.', m: 1.5, rule: { strokes: 3, noUndo: true } },
  mono: { icon: '⚫', name: 'Đơn Sắc', desc: 'Chỉ có bút đen và cục tẩy, không tô màu.', m: 1.1, rule: { mono: true, noFill: true } },
  shaky: { icon: '〰️', name: 'Bút Run', desc: 'Tay hoạ sĩ run bần bật — nét nào cũng lượn sóng.', m: 1.2 },
  torch: { icon: '🔦', name: 'Đèn Pin', desc: 'Người đoán chỉ thấy vùng sáng quanh đầu bút.', m: 1.4 },
  blind: { icon: '🙈', name: 'Vẽ Mù', desc: 'Hoạ sĩ không nhìn thấy tranh của mình, chỉ thấy đầu bút.', m: 1.3 },
  spin: { icon: '🌀', name: 'Chong Chóng', desc: 'Tranh xoay tròn chầm chậm trước mắt người đoán.', m: 1.2, bot: true },
  rush: { icon: '⚡', name: 'Nhanh Tay', desc: 'Chỉ còn 60% thời gian, bù lại điểm ×1.5.', m: 1.5, bot: true, time: 0.6 },
  broom: { icon: '🧹', name: 'Chổi Lớn', desc: 'Chỉ dùng được cọ to nhất.', m: 1.2, rule: { broom: true } },
};
export const EVENT_CHANCE = 0.5;         // mỗi lượt (trừ lượt đầu) có 50% bốc 1 biến cố

// Vật phẩm cho người đang đoán: trả bằng điểm, mỗi món 1 lần mỗi lượt.
export const ITEMS = {
  peek: { icon: '🔍', name: 'Soi Chữ', cost: 40, desc: 'Mở thêm 1 chữ cái — chỉ mình bạn thấy.' },
  topic: { icon: '🏷️', name: 'Xem Chủ Đề', cost: 20, desc: 'Biết từ thuộc chủ đề nào — chỉ mình bạn thấy.' },
  smoke: { icon: '💨', name: 'Bom Khói', cost: 60, desc: 'Phủ khói lên tranh của mọi người đang đoán khác trong 6 giây.' },
  bet: { icon: '🎲', name: 'Đặt Cược', cost: 50, desc: 'Trả trước 50 điểm: đoán ra trong lượt này thì điểm đoán ×2.' },
};
export const SMOKE_MS = 6000;

export const REACTS = { like: '👍', love: '❤️', lol: '😂', wow: '🤯' };
export const REACT_PTS = 15;             // mỗi lượt thả cảm xúc = +15 cho hoạ sĩ

export const T = { intro: 2500, choose: 15000, reveal: 5500, revealVote: 8000, allIn: 1500, fadeMs: 3500, fadeOut: 1500, idleMin: 20000, idleFrac: 0.35 };

// ---------- mô hình nét vẽ (server và client chạy cùng một hàm) ----------
// M = { items: [...], open: { [ghế]: true } }. Phần tử: nét { p, c, w, d: [x, y, x, y...], at } hoặc tô màu { p, f: màu, x, y, at }.
// ops: ['s', c, w, x, y] bắt đầu nét · ['l', x, y, x, y...] vẽ tiếp nét đang mở của ghế p · ['f', c, x, y] tô màu
//      ['u'] hoàn tác phần tử cuối của p · ['c'] xoá hết phần của p.
// rule (chỉ server dùng để chặn): { mono, broom, noFill, noUndo, left: số nét còn lại (sửa tại chỗ) }.
export const LIMITS = { items: 2500, nums: 60000, perItem: 6000 };
const isXY = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x <= W && y <= H;
const lastOf = (M, p) => { for (let i = M.items.length - 1; i >= 0; i--) if (M.items[i].p === p) return i; return -1; };

export function applyOps(M, p, ops, now, rule = null) {
  if (!Array.isArray(ops)) return 'Dữ liệu nét vẽ hỏng';
  for (const op of ops) {
    if (!Array.isArray(op)) return 'Dữ liệu nét vẽ hỏng';
    const k = op[0];
    if (k === 's' || k === 'f') {
      const [, c, a, b, d] = op;
      if (!(Number.isInteger(c) && c >= 0 && c < PALETTE.length)) return 'Màu lạ';
      if (rule) {
        if (rule.mono && c !== BLACK && c !== WHITE) return 'Đơn Sắc: chỉ được dùng bút đen';
        if (rule.left != null && rule.left <= 0) return 'Hết nét rồi!';
        if (M.items.length >= LIMITS.items) return 'Tranh đã kín chỗ';
      }
      if (k === 's') {
        if (!(Number.isInteger(a) && a >= 0 && a < SIZES.length) || !isXY(b, d)) return 'Nét vẽ lạ';
        if (rule && rule.broom && a !== SIZES.length - 1) return 'Chổi Lớn: chỉ dùng cọ to nhất';
        M.items.push({ p, c, w: a, d: [b, d], at: now });
        M.open[p] = true;
      } else {
        if (!isXY(a, b)) return 'Vị trí tô lạ';
        if (rule && rule.noFill) return 'Lượt này không được tô màu';
        M.items.push({ p, f: c, x: a, y: b, at: now });
        M.open[p] = false;
      }
      if (rule && rule.left != null) rule.left--;
    } else if (k === 'l') {
      const i = lastOf(M, p), it = M.items[i];
      if (!M.open[p] || !it || !it.d) return 'Chưa bắt đầu nét';
      if ((op.length - 1) % 2) return 'Nét vẽ lạ';
      if (rule && it.d.length + op.length > LIMITS.perItem) return 'Nét quá dài — nhấc bút lên vẽ nét mới nhé';
      for (let j = 1; j < op.length; j += 2) {
        if (!isXY(op[j], op[j + 1])) return 'Nét vẽ lạ';
        it.d.push(op[j], op[j + 1]);
      }
      it.at = now;
    } else if (k === 'u' || k === 'c') {
      if (rule && rule.noUndo) return 'Lượt này không được hoàn tác/xoá';
      if (k === 'u') { const i = lastOf(M, p); if (i >= 0) M.items.splice(i, 1); }
      else M.items = M.items.filter(it => it.p !== p);
      M.open[p] = false;
    } else return 'Thao tác lạ';
  }
  return null;
}
export const inkSize = M => M.items.reduce((s, it) => s + (it.d ? it.d.length : 3), 0);

// ---------- so đáp án ----------
// Bỏ dấu, hoa/thường, ký tự lạ; "đ" → "d". Trả về chuỗi các từ cách nhau 1 dấu cách.
export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
const CLASSIFIERS = ['con', 'cai', 'chiec', 'qua', 'trai', 'cu', 'la', 'nguoi'];
const strip = s => { const w = s.split(' '); return w.length > 1 && CLASSIFIERS.includes(w[0]) ? w.slice(1).join(' ') : s; };
const tight = s => s.replace(/ /g, '');
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// 'hit' = đúng, 'near' = gần đúng, null = sai. Gõ thêm/bớt lượng từ (con, cái, quả...) vẫn tính đúng.
export function judge(guess, answer) {
  const g = norm(guess), a = norm(answer);
  if (!g) return null;
  const gs = [tight(g), tight(strip(g))], as = [tight(a), tight(strip(a))];
  if (gs.some(x => as.includes(x))) return 'hit';
  const A = as[0];
  for (const x of gs) {
    const d = lev(x, A);
    if ((A.length >= 4 && d <= 1) || (A.length >= 9 && d <= 2)) return 'near';
  }
  if (gs[0].length >= 3 && A.includes(gs[0]) && gs[0].length >= A.length * 0.5) return 'near';
  return null;
}
// Tin nhắn có lộ đáp án không (người vẽ / người đã đoán ra không được gõ đáp án).
export function leaks(text, answer) {
  const t = ' ' + norm(text) + ' ', a = norm(answer);
  return t.includes(' ' + a + ' ') || tight(t).includes(tight(a)) && tight(a).length >= 4 || judge(text, answer) === 'hit';
}
export const isLetter = ch => /[\p{L}\p{N}]/u.test(ch);
