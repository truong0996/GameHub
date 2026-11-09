// Trang bảng xếp hạng: lấy /api/report theo khoảng ngày + game rồi vẽ bảng, đối đầu, ván gần đây.
// Bộ lọc nằm trên URL (?d=14&game=uno hoặc ?from=2026-11-01&to=2026-11-14) để gửi link cho cả nhóm xem cùng một kỳ.
import { $, esc } from './ui.js';
import { nameHtml, titleHtml, fmt } from './shop.js';

const RANGES = [[7, '7 ngày'], [14, '14 ngày'], [30, '30 ngày'], [0, 'Tất cả'], ['c', 'Tuỳ chọn']];
const MEDAL = ['🥇', '🥈', '🥉'];
const FORM = { w: ['★', 'Thắng ván'], u: ['▲', 'Xếp trên phần lớn'], d: ['▼', 'Xếp dưới phần lớn'], e: ['–', 'Hoà điểm'] };
const q = new URLSearchParams(location.search);
const F = { d: q.has('from') ? 'c' : q.has('d') ? +q.get('d') : 14, from: q.get('from') || '', to: q.get('to') || '', game: q.get('game') || '' };

const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dm = ms => new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
const when = ms => new Date(ms).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const signed = n => (n > 0 ? '+' + n : n < 0 ? '−' + -n : '0');
const pct = x => Math.round(x * 100) + '%';
// Ván dài được tính nặng hơn (trọng số theo thời lượng, server tính sẵn ở m.w): hiện nhãn ×1.5, ×2... cạnh tên game.
const weightTag = m => (m.w > 1 ? ` <span class="guest" title="Ván ${Math.round(m.dur / 60000)} phút → tính nặng gấp ${m.w}">×${m.w}</span>` : '');

// Khoảng thời gian (ms) theo bộ lọc; to = null là tới hiện tại.
function span() {
  if (F.d === 'c') {
    const from = F.from ? dayStart(F.from + 'T00:00').getTime() : 0;
    const to = F.to ? dayStart(F.to + 'T00:00').getTime() + 86400000 : null;
    return { from, to };
  }
  if (!F.d) return { from: 0, to: null };
  const s = dayStart(Date.now());
  s.setDate(s.getDate() - (F.d - 1));
  return { from: s.getTime(), to: null };
}

function syncUrl() {
  const p = new URLSearchParams();
  if (F.d === 'c') { if (F.from) p.set('from', F.from); if (F.to) p.set('to', F.to); } else p.set('d', F.d);
  if (F.game) p.set('game', F.game);
  history.replaceState(null, '', '?' + p);
}

function paintFilters() {
  const box = $('.rp-range');
  box.innerHTML = '';
  for (const [v, label] of RANGES) {
    const b = document.createElement('button');
    b.className = 'gp-tag' + (F.d === v ? ' on' : '');
    b.textContent = label;
    b.onclick = () => {
      F.d = v;
      if (v === 'c' && !F.from) { F.from = ymd(new Date(Date.now() - 13 * 86400000)); F.to = ymd(new Date()); }
      load();
    };
    box.appendChild(b);
  }
  $('.rp-custom').classList.toggle('hidden', F.d !== 'c');
  $('#f-from').value = F.from;
  $('#f-to').value = F.to;
}
$('#f-from').onchange = e => { F.from = e.target.value; load(); };
$('#f-to').onchange = e => { F.to = e.target.value; load(); };
$('#f-game').onchange = e => { F.game = e.target.value; load(); };

let seq = 0;
async function load() {
  paintFilters();
  syncUrl();
  const { from, to } = span(), my = ++seq;
  const p = new URLSearchParams({ from });
  if (to) p.set('to', to);
  if (F.game) p.set('game', F.game);
  let R;
  try {
    const res = await fetch('/api/report?' + p);
    if (!res.ok) throw new Error(res.status);
    R = await res.json();
  } catch (e) {
    $('#rp-body').innerHTML = `<div class="card center rp-empty">⚠️ Không tải được báo cáo (${esc(e.message)}). Server có đang chạy không?</div>`;
    return;
  }
  if (my !== seq) return;
  render(R, from, to);
}

function render(R, from, to) {
  const g = id => R.games[id] || { name: id, icon: '🎲' };
  // chọn game: chỉ những game có ván trong kỳ (+ game đang chọn)
  const total = Object.values(R.counts).reduce((a, b) => a + b, 0);
  const ids = Object.keys(R.counts).sort((a, b) => R.counts[b] - R.counts[a]);
  if (F.game && !ids.includes(F.game)) ids.push(F.game);
  $('#f-game').innerHTML = `<option value="">🎮 Tất cả game (${total} ván)</option>` +
    ids.map(id => `<option value="${esc(id)}">${g(id).icon} ${esc(g(id).name)} (${R.counts[id] || 0})</option>`).join('');
  $('#f-game').value = F.game;

  const period = `${from ? dm(from) : 'Từ đầu'} → ${to ? dm(to - 1) : 'hôm nay'}` + (F.game ? ` · ${g(F.game).icon} ${esc(g(F.game).name)}` : '');
  const P = R.players;
  if (!P.length) {
    $('#rp-body').innerHTML = `<div class="card center rp-empty"><b>Chưa có ván nào được tính</b> <span class="muted">(${period})</span><br>
      <span class="small muted">Ván được tính khi có ít nhất 2 người đã đăng nhập chơi đến hết. Đăng nhập ở trang chủ Game Hub.</span></div>` + recentHtml(R, g);
    return;
  }
  const ranked = P.filter(p => p.enough), lead = ranked[0], last = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const max = Math.max(1, ...P.map(p => Math.abs(p.score)));
  let html = `<div class="rp-sum card"><div class="small muted">${period} · ${F.game ? R.counts[F.game] || 0 : total} ván được tính</div>` +
    (lead ? `<div class="rp-hl"><span>👑 Dẫn đầu: <b>${esc(lead.name)}</b> <span class="sc pos">${signed(lead.score)}</span></span>` +
      (last && last.score < lead.score ? `<span>🫣 Đội sổ: <b>${esc(last.name)}</b> <span class="sc ${last.score < 0 ? 'neg' : ''}">${signed(last.score)}</span></span>` : '') + '</div>'
      : `<div class="rp-hl muted">Chưa ai đủ ${R.minGames} ván để xếp hạng chính thức.</div>`) + '</div>';

  // bảng xếp hạng
  let rank = 0;
  html += `<div class="card rp-card"><table class="rp-tbl"><thead><tr><th>#</th><th class="l">Người chơi</th><th class="bar-h" title="−100…+100: điểm trung bình mỗi ván (có trọng số), cộng ${R.prior} ván hoà ảo">Chỉ số</th>
    <th>Ván</th><th>Thắng</th><th class="opt">Tỉ lệ</th><th class="opt">Phong độ</th><th class="l opt">Hay thắng</th>
    <th class="opt" title="Credit hiện có (tính cả mọi lúc, không theo kỳ đang lọc) — kiếm sau mỗi ván, mua đồ ở 🛍️ Cửa hàng">💰</th></tr></thead><tbody>`;
  for (const p of P) {
    const pos = p.enough ? ++rank : null;
    const w = Math.round((Math.abs(p.score) / max) * 50);
    const bar = p.score ? `<i class="${p.score > 0 ? 'pos' : 'neg'}" style="width:${w}%"></i>` : '';
    const form = p.form.map(k => `<span class="fm ${k}" title="${FORM[k][1]}">${FORM[k][0]}</span>`).join('');
    const best = p.best.map(id => `<span title="${esc(g(id).name)}: thắng ${p.byGame[id].wins}/${p.byGame[id].games}">${g(id).icon}</span>`).join(' ');
    html += `<tr class="${p.enough ? '' : 'few'}" title="${esc(p.name)}: chỉ số ${signed(p.score)} · trung bình ${signed(p.avg)} mỗi ván · thắng ${p.wins}/${p.games} ván${p.enough ? '' : ` · chưa đủ ${R.minGames} ván`}">
      <td class="pos-c">${pos ? MEDAL[pos - 1] || pos : '·'}</td>
      <td class="l">${nameHtml(p.name, p.look)}${titleHtml(p.look)}${p.enough ? '' : ` <span class="guest">chưa đủ ${R.minGames} ván</span>`}</td>
      <td><div class="bar-c"><div class="bar"><span class="mid"></span>${bar}</div><b class="sc ${p.score > 0 ? 'pos' : p.score < 0 ? 'neg' : ''}">${signed(p.score)}</b></div></td>
      <td>${p.games}</td><td>${p.wins}</td><td class="opt">${pct(p.rate)}</td><td class="opt form">${form}</td><td class="l opt">${best || '<span class="muted">—</span>'}</td>
      <td class="opt cr">${p.credits != null ? fmt(p.credits) : ''}</td></tr>`;
  }
  html += '</tbody></table></div>';

  // đối đầu
  if (P.length > 1) {
    const H = R.h2h, names = H.ids.map(id => P.find(p => p.id === id).name);
    html += `<div class="card rp-card"><h2>⚔️ Đối đầu</h2><div class="small muted">Ô hàng <b>A</b>, cột <b>B</b> = số ván A xếp trên B – số ván B xếp trên A.</div>
      <div class="rp-scroll"><table class="rp-h2h"><thead><tr><th></th>${names.map(n => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>`;
    H.ids.forEach((a, i) => {
      html += `<tr><th class="l">${esc(names[i])}</th>`;
      H.ids.forEach((b, j) => {
        if (i === j) { html += '<td class="self">—</td>'; return; }
        const x = H.m[i][j], y = H.m[j][i];
        html += `<td class="${x > y ? 'pos' : x < y ? 'neg' : ''}" title="${esc(names[i])} xếp trên ${esc(names[j])}: ${x} ván · ngược lại: ${y} ván">${x || y ? `${x}–${y}` : '<span class="muted">·</span>'}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
  }

  if (R.aborts.length) {
    html += `<div class="card rp-card"><h2>⛔ Ván bỏ dở</h2><div class="small muted">Chủ phòng bấm về phòng chờ khi ván chưa xong — không tính điểm.</div>
      <div class="rp-aborts">${R.aborts.map(a => `<span><b>${esc(a.name)}</b> × ${a.n}</span>`).join('')}</div></div>`;
  }
  $('#rp-body').innerHTML = html + recentHtml(R, g);
  wireMore();
}

// Ván gần đây: hiện SHOW ván, bấm "Xem thêm" thì hiện hết (server gửi tối đa 40).
const SHOW = 10;
function wireMore() {
  const b = $('#rp-more');
  if (b) b.onclick = () => { document.querySelectorAll('.rp-m.more').forEach(x => x.classList.remove('more')); b.remove(); };
}
function recentHtml(R, g) {
  if (!R.recent.length) return '';
  const rows = R.recent.map((m, i) => {
    const ppl = [...m.players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map(x =>
      `<span class="rp-p${x.rank === 1 ? ' win' : ''}">${m.aborted ? '' : x.rank === 1 ? '🏆 ' : `<small>${x.rank}.</small> `}${x.bot ? '🤖 ' : ''}${esc(x.name)}${x.guest ? ' <span class="guest">khách</span>' : ''}</span>`).join('');
    return `<div class="rp-m${m.aborted ? ' ab' : ''}${i >= SHOW ? ' more' : ''}"><div class="rp-mh"><span>${g(m.game).icon} <b>${esc(g(m.game).name)}</b>${weightTag(m)}</span>
      <span class="small muted">${when(m.at)} · ${Math.max(1, Math.round(m.dur / 60000))} phút${m.aborted ? ` · ⛔ bỏ dở${m.by ? ' bởi ' + esc(m.by) : ''}` : ''}</span></div>
      <div class="rp-ps">${ppl}</div></div>`;
  }).join('');
  return `<div class="card rp-card"><h2>🕑 Ván gần đây</h2><div class="rp-recent">${rows}</div>` +
    (R.recent.length > SHOW ? `<button id="rp-more" class="ghost">Xem thêm ${R.recent.length - SHOW} ván</button>` : '') + '</div>';
}

load();
