// Best-of rounds for elimination events (audit F-01, backlog B-03).
// Last one standing takes a round, but only if they landed a hit; first to
// WIN_ROUNDS takes the event. Knocked-out players haunt the arena until the
// next round, so nobody sits out for long. Hazards should run on `roundT`.
import { SEAT_COLORS } from '../engine/sprites.js';
import { P } from '../engine/style.js';

export function makeRounds({ players, fx, sound, drift, onReset, win = 2, max = 5, breakT = 1.8, cap = 24, time = 54, shield = 1.0 }) {
  const R = {
    round: 1, roundT: 0, between: 0, endT: null, banner: null, t: 0, win, shield,
    contenders: () => players.filter((p) => !p.perma),
  };
  for (const p of players) { p.wins = 0; p.survive = 0; p.dealt = 0; p.dealtTotal = 0; p.perma = !!p.perma; }

  R.reset = () => {
    R.roundT = 0;
    const cs = R.contenders();
    cs.forEach((p, k) => {
      p.dead = false; p.deathT = null; p.hp = p.maxHp; p.dealt = 0;
      p.poison = null; p.slowT = 0; p.shields = p.st ? p.st.shields : p.shields;
      onReset(p, k, R.round);
    });
    if (R.round > 1) { R.banner = { text: `ROUND ${R.round}`, sub: null, col: P.text, t: 0.9 }; sound.sfx('beep'); }
  };

  /** Call first in update. Returns 'done' | 'end' | 'break' | 'play'. */
  R.tick = (dt) => {
    R.t += dt;
    if (R.banner) { R.banner.t -= dt; if (R.banner.t <= 0) R.banner = null; }
    if (R.endT !== null) { R.endT -= dt; return R.endT <= 0 ? 'done' : 'end'; }
    if (R.between > 0) {
      R.between -= dt;
      if (R.between <= 0) { R.round += 1; R.reset(); }
      return 'break';
    }
    R.roundT += dt;
    return 'play';
  };

  function endRound(winner, how) {
    R.between = breakT;
    for (const p of R.contenders()) p.dealtTotal += p.dealt;
    if (winner && winner.dealt <= 0) { // land a hit to take the round: no prize for hiding
      const fighter = R.contenders().filter((p) => p.dealt > 0).sort((a, b) => b.dealt - a.dealt)[0];
      if (fighter) { how = `P${winner.idx + 1} NEVER LANDED A HIT`; winner = fighter; }
      else { how = 'NOBODY LANDED A HIT'; winner = null; }
    }
    if (winner) {
      winner.wins += 1;
      if (drift) drift.kick(SEAT_COLORS[winner.idx], 1);
      const [cx, cy] = winner.pos();
      fx.ring(cx, cy, 40, SEAT_COLORS[winner.idx], 0.6);
      sound.sfx('round');
      R.banner = { text: `P${winner.idx + 1} TAKES ROUND ${R.round}`, sub: how, col: SEAT_COLORS[winner.idx], t: breakT };
    } else R.banner = { text: `ROUND ${R.round}: NOBODY`, sub: how, col: P.dim, t: breakT };
    const done = R.contenders().some((p) => p.wins >= win) || R.round >= max || R.t >= time - breakT;
    if (done) R.endT = breakT;
  }
  const healthiest = () => R.contenders().filter((p) => !p.dead).sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0] || null;

  /** Call last in update, during 'play'. */
  R.check = (dt) => {
    const cs = R.contenders();
    for (const p of cs) if (!p.dead) p.survive += dt;
    const up = cs.filter((p) => !p.dead);
    if (cs.length >= 2 && up.length <= 1) {
      if (up.length === 1) endRound(up[0], null);
      else { const last = cs.slice().sort((a, b) => b.deathT - a.deathT)[0]; endRound(last, 'EVERYONE FELL. LAST ONE DOWN TAKES IT'); }
    } else if (R.roundT >= cap || R.t >= time) endRound(healthiest(), 'TIME: MOST HEALTH TAKES IT');
    else if (cs.length < 2 && R.roundT >= 20) endRound(up[0] || null, null);
  };

  R.rank = () => {
    // round wins, then who fought (hits landed across the event), then survival: hiding never breaks a tie
    const order = (x, y) => (y.wins - x.wins) || ((y.dealtTotal + y.dealt) - (x.dealtTotal + x.dealt)) || ((y.recoilAt ? 1 : 0) - (x.recoilAt ? 1 : 0)) || (y.survive - x.survive) || (y.hp / y.maxHp - x.hp / x.maxHp);
    return [...R.contenders().sort(order), ...players.filter((p) => p.perma)].map((p) => p.seat);
  };
  R.leader = () => { const r = R.rank(); return R.contenders().some((p) => p.wins) ? r[0] : null; };
  /** Someone is one round from the event: the music and HUD lean in. */
  R.matchPoint = () => R.contenders().some((p) => p.wins === win - 1);
  R.timeLeft = () => Math.max(0, Math.min(time - R.t, cap - R.roundT));
  R.hudInfo = (seat, outLabel = 'OUT') => {
    const p = players.find((x) => x.seat === seat);
    if (p.perma) return { text: 'GHOST', pips: 0, pipMax: 0 };
    return { text: p.dead ? outLabel : `${Math.max(0, Math.ceil((p.hp / p.maxHp) * 100))}%`, pips: p.wins, pipMax: win, warn: !p.dead && p.hp / p.maxHp < 0.35 };
  };
  R.hud = (seat) => { const i = R.hudInfo(seat); return `${i.pips}W ${i.text}`; };

  /** The round banner: the event's own cue for state changes. */
  R.draw = (g) => {
    const b = R.banner;
    if (!b) return;
    const k = Math.min(1, (breakT - b.t) * 6 + (b.text.startsWith('ROUND') ? 1 : 0));
    g.alpha(0.78 * Math.min(1, k)); g.rect(0, 66, 320, b.sub ? 40 : 30, P.ink, true); g.alpha(1);
    g.rect(0, 66, 320, 1, b.col, true); g.rect(0, b.sub ? 105 : 95, 320, 1, b.col, true);
    g.text(b.text, 160, 71, { scale: 3, col: b.col, align: 'center', shadow: '#000' });
    if (b.sub) g.text(b.sub, 160, 93, { scale: 2, col: P.text, align: 'center' });
    const cs = R.contenders();
    cs.forEach((p, k2) => {
      const bx = 160 - (cs.length * 34) / 2 + k2 * 34 + 4;
      const by = b.sub ? 110 : 100;
      g.rect(bx - 2, by - 1, 32, 10, P.ink, true);
      g.text(`P${p.idx + 1}`, bx, by, { scale: 1, col: SEAT_COLORS[p.idx], shadow: null });
      for (let w = 0; w < win; w++) { const px = bx + 14 + w * 7; if (w < p.wins) g.circle(px, by + 3.5, 2.6, SEAT_COLORS[p.idx], true); else g.ring(px, by + 3.5, 2.6, '#6a6290', true); }
    });
  };
  return R;
}
