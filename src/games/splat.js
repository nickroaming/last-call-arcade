// SPLAT CITY: top-down paint war. Bullets paint the streets as they fly and
// splat where they land. Bounces = more paint. Most of the map wins.
import { TAU, clamp, rand, approach, circleRect } from '../engine/util.js';
import { drawPlayer, drawTag, drawArm, SEAT_COLORS, SEAT_DARK } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';

export const meta = {
  id: 'splat', name: 'SPLAT CITY', color: '#ff9a2e', music: 'coins', tier: 1,
  tagline: 'A paint war in the streets',
  card: { rule: 'PAINT THE MOST OF THE CITY', rule2: 'BULLETS PAINT. HITS SPLAT YOUR COLOUR', keys: [['X', 'SHOOT'], ['A', 'DASH'], ['RB', 'BLOCK']], danger: 'SWEEPERS, SPRINKLER, RAIN' },
  objective: 'Paint the most of the city. Bullets paint as they fly and splat where they land.',
  controls: [['STICK', 'Move and aim (your feet paint too)'], ['X / RT', 'Shoot paint'], ['A', 'Dash'], ['RB', 'Block']],
  hazards: 'Street sweepers / a spinning sprinkler / rain clouds that wash paint away',
  ghost: 'Nobody is knocked out. Getting shot splats their paint around you',
  tiebreak: 'More painted squares > painted most recently',
  gunUse: 'Your paint gun (bounces paint more)', blockUse: 'Your block and dash', bodyUse: 'Your body',
  twists: ['wind', 'rubber', 'giant', 'warp', 'ice', 'hyper', 'bullettime'],
};

const CELL = 8, COLS = 40, ROWS = 20, TOP = 18;
const TIME = 32;
const BLOCKS = [{ x: 64, y: 52, w: 32, h: 18 }, { x: 224, y: 52, w: 32, h: 18 }, { x: 64, y: 128, w: 32, h: 18 }, { x: 224, y: 128, w: 32, h: 18 }, { x: 148, y: 90, w: 24, h: 18 }];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  let env = twistEnv(tw, 0);
  let t = 0, endT = null;
  const paint = new Int8Array(COLS * ROWS);
  const solidCell = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cx = c * CELL + 4, cy = TOP + r * CELL + 4;
    if (BLOCKS.some((b) => cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h)) solidCell[r * COLS + c] = 1;
  }
  const paintable = solidCell.reduce((a, v) => a + (v ? 0 : 1), 0);
  const starts = [[30, 40], [290, 40], [160, 160]];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const p = {
      seat: pl.seat, idx: pl.idx, x: starts[i][0], y: starts[i][1], vx: 0, vy: 0, r: 4.5 * st.size, face: 1,
      gs: newGunState(st.gun), dashT: 0, dashCd: 0, blockT: 0, blockCd: 0, stun: 0, slowT: 0, flashT: 0, shields: st.shields, mult: pl.pickupMult ?? 1, lastPaint: 0,
    };
    p.pos = () => [p.x, p.y];
    return makeBuffable(p, st);
  });
  const sweepers = [];
  let sweepT = 4;
  const sprinkler = { a: 0, on: false };
  const clouds = [];
  let cloudT = 18;
  const game = { meta, finished: false, ranking: [], players };

  function paintAt(x, y, rad, idx, erase = false) {
    const c0 = Math.max(0, Math.floor((x - rad) / CELL)), c1 = Math.min(COLS - 1, Math.floor((x + rad) / CELL));
    const r0 = Math.max(0, Math.floor((y - TOP - rad) / CELL)), r1 = Math.min(ROWS - 1, Math.floor((y - TOP + rad) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * COLS + c;
      if (solidCell[k]) continue;
      const cx = c * CELL + 4, cy = TOP + r * CELL + 4;
      if ((cx - x) ** 2 + (cy - y) ** 2 > (rad + 3) ** 2) continue;
      paint[k] = erase ? 0 : idx + 1;
    }
  }
  const counts = () => { const n = [0, 0, 0]; for (let i = 0; i < paint.length; i++) if (paint[i]) n[paint[i] - 1]++; return n; };

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: TOP + ROWS * CELL, open: {} },
    accel: () => [env.wind, 0],
    solidAt: (x, y) => { for (const b of BLOCKS) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { rect: b }; return null; },
    targets: () => players.map((p) => ({ ref: p, owner: p, x: p.x, y: p.y, r: p.r })),
    onHit: (p, info) => {
      if (p.blockT > 0) { if (p.st.reflect && info.kind === 'bullet') return 'reflect'; sound.sfx('block'); return 'blocked'; }
      if (p.shields > 0) { p.shields -= 1; fx.popup('AIRBAG!', p.x, p.y - 12, '#9fd3ff', 1); return 'blocked'; }
      const k = 120 * (info.g.knock || 1) * p.st.knockTaken;
      p.vx += info.dx * k; p.vy += info.dy * k; p.stun = 0.4; p.flashT = 0.12;
      if (info.g.frost) p.slowT = 1.5;
      if (info.owner) { paintAt(p.x, p.y, 10 + Math.min(10, info.dmg / 8), info.owner.idx); fx.burst(p.x, p.y, 14, SEAT_COLORS[info.owner.idx], { speed: 90, life: 0.4, size: 2 }); }
      fx.impact(p.x, p.y, { dmg: info.dmg, col: SEAT_COLORS[p.idx], dx: info.dx, dy: info.dy }); sound.sfx('hit');
      return 'hit';
    },
    onPaint: (b, x, y, end) => {
      if (!b.owner) return;
      if (end) { paintAt(x, y, 8 + b.r * 2 + (b.g.explode ? 8 : 0), b.owner.idx); fx.burst(x, y, 6, SEAT_COLORS[b.owner.idx], { speed: 50, life: 0.3 }); }
      else paintAt(x, y, Math.max(2, b.r * 1.4), b.owner.idx);
      b.owner.lastPaint = t;
    },
    onBlast: (x, y, r, owner) => { if (owner) paintAt(x, y, r, owner.idx); },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['rapid', 'mega', 'speed', 'bounce'], spot: () => { for (;;) { const x = rand(12, 308), y = rand(TOP + 10, 170); if (!BLOCKS.some((b) => circleRect(x, y, 8, b))) return [x, y]; } } });

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    // sweepers
    sweepT -= dt;
    if (sweepT <= 0) {
      sweepT = 5;
      const horiz = Math.random() < 0.5, fwd = Math.random() < 0.5;
      sweepers.push(horiz
        ? { horiz, x: fwd ? -14 : 334, y: [36, 98, 160][Math.floor(rand(0, 3))], v: fwd ? 70 : -70, warn: 1 }
        : { horiz, x: [40, 120, 200, 280][Math.floor(rand(0, 4))], y: fwd ? 4 : 192, v: fwd ? 60 : -60, warn: 1 });
      sound.sfx('warn');
    }
    for (let i = sweepers.length - 1; i >= 0; i--) {
      const s = sweepers[i];
      if (s.warn > 0) { s.warn -= dt; continue; }
      if (s.horiz) s.x += s.v * dt; else s.y += s.v * dt;
      paintAt(s.x, s.y, 9, 0, true);
      for (const p of players) if (Math.hypot(p.x - s.x, p.y - s.y) < p.r + 9) { p.vx += (s.horiz ? Math.sign(s.v) * 150 : (p.x - s.x) * 8); p.vy += (s.horiz ? (p.y - s.y) * 8 : Math.sign(s.v) * 150); p.stun = 0.4; }
      if (s.x < -30 || s.x > 350 || s.y < -20 || s.y > 200) sweepers.splice(i, 1);
    }
    // sprinkler
    if (t > 9) {
      if (!sprinkler.on) { sprinkler.on = true; fx.popup('SPRINKLER ON!', 160, 70, '#33d6ff', 2); sound.sfx('warn'); }
      sprinkler.a += 1.1 * dt;
      for (let d = 14; d < 78; d += 4) paintAt(160 + Math.cos(sprinkler.a) * d, 99 + Math.sin(sprinkler.a) * d, 3, 0, true);
      if (Math.random() < 0.8) fx.burst(160 + Math.cos(sprinkler.a) * rand(14, 78), 99 + Math.sin(sprinkler.a) * rand(14, 78), 1, '#8fe8ff', { speed: 20, life: 0.3 });
    }
    // rain clouds
    cloudT -= dt;
    if (cloudT <= 0) { cloudT = 6; clouds.push({ x: rand(40, 280), y: rand(40, 160), r: 26, warn: 1.3, life: 0.6 }); sound.sfx('warn'); }
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      if (c.warn > 0) { c.warn -= dt; if (c.warn <= 0) { paintAt(c.x, c.y, c.r, 0, true); sound.sfx('zap'); fx.burst(c.x, c.y, 20, '#8fe8ff', { speed: 80, life: 0.5 }); } continue; }
      c.life -= dt; if (c.life <= 0) clouds.splice(i, 1);
    }
    for (const p of players) {
      const c = controls.get(p.seat);
      tickBuffs(p, dt);
      p.dashCd -= dt; p.blockT -= dt; p.blockCd -= dt; p.slowT -= dt; p.flashT -= dt;
      const max = 85 * p.st.speed * (p.slowT > 0 ? 0.55 : 1);
      if (p.dashT > 0) p.dashT -= dt;
      else if (p.stun > 0) { p.stun -= dt; p.vx *= Math.pow(0.1, dt); p.vy *= Math.pow(0.1, dt); }
      else {
        const acc = env.ice ? 220 : 900;
        p.vx = approach(p.vx, c.mx * max, acc * dt) + env.wind * 0.4 * dt;
        p.vy = approach(p.vy, c.my * max, acc * dt);
        if (c.jumpP && p.dashCd <= 0) {
          const m = Math.hypot(c.mx, c.my); const dx = m > 0.2 ? c.mx / m : p.face, dy = m > 0.2 ? c.my / m : 0;
          p.vx = dx * 250; p.vy = dy * 250; p.dashT = 0.15; p.dashCd = 1.2 * p.st.blockCd; sound.sfx('dash');
        }
      }
      if (c.blockP && p.blockCd <= 0) {
        p.blockT = 0.35; p.blockCd = 2.4 * p.st.blockCd; sound.sfx('block');
        if (p.st.blockShock) { fx.ring(p.x, p.y, 28, '#5affd9', 0.3); paintAt(p.x, p.y, 22, p.idx); }
      }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      p.x = clamp(p.x + p.vx * dt, p.r, 320 - p.r); p.y = clamp(p.y + p.vy * dt, TOP + p.r, TOP + ROWS * CELL - p.r);
      for (const b of BLOCKS) {
        if (!circleRect(p.x, p.y, p.r, b)) continue;
        const nx = clamp(p.x, b.x, b.x + b.w), ny = clamp(p.y, b.y, b.y + b.h);
        const dx = p.x - nx, dy = p.y - ny, d = Math.hypot(dx, dy) || 1;
        p.x = nx + (dx / d) * (p.r + 0.1); p.y = ny + (dy / d) * (p.r + 0.1);
      }
      paintAt(p.x, p.y, 4 * p.st.size + (p.dashT > 0 ? 3 : 0), p.idx);
      if (p.st.magnet) paintAt(p.x, p.y, 10, p.idx);
      const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.3 ? Math.atan2(c.my, c.mx) : (p.face > 0 ? 0 : Math.PI);
      p.aim = a;
      if (p.stun <= 0) guns.trigger(p, p.gs, p.st.gun, c.fire, a, p.x + Math.cos(a) * 6, p.y + Math.sin(a) * 6, dt);
    }
    guns.update(dt);
    pickups.update(dt, players.map((p) => ({ p, x: p.x, y: p.y, r: p.r + 2, mult: p.mult })));
    if (endT === null && t >= TIME) endT = 0.8;
    if (endT !== null) {
      endT -= dt;
      if (endT <= 0 && !game.finished) {
        game.finished = true;
        const n = counts();
        game.ranking = players.slice().sort((a, b) => n[b.idx] - n[a.idx] || b.lastPaint - a.lastPaint).map((p) => p.seat);
      }
    }
  };
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return `${Math.round((counts()[p.idx] / paintable) * 100)}%`; };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    g.rect(0, 0, 320, 180, '#15141c', true);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const k = r * COLS + c; const x = c * CELL, y = TOP + r * CELL;
      const v = paint[k];
      if (!v) { if ((c + r) % 2) g.rect(x, y, CELL, CELL, '#1b1a24'); continue; }
      const i = v - 1;
      g.rect(x, y, CELL, CELL, SEAT_COLORS[i]);
      if (i === 0) { g.rect(x + 1, y + 5, 2, 2, SEAT_DARK[0]); g.rect(x + 3, y + 3, 2, 2, SEAT_DARK[0]); g.rect(x + 5, y + 1, 2, 2, SEAT_DARK[0]); }
      else if (i === 1) g.rect(x + 3, y + 3, 2, 2, SEAT_DARK[1]);
      else g.rect(x, y + 3, CELL, 2, SEAT_DARK[2]);
    }
    for (let x = 0; x < 320; x += 40) g.rect(x, TOP, 1, ROWS * CELL, '#ffffff10');
    for (const b of BLOCKS) {
      g.rect(b.x, b.y, b.w, b.h, '#3a3550'); g.rect(b.x, b.y, b.w, 3, '#6c5fae');
      for (let x = b.x + 3; x < b.x + b.w - 2; x += 6) g.rect(x, b.y + 6, 3, 3, Math.floor(t + x) % 4 ? '#ffd27a' : '#2a2540');
    }
    if (sprinkler.on) {
      for (let d = 14; d < 78; d += 3) g.rect(160 + Math.cos(sprinkler.a) * d, 99 + Math.sin(sprinkler.a) * d, 2, 2, '#8fe8ff');
      g.circle(160, 99, 4, '#33d6ff');
    }
    for (const c of clouds) {
      if (c.warn > 0) { g.ring(c.x, c.y, c.r, Math.floor(t * 5) % 2 ? '#8fe8ff' : '#33d6ff'); g.text('!', c.x, c.y - 4, { scale: 2, col: '#8fe8ff', align: 'center', ui: false }); }
      else { g.alpha(0.5); g.circle(c.x, c.y, c.r, '#8fe8ff'); g.alpha(1); }
    }
    for (const s of sweepers) {
      if (s.warn > 0) { if (Math.floor(t * 5) % 2) g.text(s.horiz ? (s.v > 0 ? '>>' : '<<') : (s.v > 0 ? 'VV' : '^^'), clamp(s.x, 10, 310), clamp(s.y, TOP + 4, 170), { scale: 2, col: '#ffd84a', align: 'center', ui: false }); continue; }
      const w = s.horiz ? 18 : 12, h = s.horiz ? 12 : 18;
      g.rect(s.x - w / 2, s.y - h / 2, w, h, '#ffd84a'); g.rect(s.x - w / 2 + 2, s.y - h / 2 + 2, w - 4, h - 4, '#3a3000');
      g.rect(s.x - 1, s.y - 1, 3, 3, Math.floor(t * 8) % 2 ? '#ff5a3a' : '#ffd84a');
    }
    pickups.draw(g);
    guns.draw(g);
    for (const p of players) {
      g.circle(p.x, p.y - 1, p.r + 4, '#0b0a12'); g.ring(p.x, p.y - 1, p.r + 4, '#ffffff');
      drawPlayer(g, p.idx, p.x, p.y + p.r, { flip: p.face < 0, size: p.st.size * 0.9, flash: p.flashT > 0, look: p.aim });
      drawArm(g, p, p.x, p.y, p.st.size * 0.9);
      if (p.blockT > 0) g.ring(p.x, p.y, p.r + 4, '#5affd9');
      if (p.stun > 0) for (let k = 0; k < 3; k++) { const a = t * 8 + k * 2; g.rect(p.x + Math.cos(a) * 5, p.y - 10 + Math.sin(a) * 2, 1, 1, '#ffd84a'); }
      drawTag(g, p.idx, p.x, p.y - 7 * p.st.size);
      drawBuffs(g, p, p.x, p.y + p.r + 2);
    }
  };
  return game;
}
