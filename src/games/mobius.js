// MOBIUS LOOP: a world with two floors. Gravity pulls toward whichever surface
// you are closer to, so a double jump past the glowing horizon makes you FALL
// UP onto the ceiling. Walk (or shoot) off a side edge and you come out the
// other side on the opposite surface, upside down: the arena is a Mobius strip.
import { TAU, clamp, rand, approach, overlap, circleRect } from '../engine/util.js';
import { drawPlayer, drawTag, drawGun, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState, hitEffects, tickStatus } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { Drift, P } from '../engine/style.js';
import { makeRounds } from '../game/rounds.js';

export const meta = {
  id: 'mobius', name: 'MOBIUS LOOP', color: '#c86bff', music: 'rumble', tier: 3,
  tagline: 'Two floors. Gravity picks the closer one.',
  objective: 'Last one standing takes the round, if they landed a hit. First to 2. Double jump past the horizon to fall UP.',
  card: { rule: 'DOUBLE JUMP PAST THE MIDDLE: FALL UP', rule2: 'LAST STANDING + A HIT = ROUND. FIRST TO 2', keys: [['A', 'JUMP X2'], ['X', 'SHOOT'], ['RB', 'BLOCK']], danger: 'HORIZON SAWS, SPIKES, SIDE EDGES FLIP' },
  controls: [['STICK', 'Move and aim'], ['A', 'Jump (x2 = fall up)'], ['X / RT', 'Shoot (bullets curve)'], ['RB', 'Block'], ['R-STICK', 'Aim freely']],
  hazards: 'Horizon saws (faster from 10 s each round) / spikes arm on the floor OR ceiling / side edges flip you and bullets',
  ghost: 'Knocked out: fly your ghost, X drops a gravity bomb. Back next round',
  tiebreak: 'More round wins > longer survived > more health',
  gunUse: 'Your gun (bullets curve toward the floor or ceiling)', blockUse: 'Your block (RB)', bodyUse: 'Your body and jumps',
  twists: ['moon', 'heavy', 'wind', 'rubber', 'bullettime', 'giant', 'hyper', 'ice'],
};

const TOP = 16, BOT = 180, MID = (TOP + BOT) / 2;
const GRAV = 560;
const HAZ = 30;
const RUSH_AT = 10;   // each round's escalation: the horizon saws speed up
const mirrorY = (y, h = 0) => TOP + BOT - y - h;

const LAYOUTS = [
  { name: 'TWIN HORIZON',
    solids: [{ x: 0, y: 164, w: 320, h: 16 }, { x: 0, y: 16, w: 320, h: 16 },
      { x: 34, y: 126, w: 56, h: 5 }, { x: 230, y: 126, w: 56, h: 5 }, { x: 120, y: 63, w: 80, h: 5 },
      { x: 150, y: 90, w: 20, h: 16 }] },
  { name: 'STAIRS TO NOWHERE',
    solids: [{ x: 0, y: 164, w: 320, h: 16 }, { x: 0, y: 16, w: 320, h: 16 },
      { x: 60, y: 140, w: 40, h: 24 }, { x: 100, y: 122, w: 30, h: 5 },
      { x: 220, y: 32, w: 40, h: 24 }, { x: 190, y: 67, w: 30, h: 5 },
      { x: 270, y: 118, w: 40, h: 5 }, { x: 10, y: 71, w: 40, h: 5 }] },
  { name: 'HOURGLASS',
    solids: [{ x: 0, y: 164, w: 320, h: 16 }, { x: 0, y: 16, w: 320, h: 16 },
      { x: 140, y: 110, w: 40, h: 54 }, { x: 140, y: 32, w: 40, h: 54 },
      { x: 50, y: 120, w: 40, h: 5 }, { x: 230, y: 69, w: 40, h: 5 }] },
];
// spike strips: x ranges; they arm on the floor or the ceiling, never both
const STRIPS = [[12, 60], [130, 190], [262, 310]];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  const L = LAYOUTS[ctx.variant % LAYOUTS.length];
  const solids = L.solids.map((s) => ({ ...s }));
  let t = 0;
  const drift = ctx.drift || new Drift();
  let env = twistEnv(tw, 0);
  const spawns = [[50, 'floor'], [270, 'floor'], [160, 'ceil']];

  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const w = 8 * st.size, h = 11 * st.size;
    const [sx, side] = spawns[i % 3];
    const b = { x: sx - w / 2, y: side === 'floor' ? 164 - h : 32, w, h, vx: 0, vy: 0, onGround: false, jumps: 1, coyote: 0, buffer: 0, stun: 0, squash: 0, dir: side === 'floor' ? 1 : -1 };
    const p = {
      seat: pl.seat, idx: pl.idx, b, hp: st.hp, maxHp: st.hp,
      dead: !!pl.ghost, deathT: pl.ghost ? -1 : null, perma: !!pl.ghost, recoil: 0, face: sx < 160 ? 1 : -1, gs: newGunState(st.gun), mult: pl.pickupMult ?? 1,
      blockT: 0, blockCd: 0, shields: st.shields, hurtT: 0, flashT: 0, slowT: 0, poison: null,
      ghost: { x: sx, y: MID, cd: pl.ghost ? 1 : 0 },
    };
    p.pos = () => [p.b.x + p.b.w / 2, p.b.y + p.b.h / 2];
    return makeBuffable(p, st);
  });
  const saws = [{ x: 0, r: 7, v: 62 }, { x: 160, r: 7, v: 62 }];
  const spikes = { side: 1, armed: false, t: 0, next: 6, warn: 0 };
  const bombs = [];
  const stars = Array.from({ length: 50 }, () => ({ x: rand(0, 320), y: rand(TOP, BOT), s: rand(0.3, 1) }));
  const game = { meta, finished: false, ranking: [], players, layoutName: L.name };
  const alive = () => players.filter((p) => !p.dead);
  let rushSaid = false;
  const R = makeRounds({
    players, fx, sound, drift, cap: 22, time: 54,
    onReset: (p, k, round) => {
      const [sx, side] = spawns[(k + round - 1) % 3];
      const b = p.b;
      b.x = sx - b.w / 2; b.y = side === 'floor' ? 164 - b.h : 32; b.vx = 0; b.vy = 0; b.stun = 0; b.dir = side === 'floor' ? 1 : -1; b.onGround = true;
      p.hurtT = R.shield; p.blockT = 0; p.ghost.cd = 0; p.face = sx < 160 ? 1 : -1;
      fx.ring(sx, side === 'floor' ? 158 : 38, 16, SEAT_COLORS[p.idx], 0.5);
      spikes.armed = false; spikes.warn = 0; spikes.next = 6; bombs.length = 0; guns.bullets.length = 0; rushSaid = false;
    },
  });

  function solidAt(x, y) {
    for (const s of solids) if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return { rect: s };
    return null;
  }
  function hurt(p, dmg, kx, ky, { inv = 0.6, src = null, g = null } = {}) {
    if (p.dead || p.hurtT > 0) return 'none';
    const [cx, cy] = p.pos();
    if (p.blockT > 0) { fx.ring(cx, cy, 12, '#9ff'); sound.sfx('block'); return 'blocked'; }
    if (p.shields > 0) { p.shields -= 1; p.hurtT = 0.4; fx.popup('AIRBAG!', cx, cy - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
    p.hp -= dmg; p.hurtT = inv; p.flashT = 0.12;
    if (src && src !== p && src.dealt !== undefined) src.dealt += dmg;
    p.b.vx += kx * p.st.knockTaken; p.b.vy += ky * p.st.knockTaken; p.b.stun = 0.22;
    fx.impact(cx, cy, { dmg, col: SEAT_COLORS[p.idx], dx: kx, dy: ky }); sound.sfx(dmg >= 30 ? 'hitBig' : 'hit');
    fx.popup(String(Math.round(dmg)), cx, cy - 8, '#fff', 1);
    if (g && src) hitEffects(p, src, dmg, g);
    if (p.hp <= 0) kill(p);
    return 'hit';
  }
  function kill(p) {
    p.dead = true; p.deathT = t; p.hp = 0;
    const [cx, cy] = p.pos();
    fx.ko(cx, cy, SEAT_COLORS[p.idx]); sound.sfx('ko'); drift.hush(0.7);
    fx.popup(`P${p.idx + 1} OUT!`, cx, cy - 16, SEAT_COLORS[p.idx], 3);
    p.ghost.x = cx; p.ghost.y = MID;
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: BOT, open: { left: true, right: true }, noWrap: true },
    accel: (x, y) => [env.wind, 140 * env.bulletGrav * (y < MID ? -1 : 1)],
    solidAt,
    targets: () => alive().map((p) => ({ ref: p, owner: p, rect: p.b, r: p.b.w / 2 })),
    onHit: (p, info) => {
      if (p.dead) return 'none';
      if (p.blockT > 0 && p.st.reflect && info.kind === 'bullet') return 'reflect';
      const k = (info.kind === 'blast' ? 190 : 150) * (info.g.knock || 1);
      return hurt(p, info.dmg, info.dx * k, info.dy * k * 0.7 - 70 * p.b.dir, { inv: 0, src: info.owner, g: info.g }) === 'none' ? 'none' : 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, spot: () => (Math.random() < 0.5 ? [rand(20, 300), 154] : [rand(20, 300), 42]) });

  // bullets that leave a side come back on the other side, mirrored top-to-bottom
  function wrapBullets() {
    for (const b of guns.bullets) {
      if (b.x >= 0 && b.x <= 320) continue;
      b.x += b.x < 0 ? 320 : -320; b.y = mirrorY(b.y); b.vy = -b.vy;
      if (b.trail) b.trail.length = 0;
    }
  }

  function free(b) { for (const s of solids) if (overlap(b, s)) return false; return true; }
  function flipSide(p) {
    const b = p.b;
    b.y = mirrorY(b.y, b.h); b.vy = -b.vy;
    for (let k = 0; k < 40 && !free(b); k++) b.y += b.y + b.h / 2 < MID ? 1 : -1; // nudge out of anything
    const [cx, cy] = p.pos();
    fx.burst(cx, cy, 12, '#c86bff', { speed: 80, life: 0.4 }); sound.sfx('dash');
    fx.popup('FLIP!', cx, cy + (cy < MID ? 14 : -14), '#c86bff', 1);
  }

  function control(p, c, dt) {
    const b = p.b, st = p.st;
    const dirNow = b.y + b.h / 2 < MID ? -1 : 1;
    if (dirNow !== b.dir) { b.dir = dirNow; sound.sfx('boing'); }
    const max = 92 * st.speed * (p.slowT > 0 ? 0.55 : 1);
    const ice = env.ice;
    if (b.stun > 0) b.stun -= dt;
    else b.vx = approach(b.vx, c.mx * max, (b.onGround ? (ice ? 200 : 1100) : (ice ? 420 : 750)) * dt);
    if (b.onGround) { b.coyote = 0.1; b.jumps = st.airJumps ?? 1; } else b.coyote -= dt;
    b.buffer = c.jumpP ? 0.12 : b.buffer - dt;
    let ev = null;
    if (b.buffer > 0) {
      const v = 232 * Math.sqrt(st.jump);
      if (b.coyote > 0) { b.vy = -b.dir * v; ev = 'jump'; } else if (b.jumps > 0) { b.jumps -= 1; b.vy = -b.dir * v * 0.95; ev = 'djump'; }
      if (ev) { b.coyote = 0; b.buffer = 0; b.squash = -0.8; b.onGround = false; }
    }
    const grav = GRAV * st.grav * env.grav * (b.vy * b.dir < 0 && !c.jump ? 2.1 : 1);
    b.vy = clamp(b.vy + grav * b.dir * dt, -430, 430);
    b.vx += env.wind * 0.8 * dt;
    return ev;
  }
  function step(p, dt) {
    const b = p.b;
    b.squash *= Math.pow(0.0005, dt);
    b.x += b.vx * dt;
    for (const s of solids) {
      if (!overlap(b, s)) continue;
      if (b.x + b.w / 2 < s.x + s.w / 2) b.x = s.x - b.w; else b.x = s.x + s.w;
      b.vx = 0;
    }
    const cx = b.x + b.w / 2;
    if (cx < 0 || cx > 320) { b.x += cx < 0 ? 320 : -320; flipSide(p); }
    const was = b.onGround;
    b.y += b.vy * dt; b.onGround = false;
    for (const s of solids) {
      if (!overlap(b, s)) continue;
      const falling = b.vy * b.dir >= 0;
      if (b.dir > 0) { if (falling && b.y + b.h - b.vy * dt <= s.y + 3) { b.y = s.y - b.h; b.vy = 0; b.onGround = true; } else if (b.vy < 0) { b.y = s.y + s.h; b.vy = 0; } }
      else if (falling && b.y - b.vy * dt >= s.y + s.h - 3) { b.y = s.y + s.h; b.vy = 0; b.onGround = true; } else if (b.vy > 0) { b.y = s.y - b.h; b.vy = 0; }
    }
    b.y = clamp(b.y, 32, 164 - b.h);
    if (!was && b.onGround) { b.squash = 0.7; fx.dust(b.x + b.w / 2, b.dir > 0 ? b.y + b.h : b.y, '#b48cff'); }
  }

  function block(p) {
    p.blockT = 0.3; p.blockCd = 2.6 * p.st.blockCd; sound.sfx('block');
    const [cx, cy] = p.pos();
    if (p.st.blockShock) {
      const R = 26 + 10 * p.st.blockShock;
      fx.ring(cx, cy, R, '#5affd9', 0.3); sound.sfx('boom');
      for (const o of alive()) { if (o === p) continue; const [ox, oy] = o.pos(); const d = Math.hypot(ox - cx, oy - cy); if (d < R) hurt(o, 12, ((ox - cx) / (d || 1)) * 230, -170 * o.b.dir, { inv: 0.1, src: p }); }
    }
    if (p.st.blockBlink) { p.b.x = clamp(p.b.x + p.face * 40 * p.st.blockBlink, 0, 320 - p.b.w); if (!free(p.b)) p.b.x -= p.face * 40 * p.st.blockBlink; }
    if (p.st.blockHeal) { p.hp = Math.min(p.maxHp, p.hp + p.st.blockHeal); fx.popup(`+${p.st.blockHeal}`, cx, cy - 12, '#7dff8a', 1); }
  }

  function hazards(dt) {
    for (const s of saws) {
      s.x = (s.x + s.v * (R.roundT > RUSH_AT ? 1.7 : 1) * dt) % 320;
      for (const p of alive()) if (circleRect(s.x, MID, s.r, p.b)) hurt(p, HAZ, (p.b.x + p.b.w / 2 < s.x ? -1 : 1) * 160, 220 * (p.b.y + p.b.h / 2 < MID ? -1 : 1));
    }
    if (R.roundT > RUSH_AT && !rushSaid) { rushSaid = true; fx.popup('THE HORIZON SPEEDS UP', 160, MID - 22, P.danger, 2); sound.sfx('warn'); }
    // spike strips: warn, arm on one surface, swap
    if (!spikes.armed && R.roundT >= spikes.next) {
      if (spikes.warn <= 0) { spikes.warn = 1.1; spikes.side = Math.random() < 0.5 ? 1 : -1; sound.sfx('warn'); fx.popup(spikes.side > 0 ? 'FLOOR SPIKES!' : 'CEILING SPIKES!', 160, spikes.side > 0 ? 150 : 46, P.danger, 2); }
      spikes.warn -= dt;
      if (spikes.warn <= 0) { spikes.armed = true; spikes.t = 2.6; sound.sfx('zap'); }
    } else if (spikes.armed) {
      spikes.t -= dt;
      for (const p of alive()) {
        if (!p.b.onGround || p.b.dir !== spikes.side) continue;
        const cx = p.b.x + p.b.w / 2;
        const onFloorLine = spikes.side > 0 ? p.b.y + p.b.h >= 163 : p.b.y <= 33;
        if (onFloorLine && STRIPS.some(([a, z]) => cx > a && cx < z)) { if (hurt(p, HAZ, 0, -260 * spikes.side) !== 'none') sound.sfx('zap'); }
      }
      if (spikes.t <= 0) { spikes.armed = false; spikes.next = R.roundT + rand(3, 5); }
    }
    for (let i = bombs.length - 1; i >= 0; i--) {
      const a = bombs[i];
      if (a.warn > 0) { a.warn -= dt; continue; }
      a.vy += 700 * a.dir * dt; a.y += a.vy * dt;
      const box = { x: a.x - 6, y: a.y - 5, w: 12, h: 10 };
      let boom = (a.dir > 0 && a.y > 160) || (a.dir < 0 && a.y < 36);
      for (const p of alive()) if (overlap(box, p.b)) boom = true;
      if (boom) {
        fx.burst(a.x, a.y, 20, '#c86bff', { speed: 120, life: 0.5 }); fx.ring(a.x, a.y, 22, '#fff', 0.3); fx.shake(0.35); sound.sfx('boom');
        for (const p of alive()) { const [px, py] = p.pos(); if (Math.hypot(px - a.x, py - a.y) < 22) hurt(p, HAZ, Math.sign(px - a.x || 1) * 160, -200 * p.b.dir); }
        bombs.splice(i, 1);
      }
    }
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    for (const p of players) p.recoil *= Math.pow(0.0001, dt);
    const phase = R.tick(dt);
    if (phase === 'done') { if (!game.finished) { game.finished = true; game.ranking = R.rank(); } return; }
    if (phase !== 'play') { wrapBullets(); guns.update(dt); wrapBullets(); return; }
    hazards(dt);
    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.dead) {
        const gh = p.ghost;
        gh.x = clamp(gh.x + c.mx * 150 * dt, 6, 314); gh.y = clamp(gh.y + c.my * 150 * dt, 40, 156); gh.cd -= dt;
        if (c.fireP && gh.cd <= 0) { bombs.push({ x: gh.x, y: gh.y, vy: 0, dir: gh.y < MID ? -1 : 1, warn: 0.6 }); gh.cd = 3.5; sound.sfx('warn'); }
        continue;
      }
      tickBuffs(p, dt);
      p.hurtT -= dt; p.flashT -= dt; p.blockT -= dt; p.blockCd -= dt; p.slowT -= dt;
      const pd = tickStatus(p, dt); if (pd) { p.hp -= pd; if (p.hp <= 0) { kill(p); continue; } }
      const ev = control(p, c, dt);
      if (ev) { sound.sfx('jump'); const [cx] = p.pos(); fx.dust(cx, p.b.dir > 0 ? p.b.y + p.b.h : p.b.y, '#b48cff'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      if (c.blockP && p.blockCd <= 0) block(p);
      let a;
      if (c.aim) a = Math.atan2(c.ay, c.ax);
      else if (Math.hypot(c.mx, c.my) > 0.4) a = Math.atan2(c.my, c.mx);
      else a = p.face > 0 ? 0 : Math.PI;
      p.aim = a;
      const [cx, cy] = p.pos();
      if (guns.trigger(p, p.gs, p.st.gun, c.fire, a, cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, dt)) { p.b.vx -= Math.cos(a) * 30 * Math.sqrt(p.st.gun.knock); p.b.squash = 0.2; p.recoil = 1; }
      step(p, dt);
    }
    wrapBullets();
    guns.update(dt);
    wrapBullets();
    pickups.update(dt, alive().map((p) => { const [x, y] = p.pos(); return { p, x, y, r: p.b.w / 2 + 2, mult: p.mult }; }));
    R.check(dt);
  };
  game.hud = R.hud;
  game.hudInfo = (seat) => R.hudInfo(seat, 'GHOST');
  game.leader = R.leader;
  game.matchPoint = R.matchPoint;
  Object.defineProperty(game, 'round', { get: () => R.round });
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || p.dead) return null;
    if (spikes.armed && p.b.dir === spikes.side) return [p.b.x + p.b.w / 2, spikes.side > 0 ? 40 : 160]; // get off the spiked surface
    let best = null, bd = 1e9;
    for (const o of alive()) { if (o === p) continue; const [ox, oy] = o.pos(); const d = Math.hypot(ox - p.b.x, oy - p.b.y); if (d < bd) { bd = d; best = [ox, oy]; } }
    return best;
  };
  Object.defineProperty(game, 'timeLeft', { get: () => R.timeLeft() });

  game.draw = (g) => {
    // two skies: the ceiling world is the floor world's negative
    const D = (c, layer = 'bg') => drift.col(c, layer);
    // L0: two skies, the ceiling world is the floor world's negative. Stars hold still.
    g.rect(0, 0, 320, MID, D('#1d0b2e'), true);
    g.rect(0, MID, 320, 180 - MID, D('#0b1d2e'), true);
    for (const s of stars) { const up = s.y < MID; g.rect(s.x, s.y, 1, 1, D(up ? '#7a4a8a' : '#3a6a8a'), true); }
    g.text(L.name, 160, MID - 12, { scale: 2, col: D('#3a1d5a'), align: 'center', ui: false, shadow: null });
    // the horizon: a calm line that tells you where gravity changes sides
    g.alpha(0.5); g.rect(0, MID - 1, 320, 3, '#c86bff'); g.alpha(1);
    for (let x = 0; x < 320; x += 2) g.rect(x, MID + Math.sin(x * 0.08 + t * 1.5) * 1, 2, 1, '#e8c8ff');
    // edge markers: leaving here flips you (steady arrows, no strobe)
    for (const ex of [2, 316]) for (let y = 40; y < 160; y += 16) g.text(y < MID ? 'v' : '^', ex + 1, y, { scale: 1, col: '#8a5ab0', align: 'center', ui: false, shadow: null });
    // L1 geometry: fill drifts a little, the standing edge is fixed and bright
    for (const s of solids) {
      const up = s.y + s.h / 2 < MID;
      g.rect(s.x, s.y, s.w, s.h, D(up ? '#3a1d4e' : '#1d3a4e', 'geo'));
      g.rect(s.x, up ? s.y + s.h - 2 : s.y, s.w, 2, up ? '#ffc8f0' : '#c8f0ff');
    }
    // spike strips
    for (const [a, z] of STRIPS) for (const side of [1, -1]) {
      const live = spikes.armed && spikes.side === side, warn = !spikes.armed && spikes.warn > 0 && spikes.side === side;
      const y = side > 0 ? 164 : 32;
      for (let x = a; x < z; x += 6) {
        const h = live ? 5 : warn ? 3 : 1;
        g.rect(x + 1, side > 0 ? y - h : y, 3, h, live ? P.danger : warn ? P.warn : '#5a5a7a');
      }
    }
    for (const s of saws) {
      for (const dx of [0, -320, 320]) {
        const x = s.x + dx; if (x < -10 || x > 330) continue;
        g.alpha(0.25); g.circle(x, MID, s.r + 3, P.danger); g.alpha(1);
        g.circle(x, MID, s.r, '#e8e4f0');
        for (let k = 0; k < 8; k++) { const a = t * 12 + (k / 8) * TAU; g.rect(x + Math.cos(a) * (s.r + 1) - 1, MID + Math.sin(a) * (s.r + 1) - 1, 2, 2, P.danger); }
        g.circle(x, MID, s.r * 0.35, '#3a1010');
      }
    }
    for (const a of bombs) {
      if (a.warn > 0) g.ring(a.x, a.y, 7, P.danger);
      g.circle(a.x, a.y, 5, '#2a1040'); g.ring(a.x, a.y, 5, '#c86bff');
    }
    pickups.draw(g);
    guns.draw(g);
    for (const p of players) {
      if (p.dead) continue;
      const b = p.b, cx = b.x + b.w / 2, up = b.dir < 0;
      const shielded = p.hurtT > 0 && R.roundT < R.shield + 0.05;
      const blink = !shielded && p.hurtT > 0 && p.hurtT < 0.5 && Math.floor(t * 8) % 2;
      drawPlayer(g, p.idx, cx, up ? b.y : b.y + b.h, { flip: p.face < 0, size: p.st.size, flash: p.flashT > 0, alpha: blink ? 0.6 : 1, squash: b.squash, flipY: up, look: p.aim });
      const cy = b.y + b.h / 2;
      drawGun(g, p.idx, cx, cy, p.aim || 0, { size: p.st.size, recoil: p.recoil });
      if (shielded) { g.alpha(0.5); g.ring(cx, cy, 11 * p.st.size, SEAT_COLORS[p.idx]); g.alpha(1); }
      if (p.blockT > 0) g.ring(cx, cy, 10 * p.st.size, '#5affd9');
      if (p.shields) g.ring(cx, cy, 8 * p.st.size, '#9fd3ff55');
      const barY = up ? b.y + b.h + 3 : b.y - 3;
      g.rect(cx - 8, barY, 16, 3, '#3a1020'); g.rect(cx - 8, barY, 16 * Math.max(0, p.hp / p.maxHp), 3, p.poison && p.poison.t > 0 ? '#9aff5a' : SEAT_COLORS[p.idx]);
      drawBuffs(g, p, cx, up ? b.y + b.h + 8 : b.y - 6);
      drawTag(g, p.idx, cx, up ? b.y + b.h + 14 : b.y - 5);
    }
    for (const p of players) {
      if (!p.dead || game.finished || R.between > 0) continue;
      const gh = p.ghost;
      drawPlayer(g, p.idx, gh.x, gh.y + 6 + Math.sin(t * 4 + p.idx) * 2, { alpha: 0.5, size: 0.9, flipY: gh.y < MID });
      g.text(gh.cd <= 0 ? `P${p.idx + 1} X:BOMB` : `P${p.idx + 1}`, gh.x, gh.y - 14, { scale: g.large ? 2 : 1, col: SEAT_COLORS[p.idx], align: 'center', ui: false });
    }
    R.draw(g);
  };
  R.reset();
  return game;
}
