// ORBIT OUTPOST: a shootout on a tiny planet with its own gravity.
// Run all the way around it; bullets fall toward the planet and curve into orbits.
import { TAU, clamp, rand, approach, angleDiff } from '../engine/util.js';
import { drawPlayer, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState, hitEffects, tickStatus } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';

export const meta = {
  id: 'orbit', name: 'ORBIT OUTPOST', color: '#b48cff', music: 'lounge', tier: 2,
  tagline: 'A tiny planet with its own gravity',
  objective: 'Last one standing. Run all the way around the planet. Your bullets curve into orbits.',
  controls: [['STICK', 'Run around the planet / aim'], ['A', 'Jump (double jump)'], ['X / RT', 'Shoot'], ['RB', 'Block'], ['R-STICK', 'Aim freely']],
  hazards: 'Two moons on orbit / marked meteor strikes / fire geysers',
  ghost: 'Knocked out: become a satellite. Circle the planet and shoot down',
  tiebreak: 'Standing > more health > knocked out later',
  gunUse: 'Your gun (bullets orbit the planet)', blockUse: 'Your block (RB)', bodyUse: 'Your body',
  twists: ['moon', 'heavy', 'wind', 'rubber', 'bullettime', 'giant', 'warp', 'hyper'],
};

const C = { x: 160, y: 100 };
const R = 32;
const TIME = 45;
const HAZ = 34;

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  let env = twistEnv(tw, 0);
  let t = 0, endT = null;
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const a = -Math.PI / 2 + (i - (ctx.players.length - 1) / 2) * 2.1;
    const p = {
      seat: pl.seat, idx: pl.idx, x: C.x + Math.cos(a) * (R + 8), y: C.y + Math.sin(a) * (R + 8), vx: 0, vy: 0,
      r: 5 * st.size, onGround: false, jumps: 1, stun: 0, face: 1, hp: st.hp, maxHp: st.hp, dead: !!pl.ghost, deathT: pl.ghost ? -1 : null,
      gs: newGunState(st.gun), blockT: 0, blockCd: 0, shields: st.shields, hurtT: 0, flashT: 0, slowT: 0, poison: null, mult: pl.pickupMult ?? 1,
      sat: { a: a, cd: 1 }, squash: 0,
    };
    p.pos = () => (p.dead ? satPos(p) : [p.x, p.y]);
    return makeBuffable(p, st);
  });
  const moons = [{ orbit: 62, a: 0, w: 0.55, r: 7 }, { orbit: 80, a: Math.PI, w: -0.42, r: 6 }];
  moons.forEach((m) => { m.x = C.x + Math.cos(m.a) * m.orbit; m.y = C.y + Math.sin(m.a) * m.orbit; });
  const meteors = [];
  const vents = [0.4, 2.5, 4.6].map((a) => ({ a, state: 'idle', t: rand(1, 3) }));
  let meteorT = 6;
  const stars = Array.from({ length: 90 }, () => ({ x: rand(0, 320), y: rand(15, 180), p: rand(0, 6), s: Math.random() < 0.2 ? 2 : 1 }));
  const blobs = Array.from({ length: 6 }, (_, k) => ({ x: rand(0, 320), y: rand(20, 180), r: rand(22, 40), h: k * 60 }));
  const game = { meta, finished: false, ranking: [], players };
  const alive = () => players.filter((p) => !p.dead);
  function satPos(p) { return [C.x + Math.cos(p.sat.a) * 88, C.y + Math.sin(p.sat.a) * 88]; }

  function hurt(p, dmg, kx, ky, { inv = 0.6, src = null, g = null } = {}) {
    if (p.dead || p.hurtT > 0) return 'none';
    if (p.blockT > 0) { fx.ring(p.x, p.y, 12, '#9ff'); sound.sfx('block'); return 'blocked'; }
    if (p.shields > 0) { p.shields -= 1; p.hurtT = 0.4; fx.popup('AIRBAG!', p.x, p.y - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
    p.hp -= dmg; p.hurtT = inv; p.flashT = 0.12;
    p.vx += kx * p.st.knockTaken; p.vy += ky * p.st.knockTaken; p.stun = 0.25;
    fx.shake(0.12 + Math.min(0.3, dmg / 200)); fx.stop(0.03); sound.sfx('hit');
    fx.burst(p.x, p.y, 8, SEAT_COLORS[p.idx], { speed: 90, life: 0.4 });
    fx.popup(String(Math.round(dmg)), p.x, p.y - 10, '#fff', 1);
    if (g && src) hitEffects(p, src, dmg, g);
    if (p.hp <= 0) kill(p);
    return 'hit';
  }
  function kill(p) {
    p.dead = true; p.deathT = t; p.hp = 0;
    fx.burst(p.x, p.y, 34, SEAT_COLORS[p.idx], { speed: 160, life: 0.8, size: 2 });
    fx.ring(p.x, p.y, 30, '#fff', 0.5);
    fx.slow(0.45); fx.shake(0.7); fx.flash('#b48cff', 0.35); sound.sfx('ko');
    fx.hueKick = (fx.hueKick || 0) + 30;
    fx.popup(`P${p.idx + 1} OUT!`, p.x, p.y - 16, SEAT_COLORS[p.idx], 3);
    p.sat.a = Math.atan2(p.y - C.y, p.x - C.x);
  }
  function blastAt(x, y, r, dmg) {
    fx.ring(x, y, r, '#ff7a2e', 0.3); fx.burst(x, y, 16, '#ffb03a', { speed: 100, life: 0.4 }); fx.shake(0.3); sound.sfx('boom');
    for (const p of alive()) { const d = Math.hypot(p.x - x, p.y - y); if (d < r + p.r) hurt(p, dmg, ((p.x - x) / (d || 1)) * 200, ((p.y - y) / (d || 1)) * 200); }
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: 15, x1: 320, y1: 180, open: {} },
    accel: (x, y) => {
      const dx = C.x - x, dy = C.y - y, d = Math.hypot(dx, dy) || 1;
      const g = 150 * env.bulletGrav;
      return [(dx / d) * g + env.wind, (dy / d) * g];
    },
    solidAt: (x, y) => {
      if (Math.hypot(x - C.x, y - C.y) < R) return { circle: { x: C.x, y: C.y, r: R } };
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
  const pickups = new Pickups({ fx, sound, spot: () => { const a = rand(0, TAU); return [C.x + Math.cos(a) * (R + 9), C.y + Math.sin(a) * (R + 9)]; } });

  function controlPlayer(p, c, dt) {
    const dx = p.x - C.x, dy = p.y - C.y, d = Math.hypot(dx, dy) || 1;
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
      else if (p.jumps > 0) { p.jumps -= 1; vr = v * 0.85; sound.sfx('jump'); }
    }
    vr -= G * (vr > 0 && !c.jump ? 2 : 1) * dt;
    p.vx = tx * vt + nx * vr + env.wind * 0.5 * dt * 60 * 0.02;
    p.vy = ty * vt + ny * vr;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const d2 = Math.hypot(p.x - C.x, p.y - C.y);
    const was = p.onGround;
    if (d2 < R + p.r) {
      const n2x = (p.x - C.x) / d2, n2y = (p.y - C.y) / d2;
      p.x = C.x + n2x * (R + p.r); p.y = C.y + n2y * (R + p.r);
      const vr2 = p.vx * n2x + p.vy * n2y;
      if (vr2 < 0) { p.vx -= vr2 * n2x; p.vy -= vr2 * n2y; }
      p.onGround = true;
      if (!was) { p.squash = 0.6; fx.dust(p.x, p.y, '#c8b0ff', 2); }
    } else if (d2 > R + p.r + 1.5) p.onGround = false;
    if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx) * 0.6; }
    if (p.x > 320 - p.r) { p.x = 320 - p.r; p.vx = -Math.abs(p.vx) * 0.6; }
    if (p.y < 15 + p.r) { p.y = 15 + p.r; p.vy = Math.abs(p.vy) * 0.6; }
    if (p.y > 180 - p.r) { p.y = 180 - p.r; p.vy = -Math.abs(p.vy) * 0.6; }
    p.squash *= Math.pow(0.0005, dt);
    return { nx, ny, tx, ty };
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    for (const m of moons) {
      m.a += m.w * dt; m.x = C.x + Math.cos(m.a) * m.orbit; m.y = C.y + Math.sin(m.a) * m.orbit;
      for (const p of alive()) { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < p.r + m.r) hurt(p, HAZ, ((p.x - m.x) / (d || 1)) * 230, ((p.y - m.y) / (d || 1)) * 230); }
    }
    meteorT -= dt;
    if (meteorT <= 0) {
      meteorT = Math.max(1.4, 3.2 - t * 0.05);
      const target = Math.random() < 0.6 && alive().length ? alive()[Math.floor(rand(0, alive().length))] : null;
      const a = target ? Math.atan2(target.y - C.y, target.x - C.x) + rand(-0.3, 0.3) : rand(0, TAU);
      meteors.push({ a, d: 150, warn: 1.2 });
      sound.sfx('warn');
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      if (m.warn > 0) { m.warn -= dt; continue; }
      m.d -= 240 * dt;
      const mx = C.x + Math.cos(m.a) * m.d, my = C.y + Math.sin(m.a) * m.d;
      if (Math.random() < 0.7) fx.burst(mx, my, 1, '#ffb03a', { speed: 30, life: 0.3, angle: m.a, spread: 0.6 });
      for (const p of alive()) if (Math.hypot(p.x - mx, p.y - my) < p.r + 4) { hurt(p, HAZ, Math.cos(m.a) * -150, Math.sin(m.a) * -150); }
      if (m.d <= R + 2) { blastAt(C.x + Math.cos(m.a) * (R + 3), C.y + Math.sin(m.a) * (R + 3), 16, HAZ); meteors.splice(i, 1); }
    }
    if (t > 16) for (const v of vents) {
      v.t -= dt;
      if (v.state === 'idle' && v.t <= 0) { v.state = 'warn'; v.t = 1; }
      else if (v.state === 'warn' && v.t <= 0) { v.state = 'fire'; v.t = 1.2; sound.sfx('zap'); }
      else if (v.state === 'fire') {
        const bx = C.x + Math.cos(v.a) * R, by = C.y + Math.sin(v.a) * R;
        for (const p of alive()) {
          const rx = p.x - bx, ry = p.y - by, along = rx * Math.cos(v.a) + ry * Math.sin(v.a), side = Math.abs(-rx * Math.sin(v.a) + ry * Math.cos(v.a));
          if (along > -2 && along < 46 && side < 5 + p.r) hurt(p, HAZ, Math.cos(v.a) * 220, Math.sin(v.a) * 220);
        }
        if (v.t <= 0) { v.state = 'idle'; v.t = rand(2.5, 4); }
      }
    }
    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.dead) {
        p.sat.a += (c.mx * -Math.sin(p.sat.a) + c.my * Math.cos(p.sat.a)) * 1.4 * dt;
        const [sx, sy] = satPos(p);
        const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.atan2(C.y - sy, C.x - sx);
        p.sat.aim = a;
        if (endT === null) guns.trigger(p, p.gs, { ...p.st.gun, delay: Math.max(0.4, p.st.gun.delay * 1.6) }, c.fire, a, sx + Math.cos(a) * 5, sy + Math.sin(a) * 5, dt);
        continue;
      }
      tickBuffs(p, dt);
      p.hurtT -= dt; p.flashT -= dt; p.blockT -= dt; p.blockCd -= dt;
      const pd = tickStatus(p, dt); if (pd) { p.hp -= pd; if (p.hp <= 0) { kill(p); continue; } }
      const { nx, ny, tx, ty } = controlPlayer(p, c, dt);
      if (c.blockP && p.blockCd <= 0) {
        p.blockT = 0.3; p.blockCd = 2.6 * p.st.blockCd; sound.sfx('block');
        if (p.st.blockShock) for (const o of alive()) { if (o === p) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < 30 + 10 * p.st.blockShock) hurt(o, 12, ((o.x - p.x) / d) * 240, ((o.y - p.y) / d) * 240, { inv: 0.1 }); }
        if (p.st.blockShock) fx.ring(p.x, p.y, 30 + 10 * p.st.blockShock, '#5affd9', 0.3);
        if (p.st.blockBlink) { p.x += tx * p.face * 40; p.y += ty * p.face * 40; fx.burst(p.x, p.y, 10, '#fff', { speed: 50, life: 0.3 }); }
        if (p.st.blockHeal) { p.hp = Math.min(p.maxHp, p.hp + p.st.blockHeal); fx.popup(`+${p.st.blockHeal}`, p.x, p.y - 12, '#7dff8a', 1); }
      }
      let a;
      if (c.aim) a = Math.atan2(c.ay, c.ax);
      else if (Math.hypot(c.mx, c.my) > 0.4) a = Math.atan2(c.my, c.mx);
      else a = Math.atan2(ty * p.face, tx * p.face);
      p.aim = a;
      if (guns.trigger(p, p.gs, p.st.gun, c.fire, a, p.x + Math.cos(a) * 6, p.y + Math.sin(a) * 6, dt)) { p.vx -= Math.cos(a) * 25; p.vy -= Math.sin(a) * 25; }
      void nx; void ny;
    }
    guns.update(dt);
    pickups.update(dt, alive().map((p) => ({ p, x: p.x, y: p.y, r: p.r + 2, mult: p.mult })));
    const solo = players.filter((p) => p.deathT !== -1).length <= 1;
    if (endT === null && ((!solo && alive().length <= 1) || t >= TIME)) endT = 1.3;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    const a = players.filter((p) => !p.dead).sort((x, y) => y.hp / y.maxHp - x.hp / x.maxHp);
    const d = players.filter((p) => p.dead).sort((x, y) => y.deathT - x.deathT);
    return [...a, ...d].map((p) => p.seat);
  }
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.dead ? 'SATELLITE' : `${Math.max(0, Math.ceil((p.hp / p.maxHp) * 100))}%` + (p.shields ? '+' : ''); };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    g.rect(0, 0, 320, 180, '#06041a', true);
    for (const b of blobs) { g.alpha(0.07); g.circle(b.x + Math.sin(t * 0.2 + b.h) * 10, b.y, b.r, `hsl(${(b.h + t * 12) % 360},80%,45%)`, true); }
    g.alpha(1);
    for (const s of stars) { const tw2 = Math.sin(t * 3 + s.p) > 0.3; g.rect(s.x, s.y, s.s, s.s, tw2 ? '#ffffff' : '#6a6a9a', true); }
    // orbits
    for (const m of moons) g.ring(C.x, C.y, m.orbit, '#ffffff14');
    g.ring(C.x, C.y, 88, '#ffffff10');
    // vents
    for (const v of vents) {
      const bx = C.x + Math.cos(v.a) * R, by = C.y + Math.sin(v.a) * R;
      if (v.state === 'warn' && Math.floor(t * 12) % 2) g.dotted(bx, by, bx + Math.cos(v.a) * 46, by + Math.sin(v.a) * 46, '#ff5a3a', 3);
      if (v.state === 'fire') { g.alpha(0.5); g.beam(bx, by, bx + Math.cos(v.a) * 46, by + Math.sin(v.a) * 46, 10, '#ff5a1a'); g.alpha(1); g.beam(bx, by, bx + Math.cos(v.a) * 44, by + Math.sin(v.a) * 44, 4, '#ffd84a'); }
    }
    // planet
    g.circle(C.x, C.y, R + 3, '#5a3aa055');
    g.circle(C.x, C.y, R, '#3b2a6e');
    for (let k = -3; k <= 3; k++) { const y = C.y + k * 8, half = Math.sqrt(Math.max(0, R * R - (k * 8) ** 2)); g.rect(C.x - half, y, half * 2, 2, k % 2 ? '#4a3a8a' : '#2e2058'); }
    [[0.5, 0.4, 4], [2.4, 0.7, 3], [4.2, 0.55, 5], [3.4, 0.3, 2]].forEach(([a, k, r]) => g.circle(C.x + Math.cos(a + t * 0.05) * R * k, C.y + Math.sin(a + t * 0.05) * R * k, r, '#251a4a'));
    for (const v of vents) { g.circle(C.x + Math.cos(v.a) * (R - 1), C.y + Math.sin(v.a) * (R - 1), 3, v.state === 'idle' ? '#5a2a2a' : '#ff5a3a'); }
    // meteors
    for (const m of meteors) {
      const sx = C.x + Math.cos(m.a) * (R + 3), sy = C.y + Math.sin(m.a) * (R + 3);
      if (m.warn > 0) { g.ring(sx, sy, 8 + Math.sin(t * 20) * 2, '#ff5a3a'); if (Math.floor(t * 10) % 2) g.dotted(sx, sy, C.x + Math.cos(m.a) * 150, C.y + Math.sin(m.a) * 150, '#ff5a3a66', 5); continue; }
      const mx = C.x + Math.cos(m.a) * m.d, my = C.y + Math.sin(m.a) * m.d;
      g.circle(mx, my, 4, '#ff9a3a'); g.circle(mx, my, 2, '#fff2a0');
    }
    for (const m of moons) { g.circle(m.x, m.y, m.r, '#9a9ab8'); g.circle(m.x - 2, m.y - 2, m.r * 0.4, '#c8c8e0'); g.circle(m.x + 2, m.y + 1, 1.5, '#6a6a88'); }
    pickups.draw(g);
    guns.draw(g);
    for (const p of players) {
      if (p.dead) {
        if (game.finished) continue;
        const [sx, sy] = satPos(p);
        g.rect(sx - 4, sy - 1, 8, 2, SEAT_COLORS[p.idx]); g.circle(sx, sy, 2.5, '#ddd');
        g.rect(sx + Math.cos(p.sat.aim || 0) * 5 - 1, sy + Math.sin(p.sat.aim || 0) * 5 - 1, 2, 2, '#fff');
        g.text(`P${p.idx + 1}`, sx, sy - 10, { scale: 1, col: SEAT_COLORS[p.idx], align: 'center', ui: false });
        continue;
      }
      const a = Math.atan2(p.y - C.y, p.x - C.x);
      const blink = p.hurtT > 0 && p.hurtT < 0.5 && Math.floor(t * 20) % 2;
      const sz = p.st.size;
      drawPlayer(g, p.idx, p.x, p.y, { rot: a + Math.PI / 2, anchor: 'center', flip: p.face < 0, size: p.st.size, squash: p.squash, flash: p.flashT > 0, alpha: blink ? 0.5 : 1 });
      if (p.blockT > 0) g.ring(p.x, p.y, 9 * sz, '#5affd9');
      if (p.shields) g.ring(p.x, p.y, 8 * sz, '#9fd3ff55');
      const ox = Math.cos(a) * 11 * sz, oy = Math.sin(a) * 11 * sz;
      g.rect(p.x + ox - 6, p.y + oy - 1, 12, 2, '#3a1020'); g.rect(p.x + ox - 6, p.y + oy - 1, 12 * Math.max(0, p.hp / p.maxHp), 2, '#ff5a5a');
      g.text(`P${p.idx + 1}`, p.x + ox * 1.6, p.y + oy * 1.6 - 3, { scale: 1, col: SEAT_COLORS[p.idx], align: 'center', ui: false });
      drawBuffs(g, p, p.x + ox * 2.2, p.y + oy * 2.2);
      if (p.gs.reloadT > 0) g.rect(p.x - 4, p.y + 8, 8 * guns.reloadFrac(p.gs, p.st.gun), 1, '#fff6a8');
      void angleDiff;
    }
  };
  return game;
}
