// ROUNDS-style guns shared by every minigame with a gun.
// Bullets are physical: gravity (from the game), bounces off solids, round
// planets and arena edges, split, retarget, home in, stick, explode, return.
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

export function newGunState(g) {
  return { ammo: g.ammo, cd: 0, reloadT: 0, since: 9, burstLeft: 0, burstT: 0 };
}

export class Guns {
  constructor(world, fx, sound) {
    this.w = world; this.fx = fx; this.sound = sound;
    this.bullets = [];
  }

  /** Per frame, per shooter. Returns true when a shot fired. */
  trigger(owner, gs, g, held, ang, x, y, dt) {
    gs.cd -= dt; gs.since += dt;
    if (gs.reloadT > 0) {
      gs.reloadT -= dt;
      if (gs.reloadT <= 0) gs.ammo = g.ammo;
    } else if (gs.ammo < g.ammo && gs.since > g.reload + 0.5) gs.ammo = g.ammo;
    if (gs.burstLeft > 0) {
      gs.burstT -= dt;
      if (gs.burstT <= 0) { this.spawn(owner, x, y, ang, g); gs.burstLeft -= 1; gs.burstT = 0.07; }
    }
    if (held && gs.cd <= 0 && gs.ammo > 0 && gs.reloadT <= 0) {
      this.spawn(owner, x, y, ang, g);
      gs.burstLeft = g.burst - 1; gs.burstT = 0.07;
      gs.ammo -= 1; gs.cd = g.delay; gs.since = 0;
      if (gs.ammo <= 0) gs.reloadT = g.reload;
      return true;
    }
    return false;
  }
  reloadFrac(gs, g) { return gs.reloadT > 0 ? 1 - gs.reloadT / g.reload : 1; }

  spawn(owner, x, y, ang, g) {
    const tw = this.w.twist || {};
    const n = g.pellets;
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-g.sway, g.sway) + (n > 1 ? (i / (n - 1) - 0.5) * g.spread * Math.min(n, 6) : 0) + rand(-0.025, 0.025) * (n > 1 ? 3 : 1);
      const sp = g.speed * (tw.bulletSpeed || 1) * (n > 1 ? rand(0.88, 1.06) : 1);
      this.bullets.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner, g,
        r: g.size, dmg: g.dmg, bounces: g.bounces + (tw.bounces || 0), split: g.split,
        age: 0, life: 4.5, trail: [], hits: new Set(), stuck: false, fuse: 0,
      });
    }
    if (owner) this.fx.burst(x + Math.cos(ang) * 4, y + Math.sin(ang) * 4, 4, '#fff6a8', { speed: 60, life: 0.15, angle: ang, spread: 0.8 });
    this.sound.sfx('shoot');
  }

  nearestTarget(b, exclude) {
    let best = null, bd = 1e9;
    for (const t of this.w.targets()) {
      if (t.owner && t.owner === exclude) continue;
      const [tx, ty] = center(t);
      const d = Math.hypot(tx - b.x, ty - b.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  update(dt) {
    const tw = this.w.twist || {};
    const B = this.bullets;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      const g = b.g;
      if (b.stuck) {
        b.fuse -= dt;
        if (b.fuse <= 0) { this.blast(b.x, b.y, Math.max(22, g.explode || 0), b.owner, b.dmg * 0.9); B.splice(i, 1); }
        continue;
      }
      b.age += dt;
      if (b.age > b.life) { if (g.explode) this.blast(b.x, b.y, g.explode, b.owner, b.dmg * 0.6); B.splice(i, 1); continue; }
      b.trail.push([b.x, b.y]); if (b.trail.length > 5) b.trail.shift();
      if (g.accel) {
        const k = 1 + g.accel * dt;
        if (Math.hypot(b.vx, b.vy) < 640) { b.vx *= k; b.vy *= k; }
        b.dmg *= 1 + g.accel * 0.7 * dt;
        b.r = Math.min(g.size * 2.2, b.r * (1 + g.accel * 0.25 * dt));
      }
      const [ax, ay] = this.w.accel(b.x, b.y);
      b.vx += ax * g.grav * dt; b.vy += ay * g.grav * dt;
      if (g.homing) { const t = this.nearestTarget(b, b.owner); if (t) steer(b, ...center(t), 2.6 * g.homing * dt); }
      for (const t of this.w.targets()) {
        if (!t.owner || t.owner === b.owner || !t.owner.st || !t.owner.st.magnet) continue;
        const [tx, ty] = center(t);
        if (Math.hypot(tx - b.x, ty - b.y) < 70) steer(b, tx, ty, 1.5 * t.owner.st.magnet * dt);
      }
      if (g.boomerang && b.age > 0.5 && b.owner && b.owner.pos) {
        const [ox, oy] = b.owner.pos();
        steer(b, ox, oy, 7 * dt);
        if (b.age > 0.7 && Math.hypot(ox - b.x, oy - b.y) < 8) { B.splice(i, 1); continue; }
      }
      if (g.wave) { const a = Math.cos(b.age * 13) * g.wave * 9 * dt; const c = Math.cos(a), s = Math.sin(a); [b.vx, b.vy] = [b.vx * c - b.vy * s, b.vx * s + b.vy * c]; }

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
            } else { dead = true; this.end(b, px, py); }
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
          const res = this.w.onHit(t.ref, { kind: 'bullet', dmg: b.dmg, dx: b.vx / sp2, dy: b.vy / sp2, g, owner: b.owner, bullet: b });
          if (res === 'none') continue;
          if (res === 'reflect') {
            b.vx = -b.vx; b.vy = -Math.abs(b.vy) * 0.6 - 30; b.owner = t.owner; b.hits.clear();
            this.fx.ring(b.x, b.y, 10, '#5affd9'); this.fx.popup('REFLECT!', b.x, b.y - 8, '#5affd9', 1);
            break;
          }
          b.hits.add(t.ref);
          if (g.explode) this.blast(b.x, b.y, g.explode, b.owner, b.dmg * 0.5, t.ref);
          if (this.w.onPaint) this.w.onPaint(b, b.x, b.y, true);
          if (!g.boomerang) { dead = true; }
          break;
        }
      }
      if (dead) B.splice(i, 1);
    }
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
      b.stuck = true; b.fuse = 1.0; b.x = px; b.y = py; b.vx = b.vy = 0;
      this.sound.sfx('bump');
      return false;
    }
    this.end(b, px, py);
    return true;
  }
  end(b, px, py) {
    this.fx.burst(px, py, 5, '#cfc8ff', { speed: 50, life: 0.25 });
    if (b.g.explode) this.blast(px, py, b.g.explode, b.owner, b.dmg * 0.6);
    if (this.w.onPaint) this.w.onPaint(b, px, py, true);
  }
  bounced(b) {
    b.bounces -= 1;
    b.dmg *= b.g.bounceDmg;
    if (b.g.bounceDmg > 1) b.r = Math.min(b.g.size * 2.5, b.r * 1.12);
    this.fx.burst(b.x, b.y, 3, '#7dff8a', { speed: 40, life: 0.2 });
    if (b.split > 0) {
      b.split -= 1;
      const a = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy);
      this.bullets.push({ ...b, vx: Math.cos(a + 0.4) * sp, vy: Math.sin(a + 0.4) * sp, trail: [], hits: new Set(b.hits) });
      b.vx = Math.cos(a - 0.4) * sp; b.vy = Math.sin(a - 0.4) * sp;
    }
    if (b.g.retarget) {
      const t = this.nearestTarget(b, b.owner);
      if (t) { const [tx, ty] = center(t); const sp = Math.hypot(b.vx, b.vy); const a = Math.atan2(ty - b.y, tx - b.x); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; this.fx.ring(b.x, b.y, 5, '#ff5fd2', 0.2); }
    }
  }
  /** Explosion: hits every target in range except `skip`. */
  blast(x, y, r, owner, dmg, skip = null) {
    this.fx.ring(x, y, r, '#ffd84a', 0.3);
    this.fx.burst(x, y, 14, '#ffd84a', { speed: 110, life: 0.35 });
    this.fx.burst(x, y, 6, '#ff7a2e', { speed: 70, life: 0.4 });
    this.fx.shake(0.22); this.sound.sfx('boom');
    for (const t of this.w.targets()) {
      if (t.ref === skip || (t.owner && t.owner === owner)) continue;
      const [tx, ty] = center(t);
      const d = Math.hypot(tx - x, ty - y);
      if (d > r + (t.r || 5)) continue;
      this.w.onHit(t.ref, { kind: 'blast', dmg, dx: (tx - x) / (d || 1), dy: (ty - y) / (d || 1) - 0.4, g: owner && owner.st ? owner.st.gun : { knock: 1 }, owner });
    }
    if (this.w.onBlast) this.w.onBlast(x, y, r, owner);
  }

  draw(gfx) {
    for (const b of this.bullets) {
      const col = b.owner ? SEAT_COLORS[b.owner.idx] : '#ffffff';
      if (b.stuck) {
        const on = Math.floor(b.fuse * 12) % 2;
        gfx.circle(b.x, b.y, b.r + 1, on ? '#ff3a3a' : col);
        gfx.ring(b.x, b.y, 22 * (1 - b.fuse) + 4, '#ff3a3a55');
        continue;
      }
      if (b.g.ghost) gfx.alpha(0.6);
      b.trail.forEach(([x, y], k) => { gfx.alpha((b.g.ghost ? 0.4 : 1) * (0.12 + k * 0.12)); gfx.rect(x - b.r / 2, y - b.r / 2, Math.max(1, b.r), Math.max(1, b.r), col); });
      gfx.alpha(b.g.ghost ? 0.6 : 1);
      gfx.circle(b.x, b.y, b.r + 0.4, col);
      gfx.rect(b.x - 0.5, b.y - 0.5, 1, 1, b.g.explode ? '#ffd84a' : '#fff');
      gfx.alpha(1);
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

/** Health side effects of a hit (for games with HP). */
export function hitEffects(victim, owner, dmg, g) {
  if (g.poison) victim.poison = { dps: (dmg * 0.35 * g.poison) / 3, t: 3, owner };
  if (g.frost) victim.slowT = 1.5 * g.frost;
  if (g.lifesteal && owner && owner.maxHp) owner.hp = Math.min(owner.maxHp, owner.hp + dmg * g.lifesteal);
}
/** Tick poison; returns damage this frame. */
export function tickStatus(p, dt) {
  if (p.slowT > 0) p.slowT -= dt;
  if (p.poison && p.poison.t > 0) { p.poison.t -= dt; return p.poison.dps * dt; }
  return 0;
}
export const TAU2 = TAU;
