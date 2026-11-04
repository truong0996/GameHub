// Âm thanh tổng hợp bằng WebAudio (không cần file mp3). Game có thể tự tạo âm riêng bằng tone()/noise().
const SND = {
  ctx: null, master: null,
  on: localStorage.getItem('hub_snd') !== '0',
  music: localStorage.getItem('hub_music') === '1',
};

export function ac() {
  if (!SND.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    SND.ctx = new AC();
    SND.master = SND.ctx.createGain();
    SND.master.gain.value = 0.7;
    SND.master.connect(SND.ctx.destination);
  }
  if (SND.ctx.state === 'suspended') SND.ctx.resume();
  return SND.ctx;
}

// tone(tần số, thời lượng giây, { type, v: âm lượng, to: tần số đích, delay, a: attack, music })
export function tone(f, d, o = {}) {
  if (!(o.music ? SND.music : SND.on)) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (o.delay || 0), osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.v ?? 0.2, t + (o.a || 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  osc.connect(g); g.connect(SND.master);
  osc.start(t); osc.stop(t + d + 0.05);
}

let NOISE = null;
// noise(thời lượng, { v, f: tần số lọc, fto, q, ft: loại lọc, delay })
export function noise(d, o = {}) {
  if (!SND.on) return;
  const c = ac();
  if (!c) return;
  if (!NOISE) {
    NOISE = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const a = NOISE.getChannelData(0);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + (o.delay || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = NOISE;
  f.type = o.ft || 'bandpass'; f.frequency.value = o.f || 1000; f.Q.value = o.q || 1;
  if (o.fto) f.frequency.exponentialRampToValueAtTime(o.fto, t + d);
  g.gain.setValueAtTime(o.v ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(f); f.connect(g); g.connect(SND.master);
  src.start(t, Math.random() * 0.4); src.stop(t + d + 0.05);
}

// Âm thanh chung, game nào cũng dùng được.
export const sfx = {
  pop() { tone(300 + Math.random() * 500, 0.15, { type: 'triangle', v: 0.1, to: 1500 }); noise(0.2, { v: 0.12, f: 2500, delay: 0.05 }); },
  click() { tone(1000, 0.03, { type: 'square', v: 0.04 }); },
  error() { tone(190, 0.16, { type: 'square', v: 0.07 }); },
  tick() { tone(1400, 0.04, { type: 'square', v: 0.03 }); },
  myTurn() { tone(784, 0.16, { type: 'triangle', v: 0.16 }); tone(1175, 0.3, { type: 'triangle', v: 0.16, delay: 0.13 }); },
  card() { [880, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.2, { type: 'triangle', v: 0.1, delay: i * 0.06 })); },
  gong() { tone(98, 2.2, { v: 0.35, a: 0.01 }); tone(196.5, 1.8, { v: 0.14 }); tone(294, 1.3, { v: 0.07 }); noise(0.7, { v: 0.12, f: 300 }); },
  whoosh() { noise(0.6, { v: 0.3, f: 400, fto: 3000, q: 0.7 }); },
  tele() { tone(250, 0.55, { v: 0.14, to: 2600 }); tone(500, 0.5, { type: 'triangle', v: 0.06, to: 3200, delay: 0.05 }); },
  boom() { noise(1, { v: 0.7, f: 140, ft: 'lowpass' }); tone(90, 0.9, { v: 0.4, to: 28 }); },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
      tone(f, 0.35, { type: 'triangle', v: 0.14, delay: i * 0.14 });
      tone(f / 2, 0.35, { v: 0.08, delay: i * 0.14 });
    });
  },
};

export const soundOn = () => SND.on;
export const musicOn = () => SND.music;
export function setSound(v) { SND.on = v; localStorage.setItem('hub_snd', v ? '1' : '0'); ac(); }
export function setMusic(v) { SND.music = v; localStorage.setItem('hub_music', v ? '1' : '0'); ac(); }

// Nhạc nền ngũ cung kiểu dân gian, rất nhẹ.
const PENTA = [293.66, 329.63, 392, 440, 493.88, 587.33, 659.25, 783.99];
let beat = 0;
setInterval(() => {
  if (!SND.music || !SND.ctx) return;
  beat++;
  if (Math.random() < 0.5) tone(PENTA[Math.floor(Math.random() * PENTA.length)], 1.3, { type: 'triangle', v: 0.03, a: 0.02, music: true });
  if (beat % 8 === 0) tone([146.83, 196, 220][beat % 3], 2.8, { v: 0.045, a: 0.06, music: true });
}, 380);
