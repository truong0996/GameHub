// Client của hub: kết nối WebSocket, màn hình chính, phòng chờ, nạp/gỡ game, hàng đợi tin nhắn game.
// Game cắm vào qua games/<dir>/client.js — xem "Game client interface" trong CLAUDE.md.
import * as UI from './ui.js';
import { $, el, esc, toast, openModal, closeModal, modalOpen, floatAt, initFx } from './ui.js';
import { sfx, tone, noise, ac, soundOn, musicOn, setSound, setMusic } from './sfx.js';
import { initChat, showChat, resetChat, chatLog, chatMsg } from './chat.js';
import { initVoice, voiceRoom, voiceSignal, voiceAudio, voiceReset, voiceReconnected, voiceVolumes } from './voice.js';
import { initShop, openShop, openRenameModal, renameCards, setWallet, myWallet, fmt, extraEmotes, nameHtml, titleHtml, frameCls, comboCls, comboFx, comboStage, playFx, creditNotice, skinCls, setSkin, drawHat } from './shop.js';
import { initAchievements, openAchievements, setAchievements, achNotice } from './achievements.js';
import { avImg, openAvatarEditor } from './avatar.js';
import { apply as applyDelta } from './delta.js';

const EMOTES = ['😂', '😎', '😡', '😭', '🔥', '👏', '🐴', '💀', '🙏', '🤡'];
const ME = { pid: null, uid: null, code: null, lan: [], pub: null, user: null, accounts: false };   // user: tài khoản đã đăng nhập { id, name }
let CATALOG = [], ROOM = null;
let current = null;            // game đang mount: { matchId, key, entry, realtime, inst, css: [] }
const GQ = [];                 // hàng đợi tin 'game' (phát lần lượt để animation không chồng nhau)
let GS = null;                 // { matchId, base }: state mới nhất đã dựng lại (nền để áp delta)
let pumping = false;

const mySeat = () => (ROOM ? ROOM.seats.findIndex(s => s.kind === 'human' && s.uid === ME.uid) : -1);
const isHost = () => !!ROOM && ROOM.host === ME.uid;
const entryOf = id => CATALOG.find(g => g.id === id);
const withTags = cat => cat.map(g => ({ ...g, tags: g.tags || [] }));   // server cũ (chưa khởi động lại) gửi catalog không có tags
const range = g => g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`;   // số người chơi: "2–6" hoặc "2"
const session = () => JSON.parse(sessionStorage.getItem('hub_session') || 'null');

// ================= KẾT NỐI =================
// Server chạy nhiều tiến trình, mỗi phòng nằm ở một tiến trình: kết nối kèm ?room=<mã> để vào thẳng đúng chỗ.
// Vào phòng ở tiến trình khác thì server trả { moved } → move(mã) kết nối lại rồi gửi lại.
const net = (() => {
  let ws = null, seq = 0, backoff = 400, ready = false, moving = false;
  let room = (session() || {}).code || new URLSearchParams(location.search).get('room') || '';
  const pending = new Map(), waiting = [];
  function connect() {
    const q = /^[A-Za-z]{4}$/.test(room) ? '?room=' + room.toUpperCase() : '';
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${q}`);
    ws.binaryType = 'arraybuffer';
    const me = ws;
    ws.onopen = async () => {
      backoff = 400;
      $('#net').classList.add('hidden');
      await onConnected();
      if (ws !== me) return;   // onConnected đã chuyển sang tiến trình khác (move) — kết nối mới sẽ lo phần còn lại
      ready = true;
      while (waiting.length) waiting.shift()();
    };
    ws.onmessage = e => {
      if (typeof e.data !== 'string') return voiceAudio(e.data);   // tiếng đàm thoại đi vòng qua server
      const m = JSON.parse(e.data);
      if (m.t === 'res') { const cb = pending.get(m.id); if (cb) { pending.delete(m.id); cb(m); } return; }
      onMessage(m);
    };
    ws.onclose = () => {
      ready = false;
      for (const cb of pending.values()) cb({ ok: false, err: 'Mất kết nối tới server' });
      pending.clear();
      if (moving) { moving = false; connect(); return; }
      $('#net').classList.remove('hidden');
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 5000);
    };
  }
  // Đổi phòng đích của kết nối (lần kết nối lại sau đi thẳng tới tiến trình giữ phòng này).
  const setRoom = code => { room = code || ''; };
  // Kết nối lại ngay tới tiến trình giữ phòng `code`; request() sau đó tự chờ kết nối mới sẵn sàng.
  function move(code) {
    room = code;
    ready = false;
    if (ws && ws.readyState <= 1) { moving = true; ws.close(); } else connect();
  }
  // Mất đồng bộ (nhận delta mà không có bản gốc) → kết nối lại để nhận state đầy đủ.
  const resync = () => { if (ws && ws.readyState === 1) ws.close(); };
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
  // sendBin: gói tiếng đàm thoại; mạng đang ứ thì bỏ (thà mất một đoạn còn hơn trễ dần).
  const sendBin = buf => { if (ready && ws.readyState === 1 && ws.bufferedAmount < 32768) ws.send(buf); };
  connect();
  return { raw, request, post, sendBin, setRoom, move, resync };
})();
// Vào phòng `data.code`: phòng ở tiến trình khác thì chuyển kết nối sang đó rồi thử lại (một lần).
async function joinRoom(data) {
  let j = await net.request('join', data);
  if (!j.ok && j.moved) { net.move(data.code); j = await net.request('join', data); }
  if (!j.ok) { toast('⚠️ ' + esc(j.err)); sfx.error(); }
  return j;
}

async function act(t, data) {
  const r = await net.request(t, data);
  if (!r.ok) { toast('⚠️ ' + esc(r.err)); sfx.error(); }
  return r;
}

async function onConnected() {
  const h = await net.raw('hello');
  if (h.ok) { CATALOG = withTags(h.catalog); ME.lan = h.lan; ME.pub = h.pub; ME.accounts = !!h.accounts; renderHome(); }
  // Đăng nhập lại bằng token đã lưu (trước khi vào lại phòng, để server gắn đúng tài khoản).
  const token = localStorage.getItem('hub_token');
  if (token && ME.accounts) {
    const a = await net.raw('auth', { token });
    if (a.ok) { ME.user = a.user; loadWallet(net.raw); loadAchievements(net.raw); }
    else if (/hết hạn/.test(a.err || '')) { localStorage.removeItem('hub_token'); ME.user = null; toast('⚠️ ' + esc(a.err)); }
  }
  renderAccount();
  const s = session();
  if (!s) return;
  const j = await net.raw('join', { code: s.code, pid: s.pid });
  if (!j.ok && j.moved) { net.move(s.code); return; }   // kết nối mới (đúng tiến trình) sẽ tự vào lại
  if (j.ok) { enterRoom(j); voiceReconnected(); }
  else { sessionStorage.removeItem('hub_session'); if (ROOM) resetToHome('⚠️ ' + esc(j.err)); }
}

function enterRoom(j) {
  Object.assign(ME, { code: j.code, pid: j.pid, uid: j.uid, lan: j.lan || ME.lan, pub: j.pub || ME.pub });
  CATALOG = j.catalog ? withTags(j.catalog) : CATALOG;
  sessionStorage.setItem('hub_session', JSON.stringify({ code: j.code, pid: j.pid }));
  net.setRoom(j.code);
  history.replaceState(null, '', '?room=' + j.code);
}

function onMessage(m) {
  if (m.t === 'room') onRoom(m.room);
  else if (m.t === 'game') {
    // Server gửi state đầy đủ (state) hoặc chỉ phần đổi so với lần trước (ds, xem delta.js). GS.base là bản gốc hub giữ riêng;
    // game nhận bản sao để có sửa state tại chỗ cũng không làm hỏng bản gốc.
    if (m.ds) {
      if (!GS || GS.matchId !== m.matchId) return net.resync();
      GS.base = applyDelta(GS.base, m.ds);
      delete m.ds;
    } else GS = { matchId: m.matchId, base: m.state };
    m.state = structuredClone(GS.base);
    m.recvAt = Date.now(); GQ.push(m); pump();
  }
  else if (m.t === 'emote') onEmote(m);
  else if (m.t === 'chatLog') chatLog(m.log);
  else if (m.t === 'chat') chatMsg(m.msg);
  else if (m.t === 'rtc') voiceSignal(m);
  else if (m.t === 'kicked' && m.code === ME.code) resetToHome('🚪 Chủ phòng đã mời bạn ra khỏi phòng');
  else if (m.t === 'credit') creditNotice(m);
  else if (m.t === 'ach') achNotice(m);
  else if (m.t === 'fx') setTimeout(() => playFx(m.fx, fxAnchor(m.seat), m.why !== 'win'), m.delay || 0);
}

// Chỗ phát hiệu ứng của một ghế: trong game thì hỏi game (emoteAnchor), ở phòng chờ thì ảnh đại diện của ghế.
function fxAnchor(seat) {
  if (current && current.inst.emoteAnchor) return current.inst.emoteAnchor(seat) || null;
  const dot = !$('#scr-room').classList.contains('hidden') && $(`#seats .seat:nth-child(${seat + 1}) .seat-dot`);
  if (!dot) return null;
  const r = dot.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function onRoom(room) {
  ROOM = room;
  if (!room.playing) {
    GQ.length = 0;
    if (current) unmountGame();
    show('room');
    renderRoom();
  } else if (current && current.matchId === room.matchId) {
    patchAvatars();
    if (current.inst.onRoom) current.inst.onRoom(room);
  } else if (!current) show('loading');
  if (room.playing && $('#modal .gpick')) closeModal();
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
  const prevCss = $('#preview-css');
  if (prevCss) prevCss.remove();
  const entry = entryOf(m.game);
  if (!entry) throw new Error('Game lạ: ' + m.game);
  show('loading');
  const mod = await import(`/games/${entry.dir}/client.js`);
  if (!ROOM || ROOM.matchId !== m.matchId) return null;
  const root = $('#game-root');
  root.innerHTML = '';
  // Xếp chỗ ngẫu nhiên (ROOM.home): ghế i trong ván mang màu/tên của ghế home[i] mà người đó đã chọn ở phòng chờ.
  const home = ROOM.home;
  const seen = home ? { ...entry, seats: entry.seats.map((s, i) => entry.seats[home[i] ?? i]) } : entry;
  const cur = { matchId: m.matchId, key: m.game, entry: seen, realtime: entry.realtime, css: [], inst: {} };
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
  voiceVolumes(null);
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
    // volumes({ uid: 0..1 } | null): âm lượng nghe từng người trong đàm thoại (vd theo khoảng cách); gỡ game thì tự trả lại.
    voice: { volumes: map => { if (current === cur) voiceVolumes(map); } },
    // Đồ trang trí trong game của người ngồi ghế seat (bot/khách = không có): look(seat) → {back?, dice?, hat?, ...} | null,
    // cls(seat, 'back'|'dice') → ' lk-.. lk-<id>' | '' (gắn vào class), set(el, seat, slot) đổi skin phần tử có sẵn,
    // hat(seat) → id mũ | null, drawHat(canvas2d, id, bề ngang người, y đỉnh đầu, giây).
    skin: {
      look: seatLook,
      cls: (seat, slot) => skinCls(seatLook(seat), slot),
      set: (node, seat, slot) => setSkin(node, seatLook(seat), slot),
      hat: seat => { const l = seatLook(seat); return (l && l.hat) || null; },
      drawHat,
      // Tên + danh hiệu theo đồ trang trí đang mặc (nếu có); không có hiệu ứng tên thì giữ màu ghế .pn hoặc mặc định.
      name: (seat, text, color) => nameHtml(text, seatLook(seat), color),
      title: seat => titleHtml(seatLook(seat)),
      comboCls: seat => comboCls(seatLook(seat)),
      comboBg: seat => comboStage(seatLook(seat)),
      // Ảnh đại diện người ngồi ghế seat (bot/khách/chưa đặt = null).
      avatar: seatAv,
      // face(seat, cls?) → ảnh đại diện kèm khung/hiệu ứng combo. cls 'fill' = phủ kín phần tử cha (cha cần position relative + bo tròn).
      face: (seat, cls = '') => {
        const u = seatAv(seat), l = seatLook(seat), f = frameCls(l);
        if (cls === 'fill') {
          const img = `<img class="hub-av fill" data-av="${seat}" alt="" draggable="false"${u ? ` src="${esc(u)}"` : ' hidden'}>`;
          return img + (f ? `<i class="hub-fr${f}${comboCls(l)}" aria-hidden="true">${comboFx(l)}</i>` : '');
        }
        return `<span class="hub-avw${cls ? ' ' + cls : ''}${f}${comboCls(l)}"><img class="hub-av" data-av="${seat}" alt="" draggable="false"${u ? ` src="${esc(u)}"` : ' hidden'}>${comboFx(l)}</span>`;
      },
      // img(seat) → HTMLImageElement đã tải xong (vẽ lên canvas) hoặc null (đang tải/không có).
      img: seatAvImg,
    },
  };
}
const seatLook = seat => { const s = ROOM && ROOM.seats && ROOM.seats[seat]; return (s && s.look) || null; };
const seatAv = seat => { const s = ROOM && ROOM.seats && ROOM.seats[seat]; return (s && s.kind === 'human' && s.av) || null; };
const AV_IMGS = new Map();   // URL → Image (cho game vẽ canvas)
function seatAvImg(seat) {
  const u = seatAv(seat);
  if (!u) return null;
  let im = AV_IMGS.get(u);
  if (!im) { im = new Image(); im.src = u; AV_IMGS.set(u, im); }
  return im.complete && im.naturalWidth ? im : null;
}
// Ai đó đổi/xoá ảnh giữa ván → cập nhật các <img class="hub-av"> game đã vẽ (game không phải tự vẽ lại).
function patchAvatars() {
  for (const im of document.querySelectorAll('#game-root img.hub-av[data-av]')) {
    const u = seatAv(+im.dataset.av);
    if (u) { if (im.getAttribute('src') !== u) im.src = u; im.hidden = false; }
    else { im.hidden = true; im.removeAttribute('src'); }
  }
}

function exitGame() {
  if (isHost()) { if (confirm('Kết thúc ván đấu hiện tại và đưa mọi người về phòng chờ?')) act('lobby'); }
  else if (confirm('Bạn muốn rời khỏi phòng? (Hệ thống sẽ tự động thay bạn hoàn tất ván đấu.)')) leaveRoom();
}

// Thanh emoji dùng chung.
function emoteBar(container) {
  container.classList.add('emotes');
  for (const e of [...EMOTES, ...extraEmotes()]) {   // + gói biểu cảm đã mua ở cửa hàng (nút viền vàng)
    const b = el('button', EMOTES.includes(e) ? '' : 'lk-em', e);
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
  document.documentElement.dataset.screen = name;   // CSS theo màn hình (vd xmas.css ẩn trang trí khi đang chơi)
  showChat(name !== 'home');
}

const HOME_FEATURED = ['cocangua', 'meono', 'uno', 'flip7', 'maodanh'];
let showAllGames = false;
function renderHome() {
  const rank = id => { const i = HOME_FEATURED.indexOf(id); return i < 0 ? 999 : i; };
  const ordered = [...CATALOG].sort((a, b) => rank(a.id) - rank(b.id));
  const MAX = HOME_FEATURED.length;   // mặc định hiện 5 trò nổi bật ở ngoài; bấm "+N trò chơi khác" để xem hết
  const more = !showAllGames && ordered.length > MAX + 1 ? ordered.length - MAX : 0;
  const box = $('#showcase');
  box.innerHTML = ordered.slice(0, more ? MAX : undefined).map(g => `<span title="${esc(g.tagline)} · 👥 ${range(g)}">${g.icon} ${esc(g.name)}</span>`).join('');
  if (ordered.length > MAX + 1) {
    const b = el('button', 'sc-more', more ? `+${more} trò chơi khác` : 'Thu gọn');
    b.type = 'button';
    b.onclick = () => { showAllGames = !showAllGames; renderHome(); };
    box.appendChild(b);
  }
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

// Nhãn "Khách" cạnh người chưa đăng nhập (ván của họ không được tính vào bảng xếp hạng).
const guestTag = x => (ME.accounts && !x.acct ? ' <span class="guest" title="Chế độ Khách — không lưu thành tích vào bảng xếp hạng">Khách</span>' : '');

function kickMember(uid, name) {
  if (!confirm(`Xác nhận mời ${name} rời khỏi phòng? (Người chơi cần chờ 2 phút trước khi tham gia lại.)`)) return;
  act('kick', { uid }).then(r => { if (r.ok) toast(`🚪 Đã mời ${esc(name)} rời khỏi phòng.`); });
}

function renderRoom() {
  const host = isHost(), me = mySeat(), entry = entryOf(ROOM.game);
  $('#room-code').textContent = ROOM.code;
  const local = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  $('#room-links').innerHTML = `Liên kết mời: <code>${esc(inviteLink())}</code>` +
    (ME.pub ? (ME.lan.length ? `<br>Cùng mạng Wi-Fi (truy cập nhanh): <code>${esc(ME.lan[0])}/?room=${ROOM.code}</code>` : '')
      : local && ME.lan.length ? '<br>Đang mở qua localhost — bạn bè cùng Wi-Fi có thể dùng liên kết trên. Để chơi qua Internet, hãy chạy <code>npm run online</code>.' : '');

  // game đang chọn (chủ phòng bấm "Đổi trò chơi" để mở bảng chọn; mọi người đều xem được luật chơi ngay tại phòng chờ)
  const cur = $('#game-cur');
  cur.innerHTML = `<span class="gi">${entry.icon}</span><div class="grow"><div class="gcur-head"><b>${esc(entry.name)}</b>` +
    `<span class="small muted">${esc(entry.tagline)} · ${range(entry)} người</span></div>` +
    `<div class="gdesc">${esc(entry.description)}</div></div>`;
  const acts = el('div', 'gcur-acts');
  const hb = el('button', 'ghost gcur-btn gcur-help', '📖 Luật chơi');
  hb.title = `Xem chi tiết luật chơi ${entry.name} theo thiết lập hiện tại`;
  hb.onclick = () => { sfx.pop(); openGameHelp(entry); };
  acts.appendChild(hb);
  if (CATALOG.length > 1) {
    const b = el('button', 'ghost gcur-btn', `🎮 ${host ? 'Đổi trò chơi' : 'Danh sách trò chơi'} <span class="muted small">(${CATALOG.length})</span>`);
    if (!host) b.title = `Hệ thống có ${CATALOG.length} trò chơi — chỉ chủ phòng mới có quyền thay đổi.`;
    b.onclick = () => { sfx.pop(); openGamePicker(); };
    acts.appendChild(b);
  }
  cur.appendChild(acts);

  // ghế
  const seats = $('#seats');
  seats.innerHTML = '';
  ROOM.seats.forEach((s, i) => {
    const info = entry.seats[i];
    const d = el('div', `seat seat-${s.kind}${s.uid && s.uid === ME.uid ? ' mine' : ''}${s.kind === 'human' ? comboCls(s.look) : ''}`);
    d.style.setProperty('--c', info.color);
    const isMe = s.kind === 'human' && s.uid === ME.uid;
    const who = s.kind === 'human' ? `${s.look || s.av ? '' : '👤 '}${nameHtml(s.name, s.look)}${guestTag(s)}${vmic(s.uid)}${s.online ? '' : ' <span class="muted small">(ngoại tuyến)</span>'}${titleHtml(s.look)}`
      : s.kind === 'bot' ? `🤖 ${esc(s.name)}`
      : s.kind === 'closed' ? '<span class="muted">🚫 Đã khoá</span>'
      : '<span class="muted">Nhấn để ngồi</span>';
    const av = s.kind === 'human' && s.av;
    const dot = av ? '' : s.kind === 'human' ? esc([...s.name][0] || '?').toUpperCase() : s.kind === 'bot' ? '🤖' : '';
    const mineAv = isMe && ME.user;   // bấm vào chấm của mình → đổi ảnh đại diện
    d.innerHTML = `${s.kind === 'human' ? comboStage(s.look) : ''}<div class="seat-avcol"><div class="seat-dot${s.kind === 'human' ? frameCls(s.look) + comboCls(s.look) : ''}${av ? ' has-av' : ''}${mineAv ? ' av-edit' : ''}"${av ? ` style="background-image:url('${esc(av)}')"` : ''}${mineAv ? ' title="Cập nhật ảnh đại diện"' : ''}>${dot}${s.kind === 'human' ? comboFx(s.look) : ''}</div>${isMe ? '<span class="seat-you">Bạn</span>' : ''}</div><div class="seat-info"><div class="seat-color">${esc(info.name)}${info.label ? ' · ' + esc(info.label) : ''}</div><div class="seat-who">${who}</div></div>`;
    if (s.kind === 'open') d.onclick = () => { sfx.pop(); act('sit', { seat: i }); };
    if (host) {
      const sel = el('select', 'seat-sel');
      const other = s.kind === 'human' && s.uid !== ME.uid;
      sel.innerHTML = (s.kind === 'human' ? '<option value="human">👤 Người</option>' : '') +
        '<option value="open">Trống</option><option value="bot">🤖 Bot</option><option value="closed">🚫 Khoá</option>' +
        (other ? '<option value="kick">🚪 Mời ra</option>' : '');
      sel.value = s.kind;
      sel.onclick = e => e.stopPropagation();
      sel.onchange = () => {
        if (sel.value !== 'kick') return act('seatKind', { seat: i, kind: sel.value });
        sel.value = s.kind;
        kickMember(s.uid, s.name);
      };
      d.appendChild(sel);
    }
    if (mineAv) d.querySelector('.seat-dot').onclick = e => { e.stopPropagation(); editAvatar(); };
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
  const hostM = ROOM.members.find(m => m.uid === ROOM.host);
  $('#room-members').innerHTML = `👑 Chủ phòng: ${avImg(hostM && hostM.av, hostM && hostM.look)}${nameHtml(ROOM.hostName, hostM && hostM.look)}${titleHtml(hostM && hostM.look)}` +
    (watchers.length ? ` · 👀 Đang theo dõi: ${watchers.map(m => avImg(m.av, m.look) + nameHtml(m.name, m.look) + titleHtml(m.look) + guestTag(m) + vmic(m.uid) + (m.online ? '' : ' (ngoại tuyến)') +
      (host && m.uid !== ME.uid ? ` <button class="ghost kick" data-kick="${esc(m.uid)}" title="Mời ${esc(m.name)} rời khỏi phòng">✕</button>` : '')).join(', ')}` : '');
  for (const b of $('#room-members').querySelectorAll('[data-kick]')) {
    const m = ROOM.members.find(x => x.uid === b.dataset.kick);
    b.onclick = () => kickMember(m.uid, m.name);
  }
  $('#btn-unsit').classList.toggle('hidden', me < 0);
  $('#btn-start').classList.toggle('hidden', !host);
  $('#btn-bots').classList.toggle('hidden', !host || !ROOM.seats.some(s => s.kind === 'open'));
  $('#btn-start').disabled = filled < entry.minPlayers;
  $('#room-wait').textContent = host ? (filled < entry.minPlayers ? `Cần tối thiểu ${entry.minPlayers} người chơi hoặc bot để bắt đầu.` : '') : 'Đang chờ chủ phòng chọn trò chơi và bắt đầu ván đấu...';
  if (pickerPaint && $('#modal .gpick')) pickerPaint(); else pickerPaint = null;
}

async function openGameHelp(entry) {
  const href = `/games/${entry.dir}/style.css`;
  let css = $('#preview-css');
  if (!css || css.getAttribute('href') !== href) {
    if (css) css.remove();
    css = document.createElement('link');
    css.id = 'preview-css';
    css.rel = 'stylesheet';
    css.href = href;
    document.head.appendChild(css);
    await new Promise(r => { css.onload = css.onerror = r; });
  }
  const mod = await import(`/games/${entry.dir}/client.js`);
  if (typeof mod.default?.help === 'function') {
    const opts = Object.fromEntries((entry.options || []).map(o => [o.key, o.default]));
    const roomSnap = () => ({ ...(ROOM || {}), game: entry.id, opts: ROOM && ROOM.game === entry.id ? { ...opts, ...ROOM.opts } : opts, turnMs: (ROOM && ROOM.game === entry.id && ROOM.turnMs) || entry.turnMs || 25000 });
    return mod.default.help({ game: entry, ui: UI, room: roomSnap });
  }
  const card = openModal(`<div class="help"><h2>📖 Luật chơi — ${esc(entry.name)}</h2><p>${esc(entry.description || entry.tagline)}</p><div class="btns" style="margin-top:16px"><button class="gold" data-x>Đã hiểu</button></div></div>`);
  card.querySelector('[data-x]').onclick = closeModal;
}

// Bảng chọn game: tìm kiếm (không dấu) + lọc theo thể loại. Game không đủ chỗ cho cả phòng xếp cuối, làm mờ.
// Người không phải chủ phòng mở ở chế độ chỉ đọc (xem hub có những trò gì). Phòng đổi (đổi game, đổi chủ phòng) thì vẽ lại.
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
let pickTag = '';   // thể loại đang lọc, giữ giữa các lần mở
let pickerPaint = null;   // vẽ lại bảng chọn đang mở khi phòng đổi
function openGamePicker() {
  const tags = [...new Set(CATALOG.flatMap(g => g.tags))];
  const count = t => CATALOG.filter(g => g.tags.includes(t)).length;
  tags.sort((a, b) => count(b) - count(a) || a.localeCompare(b, 'vi'));
  if (!tags.includes(pickTag)) pickTag = '';
  const card = openModal(`<div class="gp-head"><h2><span class="gp-title"></span> <span class="muted small">${CATALOG.length} trò chơi</span></h2>` +
    `<button class="ghost" data-x title="Đóng (Esc)">✕</button></div><div class="gp-ro small hidden"></div>` +
    `<input class="gp-q" type="search" placeholder="🔍 Tìm kiếm theo tên hoặc thể loại..." autocomplete="off">` +
    (tags.length ? '<div class="gp-tags"></div>' : '') + '<div class="gp-list"></div>');
  card.classList.add('gpick');
  const q = card.querySelector('.gp-q'), list = card.querySelector('.gp-list'), tagBox = card.querySelector('.gp-tags'), ro = card.querySelector('.gp-ro');
  card.querySelector('[data-x]').onclick = closeModal;
  const choose = g => {
    if (!isHost()) return;
    closeModal();
    if (g.id !== ROOM.game) { sfx.pop(); act('selectGame', { game: g.id }); }
  };
  let shown = [];
  const paint = () => {
    const host = isHost(), people = ROOM.members.length;
    const fits = g => g.maxPlayers >= people;
    const sorted = [...CATALOG].sort((a, b) => fits(b) - fits(a));   // sort ổn định: giữ thứ tự `order` trong từng nhóm
    card.querySelector('.gp-title').textContent = host ? 'Chọn trò chơi' : 'Danh sách trò chơi';
    ro.classList.toggle('hidden', host);
    ro.innerHTML = `👀 Chỉ chủ phòng <b>${esc(ROOM.hostName)}</b> mới có quyền đổi trò chơi — bạn có thể đề xuất qua khung trò chuyện 💬.`;
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
    list.innerHTML = shown.length ? '' : `<div class="muted center gp-none">Không tìm thấy trò chơi phù hợp${q.value.trim() ? ` với từ khoá “${esc(q.value.trim())}”` : ''}.</div>`;
    for (const g of shown) {
      const b = el(host ? 'button' : 'div', 'gcard' + (g.id === ROOM.game ? ' sel' : '') + (fits(g) ? '' : ' nofit') + (host ? '' : ' ro'),
        `<span class="gi">${g.icon}</span><span><b>${esc(g.name)}</b><span class="small muted">${esc(g.tagline)}</span>` +
        `<span class="small gmeta">${g.id === ROOM.game ? '✔ Đang chọn · ' : ''}👥 ${range(g)}` +
        `${fits(g) ? '' : ' · ⚠️ Không đủ chỗ'}${g.tags.length ? ' · ' + g.tags.map(esc).join(', ') : ''}</span></span>`);
      b.title = g.description + (fits(g) ? '' : `\n\n⚠️ Hỗ trợ tối đa ${g.maxPlayers} người chơi — phòng hiện có ${people} thành viên, các thành viên còn lại sẽ ở chế độ theo dõi.`);
      if (host) b.onclick = () => choose(g);
      list.appendChild(b);
    }
  };
  pickerPaint = paint;
  q.oninput = paint;
  q.onkeydown = e => { if (e.key === 'Enter' && shown.length) choose(shown[0]); };
  paint();
  if (matchMedia('(pointer: fine)').matches) q.focus();   // điện thoại: không tự bật bàn phím
}

function resetToHome(msg) {
  GQ.length = 0;
  if (current) unmountGame();
  const prevCss = $('#preview-css');
  if (prevCss) prevCss.remove();
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

// ================= TÀI KHOẢN =================
// Đăng nhập (tên + PIN) để ván được tính vào bảng xếp hạng; không đăng nhập thì chơi như khách.
function renderAccount() {
  const box = $('#acct'), u = ME.user;
  const w = myWallet(), look = w && w.eq;
  box.className = 'acct' + (ME.accounts ? '' : ' hidden') + (u ? ' on' + comboCls(look) : '');
  $('#lab-name').classList.toggle('hidden', !!u);
  if (!ME.accounts) return;
  box.innerHTML = u
    ? `<button class="av-me${u.av ? '' : ' none'}${frameCls(look)}${comboCls(look)}" data-av title="${u.av ? 'Đổi' : 'Đặt'} ảnh đại diện">${u.av ? avImg(u.av) : '📷'}${comboFx(look)}</button>` +
      `<div class="acct-info"><div class="acct-name">${nameHtml(u.name, look)}${titleHtml(look)}</div><div class="acct-sub"><button class="ghost acct-ren" data-ren title="${renameCards() ? `Đổi tên tài khoản (đang có ${renameCards()} thẻ)` : 'Đổi tên tài khoản (cần Thẻ Đổi Tên)'}">✏️</button> <span class="muted small">· Đã bật lưu xếp hạng</span></div></div>` +
      `<span class="acct-btns"><button class="gold lk-shopbtn" data-shop title="Cửa hàng vật phẩm trang trí — tích luỹ credit qua mỗi ván đấu">🛍️ Cửa hàng · <b>${w ? fmt(w.credits) : '…'}</b> 💰</button>` +
      `<button class="ghost" data-ach title="Thành tựu — hoàn thành thử thách để nhận xu và danh hiệu">🎖️ Thành tựu</button>` +
      `<button class="ghost" data-out>Đăng xuất</button></span>`
    : '<span class="muted">Chế độ Khách — Chưa lưu thành tích xếp hạng &amp; điểm thưởng</span><button data-in>Đăng nhập / Đăng ký</button>';
  if (u) {
    box.querySelector('[data-out]').onclick = logout;
    box.querySelector('[data-shop]').onclick = () => { sfx.pop(); openShop(); };
    box.querySelector('[data-ach]').onclick = () => { sfx.pop(); openAchievements(); };
    box.querySelector('[data-ren]').onclick = () => { sfx.pop(); openRenameModal(); };
    box.querySelector('[data-av]').onclick = editAvatar;
  } else box.querySelector('[data-in]').onclick = openLogin;
  paintShopBtn();
}
// Nút 🛍️ và 🎖️ ở phòng chờ: số dư của mình (khách thì chỉ xem).
function paintShopBtn() {
  const b = $('#btn-shop'), a = $('#btn-ach'), w = myWallet();
  b.classList.toggle('hidden', !ME.accounts);
  a.classList.toggle('hidden', !ME.accounts);
  b.innerHTML = w ? `🛍️ <b>${fmt(w.credits)}</b> 💰` : '🛍️';
  b.title = w ? 'Cửa hàng vật phẩm — tích luỹ credit qua mỗi ván đấu' : 'Cửa hàng vật phẩm (đăng nhập tại trang chủ để tích luỹ credit)';
}
// Ví credit & thành tựu: tải lại sau khi đăng nhập (raw = gửi ngay lúc đang kết nối lại).
async function loadWallet(send = net.request) {
  const r = await send('shop');
  setWallet(r.ok ? r.wallet : null);
}
async function loadAchievements(send = net.request) {
  const r = await send('achievements');
  setAchievements(r.ok ? r.ach : null);
}

function openLogin() {
  const card = openModal(`<div class="login"><h2>🔐 Đăng nhập tài khoản</h2>
    <p class="login-note">Người dùng mới vui lòng nhập tên cùng mã PIN và chọn <b>Tạo tài khoản</b>. Thiết bị sẽ ghi nhớ phiên đăng nhập cho những lần sau.</p>
    <label>Tên tài khoản <input id="lg-name" maxlength="16" placeholder="Nhập tên tài khoản..." autocomplete="username"></label>
    <label>Mã PIN (4–8 chữ số) <input id="lg-pin" type="password" inputmode="numeric" maxlength="8" placeholder="••••" autocomplete="current-password"></label>
    <div class="err"></div>
    <div class="btns"><button class="ghost" data-x>Huỷ</button><button class="ghost" data-reg>Tạo tài khoản</button><button class="gold" data-login>Đăng nhập</button></div></div>`);
  const name = card.querySelector('#lg-name'), pin = card.querySelector('#lg-pin'), err = card.querySelector('.err');
  name.value = $('#in-name').value.trim();
  const go = async t => {
    err.textContent = '';
    const r = await net.request(t, { name: name.value, pin: pin.value });
    if (!r.ok) { err.textContent = r.err; sfx.error(); return; }
    localStorage.setItem('hub_token', r.token);
    localStorage.setItem('hub_name', r.user.name);
    ME.user = r.user;
    closeModal();
    renderAccount();
    loadWallet();
    loadAchievements();
    toast(t === 'register' ? `🎉 Đã tạo tài khoản <b>${esc(r.user.name)}</b>` : `👋 Chào <b>${esc(r.user.name)}</b>!`);
  };
  card.querySelector('[data-x]').onclick = closeModal;
  card.querySelector('[data-reg]').onclick = () => go('register');
  card.querySelector('[data-login]').onclick = () => go('login');
  pin.onkeydown = e => { if (e.key === 'Enter') go('login'); };
  name.onkeydown = e => { if (e.key === 'Enter') pin.focus(); };
  (name.value ? pin : name).focus();
}

// Ảnh đại diện: mở hộp chỉnh (ảnh hiện tại nạp sẵn để chỉnh lại), lưu thì cả phòng thấy ngay.
function editAvatar() {
  if (!ME.user) return toast('Đăng nhập để đặt ảnh đại diện');
  sfx.pop();
  openAvatarEditor({
    current: ME.user.av || null,
    async save(data) {
      const r = await act('avatar', { data });
      if (r.ok && ME.user) { ME.user.av = r.av; renderAccount(); }
      return r;
    },
  });
}

async function logout() {
  await net.request('logout', { token: localStorage.getItem('hub_token') });
  localStorage.removeItem('hub_token');
  ME.user = null;
  setWallet(null);
  setAchievements(null);
}

// ================= KHỞI ĐỘNG =================
function getName() {
  if (ME.user) return ME.user.name;
  const n = $('#in-name').value.trim();
  if (!n) { toast('Vui lòng nhập tên hiển thị trước khi tiếp tục.'); $('#in-name').focus(); return null; }
  localStorage.setItem('hub_name', n);
  return n;
}

initFx($('#fx'));
initShop({
  request: (t, data) => act(t, data),
  name: () => (ME.user ? ME.user.name : $('#in-name').value.trim()),
  avatar: () => (ME.user && ME.user.av) || null,
  openAch: () => openAchievements(),
  onRename: u => { if (u) { ME.user = u; localStorage.setItem('hub_name', u.name); } },
  // ví đổi (mua, trang bị, vừa nhận credit) → vẽ lại chỗ hiện số dư/đồ đang mặc
  onChange: () => { renderAccount(); if (ROOM && !ROOM.playing) renderRoom(); },
});
initAchievements({
  request: (t, data) => act(t, data),
  name: () => (ME.user ? ME.user.name : $('#in-name').value.trim()),
  avatar: () => (ME.user && ME.user.av) || null,
  openShop: () => openShop(),
});
initChat({
  send: text => act('chat', { text }),
  myUid: () => ME.uid,
  anchorOf: seat => (current && current.inst.emoteAnchor ? current.inst.emoteAnchor(seat) : null),
  onIncoming: () => sfx.chat(),
});
initVoice({
  request: (t, data) => act(t, data),
  post: net.post,
  sendBin: net.sendBin,
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
  if (code.length !== 4) return toast('Mã phòng cần gồm đúng 4 chữ cái.');
  const s = session();
  const j = await joinRoom({ code, name, pid: s && s.code === code ? s.pid : undefined });
  if (j.ok) enterRoom(j);
};
$('#btn-join').onclick = join;
$('#in-code').onkeydown = e => { if (e.key === 'Enter') join(); };
$('#btn-copy').onclick = () => {
  const link = inviteLink();
  const done = () => toast('📋 Đã sao chép liên kết mời!');
  if (navigator.clipboard && isSecureContext) navigator.clipboard.writeText(link).then(done);
  else { const t = el('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
};
$('#btn-leave').onclick = leaveRoom;
$('#btn-rank').onclick = () => open('/report', '_blank');
$('#btn-shop').onclick = () => { sfx.pop(); openShop(); };
$('#btn-ach').onclick = () => { sfx.pop(); openAchievements(); };

const WHATS_NEW_VER = '2026-11-26-3';
const WHATS_NEW = [
  {
    tag: 'Mới',
    title: '🎄 Giao diện Giáng Sinh toàn trang (Mặc định bật)',
    desc: 'Phủ sắc Giáng Sinh đồng bộ từ trang chủ, phòng chờ, chat, hộp thoại đến bảng xếp hạng (/report) với dây đèn, tuyết rơi, nhà gỗ ấm & người tuyết, cùng bàn nỉ bông tuyết; chuyển đổi nhanh giữa 🎄 Noel và 🌿 Mộc.',
  },
  {
    tag: 'Mới',
    title: '🎁 Bộ sưu tập Giáng Sinh & Tổng hợp 7 Bộ sưu tập',
    desc: 'Thêm 11 vật phẩm Giáng Sinh mới vào Cửa hàng (Khung ảnh, Hiệu ứng tên, Combo tuyết rơi, Khung chat, Lưng bài, Xúc xắc, Khung tranh, Gói biểu cảm, hiệu ứng thắng Bão Tuyết Noel & Ông Già Noel, 2 mũ Sừng Tuần Lộc & Mũ Ông Già Noel) và gom đủ 7 bộ sưu tập kèm nút 👗 Thử cả bộ.',
  },
  {
    title: '🎖️ Hệ thống Thành tựu & 25 Danh hiệu riêng',
    desc: 'Danh hiệu chuyển từ Cửa hàng sang Thành tựu: hoàn thành 11 thành tựu Chung và 17 thành tựu Cờ Cá Ngựa để nhận xu thưởng (không tính vào giới hạn ngày) cùng các danh hiệu mang hiệu ứng riêng biệt.',
  },
  {
    title: '🪪 Thẻ Đổi Tên (Giảm 99% thẻ đầu)',
    desc: 'Mở bán Thẻ Đổi Tên trong tab 🎟️ Tiện ích của Cửa hàng (1.000 💰, thẻ đầu tiên chỉ 10 💰). Chỉ có thể đổi tên tài khoản khi đang sở hữu thẻ.',
  },
  {
    title: '🎨 Nâng cấp Cửa hàng & Cân bằng phần thưởng',
    desc: 'Hoàn trả 100% xu cũ để mua sắm lại từ đầu, làm mới xúc xắc Hoả Diệm, xem trước khung ảnh trên avatar, tự động xáo vị trí ghế mỗi ván theo lượt và nâng credit cơ bản từ 10 lên 15.',
  },
];
const wnBtn = $('#btn-whatsnew');
if (wnBtn) {
  const seen = localStorage.getItem('hub_whatsnew_seen') === WHATS_NEW_VER;
  wnBtn.classList.toggle('has-new', !seen);
  wnBtn.onclick = () => {
    sfx.pop();
    localStorage.setItem('hub_whatsnew_seen', WHATS_NEW_VER);
    wnBtn.classList.remove('has-new');
    const card = openModal(`<div class="wn-head"><h2>✨ What's new</h2><button class="ghost" data-x title="Đóng (Esc)">✕</button></div>
      <div class="wn-list">${WHATS_NEW.map(x => `<div class="wn-item${x.tag ? ' top' : ''}">
        <div class="wn-title">${x.tag ? `<span class="wn-tag">${esc(x.tag)}</span>` : ''}<span>${esc(x.title)}</span></div>
        <div class="wn-desc">${esc(x.desc)}</div>
      </div>`).join('')}</div>
      <div class="btns" style="margin-top:14px"><button class="gold" data-x2>Đã hiểu</button></div>`);
    card.querySelector('[data-x]').onclick = closeModal;
    card.querySelector('[data-x2]').onclick = closeModal;
  };
}
$('#btn-unsit').onclick = () => act('unsit');
$('#btn-bots').onclick = () => act('fillBots');
$('#btn-start').onclick = () => { ac(); act('start'); };
$('.logo-wrap').onclick = () => {
  tone(880, 0.16, { type: 'sine', v: 0.06, to: 1175 });
  tone(1318, 0.22, { type: 'sine', v: 0.05, delay: 0.06, to: 1568 });
  const r = $('.logo-wrap').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const stars = ['⭐', '✨', '🌟', '💫'];
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.35;
    const s = 2.6 + Math.random() * 3.8;
    UI.spawn({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.4,
      g: 0.06, drag: 0.965, life: 1, decay: 0.015 + Math.random() * 0.012,
      size: 13 + Math.random() * 9, text: stars[i % stars.length],
      rot: (Math.random() - 0.5) * 0.5, vr: (Math.random() - 0.5) * 0.14,
    });
  }
  UI.burst(x, y, ['#d8a956', '#7eb09b', '#fff3c4', '#a8d1be'], 12, 4.5);
};
addEventListener('keydown', e => { if (e.key === 'Escape' && modalOpen()) closeModal(); });
