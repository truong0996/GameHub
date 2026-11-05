// 🃏 Flip 7 — giao diện client. Xem "Game client interface" trong CLAUDE.md.
// V = bản trạng thái để VẼ: trong lúc diễn sự kiện, V được cập nhật dần theo từng sự kiện; diễn xong thì thay bằng state thật từ server.
import { NUM_COLORS, ACTIONS, RAINBOW, EVENTS, flipNeed, flipBonus, roundScore } from './cards.js';

let CTX, UI, SFX, ROOT, V, SEATS;
let pending = false, playing = false, SPEED = 1, QUICK = false, deadline = 0, overShown = false, modalTag = '', timerInt = 0, keyHandler = null, lastDecider = null;

const $ = s => ROOT.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms / SPEED));
const mySeat = () => CTX.me().seat;
const P = p => V.players[p];
const nm = p => UI.esc(V.players[p] ? V.players[p].name : '?');
const col = p => (SEATS[p] ? SEATS[p].color : '#888');
const who = p => `<b class="pn" style="--c:${col(p)}">${nm(p)}</b>`;
const seatedList = () => V.players.map((pl, i) => (pl.status !== 'off' ? i : -1)).filter(i => i >= 0);
const actName = v => `${ACTIONS[v].icon} <b>${ACTIONS[v].name}</b>`;
const decider = () => (V.phase !== 'play' ? null : V.pend.length ? V.pend[0].seat : V.turn);
const byId = (arr, id) => arr.findIndex(c => c.id === id);
const fogNow = () => V.event === 'fog';

// ================= LỜI THOẠI =================
const SAY = {
  hit: ['Thêm lá!', 'Liều thôi!', 'Cho xin 1 lá', 'Chưa sợ!', 'Rút!'],
  stay: ['Đủ rồi', 'Dừng!', 'Ăn chắc', 'Thôi, giữ điểm', 'Ok, ngừng'],
  bust: ['Toang!', 'Ối giời ơi!', 'Biết thế dừng...', 'Cháy rồi 😭', 'Sao lại trùng!'],
  flip7: ['FLIP 7!!! 🎉', 'Bảy số đẹp!', 'Ai cản nổi!'],
  frozen: ['Lạnh quá 🥶', 'Ơ kìa!', 'Đóng băng tui à?!'],
  three: ['Ba lá luôn á?!', 'Thôi xong...', 'Chơi ác vậy!'],
  saved: ['Hú hồn!', 'Suýt chết 😮‍💨', 'May quá!'],
  steal: ['Cho xin nha 😏', 'Của tui rồi!'],
  win: ['Vô địch! 🏆', 'Dễ mà 😎'],
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
  flip() { SFX.noise(0.09, { v: 0.18, f: 3200, q: 0.8 }); SFX.tone(520 + Math.random() * 200, 0.05, { type: 'triangle', v: 0.05, delay: 0.04 }); },
  bust() { SFX.tone(220, 0.35, { type: 'sawtooth', v: 0.12, to: 70 }); SFX.noise(0.4, { v: 0.3, f: 400, ft: 'lowpass', delay: 0.05 }); },
  freeze() { [1800, 2400, 3000].forEach((f, i) => SFX.tone(f, 0.25, { type: 'sine', v: 0.05, delay: i * 0.06 })); SFX.noise(0.4, { v: 0.08, f: 6000 }); },
  magic() { [660, 880, 1320].forEach((f, i) => SFX.tone(f, 0.25, { type: 'sine', v: 0.06, delay: i * 0.07 })); },
  stay() { SFX.tone(520, 0.08, { type: 'triangle', v: 0.08 }); SFX.tone(390, 0.12, { type: 'triangle', v: 0.08, delay: 0.08 }); },
  save() { [523, 659, 784, 1046].forEach((f, i) => SFX.tone(f, 0.18, { type: 'triangle', v: 0.08, delay: i * 0.05 })); },
};

// ================= LÁ BÀI =================
function cardHTML(c, cls = '') {
  if (!c) return `<div class="cd back ${cls}"><b>7</b></div>`;
  if (c.k === 'h') return `<div class="cd hid ${cls}" title="Lá số bị úp (Sương Mù)"><b>?</b></div>`;
  if (c.k === 'n') return `<div class="cd n ${cls}" style="--k:${NUM_COLORS[c.v]}" title="Lá số ${c.v}"><b>${c.v}</b></div>`;
  if (c.k === 'w') return `<div class="cd w ${cls}" title="${RAINBOW.name}: ${RAINBOW.desc}"><b>🌈</b></div>`;
  if (c.k === 'm') return `<div class="cd m ${cls}" title="${c.v === 'x2' ? 'x2: nhân đôi tổng lá số' : `Cộng ${c.v} điểm`}"><b>${c.v === 'x2' ? '×2' : '+' + c.v}</b></div>`;
  const A = ACTIONS[c.v];
  return `<div class="cd a ${cls}${c.g ? ' gift' : ''}" style="--k:${A.color}" title="${A.name}: ${UI.esc(A.desc)}"><i>${A.icon}</i><small>${A.name}</small></div>`;
}
const cardText = c => (c.k === 'n' ? `<b class="num" style="--k:${NUM_COLORS[c.v]}">${c.v}</b>` : c.k === 'w' ? '🌈 <b>Cầu Vồng</b>' : c.k === 'm' ? `<b>${c.v === 'x2' ? '×2' : '+' + c.v}</b>`
  : c.k === 'a' ? actName(c.v) : '<b>một lá úp</b>');

// ================= VẼ =================
const TEMPLATE = `<div class="f7">
  <div class="f7-main">
    <div id="f7-top" class="dark">
      <div id="f7-deck"><div class="stack"></div><div id="f7-deckn"></div></div>
      <div id="f7-round"></div>
      <div id="f7-risk"></div>
    </div>
    <div id="f7-players"></div>
    <div class="f7-ctl">
      <div id="f7-status"></div>
      <div class="f7-timer"><i id="f7-timer"></i></div>
      <div id="f7-actions"></div>
    </div>
  </div>
  <aside class="f7-side">
    <div class="f7-head"><b>🃏 Flip 7</b><span id="f7-mode" class="muted small"></span></div>
    <div id="f7-count"></div>
    <div id="f7-log"></div>
    <div id="f7-emotes"></div>
    <div id="f7-tools"></div>
  </aside>
  <div id="f7-flash"></div>
</div>`;

const STATUS = { in: '🎴 Đang chơi', stay: '✋ Đã dừng', frozen: '❄️ Bị đóng băng', bust: '💥 Cháy', flip7: '🌟 FLIP 7!' };

function renderPlayers() {
  const box = $('#f7-players'), m = mySeat(), room = CTX.room(), dec = playing ? null : decider();
  box.innerHTML = seatedList().map(p => {
    const pl = P(p);
    const off = room && room.seats[p] && room.seats[p].kind === 'human' && !room.seats[p].online;
    const pts = roundScore(pl, V.event);
    const nums = pl.nums.map(c => cardHTML(c)).join('') + (pl.bustCard ? cardHTML(pl.bustCard, 'dup') : '');
    const extra = pl.mods.map(c => cardHTML(c)).join('') + (pl.sc ? cardHTML(pl.sc, 'sc') : '') + V.pend.filter(d => d.seat === p).map(d => cardHTML(d.card, 'waiting')).join('');
    const need = flipNeed(V.event), uniq = pl.nums.length;
    const pct = Math.min(100, (pl.total / V.target) * 100);
    return `<div class="pb st-${pl.status}${p === m ? ' me' : ''}${p === dec ? ' turn' : ''}${p === V.dealer ? ' dealer' : ''}" data-p="${p}" style="--c:${col(p)}">
      <div class="pb-head">
        <div class="av">${SEATS[p].label}</div>
        <div class="pb-name">${pl.kind === 'bot' ? '🤖 ' : ''}${nm(p)}${p === m ? ' <span class="tag">bạn</span>' : ''}${off ? ' 📴' : ''}
          <div class="pb-sub">${STATUS[pl.status] || ''}${p === V.dealer ? ' · 🂠 chia bài' : ''}</div></div>
        <div class="pb-pts" title="Điểm vòng này"><small>vòng</small><b>${pts == null ? '?' : pl.status === 'bust' && !pts ? '0' : '+' + pts}</b></div>
        <div class="pb-total" title="Tổng điểm"><small>tổng</small><b>${pl.total}</b></div>
      </div>
      <div class="pb-bar" title="${pl.total}/${V.target} điểm"><i style="width:${pct}%"></i></div>
      <div class="pb-cards"><div class="nums">${nums || '<span class="muted small empty">—</span>'}</div><div class="extra">${extra}</div></div>
      <div class="pb-foot"><span class="dots" title="Số lá số khác nhau (cần ${need} để Flip)">${Array.from({ length: need }, (_, i) => `<i class="${i < uniq ? 'on' : ''}"></i>`).join('')}</span></div>
      <div class="bubble"></div>
      <div class="pb-timer"><i></i></div>
    </div>`;
  }).join('');
}

function renderTop() {
  const n = V.deckN ?? 0;
  $('#f7-deck .stack').innerHTML = cardHTML(null) + (n > 1 ? '<span class="layer l1"></span>' : '') + (n > 10 ? '<span class="layer l2"></span>' : '');
  $('#f7-deckn').innerHTML = `<b>${n}</b> lá`;
  const E = V.event && EVENTS[V.event];
  $('#f7-round').innerHTML = `<div class="rn"><b>Vòng ${V.round}</b> <span class="muted">· ai đạt 🎯 ${V.target} điểm trước thắng</span></div>
    ${E ? `<div class="ev"><span class="ev-ic">${E.icon}</span><span><b>${E.name}</b><br><small>${E.desc}</small></span></div>` : ''}`;
  const m = mySeat(), r = myRisk();
  $('#f7-risk').innerHTML = m >= 0 && P(m).status === 'in' && r != null
    ? `<div class="risk${r >= 0.3 ? ' bad' : r === 0 ? ' safe' : ''}" title="Xác suất lá kế tiếp trùng số bạn đang có (tính trên các lá chưa lộ)">💥 Nguy cơ cháy<b>${Math.round(r * 100)}%</b></div>${P(m).sc ? '<div class="small">💖 Có Cơ Hội Thứ Hai</div>' : ''}`
    : '';
}

function myRisk() {
  const m = mySeat();
  if (m < 0 || !V.unseen) return null;
  const pl = P(m);
  return pl.nums.reduce((s, c) => s + (c.k === 'n' ? V.unseen[c.v] : 0), 0) / Math.max(1, V.unseenTotal);
}

// Bảng đếm lá: số lá mỗi số còn chưa lộ (trong chồng bài + lá úp của người khác).
function renderCount() {
  const m = mySeat(), mine = new Set(m >= 0 ? P(m).nums.filter(c => c.k === 'n').map(c => c.v) : []);
  $('#f7-count').innerHTML = `<div class="muted small">🔢 Lá số chưa lộ${fogNow() ? ' (tính cả lá úp)' : ''}</div><div class="cnt">${(V.unseen || []).map((k, v) =>
    `<span class="${mine.has(v) ? 'hot' : ''}${k === 0 ? ' zero' : ''}" style="--k:${NUM_COLORS[v]}" title="Số ${v}: còn ${k} lá chưa lộ${mine.has(v) ? ' — bạn đang có, rút phải là cháy!' : ''}"><b>${v}</b><small>${k}</small></span>`).join('')}</div>`;
}

function canAct() { return !!V && V.phase === 'play' && !pending && !playing && decider() === mySeat() && mySeat() >= 0; }

function renderControls() {
  const m = mySeat(), status = $('#f7-status'), acts = $('#f7-actions');
  let msg = '', btns = '';
  status.classList.remove('mine');
  const d = V.pend[0], dec = decider();
  if (V.phase === 'over') msg = V.winners.includes(m) ? '🏆 Bạn thắng!' : `🏁 Ván đã kết thúc — ${V.winners.map(who).join(', ')} thắng.`;
  else if (playing) { acts.innerHTML = ''; return; } // đang diễn: thanh trạng thái hiện dòng log mới nhất (xem log())
  else if (d && d.seat === m) {
    status.classList.add('mine');
    if (d.see) {
      msg = `🔮 <b>Tiên Tri</b> — 3 lá trên cùng (lá trái sẽ được rút trước): <span class="peek">${d.see.map((c, i) => cardHTML(c, i ? 'mini' : 'mini first')).join('')}</span>`;
      btns = `<button class="big" data-peek="0">✋ Để nguyên</button><button class="gold big" data-peek="1">⤵️ Chôn lá đầu xuống đáy</button>`;
    } else if (d.opts) {
      msg = `Bạn rút được ${actName(d.card.v)} — <span class="muted">${ACTIONS[d.card.v].desc}</span><br>Chọn người nhận:`;
      btns = d.opts.map(q => `<button class="pl" data-to="${q}" style="--c:${col(q)}">${SEATS[q].label} ${nm(q)}${q === m ? ' (bạn)' : ''} <small>${roundScore(P(q), V.event) ?? '?'}đ · ${P(q).nums.length} lá</small></button>`).join('');
    }
  } else if (d) msg = d.card.v === 'peek' ? `🔮 ${who(d.seat)} đang lén xem 3 lá trên cùng...` : `${who(d.seat)} rút được ${actName(d.card.v)} — đang chọn người nhận...`;
  else if (m < 0) msg = `👀 Bạn đang xem. Lượt của ${who(V.turn)}.`;
  else {
    const pl = P(m);
    if (V.turn === m && pl.status === 'in') {
      status.classList.add('mine');
      const pts = roundScore(pl, V.event), need = flipNeed(V.event);
      msg = `Đến lượt bạn! Đang có <b>${pts} điểm</b> vòng này, ${pl.nums.length}/${need} số khác nhau${pl.nums.length === need - 1 ? ` — <b>thêm 1 số mới là FLIP (+${flipBonus(V.event)})!</b>` : ''}.`;
      btns = `<button class="gold big hit" data-a="hit">🎴 Rút <small>(phím 1)</small></button><button class="big stay" data-a="stay">✋ Dừng <small>(phím 2)</small></button>`;
    } else if (pl.status === 'in') msg = `Lượt của ${who(V.turn)}...`;
    else if (pl.status === 'bust') msg = `💥 Bạn đã cháy vòng này${V.event === 'mercy' ? ' (Đỡ Đòn: vẫn giữ nửa điểm lá số)' : ''}. Chờ vòng sau nhé. Lượt của ${who(V.turn)}.`;
    else if (pl.status === 'flip7') msg = '🌟 FLIP 7!';
    else msg = `${pl.status === 'frozen' ? '❄️ Bạn bị đóng băng' : '✋ Bạn đã dừng'} với <b>${roundScore(pl, V.event)} điểm</b>. Lượt của ${who(V.turn)}.`;
  }
  status.innerHTML = msg || '&nbsp;';
  acts.innerHTML = btns;
  acts.querySelectorAll('button').forEach(b => { b.disabled = !canAct(); });
}

function renderAll() {
  if (!V) return;
  renderPlayers();
  renderTop();
  renderCount();
  renderControls();
  $('#f7-mode').textContent = V.chaos ? '🎁 Bất Ngờ' : '😇 Cổ điển';
}

// ================= HIỆU ỨNG =================
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function anchor(p) {
  const el = ROOT.querySelector(`.pb[data-p="${p}"] .av`);
  return el ? centerOf(el) : { x: innerWidth / 2, y: 60 };
}
function slotOf(p) {
  const el = ROOT.querySelector(`.pb[data-p="${p}"] .pb-cards`);
  if (!el) return anchor(p);
  const r = el.getBoundingClientRect(), last = el.querySelector('.nums .cd:last-of-type');
  if (last) { const q = last.getBoundingClientRect(); return { x: Math.min(r.right - 20, q.right + q.width / 2 + 4), y: q.top + q.height / 2 }; }
  return { x: r.left + 24, y: r.top + r.height / 2 };
}
const deckPt = () => centerOf($('#f7-deck .stack'));
async function fly(html, from, to, { ms = 480, delay = 0 } = {}) {
  if (QUICK) return;
  if (delay) await sleep(delay);
  const d = UI.el('div', 'f7-fly', html);
  $('.f7').appendChild(d);
  const tf = (pt, s, r) => `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%) scale(${s}) rotate(${r}deg)`;
  try {
    await d.animate([{ transform: tf(from, 0.9, -12), opacity: 0.85 }, { transform: tf(to, 1, 0), opacity: 1 }],
      { duration: ms / SPEED, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).finished;
  } finally { d.remove(); }
}
async function spot(html, caption, cls = '', ms = 1000) {
  if (QUICK) return;
  const d = UI.el('div', 'f7-spot ' + cls, `${html}${caption ? `<div class="cap">${caption}</div>` : ''}`);
  $('.f7').appendChild(d);
  await sleep(ms);
  d.classList.add('out');
  setTimeout(() => d.remove(), 300);
}
function flash(cls, ms = 900) {
  const f = $('#f7-flash');
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
  const box = $('#f7-log');
  box.appendChild(UI.el('div', 'li', html));
  while (box.children.length > 150) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  if (playing && !html.includes('class="sep"')) { const st = $('#f7-status'); st.classList.remove('mine'); st.innerHTML = html; }
}
const dropPend = id => { const i = V.pend.findIndex(d => d.card.id === id); if (i >= 0) V.pend.splice(i, 1); };

async function playEvent(e) {
  const m = mySeat();
  switch (e.t) {
    case 'start':
      log(`🃏 Bắt đầu! Ai đạt <b>${V.target}</b> điểm trước sẽ thắng. Rút trùng số là cháy — đủ 7 số khác nhau là FLIP 7!`);
      break;
    case 'round': {
      Object.assign(V, { round: e.n, dealer: e.dealer, event: e.event, pend: [], turn: e.dealer });
      for (const p of seatedList()) Object.assign(P(p), { status: 'in', nums: [], mods: [], sc: e.event === 'grace' ? { k: 'a', v: 'second', g: 1, id: -1 - p } : null, bustCard: null, bonus: 0 });
      renderAll();
      const E = e.event && EVENTS[e.event];
      log(`<span class="sep">— Vòng ${e.n} · ${who(e.dealer)} chia bài${E ? ` · ${E.icon} <b>${E.name}</b>: ${E.desc}` : ''} —</span>`);
      if (E) { SFX.gong(); await spot(`<div class="big-ic">${E.icon}</div>`, `Vòng ${e.n} · ${E.name}<small>${E.desc}</small>`, 'event', 1700); }
      else { SFX.whoosh(); await spot('', `Vòng ${e.n}`, '', 900); }
      break;
    }
    case 'shuffle':
      SFX.whoosh();
      V.deckN = e.n;
      renderTop();
      log(`🔀 Hết bài — xáo chồng bỏ thành chồng mới (${e.n} lá).`);
      break;
    case 'draw': {
      const c = e.c, pl = P(e.p);
      S.flip();
      if (V.deckN) V.deckN--;
      renderTop();
      await fly(cardHTML(c), deckPt(), slotOf(e.p), { ms: e.why === 'deal' ? 320 : 460 });
      if (c.k === 'n' || c.k === 'w' || c.k === 'h') pl.nums.push(c);
      else if (c.k === 'm') pl.mods.push(c);
      else if (c.v === 'second' && !pl.sc) pl.sc = c;
      else V.pend.push({ seat: e.p, card: c });
      renderPlayers();
      if (e.why === 'hit') say(e.p, 'hit', 0.15);
      if (c.k === 'a') {
        S.magic();
        log(`${who(e.p)} rút được ${actName(c.v)}${c.v === 'second' && pl.sc === c ? ' — giữ lại phòng thân.' : c.v === 'second' ? ' — đã có rồi, phải tặng cho người khác.' : '!'}`);
        await sleep(250);
      } else if (c.k === 'm') log(`${who(e.p)} rút được lá ${cardText(c)}.`);
      else if (c.k === 'w') log(`${who(e.p)} rút được 🌈 <b>Cầu Vồng</b> — không bao giờ trùng!`);
      break;
    }
    case 'bust': {
      const pl = P(e.p), i = byId(pl.nums, e.c.id);
      if (i >= 0) pl.nums.splice(i, 1);
      Object.assign(pl, { status: 'bust', bustCard: e.c });
      // Lá úp cùng số trong Sương Mù: lật ngửa 1 lá để mọi người thấy trùng.
      const hidIdx = pl.nums.findIndex(c => c.k === 'h');
      if (hidIdx >= 0 && !pl.nums.some(c => c.k === 'n' && c.v === e.c.v)) pl.nums[hidIdx] = { ...e.c, id: pl.nums[hidIdx].id };
      S.bust(); pulse(e.p, 'hit');
      if (e.p === m) flash('bust');
      renderPlayers(); renderTop();
      float(e.p, '💥 CHÁY!', 'bad');
      say(e.p, 'bust', 0.8);
      log(`💥 ${who(e.p)} rút trùng số ${cardText(e.c)} — <b>CHÁY!</b>${V.event === 'mercy' ? ' (Đỡ Đòn: giữ nửa điểm lá số)' : ''}`);
      await sleep(900);
      break;
    }
    case 'save': {
      const pl = P(e.p), i = byId(pl.nums, e.c.id);
      if (i >= 0) pl.nums.splice(i, 1);
      pl.sc = null;
      S.save(); pulse(e.p, 'saved');
      renderPlayers();
      float(e.p, '💖 Thoát!');
      say(e.p, 'saved', 0.7);
      log(`💖 ${who(e.p)} rút trùng ${cardText(e.c)} nhưng có <b>Cơ Hội Thứ Hai</b> — bỏ cả hai lá, không cháy!`);
      await sleep(700);
      break;
    }
    case 'flip7':
      P(e.p).status = 'flip7';
      renderPlayers();
      SFX.win(); UI.confetti(160); flash('gold');
      say(e.p, 'flip7');
      log(`🌟 ${who(e.p)} gom đủ ${flipNeed(V.event)} số khác nhau — <b>FLIP ${flipNeed(V.event)}!</b> +${flipBonus(V.event)} điểm, vòng kết thúc!`);
      await spot('<div class="big-ic">🌟</div>', `${who(e.p)} FLIP ${flipNeed(V.event)}!<small>+${flipBonus(V.event)} điểm thưởng</small>`, 'flip', 1900);
      break;
    case 'stay': {
      const pl = P(e.p);
      pl.status = 'stay';
      if (e.bonus) pl.bonus = (pl.bonus || 0) + e.bonus;
      S.stay();
      renderPlayers();
      say(e.p, 'stay', 0.3);
      if (e.bonus) float(e.p, `🐦 +${e.bonus}`);
      const pts = roundScore(pl, V.event);
      log(`✋ ${who(e.p)} dừng${pts != null ? ` với <b>${pts}</b> điểm` : ''}${e.bonus ? ` (🐦 Chim Sớm +${e.bonus})` : ''}${e.empty ? ' (hết bài để rút)' : ''}.`);
      break;
    }
    case 'act': {
      const c = e.c, A = ACTIONS[c.v];
      dropPend(c.id);
      renderPlayers();
      if (e.p !== e.to) await fly(cardHTML(c), anchor(e.p), anchor(e.to), { ms: 520 });
      const self = e.p === e.to;
      if (c.v === 'freeze') {
        P(e.to).status = 'frozen';
        S.freeze(); pulse(e.to, 'frost');
        float(e.to, '❄️');
        if (!self) say(e.to, 'frozen', 0.6);
        const pts = roundScore(P(e.to), V.event);
        log(`❄️ ${who(e.p)} ${self ? 'tự <b>đóng băng</b> mình' : `<b>đóng băng</b> ${who(e.to)}`}${pts != null ? ` — giữ ${pts} điểm` : ''}.`);
      } else if (c.v === 'second') {
        P(e.to).sc = c;
        S.save();
        log(`💖 ${who(e.p)} tặng <b>Cơ Hội Thứ Hai</b> cho ${who(e.to)}.`);
      } else if (c.v === 'three') {
        SFX.tele();
        if (!self) say(e.to, 'three', 0.6);
        log(`🎲 ${who(e.p)} bắt ${self ? '<b>chính mình</b>' : who(e.to)} <b>lật liền 3 lá</b>!`);
      } else log(`${A.icon} ${who(e.p)} dùng <b>${A.name}</b> lên ${who(e.to)}!`);
      renderPlayers();
      await sleep(250);
      break;
    }
    case 'swap': {
      const a = P(e.p), b = P(e.to);
      if (e.give) { const i = byId(a.nums, e.give.id); if (i >= 0) a.nums.splice(i, 1); }
      { const i = byId(b.nums, e.take.id); if (i >= 0) b.nums.splice(i, 1); }
      renderPlayers();
      SFX.whoosh();
      await Promise.all([fly(cardHTML(e.take), anchor(e.to), slotOf(e.p), { ms: 650 }), e.give ? fly(cardHTML(e.give), anchor(e.p), slotOf(e.to), { ms: 650 }) : null]);
      a.nums.push(e.take);
      if (e.give) b.nums.push(e.give);
      renderPlayers();
      log(`🔀 ${who(e.p)} lấy ${cardText(e.take)} của ${who(e.to)}${e.give ? `, đưa lại ${cardText(e.give)}` : ''}.`);
      await sleep(200);
      break;
    }
    case 'steal': {
      const a = P(e.p), b = P(e.from), c = e.c;
      if (c.k === 'm') { const i = byId(b.mods, c.id); if (i >= 0) b.mods.splice(i, 1); }
      else if (c.k === 'a') b.sc = null;
      else { const i = byId(b.nums, c.id); if (i >= 0) b.nums.splice(i, 1); else { const h = b.nums.findIndex(x => x.k === 'h'); if (h >= 0) b.nums.splice(h, 1); } }
      renderPlayers();
      SFX.tele();
      await fly(cardHTML(c), anchor(e.from), slotOf(e.p), { ms: 600 });
      if (c.k === 'm') a.mods.push(c); else if (c.k === 'a') a.sc = c; else a.nums.push(c);
      renderPlayers();
      say(e.p, 'steal', 0.5);
      log(`🧲 ${who(e.p)} hút ${cardText(c)} của ${who(e.from)}!`);
      break;
    }
    case 'peek':
      S.magic();
      log(`🔮 ${who(e.p)} ${e.p === m ? '' : 'đang '}lén xem ${e.n} lá trên cùng...`);
      break;
    case 'peeked':
      dropPend(V.pend.find(d => d.seat === e.p && d.card.v === 'peek')?.card.id);
      renderPlayers();
      if (e.bury) SFX.whoosh();
      log(`🔮 ${who(e.p)} ${e.bury ? '<b>chôn</b> lá trên cùng xuống đáy chồng bài' : 'để nguyên chồng bài'}.`);
      break;
    case 'fizzle':
      dropPend(e.c.id);
      renderPlayers();
      log(`🗑️ ${actName(e.c.v)} của ${who(e.p)} bị bỏ — ${e.why === 'out' ? 'người rút đã ra khỏi vòng' : 'không có ai nhận được'}.`);
      break;
    case 'roundEnd': {
      for (const r of e.res) Object.assign(P(r.p), { nums: r.nums, total: r.total, bonus: r.bonus });
      renderPlayers();
      const rows = e.res.slice().sort((a, b) => b.pts - a.pts).map(r => `<li style="--c:${col(r.p)}"><span class="av">${SEATS[r.p].label}</span><span class="grow">${nm(r.p)}</span>
        <span class="st">${STATUS[r.status] || ''}</span><b class="${r.pts ? '' : 'zero'}">+${r.pts}</b><span class="tot">${r.total}</span></li>`).join('');
      for (const r of e.res) if (r.pts) float(r.p, `+${r.pts}`);
      log(`<span class="sep">— Hết vòng ${e.n}: ${e.res.filter(r => r.pts).sort((a, b) => b.pts - a.pts).map(r => `${who(r.p)} +${r.pts}`).join(', ') || 'không ai có điểm'} —</span>`);
      SFX.card();
      await spot(`<div class="sum"><h3>Hết vòng ${e.n}</h3><ol>${rows}</ol></div>`, '', 'summary', 3300);
      break;
    }
    case 'over':
      V.phase = 'over';
      SFX.win(); UI.fireworks(6, () => SFX.pop()); UI.confetti();
      for (const p of e.winners) say(p, 'win');
      log(`🏆 ${e.winners.map(who).join(', ')} thắng với <b>${P(e.winners[0]).total}</b> điểm!`);
      await sleep(1000);
      break;
  }
}

// ================= MODAL =================
function openTagged(tag, html) { modalTag = tag; return UI.openModal(`<div class="f7-m">${html}</div>`); }
function closeTagged() { if (modalTag) { UI.closeModal(); modalTag = ''; } }
const mq = s => document.querySelector('#modal ' + s);

function showGameOver() {
  overShown = true;
  const host = CTX.me().isHost, medal = ['🏆', '🥈', '🥉'];
  openTagged('over', `<h2 class="center">🏆 ${V.winners.map(nm).join(' & ')} thắng!</h2>
    <ol class="rank">${V.results.map((r, i) => `<li style="--c:${col(r.p)}"><span>${medal[i] || i + 1 + '.'}</span><span class="grow">${nm(r.p)}</span><b>${r.total} điểm</b></li>`).join('')}</ol>
    <div class="btns"><button class="ghost" data-a="close">👀 Xem bàn</button>
    ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}</div>`);
  const on = (a, fn) => { const b = mq(`[data-a="${a}"]`); if (b) b.onclick = () => { closeTagged(); fn(); }; };
  on('close', () => {});
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

function showHelp() {
  const chaos = V && V.chaos;
  const acts = Object.values(ACTIONS).filter(A => chaos || !A.chaos).map(A => `<li>${A.icon} <b>${A.name}</b>${A.chaos ? ' <span class="tag">Bất Ngờ</span>' : ''} (${A.n} lá) — ${A.desc}</li>`).join('');
  openTagged('help', `<div class="help">
    <h2>📖 Luật chơi — Flip 7</h2>
    <h3>Cơ bản</h3><ul>
      <li>Đầu mỗi vòng, mỗi người được chia 1 lá ngửa. Sau đó lần lượt từng người chọn <b>🎴 Rút</b> thêm 1 lá hoặc <b>✋ Dừng</b> (giữ điểm, ngồi chờ hết vòng).</li>
      <li>Lá số 0–12: số <b>n</b> có <b>n</b> lá (số 0 có 1 lá) — số càng lớn càng dễ trùng. Rút phải số <b>đã có</b> → <b>💥 CHÁY</b>: mất trắng điểm vòng này.</li>
      <li>Gom đủ <b>7 số khác nhau</b> → <b>🌟 FLIP 7</b>: +15 điểm và vòng kết thúc ngay (ai chưa cháy vẫn được tính điểm).</li>
      <li>Điểm vòng = tổng lá số (lá <b>×2</b> nhân đôi phần này) + các lá <b>+2 … +10</b> + thưởng Flip 7.</li>
      <li>Vòng hết khi không còn ai đang chơi. Cuối vòng có người đạt <b>${V ? V.target : 200}</b> điểm → người cao nhất thắng (hoà thì đánh thêm vòng).</li>
      <li>Mỗi lượt có ${Math.round(CTX.room().turnMs / 1000)} giây — hết giờ máy chọn <b>Dừng</b> giúp.</li>
    </ul>
    <h3>Lá hành động — rút được thì chọn người nhận</h3><ul>${acts}</ul>
    ${chaos ? `<h3>🎁 Bất Ngờ</h3><ul><li>${RAINBOW.icon} <b>${RAINBOW.name}</b> (${RAINBOW.n} lá) — ${RAINBOW.desc}</li></ul>
    <h3>Sự kiện vòng (mỗi vòng bốc 1)</h3><ul>${Object.values(EVENTS).map(x => `<li>${x.icon} <b>${x.name}</b> — ${x.desc}</li>`).join('')}</ul>` : ''}
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Hiểu rồi, chơi thôi!</button></div></div>`);
  mq('[data-x]').onclick = closeTagged;
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
  const tb = $('#f7-timer');
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
  if (msg.meta && msg.meta.auto != null) log(`⏱️ ${[].concat(msg.meta.auto).map(who).join(', ')} hết giờ — máy chọn giúp.`);
  playing = false;
  SPEED = 1;
  V = structuredClone(msg.state);
  deadline = msg.deadlineIn ? msg.recvAt + msg.deadlineIn : 0;
  renderAll();
  const dec = decider();
  if (dec != null && dec === mySeat() && lastDecider !== dec && !hidden) SFX.myTurn();
  lastDecider = dec;
  if (V.phase === 'over' && !overShown) setTimeout(showGameOver, 1200);
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root; SEATS = ctx.game.seats;
    V = null; pending = false; playing = false; SPEED = 1; QUICK = false; deadline = 0; overShown = false; modalTag = ''; lastDecider = null;
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    UI.emoteBar($('#f7-emotes'));
    UI.toolbar($('#f7-tools'), { help: showHelp });
    $('#f7-actions').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.a) send({ type: b.dataset.a });
      else if (b.dataset.to != null) send({ type: 'target', to: +b.dataset.to });
      else if (b.dataset.peek != null) send({ type: 'peek', bury: b.dataset.peek === '1' });
    });
    keyHandler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || UI.modalOpen() || !V || V.pend.length) return;
      if (e.key === '1') send({ type: 'hit' });
      else if (e.key === '2') send({ type: 'stay' });
    };
    addEventListener('keydown', keyHandler);
    timerInt = setInterval(tickTimers, 100);
    return {
      update,
      onRoom: () => { if (V && !playing) renderPlayers(); },
      emoteAnchor: seat => (V && seat >= 0 && V.players[seat] && V.players[seat].status !== 'off' ? anchor(seat) : null),
      unmount() { clearInterval(timerInt); removeEventListener('keydown', keyHandler); V = null; },
    };
  },
};
