// 💀 Hoa & Sọ (Skull) — giao diện client. Xem "Game client interface" trong CLAUDE.md.
// V = bản trạng thái để VẼ: trong lúc diễn sự kiện, V được cập nhật dần theo từng sự kiện; diễn xong thì thay bằng state thật từ server.
import { DISCS, SPECIALS, OMENS, isSafe } from './data.js';

let CTX, UI, SFX, ROOT, V, SEATS;
let pending = false, playing = false, SPEED = 1, QUICK = false, deadline = 0, overShown = false, timerInt = 0, lastOmenRound = 0, turnKey = '';

const $ = s => ROOT.querySelector(s);
const sleep = ms => (QUICK ? Promise.resolve() : new Promise(r => setTimeout(r, ms / SPEED)));
const mySeat = () => CTX.me().seat;
const P = p => V.players[p];
const nm = p => UI.esc(V.players[p] ? V.players[p].name : '?');
const col = p => (SEATS[p] ? SEATS[p].color : '#888');
const who = p => `<b class="pn" style="--c:${col(p)}">${nm(p)}</b>`;
const dn = k => `${DISCS[k].icon} ${DISCS[k].name}`;
const active = () => V.players.map((pl, i) => (pl.active ? i : -1)).filter(i => i >= 0);
const alive = p => P(p).active && P(p).alive;
const me = () => (mySeat() >= 0 && P(mySeat()) && P(mySeat()).active ? P(mySeat()) : null);
const stackOf = id => { for (const [s, st] of V.stacks.entries()) { const d = st.find(x => x.id === id); if (d) return { s, d }; } return {}; };
const HAND_ORDER = ['rose', ...SPECIALS, 'skull'];
const sortKinds = a => a.slice().sort((x, y) => HAND_ORDER.indexOf(x) - HAND_ORDER.indexOf(y));

// ================= LỜI THOẠI =================
const SAY = {
  bid: ['Cược {n}!', 'Tui lật được {n} 😎', '{n} hoa, dễ ợt', 'Lên {n}!', 'Dám không? {n}!'],
  pass: ['Thôi...', 'Nhường đó', 'Hông chơi', 'Mời bạn 🙏', 'Run quá, bỏ'],
  challenge: ['Xem tui nè!', 'Tin tui đi', 'Toàn hoa thôi mà 🌹'],
  trap: ['Hehe 💀', 'Dính bẫy rồi nhé 😈', 'Bất ngờ chưa!', 'Đã bảo mà...'],
  fail: ['Ối giời!', 'Bị lừa rồi 😭', 'Sao lại thế?!', 'Nhớ mặt đấy 😤'],
  self: ['Tự hại mình 🤦', 'Quên mất cái sọ của tui...'],
  success: ['Dễ như ăn kẹo 😎', 'Hoa đẹp quá 🌹', 'Tin chưa?!'],
  ghost: ['👻 Hù!', 'Ta sẽ trở lại...', 'Ám cho chừa!'],
  win: ['Vua bịp! 🏆', 'Hoa hay sọ, tui biết hết 😏'],
};
function say(p, kind, prob = 1, vars = {}) {
  if (p == null || Math.random() > prob || QUICK) return;
  const b = ROOT.querySelector(`.mat[data-p="${p}"] .bubble`);
  if (!b) return;
  b.textContent = UI.pick(SAY[kind]).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('show'), 2000);
}

// ================= ÂM THANH =================
const S = {
  place() { SFX.tone(140, 0.08, { v: 0.25, to: 90 }); SFX.noise(0.05, { v: 0.12, f: 1200 }); },
  flip() { SFX.noise(0.1, { v: 0.16, f: 2600, q: 0.8 }); SFX.tone(420, 0.06, { type: 'triangle', v: 0.06, delay: 0.06 }); },
  rose() { [880, 1175].forEach((f, i) => SFX.tone(f, 0.14, { type: 'triangle', v: 0.06, delay: i * 0.07 })); },
  skull() { SFX.tone(110, 0.6, { type: 'sawtooth', v: 0.12, to: 45 }); SFX.noise(0.5, { v: 0.25, f: 300, ft: 'lowpass' }); },
  bid() { SFX.tone(660, 0.07, { type: 'square', v: 0.05 }); },
  drum() { SFX.tone(85, 0.22, { v: 0.4, to: 50 }); SFX.tone(85, 0.22, { v: 0.4, to: 50, delay: 0.22 }); SFX.tone(70, 0.4, { v: 0.45, to: 40, delay: 0.44 }); },
  wind() { SFX.noise(1.2, { v: 0.2, f: 700, fto: 2400 }); },
  magic() { [660, 880, 1320].forEach((f, i) => SFX.tone(f, 0.22, { type: 'sine', v: 0.06, delay: i * 0.07 })); },
  ghost() { SFX.tone(520, 0.9, { type: 'sine', v: 0.06, to: 300 }); SFX.tone(530, 0.9, { type: 'sine', v: 0.05, to: 310, delay: 0.05 }); },
};

// ================= VẼ =================
// Một đĩa: k = loại (null = úp, không biết), up = lật ngửa cho cả bàn, peek = mình đã nhìn trộm.
function discHTML(d, cls = '') {
  const face = d.fl || d.up, k = d.k;
  if (face) {
    const shown = k === 'mask' && d.res ? d.res : k;
    return `<div class="disc face ${shown === 'skull' ? 'skull' : 'rose'} ${cls}" data-id="${d.id}" title="${UI.esc(DISCS[k].name + (k === 'mask' ? ` → ${DISCS[d.res].name}` : ''))}"><i>${DISCS[shown].icon}</i>${k !== shown || (k !== 'rose' && k !== 'skull') ? `<em>${DISCS[k].icon}</em>` : ''}</div>`;
  }
  return `<div class="disc back ${cls}${k ? ' known' : ''}${d.peek ? ' peeked' : ''}" data-id="${d.id}" style="--o:${col(d.o)}" title="${k ? UI.esc((d.peek ? 'Bạn đã nhìn trộm: ' : 'Đĩa của bạn: ') + DISCS[k].name) : 'Đĩa úp'}">${k ? `<i>${DISCS[k].icon}</i>` : ''}</div>`;
}

const TEMPLATE = `<div class="sk">
  <div class="sk-main">
    <div id="sk-table" class="dark">
      <div id="sk-center"></div>
      <div id="sk-mats"></div>
    </div>
    <div id="sk-status"></div>
    <div id="sk-actions"></div>
    <div class="sk-timer"><i id="sk-timer"></i></div>
    <div id="sk-hand"></div>
  </div>
  <aside class="sk-side">
    <div class="sk-head"><b>💀 Hoa & Sọ</b><span id="sk-mode" class="muted small"></span></div>
    <div id="sk-omen"></div>
    <div id="sk-log"></div>
    <div id="sk-emotes"></div>
    <div id="sk-tools"></div>
  </aside>
</div>`;

// Ghế xếp quanh bàn hình bầu dục, mình luôn ngồi giữa cạnh dưới.
function layout() {
  const seats = active(), m = mySeat(), n = seats.length;
  const start = Math.max(0, seats.indexOf(m)), rx = innerWidth < 640 ? 31 : 39;
  const pos = {};
  seats.forEach((p, i) => {
    const a = Math.PI / 2 + ((i - start + n) % n) * 2 * Math.PI / n;
    pos[p] = { x: 50 + rx * Math.cos(a), y: 50 + 37 * Math.sin(a) };
  });
  return pos;
}

function canFlip(s) {
  return !!V && V.phase === 'flip' && V.flip && V.flip.by === mySeat() && !playing && !pending && (V.options || []).includes(s) && V.options.length > 1;
}
function canHaunt() {
  const pl = me();
  return !!pl && V.chaos && pl.ghost && pl.haunted == null && ['place0', 'place', 'bid'].includes(V.phase) && !pending;
}

function renderMats() {
  const pos = layout(), m = mySeat(), room = CTX.room();
  const asked = V.phase === 'place0' ? active().filter(p => alive(p) && !P(p).placed0)
    : V.phase === 'discard' ? [V.discard.p] : V.phase === 'over' ? [] : [V.turn];
  $('#sk-mats').innerHTML = active().map(p => {
    const pl = P(p), st = V.stacks[p] || [], off = room && room.seats[p] && room.seats[p].kind === 'human' && !room.seats[p].online;
    const onTable = V.stacks.reduce((s, x) => s + x.filter(d => d.o === p).length, 0);
    const own = pl.nHand + onTable;
    const wins = Array.from({ length: V.need }, (_, i) => `<span class="${i < pl.wins ? 'on' : ''}">★</span>`).join('');
    const passed = V.phase === 'bid' && V.bid && V.bid.passed.includes(p);
    const flipping = V.phase === 'flip' && V.flip && V.flip.by === p;
    const sub = !pl.alive ? (pl.ghost ? `👻 Hồn ma${pl.haunting ? ' · đang ám' : ''}` : '💀 Bị loại')
      : `💿 ${own} đĩa${pl.nLost ? ` <span class="lost">(−${pl.nLost})</span>` : ''}${passed ? ' · <b class="pass">bỏ</b>' : ''}${V.bid && V.bid.by === p && V.phase !== 'flip' ? ` · <b class="hi">cược ${V.bid.n}</b>` : ''}`;
    const unfl = st.filter(d => !d.fl), fl = st.filter(d => d.fl);
    const hit = V.flip && V.flip.hit && V.flip.hit.includes(p);
    return `<div class="mat${asked.includes(p) ? ' turn' : ''}${!pl.alive ? ' dead' : ''}${pl.ghost ? ' ghost' : ''}${p === m ? ' me' : ''}${flipping ? ' flipping' : ''}${canFlip(p) || (canHaunt() && pl.alive) ? ' can' : ''}${hit ? ' haunted' : ''}"
      data-p="${p}" style="--c:${col(p)};left:${pos[p].x}%;top:${pos[p].y}%">
      <div class="mat-head"><span class="av">${pl.alive ? SEATS[p].label || '🙂' : pl.ghost ? '👻' : '💀'}</span>
        <span class="mat-name">${pl.kind === 'bot' ? '<span class="bot">🤖 </span>' : ''}${nm(p)}${off ? ' 📴' : ''}</span><span class="wins" title="Thử thách đã thắng">${wins}</span></div>
      <div class="mat-sub">${sub}</div>
      <div class="pile">${unfl.map((d, i) => discHTML(d, i === unfl.length - 1 ? 'top' : '')).join('')}${fl.length ? `<span class="flipped">${fl.map(d => discHTML(d)).join('')}</span>` : ''}${!st.length && pl.alive && V.phase !== 'over' ? '<span class="empty"></span>' : ''}</div>
      ${hit ? '<span class="haunt-mark" title="Chồng này bị hồn ma ám">👻</span>' : ''}
      <div class="bubble"></div>
      <div class="mat-timer"><i></i></div>
    </div>`;
  }).join('');
}

function renderCenter() {
  const box = $('#sk-center'), O = V.omen && OMENS[V.omen];
  let main = '';
  if (V.phase === 'over') main = `<div class="big">🏆 ${who(V.winner)} thắng!</div>`;
  else if (V.phase === 'flip' && V.flip) {
    const F = V.flip;
    main = `<div class="small">${who(F.by)} thách đấu</div><div class="big">🌹 ${F.got} / ${F.need}</div>
      <div class="pips">${Array.from({ length: F.need }, (_, i) => `<i class="${i < F.got ? 'on' : ''}"></i>`).join('')}</div>${F.shield ? '<div class="small">🛡️ có Khiên</div>' : ''}`;
  } else if (V.phase === 'discard') main = `<div class="small">${who(V.discard.p)} trúng Sọ của chính mình</div><div class="big">💀</div><div class="small">đang chọn đĩa bỏ...</div>`;
  else if (V.bid) main = `<div class="small">Cược cao nhất</div><div class="big">${V.bid.n} 🌹</div><div class="small">${who(V.bid.by)}</div>`;
  else if (V.phase === 'place0') main = '<div class="small">Mọi người đang úp đĩa đầu tiên...</div><div class="big">🤫</div>';
  else main = `<div class="small">Lượt ${who(V.turn)}</div><div class="big">🌹 / 💀</div><div class="small">đặt thêm hay cược?</div>`;
  box.innerHTML = `<div class="rnd">Vòng ${V.round} · ${V.total || V.stacks.reduce((s, x) => s + x.length, 0)} đĩa trên bàn</div>${main}${O ? `<div class="omen-chip" title="${UI.esc(O.desc)}">${O.icon} ${O.name}</div>` : ''}`;
  $('#sk-mode').textContent = (V.chaos ? '🔥 Hỗn Loạn' : '😇 Cổ điển') + ` · thắng ${V.need} lần`;
  $('#sk-omen').innerHTML = O ? `<b>${O.icon} ${O.name}</b><span>${O.desc}</span>` : '';
  $('#sk-omen').classList.toggle('hidden', !O);
}

function bidRange() {
  const T = V.total, min = V.bid ? V.bid.n + 1 : 1;
  return min <= T ? [min, T] : null;
}

function renderControls() {
  const m = mySeat(), pl = me(), status = $('#sk-status'), acts = $('#sk-actions');
  let msg = '', btns = '';
  status.classList.remove('mine');
  const mine = () => status.classList.add('mine');
  if (!pl) msg = '👀 Bạn đang xem.';
  else if (V.phase === 'over') msg = V.winner === m ? '🏆 Bạn là vua bịp!' : 'Ván đã kết thúc.';
  else if (!pl.alive) {
    if (canHaunt()) { mine(); msg = '👻 Bạn là hồn ma — bấm vào 1 chồng đĩa để <b>ám</b>: ai lật vào chồng đó phải lật thêm 1 đĩa.'; btns = '<button class="ghost" data-a="nohaunt">Thôi, vòng này tha</button>'; }
    else msg = pl.ghost ? (pl.haunted >= 0 && pl.haunted != null ? `👻 Bạn đang ám chồng trước mặt ${who(pl.haunted)}.` : '👻 Chờ vòng sau để ám tiếp...') : '💀 Bạn đã bị loại. Ngồi xem mọi người bịp nhau nhé.';
  } else if (V.phase === 'place0') {
    if (!pl.placed0) { mine(); msg = '🤫 Chọn 1 đĩa để <b>úp</b> trước mặt (cả bàn đặt cùng lúc).'; }
    else msg = 'Chờ mọi người úp đĩa...';
  } else if (V.phase === 'place' && V.turn === m) {
    mine();
    const r = bidRange();
    msg = pl.hand.length ? 'Lượt bạn: bấm 1 đĩa để <b>đặt thêm</b>, hoặc <b>cược</b> số Hoa bạn lật được.' : 'Hết đĩa trên tay — bạn phải <b>cược</b>.';
    if (r) btns = `<span class="lbl">Cược:</span>${chips(r[0], r[1])}`;
  } else if (V.phase === 'bid' && V.turn === m) {
    mine();
    const r = bidRange();
    msg = `${who(V.bid.by)} cược <b>${V.bid.n}</b>. Nâng cược hay bỏ?`;
    btns = (r ? `<span class="lbl">Nâng:</span>${chips(r[0], r[1])}` : '') + '<button class="ghost" data-a="pass">🙅 Bỏ</button>';
  } else if (V.phase === 'flip' && V.flip.by === m) {
    mine();
    msg = V.options && V.options.length > 1 ? `Còn ${V.flip.need - V.flip.got} 🌹 nữa — <b>bấm vào chồng đĩa</b> muốn lật.` : 'Lật chồng trước mặt bạn trước...';
  } else if (V.phase === 'discard' && V.discard.p === m) {
    mine();
    msg = `💀 Bạn trúng Sọ của chính mình — chọn <b>${V.discard.n}</b> đĩa bỏ đi (không ai thấy là đĩa gì).`;
  } else if (V.phase !== 'over') {
    const t = V.phase === 'discard' ? V.discard.p : V.turn;
    msg = V.phase === 'flip' ? `${who(V.flip.by)} đang lật...` : `Chờ ${who(t)}...`;
  }
  if (pl && pl.alive && V.chaos && V.phase !== 'over' && pl.hand && pl.hand.includes('eye') && !msg.includes('Mắt')) msg += ' <span class="muted small">(👁️ Mắt Thần: đặt xuống để nhìn trộm đĩa trên cùng của 1 người)</span>';
  status.innerHTML = msg;
  acts.innerHTML = pending || playing ? '' : btns;
}
function chips(a, b) {
  let h = '';
  for (let n = a; n <= b; n++) h += `<button class="chip-n" data-bid="${n}">${n}</button>`;
  return h;
}

function canPlaceNow() {
  const pl = me(), m = mySeat();
  if (!pl || !pl.alive || pending || playing) return false;
  return (V.phase === 'place0' && !pl.placed0) || (V.phase === 'place' && V.turn === m);
}
function canDiscard() { return !!me() && V.phase === 'discard' && V.discard.p === mySeat() && !pending && !playing; }

function renderHand() {
  const pl = me(), box = $('#sk-hand');
  if (!pl || !pl.alive) { box.innerHTML = ''; return; }
  const hand = sortKinds(pl.hand || []), lost = sortKinds(pl.lost || []);
  const click = canPlaceNow() || canDiscard();
  box.classList.toggle('dim', !click);
  box.classList.toggle('discard', canDiscard());
  box.innerHTML = `<span class="lbl">${canDiscard() ? 'Bỏ đĩa nào?' : 'Trên tay'}</span>` +
    (hand.length ? hand.map(k => `<button class="hd" data-k="${k}" title="${UI.esc(DISCS[k].name + ' — ' + DISCS[k].desc)}"><div class="disc face lg ${k === 'skull' ? 'skull' : k === 'rose' ? 'rose' : 'special'}"><i>${DISCS[k].icon}</i></div><small>${DISCS[k].name}</small></button>`).join('')
      : '<span class="muted small">Đã đặt hết đĩa</span>') +
    (lost.length ? `<span class="lostbox" title="Đĩa đã mất">${lost.map(k => `<span>${DISCS[k].icon}</span>`).join('')}</span>` : '');
}

function renderAll() {
  if (!V) return;
  renderMats();
  renderCenter();
  renderHand();
  renderControls();
}

// ================= HIỆU ỨNG =================
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
const matEl = p => ROOT.querySelector(`.mat[data-p="${p}"]`);
function anchor(p) { const el = matEl(p); return el ? centerOf(el) : { x: innerWidth / 2, y: 80 }; }
const discEl = id => ROOT.querySelector(`.mat .disc[data-id="${id}"]`);
function pulse(el, cls, ms = 900) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
async function spot(html, cls = '', ms = 1000) {
  if (QUICK) return;
  const d = UI.el('div', 'sk-spot dark ' + cls, html);
  $('.sk').appendChild(d);
  await sleep(ms);
  d.classList.add('out');
  setTimeout(() => d.remove(), 300);
}
function log(html) {
  const box = $('#sk-log');
  box.appendChild(UI.el('div', 'li', html));
  while (box.children.length > 150) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

// Lốc Xoáy: mỗi chồng bay sang ghế kế tiếp (còn sống) rồi mới đổi dữ liệu.
async function twist() {
  const al = active().filter(alive), nxt = p => al[(al.indexOf(p) + 1) % al.length];
  if (!QUICK) {
    $('#sk-table').classList.add('spin');
    const anims = al.map(p => {
      const a = matEl(p)?.querySelector('.pile'), b = matEl(nxt(p))?.querySelector('.pile');
      if (!a || !b) return null;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return a.animate([{ transform: 'none' }, { transform: `translate(${rb.left - ra.left}px, ${rb.top - ra.top}px) rotate(360deg)` }],
        { duration: 1100 / SPEED, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).finished;
    });
    await Promise.all(anims);
    $('#sk-table').classList.remove('spin');
  }
  const ns = V.stacks.map(() => []);
  for (const p of al) ns[nxt(p)] = V.stacks[p];
  V.stacks = ns;
  renderMats();
}

async function playEvent(e) {
  const m = mySeat();
  switch (e.t) {
    case 'start':
      log('🌹 Mỗi người có 3 Hoa và 1 Sọ. Bịp giỏi thì thắng!');
      break;
    case 'round': {
      Object.assign(V, { round: e.r, omen: e.omen, phase: 'place0', bid: null, flip: null, discard: null, turn: e.first, total: 0 });
      V.stacks = V.stacks.map(() => []);
      V.players.forEach(pl => { if (pl.active) { pl.placed0 = false; if (pl.haunted !== undefined) pl.haunted = null; pl.haunting = false; } });
      renderAll();
      log(`<span class="sep">— Vòng ${e.r} · ${who(e.first)} đi đầu —</span>`);
      if (e.omen) {
        const O = OMENS[e.omen];
        log(`${O.icon} Điềm báo: <b>${O.name}</b> — ${O.desc}`);
        S.magic();
        if (lastOmenRound !== e.r) { lastOmenRound = e.r; await spot(`<div class="ico">${O.icon}</div><div class="cap">${O.name}</div><div class="sub">${O.desc}</div>`, 'omen', 1300); }
      } else await sleep(400);
      break;
    }
    case 'place': {
      V.stacks[e.p].push({ id: e.id, o: e.p, k: e.k || null, fl: false, up: false });
      P(e.p).placed0 = true;
      P(e.p).nHand = Math.max(0, P(e.p).nHand - 1);
      V.total = (V.total || 0) + 1;
      if (e.p === m && me()) { const i = me().hand.indexOf(e.k); if (i >= 0) me().hand.splice(i, 1); renderHand(); }
      renderMats(); renderCenter();
      S.place();
      pulse(discEl(e.id), 'drop', 500);
      if (V.phase !== 'place0') log(`${who(e.p)} đặt thêm 1 đĩa${e.k && e.p === m ? ` (${dn(e.k)})` : ''}.`);
      else if (e.p === m && e.k) log(`Bạn úp ${dn(e.k)}.`);
      await sleep(300);
      break;
    }
    case 'peek':
      if (e.p === m) {
        const { d } = stackOf(e.id);
        if (d) { d.k = e.k; d.peek = true; }
        renderMats();
        S.magic();
        log(`👁️ Bạn nhìn trộm đĩa trên cùng của ${who(e.s)}: <b>${dn(e.k)}</b>`);
        UI.toast(`👁️ Đĩa trên cùng của ${nm(e.s)} là <b>${dn(e.k)}</b>`, 3500);
      } else log(`👁️ ${who(e.p)} dùng Mắt Thần nhìn trộm chồng của ${who(e.s)}.`);
      pulse(matEl(e.s), 'peeked', 900);
      break;
    case 'haunt':
      S.ghost();
      if (e.p === m) { me().haunted = e.s; log(`👻 Bạn ám chồng trước mặt ${who(e.s)}.`); }
      else log(`👻 Hồn ma ${who(e.p)} đã lẩn vào một chồng đĩa...`);
      say(e.p, 'ghost', 0.5);
      P(e.p).haunting = true;
      break;
    case 'bid':
      V.bid = { n: e.n, by: e.p, passed: V.bid ? V.bid.passed : [] };
      if (V.phase === 'place') V.phase = 'bid';
      renderCenter(); renderMats();
      S.bid();
      say(e.p, 'bid', 0.8, { n: e.n });
      log(`📣 ${who(e.p)} ${e.first ? 'mở cược' : 'nâng cược lên'} <b>${e.n}</b> 🌹`);
      if (!QUICK) UI.floatAt(anchor(e.p), `${e.n} 🌹`, 'big');
      await sleep(450);
      break;
    case 'pass':
      if (V.bid) V.bid.passed.push(e.p);
      renderMats();
      say(e.p, 'pass', 0.6);
      log(`🙅 ${who(e.p)} bỏ.`);
      break;
    case 'twist':
      SFX.whoosh();
      log('🌪️ <b>Lốc Xoáy!</b> Mọi chồng đĩa xoay sang người bên trái.');
      await twist();
      break;
    case 'wind': {
      const { d } = stackOf(e.id);
      if (d) Object.assign(d, { up: true, k: e.k, res: e.res });
      S.wind();
      renderMats();
      pulse(discEl(e.id), 'flipin', 800);
      const shown = e.k === 'mask' ? e.res : e.k;
      log(`💨 Gió lật ngửa 1 đĩa của ${who(d ? d.o : e.s)}: <b>${dn(e.k)}</b>${e.k === 'mask' ? ` → ${dn(shown)}` : ''}`);
      await sleep(1100);
      break;
    }
    case 'challenge':
      V.phase = 'flip';
      V.flip = { by: e.p, need: e.n, got: 0, shield: false, hit: [] };
      V.bid = null;
      renderAll();
      S.drum();
      say(e.p, 'challenge', 0.6);
      log(`⚔️ ${who(e.p)} thách đấu: phải lật <b>${e.n}</b> 🌹 — chồng trước mặt mình ${V.omen === 'night' ? '<b>sau cùng</b> (Đêm Đen)' : 'trước'}.`);
      await spot(`<div class="ico">⚔️</div><div class="cap">${who(e.p)} lật ${e.n} 🌹</div>`, '', 900);
      break;
    case 'flip': {
      const { d } = stackOf(e.id);
      if (d) Object.assign(d, { fl: true, k: e.k, res: e.res });
      const safe = isSafe({ k: e.k, res: e.res });
      if (safe) V.flip.got++;
      renderMats(); renderCenter();
      S.flip();
      pulse(discEl(e.id), 'flipin', 700);
      if (safe) { S.rose(); if (!QUICK) UI.floatAt(anchor(e.s), '🌹'); }
      log(`${safe ? '🌹' : '💀'} ${who(e.p)} lật đĩa ${e.o === e.p ? 'của chính mình' : `của ${who(e.o)}`}: <b>${dn(e.k)}</b>${e.k === 'mask' ? ` → ${dn(e.res)}` : ''}`);
      await sleep(safe ? 550 : 300);
      break;
    }
    case 'pit':
      V.flip.need = e.need;
      renderCenter();
      SFX.tone(300, 0.5, { type: 'triangle', v: 0.08, to: 120 });
      log(`🕳️ Hố Sâu! ${who(e.p)} phải lật thêm 1 đĩa (cần ${e.need}).`);
      if (!QUICK) UI.floatAt(anchor(e.p), '🕳️ +1', 'big');
      await sleep(500);
      break;
    case 'shieldGet':
      V.flip.shield = true;
      renderCenter();
      S.magic();
      log(`🛡️ ${who(e.p)} nhặt được Khiên — lần này có dính Sọ cũng không mất đĩa.`);
      if (!QUICK) UI.floatAt(anchor(e.p), '🛡️');
      await sleep(400);
      break;
    case 'hauntHit':
      V.flip.need = e.need;
      V.flip.hit = (V.flip.hit || []).concat(e.s);
      renderMats(); renderCenter();
      S.ghost();
      for (const g of e.ghosts) say(g, 'ghost');
      log(`👻 Chồng này bị ${e.ghosts.map(who).join(', ')} ám! Phải lật thêm ${e.ghosts.length} đĩa (cần ${e.need}).`);
      if (!QUICK) UI.floatAt(anchor(e.s), `👻 +${e.ghosts.length}`, 'big');
      await sleep(800);
      break;
    case 'success': {
      P(e.p).wins = e.wins;
      SFX.win();
      say(e.p, 'success', 0.8);
      log(`🏅 ${who(e.p)} thắng thử thách! (${e.wins}/${V.need} ★)`);
      const c = anchor(e.p);
      if (!QUICK) UI.burst(c.x, c.y, ['#ff4d6d', '#ffd23f', '#fff', col(e.p)], 60, 7);
      if (e.p === m && !QUICK) UI.confetti(120);
      await spot(`<div class="ico">🌹</div><div class="cap">${who(e.p)} thắng thử thách!</div><div class="sub">${'★'.repeat(e.wins)}${'☆'.repeat(Math.max(0, V.need - e.wins))}</div>`, 'win', 1300);
      renderMats();
      break;
    }
    case 'fail': {
      SFX.boom(); S.skull();
      $('.sk-main').classList.remove('shake'); void $('.sk-main').offsetWidth; $('.sk-main').classList.add('shake');
      const self = e.o === e.p;
      say(e.p, self ? 'self' : 'fail');
      if (!self) say(e.o, 'trap');
      log(`💀 ${who(e.p)} lật trúng Sọ ${self ? 'của <b>chính mình</b>' : `của ${who(e.o)}`}!${e.n > 1 ? ' 🌕 Trăng Máu: mất 2 đĩa!' : ''}`);
      const c = anchor(e.p);
      if (!QUICK) UI.burst(c.x, c.y, ['#2a2723', '#716a60', '#c8372d', '#fff'], 70, 8);
      await spot(`<div class="ico">💀</div><div class="cap">${who(e.p)} trúng Sọ${self ? ' của chính mình' : ` của ${who(e.o)}`}!</div>`, 'bad', 1400);
      break;
    }
    case 'lose':
      if (e.p === m && me() && e.k) { log(`💔 Bạn mất ${dn(e.k)}.`); }
      else log(`💔 ${who(e.p)} mất 1 đĩa (còn ${e.left}).`);
      if (!QUICK) UI.floatAt(anchor(e.p), '−1 💿', 'big');
      P(e.p).nLost = (P(e.p).nLost || 0) + 1;
      await sleep(500);
      break;
    case 'saved':
      log(`🛡️ Khiên đỡ cho ${who(e.p)} — không mất đĩa nào!`);
      if (!QUICK) UI.floatAt(anchor(e.p), '🛡️ Thoát!', 'big');
      await sleep(600);
      break;
    case 'restore':
      log(`🎁 Phúc Lành: ${who(e.p)} được trả lại 1 đĩa${e.k ? ` (${dn(e.k)})` : ''}.`);
      if (!QUICK) UI.floatAt(anchor(e.p), '+1 💿', 'big');
      await sleep(500);
      break;
    case 'out':
      P(e.p).alive = false; P(e.p).ghost = e.ghost;
      renderMats();
      SFX.tone(200, 0.8, { type: 'sawtooth', v: 0.08, to: 60 });
      log(`☠️ ${who(e.p)} hết đĩa — bị loại!${e.ghost ? ' Nhưng sẽ quay lại làm <b>hồn ma</b> 👻' : ''}`);
      await sleep(1000);
      break;
    case 'over':
      V.phase = 'over'; V.winner = e.p;
      SFX.win(); if (!QUICK) { UI.fireworks(6, () => SFX.pop()); UI.confetti(); }
      say(e.p, 'win');
      log(`🏆 ${who(e.p)} thắng chung cuộc!`);
      await sleep(1000);
      break;
  }
}

// ================= MODAL =================
const mq = s => document.querySelector('#modal ' + s);

function showGameOver() {
  overShown = true;
  const host = CTX.me().isHost;
  const own = p => (P(p).hand ? P(p).hand.length : P(p).nHand);
  const rank = active().sort((a, b) => (b === V.winner) - (a === V.winner) || P(b).wins - P(a).wins || own(b) - own(a));
  const medal = ['🏆', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];
  UI.openModal(`<div class="sk-m"><h2 class="center">🏆 ${nm(V.winner)} thắng!</h2>
    <ol class="rank">${rank.map((p, i) => `<li style="--c:${col(p)}"><span>${medal[i]}</span><span class="grow">${nm(p)}</span>
      <span>${'★'.repeat(P(p).wins)}</span><span class="muted small">${P(p).alive ? `💿${own(p)}` : P(p).ghost ? '👻' : '☠️'}</span></li>`).join('')}</ol>
    <div class="btns"><button class="ghost" data-a="close">👀 Xem bàn</button>
    ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}</div></div>`);
  const on = (a, fn) => { const b = mq(`[data-a="${a}"]`); if (b) b.onclick = () => { UI.closeModal(); fn(); }; };
  on('close', () => {});
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

function showHelp() {
  const chaos = !V || V.chaos;
  UI.openModal(`<div class="sk-m help">
    <h2>📖 Luật chơi — Hoa & Sọ (Skull)</h2>
    <h3>Cơ bản</h3><ul>
      <li>Mỗi người có <b>3 đĩa 🌹 Hoa</b> và <b>1 đĩa 💀 Sọ</b>${chaos ? ' (Hỗn Loạn: thêm 1 đĩa đặc biệt ngẫu nhiên)' : ''}.</li>
      <li>Đầu vòng, cả bàn cùng lúc <b>úp 1 đĩa</b> trước mặt. Sau đó lần lượt: <b>đặt thêm 1 đĩa</b> lên chồng của mình, hoặc <b>cược</b> "tôi lật được n Hoa".</li>
      <li>Khi đã có cược, mọi người lần lượt <b>nâng</b> hoặc <b>bỏ</b> (bỏ là không cược lại vòng đó). Người cược cao nhất phải lật đủ n đĩa.</li>
      <li>Lật: phải lật <b>hết chồng trước mặt mình trước</b>, rồi mới chọn đĩa trên cùng của chồng người khác.</li>
      <li>Lật đủ n mà không trúng Sọ → <b>thắng 1 thử thách</b> (★). Thắng ${V ? V.need : 2} lần là thắng chung cuộc.</li>
      <li>Trúng Sọ người khác → mất ngẫu nhiên 1 đĩa. Trúng Sọ <b>của chính mình</b> → tự chọn đĩa bỏ. Mất đĩa không ai biết là đĩa gì. Hết đĩa là bị loại; người cuối cùng còn đĩa cũng thắng.</li>
      <li>Vòng sau người thách đấu đi đầu. Mỗi lượt có ${Math.round(CTX.room().turnMs / 1000)} giây — hết giờ máy đi giúp (đặt Hoa / bỏ).</li>
    </ul>
    ${chaos ? `<h3>🔥 Đĩa đặc biệt</h3><ul>${SPECIALS.map(k => `<li>${DISCS[k].icon} <b>${DISCS[k].name}</b> — ${DISCS[k].desc}</li>`).join('')}</ul>
    <h3>🔮 Điềm báo (đầu vòng, không phải vòng nào cũng có)</h3><ul>${Object.values(OMENS).map(O => `<li>${O.icon} <b>${O.name}</b> — ${O.desc}</li>`).join('')}</ul>
    <h3>👻 Hồn ma</h3><ul><li>Người bị loại thành hồn ma. Mỗi vòng (trước khi bắt đầu lật) được bí mật <b>ám</b> 1 chồng đĩa: ai lật vào chồng đó phải lật thêm 1 đĩa.</li></ul>` : ''}
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Hiểu rồi, bịp thôi!</button></div></div>`);
  mq('[data-x]').onclick = UI.closeModal;
}

// ================= ĐIỀU KHIỂN =================
function send(action) {
  pending = true;
  if (V) renderControls();
  return CTX.send(action).then(r => { pending = false; if (V && !playing) renderAll(); return r; });
}

function onHandClick(k) {
  if (canDiscard()) { SFX.click(); return send({ type: 'discard', k }); }
  if (!canPlaceNow()) return;
  SFX.click();
  if (k !== 'eye') return send({ type: 'place', k });
  const opts = active().filter(p => p !== mySeat() && alive(p) && (V.phase === 'place0' || (V.stacks[p] || []).length))
    .map(p => ({ html: nm(p), value: p, color: col(p) }));
  UI.pickModal('👁️ Nhìn trộm đĩa trên cùng của ai?', opts, peek => send({ type: 'place', k, peek }));
}

function onMatClick(p) {
  if (canFlip(p)) { SFX.click(); return send({ type: 'flip', s: p }); }
  if (canHaunt() && alive(p)) { SFX.click(); return send({ type: 'haunt', s: p }); }
}

function tickTimers() {
  if (!V) return;
  const now = Date.now(), turnMs = CTX.room().turnMs;
  const rem = deadline ? deadline - now : 0;
  const frac = !deadline || playing ? 0 : Math.max(0, Math.min(1, rem / turnMs));
  ROOT.querySelectorAll('.mat .mat-timer i').forEach(i => { i.style.width = (i.closest('.mat').classList.contains('turn') ? frac * 100 : 0) + '%'; });
  const mineAsked = $('#sk-status').classList.contains('mine') && !canHaunt();
  const tb = $('#sk-timer');
  tb.style.width = (mineAsked ? frac * 100 : 0) + '%';
  tb.classList.toggle('low', rem < 8000);
  if (mineAsked && rem > 0 && rem < 5000 && Math.floor(rem / 1000) !== tb._s) { tb._s = Math.floor(rem / 1000); SFX.tick(); }
}

// ================= VÒNG ĐỜI =================
async function update(msg, { backlog = 0, hidden = false } = {}) {
  SPEED = backlog >= 3 ? 4 : backlog >= 1 ? 1.8 : 1;
  if (!V) { V = structuredClone(msg.state); renderAll(); }
  playing = true;
  QUICK = hidden;
  if (hidden) SPEED = 100;
  renderControls();
  for (const e of msg.events) { try { await playEvent(e); } catch (err) { console.error(err); } }
  QUICK = false;
  const auto = msg.meta && msg.meta.auto;
  if (auto != null) for (const p of [].concat(auto)) log(`⏱️ ${nm(p)} hết giờ — máy đi giúp.`);
  playing = false;
  SPEED = 1;
  V = structuredClone(msg.state);
  deadline = msg.deadlineIn ? msg.recvAt + msg.deadlineIn : 0;
  renderAll();
  // Chuông 'tới lượt' chỉ kêu 1 lần mỗi lượt mới.
  const pl = me(), mine = pl && pl.alive && (((V.phase === 'place' || V.phase === 'bid') && V.turn === mySeat()) || (V.phase === 'discard' && V.discard.p === mySeat()));
  const key = mine ? [V.round, V.phase, V.total, V.bid && V.bid.n].join(':') : '';
  if (mine && key !== turnKey) SFX.myTurn();
  turnKey = key;
  if (V.phase === 'over' && !overShown) setTimeout(showGameOver, 1200);
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root; SEATS = ctx.game.seats;
    V = null; pending = false; playing = false; SPEED = 1; QUICK = false; deadline = 0; overShown = false; lastOmenRound = 0; turnKey = '';
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    UI.emoteBar($('#sk-emotes'));
    UI.toolbar($('#sk-tools'), { help: showHelp });
    $('#sk-hand').addEventListener('click', e => { const b = e.target.closest('.hd'); if (b) onHandClick(b.dataset.k); });
    $('#sk-mats').addEventListener('click', e => { const b = e.target.closest('.mat'); if (b) onMatClick(+b.dataset.p); });
    $('#sk-actions').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.bid) { SFX.click(); send({ type: 'bid', n: +b.dataset.bid }); }
      else if (b.dataset.a === 'pass') { SFX.click(); send({ type: 'pass' }); }
      else if (b.dataset.a === 'nohaunt') send({ type: 'haunt', s: null });
    });
    timerInt = setInterval(tickTimers, 100);
    return {
      update,
      onRoom: () => { if (V && !playing) renderMats(); },
      emoteAnchor: seat => (V && seat >= 0 && V.players[seat] && V.players[seat].active ? anchor(seat) : null),
      unmount() { clearInterval(timerInt); V = null; },
    };
  },
};
