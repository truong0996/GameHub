// Ví credit + đồ trang trí của tài khoản.
// Credit kiếm được KHÔNG lưu: tính lại từ lịch sử ván (stats) theo công thức CREDIT (public/shop-data.js) — đổi công thức là áp dụng
// cho cả lịch sử cũ, như bảng xếp hạng. Chỉ lưu đồ đã mua, đồ đang trang bị và tổng đã tiêu trong <data>/wallet.json.
// Số dư = kiếm được − đã tiêu.
import fs from 'node:fs';
import path from 'node:path';
import { weightOf } from './stats.js';
import { CREDIT, ITEM, WEAR } from '../public/shop-data.js';

const DAY_MS = 86400000;
const TZ_MS = 7 * 3600000;                 // giới hạn mỗi ngày tính theo giờ Việt Nam
export const dayOf = t => Math.floor((t + TZ_MS) / DAY_MS);

// Credit thô của một người trong một ván (chưa áp giới hạn ngày). Ván bỏ dở = 0.
export function creditOf(m, x) {
  if (m.aborted || !x.acct) return 0;
  return Math.round(CREDIT.base * weightOf(m.dur) * (x.rank === 1 ? CREDIT.winMul : 1));
}

export function createWallet(dir, stats) {
  const file = path.join(dir, 'wallet.json');
  let db = { users: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  db.users ||= {};
  // Làm sạch lúc nạp: bỏ id món không còn trong cửa hàng, spent hỏng (NaN/null) thì tính lại theo giá các món đang có.
  for (const u of Object.values(db.users)) {
    u.owned = (Array.isArray(u.owned) ? u.owned : []).filter(id => ITEM[id]);
    u.eq = Object.fromEntries(Object.entries(u.eq || {}).filter(([s, id]) => WEAR.includes(s) && u.owned.includes(id)));
    if (!Number.isFinite(u.spent)) u.spent = u.owned.reduce((n, id) => n + ITEM[id].price, 0);
  }
  function save() {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 1));
    fs.renameSync(file + '.tmp', file);
  }
  const userOf = acct => (db.users[acct] ||= { owned: [], eq: {}, spent: 0 });

  // Tính lại tổng kiếm được khi lịch sử có ván mới (lịch sử chỉ thêm, không sửa).
  let cache = { n: -1, total: new Map(), day: new Map() };
  function earned() {
    const list = stats ? stats.list() : [];
    if (cache.n === list.length) return cache;
    const total = new Map(), day = new Map();   // day: "acct:ngày" → đã nhận trong ngày
    for (const m of list) {
      const d = dayOf(m.at);
      for (const x of m.players || []) {
        const raw = creditOf(m, x);
        if (!raw) continue;
        const k = x.acct + ':' + d, used = day.get(k) || 0, g = Math.max(0, Math.min(raw, CREDIT.dayCap - used));
        day.set(k, used + g);
        total.set(x.acct, (total.get(x.acct) || 0) + g);
      }
    }
    return (cache = { n: list.length, total, day });
  }

  function info(acct, now = Date.now()) {
    const u = db.users[acct] || { owned: [], eq: {}, spent: 0 }, E = earned();
    const got = E.total.get(acct) || 0;
    return { credits: got - u.spent, earned: got, today: E.day.get(acct + ':' + dayOf(now)) || 0, cap: CREDIT.dayCap,
      owned: [...u.owned], eq: { ...u.eq } };
  }

  return {
    info,
    buy(acct, id) {
      const it = ITEM[id];
      if (!it || !Number.isFinite(it.price) || it.price < 0) throw new Error('Món này không có trong cửa hàng');
      const u = userOf(acct);
      if (u.owned.includes(id)) throw new Error('Bạn đã có món này rồi');
      const bal = info(acct).credits;
      if (!(bal >= it.price)) throw new Error(`Chưa đủ credit — còn thiếu ${it.price - bal} 💰`);
      u.owned.push(id);
      u.spent += it.price;
      if (WEAR.includes(it.slot)) u.eq[it.slot] = id;   // mua xong mặc luôn
      save();
      return info(acct);
    },
    // id = null → tháo
    equip(acct, slot, id) {
      if (!WEAR.includes(slot)) throw new Error('Ô trang bị không hợp lệ');
      const u = userOf(acct);
      if (id == null) delete u.eq[slot];
      else {
        const it = ITEM[id];
        if (!it || it.slot !== slot || !u.owned.includes(id)) throw new Error('Bạn chưa có món này');
        u.eq[slot] = id;
      }
      save();
      return info(acct);
    },
    // Đồ đang trang bị (gửi cho mọi người trong phòng); null nếu không mặc gì.
    look(acct) {
      const u = acct && db.users[acct];
      if (!u) return null;
      const out = {};
      for (const s of WEAR) if (u.eq[s] && ITEM[u.eq[s]] && u.owned.includes(u.eq[s])) out[s] = u.eq[s];
      return Object.keys(out).length ? out : null;
    },
    // Biểu cảm thêm từ các gói đã mua.
    emotes(acct) {
      const u = acct && db.users[acct];
      return u ? u.owned.flatMap(id => (ITEM[id] && ITEM[id].emojis) || []) : [];
    },
  };
}
