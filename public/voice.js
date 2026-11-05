// Đàm thoại của phòng: nói chuyện bằng mic qua WebRTC — trình duyệt nối thẳng với nhau (mỗi người một kết nối tới từng người khác),
// tiếng không đi qua server. Server chỉ chuyển tin bắt tay (SDP/ICE) và giữ ai đang vào/tắt mic (room.members[].voice = { m, v }).
// Trình duyệt chỉ cho dùng mic trên https (link online) hoặc localhost.
import { $, el, esc, toast } from './ui.js';

const ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const TALK_LEVEL = 0.015;   // độ to (RMS) coi là đang nói
const TALK_HOLD = 450;      // ms giữ trạng thái "đang nói" sau khi im

let o = null;               // { request, post, myUid, anchorOf }
let room = null;
let stream = null, actx = null, selfMeter = null, vid = null, joining = false, muted = false;
const peers = new Map();    // uid → { vid, pc, polite, makingOffer, ignoreOffer, q, audio, meter }
const talkUntil = new Map(); // uid → hết "đang nói" lúc
const deaf = new Set();     // uid mình tự tắt tiếng (chỉ phía mình)
let talkers = new Set(), meterTimer = 0, raf = 0;

const usable = () => !!(window.isSecureContext && window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia);
const active = () => !!(stream && vid);
const inVoice = () => (room ? room.members.filter(m => m.voice) : []);
const memberOf = uid => room && room.members.find(m => m.uid === uid);

// request(t, data) → Promise {ok, ...} (lỗi tự toast); post(t, data) gửi không cần trả lời; anchorOf(seat) → {x,y}|null.
export function initVoice(opts) {
  o = opts;
  $('#voice-btn').onclick = () => {
    if (!usable()) return toast('🎙️ Đàm thoại cần mở bằng <b>link online</b> (https) — link wifi/LAN (http) bị trình duyệt chặn mic.', 4500);
    if (joining) return;
    if (!active()) join();
    else setMuted(!muted);
  };
  // Phím M = tắt/bật mic (ô chat đã chặn phím gõ nên không lọt xuống đây).
  addEventListener('keydown', e => {
    if ((e.key !== 'm' && e.key !== 'M') || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !active()) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    setMuted(!muted);
  });
  paint();
}

// Trạng thái phòng đổi: báo người mới vào, dựng/gỡ kết nối cho khớp danh sách đang trong đàm thoại.
export function voiceRoom(r) {
  const prev = room;
  room = r;
  if (prev) for (const m of r.members) {
    if (m.voice && m.uid !== o.myUid() && !prev.members.find(x => x.uid === m.uid)?.voice) toast(`🎙️ <b>${esc(m.name)}</b> vào đàm thoại`);
  }
  // Server không còn giữ phiên của mình (mở đàm thoại ở tab khác...) → tắt mic phía này.
  if (active() && !joining && memberOf(o.myUid())?.voice?.v !== vid) {
    stopLocal();
    toast('🎙️ Đã rời đàm thoại (đang mở ở tab khác?)');
  }
  sync();
  paint();
}

// Tin bắt tay từ người khác: { from, fv, d: { sdp } | { ice } }.
export function voiceSignal(m) {
  if (!active() || joining) return;
  let p = peers.get(m.from);
  if (!p || p.vid !== m.fv) { if (p) dropPeer(m.from); p = addPeer(m.from, m.fv); }
  p.q = p.q.then(() => handle(m.from, p, m.d)).catch(e => console.warn('[voice]', e));
}

// Rớt mạng rồi vào lại phòng: server đã xoá phiên cũ → giữ mic, xin phiên mới, dựng lại mọi kết nối.
export async function voiceReconnected() {
  if (!stream) return;
  for (const uid of [...peers.keys()]) dropPeer(uid);
  vid = null;
  await requestOn();
}

// Rời phòng: tắt mic, đóng mọi kết nối.
export function voiceReset() {
  stopLocal();
  room = null;
  deaf.clear();
  paint();
}

async function join() {
  joining = true;
  paint();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    joining = false;
    paint();
    toast(e.name === 'NotAllowedError' ? '🎙️ Chưa được phép dùng mic — bấm biểu tượng 🔒 cạnh thanh địa chỉ để cho phép rồi thử lại.'
      : e.name === 'NotFoundError' ? '🎙️ Không tìm thấy mic nào.' : '🎙️ Không mở được mic: ' + esc(e.message), 5000);
    return;
  }
  muted = false;
  stream.getAudioTracks().forEach(t => { t.onended = () => { if (stream) { leave(); toast('🎙️ Mic đã bị ngắt'); } }; });
  actx = new AudioContext();
  selfMeter = meter(stream);
  meterTimer = setInterval(measure, 100);
  if (await requestOn()) toast('🎙️ Đã vào đàm thoại — bấm 🎙️ hoặc phím <b>M</b> để tắt/bật mic', 3500);
}

async function requestOn() {
  joining = true;
  paint();
  const r = await o.request('voice', { on: true, muted });
  joining = false;
  if (!r.ok || !stream) { stopLocal(); paint(); return false; }
  vid = r.vid;
  sync();
  paint();
  return true;
}

function leave() {
  o.request('voice', { on: false });
  stopLocal();
  paint();
}

function setMuted(v) {
  muted = v;
  stream.getAudioTracks().forEach(t => { t.enabled = !v; });
  o.request('voice', { on: true, muted: v });
  paint();
}

function stopLocal() {
  for (const uid of [...peers.keys()]) dropPeer(uid);
  if (stream) stream.getTracks().forEach(t => { t.onended = null; t.stop(); });
  clearInterval(meterTimer);
  if (actx) actx.close().catch(() => {});
  stream = actx = selfMeter = vid = null;
  joining = muted = false;
  talkUntil.clear();
  paintTalk();
}

// ---------- kết nối WebRTC ("perfect negotiation": 2 bên cùng mời vẫn không kẹt — bên polite nhường) ----------
function sync() {
  if (!active() || joining) return;
  const want = new Map(inVoice().filter(m => m.uid !== o.myUid()).map(m => [m.uid, m.voice.v]));
  for (const [uid, p] of peers) if (want.get(uid) !== p.vid) dropPeer(uid);
  for (const [uid, v] of want) if (!peers.has(uid)) addPeer(uid, v);
}

function addPeer(uid, v) {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const p = { vid: v, pc, polite: o.myUid() < uid, makingOffer: false, ignoreOffer: false, q: Promise.resolve(), audio: null, meter: null };
  peers.set(uid, p);
  for (const t of stream.getTracks()) pc.addTrack(t, stream);
  pc.onnegotiationneeded = async () => {
    try {
      p.makingOffer = true;
      await pc.setLocalDescription();
      signal(uid, p, { sdp: pc.localDescription });
    } catch (e) { console.warn('[voice]', e); } finally { p.makingOffer = false; }
  };
  pc.onicecandidate = e => { if (e.candidate) signal(uid, p, { ice: e.candidate }); };
  pc.oniceconnectionstatechange = () => { if (pc.iceConnectionState === 'failed') pc.restartIce(); };
  pc.onconnectionstatechange = paint;
  pc.ontrack = e => {
    if (!p.audio) { p.audio = el('audio'); p.audio.autoplay = true; p.audio.playsInline = true; document.body.appendChild(p.audio); }
    p.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
    p.audio.muted = deaf.has(uid);
    p.audio.play().catch(() => {});
    if (p.meter) p.meter.src.disconnect();
    p.meter = meter(p.audio.srcObject);
  };
  return p;
}

async function handle(uid, p, d) {
  const pc = p.pc;
  if (pc.signalingState === 'closed') return;
  if (d.sdp) {
    const collision = d.sdp.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
    p.ignoreOffer = !p.polite && collision;
    if (p.ignoreOffer) return;
    await pc.setRemoteDescription(d.sdp);
    if (d.sdp.type === 'offer') {
      await pc.setLocalDescription();
      signal(uid, p, { sdp: pc.localDescription });
    }
  } else if (d.ice) {
    try { await pc.addIceCandidate(d.ice); } catch (e) { if (!p.ignoreOffer) throw e; }
  }
}

const signal = (uid, p, d) => { if (peers.get(uid) === p) o.post('rtc', { to: uid, tv: p.vid, d }); };

function dropPeer(uid) {
  const p = peers.get(uid);
  if (!p) return;
  peers.delete(uid);
  p.pc.close();
  if (p.meter) p.meter.src.disconnect();
  if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
  talkUntil.delete(uid);
}

// ---------- ai đang nói ----------
function meter(s) {
  if (!actx) return null;
  const src = actx.createMediaStreamSource(s), an = actx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  return { src, an, buf: new Float32Array(an.fftSize) };
}
function level(mt) {
  mt.an.getFloatTimeDomainData(mt.buf);
  let sum = 0;
  for (const x of mt.buf) sum += x * x;
  return Math.sqrt(sum / mt.buf.length);
}
function measure() {
  const now = Date.now();
  if (selfMeter && !muted && level(selfMeter) > TALK_LEVEL) talkUntil.set(o.myUid(), now + TALK_HOLD);
  for (const [uid, p] of peers) if (p.meter && !deaf.has(uid) && level(p.meter) > TALK_LEVEL) talkUntil.set(uid, now + TALK_HOLD);
  const next = new Set([...talkUntil].filter(([, t]) => t > now).map(([uid]) => uid));
  if (next.size !== talkers.size || [...next].some(u => !talkers.has(u))) { talkers = next; paintTalk(); }
}

// Vòng sáng cho mọi phần tử [data-vuid] (ghế ở phòng chờ, chip trong khung chat) + bong bóng 🔊 tại ghế khi đang chơi.
function paintTalk() {
  if (!stream) talkers = new Set();
  for (const e of document.querySelectorAll('[data-vuid]')) e.classList.toggle('talking', talkers.has(e.dataset.vuid));
  $('#voice-btn').classList.toggle('talking', talkers.has(o.myUid()));
  if (!raf && talkers.size) raf = requestAnimationFrame(follow);
}
function follow() {
  raf = 0;
  const box = $('#voice-talk'), seen = new Set();
  for (const uid of talkers) {
    const m = memberOf(uid), pt = m && m.seat >= 0 ? o.anchorOf(m.seat) : null;
    if (!pt) continue;
    seen.add(uid);
    let b = box.querySelector(`[data-u="${uid}"]`);
    if (!b) { b = el('div', 'vtalk', '🔊'); b.dataset.u = uid; box.appendChild(b); }
    b.style.left = pt.x + 'px';
    b.style.top = pt.y + 'px';
  }
  for (const b of [...box.children]) if (!seen.has(b.dataset.u)) b.remove();
  if (talkers.size) raf = requestAnimationFrame(follow);
}

// ---------- giao diện: nút 🎙️ cạnh nút chat + thanh đàm thoại trong khung chat ----------
function paint() {
  const btn = $('#voice-btn'), others = inVoice().filter(m => m.uid !== o.myUid()).length;
  btn.textContent = active() && muted ? '🔇' : '🎙️';
  btn.className = 'ghost' + (!usable() ? ' na' : joining ? ' busy' : !active() ? ' idle' : muted ? ' muted' : ' live') + (talkers.has(o.myUid()) ? ' talking' : '') +
    (!active() && !joining && !others ? ' quiet' : '');   // màn hẹp: chưa ai nói chuyện thì ẩn nút (vẫn vào được từ khung chat)
  btn.title = !usable() ? 'Đàm thoại cần mở bằng link online (https)'
    : !active() ? 'Vào đàm thoại (dùng mic)' + (others ? ` — ${others} người đang nói chuyện` : '')
    : (muted ? 'Đang tắt mic — bấm để bật' : 'Bấm để tắt mic') + ' (phím M) · Rời đàm thoại trong khung 💬';
  if (!active() && others) btn.appendChild(el('span', 'vbadge', String(others)));

  const bar = $('#voice-bar'), list = inVoice();
  bar.innerHTML = '<span class="vb-t">🎙️</span>';
  const chips = el('div', 'vchips');
  for (const m of list) {
    const me = m.uid === o.myUid(), p = peers.get(m.uid);
    const st = !active() || me || !p ? '' : p.pc.connectionState === 'connected' ? '' : p.pc.connectionState === 'failed' ? ' fail' : ' wait';
    const c = el('button', 'vchip' + st + (deaf.has(m.uid) ? ' deaf' : ''), `${m.voice.m ? '🔇 ' : ''}${esc(m.name)}${me ? ' (bạn)' : ''}`);
    c.dataset.vuid = m.uid;
    c.classList.toggle('talking', talkers.has(m.uid));
    if (me) c.disabled = true;
    else {
      c.title = (st === ' wait' ? 'Đang kết nối... · ' : st === ' fail' ? 'Không kết nối được (mạng chặn) · ' : '') +
        (deaf.has(m.uid) ? 'Bấm để nghe lại' : 'Bấm để tắt tiếng người này (chỉ phía bạn)');
      c.onclick = () => {
        if (deaf.has(m.uid)) deaf.delete(m.uid); else deaf.add(m.uid);
        if (p && p.audio) p.audio.muted = deaf.has(m.uid);
        paint();
      };
    }
    chips.appendChild(c);
  }
  if (!list.length) chips.appendChild(el('span', 'muted small', 'Đàm thoại: chưa có ai'));
  bar.appendChild(chips);
  const b = el('button', 'ghost vb-btn', active() ? 'Rời' : 'Vào');
  b.disabled = joining || !usable();
  if (!usable()) b.title = 'Cần mở bằng link online (https)';
  b.onclick = () => (active() ? leave() : join());
  bar.appendChild(b);
}
