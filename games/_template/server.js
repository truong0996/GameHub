// ⚡ Phản Xạ — logic server. Ví dụ cho game KHÔNG theo lượt: mọi người bấm cùng lúc, hub gọi tick() 20 lần/giây.
// Luôn dùng tham số `now` (không gọi Date.now()) để tools/simulate.js chạy được với thời gian giả.
const BOT_MS = { slow: [450, 800], normal: [280, 520], fast: [190, 330] };
const MAX_WAIT_GO = 3000; // không ai bấm sau 3s → huỷ vòng

function newRound(st, now) {
  st.round++;
  st.phase = 'wait';
  st.early = [];
  st.roundWinner = null;
  st.reactMs = null;
  st.goAt = now + 1500 + Math.random() * 2500;
}

function winRound(st, seat, now) {
  const pl = st.players[seat];
  pl.score++;
  st.roundWinner = seat;
  st.reactMs = Math.round(now - st.goStart);
  const ev = [{ t: 'point', p: seat, ms: st.reactMs }];
  if (pl.score >= st.target) { st.phase = 'over'; st.winner = seat; ev.push({ t: 'win', p: seat }); }
  else { st.phase = 'result'; st.nextAt = now + 2200; }
  return ev;
}

export default {
  tickRate: 20,

  create({ seats, opts, now }) {
    const players = seats.map(s => (s ? { active: true, kind: s.kind, name: s.name, score: 0 } : { active: false }));
    const st = { phase: 'wait', round: 0, target: opts.target, botSpeed: opts.botSpeed, players, early: [], botAt: {}, winner: null };
    newRound(st, now);
    return { state: st, events: [{ t: 'start' }] };
  },

  act(st, seat, a, now) {
    if (!a || a.type !== 'press') return { ok: false, err: 'Hành động không hợp lệ' };
    if (st.phase === 'wait') {
      if (st.early.includes(seat)) return { ok: true, events: [] };
      st.early.push(seat);
      return { ok: true, events: [{ t: 'early', p: seat }] };
    }
    if (st.phase === 'go') {
      if (st.early.includes(seat)) return { ok: false, err: 'Bạn đã bấm sớm, chờ vòng sau nhé' };
      return { ok: true, events: winRound(st, seat, now) };
    }
    return { ok: true, events: [] }; // đang xem kết quả: bỏ qua
  },

  tick(st, now) {
    if (st.phase === 'wait' && now >= st.goAt) {
      st.phase = 'go';
      st.goStart = now;
      const [lo, hi] = BOT_MS[st.botSpeed] || BOT_MS.normal;
      st.botAt = {};
      st.players.forEach((pl, i) => { if (pl.active && pl.kind === 'bot') st.botAt[i] = now + lo + Math.random() * (hi - lo); });
      return { events: [{ t: 'go' }] };
    }
    if (st.phase === 'go') {
      const eligible = st.players.some((pl, i) => pl.active && !st.early.includes(i));
      if (!eligible || now - st.goStart > MAX_WAIT_GO) {
        st.phase = 'result';
        st.nextAt = now + 1500;
        return { events: [{ t: 'void' }] };
      }
      for (const [i, at] of Object.entries(st.botAt)) {
        if (now >= at && !st.early.includes(+i)) return { events: winRound(st, +i, now) };
      }
      return null;
    }
    if (st.phase === 'result' && now >= st.nextAt) {
      newRound(st, now);
      return { events: [{ t: 'round', n: st.round }] };
    }
    return null;
  },

  isOver: st => st.phase === 'over',
  // Thứ hạng cho bảng xếp hạng của hub: [{ p: ghế, s: điểm so hạng }] từ tốt nhất; liền nhau cùng `s` = đồng hạng.
  result: st => st.players.map((pl, p) => ({ p, s: pl.score, pl })).filter(x => x.pl.active)
    .sort((a, b) => b.s - a.s).map(({ p, s }) => ({ p, s })),
};
