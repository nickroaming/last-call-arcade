// Renderer. The world is 320×180 and all drawing code works in "canvas units"
// of 640×360 (S = 2 per world pixel), so text can use half-pixels for small
// print. The real canvas is R times bigger than that (R = 2 → 1280×720,
// R = 3 → 1920×1080): a base transform scales every call, so shapes, the
// characters and bullets are drawn sharp at the TV's resolution while the
// pixel font and pixel art stay crisp.
import { drawText, textWidth, wrap } from './font.js';
import { btnText } from './style.js';

export const W = 320;
export const H = 180;
export const S = 2;

const glowCache = new Map();
export const GLOW_BUDGET = 160;
/** A soft round glow, cached per colour (drawn with additive blending). */
function glowSprite(col) {
  let cv = glowCache.get(col);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 1; c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  // a second, softer pass gives a hot centre and a long falloff
  const g2 = c.createRadialGradient(32, 32, 0, 32, 32, 12); g2.addColorStop(0, 'rgba(255,255,255,0.55)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g2; c.fillRect(0, 0, 64, 64);
  glowCache.set(col, cv);
  if (glowCache.size > 200) glowCache.delete(glowCache.keys().next().value);
  return cv;
}

export class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.ox = 0;
    this.oy = 0;
    this.t = 0;
    this.fancy = true; // glow and soft light; off = flat colours (Calm look / slow machines)
    this.setRes(2);
  }
  /** Physical pixels per canvas unit (1 = the old 640×360 canvas). */
  setRes(r) {
    r = Math.max(1, Math.min(3, r));
    if (r === this.res && this.canvas.width === W * S * r) return;
    this.res = r;
    this.canvas.width = W * S * r;
    this.canvas.height = H * S * r;
    this.resetTransform();
  }
  resetTransform() {
    this.c.setTransform(this.res, 0, 0, this.res, 0, 0);
    this.c.imageSmoothingEnabled = false;
    this.c.globalAlpha = 1;
    this.c.globalCompositeOperation = 'source-over';
  }
  /** Screen shake offset in world pixels. */
  setOffset(x, y) { this.glowN = 0; this.ox = Math.round(x * 2) / 2; this.oy = Math.round(y * 2) / 2; this.frameNo = (this.frameNo || 0) + 1; } // called once per frame
  px(v, ui) { return Math.round(v + (ui ? 0 : 0)) * S; }

  clear(col) { this.c.fillStyle = col; this.c.fillRect(0, 0, W * S, H * S); }

  rect(x, y, w, h, col, ui = false) {
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const x0 = Math.round((x + ox) * S), y0 = Math.round((y + oy) * S);
    const x1 = Math.round((x + w + ox) * S), y1 = Math.round((y + h + oy) * S);
    if (x1 <= x0 || y1 <= y0) return;
    this.c.fillStyle = col;
    this.c.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  frame(x, y, w, h, col, t = 1, ui = false) {
    this.rect(x, y, w, t, col, ui); this.rect(x, y + h - t, w, t, col, ui);
    this.rect(x, y, t, h, col, ui); this.rect(x + w - t, y, t, h, col, ui);
  }
  /** Smooth filled circle. */
  circle(x, y, r, col, ui = false) {
    r = Math.max(0.5, r);
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const c = this.c;
    c.fillStyle = col;
    c.beginPath(); c.arc((x + ox) * S, (y + oy) * S, r * S, 0, Math.PI * 2); c.fill();
  }
  /** Smooth outline circle, `w` world pixels thick. */
  ring(x, y, r, col, ui = false, w = 1) {
    if (r <= 0) return;
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const c = this.c;
    c.strokeStyle = col; c.lineWidth = w * S;
    c.beginPath(); c.arc((x + ox) * S, (y + oy) * S, r * S, 0, Math.PI * 2); c.stroke();
  }
  /** Soft additive glow of radius r (world px). Skipped when fancy is off. */
  glow(x, y, r, col, a = 1, ui = false) {
    if (!this.fancy || a <= 0.01 || r <= 0 || typeof col !== 'string' || col.length > 7 || col[0] !== '#') return;
    // a budget per frame: a storm of bullets must not turn the screen white (or slow the Xbox)
    this.glowN = (this.glowN || 0) + 1;
    if (this.glowN > GLOW_BUDGET) return;
    if (this.glowN > GLOW_BUDGET / 2) a *= 0.5;
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const c = this.c;
    const prevA = c.globalAlpha, prevOp = c.globalCompositeOperation;
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, prevA * a);
    const d = r * 2 * S;
    c.drawImage(glowSprite(col), (x + ox) * S - d / 2, (y + oy) * S - d / 2, d, d);
    c.globalAlpha = prevA; c.globalCompositeOperation = prevOp;
  }
  /** A tapered, glowing streak through a list of points (bullet trails). */
  streak(pts, width, col, ui = false) {
    if (pts.length < 2) return;
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const c = this.c;
    c.lineCap = 'round'; c.strokeStyle = col;
    const prevA = c.globalAlpha;
    for (let i = 1; i < pts.length; i++) {
      const k = i / (pts.length - 1);
      c.globalAlpha = prevA * (0.15 + 0.85 * k);
      c.lineWidth = Math.max(0.6, width * (0.25 + 0.75 * k)) * S;
      c.beginPath(); c.moveTo((pts[i - 1][0] + ox) * S, (pts[i - 1][1] + oy) * S); c.lineTo((pts[i][0] + ox) * S, (pts[i][1] + oy) * S); c.stroke();
    }
    c.globalAlpha = prevA; c.lineCap = 'butt';
  }
  /** Filled rounded rectangle (world px). */
  rrect(x, y, w, h, r, col, ui = false) {
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const c = this.c;
    c.fillStyle = col;
    c.beginPath();
    if (c.roundRect) c.roundRect((x + ox) * S, (y + oy) * S, w * S, h * S, r * S);
    else c.rect((x + ox) * S, (y + oy) * S, w * S, h * S);
    c.fill();
  }
  /** Vertical gradient fill (world px). */
  vgrad(x, y, w, h, top, bottom, ui = true) {
    const ox = ui ? 0 : this.ox, oy = ui ? 0 : this.oy;
    const c = this.c;
    const gr = c.createLinearGradient(0, (y + oy) * S, 0, (y + h + oy) * S);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    c.fillStyle = gr; c.fillRect((x + ox) * S, (y + oy) * S, w * S, h * S);
  }
  /** Darkened corners, drawn over a whole scene. */
  vignette(a = 0.5) {
    if (!this.fancy) return;
    const c = this.c;
    if (!this._vig) {
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
      const v = cv.getContext('2d');
      const gr = v.createRadialGradient(160, 90, 60, 160, 90, 200);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      v.fillStyle = gr; v.fillRect(0, 0, 320, 180);
      this._vig = cv;
    }
    const prevA = c.globalAlpha; c.globalAlpha = a;
    const sm = c.imageSmoothingEnabled; c.imageSmoothingEnabled = true;
    c.drawImage(this._vig, 0, 0, W * S, H * S);
    c.imageSmoothingEnabled = sm; c.globalAlpha = prevA;
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
  text(str, x, y, { scale = 2, col = '#fff', align = 'left', shadow = '#000', ui = true, raw = false } = {}) {
    if (!raw) str = btnText(str);
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
  textW(str, scale = 2) { return textWidth(btnText(str), scale) / S; }
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
