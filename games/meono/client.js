// 💣 Mèo Nổ — giao diện client. Xem "Game client interface" trong CLAUDE.md.
import { CARDS, ORDER, SINGLE, TARGETED, isKiller, comboKind } from './cards.js';

let CTX, UI, SFX, ROOT, ST, SEATS;
let sel = [], selKey = '', pending = false, playing = false, SPEED = 1, QUICK = false;
let reactEnd = 0, reactKey = '', deadline = 0, overShown = false, modalTag = '', modalFor = '', timerInt = 0, keyHandler = null;

const $ = s => ROOT.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms / SPEED));
const mySeat = () => CTX.me().seat;
const P = p => ST.players[p];
const nm = p => UI.esc(ST.players[p] ? ST.players[p].name : '?');
const col = p => (SEATS[p] ? SEATS[p].color : '#fff');
const who = p => `<b class="pn" style="--c:${col(p)}">${nm(p)}</b>`;
const cname = c => `${CARDS[c].icon} ${CARDS[c].name}`;
const sortHand = h => h.slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
const myHand = () => (mySeat() >= 0 && P(mySeat()).hand ? sortHand(P(mySeat()).hand) : []);
const alive = p => P(p).active && P(p).alive;
const others = () => ST.players.map((pl, i) => i).filter(i => i !== mySeat() && alive(i));

// ================= LỜI THOẠI =================
const SAY = {
  nope: ['Không nhé!', 'Còn lâu!', 'Mơ đi!', 'Đâu dễ vậy!', 'Hông cho!'],
  boom: ['Toang rồi!', 'Ối giời ơi!', 'Meooo... 💥', 'Hẹn kiếp sau!'],
  defuse: ['Hú hồn!', 'Suýt nữa thì...', 'Ngoan nào mèo ơi', 'Vẫn sống nhé 😎'],
  attack: ['Lãnh đạn đi!', 'Tới công chuyện!', 'Gánh giùm cái!'],
  victim: ['Ơ kìa!', 'Sao lại là tui?!', 'Trả đây!', 'Nhớ mặt đấy 😤'],
  skip: ['Ngủ tiếp đây 😴', 'Pass!', 'Thôi né.'],
  favor: ['Cho xin 1 lá đi mà 🥺', 'Chia sẻ chút nào!'],
  steal: ['Của tui rồi nhé!', 'Cảm ơn nha 😏'],
  swap: ['Đổi đời nào!', 'Bài đẹp đấy, cho xin 😈'],
  catomic: ['Cả làng cùng nổ!', 'Chúc may mắn 😈', 'Cháy nhà ra mặt chuột!'],
  ghost: ['👻 Hù!', 'Chết rồi vẫn phá!', 'Ma đây!'],
  win: ['Vô địch! 🏆', 'Mèo nào cũng sợ tui!'],
  fear: ['Lạy trời...', 'Đừng nổ, đừng nổ...', 'Run quá 😰'],
};
function say(p, kind, prob = 1) {
  if (p == null || Math.random() > prob) return;
  const b = ROOT.querySelector(`.pp[data-p="${p}"] .bubble`);
  if (!b) return;
  b.textContent = UI.pick(SAY[kind]);
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('show'), 2200);
}

// ================= ÂM THANH =================
const S = {
  flick() { SFX.noise(0.09, { v: 0.18, f: 3200, q: 0.8 }); },
  draw() { SFX.noise(0.18, { v: 0.15, f: 1600, fto: 500 }); },
  nope() { SFX.tone(240, 0.22, { type: 'sawtooth', v: 0.13, to: 120 }); SFX.tone(180, 0.3, { type: 'square', v: 0.08, to: 90, delay: 0.12 }); },
  heart() { SFX.tone(62, 0.16, { v: 0.5 }); SFX.tone(58, 0.2, { v: 0.45, delay: 0.24 }); },
  hiss() { SFX.noise(0.9, { v: 0.25, f: 5000, ft: 'highpass' }); },
  riffle() { for (let i = 0; i < 8; i++) SFX.noise(0.05, { v: 0.12, f: 2500 + i * 200, delay: i * 0.07 }); },
  siren() { for (let i = 0; i < 3; i++) SFX.tone(520, 0.4, { type: 'sawtooth', v: 0.07, to: 1040, delay: i * 0.45 }); },
  ticks(n = 4) { for (let i = 0; i < n; i++) SFX.tone(1500, 0.05, { type: 'square', v: 0.06, delay: i * 0.3 }); },
};

// ================= VẼ =================
function cardHTML(c, cls = '') {
  if (!c) return `<div class="cd back ${cls}"><i>🐾</i><b>MÈO NỔ</b></div>`;
  const C = CARDS[c];
  return `<div class="cd ${cls}${isKiller(c) ? ' killer' : ''}" style="--k:${C.color}" title="${UI.esc(C.name + ' — ' + C.desc)}"><i>${C.icon}</i><b>${C.name}</b></div>`;
}

const TEMPLATE = `<div class="mn">
  <div class="mn-main">
    <div id="mn-players"></div>
    <div id="mn-table" class="dark">
      <div class="pile" id="mn-deck" title="Bấm để rút bài"><div class="stack"></div><div class="pile-info" id="mn-deck-info"></div></div>
      <div id="mn-stage"></div>
      <div class="pile" id="mn-discard"><div class="stack"></div><div class="pile-info" id="mn-discard-info"></div></div>
    </div>
    <div id="mn-status"></div>
    <div id="mn-know"></div>
    <div id="mn-actions"></div>
    <div class="mn-timer"><i id="mn-timer"></i></div>
    <div id="mn-hand"></div>
  </div>
  <aside class="mn-side">
    <div class="mn-head"><b>💣 Mèo Nổ</b><span id="mn-mode" class="muted small"></span></div>
    <div id="mn-log"></div>
    <div id="mn-emotes"></div>
    <div id="mn-tools"></div>
  </aside>
  <div id="mn-flash"></div>
</div>`;

function renderPlayers() {
  const box = $('#mn-players'), m = mySeat(), room = CTX.room();
  const ask = ST.phase === 'react' ? null : ST.ask;
  box.innerHTML = ST.players.map((pl, p) => {
    if (!pl.active) return '';
    const dead = !pl.alive, ghost = dead && pl.count > 0;
    const off = room && room.seats[p] && room.seats[p].kind === 'human' && !room.seats[p].online;
    const backs = Math.min(pl.count, 8);
    const sub = dead ? (ghost ? `👻 Hồn ma · ${pl.count} 🙅` : '💀 Đã nổ')
      : `${pl.count} lá${ST.turn === p && ST.turnsLeft > 1 ? ` · <b class="warn">⚔️ ${ST.turnsLeft} lượt</b>` : ''}`;
    return `<div class="pp${p === ST.turn && !dead ? ' turn' : ''}${p === ask ? ' ask' : ''}${dead ? ' dead' : ''}${ghost ? ' ghost' : ''}${p === m ? ' me' : ''}" data-p="${p}" style="--c:${col(p)}">
      <div class="av">${dead ? (ghost ? '👻' : '💀') : (SEATS[p].label || '🐱') + CTX.skin.face(p, 'fill')}</div>
      <div class="pp-body">
        <div class="pp-name">${pl.kind === 'bot' ? '🤖 ' : ''}${nm(p)}${p === m ? ' <span class="tag">bạn</span>' : ''}${off ? ' 📴' : ''}</div>
        <div class="pp-sub">${sub}</div>
        <div class="minis">${dead ? '' : `<i class="${CTX.skin.cls(p, 'back')}"></i>`.repeat(backs)}</div>
      </div>
      <div class="bubble"></div>
      <div class="pp-timer"><i></i></div>
    </div>`;
  }).join('');
}

function myRisk() {
  const m = mySeat();
  if (ST.tbPos === 0) return { pct: 100, sure: true };
  const k0 = m >= 0 && P(m).know ? P(m).know[0] : null;
  if (k0) return { pct: isKiller(k0) ? 100 : 0, sure: true };
  return { pct: ST.deckCount ? Math.round(ST.killers / ST.deckCount * 100) : 0, sure: false };
}

function renderTable() {
  const n = ST.deckCount, r = myRisk();
  $('#mn-deck .stack').innerHTML = cardHTML(null) + (n > 1 ? '<span class="layer l1"></span>' : '') + (n > 6 ? '<span class="layer l2"></span>' : '');
  $('#mn-deck').classList.toggle('can', canPlay() && !sel.length);
  $('#mn-deck').classList.toggle('hot', r.pct >= 100);
  const tb = ST.tbPos >= 0 ? `<div class="tb${ST.tbPos === 0 ? ' now' : ''}">⏳ ${ST.tbPos === 0 ? 'NẰM TRÊN CÙNG!' : `cách mặt bài ${ST.tbPos} lá`}</div>` : '';
  $('#mn-deck-info').innerHTML = `<b>${n}</b> lá · 💣×${ST.killers}<div class="risk${r.pct >= 50 ? ' bad' : r.pct === 0 && r.sure ? ' safe' : ''}">Nguy cơ nổ: ${r.pct}%${r.sure ? ' (chắc chắn)' : ''}</div>${tb}`;
  const top = ST.discard.at(-1);
  $('#mn-discard .stack').innerHTML = top ? cardHTML(top) : '<div class="cd empty"></div>';
  $('#mn-discard-info').innerHTML = `Chồng bỏ: <b>${ST.discard.length}</b>`;
  $('#mn-mode').textContent = (ST.chaos ? '🔥 Hỗn Loạn' : '😇 Cổ điển') + ` · chiều ${ST.dir > 0 ? '↻' : '↺'}`;
}

// Sân khấu giữa bàn: lá đang chờ "Không!", hoặc lượt của ai.
function renderStage(r = ST.react) {
  const st = $('#mn-stage');
  if (!r) {
    if (ST.phase === 'over') { st.innerHTML = `<div class="idle">🏆 ${who(ST.winner)} sống sót cuối cùng!</div>`; return; }
    const t = ST.turn, extra = ST.phase === 'favor' ? `🙏 ${who(ST.favor.from)} đang chọn lá đưa cho ${who(ST.favor.to)}`
      : ST.phase === 'bury' ? `🤫 ${who(ST.bury.p)} đang lén nhét ${cname(ST.bury.card)} lại...`
      : ST.phase === 'alter' ? `🪄 ${who(ST.alter.p)} đang cải số...` : '';
    st.innerHTML = `<div class="idle"><div class="big">${t === mySeat() ? '👉 Lượt của bạn' : `Lượt của ${who(t)}`}</div>${ST.turnsLeft > 1 ? `<div class="warn">⚔️ còn ${ST.turnsLeft} lượt</div>` : ''}${extra ? `<div class="small">${extra}</div>` : ''}</div>`;
    return;
  }
  const blocked = r.nopes.length % 2 === 1;
  const desc = r.kind === 'pair' ? 'Đôi — rút ngẫu nhiên 1 lá' : r.kind === 'triple' ? `Bộ ba — đòi ${cname(r.name)}` : r.kind === 'five' ? `5 lá — nhặt ${cname(r.take)} từ chồng bỏ` : '';
  st.innerHTML = `<div class="react${blocked ? ' blocked' : ''}">
    <div class="react-who">${who(r.p)} đánh${r.target != null ? ` → ${who(r.target)}` : ''}</div>
    <div class="react-cards">${r.cards.map(c => cardHTML(c, 'lg')).join('')}</div>
    <div class="stamps">${r.nopes.map((p, i) => `<span class="stamp" style="--c:${col(p)};--r:${(i % 2 ? 1 : -1) * (6 + i * 3)}deg">🙅 KHÔNG! <small>${nm(p)}</small></span>`).join('')}</div>
    ${desc ? `<div class="small">${desc}</div>` : ''}
    <div class="react-state">${blocked ? '❌ Đang bị chặn' : '✅ Sắp có hiệu lực'}</div>
    <div class="react-bar"><i id="mn-react-bar"></i></div>
  </div>`;
}

function canPlay() {
  const m = mySeat();
  return !!ST && m >= 0 && ST.phase === 'play' && ST.turn === m && alive(m) && !pending;
}
function canNope() {
  const m = mySeat();
  if (!ST || ST.phase !== 'react' || m < 0 || pending) return false;
  const pl = P(m), r = ST.react;
  if (!pl.hand || !pl.hand.includes('nope') || (!pl.alive && !ST.chaos)) return false;
  return r.nopes.at(-1) !== m && !(r.nopes.length === 0 && r.p === m);
}

function selection() { const h = myHand(); return sel.map(i => h[i]); }

function renderControls() {
  const m = mySeat(), status = $('#mn-status'), acts = $('#mn-actions');
  const cards = selection();
  let msg = '', btns = '';
  status.classList.remove('mine');
  if (m < 0) msg = '👀 Bạn đang xem.';
  else if (ST.phase === 'over') msg = ST.winner === m ? '🏆 Bạn là con mèo cuối cùng còn sống!' : '💀 Ván đã kết thúc.';
  else if (!alive(m)) msg = P(m).count ? '👻 Bạn đã nổ — nhưng hồn ma vẫn hô "Không!" được.' : '💀 Bạn đã nổ. Ngồi xem mọi người run nhé.';
  if (ST.phase === 'react' && m >= 0) {
    if (canNope()) {
      btns = '<button class="nope-btn" data-a="nope">🙅 KHÔNG! <small>(phím N)</small></button>';
      msg = msg || (ST.react.nopes.length % 2 ? 'Lá của bạn đang bị chặn — chặn lại?' : 'Hô "Không!" để chặn lá này?');
    } else msg = msg || 'Chờ xem có ai hô "Không!"...';
  } else if (canPlay()) {
    status.classList.add('mine');
    const kind = cards.length >= 2 ? comboKind(cards) : null;
    if (!cards.length) {
      msg = ST.turnsLeft > 1 ? `Lượt của bạn — còn <b>${ST.turnsLeft}</b> lượt. Đánh bài, hoặc rút để kết thúc 1 lượt.` : 'Lượt của bạn! Đánh bài (tuỳ ý), rồi rút 1 lá để kết thúc lượt.';
      btns = '<button class="gold big" data-a="draw">🃏 Rút bài</button>';
    } else if (cards.length === 1) {
      const c = cards[0];
      if (SINGLE.includes(c)) { msg = CARDS[c].desc; btns = `<button class="gold big" data-a="play">Đánh ${cname(c)}</button>`; }
      else if (CARDS[c].cat) msg = 'Lá mèo: chọn thêm lá giống nó để ghép đôi / bộ ba (Mèo Hoang thay được).';
      else if (c === 'nope') msg = '🙅 Chỉ dùng khi ai đó vừa đánh bài.';
      else msg = '🧯 Tự dùng khi bạn rút phải Mèo Nổ.';
      btns += '<button class="ghost" data-a="clear">Bỏ chọn</button>';
    } else {
      msg = kind === 'pair' ? '🐾 Ghép đôi: rút ngẫu nhiên 1 lá của người bạn chọn.'
        : kind === 'triple' ? '🐾 Bộ ba: gọi tên 1 lá, nếu người đó có thì phải đưa bạn.'
        : kind === 'five' ? '🐾 5 lá khác loại: nhặt 1 lá tuỳ ý từ chồng bỏ.'
        : 'Bộ này không hợp lệ: cần 2–3 lá giống nhau hoặc 5 lá khác loại.';
      btns = (kind ? '<button class="gold big" data-a="combo">Đánh bộ này</button>' : '') + '<button class="ghost" data-a="clear">Bỏ chọn</button>';
    }
  } else if (m >= 0 && ST.ask === m && ST.phase === 'favor') {
    status.classList.add('mine');
    msg = `🙏 ${who(ST.favor.to)} xin bài — chọn 1 lá để đưa.`;
    if (cards.length === 1) btns = `<button class="gold big" data-a="give">🎁 Đưa ${cname(cards[0])}</button>`;
  } else if (m >= 0 && ST.ask === m && ST.phase === 'bury') {
    status.classList.add('mine');
    msg = '🤫 Chọn chỗ nhét lá này lại vào chồng bài.';
    btns = '<button class="gold big" data-a="bury">📍 Chọn chỗ nhét</button>';
  } else if (m >= 0 && ST.ask === m && ST.phase === 'alter') {
    status.classList.add('mine');
    msg = '🪄 Sắp xếp lại 3 lá trên cùng.';
    btns = '<button class="gold big" data-a="alter">🪄 Cải số</button>';
  } else if (!msg && ST.phase !== 'over') msg = ST.ask != null ? `Chờ ${who(ST.ask)}...` : '';
  status.innerHTML = msg;
  acts.innerHTML = pending ? '' : btns;
}

function renderKnow() {
  const m = mySeat(), k = m >= 0 && P(m).alive && P(m).know ? P(m).know : [];
  $('#mn-know').innerHTML = k.length ? `<span class="small muted">🔮 Bạn biết từ trên xuống:</span>${k.slice(0, 6).map((c, i) => `<span class="kn${isKiller(c) ? ' bad' : ''}">${i + 1}. ${CARDS[c].icon}</span>`).join('')}` : '';
}

function renderHand() {
  const h = myHand(), key = h.join(',');
  if (key !== selKey) { sel = []; selKey = key; }
  const m = mySeat(), favor = ST.phase === 'favor' && ST.ask === m;
  const box = $('#mn-hand');
  box.classList.toggle('dim', !(canPlay() || favor || canNope()));
  box.innerHTML = h.length ? h.map((c, i) => `<button class="hc${sel.includes(i) ? ' sel' : ''}" data-i="${i}">${cardHTML(c)}</button>`).join('')
    : `<div class="muted small">${m < 0 ? '' : 'Không còn lá nào trên tay.'}</div>`;
}

function renderAll() {
  if (!ST) return;
  renderPlayers();
  renderTable();
  renderStage();
  renderKnow();
  renderHand();
  renderControls();
  syncModals();
}

// ================= HIỆU ỨNG =================
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function anchor(p) {
  if (p === mySeat() && P(p).alive) return centerOf($('#mn-hand'));
  const el = ROOT.querySelector(`.pp[data-p="${p}"]`);
  return el ? centerOf(el) : { x: innerWidth / 2, y: 60 };
}
async function fly(card, from, to, { ms = 520, delay = 0, scale = 1 } = {}) {
  if (QUICK) return;
  if (delay) await sleep(delay);
  const d = UI.el('div', 'mn-fly', cardHTML(card));
  $('.mn').appendChild(d);
  const tf = (pt, s, r) => `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%) scale(${s}) rotate(${r}deg)`;
  try {
    await d.animate([{ transform: tf(from, 0.55, -12), opacity: 0.6 }, { transform: tf(to, scale, 0), opacity: 1 }],
      { duration: ms / SPEED, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).finished;
  } finally { d.remove(); }
}
// Lá bài to giữa màn hình (rút trúng mèo, gỡ bom...).
async function spot(card, caption, cls = '', ms = 900) {
  const d = UI.el('div', 'mn-spot dark ' + cls, `${cardHTML(card, 'xl')}<div class="cap">${caption}</div>`);
  $('.mn').appendChild(d);
  await sleep(ms);
  d.classList.add('out');
  setTimeout(() => d.remove(), 300);
}
function flash(cls, ms = 600) {
  const f = $('#mn-flash');
  f.className = cls; void f.offsetWidth; f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), ms);
}
function shake(el = $('.mn-main')) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
function pulse(p, cls) {
  const el = ROOT.querySelector(`.pp[data-p="${p}"]`);
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 1200);
}
function log(html) {
  const box = $('#mn-log');
  box.appendChild(UI.el('div', 'li', html));
  while (box.children.length > 120) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

async function playEvent(e) {
  const m = mySeat(), deck = () => centerOf($('#mn-deck')), stage = () => centerOf($('#mn-stage'));
  switch (e.t) {
    case 'start':
      log('🃏 Chia bài! Ai cũng có 1 🧯 Gỡ Bom. Đừng để mình là người nổ đầu tiên...');
      S.riffle();
      break;
    case 'turn':
      ROOT.querySelectorAll('.pp.turn').forEach(x => x.classList.remove('turn'));
      ROOT.querySelector(`.pp[data-p="${e.p}"]`)?.classList.add('turn');
      log(`<span class="sep">— Lượt của ${who(e.p)}${e.turns > 1 ? ` (còn ${e.turns} lượt)` : ''} —</span>`);
      if (e.p === m) SFX.myTurn();
      break;
    case 'play': {
      const from = anchor(e.p);
      renderStage({ p: e.p, cards: e.cards, kind: e.kind, target: e.target, name: e.name, take: e.take, nopes: [] });
      S.flick();
      await Promise.all(e.cards.map((c, i) => fly(c, from, stage(), { ms: 420, delay: i * 50 })));
      const extra = e.kind === 'triple' ? ` đòi ${cname(e.name)}` : e.kind === 'five' ? ` để nhặt ${cname(e.take)}` : '';
      log(`${who(e.p)} đánh ${e.cards.map(c => CARDS[c].icon).join('')} ${e.cards.length === 1 ? CARDS[e.cards[0]].name : ''}${e.target != null ? ' → ' + who(e.target) : ''}${extra}`);
      if (e.kind === 'attack' || e.kind === 'target') say(e.p, 'attack', 0.7);
      else if (e.kind === 'favor') say(e.p, 'favor', 0.8);
      else if (e.kind === 'swap') say(e.p, 'swap', 0.8);
      else if (e.kind === 'catomic') say(e.p, 'catomic');
      else if (e.kind === 'skip') say(e.p, 'skip', 0.5);
      if (e.target != null) say(e.target, 'victim', 0.5);
      break;
    }
    case 'nope': {
      const st = $('#mn-stage .stamps');
      if (st) st.insertAdjacentHTML('beforeend', `<span class="stamp slam" style="--c:${col(e.p)};--r:${(e.n % 2 ? -1 : 1) * (6 + e.n * 3)}deg">🙅 KHÔNG! <small>${nm(e.p)}</small></span>`);
      const rs = $('#mn-stage .react');
      if (rs) { rs.classList.toggle('blocked', e.n % 2 === 1); const s = rs.querySelector('.react-state'); if (s) s.textContent = e.n % 2 ? '❌ Đang bị chặn' : '✅ Sắp có hiệu lực'; }
      S.nope(); shake();
      say(e.p, e.ghost ? 'ghost' : 'nope');
      log(`🙅 ${who(e.p)}${e.ghost ? ' (👻 hồn ma)' : ''} hô <b>KHÔNG!</b>${e.n > 1 ? ` (lần ${e.n})` : ''}`);
      await sleep(700);
      break;
    }
    case 'noped':
      log(`❌ Lá ${e.cards.map(c => CARDS[c].icon).join('')} của ${who(e.p)} đã bị chặn.`);
      $('#mn-stage .react')?.classList.add('dead');
      await sleep(500);
      break;
    case 'draw': {
      const mine = e.p === m;
      S.draw();
      await fly(mine || isKiller(e.card) ? e.card : null, deck(), isKiller(e.card) ? stage() : anchor(e.p), { ms: 450 });
      if (isKiller(e.card)) {
        S.heart();
        say(e.p, 'fear');
        log(`😱 ${who(e.p)} rút phải ${cname(e.card)}${e.bottom ? ' (từ đáy!)' : ''}!`);
        await spot(e.card, `${who(e.p)} rút phải ${CARDS[e.card].name}!`, 'danger', 450);
      } else {
        if (mine && e.card) UI.floatAt(anchor(m), `+${CARDS[e.card].icon}`);
        log(`${who(e.p)} rút 1 lá${e.bottom ? ' từ <b>đáy</b>' : ''}${mine && e.card ? `: ${cname(e.card)}` : ''}.`);
      }
      break;
    }
    case 'defuse':
      S.hiss();
      say(e.p, 'defuse');
      log(`🧯 ${who(e.p)} dùng Gỡ Bom — thoát chết!`);
      { const c = stage(); UI.burst(c.x, c.y, ['#ffffff', '#b8f5d0', '#2ec76b'], 50, 6); }
      await spot('defuse', `${who(e.p)} gỡ bom thành công!`, 'safe', 1100);
      break;
    case 'boom': {
      SFX.boom(); flash('boom', 900); shake($('.mn'));
      const c = anchor(e.p);
      UI.burst(c.x, c.y, ['#ff4d00', '#ffb000', '#ff006e', '#fff'], 120, 11);
      UI.floatAt(c, '💥 BÙM!', 'big');
      say(e.p, 'boom');
      log(`💥 <b>${nm(e.p)} NỔ TUNG!</b>${e.ghost ? ` 👻 Hồn ma giữ lại ${e.ghost} lá Không!` : ''}`);
      await spot(e.card, `💥 ${who(e.p)} đã nổ!`, 'danger', 1600);
      break;
    }
    case 'arm':
      S.ticks(5);
      log(`⏳ ${who(e.p)} kích hoạt <b>Mèo Hẹn Giờ</b>! Lần tới ai rút trúng là nổ — Gỡ Bom cũng vô dụng.`);
      await spot('timebomb', '⏳ Mèo Hẹn Giờ đã lật ngửa! Lần sau rút trúng là NỔ.', 'danger', 1300);
      break;
    case 'bury': {
      await fly(e.card === 'timebomb' || e.p === m ? e.card : null, anchor(e.p), deck(), { ms: 450 });
      const where = e.pos == null ? 'đâu đó trong chồng bài 🤫' : e.pos === 0 ? '<b>trên cùng</b>' : `vị trí thứ <b>${e.pos + 1}</b>`;
      log(`${who(e.p)} nhét ${cname(e.card)} vào ${where}.`);
      break;
    }
    case 'shuffle':
      S.riffle(); shake($('#mn-deck'));
      log(`🔀 ${who(e.p)} xáo bài.`);
      await sleep(700);
      break;
    case 'future':
      log(`🔮 ${who(e.p)} lén xem 3 lá trên cùng.`);
      if (e.cards) showFuture(e.cards);
      break;
    case 'alter': log(`🪄 ${who(e.p)} đang cải số 3 lá trên cùng...`); break;
    case 'altered': log(`🪄 ${who(e.p)} đã sắp xếp lại số phận.${e.cards ? ' Mới: ' + e.cards.map(c => CARDS[c].icon).join(' ') : ''}`); break;
    case 'favorAsk': log(`🙏 ${who(e.to)} xin bài ${who(e.from)}.`); say(e.to, 'favor', 0.6); break;
    case 'favorEmpty': log(`🙏 ${who(e.from)} không còn lá nào để cho.`); break;
    case 'give':
    case 'steal': {
      S.flick();
      await fly(e.card, anchor(e.from), anchor(e.to), { ms: 600 });
      const c = e.card ? ` ${cname(e.card)}` : ' 1 lá';
      if (e.t === 'give') log(`🎁 ${who(e.from)} đưa${c} cho ${who(e.to)}.`);
      else { log(`🐾 ${who(e.to)} lấy${c} của ${who(e.from)}.`); say(e.to, 'steal', 0.6); say(e.from, 'victim', 0.5); }
      break;
    }
    case 'stealFail': log(`🐾 ${who(e.to)} ${e.name ? `đòi ${cname(e.name)}` : 'định rút bài'} của ${who(e.from)} nhưng... không có! 😂`); await sleep(500); break;
    case 'take': await fly(e.card, centerOf($('#mn-discard')), anchor(e.p), { ms: 600 }); log(`♻️ ${who(e.p)} nhặt ${cname(e.card)} từ chồng bỏ.`); break;
    case 'takeFail': log(`♻️ ${who(e.p)} muốn nhặt ${cname(e.card)} nhưng nó không còn trong chồng bỏ.`); break;
    case 'swap':
      SFX.whoosh(); pulse(e.a, 'spin'); pulse(e.b, 'spin');
      await Promise.all([fly(null, anchor(e.a), anchor(e.b), { ms: 700 }), fly(null, anchor(e.b), anchor(e.a), { ms: 700 })]);
      log(`🎭 ${who(e.a)} và ${who(e.b)} <b>đổi phận</b> — tráo toàn bộ bài trên tay!`);
      say(e.b, 'victim');
      break;
    case 'reverse': SFX.whoosh(); log(`🔄 ${who(e.p)} đảo chiều vòng chơi ${e.dir > 0 ? '↻' : '↺'}.`); await sleep(400); break;
    case 'skip': log(`⏭️ ${who(e.p)} bỏ lượt.`); break;
    case 'attack':
      SFX.tone(300, 0.3, { type: 'square', v: 0.1, to: 80 });
      pulse(e.to, 'hit');
      UI.floatAt(anchor(e.to), `⚔️×${e.turns}`, 'big');
      log(`${e.kind === 'target' ? '🎯' : '⚔️'} ${who(e.p)} tấn công ${who(e.to)}: phải chơi <b>${e.turns} lượt</b>!`);
      say(e.to, 'victim', 0.6);
      await sleep(600);
      break;
    case 'catomic':
      S.siren(); flash('nuke', 1500); shake($('.mn'));
      log(`☢️ ${who(e.p)} kích hoạt <b>BOM TỔNG LỰC</b>! ${e.k} Mèo Nổ giờ nằm trên cùng chồng bài!`);
      await spot('catomic', `☢️ ${e.k} Mèo Nổ nằm trên cùng!`, 'danger', 1500);
      break;
    case 'win':
      SFX.win(); UI.fireworks(6, () => SFX.pop()); UI.confetti();
      say(e.p, 'win');
      log(`🏆 ${who(e.p)} là con mèo cuối cùng còn sống!`);
      await sleep(1000);
      break;
  }
}

// ================= MODAL =================
function openTagged(tag, html, forKey = '') {
  modalTag = tag; modalFor = forKey;
  return UI.openModal(`<div class="mn-m">${html}</div>`);
}
// Giữ modalFor để không tự mở lại modal cho cùng một pha (đã gửi rồi, hoặc người chơi tự đóng).
function closeTagged() { if (modalTag) { UI.closeModal(); modalTag = ''; } }
const mq = s => document.querySelector('#modal ' + s);

function showFuture(cards) {
  openTagged('future', `<h2 class="center">🔮 3 lá trên cùng</h2>
    <div class="mn-row">${cards.map((c, i) => `<div class="mn-slot"><span class="muted small">${i === 0 ? 'Trên cùng' : `Lá ${i + 1}`}</span>${cardHTML(c)}</div>`).join('')}</div>
    <p class="center muted small">${cards.some(isKiller) ? '😱 Có mèo! Tính kế đi...' : '😌 Tạm an toàn.'} Chỉ mình bạn thấy.</p>
    <div class="btns"><button class="gold" data-x>Đã nhớ 🤫</button></div>`);
  mq('[data-x]').onclick = closeTagged;
}

function phaseKey() { return `${ST.phase}:${ST.turn}:${ST.deckCount}:${ST.discard.length}`; }

function showBury() {
  const N = ST.deckCount, card = ST.bury.card, pub = card === 'timebomb';
  let pos = 0;
  openTagged('bury', `<h2 class="center">${pub ? '⏳ Nhét Mèo Hẹn Giờ' : '🤫 Lén nhét Mèo Nổ'}</h2>
    <p class="center muted small">${pub ? 'Lá này nằm <b>ngửa</b> — cả bàn sẽ thấy vị trí.' : 'Chỉ mình bạn biết vị trí. Người kế tiếp rút lá trên cùng...'}</p>
    <div class="mn-bury">
      <input type="range" min="0" max="${N}" value="0" id="mn-pos">
      <div class="center big-pos" id="mn-pos-lbl"></div>
      <div class="btns">
        <button class="ghost" data-pos="0">Trên cùng</button>
        ${N >= 1 ? '<button class="ghost" data-pos="1">Thứ 2</button>' : ''}
        ${N >= 2 ? '<button class="ghost" data-pos="2">Thứ 3</button>' : ''}
        <button class="ghost" data-pos="${N}">Dưới đáy</button>
        <button class="ghost" data-pos="rand">🎲 Ngẫu nhiên</button>
      </div>
    </div>
    <div class="btns"><button class="gold big" data-ok>📍 Nhét vào đây</button></div>`, phaseKey());
  const inp = mq('#mn-pos'), lbl = mq('#mn-pos-lbl');
  const paint = () => { lbl.innerHTML = pos === 0 ? '⬆️ Trên cùng — người rút kế tiếp sẽ trúng!' : pos >= N ? '⬇️ Dưới đáy' : `Lá thứ <b>${pos + 1}</b> từ trên xuống`; inp.value = pos; };
  inp.oninput = () => { pos = +inp.value; paint(); };
  document.querySelectorAll('#modal [data-pos]').forEach(b => { b.onclick = () => { pos = b.dataset.pos === 'rand' ? Math.floor(Math.random() * (N + 1)) : +b.dataset.pos; paint(); }; });
  mq('[data-ok]').onclick = () => { closeTagged(); send({ type: 'bury', pos }); };
  paint();
}

function showAlter() {
  const cards = ST.alter.cards.slice(), order = cards.map((c, i) => i);
  openTagged('alter', `<h2 class="center">🪄 Cải Số</h2><p class="center muted small">Bấm ◀ ▶ để đổi chỗ. Bên trái là lá trên cùng.</p>
    <div class="mn-row" id="mn-alter"></div><div class="btns"><button class="gold big" data-ok>✔️ Chốt số phận</button></div>`, phaseKey());
  const paint = () => {
    mq('#mn-alter').innerHTML = order.map((ci, i) => `<div class="mn-slot"><span class="muted small">${i === 0 ? 'Trên cùng' : `Lá ${i + 1}`}</span>${cardHTML(cards[ci])}
      <div class="mv"><button class="ghost" data-mv="${i},-1" ${i === 0 ? 'disabled' : ''}>◀</button><button class="ghost" data-mv="${i},1" ${i === order.length - 1 ? 'disabled' : ''}>▶</button></div></div>`).join('');
    document.querySelectorAll('#modal [data-mv]').forEach(b => {
      b.onclick = () => { const [i, d] = b.dataset.mv.split(',').map(Number); [order[i], order[i + d]] = [order[i + d], order[i]]; SFX.click(); paint(); };
    });
  };
  mq('[data-ok]').onclick = () => { closeTagged(); send({ type: 'order', order }); };
  paint();
}

// Đóng modal không còn hợp lệ (vd hết giờ máy đã đi giúp), mở modal khi tới lượt chọn.
function syncModals() {
  const m = mySeat();
  if (modalTag && !UI.modalOpen()) modalTag = ''; // người chơi tự đóng (Huỷ/Esc)
  if (modalTag === 'bury' || modalTag === 'alter') { if (ST.phase !== modalTag || ST.ask !== m || modalFor !== phaseKey()) closeTagged(); }
  if (modalTag === 'pick' && !canPlay()) closeTagged();
  if (modalTag === 'give' && !(ST.phase === 'favor' && ST.ask === m)) closeTagged();
  if (playing || ST.ask !== m || m < 0) return;
  if (ST.phase === 'bury' && modalFor !== phaseKey() && modalTag !== 'over') showBury();
  if (ST.phase === 'alter' && ST.alter.cards && modalFor !== phaseKey() && modalTag !== 'over') showAlter();
}

function pickTarget(title, cb) {
  const opts = others().map(p => ({ html: `${nm(p)} <small>(${P(p).count} lá)</small>`, value: p, color: col(p) }));
  if (!opts.length) return UI.toast('Không có ai để chọn');
  modalTag = 'pick';
  UI.pickModal(title, opts, v => { modalTag = ''; cb(v); });
}
function pickCard(title, list, cb) {
  modalTag = 'pick';
  UI.pickModal(title, list.map(c => ({ html: `${CARDS[c].icon}<small style="display:block;font-size:12px">${CARDS[c].name}</small>`, value: c })), v => { modalTag = ''; cb(v); });
}

function showGameOver() {
  overShown = true;
  const host = CTX.me().isHost;
  const rank = [ST.winner, ...ST.dead.slice().reverse()];
  const medal = ['🏆', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];
  openTagged('over', `<h2 class="center">🏆 ${nm(ST.winner)} sống sót!</h2>
    <ol class="rank">${rank.map((p, i) => `<li style="--c:${col(p)}"><span>${medal[i]}</span><span class="grow">${nm(p)}</span><span>${i === 0 ? '😼' : '💥'}</span></li>`).join('')}</ol>
    <div class="btns"><button class="ghost" data-a="close">👀 Xem bàn</button>
    ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}</div>`);
  const on = (a, fn) => { const b = mq(`[data-a="${a}"]`); if (b) b.onclick = () => { closeTagged(); fn(); }; };
  on('close', () => {});
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

function showHelp() {
  const list = ORDER.filter(c => !CARDS[c].cat || c === 'taco').filter(c => ST && (ST.chaos || !CARDS[c].chaos))
    .map(c => `<li>${CARDS[c].icon} <b>${CARDS[c].cat ? 'Lá mèo (🌮🍉🥔🧔🌈' + (ST.chaos ? '🐈' : '') + ')' : CARDS[c].name}</b> — ${CARDS[c].desc}</li>`).join('');
  openTagged('help', `<div class="help">
    <h2>📖 Luật chơi — Mèo Nổ</h2>
    <h3>Cơ bản</h3><ul>
      <li>Đến lượt: đánh bao nhiêu lá tuỳ thích (hoặc không đánh), rồi <b>rút 1 lá</b> để kết thúc lượt.</li>
      <li>Rút phải 💣 <b>Mèo Nổ</b> mà không có 🧯 <b>Gỡ Bom</b> → nổ, bị loại. Có Gỡ Bom thì thoát, rồi lén nhét Mèo Nổ lại vào chồng bài chỗ nào tuỳ bạn.</li>
      <li>Mỗi lá vừa đánh có vài giây để bất kỳ ai hô 🙅 <b>Không!</b> (bấm nút hoặc phím <b>N</b>). "Không!" chồng "Không!" thì huỷ nhau.</li>
      <li><b>Combo:</b> 2 lá giống nhau → rút ngẫu nhiên 1 lá của người khác. 3 lá giống nhau → gọi tên 1 lá, người đó có thì phải đưa. 5 lá khác loại → nhặt 1 lá tuỳ ý từ chồng bỏ.</li>
      <li>Người cuối cùng còn sống thắng. Mỗi lượt có ${Math.round(CTX.room().turnMs / 1000)} giây — hết giờ máy sẽ rút giúp.</li>
      ${ST && ST.chaos ? '<li>👻 <b>Hồn ma:</b> người đã nổ vẫn giữ các lá Không! và dùng được để phá người còn sống.</li>' : ''}
    </ul>
    <h3>🃏 Các lá bài</h3><ul>${list}</ul>
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Hiểu rồi, chơi thôi!</button></div></div>`);
  mq('[data-x]').onclick = closeTagged;
}

// ================= ĐIỀU KHIỂN =================
function send(action) {
  pending = true;
  if (ST) renderControls();
  return CTX.send(action).then(r => { pending = false; if (ST && !playing) renderAll(); return r; });
}

function onHandClick(i) {
  const m = mySeat(), h = myHand(), c = h[i];
  if (ST.phase === 'react' && c === 'nope' && canNope()) return doNope();
  const favor = ST.phase === 'favor' && ST.ask === m;
  if (!canPlay() && !favor) return;
  SFX.click();
  if (favor) sel = sel[0] === i ? [] : [i];
  else sel = sel.includes(i) ? sel.filter(x => x !== i) : sel.concat(i);
  renderHand(); renderControls(); renderTable();
}

function doDraw() {
  if (!canPlay()) return;
  sel = [];
  SFX.ac();
  send({ type: 'draw' });
}
function doNope() { if (canNope()) send({ type: 'nope' }); }

function doPlay() {
  const cards = selection();
  if (!canPlay() || cards.length !== 1) return;
  const c = cards[0];
  const go = target => { sel = []; send(target == null ? { type: 'play', card: c } : { type: 'play', card: c, target }); };
  if (!TARGETED.includes(c)) return go(null);
  pickTarget({ favor: '🙏 Xin bài ai?', swap: '🎭 Đổi phận với ai?', target: '🎯 Ai phải lãnh 2 lượt?' }[c], go);
}

function doCombo() {
  const cards = selection(), kind = comboKind(cards);
  if (!canPlay() || !kind) return;
  const go = extra => { sel = []; send({ type: 'combo', cards, ...extra }); };
  if (kind === 'five') {
    const pool = [...new Set(ST.discard.concat(cards))].filter(c => !isKiller(c)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return pickCard('♻️ Nhặt lá nào từ chồng bỏ?', pool, take => go({ take }));
  }
  pickTarget(kind === 'pair' ? '🐾 Rút bài của ai?' : '🐾 Đòi bài của ai?', target => {
    if (kind === 'pair') return go({ target });
    const names = ORDER.filter(c => !isKiller(c) && (ST.chaos || !CARDS[c].chaos));
    pickCard(`🐾 Đòi ${nm(target)} lá gì?`, names, name => go({ target, name }));
  });
}

function onAction(a) {
  if (a === 'draw') doDraw();
  else if (a === 'nope') doNope();
  else if (a === 'play') doPlay();
  else if (a === 'combo') doCombo();
  else if (a === 'clear') { sel = []; renderHand(); renderControls(); renderTable(); }
  else if (a === 'give') { const c = selection()[0]; if (c) { sel = []; send({ type: 'give', card: c }); } }
  else if (a === 'bury') showBury();
  else if (a === 'alter') showAlter();
}

function tickTimers() {
  if (!ST) return;
  const now = Date.now(), turnMs = CTX.room().turnMs;
  const rb = $('#mn-react-bar');
  if (rb) {
    const rem = Math.max(0, reactEnd - now);
    rb.style.width = (playing ? 100 : rem / ST.nopeMs * 100) + '%';
  }
  const rem = deadline ? deadline - now : 0;
  const frac = !deadline || playing ? 0 : Math.max(0, Math.min(1, rem / turnMs));
  ROOT.querySelectorAll('.pp .pp-timer i').forEach(i => { i.style.width = '0'; });
  const askEl = ST.ask != null && ST.phase !== 'react' ? ROOT.querySelector(`.pp[data-p="${ST.ask}"] .pp-timer i`) : null;
  if (askEl) askEl.style.width = frac * 100 + '%';
  const mine = ST.ask === mySeat() && ST.phase !== 'react';
  const tb = $('#mn-timer');
  tb.style.width = (mine ? frac * 100 : 0) + '%';
  tb.classList.toggle('low', rem < 8000);
  if (mine && rem > 0 && rem < 5000 && Math.floor(rem / 1000) !== tb._s) { tb._s = Math.floor(rem / 1000); SFX.tick(); }
}

// ================= VÒNG ĐỜI =================
async function update(msg, { backlog = 0, hidden = false } = {}) {
  SPEED = backlog >= 3 ? 4 : backlog >= 1 ? 1.8 : 1;
  if (!ST) { ST = msg.state; renderAll(); }
  playing = true;
  // Tab ẩn: không animation (trình duyệt có thể dừng hẳn animation), chỉ ghi nhật ký.
  QUICK = hidden;
  if (hidden) SPEED = 100;
  for (const e of msg.events) { try { await playEvent(e); } catch (err) { console.error(err); } }
  QUICK = false;
  if (msg.meta && msg.meta.auto != null) log(`⏱️ ${nm(msg.meta.auto)} hết giờ — máy đi giúp.`);
  playing = false;
  SPEED = 1;
  ST = msg.state;
  deadline = msg.deadlineIn ? msg.recvAt + msg.deadlineIn : 0;
  if (ST.react) {
    const k = ST.react.id + ':' + ST.react.nopes.length;
    if (k !== reactKey) { reactKey = k; reactEnd = Date.now() + ST.nopeMs; }
  }
  renderAll();
  if (ST.phase === 'over' && !overShown) setTimeout(showGameOver, 1200);
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root; SEATS = ctx.game.seats;
    ST = null; sel = []; selKey = ''; pending = false; playing = false; SPEED = 1;
    reactEnd = 0; reactKey = ''; deadline = 0; overShown = false; modalTag = ''; modalFor = '';
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    UI.emoteBar($('#mn-emotes'));
    UI.toolbar($('#mn-tools'), { help: showHelp });
    $('#mn-hand').addEventListener('click', e => { const b = e.target.closest('.hc'); if (b) onHandClick(+b.dataset.i); });
    $('#mn-actions').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) onAction(b.dataset.a); });
    $('#mn-deck').addEventListener('click', () => { if (!sel.length) doDraw(); });
    keyHandler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') doNope();
      else if ((e.key === 'd' || e.key === 'D' || e.code === 'Space') && !UI.modalOpen()) { e.preventDefault(); if (!sel.length) doDraw(); }
      else if (e.key === 'Escape' && sel.length) { sel = []; renderAll(); }
    };
    addEventListener('keydown', keyHandler);
    timerInt = setInterval(tickTimers, 100);
    return {
      update,
      onRoom: () => { if (ST && !playing) renderPlayers(); },
      emoteAnchor: seat => (ST && seat >= 0 && ST.players[seat] && ST.players[seat].active ? anchor(seat) : null),
      unmount() { clearInterval(timerInt); removeEventListener('keydown', keyHandler); ST = null; },
    };
  },
};
