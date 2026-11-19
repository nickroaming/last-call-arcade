// RICOCHET ROOFTOP: ROUNDS-style shootout on rooftops. Five maps.
import { TAU, clamp, rand, overlap, circleRect } from '../engine/util.js';
import { drawPlayer, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { makeBody, platformControl, stepBody, moveMovers, GRAV } from './platformer.js';
import { Guns, newGunState, hitEffects, tickStatus } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';

export const meta = {
  id: 'rumble', name: 'RICOCHET ROOFTOP', color: '#33d6ff', music: 'rumble',
  tagline: 'A rooftop shootout with bouncing bullets',
  objective: 'Be the last one standing. Falling off costs health and throws you back up.',
  controls: [['STICK', 'Move and aim'], ['A', 'Jump (double jump)'], ['X / RT', 'Shoot (bullets drop and bounce)'], ['RB', 'Block'], ['R-STICK', 'Aim freely']],
  hazards: 'Saws on rails / crumbling ledges / wrecking ball / searchlight laser / rising electric water',
  ghost: 'Knocked out: fly your ghost, press X to drop an anvil',
  tiebreak: 'Standing > more health > knocked out later',
  gunUse: 'Your gun', blockUse: 'Your block (RB)', bodyUse: 'Your body',
  twists: ['moon', 'heavy', 'wind', 'tilt', 'rubber', 'bullettime', 'giant', 'warp'],
};

const HAZ = 34;
const TIME = 45;

export const LAYOUTS = [
  { name: 'NEON ROOFS',
    solids: [{ x: 0, y: 150, w: 96, h: 30 }, { x: 128, y: 162, w: 64, h: 18 }, { x: 224, y: 150, w: 96, h: 30 },
      { x: 26, y: 112, w: 46, h: 4, oneWay: 1 }, { x: 248, y: 112, w: 46, h: 4, oneWay: 1 }, { x: 134, y: 96, w: 52, h: 4, oneWay: 1, crumble: 1 },
      { x: 10, y: 72, w: 38, h: 4, oneWay: 1, crumble: 1 }, { x: 272, y: 72, w: 38, h: 4, oneWay: 1, crumble: 1 }],
    movers: [{ w: 30, h: 5, ax: 98, bx: 192, ay: 128, by: 128, period: 5 }],
    saws: [{ ax: 104, ay: 150, bx: 216, by: 150, r: 7, period: 3.6 }],
    spawns: [[44, 140], [160, 150], [276, 140]] },
  { name: 'WATER TOWER',
    solids: [{ x: 0, y: 156, w: 110, h: 24 }, { x: 210, y: 156, w: 110, h: 24 }, { x: 142, y: 100, w: 36, h: 80 },
      { x: 18, y: 120, w: 50, h: 4, oneWay: 1 }, { x: 252, y: 120, w: 50, h: 4, oneWay: 1 }, { x: 120, y: 66, w: 80, h: 4, oneWay: 1, crumble: 1 },
      { x: 58, y: 88, w: 34, h: 4, oneWay: 1, crumble: 1 }, { x: 228, y: 88, w: 34, h: 4, oneWay: 1, crumble: 1 }],
    movers: [{ w: 26, h: 5, ax: 112, bx: 112, ay: 150, by: 96, period: 4 }, { w: 26, h: 5, ax: 182, bx: 182, ay: 96, by: 150, period: 4 }],
    saws: [{ ax: 8, ay: 155, bx: 102, by: 155, r: 7, period: 3 }, { ax: 30, ay: 44, bx: 290, by: 44, r: 7, period: 5 }],
    spawns: [[40, 146], [160, 90], [280, 146]] },
  { name: 'BILLBOARD',
    solids: [{ x: 0, y: 160, w: 70, h: 20 }, { x: 125, y: 160, w: 70, h: 20 }, { x: 250, y: 160, w: 70, h: 20 },
      { x: 96, y: 92, w: 128, h: 10 }, { x: 0, y: 40, w: 10, h: 120 }, { x: 310, y: 40, w: 10, h: 120 },
      { x: 30, y: 122, w: 40, h: 4, oneWay: 1 }, { x: 250, y: 122, w: 40, h: 4, oneWay: 1 }, { x: 140, y: 60, w: 40, h: 4, oneWay: 1, crumble: 1 }],
    movers: [{ w: 28, h: 5, ax: 72, bx: 72, ay: 150, by: 104, period: 4.5 }, { w: 28, h: 5, ax: 220, bx: 220, ay: 104, by: 150, period: 4.5 }],
    saws: [{ ax: 100, ay: 103, bx: 220, by: 103, r: 6, period: 4 }],
    spawns: [[36, 150], [160, 86], [284, 150]] },
  { name: 'CRANE YARD',
    solids: [{ x: 0, y: 152, w: 104, h: 28 }, { x: 216, y: 152, w: 104, h: 28 },
      { x: 40, y: 62, w: 240, h: 5, oneWay: 1 }, { x: 20, y: 112, w: 50, h: 4, oneWay: 1 }, { x: 250, y: 112, w: 50, h: 4, oneWay: 1 },
      { x: 136, y: 118, w: 48, h: 4, oneWay: 1, crumble: 1 }],
    movers: [{ w: 34, h: 5, ax: 106, bx: 180, ay: 146, by: 146, period: 4 }],
    saws: [],
    pend: { ax: 160, ay: 67, len: 46, r: 8 },
    spawns: [[40, 140], [160, 55], [280, 140]] },
  { name: 'STAIRCASE',
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
  let env = twistEnv(tw, 0);

  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const [sx, sy] = L.spawns[i % 3];
    const x0 = flip ? 320 - sx : sx;
    const w = 8 * st.size, h = 11 * st.size;
    const p = {
      seat: pl.seat, idx: pl.idx, b: makeBody(x0 - w / 2, sy - h - 2, w, h), hp: st.hp, maxHp: st.hp,
      dead: !!pl.ghost, deathT: pl.ghost ? -1 : null, face: x0 < 160 ? 1 : -1, gs: newGunState(st.gun), mult: pl.pickupMult ?? 1, tipsy: pl.tipsy || 0,
      blockT: 0, blockCd: 0, shields: st.shields, hurtT: 0, flashT: 0, slowT: 0, poison: null,
      ghost: { x: 160, y: 50, cd: pl.ghost ? 1 : 0 },
    };
    p.pos = () => [p.b.x + p.b.w / 2, p.b.y + p.b.h / 2];
    return makeBuffable(p, st);
  });
  const anvils = [];
  const rain = Array.from({ length: 70 }, () => ({ x: rand(0, 340), y: rand(0, 180), s: rand(140, 220) }));
  const city = Array.from({ length: 18 }, (_, i) => ({ x: i * 19 - 6, w: rand(14, 22), h: rand(30, 90), lit: Array.from({ length: 12 }, () => Math.random() < 0.3) }));
  const laser = { state: 'off', x: 0, dir: 1, t: 0, next: 11 };
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
    p.b.vx += kx * p.st.knockTaken; p.b.vy += ky * p.st.knockTaken; p.b.stun = 0.22;
    fx.shake(0.12 + Math.min(0.3, dmg / 200)); fx.stop(0.03); sound.sfx('hit');
    fx.burst(p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, 8, SEAT_COLORS[p.idx], { speed: 90, life: 0.4 });
    fx.popup(String(Math.round(dmg)), p.b.x + p.b.w / 2, p.b.y - 6, '#fff', 1);
    if (g && src) hitEffects(p, src, dmg, g);
    if (p.hp <= 0) kill(p);
    return 'hit';
  }
  function kill(p) {
    p.dead = true; p.deathT = t; p.hp = 0;
    const [cx, cy] = p.pos();
    fx.burst(cx, cy, 34, SEAT_COLORS[p.idx], { speed: 160, life: 0.8, size: 2 });
    fx.burst(cx, cy, 14, '#fff', { speed: 120, life: 0.5 });
    fx.ring(cx, cy, 30, '#fff', 0.5);
    fx.slow(0.45); fx.shake(0.7); fx.flash('#fff', 0.35); sound.sfx('ko');
    fx.hueKick = (fx.hueKick || 0) + 30;
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
    p.blockT = 0.3; p.blockCd = 2.6 * p.st.blockCd; sound.sfx('block');
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
    if (laser.state === 'off' && t >= laser.next) {
      laser.state = 'warn'; laser.t = 1.2; laser.dir = Math.random() < 0.5 ? 1 : -1; laser.x = laser.dir > 0 ? 6 : 314;
      sound.sfx('warn'); fx.popup('SEARCHLIGHT!', 160, 30, '#ff5a5a', 2);
    } else if (laser.state === 'warn') {
      laser.t -= dt; if (laser.t <= 0) { laser.state = 'on'; laser.t = 3; sound.sfx('laser'); }
    } else if (laser.state === 'on') {
      laser.t -= dt; laser.x += laser.dir * (308 / 3) * dt;
      for (const p of alive()) if (laser.x > p.b.x - 3 && laser.x < p.b.x + p.b.w + 3) hurt(p, HAZ, laser.dir * 160, -180);
      if (laser.t <= 0) { laser.state = 'off'; laser.next = t + 9; }
    }
    if (t > 25) {
      if (!floodSaid) { floodSaid = true; fx.popup('THE WATER IS LIVE!', 160, 40, '#33d6ff', 2); sound.sfx('warn'); }
      waterY = Math.max(108, 182 - (t - 25) * 4);
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

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    for (const r of rain) { r.y += r.s * dt; r.x -= (r.s * 0.25 - env.wind * 0.6) * dt; if (r.y > 180) { r.y = -5; r.x = rand(-20, 360); } }
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
      const [cx, cy] = p.pos();
      if (guns.trigger(p, p.gs, p.st.gun, c.fire, a, cx + Math.cos(a) * 5, cy - 1 + Math.sin(a) * 5, dt)) {
        p.b.vx -= Math.cos(a) * 30 * Math.sqrt(p.st.gun.knock); p.b.squash = 0.2;
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
    const solo = players.filter((p) => p.deathT !== -1).length <= 1;
    if (endT === null && ((!solo && alive().length <= 1) || t >= TIME)) endT = 1.3;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    const a = players.filter((p) => !p.dead).sort((x, y) => y.hp / y.maxHp - x.hp / x.maxHp);
    const d = players.filter((p) => p.dead).sort((x, y) => y.deathT - x.deathT);
    return [...a, ...d].map((p) => p.seat);
  }
  game.hud = (seat) => {
    const p = players.find((x) => x.seat === seat);
    return p.dead ? 'GHOST' : `${Math.max(0, Math.ceil((p.hp / p.maxHp) * 100))}%` + (p.shields ? '+' : '');
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    g.rect(0, 0, 320, 180, '#0d0b1f', true);
    g.rect(0, 60, 320, 120, '#141032', true);
    g.circle(262, 34, 12, '#e9e4ff', true); g.circle(258, 31, 12, '#0d0b1f', true);
    for (const b of city) {
      g.rect(b.x, 180 - b.h, b.w, b.h, '#1b1640', true);
      b.lit.forEach((on, k) => { if (on) g.rect(b.x + 3 + (k % 3) * 5, 180 - b.h + 5 + Math.floor(k / 3) * 7, 2, 3, (Math.floor(t * 2 + k) % 9) ? '#ffd27a' : '#7a6a3a', true); });
    }
    const on = Math.sin(t * 9) > -0.8;
    g.text(L.name, 160, 24, { scale: 3, col: on ? '#ff5fd2' : '#5a2050', align: 'center', ui: true, shadow: on ? '#3a0a30' : null });
    for (const r of rain) g.rect(r.x, r.y, 1, 3, '#3d4a8a', true);
    for (const s of saws) g.dotted(s.ax, s.ay, s.bx, s.by, '#6d6a8a', 3);
    for (const s of solids) {
      if (s.gone) continue;
      const sx = s.crumbleT != null ? Math.sin(t * 70) : 0;
      if (s.oneWay) {
        g.rect(s.x + sx, s.y, s.w, s.h, s.crumble ? '#9a7a5e' : '#7a7896');
        for (let x = s.x + 2; x < s.x + s.w - 1; x += 4) g.rect(x + sx, s.y + 1, 2, 1, s.crumble ? '#5e4636' : '#45435e');
      } else {
        g.rect(s.x, s.y, s.w, s.h, '#2a2548'); g.rect(s.x, s.y, s.w, 2, '#6c5fae');
        for (let x = s.x + 4; x < s.x + s.w; x += 9) g.rect(x, s.y + 2, 3, 1, '#a99cff');
        for (let y = s.y + 8; y < s.y + s.h; y += 8) g.rect(s.x + 2, y, s.w - 4, 1, '#221e3c');
      }
    }
    for (const m of movers) { g.rect(m.x, m.y, m.w, m.h, '#ffd84a'); for (let x = 0; x < m.w; x += 6) g.rect(m.x + x, m.y + 1, 3, m.h - 2, '#1b1640'); }
    for (const s of saws) {
      g.circle(s.x, s.y, s.r, '#c8c8d8');
      for (let k = 0; k < 8; k++) { const a = s.rot + (k / 8) * TAU; g.rect(s.x + Math.cos(a) * (s.r + 1) - 1, s.y + Math.sin(a) * (s.r + 1) - 1, 2, 2, '#e8e8f0'); }
      g.circle(s.x, s.y, s.r * 0.35, '#5a5a6a');
    }
    if (pend) {
      g.dotted(pend.ax, pend.ay, pend.x, pend.y, '#9a9ab0', 2);
      g.circle(pend.x, pend.y, pend.r, '#5a5a6a'); g.circle(pend.x - 2, pend.y - 2, pend.r * 0.5, '#8a8a9a');
    }
    if (laser.state === 'warn' && Math.floor(t * 12) % 2) { g.dotted(laser.x, 14, laser.x, 180, '#ff5a5a', 3); g.text('!', laser.x, 16, { scale: 3, col: '#ff5a5a', align: 'center', ui: false }); }
    if (laser.state === 'on') { g.alpha(0.35); g.rect(laser.x - 5, 0, 10, 180, '#ff3a3a'); g.alpha(1); g.rect(laser.x - 2, 0, 4, 180, '#ff8a8a'); g.rect(laser.x - 1, 0, 2, 180, '#fff'); }
    for (const a of anvils) {
      if (a.warn > 0) { g.ring(a.x, a.ty - 3, 8 + Math.sin(t * 20) * 2, '#ff5a5a'); g.text(String(Math.ceil(a.warn * 3)), a.x, a.ty - 22, { scale: 2, col: '#ff5a5a', align: 'center', ui: false }); }
      else { g.rect(a.x - 6, a.y - 9, 12, 4, '#9a9aaa'); g.rect(a.x - 3, a.y - 5, 6, 3, '#7a7a8a'); g.rect(a.x - 5, a.y - 2, 10, 2, '#9a9aaa'); }
    }
    pickups.draw(g);
    guns.draw(g);
    for (const p of players) {
      if (p.dead) continue;
      const cx = p.b.x + p.b.w / 2;
      const blink = p.hurtT > 0 && p.hurtT < 0.5 && Math.floor(t * 20) % 2;
      drawPlayer(g, p.idx, cx, p.b.y + p.b.h, { flip: p.face < 0, size: p.st.size, flash: p.flashT > 0, alpha: blink ? 0.5 : 1, squash: p.b.squash });
      if (p.blockT > 0) { g.ring(cx, p.b.y + p.b.h / 2, 10 * p.st.size, '#9ff'); g.ring(cx, p.b.y + p.b.h / 2, 9 * p.st.size, '#5affd9'); }
      else if (p.blockCd <= 0) g.rect(cx - 1, p.b.y + p.b.h + 2, 2, 1, '#5affd9');
      if (p.shields) g.ring(cx, p.b.y + p.b.h / 2, 8 * p.st.size, '#9fd3ff55');
      const gun = p.st.gun;
      if (p.gs.reloadT > 0) { g.rect(cx - 5, p.b.y + p.b.h + 4, 10, 1, '#3a3550'); g.rect(cx - 5, p.b.y + p.b.h + 4, 10 * guns.reloadFrac(p.gs, gun), 1, '#fff6a8'); }
      else for (let k = 0; k < gun.ammo; k++) g.rect(cx - gun.ammo * 1.25 + k * 2.5, p.b.y + p.b.h + 4, 1.5, 2, k < p.gs.ammo ? '#fff6a8' : '#3a3550');
      const hw = 14;
      g.rect(cx - hw / 2, p.b.y - 3, hw, 2, '#3a1020'); g.rect(cx - hw / 2, p.b.y - 3, hw * Math.max(0, p.hp / p.maxHp), 2, p.poison && p.poison.t > 0 ? '#9aff5a' : '#ff5a5a');
      drawBuffs(g, p, cx, p.b.y - 6);
      drawTag(g, p.idx, cx, p.b.y - 5);
    }
    if (waterY < 182) {
      g.alpha(0.75); g.rect(0, waterY, 320, 182 - waterY, '#1b4bff'); g.alpha(1);
      for (let x = 0; x < 320; x += 2) g.rect(x, waterY + Math.sin(x * 0.2 + t * 6) * 1.2, 2, 1, '#8fe8ff');
    }
    for (const p of players) {
      if (!p.dead || game.finished) continue;
      const gh = p.ghost;
      drawPlayer(g, p.idx, gh.x, gh.y + Math.sin(t * 4 + p.idx) * 2, { alpha: 0.55, size: 0.9 });
      g.text(`P${p.idx + 1}`, gh.x, gh.y - 18, { scale: 1, col: SEAT_COLORS[p.idx], align: 'center', ui: false });
      g.dotted(gh.x, gh.y + 4, gh.x, groundBelow(gh.x) - 2, gh.cd <= 0 ? '#ff5a5a' : '#555', 5);
      g.text(gh.cd <= 0 ? 'X: ANVIL' : '...', gh.x, gh.y + 4, { scale: 1, col: gh.cd <= 0 ? '#ffd84a' : '#777', align: 'center', ui: false });
    }
  };
  return game;
}
