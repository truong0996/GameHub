// Ví credit + đồ trang trí của tài khoản (bảng wallet + mp trong hub.db).
// Credit kiếm được KHÔNG lưu: tính từ lịch sử ván theo công thức CREDIT (public/shop-data.js) mỗi lần hỏi — đổi công thức là áp dụng
// cho cả lịch sử cũ, như bảng xếp hạng. Chỉ lưu đồ đã mua, đồ đang trang bị và tổng đã tiêu. Số dư = kiếm được − đã tiêu.
// Giới hạn mỗi ngày: credit trong ngày = min(dayCap, tổng credit thô các ván trong ngày) — bằng đúng cách cộng dồn từng ván rồi chặn.
import { weightOf } from './stats.js';
import { tx } from './db.js';
import { CREDIT, ITEM, WEAR } from '../public/shop-data.js';

const DAY_MS = 86400000;
const TZ_MS = 7 * 3600000;                 // giới hạn mỗi ngày tính theo giờ Việt Nam
const LOOK_TTL = 60000;                    // đồ đang mặc được nhớ tạm trong RAM (tiến trình khác đổi thì được báo qua forget())
export const dayOf = t => Math.floor((t + TZ_MS) / DAY_MS);

// Credit thô của một người trong một ván (chưa áp giới hạn ngày). Ván bỏ dở = 0.
export function creditOf(m, x) {
  if (m.aborted || !x.acct) return 0;
  return Math.round(CREDIT.base * weightOf(m.dur) * (x.rank === 1 ? CREDIT.winMul : 1));
}

// Đồ đang mặc hợp lệ (món còn bán, đã mua) → { slot: id } hoặc null.
export function lookOfRow(u) {
  if (!u) return null;
  const owned = JSON.parse(u.owned), eq = JSON.parse(u.eq), out = {};
  for (const s of WEAR) if (eq[s] && ITEM[eq[s]] && owned.includes(eq[s])) out[s] = eq[s];
  return Object.keys(out).length ? out : null;
}
// Câu SQL tổng credit kiếm được của một tài khoản (dùng chung với luồng báo cáo).
export const EARNED_SQL = 'SELECT COALESCE(SUM(MIN(?, s)), 0) n FROM (SELECT SUM(credit(dur, rank)) s FROM mp WHERE acct = ? GROUP BY day)';

export function createWallet(db) {
  const q = {
    row: db.prepare('SELECT owned, eq, spent FROM wallet WHERE acct = ?'),
    save: db.prepare('INSERT INTO wallet (acct, owned, eq, spent) VALUES (?, ?, ?, ?) ON CONFLICT(acct) DO UPDATE SET owned = excluded.owned, eq = excluded.eq, spent = excluded.spent'),
    earned: db.prepare(EARNED_SQL),
    today: db.prepare('SELECT COALESCE(SUM(credit(dur, rank)), 0) n FROM mp WHERE acct = ? AND day = ?'),
  };
  const looks = new Map();                 // acct → { at, look }
  const userOf = acct => {
    const r = q.row.get(acct);
    return r ? { owned: JSON.parse(r.owned).filter(id => ITEM[id]), eq: JSON.parse(r.eq), spent: r.spent } : { owned: [], eq: {}, spent: 0 };
  };
  const store = (acct, u) => { q.save.run(acct, JSON.stringify(u.owned), JSON.stringify(u.eq), u.spent); looks.delete(acct); };

  function info(acct, now = Date.now()) {
    const u = userOf(acct), got = q.earned.get(CREDIT.dayCap, acct).n;
    return { credits: got - u.spent, earned: got, today: Math.min(CREDIT.dayCap, q.today.get(acct, dayOf(now)).n), cap: CREDIT.dayCap,
      owned: [...u.owned], eq: { ...u.eq } };
  }

  return {
    info,
    buy(acct, id) {
      const it = ITEM[id];
      if (!it || !Number.isFinite(it.price) || it.price < 0) throw new Error('Món này không có trong cửa hàng');
      // Đọc số dư + ghi trong cùng giao dịch: hai tab (hai tiến trình) bấm mua cùng lúc cũng không tiêu quá số dư.
      tx(db, () => {
        const u = userOf(acct);
        if (u.owned.includes(id)) throw new Error('Bạn đã có món này rồi');
        const bal = q.earned.get(CREDIT.dayCap, acct).n - u.spent;
        if (!(bal >= it.price)) throw new Error(`Chưa đủ credit — còn thiếu ${it.price - bal} 💰`);
        u.owned.push(id);
        u.spent += it.price;
        if (WEAR.includes(it.slot)) u.eq[it.slot] = id;   // mua xong mặc luôn
        store(acct, u);
      });
      return info(acct);
    },
    // id = null → tháo
    equip(acct, slot, id) {
      if (!WEAR.includes(slot)) throw new Error('Ô trang bị không hợp lệ');
      tx(db, () => {
        const u = userOf(acct);
        if (id == null) delete u.eq[slot];
        else {
          const it = ITEM[id];
          if (!it || it.slot !== slot || !u.owned.includes(id)) throw new Error('Bạn chưa có món này');
          u.eq[slot] = id;
        }
        store(acct, u);
      });
      return info(acct);
    },
    // Đồ đang trang bị (gửi cho mọi người trong phòng); null nếu không mặc gì. Gọi mỗi lần vẽ phòng nên nhớ tạm trong RAM.
    look(acct) {
      if (!acct) return null;
      const now = Date.now(), c = looks.get(acct);
      if (c && now - c.at < LOOK_TTL) return c.look;
      const look = lookOfRow(q.row.get(acct));
      if (looks.size > 50000) looks.clear();
      looks.set(acct, { at: now, look });
      return look;
    },
    // Tiến trình khác vừa đổi đồ của tài khoản này → bỏ bản nhớ tạm.
    forget(acct) { looks.delete(acct); },
    // Biểu cảm thêm từ các gói đã mua.
    emotes(acct) {
      return acct ? userOf(acct).owned.flatMap(id => (ITEM[id] && ITEM[id].emojis) || []) : [];
    },
  };
}
