// 💎 Splendor — dữ liệu dùng chung server + client: ngọc, bộ thẻ, quý tộc, năng lực/sự kiện/mục tiêu (Bất Ngờ),
// cách tính giá, thời lượng animation. Không có logic ẩn ở đây (luật + bot nằm trong server.js để không lộ chồng thẻ).

// 5 màu ngọc + vàng (o). Thứ tự này dùng cho mọi bảng hiển thị.
export const COLORS = ['w', 'u', 'g', 'r', 'k'];
export const GEMS = {
  w: { name: 'Kim Cương', short: 'trắng', color: '#f4f1ea', ink: '#5b564d' },
  u: { name: 'Lam Ngọc', short: 'lam', color: '#2f6fd1', ink: '#fff' },
  g: { name: 'Lục Bảo', short: 'lục', color: '#1f9a5a', ink: '#fff' },
  r: { name: 'Hồng Ngọc', short: 'đỏ', color: '#d43a3a', ink: '#fff' },
  k: { name: 'Mã Não', short: 'đen', color: '#3b3433', ink: '#fff' },
  o: { name: 'Vàng', short: 'vàng', color: '#e8b923', ink: '#5a4300' },
};
export const LEVEL_NAME = ['', 'Mỏ', 'Thương thuyền', 'Cửa hiệu'];

// Số ngọc mỗi màu theo số người; vàng; số quý tộc = người + 1; số thẻ lật mỗi cấp.
export const SUPPLY = n => ({ gem: { 2: 4, 3: 5, 4: 7, 5: 8, 6: 9 }[n] || 7, gold: n >= 5 ? 6 : 5, nobles: n + 1, slots: n >= 5 ? 5 : 4 });
export const MAX_GEMS = 10, MAX_RES = 3;

// Mẫu giá thẻ theo cấp: [độ lệch màu so với màu thưởng (0 = chính màu đó), số ngọc], điểm. Mỗi màu thưởng dùng đủ bộ mẫu
// (xoay vòng màu) → cấp 1: 8 mẫu × 5 = 40 thẻ, cấp 2: 6 × 5 = 30, cấp 3: 4 × 5 = 20 — như bộ thẻ gốc.
const PATTERNS = {
  1: [
    [[[1, 1], [2, 1], [3, 1], [4, 1]], 0], [[[1, 1], [2, 2], [3, 1], [4, 1]], 0], [[[1, 2], [2, 2], [4, 1]], 0], [[[0, 1], [3, 3], [4, 1]], 0],
    [[[2, 2], [4, 1]], 0], [[[1, 2], [3, 2]], 0], [[[2, 3]], 0], [[[3, 4]], 1],
  ],
  2: [
    [[[1, 3], [2, 2], [3, 2]], 1], [[[0, 2], [1, 3], [3, 3]], 1], [[[2, 1], [3, 4], [4, 2]], 2],
    [[[2, 5]], 2], [[[1, 5], [4, 3]], 2], [[[0, 6]], 3],
  ],
  3: [
    [[[1, 3], [2, 3], [3, 5], [4, 3]], 3], [[[3, 7]], 4], [[[0, 3], [3, 6], [4, 3]], 4], [[[0, 3], [3, 7]], 5],
  ],
};
// 5–6 người mua nhiều thẻ hơn hẳn → thêm bản sao vài mẫu rẻ (cấp 1: 4 mẫu, cấp 2: 2 mẫu mỗi màu) để chồng không cạn giữa ván.
const EXTRA = { 1: [0, 1, 4, 5], 2: [0, 3], 3: [] };
export function buildCards(players = 4) {
  const out = { 1: [], 2: [], 3: [] };
  for (const lv of [1, 2, 3]) {
    const pats = players >= 5 ? PATTERNS[lv].concat(EXTRA[lv].map(i => PATTERNS[lv][i])) : PATTERNS[lv];
    COLORS.forEach((c, i) => {
      for (const [parts, pts] of pats) {
        const cost = {};
        for (const [off, n] of parts) cost[COLORS[(i + off) % 5]] = n;
        out[lv].push({ lv, c, pts, cost });
      }
    });
  }
  return out;
}

// Quý tộc: 4+4 của hai màu kề nhau hoặc 3+3+3 của ba màu liên tiếp → 10 vị, mỗi vị 3 điểm.
export const NOBLE_NAMES = ['Bá tước Lorenzo', 'Nữ hầu tước Isabella', 'Công tước Medici', 'Phu nhân Catarina', 'Hoàng thân Alessandro',
  'Giáo chủ Borgia', 'Nữ bá tước Beatrice', 'Lãnh chúa Sforza', 'Vương phi Eleonora', 'Thái tử Federico'];
export function buildNobles() {
  const out = [];
  COLORS.forEach((c, i) => out.push({ req: { [c]: 4, [COLORS[(i + 1) % 5]]: 4 } }));
  COLORS.forEach((c, i) => out.push({ req: { [c]: 3, [COLORS[(i + 1) % 5]]: 3, [COLORS[(i + 2) % 5]]: 3 } }));
  return out.map((n, i) => ({ ...n, name: NOBLE_NAMES[i], pts: 3 }));
}

// ---------- Bất Ngờ ----------
// Năng lực thẻ (kích hoạt khi MUA thẻ — giữ chỗ thì chưa). Số lượng mỗi cấp nằm trong ABILITY_POOL.
export const ABILITIES = {
  mine:   { icon: '⛏️', name: 'Mỏ Lộ Thiên', desc: 'Mua xong nhận ngay ngọc cùng màu thẻ: cấp 1 được 1 viên, cấp 2 được 2 viên (nếu ngân hàng còn).' },
  double: { icon: '💠', name: 'Song Ngọc', desc: 'Thẻ này giảm giá 2 ngọc màu của nó thay vì 1 (và tính là 2 thẻ khi quý tộc xét).' },
  prism:  { icon: '🌈', name: 'Lăng Kính', desc: 'Từ nay mỗi lần mua thẻ được giảm thêm 1 ngọc màu bất kỳ.' },
  again:  { icon: '⏩', name: 'Thêm Lượt', desc: 'Mua xong được đi thêm một lượt nữa ngay.' },
  gift:   { icon: '🎁', name: 'Quà Tặng', desc: 'Mua xong được lấy miễn phí 1 thẻ cấp thấp hơn đang lật trên bàn (thẻ quà không kích hoạt năng lực).' },
  steal:  { icon: '🗡️', name: 'Kẻ Cắp', desc: 'Mua xong chọn 1 người và 1 màu: lấy của họ ngọc màu đó (cấp 1: 1 viên, cấp 2: 2 viên). Không lấy được vàng.' },
  snatch: { icon: '🪝', name: 'Móc Túi', desc: 'Mua xong cướp 1 thẻ đang giữ chỗ của người khác về chỗ giữ của bạn (bạn phải còn chỗ trống).' },
  tax:    { icon: '💸', name: 'Thu Thuế', desc: 'Mua xong, mỗi người khác đang có từ 5 ngọc trở lên phải nộp cho bạn 1 viên (màu họ nhiều nhất).' },
};
export const ABILITY_POOL = {
  1: ['mine', 'mine', 'mine', 'mine', 'steal', 'steal', 'steal', 'double', 'double', 'tax'],
  2: ['mine', 'mine', 'double', 'double', 'steal', 'snatch', 'snatch', 'tax', 'tax', 'gift', 'gift', 'prism', 'again'],
  3: ['again', 'again', 'gift', 'prism', 'snatch'],
};

// Quyền lợi riêng của quý tộc (Bất Ngờ) — nhận ngay khi quý tộc ghé thăm.
export const PERKS = {
  pts:   { icon: '⭐', name: 'Danh Vọng', desc: '+1 điểm (quý tộc này đáng 4 điểm).' },
  gold:  { icon: '🪙', name: 'Ban Thưởng', desc: 'Nhận 2 vàng (nếu ngân hàng còn).' },
  prism: { icon: '🌈', name: 'Bảo Trợ', desc: 'Từ nay mỗi lần mua thẻ được giảm thêm 1 ngọc màu bất kỳ.' },
  again: { icon: '🍷', name: 'Yến Tiệc', desc: 'Được đi thêm một lượt ngay.' },
  gems:  { icon: '💎', name: 'Quà Ra Mắt', desc: 'Nhận 3 ngọc khác màu (những màu ngân hàng còn nhiều nhất).' },
};
export const PERK_KEYS = Object.keys(PERKS);

// Sự kiện mỗi vòng bàn (Bất Ngờ): đầu mỗi vòng bốc 1, hết túi thì xáo lại. color = sự kiện kèm 1 màu ngẫu nhiên.
export const EVENTS = {
  calm:    { icon: '🌤️', name: 'Trời Yên Biển Lặng', desc: 'Không có gì đặc biệt. Tận hưởng đi...' },
  fair:    { icon: '🎪', name: 'Hội Chợ', desc: 'Lấy ngọc khác màu được tới 4 viên thay vì 3.' },
  plenty:  { icon: '✌️', name: 'Mỏ Dồi Dào', desc: 'Lấy 2 ngọc cùng màu chỉ cần chồng còn từ 2 viên (thay vì 4).' },
  drought: { icon: '🏜️', name: 'Hạn Hán', desc: 'Không ai được lấy 2 ngọc cùng màu.' },
  storm:   { icon: '🌪️', name: 'Bão Giá', color: true, desc: 'Thẻ nào giá có ngọc {c} thì phải trả thêm 1 viên {c}.' },
  sale:    { icon: '🏷️', name: 'Giảm Giá', desc: 'Mỗi thẻ mua trong vòng này rẻ đi 1 ngọc màu bất kỳ.' },
  rain:    { icon: '🌧️', name: 'Mưa Vàng', desc: 'Giữ chỗ trong vòng này nhận 2 vàng thay vì 1.' },
  banquet: { icon: '👑', name: 'Dạ Tiệc Quý Tộc', desc: 'Quý tộc chấp nhận ghé thăm dù bạn còn thiếu 1 thẻ.' },
  tax:     { icon: '⚖️', name: 'Thuế Thân', desc: 'Đầu vòng, ai giữ từ 7 ngọc trở lên phải nộp 2 viên về ngân hàng (màu nhiều nhất).' },
  rush:    { icon: '🏃', name: 'Cơn Sốt', desc: 'Mỗi thẻ mua trong vòng này được thêm 1 điểm.' },
  market:  { icon: '🔄', name: 'Chợ Phiên', desc: 'Đầu vòng, toàn bộ thẻ cấp 1 đang lật bị thay bằng thẻ mới.' },
};
export const EVENT_KEYS = Object.keys(EVENTS);
export const eventText = (key, color) => {
  const E = EVENTS[key];
  return E ? E.desc.replaceAll('{c}', color ? GEMS[color].name : '?') : '';
};

// Mục tiêu bí mật (Bất Ngờ): mỗi người nhận 1, chỉ mình thấy; cuối ván đạt thì cộng điểm.
// k = loại, c = màu (với loại 'color'). Hàm check(pl) dùng chung để client hiện tiến độ cho chủ mục tiêu.
export const OBJECTIVES = [
  ...COLORS.map(c => ({ k: 'color', c, pts: 3 })),
  { k: 'rainbow', pts: 3 }, { k: 'lords', pts: 3 }, { k: 'elite', pts: 3 }, { k: 'humble', pts: 2 },
  { k: 'empire', pts: 3 }, { k: 'hoard', pts: 2 }, { k: 'collector', pts: 3 },
];
const countLv = (pl, lv) => pl.cards.filter(c => c.lv === lv).length;
export function objInfo(o, pl) {
  switch (o.k) {
    case 'color': { const n = pl.cards.filter(c => c.c === o.c).length; return { icon: '🎯', name: `Chuyên ${GEMS[o.c].name}`, desc: `Có ít nhất 5 thẻ ${GEMS[o.c].name}.`, have: n, need: 5 }; }
    case 'rainbow': return { icon: '🌈', name: 'Đa Sắc', desc: 'Có ít nhất 2 thẻ mỗi màu.', have: Math.min(...COLORS.map(c => Math.min(2, pl.cards.filter(x => x.c === c).length))) , need: 2 };
    case 'lords': return { icon: '🤝', name: 'Bạn Của Quý Tộc', desc: 'Được ít nhất 2 quý tộc ghé thăm.', have: pl.nobles.length, need: 2 };
    case 'elite': return { icon: '🏛️', name: 'Thượng Lưu', desc: 'Có ít nhất 2 thẻ cấp 3.', have: countLv(pl, 3), need: 2 };
    case 'humble': return { icon: '⛏️', name: 'Gốc Gác Thợ Mỏ', desc: 'Có ít nhất 7 thẻ cấp 1.', have: countLv(pl, 1), need: 7 };
    case 'empire': return { icon: '🏰', name: 'Đế Chế', desc: 'Có ít nhất 12 thẻ.', have: pl.cards.length, need: 12 };
    case 'hoard': return { icon: '🪙', name: 'Phú Hộ', desc: 'Hết ván còn giữ ít nhất 3 vàng.', have: pl.gems.o, need: 3 };
    case 'collector': return { icon: '🧰', name: 'Nhà Sưu Tầm', desc: 'Có ít nhất 3 thẻ có năng lực.', have: pl.cards.filter(c => c.ab).length, need: 3 };
  }
  return { icon: '❓', name: '?', desc: '', have: 0, need: 1 };
}
export const objDone = (o, pl) => { const i = objInfo(o, pl); return i.have >= i.need; };

// ---------- Tính giá ----------
// Giảm giá của người chơi theo màu (Song Ngọc tính 2).
export function bonusOf(pl) {
  const b = { w: 0, u: 0, g: 0, r: 0, k: 0 };
  for (const c of pl.cards) b[c.c] += c.ab === 'double' ? 2 : 1;
  return b;
}
export const gemCount = g => COLORS.reduce((s, c) => s + (g[c] || 0), 0) + (g.o || 0);
// Số ngọc "bất kỳ" được giảm khi mua: Lăng Kính/Bảo Trợ + sự kiện Giảm Giá.
export const wildOf = (st, pl) => (pl.prism || 0) + (st.event === 'sale' ? 1 : 0);

// Giá thật người chơi phải trả cho thẻ: { pay: {màu: n, o: vàng}, ok, short } — tự trả bằng ngọc màu trước, thiếu thì vàng.
// Giảm giá "bất kỳ" được dùng vào màu đang thiếu nhiều nhất trước (đỡ tốn vàng), không thiếu thì màu cần nhiều nhất.
export function priceOf(st, pl, card) {
  const b = bonusOf(pl), need = {};
  for (const c of COLORS) {
    let v = card.cost[c] || 0;
    if (v && st.event === 'storm' && st.evColor === c) v++;
    need[c] = Math.max(0, v - b[c]);
  }
  for (let w = wildOf(st, pl); w > 0; w--) {
    let best = null, bs = 0;
    for (const c of COLORS) { const s = need[c] - (pl.gems[c] || 0); if (need[c] > 0 && (best === null || s > bs || (s === bs && need[c] > need[best]))) { best = c; bs = s; } }
    if (best === null) break;
    need[best]--;
  }
  const pay = { o: 0 };
  for (const c of COLORS) {
    const use = Math.min(need[c], pl.gems[c] || 0);
    if (use) pay[c] = use;
    pay.o += need[c] - use;
  }
  return { pay, ok: pay.o <= (pl.gems.o || 0), short: Math.max(0, pay.o - (pl.gems.o || 0)) };
}

// Quý tộc chịu ghé thăm không (Dạ Tiệc Quý Tộc: được thiếu 1 thẻ).
export function nobleShort(pl, n) {
  const b = bonusOf(pl);
  return COLORS.reduce((s, c) => s + Math.max(0, (n.req[c] || 0) - b[c]), 0);
}
export const nobleOk = (st, pl, n) => nobleShort(pl, n) <= (st.event === 'banquet' ? 1 : 0);

// Thời lượng animation phía client (ms) — hub chờ hết rồi mới cho bot/hẹn giờ chạy tiếp.
export const DUR = {
  start: 400, round: 1900, take: 750, buy: 1150, reserve: 950, noble: 1700, discard: 650, steal: 1000, snatch: 1000, tax: 1000,
  mine: 750, gift: 1000, perk: 800, extra: 700, last: 1600, refresh: 1100, evtax: 900, pass: 400, fizzle: 400, reveal: 3200, over: 1500,
};
export const animDuration = evs => evs.reduce((t, e) => t + (DUR[e.t] || 0), 0);
