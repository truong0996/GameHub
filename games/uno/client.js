// 🎴 UNO — giao diện client. Xem "Game client interface" trong CLAUDE.md.
// V = bản trạng thái để VẼ: trong lúc diễn sự kiện, V được cập nhật dần theo từng sự kiện; diễn xong thì thay bằng state thật từ server.
import { COLORS, COLOR_KEYS, CARDS, EVENTS, isWild, bannedColor, playable, identical, CATCH_MS } from './cards.js';

let CTX, UI, SFX, ROOT, V, SEATS;
let pending = false, playing = false, SPEED = 1, QUICK = false, deadline = 0, overShown = false, modalTag = '', timerInt = 0, keyHandler = null;
let lastDecider = null, armed = false, catchUntil = 0, catchKey = '', pickDone = null, pile = [];

const $ = s => ROOT.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms / SPEED));
const mySeat = () => CTX.me().seat;
const P = p => V.players[p];
const nm = p => UI.esc(V.players[p] ? V.players[p].name : '?');
const col = p => (SEATS[p] ? SEATS[p].color : '#888');
const who = p => `<b class="pn" style="--c:${col(p)}">${nm(p)}</b>`;
const seatedList = () => V.players.map((pl, i) => (pl.off ? -1 : i)).filter(i => i >= 0);
const myHand = () => (mySeat() >= 0 && P(mySeat()).hand) || [];
const tableOf = () => ({ top: V.top, color: V.color, stack: V.stack, ev: V.ev, opts: V.opts });
const decider = () => (V.phase === 'catch' ? V.catchW.p : V.phase === 'play' ? V.turn : null);
const colName = c => `<b class="cn" style="--k:${COLORS[c].hex}">${COLORS[c].name}</b>`;

// ================= LỜI THOẠI =================
const SAY = {
  uno: ['UNO!!!', 'UNO nhé!', 'Còn 1 lá thôi 😎', 'UNO! Cẩn thận đi'],
  caught: ['Ơ quên mất...', 'Thôi chết 😱', 'Sao bắt nhanh thế!'],
  catcher: ['Bắt được rồi! 🚨', 'Quên hô à? 😏', 'Rút 2 đi bạn!'],
  pen: ['Ối giời ơi!', 'Ác quá vậy 😭', 'Nhớ mặt nhé!', 'Trời ơi nhiều thế!'],
  skip: ['Lại mất lượt 😤', 'Ơ kìa!', 'Cho tui đánh với!'],
  stack: ['Chuyền tiếp nè!', 'Không phải tui 😏', 'Cộng thêm!'],
  mirror: ['Gương phản chiếu ✨', 'Trả lại nè!', 'Của bạn hết!'],
  jump: ['Chặn ngang! ⚡', 'Hehe, y hệt!', 'Nhanh tay thì được!'],
  swap: ['Đổi đi 😈', 'Bài bạn đẹp quá!'],
  win: ['Hết bài! 🏆', 'Dễ mà 😎', 'Ai chơi nữa không?'],
};
function say(p, kind, prob = 1) {
  if (p == null || Math.random() > prob || QUICK) return;
  const b = ROOT.querySelector(`[data-p="${p}"] .bubble`);
  if (!b) return;
  b.textContent = UI.pick(SAY[kind]);
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('show'), 2000);
}

// ================= ÂM THANH =================
const S = {
  card() { SFX.noise(0.08, { v: 0.16, f: 2600, q: 0.8 }); SFX.tone(380 + Math.random() * 120, 0.05, { type: 'triangle', v: 0.05, delay: 0.03 }); },
  draw() { SFX.noise(0.06, { v: 0.1, f: 4200, q: 0.9 }); },
  uno() { [523, 659, 784, 1046, 1318].forEach((f, i) => SFX.tone(f, 0.16, { type: 'square', v: 0.045, delay: i * 0.06 })); },
  alarm() { [0, 0.22, 0.44].forEach(d => { SFX.tone(880, 0.12, { type: 'square', v: 0.06, delay: d }); SFX.tone(660, 0.1, { type: 'square', v: 0.06, delay: d + 0.11 }); }); },
  pen() { SFX.tone(260, 0.3, { type: 'sawtooth', v: 0.1, to: 90 }); },
  magic() { [660, 880, 1320].forEach((f, i) => SFX.tone(f, 0.25, { type: 'sine', v: 0.06, delay: i * 0.07 })); },
  skip() { SFX.tone(600, 0.08, { type: 'triangle', v: 0.08 }); SFX.tone(300, 0.14, { type: 'triangle', v: 0.08, delay: 0.08 }); },
};

// ================= LÁ BÀI =================
const label = c => (typeof c.v === 'number' ? String(c.v) : CARDS[c.v].icon);
function cardTitle(c) {
  const C = typeof c.v === 'number' ? null : CARDS[c.v];
  return UI.esc(`${isWild(c) ? '' : COLORS[c.c].name + ' '}${C ? `${C.name}: ${C.desc}` : c.v}`);
}
function cardHTML(c, cls = '') {
  if (!c) return `<div class="uc back ${cls}"><i class="ov"></i><b class="big">UNO</b></div>`;
  const C = typeof c.v === 'number' ? null : CARDS[c.v], t = label(c);
  const k = isWild(c) ? '#26221e' : COLORS[c.c].hex;
  const ul = c.v === 6 || c.v === 9 ? ' ul' : '';
  return `<div class="uc ${isWild(c) ? 'wild' : ''} ${C ? 'v-' + c.v : 'num'} ${C && C.chaos ? 'chaos' : ''} ${cls}" data-id="${c.id}" style="--k:${k}" title="${cardTitle(c)}">
    <i class="ov"></i><b class="big${ul}">${t}</b><span class="tl">${t}</span><span class="br">${t}</span>${C && C.chaos ? `<small class="nm">${C.name}</small>` : ''}</div>`;
}
const cardText = c => (c ? `<b class="cn" style="--k:${isWild(c) ? '#26221e' : COLORS[c.c].hex}">${isWild(c) ? '' : COLORS[c.c].name + ' '}${typeof c.v === 'number' ? c.v : `${CARDS[c.v].icon} ${CARDS[c.v].name}`}</b>` : '<b>một lá</b>');
const COLOR_ORDER = { r: 0, y: 1, g: 2, b: 3, w: 4 };
const VORDER = v => (typeof v === 'number' ? v : 10 + Object.keys(CARDS).indexOf(v));
const sortHand = h => h.slice().sort((a, b) => COLOR_ORDER[a.c] - COLOR_ORDER[b.c] || VORDER(a.v) - VORDER(b.v) || a.id - b.id);

// ================= VẼ =================
const TEMPLATE = `<div class="uno">
  <div class="uno-main">
    <div id="uno-opps"></div>
    <div id="uno-table" class="dark">
      <div class="piles">
        <button id="uno-deck" class="pile" title="Rút bài (phím D)"><div class="stk"></div><span id="uno-deckn"></span></button>
        <div id="uno-pile" class="pile"><div class="ring"></div><div class="cards"></div></div>
      </div>
      <div id="uno-info"></div>
    </div>
    <div class="uno-bottom">
      <div id="uno-me"></div>
      <div class="uno-ctl">
        <div id="uno-status"></div>
        <div class="uno-timer"><i id="uno-timer"></i></div>
        <div id="uno-actions"></div>
      </div>
    </div>
  </div>
  <aside class="uno-side">
    <div class="uno-head"><b>🎴 UNO</b><span id="uno-mode" class="muted small"></span></div>
    <div id="uno-rules" class="small muted"></div>
    <div id="uno-log"></div>
    <div id="uno-emotes"></div>
    <div id="uno-tools"></div>
  </aside>
  <div id="uno-flash"></div>
</div>`;

function online(p) {
  const room = CTX.room(), s = room && room.seats[p];
  return !(s && s.kind === 'human' && !s.online);
}

function fanHTML(p) {
  const pl = P(p);
  if (pl.hand) return `<div class="fan open">${sortHand(pl.hand).map(c => cardHTML(c, 'mini')).join('')}</div>`;
  const k = Math.min(pl.n, 14), bk = CTX.skin.cls(p, 'back');   // lưng bài người đó mua ở cửa hàng
  return `<div class="fan">${Array.from({ length: k }, () => `<i class="${bk}"></i>`).join('')}${pl.n > 14 ? '<span>…</span>' : ''}</div>`;
}

function renderOpps() {
  const m = mySeat(), dec = playing ? null : decider();
  const seats = seatedList();
  const start = m >= 0 ? seats.indexOf(m) + 1 : 0;
  const order = seats.slice(start).concat(seats.slice(0, start)).filter(p => p !== m);
  $('#uno-opps').innerHTML = order.map(p => {
    const pl = P(p);
    return `<div class="op${p === dec ? ' turn' : ''}${pl.n === 1 ? ' last' : ''}" data-p="${p}" style="--c:${col(p)}">
      <div class="op-head"><div class="av">${SEATS[p].label}</div>
        <div class="op-name">${pl.kind === 'bot' ? '🤖 ' : ''}${nm(p)}${online(p) ? '' : ' 📴'}
          <div class="op-sub">${V.target ? `<b>${pl.score}</b> điểm` : p === V.dealer ? '🂠 chia bài' : '&nbsp;'}</div></div>
        <div class="op-n" title="Số lá trên tay"><b>${pl.n}</b><small>lá</small></div></div>
      ${fanHTML(p)}
      ${pl.n === 1 ? '<div class="uno-badge">UNO!</div>' : ''}
      <div class="bubble"></div><div class="op-timer"><i></i></div>
    </div>`;
  }).join('') + `<div class="dirhint" title="Chiều chơi">${V.dir === 1 ? '➡️' : '⬅️'}</div>`;
}

function renderTable() {
  const n = V.deckN ?? 0;
  $('#uno-deck .stk').innerHTML = (n > 12 ? '<span class="layer l2"></span>' : '') + (n > 1 ? '<span class="layer l1"></span>' : '') + cardHTML(null);
  $('#uno-deckn').innerHTML = `<b>${n}</b> lá`;
  $('#uno-deck').classList.toggle('can', canDraw());
  const pc = $('#uno-pile .cards');
  if (!pile.length || pile[pile.length - 1].c.id !== V.top.id) pile = [{ c: V.top, r: rot() }];
  pc.innerHTML = pile.slice(-4).map((x, i, a) => `<div class="pc" style="--r:${x.r}deg;z-index:${i}">${cardHTML(x.c, i === a.length - 1 ? 'top' : '')}</div>`).join('');
  const ring = $('#uno-pile .ring');
  ring.style.setProperty('--k', COLORS[V.color].hex);
  ring.classList.toggle('ccw', V.dir === -1);
  const E = V.ev && EVENTS[V.ev.k];
  const ban = bannedColor(V);
  $('#uno-info').innerHTML = `
    <div class="cur">Màu: ${colName(V.color)} <span class="dir">${V.dir === 1 ? '↻ thuận' : '↺ ngược'}</span></div>
    ${V.stack ? `<div class="stackb">💥 <b>+${V.stack.n}</b> đang dồn vào ${who(V.turn)}</div>` : ''}
    ${E ? `<div class="ev"><span class="ev-ic">${E.icon}</span><span><b>${E.name}</b>${ban ? ` — ${colName(ban)}` : ''} <small>(còn ${V.ev.left} lượt)</small><br><small>${E.desc}</small></span></div>` : ''}
    <div class="muted small">${V.target ? `Vòng ${V.round} · ai đạt 🎯 ${V.target} điểm thắng` : 'Hết bài trước là thắng'}</div>`;
}
const rot = () => Math.round(Math.random() * 30 - 15);

function renderMe() {
  const m = mySeat(), box = $('#uno-me');
  if (m < 0) { box.innerHTML = '<div class="muted center small">👀 Bạn đang xem ván này.</div>'; return; }
  const pl = P(m), dec = playing ? null : decider();
  const hand = sortHand(pl.hand || []), tb = tableOf(), my = canAct() && V.phase === 'play';
  const n = hand.length;
  box.className = `${dec === m ? 'turn' : ''}`;
  box.style.setProperty('--c', col(m));
  box.innerHTML = `<div class="me-head" data-p="${m}"><div class="av">${SEATS[m].label}</div><b>${nm(m)}</b> <span class="muted small">· ${n} lá${V.target ? ` · ${pl.score} điểm` : ''}</span>
      ${n === 1 ? '<span class="uno-badge">UNO!</span>' : ''}<div class="bubble"></div></div>
    <div id="uno-hand" style="--n:${n}">${hand.map(c => {
      let cls = '';
      if (my && (V.drawn == null || V.drawn === c.id) && playable(tb, c)) cls = 'ok';
      else if (canJump(c)) cls = 'ok jump';
      else if (my) cls = 'no';
      if (V.drawn === c.id) cls += ' drawn';
      return cardHTML(c, cls);
    }).join('')}</div>`;
}

function canAct() { return !!V && !pending && !playing && mySeat() >= 0 && V.phase !== 'over' && decider() === mySeat(); }
function canJump(c) {
  return !!V && V.opts.jump && !playing && !pending && V.phase === 'play' && !V.stack && mySeat() >= 0 && V.turn !== mySeat() && identical(tableOf(), c);
}
const canDraw = () => canAct() && V.phase === 'play' && V.drawn == null;
const canCatch = () => !!V && V.phase === 'catch' && mySeat() >= 0 && V.catchW.p !== mySeat() && !pending && !playing;

function renderControls() {
  const m = mySeat(), status = $('#uno-status'), acts = $('#uno-actions');
  let msg = '', btns = '';
  status.classList.remove('mine', 'alarm');
  const hand = myHand();
  const unoBtn = hand.length <= 3 && hand.length > 1
    ? `<button class="unob${armed ? ' on' : ''}${hand.length === 2 ? ' hot' : ''}" data-a="arm" title="Bấm trước khi đánh lá áp chót (phím U)">${armed ? '✅ Đã hô UNO!' : '📣 UNO!'}</button>` : '';
  if (V.phase === 'over') msg = V.winner === m ? '🏆 Bạn thắng!' : `🏁 Ván đã kết thúc — ${who(V.winner)} thắng.`;
  else if (playing) { acts.innerHTML = ''; return; } // đang diễn: thanh trạng thái hiện dòng log mới nhất (xem log())
  else if (V.phase === 'catch') {
    const p = V.catchW.p;
    status.classList.add('alarm');
    if (p === m) { msg = '⚠️ Bạn còn 1 lá mà <b>CHƯA HÔ UNO!</b> — bấm ngay trước khi bị bắt!'; btns = '<button class="unob hot big" data-a="uno">📣 UNO!!! <small>(phím U)</small></button>'; }
    else if (m >= 0) { msg = `⚠️ ${who(p)} còn 1 lá mà <b>quên hô UNO!</b> — bắt lỗi để phạt rút 2!`; btns = '<button class="catchb big" data-a="catch">🚨 Bắt lỗi! <small>(phím B)</small></button>'; }
    else msg = `⚠️ ${who(p)} quên hô UNO!...`;
  } else if (m < 0) msg = `👀 Bạn đang xem. Lượt của ${who(V.turn)}.`;
  else if (V.turn === m) {
    status.classList.add('mine');
    if (V.stack) {
      msg = `💥 Bạn đang bị <b>+${V.stack.n}</b>! Đỡ bằng lá sáng lên${V.opts.stack ? ' (cộng dồn)' : ''}, hoặc nhận phạt.`;
      btns = `<button class="gold big" data-a="draw">😵 Nhận +${V.stack.n} <small>(phím D)</small></button>${unoBtn}`;
    } else if (V.drawn != null) {
      msg = 'Lá vừa rút đánh được — đánh luôn, hoặc bỏ lượt.';
      btns = `<button class="big ghost" data-a="pass">⏭️ Bỏ lượt <small>(phím P)</small></button>${unoBtn}`;
    } else {
      const any = hand.some(c => playable(tableOf(), c));
      msg = `Đến lượt bạn! ${any ? 'Chọn lá sáng lên để đánh' : 'Không có lá nào đánh được —'} ${any ? 'hoặc' : ''} rút bài${V.opts.drawUntil ? ' (rút tới khi đánh được)' : ''}.`;
      btns = `<button class="gold big" data-a="draw">🂠 Rút bài <small>(phím D)</small></button>${unoBtn}`;
    }
  } else {
    msg = V.stack ? `${who(V.turn)} đang bị <b>+${V.stack.n}</b> — đỡ hay nhận?` : `Lượt của ${who(V.turn)}...`;
    if (V.opts.jump && hand.some(c => canJump(c))) { msg += ' <b>⚡ Bạn có lá y hệt — chặn ngang được!</b>'; btns = unoBtn; }
  }
  status.innerHTML = msg || '&nbsp;';
  acts.innerHTML = btns;
  acts.querySelectorAll('button').forEach(b => {
    const a = b.dataset.a;
    b.disabled = a === 'catch' ? !canCatch() : a === 'arm' ? false : !canAct();
  });
}

function renderAll() {
  if (!V) return;
  if (armed && myHand().length > 3) armed = false;
  renderOpps();
  renderTable();
  renderMe();
  renderControls();
  $('#uno-mode').textContent = V.chaos ? '🎁 Bất Ngờ' : '😇 Cổ điển';
  const o = V.opts, rules = [o.stack && '➕ Cộng dồn', o.sevenO && '7️⃣ 7-0', o.jump && '⚡ Chặn ngang', o.drawUntil && '🂠 Rút tới khi đánh được'].filter(Boolean);
  $('#uno-rules').textContent = rules.length ? rules.join(' · ') : 'Luật chuẩn';
}

// ================= HIỆU ỨNG =================
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function anchor(p) {
  const el = p === mySeat() ? ROOT.querySelector('.me-head .av') : ROOT.querySelector(`.op[data-p="${p}"] .av`);
  return el ? centerOf(el) : { x: innerWidth / 2, y: 60 };
}
const handPt = p => (p === mySeat() && $('#uno-hand') ? centerOf($('#uno-hand')) : anchor(p));
const deckPt = () => centerOf($('#uno-deck .stk'));
const pilePt = () => centerOf($('#uno-pile'));
async function fly(html, from, to, { ms = 480, delay = 0, spin = 0 } = {}) {
  if (QUICK) return;
  if (delay) await sleep(delay);
  const d = UI.el('div', 'uno-fly', html);
  $('.uno').appendChild(d);
  const tf = (pt, s, r) => `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%) scale(${s}) rotate(${r}deg)`;
  try {
    await d.animate([{ transform: tf(from, 0.75, -10), opacity: 0.9 }, { transform: tf(to, 1, spin) , opacity: 1 }],
      { duration: ms / SPEED, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).finished;
  } finally { d.remove(); }
}
async function spot(html, caption, cls = '', ms = 1000) {
  if (QUICK) return;
  const d = UI.el('div', 'uno-spot ' + cls, `${html}${caption ? `<div class="cap">${caption}</div>` : ''}`);
  $('.uno').appendChild(d);
  await sleep(ms);
  d.classList.add('out');
  setTimeout(() => d.remove(), 300);
}
function flash(cls, ms = 900) {
  const f = $('#uno-flash');
  f.className = cls; void f.offsetWidth; f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), ms);
}
function pulse(p, cls) {
  const el = p === mySeat() ? $('#uno-me') : ROOT.querySelector(`.op[data-p="${p}"]`);
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 1200);
}
const float = (p, html, cls) => { if (!QUICK) UI.floatAt(anchor(p), html, cls); };
function log(html) {
  const box = $('#uno-log');
  box.appendChild(UI.el('div', 'li', html));
  while (box.children.length > 150) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  if (playing && !html.includes('class="sep"')) { const st = $('#uno-status'); st.classList.remove('mine', 'alarm'); st.innerHTML = html; }
}

// Bỏ lá khỏi tay p trong V (tay của mình: theo id; người khác: chỉ giảm số lá).
function takeFrom(p, cards) {
  const pl = P(p);
  if (pl.hand) for (const c of cards) { const i = pl.hand.findIndex(x => x.id === c.id); if (i >= 0) pl.hand.splice(i, 1); }
  pl.n = Math.max(0, pl.n - cards.length);
}
function addTo(p, cards, n) {
  const pl = P(p);
  if (pl.hand && cards) pl.hand.push(...cards);
  pl.n += cards ? cards.length : n;
}
function setHands(ns, mine) {
  ns.forEach((n, q) => { if (!V.players[q].off) { V.players[q].n = n; if (q !== mySeat()) V.players[q].hand = null; } });
  if (mySeat() >= 0 && mine) P(mySeat()).hand = mine;
}
const DRAW_WHY = { draw: '', pen: ' — <b>ăn phạt</b>', catch: ' — <b>bị bắt lỗi UNO</b>', rain: ' (🌧️ Mưa Bài)', crown: ' (👑 Gánh Nặng)' };

async function playEvent(e) {
  const m = mySeat();
  switch (e.t) {
    case 'start':
      log(`🎴 Bắt đầu! ${V.target ? `Ai đạt <b>${V.target}</b> điểm trước thắng.` : 'Ai hết bài trước thắng.'} Còn 1 lá thì nhớ hô <b>UNO!</b>`);
      break;
    case 'round':
      Object.assign(V, { round: e.n, dealer: e.dealer, dir: 1, stack: null, drawn: null, ev: null, phase: 'play' });
      pile = [];
      log(`<span class="sep">— ${V.target ? `Vòng ${e.n} · ` : ''}${who(e.dealer)} chia bài —</span>`);
      if (V.target) { SFX.whoosh(); await spot('', `Vòng ${e.n}`, '', 900); }
      break;
    case 'deal': {
      for (const p of seatedList()) { P(p).n = 0; P(p).hand = p === m ? [] : null; }
      renderAll();
      const seats = seatedList();
      for (let k = 0; k < 3; k++) for (const p of seats) { S.draw(); fly(cardHTML(null, 'sm'), deckPt(), anchor(p), { ms: 260, delay: (k * seats.length + seats.indexOf(p)) * 30 }); }
      await sleep(500);
      setHands(e.ns, e.mine);
      V.deckN = Math.max(0, (V.deckN || 0) - e.ns.reduce((a, b) => a + b, 0));
      renderAll();
      break;
    }
    case 'flip':
      V.top = e.c; V.color = e.c.c;
      S.card();
      await fly(cardHTML(e.c), deckPt(), pilePt(), { ms: 420 });
      pile = [{ c: e.c, r: rot() }];
      renderTable();
      log(`Lá mở bàn: ${cardText(e.c)}.`);
      break;
    case 'play': {
      const c = e.c, from = e.p === m ? (ROOT.querySelector(`#uno-hand [data-id="${c.id}"]`) ? centerOf(ROOT.querySelector(`#uno-hand [data-id="${c.id}"]`)) : handPt(m)) : anchor(e.p);
      takeFrom(e.p, [c]);
      if (e.p === m) { armed = false; V.drawn = null; }
      if (e.jump) V.turn = e.p;
      renderOpps(); renderMe();
      S.card();
      const r = rot();
      await fly(cardHTML(c), from, pilePt(), { ms: 380, spin: r });
      V.top = c; V.color = e.color;
      if (e.mirror) V.stack = null;
      else if (V.stack && (c.v === 'd2' || c.v === 'd4')) say(e.p, 'stack', 0.6);
      pile.push({ c, r });
      renderTable(); renderOpps();
      if (e.jump) { float(e.p, '⚡ Chặn ngang!'); say(e.p, 'jump', 0.7); SFX.tele(); }
      if (isWild(c)) float(e.p, `<span class="cn" style="--k:${COLORS[e.color].hex}">● ${COLORS[e.color].name}</span>`);
      log(`${e.jump ? '⚡ ' : ''}${who(e.p)} ${e.jump ? '<b>chặn ngang</b> bằng' : 'đánh'} ${cardText(c)}${isWild(c) ? ` → chọn màu ${colName(e.color)}` : ''}.`);
      break;
    }
    case 'dump':
      takeFrom(e.p, e.cards);
      renderOpps(); renderMe();
      if (e.why === 'bomb') { SFX.boom(); flash('boom'); }
      else S.magic();
      for (let i = 0; i < e.cards.length; i++) fly(cardHTML(e.cards[i]), anchor(e.p), pilePt(), { ms: 360, delay: i * 120, spin: rot() });
      await sleep(300 + e.cards.length * 120);
      log(e.why === 'bomb' ? `💣 ${who(e.p)} <b>xả luôn ${e.cards.length} lá</b> cùng màu: ${e.cards.map(cardText).join(', ')}!`
        : `🧧 ${who(e.p)} được Lì Xì — bỏ ${e.cards.map(cardText).join(', ')}.`);
      break;
    case 'gift': {
      const c = e.c;
      if (c) takeFrom(e.p, [c]); else P(e.p).n--;
      renderOpps(); renderMe();
      S.magic();
      await fly(cardHTML(c && (e.p === m || e.to === m) ? c : null), anchor(e.p), anchor(e.to), { ms: 600 });
      addTo(e.to, c && e.to === m ? [c] : null, 1);
      renderOpps(); renderMe();
      log(`🎁 ${who(e.p)} tặng ${c ? cardText(c) : '1 lá'} cho ${who(e.to)}.`);
      break;
    }
    case 'uno':
      S.uno(); pulse(e.p, 'shout');
      float(e.p, '📣 UNO!', 'uno-float');
      say(e.p, 'uno', 0.6);
      if (e.late) { V.phase = 'play'; V.catchW = null; }
      log(`📣 ${who(e.p)} hô <b>UNO!</b>${e.late ? ' — vừa kịp!' : ''}`);
      break;
    case 'catchOpen':
      V.phase = 'catch'; V.catchW = { p: e.p };
      S.alarm(); pulse(e.p, 'hit');
      log(`⚠️ ${who(e.p)} còn 1 lá mà <b>quên hô UNO!</b>`);
      break;
    case 'caught':
      V.phase = 'play'; V.catchW = null;
      SFX.error(); flash(e.p === m ? 'bad' : 'gold');
      float(e.by, '🚨 Bắt!');
      say(e.by, 'catcher', 0.8); say(e.p, 'caught', 0.6);
      log(`🚨 ${who(e.by)} <b>bắt lỗi</b> ${who(e.p)} — phạt rút 2!`);
      break;
    case 'safe':
      V.phase = 'play'; V.catchW = null;
      log(`😮‍💨 Không ai bắt lỗi ${who(e.p)}.`);
      break;
    case 'skip':
      S.skip(); pulse(e.p, 'hit');
      float(e.p, '⊘ Mất lượt');
      say(e.p, 'skip', 0.4);
      log(`⊘ ${who(e.p)} mất lượt.`);
      break;
    case 'rev':
      V.dir = e.dir;
      SFX.whoosh();
      renderTable(); renderOpps();
      log(`⇄ Đảo chiều — giờ đi ${e.dir === 1 ? '↻ thuận' : '↺ ngược'}.`);
      await sleep(300);
      break;
    case 'stack':
      V.stack = { n: e.n }; V.turn = e.p;
      renderTable(); renderOpps(); renderMe();
      float(e.p, `💥 +${e.n}`, 'bad');
      log(`💥 Phạt <b>+${e.n}</b> dồn vào ${who(e.p)}...`);
      break;
    case 'reflect':
      S.magic(); flash('gold');
      say(e.p, 'mirror', 0.8);
      await fly('<div class="mirror-fx">🪞</div>', anchor(e.p), anchor(e.to), { ms: 600 });
      V.stack = { n: e.n }; V.turn = e.to;
      log(`🪞 ${who(e.p)} dùng <b>Gương</b> dội +${e.n} về ${who(e.to)}!`);
      break;
    case 'draw': {
      const n = e.cards ? e.cards.length : e.n;
      if (e.why === 'pen' || e.why === 'catch') { S.pen(); pulse(e.p, 'hit'); if (e.p === m) flash('bad'); }
      if (e.why === 'pen') { V.stack = null; say(e.p, 'pen', n >= 4 ? 0.7 : 0.3); }
      for (let i = 0; i < n; i++) { S.draw(); fly(cardHTML(e.cards ? e.cards[i] : null, e.cards ? '' : 'sm'), deckPt(), handPt(e.p), { ms: 300, delay: i * 110 }); }
      await sleep(260 + 110 * Math.min(n - 1, 8));
      V.deckN = Math.max(0, (V.deckN || 0) - n);
      addTo(e.p, e.cards, n);
      if (e.why === 'draw' && e.p === m && e.cards) {
        const last = e.cards[e.cards.length - 1];
        if (playable(tableOf(), last)) V.drawn = last.id;
      }
      renderAll();
      if (e.why === 'pen') float(e.p, `+${n}`, 'bad');
      log(`🂠 ${who(e.p)} rút ${e.p === m && e.cards ? e.cards.map(cardText).join(', ') : `${n} lá`}${DRAW_WHY[e.why] || ''}.`);
      break;
    }
    case 'pass':
      log(`⏭️ ${who(e.p)} bỏ lượt${e.empty ? ' (hết bài để rút)' : ''}.`);
      break;
    case 'again':
      SFX.tele();
      float(e.p, '⏩ Đi tiếp!');
      log(`⏩ ${who(e.p)} <b>Tăng Tốc</b> — mọi người mất lượt, ${who(e.p)} đi tiếp!`);
      await sleep(250);
      break;
    case 'swap': {
      S.magic();
      say(e.p, 'swap', 0.6);
      await Promise.all([fly(fanMini(P(e.p).n), anchor(e.p), anchor(e.to), { ms: 700 }), fly(fanMini(P(e.to).n), anchor(e.to), anchor(e.p), { ms: 700 })]);
      setHands(e.ns, e.mine);
      renderAll();
      log(`🔀 ${who(e.p)} <b>đổi cả tay bài</b> với ${who(e.to)}${e.why === 'seven' ? ' (lá 7)' : ''}!`);
      break;
    }
    case 'rotate': {
      SFX.whoosh(); flash('swirl');
      const seats = seatedList();
      const nextOf = p => { const i = seats.indexOf(p), k = seats.length; return seats[(i + e.dir + k) % k]; };
      await Promise.all(seats.map(p => fly(fanMini(P(p).n), anchor(p), anchor(nextOf(p)), { ms: 800 })));
      setHands(e.ns, e.mine);
      renderAll();
      log(`${e.why === 'storm' ? '🌪️ <b>Lốc Xoáy</b>!' : e.why === 'zero' ? '0️⃣ Lá 0!' : '🔄'} Mọi người chuyền cả tay bài cho người kế tiếp.`);
      break;
    }
    case 'event': {
      const E = EVENTS[e.k];
      if (E.lap) V.ev = { k: e.k, left: seatedList().length, color: e.color };
      if (e.k === 'paint') V.color = e.color;
      if (e.k === 'flip') V.dir = e.dir;
      renderTable(); renderOpps();
      SFX.gong();
      const extra = e.k === 'ban' ? `<br>Cấm màu ${colName(e.color)}` : e.k === 'paint' ? `<br>Màu mới: ${colName(e.color)}` : '';
      log(`<span class="sep">— ${E.icon} Sự kiện: <b>${E.name}</b> — ${E.desc}${extra ? ' ' + extra.replace('<br>', '') : ''} —</span>`);
      await spot(`<div class="big-ic">${E.icon}</div>`, `${E.name}<small>${E.desc}${extra}</small>`, 'event', 1700);
      break;
    }
    case 'eventEnd':
      if (V.ev && V.ev.k === e.k) V.ev = null;
      renderTable();
      log(`${EVENTS[e.k].icon} <b>${EVENTS[e.k].name}</b> hết hiệu lực.`);
      break;
    case 'shuffle':
      SFX.whoosh();
      V.deckN = e.n;
      renderTable();
      log(`🔀 Hết bài — xáo chồng bỏ thành chồng mới (${e.n} lá).`);
      break;
    case 'roundEnd': {
      for (const r of e.res) { P(r.p).hand = r.hand; P(r.p).n = r.hand.length; }
      e.scores.forEach((s, q) => { V.players[q].score = s; });
      renderAll();
      SFX.win(); UI.confetti(140);
      say(e.w, 'win');
      const rows = e.res.slice().sort((a, b) => (a.p === e.w ? -1 : b.p === e.w ? 1 : a.pts - b.pts)).map(r => `<li style="--c:${col(r.p)}"><span class="av">${SEATS[r.p].label}</span>
        <span class="grow">${nm(r.p)}</span><span class="hd">${r.p === e.w ? '🏆 hết bài' : sortHand(r.hand).map(c => cardHTML(c, 'micro')).join('')}</span>
        <b class="${r.p === e.w ? 'win' : ''}">${r.p === e.w ? (e.gain ? `+${e.gain}` : '') : `${r.pts}đ`}</b>${V.target ? `<span class="tot">${e.scores[r.p]}</span>` : ''}</li>`).join('');
      log(`<span class="sep">— 🏆 ${who(e.w)} hết bài${e.gain ? ` — +${e.gain} điểm (tổng bài người khác)` : ''}! —</span>`);
      await spot(`<div class="sum"><h3>🏆 ${who(e.w)} hết bài!</h3>${V.target ? `<div class="muted small center">Được cộng điểm bài còn lại của mọi người: <b>+${e.gain}</b></div>` : ''}<ol>${rows}</ol></div>`, '', 'summary', 3900);
      break;
    }
    case 'over':
      V.phase = 'over'; V.winner = e.w;
      SFX.win(); UI.fireworks(6, () => SFX.pop()); UI.confetti();
      log(`🏆 ${who(e.w)} thắng ván!`);
      await sleep(1000);
      break;
  }
}
const fanMini = n => `<div class="fan-fly">${Array.from({ length: Math.min(n, 7) }, () => '<i></i>').join('')}<b>${n}</b></div>`;

// ================= MODAL =================
function openTagged(tag, html) { closeTagged(); modalTag = tag; return UI.openModal(`<div class="uno-m">${html}</div>`); }
function closeTagged() {
  if (modalTag) { UI.closeModal(); modalTag = ''; }
  if (pickDone) { const f = pickDone; pickDone = null; f(null); }
}
const mq = s => document.querySelector('#modal ' + s);

// Hỏi 1 lựa chọn: options = [{ html, value, cls?, style?, disabled? }] → Promise(value | null nếu huỷ).
function ask(title, options, extra = '') {
  return new Promise(resolve => {
    openTagged('ask', `<h2 class="center">${title}</h2>${extra}<div class="ask">${options.map((o, i) =>
      `<button class="${o.cls || ''}" data-i="${i}" ${o.style ? `style="${o.style}"` : ''} ${o.disabled ? 'disabled' : ''}>${o.html}</button>`).join('')}</div>
      <div class="btns"><button class="ghost" data-x>Huỷ</button></div>`);
    pickDone = resolve;
    document.querySelectorAll('#modal .ask [data-i]').forEach(b => { b.onclick = () => { pickDone = null; closeTagged(); resolve(options[+b.dataset.i].value); }; });
    mq('[data-x]').onclick = () => closeTagged();
  });
}
const askColor = () => {
  const ban = bannedColor(V);
  return ask('Chọn màu tiếp theo', COLOR_KEYS.map(c => ({ value: c, cls: 'colb', style: `--k:${COLORS[c].hex}`, disabled: c === ban,
    html: `${COLORS[c].name}${c === ban ? ' 🚫' : ''}<small>${myHand().filter(x => x.c === c).length} lá</small>` })));
};
const askPlayer = (title, extra) => ask(title, seatedList().filter(q => q !== mySeat()).map(q => ({ value: q, cls: 'plb', style: `--c:${col(q)}`,
  html: `${SEATS[q].label} ${nm(q)}<small>${P(q).n} lá</small>` })), extra);
const askCard = (title, cards) => ask(title, sortHand(cards).map(c => ({ value: c.id, cls: 'cardb', html: cardHTML(c) })));

function showGameOver() {
  overShown = true;
  const host = CTX.me().isHost, medal = ['🏆', '🥈', '🥉'];
  const rows = V.results.map((r, i) => `<li style="--c:${col(r.p)}"><span>${medal[i] || i + 1 + '.'}</span><span class="grow">${nm(r.p)}</span>
    <b>${V.target ? `${r.score} điểm` : r.p === V.winner ? 'hết bài' : `còn ${r.n} lá · ${r.pts}đ`}</b></li>`).join('');
  openTagged('over', `<h2 class="center">🏆 ${nm(V.winner)} thắng!</h2><ol class="rank">${rows}</ol>
    <div class="btns"><button class="ghost" data-a="close">👀 Xem bàn</button>
    ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}</div>`);
  const on = (a, fn) => { const b = mq(`[data-a="${a}"]`); if (b) b.onclick = () => { closeTagged(); fn(); }; };
  on('close', () => {});
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

function showHelp() {
  const chaos = V && V.chaos, o = V ? V.opts : {};
  const cards = Object.values(CARDS).filter(C => chaos || !C.chaos).map(C => `<li><b class="ic">${C.icon}</b> <b>${C.name}</b>${C.chaos ? ' <span class="tag">Bất Ngờ</span>' : ''} — ${C.desc} <span class="muted">(${C.pts}đ)</span></li>`).join('');
  openTagged('help', `<div class="help">
    <h2>📖 Luật chơi — UNO</h2>
    <h3>Cơ bản</h3><ul>
      <li>Mỗi người 7 lá. Đến lượt thì đánh 1 lá <b>cùng màu</b> hoặc <b>cùng số/ký hiệu</b> với lá trên cùng; lá đổi màu đánh lúc nào cũng được.</li>
      <li>Không đánh được (hoặc không muốn) thì <b>🂠 Rút bài</b>${o.drawUntil ? ' — rút tới khi được lá đánh được' : ' 1 lá'}; lá rút được mà hợp thì đánh luôn được, không thì bỏ lượt.</li>
      <li>Còn 2 lá, trước khi đánh lá áp chót hãy bấm <b>📣 UNO!</b> (phím U). Quên thì người khác có ${CATCH_MS / 1000} giây để <b>🚨 Bắt lỗi</b> — bị phạt rút 2. Bạn vẫn kịp tự hô trong lúc đó.</li>
      <li>${V && V.target ? `Hết bài trước thì thắng vòng và được cộng điểm bài còn lại của mọi người (số = điểm số, lá chức năng 20–50). Ai đạt <b>${V.target}</b> điểm trước thắng.` : 'Ai hết bài trước thắng.'}</li>
      <li>Mỗi lượt có ${Math.round(CTX.room().turnMs / 1000)} giây — hết giờ máy đánh giúp.</li>
    </ul>
    <h3>Luật nhà đang bật</h3><ul>
      ${o.stack ? '<li>➕ <b>Cộng dồn</b>: bị +2 thì đánh +2 hoặc +4 chuyền tiếp; bị +4 thì chỉ +4. Người cuối cùng ăn tổng.</li>' : ''}
      ${o.sevenO ? '<li>7️⃣ <b>7-0</b>: đánh 7 thì đổi cả tay với người bạn chọn; đánh 0 thì cả bàn chuyền tay theo chiều chơi.</li>' : ''}
      ${o.jump ? '<li>⚡ <b>Chặn ngang</b>: có lá Y HỆT lá trên cùng (cùng màu + cùng số/ký hiệu) thì đánh luôn dù chưa tới lượt; lượt tiếp tục từ bạn.</li>' : ''}
      ${o.drawUntil ? '<li>🂠 <b>Rút tới khi đánh được</b>.</li>' : ''}
      ${!o.stack && !o.sevenO && !o.jump && !o.drawUntil ? '<li>Không có — luật chuẩn.</li>' : ''}
    </ul>
    <h3>Lá chức năng</h3><ul class="cards">${cards}</ul>
    ${chaos ? `<h3>🎁 Sự kiện Bất Ngờ (cứ khoảng mỗi vòng bàn bốc 1)</h3><ul>${Object.values(EVENTS).map(x => `<li>${x.icon} <b>${x.name}</b>${x.lap ? ' <span class="tag">1 vòng bàn</span>' : ''} — ${x.desc}</li>`).join('')}</ul>` : ''}
    <p class="muted small">Phím tắt: D rút/nhận phạt · P bỏ lượt · U hô UNO · B bắt lỗi.</p>
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Hiểu rồi, chơi thôi!</button></div></div>`);
  mq('[data-x]').onclick = closeTagged;
}

// ================= ĐIỀU KHIỂN =================
function send(action, force = false) {
  if (!force && !canAct()) return;
  SFX.ac();
  SFX.click();
  pending = true;
  renderControls(); renderMe();
  return CTX.send(action).then(r => { pending = false; if (V && !playing) renderAll(); return r; });
}

async function clickCard(id) {
  const c = myHand().find(x => x.id === id);
  if (!c || playing || pending) return;
  const jump = canJump(c);
  const mine = canAct() && V.phase === 'play' && (V.drawn == null || V.drawn === id) && playable(tableOf(), c);
  if (!mine && !jump) {
    if (canAct() && V.phase === 'play') { SFX.error(); UI.toast(V.drawn != null && V.drawn !== id ? 'Chỉ được đánh lá vừa rút (hoặc bỏ lượt)' : V.stack ? `Lá này không đỡ được +${V.stack.n}` : 'Lá này không hợp — cần cùng màu hoặc cùng số/ký hiệu'); }
    return;
  }
  const a = { type: 'play', id };
  const last = myHand().length === 1;
  if (isWild(c)) { a.color = await askColor(); if (!a.color) return; }
  if (!last && (c.v === 'swap' || (c.v === 7 && V.opts.sevenO))) {
    a.to = await askPlayer('🔀 Đổi cả tay bài với ai?');
    if (a.to == null) return;
  }
  if (!last && c.v === 'gift') {
    a.to = await askPlayer('🎁 Tặng quà cho ai?');
    if (a.to == null) return;
    a.give = await askCard(`🎁 Tặng lá nào cho ${nm(a.to)}?`, myHand().filter(x => x.id !== id));
    if (a.give == null) return;
  }
  if (armed) a.uno = true;
  if (jump) send(a, true); else send(a);
}

function toggleArm() {
  if (myHand().length > 3 || myHand().length < 2) return;
  armed = !armed;
  if (armed) { S.uno(); float(mySeat(), '📣 UNO!', 'uno-float'); }
  renderControls();
}

function onAction(a) {
  if (a === 'arm') toggleArm();
  else if (a === 'uno') send({ type: 'uno' });
  else if (a === 'catch') { if (canCatch()) send({ type: 'catch' }, true); }
  else if (a === 'draw') { if (V.phase === 'play' && V.drawn == null) send({ type: 'draw' }); }
  else if (a === 'pass') { if (V.drawn != null) send({ type: 'pass' }); }
}

function tickTimers() {
  if (!V) return;
  const now = Date.now(), turnMs = CTX.room().turnMs;
  const dec = decider();
  let rem = deadline ? deadline - now : 0, total = turnMs;
  if (V.phase === 'catch' && catchUntil) { rem = catchUntil - now; total = CATCH_MS; }
  const frac = (!deadline && V.phase !== 'catch') || playing || dec == null ? 0 : Math.max(0, Math.min(1, rem / total));
  ROOT.querySelectorAll('.op').forEach(el => {
    const i = el.querySelector('.op-timer i');
    if (i) i.style.width = (+el.dataset.p === dec ? frac * 100 : 0) + '%';
  });
  const mine = canAct() || canCatch();
  const tb = $('#uno-timer');
  tb.style.width = (mine ? frac * 100 : 0) + '%';
  tb.classList.toggle('low', rem < 6000 || V.phase === 'catch');
  if (canAct() && V.phase === 'play' && rem > 0 && rem < 5000 && Math.floor(rem / 1000) !== tb._s) { tb._s = Math.floor(rem / 1000); SFX.tick(); }
}

// ================= VÒNG ĐỜI =================
async function update(msg, { backlog = 0, hidden = false } = {}) {
  SPEED = backlog >= 3 ? 4 : backlog >= 1 ? 1.8 : 1;
  if (!V) { V = structuredClone(msg.state); renderAll(); }
  playing = true;
  QUICK = hidden;
  if (hidden) SPEED = 100;
  if (msg.events.length) { renderControls(); if (modalTag === 'ask') closeTagged(); }
  for (const e of msg.events) { try { await playEvent(e); } catch (err) { console.error(err); } }
  QUICK = false;
  if (msg.meta && msg.meta.auto != null) log(`⏱️ ${[].concat(msg.meta.auto).map(who).join(', ')} hết giờ — máy đánh giúp.`);
  playing = false;
  SPEED = 1;
  V = structuredClone(msg.state);
  deadline = msg.deadlineIn ? msg.recvAt + msg.deadlineIn : 0;
  // Cửa sổ bắt lỗi UNO: đếm ngược phía client (server tự đóng sau CATCH_MS kể từ khi diễn xong).
  if (V.phase === 'catch') { const k = `${msg.matchId}:${V.catchW.p}:${V.turns}`; if (k !== catchKey) { catchKey = k; catchUntil = Date.now() + CATCH_MS; } }
  else catchUntil = 0;
  renderAll();
  const dec = decider();
  if (dec != null && dec === mySeat() && lastDecider !== dec && !hidden && V.phase === 'play') SFX.myTurn();
  lastDecider = dec;
  if (V.phase === 'over' && !overShown) setTimeout(showGameOver, 1200);
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root; SEATS = ctx.game.seats;
    V = null; pending = false; playing = false; SPEED = 1; QUICK = false; deadline = 0; overShown = false; modalTag = ''; lastDecider = null;
    armed = false; catchUntil = 0; catchKey = ''; pickDone = null; pile = [];
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    UI.emoteBar($('#uno-emotes'));
    UI.toolbar($('#uno-tools'), { help: showHelp });
    $('#uno-actions').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.a) onAction(b.dataset.a); });
    $('#uno-me').addEventListener('click', e => { const c = e.target.closest('#uno-hand .uc'); if (c) clickCard(+c.dataset.id); });
    $('#uno-deck').addEventListener('click', () => { if (canDraw()) onAction('draw'); });
    keyHandler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || UI.modalOpen() || !V || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'd') onAction('draw');
      else if (k === 'p') onAction('pass');
      else if (k === 'u') onAction(V.phase === 'catch' ? 'uno' : 'arm');
      else if (k === 'b') onAction('catch');
    };
    addEventListener('keydown', keyHandler);
    timerInt = setInterval(tickTimers, 100);
    return {
      update,
      onRoom: () => { if (V && !playing) renderOpps(); },
      emoteAnchor: seat => (V && seat >= 0 && V.players[seat] && !V.players[seat].off ? anchor(seat) : null),
      unmount() { clearInterval(timerInt); removeEventListener('keydown', keyHandler); if (pickDone) pickDone(null); pickDone = null; V = null; },
    };
  },
};
