// 🎭 Coup — giao diện client. Xem "Game client interface" trong CLAUDE.md.
// V = bản trạng thái để VẼ: trong lúc diễn sự kiện, V được cập nhật dần theo từng sự kiện; diễn xong thì thay bằng state thật từ server.
import { ROLES, ACTIONS, EVENTS, ITEMS, GHOST, FACTIONS, costOf, MUST_COUP, ecoRole } from './data.js';

let CTX, UI, SFX, ROOT, V, SEATS;
let pending = false, playing = false, SPEED = 1, QUICK = false, deadline = 0, overShown = false, timerInt = 0, turnKey = '', exSel = new Set();

const $ = s => ROOT.querySelector(s);
const sleep = ms => (QUICK ? Promise.resolve() : new Promise(r => setTimeout(r, ms / SPEED)));
const mySeat = () => CTX.me().seat;
const P = p => V.players[p];
const nm = p => UI.esc(V.players[p] ? V.players[p].name : '?');
const col = p => (SEATS[p] ? SEATS[p].color : '#888');
const who = p => `<b class="pn" style="--c:${col(p)}">${nm(p)}</b>`;
const active = () => V.players.map((pl, i) => (pl.active ? i : -1)).filter(i => i >= 0);
const alive = p => P(p) && P(p).active && P(p).alive;
const me = () => (mySeat() >= 0 && P(mySeat()) && P(mySeat()).active ? P(mySeat()) : null);
const hiddenOf = pl => pl.cards.filter(c => !c.dead);
const rn = r => (r && ROLES[r] ? `${ROLES[r].icon} ${ROLES[r].name}` : '?');
const rt = r => `<span class="rtag">${rn(r)}</span>`;
const an = a => `${ACTIONS[a].icon} ${ACTIONS[a].name}`;
const factionLock = () => V.factions && new Set(active().filter(alive).map(p => P(p).faction)).size > 1;
const canTarget = (a, t) => alive(t) && a !== t && !(factionLock() && P(a).faction === P(t).faction);

// Mô tả ngắn trên nút hành động (theo biến cố hiện tại).
function shortOf(a) {
  const c = costOf(a, V.event);
  switch (a) {
    case 'income': return `+${V.event === 'inflation' ? 2 : 1} xu · không ai chặn`;
    case 'aid': return `+${V.event === 'harvest' ? 3 : 2} xu · ${V.roles.filter(r => ROLES[r].slot === 'eco').map(r => ROLES[r].icon).join('')} chặn được`;
    case 'coup': return `${c} xu · mục tiêu mất 1 lá`;
    case 'tax': return '+3 xu';
    case 'gamble': return '+2 xu, 50% thêm +2';
    case 'kill': return `${c} xu · mục tiêu mất 1 lá`;
    case 'poison': return `${c} xu · mục tiêu đưa 3 xu hoặc mất 1 lá`;
    case 'steal': return 'lấy 2 xu của 1 người';
    case 'spy': return 'lấy 1 xu + xem lén 1 lá';
    case 'exchange': return 'rút 2 lá, đổi bài';
    case 'inquire': return 'xem 1 lá, có thể bắt đổi';
    case 'convert': return '1 xu tự đổi · 2 xu đổi người khác';
    case 'embezzle': return `lấy ${V.alms} xu trong Quỹ`;
  }
  return '';
}

// ================= LỜI THOẠI =================
const SAY = {
  challenge: ['Xạo! ❗', 'Không tin! 🤨', 'Bịp hả? 😏', 'Cho xem đi!', 'Tui nghi lắm...'],
  prove: ['Thật 100% 😎', 'Tin chưa?', 'Đã bảo mà!', 'Hehe 😏'],
  caught: ['Ối... 😅', 'Bị lộ rồi 😭', 'Hông phải tui!', 'Sao biết hay vậy 😳'],
  block: ['Không được đâu! 🛡️', 'Chặn!', 'Đừng hòng 😤', 'Mơ đi!'],
  out: ['Hẹn ván sau 👋', 'Tui sẽ quay lại...', 'Oan quá 😭'],
  win: ['Thiên hạ là của ta! 👑', 'Bịp giỏi chưa 😎', 'Dễ ợt 🏆'],
};
function bubble(p, text, ms = 1800) {
  if (p == null || QUICK) return;
  const b = ROOT.querySelector(`.mat[data-p="${p}"] .bubble`);
  if (!b) return;
  b.innerHTML = text;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('show'), ms / SPEED);
}
const say = (p, kind, prob = 1) => { if (Math.random() <= prob) bubble(p, UI.esc(UI.pick(SAY[kind]))); };

// ================= ÂM THANH =================
const S = {
  coin() { [1320, 1760].forEach((f, i) => SFX.tone(f, 0.08, { type: 'triangle', v: 0.06, delay: i * 0.05 })); },
  lose() { SFX.tone(160, 0.5, { type: 'sawtooth', v: 0.1, to: 60 }); SFX.noise(0.3, { v: 0.15, f: 400, ft: 'lowpass' }); },
  drum() { SFX.tone(85, 0.22, { v: 0.4, to: 50 }); SFX.tone(70, 0.4, { v: 0.45, to: 40, delay: 0.22 }); },
  reveal() { SFX.noise(0.12, { v: 0.16, f: 2600, q: 0.8 }); [660, 990].forEach((f, i) => SFX.tone(f, 0.15, { type: 'triangle', v: 0.07, delay: 0.08 + i * 0.08 })); },
  magic() { [660, 880, 1320].forEach((f, i) => SFX.tone(f, 0.22, { type: 'sine', v: 0.06, delay: i * 0.07 })); },
  ghost() { SFX.tone(520, 0.9, { type: 'sine', v: 0.06, to: 300 }); SFX.tone(530, 0.9, { type: 'sine', v: 0.05, to: 310, delay: 0.05 }); },
  shield() { SFX.tone(300, 0.15, { type: 'square', v: 0.06 }); SFX.tone(450, 0.2, { type: 'square', v: 0.05, delay: 0.1 }); },
};

// ================= VẼ =================
// Lá: c = { id, r, dead } (mình / đã lật) | { k } (úp — k = vai mình đã xem lén được, nếu có).
// p = chủ lá (lá úp vẽ theo lưng bài người đó mua ở cửa hàng).
function cardMini(c, p) {
  if (c.dead) return `<div class="cd face dead" title="${UI.esc(ROLES[c.r].name)} (đã mất)"><i>${ROLES[c.r].icon}</i></div>`;
  if (c.r) return `<div class="cd face mine" title="${UI.esc(ROLES[c.r].name)}"><i>${ROLES[c.r].icon}</i></div>`;
  return `<div class="cd back${c.k ? ' known' : ''}${CTX.skin.cls(p, 'back')}" title="${c.k ? 'Bạn đã xem lén: ' + UI.esc(ROLES[c.k].name) : 'Lá úp'}">${c.k ? `<i>${ROLES[c.k].icon}</i>` : ''}</div>`;
}
function cardBig(c, cls = '', extra = '') {
  const R = ROLES[c.r];
  return `<button class="cb ${c.dead ? 'dead' : ''} ${cls}" data-id="${c.id}" ${extra} title="${UI.esc(R.desc)}">
    <span class="ci">${R.icon}</span><b>${R.name}</b><small>${R.desc}</small></button>`;
}

const TEMPLATE = `<div class="cp">
  <div class="cp-main">
    <div id="cp-table" class="dark">
      <div id="cp-center"></div>
      <div id="cp-mats"></div>
    </div>
    <div id="cp-status"></div>
    <div class="cp-timer"><i id="cp-timer"></i></div>
    <div id="cp-actions"></div>
    <div id="cp-hand"></div>
  </div>
  <aside class="cp-side">
    <div class="cp-head"><b>🎭 Coup</b><span id="cp-mode" class="muted small"></span></div>
    <div id="cp-roles"></div>
    <div id="cp-event"></div>
    <div id="cp-log"></div>
    <div id="cp-emotes"></div>
    <div id="cp-tools"></div>
  </aside>
</div>`;

// Ghế xếp quanh bàn hình bầu dục, mình luôn ngồi giữa cạnh dưới.
function layout() {
  const seats = active(), m = mySeat(), n = seats.length;
  const start = Math.max(0, seats.indexOf(m)), rx = innerWidth < 640 ? 32 : 40;
  const pos = {};
  seats.forEach((p, i) => {
    const a = Math.PI / 2 + ((i - start + n) % n) * 2 * Math.PI / n;
    pos[p] = { x: 50 + rx * Math.cos(a), y: 50 + 38 * Math.sin(a) };
  });
  return pos;
}

// Ai đang phải quyết định.
function askedSeats() {
  if (!V || V.phase === 'over') return [];
  if (V.phase === 'act') return [V.cur];
  if (V.phase === 'react') return V.win ? V.win.seats : [];
  return V.step ? [V.step.p] : [];
}

let targetPick = null;   // { a, list } — đang chọn mục tiêu bằng cách bấm vào ghế
function renderMats() {
  const pos = layout(), m = mySeat(), room = CTX.room(), asked = askedSeats(), Pd = V.pend;
  $('#cp-mats').innerHTML = active().map(p => {
    const pl = P(p), off = room && room.seats[p] && room.seats[p].kind === 'human' && !room.seats[p].online;
    const passed = V.phase === 'react' && V.win && V.win.passed.includes(p);
    const claims = pl.claims.map(r => `<span title="Đã tự nhận ${UI.esc(ROLES[r].name)}">${ROLES[r].icon}</span>`).join('')
      + pl.caught.filter(r => !pl.claims.includes(r)).map(r => `<span class="caught" title="Bị bắt bài khi nhận ${UI.esc(ROLES[r].name)}">${ROLES[r].icon}</span>`).join('');
    const F = pl.faction != null ? FACTIONS[pl.faction] : null;
    const role = Pd && Pd.by === p ? 'actor' : Pd && Pd.t === p ? 'target' : Pd && Pd.block && Pd.block.by === p ? 'blocker' : '';
    const can = targetPick && targetPick.list.includes(p);
    return `<div class="mat${asked.includes(p) ? ' turn' : ''}${!pl.alive ? ' dead' : ''}${pl.ghost ? ' ghost' : ''}${p === m ? ' me' : ''}${role ? ' ' + role : ''}${can ? ' can' : ''}${passed ? ' passed' : ''}"
      data-p="${p}" style="--c:${col(p)};left:${pos[p].x}%;top:${pos[p].y}%">
      <div class="mat-head"><span class="av">${pl.alive ? (SEATS[p].label || '🙂') + CTX.skin.face(p, 'fill') : pl.ghost ? '👻' : '💀'}</span>
        <span class="mat-name">${pl.kind === 'bot' ? '<span class="bot">🤖 </span>' : ''}${nm(p)}${off ? ' 📴' : ''}</span>
        ${F ? `<span class="fac" style="--f:${F.color}" title="Phe ${F.name}">${F.icon}</span>` : ''}</div>
      <div class="mat-row"><span class="coins" title="Xu">🪙 <b>${pl.coins}</b></span><span class="cards">${pl.cards.map(c => cardMini(c, p)).join('')}</span></div>
      <div class="mat-sub">${claims && pl.alive ? `<span class="claims">${claims}</span>` : ''}${pl.nItems ? `<span class="items" title="Món chợ đen đang giữ">🎒${pl.nItems}</span>` : ''}${passed ? '<span class="ok">✓</span>' : ''}${!pl.alive ? (pl.ghost ? `<span>👻 Hồn ma${pl.gUsed ? '' : ' ✨'}</span>` : '<span>☠️ Bị loại</span>') : ''}</div>
      <div class="bubble"></div>
      <div class="mat-timer"><i></i></div>
    </div>`;
  }).join('');
}

function pendText() {
  const Pd = V.pend;
  if (!Pd) return '';
  const A = ACTIONS[Pd.act];
  let s = `${who(Pd.by)} <b>${an(Pd.act)}</b>${Pd.t != null && Pd.act !== 'convert' ? ` → ${who(Pd.t)}` : ''}`;
  if (Pd.act === 'convert') s += Pd.t === Pd.by ? ' (tự đổi phe)' : ` → ${who(Pd.t)}`;
  if (A.role) s += `<div class="small">tự nhận ${rt(A.role)}</div>`;
  if (Pd.act === 'embezzle') s += `<div class="small">tự nhận KHÔNG có ${rt(ecoRole(V.roles))}</div>`;
  if (Pd.block) s += `<div class="small blk">🛡️ ${who(Pd.block.by)} chặn bằng ${rt(Pd.block.role)}</div>`;
  return s;
}

function renderCenter() {
  const box = $('#cp-center'), E = V.event && EVENTS[V.event];
  let main = '';
  if (V.phase === 'over') main = `<div class="big">🏆 ${who(V.winner)}</div><div class="small">thắng ván!</div>`;
  else if (V.pend) {
    main = `<div class="act">${pendText()}</div>`;
    if (V.phase === 'react' && V.win) main += `<div class="small wait">${V.win.mode === 'block' ? 'Ai thách thức người chặn?' : 'Ai thách thức / chặn?'} · chờ ${V.win.seats.length} người</div>`;
    else if (V.step && V.step.k === 'lose') main += `<div class="small wait">${who(V.step.p)} đang chọn lá để mất...</div>`;
    else if (V.step && V.step.k !== 'end') main += `<div class="small wait">${who(V.step.p)} đang quyết định...</div>`;
  } else main = `<div class="small">Lượt của</div><div class="big">${who(V.cur)}</div>`;
  box.innerHTML = `<div class="rnd">Vòng ${V.round} · 🂠 ${V.deck} lá trong chồng${V.factions ? ` · 🏦 Quỹ ${V.alms} xu` : ''}</div>${main}${E ? `<div class="ev-chip" title="${UI.esc(E.desc)}">${E.icon} ${E.name}</div>` : ''}`;
  $('#cp-mode').textContent = (V.chaos ? '🎁 Bất Ngờ' : '😇 Cổ điển') + (V.factions ? ' · 🦁🦅 Phe phái' : '');
  $('#cp-event').innerHTML = E && !E.now ? `<b>${E.icon} ${E.name}</b><span>${E.desc}</span>` : '';
  $('#cp-event').classList.toggle('hidden', !E || !!E.now);
}

function renderRoles() {
  $('#cp-roles').innerHTML = V.roles.map(r => {
    const R = ROLES[r];
    return `<div class="role${R.chaos ? ' new' : ''}" title="${UI.esc(R.desc)}"><span class="ci">${R.icon}</span><div><b>${R.name}</b>${R.chaos ? ' <em>mới</em>' : ''}<small>${R.desc}</small></div></div>`;
  }).join('') + (V.chaos && V.market.length ? `<div class="market"><b>🕶️ Chợ đen vòng này:</b> ${V.market.map(k => `<span title="${UI.esc(ITEMS[k].desc)}">${ITEMS[k].icon} ${ITEMS[k].name} (${ITEMS[k].cost}🪙)</span>`).join(' ')}</div>` : '');
}

// Các hành động của mình trong lượt.
function myActions() {
  const pl = me(), mine = hiddenOf(pl).map(c => c.r), c = pl.coins;
  const must = c >= MUST_COUP && V.event !== 'martial';
  const targets = active().filter(t => canTarget(mySeat(), t));
  const list = ['income', 'aid', 'coup', ...V.roles.map(r => ROLES[r].act).filter(Boolean), ...(V.factions ? ['convert', 'embezzle'] : [])];
  return list.map(a => {
    const A = ACTIONS[a], cost = a === 'convert' ? 1 : costOf(a, V.event);
    let why = '';
    if (must && a !== 'coup') why = `Có ${MUST_COUP} xu là phải Đảo Chính`;
    else if (a === 'coup' && V.event === 'martial') why = 'Thiết Quân Luật';
    else if (c < cost) why = `Cần ${cost} xu`;
    else if (A.target && !targets.length) why = 'Không có mục tiêu';
    else if (a === 'embezzle' && !V.alms) why = 'Quỹ trống';
    const eco = ecoRole(V.roles);
    const bluff = A.role ? !mine.includes(A.role) : a === 'embezzle' ? mine.includes(eco) : false;
    return { a, why, bluff, role: A.role || (a === 'embezzle' ? eco : null) };
  });
}

function renderControls() {
  const m = mySeat(), pl = me(), status = $('#cp-status'), acts = $('#cp-actions');
  let msg = '', btns = '';
  status.classList.remove('mine');
  const mine = () => status.classList.add('mine');
  const W = V.win, step = V.step;
  if (!pl) msg = '👀 Bạn đang xem.';
  else if (V.phase === 'over') msg = V.winner === m ? '🏆 Bạn đã thâu tóm triều đình!' : 'Ván đã kết thúc.';
  else if (!pl.alive) {
    if (pl.ghost && !pl.gUsed) {
      mine();
      msg = '👻 Bạn là hồn ma — mỗi vòng bàn được quậy 1 lần:';
      btns = Object.entries(GHOST).map(([g, G]) => `<button class="ghost act" data-ghost="${g}" title="${UI.esc(G.desc)}"><b>${G.icon} ${G.name}</b><small>${G.desc}</small></button>`).join('');
    } else msg = pl.ghost ? '👻 Vòng bàn này bạn quậy rồi — chờ vòng sau nhé.' : '☠️ Bạn đã bị loại. Ngồi xem mọi người bịp nhau nhé.';
  } else if (V.phase === 'act' && V.cur === m) {
    mine();
    if (targetPick) {
      msg = `🎯 Bấm vào người muốn nhắm (${targetPick.label})`;
      btns = '<button class="ghost" data-a="cancel">↩️ Thôi</button>';
    } else {
      const must = pl.coins >= MUST_COUP && V.event !== 'martial';
      msg = must ? `💥 Bạn có ${pl.coins} xu — <b>bắt buộc Đảo Chính</b>.` : 'Lượt bạn: chọn 1 hành động. Nút <span class="tag bluff">🎭 bịp</span> = nhận vai mình không có.';
      btns = myActions().map(x => `<button class="act ${x.bluff ? 'is-bluff' : ''} ${x.a === 'coup' ? 'coup' : ''}" data-act="${x.a}" ${x.why ? `disabled title="${UI.esc(x.why)}"` : ''}>
        <b>${an(x.a)}${x.role ? ` <span class="tag ${x.bluff ? 'bluff' : 'real'}">${x.a === 'embezzle' ? 'không ' : ''}${ROLES[x.role].icon}${x.bluff ? ' bịp' : ''}</span>` : ''}</b><small>${x.why || shortOf(x.a)}</small></button>`).join('');
      if (V.chaos && !V.bought && V.market.length) {
        btns += '<div class="mk"><span class="lbl">🕶️ Chợ đen:</span>' + V.market.map(k => {
          const I = ITEMS[k], has = (pl.items || []).includes(k);
          return `<button class="ghost item" data-buy="${k}" ${pl.coins < I.cost || has ? 'disabled' : ''} title="${UI.esc(I.desc)}">${I.icon} ${I.name} <b>${I.cost}🪙</b></button>`;
        }).join('') + '</div>';
      }
    }
  } else if (V.phase === 'react' && W && W.seats.includes(m) && W.opts) {
    mine();
    const Pd = V.pend;
    if (W.mode === 'block') msg = `🛡️ ${who(Pd.block.by)} chặn ${an(Pd.act)} bằng ${rt(Pd.block.role)}.${Pd.by === m ? ' (hành động của <b>bạn</b>)' : ''} Tin không?`;
    else {
      msg = `${who(Pd.by)} ${an(Pd.act)}${Pd.t != null ? ` → ${Pd.t === m ? '<b class="you">BẠN</b>' : who(Pd.t)}` : ''}`;
      if (Pd.role) msg += ` — tự nhận ${rt(Pd.role)}`;
      if (Pd.act === 'embezzle') msg += ` — tự nhận KHÔNG có ${rt(ecoRole(V.roles))}`;
      msg += W.mode === 'blockOnly' ? '. Chặn không?' : '.';
    }
    const mineR = hiddenOf(pl).map(c => c.r);
    btns = '<button class="ghost" data-a="pass">✅ Cho qua</button>'
      + (W.opts.ch ? '<button class="danger" data-a="challenge">❗ Thách thức</button>' : '')
      + W.opts.bl.map(r => `<button class="blk ${mineR.includes(r) ? '' : 'is-bluff'}" data-block="${r}">🛡️ Chặn bằng ${rn(r)}${mineR.includes(r) ? '' : ' <span class="tag bluff">🎭 bịp</span>'}</button>`).join('');
  } else if (V.phase === 'lose' && step.p === m) {
    mine();
    const why = { challenge: 'thách thức sai', caught: 'bị bắt bài', coup: 'bị Đảo Chính', kill: 'bị Ám Sát', poison: 'trúng độc' }[step.why] || '';
    msg = `💔 Bạn mất 1 ảnh hưởng${why ? ` (${why})` : ''} — <b>bấm vào 1 lá</b> để lật bỏ.`;
  } else if (V.phase === 'poison' && step.p === m) {
    mine();
    msg = `🧪 Bạn bị ${who(V.pend ? V.pend.by : step.by)} hạ độc! Mua thuốc giải hay chịu mất 1 lá?`;
    btns = `<button class="gold" data-poison="1">💰 Đưa 3 xu cho ${nm(step.by)}</button><button class="danger" data-poison="0">💔 Mất 1 ảnh hưởng</button>`;
  } else if (V.phase === 'exchange' && step.p === m) {
    mine();
    const n = hiddenOf(pl).length;
    msg = `📜 Chọn <b>${n}</b> lá để giữ (đang chọn ${exSel.size}/${n}), phần còn lại trả về chồng bài.`;
    btns = `<button class="gold" data-a="keep" ${exSel.size !== n ? 'disabled' : ''}>✔️ Giữ những lá này</button>`;
  } else if (V.phase === 'show' && step.p === m) {
    mine();
    msg = `🔮 ${who(step.by)} bói bài bạn — <b>bấm vào 1 lá</b> để cho xem (chỉ người đó thấy).`;
  } else if (V.phase === 'force' && step.p === m) {
    mine();
    const I = V.inq;
    msg = `🔮 Lá của ${who(step.t)} là <b>${I && I.r ? rn(I.r) : '?'}</b>. Bắt họ đổi lá này lấy lá mới?`;
    btns = '<button class="gold" data-force="1">🔄 Bắt đổi</button><button class="ghost" data-force="0">🙅 Thôi, để vậy</button>';
  } else if (V.phase === 'react' && W) {
    msg = W.passed.includes(m) ? '✅ Bạn cho qua — chờ người khác...' : `Chờ ${W.seats.length} người quyết định thách thức / chặn...`;
  } else if (V.phase === 'act') msg = `Chờ ${who(V.cur)} chọn hành động...`;
  else if (step) msg = `Chờ ${who(step.p)}...`;
  else if (V.pend) msg = `${who(V.pend.by)} ${an(V.pend.act)}${V.pend.t != null && V.pend.t !== V.pend.by ? ` → ${who(V.pend.t)}` : ''}...`;
  status.innerHTML = msg;
  acts.innerHTML = pending || playing ? '' : btns;
}

function renderHand() {
  const pl = me(), box = $('#cp-hand');
  if (!pl) { box.innerHTML = ''; return; }
  const m = mySeat(), step = V.step;
  const choose = !pending && !playing && step && step.p === m && (V.phase === 'lose' || V.phase === 'show');
  const ex = V.phase === 'exchange' && step && step.p === m && V.ex && V.ex.drawn;
  let cards = pl.cards.map(c => cardBig(c, (choose && !c.dead ? 'pick ' + V.phase : '') + (ex && !c.dead ? ' sel' + (exSel.has(c.id) ? ' on' : '') : ''))).join('');
  if (ex) cards += '<span class="plus">+</span>' + V.ex.drawn.map(c => cardBig(c, 'drawn sel' + (exSel.has(c.id) ? ' on' : ''))).join('');
  const items = (pl.items || []).map(k => `<span class="it" title="${UI.esc(ITEMS[k].desc)}">${ITEMS[k].icon} ${ITEMS[k].name}</span>`).join('');
  const F = pl.faction != null ? FACTIONS[pl.faction] : null;
  box.innerHTML = `<div class="purse"><span class="big">🪙 ${pl.coins}</span><small>xu</small>${F ? `<span class="fac" style="--f:${F.color}">${F.icon} ${F.name}</span>` : ''}${items ? `<div class="its">${items}</div>` : ''}</div><div class="hand">${cards}</div>`;
}

function renderAll() {
  if (!V) return;
  if (targetPick && !(V.phase === 'act' && V.cur === mySeat())) targetPick = null;
  renderMats();
  renderCenter();
  renderRoles();
  renderHand();
  renderControls();
}

// ================= HIỆU ỨNG =================
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
const matEl = p => ROOT.querySelector(`.mat[data-p="${p}"]`);
function anchor(p) { const el = matEl(p); return el ? centerOf(el) : { x: innerWidth / 2, y: 80 }; }
function pulse(el, cls, ms = 900) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
async function spot(html, cls = '', ms = 1000) {
  if (QUICK) return;
  const d = UI.el('div', 'cp-spot dark ' + cls, html);
  $('.cp').appendChild(d);
  await sleep(ms);
  d.classList.add('out');
  setTimeout(() => d.remove(), 300);
}
function log(html) {
  const box = $('#cp-log');
  box.appendChild(UI.el('div', 'li', html));
  while (box.children.length > 200) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}
const float = (p, html, cls = 'big') => { if (!QUICK) UI.floatAt(anchor(p), html, cls); };

// Đánh dấu 1 lá của ghế p là đã mất (lộ vai r) trong V.
function markDead(p, id, r) {
  const pl = P(p);
  let c = pl.cards.find(x => !x.dead && x.id === id) || pl.cards.find(x => !x.dead && x.k === r) || pl.cards.find(x => !x.dead);
  if (c) { c.dead = true; c.r = r; c.id = id; }
}

const WHY_LOSE = { challenge: 'thách thức sai', caught: 'bị bắt bài', coup: 'bị Đảo Chính', kill: 'bị Ám Sát', poison: 'trúng độc' };
const COIN_WHY = { income: 'Thu Nhập', aid: 'Viện Trợ', tax: 'Thu Thuế', gamble: 'Đánh Cược', steal: 'Cướp', spy: 'Do Thám', trial: '⚖️ thưởng thách thức đúng',
  refund: 'trả lại xu', windfall: '🎁 Lộc Trời', robin: '🏹', curse: '👻 quấy rối', bless: '👻 phù hộ', antidote: 'thuốc giải', embezzle: 'Biển Thủ' };

async function playEvent(e) {
  const m = mySeat();
  switch (e.t) {
    case 'start':
      log(`🎭 Vai trong ván: ${e.roles.map(rn).join(', ')}. Mỗi người 2 lá úp + 2 xu.`);
      break;
    case 'turn':
      Object.assign(V, { cur: e.p, phase: 'act', pend: null, win: null, step: null, bought: false });
      renderAll();
      log(`<span class="sep">— Lượt ${who(e.p)} —</span>`);
      break;
    case 'round':
      Object.assign(V, { round: e.r, event: e.event || null, market: e.market || V.market });
      V.players.forEach(pl => { if (pl.active) pl.gUsed = false; });
      log(`<span class="sep">═══ Vòng bàn ${e.r} ═══</span>`);
      renderAll();
      await sleep(300);
      break;
    case 'event': {
      const E = EVENTS[e.e];
      S.magic();
      log(`${E.icon} Biến cố: <b>${E.name}</b> — ${E.desc}`);
      renderCenter();
      await spot(`<div class="ico">${E.icon}</div><div class="cap">${E.name}</div><div class="sub">${E.desc}</div>`, 'omen', 1400);
      break;
    }
    case 'declare': {
      V.pend = { act: e.a, by: e.p, t: e.s, role: ACTIONS[e.a].role || null, cost: e.cost, block: null };
      V.phase = 'busy';   // đang diễn: chưa biết bước tiếp theo, chờ state thật
      const r = ACTIONS[e.a].role;
      if (r && !P(e.p).claims.includes(r)) P(e.p).claims.push(r);
      renderMats(); renderCenter();
      bubble(e.p, `${an(e.a)}${r ? `<small>${ROLES[r].icon} ${ROLES[r].name}</small>` : ''}`, 2200);
      SFX.click();
      log(`${who(e.p)} ${an(e.a)}${e.s != null && !(e.a === 'convert' && e.s === e.p) ? ` → ${who(e.s)}` : ''}${r ? ` <span class="muted">(nhận ${rn(r)})</span>` : ''}${e.a === 'embezzle' ? ` <span class="muted">(nhận không có ${rn(ecoRole(V.roles))})</span>` : ''}`);
      pulse(matEl(e.p), 'pop', 600);
      if (e.s != null && e.s !== e.p) pulse(matEl(e.s), 'aim', 900);
      await sleep(700);
      break;
    }
    case 'pass':
      if (V.win) V.win.passed.push(e.p);
      renderMats();
      break;
    case 'challenge':
      S.drum();
      say(e.p, 'challenge');
      log(`❗ ${who(e.p)} thách thức ${who(e.s)}: ${e.anti ? `thật sự KHÔNG có ${rn(e.r)}?` : `có ${rn(e.r)} thật không?`}`);
      await spot(`<div class="ico">❗</div><div class="cap">${who(e.p)} thách thức ${who(e.s)}</div><div class="sub">${e.anti ? 'không có ' : 'có '}${rn(e.r)}?</div>`, '', 900);
      break;
    case 'prove':
      S.reveal();
      say(e.p, 'prove');
      log(`✅ ${who(e.p)} ${e.anti ? `đúng là không có ${rn(e.r)}` : `lật ra ${rn(e.r)} — có thật!`} Người thách thức phải mất 1 lá.`);
      await spot(`<div class="ico">${e.anti ? '🙅' : ROLES[e.r].icon}</div><div class="cap">${who(e.p)} nói thật!</div><div class="sub">${e.anti ? 'Không có ' + rn(e.r) : rn(e.r) + ' — xáo lại vào chồng, rút lá mới'}</div>`, 'win', 1200);
      break;
    case 'redraw':
      if (e.p === m && e.r && me()) {
        const c = me().cards.find(x => x.id === e.old);
        if (c) Object.assign(c, { id: e.id, r: e.r });
        log(`🂠 Bạn rút được lá mới: ${rn(e.r)}`);
        renderHand();
      }
      break;
    case 'caught': {
      S.lose();
      say(e.p, 'caught');
      const pl = P(e.p);
      if (!e.anti) { pl.claims = pl.claims.filter(x => x !== e.r); if (!pl.caught.includes(e.r)) pl.caught.push(e.r); }
      log(`🎭 ${who(e.p)} bị bắt bài — ${e.anti ? `có ${rn(e.r)} trong tay!` : `không có ${rn(e.r)}!`}`);
      $('.cp-main').classList.remove('shake'); void $('.cp-main').offsetWidth; $('.cp-main').classList.add('shake');
      await spot(`<div class="ico">🤥</div><div class="cap">${who(e.p)} bịp!</div><div class="sub">${e.anti ? 'Đang giữ ' : 'Không có '}${rn(e.r)}</div>`, 'bad', 1200);
      break;
    }
    case 'mask':
      S.magic();
      log(`🎭 ${who(e.p)} đeo <b>Mặt Nạ</b> chuồn mất — không mất lá nào!`);
      float(e.p, '🎭 Thoát!');
      await sleep(700);
      break;
    case 'block': {
      V.pend && (V.pend.block = { by: e.p, role: e.r });
      const pl = P(e.p);
      if (!pl.claims.includes(e.r)) pl.claims.push(e.r);
      S.shield();
      bubble(e.p, `🛡️ Chặn!<small>${rn(e.r)}</small>`, 2200);
      log(`🛡️ ${who(e.p)} chặn ${an(e.a)} của ${who(e.s)} bằng ${rn(e.r)}`);
      renderMats(); renderCenter();
      await sleep(700);
      break;
    }
    case 'blocked':
      log(`🚫 ${an(e.a)} của ${who(e.s)} bị chặn.`);
      float(e.s, '🚫');
      await sleep(600);
      break;
    case 'resolve':
      break;
    case 'coins':
      for (const c of e.ch) {
        P(c.p).coins += c.d;
        float(c.p, `${c.d > 0 ? '+' : ''}${c.d} 🪙`, c.d > 0 ? 'big' : 'big neg');
      }
      if (e.why !== 'pay' && e.why !== 'buy') {
        const gain = e.ch.filter(c => c.d > 0);
        if (gain.length && COIN_WHY[e.why]) log(`🪙 ${gain.map(c => `${who(c.p)} +${c.d}`).join(', ')} <span class="muted">(${COIN_WHY[e.why]})</span>`);
      }
      if (e.ch.some(c => c.d > 0)) S.coin();
      renderMats(); renderHand();
      await sleep(450);
      break;
    case 'gamble':
      log(`🎲 ${who(e.p)} tung đồng xu... ${e.win ? '<b>NGỬA</b> — thêm 2 xu!' : 'sấp — chỉ được 2 xu.'}`);
      await spot(`<div class="ico coinflip">🪙</div><div class="cap">${e.win ? 'Ngửa! +4 xu' : 'Sấp... +2 xu'}</div>`, e.win ? 'win' : '', 1000);
      break;
    case 'lose': {
      markDead(e.p, e.id, e.r);
      S.lose();
      log(`💔 ${who(e.p)} mất ${rn(e.r)} <span class="muted">(${WHY_LOSE[e.why] || ''})</span>`);
      float(e.p, `💔 ${ROLES[e.r].icon}`);
      renderMats(); renderHand();
      pulse(matEl(e.p), 'hit', 800);
      await sleep(800);
      break;
    }
    case 'armor':
      S.shield();
      log(`🦺 Áo Giáp đỡ cho ${who(e.p)} — không mất lá!`);
      float(e.p, '🦺 Đỡ!');
      await sleep(800);
      break;
    case 'out':
      P(e.p).alive = false; P(e.p).ghost = e.ghost;
      renderMats();
      say(e.p, 'out', 0.8);
      SFX.tone(200, 0.8, { type: 'sawtooth', v: 0.08, to: 60 });
      log(`☠️ ${who(e.p)} mất hết ảnh hưởng — bị loại!${e.ghost ? ' Nhưng sẽ quay lại làm <b>hồn ma</b> 👻' : ''}`);
      await sleep(1000);
      break;
    case 'peek':
      if (e.p === m && e.r) {
        S.magic();
        const src = { spy: '🦊 Do Thám', glass: '🔍 Kính Lúp', ghost: '👂 Nghe Lén' }[e.src];
        log(`👁️ ${src}: ${who(e.s)} có lá <b>${rn(e.r)}</b>`);
        UI.toast(`👁️ ${nm(e.s)} có lá <b>${rn(e.r)}</b>`, 4000);
      } else log(`👁️ ${who(e.p)} lén xem 1 lá của ${who(e.s)}.`);
      pulse(matEl(e.s), 'peeked', 900);
      break;
    case 'exdraw':
      if (e.p === m && e.cards) V.ex = { p: m, drawn: e.cards };
      log(`📜 ${who(e.p)} rút ${e.cards ? e.cards.length : e.n} lá từ chồng bài.`);
      await sleep(400);
      break;
    case 'exdone':
      log(`📜 ${who(e.p)} trả ${e.n} lá về chồng bài.`);
      exSel = new Set();
      break;
    case 'show':
      if (e.r) log(`🔮 ${e.p === m ? 'Bạn' : who(e.p)} cho ${e.by === m ? 'bạn' : who(e.by)} xem lá <b>${rn(e.r)}</b>.`);
      else log(`🔮 ${who(e.p)} cho ${who(e.by)} xem 1 lá.`);
      if (e.r) V.inq = { by: e.by, t: e.p, id: e.id, r: e.r };
      await sleep(500);
      break;
    case 'force':
      log(e.yes ? `🔄 ${who(e.p)} bắt ${who(e.s)} đổi lá vừa xem.` : `🙅 ${who(e.p)} để ${who(e.s)} giữ nguyên lá.`);
      await sleep(500);
      break;
    case 'poisoned':
      log(e.pay ? `🧪 ${who(e.p)} mua thuốc giải 3 xu của ${who(e.by)}.` : `🧪 ${who(e.p)} chịu độc — mất 1 ảnh hưởng.`);
      break;
    case 'convert':
      P(e.s).faction = e.f;
      log(`🔁 ${who(e.s)} chuyển sang phe ${FACTIONS[e.f].icon} ${FACTIONS[e.f].name}.`);
      renderMats();
      await sleep(600);
      break;
    case 'embezzle':
      log(`💼 ${who(e.p)} biển thủ ${e.n} xu từ Quỹ Từ Thiện!`);
      V.alms = 0;
      break;
    case 'buy':
      SFX.tone(500, 0.1, { type: 'triangle', v: 0.06 });
      if (e.item) log(`🕶️ ${e.p === m ? 'Bạn' : who(e.p)} mua ${ITEMS[e.item].icon} <b>${ITEMS[e.item].name}</b>${e.s != null ? ` soi ${who(e.s)}` : ''} ở chợ đen.`);
      else log(`🕶️ ${who(e.p)} mua 1 món bí mật ở chợ đen 🎒`);
      V.bought = true;
      float(e.p, '🕶️');
      await sleep(500);
      break;
    case 'ghost': {
      const G = GHOST[e.g];
      S.ghost();
      log(`👻 Hồn ma ${who(e.p)}: ${G.icon} ${G.name} → ${who(e.s)}`);
      float(e.s, G.icon);
      P(e.p).gUsed = true;
      await sleep(600);
      break;
    }
    case 'shuffle': {
      SFX.whoosh();
      for (const mv of e.moves) {
        if (mv.from === m && mv.r) log(`🔄 Bạn chuyền ${rn(mv.r)} cho ${who(mv.to)}.`);
        if (mv.to === m && mv.r) log(`🔄 Bạn nhận ${rn(mv.r)} từ ${who(mv.from)}.`);
      }
      log('🔄 Mỗi người chuyền 1 lá úp cho người kế tiếp.');
      $('#cp-table').classList.add('spin');
      await sleep(1200);
      $('#cp-table').classList.remove('spin');
      break;
    }
    case 'robin':
      log(`🏹 Hiệp Sĩ Rừng Xanh lấy ${e.n} xu của ${who(e.p)} chia cho ${who(e.s)}.`);
      break;
    case 'over':
      V.phase = 'over'; V.winner = e.p;
      SFX.win(); if (!QUICK) { UI.fireworks(6, () => SFX.pop()); UI.confetti(); }
      say(e.p, 'win');
      log(`🏆 ${who(e.p)} là người cuối cùng trụ lại — thắng!`);
      await sleep(1000);
      break;
  }
}

// ================= MODAL =================
const mq = s => document.querySelector('#modal ' + s);

function showGameOver() {
  overShown = true;
  const host = CTX.me().isHost;
  const rank = active().sort((a, b) => (b === V.winner) - (a === V.winner) || P(b).outAt - P(a).outAt);
  const medal = ['🏆', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
  UI.openModal(`<div class="cp-m"><h2 class="center">🏆 ${nm(V.winner)} thắng!</h2>
    <ol class="rank">${rank.map((p, i) => `<li style="--c:${col(p)}"><span>${medal[i]}</span><span class="grow">${nm(p)}</span>
      <span class="cds">${P(p).cards.map(c => `<span class="${c.dead ? 'd' : ''}" title="${UI.esc(ROLES[c.r] ? ROLES[c.r].name : '')}">${ROLES[c.r] ? ROLES[c.r].icon : '🂠'}</span>`).join('')}</span><span class="muted small">🪙${P(p).coins}</span></li>`).join('')}</ol>
    <div class="btns"><button class="ghost" data-a="close">👀 Xem bàn</button>
    ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}</div></div>`);
  const on = (a, fn) => { const b = mq(`[data-a="${a}"]`); if (b) b.onclick = () => { UI.closeModal(); fn(); }; };
  on('close', () => {});
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

function showHelp() {
  const chaos = !V || V.chaos, roles = V ? V.roles : Object.keys(ROLES).filter(r => !ROLES[r].chaos);
  const fac = V ? V.factions : false;
  UI.openModal(`<div class="cp-m help">
    <h2>📖 Luật chơi — Coup</h2>
    <h3>Cơ bản</h3><ul>
      <li>Mỗi người có <b>2 lá vai úp kín</b> (= 2 ảnh hưởng) và 2 xu. Mất cả 2 lá là bị loại — người cuối cùng còn trụ thắng.</li>
      <li>Tới lượt, chọn <b>1 hành động</b>. Hành động của vai thì cứ <b>tự nhận</b> là có vai đó — có thật hay bịp tuỳ bạn!</li>
      <li>Mọi người khác có ${V ? V.reactMs / 1000 : 10} giây để <b>Cho qua</b>, <b>Thách thức</b> hoặc <b>Chặn</b>. Ai cũng cho qua thì hành động diễn ra.</li>
      <li><b>Thách thức</b>: người bị thách thức có vai thật thì lật ra (xáo lại, rút lá mới) và người thách thức mất 1 lá; bịp thì người bịp mất 1 lá, hành động hỏng (trả lại xu).</li>
      <li><b>Chặn</b> cũng là tự nhận vai — người khác thách thức được người chặn. Chặn thành công thì hành động hỏng (xu đã trả vẫn mất).</li>
      <li>Mất ảnh hưởng: <b>tự chọn</b> lá để lật ngửa. Lá đã lật mọi người đều thấy.</li>
      <li>Có từ <b>${MUST_COUP} xu</b> là bắt buộc Đảo Chính.</li>
    </ul>
    <h3>Hành động chung</h3><ul>
      <li>${an('income')} — +1 xu, không ai chặn được.</li>
      <li>${an('aid')} — +2 xu, ai tự nhận vai thu thuế cũng chặn được.</li>
      <li>${an('coup')} — 7 xu, mục tiêu mất 1 lá. Không chặn, không thách thức được.</li>
    </ul>
    <h3>Vai trong ván ${V ? 'này' : ''}</h3><ul>${roles.map(r => `<li>${ROLES[r].icon} <b>${ROLES[r].name}</b>${ROLES[r].chaos ? ' <em class="new">mới</em>' : ''} — ${ROLES[r].desc}</li>`).join('')}</ul>
    ${chaos ? `<h3>🎁 Bất Ngờ</h3><ul>
      <li>Mỗi ván bốc 5 vai: mỗi "ô" là vai gốc hoặc vai mới (Nhà Cái/Công Tước, Kẻ Đầu Độc/Sát Thủ, Gián Điệp/Thuyền Trưởng, Thầy Bói/Đại Sứ, Vệ Sĩ/Nữ Bá Tước).</li>
      <li><b>Biến cố</b> mỗi vòng bàn (từ vòng 2): ${Object.values(EVENTS).map(E => `${E.icon} <b>${E.name}</b> — ${E.desc}`).join(' · ')}</li>
      <li><b>🕶️ Chợ đen</b>: mỗi vòng bán 2 món, trong lượt mình mua tối đa 1 món trước khi hành động: ${Object.values(ITEMS).map(I => `${I.icon} <b>${I.name}</b> (${I.cost} xu) — ${I.desc}`).join(' · ')} Món đang giữ là bí mật (người khác chỉ thấy 🎒).</li>
      <li><b>👻 Hồn ma</b>: người bị loại mỗi vòng bàn được làm 1 việc: ${Object.values(GHOST).map(G => `${G.icon} <b>${G.name}</b> — ${G.desc}`).join(' · ')}</li>
    </ul>` : ''}
    ${fac ? `<h3>🦁🦅 Phe phái</h3><ul>
      <li>Mọi người chia 2 phe ${FACTIONS.map(F => `${F.icon} ${F.name}`).join(' / ')}. Không được Đảo Chính, Ám Sát, Cướp... người <b>cùng phe</b>, cũng không chặn Viện Trợ của người cùng phe — trừ khi cả bàn chỉ còn 1 phe.</li>
      <li>${an('convert')} — ${ACTIONS.convert.desc}</li>
      <li>${an('embezzle')} — ${ACTIONS.embezzle.desc}</li>
    </ul>` : ''}
    <h3>Mẹo</h3><ul><li>Dưới tên mỗi người là các vai họ đã <b>tự nhận</b> (vai gạch ngang = từng bị bắt bài). Lá úp có biểu tượng mờ = bạn đã xem lén được.</li>
      <li>Hết giờ lượt thì máy đi giúp (Thu Nhập / cho qua).</li></ul>
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Hiểu rồi, bịp thôi!</button></div></div>`);
  mq('[data-x]').onclick = UI.closeModal;
}

// ================= ĐIỀU KHIỂN =================
function send(action) {
  pending = true;
  if (V) renderControls();
  return CTX.send(action).then(r => { pending = false; if (V && !playing) renderAll(); return r; });
}

function chooseTarget(label, list, cb) {
  targetPick = { label, list, cb };
  renderMats(); renderControls();
}

function onAct(a) {
  const A = ACTIONS[a], m = mySeat();
  SFX.click();
  if (a === 'convert') {
    const opts = [{ html: `🔁 Tự đổi phe (1 xu)`, value: m, color: col(m) },
      ...active().filter(t => alive(t) && t !== m && P(m).coins >= 2).map(t => ({ html: `${nm(t)} (2 xu)`, value: t, color: col(t) }))];
    return UI.pickModal('Đổi phe cho ai?', opts, target => send({ type: 'convert', target }));
  }
  if (!A.target) return send({ type: a });
  const list = active().filter(t => canTarget(m, t));
  if (list.length === 1) return send({ type: a, target: list[0] });
  chooseTarget(an(a), list, target => send({ type: a, target }));
}

function onMatClick(p) {
  if (targetPick && targetPick.list.includes(p)) {
    const cb = targetPick.cb;
    targetPick = null;
    SFX.click();
    cb(p);
  }
}

function onHandClick(id) {
  const step = V.step, m = mySeat();
  if (pending || playing || !step || step.p !== m) return;
  if (V.phase === 'lose') { SFX.click(); return send({ type: 'lose', id }); }
  if (V.phase === 'show') { SFX.click(); return send({ type: 'show', id }); }
  if (V.phase === 'exchange') {
    const n = hiddenOf(me()).length;
    if (exSel.has(id)) exSel.delete(id);
    else { if (exSel.size >= n) exSel.delete([...exSel][0]); exSel.add(id); }
    SFX.click();
    renderHand(); renderControls();
  }
}

function onButton(b) {
  const d = b.dataset;
  if (d.act) return onAct(d.act);
  if (d.a === 'cancel') { targetPick = null; return renderAll(); }
  if (d.a === 'pass' || d.a === 'challenge') { SFX.click(); return send({ type: d.a, key: V.win && V.win.key }); }
  if (d.block) { SFX.click(); return send({ type: 'block', r: d.block, key: V.win && V.win.key }); }
  if (d.poison) return send({ type: 'poison', pay: d.poison === '1' });
  if (d.force) return send({ type: 'force', yes: d.force === '1' });
  if (d.a === 'keep') { const ids = [...exSel]; return send({ type: 'keep', ids }).then(r => { if (r && r.ok) exSel = new Set(); }); }
  if (d.buy) {
    const k = d.buy;
    if (k !== 'glass') return send({ type: 'buy', item: k });
    const list = active().filter(t => alive(t) && t !== mySeat());
    return chooseTarget(`${ITEMS.glass.icon} ${ITEMS.glass.name}`, list, target => send({ type: 'buy', item: k, target }));
  }
  if (d.ghost) {
    const g = d.ghost, opts = active().filter(alive).map(t => ({ html: nm(t), value: t, color: col(t) }));
    return UI.pickModal(`${GHOST[g].icon} ${GHOST[g].name} — chọn ai?`, opts, target => send({ type: 'ghost', g, target }));
  }
}

function tickTimers() {
  if (!V) return;
  const now = Date.now(), full = V.phase === 'react' ? V.reactMs : CTX.room().turnMs;
  const rem = deadline ? deadline - now : 0;
  const frac = !deadline || playing ? 0 : Math.max(0, Math.min(1, rem / full));
  ROOT.querySelectorAll('.mat .mat-timer i').forEach(i => { i.style.width = (i.closest('.mat').classList.contains('turn') ? frac * 100 : 0) + '%'; });
  const mineAsked = $('#cp-status').classList.contains('mine') && !(me() && !me().alive);
  const tb = $('#cp-timer');
  tb.style.width = (mineAsked ? frac * 100 : 0) + '%';
  tb.classList.toggle('low', rem < Math.min(8000, full * 0.4));
  if (mineAsked && rem > 0 && rem < 4000 && Math.floor(rem / 1000) !== tb._s) { tb._s = Math.floor(rem / 1000); SFX.tick(); }
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
  // Hết giờ cửa sổ phản ứng = tự cho qua (bình thường, không cần báo); chỉ báo khi máy đi giúp lượt/quyết định.
  const auto = msg.meta && msg.meta.auto;
  if (auto != null && !Array.isArray(auto)) log(`⏱️ ${nm(auto)} hết giờ — máy đi giúp.`);
  playing = false;
  SPEED = 1;
  V = structuredClone(msg.state);
  deadline = msg.deadlineIn ? msg.recvAt + msg.deadlineIn : 0;
  if (V.phase !== 'exchange') exSel = new Set();
  renderAll();
  const m = mySeat(), pl = me();
  const mine = pl && pl.alive && ((V.phase === 'act' && V.cur === m) || (V.phase === 'react' && V.win && V.win.seats.includes(m))
    || (V.step && V.step.p === m && ['lose', 'poison', 'exchange', 'show', 'force'].includes(V.phase)));
  const key = mine ? [V.turnNo, V.phase, V.win && V.win.key, V.step && V.step.k].join(':') : '';
  if (mine && key !== turnKey) SFX.myTurn();
  turnKey = key;
  if (V.phase === 'over' && !overShown) setTimeout(showGameOver, 1200);
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root; SEATS = ctx.game.seats;
    V = null; pending = false; playing = false; SPEED = 1; QUICK = false; deadline = 0; overShown = false; turnKey = ''; exSel = new Set(); targetPick = null;
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    UI.emoteBar($('#cp-emotes'));
    UI.toolbar($('#cp-tools'), { help: showHelp });
    $('#cp-hand').addEventListener('click', e => { const b = e.target.closest('.cb'); if (b) onHandClick(+b.dataset.id); });
    $('#cp-mats').addEventListener('click', e => { const b = e.target.closest('.mat'); if (b) onMatClick(+b.dataset.p); });
    $('#cp-actions').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) onButton(b); });
    timerInt = setInterval(tickTimers, 100);
    return {
      update,
      onRoom: () => { if (V && !playing) renderMats(); },
      emoteAnchor: seat => (V && seat >= 0 && V.players[seat] && V.players[seat].active ? anchor(seat) : null),
      unmount() { clearInterval(timerInt); V = null; },
    };
  },
};
