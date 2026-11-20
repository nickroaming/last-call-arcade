// Pixel renderer. The world is 320×180. The canvas is 640×360, so text can
// use half-pixels for small print. Everything stays nearest-neighbour.
import { drawText, textWidth, wrap } from './font.js';

export const W = 320;
export const H = 180;
export const S = 2;

export class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = W * S;
    canvas.height = H * S;
    this.c = canvas.getContext('2d');
    this.c.imageSmoothingEnabled = false;
    this.ox = 0;
    this.oy = 0;
    this.t = 0;
  }
  /** Screen shake offset in world pixels. */
  setOffset(x, y) { this.ox = Math.round(x); this.oy = Math.round(y); this.frameNo = (this.frameNo || 0) + 1; } // called once per frame
  px(v, ui) { return Math.round(v + (ui ? 0 : 0)) * S; }

  clear(col) { this.c.fillStyle = col; this.c.fillRect(0, 0, W * S, H * S); }

  rect(x, y, w, h, col, ui = false) {
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const x0 = Math.round(x + ox), y0 = Math.round(y + oy);
    const x1 = Math.round(x + w + ox), y1 = Math.round(y + h + oy);
    if (x1 <= x0 || y1 <= y0) return;
    this.c.fillStyle = col;
    this.c.fillRect(x0 * S, y0 * S, (x1 - x0) * S, (y1 - y0) * S);
  }
  frame(x, y, w, h, col, t = 1, ui = false) {
    this.rect(x, y, w, t, col, ui); this.rect(x, y + h - t, w, t, col, ui);
    this.rect(x, y, t, h, col, ui); this.rect(x + w - t, y, t, h, col, ui);
  }
  /** Pixelated filled circle. */
  circle(x, y, r, col, ui = false) {
    r = Math.max(0.5, r);
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (half <= 0 && dy !== 0) continue;
      this.rect(Math.round(x - half), Math.round(y + dy), Math.round(half * 2) || 1, 1, col, ui);
    }
  }
  ring(x, y, r, col, ui = false) {
    const n = Math.max(12, Math.round(r * 6));
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    this.c.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.c.fillRect(Math.round(x + Math.cos(a) * r + ox) * S, Math.round(y + Math.sin(a) * r + oy) * S, S, S);
    }
  }
  /** Thick straight beam (lasers). */
  beam(x1, y1, x2, y2, w, col, ui = false) {
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const c = this.c;
    c.save();
    c.strokeStyle = col;
    c.lineWidth = w * S;
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo((x1 + ox) * S, (y1 + oy) * S);
    c.lineTo((x2 + ox) * S, (y2 + oy) * S);
    c.stroke();
    c.restore();
  }
  /** Dotted line, for warnings. */
  dotted(x1, y1, x2, y2, col, gap = 4, ui = false) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.floor(d / gap);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      this.rect(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 1, 1, col, ui);
    }
  }
  alpha(a) { this.c.globalAlpha = Math.max(0, Math.min(1, a)); }

  /**
   * Text. x,y are world pixels; scale is canvas pixels per font pixel
   * (1 = small print, 2 = normal, 3+ = headline).
   */
  text(str, x, y, { scale = 2, col = '#fff', align = 'left', shadow = '#000', ui = true } = {}) {
    const w = textWidth(str, scale) / S;
    let tx = x;
    if (align === 'center') tx = x - w / 2;
    if (align === 'right') tx = x - w;
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const cx = Math.round((tx + ox) * S), cy = Math.round((y + oy) * S);
    if (shadow) drawText(this.c, str, cx + scale, cy + scale, scale, shadow);
    drawText(this.c, str, cx, cy, scale, col);
    return w;
  }
  textW(str, scale = 2) { return textWidth(str, scale) / S; }
  lineH(scale = 2) { return (8 * scale) / S; }
  /** Wrapped paragraph; returns height used. */
  para(str, x, y, maxW, opts = {}) {
    const scale = opts.scale || 2;
    const maxChars = Math.floor((maxW * S) / (6 * scale));
    const lines = wrap(str, maxChars);
    lines.forEach((l, i) => this.text(l, x, y + i * this.lineH(scale), opts));
    return lines.length * this.lineH(scale);
  }
  /** Height a para() would take, without drawing. */
  paraH(str, maxW, scale = 2) { return wrap(str, Math.floor((maxW * S) / (6 * scale))).length * this.lineH(scale); }
  /** Draw a pre-rendered sprite canvas centred at x, bottom at y. */
  image(img, x, y, { scale = 1, flip = false, alpha = 1, rot = 0, ui = false, anchor = 'bottom' } = {}) {
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const c = this.c;
    const w = img.width * scale, h = img.height * scale;
    c.save();
    c.globalAlpha = alpha;
    const ay = anchor === 'center' ? (y + oy) * S : (y + oy) * S - h / 2;
    c.translate(Math.round((x + ox) * S), Math.round(ay));
    if (rot) c.rotate(rot);
    if (flip) c.scale(-1, 1);
    c.drawImage(img, -w / 2, -h / 2, w, h);
    c.restore();
  }
}

/** Build a sprite canvas from rows of palette characters ('.' = clear). */
export function makeSprite(rows, palette, pattern) {
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w * S; cv.height = h * S;
  const c = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      if (ch === 'c' && pattern && pattern(x, y)) ch = 'p';
      c.fillStyle = palette[ch] || '#f0f';
      c.fillRect(x * S, y * S, S, S);
    }
  }
  return cv;
}
export function tintSprite(src, col) {
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const c = cv.getContext('2d');
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = col;
  c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}
export { wrap };
