// BLAST BALL: top-down pinball soccer. Each player guards a goal.
// Shoot the ball (bullet knockback pushes it), dash into it, bank it off bumpers.
import { TAU, clamp, rand, approach } from '../engine/util.js';
import { drawPlayer, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';

export const meta = {
  id: 'blastball', name: 'BLAST BALL', color: '#7dff8a', music: 'dustlap',
  tagline: 'Pinball soccer with guns',
  objective: 'Guard your goal. Shoot the ball into rivals\' goals. 3 goals against you and you\'re out.',
  controls: [['STICK', 'Move and aim'], ['X / RT', 'Shoot: bullets push the ball'], ['A', 'Dash: smash the ball'], ['RB', 'Block: bounce the ball back hard']],
  hazards: 'Bumpers that kick the ball / multiball at 20 s / rival bullets knock you back',
  ghost: 'Out: your goal becomes a wall you slide along as a turret',
  tiebreak: 'Still in > fewer goals against > more goals scored',
  gunUse: 'Your gun (knockback pushes the ball)', blockUse: 'Your block and dash', bodyUse: 'Your body',
  twists: ['wind', 'rubber', 'giant', 'warp', 'ice', 'hyper', 'bullettime'],
};

const X0 = 6, X1 = 314, Y0 = 18, Y1 = 176;
const TIME = 50;
const LIVES = 3;

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  let env = twistEnv(tw, 0);
  let t = 0, endT = null;
  const n = ctx.players.length;
  const GOALS = [
    { side: 'left', a: 97 - 24, b: 97 + 24 },
    { side: 'right', a: 97 - 24, b: 97 + 24 },
    { side: 'bottom', a: 160 - 30, b: 160 + 30 },
  ];
  const starts = [[40, 97], [280, 97], [160, 150]];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const p = {
      seat: pl.seat, idx: pl.idx, x: starts[i][0], y: starts[i][1], vx: 0, vy: 0, r: 5 * st.size, face: i === 1 ? -1 : 1,
      lives: pl.ghost ? 0 : LIVES, out: !!pl.ghost, outT: pl.ghost ? -1 : null, scored: 0, goal: GOALS[i],
      gs: newGunState(st.gun), dashT: 0, dashCd: 0, blockT: 0, blockCd: 0, stun: 0, slowT: 0, flashT: 0, mult: pl.pickupMult ?? 1, shields: st.shields,
      tur: 0.5,
    };
    p.pos = () => (p.out ? turretPos(p) : [p.x, p.y]);
    return makeBuffable(p, st);
  });
  const bumpers = [{ x: 160, y: 58, r: 10, flash: 0 }, { x: 112, y: 122, r: 9, flash: 0 }, { x: 208, y: 122, r: 9, flash: 0 }];
  const balls = [];
  function newBall() { balls.push({ x: 160, y: 92, vx: 0, vy: 0, r: 6, wait: 1.2, last: null, spin: 0 }); }
  newBall();
  const game = { meta, finished: false, ranking: [], players };
  const inPlay = () => players.filter((p) => !p.out);
  const goalOwner = (side) => players.find((p) => p.goal.side === side && !p.out);

  function turretPos(p) {
    const g = p.goal;
    if (g.side === 'left') return [X0 + 3, 24 + p.tur * 146];
    if (g.side === 'right') return [X1 - 3, 24 + p.tur * 146];
    return [14 + p.tur * 292, Y1 - 3];
  }
  function inward(p) { return p.goal.side === 'left' ? 0 : p.goal.side === 'right' ? Math.PI : -Math.PI / 2; }

  function scoreOn(owner, ball) {
    owner.lives -= 1;
    const by = ball.last && ball.last !== owner ? ball.last : null;
    if (by) by.scored += 1;
    fx.popup(by ? `P${by.idx + 1} SCORES!` : 'OWN GOAL!', 160, 60, by ? SEAT_COLORS[by.idx] : '#fff', 3);
    fx.shake(0.6); fx.flash(SEAT_COLORS[owner.idx], 0.35); sound.sfx('ko'); fx.hueKick = (fx.hueKick || 0) + 30;
    fx.burst(ball.x, ball.y, 40, SEAT_COLORS[owner.idx], { speed: 160, life: 0.8, size: 2 });
    if (owner.lives <= 0) {
      owner.out = true; owner.outT = t;
      fx.popup(`P${owner.idx + 1} OUT!`, owner.x, owner.y - 14, SEAT_COLORS[owner.idx], 2);
    }
    ball.x = 160; ball.y = 92; ball.vx = ball.vy = 0; ball.wait = 1.3; ball.last = null;
  }
  function kickBall(ball, dx, dy, power, who) {
    ball.vx += dx * power; ball.vy += dy * power; ball.last = who || ball.last; ball.wait = 0;
    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 320) { ball.vx *= 320 / sp; ball.vy *= 320 / sp; }
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: X0, y0: Y0, x1: X1, y1: Y1, open: {} },
    accel: () => [env.wind, 0],
    solidAt: (x, y) => { for (const b of bumpers) if (Math.hypot(x - b.x, y - b.y) < b.r) return { circle: b }; return null; },
    targets: () => [
      ...balls.filter((b) => b.wait <= 0).map((b) => ({ ref: b, owner: null, x: b.x, y: b.y, r: b.r })),
      ...inPlay().map((p) => ({ ref: p, owner: p, x: p.x, y: p.y, r: p.r })),
    ],
    onHit: (ref, info) => {
      if (balls.includes(ref)) {
        kickBall(ref, info.dx, info.dy, (info.kind === 'blast' ? 140 : 75) * (info.g.knock || 1) * Math.sqrt(Math.max(0.3, info.dmg / 34)), info.owner);
        fx.burst(ref.x, ref.y, 5, '#fff', { speed: 60, life: 0.2 });
        return 'hit';
      }
      const p = ref;
      if (p.blockT > 0) { if (p.st.reflect && info.kind === 'bullet') return 'reflect'; sound.sfx('block'); return 'blocked'; }
      if (p.shields > 0) { p.shields -= 1; fx.popup('AIRBAG!', p.x, p.y - 12, '#9fd3ff', 1); return 'blocked'; }
      const k = 140 * (info.g.knock || 1) * p.st.knockTaken;
      p.vx += info.dx * k; p.vy += info.dy * k; p.stun = 0.25; p.flashT = 0.1;
      if (info.g.frost) p.slowT = 1.5;
      sound.sfx('hit');
      return 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, spot: () => [rand(50, 270), rand(35, 160)] });

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    if (t > 20 && balls.length < 2) { newBall(); fx.popup('MULTIBALL!', 160, 70, '#7dff8a', 3); sound.sfx('jackpot'); }
    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.out) {
        if (p.outT === -1 && p.lives === 0) { /* sudden-death ghost */ }
        p.tur = clamp(p.tur + (p.goal.side === 'bottom' ? c.mx : c.my) * 0.6 * dt, 0, 1);
        const [sx, sy] = turretPos(p);
        let a = c.aim ? Math.atan2(c.ay, c.ax) : inward(p);
        if (!c.aim && Math.abs(p.goal.side === 'bottom' ? c.my : c.mx) > 0.5) a = inward(p) + (p.goal.side === 'bottom' ? c.mx : c.my) * 0.5;
        p.aim = a;
        if (endT === null) guns.trigger(p, p.gs, { ...p.st.gun, delay: Math.max(0.35, p.st.gun.delay * 1.5) }, c.fire, a, sx + Math.cos(a) * 5, sy + Math.sin(a) * 5, dt);
        continue;
      }
      tickBuffs(p, dt);
      p.dashCd -= dt; p.blockT -= dt; p.blockCd -= dt; p.slowT -= dt; p.flashT -= dt;
      const max = 88 * p.st.speed * (p.slowT > 0 ? 0.55 : 1);
      if (p.dashT > 0) { p.dashT -= dt; }
      else if (p.stun > 0) { p.stun -= dt; p.vx *= Math.pow(0.1, dt); p.vy *= Math.pow(0.1, dt); }
      else {
        const acc = env.ice ? 220 : 900;
        p.vx = approach(p.vx, c.mx * max, acc * dt) + env.wind * 0.4 * dt;
        p.vy = approach(p.vy, c.my * max, acc * dt);
        if (c.jumpP && p.dashCd <= 0) {
          const m = Math.hypot(c.mx, c.my);
          const dx = m > 0.2 ? c.mx / m : p.face, dy = m > 0.2 ? c.my / m : 0;
          p.vx = dx * 260; p.vy = dy * 260; p.dashT = 0.16; p.dashCd = 1.1 * p.st.blockCd; sound.sfx('dash');
          if (p.st.blockBlink) { p.x = clamp(p.x + dx * 36, X0 + p.r, X1 - p.r); p.y = clamp(p.y + dy * 36, Y0 + p.r, Y1 - p.r); }
        }
      }
      if (c.blockP && p.blockCd <= 0) {
        p.blockT = 0.35; p.blockCd = 2.2 * p.st.blockCd; sound.sfx('block');
        if (p.st.blockShock) { fx.ring(p.x, p.y, 34, '#5affd9', 0.3); for (const b of balls) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < 40) kickBall(b, (b.x - p.x) / d, (b.y - p.y) / d, 200, p); } }
      }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.x = clamp(p.x, X0 + p.r, X1 - p.r); p.y = clamp(p.y, Y0 + p.r, Y1 - p.r);
      for (const b of bumpers) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < p.r + b.r) { const nx = (p.x - b.x) / d, ny = (p.y - b.y) / d; p.x = b.x + nx * (p.r + b.r); p.y = b.y + ny * (p.r + b.r); p.vx += nx * 120; p.vy += ny * 120; p.stun = 0.15; b.flash = 0.15; sound.sfx('boing'); } }
      let a = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.3 ? Math.atan2(c.my, c.mx) : (p.face > 0 ? 0 : Math.PI);
      p.aim = a;
      guns.trigger(p, p.gs, p.st.gun, c.fire, a, p.x + Math.cos(a) * 6, p.y + Math.sin(a) * 6, dt);
    }
    // player-player
    const ip = inPlay();
    for (let i = 0; i < ip.length; i++) for (let j = i + 1; j < ip.length; j++) {
      const a = ip[i], b = ip[j]; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d < m && d > 0) { const nx = dx / d, ny = dy / d, push = (m - d) / 2; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; b.vx += nx * 60 * (a.dashT > 0 ? 3 : 1); b.vy += ny * 60 * (a.dashT > 0 ? 3 : 1); a.vx -= nx * 60 * (b.dashT > 0 ? 3 : 1); a.vy -= ny * 60 * (b.dashT > 0 ? 3 : 1); }
    }
    // balls
    for (const b of balls) {
      if (b.wait > 0) { b.wait -= dt; continue; }
      b.vx += env.wind * 0.5 * dt;
      for (const p of inPlay()) if (p.st.magnet) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < 50 && d > 1) { b.vx += ((p.x - b.x) / d) * 60 * dt; b.vy += ((p.y - b.y) / d) * 60 * dt; } }
      b.vx *= Math.pow(0.55, dt); b.vy *= Math.pow(0.55, dt);
      b.x += b.vx * dt; b.y += b.vy * dt; b.spin += Math.hypot(b.vx, b.vy) * dt * 0.1;
      // goals and walls
      const check = (side, inMouth, along) => {
        const owner = goalOwner(side);
        if (owner && inMouth(along)) { scoreOn(owner, b); return true; }
        return false;
      };
      if (b.x - b.r < X0) { if (!check('left', (y) => y > GOALS[0].a && y < GOALS[0].b, b.y)) { b.x = X0 + b.r; b.vx = Math.abs(b.vx) * 0.9; sound.sfx('bump'); } }
      else if (b.x + b.r > X1) { if (!check('right', (y) => y > GOALS[1].a && y < GOALS[1].b, b.y)) { b.x = X1 - b.r; b.vx = -Math.abs(b.vx) * 0.9; sound.sfx('bump'); } }
      if (b.y - b.r < Y0) { b.y = Y0 + b.r; b.vy = Math.abs(b.vy) * 0.9; sound.sfx('bump'); }
      else if (b.y + b.r > Y1) { if (!check('bottom', (x) => x > GOALS[2].a && x < GOALS[2].b, b.x)) { b.y = Y1 - b.r; b.vy = -Math.abs(b.vy) * 0.9; sound.sfx('bump'); } }
      for (const q of bumpers) {
        const d = Math.hypot(b.x - q.x, b.y - q.y);
        if (d < b.r + q.r) { const nx = (b.x - q.x) / d, ny = (b.y - q.y) / d; b.x = q.x + nx * (b.r + q.r); b.y = q.y + ny * (b.r + q.r); const dot = b.vx * nx + b.vy * ny; b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; b.vx += nx * 70; b.vy += ny * 70; q.flash = 0.2; sound.sfx('boing'); fx.burst(b.x, b.y, 6, '#7dff8a', { speed: 70, life: 0.25 }); }
      }
      for (const p of inPlay()) {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < b.r + p.r && d > 0) {
          const nx = (b.x - p.x) / d, ny = (b.y - p.y) / d;
          b.x = p.x + nx * (b.r + p.r); b.y = p.y + ny * (b.r + p.r);
          const pv = Math.max(0, p.vx * nx + p.vy * ny);
          const power = (35 + pv * 1.2) * (p.dashT > 0 ? 1.8 : 1) * (p.blockT > 0 ? 2.2 : 1) * p.st.gun.knock;
          const dot = b.vx * nx + b.vy * ny; if (dot < 0) { b.vx -= dot * nx * 1.6; b.vy -= dot * ny * 1.6; }
          kickBall(b, nx, ny, power, p);
          if (p.dashT > 0 || p.blockT > 0) { fx.burst(b.x, b.y, 8, '#fff', { speed: 90, life: 0.25 }); sound.sfx('shove'); fx.shake(0.1); }
        }
      }
    }
    for (const q of bumpers) q.flash -= dt;
    guns.update(dt);
    pickups.update(dt, inPlay().map((p) => ({ p, x: p.x, y: p.y, r: p.r + 2, mult: p.mult })));
    const started = players.filter((p) => p.outT !== -1).length;
    if (endT === null && ((started > 1 && inPlay().length <= 1) || t >= TIME)) endT = 1.2;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    const a = inPlay().sort((x, y) => y.lives - x.lives || y.scored - x.scored);
    const d = players.filter((p) => p.out).sort((x, y) => y.outT - x.outT || y.scored - x.scored);
    return [...a, ...d].map((p) => p.seat);
  }
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.out ? 'TURRET' : '@'.repeat(p.lives); };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    g.rect(0, 0, 320, 180, '#071a10', true);
    for (let x = X0; x < X1; x += 22) g.rect(x, Y0, 11, Y1 - Y0, '#0b2416', true);
    g.frame(X0, Y0, X1 - X0, Y1 - Y0, '#7dff8a', 1, false);
    g.ring(160, 97, 26, '#7dff8a44'); g.rect(160, Y0, 1, Y1 - Y0, '#7dff8a22');
    for (const p of players) {
      const G = p.goal; const col = SEAT_COLORS[p.idx]; const sealed = p.out;
      if (G.side === 'left' || G.side === 'right') {
        const x = G.side === 'left' ? X0 - 4 : X1;
        g.rect(x, G.a, 4, G.b - G.a, sealed ? '#3a3550' : col);
        if (!sealed) for (let y = G.a + 2; y < G.b; y += 4) g.rect(x + 1, y, 2, 1, '#0b0a12');
        g.text(`P${p.idx + 1}`, G.side === 'left' ? X0 + 8 : X1 - 8, 97 - 3, { scale: 1, col, align: 'center', ui: false });
      } else {
        g.rect(G.a, Y1, G.b - G.a, 4, sealed ? '#3a3550' : col);
        if (!sealed) for (let x = G.a + 2; x < G.b; x += 4) g.rect(x, Y1 + 1, 1, 2, '#0b0a12');
        g.text(`P${p.idx + 1}`, 160, Y1 - 10, { scale: 1, col, align: 'center', ui: false });
      }
      if (!sealed) for (let k = 0; k < p.lives; k++) {
        const [hx, hy] = G.side === 'left' ? [X0 + 4, G.a - 6 - k * 4] : G.side === 'right' ? [X1 - 6, G.a - 6 - k * 4] : [G.b + 4 + k * 4, Y1 - 6];
        g.rect(hx, hy, 2, 2, '#ff5a5a');
      }
    }
    for (const q of bumpers) { g.circle(q.x, q.y, q.r, q.flash > 0 ? '#ffffff' : '#1f6a3a'); g.ring(q.x, q.y, q.r, '#7dff8a'); g.circle(q.x, q.y, q.r * 0.4, '#7dff8a'); }
    pickups.draw(g);
    for (const b of balls) {
      if (b.wait > 0 && Math.floor(t * 10) % 2) continue;
      g.circle(b.x + 1, b.y + 2, b.r, '#00000066');
      g.circle(b.x, b.y, b.r, '#f0f0ff');
      for (let k = 0; k < 4; k++) { const a = b.spin + k * TAU / 4; g.rect(b.x + Math.cos(a) * 3 - 1, b.y + Math.sin(a) * 3 - 1, 2, 2, '#2a2a3a'); }
      if (b.last) g.ring(b.x, b.y, b.r + 1, SEAT_COLORS[b.last.idx]);
    }
    guns.draw(g);
    for (const p of players) {
      if (p.out) {
        if (game.finished) continue;
        const [sx, sy] = turretPos(p);
        g.circle(sx, sy, 5, SEAT_COLORS[p.idx]); g.circle(sx, sy, 2.5, '#0b0a12');
        g.rect(sx + Math.cos(p.aim ?? inward(p)) * 6 - 1, sy + Math.sin(p.aim ?? inward(p)) * 6 - 1, 3, 3, '#fff');
        continue;
      }
      g.alpha(0.3); g.rect(p.x - 4 * p.st.size, p.y + p.r - 1, 8 * p.st.size, 2, '#000'); g.alpha(1);
      drawPlayer(g, p.idx, p.x, p.y + p.r, { flip: p.face < 0, size: p.st.size * 0.9, flash: p.flashT > 0 });
      if (p.blockT > 0) g.ring(p.x, p.y, p.r + 4, '#5affd9');
      if (p.shields) g.ring(p.x, p.y, p.r + 3, '#9fd3ff55');
      g.rect(p.x + Math.cos(p.aim || 0) * 8 - 0.5, p.y + Math.sin(p.aim || 0) * 8 - 0.5, 1, 1, '#fff');
      drawTag(g, p.idx, p.x, p.y - 7 * p.st.size);
      drawBuffs(g, p, p.x, p.y + p.r + 2);
    }
  };
  return game;
}
