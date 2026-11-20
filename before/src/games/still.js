// STILL LIFE: time only moves when somebody moves. Your body always moves at
// full speed, but bullets, turrets and the sweeping beam run at the speed of
// everyone's combined movement. Stand still and the room freezes; fire while
// frozen and your bullets hang in the air like mines. Gems are everywhere,
// and collecting means moving. At 25 s time refuses to fully stop.
import { TAU, clamp, rand, approach, segDist } from '../engine/util.js';
import { drawPlayer, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { baseStats } from '../game/powers.js';

export const meta = {
  id: 'still', name: 'STILL LIFE', color: '#e8e4f8', music: 'lounge', tier: 2,
  tagline: 'Time only moves when you move',
  objective: 'Most gems wins. The room only moves when someone moves. Stand still and bullets freeze.',
  controls: [['STICK', 'Move (and move time)'], ['X / RT', 'Shoot (frozen shots hang)'], ['A', 'Dash'], ['RB', 'Block']],
  hazards: 'Turrets fire on the beat of time / a beam sweeps the room / hits drop gems / at 25 s time never fully stops',
  ghost: 'Out of sudden death: your movement still moves time',
  tiebreak: 'More gems > fewer hits taken',
  gunUse: 'Your gun (its bullets live in frozen time too)', blockUse: 'Your block and dash', bodyUse: 'Your body',
  twists: ['rubber', 'giant', 'hyper', 'ice', 'wind'],
};

const TOP = 16, BOT = 180;
const TIME = 50;
const TURN = 25;
const LAYOUTS = [
  { name: 'GALLERY', turrets: [[16, 30], [304, 30], [16, 166], [304, 166]] },
  { name: 'THE HALL', turrets: [[160, 22], [160, 174], [16, 98], [304, 98]] },
  { name: 'STUDIO', turrets: [[60, 22], [260, 22], [60, 174], [260, 174]] },
];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  const L = LAYOUTS[ctx.variant % LAYOUTS.length];
  let env = twistEnv(tw, 0);
  let t = 0, wt = 0, endT = null, ts = 0.05, turned = false; // wt = world time
  const starts = [[110, 80], [210, 80], [160, 130]];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const p = {
      seat: pl.seat, idx: pl.idx, x: starts[i][0], y: starts[i][1], vx: 0, vy: 0, r: 5 * st.size, face: 1, aim: 0, act: 0,
      gems: 0, taken: 0, ghost: !!pl.ghost, gs: newGunState(st.gun), dashT: 0, dashCd: 0, blockT: 0, blockCd: 0,
      stun: 0, slowT: 0, invT: 0, flashT: 0, mult: pl.pickupMult ?? 1, shields: st.shields,
    };
    p.pos = () => [p.x, p.y];
    return makeBuffable(p, st);
  });
  const tgun = { ...baseStats().gun, speed: 120, size: 2, ammo: 99, delay: 0.7, reload: 0.1 };
  const turrets = L.turrets.map(([x, y], i) => ({ x, y, a: 0, gs: newGunState(tgun), on: i < 2, pos() { return [this.x, this.y]; } }));
  const beam = { a: 0, len: 150, on: false };
  const gems = [];
  const game = { meta, finished: false, ranking: [], players };
  const live = () => players.filter((p) => !p.ghost);

  const addGem = (x, y, big = false, vx = 0, vy = 0) => gems.push({ x, y, vx, vy, big, t: 0 });
  const freeSpot = () => [rand(24, 296), rand(TOP + 16, BOT - 14)];
  for (let k = 0; k < 7; k++) addGem(...freeSpot());

  function hurt(p, dx, dy, n = 1) {
    if (p.ghost || p.invT > 0) return 'none';
    if (p.blockT > 0) { sound.sfx('block'); fx.ring(p.x, p.y, p.r + 5, '#5affd9'); return 'blocked'; }
    if (p.shields > 0) { p.shields -= 1; p.invT = 0.6; fx.popup('AIRBAG!', p.x, p.y - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
    p.invT = 1; p.stun = 0.25; p.flashT = 0.15; p.taken += 1;
    p.vx += dx * 160 * p.st.knockTaken; p.vy += dy * 160 * p.st.knockTaken;
    const lose = Math.min(p.gems, n); p.gems -= lose;
    for (let k = 0; k < lose; k++) { const a = rand(0, TAU); addGem(p.x, p.y, false, Math.cos(a) * 90, Math.sin(a) * 90); }
    if (lose) fx.popup(`-${lose}`, p.x, p.y - 14, '#ff5a5a', 1);
    fx.shake(0.2); sound.sfx('hit'); fx.burst(p.x, p.y, 10, SEAT_COLORS[p.idx], { speed: 90, life: 0.4 });
    return 'hit';
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: BOT, open: {} },
    accel: () => [env.wind, 0],
    solidAt: () => null,
    targets: () => live().map((p) => ({ ref: p, owner: p, x: p.x, y: p.y, r: p.r })),
    onHit: (p, info) => {
      if (p.blockT > 0 && p.st.reflect && info.kind === 'bullet') return 'reflect';
      return hurt(p, info.dx, info.dy, info.owner && info.owner.seat ? 1 : 2) === 'none' ? 'none' : 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega'], spot: freeSpot });

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    if (!turned && t >= TURN) {
      turned = true; for (const q of turrets) q.on = true; beam.on = true;
      fx.popup("TIME WON'T STOP", 160, 60, '#ff5a5a', 2); sound.sfx('warn'); fx.flash('#e8e4f8', 0.25);
    }
    if (!beam.on && t >= 12) { beam.on = true; fx.popup('THE BEAM WAKES UP', 160, 60, '#ff5fd2', 1); }
    // 1) players move in real time, and their movement is the clock
    let act = 0;
    for (const p of players) {
      const c = controls.get(p.seat);
      tickBuffs(p, dt);
      p.dashCd -= dt; p.blockT -= dt; p.blockCd -= dt; p.slowT -= dt; p.flashT -= dt; p.invT -= dt;
      const max = 84 * p.st.speed * (p.slowT > 0 ? 0.55 : 1);
      if (p.dashT > 0) p.dashT -= dt;
      else if (p.stun > 0) { p.stun -= dt; p.vx *= Math.pow(0.1, dt); p.vy *= Math.pow(0.1, dt); }
      else {
        const acc = env.ice ? 170 : 900;
        p.vx = approach(p.vx, c.mx * max, acc * dt); p.vy = approach(p.vy, c.my * max, acc * dt);
        if (c.jumpP && p.dashCd <= 0) {
          const m = Math.hypot(c.mx, c.my); const dx = m > 0.2 ? c.mx / m : p.face, dy = m > 0.2 ? c.my / m : 0;
          p.vx = dx * 250; p.vy = dy * 250; p.dashT = 0.14; p.dashCd = 1.2 * p.st.blockCd; sound.sfx('dash');
        }
      }
      if (c.blockP && p.blockCd <= 0 && !p.ghost) { p.blockT = 0.45; p.blockCd = 2.6 * p.st.blockCd; sound.sfx('block'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      p.x = clamp(p.x + p.vx * dt, p.r, 320 - p.r); p.y = clamp(p.y + p.vy * dt, TOP + p.r, BOT - p.r);
      p.act = clamp(Math.hypot(p.vx, p.vy) / Math.max(1, max), 0, 1) + (p.dashT > 0 ? 1 : 0);
      act += p.act;
      p.aim = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.3 ? Math.atan2(c.my, c.mx) : (p.face > 0 ? 0 : Math.PI);
      p.fire = c.fire && p.stun <= 0 && !p.ghost;
    }
    const target = clamp(act / Math.max(1, players.length) * 1.4, turned ? 0.3 : 0.04, 1);
    ts += (target - ts) * Math.min(1, dt * 10);
    const wdt = dt * ts;
    wt += wdt;
    // 2) the world moves in world time
    for (const p of players) {
      // your trigger works in real time (so you can lay mines), your bullets fly in world time
      guns.trigger(p, p.gs, p.st.gun, p.fire, p.aim, p.x + Math.cos(p.aim) * 6, p.y + Math.sin(p.aim) * 6, dt);
    }
    for (const q of turrets) {
      if (!q.on) continue;
      let best = null, bd = 1e9;
      for (const p of live()) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; best = p; } }
      if (best) { const want = Math.atan2(best.y - q.y, best.x - q.x); let d = want - q.a; d = Math.atan2(Math.sin(d), Math.cos(d)); q.a += clamp(d, -1.6 * wdt, 1.6 * wdt); }
      guns.trigger(q, q.gs, tgun, true, q.a, q.x + Math.cos(q.a) * 7, q.y + Math.sin(q.a) * 7, wdt);
    }
    if (beam.on) {
      beam.a += 0.7 * wdt;
      const ex = 160 + Math.cos(beam.a) * beam.len, ey = 98 + Math.sin(beam.a) * beam.len;
      for (const p of live()) if (segDist(p.x, p.y, 160, 98, ex, ey) < p.r + 1.5 && Math.hypot(p.x - 160, p.y - 98) > 12) hurt(p, Math.cos(beam.a + Math.PI / 2), Math.sin(beam.a + Math.PI / 2), 2);
    }
    guns.update(wdt);
    // gems
    for (let i = gems.length - 1; i >= 0; i--) {
      const gm = gems[i];
      gm.t += dt; gm.x += gm.vx * wdt; gm.y += gm.vy * wdt; gm.vx *= Math.pow(0.05, wdt); gm.vy *= Math.pow(0.05, wdt);
      gm.x = clamp(gm.x, 6, 314); gm.y = clamp(gm.y, TOP + 6, BOT - 6);
      if (gm.t < 0.4) continue;
      const p = live().find((o) => Math.hypot(o.x - gm.x, o.y - gm.y) < o.r + 5);
      if (!p) continue;
      const v = gm.big ? 3 : 1; p.gems += v; gems.splice(i, 1); sound.sfx('coin');
      fx.popup(`+${v}`, gm.x, gm.y - 8, gm.big ? '#ffd84a' : '#e8e4f8', 1);
    }
    if (gems.filter((g) => g.t > 0.4).length < 6 && Math.random() < dt * 2) addGem(...freeSpot());
    if (Math.floor((t - dt) / 10) !== Math.floor(t / 10)) { const [x, y] = freeSpot(); addGem(x, y, true); fx.popup('BIG GEM!', x, y - 10, '#ffd84a', 1); }
    pickups.update(dt, live().map((p) => ({ p, x: p.x, y: p.y, r: p.r + 2, mult: p.mult })));
    if (endT === null && t >= TIME) endT = 1.2;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    return [...live().sort((a, b) => (b.gems - a.gems) || (a.taken - b.taken)), ...players.filter((p) => p.ghost)].map((p) => p.seat);
  }
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.ghost ? 'DRIFTER' : `${p.gems} GEMS`; };
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p) return null;
    let best = null, bd = 1e9;
    for (const gm of gems) { const d = Math.hypot(gm.x - p.x, gm.y - p.y) - (gm.big ? 40 : 0); if (d < bd) { bd = d; best = gm; } }
    return best ? [best.x, best.y] : null;
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });
  Object.defineProperty(game, 'timeScale', { get: () => ts });

  game.draw = (g) => {
    // the frozen world drains of colour
    const k = clamp(ts, 0, 1);
    const shade = (a, b) => (k > 0.5 ? a : b);
    g.rect(0, 0, 320, 180, shade('#141024', '#18181c'), true);
    for (let y = TOP; y < BOT; y += 16) for (let x = 0; x < 320; x += 16) if (((x + y) / 16) % 2) g.rect(x, y, 16, 16, shade('#1a1530', '#1e1e24'), true);
    g.text(L.name, 160, 26, { scale: 1, col: '#e8e4f844', align: 'center', ui: false, shadow: null });
    // the time meter: the clock face everyone shares
    g.rect(110, TOP + 2, 100, 4, '#2a2838');
    g.rect(110, TOP + 2, 100 * k, 4, k < 0.15 ? '#9fd3ff' : k < 0.6 ? '#e8e4f8' : '#ff5fd2');
    g.text(k < 0.12 ? 'FROZEN' : `TIME ${Math.round(k * 100)}%`, 160, TOP + 8, { scale: 1, col: k < 0.12 ? '#9fd3ff' : '#e8e4f8', align: 'center', ui: false, shadow: null });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + wt * 0.5; g.rect(160 + Math.cos(a) * 9 - 0.5, 98 + Math.sin(a) * 9 - 0.5, 1, 1, '#5a5670'); }
    g.circle(160, 98, 3, '#e8e4f8');
    if (beam.on) {
      const ex = 160 + Math.cos(beam.a) * beam.len, ey = 98 + Math.sin(beam.a) * beam.len;
      g.alpha(0.35); g.beam(160, 98, ex, ey, 5, '#ff5fd2'); g.alpha(1); g.beam(160, 98, ex, ey, 1.5, '#ffffff');
    }
    for (const q of turrets) {
      g.circle(q.x, q.y, 6, q.on ? '#3a3450' : '#24222e'); g.ring(q.x, q.y, 6, q.on ? '#e8e4f8' : '#5a5670');
      if (q.on) g.beam(q.x, q.y, q.x + Math.cos(q.a) * 9, q.y + Math.sin(q.a) * 9, 2.5, '#e8e4f8');
    }
    for (const gm of gems) {
      const s = gm.big ? 4 : 2.5, bob = Math.sin(wt * 5 + gm.x) * 1, col = gm.big ? '#ffd84a' : '#9fd3ff';
      g.rect(gm.x - s / 2, gm.y - s + bob, s, s * 2, col); g.rect(gm.x - s, gm.y - s / 2 + bob, s * 2, s, col);
    }
    pickups.draw(g);
    guns.draw(g);
    for (const p of players) {
      const blink = p.invT > 0 && Math.floor(t * 16) % 2;
      g.alpha(0.3); g.rect(p.x - 4, p.y + p.r - 1, 8, 2, '#000'); g.alpha(1);
      drawPlayer(g, p.idx, p.x, p.y + p.r, { flip: p.face < 0, size: p.st.size * 0.9, flash: p.flashT > 0, alpha: p.ghost ? 0.35 : blink ? 0.4 : 1, look: p.aim });
      if (p.blockT > 0) g.ring(p.x, p.y, p.r + 4, '#5affd9');
      // how much of time this player is driving
      if (p.act > 0.05) { g.alpha(0.5); g.ring(p.x, p.y, p.r + 3 + p.act * 3, SEAT_COLORS[p.idx]); g.alpha(1); }
      drawBuffs(g, p, p.x, p.y + p.r + 2);
      if (!p.ghost) drawTag(g, p.idx, p.x, p.y - 12 * p.st.size - 2);
    }
  };
  return game;
}
