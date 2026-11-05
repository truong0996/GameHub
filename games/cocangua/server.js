// Adapter nối luật cờ cá ngựa vào hub (xem "Game server interface" trong CLAUDE.md).
import * as R from './rules.js';

export default {
  create: ({ seats, opts }) => R.newGame(seats, opts),
  act: (state, seat, action) => R.act(state, seat, action),
  isOver: state => state.phase === 'over',
  // Thứ hạng (bảng xếp hạng của hub): người về chuồng đủ ngựa nhất, còn lại theo quãng đường các ngựa đã đi.
  result: st => [{ p: st.winner, s: 'win' }, ...st.players.map((pl, p) => ({ p, s: R.scoreOf(st, pl) }))
    .filter(x => x.p !== st.winner && st.players[x.p].active).sort((a, b) => b.s - a.s)],
  // Ai đang phải ra quyết định. Khi mọi lựa chọn như nhau thì hub tự đi giúp.
  turn(state) {
    if (state.phase === 'over') return null;
    const single = state.phase === 'move' && R.distinctMoves(state) === 1;
    return { seat: state.turn, auto: single ? { type: 'move', h: state.legal[0].h } : null };
  },
  bot: (state, seat, { timeout } = {}) => R.botAction(state, seat, timeout),
  animDuration: R.animDuration,
};
