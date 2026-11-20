// Shared design decisions (see docs/DESIGN_GUIDE.md). One place for palette
// roles, text roles, controller glyphs and the quiet colour drift, so every
// screen and event speaks the same visual language.

// ---- palette roles (never drift) ----
export const P = {
  ink: '#0b0a12',        // outlines, glyph letters on light keys
  panel: '#120f24',      // UI panel fill
  panelHi: '#1c1638',    // focused panel fill
  edge: '#4a4270',       // quiet panel edge
  text: '#f4f1ff',       // body text (≥ 12:1 on panel)
  dim: '#b8b0dc',        // secondary text (≥ 7:1 on panel)
  good: '#7dff8a',       // ready, positive card lines, GO
  warn: '#ffd84a',       // look here: prompts, timers, focus
  danger: '#ff4a4a',     // hurts: hazards, negative card lines
  safe: '#5affd9',       // blocking, shields
};

// ---- text roles: scale is in canvas pixels per font pixel ----
// scale 1 ≈ 21 px tall at 1080p (below XAG 101's 26 px): optional detail only.
// scale 2 ≈ 42 px: the minimum for anything a player must read.
export const T = { fine: 1, body: 2, head: 3, title: 5 };

// ---- quiet drift ----
// Only background (layer 'bg', full amplitude) and inactive geometry (layer
// 'geo', half amplitude, no lightness change) drift. Players, hazards,
// pickups, feedback and HUD use fixed colours. Physics and timers never read it.
export const DRIFT_MODES = {
  calm: { name: 'CALM', amp: 9, period: 48, light: 0.03 },     // chosen: study A
  bold: { name: 'BOLD', amp: 24, period: 20, light: 0.07 },    // study B (opt-in)
  off: { name: 'OFF', amp: 0, period: 48, light: 0 },
};

const hslCache = new Map();
function hexToHsl(hex) {
  let v = hslCache.get(hex);
  if (v) return v;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let hh = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
  }
  v = [hh, s, l];
  hslCache.set(hex, v);
  return v;
}

export class Drift {
  constructor() { this.mode = 'calm'; this.t = 0; this.kickHue = 0; this.kickAmt = 0; this.dim = 0; this.frozen = false; }
  setMode(m) { this.mode = DRIFT_MODES[m] ? m : 'calm'; }
  get cfg() { return DRIFT_MODES[this.mode]; }
  update(dt) {
    if (!this.frozen) this.t += dt;
    this.kickAmt *= Math.pow(0.35, dt); // event cues fade over ~2 s
    this.dim *= Math.pow(0.2, dt);
  }
  /** A state-change cue: pull the backdrop toward a hue (e.g. the round winner's colour). */
  kick(hex, amt = 1) { this.kickHue = hexToHsl(hex)[0]; this.kickAmt = Math.min(1, amt); }
  /** A brief dimming of the backdrop (a knockout). */
  hush(amt = 0.5) { this.dim = Math.max(this.dim, amt); }
  /** Current hue offset in degrees (for tests and the design guide). */
  offset() { const c = this.cfg; return c.amp * Math.sin((this.t / c.period) * Math.PI * 2); }
  /** Colour for a layer: 'bg' and 'geo' drift; anything else is returned unchanged. */
  col(hex, layer = 'bg') {
    if (layer !== 'bg' && layer !== 'geo') return hex;
    const c = this.cfg;
    const [h, s, l] = hexToHsl(hex);
    const k = layer === 'bg' ? 1 : 0.5;
    let hh = h + this.offset() * k;
    if (this.kickAmt > 0.01) { let d = this.kickHue - hh; d = ((d + 540) % 360) - 180; hh += d * this.kickAmt * (layer === 'bg' ? 0.55 : 0.2); }
    let ll = l;
    if (layer === 'bg') ll = l * (1 + c.light * Math.sin((this.t / c.period) * Math.PI * 2 + 1.3)) * (1 - this.dim * 0.45);
    return `hsl(${((hh % 360) + 360) % 360},${(s * 100).toFixed(1)}%,${(Math.max(0, Math.min(1, ll)) * 100).toFixed(1)}%)`;
  }
}

// ---- controller glyphs ----
// Face buttons are round, in their Xbox colour, with the letter: colour plus
// position plus letter, so they read even without colour. Bumpers and triggers
// are pills; the stick is a ring.
const FACE = { A: '#5fc83a', B: '#e8443a', X: '#2f8ae6', Y: '#f2c21b' };
export function glyph(g, label, x, y, scale = 2) {
  const u = scale / 2;               // world px per font px
  const h = 8 * u + 2;               // glyph height in world px
  const c = g.c;
  if (FACE[label]) {
    const r = h / 2;
    g.circle(x + r, y + r - 1, r, FACE[label], true);
    g.ring(x + r, y + r - 1, r, P.ink, true);
    g.text(label, x + r + 0.5, y + r - 1 - 3.5 * u, { scale, col: label === 'Y' ? P.ink : '#ffffff', align: 'center', shadow: null });
    return h + 1;
  }
  if (label === 'STICK' || label === 'L-STICK' || label === 'R-STICK') {
    const r = h / 2;
    g.ring(x + r, y + r - 1, r, P.text, true); g.circle(x + r, y + r - 1, r * 0.45, P.text, true);
    const extra = label === 'R-STICK' ? g.text('R', x + h + 1, y - 1 + (h - 8 * u) / 2, { scale, col: P.dim, shadow: null }) + 1 : 0;
    return h + 1 + extra;
  }
  const w = g.textW(label, scale) + 6;
  g.rect(x, y - 1, w, h, '#2a2640', true);
  g.frame(x, y - 1, w, h, P.text, 1, true);
  g.text(label, x + 3, y - 1 + (h - 7 * u) / 2, { scale, col: P.text, shadow: null });
  void c;
  return w + 1;
}
/** Draw a prompt like [A] READY. Returns total width. */
export function prompt(g, label, text, x, y, { scale = 2, col = P.text, align = 'left' } = {}) {
  const parts = label.split('/').map((s) => s.trim());
  const textW = g.textW(text, scale);
  let w = 0;
  for (const p of parts) w += (FACE[p] ? 8 * scale / 2 + 3 : g.textW(p, scale) + 7) + 2;
  const total = w + textW;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (const p of parts) cx += glyph(g, p, cx, y, scale) + 2;
  g.text(text, cx, y + (scale >= 2 ? 0.5 : 0), { scale, col });
  return total;
}
