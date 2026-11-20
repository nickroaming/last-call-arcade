// LASER LOUNGE: top-down survival on a neon dance floor. Dodge everything.
import { TAU, clamp, rand, segDist, angleDiff, approach } from '../engine/util.js';
import { drawPlayer, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';

export const meta = {
  id: 'lounge', name: 'LASER LOUNGE', color: '#ff5fd2', music: 'lounge', tier: 1,
  tagline: 'Dodge the light show',
  objective: 'Survive the lasers. Last one dancing wins. Stand still and the floor heats up under you.',
  card: { rule: 'LAST ONE DANCING WINS', rule2: 'STAND STILL AND THE FLOOR HEATS UP', keys: [['A', 'DASH']], danger: 'LASERS, ZAP TILES, DISCO BALLS' },
  controls: [['STICK', 'Move'], ['A', 'Dash'], ['X', 'Turret: fire (when out)'], ['R-STICK', 'Turret: aim']],
  hazards: 'Spinning lasers / laser walls with a gap / zapping floor tiles / bouncing disco balls',
  ghost: 'Out of hearts: ride the walls as a turret and shoot orbs at the survivors',
  tiebreak: 'Standing > more hearts > knocked out later',
  // the dance floor punishes campers: an idle player used to win 33-40% of events
  gunUse: 'Your turret gun when you are out', blockUse: 'Your dash (A)', bodyUse: 'Your body (health = hearts)',
  twists: ['wind', 'giant', 'hyper', 'ice', 'rubber', 'warp'],
};

const TOP = 16, BOT = 180, LEFT = 0, RIGHT = 320;
const TIME = 36;
const TW = 20, COLS = 16, ROWS = 8, TY0 = 18;

const SCRIPT = [
  [0.6, 'tiles', { pattern: 'random', p: 0.25 }, 'FLOOR CHECK'],
  [3, 'balls', { n: 2, dur: 12 }, 'DISCO BALLS'],
  [5.5, 'sweep', { arms: 2, w: 0.85, dur: 6 }, 'SPIN CYCLE'],
  [12.5, 'tiles', { pattern: 'checker' }, null],
  [14, 'bars', { dir: 'down' }, 'LASER LIMBO'],
  [17.5, 'bars', { dir: 'right' }, null],
  [20, 'sweep', { arms: 3, w: -1.05, dur: 6 }, 'TRIPLE SPIN'],
  [20.5, 'balls', { n: 2, dur: 9 }, null],
  [26.5, 'tiles', { pattern: 'rows' }, null],
  [27.5, 'bars', { dir: 'up' }, 'CROSSFIRE'],
  [27.5, 'bars', { dir: 'left' }, null],
  [31, 'sweep', { arms: 4, w: 1.35, dur: 5 }, 'FINAL SPIN'],
  [31.5, 'balls', { n: 3, dur: 5 }, null],
  [33.5, 'tiles', { pattern: 'random', p: 0.4 }, null],
];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  let env = twistEnv(tw, 0);
  const per = 2 * ((RIGHT - LEFT) + (BOT - TOP));
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const hearts = clamp(Math.round(st.hp / 34), 1, 6);
    const out = !!pl.ghost;
    const p = {
      seat: pl.seat, idx: pl.idx, x: 110 + i * 50, y: 110, vx: 0, vy: 0, r: 3.6 * st.size, gs: newGunState(st.gun), mult: pl.pickupMult ?? 1, slowT: 0,
      hearts: out ? 0 : hearts, maxHearts: hearts, shields: st.shields, inv: 1, out, outT: out ? -1 : null,
      dashT: 0, dashCd: 0, dashDx: 1, dashDy: 0, face: 1, flashT: 0,
      tur: { s: (i / 3) * per + 40, cd: 1.2 },
    };
    p.pos = () => (p.out ? [perimeterPos(p.tur.s).x, perimeterPos(p.tur.s).y] : [p.x, p.y - 4]);
    return makeBuffable(p, st);
  });
  const hazards = [];
  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: BOT, open: {} },
    accel: () => [env.wind, 0],
    solidAt: () => null,
    targets: () => players.filter((p) => !p.out).map((p) => ({ ref: p, owner: p, x: p.x, y: p.y - 4, r: p.r })),
    onHit: (p, info) => { if (p.out || p.inv > 0) return 'none'; if (info.g.frost) p.slowT = 1.5; hurt(p, p.x - info.dx * 5, p.y - info.dy * 5); return 'hit'; },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['shield', 'speed'], every: 6, spot: () => [rand(20, 300), rand(TOP + 15, BOT - 10)] });
  let script = SCRIPT.map((s) => ({ t: s[0], type: s[1], opts: s[2], label: s[3] }));
  let t = 0, endT = null;
  const game = { meta, finished: false, ranking: [], players };
  const alive = () => players.filter((p) => !p.out);

  function spawn(type, o) {
    sound.sfx('warn');
    if (type === 'sweep') hazards.push({ type, cx: 160, cy: 98, a: rand(0, TAU), arms: o.arms, w: o.w, warn: 1.3, life: o.dur });
    if (type === 'bars') {
      const horiz = o.dir === 'down' || o.dir === 'up';
      const gapW = 36;
      hazards.push({
        type, horiz, dirSign: o.dir === 'down' || o.dir === 'right' ? 1 : -1,
        pos: o.dir === 'down' ? TOP : o.dir === 'up' ? BOT : o.dir === 'right' ? LEFT : RIGHT,
        gap: horiz ? rand(40, 280) : rand(TOP + 30, BOT - 30), gapW, speed: horiz ? 34 : 60, warn: 1.1, life: 99,
      });
    }
    if (type === 'tiles') {
      const set = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        let on = false;
        if (o.pattern === 'random') on = Math.random() < o.p;
        if (o.pattern === 'checker') on = (r + c) % 2 === 0;
        if (o.pattern === 'rows') on = r % 2 === (Math.random() < 0.5 ? 0 : 1) || false;
        if (on) set.push([c, r]);
      }
      if (o.pattern === 'rows') { set.length = 0; const odd = Math.random() < 0.5 ? 1 : 0; for (let r = 0; r < ROWS; r++) if (r % 2 === odd) for (let c = 0; c < COLS; c++) set.push([c, r]); }
      hazards.push({ type, set, warn: 1.1, life: 0.35 });
    }
    if (type === 'balls') {
      for (let k = 0; k < o.n; k++) {
        const a = rand(0, TAU);
        hazards.push({ type: 'ball', x: rand(30, 290), y: rand(TOP + 15, BOT - 15), vx: Math.cos(a) * rand(55, 80), vy: Math.sin(a) * rand(55, 80), r: 6, warn: 0.9, life: o.dur, rot: 0 });
      }
    }
  }

  function hurt(p, sx, sy) {
    if (p.out || p.inv > 0) return;
    const d = Math.hypot(p.x - sx, p.y - sy) || 1;
    p.vx += ((p.x - sx) / d) * 160 * p.st.knockTaken; p.vy += ((p.y - sy) / d) * 160 * p.st.knockTaken;
    if (p.shields > 0) {
      p.shields -= 1; p.inv = 1;
      fx.popup('AIRBAG!', p.x, p.y - 16, '#9fd3ff', 1); fx.ring(p.x, p.y - 5, 12, '#9fd3ff'); sound.sfx('block');
      return;
    }
    p.hearts -= 1; p.inv = 1.3; p.flashT = 0.15;
    fx.impact(p.x, p.y - 5, { dmg: 34, col: SEAT_COLORS[p.idx], dx: p.x - sx, dy: p.y - sy }); sound.sfx('zap');
    if (p.hearts <= 0) {
      p.out = true; p.outT = t;
      fx.burst(p.x, p.y - 5, 30, SEAT_COLORS[p.idx], { speed: 150, life: 0.8, size: 2 });
      fx.ring(p.x, p.y - 5, 26, '#fff', 0.5);
      fx.slow(0.4); fx.shake(0.6); fx.flash('#ff5fd2', 0.3); sound.sfx('ko');
      fx.popup(`P${p.idx + 1} OUT!`, p.x, p.y - 20, SEAT_COLORS[p.idx], 3);
      p.tur.s = nearestPerimeter(p.x, p.y);
    }
  }
  function perimeterPos(s) {
    s = ((s % per) + per) % per;
    const w = RIGHT - LEFT, h = BOT - TOP;
    if (s < w) return { x: LEFT + s, y: TOP + 1, tx: 1, ty: 0, nx: 0, ny: 1 };
    s -= w; if (s < h) return { x: RIGHT - 1, y: TOP + s, tx: 0, ty: 1, nx: -1, ny: 0 };
    s -= h; if (s < w) return { x: RIGHT - s, y: BOT - 1, tx: -1, ty: 0, nx: 0, ny: -1 };
    s -= w; return { x: LEFT + 1, y: BOT - s, tx: 0, ty: -1, nx: 1, ny: 0 };
  }
  function nearestPerimeter(x, y) {
    let best = 0, bd = 1e9;
    for (let s = 0; s < per; s += 4) { const q = perimeterPos(s); const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    while (script.length && script[0].t <= t) {
      const s = script.shift();
      spawn(s.type, s.opts);
      if (s.label) fx.popup(s.label, 160, 70, '#ffd84a', 3);
    }
    // hazards
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      if (h.warn > 0) { h.warn -= dt; if (h.warn <= 0 && h.type !== 'ball') sound.sfx(h.type === 'tiles' ? 'zap' : 'laser'); continue; }
      h.life -= dt;
      if (h.type === 'sweep') {
        h.a += h.w * dt;
        for (const p of alive()) {
          for (let k = 0; k < h.arms; k++) {
            const a = h.a + (k / h.arms) * TAU;
            if (segDist(p.x, p.y - 4, h.cx, h.cy, h.cx + Math.cos(a) * 400, h.cy + Math.sin(a) * 400) < p.r + 1.5) hurt(p, h.cx + Math.cos(a) * Math.hypot(p.x - h.cx, p.y - h.cy), h.cy + Math.sin(a) * Math.hypot(p.x - h.cx, p.y - h.cy));
          }
          if (Math.hypot(p.x - h.cx, p.y - 4 - h.cy) < 7 + p.r) hurt(p, h.cx, h.cy);
        }
      } else if (h.type === 'bars') {
        h.pos += h.dirSign * h.speed * dt;
        if ((h.horiz && (h.pos < TOP - 5 || h.pos > BOT + 5)) || (!h.horiz && (h.pos < -5 || h.pos > 325))) h.life = 0;
        for (const p of alive()) {
          const along = h.horiz ? p.x : p.y - 4, across = h.horiz ? p.y - 4 : p.x;
          if (Math.abs(across - h.pos) < p.r + 1.5 && Math.abs(along - h.gap) > h.gapW / 2 - p.r) hurt(p, h.horiz ? p.x : h.pos, h.horiz ? h.pos : p.y);
        }
      } else if (h.type === 'tiles') {
        for (const p of alive()) {
          const c = Math.floor(p.x / TW), r = Math.floor((p.y - 3 - TY0) / TW);
          if (h.set.some(([a, b]) => a === c && b === r)) hurt(p, c * TW + TW / 2, TY0 + r * TW + TW / 2);
        }
        if (Math.random() < 0.5) { const [c, r] = h.set[Math.floor(rand(0, h.set.length))] || [0, 0]; fx.burst(c * TW + rand(0, TW), TY0 + r * TW + rand(0, TW), 1, '#fff', { speed: 40, life: 0.2 }); }
      } else if (h.type === 'ball') {
        h.x += h.vx * dt; h.y += h.vy * dt; h.rot += dt * 5;
        if (h.x < h.r || h.x > 320 - h.r) { h.vx = -h.vx; h.x = clamp(h.x, h.r, 320 - h.r); }
        if (h.y < TOP + h.r || h.y > BOT - h.r) { h.vy = -h.vy; h.y = clamp(h.y, TOP + h.r, BOT - h.r); }
        for (const p of alive()) if (Math.hypot(p.x - h.x, p.y - 4 - h.y) < h.r + p.r) hurt(p, h.x, h.y);
      }
      if (h.life <= 0) hazards.splice(i, 1);
    }

    // players
    for (const p of players) {
      const c = controls.get(p.seat);
      p.flashT -= dt;
      if (p.out) {
        const q = perimeterPos(p.tur.s);
        p.tur.s += (c.mx * q.tx + c.my * q.ty) * 130 * dt;
        p.tur.cd -= dt;
        const q2 = perimeterPos(p.tur.s);
        let a = c.aim ? Math.atan2(c.ay, c.ax) : Math.atan2(q2.ny, q2.nx);
        if (!c.aim && Math.hypot(c.mx, c.my) > 0.5) a = Math.atan2(q2.ny, q2.nx) + clamp(angleDiff(Math.atan2(q2.ny, q2.nx), Math.atan2(c.my, c.mx)), -1, 1) * 0.6;
        p.tur.a = a;
        if (endT === null) guns.trigger(p, p.gs, { ...p.st.gun, speed: p.st.gun.speed * 0.5, delay: Math.max(0.35, p.st.gun.delay * 1.6) }, c.fire, a, q2.x + q2.nx * 5, q2.y + q2.ny * 5, dt);
        continue;
      }
      tickBuffs(p, dt); p.slowT -= dt;
      p.inv -= dt; p.dashCd -= dt;
      const max = 88 * p.st.speed * (p.slowT > 0 ? 0.55 : 1);
      if (p.dashT > 0) {
        p.dashT -= dt;
        p.vx = p.dashDx * 270; p.vy = p.dashDy * 270;
        if (Math.random() < 0.8) fx.burst(p.x, p.y - 4, 1, SEAT_COLORS[p.idx], { speed: 10, life: 0.25 });
        if (p.dashT <= 0 && p.st.blockShock) {
          const R = 20 + 8 * p.st.blockShock;
          fx.ring(p.x, p.y - 4, R, '#ffd84a', 0.35); sound.sfx('boom');
          for (const o of alive()) {
            if (o === p) continue;
            const d = Math.hypot(o.x - p.x, o.y - p.y);
            if (d < R) { o.vx += ((o.x - p.x) / (d || 1)) * 200 * p.st.gun.knock * o.st.knockTaken; o.vy += ((o.y - p.y) / (d || 1)) * 200 * p.st.gun.knock * o.st.knockTaken; }
          }
        }
      } else {
        const acc = env.ice ? 220 : 900;
        p.vx = approach(p.vx, c.mx * max, acc * dt) + env.wind * 0.6 * dt;
        p.vy = approach(p.vy, c.my * max, acc * dt);
        if (c.jumpP && p.dashCd <= 0) {
          const m = Math.hypot(c.mx, c.my);
          p.dashDx = m > 0.2 ? c.mx / m : p.face; p.dashDy = m > 0.2 ? c.my / m : 0;
          p.dashT = 0.14; p.dashCd = 1.1 * p.st.blockCd; sound.sfx('dash');
          if (p.st.blockBlink) { p.x = clamp(p.x + p.dashDx * 40, 4, 316); p.y = clamp(p.y + p.dashDy * 40, TOP + 9, BOT - 1); fx.burst(p.x, p.y - 4, 8, '#fff', { speed: 50, life: 0.3 }); }
          if (p.st.blockHeal && p.hearts < p.maxHearts && Math.random() < 0.15) { p.hearts += 1; fx.popup('+1', p.x, p.y - 14, '#7dff8a', 1); }
        }
      }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      p.x = clamp(p.x + p.vx * dt, 4, 316);
      p.y = clamp(p.y + p.vy * dt, TOP + 9, BOT - 1);
    }
    // the floor heats up under anyone who stops dancing: 2.2 s within a few pixels arms the tiles around them
    for (const p of alive()) {
      if (!p.anchor || Math.hypot(p.x - p.anchor[0], p.y - p.anchor[1]) > 12) { if (p.anchor) p.travel = (p.travel || 0) + Math.hypot(p.x - p.anchor[0], p.y - p.anchor[1]); p.anchor = [p.x, p.y]; p.stillT = 0; continue; }
      p.stillT += dt;
      if (p.stillT > 2.2 && t > 2) {
        p.stillT = -1.2;
        const c0 = Math.floor(p.x / TW), r0 = Math.floor((p.y - 3 - TY0) / TW), set = [];
        for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) if (r >= 0 && r < ROWS && c >= 0 && c < COLS) set.push([c, r]);
        hazards.push({ type: 'tiles', set, warn: 1.1, life: 0.35 });
        sound.sfx('warn'); fx.popup('DANCE!', p.x, p.y - 18, '#ffd84a', 2);
      }
    }
    // player pushing
    const al = alive();
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const a = al[i], b = al[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r + 2;
      if (d < m && d > 0) {
        const nx = dx / d, ny = dy / d, push = (m - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const k = 60;
        b.vx += nx * k * a.st.gun.knock * b.st.knockTaken * (a.dashT > 0 ? 3 : 1); b.vy += ny * k * a.st.gun.knock * b.st.knockTaken * (a.dashT > 0 ? 3 : 1);
        a.vx -= nx * k * b.st.gun.knock * a.st.knockTaken * (b.dashT > 0 ? 3 : 1); a.vy -= ny * k * b.st.gun.knock * a.st.knockTaken * (b.dashT > 0 ? 3 : 1);
      }
    }
    guns.update(dt);
    pickups.update(dt, players.filter((p) => !p.out).map((p) => ({ p, x: p.x, y: p.y - 4, r: p.r + 2, mult: p.mult })));

    const started = players.filter((p) => p.outT !== -1).length;
    if (endT === null && ((started > 1 && alive().length <= 1) || started > 0 && alive().length === 0 || t >= TIME)) endT = 1.1;
    if (endT !== null) {
      endT -= dt;
      if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); }
    }
  };
  function rank() {
    const a = players.filter((p) => !p.out).sort((x, y) => y.hearts - x.hearts);
    const d = players.filter((p) => p.out).sort((x, y) => y.outT - x.outT);
    // last one DANCING wins: a survivor who barely moved all event ranks below everyone who played
    const all = [...a, ...d];
    const danced = all.filter((p) => (p.travel || 0) > 60 || p.outT === -1), idle = all.filter((p) => !((p.travel || 0) > 60 || p.outT === -1));
    return [...danced, ...idle].map((p) => p.seat);
  }
  game.hud = (seat) => {
    const p = players.find((x) => x.seat === seat);
    return p.out ? 'TURRET' : '@'.repeat(p.hearts) + (p.shields ? '+' : '');
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    g.rect(0, 0, 320, 180, '#0a0618', true);
    const beat = Math.floor(t * 124 / 60);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const lit = (c * 7 + r * 13 + beat) % 11 === 0;
      const col = lit ? ['#3a1a5a', '#14405a', '#5a1a40'][(c + r + beat) % 3] : (r + c) % 2 ? '#150c28' : '#1b1034';
      g.rect(c * TW, TY0 + r * TW, TW - 1, TW - 1, col);
    }
    g.frame(0, TOP, 320, BOT - TOP, '#ff5fd2', 1);
    // tiles
    for (const h of hazards) {
      if (h.type !== 'tiles') continue;
      for (const [c, r] of h.set) {
        if (h.warn > 0) { if (Math.floor(t * 5) % 2) g.frame(c * TW + 1, TY0 + r * TW + 1, TW - 3, TW - 3, '#ff3a3a'); }
        else { g.rect(c * TW, TY0 + r * TW, TW - 1, TW - 1, '#ff6a6a'); g.rect(c * TW + 3, TY0 + r * TW + 3, TW - 7, TW - 7, '#fff'); }
      }
    }
    pickups.draw(g);
    guns.draw(g);
    // players
    for (const p of players) {
      if (p.out) continue;
      const blink = p.inv > 0 && Math.floor(t * 5) % 2;
      g.alpha(0.3); g.rect(p.x - 4 * p.st.size, p.y - 1, 8 * p.st.size, 2, '#000'); g.alpha(1);
      drawPlayer(g, p.idx, p.x, p.y, { flip: p.face < 0, size: p.st.size * 0.85, flash: p.flashT > 0, alpha: blink ? 0.4 : 1 });
      if (p.shields) g.ring(p.x, p.y - 5, 8 * p.st.size, '#9fd3ff88');
      if (p.dashCd <= 0) g.rect(p.x - 1, p.y + 2, 2, 1, '#fff');
      drawTag(g, p.idx, p.x, p.y - 11 * p.st.size);
      drawBuffs(g, p, p.x, p.y + 4);
      for (let k = 0; k < p.hearts; k++) g.rect(p.x - p.hearts * 1.5 + k * 3, p.y - 11 * p.st.size - 9, 2, 2, '#ff5a5a');
    }
    // lasers & balls on top
    for (const h of hazards) {
      if (h.type === 'sweep') {
        for (let k = 0; k < h.arms; k++) {
          const a = h.a + (k / h.arms) * TAU;
          const ex = h.cx + Math.cos(a) * 400, ey = h.cy + Math.sin(a) * 400;
          if (h.warn > 0) { if (Math.floor(t * 5) % 2) g.dotted(h.cx, h.cy, h.cx + Math.cos(a) * 200, h.cy + Math.sin(a) * 200, '#ff3a3a', 4); }
          else { g.alpha(0.35); g.beam(h.cx, h.cy, ex, ey, 6, '#ff2a6a'); g.alpha(1); g.beam(h.cx, h.cy, ex, ey, 2, '#ffd0e0'); }
        }
        g.circle(h.cx, h.cy, 7, '#2a1040'); g.ring(h.cx, h.cy, 7, '#ff5fd2'); g.circle(h.cx, h.cy, 3, h.warn > 0 ? '#ff3a3a' : '#fff');
      } else if (h.type === 'bars') {
        const segs = h.horiz ? [[0, h.gap - h.gapW / 2], [h.gap + h.gapW / 2, 320]] : [[TOP, h.gap - h.gapW / 2], [h.gap + h.gapW / 2, BOT]];
        for (const [a0, a1] of segs) {
          if (h.warn > 0) {
            if (Math.floor(t * 5) % 2) {
              if (h.horiz) g.dotted(a0, h.pos + h.dirSign * 3, a1, h.pos + h.dirSign * 3, '#ff3a3a', 4);
              else g.dotted(h.pos + h.dirSign * 3, a0, h.pos + h.dirSign * 3, a1, '#ff3a3a', 4);
            }
          } else if (h.horiz) { g.alpha(0.35); g.rect(a0, h.pos - 3, a1 - a0, 6, '#3affd0'); g.alpha(1); g.rect(a0, h.pos - 1, a1 - a0, 2, '#e0fff8'); }
          else { g.alpha(0.35); g.rect(h.pos - 3, a0, 6, a1 - a0, '#3affd0'); g.alpha(1); g.rect(h.pos - 1, a0, 2, a1 - a0, '#e0fff8'); }
        }
      } else if (h.type === 'ball') {
        if (h.warn > 0) { g.ring(h.x, h.y, h.r + h.warn * 8, '#ff3a3a'); continue; }
        g.circle(h.x, h.y, h.r, '#b8c0d8');
        for (let k = 0; k < 6; k++) { const a = h.rot + k; g.rect(h.x + Math.cos(a) * h.r * 0.6 - 1, h.y + Math.sin(a) * h.r * 0.6 - 1, 2, 2, k % 2 ? '#fff' : '#6a7090'); }
        if (Math.random() < 0.2) fx.burst(h.x, h.y, 1, ['#ff5fd2', '#33d6ff', '#ffd84a'][Math.floor(rand(0, 3))], { speed: 80, life: 0.3 });
      }
    }
    // turrets
    for (const p of players) {
      if (!p.out || game.finished) continue;
      const q = perimeterPos(p.tur.s);
      g.circle(q.x, q.y, 5, SEAT_COLORS[p.idx]); g.circle(q.x, q.y, 2.5, '#0b0a12');
      const ta = p.tur.a ?? Math.atan2(q.ny, q.nx);
      g.rect(q.x + Math.cos(ta) * 6 - 1, q.y + Math.sin(ta) * 6 - 1, 3, 3, '#fff');
      g.text(`P${p.idx + 1}`, q.x + q.nx * 14, q.y + q.ny * 14 - 3, { scale: 1, col: p.tur.cd <= 0 ? SEAT_COLORS[p.idx] : '#777', align: 'center', ui: false });
    }
  };
  return game;
}
