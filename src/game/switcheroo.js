// SWITCHEROO (block card): blocking also swaps places with a random rival.
// Every event calls this from its own block code, telling it where a
// player's position lives. Only the spot moves: each player keeps their own
// speed, health, gems and score, so a swap is a gamble, not a free win.
import { SEAT_COLORS } from '../engine/sprites.js';
import { blockPowers, posOf } from './blocks.js';

/**
 * @param p        the player who blocked (p.st.blockSwap > 0)
 * @param rivals   everyone in the event (p is skipped)
 * @param opts.alive  who can be swapped with (default: not dead, ghost, out or a perma ghost)
 * @param opts.box    (q) => a body {x, y, w, h}: swap feet positions, so a big
 *                    body never lands inside a floor
 * @param opts.keys   plain fields to swap on the player object (default x, y)
 * @param opts.obj    (q) => the object that holds those fields (default q)
 * @param opts.also (p, q) => extra state to trade (Mirror's twins)
 * @returns the rival swapped with, or null
 */
export function switcheroo(p, rivals, opts = {}) {
  // every event calls this when someone blocks: it also runs the shared block cards (blocks.js)
  let from = null;
  try { from = posOf(p); } catch (e) { from = null; }
  const q = swap(p, rivals, opts);
  blockPowers(p, { fx: opts.fx, sound: opts.sound, from, swapped: q });
  return q;
}
function swap(p, rivals, { fx, sound, alive, box, keys = ['x', 'y'], obj = (q) => q, also = null, rng = Math.random } = {}) {
  if (!p.st || !p.st.blockSwap) return null;
  const ok = alive || ((q) => !q.dead && !q.ghost && !q.out && !q.perma && !q.finished);
  const pool = rivals.filter((q) => q !== p && ok(q));
  if (!pool.length) { if (fx) fx.popup('NOBODY TO SWAP', ...p.pos(), '#9a90c0', 1); return null; }
  const q = pool[Math.floor(rng() * pool.length) % pool.length];
  const [ax, ay] = p.pos(), [bx, by] = q.pos();
  if (box) {
    const a = box(p), b = box(q);
    const fa = [a.x + a.w / 2, a.y + a.h], fb = [b.x + b.w / 2, b.y + b.h];
    a.x = fb[0] - a.w / 2; a.y = fb[1] - a.h;
    b.x = fa[0] - b.w / 2; b.y = fa[1] - b.h;
  } else {
    const a = obj(p), b = obj(q);
    for (const k of keys) { const t = a[k]; a[k] = b[k]; b[k] = t; }
  }
  if (also) also(p, q);
  p.swappedAt = q.swappedAt = (p.swappedAt || 0) + 1;
  if (fx) {
    const ca = SEAT_COLORS[p.idx], cb = SEAT_COLORS[q.idx];
    // a dotted streak each way, so everyone sees who went where
    for (let k = 1; k < 8; k++) {
      const f = k / 8;
      fx.burst(ax + (bx - ax) * f, ay + (by - ay) * f, 1, ca, { speed: 10, life: 0.35 });
      fx.burst(bx + (ax - bx) * f, by + (ay - by) * f, 1, cb, { speed: 10, life: 0.35 });
    }
    const [nx, ny] = p.pos(), [mx, my] = q.pos();
    fx.ring(nx, ny, 14, ca, 0.35); fx.ring(mx, my, 14, cb, 0.35);
    fx.popup('SWITCHEROO', Math.max(44, Math.min(276, nx)), Math.max(30, ny - 14), ca, 2); // kept on screen
  }
  if (sound) sound.sfx('swap');
  return q;
}
