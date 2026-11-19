// In-map power-up icons. They help players behind in the match much more than
// the leader (and tipsy winners least of all).
import { PICKUPS, withBuffs } from './powers.js';
import { SEAT_COLORS } from '../engine/sprites.js';
import { choice, rand } from '../engine/util.js';

export function makeBuffable(p, st) { p.baseSt = st; p.st = st; p.buffs = []; return p; }
export function tickBuffs(p, dt) {
  if (!p.buffs || !p.buffs.length) return;
  const before = p.buffs.length;
  p.buffs.forEach((b) => { b.t -= dt; });
  p.buffs = p.buffs.filter((b) => b.t > 0);
  if (p.buffs.length !== before) p.st = withBuffs(p.baseSt, p.buffs);
}

export class Pickups {
  /** spot(): [x, y] for a new pickup. types: allowed pickup types. */
  constructor({ fx, sound, spot, types = Object.keys(PICKUPS), every = 7, first = 5, max = 2 }) {
    Object.assign(this, { fx, sound, spot, types, every, max });
    this.next = first; this.items = []; this.t = 0;
  }
  /** bodies: [{p, x, y, r, mult}] */
  update(dt, bodies) {
    this.t += dt;
    this.next -= dt;
    if (this.next <= 0 && this.items.length < this.max) {
      this.next = this.every * rand(0.8, 1.2);
      const [x, y] = this.spot();
      this.items.push({ x, y, type: choice(this.types), t: 0, life: 10 });
      this.sound.sfx('warn');
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t > it.life) { this.items.splice(i, 1); continue; }
      for (const b of bodies) {
        if (Math.hypot(b.x - it.x, b.y - it.y) > b.r + 6) continue;
        this.apply(b.p, it.type, b.mult, it.x, it.y);
        this.items.splice(i, 1);
        break;
      }
    }
  }
  apply(p, type, mult, x, y) {
    const def = PICKUPS[type];
    if (type === 'shield') p.shields = (p.shields || 0) + (mult >= 1.5 ? 2 : 1);
    else {
      p.buffs = p.buffs || [];
      p.buffs.push({ type, mult, t: def.time * Math.min(1.6, 0.6 + mult * 0.5) });
      p.st = withBuffs(p.baseSt, p.buffs);
    }
    const tag = mult >= 1.5 ? ' x2!' : mult < 0.9 ? ' (WEAK)' : '';
    this.fx.popup(def.name + tag, x, y - 10, mult >= 1.5 ? '#7dff8a' : mult < 0.9 ? '#ff9a9a' : def.col, 1);
    this.fx.burst(x, y, 16, def.col, { speed: 90, life: 0.5 });
    this.fx.ring(x, y, 14, def.col, 0.3);
    this.sound.sfx('jackpot');
    this.fx.hueKick = (this.fx.hueKick || 0) + 25;
  }
  draw(g) {
    for (const it of this.items) {
      const def = PICKUPS[it.type];
      if (it.life - it.t < 2.5 && Math.floor(it.t * 10) % 2) continue;
      const bob = Math.sin(it.t * 4) * 2;
      g.circle(it.x, it.y + bob, 6, '#0b0a12');
      g.ring(it.x, it.y + bob, 6, def.col);
      g.ring(it.x, it.y + bob, 7 + Math.sin(it.t * 8), def.col + '66');
      g.text(def.icon, it.x, it.y + bob - 3.5, { scale: 2, col: def.col, align: 'center', ui: false, shadow: null });
    }
  }
}
/** Small marker for players with active buffs. */
export function drawBuffs(g, p, x, y) {
  if (!p.buffs) return;
  p.buffs.forEach((b, k) => g.rect(x - 4 + k * 3, y, 2, 2, PICKUPS[b.type].col));
}
export { SEAT_COLORS };
