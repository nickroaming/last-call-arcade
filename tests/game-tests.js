// Match rules, power stacking, and robot playthroughs of every minigame.
import { Match, makePlaylist, POINTS } from '../src/game/match.js';
import { POWERS, statsFor, MAX_STACK, cardLines, cardWhere, pickupMult, withBuffs } from '../src/game/powers.js';
import { Guns, newGunState } from '../src/game/weapons.js';
import { TWISTS } from '../src/game/twists.js';
import { Fx, FLASH_GAP, FLASH_MAX } from '../src/engine/fx.js';
import { Drift, DRIFT_MODES } from '../src/engine/style.js';
import { Gfx } from '../src/engine/gfx.js';
import { NO_SOUND } from '../src/engine/audio.js';
import { NO_CONTROLS } from '../src/game/controls.js';
import * as rumble from '../src/games/rumble.js';
import * as dustlap from '../src/games/dustlap.js';
import * as lounge from '../src/games/lounge.js';
import * as coins from '../src/games/coins.js';
import * as orbit from '../src/games/orbit.js';
import * as blastball from '../src/games/blastball.js';
import * as splat from '../src/games/splat.js';
import * as tick from '../src/games/tick.js';
import * as updraft from '../src/games/updraft.js';
import * as lightsout from '../src/games/lightsout.js';
import * as mobius from '../src/games/mobius.js';
import * as echo from '../src/games/echo.js';
import * as mirror from '../src/games/mirror.js';
import * as wormhole from '../src/games/wormhole.js';
import * as rules from '../src/games/rules.js';
import * as still from '../src/games/still.js';
import { Bot } from '../src/game/bots.js';

const GAMES = { rumble, dustlap, lounge, coins, orbit, blastball, splat, tick, updraft, lightsout, mobius, echo, mirror, wormhole, rules, still };
export const results = [];
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message + (e.stack ? ' @ ' + e.stack.split('\n')[1] : '') }); } }
function eq(a, b, msg = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
function ok(v, msg = 'expected true') { if (!v) throw new Error(msg); }

// ---- match ----
test('playlist: 8 events from 10 games, no repeats needed, no back-to-back', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  for (let k = 0; k < 300; k++) {
    const p = makePlaylist(ids, 2, Math.random, 8);
    eq(p.length, 8);
    ok(p.every((g, i) => i === 0 || g !== p[i - 1]), p.join());
    eq(new Set(p).size, 8, 'all different');
    ids.forEach((g) => ok(p.filter((x) => x === g).length <= 2));
  }
});
test('playlist in acts: grounded first, mind-bending last, no repeats', () => {
  const tier = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 2, g: 2, h: 3, i: 3, j: 3 };
  for (let k = 0; k < 200; k++) {
    const p = makePlaylist(Object.keys(tier), 2, Math.random, 8, (id) => tier[id]);
    eq(p.length, 8); eq(new Set(p).size, 8, 'no repeats');
    ok(p.every((g, i) => i === 0 || tier[g] >= tier[p[i - 1]]), 'acts in order: ' + p.join());
    ok(tier[p[7]] === 3, 'ends in act 3');
  }
  const short = makePlaylist(['a', 'b', 'h'], 2, Math.random, 3, (id) => tier[id]);
  eq(short.length, 3);
});
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
  m.pick(1, 'rubber'); m.pick(1, 'rubber');
  eq(m.pick(1, 'rubber'), false, 'third stack refused');
  for (let k = 0; k < 100; k++) ok(!m.offer(1).includes('rubber'), 'capped power offered');
});
test('powers stack across events and reset on rematch', () => {
  const m = new Match([1, 2], ['rumble', 'coins']);
  m.pick(2, 'rubber'); m.award([1, 2]); m.advance(); m.pick(2, 'rubber');
  eq(m.stats(2).gun.bounces, 4);
  m.reset();
  eq(m.player(2).powers, {}); eq(m.player(2).points, 0); eq(m.stats(2).gun.bounces, 0); eq(m.eventIdx, 0); eq(m.player(1).tipsy, 0);
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
test('every card has lines, a rarity, and says where it works in every game', () => {
  for (const p of POWERS) {
    ok(p.lines.length >= 1 && p.lines.length <= 3, p.id);
    ok(['common', 'uncommon', 'rare'].includes(p.rarity), p.id);
    cardLines(p).forEach((l) => ok(/^[+-]/.test(l.text), p.id + ' line ' + l.text));
    for (const g of Object.values(GAMES)) ok(cardWhere(p, g.meta).length > 3, `${p.id} ${g.meta.id}`);
  }
  ok(POWERS.length >= 30);
});
test('stats: health has a floor; stacking is capped', () => {
  ok(statsFor({ glass: 2, tiny: 2, leech: 2 }).hp >= 25);
  eq(statsFor({ rubber: 5 }).gun.bounces, 2 * MAX_STACK);
});
test("winner's curse: winner gets tipsy, others sober up, tipsy hurts stats", () => {
  const m = new Match([1, 2, 3], ['rumble']);
  m.award([1, 2, 3]); m.award([1, 3, 2]);
  eq(m.player(1).tipsy, 2); eq(m.player(2).tipsy, 0);
  m.award([2, 1, 3]);
  eq(m.player(1).tipsy, 1); eq(m.player(2).tipsy, 1);
  m.award([1, 2, 3]); m.award([1, 2, 3]); m.award([1, 2, 3]);
  eq(m.player(1).tipsy, 3, 'capped at 3');
  const s = statsFor({}, { tipsy: 3 });
  ok(s.gun.sway > 0 && s.blockCd > 1 && s.speed < 1);
});
test('pickups help last place 2x and the tipsy leader least', () => {
  eq(pickupMult(2, 3, 0), 2);
  ok(pickupMult(0, 3, 0) < 1);
  ok(pickupMult(0, 3, 3) < pickupMult(0, 3, 0));
  const b = statsFor({});
  ok(withBuffs(b, [{ type: 'rapid', mult: 2 }]).gun.delay < withBuffs(b, [{ type: 'rapid', mult: 0.6 }]).gun.delay);
});
test('every twist used by a game exists', () => {
  for (const g of Object.values(GAMES)) for (const id of g.meta.twists || []) ok(TWISTS[id], `${g.meta.id} ${id}`);
});

// ---- gun physics ----
function gunWorld(extra = {}) {
  const hits = [];
  const target = { ref: 'T', owner: { idx: 1 }, x: 300, y: 50, r: 4 };
  const w = {
    bounds: { x0: 0, y0: 0, x1: 320, y1: 180, open: {} }, accel: () => [0, 0], solidAt: () => null,
    targets: () => [target], onHit: (ref, info) => { hits.push(info); return 'hit'; }, ...extra,
  };
  return { w, hits, target };
}
const fx0 = () => new Fx();
test('bullets with no bounces die on the arena wall; with bounces they come back', () => {
  const { w } = gunWorld();
  const g = statsFor({}).gun;
  const guns = new Guns(w, fx0(), NO_SOUND);
  guns.spawn({ idx: 0 }, 10, 120, Math.PI, g);
  for (let k = 0; k < 30; k++) guns.update(1 / 60);
  eq(guns.bullets.length, 0, 'dies on wall');
  const g2 = statsFor({ rubber: 1 }).gun;
  guns.spawn({ idx: 0 }, 10, 120, Math.PI, g2);
  for (let k = 0; k < 30; k++) guns.update(1 / 60);
  eq(guns.bullets.length, 1, 'bounced');
  ok(guns.bullets[0].vx > 0, 'now moving right');
  ok(guns.bullets[0].dmg > g.dmg, 'rubber +25%');
});
test('bank shot grows damage per bounce; splitter doubles bullets on bounce', () => {
  const { w } = gunWorld();
  const guns = new Guns(w, fx0(), NO_SOUND);
  const g = statsFor({ bankshot: 1, splitter: 1 }).gun;
  guns.spawn({ idx: 0 }, 10, 120, Math.PI, g);
  for (let k = 0; k < 20; k++) guns.update(1 / 60);
  eq(guns.bullets.length, 2, 'split on first bounce');
  ok(guns.bullets[0].dmg > g.dmg * 1.5, 'bounce damage');
});
test('sticky bullets stick to walls, then explode', () => {
  let blasted = 0;
  const { w } = gunWorld({ onBlast: () => { blasted++; } });
  const guns = new Guns(w, fx0(), NO_SOUND);
  const g = statsFor({ stickybomb: 1 }).gun;
  guns.spawn({ idx: 0 }, 160, 90, 0, { ...g, ghost: false });
  w.solidAt = (x) => (x > 200 ? { rect: { x: 200, y: 0, w: 20, h: 180 } } : null);
  for (let k = 0; k < 30; k++) guns.update(1 / 60);
  ok(guns.bullets[0] && guns.bullets[0].stuck, 'stuck');
  for (let k = 0; k < 80; k++) guns.update(1 / 60);
  eq(guns.bullets.length, 0); eq(blasted, 1);
});
test('smart ricochet turns toward the target after a bounce and hits it', () => {
  const { w, hits } = gunWorld();
  const guns = new Guns(w, fx0(), NO_SOUND);
  const g = statsFor({ smart: 1 }).gun;
  guns.spawn({ idx: 0 }, 20, 150, Math.PI * 0.9, g);
  for (let k = 0; k < 120 && !hits.length; k++) guns.update(1 / 60);
  eq(hits.length, 1);
});
test('ammo empties, then reload refills it', () => {
  const { w } = gunWorld();
  const guns = new Guns(w, fx0(), NO_SOUND);
  const g = statsFor({}).gun;
  const gs = newGunState(g);
  let shots = 0;
  for (let k = 0; k < 90; k++) if (guns.trigger({ idx: 0 }, gs, g, true, 0, 100, 90, 1 / 60)) shots++;
  eq(shots, 3 + 0, 'three shots, then reloading (first 1.5 s)');
  for (let k = 0; k < 60; k++) guns.trigger({ idx: 0 }, gs, g, false, 0, 100, 90, 1 / 60);
  eq(gs.ammo, g.ammo);
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
function playthrough(id, opts = {}) {
  const { powers = {}, ghosts = [], variant = 0, n = 3 } = opts;
  const fx = new Fx();
  const seats = [1, 2, 3].slice(0, n);
  const game = GAMES[id].create({
    fx, sound: NO_SOUND, variant,
    twist: opts.twist || null,
    players: seats.map((s) => ({ seat: s, idx: s - 1, stats: statsFor(powers[s] || {}, { tipsy: s === 1 ? 2 : 0 }), ghost: ghosts.includes(s), pickupMult: 1 })),
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
  test(`${id}: robots finish with a full ranking (several variants)`, () => {
    for (const v of [0, 1, 2, 3, 4, 5]) {
      const { game, secs } = playthrough(id, { variant: v });
      ok(game.finished, `${id} did not finish (v${v})`);
      eq(game.ranking.slice().sort(), [1, 2, 3], 'ranking');
      ok(secs <= 62, `${id} took ${secs}s`);
    }
  });
  test(`${id}: survives every power stacked twice`, () => {
    const all = Object.fromEntries(POWERS.map((p) => [p.id, 2]));
    const { game } = playthrough(id, { powers: { 1: all, 2: { pinball: 2, splitter: 2, boomstick: 2, seeker: 2 }, 3: { stickybomb: 1, boomerang: 1, scatter: 2, tripletap: 1 } } });
    ok(game.finished);
    eq(game.ranking.length, 3);
  });
  test(`${id}: every allowed twist runs`, () => {
    for (const tw of GAMES[id].meta.twists) {
      const { game } = playthrough(id, { twist: { id: tw, ...TWISTS[tw] } });
      ok(game.finished, tw);
    }
  });
  test(`${id}: 2-player game works`, () => {
    const { game } = playthrough(id, { n: 2 });
    ok(game.finished); eq(game.ranking.slice().sort(), [1, 2]);
  });
}
test('rule breaker: pushing a word into a blank changes the rule', () => {
  const fx = new Fx();
  const game = GAMES.rules.create({ fx, sound: NO_SOUND, variant: 0, players: [1, 2, 3].map((s) => ({ seat: s, idx: s - 1, stats: statsFor({}), pickupMult: 1 })) });
  const still = new Map([1, 2, 3].map((s) => [s, NO_CONTROLS]));
  game.update(1 / 60, still);
  eq(game.rules().STICK, 'NORMAL', 'starts with STICK IS NORMAL');
  const stick = game.sentences.find((s) => s.id === 'STICK');
  const tiny = game.tiles.find((q) => q.word === 'TINY');
  const normal = game.tiles.find((q) => q.word === 'NORMAL');
  normal.x = 150; normal.y = 100; tiny.x = stick.slot.x; tiny.y = stick.slot.y;
  game.update(1 / 60, still);
  eq(game.rules().STICK, 'TINY');
  ok(game.mods(game.players[0]).size < 1, 'STICK IS TINY shrinks everyone');
  // a player walking into a word pushes it
  const p = game.players[0]; const w = game.tiles.find((q) => q.word === 'ICE');
  p.x = w.x - 8; p.y = w.y + w.h / 2; const x0 = w.x;
  for (let k = 0; k < 30; k++) game.update(1 / 60, new Map([[1, { ...NO_CONTROLS, mx: 1 }], [2, NO_CONTROLS], [3, NO_CONTROLS]]));
  ok(w.x > x0 + 5, 'the word moved right');
});
test('wormhole: standing on your floor hole sends you out of your wall hole, fast', () => {
  const fx = new Fx();
  const game = GAMES.wormhole.create({ fx, sound: NO_SOUND, variant: 0, players: [1, 2].map((s) => ({ seat: s, idx: s - 1, stats: statsFor({}), pickupMult: 1 })) });
  const still = new Map([1, 2].map((s) => [s, NO_CONTROLS]));
  const p = game.players[0];
  p.holes = [{ x: 60, y: 164, nx: 0, ny: -1, owner: p, slot: 0, born: 0 }, { x: 8, y: 100, nx: 1, ny: 0, owner: p, slot: 1, born: 0 }];
  p.b.x = 60 - p.b.w / 2; p.b.y = 164 - p.b.h; p.b.vy = 0;
  game.update(1 / 60, still);
  ok(Math.abs(p.b.y + p.b.h / 2 - 100) < 4, 'came out at the wall hole height, y=' + p.b.y);
  ok(p.b.x < 30 && p.b.vx > 100, `flung out of the wall: x=${p.b.x.toFixed(1)} vx=${p.b.vx.toFixed(0)}`);
});
test('rooftop is a best-of: 2+ rounds, first to 2 wins, under the cap (F-01)', () => {
  for (let v = 0; v < 5; v++) {
    const { game, secs } = playthrough('rumble', { variant: v });
    ok(game.finished, 'finished');
    ok(game.round >= 2, `only ${game.round} round(s) in v${v}`);
    const wins = game.players.map((p) => p.wins);
    ok(Math.max(...wins) >= 2 || game.round >= 5 || secs >= 55, `no winner reached 2: ${wins}`);
    ok(secs <= 62, `took ${secs}s`);
    eq(game.ranking[0], game.players.slice().sort((a, b) => b.wins - a.wins)[0].seat, 'most round wins ranks first');
  }
});
test('rooftop: a sudden-death ghost never respawns between rounds', () => {
  const { game } = playthrough('rumble', { ghosts: [3] });
  const g3 = game.players.find((p) => p.seat === 3);
  ok(g3.dead && g3.wins === 0, 'seat 3 stayed a ghost');
});
test('full-screen flashes are rate- and brightness-limited (F-08)', () => {
  const fx = new Fx();
  fx.flash('#fff', 0.9);
  ok(fx.flashA <= FLASH_MAX + 1e-9, 'capped brightness');
  fx.update(0.1); const a1 = fx.flashA; fx.flash('#fff', 0.9);
  eq(fx.flashA, a1, 'a second flash inside the gap is ignored');
  fx.update(FLASH_GAP); fx.flash('#fff', 0.9);
  ok(fx.flashA > 0.2, 'allowed again after the gap');
  const calm = new Fx(); calm.calm = true; calm.flash('#fff', 1); calm.shake(1);
  eq(calm.flashA, 0, 'calm mode: no flash'); eq(calm.trauma, 0, 'calm mode: no shake');
});
test('colour drift never touches players, hazards or HUD (F-07)', () => {
  const d = new Drift();
  for (const mode of ['calm', 'bold']) {
    d.setMode(mode);
    for (let t = 0; t < 60; t += 3.7) {
      d.t = t;
      eq(d.col('#ff9a2e', 'player'), '#ff9a2e'); eq(d.col('#ff4a4a', 'hazard'), '#ff4a4a');
      ok(Math.abs(d.offset()) <= DRIFT_MODES[mode].amp + 1e-9, 'within amplitude');
    }
  }
  d.setMode('off'); d.t = 12; eq(d.offset(), 0);
});
test('rumble sudden death: ghosts start out and rank last', () => {
  const { game } = playthrough('rumble', { ghosts: [3] });
  ok(game.finished);
  eq(game.ranking[2], 3);
});
test('CPU bots drive every game to a finish', () => {
  for (const id of Object.keys(GAMES)) {
    const fx = new Fx();
    const game = GAMES[id].create({ fx, sound: NO_SOUND, variant: 1, players: [1, 2, 3].map((s) => ({ seat: s, idx: s - 1, stats: statsFor({}), pickupMult: 1 })) });
    const bots = [1, 2, 3].map(() => new Bot());
    let n = 0;
    while (!game.finished && n < 60 * 80) {
      const m = new Map();
      bots.forEach((b, k) => {
        b.think({ screen: 'play', dt: 1 / 60, game, seatN: k + 1 });
        const pd = b.pad();
        const btn = (i) => pd.buttons[i].pressed;
        m.set(k + 1, { ...NO_CONTROLS, mx: pd.axes[0], my: pd.axes[1], ax: pd.axes[2], ay: pd.axes[3], aim: Math.hypot(pd.axes[2], pd.axes[3]) > 0.35, jump: btn(0), jumpP: btn(0), fire: btn(2), fireP: btn(2), block: btn(5), blockP: btn(5) });
      });
      fx.update(1 / 60); game.update(1 / 60, m); n++;
    }
    ok(game.finished, id + ' did not finish with bots');
  }
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

// ---- core pass (build .9-core) ----
for (const id of ['orbit', 'mobius']) {
  test(`${id} is a best-of like Rooftop: 2+ rounds, most round wins ranks first, under the cap (B-03)`, () => {
    for (let v = 0; v < 3; v++) {
      const { game, secs } = playthrough(id, { variant: v });
      ok(game.finished, 'finished');
      ok(game.round >= 2, `only ${game.round} round(s) in v${v}`);
      ok(secs <= 62, `took ${secs}s`);
      eq(game.ranking[0], game.players.slice().sort((a, b) => b.wins - a.wins)[0].seat, 'most round wins ranks first');
      ok(game.hudInfo(1).pipMax === 2, 'HUD shows round pips');
    }
  });
  test(`${id}: a sudden-death ghost never respawns between rounds`, () => {
    const { game } = playthrough(id, { ghosts: [3] });
    const g3 = game.players.find((p) => p.seat === 3);
    ok(g3.dead && g3.wins === 0, 'seat 3 stayed a ghost');
  });
}
test('orbit: all three arenas run, including twin planets', () => {
  const names = new Set();
  for (let v = 0; v < 3; v++) { const { game } = playthrough('orbit', { variant: v }); ok(game.finished); names.add(game.layoutName); }
  eq([...names].sort(), ['GAS GIANT', 'OUTPOST', 'TWIN PLANETS']);
});
test('wormhole: a player who never fights cannot win a tie on hits taken', () => {
  const fx = new Fx();
  const game = GAMES.wormhole.create({ fx, sound: NO_SOUND, variant: 0, players: [1, 2].map((s) => ({ seat: s, idx: s - 1, stats: statsFor({}), pickupMult: 1 })) });
  const [a, b] = game.players;
  a.held = 0.4; b.held = 0.2; a.taken = 0; b.taken = 3; b.landed = 2; a.landed = 0;
  let n = 0; while (!game.finished && n < 60 * 70) { game.update(1 / 60, new Map([[1, NO_CONTROLS], [2, NO_CONTROLS]])); n++; }
  // neither held the orb a whole second: the one who landed hits wins, not the one who hid
  if (Math.floor(a.held) === Math.floor(b.held)) eq(game.ranking[0], 2);
});
test('impact: the freeze grows with damage and is capped', () => {
  const fx = new Fx();
  fx.impact(10, 10, { dmg: 10 }); const small = fx.hitstop;
  const fx2 = new Fx(); fx2.impact(10, 10, { dmg: 60 }); const big = fx2.hitstop;
  ok(big > small, 'bigger hit, longer freeze');
  const fx3 = new Fx(); fx3.impact(10, 10, { dmg: 999 }); ok(fx3.hitstop <= 0.1 + 1e-9, 'capped at 100 ms');
  const fx4 = new Fx(); fx4.calm = true; fx4.impact(10, 10, { dmg: 40 }); eq(fx4.trauma, 0, 'calm mode: no shake');
});
test('core set: real events, three per act, enough for an 8-event night with no repeats', () => {
  const core = ['rumble', 'coins', 'tick', 'orbit', 'lightsout', 'mirror', 'mobius', 'wormhole', 'rules'];
  const tiers = core.map((id) => GAMES[id].meta.tier || 1);
  eq([1, 2, 3].map((t) => tiers.filter((x) => x === t).length), [3, 3, 3]);
  for (const id of core) ok(GAMES[id].meta.card, `${id} has a short intro card`);
  for (let k = 0; k < 100; k++) {
    const p = makePlaylist(core, 2, Math.random, 8, (id) => GAMES[id].meta.tier || 1);
    eq(new Set(p).size, 8, 'no repeats');
  }
});
test('intro cards fit on screen at reading size', () => {
  const g = new Gfx(document.createElement('canvas'));
  for (const [id, m] of Object.entries(GAMES)) {
    if (!m.meta.card) continue;
    const c = m.meta.card;
    ok(g.textW(c.rule, 2) <= 300, `${id} rule too wide`);
    ok(g.textW(c.rule2, 2) <= 300, `${id} rule2 too wide`);
    ok(g.textW('DANGER ' + c.danger, 2) <= 300, `${id} danger too wide`);
  }
});
