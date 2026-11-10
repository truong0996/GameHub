// Giao diện Cờ Cá Ngựa — plugin client của hub (xem "Game client interface" trong CLAUDE.md).
import * as C from './rules.js';

const TEMPLATE = `
<div class="ccn">
  <aside class="side side-left">
    <div class="side-head"><span>Phòng <b id="g-code"></b></span><span id="g-turns"></span></div>
    <div id="players"></div>
    <div id="g-info" class="infobox"></div>
  </aside>
  <main id="board-wrap" class="dark">
    <svg id="board" viewBox="-640 -640 1280 1280"></svg>
    <div id="weather"></div>
    <div id="dice"><div class="cube"></div></div>
    <div id="dice-mods"></div>
    <div id="banner"></div>
  </main>
  <aside class="side side-right">
    <div id="status"></div>
    <button id="btn-roll" class="gold big">🎲 Gieo xúc xắc</button>
    <div class="hand-title" id="hand-title">Thẻ kỹ năng của bạn</div>
    <div id="hand"></div>
    <div id="card-hint"></div>
    <div id="emotes"></div>
    <div id="log"></div>
    <div id="tools"></div>
  </aside>
</div>`;

const SVGNS = 'http://www.w3.org/2000/svg';
const KNIGHT = '♞︎';

// ---------- trạng thái của instance (chỉ 1 ván được mount tại 1 thời điểm) ----------
let CTX, UI, SFX, ROOT;
let GAME, NAMES, HE, STB, TURN_P, L_SPEC, L_MET, L_HINT, L_HORSE;
let DEADLINE, pending, cardMode, SPEED, playing, overShown, spinN, timerInt, keyHandler;

const $ = s => ROOT.querySelector(s);
const esc = s => UI.esc(s);
const pick = a => a[Math.floor(Math.random() * a.length)];
const mySeat = () => CTX.me().seat;
const canAct = () => !!GAME && !playing && !pending && GAME.phase !== 'over' && mySeat() >= 0 && GAME.turn === mySeat();
const nm = p => (p == null ? '???' : `<b class="pn" style="--c:${C.SEATS[p].color}">${esc(NAMES[p] || C.SEATS[p].name)}</b>`);
function S(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), ch = s => Math.round(Math.min(255, Math.max(0, ((n >> s) & 255) * (1 + f))));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
// Màu ghế rất sáng (Trắng) vẽ lên nền sáng của hub thì tối lại cho thấy viền/chữ.
const isLight = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255 > 0.9; };
const edge = hex => (isLight(hex) ? shade(hex, -0.3) : hex);

// ---------- âm thanh riêng của game (dùng tone/noise của hub) ----------
const snd = {
  dice() { for (let i = 0; i < 8; i++) SFX.noise(0.05, { v: 0.3, f: 1800 + Math.random() * 2500, q: 3, delay: i * 0.1 + Math.random() * 0.03 }); },
  hop(i) { SFX.tone(480 + i * 28, 0.07, { type: 'square', v: 0.045, to: 680 + i * 28 }); },
  land() { SFX.noise(0.08, { v: 0.25, f: 600 }); SFX.tone(260, 0.12, { type: 'triangle', v: 0.15, to: 180 }); },
  kick() { SFX.noise(0.3, { v: 0.6, f: 300, ft: 'lowpass' }); SFX.tone(240, 0.45, { type: 'sawtooth', v: 0.18, to: 45 }); SFX.tone(900, 0.15, { type: 'square', v: 0.06, to: 300, delay: 0.02 }); },
  freeze() { [2093, 2637, 3136, 2637, 3520].forEach((f, i) => SFX.tone(f, 0.3, { v: 0.06, delay: i * 0.06 })); SFX.noise(0.5, { v: 0.08, f: 6000, ft: 'highpass' }); },
  shield() { SFX.tone(520, 0.45, { v: 0.12, to: 1250 }); SFX.tone(780, 0.45, { v: 0.07, to: 1870, delay: 0.05 }); },
  mystery() { [523, 659, 784, 1047, 784, 1319].forEach((f, i) => SFX.tone(f, 0.22, { v: 0.09, delay: i * 0.07 })); },
  meteor() { SFX.tone(2400, 0.6, { type: 'sawtooth', v: 0.04, to: 200 }); SFX.noise(0.6, { v: 0.15, f: 3000, fto: 300 }); },
  nomove() { SFX.tone(330, 0.22, { type: 'triangle', v: 0.12, to: 196 }); },
};

// ================= HÌNH HỌC =================
// Bàn là đa giác đều N cạnh (N = st.ring.length), đỉnh k là cửa chuồng của ghế giữ cạnh k.
// r = bán kính tới đỉnh, rot = góc đỉnh đầu tiên (độ): bàn vuông xoay cho cạnh nằm ngang.
const SHAPE = { 3: { r: 450, rot: -90 }, 4: { r: 490, rot: -135 }, 5: { r: 410, rot: -90 }, 6: { r: 400, rot: -90 } };
const EDGE = 43;           // lề gỗ quanh đường đua (đo vuông góc với cạnh)
let N, SIDE, R, ROT, RIN, ROUT, RSTB, SIDE_OF, VB;
function setGeometry(st) {
  N = st.ring.length; SIDE = st.side; ({ r: R, rot: ROT } = SHAPE[N]);
  RIN = R * Math.cos(Math.PI / N);             // bán kính nội tiếp (tâm → giữa cạnh)
  ROUT = R + EDGE / Math.cos(Math.PI / N);     // đỉnh của khung gỗ
  RSTB = ROUT + 58;                            // tâm chuồng xuất phát, ngay ngoài đỉnh
  SIDE_OF = st.players.map(pl => pl.side);
  // Khung nhìn vuông vừa khít khung gỗ + chuồng + tên, căn giữa theo hình thật (tam giác lệch lên trên).
  const pts = [];
  for (let k = 0; k < N; k++) { const q = polar(ROUT, k), s = polar(RSTB, k); pts.push(q, { x: s.x - 90, y: s.y - 96 }, { x: s.x + 90, y: s.y + 96 }); }
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const s = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 40;
  VB = { x: Math.round(cx - s / 2), y: Math.round(cy - s / 2), s: Math.round(s) };
  $('#board').setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.s} ${VB.s}`);
  // xúc xắc (HTML phủ lên) đặt đúng tâm bàn, vốn không trùng tâm khung khi bàn lệch
  const wrap = $('#board-wrap');
  wrap.style.setProperty('--cx', (-VB.x / VB.s * 100).toFixed(2) + '%');
  wrap.style.setProperty('--cy', (-VB.y / VB.s * 100).toFixed(2) + '%');
}
const ang = k => (ROT + 360 / N * k) * Math.PI / 180;
const polar = (r, k) => ({ x: r * Math.cos(ang(k)), y: r * Math.sin(ang(k)) });
const poly = r => Array.from({ length: N }, (_, k) => { const q = polar(r, k); return q.x + ',' + q.y; }).join(' ');
function trackPos(c) {
  const s = Math.floor(c / SIDE), t = (c % SIDE) / SIDE, a = polar(R, s), b = polar(R, (s + 1) % N);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
const homePos = (p, s) => polar(R * (1 - s * 0.12), SIDE_OF[p]);
const stableCenter = p => polar(RSTB, SIDE_OF[p]);
const SLOT = [[-21, -21], [21, -21], [-21, 21], [21, 21]];
const stablePos = (p, h) => { const c = stableCenter(p); return { x: c.x + SLOT[h][0], y: c.y + SLOT[h][1] }; };
function locPos(loc) {
  const k = loc[0], r = loc.slice(1);
  if (k === 'T') return trackPos(+r);
  const [a, b] = r.split(':').map(Number);
  return k === 'H' ? homePos(a, b) : stablePos(a, b);
}
function toScreen(q) {
  const r = $('#board').getBoundingClientRect();
  return { x: r.left + (q.x - VB.x) / VB.s * r.width, y: r.top + (q.y - VB.y) / VB.s * r.height };
}
const floatBoard = (q, html, cls) => UI.floatAt(toScreen(q), html, cls);

// ================= BÀN CỜ =================
function emoji(g, ch, size, y = 0, x = 0) { const t = S('text', { x, y, 'font-size': size, class: 'emo' }, g); t.textContent = ch; return t; }

function buildBoard(st) {
  const svg = $('#board');
  svg.innerHTML = '';
  setGeometry(st);
  const defs = S('defs', {}, svg);
  defs.innerHTML = `
    <radialGradient id="gBoard" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#456e5d"/><stop offset="1" stop-color="#253f36"/></radialGradient>
    <radialGradient id="gCenter"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".45"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    ${C.SEATS.map((s, p) => `<radialGradient id="hg${p}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".38" stop-color="${s.color}"/><stop offset="1" stop-color="${shade(s.color, -0.5)}"/></radialGradient>`).join('')}`;
  const bg = S('g', {}, svg);
  S('polygon', { points: poly(ROUT), fill: 'url(#gBoard)', stroke: '#8b6243', 'stroke-width': 14, 'stroke-linejoin': 'round' }, bg);
  for (let k = 0; k < N; k++) {
    const a = polar(R - 22, k), b = polar(R - 22, (k + 1) % N), p = st.ring[k];
    S('polygon', { points: `0,0 ${a.x},${a.y} ${b.x},${b.y}`, fill: p != null ? C.SEATS[p].color : '#888', opacity: p != null ? 0.1 : 0.03 }, bg);
  }
  for (const f of [0.4, 0.63, 0.86]) S('circle', { r: RIN * f, fill: 'none', stroke: 'rgba(255,255,255,.06)', 'stroke-width': 2, 'stroke-dasharray': '3 12' }, bg);
  S('polygon', { points: poly(R), fill: 'none', stroke: 'rgba(255,255,255,.07)', 'stroke-width': 36, 'stroke-linejoin': 'round' }, bg);
  // đường đua (cạnh trống của bàn 2 người chỉ có ô thường)
  for (let c = 0; c < st.L; c++) {
    const q = trackPos(c), p = C.sideSeat(st, c);
    if (p != null && c % SIDE === 0) {
      const col = C.SEATS[p].color, g = S('circle', { cx: q.x, cy: q.y, r: 17, fill: col, 'fill-opacity': 0.25, stroke: col, 'stroke-width': 4 }, bg);
      S('title', {}, g).textContent = `Cửa chuồng ${C.SEATS[p].name}`;
    } else if (p != null && c % SIDE === 1) {
      S('circle', { cx: q.x, cy: q.y, r: 15, fill: C.SEATS[p].color, 'fill-opacity': 0.9, stroke: '#fff', 'stroke-width': 2 }, bg);
      S('text', { x: q.x, y: q.y + 1, 'font-size': 15, fill: '#fff', class: 'lbl', style: 'stroke-width:3px' }, bg).textContent = '★';
    } else S('circle', { cx: q.x, cy: q.y, r: 12.5, class: 'cell' }, bg);
  }
  // chuồng đích (6 bậc)
  for (let p = 0; p < st.players.length; p++) {
    if (!st.players[p].active) continue;
    const col = C.SEATS[p].color, need = C.HOME - st.opts.horses;
    for (let s = 1; s <= C.HOME; s++) {
      const q = homePos(p, s);
      S('circle', { cx: q.x, cy: q.y, r: 18, fill: col, 'fill-opacity': s > need ? 0.3 : 0.12, stroke: col, 'stroke-width': s > need ? 2.5 : 1.5, 'stroke-opacity': 0.85 }, bg);
      S('text', { x: q.x, y: q.y + 1, 'font-size': 15, fill: col, class: 'lbl', style: 'stroke-width:3px' }, bg).textContent = s;
    }
  }
  // tâm bàn
  S('circle', { r: 92, fill: 'url(#gCenter)' }, bg);
  S('circle', { r: 72, fill: 'rgba(16,30,25,.6)', stroke: 'rgba(255,210,63,.4)', 'stroke-width': 2.5 }, bg);
  // chuồng xuất phát (STB[p] = vòng chuồng, sáng lên khi tới lượt ghế p)
  STB = [];
  st.players.forEach((pl, p) => {
    if (!pl.active) return;
    const col = C.SEATS[p].color, c = stableCenter(p);
    STB[p] = S('circle', { cx: c.x, cy: c.y, r: 60, fill: col, 'fill-opacity': 0.16, stroke: edge(col), 'stroke-width': 3, class: 'stb' }, bg);
    pl.horses.forEach((_, h) => { const q = stablePos(p, h); S('circle', { cx: q.x, cy: q.y, r: 16, fill: 'rgba(42,39,35,.1)', stroke: edge(col), 'stroke-opacity': 0.6 }, bg); });
    S('text', { x: c.x, y: c.y + Math.sign(c.y) * 82, 'font-size': 24, fill: shade(col, isLight(col) ? -0.6 : -0.42), class: 'lbl lbl-out' }, bg).textContent = pl.name;
  });
  L_SPEC = S('g', {}, svg); L_MET = S('g', {}, svg); L_HINT = S('g', {}, svg); L_HORSE = S('g', {}, svg);
  HE = st.players.map((pl, p) => pl.horses.map((_, h) => makeHorse(p, h)));
  TURN_P = undefined;
  syncHorses(st);
}

function makeHorse(p, h) {
  const g = S('g', { class: 'horse', 'data-p': p, 'data-h': h }, L_HORSE);
  S('circle', { r: 30, fill: 'transparent' }, g); // vùng chạm rộng cho điện thoại
  S('ellipse', { cx: 0, cy: 14, rx: 13, ry: 4, fill: 'rgba(0,0,0,.45)' }, g);
  S('circle', { class: 'turnc', r: 22, style: `--c:${C.SEATS[p].color}` }, g);
  S('circle', { class: 'halo', r: 21 }, g);
  S('circle', { class: 'shieldc', r: 23 }, g);
  const body = S('g', { class: 'body' }, g); // nhún nhẹ khi tới lượt (transform của g dùng để đặt vị trí)
  S('circle', { r: 16, fill: `url(#hg${p})`, stroke: '#fff', 'stroke-width': 2.5 }, body);
  S('text', { y: 1, class: 'knight' }, body).textContent = KNIGHT;
  return g;
}
// Làm nổi ngựa + chuồng của ghế đang tới lượt (p = null: không ai, vd hết ván); ngựa người khác mờ bớt.
function markTurn(p) {
  if (!HE || p === TURN_P) return;
  TURN_P = p;
  $('#board').classList.toggle('has-turn', p != null);
  HE.forEach((row, q) => row.forEach(g => g.classList.toggle('turn', q === p)));
  STB.forEach((c, q) => c && c.classList.toggle('turn', q === p));
  if (p != null && HE[p]) HE[p].forEach(raise); // nằm trên ngựa khác khi chung ô
}
function placeHorse(g, x, y, extra) { g._x = x; g._y = y; g.setAttribute('transform', `translate(${x} ${y})${extra ? ' ' + extra : ''}`); }
const raise = g => g.parentNode.appendChild(g);
const horseQ = g => ({ x: g._x, y: g._y });
function syncHorses(st) {
  st.players.forEach((pl, p) => pl.horses.forEach((hs, h) => {
    const g = HE[p] && HE[p][h];
    if (!g) return;
    const q = locPos(C.locKey(st, p, h));
    if (g._x !== q.x || g._y !== q.y) placeHorse(g, q.x, q.y);
    g.classList.toggle('shielded', !!hs.shield);
  }));
}
function renderSpecials(list) {
  L_SPEC.innerHTML = '';
  for (const s of list || []) {
    const q = trackPos(s.cell), g = S('g', { transform: `translate(${q.x} ${q.y})`, class: 'sp sp-' + s.type }, L_SPEC);
    let tip;
    if (s.type === 'portal') {
      const col = s.pair ? '#ff4fd8' : '#00e5ff';
      S('circle', { r: 16, fill: 'rgba(0,0,0,.55)', stroke: col, 'stroke-width': 3.5, 'stroke-dasharray': '7 4', class: 'spin' }, g);
      emoji(g, '🌀', 17);
      tip = 'Cổng dịch chuyển: dừng ở đây sẽ bay tới cổng cùng màu!';
    } else if (s.type === 'card') {
      S('circle', { r: 15, fill: '#ffcf3f', stroke: '#fff', 'stroke-width': 2 }, g);
      emoji(g, '🎁', 16);
      tip = 'Ô quà: dừng ở đây nhận 1 thẻ kỹ năng';
    } else {
      S('circle', { r: 15, fill: '#7b3cff', stroke: '#e0ccff', 'stroke-width': 2 }, g);
      emoji(g, '❓', 16);
      tip = 'Ô bí ẩn: may hay rủi? Ô này sẽ biến mất và xuất hiện chỗ khác!';
    }
    S('title', {}, g).textContent = tip;
  }
}
function renderMeteors(m) {
  L_MET.innerHTML = '';
  if (!m) return;
  for (const c of m.cells) {
    const q = trackPos(c), g = S('g', { transform: `translate(${q.x} ${q.y})` }, L_MET);
    S('circle', { r: 22, class: 'm-ring' }, g);
    emoji(g, '☄️', 16, -30);
  }
}
const clearHint = () => { if (L_HINT) L_HINT.innerHTML = ''; };
function showHint(m) {
  clearHint();
  const q = locPos(m.to);
  S('circle', { cx: q.x, cy: q.y, r: 21, class: 'hint' }, L_HINT);
  if (m.kick) emoji(L_HINT, '💥', 22, q.y - 30, q.x);
}

// ================= ANIMATION =================
const wait = ms => new Promise(r => setTimeout(r, ms / SPEED));
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function tween(ms, fn, ease = t => t) {
  ms /= SPEED;
  return new Promise(res => {
    const t0 = performance.now();
    const step = now => { const t = Math.min(1, (now - t0) / ms); fn(ease(t)); if (t < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
}
async function hopTo(g, b, i) {
  const a = horseQ(g);
  snd.hop(i);
  await tween(C.DUR.hop, t => placeHorse(g, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * 16, `scale(${1 + Math.sin(Math.PI * t) * 0.2})`));
  placeHorse(g, b.x, b.y);
}
async function flyTo(g, b, { ms = C.DUR.fly, arc = 70, spin = 0, scale = 0.35 } = {}) {
  raise(g);
  const a = horseQ(g);
  await tween(ms, t => placeHorse(g, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * arc,
    `rotate(${spin * t}) scale(${1 + Math.sin(Math.PI * t) * scale})`), easeInOut);
  placeHorse(g, b.x, b.y);
}
function shake(ms = 550) { const w = $('#board-wrap'); w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); setTimeout(() => w.classList.remove('shake'), ms); }
function banner(big, small, color = '#fff', ms = 1400) {
  const b = $('#banner');
  b.innerHTML = `<div class="b-big" style="color:${color}">${big}</div>${small ? `<div class="b-small">${small}</div>` : ''}`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('show'), ms / SPEED);
}
function weather(kind, ms = 2600) {
  const w = $('#weather');
  w.className = 'on w-' + kind;
  clearTimeout(w._t);
  w._t = setTimeout(() => { w.className = ''; }, ms / SPEED);
}
function log(html) {
  const box = $('#log');
  box.prepend(UI.el('div', 'log-item', html));
  while (box.children.length > 80) box.lastChild.remove();
}

// ---------- xúc xắc ----------
const FACE = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function buildDice() {
  const cube = $('#dice .cube');
  for (let v = 1; v <= 6; v++) {
    const f = UI.el('div', `face lk-df f${v}${v === 1 || v === 4 ? ' red' : ''}`);
    for (let i = 0; i < 9; i++) f.appendChild(UI.el('i', PIPS[v].includes(i) ? 'pip' : 'off'));
    cube.appendChild(f);
  }
}
async function animRoll(e) {
  const d = $('#dice'), cube = d.querySelector('.cube');
  d.classList.toggle('golden', !!e.golden);
  d.style.setProperty('--glow', C.SEATS[e.p].color);
  CTX.skin.set(d, e.p, 'dice');   // xúc xắc người gieo mua ở cửa hàng (Xúc Xắc Vàng .golden vẫn đè lên)
  spinN += 2;
  const [rx, ry] = FACE[e.v];
  cube.style.transitionDuration = (C.DUR.roll * 0.9 / SPEED / 1000) + 's';
  cube.style.transform = `rotateX(${rx + 360 * spinN}deg) rotateY(${ry + 360 * (spinN + 1)}deg)`;
  d.classList.remove('bounce'); void d.offsetWidth; d.classList.add('bounce');
  snd.dice();
  $('#dice-mods').textContent = '';
  await wait(C.DUR.roll - 200);
  const mods = [];
  if (e.turbo) mods.push(`🚀 ${e.v} × 2 = ${e.v * 2}`);
  if (e.ghost) mods.push('👻 bay qua đầu');
  $('#dice-mods').textContent = mods.join(' · ');
  if (e.v === 6) { const s = toScreen({ x: 0, y: 0 }); UI.burst(s.x, s.y, ['#ffd23f', '#fff', C.SEATS[e.p].color], 34, 6); SFX.pop(); }
  await wait(200);
}

// ================= PHÁT SỰ KIỆN =================
async function playEvent(e) {
  const H = (p, h) => HE[p] && HE[p][h];
  switch (e.t) {
    case 'start':
      banner('🐴 XUẤT PHÁT!', 'Lục Mã Hỗn Chiến bắt đầu — chúc may mắn!', '#ffd23f', C.DUR.start);
      SFX.gong(); UI.fireworks(3, SFX.pop); log('🏁 <b>Ván mới bắt đầu!</b>');
      await wait(C.DUR.start); break;
    case 'turn':
      setTurnUI(e.p);
      if (e.p === mySeat()) { SFX.myTurn(); UI.toast('🎲 Tới lượt bạn!'); }
      await wait(C.DUR.turn); break;
    case 'roll':
      await animRoll(e);
      log(`🎲 ${nm(e.p)} gieo được <b>${e.v}</b>${e.turbo ? ` 🚀 → <b>${e.v * 2}</b> bước` : ''}${e.golden ? ' (🎯 vàng)' : ''}`);
      break;
    case 'move': {
      const g = H(e.p, e.h);
      raise(g);
      for (let i = 0; i < e.path.length; i++) await hopTo(g, locPos(e.path[i]), i);
      snd.land();
      const s = toScreen(horseQ(g));
      UI.burst(s.x, s.y, [C.SEATS[e.p].color, '#fff'], 12, 3);
      if (e.kind === 'out') log(`🐎 ${nm(e.p)} xuất quân!`);
      if (e.kind === 'home') log(`⬆️ ${nm(e.p)} lên bậc chuồng`);
      if (e.kind === 'enter') { log(`🏁 ${nm(e.p)} đưa ngựa vào chuồng đích!`); floatBoard(horseQ(g), '🏁'); SFX.card(); }
      await wait(150); break;
    }
    case 'kick': {
      const g = H(e.p, e.h), s = toScreen(horseQ(g));
      if (e.reason === 'hole') { SFX.tele(); log(`🕳️ Ngựa của ${nm(e.p)} rơi xuống hố đen, về chuồng!`); }
      else {
        snd.kick(); shake();
        UI.burst(s.x, s.y, [C.SEATS[e.p].color, e.by != null ? C.SEATS[e.by].color : '#fff', '#fff'], 50, 9);
        banner('💥 ĐÁ!', `${nm(e.by)} đá ngựa ${nm(e.p)} về chuồng`, e.by != null ? C.SEATS[e.by].color : '#fff', 1100);
        log(`💥 ${nm(e.by)} đá ngựa của ${nm(e.p)} về chuồng!`);
      }
      g.classList.remove('shielded');
      await flyTo(g, stablePos(e.p, e.h), { ms: C.DUR.kick - 100, arc: 150, spin: 720, scale: 0.5 });
      await wait(100); break;
    }
    case 'fly': {
      const g = H(e.p, e.h), to = locPos(e.to);
      if (e.kind === 'portal') {
        SFX.tele(); raise(g);
        const a = horseQ(g);
        let s = toScreen(a);
        UI.burst(s.x, s.y, ['#00e5ff', '#ff4fd8', '#fff'], 24, 4);
        await tween(260, t => placeHorse(g, a.x, a.y, `rotate(${t * 360}) scale(${1 - t})`));
        placeHorse(g, to.x, to.y, 'scale(0)');
        s = toScreen(to);
        UI.burst(s.x, s.y, ['#00e5ff', '#ff4fd8', '#fff'], 24, 4);
        await tween(260, t => placeHorse(g, to.x, to.y, `rotate(${(1 - t) * 360}) scale(${t})`));
        placeHorse(g, to.x, to.y);
        log(`🌀 ${nm(e.p)} chui qua cổng dịch chuyển!`);
        await wait(C.DUR.fly - 520);
      } else {
        SFX.whoosh();
        await flyTo(g, to, { arc: e.kind === 'boost' ? 90 : 50, spin: e.kind === 'back' ? -360 : 0 });
      }
      break;
    }
    case 'swap':
      SFX.tele();
      await Promise.all(e.moves.map(m => flyTo(H(m.p, m.h), locPos(m.to), { ms: C.DUR.swap - 100, arc: 100, spin: 360 })));
      log(`🔄 ${nm(e.moves[0].p)} và ${nm(e.moves[1].p)} đổi chỗ cho nhau!`);
      await wait(100); break;
    case 'card': {
      const cd = C.CARDS[e.card];
      floatBoard(stableCenter(e.p), cd.icon, 'big'); SFX.card();
      log(`🎁 ${nm(e.p)} nhận thẻ ${cd.icon} <b>${cd.name}</b>`);
      await wait(C.DUR.card); break;
    }
    case 'useCard': {
      const cd = C.CARDS[e.card];
      let extra = '';
      if (e.card === 'freeze') extra = ` lên ${nm(e.target)}`;
      if (e.card === 'golden') extra = ` → chọn số <b>${e.value}</b>`;
      banner(`${cd.icon} ${cd.name.toUpperCase()}`, `${nm(e.p)} dùng thẻ${extra}`, C.SEATS[e.p].color, C.DUR.useCard);
      ({ freeze: snd.freeze, ghost: snd.mystery, turbo: SFX.whoosh, golden: SFX.card, shield: snd.shield, swap: SFX.tele })[e.card]();
      log(`${cd.icon} ${nm(e.p)} dùng <b>${cd.name}</b>${extra}`);
      await wait(C.DUR.useCard); break;
    }
    case 'shield': {
      const g = H(e.p, e.h);
      g.classList.add('shielded'); snd.shield();
      floatBoard(horseQ(g), '🛡️', 'big'); log(`🛡️ Ngựa của ${nm(e.p)} được gắn khiên`);
      await wait(C.DUR.shield); break;
    }
    case 'freeze': {
      snd.freeze();
      const s = toScreen(stableCenter(e.p));
      UI.burst(s.x, s.y, ['#bfefff', '#7ee8ff', '#fff'], 40, 5);
      banner('❄️ ĐÓNG BĂNG', `${nm(e.p)} sẽ mất lượt kế tiếp`, '#7ee8ff', C.DUR.freeze);
      if (e.by == null) log(`😴 ${nm(e.p)} ngủ quên — mất lượt kế tiếp`);
      await wait(C.DUR.freeze); break;
    }
    case 'skip':
      snd.freeze(); banner('🥶 MẤT LƯỢT', `${nm(e.p)} đang bị đóng băng`, '#7ee8ff', C.DUR.skip);
      log(`🥶 ${nm(e.p)} bị mất lượt`);
      await wait(C.DUR.skip); break;
    case 'mystery': {
      const M = C.MYSTERY[e.outcome];
      snd.mystery();
      banner(`${M.icon} ${M.name.toUpperCase()}`, `Ngựa ${nm(e.p)} ${M.desc}`, '#d2b6ff', C.DUR.mystery);
      log(`❓ ${nm(e.p)} mở ô bí ẩn: ${M.icon} <b>${M.name}</b> — ${M.desc}`);
      await wait(C.DUR.mystery); break;
    }
    case 'global': await animGlobal(e); break;
    case 'meteorStrike': await animMeteor(e); break;
    case 'extra':
      floatBoard({ x: 0, y: 100 }, e.reason === 'six' ? '🎲 Được gieo tiếp!' : '⭐ Thêm lượt!');
      await wait(C.DUR.extra); break;
    case 'nomove':
      floatBoard({ x: 0, y: 100 }, '🚫 Không đi được'); snd.nomove();
      await wait(C.DUR.nomove); break;
    case 'divine':
      banner('🐉 THẦN MÃ GIÁNG THẾ', `${nm(e.p)} gieo ba lần 6 liên tiếp — tặng thẻ 👻!`, '#ffd23f', C.DUR.divine);
      UI.fireworks(4, SFX.pop); SFX.win();
      log(`🐉 ${nm(e.p)} gieo 3 lần 6 liên tiếp — THẦN MÃ!`);
      await wait(C.DUR.divine); break;
    case 'win':
      banner(`🏆 ${esc(NAMES[e.p]).toUpperCase()}<br>CHIẾN THẮNG!`, `${C.SEATS[e.p].horse} về đích đầu tiên`, C.SEATS[e.p].color, C.DUR.win);
      SFX.win(); UI.confetti(); UI.fireworks(8, SFX.pop);
      log(`🏆 ${nm(e.p)} <b>CHIẾN THẮNG!</b>`);
      await wait(C.DUR.win); break;
    case 'msg':
      log(`ℹ️ ${nm(e.p)}: ${esc(e.text)}`);
      await wait(C.DUR.msg); break;
  }
}

async function animGlobal(e) {
  const E = C.EVENTS[e.kind];
  SFX.gong();
  banner(`${E.icon} ${E.name.toUpperCase()}`, E.desc, '#ffffff', C.DUR.global);
  weather(e.kind, C.DUR.global + (e.moves.length ? C.DUR.fly : 0));
  log(`${E.icon} <b>BIẾN CỐ: ${E.name}</b> — ${E.desc}`);
  if (e.kind === 'quake') { shake(1200); setTimeout(() => shake(900), 700 / SPEED); renderSpecials(e.specials); }
  if (e.kind === 'meteor') renderMeteors({ cells: e.cells });
  if (e.kind === 'festival') { UI.confetti(120); e.gains.forEach(x => floatBoard(stableCenter(x.p), C.CARDS[x.card].icon, 'big')); }
  await wait(C.DUR.global);
  if (e.moves.length) {
    SFX.whoosh();
    const tor = e.kind === 'tornado';
    await Promise.all(e.moves.map(m => flyTo(HE[m.p][m.h], locPos(m.to), { ms: C.DUR.fly, arc: tor ? 130 : 40, spin: tor ? 720 : 0 })));
  }
}

async function animMeteor(e) {
  snd.meteor();
  banner('☄️ SAO BĂNG RƠI!', e.hits.length ? `${e.hits.length} ngựa trúng đòn!` : 'Hụt hết — may quá!', '#ff8a3d', C.DUR.meteorStrike);
  await Promise.all(e.cells.map(async (c, i) => {
    await wait(i * 110);
    const b = trackPos(c), a = { x: b.x + 260, y: b.y - 560 };
    const m = S('circle', { r: 11, fill: '#ffcf6b', filter: 'url(#glow)' }, L_MET);
    await tween(520, t => {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      m.setAttribute('cx', x); m.setAttribute('cy', y);
      const s = toScreen({ x, y });
      UI.spawn({ x: s.x, y: s.y, vx: Math.random() - 0.5, vy: Math.random() - 0.5, g: 0, life: 0.8, decay: 0.04, size: 3 + Math.random() * 3, color: pick(['#ff7a00', '#ffd23f', '#ff3d00']) });
    });
    m.remove();
    const s = toScreen(b);
    UI.burst(s.x, s.y, ['#ff7a00', '#ffd23f', '#ff3d00', '#fff'], 40, 8);
    SFX.boom();
  }));
  shake(700);
  L_MET.innerHTML = '';
  for (const x of e.hits) log(`☄️ Sao băng đánh trúng ngựa của ${nm(x.p)}!`);
  await Promise.all(e.hits.map(x => flyTo(HE[x.p][x.h], stablePos(x.p, x.h), { ms: 650, arc: 150, spin: 540 })));
}

// ================= GIAO DIỆN =================
function renderGame() {
  $('#g-code').textContent = CTX.room().code;
  renderSpecials(GAME.specials);
  renderMeteors(GAME.meteors);
  syncHorses(GAME);
  markTurn(GAME.phase === 'over' ? null : GAME.turn);
  if (GAME.turn != null && GAME.phase !== 'over') CTX.skin.set($('#dice'), GAME.turn, 'dice');
  renderPanels();
  renderInfo();
  renderControls();
  if (GAME.phase === 'over' && !overShown) showGameOver();
}
function setTurnUI(p) {
  ROOT.querySelectorAll('.pcard').forEach(d => d.classList.toggle('active', +d.dataset.p === p));
  markTurn(p);
  $('#dice').style.setProperty('--glow', C.SEATS[p].color);
  CTX.skin.set($('#dice'), p, 'dice');
}
function renderPanels() {
  const box = $('#players'), me = mySeat(), room = CTX.room();
  box.innerHTML = '';
  GAME.players.forEach((pl, p) => {
    if (!pl.active) return;
    const seat = room.seats[p];
    const cnt = k => pl.horses.filter(h => h.loc === k).length;
    const pct = Math.round(C.scoreOf(GAME, pl) / C.maxScore(GAME, pl) * 100);
    const d = UI.el('div', 'pcard' + (p === GAME.turn && GAME.phase !== 'over' ? ' active' : ''));
    d.dataset.p = p;
    d.style.setProperty('--c', C.SEATS[p].color);
    const status = pl.kind === 'bot' ? '🤖' : seat && seat.online ? '🟢' : '⚫';
    d.innerHTML = `
      <div class="p-top">${CTX.skin.face(p)}<span class="p-name pn">${esc(pl.name)}</span>${p === me ? '<span class="tag">BẠN</span>' : ''}<span title="${pl.kind === 'bot' ? 'Bot' : seat && seat.online ? 'Đang online' : 'Mất kết nối'}">${status}</span></div>
      <div class="p-sub">${C.SEATS[p].horse} · 🏠${cnt('stable')} 🏇${cnt('track')} 🏁${cnt('home')}${pl.frozen ? ` · ❄️×${pl.frozen}` : ''}</div>
      ${GAME.opts.chaos ? `<div class="p-cards">${pl.cards.map(c => `<span title="${C.CARDS[c].name}: ${C.CARDS[c].desc}">${C.CARDS[c].icon}</span>`).join('') || '<span class="muted small">chưa có thẻ</span>'}</div>` : ''}
      <div class="p-bar"><i style="width:${pct}%"></i></div>
      <div class="timer"><i></i></div>`;
    box.appendChild(d);
  });
}
function renderInfo() {
  const parts = [`🔁 Lượt thứ <b>${GAME.turnCount + 1}</b>`];
  if (GAME.opts.chaos) parts.push(`⏳ Biến cố toàn bàn sau <b>${GAME.nextEventIn}</b> lượt`);
  if (GAME.meteors) parts.push(`☄️ Sao băng rơi sau <b style="color:#c4551b">${GAME.meteors.in}</b> lượt — tránh xa ô ☄️!`);
  parts.push(`📜 ${GAME.opts.home === 'classic' ? 'Về chuồng truyền thống' : 'Về chuồng nhanh'} · ${GAME.opts.block ? 'có luật cản' : 'không cản'}`);
  $('#g-info').innerHTML = parts.join('<br>');
  $('#g-turns').textContent = GAME.opts.horses + ' ngựa/người';
}
function renderControls() {
  if (!GAME) return;
  const me = mySeat(), my = me >= 0 && GAME.turn === me && GAME.phase !== 'over', ok = canAct();
  const st = $('#status');
  st.classList.toggle('mine', my);
  if (GAME.phase === 'over') st.innerHTML = `🏆 ${nm(GAME.winner)} đã chiến thắng!`;
  else if (me < 0) st.innerHTML = `👀 Bạn đang xem. Lượt của ${nm(GAME.turn)}`;
  else if (!my) st.innerHTML = `⏳ Đang chờ ${nm(GAME.turn)}...`;
  else if (cardMode) st.innerHTML = `🃏 ${cardMode.step === 'opp' ? 'Chọn <b>ngựa đối thủ</b> (viền đỏ) để đổi chỗ' : 'Chọn <b>ngựa của bạn</b> trên đường đua'} — <span class="muted">Esc để huỷ</span>`;
  else if (GAME.phase === 'roll') st.innerHTML = `✨ <b>Tới lượt bạn!</b> ${GAME.opts.chaos && !GAME.cardUsed && GAME.players[me].cards.length ? 'Dùng thẻ hoặc gieo' : 'Gieo'} xúc xắc <span class="muted">(Space)</span>`;
  else st.innerHTML = `🐴 Gieo được <b>${GAME.dice}</b>${GAME.turbo ? ` 🚀→${GAME.moveVal}` : ''} — bấm vào <b>ngựa đang sáng</b> để đi`;
  const canRoll = ok && GAME.phase === 'roll' && !cardMode;
  $('#btn-roll').disabled = !canRoll;
  $('#dice').classList.toggle('can', canRoll);
  const hand = $('#hand');
  hand.innerHTML = '';
  $('#hand-title').classList.toggle('hidden', !GAME.opts.chaos || me < 0);
  if (GAME.opts.chaos && me >= 0) {
    const cards = GAME.players[me].cards;
    for (let i = 0; i < C.MAX_CARDS; i++) {
      const c = cards[i];
      if (!c) { hand.appendChild(UI.el('button', 'hcard empty', '<b>·</b>trống')); continue; }
      const cd = C.CARDS[c];
      const b = UI.el('button', 'hcard' + (cardMode && cardMode.card === c ? ' active' : ''), `<b>${cd.icon}</b>${cd.name}`);
      b.title = cd.desc;
      b.disabled = !(ok && GAME.phase === 'roll' && !GAME.cardUsed);
      b.onclick = () => onCard(c);
      hand.appendChild(b);
    }
  }
  $('#card-hint').innerHTML = GAME.cardUsed && my && GAME.phase === 'roll' ? '<span class="muted small">Đã dùng thẻ trong lượt này</span>' : '';
  const mods = [];
  if (GAME.ghost) mods.push('👻 Bóng ma');
  if (GAME.turbo) mods.push('🚀 Tên lửa ×2');
  if (GAME.phase === 'roll' && mods.length) $('#dice-mods').textContent = mods.join(' · ') + ' đang bật';
  renderHighlights();
}
function renderHighlights() {
  if (!GAME || !HE) return;
  HE.forEach(row => row.forEach(g => g.classList.remove('sel', 'sel-opp')));
  clearHint();
  if (!canAct()) return;
  const me = mySeat();
  if (cardMode) {
    GAME.players.forEach((pl, p) => pl.horses.forEach((hs, h) => {
      if (hs.loc !== 'track') return;
      if (cardMode.step === 'own' && p === me && !(cardMode.card === 'shield' && hs.shield)) HE[p][h].classList.add('sel');
      if (cardMode.step === 'opp' && p !== me && !hs.shield) HE[p][h].classList.add('sel', 'sel-opp');
    }));
    return;
  }
  if (GAME.phase === 'move') for (const m of GAME.legal) HE[me][m.h].classList.add('sel');
}
function updateTimer() {
  const bar = ROOT.querySelector('.pcard.active .timer i');
  if (!bar) return;
  if (!DEADLINE || !GAME || GAME.phase === 'over' || playing) { bar.style.width = '0'; return; }
  const rem = DEADLINE - Date.now();
  bar.style.width = Math.max(0, Math.min(1, rem / CTX.room().turnMs)) * 100 + '%';
  bar.classList.toggle('low', rem < 8000);
  if (canAct() && rem > 0 && rem < 5000 && Math.floor(rem / 1000) !== bar._s) { bar._s = Math.floor(rem / 1000); SFX.tick(); }
}

function showGameOver() {
  overShown = true;
  const host = CTX.me().isHost;
  const ranks = GAME.players.map((pl, p) => ({ pl, p })).filter(x => x.pl.active)
    .sort((a, b) => (b.p === GAME.winner) - (a.p === GAME.winner) || C.scoreOf(GAME, b.pl) - C.scoreOf(GAME, a.pl));
  const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];
  UI.openModal(`
    <h2 class="center">🏆 ${nm(GAME.winner)} vô địch!</h2>
    <ol class="rank">${ranks.map((x, i) => `<li style="--c:${C.SEATS[x.p].color}"><span>${medal[i]}</span><span class="grow">${nm(x.p)} <span class="muted small">${C.SEATS[x.p].horse}</span></span><span>${Math.round(C.scoreOf(GAME, x.pl) / C.maxScore(GAME, x.pl) * 100)}%</span></li>`).join('')}</ol>
    <div class="btns">
      <button class="ghost" data-a="close">👀 Xem bàn cờ</button>
      ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}
    </div>`);
  const on = (a, fn) => { const b = document.querySelector(`#modal [data-a="${a}"]`); if (b) b.onclick = () => { UI.closeModal(); fn(); }; };
  on('close', () => {});
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

// ================= ĐIỀU KHIỂN =================
function onCard(card) {
  if (!canAct() || GAME.phase !== 'roll') return;
  SFX.pop();
  const me = mySeat(), mine = GAME.players[me].horses;
  if (cardMode && cardMode.card === card) { cardMode = null; renderControls(); return; }
  if (card === 'ghost' || card === 'turbo') return sendCard({ card });
  if (card === 'golden') {
    return UI.pickModal('🎯 Xúc Xắc Vàng — chọn số bạn muốn', [1, 2, 3, 4, 5, 6].map(v => ({ html: '⚀⚁⚂⚃⚄⚅'[v - 1], value: v })), v => sendCard({ card, value: v }));
  }
  if (card === 'freeze') {
    const opts = GAME.players.map((pl, p) => ({ pl, p })).filter(x => x.pl.active && !x.pl.finished && x.p !== me)
      .map(x => ({ html: esc(x.pl.name), value: x.p, color: C.SEATS[x.p].color }));
    return UI.pickModal('❄️ Đóng băng ai?', opts, v => sendCard({ card, target: v }));
  }
  if (!mine.some(h => h.loc === 'track' && !(card === 'shield' && h.shield))) return UI.toast('Bạn chưa có ngựa nào phù hợp trên đường đua');
  if (card === 'swap' && !GAME.players.some((pl, p) => p !== me && pl.active && pl.horses.some(h => h.loc === 'track' && !h.shield)))
    return UI.toast('Không có ngựa đối thủ nào để đổi chỗ');
  cardMode = { card, step: 'own' };
  renderControls();
}
function sendAction(action) {
  pending = true;
  renderControls();
  CTX.send(action).then(r => { if (!r.ok) { pending = false; renderControls(); } });
}
function sendCard(data) { cardMode = null; sendAction({ type: 'card', ...data }); }
function onHorseClick(p, h) {
  if (!canAct()) return;
  const me = mySeat(), hs = GAME.players[p].horses[h];
  if (cardMode) {
    if (cardMode.step === 'own') {
      if (p !== me || hs.loc !== 'track') return;
      if (cardMode.card === 'shield') { if (!hs.shield) sendCard({ card: 'shield', h }); }
      else { cardMode.h = h; cardMode.step = 'opp'; renderControls(); }
    } else if (p !== me && hs.loc === 'track' && !hs.shield) {
      sendCard({ card: 'swap', h: cardMode.h, target: { p, h } });
    }
    return;
  }
  if (GAME.phase === 'move' && p === me && GAME.legal.some(m => m.h === h)) sendAction({ type: 'move', h });
}
function doRoll() {
  if (!canAct() || GAME.phase !== 'roll' || cardMode) return;
  SFX.ac();
  sendAction({ type: 'roll' });
}

function showHelp() {
  const cards = Object.values(C.CARDS).map(c => `<li>${c.icon} <b>${c.name}</b> — ${c.desc}</li>`).join('');
  const myst = Object.values(C.MYSTERY).map(c => `${c.icon} ${c.name}`).join(' · ');
  const evs = Object.values(C.EVENTS).map(c => `<li>${c.icon} <b>${c.name}</b> — ${c.desc}</li>`).join('');
  UI.openModal(`<div class="help">
    <h2>📖 Luật chơi — Lục Mã Hỗn Chiến</h2>
    <h3>Cơ bản (cờ cá ngựa Việt Nam)</h3>
    <ul>
      <li>Bàn cờ đổi hình theo số người: 2 người — bàn vuông ngồi đối diện, 3 — tam giác, 4 — vuông, 5 — ngũ giác, 6 — lục giác. Càng ít người đường đua càng ngắn.</li>
      <li>Mỗi người có 2–4 ngựa trong chuồng. Gieo <b>1 hoặc 6</b> để xuất quân ra ô ★ màu của mình.</li>
      <li>Ngựa chạy theo chiều kim đồng hồ đúng số bước của xúc xắc. Gieo <b>6</b> được gieo thêm lượt.</li>
      <li><b>Luật cản:</b> không được nhảy qua đầu ngựa khác (trừ khi dùng thẻ 👻).</li>
      <li><b>Đá ngựa:</b> dừng đúng ô có ngựa đối thủ → ngựa đó bị đá về chuồng. Ai ngồi trên ô ★ của bạn cũng bị đá khi bạn xuất quân!</li>
      <li><b>Về chuồng đích:</b> chạy hết 1 vòng tới <b>cửa chuồng</b> (ô góc viền màu của bạn), rồi lên 6 bậc chuồng hướng vào tâm.
        <br>⚡ <i>Luật nhanh:</i> dư bước thì trượt thẳng vào chuồng; gieo số lớn hơn bậc hiện tại là lên tới bậc đó.
        <br>🏯 <i>Truyền thống:</i> phải dừng đúng cửa chuồng; từ cửa gieo n lên bậc n; sau đó mỗi lần chỉ lên 1 bậc và phải gieo đúng số bậc kế tiếp.</li>
      <li><b>Chiến thắng:</b> lấp đầy các bậc cao nhất (vd 3 ngựa → bậc 4, 5, 6 — các bậc sáng hơn).</li>
      <li>Mỗi lượt có 30 giây. Hết giờ hoặc mất mạng, máy sẽ tự đi giúp.</li>
    </ul>
    <h3>🔥 Chế độ Hỗn Loạn</h3>
    <ul>
      <li>🎁 <b>Ô quà</b> — nhận 1 thẻ kỹ năng. Đá được ngựa đối thủ cũng được 1 thẻ. Tối đa 3 thẻ.</li>
      <li>🌀 <b>Cổng dịch chuyển</b> — bay sang cổng cùng màu (có khi lợi to, có khi lùi cả vòng!).</li>
      <li>❓ <b>Ô bí ẩn</b> — ${myst}. Mở xong ô này sẽ dịch chuyển đi chỗ khác.</li>
      <li>🐉 Gieo 6 ba lần liên tiếp → <b>Thần Mã giáng thế</b>, tặng thẻ 👻.</li>
    </ul>
    <h3>🃏 Thẻ kỹ năng (dùng trước khi gieo, 1 thẻ mỗi lượt)</h3><ul>${cards}</ul>
    <h3>🌍 Biến cố toàn bàn (định kỳ mỗi vài lượt)</h3><ul>${evs}</ul>
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Đã hiểu, chiến thôi!</button></div>
  </div>`);
  document.querySelector('#modal [data-x]').onclick = UI.closeModal;
}

// ================= VÒNG ĐỜI (hub gọi) =================
async function update(msg, { backlog = 0, hidden = false } = {}) {
  SPEED = backlog >= 2 ? 3.5 : backlog === 1 ? 1.7 : 1;
  playing = true;
  NAMES = msg.state.players.map(p => p.name);
  if (!GAME) { GAME = msg.state; buildBoard(GAME); }
  renderControls();
  if (msg.events.length && !hidden) {
    for (const e of msg.events) {
      try { await playEvent(e); } catch (err) { console.error(err); }
    }
  }
  if (msg.meta && msg.meta.auto != null) log(`⏱️ ${nm(msg.meta.auto)} hết giờ — máy tự đi giúp`);
  GAME = msg.state;
  pending = false;
  DEADLINE = msg.deadlineIn ? msg.recvAt + msg.deadlineIn : 0;
  playing = false;
  SPEED = 1;
  renderGame();
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root;
    GAME = null; NAMES = []; HE = null;
    DEADLINE = 0; pending = false; cardMode = null; SPEED = 1; playing = false; overShown = false; spinN = 0;
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    buildDice();
    UI.emoteBar($('#emotes'));
    UI.toolbar($('#tools'), { help: showHelp });
    $('#btn-roll').onclick = doRoll;
    $('#dice').onclick = doRoll;
    const board = $('#board');
    board.addEventListener('click', e => { const g = e.target.closest('.horse'); if (g) onHorseClick(+g.dataset.p, +g.dataset.h); });
    board.addEventListener('pointerover', e => {
      const g = e.target.closest('.horse.sel');
      if (!g || cardMode || !GAME || GAME.phase !== 'move') return;
      const m = GAME.legal.find(m => m.h === +g.dataset.h && +g.dataset.p === mySeat());
      if (m) showHint(m);
    });
    board.addEventListener('pointerout', e => { if (e.target.closest('.horse')) clearHint(); });
    keyHandler = e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); doRoll(); }
      if (e.key === 'Escape' && cardMode) { cardMode = null; renderControls(); }
    };
    addEventListener('keydown', keyHandler);
    timerInt = setInterval(updateTimer, 250);
    return {
      update,
      onRoom: () => { if (GAME && !playing) renderPanels(); },
      emoteAnchor: seat => (HE && seat >= 0 && GAME.players[seat] && GAME.players[seat].active ? toScreen(stableCenter(seat)) : null),
      unmount() {
        clearInterval(timerInt);
        removeEventListener('keydown', keyHandler);
        GAME = null; HE = null;
      },
    };
  },
};
