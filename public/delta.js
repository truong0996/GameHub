// Gửi trạng thái game theo kiểu "chỉ phần thay đổi" (delta) — dùng chung server (hub/rooms.js) + client (hub.js, tools/smoke.js).
// Game không cần biết: hub dựng lại state đầy đủ trước khi gọi update().
//
// State chia thành mảnh tới độ sâu 2: mỗi khoá cấp 1 là một "lá" (giá trị thường hoặc mảng toàn giá trị đơn giản — cả khối là
// một mảnh) hoặc một "hộp" (object / mảng có phần tử là object — mỗi phần tử con là một mảnh).
// shape = [[khoá, d], ...] với d = null (lá) | số (mảng dài d) | [khoá con...] (object).
// Mỗi mảnh giữ dưới dạng chuỗi JSON nên so sánh rẻ và không bị ảnh hưởng khi game sửa state tại chỗ.
// Delta = { sh?: shape (chỉ khi đổi), u: [[khoá, giá trị] | [khoá, khoá con, giá trị], ...] } — mảnh vắng mặt trong shape là đã bị xoá.
// Đo bằng mô phỏng: Kẻ Mạo Danh ~20%, Vẽ Đoán ~2%, game theo lượt ~15–40% dung lượng gửi nguyên state.
const isBox = x => x !== null && typeof x === 'object' && typeof x.toJSON !== 'function';
const flat = a => { for (let i = 0; i < a.length; i++) { const e = a[i]; if (e !== null && typeof e === 'object') return false; } return true; };
// Kiểu của một giá trị cấp 1: null = lá, số = mảng tách từng phần tử, mảng khoá = object tách từng khoá.
const kindOf = x => (!isBox(x) ? null : Array.isArray(x) ? (flat(x) ? null : x.length) : Object.keys(x));

// Server: state (đã qua view) → { keys, d, s, sh }: keys[i] = khoá cấp 1, d[i] = kiểu, s[i] = chuỗi JSON (lá) hoặc mảng chuỗi (hộp).
export function split(v) {
  const keys = [], ds = [], ss = [];
  for (const k of Object.keys(v)) {
    const x = v[k];
    let d = kindOf(x), s;
    if (d === null) {
      s = JSON.stringify(x);
      if (s === undefined) continue;
    } else if (typeof d === 'number') {
      s = new Array(d);
      for (let i = 0; i < d; i++) s[i] = JSON.stringify(x[i]) ?? 'null';
    } else {
      const ks = [];
      s = [];
      for (const ck of d) {
        const c = JSON.stringify(x[ck]);
        if (c === undefined) continue;
        ks.push(ck);
        s.push(c);
      }
      d = ks;
    }
    keys.push(k); ds.push(d); ss.push(s);
  }
  return { keys, d: ds, s: ss, sh: JSON.stringify(keys.map((k, i) => [k, ds[i]])) };
}

const childKey = (d, j) => (typeof d === 'number' ? String(j) : d[j]);
// Server: chuỗi JSON của delta từ bản trước (prev) tới bản này (cur).
export function diff(prev, cur) {
  const u = [], same = prev.sh === cur.sh;
  // Shape đổi (hiếm) → tra mảnh cũ theo khoá thay vì theo vị trí.
  let old = null;
  if (!same) {
    old = new Map();
    prev.keys.forEach((k, i) => {
      const d = prev.d[i];
      if (d === null) old.set(k, prev.s[i]);
      else prev.s[i].forEach((c, j) => old.set(k + '\u0001' + childKey(d, j), c));
    });
  }
  for (let i = 0; i < cur.keys.length; i++) {
    const k = cur.keys[i], d = cur.d[i], s = cur.s[i];
    if (d === null) {
      if ((same ? prev.s[i] : old.get(k)) !== s) u.push(`[${JSON.stringify(k)},${s}]`);
      continue;
    }
    const p = same ? prev.s[i] : null;
    for (let j = 0; j < s.length; j++) {
      const ck = childKey(d, j);
      if ((same ? p[j] : old.get(k + '\u0001' + ck)) !== s[j]) u.push(`[${JSON.stringify(k)},${JSON.stringify(ck)},${s[j]}]`);
    }
  }
  return `{${same ? '' : `"sh":${cur.sh},`}"u":[${u.join(',')}]}`;
}

// Server: chuỗi JSON của state đầy đủ, ghép lại từ các mảnh (khỏi stringify lần nữa).
export function full(cur) {
  const out = [];
  for (let i = 0; i < cur.keys.length; i++) {
    const K = JSON.stringify(cur.keys[i]), d = cur.d[i], s = cur.s[i];
    if (d === null) out.push(`${K}:${s}`);
    else if (typeof d === 'number') out.push(`${K}:[${s.join(',')}]`);
    else out.push(`${K}:{${d.map((ck, j) => `${JSON.stringify(ck)}:${s[j]}`).join(',')}}`);
  }
  return `{${out.join(',')}}`;
}

// Client: shape của một state đã nhận (giống hệt shape server đã dùng cho bản đó).
export const shapeOf = v => Object.keys(v).map(k => [k, kindOf(v[k])]);

// Client: state cũ (không bị sửa) + delta → state mới. Mảnh không đổi dùng lại tham chiếu của state cũ.
export function apply(base, ds) {
  const shape = ds.sh || shapeOf(base), up = new Map();
  for (const e of ds.u) up.set(e.length === 2 ? e[0] : e[0] + '\u0001' + e[1], e[e.length - 1]);
  const out = {};
  for (const [k, d] of shape) {
    const b = base[k];
    if (d === null) out[k] = up.has(k) ? up.get(k) : b;
    else if (typeof d === 'number') {
      const a = new Array(d);
      for (let i = 0; i < d; i++) { const p = k + '\u0001' + i; a[i] = up.has(p) ? up.get(p) : b[i]; }
      out[k] = a;
    } else {
      const o = {};
      for (const ck of d) { const p = k + '\u0001' + ck; o[ck] = up.has(p) ? up.get(p) : b[ck]; }
      out[k] = o;
    }
  }
  return out;
}
