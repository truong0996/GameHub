// 💎 Splendor — giao diện client. Xem "Game client interface" trong CLAUDE.md.
// V = bản trạng thái để VẼ: trong lúc diễn sự kiện, V được cập nhật dần theo từng sự kiện; diễn xong thì thay bằng state thật từ server.
import {
  COLORS, GEMS, LEVEL_NAME, MAX_GEMS, MAX_RES, ABILITIES, PERKS, EVENTS, NOBLE_NAMES, eventText, objInfo,
  bonusOf, gemCount, priceOf, nobleShort, wildOf,
} from './data.js';

let CTX, UI, SFX, ROOT, V, SEATS;
let pending = false, playing = false, SPEED = 1, QUICK = false, deadline = 0, overShown = false, modalTag = '', timerInt = 0, keyHandler = null, lastDecider = null;
let SEL = {}, RET = {}; // ngọc đang chọn để lấy / để trả lại

const ALL = [...COLORS, 'o'];
const PORTRAITS = ['🤴', '👸', '🧔', '👩‍🦰', '👴', '👵', '🎩', '💂', '🧕', '🤵'];
const $ = s => ROOT.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms / SPEED));
const mySeat = () => CTX.me().seat;
const P = p => V.players[p];
const nm = p => UI.esc(V.players[p] ? V.players[p].name : '?');
const col = p => (SEATS[p] ? SEATS[p].color : '#888');
const who = p => `<b class="pn" style="--c:${col(p)}">${nm(p)}</b>`;
const seatedList = () => V.players.map((pl, i) => (pl.on ? i : -1)).filter(i => i >= 0);
const decider = () => (V.phase !== 'play' ? null : V.ask ? V.ask.seat : V.turn);
const sum = g => ALL.reduce((s, c) => s + (g[c] || 0), 0);
const boardCards = () => [1, 2, 3].flatMap(lv => V.board[lv].filter(Boolean));
const maxDiff = () => (V.event === 'fair' ? 4 : 3);
const pairMin = () => (V.event === 'plenty' ? 2 : 4);

// ================= LỜI THOẠI =================
const SAY = {
  big: ['Hàng xịn!', 'Của hiếm đây!', 'Chốt đơn!', 'Đẹp quá ✨'],
  noble: ['Hân hạnh!', 'Mời ngài ngồi 🍷', 'Quý tộc tới rồi!'],
  robbed: ['Ăn cướp à?!', 'Trả đây!', 'Ê ê ê!', 'Tui nhớ mặt nha 😤'],
  thief: ['Cảm ơn nha 😏', 'Của tui rồi!', 'Hehe'],
  last: ['Sắp xong rồi!', 'Ai cản nổi?', 'Vòng cuối nha!'],
  win: ['Giàu to! 💎', 'Vô địch! 🏆', 'Dễ mà 😎'],
};
function say(p, kind, prob = 1) {
  if (p == null || Math.random() > prob || QUICK) return;
  const b = ROOT.querySelector(`.pb[data-p="${p}"] .bubble`);
  if (!b) return;
  b.textContent = UI.pick(SAY[kind]);
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('show'), 2000);
}

// ================= ÂM THANH =================
const S = {
  gem() { SFX.tone(1400 + Math.random() * 500, 0.07, { type: 'sine', v: 0.06 }); SFX.tone(2100, 0.05, { type: 'sine', v: 0.03, delay: 0.04 }); },
  card() { SFX.noise(0.09, { v: 0.18, f: 3200, q: 0.8 }); },
  buy() { [660, 880, 1100].forEach((f, i) => SFX.tone(f, 0.16, { type: 'triangle', v: 0.06, delay: i * 0.06 })); },
  noble() { [523, 659, 784, 1046, 1318].forEach((f, i) => SFX.tone(f, 0.25, { type: 'triangle', v: 0.07, delay: i * 0.07 })); },
  bad() { SFX.tone(300, 0.25, { type: 'sawtooth', v: 0.08, to: 150 }); },
};

// ================= VẼ THẺ / NGỌC =================
const tk = (c, n = '', cls = '') => `<i class="tk c-${c} ${cls}" title="${GEMS[c].name}">${n}</i>`;
const gemsText = g => ALL.filter(c => g && g[c]).map(c => `${g[c] > 1 ? g[c] + '×' : ''}${tk(c, '', 'xs')}`).join(' ') || '—';
const stormUp = c => V.event === 'storm' && V.evColor === c;

function cardTitle(c) {
  const A = c.ab && ABILITIES[c.ab];
  return `Cấp ${c.lv} · ${GEMS[c.c].name} · ${c.pts} điểm${A ? ` · ${A.name}: ${A.desc}` : ''}`;
}
function cardHTML(c, cls = '') {
  if (!c) return `<div class="cd none ${cls}"></div>`;
  if (c.hid) return `<div class="cd back lv${c.lv} ${cls}" data-id="${c.id}" title="Thẻ cấp ${c.lv} giữ úp"><span>${'◆'.repeat(c.lv)}</span></div>`;
  const A = c.ab && ABILITIES[c.ab];
  const cost = COLORS.filter(x => c.cost[x]).map(x => `<span class="cc c-${x}${stormUp(x) ? ' up' : ''}">${c.cost[x] + (stormUp(x) ? 1 : 0)}</span>`).join('');
  // Thẻ Kim Cương: dải trên màu xám kem để số điểm (chữ trắng) dễ đọc.
  return `<div class="cd lv${c.lv} ${cls}" style="--k:${c.c === 'w' ? '#bdb4a3' : GEMS[c.c].color}" data-id="${c.id}" title="${UI.esc(cardTitle(c))}">
    <div class="cd-top"><b>${c.pts || ''}</b>${tk(c.c, c.ab === 'double' ? '×2' : '', 'bn')}</div>
    ${A ? `<span class="ab">${A.icon}</span>` : ''}
    <div class="cost">${cost}</div><span class="lvd">${'◆'.repeat(c.lv)}</span></div>`;
}
function nobleHTML(n, cls = '') {
  const i = NOBLE_NAMES.indexOf(n.name), K = n.perk && PERKS[n.perk];
  return `<div class="nb ${cls}" data-nid="${n.id}" title="${UI.esc(n.name)} — ${n.pts} điểm${K ? ` · ${K.icon} ${K.name}: ${K.desc}` : ''}">
    <div class="nb-face">${PORTRAITS[i] || '👑'}</div><b class="nb-pts">${n.pts}</b>
    <div class="req">${COLORS.filter(x => n.req[x]).map(x => `<span class="rq c-${x}">${n.req[x]}</span>`).join('')}</div>
    ${K ? `<span class="pk">${K.icon}</span>` : ''}</div>`;
}

// ================= KHUNG =================
const TEMPLATE = `<div class="spl">
  <div class="sp-main">
    <div class="sp-board">
      <div id="sp-table" class="dark">
        <div id="sp-nobles"></div>
        <div id="sp-rows"></div>
        <div id="sp-bank"></div>
      </div>
      <div id="sp-players"></div>
    </div>
    <div class="sp-ctl">
      <div id="sp-status"></div>
      <div class="sp-timer"><i id="sp-timer"></i></div>
      <div id="sp-actions"></div>
    </div>
  </div>
  <aside class="sp-side">
    <div class="sp-head"><b>💎 Splendor</b><span id="sp-mode" class="muted small"></span></div>
    <div id="sp-round"></div>
    <div id="sp-obj"></div>
    <div id="sp-log"></div>
    <div id="sp-emotes"></div>
    <div id="sp-tools"></div>
  </aside>
  <div id="sp-flash"></div>
</div>`;

function renderTable() {
  const m = mySeat(), me = m >= 0 ? P(m) : null, free = canMain();
  const nobleOpts = V.ask && V.ask.k === 'noble' && V.ask.seat === m ? V.ask.opts : [];
  $('#sp-nobles').innerHTML = V.nobles.map(n => nobleHTML(n, `${nobleOpts.includes(n.id) ? 'pick' : ''}${me && nobleShort(me, n) === 0 ? ' near' : ''}`)).join('') || '<span class="muted small">Hết quý tộc</span>';
  const giftOpts = V.ask && V.ask.k === 'gift' && V.ask.seat === m ? V.ask.opts : [];
  $('#sp-rows').innerHTML = [3, 2, 1].map(lv => {
    const n = V.deckN[lv];
    const pile = `<div class="pile lv${lv}${n ? '' : ' out'}${free && n && me.res.length < MAX_RES ? ' act' : ''}" data-lv="${lv}" title="Chồng thẻ cấp ${lv} (${LEVEL_NAME[lv]}) — còn ${n} thẻ${free ? '. Bấm để giữ chỗ úp 1 thẻ' : ''}">
      <span class="pl-d">${'◆'.repeat(lv)}</span><b>${n}</b></div>`;
    const cards = V.board[lv].map(c => {
      let cls = '';
      if (c && me && free && priceOf(V, me, c).ok) cls = 'can';
      if (c && giftOpts.includes(c.id)) cls = 'pick';
      return cardHTML(c, cls);
    }).join('');
    return `<div class="row">${pile}${cards}</div>`;
  }).join('');
  $('#sp-bank').innerHTML = ALL.map(c => {
    const n = V.bank[c], s = SEL[c] || 0;
    return `<button class="bk${s ? ' sel' : ''}${c === 'o' ? ' gold' : ''}" data-c="${c}" ${c === 'o' || !free ? 'tabindex="-1"' : ''} title="${GEMS[c].name}: còn ${n} viên${c === 'o' ? ' (chỉ nhận khi giữ chỗ thẻ)' : ''}">
      ${tk(c, n, n ? '' : 'zero')}${s ? `<span class="sel-n">+${s}</span>` : ''}</button>`;
  }).join('');
}

function renderPlayers() {
  const box = $('#sp-players'), m = mySeat(), room = CTX.room(), dec = playing ? null : decider();
  const order = seatedList();
  if (m >= 0) order.sort((a, b) => (a === m ? -1 : b === m ? 1 : 0));
  const lead = Math.max(...order.map(p => P(p).pts));
  box.innerHTML = order.map(p => {
    const pl = P(p), b = bonusOf(pl), mine = p === m;
    const off = room && room.seats[p] && room.seats[p].kind === 'human' && !room.seats[p].online;
    const cols = ALL.map(c => `<div class="col c-${c}">${c === 'o' ? '<span class="bon none"></span>' : `<span class="bon${b[c] ? '' : ' zero'}" title="${b[c]} thẻ ${GEMS[c].name} (giảm giá)">${b[c]}</span>`}
      ${tk(c, pl.gems[c], pl.gems[c] ? '' : 'zero')}</div>`).join('');
    const res = pl.res.map(c => cardHTML(c, mine ? 'res mine' + (canMain() && priceOf(V, pl, c).ok ? ' can' : '') : 'res')).join('');
    const tags = [
      pl.prism ? `<span class="chip" title="Giảm thêm ${pl.prism} ngọc bất kỳ mỗi lần mua">🌈×${pl.prism}</span>` : '',
      pl.obj && !mine ? (pl.obj.hid ? '<span class="chip" title="Mục tiêu bí mật — lật ra cuối ván">🎯 ?</span>'
        : `<span class="chip" title="${UI.esc(`${objInfo(pl.obj, pl).name}: ${objInfo(pl.obj, pl).desc}`)}">${objInfo(pl.obj, pl).icon} ${pl.objDone ? '+' + pl.obj.pts : '✗'}</span>`) : '',
    ].join('');
    return `<div class="pb${mine ? ' me' : ''}${p === dec ? ' turn' : ''}${p === V.first ? ' first' : ''}" data-p="${p}" style="--c:${col(p)}">
      <div class="pb-head">
        <div class="av">${SEATS[p].label}${CTX.skin.face(p, 'fill')}</div>
        <div class="pb-name">${pl.kind === 'bot' ? '🤖 ' : ''}${nm(p)}${mine ? ' <span class="tag">bạn</span>' : ''}${off ? ' 📴' : ''}
          <div class="pb-sub">${p === V.first ? '🥇 đi đầu · ' : ''}${pl.cards.length} thẻ · ${gemCount(pl.gems)}/${MAX_GEMS} ngọc ${tags}</div></div>
        <div class="pb-pts${pl.pts === lead && lead > 0 ? ' lead' : ''}" title="Điểm uy tín"><b>${pl.pts}</b><small>/${V.target}</small></div>
      </div>
      <div class="cols">${cols}</div>
      ${res || pl.nobles.length ? `<div class="pb-foot"><div class="resv">${res}</div><div class="nbs">${pl.nobles.map(n => nobleHTML(n, 'mini')).join('')}</div></div>` : ''}
      <div class="bubble"></div>
      <div class="pb-timer"><i></i></div>
    </div>`;
  }).join('');
}

function renderSide() {
  const E = V.event && EVENTS[V.event];
  $('#sp-round').innerHTML = `<div class="rn"><b>Vòng ${V.round}</b> <span class="muted">· 🎯 ${V.target} điểm</span>${V.lastRound ? ' <span class="last">⏳ Vòng cuối!</span>' : ''}</div>
    ${E ? `<div class="ev"><span class="ev-ic">${E.icon}</span><span><b>${E.name}${V.evColor ? ` ${tk(V.evColor, '', 'xs')}` : ''}</b><br><small>${eventText(V.event, V.evColor)}</small></span></div>` : ''}`;
  const m = mySeat(), me = m >= 0 ? P(m) : null;
  const o = me && me.obj && !me.obj.hid ? me.obj : null;
  if (o) {
    const I = objInfo(o, me), done = I.have >= I.need;
    $('#sp-obj').innerHTML = `<div class="obj${done ? ' done' : ''}" title="Mục tiêu bí mật — chỉ bạn thấy, cuối ván đạt thì được cộng điểm">
      <span class="ob-ic">${I.icon}</span><span class="grow"><b>${I.name}</b> <span class="muted small">(bí mật · +${o.pts} điểm)</span><br><small>${I.desc}</small></span>
      <b class="ob-n">${Math.min(I.have, I.need)}/${I.need}</b></div>`;
  } else $('#sp-obj').innerHTML = '';
  $('#sp-mode').textContent = V.chaos ? '🎁 Bất Ngờ' : '😇 Cổ điển';
}

// ================= ĐIỀU KHIỂN =================
function canAct() { return !!V && V.phase === 'play' && !pending && !playing && decider() === mySeat() && mySeat() >= 0; }
const canMain = () => canAct() && !V.ask;

function takeErr() {
  const ks = COLORS.filter(c => SEL[c]);
  if (!ks.length) return 'Chọn ngọc trong ngân hàng';
  if (ks.length === 1 && SEL[ks[0]] === 2) return null;
  if (ks.length > maxDiff()) return `Tối đa ${maxDiff()} ngọc khác màu`;
  return null;
}

function renderControls() {
  const m = mySeat(), status = $('#sp-status'), acts = $('#sp-actions');
  let msg = '', btns = '';
  status.classList.remove('mine');
  const dec = decider(), ask = V.ask;
  if (V.phase === 'over') msg = V.winners.includes(m) ? '🏆 Bạn thắng!' : `🏁 Ván đã kết thúc — ${V.winners.map(who).join(', ')} thắng.`;
  else if (playing) { acts.innerHTML = ''; return; } // đang diễn: thanh trạng thái hiện dòng log mới nhất (xem log())
  else if (ask && ask.seat === m) {
    status.classList.add('mine');
    const me = P(m);
    if (ask.k === 'discard') {
      const n = sum(RET);
      msg = `💼 Bạn đang giữ quá ${MAX_GEMS} ngọc — chọn <b>${ask.n}</b> viên trả lại ngân hàng (${n}/${ask.n}):`;
      btns = ALL.filter(c => me.gems[c]).map(c => `<button class="tkb" data-ret="${c}" title="Trả 1 ${GEMS[c].name}">${tk(c, me.gems[c] - (RET[c] || 0))}${RET[c] ? `<small>−${RET[c]}</small>` : ''}</button>`).join('')
        + `<button class="ghost" data-a="retclr">↺ Chọn lại</button><button class="gold" data-a="ret" ${n === ask.n ? '' : 'disabled'}>Trả lại</button>`;
    } else if (ask.k === 'noble') {
      msg = '👑 Có nhiều quý tộc muốn ghé thăm — chọn một vị:';
      btns = ask.opts.map(id => { const n = V.nobles.find(x => x.id === id); return n ? `<button class="nbb" data-noble="${id}">${nobleHTML(n, 'mini')} ${UI.esc(n.name)}</button>` : ''; }).join('');
    } else if (ask.k === 'steal') {
      msg = `${ABILITIES.steal.icon} <b>Kẻ Cắp</b> — chọn người và màu ngọc để lấy (tối đa ${ask.lv} viên):`;
      btns = ask.opts.map(q => `<div class="grp" style="--c:${col(q)}"><span class="gname">${SEATS[q].label} ${nm(q)}</span>${COLORS.filter(c => P(q).gems[c]).map(c => `<button class="tkb" data-steal="${q}:${c}">${tk(c, P(q).gems[c])}</button>`).join('')}</div>`).join('');
    } else if (ask.k === 'snatch') {
      msg = `${ABILITIES.snatch.icon} <b>Móc Túi</b> — chọn 1 thẻ đang giữ chỗ của người khác để cướp về:`;
      btns = ask.opts.map(q => `<div class="grp" style="--c:${col(q)}"><span class="gname">${SEATS[q].label} ${nm(q)}</span>${P(q).res.map(c => `<button class="cdb" data-snatch="${q}:${c.id}">${cardHTML(c, 'sm')}</button>`).join('')}</div>`).join('');
    } else if (ask.k === 'gift') {
      msg = `${ABILITIES.gift.icon} <b>Quà Tặng</b> — chọn 1 thẻ cấp thấp hơn trên bàn để lấy miễn phí:`;
      btns = ask.opts.map(id => { const c = boardCards().find(x => x.id === id); return c ? `<button class="cdb" data-gift="${id}">${cardHTML(c, 'sm')}</button>` : ''; }).join('');
    }
  } else if (ask) {
    const K = { discard: 'đang trả bớt ngọc', noble: 'đang chọn quý tộc', steal: 'dùng 🗡️ Kẻ Cắp...', snatch: 'dùng 🪝 Móc Túi...', gift: 'chọn 🎁 Quà Tặng...' };
    msg = `${who(ask.seat)} ${K[ask.k] || 'đang quyết định'}`;
  } else if (m < 0) msg = `👀 Bạn đang xem. Lượt của ${who(V.turn)}.`;
  else if (dec === m) {
    status.classList.add('mine');
    const me = P(m), ks = ALL.filter(c => SEL[c]);
    if (ks.length) {
      const err = takeErr(), after = gemCount(me.gems) + sum(SEL);
      msg = `Lấy ${gemsText(SEL)}${after > MAX_GEMS ? ` — <span class="warn">sẽ có ${after} ngọc, phải trả lại ${after - MAX_GEMS}</span>` : ''}${err ? ` <span class="warn">(${err})</span>` : ''}`;
      btns = `<button class="ghost" data-a="clr">✖ Bỏ chọn</button><button class="gold big" data-a="take" ${err ? 'disabled' : ''}>💎 Lấy ngọc <small>(Enter)</small></button>`;
    } else {
      msg = `Đến lượt bạn! Bấm <b>ngọc</b> trong ngân hàng để lấy (${maxDiff()} màu khác nhau, hoặc 2 viên cùng màu khi chồng còn ≥${pairMin()}${V.event === 'drought' ? ' — Hạn Hán: không được' : ''}), hoặc bấm <b>thẻ</b> để mua / giữ chỗ.`;
      const any = COLORS.some(c => V.bank[c]) || [...boardCards(), ...me.res].some(c => priceOf(V, me, c).ok) || (me.res.length < MAX_RES && (boardCards().length || V.deckN.some(Boolean)));
      if (!any) btns = '<button class="big" data-a="pass">⏭️ Bỏ lượt (không còn nước đi)</button>';
    }
  } else msg = `Lượt của ${who(V.turn)}...`;
  status.innerHTML = msg || '&nbsp;';
  acts.innerHTML = btns;
  acts.querySelectorAll('button').forEach(b => { if (!canAct()) b.disabled = true; });
}

function renderAll() {
  if (!V) return;
  renderTable();
  renderPlayers();
  renderSide();
  renderControls();
}

function pickGem(c) {
  if (!canMain() || c === 'o') return;
  const cur = SEL[c] || 0, ks = COLORS.filter(x => SEL[x]);
  if (cur === 2) delete SEL[c];
  else if (cur === 1) {
    if (ks.length === 1 && V.bank[c] >= pairMin() && V.event !== 'drought') SEL[c] = 2;
    else delete SEL[c];
  } else {
    if (!V.bank[c]) { UI.toast(`Hết ${GEMS[c].name} rồi`); SFX.error(); return; }
    if (ks.some(x => SEL[x] === 2)) SEL = {};
    if (COLORS.filter(x => SEL[x]).length >= maxDiff()) { UI.toast(`Chỉ được lấy tối đa ${maxDiff()} ngọc khác màu`); SFX.error(); return; }
    SEL[c] = 1;
  }
  S.gem();
  renderTable();
  renderControls();
}

// Bảng chi tiết thẻ: mua / giữ chỗ.
function openCard(id) {
  const m = mySeat(), me = m >= 0 ? P(m) : null;
  const onBoard = boardCards().find(c => c.id === id), inRes = me && me.res.find(c => c.id === id);
  const c = onBoard || inRes;
  if (!c || c.hid) return;
  if (V.ask && V.ask.k === 'gift' && V.ask.seat === m && canAct()) { if (V.ask.opts.includes(id)) send({ type: 'gift', id }); return; }
  const A = c.ab && ABILITIES[c.ab];
  let price = '', btns = '';
  if (me) {
    const pr = priceOf(V, me, c), b = bonusOf(me), w = wildOf(V, me);
    const disc = COLORS.filter(x => c.cost[x] && b[x]).map(x => `${tk(x, '', 'xs')}−${Math.min(b[x], c.cost[x] + (stormUp(x) ? 1 : 0))}`).join(' ');
    price = `<div class="price"><div>Giá gốc: ${COLORS.filter(x => c.cost[x]).map(x => `${c.cost[x] + (stormUp(x) ? 1 : 0)}${tk(x, '', 'xs')}`).join(' ')}</div>
      ${disc ? `<div class="muted small">Giảm nhờ thẻ đã có: ${disc}</div>` : ''}${w ? `<div class="muted small">🌈 Giảm thêm ${w} ngọc bất kỳ</div>` : ''}
      <div>${pr.ok ? `Bạn sẽ trả: <b>${gemsText(pr.pay)}</b>${!sum(pr.pay) ? ' <b>(miễn phí!)</b>' : ''}` : `<span class="warn">Còn thiếu <b>${pr.short}</b> ngọc</span>`}</div></div>`;
    if (canMain()) {
      btns = `<button class="gold" data-m="buy" ${pr.ok ? '' : 'disabled'}>🛒 Mua thẻ</button>`;
      if (onBoard) {
        const g = Math.min(V.bank.o, V.event === 'rain' ? 2 : 1);
        btns += `<button data-m="res" ${me.res.length < MAX_RES ? '' : 'disabled'} title="${me.res.length >= MAX_RES ? `Đã giữ đủ ${MAX_RES} thẻ` : ''}">📌 Giữ chỗ${g ? ` +${g} ${tk('o', '', 'xs')}` : ' (hết vàng)'}</button>`;
      }
    }
  }
  openTagged('card', `<div class="cardm">${cardHTML(c, 'xl')}<div class="grow">
    <h3>${GEMS[c.c].name} · cấp ${c.lv} <span class="muted small">(${LEVEL_NAME[c.lv]})</span></h3>
    <div>${c.pts ? `⭐ <b>${c.pts}</b> điểm uy tín · ` : ''}giảm vĩnh viễn 1 ${tk(c.c, '', 'xs')} cho các thẻ sau${c.ab === 'double' ? ' (Song Ngọc: 2)' : ''}</div>
    ${A ? `<div class="abl">${A.icon} <b>${A.name}</b> — ${A.desc}</div>` : ''}
    ${inRes ? '<div class="muted small">📌 Thẻ bạn đang giữ chỗ</div>' : ''}${price}</div></div>
    <div class="btns"><button class="ghost" data-x>Đóng</button>${btns}</div>`);
  mq('[data-x]').onclick = closeTagged;
  const b1 = mq('[data-m="buy"]'), b2 = mq('[data-m="res"]');
  if (b1) b1.onclick = () => { closeTagged(); send({ type: 'buy', id }); };
  if (b2) b2.onclick = () => { closeTagged(); send({ type: 'reserve', id }); };
}

function openPile(lv) {
  const m = mySeat();
  if (!canMain() || !V.deckN[lv]) return;
  if (P(m).res.length >= MAX_RES) { UI.toast(`Bạn đã giữ đủ ${MAX_RES} thẻ`); return; }
  const g = Math.min(V.bank.o, V.event === 'rain' ? 2 : 1);
  openTagged('pile', `<h3 class="center">📌 Giữ chỗ úp 1 thẻ cấp ${lv}?</h3>
    <p class="center">Rút thẻ trên cùng chồng ${LEVEL_NAME[lv]} — chỉ bạn thấy thẻ đó${g ? `, nhận thêm ${g} ${tk('o', '', 'xs')}` : ' (ngân hàng hết vàng)'}.</p>
    <div class="btns"><button class="ghost" data-x>Huỷ</button><button class="gold" data-ok>📌 Giữ chỗ</button></div>`);
  mq('[data-x]').onclick = closeTagged;
  mq('[data-ok]').onclick = () => { closeTagged(); send({ type: 'reserve', lv }); };
}

function send(action) {
  if (!canAct()) return;
  SFX.ac();
  SFX.click();
  pending = true;
  renderControls();
  return CTX.send(action).then(r => {
    pending = false;
    if (r && r.ok) { SEL = {}; RET = {}; }
    if (V && !playing) renderAll();
    return r;
  });
}

function onActions(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset, me = mySeat() >= 0 ? P(mySeat()) : null;
  if (d.a === 'take') send({ type: 'take', gems: { ...SEL } });
  else if (d.a === 'clr') { SEL = {}; renderAll(); }
  else if (d.a === 'pass') send({ type: 'pass' });
  else if (d.a === 'retclr') { RET = {}; renderControls(); }
  else if (d.a === 'ret') send({ type: 'discard', gems: { ...RET } });
  else if (d.ret) {
    const c = d.ret;
    if ((RET[c] || 0) < me.gems[c] && sum(RET) < V.ask.n) { RET[c] = (RET[c] || 0) + 1; S.gem(); }
    renderControls();
  } else if (d.noble) send({ type: 'noble', id: d.noble });
  else if (d.steal) { const [q, c] = d.steal.split(':'); send({ type: 'steal', to: +q, color: c }); }
  else if (d.snatch) { const [q, id] = d.snatch.split(':'); send({ type: 'snatch', to: +q, id: +id }); }
  else if (d.gift) send({ type: 'gift', id: +d.gift });
}

// ================= HIỆU ỨNG =================
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function anchor(p) {
  const el = ROOT.querySelector(`.pb[data-p="${p}"] .av`);
  return el ? centerOf(el) : { x: innerWidth / 2, y: 60 };
}
const ptOf = (sel, fb) => { const el = ROOT.querySelector(sel); return el ? centerOf(el) : fb; };
const bankPt = c => ptOf(`#sp-bank .bk[data-c="${c}"]`, { x: innerWidth / 2, y: 100 });
const gemPt = (p, c) => ptOf(`.pb[data-p="${p}"] .col.c-${c} .tk`, anchor(p));
const cardPt = id => ptOf(`#sp-rows .cd[data-id="${id}"], .pb .cd[data-id="${id}"]`, null);
const pilePt = lv => ptOf(`#sp-rows .pile[data-lv="${lv}"]`, { x: innerWidth / 2, y: 100 });
async function fly(html, from, to, { ms = 480, delay = 0, cls = '' } = {}) {
  if (QUICK || !from || !to) return;
  if (delay) await sleep(delay);
  const d = UI.el('div', 'sp-fly ' + cls, html);
  $('.spl').appendChild(d);
  const tf = (pt, s) => `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%) scale(${s})`;
  try {
    await d.animate([{ transform: tf(from, 1), opacity: 0.9 }, { transform: tf(to, 0.85), opacity: 1 }],
      { duration: ms / SPEED, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).finished;
  } finally { d.remove(); }
}
// Bay nhiều ngọc cùng lúc (so le nhẹ). moves = [[màu, từ, tới], ...]
function flyGems(moves, ms = 520) {
  return Promise.all(moves.map(([c, a, b], i) => fly(tk(c), a, b, { ms, delay: i * 70 })));
}
const expand = g => ALL.flatMap(c => Array(g && g[c] ? g[c] : 0).fill(c));
async function spot(html, caption, cls = '', ms = 1000) {
  if (QUICK) return;
  const d = UI.el('div', 'sp-spot ' + cls, `${html}${caption ? `<div class="cap">${caption}</div>` : ''}`);
  $('.spl').appendChild(d);
  await sleep(ms);
  d.classList.add('out');
  setTimeout(() => d.remove(), 300);
}
function flash(cls, ms = 900) {
  const f = $('#sp-flash');
  f.className = cls; void f.offsetWidth; f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), ms);
}
function pulse(p, cls) {
  const el = ROOT.querySelector(`.pb[data-p="${p}"]`);
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 1200);
}
const float = (p, html, cls) => { if (!QUICK) UI.floatAt(anchor(p), html, cls); };
function log(html) {
  const box = $('#sp-log');
  box.appendChild(UI.el('div', 'li', html));
  while (box.children.length > 150) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  if (playing && !html.includes('class="sep"')) { const st = $('#sp-status'); st.classList.remove('mine'); st.innerHTML = html; }
}
const addG = (g, d, k = 1) => { for (const c of ALL) if (d && d[c]) g[c] = (g[c] || 0) + d[c] * k; };
const cardName = c => (c.hid ? `một thẻ cấp ${c.lv} úp` : `thẻ ${tk(c.c, '', 'xs')} cấp ${c.lv}${c.pts ? ` (${c.pts}⭐)` : ''}${c.ab ? ` ${ABILITIES[c.ab].icon}` : ''}`);
function setSlot(lv, i, nc) {
  if (lv && i >= 0) V.board[lv][i] = nc;
  if (lv) V.deckN[lv] = Math.max(0, V.deckN[lv] - (nc ? 1 : 0));
}

async function playEvent(e) {
  const m = mySeat();
  switch (e.t) {
    case 'start':
      log(`💎 Bắt đầu! Ai đạt <b>${V.target}</b> điểm uy tín trước thì chơi nốt vòng, điểm cao nhất thắng. ${who(e.first)} đi đầu.`);
      if (e.comp && e.comp.length) {
        log(`🎁 Bù lượt đi sau: ${e.comp.map(x => `${who(x.p)} ${gemsText(x.gems)}`).join(', ')}.`);
        for (const x of e.comp) float(x.p, `+${sum(x.gems)} 💎`);
      }
      break;
    case 'round': {
      Object.assign(V, { round: e.n, event: e.event, evColor: e.color });
      renderSide(); renderTable();
      const E = e.event && EVENTS[e.event];
      log(`<span class="sep">— Vòng ${e.n}${E ? ` · ${E.icon} <b>${E.name}</b>: ${eventText(e.event, e.color)}` : ''} —</span>`);
      if (E && e.event !== 'calm') { SFX.gong(); await spot(`<div class="big-ic">${E.icon}</div>`, `Vòng ${e.n} · ${E.name}${e.color ? ` ${tk(e.color, '', 'xs')}` : ''}<small>${eventText(e.event, e.color)}</small>`, 'event', 1700); }
      break;
    }
    case 'evtax':
      if (!e.loss.length) { log('⚖️ Thuế Thân: không ai giữ từ 7 ngọc — thoát thuế!'); break; }
      SFX.whoosh();
      await Promise.all(e.loss.map(x => flyGems(expand(x.gems).map(c => [c, gemPt(x.p, c), bankPt(c)]))));
      for (const x of e.loss) { addG(P(x.p).gems, x.gems, -1); addG(V.bank, x.gems); }
      renderAll();
      log(`⚖️ Thuế Thân: ${e.loss.map(x => `${who(x.p)} nộp ${gemsText(x.gems)}`).join(', ')}.`);
      break;
    case 'refresh':
      SFX.whoosh();
      V.board[e.lv] = e.cards;
      renderTable();
      log('🔄 Chợ Phiên: thay toàn bộ thẻ cấp 1 trên bàn.');
      await sleep(500);
      break;
    case 'take': {
      const pl = P(e.p);
      S.gem();
      await flyGems(expand(e.gems).map(c => [c, bankPt(c), gemPt(e.p, c)]));
      addG(V.bank, e.gems, -1); addG(pl.gems, e.gems);
      renderAll();
      log(`💎 ${who(e.p)} lấy ${gemsText(e.gems)}.`);
      break;
    }
    case 'buy': {
      const pl = P(e.p), c = e.card;
      const from = e.from === 'board' ? cardPt(c.id) : cardPt(c.id) || anchor(e.p);
      S.card();
      await Promise.all([fly(cardHTML(c), from, anchor(e.p), { ms: 650 }), flyGems(expand(e.pay).map(x => [x, gemPt(e.p, x), bankPt(x)]), 600)]);
      addG(pl.gems, e.pay, -1); addG(V.bank, e.pay);
      if (e.from === 'board') setSlot(e.lv, e.i, e.nc);
      else { const k = pl.res.findIndex(x => x.id === c.id); if (k >= 0) pl.res.splice(k, 1); }
      pl.cards.push(c);
      pl.pts += c.pts + (e.rush || 0);
      if (V.chaos && c.ab === 'prism') pl.prism = (pl.prism || 0) + 1;
      S.buy();
      renderAll();
      pulse(e.p, 'glow');
      if (c.pts) float(e.p, `+${c.pts + (e.rush || 0)}⭐`);
      if (c.lv === 3) say(e.p, 'big', 0.5);
      log(`🛒 ${who(e.p)} mua ${cardName(c)}${sum(e.pay) ? ` — trả ${gemsText(e.pay)}` : ' — miễn phí!'}${e.rush ? ' (🏃 +1 điểm)' : ''}.${c.ab && V.chaos ? ` ${ABILITIES[c.ab].icon} <b>${ABILITIES[c.ab].name}</b>!` : ''}`);
      if (c.ab && V.chaos) await sleep(300);
      break;
    }
    case 'mine':
      if (e.n) {
        S.gem();
        await flyGems(Array(e.n).fill([e.c, bankPt(e.c), gemPt(e.p, e.c)]));
        V.bank[e.c] -= e.n; P(e.p).gems[e.c] += e.n;
        renderAll();
      }
      log(`⛏️ ${who(e.p)} được Mỏ Lộ Thiên ${e.n ? `tặng ${gemsText({ [e.c]: e.n })}` : '— nhưng ngân hàng hết ngọc màu đó'}.`);
      break;
    case 'reserve': {
      const pl = P(e.p), c = e.card;
      S.card();
      const from = e.blind ? pilePt(e.lv) : cardPt(c.id);
      await Promise.all([fly(cardHTML(c), from, anchor(e.p), { ms: 600 }), e.gold ? flyGems(Array(e.gold).fill(['o', bankPt('o'), gemPt(e.p, 'o')])) : null]);
      if (e.blind) V.deckN[e.lv] = Math.max(0, V.deckN[e.lv] - 1);
      else setSlot(e.lv, e.i, e.nc);
      pl.res.push(c);
      V.bank.o -= e.gold; pl.gems.o += e.gold;
      renderAll();
      log(`📌 ${who(e.p)} giữ chỗ ${e.blind ? `úp 1 thẻ cấp ${e.lv}${e.p === m && !c.hid ? ` (${cardName(c)})` : ''}` : cardName(c)}${e.gold ? ` và nhận ${gemsText({ o: e.gold })}` : ''}.`);
      break;
    }
    case 'noble': {
      const pl = P(e.p), n = e.n, K = n.perk && PERKS[n.perk];
      S.noble();
      await fly(nobleHTML(n), ptOf(`#sp-nobles .nb[data-nid="${n.id}"]`, { x: innerWidth / 2, y: 80 }), anchor(e.p), { ms: 800 });
      V.nobles = V.nobles.filter(x => x.id !== n.id);
      pl.nobles.push(n);
      pl.pts += n.pts;
      if (n.perk === 'prism') pl.prism = (pl.prism || 0) + 1;
      if (e.gain && sum(e.gain)) { await flyGems(expand(e.gain).map(c => [c, bankPt(c), gemPt(e.p, c)])); addG(V.bank, e.gain, -1); addG(pl.gems, e.gain); }
      renderAll();
      pulse(e.p, 'glow');
      float(e.p, `👑 +${n.pts}⭐`);
      say(e.p, 'noble', 0.6);
      if (e.p === m) { UI.confetti(120); flash('gold'); }
      log(`👑 <b>${UI.esc(n.name)}</b> ghé thăm ${who(e.p)}: +${n.pts} điểm${K ? ` · ${K.icon} <b>${K.name}</b>: ${K.desc}` : ''}${e.gain && sum(e.gain) ? ` (${gemsText(e.gain)})` : ''}`);
      break;
    }
    case 'discard':
      await flyGems(expand(e.gems).map(c => [c, gemPt(e.p, c), bankPt(c)]));
      addG(P(e.p).gems, e.gems, -1); addG(V.bank, e.gems);
      renderAll();
      log(`💼 ${who(e.p)} trả lại ${gemsText(e.gems)} (giữ tối đa ${MAX_GEMS} ngọc).`);
      break;
    case 'steal':
      SFX.tele();
      await flyGems(Array(e.n).fill([e.c, gemPt(e.from, e.c), gemPt(e.p, e.c)]), 650);
      P(e.from).gems[e.c] -= e.n; P(e.p).gems[e.c] += e.n;
      renderAll();
      pulse(e.from, 'hit');
      if (e.from === m) { S.bad(); flash('bad'); }
      say(e.from, 'robbed', 0.7); say(e.p, 'thief', 0.3);
      log(`🗡️ ${who(e.p)} lấy ${gemsText({ [e.c]: e.n })} của ${who(e.from)}!`);
      break;
    case 'snatch': {
      const v = P(e.from), k = v.res.findIndex(x => x.id === e.card.id);
      SFX.tele();
      await fly(cardHTML(e.card), cardPt(e.card.id) || anchor(e.from), anchor(e.p), { ms: 700 });
      if (k >= 0) v.res.splice(k, 1);
      P(e.p).res.push(e.card);
      renderAll();
      pulse(e.from, 'hit');
      if (e.from === m) { S.bad(); flash('bad'); }
      say(e.from, 'robbed', 0.7);
      log(`🪝 ${who(e.p)} móc túi ${cardName(e.card)} đang giữ chỗ của ${who(e.from)}!`);
      break;
    }
    case 'tax':
      if (!e.from.length) { log(`💸 ${who(e.p)} thu thuế — nhưng chẳng ai đủ 5 ngọc để nộp.`); break; }
      SFX.tele();
      await flyGems(e.from.map(x => [x.c, gemPt(x.q, x.c), gemPt(e.p, x.c)]), 650);
      for (const x of e.from) { P(x.q).gems[x.c]--; P(e.p).gems[x.c]++; }
      renderAll();
      for (const x of e.from) { pulse(x.q, 'hit'); say(x.q, 'robbed', 0.3); }
      if (e.from.some(x => x.q === m)) S.bad();
      log(`💸 ${who(e.p)} thu thuế: ${e.from.map(x => `${who(x.q)} nộp ${tk(x.c, '', 'xs')}`).join(', ')}.`);
      break;
    case 'gift': {
      const pl = P(e.p), c = e.card;
      S.buy();
      await fly(cardHTML(c), cardPt(c.id), anchor(e.p), { ms: 650 });
      setSlot(e.lv, e.i, e.nc);
      pl.cards.push(c);
      pl.pts += c.pts;
      renderAll();
      if (c.pts) float(e.p, `+${c.pts}⭐`);
      log(`🎁 ${who(e.p)} nhận miễn phí ${cardName(c)}.`);
      break;
    }
    case 'fizzle': {
      const A = ABILITIES[e.k];
      log(`🗑️ ${A ? `${A.icon} ${A.name}` : 'Năng lực'} của ${who(e.p)} không dùng được — ${e.k === 'snatch' ? 'không có thẻ nào để cướp (hoặc bạn đã giữ đủ 3 thẻ)' : e.k === 'gift' ? 'không còn thẻ cấp thấp hơn trên bàn' : 'không ai có ngọc để lấy'}.`);
      break;
    }
    case 'extra':
      float(e.p, '⏩ Thêm lượt!');
      log(`⏩ ${who(e.p)} được <b>đi thêm một lượt</b>!`);
      break;
    case 'last':
      V.lastRound = true;
      renderSide();
      SFX.gong();
      say(e.p, 'last', 0.6);
      log(`⏳ ${who(e.p)} đạt <b>${P(e.p).pts}</b> điểm — <b>vòng cuối!</b> Chơi nốt tới hết vòng.`);
      await spot('<div class="big-ic">⏳</div>', `${who(e.p)} đạt ${P(e.p).pts} điểm!<small>Vòng cuối — mọi người chơi nốt tới hết vòng</small>`, 'event', 1500);
      break;
    case 'pass':
      log(`⏭️ ${who(e.p)} không còn nước đi — bỏ lượt.`);
      break;
    case 'reveal': {
      for (const r of e.res) { const pl = P(r.p); pl.obj = r.obj; pl.objDone = r.done; if (r.done) pl.pts += r.obj.pts; }
      renderPlayers();
      const rows = e.res.map(r => { const I = objInfo(r.obj, P(r.p)); return `<li style="--c:${col(r.p)}"><span class="av">${SEATS[r.p].label}${CTX.skin.face(r.p, 'fill')}</span><span class="grow">${nm(r.p)}<br><small>${I.icon} ${I.name} — ${I.desc}</small></span><b class="${r.done ? '' : 'zero'}">${r.done ? `+${r.obj.pts}` : '✗'}</b></li>`; }).join('');
      log(`🎯 Lật mục tiêu bí mật: ${e.res.map(r => `${who(r.p)} ${r.done ? `<b>+${r.obj.pts}</b>` : '✗'}`).join(', ')}.`);
      SFX.card();
      await spot(`<div class="sum"><h3>🎯 Mục tiêu bí mật</h3><ol>${rows}</ol></div>`, '', 'summary', 3000);
      break;
    }
    case 'over':
      V.phase = 'over';
      V.winners = e.winners;
      SFX.win(); UI.fireworks(6, () => SFX.pop()); UI.confetti();
      for (const p of e.winners) say(p, 'win');
      log(`🏆 ${e.winners.map(who).join(', ')} thắng với <b>${P(e.winners[0]).pts}</b> điểm!`);
      await sleep(1000);
      break;
  }
}

// ================= MODAL =================
function openTagged(tag, html) { modalTag = tag; return UI.openModal(`<div class="sp-m">${html}</div>`); }
function closeTagged() { if (modalTag) { UI.closeModal(); modalTag = ''; } }
const mq = s => document.querySelector('#modal ' + s);

function showGameOver() {
  overShown = true;
  const host = CTX.me().isHost, medal = ['🏆', '🥈', '🥉'];
  const res = V.results || [];
  let rank = 0;
  const rows = res.map((r, i) => {
    if (i === 0 || r.pts !== res[i - 1].pts || r.cards !== res[i - 1].cards) rank = i;
    const pl = P(r.p), I = pl.obj && !pl.obj.hid ? objInfo(pl.obj, pl) : null;
    return `<li style="--c:${col(r.p)}"><span>${medal[rank] || rank + 1 + '.'}</span><span class="grow">${nm(r.p)}
      <small class="muted">${r.cards} thẻ · ${pl.nobles.length} quý tộc${I ? ` · ${I.icon} ${I.name} ${pl.objDone ? `+${pl.obj.pts}` : '✗'}` : ''}</small></span><b>${r.pts} điểm</b></li>`;
  }).join('');
  openTagged('over', `<h2 class="center">🏆 ${V.winners.map(nm).join(' & ')} thắng!</h2>
    <ol class="rank">${rows}</ol>
    <p class="muted small center">Bằng điểm thì ai mua ít thẻ hơn xếp trên.</p>
    <div class="btns"><button class="ghost" data-a="close">👀 Xem bàn</button>
    ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}</div>`);
  const on = (a, fn) => { const b = mq(`[data-a="${a}"]`); if (b) b.onclick = () => { closeTagged(); fn(); }; };
  on('close', () => {});
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

function showHelp() {
  const chaos = V && V.chaos;
  const gems = ALL.map(c => `${tk(c, '', 'xs')} ${GEMS[c].name}`).join(' · ');
  openTagged('help', `<div class="help">
    <h2>📖 Luật chơi — Splendor</h2>
    <p>Bạn là thương nhân ngọc thời Phục Hưng. Ngọc: ${gems}.</p>
    <h3>Mỗi lượt chọn MỘT việc</h3><ul>
      <li>💎 <b>Lấy ngọc</b>: 3 viên khác màu (ít hơn cũng được), <b>hoặc</b> 2 viên cùng màu nếu chồng đó còn từ 4 viên.</li>
      <li>📌 <b>Giữ chỗ</b> 1 thẻ đang lật hoặc úp 1 thẻ trên đầu chồng (chỉ mình bạn thấy) và nhận 1 ${tk('o', '', 'xs')} <b>vàng</b> — vàng thay được ngọc màu bất kỳ. Giữ tối đa ${MAX_RES} thẻ, chỉ bạn mua được thẻ đó.</li>
      <li>🛒 <b>Mua thẻ</b> trên bàn hoặc thẻ đang giữ chỗ: trả ngọc theo giá in trên thẻ.</li>
    </ul>
    <h3>Thẻ & quý tộc</h3><ul>
      <li>Mỗi thẻ đã mua là <b>giảm giá vĩnh viễn</b> 1 ngọc màu của thẻ cho mọi lần mua sau — có đủ thẻ thì mua không tốn ngọc!</li>
      <li>Thẻ cấp ◆ (${LEVEL_NAME[1]}) rẻ, ít điểm; ◆◆ (${LEVEL_NAME[2]}) và ◆◆◆ (${LEVEL_NAME[3]}) đắt nhưng nhiều điểm.</li>
      <li>👑 <b>Quý tộc</b>: cuối lượt, ai có đủ số thẻ các màu như quý tộc yêu cầu thì quý tộc tự ghé thăm (+3 điểm), mỗi lượt tối đa 1 vị.</li>
      <li>Giữ tối đa <b>${MAX_GEMS} ngọc</b> (tính cả vàng) — thừa thì phải trả lại.</li>
      <li>Ai đạt <b>${V ? V.target : 15}</b> điểm thì <b>chơi nốt vòng</b> (mọi người đi đủ lượt như nhau), điểm cao nhất thắng; bằng điểm thì ai ít thẻ hơn thắng.</li>
      <li>Mỗi lượt có ${Math.round(CTX.room().turnMs / 1000)} giây — hết giờ máy lấy ngọc giúp.</li>
    </ul>
    ${chaos ? `<h3>🎁 Bất Ngờ — thẻ năng lực (kích hoạt khi mua)</h3><ul>${Object.values(ABILITIES).map(A => `<li>${A.icon} <b>${A.name}</b> — ${A.desc}</li>`).join('')}</ul>
    <h3>Sự kiện mỗi vòng bàn</h3><ul>${Object.entries(EVENTS).map(([k, x]) => `<li>${x.icon} <b>${x.name}</b> — ${eventText(k, null).replaceAll('?', 'một màu ngẫu nhiên')}</li>`).join('')}</ul>
    <h3>Quý tộc đặc quyền</h3><ul>${Object.values(PERKS).map(x => `<li>${x.icon} <b>${x.name}</b> — ${x.desc}</li>`).join('')}</ul>
    <h3>Khác</h3><ul><li>🎯 Mỗi người có 1 <b>mục tiêu bí mật</b> (cột phải) — cuối ván đạt thì được cộng điểm (không tính vào mốc ${V ? V.target : 15} điểm để kết thúc).</li>
      <li>🎁 <b>Bù lượt</b>: người đi sau nhận sẵn ngọc khởi đầu — người thứ 2 được 1 viên, thứ 3 được 2, từ thứ 4 trở đi 3 viên.</li></ul>` : ''}
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Hiểu rồi, chơi thôi!</button></div></div>`);
  mq('[data-x]').onclick = closeTagged;
}

// ================= HẸN GIỜ =================
function tickTimers() {
  if (!V) return;
  const now = Date.now(), turnMs = CTX.room().turnMs;
  const rem = deadline ? deadline - now : 0;
  const dec = decider();
  const frac = !deadline || playing || dec == null ? 0 : Math.max(0, Math.min(1, rem / turnMs));
  ROOT.querySelectorAll('.pb').forEach(el => {
    const i = el.querySelector('.pb-timer i');
    if (i) i.style.width = (+el.dataset.p === dec ? frac * 100 : 0) + '%';
  });
  const mine = canAct();
  const tb = $('#sp-timer');
  tb.style.width = (mine ? frac * 100 : 0) + '%';
  tb.classList.toggle('low', rem < 8000);
  if (mine && rem > 0 && rem < 5000 && Math.floor(rem / 1000) !== tb._s) { tb._s = Math.floor(rem / 1000); SFX.tick(); }
}

// ================= VÒNG ĐỜI =================
async function update(msg, { backlog = 0, hidden = false } = {}) {
  SPEED = backlog >= 3 ? 4 : backlog >= 1 ? 1.8 : 1;
  if (!V) { V = structuredClone(msg.state); renderAll(); }
  playing = true;
  QUICK = hidden;
  if (hidden) SPEED = 100;
  if (msg.events.length) { closeTagged(); renderControls(); renderTable(); }
  for (const e of msg.events) { try { await playEvent(e); } catch (err) { console.error(err); } }
  QUICK = false;
  if (msg.meta && msg.meta.auto != null) log(`⏱️ ${[].concat(msg.meta.auto).map(who).join(', ')} hết giờ — máy đi giúp.`);
  playing = false;
  SPEED = 1;
  V = structuredClone(msg.state);
  deadline = msg.deadlineIn ? msg.recvAt + msg.deadlineIn : 0;
  const dec = decider();
  if (dec !== mySeat()) { SEL = {}; RET = {}; }
  if (V.ask && V.ask.k !== 'discard') RET = {};
  renderAll();
  if (dec != null && dec === mySeat() && lastDecider !== dec && !hidden) SFX.myTurn();
  lastDecider = dec;
  if (V.phase === 'over' && !overShown) setTimeout(showGameOver, 1200);
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root; SEATS = ctx.game.seats;
    V = null; pending = false; playing = false; SPEED = 1; QUICK = false; deadline = 0; overShown = false; modalTag = ''; lastDecider = null; SEL = {}; RET = {};
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    UI.emoteBar($('#sp-emotes'));
    UI.toolbar($('#sp-tools'), { help: showHelp });
    $('#sp-actions').addEventListener('click', onActions);
    $('#sp-bank').addEventListener('click', e => { const b = e.target.closest('.bk'); if (b) pickGem(b.dataset.c); });
    $('#sp-rows').addEventListener('click', e => {
      if (!V) return;
      const c = e.target.closest('.cd[data-id]'), p = e.target.closest('.pile');
      if (c) openCard(+c.dataset.id);
      else if (p) openPile(+p.dataset.lv);
    });
    $('#sp-players').addEventListener('click', e => { const c = e.target.closest('.cd.mine[data-id]'); if (c && V) openCard(+c.dataset.id); });
    keyHandler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || UI.modalOpen() || !V || !canMain()) return;
      if (e.key === 'Enter' && COLORS.some(c => SEL[c]) && !takeErr()) { e.preventDefault(); e.stopPropagation(); send({ type: 'take', gems: { ...SEL } }); }
      else if (e.key === 'Escape' && COLORS.some(c => SEL[c])) { SEL = {}; renderAll(); }
    };
    addEventListener('keydown', keyHandler, true);
    timerInt = setInterval(tickTimers, 100);
    return {
      update,
      onRoom: () => { if (V && !playing) renderPlayers(); },
      emoteAnchor: seat => (V && seat >= 0 && V.players[seat] && V.players[seat].on ? anchor(seat) : null),
      unmount() { clearInterval(timerInt); removeEventListener('keydown', keyHandler, true); V = null; },
    };
  },
};
