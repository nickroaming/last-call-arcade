// THE NIGHT: the story frame that ties the events together (docs/CREATIVE_DIRECTION.md).
// After last call, the bar's arcade Cabinet wakes up and breaks one rule per
// event, a little more each act. This module owns everything that makes that
// visible: the clock, the acts, the Cabinet's voice, the shared stage every
// menu screen is drawn on, the night strip and the end-of-night recap.
import { P } from '../engine/style.js';
import { SEAT_COLORS } from '../engine/sprites.js';

export const ACTS = [
  { n: 0, name: 'CLOSING TIME', base: '#140b2a', mid: '#1d0f33', accent: '#ff5fd2', line: 'THE BAR IS CLOSED. I AM NOT.' },
  { n: 1, name: 'WARM-UP', base: '#150c1a', mid: '#21122a', accent: '#ffb03a', clock: 23, line: 'PLAY NICE. THE RULES ARE NORMAL. FOR NOW.' },
  { n: 2, name: 'THE MACHINE WAKES', base: '#08122a', mid: '#0d1c3a', accent: '#5affd9', clock: 24, line: "I'VE BEEN WATCHING YOU. MY TURN." },
  { n: 3, name: 'LAST CALL', base: '#1a0620', mid: '#2a0a30', accent: '#ff5fd2', clock: 25, line: 'NOTHING IS SAFE NOW. NOT EVEN THE RULES.' },
];
export const actOf = (meta) => ACTS[meta && meta.tier ? meta.tier : 1];

/** "11:40 PM" for the start of event i in a night, from the act it belongs to. */
export function clockAt(playlist, i, tierOf) {
  if (i >= playlist.length) return '2:00 AM';
  const k = tierOf(playlist[i]) || 1;
  const inAct = playlist.map((id, j) => [id, j]).filter(([id]) => (tierOf(id) || 1) === k);
  const pos = inAct.findIndex(([, j]) => j === i);
  const mins = Math.round((pos / Math.max(1, inAct.length)) * 60 / 5) * 5;
  return fmt(ACTS[k].clock, mins);
}
function fmt(h, m) {
  const hh = ((h % 24) + 24) % 24;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

/** What the Cabinet says after an event. Short, deadpan, about what just happened. */
export function cabinetQuip(match, awards, rng = Math.random) {
  if (!awards || !awards.length) return null;
  const w = awards[0].seat;
  const last = awards[awards.length - 1].seat;
  const s = match.standings();
  const gap = s[0].points - s[s.length - 1].points;
  const wp = match.player(w);
  const streak = wp.places.length >= 2 && wp.places.slice(-2).every((x) => x === 1);
  const wasLast = match.player(w).places.length >= 2 && match.player(w).places[match.player(w).places.length - 2] === match.players.length;
  const pick = (a) => a[Math.floor(rng() * a.length)];
  if (streak) return pick([`P${w} AGAIN? I'M MAKING IT HARDER.`, `P${w} WINS TWICE. I NOTICED.`]);
  if (wasLast) return pick([`P${w} WAS LAST. NOT ANYMORE.`, 'A COMEBACK. I LIKE THOSE.']);
  if (gap <= 1 && match.eventIdx >= 1) return pick(['ONE POINT APART. GOOD.', 'TOO CLOSE TO CALL. PERFECT.']);
  if (s[0].points - s[1].points >= 4) return pick([`P${s[0].seat} IS RUNNING AWAY. NOT FOR LONG.`, `P${last}: TAKE A CARD. YOU NEED IT.`]);
  return pick([`P${last}: I'M DEALING YOU SOMETHING NASTY.`, 'KEEP GOING. I HAVE MORE.', `P${w} TAKES IT. FOR NOW.`]);
}

// ---------- drawing ----------
/**
 * The shared stage: everything you see is the Cabinet's screen. A base colour
 * per act (warm → cold → hot), quiet bands, two neon tubes, scanlines and a
 * rounded CRT bezel. Act 3 slips a scanline slice now and then (not in calm mode).
 */
export function drawStage(g, act, t, drift, { calm = false, tubes = true } = {}) {
  const A = ACTS[act] || ACTS[1];
  const D = (c) => (drift ? drift.col(c, 'bg') : c);
  g.rect(0, 0, 320, 180, D(A.base), true);
  for (let k = 0; k < 6; k++) { g.alpha(0.35 + k * 0.08); g.rect(0, 60 + k * 20, 320, 20, D(A.mid), true); }
  g.alpha(1);
  if (tubes) {
    g.alpha(0.18); g.rect(0, 0, 320, 3, A.accent, true); g.rect(0, 177, 320, 3, A.accent, true); g.alpha(1);
    g.rect(0, 1, 320, 1, A.accent, true); g.rect(0, 178, 320, 1, A.accent, true);
  }
  if (act === 3 && !calm) {
    const k = (t * 0.7) % 4;
    if (k < 0.12) { const y = 20 + Math.floor((t * 97) % 140); g.alpha(0.5); g.rect(0, y, 320, 3, A.accent, true); g.alpha(1); }
  }
}
/** Scanlines and the CRT bezel, drawn last over a menu screen. */
export function drawCrt(g, strength = 1) {
  const c = g.c;
  c.save();
  c.globalAlpha = 0.09 * strength; c.fillStyle = '#000';
  for (let y = 1; y < 360; y += 4) c.fillRect(0, y, 640, 2);
  c.restore();
  drawBezel(g);
}
/** Rounded dark corners: the glass of the Cabinet's screen. Cheap enough for every frame. */
export function drawBezel(g) {
  const c = g.c, r = 22;
  c.save(); c.fillStyle = '#000';
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [640, 0, -1, 1], [0, 360, 1, -1], [640, 360, -1, -1]]) {
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + sx * r, y); c.quadraticCurveTo(x, y, x, y + sy * r); c.closePath(); c.fill();
  }
  c.restore();
}

/** The Cabinet itself: faceless, a marquee and a glowing screen. Used as its "speaker" icon. */
export function drawCabinet(g, x, y, s = 1, glow = P.warn) {
  g.rect(x - 7 * s, y - 2 * s, 14 * s, 18 * s, '#1a1630', true);
  g.frame(x - 7 * s, y - 2 * s, 14 * s, 18 * s, '#4a4270', 1, true);
  g.rect(x - 6 * s, y - 1 * s, 12 * s, 3 * s, glow, true);
  g.rect(x - 5 * s, y + 3 * s, 10 * s, 7 * s, '#0b0a12', true);
  g.alpha(0.5); g.rect(x - 4 * s, y + 4 * s, 8 * s, 5 * s, glow, true); g.alpha(1);
  g.rect(x - 4 * s, y + 11 * s, 8 * s, 2 * s, '#2a2448', true);
}

/** The Cabinet speaks: its icon, then the line typed out. Returns the number of characters shown. */
export function drawVoice(g, text, x, y, t, { col = P.warn, speed = 32, align = 'center', box = true } = {}) {
  const n = Math.min(text.length, Math.floor(t * speed));
  const shown = text.slice(0, n);
  const w = g.textW(text, 2);
  const x0 = align === 'center' ? x - (w + 18) / 2 : x;
  if (box) { g.rect(x0 - 3, y - 4, w + 24, 15, P.ink, true); g.frame(x0 - 3, y - 4, w + 24, 15, col, 1, true); }
  drawCabinet(g, x0 + 5, y - 2, 0.62, col);
  g.text(shown, x0 + 14, y, { scale: 2, col, shadow: null });
  if (n < text.length && Math.floor(t * 6) % 2) g.rect(x0 + 14 + g.textW(shown, 2) + 1, y, 4, 7, col, true);
  return n;
}

/**
 * The night strip: one slot per event, coloured by act; finished slots show
 * the winner's colour, the current one is framed. You see the whole night's
 * shape before it happens.
 */
export function drawNightStrip(g, x, y, w, playlist, idx, winners, tierOf, games) {
  const n = playlist.length;
  const gap = 2, sw = (w - gap * (n - 1)) / n;
  playlist.forEach((id, i) => {
    const k = tierOf(id) || 1;
    const sx = x + i * (sw + gap);
    const A = ACTS[k];
    const done = i < idx, cur = i === idx;
    g.rect(sx, y, sw, 7, done ? '#0b0a12' : cur ? A.accent : '#1a1630', true);
    g.frame(sx, y, sw, 7, A.accent, 1, true);
    if (done && winners[i]) g.rect(sx + 2, y + 2, sw - 4, 3, SEAT_COLORS[winners[i] - 1], true);
    if (cur) g.frame(sx - 1, y - 1, sw + 2, 9, P.text, 1, true);
    if (i > 0 && (tierOf(playlist[i - 1]) || 1) !== k) g.rect(sx - 2, y - 2, 1, 11, P.dim, true);
    void games;
  });
}
