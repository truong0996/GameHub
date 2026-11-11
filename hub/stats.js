// Lịch sử ván đấu + cách chấm điểm cho bảng xếp hạng. Mỗi ván kết thúc (hoặc bị bỏ dở) có ≥2 người đã đăng nhập thì ghi vào
// bảng matches/mp của hub.db (hub/db.js). Bảng xếp hạng tính trong luồng riêng (hub/report.js) để không làm khựng phòng chơi.
// Điểm một ván (−1…+1, bàn mấy người cũng vậy): xét từng cặp người đã đăng nhập — ai xếp trên +1, xếp dưới −1, bằng hạng 0
// (bot và khách không tính) — rồi chia cho (số người − 1). Nhất bàn = +1, bét bàn = −1; tổng cả bàn luôn bằng 0.
// Trọng số ván theo thời lượng thật (weightOf): cứ 10 phút là ×1, làm tròn 0.5, trong khoảng ×1…×3 — ván Tỷ Phú 30 phút nặng hơn ván UNO 2 phút,
// và cùng một game thì bàn đông (lâu hơn) cũng nặng hơn bàn vắng.
// Chỉ số xếp hạng (−100…+100) = trung bình có trọng số, cộng thêm PRIOR ván hoà ảo để vài ván ăn may không vọt lên đầu:
//   chỉ số = Σ(trọng số × điểm ván) / (Σ trọng số + PRIOR) × 100. Vắng mặt không thiệt cũng không lợi.
import { insertMatch, tx } from './db.js';

export const MIN_GAMES = 5;       // ít ván hơn thì bảng xếp hạng gắn nhãn "chưa đủ ván"
export const PRIOR = 3;           // số "ván hoà ảo" (trọng số 1) cộng vào mẫu số
export const weightOf = dur => Math.min(3, Math.max(1, Math.round((dur || 0) / 300000) / 2));

// Thứ hạng từng ghế (1 = nhất, bằng nhau thì cùng hạng, null = không xếp hạng) từ kết quả ván của game.
// Game khai báo result(state) → [{ p, s? }] xếp từ tốt nhất; hai phần tử liền nhau có `s` giống nhau (so bằng JSON) là đồng hạng.
// Game không có result() thì dùng state.winners / state.winner: người thắng hạng 1, còn lại đồng hạng 2.
export function ranksOf(L, st, seated) {
  const ranks = new Map();
  if (L.result) {
    const list = L.result(st) || [];
    list.forEach((x, i) => {
      const tie = i > 0 && x.s !== undefined && JSON.stringify(x.s) === JSON.stringify(list[i - 1].s);
      ranks.set(x.p, tie ? ranks.get(list[i - 1].p) : i + 1);
    });
  } else {
    const w = st.winners || (st.winner != null ? [st.winner] : []);
    if (w.length) for (const p of seated) ranks.set(p, w.includes(p) ? 1 : 2);
  }
  return seated.map(p => ranks.get(p) ?? null);
}

// Mỗi tài khoản trong ván → { acct, rank, d }: d = điểm ván −1…+1 (null = không xếp hạng hoặc bàn chưa đủ 2 tài khoản có hạng).
export function scoreRows(m) {
  const ppl = m.players.filter(x => x.acct && x.rank != null);
  const delta = new Map(ppl.map(x => [x.acct, 0]));
  for (let i = 0; i < ppl.length; i++) for (let j = i + 1; j < ppl.length; j++) {
    const a = ppl[i], b = ppl[j];
    if (a.rank === b.rank) continue;
    const [hi, lo] = a.rank < b.rank ? [a, b] : [b, a];
    delta.set(hi.acct, delta.get(hi.acct) + 1);
    delta.set(lo.acct, delta.get(lo.acct) - 1);
  }
  return m.players.filter(x => x.acct).map(x => ({
    acct: x.acct, rank: x.rank ?? null, d: ppl.length >= 2 && x.rank != null ? delta.get(x.acct) / (ppl.length - 1) : null,
  }));
}

export function createStats(db) {
  return {
    add(rec) { tx(db, () => insertMatch(db, rec)); },
  };
}
