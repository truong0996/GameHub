// Tài khoản người chơi: tên + mã PIN, để bảng xếp hạng biết chắc ai là ai (khách vẫn chơi được nhưng không được tính).
// Lưu trong hub.db (hub/db.js): PIN băm bằng scrypt, token đăng nhập chỉ lưu mã băm (lộ file cũng không đăng nhập hộ được).
// scrypt chạy bất đồng bộ (luồng nền của libuv) nên hàng loạt người đăng nhập cùng lúc không làm khựng các phòng đang chơi.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { tx } from './db.js';

const MAX_FAILS = 5;              // sai PIN liên tiếp chừng này lần thì khoá tạm
const LOCK_MS = 60000;
const TOKENS_PER_USER = 10;       // mỗi người đăng nhập tối đa chừng này máy, máy cũ nhất bị đăng xuất

const scrypt = promisify(crypto.scrypt);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const keyOf = name => name.normalize('NFC').toLowerCase();
export const cleanName = s => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

export function createAccounts(db) {
  const q = {
    byKey: db.prepare('SELECT * FROM users WHERE nkey = ?'),
    byId: db.prepare('SELECT id, name FROM users WHERE id = ?'),
    addUser: db.prepare('INSERT INTO users (id, name, nkey, salt, hash, at) VALUES (?, ?, ?, ?, ?, ?)'),
    addTok: db.prepare('INSERT INTO tokens (h, id, at) VALUES (?, ?, ?)'),
    trimTok: db.prepare('DELETE FROM tokens WHERE id = ? AND h NOT IN (SELECT h FROM tokens WHERE id = ? ORDER BY at DESC LIMIT ?)'),
    tok: db.prepare('SELECT u.id, u.name FROM tokens t JOIN users u ON u.id = t.id WHERE t.h = ?'),
    delTok: db.prepare('DELETE FROM tokens WHERE h = ?'),
    fail: db.prepare('SELECT n, until FROM fails WHERE k = ?'),
    setFail: db.prepare('INSERT INTO fails (k, n, until) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n, until = excluded.until'),
    clearFail: db.prepare('DELETE FROM fails WHERE k = ?'),
  };
  const hashPin = async (pin, salt) => (await scrypt(pin, salt, 32)).toString('hex');
  const pub = u => ({ id: u.id, name: u.name });

  function checkPin(pin) {
    pin = String(pin || '');
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Mã PIN gồm 4–8 chữ số');
    return pin;
  }
  function issue(u) {
    const token = crypto.randomBytes(24).toString('hex');
    tx(db, () => {
      q.addTok.run(sha(token), u.id, Date.now());
      q.trimTok.run(u.id, u.id, TOKENS_PER_USER);
    });
    return { token, user: pub(u) };
  }

  return {
    async register(name, pin) {
      name = cleanName(name);
      if ([...name].length < 2) throw new Error('Tên cần ít nhất 2 ký tự');
      pin = checkPin(pin);
      const taken = () => new Error(`Tên "${name}" đã có người dùng — chọn tên khác hoặc đăng nhập`);
      if (q.byKey.get(keyOf(name))) throw taken();
      const salt = crypto.randomBytes(16).toString('hex');
      const u = { id: crypto.randomBytes(6).toString('hex'), name, salt, hash: await hashPin(pin, salt), at: Date.now() };
      try { q.addUser.run(u.id, u.name, keyOf(u.name), u.salt, u.hash, u.at); }
      catch (e) { if (/UNIQUE/.test(e.message)) throw taken(); throw e; }   // người khác vừa lấy tên này trong lúc đang băm PIN
      return issue(u);
    },
    async login(name, pin) {
      name = cleanName(name);
      const k = keyOf(name), now = Date.now(), f = q.fail.get(k) || { n: 0, until: 0 };
      if (f.until > now) throw new Error(`Sai PIN nhiều lần — thử lại sau ${Math.ceil((f.until - now) / 1000)} giây`);
      const u = q.byKey.get(k);
      if (!u) throw new Error(`Chưa có tài khoản "${name}" — bấm Đăng ký để tạo`);
      const ok = crypto.timingSafeEqual(Buffer.from(await hashPin(String(pin || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
      if (!ok) {
        const n = f.until ? 1 : f.n + 1;   // vừa hết khoá thì đếm lại từ đầu
        q.setFail.run(k, n, n >= MAX_FAILS ? now + LOCK_MS : 0);
        throw new Error('Sai mã PIN');
      }
      if (f.n) q.clearFail.run(k);
      return issue(u);
    },
    byToken(token) {
      const u = token && q.tok.get(sha(String(token)));
      return u ? pub(u) : null;
    },
    logout(token) {
      if (token) q.delTok.run(sha(String(token)));
    },
    get(id) { const u = id && q.byId.get(id); return u ? pub(u) : null; },
  };
}
