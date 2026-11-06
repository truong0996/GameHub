// 🕵️ Mật Danh (Codenames) — luật (chạy trên server: biết màu mọi lá, view() che với người đoán).
// Hàm thuần: không I/O, không Date.now(). Xem "Game server interface" trong CLAUDE.md.
//
// Lượt của một đội: Trưởng nhóm ra gợi ý "từ + số" (turn() = { seat }) → người đoán trong đội BỎ PHIẾU chỉ lá cùng lúc
//   (turn() = { seats, key }): một lá được quá nửa số phiếu (không tính người bỏ phiếu trắng 'any') thì lật. Đúng màu đội
//   thì đoán tiếp (tối đa số + 1), sai thì hết lượt, trúng sát thủ thì thua (3 đội: bị loại). Mọi người đã bầu mà chưa
//   ai quá nửa = "chia phiếu": người thật được bầu lại, hết giờ thì lá nhiều phiếu nhất được lật (hoà thì bốc thăm).
//   Người thật bầu trước, bot bầu sau (để bot nghe theo đồng đội).
import { TEAMS, PACE, EVENT_KEYS, SKILL_KEYS, SPECIALS, UNLIMITED, INF, teamOfSeat, normClue, clueProblem, animDuration } from './data.js';
import { deck } from './words.js';
import { botAction } from './server-bot.js';

const rnd = n => (Math.random() * n) | 0;
const pick = a => a[rnd(a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fail = err => ({ ok: false, err });
const hidden = (st, c) => !st.cards[c].rev;
const unrevealed = st => st.cards.map((c, i) => (c.rev ? -1 : i)).filter(i => i >= 0);
const liveTeams = st => st.order.filter(t => !st.teams[t].out);
const isSpy = (st, seat) => !!st.players[seat] && st.teams[st.players[seat].team].spy === seat;

// ---------- tạo ván ----------
function create({ seats, opts }) {
  const T = opts.teams === 3 ? 3 : 2;
  const players = seats.map((s, i) => (s ? { name: s.name, kind: s.kind, team: teamOfSeat(i) } : null));
  const extra = players.find(p => p && p.team >= T);
  if (extra) throw new Error(`Chế độ ${T} đội: ghế đội ${TEAMS[extra.team].name} không được dùng — hãy đổi sang ghế đội khác`);
  const teams = [];
  for (let t = 0; t < T; t++) {
    const members = players.map((p, i) => (p && p.team === t ? i : -1)).filter(i => i >= 0);
    if (members.length < 2) throw new Error(`Đội ${TEAMS[t].name} cần ít nhất 2 người/bot (1 Trưởng nhóm + 1 người đoán)`);
    teams.push({ members, spy: members[0], ops: members.slice(1), left: 0, out: false, skip: false,
      skills: opts.skills ? shuffle(SKILL_KEYS.slice()).slice(0, 2).map(k => ({ k, used: false })) : [] });
  }
  const order = shuffle([...Array(T).keys()]);
  const counts = T === 3 ? [10, 9, 8] : [9, 8], nNeutral = T === 3 ? 8 : 7;
  const N = counts.reduce((a, b) => a + b, 0) + nNeutral + 1;
  const words = deck(opts.pack, N);
  const kinds = [...order.flatMap((t, i) => Array(counts[i]).fill(t)), ...Array(nNeutral).fill('n'), 'a'];
  shuffle(kinds);
  const cards = words.map((x, i) => ({ id: i, w: x.w, ...(x.nm ? { nm: x.nm } : {}), k: kinds[i], rev: false, by: null, sp: null, mk: [], fog: false }));
  order.forEach((t, i) => { teams[t].left = counts[i]; });
  if (opts.specials) {
    const pool = shuffle(['gold', 'orb', 'traitor', 'bomb', 'star', 'star', ...(T === 3 ? ['gold', 'star'] : [])]).slice(0, T === 3 ? 6 : 4);
    for (const sp of pool) {
      const ok = cards.filter(c => !c.sp && (SPECIALS[sp].on === 'n' ? c.k === 'n' : typeof c.k === 'number'));
      if (ok.length) pick(ok).sp = sp;
    }
  }
  const st = {
    T, pic: (opts.pack === 'pic'), pack: opts.pack, pace: PACE[opts.pace] ? opts.pace : 'normal', events: !!opts.events, skills: !!opts.skills, specials: !!opts.specials,
    players, teams, cards, order, cur: order[0], phase: 'clue', clue: null, votes: {}, vk: 0, split: false, fx: {}, jam: null,
    turnNo: 0, nextEv: 2 + rnd(2), event: null, lastEv: null, hist: [], winner: null, uid: N,
  };
  const ev = [{ t: 'start', first: st.cur }];
  startTurn(st, ev);
  return { state: st, events: ev };
}

// ---------- lượt ----------
function startTurn(st, ev) {
  st.turnNo++;
  Object.assign(st, { phase: 'clue', clue: null, votes: {}, split: false, fx: {}, event: null });
  st.vk++;
  if (st.jam === st.cur) { st.fx.jam = true; st.jam = null; }
  ev.push({ t: 'turn', team: st.cur, n: st.turnNo });
  if (st.events && st.turnNo >= st.nextEv) {
    st.nextEv = st.turnNo + 2 + rnd(2);
    for (const k of shuffle(EVENT_KEYS.filter(k => k !== st.lastEv))) {
      const e = applyEvent(st, k);
      if (!e) continue;
      st.event = st.lastEv = k;
      ev.push({ t: 'ev', k, ...e });
      break;
    }
  }
}

// Đội đang thua (còn nhiều lá phải tìm nhất), hoà thì bốc thăm.
function trailing(st) {
  const live = liveTeams(st), mx = Math.max(...live.map(t => st.teams[t].left));
  return pick(live.filter(t => st.teams[t].left === mx));
}
const ownHidden = (st, t) => st.cards.map((c, i) => (!c.rev && c.k === t ? i : -1)).filter(i => i >= 0);

// Áp dụng biến cố; trả về dữ liệu cho sự kiện, hoặc null nếu biến cố không dùng được lúc này.
// x = chi tiết bí mật, vis = ai được thấy x ('spy' = chỉ Trưởng nhóm, số = đội đó + Trưởng nhóm).
function applyEvent(st, k) {
  const un = unrevealed(st);
  switch (k) {
    case 'quake': {
      if (un.length < 4) return null;
      const moved = shuffle(un.map(i => st.cards[i]));
      un.forEach((i, j) => { st.cards[i] = moved[j]; });
      return {};
    }
    case 'fog': {
      const f = shuffle(un.slice()).slice(0, 4);
      if (f.length < 2) return null;
      for (const i of f) st.cards[i].fog = true;
      return { cs: f };
    }
    case 'retreat': {
      const t = trailing(st), own = ownHidden(st, t);
      if (st.teams[t].left < 3 || !own.length) return null;
      const c = pick(own);
      st.cards[c].k = 'n';
      if (st.cards[c].sp === 'star') st.cards[c].sp = null;
      st.teams[t].left--;
      return { team: t, x: { c }, vis: 'spy' };
    }
    case 'whisper': {
      const t = trailing(st), own = ownHidden(st, t).filter(i => !st.cards[i].mk.includes(t));
      if (!own.length) return null;
      const c = pick(own);
      st.cards[c].mk.push(t);
      return { team: t, x: { c }, vis: t };
    }
    case 'mirror': {
      const live = shuffle(liveTeams(st).slice());
      const a = live[0], b = live[1], ca = ownHidden(st, a), cb = ownHidden(st, b);
      if (!ca.length || !cb.length || st.teams[a].left < 2 || st.teams[b].left < 2) return null;
      const i = pick(ca), j = pick(cb);
      st.cards[i].k = b; st.cards[j].k = a;
      for (const x of [i, j]) { st.cards[x].mk = []; if (st.cards[x].sp === 'star') st.cards[x].sp = null; }
      return { a, b, x: { cs: [i, j] }, vis: 'spy' };
    }
    case 'renew': {
      const cs = shuffle(un.slice()).slice(0, 3);
      const fresh = deck(st.pack, cs.length, new Set(st.cards.map(c => c.w)));
      if (fresh.length < cs.length) return null;
      cs.forEach((i, j) => renameCard(st, i, fresh[j]));
      return { cs };
    }
    case 'rush': st.fx.rush = true; return { team: st.cur };
    case 'bonus': st.fx.bonus = 1; return { team: st.cur };
    case 'limit': st.fx.limit = true; return { team: st.cur };
  }
  return null;
}

// Thay chữ trên lá: lá mới có id mới (client diễn như một lá khác).
function renameCard(st, i, x) {
  const c = st.cards[i];
  c.id = st.uid++;
  c.w = x.w;
  if (x.nm) c.nm = x.nm; else delete c.nm;
  c.fog = false;
}

// Đội kế tiếp còn chơi (bỏ qua đội bị loại; đội dính Bom thì mất lượt đó).
function nextTeam(st, from, ev) {
  const live = liveTeams(st);
  let i = st.order.indexOf(from);
  for (let guard = 0; guard < st.order.length * 3; guard++) {
    i = (i + 1) % st.order.length;
    const t = st.order[i], tm = st.teams[t];
    if (tm.out) continue;
    if (tm.skip && live.length > 1) { tm.skip = false; ev.push({ t: 'skip', team: t }); continue; }
    return t;
  }
  return live[0];
}

function endTurn(st, ev) {
  for (const c of st.cards) c.fog = false;
  ev.push({ t: 'end', team: st.cur });
  st.cur = nextTeam(st, st.cur, ev);
  startTurn(st, ev);
}

function finish(st, team, ev) {
  for (const c of st.cards) c.fog = false;
  st.phase = 'over';
  st.winner = team;
  ev.push({ t: 'over', team });
}

// ---------- lật lá ----------
function flip(st, i, ev) {
  const c = st.cards[i], cur = st.cur, tm = st.teams[cur], clue = st.clue;
  c.rev = true; c.by = cur; c.fog = false;
  st.hist[st.hist.length - 1].got.push(i);
  ev.push({ t: 'flip', c: i, id: c.id, w: c.w, k: c.k, sp: c.sp, team: cur });
  if (c.k === 'a') {
    if (liveTeams(st).length <= 2) return finish(st, liveTeams(st).find(t => t !== cur), ev);
    tm.out = true;
    ev.push({ t: 'out', team: cur });
    return endTurn(st, ev);
  }
  if (typeof c.k === 'number') {
    st.teams[c.k].left--;
    if (st.teams[c.k].left === 0) return finish(st, c.k, ev);
  }
  if (c.k === cur) {
    clue.made++;
    if (c.sp === 'star') { clue.max++; ev.push({ t: 'sp', k: 'star', team: cur }); }
    return clue.made >= clue.max ? endTurn(st, ev) : nextVote(st);
  }
  // Lá thường / lá đội khác
  let keep = false;
  if (c.sp === 'gold') { clue.made++; clue.max += 1; keep = true; ev.push({ t: 'sp', k: 'gold', team: cur }); }
  if (c.sp === 'orb') {
    const own = ownHidden(st, cur).filter(j => !st.cards[j].mk.includes(cur));
    if (own.length) { const j = pick(own); st.cards[j].mk.push(cur); ev.push({ t: 'sp', k: 'orb', team: cur, x: { c: j }, vis: cur }); }
    else ev.push({ t: 'sp', k: 'orb', team: cur });
  }
  if (c.sp === 'traitor') {
    const ns = st.cards.map((d, j) => (!d.rev && d.k === 'n' ? j : -1)).filter(j => j >= 0);
    if (ns.length) { const j = pick(ns); st.cards[j].k = cur; if (st.cards[j].sp !== 'star') st.cards[j].sp = null; tm.left++; ev.push({ t: 'sp', k: 'traitor', team: cur, x: { c: j }, vis: 'spy' }); }
    else ev.push({ t: 'sp', k: 'traitor', team: cur });
  }
  if (c.sp === 'bomb') { tm.skip = true; ev.push({ t: 'sp', k: 'bomb', team: cur }); }
  if (!keep && st.fx.shield) { st.fx.shield = false; keep = true; ev.push({ t: 'shield', team: cur }); }
  if (keep && clue.made < clue.max) return nextVote(st);
  return endTurn(st, ev);
}
function nextVote(st) { st.votes = {}; st.split = false; st.vk++; }

// Đếm phiếu: lá nào quá nửa số người đoán (trừ người bỏ phiếu trắng) thì làm theo.
function resolve(st, ev) {
  const ops = st.teams[st.cur].ops, V = st.votes;
  const elig = ops.filter(s => V[s] !== 'any');
  if (!elig.length) return execute(st, 'pass', ev);
  const tally = new Map();
  for (const s of elig) if (V[s] != null) tally.set(V[s], (tally.get(V[s]) || 0) + 1);
  for (const [x, n] of tally) if (n * 2 > elig.length) return execute(st, x, ev);
  const all = ops.every(s => V[s] != null);
  if (all && !st.split) ev.push({ t: 'split', team: st.cur });
  st.split = all;
}
// Hết giờ khi chia phiếu: lá nhiều phiếu nhất (hoà thì bốc thăm).
function settle(st, ev) {
  const tally = new Map();
  for (const s of st.teams[st.cur].ops) { const v = st.votes[s]; if (v != null && v !== 'any') tally.set(v, (tally.get(v) || 0) + 1); }
  if (!tally.size) return execute(st, 'pass', ev);
  const mx = Math.max(...tally.values());
  const top = [...tally].filter(([, n]) => n === mx).map(([x]) => x);
  if (top.length > 1) ev.push({ t: 'draw', opts: top });
  execute(st, pick(top), ev);
}
function execute(st, x, ev) {
  if (x === 'pass' || x === 'any') {
    nextVote(st);
    ev.push({ t: 'stop', team: st.cur });
    return endTurn(st, ev);
  }
  nextVote(st);
  flip(st, x, ev);
}

function guessesFor(n) { return n === 0 || n === INF ? UNLIMITED : n + 1; }

// ---------- hành động ----------
function act(st, seat, a) {
  if (st.phase === 'over') return fail('Ván đã kết thúc');
  const pl = st.players[seat];
  if (!pl) return fail('Bạn không chơi ván này');
  const tm = st.teams[st.cur], ev = [];
  const mine = pl.team === st.cur;
  switch (a && a.type) {
    case 'skill': {
      if (st.phase !== 'clue' || !mine || tm.spy !== seat) return fail('Chỉ Trưởng nhóm đang tới lượt mới dùng kỹ năng (trước khi ra gợi ý)');
      const sk = tm.skills.find(x => x.k === a.k && !x.used);
      if (!sk) return fail('Đội không còn kỹ năng này');
      const e = { t: 'skill', team: st.cur, k: a.k };
      if (a.k === 'shield') st.fx.shield = true;
      else if (a.k === 'double') st.fx.double = true;
      else if (a.k === 'jam') {
        const live = liveTeams(st), nx = live[(live.indexOf(st.cur) + 1) % live.length];
        if (nx === st.cur) return fail('Không còn đội nào để gây nhiễu');
        st.jam = nx; e.on = nx;
      } else if (a.k === 'mark') {
        const c = a.c | 0;
        if (!st.cards[c] || !hidden(st, c) || st.cards[c].k !== st.cur) return fail('Chọn một lá CHƯA LẬT của đội mình');
        if (st.cards[c].mk.includes(st.cur)) return fail('Lá này đã có dấu ⭐ rồi');
        st.cards[c].mk.push(st.cur);
        Object.assign(e, { x: { c }, vis: st.cur });
      } else if (a.k === 'swap') {
        const c = a.c | 0;
        if (!st.cards[c] || !hidden(st, c)) return fail('Chọn một lá chưa lật');
        const fresh = deck(st.pack, 1, new Set(st.cards.map(d => d.w)));
        if (!fresh.length) return fail('Hết từ để đổi');
        renameCard(st, c, fresh[0]);
        e.c = c;
      } else return fail('Kỹ năng không hợp lệ');
      sk.used = true;
      ev.push(e);
      return { ok: true, events: ev };
    }
    case 'clue': {
      if (st.phase !== 'clue' || !mine || tm.spy !== seat) return fail('Chưa tới lượt bạn ra gợi ý');
      const parts = [[a.w, a.n], ...(st.fx.double ? [[a.w2, a.n2]] : [])];
      const out = [];
      for (const [w, n0] of parts) {
        const err = clueProblem(w, st.cards);
        if (err) return fail(err);
        const n = n0 | 0;
        if (n < 0 || n > INF) return fail('Số không hợp lệ');
        if (st.fx.limit && (n < 1 || n > 2)) return fail('🤐 Kiệm Lời: lượt này chỉ được số 1 hoặc 2');
        out.push({ w: normClue(w), n });
      }
      if (out[1] && out[1].w === out[0].w) return fail('Hai gợi ý phải khác nhau');
      let max = out.some(x => guessesFor(x.n) === UNLIMITED) ? UNLIMITED : out.reduce((s, x) => s + x.n, 0) + 1;
      if (max !== UNLIMITED) max += st.fx.bonus || 0;
      st.clue = { team: st.cur, w: out[0].w, n: out[0].n, ...(out[1] ? { w2: out[1].w, n2: out[1].n } : {}), max, made: 0, jam: !!st.fx.jam };
      st.hist.push({ team: st.cur, w: st.clue.w, n: st.clue.n, ...(out[1] ? { w2: st.clue.w2, n2: st.clue.n2 } : {}), jam: !!st.fx.jam, got: [] });
      st.phase = 'guess';
      nextVote(st);
      ev.push({ t: 'clue', team: st.cur, w: st.clue.w, n: st.clue.n, w2: st.clue.w2, n2: st.clue.n2, jam: !!st.fx.jam });
      return { ok: true, events: ev };
    }
    case 'vote': {
      if (st.phase !== 'guess' || !mine || !tm.ops.includes(seat)) return fail('Chỉ người đoán của đội đang tới lượt mới chọn lá');
      let c = a.c;
      if (c === 'pass') { if (st.clue.made < 1) return fail('Phải đoán ít nhất 1 lá rồi mới dừng được'); }
      else if (c !== 'any' && c != null) { c = c | 0; if (!st.cards[c] || !hidden(st, c)) return fail('Lá này đã lật rồi'); }
      if (c == null) delete st.votes[seat]; else st.votes[seat] = c;
      ev.push({ t: 'vote', p: seat, c: c ?? null });
      resolve(st, ev);
      return { ok: true, events: ev };
    }
    case 'settle': {
      if (st.phase !== 'guess' || !st.split || !mine) return fail('Chưa cần chốt phiếu');
      settle(st, ev);
      return { ok: true, events: ev };
    }
  }
  return fail('Hành động không hợp lệ');
}

// ---------- ai đang phải quyết định ----------
function turn(st) {
  if (st.phase === 'over') return null;
  const tm = st.teams[st.cur], P = PACE[st.pace], k = st.fx.rush ? 0.5 : 1;
  if (st.phase === 'clue') return { seat: tm.spy, ms: P.clue * k };
  const human = s => st.players[s].kind === 'human';
  const ms = P.guess * k;
  if (st.split) {
    const hs = tm.ops.filter(human);
    return hs.length ? { seats: hs, key: `s${st.vk}`, ms } : { seat: tm.ops[0], auto: { type: 'settle' }, autoDelay: 900 };
  }
  const hs = tm.ops.filter(s => human(s) && st.votes[s] == null);
  if (hs.length) return { seats: hs, key: `g${st.vk}`, ms };
  const bs = tm.ops.filter(s => !human(s) && st.votes[s] == null);
  if (bs.length) return { seats: bs, key: `b${st.vk}`, ms };
  return { seat: tm.ops[0], auto: { type: 'settle' }, autoDelay: 600 };
}

// ---------- che thông tin ----------
function view(st, seat) {
  const pl = seat >= 0 ? st.players[seat] : null, team = pl ? pl.team : -1;
  const full = st.phase === 'over' || isSpy(st, seat);
  const t = turn(st);
  const hideN = st.clue && st.clue.jam && !full && st.phase === 'guess';
  return {
    ...st,
    uid: undefined,
    cards: st.cards.map(c => {
      if (c.rev || full) return { ...c, mk: full ? c.mk : c.mk.filter(x => x === team) };
      return { id: c.id, w: c.fog ? null : c.w, rev: false, k: null, sp: null, mk: c.mk.filter(x => x === team), fog: c.fog };
    }),
    clue: st.clue && (hideN ? { ...st.clue, n: null, n2: st.clue.w2 ? null : undefined, max: null } : st.clue),
    hist: st.hist.map((h, i) => (hideN && i === st.hist.length - 1 ? { ...h, n: null, n2: h.w2 ? null : undefined } : h)),
    ask: st.phase === 'clue' ? st.teams[st.cur].spy : null,
    voters: t && t.seats ? t.seats : [],
    role: !pl ? 'watch' : isSpy(st, seat) ? 'spy' : 'op',
  };
}
// Chi tiết bí mật trong sự kiện (x) chỉ gửi cho người được thấy (vis: 'spy' hoặc số đội).
function viewEvents(evs, seat, st) {
  const pl = seat >= 0 ? st.players[seat] : null;
  const full = st.phase === 'over' || isSpy(st, seat);
  return evs.map(e => {
    if (!e.x) return e;
    const ok = full || (typeof e.vis === 'number' && pl && pl.team === e.vis);
    if (ok) return e;
    const { x, ...rest } = e;
    return rest;
  });
}

// Thứ hạng: đội thắng nhất; còn lại đội chưa bị loại, còn ít lá phải tìm hơn xếp trên. Cùng đội = đồng hạng.
function result(st) {
  const others = liveTeams(st).concat(st.order.filter(t => st.teams[t].out)).filter(t => t !== st.winner)
    .map(t => ({ t, s: [st.teams[t].out ? 1 : 0, st.teams[t].left] }))
    .sort((a, b) => a.s[0] - b.s[0] || a.s[1] - b.s[1]);
  const ranked = [{ t: st.winner, s: 'win' }, ...others];
  return ranked.flatMap(({ t, s }) => st.teams[t].members.map(p => ({ p, s })));
}

// Trưởng nhóm chỉ chat được với các Trưởng nhóm khác trong ván (không được mách đồng đội).
function chatTo(st, seat) {
  if (seat < 0 || !isSpy(st, seat)) return undefined;
  return { to: st.teams.map(t => t.spy), tag: '🕵️' };
}

export default {
  create,
  act,
  isOver: st => st.phase === 'over',
  result,
  turn,
  bot: botAction,
  animDuration,
  view,
  viewEvents,
  chatTo,
};
