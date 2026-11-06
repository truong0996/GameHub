// Kiểm tra đầu-cuối qua WebSocket với 1 server đang chạy (cần Node 22+ vì dùng WebSocket có sẵn).
//   node tools/smoke.js [gameId] [port] [giây]
// Chủ phòng tạo phòng → khách vào bằng mã → ngồi ghế → lấp bot → bắt đầu → khách tự chơi phần của mình
// → kiểm tra cả 2 đều nhận tin 'game' → khách rớt mạng & vào lại đúng ghế → về phòng chờ.
const [gameId = 'cocangua', port = '3000', secs = '15'] = process.argv.slice(2);
const URL_WS = `ws://localhost:${port}/ws`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = false;
const check = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

function client(name) {
  const ws = new WebSocket(URL_WS);
  const c = { ws, name, seq: 0, pending: new Map(), room: null, game: null, games: 0, events: {} };
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'res') { c.pending.get(m.id)?.(m); c.pending.delete(m.id); return; }
    if (m.t === 'room') c.room = m.room;
    if (m.t === 'game') { c.game = m; c.games++; for (const ev of m.events) c.events[ev.t] = (c.events[ev.t] || 0) + 1; }
  };
  c.req = (t, data = {}) => new Promise(res => { const id = ++c.seq; c.pending.set(id, res); ws.send(JSON.stringify({ id, t, ...data })); });
  c.ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return c;
}

const host = client('Chủ');
await host.ready;
const created = await host.req('create', { name: 'Chủ', game: gameId });
check(created.ok && created.code, `tạo phòng ${created.code}`);
check((await host.req('selectGame', { game: gameId })).ok, `chọn game ${gameId}`);
check((await host.req('sit', { seat: 0 })).ok, 'chủ phòng ngồi ghế 0');

const guest = client('Khách');
await guest.ready;
const joined = await guest.req('join', { code: created.code, name: 'Khách' });
check(joined.ok, 'khách vào phòng bằng mã');
check((await guest.req('sit', { seat: 1 })).ok, 'khách ngồi ghế 1');
check(!(await guest.req('start')).ok, 'khách KHÔNG được bắt đầu ván (chỉ chủ phòng)');
check((await host.req('fillBots')).ok, 'lấp ghế trống bằng bot');
await sleep(200);
check(host.room.seats.every(s => s.kind !== 'open'), 'không còn ghế trống');
check((await host.req('start')).ok, 'bắt đầu ván');

// Cả 2 người tự chơi: gửi hành động bot-đơn-giản khi tới lượt (game theo lượt) hoặc bấm liên tục (real-time).
// Game có thể đặt state.ask = ghế đang phải quyết định (khi khác state.turn, vd bị Xin Bài).
function guessAction(g, seat) {
  const s = g.state, hand = s.players && s.players[seat] && s.players[seat].hand;
  if (s.self && s.map) {                                                 // Kẻ Mạo Danh (real-time): đi lung tung, họp thì bỏ qua phiếu
    if (s.phase === 'meet') return { type: 'vote', to: -1 };
    return { type: 'mv', x: s.self.x + (Math.random() - 0.5) * 0.6, y: s.self.y + (Math.random() - 0.5) * 0.6, w: s.self.warp };
  }
  if (s.roles && s.reactMs) {                                            // Coup: Thu Nhập, cho qua, bỏ/giữ lá đầu tiên
    const mine = s.players[seat].cards.filter(c => !c.dead);
    return { act: { type: 'income' }, react: { type: 'pass' }, lose: { type: 'lose', id: mine[0].id }, poison: { type: 'poison', pay: false },
      exchange: { type: 'keep', ids: mine.map(c => c.id) }, show: { type: 'show', id: mine[0].id }, force: { type: 'force', yes: false } }[s.phase];
  }
  if (s.phase === 'move' && s.legal) return { type: 'move', h: s.legal[0].h };
  if (s.phase === 'go' || s.phase === 'wait') return { type: 'press' };
  if (s.dealQ) { const d = s.pend[0]; return !d ? { type: Math.random() < 0.6 ? 'hit' : 'stay' } : d.see ? { type: 'peek', bury: false } : { type: 'target', to: d.opts[0] }; } // Flip 7
  if (s.phase === 'play') return { type: 'draw' };                      // Mèo Nổ
  if (s.phase === 'bury') return { type: 'bury', pos: 0 };
  if (s.phase === 'favor') return { type: 'give', card: hand[0] };
  if (s.phase === 'alter') return { type: 'order', order: s.alter.cards.map((c, i) => i) };
  if (s.phase === 'decide') return { type: 'decide', stay: Math.random() < 0.6 };  // Kho Báu Inca (chọn cùng lúc)
  const disc = hand && hand.find(k => k !== 'eye');                     // Hoa & Sọ
  if (s.phase === 'place0' || s.phase === 'place') return disc ? { type: 'place', k: disc } : { type: 'bid', n: 1 };
  if (s.phase === 'bid') return { type: 'pass' };
  if (s.phase === 'flip') return { type: 'flip', s: s.options[0] };
  if (s.phase === 'discard') return { type: 'discard', k: hand[0] };
  if (s.endAt) return { buy: { type: 'buy' }, rent: { type: 'pay' }, buyout: { type: 'skip' }, casino: { type: 'bet', amt: 0 }, stock: { type: 'invest', amt: 0 }, // Cờ Tỷ Phú
    train: { type: 'train', to: -1 }, auction: { type: 'bid', amt: 0 } }[s.phase] || { type: 'roll' };
  return { type: 'roll' };
}
const end = Date.now() + +secs * 1000;
let acted = 0;
while (Date.now() < end) {
  await sleep(300);
  for (const [c, seat] of [[host, 0], [guest, 1]]) {
    const g = c.game;
    if (!g) continue;
    const me = g.state.players && g.state.players[seat];
    const myTurn = (g.state.ask ?? g.state.turn) === seat || g.state.phase === 'go'
      || (g.state.phase === 'decide' && me.status === 'in' && !me.choice)
      || (g.state.phase === 'place0' && me.alive && !me.placed0) || (g.state.phase === 'discard' && g.state.discard.p === seat)
      || (g.state.phase === 'auction' && g.state.auc && !(seat in g.state.auc.bids))
      || (g.state.self && g.state.self.alive && (g.state.phase === 'play' || g.state.phase === 'meet'))
      || (g.state.reactMs && me.alive && ((g.state.phase === 'act' && g.state.cur === seat) || (g.state.phase === 'react' && g.state.win.seats.includes(seat))
        || (g.state.phase !== 'act' && g.state.phase !== 'react' && g.state.step && g.state.step.p === seat)));
    if (myTurn) { const r = await c.req('act', { action: guessAction(g, seat) }); if (r.ok) acted++; }
  }
}
check(host.games > 1 && guest.games > 1, `cả 2 nhận tin game (chủ ${host.games}, khách ${guest.games})`);
check(acted > 0, `người chơi gửi được ${acted} hành động`);
console.log('   sự kiện đã thấy:', JSON.stringify(host.events));

// Rớt mạng rồi vào lại
guest.ws.close();
await sleep(300);
check(host.room.seats[1].online === false, 'khách rớt mạng → ghế hiện offline');
const back = client('Khách');
await back.ready;
const rejoin = await back.req('join', { code: created.code, pid: joined.pid });
await sleep(300);
check(rejoin.ok && rejoin.uid === joined.uid, 'khách vào lại bằng pid cũ, giữ nguyên danh tính');
check(back.room && back.room.seats[1].uid === joined.uid && back.room.seats[1].online, 'vẫn ngồi đúng ghế 1 và online lại');
check(back.game && back.game.matchId === host.game.matchId, 'nhận lại trạng thái ván đang chơi');

check((await host.req('lobby')).ok, 'chủ phòng đưa mọi người về phòng chờ');
await sleep(200);
check(back.room.playing === false, 'khách thấy phòng đã về chờ');

for (const c of [host, back]) c.ws.close();
console.log(failed ? '\n❌ SMOKE TEST THẤT BẠI' : '\n✅ SMOKE TEST OK');
process.exit(failed ? 1 : 0);
