// RULE BREAKER: the rules are word blocks lying on the floor. Four sentences,
// FLOOR IS _, SHOTS ARE _, LEADER IS _, STICK IS _, each with a blank. Push a
// word into a blank (walk into it, or shoot it) and that rule is live, for
// everyone, right now. Words that make no sense in a sentence do nothing.
// Goal: most gems. From 30 s the sentences lock one by one.
import { clamp, rand, approach } from '../engine/util.js';
import { drawPlayer, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';

export const meta = {
  id: 'rules', name: 'RULE BREAKER', color: '#ffe14a', music: 'coins', tier: 3,
  tagline: 'The rules are blocks. Push them.',
  objective: 'Most gems wins. Push word blocks into the sentences to change the rules for everyone.',
  controls: [['STICK', 'Move (walk into words)'], ['X / RT', 'Shoot (shots push words too)'], ['A', 'Dash'], ['RB', 'Block']],
  hazards: 'Whatever the rules say / LEADER IS ... hits whoever has the most gems / from 30 s the sentences lock',
  ghost: 'Out of sudden death: you can still push words, but not collect',
  tiebreak: 'More gems > fewer hits taken',
  gunUse: 'Your gun (and whatever SHOTS ARE says)', blockUse: 'Your block and dash', bodyUse: 'Your body (and whatever the rules say)',
  twists: ['wind', 'bullettime', 'hyper', 'giant'],
};

const TOP = 16, BOT = 180;
const TIME = 50;
const LOCK_AT = 30;
const TW = 34, TH = 11; // word tile size
const SUBJECTS = [
  { id: 'FLOOR', verb: 'IS', x: 10, y: 22 },
  { id: 'SHOTS', verb: 'ARE', x: 166, y: 22 },
  { id: 'LEADER', verb: 'IS', x: 10, y: 164 },
  { id: 'STICK', verb: 'IS', x: 166, y: 164 },
];
const WORDS = ['ICE', 'FAST', 'SLOW', 'HUGE', 'TINY', 'BOUNCY', 'MAGNET', 'REVERSED', 'NORMAL'];
// what each word means in each sentence (missing = nothing happens)
const MEANING = {
  FLOOR: { ICE: 'slippery for everyone', FAST: 'everyone runs fast', SLOW: 'everyone wades', MAGNET: 'gems crawl toward the nearest player', BOUNCY: 'bumps launch people', REVERSED: 'the floor spins everyone around' },
  SHOTS: { HUGE: 'giant bullets', TINY: 'tiny fast bullets', FAST: 'bullets fly twice as fast', SLOW: 'bullets crawl', BOUNCY: 'bullets bounce 3 more times', MAGNET: 'bullets home in', REVERSED: 'guns fire backwards', ICE: 'bullets freeze people' },
  LEADER: { TINY: 'the leader shrinks', HUGE: 'the leader is a huge target', SLOW: 'the leader is slow', FAST: 'the leader is fast', REVERSED: 'the leader\'s stick is backwards', MAGNET: 'every bullet curves toward the leader', ICE: 'the leader slides', BOUNCY: 'the leader gets knocked twice as far' },
  STICK: { REVERSED: 'everyone\'s stick is backwards', FAST: 'everyone is fast', SLOW: 'everyone is slow', HUGE: 'everyone is big', TINY: 'everyone is tiny', ICE: 'everyone slides', NORMAL: 'sticks work normally' },
};

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  let env = twistEnv(tw, 0);
  let t = 0, endT = null, lockI = 0;
  const v = ctx.variant % 3;
  const sentences = SUBJECTS.map((s) => ({ ...s, sx: s.x, sw: 34, vx: s.x + 36, vw: 20, slot: { x: s.x + 58, y: s.y, w: TW, h: TH }, locked: false, rule: null }));
  // the word blocks, spread around the middle (each layout shuffles them differently)
  const order = WORDS.slice();
  for (let i = 0; i < v * 3; i++) order.push(order.shift());
  const tiles = order.map((w, i) => {
    const a = (i / order.length) * Math.PI * 2 + v * 0.4;
    return { word: w, x: 160 + Math.cos(a) * 92 - TW / 2, y: 98 + Math.sin(a) * 44 - TH / 2, w: TW, h: TH, wob: 0 };
  });
  // the game starts with STICK IS NORMAL already written
  const normal = tiles.find((q) => q.word === 'NORMAL'); const stickS = sentences[3];
  normal.x = stickS.slot.x; normal.y = stickS.slot.y;

  const starts = [[100, 70], [220, 70], [160, 130]];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const p = {
      seat: pl.seat, idx: pl.idx, x: starts[i][0], y: starts[i][1], vx: 0, vy: 0, r: 5 * st.size, face: 1, aim: 0,
      gems: 0, taken: 0, ghost: !!pl.ghost, gs: newGunState(st.gun), dashT: 0, dashCd: 0, blockT: 0, blockCd: 0,
      stun: 0, slowT: 0, invT: 0, flashT: 0, mult: pl.pickupMult ?? 1, shields: st.shields,
    };
    p.pos = () => [p.x, p.y];
    return makeBuffable(p, st);
  });
  const gems = [];
  const game = { meta, finished: false, ranking: [], players };
  const live = () => players.filter((p) => !p.ghost);
  const rule = (id) => sentences.find((s) => s.id === id).rule;
  function leader() {
    const l = live().slice().sort((a, b) => b.gems - a.gems);
    return l.length > 1 && l[0].gems > l[1].gems ? l[0] : null;
  }

  // ---- the rules, read every frame ----
  function mods(p) {
    const m = { speed: 1, size: 1, ice: false, rev: false, knock: 1 };
    const f = rule('FLOOR'), s = rule('STICK');
    if (f === 'ICE' || s === 'ICE') m.ice = true;
    if (f === 'FAST' || s === 'FAST') m.speed *= 1.4;
    if (f === 'SLOW' || s === 'SLOW') m.speed *= 0.6;
    if (f === 'BOUNCY') m.knock *= 1.8;
    if (s === 'REVERSED') m.rev = !m.rev;
    if (s === 'HUGE') m.size *= 1.4;
    if (s === 'TINY') m.size *= 0.65;
    if (p === leader()) {
      const l = rule('LEADER');
      if (l === 'TINY') m.size *= 0.6; else if (l === 'HUGE') m.size *= 1.7;
      else if (l === 'SLOW') m.speed *= 0.6; else if (l === 'FAST') m.speed *= 1.35;
      else if (l === 'REVERSED') m.rev = !m.rev; else if (l === 'ICE') m.ice = true; else if (l === 'BOUNCY') m.knock *= 2;
    }
    return m;
  }
  function gunFor(p) {
    const g = { ...p.st.gun };
    const s = rule('SHOTS');
    if (s === 'HUGE') { g.size *= 2.6; g.speed *= 0.8; }
    else if (s === 'TINY') { g.size *= 0.5; g.speed *= 1.4; }
    else if (s === 'FAST') g.speed *= 1.9;
    else if (s === 'SLOW') g.speed *= 0.45;
    else if (s === 'BOUNCY') g.bounces += 3;
    else if (s === 'MAGNET') g.homing += 1.5;
    else if (s === 'ICE') g.frost = 1;
    return g;
  }

  function announce(sn, word) {
    const meaning = word && MEANING[sn.id][word];
    sound.sfx(meaning ? 'boing' : 'move');
    const cx = sn.x + 46, cy = sn.y < 90 ? sn.y + 22 : sn.y - 12;
    if (!word) { fx.popup(`${sn.id} ${sn.verb} ...NOTHING`, 160, 60, '#ffe14a', 1); return; }
    fx.popup(`${sn.id} ${sn.verb} ${word}`, 160, 56, '#fff', 2);
    fx.popup(meaning ? meaning.toUpperCase() : 'NOTHING HAPPENS', 160, 74, meaning ? '#ffe14a' : '#a59fc4', 1);
    fx.burst(cx, cy, 14, '#ffe14a', { speed: 70, life: 0.4 });
    if (meaning) { fx.hueKick = (fx.hueKick || 0) + 14; fx.flash('#ffe14a', 0.12); }
  }
  function readRules() {
    for (const sn of sentences) {
      const tile = tiles.find((q) => Math.abs(q.x - sn.slot.x) < 9 && Math.abs(q.y - sn.slot.y) < 6);
      const w = tile ? tile.word : null;
      if (w !== sn.rule) { sn.rule = w; if (t > 0.1) announce(sn, w); }
    }
  }

  // ---- pushing words ----
  const statics = sentences.flatMap((s) => [{ x: s.sx, y: s.y, w: s.sw, h: TH }, { x: s.vx, y: s.y, w: s.vw, h: TH }]);
  const rectHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const tileLocked = (q) => sentences.some((s) => s.locked && Math.abs(q.x - s.slot.x) < 9 && Math.abs(q.y - s.slot.y) < 6);
  function tryMove(q, dx, dy) {
    if (tileLocked(q)) return false;
    const n = { x: q.x + dx, y: q.y + dy, w: q.w, h: q.h };
    if (n.x < 2 || n.x + n.w > 318 || n.y < TOP + 2 || n.y + n.h > BOT - 1) return false;
    if (statics.some((s) => rectHit(n, s))) return false;
    for (const o of tiles) if (o !== q && rectHit(n, o)) { if (!tryMove(o, dx, dy)) return false; } // push a whole row of words
    q.x = n.x; q.y = n.y;
    return true;
  }
  function pushTiles(p) {
    for (const q of [...tiles, ...statics]) {
      const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
      const ox = p.r + q.w / 2 - Math.abs(p.x - cx), oy = p.r + q.h / 2 - Math.abs(p.y - cy);
      if (ox <= 0 || oy <= 0) continue;
      const isTile = tiles.includes(q);
      if (ox < oy) {
        const dir = Math.sign(cx - p.x) || 1;
        if (!isTile || !tryMove(q, dir * Math.min(ox, 3), 0)) p.x -= dir * ox;
        else if (isTile) q.wob = 0.15;
      } else {
        const dir = Math.sign(cy - p.y) || 1;
        if (!isTile || !tryMove(q, 0, dir * Math.min(oy, 3))) p.y -= dir * oy;
        else if (isTile) q.wob = 0.15;
      }
    }
  }

  function freeSpot() {
    for (let k = 0; k < 40; k++) {
      const x = rand(16, 304), y = rand(TOP + 22, BOT - 22);
      if (![...tiles, ...statics].some((q) => x > q.x - 6 && x < q.x + q.w + 6 && y > q.y - 6 && y < q.y + q.h + 6)) return [x, y];
    }
    return [160, 98];
  }
  const addGem = (x, y, big = false, vx = 0, vy = 0) => gems.push({ x, y, vx, vy, big, t: 0 });
  for (let k = 0; k < 6; k++) addGem(...freeSpot());

  function hurt(p, from, dx, dy) {
    if (p.ghost || p.invT > 0) return 'none';
    if (p.blockT > 0) { sound.sfx('block'); fx.ring(p.x, p.y, p.r + 5, '#5affd9'); return 'blocked'; }
    if (p.shields > 0) { p.shields -= 1; p.invT = 0.6; fx.popup('AIRBAG!', p.x, p.y - 12, '#9fd3ff', 1); sound.sfx('block'); return 'blocked'; }
    const m = mods(p);
    p.invT = 0.9; p.stun = 0.25; p.flashT = 0.15; p.taken += 1;
    p.vx += dx * 170 * p.st.knockTaken * m.knock; p.vy += dy * 170 * p.st.knockTaken * m.knock;
    if (p.gems > 0) { p.gems -= 1; const a = rand(0, Math.PI * 2); addGem(p.x, p.y, false, Math.cos(a) * 90, Math.sin(a) * 90); fx.popup('-1', p.x, p.y - 14, '#ff5a5a', 1); }
    fx.shake(0.18); sound.sfx('hit'); fx.burst(p.x, p.y, 10, SEAT_COLORS[p.idx], { speed: 90, life: 0.4 });
    void from;
    return 'hit';
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: BOT, open: {} },
    accel: (x, y) => {
      let ax = env.wind, ay = 0;
      const l = rule('LEADER') === 'MAGNET' ? leader() : null;
      if (l) { const d = Math.hypot(l.x - x, l.y - y) || 1; ax += ((l.x - x) / d) * 320; ay += ((l.y - y) / d) * 320; }
      return [ax, ay];
    },
    solidAt: (x, y) => { for (const q of [...tiles, ...statics]) if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) return { rect: q }; return null; },
    targets: () => live().map((p) => ({ ref: p, owner: p, x: p.x, y: p.y, r: p.r })),
    onHit: (p, info) => {
      if (p.blockT > 0 && p.st.reflect && info.kind === 'bullet') return 'reflect';
      if (info.g.frost) p.slowT = 1.5;
      return hurt(p, info.owner, info.dx, info.dy) === 'none' ? 'none' : 'hit';
    },
    onPaint: (b, x, y, end) => {
      if (!end) return;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const ax = x + (b.vx / sp) * 3, ay = y + (b.vy / sp) * 3;
      const q = tiles.find((o) => ax >= o.x && ax <= o.x + o.w && ay >= o.y && ay <= o.y + o.h);
      if (!q) return;
      const k = 7 * Math.sqrt(b.g.knock || 1) * (b.r > 3 ? 1.6 : 1);
      if (Math.abs(b.vx) > Math.abs(b.vy)) tryMove(q, Math.sign(b.vx) * k, 0); else tryMove(q, 0, Math.sign(b.vy) * k);
      q.wob = 0.2; sound.sfx('bump');
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega'], spot: freeSpot });

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    // the turn: sentences lock one by one
    if (t >= LOCK_AT + lockI * 4 && lockI < sentences.length) {
      const sn = sentences[[1, 0, 3, 2][lockI]]; sn.locked = true; lockI++;
      fx.popup(`${sn.id} IS LOCKED`, 160, 92, '#ff5a5a', 2); sound.sfx('warn'); fx.shake(0.2);
    }
    const flr = rule('FLOOR');
    for (const p of players) {
      const c = controls.get(p.seat);
      const m = mods(p);
      p.r = 5 * p.st.size * m.size;
      tickBuffs(p, dt);
      p.dashCd -= dt; p.blockT -= dt; p.blockCd -= dt; p.slowT -= dt; p.flashT -= dt; p.invT -= dt;
      let mx = c.mx, my = c.my;
      if (m.rev) { mx = -mx; my = -my; }
      const max = 84 * p.st.speed * m.speed * (p.slowT > 0 ? 0.55 : 1);
      if (p.dashT > 0) p.dashT -= dt;
      else if (p.stun > 0) { p.stun -= dt; p.vx *= Math.pow(0.1, dt); p.vy *= Math.pow(0.1, dt); }
      else {
        const acc = m.ice || env.ice ? 160 : 900;
        p.vx = approach(p.vx, mx * max, acc * dt); p.vy = approach(p.vy, my * max, acc * dt);
        if (c.jumpP && p.dashCd <= 0) {
          const mm = Math.hypot(mx, my); const dx = mm > 0.2 ? mx / mm : p.face, dy = mm > 0.2 ? my / mm : 0;
          p.vx = dx * 250; p.vy = dy * 250; p.dashT = 0.14; p.dashCd = 1.2 * p.st.blockCd; sound.sfx('dash');
        }
      }
      if (flr === 'REVERSED') { const dx = p.x - 160, dy = p.y - 98; p.vx += -dy * 1.2 * dt; p.vy += dx * 1.2 * dt; }
      p.vx += env.wind * 0.5 * dt;
      if (c.blockP && p.blockCd <= 0) { p.blockT = 0.45; p.blockCd = 2.6 * p.st.blockCd; sound.sfx('block'); }
      if (Math.abs(mx) > 0.2) p.face = Math.sign(mx);
      p.x = clamp(p.x + p.vx * dt, p.r, 320 - p.r); p.y = clamp(p.y + p.vy * dt, TOP + p.r, BOT - p.r);
      pushTiles(p);
      p.x = clamp(p.x, p.r, 320 - p.r); p.y = clamp(p.y, TOP + p.r, BOT - p.r);
      let a = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(mx, my) > 0.3 ? Math.atan2(my, mx) : (p.face > 0 ? 0 : Math.PI);
      if (m.rev && c.aim) a += Math.PI;
      p.aim = a;
      const shootA = rule('SHOTS') === 'REVERSED' ? a + Math.PI : a;
      guns.trigger(p, p.gs, gunFor(p), c.fire && p.stun <= 0, shootA, p.x + Math.cos(shootA) * 6, p.y + Math.sin(shootA) * 6, dt);
    }
    // bumps
    const al = players;
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const a = al[i], b = al[j]; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), mn = a.r + b.r;
      if (d >= mn || d === 0) continue;
      const nx = dx / d, ny = dy / d, push = (mn - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      if (flr === 'BOUNCY') { a.vx -= nx * 220; a.vy -= ny * 220; b.vx += nx * 220; b.vy += ny * 220; sound.sfx('boing'); }
    }
    for (const q of tiles) q.wob -= dt;
    readRules();
    // gems
    for (let i = gems.length - 1; i >= 0; i--) {
      const gm = gems[i];
      gm.t += dt; gm.x += gm.vx * dt; gm.y += gm.vy * dt; gm.vx *= Math.pow(0.05, dt); gm.vy *= Math.pow(0.05, dt);
      if (flr === 'MAGNET') {
        let best = null, bd = 1e9;
        for (const p of live()) { const d = Math.hypot(p.x - gm.x, p.y - gm.y); if (d < bd) { bd = d; best = p; } }
        if (best && bd < 120) { gm.x += ((best.x - gm.x) / bd) * 30 * dt; gm.y += ((best.y - gm.y) / bd) * 30 * dt; }
      }
      gm.x = clamp(gm.x, 6, 314); gm.y = clamp(gm.y, TOP + 6, BOT - 6);
      if (gm.t < 0.4) continue;
      const p = live().find((o) => Math.hypot(o.x - gm.x, o.y - gm.y) < o.r + 5);
      if (!p) continue;
      const val = gm.big ? 3 : 1; p.gems += val; gems.splice(i, 1); sound.sfx('coin');
      fx.popup(`+${val}`, gm.x, gm.y - 8, gm.big ? '#ffe14a' : '#fff', 1);
    }
    if (gems.filter((g) => g.t > 0.4).length < 5 && Math.random() < dt * 2) addGem(...freeSpot());
    if (Math.floor((t - dt) / 10) !== Math.floor(t / 10)) { const [x, y] = freeSpot(); addGem(x, y, true); fx.popup('BIG GEM!', x, y - 10, '#ffe14a', 1); }
    guns.update(dt);
    pickups.update(dt, live().map((p) => ({ p, x: p.x, y: p.y, r: p.r + 2, mult: p.mult })));
    if (endT === null && t >= TIME) endT = 1.2;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    return [...live().sort((a, b) => (b.gems - a.gems) || (a.taken - b.taken)), ...players.filter((p) => p.ghost)].map((p) => p.seat);
  }
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.ghost ? 'PUSHER' : `${p.gems} GEMS` + (p === leader() ? ' LEAD' : ''); };
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p) return null;
    let best = null, bd = 1e9;
    for (const gm of gems) { const d = Math.hypot(gm.x - p.x, gm.y - p.y) - (gm.big ? 40 : 0); if (d < bd) { bd = d; best = gm; } }
    return best ? [best.x, best.y] : null;
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });
  game.rules = () => Object.fromEntries(sentences.map((sn) => [sn.id, sn.rule]));
  game.tiles = tiles; game.sentences = sentences; game.mods = mods;

  function tile(g, x, y, w, word, kind, glow = false, lock = false) {
    const bg = kind === 'subject' ? '#ff5fd2' : kind === 'verb' ? '#e8e4f8' : '#ffe14a';
    if (glow) { g.alpha(0.35 + Math.sin(t * 6) * 0.15); g.rect(x - 2, y - 2, w + 4, TH + 4, bg); g.alpha(1); }
    g.rect(x, y, w, TH, '#0b0a12');
    g.rect(x + 1, y + 1, w - 2, TH - 2, kind === 'word' ? '#2a2410' : kind === 'subject' ? '#2a1028' : '#20202a');
    g.frame(x, y, w, TH, bg);
    g.text(word, x + w / 2, y + 2.5, { scale: 1, col: bg, align: 'center', ui: false, shadow: null });
    if (lock) g.rect(x + w - 4, y - 2, 4, 3, '#ff5a5a');
  }

  game.draw = (g) => {
    g.rect(0, 0, 320, 180, '#0f0d1a', true);
    for (let y = TOP; y < BOT; y += 8) for (let x = 0; x < 320; x += 8) g.rect(x + 3, y + 3, 1, 1, '#1d1a30', true);
    for (const sn of sentences) {
      tile(g, sn.sx, sn.y, sn.sw, sn.id, 'subject');
      tile(g, sn.vx, sn.y, sn.vw, sn.verb, 'verb');
      const s = sn.slot;
      if (!sn.rule) { for (let x = s.x; x < s.x + s.w; x += 4) { g.rect(x, s.y, 2, 1, '#5a5480'); g.rect(x, s.y + s.h - 1, 2, 1, '#5a5480'); } g.rect(s.x, s.y, 1, s.h, '#5a5480'); g.rect(s.x + s.w - 1, s.y, 1, s.h, '#5a5480'); }
      if (sn.locked) g.text('LOCKED', s.x + s.w / 2, sn.y < 90 ? sn.y + 13 : sn.y - 7, { scale: 1, col: '#ff5a5a', align: 'center', ui: false, shadow: null });
      else if (t > LOCK_AT - 3 && Math.floor(t * 6) % 2 && lockI < 4) g.rect(s.x, sn.y < 90 ? s.y + s.h + 1 : s.y - 2, s.w, 1, '#ff5a5a');
    }
    for (const gm of gems) {
      const s = gm.big ? 4 : 2.5, bob = Math.sin(t * 5 + gm.x) * 1, col = gm.big ? '#ffe14a' : '#ffffff';
      g.rect(gm.x - s / 2, gm.y - s + bob, s, s * 2, col); g.rect(gm.x - s, gm.y - s / 2 + bob, s * 2, s, col);
    }
    for (const q of tiles) {
      const live2 = sentences.find((sn) => sn.rule === q.word && Math.abs(q.x - sn.slot.x) < 9 && Math.abs(q.y - sn.slot.y) < 6);
      const wob = q.wob > 0 ? Math.sin(t * 60) * 0.8 : 0;
      tile(g, q.x + wob, q.y, q.w, q.word, 'word', !!live2 && !!MEANING[live2.id][q.word], live2 && live2.locked);
    }
    pickups.draw(g);
    guns.draw(g);
    const lead = leader();
    for (const p of players) {
      const blink = p.invT > 0 && Math.floor(t * 16) % 2;
      g.alpha(0.3); g.rect(p.x - 4, p.y + p.r - 1, 8, 2, '#000'); g.alpha(1);
      drawPlayer(g, p.idx, p.x, p.y + p.r, { flip: p.face < 0, size: p.r / 5 * 0.9, flash: p.flashT > 0, alpha: p.ghost ? 0.35 : blink ? 0.4 : 1 });
      if (p.blockT > 0) g.ring(p.x, p.y, p.r + 4, '#5affd9');
      if (p === lead) g.text('LEADER', p.x, p.y - p.r * 2.6 - 10, { scale: 1, col: '#ffe14a', align: 'center', ui: false, shadow: null });
      drawBuffs(g, p, p.x, p.y + p.r + 2);
      if (!p.ghost) drawTag(g, p.idx, p.x, p.y - p.r * 2.6);
    }
  };
  return game;
}
