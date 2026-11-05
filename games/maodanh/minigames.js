// 🛸 Kẻ Mạo Danh — mini-game nhiệm vụ + bảng sửa phá hoại (client). Mỗi mini-game vẽ vào một khung trong #mdn-task,
// gọi done() khi xong. Dùng pointer events để chạy được cả chuột lẫn cảm ứng.
import { TASKS } from './data.js';

const WIRE_COLORS = ['#e5383b', '#2f63e0', '#f2d13a', '#d65db1'];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// Mở mini-game: box = phần tử chứa, o = { type, name, icon, onDone, sfx } → trả về hàm dọn dẹp.
export function openGame(box, o) {
  box.innerHTML = '';
  const T = TASKS[o.type] || { hint: '' };
  const head = h('div', 'mg-head', `<b>${o.icon || T.icon || ''} ${o.name}</b><span class="mg-hint">${T.hint || o.hint || ''}</span>`);
  const body = h('div', 'mg-body');
  box.append(head, body);
  let closed = false;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(() => !closed && fn(), ms));
  const done = () => {
    if (closed) return;
    o.sfx && o.sfx.card();
    body.classList.add('mg-ok');
    later(() => o.onDone(), 350);
  };
  const fail = msg => { o.sfx && o.sfx.error(); body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake'); if (msg) head.querySelector('.mg-hint').textContent = msg; };
  const ctx = { body, done, fail, later, sfx: o.sfx, isClosed: () => closed };
  const cleanup = (GAMES[o.type] || GAMES.download)(ctx, o) || (() => {});
  return () => { closed = true; timers.forEach(clearTimeout); cleanup(); box.innerHTML = ''; };
}

const GAMES = {
  // Nối dây: kéo từ đầu dây bên trái sang đầu cùng màu bên phải.
  wires({ body, done, sfx }) {
    const right = shuffle([0, 1, 2, 3]);
    body.innerHTML = `<div class="mg-wires"><svg viewBox="0 0 300 200" preserveAspectRatio="none"></svg>
      <div class="col l">${[0, 1, 2, 3].map(i => `<span data-i="${i}" style="--c:${WIRE_COLORS[i]}"></span>`).join('')}</div>
      <div class="col r">${right.map(i => `<span data-i="${i}" style="--c:${WIRE_COLORS[i]}"></span>`).join('')}</div></div>`;
    const svg = body.querySelector('svg'), wrap = body.querySelector('.mg-wires');
    const linked = new Set();
    let drag = null;
    const pt = e => { const r = wrap.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 300, (e.clientY - r.top) / r.height * 200]; };
    const pinPt = el => { const r = wrap.getBoundingClientRect(), b = el.getBoundingClientRect(); return [(b.left + b.width / 2 - r.left) / r.width * 300, (b.top + b.height / 2 - r.top) / r.height * 200]; };
    const line = (a, b, c) => { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('x1', a[0]); l.setAttribute('y1', a[1]); l.setAttribute('x2', b[0]); l.setAttribute('y2', b[1]); l.setAttribute('stroke', c); l.setAttribute('stroke-width', 9); l.setAttribute('stroke-linecap', 'round'); svg.appendChild(l); return l; };
    for (const pin of body.querySelectorAll('.l span')) pin.onpointerdown = e => {
      const i = +pin.dataset.i;
      if (linked.has(i)) return;
      e.preventDefault();
      wrap.setPointerCapture(e.pointerId);
      drag = { i, from: pinPt(pin), l: line(pinPt(pin), pt(e), WIRE_COLORS[i]) };
    };
    wrap.onpointermove = e => { if (drag) { const p = pt(e); drag.l.setAttribute('x2', p[0]); drag.l.setAttribute('y2', p[1]); } };
    wrap.onpointerup = e => {
      if (!drag) return;
      const tgt = [...body.querySelectorAll('.r span')].find(s => { const b = s.getBoundingClientRect(); return e.clientX > b.left - 14 && e.clientX < b.right + 14 && e.clientY > b.top - 14 && e.clientY < b.bottom + 14; });
      if (tgt && +tgt.dataset.i === drag.i) {
        const p = pinPt(tgt); drag.l.setAttribute('x2', p[0]); drag.l.setAttribute('y2', p[1]);
        linked.add(drag.i); sfx && sfx.click();
        if (linked.size === 4) done();
      } else drag.l.remove();
      drag = null;
    };
  },

  // Quẹt thẻ: kéo thẻ qua khe trong 0.35–1.3 giây.
  swipe({ body, done, fail, sfx }) {
    body.innerHTML = `<div class="mg-swipe"><div class="slot"><div class="led">ĐƯA THẺ VÀO</div></div><div class="card">💳 THẺ</div></div>`;
    const card = body.querySelector('.card'), wrap = body.querySelector('.mg-swipe'), led = body.querySelector('.led');
    let st = null;
    card.onpointerdown = e => { e.preventDefault(); card.setPointerCapture(e.pointerId); st = { x: e.clientX, t: performance.now() }; led.textContent = 'ĐANG ĐỌC...'; };
    card.onpointermove = e => {
      if (!st) return;
      const w = wrap.clientWidth - card.clientWidth - 8;
      card.style.transform = `translateX(${Math.max(0, Math.min(w, e.clientX - st.x))}px)`;
    };
    card.onpointerup = e => {
      if (!st) return;
      const w = wrap.clientWidth - card.clientWidth - 8, dx = e.clientX - st.x, ms = performance.now() - st.t;
      st = null;
      card.style.transform = '';
      if (dx < w * 0.85) { led.textContent = 'QUẸT HẾT KHE NHÉ'; return fail(); }
      if (ms < 350) { led.textContent = 'QUÁ NHANH — THỬ LẠI'; return fail(); }
      if (ms > 1300) { led.textContent = 'QUÁ CHẬM — THỬ LẠI'; return fail(); }
      led.textContent = 'CHẤP NHẬN ✔'; sfx && sfx.click();
      card.style.transform = `translateX(${w}px)`;
      done();
    };
  },

  // Tải dữ liệu: bấm rồi chờ.
  download({ body, done, later }, o) {
    const ms = (TASKS[o.type] || TASKS.download).ms + 300;
    body.innerHTML = `<div class="mg-dl"><div class="files">📁 ➜ 📂</div><div class="bar"><i></i></div><button class="gold">Bắt đầu tải</button></div>`;
    const b = body.querySelector('button'), bar = body.querySelector('i');
    b.onclick = () => {
      b.disabled = true; b.textContent = 'Đang tải...';
      bar.style.transition = `width ${ms}ms linear`;
      requestAnimationFrame(() => { bar.style.width = '100%'; });
      later(done, ms);
    };
  },

  // Bắn mục tiêu: 8 mục tiêu bay ngang qua, bấm trúng hết.
  shoot({ body, done, sfx, isClosed }, o) {
    const icon = o.target || '☄️';
    body.innerHTML = `<div class="mg-shoot"><div class="cnt">Còn 8</div></div>`;
    const area = body.querySelector('.mg-shoot'), cnt = body.querySelector('.cnt');
    let left = 8, raf = 0;
    const ts = [];
    const spawn = () => {
      const e = h('button', 'tg', icon);
      const t = { e, x: Math.random() < 0.5 ? -10 : 110, y: 10 + Math.random() * 70, vx: 0, vy: (Math.random() - 0.5) * 6 };
      t.vx = (t.x < 0 ? 1 : -1) * (14 + Math.random() * 14);
      e.onpointerdown = ev => { ev.preventDefault(); e.remove(); ts.splice(ts.indexOf(t), 1); left--; cnt.textContent = `Còn ${left}`; sfx && sfx.click(); if (left <= 0) done(); else if (ts.length < 3) spawn(); };
      area.appendChild(e); ts.push(t);
    };
    spawn(); spawn(); spawn();
    let last = performance.now();
    const loop = now => {
      if (isClosed()) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      for (const t of [...ts]) {
        t.x += t.vx * dt; t.y += t.vy * dt;
        if (t.x < -15 || t.x > 115) { t.e.remove(); ts.splice(ts.indexOf(t), 1); spawn(); continue; }
        t.e.style.left = t.x + '%'; t.e.style.top = t.y + '%';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  },

  // Bấm số theo thứ tự 1 → 10.
  numbers({ body, done, fail, sfx }) {
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    body.innerHTML = `<div class="mg-num">${nums.map(n => `<button data-n="${n}">${n}</button>`).join('')}</div>`;
    let next = 1;
    for (const b of body.querySelectorAll('button')) b.onclick = () => {
      if (+b.dataset.n === next) { b.classList.add('on'); next++; sfx && sfx.click(); if (next > 10) done(); }
      else { next = 1; body.querySelectorAll('button').forEach(x => x.classList.remove('on')); fail('Sai thứ tự — làm lại từ 1'); }
    };
  },

  // Quét y tế: đứng yên chờ (người khác nhìn thấy tia quét quanh bạn).
  scan({ body, done, later }, o) {
    const ms = TASKS.scan.ms + 300;
    body.innerHTML = `<div class="mg-scan"><div class="who">🧍</div><div class="beam"></div><div class="bar"><i></i></div><div class="txt">Đang quét... đừng đi đâu nhé</div></div>`;
    const bar = body.querySelector('i');
    bar.style.transition = `width ${ms}ms linear`;
    requestAnimationFrame(() => { bar.style.width = '100%'; });
    later(() => { body.querySelector('.txt').textContent = 'Kết quả: khoẻ mạnh ✔'; done(); }, ms);
  },

  // Nhấn giữ cho đầy (thả ra thì tụt dần).
  hold({ body, done, isClosed }, o) {
    const ms = TASKS.hold.ms + 200;
    body.innerHTML = `<div class="mg-hold"><div class="tank"><i></i></div><button class="big gold">✋ Nhấn giữ</button></div>`;
    const fill = body.querySelector('i'), b = body.querySelector('button');
    let v = 0, on = false, last = performance.now(), raf = 0, fin = false;
    const loop = now => {
      if (isClosed() || fin) return;
      const dt = now - last; last = now;
      v = Math.max(0, Math.min(1, v + (on ? dt / ms : -dt / ms / 2)));
      fill.style.height = v * 100 + '%';
      if (v >= 1) { fin = true; done(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); on = true; };
    b.onpointerup = b.onpointercancel = () => { on = false; };
    return () => cancelAnimationFrame(raf);
  },

  // Căn chỉnh: kéo thanh trượt vào vạch xanh rồi thả.
  align({ body, done, fail }) {
    const target = 15 + Math.random() * 70;
    body.innerHTML = `<div class="mg-align"><div class="track"><span class="goal" style="left:${target}%"></span></div><input type="range" min="0" max="100" step="0.5" value="${target > 50 ? 3 : 97}"><div class="txt">Thả tay khi kim trùng vạch xanh</div></div>`;
    const r = body.querySelector('input');
    r.onchange = () => { if (Math.abs(+r.value - target) <= 3.5) done(); else fail('Lệch rồi — thử lại'); };
  },

  // Gạt cầu dao (sửa cúp điện): gạt hết các cần lên.
  switches({ body, done, sfx }) {
    let st = [0, 1, 2, 3, 4].map(() => Math.random() < 0.5);
    if (st.every(Boolean)) st[2] = false;
    body.innerHTML = `<div class="mg-sw">${st.map((v, i) => `<button data-i="${i}" class="${v ? 'up' : ''}"><i></i></button>`).join('')}</div>`;
    for (const b of body.querySelectorAll('button')) b.onclick = () => {
      const i = +b.dataset.i;
      st[i] = !st[i];
      b.classList.toggle('up', st[i]);
      sfx && sfx.click();
      if (st.every(Boolean)) done();
    };
  },
};
