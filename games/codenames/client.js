// 🕵️ Mật Danh — giao diện client. Xem "Game client interface" trong CLAUDE.md.
// V = bản trạng thái để VẼ: trong lúc diễn sự kiện, V được cập nhật dần; diễn xong thì thay bằng state thật từ server.
import { TEAMS, EVENTS, SKILLS, SPECIALS, INF, clueProblem, nLabel } from './data.js';

let CTX, UI, SFX, ROOT, V;
let playing = false, pending = false, SPEED = 1, QUICK = false, deadline = 0, total = 0, timerKey = '', overShown = false;
let timerInt = 0, pickSkill = null, bellKey = '', logLines = [], freshId = null;

const $ = s => ROOT.querySelector(s);
const sleep = ms => (QUICK ? Promise.resolve() : new Promise(r => setTimeout(r, ms / SPEED)));
const esc = s => UI.esc(s);
const me = () => CTX.me().seat;
const P = p => (V && p >= 0 ? V.players[p] : null);
const myTeam = () => (P(me()) ? P(me()).team : -1);
const tcol = t => TEAMS[t].color;
const tname = t => `<b class="pn" style="--c:${tcol(t)}">${TEAMS[t].icon} ${TEAMS[t].name}</b>`;
const who = p => (P(p) ? `<b class="pn" style="--c:${tcol(P(p).team)}">${esc(P(p).name)}</b>` : '?');
const isSpy = p => !!P(p) && V.teams[P(p).team].spy === p;
const amSpy = () => isSpy(me());
const canClue = () => V && V.phase === 'clue' && V.teams[V.cur].spy === me() && !playing;
const canVote = () => V && V.phase === 'guess' && myTeam() === V.cur && V.teams[V.cur].ops.includes(me()) && !playing;
const cardWord = c => (c.w == null ? '🌫️' : esc(c.w));
const quote = (w, n) => `«${esc(w)}» <span class="n">${nLabel(n)}</span>`;

// ================= ÂM THANH =================
const S = {
  flip() { SFX.noise(0.08, { v: 0.14, f: 2600, q: 0.8 }); },
  good() { [660, 880, 1175].forEach((f, i) => SFX.tone(f, 0.12, { type: 'triangle', v: 0.06, delay: i * 0.06 })); },
  bad() { SFX.tone(220, 0.25, { type: 'square', v: 0.05, to: 150 }); },
  assassin() { SFX.boom(); SFX.tone(90, 0.9, { type: 'sawtooth', v: 0.1, to: 40 }); },
  clue() { SFX.whoosh(); SFX.tone(520, 0.12, { type: 'sine', v: 0.05, delay: 0.15 }); },
  vote() { SFX.tone(980, 0.04, { type: 'square', v: 0.03 }); },
};

// ================= VẼ =================
function renderTeams() {
  const box = $('#cn-teams');
  box.innerHTML = V.order.map(t => {
    const tm = V.teams[t], cur = t === V.cur && V.phase !== 'over';
    const mem = tm.members.map(p => {
      const voted = V.phase === 'guess' && t === V.cur && V.votes[p] != null;
      const room = CTX.room(), off = room && room.seats[p] && !room.seats[p].online;
      return `<span class="mem${p === me() ? ' me' : ''}${off ? ' off' : ''}" data-p="${p}">${p === tm.spy ? '🕵️' : P(p).kind === 'bot' ? '🤖' : '🔎'} ${esc(P(p).name)}${voted ? ' <i>✓</i>' : ''}</span>`;
    }).join('');
    const sk = tm.skills.map(s => `<span class="sk${s.used ? ' used' : ''}" title="${esc(SKILLS[s.k].name)} — ${esc(SKILLS[s.k].desc)}">${SKILLS[s.k].icon}</span>`).join('');
    const flags = (tm.out ? '<span class="flag">☠️ Bị loại</span>' : '') + (tm.skip ? '<span class="flag" title="Lật trúng Bom">💣 Mất lượt kế</span>' : '')
      + (V.jam === t ? '<span class="flag" title="Lượt kế bị Nhiễu Sóng">📡</span>' : '');
    return `<div class="tm${cur ? ' cur' : ''}${tm.out ? ' out' : ''}${t === V.winner ? ' win' : ''}" style="--tc:${tcol(t)}">
      <div class="tm-head"><span class="tm-name">${TEAMS[t].icon} ${TEAMS[t].name}</span>${flags}<span class="grow"></span>${sk}
        <span class="left" title="Số lá còn phải tìm"><b>${tm.left}</b></span></div>
      <div class="tm-mem">${mem}</div></div>`;
  }).join('');
}

function cardHTML(c, i) {
  const known = c.k != null, cls = ['cd'];
  if (c.rev) cls.push('rev', 'k-' + c.k);
  if (c.rev && c.id === freshId) cls.push('fresh');
  else if (known) cls.push('spyv', 'k-' + c.k);
  if (c.fog) cls.push('fog');
  if (V.pic) cls.push('pic');
  const voters = V.phase === 'guess' ? Object.entries(V.votes).filter(([, v]) => v === i).map(([p]) => +p) : [];
  if (voters.includes(me())) cls.push('sel');
  if (canVote() && !c.rev) cls.push('can');
  if (pickSkill && !c.rev && (pickSkill !== 'mark' || c.k === V.cur)) cls.push('can', 'pick');
  const icon = !c.rev ? '' : c.k === 'a' ? '💀' : c.k === 'n' ? '🧑' : '🕵️';
  const dots = voters.map(p => `<b style="--c:${tcol(P(p).team)}" title="${esc(P(p).name)}">${esc([...P(p).name][0] || '?').toUpperCase()}</b>`).join('');
  const title = V.pic && c.nm && (c.rev || amSpy() || V.phase === 'over') ? ` title="${esc(c.nm)}"` : '';
  return `<div class="${cls.join(' ')}" data-i="${i}" data-id="${c.id}"${title}>
    ${c.rev ? `<span class="ag">${icon}</span>` : ''}<span class="w">${cardWord(c)}</span>
    ${c.sp && (c.rev || known) ? `<i class="spc" title="${esc(SPECIALS[c.sp].name)}">${SPECIALS[c.sp].icon}</i>` : ''}
    ${c.mk && c.mk.length ? '<i class="mk" title="Chắc chắn là lá của đội bạn">⭐</i>' : ''}
    ${dots ? `<span class="vt">${dots}</span>` : ''}</div>`;
}
function renderBoard() {
  const b = $('#cn-board');
  b.style.setProperty('--cols', V.T === 3 ? 6 : 5);
  b.classList.toggle('c6', V.T === 3);
  b.classList.toggle('spy', amSpy() && V.phase !== 'over');
  b.innerHTML = V.cards.map(cardHTML).join('');
}

function renderBar() {
  const bar = $('#cn-bar'), t = V.cur, tm = V.teams[t];
  bar.style.setProperty('--tc', tcol(t));
  let html;
  if (V.phase === 'over') html = `<span class="big">🏆 ${tname(V.winner)} thắng!</span>`;
  else if (V.phase === 'clue') {
    html = tm.spy === me() ? `<span class="big">🕵️ Tới lượt bạn ra gợi ý cho đội ${tname(t)}</span>`
      : `<span>🕵️ ${who(tm.spy)} <span class="muted">(Trưởng nhóm ${TEAMS[t].name})</span> đang nghĩ gợi ý…</span>`;
  } else {
    const c = V.clue, left = c.max == null ? '?' : c.max >= 99 ? '∞' : c.max - c.made;
    html = `<span class="clue">${tname(t)} ${quote(c.w, c.n)}${c.w2 ? ` + ${quote(c.w2, c.n2)}` : ''}</span>
      <span class="muted">đã đoán ${c.made} · còn <b>${left}</b> lượt</span>`;
  }
  const fx = [];
  if (V.event && V.phase !== 'over') fx.push(`<span class="chip" title="${esc(EVENTS[V.event].desc)}">${EVENTS[V.event].icon} ${EVENTS[V.event].name}</span>`);
  if (V.fx.shield) fx.push(`<span class="chip">🛡️ Lá Chắn</span>`);
  if (V.fx.double) fx.push(`<span class="chip">➕ Gợi Ý Kép</span>`);
  if (V.fx.jam) fx.push(`<span class="chip">📡 Nhiễu Sóng</span>`);
  bar.innerHTML = `<div class="bar-l">${html}</div><div class="bar-r">${fx.join('')}</div><div class="timer"><i id="cn-timer"></i></div>`;
}

function renderControls() {
  const ctl = $('#cn-ctl');
  if (!V || V.phase === 'over') { ctl.innerHTML = ''; return; }
  const tm = V.teams[V.cur];
  if (canClue()) {
    const nOpts = (V.fx.limit ? [1, 2] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, INF]).map(n => `<option value="${n}">${nLabel(n)}</option>`).join('');
    const box = (k, ph) => `<input id="cn-w${k}" maxlength="24" placeholder="${ph}" autocomplete="off" spellcheck="false"><select id="cn-n${k}">${nOpts}</select>`;
    const skills = tm.skills.filter(s => !s.used).map(s => `<button class="ghost skb${pickSkill === s.k ? ' on' : ''}" data-sk="${s.k}" title="${esc(SKILLS[s.k].desc)}">${SKILLS[s.k].icon} ${SKILLS[s.k].name}</button>`).join('');
    const keep = [0, 2].map(k => { const w = $(`#cn-w${k || ''}`), n = $(`#cn-n${k || ''}`); return w ? [w.value, n.value] : null; });
    ctl.innerHTML = `<div class="form">${box('', 'Một từ gợi ý…')}${V.fx.double ? box('2', 'Gợi ý thứ hai…') : ''}
      <button class="gold" id="cn-send" ${pending ? 'disabled' : ''}>📣 Ra gợi ý</button></div>
      ${skills ? `<div class="skills"><span class="muted small">Kỹ năng:</span>${skills}</div>` : ''}
      <div class="muted small hint">Không được dùng từ có trên bàn (hoặc chứa/là một phần của từ đó). Số 0 hoặc ∞ = đoán không giới hạn.${pickSkill ? ' <b>👉 Bấm vào một lá để dùng kỹ năng.</b>' : ''}</div>`;
    [0, 2].forEach(k => { const v = keep[k ? 1 : 0]; if (v && $(`#cn-w${k || ''}`)) { $(`#cn-w${k || ''}`).value = v[0]; $(`#cn-n${k || ''}`).value = v[1]; } });
    if (!keep[0] && $('#cn-n')) $('#cn-n').value = '2';
    const w = $('#cn-w');
    if (w && document.activeElement !== w && !document.activeElement.closest('#chat')) w.focus({ preventScroll: true });
    return;
  }
  if (V.phase === 'clue') { ctl.innerHTML = `<div class="muted">${myTeam() === V.cur ? '⏳ Chờ Trưởng nhóm của đội bạn…' : `⏳ Đội ${tname(V.cur)} đang chuẩn bị gợi ý…`}</div>`; return; }
  if (canVote()) {
    const passN = Object.values(V.votes).filter(v => v === 'pass').length;
    const mineV = V.votes[me()];
    ctl.innerHTML = `<div class="form">
      <span class="muted">${V.split ? '⚖️ <b>Chia phiếu!</b> Thống nhất lại — hết giờ sẽ lật lá nhiều phiếu nhất.' : 'Bấm vào lá để chỉ — quá nửa đội cùng chỉ thì lật. Bấm lại để bỏ.'}</span>
      <span class="grow"></span>
      ${V.split ? `<button class="ghost" id="cn-settle" ${pending ? 'disabled' : ''}>🎲 Chốt luôn</button>` : ''}
      <button class="${mineV === 'pass' ? 'gold' : 'ghost'}" id="cn-pass" ${V.clue.made < 1 || pending ? 'disabled' : ''} title="${V.clue.made < 1 ? 'Phải đoán ít nhất 1 lá' : 'Dừng lượt (cũng cần quá nửa đội đồng ý)'}">✋ Dừng lượt${passN ? ` (${passN})` : ''}</button></div>`;
    return;
  }
  ctl.innerHTML = `<div class="muted">${amSpy() && myTeam() === V.cur ? '🤐 Đồng đội đang đoán — Trưởng nhóm không được mách (chat của bạn chỉ tới các Trưởng nhóm).'
    : myTeam() === V.cur ? '⏳ Đang đếm phiếu…' : `👀 Đội ${tname(V.cur)} đang đoán…`}</div>`;
}

function renderHist() {
  const h = $('#cn-hist');
  if (!V.hist.length) { h.innerHTML = '<div class="muted small">Chưa có gợi ý nào.</div>'; return; }
  h.innerHTML = V.hist.slice().reverse().map(x => {
    const got = x.got.map(i => { const c = V.cards[i]; return `<span class="g k-${c.k}">${c.k === x.team ? '✔' : c.k === 'a' ? '💀' : '✖'} ${cardWord(c)}</span>`; }).join('');
    return `<div class="hc" style="--tc:${tcol(x.team)}"><div class="q">${quote(x.w, x.n)}${x.w2 ? ` + ${quote(x.w2, x.n2)}` : ''}${x.jam ? ' 📡' : ''}</div>${got ? `<div class="gs">${got}</div>` : ''}</div>`;
  }).join('');
}

function log(html) {
  logLines.push(html);
  if (logLines.length > 60) logLines.shift();
  const el = $('#cn-log');
  if (!el) return;
  el.innerHTML = logLines.map(l => `<div>${l}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function renderAll() {
  if (!V) return;
  renderTeams(); renderBar(); renderBoard(); renderControls(); renderHist();
}

// ================= HIỆU ỨNG =================
async function banner(html, ms = 1800, cls = '') {
  if (QUICK) return;
  const b = $('#cn-banner');
  b.className = cls;
  b.innerHTML = html;
  void b.offsetWidth;
  b.classList.add('show');
  await sleep(ms);
  b.classList.remove('show');
  await sleep(250);
}
const cardEl = i => ROOT.querySelector(`.cd[data-i="${i}"]`);
function cardPt(i) {
  const el = cardEl(i);
  if (!el) return { x: innerWidth / 2, y: innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

async function playEvent(e) {
  switch (e.t) {
    case 'start':
      log(`🎬 Ván mới! ${tname(e.first)} đi trước (phải tìm nhiều lá hơn).`);
      break;
    case 'turn':
      Object.assign(V, { cur: e.team, phase: 'clue', clue: null, votes: {}, split: false, fx: {}, event: null });
      renderAll();
      log(`<span class="sep">— Lượt ${e.n}: ${tname(e.team)} —</span>`);
      await sleep(400);
      break;
    case 'ev': {
      const E = EVENTS[e.k];
      V.event = e.k;
      SFX.gong();
      log(`${E.icon} <b>Biến cố: ${E.name}</b> — ${esc(E.desc)}${e.team != null && ['retreat', 'whisper', 'rush', 'bonus', 'limit'].includes(e.k) ? ` (${tname(e.team)})` : ''}`);
      if (e.k === 'quake' && !QUICK) { $('#cn-board').classList.add('shake'); setTimeout(() => $('#cn-board').classList.remove('shake'), 1200); }
      await banner(`<div class="ic">${E.icon}</div><div class="t">${E.name}</div><div class="d">${esc(E.desc)}</div>`, 2100, 'ev');
      break;
    }
    case 'skill': {
      const K = SKILLS[e.k];
      SFX.tele();
      log(`${K.icon} ${tname(e.team)} dùng kỹ năng <b>${K.name}</b>${e.on != null ? ` lên ${tname(e.on)}` : ''}.${e.k === 'mark' && e.x ? ' Đội bạn thấy ⭐!' : ''}`);
      V.teams[e.team].skills.forEach(s => { if (s.k === e.k) s.used = true; });
      renderTeams();
      if (e.c != null && !QUICK) cardEl(e.c)?.classList.add('pulse');
      await banner(`<div class="ic">${K.icon}</div><div class="t">${K.name}</div><div class="d">${esc(K.desc)}</div>`, 1000, 'sm');
      break;
    }
    case 'clue':
      Object.assign(V, { phase: 'guess', votes: {}, split: false });
      V.clue = { team: e.team, w: e.w, n: e.n, w2: e.w2, n2: e.n2, made: 0, max: e.n == null ? null : 0, jam: e.jam };
      S.clue();
      log(`📣 ${tname(e.team)}: ${quote(e.w, e.n)}${e.w2 ? ` + ${quote(e.w2, e.n2)}` : ''}`);
      await banner(`<div class="t clue" style="--tc:${tcol(e.team)}">${quote(e.w, e.n)}${e.w2 ? `<br>${quote(e.w2, e.n2)}` : ''}</div>`, 1300, 'clue');
      break;
    case 'vote':
      if (e.c == null) delete V.votes[e.p]; else V.votes[e.p] = e.c;
      if (e.p !== me() && !QUICK && P(e.p) && P(e.p).team === myTeam()) S.vote();
      if (!playing || QUICK) break;
      renderBoard(); renderControls(); renderTeams();
      break;
    case 'split':
      log(`⚖️ ${tname(e.team)} chia phiếu — cần thống nhất lại.`);
      if (myTeam() === e.team && !QUICK) UI.toast('⚖️ Chia phiếu! Thống nhất lại một lá.');
      break;
    case 'draw':
      log(`🎲 Hoà phiếu — bốc thăm giữa ${e.opts.map(x => (x === 'pass' ? 'Dừng' : `«${cardWord(V.cards[x])}»`)).join(', ')}.`);
      break;
    case 'flip': {
      const c = V.cards[e.c];
      const el = cardEl(e.c);
      S.flip();
      if (el && !QUICK) { el.classList.add('flipping'); await sleep(320); }
      Object.assign(c, { rev: true, k: e.k, sp: e.sp, by: e.team, w: e.w, fog: false });
      freshId = c.id;
      setTimeout(() => { if (freshId === c.id) freshId = null; }, 450);
      V.votes = {};
      if (typeof e.k === 'number') V.teams[e.k].left--;
      if (V.clue && e.k === e.team) V.clue.made++;
      const last = V.hist[V.hist.length - 1];
      if (last && !last.got.includes(e.c)) last.got.push(e.c);
      renderBoard(); renderTeams(); renderBar(); renderHist();
      const good = e.k === e.team;
      if (e.k === 'a') { S.assassin(); if (!QUICK) UI.floatAt(cardPt(e.c), '💀 SÁT THỦ!', 'big'); }
      else if (good) { S.good(); if (!QUICK) UI.burst(cardPt(e.c).x, cardPt(e.c).y, [tcol(e.team), '#fff'], 24, 6); }
      else S.bad();
      const what = e.k === 'a' ? '💀 <b>sát thủ</b>' : e.k === 'n' ? '🧑 dân thường' : typeof e.k === 'number' && e.k !== e.team ? `điệp viên ${tname(e.k)}` : '✔ đúng!';
      log(`🃏 ${tname(e.team)} lật «${esc(e.w)}» — ${what}`);
      await sleep(good ? 650 : 800);
      break;
    }
    case 'sp': {
      const K = SPECIALS[e.k];
      SFX.tele();
      const extra = { gold: 'không mất lượt, còn được đoán thêm 1!', star: 'được đoán thêm 1!', orb: e.x ? 'một lá của đội bạn được đánh dấu ⭐.' : 'một lá của đội được đánh dấu ⭐.',
        traitor: 'một lá thường đã thành lá của đội — phải tìm thêm 1!', bomb: 'đội mất lượt kế tiếp!' }[e.k];
      log(`${K.icon} <b>${K.name}</b>: ${tname(e.team)} ${extra}`);
      if (e.k === 'traitor') V.teams[e.team].left++;
      if (e.k === 'bomb') V.teams[e.team].skip = true;
      if (e.k === 'gold' || e.k === 'star') { if (V.clue && V.clue.max != null) V.clue.max++; }
      if (e.x && e.x.c != null && e.k === 'orb') V.cards[e.x.c].mk = [myTeam()];
      renderTeams(); renderBoard();
      await banner(`<div class="ic">${K.icon}</div><div class="t">${K.name}</div><div class="d">${esc(extra)}</div>`, 1200, 'sm');
      break;
    }
    case 'shield':
      log(`🛡️ Lá Chắn đỡ cho ${tname(e.team)} — vẫn được đoán tiếp!`);
      V.fx.shield = false;
      if (!QUICK) UI.floatAt({ x: innerWidth / 2, y: innerHeight / 2 }, '🛡️ Lá Chắn!', 'big');
      SFX.pop();
      await sleep(900);
      break;
    case 'out':
      V.teams[e.team].out = true;
      log(`☠️ ${tname(e.team)} gặp sát thủ — <b>bị loại!</b>`);
      renderTeams();
      await sleep(1200);
      break;
    case 'skip':
      V.teams[e.team].skip = false;
      log(`💣 ${tname(e.team)} mất lượt (dính Bom).`);
      await banner(`<div class="ic">💣</div><div class="t">${TEAMS[e.team].name} mất lượt</div>`, 1000, 'sm');
      break;
    case 'stop':
      log(`✋ ${tname(e.team)} dừng lượt.`);
      await sleep(300);
      break;
    case 'over': {
      V.phase = 'over'; V.winner = e.team;
      log(`🏆 <b>${tname(e.team)} thắng!</b>`);
      if (myTeam() === e.team || myTeam() < 0) { SFX.win(); if (!QUICK) { UI.confetti(200, [tcol(e.team), '#fff', '#d9a23a']); UI.fireworks(4, () => SFX.pop()); } }
      else SFX.error();
      await sleep(900);
      break;
    }
  }
}

// ================= MODAL =================
const mq = s => document.querySelector('#modal ' + s);
function showGameOver() {
  overShown = true;
  const host = CTX.me().isHost, w = V.winner;
  const rows = V.order.slice().sort((a, b) => (b === w) - (a === w) || (V.teams[a].out - V.teams[b].out) || V.teams[a].left - V.teams[b].left)
    .map((t, i) => `<li style="--tc:${tcol(t)}"><span>${['🏆', '🥈', '🥉'][i]}</span><span class="grow">${tname(t)} <span class="muted small">${V.teams[t].members.map(p => esc(P(p).name)).join(', ')}</span></span>
      <span class="muted small">${t === w ? 'Thắng' : V.teams[t].out ? '☠️ Sát thủ' : `còn ${V.teams[t].left} lá`}</span></li>`).join('');
  const mine = myTeam();
  UI.openModal(`<div class="cn-m"><h2 class="center">${mine === w ? '🎉 Đội bạn thắng!' : mine >= 0 ? '😢 Đội bạn thua rồi' : '🏆 Kết thúc'}</h2>
    <ol class="rank">${rows}</ol>
    <p class="muted small center">Bàn đã lật ngửa toàn bộ — xem lại màu các lá ở dưới.</p>
    <div class="btns"><button class="ghost" data-a="close">👀 Xem bàn</button>
    ${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted small">Chờ chủ phòng mở ván mới...</span>'}</div></div>`);
  const on = (a, fn) => { const b = mq(`[data-a="${a}"]`); if (b) b.onclick = () => { UI.closeModal(); fn(); }; };
  on('close', () => {});
  on('lobby', CTX.backToLobby);
  on('again', CTX.restart);
}

function showHelp() {
  const o = V || CTX.room().opts || {};
  const li = (D, keys) => keys.map(k => `<li>${D[k].icon} <b>${D[k].name}</b> — ${esc(D[k].desc)}</li>`).join('');
  UI.openModal(`<div class="cn-m help">
    <h2>📖 Luật chơi — Mật Danh (Codenames)</h2>
    <h3>Cơ bản</h3><ul>
      <li>Mỗi đội có 1 <b>🕵️ Trưởng nhóm</b> (ghế đầu của đội) — chỉ Trưởng nhóm thấy lá nào là của đội nào. Còn lại là <b>🔎 người đoán</b>.</li>
      <li>Tới lượt, Trưởng nhóm ra <b>một từ + một con số</b> (vd «biển» 3 = có 3 lá liên quan tới biển). Không được dùng từ có trên bàn. Số 0 hoặc ∞ = đoán bao nhiêu cũng được.</li>
      <li>Người đoán <b>bấm vào lá để chỉ</b>. Lá nào được <b>quá nửa đội</b> chỉ thì lật. Mọi người đều chỉ mà không lá nào quá nửa = chia phiếu: thống nhất lại, hết giờ thì lật lá nhiều phiếu nhất.</li>
      <li>Lật đúng lá đội mình → đoán tiếp (tối đa <b>số + 1</b> lá). Lật trúng 🧑 dân thường hoặc lá đội khác → hết lượt. Lật trúng <b>💀 sát thủ</b> → thua ngay${V && V.T === 3 ? ' (3 đội: bị loại)' : ''}.</li>
      <li>Đội lật hết lá của mình trước thắng (kể cả khi đội khác lật giúp!). Đội đi trước phải tìm nhiều lá hơn.</li>
      <li>Trong ván, Trưởng nhóm chỉ chat được với các Trưởng nhóm khác. Hết giờ suy nghĩ thì máy ra gợi ý giúp / người đoán coi như bỏ phiếu trắng.</li>
    </ul>
    ${o.events ? `<h3>🌋 Sự kiện bất ngờ (2–3 lượt một lần)</h3><ul>${li(EVENTS, Object.keys(EVENTS))}</ul>` : ''}
    ${o.skills ? `<h3>🎴 Kỹ năng đội (mỗi đội 2 cái, dùng 1 lần, trước khi ra gợi ý)</h3><ul>${li(SKILLS, Object.keys(SKILLS))}</ul>` : ''}
    ${o.specials ? `<h3>💰 Lá đặc biệt (Trưởng nhóm thấy biểu tượng)</h3><ul>${li(SPECIALS, Object.keys(SPECIALS))}</ul>` : ''}
    <div class="btns" style="margin-top:16px"><button class="gold" data-x>Hiểu rồi!</button></div></div>`);
  mq('[data-x]').onclick = UI.closeModal;
}

// ================= ĐIỀU KHIỂN =================
function send(action) {
  pending = true;
  renderControls();
  return CTX.send(action).then(r => { pending = false; if (V && !playing) renderAll(); return r; });
}

function sendClue() {
  if (!canClue() || pending) return;
  const a = { type: 'clue', w: $('#cn-w').value, n: +$('#cn-n').value };
  if (V.fx.double) { a.w2 = $('#cn-w2').value; a.n2 = +$('#cn-n2').value; }
  for (const w of [a.w, a.w2].filter(x => x != null)) {
    const err = clueProblem(w, V.cards);
    if (err) { SFX.error(); UI.toast(esc(err)); return; }
  }
  SFX.click();
  send(a);
}

function onCard(i) {
  const c = V.cards[i];
  if (!c || c.rev) return;
  if (pickSkill && canClue()) {
    if (pickSkill === 'mark' && c.k !== V.cur) { UI.toast('🎯 Chọn một lá của đội mình'); return; }
    const k = pickSkill;
    pickSkill = null;
    SFX.click();
    send({ type: 'skill', k, c: i });
    return;
  }
  if (!canVote() || pending) return;
  SFX.click();
  send({ type: 'vote', c: V.votes[me()] === i ? null : i });
}

function onSkill(k) {
  if (!canClue() || pending) return;
  if (SKILLS[k].pick) { pickSkill = pickSkill === k ? null : k; renderBoard(); renderControls(); return; }
  UI.openModal(`<div class="cn-m"><h2 class="center">${SKILLS[k].icon} ${SKILLS[k].name}</h2><p class="center">${esc(SKILLS[k].desc)}</p>
    <div class="btns"><button class="ghost" data-x>Thôi</button><button class="gold" data-ok>Dùng ngay</button></div></div>`);
  mq('[data-x]').onclick = UI.closeModal;
  mq('[data-ok]').onclick = () => { UI.closeModal(); SFX.click(); send({ type: 'skill', k }); };
}

function tickTimers() {
  if (!V) return;
  const el = $('#cn-timer');
  if (!el) return;
  const rem = deadline ? deadline - Date.now() : 0;
  const frac = !deadline || playing || !total ? 0 : Math.max(0, Math.min(1, rem / total));
  el.style.width = frac * 100 + '%';
  el.classList.toggle('low', rem < 10000);
  const mine = canClue() || (canVote() && (V.votes[me()] == null || V.split));
  if (mine && rem > 0 && rem < 5000 && Math.floor(rem / 1000) !== el._s) { el._s = Math.floor(rem / 1000); SFX.tick(); }
}

// ================= VÒNG ĐỜI =================
async function update(msg, { backlog = 0, hidden = false } = {}) {
  SPEED = backlog >= 3 ? 4 : backlog >= 1 ? 1.8 : 1;
  if (!V) { V = structuredClone(msg.state); renderAll(); }
  const onlyVotes = msg.events.every(e => e.t === 'vote' || e.t === 'split');
  playing = !onlyVotes;
  QUICK = hidden;
  if (hidden) SPEED = 100;
  if (playing) renderControls();
  for (const e of msg.events) { try { await playEvent(e); } catch (err) { console.error(err); } }
  QUICK = false;
  const auto = msg.meta && msg.meta.auto;
  if (auto != null) for (const p of [].concat(auto)) if (P(p)) log(`⏱️ ${who(p)} hết giờ — máy ${V.phase === 'clue' ? 'ra gợi ý' : 'chọn'} giúp.`);
  playing = false;
  SPEED = 1;
  V = structuredClone(msg.state);
  // Hạn chót: mỗi pha (gợi ý / mỗi lần bỏ phiếu) có độ dài riêng → nhớ tổng thời gian lúc pha bắt đầu để vẽ thanh thời gian.
  deadline = msg.deadlineIn ? msg.recvAt + msg.deadlineIn : 0;
  const key = [V.turnNo, V.phase, V.vk, V.split].join(':');
  if (key !== timerKey) { timerKey = key; total = msg.deadlineIn || 0; }
  if (!canClue()) pickSkill = null;
  renderAll();
  const bell = canClue() ? 'c' + V.turnNo : canVote() && V.clue && V.clue.made === 0 ? 'g' + V.turnNo : '';
  if (bell && bell !== bellKey) SFX.myTurn();
  if (bell) bellKey = bell;
  if (V.phase === 'over' && !overShown) setTimeout(showGameOver, 1200);
}

const TEMPLATE = `<div class="cn">
  <div class="cn-main">
    <div id="cn-teams" class="cn-teams"></div>
    <div id="cn-bar" class="cn-bar"></div>
    <div class="cn-boardwrap"><div id="cn-board" class="cn-board"></div></div>
    <div id="cn-ctl" class="cn-ctl"></div>
    <div class="cn-bottom"><div id="cn-emotes" class="grow"></div><div id="cn-tools"></div></div>
  </div>
  <aside class="cn-side">
    <h3>📜 Các gợi ý</h3><div id="cn-hist" class="cn-hist"></div>
    <h3>📰 Diễn biến</h3><div id="cn-log" class="cn-log"></div>
  </aside>
  <div id="cn-banner"></div>
</div>`;

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root;
    V = null; playing = false; pending = false; SPEED = 1; QUICK = false; deadline = 0; total = 0; timerKey = ''; overShown = false;
    pickSkill = null; bellKey = ''; logLines = []; freshId = null;
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = TEMPLATE;
    UI.emoteBar($('#cn-emotes'));
    UI.toolbar($('#cn-tools'), { help: showHelp });
    $('#cn-board').addEventListener('click', e => { const c = e.target.closest('.cd'); if (c) onCard(+c.dataset.i); });
    $('#cn-ctl').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.id === 'cn-send') sendClue();
      else if (b.id === 'cn-pass') { SFX.click(); send({ type: 'vote', c: V.votes[me()] === 'pass' ? null : 'pass' }); }
      else if (b.id === 'cn-settle') { SFX.click(); send({ type: 'settle' }); }
      else if (b.dataset.sk) onSkill(b.dataset.sk);
    });
    $('#cn-ctl').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.stopPropagation(); sendClue(); } });
    timerInt = setInterval(tickTimers, 100);
    return {
      update,
      onRoom: () => { if (V && !playing) renderTeams(); },
      emoteAnchor: seat => {
        const el = ROOT.querySelector(`.mem[data-p="${seat}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top };
      },
      unmount() { clearInterval(timerInt); V = null; },
    };
  },
};
