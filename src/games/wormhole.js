// WORMHOLE: your bullets punch holes in walls. Each player owns two holes; a
// new shot moves the older one. Anything that enters one of your holes, a
// player, a bullet or the orb, comes out of your other hole at the same speed,
// pointing straight out of the wall. Drop into a floor hole from high up and
// you get flung. Goal: hold the orb. At 25 s the floor turns to lava, so the
// only safe way around is through the holes.
import { clamp, rand, overlap } from '../engine/util.js';
import { drawPlayer, drawTag, drawGun, SEAT_COLORS } from '../engine/sprites.js';
import { Drift, P } from '../engine/style.js';
import { makeBody, platformControl, stepBody } from './platformer.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';

export const meta = {
  id: 'wormhole', name: 'WORMHOLE', color: '#ffb03a', music: 'rumble', tier: 3,
  tagline: 'Shoot holes in space. Keep your speed.',
  broken: 'SPACE', // the rule the Cabinet breaks in this event
  objective: 'Hold the orb the longest. Shots punch holes: go in one of yours, come out the other.',
  card: { rule: 'HOLD THE ORB THE LONGEST', rule2: 'YOUR SHOTS MAKE 2 HOLES: IN ONE, OUT THE OTHER', keys: [['A', 'JUMP'], ['X', 'SHOOT A HOLE'], ['RB', 'BLOCK']], danger: 'SHOTS DROP THE ORB. LAVA FLOOR AT 25 S' },
  controls: [['STICK', 'Move and aim'], ['A', 'Jump (double jump)'], ['X / RT', 'Shoot a hole into a wall'], ['RB', 'Block']],
  hazards: 'Lava pit / at 25 s the floor turns to lava / getting shot drops the orb / anyone can use your holes',
  ghost: 'Out of sudden death: drift as a ghost; you cannot hold the orb',
  tiebreak: 'Held the orb longer > landed more hits > took fewer hits',
  gunUse: 'Your gun (bullets punch holes and fly through them)', blockUse: 'Your block (RB)', bodyUse: 'Your body and jumps',
  twists: ['moon', 'heavy', 'wind', 'bullettime', 'giant', 'hyper', 'ice'],
};

const TOP = 16, BOT = 180;
const TIME = 50;
const LAVA_AT = 25;
const MOUTH = 8;   // half-length of a hole along its wall
const LAYOUTS = [
  { name: 'TEST CHAMBER', pit: [130, 190],
    solids: [{ x: 0, y: 16, w: 8, h: 164 }, { x: 312, y: 16, w: 8, h: 164 }, { x: 0, y: 16, w: 320, h: 6 },
      { x: 0, y: 164, w: 130, h: 16, floor: 1 }, { x: 190, y: 164, w: 130, h: 16, floor: 1 },
      { x: 30, y: 118, w: 50, h: 6 }, { x: 240, y: 118, w: 50, h: 6 }, { x: 120, y: 78, w: 80, h: 6 },
      { x: 56, y: 52, w: 26, h: 6 }, { x: 238, y: 52, w: 26, h: 6 }] },
  { name: 'THE WELL', pit: [100, 220],
    solids: [{ x: 0, y: 16, w: 8, h: 164 }, { x: 312, y: 16, w: 8, h: 164 }, { x: 0, y: 16, w: 320, h: 6 },
      { x: 0, y: 164, w: 100, h: 16, floor: 1 }, { x: 220, y: 164, w: 100, h: 16, floor: 1 },
      { x: 150, y: 96, w: 20, h: 50 }, { x: 40, y: 104, w: 34, h: 6 }, { x: 246, y: 104, w: 34, h: 6 },
      { x: 100, y: 56, w: 30, h: 6 }, { x: 190, y: 56, w: 30, h: 6 }] },
  { name: 'STAIRWELL', pit: [140, 180],
    solids: [{ x: 0, y: 16, w: 8, h: 164 }, { x: 312, y: 16, w: 8, h: 164 }, { x: 0, y: 16, w: 320, h: 6 },
      { x: 0, y: 164, w: 140, h: 16, floor: 1 }, { x: 180, y: 164, w: 140, h: 16, floor: 1 },
      { x: 60, y: 140, w: 40, h: 24 }, { x: 220, y: 140, w: 40, h: 24 }, { x: 100, y: 110, w: 30, h: 6 }, { x: 190, y: 110, w: 30, h: 6 },
      { x: 140, y: 70, w: 40, h: 6 }] },
];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  const L = LAYOUTS[ctx.variant % LAYOUTS.length];
  const solids = L.solids.map((s) => ({ ...s }));
  let env = twistEnv(tw, 0);
  let t = 0, endT = null, lava = false, lavaSaid = false;
  const starts = [[40, 150], [280, 150], [160, 70]];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const w = 8 * st.size, h = 11 * st.size;
    const p = {
      seat: pl.seat, idx: pl.idx, b: makeBody(starts[i][0] - w / 2, starts[i][1] - h, w, h), face: i === 1 ? -1 : 1, aim: 0,
      ghost: !!pl.ghost, held: 0, taken: 0, gs: newGunState(st.gun), blockT: 0, blockCd: 0, invT: 0, flashT: 0, slowT: 0,
      mult: pl.pickupMult ?? 1, shields: st.shields, holes: [], nextHole: 0, tpCd: 0, flingT: 0, landed: 0, recoil: 0,
    };
    p.pos = () => [p.b.x + p.b.w / 2, p.b.y + p.b.h / 2];
    return makeBuffable(p, st);
  });
  const drift = ctx.drift || new Drift();
  const orb = { x: 160, y: 40, vx: 0, vy: 0, r: 4, holder: null, dropCd: 0, last: null, tpCd: 0 };
  const game = { meta, finished: false, ranking: [], players, layoutName: L.name };
  const live = () => players.filter((p) => !p.ghost);
  const allHoles = () => players.flatMap((p) => p.holes);

  function solidAt(x, y) { for (const s of solids) if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return { rect: s }; return null; }

  // ---- holes ----
  function placeHole(owner, x, y, vx, vy) {
    const sp = Math.hypot(vx, vy) || 1;
    const ax = x + (vx / sp) * 3, ay = y + (vy / sp) * 3;
    const hit = solidAt(ax, ay);
    if (!hit) return;
    const r = hit.rect;
    // which face did we hit? the nearest face that faces the bullet
    const faces = [
      { d: ax - r.x, nx: -1, ny: 0, ok: vx > 0 }, { d: r.x + r.w - ax, nx: 1, ny: 0, ok: vx < 0 },
      { d: ay - r.y, nx: 0, ny: -1, ok: vy > 0 }, { d: r.y + r.h - ay, nx: 0, ny: 1, ok: vy < 0 },
    ].filter((f) => f.ok).sort((a, b) => a.d - b.d);
    const f = faces[0];
    if (!f) return;
    const along = f.nx === 0;
    const len = along ? r.w : r.h;
    if (len < MOUTH * 2) return;
    let hx, hy;
    if (along) { hx = clamp(ax, r.x + MOUTH, r.x + r.w - MOUTH); hy = f.ny < 0 ? r.y : r.y + r.h; }
    else { hy = clamp(ay, r.y + MOUTH, r.y + r.h - MOUTH); hx = f.nx < 0 ? r.x : r.x + r.w; }
    // don't overlap another hole on the same face
    for (const o of players) o.holes = o.holes.filter((q) => !(q.nx === f.nx && q.ny === f.ny && Math.hypot(q.x - hx, q.y - hy) < MOUTH * 2 && q.owner !== owner));
    const slot = owner.nextHole; owner.nextHole = 1 - slot;
    owner.holes = owner.holes.filter((q) => q.slot !== slot);
    owner.holes.push({ x: hx, y: hy, nx: f.nx, ny: f.ny, owner, slot, born: t });
    fx.burst(hx, hy, 10, SEAT_COLORS[owner.idx], { speed: 60, life: 0.35 }); sound.sfx('boing');
  }
  const partner = (h) => h.owner.holes.find((q) => q.slot !== h.slot);
  /** Is a thing at (cx,cy) with velocity (vx,vy) and reach `ext` entering hole h? */
  function entering(h, cx, cy, vx, vy, ext) {
    const tx = -h.ny, ty = h.nx;
    const along = (cx - h.x) * tx + (cy - h.y) * ty;
    const depth = (cx - h.x) * h.nx + (cy - h.y) * h.ny;
    return Math.abs(along) < MOUTH - 1 && depth < ext + 2 && depth > -4 && vx * h.nx + vy * h.ny <= 1;
  }
  function exitVel(q, vx, vy, min = 120) {
    const sp = Math.max(min, Math.hypot(vx, vy));
    return [q.nx * sp, q.ny * sp];
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: BOT, open: { bottom: true }, noWrap: true },
    accel: () => [env.wind, 140 * env.bulletGrav],
    solidAt,
    targets: () => [
      ...(orb.holder ? [] : [{ ref: orb, owner: null, x: orb.x, y: orb.y, r: orb.r }]),
      ...live().map((p) => ({ ref: p, owner: p, rect: p.b, r: p.b.w / 2 })),
    ],
    onHit: (ref, info) => {
      const k = 150 * (info.g.knock || 1);
      if (ref === orb) { orb.vx += info.dx * k; orb.vy += info.dy * k - 40; return 'hit'; }
      const p = ref;
      if (p.invT > 0) return 'none';
      if (p.blockT > 0) { if (p.st.reflect && info.kind === 'bullet') return 'reflect'; sound.sfx('block'); return 'blocked'; }
      if (p.shields > 0) { p.shields -= 1; p.invT = 0.5; const [cx, cy] = p.pos(); fx.popup('AIRBAG!', cx, cy - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
      p.b.vx += info.dx * k * p.st.knockTaken; p.b.vy += info.dy * k * 0.7 * p.st.knockTaken - 90; p.b.stun = 0.25; p.flashT = 0.12; p.taken += 1;
      if (info.owner && info.owner !== p && info.owner.landed !== undefined) info.owner.landed += 1;
      const big = orb.holder === p;
      if (big) dropOrb(p, info.dx * 120, -160);
      const [hx, hy] = p.pos();
      fx.impact(hx, hy, { dmg: big ? 40 : 15, col: SEAT_COLORS[p.idx], dx: info.dx, dy: info.dy }); sound.sfx(big ? 'hitBig' : 'hit');
      return 'hit';
    },
    onPaint: (b, x, y, end) => { if (end && b.owner && b.owner.holes) placeHole(b.owner, x, y, b.vx, b.vy); },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega'], spot: () => { const s = solids.filter((q) => q.w > 20 && q.y > 30)[Math.floor(rand(0, 6))] || solids[3]; return [clamp(s.x + rand(6, s.w - 6), 14, 306), s.y - 8]; } });

  function dropOrb(p, vx, vy) {
    if (orb.holder !== p) return;
    const [cx, cy] = p.pos();
    orb.holder = null; orb.x = cx; orb.y = cy - 8; orb.vx = vx; orb.vy = vy; orb.dropCd = 0.7; orb.last = p;
    fx.popup('DROPPED!', cx, cy - 16, '#ffb03a', 1);
  }
  function burn(p) {
    if (p.invT > 0) return;
    p.invT = 1; p.b.vy = -390; p.b.vx *= 0.3; p.b.stun = 0.2; p.taken += 1;
    const [cx, cy] = p.pos();
    fx.burst(cx, cy + 6, 16, '#ff5a1a', { speed: 100, life: 0.5, angle: -Math.PI / 2, spread: 1.4 }); sound.sfx('zap'); fx.shake(0.2);
    if (orb.holder === p) dropOrb(p, rand(-60, 60), -200);
  }

  function teleportBody(p) {
    if (p.tpCd > 0) return;
    const b = p.b, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (const h of allHoles()) {
      const q = partner(h);
      if (!q) continue;
      const ext = h.nx ? b.w / 2 : b.h / 2;
      if (!entering(h, cx, cy, b.vx, b.vy, ext)) continue;
      const [vx, vy] = exitVel(q, b.vx, b.vy, 150);
      const out = (q.nx ? b.w / 2 : b.h / 2) + 2;
      b.x = q.x + q.nx * out - b.w / 2; b.y = q.y + q.ny * out - b.h / 2;
      b.vx = vx; b.vy = vy; b.onGround = false; p.tpCd = 0.18; p.flingT = 0.45;
      fx.ring(h.x, h.y, 10, SEAT_COLORS[h.owner.idx], 0.25); fx.ring(q.x, q.y, 10, SEAT_COLORS[h.owner.idx], 0.25); sound.sfx('dash');
      if (Math.hypot(vx, vy) > 300) fx.popup('FLING!', q.x, q.y - 10, '#ffb03a', 1);
      return;
    }
  }
  function teleportBullets() {
    for (const bl of guns.bullets) {
      if (bl.tpCd > 0) { bl.tpCd -= 1; continue; }
      for (const h of allHoles()) {
        const q = partner(h);
        if (!q || !entering(h, bl.x, bl.y, bl.vx, bl.vy, 5)) continue;
        const [vx, vy] = exitVel(q, bl.vx, bl.vy, 60);
        bl.x = q.x + q.nx * 4; bl.y = q.y + q.ny * 4; bl.vx = vx; bl.vy = vy; bl.tpCd = 6;
        if (bl.trail) bl.trail.length = 0;
        break;
      }
    }
  }

  function stepOrb(dt) {
    orb.dropCd -= dt; orb.tpCd -= dt;
    if (orb.holder) { const [cx, cy] = orb.holder.pos(); orb.x = cx; orb.y = cy - orb.holder.b.h / 2 - 6; return; }
    orb.vy += 420 * env.grav * dt; orb.vx += env.wind * 0.5 * dt;
    orb.vx *= Math.pow(0.7, dt);
    orb.x += orb.vx * dt;
    if (solidAt(orb.x, orb.y)) { orb.x -= orb.vx * dt; orb.vx *= -0.6; }
    orb.y += orb.vy * dt;
    if (solidAt(orb.x, orb.y + orb.r * Math.sign(orb.vy || 1))) { orb.y -= orb.vy * dt; orb.vy *= -0.45; if (Math.abs(orb.vy) < 30) orb.vy = 0; orb.vx *= 0.8; }
    if (orb.tpCd <= 0) {
      for (const h of allHoles()) {
        const q = partner(h);
        if (!q || !entering(h, orb.x, orb.y, orb.vx, orb.vy, orb.r)) continue;
        [orb.vx, orb.vy] = exitVel(q, orb.vx, orb.vy, 100);
        orb.x = q.x + q.nx * (orb.r + 2); orb.y = q.y + q.ny * (orb.r + 2); orb.tpCd = 0.2;
        break;
      }
    }
    if (orb.y > BOT + 4) { // fell in the pit: it comes back from the top
      orb.x = 160; orb.y = 34; orb.vx = rand(-40, 40); orb.vy = 0; orb.last = null;
      fx.burst(160, 34, 14, '#ffb03a', { speed: 80, life: 0.5 }); sound.sfx('warn');
    }
    orb.x = clamp(orb.x, 12, 308);
    if (orb.dropCd > 0.5 || t < 3) return;
    for (const p of live()) {
      if (p === orb.last && orb.dropCd > 0) continue;
      const [cx, cy] = p.pos();
      if (Math.hypot(cx - orb.x, cy - orb.y) < p.b.w / 2 + orb.r + 2) { orb.holder = p; sound.sfx('coin'); fx.popup('GOT IT!', cx, cy - 16, SEAT_COLORS[p.idx], 1); break; }
    }
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    if (!lava && t >= LAVA_AT) { lava = true; fx.popup('THE FLOOR IS LAVA', 160, 60, P.danger, 2); fx.flash('#ff5a1a', 0.25); sound.sfx('warn'); drift.kick('#ff5a1a', 0.8); }
    if (!lavaSaid && t >= LAVA_AT - 3) { lavaSaid = true; fx.popup('LAVA IN 3', 160, 60, P.warn, 2); sound.sfx('warn'); }
    for (const p of players) p.recoil *= Math.pow(0.0001, dt);
    for (const p of players) {
      const c = controls.get(p.seat);
      tickBuffs(p, dt);
      p.blockT -= dt; p.blockCd -= dt; p.invT -= dt; p.flashT -= dt; p.slowT -= dt; p.tpCd -= dt;
      p.b.slowT = p.slowT;
      const holding = orb.holder === p;
      p.flingT -= dt;
      const keepVx = p.b.vx;
      const ev = platformControl(p.b, c, holding ? { ...p.st, speed: p.st.speed * 0.9 } : p.st, dt, env);
      if (p.flingT > 0 && !p.b.onGround) p.b.vx = keepVx * Math.pow(0.6, dt); // a fling carries: no air steering for a moment
      if (ev) { sound.sfx('jump'); fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#ffcf8a'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      if (c.blockP && p.blockCd <= 0 && !p.ghost) { p.blockT = 0.35; p.blockCd = 2.4 * p.st.blockCd; sound.sfx('block'); }
      const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.4 ? Math.atan2(c.my, c.mx) : (p.face > 0 ? 0 : Math.PI);
      p.aim = a;
      const [cx, cy] = p.pos();
      if (!p.ghost && guns.trigger(p, p.gs, p.st.gun, c.fire && p.b.stun <= 0, a, cx + Math.cos(a) * 9, cy - 1 + Math.sin(a) * 9, dt)) p.recoil = 1;
      stepBody(p.b, dt, solids);
      if (p.b.landed) fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#ffcf8a');
      teleportBody(p);
      if (holding) p.held += dt;
      if (p.b.y > BOT + 2) { p.b.y = BOT - p.b.h - 4; p.invT = 0; burn(p); }
      else if (lava && p.b.onGround && p.b.ground && p.b.ground.floor) burn(p);
    }
    teleportBullets();
    guns.update(dt);
    stepOrb(dt);
    pickups.update(dt, live().map((p) => { const [x, y] = p.pos(); return { p, x, y, r: p.b.w / 2 + 2, mult: p.mult }; }));
    if (endT === null && t >= TIME) endT = 1.2;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    // whole seconds held decide it; ties go to whoever fought for it (an idle player can't win a tie)
    return [...live().sort((x, y) => (Math.floor(y.held) - Math.floor(x.held)) || (y.landed - x.landed) || (x.taken - y.taken)), ...players.filter((p) => p.ghost)].map((p) => p.seat);
  }
  game.hudInfo = (seat) => { const p = players.find((x) => x.seat === seat); return p.ghost ? { text: 'GHOST', pips: 0, pipMax: 0 } : { text: `${Math.floor(p.held)}s` + (orb.holder === p ? ' ORB' : ''), pips: 0, pipMax: 0, warn: false }; };
  game.leader = () => { const r = live().filter((p) => p.held >= 1).sort((x, y) => y.held - x.held); return r.length ? r[0].seat : null; };
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.ghost ? 'GHOST' : `${Math.floor(p.held)}s` + (orb.holder === p ? ' ORB!' : ''); };
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || p.ghost) return null;
    if (orb.holder === p) {
      let best = null, bd = 1e9;
      for (const o of live()) { if (o === p) continue; const [ox, oy] = o.pos(); const d = Math.hypot(ox - p.b.x, oy - p.b.y); if (d < bd) { bd = d; best = [ox, oy]; } }
      return best ? [best[0], best[1], 'away'] : null;
    }
    if (orb.holder) return orb.holder.pos();
    return [orb.x, orb.y];
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  function drawHole(g, h) {
    const col = SEAT_COLORS[h.owner.idx];
    const pulse = 1 + Math.sin(t * 8 + h.slot * 2) * 0.15;
    const linked = !!partner(h);
    const hor = h.nx === 0;
    const w = hor ? MOUTH * 2 : 3, hh = hor ? 3 : MOUTH * 2;
    const x0 = h.x - w / 2 + (hor ? 0 : h.nx * 1.5), y0 = h.y - hh / 2 + (hor ? h.ny * 1.5 : 0);
    g.alpha(linked ? 0.35 : 0.15); g.rect(x0 - (hor ? 2 : 3) * pulse, y0 - (hor ? 3 : 2) * pulse, w + (hor ? 4 : 6) * pulse, hh + (hor ? 6 : 4) * pulse, col); g.alpha(1);
    g.rect(x0, y0, w, hh, h.slot ? '#ffffff' : col);
    g.frame(x0, y0, w, hh, col);
    if (!linked) g.text('?', h.x + h.nx * 6, h.y + h.ny * 6 - 3, { scale: 1, col, align: 'center', ui: false, shadow: null });
  }

  game.draw = (g) => {
    const D = (c, layer = 'bg') => drift.col(c, layer);
    // L0: a test-chamber wall of quiet tiles
    g.rect(0, 0, 320, 180, D('#14110d'), true);
    const ta = D('#1b1712'), tb = D('#1f1a14');
    for (let y = TOP; y < BOT; y += 12) for (let x = 0; x < 320; x += 12) g.rect(x, y, 11, 11, (x + y) % 24 ? ta : tb, true);
    g.text(L.name, 160, 28, { scale: 2, col: D('#3a2c18'), align: 'center', ui: false, shadow: null });
    // lava pit (and lava floors after the turn)
    const [p0, p1] = L.pit;
    for (let x = p0; x < p1; x += 2) g.rect(x, 172 + Math.sin(x * 0.3 + t * 3) * 1.5, 2, 10, (x / 2) % 5 ? P.danger : '#ffb03a');
    for (const s of solids) {
      const hot = lava && s.floor;
      g.rect(s.x, s.y, s.w, s.h, hot ? '#5a1a0a' : D('#d8d4cc', 'geo'));
      g.rect(s.x, s.y, s.w, hot ? 2 : 1, hot ? P.danger : '#ffffff');
      if (!hot && s.h > 6) for (let y = s.y + 6; y < s.y + s.h; y += 8) g.rect(s.x + 1, y, s.w - 2, 1, '#b8b2a8');
    }
    if (!lava && t > LAVA_AT - 3) for (const s of solids) if (s.floor) { g.alpha(0.4 + 0.4 * ((t - LAVA_AT + 3) / 3)); g.rect(s.x, s.y, s.w, 2, P.danger); g.alpha(1); } // steady warning that fills in, no strobe
    for (const h of allHoles()) drawHole(g, h);
    pickups.draw(g);
    guns.draw(g);
    for (const p of players) {
      const b = p.b, cx = b.x + b.w / 2;
      const blink = p.invT > 0 && Math.floor(t * 8) % 2;
      drawPlayer(g, p.idx, cx, b.y + b.h, { flip: p.face < 0, size: p.st.size, squash: b.squash, flash: p.flashT > 0, alpha: p.ghost ? 0.3 : blink ? 0.6 : 1, look: p.aim });
      if (!p.ghost) drawGun(g, p.idx, cx, b.y + b.h / 2, p.aim, { size: p.st.size, recoil: p.recoil });
      if (orb.holder === p) { g.alpha(0.6); g.ring(cx, b.y + b.h / 2, 11 * p.st.size, '#ffb03a'); g.alpha(1); }
      if (p.blockT > 0) g.ring(cx, b.y + b.h / 2, 10 * p.st.size, '#5affd9');
      drawBuffs(g, p, cx, b.y - 6);
      if (!p.ghost) drawTag(g, p.idx, cx, b.y - 5 - (orb.holder === p ? 10 : 0));
    }
    // the orb
    const glow = 1 + Math.sin(t * 6) * 0.2;
    g.alpha(0.3); g.circle(orb.x, orb.y, orb.r * 2 * glow, '#ffb03a'); g.alpha(1);
    g.circle(orb.x, orb.y, orb.r, '#ffe7b0'); g.ring(orb.x, orb.y, orb.r, '#ffb03a');
    if (!orb.holder && t < 3) g.text(String(Math.ceil(3 - t)), orb.x, orb.y - 14, { scale: 1, col: '#ffb03a', align: 'center', ui: false });
  };
  return game;
}
