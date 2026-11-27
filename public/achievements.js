// Giao diện Thành tựu & Danh hiệu phía client: xem tiến độ, nhận thưởng xu & mở khoá/đeo danh hiệu.
import { $, el, esc, toast, openModal, closeModal, burst, confetti, PALETTE } from './ui.js';
import { sfx } from './sfx.js';
import { RARITY } from './shop-data.js';
import { ACH_GAMES, ACHIEVEMENTS, ACHIEVEMENT, TITLES } from './achievements-data.js';
import { myWallet, setWallet, fmt, nameHtml, titleHtml, frameCls, comboCls, comboFx, comboStage } from './shop.js';

let A = null;        // { unlocked: { [id]: at }, prog: { [k]: n } } — null khi chưa đăng nhập
let O = null;        // { request(t, data), name(), avatar(), openShop() }
let paintAch = null;
let filter = 'all';  // 'all' | 'titles' | <gameId>

export function initAchievements(o) { O = o; }
export const myAchievements = () => A;
export function setAchievements(a) {
  A = a || null;
  repaintAchievements();
}
// Ví đổi (đeo/gỡ danh hiệu, nhận credit...) → vẽ lại modal Thành tựu nếu đang mở (hub gọi trong onChange của ví).
export function repaintAchievements() {
  if (paintAch && $('#modal .ach')) paintAch(); else paintAch = null;
}

// Tin 'ach' sau ván: cập nhật ví + tiến độ thành tựu, chờ animation cuối ván rồi chúc mừng nếu vừa mở khoá.
export function achNotice(m) {
  if (m.wallet) setWallet(m.wallet);
  if (m.ach) setAchievements(m.ach);
  if (!m.unlocked || !m.unlocked.length) return;
  setTimeout(() => {
    sfx.win();
    confetti(140, ['#ffd23f', '#ffb300', '#7eb09b', '#ff6fa8', '#fff']);
    m.unlocked.forEach((id, i) => {
      const a = ACHIEVEMENT[id];
      if (!a) return;
      setTimeout(() => {
        toast(`🎖️ Thành tựu mới: <b>${esc(a.name)}</b> (+${fmt(a.coins)} 💰${a.title ? ` · ${titleHtml({ title: a.title.id })}` : ''})`, 4200);
      }, i * 1600);
    });
  }, m.delay || 0);
}

function avaHtml(look, initial) {
  const av = O && O.avatar && O.avatar();
  return `<div class="sh-ava big${frameCls(look)}${comboCls(look)}${av ? ' has-av' : ''}"${av ? ` style="background-image:url('${esc(av)}')"` : ''}>${av ? '' : esc(initial)}${comboFx(look)}</div>`;
}

export function openAchievements(startFilter) {
  if (startFilter) filter = startFilter;
  const card = openModal(`<div class="sh-head"><h2>🎖️ Thành tựu &amp; Danh hiệu</h2><span class="grow"></span>
    <button class="ghost" data-shop title="Mở cửa hàng vật phẩm">🛍️ Cửa hàng</button>
    <span class="sh-bal"></span>
    <button class="ghost" data-x title="Đóng (Esc)">✕</button></div>
    <div class="sh-sub small muted"></div>
    <div class="sh-hero ach-hero"></div>
    <div class="gp-tags ach-tabs"></div>
    <div class="ach-list"></div>`);
  card.classList.add('shop', 'ach');
  card.querySelector('[data-x]').onclick = closeModal;
  card.querySelector('[data-shop]').onclick = () => { sfx.pop(); O && O.openShop && O.openShop(); };

  const bal = card.querySelector('.sh-bal');
  const hero = card.querySelector('.ach-hero');
  const tabs = card.querySelector('.ach-tabs');
  const list = card.querySelector('.ach-list');

  const paint = () => {
    const W = myWallet(), on = !!W;
    const name = (O && O.name()) || 'Bạn', initial = ([...name][0] || '?').toUpperCase();
    const eq = W ? W.eq : {}, owned = new Set(W ? W.owned : []);
    const unlocked = (A && A.unlocked) || {}, prog = (A && A.prog) || {};

    const doneCount = ACHIEVEMENTS.filter(a => unlocked[a.id]).length;
    const titleCount = TITLES.filter(t => owned.has(t.id) || ACHIEVEMENTS.some(a => a.title && a.title.id === t.id && unlocked[a.id])).length;
    const bonusCoins = ACHIEVEMENTS.reduce((s, a) => s + (unlocked[a.id] ? a.coins : 0), 0);

    bal.innerHTML = on ? `<span class="sh-coin">💰</span> <b>${fmt(W.credits)}</b>` : '<span class="sh-coin">💰</span> <span class="small">Chế độ Khách</span>';
    bal.title = on ? `Số dư hiện có: ${fmt(W.credits)} credit` : 'Đăng nhập để tích luỹ credit';

    card.querySelector('.sh-sub').innerHTML = on
      ? `Đã mở: <b>${doneCount}/${ACHIEVEMENTS.length}</b> thành tựu · Danh hiệu: <b>${titleCount}/${TITLES.length}</b> · Tổng thưởng thành tựu: <b>+${fmt(bonusCoins)} 💰</b>`
      : `Bạn đang xem ở chế độ Khách — hãy <b>đăng nhập ở trang chủ</b> để lưu tiến độ thành tựu, nhận xu và danh hiệu.`;

    const cb = comboSetName(eq);
    hero.className = 'sh-hero ach-hero' + comboCls(eq);
    hero.innerHTML = `${comboStage(eq)}${avaHtml(eq, initial)}
      <div class="sh-me"><div>${nameHtml(name, eq)}${titleHtml(eq)}</div>
      <div class="small muted">${eq.title ? 'Danh hiệu đang hiển thị tại phòng chờ, trò chuyện và bảng xếp hạng' : on ? 'Chưa đeo danh hiệu — hoàn thành thành tựu bên dưới để mở khoá và trang bị' : 'Hoàn thành thành tựu trong game để nhận thêm xu và danh hiệu'}</div></div>
      ${on && eq.title ? '<button class="ghost ach-unequip" data-unequip>Gỡ danh hiệu</button>' : ''}`;
    const un = hero.querySelector('[data-unequip]');
    if (un) un.onclick = () => equipTitle(null);

    tabs.innerHTML = '';
    const chips = [
      { id: 'all', label: `Tất cả <span>${ACHIEVEMENTS.length}</span>` },
      ...ACH_GAMES.map(g => ({ id: g.id, label: `${g.icon} ${esc(g.name)} <span>${ACHIEVEMENTS.filter(a => a.game === g.id).length}</span>` })),
      { id: 'titles', label: `🎖️ Có danh hiệu <span>${TITLES.length}</span>` },
    ];
    if (!chips.some(c => c.id === filter)) filter = 'all';
    for (const ch of chips) {
      const b = el('button', 'gp-tag' + (filter === ch.id ? ' on' : ''), ch.label);
      b.onclick = () => { filter = ch.id; paint(); };
      tabs.appendChild(b);
    }

    list.innerHTML = '';
    const shown = ACHIEVEMENTS.filter(a => filter === 'all' ? true : filter === 'titles' ? !!a.title : a.game === filter);
    for (const a of shown) {
      const done = !!unlocked[a.id];
      const cur = done ? a.goal : (a.progKey ? Math.min(a.goal, prog[a.progKey] || 0) : 0);
      const pct = Math.round((cur / Math.max(1, a.goal)) * 100);
      const R = RARITY[a.rar];
      const wearing = !!(a.title && eq.title === a.title.id);
      const hasTitle = !!(a.title && (done || owned.has(a.title.id)));
      const gm = ACH_GAMES.find(g => g.id === a.game);

      const c = el('div', `ach-card rar-${a.rar}${done ? ' done' : ''}${wearing ? ' wearing' : ''}`);
      c.style.setProperty('--rc', R.color);
      c.innerHTML = `<div class="ach-ico">${a.icon}</div>
        <div class="ach-body">
          <div class="ach-top"><b>${esc(a.name)}</b><span class="ach-rar">${R.name}</span>${gm ? `<span class="ach-game small muted">${gm.icon} ${esc(gm.name)}</span>` : ''}</div>
          <div class="ach-desc small muted">${esc(a.desc)}</div>
          <div class="ach-prog"><div class="ach-bar"><i style="width:${pct}%"></i></div><span class="small">${done ? '✔ Hoàn thành' : `${cur}/${a.goal}`}</span></div>
          <div class="ach-rew">
            <span class="ach-coin">+${fmt(a.coins)} 💰</span>
            ${a.title ? `<span class="ach-ttl-wrap">${titleHtml({ title: a.title.id })}</span>` : ''}
          </div>
        </div>
        <div class="ach-act"></div>`;

      const actBox = c.querySelector('.ach-act');
      if (hasTitle) {
        const b = el('button', wearing ? 'ghost sh-on' : 'gold', wearing ? '✔ Đang đeo' : 'Đeo danh hiệu');
        b.title = wearing ? 'Nhấn để gỡ danh hiệu' : 'Trang bị danh hiệu này';
        b.onclick = () => equipTitle(wearing ? null : a.title.id, c);
        actBox.appendChild(b);
      } else if (done) {
        actBox.innerHTML = '<span class="ach-done small">✔ Đã nhận</span>';
      } else {
        actBox.innerHTML = '<span class="ach-lock small muted">🔒 Chưa mở</span>';
      }
      list.appendChild(c);
    }
  };

  async function equipTitle(id, cardEl) {
    if (!O) return;
    const r = await O.request('equip', { slot: 'title', item: id });
    if (!r.ok) return;
    sfx.pop();
    setWallet(r.wallet);
    if (id && cardEl) {
      const box = cardEl.getBoundingClientRect();
      burst(box.left + box.width / 2, box.top + box.height / 2, PALETTE, 24, 5);
    }
  }

  paintAch = paint;
  paint();
  if (myWallet() && O) {
    O.request('achievements').then(r => {
      if (!r.ok) return;
      if (r.wallet) setWallet(r.wallet);
      setAchievements(r.ach);
    });
  }
}

function comboSetName(eq) {
  return eq && eq.frame && eq.name && eq.frame.slice(3) === eq.name.slice(3);
}
