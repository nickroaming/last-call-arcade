// TICK TOCK: hot potato with a live bomb you can THROW. A thrown bomb sticks
// to whoever it hits; if it rolls loose, whoever touched it last owns it.
import { TAU, clamp, rand, approach } from '../engine/util.js';
import { drawPlayer, drawTag, drawArm, SEAT_COLORS } from '../engine/sprites.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { switcheroo } from '../game/switcheroo.js';

export const meta = {
  id: 'tick', name: 'TICK TOCK', color: '#ff5a3a', music: 'rumble', tier: 1,
  tagline: 'Hot potato with a live bomb',
  card: { rule: 'DON\'T HOLD THE BOMB WHEN IT BLOWS', rule2: 'TAG SOMEONE OR THROW IT. IT STICKS', keys: [['X', 'THROW'], ['A', 'DASH'], ['RB', 'BLOCK']], danger: 'A LOOSE BOMB HUNTS THE NEAREST' },
  objective: "Don't hold the bomb when it blows. Tag someone, or THROW it: it sticks to whoever it hits.",
  controls: [['STICK', 'Move and aim'], ['X / RT', 'With bomb: throw it. Without: shoot to shove'], ['A', 'Dash'], ['RB', 'Block: tags and throws bounce off']],
  hazards: 'Conveyor belts / slippery ice / pillars the bomb ricochets off / a loose bomb hunts the nearest player / if it blows loose, the last one who touched it owns it',
  ghost: 'Blown up: float as a ghost. X blows a gust that shoves people and the bomb',
  tiebreak: 'Survived longer > held the bomb for less time',
  gunUse: 'Your gun (shoves people and the loose bomb)', blockUse: 'Your block and dash', bodyUse: 'Your body',
  twists: ['wind', 'giant', 'ice', 'hyper', 'rubber', 'warp'],
};

const TOP = 16, BOT = 180;
const TIME = 55;
const PILLARS = [{ x: 96, y: 66, r: 9 }, { x: 224, y: 66, r: 9 }, { x: 96, y: 134, r: 9 }, { x: 224, y: 134, r: 9 }];
const BELTS = [{ x: 126, y: 24, w: 68, h: 14, dir: 1 }, { x: 126, y: 160, w: 68, h: 14, dir: -1 }];
const ICE = [{ x: 14, y: 82, w: 48, h: 38 }, { x: 258, y: 82, w: 48, h: 38 }];
const inRect = (x, y, r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  let env = twistEnv(tw, 0);
  let t = 0, endT = null;
  const starts = [[50, 40], [270, 40], [160, 150]];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const p = {
      seat: pl.seat, idx: pl.idx, x: starts[i][0], y: starts[i][1], vx: 0, vy: 0, r: 5 * st.size, face: 1,
      out: !!pl.ghost, outT: pl.ghost ? -1 : null, held: 0, gs: newGunState(st.gun), dashT: 0, dashCd: 0, blockT: 0, blockCd: 0,
      stun: 0, slowT: 0, flashT: 0, mult: pl.pickupMult ?? 1, shields: st.shields, gust: { x: 160, y: 90, cd: 1 },
    };
    p.pos = () => (p.out ? [p.gust.x, p.gust.y] : [p.x, p.y]);
    return makeBuffable(p, st);
  });
  const bomb = { holder: null, x: 160, y: 98, vx: 0, vy: 0, r: 5, fuse: 9, max: 9, thrower: null, grace: 0, last: null, wait: 1.5, tagCd: 0, noBack: null };
  const game = { meta, finished: false, ranking: [], players };
  const alive = () => players.filter((p) => !p.out);

  function newRound() {
    bomb.holder = null; bomb.x = 160; bomb.y = 98; bomb.vx = rand(-30, 30); bomb.vy = rand(-30, 30);
    bomb.max = bomb.fuse = rand(7, 10.5); bomb.wait = 1.2; bomb.last = null; bomb.thrower = null;
  }
  newRound();
  function giveBomb(p, how) {
    if (bomb.holder) bomb.noBack = bomb.holder;
    bomb.holder = p; bomb.last = p; bomb.tagCd = 0.6; bomb.vx = bomb.vy = 0;
    fx.popup(how, p.x, p.y - 14, '#ff5a3a', 2); sound.sfx(how === 'STUCK!' ? 'bump' : 'shove');
    fx.burst(p.x, p.y, 10, '#ff5a3a', { speed: 70, life: 0.3 });
  }
  function explode() {
    let victim = bomb.holder;
    if (!victim) {
      let best = null, bd = 30;
      for (const p of alive()) { const d = Math.hypot(p.x - bomb.x, p.y - bomb.y); if (d < bd) { bd = d; best = p; } }
      victim = best || (bomb.last && !bomb.last.out ? bomb.last : null) || alive()[Math.floor(rand(0, alive().length))];
    }
    const bx = bomb.holder ? bomb.holder.x : bomb.x, by = bomb.holder ? bomb.holder.y : bomb.y;
    fx.burst(bx, by, 50, '#ffb03a', { speed: 200, life: 0.9, size: 2 }); fx.burst(bx, by, 30, '#ff3a1a', { speed: 140, life: 0.7 });
    fx.ring(bx, by, 50, '#fff', 0.5); fx.shake(0.9); fx.flash('#ffb03a', 0.5); fx.slow(0.5); sound.sfx('ko'); sound.sfx('boom');
    fx.hueKick = (fx.hueKick || 0) + 30;
    for (const p of alive()) { const d = Math.hypot(p.x - bx, p.y - by) || 1; if (d < 60 && p !== victim) { p.vx += ((p.x - bx) / d) * 260; p.vy += ((p.y - by) / d) * 260; p.stun = 0.3; } }
    if (victim) {
      victim.out = true; victim.outT = t; victim.gust.x = victim.x; victim.gust.y = victim.y;
      fx.popup(`P${victim.idx + 1} BLEW UP!`, bx, by - 18, SEAT_COLORS[victim.idx], 3);
    }
    bomb.holder = null;
    if (alive().length >= 2) newRound(); else bomb.wait = 99;
  }

  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: TOP, x1: 320, y1: BOT, open: {} },
    accel: () => [env.wind, 0],
    solidAt: (x, y) => { for (const q of PILLARS) if (Math.hypot(x - q.x, y - q.y) < q.r) return { circle: q }; return null; },
    targets: () => [
      ...(bomb.holder || bomb.wait > 0 ? [] : [{ ref: bomb, owner: null, x: bomb.x, y: bomb.y, r: bomb.r }]),
      ...alive().map((p) => ({ ref: p, owner: p, x: p.x, y: p.y, r: p.r })),
    ],
    onHit: (ref, info) => {
      const k = 140 * (info.g.knock || 1);
      if (ref === bomb) { bomb.vx += info.dx * k * 0.8; bomb.vy += info.dy * k * 0.8; bomb.last = info.owner || bomb.last; return 'hit'; }
      const p = ref;
      if (p.blockT > 0) { if (p.st.reflect && info.kind === 'bullet') return 'reflect'; sound.sfx('block'); return 'blocked'; }
      p.vx += info.dx * k * p.st.knockTaken; p.vy += info.dy * k * p.st.knockTaken; p.stun = 0.22; p.flashT = 0.1;
      if (info.g.frost) p.slowT = 1.5;
      fx.impact(p.x, p.y, { dmg: 20, col: SEAT_COLORS[p.idx], dx: info.dx, dy: info.dy }); sound.sfx('hit');
      return 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['speed', 'shield', 'rapid', 'mega'], spot: () => [rand(30, 290), rand(TOP + 15, BOT - 15)] });

  function collide(o, r) {
    for (const q of PILLARS) {
      const d = Math.hypot(o.x - q.x, o.y - q.y);
      if (d < r + q.r && d > 0) {
        const nx = (o.x - q.x) / d, ny = (o.y - q.y) / d;
        o.x = q.x + nx * (r + q.r); o.y = q.y + ny * (r + q.r);
        const dot = o.vx * nx + o.vy * ny; if (dot < 0) { o.vx -= 1.8 * dot * nx; o.vy -= 1.8 * dot * ny; }
        return true;
      }
    }
    return false;
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    bomb.tagCd -= dt; bomb.grace -= dt;
    if (bomb.tagCd <= 0) bomb.noBack = null;
    if (bomb.wait > 0) bomb.wait -= dt;
    else if (alive().length >= 2) {
      bomb.fuse -= dt;
      const left = bomb.fuse;
      const beat = left < 2 ? 0.12 : left < 4 ? 0.25 : 0.5;
      if (Math.floor(left / beat) !== Math.floor((left + dt) / beat)) sound.sfx(left < 2 ? 'warn' : 'move');
      if (left <= 0) explode();
    }
    for (const p of players) {
      const c = controls.get(p.seat);
      if (p.out) {
        const gh = p.gust;
        gh.x = clamp(gh.x + c.mx * 140 * dt, 6, 314); gh.y = clamp(gh.y + c.my * 140 * dt, TOP + 6, BOT - 6); gh.cd -= dt;
        if (c.fireP && gh.cd <= 0 && endT === null) {
          gh.cd = 3; fx.ring(gh.x, gh.y, 40, '#cfd8ff', 0.4); sound.sfx('dash');
          for (const o of alive()) { const d = Math.hypot(o.x - gh.x, o.y - gh.y); if (d < 44 && d > 0) { o.vx += ((o.x - gh.x) / d) * 200; o.vy += ((o.y - gh.y) / d) * 200; o.stun = 0.2; } }
          if (!bomb.holder) { const d = Math.hypot(bomb.x - gh.x, bomb.y - gh.y); if (d < 44 && d > 0) { bomb.vx += ((bomb.x - gh.x) / d) * 180; bomb.vy += ((bomb.y - gh.y) / d) * 180; } }
        }
        continue;
      }
      tickBuffs(p, dt);
      p.dashCd -= dt; p.blockT -= dt; p.blockCd -= dt; p.slowT -= dt; p.flashT -= dt;
      const holding = bomb.holder === p;
      if (holding) p.held += dt;
      const max = 86 * p.st.speed * (holding ? 1.15 : 1) * (p.slowT > 0 ? 0.55 : 1);
      const onIce = ICE.some((r) => inRect(p.x, p.y, r)) || env.ice;
      if (p.dashT > 0) p.dashT -= dt;
      else if (p.stun > 0) { p.stun -= dt; p.vx *= Math.pow(0.15, dt); p.vy *= Math.pow(0.15, dt); }
      else {
        const acc = onIce ? 160 : 900;
        p.vx = approach(p.vx, c.mx * max, acc * dt); p.vy = approach(p.vy, c.my * max, acc * dt);
        if (c.jumpP && p.dashCd <= 0) {
          const m = Math.hypot(c.mx, c.my); const dx = m > 0.2 ? c.mx / m : p.face, dy = m > 0.2 ? c.my / m : 0;
          p.vx = dx * 260; p.vy = dy * 260; p.dashT = 0.15; p.dashCd = 1.1 * p.st.blockCd; sound.sfx('dash');
          if (p.st.blockBlink) { p.x = clamp(p.x + dx * 36, 6, 314); p.y = clamp(p.y + dy * 36, TOP + 6, BOT - 6); }
        }
      }
      for (const b of BELTS) if (inRect(p.x, p.y, b)) p.vx += b.dir * 260 * dt;
      p.vx += env.wind * 0.5 * dt;
      if (c.blockP && p.blockCd <= 0) { p.blockT = 0.5; p.blockCd = 2.6 * p.st.blockCd; sound.sfx('block'); switcheroo(p, players, { fx, sound }); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      p.x = clamp(p.x + p.vx * dt, p.r, 320 - p.r); p.y = clamp(p.y + p.vy * dt, TOP + p.r, BOT - p.r);
      collide(p, p.r);
      const a = c.aim ? Math.atan2(c.ay, c.ax) : Math.hypot(c.mx, c.my) > 0.3 ? Math.atan2(c.my, c.mx) : (p.face > 0 ? 0 : Math.PI);
      p.aim = a;
      if (holding) {
        if (c.fireP && bomb.tagCd < 0.3) {
          const sp = 230 * (p.st.gun.speed / 240) * (1 + 0.3 * p.st.gun.homing);
          bomb.holder = null; bomb.x = p.x + Math.cos(a) * (p.r + 6); bomb.y = p.y + Math.sin(a) * (p.r + 6);
          bomb.vx = Math.cos(a) * sp + p.vx * 0.3; bomb.vy = Math.sin(a) * sp + p.vy * 0.3;
          bomb.thrower = p; bomb.grace = 0.3; bomb.last = p; sound.sfx('dash');
          fx.popup('THROW!', p.x, p.y - 14, '#ffd84a', 1);
        }
      } else if (p.stun <= 0) guns.trigger(p, p.gs, p.st.gun, c.fire, a, p.x + Math.cos(a) * 6, p.y + Math.sin(a) * 6, dt);
    }
    // player bumps + tags
    const al = alive();
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const a = al[i], b = al[j]; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r + 1;
      if (d >= m || d === 0) continue;
      const nx = dx / d, ny = dy / d, push = (m - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      if (bomb.tagCd <= 0) {
        if (bomb.holder === a && b !== bomb.noBack) { if (b.blockT > 0) { a.vx -= nx * 200; a.vy -= ny * 200; sound.sfx('block'); } else giveBomb(b, 'TAG!'); }
        else if (bomb.holder === b && a !== bomb.noBack) { if (a.blockT > 0) { b.vx += nx * 200; b.vy += ny * 200; sound.sfx('block'); } else giveBomb(a, 'TAG!'); }
      }
    }
    // loose bomb
    if (!bomb.holder && bomb.wait <= 0) {
      bomb.vx += env.wind * 0.4 * dt;
      for (const b of BELTS) if (inRect(bomb.x, bomb.y, b)) bomb.vx += b.dir * 200 * dt;
      for (const p of alive()) if (p.st.magnet && p !== bomb.last) { /* magnets pull the bomb… toward you. Careful. */ const d = Math.hypot(p.x - bomb.x, p.y - bomb.y); if (d < 50 && d > 1) { bomb.vx += ((p.x - bomb.x) / d) * 40 * dt; bomb.vy += ((p.y - bomb.y) / d) * 40 * dt; } }
      if (!bomb.last || Math.hypot(bomb.vx, bomb.vy) < 30) { // an idle bomb goes hunting
        let best = null, bd = 1e9;
        for (const p of alive()) { const d = Math.hypot(p.x - bomb.x, p.y - bomb.y); if (d < bd) { bd = d; best = p; } }
        if (best) { bomb.vx += ((best.x - bomb.x) / bd) * 90 * dt; bomb.vy += ((best.y - bomb.y) / bd) * 90 * dt; }
      }
      bomb.vx *= Math.pow(0.45, dt); bomb.vy *= Math.pow(0.45, dt);
      bomb.x += bomb.vx * dt; bomb.y += bomb.vy * dt;
      if (bomb.x < bomb.r || bomb.x > 320 - bomb.r) { bomb.vx = -bomb.vx * 0.9; bomb.x = clamp(bomb.x, bomb.r, 320 - bomb.r); sound.sfx('bump'); }
      if (bomb.y < TOP + bomb.r || bomb.y > BOT - bomb.r) { bomb.vy = -bomb.vy * 0.9; bomb.y = clamp(bomb.y, TOP + bomb.r, BOT - bomb.r); sound.sfx('bump'); }
      if (collide(bomb, bomb.r)) sound.sfx('boing');
      const fast = Math.hypot(bomb.vx, bomb.vy) > 40;
      for (const p of alive()) {
        if (Math.hypot(p.x - bomb.x, p.y - bomb.y) > p.r + bomb.r) continue;
        if (fast && p === bomb.thrower && bomb.grace > 0) continue;
        if (p.blockT > 0 && fast) { const d = Math.hypot(bomb.x - p.x, bomb.y - p.y) || 1; bomb.vx = ((bomb.x - p.x) / d) * 220; bomb.vy = ((bomb.y - p.y) / d) * 220; bomb.last = p; sound.sfx('block'); fx.popup('DENIED!', p.x, p.y - 12, '#5affd9', 1); break; }
        giveBomb(p, fast && p !== bomb.thrower ? 'STUCK!' : 'GRABBED');
        break;
      }
    }
    guns.update(dt);
    pickups.update(dt, alive().map((p) => ({ p, x: p.x, y: p.y, r: p.r + 2, mult: p.mult })));
    const started = players.filter((p) => p.outT !== -1).length;
    if (endT === null && ((started > 1 && alive().length <= 1) || t >= TIME || (started <= 1 && t >= 25))) endT = 1.3;
    if (endT !== null) { endT -= dt; if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); } }
  };
  function rank() {
    const a = alive().sort((x, y) => x.held - y.held);
    const d = players.filter((p) => p.out).sort((x, y) => y.outT - x.outT);
    return [...a, ...d].map((p) => p.seat);
  }
  game.hud = (seat) => { const p = players.find((x) => x.seat === seat); return p.out ? 'GHOST' : bomb.holder === p ? 'BOMB!' : 'SAFE'; };
  game.botTarget = (seat) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || p.out) return null;
    if (bomb.holder === p) { let best = null, bd = 1e9; for (const o of alive()) { if (o === p) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; } } return best ? [best.x, best.y] : null; }
    const bx = bomb.holder ? bomb.holder.x : bomb.x, by = bomb.holder ? bomb.holder.y : bomb.y;
    return [bx, by, 'away'];
  };
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    const D = (c) => (ctx.drift ? ctx.drift.col(c, 'bg') : c);
    g.rect(0, 0, 320, 180, D('#0d1a1e'), true);
    const tile = D('#112428');
    for (let y = TOP; y < BOT; y += 16) for (let x = 0; x < 320; x += 16) if (((x + y) / 16) % 2) g.rect(x, y, 16, 16, tile, true);
    for (const r of ICE) { g.rect(r.x, r.y, r.w, r.h, '#7fd8ff55'); g.frame(r.x, r.y, r.w, r.h, '#bff3ff'); }
    for (const b of BELTS) {
      g.rect(b.x, b.y, b.w, b.h, '#2a2a3a'); g.frame(b.x, b.y, b.w, b.h, '#ffd84a');
      for (let k = 0; k < b.w; k += 10) { const x = b.x + ((k + t * 40 * b.dir) % b.w + b.w) % b.w; g.text(b.dir > 0 ? '>' : '<', x, b.y + 3.5, { scale: 2, col: '#ffd84a', ui: false, shadow: null }); }
    }
    for (const q of PILLARS) { g.circle(q.x, q.y, q.r, '#3a5a60'); g.ring(q.x, q.y, q.r, '#7fd8ff'); g.circle(q.x - 2, q.y - 2, q.r * 0.4, '#5a8a90'); }
    pickups.draw(g);
    guns.draw(g);
    for (const p of players) {
      if (p.out) continue;
      const hold = bomb.holder === p;
      if (hold) { g.ring(p.x, p.y, p.r + 5 + Math.sin(t * 20) * 1.5, '#ff3a1a'); }
      g.alpha(0.3); g.rect(p.x - 4, p.y + p.r - 1, 8, 2, '#000'); g.alpha(1);
      drawPlayer(g, p.idx, p.x, p.y + p.r, { flip: p.face < 0, size: p.st.size * 0.9, flash: p.flashT > 0, look: p.aim });
      drawArm(g, p, p.x, p.y, p.st.size * 0.9);
      if (p.blockT > 0) g.ring(p.x, p.y, p.r + 4, '#5affd9');
      drawTag(g, p.idx, p.x, p.y - 7 * p.st.size);
      drawBuffs(g, p, p.x, p.y + p.r + 2);
    }
    // the bomb
    if (bomb.wait <= 0 || Math.floor(t * 8) % 2) {
      const bx = bomb.holder ? bomb.holder.x + 6 : bomb.x, by = bomb.holder ? bomb.holder.y - 14 : bomb.y;
      const hot = bomb.fuse < 3 && Math.floor(t * (bomb.fuse < 1.5 ? 16 : 8)) % 2;
      g.circle(bx, by, bomb.r + (hot ? 1 : 0), hot ? '#ff3a1a' : '#1a1a24');
      g.circle(bx - 1.5, by - 1.5, 1.5, '#5a5a6a');
      g.rect(bx + 2, by - bomb.r - 3, 1, 3, '#c8a070');
      if (Math.random() < 0.8) fx.burst(bx + 2.5, by - bomb.r - 3, 1, Math.random() < 0.5 ? '#ffd84a' : '#ff7a2e', { speed: 30, life: 0.2 });
      if (bomb.fuse < 3 && bomb.wait <= 0) g.text(String(Math.ceil(bomb.fuse)), bx, by - 16, { scale: 2, col: '#ff3a1a', align: 'center', ui: false });
    }
    for (const p of players) {
      if (!p.out || game.finished) continue;
      drawPlayer(g, p.idx, p.gust.x, p.gust.y + Math.sin(t * 4 + p.idx) * 2, { alpha: 0.45, size: 0.9 });
      g.text(p.gust.cd <= 0 ? `P${p.idx + 1} X:GUST` : `P${p.idx + 1}`, p.gust.x, p.gust.y - 16, { scale: 1, col: SEAT_COLORS[p.idx], align: 'center', ui: false });
    }
    void TAU;
  };
  return game;
}
