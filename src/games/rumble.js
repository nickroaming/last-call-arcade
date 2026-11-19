// RICOCHET ROOFTOP: side-view shootout on a wet rooftop at night.
import { TAU, clamp, rand, overlap, circleRect, angleDiff } from '../engine/util.js';
import { drawPlayer, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { makeBody, platformControl, stepBody, moveMovers } from './platformer.js';

export const meta = {
  id: 'rumble', name: 'RICOCHET ROOFTOP', color: '#33d6ff', music: 'rumble',
  tagline: 'A shootout on a wet rooftop',
  objective: 'Be the last one standing. Falling off costs a heart and throws you back up.',
  controls: [['STICK', 'Move and aim'], ['A', 'Jump (double jump)'], ['X / RT', 'Shoot (3 shots, auto reload)'], ['RB', 'Block'], ['R-STICK', 'Aim freely']],
  hazards: 'Saws on rails / crumbling ledges / searchlight laser / rising electric water',
  ghost: 'Knocked out: fly your ghost, press X to drop an anvil',
  tiebreak: 'Standing > more health > knocked out later',
};

const HEART = 34;
const TIME = 45;

const LAYOUTS = [
  {
    solids: [
      { x: 0, y: 150, w: 96, h: 30 }, { x: 128, y: 162, w: 64, h: 18 }, { x: 224, y: 150, w: 96, h: 30 },
      { x: 26, y: 112, w: 46, h: 4, oneWay: 1 }, { x: 248, y: 112, w: 46, h: 4, oneWay: 1 },
      { x: 134, y: 96, w: 52, h: 4, oneWay: 1, crumble: 1 },
      { x: 10, y: 72, w: 38, h: 4, oneWay: 1, crumble: 1 }, { x: 272, y: 72, w: 38, h: 4, oneWay: 1, crumble: 1 },
    ],
    movers: [{ w: 30, h: 5, ax: 98, bx: 192, ay: 128, by: 128, period: 5 }],
    saws: [{ ax: 104, ay: 150, bx: 216, by: 150, r: 7, period: 3.6 }],
    spawns: [[44, 140], [160, 150], [276, 140]],
  },
  {
    solids: [
      { x: 0, y: 156, w: 110, h: 24 }, { x: 210, y: 156, w: 110, h: 24 }, { x: 142, y: 100, w: 36, h: 80 },
      { x: 18, y: 120, w: 50, h: 4, oneWay: 1 }, { x: 252, y: 120, w: 50, h: 4, oneWay: 1 },
      { x: 120, y: 66, w: 80, h: 4, oneWay: 1, crumble: 1 },
      { x: 58, y: 88, w: 34, h: 4, oneWay: 1, crumble: 1 }, { x: 228, y: 88, w: 34, h: 4, oneWay: 1, crumble: 1 },
    ],
    movers: [
      { w: 26, h: 5, ax: 112, bx: 112, ay: 150, by: 96, period: 4 },
      { w: 26, h: 5, ax: 182, bx: 182, ay: 96, by: 150, period: 4 },
    ],
    saws: [{ ax: 8, ay: 155, bx: 102, by: 155, r: 7, period: 3 }, { ax: 30, ay: 44, bx: 290, by: 44, r: 7, period: 5 }],
    spawns: [[40, 146], [160, 90], [280, 146]],
  },
];

export function create(ctx) {
  const L = LAYOUTS[ctx.variant % LAYOUTS.length];
  const flip = ctx.variant >= LAYOUTS.length;
  const fx = ctx.fx, sound = ctx.sound;
  const mir = (o) => (flip ? { ...o, x: 320 - o.x - o.w } : { ...o });
  const solids = L.solids.map(mir);
  const movers = L.movers.map((m) => ({ ...m, oneWay: 1, mover: 1, ax: flip ? 320 - m.ax - m.w : m.ax, bx: flip ? 320 - m.bx - m.w : m.bx }));
  moveMovers(movers, 0);
  const allSolids = [...solids, ...movers];
  const saws = L.saws.map((s) => ({ ...s, ax: flip ? 320 - s.ax : s.ax, bx: flip ? 320 - s.bx : s.bx, x: s.ax, y: s.ay, rot: 0 }));

  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const [sx, sy] = L.spawns[i % 3];
    const w = 8 * st.size, h = 11 * st.size;
    const b = makeBody((flip ? 320 - sx : sx) - w / 2, sy - h - 2, w, h);
    const maxHp = st.hp * HEART;
    return {
      seat: pl.seat, idx: pl.idx, st, b, hp: maxHp, maxHp, dead: !!pl.ghost, deathT: pl.ghost ? -1 : null,
      face: (flip ? 320 - sx : sx) < 160 ? 1 : -1, fireCd: 0, ammo: 3, maxAmmo: 3, sinceShot: 9, blockT: 0, blockCd: 0,
      shields: st.shields, hurtT: 0, flashT: 0,
      ghost: { x: 160, y: 40, cd: pl.ghost ? 1 : 0 },
    };
  });

  const bullets = [];
  const blasts = []; // delayed aftershock blasts
  const anvils = [];
  const rain = Array.from({ length: 70 }, () => ({ x: rand(0, 340), y: rand(0, 180), s: rand(140, 220) }));
  const city = Array.from({ length: 18 }, (_, i) => ({ x: i * 19 - 6, w: rand(14, 22), h: rand(30, 90), lit: Array.from({ length: 12 }, () => Math.random() < 0.3) }));
  let t = 0, endT = null;
  const laser = { state: 'off', x: 0, dir: 1, t: 0, next: 11 };
  let waterY = 200;
  let floodAnnounced = false;

  const game = { meta, finished: false, ranking: [], players };
  const alive = () => players.filter((p) => !p.dead);

  function hurt(p, dmg, kx, ky, { inv = 0.6, src = null } = {}) {
    if (p.dead || p.hurtT > 0) return 'none';
    if (p.blockT > 0) {
      fx.ring(p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, 12, '#9ff'); sound.sfx('block');
      return 'blocked';
    }
    if (p.shields > 0) {
      p.shields -= 1; p.hurtT = 0.5;
      fx.popup('AIRBAG!', p.b.x + p.b.w / 2, p.b.y - 10, '#9fd3ff', 1);
      fx.ring(p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, 14, '#9fd3ff'); sound.sfx('block');
      return 'shield';
    }
    p.hp -= dmg; p.hurtT = inv; p.flashT = 0.12;
    p.b.vx += kx * p.st.knockTaken; p.b.vy += ky * p.st.knockTaken; p.b.stun = 0.22;
    fx.shake(0.25); fx.stop(0.035); sound.sfx('hit');
    fx.burst(p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, 8, SEAT_COLORS[p.idx], { speed: 90, life: 0.4 });
    if (src && src !== p && src.st.magnet) src.hp = Math.min(src.maxHp, src.hp + 8 * src.st.magnet);
    if (p.hp <= 0) kill(p);
    return 'hit';
  }
  function kill(p) {
    p.dead = true; p.deathT = t; p.hp = 0;
    const cx = p.b.x + p.b.w / 2, cy = p.b.y + p.b.h / 2;
    fx.burst(cx, cy, 34, SEAT_COLORS[p.idx], { speed: 160, life: 0.8, size: 2 });
    fx.burst(cx, cy, 14, '#fff', { speed: 120, life: 0.5 });
    fx.ring(cx, cy, 30, '#fff', 0.5);
    fx.slow(0.45); fx.shake(0.7); fx.flash('#fff', 0.35); sound.sfx('ko');
    fx.popup(`P${p.idx + 1} OUT!`, cx, cy - 16, SEAT_COLORS[p.idx], 3);
    p.ghost.x = clamp(cx, 10, 310); p.ghost.y = 40; p.ghost.cd = 1;
  }

  function solidAt(x, y) {
    for (const s of allSolids) if (!s.gone && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
    return null;
  }
  function groundBelow(x) {
    let best = 182;
    for (const s of allSolids) if (!s.gone && x >= s.x && x <= s.x + s.w && s.y < best && s.y > 20) best = s.y;
    return best;
  }

  function fire(p, c) {
    let a;
    if (c.aim) a = Math.atan2(c.ay, c.ax);
    else if (Math.hypot(c.mx, c.my) > 0.4) a = Math.atan2(c.my, c.mx);
    else a = p.face > 0 ? 0 : Math.PI;
    const n = 1 + p.st.spread;
    const sp = 230 * p.st.bulletSpeed;
    const cx = p.b.x + p.b.w / 2, cy = p.b.y + p.b.h * 0.4;
    for (let i = 0; i < n; i++) {
      const ang = a + (i - (n - 1) / 2) * 0.17;
      bullets.push({
        x: cx + Math.cos(a) * 6, y: cy + Math.sin(a) * 6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        owner: p, r: p.st.dmg >= 2 ? 2.5 : p.st.dmg < 1 ? 1.2 : 1.6, dmg: HEART * p.st.dmg,
        bounces: p.st.bounces, split: p.st.split, homing: p.st.homing, life: 3, trail: [],
      });
    }
    p.ammo -= 1; p.sinceShot = 0; p.fireCd = 0.28 * p.st.fireCd;
    p.b.vx -= Math.cos(a) * 30; p.squash = 0.2;
    fx.burst(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, 4, '#fff6a8', { speed: 60, life: 0.15, angle: a, spread: 0.8 });
    sound.sfx('shoot');
  }

  function blast(x, y, r, owner) {
    fx.ring(x, y, r, '#ffd84a', 0.3); fx.burst(x, y, 12, '#ffd84a', { speed: 100, life: 0.35 });
    fx.shake(0.2); sound.sfx('boom');
    for (const p of players) {
      if (p.dead || p === owner) continue;
      const cx = p.b.x + p.b.w / 2, cy = p.b.y + p.b.h / 2;
      const d = Math.hypot(cx - x, cy - y);
      if (d < r + 4) {
        const k = 170 * owner.st.knock;
        hurt(p, 12, ((cx - x) / (d || 1)) * k, -120, { inv: 0.15, src: owner });
      }
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bl = bullets[i];
      bl.life -= dt;
      bl.trail.push([bl.x, bl.y]); if (bl.trail.length > 4) bl.trail.shift();
      // homing toward rivals, magnet pulls toward magnet holders
      if (bl.homing) {
        let best = null, bd = 1e9;
        for (const p of players) {
          if (p.dead || p === bl.owner) continue;
          const d = Math.hypot(p.b.x - bl.x, p.b.y - bl.y);
          if (d < bd) { bd = d; best = p; }
        }
        if (best) steer(bl, best.b.x + best.b.w / 2, best.b.y + best.b.h / 2, 2.6 * bl.homing * dt);
      }
      for (const p of players) {
        if (p.dead || p === bl.owner || !p.st.magnet) continue;
        const cx = p.b.x + p.b.w / 2, cy = p.b.y + p.b.h / 2;
        if (Math.hypot(cx - bl.x, cy - bl.y) < 70) steer(bl, cx, cy, 1.4 * p.st.magnet * dt);
      }
      bl.vy += 150 * dt;
      const px = bl.x, py = bl.y;
      bl.x += bl.vx * dt; bl.y += bl.vy * dt;
      let dead = bl.life <= 0 || bl.y > 200 || bl.y < -60;
      // walls of the arena
      if (!dead && (bl.x < 0 || bl.x > 320)) {
        if (bl.bounces > 0) { bl.vx = -bl.vx; bl.x = clamp(bl.x, 0, 320); bounced(bl); } else dead = true;
      }
      if (!dead) {
        const s = solidAt(bl.x, bl.y);
        if (s) {
          if (bl.bounces > 0) {
            const wasOutX = px < s.x || px > s.x + s.w;
            if (wasOutX) { bl.vx = -bl.vx; bl.x = px; } else { bl.vy = -bl.vy * 0.95; bl.y = py; }
            bounced(bl);
          } else {
            dead = true;
            fx.burst(px, py, 5, '#cfc8ff', { speed: 50, life: 0.25 });
            if (bl.owner.st.aftershock) blasts.push({ x: px, y: py, t: 0.38, r: 16 + 6 * bl.owner.st.aftershock, owner: bl.owner });
          }
        }
      }
      if (!dead) {
        for (const p of players) {
          if (p.dead || p === bl.owner) continue;
          if (!circleRect(bl.x, bl.y, bl.r + 1, p.b)) continue;
          if (p.blockT > 0 && p.st.reflect) {
            bl.vx = -bl.vx * 1.1; bl.vy = -Math.abs(bl.vy) * 0.5; bl.owner = p;
            fx.ring(bl.x, bl.y, 10, '#5affd9'); sound.sfx('block');
            fx.popup('REFLECT!', bl.x, bl.y - 8, '#5affd9', 1);
            break;
          }
          const k = 150 * bl.owner.st.knock;
          const sp = Math.hypot(bl.vx, bl.vy) || 1;
          const res = hurt(p, bl.dmg, (bl.vx / sp) * k, (bl.vy / sp) * k * 0.6 - 60, { inv: 0.06, src: bl.owner });
          dead = true;
          if (res === 'hit' && bl.owner.st.aftershock) blasts.push({ x: bl.x, y: bl.y, t: 0.38, r: 16 + 6 * bl.owner.st.aftershock, owner: bl.owner });
          break;
        }
      }
      if (dead) bullets.splice(i, 1);
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const bz = blasts[i];
      bz.t -= dt;
      if (bz.t <= 0) { blast(bz.x, bz.y, bz.r, bz.owner); blasts.splice(i, 1); }
    }
  }
  function steer(bl, tx, ty, amt) {
    const a = Math.atan2(bl.vy, bl.vx), want = Math.atan2(ty - bl.y, tx - bl.x);
    const na = a + clamp(angleDiff(a, want), -amt, amt);
    const sp = Math.hypot(bl.vx, bl.vy);
    bl.vx = Math.cos(na) * sp; bl.vy = Math.sin(na) * sp;
  }
  function bounced(bl) {
    bl.bounces -= 1;
    fx.burst(bl.x, bl.y, 3, '#7dff8a', { speed: 40, life: 0.2 });
    if (bl.split > 0) {
      bl.split -= 1;
      const a = Math.atan2(bl.vy, bl.vx), sp = Math.hypot(bl.vx, bl.vy);
      bullets.push({ ...bl, vx: Math.cos(a + 0.45) * sp, vy: Math.sin(a + 0.45) * sp, trail: [] });
      bl.vx = Math.cos(a - 0.45) * sp; bl.vy = Math.sin(a - 0.45) * sp;
    }
  }

  function updateHazards(dt) {
    moveMovers(movers, t);
    for (const s of saws) {
      const k = 0.5 - 0.5 * Math.cos((t / s.period) * TAU);
      s.x = s.ax + (s.bx - s.ax) * k; s.y = s.ay + (s.by - s.ay) * k;
      s.rot += dt * 12;
      if (Math.random() < 0.3) fx.burst(s.x, s.y + s.r, 1, '#ffd27a', { speed: 50, life: 0.2, angle: -Math.PI / 2, spread: 2 });
      for (const p of players) {
        if (p.dead || !circleRect(s.x, s.y, s.r, p.b)) continue;
        const dir = p.b.x + p.b.w / 2 < s.x ? -1 : 1;
        hurt(p, HEART, dir * 190, -200);
      }
    }
    for (const s of solids) {
      if (!s.crumble) continue;
      if (s.gone) { s.back -= dt; if (s.back <= 0) { s.gone = false; s.crumbleT = null; } continue; }
      if (s.crumbleT == null && players.some((p) => !p.dead && p.b.ground === s)) { s.crumbleT = 0.6; sound.sfx('crumble'); }
      if (s.crumbleT != null) {
        s.crumbleT -= dt;
        if (s.crumbleT <= 0) {
          s.gone = true; s.back = 5;
          fx.burst(s.x + s.w / 2, s.y, 14, '#8a6d5b', { speed: 60, life: 0.6, grav: 300, size: 2 });
        }
      }
    }
    // searchlight laser
    if (laser.state === 'off' && t >= laser.next) {
      laser.state = 'warn'; laser.t = 1.2; laser.dir = Math.random() < 0.5 ? 1 : -1; laser.x = laser.dir > 0 ? 6 : 314;
      sound.sfx('warn'); fx.popup('SEARCHLIGHT!', 160, 30, '#ff5a5a', 2);
    } else if (laser.state === 'warn') {
      laser.t -= dt;
      if (laser.t <= 0) { laser.state = 'on'; laser.t = 3; sound.sfx('laser'); }
    } else if (laser.state === 'on') {
      laser.t -= dt;
      laser.x += laser.dir * (308 / 3) * dt;
      for (const p of players) {
        if (p.dead) continue;
        if (laser.x > p.b.x - 3 && laser.x < p.b.x + p.b.w + 3) hurt(p, HEART, laser.dir * 160, -180);
      }
      if (Math.random() < 0.6) fx.burst(laser.x, groundBelow(laser.x), 2, '#ff8a8a', { speed: 60, life: 0.25, angle: -Math.PI / 2, spread: 2 });
      if (laser.t <= 0) { laser.state = 'off'; laser.next = t + 9; }
    }
    // rising electric water
    if (t > 25) {
      if (!floodAnnounced) { floodAnnounced = true; fx.popup('THE WATER IS LIVE!', 160, 40, '#33d6ff', 2); sound.sfx('warn'); }
      waterY = Math.max(108, 182 - (t - 25) * 4);
      for (const p of players) {
        if (p.dead || p.b.y + p.b.h < waterY + 2) continue;
        if (hurt(p, HEART, 0, 0) !== 'none') { p.b.vy = -330; sound.sfx('zap'); }
        else if (p.blockT > 0 || p.hurtT > 0) p.b.vy = Math.min(p.b.vy, -200);
      }
    }
    // anvils from ghosts
    for (let i = anvils.length - 1; i >= 0; i--) {
      const a = anvils[i];
      if (a.warn > 0) { a.warn -= dt; continue; }
      a.vy += 900 * dt; a.y += a.vy * dt;
      const box = { x: a.x - 6, y: a.y - 9, w: 12, h: 9 };
      for (const p of players) if (!p.dead && overlap(box, p.b)) hurt(p, HEART * 1.3, (p.b.x + p.b.w / 2 < a.x ? -1 : 1) * 120, -150, { src: a.owner });
      if (a.y >= a.ty) {
        fx.burst(a.x, a.ty, 16, '#bbb', { speed: 90, life: 0.4, angle: -Math.PI / 2, spread: Math.PI });
        fx.shake(0.35); sound.sfx('boom');
        for (const p of players) {
          if (p.dead) continue;
          if (Math.abs(p.b.x + p.b.w / 2 - a.x) < 14 && Math.abs(p.b.y + p.b.h - a.ty) < 14) hurt(p, HEART, (p.b.x + p.b.w / 2 < a.x ? -1 : 1) * 160, -200, { src: a.owner });
        }
        anvils.splice(i, 1);
      }
    }
  }

  game.update = (dt, controls) => {
    t += dt;
    for (const r of rain) { r.y += r.s * dt; r.x -= r.s * 0.25 * dt; if (r.y > 180) { r.y = -5; r.x = rand(0, 360); } }
    updateHazards(dt);
    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.dead) {
        const gh = p.ghost;
        gh.x = clamp(gh.x + c.mx * 150 * dt, 6, 314);
        gh.y = clamp(gh.y + c.my * 150 * dt, 34, 120);
        gh.cd -= dt;
        if (c.fireP && gh.cd <= 0 && endT === null) {
          const ty = groundBelow(gh.x);
          anvils.push({ x: gh.x, y: -12, vy: 0, ty, warn: 1.0, owner: p });
          gh.cd = 3.5; sound.sfx('warn');
        }
        continue;
      }
      p.hurtT -= dt; p.flashT -= dt; p.fireCd -= dt; p.blockT -= dt; p.blockCd -= dt; p.sinceShot += dt;
      const ev = platformControl(p.b, c, p.st, dt);
      if (ev) { sound.sfx('jump'); fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#8fa0c8'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      if (c.blockP && p.blockCd <= 0) {
        p.blockT = 0.32; p.blockCd = 2.4 * p.st.blockCd; sound.sfx('block');
      }
      if (p.ammo < p.maxAmmo && p.sinceShot > (p.ammo === 0 ? 1.1 : 1.6)) { p.ammo = p.maxAmmo; }
      if (c.fire && p.fireCd <= 0 && p.ammo > 0) fire(p, c);
      stepBody(p.b, dt, allSolids);
      if (p.b.landed) fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#8fa0c8');
      if (p.b.y > 186) { // fell off: lose a heart and get thrown back up
        p.b.y = 184 - p.b.h; p.b.vy = -360; p.b.vx *= 0.3; p.hurtT = 0;
        if (hurt(p, HEART, 0, 0, { inv: 0.4 }) === 'blocked') p.b.vy = -360;
        fx.burst(p.b.x + p.b.w / 2, 178, 12, '#33d6ff', { speed: 80, life: 0.4, angle: -Math.PI / 2, spread: 1.4 });
      }
    }
    updateBullets(dt);

    const al = alive();
    const solo = players.filter((p) => p.deathT !== -1).length <= 1;
    if (endT === null && ((!solo && al.length <= 1) || t >= TIME)) endT = 1.3;
    if (endT !== null) {
      endT -= dt;
      if (endT <= 0 && !game.finished) {
        game.finished = true;
        game.ranking = rank();
      }
    }
  };

  function rank() {
    const a = players.filter((p) => !p.dead).sort((x, y) => y.hp - x.hp);
    const d = players.filter((p) => p.dead).sort((x, y) => y.deathT - x.deathT);
    return [...a, ...d].map((p) => p.seat);
  }

  game.hud = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (p.dead) return 'GHOST';
    return '@'.repeat(Math.ceil(p.hp / HEART)) + (p.shields ? '+' : '');
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    // sky and city
    g.rect(0, 0, 320, 180, '#0d0b1f', true);
    g.rect(0, 60, 320, 120, '#141032', true);
    g.circle(262, 34, 12, '#e9e4ff', true);
    g.circle(258, 31, 12, '#0d0b1f', true);
    for (const b of city) {
      g.rect(b.x, 180 - b.h, b.w, b.h, '#1b1640', true);
      b.lit.forEach((on, k) => { if (on) g.rect(b.x + 3 + (k % 3) * 5, 180 - b.h + 5 + Math.floor(k / 3) * 7, 2, 3, (Math.floor(t * 2 + k) % 9) ? '#ffd27a' : '#7a6a3a', true); });
    }
    // neon sign
    const on = Math.sin(t * 9) > -0.8;
    g.text('LAST CALL', 160, 26, { scale: 3, col: on ? '#ff5fd2' : '#5a2050', align: 'center', ui: true, shadow: on ? '#3a0a30' : null });
    for (const r of rain) g.rect(r.x, r.y, 1, 3, '#3d4a8a', true);

    // saw rails
    for (const s of saws) g.dotted(s.ax, s.ay, s.bx, s.by, '#6d6a8a', 3);
    // solids
    for (const s of solids) {
      if (s.gone) continue;
      const shakeX = s.crumbleT != null ? Math.sin(t * 70) : 0;
      if (s.oneWay) {
        const col = s.crumble ? '#9a7a5e' : '#7a7896';
        g.rect(s.x + shakeX, s.y, s.w, s.h, col);
        for (let x = s.x + 2; x < s.x + s.w - 1; x += 4) g.rect(x + shakeX, s.y + 1, 2, 1, s.crumble ? '#5e4636' : '#45435e');
        if (s.crumble) g.rect(s.x + s.w / 2 + shakeX, s.y, 1, s.h, '#3a2a20');
      } else {
        g.rect(s.x, s.y, s.w, s.h, '#2a2548');
        g.rect(s.x, s.y, s.w, 2, '#6c5fae');
        for (let x = s.x + 4; x < s.x + s.w; x += 9) g.rect(x, s.y + 2, 3, 1, '#a99cff');
        for (let y = s.y + 8; y < s.y + s.h; y += 8) g.rect(s.x + 2, y, s.w - 4, 1, '#221e3c');
      }
    }
    for (const m of movers) {
      g.rect(m.x, m.y, m.w, m.h, '#ffd84a');
      for (let x = 0; x < m.w; x += 6) g.rect(m.x + x, m.y + 1, 3, m.h - 2, '#1b1640');
    }
    // saws
    for (const s of saws) {
      g.circle(s.x, s.y, s.r, '#c8c8d8');
      for (let k = 0; k < 8; k++) {
        const a = s.rot + (k / 8) * TAU;
        g.rect(s.x + Math.cos(a) * (s.r + 1) - 1, s.y + Math.sin(a) * (s.r + 1) - 1, 2, 2, '#e8e8f0');
      }
      g.circle(s.x, s.y, s.r * 0.35, '#5a5a6a');
    }
    // laser
    if (laser.state === 'warn' && Math.floor(t * 12) % 2) {
      g.dotted(laser.x, 14, laser.x, 180, '#ff5a5a', 3);
      g.text('!', laser.x, 16, { scale: 3, col: '#ff5a5a', align: 'center', ui: false });
    }
    if (laser.state === 'on') {
      g.alpha(0.35); g.rect(laser.x - 5, 0, 10, 180, '#ff3a3a'); g.alpha(1);
      g.rect(laser.x - 2, 0, 4, 180, '#ff8a8a');
      g.rect(laser.x - 1, 0, 2, 180, '#ffffff');
    }
    // anvils
    for (const a of anvils) {
      if (a.warn > 0) {
        const pulse = 8 + Math.sin(t * 20) * 2;
        g.ring(a.x, a.ty - 3, pulse, '#ff5a5a');
        g.text(String(Math.ceil(a.warn * 3)), a.x, a.ty - 22, { scale: 2, col: '#ff5a5a', align: 'center', ui: false });
        g.dotted(a.x, 14, a.x, a.ty - 12, '#ff5a5a55', 4);
      } else {
        g.rect(a.x - 6, a.y - 9, 12, 4, '#9a9aaa');
        g.rect(a.x - 3, a.y - 5, 6, 3, '#7a7a8a');
        g.rect(a.x - 5, a.y - 2, 10, 2, '#9a9aaa');
      }
    }
    // bullets
    for (const bl of bullets) {
      const col = SEAT_COLORS[bl.owner.idx];
      bl.trail.forEach(([x, y], k) => { g.alpha(0.15 + k * 0.15); g.rect(x - 0.5, y - 0.5, 1.5, 1.5, col); });
      g.alpha(1);
      g.circle(bl.x, bl.y, bl.r + 0.5, col);
      g.rect(bl.x - 0.5, bl.y - 0.5, 1, 1, '#fff');
    }
    // players
    for (const p of players) {
      if (p.dead) continue;
      const cx = p.b.x + p.b.w / 2;
      const blink = p.hurtT > 0 && p.hurtT < 0.5 && Math.floor(t * 20) % 2;
      drawPlayer(g, p.idx, cx, p.b.y + p.b.h, { flip: p.face < 0, size: p.st.size, flash: p.flashT > 0, alpha: blink ? 0.5 : 1, squash: p.b.squash });
      if (p.blockT > 0) { g.ring(cx, p.b.y + p.b.h / 2, 10 * p.st.size, '#9ff'); g.ring(cx, p.b.y + p.b.h / 2, 9 * p.st.size, '#5affd9'); }
      else if (p.blockCd <= 0) g.rect(cx - 1, p.b.y + p.b.h + 2, 2, 1, '#5affd9');
      if (p.shields) g.ring(cx, p.b.y + p.b.h / 2, 8 * p.st.size, '#9fd3ff55');
      for (let k = 0; k < p.maxAmmo; k++) g.rect(cx - 4 + k * 3, p.b.y + p.b.h + 4, 2, 2, k < p.ammo ? '#fff6a8' : '#3a3550');
      const hearts = Math.ceil(p.hp / HEART);
      for (let k = 0; k < hearts; k++) g.rect(cx - hearts * 1.5 + k * 3, p.b.y - 3, 2, 2, '#ff5a5a');
      drawTag(g, p.idx, cx, p.b.y - 4);
    }
    // water
    if (waterY < 182) {
      g.alpha(0.75); g.rect(0, waterY, 320, 182 - waterY, '#1b4bff'); g.alpha(1);
      for (let x = 0; x < 320; x += 2) g.rect(x, waterY + Math.sin(x * 0.2 + t * 6) * 1.2, 2, 1, '#8fe8ff');
      for (let k = 0; k < 6; k++) g.rect(rand(0, 320), waterY + rand(0, 20), 1, rand(2, 6), '#ffffff');
    }
    // ghosts
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
