// 🎨 Vẽ Đoán — giao diện client. Xem "Game client interface" trong CLAUDE.md.
// Tranh: mô hình M (cùng applyOps với server) vẽ lên canvas 800×600. Hoạ sĩ vẽ trước ở máy mình (bỏ qua sự kiện 'ink' của chính mình),
// người khác áp sự kiện 'ink' theo số thứ tự q; lệch số thì xin 'sync' và chờ khung chốt (state.ink).
import { W, H, PALETTE, BLACK, WHITE, SIZES, EVENTS, ITEMS, REACTS, DIFF, TOPICS, PACKS, T, applyOps } from './data.js';
import { sketchOf, drawSketch } from './sketch.js';

let CTX, UI, SFX, ROOT, V, CV, G;
let M, seq, turnN, srvOff, stale, needSync, syncAt, overShown, raf, timerInt, flushInt, keyH, lastTick, feedN;
let tool, color, size, down, outbox, localLeft, cursor, lastPt;
const BOT_KEY = 0x5a5a;

const $ = s => ROOT.querySelector(s);
const esc = s => UI.esc(s);
const me = () => CTX.me().seat;
const srvNow = () => Date.now() - srvOff;
const P = p => V && V.players[p];
const color0 = p => (CTX.game.seats[p] || {}).color || '#888';
const who = p => (P(p) ? `<b class="pn" style="--c:${color0(p)}">${esc(P(p).name)}</b>` : '?');
const amDrawer = () => !!V && V.drawers.includes(me());
const canDraw = () => V && V.phase === 'draw' && amDrawer() && !V.bd;
const guessed = p => !!V && V.guessed.includes(p);
const EV = () => (V && V.ev ? EVENTS[V.ev] : null);
const rule = () => (EV() && EV().rule) || {};
const evOn = k => V && V.ev === k && V.phase === 'draw';
// Chỉ thay DOM khi nội dung đổi (tin 'ink' tới ~10 lần/giây — vẽ lại nút liên tục sẽ nuốt mất cú bấm).
const setHTML = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
const botEmoji = bd => String.fromCodePoint(...bd.k.map(x => x ^ BOT_KEY));

// ================= ÂM THANH =================
const S = {
  hit() { [660, 880, 1320].forEach((f, i) => SFX.tone(f, 0.14, { type: 'triangle', v: 0.07, delay: i * 0.07 })); },
  other() { SFX.tone(880, 0.08, { type: 'sine', v: 0.06 }); SFX.tone(1175, 0.1, { type: 'sine', v: 0.05, delay: 0.06 }); },
  near() { SFX.tone(520, 0.1, { type: 'square', v: 0.035 }); SFX.tone(620, 0.1, { type: 'square', v: 0.035, delay: 0.08 }); },
  msg() { SFX.tone(1500, 0.03, { type: 'sine', v: 0.03 }); },
  hint() { SFX.tone(1200, 0.06, { type: 'triangle', v: 0.05 }); SFX.tone(1600, 0.08, { type: 'triangle', v: 0.04, delay: 0.05 }); },
  reveal() { SFX.whoosh(); },
  smoke() { SFX.noise(0.8, { v: 0.25, f: 600, fto: 200, q: 0.5 }); },
};

// ================= TRANH =================
function resetInk() { M = { items: [], open: {} }; seq = 0; stale = false; needSync = false; lastPt = null; outbox = []; down = false; }

function strokePath(g, it, from = 0) {
  const d = it.d;
  g.strokeStyle = g.fillStyle = PALETTE[it.c];
  g.lineWidth = SIZES[it.w];
  if (from === 0) { g.beginPath(); g.arc(d[0], d[1], SIZES[it.w] / 2, 0, Math.PI * 2); g.fill(); }
  if (d.length <= 2) return;
  g.beginPath();
  const s = Math.max(0, from - 2);
  g.moveTo(d[s], d[s + 1]);
  for (let j = s + 2; j < d.length; j += 2) g.lineTo(d[j], d[j + 1]);
  g.stroke();
}

// Tô màu loang (scanline) trên ảnh hiện tại, sai số màu nhỏ để ăn được mép nét khử răng cưa.
function flood(g, x0, y0, hex) {
  const img = g.getImageData(0, 0, W, H), d = img.data;
  const at = (x, y) => (y * W + x) * 4;
  const s = at(x0 | 0, y0 | 0), tr = d[s], tg = d[s + 1], tb = d[s + 2];
  const fr = parseInt(hex.slice(1, 3), 16), fg = parseInt(hex.slice(3, 5), 16), fb = parseInt(hex.slice(5, 7), 16);
  if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) < 8) return;
  const TOL = 90, same = i => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) <= TOL;
  const seen = new Uint8Array(W * H), st = [[x0 | 0, y0 | 0]];
  while (st.length) {
    let [x, y] = st.pop();
    while (x > 0 && !seen[y * W + x - 1] && same(at(x - 1, y))) x--;
    let up = false, dn = false;
    for (; x < W && !seen[y * W + x] && same(at(x, y)); x++) {
      const i = at(x, y);
      d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
      seen[y * W + x] = 1;
      if (y > 0) { const ok = !seen[(y - 1) * W + x] && same(at(x, y - 1)); if (ok && !up) st.push([x, y - 1]); up = ok; }
      if (y < H - 1) { const ok = !seen[(y + 1) * W + x] && same(at(x, y + 1)); if (ok && !dn) st.push([x, y + 1]); dn = ok; }
    }
  }
  g.putImageData(img, 0, 0);
}

function drawItem(g, it, alpha = 1) {
  if (alpha <= 0) return;
  g.globalAlpha = alpha;
  if (it.d) strokePath(g, it);
  else flood(g, it.x, it.y, PALETTE[it.f]);
  g.globalAlpha = 1;
}
const fadeAlpha = it => (it.at == null ? 1 : 1 - Math.max(0, Math.min(1, (srvNow() - it.at - T.fadeMs) / T.fadeOut)));

// Vẽ lại cả tranh (từ M, hoặc bức của bot).
function renderTo(g, items, opts = {}) {
  g.save();
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.lineCap = g.lineJoin = 'round';
  if (opts.bot) {
    const sk = sketchOf(opts.bot);
    drawSketch(g, sk, opts.prog ?? 1, opts.color ?? 1);
  } else for (const it of items) drawItem(g, it, opts.fade ? fadeAlpha(it) : 1);
  g.restore();
}
function full() {
  if (!G) return;
  if (V && V.bd && V.phase !== 'choose') return botFrame();
  renderTo(G, M.items, { fade: evOn('fade') });
}
function botFrame() {
  const bd = V.bd, t = srvNow() - bd.t0, done = V.phase !== 'draw';
  renderTo(G, [], { bot: botEmoji(bd), prog: done ? 1 : t / bd.a, color: done ? 1 : (t - bd.a) / (bd.b - bd.a) });
}

// Áp ops của ghế p vào M và vẽ thêm phần mới (không phải vẽ lại cả tranh, trừ khi hoàn tác/xoá).
function applyDraw(p, ops, at) {
  let redraw = false;
  for (const op of ops) {
    const before = op[0] === 'l' ? lastItemOf(p) : null, from = before ? before.d.length : 0;
    const err = applyOps(M, p, [op], at);
    if (err) { console.warn('[vedoan] ink', err, op); continue; }
    if (op[0] === 'u' || op[0] === 'c') { redraw = true; continue; }
    const it = op[0] === 'l' ? before : M.items[M.items.length - 1];
    if (it.d) lastPt = { x: it.d[it.d.length - 2], y: it.d[it.d.length - 1] };
    else lastPt = { x: it.x, y: it.y };
    if (redraw || evOn('fade') || V.bd) continue;
    G.save();
    G.lineCap = G.lineJoin = 'round';
    if (op[0] === 'l') strokePath(G, it, from);
    else drawItem(G, it);
    G.restore();
  }
  if (redraw || evOn('fade')) full();
  torch();
}
function lastItemOf(p) { for (let i = M.items.length - 1; i >= 0; i--) if (M.items[i].p === p) return M.items[i]; return null; }

function loadKeyframe() {
  M = { items: V.ink.map(it => ({ ...it, d: it.d ? it.d.slice() : undefined })), open: {} };
  for (const it of M.items) M.open[it.p] = !!it.d;
  for (const it of M.items) if (!it.d) M.open[it.p] = false;
  seq = V.inkSeq;
  stale = false;
  needSync = false;
  const last = M.items[M.items.length - 1];
  lastPt = last ? (last.d ? { x: last.d[last.d.length - 2], y: last.d[last.d.length - 1] } : { x: last.x, y: last.y }) : null;
  full();
}
function requestSync() {
  if (me() < 0 || Date.now() - syncAt < 1500) return;
  syncAt = Date.now();
  needSync = true;
  CTX.send({ type: 'sync' }).catch(() => {});
}

// ================= VẼ (hoạ sĩ) =================
function toCanvas(e) {
  const r = CV.getBoundingClientRect();
  let x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
  if (evOn('shaky')) {
    const t = performance.now();
    x += Math.sin(t / 37) * 7 + Math.sin(t / 13) * 3;
    y += Math.cos(t / 29) * 7 + Math.sin(t / 17) * 3;
  }
  return { x: Math.max(0, Math.min(W, Math.round(x))), y: Math.max(0, Math.min(H, Math.round(y))) };
}
function localOp(op) {
  const err = applyOps(M, me(), [op], srvNow(), null);
  if (err) return false;
  outbox.push(op);
  applyDrawLocal(op);
  return true;
}
function applyDrawLocal(op) {
  // Đã áp vào M trong localOp → chỉ cần vẽ phần mới ('s' = chấm đầu nét, 'f' = tô; hoàn tác/xoá thì vẽ lại cả tranh).
  if (op[0] === 'u' || op[0] === 'c' || evOn('fade')) return full();
  const it = lastItemOf(me());
  lastPt = it.d ? { x: it.d[it.d.length - 2], y: it.d[it.d.length - 1] } : { x: it.x, y: it.y };
  G.save();
  G.lineCap = G.lineJoin = 'round';
  drawItem(G, it);
  G.restore();
}
function curColor() { return tool === 'eraser' ? WHITE : rule().mono && color !== BLACK ? BLACK : color; }
function curSize() { return rule().broom ? SIZES.length - 1 : size; }
function useStroke() {
  if (localLeft == null) return true;
  if (localLeft <= 0) { UI.toast('✌️ Hết nét rồi! Chờ mọi người đoán thôi'); SFX.error(); return false; }
  localLeft--;
  renderTools();
  return true;
}
function onDown(e) {
  if (!canDraw() || e.button > 0) return;
  e.preventDefault();
  const pt = toCanvas(e);
  if (tool === 'fill') {
    if (rule().noFill) return UI.toast('Lượt này không được tô màu');
    if (!useStroke()) return;
    localOp(['f', curColor(), pt.x, pt.y]);
    flush();
    return;
  }
  if (!useStroke()) return;
  down = true;
  CV.setPointerCapture(e.pointerId);
  localOp(['s', curColor(), curSize(), pt.x, pt.y]);
  lastPt = pt;
}
function onMove(e) {
  moveCursor(e);
  if (!down || !canDraw()) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) {
    const pt = toCanvas(ev), lp = lastPt;
    if (lp && Math.hypot(pt.x - lp.x, pt.y - lp.y) < 2.5) continue;
    const last = outbox[outbox.length - 1];
    const it = lastItemOf(me());
    if (!it || !it.d || !M.open[me()]) return;
    if (it.d.length > 5800) { onUp(); return UI.toast('Nét dài quá — nhấc bút lên vẽ tiếp nhé'); }
    it.d.push(pt.x, pt.y);
    if (last && last[0] === 'l') last.push(pt.x, pt.y); else outbox.push(['l', pt.x, pt.y]);
    lastPt = pt;
    if (evOn('fade')) { it.at = srvNow(); continue; }
    G.save();
    G.lineCap = G.lineJoin = 'round';
    strokePath(G, it, it.d.length - 2);
    G.restore();
  }
}
function onUp() { if (down) { down = false; flush(); } }
function flush() {
  if (!outbox.length) return;
  const ops = outbox;
  outbox = [];
  CTX.send({ type: 'ink', ops }).then(r => { if (r && !r.ok) requestSync(); }).catch(() => requestSync());
}
function undo() {
  if (!canDraw()) return;
  if (rule().noUndo) return UI.toast('Lượt này không được hoàn tác');
  if (localOp(['u'])) { full(); flush(); }
}
function clearAll() {
  if (!canDraw()) return;
  if (rule().noUndo) return UI.toast('Lượt này không được xoá');
  if (localOp(['c'])) { full(); flush(); }
}
function moveCursor(e) {
  const c = $('#vd-cursor');
  if (!c || !V) return;
  const show = canDraw() && evOn('blind');
  c.classList.toggle('on', show);
  if (!show) return;
  const r = $('#vd-stage').getBoundingClientRect();
  c.style.left = e.clientX - r.left + 'px';
  c.style.top = e.clientY - r.top + 'px';
}

// ================= HIỆU ỨNG BIẾN CỐ =================
function torch() {
  const o = $('#vd-torch');
  const on = evOn('torch') && !amDrawer();
  o.classList.toggle('on', on);
  if (!on) return;
  const p = lastPt || { x: W / 2, y: H / 2 };
  o.style.setProperty('--x', (p.x / W) * 100 + '%');
  o.style.setProperty('--y', (p.y / H) * 100 + '%');
}
function effects() {
  const wrap = $('#vd-stage'), viewer = !amDrawer() && V.phase === 'draw';
  wrap.classList.toggle('mirror', viewer && V.ev === 'mirror');
  wrap.classList.toggle('spin', viewer && V.ev === 'spin');
  $('#vd-blind').classList.toggle('on', canDraw() && V.ev === 'blind');
  const sm = V.smoke, smoked = sm && V.phase === 'draw' && sm.until > srvNow() && me() !== sm.by && !amDrawer() && !guessed(me());
  $('#vd-smoke').classList.toggle('on', !!smoked);
  torch();
}

// ================= GIAO DIỆN =================
function renderTop() {
  const box = $('#vd-top');
  const rd = V.phase === 'over' ? 'Hết ván' : V.n < 0 ? 'Chuẩn bị...' : `Vòng ${V.round}/${V.o.rounds} · lượt ${V.n + 1}/${V.total}`;
  let word = '';
  if (V.mask && V.phase !== 'choose') {
    const parts = V.mask.join('').split(' ');
    const mine = V.me ? V.me.peek : [];
    let idx = 0;
    word = parts.map(w => {
      const cells = [...w].map(ch => { const i = idx++; return `<i class="${ch === '_' ? 'h' : mine.includes(i) && !V.word ? 'pk' : ''}">${ch === '_' ? '' : esc(ch)}</i>`; }).join('');
      idx++;
      return `<span class="wd">${cells}<sub>${[...w].length}</sub></span>`;
    }).join('');
  } else if (V.phase === 'choose') word = `<span class="muted">${V.drawers[0] === me() ? '✏️ Chọn một từ để vẽ' : `${who(V.drawers[0])} đang chọn từ...`}</span>`;
  const chips = [];
  if (V.ev && V.phase !== 'over') chips.push(`<span class="chip ev" title="${esc(EVENTS[V.ev].desc)}">${EVENTS[V.ev].icon} ${EVENTS[V.ev].name}</span>`);
  if (V.d && V.o.specials && V.phase !== 'choose' && V.phase !== 'over') chips.push(`<span class="chip">${DIFF[V.d].icon} ${DIFF[V.d].name}</span>`);
  if (V.g && V.phase !== 'choose') chips.push('<span class="chip gold">⭐ Từ Vàng ×2</span>');
  if (V.mult > 1.001 && V.phase === 'draw') chips.push(`<span class="chip" title="Hệ số điểm lượt này">×${V.mult.toFixed(2).replace(/\.?0+$/, '')}</span>`);
  if (V.topic && V.phase !== 'choose') chips.push(`<span class="chip">${esc(V.topic)}</span>`);
  if (V.drawers.length > 1 && V.phase !== 'over') chips.push(`<span class="chip">🤝 Song Hoạ</span>`);
  setHTML(box, `<div class="rd muted small">${rd}</div><div class="word">${word}</div>
    <div class="chips">${chips.join('')}</div><div class="clock" id="vd-clock"><b></b><i></i></div>`);
  tickClock();
}
function tickClock() {
  const c = $('#vd-clock');
  if (!c || !V) return;
  const left = V.until ? Math.max(0, V.until - srvNow()) : 0;
  const tot = V.phase === 'draw' ? V.dur : V.phase === 'choose' ? T.choose : V.phase === 'reveal' ? (V.o.vote ? T.revealVote : T.reveal) : 0;
  c.classList.toggle('hide', !tot);
  c.querySelector('b').textContent = Math.ceil(left / 1000);
  c.style.setProperty('--f', tot ? left / tot : 0);
  c.classList.toggle('low', V.phase === 'draw' && left < 10000);
  if (V.phase === 'draw' && left < 10000 && left > 0) {
    const s = Math.ceil(left / 1000);
    if (s !== lastTick) { lastTick = s; SFX.tick(); }
  }
}

// Cột người chơi: xếp theo điểm, đánh số liên tục 1…N (bằng điểm thì giữ thứ tự ghế); dòng dưới là trạng thái lượt này.
function playerStatus(p) {
  const pl = P(p), room = CTX.room(), seat = room && room.seats[p];
  const st = (ic, tx, extra = '', cls = '') => `<span class="st${cls}"><i>${ic}</i><span class="tx">${tx}</span>${extra}</span>`;
  const gain = pl.gain ? `<b class="gain${pl.gain < 0 ? ' neg' : ''}">${pl.gain > 0 ? '+' : ''}${pl.gain}</b>` : '';
  if (seat && seat.kind === 'human' && !seat.online) return st('📴', 'mất kết nối', '', ' dim');
  const drawing = V.drawers.includes(p);
  if (V.phase === 'choose' && drawing) return st('✏️', 'đang chọn từ');
  if (V.phase === 'draw') {
    if (drawing) return st('✏️', 'đang vẽ', gain);
    if (guessed(p)) return st('✅', 'đoán ra', gain);
    return st(pl.bet ? '🎲' : '🤔', pl.bet ? 'đang cược' : 'đang đoán', '', ' dim');
  }
  if (V.phase === 'reveal') {
    if (drawing) return st('✏️', 'hoạ sĩ', gain);
    return pl.gain > 0 ? st('✅', 'đoán ra', gain) : st('😶', 'chưa ra', gain, ' dim');
  }
  return '';
}
function renderPlayers() {
  const rows = V.order.slice().sort((a, b) => P(b).score - P(a).score || a - b);
  setHTML($('#vd-players'), rows.map((p, i) => {
    const pl = P(p), live = V.phase !== 'over';
    const cls = ['pl', p === me() ? 'me' : '', V.drawers.includes(p) && live ? 'drawing' : '', guessed(p) && V.phase === 'draw' ? 'ok' : '',
      pl.score > 0 && i < 3 ? 'top' + (i + 1) : ''].join(' ');
    return `<div class="${cls}" data-p="${p}" style="--c:${color0(p)}"><span class="rk">${i + 1}</span>${CTX.skin.face(p)}
      <span class="nm" title="${esc(pl.name)}">${pl.kind === 'bot' ? '🤖 ' : ''}${esc(pl.name)}${p === me() ? ' <small>(bạn)</small>' : ''}</span>
      <b class="sc">${pl.score}</b>${playerStatus(p)}</div>`;
  }).join(''));
}

function renderTools() {
  const box = $('#vd-tools');
  if (!V) return;
  if (canDraw()) {
    const R = rule(), cols = PALETTE.map((c, i) => (R.mono && i !== BLACK && i !== WHITE) ? '' :
      `<button class="sw${i === color && tool !== 'eraser' ? ' on' : ''}" data-c="${i}" style="--sw:${c}" title="Màu"></button>`).join('');
    const sz = SIZES.map((s, i) => (R.broom && i !== SIZES.length - 1) ? '' :
      `<button class="sz${i === curSize() ? ' on' : ''}" data-s="${i}" title="Cỡ cọ ${i + 1}"><i style="--d:${Math.max(4, s * 0.6)}px"></i></button>`).join('');
    const tb = (k, ic, title, dis) => `<button class="tl${tool === k ? ' on' : ''}" data-t="${k}" title="${title}"${dis ? ' disabled' : ''}>${ic}</button>`;
    setHTML(box, `<div class="pal">${cols}</div><div class="szs">${sz}</div><div class="tls">
      ${tb('pen', '✏️', 'Bút (B)')}${tb('fill', '🪣', 'Tô màu (F)', R.noFill)}${tb('eraser', '🧽', 'Tẩy (E)')}
      <button class="tl" data-a="undo" title="Hoàn tác (Ctrl+Z)"${R.noUndo ? ' disabled' : ''}>↩️</button>
      <button class="tl" data-a="clear" title="Xoá hết"${R.noUndo ? ' disabled' : ''}>🗑️</button>
      ${localLeft != null ? `<span class="left" title="Số nét còn lại">✌️ còn <b>${localLeft}</b> nét</span>` : ''}</div>`);
    return;
  }
  const parts = [];
  if (V.phase === 'draw' && V.o.items && me() >= 0 && !amDrawer() && !guessed(me())) {
    parts.push(`<div class="items">${Object.entries(ITEMS).map(([k, it]) => {
      const used = V.me && V.me.used[k], poor = P(me()).score < it.cost;
      // Giá là ĐIỂM của ván này (không phải credit/tiền) — ghi rõ "−40 điểm" để khỏi nhầm.
      const tip = [`${it.name} — ${it.desc}`, `Giá: trừ ${it.cost} điểm của bạn trong ván này (không phải credit).`,
        used ? 'Lượt này bạn đã dùng rồi.' : poor ? `Bạn cần có ít nhất ${it.cost} điểm.` : ''].filter(Boolean).join('\n');
      return `<button class="it" data-k="${k}" title="${esc(tip)}"${used || poor ? ' disabled' : ''}>${it.icon} <span>${esc(it.name)}</span> <small>${used ? '✓ đã dùng' : `−${it.cost} điểm`}</small></button>`;
    }).join('')}</div>`);
  }
  if (V.o.vote && (V.phase === 'draw' || V.phase === 'reveal') && me() >= 0 && !amDrawer()) {
    parts.push(`<div class="reacts">${V.phase === 'reveal' ? '<span class="muted small">Thả cho bức tranh:</span>' : ''}${Object.entries(REACTS).map(([k, e]) =>
      `<button class="rx${V.myReact === k ? ' on' : ''}" data-r="${k}"${V.myReact ? ' disabled' : ''}>${e}${V.reacts[k] ? `<small>${V.reacts[k]}</small>` : ''}</button>`).join('')}</div>`);
  } else if (V.o.vote && (V.phase === 'draw' || V.phase === 'reveal') && amDrawer()) {
    const n = Object.values(V.reacts).reduce((a, b) => a + b, 0);
    if (n) parts.push(`<div class="reacts"><span class="muted small">Mọi người thả cho tranh của bạn:</span>${Object.entries(V.reacts).map(([k, c]) => `<span class="rx on">${REACTS[k]}<small>${c}</small></span>`).join('')}</div>`);
  }
  if (V.bd && V.phase === 'draw') parts.push('<div class="muted small">🤖 Bot đang phác hoạ...</div>');
  setHTML(box, parts.join(''));
}

function renderOverlay() {
  const o = $('#vd-over');
  let html = '';
  if (V.phase === 'intro') html = `<div class="ov-card"><div class="big">🎨 Vẽ Đoán</div><p>${V.total} lượt · ${PACKS[V.o.pack] ? PACKS[V.o.pack].icon + ' ' + PACKS[V.o.pack].name : ''}</p><p class="muted">Chuẩn bị bút nào...</p></div>`;
  else if (V.phase === 'choose') {
    const ev = V.ev ? `<div class="evbox">${EVENTS[V.ev].icon} <b>${EVENTS[V.ev].name}</b> — ${esc(EVENTS[V.ev].desc)}</div>` : '';
    const duo = V.drawers.length > 1 ? `<p>🤝 <b>Song Hoạ:</b> ${who(V.drawers[0])} và ${who(V.drawers[1])} cùng vẽ chung một bức!</p>` : '';
    if (V.choices) {
      html = `<div class="ov-card"><div class="big">✏️ Tới lượt bạn vẽ!</div>${duo}${ev}<div class="choices">${V.choices.map((c, i) =>
        `<button class="ch${c.g ? ' au' : ''}" data-i="${i}">${esc(c.w)}${V.o.specials ? `<small>${DIFF[c.d].icon} ${DIFF[c.d].name} ×${DIFF[c.d].m}${c.g ? ' · ⭐ Vàng ×2' : ''}</small>` : ''}</button>`).join('')}</div>
        <p class="muted small">Không chọn thì máy chọn giúp khi hết giờ.</p></div>`;
    } else html = `<div class="ov-card"><div class="big">${who(V.drawers[0])} đang chọn từ...</div>${duo}${ev}</div>`;
  } else if (V.phase === 'reveal') {
    const why = { all: '🎉 Cả bàn đoán ra!', time: '⏰ Hết giờ', idle: '😴 Hoạ sĩ chưa vẽ gì...' }[V.why] || '';
    const gains = V.order.filter(p => P(p).gain).sort((a, b) => P(b).gain - P(a).gain)
      .map(p => `<li>${V.drawers.includes(p) ? '✏️' : '✅'} ${who(p)} <b class="${P(p).gain < 0 ? 'neg' : ''}">${P(p).gain > 0 ? '+' : ''}${P(p).gain}</b></li>`).join('');
    html = `<div class="ov-card reveal"><div class="muted">${why}</div><div class="big">Đáp án: <span class="ans">${esc(V.word)}</span></div>
      ${gains ? `<ul class="gains">${gains}</ul>` : '<p class="muted">Không ai ghi điểm 😢</p>'}</div>`;
  }
  setHTML(o, html);
  o.classList.toggle('on', !!html);
  o.classList.toggle('rev', V.phase === 'reveal');
}

function render() {
  renderTop();
  renderPlayers();
  renderTools();
  renderOverlay();
  effects();
  const inp = $('#vd-input');
  const inside = amDrawer() || guessed(me());
  inp.disabled = me() < 0;
  inp.placeholder = me() < 0 ? 'Đang xem — không đoán được' : V.phase === 'draw' ? (inside ? '🤫 Nói chuyện với người đã đoán ra...' : 'Gõ đáp án (không dấu cũng được)...') : 'Trò chuyện...';
  ROOT.querySelector('.vd').classList.toggle('drawer', canDraw());
  // khung tranh (đồ mua ở cửa hàng) của hoạ sĩ đang vẽ — Song Hoạ thì lấy của người đầu tiên có khung
  CTX.skin.set($('#vd-stage'), V.phase === 'over' ? -1 : easelOf(V.drawers), 'easel');
  if (V.phase === 'over' && !overShown) { overShown = true; setTimeout(showGameOver, 900); }
}

// ================= KHUNG ĐOÁN =================
function feed(html, cls = '') {
  const box = $('#vd-feed');
  const d = UI.el('div', 'ln ' + cls, html);
  box.appendChild(d);
  if (++feedN > 150) box.firstElementChild.remove();
  box.scrollTop = box.scrollHeight;
}
async function sendGuess() {
  const inp = $('#vd-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  await CTX.send({ type: 'guess', text });
}

// ================= SỰ KIỆN =================
function onEvent(e) {
  const mine = e.p === me();
  switch (e.t) {
    case 'ink':
      if (e.q <= seq) return;
      if (stale || e.q !== seq + 1) { stale = true; requestSync(); return; }
      seq = e.q;
      if (mine && amDrawer()) return;
      applyDraw(e.p, e.ops, srvNow());
      return;
    case 'turn':
      resetInk();
      turnN = e.n;
      localLeft = null;
      if (G) renderTo(G, []);
      feed(`✏️ ${e.drawers.map(who).join(' & ')} ${e.drawers.length > 1 ? 'cùng vẽ' : 'vẽ'} lượt ${e.n + 1}${e.ev ? ` · ${EVENTS[e.ev].icon} ${EVENTS[e.ev].name}` : ''}`, 'sys');
      if (e.drawers.includes(me())) { SFX.myTurn(); tool = 'pen'; }
      else SFX.click();
      return;
    case 'draw': {
      const R = e.ev && EVENTS[e.ev].rule;
      localLeft = R && R.strokes && V.drawers.includes(me()) ? R.strokes : null;
      if (R && R.broom) size = SIZES.length - 1;
      if (R && R.mono && color !== BLACK && color !== WHITE) color = BLACK;
      if (R && R.noFill && tool === 'fill') tool = 'pen';
      if (!V.drawers.includes(me()) && me() >= 0 && matchMedia('(pointer:fine)').matches) setTimeout(() => $('#vd-input') && $('#vd-input').focus(), 50);
      SFX.whoosh();
      return;
    }
    case 'msg':
      feed(`${who(e.p)}: ${esc(e.text)}`, e.sec ? 'sec' : '');
      if (!mine) S.msg();
      return;
    case 'near':
      feed(`🔥 «gần đúng rồi!» — thử lại xem`, 'near');
      S.near();
      return;
    case 'hit': {
      feed(`✅ ${who(e.p)} đoán ra! <b>+${e.pts}</b>${e.bet ? ' 🎲×2' : ''}${e.k === 0 ? ' ⚡ đầu tiên' : ''}`, 'hit');
      if (mine) {
        S.hit();
        const r = $('#vd-stage').getBoundingClientRect();
        UI.burst(r.left + r.width / 2, r.top + r.height / 2, [color0(me()), '#ffd23f', '#fff'], 40, 8);
      } else S.other();
      return;
    }
    case 'hint': feed('💡 Lộ thêm 1 chữ cái', 'sys'); S.hint(); return;
    case 'buy': {
      const it = ITEMS[e.k];
      feed(`🎒 ${who(e.p)} dùng ${it.icon} ${esc(it.name)}`, 'sys');
      if (e.k === 'smoke' && !mine) S.smoke(); else if (mine) SFX.card();
      return;
    }
    case 'react': {
      const a = emoteAnchor(V.drawers[0]);
      if (a) UI.floatAt(a, REACTS[e.r], 'emote');
      if (mine || V.drawers.includes(me())) SFX.pop();
      return;
    }
    case 'reveal':
      feed(`📣 Đáp án: <b>${esc(e.w)}</b>`, 'sys');
      S.reveal();
      return;
    case 'over': SFX.win(); UI.confetti(); return;
  }
}

async function update(msg) {
  V = msg.state;
  srvOff = (msg.recvAt || Date.now()) - V.now;
  if (turnN !== V.n && !msg.events.some(e => e.t === 'turn')) {
    // Vào giữa lượt (F5, vào lại): tranh trống → xin khung chốt (cả hoạ sĩ cũng cần, vì sự kiện nét của mình bị bỏ qua).
    resetInk(); turnN = V.n; localLeft = V.left;
    if (G) renderTo(G, []);
    if (V.phase === 'draw' && V.inkSeq > 0 && !V.ink) requestSync();
  }
  for (const e of msg.events) onEvent(e);
  if (V.left != null && localLeft == null && amDrawer()) localLeft = V.left;
  if (V.ink) {
    // Hoạ sĩ đang vẽ thì tin bản ở máy mình (khung chốt có thể chưa có các nét vừa gửi), trừ khi chính mình xin đồng bộ.
    if (!(V.phase === 'draw' && amDrawer() && !V.bd) || needSync) loadKeyframe();
  } else if (V.phase === 'draw' && V.inkSeq > seq && !amDrawer() && !msg.events.some(e => e.t === 'ink')) requestSync();
  if (V.phase !== 'draw' && V.phase !== 'choose') full();
  render();
}

// ================= HẾT VÁN / PHÒNG TRANH =================
const mq = s => document.querySelector('#modal ' + s);
function showGameOver() {
  const rows = V.order.slice().sort((a, b) => P(b).score - P(a).score);
  const medal = ['🥇', '🥈', '🥉'];
  let rank = 0, prev = null;
  const list = rows.map((p, i) => { if (P(p).score !== prev) { rank = i; prev = P(p).score; } return `<li style="--c:${color0(p)}"><span>${medal[rank] || `#${rank + 1}`}</span><span class="grow">${who(p)}</span><b>${P(p).score}</b></li>`; }).join('');
  const best = (k, min = 1) => { const m = Math.max(...V.order.map(p => P(p)[k])); return m >= min ? V.order.filter(p => P(p)[k] === m) : []; };
  const aw = [];
  const fans = V.o.vote ? best('fans') : [], fast = best('firsts');
  if (fans.length) aw.push(`<li>❤️ <b>Hoạ sĩ được yêu thích</b> — ${fans.map(who).join(', ')} (${P(fans[0]).fans} lượt thả)</li>`);
  if (fast.length) aw.push(`<li>⚡ <b>Thần Tốc</b> — ${fast.map(who).join(', ')} (${P(fast[0]).firsts} lần đoán ra đầu tiên)</li>`);
  const gal = V.gal || [];
  if (gal.length) {
    const tot = g => Object.values(g.r).reduce((a, b) => a + b, 0), top = gal.reduce((a, b) => (tot(b) > tot(a) ? b : a));
    if (tot(top)) aw.push(`<li>🖼️ <b>Bức tranh của ván</b> — «${esc(top.w)}» của ${top.d.map(who).join(' & ')} (${tot(top)} lượt thả)</li>`);
  }
  const host = CTX.me().isHost;
  UI.openModal(`<div class="vd-m"><h2 class="center">🏁 Hết ván!</h2><ol class="rank">${list}</ol>
    ${aw.length ? `<ul class="awards">${aw.join('')}</ul>` : ''}
    <div class="btns">${gal.length ? '<button class="ghost" data-a="gal">🖼️ Phòng tranh</button>' : ''}
    ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}</div></div>`);
  const on = (a, fn) => { const b = mq(`[data-a="${a}"]`); if (b) b.onclick = () => { UI.closeModal(); fn(); }; };
  on('gal', showGallery);
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

const easelOf = ds => (ds || []).find(p => CTX.skin.look(p) && CTX.skin.look(p).easel) ?? -1;

function showGallery() {
  const gal = V.gal || [];
  UI.openModal(`<div class="vd-m gal"><h2 class="center">🖼️ Phòng tranh</h2><div class="grid">${gal.map((g, i) => {
    const r = Object.entries(g.r).map(([k, n]) => `${REACTS[k]}${n}`).join(' ');
    return `<figure class="${CTX.skin.cls(easelOf(g.d), 'easel')}"><canvas width="${W}" height="${H}" data-i="${i}"></canvas><figcaption><b>${esc(g.w)}</b> · ${g.d.map(who).join(' & ')}
      ${g.ev ? `<span title="${esc(EVENTS[g.ev].name)}">${EVENTS[g.ev].icon}</span>` : ''}<span class="grow"></span>${r}
      <button class="dl" data-i="${i}" title="Tải ảnh về">⬇️</button></figcaption></figure>`;
  }).join('')}</div><div class="btns"><button class="ghost" data-a="back">⬅️ Bảng điểm</button><button class="gold" data-x>Đóng</button></div></div>`);
  document.querySelectorAll('#modal canvas[data-i]').forEach(c => {
    const g = gal[+c.dataset.i];
    renderTo(c.getContext('2d', { willReadFrequently: true }), g.items, g.e ? { bot: g.e } : {});
  });
  document.querySelectorAll('#modal .dl').forEach(b => b.onclick = () => {
    const c = mq(`canvas[data-i="${b.dataset.i}"]`), a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `ve-doan-${gal[+b.dataset.i].w}.png`;
    a.click();
  });
  mq('[data-x]').onclick = UI.closeModal;
  mq('[data-a="back"]').onclick = () => { UI.closeModal(); showGameOver(); };
}

function showHelp() {
  const o = (V && V.o) || CTX.room().opts || {};
  const li = D => Object.values(D).map(x => `<li>${x.icon} <b>${x.name}</b>${x.cost ? ` (−${x.cost} điểm)` : ''} — ${esc(x.desc)}</li>`).join('');
  UI.openModal(`<div class="vd-m help"><h2>📖 Luật chơi — Vẽ Đoán</h2>
    <h3>Cơ bản</h3><ul>
      <li>Mỗi lượt một người làm <b>hoạ sĩ</b>: chọn 1 trong 3 từ rồi vẽ (không viết chữ, không vẽ số nhé!). Mỗi vòng ai cũng vẽ 1 lần.</li>
      <li>Những người còn lại gõ đáp án vào khung bên phải. <b>Không dấu vẫn tính</b>, thêm "con / cái / quả..." cũng được. Gõ sai 1 chữ thì máy báo <i>gần đúng</i> riêng cho bạn.</li>
      <li>Đoán càng sớm càng nhiều điểm (người đầu tiên +30). Hoạ sĩ được điểm mỗi khi có người đoán ra. Gần hết giờ máy lộ dần vài chữ cái.</li>
      <li>Đoán ra rồi thì bạn chỉ nói chuyện được với hoạ sĩ và những người đã đoán ra (cả trong khung chat của phòng), không được lộ đáp án.</li>
      <li>Hoạ sĩ chưa vẽ nét nào sau ~${Math.round(Math.max(T.idleMin, T.idleFrac * (o.time || 80) * 1000) / 1000)} giây thì bị bỏ lượt.</li>
      <li>Phím tắt khi vẽ: <b>B</b> bút · <b>F</b> tô màu · <b>E</b> tẩy · <b>Ctrl+Z</b> hoàn tác · <b>[ ]</b> cỡ cọ.</li>
      <li>🤖 Bot vẽ bằng cách phác hoạ lại hình emoji của từ.</li></ul>
    ${o.specials ? `<h3>⭐ Từ đặc biệt</h3><ul><li>3 từ để chọn có 3 độ khó: 🟢 Dễ ×1 · 🟡 Vừa ×1.3 · 🔴 Khó ×1.6 điểm (cho cả hoạ sĩ lẫn người đoán).</li>
      <li>⭐ <b>Từ Vàng</b>: thỉnh thoảng một từ được ×2 điểm.</li><li>🤝 <b>Song Hoạ</b>: thỉnh thoảng 2 người cùng vẽ chung một bức, cùng ăn điểm hoạ sĩ.</li></ul>` : ''}
    ${o.events ? `<h3>🌀 Biến cố cọ vẽ (mỗi lượt 50%, điểm được nhân bù)</h3><ul>${li(EVENTS)}</ul>` : ''}
    ${o.items ? `<h3>🎒 Vật phẩm người đoán</h3><p class="muted">Trả bằng <b>điểm của bạn trong ván này</b> (không phải credit cửa hàng). Chỉ người đang đoán dùng được, mỗi món 1 lần/lượt.</p><ul>${li(ITEMS)}</ul>` : ''}
    ${o.vote ? `<h3>❤️ Bình chọn & phòng tranh</h3><ul><li>Lúc đang vẽ hoặc lúc lộ đáp án, mỗi người thả 1 cảm xúc (${Object.values(REACTS).join(' ')}) cho bức tranh — hoạ sĩ được +${15} mỗi lượt thả.</li>
      <li>Cuối ván: giải <b>Hoạ sĩ được yêu thích</b>, <b>Bức tranh của ván</b>, và phòng tranh xem lại / tải về mọi bức.</li></ul>` : ''}
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Vẽ thôi!</button></div></div>`);
  mq('[data-x]').onclick = UI.closeModal;
}

// ================= KHỞI TẠO =================
function emoteAnchor(seat) {
  const el = ROOT && ROOT.querySelector(`.pl[data-p="${seat}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + Math.min(60, r.width / 2), y: r.top + r.height / 2 };
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (!V || !G) return;
  const anim = (V.bd && V.phase === 'draw') || evOn('fade');
  if (anim) full();
}

const TEMPLATE = `<div class="vd">
  <aside class="vd-side"><div id="vd-players" class="vd-players"></div></aside>
  <main class="vd-main">
    <div id="vd-top" class="vd-top"></div>
    <div class="vd-stagewrap"><div id="vd-stage" class="vd-stage">
      <canvas id="vd-cv" width="${W}" height="${H}"></canvas>
      <div id="vd-torch" class="fx-torch"></div><div id="vd-smoke" class="fx-smoke"><span>💨</span></div>
      <div id="vd-blind" class="fx-blind"><span>🙈 Vẽ Mù — cứ vẽ đi, bạn không thấy đâu!</span></div>
      <div id="vd-cursor" class="fx-cursor"></div>
      <div id="vd-over" class="vd-over"></div>
    </div></div>
    <div id="vd-tools" class="vd-tools"></div>
  </main>
  <aside class="vd-chat">
    <div id="vd-feed" class="vd-feed"></div>
    <form id="vd-form" class="vd-form" autocomplete="off"><input id="vd-input" maxlength="80" autocomplete="off" enterkeyhint="send"><button class="gold">↵</button></form>
    <div class="vd-bottom"><div id="vd-emotes" class="grow"></div><div id="vd-tb"></div></div>
  </aside>
</div>`;

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root;
    V = null; srvOff = 0; turnN = null; overShown = false; syncAt = 0; lastTick = 0; feedN = 0;
    tool = 'pen'; color = BLACK; size = 1; localLeft = null; cursor = null;
    resetInk();
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    CV = $('#vd-cv');
    G = CV.getContext('2d', { willReadFrequently: true });
    renderTo(G, []);
    UI.emoteBar($('#vd-emotes'));
    UI.toolbar($('#vd-tb'), { help: showHelp });
    CV.addEventListener('pointerdown', onDown);
    CV.addEventListener('pointermove', onMove);
    CV.addEventListener('pointerup', onUp);
    CV.addEventListener('pointercancel', onUp);
    CV.addEventListener('pointerleave', e => { if (!down) moveCursor(e); });
    $('#vd-form').addEventListener('submit', e => { e.preventDefault(); sendGuess(); });
    $('#vd-input').addEventListener('keydown', e => e.stopPropagation());
    $('#vd-tools').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.c != null) { color = +b.dataset.c; if (tool === 'eraser') tool = 'pen'; SFX.click(); }
      else if (b.dataset.s != null) { size = +b.dataset.s; SFX.click(); }
      else if (b.dataset.t) { tool = b.dataset.t; SFX.click(); }
      else if (b.dataset.a === 'undo') undo();
      else if (b.dataset.a === 'clear') clearAll();
      else if (b.dataset.k) CTX.send({ type: 'buy', k: b.dataset.k });
      else if (b.dataset.r) CTX.send({ type: 'react', r: b.dataset.r });
      renderTools();
    });
    $('#vd-over').addEventListener('click', e => {
      const b = e.target.closest('button.ch');
      if (b) { SFX.click(); CTX.send({ type: 'pick', i: +b.dataset.i }); }
    });
    keyH = e => {
      if (!V || e.target.closest('input,textarea') || e.altKey || e.metaKey) return;
      if (!canDraw()) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey && k === 'z')) { e.preventDefault(); undo(); }
      else if (e.ctrlKey) return;
      else if (k === 'b') tool = 'pen';
      else if (k === 'f' && !rule().noFill) tool = 'fill';
      else if (k === 'e') tool = 'eraser';
      else if (k === '[') size = Math.max(0, size - 1);
      else if (k === ']') size = Math.min(SIZES.length - 1, size + 1);
      else return;
      renderTools();
    };
    addEventListener('keydown', keyH);
    flushInt = setInterval(() => { if (outbox.length) flush(); }, 70);
    timerInt = setInterval(() => { if (V) { tickClock(); if (V.smoke) effects(); } }, 200);
    raf = requestAnimationFrame(loop);
    return {
      update,
      onRoom: () => { if (V) renderPlayers(); },
      emoteAnchor,
      unmount() { removeEventListener('keydown', keyH); clearInterval(flushInt); clearInterval(timerInt); cancelAnimationFrame(raf); V = null; G = null; },
    };
  },
};
