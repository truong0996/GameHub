// Lõi hub: phòng chơi, thành viên, ghế, chủ phòng, vòng đời ván chơi, bot, hẹn giờ, tick real-time.
// Mọi game cắm vào qua interface mô tả trong CLAUDE.md (manifest.js + server.js).
import crypto from 'node:crypto';
import { catalogEntry, defaultOpts } from './registry.js';

const BOT_NAMES = ['Tí', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
export const EMOTES = ['😂', '😎', '😡', '😭', '🔥', '👏', '🐴', '💀', '🙏', '🤡'];
const DEFAULT_TURN_MS = 30000;
const OFFLINE_MS = 3000;          // người chơi mất kết nối → máy tự đi sau 3s
const HOST_HANDOVER_MS = 15000;   // chủ phòng offline quá lâu → chuyển quyền
const ROOM_IDLE_MS = 30 * 60 * 1000;

const AFTER = Symbol('after');
const rid = n => crypto.randomBytes(n).toString('hex');
const cleanName = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 16) || 'Ẩn danh';

export function createHub({ games, lanUrls = () => [] }) {
  const rooms = new Map();
  const catalog = [...games.values()].map(catalogEntry).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  // ---------- tiện ích phòng ----------
  function makeRoom(gameKey) {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code;
    do code = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join('');
    while (rooms.has(code));
    const room = { code, host: null, members: new Map(), gameKey: null, optsByGame: {}, seats: [], match: null, matchSeq: 0, touched: Date.now() };
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
  }

  const online = (room, pid) => { const m = room.members.get(pid); return !!(m && m.conns.size); };
  const seatOf = (room, pid) => room.seats.findIndex(s => s.kind === 'human' && s.pid === pid);
  function seatName(room, i) {
    const s = room.seats[i];
    if (s.kind === 'human') return (room.members.get(s.pid) || {}).name || '?';
    if (s.kind === 'bot') return 'Bot ' + BOT_NAMES[i % BOT_NAMES.length];
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
      })),
      members: [...room.members.values()].map(m => ({ uid: m.uid, name: m.name, online: m.conns.size > 0, seat: seatOf(room, m.pid) })),
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
    room.match = { id: ++room.matchSeq, logic: g.logic, turnMs: M.turnMs || DEFAULT_TURN_MS, state, timer: null, tick: null, busyUntil: now, deadline: 0 };
    broadcastRoom(room);
    afterAction(room, events || []);
    if (g.logic.tickRate) {
      const mt = room.match;
      mt.tick = setInterval(() => {
        if (room.match !== mt) return clearInterval(mt.tick);
        const r = mt.logic.tick(mt.state, Date.now());
        if (r && ((r.events && r.events.length) || r.changed)) broadcastGame(room, r.events || []);
        if (mt.logic.isOver(mt.state)) clearInterval(mt.tick);
      }, 1000 / g.logic.tickRate);
    }
  }

  function stopMatch(room) {
    const mt = room.match;
    if (!mt) return;
    clearTimeout(mt.timer);
    clearInterval(mt.tick);
    room.match = null;
  }

  function afterAction(room, events, meta) {
    const mt = room.match;
    const dur = mt.logic.animDuration ? mt.logic.animDuration(events) : 0;
    mt.busyUntil = Math.max(Date.now(), mt.busyUntil) + dur;
    schedule(room);
    broadcastGame(room, events, meta);
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
    if (!t) return;
    const seat = room.seats[t.seat];
    const wait = Math.max(0, mt.busyUntil - Date.now());
    let delay, mode;
    if (seat.kind === 'bot') { delay = wait + 450 + Math.random() * 600; mode = 'bot'; }
    else if (t.auto) { delay = wait + (t.autoDelay ?? 300); mode = 'auto'; }
    else {
      delay = wait + (online(room, seat.pid) ? mt.turnMs : OFFLINE_MS);
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

  // ---------- xử lý tin nhắn từ client ----------
  function handleConnection(ws) {
    let room = null, member = null;

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
        if (r.match && room === r) send(ws, gameMsg(r, [], null, seatOf(r, m.pid)));
      };
      return { code: r.code, pid: m.pid, uid: m.uid, lan: lanUrls(), catalog, [AFTER]: after };
    }
    function addMember(r, name) {
      const m = { pid: rid(12), uid: rid(4), name: cleanName(name), conns: new Set(), lastEmote: 0 };
      r.members.set(m.pid, m);
      if (!r.host) r.host = m.uid;
      return m;
    }

    const handlers = {
      hello: () => ({ catalog, lan: lanUrls() }),
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
        if (!m && !msg.name) throw new Error('Phiên cũ đã hết hạn, hãy vào lại phòng');
        if (!m) m = addMember(r, msg.name);
        else if (msg.name && !r.match) m.name = cleanName(msg.name);
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
        stopMatch(r);
      },
      act(msg, r, m) {
        const mt = r.match;
        if (!mt) throw new Error('Chưa bắt đầu ván');
        const seat = seatOf(r, m.pid);
        if (seat < 0) throw new Error('Bạn đang ở chế độ xem');
        const res = mt.logic.act(mt.state, seat, msg.action || {}, Date.now());
        if (!res.ok) throw new Error(res.err || 'Không hợp lệ');
        afterAction(r, res.events || []);
        return 'nobroadcast';
      },
      emote(msg, r, m) {
        if (!EMOTES.includes(msg.e) || Date.now() - m.lastEmote < 600) return 'nobroadcast';
        m.lastEmote = Date.now();
        const data = JSON.stringify({ t: 'emote', uid: m.uid, name: m.name, seat: seatOf(r, m.pid), e: msg.e });
        eachConn(r, w => send(w, data));
        return 'nobroadcast';
      },
    };
    const needHost = (r, m) => { if (r.host !== m.uid) throw new Error('Chỉ chủ phòng mới làm được'); };
    const needLobby = r => { if (r.match) throw new Error('Ván đang diễn ra'); };

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
          res = { ok: true };
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
