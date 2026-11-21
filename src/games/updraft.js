// UPDRAFT: the screen climbs and a laser floor chases you. Hop up the ledges,
// shoot rivals off them. The sky changes colour as you climb.
import { clamp, rand, overlap } from '../engine/util.js';
import { drawPlayer, drawTag, drawArm, SEAT_COLORS } from '../engine/sprites.js';
import { makeBody, platformControl, stepBody } from './platformer.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { switcheroo } from '../game/switcheroo.js';

export const meta = {
  id: 'updraft', name: 'UPDRAFT', color: '#5affd9', music: 'dustlap', tier: 1,
  tagline: 'Climb or get zapped',
  card: { rule: 'CLIMB. THE LASER FLOOR FOLLOWS', rule2: 'LAST ONE ABOVE IT WINS', keys: [['A', 'JUMP'], ['X', 'SHOOT'], ['RB', 'BLOCK']], danger: 'LASER FLOOR, ICICLES, CRUMBLE' },
  objective: 'The screen keeps climbing and the laser floor follows. Last one above it wins. Shoot rivals off their ledges.',
  controls: [['STICK', 'Move and aim'], ['A', 'Jump (double jump)'], ['X / RT', 'Shoot (knockback)'], ['RB', 'Block'], ['DOWN + A', 'Drop through a ledge']],
  hazards: 'Laser floor / crumbling ledges / springs / falling icicles / side gusts',
  ghost: 'Zapped: you become a storm cloud. X drops an icicle under you',
  tiebreak: 'Survived longer > climbed higher',
  gunUse: 'Your gun (knock rivals off ledges)', blockUse: 'Your block (RB)', bodyUse: 'Your body and jumps',
  twists: ['moon', 'heavy', 'wind', 'tilt', 'rubber', 'giant', 'warp'],
};
const TIME = 45;
const FLOOR = 174;

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  let env = twistEnv(tw, 0);
  let t = 0, endT = null, climbed = 0;
  const plats = [{ x: 0, y: 160, w: 320, h: 6, oneWay: 1, kind: 'start' }];
  let topY = 160;
  function addRow() {
    const y = topY - rand(19, 26);
    const n = Math.random() < 0.55 ? 2 : 1;
    const used = [];
    for (let k = 0; k < n; k++) {
      const w = rand(34, 58);
      let x = rand(6, 314 - w);
      if (used.some((u) => Math.abs(u - x) < 70)) x = (x + 150) % (314 - w);
      used.push(x);
      const r = Math.random();
      const kind = r < 0.14 ? 'spring' : r < 0.32 ? 'crumble' : r < 0.48 ? 'move' : 'normal';
      plats.push({ x, y, w: kind === 'spring' ? 26 : w, h: 4, oneWay: 1, kind, ax: x, ph: rand(0, 6), amp: rand(20, 50), dx: 0, dy: 0 });
    }
    topY = y;
  }
  while (topY > -30) addRow();
  const starts = [[60, 150], [160, 150], [260, 150]];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const w = 8 * st.size, h = 11 * st.size;
    const p = {
      seat: pl.seat, idx: pl.idx, b: makeBody(starts[i][0] - w / 2, starts[i][1] - h, w, h), dead: !!pl.ghost, deathT: pl.ghost ? -1 : null,
      face: 1, gs: newGunState(st.gun), blockT: 0, blockCd: 0, shields: st.shields, flashT: 0, slowT: 0, best: 0, mult: pl.pickupMult ?? 1,
      cloud: { x: 80 + i * 80, cd: 2 },
    };
    p.pos = () => (p.dead ? [p.cloud.x, 24] : [p.b.x + p.b.w / 2, p.b.y + p.b.h / 2]);
    return makeBuffable(p, st);
  });
  const icicles = [];
  let icicleT = 6, gust = null, gustT = 15;
  const stars = Array.from({ length: 50 }, () => ({ x: rand(0, 320), y: rand(0, 180), k: rand(0.2, 0.6) }));
  const game = { meta, finished: false, ranking: [], players };
  const alive = () => players.filter((p) => !p.dead);
  const height = (p) => Math.round((climbed + (FLOOR - (p.b.y + p.b.h))) / 4);

  function zap(p) {
    if (p.shields > 0) {
      p.shields -= 1; p.b.vy = -420; fx.popup('AIRBAG!', p.b.x, p.b.y - 10, '#9fd3ff', 1); sound.sfx('boing'); return;
    }
    p.dead = true; p.deathT = t;
    const [x, y] = p.pos();
    fx.burst(x, y, 34, SEAT_COLORS[p.idx], { speed: 150, life: 0.8, size: 2 }); fx.burst(x, FLOOR, 20, '#ff3a3a', { speed: 120, life: 0.5, angle: -Math.PI / 2, spread: 1.5 });
    fx.slow(0.4); fx.shake(0.6); fx.flash('#ff3a3a', 0.3); sound.sfx('ko'); fx.hueKick = (fx.hueKick || 0) + 30;
    fx.popup(`P${p.idx + 1} ZAPPED!`, x, y - 20, SEAT_COLORS[p.idx], 3);
    p.cloud.x = clamp(x, 10, 310);
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: 0, x1: 320, y1: 182, open: { top: true, bottom: true } },
    accel: () => [140 * env.bulletGrav * env.gx + env.wind, 140 * env.bulletGrav * env.gy],
    solidAt: () => null,
    targets: () => alive().map((p) => ({ ref: p, owner: p, rect: p.b, r: p.b.w / 2 })),
    onHit: (p, info) => {
      if (p.blockT > 0) { if (p.st.reflect && info.kind === 'bullet') return 'reflect'; sound.sfx('block'); return 'blocked'; }
      const k = 170 * (info.g.knock || 1) * Math.sqrt(Math.max(0.4, info.dmg / 34)) * p.st.knockTaken;
      p.b.vx += info.dx * k; p.b.vy += info.dy * k * 0.5 - 40; p.b.stun = 0.25; p.flashT = 0.1;
      if (info.g.frost) p.slowT = 1.5;
      fx.impact(p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, { dmg: info.dmg, col: SEAT_COLORS[p.idx], dx: info.dx, dy: info.dy }); sound.sfx('hit');
      return 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega', 'bounce'], spot: () => { const q = plats[plats.length - 1 - Math.floor(rand(0, 3))]; return [q.x + q.w / 2, q.y - 8]; } });

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    const speed = t < 4 ? 0 : Math.min(24, 5 + (t - 4) * 0.4); // a 4 s teach beat, then a gentler climb (was over in ~7 s)
    if (t >= 2.5 && t - dt < 2.5) { fx.popup('GET CLIMBING!', 160, 60, '#5affd9', 3); sound.sfx('go'); }
    const dy = speed * dt;
    climbed += dy;
    // scroll the world down
    for (const q of plats) {
      q.y += dy;
      if (q.kind === 'move') { const nx = q.ax + Math.sin(t * 1.3 + q.ph) * q.amp; q.dx = clamp(nx, 4, 316 - q.w) - q.x; q.x += q.dx; }
      if (q.kind === 'crumble' && q.crumbleT != null) { q.crumbleT -= dt; if (q.crumbleT <= 0) { q.gone = true; fx.burst(q.x + q.w / 2, q.y, 10, '#9a7a5e', { speed: 50, life: 0.5, grav: 200 }); } }
    }
    for (const p of players) if (!p.dead) p.b.y += dy;
    for (const it of pickups.items) it.y += dy;
    for (let i = plats.length - 1; i >= 0; i--) if (plats[i].y > 190 || plats[i].gone) plats.splice(i, 1);
    topY += dy;
    while (topY > -30) addRow();
    // icicles
    icicleT -= dt;
    if (icicleT <= 0) { icicleT = Math.max(1.4, 2.8 - t * 0.03); const tgt = alive()[Math.floor(rand(0, alive().length))]; icicles.push({ x: tgt ? clamp(tgt.b.x + rand(-14, 14), 8, 312) : rand(8, 312), y: -6, vy: 0, warn: 1 }); sound.sfx('warn'); }
    for (let i = icicles.length - 1; i >= 0; i--) {
      const ic = icicles[i];
      if (ic.warn > 0) { ic.warn -= dt; continue; }
      ic.vy += 500 * dt; ic.y += ic.vy * dt;
      const box = { x: ic.x - 2, y: ic.y - 8, w: 4, h: 8 };
      for (const p of alive()) if (overlap(box, p.b) && p.blockT <= 0) { p.b.vy = 120; p.b.vx += rand(-80, 80); p.b.stun = 0.35; p.flashT = 0.1; sound.sfx('hit'); fx.burst(ic.x, ic.y, 8, '#bff3ff', { speed: 60, life: 0.3 }); ic.y = 999; }
      if (ic.y > 190) icicles.splice(i, 1);
    }
    // side gusts
    gustT -= dt;
    if (gustT <= 0 && !gust) { gust = { dir: Math.random() < 0.5 ? 1 : -1, warn: 1, t: 1.6 }; gustT = 8; sound.sfx('warn'); }
    if (gust) { if (gust.warn > 0) gust.warn -= dt; else { gust.t -= dt; for (const p of alive()) p.b.vx += gust.dir * 300 * dt; if (gust.t <= 0) gust = null; } }

    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.dead) {
        p.cloud.x = clamp(p.cloud.x + c.mx * 140 * dt, 8, 312); p.cloud.cd -= dt;
        if (c.fireP && p.cloud.cd <= 0 && endT === null) { icicles.push({ x: p.cloud.x, y: 30, vy: 60, warn: 0 }); p.cloud.cd = 2.5; sound.sfx('shoot'); }
        continue;
      }
      tickBuffs(p, dt);
      p.flashT -= dt; p.blockT -= dt; p.blockCd -= dt; p.slowT -= dt;
      p.b.slowT = p.slowT;
      const ev = platformControl(p.b, c, p.st, dt, env);
      if (ev) { sound.sfx('jump'); fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#bff3ff'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      if (c.blockP && p.blockCd <= 0) { p.blockT = 0.3; p.blockCd = 2.4 * p.st.blockCd; sound.sfx('block'); switcheroo(p, players, { fx, sound, box: (q) => q.b }); if (p.st.blockBlink) { p.b.y -= 30; p.b.vy = Math.min(p.b.vy, 0); fx.burst(p.b.x, p.b.y, 10, '#fff', { speed: 50, life: 0.3 }); } }
      const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.4 ? Math.atan2(c.my, c.mx) : (p.face > 0 ? 0 : Math.PI);
      const [cx, cy] = p.pos();
      guns.trigger(p, p.gs, p.st.gun, c.fire, a, cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, dt);
      stepBody(p.b, dt, plats);
      if (p.b.landed && p.b.ground) {
        const q = p.b.ground;
        if (q.kind === 'spring') { p.b.vy = -430 * Math.sqrt(p.st.jump); p.b.onGround = false; sound.sfx('boing'); fx.burst(cx, q.y, 8, '#5affd9', { speed: 70, life: 0.3 }); }
        else fx.dust(cx, p.b.y + p.b.h, '#bff3ff');
      }
      if (p.b.ground && p.b.ground.kind === 'crumble' && p.b.ground.crumbleT == null) { p.b.ground.crumbleT = 0.5; sound.sfx('crumble'); }
      if (p.b.y < -40) p.b.y = -40;
      p.best = Math.max(p.best, height(p));
      if (p.b.y + p.b.h > FLOOR) zap(p);
    }
    guns.update(dt);
    pickups.update(dt, alive().map((p) => { const [x, y] = p.pos(); return { p, x, y, r: p.b.w / 2 + 2, mult: p.mult }; }));
    const started = players.filter((p) => p.deathT !== -1).length;
    if (endT === null && ((started > 1 && alive().length <= 1) || (started > 0 && alive().length === 0) || t >= TIME)) endT = 1.2;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    const a = alive().sort((x, y) => height(y) - height(x));
    const d = players.filter((p) => p.dead).sort((x, y) => y.deathT - x.deathT || y.best - x.best);
    return [...a, ...d].map((p) => p.seat);
  }
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.dead ? 'CLOUD' : `${height(p)}M`; };
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || p.dead) return null;
    const [x, y] = p.pos();
    let best = null, bs = 1e9;
    for (const q of plats) {
      if (q.y > y - 6 || q.y < y - 46) continue;
      const s = Math.max(0, Math.abs(q.x + q.w / 2 - x) - q.w / 2) + (y - q.y) * 1.5 + (q.kind === 'crumble' ? 25 : 0) - (q.kind === 'spring' ? 15 : 0);
      if (s < bs) { bs = s; best = q; }
    }
    if (!best) return [160, y - 30];
    const tx = clamp(x, best.x + 4, best.x + best.w - 4);
    return [tx, best.y - 8];
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    const hue = (200 + climbed * 0.35) % 360;
    g.rect(0, 0, 320, 180, `hsl(${hue},55%,12%)`, true);
    g.rect(0, 90, 320, 90, `hsl(${(hue + 30) % 360},55%,16%)`, true);
    for (const s of stars) { const y = (s.y + climbed * s.k) % 180; g.rect(s.x, y, 1, 1, '#ffffff88', true); }
    for (let k = 0; k < 6; k++) { const y = ((k * 40 + climbed * 0.5) % 240) - 30; g.alpha(0.05); g.circle(40 + k * 55, y, 18, '#ffffff', true); g.alpha(1); }
    // altitude marks
    for (let m = Math.floor(climbed / 100) * 100; m < climbed + 200; m += 100) { const y = FLOOR - (m - climbed); if (y > 14 && y < 176) { g.rect(0, y, 4, 1, '#ffffff55'); g.text(`${Math.round(m / 4)}M`, 6, y - 3, { scale: 1, col: '#ffffff77', ui: false, shadow: null }); } }
    for (const q of plats) {
      const sx = q.crumbleT != null ? Math.sin(t * 70) : 0;
      const col = q.kind === 'spring' ? '#5affd9' : q.kind === 'crumble' ? '#9a7a5e' : q.kind === 'move' ? '#ffd84a' : q.kind === 'start' ? '#6c5fae' : '#c8c0ff';
      g.rect(q.x + sx, q.y, q.w, q.h, col);
      if (q.kind === 'spring') { g.rect(q.x + 4, q.y + 4, 2, 3, '#5affd9'); g.rect(q.x + q.w - 6, q.y + 4, 2, 3, '#5affd9'); }
      if (q.kind === 'move') for (let x = 0; x < q.w; x += 6) g.rect(q.x + x, q.y + 1, 3, 2, '#3a3000');
      if (q.kind === 'crumble') g.rect(q.x + q.w / 2 + sx, q.y, 1, q.h, '#3a2a20');
    }
    for (const ic of icicles) {
      if (ic.warn > 0) { if (Math.floor(t * 5) % 2) { g.text('!', ic.x, 16, { scale: 2, col: '#bff3ff', align: 'center', ui: false }); g.dotted(ic.x, 24, ic.x, FLOOR, '#bff3ff44', 6); } continue; }
      g.rect(ic.x - 2, ic.y - 8, 4, 4, '#bff3ff'); g.rect(ic.x - 1, ic.y - 4, 2, 4, '#ffffff');
    }
    if (gust) {
      const s = gust.dir > 0 ? '>>>' : '<<<';
      for (let y = 30; y < 170; y += 28) g.text(s, gust.warn > 0 ? (gust.dir > 0 ? 14 : 300) : ((t * 200 * gust.dir) % 320 + 320) % 320, y, { scale: 2, col: gust.warn > 0 ? '#ffd84a' : '#ffffff66', align: 'center', ui: false });
    }
    pickups.draw(g);
    guns.draw(g);
    for (const p of players) {
      if (p.dead) continue;
      const cx = p.b.x + p.b.w / 2;
      drawPlayer(g, p.idx, cx, p.b.y + p.b.h, { flip: p.face < 0, size: p.st.size, flash: p.flashT > 0, squash: p.b.squash, look: p.aim });
      drawArm(g, p, cx, p.b.y + p.b.h / 2 - 1, p.st.size);
      if (p.blockT > 0) g.ring(cx, p.b.y + p.b.h / 2, 10 * p.st.size, '#5affd9');
      if (p.shields) g.ring(cx, p.b.y + p.b.h / 2, 8 * p.st.size, '#9fd3ff55');
      drawTag(g, p.idx, cx, Math.max(22, p.b.y - 2));
      drawBuffs(g, p, cx, p.b.y + p.b.h + 3);
      if (p.b.y < 14) g.text('^', cx, 16, { scale: 2, col: SEAT_COLORS[p.idx], align: 'center', ui: false });
    }
    // laser floor
    g.alpha(0.35); g.rect(0, FLOOR - 4, 320, 12, '#ff2a2a'); g.alpha(1);
    g.rect(0, FLOOR, 320, 2, '#ff6a6a'); g.rect(0, FLOOR + 2, 320, 6, '#5a0a10');
    for (let k = 0; k < 4; k++) g.rect(rand(0, 320), FLOOR - rand(1, 6), 1, rand(2, 5), '#ffb0b0');
    for (const p of players) {
      if (!p.dead || game.finished) continue;
      g.circle(p.cloud.x, 26, 7, '#5a5a7a'); g.circle(p.cloud.x - 6, 28, 5, '#5a5a7a'); g.circle(p.cloud.x + 6, 28, 5, '#5a5a7a');
      g.text(`P${p.idx + 1}`, p.cloud.x, 22, { scale: 1, col: SEAT_COLORS[p.idx], align: 'center', ui: false, shadow: null });
    }
  };
  return game;
}
