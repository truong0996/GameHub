// ⚡ Phản Xạ — giao diện client. Ví dụ tối giản của "Game client interface" (xem CLAUDE.md).
let CTX, UI, SFX, ROOT, ST, keyHandler, overShown;
const $ = s => ROOT.querySelector(s);

function press(e) {
  if (e) e.preventDefault();
  if (!ST || CTX.me().seat < 0 || !['wait', 'go'].includes(ST.phase)) return;
  CTX.send({ type: 'press' });
}

function render() {
  const me = CTX.me().seat, seats = CTX.game.seats, pad = $('#px-pad');
  const out = ST.early.includes(me);
  const name = p => UI.esc(ST.players[p].name);
  pad.className = ST.phase + (out ? ' out' : '');
  pad.innerHTML = {
    wait: () => (out ? 'BẤM SỚM RỒI 😅<small>Chờ vòng sau</small>' : 'CHỜ ĐÃ...<small>Bấm khi chuyển XANH</small>'),
    go: () => (out ? '😅' : 'BẤM!'),
    result: () => (ST.roundWinner != null ? `${name(ST.roundWinner)} +1<small>${ST.reactMs} ms</small>` : 'Không ai kịp 😴'),
    over: () => `🏆 ${name(ST.winner)}<small>thắng chung cuộc</small>`,
  }[ST.phase]();
  $('#px-round').textContent = `Vòng ${ST.round} · về đích ${ST.target} điểm`;
  const best = Math.max(...ST.players.map(p => p.score || 0));
  $('#px-scores').innerHTML = ST.players.map((pl, i) => (!pl.active ? '' :
    `<div class="sc${i === me ? ' me' : ''}${pl.score === best && best > 0 ? ' lead' : ''}" style="--c:${seats[i].color}">${CTX.skin.face(i)}${pl.kind === 'bot' ? '🤖 ' : ''}${name(i)}<b>${pl.score}</b></div>`)).join('');
  if (ST.phase === 'over' && !overShown) {
    overShown = true;
    const host = CTX.me().isHost;
    UI.openModal(`<h2 class="center">🏆 ${name(ST.winner)} thắng!</h2>
      <div class="btns">${host ? '<button class="ghost" data-a="lobby">🏠 Về phòng chờ</button><button class="gold" data-a="again">🔁 Ván mới</button>' : '<span class="muted">Chờ chủ phòng...</span>'}</div>`);
    const bind = (a, fn) => { const b = document.querySelector(`#modal [data-a="${a}"]`); if (b) b.onclick = () => { UI.closeModal(); fn(); }; };
    bind('lobby', CTX.backToLobby);
    bind('again', CTX.restart);
  }
}

function update(msg) {
  ST = msg.state;
  const me = CTX.me().seat;
  for (const e of msg.events) {
    if (e.t === 'go') SFX.tone(880, 0.12, { type: 'square', v: 0.12 });
    if (e.t === 'early' && e.p === me) SFX.error();
    if (e.t === 'point') {
      const r = $('#px-pad').getBoundingClientRect();
      UI.burst(r.left + r.width / 2, r.top + r.height / 2, [CTX.game.seats[e.p].color, '#fff'], 40, 8);
      if (e.p === me) SFX.card(); else SFX.pop();
    }
    if (e.t === 'win') { SFX.win(); UI.confetti(); }
  }
  render();
}

export default {
  async mount(root, ctx) {
    CTX = ctx; UI = ctx.ui; SFX = ctx.sfx; ROOT = root; ST = null; overShown = false;
    await ctx.loadCss(new URL('./style.css', import.meta.url));
    root.innerHTML = `<div class="px">
      <header><b>⚡ Phản Xạ</b><span id="px-round" class="muted small"></span><span class="grow"></span></header>
      <button id="px-pad">...</button>
      <div id="px-scores"></div>
      <div class="bottom"><div id="px-emotes" class="grow"></div><div id="px-tools"></div></div>
    </div>`;
    $('#px-pad').addEventListener('pointerdown', press);
    UI.emoteBar($('#px-emotes'));
    UI.toolbar($('#px-tools'), { help: () => UI.toast(UI.esc(ctx.game.description), 4000) });
    keyHandler = e => { if (e.code === 'Space') press(e); };
    addEventListener('keydown', keyHandler);
    return {
      update,
      onRoom: () => { if (ST) render(); },
      unmount() { removeEventListener('keydown', keyHandler); },
    };
  },
};
