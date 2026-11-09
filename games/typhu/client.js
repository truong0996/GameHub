// 🎩 Cờ Tỷ Phú — giao diện client. Xem "Game client interface" trong CLAUDE.md.
// V = bản trạng thái để VẼ: trong lúc diễn sự kiện, V được cập nhật dần theo từng sự kiện; diễn xong thì thay bằng state thật từ server.
import {
  boardOf, cellIcon, isProp, GROUPS, CARDS, DECK_NAME, SKILLS, EVENTS, SALARY, BAIL, MIN_BID, BUYOUT_X, EVENT_EVERY, STEP_MS,
  hasSet, setsOf, houseCost, buyoutPrice, rentOf, worth,
} from './data.js';

let CTX, UI, SFX, ROOT, V, SEATS, BOARD;
let pending = false, playing = false, SPEED = 1, QUICK = false, deadline = 0, overShown = false, timerInt = 0, keyHandler = null;
let mode = null, lastDecider = null, clockOff = 0, built = false;

const $ = s => ROOT.querySelector(s);
const sleep = ms => (QUICK ? Promise.resolve() : new Promise(r => setTimeout(r, ms / SPEED)));
const mySeat = () => CTX.me().seat;
const P = p => V.players[p];
const col = p => (SEATS[p] ? SEATS[p].color : '#888');
const nm = p => UI.esc(P(p) && P(p).name ? P(p).name : SEATS[p].name);
const who = p => `<b class="pn" style="--c:${col(p)}">${nm(p)}</b>`;
const alive = () => V.players.map((pl, i) => (pl.on ? i : -1)).filter(i => i >= 0);
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const cellName = i => `<b class="cn" style="--g:${BOARD[i].g ? GROUPS[BOARD[i].g].c : 'transparent'}">${UI.esc(BOARD[i].name)}</b>`;
const skillName = k => (SKILLS[k] ? `${SKILLS[k].icon} <b>${SKILLS[k].name}</b>` : '🃏 <b>thẻ kỹ năng</b>');
const decider = () => (!V || V.phase === 'over' ? null : V.phase === 'auction' ? null : V.cur);
const myAuction = () => V.phase === 'auction' && V.auc && mySeat() >= 0 && P(mySeat()).on && !(mySeat() in V.auc.bids) && P(mySeat()).cash >= MIN_BID;
const canAct = () => !!V && !pending && !playing && V.phase !== 'over' && mySeat() >= 0 && (V.phase === 'auction' ? myAuction() : V.cur === mySeat());

// ================= LỜI THOẠI =================
const SAY = {
  buy: ['Của tui rồi!', 'Chốt đơn!', 'Mua luôn!', 'Đất đẹp 😎'],
  rent: ['Đắt quá trời 😭', 'Cướp à?!', 'Ối ví tôi...', 'Trả thì trả!'],
  jail: ['Oan quá!', 'Cho tui ra 😭', 'Lại vào tù...'],
  buyout: ['Xin lỗi nha 😏', 'Giờ là của tui!', 'Tiền nhiều để làm gì?'],
  lost: ['Đất của tui mà!', 'Ơ kìa!!', 'Cướp ngày!'],
  dbl: ['Đôi!', 'Hên ghê!', 'Đi tiếp!'],
  win: ['Tỷ phú là đây! 🏆', 'Dễ mà 😎'],
};
function say(p, kind, prob = 1) {
  if (p == null || QUICK || Math.random() > prob) return;
  const tk = tokenEl(p);
  if (!tk) return;
  const r = tk.getBoundingClientRect(), d = UI.el('div', 'say', UI.esc(UI.pick(SAY[kind])));
  d.style.left = r.left + r.width / 2 + 'px';
  d.style.top = r.top + 'px';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 4300);
}

// ================= ÂM THANH =================
const S = {
  dice() { for (let i = 0; i < 7; i++) SFX.noise(0.05, { v: 0.28, f: 1800 + Math.random() * 2400, q: 3, delay: i * 0.09 + Math.random() * 0.03 }); },
  hop(i) { SFX.tone(440 + (i % 8) * 30, 0.06, { type: 'square', v: 0.035, to: 640 + (i % 8) * 30 }); },
  coin() { SFX.tone(1320, 0.07, { type: 'square', v: 0.05 }); SFX.tone(1760, 0.16, { type: 'square', v: 0.05, delay: 0.07 }); },
  pay() { SFX.tone(660, 0.1, { type: 'triangle', v: 0.1, to: 440 }); SFX.tone(440, 0.16, { type: 'triangle', v: 0.08, to: 300, delay: 0.09 }); },
  build() { for (let i = 0; i < 3; i++) SFX.noise(0.05, { v: 0.35, f: 900, delay: i * 0.11 }); },
  jail() { SFX.tone(196, 0.5, { type: 'sawtooth', v: 0.1, to: 98 }); SFX.noise(0.25, { v: 0.3, f: 300, ft: 'lowpass', delay: 0.05 }); },
  magic() { [660, 880, 1320, 1760].forEach((f, i) => SFX.tone(f, 0.22, { v: 0.06, delay: i * 0.06 })); },
  boom() { SFX.noise(0.4, { v: 0.5, f: 250, ft: 'lowpass' }); SFX.tone(160, 0.4, { type: 'sawtooth', v: 0.12, to: 40 }); },
};

// ================= HÌNH HỌC BÀN =================
// Lưới 11×11: góc rộng 1.5 đơn vị, ô thường 1 đơn vị → cả cạnh 12 đơn vị. Ô 0 ở góc dưới-phải, đi ngược chiều kim đồng hồ.
function rc(i) {
  if (i <= 10) return { r: 11, c: 11 - i, s: 'b' };
  if (i < 20) return { r: 21 - i, c: 1, s: 'l' };
  if (i <= 30) return { r: 1, c: i - 19, s: 't' };
  return { r: i - 29, c: 11, s: 'r' };
}
const lineStart = k => (k === 1 ? 0 : 1.5 + (k - 2));
const lineSize = k => (k === 1 || k === 11 ? 1.5 : 1);
function cellCenter(i) {
  const { r, c } = rc(i);
  return { x: (lineStart(c) + lineSize(c) / 2) / 12 * 100, y: (lineStart(r) + lineSize(r) / 2) / 12 * 100 };
}
const SLOTS = [[0, 0], [-1.7, -1.5], [1.7, -1.5], [-1.7, 1.6], [1.7, 1.6], [0, 2.4]];

// ================= VẼ =================
const TEMPLATE = `<div class="tp">
  <div class="tp-main">
    <div class="tp-board">
      <div class="tp-center dark">
        <div class="tp-head"><span id="tp-round"></span><span id="tp-clock"></span><span id="tp-pot"></span></div>
        <div id="tp-event"></div>
        <div class="tp-mid">
          <div class="tp-dice"><div class="die lk-df" id="die0"></div><div class="die lk-df" id="die1"></div></div>
          <div id="tp-status"></div>
        </div>
        <div class="tp-timer"><i id="tp-timer"></i></div>
        <div id="tp-acts"></div>
        <div id="tp-hand"></div>
      </div>
      <div class="tp-tokens"></div>
      <div id="tp-spot"></div>
    </div>
  </div>
  <aside class="tp-side">
    <div class="tp-shead"><b>🎩 Cờ Tỷ Phú</b><span id="tp-mode" class="muted small"></span></div>
    <div id="tp-players"></div>
    <div id="tp-log"></div>
    <div id="tp-emotes"></div>
    <div id="tp-tools"></div>
  </aside>
</div>`;

function buildBoard() {
  BOARD = boardOf(V.chaos);
  const bd = $('.tp-board');
  bd.querySelectorAll('.cell').forEach(e => e.remove());
  BOARD.forEach((c, i) => {
    const { r, c: cc, s } = rc(i), corner = i % 10 === 0;
    const d = UI.el('div', `cell s-${s} k-${c.k}${corner ? ' corner' : ''}`);
    d.dataset.i = i;
    d.style.gridArea = `${r} / ${cc}`;
    if (c.g) d.style.setProperty('--g', GROUPS[c.g].c);
    d.innerHTML = c.k === 'p'
      ? `<div class="strip"><span class="hs"></span></div><div class="nm">${UI.esc(c.name)}</div><div class="pr"></div>`
      : `<div class="ic">${cellIcon(c, V.chaos)}</div><div class="nm">${UI.esc(c.name.replace(/^Sân bay /, ''))}</div><div class="pr"></div>`;
    bd.appendChild(d);
  });
  $('.tp-tokens').innerHTML = alive().map(p => `<div class="tk" data-p="${p}" style="--c:${col(p)}">${SEATS[p].label}</div>`).join('');
  built = true;
}

function renderBoard() {
  const ok = selectable();
  ROOT.querySelectorAll('.tp-board .cell').forEach(d => {
    const i = +d.dataset.i, c = BOARD[i], o = V.own[i];
    d.classList.toggle('owned', o != null);
    if (o != null) d.style.setProperty('--o', col(o)); else d.style.removeProperty('--o');
    d.classList.toggle('fest', alive().some(p => P(p).fest === i && o === p));
    d.classList.toggle('sel', ok.has(i));
    d.classList.toggle('dim', mode != null && !ok.has(i));
    d.classList.toggle('tour', !!V.ev && V.ev.k === 'tour' && V.ev.g === c.g);
    const pr = d.querySelector('.pr');
    if (isProp(c)) pr.textContent = o == null ? money(c.price) : money(rentOf(V, i, 7));
    else if (c.k === 'tax') pr.textContent = money(c.amt);
    else if (c.k === 'park' && V.chaos) pr.textContent = V.pot ? money(V.pot) : '';
    const hs = d.querySelector('.hs');
    if (hs) hs.innerHTML = V.lv[i] === 5 ? '<i class="hotel"></i>' : '<i class="house"></i>'.repeat(V.lv[i]);
  });
  placeTokens();
}

function placeTokens() {
  const at = {};
  for (const p of alive()) (at[P(p).pos] = at[P(p).pos] || []).push(p);
  for (const p of alive()) {
    const el = tokenEl(p), pos = P(p).pos, k = at[pos].indexOf(p), c = cellCenter(pos), n = at[pos].length;
    const [dx, dy] = n === 1 ? [0, 0] : SLOTS[k % SLOTS.length];
    el.style.left = c.x + dx + '%';
    el.style.top = c.y + dy + '%';
    el.classList.toggle('jailed', !!P(p).jail);
    el.classList.toggle('cur', p === V.cur && V.phase !== 'over');
  }
}
const tokenEl = p => ROOT.querySelector(`.tk[data-p="${p}"]`);

const FACES = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function setDie(k, v) { $('#die' + k).innerHTML = Array.from({ length: 9 }, (_, j) => `<i class="${FACES[v].includes(j) ? 'on pip' : ''}"></i>`).join(''); }

function renderPlayers() {
  const box = $('#tp-players'), m = mySeat(), room = CTX.room(), dec = decider();
  const rank = alive().map(p => ({ p, w: worth(V, p) })).sort((a, b) => b.w - a.w);
  box.innerHTML = alive().map(p => {
    const pl = P(p), w = worth(V, p);
    const off = room && room.seats[p] && room.seats[p].kind === 'human' && !room.seats[p].online;
    const props = BOARD.map((c, i) => (V.own[i] === p ? i : -1)).filter(i => i >= 0)
      .map(i => `<i class="pp k-${BOARD[i].k}" style="--g:${BOARD[i].g ? GROUPS[BOARD[i].g].c : '#777'}" title="${UI.esc(BOARD[i].name)}">${V.lv[i] ? (V.lv[i] === 5 ? 'H' : V.lv[i]) : BOARD[i].k === 'r' ? '✈' : BOARD[i].k === 'u' ? '⚡' : ''}</i>`).join('');
    const sets = setsOf(V, p).length;
    const badges = [pl.jail ? '🔒' : '', pl.jailCards ? `🔑${pl.jailCards > 1 ? '×' + pl.jailCards : ''}` : '', pl.stock ? `📈${money(pl.stock)}` : '',
      pl.hand.length ? `🃏${pl.hand.length}` : '', sets ? `<span title="Số bộ màu đủ">🏘️${sets}</span>` : ''].filter(Boolean).join(' ');
    const auc = V.phase === 'auction' && V.auc ? (p in V.auc.bids ? ' ✔' : pl.cash >= MIN_BID ? ' ⏳' : '') : '';
    return `<div class="pl${p === m ? ' me' : ''}${p === dec ? ' turn' : ''}" data-p="${p}" style="--c:${col(p)}">
      <div class="av">${SEATS[p].label}</div>
      <div class="pl-main">
        <div class="pl-name">${pl.kind === 'bot' ? '🤖 ' : ''}${nm(p)}${p === m ? ' <span class="tag">bạn</span>' : ''}${off ? ' 📴' : ''}${auc}${rank[0].p === p && rank[0].w > (rank[1] || { w: 0 }).w ? ' 👑' : ''}</div>
        <div class="pl-props">${props || '<span class="muted small">chưa có đất</span>'}</div>
      </div>
      <div class="pl-money"><b>${money(pl.cash)}</b><small title="Tổng tài sản">∑ ${money(w)}</small><small>${badges}</small></div>
      <div class="pl-timer"><i></i></div>
    </div>`;
  }).join('');
}

function renderHead() {
  $('#tp-round').innerHTML = `Vòng <b>${V.round}</b>`;
  $('#tp-pot').innerHTML = V.chaos ? `🍯 <b>${money(V.pot)}</b>` : '';
  const E = V.ev && EVENTS[V.ev.k];
  $('#tp-event').innerHTML = E ? `<span class="ev-ic">${E.icon}</span><span><b>${E.name}</b> <small>${E.desc}${V.ev.g ? ` (nhóm <b style="color:${GROUPS[V.ev.g].c}">${GROUPS[V.ev.g].name}</b>)` : ''}</small></span>`
    : V.chaos && V.phase !== 'over' ? `<small class="muted">Biến cố tiếp theo: vòng ${Math.ceil((V.round + 1) / EVENT_EVERY) * EVENT_EVERY}</small>` : '';
  tickClock();
}
function tickClock() {
  if (!V) return;
  const el = $('#tp-clock');
  if (V.phase === 'over') { el.textContent = '🏁 Hết ván'; return; }
  const left = V.endAt - (Date.now() - clockOff);
  if (left <= 0) { el.innerHTML = '⏰ <b>Vòng cuối!</b>'; el.classList.add('low'); return; }
  const s = Math.ceil(left / 1000);
  el.innerHTML = `⏱️ <b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b>`;
  el.classList.toggle('low', left < 120000);
}

function renderHand() {
  const m = mySeat(), box = $('#tp-hand');
  if (m < 0 || !P(m).on || !V.chaos) { box.innerHTML = ''; return; }
  const pl = P(m), usable = canAct() && V.phase === 'roll';
  box.innerHTML = pl.hand.length ? pl.hand.map((k, j) => {
    const S2 = SKILLS[k];
    if (!S2) return '';
    return `<button class="sk${S2.pre && usable ? ' use' : ''}" data-sk="${k}" data-j="${j}" title="${UI.esc(S2.desc)}" ${S2.pre && usable ? '' : 'aria-disabled="true"'}>${S2.icon} ${S2.name}</button>`;
  }).join('') : '<span class="muted small">Chưa có thẻ kỹ năng</span>';
}

// Ô nào được chọn trong chế độ chọn ô hiện tại.
function selectable() {
  const s = new Set(), m = mySeat();
  if (!mode || !V || m < 0) return s;
  for (let i = 0; i < 40; i++) {
    const c = BOARD[i];
    if (mode === 'build' && c.k === 'p' && V.own[i] === m && hasSet(V, m, c.g) && V.lv[i] < 5 && P(m).cash >= houseCost(V, i)) s.add(i);
    if (mode === 'bomb' && V.own[i] != null && V.own[i] !== m && V.lv[i] > 0) s.add(i);
    if (mode === 'fest' && c.k === 'p' && V.own[i] === m) s.add(i);
    if (mode === 'train' && i !== P(m).pos && !['tojail', 'train'].includes(c.k)) s.add(i);
  }
  return s;
}
function setMode(m) { mode = m; renderBoard(); renderControls(); }

function btn(label, act, cls = '') { return `<button class="${cls}" data-act='${JSON.stringify(act)}'>${label}</button>`; }

function renderControls() {
  const m = mySeat(), st = $('#tp-status'), acts = $('#tp-acts');
  let msg = '', b = '';
  st.classList.remove('mine');
  if (V.phase === 'over') {
    msg = V.winners.includes(m) ? '🏆 <b>Bạn thắng!</b>' : `🏁 ${V.winners.map(who).join(', ')} thắng!`;
    b = `<button class="gold" data-ui="over">📊 Xem kết quả</button>`;
  } else if (playing) { acts.innerHTML = ''; renderHand(); return; }
  else if (V.phase === 'auction' && V.auc) {
    const c = BOARD[V.auc.cell], done = alive().filter(p => p in V.auc.bids);
    msg = `🔨 ${V.auc.flash ? '<b>Đấu Giá Chớp Nhoáng</b>: ' : 'Đấu giá kín '}${cellName(V.auc.cell)} <small>(giá gốc ${money(c.price)})</small><br><small>Mỗi người đặt giá một lần, không ai thấy giá của ai. Cao nhất thắng.${done.length ? ` Đã đặt: ${done.map(who).join(', ')}` : ''}</small>`;
    if (myAuction()) {
      st.classList.add('mine');
      const cash = P(m).cash, q = [0.5, 0.8, 1, 1.3].map(f => Math.min(cash, Math.round(c.price * f / 10) * 10)).filter((v, j, a) => v >= MIN_BID && a.indexOf(v) === j);
      b = `<div class="bid"><input id="tp-bid" type="number" min="${MIN_BID}" max="${cash}" step="10" value="${Math.min(cash, Math.round(c.price * 0.8 / 10) * 10)}">
        ${q.map(v => `<button class="chip" data-bid="${v}">${money(v)}</button>`).join('')}</div>
        <button class="gold" data-ui="bid">🔨 Đặt giá</button>${btn('Bỏ qua', { type: 'bid', amt: 0 }, 'ghost')}`;
    } else if (m >= 0 && V.auc.bids[m] != null && V.auc.bids[m] >= 0) msg += `<br>Bạn đã đặt <b>${money(V.auc.bids[m])}</b>${V.auc.bids[m] ? '' : ' (bỏ qua)'} — chờ người khác...`;
  } else if (V.cur !== m || m < 0) {
    const p = V.cur, pd = V.pend;
    const doing = {
      jail: () => `🔒 ${who(p)} đang tìm cách ra tù...`,
      buy: () => `${who(p)} đang cân nhắc mua ${cellName(pd.cell)} (${money(BOARD[pd.cell].price)})...`,
      rent: () => `${who(p)} phải trả ${money(pd.amt)} cho ${who(pd.to)}...`,
      buyout: () => `${who(p)} có thể mua lại ${cellName(pd.cell)} của ${who(pd.to)} với giá ${money(pd.amt)}...`,
      casino: () => `🎰 ${who(p)} đang ở Sòng Bạc...`,
      stock: () => `📈 ${who(p)} đang ở Sàn Chứng Khoán...`,
      train: () => `🚄 ${who(p)} đang chọn điểm đến...`,
    }[V.phase];
    msg = doing && (pd || !['buy', 'rent', 'buyout'].includes(V.phase)) ? doing() : `Lượt của ${who(p)}...`;
    if (m < 0) msg = '👀 ' + msg;
  } else {
    st.classList.add('mine');
    const pl = P(m), pd = V.pend;
    switch (V.phase) {
      case 'roll': {
        const canBuild = setsOf(V, m).length > 0;
        msg = mode === 'build' ? '🏠 Chạm ô sáng để xây 1 nhà (5 nhà = khách sạn).' : mode === 'bomb' ? '💣 Chạm một ô có nhà của đối thủ để phá.'
          : mode === 'fest' ? '🎉 Chạm một ô đất của bạn để mở lễ hội (tiền thuê ×2).' : '🎲 Đến lượt bạn!' + (canBuild ? ' <small>Có thể xây nhà trước khi đổ.</small>' : '');
        b = mode ? `<button class="ghost" data-ui="cancel">✖ Xong</button>`
          : btn('🎲 Đổ xúc xắc <small>(Space)</small>', { type: 'roll' }, 'gold big') + (canBuild ? `<button data-ui="build">🏠 Xây nhà</button>` : '');
        break;
      }
      case 'jail':
        msg = '🔒 Bạn đang ở tù. Đổ được đôi thì ra và đi luôn; không được thì ngồi lượt này, lượt sau tự do.';
        b = btn('🎲 Thử đổ đôi', { type: 'roll' }, 'gold') + (pl.cash >= BAIL ? btn(`💵 Nộp ${money(BAIL)}`, { type: 'bail' }) : '') + (pl.jailCards ? btn('🔑 Dùng Thẻ Ra Tù', { type: 'jailcard' }) : '');
        break;
      case 'buy': {
        const c = BOARD[pd.cell];
        msg = `Mua ${cellName(pd.cell)} giá <b>${money(c.price)}</b>? <small>Tiền thuê ${c.k === 'p' ? money(c.rent[0]) + (wouldSet(m, pd.cell) ? ' — <b>đủ bộ màu!</b>' : '') : c.k === 'r' ? 'theo số sân bay' : '×xúc xắc'} · Bỏ qua thì đem ra đấu giá.</small>`;
        b = btn(`💰 Mua ${money(c.price)}`, { type: 'buy' }, 'gold big') + btn('🔨 Đấu giá', { type: 'pass' }, 'ghost');
        break;
      }
      case 'rent':
        msg = `Bạn phải trả <b>${money(pd.amt)}</b> tiền thuê ${cellName(pd.cell)} cho ${who(pd.to)}.`;
        b = btn(`💸 Trả ${money(pd.amt)}`, { type: 'pay' }) + btn('🛡️ Dùng Miễn Thuê', { type: 'shield' }, 'gold');
        break;
      case 'buyout':
        msg = `Mua lại ${cellName(pd.cell)}${V.lv[pd.cell] ? ` (kèm ${V.lv[pd.cell]} nhà)` : ''} của ${who(pd.to)} với giá <b>${money(pd.amt)}</b> (×${BUYOUT_X})?${wouldSet(m, pd.cell) ? ' <b>Đủ bộ màu!</b>' : ''}`;
        b = btn(`🤝 Mua lại ${money(pd.amt)}`, { type: 'buyout' }, 'gold') + btn('Thôi', { type: 'skip' }, 'ghost');
        break;
      case 'casino':
        msg = '🎰 Sòng Bạc! 50% thắng gấp đôi — thua thì tiền vào Hũ Vàng.';
        b = btn('Không chơi', { type: 'bet', amt: 0 }, 'ghost') + btn('Cược $100', { type: 'bet', amt: 100 }) + (pl.cash >= 300 ? btn('Cược $300', { type: 'bet', amt: 300 }, 'gold') : '');
        break;
      case 'stock':
        msg = '📈 Sàn Chứng Khoán: đầu tư bây giờ, lần tới qua Xuất Phát nhận lại ×0 đến ×3.';
        b = btn('Không', { type: 'invest', amt: 0 }, 'ghost') + btn('Đầu tư $100', { type: 'invest', amt: 100 }) + (pl.cash >= 200 ? btn('Đầu tư $200', { type: 'invest', amt: 200 }, 'gold') : '');
        break;
      case 'train':
        if (mode !== 'train') { mode = 'train'; renderBoard(); }
        msg = '🚄 Chạm một ô trên bàn để tới ngay (qua Xuất Phát vẫn nhận lương).';
        b = btn('Ở lại', { type: 'train', to: -1 }, 'ghost');
        break;
    }
  }
  st.innerHTML = msg || '&nbsp;';
  acts.innerHTML = b;
  const can = canAct();
  acts.querySelectorAll('button, input').forEach(x => { x.disabled = x.dataset.ui !== 'over' && !can; });
  renderHand();
}
const wouldSet = (p, i) => { const c = BOARD[i]; if (c.k !== 'p') return false; const own = V.own.slice(); own[i] = p; return hasSet({ ...V, own }, p, c.g); };

function renderAll() {
  if (!V) return;
  if (!built) buildBoard();
  if (mode && !(canAct() && (V.phase === 'roll' || (mode === 'train' && V.phase === 'train')))) mode = null;
  renderBoard();
  renderPlayers();
  renderHead();
  renderControls();
  $('#tp-mode').textContent = (V.chaos ? '🎁 Bất Ngờ' : '😇 Cổ điển') + ` · ${V.minutes} phút`;
}

// ================= HIỆU ỨNG =================
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
const cellPt = i => centerOf(ROOT.querySelector(`.cell[data-i="${i}"]`));
const tokenPt = p => (tokenEl(p) ? centerOf(tokenEl(p)) : { x: innerWidth / 2, y: 80 });
function float(p, html, cls = '') { if (!QUICK) UI.floatAt(tokenPt(p), html, cls); }
async function spot(html, ms = 1500, cls = '') {
  if (QUICK) return;
  const box = $('#tp-spot'), d = UI.el('div', 'sp ' + cls, html);
  box.appendChild(d);
  await sleep(ms);
  d.classList.add('out');
  setTimeout(() => d.remove(), 300);
}
function pulseCell(i, cls = 'hit') {
  const d = ROOT.querySelector(`.cell[data-i="${i}"]`);
  if (!d) return;
  d.classList.remove(cls); void d.offsetWidth; d.classList.add(cls);
  setTimeout(() => d.classList.remove(cls), 1300);
}
function log(html) {
  const box = $('#tp-log');
  box.appendChild(UI.el('div', 'li', html));
  while (box.children.length > 200) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  if (playing && !html.includes('class="sep"')) { const st = $('#tp-status'); st.classList.remove('mine'); st.innerHTML = html; }
}
function addCash(p, amt) { if (p != null && p >= 0 && P(p)) P(p).cash += amt; }
const quick = () => { renderBoard(); renderPlayers(); renderHead(); };

async function rollDice(d, p) {
  if (p != null) CTX.skin.set($('.tp-dice'), p, 'dice');   // xúc xắc người đổ mua ở cửa hàng
  S.dice();
  if (!QUICK) {
    $('.tp-dice').classList.add('rolling');
    for (let k = 0; k < 6; k++) { if (!V) return; setDie(0, 1 + Math.floor(Math.random() * 6)); setDie(1, 1 + Math.floor(Math.random() * 6)); await sleep(90); }
    $('.tp-dice').classList.remove('rolling');
  }
  setDie(0, d[0]); setDie(1, d[1]);
  await sleep(250);
}

async function walk(p, from, n) {
  const dir = Math.sign(n);
  for (let k = 1; k <= Math.abs(n); k++) {
    if (!V) return;
    P(p).pos = (from + dir * k + 40) % 40;
    placeTokens();
    S.hop(k);
    await sleep(STEP_MS);
  }
}

const PAY_WHY = { rent: 'tiền thuê', tax: 'thuế', card: '', bail: 'tiền nộp phạt ra tù', robin: '(Robin Hood)' };

async function playEvent(e) {
  const m = mySeat();
  switch (e.t) {
    case 'start':
      log(`🎩 Bắt đầu! Ván dài tối đa <b>${V.minutes} phút</b> — hết giờ (hoặc có người phá sản) thì ai có tổng tài sản lớn nhất thắng.${V.instant ? ' Gom đủ <b>3 bộ màu</b> là thắng ngay!' : ''}`);
      break;
    case 'deal': {
      for (const [p, cells] of Object.entries(e.got)) for (const i of cells) V.own[i] = +p;
      SFX.card();
      quick();
      log(`🎁 Chia đất đầu ván: ${Object.entries(e.got).map(([p, cells]) => `${who(+p)} ${cells.map(cellName).join(', ')}`).join(' · ')}`);
      await sleep(1600);
      break;
    }
    case 'turn':
      V.cur = e.p;
      V.phase = P(e.p).jail ? 'jail' : 'roll';
      placeTokens(); renderPlayers();
      break;
    case 'again':
      say(e.p, 'dbl', 0.4);
      log(`🎲 ${who(e.p)} đổ đôi — được đổ tiếp!`);
      await sleep(300);
      break;
    case 'dice':
      await rollDice(e.d, e.p);
      log(`🎲 ${who(e.p)} ${e.fixed ? 'dùng 🎯 chọn' : 'đổ'} <b>${e.d[0]} + ${e.d[1]} = ${e.d[0] + e.d[1]}</b>${e.dbl ? ' (đôi!)' : ''}${e.jail && !e.dbl ? ' — không ra được' : ''}`);
      break;
    case 'speed':
      S.jail();
      log(`🚨 ${who(e.p)} đổ đôi 3 lần liền — vào tù vì chạy quá tốc độ!`);
      break;
    case 'move':
      await walk(e.p, e.from, e.n);
      break;
    case 'jump': {
      const tk = tokenEl(e.p);
      SFX.tele();
      if (tk && !QUICK) { tk.classList.add('warp'); await sleep(320); }
      P(e.p).pos = e.to;
      placeTokens();
      if (tk) { await sleep(60); tk.classList.remove('warp'); }
      if (e.how === 'portal') log(`🌀 ${who(e.p)} bị Cổng Dịch Chuyển hút tới ${cellName(e.to)}!`);
      else if (e.how === 'train') log(`🚄 ${who(e.p)} đi Tàu Cao Tốc tới ${cellName(e.to)}.`);
      else log(`➡️ ${who(e.p)} tới ${cellName(e.to)}.`);
      await sleep(350);
      break;
    }
    case 'gain':
      addCash(e.p, e.amt);
      quick();
      if (e.why === 'full') { log(`🃏 ${who(e.p)} đã đủ ${2} thẻ kỹ năng — không nhận thêm.`); break; }
      if (e.amt) { S.coin(); float(e.p, `+${money(e.amt)}`); }
      log(e.why === 'go' ? `🏁 ${who(e.p)} qua Xuất Phát: +${money(e.amt)}${e.amt > SALARY ? ' (🧧 Thưởng Tết)' : ''}`
        : e.why === 'mystery' ? `🎁 ${who(e.p)} mở quà: ${e.amt ? `<b>+${money(e.amt)}</b>!` : 'hộp rỗng 😅'}` : `💰 ${who(e.p)} nhận ${money(e.amt)}.`);
      break;
    case 'pay': {
      addCash(e.p, -e.amt);
      if (e.to === 'pot') V.pot += e.amt; else addCash(e.to, e.amt);
      quick();
      S.pay();
      float(e.p, `−${money(e.amt)}`, 'bad');
      if (e.to >= 0 && e.to !== 'pot') setTimeout(() => float(e.to, `+${money(e.amt)}`), 250);
      if (e.why === 'rent') { say(e.p, 'rent', e.amt >= 200 ? 0.8 : 0.15); pulseCell(e.cell); }
      const to = e.to === 'pot' ? 'vào 🍯 Hũ Vàng' : e.to >= 0 ? `cho ${who(e.to)}` : 'cho ngân hàng';
      log(`💸 ${who(e.p)} trả <b>${money(e.amt)}</b> ${PAY_WHY[e.why] || ''}${e.cell != null && e.why === 'rent' ? ' ' + cellName(e.cell) : ''} ${to}.`);
      break;
    }
    case 'buy':
      V.own[e.cell] = e.p; addCash(e.p, -e.amt);
      quick(); pulseCell(e.cell, 'pop');
      S.coin(); say(e.p, 'buy', 0.3);
      log(`🏠 ${who(e.p)} mua ${cellName(e.cell)} giá ${money(e.amt)}.${setsOf(V, e.p).some(g => g === BOARD[e.cell].g) ? ' <b>Đủ bộ màu!</b>' : ''}`);
      break;
    case 'auction':
      SFX.gong();
      V.phase = 'auction';
      V.auc = { cell: e.cell, bids: {}, flash: e.flash };
      log(`🔨 ${e.flash ? '<b>Đấu Giá Chớp Nhoáng</b>' : 'Đấu giá kín'}: ${cellName(e.cell)} (giá gốc ${money(BOARD[e.cell].price)}).`);
      pulseCell(e.cell, 'pop');
      break;
    case 'bid':
      SFX.click();
      if (V.auc) { V.auc.bids[e.p] = V.auc.bids[e.p] ?? -1; renderPlayers(); }
      break;
    case 'won': case 'nobid': {
      const rows = Object.entries(e.bids).sort((a, b) => b[1] - a[1]).map(([p, v]) => `<li style="--c:${col(+p)}"><span>${SEATS[+p].label}</span><span class="grow">${nm(+p)}</span><b>${v ? money(v) : 'bỏ'}</b></li>`).join('');
      if (e.t === 'won') {
        V.own[e.cell] = e.p; addCash(e.p, -e.amt);
        quick(); S.coin();
        log(`🔨 ${who(e.p)} thắng đấu giá ${cellName(e.cell)} với <b>${money(e.amt)}</b>.`);
        await spot(`<div class="cap">🔨 ${cellName(e.cell)}</div><ol class="bids">${rows}</ol><div class="cap">${who(e.p)} thắng!</div>`, 1800, 'auc');
      } else {
        log(`🔨 Không ai đặt giá ${cellName(e.cell)} — đất vẫn của ngân hàng.`);
        await spot(`<div class="cap">🔨 ${cellName(e.cell)}</div><div>Không ai đặt giá</div>`, 900, 'auc');
      }
      V.auc = null;
      break;
    }
    case 'build':
      V.lv[e.cell] = e.lv; addCash(e.p, -e.cost);
      quick(); pulseCell(e.cell, 'pop'); S.build();
      log(`🔨 ${who(e.p)} xây ${e.lv === 5 ? '<b>khách sạn</b>' : `nhà thứ ${e.lv}`} ở ${cellName(e.cell)} (${money(e.cost)}).`);
      break;
    case 'sell':
      if (e.house) V.lv[e.cell]--; else { V.own[e.cell] = null; if (P(e.p).fest === e.cell) P(e.p).fest = null; }
      addCash(e.p, e.amt);
      quick(); pulseCell(e.cell);
      log(`🏚️ ${who(e.p)} thiếu tiền — bán ${e.house ? '1 nhà ở' : 'lại đất'} ${cellName(e.cell)} được ${money(e.amt)}.`);
      break;
    case 'card': {
      const C = CARDS[e.deck][e.id];
      SFX.card();
      log(`${DECK_NAME[e.deck]} — ${who(e.p)}: <i>${UI.esc(C.text)}</i>`);
      if (C.jailcard) P(e.p).jailCards++;
      await spot(`<div class="card ${e.deck}"><div class="dk">${DECK_NAME[e.deck]}</div><div class="tx">${UI.esc(C.text)}</div><div class="who">${who(e.p)}</div></div>`, 2000, 'cardsp');
      break;
    }
    case 'skill':
      P(e.p).hand.push(e.k);
      quick(); renderHand();
      if (e.p === m) { S.magic(); float(e.p, SKILLS[e.k] ? SKILLS[e.k].icon : '🃏'); }
      log(`🃏 ${who(e.p)} nhận ${e.p === m ? skillName(e.k) : '1 thẻ kỹ năng'}${e.why === 'go' ? ' khi qua Xuất Phát' : ''}.`);
      break;
    case 'use': {
      const h = P(e.p).hand, j = h.indexOf(e.k) >= 0 ? h.indexOf(e.k) : h.indexOf('?');
      if (j >= 0) h.splice(j, 1);
      S.magic();
      if (e.k === 'swap') { P(e.p).pos = e.a; P(e.to).pos = e.b; placeTokens(); log(`🔀 ${who(e.p)} dùng <b>Đổi Chỗ</b> với ${who(e.to)}!`); }
      else if (e.k === 'bomb') { V.lv[e.cell]--; S.boom(); pulseCell(e.cell); say(e.to, 'lost', 0.6); log(`💣 ${who(e.p)} dùng <b>Phá Nhà</b> ở ${cellName(e.cell)} của ${who(e.to)}!`); }
      else if (e.k === 'fest') { P(e.p).fest = e.cell; pulseCell(e.cell, 'pop'); log(`🎉 ${who(e.p)} mở <b>Lễ Hội</b> ở ${cellName(e.cell)} — tiền thuê ×2!`); }
      else if (e.k === 'shield') log(`🛡️ ${who(e.p)} dùng <b>Miễn Thuê</b> — không trả ${money(e.amt)} cho ${who(e.to)}!`);
      else if (e.k === 'dice') log(`🎯 ${who(e.p)} dùng <b>Chọn Xúc Xắc</b>: ${e.v}!`);
      quick();
      await spot(`<div class="big-ic">${SKILLS[e.k].icon}</div><div class="cap">${who(e.p)} · ${SKILLS[e.k].name}</div>`, 1000);
      break;
    }
    case 'jail':
      P(e.p).pos = 10; P(e.p).jail = true;
      placeTokens(); renderPlayers();
      S.jail(); say(e.p, 'jail', 0.5);
      log(`🚓 ${who(e.p)} vào tù!`);
      await sleep(500);
      break;
    case 'free':
      P(e.p).jail = false;
      if (e.how === 'jailcard') P(e.p).jailCards--;
      placeTokens(); renderPlayers(); SFX.pop();
      log(`🔓 ${who(e.p)} ra tù${e.how === 'bail' ? ` (nộp ${money(BAIL)})` : e.how === 'jailcard' ? ' bằng 🔑 Thẻ Ra Tù' : ' nhờ đổ đôi'}!`);
      break;
    case 'stay':
      P(e.p).jail = false;
      log(`🔒 ${who(e.p)} ngồi tù lượt này — lượt sau được ra.`);
      break;
    case 'buyout':
      V.own[e.cell] = e.p; addCash(e.p, -e.amt); addCash(e.from, e.amt);
      if (P(e.from).fest === e.cell) P(e.from).fest = null;
      quick(); pulseCell(e.cell, 'pop'); SFX.whoosh();
      say(e.p, 'buyout', 0.5); setTimeout(() => say(e.from, 'lost', 0.6), 600);
      log(`🤝 ${who(e.p)} <b>mua lại</b> ${cellName(e.cell)} của ${who(e.from)} với giá ${money(e.amt)}!`);
      await spot(`<div class="big-ic">🤝</div><div class="cap">${who(e.p)} mua lại ${cellName(e.cell)}<small>trả ${who(e.from)} ${money(e.amt)}</small></div>`, 1300);
      break;
    case 'casino':
      addCash(e.p, e.win ? e.amt : -e.amt);
      if (!e.win) V.pot += e.amt;
      quick();
      if (e.win) { S.coin(); UI.burst(tokenPt(e.p).x, tokenPt(e.p).y, ['#ffd23f', '#fff'], 30, 6); } else S.pay();
      log(`🎰 ${who(e.p)} cược ${money(e.amt)} — ${e.win ? `<b>THẮNG</b> +${money(e.amt)}!` : 'thua 😭'}`);
      await spot(`<div class="big-ic">🎰</div><div class="cap">${e.win ? 'THẮNG' : 'THUA'} ${money(e.amt)}</div>`, 1500, e.win ? 'good' : 'bad');
      break;
    case 'invest':
      addCash(e.p, -e.amt); P(e.p).stock = e.amt;
      quick(); S.coin();
      log(`📈 ${who(e.p)} đầu tư ${money(e.amt)} vào chứng khoán.`);
      break;
    case 'dividend':
      addCash(e.p, e.amt); P(e.p).stock = 0;
      quick();
      if (e.amt) S.coin();
      float(e.p, `📈 ×${e.mul}`);
      log(`📈 Cổ phiếu của ${who(e.p)}: ${money(e.inv)} ×${e.mul} = <b>${money(e.amt)}</b>${e.mul >= 2 ? ' 🚀' : e.mul === 0 ? ' 📉 mất trắng!' : ''}`);
      break;
    case 'pot':
      addCash(e.p, e.amt); V.pot = 0;
      quick(); SFX.win();
      float(e.p, `🍯 +${money(e.amt)}`);
      log(`🍯 ${who(e.p)} ẵm cả <b>Hũ Vàng</b>: +${money(e.amt)}!`);
      break;
    case 'round':
      V.round = e.n; V.ev = null;
      quick();
      log(`<span class="sep">— Vòng ${e.n} —</span>`);
      break;
    case 'event': {
      const E = EVENTS[e.k];
      V.ev = { k: e.k, g: e.g };
      if (e.hit) for (const i of e.hit) { V.lv[i]--; pulseCell(i); }
      quick();
      SFX.gong();
      const extra = e.k === 'tour' ? ` Nhóm <b style="color:${GROUPS[e.g].c}">${GROUPS[e.g].name}</b>.` : e.hit ? ` Sập nhà ở ${e.hit.map(cellName).join(', ')}.` : e.cell != null ? ` Lô ${cellName(e.cell)}.` : '';
      log(`${E.icon} <b>Biến cố: ${E.name}</b> — ${E.desc}${extra}`);
      await spot(`<div class="big-ic">${E.icon}</div><div class="cap">${E.name}<small>${E.desc}${extra}</small></div>`, 2400, 'event');
      break;
    }
    case 'over': {
      V.phase = 'over';
      SFX.win(); UI.fireworks(6, () => SFX.pop()); UI.confetti();
      for (const p of e.winners) say(p, 'win');
      const why = e.reason === 'mono' ? `gom đủ 3 bộ màu` : e.reason === 'bankrupt' ? `${who(e.p)} phá sản — ván kết thúc` : 'hết giờ';
      log(`🏆 ${e.winners.map(who).join(', ')} thắng! (${why})`);
      await sleep(800);
      break;
    }
  }
}

// ================= MODAL =================
const mq = s => document.querySelector('#modal ' + s);

function showGameOver() {
  overShown = true;
  const host = CTX.me().isHost, medal = ['🏆', '🥈', '🥉'];
  const why = V.reason === 'mono' ? `🏘️ ${nm(V.winners[0])} gom đủ 3 bộ màu — thắng ngay!` : V.reason === 'bankrupt' ? '💥 Có người phá sản — ván kết thúc, xếp hạng theo tổng tài sản.' : '⏰ Hết giờ — xếp hạng theo tổng tài sản.';
  UI.openModal(`<div class="tp-m"><h2 class="center">🏆 ${V.winners.map(nm).join(' & ')} thắng!</h2><p class="center muted">${why}</p>
    <ol class="rank">${V.results.map((r, i) => `<li style="--c:${col(r.p)}"><span>${r.broke ? '💥' : medal[i] || i + 1 + '.'}</span><span>${SEATS[r.p].label}</span><span class="grow">${nm(r.p)}</span><small>tiền ${money(r.cash)}</small><b>${money(r.worth)}</b></li>`).join('')}</ol>
    <div class="btns"><button class="ghost" data-a="close">👀 Xem bàn</button>
    ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}</div></div>`);
  const on = (a, fn) => { const b = mq(`[data-a="${a}"]`); if (b) b.onclick = () => { UI.closeModal(); fn(); }; };
  on('close', () => {});
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

const KIND_DESC = {
  go: chaos => `Đi qua nhận ${money(SALARY)}${chaos ? ' (50% kèm 1 thẻ kỹ năng)' : ''}.`,
  ch: () => 'Rút một thẻ ❓ Cơ Hội.', cc: () => 'Rút một thẻ 📦 Khí Vận.',
  tax: (chaos, c) => `Nộp ${money(c.amt)}${chaos ? ' vào 🍯 Hũ Vàng' : ''}.`,
  jail: () => `Chỉ thăm tù. Bị nhốt thì lượt sau chọn: thử đổ đôi, nộp ${money(BAIL)} hoặc dùng 🔑 Thẻ Ra Tù. Không ra được cũng chỉ ngồi 1 lượt.`,
  park: chaos => (chaos ? '🍯 Hũ Vàng: gom mọi tiền thuế, phạt, cược thua. Dừng ở đây là ẵm cả hũ!' : 'Nghỉ chân, không có gì xảy ra.'),
  tojail: () => 'Vào tù ngay, không qua Xuất Phát!',
  portal: () => 'Bị hút tới một ô ngẫu nhiên trên bàn (rồi xử lý ô đó).',
  casino: () => 'Cược $100 hoặc $300: 50% thắng gấp đôi, thua thì tiền vào Hũ Vàng.',
  train: () => 'Chọn một ô bất kỳ để tới ngay (qua Xuất Phát vẫn nhận lương).',
  stock: () => 'Đầu tư $100/$200 — lần tới qua Xuất Phát nhận lại ×0 đến ×3.',
};

function showCell(i) {
  const c = BOARD[i], o = V.own[i];
  let body = '';
  if (c.k === 'p') {
    const g = GROUPS[c.g], names = ['Đất trống', '1 nhà', '2 nhà', '3 nhà', '4 nhà', '🏨 Khách sạn'];
    body = `<table class="rent">${c.rent.map((r, k) => `<tr class="${o != null && V.lv[i] === k ? 'cur' : ''}"><td>${names[k]}${k === 0 ? ' <small>(đủ bộ ×2)</small>' : ''}</td><td>${money(r)}</td></tr>`).join('')}</table>
      <p class="small">Giá đất ${money(c.price)} · Xây mỗi nhà ${money(g.hc)} · Nhóm ${g.name}</p>`;
  } else if (c.k === 'r') body = `<table class="rent">${[1, 2, 3, 4].map(n => `<tr><td>Có ${n} sân bay</td><td>${money(25 * 2 ** (n - 1))}</td></tr>`).join('')}</table><p class="small">Giá ${money(c.price)}</p>`;
  else if (c.k === 'u') body = `<p>Tiền thuê = tổng xúc xắc ×4 (có cả 2 công ty: ×10).</p><p class="small">Giá ${money(c.price)}</p>`;
  else body = `<p>${KIND_DESC[c.k] ? KIND_DESC[c.k](V.chaos, c) : ''}</p>`;
  if (isProp(c) && o != null) {
    body += `<p>Chủ: ${who(o)}${V.lv[i] ? ` · ${V.lv[i] === 5 ? 'khách sạn' : V.lv[i] + ' nhà'}` : ''} · Tiền thuê hiện tại: <b>${money(rentOf(V, i, 7))}</b>${c.k === 'u' ? ' (xúc xắc 7)' : ''}${P(o).fest === i ? ' 🎉' : ''}</p>`;
    if (V.lv[i] < 5) body += `<p class="small">Mua lại cưỡng chế: ${money(buyoutPrice(V, i))}</p>`;
  }
  UI.openModal(`<div class="tp-m"><h2 class="cell-h" style="--g:${c.g ? GROUPS[c.g].c : 'var(--chip)'}">${cellIcon(c, V.chaos)} ${UI.esc(c.name)}</h2>${body}<div class="btns"><button class="gold" data-x>Đóng</button></div></div>`);
  mq('[data-x]').onclick = UI.closeModal;
}

function showHelp() {
  const chaos = V ? V.chaos : true;
  UI.openModal(`<div class="tp-m help">
    <h2>📖 Luật chơi — Cờ Tỷ Phú</h2>
    <h3>Cơ bản</h3><ul>
      <li>Lần lượt đổ 2 xúc xắc rồi đi. Đổ <b>đôi</b> được đổ tiếp; đôi 3 lần liền thì vào tù. Qua 🏁 Xuất Phát nhận <b>${money(SALARY)}</b>.</li>
      <li>Dừng ở đất chưa có chủ: <b>mua</b> theo giá, hoặc bỏ qua để <b>đấu giá kín</b> — mọi người đặt giá cùng lúc, giá cao nhất thắng.</li>
      <li>Dừng ở đất người khác: trả <b>tiền thuê</b>. Sau đó được quyền <b>🤝 mua lại cưỡng chế</b> ô đó với giá ×${BUYOUT_X} (đất + nhà), chủ cũ nhận tiền. Ô có khách sạn thì không mua lại được.</li>
      <li>Sở hữu đủ một <b>nhóm màu</b>: tiền thuê đất trống ×2, và được <b>xây nhà</b> (trước khi đổ xúc xắc, bấm 🏠 Xây nhà rồi chạm ô). 5 nhà = khách sạn.</li>
      <li>Thiếu tiền: máy tự bán nhà (nửa giá xây) rồi bán đất cho ngân hàng (nửa giá). Vẫn không đủ là <b>phá sản</b> — ván kết thúc ngay.</li>
      <li>🔒 Tù: thử đổ đôi, nộp ${money(BAIL)} hoặc dùng 🔑 Thẻ Ra Tù. Không ra được cũng chỉ ngồi 1 lượt.</li>
      <li>🏁 Hết giờ (${V ? V.minutes : 30} phút, đánh nốt vòng đang dở) hoặc có người phá sản → ai có <b>tổng tài sản</b> (tiền + đất + nhà) lớn nhất thắng.${!V || V.instant ? ' Gom đủ <b>3 bộ màu</b> là <b>thắng ngay</b>!' : ''}</li>
      <li>Chạm vào một ô trên bàn để xem giá và bảng tiền thuê.</li>
    </ul>
    ${chaos ? `<h3>🎁 Bất Ngờ — thẻ kỹ năng (giữ tối đa 2)</h3><p class="small">Qua Xuất Phát có 50% được 1 thẻ; thẻ Cơ Hội/Khí Vận cũng có thể cho thẻ.</p>
      <ul>${Object.values(SKILLS).map(s => `<li>${s.icon} <b>${s.name}</b> — ${s.desc}</li>`).join('')}</ul>
      <h3>Ô đặc biệt</h3><ul>${['portal', 'casino', 'train', 'stock', 'park'].map(k => `<li>${cellIcon({ k }, true)} ${KIND_DESC[k](true)}</li>`).join('')}</ul>
      <h3>Biến cố toàn bàn (mỗi ${EVENT_EVERY} vòng)</h3><ul>${Object.values(EVENTS).map(x => `<li>${x.icon} <b>${x.name}</b> — ${x.desc}</li>`).join('')}</ul>` : ''}
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Hiểu rồi, chơi thôi!</button></div></div>`);
  mq('[data-x]').onclick = UI.closeModal;
}

// ================= ĐIỀU KHIỂN =================
function send(action) {
  if (!canAct()) return;
  SFX.ac();
  SFX.click();
  pending = true;
  renderControls();
  return CTX.send(action).then(r => { pending = false; if (V && !playing) renderAll(); return r; });
}

function useCard(k) {
  if (!canAct() || V.phase !== 'roll' || !SKILLS[k] || !SKILLS[k].pre) return;
  const m = mySeat();
  if (k === 'dice') {
    UI.pickModal('🎯 Chọn tổng xúc xắc', Array.from({ length: 11 }, (_, j) => {
      const v = j + 2, i = (P(m).pos + v) % 40;
      return { html: `<b>${v}</b> → ${UI.esc(BOARD[i].name)}`, value: v };
    }), v => send({ type: 'card', k, v }));
  } else if (k === 'swap') {
    const opts = alive().filter(q => q !== m && !P(q).jail).map(q => ({ html: `${SEATS[q].label} ${nm(q)} <small>· ${UI.esc(BOARD[P(q).pos].name)}</small>`, value: q, color: col(q) }));
    if (!opts.length) return UI.toast('Không có ai để đổi chỗ');
    UI.pickModal('🔀 Đổi chỗ với ai?', opts, q => send({ type: 'card', k, to: q }));
  } else {
    mode = k;
    if (!selectable().size) { mode = null; return UI.toast(k === 'bomb' ? 'Đối thủ chưa có nhà nào để phá' : 'Bạn chưa có đất để mở lễ hội'); }
    renderBoard(); renderControls();
  }
}

function clickCell(i) {
  if (mode && selectable().has(i)) {
    if (mode === 'build') send({ type: 'build', cell: i });
    else if (mode === 'train') { mode = null; send({ type: 'train', to: i }); }
    else { const k = mode; mode = null; send({ type: 'card', k, cell: i }); }
    return;
  }
  showCell(i);
}

function tickTimers() {
  if (!V) return;
  tickClock();
  const now = Date.now(), turnMs = CTX.room().turnMs, rem = deadline ? deadline - now : 0;
  const frac = !deadline || playing ? 0 : Math.max(0, Math.min(1, rem / turnMs));
  const dec = decider(), auc = V.phase === 'auction' && V.auc;
  ROOT.querySelectorAll('.pl').forEach(el => {
    const p = +el.dataset.p, on = auc ? !(p in V.auc.bids) && P(p).cash >= MIN_BID : p === dec;
    el.querySelector('.pl-timer i').style.width = (on ? frac * 100 : 0) + '%';
  });
  const mine = canAct(), tb = $('#tp-timer');
  tb.style.width = (mine ? frac * 100 : 0) + '%';
  tb.classList.toggle('low', rem < 6000);
  if (mine && rem > 0 && rem < 5000 && Math.floor(rem / 1000) !== tb._s) { tb._s = Math.floor(rem / 1000); SFX.tick(); }
}

// ================= VÒNG ĐỜI =================
async function update(msg, { backlog = 0, hidden = false } = {}) {
  SPEED = backlog >= 3 ? 4 : backlog >= 1 ? 1.8 : 1;
  if (!V) { V = structuredClone(msg.state); clockOff = msg.recvAt - V.now; renderAll(); }
  playing = true;
  QUICK = hidden;
  if (hidden) SPEED = 100;
  if (msg.events.length) renderControls();
  for (const e of msg.events) {
    try { await playEvent(e); } catch (err) { console.error(err); }
    if (!V) return; // đã unmount giữa chừng
  }
  QUICK = false;
  if (msg.meta && msg.meta.auto != null) log(`⏱️ ${[].concat(msg.meta.auto).map(who).join(', ')} hết giờ — máy chọn giúp.`);
  playing = false;
  SPEED = 1;
  V = structuredClone(msg.state);
  clockOff = msg.recvAt - V.now;
  deadline = msg.deadlineIn ? msg.recvAt + msg.deadlineIn : 0;
  setDie(0, V.dice[0]); setDie(1, V.dice[1]);
  if (V.cur != null && V.phase !== 'over') CTX.skin.set($('.tp-dice'), V.cur, 'dice');
  renderAll();
  const me = canAct() ? mySeat() : null;
  if (me != null && lastDecider !== me && !hidden) SFX.myTurn();
  lastDecider = me;
  if (V.phase === 'over' && !overShown) setTimeout(showGameOver, 1200);
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root; SEATS = ctx.game.seats;
    V = null; pending = false; playing = false; SPEED = 1; QUICK = false; deadline = 0; overShown = false; mode = null; lastDecider = null; built = false;
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    UI.emoteBar($('#tp-emotes'));
    UI.toolbar($('#tp-tools'), { help: showHelp });
    $('.tp-board').addEventListener('click', e => {
      const c = e.target.closest('.cell');
      if (c && V) clickCell(+c.dataset.i);
    });
    $('#tp-acts').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.bid) { $('#tp-bid').value = b.dataset.bid; return; }
      if (b.dataset.act) return send(JSON.parse(b.dataset.act));
      const u = b.dataset.ui;
      if (u === 'over') showGameOver();
      else if (u === 'build') setMode('build');
      else if (u === 'cancel') setMode(null);
      else if (u === 'bid') {
        const v = Math.floor(+$('#tp-bid').value) || 0;
        if (v && (v < MIN_BID || v > P(mySeat()).cash)) return UI.toast(`Giá đặt từ ${money(MIN_BID)} đến ${money(P(mySeat()).cash)}`);
        send({ type: 'bid', amt: v });
      }
    });
    $('#tp-acts').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'tp-bid') { e.preventDefault(); $('[data-ui="bid"]').click(); } });
    $('#tp-hand').addEventListener('click', e => { const b = e.target.closest('button.sk'); if (b) useCard(b.dataset.sk); });
    keyHandler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || UI.modalOpen() || !V) return;
      if (e.code === 'Space' && canAct() && V.phase === 'roll' && !mode) { e.preventDefault(); send({ type: 'roll' }); }
      else if (e.key === 'Escape' && mode && mode !== 'train') setMode(null);
    };
    addEventListener('keydown', keyHandler);
    timerInt = setInterval(tickTimers, 200);
    return {
      update,
      onRoom: () => { if (V && !playing) renderPlayers(); },
      emoteAnchor: seat => (V && seat >= 0 && V.players[seat] && V.players[seat].on && tokenEl(seat) ? tokenPt(seat) : null),
      unmount() { clearInterval(timerInt); removeEventListener('keydown', keyHandler); V = null; },
    };
  },
};
