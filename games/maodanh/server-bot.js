// 🛸 Kẻ Mạo Danh — bot. Chỉ dùng thông tin bot đó được thấy (canSee/seersOf như người thật), nhớ ai ở đâu lúc nào,
// thấy giết/chui cống thì tố cáo; lúc họp nói vài câu soạn sẵn và bỏ phiếu theo mức nghi ngờ (hoặc theo số đông).
// File tên server* nên không bị phục vụ ra trình duyệt.
import { getMap, findPath, blocked, roomAt, roomName, randomSpot, los } from './maps.js';
import { USE_R, KILL_R, REPORT_R, ABIL_R, TASKS, ROLES, SABS } from './data.js';
import { moveMods } from './rules.js';

const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function makeBots(A) {
  const M_ = st => getMap(st.map);

  function init(st) {
    st.players.forEach(p => {
      if (p.active && p.kind === 'bot') p.bot = { think: 0, path: null, goal: null, seen: {}, pair: {}, sus: {}, clear: {}, fdone: [], later: {}, witness: null, vent: null, stuck: 0, lastD: 0, said: 0 };
    });
  }

  // Bot làm hành động qua đúng luật như người thật; trả về thành công hay không.
  const doAct = (st, s, a, now, ev) => { const r = A.act(st, s, a, now); if (r.ok && r.events) ev.push(...r.events); return r.ok; };

  function setGoal(st, s, g) {
    const p = st.players[s], b = p.bot;
    b.goal = g;
    b.path = null;
    b.stuck = 0;
    b.taskEnd = 0;   // đổi mục tiêu giữa chừng = bỏ dở nhiệm vụ đang làm
    if (!g) return;
    if (!p.alive) { b.path = [[g.x, g.y]]; return; }
    b.path = findPath(M_(st), A.dynOf(st), p.x, p.y, g.x, g.y);
    if (!b.path) b.goal = null;
  }

  // Người bot nhìn thấy: ghi nhớ vị trí, ai đang quét y tế thì coi như trong sạch.
  function observe(st, s, now) {
    const p = st.players[s], b = p.bot, M = M_(st);
    for (const t of A.seatsOf(st)) {
      if (t === s || !st.players[t].alive || !A.canSee(st, s, t)) continue;
      const l = A.lookOf(st, t);
      if (l < 0) continue;
      const T = st.players[t];
      b.seen[l] = { x: T.x, y: T.y, t: now, r: roomName(M, T.x, T.y) };
      if (T.doing && TASKS[M.objs[T.doing.o].t].visual && T.team === 'crew' && l === t) b.clear[t] = true;
    }
    // ai đi cùng ai (trong 4 ô) — lúc họp, người cuối cùng được thấy đi cùng nạn nhân bị nghi
    const vis = Object.entries(b.seen).filter(([, x]) => x.t === now);
    for (const [a, x] of vis) for (const [c, y] of vis) if (a !== c && Math.hypot(x.x - y.x, x.y - y.y) < 4) (b.pair[a] ||= {})[c] = now;
    if (st.players[s].alive) for (const [a, x] of vis) if (Math.hypot(x.x - st.players[s].x, x.y - st.players[s].y) < 4) (b.pair[a] ||= {})[s] = now;
  }
  function visibleBodies(st, s) {
    const p = st.players[s], M = M_(st), dyn = A.dynOf(st), r = A.visionOf(st, p);
    return st.bodies.filter(x => Math.hypot(x.x - p.x, x.y - p.y) <= r && los(M, dyn, p.x, p.y, x.x, x.y));
  }
  const sus = (b, t, n) => { b.sus[t] = (b.sus[t] || 0) + n; };

  function nextTask(st, s) {
    const p = st.players[s], b = p.bot;
    const left = p.tasks.filter(t => !t.done && !b.fdone.includes(t.o) && !(b.later[t.o] > st.now) && !st.sealed.includes(M_(st).objs[t.o].room));
    if (!left.length) return null;
    left.sort((x, y) => dist(p, M_(st).objs[x.o]) - dist(p, M_(st).objs[y.o]));
    return Math.random() < 0.7 ? left[0] : pick(left);
  }

  function wander(st, s) {
    const M = M_(st), q = randomSpot(M, A.dynOf(st), -1);
    if (!st.sealed.includes(roomAt(M, q.x, q.y)?.i)) setGoal(st, s, { k: 'walk', x: q.x, y: q.y, wait: 1500 + rnd(4000) });
  }

  // ---------- quyết định (mỗi ~0.3s) ----------
  function think(st, s, now, ev) {
    const p = st.players[s], b = p.bot, M = M_(st);
    if (p.vent != null) {   // đang trong cống: đổi cống rồi chui ra
      if (!b.ventOut) b.ventOut = now + 600 + rnd(1200);
      if (now >= b.ventOut) {
        b.ventOut = 0;
        const from = M.objs[p.vent], others = M.objs.filter(o => o.k === 'vent' && o.g === from.g && o.i !== from.i && !st.sealed.includes(o.room));
        if (others.length && Math.random() < 0.8) doAct(st, s, { type: 'vent', to: pick(others).i }, now, ev);
        doAct(st, s, { type: 'unvent' }, now, ev);
        wander(st, s);
      }
      return;
    }
    if (!p.alive) return ghostThink(st, s, now, ev);
    observe(st, s, now);
    const imp = p.team === 'imp';
    const crit = st.sab && SABS[st.sab.k].crit;

    // dùng vật phẩm
    if (p.item && ['shoes', 'compass', 'radar'].includes(p.item)) doAct(st, s, { type: 'item' }, now, ev);
    if (p.item === 'flash' && (st.sab?.k === 'lights' || st.ev?.k === 'blackout')) doAct(st, s, { type: 'item' }, now, ev);
    if (p.item === 'whistle' && !imp && b.witness && b.witness.k >= 0 && !crit) { doAct(st, s, { type: 'item' }, now, ev); return; }

    // thấy xác
    const bodies = visibleBodies(st, s);
    for (const x of bodies) {
      if (!b.bodySeen?.includes(x.p)) {
        (b.bodySeen ||= []).push(x.p);
        if (!imp) for (const t of A.seatsOf(st)) if (t !== s && A.canSee(st, s, t) && dist(st.players[t], x) < 3.2 && !b.clear[t]) sus(b, A.lookOf(st, t), 30);
      }
      if (p.role === 'detective' && !(p.seen || []).includes(x.p) && dist(p, x) <= REPORT_R - 0.3) doAct(st, s, { type: 'ability', b: x.p }, now, ev);
    }
    const reportable = bodies.filter(x => !imp || Math.random() < 0.15 || A.seatsOf(st).some(t => t !== s && st.players[t].team !== 'imp' && A.canSee(st, s, t)));
    if (reportable.length && !(imp && b.noReport > now)) {
      const x = reportable[0];
      if (dist(p, x) <= REPORT_R - 0.4) { doAct(st, s, { type: 'report', b: x.p }, now, ev); return; }
      if (!b.goal || b.goal.k !== 'report') setGoal(st, s, { k: 'report', x: x.x, y: x.y, b: x.p });
      if (b.goal && b.goal.k === 'report') return;
    } else if (imp && bodies.length && !b.noReport) b.noReport = now + 4000;

    // Cảnh Sát bắn kẻ mình tận mắt thấy giết người / chui cống
    if (p.role === 'sheriff' && now >= p.abCd) {
      for (const t of A.seatsOf(st)) {
        if (t === s || !A.canSee(st, s, t) || (b.sus[A.lookOf(st, t)] || 0) < 900 || A.lookOf(st, t) !== t) continue;
        if (dist(p, st.players[t]) <= KILL_R - 0.2) { doAct(st, s, { type: 'ability', to: t }, now, ev); return; }
        setGoal(st, s, { k: 'chase', x: st.players[t].x, y: st.players[t].y, t });
        return;
      }
    }
    // Hộ Vệ: đặt khiên cho người đứng gần
    if (p.role === 'guard' && now >= p.abCd) {
      const t = A.seatsOf(st).find(t => t !== s && st.players[t].alive && A.canSee(st, s, t) && dist(p, st.players[t]) <= ABIL_R - 0.3);
      if (t != null) doAct(st, s, { type: 'ability', to: t }, now, ev);
    }

    // sửa phá hoại
    // không phải ai cũng chạy đi sửa (mỗi bot tự quyết một lần cho mỗi sự cố)
    if (st.sab && !imp) {
      if (!b.resp || b.resp.at !== st.sab.at) b.resp = { at: st.sab.at, go: Math.random() < ({ core: 0.8, lights: 0.45, heater: 0.6, flood: 0.4, decouple: 0.4 }[st.sab.k] ?? 0) };
      if (b.resp.go && fixSab(st, s, now, ev)) return;
    }

    if (imp && impThink(st, s, now, ev)) return;

    // nhặt thùng tiếp tế trong tầm mắt
    if (!p.item || !p.shield) {
      const c = st.crates.find(c => dist(p, c) < A.visionOf(st, p) && los(M, A.dynOf(st), p.x, p.y, c.x, c.y));
      if (c && (!b.goal || b.goal.k !== 'crate')) { setGoal(st, s, { k: 'crate', x: c.x, y: c.y }); if (b.goal) return; }
    }

    workTasks(st, s, now, ev);
  }

  function workTasks(st, s, now, ev) {
    const p = st.players[s], b = p.bot, M = M_(st);
    if (b.goal && b.goal.k === 'task') {
      const o = M.objs[b.goal.o];
      if (b.taskEnd) {
        if (now < b.taskEnd) return;
        b.taskEnd = 0;
        if (p.team === 'crew') { if (!doAct(st, s, { type: 'task', o: o.i }, now, ev)) b.later[o.i] = now + 5000; }
        else b.fdone.push(o.i);
        b.goal = null;
        return;
      }
      if (dist(p, o) <= USE_R - 0.25 && (!b.path || !b.path.length)) {
        const okUse = p.team === 'crew' ? doAct(st, s, { type: 'use', o: o.i }, now, ev) : true;
        if (!okUse) { b.later[o.i] = now + 5000; b.goal = null; return; }
        b.taskEnd = now + TASKS[o.t].ms * 1.4 + 1000 + rnd(2500);   // người thật mất vài giây cho mỗi mini-game
        return;
      }
      if (b.path) return;
    }
    if (b.goal && b.goal.k !== 'task' && b.path && b.path.length) return;
    if (b.goal && b.goal.k === 'walk' && !b.waitUntil) { b.waitUntil = now + b.goal.wait; return; }
    if (b.waitUntil && now < b.waitUntil) return;
    b.waitUntil = 0;
    const t = nextTask(st, s);
    if (t) { const o = M.objs[t.o]; setGoal(st, s, { k: 'task', o: o.i, x: o.x, y: o.y }); if (!b.goal) b.later[o.i] = now + 5000; }
    else wander(st, s);
  }

  function fixSab(st, s, now, ev) {
    const p = st.players[s], b = p.bot, M = M_(st), k = st.sab.k;
    if (p.hold != null && A.fixable(st, M.objs[p.hold])) return true;
    let cons = M.objs.filter(o => A.fixable(st, o));
    if (!cons.length) return false;
    if (k === 'core') {   // bàn chưa ai giữ trước
      const free = cons.filter(o => !A.seatsOf(st).some(x => x !== s && st.players[x].hold === o.i));
      if (free.length) cons = free;
    }
    const o = cons.reduce((a, c) => (dist(p, a) < dist(p, c) ? a : c));
    if (dist(p, o) <= USE_R - 0.25) {
      if (k === 'lights') { if (!b.fixAt) b.fixAt = now + 1200 + rnd(1200); if (now >= b.fixAt) { b.fixAt = 0; doAct(st, s, { type: 'fix', o: o.i }, now, ev); } return true; }
      doAct(st, s, { type: 'use', o: o.i }, now, ev);
      return true;
    }
    if (!b.goal || b.goal.k !== 'fix' || b.goal.o !== o.i) setGoal(st, s, { k: 'fix', o: o.i, x: o.x, y: o.y });
    return !!b.goal;
  }

  // Kẻ Mạo Danh: giết khi không ai thấy, chạy trốn qua cống, phá hoại, giả vờ làm nhiệm vụ.
  function impThink(st, s, now, ev) {
    const p = st.players[s], b = p.bot, M = M_(st), dyn = A.dynOf(st);
    // phá hoại
    if (!st.sab && now >= st.sabCd && Math.random() < 0.025) {
      const r = Math.random();
      let a;
      if (r < 0.35) a = { k: 'lights' };
      else if (r < 0.58) a = { k: 'core' };
      else if (r < 0.88 && M.special) {
        a = { k: M.special };
        if (M.special === 'airlock') { const crowd = A.seatsOf(st).find(t => st.players[t].team !== 'imp' && st.players[t].alive && A.canSee(st, s, t)); const rr = crowd != null ? roomAt(M, st.players[crowd].x, st.players[crowd].y) : null; a.r = rr && rr.i !== M.objs[M.button].room ? rr.i : pick(M.rooms.filter(x => x.i !== M.objs[M.button].room)).i; }
        if (M.special === 'flood') { const c = M.rooms.filter(x => x.sealable && !st.sealed.includes(x.i)); if (!c.length) a = { k: 'lights' }; else a.r = pick(c).i; }
        if (M.special === 'decouple' && st.sealed.includes(M.byId.c6?.i)) a = { k: 'lights' };
      } else { const rr = pick(M.rooms.filter(x => x.doors.length && !st.sealed.includes(x.i) && x.id !== 'roof')); a = { k: 'doors', r: rr.i }; }
      doAct(st, s, { type: 'sab', ...a }, now, ev);
    }
    if (now < p.killCd || p.ride) { b.hunt = null; b.patience = 0; b.careful = undefined; return false; }
    // không lao vào giết ngay khi vừa hồi chiêu — giả vờ làm nhiệm vụ một lúc đã
    if (!b.patience) b.patience = now + 5000 + rnd(15000);
    if (now < b.patience && b.hunt == null) return false;
    const R = ROLES[p.role];
    const targets = A.seatsOf(st).filter(t => t !== s && st.players[t].alive && st.players[t].team !== 'imp' && A.canSee(st, s, t) && st.players[t].vent == null);
    for (const t of targets.sort((x, y) => dist(p, st.players[x]) - dist(p, st.players[y]))) {
      const T = st.players[t];
      // nhân chứng: người còn sống (không phải đồng bọn, không phải mục tiêu) nhìn thấy mình hoặc mục tiêu
      const wit = new Set([...A.seersOf(st, T.x, T.y), ...A.seersOf(st, p.x, p.y)]);
      // bot không để ý hết mọi thứ: nhân chứng ở xa (> 5 ô) dễ bị bỏ sót
      const bad = [...wit].some(w => w !== s && w !== t && st.players[w].team !== 'imp' && (Math.min(dist(st.players[w], T), dist(st.players[w], p)) < 5 || (b.careful ??= Math.random() < 0.65)));
      if (bad) continue;
      if (dist(p, T) > 8) continue;
      if (R.ab && now >= p.abCd && dist(p, T) < 5) {
        if (p.role === 'shifter') { const other = A.alive(st).filter(x => x !== s && x !== t); if (other.length) doAct(st, s, { type: 'ability', to: pick(other) }, now, ev); }
        if (p.role === 'phantom') doAct(st, s, { type: 'ability' }, now, ev);
      }
      if (dist(p, T) <= KILL_R - 0.25) {
        if (doAct(st, s, { type: 'kill', to: t }, now, ev)) {
          b.hunt = null;
          b.noReport = now + 6000;
          // chạy trốn: cống gần thì chui, không thì đi chỗ khác
          const vent = M.objs.filter(o => o.k === 'vent' && !st.sealed.includes(o.room)).sort((x, y) => dist(p, x) - dist(p, y))[0];
          if (vent && dist(p, vent) < 7 && Math.random() < 0.7) setGoal(st, s, { k: 'vent', o: vent.i, x: vent.x, y: vent.y });
          else wander(st, s);
          return true;
        }
      }
      b.hunt = t;
      setGoal(st, s, { k: 'hunt', x: T.x, y: T.y, t });
      return true;
    }
    if (b.goal && b.goal.k === 'vent') {
      const o = M.objs[b.goal.o];
      if (dist(p, o) <= USE_R - 0.3) { doAct(st, s, { type: 'use', o: o.i }, now, ev); b.goal = null; }
      return true;
    }
    b.hunt = null;
    return false;
  }

  // Hồn ma: phi hành đoàn làm nốt nhiệm vụ, Kẻ Mạo Danh thỉnh thoảng phá hoại.
  function ghostThink(st, s, now, ev) {
    const p = st.players[s], b = p.bot;
    if (p.team === 'imp' && !st.sab && now >= st.sabCd && Math.random() < 0.015) doAct(st, s, { type: 'sab', k: Math.random() < 0.6 ? 'lights' : 'core' }, now, ev);
    if (p.team !== 'crew') { if (!b.path || !b.path.length) { if (!b.waitUntil) b.waitUntil = now + 3000 + rnd(5000); else if (now >= b.waitUntil) { b.waitUntil = 0; wander(st, s); } } return; }
    workTasks(st, s, now, ev);
  }

  // ---------- di chuyển theo đường đã tìm ----------
  function move(st, s, now, dt) {
    const p = st.players[s], b = p.bot;
    if (p.vent != null || p.ride || p.hold != null || b.taskEnd) return;
    if (b.goal && (b.goal.k === 'hunt' || b.goal.k === 'chase')) {   // đuổi theo: cập nhật đích theo mục tiêu
      const T = st.players[b.goal.t];
      if (T && T.alive && A.canSee(st, s, b.goal.t) && (Math.abs(T.x - b.goal.x) > 1 || Math.abs(T.y - b.goal.y) > 1)) setGoal(st, s, { ...b.goal, x: T.x, y: T.y });
    }
    if (!b.path || !b.path.length) return;
    const M = M_(st), dyn = A.dynOf(st);
    const [tx, ty] = b.path[0];
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 0.08) { b.path.shift(); return; }
    const sp = moveMods(st, p, M).speed, step = Math.min(d, sp * dt);
    const nx = p.x + dx / d * step, ny = p.y + dy / d * step;
    if (p.alive && blocked(M, dyn, nx, ny)) {
      if (++b.stuck > 10) { const g = b.goal; b.goal = null; b.path = null; if (g && g.k !== 'walk') setGoal(st, s, g); if (!b.goal) wander(st, s); }
      return;
    }
    p.x = nx; p.y = ny;
    p.mvT = now;
    if (Math.abs(dx) > 0.05) p.dir = dx > 0 ? 1 : -1;
  }

  function tick(st, now, dt) {
    const ev = [];
    for (const s of A.seatsOf(st)) {
      const p = st.players[s];
      if (p.kind !== 'bot' || !p.bot) continue;
      if (now >= p.bot.think) {
        p.bot.think = now + 250 + rnd(150);
        think(st, s, now, ev);
        if (st.phase !== 'play') return ev;
      }
      move(st, s, now, dt);
    }
    return ev;
  }

  // ---------- nhân chứng ----------
  function sawKill(st, k, v, vis, now) {
    const l = A.lookOf(st, k);
    for (const s of vis) {
      const p = st.players[s];
      if (s === k || s === v || !p.bot || !p.alive || p.team === 'imp') continue;
      if (l >= 0) p.bot.sus[l] = 999;
      p.bot.witness = { k: l, v, at: now };
    }
  }
  function sawVent(st, s0, vis) {
    const l = A.lookOf(st, s0);
    if (l < 0) return;
    for (const s of vis) {
      const p = st.players[s];
      if (!p.bot || !p.alive || p.team === 'imp') continue;
      p.bot.sus[l] = Math.max(p.bot.sus[l] || 0, 950);
      p.bot.vent = l;
    }
  }
  function inspected(st, s, list) {
    const p = st.players[s];
    if (!p.bot) return;
    for (const x of list) p.bot.sus[x] = (p.bot.sus[x] || 0) + 45;
    p.bot.detect = list;
  }

  // ---------- họp ----------
  function meeting(st, now) {
    const M = M_(st), m = st.meet, name = x => st.players[x].name;
    st.sayQ = [];
    const deadNow = A.seatsOf(st).filter(x => !st.players[x].alive);
    const bodyAt = m.bodyAt;
    // lời tố cáo nói ra trong họp: { by, ts: [nghi ai], w: sức nặng } — bot khác nghe rồi cân nhắc
    const claims = [];
    let order = 0;
    for (const s of A.seatsOf(st)) {
      const p = st.players[s], b = p.bot;
      if (!b) continue;
      b.goal = null; b.path = null; b.taskEnd = 0; b.waitUntil = 0; b.bodySeen = []; b.hunt = null;
      if (!p.alive) continue;
      b.voted = false;
      // ai được thấy gần chỗ xác trong 25 giây trước → nghi ngờ
      if (bodyAt && p.team !== 'imp') for (const [l, x] of Object.entries(b.seen)) {
        if (+l !== s && now - x.t < 25000 && Math.hypot(x.x - bodyAt.x, x.y - bodyAt.y) < 8 && !b.clear[l]) sus(b, +l, 20);
      }
      // người cuối cùng được thấy đi cùng người vừa chết
      if (p.team !== 'imp') for (const d of deadNow) {
        if ((b.mourned ||= []).includes(d)) continue;
        b.mourned.push(d);
        for (const [x, t] of Object.entries(b.pair[d] || {})) if (+x !== s && now - t < 35000 && !b.clear[x]) sus(b, +x, now - t < 15000 ? 35 : 20);
      }
      for (const d of deadNow) delete b.sus[d];
      const lines = [];
      const room = b.seen[s]?.r || roomName(M, p.x, p.y);
      if (m.by === s && m.body != null) lines.push(`Xác của ${name(m.body)} ở ${bodyAt ? roomName(M, bodyAt.x, bodyAt.y) : 'đâu đó'}!`);
      else if (m.by === s) lines.push(pick(['Mình gọi họp để điểm danh!', 'Họp nhanh nào, có gì đó không ổn.']));
      if (p.team === 'imp') {
        const crew = A.alive(st).filter(x => st.players[x].team !== 'imp' && x !== s);
        if (Math.random() < 0.2 && crew.length) { const x = pick(crew); lines.push(pick([`Mình thấy ${name(x)} đi ra từ chỗ đó, đáng ngờ lắm!`, `${name(x)} nãy giờ cứ lảng vảng một mình...`])); b.lie = x; claims.push({ by: s, ts: [x], w: 15 }); }
        else if (Math.random() < 0.6) lines.push(`Mình ở ${pick(M.rooms.filter(r => !r.noTask)).name} làm nhiệm vụ.`);
      } else if (p.role === 'jester') {
        if (Math.random() < 0.5) lines.push(pick(['Vote mình đi, mình là kẻ mạo danh đây 😈', 'Mình không nói gì đâu 🤐', 'Hehe, đoán xem ai giết? 🤡']));
      } else {
        const w = b.witness;
        const top = Object.entries(b.sus).filter(([l]) => +l !== s && st.players[+l]?.alive).sort((x, y) => y[1] - x[1])[0];
        if (w && w.k >= 0 && st.players[w.k]?.alive) { lines.push(`Mình TẬN MẮT thấy ${name(w.k)} giết ${name(w.v)}!`); claims.push({ by: s, ts: [w.k], w: 60 }); }
        else if (b.vent != null && st.players[b.vent]?.alive) { lines.push(`${name(b.vent)} chui cống! Mình thấy rõ ràng!`); claims.push({ by: s, ts: [b.vent], w: 50 }); }
        else if (b.detect && b.detect.length) { lines.push(`Mình là Thám Tử: hung thủ là ${b.detect.map(name).join(' hoặc ')}.`); claims.push({ by: s, ts: b.detect, w: 40 }); }
        else if (top && top[1] >= 20) { lines.push(pick([`Mình thấy ${name(+top[0])} ở gần đó lúc nãy...`, `${name(+top[0])} hơi đáng ngờ đấy.`])); claims.push({ by: s, ts: [+top[0]], w: 15 }); }
        else if (Math.random() < 0.6) lines.push(pick([`Mình ở ${room}, không thấy gì cả.`, 'Chưa đủ bằng chứng, bỏ qua đi.', `Mình đang làm nhiệm vụ ở ${room}.`]));
        const cleared = Object.keys(b.clear).map(Number).filter(x => st.players[x].alive && x !== s);
        if (cleared.length && Math.random() < 0.5) lines.push(`${name(cleared[0])} quét y tế rồi, trong sạch nhé.`);
      }
      lines.slice(0, 2).forEach((text, i) => {
        const at = now + 1500 + order * 900 + rnd(Math.max(1000, st.o.talk - 6000)) + i * 2500;
        st.sayQ.push({ at: Math.min(at, m.voteEnd - 3000), p: s, text });
      });
      order++;
      b.witness = null; b.vent = null; b.detect = null;
    }
    st.sayQ.sort((a, b) => a.at - b.at);
    for (const s of A.alive(st)) {
      const p = st.players[s], b = p.bot;
      if (!b) continue;
      // nghe tố cáo: càng tin người nói (quét y tế rồi / ít nghi) càng nghi người bị tố; bị tố oan thì nghi ngược lại người tố
      if (p.team !== 'imp') for (const c of claims) {
        if (c.by === s) continue;
        const trust = b.clear[c.by] ? 1 : Math.max(0.2, 1 - (b.sus[c.by] || 0) / 60);
        if (c.ts.includes(s)) { if (!b.clear[c.by]) sus(b, c.by, 30); continue; }
        for (const t of c.ts) if (!b.clear[t] && st.players[t]?.alive) sus(b, t, c.w * trust / c.ts.length);
      }
      // chắc chắn thì bỏ phiếu sớm, còn phân vân thì đợi xem người khác chọn ai rồi mới quyết
      const sure = p.team !== 'imp' && A.alive(st).some(x => x !== s && !b.clear[x] && (b.sus[x] || 0) >= 40);
      b.voteAt = sure ? m.talkEnd + 800 + rnd(Math.min(5000, st.o.vote / 4))
        : m.talkEnd + st.o.vote * 0.3 + rnd(st.o.vote * 0.55);
    }
  }

  function meetTick(st, now) {
    const ev = [];
    if (now < st.meet.talkEnd) return ev;
    for (const s of A.alive(st)) {
      const p = st.players[s], b = p.bot;
      if (!b || b.voted || now < b.voteAt || st.meet.votes[s] != null) continue;
      b.voted = true;
      doAct(st, s, { type: 'vote', to: decideVote(st, s) }, now, ev);
      if (st.phase !== 'meet') break;
    }
    return ev;
  }

  function decideVote(st, s) {
    const p = st.players[s], b = p.bot, live = A.alive(st).filter(x => x !== s);
    const tally = {};
    for (const [v, t] of Object.entries(st.meet.votes)) if (t >= 0 && +v !== s) tally[t] = (tally[t] || 0) + 1;
    const lead = Object.entries(tally).sort((x, y) => y[1] - x[1])[0];
    if (p.team === 'imp') {
      if (lead && st.players[+lead[0]].team !== 'imp' && Math.random() < 0.75) return +lead[0];
      if (b.lie != null && st.players[b.lie].alive && Math.random() < 0.6) return b.lie;
      return Math.random() < 0.5 ? pick(live.filter(x => st.players[x].team !== 'imp')) ?? -1 : -1;
    }
    if (p.role === 'jester') return Math.random() < 0.5 && live.length ? pick(live) : -1;
    const cand = live.filter(x => !b.clear[x]).map(x => [x, b.sus[x] || 0]).sort((x, y) => y[1] - x[1]);
    if (cand.length && cand[0][1] >= 30) return cand[0][0];
    // theo số đông: càng nhiều người chọn (và chính mình càng nghi) thì càng dễ theo
    if (lead && +lead[0] !== s && !b.clear[+lead[0]] && Math.random() < Math.min(0.9, 0.25 + 0.2 * lead[1] + (b.sus[+lead[0]] || 0) / 50)) return +lead[0];
    if (cand.length && cand[0][1] >= 10 && Math.random() < 0.7) return cand[0][0];
    // không có manh mối: thỉnh thoảng vẫn đoán bừa trong nửa đáng ngờ hơn
    return cand.length && Math.random() < 0.3 ? pick(cand.slice(0, Math.ceil(cand.length / 2)))[0] : -1;
  }

  return { init, tick, meeting, meetTick, sawKill, sawVent, inspected };
}
