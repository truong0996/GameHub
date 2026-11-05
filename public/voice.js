// Đàm thoại của phòng: nói chuyện bằng mic qua WebRTC — trình duyệt nối thẳng với nhau (mỗi người một kết nối tới từng người khác),
// tiếng không đi qua server. Server chỉ chuyển tin bắt tay (SDP/ICE) và giữ ai đang vào/tắt mic (room.members[].voice = { m, v }).
// Cặp nào không nối thẳng được (4G/CGNAT, mạng công ty chặn UDP...) sau RELAY_AFTER thì cả hai bên chuyển sang gửi tiếng qua
// WebSocket của hub: μ-law 16kHz, chỉ gửi lúc đang nói (AudioWorklet 'vr-cap' thu, 'vr-play' phát có đệm chống giật).
// Trình duyệt chỉ cho dùng mic trên https (link online) hoặc localhost.
import { $, el, esc, toast } from './ui.js';

const ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const TALK_LEVEL = 0.015;   // độ to (RMS) coi là đang nói
const TALK_HOLD = 450;      // ms giữ trạng thái "đang nói" sau khi im
const RELAY_AFTER = 10000;  // ms chưa nối thẳng được thì chuyển sang gửi tiếng qua server
const RATE = 16000, CHUNK = 640;   // tiếng qua server: 16kHz, mỗi gói 40ms

// Chạy trong luồng âm thanh. vr-cap: hạ mẫu mic xuống RATE, mã hoá μ-law, gửi từng gói CHUNK kèm độ to.
// vr-play: nhận gói đã giải mã, đệm ~0.1s rồi phát (nội suy lên tần số của AudioContext); ứ quá 0.5s thì bỏ bớt cho đỡ trễ.
const WORKLET = `
const R = ${RATE}, N = ${CHUNK}, SZ = 32768;
function ulaw(x) {
  let s = Math.round(x * 32767), sign = 0;
  if (s < 0) { sign = 0x80; s = -s; }
  s = Math.min(s, 32635) + 0x84;
  let e = 7;
  for (let m = 0x4000; !(s & m) && e > 0; m >>= 1) e--;
  return ~(sign | (e << 4) | ((s >> (e + 3)) & 15)) & 255;
}
registerProcessor('vr-cap', class extends AudioWorkletProcessor {
  constructor() { super(); this.step = sampleRate / R; this.acc = 0; this.sum = 0; this.n = 0; this.e = 0; this.k = 0; this.out = new Uint8Array(N); }
  process(ins) {
    const ch = ins[0] && ins[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i]; this.n++;
      if (++this.acc < this.step) continue;
      this.acc -= this.step;
      const x = this.sum / this.n;
      this.sum = this.n = 0;
      this.e += x * x;
      this.out[this.k++] = ulaw(x);
      if (this.k === N) {
        this.port.postMessage({ u: this.out, rms: Math.sqrt(this.e / N) }, [this.out.buffer]);
        this.out = new Uint8Array(N); this.k = 0; this.e = 0;
      }
    }
    return true;
  }
});
registerProcessor('vr-play', class extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(SZ); this.w = 0; this.r = 0; this.on = false; this.step = R / sampleRate;
    this.port.onmessage = e => {
      const d = e.data;
      for (let i = 0; i < d.length; i++) this.buf[(this.w + i) & (SZ - 1)] = d[i];
      this.w += d.length;
      if (this.w - this.r > R / 2) this.r = this.w - R * 0.15;
    };
  }
  process(ins, outs) {
    const out = outs[0][0];
    if (!this.on && this.w - this.r >= R / 10) this.on = true;
    if (!this.on) return true;
    for (let i = 0; i < out.length; i++) {
      if (this.r + 1 >= this.w) { this.on = false; break; }
      const k = Math.floor(this.r), f = this.r - k, a = this.buf[k & (SZ - 1)], b = this.buf[(k + 1) & (SZ - 1)];
      out[i] = a + (b - a) * f;
      this.r += this.step;
    }
    return true;
  }
});
`;
// Bảng giải mã μ-law → [-1, 1].
const ULAW = new Float32Array(256).map((_, u) => {
  u = ~u & 255;
  const s = ((((u & 15) << 3) + 0x84) << ((u >> 4) & 7)) - 0x84;
  return (u & 128 ? -s : s) / 32768;
});

let o = null;               // { request, post, myUid, anchorOf }
let room = null;
let stream = null, actx = null, selfMeter = null, vid = null, joining = false, muted = false;
const peers = new Map();    // uid → { vid, pc, polite, makingOffer, ignoreOffer, q, audio, meter, timer, relay, node, gain }
const talkUntil = new Map(); // uid → hết "đang nói" lúc
const deaf = new Set();     // uid mình tự tắt tiếng (chỉ phía mình)
let talkers = new Set(), meterTimer = 0, raf = 0;
let wl = null;              // Promise<bool>: đã nạp WORKLET vào actx hiện tại
let cap = null, gateUntil = 0, prevChunk = null;   // thu tiếng gửi qua server
let mix = null;             // { gain, audio, pcs }: nơi trộn tiếng nhận qua server rồi phát ra loa

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

// Gói tiếng đi vòng qua server: [độ dài uid][uid người nói][μ-law...].
export function voiceAudio(ab) {
  const b = new Uint8Array(ab), n = b[0], p = peers.get(String.fromCharCode(...b.subarray(1, 1 + n)));
  if (!p || !p.node) return;
  const pcm = new Float32Array(b.length - 1 - n);
  for (let i = 0; i < pcm.length; i++) pcm[i] = ULAW[b[1 + n + i]];
  p.node.port.postMessage(pcm, [pcm.buffer]);
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
  if (mix) { mix.pcs.forEach(pc => pc.close()); mix.audio.srcObject = null; mix.audio.remove(); }
  if (actx) actx.close().catch(() => {});
  stream = actx = selfMeter = vid = wl = cap = mix = prevChunk = null;
  gateUntil = 0;
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
  const p = { vid: v, pc, polite: o.myUid() < uid, makingOffer: false, ignoreOffer: false, q: Promise.resolve(), audio: null, meter: null,
    timer: 0, relay: false, node: null, gain: null };
  peers.set(uid, p);
  p.timer = setTimeout(() => { if (pc.connectionState !== 'connected') toRelay(uid, p, true); }, RELAY_AFTER);
  for (const t of stream.getTracks()) pc.addTrack(t, stream);
  pc.onnegotiationneeded = async () => {
    try {
      p.makingOffer = true;
      await pc.setLocalDescription();
      signal(uid, p, { sdp: pc.localDescription });
    } catch (e) { console.warn('[voice]', e); } finally { p.makingOffer = false; }
  };
  pc.onicecandidate = e => { if (e.candidate) signal(uid, p, { ice: e.candidate }); };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') toRelay(uid, p, true); else paint(); };
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
  if (d.relay) return toRelay(uid, p, false);
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
  clearTimeout(p.timer);
  p.pc.close();
  if (p.meter) p.meter.src.disconnect();
  if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
  if (p.node) { p.node.disconnect(); p.node.port.close(); }
  if (p.gain) p.gain.disconnect();
  if (p.relay) postRelay();
  talkUntil.delete(uid);
}

// ---------- tiếng đi vòng qua server (cặp không nối thẳng được) ----------
// Bên phát hiện trước báo bên kia ({ relay: true } qua kênh bắt tay) để cả hai cùng chuyển, rồi đóng kết nối WebRTC của cặp đó.
function toRelay(uid, p, tell) {
  if (p.relay || peers.get(uid) !== p) return;
  p.relay = true;
  clearTimeout(p.timer);
  if (tell) signal(uid, p, { relay: true });
  p.pc.close();
  if (p.meter) { p.meter.src.disconnect(); p.meter = null; }
  if (p.audio) { p.audio.srcObject = null; p.audio.remove(); p.audio = null; }
  postRelay();
  relayIn(uid, p);
  paint();
}

function postRelay() {
  const to = [...peers].filter(([, p]) => p.relay).map(([uid]) => uid);
  o.post('relay', { to });
  if (to.length) relayOut();
}

function worklet() {
  if (!wl) {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    wl = actx.audioWorklet.addModule(url).then(() => true, e => { console.warn('[voice]', e); return false; });
  }
  return wl;
}

// Bộ phát cho một người: vr-play → gain (tắt tiếng phía mình) → mix.
async function relayIn(uid, p) {
  if (!actx || !(await worklet()) || peers.get(uid) !== p) return;
  p.node = new AudioWorkletNode(actx, 'vr-play', { numberOfInputs: 0, outputChannelCount: [1] });
  p.gain = actx.createGain();
  p.gain.gain.value = deaf.has(uid) ? 0 : 1;
  p.node.connect(p.gain).connect(mixIn());
  p.meter = meterNode(p.node);
  paint();
}

// Thu mic một lần cho mọi người nhận; chỉ gửi lúc đang nói (kèm gói ngay trước đó để không mất đầu câu).
async function relayOut() {
  const a = actx;
  if (cap || !a || !(await worklet()) || cap || actx !== a) return;
  const src = a.createMediaStreamSource(stream), sink = a.createGain();
  sink.gain.value = 0;   // nối tới loa (câm) để trình duyệt chắc chắn chạy worklet
  cap = new AudioWorkletNode(a, 'vr-cap');
  src.connect(cap).connect(sink).connect(a.destination);
  cap.port.onmessage = e => {
    const { u, rms } = e.data;
    if (muted || ![...peers.values()].some(p => p.relay)) { prevChunk = null; return; }
    const now = performance.now();
    if (rms > TALK_LEVEL) {
      if (now > gateUntil && prevChunk) o.sendBin(prevChunk);
      gateUntil = now + TALK_HOLD;
    }
    if (now <= gateUntil) o.sendBin(u);
    prevChunk = u;
  };
}

// Phát qua một cặp RTCPeerConnection nối vòng ngay trong máy: Chrome chỉ khử tiếng vọng (echo) cho tiếng đến từ WebRTC,
// phát thẳng từ Web Audio thì người kia sẽ nghe lại tiếng mình. Vòng này hỏng thì phát thẳng.
function mixIn() {
  if (mix) return mix.gain;
  const gain = actx.createGain(), dest = actx.createMediaStreamDestination(), audio = el('audio');
  gain.connect(dest);
  audio.autoplay = true;
  document.body.appendChild(audio);
  const a = new RTCPeerConnection(), b = new RTCPeerConnection(), m = mix = { gain, audio, pcs: [a, b] };
  const play = s => { if (mix === m && audio.srcObject !== s) { audio.srcObject = s; audio.play().catch(() => {}); } };
  a.onicecandidate = e => { if (e.candidate) b.addIceCandidate(e.candidate).catch(() => {}); };
  b.onicecandidate = e => { if (e.candidate) a.addIceCandidate(e.candidate).catch(() => {}); };
  b.ontrack = e => play(new MediaStream([e.track]));
  a.addTrack(dest.stream.getAudioTracks()[0], dest.stream);
  (async () => {
    await a.setLocalDescription();
    await b.setRemoteDescription(a.localDescription);
    await b.setLocalDescription();
    await a.setRemoteDescription(b.localDescription);
  })().catch(() => play(dest.stream));
  setTimeout(() => { if (b.connectionState !== 'connected') play(dest.stream); }, 3000);
  return gain;
}

// ---------- ai đang nói ----------
const meter = s => (actx ? meterNode(actx.createMediaStreamSource(s)) : null);
function meterNode(src) {
  const an = actx.createAnalyser();
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
    const st = !active() || me || !p ? '' : p.relay ? (p.node ? ' relay' : ' wait')
      : p.pc.connectionState === 'connected' ? '' : p.pc.connectionState === 'failed' ? ' fail' : ' wait';
    const c = el('button', 'vchip' + st + (deaf.has(m.uid) ? ' deaf' : ''), `${m.voice.m ? '🔇 ' : ''}${esc(m.name)}${me ? ' (bạn)' : ''}`);
    c.dataset.vuid = m.uid;
    c.classList.toggle('talking', talkers.has(m.uid));
    if (me) c.disabled = true;
    else {
      c.title = (st === ' wait' ? 'Đang kết nối... · ' : st === ' fail' ? 'Không kết nối được (mạng chặn) · '
        : st === ' relay' ? 'Nối qua server (mạng chặn nối thẳng) · ' : '') +
        (deaf.has(m.uid) ? 'Bấm để nghe lại' : 'Bấm để tắt tiếng người này (chỉ phía bạn)');
      c.onclick = () => {
        if (deaf.has(m.uid)) deaf.delete(m.uid); else deaf.add(m.uid);
        if (p && p.audio) p.audio.muted = deaf.has(m.uid);
        if (p && p.gain) p.gain.gain.value = deaf.has(m.uid) ? 0 : 1;
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
