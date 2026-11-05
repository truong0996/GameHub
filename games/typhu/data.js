// 🎩 Cờ Tỷ Phú — dữ liệu dùng chung server + client: bàn cờ, thẻ, biến cố, tính tiền thuê/tài sản, thời lượng animation.
// Không có gì bí mật ở đây (thứ tự chồng thẻ nằm trong state và bị view() ẩn).

export const SEATS = [
  { name: 'Đỏ', color: '#e5383b', label: '🚗' }, { name: 'Lam', color: '#2f7dea', label: '🎩' },
  { name: 'Lục', color: '#22a04b', label: '🐶' }, { name: 'Vàng', color: '#f2b705', label: '🚢' },
  { name: 'Tím', color: '#9b5de5', label: '🐱' }, { name: 'Cam', color: '#f3722c', label: '🦖' },
];

export const START_CASH = 1500, SALARY = 200, BAIL = 50, MIN_BID = 10, HAND_MAX = 2, EVENT_EVERY = 3, BUYOUT_X = 2;

// Nhóm màu: c = màu dải, hc = giá xây 1 nhà (khách sạn = nhà thứ 5).
export const GROUPS = {
  br: { name: 'Nâu', c: '#8b5a3c', hc: 50 }, lb: { name: 'Xanh nhạt', c: '#7cc8ec', hc: 50 },
  pk: { name: 'Hồng', c: '#d6409f', hc: 100 }, or: { name: 'Cam', c: '#f39c12', hc: 100 },
  rd: { name: 'Đỏ', c: '#e0413a', hc: 150 }, yl: { name: 'Vàng', c: '#f1c40f', hc: 150 },
  gn: { name: 'Lục', c: '#27ae60', hc: 200 }, db: { name: 'Lam', c: '#2c5ea8', hc: 200 },
};

const P = (g, name, price, rent) => ({ k: 'p', g, name, price, rent });
// rent = [không nhà, 1, 2, 3, 4 nhà, khách sạn] — số liệu theo bản gốc.
const CLASSIC = [
  { k: 'go', name: 'Xuất Phát' }, P('br', 'Cairo', 60, [2, 10, 30, 90, 160, 250]), { k: 'cc', name: 'Khí Vận' },
  P('br', 'Lima', 60, [4, 20, 60, 180, 320, 450]), { k: 'tax', name: 'Thuế Thu Nhập', amt: 200 }, { k: 'r', name: 'Sân bay Changi', price: 200 },
  P('lb', 'Bangkok', 100, [6, 30, 90, 270, 400, 550]), { k: 'ch', name: 'Cơ Hội' }, P('lb', 'Manila', 100, [6, 30, 90, 270, 400, 550]),
  P('lb', 'Jakarta', 120, [8, 40, 100, 300, 450, 600]), { k: 'jail', name: 'Nhà Tù' },
  P('pk', 'Mumbai', 140, [10, 50, 150, 450, 625, 750]), { k: 'u', name: 'Điện Lực', price: 150, icon: '⚡' },
  P('pk', 'Istanbul', 140, [10, 50, 150, 450, 625, 750]), P('pk', 'Mexico', 160, [12, 60, 180, 500, 700, 900]),
  { k: 'r', name: 'Sân bay Heathrow', price: 200 }, P('or', 'Rome', 180, [14, 70, 200, 550, 750, 950]), { k: 'cc', name: 'Khí Vận' },
  P('or', 'Madrid', 180, [14, 70, 200, 550, 750, 950]), P('or', 'Berlin', 200, [16, 80, 220, 600, 800, 1000]), { k: 'park', name: 'Bãi Đỗ Xe' },
  P('rd', 'Sydney', 220, [18, 90, 250, 700, 875, 1050]), { k: 'ch', name: 'Cơ Hội' }, P('rd', 'Toronto', 220, [18, 90, 250, 700, 875, 1050]),
  P('rd', 'Seoul', 240, [20, 100, 300, 750, 925, 1100]), { k: 'r', name: 'Sân bay Narita', price: 200 },
  P('yl', 'Dubai', 260, [22, 110, 330, 800, 975, 1150]), P('yl', 'Singapore', 260, [22, 110, 330, 800, 975, 1150]),
  { k: 'u', name: 'Nhà Máy Nước', price: 150, icon: '💧' }, P('yl', 'Hồng Kông', 280, [24, 120, 360, 850, 1025, 1200]), { k: 'tojail', name: 'Vào Tù' },
  P('gn', 'Paris', 300, [26, 130, 390, 900, 1100, 1275]), P('gn', 'London', 300, [26, 130, 390, 900, 1100, 1275]), { k: 'cc', name: 'Khí Vận' },
  P('gn', 'Tokyo', 320, [28, 150, 450, 1000, 1200, 1400]), { k: 'r', name: 'Sân bay JFK', price: 200 }, { k: 'ch', name: 'Cơ Hội' },
  P('db', 'Zurich', 350, [35, 175, 500, 1100, 1300, 1500]), { k: 'tax', name: 'Thuế Xa Xỉ', amt: 100 }, P('db', 'New York', 400, [50, 200, 600, 1400, 1700, 2000]),
];
// Chế độ Bất Ngờ thay vài ô bằng ô đặc biệt; Bãi Đỗ Xe thành Hũ Vàng (gom tiền thuế/phạt).
const CHAOS = CLASSIC.map((c, i) => ({
  12: { k: 'portal', name: 'Cổng Dịch Chuyển' }, 28: { k: 'portal', name: 'Cổng Dịch Chuyển' },
  17: { k: 'casino', name: 'Sòng Bạc' }, 22: { k: 'train', name: 'Tàu Cao Tốc' }, 38: { k: 'stock', name: 'Sàn Chứng Khoán' },
  20: { k: 'park', name: 'Hũ Vàng' },
}[i] || c));
export const boardOf = chaos => (chaos ? CHAOS : CLASSIC);
export const KIND_ICON = { go: '🏁', cc: '📦', ch: '❓', tax: '💸', r: '✈️', jail: '🔒', park: '🅿️', tojail: '🚓', portal: '🌀', casino: '🎰', train: '🚄', stock: '📈' };
export const cellIcon = (c, chaos) => (c.k === 'park' && chaos ? '🍯' : c.icon || KIND_ICON[c.k] || '');
export const isProp = c => c.k === 'p' || c.k === 'r' || c.k === 'u';

// Thẻ Cơ Hội / Khí Vận. classic: chỉ có ở Cổ điển, chaos: chỉ có ở Bất Ngờ.
export const CARDS = {
  ch: [
    { text: 'Tiến thẳng về XUẤT PHÁT.', go: 0 },
    { text: 'Bay tới Seoul.', go: 24 },
    { text: 'Bay tới Mumbai.', go: 11 },
    { text: 'Tới sân bay gần nhất. Có chủ thì trả GẤP ĐÔI tiền thuê.', near: 'r' },
    { text: 'Tới sân bay gần nhất. Có chủ thì trả GẤP ĐÔI tiền thuê.', near: 'r' },
    { text: 'Tới công ty gần nhất.', near: 'u', classic: 1 },
    { text: 'Ngân hàng trả cổ tức: nhận $50.', gain: 50 },
    { text: '🔑 Thẻ Ra Tù — giữ lại, dùng khi bị nhốt.', jailcard: 1 },
    { text: 'Lùi lại 3 ô.', back: 3 },
    { text: 'Vào tù! Đi thẳng, không qua Xuất Phát.', jail: 1 },
    { text: 'Sửa chữa nhà cửa: $25 mỗi nhà, $100 mỗi khách sạn.', repair: [25, 100] },
    { text: 'Phạt chạy quá tốc độ: $15.', pay: 15 },
    { text: 'Bay tới sân bay Changi.', go: 5 },
    { text: 'Dạo phố New York.', go: 39 },
    { text: 'Được bầu làm chủ tịch hội đồng: trả mỗi người $50.', payEach: 50 },
    { text: 'Khoản vay xây dựng đáo hạn: nhận $150.', gain: 150 },
    { text: 'Nhận 1 thẻ kỹ năng!', skill: 1, chaos: 1 },
    { text: 'Hộp quà bí ẩn!', mystery: 1, chaos: 1 },
    { text: 'Vé tàu cao tốc miễn phí: đi tới ô bất kỳ!', train: 1, chaos: 1 },
  ],
  cc: [
    { text: 'Tiến thẳng về XUẤT PHÁT.', go: 0 },
    { text: 'Ngân hàng nhầm lẫn có lợi cho bạn: nhận $200.', gain: 200 },
    { text: 'Tiền khám bệnh: trả $50.', pay: 50 },
    { text: 'Bán cổ phiếu: nhận $50.', gain: 50 },
    { text: '🔑 Thẻ Ra Tù — giữ lại, dùng khi bị nhốt.', jailcard: 1 },
    { text: 'Vào tù! Đi thẳng, không qua Xuất Phát.', jail: 1 },
    { text: 'Quỹ nghỉ lễ đáo hạn: nhận $100.', gain: 100 },
    { text: 'Hoàn thuế thu nhập: nhận $20.', gain: 20 },
    { text: 'Sinh nhật bạn! Mỗi người tặng $10.', collectEach: 10 },
    { text: 'Bảo hiểm nhân thọ đáo hạn: nhận $100.', gain: 100 },
    { text: 'Viện phí: trả $100.', pay: 100 },
    { text: 'Học phí: trả $50.', pay: 50 },
    { text: 'Phí tư vấn: nhận $25.', gain: 25 },
    { text: 'Sửa đường: $40 mỗi nhà, $115 mỗi khách sạn.', repair: [40, 115] },
    { text: 'Giải nhì cuộc thi sắc đẹp: nhận $10.', gain: 10 },
    { text: 'Được thừa kế: nhận $100.', gain: 100 },
    { text: 'Nhận 1 thẻ kỹ năng!', skill: 1, chaos: 1 },
    { text: 'Nhận 1 thẻ kỹ năng!', skill: 1, chaos: 1 },
    { text: 'Trúng xổ số bí ẩn!', mystery: 1, chaos: 1 },
  ],
};
export const DECK_NAME = { ch: '❓ Cơ Hội', cc: '📦 Khí Vận' };
export const MYSTERY = [0, 50, 100, 150, 200, 300];

// Thẻ kỹ năng (Bất Ngờ). pre: dùng trước khi đổ xúc xắc. w: tỉ lệ rút.
export const SKILLS = {
  dice: { icon: '🎯', name: 'Chọn Xúc Xắc', desc: 'Trước khi đổ: tự chọn tổng điểm 2–12 (không tính là đổ đôi).', pre: 1, w: 3 },
  swap: { icon: '🔀', name: 'Đổi Chỗ', desc: 'Trước khi đổ: đổi vị trí với một người chơi khác (không ai bị tính là dừng ô mới).', pre: 1, w: 2 },
  bomb: { icon: '💣', name: 'Phá Nhà', desc: 'Trước khi đổ: phá 1 nhà (hoặc hạ khách sạn) trên đất của đối thủ.', pre: 1, w: 2 },
  fest: { icon: '🎉', name: 'Lễ Hội', desc: 'Trước khi đổ: mở lễ hội ở 1 ô đất của bạn — tiền thuê ô đó ×2. Mỗi người chỉ có 1 lễ hội.', pre: 1, w: 2 },
  shield: { icon: '🛡️', name: 'Miễn Thuê', desc: 'Khi phải trả tiền thuê: được miễn, không mất đồng nào.', w: 2 },
};
export const SKILL_BAG = Object.entries(SKILLS).flatMap(([k, s]) => Array(s.w).fill(k));

// Biến cố toàn bàn (Bất Ngờ) — mỗi EVENT_EVERY vòng một lần, hiệu lực trong vòng đó.
export const EVENTS = {
  storm: { icon: '🌪️', name: 'Bão Lớn', desc: 'Tối đa 3 ô có nhà, mỗi ô sập 1 nhà.' },
  crisis: { icon: '📉', name: 'Khủng Hoảng', desc: 'Vòng này tiền thuê chỉ còn một nửa.' },
  tour: { icon: '✈️', name: 'Mùa Du Lịch', desc: 'Vòng này tiền thuê một nhóm màu ×2.' },
  robin: { icon: '🏹', name: 'Robin Hood', desc: 'Người giàu nhất trả $200 cho người nghèo nhất.' },
  bonus: { icon: '🧧', name: 'Thưởng Tết', desc: 'Vòng này qua Xuất Phát nhận $400.' },
  cards: { icon: '🃏', name: 'Mưa Thẻ', desc: 'Mỗi người nhận 1 thẻ kỹ năng.' },
  cheap: { icon: '🏗️', name: 'Giảm Giá Xây', desc: 'Vòng này xây nhà chỉ tốn nửa giá.' },
  flash: { icon: '🔨', name: 'Đấu Giá Chớp Nhoáng', desc: 'Một lô đất chưa có chủ được đem ra đấu giá ngay.' },
  tax: { icon: '🧾', name: 'Thu Thuế', desc: 'Mỗi người nộp 10% tiền mặt vào Hũ Vàng.' },
};

// ---------- tính toán dùng chung ----------
export const groupCells = (chaos, g) => boardOf(chaos).map((c, i) => (c.g === g ? i : -1)).filter(i => i >= 0);
export const hasSet = (st, p, g) => groupCells(st.chaos, g).every(i => st.own[i] === p);
export const setsOf = (st, p) => Object.keys(GROUPS).filter(g => hasSet(st, p, g));
export const countKind = (st, p, k) => boardOf(st.chaos).reduce((n, c, i) => n + (c.k === k && st.own[i] === p ? 1 : 0), 0);
export const evNow = (st, k) => !!st.ev && st.ev.k === k;
export const houseCost = (st, i) => { const g = GROUPS[boardOf(st.chaos)[i].g]; return g ? g.hc / (evNow(st, 'cheap') ? 2 : 1) : 0; };
export const levelValue = (st, i) => { const g = GROUPS[boardOf(st.chaos)[i].g]; return g ? g.hc * st.lv[i] : 0; };
export const buyoutPrice = (st, i) => BUYOUT_X * (boardOf(st.chaos)[i].price + levelValue(st, i));

// Tiền thuê ô i khi có người dừng (dice = tổng xúc xắc, cho công ty).
export function rentOf(st, i, dice = 7) {
  const c = boardOf(st.chaos)[i], o = st.own[i];
  if (o == null) return 0;
  let r;
  if (c.k === 'p') {
    const lv = st.lv[i];
    r = lv ? c.rent[lv] : c.rent[0] * (hasSet(st, o, c.g) ? 2 : 1);
    if (st.players[o].fest === i) r *= 2;
    if (evNow(st, 'tour') && st.ev.g === c.g) r *= 2;
  } else if (c.k === 'r') r = 25 * 2 ** (countKind(st, o, 'r') - 1);
  else if (c.k === 'u') r = dice * (countKind(st, o, 'u') === 2 ? 10 : 4);
  else return 0;
  if (evNow(st, 'crisis')) r = Math.floor(r / 2);
  return r;
}

// Tổng tài sản = tiền + giá đất + giá nhà đã xây + tiền đang đầu tư.
export function worth(st, p) {
  const pl = st.players[p], B = boardOf(st.chaos);
  let w = pl.cash + (pl.stock || 0);
  for (let i = 0; i < 40; i++) if (st.own[i] === p) w += B[i].price + levelValue(st, i);
  return w;
}

// ---------- thời lượng animation phía client (ms) — hub chờ hết rồi mới cho bot/hẹn giờ chạy tiếp ----------
export const STEP_MS = 150;
export const DUR = {
  start: 400, deal: 2200, turn: 150, again: 500, dice: 1000, jump: 800, go: 500, pay: 650, gain: 500, buy: 700, card: 2300,
  skill: 700, use: 1300, build: 450, sell: 500, jail: 1300, free: 700, auction: 700, bid: 0, won: 2000, nobid: 1000,
  buyout: 1600, casino: 1900, invest: 700, dividend: 1300, round: 500, event: 2800, pot: 1300, over: 1500, speed: 900, stay: 700,
};
export const animDuration = evs => evs.reduce((t, e) => t + (e.t === 'move' ? 250 + Math.abs(e.n) * STEP_MS : DUR[e.t] || 0), 0);
