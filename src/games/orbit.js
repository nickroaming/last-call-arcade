// ORBIT OUTPOST: a shootout on tiny planets with their own gravity.
// Run all the way around; bullets fall toward the nearest planet and curve
// into orbits. A short best-of: last one standing (who landed a hit) takes the
// round, first to 2. Three arenas: one planet, twin planets, a gas giant.
import { TAU, clamp, rand, approach } from '../engine/util.js';
import { drawPlayer, drawGun, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState, hitEffects, tickStatus } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { Drift, P } from '../engine/style.js';
import { makeRounds } from '../game/rounds.js';

export const meta = {
  id: 'orbit', name: 'ORBIT OUTPOST', color: '#b48cff', music: 'lounge', tier: 2,
  tagline: 'Tiny planets with their own gravity',
  broken: 'GRAVITY', // the rule the Cabinet breaks in this event
  objective: 'Last one standing takes the round, if they landed a hit. First to 2. Bullets curve into orbits.',
  card: { rule: 'RUN ALL THE WAY AROUND THE PLANET', rule2: 'LAST STANDING + A HIT = ROUND. FIRST TO 2', keys: [['A', 'JUMP'], ['X', 'SHOOT'], ['RB', 'BLOCK']], danger: 'MOONS, METEORS, FIRE VENTS' },
  controls: [['STICK', 'Run around the planet / aim'], ['A', 'Jump (double jump)'], ['X / RT', 'Shoot'], ['RB', 'Block'], ['R-STICK', 'Aim freely']],
  hazards: 'Moons on orbit / marked meteor strikes / fire vents from 8 s each round',
  ghost: 'Knocked out: become a satellite and shoot down. Back next round',
  tiebreak: 'More round wins > longer survived > more health',
  gunUse: 'Your gun (bullets orbit the planet)', blockUse: 'Your block (RB)', bodyUse: 'Your body',
  twists: ['moon', 'heavy', 'wind', 'rubber', 'bullettime', 'giant', 'warp', 'hyper'],
};

const HAZ = 34;
const VENTS_AT = 8;     // fire vents wake this far into each round (the round's escalation)
export const ARENAS = [
  { name: 'OUTPOST', planets: [{ x: 160, y: 100, r: 32, vents: [0.4, 2.5, 4.6] }],
    moons: [{ cx: 160, cy: 100, orbit: 62, a: 0, w: 0.55, r: 7 }, { cx: 160, cy: 100, orbit: 80, a: Math.PI, w: -0.42, r: 6 }] },
  { name: 'TWIN PLANETS', planets: [{ x: 92, y: 104, r: 25, vents: [-1.2, 1.9] }, { x: 228, y: 96, r: 25, vents: [1.2, 4.4] }],
    moons: [{ cx: 160, cy: 100, orbit: 30, a: 0, w: 0.9, r: 6 }] },
  { name: 'GAS GIANT', planets: [{ x: 160, y: 122, r: 44, vents: [-0.6, -2.5, 0.9, 2.3] }],
    moons: [{ cx: 160, cy: 122, orbit: 70, a: 0.5, w: 0.5, r: 6 }, { cx: 160, cy: 122, orbit: 70, a: 3.6, w: 0.5, r: 6 }] },
];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  const A = ARENAS[ctx.variant % ARENAS.length];
  const planets = A.planets.map((p) => ({ ...p }));
  const drift = ctx.drift || new Drift();
  let env = twistEnv(tw, 0);
  let t = 0;
  const nearest = (x, y) => { let best = planets[0], bd = 1e9; for (const pl of planets) { const d = Math.hypot(x - pl.x, y - pl.y) - pl.r; if (d < bd) { bd = d; best = pl; } } return best; };
  const ring = 88;
  const SAT = { x: 160, y: 98 };

  const players = ctx.players.map((pl) => {
    const st = pl.stats;
    const p = {
      seat: pl.seat, idx: pl.idx, x: 160, y: 40, vx: 0, vy: 0, home: planets[0],
      r: 5 * st.size, onGround: false, jumps: 1, stun: 0, face: 1, hp: st.hp, maxHp: st.hp, dead: !!pl.ghost, deathT: pl.ghost ? -1 : null,
      perma: !!pl.ghost, gs: newGunState(st.gun), blockT: 0, blockCd: 0, shields: st.shields, hurtT: 0, flashT: 0, slowT: 0, poison: null,
      mult: pl.pickupMult ?? 1, sat: { a: -Math.PI / 2, cd: 1 }, squash: 0, recoil: 0, aim: 0,
    };
    p.pos = () => (p.dead ? satPos(p) : [p.x, p.y]);
    return makeBuffable(p, st);
  });
  const moons = A.moons.map((m) => ({ ...m }));
  const placeMoons = () => moons.forEach((m) => { m.x = m.cx + Math.cos(m.a) * m.orbit; m.y = m.cy + Math.sin(m.a) * m.orbit; });
  placeMoons();
  const meteors = [];
  const vents = planets.flatMap((pl) => pl.vents.map((a) => ({ pl, a, state: 'idle', t: rand(0.5, 2.5) })));
  let meteorT = 4, ventsSaid = false;
  const stars = Array.from({ length: 70 }, () => ({ x: rand(0, 320), y: rand(15, 180), s: Math.random() < 0.15 ? 2 : 1 }));
  const game = { meta, finished: false, ranking: [], players, layoutName: A.name };
  const alive = () => players.filter((p) => !p.dead);
  function satPos(p) { return [clamp(SAT.x + Math.cos(p.sat.a) * ring * 1.5, 8, 312), clamp(SAT.y + Math.sin(p.sat.a) * ring * 0.82, 20, 174)]; }

  const R = makeRounds({
    players, fx, sound, drift, cap: 22, time: 54,
    onReset: (p, k, round) => {
      const pl = planets[(k + round - 1) % planets.length];
      const n = Math.max(1, players.filter((q) => !q.perma).length);
      const a = -Math.PI / 2 + (planets.length > 1 ? 0 : (k - (n - 1) / 2) * 2.1) + (planets.length > 1 && k >= planets.length ? Math.PI : 0) + (round - 1) * 0.7;
      p.home = pl; p.x = pl.x + Math.cos(a) * (pl.r + p.r + 1); p.y = pl.y + Math.sin(a) * (pl.r + p.r + 1);
      p.vx = 0; p.vy = 0; p.stun = 0; p.hurtT = R.shield; p.blockT = 0; p.sat.cd = 0; p.onGround = true;
      fx.ring(p.x, p.y, 14, SEAT_COLORS[p.idx], 0.5);
      meteors.length = 0; meteorT = 4; ventsSaid = false; guns.bullets.length = 0;
      for (const v of vents) { v.state = 'idle'; v.t = rand(0.5, 2.5); }
    },
  });

  function hurt(p, dmg, kx, ky, { inv = 0.6, src = null, g = null } = {}) {
    if (p.dead || p.hurtT > 0) return 'none';
    if (p.blockT > 0) { fx.ring(p.x, p.y, 12, '#9ff'); sound.sfx('block'); return 'blocked'; }
    if (p.shields > 0) { p.shields -= 1; p.hurtT = 0.4; fx.popup('AIRBAG!', p.x, p.y - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
    p.hp -= dmg; p.hurtT = inv; p.flashT = 0.12;
    if (src && src !== p && src.dealt !== undefined) src.dealt += dmg;
    p.vx += kx * p.st.knockTaken; p.vy += ky * p.st.knockTaken; p.stun = 0.25;
    fx.impact(p.x, p.y, { dmg, col: SEAT_COLORS[p.idx], dx: kx, dy: ky }); sound.sfx(dmg >= 30 ? 'hitBig' : 'hit');
    fx.popup(String(Math.round(dmg)), p.x, p.y - 10, '#fff', 1);
    if (g && src) hitEffects(p, src, dmg, g);
    if (p.hp <= 0) kill(p);
    return 'hit';
  }
  function kill(p) {
    p.dead = true; p.deathT = t; p.hp = 0;
    fx.ko(p.x, p.y, SEAT_COLORS[p.idx]); sound.sfx('ko'); drift.hush(0.7);
    fx.popup(`P${p.idx + 1} OUT!`, p.x, p.y - 16, SEAT_COLORS[p.idx], 3);
    p.sat.a = Math.atan2(p.y - SAT.y, p.x - SAT.x);
  }
  function blastAt(x, y, r, dmg) {
    fx.ring(x, y, r, P.danger, 0.3); fx.burst(x, y, 16, '#ffb03a', { speed: 100, life: 0.4 }); fx.shake(0.3); sound.sfx('boom');
    for (const p of alive()) { const d = Math.hypot(p.x - x, p.y - y); if (d < r + p.r) hurt(p, dmg, ((p.x - x) / (d || 1)) * 200, ((p.y - y) / (d || 1)) * 200); }
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: 15, x1: 320, y1: 180, open: {} },
    accel: (x, y) => {
      const pl = nearest(x, y);
      const dx = pl.x - x, dy = pl.y - y, d = Math.hypot(dx, dy) || 1;
      const g = 150 * env.bulletGrav * Math.sqrt(pl.r / 32);
      return [(dx / d) * g + env.wind, (dy / d) * g];
    },
    solidAt: (x, y) => {
      for (const pl of planets) if (Math.hypot(x - pl.x, y - pl.y) < pl.r) return { circle: pl };
      for (const m of moons) if (Math.hypot(x - m.x, y - m.y) < m.r) return { circle: m };
      return null;
    },
    targets: () => alive().map((p) => ({ ref: p, owner: p, x: p.x, y: p.y, r: p.r })),
    onHit: (p, info) => {
      if (p.dead) return 'none';
      if (p.blockT > 0 && p.st.reflect && info.kind === 'bullet') return 'reflect';
      const k = (info.kind === 'blast' ? 200 : 150) * (info.g.knock || 1);
      return hurt(p, info.dmg, info.dx * k, info.dy * k, { inv: 0, src: info.owner, g: info.g }) === 'none' ? 'none' : 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, spot: () => { const pl = planets[Math.floor(rand(0, planets.length))]; const a = rand(0, TAU); return [pl.x + Math.cos(a) * (pl.r + 9), pl.y + Math.sin(a) * (pl.r + 9)]; } });

  function controlPlayer(p, c, dt) {
    const pl = nearest(p.x, p.y);
    if (pl !== p.home) p.home = pl;
    const dx = p.x - pl.x, dy = p.y - pl.y, d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d, tx = -ny, ty = nx;
    let vt = p.vx * tx + p.vy * ty, vr = p.vx * nx + p.vy * ny;
    const G = 330 * p.st.grav * env.grav;
    const max = 85 * p.st.speed * (p.slowT > 0 ? 0.55 : 1);
    const want = c.mx * tx + c.my * ty;
    if (p.stun > 0) p.stun -= dt;
    else vt = approach(vt, clamp(want * 1.6, -1, 1) * max, (p.onGround ? (env.ice ? 220 : 900) : 450) * dt);
    if (Math.abs(want) > 0.2) p.face = Math.sign(want);
    if (p.onGround) p.jumps = p.st.airJumps;
    if (c.jumpP) {
      const v = 235 * Math.sqrt(p.st.jump);
      if (p.onGround) { vr = v; sound.sfx('jump'); fx.dust(p.x, p.y, '#c8b0ff'); p.squash = -0.8; }
      else if (p.jumps > 0) { p.jumps -= 1; vr = v * 0.85; sound.sfx('jump'); fx.ring(p.x, p.y, 6, '#c8b0ff', 0.2); }
    }
    vr -= G * (vr > 0 && !c.jump ? 2 : 1) * dt;
    p.vx = tx * vt + nx * vr + env.wind * 0.5 * dt * 60 * 0.02;
    p.vy = ty * vt + ny * vr;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const was = p.onGround;
    let grounded = false;
    for (const q of planets) {
      const d2 = Math.hypot(p.x - q.x, p.y - q.y);
      if (d2 < q.r + p.r) {
        const n2x = (p.x - q.x) / d2, n2y = (p.y - q.y) / d2;
        p.x = q.x + n2x * (q.r + p.r); p.y = q.y + n2y * (q.r + p.r);
        const vr2 = p.vx * n2x + p.vy * n2y;
        if (vr2 < 0) { p.vx -= vr2 * n2x; p.vy -= vr2 * n2y; }
        grounded = true;
      } else if (d2 < q.r + p.r + 1.5 && was) grounded = true;
    }
    p.onGround = grounded;
    if (grounded && !was) {
      p.squash = 0.6; fx.dust(p.x, p.y, '#c8b0ff', 3);
      if (p.landedOn && p.landedOn !== pl) { fx.ring(p.x, p.y, 12, SEAT_COLORS[p.idx], 0.3); sound.sfx('boing'); } // crossed to the other planet
      p.landedOn = pl;
    }
    if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx) * 0.6; }
    if (p.x > 320 - p.r) { p.x = 320 - p.r; p.vx = -Math.abs(p.vx) * 0.6; }
    if (p.y < 15 + p.r) { p.y = 15 + p.r; p.vy = Math.abs(p.vy) * 0.6; }
    if (p.y > 180 - p.r) { p.y = 180 - p.r; p.vy = -Math.abs(p.vy) * 0.6; }
    p.squash *= Math.pow(0.0005, dt);
    return { tx, ty };
  }

  function hazards(dt) {
    const rt = R.roundT;
    for (const m of moons) {
      m.a += m.w * dt; m.x = m.cx + Math.cos(m.a) * m.orbit; m.y = m.cy + Math.sin(m.a) * m.orbit;
      for (const p of alive()) { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < p.r + m.r) hurt(p, HAZ, ((p.x - m.x) / (d || 1)) * 230, ((p.y - m.y) / (d || 1)) * 230); }
    }
    meteorT -= dt;
    if (meteorT <= 0) {
      meteorT = Math.max(1.5, 3.4 - rt * 0.08);
      const target = Math.random() < 0.6 && alive().length ? alive()[Math.floor(rand(0, alive().length))] : null;
      const pl = target ? nearest(target.x, target.y) : planets[Math.floor(rand(0, planets.length))];
      const a = target ? Math.atan2(target.y - pl.y, target.x - pl.x) + rand(-0.3, 0.3) : rand(0, TAU);
      meteors.push({ pl, a, d: 150, warn: 1.2 });
      sound.sfx('warn');
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      if (m.warn > 0) { m.warn -= dt; continue; }
      m.d -= 240 * dt;
      const mx = m.pl.x + Math.cos(m.a) * m.d, my = m.pl.y + Math.sin(m.a) * m.d;
      if (Math.random() < 0.7) fx.burst(mx, my, 1, '#ffb03a', { speed: 30, life: 0.3, angle: m.a, spread: 0.6 });
      for (const p of alive()) if (Math.hypot(p.x - mx, p.y - my) < p.r + 4) hurt(p, HAZ, Math.cos(m.a) * -150, Math.sin(m.a) * -150);
      if (m.d <= m.pl.r + 2) { blastAt(m.pl.x + Math.cos(m.a) * (m.pl.r + 3), m.pl.y + Math.sin(m.a) * (m.pl.r + 3), 16, HAZ); meteors.splice(i, 1); }
    }
    if (rt > VENTS_AT) {
      if (!ventsSaid) { ventsSaid = true; fx.popup('FIRE VENTS AWAKE', 160, 26, P.danger, 2); sound.sfx('warn'); }
      for (const v of vents) {
        v.t -= dt;
        if (v.state === 'idle' && v.t <= 0) { v.state = 'warn'; v.t = 1.1; sound.sfx('warn'); }
        else if (v.state === 'warn' && v.t <= 0) { v.state = 'fire'; v.t = 1.2; sound.sfx('zap'); }
        else if (v.state === 'fire') {
          const bx = v.pl.x + Math.cos(v.a) * v.pl.r, by = v.pl.y + Math.sin(v.a) * v.pl.r;
          for (const p of alive()) {
            const rx = p.x - bx, ry = p.y - by, along = rx * Math.cos(v.a) + ry * Math.sin(v.a), side = Math.abs(-rx * Math.sin(v.a) + ry * Math.cos(v.a));
            if (along > -2 && along < 46 && side < 5 + p.r) hurt(p, HAZ, Math.cos(v.a) * 220, Math.sin(v.a) * 220);
          }
          if (v.t <= 0) { v.state = 'idle'; v.t = rand(2.5, 4); }
        }
      }
    }
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    for (const p of players) p.recoil *= Math.pow(0.0001, dt);
    const phase = R.tick(dt);
    if (phase === 'done') { if (!game.finished) { game.finished = true; game.ranking = R.rank(); } return; }
    if (phase !== 'play') { guns.update(dt); return; }
    hazards(dt);
    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.dead) {
        p.sat.a += (c.mx * -Math.sin(p.sat.a) + c.my * Math.cos(p.sat.a)) * 1.4 * dt;
        const [sx, sy] = satPos(p);
        const pl = nearest(sx, sy);
        const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.atan2(pl.y - sy, pl.x - sx);
        p.sat.aim = a;
        guns.trigger(p, p.gs, { ...p.st.gun, delay: Math.max(0.4, p.st.gun.delay * 1.6) }, c.fire, a, sx + Math.cos(a) * 5, sy + Math.sin(a) * 5, dt);
        continue;
      }
      tickBuffs(p, dt);
      p.hurtT -= dt; p.flashT -= dt; p.blockT -= dt; p.blockCd -= dt;
      const pd = tickStatus(p, dt); if (pd) { p.hp -= pd; if (p.hp <= 0) { kill(p); continue; } }
      const { tx, ty } = controlPlayer(p, c, dt);
      if (c.blockP && p.blockCd <= 0) {
        p.blockT = 0.3; p.blockCd = 2.6 * p.st.blockCd; sound.sfx('block');
        if (p.st.blockShock) for (const o of alive()) { if (o === p) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < 30 + 10 * p.st.blockShock) hurt(o, 12, ((o.x - p.x) / d) * 240, ((o.y - p.y) / d) * 240, { inv: 0.1, src: p }); }
        if (p.st.blockShock) fx.ring(p.x, p.y, 30 + 10 * p.st.blockShock, P.safe, 0.3);
        if (p.st.blockBlink) { p.x += tx * p.face * 40; p.y += ty * p.face * 40; fx.burst(p.x, p.y, 10, '#fff', { speed: 50, life: 0.3 }); }
        if (p.st.blockHeal) { p.hp = Math.min(p.maxHp, p.hp + p.st.blockHeal); fx.popup(`+${p.st.blockHeal}`, p.x, p.y - 12, P.good, 1); }
      }
      let a;
      if (c.aim) a = Math.atan2(c.ay, c.ax);
      else if (Math.hypot(c.mx, c.my) > 0.4) a = Math.atan2(c.my, c.mx);
      else a = Math.atan2(ty * p.face, tx * p.face);
      p.aim = a;
      if (guns.trigger(p, p.gs, p.st.gun, c.fire, a, p.x + Math.cos(a) * 9, p.y + Math.sin(a) * 9, dt)) { p.vx -= Math.cos(a) * 25; p.vy -= Math.sin(a) * 25; p.recoil = 1; }
    }
    guns.update(dt);
    pickups.update(dt, alive().map((p) => ({ p, x: p.x, y: p.y, r: p.r + 2, mult: p.mult })));
    R.check(dt);
  };
  game.hud = R.hud;
  game.hudInfo = (seat) => R.hudInfo(seat, 'OUT');
  game.leader = R.leader;
  game.matchPoint = R.matchPoint;
  Object.defineProperty(game, 'round', { get: () => R.round });
  Object.defineProperty(game, 'timeLeft', { get: () => R.timeLeft() });

  game.draw = (g) => {
    const D = (c, layer = 'bg') => drift.col(c, layer);
    // L0 backdrop: deep space with two quiet nebula washes, still stars (no twinkle)
    g.rect(0, 0, 320, 180, D('#07051a'), true);
    g.alpha(0.5); g.circle(70, 60, 60, D('#120a30'), true); g.circle(260, 140, 70, D('#0d0c2c'), true); g.alpha(1);
    for (const s of stars) g.rect(s.x, s.y, s.s, s.s, D(s.s > 1 ? '#8c86c0' : '#4a4680'), true);
    if (R.roundT < 2.5) { g.alpha(Math.min(1, (2.5 - R.roundT) * 2)); g.text(A.name, 160, 26, { scale: 2, col: '#7a6ab8', align: 'center', shadow: null }); g.alpha(1); } // arena title, then out of the way
    for (const m of moons) g.ring(m.cx, m.cy, m.orbit, '#ffffff12');
    // vents
    for (const v of vents) {
      const bx = v.pl.x + Math.cos(v.a) * v.pl.r, by = v.pl.y + Math.sin(v.a) * v.pl.r;
      if (v.state === 'warn') { g.alpha(0.22); g.beam(bx, by, bx + Math.cos(v.a) * 46, by + Math.sin(v.a) * 46, 10, P.danger); g.alpha(1); g.dotted(bx, by, bx + Math.cos(v.a) * 46, by + Math.sin(v.a) * 46, P.danger, 3); }
      if (v.state === 'fire') { g.alpha(0.5); g.beam(bx, by, bx + Math.cos(v.a) * 46, by + Math.sin(v.a) * 46, 10, P.danger); g.alpha(1); g.beam(bx, by, bx + Math.cos(v.a) * 44, by + Math.sin(v.a) * 44, 4, '#ffd0c0'); }
    }
    // L1 planets: banded fill that drifts a little, a fixed bright rim so the surface always reads
    for (const pl of planets) {
      g.circle(pl.x, pl.y, pl.r + 3, '#5a3aa044');
      g.circle(pl.x, pl.y, pl.r, D('#3b2a6e', 'geo'));
      for (let k = -5; k <= 5; k++) { const y = pl.y + k * 8; if (Math.abs(k * 8) >= pl.r) continue; const half = Math.sqrt(pl.r * pl.r - (k * 8) ** 2); g.rect(pl.x - half, y, half * 2, 2, D(k % 2 ? '#4a3a8a' : '#2e2058', 'geo')); }
      [[0.5, 0.4, 0.12], [2.4, 0.7, 0.09], [4.2, 0.55, 0.15]].forEach(([a, k, r]) => g.circle(pl.x + Math.cos(a + t * 0.05) * pl.r * k, pl.y + Math.sin(a + t * 0.05) * pl.r * k, pl.r * r, D('#251a4a', 'geo')));
      g.ring(pl.x, pl.y, pl.r, '#d9ccff');
      for (const v of vents) if (v.pl === pl) g.circle(pl.x + Math.cos(v.a) * (pl.r - 1), pl.y + Math.sin(v.a) * (pl.r - 1), 3, v.state === 'idle' ? '#5a2a2a' : P.danger);
    }
    // L3 hazards
    for (const m of meteors) {
      const sx = m.pl.x + Math.cos(m.a) * (m.pl.r + 3), sy = m.pl.y + Math.sin(m.a) * (m.pl.r + 3);
      if (m.warn > 0) { g.ring(sx, sy, 8, P.danger); g.dotted(sx, sy, m.pl.x + Math.cos(m.a) * 150, m.pl.y + Math.sin(m.a) * 150, '#ff4a4a77', 5); continue; }
      const mx = m.pl.x + Math.cos(m.a) * m.d, my = m.pl.y + Math.sin(m.a) * m.d;
      g.circle(mx, my, 4, P.danger); g.circle(mx, my, 2, '#fff2a0');
    }
    for (const m of moons) { g.circle(m.x, m.y, m.r, '#9a9ab8'); g.ring(m.x, m.y, m.r, P.danger); g.circle(m.x - 2, m.y - 2, m.r * 0.4, '#c8c8e0'); }
    pickups.draw(g);
    guns.draw(g);
    // L2 players
    for (const p of players) {
      if (p.dead) {
        if (game.finished || R.between > 0) continue;
        const [sx, sy] = satPos(p);
        g.rect(sx - 5, sy - 1, 10, 2, SEAT_COLORS[p.idx]); g.circle(sx, sy, 2.5, '#ddd');
        drawGun(g, p.idx, sx, sy, p.sat.aim || 0, { size: 0.7, alpha: 0.8 });
        g.text(`P${p.idx + 1}`, sx, sy - 10, { scale: g.large ? 2 : 1, col: SEAT_COLORS[p.idx], align: 'center', ui: false });
        continue;
      }
      const pl = p.home;
      const a = Math.atan2(p.y - pl.y, p.x - pl.x);
      const shielded = p.hurtT > 0 && R.roundT < R.shield + 0.05;
      const blink = !shielded && p.hurtT > 0 && p.hurtT < 0.5 && Math.floor(t * 8) % 2;
      const sz = p.st.size;
      drawPlayer(g, p.idx, p.x, p.y, { rot: a + Math.PI / 2, anchor: 'center', flip: p.face < 0, size: sz, squash: p.squash, flash: p.flashT > 0, alpha: blink ? 0.6 : 1 });
      drawGun(g, p.idx, p.x, p.y, p.aim, { size: sz, recoil: p.recoil });
      if (shielded) { g.alpha(0.5); g.ring(p.x, p.y, 10 * sz, SEAT_COLORS[p.idx]); g.alpha(1); }
      if (p.blockT > 0) g.ring(p.x, p.y, 9 * sz, P.safe);
      if (p.shields) g.ring(p.x, p.y, 8 * sz, '#9fd3ff55');
      // health and tag stay screen-upright above the player, wherever they stand on the planet
      const top = p.y - 13 * sz;
      g.rect(p.x - 8, top, 16, 3, '#3a1020'); g.rect(p.x - 8, top, 16 * Math.max(0, p.hp / p.maxHp), 3, SEAT_COLORS[p.idx]);
      drawTag(g, p.idx, p.x, top - 1);
      drawBuffs(g, p, p.x, top - (g.large ? 12 : 8));
      if (p.gs.reloadT > 0) g.rect(p.x - 4, p.y + 8, 8 * guns.reloadFrac(p.gs, p.st.gun), 1, '#fff6a8');
    }
    R.draw(g);
  };
  R.reset();
  return game;
}
