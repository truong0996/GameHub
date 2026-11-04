// 💎 Kho Báu Inca — giao diện client. Xem "Game client interface" trong CLAUDE.md.
// V = bản trạng thái để VẼ: trong lúc diễn sự kiện, V được cập nhật dần theo từng sự kiện; diễn xong thì thay bằng state thật từ server.
import { HAZARDS, HAZ_KEYS, ARTIFACTS, MYSTERY, CHARMS, TEMPLES } from './data.js';

let CTX, UI, SFX, ROOT, V, SEATS;
let pending = false, playing = false, SPEED = 1, QUICK = false, deadline = 0, overShown = false, modalTag = '', timerInt = 0, keyHandler = null;

const $ = s => ROOT.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms / SPEED));
const mySeat = () => CTX.me().seat;
const P = p => V.players[p];
const nm = p => UI.esc(V.players[p] ? V.players[p].name : '?');
const col = p => (SEATS[p] ? SEATS[p].color : '#888');
const who = p => `<b class="pn" style="--c:${col(p)}">${nm(p)}</b>`;
const whos = ps => ps.map(who).join(', ');
const seatsIn = () => V.players.map((pl, i) => (pl.active && pl.status === 'in' ? i : -1)).filter(i => i >= 0);
const hz = h => `${HAZARDS[h].icon} ${HAZARDS[h].name}`;
const ch = c => `${CHARMS[c].icon} ${CHARMS[c].name}`;
const artTotal = pl => pl.arts.reduce((s, a) => s + a.v, 0);

// ================= LỜI THOẠI =================
const SAY = {
  stay: ['Liều ăn nhiều!', 'Đào tiếp!', 'Còn sớm mà 😎', 'Sợ gì!', 'Thêm tí nữa...'],
  leave: ['Thôi về!', 'Ăn chắc mặc bền', 'Bye nha 👋', 'Đủ rồi!', 'Về đếm ngọc đây'],
  die: ['Á á á!', 'Toang rồi!', 'Mẹ ơi!', 'Biết thế về sớm...', 'Ngọc của tui 😭'],
  rich: ['Giàu rồi!', 'Ngon!', 'Hehe 💎'],
  push: ['Đi cẩn thận nha 😈', 'Ối, trượt chân à?'],
  victim: ['Ai đẩy tui?!', 'Nhớ mặt đấy 😤', 'Trả đây!'],
  steal: ['Cho mượn tí 😏', 'Của chung mà!'],
  saved: ['Hú hồn!', 'Có bùa nên sống 😎'],
  win: ['Vua kho báu! 🏆', 'Giàu nhất hang!'],
};
function say(p, kind, prob = 1) {
  if (p == null || Math.random() > prob || QUICK) return;
  const b = ROOT.querySelector(`.pp[data-p="${p}"] .bubble`);
  if (!b) return;
  b.textContent = UI.pick(SAY[kind]);
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('show'), 2000);
}

// ================= ÂM THANH =================
const S = {
  flip() { SFX.noise(0.12, { v: 0.16, f: 2800, q: 0.8 }); },
  gem(n = 3) { for (let i = 0; i < Math.min(6, n); i++) SFX.tone(1700 + Math.random() * 900, 0.09, { type: 'triangle', v: 0.07, delay: i * 0.05 }); },
  danger() { SFX.tone(130, 0.45, { type: 'sawtooth', v: 0.09, to: 80 }); },
  drum() { SFX.tone(85, 0.25, { v: 0.4, to: 50 }); SFX.noise(0.12, { v: 0.15, f: 250, delay: 0.14 }); SFX.tone(85, 0.25, { v: 0.4, to: 50, delay: 0.28 }); },
  rumble() { SFX.noise(1.6, { v: 0.5, f: 120, ft: 'lowpass' }); SFX.tone(55, 1.4, { v: 0.35, to: 28 }); },
  magic() { [660, 880, 1320].forEach((f, i) => SFX.tone(f, 0.25, { type: 'sine', v: 0.06, delay: i * 0.07 })); },
  lock() { SFX.tone(600, 0.06, { type: 'square', v: 0.04 }); },
};

// ================= VẼ =================
const leftTag = c => (c.left ? `<span class="left">💎${c.left}</span>` : '');
function cardHTML(c, cls = '') {
  if (!c) return `<div class="cd back ${cls}"><i>☀️</i><b>INCA</b></div>`;
  if (c.k === 'gem') {
    const v = c.val ?? c.v;
    return `<div class="cd gem ${cls}" title="Kho báu ${v} ngọc — chia đều cho người trong hang, dư để lại trên lá"><i>💎</i><b class="num">${v}</b>${leftTag(c)}</div>`;
  }
  if (c.k === 'haz') {
    if (c.hid) return `<div class="cd haz hid ${cls}" title="Hiểm hoạ lật úp — không biết là gì"><i>❓</i><b>Hiểm hoạ?</b>${leftTag(c)}</div>`;
    const H = HAZARDS[c.h];
    return `<div class="cd haz ${cls}${c.trap ? ' trap' : ''}" style="--k:${H.color}" title="${H.name}${c.trap ? ' (bẫy)' : ''} — gặp lá thứ 2 cùng loại là chết"><i>${H.icon}</i><b>${H.name}</b>${c.trap ? '<em class="badge">🪤</em>' : ''}${leftTag(c)}</div>`;
  }
  if (c.k === 'art') {
    const A = ARTIFACTS[c.a];
    return `<div class="cd art ${cls}${c.taken ? ' taken' : ''}" title="${A.name} — chỉ người về MỘT MÌNH mới mang được"><i>${A.icon}</i><b>${A.name}</b>${leftTag(c)}</div>`;
  }
  const M = MYSTERY[c.m];
  return `<div class="cd mys ${cls}" title="${M.name}: ${M.desc}"><i>${M.icon}</i><b>${M.name}</b>${leftTag(c)}</div>`;
}

const TEMPLATE = `<div class="ig">
  <div class="ig-main">
    <div id="ig-players"></div>
    <div id="ig-cave" class="dark">
      <div class="ig-cave-head"><div id="ig-temples"></div><div id="ig-temple"></div></div>
      <div class="ig-cave-body">
        <div id="ig-deck"><div class="stack"></div><div id="ig-deck-info"></div></div>
        <div id="ig-path"></div>
      </div>
    </div>
    <div id="ig-status"></div>
    <div class="ig-timer"><i id="ig-timer"></i></div>
    <div id="ig-actions"></div>
    <div id="ig-charms"></div>
  </div>
  <aside class="ig-side">
    <div class="ig-head"><b>💎 Kho Báu Inca</b><span id="ig-mode" class="muted small"></span></div>
    <div id="ig-tent"></div>
    <div id="ig-log"></div>
    <div id="ig-emotes"></div>
    <div id="ig-tools"></div>
  </aside>
  <div id="ig-flash"></div>
</div>`;

function renderPlayers() {
  const box = $('#ig-players'), m = mySeat(), room = CTX.room(), deciding = V.phase === 'decide' && !playing;
  box.innerHTML = V.players.map((pl, p) => {
    if (!pl.active) return '';
    const off = room && room.seats[p] && room.seats[p].kind === 'human' && !room.seats[p].online;
    const st = pl.status === 'in' ? '⛏️ Trong hang' : pl.status === 'out' ? '⛺ Đã về lều' : pl.status === 'dead' ? '💀 Bỏ mạng' : '⛺ Ở trại';
    let badge = '';
    if (pl.status === 'in' && V.phase === 'decide') {
      if (pl.choice) badge = `<span class="choice ${pl.choice}">${pl.choice === 'stay' ? '⛏️ Ở' : '🏃 Về'}</span>`;
      else badge = pl.locked ? '<span class="choice locked">✔ Đã chốt</span>' : '<span class="choice think">🤔</span>';
    }
    const tent = pl.tent != null ? `⛺ <b>${pl.tent}</b>` : '⛺ ?';
    const arts = pl.arts.map(a => ARTIFACTS[a.a].icon).join('');
    return `<div class="pp st-${pl.status}${p === m ? ' me' : ''}${deciding && pl.status === 'in' && !pl.locked ? ' wait' : ''}" data-p="${p}" style="--c:${col(p)}">
      <div class="av">${pl.status === 'dead' ? '💀' : SEATS[p].label}</div>
      <div class="pp-body">
        <div class="pp-name">${pl.kind === 'bot' ? '🤖 ' : ''}${nm(p)}${p === m ? ' <span class="tag">bạn</span>' : ''}${off ? ' 📴' : ''}</div>
        <div class="pp-sub">${st}</div>
        <div class="pp-gems"><span class="carry" title="Ngọc đang cầm trong hang (mất nếu chết)">💎 <b>${pl.carried}</b></span><span class="tentv" title="Ngọc đã cất trong lều (an toàn, bí mật)">${tent}</span>
          ${arts ? `<span class="arts" title="Cổ vật">${arts}</span>` : ''}${V.chaos && pl.nCharms ? `<span class="nch" title="Số bùa còn lại">✨${pl.nCharms}</span>` : ''}</div>
      </div>
      ${badge}
      <div class="bubble"></div>
      <div class="pp-timer"><i></i></div>
    </div>`;
  }).join('');
}

function renderTemples() {
  $('#ig-temples').innerHTML = Array.from({ length: V.rounds }, (_, i) => {
    const t = V.temples[i], cls = i + 1 === V.round ? ' cur' : i + 1 < V.round ? ' done' : '';
    const icon = V.chaos ? (t ? TEMPLES[t].icon : '❔') : '🛕';
    return `<span class="tp${cls}" title="${t ? TEMPLES[t].name + ': ' + TEMPLES[t].desc : `Đền ${i + 1}`}">${icon}<small>${i + 1}</small></span>`;
  }).join('');
  const T = V.temple && TEMPLES[V.temple];
  $('#ig-temple').innerHTML = `<b>Đền ${V.round}/${V.rounds}</b>${T ? ` · ${T.icon} ${T.name} <span class="muted">— ${T.desc}</span>` : ''}`;
}

function riskNow() {
  const d = V.deckInfo;
  if (!d || !d.n) return 0;
  if (!d.byType) return null;
  const seen = new Set(V.path.filter(c => c.k === 'haz' && !c.hid).map(c => c.h));
  let r = [...seen].reduce((s, h) => s + d.byType[h], 0) / d.n;
  if (V.temple === 'twin') r = 1 - (1 - r) ** 2;
  if (V.temple === 'collapse' && V.flips + 1 >= 8) r = 1 - (1 - r) * 0.85;
  return r;
}

function renderDeck() {
  const d = V.deckInfo;
  $('#ig-deck .stack').innerHTML = cardHTML(null) + (d.n > 1 ? '<span class="layer l1"></span>' : '') + (d.n > 8 ? '<span class="layer l2"></span>' : '');
  const seen = new Set(V.path.filter(c => c.k === 'haz' && !c.hid).map(c => c.h));
  const types = d.byType ? HAZ_KEYS.map(h => `<span class="ht${seen.has(h) ? ' hot' : ''}" title="${HAZARDS[h].name}: còn ${d.byType[h]} lá">${HAZARDS[h].icon}${d.byType[h]}</span>`).join('') : '<span class="muted">🌫️ không rõ loại</span>';
  const r = riskNow();
  const rTxt = r == null ? '??' : Math.round(r * 100) + '%';
  $('#ig-deck-info').innerHTML = `<div><b>${d.n}</b> lá còn lại</div>
    <div class="kinds"><span title="Kho báu">💎${d.gem}</span><span title="Hiểm hoạ">☠️${d.haz}</span>${d.art ? `<span title="Cổ vật">🏺${d.art}</span>` : ''}${d.mys ? `<span title="Lá bí ẩn">❔${d.mys}</span>` : ''}</div>
    <div class="types">${types}</div>
    <div class="risk${r == null ? '' : r >= 0.3 ? ' bad' : r === 0 ? ' safe' : ''}" title="Xác suất lá kế tiếp giết cả hang">☠️ Nguy cơ: ${rTxt}</div>`;
}

function renderPath() {
  const seen = {};
  for (const c of V.path) if (c.k === 'haz' && !c.hid) seen[c.h] = (seen[c.h] || 0) + 1;
  const box = $('#ig-path'), had = new Set([...box.querySelectorAll('.slot')].map(s => s.dataset.id));
  box.innerHTML = V.path.length ? V.path.map(c => `<div class="slot${had.has(String(c.id)) ? '' : ' new'}" data-id="${c.id}">${cardHTML(c, c.k === 'haz' && !c.hid && seen[c.h] >= 2 ? 'boom' : c.k === 'haz' && !c.hid ? 'warn' : '')}</div>`).join('')
    : '<div class="muted empty">Lối vào đền tối om...</div>';
  box.scrollLeft = box.scrollWidth;
}

function renderTent() {
  const m = mySeat(), box = $('#ig-tent');
  if (m < 0) { box.innerHTML = '<div class="muted small">👀 Bạn đang xem.</div>'; return; }
  const pl = P(m), arts = pl.arts.map(a => `<span title="${ARTIFACTS[a.a].name}: ${a.v} ngọc">${ARTIFACTS[a.a].icon}<small>${a.v}</small></span>`).join('');
  box.innerHTML = `<div class="tent-row"><span>⛺ Lều của bạn</span><b>💎 ${pl.tent ?? 0}</b></div>
    ${arts ? `<div class="tent-arts">${arts} <span class="muted small">= ${artTotal(pl)} ngọc</span></div>` : ''}
    ${V.chaos && pl.used && pl.used.length ? `<div class="muted small">Đã dùng: ${pl.used.map(c => CHARMS[c].icon).join(' ')}</div>` : ''}`;
}

function canDecide() {
  const m = mySeat();
  return !!V && m >= 0 && V.phase === 'decide' && P(m).status === 'in' && !P(m).choice && !pending && !playing;
}

function renderControls() {
  const m = mySeat(), status = $('#ig-status'), acts = $('#ig-actions');
  let msg = '', btns = '';
  status.classList.remove('mine');
  const pl = m >= 0 ? P(m) : null;
  if (m < 0) msg = '👀 Bạn đang xem.';
  else if (V.phase === 'over') msg = V.winners.includes(m) ? '🏆 Bạn là người giàu nhất!' : '🏁 Ván đã kết thúc.';
  else if (pl.status === 'dead') msg = '💀 Bạn đã bỏ mạng trong hang (mất ngọc đang cầm). Chờ đền sau nhé.';
  else if (pl.status === 'out') msg = '⛺ Bạn đã về lều an toàn. Ngồi xem ai còn liều...';
  else if (pl.choice) {
    const wait = seatsIn().filter(p => !P(p).locked).length;
    msg = `Bạn đã chốt <b>${pl.choice === 'stay' ? '⛏️ Ở lại đào' : '🏃 Về lều'}</b>. ${wait ? `Chờ ${wait} người nữa...` : ''}`;
  } else if (V.phase === 'decide' && !playing) {
    status.classList.add('mine');
    const n = seatsIn().length;
    msg = `Bạn đang cầm <b>💎 ${pl.carried}</b>. Ở lại đào tiếp hay về lều cất ngọc?${n > 1 ? ` <span class="muted">(${n} người trong hang)</span>` : ' <span class="muted">(chỉ còn mình bạn!)</span>'}`;
    btns = `<button class="gold big stay" data-a="stay">⛏️ Ở lại <small>(phím 1)</small></button><button class="big leave" data-a="leave">⛺ Về lều <small>(phím 2)</small></button>`;
  }
  const extra = [];
  if (pl && pl.status === 'in') {
    if (pl.peek) extra.push(`🔦 Lá sắp lật: ${cardHTML(pl.peek, 'mini')}`);
    if (pl.shield) extra.push('🛡️ Hộ Mệnh đang bật');
    if (pl.magnet) extra.push('🧲 Nam Châm sẵn sàng');
    if (pl.push != null) extra.push(`😈 Định đẩy ${who(pl.push)}`);
    if (pl.trap) extra.push('🪤 Bẫy đã gài');
    if (pl.condor) extra.push('🦅 Đang nhìn lựa chọn của mọi người');
  }
  status.innerHTML = msg + (extra.length ? `<div class="armed">${extra.map(x => `<span>${x}</span>`).join('')}</div>` : '');
  acts.innerHTML = btns;
  renderCharms();
}

function renderCharms() {
  const m = mySeat(), box = $('#ig-charms');
  const list = V.chaos && m >= 0 && P(m).charms ? P(m).charms : [];
  if (!list.length) { box.innerHTML = ''; return; }
  const can = canDecide();
  box.innerHTML = `<span class="muted small">✨ Bùa của bạn:</span>` + list.map(c => `<button class="ghost charm${CHARMS[c].dirty ? ' dirty' : ''}" data-c="${c}" ${can ? '' : 'disabled'} title="${UI.esc(CHARMS[c].desc)}">${ch(c)}</button>`).join('');
}

function renderAll() {
  if (!V) return;
  renderPlayers();
  renderTemples();
  renderDeck();
  renderPath();
  renderTent();
  renderControls();
  $('#ig-mode').textContent = V.chaos ? '🔥 Hỗn Loạn' : '😇 Cổ điển';
  if (modalTag === 'charm' && !canDecide()) closeTagged();
}

// ================= HIỆU ỨNG =================
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function anchor(p) {
  const el = ROOT.querySelector(`.pp[data-p="${p}"]`);
  return el ? centerOf(el) : { x: innerWidth / 2, y: 60 };
}
const pathEnd = () => { const s = $('#ig-path .slot:last-child'); return s ? centerOf(s) : centerOf($('#ig-path')); };
async function fly(html, from, to, { ms = 520, delay = 0 } = {}) {
  if (QUICK) return;
  if (delay) await sleep(delay);
  const d = UI.el('div', 'ig-fly', html);
  $('.ig').appendChild(d);
  const tf = (pt, s) => `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%) scale(${s})`;
  try {
    await d.animate([{ transform: tf(from, 0.6), opacity: 0.7 }, { transform: tf(to, 1), opacity: 1 }],
      { duration: ms / SPEED, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).finished;
  } finally { d.remove(); }
}
const gemsFly = (from, to, n) => Promise.all(Array.from({ length: Math.min(5, Math.max(1, Math.ceil(n / 3))) }, (_, i) => fly('<span class="gemf">💎</span>', from, to, { ms: 480, delay: i * 70 })));
async function spot(html, caption, cls = '', ms = 1000) {
  if (QUICK) return;
  const d = UI.el('div', 'ig-spot dark ' + cls, `${html}<div class="cap">${caption}</div>`);
  $('.ig').appendChild(d);
  await sleep(ms);
  d.classList.add('out');
  setTimeout(() => d.remove(), 300);
}
function flash(cls, ms = 900) {
  const f = $('#ig-flash');
  f.className = cls; void f.offsetWidth; f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), ms);
}
function shake(el = $('#ig-cave')) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
function pulse(p, cls) {
  const el = ROOT.querySelector(`.pp[data-p="${p}"]`);
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 1200);
}
const float = (p, html, cls) => { if (!QUICK) UI.floatAt(anchor(p), html, cls); };
function log(html) {
  const box = $('#ig-log');
  box.appendChild(UI.el('div', 'li', html));
  while (box.children.length > 150) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}
const setLefts = ls => { if (ls) V.path.forEach((c, i) => { if (ls[i] != null) c.left = ls[i]; }); };

async function playEvent(e) {
  const m = mySeat();
  switch (e.t) {
    case 'start':
      log(`🧭 Cả đoàn tiến vào ${V.rounds} ngôi đền Inca. Ai mang về nhiều ngọc nhất sẽ thắng!`);
      break;
    case 'round': {
      Object.assign(V, { round: e.r, temple: e.temple, path: [], flips: 0 });
      V.temples[e.r - 1] = e.temple;
      for (const p of e.ps) Object.assign(P(p), { status: 'in', carried: 0, locked: false, choice: null, peek: null });
      renderAll();
      const T = e.temple && TEMPLES[e.temple];
      SFX.gong();
      log(`<span class="sep">— 🛕 Đền ${e.r}/${V.rounds}${T ? `: ${T.icon} <b>${T.name}</b> — ${T.desc}` : ''} —</span>`);
      await spot(`<div class="big-ic">${T ? T.icon : '🛕'}</div>`, `Đền ${e.r}/${V.rounds}${T ? ` · ${T.name}<small>${T.desc}</small>` : ''}`, 'temple', 1700);
      break;
    }
    case 'flip': {
      const c = e.card;
      for (const p of seatsIn()) Object.assign(P(p), { locked: false, choice: null, peek: null });
      S.flip();
      await fly(cardHTML(c), centerOf($('#ig-deck')), pathEnd(), { ms: 420 });
      V.path.push({ ...c });
      V.flips++;
      if (V.deckInfo.n) V.deckInfo.n--;
      if (c.k === 'gem') {
        for (const p of e.ps) P(p).carried += e.share;
        renderPath(); renderPlayers();
        if (e.share) { S.gem(e.share); for (const p of e.ps) float(p, `+💎${e.share}`); }
        log(`💎 Kho báu <b>${c.val}</b>${e.share ? ` → mỗi người +${e.share}` : ' — không đủ chia'}${c.left ? `, rơi lại 💎${c.left}` : ''}.`);
      } else if (c.k === 'haz') {
        renderPath(); renderPlayers();
        const seen = c.hid ? 0 : V.path.filter(x => x.k === 'haz' && x.h === c.h).length;
        if (seen < 2) {
          S.danger();
          log(c.hid ? '❓ Một hiểm hoạ <b>lật úp</b>... không ai biết là gì.' : `⚠️ ${hz(c.h)}${c.trap ? ' (bẫy 🪤)' : ''} xuất hiện! Gặp thêm 1 lá nữa là chết.`);
        }
      } else if (c.k === 'art') {
        renderPath();
        S.magic();
        log(`${ARTIFACTS[c.a].icon} Cổ vật <b>${ARTIFACTS[c.a].name}</b>! Chỉ ai về <b>một mình</b> mới mang được.`);
      } else {
        renderPath();
        S.magic();
        log(`${MYSTERY[c.m].icon} <b>${MYSTERY[c.m].name}</b>: ${MYSTERY[c.m].desc}`);
      }
      await sleep(250);
      break;
    }
    case 'vein':
      for (const p of e.ps) { P(p).carried += e.n; float(p, `+💎${e.n}`); }
      S.gem(6); renderPlayers();
      await sleep(500);
      break;
    case 'curse':
      for (const [p, n] of Object.entries(e.lost)) { P(+p).carried -= n; float(+p, `-💎${n}`, 'bad'); pulse(+p, 'hit'); }
      setLefts(e.lefts); renderPath(); renderPlayers();
      S.danger();
      await sleep(500);
      break;
    case 'echo':
      SFX.tone(e.haz ? 220 : 880, 0.6, { type: 'sine', v: 0.12, to: e.haz ? 160 : 990 });
      log(`🔊 Tiếng vọng từ sâu trong hang: lá kế tiếp ${e.haz ? '<b class="warn">LÀ HIỂM HOẠ</b>' : '<b>không phải</b> hiểm hoạ'}.`);
      await spot(`<div class="big-ic">🔊</div>`, e.haz ? 'Lá kế tiếp là HIỂM HOẠ!' : 'Lá kế tiếp an toàn... chắc vậy', e.haz ? 'danger' : '', 900);
      break;
    case 'fog': await sleep(300); break;
    case 'shortcut': await sleep(300); break;
    case 'charm': {
      const C = e.c && CHARMS[e.c];
      S.magic();
      float(e.p, C ? C.icon : '✨');
      log(C ? `✨ ${who(e.p)} dùng ${ch(e.c)}${e.target != null ? ` lên ${who(e.target)}` : ''}.` : `✨ ${who(e.p)} kích hoạt một <b>bùa bí ẩn</b>...`);
      break;
    }
    case 'peek':
      if (e.p === m) log(`🔦 Bạn soi thấy lá sắp lật: <b>${e.card.k === 'gem' ? `💎 ${e.card.v}` : e.card.k === 'haz' ? hz(e.card.h) : e.card.k === 'art' ? ARTIFACTS[e.card.a].name : MYSTERY[e.card.m].name}</b> 🤫`);
      break;
    case 'steal':
      P(e.from).carried -= e.n; P(e.p).carried += e.n;
      await gemsFly(anchor(e.from), anchor(e.p), e.n);
      renderPlayers();
      float(e.p, `+💎${e.n}`);
      say(e.p, 'steal', 0.7); say(e.from, 'victim', 0.6);
      log(`🎒 ${who(e.p)} móc túi ${who(e.from)}: <b>💎${e.n}</b>!`);
      break;
    case 'lock':
      P(e.p).locked = true;
      if (e.p !== m) S.lock();
      renderPlayers();
      if (e.p === m) renderControls();
      break;
    case 'reveal': {
      for (const p of e.stay) P(p).choice = 'stay';
      for (const p of e.leave) P(p).choice = 'leave';
      S.drum();
      renderPlayers();
      ROOT.querySelectorAll('.pp .choice').forEach(x => x.classList.add('pop'));
      for (const p of e.stay) say(p, 'stay', 0.35);
      for (const p of e.leave) say(p, 'leave', 0.35);
      log(`🎴 Lật lựa chọn — ${e.stay.length ? `⛏️ Ở lại: ${whos(e.stay)}` : ''}${e.stay.length && e.leave.length ? ' · ' : ''}${e.leave.length ? `🏃 Về: ${whos(e.leave)}` : ''}`);
      await sleep(1100);
      break;
    }
    case 'push':
      P(e.to).carried -= e.n;
      setLefts(e.lefts);
      pulse(e.to, 'hit');
      SFX.tone(300, 0.3, { type: 'square', v: 0.1, to: 80 });
      say(e.p, 'push'); say(e.to, 'victim');
      await gemsFly(anchor(e.to), pathEnd(), e.n);
      renderPlayers(); renderPath();
      log(`😈 ${who(e.p)} <b>đẩy ngã</b> ${who(e.to)} — rơi 💎${e.n} xuống đường!`);
      break;
    case 'pushFail':
      log(`😈 ${who(e.p)} định đẩy ${who(e.to)} nhưng hụt (${P(e.p).choice === 'stay' ? 'mình lại ở lại' : 'người kia cũng về'}).`);
      break;
    case 'collect': {
      const from = pathEnd();
      await Promise.all(e.list.map(it => (it.gain || it.arts.length ? gemsFly(from, anchor(it.p), it.gain) : null)));
      setLefts(e.lefts);
      for (const it of e.list) {
        const pl = P(it.p);
        if (pl.tent != null) pl.tent += it.carried + it.gain;
        pl.arts = pl.arts.concat(it.arts);
        Object.assign(pl, { carried: 0, status: 'out' });
        for (const a of it.arts) { const c = V.path.find(x => x.k === 'art' && x.a === a.a); if (c) c.taken = true; }
        if (it.carried + it.gain) float(it.p, `⛺+💎${it.carried + it.gain}`);
      }
      renderPath(); renderPlayers(); renderTent();
      S.gem(8);
      if (e.clash) log(`🧲 ${whos(e.clash)} cùng bật Nam Châm — <b>triệt tiêu nhau</b>!`);
      if (e.magnet != null) log(`🧲 Nam Châm của ${who(e.magnet)} hút sạch ngọc rơi${e.list.some(it => it.arts.length) ? ' và cổ vật' : ''}!`);
      for (const it of e.list) {
        log(`⛺ ${who(it.p)} về lều${it.gain ? `, nhặt thêm 💎${it.gain}${e.double ? ' (🕳️ gấp đôi)' : ''}` : ''}${it.arts.length ? ` + ${it.arts.map(a => `${ARTIFACTS[a.a].icon} ${ARTIFACTS[a.a].name} (${a.v})`).join(', ')}` : ''}.`);
        if (it.arts.length) {
          SFX.card();
          await spot(it.arts.map(a => cardHTML({ k: 'art', a: a.a }, 'xl')).join(''), `${who(it.p)} mang về ${it.arts.map(a => ARTIFACTS[a.a].name).join(', ')}!`, 'safe', 1200);
        }
      }
      break;
    }
    case 'trap':
      SFX.tone(900, 0.08, { type: 'square', v: 0.07 }); SFX.tone(500, 0.2, { type: 'square', v: 0.07, delay: 0.1 });
      log(`🪤 ${who(e.p)} đã <b>gài bẫy</b> ${hz(e.h)} lên đầu chồng bài!`);
      await spot(cardHTML({ k: 'haz', h: e.h, trap: true }, 'xl'), `🪤 ${who(e.p)} gài bẫy!`, 'danger', 900);
      break;
    case 'collapse':
      S.rumble(); flash('quake', 1500); shake($('.ig'));
      log('🏚️ <b>HANG SẬP!</b>');
      await spot('<div class="big-ic">🏚️</div>', 'HANG SẬP!', 'danger', 1100);
      break;
    case 'death': {
      if (e.h) { SFX.boom(); flash('blood'); shake($('.ig')); renderPath(); }
      const dead = Object.keys(e.lost).map(Number), saved = Object.keys(e.saved).map(Number);
      for (const p of dead) { Object.assign(P(p), { carried: 0, status: 'dead' }); if (e.lost[p]) float(p, `💀 -💎${e.lost[p]}`, 'bad'); say(p, 'die', 0.7); }
      for (const p of saved) { const pl = P(p); if (pl.tent != null) pl.tent += e.saved[p]; Object.assign(pl, { carried: 0, status: 'out' }); float(p, '🛡️'); say(p, 'saved'); }
      renderPlayers(); renderTent();
      const what = e.h ? `${hz(e.h)} thứ hai${e.trap ? ' (bẫy 🪤)' : ''}!` : 'Hang sập!';
      log(`💀 ${what} ${dead.length ? `${whos(dead)} bỏ chạy tay trắng.` : ''}${saved.length ? ` 🛡️ ${whos(saved)} thoát nhờ Bùa Hộ Mệnh.` : ''}`);
      if (e.h) await spot(cardHTML({ k: 'haz', h: e.h }, 'xl'), `${what}${dead.length ? ` ${dead.length} người mất sạch ngọc` : ''}`, 'danger', 1500);
      break;
    }
    case 'bonus':
      for (const p of e.ps) { const pl = P(p); if (pl.tent != null) pl.tent += e.n; float(p, `💰+${e.n}`); }
      S.gem(6); renderTent();
      log(`💰 Đền Tham Lam thưởng ${whos(e.ps)} mỗi người <b>💎${e.n}</b> vì trụ lại lâu nhất!`);
      await sleep(500);
      break;
    case 'roundEnd':
      V.path = e.path;
      renderPath();
      if (e.lostArts.length) log(`🕳️ Cổ vật bị bỏ lại trong hang và thất lạc mãi mãi: ${e.lostArts.map(a => ARTIFACTS[a].icon).join(' ')}`);
      log(`<span class="sep">— Hết đền ${e.r} —</span>`);
      await sleep(900);
      break;
    case 'over': {
      V.phase = 'over';
      SFX.win(); UI.fireworks(6, () => SFX.pop()); UI.confetti();
      for (const p of e.winners) say(p, 'win');
      log(`🏆 ${whos(e.winners)} giàu nhất với <b>💎${e.results[0].total}</b>!`);
      await sleep(1000);
      break;
    }
  }
}

// ================= MODAL =================
function openTagged(tag, html) { modalTag = tag; return UI.openModal(`<div class="ig-m">${html}</div>`); }
function closeTagged() { if (modalTag) { UI.closeModal(); modalTag = ''; } }
const mq = s => document.querySelector('#modal ' + s);

function showCharm(c) {
  if (!canDecide()) return;
  const C = CHARMS[c];
  if (C.target) {
    const opts = seatsIn().filter(p => p !== mySeat()).map(p => ({ html: `${nm(p)} <small>(💎${P(p).carried})</small>`, value: p, color: col(p) }));
    if (!opts.length) return UI.toast('Không còn ai khác trong hang');
    modalTag = 'charm';
    UI.pickModal(`${C.icon} ${C.name}<div class="small muted" style="font-weight:400;margin-top:6px">${C.desc}</div>`, opts, t => { modalTag = ''; send({ type: 'charm', charm: c, target: t }); });
    return;
  }
  openTagged('charm', `<h2 class="center">${C.icon} ${C.name}</h2><p class="center">${C.desc}</p>
    ${C.secret ? '<p class="center muted small">🤫 Người khác chỉ thấy bạn dùng "một bùa bí ẩn".</p>' : ''}
    <div class="btns"><button class="ghost" data-x>Thôi</button><button class="gold" data-ok>✨ Dùng bùa</button></div>`);
  mq('[data-x]').onclick = closeTagged;
  mq('[data-ok]').onclick = () => { closeTagged(); send({ type: 'charm', charm: c }); };
}

function showGameOver() {
  overShown = true;
  const host = CTX.me().isHost, medal = ['🏆', '🥈', '🥉'];
  openTagged('over', `<h2 class="center">🏆 ${V.winners.map(nm).join(' & ')} giàu nhất!</h2>
    <ol class="rank">${V.results.map((r, i) => `<li style="--c:${col(r.p)}"><span>${medal[i] || i + 1 + '.'}</span><span class="grow">${nm(r.p)}</span>
      <span class="muted small">⛺${r.tent}${r.n ? ` + ${P(r.p).arts.map(a => ARTIFACTS[a.a].icon).join('')} ${r.arts}` : ''}</span><b>💎 ${r.total}</b></li>`).join('')}</ol>
    <div class="btns"><button class="ghost" data-a="close">👀 Xem bàn</button>
    ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}</div>`);
  const on = (a, fn) => { const b = mq(`[data-a="${a}"]`); if (b) b.onclick = () => { closeTagged(); fn(); }; };
  on('close', () => {});
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

function showHelp() {
  const chaos = V && V.chaos;
  const li = obj => Object.values(obj).map(x => `<li>${x.icon} <b>${x.name}</b> — ${x.desc}</li>`).join('');
  openTagged('help', `<div class="help">
    <h2>📖 Luật chơi — Kho Báu Inca</h2>
    <h3>Cơ bản</h3><ul>
      <li>Có ${V ? V.rounds : 5} ngôi đền (vòng). Mỗi vòng cả đoàn vào hang, mỗi lượt lật 1 lá đường hầm.</li>
      <li>💎 <b>Kho báu:</b> chia đều cho người đang trong hang, số dư rơi lại trên lá.</li>
      <li>☠️ <b>Hiểm hoạ</b> (${HAZ_KEYS.map(h => HAZARDS[h].icon).join(' ')}): lá đầu tiên của mỗi loại chưa sao. Lá <b>thứ hai cùng loại</b> → ai còn trong hang mất sạch ngọc đang cầm, hết vòng (lá đó bị loại khỏi các vòng sau).</li>
      <li>Sau mỗi lá, mọi người <b>bí mật chọn cùng lúc</b>: ⛏️ Ở lại đào tiếp, hoặc ⛺ Về lều. Về lều thì cất ngọc an toàn (bí mật), và chia đều ngọc rơi trên đường với những người về cùng lượt.</li>
      <li>🏺 <b>Cổ vật:</b> mỗi vòng thêm 1 cái. Chỉ người về <b>một mình</b> mới mang được. 3 cái đầu đáng 5 ngọc, sau đó đáng 10. Bỏ lại trong hang là mất.</li>
      <li>Hết ${V ? V.rounds : 5} đền, ai nhiều ngọc nhất (lều + cổ vật) thắng. Mỗi lượt có ${Math.round(CTX.room().turnMs / 1000)} giây — hết giờ máy chọn <b>Về</b> giúp.</li>
    </ul>
    ${chaos ? `<h3>🔥 Hỗn Loạn — Bùa (mỗi người 3 bùa, dùng 1 lần, khi đang trong hang và chưa chốt)</h3><ul>${li(CHARMS)}</ul>
    <h3>❔ Lá bí ẩn trong hang</h3><ul>${li(MYSTERY)}</ul>
    <h3>🛕 Các ngôi đền</h3><ul>${li(TEMPLES)}</ul>` : ''}
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Hiểu rồi, vào hang thôi!</button></div></div>`);
  mq('[data-x]').onclick = closeTagged;
}

// ================= ĐIỀU KHIỂN =================
function send(action) {
  pending = true;
  if (V) renderControls();
  return CTX.send(action).then(r => { pending = false; if (V && !playing) renderAll(); return r; });
}
function decide(stay) {
  if (!canDecide()) return;
  SFX.ac();
  SFX.click();
  send({ type: 'decide', stay });
}

function tickTimers() {
  if (!V) return;
  const now = Date.now(), turnMs = CTX.room().turnMs;
  const rem = deadline ? deadline - now : 0;
  const frac = !deadline || playing || V.phase !== 'decide' ? 0 : Math.max(0, Math.min(1, rem / turnMs));
  ROOT.querySelectorAll('.pp').forEach(el => {
    const pl = P(+el.dataset.p), i = el.querySelector('.pp-timer i');
    if (i) i.style.width = (pl && pl.status === 'in' && !pl.locked ? frac * 100 : 0) + '%';
  });
  const mine = canDecide();
  const tb = $('#ig-timer');
  tb.style.width = (mine ? frac * 100 : 0) + '%';
  tb.classList.toggle('low', rem < 6000);
  if (mine && rem > 0 && rem < 5000 && Math.floor(rem / 1000) !== tb._s) { tb._s = Math.floor(rem / 1000); SFX.tick(); }
}

// ================= VÒNG ĐỜI =================
async function update(msg, { backlog = 0, hidden = false } = {}) {
  SPEED = backlog >= 3 ? 4 : backlog >= 1 ? 1.8 : 1;
  if (!V) { V = structuredClone(msg.state); renderAll(); }
  playing = true;
  QUICK = hidden;
  if (hidden) SPEED = 100;
  if (msg.events.length) renderControls();
  for (const e of msg.events) { try { await playEvent(e); } catch (err) { console.error(err); } }
  QUICK = false;
  const autos = msg.meta && msg.meta.auto != null ? [].concat(msg.meta.auto) : [];
  if (autos.length) log(`⏱️ ${whos(autos)} hết giờ — máy chọn <b>Về lều</b> giúp.`);
  playing = false;
  SPEED = 1;
  V = structuredClone(msg.state);
  deadline = msg.deadlineIn ? msg.recvAt + msg.deadlineIn : 0;
  renderAll();
  if (V.phase === 'over' && !overShown) setTimeout(showGameOver, 1200);
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root; SEATS = ctx.game.seats;
    V = null; pending = false; playing = false; SPEED = 1; QUICK = false; deadline = 0; overShown = false; modalTag = '';
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    UI.emoteBar($('#ig-emotes'));
    UI.toolbar($('#ig-tools'), { help: showHelp });
    $('#ig-actions').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) decide(b.dataset.a === 'stay'); });
    $('#ig-charms').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) showCharm(b.dataset.c); });
    keyHandler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || UI.modalOpen()) return;
      if (e.key === '1') decide(true);
      else if (e.key === '2') decide(false);
    };
    addEventListener('keydown', keyHandler);
    timerInt = setInterval(tickTimers, 100);
    return {
      update,
      onRoom: () => { if (V && !playing) renderPlayers(); },
      emoteAnchor: seat => (V && seat >= 0 && V.players[seat] && V.players[seat].active ? anchor(seat) : null),
      unmount() { clearInterval(timerInt); removeEventListener('keydown', keyHandler); V = null; },
    };
  },
};
