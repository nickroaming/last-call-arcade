// ZERO FRICTION: the Cabinet switches friction off. A round ice rink seen from
// above; you keep every bit of speed you build. Shots shove, dashes ram, and
// the only brake is shooting the other way. Fall off the edge and you're out
// for the round. A short best-of (src/game/rounds.js): land a hit to take a
// round. Each round the ice starts melting at 8 s, and pucks join at 5 s.
import { TAU, clamp, rand } from '../engine/util.js';
import { drawPlayer, drawTag, drawGun, drawArm, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { Drift, P } from '../engine/style.js';
import { makeRounds } from '../game/rounds.js';
import { switcheroo } from '../game/switcheroo.js';

export const meta = {
  id: 'slide', name: 'ZERO FRICTION', color: '#9fe8ff', music: 'lounge', tier: 2,
  tagline: 'Nothing stops. Not even you.',
  card: { rule: 'KNOCK THEM OFF THE ICE', rule2: 'SHOOT BACKWARDS TO BRAKE. FIRST TO 2', keys: [['A', 'DASH'], ['X', 'SHOVE'], ['RB', 'ANCHOR']], danger: 'THE EDGE, PUCKS, MELTING ICE' },
  broken: 'FRICTION', // the rule the Cabinet breaks in this event
  objective: 'Last one on the ice takes the round, if they landed a hit. First to 2. Nothing slows you down: shoot the other way to brake.',
  controls: [['STICK', 'Push (you keep your speed)'], ['A', 'Dash: ram someone'], ['X / RT', 'Shoot: shoves them, kicks you back'], ['RB', 'Anchor: heavy for a moment']],
  hazards: 'The edge (you wobble for 0.7 s: push back in to save yourself) / pucks from 5 s / the ice melts inward from 8 s each round',
  ghost: 'Fell in: circle the rim and shoot in. Back next round',
  tiebreak: 'More round wins > longer on the ice > closer to the middle',
  gunUse: 'Your gun (every shot also pushes you back)', blockUse: 'Your anchor (RB) and dash', bodyUse: 'Your body: momentum is everything',
  twists: ['wind', 'giant', 'rubber', 'hyper', 'bullettime'],
};

const C = { x: 160, y: 100 };
const R0 = 82, RMIN = 38;
const MELT_AT = 8, MELT = 1.6;    // the round's escalation: the rim melts inward
const PUCKS_AT = 5;
const PUSH = 140, MAXV = 150, DRAG = 0.15;   // "no friction": a whisper of drag so a round can settle
const SHOVE = 100, KICK = 34;   // tuned: at 150 one shot nearly maxed your speed and rounds lasted ~5 s

export const ARENAS = [
  { name: 'THE RINK', holes: [] },
  { name: 'CRACKED', holes: [{ x: 160, y: 100, r: 10 }] },
  { name: 'TWIN HOLES', holes: [{ x: 128, y: 100, r: 8 }, { x: 192, y: 100, r: 8 }] },
];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  const A = ARENAS[ctx.variant % ARENAS.length];
  const drift = ctx.drift || new Drift();
  let env = twistEnv(tw, 0);
  let t = 0, R = R0, meltSaid = false;
  const players = ctx.players.map((pl) => {
    const st = pl.stats;
    const p = {
      seat: pl.seat, idx: pl.idx, x: C.x, y: C.y, vx: 0, vy: 0, r: 5 * st.size, face: 1, hp: 100, maxHp: 100,
      dead: !!pl.ghost, deathT: pl.ghost ? -1 : null, perma: !!pl.ghost, fall: 0, lastTouch: null, lastTouchT: -9,
      gs: newGunState(st.gun), dashCd: 0, dashT: 0, blockT: 0, blockCd: 0, invT: 0, flashT: 0, slowT: 0, shields: st.shields,
      mult: pl.pickupMult ?? 1, rim: Math.random() * TAU, rimAim: 0,
    };
    p.pos = () => (p.dead ? rimPos(p) : [p.x, p.y]);
    return makeBuffable(p, st);
  });
  const rimPos = (p) => [C.x + Math.cos(p.rim) * (R0 + 12), C.y + Math.sin(p.rim) * (R0 + 12) * 0.92];
  const alive = () => players.filter((p) => !p.dead);
  const pucks = [];
  const flakes = Array.from({ length: 40 }, () => ({ x: rand(0, 320), y: rand(15, 180) }));
  const game = { meta, finished: false, ranking: [], players, layoutName: A.name };

  const R2 = makeRounds({
    players, fx, sound, drift, cap: 20, time: 50,
    onReset: (p, k, round) => {
      const n = Math.max(1, players.filter((q) => !q.perma).length);
      const a = -Math.PI / 2 + (k / n) * TAU + round * 0.9;
      p.x = C.x + Math.cos(a) * 34; p.y = C.y + Math.sin(a) * 34; p.vx = 0; p.vy = 0; p.fall = 0; p.teeter = 0;
      p.invT = R2.shield; p.blockT = 0; p.dashCd = 0.5; p.lastTouch = null;
      fx.ring(p.x, p.y, 14, SEAT_COLORS[p.idx], 0.5);
      R = R0; meltSaid = false; pucks.length = 0; guns.bullets.length = 0;
    },
  });

  function touch(p, src) { if (src && src !== p) { p.lastTouch = src; p.lastTouchT = t; } }
  function shove(p, dx, dy, k, src = null) {
    if (p.dead || p.invT > 0) return 'none';
    if (p.blockT > 0) { fx.ring(p.x, p.y, p.r + 6, P.safe); sound.sfx('block'); k *= 0.2; }
    else if (p.shields > 0) { p.shields -= 1; p.invT = 0.4; fx.popup('AIRBAG!', p.x, p.y - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
    p.vx += dx * k * p.st.knockTaken; p.vy += dy * k * p.st.knockTaken; p.flashT = 0.12;
    touch(p, src);
    if (src && src !== p && src.dealt !== undefined) src.dealt += 10;
    fx.impact(p.x, p.y, { dmg: 18 + k / 12, col: SEAT_COLORS[p.idx], dx, dy }); sound.sfx(k > 200 ? 'hitBig' : 'hit');
    return 'hit';
  }
  function fallIn(p) {
    p.dead = true; p.deathT = t; p.fall = 0.5;
    const by = p.lastTouch && t - p.lastTouchT < 4 ? p.lastTouch : null;
    if (by && by.dealt !== undefined) by.dealt += 30;
    fx.burst(p.x, p.y, 24, '#bff3ff', { speed: 110, life: 0.6 }); fx.ring(p.x, p.y, 20, '#ffffff', 0.4);
    fx.ko(p.x, p.y, SEAT_COLORS[p.idx]); sound.sfx('ko'); drift.hush(0.6);
    fx.popup(by ? `P${by.idx + 1} SENT P${p.idx + 1} SWIMMING` : `P${p.idx + 1} SLID OFF`, 160, 34, by ? SEAT_COLORS[by.idx] : SEAT_COLORS[p.idx], 2);
    p.rim = Math.atan2(p.y - C.y, p.x - C.x);
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: 15, x1: 320, y1: 180, open: {} },
    accel: () => [env.wind, 0],
    solidAt: () => null,
    targets: () => [...alive().map((p) => ({ ref: p, owner: p, x: p.x, y: p.y, r: p.r })), ...pucks.map((q) => ({ ref: q, owner: null, x: q.x, y: q.y, r: q.r }))],
    onHit: (ref, info) => {
      if (ref.puck) { ref.vx += info.dx * 90; ref.vy += info.dy * 90; return 'hit'; }
      if (ref.blockT > 0 && ref.st.reflect && info.kind === 'bullet') return 'reflect';
      return shove(ref, info.dx, info.dy, SHOVE * (info.g.knock || 1) * (info.kind === 'blast' ? 1.4 : 1), info.owner) === 'none' ? 'none' : 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega'], spot: () => { const a = rand(0, TAU), d = rand(0, R * 0.6); return [C.x + Math.cos(a) * d, C.y + Math.sin(a) * d]; } });

  const onIce = (x, y, pad = 0) => Math.hypot(x - C.x, (y - C.y) / 0.92) <= R - pad && !A.holes.some((h) => Math.hypot(x - h.x, y - h.y) < h.r + pad);

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t) };
    const phase = R2.tick(dt);
    for (const p of players) if (p.fall > 0) p.fall -= dt;
    if (phase === 'done') { if (!game.finished) { game.finished = true; game.ranking = R2.rank(); } return; }
    if (phase !== 'play') { guns.update(dt); return; }
    const rt = R2.roundT;
    // the round's turn: the rim melts inward
    if (rt > MELT_AT) {
      if (!meltSaid) { meltSaid = true; fx.popup('THE ICE IS MELTING', 160, 34, P.danger, 2); sound.sfx('warn'); }
      R = Math.max(RMIN, R - MELT * dt);
    }
    if (rt > PUCKS_AT && pucks.length < 2 && Math.random() < dt * 0.8) {
      const a = rand(0, TAU);
      pucks.push({ puck: true, x: C.x + Math.cos(a) * 20, y: C.y + Math.sin(a) * 20, vx: Math.cos(a + 1.5) * 90, vy: Math.sin(a + 1.5) * 90, r: 4, warn: 0.9 });
      sound.sfx('warn');
    }
    for (const q of pucks) {
      if (q.warn > 0) { q.warn -= dt; continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      const d = Math.hypot(q.x - C.x, (q.y - C.y) / 0.92);
      if (d > R - q.r) { const nx = (q.x - C.x) / d, ny = (q.y - C.y) / d; const vn = q.vx * nx + q.vy * ny; if (vn > 0) { q.vx -= 2 * vn * nx; q.vy -= 2 * vn * ny; } q.x = C.x + nx * (R - q.r); q.y = C.y + ny * (R - q.r) * 0.92; sound.sfx('bump'); }
      for (const p of alive()) { const dd = Math.hypot(p.x - q.x, p.y - q.y); if (dd < p.r + q.r) { const nx = (p.x - q.x) / (dd || 1), ny = (p.y - q.y) / (dd || 1); shove(p, nx, ny, 190); q.vx -= nx * 60; q.vy -= ny * 60; } }
    }
    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.dead) { // on the rim: circle and shoot in
        p.rim += (c.mx * -Math.sin(p.rim) + c.my * Math.cos(p.rim)) * 1.4 * dt;
        const [sx, sy] = rimPos(p);
        const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.atan2(C.y - sy, C.x - sx);
        p.rimAim = a;
        guns.trigger(p, p.gs, { ...p.st.gun, delay: Math.max(0.45, p.st.gun.delay * 1.7) }, c.fire, a, sx + Math.cos(a) * 6, sy + Math.sin(a) * 6, dt);
        continue;
      }
      tickBuffs(p, dt);
      p.dashCd -= dt; p.dashT -= dt; p.blockT -= dt; p.blockCd -= dt; p.invT -= dt; p.flashT -= dt; p.slowT -= dt;
      const push = PUSH * p.st.speed * (p.slowT > 0 ? 0.55 : 1) * (p.blockT > 0 ? 0.2 : 1);
      p.vx += c.mx * push * dt; p.vy += c.my * push * dt;
      if (c.jumpP && p.dashCd <= 0) {
        const m = Math.hypot(c.mx, c.my); const dx = m > 0.2 ? c.mx / m : p.face, dy = m > 0.2 ? c.my / m : 0;
        p.vx += dx * 125; p.vy += dy * 125; p.dashT = 0.25; p.dashCd = 1.4 * p.st.blockCd; sound.sfx('dash');
        fx.burst(p.x, p.y, 8, '#e8f8ff', { speed: 60, life: 0.3, angle: Math.atan2(-dy, -dx), spread: 1 });
      }
      if (c.blockP && p.blockCd <= 0) { p.blockT = 0.45; p.blockCd = 2.4 * p.st.blockCd; sound.sfx('block'); switcheroo(p, players, { fx, sound }); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.3 ? Math.atan2(c.my, c.mx) : (p.face > 0 ? 0 : Math.PI);
      if (guns.trigger(p, p.gs, p.st.gun, c.fire, a, p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8, dt)) {
        const kick = KICK * Math.sqrt(p.st.gun.knock || 1); p.vx -= Math.cos(a) * kick; p.vy -= Math.sin(a) * kick; // every shot pushes you back: the only brake
      }
      const sp = Math.hypot(p.vx, p.vy), max = MAXV * (p.dashT > 0 ? 1.6 : 1);
      if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; }
      const drag = Math.pow(1 - DRAG, dt);
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.x = clamp(p.x, 4, 316); p.y = clamp(p.y, 18, 178);
    }
    // bodies collide: heavier (anchored) bodies win
    const al = alive();
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const a = al[i], b = al[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d >= m || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      const ma = a.blockT > 0 ? 4 : 1, mb = b.blockT > 0 ? 4 : 1;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      a.x -= nx * (m - d) * (mb / (ma + mb)); a.y -= ny * (m - d) * (mb / (ma + mb));
      b.x += nx * (m - d) * (ma / (ma + mb)); b.y += ny * (m - d) * (ma / (ma + mb));
      if (rel > 0) {
        const jmp = (2.2 * rel) / (ma + mb);
        a.vx -= jmp * mb * nx; a.vy -= jmp * mb * ny; b.vx += jmp * ma * nx; b.vy += jmp * ma * ny;
        const hard = rel > 90;
        if (hard) { const hitter = Math.hypot(a.vx, a.vy) < Math.hypot(b.vx, b.vy) ? a : b, other = hitter === a ? b : a; touch(other, hitter); if (a.dashT > 0 || b.dashT > 0) { (a.dashT > 0 ? a : b).dealt += 10; } fx.impact((a.x + b.x) / 2, (a.y + b.y) / 2, { dmg: rel / 6, col: '#e8f8ff', dx: nx, dy: ny }); sound.sfx('bump'); }
        else { touch(a, b); touch(b, a); }
      }
    }
    for (const p of alive()) {
      p.hp = clamp(100 * (1 - Math.hypot(p.x - C.x, p.y - C.y) / Math.max(1, R)), 1, 100); // "health" = how safe you are
      // over the edge: a 0.7 s wobble. Push back in to save yourself; outward speed is damped hard
      if (!onIce(p.x, p.y, -p.r * 0.4)) {
        if (!p.teeter) { p.teeter = 0.7; if (t - (p.saidT ?? -9) > 2) { p.saidT = t; fx.popup('WOBBLE!', p.x, p.y - 16, P.warn, 2); } sound.sfx('warn'); }
        const d = Math.hypot(p.x - C.x, p.y - C.y) || 1, nx = (p.x - C.x) / d, ny = (p.y - C.y) / d, vo = p.vx * nx + p.vy * ny;
        if (vo > 0) { p.vx -= vo * nx * 0.9; p.vy -= vo * ny * 0.9; }
        p.teeter -= dt;
        if (p.teeter <= 0) { p.teeter = 0; fallIn(p); }
      } else if (p.teeter) { if (p.teeter < 0.45 && t - (p.savedT ?? -9) > 2) { p.savedT = t; fx.popup('SAVED!', p.x, p.y - 16, P.good, 2); sound.sfx('ready'); } p.teeter = 0; } // only a real, late save gets the cheer
    }
    guns.update(dt);
    pickups.update(dt, alive().map((p) => ({ p, x: p.x, y: p.y, r: p.r + 2, mult: p.mult })));
    R2.check(dt);
  };
  game.hud = R2.hud;
  game.hudInfo = (seat) => { const i = R2.hudInfo(seat, 'OUT'); const p = players.find((x) => x.seat === seat); if (!p.dead && !p.perma) i.text = 'IN'; i.warn = !p.dead && p.hp < 25; return i; };
  game.leader = R2.leader;
  game.matchPoint = R2.matchPoint;
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || p.dead) return null;
    const d = Math.hypot(p.x - C.x, p.y - C.y) || 1, out = (p.vx * (p.x - C.x) + p.vy * (p.y - C.y)) / d;
    if (d > R * 0.45 || out > 50) return [C.x - p.vx * 0.4, C.y - p.vy * 0.4]; // sliding out: steer back to the middle, against the slide
    return null;
  };
  Object.defineProperty(game, 'round', { get: () => R2.round });
  Object.defineProperty(game, 'timeLeft', { get: () => R2.timeLeft() });

  game.draw = (g) => {
    const D = (c, layer = 'bg') => drift.col(c, layer);
    // L0: dark cold water, quiet flakes that never move
    g.rect(0, 0, 320, 180, D('#06142a'), true);
    for (const f of flakes) g.rect(f.x, f.y, 1, 1, D('#1e3a5a'), true);
    if (R2.roundT < 2.5) { g.alpha(Math.min(1, (2.5 - R2.roundT) * 2)); g.text(A.name, 160, 22, { scale: 2, col: '#7ab8d8', align: 'center', shadow: null }); g.alpha(1); }
    // L1: the ice, a squashed disc. Fill drifts a little; the rim is fixed bright white.
    const ice = (r, col) => { for (let dy = -r * 0.92; dy <= r * 0.92; dy += 1) { const half = r * Math.sqrt(Math.max(0, 1 - (dy / (r * 0.92)) ** 2)); g.rect(C.x - half, C.y + dy, half * 2, 1, col); } };
    g.alpha(0.35); ice(R0, '#1a3a5a'); g.alpha(1);
    ice(R, D('#a8d8ee', 'geo'));
    ice(R * 0.7, D('#b8e2f4', 'geo'));
    for (const h of A.holes) { g.circle(h.x, h.y, h.r, D('#06142a')); g.ring(h.x, h.y, h.r, P.danger); }
    g.ring(C.x, C.y, 12, '#d8f0ff');
    // the rim: the edge you must read at a glance
    const n = Math.round(R * 4);
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU; g.rect(C.x + Math.cos(a) * R - 1, C.y + Math.sin(a) * R * 0.92 - 1, 2, 2, R < R0 - 2 ? P.danger : '#ffffff'); }
    for (const q of pucks) { if (q.warn > 0) { g.ring(q.x, q.y, 6, P.danger); continue; } g.circle(q.x, q.y, q.r, '#1a1a24'); g.ring(q.x, q.y, q.r, P.danger); }
    pickups.draw(g);
    guns.draw(g);
    // L2: players and their speed trails (speed is the whole game here)
    for (const p of players) {
      if (p.dead) {
        if (p.fall > 0) { drawPlayer(g, p.idx, p.x, p.y + 4, { size: p.st.size * 0.9 * (p.fall / 0.5), alpha: p.fall / 0.5 }); continue; }
        if (game.finished || R2.between > 0) continue;
        const [sx, sy] = rimPos(p);
        drawPlayer(g, p.idx, sx, sy + 4, { size: 0.7, alpha: 0.6 });
        drawGun(g, p.idx, sx, sy, p.rimAim, { size: 0.7, alpha: 0.8 });
        g.text(`P${p.idx + 1}`, sx, sy - 12, { scale: g.large ? 2 : 1, col: SEAT_COLORS[p.idx], align: 'center', ui: false });
        continue;
      }
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 40) { g.alpha(Math.min(0.5, sp / 300)); g.beam(p.x, p.y + 3, p.x - p.vx * 0.12, p.y + 3 - p.vy * 0.12, 3, SEAT_COLORS[p.idx]); g.alpha(1); }
      const shielded = p.invT > 0 && R2.roundT < R2.shield + 0.05;
      g.alpha(0.3); g.rect(p.x - 4, p.y + p.r, 8, 2, '#06142a'); g.alpha(1);
      const wob = p.teeter ? Math.sin(t * 30) * 1.5 : 0;
      drawPlayer(g, p.idx, p.x + wob, p.y + p.r, { flip: p.face < 0, size: p.st.size * 0.9, flash: p.flashT > 0, look: p.aim, squash: p.teeter ? 0.3 : 0 });
      if (p.teeter) { g.alpha(0.7); g.ring(p.x, p.y, p.r + 4 + (0.7 - p.teeter) * 6, P.warn); g.alpha(1); }
      drawArm(g, p, p.x, p.y, p.st.size * 0.9);
      if (shielded) { g.alpha(0.5); g.ring(p.x, p.y, p.r + 6, SEAT_COLORS[p.idx]); g.alpha(1); }
      if (p.blockT > 0) { g.ring(p.x, p.y, p.r + 4, P.safe); g.ring(p.x, p.y, p.r + 5, P.safe); }
      drawBuffs(g, p, p.x, p.y + p.r + 3);
      drawTag(g, p.idx, p.x, p.y - 12 * p.st.size - 1);
    }
    R2.draw(g);
  };
  R2.reset();
  return game;
}
