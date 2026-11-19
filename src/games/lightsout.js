// LIGHTS OUT: a heist in a pitch-dark warehouse. You only see what your
// flashlight, gunfire and lightning reveal. A guard robot sweeps a red
// searchlight; get caught in it and you drop your loot.
import { TAU, clamp, rand, approach, circleRect, angleDiff } from '../engine/util.js';
import { drawPlayer, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { S } from '../engine/gfx.js';

export const meta = {
  id: 'lightsout', name: 'LIGHTS OUT', color: '#ffd84a', music: 'lounge',
  tagline: 'A heist in the dark',
  objective: 'Grab the most gems in a pitch-dark warehouse. Your flashlight points where you aim. Shots light the room and knock gems loose.',
  controls: [['STICK', 'Move (flashlight follows)'], ['R-STICK', 'Point the flashlight and aim'], ['X / RT', 'Shoot (bullets glow)'], ['A', 'Dash'], ['RB', 'Block']],
  hazards: 'A guard robot with a red searchlight (get spotted and you drop half) / lightning that shows everything for a moment',
  ghost: 'Nobody is knocked out. Getting shot or spotted costs gems',
  tiebreak: 'More gems > reached that total first',
  gunUse: 'Your gun (shots light up the room)', blockUse: 'Your block and dash', bodyUse: 'Your body',
  twists: ['wind', 'giant', 'ice', 'hyper', 'rubber', 'bullettime'],
};
const TOP = 16, BOT = 180, TIME = 35;
const SHELVES = [
  { x: 40, y: 40, w: 60, h: 10 }, { x: 130, y: 40, w: 60, h: 10 }, { x: 220, y: 40, w: 60, h: 10 },
  { x: 40, y: 92, w: 10, h: 40 }, { x: 270, y: 92, w: 10, h: 40 }, { x: 110, y: 100, w: 100, h: 10 },
  { x: 40, y: 150, w: 60, h: 10 }, { x: 220, y: 150, w: 60, h: 10 },
];
const ROUTE = [[20, 26], [300, 26], [300, 75], [20, 75], [20, 140], [300, 140], [300, 172], [20, 172]];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  let env = twistEnv(tw, 0);
  let t = 0, endT = null;
  const starts = [[20, 60], [300, 60], [160, 130]];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const p = {
      seat: pl.seat, idx: pl.idx, x: starts[i][0], y: starts[i][1], vx: 0, vy: 0, r: 4.5 * st.size, face: 1, look: i === 1 ? Math.PI : 0,
      gems: 0, lastGain: 0, gs: newGunState(st.gun), dashT: 0, dashCd: 0, blockT: 0, blockCd: 0, stun: 0, slowT: 0, flashT: 0,
      shields: st.shields, mult: pl.pickupMult ?? 1, caught: 0,
    };
    p.pos = () => [p.x, p.y];
    return makeBuffable(p, st);
  });
  const gems = [];
  const free = (x, y, r) => !SHELVES.some((s) => circleRect(x, y, r, s));
  function spawnGem(value = 1, x = null, y = null, burst = false) {
    for (let k = 0; k < 30 && x === null; k++) { const gx = rand(10, 310), gy = rand(TOP + 8, BOT - 6); if (free(gx, gy, 5)) { x = gx; y = gy; } }
    if (x === null) return;
    gems.push({ x, y, vx: burst ? rand(-80, 80) : 0, vy: burst ? rand(-80, 80) : 0, value, hue: rand(0, 360), delay: burst ? 0.4 : 0, glint: rand(0, 6) });
  }
  for (let k = 0; k < 10; k++) spawnGem();
  const guards = [{ i: 0, x: ROUTE[0][0], y: ROUTE[0][1], a: 0, pause: 0, speed: 32 }];
  let flash = 0, nextFlash = rand(7, 10), bigT = 6;
  const dark = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (dark) { dark.width = 320 * S; dark.height = 180 * S; }
  const game = { meta, finished: false, ranking: [], players };

  function dropGems(p, n, why) {
    if (p.shields > 0) { p.shields -= 1; fx.popup('AIRBAG!', p.x, p.y - 12, '#9fd3ff', 1); return; }
    n = Math.min(n, p.gems);
    p.gems -= n;
    for (let k = 0; k < n; k++) spawnGem(1, p.x, p.y, true);
    if (n) fx.popup(`-${n} ${why}`, p.x, p.y - 12, '#ff7a7a', 1);
  }
  function inCone(px, py, ox, oy, a, len, half) {
    const dx = px - ox, dy = py - oy, d = Math.hypot(dx, dy);
    return d < len && Math.abs(angleDiff(a, Math.atan2(dy, dx))) < half;
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: BOT, open: {} },
    accel: () => [env.wind, 0],
    solidAt: (x, y) => { for (const s of SHELVES) if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return { rect: s }; return null; },
    targets: () => players.map((p) => ({ ref: p, owner: p, x: p.x, y: p.y, r: p.r })),
    onHit: (p, info) => {
      if (p.blockT > 0) { if (p.st.reflect && info.kind === 'bullet') return 'reflect'; sound.sfx('block'); return 'blocked'; }
      const k = 120 * (info.g.knock || 1) * p.st.knockTaken;
      p.vx += info.dx * k; p.vy += info.dy * k; p.stun = 0.3; p.flashT = 0.12;
      if (info.g.frost) p.slowT = 1.5;
      dropGems(p, Math.max(1, Math.round(info.dmg / 34)), '');
      sound.sfx('hit');
      return 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega'], spot: () => { for (;;) { const x = rand(12, 308), y = rand(TOP + 10, 170); if (free(x, y, 8)) return [x, y]; } } });

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    // lightning
    nextFlash -= dt;
    if (nextFlash <= 0) { flash = 0.35; nextFlash = rand(7, 10); sound.sfx('zap'); fx.shake(0.2); }
    flash = Math.max(0, flash - dt);
    // gems
    bigT -= dt;
    if (bigT <= 0) { bigT = 9; spawnGem(3); fx.popup('BIG GEM SOMEWHERE...', 160, 30, '#ffd84a', 1); sound.sfx('jackpot'); }
    if (gems.length < 8) spawnGem();
    for (let i = gems.length - 1; i >= 0; i--) {
      const gm = gems[i];
      gm.delay -= dt; gm.glint += dt;
      gm.vx *= Math.pow(0.05, dt); gm.vy *= Math.pow(0.05, dt);
      gm.x = clamp(gm.x + gm.vx * dt, 6, 314); gm.y = clamp(gm.y + gm.vy * dt, TOP + 6, BOT - 6);
      for (const p of players) if (p.st.magnet) { const d = Math.hypot(p.x - gm.x, p.y - gm.y); if (d < 34 && d > 1) { gm.x += ((p.x - gm.x) / d) * 60 * dt; gm.y += ((p.y - gm.y) / d) * 60 * dt; } }
      if (gm.delay > 0) continue;
      for (const p of players) {
        if (Math.hypot(p.x - gm.x, p.y - gm.y) > p.r + 4) continue;
        let v = gm.value;
        if (p.st.gun.split && Math.random() < 0.25 * p.st.gun.split) { v *= 2; fx.popup('x2', gm.x, gm.y - 6, '#c6ff5a', 1); }
        p.gems += v; p.lastGain = t;
        fx.burst(gm.x, gm.y, v > 1 ? 16 : 6, `hsl(${gm.hue},100%,70%)`, { speed: 60, life: 0.3 });
        sound.sfx(v > 1 ? 'jackpot' : 'coin');
        if (gm.value > 1) fx.popup(`+${v}`, gm.x, gm.y - 8, '#ffd84a', 2);
        gems.splice(i, 1);
        break;
      }
    }
    // guards
    if (t > 18 && guards.length < 2) guards.push({ i: 4, x: ROUTE[4][0], y: ROUTE[4][1], a: 0, pause: 0, speed: 38 });
    for (const gd of guards) {
      if (gd.pause > 0) { gd.pause -= dt; gd.a += dt * 3; }
      else {
        const [tx, ty] = ROUTE[(gd.i + 1) % ROUTE.length];
        const dx = tx - gd.x, dy = ty - gd.y, d = Math.hypot(dx, dy);
        if (d < 2) gd.i = (gd.i + 1) % ROUTE.length;
        else { gd.x += (dx / d) * gd.speed * dt; gd.y += (dy / d) * gd.speed * dt; gd.a = Math.atan2(dy, dx) + Math.sin(t * 1.8) * 0.6; }
      }
      for (const p of players) {
        if (inCone(p.x, p.y, gd.x, gd.y, gd.a, 78, 0.38) && p.blockT <= 0) {
          p.caught += dt;
          if (p.caught > 0.5) {
            p.caught = 0; p.stun = 0.8; gd.pause = 1.2; sound.sfx('warn'); fx.flash('#ff3a3a', 0.25); fx.shake(0.3);
            fx.popup('SPOTTED!', p.x, p.y - 20, '#ff3a3a', 2);
            dropGems(p, Math.ceil(p.gems / 2), '');
          }
        } else p.caught = Math.max(0, p.caught - dt);
      }
    }
    // players
    for (const p of players) {
      const c = controls.get(p.seat);
      tickBuffs(p, dt);
      p.dashCd -= dt; p.blockT -= dt; p.blockCd -= dt; p.slowT -= dt; p.flashT -= dt;
      const max = 82 * p.st.speed * (p.slowT > 0 ? 0.55 : 1);
      if (p.dashT > 0) p.dashT -= dt;
      else if (p.stun > 0) { p.stun -= dt; p.vx *= Math.pow(0.1, dt); p.vy *= Math.pow(0.1, dt); }
      else {
        const acc = env.ice ? 220 : 900;
        p.vx = approach(p.vx, c.mx * max, acc * dt) + env.wind * 0.4 * dt; p.vy = approach(p.vy, c.my * max, acc * dt);
        if (c.jumpP && p.dashCd <= 0) {
          const m = Math.hypot(c.mx, c.my); const dx = m > 0.2 ? c.mx / m : Math.cos(p.look), dy = m > 0.2 ? c.my / m : Math.sin(p.look);
          p.vx = dx * 250; p.vy = dy * 250; p.dashT = 0.15; p.dashCd = 1.2 * p.st.blockCd; sound.sfx('dash');
        }
      }
      if (c.blockP && p.blockCd <= 0) { p.blockT = 0.4; p.blockCd = 2.4 * p.st.blockCd; sound.sfx('block'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      p.x = clamp(p.x + p.vx * dt, p.r, 320 - p.r); p.y = clamp(p.y + p.vy * dt, TOP + p.r, BOT - p.r);
      for (const s of SHELVES) {
        if (!circleRect(p.x, p.y, p.r, s)) continue;
        const nx = clamp(p.x, s.x, s.x + s.w), ny = clamp(p.y, s.y, s.y + s.h), dx = p.x - nx, dy = p.y - ny, d = Math.hypot(dx, dy) || 1;
        p.x = nx + (dx / d) * (p.r + 0.1); p.y = ny + (dy / d) * (p.r + 0.1);
      }
      const want = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.3 ? Math.atan2(c.my, c.mx) : p.look;
      p.look += clamp(angleDiff(p.look, want), -8 * dt, 8 * dt);
      if (p.stun <= 0) guns.trigger(p, p.gs, p.st.gun, c.fire, p.look, p.x + Math.cos(p.look) * 6, p.y + Math.sin(p.look) * 6, dt);
    }
    guns.update(dt);
    pickups.update(dt, players.map((p) => ({ p, x: p.x, y: p.y, r: p.r + 2, mult: p.mult })));
    if (endT === null && t >= TIME) endT = 0.8;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = players.slice().sort((a, b) => b.gems - a.gems || a.lastGain - b.lastGain).map((p) => p.seat); } }
  };
  game.hud = (seat) => `${players.find((x) => x.seat === seat).gems} GEMS`;
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    let best = null, bd = 1e9;
    for (const gm of gems) { const d = Math.hypot(gm.x - p.x, gm.y - p.y) * (gm.value > 1 ? 0.4 : 1); if (d < bd) { bd = d; best = gm; } }
    return best ? [best.x, best.y] : null;
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  function cone(c, x, y, a, len, half, steps = 10) {
    c.beginPath(); c.moveTo(x * S, y * S);
    for (let k = 0; k <= steps; k++) { const aa = a - half + (2 * half * k) / steps; c.lineTo((x + Math.cos(aa) * len) * S, (y + Math.sin(aa) * len) * S); }
    c.closePath(); c.fill();
  }

  game.draw = (g) => {
    // the room, fully lit (darkness goes on top)
    g.rect(0, 0, 320, 180, '#2a2638', true);
    for (let y = TOP; y < BOT; y += 12) for (let x = 0; x < 320; x += 12) if (((x + y) / 12) % 2) g.rect(x, y, 12, 12, '#312c42', true);
    for (const s of SHELVES) {
      g.rect(s.x, s.y, s.w, s.h, '#5a4a3a'); g.frame(s.x, s.y, s.w, s.h, '#8a6a4a');
      for (let x = s.x + 2; x < s.x + s.w - 4; x += 8) g.rect(x, s.y + 2, 5, Math.min(5, s.h - 4), '#a07a4a');
    }
    for (const gm of gems) {
      const col = `hsl(${(gm.hue + t * 60) % 360},100%,65%)`, r = gm.value > 1 ? 4 : 2.5;
      g.rect(gm.x - r, gm.y - 0.5, r * 2, 1, col); g.rect(gm.x - 0.5, gm.y - r, 1, r * 2, col); g.circle(gm.x, gm.y, r * 0.6, col);
    }
    pickups.draw(g);
    for (const gd of guards) {
      g.alpha(0.25); g.c.fillStyle = '#ff2a2a'; cone(g.c, gd.x, gd.y, gd.a, 78, 0.38); g.alpha(1);
      g.circle(gd.x, gd.y, 6, '#6a6a7a'); g.circle(gd.x, gd.y, 3, gd.pause > 0 ? '#ff3a3a' : '#ff8a8a');
    }
    guns.draw(g);
    for (const p of players) {
      drawPlayer(g, p.idx, p.x, p.y + p.r, { flip: p.face < 0, size: p.st.size * 0.9, flash: p.flashT > 0 });
      if (p.blockT > 0) g.ring(p.x, p.y, p.r + 4, '#5affd9');
    }
    // darkness with holes cut by lights
    if (dark) {
      const d = dark.getContext('2d');
      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, dark.width, dark.height);
      d.fillStyle = `rgba(3,2,10,${flash > 0 ? 0.25 : 0.94})`;
      d.fillRect(0, TOP * S, dark.width, dark.height);
      d.globalCompositeOperation = 'destination-out';
      d.fillStyle = 'rgba(0,0,0,1)';
      for (const p of players) {
        cone(d, p.x, p.y, p.look, 78, 0.42);
        d.beginPath(); d.arc(p.x * S, p.y * S, 12 * S, 0, TAU); d.fill();
      }
      for (const gd of guards) { d.fillStyle = 'rgba(0,0,0,0.7)'; cone(d, gd.x, gd.y, gd.a, 78, 0.38); d.beginPath(); d.arc(gd.x * S, gd.y * S, 9 * S, 0, TAU); d.fill(); }
      d.fillStyle = 'rgba(0,0,0,0.9)';
      for (const b of guns.bullets) { d.beginPath(); d.arc(b.x * S, b.y * S, (8 + b.r * 2) * S, 0, TAU); d.fill(); }
      d.fillStyle = 'rgba(0,0,0,0.6)';
      for (const gm of gems) if (Math.sin(gm.glint * 2.5) > 0.85) { d.beginPath(); d.arc(gm.x * S, gm.y * S, 4 * S, 0, TAU); d.fill(); }
      g.c.drawImage(dark, g.ox * S, g.oy * S);
    }
    // always-visible markers so nobody loses themselves
    for (const p of players) {
      g.ring(p.x, p.y + p.r - 1, p.r + 2, SEAT_COLORS[p.idx]);
      drawTag(g, p.idx, p.x, p.y - 7 * p.st.size);
      g.text(String(p.gems), p.x, p.y + p.r + 2, { scale: 1, col: '#ffd84a', align: 'center', ui: false, shadow: null });
      drawBuffs(g, p, p.x, p.y + p.r + 7);
      if (p.caught > 0.05) g.text('!', p.x, p.y - 22, { scale: 2, col: '#ff3a3a', align: 'center', ui: false });
    }
  };
  return game;
}
