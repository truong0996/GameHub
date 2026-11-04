// 💎 Kho Báu Inca — luật + bot (chạy trên server, KHÔNG gửi cho client vì chứa chồng bài, ngọc trong lều, bùa của mọi người).
// Hàm thuần: không I/O, không Date.now(). Xem "Game server interface" trong CLAUDE.md.
//
// Vòng (đền): mọi người vào hang → lật 1 lá → mọi người BÍ MẬT chốt Ở/Về cùng lúc (turn() trả { seats, key })
//   → lật bài cùng lúc: người về chia ngọc rơi + cổ vật (về một mình mới lấy được cổ vật) → người ở lại lật lá kế ...
//   Hiểm hoạ thứ 2 cùng loại (hoặc hang sập) → ai còn trong hang mất sạch ngọc đang cầm, hết vòng.
import { TREASURES, HAZ_KEYS, artifactValue, MYSTERY, CHARMS, CHARM_KEYS, TEMPLE_KEYS, animDuration } from './data.js';

const COLLAPSE_FROM = 8, COLLAPSE_P = 0.15;   // 🏚️ Đền Sắp Sập
const CHARMS_EACH = 3;

const rnd = n => (Math.random() * n) | 0;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fail = err => ({ ok: false, err });
const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);
const inTunnel = st => st.players.map((pl, i) => (pl.active && pl.status === 'in' ? i : -1)).filter(i => i >= 0);
const lefts = st => st.path.map(c => c.left);

// ---------- tạo ván ----------
function create({ seats, opts }) {
  const chaos = !!opts.chaos, rounds = opts.rounds === 3 ? 3 : 5;
  const players = seats.map(s => (s ? {
    active: true, kind: s.kind, name: s.name, status: 'camp', tent: 0, carried: 0, arts: [], choice: null,
    charms: chaos ? shuffle(CHARM_KEYS.slice()).slice(0, CHARMS_EACH) : [], used: [],
    shield: false, magnet: false, push: null, trap: false, condor: false, peek: null,
    greed: 0.6 + Math.random() * 0.9,   // tính cách bot: >1 = liều
  } : { active: false }));
  const st = {
    chaos, rounds, round: 0, temples: chaos ? shuffle(TEMPLE_KEYS.slice()).slice(0, rounds) : [], temple: null,
    players, deck: [], path: [], removed: {}, artPool: [], artClaimed: 0,
    phase: 'decide', step: 0, flips: 0, shortcut: false, fog: 0, uid: 0, results: null, winners: [],
  };
  const ev = [{ t: 'start' }];
  startRound(st, ev);
  return { state: st, events: ev };
}

// ---------- vòng ----------
function startRound(st, ev) {
  st.round++;
  st.temple = st.chaos ? st.temples[st.round - 1] : null;
  st.artPool.push(st.round - 1);   // mỗi vòng thêm 1 cổ vật; cổ vật chưa ai lật ra thì nằm lại cho vòng sau
  const deck = TREASURES.map(v => ({ k: 'gem', v }));
  for (const h of HAZ_KEYS) for (let i = st.removed[h] || 0; i < 3; i++) deck.push({ k: 'haz', h });
  for (const a of st.artPool) deck.push({ k: 'art', a });
  if (st.chaos) for (const m of Object.keys(MYSTERY)) deck.push({ k: 'mys', m });
  for (const c of deck) c.id = ++st.uid;
  st.deck = shuffle(deck);
  Object.assign(st, { path: [], flips: 0, shortcut: false, fog: 0 });
  for (const pl of st.players) if (pl.active) Object.assign(pl, { status: 'in', carried: 0, shield: false });
  ev.push({ t: 'round', r: st.round, temple: st.temple, ps: inTunnel(st) });
  flip(st, ev);
}

function endRound(st, ev) {
  const lost = [];
  for (const c of st.path) {
    c.hid = false;
    if (c.k === 'art' && !c.taken) { lost.push(c.a); st.artPool = st.artPool.filter(a => a !== c.a); }  // cổ vật bỏ lại trong hang là mất
  }
  for (const pl of st.players) if (pl.active) Object.assign(pl, { status: 'camp', carried: 0, choice: null, shield: false });
  resetStep(st);
  ev.push({ t: 'roundEnd', r: st.round, lostArts: lost, path: st.path.map(c => ({ ...c })) });
  if (st.round >= st.rounds) return finish(st, ev);
  startRound(st, ev);
}

function finish(st, ev) {
  st.phase = 'over';
  const res = st.players.map((pl, p) => (pl.active ? { p, tent: pl.tent, arts: sum(pl.arts, a => a.v), n: pl.arts.length } : null))
    .filter(Boolean).map(r => ({ ...r, total: r.tent + r.arts }))
    .sort((a, b) => b.total - a.total || b.n - a.n);
  st.results = res;
  st.winners = res.filter(r => r.total === res[0].total && r.n === res[0].n).map(r => r.p);
  ev.push({ t: 'over', results: res, winners: st.winners });
}

// ---------- lật bài ----------
function flip(st, ev) {
  for (let k = st.temple === 'twin' ? 2 : 1; k > 0; k--) if (flipOne(st, ev)) return;   // true = vòng đã kết thúc
  openDecide(st);
}

function flipOne(st, ev) {
  const ins = inTunnel(st);
  if (st.temple === 'collapse' && st.flips + 1 >= COLLAPSE_FROM && Math.random() < COLLAPSE_P) {
    ev.push({ t: 'collapse' });
    disaster(st, null, ev);
    return true;
  }
  if (!st.deck.length) {   // hết bài (rất hiếm): cả đoàn tự về
    leave(st, ins, ev);
    endRound(st, ev);
    return true;
  }
  const card = { ...st.deck.shift(), left: 0 };
  st.flips++;
  st.path.push(card);
  if (card.k === 'gem') {
    card.val = st.temple === 'sun' ? Math.floor(card.v * 1.5) : card.v;
    const share = Math.floor(card.val / ins.length);
    card.left = card.val - share * ins.length;
    for (const p of ins) st.players[p].carried += share;
    ev.push({ t: 'flip', card: { ...card }, share, ps: ins });
    return false;
  }
  if (card.k === 'haz') {
    const dup = st.path.some(c => c !== card && c.k === 'haz' && c.h === card.h);
    if (st.temple === 'dark' || st.fog > 0) { card.hid = true; if (st.fog > 0) st.fog--; }
    ev.push({ t: 'flip', card: { ...card } });
    if (dup) { disaster(st, card, ev); return true; }
    return false;
  }
  ev.push({ t: 'flip', card: { ...card } });
  if (card.k === 'mys') mystery(st, card, ins, ev);
  return false;
}

function mystery(st, card, ins, ev) {
  switch (card.m) {
    case 'vein':
      for (const p of ins) st.players[p].carried += 4;
      return ev.push({ t: 'vein', ps: ins, n: 4 });
    case 'shortcut': st.shortcut = true; return ev.push({ t: 'shortcut' });
    case 'fog': st.fog = 2; return ev.push({ t: 'fog' });
    case 'curse': {
      const lost = {};
      for (const p of ins) {
        const pl = st.players[p], n = Math.floor(pl.carried / 3);
        if (n) { pl.carried -= n; card.left += n; lost[p] = n; }
      }
      return ev.push({ t: 'curse', lost, lefts: lefts(st) });
    }
    case 'echo': {
      const nx = st.deck[0];
      return ev.push({ t: 'echo', haz: !!nx && nx.k === 'haz' });
    }
  }
}

// Hiểm hoạ trùng (card) hoặc hang sập (card = null): ai còn trong hang mất ngọc đang cầm — trừ người có Bùa Hộ Mệnh.
function disaster(st, card, ev) {
  const lost = {}, saved = {};
  for (const p of inTunnel(st)) {
    const pl = st.players[p];
    if (pl.shield) { pl.tent += pl.carried; saved[p] = pl.carried; pl.status = 'out'; }
    else { lost[p] = pl.carried; pl.status = 'dead'; }
    pl.carried = 0;
  }
  if (card && !card.trap) st.removed[card.h] = (st.removed[card.h] || 0) + 1;   // bỏ hẳn 1 lá hiểm hoạ đó khỏi các vòng sau
  ev.push({ t: 'death', h: card ? card.h : null, trap: !!(card && card.trap), lost, saved });
  endRound(st, ev);
}

// ---------- chốt & lật lựa chọn ----------
function resetStep(st) {
  for (const pl of st.players) if (pl.active) Object.assign(pl, { choice: null, magnet: false, push: null, trap: false, condor: false, peek: null });
}
function openDecide(st) {
  st.phase = 'decide';
  st.step++;
  resetStep(st);
}

// Người về chia đều ngọc rơi trên từng lá (dư để lại); về MỘT MÌNH (hoặc người duy nhất có Nam Châm) thì hốt hết + cổ vật.
function leave(st, go, ev) {
  if (!go.length) return;
  const mags = go.filter(p => st.players[p].magnet);
  const solo = go.length === 1 ? go[0] : mags.length === 1 ? mags[0] : null;
  const mult = st.shortcut ? 2 : 1;
  const gain = Object.fromEntries(go.map(p => [p, 0])), arts = Object.fromEntries(go.map(p => [p, []]));
  for (const c of st.path) {
    if (c.left) {
      if (solo != null) { gain[solo] += c.left; c.left = 0; }
      else {
        const s = Math.floor(c.left / go.length);
        if (s) { for (const p of go) gain[p] += s; c.left -= s * go.length; }
      }
    }
    if (c.k === 'art' && !c.taken && solo != null) {
      c.taken = true;
      const art = { a: c.a, v: artifactValue(st.artClaimed++, st.temple) };
      st.players[solo].arts.push(art);
      arts[solo].push(art);
      st.artPool = st.artPool.filter(a => a !== c.a);
    }
  }
  const list = go.map(p => {
    const pl = st.players[p], g = gain[p] * mult, item = { p, carried: pl.carried, gain: g, arts: arts[p] };
    pl.tent += pl.carried + g;
    pl.carried = 0;
    pl.status = 'out';
    return item;
  });
  ev.push({ t: 'collect', list, lefts: lefts(st), magnet: go.length > 1 && mags.length === 1 ? solo : null,
    clash: mags.length > 1 ? mags : null, double: mult > 1 });
}

function resolveStep(st, ev) {
  const ins = inTunnel(st);
  const stay = ins.filter(p => st.players[p].choice === 'stay'), go = ins.filter(p => st.players[p].choice === 'leave');
  ev.push({ t: 'reveal', stay, leave: go });
  // 😈 Đẩy Ngã: chỉ ăn khi người đẩy VỀ và nạn nhân Ở LẠI; ngọc rơi xuống lá cuối, người về nhặt luôn.
  for (const p of ins) {
    const to = st.players[p].push;
    if (to == null) continue;
    if (go.includes(p) && stay.includes(to)) {
      const v = st.players[to], n = Math.ceil(v.carried / 2);
      v.carried -= n;
      st.path.at(-1).left += n;
      ev.push({ t: 'push', p, to, n, lefts: lefts(st) });
    } else ev.push({ t: 'pushFail', p, to });
  }
  leave(st, go, ev);
  // 🪤 Đặt Bẫy: hiểm hoạ ngẫu nhiên lên đầu chồng bài — lá kế tiếp chắc chắn là nó.
  for (const p of ins) {
    if (!st.players[p].trap) continue;
    const h = HAZ_KEYS[rnd(HAZ_KEYS.length)];
    st.deck.unshift({ k: 'haz', h, trap: true, id: ++st.uid });
    ev.push({ t: 'trap', p, h });
  }
  st.shortcut = false;
  if (!stay.length) {
    if (st.temple === 'greed' && go.length) {
      const n = Math.floor(10 / go.length);
      for (const p of go) st.players[p].tent += n;
      ev.push({ t: 'bonus', ps: go, n });
    }
    return endRound(st, ev);
  }
  flip(st, ev);
}

// ---------- bùa ----------
// Kiểm tra trước, rồi mới sửa state (để action 'decide' kèm bùa không hỏng nửa chừng).
function useCharm(st, seat, c, target, ev) {
  const pl = st.players[seat];
  if (!st.chaos || !CHARMS[c]) return 'Bùa không hợp lệ';
  if (!pl.charms.includes(c)) return 'Bạn không có bùa này';
  const others = inTunnel(st).filter(p => p !== seat);
  let victim = null;
  if (c === 'torch' && !st.deck.length) return 'Hết bài để soi rồi';
  if (c === 'amulet' && pl.shield) return 'Bùa Hộ Mệnh đang có hiệu lực rồi';
  if (c === 'push' && !others.includes(target)) return 'Hãy chọn 1 người khác đang trong hang';
  if (c === 'pick') {
    const rich = others.filter(p => st.players[p].carried >= 3).sort((a, b) => st.players[b].carried - st.players[a].carried);
    if (!rich.length) return 'Không ai trong hang đủ ngọc để móc (cần ít nhất 3)';
    victim = rich[0];
  }
  pl.charms.splice(pl.charms.indexOf(c), 1);
  pl.used.push(c);
  ev.push({ t: 'charm', p: seat, c, target: c === 'push' ? target : null });
  switch (c) {
    case 'torch': pl.peek = { ...st.deck[0] }; ev.push({ t: 'peek', p: seat, card: pl.peek }); break;
    case 'condor': pl.condor = true; break;
    case 'amulet': pl.shield = true; break;
    case 'magnet': pl.magnet = true; break;
    case 'trap': pl.trap = true; break;
    case 'push': pl.push = target; break;
    case 'pick': {
      const v = st.players[victim], n = Math.floor(v.carried / 3);
      v.carried -= n;
      pl.carried += n;
      ev.push({ t: 'steal', p: seat, from: victim, n });
      break;
    }
  }
  return null;
}

// ---------- hành động ----------
// { type: 'decide', stay: bool, charm?, target? } — chốt (có thể kèm dùng 1 bùa ngay trước khi chốt)
// { type: 'charm', charm, target? }               — dùng bùa, chưa chốt
function act(st, seat, a) {
  if (st.phase !== 'decide') return fail('Ván đã kết thúc');
  const pl = st.players[seat];
  if (!pl || !pl.active) return fail('Bạn không ở trong ván này');
  if (pl.status !== 'in') return fail(pl.status === 'dead' ? 'Bạn đã bỏ mạng trong hang — chờ đền sau nhé' : 'Bạn đã về lều — chờ đền sau nhé');
  if (pl.choice) return fail('Bạn đã chốt rồi, không đổi được');
  a = a || {};
  if (a.type !== 'decide' && a.type !== 'charm') return fail('Hành động không hợp lệ');
  const ev = [];
  if (a.charm != null) {
    const e = useCharm(st, seat, a.charm, a.target, ev);
    if (e) return fail(e);
  } else if (a.type === 'charm') return fail('Chọn một bùa');
  if (a.type === 'decide') {
    pl.choice = a.stay ? 'stay' : 'leave';
    ev.push({ t: 'lock', p: seat });
    if (inTunnel(st).every(p => st.players[p].choice)) resolveStep(st, ev);
  }
  return { ok: true, events: ev };
}

// ---------- bot ----------
// Bot "đếm bài" như người chơi kỹ: biết thành phần chồng bài (thông tin công khai) nhưng không biết thứ tự.
function assess(st, seat) {
  const pl = st.players[seat], deck = st.deck, N = Math.max(1, deck.length), ins = inTunnel(st), n = ins.length;
  const seen = new Set(st.path.filter(c => c.k === 'haz' && !c.hid).map(c => c.h));
  const hidden = st.path.filter(c => c.k === 'haz' && c.hid).length;
  const hazLeft = deck.filter(c => c.k === 'haz').length;
  const danger = deck.filter(c => c.k === 'haz' && seen.has(c.h)).length + hidden * hazLeft / HAZ_KEYS.length * 0.7;
  let risk = Math.min(1, danger / N);
  if (st.temple === 'twin') risk = 1 - (1 - risk) ** 2;
  if (st.temple === 'collapse' && st.flips + 1 >= COLLAPSE_FROM) risk = 1 - (1 - risk) * (1 - COLLAPSE_P);
  const gems = deck.filter(c => c.k === 'gem');
  const avgGem = gems.length ? sum(gems, c => c.v) / gems.length : 0;
  let expShare = (gems.length / N) * avgGem * (st.temple === 'sun' ? 1.5 : 1) / n;
  if (st.chaos) expShare += 4 / N;   // Mạch Ngọc Lớn
  const pathLeft = sum(st.path, c => c.left);
  const arts = st.path.filter(c => c.k === 'art' && !c.taken).length;
  return { pl, risk, expShare, pathLeft, arts, n, seen, ins };
}

function botAction(st, seat, { timeout } = {}) {
  const decide = (stay, charm, target) => (charm ? { type: 'decide', stay, charm, target } : { type: 'decide', stay });
  if (timeout) return decide(false);   // đi giúp người hết giờ: về lều cho chắc
  const { pl, risk, expShare, pathLeft, arts, n, seen, ins } = assess(st, seat);
  const has = c => st.chaos && pl.charms.includes(c);
  const others = ins.filter(p => p !== seat);

  // 🔦 Đuốc: soi lá kế rồi quyết theo đó.
  if (has('torch') && risk > 0.12 && pl.carried >= 5 && Math.random() < 0.8) {
    const nx = st.deck[0], deadly = nx.k === 'haz' && st.path.some(c => c.k === 'haz' && c.h === nx.h);
    return decide(!deadly, 'torch');
  }
  const artVal = arts * 6 / Math.max(1, n * 0.5);
  const greed = pl.greed * (0.85 + Math.random() * 0.3) * (st.round === st.rounds ? 1.1 : 1);
  const gain = (1 - risk) * expShare * 2.5 * greed;
  const cost = risk * pl.carried + 0.35 * (pathLeft / Math.max(1, n * 0.45) + artVal);
  let stay = pl.carried === 0 && pathLeft + arts < 2 ? true : gain > cost;
  if (n === 1 && (pathLeft >= 6 || arts)) stay = stay && Math.random() < 0.3;   // một mình với đống ngọc rơi → ôm về

  if (st.chaos && pl.charms.length) {
    const rich = others.slice().sort((a, b) => st.players[b].carried - st.players[a].carried)[0];
    const richC = rich != null ? st.players[rich].carried : 0;
    if (stay && has('amulet') && risk > 0.2 && pl.carried >= 6 && Math.random() < 0.7) return decide(true, 'amulet');
    if (has('pick') && richC >= 9 && Math.random() < 0.5) return decide(stay, 'pick');
    if (!stay && has('magnet') && others.length && (pathLeft >= 4 || arts) && Math.random() < 0.7) return decide(false, 'magnet');
    if (!stay && has('push') && richC >= 6 && Math.random() < 0.5) return decide(false, 'push', rich);
    if (!stay && has('trap') && seen.size >= 2 && others.length && Math.random() < 0.4) return decide(false, 'trap');
    if (has('condor') && Math.random() < 0.05) return decide(stay, 'condor');
  }
  return decide(stay);
}

// ---------- che thông tin ----------
function view(st, seat) {
  const over = st.phase === 'over', me = st.players[seat];
  const condor = !!(me && me.active && me.condor);
  const { deck, players, path, temples, ...rest } = st;
  const hiddenOnPath = path.some(c => c.hid);
  const byType = {};
  for (const h of HAZ_KEYS) byType[h] = deck.filter(c => c.k === 'haz' && c.h === h).length;
  return {
    ...rest,
    temples: temples.map((t, i) => (over || i < st.round ? t : null)),
    deckInfo: {
      n: deck.length, gem: deck.filter(c => c.k === 'gem').length, art: deck.filter(c => c.k === 'art').length,
      mys: deck.filter(c => c.k === 'mys').length, haz: deck.filter(c => c.k === 'haz').length,
      byType: hiddenOnPath ? null : byType,   // còn hiểm hoạ úp trên đường thì không lộ đếm theo loại
    },
    path: path.map(c => (c.hid ? { id: c.id, k: 'haz', hid: true, left: c.left } : c)),
    players: players.map((pl, i) => {
      if (!pl.active) return pl;
      const mine = i === seat;
      return {
        active: true, kind: pl.kind, name: pl.name, status: pl.status, carried: pl.carried, arts: pl.arts,
        nCharms: pl.charms.length, locked: !!pl.choice,
        tent: mine || over ? pl.tent : null,
        choice: mine || over || condor ? pl.choice : null,
        ...(mine ? { charms: pl.charms, used: pl.used, shield: pl.shield, magnet: pl.magnet, push: pl.push, trap: pl.trap, condor: pl.condor, peek: pl.peek } : {}),
      };
    }),
  };
}
function viewEvents(evs, seat) {
  return evs.filter(e => e.t !== 'peek' || e.p === seat).map(e => {
    if (e.t === 'flip' && e.card.hid) return { ...e, card: { id: e.card.id, k: 'haz', hid: true } };
    if (e.t === 'charm' && e.p !== seat && CHARMS[e.c].secret) return { t: 'charm', p: e.p, c: null, target: null };
    return e;
  });
}

export default {
  create,
  act,
  isOver: st => st.phase === 'over',
  turn(st) {
    if (st.phase !== 'decide') return null;
    return { seats: inTunnel(st).filter(p => !st.players[p].choice), key: st.step };
  },
  bot: botAction,
  animDuration,
  view,
  viewEvents,
};
