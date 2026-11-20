// Game feel: particles, screen shake, hit-stop, slow motion, flashes, popups.
import { TAU, rand } from './util.js';

export const SHAKE_LEVELS = [
  { name: 'HIGH', k: 1 },
  { name: 'LOW', k: 0.45 },
  { name: 'OFF', k: 0 },
];

export const FLASH_GAP = 0.4;
export const FLASH_MAX = 0.25;

export class Fx {
  constructor() {
    this.parts = [];
    this.popups = [];
    this.rings = [];
    this.trauma = 0;
    this.shakeK = 1;
    this.hitstop = 0;
    this.slowT = 0;
    this.flashA = 0;
    this.flashCol = '#fff';
    this.lastFlash = -9;
    this.calm = false; // reduced motion: no flashes, no shake
    this.large = false; // large text: pop-ups never smaller than reading size
    this.t = 0;
  }
  reset() { this.parts.length = 0; this.popups.length = 0; this.rings.length = 0; this.trauma = 0; this.hitstop = 0; this.slowT = 0; this.flashA = 0; }

  burst(x, y, n, col, { speed = 70, life = 0.5, grav = 0, size = 1, angle = 0, spread = TAU, drag = 2 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * rand(0.3, 1);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * rand(0.6, 1.2), max: life, col, size, grav, drag });
    }
  }
  dust(x, y, col = '#c9a77a', n = 4) { this.burst(x, y, n, col, { speed: 30, life: 0.35, grav: -20, angle: -Math.PI / 2, spread: Math.PI }); }
  ring(x, y, r, col, life = 0.35) { this.rings.push({ x, y, r, col, life, max: life }); }
  shake(a) { if (!this.calm) this.trauma = Math.min(1, this.trauma + a); }
  stop(sec) { this.hitstop = Math.max(this.hitstop, sec); }
  slow(sec) { this.slowT = Math.max(this.slowT, sec); }
  /**
   * Full-screen flash, limited for photosensitivity (XAG 118): at most one
   * flash every FLASH_GAP seconds, never brighter than FLASH_MAX, and none at
   * all in reduced-motion mode.
   */
  flash(col = '#fff', a = 0.6) {
    if (this.calm) return;
    if (this.t - this.lastFlash < FLASH_GAP) return;
    this.lastFlash = this.t;
    this.flashCol = col; this.flashA = Math.max(this.flashA, Math.min(a, FLASH_MAX));
  }
  /**
   * A hit that matters, in one call (the shared game-feel kit). The freeze
   * grows with damage (35-100 ms), sparks fly the way the hit travelled, and a
   * small white ring marks the contact point. Games add their own sound.
   */
  impact(x, y, { dmg = 20, col = '#fff', dx = 0, dy = 0 } = {}) {
    this.stop(Math.min(0.1, 0.035 + dmg / 500));
    this.shake(0.12 + Math.min(0.3, dmg / 200));
    const a = dx || dy ? Math.atan2(dy, dx) : -Math.PI / 2;
    this.burst(x, y, 6, '#ffffff', { speed: 150, life: 0.22, angle: a, spread: 1.1, drag: 4 });
    this.burst(x, y, 7, col, { speed: 90, life: 0.4 });
    this.ring(x, y, 7 + Math.min(10, dmg / 5), '#ffffff', 0.16);
  }
  /** A knockout: the biggest moment in a fight, so the biggest effect. */
  ko(x, y, col) {
    this.burst(x, y, 34, col, { speed: 160, life: 0.8, size: 2 });
    this.burst(x, y, 14, '#fff', { speed: 120, life: 0.5 });
    this.ring(x, y, 30, '#fff', 0.5); this.ring(x, y, 46, col, 0.7);
    this.stop(0.09); this.slow(0.45); this.shake(0.7); this.flash('#fff', 0.35);
  }
  popup(text, x, y, col = '#fff', scale = 2) { this.popups.push({ text, x, y, col, scale, life: 0.9 }); }

  /** Multiplier for game time this frame. */
  timeScale() { return this.hitstop > 0 ? 0 : this.slowT > 0 ? 0.3 : 1; }

  update(dt) {
    this.t += dt;
    this.hitstop = Math.max(0, this.hitstop - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flashA = Math.max(0, this.flashA - dt * 3);
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt * 0.5;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt; p.y -= 18 * dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
  }
  offset() {
    const s = this.trauma * this.trauma * 7 * this.shakeK;
    if (s < 0.3) return [0, 0];
    return [Math.sin(this.t * 71) * s, Math.cos(this.t * 53) * s];
  }
  draw(g) {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      g.alpha(r.life / r.max);
      g.ring(r.x, r.y, r.r * (0.3 + k * 0.7), r.col);
      g.ring(r.x, r.y, r.r * (0.3 + k * 0.7) - 1, r.col);
      g.alpha(1);
    }
    for (const p of this.parts) {
      const s = p.size * (p.life > p.max * 0.3 ? 1 : 0.5) || 1;
      g.rect(p.x - s / 2, p.y - s / 2, Math.max(1, s), Math.max(1, s), p.col);
    }
    for (const p of this.popups) {
      g.alpha(Math.min(1, p.life * 3));
      g.text(p.text, p.x, p.y, { scale: this.large ? Math.max(2, p.scale) : p.scale, col: p.col, align: 'center', ui: false });
      g.alpha(1);
    }
  }
  drawFlash(g) {
    if (this.flashA <= 0.01) return;
    g.alpha(this.flashA);
    g.rect(0, 0, 320, 180, this.flashCol, true);
    g.alpha(1);
  }
}
