// Cơ sở dữ liệu của hub: một file SQLite <data>/hub.db (node:sqlite có sẵn trong Node ≥ 22.13, không cần thư viện).
// Mọi tiến trình phòng (xem server.js — mỗi lõi CPU một tiến trình) mở chung file này: tài khoản, token đăng nhập,
// lịch sử ván, ví credit. Chế độ WAL cho nhiều tiến trình đọc song song với một người ghi.
// HUB_DB_WAL=0 → journal kiểu cũ (DELETE) cho ổ mạng (Azure Files/SMB không hỗ trợ bộ nhớ chung của WAL) — khi đó chỉ nên chạy 1 tiến trình.
//
// Lần đầu chạy: tự chuyển dữ liệu từ các file JSON của bản cũ (accounts.json, matches.jsonl, wallet.json) vào hub.db rồi xoá chúng.
// Sao lưu = chép hub.db (khi server đang tắt) hoặc dùng lệnh .backup của sqlite3.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { weightOf, scoreRows } from './stats.js';
import { creditOf, dayOf } from './wallet.js';
import { ITEM, WEAR } from '../public/shop-data.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, nkey TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, at INTEGER);
CREATE TABLE IF NOT EXISTS tokens (h TEXT PRIMARY KEY, id TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS tokens_id ON tokens(id, at);
CREATE TABLE IF NOT EXISTS fails (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL);
-- Một dòng mỗi ván đã ghi; rec = bản ghi đầy đủ dạng JSON { at, dur, room, game, opts, aborted?, by?, players } để hiện "ván gần đây".
CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, dur INTEGER NOT NULL, room TEXT, game TEXT NOT NULL,
  aborted INTEGER NOT NULL DEFAULT 0, by TEXT, rec TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS matches_at ON matches(at);
CREATE INDEX IF NOT EXISTS matches_game ON matches(game, at);
-- Một dòng cho mỗi tài khoản trong một ván KHÔNG bỏ dở: thứ hạng + điểm ván d (−1…+1, null = không xếp hạng / bàn < 2 tài khoản).
-- Trọng số và credit KHÔNG lưu — tính lúc đọc từ dur (hàm w() / credit() đăng ký bên dưới) nên đổi công thức là áp dụng cho cả lịch sử.
CREATE TABLE IF NOT EXISTS mp (mid INTEGER NOT NULL, acct TEXT NOT NULL, at INTEGER NOT NULL, day INTEGER NOT NULL, game TEXT NOT NULL,
  dur INTEGER NOT NULL, rank INTEGER, d REAL);
CREATE INDEX IF NOT EXISTS mp_acct ON mp(acct, at);
CREATE INDEX IF NOT EXISTS mp_at ON mp(at);
CREATE INDEX IF NOT EXISTS mp_mid ON mp(mid);
CREATE TABLE IF NOT EXISTS wallet (acct TEXT PRIMARY KEY, owned TEXT NOT NULL, eq TEXT NOT NULL, spent INTEGER NOT NULL);
`;

export const dbFile = dir => path.join(dir, 'hub.db');

// Mở hub.db (tạo nếu chưa có). readOnly: luồng tính báo cáo.
export function openDb(dir, { readOnly = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbFile(dir), { readOnly });
  db.exec('PRAGMA busy_timeout = 5000');
  if (!readOnly) {
    db.exec(`PRAGMA journal_mode = ${process.env.HUB_DB_WAL === '0' ? 'DELETE' : 'WAL'}`);
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec(SCHEMA);
  }
  db.function('w', { deterministic: true }, dur => weightOf(dur));
  db.function('credit', { deterministic: true }, (dur, rank) => creditOf({ dur }, { acct: 1, rank }));
  return db;
}

// Chạy fn trong một giao dịch (BEGIN IMMEDIATE: giữ quyền ghi ngay từ đầu, tránh hai tiến trình cùng đọc-rồi-ghi đè nhau).
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Ghi một ván (rec như dòng matches.jsonl cũ). Trả id ván.
export function insertMatch(db, rec) {
  const ins = db.prepare('INSERT INTO matches (at, dur, room, game, aborted, by, rec) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const mid = Number(ins.run(rec.at, rec.dur || 0, rec.room || null, rec.game, rec.aborted ? 1 : 0, rec.by || null, JSON.stringify(rec)).lastInsertRowid);
  if (!rec.aborted) {
    const add = db.prepare('INSERT INTO mp (mid, acct, at, day, game, dur, rank, d) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const x of scoreRows(rec)) add.run(mid, x.acct, rec.at, dayOf(rec.at), rec.game, rec.dur || 0, x.rank, x.d);
  }
  return mid;
}

// Chuyển dữ liệu từ file JSON cũ (chỉ khi bảng tương ứng còn trống) rồi xoá file đó. Gọi một lần lúc khởi động, trước khi tách tiến trình.
// File có dòng hỏng không nạp được thì đổi tên thành *.bad thay vì xoá, để còn xem lại.
export function migrateLegacy(db, dir) {
  const log = [];
  const done = (f, ok = true) => { if (ok) fs.rmSync(f); else fs.renameSync(f, f + '.bad'); };
  const empty = t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n === 0;

  const acc = path.join(dir, 'accounts.json');
  if (fs.existsSync(acc) && empty('users')) {
    const old = JSON.parse(fs.readFileSync(acc, 'utf8'));
    tx(db, () => {
      const u = db.prepare('INSERT OR IGNORE INTO users (id, name, nkey, salt, hash, at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const x of Object.values(old.users || {})) u.run(x.id, x.name, x.name.normalize('NFC').toLowerCase(), x.salt, x.hash, x.at || 0);
      const t = db.prepare('INSERT OR IGNORE INTO tokens (h, id, at) VALUES (?, ?, ?)');
      for (const [h, x] of Object.entries(old.tokens || {})) t.run(h, x.id, x.at || 0);
    });
    done(acc);
    log.push(`${Object.keys(old.users || {}).length} tài khoản`);
  }

  const mfile = path.join(dir, 'matches.jsonl');
  if (fs.existsSync(mfile) && empty('matches')) {
    let n = 0, bad = 0;
    tx(db, () => {
      for (const line of fs.readFileSync(mfile, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { insertMatch(db, JSON.parse(line)); n++; } catch { bad++; console.error('[db] bỏ qua dòng hỏng trong', mfile); }
      }
    });
    done(mfile, !bad);
    log.push(`${n} ván`);
  }

  const wfile = path.join(dir, 'wallet.json');
  if (fs.existsSync(wfile) && empty('wallet')) {
    const old = JSON.parse(fs.readFileSync(wfile, 'utf8'));
    tx(db, () => {
      const ins = db.prepare('INSERT INTO wallet (acct, owned, eq, spent) VALUES (?, ?, ?, ?)');
      for (const [acct, u] of Object.entries(old.users || {})) {
        // Làm sạch như bản cũ: bỏ món không còn bán, spent hỏng thì tính lại theo giá các món đang có.
        const owned = (Array.isArray(u.owned) ? u.owned : []).filter(id => ITEM[id]);
        const eq = Object.fromEntries(Object.entries(u.eq || {}).filter(([s, id]) => WEAR.includes(s) && owned.includes(id)));
        const spent = Number.isFinite(u.spent) ? u.spent : owned.reduce((s, id) => s + ITEM[id].price, 0);
        ins.run(acct, JSON.stringify(owned), JSON.stringify(eq), spent);
      }
    });
    done(wfile);
    log.push(`${Object.keys(old.users || {}).length} ví`);
  }
  if (log.length) console.log(`   [db] đã chuyển dữ liệu cũ vào hub.db: ${log.join(', ')}`);
}
