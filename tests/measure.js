// Event health report: runs every event with CPU players (the same Bot the
// game uses) and measures what a game night feels: how long an event lasts,
// whether a player who does nothing can win, and whether the lead changes.
// Open /tests/measure.html. Results land in window.__measure.
import { statsFor } from '../src/game/powers.js';
import { Fx } from '../src/engine/fx.js';
import { NO_SOUND } from '../src/engine/audio.js';
import { NO_CONTROLS } from '../src/game/controls.js';
import { BTN } from '../src/input/gamepad-adapter.js';
import { Bot } from '../src/game/bots.js';
import { GAMES } from '../src/game/registry.js';

const DT = 1 / 60;
const DEAD = 0.25;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

/** Turn a Bot's fake pad into the controls object games read. */
function botControls(bot, prev) {
  const pad = bot.pad();
  const b = (i) => pad.buttons[i].pressed;
  const p = (i) => b(i) && !(prev && prev[i]);
  const ax = dz(pad.axes[2]), ay = dz(pad.axes[3]);
  const c = {
    ...NO_CONTROLS, mx: dz(pad.axes[0]), my: dz(pad.axes[1]), ax, ay, aim: Math.hypot(ax, ay) > 0.35,
    jump: b(BTN.A), jumpP: p(BTN.A), fire: b(BTN.X), fireP: p(BTN.X), block: b(BTN.RB), blockP: p(BTN.RB),
  };
  return [c, pad.buttons.map((x) => x.pressed)];
}

/** One event with n CPU players. idleSeat stands still and never presses anything. */
export function runEvent(id, { n = 3, idleSeat = 0, variant = 0 } = {}) {
  const fx = new Fx();
  const seats = [1, 2, 3].slice(0, n);
  const game = GAMES[id].create({
    fx, sound: NO_SOUND, variant,
    players: seats.map((s) => ({ seat: s, idx: s - 1, stats: statsFor({}), pickupMult: 1 })),
  });
  const bots = new Map(seats.map((s) => [s, new Bot()]));
  const prev = new Map();
  let steps = 0, leader = null, leadChanges = 0;
  while (!game.finished && steps < 60 * 95) {
    const m = new Map();
    for (const s of seats) {
      if (s === idleSeat) { m.set(s, NO_CONTROLS); continue; }
      const bot = bots.get(s);
      bot.think({ screen: 'play', dt: DT, game, seatN: s });
      const [c, now] = botControls(bot, prev.get(s));
      prev.set(s, now);
      m.set(s, c);
    }
    fx.update(DT);
    game.update(DT * (fx.timeScale() || 0.0001), m);
    steps++;
    if (steps % 30 === 0 && game.leader) {
      const l = game.leader();
      if (l && l !== leader) { if (leader) leadChanges++; leader = l; }
    }
  }
  return { secs: steps / 60, ranking: game.ranking.slice(), leadChanges, rounds: game.round || 1 };
}

export function measure(id, runs = 20) {
  const len = [], rounds = [];
  let idleWins = 0, idleLast = 0, lead = 0;
  for (let k = 0; k < runs; k++) {
    const r = runEvent(id, { idleSeat: 1, variant: k });
    len.push(r.secs); rounds.push(r.rounds); lead += r.leadChanges;
    if (r.ranking[0] === 1) idleWins++;
    if (r.ranking[r.ranking.length - 1] === 1) idleLast++;
  }
  const active = [];
  for (let k = 0; k < Math.ceil(runs / 2); k++) active.push(runEvent(id, { idleSeat: 0, variant: k }).secs);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    id, name: GAMES[id].meta.name, tier: GAMES[id].meta.tier || 1,
    avgSecs: +avg(active).toFixed(1), minSecs: +Math.min(...active).toFixed(1), maxSecs: +Math.max(...active).toFixed(1),
    idleWinPct: Math.round((idleWins / runs) * 100), idleLastPct: Math.round((idleLast / runs) * 100),
    rounds: +avg(rounds).toFixed(1), runs,
  };
}

export function measureAll(runs = 20) {
  return Object.keys(GAMES).map((id) => measure(id, runs));
}
