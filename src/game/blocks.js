// Block cards that work the same in every event: BURST BLOCK, STASIS FIELD,
// PERFECT PARRY's timing, and the block combos. Every event's block code
// calls switcheroo() (switcheroo.js), which calls blockPowers() here, so a
// new block card reaches all 18 events with a block at once.
import { Guns, posOf } from './weapons.js';
import { SEAT_COLORS } from '../engine/sprites.js';

/**
 * @param p      the player who just blocked
 * @param opts.from   where p stood before any swap or blink
 * @param opts.swapped the rival p swapped with (SWITCHEROO), if any
 */
export function blockPowers(p, { fx, sound, from = null, swapped = null } = {}) {
  const st = p.st;
  const guns = Guns.current;
  if (!st || !guns) return;
  p.blockAt = guns.t;
  const cx = st.cx || {};
  const col = SEAT_COLORS[p.idx] || '#fff';
  // the rest happens next frame, once the event has moved p (blink, swap)
  guns.later.push({ t: 0, fn: () => {
    const [x, y] = posOf(p);
    if (st.blockBurst) { // BURST BLOCK: a ring of your own bullets, with every gun card
      const fw = cx.fireworks;
      const n = (6 + 4 * (st.blockBurst - 1)) * (fw ? 2 : 1);
      guns.ring(p, x, y, n, fw ? (g) => ({ ...g, explode: Math.max(g.explode, 14) }) : null);
      if (fx) { fx.ring(x, y, 16, col, 0.3); if (fw) fx.popup('FIREWORKS', x, y - 18, '#ffd84a', 1); }
    }
    if (st.blockStasis) { // STASIS FIELD: rival bullets nearby stop dead
      const R = 40 + 14 * st.blockStasis;
      let n = 0;
      for (const b of guns.bullets) {
        if (b.owner === p || b.stuck || b.frozenT > 0) continue;
        if (Math.hypot(b.x - x, b.y - y) > R) continue;
        b.frozenT = 1.0; n += 1;
        if (cx.timelock) b.thawTo = p; // TIME LOCK
      }
      if (fx) { fx.ring(x, y, R, '#9fd3ff', 0.45); if (n) fx.popup(cx.timelock ? 'TIME LOCK' : 'STASIS', x, y - 18, '#9fd3ff', 1); }
    }
    if (cx.thunderstep && st.blockBlink) { // THUNDERSTEP: the blink lands with a bang
      guns.blast(x, y, 30 + 6 * st.blockShock, p, 14);
    }
    if (cx.secondwind && p.shields !== undefined && p.shields < 1) { // SECOND WIND
      p.shields = 1;
      if (fx) fx.popup('BUBBLE', x, y - 18, '#9fd3ff', 1);
    }
    if (cx.hotpotato && swapped && from) { // HOT POTATO: a bomb where you stood
      guns.add({ x: from[0], y: from[1], vx: 0, vy: 0, owner: p, g: { ...st.gun, explode: Math.max(28, st.gun.explode), sticky: 1, cx: {} }, r: 3, dmg: Math.max(25, st.gun.dmg), bounces: 0, split: 0, pierce: 0, age: 0, life: 9, trail: [], hits: new Set(), stuck: true, fuse: 0.7, seen: 0 });
      if (fx) fx.popup('HOT POTATO', from[0], from[1] - 14, '#ff7a2e', 1);
    }
  } });
  if (st.parry && fx && !p.parryHint) { p.parryHint = true; } // timing lives in weapons.js (parryCheck)
  void sound;
}
export { posOf };
