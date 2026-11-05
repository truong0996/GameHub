// Client của hub: kết nối WebSocket, màn hình chính, phòng chờ, nạp/gỡ game, hàng đợi tin nhắn game.
// Game cắm vào qua games/<dir>/client.js — xem "Game client interface" trong CLAUDE.md.
import * as UI from './ui.js';
import { $, el, esc, toast, openModal, closeModal, modalOpen, floatAt, initFx } from './ui.js';
import { sfx, tone, noise, ac, soundOn, musicOn, setSound, setMusic } from './sfx.js';
import { initChat, showChat, resetChat, chatLog, chatMsg } from './chat.js';
import { initVoice, voiceRoom, voiceSignal, voiceReset, voiceReconnected } from './voice.js';

const EMOTES = ['😂', '😎', '😡', '😭', '🔥', '👏', '🐴', '💀', '🙏', '🤡'];
const ME = { pid: null, uid: null, code: null, lan: [], pub: null };
let CATALOG = [], ROOM = null;
let current = null;            // game đang mount: { matchId, key, entry, realtime, inst, css: [] }
const GQ = [];                 // hàng đợi tin 'game' (phát lần lượt để animation không chồng nhau)
let pumping = false;

const mySeat = () => (ROOM ? ROOM.seats.findIndex(s => s.kind === 'human' && s.uid === ME.uid) : -1);
const isHost = () => !!ROOM && ROOM.host === ME.uid;
const entryOf = id => CATALOG.find(g => g.id === id);
const withTags = cat => cat.map(g => ({ ...g, tags: g.tags || [] }));   // server cũ (chưa khởi động lại) gửi catalog không có tags
const range = g => g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`;   // số người chơi: "2–6" hoặc "2"
const session = () => JSON.parse(sessionStorage.getItem('hub_session') || 'null');

// ================= KẾT NỐI =================
const net = (() => {
  let ws = null, seq = 0, backoff = 400, ready = false;
  const pending = new Map(), waiting = [];
  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = async () => {
      backoff = 400;
      $('#net').classList.add('hidden');
      await onConnected();
      ready = true;
      while (waiting.length) waiting.shift()();
    };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.t === 'res') { const cb = pending.get(m.id); if (cb) { pending.delete(m.id); cb(m); } return; }
      onMessage(m);
    };
    ws.onclose = () => {
      ready = false;
      for (const cb of pending.values()) cb({ ok: false, err: 'Mất kết nối tới server' });
      pending.clear();
      $('#net').classList.remove('hidden');
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 5000);
    };
  }
  // raw: gửi ngay (dùng lúc vừa kết nối để vào lại phòng). request: chờ tới khi đã vào lại phòng xong.
  function raw(t, data = {}) {
    return new Promise(res => {
      if (!ws || ws.readyState !== 1) return res({ ok: false, err: 'Chưa kết nối tới server' });
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, t, ...data }));
    });
  }
  const request = (t, data) => (ready ? raw(t, data) : new Promise(res => waiting.push(() => raw(t, data).then(res))));
  // post: gửi không cần trả lời (tin bắt tay đàm thoại); mất kết nối thì bỏ.
  const post = (t, data = {}) => { if (ready && ws.readyState === 1) ws.send(JSON.stringify({ t, ...data })); };
  connect();
  return { raw, request, post };
})();

async function act(t, data) {
  const r = await net.request(t, data);
  if (!r.ok) { toast('⚠️ ' + esc(r.err)); sfx.error(); }
  return r;
}

async function onConnected() {
  const h = await net.raw('hello');
  if (h.ok) { CATALOG = withTags(h.catalog); ME.lan = h.lan; ME.pub = h.pub; renderHome(); }
  const s = session();
  if (!s) return;
  const j = await net.raw('join', { code: s.code, pid: s.pid });
  if (j.ok) { enterRoom(j); voiceReconnected(); }
  else { sessionStorage.removeItem('hub_session'); if (ROOM) resetToHome('⚠️ ' + esc(j.err)); }
}

function enterRoom(j) {
  Object.assign(ME, { code: j.code, pid: j.pid, uid: j.uid, lan: j.lan || ME.lan, pub: j.pub || ME.pub });
  CATALOG = j.catalog ? withTags(j.catalog) : CATALOG;
  sessionStorage.setItem('hub_session', JSON.stringify({ code: j.code, pid: j.pid }));
  history.replaceState(null, '', '?room=' + j.code);
}

function onMessage(m) {
  if (m.t === 'room') onRoom(m.room);
  else if (m.t === 'game') { m.recvAt = Date.now(); GQ.push(m); pump(); }
  else if (m.t === 'emote') onEmote(m);
  else if (m.t === 'chatLog') chatLog(m.log);
  else if (m.t === 'chat') chatMsg(m.msg);
  else if (m.t === 'rtc') voiceSignal(m);
}

function onRoom(room) {
  ROOM = room;
  if (!room.playing) {
    GQ.length = 0;
    if (current) unmountGame();
    show('room');
    renderRoom();
  } else if (current && current.matchId === room.matchId) {
    if (current.inst.onRoom) current.inst.onRoom(room);
  } else if (!current) show('loading');
  voiceRoom(room);
}

function onEmote(m) {
  const pt = current && current.inst.emoteAnchor ? current.inst.emoteAnchor(m.seat) : null;
  floatAt(pt || { x: innerWidth * (0.3 + Math.random() * 0.4), y: innerHeight * 0.8 }, m.e, 'emote');
  if (current && current.inst.onEmote) current.inst.onEmote(m);
}

// ================= NẠP / GỠ GAME =================
async function pump() {
  if (pumping) return;
  pumping = true;
  while (GQ.length) {
    let m = GQ.shift();
    if (!ROOM || !ROOM.playing || m.matchId !== ROOM.matchId) continue;
    try {
      const g = await ensureGame(m);
      if (!g) continue;
      // Game real-time: gộp các tin đang chờ, chỉ vẽ trạng thái mới nhất (không mất sự kiện).
      if (g.realtime) while (GQ.length && GQ[0].matchId === m.matchId) {
        const n = GQ.shift();
        n.events = m.events.concat(n.events);
        n.meta = n.meta || m.meta;
        m = n;
      }
      await g.inst.update(m, { backlog: GQ.length, hidden: document.hidden });
    } catch (e) { console.error('[game]', e); }
  }
  pumping = false;
}

async function ensureGame(m) {
  if (current && current.matchId === m.matchId) return current;
  if (current) unmountGame();
  const entry = entryOf(m.game);
  if (!entry) throw new Error('Game lạ: ' + m.game);
  show('loading');
  const mod = await import(`/games/${entry.dir}/client.js`);
  if (!ROOM || ROOM.matchId !== m.matchId) return null;
  const root = $('#game-root');
  root.innerHTML = '';
  const cur = { matchId: m.matchId, key: m.game, entry, realtime: entry.realtime, css: [], inst: {} };
  current = cur;
  cur.inst = (await mod.default.mount(root, makeCtx(cur))) || {};
  show('game');
  return cur;
}

function unmountGame() {
  const cur = current;
  current = null;
  try { if (cur.inst.unmount) cur.inst.unmount(); } catch (e) { console.error(e); }
  cur.css.forEach(l => l.remove());
  $('#game-root').innerHTML = '';
  if (modalOpen()) closeModal();
}

// ctx: mọi thứ hub cung cấp cho game.
function makeCtx(cur) {
  return {
    game: cur.entry,
    me: () => ({ uid: ME.uid, seat: mySeat(), isHost: isHost() }),
    room: () => ROOM,
    send: action => act('act', { action }),
    backToLobby: () => act('lobby'),
    restart: () => act('start'),
    exit: exitGame,
    loadCss(href) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = String(href);
      document.head.appendChild(l);
      cur.css.push(l);
      return new Promise(r => { l.onload = l.onerror = r; });
    },
    ui: { ...UI, emoteBar, toolbar },
    sfx: { ...sfx, tone, noise, ac },
  };
}

function exitGame() {
  if (isHost()) { if (confirm('Kết thúc ván này và đưa mọi người về phòng chờ?')) act('lobby'); }
  else if (confirm('Rời khỏi phòng? (máy sẽ tự đi giúp phần của bạn)')) leaveRoom();
}

// Thanh emoji dùng chung.
function emoteBar(container) {
  container.classList.add('emotes');
  for (const e of EMOTES) {
    const b = el('button', '', e);
    b.onclick = () => net.request('emote', { e });
    container.appendChild(b);
  }
}
// Thanh công cụ dùng chung: âm thanh, nhạc, luật chơi, thoát.
function toolbar(container, { help } = {}) {
  container.classList.add('toolbar');
  const snd = el('button', 'ghost'), mus = el('button', 'ghost', '🎵');
  snd.title = 'Âm thanh'; mus.title = 'Nhạc nền';
  const paint = () => { snd.textContent = soundOn() ? '🔊' : '🔇'; mus.style.opacity = musicOn() ? 1 : 0.45; };
  snd.onclick = () => { setSound(!soundOn()); paint(); };
  mus.onclick = () => { setMusic(!musicOn()); paint(); };
  container.append(snd, mus);
  if (help) { const h = el('button', 'ghost', '📖'); h.title = 'Luật chơi'; h.onclick = help; container.appendChild(h); }
  const x = el('button', 'ghost', '🏠');
  x.title = 'Thoát';
  x.onclick = exitGame;
  container.appendChild(x);
  paint();
}

// ================= MÀN HÌNH =================
function show(name) {
  for (const s of ['home', 'room', 'game', 'loading']) $('#scr-' + s).classList.toggle('hidden', s !== name);
  showChat(name !== 'home');
}

function renderHome() {
  const MAX = 5;   // nhiều game thì chỉ khoe vài trò đầu, còn lại gộp thành "+N trò khác"
  const more = CATALOG.length > MAX + 1 ? CATALOG.length - MAX : 0;
  $('#showcase').innerHTML = CATALOG.slice(0, more ? MAX : undefined).map(g => `<span>${g.icon} ${esc(g.name)}</span>`).join('') +
    (more ? `<span class="muted" title="${esc(CATALOG.slice(MAX).map(g => g.name).join(', '))}">+${more} trò khác</span>` : '');
}

function inviteLink() {
  const local = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  const base = ME.pub || (local && ME.lan.length ? ME.lan[0] : location.origin);
  return `${base}/?room=${ROOM.code}`;
}

// Biểu tượng 🎙️/🔇 cạnh tên người đang trong đàm thoại (sáng lên khi đang nói — voice.js gắn class qua data-vuid).
function vmic(uid) {
  const m = ROOM.members.find(x => x.uid === uid);
  return m && m.voice ? ` <span class="vmic${m.voice.m ? ' off' : ''}" data-vuid="${esc(uid)}" title="${m.voice.m ? 'Đang tắt mic' : 'Trong đàm thoại'}">${m.voice.m ? '🔇' : '🎙️'}</span>` : '';
}

function renderRoom() {
  const host = isHost(), me = mySeat(), entry = entryOf(ROOM.game);
  $('#room-code').textContent = ROOM.code;
  const local = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  $('#room-links').innerHTML = `Mời bạn bè: <code>${esc(inviteLink())}</code>` +
    (ME.pub ? (ME.lan.length ? `<br>Cùng wifi thì vào nhanh hơn: <code>${esc(ME.lan[0])}/?room=${ROOM.code}</code>` : '')
      : local && ME.lan.length ? '<br>Bạn đang mở bằng localhost — bạn bè cùng wifi dùng link trên. Chơi qua Internet: chạy <code>npm run online</code>.' : '');

  // game đang chọn (chủ phòng bấm "Đổi game" để mở bảng chọn — đủ chỗ cho vài chục game)
  const cur = $('#game-cur');
  cur.innerHTML = `<span class="gi">${entry.icon}</span><div class="grow"><div class="gcur-head"><b>${esc(entry.name)}</b>` +
    `<span class="small muted">${esc(entry.tagline)} · ${range(entry)} người</span></div>` +
    `<div class="gdesc">${esc(entry.description)}</div></div>`;
  if (host && CATALOG.length > 1) {
    const b = el('button', 'ghost gcur-btn', `🎮 Đổi game <span class="muted small">(${CATALOG.length})</span>`);
    b.onclick = () => { sfx.pop(); openGamePicker(); };
    cur.appendChild(b);
  }

  // ghế
  const seats = $('#seats');
  seats.innerHTML = '';
  ROOM.seats.forEach((s, i) => {
    const info = entry.seats[i];
    const d = el('div', `seat seat-${s.kind}${s.uid && s.uid === ME.uid ? ' mine' : ''}`);
    d.style.setProperty('--c', info.color);
    const who = s.kind === 'human' ? `👤 ${esc(s.name)}${s.uid === ME.uid ? ' (bạn)' : ''}${vmic(s.uid)}${s.online ? '' : ' <span class="muted small">(offline)</span>'}`
      : s.kind === 'bot' ? `🤖 ${esc(s.name)}`
      : s.kind === 'closed' ? '<span class="muted">🚫 Đã đóng</span>'
      : '<span class="muted">Trống — bấm để ngồi</span>';
    const dot = s.kind === 'human' ? esc([...s.name][0] || '?').toUpperCase() : s.kind === 'bot' ? '🤖' : '';
    d.innerHTML = `<div class="seat-dot">${dot}</div><div><div class="seat-color">${esc(info.name)}${info.label ? ' · ' + esc(info.label) : ''}</div><div class="seat-who">${who}</div></div>`;
    if (s.kind === 'open') d.onclick = () => { sfx.pop(); act('sit', { seat: i }); };
    if (host) {
      const sel = el('select', 'seat-sel');
      sel.innerHTML = (s.kind === 'human' ? '<option value="human">👤 Người</option>' : '') +
        '<option value="open">Trống</option><option value="bot">🤖 Bot</option><option value="closed">🚫 Đóng</option>';
      sel.value = s.kind;
      sel.onclick = e => e.stopPropagation();
      sel.onchange = () => act('seatKind', { seat: i, kind: sel.value });
      d.appendChild(sel);
    }
    seats.appendChild(d);
  });

  // tuỳ chọn của game đang chọn
  const opts = $('#room-opts');
  opts.innerHTML = '';
  for (const o of entry.options) {
    const lab = el('label', '', esc(o.label));
    const sel = el('select');
    sel.innerHTML = o.choices.map((c, i) => `<option value="${i}">${esc(c.label)}</option>`).join('');
    sel.value = String(o.choices.findIndex(c => c.value === ROOM.opts[o.key]));
    sel.disabled = !host;
    sel.onchange = () => act('opts', { key: o.key, value: o.choices[+sel.value].value });
    lab.appendChild(sel);
    opts.appendChild(lab);
  }
  if (ROOM.estimate) opts.appendChild(el('label', '', `Thời lượng ước tính<input value="${esc(ROOM.estimate)}" disabled>`));

  const filled = ROOM.seats.filter(s => s.kind === 'human' || s.kind === 'bot').length;
  const watchers = ROOM.members.filter(m => m.seat < 0);
  $('#room-members').innerHTML = `👑 Chủ phòng: <b>${esc(ROOM.hostName)}</b>` +
    (watchers.length ? ` · 👀 Đang xem: ${watchers.map(m => esc(m.name) + vmic(m.uid) + (m.online ? '' : ' (offline)')).join(', ')}` : '');
  $('#btn-unsit').classList.toggle('hidden', me < 0);
  $('#btn-start').classList.toggle('hidden', !host);
  $('#btn-bots').classList.toggle('hidden', !host || !ROOM.seats.some(s => s.kind === 'open'));
  $('#btn-start').disabled = filled < entry.minPlayers;
  $('#room-wait').textContent = host ? (filled < entry.minPlayers ? `Cần ít nhất ${entry.minPlayers} người/bot` : '') : 'Chờ chủ phòng chọn game và bắt đầu...';
}

// Bảng chọn game: tìm kiếm (không dấu) + lọc theo thể loại. Game không đủ chỗ cho cả phòng xếp cuối, làm mờ.
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
let pickTag = '';   // thể loại đang lọc, giữ giữa các lần mở
function openGamePicker() {
  const people = ROOM.members.length;
  const tags = [...new Set(CATALOG.flatMap(g => g.tags))];
  const count = t => CATALOG.filter(g => g.tags.includes(t)).length;
  tags.sort((a, b) => count(b) - count(a) || a.localeCompare(b, 'vi'));
  if (!tags.includes(pickTag)) pickTag = '';
  const card = openModal(`<div class="gp-head"><h2>Chọn trò chơi <span class="muted small">${CATALOG.length} trò</span></h2>` +
    `<button class="ghost" data-x title="Đóng (Esc)">✕</button></div>` +
    `<input class="gp-q" type="search" placeholder="🔍 Tìm theo tên, thể loại..." autocomplete="off">` +
    (tags.length ? '<div class="gp-tags"></div>' : '') + '<div class="gp-list"></div>');
  card.classList.add('gpick');
  const q = card.querySelector('.gp-q'), list = card.querySelector('.gp-list'), tagBox = card.querySelector('.gp-tags');
  card.querySelector('[data-x]').onclick = closeModal;
  const choose = g => {
    closeModal();
    if (g.id !== ROOM.game) { sfx.pop(); act('selectGame', { game: g.id }); }
  };
  const fits = g => g.maxPlayers >= people;
  const sorted = [...CATALOG].sort((a, b) => fits(b) - fits(a));   // sort ổn định: giữ thứ tự `order` trong từng nhóm
  let shown = [];
  const paint = () => {
    if (tagBox) {
      tagBox.innerHTML = '';
      for (const t of ['', ...tags]) {
        const c = el('button', 'gp-tag' + (t === pickTag ? ' on' : ''), t ? `${esc(t)} <span>${count(t)}</span>` : 'Tất cả');
        c.onclick = () => { pickTag = t; paint(); };
        tagBox.appendChild(c);
      }
    }
    const words = fold(q.value).split(/\s+/).filter(Boolean);
    shown = sorted.filter(g => (!pickTag || g.tags.includes(pickTag)) &&
      words.every(w => fold([g.name, g.tagline, g.description, ...g.tags].join(' ')).includes(w)));
    list.innerHTML = shown.length ? '' : `<div class="muted center gp-none">Không có trò nào khớp${q.value.trim() ? ` “${esc(q.value.trim())}”` : ''}.</div>`;
    for (const g of shown) {
      const b = el('button', 'gcard' + (g.id === ROOM.game ? ' sel' : '') + (fits(g) ? '' : ' nofit'),
        `<span class="gi">${g.icon}</span><span><b>${esc(g.name)}</b><span class="small muted">${esc(g.tagline)}</span>` +
        `<span class="small gmeta">${g.id === ROOM.game ? '✔ Đang chọn · ' : ''}👥 ${range(g)}` +
        `${fits(g) ? '' : ' · ⚠️ thiếu chỗ'}${g.tags.length ? ' · ' + g.tags.map(esc).join(', ') : ''}</span></span>`);
      b.title = g.description + (fits(g) ? '' : `\n\n⚠️ Tối đa ${g.maxPlayers} người — phòng đang có ${people}, những người còn lại chỉ xem được.`);
      b.onclick = () => choose(g);
      list.appendChild(b);
    }
  };
  q.oninput = paint;
  q.onkeydown = e => { if (e.key === 'Enter' && shown.length) choose(shown[0]); };
  paint();
  if (matchMedia('(pointer: fine)').matches) q.focus();   // điện thoại: không tự bật bàn phím
}

function resetToHome(msg) {
  GQ.length = 0;
  if (current) unmountGame();
  ROOM = null;
  Object.assign(ME, { code: null, pid: null, uid: null });
  sessionStorage.removeItem('hub_session');
  history.replaceState(null, '', location.pathname);
  closeModal();
  resetChat();
  voiceReset();
  show('home');
  if (msg) toast(msg);
}
async function leaveRoom() {
  await net.request('leave');
  resetToHome();
}

// ================= KHỞI ĐỘNG =================
function getName() {
  const n = $('#in-name').value.trim();
  if (!n) { toast('Nhập tên của bạn trước đã nhé!'); $('#in-name').focus(); return null; }
  localStorage.setItem('hub_name', n);
  return n;
}

initFx($('#fx'));
initChat({
  send: text => act('chat', { text }),
  myUid: () => ME.uid,
  anchorOf: seat => (current && current.inst.emoteAnchor ? current.inst.emoteAnchor(seat) : null),
  onIncoming: () => sfx.chat(),
});
initVoice({
  request: (t, data) => act(t, data),
  post: net.post,
  myUid: () => ME.uid,
  anchorOf: seat => (current && current.inst.emoteAnchor ? current.inst.emoteAnchor(seat) : null),
});
$('#in-name').value = localStorage.getItem('hub_name') || '';
const qRoom = new URLSearchParams(location.search).get('room');
if (qRoom) $('#in-code').value = qRoom.toUpperCase();

$('#btn-create').onclick = async () => {
  ac();
  const name = getName();
  if (!name) return;
  const j = await act('create', { name });
  if (j.ok) enterRoom(j);
};
const join = async () => {
  ac();
  const name = getName();
  if (!name) return;
  const code = $('#in-code').value.trim().toUpperCase();
  if (code.length !== 4) return toast('Mã phòng gồm 4 chữ cái');
  const s = session();
  const j = await act('join', { code, name, pid: s && s.code === code ? s.pid : undefined });
  if (j.ok) enterRoom(j);
};
$('#btn-join').onclick = join;
$('#in-code').onkeydown = e => { if (e.key === 'Enter') join(); };
$('#btn-copy').onclick = () => {
  const link = inviteLink();
  const done = () => toast('📋 Đã copy link mời!');
  if (navigator.clipboard && isSecureContext) navigator.clipboard.writeText(link).then(done);
  else { const t = el('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
};
$('#btn-leave').onclick = leaveRoom;
$('#btn-unsit').onclick = () => act('unsit');
$('#btn-bots').onclick = () => act('fillBots');
$('#btn-start').onclick = () => { ac(); act('start'); };
addEventListener('keydown', e => { if (e.key === 'Escape' && modalOpen()) closeModal(); });
