// Hệ thống thành tựu của hub (bảng achievements + ach_prog trong hub.db).
// Theo dõi sự kiện trong ván cho từng game (TRACKERS) và chấm mở khoá thành tựu chung + thành tựu riêng khi ván kết thúc hợp lệ (!aborted).
// Thành tựu mở khoá thưởng credit (không bị tính vào giới hạn ngày) và/hoặc danh hiệu (thêm vào ví để trang bị).
import { tx } from './db.js';
import { ACHIEVEMENTS, ACHIEVEMENT } from '../public/achievements-data.js';

const MARATHON_MS = 15 * 60 * 1000;

const TRACKERS = {
  cocangua: {
    init() {
      return {
        out: {}, kicks: {}, hits: {}, cards: {},
        portals: {}, mysteries: {}, portalKick: {}, turbo12: {},
        sixStreak: {}, six3: {},
      };
    },
    onEvents(acc, events) {
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (e.t === 'turn') {
          acc.sixStreak[e.p] = 0;
        } else if (e.t === 'roll') {
          if (!e.golden && e.v === 6) {
            acc.sixStreak[e.p] = (acc.sixStreak[e.p] || 0) + 1;
            if (acc.sixStreak[e.p] >= 3) { acc.six3[e.p] = 1; acc.sixStreak[e.p] = 0; }
          } else {
            acc.sixStreak[e.p] = 0;
          }
        } else if (e.t === 'move') {
          if (e.kind === 'out') acc.out[e.p] = (acc.out[e.p] || 0) + 1;
          if ((e.kind === 'track' || e.kind === 'enter') && e.path && e.path.length >= 12) acc.turbo12[e.p] = 1;
        } else if (e.t === 'kick') {
          acc.hits[e.p] = (acc.hits[e.p] || 0) + 1;
          if (e.by != null && e.by !== e.p) acc.kicks[e.by] = (acc.kicks[e.by] || 0) + 1;
        } else if (e.t === 'meteorStrike' && e.hits) {
          for (const h of e.hits) acc.hits[h.p] = (acc.hits[h.p] || 0) + 1;
        } else if (e.t === 'useCard') {
          acc.cards[e.p] = (acc.cards[e.p] || 0) + 1;
        } else if (e.t === 'fly' && e.kind === 'portal') {
          acc.portals[e.p] = (acc.portals[e.p] || 0) + 1;
          const prev = events[i - 1];
          if (prev && prev.t === 'kick' && prev.by === e.p && prev.p !== e.p) acc.portalKick[e.p] = 1;
        } else if (e.t === 'mystery') {
          acc.mysteries[e.p] = (acc.mysteries[e.p] || 0) + 1;
        }
      }
    },
    eval({ seat, rank, playersCount, opts, state, acc, bump, getProg }) {
      const kicks = (acc && acc.kicks[seat]) || 0;
      const hits = (acc && acc.hits[seat]) || 0;
      const cards = (acc && acc.cards[seat]) || 0;
      const out = (acc && acc.out[seat]) || 0;
      const portals = (acc && acc.portals[seat]) || 0;
      const mysteries = (acc && acc.mysteries[seat]) || 0;
      const six3 = !!(acc && acc.six3[seat]);
      const turbo12 = !!(acc && acc.turbo12[seat]);
      const portalKick = !!(acc && acc.portalKick[seat]);
      const win = rank === 1;

      bump('ccn_kicks', kicks);
      bump('ccn_cards', cards);
      bump('ccn_portals', portals);
      bump('ccn_mysteries', mysteries);
      if (win) bump('ccn_wins', 1);

      const totKicks = getProg('ccn_kicks');
      const totCards = getProg('ccn_cards');
      const totPortals = getProg('ccn_portals');
      const totMysteries = getProg('ccn_mysteries');
      const totWins = getProg('ccn_wins');

      const fastSweep = win && playersCount >= 3 && state && Array.isArray(state.players) &&
        state.players.every((pl, i) => i === seat || !pl.active || pl.horses.every(hs => hs.loc !== 'home'));

      return {
        'ccn-first-out': out >= 1,
        'ccn-first-win': win,
        'ccn-portal-5': totPortals >= 5,
        'ccn-mystery-10': totMysteries >= 10,
        'ccn-unlucky': hits >= 4,
        'ccn-kick-10': totKicks >= 10,
        'ccn-cards-15': totCards >= 15,
        'ccn-turbo-12': turbo12,
        'ccn-hattrick-kick': kicks >= 3,
        'ccn-portal-kick': portalKick,
        'ccn-three-sixes': six3,
        'ccn-win-6p': win && playersCount === 6,
        'ccn-untouchable': win && playersCount >= 3 && opts.horses === 4 && hits === 0,
        'ccn-classic-win': win && opts.home === 'classic' && opts.horses === 4 && playersCount >= 3,
        'ccn-kick-30': totKicks >= 30,
        'ccn-fast-home': fastSweep,
        'ccn-win-10': totWins >= 10,
      };
    },
  },
};

export function createAchievements(db, { wallet = null } = {}) {
  const q = {
    list: db.prepare('SELECT id, at FROM achievements WHERE acct = ?'),
    add: db.prepare('INSERT OR IGNORE INTO achievements (acct, id, at) VALUES (?, ?, ?)'),
    progAll: db.prepare('SELECT k, v FROM ach_prog WHERE acct = ?'),
    progGet: db.prepare('SELECT v FROM ach_prog WHERE acct = ? AND k = ?'),
    progAdd: db.prepare('INSERT INTO ach_prog (acct, k, v) VALUES (?, ?, ?) ON CONFLICT(acct, k) DO UPDATE SET v = v + excluded.v'),
    progSet: db.prepare('INSERT INTO ach_prog (acct, k, v) VALUES (?, ?, ?) ON CONFLICT(acct, k) DO UPDATE SET v = excluded.v'),
    countPlay: db.prepare("SELECT COUNT(*) n FROM ach_prog WHERE acct = ? AND k LIKE 'gen_play:%'"),
    countWin: db.prepare("SELECT COUNT(*) n FROM ach_prog WHERE acct = ? AND k LIKE 'gen_win:%'"),
  };

  function info(acct) {
    const unlocked = {};
    for (const r of q.list.all(acct)) if (ACHIEVEMENT[r.id]) unlocked[r.id] = r.at;
    const prog = {};
    for (const r of q.progAll.all(acct)) if (!r.k.startsWith('gen_play:') && !r.k.startsWith('gen_win:')) prog[r.k] = r.v;
    return { unlocked, prog };
  }

  function evalGeneral({ acct, game, rank, dur, humanAccts, bump, setProg, getProg }) {
    const win = rank === 1;
    bump('gen_games', 1);
    setProg('gen_play:' + game, 1);
    const playVariety = q.countPlay.get(acct).n;
    setProg('gen_games_set', playVariety);

    let winVariety = getProg('gen_win_games_set');
    let streak = 0;
    if (win) {
      bump('gen_wins', 1);
      setProg('gen_win:' + game, 1);
      winVariety = q.countWin.get(acct).n;
      setProg('gen_win_games_set', winVariety);
      streak = getProg('gen_streak') + 1;
      setProg('gen_streak', streak);
    } else {
      setProg('gen_streak', 0);
    }

    const totGames = getProg('gen_games');
    const totWins = getProg('gen_wins');

    return {
      'gen-play-1': totGames >= 1,
      'gen-win-1': totWins >= 1,
      'gen-play-10': totGames >= 10,
      'gen-variety-3': playVariety >= 3,
      'gen-win-pvp': win && humanAccts >= 2,
      'gen-streak-3': streak >= 3,
      'gen-win-10': totWins >= 10,
      'gen-marathon': dur >= MARATHON_MS,
      'gen-win-variety-3': winVariety >= 3,
      'gen-play-50': totGames >= 50,
      'gen-win-30': totWins >= 30,
    };
  }

  function recordMatch({ game, opts, players, ranks, state = null, dur = 0, acc = null, now = Date.now() }) {
    const tr = TRACKERS[game] || null;
    const humans = players.map((p, i) => ({ ...p, rank: ranks[i] ?? null })).filter(p => p.acct && !p.bot);
    if (!humans.length) return [];
    const humanAccts = new Set(humans.map(h => h.acct)).size;

    const results = [];
    tx(db, () => {
      for (const h of humans) {
        const had = new Set(q.list.all(h.acct).map(r => r.id));
        const bump = (k, d) => { if (d > 0) q.progAdd.run(h.acct, k, d); };
        const setProg = (k, v) => q.progSet.run(h.acct, k, v);
        const getProg = k => (q.progGet.get(h.acct, k) || {}).v || 0;

        const checks = {
          ...evalGeneral({ acct: h.acct, game, rank: h.rank, dur, humanAccts, bump, setProg, getProg }),
          ...(tr ? tr.eval({ seat: h.seat, rank: h.rank, playersCount: players.length, opts, state, acc, bump, getProg }) : {}),
        };

        const unlocked = [], titles = [];
        for (const a of ACHIEVEMENTS) {
          if ((a.game !== 'general' && a.game !== game) || had.has(a.id) || !checks[a.id]) continue;
          if (q.add.run(h.acct, a.id, now).changes > 0) {
            unlocked.push(a.id);
            if (a.title) titles.push(a.title.id);
          }
        }
        let lookChanged = false;
        if (titles.length && wallet && wallet.grantTitlesRaw) {
          lookChanged = wallet.grantTitlesRaw(h.acct, titles);
        }
        results.push({
          acct: h.acct,
          unlocked,
          lookChanged,
          ach: info(h.acct),
          wallet: wallet ? wallet.info(h.acct, now) : null,
        });
      }
    });
    return results;
  }

  return {
    tracker: game => TRACKERS[game] || null,
    info,
    recordMatch,
  };
}
