// Match rules, power stacking, and robot playthroughs of every minigame.
import { Match, makePlaylist, POINTS } from '../src/game/match.js';
import { POWERS, statsFor, MAX_STACK } from '../src/game/powers.js';
import { Fx } from '../src/engine/fx.js';
import { Gfx } from '../src/engine/gfx.js';
import { NO_SOUND } from '../src/engine/audio.js';
import { NO_CONTROLS } from '../src/game/controls.js';
import * as rumble from '../src/games/rumble.js';
import * as dustlap from '../src/games/dustlap.js';
import * as lounge from '../src/games/lounge.js';
import * as coins from '../src/games/coins.js';

const GAMES = { rumble, dustlap, lounge, coins };
export const results = [];
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message + (e.stack ? ' @ ' + e.stack.split('\n')[1] : '') }); } }
function eq(a, b, msg = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
function ok(v, msg = 'expected true') { if (!v) throw new Error(msg); }

// ---- match ----
test('playlist: each game twice, never back-to-back', () => {
  for (let k = 0; k < 200; k++) {
    const p = makePlaylist(['a', 'b', 'c', 'd'], 2);
    eq(p.length, 8);
    ok(p.every((g, i) => i === 0 || g !== p[i - 1]), p.join());
    ['a', 'b', 'c', 'd'].forEach((g) => eq(p.filter((x) => x === g).length, 2));
  }
});
test('points 3/2/1 and event wins', () => {
  const m = new Match([1, 2, 3], ['rumble', 'coins']);
  const a = m.award([2, 3, 1]);
  eq(a.map((x) => x.pts), POINTS);
  eq(m.player(2).points, 3); eq(m.player(3).points, 2); eq(m.player(1).points, 1);
  eq(m.player(2).wins, 1);
});
test('draft: last place picks first, winner gets nothing, none after last event', () => {
  const m = new Match([1, 2, 3], ['rumble', 'coins']);
  eq(m.draftOrder([2, 3, 1]), [1, 3]);
  m.eventIdx = m.eventCount - 1;
  eq(m.draftOrder([2, 3, 1]), []);
});
test('offer: 3 different powers, never one at the cap', () => {
  const m = new Match([1, 2], ['rumble']);
  for (let k = 0; k < 50; k++) {
    const h = m.offer(1);
    eq(new Set(h).size, 3);
  }
  m.pick(1, 'ricochet'); m.pick(1, 'ricochet');
  eq(m.pick(1, 'ricochet'), false, 'third stack refused');
  for (let k = 0; k < 100; k++) ok(!m.offer(1).includes('ricochet'), 'capped power offered');
});
test('powers stack across events and reset on rematch', () => {
  const m = new Match([1, 2], ['rumble', 'coins']);
  m.pick(2, 'ricochet'); m.award([1, 2]); m.advance(); m.pick(2, 'ricochet');
  eq(m.stats(2).bounces, 4);
  m.reset();
  eq(m.player(2).powers, {}); eq(m.player(2).points, 0); eq(m.stats(2).bounces, 0); eq(m.eventIdx, 0);
});
test('tie detection uses points then wins; sudden death winner goes first', () => {
  const m = new Match([1, 2, 3], ['rumble']);
  m.player(1).points = 10; m.player(2).points = 10; m.player(3).points = 4;
  m.player(1).wins = 2; m.player(2).wins = 2;
  eq(m.tiedLeaders().sort(), [1, 2]);
  m.player(2).wins = 3;
  eq(m.tiedLeaders(), [2]);
  eq(m.finalOrder(1)[0], 1);
});
test('every power has text for every game and a downside', () => {
  for (const p of POWERS) {
    ok(p.good && p.bad, p.id);
    for (const g of Object.keys(GAMES)) ok(p.games[g] && p.games[g].length > 5, `${p.id} ${g}`);
  }
});
test('stats: hearts never drop below 1; stacking is capped', () => {
  eq(statsFor({ glass: 2, tiny: 2 }).hp, 1);
  eq(statsFor({ ricochet: 5 }).bounces, 2 * MAX_STACK);
});

// ---- robot playthroughs ----
function bots(seats) {
  const st = new Map(seats.map((s) => [s, { c: { ...NO_CONTROLS }, t: 0 }]));
  return (dt) => {
    const m = new Map();
    for (const [s, b] of st) {
      b.t -= dt;
      const c = { ...b.c, jumpP: false, fireP: false, blockP: false };
      if (b.t <= 0) {
        b.t = Math.random() * 0.6;
        b.c.mx = Math.random() * 2 - 1; b.c.my = Math.random() * 2 - 1;
        b.c.ax = Math.random() * 2 - 1; b.c.ay = Math.random() * 2 - 1; b.c.aim = Math.random() < 0.3;
        b.c.jump = Math.random() < 0.5; b.c.fire = Math.random() < 0.6;
      }
      if (Math.random() < 0.06) c.jumpP = true;
      if (Math.random() < 0.08) c.fireP = true;
      if (Math.random() < 0.03) c.blockP = true;
      m.set(s, c);
    }
    return m;
  };
}
function playthrough(id, { powers = {}, ghosts = [], variant = 0, n = 3 } = {}) {
  const fx = new Fx();
  const seats = [1, 2, 3].slice(0, n);
  const game = GAMES[id].create({
    fx, sound: NO_SOUND, variant,
    players: seats.map((s) => ({ seat: s, idx: s - 1, stats: statsFor(powers[s] || {}), ghost: ghosts.includes(s) })),
  });
  const input = bots(seats);
  const dt = 1 / 60;
  let steps = 0;
  const fakeG = null;
  while (!game.finished && steps < 60 * 90) {
    fx.update(dt);
    game.update(dt * (fx.timeScale() || 0.0001), input(dt));
    steps++;
    for (const s of seats) game.hud(s);
    void fakeG;
  }
  return { game, secs: steps / 60 };
}
for (const id of Object.keys(GAMES)) {
  test(`${id}: robots finish with a full ranking (2 variants)`, () => {
    for (const v of [0, 1]) {
      const { game, secs } = playthrough(id, { variant: v });
      ok(game.finished, `${id} did not finish (v${v})`);
      eq(game.ranking.slice().sort(), [1, 2, 3], 'ranking');
      ok(secs <= 62, `${id} took ${secs}s`);
    }
  });
  test(`${id}: survives every power stacked twice`, () => {
    const all = Object.fromEntries(POWERS.map((p) => [p.id, 2]));
    const { game } = playthrough(id, { powers: { 1: all, 2: { ricochet: 2, splitter: 2, aftershock: 2, homing: 2 } } });
    ok(game.finished);
    eq(game.ranking.length, 3);
  });
  test(`${id}: 2-player game works`, () => {
    const { game } = playthrough(id, { n: 2 });
    ok(game.finished); eq(game.ranking.slice().sort(), [1, 2]);
  });
}
test('rumble sudden death: ghosts start out and rank last', () => {
  const { game } = playthrough('rumble', { ghosts: [3] });
  ok(game.finished);
  eq(game.ranking[2], 3);
});
test('draw functions run without errors', () => {
  const g = new Gfx(document.createElement('canvas'));
  for (const id of Object.keys(GAMES)) {
    const fx = new Fx();
    const game = GAMES[id].create({ fx, sound: NO_SOUND, variant: 0, players: [1, 2, 3].map((s) => ({ seat: s, idx: s - 1, stats: statsFor({}), ghost: false })) });
    const input = bots([1, 2, 3]);
    for (let k = 0; k < 900; k++) { game.update(1 / 60, input(1 / 60)); if (k % 60 === 0) { game.draw(g); fx.draw(g); } }
  }
});
