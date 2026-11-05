// Tài khoản người chơi: tên + mã PIN, để bảng xếp hạng biết chắc ai là ai (khách vẫn chơi được nhưng không được tính).
// Lưu trong <data>/accounts.json: PIN băm bằng scrypt, token đăng nhập chỉ lưu mã băm (lộ file cũng không đăng nhập hộ được).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_FAILS = 5;              // sai PIN liên tiếp chừng này lần thì khoá tạm
const LOCK_MS = 60000;
const TOKENS_PER_USER = 10;       // mỗi người đăng nhập tối đa chừng này máy, máy cũ nhất bị đăng xuất

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const keyOf = name => name.normalize('NFC').toLowerCase();
export const cleanName = s => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

export function createAccounts(dir) {
  const file = path.join(dir, 'accounts.json');
  let db = { users: {}, tokens: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const fails = new Map();        // tên → { n, until }

  // Ghi ra file tạm rồi đổi tên: tắt server giữa chừng cũng không làm hỏng file.
  function save() {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 1));
    fs.renameSync(file + '.tmp', file);
  }
  const hashPin = (pin, salt) => crypto.scryptSync(pin, salt, 32).toString('hex');
  const findByName = name => Object.values(db.users).find(u => keyOf(u.name) === keyOf(name));
  const pub = u => ({ id: u.id, name: u.name });

  function checkPin(pin) {
    pin = String(pin || '');
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Mã PIN gồm 4–8 chữ số');
    return pin;
  }
  function issue(u) {
    const token = crypto.randomBytes(24).toString('hex');
    db.tokens[sha(token)] = { id: u.id, at: Date.now() };
    const mine = Object.entries(db.tokens).filter(([, t]) => t.id === u.id).sort((a, b) => a[1].at - b[1].at);
    for (const [k] of mine.slice(0, -TOKENS_PER_USER)) delete db.tokens[k];
    save();
    return { token, user: pub(u) };
  }

  return {
    register(name, pin) {
      name = cleanName(name);
      if ([...name].length < 2) throw new Error('Tên cần ít nhất 2 ký tự');
      pin = checkPin(pin);
      if (findByName(name)) throw new Error(`Tên "${name}" đã có người dùng — chọn tên khác hoặc đăng nhập`);
      const salt = crypto.randomBytes(16).toString('hex');
      const u = { id: crypto.randomBytes(6).toString('hex'), name, salt, hash: hashPin(pin, salt), at: Date.now() };
      db.users[u.id] = u;
      return issue(u);
    },
    login(name, pin) {
      name = cleanName(name);
      const k = keyOf(name), now = Date.now(), f = fails.get(k) || { n: 0, until: 0 };
      if (f.until > now) throw new Error(`Sai PIN nhiều lần — thử lại sau ${Math.ceil((f.until - now) / 1000)} giây`);
      const u = findByName(name);
      if (!u) throw new Error(`Chưa có tài khoản "${name}" — bấm Đăng ký để tạo`);
      const ok = crypto.timingSafeEqual(Buffer.from(hashPin(String(pin || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
      if (!ok) {
        f.n = f.until ? 1 : f.n + 1;   // vừa hết khoá thì đếm lại từ đầu
        f.until = f.n >= MAX_FAILS ? now + LOCK_MS : 0;
        fails.set(k, f);
        throw new Error('Sai mã PIN');
      }
      fails.delete(k);
      return issue(u);
    },
    byToken(token) {
      const t = token && db.tokens[sha(String(token))];
      const u = t && db.users[t.id];
      return u ? pub(u) : null;
    },
    logout(token) {
      if (!token || !db.tokens[sha(String(token))]) return;
      delete db.tokens[sha(String(token))];
      save();
    },
    get: id => (db.users[id] ? pub(db.users[id]) : null),
    all: () => Object.values(db.users).map(pub),
  };
}
