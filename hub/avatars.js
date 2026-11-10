// Ảnh đại diện của tài khoản: <data>/avatars/<id tài khoản>.<jpg|png|webp>.
// Trình duyệt đã cắt + thu nhỏ ảnh (canvas) trước khi gửi nên server không phải giải mã ảnh (không có thư viện):
// chỉ kiểm tra chữ ký file (JPEG/PNG/WebP — không nhận SVG vì SVG chạy được script) và giới hạn dung lượng.
// URL ảnh kèm mã phiên bản (băm nội dung) → trình duyệt cache mãi, đổi ảnh là đổi URL.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const AVATAR_MAX = 96 * 1024;   // byte, sau khi giải base64 (client gửi ~5–20KB)
const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const ID_RE = /^[0-9a-f]{6,32}$/;      // id tài khoản (hub/accounts.js: 12 ký tự hex)

function kindOf(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
const verOf = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);

export function createAvatars(dataDir) {
  const dir = path.join(dataDir, 'avatars');
  const index = new Map();   // id tài khoản → { ext, v }
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = /^([0-9a-f]+)\.(jpg|png|webp)$/.exec(f);
      if (m && ID_RE.test(m[1])) index.set(m[1], { ext: m[2], v: verOf(fs.readFileSync(path.join(dir, f))) });
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }

  const drop = id => {
    const cur = index.get(id);
    if (!cur) return;
    try { fs.unlinkSync(path.join(dir, `${id}.${cur.ext}`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    index.delete(id);
  };

  return {
    // URL công khai của ảnh (kèm phiên bản) hoặc null.
    url(id) { const a = id && index.get(id); return a ? `/avatar/${id}?v=${a.v}` : null; },
    // dataUrl/base64 → lưu, trả URL mới. null/'' → xoá ảnh.
    set(id, data) {
      if (!ID_RE.test(String(id))) throw new Error('Tài khoản không hợp lệ');
      if (!data) { drop(id); return null; }
      const b64 = String(data).replace(/^data:image\/[a-z]+;base64,/, '');
      if (b64.length > AVATAR_MAX * 1.4) throw new Error('Ảnh quá lớn');
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > AVATAR_MAX) throw new Error('Ảnh quá lớn');
      const ext = kindOf(buf);
      if (!ext) throw new Error('Chỉ nhận ảnh JPEG, PNG hoặc WebP');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${id}.${ext}`);
      fs.writeFileSync(file + '.tmp', buf);
      const old = index.get(id);
      if (old && old.ext !== ext) drop(id);
      fs.renameSync(file + '.tmp', file);
      index.set(id, { ext, v: verOf(buf) });
      return this.url(id);
    },
    // Cho HTTP: { file, type } hoặc null.
    file(id) {
      const a = ID_RE.test(String(id)) && index.get(id);
      return a ? { file: path.join(dir, `${id}.${a.ext}`), type: TYPES[a.ext] } : null;
    },
  };
}
