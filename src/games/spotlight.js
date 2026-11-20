// SPOTLIGHT: the bar's little stage. One spotlight lands on a platform; stand
// in it ALONE and the seconds are yours. Two in the light and nobody scores.
// Shots shove (no knockouts). The light moves every 9 s with a warning; the
// stage lamps fall on whoever holds it. At 30 s: the ENCORE, a smaller light
// that moves faster. Act 1: the rules are intact, it's about reading a crowd.
import { clamp, rand, overlap } from '../engine/util.js';
import { drawPlayer, drawTag, drawArm, SEAT_COLORS } from '../engine/sprites.js';
import { makeBody, platformControl, stepBody } from './platformer.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { Drift, P } from '../engine/style.js';

export const meta = {
  id: 'spotlight', name: 'SPOTLIGHT', color: '#fff2a8', music: 'coins', tier: 1,
  tagline: 'One light. One star. Pick a fight.',
  card: { rule: 'STAND IN THE SPOTLIGHT ALONE TO SCORE', rule2: 'TWO IN THE LIGHT: NOBODY. KEEP MOVING', keys: [['A', 'JUMP'], ['X', 'SHOVE'], ['RB', 'BLOCK']], danger: 'FALLING STAGE LAMPS, THE PIT' },
  objective: 'Most seconds alone in the spotlight. Shots shove, nobody is knocked out. The light moves every 9 s.',
  controls: [['STICK', 'Move and aim'], ['A', 'Jump (double jump)'], ['X / RT', 'Shoot: shoves rivals'], ['RB', 'Block'], ['R-STICK', 'Aim freely']],
  hazards: 'Stand still in the light for 2 s and the crowd boos: no score / stage lamps fall on the star (from 12 s) / the pit costs 2 s / at 30 s the ENCORE',
  ghost: 'Out of sudden death: float above the stage, X drops a lamp',
  tiebreak: 'More seconds in the light > more shoves landed',
  gunUse: 'Your gun (shoves rivals out of the light)', blockUse: 'Your block (RB)', bodyUse: 'Your body',
  twists: ['moon', 'heavy', 'wind', 'tilt', 'rubber', 'giant', 'bullettime'],
};

const TIME = 50;
const MOVE = 9, MOVE_ENCORE = 6, ENCORE_AT = 30, WARN = 1.6;
const LAMP_AT = 12, LAMP_EVERY = 4.5;
const SHOVE = 165;
export const LAYOUTS = [
  { name: 'MAIN STAGE',
    solids: [{ x: 0, y: 156, w: 120, h: 24 }, { x: 200, y: 156, w: 120, h: 24 },
      { x: 24, y: 118, w: 60, h: 4, oneWay: 1 }, { x: 236, y: 118, w: 60, h: 4, oneWay: 1 }, { x: 120, y: 100, w: 80, h: 4, oneWay: 1 },
      { x: 40, y: 76, w: 50, h: 4, oneWay: 1 }, { x: 230, y: 76, w: 50, h: 4, oneWay: 1 }, { x: 135, y: 52, w: 50, h: 4, oneWay: 1 }],
    spots: [[60, 156], [260, 156], [54, 118], [266, 118], [160, 100], [65, 76], [255, 76], [160, 52]],
    spawns: [[40, 150], [280, 150], [160, 94]] },
  { name: 'THE BAR TOP',
    solids: [{ x: 0, y: 160, w: 120, h: 20 }, { x: 200, y: 160, w: 120, h: 20 }, { x: 30, y: 124, w: 90, h: 6 }, { x: 200, y: 124, w: 90, h: 6 },
      { x: 110, y: 90, w: 100, h: 4, oneWay: 1 }, { x: 20, y: 62, w: 60, h: 4, oneWay: 1 }, { x: 240, y: 62, w: 60, h: 4, oneWay: 1 }],
    spots: [[60, 160], [260, 160], [75, 124], [245, 124], [160, 90], [50, 62], [270, 62]],
    spawns: [[40, 154], [280, 154], [160, 84]] },
  { name: 'BALCONY',
    solids: [{ x: 0, y: 150, w: 90, h: 30 }, { x: 230, y: 150, w: 90, h: 30 }, { x: 120, y: 166, w: 80, h: 14 },
      { x: 90, y: 112, w: 140, h: 4, oneWay: 1 }, { x: 20, y: 86, w: 50, h: 4, oneWay: 1 }, { x: 250, y: 86, w: 50, h: 4, oneWay: 1 }, { x: 130, y: 62, w: 60, h: 4, oneWay: 1 }],
    spots: [[45, 150], [275, 150], [160, 166], [125, 112], [195, 112], [45, 86], [275, 86], [160, 62]],
    spawns: [[40, 144], [280, 144], [160, 106]] },
];

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  const L = LAYOUTS[ctx.variant % LAYOUTS.length];
  const solids = L.solids.map((s) => ({ ...s }));
  const drift = ctx.drift || new Drift();
  let env = twistEnv(tw, 0);
  let t = 0, endT = null, encore = false;

  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const [sx, sy] = L.spawns[i % 3];
    const w = 8 * st.size, h = 11 * st.size;
    const p = {
      seat: pl.seat, idx: pl.idx, b: makeBody(sx - w / 2, sy - h - 2, w, h), face: sx < 160 ? 1 : -1, ghost: !!pl.ghost,
      score: 0, landed: 0, stillT: 0, anchor: null, booed: false, gs: newGunState(st.gun), blockT: 0, blockCd: 0, invT: 1, flashT: 0, slowT: 0, shields: st.shields,
      mult: pl.pickupMult ?? 1, gh: { x: sx, y: 40, cd: 1 }, inLight: false,
    };
    p.pos = () => (p.ghost ? [p.gh.x, p.gh.y] : [p.b.x + p.b.w / 2, p.b.y + p.b.h / 2]);
    return makeBuffable(p, st);
  });
  const live = () => players.filter((p) => !p.ghost);

  // the spotlight
  const farFromSpawns = L.spots.map((s, k) => k).filter((k) => L.spawns.every(([sx, sy]) => Math.hypot(sx - L.spots[k][0], sy - L.spots[k][1]) > 40));
  const z = { spot: farFromSpawns.length ? farFromSpawns[Math.floor(rand(0, farFromSpawns.length))] : 0, next: null, w: 44, t: 0, warned: false, solo: null, contested: false };
  const zoneAt = (k) => ({ x: L.spots[k][0], y: L.spots[k][1] });
  function pickNext() { let k; do k = Math.floor(rand(0, L.spots.length)); while (k === z.spot); return k; }
  const inZone = (p, k = z.spot) => {
    const { x, y } = zoneAt(k), cx = p.b.x + p.b.w / 2, bottom = p.b.y + p.b.h;
    return Math.abs(cx - x) < z.w / 2 && bottom > y - 30 && bottom < y + 2;
  };
  const lamps = [];
  let lampT = LAMP_AT;
  const game = { meta, finished: false, ranking: [], players, layoutName: L.name };

  function solidAt(x, y) { for (const s of solids) if (!s.oneWay && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return { rect: s }; return null; }
  function groundBelow(x, from = 20) { let best = 190; for (const s of solids) if (x >= s.x && x <= s.x + s.w && s.y < best && s.y > from) best = s.y; return best; }

  function shove(p, dx, dy, k, src = null) {
    if (p.ghost || p.invT > 0) return 'none';
    const [cx, cy] = p.pos();
    if (p.blockT > 0) { fx.ring(cx, cy, 12, P.safe); sound.sfx('block'); return 'blocked'; }
    if (p.shields > 0) { p.shields -= 1; p.invT = 0.4; fx.popup('AIRBAG!', cx, cy - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
    p.b.vx += dx * k * p.st.knockTaken; p.b.vy += dy * k * 0.6 * p.st.knockTaken - 90; p.b.stun = 0.28; p.flashT = 0.12; p.invT = 0.15;
    if (src && src !== p && src.landed !== undefined) src.landed += 1;
    fx.impact(cx, cy, { dmg: 22, col: SEAT_COLORS[p.idx], dx, dy }); sound.sfx('hit');
    return 'hit';
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: 15, x1: 320, y1: 182, open: { top: true, bottom: true } },
    accel: () => [140 * env.bulletGrav * env.gx + env.wind, 140 * env.bulletGrav * env.gy],
    solidAt,
    targets: () => live().map((p) => ({ ref: p, owner: p, rect: p.b, r: p.b.w / 2 })),
    onHit: (p, info) => {
      if (p.blockT > 0 && p.st.reflect && info.kind === 'bullet') return 'reflect';
      return shove(p, info.dx, info.dy, SHOVE * (info.g.knock || 1) * (info.kind === 'blast' ? 1.3 : 1), info.owner) === 'none' ? 'none' : 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega'], spot: () => { const s = solids[Math.floor(rand(0, solids.length))]; return [clamp(s.x + rand(6, s.w - 6), 8, 312), s.y - 8]; } });

  function moveLight() {
    z.spot = z.next; z.next = null; z.t = 0; z.warned = false;
    const { x, y } = zoneAt(z.spot);
    fx.ring(x, y - 12, 26, meta.color, 0.4); sound.sfx('boing');
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    if (!encore && t >= ENCORE_AT) { encore = true; z.w = 30; fx.popup('ENCORE! THE LIGHT SHRINKS', 160, 40, P.warn, 2); sound.sfx('warn'); drift.kick(meta.color, 0.8); }
    // the light: warn, then move
    z.t += dt;
    const every = encore ? MOVE_ENCORE : MOVE;
    if (!z.warned && z.t >= every - WARN) { z.warned = true; z.next = pickNext(); sound.sfx('warn'); }
    if (z.t >= every) moveLight();
    // players
    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.ghost) {
        const gh = p.gh; gh.x = clamp(gh.x + c.mx * 150 * dt, 6, 314); gh.y = clamp(gh.y + c.my * 150 * dt, 24, 70); gh.cd -= dt;
        if (c.fireP && gh.cd <= 0) { lamps.push({ x: gh.x, y: -10, vy: 0, ty: groundBelow(gh.x), warn: 1.0 }); gh.cd = 3.5; sound.sfx('warn'); }
        continue;
      }
      tickBuffs(p, dt);
      p.blockT -= dt; p.blockCd -= dt; p.invT -= dt; p.flashT -= dt; p.slowT -= dt;
      p.b.slowT = p.slowT;
      const ev = platformControl(p.b, c, p.st, dt, env);
      if (ev) { sound.sfx('jump'); fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#c8b8a0'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      if (c.blockP && p.blockCd <= 0) { p.blockT = 0.3; p.blockCd = 2.4 * p.st.blockCd; sound.sfx('block'); }
      const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.4 ? Math.atan2(c.my, c.mx) : (p.face > 0 ? 0 : Math.PI);
      const [cx, cy] = p.pos();
      if (guns.trigger(p, p.gs, p.st.gun, c.fire && p.b.stun <= 0, a, cx + Math.cos(a) * 9, cy - 1 + Math.sin(a) * 9, dt)) { p.b.vx -= Math.cos(a) * 25; p.b.squash = 0.2; }
      stepBody(p.b, dt, solids);
      if (p.b.landed) fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#c8b8a0');
      if (p.b.y > 186) { // the pit: back from the top, minus two seconds
        const [sx, sy] = L.spawns[Math.floor(rand(0, 3))];
        p.b.x = sx - p.b.w / 2; p.b.y = 16; p.b.vx = 0; p.b.vy = 0; p.invT = 1;
        const lost = Math.min(2, p.score); p.score -= lost;
        if (lost >= 0.5) fx.popup(`-${Math.round(lost)}s`, sx, 30, P.danger, 2);
        sound.sfx('lose'); void sy;
      }
    }
    // scoring: alone in the light
    const inside = live().filter((p) => inZone(p));
    for (const p of players) p.inLight = inside.includes(p);
    z.contested = inside.length > 1;
    // a performer has to perform: stand still in the light for 2 s and the crowd boos (no score)
    for (const p of live()) {
      const [px, py] = p.pos();
      if (!p.anchor || Math.hypot(px - p.anchor[0], py - p.anchor[1]) > 8) { p.anchor = [px, py]; p.stillT = 0; p.booed = false; } else p.stillT += dt;
      if (p.stillT > 2 && inside.includes(p) && !p.booed) { p.booed = true; fx.popup('BOO! MOVE IT', px, py - 20, P.danger, 2); sound.sfx('lose'); }
    }
    const solo = inside.length === 1 && inside[0].stillT <= 2 ? inside[0] : null;
    if (solo && solo !== z.solo) { sound.sfx('coin'); const [cx, cy] = solo.pos(); fx.ring(cx, cy, 14, SEAT_COLORS[solo.idx], 0.3); }
    z.solo = solo;
    if (solo) solo.score += dt;
    // stage lamps fall on the star
    if (t >= lampT) {
      lampT = t + LAMP_EVERY * (encore ? 0.75 : 1);
      const tgt = solo || null;
      const x = tgt ? clamp(tgt.pos()[0] + rand(-6, 6), 10, 310) : zoneAt(z.spot).x + rand(-10, 10);
      lamps.push({ x, y: -10, vy: 0, ty: groundBelow(x), warn: 1.1 });
      sound.sfx('warn');
    }
    for (let i = lamps.length - 1; i >= 0; i--) {
      const lm = lamps[i];
      if (lm.warn > 0) { lm.warn -= dt; continue; }
      lm.vy += 900 * dt; lm.y += lm.vy * dt;
      const box = { x: lm.x - 6, y: lm.y - 8, w: 12, h: 8 };
      for (const p of live()) if (overlap(box, p.b)) shove(p, Math.sign(p.b.x + p.b.w / 2 - lm.x) || 1, 0.3, 220);
      if (lm.y >= lm.ty) {
        fx.burst(lm.x, lm.ty, 14, '#fff2a8', { speed: 90, life: 0.4, angle: -Math.PI / 2, spread: Math.PI }); fx.shake(0.3); sound.sfx('boom');
        for (const p of live()) if (Math.abs(p.b.x + p.b.w / 2 - lm.x) < 14 && Math.abs(p.b.y + p.b.h - lm.ty) < 14) shove(p, Math.sign(p.b.x + p.b.w / 2 - lm.x) || 1, -0.5, 200);
        lamps.splice(i, 1);
      }
    }
    guns.update(dt);
    pickups.update(dt, live().map((p) => { const [x, y] = p.pos(); return { p, x, y, r: p.b.w / 2 + 2, mult: p.mult }; }));
    if (endT === null && t >= TIME) endT = 1.2;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    // whole seconds decide it; ties go to whoever fought (an idle player can't win a tie)
    const key = (p) => [Math.floor(p.score), p.landed, p.recoilAt ? 1 : 0];
    const cmp = (a, b) => { const x = key(a), y = key(b); for (let k = 0; k < x.length; k++) if (y[k] !== x[k]) return y[k] - x[k]; return 0; };
    return [...live().sort(cmp), ...players.filter((p) => p.ghost)].map((p) => p.seat);
  }
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.ghost ? 'GHOST' : `${Math.floor(p.score)}s`; };
  game.hudInfo = (seat) => { const p = players.find((x) => x.seat === seat); return p.ghost ? { text: 'GHOST', pips: 0, pipMax: 0 } : { text: `${Math.floor(p.score)}s` + (z.solo === p ? ' STAR' : ''), pips: 0, pipMax: 0 }; };
  game.leader = () => { const r = live().filter((p) => p.score >= 1).sort((a, b) => b.score - a.score); return r.length ? r[0].seat : null; };
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || p.ghost) return null;
    const k = z.next != null ? z.next : z.spot;
    const { x, y } = zoneAt(k);
    return [x, y - 8];
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    const D = (c, layer = 'bg') => drift.col(c, layer);
    // L0: a dark little club: curtain folds, a quiet back wall
    g.rect(0, 0, 320, 180, D('#120c16'), true);
    for (let x = 0; x < 320; x += 16) { g.rect(x, 15, 8, 165, D('#1a1020'), true); g.rect(x + 8, 15, 2, 165, D('#160e1c'), true); }
    g.rect(0, 15, 320, 6, D('#3a1424'), true);
    if (t < 2.5) { g.alpha(Math.min(1, (2.5 - t) * 2)); g.text(L.name, 160, 26, { scale: 2, col: '#b89a70', align: 'center', shadow: null }); g.alpha(1); }
    // the spotlight cone: the brightest thing on stage, so the goal reads from the couch
    const { x: zx, y: zy } = zoneAt(z.spot);
    const col = z.contested ? P.warn : z.solo ? SEAT_COLORS[z.solo.idx] : meta.color;
    for (let y = 15; y < zy; y += 2) {
      const k = (y - 15) / Math.max(1, zy - 15), w = 6 + (z.w - 6) * k;
      g.alpha(0.06 + 0.1 * k); g.rect(zx - w / 2, y, w, 2, col); g.alpha(1);
    }
    g.alpha(0.3); g.rect(zx - z.w / 2, zy - 30, z.w, 30, col); g.alpha(1);
    g.rect(zx - z.w / 2, zy - 1, z.w, 2, col);
    g.rect(zx - 5, 15, 10, 4, '#3a3450'); g.rect(zx - 3, 18, 6, 2, '#fff2a8');
    if (z.contested) { g.rect(zx - 38, zy - 44, 76, 10, P.ink); g.text('CONTESTED', zx, zy - 42.5, { scale: 2, col: P.warn, align: 'center', ui: false, shadow: null }); }
    // where it goes next: a steady dashed outline and a countdown
    if (z.next != null) {
      const n = zoneAt(z.next), left = Math.ceil((encore ? MOVE_ENCORE : MOVE) - z.t);
      g.dotted(n.x - z.w / 2, n.y - 30, n.x + z.w / 2, n.y - 30, meta.color, 3); g.dotted(n.x - z.w / 2, n.y - 1, n.x + z.w / 2, n.y - 1, meta.color, 3);
      g.dotted(n.x - z.w / 2, n.y - 30, n.x - z.w / 2, n.y - 1, meta.color, 3); g.dotted(n.x + z.w / 2, n.y - 30, n.x + z.w / 2, n.y - 1, meta.color, 3);
      g.text(String(left), n.x, n.y - 40, { scale: 2, col: meta.color, align: 'center', ui: false });
    }
    // L1: stage geometry, fixed bright standing edges
    for (const s of solids) {
      g.rect(s.x, s.y, s.w, s.h, D(s.oneWay ? '#5a4a6a' : '#2a2034', 'geo'));
      g.rect(s.x, s.y, s.w, s.oneWay ? 1 : 2, '#e8d8c0');
    }
    // L3: lamps
    for (const lm of lamps) {
      if (lm.warn > 0) { g.ring(lm.x, lm.ty - 3, 8, P.danger); g.text(String(Math.ceil(lm.warn * 3)), lm.x, lm.ty - 22, { scale: 2, col: P.warn, align: 'center', ui: false }); }
      else { g.rect(lm.x - 6, lm.y - 8, 12, 6, '#4a4458'); g.rect(lm.x - 4, lm.y - 2, 8, 2, '#fff2a8'); g.ring(lm.x, lm.y - 4, 7, P.danger); }
    }
    pickups.draw(g);
    guns.draw(g);
    for (const p of players) {
      if (p.ghost) { drawPlayer(g, p.idx, p.gh.x, p.gh.y + Math.sin(t * 4 + p.idx) * 2, { alpha: 0.5, size: 0.9 }); continue; }
      const b = p.b, cx = b.x + b.w / 2;
      const blink = p.invT > 0.2 && Math.floor(t * 5) % 2;
      drawPlayer(g, p.idx, cx, b.y + b.h, { flip: p.face < 0, size: p.st.size, flash: p.flashT > 0, alpha: blink ? 0.6 : 1, squash: b.squash, look: p.aim });
      drawArm(g, p, cx, b.y + b.h / 2 - 1, p.st.size);
      if (p.blockT > 0) g.ring(cx, b.y + b.h / 2, 10 * p.st.size, P.safe);
      if (z.solo === p) { g.alpha(0.6); g.ring(cx, b.y + b.h / 2, 12 * p.st.size, SEAT_COLORS[p.idx]); g.alpha(1); }
      drawBuffs(g, p, cx, b.y - 7);
      drawTag(g, p.idx, cx, b.y - 5);
    }
  };
  return game;
}
