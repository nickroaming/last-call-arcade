// MIRROR TWINS: you are two people. One stick moves you on the left side and
// your twin on the right side of a mirror, and the mirror's rule keeps
// changing: left-right reversed, upside down, both, or a straight copy.
// Pillars differ on each side, so walls knock the twins out of sync. Collect
// gems with either body; both bodies can be shot.
import { TAU, clamp, rand, approach } from '../engine/util.js';
import { drawPlayer, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';

export const meta = {
  id: 'mirror', name: 'MIRROR TWINS', color: '#9fd3ff', music: 'coins', tier: 2,
  tagline: 'One stick, two bodies, one lying mirror',
  objective: 'Most gems wins. One stick moves you AND your twin on the other side of the mirror.',
  controls: [['STICK', 'Move both (mirror rule)'], ['X / RT', 'Both shoot'], ['A', 'Both dash'], ['RB', 'Both block']],
  hazards: 'Mirror rule changes every 11 s / a laser sweeps each side / spike balls / hits drop gems',
  ghost: 'Out: your twins drift and cannot collect',
  tiebreak: 'More gems > fewer hits taken > more hits landed',
  gunUse: 'Your gun, fired from both bodies at once', blockUse: 'Your block and dash, for both bodies', bodyUse: 'Both your bodies',
  twists: ['wind', 'rubber', 'bullettime', 'giant', 'hyper', 'ice'],
};

const TOP = 16, BOT = 180, MX = 160, HALF = 3;
const TIME = 45;
const MODE_T = 11;
const MODES = [
  { name: 'MIRROR', sx: -1, sy: 1, hint: 'LEFT AND RIGHT SWAP' },
  { name: 'UPSIDE DOWN', sx: 1, sy: -1, hint: 'UP AND DOWN SWAP' },
  { name: 'SPIN', sx: -1, sy: -1, hint: 'EVERYTHING SWAPS' },
  { name: 'CLONE', sx: 1, sy: 1, hint: 'SAME MOVES (FOR NOW)' },
];
const LAYOUTS = [
  { name: 'GLASS HOUSE', left: [{ x: 60, y: 70, r: 10 }, { x: 110, y: 130, r: 12 }], right: [{ x: 200, y: 120, r: 12 }, { x: 270, y: 60, r: 9 }, { x: 250, y: 150, r: 8 }] },
  { name: 'FUN HOUSE', left: [{ x: 80, y: 98, r: 16 }], right: [{ x: 210, y: 60, r: 10 }, { x: 210, y: 136, r: 10 }, { x: 280, y: 98, r: 10 }] },
  { name: 'KALEIDOSCOPE', left: [{ x: 40, y: 50, r: 8 }, { x: 120, y: 60, r: 8 }, { x: 80, y: 140, r: 8 }], right: [{ x: 240, y: 98, r: 18 }] },
];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  const L = LAYOUTS[ctx.variant % LAYOUTS.length];
  let env = twistEnv(tw, 0);
  let t = 0, endT = null, modeI = 0, modeT = MODE_T, warned = false;
  let mode = MODES[0];
  const starts = [[40, 40], [40, 98], [40, 156]];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const r = 5 * st.size;
    const mk = (x, y, side) => ({ x, y, vx: 0, vy: 0, side, r });
    const [sx, sy] = starts[i];
    const p = {
      seat: pl.seat, idx: pl.idx, A: mk(sx + (ctx.variant % 2) * 30, sy, 'L'), B: mk(320 - sx - (ctx.variant % 2) * 30, sy, 'R'),
      gems: 0, hits: 0, taken: 0, ghost: !!pl.ghost, face: 1, aim: 0,
      gsA: newGunState(st.gun), gsB: newGunState(st.gun), dashT: 0, dashCd: 0, blockT: 0, blockCd: 0, stun: 0, slowT: 0, invT: 0, flashT: 0,
      mult: pl.pickupMult ?? 1, shields: st.shields,
    };
    p.pos = () => [p.A.x, p.A.y];
    return makeBuffable(p, st);
  });
  const gems = [];
  const balls = [{ x: 80, y: 40, vx: 70, vy: 55, side: 'L' }, { x: 240, y: 150, vx: -60, vy: -65, side: 'R' }];
  const lasers = { L: { on: false, warn: 0, pos: 0, next: 7 }, R: { on: false, warn: 0, pos: 0, next: 10.5 } };
  const game = { meta, finished: false, ranking: [], players };
  const live = () => players.filter((p) => !p.ghost);
  const pillarsOf = (side) => (side === 'L' ? L.left : L.right);

  function addGem(x, y, big = false, vx = 0, vy = 0) {
    gems.push({ x, y, vx, vy, big, t: 0 });
  }
  function freeSpot() {
    for (let k = 0; k < 30; k++) {
      const side = Math.random() < 0.5 ? 'L' : 'R';
      const x = side === 'L' ? rand(12, MX - 12) : rand(MX + 12, 308), y = rand(TOP + 12, BOT - 10);
      if (!pillarsOf(side).some((q) => Math.hypot(x - q.x, y - q.y) < q.r + 8)) return [x, y];
    }
    return [80, 98];
  }
  for (let k = 0; k < 6; k++) addGem(...freeSpot());

  function drop(p, n, body) {
    const lose = Math.min(p.gems, n);
    p.gems -= lose;
    for (let k = 0; k < lose; k++) { const a = rand(0, TAU); addGem(body.x, body.y, false, Math.cos(a) * 90, Math.sin(a) * 90); }
    if (lose) fx.popup(`-${lose}`, body.x, body.y - 14, '#ff5a5a', 1);
  }
  function hurt(p, body, n, from, dx = 0, dy = 0) {
    if (p.ghost || p.invT > 0) return 'none';
    if (p.blockT > 0) { sound.sfx('block'); fx.ring(body.x, body.y, body.r + 5, '#5affd9'); return 'blocked'; }
    if (p.shields > 0) { p.shields -= 1; p.invT = 0.6; fx.popup('AIRBAG!', body.x, body.y - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
    p.invT = 1; p.stun = 0.3; p.flashT = 0.15; p.taken += 1;
    body.vx += dx * 150 * p.st.knockTaken; body.vy += dy * 150 * p.st.knockTaken;
    if (from && from !== p && from.hits !== undefined) from.hits += 1;
    drop(p, n, body);
    fx.shake(0.2); fx.stop(0.03); sound.sfx('hit');
    fx.burst(body.x, body.y, 10, SEAT_COLORS[p.idx], { speed: 90, life: 0.4 });
    return 'hit';
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: BOT, open: {}, noWrap: true },
    accel: () => [env.wind, 0],
    solidAt: (x, y) => {
      if (Math.abs(x - MX) < HALF) return { rect: { x: MX - HALF, y: TOP, w: HALF * 2, h: BOT - TOP } };
      for (const q of pillarsOf(x < MX ? 'L' : 'R')) if (Math.hypot(x - q.x, y - q.y) < q.r) return { circle: q };
      return null;
    },
    targets: () => live().flatMap((p) => [p.A, p.B].map((b) => ({ ref: { p, b }, owner: p, x: b.x, y: b.y, r: b.r }))),
    onHit: (ref, info) => {
      if (ref.p.blockT > 0 && ref.p.st.reflect && info.kind === 'bullet') return 'reflect';
      return hurt(ref.p, ref.b, 1, info.owner, info.dx, info.dy) === 'none' ? 'none' : 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega'], spot: freeSpot });

  function moveBody(b, vx, vy, dt) {
    b.x += (vx + b.vx) * dt; b.y += (vy + b.vy) * dt;
    b.vx *= Math.pow(0.02, dt); b.vy *= Math.pow(0.02, dt);
    const lo = b.side === 'L' ? b.r : MX + HALF + b.r, hi = b.side === 'L' ? MX - HALF - b.r : 320 - b.r;
    b.x = clamp(b.x, lo, hi); b.y = clamp(b.y, TOP + b.r, BOT - b.r);
    for (const q of pillarsOf(b.side)) {
      const d = Math.hypot(b.x - q.x, b.y - q.y);
      if (d < b.r + q.r && d > 0) { b.x = q.x + ((b.x - q.x) / d) * (b.r + q.r); b.y = q.y + ((b.y - q.y) / d) * (b.r + q.r); }
    }
  }

  function hazards(dt) {
    for (const s of balls) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      const lo = s.side === 'L' ? 6 : MX + HALF + 6, hi = s.side === 'L' ? MX - HALF - 6 : 314;
      if (s.x < lo || s.x > hi) { s.vx = -s.vx; s.x = clamp(s.x, lo, hi); }
      if (s.y < TOP + 6 || s.y > BOT - 6) { s.vy = -s.vy; s.y = clamp(s.y, TOP + 6, BOT - 6); }
      for (const q of pillarsOf(s.side)) { const d = Math.hypot(s.x - q.x, s.y - q.y); if (d < q.r + 6 && d > 0) { const nx = (s.x - q.x) / d, ny = (s.y - q.y) / d; const dot = s.vx * nx + s.vy * ny; if (dot < 0) { s.vx -= 2 * dot * nx; s.vy -= 2 * dot * ny; } } }
      for (const p of live()) for (const b of [p.A, p.B]) { const d = Math.hypot(b.x - s.x, b.y - s.y); if (d < b.r + 6) hurt(p, b, 2, null, (b.x - s.x) / (d || 1), (b.y - s.y) / (d || 1)); }
    }
    // left laser sweeps sideways; right laser sweeps up and down
    for (const side of ['L', 'R']) {
      const l = lasers[side];
      if (!l.on && t >= l.next) {
        if (l.warn <= 0) { l.warn = 1; l.pos = 0; sound.sfx('warn'); }
        l.warn -= dt;
        if (l.warn <= 0) { l.on = true; l.pos = 0; sound.sfx('laser'); }
      } else if (l.on) {
        l.pos += dt / 2.4;
        const lx = side === 'L' ? 4 + l.pos * (MX - 8) : null, ly = side === 'R' ? TOP + 4 + l.pos * (BOT - TOP - 8) : null;
        for (const p of live()) {
          const b = side === 'L' ? p.A : p.B;
          if ((lx !== null && Math.abs(b.x - lx) < b.r + 2) || (ly !== null && Math.abs(b.y - ly) < b.r + 2)) hurt(p, b, 2, null, 0, 0);
        }
        if (l.pos >= 1) { l.on = false; l.next = t + 6; }
      }
    }
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    modeT -= dt;
    if (!warned && modeT < 2) { warned = true; sound.sfx('warn'); fx.popup('THE MIRROR IS CHANGING...', 160, 30, '#9fd3ff', 1); }
    if (modeT <= 0) {
      modeT = MODE_T; warned = false; modeI = (modeI + 1) % MODES.length; mode = MODES[modeI];
      fx.flash('#9fd3ff', 0.3); fx.hueKick = (fx.hueKick || 0) + 25; sound.sfx('boing');
      fx.popup(mode.name + '!', 160, 70, '#fff', 3); fx.popup(mode.hint, 160, 96, '#9fd3ff', 1);
    }
    hazards(dt);
    for (const p of players) {
      const c = controls.get(p.seat);
      tickBuffs(p, dt);
      p.dashCd -= dt; p.blockT -= dt; p.blockCd -= dt; p.slowT -= dt; p.flashT -= dt; p.invT -= dt;
      const max = 82 * p.st.speed * (p.slowT > 0 ? 0.55 : 1) * (p.ghost ? 0.7 : 1);
      if (p.dashT > 0) p.dashT -= dt;
      p.mvx = p.mvx || 0; p.mvy = p.mvy || 0;
      if (p.stun > 0) { p.stun -= dt; p.mvx *= Math.pow(0.1, dt); p.mvy *= Math.pow(0.1, dt); }
      else if (p.dashT <= 0) {
        const acc = env.ice ? 170 : 900;
        p.mvx = approach(p.mvx, c.mx * max, acc * dt); p.mvy = approach(p.mvy, c.my * max, acc * dt);
        if (c.jumpP && p.dashCd <= 0 && !p.ghost) {
          const m = Math.hypot(c.mx, c.my); const dx = m > 0.2 ? c.mx / m : p.face, dy = m > 0.2 ? c.my / m : 0;
          p.mvx = dx * 240; p.mvy = dy * 240; p.dashT = 0.14; p.dashCd = 1.2 * p.st.blockCd; sound.sfx('dash');
        }
      }
      if (c.blockP && p.blockCd <= 0 && !p.ghost) { p.blockT = 0.45; p.blockCd = 2.6 * p.st.blockCd; sound.sfx('block'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      const wind = env.wind * 0.5;
      moveBody(p.A, p.mvx + wind, p.mvy, dt);
      moveBody(p.B, p.mvx * mode.sx + wind, p.mvy * mode.sy, dt);
      const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.3 ? Math.atan2(c.my, c.mx) : (p.face > 0 ? 0 : Math.PI);
      p.aim = a;
      const b2 = Math.atan2(Math.sin(a) * mode.sy, Math.cos(a) * mode.sx);
      const fire = c.fire && p.stun <= 0 && !p.ghost;
      guns.trigger(p, p.gsA, p.st.gun, fire, a, p.A.x + Math.cos(a) * 6, p.A.y + Math.sin(a) * 6, dt);
      guns.trigger(p, p.gsB, p.st.gun, fire, b2, p.B.x + Math.cos(b2) * 6, p.B.y + Math.sin(b2) * 6, dt);
    }
    // gems
    for (let i = gems.length - 1; i >= 0; i--) {
      const gm = gems[i];
      gm.t += dt; gm.x += gm.vx * dt; gm.y += gm.vy * dt; gm.vx *= Math.pow(0.05, dt); gm.vy *= Math.pow(0.05, dt);
      const side = gm.x < MX ? 'L' : 'R';
      gm.x = side === 'L' ? clamp(gm.x, 6, MX - HALF - 4) : clamp(gm.x, MX + HALF + 4, 314); gm.y = clamp(gm.y, TOP + 6, BOT - 6);
      if (gm.t < 0.4) continue;
      for (const p of live()) {
        const b = [p.A, p.B].find((q) => Math.hypot(q.x - gm.x, q.y - gm.y) < q.r + 5);
        if (!b) continue;
        const v = gm.big ? 3 : 1;
        p.gems += v; gems.splice(i, 1); sound.sfx('coin');
        fx.popup(`+${v}`, gm.x, gm.y - 8, gm.big ? '#ffd84a' : '#9fd3ff', 1);
        fx.burst(gm.x, gm.y, 6, gm.big ? '#ffd84a' : '#9fd3ff', { speed: 50, life: 0.3 });
        break;
      }
    }
    if (gems.filter((gm) => gm.t > 0.4).length < 5 && Math.random() < dt * 2) addGem(...freeSpot());
    if (Math.floor((t - dt) / 10) !== Math.floor(t / 10)) { const [x, y] = freeSpot(); addGem(x, y, true); fx.popup('BIG GEM!', x, y - 10, '#ffd84a', 1); }
    guns.update(dt);
    pickups.update(dt, live().flatMap((p) => [p.A, p.B].map((b) => ({ p, x: b.x, y: b.y, r: b.r + 2, mult: p.mult }))));
    if (endT === null && t >= TIME) endT = 1.2;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    const order = (x, y) => (y.gems - x.gems) || (x.taken - y.taken) || (y.hits - x.hits);
    return [...live().sort(order), ...players.filter((p) => p.ghost)].map((p) => p.seat);
  }
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.ghost ? 'REFLECTION' : `${p.gems} GEMS`; };
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || p.ghost) return null;
    let best = null, bd = 1e9;
    for (const gm of gems) for (const b of [p.A, p.B]) {
      const d = Math.hypot(gm.x - b.x, gm.y - b.y) - (gm.big ? 40 : 0);
      if (d < bd) { bd = d; best = { gm, b }; }
    }
    if (!best) return null;
    const { gm, b } = best;
    // express the goal in left-body terms: the stick moves the twin through the mirror rule
    if (b === p.A) return [gm.x, gm.y];
    return [p.A.x + mode.sx * (gm.x - b.x), p.A.y + mode.sy * (gm.y - b.y)];
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    g.rect(0, 0, MX, 180, '#121a2e', true);
    g.rect(MX, 0, 160, 180, '#1a122e', true);
    for (let y = TOP; y < BOT; y += 12) for (let x = 0; x < 320; x += 12) if (((x + y) / 12) % 2) g.rect(x, y, 12, 12, x < MX ? '#152040' : '#201540', true);
    // the mirror
    for (let y = TOP; y < BOT; y += 2) g.rect(MX - HALF, y, HALF * 2, 2, Math.floor(y / 2 + t * 30) % 8 < 2 ? '#ffffff' : '#9fd3ff');
    const warn = modeT < 2 && Math.floor(t * 8) % 2;
    const lw = Math.max(g.textW(mode.name, 2), g.textW(`CHANGES IN ${Math.ceil(modeT)}`, 1)) + 8;
    g.rect(MX - lw / 2, TOP + 1, lw, 22, '#0b0a12cc');
    g.text(mode.name, MX, TOP + 3, { scale: 2, col: warn ? '#ffd84a' : '#fff', align: 'center', ui: false });
    g.text(`CHANGES IN ${Math.ceil(modeT)}`, MX, TOP + 15, { scale: 1, col: '#9fd3ff', align: 'center', ui: false, shadow: null });
    g.text(L.name, MX, BOT - 8, { scale: 1, col: '#9fd3ff55', align: 'center', ui: false, shadow: null });
    for (const side of ['L', 'R']) for (const q of pillarsOf(side)) { g.circle(q.x, q.y, q.r, side === 'L' ? '#24305a' : '#30245a'); g.ring(q.x, q.y, q.r, '#9fd3ff'); }
    for (const s of balls) {
      g.circle(s.x, s.y, 6, '#ff5a5a');
      for (let k = 0; k < 6; k++) { const a = t * 6 + (k / 6) * TAU; g.rect(s.x + Math.cos(a) * 7 - 1, s.y + Math.sin(a) * 7 - 1, 2, 2, '#ffb0b0'); }
    }
    for (const side of ['L', 'R']) {
      const l = lasers[side];
      if (l.warn > 0 && Math.floor(t * 12) % 2) {
        if (side === 'L') g.dotted(4, TOP, 4, BOT, '#ff5a5a', 3); else g.dotted(MX + 4, TOP + 4, 316, TOP + 4, '#ff5a5a', 3);
      }
      if (l.on) {
        if (side === 'L') { const x = 4 + l.pos * (MX - 8); g.alpha(0.35); g.rect(x - 4, TOP, 8, BOT - TOP, '#ff3a3a'); g.alpha(1); g.rect(x - 1, TOP, 2, BOT - TOP, '#fff'); }
        else { const y = TOP + 4 + l.pos * (BOT - TOP - 8); g.alpha(0.35); g.rect(MX + HALF, y - 4, 160 - HALF, 8, '#ff3a3a'); g.alpha(1); g.rect(MX + HALF, y - 1, 160 - HALF, 2, '#fff'); }
      }
    }
    for (const gm of gems) {
      const s = gm.big ? 4 : 2.5, bob = Math.sin(t * 5 + gm.x) * 1;
      g.rect(gm.x - s / 2, gm.y - s + bob, s, s * 2, gm.big ? '#ffd84a' : '#9fd3ff'); g.rect(gm.x - s, gm.y - s / 2 + bob, s * 2, s, gm.big ? '#ffd84a' : '#9fd3ff');
      g.rect(gm.x - 0.5, gm.y - 0.5 + bob, 1, 1, '#fff');
    }
    pickups.draw(g);
    guns.draw(g);
    for (const p of players) {
      const blink = p.invT > 0 && Math.floor(t * 16) % 2;
      for (const b of [p.A, p.B]) {
        const twin = b === p.B;
        const al = p.ghost ? 0.3 : blink ? 0.4 : twin ? 0.85 : 1;
        g.alpha(0.3); g.rect(b.x - 4, b.y + b.r - 1, 8, 2, '#000'); g.alpha(1);
        drawPlayer(g, p.idx, b.x, b.y + b.r, { flip: (twin ? p.face * mode.sx : p.face) < 0, size: p.st.size * 0.9, flash: p.flashT > 0, alpha: al });
        if (p.blockT > 0) g.ring(b.x, b.y, b.r + 4, '#5affd9');
        const a = twin ? Math.atan2(Math.sin(p.aim) * mode.sy, Math.cos(p.aim) * mode.sx) : p.aim;
        g.rect(b.x + Math.cos(a) * 9 - 0.5, b.y + Math.sin(a) * 9 - 0.5, 1, 1, '#fff');
        if (!p.ghost) drawTag(g, p.idx, b.x, b.y - 12 * p.st.size);
      }
      // a faint thread between twins, so you can find your other half
      g.alpha(0.12); g.dotted(p.A.x, p.A.y, p.B.x, p.B.y, SEAT_COLORS[p.idx], 6); g.alpha(1);
      drawBuffs(g, p, p.A.x, p.A.y + p.A.r + 2);
    }
  };
  return game;
}
