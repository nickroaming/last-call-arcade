// BODY SNATCH: the Cabinet breaks WHO YOU ARE. Every 8 s every controller
// jumps to the next body. Gems belong to the PLAYER, not the body: whatever
// body you drive, what it picks up is yours, and when it's shot, YOU drop gems.
// Your ring, tag and arrow always mark the body you drive. At 25 s the swaps
// come every 5 s and in a shuffled order.
import { TAU, clamp, rand, approach } from '../engine/util.js';
import { drawPlayer, drawArm, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { Drift, P } from '../engine/style.js';
import { SEAT_NAMES } from '../engine/sprites.js';
import { switcheroo } from '../game/switcheroo.js';

export const meta = {
  id: 'swap', name: 'BODY SNATCH', color: '#c8ff6a', music: 'rumble', tier: 3,
  tagline: 'You are not who you were',
  card: { rule: 'EVERY 8 S YOU JUMP TO THE NEXT BODY', rule2: 'GEMS ARE YOURS, WHATEVER BODY YOU DRIVE', keys: [['X', 'SHOOT'], ['A', 'DASH'], ['RB', 'BLOCK']], danger: 'SWAPS SPEED UP AT 25 S' },
  broken: 'WHO YOU ARE', // the rule the Cabinet breaks in this event
  objective: 'Most gems wins. Every 8 s every controller jumps to the next body. Follow YOUR ring.',
  controls: [['STICK', 'Move whatever body you are in'], ['X / RT', 'Shoot (hits make the driver drop gems)'], ['A', 'Dash'], ['RB', 'Block']],
  hazards: 'The swap (warned 2 s before) / static orbs from 12 s / at 25 s swaps every 5 s, shuffled',
  ghost: 'Out of sudden death: you drift; you never get a body',
  tiebreak: 'More gems > more hits landed > fewer hits taken',
  gunUse: 'Your gun, in whatever body you hold', blockUse: 'Your block and dash', bodyUse: 'Somebody else\'s body',
  twists: ['wind', 'rubber', 'giant', 'hyper', 'bullettime'],
};

const TOP = 28, BOT = 180;   // the strip under the HUD (16-27) belongs to the swap clock, so it is never covered
const TIME = 50, TURN = 25, EVERY = 8, EVERY_TURN = 5, WARN = 2;
export const LAYOUTS = [
  { name: 'THE LOUNGE', pillars: [[90, 70, 10], [230, 70, 10], [160, 130, 12]] },
  { name: 'HALL OF MIRRORS', pillars: [[60, 98, 9], [260, 98, 9], [160, 60, 9], [160, 140, 9]] },
  { name: 'OPEN FLOOR', pillars: [[160, 98, 16]] },
];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  const L = LAYOUTS[ctx.variant % LAYOUTS.length];
  const drift = ctx.drift || new Drift();
  let env = twistEnv(tw, 0);
  let t = 0, endT = null, turned = false, swapT = 0, swapN = 0;
  const starts = [[90, 124], [230, 124], [160, 56]];
  // bodies: physical things with a shape (BRICK, BLOOP, SPIKE) that never change
  const bodies = ctx.players.filter((pl) => !pl.ghost).map((pl, i) => ({
    idx: pl.idx, x: starts[i % 3][0], y: starts[i % 3][1], vx: 0, vy: 0, r: 5, face: 1, aim: 0,
    dashT: 0, dashCd: 0, blockT: 0, blockCd: 0, stun: 0, invT: 1, flashT: 0, slowT: 0, driver: null, gs: null,
  }));
  // players: who you are. Score, gun state and cards travel with you.
  const players = ctx.players.map((pl) => {
    const st = pl.stats;
    const p = { seat: pl.seat, idx: pl.idx, ghost: !!pl.ghost, gems: 0, landed: 0, taken: 0, body: null, gs: newGunState(st.gun), shields: st.shields, mult: pl.pickupMult ?? 1, gx: 160, gy: 98 };
    p.pos = () => (p.body ? [p.body.x, p.body.y] : [p.gx, p.gy]);
    return makeBuffable(p, st);
  });
  const live = () => players.filter((p) => !p.ghost);
  live().forEach((p, i) => { p.body = bodies[i]; bodies[i].driver = p; });
  const gems = [];
  const orbs = [];
  const arrows = []; // the planned swap, shown during the warning: [{from: body, to: body, col}]
  let plan = null;
  const game = { meta, finished: false, ranking: [], players, layoutName: L.name };

  const addGem = (x, y, big = false, vx = 0, vy = 0) => gems.push({ x, y, vx, vy, big, t: 0 });
  const blocked = (x, y, r = 0) => L.pillars.some(([px, py, pr]) => Math.hypot(x - px, y - py) < pr + r);
  const freeSpot = () => { for (let k = 0; k < 30; k++) { const x = rand(20, 300), y = rand(TOP + 14, BOT - 12); if (!blocked(x, y, 8)) return [x, y]; } return [40, 100]; };
  for (let k = 0; k < 8; k++) addGem(...freeSpot());

  function hurt(b, dx, dy, src = null) {
    const p = b.driver;
    if (!p || b.invT > 0) return 'none';
    if (b.blockT > 0) { sound.sfx('block'); fx.ring(b.x, b.y, b.r + 5, P.safe); return 'blocked'; }
    if (p.shields > 0) { p.shields -= 1; b.invT = 0.5; fx.popup('AIRBAG!', b.x, b.y - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
    b.invT = 0.9; b.stun = 0.25; b.flashT = 0.15; p.taken += 1;
    b.vx += dx * 170 * p.st.knockTaken; b.vy += dy * 170 * p.st.knockTaken;
    if (src && src !== p && src.landed !== undefined) src.landed += 1;
    const lose = Math.min(p.gems, 2); p.gems -= lose;
    for (let k = 0; k < lose; k++) { const a = rand(0, TAU); addGem(b.x, b.y, false, Math.cos(a) * 90, Math.sin(a) * 90); }
    if (lose) fx.popup(`P${p.idx + 1} -${lose}`, b.x, b.y - 14, SEAT_COLORS[p.idx], 1);
    fx.impact(b.x, b.y, { dmg: 22, col: SEAT_COLORS[p.idx], dx, dy }); sound.sfx('hit');
    return 'hit';
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: BOT, open: {} },
    accel: () => [env.wind, 0],
    solidAt: (x, y) => { for (const [px, py, pr] of L.pillars) if (Math.hypot(x - px, y - py) < pr) return { circle: { x: px, y: py, r: pr } }; return null; },
    targets: () => bodies.filter((b) => b.driver).map((b) => ({ ref: b, owner: b.driver, x: b.x, y: b.y, r: b.r })),
    onHit: (b, info) => {
      if (b.blockT > 0 && b.driver && b.driver.st.reflect && info.kind === 'bullet') return 'reflect';
      return hurt(b, info.dx, info.dy, info.owner) === 'none' ? 'none' : 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega'], spot: freeSpot });

  /** Who goes where next: a rotation, or after the turn, a shuffle where nobody keeps their body. */
  function makePlan() {
    const ps = live(); const n = ps.length;
    if (n < 2) return null;
    let order = ps.map((_, i) => (i + 1) % n);
    if (turned && n > 2 && Math.random() < 0.5) order = ps.map((_, i) => (i + n - 1) % n);
    const cur = ps.map((p) => p.body);
    return ps.map((p, i) => ({ p, from: cur[i], to: cur[order[i]] }));
  }
  function doSwap() {
    if (!plan) return;
    for (const m of plan) m.p.body = m.to;
    for (const b of bodies) b.driver = null;
    for (const m of plan) { m.to.driver = m.p; m.to.invT = 0.6; m.to.stun = 0.15; fx.ring(m.to.x, m.to.y, 16, SEAT_COLORS[m.p.idx], 0.4); }
    plan.forEach((m) => fx.popup(`P${m.p.idx + 1}: ${SEAT_NAMES[m.to.idx]}`, m.to.x, m.to.y - 22, SEAT_COLORS[m.p.idx], 2));
    sound.sfx('dash'); sound.sfx('boing'); drift.kick(meta.color, 0.5);
    swapN += 1; plan = null; arrows.length = 0;
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    if (!turned && t >= TURN) { turned = true; fx.popup('THE CABINET SHUFFLES YOU', 160, 40, P.warn, 2); sound.sfx('warn'); }
    // the swap: plan and warn, then jump
    swapT += dt;
    const every = turned ? EVERY_TURN : EVERY;
    if (!plan && swapT >= every - WARN) { plan = makePlan(); if (plan) sound.sfx('warn'); }
    if (swapT >= every) { swapT = 0; doSwap(); }
    // drivers steer whatever body they hold
    for (const p of players) {
      const c = controls.get(p.seat);
      tickBuffs(p, dt);
      if (!p.body) { p.gx = clamp(p.gx + c.mx * 120 * dt, 6, 314); p.gy = clamp(p.gy + c.my * 120 * dt, TOP + 6, BOT - 6); continue; }
      const b = p.body;
      const max = 86 * p.st.speed * (b.slowT > 0 ? 0.55 : 1);
      if (b.dashT > 0) b.dashT -= dt;
      else if (b.stun > 0) { b.stun -= dt; b.vx *= Math.pow(0.1, dt); b.vy *= Math.pow(0.1, dt); }
      else {
        const acc = env.ice ? 170 : 900;
        b.vx = approach(b.vx, c.mx * max, acc * dt); b.vy = approach(b.vy, c.my * max, acc * dt);
        if (c.jumpP && b.dashCd <= 0) {
          const m = Math.hypot(c.mx, c.my); const dx = m > 0.2 ? c.mx / m : b.face, dy = m > 0.2 ? c.my / m : 0;
          b.vx = dx * 250; b.vy = dy * 250; b.dashT = 0.14; b.dashCd = 1.2 * p.st.blockCd; sound.sfx('dash');
        }
      }
      if (c.blockP && b.blockCd <= 0) { b.blockT = 0.45; b.blockCd = 2.6 * p.st.blockCd; sound.sfx('block'); switcheroo(p, players, { fx, sound, obj: (q) => q.body, alive: (q) => !!q.body }); }
      if (Math.abs(c.mx) > 0.2) b.face = Math.sign(c.mx);
      b.aim = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.3 ? Math.atan2(c.my, c.mx) : (b.face > 0 ? 0 : Math.PI);
      if (guns.trigger(p, p.gs, p.st.gun, c.fire && b.stun <= 0, b.aim, b.x + Math.cos(b.aim) * 8, b.y + Math.sin(b.aim) * 8, dt)) b.recoilAt = p.recoilAt;
    }
    for (const b of bodies) {
      b.dashCd -= dt; b.blockT -= dt; b.blockCd -= dt; b.invT -= dt; b.flashT -= dt; b.slowT -= dt;
      if (!b.driver) { b.vx *= Math.pow(0.05, dt); b.vy *= Math.pow(0.05, dt); }
      b.x = clamp(b.x + b.vx * dt, b.r, 320 - b.r); b.y = clamp(b.y + b.vy * dt, TOP + b.r, BOT - b.r);
      for (const [px, py, pr] of L.pillars) { const d = Math.hypot(b.x - px, b.y - py), m = pr + b.r; if (d < m && d > 0) { b.x = px + (b.x - px) / d * m; b.y = py + (b.y - py) / d * m; } }
      b.aim = b.driver ? b.aim : b.aim;
    }
    // static orbs from 12 s: bounce around, make whoever they touch drop gems
    if (t > 12 && orbs.length < 2 && Math.random() < dt * 0.6) { const [x, y] = freeSpot(); const a = rand(0, TAU); orbs.push({ x, y, vx: Math.cos(a) * 55, vy: Math.sin(a) * 55, r: 5, warn: 1 }); sound.sfx('warn'); }
    for (const o of orbs) {
      if (o.warn > 0) { o.warn -= dt; continue; }
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < o.r || o.x > 320 - o.r) o.vx = -o.vx;
      if (o.y < TOP + o.r || o.y > BOT - o.r) o.vy = -o.vy;
      for (const b of bodies) if (b.driver && Math.hypot(b.x - o.x, b.y - o.y) < b.r + o.r) hurt(b, (b.x - o.x) / (b.r + o.r), (b.y - o.y) / (b.r + o.r));
    }
    guns.update(dt);
    // gems: the body picks it up, the driver keeps it
    for (let i = gems.length - 1; i >= 0; i--) {
      const gm = gems[i];
      gm.t += dt; gm.x += gm.vx * dt; gm.y += gm.vy * dt; gm.vx *= Math.pow(0.05, dt); gm.vy *= Math.pow(0.05, dt);
      gm.x = clamp(gm.x, 6, 314); gm.y = clamp(gm.y, TOP + 6, BOT - 6);
      if (gm.t < 0.4) continue;
      const b = bodies.find((o) => o.driver && Math.hypot(o.x - gm.x, o.y - gm.y) < o.r + 5);
      if (!b) continue;
      const v = gm.big ? 3 : 1; b.driver.gems += v; gems.splice(i, 1); sound.sfx('coin');
      if (gm.big) fx.popup(`P${b.driver.idx + 1} +${v}`, gm.x, gm.y - 8, SEAT_COLORS[b.driver.idx], 2); else fx.burst(gm.x, gm.y, 5, SEAT_COLORS[b.driver.idx], { speed: 50, life: 0.3 }); // small gems flash the DRIVER's colour
    }
    if (gems.filter((g) => g.t > 0.4).length < 7 && Math.random() < dt * 2) addGem(...freeSpot());
    if (Math.floor((t - dt) / 10) !== Math.floor(t / 10)) { const [x, y] = freeSpot(); addGem(x, y, true); fx.popup('BIG GEM!', x, y - 10, P.warn, 1); }
    pickups.update(dt, players.filter((p) => p.body).map((p) => ({ p, x: p.body.x, y: p.body.y, r: p.body.r + 2, mult: p.mult })));
    if (endT === null && t >= TIME) endT = 1.2;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    const cmp = (a, b) => (b.gems - a.gems) || (b.landed - a.landed) || (a.taken - b.taken) || ((b.recoilAt ? 1 : 0) - (a.recoilAt ? 1 : 0));
    return [...live().sort(cmp), ...players.filter((p) => p.ghost)].map((p) => p.seat);
  }
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.ghost ? 'DRIFTER' : `${p.gems} GEMS`; };
  game.hudInfo = (seat) => { const p = players.find((x) => x.seat === seat); return p.ghost ? { text: 'GHOST', pips: 0, pipMax: 0 } : { text: `${p.gems}`, pips: 0, pipMax: 0 }; };
  game.leader = () => { const r = live().filter((p) => p.gems > 0).sort((a, b) => b.gems - a.gems); return r.length ? r[0].seat : null; };
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || !p.body) return null;
    let best = null, bd = 1e9;
    for (const gm of gems) { const d = Math.hypot(gm.x - p.body.x, gm.y - p.body.y) - (gm.big ? 40 : 0); if (d < bd) { bd = d; best = gm; } }
    return best ? [best.x, best.y] : null;
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    const D = (c, layer = 'bg') => drift.col(c, layer);
    // L0: a dim lounge floor
    g.rect(0, 0, 320, 180, D('#101a0c'), true);
    const ta = D('#142010');
    for (let y = TOP; y < BOT; y += 14) for (let x = (y / 14) % 2 ? 7 : 0; x < 320; x += 14) g.rect(x, y, 7, 7, ta, true);
    if (t < 2.5) { g.alpha(Math.min(1, (2.5 - t) * 2)); g.text(L.name, 160, 34, { scale: 2, col: '#7a9a5a', align: 'center', shadow: null }); g.alpha(1); }
    // the swap clock: a bar that fills toward the next jump
    const every = turned ? EVERY_TURN : EVERY, k = swapT / every;
    g.rect(0, 15, 320, 13, P.ink, true);
    g.rect(8, 25, 304, 2, '#1e2a18', true); g.rect(8, 25, 304 * k, 2, plan ? P.warn : meta.color, true);
    g.text(plan ? `SWAP IN ${Math.ceil(every - swapT)}` : `NEXT SWAP ${Math.ceil(every - swapT)}`, 160, 16.5, { scale: 2, col: plan ? P.warn : '#7a9a5a', align: 'center', shadow: null });
    // L1: pillars, fixed bright rims
    for (const [px, py, pr] of L.pillars) { g.circle(px, py, pr, D('#2a3a20', 'geo')); g.ring(px, py, pr, '#d8f0b0'); }
    for (const gm of gems) {
      const s = gm.big ? 4 : 2.5, bob = Math.sin(t * 5 + gm.x) * 1, col = gm.big ? P.warn : '#c8ff6a';
      g.rect(gm.x - s / 2, gm.y - s + bob, s, s * 2, col); g.rect(gm.x - s, gm.y - s / 2 + bob, s * 2, s, col);
    }
    for (const o of orbs) { if (o.warn > 0) { g.ring(o.x, o.y, 8, P.danger); continue; } g.circle(o.x, o.y, o.r, '#3a1020'); g.ring(o.x, o.y, o.r, P.danger); g.ring(o.x, o.y, o.r + 2, '#ff9a9a'); }
    pickups.draw(g);
    guns.draw(g);
    // the planned jump: an arrow from each driver's ring to their next body, in their colour
    if (plan) for (const m of plan) {
      const col = SEAT_COLORS[m.p.idx];
      g.dotted(m.from.x, m.from.y, m.to.x, m.to.y, col, 4);
      const a = Math.atan2(m.to.y - m.from.y, m.to.x - m.from.x), ex = m.to.x - Math.cos(a) * 11, ey = m.to.y - Math.sin(a) * 11;
      g.beam(ex, ey, ex - Math.cos(a - 0.5) * 6, ey - Math.sin(a - 0.5) * 6, 2, col); g.beam(ex, ey, ex - Math.cos(a + 0.5) * 6, ey - Math.sin(a + 0.5) * 6, 2, col);
    }
    // L2: bodies keep their shape; the DRIVER's colour rides on top as a ring and a tag
    for (const b of bodies) {
      const p = b.driver;
      const blink = b.invT > 0.3 && Math.floor(t * 5) % 2;
      g.alpha(0.3); g.rect(b.x - 4, b.y + b.r - 1, 8, 2, '#000'); g.alpha(1);
      drawPlayer(g, b.idx, b.x, b.y + b.r, { flip: b.face < 0, size: 0.9, flash: b.flashT > 0, alpha: !p ? 0.35 : blink ? 0.55 : 1, look: b.aim });
      if (!p) continue;
      drawArm(g, { idx: b.idx, aim: b.aim, recoilAt: b.recoilAt }, b.x, b.y, 0.9);
      const col = SEAT_COLORS[p.idx];
      g.ring(b.x, b.y, b.r + 5, col); g.ring(b.x, b.y, b.r + 6, col);
      if (b.blockT > 0) g.ring(b.x, b.y, b.r + 8, P.safe);
      const label = `P${p.idx + 1}`, lw = g.textW(label, 2) + 6;
      g.rect(b.x - lw / 2, b.y - 22, lw, 10, P.ink); g.frame(b.x - lw / 2, b.y - 22, lw, 10, col);
      g.text(label, b.x, b.y - 20.5, { scale: 2, col, align: 'center', ui: false, shadow: null });
      drawBuffs(g, p, b.x, b.y + b.r + 3);
    }
    for (const p of players) if (!p.body) drawPlayer(g, p.idx, p.gx, p.gy + Math.sin(t * 4 + p.idx) * 2, { alpha: 0.3, size: 0.8 });
  };
  return game;
}
