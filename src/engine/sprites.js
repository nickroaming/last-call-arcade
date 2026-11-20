// Original character art. Seats differ by silhouette, body pattern and number,
// so nobody needs to tell colours apart.
import { makeSprite, tintSprite } from './gfx.js';

export const SEAT_COLORS = ['#ff9a2e', '#33d6ff', '#ff5fd2'];
export const SEAT_DARK = ['#a3520a', '#0f7896', '#9c1f7d'];
export const SEAT_NAMES = ['BRICK', 'BLOOP', 'SPIKE'];
export const SEAT_SHAPES = ['^', '@', '#']; // used only as text hints
const PATTERNS = [
  (x, y) => (x + y) % 3 === 0,          // P1 diagonal stripes
  (x, y) => x % 3 === 1 && y % 3 === 1, // P2 dots
  (x, y) => y % 3 === 0,                // P3 bars
];

const BODIES = [
  [ // BRICK: square body with horns
    '.k.......k.',
    'kck.....kck',
    'kcckkkkkcck',
    'kccccccccck',
    'kcwwccwwcck',
    'kcwkccwkcck',
    'kccccccccck',
    'kccckkkccck',
    'kccccccccck',
    'kccccccccck',
    '.kkkkkkkkk.',
    '.kk.....kk.',
  ],
  [ // BLOOP: round body with an antenna
    '.....k.....',
    '....kck....',
    '.....k.....',
    '...kkkkk...',
    '..kccccck..',
    '.kcwwcwwck.',
    'kccwkcwkcck',
    'kccccccccck',
    'kcccckcccck',
    '.kccccccck.',
    '..kkkkkkk..',
    '..kk...kk..',
  ],
  [ // SPIKE: pointed head
    '.....k.....',
    '....kck....',
    '...kccck...',
    '...kccck...',
    '..kccccck..',
    '..kwwcwwk..',
    '.kcwkckwck.',
    '.kccccccck.',
    'kccckkkccck',
    'kccccccccck',
    '.kkkkkkkkk.',
    '.kk.....kk.',
  ],
];

const CAR = [
  '..kkkkkkkk..',
  '.kccccccwck.',
  'kkcccccwwcck',
  'kkccccccccck',
  'kkccccccccck',
  'kkcccccwwcck',
  '.kccccccwck.',
  '..kkkkkkkk..',
];

let cache = null;
function build() {
  cache = SEAT_COLORS.map((col, i) => {
    const pal = { k: '#0b0a12', c: col, p: SEAT_DARK[i], w: '#ffffff' };
    const body = makeSprite(BODIES[i], pal, PATTERNS[i]);
    const car = makeSprite(CAR, pal, PATTERNS[i]);
    return { body, white: tintSprite(body, '#ffffff'), car, carWhite: tintSprite(car, '#ffffff'), ghost: tintSprite(body, '#cfd8ff') };
  });
}
export function art(i) { if (!cache) build(); return cache[i % 3]; }

/** x = centre, y = feet. size 1 = 11×12 world pixels. */
// ---- Characters -------------------------------------------------------------
// Smooth, round, procedurally animated regulars drawn at full canvas
// resolution. Identity is the SHAPE (BRICK: square with horns, BLOOP: round
// with an antenna, SPIKE: spiked) plus a belly pattern; colour comes second.
// Animation needs no frame art: each drawn character is matched to the same
// character last frame (nth draw of that seat this frame), and its motion
// drives eyes, walk cycle, lean and bob.
const anim = new Map();
const calls = new Map();
let animFrame = -1;
const INK = '#0b0a12';
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

function bodyPath(c, kind, u, cy) {
  c.beginPath();
  if (kind === 0) { // BRICK: rounded square with two horns
    const r = 2.6 * u, x0 = -5 * u, y0 = cy - 5 * u, w = 10 * u, h = 10 * u;
    c.moveTo(x0 + r, y0); c.lineTo(x0 + w - r, y0); c.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    c.lineTo(x0 + w, y0 + h - r); c.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    c.lineTo(x0 + r, y0 + h); c.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    c.lineTo(x0, y0 + r); c.quadraticCurveTo(x0, y0, x0 + r, y0); c.closePath();
  } else if (kind === 1) { // BLOOP: a slightly squashy ball
    c.ellipse(0, cy, 5.3 * u, 5 * u, 0, 0, Math.PI * 2);
  } else { // SPIKE: ball with a crown of three spikes
    c.moveTo(-4.6 * u, cy - 1.8 * u);
    c.lineTo(-3.6 * u, cy - 6.4 * u); c.lineTo(-1.8 * u, cy - 4.4 * u);
    c.lineTo(0, cy - 8 * u); c.lineTo(1.8 * u, cy - 4.4 * u);
    c.lineTo(3.6 * u, cy - 6.4 * u); c.lineTo(4.6 * u, cy - 1.8 * u);
    c.arc(0, cy, 5 * u, -0.37, Math.PI + 0.37, false);
    c.closePath();
  }
}
function accessory(c, kind, u, cy, col, now, idx) {
  c.lineWidth = 1.1 * u; c.strokeStyle = INK; c.fillStyle = col;
  if (kind === 0) { // horns
    for (const sgn of [-1, 1]) {
      c.beginPath(); c.moveTo(sgn * 2.6 * u, cy - 4.8 * u); c.lineTo(sgn * 4.6 * u, cy - 8.2 * u); c.lineTo(sgn * 4.9 * u, cy - 4.4 * u); c.closePath();
      c.fill(); c.stroke();
    }
  } else if (kind === 1) { // antenna that wobbles
    const sway = Math.sin(now * 5 + idx) * 1.2 * u;
    c.beginPath(); c.moveTo(0, cy - 4.8 * u); c.quadraticCurveTo(sway * 0.3, cy - 7 * u, sway, cy - 8.4 * u); c.stroke();
    c.beginPath(); c.arc(sway, cy - 8.8 * u, 1.2 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  }
}
function bellyPattern(c, kind, u, cy, col) {
  c.fillStyle = col; c.globalAlpha *= 0.5;
  if (kind === 0) for (const k of [-1, 1]) { c.save(); c.translate(k * 2 * u, cy + 2.6 * u); c.rotate(-0.6); c.fillRect(-0.5 * u, -1.6 * u, 1 * u, 3.2 * u); c.restore(); } // stripes
  else if (kind === 1) for (const k of [-1.8, 0, 1.8]) { c.beginPath(); c.arc(k * u, cy + 2.8 * u, 0.65 * u, 0, Math.PI * 2); c.fill(); } // dots
  else for (const k of [2, 3.6]) c.fillRect(-2.4 * u, cy + k * u - 0.45 * u, 4.8 * u, 0.9 * u); // bars
  c.globalAlpha /= 0.5;
}

/** x = centre, y = feet (or the body centre with anchor 'center'). size 1 ≈ 11×13 world pixels. */
export function drawPlayer(g, idx, x, y, { flip = false, size = 1, flash = false, alpha = 1, squash = 0, flipY = false, rot = 0, anchor = 'feet', look = null } = {}) {
  // which character is this? the nth draw of this seat this frame
  if (g.frameNo !== animFrame) { animFrame = g.frameNo; calls.clear(); }
  const n = calls.get(idx) || 0;
  calls.set(idx, n > 40 ? 0 : n + 1);
  const key = idx * 1000 + n;
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  let s = anim.get(key);
  if (!s) { s = { x, y, vx: 0, vy: 0, phase: 0, t: now, blinkAt: now + 1 + Math.random() * 3 }; anim.set(key, s); }
  const dt = clampN(now - s.t, 0, 0.1); s.t = now;
  const dx = x - s.x, dy = y - s.y; s.x = x; s.y = y;
  if (Math.abs(dx) < 40 && Math.abs(dy) < 40 && dt > 0.001) {
    s.vx = clampN(s.vx * 0.6 + (dx / dt) * 0.4, -220, 220); s.vy = clampN(s.vy * 0.6 + (dy / dt) * 0.4, -220, 220);
  } else if (dt > 0.001) { s.vx *= 0.5; s.vy *= 0.5; }
  const speed = Math.hypot(s.vx, s.vy);
  const walking = speed > 10;
  s.phase += dt * (walking ? 3 + speed * 0.09 : 0);

  const kind = ((idx % 3) + 3) % 3;
  const col = SEAT_COLORS[kind], dark = SEAT_DARK[kind];
  const u = 2 * size; // canvas pixels per world pixel
  const c = g.c;
  c.save();
  c.globalAlpha = alpha;
  c.translate(Math.round((x + g.ox) * 2), Math.round((y + g.oy) * 2));
  if (rot) c.rotate(rot);
  if (anchor === 'center') c.translate(0, 6.2 * u);
  const fx = flip ? -1 : 1, fy = flipY ? -1 : 1;
  c.scale(fx, fy);
  const localVx = s.vx * fx;

  // feet
  const step = walking ? Math.sin(s.phase * Math.PI) : 0;
  c.fillStyle = INK;
  for (const k of [-1, 1]) {
    const lift = walking ? Math.max(0, step * k) * 1.3 * u : 0;
    c.beginPath(); c.ellipse(k * 2.4 * u + (walking ? step * k * 0.6 * u : 0), -0.9 * u - lift, 1.8 * u, 1.05 * u, 0, 0, Math.PI * 2); c.fill();
  }

  // body: lean into the run, bob, squash & stretch around the feet
  const bob = walking ? Math.abs(Math.sin(s.phase * Math.PI)) * 0.7 : (Math.sin(now * 2.2 + idx * 1.7) * 0.5 + 0.5) * 0.35;
  const lean = clampN(localVx / 160, -1, 1) * 0.2;
  const sq = clampN(squash, -1, 1);
  c.rotate(lean);
  c.translate(0, -1.2 * u - bob * u);
  c.scale(1 + sq * 0.22, 1 - sq * 0.22);
  const cy = -5 * u;

  accessory(c, kind, u, cy, flash ? '#ffffff' : col, now, idx);
  bodyPath(c, kind, u, cy);
  c.fillStyle = flash ? '#ffffff' : col; c.fill();
  c.lineWidth = 1.1 * u; c.strokeStyle = INK; c.stroke();
  if (!flash) {
    c.save(); bodyPath(c, kind, u, cy); c.clip();
    c.fillStyle = dark; c.globalAlpha *= 0.55; c.beginPath(); c.ellipse(0, cy + 6.5 * u, 7 * u, 4.2 * u, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha /= 0.55;
    c.fillStyle = '#ffffff'; c.globalAlpha *= 0.35; c.beginPath(); c.ellipse(-2 * u, cy - 3 * u, 2.2 * u, 1.2 * u, -0.5, 0, Math.PI * 2); c.fill();
    c.globalAlpha /= 0.35;
    bellyPattern(c, kind, u, cy, dark);
    c.restore();
  }

  // eyes look where you're going (or where you aim), and blink
  let lx, ly;
  if (look != null) { lx = Math.cos(look) * fx; ly = Math.sin(look) * fy; }
  else { lx = clampN(localVx / 70, -1, 1) * 0.7 + 0.35; ly = clampN((s.vy * fy) / 90, -1, 1) * 0.6; }
  lx = clampN(lx, -1, 1); ly = clampN(ly, -1, 1);
  if (now > s.blinkAt + 0.13) s.blinkAt = now + 2 + Math.random() * 3.5;
  const blink = now > s.blinkAt;
  const ex = 0.7 * u + lx * 0.5 * u, ey = cy - 0.6 * u;
  for (const k of [-1, 1]) {
    const x0 = ex + k * 2.05 * u;
    if (flash) { // squinting "ouch" eyes
      c.strokeStyle = INK; c.lineWidth = 0.9 * u;
      c.beginPath(); c.moveTo(x0 - 1 * u, ey - 1 * u); c.lineTo(x0 + 0.6 * u * k, ey); c.lineTo(x0 - 1 * u, ey + 1 * u); c.stroke();
    } else if (blink) {
      c.fillStyle = INK; c.fillRect(x0 - 1.3 * u, ey - 0.3 * u, 2.6 * u, 0.7 * u);
    } else {
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x0, ey, 1.45 * u, 1.85 * u, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = INK; c.beginPath(); c.arc(x0 + lx * 0.55 * u, ey + ly * 0.75 * u, 0.85 * u, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.fillRect(x0 + lx * 0.55 * u - 0.5 * u, ey + ly * 0.75 * u - 0.6 * u, 0.45 * u, 0.45 * u);
    }
  }
  c.restore();
  if (anim.size > 400) anim.clear();
}

/**
 * The gun arm: a short barrel from the body toward the aim, so everyone can
 * read where a player is pointing (it was a 1-pixel dot). `recoil` (0..1)
 * kicks it back and shows a muzzle flash.
 */
export function drawGun(g, idx, x, y, a, { size = 1, recoil = 0, alpha = 1 } = {}) {
  const c = Math.cos(a), s = Math.sin(a);
  const r0 = 3.5 * size, len = 6 * size - recoil * 2.5 * size;
  const x1 = x + c * r0, y1 = y + s * r0, x2 = x + c * (r0 + len), y2 = y + s * (r0 + len);
  g.alpha(alpha);
  g.beam(x1, y1, x2, y2, 3.4 * size, INK);
  g.beam(x1, y1, x2 - c * 0.6, y2 - s * 0.6, 1.8 * size, SEAT_DARK[((idx % 3) + 3) % 3]);
  if (recoil > 0.55) { g.circle(x2 + c * 2, y2 + s * 2, 1.6 * size, '#fff6a8'); g.circle(x2 + c * 2, y2 + s * 2, 0.8 * size, '#ffffff'); }
  g.alpha(1);
}

/** Small "P1" tag with an arrow, drawn above a player. Large text doubles it. */
export function drawTag(g, idx, x, y) {
  const label = 'P' + (idx + 1);
  if (g.large) {
    g.rect(x - 9, y - 11, 18, 10, '#0b0a12', false);
    g.text(label, x, y - 10.5, { scale: 2, col: SEAT_COLORS[idx], align: 'center', ui: false, shadow: null });
    g.rect(x - 1, y - 1, 2, 1, SEAT_COLORS[idx], false);
    return;
  }
  g.rect(x - 6, y - 7, 12, 6, '#0b0a12', false);
  g.text(label, x, y - 6.5, { scale: 1, col: SEAT_COLORS[idx], align: 'center', ui: false, shadow: null });
  g.rect(x - 1, y - 1, 2, 1, SEAT_COLORS[idx], false);
}
