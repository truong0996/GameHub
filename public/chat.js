// Chat của phòng: nút 💬 nổi ở góc + khung tin nhắn, dùng được cả ở phòng chờ lẫn lúc đang chơi.
// Đóng khung thì tin mới hiện "bong bóng xem trước" cạnh nút + số chưa đọc; đang chơi thì lời thoại còn bay lên tại ghế người gửi.
import { $, el, esc } from './ui.js';
import { nameHtml, titleHtml, bubbleCls } from './shop.js';

const MAX_SHOWN = 50;
let opts = null, open = false, unread = 0;

// send(text) → Promise {ok}; myUid() → uid của mình; anchorOf(seat) → {x,y}|null; onIncoming(msg) khi có tin của người khác.
export function initChat(o) {
  opts = o;
  $('#chat-btn').onclick = () => setOpen(!open);
  $('#chat-x').onclick = () => setOpen(false);
  $('#chat-form').onsubmit = async e => {
    e.preventDefault();
    const inp = $('#chat-in'), text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    const r = await opts.send(text);
    if (!r.ok && !inp.value) inp.value = text;   // gửi lỗi thì trả lại chữ để gửi lại
  };
  // Phím gõ trong ô chat không lọt xuống game (vd Space = tung xúc xắc).
  $('#chat-in').onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') setOpen(false);
  };
  // Enter ở bất cứ đâu (trừ ô nhập liệu / khi đang mở hộp thoại) = mở chat.
  addEventListener('keydown', e => {
    if (e.key !== 'Enter' || $('#chat').classList.contains('hidden') || open) return;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || !$('#modal').classList.contains('hidden')) return;
    e.preventDefault();
    setOpen(true);
  });
}

export function showChat(on) {
  $('#chat').classList.toggle('hidden', !on);
  if (!on) setOpen(false);
}

export function resetChat() {
  $('#chat-log').innerHTML = '';
  $('#chat-peek').innerHTML = '';
  unread = 0;
  paintBadge();
  setOpen(false);
}

// Lịch sử phòng gửi lúc vào/F5: thay toàn bộ, không tính là chưa đọc.
export function chatLog(log) {
  $('#chat-log').innerHTML = '';
  for (const m of log) addLine(m);
  scrollEnd();
}

export function chatMsg(m) {
  const mine = m.uid === opts.myUid();
  addLine(m);
  scrollEnd();
  const pt = m.seat >= 0 ? opts.anchorOf(m.seat) : null;
  if (pt) say(pt, m);
  if (mine) return;
  opts.onIncoming(m);
  if (!open) {
    unread++;
    paintBadge();
    peek(m);
  }
}

function setOpen(v) {
  open = v;
  $('#chat-panel').classList.toggle('hidden', !v);
  $('#chat-btn').classList.toggle('on', v);
  if (v) {
    unread = 0;
    paintBadge();
    $('#chat-peek').innerHTML = '';
    scrollEnd();
    $('#chat-in').focus();
  } else if (document.activeElement === $('#chat-in')) $('#chat-in').blur();
}

// tag: nhãn kênh do game đặt (vd 👻 = chỉ hồn ma thấy).
// m.look = đồ trang trí của người gửi lúc gửi (hiệu ứng tên, danh hiệu, khung chat — xem shop.js).
const who = m => `${m.tag ? `<span class="ctag">${esc(m.tag)}</span>` : ''}${nameHtml(m.name, m.look, m.color || 'var(--muted)')}${titleHtml(m.look)}`;
const hhmm = t => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function addLine(m) {
  const log = $('#chat-log');
  const d = el('div', 'cm' + (m.uid === opts.myUid() ? ' me' : '') + bubbleCls(m.look), `${who(m)} <span>${esc(m.text)}</span>`);
  d.title = hhmm(m.at);
  log.appendChild(d);
  while (log.children.length > MAX_SHOWN) log.firstElementChild.remove();
}
function scrollEnd() { const log = $('#chat-log'); log.scrollTop = log.scrollHeight; }
function paintBadge() {
  const b = $('#chat-badge');
  b.textContent = unread > 9 ? '9+' : unread;
  b.classList.toggle('hidden', !unread);
}

// Xem trước tin mới cạnh nút (tối đa 3 tin, tự tắt sau vài giây); bấm vào thì mở chat.
function peek(m) {
  const box = $('#chat-peek');
  const d = el('div', 'peek' + bubbleCls(m.look), `${who(m)} ${esc(m.text)}`);
  d.onclick = () => setOpen(true);
  box.appendChild(d);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 5000);
}

// Bong bóng lời thoại tại ghế người gửi (khi game có emoteAnchor).
function say(pt, m) {
  const d = el('div', 'say' + bubbleCls(m.look), esc(m.text.length > 70 ? m.text.slice(0, 68) + '…' : m.text));
  d.style.left = Math.max(90, Math.min(innerWidth - 90, pt.x)) + 'px';
  d.style.top = Math.max(40, pt.y) + 'px';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 4200);
}
