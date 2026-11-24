// RICOCHET ROOFTOP: ROUNDS-style shootout on rooftops. Five maps.
// An event is a short best-of: last one standing takes a round, first to 2
// round wins takes the event (audit F-01). Hazards run on the round clock.
import { TAU, clamp, rand, overlap, circleRect } from '../engine/util.js';
import { drawPlayer, drawTag, drawGun, SEAT_COLORS } from '../engine/sprites.js';
import { makeBody, platformControl, stepBody, moveMovers, GRAV } from './platformer.js';
import { Guns, newGunState, hitEffects, tickStatus } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { Drift, P } from '../engine/style.js';
import { switcheroo } from '../game/switcheroo.js';

export const meta = {
  id: 'rumble', name: 'RICOCHET ROOFTOP', color: '#33d6ff', music: 'rumble', tier: 1,
  tagline: 'A rooftop shootout with bouncing bullets',
  opener: true,
  objective: 'Last one standing takes the round, if they landed a hit. First to 2 rounds wins.',
  card: { rule: 'LAST ONE STANDING TAKES THE ROUND', rule2: 'LAND A HIT TO COUNT. FIRST TO 2',  keys: [['A', 'JUMP'], ['X', 'SHOOT'], ['RB', 'BLOCK']], danger: 'SAWS, SEARCHLIGHT, RISING WATER' },
  controls: [['STICK', 'Move and aim'], ['A', 'Jump (double jump)'], ['X / RT', 'Shoot (bullets drop and bounce)'], ['RB', 'Block'], ['R-STICK', 'Aim freely']],
  hazards: 'Saws on rails / crumbling ledges / wrecking ball / searchlight at 6 s / water rises from 9 s each round',
  ghost: 'Knocked out: fly your ghost, X drops an anvil. You are back next round',
  tiebreak: 'More round wins > longer survived > more health',
  gunUse: 'Your gun', blockUse: 'Your block (RB)', bodyUse: 'Your body',
  twists: ['moon', 'heavy', 'wind', 'tilt', 'rubber', 'bullettime', 'giant', 'warp'],
};

const HAZ = 34;
const TIME = 54;          // hard cap for the whole event (with the end beat and slow-mo it stays under 60 s)
const WIN_ROUNDS = 2;     // first to this many round wins takes the event
const MAX_ROUNDS = 5;
const BREAK = 1.8;        // seconds between rounds
const ROUND_CAP = 24;     // a round that runs this long goes to the healthiest player
const SPAWN_SHIELD = 1.0;
const LASER_FIRST = 6, LASER_EVERY = 8, FLOOD_AT = 9, FLOOD_SPEED = 5;

export const LAYOUTS = [
  { name: 'NEON ROOFS', theme: { top: '#2a0b4a', bot: '#b0306a', sun: '#ffcf6a', far: '#6a2378', near: '#4a1560', win: '#ffb347', solid: '#0b0414', edge: '#ff7ad9', plat: '#3d1b66', platTop: '#ffd1f0' },
    solids: [{ x: 0, y: 150, w: 96, h: 30 }, { x: 128, y: 162, w: 64, h: 18 }, { x: 224, y: 150, w: 96, h: 30 },
      { x: 26, y: 112, w: 46, h: 4, oneWay: 1 }, { x: 248, y: 112, w: 46, h: 4, oneWay: 1 }, { x: 134, y: 96, w: 52, h: 4, oneWay: 1, crumble: 1 },
      { x: 10, y: 72, w: 38, h: 4, oneWay: 1, crumble: 1 }, { x: 272, y: 72, w: 38, h: 4, oneWay: 1, crumble: 1 }],
    movers: [{ w: 30, h: 5, ax: 98, bx: 192, ay: 128, by: 128, period: 5 }],
    saws: [{ ax: 104, ay: 150, bx: 216, by: 150, r: 7, period: 3.6 }],
    spawns: [[44, 140], [160, 150], [276, 140]] },
  { name: 'WATER TOWER', theme: { top: '#06263a', bot: '#1f8a9a', sun: '#e9fff7', far: '#15647a', near: '#0e4a5e', win: '#7dfff0', solid: '#020b11', edge: '#5affd9', plat: '#0f4660', platTop: '#c9fff6' },
    solids: [{ x: 0, y: 156, w: 110, h: 24 }, { x: 210, y: 156, w: 110, h: 24 }, { x: 142, y: 100, w: 36, h: 80 },
      { x: 18, y: 120, w: 50, h: 4, oneWay: 1 }, { x: 252, y: 120, w: 50, h: 4, oneWay: 1 }, { x: 120, y: 66, w: 80, h: 4, oneWay: 1, crumble: 1 },
      { x: 58, y: 88, w: 34, h: 4, oneWay: 1, crumble: 1 }, { x: 228, y: 88, w: 34, h: 4, oneWay: 1, crumble: 1 }],
    movers: [{ w: 26, h: 5, ax: 112, bx: 112, ay: 150, by: 96, period: 4 }, { w: 26, h: 5, ax: 182, bx: 182, ay: 96, by: 150, period: 4 }],
    saws: [{ ax: 8, ay: 155, bx: 102, by: 155, r: 7, period: 3 }, { ax: 30, ay: 44, bx: 290, by: 44, r: 7, period: 5 }],
    spawns: [[40, 146], [160, 90], [280, 146]] },
  { name: 'BILLBOARD', theme: { top: '#1a0838', bot: '#6a1fb0', sun: '#ff9ef0', far: '#5a2598', near: '#3a1478', win: '#ff7ad9', solid: '#070212', edge: '#c08bff', plat: '#3a1680', platTop: '#ead9ff' },
    solids: [{ x: 0, y: 160, w: 70, h: 20 }, { x: 125, y: 160, w: 70, h: 20 }, { x: 250, y: 160, w: 70, h: 20 },
      { x: 96, y: 92, w: 128, h: 10 }, { x: 0, y: 40, w: 10, h: 120 }, { x: 310, y: 40, w: 10, h: 120 },
      { x: 30, y: 122, w: 40, h: 4, oneWay: 1 }, { x: 250, y: 122, w: 40, h: 4, oneWay: 1 }, { x: 140, y: 60, w: 40, h: 4, oneWay: 1, crumble: 1 }],
    movers: [{ w: 28, h: 5, ax: 72, bx: 72, ay: 150, by: 104, period: 4.5 }, { w: 28, h: 5, ax: 220, bx: 220, ay: 104, by: 150, period: 4.5 }],
    saws: [{ ax: 100, ay: 103, bx: 220, by: 103, r: 6, period: 4 }],
    spawns: [[36, 150], [160, 86], [284, 150]] },
  { name: 'CRANE YARD', theme: { top: '#2a1206', bot: '#c2621a', sun: '#fff0b8', far: '#8a4218', near: '#5a2810', win: '#ffd84a', solid: '#0c0502', edge: '#ffb347', plat: '#5a2e10', platTop: '#ffe3b8' },
    solids: [{ x: 0, y: 152, w: 104, h: 28 }, { x: 216, y: 152, w: 104, h: 28 },
      { x: 40, y: 62, w: 240, h: 5, oneWay: 1 }, { x: 20, y: 112, w: 50, h: 4, oneWay: 1 }, { x: 250, y: 112, w: 50, h: 4, oneWay: 1 },
      { x: 136, y: 118, w: 48, h: 4, oneWay: 1, crumble: 1 }],
    movers: [{ w: 34, h: 5, ax: 106, bx: 180, ay: 146, by: 146, period: 4 }],
    saws: [],
    pend: { ax: 160, ay: 67, len: 46, r: 8 },
    spawns: [[40, 140], [160, 55], [280, 140]] },
  { name: 'STAIRCASE', theme: { top: '#070c2e', bot: '#2b4fb8', sun: '#cfe0ff', far: '#22348e', near: '#142070', win: '#9fd3ff', solid: '#02040f', edge: '#7aa8ff', plat: '#1a2a80', platTop: '#dbe8ff' },
    solids: [{ x: 0, y: 164, w: 60, h: 16 }, { x: 60, y: 148, w: 40, h: 32 }, { x: 100, y: 132, w: 40, h: 48 },
      { x: 180, y: 132, w: 40, h: 48 }, { x: 220, y: 148, w: 40, h: 32 }, { x: 260, y: 164, w: 60, h: 16 },
      { x: 128, y: 88, w: 64, h: 4, oneWay: 1, crumble: 1 }, { x: 20, y: 110, w: 40, h: 4, oneWay: 1 }, { x: 260, y: 110, w: 40, h: 4, oneWay: 1 }],
    movers: [{ w: 30, h: 5, ax: 145, bx: 145, ay: 160, by: 100, period: 3.6 }],
    saws: [{ ax: 64, ay: 147, bx: 136, by: 131, r: 6, period: 3 }, { ax: 256, ay: 147, bx: 184, by: 131, r: 6, period: 3 }],
    spawns: [[30, 156], [160, 80], [290, 156]] },
];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  const L = LAYOUTS[ctx.variant % LAYOUTS.length];
  const flip = Math.floor(ctx.variant / LAYOUTS.length) % 2 === 1;
  const fl = (o) => (flip ? { ...o, x: 320 - o.x - o.w } : { ...o });
  const solids = L.solids.map(fl);
  const movers = L.movers.map((m) => ({ ...m, oneWay: 1, ax: flip ? 320 - m.ax - m.w : m.ax, bx: flip ? 320 - m.bx - m.w : m.bx }));
  moveMovers(movers, 0);
  const all = [...solids, ...movers];
  const saws = L.saws.map((s) => ({ ...s, ax: flip ? 320 - s.ax : s.ax, bx: flip ? 320 - s.bx : s.bx, x: s.ax, y: s.ay, rot: 0 }));
  const pend = L.pend ? { ...L.pend, a: 1.2, w: 0 } : null;
  let t = 0, endT = null;
  let round = 1, roundT = 0, between = 0, banner = null; // banner: { text, sub, col, t }
  let env = twistEnv(tw, 0);
  const drift = ctx.drift || new Drift();

  const WIN = ctx.rounds || WIN_ROUNDS, MAXR = ctx.rounds === 1 ? 1 : MAX_ROUNDS;
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const [sx, sy] = L.spawns[i % 3];
    const x0 = flip ? 320 - sx : sx;
    const w = 8 * st.size, h = 11 * st.size;
    const p = {
      seat: pl.seat, idx: pl.idx, b: makeBody(x0 - w / 2, sy - h - 2, w, h), hp: st.hp, maxHp: st.hp,
      dead: !!pl.ghost, deathT: pl.ghost ? -1 : null, face: x0 < 160 ? 1 : -1, gs: newGunState(st.gun), mult: pl.pickupMult ?? 1, tipsy: pl.tipsy || 0,
      perma: !!pl.ghost, wins: 0, survive: 0, spawn: i, dealt: 0, recoil: 0,
      blockT: 0, blockCd: 0, shields: st.shields, hurtT: 0, flashT: 0, slowT: 0, poison: null,
      ghost: { x: 160, y: 50, cd: pl.ghost ? 1 : 0 },
    };
    p.pos = () => [p.b.x + p.b.w / 2, p.b.y + p.b.h / 2];
    return makeBuffable(p, st);
  });
  const anvils = [];
  // backdrop: two depths of simple skyline blocks; a few fixed lit windows, no twinkle
  const far = Array.from({ length: 12 }, (_, i) => ({ x: i * 28 - 8, w: rand(20, 30), h: rand(50, 95) }));
  const near = Array.from({ length: 9 }, (_, i) => ({ x: i * 38 - 12, w: rand(24, 34), h: rand(28, 62), lit: Array.from({ length: 6 }, () => Math.random() < 0.35) }));
  const motes = Array.from({ length: 14 }, () => ({ x: rand(0, 320), y: rand(20, 170), s: rand(3, 8) }));
  const laser = { state: 'off', x: 0, dir: 1, t: 0, next: LASER_FIRST };
  let waterY = 200, floodSaid = false;
  const game = { meta, finished: false, ranking: [], players, layoutName: L.name };
  const alive = () => players.filter((p) => !p.dead);

  function solidAt(x, y) {
    for (const s of all) if (!s.gone && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return { rect: s };
    return null;
  }
  function groundBelow(x) {
    let best = 182;
    for (const s of all) if (!s.gone && x >= s.x && x <= s.x + s.w && s.y < best && s.y > 20) best = s.y;
    return best;
  }

  function hurt(p, dmg, kx, ky, { inv = 0.6, src = null, g = null } = {}) {
    if (p.dead || p.hurtT > 0) return 'none';
    if (p.blockT > 0) { fx.ring(p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, 12, '#9ff'); sound.sfx('block'); return 'blocked'; }
    if (p.shields > 0) {
      p.shields -= 1; p.hurtT = 0.4;
      fx.popup('AIRBAG!', p.b.x + p.b.w / 2, p.b.y - 10, '#9fd3ff', 1); fx.ring(p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, 14, '#9fd3ff'); sound.sfx('block');
      return 'blocked';
    }
    p.hp -= dmg; p.hurtT = inv; p.flashT = 0.12;
    if (src && src !== p && src.dealt !== undefined) src.dealt += dmg;
    p.b.vx += kx * p.st.knockTaken; p.b.vy += ky * p.st.knockTaken; p.b.stun = 0.22;
    fx.impact(p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, { dmg, col: SEAT_COLORS[p.idx], dx: kx, dy: ky }); sound.sfx(dmg >= 30 ? 'hitBig' : 'hit');
    fx.popup(String(Math.round(dmg)), p.b.x + p.b.w / 2, p.b.y - 6, '#fff', 1);
    if (g && src) hitEffects(p, src, dmg, g);
    if (p.hp <= 0) kill(p);
    return 'hit';
  }
  function kill(p) {
    p.dead = true; p.deathT = t; p.hp = 0;
    const [cx, cy] = p.pos();
    fx.ko(cx, cy, SEAT_COLORS[p.idx]); sound.sfx('ko'); drift.hush(0.7);
    fx.popup(`P${p.idx + 1} OUT!`, cx, cy - 16, SEAT_COLORS[p.idx], 3);
    p.ghost.x = clamp(cx, 10, 310); p.ghost.y = 50; p.ghost.cd = 1;
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: 15, x1: 320, y1: 182, open: { top: true, bottom: true } },
    accel: () => [140 * env.bulletGrav * env.gx + env.wind, 140 * env.bulletGrav * env.gy],
    solidAt,
    targets: () => alive().map((p) => ({ ref: p, owner: p, rect: p.b, r: p.b.w / 2 })),
    onHit: (p, info) => {
      if (p.dead) return 'none';
      if (p.blockT > 0 && p.st.reflect && info.kind === 'bullet') return 'reflect';
      const k = (info.kind === 'blast' ? 190 : 150) * (info.g.knock || 1);
      return hurt(p, info.dmg, info.dx * k, info.dy * k * 0.7 - 70, { inv: 0, src: info.owner, g: info.g }) === 'none' ? 'none' : 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, spot: () => { const s = solids.filter((q) => !q.gone)[Math.floor(rand(0, solids.length))] || solids[0]; return [clamp(s.x + rand(6, s.w - 6), 8, 312), s.y - 8]; } });

  function block(p, c) {
    p.blockT = 0.3; p.blockCd = 2.6 * p.st.blockCd; sound.sfx('block'); switcheroo(p, players, { fx, sound, box: (q) => q.b, alive: (q) => !q.dead && !q.perma });
    const [cx, cy] = p.pos();
    if (p.st.blockBlink) {
      const m = Math.hypot(c.mx, c.my) || 1;
      const dx = Math.hypot(c.mx, c.my) > 0.3 ? c.mx / m : p.face, dy = Math.hypot(c.mx, c.my) > 0.3 ? c.my / m : 0;
      fx.burst(cx, cy, 10, SEAT_COLORS[p.idx], { speed: 40, life: 0.3 });
      p.b.x = clamp(p.b.x + dx * 46 * p.st.blockBlink, 0, 320 - p.b.w); p.b.y = clamp(p.b.y + dy * 46 * p.st.blockBlink, 16, 170);
      p.b.vy = Math.min(p.b.vy, 0);
      fx.burst(p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, 10, '#fff', { speed: 60, life: 0.3 });
    }
    if (p.st.blockShock) {
      const R = 26 + 10 * p.st.blockShock;
      fx.ring(cx, cy, R, '#5affd9', 0.3); sound.sfx('boom');
      for (const o of alive()) {
        if (o === p) continue;
        const [ox, oy] = o.pos(); const d = Math.hypot(ox - cx, oy - cy);
        if (d < R) hurt(o, 12, ((ox - cx) / (d || 1)) * 230, -170, { inv: 0.1, src: p });
      }
    }
    if (p.st.blockHeal) { p.hp = Math.min(p.maxHp, p.hp + p.st.blockHeal); fx.popup(`+${p.st.blockHeal}`, cx, cy - 12, '#7dff8a', 1); }
  }

  function updateHazards(dt) {
    moveMovers(movers, t);
    for (const s of saws) {
      const k = 0.5 - 0.5 * Math.cos((t / s.period) * TAU);
      s.x = s.ax + (s.bx - s.ax) * k; s.y = s.ay + (s.by - s.ay) * k; s.rot += dt * 12;
      if (Math.random() < 0.3) fx.burst(s.x, s.y + s.r, 1, '#ffd27a', { speed: 50, life: 0.2, angle: -Math.PI / 2, spread: 2 });
      for (const p of alive()) if (circleRect(s.x, s.y, s.r, p.b)) hurt(p, HAZ, (p.b.x + p.b.w / 2 < s.x ? -1 : 1) * 190, -200);
    }
    if (pend) {
      pend.w += (-GRAV * 0.4 / pend.len) * Math.sin(pend.a) * dt; pend.a += pend.w * dt;
      if (Math.abs(pend.w) < 0.4 && Math.abs(pend.a) < 0.1) pend.w = 2;
      pend.x = pend.ax + Math.sin(pend.a) * pend.len; pend.y = pend.ay + Math.cos(pend.a) * pend.len;
      for (const p of alive()) if (circleRect(pend.x, pend.y, pend.r, p.b)) hurt(p, HAZ, Math.sign(p.b.x + p.b.w / 2 - pend.x || 1) * 240, -180);
    }
    for (const s of solids) {
      if (!s.crumble) continue;
      if (s.gone) { s.back -= dt; if (s.back <= 0) { s.gone = false; s.crumbleT = null; } continue; }
      if (s.crumbleT == null && players.some((p) => !p.dead && p.b.ground === s)) { s.crumbleT = 0.6; sound.sfx('crumble'); }
      if (s.crumbleT != null) {
        s.crumbleT -= dt;
        if (s.crumbleT <= 0) { s.gone = true; s.back = 5; fx.burst(s.x + s.w / 2, s.y, 14, '#8a6d5b', { speed: 60, life: 0.6, grav: 300, size: 2 }); }
      }
    }
    if (laser.state === 'off' && roundT >= laser.next) {
      laser.state = 'warn'; laser.t = 1.2; laser.dir = Math.random() < 0.5 ? 1 : -1; laser.x = laser.dir > 0 ? 6 : 314;
      sound.sfx('warn'); fx.popup('SEARCHLIGHT!', 160, 30, P.danger, 2);
    } else if (laser.state === 'warn') {
      laser.t -= dt; if (laser.t <= 0) { laser.state = 'on'; laser.t = 3; sound.sfx('laser'); }
    } else if (laser.state === 'on') {
      laser.t -= dt; laser.x += laser.dir * (308 / 3) * dt;
      for (const p of alive()) if (laser.x > p.b.x - 3 && laser.x < p.b.x + p.b.w + 3) hurt(p, HAZ, laser.dir * 160, -180);
      if (laser.t <= 0) { laser.state = 'off'; laser.next = roundT + LASER_EVERY; }
    }
    if (roundT > FLOOD_AT) {
      if (!floodSaid) { floodSaid = true; fx.popup('THE WATER IS RISING', 160, 40, P.danger, 2); sound.sfx('warn'); }
      waterY = Math.max(96, 182 - (roundT - FLOOD_AT) * FLOOD_SPEED);
      for (const p of alive()) {
        if (p.b.y + p.b.h < waterY + 2) continue;
        if (hurt(p, HAZ, 0, 0) !== 'none') { p.b.vy = -330; sound.sfx('zap'); } else p.b.vy = Math.min(p.b.vy, -200);
      }
    }
    for (let i = anvils.length - 1; i >= 0; i--) {
      const a = anvils[i];
      if (a.warn > 0) { a.warn -= dt; continue; }
      a.vy += 900 * dt; a.y += a.vy * dt;
      const box = { x: a.x - 6, y: a.y - 9, w: 12, h: 9 };
      for (const p of alive()) if (overlap(box, p.b)) hurt(p, HAZ * 1.3, (p.b.x + p.b.w / 2 < a.x ? -1 : 1) * 120, -150);
      if (a.y >= a.ty) {
        fx.burst(a.x, a.ty, 16, '#bbb', { speed: 90, life: 0.4, angle: -Math.PI / 2, spread: Math.PI }); fx.shake(0.35); sound.sfx('boom');
        for (const p of alive()) if (Math.abs(p.b.x + p.b.w / 2 - a.x) < 14 && Math.abs(p.b.y + p.b.h - a.ty) < 14) hurt(p, HAZ, (p.b.x + p.b.w / 2 < a.x ? -1 : 1) * 160, -200);
        anvils.splice(i, 1);
      }
    }
  }

  // ---- rounds ----
  const contenders = () => players.filter((p) => !p.perma);
  function resetRound() {
    roundT = 0; laser.state = 'off'; laser.next = LASER_FIRST; waterY = 200; floodSaid = false;
    guns.bullets.length = 0; anvils.length = 0;
    for (const s of solids) if (s.crumble) { s.gone = false; s.crumbleT = null; }
    const order = contenders();
    order.forEach((p, k) => {
      const [sx, sy] = L.spawns[(k + round - 1) % 3];
      const x0 = flip ? 320 - sx : sx;
      p.b.x = x0 - p.b.w / 2; p.b.y = sy - p.b.h - 2; p.b.vx = 0; p.b.vy = 0; p.b.stun = 0;
      p.dead = false; p.deathT = null; p.hp = p.maxHp; p.shields = p.st.shields; p.poison = null; p.slowT = 0; p.dealt = 0;
      p.hurtT = SPAWN_SHIELD; p.blockT = 0; p.face = x0 < 160 ? 1 : -1; p.ghost.cd = 0;
      fx.ring(x0, sy - 6, 16, SEAT_COLORS[p.idx], 0.5);
    });
    if (round > 1) { banner = { text: `ROUND ${round}`, sub: null, col: P.text, t: 0.9 }; sound.sfx('beep'); } // round 1 is introduced by the countdown
  }
  function endRound(winner, how) {
    between = BREAK;
    // land a hit to take the round: the last one standing must have dealt damage (anti-camping, F-01)
    if (winner && winner.dealt <= 0) {
      const fighter = contenders().filter((p) => p.dealt > 0).sort((a, b) => b.dealt - a.dealt)[0];
      if (fighter) { how = `P${winner.idx + 1} NEVER LANDED A HIT`; winner = fighter; }
    }
    if (winner) {
      winner.wins += 1;
      drift.kick(SEAT_COLORS[winner.idx], 1);
      const [cx, cy] = winner.pos();
      fx.ring(cx, cy, 40, SEAT_COLORS[winner.idx], 0.6);
      sound.sfx('round');
      banner = { text: `P${winner.idx + 1} TAKES ROUND ${round}`, sub: how, col: SEAT_COLORS[winner.idx], t: BREAK };
    } else banner = { text: `ROUND ${round}: NOBODY`, sub: how, col: P.dim, t: BREAK };
    const done = contenders().some((p) => p.wins >= WIN) || round >= MAXR || t >= TIME - BREAK;
    if (done) endT = BREAK;
  }
  function healthiest() { return contenders().filter((p) => !p.dead).sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0] || null; }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    for (const m of motes) { m.x -= m.s * dt; if (m.x < -2) m.x = 322; }
    for (const p of players) p.recoil *= Math.pow(0.0001, dt);
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } return; }
    if (between > 0) {
      between -= dt;
      guns.update(dt);
      if (between <= 0) { round += 1; resetRound(); }
      return;
    }
    roundT += dt;
    updateHazards(dt);
    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.dead) {
        const gh = p.ghost;
        gh.x = clamp(gh.x + c.mx * 150 * dt, 6, 314); gh.y = clamp(gh.y + c.my * 150 * dt, 34, 120); gh.cd -= dt;
        if (c.fireP && gh.cd <= 0 && endT === null) { anvils.push({ x: gh.x, y: -12, vy: 0, ty: groundBelow(gh.x), warn: 1.0 }); gh.cd = 3.5; sound.sfx('warn'); }
        continue;
      }
      tickBuffs(p, dt);
      p.hurtT -= dt; p.flashT -= dt; p.blockT -= dt; p.blockCd -= dt;
      const pd = tickStatus(p, dt); if (pd) { p.hp -= pd; if (Math.random() < 0.2) fx.burst(p.b.x + p.b.w / 2, p.b.y, 1, '#9aff5a', { speed: 20, life: 0.3 }); if (p.hp <= 0) kill(p); }
      if (p.dead) continue;
      p.b.slowT = p.slowT;
      const ev = platformControl(p.b, c, p.st, dt, env);
      if (ev) { sound.sfx('jump'); fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#8fa0c8'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      if (c.blockP && p.blockCd <= 0) block(p, c);
      let a;
      if (c.aim) a = Math.atan2(c.ay, c.ax);
      else if (Math.hypot(c.mx, c.my) > 0.4) a = Math.atan2(c.my, c.mx);
      else a = p.face > 0 ? 0 : Math.PI;
      p.aim = a;
      const [cx, cy] = p.pos();
      if (guns.trigger(p, p.gs, p.st.gun, c.fire, a, cx + Math.cos(a) * 9, cy - 1 + Math.sin(a) * 9, dt)) {
        p.b.vx -= Math.cos(a) * 30 * Math.sqrt(p.st.gun.knock); p.b.squash = 0.2; p.recoil = 1;
      }
      stepBody(p.b, dt, all);
      if (p.b.landed) fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#8fa0c8');
      if (p.b.y > 186) {
        p.b.y = 184 - p.b.h; p.b.vy = -360; p.b.vx *= 0.3; p.hurtT = 0;
        hurt(p, HAZ, 0, 0, { inv: 0.4 });
        fx.burst(p.b.x + p.b.w / 2, 178, 12, '#33d6ff', { speed: 80, life: 0.4, angle: -Math.PI / 2, spread: 1.4 });
      }
    }
    guns.update(dt);
    pickups.update(dt, alive().map((p) => { const [x, y] = p.pos(); return { p, x, y, r: p.b.w / 2 + 2, mult: p.mult }; }));
    for (const p of contenders()) if (!p.dead) p.survive += dt;
    const cs = contenders();
    const up = cs.filter((p) => !p.dead);
    if (cs.length >= 2 && up.length <= 1) {
      if (up.length === 1) endRound(up[0], null);
      else { const last = cs.slice().sort((a, b) => b.deathT - a.deathT)[0]; endRound(last, 'EVERYONE FELL. LAST ONE DOWN TAKES IT'); }
    } else if (roundT >= ROUND_CAP || t >= TIME) endRound(healthiest(), 'TIME: MOST HEALTH TAKES IT');
    else if (cs.length < 2 && roundT >= 20) endRound(up[0] || null, null);
  };
  function rank() {
    const order = (x, y) => (y.wins - x.wins) || (y.survive - x.survive) || (y.hp / y.maxHp - x.hp / x.maxHp);
    return [...contenders().sort(order), ...players.filter((p) => p.perma)].map((p) => p.seat);
  }
  game.hud = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (p.perma) return 'GHOST';
    return `${p.wins}W ` + (p.dead ? 'OUT' : `${Math.max(0, Math.ceil((p.hp / p.maxHp) * 100))}%`);
  };
  /** Structured HUD for the shared HUD component: round pips + one short value. */
  game.hudInfo = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (p.perma) return { text: 'GHOST', pips: 0, pipMax: 0 };
    return { text: p.dead ? 'OUT' : `${Math.max(0, Math.ceil((p.hp / p.maxHp) * 100))}%`, pips: p.wins, pipMax: WIN, warn: !p.dead && p.hp / p.maxHp < 0.35 };
  };
  Object.defineProperty(game, 'round', { get: () => round });
  game.leader = () => (contenders().some((p) => p.wins) ? rank()[0] : null);
  game.matchPoint = () => WIN > 1 && contenders().some((p) => p.wins === WIN - 1);
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, Math.min(TIME - t, ROUND_CAP - roundT)) });

  game.draw = (g) => {
    const D = (c, layer = 'bg') => drift.col(c, layer);
    const T = L.theme;
    // L0 backdrop: a vivid sky, a big glowing sun, two layers of skyline. Darker than anything you play on.
    g.vgrad(0, 0, 320, 180, D(T.top), D(T.bot));
    g.glow(258, 46, 70, T.sun, 0.35); g.circle(258, 46, 17, T.sun, true); g.glow(258, 46, 26, T.sun, 0.5, true);
    for (let k = 0; k < 4; k++) { g.alpha(0.25); g.rect(234, 40 + k * 5, 48, 1.5, D(T.bot), true); g.alpha(1); } // sun stripes
    const bold = drift.mode === 'bold';
    for (const b of far) { const bob = bold ? Math.sin(drift.t * 0.4 + b.x) * 1.5 : 0; g.rrect(b.x, 180 - b.h + bob, b.w, b.h + 4, 2, D(T.far), true); }
    for (const b of near) {
      g.rrect(b.x, 180 - b.h, b.w, b.h + 4, 2, D(T.near), true);
      b.lit.forEach((on, k) => { if (on) { const wx = b.x + 4 + (k % 2) * 10, wy = 180 - b.h + 6 + Math.floor(k / 2) * 9; g.rect(wx, wy, 3, 4, T.win, true); g.glow(wx + 1.5, wy + 2, 5, T.win, 0.25, true); } });
    }
    if (bold) for (const m of motes) { g.alpha(0.35); g.rect(m.x, m.y, 1, 1, D('#c9b8ff'), true); g.alpha(1); }
    g.alpha(0.35); g.vgrad(0, 120, 320, 60, 'rgba(0,0,0,0)', '#000000'); g.alpha(1); // haze toward the street
    if (roundT < 2.5) { g.alpha(Math.min(1, (2.5 - roundT) * 2)); g.text(L.name, 160, 26, { scale: 2, col: T.platTop, align: 'center', ui: true, shadow: '#000' }); g.alpha(1); } // arena title, then out of the way
    // L1 arena geometry: solid silhouettes with a glowing neon top edge, and a soft shadow
    for (const s of saws) g.dotted(s.ax, s.ay, s.bx, s.by, T.edge + '88', 3);
    for (const s of solids) {
      if (s.gone) continue;
      const sx = s.crumbleT != null ? Math.sin(t * 70) * 0.8 : 0;
      if (s.oneWay) {
        g.alpha(0.35); g.rrect(s.x + sx + 1.5, s.y + 2.5, s.w, s.h + 1, 2, '#000'); g.alpha(1);
        g.rrect(s.x + sx, s.y, s.w, s.h + 1, 2, s.crumble ? '#7a4a30' : D(T.plat, 'geo'));
        g.rrect(s.x + sx, s.y, s.w, 1.5, 1, s.crumble ? '#ffcf9a' : T.platTop);
        g.glow(s.x + sx + s.w / 2, s.y, Math.min(30, s.w / 2), s.crumble ? '#ff9a2e' : T.edge, 0.18);
        if (s.crumble) for (let x = s.x + 3; x < s.x + s.w - 2; x += 7) g.rect(x + sx, s.y + 2.5, 2, 1, '#3e2418');
      } else {
        g.alpha(0.4); g.rect(s.x + 3, s.y + 3, s.w, s.h, '#000'); g.alpha(1);
        g.rect(s.x, s.y, s.w, s.h, D(T.solid, 'geo'));
        g.alpha(0.6); g.vgrad(s.x, s.y + 2, s.w, Math.min(16, s.h - 2), T.plat, T.solid, false); g.alpha(1);
        for (let y = s.y + 10; y < s.y + s.h; y += 10) { g.alpha(0.35); g.rect(s.x + 3, y, s.w - 6, 1, T.plat); g.alpha(1); }
        g.glow(s.x + s.w / 2, s.y, Math.min(60, s.w / 1.4), T.edge, 0.3);
        g.rect(s.x, s.y, s.w, 2.5, T.edge);
        g.rect(s.x, s.y, s.w, 0.8, '#ffffff');
        g.rect(s.x, s.y, 1, s.h, T.edge + '88'); g.rect(s.x + s.w - 1, s.y, 1, s.h, T.edge + '88');
      }
    }
    for (const m of movers) { g.rect(m.x, m.y, m.w, m.h, '#ffd84a'); for (let x = 0; x < m.w; x += 6) g.rect(m.x + x, m.y + 1, 3, m.h - 2, '#2a2414'); }
    // L3 hazards: the only saturated reds on screen
    for (const s of saws) {
      g.glow(s.x, s.y, s.r * 3, '#ff4a4a', 0.45);
      g.alpha(0.25); g.circle(s.x, s.y, s.r + 3, P.danger); g.alpha(1);
      g.circle(s.x, s.y, s.r, '#e8e4f0');
      for (let k = 0; k < 8; k++) { const a = s.rot + (k / 8) * TAU; g.rect(s.x + Math.cos(a) * (s.r + 1) - 1, s.y + Math.sin(a) * (s.r + 1) - 1, 2, 2, P.danger); }
      g.circle(s.x, s.y, s.r * 0.35, '#3a1010');
    }
    if (pend) {
      g.dotted(pend.ax, pend.ay, pend.x, pend.y, '#9a9ab0', 2);
      g.circle(pend.x, pend.y, pend.r, '#4a4a5a'); g.ring(pend.x, pend.y, pend.r, P.danger); g.circle(pend.x - 2, pend.y - 2, pend.r * 0.4, '#8a8a9a');
    }
    if (laser.state === 'warn') { // a steady warning column plus a 2.5 Hz pip: no fast strobing
      g.alpha(0.18); g.rect(laser.x - 5, 15, 10, 165, P.danger); g.alpha(1);
      g.dotted(laser.x, 15, laser.x, 180, P.danger, 3);
      if (Math.floor(t * 5) % 2) g.text('!', laser.x, 18, { scale: 3, col: P.warn, align: 'center', ui: false });
    }
    if (laser.state === 'on') { for (let y = 10; y < 180; y += 24) g.glow(laser.x, y, 18, '#ff4a4a', 0.35); g.alpha(0.35); g.rect(laser.x - 5, 0, 10, 180, P.danger); g.alpha(1); g.rect(laser.x - 2, 0, 4, 180, '#ff9a9a'); g.rect(laser.x - 1, 0, 2, 180, '#fff'); }
    for (const a of anvils) {
      if (a.warn > 0) { g.ring(a.x, a.ty - 3, 8, P.danger); g.text(String(Math.ceil(a.warn * 3)), a.x, a.ty - 22, { scale: 2, col: P.warn, align: 'center', ui: false }); }
      else { g.rect(a.x - 6, a.y - 9, 12, 4, '#9a9aaa'); g.rect(a.x - 3, a.y - 5, 6, 3, '#7a7a8a'); g.rect(a.x - 5, a.y - 2, 10, 2, '#9a9aaa'); }
    }
    pickups.draw(g);
    guns.draw(g);
    // L2 players: fixed seat colours; spawn shield is a ring, not a strobe
    for (const p of players) {
      if (p.dead) continue;
      const cx = p.b.x + p.b.w / 2;
      const shielded = p.hurtT > 0 && roundT < SPAWN_SHIELD + 0.05;
      const blink = !shielded && p.hurtT > 0 && p.hurtT < 0.5 && Math.floor(t * 8) % 2;
      g.glow(cx, p.b.y + p.b.h / 2, 16 * p.st.size, SEAT_COLORS[p.idx], 0.22); // a soft halo in your colour
      g.alpha(0.35); g.c.fillStyle = '#000'; g.c.beginPath(); g.c.ellipse((cx + g.ox) * 2, (groundBelow(cx) + g.oy) * 2, 9 * p.st.size * Math.max(0.3, 1 - (groundBelow(cx) - p.b.y - p.b.h) / 80), 2.4, 0, 0, TAU); g.c.fill(); g.alpha(1); // ground shadow
      drawPlayer(g, p.idx, cx, p.b.y + p.b.h, { flip: p.face < 0, size: p.st.size, flash: p.flashT > 0, alpha: blink ? 0.6 : 1, squash: p.b.squash, look: p.aim });
      drawGun(g, p.idx, cx, p.b.y + p.b.h / 2 - 1, p.aim ?? (p.face > 0 ? 0 : Math.PI), { size: p.st.size, recoil: p.recoil });
      if (shielded) { g.alpha(0.5); g.ring(cx, p.b.y + p.b.h / 2, 11 * p.st.size, SEAT_COLORS[p.idx]); g.alpha(1); }
      if (p.blockT > 0) { g.ring(cx, p.b.y + p.b.h / 2, 10 * p.st.size, '#9ff'); g.ring(cx, p.b.y + p.b.h / 2, 9 * p.st.size, P.safe); }
      else if (p.blockCd <= 0) g.rect(cx - 1, p.b.y + p.b.h + 2, 2, 1, P.safe);
      if (p.shields) g.ring(cx, p.b.y + p.b.h / 2, 8 * p.st.size, '#9fd3ff55');
      const gun = p.st.gun;
      if (p.gs.reloadT > 0) { g.rect(cx - 5, p.b.y + p.b.h + 4, 10, 1, '#3a3550'); g.rect(cx - 5, p.b.y + p.b.h + 4, 10 * guns.reloadFrac(p.gs, gun), 1, '#fff6a8'); }
      else for (let k = 0; k < gun.ammo; k++) g.rect(cx - gun.ammo * 1.25 + k * 2.5, p.b.y + p.b.h + 4, 1.5, 2, k < p.gs.ammo ? '#fff6a8' : '#3a3550');
      const hw = 18, hk = Math.max(0, p.hp / p.maxHp);
      g.rrect(cx - hw / 2 - 0.8, p.b.y - 5.3, hw + 1.6, 4.1, 1.6, '#0b0a12'); g.rrect(cx - hw / 2, p.b.y - 4.5, hw, 2.5, 1, '#3a1020');
      if (hk > 0) g.rrect(cx - hw / 2, p.b.y - 4.5, hw * hk, 2.5, 1, p.poison && p.poison.t > 0 ? '#9aff5a' : SEAT_COLORS[p.idx]);
      if (p.parryShots > 0) g.text('~'.repeat(Math.min(5, p.parryShots)), cx, p.b.y + p.b.h + 7, { scale: 1, col: '#ffd84a', align: 'center', ui: false, shadow: null });
      drawBuffs(g, p, cx, p.b.y - 7);
      drawTag(g, p.idx, cx, p.b.y - 6);
    }
    if (waterY < 182) { // electric water reads as danger: dark red body, bright crackle line
      for (let x = 10; x < 320; x += 40) g.glow(x, waterY, 22, '#ff4a4a', 0.25);
      g.alpha(0.7); g.rect(0, waterY, 320, 182 - waterY, '#3a0d1e'); g.alpha(1);
      for (let x = 0; x < 320; x += 2) g.rect(x, waterY + Math.sin(x * 0.2 + t * 6) * 1.2, 2, 1, (x / 2 + Math.floor(t * 3)) % 7 ? P.danger : '#ffd0d0');
    }
    for (const p of players) {
      if (!p.dead || p.perma || game.finished || between > 0) continue;
      const gh = p.ghost;
      drawPlayer(g, p.idx, gh.x, gh.y + Math.sin(t * 4 + p.idx) * 2, { alpha: 0.55, size: 0.9 });
      g.text(`P${p.idx + 1}`, gh.x, gh.y - 18, { scale: g.large ? 2 : 1, col: SEAT_COLORS[p.idx], align: 'center', ui: false });
      g.dotted(gh.x, gh.y + 4, gh.x, groundBelow(gh.x) - 2, gh.cd <= 0 ? P.danger : '#555', 5);
      if (gh.cd <= 0) g.text('X: ANVIL', gh.x, gh.y + 5, { scale: 1, col: P.warn, align: 'center', ui: false });
    }
    g.vignette(0.45);
    // round banner (the event's own cue for state changes)
    if (banner) {
      const k = Math.min(1, (BREAK - banner.t) * 6 + (banner.text.startsWith('ROUND') ? 1 : 0));
      g.alpha(0.78 * Math.min(1, k)); g.rect(0, 66, 320, banner.sub ? 40 : 30, P.ink, true); g.alpha(1);
      g.rect(0, 66, 320, 1, banner.col, true); g.rect(0, banner.sub ? 105 : 95, 320, 1, banner.col, true);
      g.text(banner.text, 160, 71, { scale: 3, col: banner.col, align: 'center', shadow: '#000' });
      if (banner.sub) g.text(banner.sub, 160, 93, { scale: 2, col: P.text, align: 'center' });
      // round pips under the banner: who is one win away
      const cs = contenders();
      cs.forEach((p, k2) => {
        const bx = 160 - (cs.length * 34) / 2 + k2 * 34 + 4;
        const by = banner.sub ? 110 : 100;
        g.rect(bx - 2, by - 1, 32, 10, P.ink, true);
        g.text(`P${p.idx + 1}`, bx, by, { scale: 1, col: SEAT_COLORS[p.idx], shadow: null });
        for (let w = 0; w < WIN; w++) { const px = bx + 14 + w * 7; if (w < p.wins) g.circle(px, by + 3.5, 2.6, SEAT_COLORS[p.idx], true); else g.ring(px, by + 3.5, 2.6, '#6a6290', true); }
      });
    }
  };
  resetRound();
  return game;
}
