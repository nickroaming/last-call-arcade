// CPU players. Each bot is a fake gamepad, so it joins, owns a seat and plays
// through the exact same input path as a real controller. Good for testing
// alone at a desk (one keyboard player + CPUs).
import { BTN } from '../input/gamepad-adapter.js';
import { clamp, rand } from '../engine/util.js';

const NB = 17;
let nextIndex = 60;

export class Bot {
  constructor() {
    this.index = nextIndex++;
    this.down = new Array(NB).fill(false);
    this.last = new Array(NB).fill(false);
    this.taps = new Set();
    this.axes = [0, 0, 0, 0];
    this.t = 0; this.wander = [rand(-1, 1), rand(-1, 1)]; this.wanderT = 0;
    this.menuT = rand(0.6, 1.6);
    this.hold = { fire: false, drift: 0 };
  }
  tap(b) { this.taps.add(b); }
  pad() {
    const buttons = this.down.map((d) => ({ pressed: d, value: d ? 1 : 0 }));
    return { index: this.index, id: 'CPU player', connected: true, mapping: 'standard', timestamp: 0, buttons, axes: this.axes.slice() };
  }
  /** Turn taps into one-frame presses (a released frame in between). */
  commit() {
    const now = new Array(NB).fill(false);
    if (this.hold.fire) now[BTN.X] = true;
    if (this.hold.drift > 0) now[BTN.A] = true;
    for (const b of [...this.taps]) {
      if (!this.last[b]) { now[b] = true; this.taps.delete(b); }
    }
    this.last = now; this.down = now;
  }

  /** ctx: {screen, t, game, seatN, dt, ready} */
  think(ctx) {
    const dt = ctx.dt;
    this.t += dt;
    this.axes = [0, 0, 0, 0];
    this.hold.fire = false;
    this.hold.drift = Math.max(0, this.hold.drift - dt);
    const s = ctx.screen;
    if (s === 'title' || s === 'final') return this.commit();
    if (s === 'results' || s === 'prompt' || s === 'finish' || s === 'paused') return this.commit();
    if (s !== 'play' && s !== 'countdown') {
      this.menuT -= dt;
      if (this.menuT <= 0) {
        this.menuT = rand(0.8, 2.2);
        if (s === 'draft') {
          if (Math.random() < 0.5) this.axes[1] = 1;
          this.tap(BTN.A);
        } else if (s === 'prompt') this.tap(BTN.X);
        else this.tap(BTN.A);
      }
      return this.commit();
    }
    if (s === 'countdown' || !ctx.game) return this.commit();
    this.playGame(ctx);
    this.commit();
  }

  playGame(ctx) {
    const g = ctx.game;
    const list = g.players || [];
    const me = list.find((p) => p.seat === ctx.seatN);
    const dt = ctx.dt;
    this.wanderT -= dt;
    if (this.wanderT <= 0) { this.wanderT = rand(0.4, 1.4); this.wander = [rand(-1, 1), rand(-1, 1)]; }
    if (!me || !me.pos) { this.axes = [this.wander[0], this.wander[1], 0, 0]; if (Math.random() < 0.05) this.tap(BTN.X); return; }
    const [x, y] = me.pos();
    const rivals = list.filter((p) => p !== me && p.pos && !p.dead && !p.out);
    let near = null, nd = 1e9;
    for (const r of rivals) { const [rx, ry] = r.pos(); const d = Math.hypot(rx - x, ry - y); if (d < nd) { nd = d; near = r; } }
    const hint = g.botTarget ? g.botTarget(ctx.seatN) : null;
    let mx = this.wander[0] * 0.5, my = this.wander[1] * 0.5;
    if (hint) {
      const dx = hint[0] - x, dy = hint[1] - y, d = Math.hypot(dx, dy) || 1;
      mx = dx / d + this.wander[0] * 0.25; my = dy / d + this.wander[1] * 0.25;
      if (hint[2] === 'away') { mx = -mx; my = -my; }
    } else if (near) {
      const [rx, ry] = near.pos();
      const dx = rx - x, dy = ry - y, d = Math.hypot(dx, dy) || 1;
      const k = d > 90 ? 1 : d < 45 ? -0.8 : 0;
      mx = (dx / d) * k + this.wander[0] * 0.6; my = (dy / d) * k + this.wander[1] * 0.6;
    }
    let ax = 0, ay = 0;
    if (near) {
      const [rx, ry] = near.pos();
      const a = Math.atan2(ry - y - (g.meta && g.meta.id === 'rumble' ? 8 : 0), rx - x) + rand(-0.25, 0.25);
      ax = Math.cos(a); ay = Math.sin(a);
      if (nd < 170 && Math.random() < 0.6) this.hold.fire = true;
    }
    this.axes = [clamp(mx, -1, 1), clamp(my, -1, 1), ax, ay];
    const id = g.meta && g.meta.id;
    if (id === 'dustlap') {
      if (Math.random() < 0.01) this.hold.drift = rand(0.4, 1);
      if (Math.random() < 0.006) this.tap(BTN.RB);
    } else {
      const climb = hint && hint[1] < y - 14;
      if (Math.random() < (climb ? 0.13 : 0.015)) this.tap(BTN.A);
      if (Math.random() < 0.004) this.tap(BTN.RB);
    }
  }
}
