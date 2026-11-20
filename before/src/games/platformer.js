// Shared side-view physics for Ricochet Rooftop and Coin Storm.
import { approach, overlap } from '../engine/util.js';

export const GRAV = 560;

export function makeBody(x, y, w, h) {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, ground: null, coyote: 0, buffer: 0, jumps: 1, dropT: 0, stun: 0, hitWallX: 0, wallSpeed: 0, squash: 0, landed: false };
}

/** Move solids that follow a path; returns nothing, sets s.dx/s.dy. */
export function moveMovers(movers, t) {
  for (const m of movers) {
    const k = 0.5 - 0.5 * Math.cos((t / m.period) * Math.PI * 2);
    const nx = m.ax + (m.bx - m.ax) * k, ny = m.ay + (m.by - m.ay) * k;
    m.dx = nx - (m.x ?? nx); m.dy = ny - (m.y ?? ny);
    m.x = nx; m.y = ny;
  }
}

/** Apply stick and jump input. Returns 'jump' | 'djump' | null. */
export function platformControl(b, c, st, dt, env = null) {
  const max = 92 * st.speed * (b.slowT > 0 ? 0.55 : 1);
  const ice = env && env.ice;
  if (b.stun > 0) b.stun -= dt;
  else b.vx = approach(b.vx, c.mx * max, (b.onGround ? (ice ? 200 : 1100) : (ice ? 420 : 750)) * dt);
  if (b.onGround) { b.coyote = 0.1; b.jumps = st.airJumps ?? 1; } else b.coyote -= dt;
  b.buffer = c.jumpP ? 0.12 : b.buffer - dt;
  b.dropT -= dt;
  if (c.jumpP && c.my > 0.6 && b.onGround && b.ground && b.ground.oneWay) {
    b.dropT = 0.25; b.buffer = 0; return null;
  }
  let ev = null;
  if (b.buffer > 0) {
    const v = 232 * Math.sqrt(st.jump);
    if (b.coyote > 0) { b.vy = -v; ev = 'jump'; }
    else if (b.jumps > 0) { b.jumps -= 1; b.vy = -v * 0.88; ev = 'djump'; }
    if (ev) { b.coyote = 0; b.buffer = 0; b.squash = -0.8; b.onGround = false; }
  }
  b.gravMult = st.grav * (env ? env.grav * env.gy : 1) * (b.vy < 0 && !c.jump ? 2.1 : 1) * (c.my > 0.6 && b.vy > 0 ? 1.4 : 1);
  b.sideAcc = env ? GRAV * env.grav * env.gx * 0.6 + env.wind * 0.8 : 0;
  return ev;
}

/** Integrate and collide with solids and the arena sides. */
export function stepBody(b, dt, solids, worldW = 320) {
  // ride moving platforms
  if (b.ground && b.ground.dx !== undefined && !b.ground.gone) { b.x += b.ground.dx; b.y += Math.max(0, b.ground.dy || 0) ; }
  b.vy = Math.min(430, b.vy + GRAV * (b.gravMult ?? 1) * dt);
  b.squash *= Math.pow(0.0005, dt);

  if (b.sideAcc) b.vx += b.sideAcc * dt * (b.onGround ? 0.5 : 1);
  b.hitWallX = 0;
  b.x += b.vx * dt;
  for (const s of solids) {
    if (s.oneWay || s.gone) continue;
    if (!overlap(b, s)) continue;
    const fromLeft = b.x + b.w / 2 < s.x + s.w / 2;
    b.wallSpeed = b.vx;
    b.x = fromLeft ? s.x - b.w : s.x + s.w;
    b.hitWallX = fromLeft ? 1 : -1;
    b.vx = 0;
  }
  if (b.x < 0) { b.x = 0; b.hitWallX = -1; b.wallSpeed = b.vx; b.vx = 0; }
  if (b.x + b.w > worldW) { b.x = worldW - b.w; b.hitWallX = 1; b.wallSpeed = b.vx; b.vx = 0; }

  const prevBottom = b.y + b.h;
  b.y += b.vy * dt;
  const was = b.onGround;
  b.onGround = false; b.ground = null;
  for (const s of solids) {
    if (s.gone || !overlap(b, s)) continue;
    const lip = 3 + Math.abs(s.dy || 0);
    if (b.vy >= 0 && prevBottom <= s.y + lip) {
      if (s.oneWay && b.dropT > 0) continue;
      b.y = s.y - b.h; b.vy = 0; b.onGround = true; b.ground = s;
    } else if (!s.oneWay) {
      if (b.vy < 0) { b.y = s.y + s.h; b.vy = 0; }
    }
  }
  b.landed = !was && b.onGround;
  if (b.landed) b.squash = 0.7;
}
