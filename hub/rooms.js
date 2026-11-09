// Lõi hub: phòng chơi, thành viên, ghế, chủ phòng, vòng đời ván chơi, bot, hẹn giờ, tick real-time.
// Mọi game cắm vào qua interface mô tả trong CLAUDE.md (manifest.js + server.js).
import crypto from 'node:crypto';
import { catalogEntry, defaultOpts } from './registry.js';
import { ranksOf } from './stats.js';

const BOT_NAMES = ['Tí', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
export const EMOTES = ['😂', '😎', '😡', '😭', '🔥', '👏', '🐴', '💀', '🙏', '🤡'];
const DEFAULT_TURN_MS = 30000;
const OFFLINE_MS = 3000;          // người chơi mất kết nối → máy tự đi sau 3s
const HOST_HANDOVER_MS = 15000;   // chủ phòng offline quá lâu → chuyển quyền
const ROOM_IDLE_MS = 30 * 60 * 1000;
const CHAT_LEN = 200;             // độ dài tối đa một tin nhắn
const CHAT_KEEP = 50;             // số tin gần nhất phòng giữ lại (người mới vào / F5 vẫn thấy)
const CHAT_GAP_MS = 400;          // chống spam
const RTC_MAX = 16000;            // tin bắt tay WebRTC (SDP/ICE) tối đa ~16KB
const RELAY_MAX = 2048;           // một gói tiếng chuyển qua server (μ-law 16kHz, 40ms = 640 byte)
const RELAY_BACKLOG = 64 * 1024;  // người nhận mạng chậm, đang ứ quá nhiều thì bỏ gói tiếng
const KICK_BAN_MS = 2 * 60 * 1000; // bị chủ phòng mời ra thì 2 phút sau mới vào lại được phòng đó

const AFTER = Symbol('after');
const rid = n => crypto.randomBytes(n).toString('hex');
const cleanName = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 16) || 'Ẩn danh';
// Người bị mời ra: chặn theo tài khoản, khách thì theo tên (khách đổi tên là vào được — chỉ để khỏi vào lại ngay theo thói quen).
const banKey = (acct, name) => (acct ? 'a:' + acct : 'n:' + cleanName(name).toLowerCase());

// accounts (hub/accounts.js) + stats (hub/stats.js): có thì người chơi đăng nhập được và kết quả ván được ghi lại.
// wallet (hub/wallet.js): credit sau mỗi ván + đồ trang trí (look) hiện cho cả phòng.
export function createHub({ games, lanUrls = () => [], publicUrl = () => null, accounts = null, stats = null, wallet = null }) {
  const rooms = new Map();
  const catalog = [...games.values()].map(catalogEntry).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  // ---------- tiện ích phòng ----------
  function makeRoom(gameKey) {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code;
    do code = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join('');
    while (rooms.has(code));
    const room = { code, host: null, members: new Map(), gameKey: null, optsByGame: {}, seats: [], match: null, matchSeq: 0, chat: [], chatSeq: 0, kicked: new Map(), touched: Date.now() };
    setGame(room, gameKey && games.has(gameKey) ? gameKey : catalog[0].id);
    rooms.set(code, room);
    return room;
  }
  const gameOf = room => games.get(room.gameKey);
  const optsOf = room => room.optsByGame[room.gameKey];

  function setGame(room, key) {
    const g = games.get(key);
    room.gameKey = key;
    room.optsByGame[key] = room.optsByGame[key] || defaultOpts(g.manifest);
    const n = g.manifest.maxPlayers, old = room.seats;
    room.seats = Array.from({ length: n }, (_, i) => old[i] || { kind: 'open', pid: null });
    applySeatRules(room);
  }
  // manifest.seatOn(i, opts) = false → ghế không dùng với tuỳ chọn hiện tại (vd chế độ 2 đội đóng khối ghế đội thứ ba):
  // hub tự đóng ghế đó (auto) và mở lại khi tuỳ chọn đổi; người đang ngồi thì thành người xem.
  function applySeatRules(room) {
    const M = gameOf(room).manifest, opts = optsOf(room);
    room.seats.forEach((s, i) => {
      const on = !M.seatOn || M.seatOn(i, opts);
      if (!on && !s.auto) room.seats[i] = { kind: 'closed', pid: null, auto: true };
      else if (on && s.auto) room.seats[i] = { kind: 'open', pid: null };
    });
  }

  // Đồ trang trí đang mặc của một thành viên (chỉ tài khoản đã đăng nhập) — { frame?, name?, title?, bubble?, fx? } hoặc null.
  const lookOf = m => (wallet && m && m.acct ? wallet.look(m.acct) : null);
  const online = (room, pid) => { const m = room.members.get(pid); return !!(m && m.conns.size); };
  const seatOf = (room, pid) => room.seats.findIndex(s => s.kind === 'human' && s.pid === pid);
  function seatName(room, i) {
    const s = room.seats[i];
    if (s.kind === 'human') return (room.members.get(s.pid) || {}).name || '?';
    if (s.kind === 'bot') return 'Bot ' + BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? ' ' + (1 + Math.floor(i / BOT_NAMES.length)) : '');
    return '';
  }

  function publicRoom(room) {
    const g = gameOf(room), opts = optsOf(room);
    const hostM = [...room.members.values()].find(m => m.uid === room.host);
    const filled = room.seats.filter(s => s.kind === 'human' || s.kind === 'bot').length;
    return {
      code: room.code, host: room.host, hostName: hostM ? hostM.name : '',
      game: room.gameKey, opts,
      estimate: g.manifest.estimate ? g.manifest.estimate(opts, filled) : '',
      turnMs: g.manifest.turnMs || DEFAULT_TURN_MS,
      playing: !!room.match, matchId: room.match ? room.match.id : null,
      seats: room.seats.map((s, i) => ({
        kind: s.kind, uid: s.pid ? (room.members.get(s.pid) || {}).uid : null, name: seatName(room, i),
        online: s.kind === 'bot' || (s.kind === 'human' && online(room, s.pid)),
        acct: s.kind === 'human' && !!(room.members.get(s.pid) || {}).acct,
        look: s.kind === 'human' ? lookOf(room.members.get(s.pid)) : null,
      })),
      // voice: đang trong đàm thoại → { m: tắt mic?, v: mã phiên (đổi mỗi lần vào lại → client dựng lại kết nối) }
      // acct: đã đăng nhập (ván có ≥2 người đăng nhập mới được tính vào bảng xếp hạng)
      // look: đồ trang trí đang mặc (xem public/shop-data.js)
      members: [...room.members.values()].map(m => ({ uid: m.uid, name: m.name, online: m.conns.size > 0, seat: seatOf(room, m.pid), acct: !!m.acct, look: lookOf(m),
        voice: m.voice ? { m: m.voice.muted, v: m.voice.v } : null })),
    };
  }

  // ---------- gửi tin ----------
  const send = (ws, obj) => ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  function eachConn(room, fn) { for (const m of room.members.values()) for (const ws of m.conns) fn(ws, m); }
  function broadcastRoom(room) {
    const data = JSON.stringify({ t: 'room', room: publicRoom(room) });
    eachConn(room, ws => send(ws, data));
  }
  function gameMsg(room, events, meta, seat) {
    const mt = room.match, L = mt.logic;
    return {
      t: 'game', matchId: mt.id, game: room.gameKey,
      state: L.view ? L.view(mt.state, seat) : mt.state,
      events: L.viewEvents ? L.viewEvents(events, seat, mt.state) : events,
      meta: meta || null,
      deadlineIn: mt.deadline ? Math.max(0, mt.deadline - Date.now()) : 0,
    };
  }
  // Tin chat riêng do game giới hạn người nhận (vd hồn ma chỉ nói với nhau): c.to = mảng ghế (-1 = người xem), c.mid = ván lúc gửi.
  // Về phòng chờ / sang ván khác thì ai vào lại cũng thấy.
  function chatVisible(room, c, m) {
    if (!c.to) return true;
    const mt = room.match;
    if (!mt || mt.id !== c.mid) return true;
    return c.uid === m.uid || c.to.includes(seatOf(room, m.pid));
  }
  function pushChat(room, c) {
    room.chat.push(c);
    if (room.chat.length > CHAT_KEEP) room.chat.shift();
    const data = JSON.stringify({ t: 'chat', msg: c });
    eachConn(room, (w, m) => { if (chatVisible(room, c, m)) send(w, data); });
  }
  // Game cho ghế (thường là bot) nói một câu vào khung chat: say = [{ p: ghế, text, to?: [ghế...] }].
  function gameSay(room, say) {
    const mt = room.match, seats = gameOf(room).manifest.seats;
    for (const x of say || []) {
      const text = String(x.text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_LEN);
      if (!text || !seats[x.p]) continue;
      pushChat(room, { id: ++room.chatSeq, uid: 'seat' + x.p, name: seatName(room, x.p), seat: x.p, color: seats[x.p].color, text, at: Date.now(),
        ...(x.to ? { to: x.to, mid: mt.id } : {}), ...(x.tag ? { tag: x.tag } : {}) });
    }
  }
  function broadcastGame(room, events = [], meta) {
    const L = room.match.logic;
    if (!L.view && !L.viewEvents) {
      const data = JSON.stringify(gameMsg(room, events, meta, -1));
      eachConn(room, ws => send(ws, data));
    } else eachConn(room, (ws, m) => send(ws, gameMsg(room, events, meta, seatOf(room, m.pid))));
  }

  // ---------- vòng đời ván ----------
  function startMatch(room) {
    const g = gameOf(room), M = g.manifest;
    const info = room.seats.map((s, i) => (s.kind === 'human' || s.kind === 'bot' ? { kind: s.kind, name: seatName(room, i) } : null));
    const n = info.filter(Boolean).length;
    if (n < M.minPlayers) throw new Error(`${M.name} cần ít nhất ${M.minPlayers} người chơi (người hoặc bot)`);
    const now = Date.now();
    const { state, events } = g.logic.create({ seats: info, opts: { ...optsOf(room) }, now });
    // players: ai ngồi ghế nào lúc bắt đầu (ghi vào lịch sử khi hết ván — rời phòng giữa chừng vẫn tính, máy đi giúp).
    const players = room.seats.map((s, i) => (info[i] ? { seat: i, acct: s.kind === 'human' ? (room.members.get(s.pid) || {}).acct || null : null,
      name: info[i].name, ...(s.kind === 'bot' ? { bot: true } : {}) } : null)).filter(Boolean);
    room.match = { id: ++room.matchSeq, logic: g.logic, turnMs: M.turnMs || DEFAULT_TURN_MS, state, timer: null, tick: null, busyUntil: now, deadline: 0,
      game: room.gameKey, opts: { ...optsOf(room) }, players, startedAt: now, recorded: false };
    broadcastRoom(room);
    afterAction(room, events || []);
    if (g.logic.tickRate) {
      const mt = room.match;
      mt.tick = setInterval(() => {
        if (room.match !== mt) return clearInterval(mt.tick);
        const r = mt.logic.tick(mt.state, Date.now());
        if (r && ((r.events && r.events.length) || r.changed)) broadcastGame(room, r.events || []);
        if (r && r.say) gameSay(room, r.say);
        if (mt.logic.isOver(mt.state)) { clearInterval(mt.tick); record(room); }
      }, 1000 / g.logic.tickRate);
    }
  }

  // by = tài khoản của người dừng ván (chủ phòng bấm về phòng chờ); ván chưa xong thì ghi là bỏ dở.
  function stopMatch(room, by = null) {
    const mt = room.match;
    if (!mt) return;
    clearTimeout(mt.timer);
    clearInterval(mt.tick);
    if (!mt.logic.isOver(mt.state)) record(room, { aborted: true, by });
    room.match = null;
  }

  // Ghi ván vào lịch sử (một lần mỗi ván). Chỉ ghi khi có ≥2 người đã đăng nhập — ván toàn khách/bot không ảnh hưởng bảng xếp hạng.
  // Ghi xong thì báo credit vừa nhận cho từng tài khoản (tin 'credit'); người thắng có hiệu ứng thắng thì cả phòng thấy (tin 'fx').
  function record(room, { aborted = false, by = null } = {}) {
    const mt = room.match;
    if (mt.recorded) return;
    mt.recorded = true;
    const now = Date.now();
    const ranks = aborted ? [] : ranksOf(mt.logic, mt.state, mt.players.map(x => x.seat));
    const delay = Math.max(0, mt.busyUntil - now) + 500;   // chờ animation cuối ván diễn xong
    if (!aborted) celebrate(room, ranks, delay);
    if (!stats) return;
    const accts = [...new Set(mt.players.map(x => x.acct).filter(Boolean))];
    if (accts.length < 2) return;
    const rec = { at: now, dur: now - mt.startedAt, room: room.code, game: mt.game, opts: mt.opts,
      ...(aborted ? { aborted: true, by } : {}), players: mt.players.map((x, i) => ({ ...x, rank: ranks[i] ?? null })) };
    const before = wallet && !aborted ? new Map(accts.map(a => [a, wallet.info(a, now).earned])) : null;
    try { stats.add(rec); } catch (e) { console.error(`[${room.code}] không ghi được lịch sử ván:`, e.message); return; }
    if (!before) return;
    for (const a of accts) {
      const w = wallet.info(a, now), x = rec.players.find(p => p.acct === a);
      const data = JSON.stringify({ t: 'credit', gain: w.earned - before.get(a), win: x.rank === 1, wallet: w, delay });
      for (const m of room.members.values()) if (m.acct === a) for (const ws of m.conns) send(ws, data);
    }
  }
  // Hiệu ứng thắng của người hạng 1 (đồ đã mua) — phát cho cả phòng, kể cả ván không được ghi.
  function celebrate(room, ranks, delay) {
    if (!wallet) return;
    let k = 0;
    room.match.players.forEach((x, i) => {
      if (ranks[i] !== 1 || !x.acct) return;
      const look = wallet.look(x.acct);
      if (!look || !look.fx) return;
      const data = JSON.stringify({ t: 'fx', fx: look.fx, seat: x.seat, name: x.name, why: 'win', delay: delay + 700 * k++ });
      eachConn(room, ws => send(ws, data));
    });
  }

  function afterAction(room, events, meta) {
    const mt = room.match;
    const dur = mt.logic.animDuration ? mt.logic.animDuration(events) : 0;
    mt.busyUntil = Math.max(Date.now(), mt.busyUntil) + dur;
    schedule(room);
    broadcastGame(room, events, meta);
    if (mt.logic.isOver(mt.state)) record(room);
  }

  // Hẹn giờ cho game theo lượt: bot tự đi, tự đi khi chỉ có 1 lựa chọn, hết giờ suy nghĩ.
  function schedule(room) {
    const mt = room.match;
    if (!mt) return;
    clearTimeout(mt.timer);
    mt.timer = null;
    mt.deadline = 0;
    const L = mt.logic;
    if (L.isOver(mt.state) || !L.turn) return;
    const t = L.turn(mt.state);
    if (!t || !t.seats) mt.multi = null;
    if (!t) return;
    if (t.seats) return scheduleMulti(room, t);
    const seat = room.seats[t.seat];
    const wait = Math.max(0, mt.busyUntil - Date.now());
    let delay, mode;
    // auto ưu tiên hơn bot: game dùng auto + autoDelay để mở "cửa sổ phản ứng" (vd chờ ai đó hô "Không!").
    if (t.auto) { delay = wait + (t.autoDelay ?? 300); mode = 'auto'; }
    else if (seat.kind === 'bot') { delay = wait + 450 + Math.random() * 600; mode = 'bot'; }
    else {
      delay = wait + (online(room, seat.pid) ? t.ms || mt.turnMs : OFFLINE_MS);
      mode = 'timeout';
      mt.deadline = Date.now() + delay;
    }
    mt.timer = setTimeout(() => {
      if (room.match !== mt || L.isOver(mt.state)) return;
      const cur = L.turn(mt.state);
      if (!cur || cur.seat !== t.seat) return;
      const action = mode === 'auto' ? t.auto : L.bot(mt.state, t.seat, { timeout: mode === 'timeout' });
      const r = L.act(mt.state, t.seat, action, Date.now());
      if (!r.ok) { console.error(`[${room.code}] tự đi lỗi:`, r.err, action); return; }
      afterAction(room, r.events || [], mode === 'timeout' ? { auto: t.seat } : null);
    }, delay);
  }

  // Quyết định cùng lúc: turn() trả { seats, key } — mọi ghế trong `seats` chọn song song, chung một hạn chót.
  // `key` đổi = pha mới (hạn chót mới), `ms` = thời gian của pha (mặc định turnMs, vd cửa sổ phản ứng ngắn hơn lượt thường).
  // Bot chọn rải rác 0.3–1.7s, người mất kết nối sau 3s, hết giờ thì máy chọn giúp tất cả.
  function scheduleMulti(room, t) {
    const mt = room.match, L = mt.logic, now = Date.now();
    if (!mt.multi || mt.multi.key !== t.key) {
      const start = Math.max(now, mt.busyUntil);
      mt.multi = { key: t.key, start, deadline: start + (t.ms || mt.turnMs), botAt: {}, off: {} };
      for (const s of t.seats) if (room.seats[s].kind === 'bot') mt.multi.botAt[s] = start + 300 + Math.random() * 1400;
    }
    const M = mt.multi;
    mt.deadline = M.deadline;
    const due = t.seats.map(s => {
      const seat = room.seats[s];
      if (seat.kind === 'bot') return [s, M.botAt[s] ?? now];
      if (online(room, seat.pid)) { delete M.off[s]; return [s, M.deadline]; }
      M.off[s] ??= Math.max(now, M.start);
      return [s, Math.min(M.deadline, M.off[s] + OFFLINE_MS)];
    });
    const first = Math.min(...due.map(d => d[1]));
    mt.timer = setTimeout(() => {
      if (room.match !== mt || L.isOver(mt.state)) return;
      const tnow = Date.now(), events = [], autos = [];
      for (const [s, at] of due) {
        if (at > tnow + 30) continue;
        const cur = L.turn(mt.state);
        if (!cur || !cur.seats || cur.key !== t.key || !cur.seats.includes(s)) continue;
        const human = room.seats[s].kind !== 'bot';
        const action = L.bot(mt.state, s, { timeout: human });
        const r = L.act(mt.state, s, action, tnow);
        if (!r.ok) { console.error(`[${room.code}] tự chọn lỗi:`, r.err, action); continue; }
        events.push(...(r.events || []));
        if (human) autos.push(s);
      }
      if (events.length || autos.length) afterAction(room, events, autos.length ? { auto: autos } : null);
    }, Math.max(0, first - now));
  }

  // ---------- xử lý tin nhắn từ client ----------
  function handleConnection(ws) {
    let room = null, member = null;
    let user = null;   // tài khoản đã đăng nhập trên kết nối này ({ id, name }) — gắn vào thành viên lúc tạo/vào phòng

    function attach(r, m) {
      detach();
      room = r; member = m;
      m.conns.add(ws);
      r.touched = Date.now();
      if (r.match && seatOf(r, m.pid) >= 0) schedule(r);
    }
    function detach() {
      if (!room) return;
      const r = room, m = member;
      m.conns.delete(ws);
      if (m.voice && m.voice.ws === ws) m.voice = null;
      room = member = null;
      if (r.match && seatOf(r, m.pid) >= 0) schedule(r);
      broadcastRoom(r);
      if (r.host === m.uid) setTimeout(() => {
        if (m.conns.size || r.host !== m.uid) return;
        const next = [...r.members.values()].find(x => x.conns.size);
        if (next) { r.host = next.uid; broadcastRoom(r); }
      }, HOST_HANDOVER_MS).unref();
    }
    // Trả lời trước (để client biết uid của mình), rồi mới gửi trạng thái phòng/ván.
    function welcome(r, m) {
      attach(r, m);
      const after = () => {
        broadcastRoom(r);
        if (room === r) send(ws, { t: 'chatLog', log: r.chat.filter(c => chatVisible(r, c, m)) });
        if (r.match && room === r) send(ws, gameMsg(r, [], null, seatOf(r, m.pid)));
      };
      return { code: r.code, pid: m.pid, uid: m.uid, lan: lanUrls(), pub: publicUrl(), catalog, [AFTER]: after };
    }
    // Bị chủ phòng mời ra: rời phòng ngay (client về màn hình chính).
    ws.kickOut = () => {
      if (!room) return;
      const code = room.code;
      if (member.voice && member.voice.ws === ws) member.voice = null;
      member.conns.delete(ws);
      room = member = null;
      send(ws, { t: 'kicked', code });
    };
    function addMember(r, name) {
      const m = { pid: rid(12), uid: rid(4), name: user ? user.name : cleanName(name), acct: user ? user.id : null,
        conns: new Set(), lastEmote: 0, lastChat: 0, voice: null };
      r.members.set(m.pid, m);
      if (!r.host) r.host = m.uid;
      return m;
    }

    const needAccounts = () => { if (!accounts) throw new Error('Server này chưa bật tài khoản'); };
    const needWallet = () => {
      if (!wallet) throw new Error('Server này chưa bật cửa hàng');
      if (!user) throw new Error('Đăng nhập để nhận credit và mua đồ');
    };
    // Đồ đang mặc đổi → vẽ lại phòng cho mọi người (nếu thành viên trong phòng là tài khoản này).
    const lookChanged = () => { if (room && member && member.acct === user.id) broadcastRoom(room); };
    const handlers = {
      hello: () => ({ catalog, lan: lanUrls(), pub: publicUrl(), accounts: !!accounts }),
      // Tài khoản: register/login → { token, user }; auth { token } (lúc kết nối lại) → { user }. Có hiệu lực từ lần tạo/vào phòng sau.
      register(msg) { needAccounts(); const r = accounts.register(msg.name, msg.pin); user = r.user; return r; },
      login(msg) { needAccounts(); const r = accounts.login(msg.name, msg.pin); user = r.user; return r; },
      auth(msg) {
        needAccounts();
        user = accounts.byToken(msg.token);
        if (!user) throw new Error('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại');
        return { user };
      },
      logout(msg) { if (accounts) accounts.logout(msg.token); user = null; return {}; },
      // Cửa hàng: shop → { wallet }; buy { item } / equip { slot, item | null } → { wallet } (đang ở phòng thì cả phòng thấy đồ mới).
      shop() { needWallet(); return { wallet: wallet.info(user.id) }; },
      buy(msg) { needWallet(); const w = wallet.buy(user.id, String(msg.item || '')); lookChanged(); return { wallet: w }; },
      equip(msg) {
        needWallet();
        const w = wallet.equip(user.id, String(msg.slot || ''), msg.item == null ? null : String(msg.item));
        lookChanged();
        return { wallet: w };
      },
      create(msg) {
        const r = makeRoom(msg.game);
        const m = addMember(r, msg.name);
        r.host = m.uid;
        return welcome(r, m);
      },
      join(msg) {
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) throw new Error('Không tìm thấy phòng (có thể server đã khởi động lại)');
        let m = r.members.get(msg.pid);
        if (m && user && m.acct && m.acct !== user.id) m = null;   // tab này đã đổi sang tài khoản khác
        if (user) m = [...r.members.values()].find(x => x.acct === user.id) || m;   // máy khác của cùng tài khoản → cùng chỗ
        const ban = !m && r.kicked.get(banKey(user && user.id, msg.name));
        if (ban > Date.now()) throw new Error(`Bạn vừa bị chủ phòng mời ra — ${Math.ceil((ban - Date.now()) / 1000)} giây nữa mới vào lại được`);
        if (!m && !msg.name && !user) throw new Error('Phiên cũ đã hết hạn, hãy vào lại phòng');
        if (!m) m = addMember(r, msg.name);
        else if (user && !m.acct) { m.acct = user.id; if (!r.match) m.name = user.name; }   // khách vừa đăng nhập
        else if (msg.name && !m.acct && !r.match) m.name = cleanName(msg.name);
        return welcome(r, m);
      },
      leave() {
        const r = room, m = member;
        if (!r) return {};
        const s = seatOf(r, m.pid);
        if (s >= 0 && !r.match) r.seats[s] = { kind: 'open', pid: null };
        detach();
        if (!r.match) { r.members.delete(m.pid); broadcastRoom(r); }
        return {};
      },
    };

    // Các lệnh cần đang ở trong phòng.
    const roomHandlers = {
      sit(msg, r, m) {
        needLobby(r);
        const i = msg.seat | 0, s = r.seats[i];
        if (!s || s.kind !== 'open') throw new Error('Ghế này không trống');
        const cur = seatOf(r, m.pid);
        if (cur >= 0) r.seats[cur] = { kind: 'open', pid: null };
        r.seats[i] = { kind: 'human', pid: m.pid };
        // Ngồi vào ghế = "ra mắt" hiệu ứng thắng (bản nhỏ) cho cả phòng, tối đa mỗi 5 giây.
        const look = lookOf(m);
        if (look && look.fx && Date.now() - (m.lastFx || 0) > 5000) {
          m.lastFx = Date.now();
          const data = JSON.stringify({ t: 'fx', fx: look.fx, seat: i, name: m.name, why: 'sit', delay: 250 });
          eachConn(r, w => send(w, data));
        }
      },
      unsit(msg, r, m) {
        needLobby(r);
        const cur = seatOf(r, m.pid);
        if (cur >= 0) r.seats[cur] = { kind: 'open', pid: null };
      },
      seatKind(msg, r, m) {
        needHost(r, m); needLobby(r);
        const i = msg.seat | 0;
        if (!r.seats[i] || !['open', 'bot', 'closed'].includes(msg.kind)) throw new Error('Ghế không hợp lệ');
        if (r.seats[i].auto) throw new Error('Ghế này không dùng với tuỳ chọn hiện tại');
        r.seats[i] = { kind: msg.kind, pid: null };
      },
      fillBots(msg, r, m) {
        needHost(r, m); needLobby(r);
        r.seats.forEach((s, i) => { if (s.kind === 'open') r.seats[i] = { kind: 'bot', pid: null }; });
      },
      selectGame(msg, r, m) {
        needHost(r, m); needLobby(r);
        if (!games.has(msg.game)) throw new Error('Game không tồn tại');
        setGame(r, msg.game);
      },
      opts(msg, r, m) {
        needHost(r, m); needLobby(r);
        const def = (gameOf(r).manifest.options || []).find(o => o.key === msg.key);
        if (!def) throw new Error('Tuỳ chọn không hợp lệ');
        const ch = def.choices.find(c => c.value === msg.value);
        if (!ch) throw new Error('Giá trị không hợp lệ');
        optsOf(r)[def.key] = ch.value;
        applySeatRules(r);
      },
      start(msg, r, m) {
        needHost(r, m);
        if (r.match && !r.match.logic.isOver(r.match.state)) throw new Error('Ván đang diễn ra');
        stopMatch(r);
        startMatch(r);
        return 'nobroadcast';
      },
      lobby(msg, r, m) {
        needHost(r, m);
        stopMatch(r, m.acct);
      },
      // Chủ phòng mời một người ra khỏi phòng (người đang ngồi trong ván thì phải về phòng chờ trước).
      kick(msg, r, m) {
        needHost(r, m);
        const x = [...r.members.values()].find(y => y.uid === msg.uid);
        if (!x) throw new Error('Người này không còn trong phòng');
        if (x === m) throw new Error('Không thể tự mời mình ra');
        if (seatOf(r, x.pid) >= 0 && r.match) throw new Error('Người này đang chơi — về phòng chờ rồi mới mời ra được');
        const s = seatOf(r, x.pid);
        if (s >= 0) r.seats[s] = { kind: 'open', pid: null };
        r.members.delete(x.pid);
        r.kicked.set(banKey(x.acct, x.name), Date.now() + KICK_BAN_MS);
        for (const w of [...x.conns]) w.kickOut();
      },
      act(msg, r, m) {
        const mt = r.match;
        if (!mt) throw new Error('Chưa bắt đầu ván');
        const seat = seatOf(r, m.pid);
        if (seat < 0) throw new Error('Bạn đang ở chế độ xem');
        const res = mt.logic.act(mt.state, seat, msg.action || {}, Date.now());
        if (!res.ok) throw new Error(res.err || 'Không hợp lệ');
        // quiet: hành động liên tục (vd di chuyển trong game real-time) — không phát ngay, tick() sau sẽ gửi gộp.
        if (!res.quiet) afterAction(r, res.events || []);
        if (res.say) gameSay(r, res.say);
        return 'nobroadcast';
      },
      emote(msg, r, m) {
        const ok = EMOTES.includes(msg.e) || (wallet && m.acct && wallet.emotes(m.acct).includes(msg.e));   // gói biểu cảm đã mua
        if (!ok || Date.now() - m.lastEmote < 600) return 'nobroadcast';
        m.lastEmote = Date.now();
        const data = JSON.stringify({ t: 'emote', uid: m.uid, name: m.name, seat: seatOf(r, m.pid), e: msg.e });
        eachConn(r, w => send(w, data));
        return 'nobroadcast';
      },
      chat(msg, r, m) {
        const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_LEN);
        if (!text) throw new Error('Tin nhắn trống');
        if (Date.now() - m.lastChat < CHAT_GAP_MS) throw new Error('Gõ chậm lại chút nào!');
        m.lastChat = Date.now();
        // Lưu luôn màu ghế lúc gửi: đổi game/đổi ghế sau đó thì tin cũ vẫn giữ màu cũ.
        const seat = seatOf(r, m.pid), info = seat >= 0 ? gameOf(r).manifest.seats[seat] : null;
        const c = { id: ++r.chatSeq, uid: m.uid, name: m.name, seat, color: info ? info.color : null, text, at: m.lastChat };
        const look = lookOf(m);   // hiệu ứng tên, danh hiệu, khung chat lúc gửi
        if (look) { const { name, title, bubble } = look; c.look = { name, title, bubble }; }
        // Game được giới hạn chat trong ván (vd chỉ chat lúc họp, hồn ma chat riêng): chatTo → undefined/true = cả phòng,
        // chuỗi = báo lỗi không cho gửi, { to: [ghế...], tag? } = chỉ những ghế đó (và chính người gửi) thấy.
        const mt = r.match, L = mt && mt.logic;
        if (L && L.chatTo && !L.isOver(mt.state)) {
          const w = L.chatTo(mt.state, seat, m.lastChat);
          if (typeof w === 'string') { m.lastChat = 0; throw new Error(w); }
          if (w && w.to) { c.to = w.to; c.mid = mt.id; if (w.tag) c.tag = w.tag; }
        }
        pushChat(r, c);
        return 'nobroadcast';
      },
      // Đàm thoại: tiếng đi thẳng giữa các trình duyệt (WebRTC), server chỉ giữ ai đang vào/tắt mic và chuyển tin bắt tay.
      // Cặp nào mạng chặn nối thẳng (4G, mạng công ty...) thì tiếng của cặp đó đi vòng qua server (xem 'relay' + ws.on('binary')).
      // Gắn với kết nối (tab) đã bật: tab đó đóng/rớt mạng là tự ra khỏi đàm thoại.
      voice(msg, r, m) {
        if (!msg.on) { if (m.voice && m.voice.ws === ws) m.voice = null; return; }
        if (m.voice && m.voice.ws === ws) { m.voice.muted = !!msg.muted; return { vid: m.voice.v }; }
        m.voice = { ws, muted: !!msg.muted, v: rid(3), relay: new Set() };
        return { vid: m.voice.v };
      },
      // { to: [uid...] } = những người mình gửi tiếng qua server (thay cả danh sách).
      relay(msg, r, m) {
        if (m.voice && m.voice.ws === ws && Array.isArray(msg.to)) m.voice.relay = new Set(msg.to.slice(0, 32).map(String));
        return 'nobroadcast';
      },
      // { to: uid, tv: mã phiên của người nhận, d: SDP/ICE } → người nhận được { from, fv, d }. Lệch phiên (tin cũ) thì bỏ.
      rtc(msg, r, m) {
        if (!m.voice || m.voice.ws !== ws) return 'nobroadcast';
        const to = [...r.members.values()].find(x => x.uid === msg.to);
        if (!to || !to.voice || to.voice.v !== msg.tv) return 'nobroadcast';
        const data = JSON.stringify({ t: 'rtc', from: m.uid, fv: m.voice.v, d: msg.d });
        if (data.length <= RTC_MAX) send(to.voice.ws, data);
        return 'nobroadcast';
      },
    };
    const needHost = (r, m) => { if (r.host !== m.uid) throw new Error('Chỉ chủ phòng mới làm được'); };
    const needLobby = r => { if (r.match) throw new Error('Ván đang diễn ra'); };

    // Gói tiếng đi vòng qua server: [μ-law...] → người nhận được [độ dài uid][uid người nói][μ-law...].
    ws.on('binary', buf => {
      const v = member && member.voice;
      if (!v || v.ws !== ws || v.muted || !v.relay.size || buf.length > RELAY_MAX) return;
      const tag = Buffer.from(member.uid, 'latin1'), out = Buffer.concat([Buffer.from([tag.length]), tag, buf]);
      for (const x of room.members.values()) {
        if (x.voice && v.relay.has(x.uid) && x.voice.ws.buffered < RELAY_BACKLOG) x.voice.ws.sendBinary(out);
      }
    });

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      let res;
      try {
        if (handlers[msg.t]) res = { ok: true, ...handlers[msg.t](msg) };
        else if (roomHandlers[msg.t]) {
          if (!room) throw new Error('Bạn chưa vào phòng');
          room.touched = Date.now();
          const out = roomHandlers[msg.t](msg, room, member);
          if (out !== 'nobroadcast') broadcastRoom(room);
          res = { ok: true, ...(out && typeof out === 'object' ? out : {}) };
        } else throw new Error('Lệnh không hợp lệ: ' + msg.t);
      } catch (e) {
        res = { ok: false, err: e.message || String(e) };
      }
      const after = res[AFTER];
      if (msg.id != null) send(ws, { t: 'res', id: msg.id, ...res });
      if (after) after();
    });
    ws.on('close', detach);
  }

  // Dọn phòng bỏ hoang.
  setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      const conns = [...r.members.values()].reduce((n, m) => n + m.conns.size, 0);
      if (!conns && now - r.touched > ROOM_IDLE_MS) { stopMatch(r); rooms.delete(code); }
    }
  }, 60000).unref();

  return { handleConnection, catalog, rooms };
}
