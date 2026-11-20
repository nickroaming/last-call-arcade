// ECHO CHAMBER: every 5 seconds the room remembers. Each player's last 5
// seconds come back as an echo that replays every step and every shot, on a
// loop, forever. Echo bullets hit EVERYONE, including the player who made
// them, and touching any echo (even your own) is a paradox that hurts.
// By the end you are dodging your own past.
import { TAU, clamp, rand, approach } from '../engine/util.js';
import { drawPlayer, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';

export const meta = {
  id: 'echo', name: 'ECHO CHAMBER', color: '#5affd9', music: 'lounge',
  tagline: 'Every 5 seconds your past self comes back',
  objective: 'Last one standing. Every 5 s your past self replays. Its shots hit everyone, even you.',
  controls: [['STICK', 'Move and aim'], ['X / RT', 'Shoot (echoes repeat it)'], ['A', 'Dash'], ['RB', 'Block']],
  hazards: 'Your echoes / their echoes / touching any echo hurts / after 30 s echoes speed up',
  ghost: 'Knocked out: your echoes keep fighting for you',
  tiebreak: 'Standing > more hearts > more hits landed (echo hits count)',
  gunUse: 'Your gun (and every echo of you uses it too)', blockUse: 'Your block and dash', bodyUse: 'Your body',
  twists: ['wind', 'rubber', 'bullettime', 'giant', 'hyper', 'ice'],
};

const TOP = 16, BOT = 180;
const TIME = 50;
const LOOP = 5;          // seconds per echo
const MAX_ECHOES = 3;    // per player
const LAYOUTS = [
  { name: 'THE STUDIO', pillars: [{ x: 110, y: 70, r: 10 }, { x: 210, y: 70, r: 10 }, { x: 160, y: 130, r: 12 }] },
  { name: 'HALL OF CLOCKS', pillars: [{ x: 80, y: 98, r: 9 }, { x: 160, y: 60, r: 9 }, { x: 240, y: 98, r: 9 }, { x: 160, y: 140, r: 9 }] },
  { name: 'THE VOID', pillars: [{ x: 160, y: 98, r: 18 }] },
];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  const L = LAYOUTS[ctx.variant % LAYOUTS.length];
  const pillars = L.pillars;
  let env = twistEnv(tw, 0);
  let t = 0, endT = null, loopT = 0, slip = false;
  const starts = [[50, 50], [270, 50], [160, 160]];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const hearts = clamp(Math.round(st.hp / 16), 2, 10);
    const p = {
      seat: pl.seat, idx: pl.idx, x: starts[i][0], y: starts[i][1], vx: 0, vy: 0, r: 5 * st.size, face: 1, aim: 0,
      hearts, maxHearts: hearts, out: !!pl.ghost, outT: pl.ghost ? -1 : null, hits: 0,
      gs: newGunState(st.gun), dashT: 0, dashCd: 0, blockT: 0, blockCd: 0, stun: 0, slowT: 0, invT: 0, flashT: 0,
      mult: pl.pickupMult ?? 1, shields: st.shields, rec: [],
    };
    p.pos = () => [p.x, p.y];
    return makeBuffable(p, st);
  });
  const echoes = []; // { src, frames, i, x, y, aim, gs, born, pos }
  const game = { meta, finished: false, ranking: [], players };
  const alive = () => players.filter((p) => !p.out);

  function hurt(p, from, dx, dy) {
    if (p.out || p.invT > 0) return 'none';
    if (p.blockT > 0) { sound.sfx('block'); fx.ring(p.x, p.y, p.r + 6, '#5affd9'); return 'blocked'; }
    if (p.shields > 0) { p.shields -= 1; p.invT = 0.6; fx.popup('AIRBAG!', p.x, p.y - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
    p.hearts -= 1; p.invT = 1.1; p.flashT = 0.15; p.stun = 0.2;
    p.vx += dx * 160 * p.st.knockTaken; p.vy += dy * 160 * p.st.knockTaken;
    fx.shake(0.25); fx.stop(0.04); sound.sfx('hit');
    fx.burst(p.x, p.y, 12, SEAT_COLORS[p.idx], { speed: 100, life: 0.4 });
    const who = from ? (from.src ? (from.src === p ? 'YOUR PAST!' : `P${from.src.idx + 1}'S ECHO`) : null) : null;
    if (who) fx.popup(who, p.x, p.y - 14, from.src === p ? '#ff5fd2' : '#5affd9', 1);
    const credit = from && (from.src || from);
    if (credit && credit !== p && credit.hits !== undefined) credit.hits += 1;
    if (p.hearts <= 0) {
      p.out = true; p.outT = t;
      fx.burst(p.x, p.y, 36, SEAT_COLORS[p.idx], { speed: 160, life: 0.8, size: 2 }); fx.ring(p.x, p.y, 30, '#fff', 0.5);
      fx.slow(0.45); fx.flash('#5affd9', 0.3); sound.sfx('ko'); fx.hueKick = (fx.hueKick || 0) + 30;
      fx.popup(`P${p.idx + 1} ERASED!`, p.x, p.y - 18, SEAT_COLORS[p.idx], 3);
    }
    return 'hit';
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: BOT, open: {} },
    accel: () => [env.wind, 0],
    solidAt: (x, y) => { for (const q of pillars) if (Math.hypot(x - q.x, y - q.y) < q.r) return { circle: q }; return null; },
    targets: () => alive().map((p) => ({ ref: p, owner: p, x: p.x, y: p.y, r: p.r })),
    onHit: (p, info) => {
      if (p.blockT > 0 && p.st.reflect && info.kind === 'bullet') return 'reflect';
      return hurt(p, info.owner, info.dx, info.dy) === 'none' ? 'none' : 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega'], spot: () => [rand(30, 290), rand(TOP + 15, BOT - 15)] });

  function collide(o, r) {
    for (const q of pillars) {
      const d = Math.hypot(o.x - q.x, o.y - q.y);
      if (d < r + q.r && d > 0) { const nx = (o.x - q.x) / d, ny = (o.y - q.y) / d; o.x = q.x + nx * (r + q.r); o.y = q.y + ny * (r + q.r); }
    }
  }

  function spawnEchoes() {
    let any = false;
    for (const p of players) {
      if (p.out || p.rec.length < 30) { p.rec = []; continue; }
      const e = { src: p, frames: p.rec, i: 0, x: p.rec[0].x, y: p.rec[0].y, aim: 0, gs: newGunState(p.st.gun), born: t, flash: 0.5 };
      e.pos = () => [e.x, e.y];
      e.st = p.st; // so knockback and status effects read the right gun
      echoes.push(e); any = true;
      const mine = echoes.filter((q) => q.src === p);
      if (mine.length > MAX_ECHOES) echoes.splice(echoes.indexOf(mine[0]), 1);
      fx.burst(e.x, e.y, 16, SEAT_COLORS[p.idx], { speed: 70, life: 0.5 });
      p.rec = [];
    }
    if (any) { sound.sfx('warn'); fx.flash('#5affd9', 0.15); fx.hueKick = (fx.hueKick || 0) + 12; fx.popup('ECHO!', 160, 40, '#5affd9', 2); }
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    loopT += dt;
    if (loopT >= LOOP) { loopT -= LOOP; spawnEchoes(); }
    if (!slip && t >= 30) { slip = true; fx.popup('TIME IS SLIPPING', 160, 60, '#ff5fd2', 2); sound.sfx('warn'); }
    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.out) continue;
      tickBuffs(p, dt);
      p.dashCd -= dt; p.blockT -= dt; p.blockCd -= dt; p.slowT -= dt; p.flashT -= dt; p.invT -= dt;
      const max = 84 * p.st.speed * (p.slowT > 0 ? 0.55 : 1);
      if (p.dashT > 0) p.dashT -= dt;
      else if (p.stun > 0) { p.stun -= dt; p.vx *= Math.pow(0.1, dt); p.vy *= Math.pow(0.1, dt); }
      else {
        const acc = env.ice ? 170 : 900;
        p.vx = approach(p.vx, c.mx * max, acc * dt); p.vy = approach(p.vy, c.my * max, acc * dt);
        if (c.jumpP && p.dashCd <= 0) {
          const m = Math.hypot(c.mx, c.my); const dx = m > 0.2 ? c.mx / m : p.face, dy = m > 0.2 ? c.my / m : 0;
          p.vx = dx * 250; p.vy = dy * 250; p.dashT = 0.14; p.dashCd = 1.2 * p.st.blockCd; sound.sfx('dash');
          if (p.st.blockBlink) { p.x = clamp(p.x + dx * 34, 6, 314); p.y = clamp(p.y + dy * 34, TOP + 6, BOT - 6); }
        }
      }
      p.vx += env.wind * 0.5 * dt;
      if (c.blockP && p.blockCd <= 0) { p.blockT = 0.45; p.blockCd = 2.6 * p.st.blockCd; sound.sfx('block'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      p.x = clamp(p.x + p.vx * dt, p.r, 320 - p.r); p.y = clamp(p.y + p.vy * dt, TOP + p.r, BOT - p.r);
      collide(p, p.r);
      const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.3 ? Math.atan2(c.my, c.mx) : (p.face > 0 ? 0 : Math.PI);
      p.aim = a;
      const firing = c.fire && p.stun <= 0;
      if (firing) guns.trigger(p, p.gs, p.st.gun, true, a, p.x + Math.cos(a) * 6, p.y + Math.sin(a) * 6, dt);
      else guns.trigger(p, p.gs, p.st.gun, false, a, p.x, p.y, dt);
      p.rec.push({ x: p.x, y: p.y, a, f: firing });
    }
    // echoes replay (faster once time slips)
    const speed = slip ? 1.5 : 1;
    for (const e of echoes) {
      e.flash -= dt;
      e.acc = (e.acc || 0) + speed;
      while (e.acc >= 1) { e.acc -= 1; e.i = (e.i + 1) % e.frames.length; }
      const f = e.frames[e.i];
      e.x = f.x; e.y = f.y; e.aim = f.a;
      guns.trigger(e, e.gs, e.src.st.gun, f.f, f.a, f.x + Math.cos(f.a) * 6, f.y + Math.sin(f.a) * 6, dt * speed);
      // paradox: touching any echo hurts (not in the first half second, so a fresh echo can't ambush)
      if (t - e.born < 0.5) continue;
      for (const p of alive()) {
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < p.r + 4) { if (hurt(p, e, (p.x - e.x) / (d || 1), (p.y - e.y) / (d || 1)) === 'hit') fx.popup('PARADOX!', p.x, p.y - 22, '#ff5fd2', 1); }
      }
    }
    guns.update(dt);
    pickups.update(dt, alive().map((p) => ({ p, x: p.x, y: p.y, r: p.r + 2, mult: p.mult })));
    const started = players.filter((p) => p.outT !== -1).length;
    if (endT === null && ((started > 1 && alive().length <= 1) || t >= TIME || (started <= 1 && t >= 25))) endT = 1.3;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    const a = alive().sort((x, y) => (y.hearts - x.hearts) || (y.hits - x.hits));
    const d = players.filter((p) => p.out).sort((x, y) => (y.outT - x.outT) || (y.hits - x.hits));
    return [...a, ...d].map((p) => p.seat);
  }
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.out ? `ECHOES ${echoes.filter((e) => e.src === p).length}` : `HP ${Math.max(0, p.hearts)}  HITS ${p.hits}`; };
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || p.out) return null;
    let close = null, cd = 26;
    for (const e of echoes) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < cd) { cd = d; close = e; } }
    if (close) return [close.x, close.y, 'away'];
    let best = null, bd = 1e9;
    for (const o of alive()) { if (o === p) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; } }
    return best ? [best.x, best.y] : null;
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    g.rect(0, 0, 320, 180, '#071a1a', true);
    // concentric "sound" rings pulse out with the loop
    const k = loopT / LOOP;
    for (let i = 0; i < 5; i++) { const r = ((k + i / 5) % 1) * 200; g.alpha(0.25 * (1 - r / 200)); g.ring(160, 98, r, '#5affd9'); }
    g.alpha(1);
    for (let y = TOP; y < BOT; y += 20) for (let x = 0; x < 320; x += 20) g.rect(x + 9, y + 9, 2, 2, '#0e2e2e', true);
    g.text(L.name, 160, 24, { scale: 1, col: '#5affd955', align: 'center', ui: false, shadow: null });
    // loop timer bar
    g.rect(40, TOP + 1, 240, 3, '#0e2e2e'); g.rect(40, TOP + 1, 240 * k, 3, k > 0.8 && Math.floor(t * 10) % 2 ? '#ff5fd2' : '#5affd9');
    g.text(slip ? 'REC x1.5' : 'REC', 36, TOP, { scale: 1, col: Math.floor(t * 2) % 2 ? '#ff5a5a' : '#5a2a2a', align: 'right', ui: false, shadow: null });
    for (const q of pillars) { g.circle(q.x, q.y, q.r, '#123838'); g.ring(q.x, q.y, q.r, '#5affd9'); g.circle(q.x, q.y, 2, '#5affd9'); }
    pickups.draw(g);
    // echoes: older ones fainter, with a little trail of where they are going
    for (const e of echoes) {
      const age = echoes.filter((q) => q.src === e.src && q.born > e.born).length;
      const a = e.flash > 0 ? 0.9 : 0.5 - age * 0.12;
      for (let s = 6; s <= 24; s += 6) { const f = e.frames[(e.i + s) % e.frames.length]; g.alpha(a * 0.4); g.rect(f.x - 0.5, f.y - 0.5, 1, 1, SEAT_COLORS[e.src.idx]); }
      g.alpha(1);
      drawPlayer(g, e.src.idx, e.x, e.y + e.src.r, { alpha: a, size: e.src.st.size * 0.9, flip: Math.cos(e.aim) < 0 });
      g.ring(e.x, e.y, e.src.r + 3, SEAT_COLORS[e.src.idx] + '88');
    }
    guns.draw(g);
    for (const p of players) {
      if (p.out) continue;
      const blink = p.invT > 0 && Math.floor(t * 16) % 2;
      g.alpha(0.3); g.rect(p.x - 4, p.y + p.r - 1, 8, 2, '#000'); g.alpha(1);
      drawPlayer(g, p.idx, p.x, p.y + p.r, { flip: p.face < 0, size: p.st.size * 0.9, flash: p.flashT > 0, alpha: blink ? 0.4 : 1 });
      if (p.blockT > 0) g.ring(p.x, p.y, p.r + 4, '#5affd9');
      g.rect(p.x + Math.cos(p.aim) * 9 - 0.5, p.y + Math.sin(p.aim) * 9 - 0.5, 1, 1, '#fff');
      for (let h = 0; h < p.maxHearts; h++) g.rect(p.x - p.maxHearts * 2 + h * 4, p.y - 12 * p.st.size - 4, 3, 2, h < p.hearts ? '#ff5a7a' : '#3a2030');
      drawBuffs(g, p, p.x, p.y + p.r + 2);
      drawTag(g, p.idx, p.x, p.y - 12 * p.st.size - 6);
    }
    void TAU;
  };
  return game;
}
