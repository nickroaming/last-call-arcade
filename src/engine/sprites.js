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
export function drawPlayer(g, idx, x, y, { flip = false, size = 1, flash = false, alpha = 1, squash = 0, flipY = false } = {}) {
  const a = art(idx);
  const img = flash ? a.white : a.body;
  // squash & stretch around the feet
  const sx = size * (1 + squash * 0.25), sy = size * (1 - squash * 0.25);
  const c = g.c;
  c.save();
  c.globalAlpha = alpha;
  const px = Math.round((x + g.ox) * 2), py = Math.round((y + g.oy) * 2);
  c.translate(px, py);
  if (flip || flipY) c.scale(flip ? -1 : 1, flipY ? -1 : 1); // flipY: standing on a ceiling, feet at y
  c.drawImage(img, -img.width * sx / 2, -img.height * sy, img.width * sx, img.height * sy);
  c.restore();
}

/** Small "P1" tag with an arrow, drawn above a player. */
export function drawTag(g, idx, x, y) {
  const label = 'P' + (idx + 1);
  g.rect(x - 6, y - 7, 12, 6, '#0b0a12', false);
  g.text(label, x, y - 6.5, { scale: 1, col: SEAT_COLORS[idx], align: 'center', ui: false, shadow: null });
  g.rect(x - 1, y - 1, 2, 1, SEAT_COLORS[idx], false);
}
