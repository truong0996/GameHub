// Ví credit + đồ trang trí của tài khoản (bảng wallet + mp trong hub.db).
// Credit kiếm được KHÔNG lưu: tính từ lịch sử ván theo công thức CREDIT (public/shop-data.js) mỗi lần hỏi — đổi công thức là áp dụng
// cho cả lịch sử cũ, như bảng xếp hạng. Chỉ lưu đồ đã mua, đồ đang trang bị và tổng đã tiêu. Số dư = kiếm được − đã tiêu.
// Giới hạn mỗi ngày: credit trong ngày = min(dayCap, tổng credit thô các ván trong ngày) — bằng đúng cách cộng dồn từng ván rồi chặn.
import { weightOf } from './stats.js';
import { tx } from './db.js';
import { CREDIT, ITEM, COSMETIC, WEAR, itemPrice } from '../public/shop-data.js';
import { ACHIEVEMENT, TITLE } from '../public/achievements-data.js';

const DAY_MS = 86400000;
const TZ_MS = 7 * 3600000;                 // giới hạn mỗi ngày tính theo giờ Việt Nam
const LOOK_TTL = 60000;                    // đồ đang mặc được nhớ tạm trong RAM (tiến trình khác đổi thì được báo qua forget())
export const dayOf = t => Math.floor((t + TZ_MS) / DAY_MS);

// Credit thô của một người trong một ván (chưa áp giới hạn ngày). Ván bỏ dở = 0.
export function creditOf(m, x) {
  if (m.aborted || !x.acct) return 0;
  return Math.round(CREDIT.base * weightOf(m.dur) * (x.rank === 1 ? CREDIT.winMul : 1));
}

// Đồ đang mặc hợp lệ (đồ cửa hàng hoặc danh hiệu thành tựu đã sở hữu) → { slot: id } hoặc null.
export function lookOfRow(u) {
  if (!u) return null;
  const owned = JSON.parse(u.owned), eq = JSON.parse(u.eq), out = {};
  for (const s of WEAR) if (eq[s] && COSMETIC(eq[s]) && owned.includes(eq[s])) out[s] = eq[s];
  return Object.keys(out).length ? out : null;
}
// Câu SQL tổng credit kiếm được từ ván đấu của một tài khoản (dùng chung với luồng báo cáo).
export const EARNED_SQL = 'SELECT COALESCE(SUM(MIN(?, s)), 0) n FROM (SELECT SUM(credit(dur, rank)) s FROM mp WHERE acct = ? GROUP BY day)';

export function createWallet(db) {
  const q = {
    row: db.prepare('SELECT owned, eq, spent, bag FROM wallet WHERE acct = ?'),
    save: db.prepare('INSERT INTO wallet (acct, owned, eq, spent, bag) VALUES (?, ?, ?, ?, ?) ON CONFLICT(acct) DO UPDATE SET owned = excluded.owned, eq = excluded.eq, spent = excluded.spent, bag = excluded.bag'),
    earned: db.prepare(EARNED_SQL),
    today: db.prepare('SELECT COALESCE(SUM(credit(dur, rank)), 0) n FROM mp WHERE acct = ? AND day = ?'),
    ach: db.prepare('SELECT id FROM achievements WHERE acct = ?'),
  };
  const looks = new Map();                 // acct → { at, look }
  const parseBag = raw => {
    try {
      const b = raw ? JSON.parse(raw) : {};
      return { cards: b && b.cards && typeof b.cards === 'object' ? b.cards : {}, bought: b && b.bought && typeof b.bought === 'object' ? b.bought : {} };
    } catch { return { cards: {}, bought: {} }; }
  };
  const userOf = acct => {
    const r = q.row.get(acct);
    if (!r) return { owned: [], eq: {}, spent: 0, bag: { cards: {}, bought: {} } };
    const owned = JSON.parse(r.owned).filter(id => COSMETIC(id));
    const rawEq = JSON.parse(r.eq) || {}, eq = {};
    for (const s of WEAR) if (rawEq[s] && COSMETIC(rawEq[s]) && owned.includes(rawEq[s])) eq[s] = rawEq[s];
    return { owned, eq, spent: r.spent, bag: parseBag(r.bag) };
  };
  const store = (acct, u) => { q.save.run(acct, JSON.stringify(u.owned), JSON.stringify(u.eq), u.spent, JSON.stringify(u.bag)); looks.delete(acct); };
  const achBonus = acct => q.ach.all(acct).reduce((s, r) => s + ((ACHIEVEMENT[r.id] && ACHIEVEMENT[r.id].coins) || 0), 0);

  function info(acct, now = Date.now()) {
    const u = userOf(acct), matchGot = q.earned.get(CREDIT.dayCap, acct).n, bonus = achBonus(acct), got = matchGot + bonus;
    return { credits: got - u.spent, earned: got, bonus, today: Math.min(CREDIT.dayCap, q.today.get(acct, dayOf(now)).n), cap: CREDIT.dayCap,
      owned: [...u.owned], eq: { ...u.eq }, bag: { cards: { ...u.bag.cards }, bought: { ...u.bag.bought } } };
  }

  // Thêm danh hiệu nhận từ thành tựu vào ví (gọi bên trong giao dịch SQLite). Tự đeo nếu chưa đeo danh hiệu nào.
  function grantTitlesRaw(acct, ids) {
    const valid = ids.filter(id => TITLE[id]);
    if (!valid.length) return false;
    const u = userOf(acct);
    let changed = false, eqChanged = false;
    for (const id of valid) if (!u.owned.includes(id)) { u.owned.push(id); changed = true; }
    if (!u.eq.title && valid.length) { u.eq.title = valid[0]; changed = true; eqChanged = true; }
    if (changed) store(acct, u);
    return eqChanged;
  }

  // Tiêu hao 1 thẻ (gọi bên trong giao dịch SQLite của hành động sử dụng thẻ).
  function consumeCardRaw(acct, id) {
    const u = userOf(acct);
    const n = u.bag.cards[id] || 0;
    if (n < 1) throw new Error('Bạn chưa có Thẻ Đổi Tên — hãy mua trong Cửa hàng');
    u.bag.cards[id] = n - 1;
    store(acct, u);
  }

  return {
    info,
    grantTitlesRaw,
    consumeCardRaw,
    buy(acct, id) {
      const it = ITEM[id];
      if (!it || !Number.isFinite(it.price) || it.price < 0) throw new Error('Món này không có trong cửa hàng');
      // Đọc số dư + ghi trong cùng giao dịch: hai tab (hai tiến trình) bấm mua cùng lúc cũng không tiêu quá số dư.
      tx(db, () => {
        const u = userOf(acct);
        if (!it.consumable && u.owned.includes(id)) throw new Error('Bạn đã có món này rồi');
        const cost = itemPrice(it, u);
        const bal = q.earned.get(CREDIT.dayCap, acct).n + achBonus(acct) - u.spent;
        if (!(bal >= cost)) throw new Error(`Chưa đủ credit — còn thiếu ${cost - bal} 💰`);
        u.spent += cost;
        if (it.consumable) {
          u.bag.cards[id] = (u.bag.cards[id] || 0) + 1;
          u.bag.bought[id] = (u.bag.bought[id] || 0) + 1;
        } else {
          u.owned.push(id);
          if (WEAR.includes(it.slot)) u.eq[it.slot] = id;   // mua xong mặc luôn
        }
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
          const it = COSMETIC(id);
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
