// 🛸 Kẻ Mạo Danh — luật phía server (real-time, hub gọi tick() 20 lần/giây). Vai trò, vị trí thật, ai giết ai chỉ nằm ở đây;
// view() chỉ gửi cho mỗi người những gì họ nhìn thấy được (tầm nhìn có tường che), viewEvents() lọc sự kiện theo người chứng kiến.
// Bot nằm trong server-bot.js (chỉ dùng thông tin bot đó được thấy).
import { getMap, MAP_IDS, closedSet, blocked, los, moveStep, pathClear, nearestFree, randomSpot, roomAt, outdoorAt } from './maps.js';
import {
  TICK, VISION, KILL_R, REPORT_R, USE_R, BUTTON_R, ABIL_R, PICK_R, HEAR_R, INTRO_MS, EJECT_MS, BUTTON_CD, SAB_CD, DOOR_MS, DOOR_CD,
  CRIT_MS, SEAL_MS, AIRLOCK_MS, MASQ_MS, HOLD_MS, SONAR_CD, SONAR_MS, RIDE_MS, MAX_GAME_MS, PRINT_MS, TASKS, ROLES, SABS, EVENTS, ITEMS,
} from './data.js';
import { moveMods, waterLevel, tunnelOn } from './rules.js';
import { makeBots } from './server-bot.js';

const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const seatsOf = st => st.players.map((p, i) => (p.active ? i : -1)).filter(i => i >= 0);
const ok = (events = []) => ({ ok: true, events });
const no = err => ({ ok: false, err });

// Bộ nhớ đệm ngoài state (state phải JSON được): ô đang đóng (cửa sập + phòng niêm phong).
const CACHE = new WeakMap();
function dynOf(st) {
  let c = CACHE.get(st);
  const key = st.doors.map(d => d.r).join(',') + '|' + st.sealed.join(',');
  if (!c || c.key !== key) { c = { key, dyn: closedSet(getMap(st.map), st.doors.map(d => d.r), st.sealed) }; CACHE.set(st, c); }
  return c.dyn;
}

// ---------- tầm nhìn ----------
function visionOf(st, p) {
  if (!p.alive) return 999;
  const M = getMap(st.map), r = roomAt(M, p.x, p.y);
  let v = p.team === 'imp' ? VISION.imp : VISION.crew;
  if (st.sab && st.sab.k === 'lights' && p.team !== 'imp') v = VISION.lights;
  if (st.ev && st.ev.k === 'blackout') v = Math.min(v, VISION.blackout);
  if (tunnelOn(st)) v = Math.min(v, VISION.tunnel);
  if (r && r.dark) v *= 0.55;
  if (st.ev && st.ev.k === 'blizzard' && outdoorAt(M, p.x, p.y)) v = Math.min(v, VISION.blizzard);
  if (p.fx.flash > st.now) v = Math.max(v * 1.3, VISION.flash);
  if (r && r.id === 'roof') v *= 1.5;
  return v;
}
const invisible = (st, t) => t.ab && t.ab.k === 'phantom' && t.ab.until > st.now;

// Người ngồi ghế vs có thấy ghế ts không. vs < 0 = người xem (thấy hết). Hồn ma thấy hết; người sống chỉ thấy hồn ma nếu là Thầy Đồng.
function canSee(st, vs, ts) {
  if (vs === ts || vs < 0) return true;
  const v = st.players[vs], t = st.players[ts];
  if (!t.active) return false;
  if (!v.alive) return true;
  if (t.ride) return false;
  const d = dist(v, t);
  if (!t.alive) return v.role === 'medium' && d <= visionOf(st, v);
  if (t.vent != null) return false;
  if (invisible(st, t) && v.team !== 'imp') return false;
  return d <= visionOf(st, v) && los(getMap(st.map), dynOf(st), v.x, v.y, t.x, t.y);
}
// Người còn sống nhìn thấy được điểm (x, y) — dùng cho nhân chứng vụ giết, chui cống...
function seersOf(st, x, y) {
  const M = getMap(st.map), dyn = dynOf(st), out = [];
  st.players.forEach((p, i) => {
    if (!p.active || !p.alive || p.vent != null || p.ride) return;
    if (Math.hypot(p.x - x, p.y - y) <= visionOf(st, p) && los(M, dyn, p.x, p.y, x, y)) out.push(i);
  });
  return out;
}
const near = (st, p, o, r) => Math.hypot(p.x - o.x, p.y - o.y) <= r && (!p.alive || los(getMap(st.map), dynOf(st), p.x, p.y, o.x, o.y));

// Hình dạng người ghế s đang mang (ghế có màu/tên đó): Ngụy Trang → -1 (xám), Hoá Trang → hoán vị, Biến Hình → ghế khác.
function lookOf(st, s) {
  const p = st.players[s];
  if (!p.alive) return s;
  if (st.ev && st.ev.k === 'camo') return -1;
  const l = p.ab && p.ab.k === 'shifter' && p.ab.until > st.now ? p.ab.to : s;
  return st.sab && st.sab.k === 'masq' ? st.sab.perm[l] : l;
}

// ---------- tạo ván ----------
function create({ seats, opts, now }) {
  const map = opts.map === 'random' || !MAP_IDS.includes(opts.map) ? pick(MAP_IDS) : opts.map;
  const M = getMap(map);
  const players = seats.map((s, i) => (s ? {
    active: true, kind: s.kind, name: s.name, role: 'crew', team: 'crew', alive: true,
    x: 0, y: 0, vx: 0, vy: 0, dir: 1, mvT: 0, warp: 0, bud: 3, mvAt: now,
    tasks: [], doing: null, killCd: 0, abCd: 0, ab: null, item: null, fx: {}, shield: false, button: 1, vent: null,
    lover: null, cold: 0, frozen: false, hold: null, ride: null, deadAt: 0, lp: null, seat: i,
  } : { active: false }));
  const act = seatsOf({ players });
  const n = act.length;
  const order = shuffle([...act]);
  let k = opts.imps === 'auto' ? (n <= 6 ? 1 : 2) : +opts.imps;
  k = Math.max(1, Math.min(k, Math.floor((n - 1) / 2)));
  const imps = order.slice(0, k), crew = order.slice(k);
  for (const s of imps) Object.assign(players[s], { role: 'imp', team: 'imp' });
  if (opts.roles) {
    for (const s of imps) players[s].role = pick(['imp', 'shifter', 'phantom']);
    const pool = shuffle(['sheriff', 'guard', 'detective', 'engineer', 'medium']);
    let c = 0;
    const want = Math.min(pool.length, Math.max(1, Math.round(crew.length * 0.5)));
    if (n >= 6 && Math.random() < 0.6) Object.assign(players[crew[c++]], { role: 'jester', team: 'neutral' });
    for (let i = 0; i < want && c < crew.length - 1; i++) players[crew[c++]].role = pool[i];
    // Cặp Đôi: 2 người (không cùng là Kẻ Mạo Danh, không có Kẻ Ngốc) — một người chết thì người kia chết theo.
    if (n >= 5 && Math.random() < 0.45) {
      const cand = shuffle(act.filter(s => players[s].role !== 'jester'));
      const a = cand[0], b = cand.find(s => s !== a && !(players[a].team === 'imp' && players[s].team === 'imp'));
      if (b != null) { players[a].lover = b; players[b].lover = a; }
    }
  }
  const taskObjs = M.objs.filter(o => o.k === 'task' && !M.rooms[o.room].noTask);
  for (const s of act) players[s].tasks = shuffle([...taskObjs]).slice(0, Math.min(opts.tasks, taskObjs.length)).map(o => ({ o: o.i, done: false }));
  const st = {
    map, phase: 'intro', now, last: now, startAt: now, phaseEnd: now + INTRO_MS, players, tickN: 0,
    o: { killCd: opts.killCd * 1000, talk: opts.meet === 'short' ? 20000 : opts.meet === 'long' ? 75000 : 45000,
      vote: opts.meet === 'long' ? 40000 : 30000, reveal: !!opts.reveal, chaos: !!opts.chaos, items: !!opts.items, voice: opts.voice },
    bodies: [], sab: null, sabCd: now + INTRO_MS + 12000, doors: [], doorCd: {}, sealed: [], ev: null,
    nextEv: now + INTRO_MS + 40000 + rnd(20000), tunnel: M.tunnel ? { at: now + INTRO_MS + 25000, until: now + INTRO_MS + 30000 } : null,
    crates: [], crateSeq: 0, nextCrate: now + INTRO_MS + 20000 + rnd(15000), prints: [],
    dolls: M.objs.filter(o => o.k === 'doll').map(o => ({ x: o.x, y: o.y, l: pick(act), by: null })),
    meet: null, eject: null, win: null, revealed: [], gShield: null, sonar: null, sonarCd: 0, btnReady: now + INTRO_MS + BUTTON_CD,
    sayQ: [], lastKill: null,
  };
  placeAtTable(st);
  for (const s of act) {
    const p = players[s];
    p.killCd = now + INTRO_MS + 10000;
    const ab = ROLES[p.role].ab;
    if (ab) p.abCd = now + INTRO_MS + (ab.first || 0);
  }
  BOT.init(st);
  return { state: st, events: [{ t: 'start' }] };
}

// Xếp mọi người quanh nút họp khẩn (đầu ván + sau mỗi cuộc họp).
function placeAtTable(st) {
  const M = getMap(st.map), dyn = dynOf(st), act = seatsOf(st);
  act.forEach((s, i) => {
    const p = st.players[s], a = (i / act.length) * Math.PI * 2;
    const q = nearestFree(M, dyn, M.spawn.x + Math.cos(a) * 1.7, M.spawn.y + Math.sin(a) * 1.4);
    if (p.alive) Object.assign(p, { x: q.x, y: q.y, vx: 0, vy: 0 });
    p.warp++;
  });
}

// ---------- tiện ích ván ----------
const alive = st => seatsOf(st).filter(s => st.players[s].alive);
const M_ = st => getMap(st.map);
const objOf = (st, i) => M_(st).objs[i];
const roomOfObj = (st, o) => M_(st).rooms[o.room];

function taskBar(st) {
  let done = 0, all = 0;
  for (const p of st.players) if (p.active && p.team === 'crew') for (const t of p.tasks) { all++; if (t.done) done++; }
  return all ? done / all : 1;
}

function warpTo(st, p, x, y) {
  Object.assign(p, { x, y, vx: 0, vy: 0, doing: null, hold: null });
  p.warp++;
}

// Chết: để lại xác (nếu body), hồn ma xuất hiện tại chỗ. Cặp Đôi chết theo. Trả về sự kiện.
function die(st, s, now, { body = true, why = 'kill' } = {}) {
  const p = st.players[s], ev = [];
  if (!p.alive) return ev;
  Object.assign(p, { alive: false, deadAt: now, vent: null, doing: null, hold: null, ride: null, ab: null, why });
  if (st.gShield === s) st.gShield = null;
  for (const d of st.dolls) if (d.by === s) d.by = null;
  if (body) st.bodies.push({ p: s, x: p.x, y: p.y, at: now });
  if (p.lover != null && st.players[p.lover].alive) {
    const L = st.players[p.lover];
    ev.push({ t: 'heart', p: p.lover, x: L.x, y: L.y, vis: [...seersOf(st, L.x, L.y), p.lover] });
    ev.push(...die(st, p.lover, now, { body: true, why: 'heart' }));
  }
  return ev;
}

function startMeeting(st, by, body, now) {
  const ev = [{ t: 'meet', by, body }];
  const b = st.bodies.find(x => x.p === body);
  st.phase = 'meet';
  st.meet = { by, body, at: now, talkEnd: now + st.o.talk, voteEnd: now + st.o.talk + st.o.vote, votes: {}, bodyAt: b ? { x: b.x, y: b.y } : null };
  st.revealed = seatsOf(st).filter(s => !st.players[s].alive);
  st.bodies = [];
  st.sab = null;
  st.doors = [];
  st.ev = null;
  st.sonar = null;
  st.lastKill = null;
  for (const s of seatsOf(st)) {
    const p = st.players[s];
    Object.assign(p, { vent: null, doing: null, hold: null, ride: null, ab: null, frozen: false, cold: 0 });
    for (const k of ['flash', 'compass', 'radar', 'shoes']) p.fx[k] = 0;
  }
  for (const d of st.dolls) d.by = null;
  placeAtTable(st);
  BOT.meeting(st, now);
  return ev;
}

function endVote(st, now) {
  const m = st.meet, tally = {};
  for (const s of alive(st)) { const v = m.votes[s]; if (v != null) tally[v] = (tally[v] || 0) + 1; }
  const top = Math.max(0, ...Object.values(tally));
  const leaders = Object.keys(tally).filter(k => tally[k] === top).map(Number);
  const out = top > 0 && leaders.length === 1 && leaders[0] >= 0 ? leaders[0] : null;
  const ej = { p: out, tie: leaders.length > 1 && top > 0, votes: { ...m.votes } };
  const ev = [];
  if (out != null) {
    const p = st.players[out];
    if (st.o.reveal) { ej.role = p.role; ej.team = p.team; }
    ev.push(...die(st, out, now, { body: false, why: 'eject' }));
    if (p.role === 'jester') st.win = { team: 'neutral', seats: [out], why: `${p.name} là Kẻ Ngốc — bị đẩy ra ngoài đúng như ý muốn!` };
    ej.lovers = seatsOf(st).filter(s => s !== out && st.players[s].why === 'heart' && st.players[s].deadAt === now);
  }
  st.eject = ej;
  st.phase = 'eject';
  st.phaseEnd = now + EJECT_MS;
  st.revealed = seatsOf(st).filter(s => !st.players[s].alive);
  ev.unshift({ t: 'eject', ...ej });
  return ev;
}

// Kiểm tra thắng thua. Trả về sự kiện 'win' nếu ván vừa kết thúc.
function checkWin(st, now) {
  if (st.phase === 'over') return [];
  if (!st.win) {
    const al = alive(st), imp = al.filter(s => st.players[s].team === 'imp').length, other = al.length - imp;
    if (!imp) st.win = { team: 'crew', why: 'Đã loại hết Kẻ Mạo Danh!' };
    else if (imp >= other) st.win = { team: 'imp', why: 'Kẻ Mạo Danh đã áp đảo phi hành đoàn.' };
    else if (taskBar(st) >= 1) st.win = { team: 'crew', why: 'Phi hành đoàn đã hoàn thành mọi nhiệm vụ!' };
    else if (now - st.startAt > MAX_GAME_MS) st.win = { team: 'imp', why: 'Hết thời gian — dưỡng khí cạn kiệt.' };
  }
  if (!st.win || st.phase === 'eject') return [];
  return finish(st);
}
function finish(st) {
  const w = st.win;
  if (!w.seats) w.seats = seatsOf(st).filter(s => st.players[s].team === w.team);
  // Cặp Đôi còn sống tới cuối cùng thắng cùng phe thắng.
  for (const s of seatsOf(st)) { const p = st.players[s]; if (p.lover != null && p.alive && st.players[p.lover].alive && !w.seats.includes(s) && w.team !== 'neutral') w.seats.push(s); }
  st.phase = 'over';
  return [{ t: 'win', team: w.team, seats: w.seats, why: w.why }];
}

// ---------- phá hoại ----------
function sabFixed(st, now) {
  const k = st.sab.k;
  st.sab = null;
  st.sabCd = Math.max(st.sabCd, now + SAB_CD / 2);
  for (const p of st.players) if (p.active) p.hold = null;
  return [{ t: 'fixed', k }];
}
function seal(st, ri, now) {
  const M = M_(st), ev = [], dead = [];
  st.sealed.push(ri);
  for (const s of seatsOf(st)) {
    const p = st.players[s];
    if (!p.alive || p.vent != null) continue;
    const r = roomAt(M, p.x, p.y);
    if (r && r.i === ri) { dead.push(s); ev.push(...die(st, s, now, { body: false, why: 'seal' })); }
    else if (M.rooms[ri].doors.includes(Math.floor(p.y) * M.w + Math.floor(p.x))) { const q = nearestFree(M, dynOf(st), p.x, p.y); warpTo(st, p, q.x, q.y); }
  }
  // nhiệm vụ trong khoang bị niêm phong coi như xong (không ai vào được nữa)
  for (const p of st.players) if (p.active) for (const t of p.tasks) if (objOf(st, t.o).room === ri) t.done = true;
  st.crates = st.crates.filter(c => roomAt(M, c.x, c.y)?.i !== ri);
  st.bodies = st.bodies.filter(b => roomAt(M, b.x, b.y)?.i !== ri);
  ev.unshift({ t: 'seal', r: ri, dead });
  return ev;
}
function closeDoors(st, ri, until) {
  const M = M_(st);
  st.doors = st.doors.filter(d => d.r !== ri);
  st.doors.push({ r: ri, until });
  const dyn = dynOf(st);
  for (const p of st.players) if (p.active && p.alive && p.vent == null && blocked(M, dyn, p.x, p.y)) { const q = nearestFree(M, dyn, p.x, p.y); warpTo(st, p, q.x, q.y); }
}

// ---------- hành động ----------
function act(st, s, a, now) {
  st.now = Math.max(st.now, now);
  const p = st.players[s];
  if (!p || !p.active || !a) return no('Hành động không hợp lệ');
  const M = M_(st), dyn = dynOf(st);
  if (st.phase === 'over') return no('Ván đã kết thúc');

  if (a.type === 'vote') {
    if (st.phase !== 'meet') return no('Không phải lúc bỏ phiếu');
    if (!p.alive) return no('Hồn ma không được bỏ phiếu');
    if (now < st.meet.talkEnd) return no('Đang thảo luận — chưa tới lúc bỏ phiếu');
    if (st.meet.votes[s] != null) return no('Bạn đã bỏ phiếu rồi');
    const to = a.to === -1 ? -1 : a.to | 0;
    if (to !== -1 && !(st.players[to] && st.players[to].active && st.players[to].alive)) return no('Người này không còn trong cuộc họp');
    st.meet.votes[s] = to;
    const ev = [{ t: 'voted', p: s }];
    if (alive(st).every(x => st.meet.votes[x] != null)) ev.push(...endVote(st, now));
    return ok(ev);
  }
  if (st.phase !== 'play') return a.type === 'mv' || a.type === 'stop' || a.type === 'hold' ? { ok: true, quiet: true } : no('Chờ chút đã...');

  switch (a.type) {
    case 'mv': {   // vị trí client tự tính (đi trước cho mượt) — server kiểm tra tốc độ + xuyên tường
      if (a.w !== p.warp || p.vent != null || p.ride) return { ok: true, quiet: true };
      const x = +a.x, y = +a.y;
      if (!isFinite(x) || !isFinite(y)) return no('Toạ độ lỗi');
      const mods = moveMods(st, p, M), d = Math.hypot(x - p.x, y - p.y);
      const rate = (mods.speed + (mods.drift ? Math.hypot(...mods.drift) : 0)) * 1.25;
      p.bud = Math.min(3, p.bud + (now - p.mvAt) / 1000 * rate);
      p.mvAt = now;
      if (d > p.bud + 0.05 || (!mods.ghost && (!pathClear(M, dyn, p.x, p.y, x, y) || blocked(M, dyn, x, y)))) { p.warp++; return { ok: true, quiet: true }; }
      p.bud -= d;
      if (d > 0.01) { p.mvT = now; if (Math.abs(x - p.x) > 0.01) p.dir = x > p.x ? 1 : -1; }
      p.x = x; p.y = y;
      if (p.doing && dist(p, objOf(st, p.doing.o)) > USE_R + 0.5) p.doing = null;
      if (p.hold != null && dist(p, objOf(st, p.hold)) > USE_R + 0.5) p.hold = null;
      return { ok: true, quiet: true };
    }
    case 'use': return use(st, s, a, now);
    case 'task': {   // mini-game xong
      const t = p.tasks.find(t => t.o === a.o), o = objOf(st, a.o);
      if (!t || t.done || !o) return no('Không có nhiệm vụ này');
      if (p.team !== 'crew') { t.done = true; p.doing = null; return ok([]); }   // nhiệm vụ giả: chỉ để trà trộn, không tính vào thanh tiến độ
      if (!p.doing || p.doing.o !== a.o || now - p.doing.at < TASKS[o.t].ms * 0.8) return no('Làm lại nhiệm vụ nhé');
      if (dist(p, o) > USE_R + 0.6) return no('Bạn đã đi xa khỏi chỗ làm nhiệm vụ');
      t.done = true;
      p.doing = null;
      return ok([{ t: 'task', p: s, o: a.o, vis: [s] }, ...checkWin(st, now)]);
    }
    case 'stop': p.doing = null; p.hold = null; return { ok: true, quiet: true };
    case 'hold': {   // giữ tay ở bàn điều khiển sửa phá hoại
      if (!a.on) { p.hold = null; return { ok: true, quiet: true }; }
      const o = objOf(st, a.o);
      if (!p.alive || !o || !st.sab || !fixable(st, o)) return no('Không có gì cần sửa ở đây');
      if (!near(st, p, o, USE_R)) return no('Lại gần hơn nữa');
      p.hold = o.i;
      return ok([]);
    }
    case 'fix': {    // gạt cầu dao (cúp điện)
      const o = objOf(st, a.o);
      if (!p.alive || !o || !st.sab || st.sab.k !== 'lights' || o.s !== 'lights') return ok([]);
      if (!near(st, p, o, USE_R + 0.5)) return no('Lại gần hơn nữa');
      return ok(sabFixed(st, now));
    }
    case 'report': {
      if (!p.alive || p.vent != null || p.ride) return no('Không báo cáo được lúc này');
      const b = st.bodies.find(b => b.p === a.b);
      if (!b || !near(st, p, b, REPORT_R)) return no('Không thấy xác nào gần đây');
      return ok(startMeeting(st, s, b.p, now));
    }
    case 'kill': {
      if (!p.alive || p.team !== 'imp' || p.vent != null || p.ride) return no('Không giết được lúc này');
      if (now < p.killCd) return no('Chưa hồi chiêu');
      const v = st.players[a.to];
      if (!v || !v.active || !v.alive || v.team === 'imp' || v.vent != null || v.ride) return no('Không có ai để giết');
      if (!near(st, p, v, KILL_R)) return no('Lại gần hơn nữa');
      return ok(kill(st, s, a.to, now));
    }
    case 'sab': return sabotage(st, s, a, now);
    case 'vent': {   // đang trong cống → sang cống khác cùng nhóm
      const from = objOf(st, p.vent), to = objOf(st, a.to);
      if (p.vent == null || !to || to.k !== 'vent' || to.g !== from.g || st.sealed.includes(to.room)) return no('Không đi được');
      p.vent = to.i;
      warpTo(st, p, to.x, to.y);
      return ok([{ t: 'ventMove' }]);
    }
    case 'unvent': {
      if (p.vent == null) return ok([]);
      const o = objOf(st, p.vent);
      p.vent = null;
      return ok([{ t: 'vent', l: lookOf(st, s), x: o.x, y: o.y, in: false, vis: [...seersOf(st, o.x, o.y), s] }]);
    }
    case 'ability': return ability(st, s, a, now);
    case 'item': return useItem(st, s, now);
    case 'doll': {   // Kẻ Mạo Danh kéo/thả ma-nơ-canh
      const d = st.dolls[a.d];
      if (!d || !p.alive || p.team !== 'imp') return no('Không kéo được');
      if (d.by === s) { d.by = null; return ok([]); }
      if (d.by != null || dist(p, d) > USE_R) return no('Lại gần hơn nữa');
      for (const x of st.dolls) if (x.by === s) x.by = null;
      d.by = s;
      return ok([]);
    }
  }
  return no('Hành động không hợp lệ');
}

function fixable(st, o) {
  const k = st.sab && st.sab.k;
  if (o.k === 'pump') return k === 'flood' && o.room === st.sab.r;
  return o.k === 'fix' && (o.s === k || (o.s === 'core' && k === 'core'));
}

// Dùng đồ vật o (nhiệm vụ, cống, nút họp, cầu thang, tàu lượn, sonar...).
function use(st, s, a, now) {
  const p = st.players[s], o = objOf(st, a.o);
  if (!o || p.ride) return no('Không dùng được');
  if (st.sealed.includes(o.room)) return no('Khoang này đã bị niêm phong');
  switch (o.k) {
    case 'task': {
      const t = p.tasks.find(t => t.o === o.i);
      if (!t || t.done) return no('Không phải nhiệm vụ của bạn');
      if (!near(st, p, o, USE_R)) return no('Lại gần hơn nữa');
      p.doing = { o: o.i, at: now };
      return { ok: true, quiet: true };
    }
    case 'vent': {
      if (!p.alive || !(p.team === 'imp' || p.role === 'engineer')) return no('Chỉ Kẻ Mạo Danh (và Kỹ Sư) chui cống được');
      if (p.vent === o.i) return act(st, s, { type: 'unvent' }, now);
      if (p.vent != null || !near(st, p, o, USE_R)) return no('Lại gần cống hơn');
      const vis = seersOf(st, o.x, o.y).filter(x => x !== s);
      p.vent = o.i;
      warpTo(st, p, o.x, o.y);
      for (const d of st.dolls) if (d.by === s) d.by = null;
      BOT.sawVent(st, s, vis, now);
      return ok([{ t: 'vent', l: lookOf(st, s), x: o.x, y: o.y, in: true, vis: [...vis, s] }]);
    }
    case 'button': {
      if (!p.alive) return no('Hồn ma không gọi họp được');
      if (!near(st, p, o, BUTTON_R)) return no('Lại gần nút hơn');
      if (p.button <= 0) return no('Bạn đã dùng hết lượt họp khẩn');
      if (now < st.btnReady) return no(`Chờ ${Math.ceil((st.btnReady - now) / 1000)} giây nữa`);
      if (st.sab && SABS[st.sab.k].crit) return no('Đang có sự cố nguy cấp — sửa trước đã!');
      p.button--;
      return ok(startMeeting(st, s, null, now));
    }
    case 'fix': case 'pump': {
      if (!p.alive || !st.sab || !fixable(st, o)) return no('Không có gì cần sửa ở đây');
      if (!near(st, p, o, USE_R)) return no('Lại gần hơn nữa');
      if (o.s === 'lights') return { ok: true, quiet: true };   // client mở bảng cầu dao, xong thì gửi 'fix'
      p.hold = o.i;
      return ok([]);
    }
    case 'ladder': case 'coaster': {
      if (!p.alive && o.k === 'coaster') return no('Hồn ma bay được rồi, không cần tàu lượn');
      if (!near(st, p, o, USE_R)) return no('Lại gần hơn nữa');
      const to = M_(st).objs.find(x => x.k === o.k && x.g === o.g && x.i !== o.i);
      if (o.k === 'ladder') { warpTo(st, p, to.x, to.y); return ok([{ t: 'ladder', p: s, vis: [s] }]); }
      p.ride = { to: to.i, until: now + RIDE_MS };
      Object.assign(p, { doing: null, hold: null });
      for (const d of st.dolls) if (d.by === s) d.by = null;
      return ok([{ t: 'ride', l: lookOf(st, s), from: o.room, to: to.room }]);
    }
    case 'sonar': {
      if (!p.alive || !near(st, p, o, USE_R)) return no('Lại gần hơn nữa');
      if (now < st.sonarCd) return no(`Sonar đang nạp — ${Math.ceil((st.sonarCd - now) / 1000)} giây`);
      st.sonar = { by: s, until: now + SONAR_MS };
      st.sonarCd = now + SONAR_CD;
      return ok([{ t: 'ping' }]);
    }
  }
  return no('Không dùng được');
}

function kill(st, k, v, now) {
  const p = st.players[k], V = st.players[v];
  p.killCd = now + st.o.killCd;
  if (p.ab && p.ab.k === 'phantom') p.ab = null;   // giết là hiện hình
  // khiên (vật phẩm hoặc Hộ Vệ) chặn nhát giết
  if (V.shield || st.gShield === v) {
    if (V.shield) V.shield = false; else st.gShield = null;
    const g = seatsOf(st).find(x => st.players[x].role === 'guard');
    return [{ t: 'shieldBreak', v, x: V.x, y: V.y, vis: [k, v, ...(g != null ? [g] : []), ...seersOf(st, V.x, V.y)] }];
  }
  const vis = [...new Set([...seersOf(st, V.x, V.y), k, v])];
  const look = lookOf(st, k);
  warpTo(st, p, V.x, V.y);
  V.killer = k;
  const ev = [{ t: 'kill', l: look, v, x: V.x, y: V.y, vis }];
  ev.push(...die(st, v, now));
  st.lastKill = { k, v, at: now };
  BOT.sawKill(st, k, v, vis, now);
  return [...ev, ...checkWin(st, now)];
}

function ability(st, s, a, now) {
  const p = st.players[s], R = ROLES[p.role], ab = R.ab;
  if (!p.alive || p.vent != null || p.ride) return no('Không dùng được lúc này');
  if (p.role === 'detective') {   // soi xác gần đó
    const b = st.bodies.find(b => b.p === a.b);
    if (!b || !near(st, p, b, REPORT_R)) return no('Đứng gần một cái xác để soi');
    p.seen = p.seen || [];
    if (p.seen.includes(b.p)) return no('Bạn đã soi xác này rồi');
    p.seen.push(b.p);
    const killer = st.players[b.p].killer;
    const others = alive(st).filter(x => x !== s && x !== killer);
    const sus = killer != null && st.players[killer].active ? shuffle([killer, pick(others.length ? others : [killer])]) : [];
    BOT.inspected(st, s, sus);
    return ok([{ t: 'inspect', b: b.p, sec: Math.round((now - b.at) / 1000), sus: [...new Set(sus)], vis: [s], priv: true }]);
  }
  if (!ab) return no('Bạn không có kỹ năng chủ động');
  if (now < p.abCd) return no(`Chưa hồi chiêu — ${Math.ceil((p.abCd - now) / 1000)} giây`);
  const T = st.players[a.to];
  switch (p.role) {
    case 'sheriff': {
      if (!T || !T.active || !T.alive || a.to === s || !canSee(st, s, a.to) || !near(st, p, T, KILL_R)) return no('Lại gần mục tiêu hơn');
      p.abCd = now + ab.cd;
      const vis = [...new Set([...seersOf(st, T.x, T.y), s, a.to])];
      if (T.shield || st.gShield === a.to) {
        if (T.shield) T.shield = false; else st.gShield = null;
        return ok([{ t: 'shieldBreak', v: a.to, x: T.x, y: T.y, vis }]);
      }
      const hit = T.team === 'imp';
      const dead = hit ? a.to : s, D = st.players[dead];
      if (hit) T.killer = s; else p.killer = s;
      const ev = [{ t: 'shot', s, v: a.to, hit, x: D.x, y: D.y, vis }];
      ev.push(...die(st, dead, now));
      return ok([...ev, ...checkWin(st, now)]);
    }
    case 'guard': {
      if (!T || !T.active || !T.alive || !canSee(st, s, a.to) || dist(p, T) > ABIL_R) return no('Lại gần người cần bảo vệ hơn');
      st.gShield = a.to;
      p.abCd = now + ab.cd;
      return ok([{ t: 'guard', v: a.to, vis: [s] }]);
    }
    case 'shifter': {
      if (!T || !T.active || a.to === s) return no('Chọn người để biến thành');
      p.ab = { k: 'shifter', to: a.to, until: now + ab.dur };
      p.abCd = now + ab.cd;
      return ok([{ t: 'poof', x: p.x, y: p.y, vis: [...seersOf(st, p.x, p.y), s] }]);
    }
    case 'phantom': {
      p.ab = { k: 'phantom', until: now + ab.dur };
      p.abCd = now + ab.cd;
      return ok([{ t: 'poof', x: p.x, y: p.y, vis: [...seersOf(st, p.x, p.y), s] }]);
    }
  }
  return no('Không dùng được');
}

function useItem(st, s, now) {
  const p = st.players[s], k = p.item;
  if (!k || !p.alive) return no('Bạn không có vật phẩm');
  if (k === 'whistle') {
    if (p.vent != null || p.ride) return no('Không dùng được lúc này');
    if (st.sab && SABS[st.sab.k].crit) return no('Đang có sự cố nguy cấp — sửa trước đã!');
    p.item = null;
    return ok(startMeeting(st, s, null, now));
  }
  p.item = null;
  p.fx[k] = now + ITEMS[k].ms;
  return ok([{ t: 'useItem', k, vis: [s] }]);
}

function sabotage(st, s, a, now) {
  const p = st.players[s], M = M_(st), k = a.k;
  if (p.team !== 'imp') return no('Chỉ Kẻ Mạo Danh phá hoại được');
  if (k === 'doors') {
    const r = M.rooms[a.r];
    if (!r || !r.doors.length || st.sealed.includes(r.i) || r.id === 'roof') return no('Phòng này không có cửa');
    if ((st.doorCd[r.i] || 0) > now) return no(`Cửa phòng này đang hồi — ${Math.ceil((st.doorCd[r.i] - now) / 1000)} giây`);
    closeDoors(st, r.i, now + DOOR_MS);
    st.doorCd[r.i] = now + DOOR_CD;
    return ok([{ t: 'doors', r: r.i }]);
  }
  if (st.sab) return no('Đang có một phá hoại khác');
  if (now < st.sabCd) return no(`Phá hoại đang hồi — ${Math.ceil((st.sabCd - now) / 1000)} giây`);
  const allowed = ['lights', 'core', M.special];
  if (!allowed.includes(k)) return no('Không phá được thứ này ở bản đồ này');
  const sab = { k, at: now };
  if (k === 'core') sab.until = now + CRIT_MS;
  if (k === 'airlock') {
    const r = M.rooms[a.r];
    if (!r || r.i === M.objs[M.button].room) return no('Chọn một phòng khác');
    Object.assign(sab, { r: r.i, until: now + AIRLOCK_MS });
  }
  if (k === 'decouple') { Object.assign(sab, { r: M.byId[SABS.decouple.seal].i, until: now + SEAL_MS }); if (st.sealed.includes(sab.r)) return no('Toa cuối đã bị tách rồi'); }
  if (k === 'flood') {
    const r = M.rooms[a.r];
    if (!r || !r.sealable || st.sealed.includes(r.i)) return no('Chọn một khoang còn mở');
    Object.assign(sab, { r: r.i, until: now + SEAL_MS });
  }
  if (k === 'masq') { sab.perm = shuffle(st.players.map((_, i) => i)); sab.until = now + MASQ_MS; }
  if (SABS[k].fix === 'hold') sab.prog = 0;
  st.sab = sab;
  st.sabCd = now + SAB_CD + (sab.until ? sab.until - now : 0);
  return ok([{ t: 'sab', k, r: sab.r }]);
}

// ---------- biến cố ngẫu nhiên ----------
function startEvent(st, now) {
  const M = M_(st), keys = Object.keys(EVENTS).filter(k => !EVENTS[k].map || EVENTS[k].map === st.map).filter(k => k !== 'drop' || st.o.items);
  const k = pick(keys), E = EVENTS[k], ev = [{ t: 'ev', k }];
  st.ev = { k, at: now, until: now + E.ms };
  if (k === 'swap') {
    const dyn = dynOf(st);
    for (const s of alive(st)) {
      const p = st.players[s];
      if (p.vent != null || p.ride) continue;
      const q = randomSpot(M, dyn, -1);
      if (!st.sealed.includes(roomAt(M, q.x, q.y)?.i)) warpTo(st, p, q.x, q.y);
    }
  }
  if (k === 'lockdown') {
    const rs = shuffle(M.rooms.filter(r => r.doors.length && !st.sealed.includes(r.i) && r.i !== M.objs[M.button].room)).slice(0, 3);
    for (const r of rs) closeDoors(st, r.i, now + E.ms);
    st.ev.rooms = rs.map(r => r.i);
  }
  if (k === 'drop') for (let i = 0; i < 3; i++) spawnCrate(st, now);
  if (k === 'spotlight') { const al = alive(st); st.ev.p = pick(al); }
  if (k === 'current') { const a = rnd(4) * Math.PI / 2; st.ev.dir = [Math.round(Math.cos(a)) * 1.6, Math.round(Math.sin(a)) * 1.6]; }
  return ev;
}
function spawnCrate(st, now) {
  if (st.crates.length >= 6) return;
  const M = M_(st), dyn = dynOf(st);
  for (let i = 0; i < 10; i++) {
    const q = randomSpot(M, dyn, -1), r = roomAt(M, q.x, q.y);
    if (r && (st.sealed.includes(r.i) || r.id === 'roof')) continue;
    st.crates.push({ id: ++st.crateSeq, x: q.x, y: q.y, k: pick(Object.keys(ITEMS)), until: now + 60000 });
    return;
  }
}

// ---------- tick ----------
function tick(st, now) {
  const dt = Math.min(0.2, Math.max(0, (now - st.last) / 1000));
  st.last = now;
  st.now = now;
  st.tickN++;
  if (st.phase === 'over') return null;
  const ev = [];
  const say = [];
  if (st.phase === 'intro') {
    if (now >= st.phaseEnd) { st.phase = 'play'; ev.push({ t: 'go' }); }
  } else if (st.phase === 'play') ev.push(...playTick(st, now, dt));
  else if (st.phase === 'meet') {
    ev.push(...BOT.meetTick(st, now));
    while (st.phase === 'meet' && st.sayQ.length && st.sayQ[0].at <= now) say.push(st.sayQ.shift());
    if (st.phase === 'meet' && now >= st.meet.voteEnd) ev.push(...endVote(st, now));
  } else if (st.phase === 'eject' && now >= st.phaseEnd) {
    st.meet = null;
    if (st.win) ev.push(...finish(st));
    else {
      st.phase = 'play';
      st.eject = null;
      for (const s of seatsOf(st)) st.players[s].killCd = now + st.o.killCd;
      st.btnReady = now + BUTTON_CD;
      st.sabCd = Math.max(st.sabCd, now + 10000);
      st.nextEv = Math.max(st.nextEv, now + 20000);
      if (st.tunnel && st.tunnel.at < now + 15000) st.tunnel = { at: now + 15000, until: now + 20000 };
      ev.push({ t: 'resume' }, ...checkWin(st, now));
    }
  }
  const out = { events: ev, changed: ev.length > 0 || st.tickN % 2 === 0 };
  if (say.length) out.say = say.map(x => ({ p: x.p, text: x.text }));
  return out;
}

function playTick(st, now, dt) {
  const M = M_(st), ev = [];
  // bot đi + quyết định
  ev.push(...BOT.tick(st, now, dt));
  if (st.phase !== 'play') return ev;
  let dyn = dynOf(st);
  for (const s of seatsOf(st)) {
    const p = st.players[s];
    if (p.ab && p.ab.until <= now) p.ab = null;
    if (p.ride && now >= p.ride.until) { const o = objOf(st, p.ride.to); p.ride = null; warpTo(st, p, o.x, o.y + 1); }
    if (p.hold != null && (!p.alive || !st.sab || dist(p, objOf(st, p.hold)) > USE_R + 0.5)) p.hold = null;
    if (!p.alive) continue;
    // lạnh (Bắc Cực): ngoài trời / lò sưởi tắt → cóng dần, vào nhà ấm lại
    if (M.cold) {
      const cold = (st.sab && st.sab.k === 'heater') || outdoorAt(M, p.x, p.y);
      p.cold = Math.max(0, Math.min(1.2, p.cold + (cold ? dt / 20 : -dt / 4)));
      if (p.cold >= 1) p.frozen = true; else if (p.cold < 0.5) p.frozen = false;
    }
    // dấu chân: ngoài trời ở bản đồ có tuyết, hoặc khắp nơi nếu có Thám Tử
    const detective = st.players.some(x => x.active && x.role === 'detective');
    if (p.vent == null && !p.ride && (detective || (M.prints && outdoorAt(M, p.x, p.y)))) {
      if (!p.lp || Math.hypot(p.x - p.lp.x, p.y - p.lp.y) > 0.9) {
        const ang = p.lp ? Math.atan2(p.y - p.lp.y, p.x - p.lp.x) : 0;
        st.prints.push({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, l: lookOf(st, s), a: Math.round(ang * 100) / 100, t: now, o: M.prints && outdoorAt(M, p.x, p.y) ? 1 : 0 });
        p.lp = { x: p.x, y: p.y };
      }
    }
    // nhặt thùng tiếp tế
    if (p.vent == null && !p.ride) for (const c of st.crates) {
      if (Math.hypot(p.x - c.x, p.y - c.y) > PICK_R) continue;
      if (c.k === 'shield') { if (p.shield) continue; p.shield = true; }
      else if (p.item) continue;
      else p.item = c.k;
      c.gone = true;
      ev.push({ t: 'pick', p: s, k: c.k, vis: [s] });
    }
  }
  st.crates = st.crates.filter(c => !c.gone && c.until > now);
  st.prints = st.prints.filter(f => now - f.t < PRINT_MS);
  if (st.prints.length > 700) st.prints.splice(0, st.prints.length - 700);
  for (const d of st.dolls) if (d.by != null) { const p = st.players[d.by]; d.x = p.x - p.dir * 0.7; d.y = p.y; if (blocked(M, dyn, d.x, d.y)) { d.x = p.x; } }
  // cửa sập hết giờ
  if (st.doors.some(d => d.until <= now)) { st.doors = st.doors.filter(d => d.until > now); dyn = dynOf(st); }
  // phá hoại
  const sab = st.sab;
  if (sab) {
    const S = SABS[sab.k];
    if (S.fix === 'both') {
      const cons = M.objs.filter(o => o.k === 'fix' && o.s === 'core');
      const held = cons.map(o => seatsOf(st).some(x => st.players[x].alive && st.players[x].hold === o.i));
      sab.held = held.filter(Boolean).length;
      if (held.every(Boolean)) ev.push(...sabFixed(st, now));
    } else if (S.fix === 'hold') {
      const any = seatsOf(st).some(x => st.players[x].alive && st.players[x].hold != null && fixable(st, objOf(st, st.players[x].hold)));
      if (any) sab.prog += dt * 1000;
      sab.held = any ? 1 : 0;
      if (sab.prog >= HOLD_MS) ev.push(...sabFixed(st, now));
    }
    if (st.sab === sab && sab.until && now >= sab.until) {
      if (sab.k === 'core') { st.win = { team: 'imp', why: `${M.core.name} — không ai sửa kịp!` }; ev.push(...finish(st)); return ev; }
      st.sab = null;
      if (sab.k === 'airlock') {
        ev.push({ t: 'suck', r: sab.r });
        for (const s of alive(st)) {
          const p = st.players[s], r = roomAt(M, p.x, p.y);
          if (!r || r.i !== sab.r || p.vent != null || p.ride) continue;
          let q;
          do q = randomSpot(M, dyn, -1); while (roomAt(M, q.x, q.y)?.i === sab.r);
          warpTo(st, p, q.x, q.y);
        }
      }
      if (sab.k === 'decouple' || sab.k === 'flood') ev.push(...seal(st, sab.r, now));
      if (sab.k === 'masq') ev.push({ t: 'fixed', k: 'masq' });
      ev.push(...checkWin(st, now));
      if (st.phase !== 'play') return ev;
    }
  }
  // biến cố
  if (st.ev && now >= st.ev.until) { ev.push({ t: 'evEnd', k: st.ev.k }); st.ev = null; }
  if (st.o.chaos && !st.ev && now >= st.nextEv) { ev.push(...startEvent(st, now)); st.nextEv = now + 45000 + rnd(30000); }
  if (st.o.items && now >= st.nextCrate) { spawnCrate(st, now); if (Math.random() < 0.5) spawnCrate(st, now); st.nextCrate = now + 45000 + rnd(30000); }
  // chui hầm (tàu)
  if (st.tunnel) {
    if (now >= st.tunnel.until) { const at = now + 35000 + rnd(12000); st.tunnel = { at, until: at + 5000 }; }
    else if (now >= st.tunnel.at && !st.tunnel.on) { st.tunnel.on = true; ev.push({ t: 'tunnel' }); }
  }
  if (st.sonar && now >= st.sonar.until) st.sonar = null;
  ev.push(...checkWin(st, now));
  return ev;
}

// ---------- view: mỗi người chỉ thấy phần của mình ----------
function view(st, seat) {
  const M = M_(st), me = st.players[seat], omni = seat < 0 || (me && !me.alive) || st.phase === 'over';
  const dyn = dynOf(st);
  const v = {
    map: st.map, phase: st.phase, now: st.now, phaseEnd: st.phaseEnd, me: seat, o: { talk: st.o.talk, vote: st.o.vote, killCd: st.o.killCd, voice: st.o.voice, reveal: st.o.reveal },
    names: st.players.map(p => (p.active ? p.name : null)),
    bots: st.players.map(p => p.active && p.kind === 'bot'),
    dead: st.players.map((p, i) => p.active && !p.alive && (omni || st.revealed.includes(i) || i === seat)),
    bar: taskBar(st), sab: st.sab && { k: st.sab.k, until: st.sab.until, at: st.sab.at, r: st.sab.r, prog: st.sab.prog, held: st.sab.held },
    doors: st.doors, sealed: st.sealed, ev: st.ev && { k: st.ev.k, until: st.ev.until, dir: st.ev.dir, rooms: st.ev.rooms },
    tunnel: st.tunnel && { at: st.tunnel.at, until: st.tunnel.until },
    crates: st.crates.map(c => ({ id: c.id, x: c.x, y: c.y })),
    meet: st.meet && { by: st.meet.by, body: st.meet.body, talkEnd: st.meet.talkEnd, voteEnd: st.meet.voteEnd, voted: Object.keys(st.meet.votes).map(Number),
      ...(omni ? { votes: st.meet.votes } : {}) },
    eject: st.eject, win: st.win, sonarCd: st.sonarCd, btnReady: st.btnReady,
    dolls: st.dolls.map(d => ({ x: d.x, y: d.y, l: st.ev && st.ev.k === 'camo' ? -1 : d.l, by: d.by === seat ? 1 : 0 })),
  };
  // người & xác nhìn thấy được
  v.ps = [];
  for (const s of seatsOf(st)) {
    const p = st.players[s];
    if (s !== seat && !canSee(st, seat, s)) continue;
    if (s === seat && p.ride) continue;
    v.ps.push({ p: s, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, d: p.dir, m: st.now - p.mvT < 200 ? 1 : 0, l: lookOf(st, s),
      g: p.alive ? 0 : 1, ...(p.doing && TASKS[objOf(st, p.doing.o).t]?.visual && p.team === 'crew' ? { sc: 1 } : {}), ...(invisible(st, p) ? { inv: 1 } : {}),
      ...(p.vent != null ? { vent: 1 } : {}), ...(p.frozen ? { fr: 1 } : {}) });
  }
  v.bodies = st.bodies.filter(b => omni || (me && Math.hypot(b.x - me.x, b.y - me.y) <= visionOf(st, me) && los(M, dyn, me.x, me.y, b.x, b.y))).map(b => ({ p: b.p, x: b.x, y: b.y }));
  // dấu chân: ngoài trời (bản đồ tuyết) ai cũng thấy; Thám Tử thấy cả trong nhà
  const det = me && me.alive && me.role === 'detective';
  v.prints = !me ? [] : st.prints.filter(f => (f.o || det) && Math.hypot(f.x - me.x, f.y - me.y) <= Math.min(10, visionOf(st, me) + 1))
    .map(f => [Math.round(f.x * 10), Math.round(f.y * 10), f.l, Math.round(f.a * 10), Math.round((st.now - f.t) / 100)]);   // [x*10, y*10, hình dạng, góc*10, tuổi/100ms]
  if (st.ev && st.ev.k === 'spotlight' && st.ev.p != null) { const p = st.players[st.ev.p]; if (p.alive && p.vent == null) v.spot = { x: p.x, y: p.y, l: lookOf(st, st.ev.p) }; }
  if (seat >= 0 && me) {
    const R = ROLES[me.role];
    v.self = {
      role: me.role, team: me.team, alive: me.alive, x: me.x, y: me.y, warp: me.warp, vent: me.vent, ride: me.ride && { to: me.ride.to, until: me.ride.until },
      tasks: me.tasks.map(t => ({ o: t.o, done: t.done })), doing: me.doing, killCd: me.killCd, abCd: me.abCd, ab: me.ab, item: me.item, fx: me.fx,
      shield: me.shield || st.gShield === seat, button: me.button, hold: me.hold, cold: me.cold, frozen: me.frozen, lover: me.lover, why: me.why,
      vision: Math.round(visionOf(st, me) * 100) / 100, seen: me.seen || [],
      ...(R.ab ? { abN: R.ab.n } : {}),
    };
    if (me.team === 'imp') { v.mates = seatsOf(st).filter(s => st.players[s].team === 'imp'); v.sabCd = st.sabCd; v.doorCd = st.doorCd; }
    if (me.role === 'guard') v.guarded = st.gShield;
    // radar / sonar: thấy vị trí mọi người còn sống
    if (me.fx.radar > st.now || (st.sonar && st.sonar.by === seat)) v.radar = alive(st).filter(s => s !== seat && st.players[s].vent == null).map(s => ({ x: st.players[s].x, y: st.players[s].y }));
    if (me.fx.compass > st.now && st.bodies.length) { const b = st.bodies.reduce((a, b) => (dist(me, a) < dist(me, b) ? a : b)); v.compass = { x: b.x, y: b.y }; }
  }
  if (omni) v.roles = st.players.map(p => (p.active ? p.role : null));
  if (omni) v.lovers = st.players.map(p => (p.active ? p.lover : null));
  v.hear = hearing(st, seat);
  return v;
}

// Đàm thoại theo khoảng cách: âm lượng người xem nghe từng ghế (chỉ ghế người thật).
// Người sống không nghe được hồn ma; hồn ma/người xem nghe hết. 'meet' = chỉ nghe nhau lúc họp, 'all' = luôn nghe hết.
function hearing(st, seat) {
  const out = {}, me = st.players[seat], M = M_(st), dyn = dynOf(st);
  const open = st.phase !== 'play' || st.o.voice === 'all';
  for (const s of seatsOf(st)) {
    const p = st.players[s];
    if (p.kind !== 'human' || s === seat) continue;
    if (st.phase === 'over' || seat < 0 || !me.alive || st.o.voice === 'all') { out[s] = 1; continue; }
    if (!p.alive) { out[s] = 0; continue; }
    if (open) { out[s] = 1; continue; }
    if (st.o.voice === 'meet' || p.ride || me.ride) { out[s] = 0; continue; }
    const d = dist(me, p);
    let vol = d <= 2 ? 1 : Math.max(0, 1 - (d - 2) / (HEAR_R - 2));
    if (vol > 0 && !los(M, dyn, me.x, me.y, p.x, p.y)) vol *= 0.45;
    out[s] = Math.round(vol * 100) / 100;
  }
  return out;
}

function viewEvents(events, seat, st) {
  const me = st.players[seat], omni = seat < 0 || (me && !me.alive);
  return events.filter(e => !e.vis || (e.priv ? e.vis.includes(seat) : omni || e.vis.includes(seat))).map(e => {
    if (!e.vis) return e;
    const { vis, priv, ...rest } = e;
    return rest;
  });
}

// Chat: người sống chỉ chat lúc họp; hồn ma (và người xem, Thầy Đồng) chat riêng với nhau ở kênh 👻.
function chatTo(st, seat) {
  const me = st.players[seat];
  const ghostCh = { to: [-1, ...seatsOf(st).filter(s => !st.players[s].alive || st.players[s].role === 'medium')], tag: '👻' };
  if (seat < 0 || !me.alive) return ghostCh;
  if (st.phase === 'meet' || st.phase === 'eject') return undefined;
  if (me.role === 'medium') return ghostCh;
  return 'Chỉ chat được trong cuộc họp 🤫 (bấm 📢 hoặc báo cáo xác để họp)';
}

// Thứ hạng: phe thắng đồng hạng nhất, còn lại đồng hạng nhì.
function result(st) {
  const w = (st.win && st.win.seats) || [];
  return seatsOf(st).map(p => ({ p, s: w.includes(p) ? 1 : 0 })).sort((a, b) => b.s - a.s);
}

// API cho bot (server-bot.js) — dùng chung luật, không đọc trộm thông tin.
const BOT = makeBots({ act, canSee, visionOf, seersOf, lookOf, dynOf, alive, seatsOf, taskBar, fixable, near, objOf });

export default {
  tickRate: TICK,
  create, act, tick, view, viewEvents, chatTo, result,
  isOver: st => st.phase === 'over',
};
