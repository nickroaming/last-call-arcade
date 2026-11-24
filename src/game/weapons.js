// Guns shared by every minigame with a gun.
// Bullets are physical: gravity (from the game), bounces off solids, round
// planets and arena edges, split, retarget, home in, stick, explode, return,
// grow, vanish, drill, chain, shatter, echo. Card traits stack, and named
// COMBOS (combos.js) add rules of their own (`g.cx.<id>`).
//
// A game provides a `world`:
//   bounds: {x0,y0,x1,y1, open: {top,bottom,left,right}}   // open edge = bullets leave
//   accel(x, y) -> [ax, ay]          // gravity + wind for bullets
//   solidAt(x, y) -> null | {rect} | {circle:{x,y,r}}
//   targets() -> [{ref, owner, rect?|{x,y,r}}]
//   onHit(ref, info) -> 'hit' | 'blocked' | 'reflect' | 'none'
//   onPaint?(bullet, x, y, end)      // optional (Splat City)
//   twist?: {bulletSpeed, bounces, wrap}
import { TAU, clamp, angleDiff, circleRect, rand } from '../engine/util.js';
import { SEAT_COLORS } from '../engine/sprites.js';

const NOCX = Object.freeze({});
export const MAX_BULLETS = 420;     // a storm of stacked cards stays playable
const ECHO_GAP = 0.3;
// CHAOS ROUNDS: one of these per bullet (per card)
const CHAOS = [
  (g) => { g.bounces += 3; },
  (g) => { g.homing += 1.3; },
  (g) => { g.explode = Math.max(g.explode, 20); },
  (g) => { g.split += 1; g.bounces += 1; },
  (g) => { g.wave += 1.2; },
  (g) => { g.grow += 1.2; },
  (g) => { g.pierce += 2; },
  (g) => { g.accel += 1.4; },
  (g) => { g.chain += 1; },
  (g) => { g.shrapnel += 1; },
];
const CHAOS_COLS = ['#7dff8a', '#ff5fd2', '#ffd84a', '#5affd9', '#c08bff', '#ff9a2e', '#ffffff', '#ff7a2e', '#9fd3ff', '#ffb0b0'];

export function newGunState(g) {
  return { ammo: g.ammo, cd: 0, reloadT: 0, since: 9, burstLeft: 0, burstT: 0, echoes: [] };
}

export class Guns {
  constructor(world, fx, sound) {
    this.w = world; this.fx = fx; this.sound = sound;
    this.bullets = [];
    this.zaps = [];    // chain lightning, drawn for a moment
    this.later = [];   // [{t, fn}] work for a following frame (block combos)
    this.flashes = []; // explosion light
    this.t = 0;
    Guns.current = this; // the event's guns, for block cards (blocks.js)
  }

  /** Per frame, per shooter. Returns true when a shot fired. */
  trigger(owner, gs, g, held, ang, x, y, dt) {
    gs.cd -= dt; gs.since += dt;
    if (owner && typeof owner === 'object') owner.aim = ang; // the arm follows the aim in every event
    if (gs.reloadT > 0) {
      gs.reloadT -= dt;
      if (gs.reloadT <= 0) gs.ammo = g.ammo;
    } else if (gs.ammo < g.ammo && gs.since > g.reload + 0.5) gs.ammo = g.ammo;
    if (gs.burstLeft > 0) {
      gs.burstT -= dt;
      if (gs.burstT <= 0) { this.spawn(owner, x, y, ang, g); gs.burstLeft -= 1; gs.burstT = 0.07; }
    }
    if (gs.echoes && gs.echoes.length) { // ECHO SHOT: the shot again, from where it was fired
      for (let i = gs.echoes.length - 1; i >= 0; i--) {
        const e = gs.echoes[i];
        e.t -= dt;
        if (e.t > 0) continue;
        gs.echoes.splice(i, 1);
        let a = e.ang;
        if (g.cx && g.cx.mirrorhall) { const tg = this.nearestTarget({ x: e.x, y: e.y }, owner); if (tg) { const [tx, ty] = center(tg); a = Math.atan2(ty - e.y, tx - e.x); } }
        this.spawn(owner, e.x, e.y, a, g, { echo: true });
      }
    }
    if (held && gs.cd <= 0 && gs.ammo > 0 && gs.reloadT <= 0) {
      this.spawn(owner, x, y, ang, g);
      if (!gs.echoes) gs.echoes = [];
      for (let k = 1; k <= (g.echo || 0); k++) gs.echoes.push({ t: ECHO_GAP * k, x, y, ang });
      if (owner && typeof owner === 'object') owner.recoilAt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      gs.burstLeft = g.burst - 1; gs.burstT = 0.07;
      gs.ammo -= 1; gs.cd = g.delay; gs.since = 0;
      if (gs.ammo <= 0) gs.reloadT = g.reload;
      return true;
    }
    return false;
  }
  reloadFrac(gs, g) { return gs.reloadT > 0 ? 1 - gs.reloadT / g.reload : 1; }

  /**
   * Fire one shot (all its pellets). opts.single: exactly one bullet, no
   * spread (block bursts); opts.echo: an echo (drawn paler); opts.mini: shards.
   */
  spawn(owner, x, y, ang, g, opts = {}) {
    const tw = this.w.twist || {};
    const n = opts.single ? 1 : g.pellets;
    // PERFECT PARRY: the next shots hit harder
    let boost = 1;
    if (!opts.mini && owner && owner.parryShots > 0) { owner.parryShots -= 1; boost = 1.6; }
    for (let i = 0; i < n; i++) {
      let bg = g;
      let tint = null;
      if (g.chaos && !opts.mini) { // a random extra power per bullet (more cards, more powers)
        bg = { ...g };
        for (let k = 0; k < g.chaos; k++) { const j = Math.floor(Math.random() * CHAOS.length); CHAOS[j](bg); tint = CHAOS_COLS[j]; }
      }
      const a = ang + (opts.single ? 0 : rand(-g.sway, g.sway) + (n > 1 ? (i / (n - 1) - 0.5) * g.spread * Math.min(n, 6) : 0) + rand(-0.025, 0.025) * (n > 1 ? 3 : 1));
      const sp = (opts.speed || g.speed) * (tw.bulletSpeed || 1) * (n > 1 ? rand(0.88, 1.06) : 1);
      this.add({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner, g: bg,
        r: (opts.mini ? 0.6 : 1) * g.size * (boost > 1 ? 1.3 : 1), dmg: g.dmg * boost * (opts.mini ? 0.35 : 1) * (opts.echo ? 0.8 : 1),
        bounces: bg.bounces + (tw.bounces || 0), split: bg.split, pierce: bg.pierce || 0,
        age: 0, life: 4.5, trail: [], hits: new Set(), stuck: false, fuse: 0, echo: !!opts.echo, mini: !!opts.mini, tint, boost, seen: 0,
      });
    }
    if (owner && !opts.mini) this.fx.burst(x + Math.cos(ang) * 4, y + Math.sin(ang) * 4, 4, '#fff6a8', { speed: 60, life: 0.15, angle: ang, spread: 0.8 });
    if (!opts.mini && !opts.quiet) this.sound.sfx('shoot');
  }
  /** Add a bullet, dropping the oldest flying one if the screen is full. */
  add(b) {
    if (this.bullets.length >= MAX_BULLETS) {
      const i = this.bullets.findIndex((q) => !q.stuck);
      this.bullets.splice(i < 0 ? 0 : i, 1);
    }
    this.bullets.push(b);
    return b;
  }

  nearestTarget(b, exclude, skip = null) {
    let best = null, bd = 1e9;
    for (const t of this.w.targets()) {
      if (t.owner && t.owner === exclude) continue;
      if (skip && skip(t)) continue;
      const [tx, ty] = center(t);
      const d = Math.hypot(tx - b.x, ty - b.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  update(dt) {
    this.t += dt;
    for (let i = this.later.length - 1; i >= 0; i--) { const l = this.later[i]; l.t -= dt; if (l.t <= 0) { this.later.splice(i, 1); l.fn(); } }
    for (let i = this.zaps.length - 1; i >= 0; i--) { this.zaps[i].life -= dt; if (this.zaps[i].life <= 0) this.zaps.splice(i, 1); }
    for (let i = this.flashes.length - 1; i >= 0; i--) { this.flashes[i].life -= dt; if (this.flashes[i].life <= 0) this.flashes.splice(i, 1); }
    const tw = this.w.twist || {};
    const B = this.bullets;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      if (!b) continue;
      const g = b.g;
      const cx = g.cx || NOCX;
      if (b.frozenT > 0) { // STASIS FIELD
        b.frozenT -= dt;
        if (b.frozenT > 0) continue;
        if (b.thawTo) { // TIME LOCK: it's yours now, and it hunts
          b.owner = b.thawTo; b.thawTo = null; b.hits.clear();
          const tg = this.nearestTarget(b, b.owner);
          const sp = Math.max(200, Math.hypot(b.vx, b.vy));
          const a = tg ? Math.atan2(center(tg)[1] - b.y, center(tg)[0] - b.x) : Math.atan2(b.vy, b.vx) + Math.PI;
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.age = 0;
          this.fx.ring(b.x, b.y, 6, '#9fd3ff', 0.25);
        } else { this.fx.burst(b.x, b.y, 4, '#9fd3ff', { speed: 40, life: 0.3 }); B.splice(i, 1); continue; }
      }
      if (b.stuck) {
        b.fuse -= dt;
        if (cx.minefield && b.fuse > 0.12) { // MINEFIELD: wait for someone to walk by
          for (const t of this.w.targets()) {
            if (t.owner === b.owner) continue;
            const [tx, ty] = center(t);
            if (Math.hypot(tx - b.x, ty - b.y) < 26) { b.fuse = 0.12; this.sound.sfx('warn'); break; }
          }
        }
        if (b.fuse <= 0) { B.splice(i, 1); this.blast(b.x, b.y, this.blastR(b, Math.max(22, g.explode || 0)), b.owner, b.dmg * 0.9, null, g); }
        continue;
      }
      b.age += dt;
      if (b.age > b.life) { B.splice(i, 1); this.finish(b, b.x, b.y, true); continue; }
      b.trail.push([b.x, b.y]); if (b.trail.length > 9) b.trail.shift();
      if (g.accel) {
        const k = 1 + g.accel * dt;
        if (Math.hypot(b.vx, b.vy) < 640) { b.vx *= k; b.vy *= k; }
        b.dmg *= 1 + g.accel * 0.7 * dt;
        b.r = Math.min(g.size * 2.2, b.r * (1 + g.accel * 0.25 * dt));
      }
      if (g.grow) { // GROWTH SPURT: size and damage grow together, up to 4x
        const cap = g.size * 4;
        if (b.r < cap) { const k = Math.min(cap / b.r, 1 + g.grow * dt); b.r *= k; b.dmg *= k; }
      }
      const [ax, ay] = this.w.accel(b.x, b.y);
      b.vx += ax * g.grav * dt; b.vy += ay * g.grav * dt;
      const homing = g.homing + (cx.poltergeist ? 0.9 : 0);
      if (homing) { const t = this.nearestTarget(b, b.owner); if (t) steer(b, ...center(t), 2.6 * homing * dt); }
      for (const t of this.w.targets()) {
        if (!t.owner || t.owner === b.owner || !t.owner.st || !t.owner.st.magnet) continue;
        const [tx, ty] = center(t);
        if (Math.hypot(tx - b.x, ty - b.y) < 70) steer(b, tx, ty, 1.5 * t.owner.st.magnet * dt);
      }
      if (g.boomerang && b.age > 0.5 && b.owner && b.owner.pos) {
        const [ox, oy] = b.owner.pos();
        steer(b, ox, oy, 7 * dt);
        if (cx.slingshot && !b.slung) { b.slung = true; b.vx *= 2; b.vy *= 2; b.dmg *= 1.6; b.hits.clear(); this.fx.ring(b.x, b.y, 6, '#ffd84a', 0.2); } // SLINGSHOT
        if (b.age > 0.7 && Math.hypot(ox - b.x, oy - b.y) < 8) { B.splice(i, 1); continue; }
      }
      if (g.wave) { const a = Math.cos(b.age * 13) * g.wave * 9 * dt; const c = Math.cos(a), s = Math.sin(a); [b.vx, b.vy] = [b.vx * c - b.vy * s, b.vx * s + b.vy * c]; }
      if (g.sneak) { // SNEAKY: shows up only near a rival
        b.seen = Math.max(0, b.seen - dt);
        for (const t of this.w.targets()) {
          if (t.owner === b.owner) continue;
          const [tx, ty] = center(t);
          if (Math.hypot(tx - b.x, ty - b.y) < 30) { b.seen = 0.25; break; }
        }
      }

      const sp = Math.hypot(b.vx, b.vy);
      const steps = clamp(Math.ceil((sp * dt) / 3), 1, 10);
      const sdt = dt / steps;
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        const px = b.x, py = b.y;
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        if (this.w.onPaint) this.w.onPaint(b, b.x, b.y, false);
        // solids
        if (!g.ghost) {
          const sol = this.w.solidAt(b.x, b.y);
          if (sol) { dead = this.collide(b, px, py, sol); if (dead || b.stuck) break; }
        }
        // arena edges
        const W = this.w.bounds;
        const out = b.x < W.x0 ? 'left' : b.x > W.x1 ? 'right' : b.y < W.y0 ? 'top' : b.y > W.y1 ? 'bottom' : null;
        if (out) {
          if (tw.wrap && !W.noWrap) {
            if (out === 'left') b.x = W.x1; else if (out === 'right') b.x = W.x0; else if (out === 'top') b.y = W.y1 - 1; else b.y = W.y0 + 1;
          } else if (!W.open[out]) {
            if (b.bounces > 0) {
              if (out === 'left' || out === 'right') { b.vx = -b.vx; b.x = clamp(b.x, W.x0, W.x1); } else { b.vy = -b.vy; b.y = clamp(b.y, W.y0, W.y1); }
              this.bounced(b);
            } else { dead = true; this.finish(b, px, py); }
          } else if (b.x < W.x0 - 60 || b.x > W.x1 + 60 || b.y < W.y0 - 140 || b.y > W.y1 + 40) dead = true;
          if (dead) break;
        }
        // targets
        for (const t of this.w.targets()) {
          if (t.owner && t.owner === b.owner && !(g.boomerang && b.age > 0.5)) continue;
          if (t.owner === b.owner) continue;
          if (b.hits.has(t.ref)) continue;
          if (!touches(t, b.x, b.y, b.r + 0.5)) continue;
          const sp2 = Math.hypot(b.vx, b.vy) || 1;
          let dmg = b.dmg;
          if (cx.flashfreeze && t.owner && t.owner.slowT > 0) dmg *= 1.6; // FLASH FREEZE
          const res = this.w.onHit(t.ref, { kind: 'bullet', dmg, dx: b.vx / sp2, dy: b.vy / sp2, g, owner: b.owner, bullet: b });
          if (res === 'none') continue;
          if (res === 'reflect') {
            b.vx = -b.vx; b.vy = -Math.abs(b.vy) * 0.6 - 30; b.owner = t.owner; b.hits.clear();
            this.fx.ring(b.x, b.y, 10, '#5affd9'); this.fx.popup('REFLECT!', b.x, b.y - 8, '#5affd9', 1);
            const o = t.owner;
            if (o && o.st && o.st.cx && o.st.cx.sender) { b.bounces += 3; b.dmg *= 2; b.r *= 1.3; this.fx.popup('RETURN TO SENDER', b.x, b.y - 16, '#ffd84a', 1); } // RETURN TO SENDER
            this.parryCheck(o);
            break;
          }
          b.hits.add(t.ref);
          if (res === 'blocked') {
            this.parryCheck(t.owner);
            if (g.explode) this.blast(b.x, b.y, this.blastR(b, g.explode), b.owner, b.dmg * 0.5, t.ref, g);
            dead = true; break;
          }
          if (g.chain) this.chain(b, t, dmg);
          if (g.explode) this.blast(b.x, b.y, this.blastR(b, g.explode), b.owner, b.dmg * 0.5, t.ref, g);
          if (this.w.onPaint) this.w.onPaint(b, b.x, b.y, true);
          if (b.pierce > 0) { b.pierce -= 1; this.fx.burst(b.x, b.y, 4, '#ffffff', { speed: 70, life: 0.2, angle: Math.atan2(b.vy, b.vx), spread: 0.6 }); break; } // DRILL BIT
          if (!g.boomerang) { dead = true; if (g.shrapnel) this.shatter(b, b.x, b.y); }
          break;
        }
      }
      if (dead) { const k = B.indexOf(b); if (k >= 0) B.splice(k, 1); }
    }
  }

  /** PERFECT PARRY: a hit that lands in the first moment of a block. */
  parryCheck(o) {
    if (!o || !o.st || !o.st.parry || o.blockAt == null || o.parriedAt === o.blockAt) return;
    if (this.t - o.blockAt > 0.14 + 0.03 * o.st.parry) return;
    o.parriedAt = o.blockAt;
    o.blockCd = 0;
    o.parryShots = 3 * o.st.parry;
    const [x, y] = posOf(o);
    this.fx.ring(x, y, 20, '#ffffff', 0.3); this.fx.ring(x, y, 30, '#ffd84a', 0.45);
    this.fx.popup('PERFECT!', x, y - 16, '#ffd84a', 2); this.fx.stop(0.06);
    this.sound.sfx('lock');
    if (o.st.cx && o.st.cx.overclock && o.gs) { o.gs.ammo = o.st.gun.ammo * 2; o.gs.reloadT = 0; } // OVERCLOCK
    if (o.st.cx && o.st.cx.counter) this.ring(o, x, y, 8 + 4 * o.st.blockBurst); // COUNTERSTRIKE
  }

  /** Fire `n` of o's bullets in a ring (BURST BLOCK and friends). `mod(g)` may change the gun. */
  ring(o, x, y, n, mod = null) {
    const g = mod ? mod(o.st.gun) : o.st.gun;
    for (let k = 0; k < n; k++) this.spawn(o, x, y, (k / n) * TAU + this.t * 3, g, { single: true, quiet: k > 0, speed: Math.max(170, g.speed) });
  }

  /** CHAIN ZAP: lightning to the nearest other rival(s). */
  chain(b, first, dmg) {
    const hit = new Set([first.ref]);
    let from = center(first);
    for (let k = 0; k < b.g.chain; k++) {
      const t = this.nearestTarget({ x: from[0], y: from[1] }, b.owner, (q) => hit.has(q.ref));
      if (!t) break;
      const to = center(t);
      const d = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      if (d > 80) break;
      hit.add(t.ref);
      this.bolt(from[0], from[1], to[0], to[1], b.owner ? SEAT_COLORS[b.owner.idx] : '#9fd3ff');
      this.w.onHit(t.ref, { kind: 'zap', dmg: dmg * 0.5, dx: (to[0] - from[0]) / d, dy: (to[1] - from[1]) / d, g: { ...b.g, knock: 0.4, explode: 0 }, owner: b.owner });
      from = to;
    }
  }
  bolt(x1, y1, x2, y2, col) {
    const pts = [[x1, y1]];
    const n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 8));
    const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1;
    for (let k = 1; k < n; k++) { const f = k / n, o = rand(-5, 5); pts.push([x1 + (x2 - x1) * f + (nx / nl) * o, y1 + (y2 - y1) * f + (ny / nl) * o]); }
    pts.push([x2, y2]);
    this.zaps.push({ pts, col, life: 0.18 });
    this.sound.sfx('zap');
  }

  /** SHRAPNEL: a bullet that stops breaks into shards. */
  shatter(b, x, y) {
    if (b.mini || !b.g.shrapnel) return;
    const n = 3 * b.g.shrapnel;
    const a0 = Math.atan2(-b.vy, -b.vx);
    const mg = { ...b.g, shrapnel: 0, split: 0, explode: 0, chaos: 0, echo: 0, homing: 0, grow: 0, sticky: 0, bounces: 0 };
    for (let k = 0; k < n; k++) this.spawn(b.owner, x, y, a0 + (k / n - 0.5) * 2.2 + rand(-0.2, 0.2), mg, { single: true, mini: true, speed: 190 });
  }
  /** Explosion radius; SUPERNOVA scales it with bullet size. */
  blastR(b, r) {
    if (b.g.cx && b.g.cx.supernova) return Math.min(90, r * 1.5 * Math.max(1, b.r / Math.max(0.5, b.g.size)));
    return r;
  }

  /** Bullet met a solid. Returns true when the bullet is used up. */
  collide(b, px, py, sol) {
    if (b.bounces > 0) {
      if (sol.circle) {
        const c = sol.circle;
        let nx = b.x - c.x, ny = b.y - c.y; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
        const dot = b.vx * nx + b.vy * ny;
        b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
        b.x = c.x + nx * (c.r + 1); b.y = c.y + ny * (c.r + 1);
      } else {
        const r = sol.rect;
        const wasOutX = px < r.x || px > r.x + r.w;
        if (wasOutX) { b.vx = -b.vx; b.x = px; } else { b.vy = -b.vy; b.y = py; }
      }
      this.bounced(b);
      return false;
    }
    if (b.g.sticky) {
      b.stuck = true; b.fuse = b.g.cx && b.g.cx.minefield ? 4 : 1.0; b.x = px; b.y = py; b.vx = b.vy = 0;
      this.sound.sfx('bump');
      return false;
    }
    this.finish(b, px, py);
    return true;
  }
  /** A bullet ends against a wall, an edge or old age. */
  finish(b, px, py, quiet = false) {
    if (!quiet) this.fx.burst(px, py, 5, '#cfc8ff', { speed: 50, life: 0.25 });
    if (b.g.explode) this.blast(px, py, this.blastR(b, b.g.explode), b.owner, b.dmg * 0.6, null, b.g);
    if (this.w.onPaint) this.w.onPaint(b, px, py, true);
    if (b.g.shrapnel) this.shatter(b, px, py);
  }
  end(b, px, py) { this.finish(b, px, py); }
  bounced(b) {
    b.bounces -= 1;
    b.dmg *= b.g.bounceDmg;
    const cx = b.g.cx || NOCX;
    b.seen = 0.15;
    if (b.g.bounceDmg > 1) b.r = Math.min(b.g.size * 2.5, b.r * 1.12);
    this.fx.burst(b.x, b.y, 3, '#7dff8a', { speed: 40, life: 0.2 });
    if (b.split > 0) {
      b.split -= 1;
      const a = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy);
      const offs = cx.fractal ? [0.5, -0.5, 0] : [0.4, -0.4]; // FRACTAL: threes
      const r = cx.mitosis ? Math.max(b.r, b.g.size * 1.4) : b.r; // MITOSIS: born full size
      for (const off of offs.slice(1)) this.add({ ...b, r, vx: Math.cos(a + off) * sp, vy: Math.sin(a + off) * sp, trail: [], hits: new Set(b.hits) });
      b.r = r; b.vx = Math.cos(a + offs[0]) * sp; b.vy = Math.sin(a + offs[0]) * sp;
    }
    if (b.g.retarget || cx.pinwiz) {
      const t = this.nearestTarget(b, b.owner);
      if (t) { const [tx, ty] = center(t); const sp = Math.hypot(b.vx, b.vy); const a = Math.atan2(ty - b.y, tx - b.x); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; this.fx.ring(b.x, b.y, 5, '#ff5fd2', 0.2); }
    }
    if (cx.pinwiz) { const k = Math.hypot(b.vx, b.vy) < 600 ? 1.2 : 1; b.vx *= k; b.vy *= k; b.dmg *= 1.15; } // PINBALL WIZARD
    if (cx.stormcell) { // STORM CELL: every bounce zaps
      const t = this.nearestTarget(b, b.owner);
      if (t) {
        const [tx, ty] = center(t);
        const d = Math.hypot(tx - b.x, ty - b.y);
        if (d < 60) { this.bolt(b.x, b.y, tx, ty, b.owner ? SEAT_COLORS[b.owner.idx] : '#9fd3ff'); this.w.onHit(t.ref, { kind: 'zap', dmg: b.dmg * 0.4, dx: (tx - b.x) / (d || 1), dy: (ty - b.y) / (d || 1), g: { ...b.g, knock: 0.3 }, owner: b.owner }); }
      }
    }
  }
  /** Explosion: hits every target in range except `skip`. */
  blast(x, y, r, owner, dmg, skip = null, g = null) {
    this.fx.ring(x, y, r, '#ffd84a', 0.3);
    this.fx.ring(x, y, r * 0.6, '#ffffff', 0.18);
    this.fx.burst(x, y, 14 + Math.min(20, Math.round(r * 0.3)), '#ffd84a', { speed: 110 + r * 2, life: 0.35 });
    this.fx.burst(x, y, 8, '#ff7a2e', { speed: 70, life: 0.45, size: 2 });
    this.fx.shake(Math.min(0.5, 0.18 + r / 200)); this.sound.sfx('boom');
    this.flashes.push({ x, y, r: r * 1.4, life: 0.22, max: 0.22 });
    for (const t of this.w.targets()) {
      if (t.ref === skip || (t.owner && t.owner === owner)) continue;
      const [tx, ty] = center(t);
      const d = Math.hypot(tx - x, ty - y);
      if (d > r + (t.r || 5)) continue;
      this.w.onHit(t.ref, { kind: 'blast', dmg, dx: (tx - x) / (d || 1), dy: (ty - y) / (d || 1) - 0.4, g: owner && owner.st ? owner.st.gun : { knock: 1 }, owner });
    }
    if (this.w.onBlast) this.w.onBlast(x, y, r, owner);
    if (g && g.cx && g.cx.cluster && !g.bomblet) { // CLUSTER STORM: bomblets
      const bg = { ...g, bomblet: true, explode: Math.max(12, (g.explode || 20) * 0.6), shrapnel: 0, split: 0, chaos: 0, echo: 0, bounces: 0, sticky: 0, homing: 0 };
      for (let k = 0; k < 4; k++) this.spawn(owner, x, y - 2, -Math.PI / 2 + (k - 1.5) * 0.55 + rand(-0.15, 0.15), bg, { single: true, mini: true, speed: 150 });
    }
  }

  draw(gfx) {
    for (const f of this.flashes) gfx.glow(f.x, f.y, f.r, '#ffb040', (f.life / f.max) * 0.45); // explosion light
    for (const b of this.bullets) {
      const col = b.owner ? SEAT_COLORS[b.owner.idx] : '#ffffff';
      if (b.stuck) {
        const on = Math.floor(b.fuse * (b.fuse < 1 ? 12 : 3)) % 2;
        gfx.circle(b.x, b.y, b.r + 1, on ? '#ff3a3a' : col);
        gfx.glow(b.x, b.y, 6 + b.r * 2, '#ff3a3a', on ? 0.7 : 0.25);
        if (b.fuse < 1) gfx.ring(b.x, b.y, 22 * (1 - b.fuse) + 4, '#ff3a3a55');
        continue;
      }
      let vis = 1;
      if (b.g.sneak && b.age > 0.18 && b.seen <= 0) vis = 0.07; // SNEAKY: a faint shimmer
      if (b.frozenT > 0) {
        gfx.alpha(vis); gfx.circle(b.x, b.y, b.r + 1, '#bfe8ff'); gfx.ring(b.x, b.y, b.r + 2.5, '#ffffff'); gfx.alpha(1);
        gfx.glow(b.x, b.y, 5 + b.r * 2, '#9fd3ff', 0.5 * vis);
        continue;
      }
      const a = (b.g.ghost ? 0.6 : 1) * (b.echo ? 0.7 : 1) * vis;
      // trail: a glowing streak in the shooter's colour
      gfx.alpha(a * 0.9);
      gfx.streak([...b.trail, [b.x, b.y]], Math.max(1.2, b.r * 1.5), col);
      gfx.alpha(1);
      if (!b.mini) gfx.glow(b.x, b.y, 3 + b.r * 2.4, col, 0.38 * a * (b.boost > 1 ? 1.6 : 1));
      gfx.alpha(a);
      gfx.circle(b.x, b.y, b.r + 0.6, b.tint || col);
      gfx.circle(b.x, b.y, Math.max(0.6, b.r * 0.5), b.g.explode ? '#ffd84a' : '#ffffff');
      if (b.g.explode && b.r > 1.5) gfx.ring(b.x, b.y, b.r + 1.4, '#ffd84a');
      gfx.alpha(1);
    }
    for (const z of this.zaps) {
      const k = z.life / 0.18;
      gfx.alpha(k); gfx.streak(z.pts, 1.4, '#ffffff'); gfx.alpha(1);
      for (const [x, y] of z.pts) gfx.glow(x, y, 6, z.col, 0.3 * k);
    }
  }
}

function center(t) { return t.rect ? [t.rect.x + t.rect.w / 2, t.rect.y + t.rect.h / 2] : [t.x, t.y]; }
function touches(t, x, y, r) { return t.rect ? circleRect(x, y, r, t.rect) : Math.hypot(t.x - x, t.y - y) < r + t.r; }
function steer(b, tx, ty, amt) {
  const a = Math.atan2(b.vy, b.vx), want = Math.atan2(ty - b.y, tx - b.x);
  const na = a + clamp(angleDiff(a, want), -amt, amt);
  const sp = Math.hypot(b.vx, b.vy);
  b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
}
/** Where a player is, whatever the event keeps (pos(), a body, or x/y). */
export function posOf(p) {
  if (p.pos) return p.pos();
  if (p.b) return [p.b.x + p.b.w / 2, p.b.y + p.b.h / 2];
  if (p.body) return [p.body.x, p.body.y];
  return [p.x || 0, p.y || 0];
}

/** Health side effects of a hit (for games with HP). */
export function hitEffects(victim, owner, dmg, g) {
  if (g.poison) victim.poison = { dps: (dmg * 0.35 * g.poison) / 3, t: 3, owner, heal: !!(g.cx && g.cx.bloodmoon) };
  if (g.frost) victim.slowT = 1.5 * g.frost;
  if (g.lifesteal && owner && owner.maxHp) owner.hp = Math.min(owner.maxHp, owner.hp + dmg * g.lifesteal);
}
/** Tick poison; returns damage this frame. BLOOD MOON: poison heals the poisoner. */
export function tickStatus(p, dt) {
  if (p.slowT > 0) p.slowT -= dt;
  if (p.poison && p.poison.t > 0) {
    p.poison.t -= dt;
    const d = p.poison.dps * dt;
    const o = p.poison.owner;
    if (p.poison.heal && o && o.maxHp && !o.dead) o.hp = Math.min(o.maxHp, o.hp + d);
    return d;
  }
  return 0;
}
export const TAU2 = TAU;
