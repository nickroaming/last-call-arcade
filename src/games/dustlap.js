// DUST LAP: top-down desert race at dusk. Auto throttle, drift-boost, hop.
import { TAU, clamp, rand, lerp, angleDiff, choice, dist } from '../engine/util.js';
import { art, SEAT_COLORS } from '../engine/sprites.js';
import { S } from '../engine/gfx.js';
import { Guns, newGunState } from '../game/weapons.js';
import { twistEnv } from '../game/twists.js';
import { Pickups, makeBuffable, tickBuffs, drawBuffs } from '../game/pickups.js';
import { switcheroo } from '../game/switcheroo.js';

export const meta = {
  id: 'dustlap', name: 'DUST LAP', color: '#ff9a2e', music: 'dustlap', tier: 1,
  tagline: 'A dusk desert sprint',
  card: { rule: 'DRIVE THROUGH EVERY GATE', rule2: 'FIRST TO FINISH THE LAPS WINS', keys: [['A', 'HOLD: DRIFT'], ['X', 'BLAST'], ['RB', 'HOP']], danger: 'TUMBLEWEEDS, BOULDERS, DUST DEVILS' },
  objective: 'Drive through every gate. First to finish the laps wins.',
  controls: [['STICK', 'Steer (point where to go)'], ['A (HOLD)', 'Drift, release to boost'], ['X / RT', 'Blaster: hits spin rivals out'], ['RB', 'Hop over hazards and shots']],
  hazards: 'Tumbleweeds / rolling boulders / cactus / dust devils that spin you',
  ghost: 'Everyone stays in the race until the end',
  tiebreak: 'Finish order > laps and gates done > closer to the next gate',
  gunUse: 'Your car blaster (X)', blockUse: 'Your hop (RB) recharge', bodyUse: 'Your car',
  twists: ['wind', 'rubber', 'giant', 'warp', 'ice', 'hyper', 'bullettime'],
};

const POINTS = [[40, 38], [150, 32], [262, 36], [298, 62], [290, 88], [220, 92], [170, 110], [176, 134], [240, 142], [296, 154], [270, 166], [150, 164], [48, 164], [18, 140], [52, 112], [22, 80], [24, 54]];
const HALF = 15;
const G = 12;
const TIME = 55;

function catmull(pts, per = 14) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  return out;
}

function buildTrack(flip) {
  const pts = POINTS.map(([x, y]) => [flip ? 320 - x : x, y]);
  if (flip) pts.reverse();
  const sm = catmull(pts);
  const cum = [0];
  for (let i = 1; i <= sm.length; i++) cum.push(cum[i - 1] + dist(...sm[i - 1], ...sm[i % sm.length]));
  const len = cum[cum.length - 1];
  const gates = [];
  for (let gi = 0; gi < G; gi++) {
    const target = (gi / G) * len;
    let i = cum.findIndex((c) => c >= target); if (i < 0) i = 0;
    const [x, y] = sm[i % sm.length], [nx, ny] = sm[(i + 2) % sm.length];
    const a = Math.atan2(ny - y, nx - x);
    gates.push({ x, y, a, i });
  }
  // track mask + painted background
  const mask = new Uint8Array(320 * 180);
  let img = null;
  if (typeof document !== 'undefined') {
    const m = document.createElement('canvas'); m.width = 320; m.height = 180;
    const mc = m.getContext('2d');
    const path = (c, k = 1) => { c.beginPath(); sm.forEach(([x, y], i) => (i ? c.lineTo(x * k, y * k) : c.moveTo(x * k, y * k))); c.closePath(); };
    mc.lineJoin = 'round'; mc.lineWidth = HALF * 2; mc.strokeStyle = '#fff'; path(mc); mc.stroke();
    const d = mc.getImageData(0, 0, 320, 180).data;
    for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 128 ? 1 : 0;

    img = document.createElement('canvas'); img.width = 320 * S; img.height = 180 * S;
    const c = img.getContext('2d'); c.imageSmoothingEnabled = false;
    c.fillStyle = '#c98b52'; c.fillRect(0, 0, img.width, img.height);
    for (let k = 0; k < 900; k++) { c.fillStyle = Math.random() < 0.5 ? '#b97a45' : '#d9a066'; c.fillRect(Math.floor(rand(0, 320)) * S, Math.floor(rand(0, 180)) * S, S * (1 + (k % 3)), S); }
    for (let k = 0; k < 7; k++) { // mesas
      c.fillStyle = '#8a4f3a'; const mx = rand(0, 320), my = rand(0, 180), mw = rand(10, 24);
      if (mask[Math.floor(my) * 320 + Math.floor(mx)]) continue;
      c.beginPath(); c.arc(mx * S, my * S, mw * S / 2, 0, TAU); c.fill();
      c.fillStyle = '#a8644a'; c.beginPath(); c.arc(mx * S - 2, my * S - 2, mw * S / 2 - 3, 0, TAU); c.fill();
    }
    c.lineJoin = 'round';
    c.lineWidth = (HALF * 2 + 4) * S; c.strokeStyle = '#f2f2f2'; path(c, S); c.stroke();
    c.setLineDash([6 * S, 6 * S]); c.strokeStyle = '#e04a3a'; path(c, S); c.stroke(); c.setLineDash([]);
    c.lineWidth = HALF * 2 * S; c.strokeStyle = '#5a4a4f'; path(c, S); c.stroke();
    for (let k = 0; k < 500; k++) { // gravel
      const [x, y] = sm[Math.floor(rand(0, sm.length))];
      c.fillStyle = Math.random() < 0.5 ? '#4e3f44' : '#66555a';
      c.fillRect(Math.round((x + rand(-HALF, HALF)) * S), Math.round((y + rand(-HALF, HALF)) * S), S, S);
    }
    c.setLineDash([4 * S, 8 * S]); c.lineWidth = S; c.strokeStyle = '#8a7a6a'; path(c, S); c.stroke(); c.setLineDash([]);
    // start line chequers
    const g0 = gates[0];
    for (let k = -HALF; k < HALF; k += 2) for (let r = 0; r < 2; r++) {
      const nx = -Math.sin(g0.a), ny = Math.cos(g0.a);
      c.fillStyle = (Math.floor(k / 2) + r) % 2 ? '#111' : '#fff';
      c.fillRect(Math.round((g0.x + nx * k + Math.cos(g0.a) * r * 2) * S), Math.round((g0.y + ny * k + Math.sin(g0.a) * r * 2) * S), 2 * S, 2 * S);
    }
  }
  return { sm, len, gates, mask, img };
}

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound, tw = ctx.twist || null;
  let env = twistEnv(tw, 0);
  const T = buildTrack(ctx.variant % 2 === 1);
  const LAPS = T.len > 820 ? 2 : 3;
  const onTrack = (x, y) => T.mask[clamp(Math.floor(y), 0, 179) * 320 + clamp(Math.floor(x), 0, 319)] === 1;
  const g0 = T.gates[0];
  const back = (d, lat) => [g0.x - Math.cos(g0.a) * d - Math.sin(g0.a) * lat, g0.y - Math.sin(g0.a) * d + Math.cos(g0.a) * lat];

  const cars = ctx.players.map((pl, i) => {
    const [x, y] = back(10 + (i % 2) * 6, (i - 1) * 9);
    const st = pl.stats;
    const c = {
      seat: pl.seat, idx: pl.idx, x, y, ang: g0.a, vx: 0, vy: 0, speed: 0, r: 4.5 * st.size, mult: pl.pickupMult ?? 1, gs: newGunState(st.gun),
      drifting: false, charge: 0, boostT: 0, hopT: 0, hopMax: 0.42 * Math.pow(st.jump * (1 / st.grav), 1.3), hopCd: 0, braceT: 0, braceCd: 0,
      spinT: 0, shields: st.shields, next: 0, lap: -1, finished: false, finishT: 0, wrongT: 0, bounceCd: 0, flashT: 0, bumpCd: 0, slowT: 0,
    };
    c.pos = () => [c.x, c.y];
    return makeBuffable(c, st);
  });

  const cacti = [2, 5, 8, 10].map((gi, k) => {
    const g = T.gates[gi];
    const off = (k % 2 ? 1 : -1) * 7;
    return { x: g.x - Math.sin(g.a) * off + Math.cos(g.a) * 9, y: g.y + Math.cos(g.a) * off + Math.sin(g.a) * 9, r: 3.5 };
  });
  const weeds = [];
  const boulders = [];
  const devils = [{ i: Math.floor(T.sm.length / 2), x: 0, y: 0, r: 13, ph: 0 }];
  let weedT = 1.2, boulderT = 6;
  let t = 0, deadline = null, endT = null, place = 0;
  const game = { meta, finished: false, ranking: [] };

  function spinOut(c, why) {
    if (c.hopT > 0 || c.spinT > 0) return;
    if (c.shields > 0) {
      c.shields -= 1; c.spinT = 0; fx.popup('AIRBAG!', c.x, c.y - 10, '#9fd3ff', 1); sound.sfx('block');
      fx.ring(c.x, c.y, 10, '#9fd3ff'); return;
    }
    c.spinT = 0.75; c.speed *= 0.3; c.drifting = false; c.charge = 0; c.flashT = 0.15;
    fx.burst(c.x, c.y, 10, '#e8c890', { speed: 60, life: 0.4 }); fx.shake(0.15); sound.sfx('spin');
    if (why) fx.popup(why, c.x, c.y - 10, '#fff', 1);
  }
  function hazardHit(c, hx, hy, label) {
    if (c.hopT > 0) return false;
    const d = Math.hypot(c.x - hx, c.y - hy) || 1;
    if (false) {
      c.bounceCd = 3; c.boostT = 0.6; c.speed = Math.max(c.speed, 120 * c.st.speed);
      c.vx += ((c.x - hx) / d) * 60; c.vy += ((c.y - hy) / d) * 60;
      fx.popup('BOING!', c.x, c.y - 10, '#7dff8a', 1); sound.sfx('boing'); return true;
    }
    c.vx += ((c.x - hx) / d) * 70; c.vy += ((c.y - hy) / d) * 70;
    spinOut(c, label);
    return true;
  }

  function nearestSample(x, y) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < T.sm.length; i += 2) { const d = (T.sm[i][0] - x) ** 2 + (T.sm[i][1] - y) ** 2; if (d < bd) { bd = d; bi = i; } }
    return bi;
  }

  game.update = (dt, controls) => {
    t += dt;
    env = { ...twistEnv(tw, t), ice: tw && tw.ice };
    // ---- hazards ----
    weedT -= dt;
    if (weedT <= 0) {
      weedT = rand(1.0, 1.8) * (t > 20 ? 0.7 : 1);
      const fromLeft = Math.random() < 0.5;
      weeds.push({ x: fromLeft ? -6 : 326, y: rand(25, 170), vx: (fromLeft ? 1 : -1) * rand(45, 75), vy: rand(-12, 12), r: 4, rot: 0, ph: rand(0, 6) });
    }
    for (let i = weeds.length - 1; i >= 0; i--) {
      const w = weeds[i];
      w.x += w.vx * dt; w.y += w.vy * dt + Math.sin(t * 8 + w.ph) * 0.4; w.rot += w.vx * dt * 0.2;
      if (w.x < -12 || w.x > 332) weeds.splice(i, 1);
    }
    boulderT -= dt;
    if (boulderT <= 0) {
      boulderT = rand(5, 7);
      const g = choice(T.gates.slice(2));
      const fromTop = Math.random() < 0.5;
      boulders.push({ x: g.x + rand(-10, 10), y: fromTop ? -10 : 190, vy: fromTop ? 95 : -95, r: 8, warn: 1.3, rot: 0 });
      sound.sfx('warn');
    }
    for (let i = boulders.length - 1; i >= 0; i--) {
      const b = boulders[i];
      if (b.warn > 0) { b.warn -= dt; continue; }
      b.y += b.vy * dt; b.rot += dt * 6;
      if (Math.random() < 0.4) fx.dust(b.x + rand(-6, 6), b.y - Math.sign(b.vy) * 6, '#a88a6a', 1);
      if (b.y < -20 || b.y > 200) boulders.splice(i, 1);
    }
    if (t > 18 && devils.length < 2) devils.push({ i: 0, x: 0, y: 0, r: 13, ph: 2 });
    for (const dv of devils) {
      dv.i = (dv.i - dt * 22 + T.sm.length) % T.sm.length; // drifts against the race
      const [x, y] = T.sm[Math.floor(dv.i)];
      dv.ph += dt;
      dv.x = x + Math.sin(dv.ph * 1.7) * 7; dv.y = y + Math.cos(dv.ph * 1.3) * 7;
    }

    // ---- cars ----
    for (const c of cars) {
      const k = controls.get(c.seat);
      tickBuffs(c, dt); c.slowT -= dt;
      c.flashT -= dt; c.hopCd -= dt; c.braceCd -= dt; c.braceT -= dt; c.bounceCd -= dt; c.boostT -= dt; c.bumpCd -= dt;
      if (c.hopT > 0) c.hopT -= dt;
      const track = onTrack(c.x, c.y);
      if (c.spinT > 0) {
        c.spinT -= dt; c.ang += 15 * dt; c.speed *= Math.pow(0.2, dt);
      } else {
        const mag = Math.hypot(k.mx, k.my);
        const sz = Math.sqrt(c.st.size);
        let turn = (3.0 + 0.6 * c.st.gun.homing) / sz;
        const wantDrift = k.jump && c.speed > 45;
        if (wantDrift && !c.drifting) { c.drifting = true; c.charge = 0; }
        if (c.drifting) turn *= 1.55;
        let turning = 0;
        if (mag > 0.35) {
          const want = Math.atan2(k.my, k.mx);
          const d = angleDiff(c.ang, want);
          turning = clamp(d, -turn * dt, turn * dt);
          c.ang += turning;
        }
        if (c.drifting) {
          c.charge += dt * (Math.abs(turning) > 0.3 * turn * dt ? 1 : 0.35);
          if (Math.random() < 0.5) fx.burst(c.x - Math.cos(c.ang) * 5, c.y - Math.sin(c.ang) * 5, 1, c.charge > 1 ? '#5affff' : c.charge > 0.45 ? '#ffd84a' : '#d9b48a', { speed: 30, life: 0.3 });
          if (!wantDrift) {
            c.drifting = false;
            if (c.charge > 0.45) {
              c.boostT = (c.charge > 1 ? 0.9 : 0.55) * (1 + 0.5 * c.st.gun.split);
              sound.sfx('dash'); fx.burst(c.x, c.y, 8, '#ffd84a', { speed: 80, life: 0.3 });
              if (c.st.blockShock) {
                const R = 22 + 8 * c.st.blockShock;
                fx.ring(c.x, c.y, R, '#ffd84a', 0.35); sound.sfx('boom');
                for (const o of cars) {
                  if (o === c || o.hopT > 0 || o.braceT > 0) continue;
                  const d = Math.hypot(o.x - c.x, o.y - c.y);
                  if (d < R) { o.vx += ((o.x - c.x) / (d || 1)) * 110 * o.st.knockTaken; o.vy += ((o.y - c.y) / (d || 1)) * 110 * o.st.knockTaken; }
                }
              }
            }
            c.charge = 0;
          }
        }
        if (k.blockP && c.hopCd <= 0 && c.hopT <= 0) {
          c.hopT = c.hopMax; c.hopCd = 1.8 * c.st.blockCd; sound.sfx('jump'); switcheroo(c, cars, { fx, sound, keys: ['x', 'y', 'ang'] }); fx.dust(c.x, c.y, '#d9b48a', 5);
          if (c.st.blockBlink) { c.x += Math.cos(c.ang) * 30; c.y += Math.sin(c.ang) * 30; fx.burst(c.x, c.y, 8, '#fff', { speed: 50, life: 0.3 }); }
        }
        const aim = k.aim ? Math.atan2(k.ay, k.ax) : c.ang;
        guns.trigger(c, c.gs, c.st.gun, k.fire && !c.finished, aim, c.x + Math.cos(aim) * 7, c.y + Math.sin(aim) * 7, dt);
        let top = 98 * c.st.speed * (c.slowT > 0 ? 0.6 : 1);
        if (!track && c.hopT <= 0) top *= 0.5;
        if (c.boostT > 0) top *= 1.5;
        if (c.st.magnet) for (const o of cars) {
          if (o === c) continue;
          const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy);
          if (d < 45 && d > 6 && Math.abs(angleDiff(c.ang, Math.atan2(dy, dx))) < 0.5) { top *= 1 + 0.15 * c.st.magnet; if (Math.random() < 0.3) fx.burst(c.x, c.y, 1, '#ff4f8b', { speed: 20, life: 0.2 }); }
        }
        c.speed += (c.speed < top ? 150 : -90) * dt;
        if (Math.abs(c.speed - top) < 3) c.speed = top;
      }
      const grip = (c.drifting ? 2.4 : c.spinT > 0 ? 1 : 9) * (env.ice ? 0.3 : 1);
      c.vx += env.wind * 0.5 * dt;
      c.vx = lerp(c.vx, Math.cos(c.ang) * c.speed, Math.min(1, grip * dt));
      c.vy = lerp(c.vy, Math.sin(c.ang) * c.speed, Math.min(1, grip * dt));
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.x < 4 || c.x > 316) { c.x = clamp(c.x, 4, 316); c.vx *= -0.5; }
      if (c.y < 16 || c.y > 177) { c.y = clamp(c.y, 16, 177); c.vy *= -0.5; }
      if (!track && c.hopT <= 0 && Math.random() < 0.3) fx.dust(c.x, c.y, '#d9a066', 1);

      // gates
      if (!c.finished) {
        const g = T.gates[c.next];
        if (Math.hypot(c.x - g.x, c.y - g.y) < HALF + 8) {
          if (c.next === 0) {
            c.lap += 1;
            if (c.lap >= LAPS) {
              c.finished = true; c.finishT = t; place += 1;
              fx.popup(['1ST!', '2ND!', '3RD!'][place - 1] || 'DONE', c.x, c.y - 12, SEAT_COLORS[c.idx], 2);
              sound.sfx(place === 1 ? 'jackpot' : 'coin');
              if (deadline === null) { deadline = t + 7; }
            } else if (c.lap > 0) { fx.popup(c.lap === LAPS - 1 ? 'FINAL LAP' : `LAP ${c.lap + 1}`, c.x, c.y - 12, '#fff', 1); sound.sfx('beep'); }
          }
          c.next = (c.next + 1) % G;
        }
        // wrong way
        const si = nearestSample(c.x, c.y);
        const [ax, ay] = T.sm[si], [bx, by] = T.sm[(si + 3) % T.sm.length];
        const tang = Math.atan2(by - ay, bx - ax);
        c.wrongT = Math.abs(angleDiff(c.ang, tang)) > 2.1 && c.speed > 30 ? c.wrongT + dt : 0;
      }
    }

    // collisions
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.hopT > 0 || b.hopT > 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d >= min || d === 0) continue;
      const nx = dx / d, ny = dy / d, push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      const base = 40 + Math.max(0, rel) * 0.8;
      b.vx += nx * base * a.st.gun.knock * b.st.knockTaken; b.vy += ny * base * a.st.gun.knock * b.st.knockTaken;
      a.vx -= nx * base * b.st.gun.knock * a.st.knockTaken; a.vy -= ny * base * b.st.gun.knock * a.st.knockTaken;
      if (a.bumpCd <= 0 || b.bumpCd <= 0) {
        sound.sfx('bump'); fx.burst(a.x + nx * a.r, a.y + ny * a.r, 5, '#fff6a8', { speed: 60, life: 0.2 }); fx.shake(0.08);
        if (a.st.size > 1.2) spinOut(b, 'SMASH!');
        if (b.st.size > 1.2) spinOut(a, 'SMASH!');
        a.bumpCd = b.bumpCd = 0.4;
      }
    }
    for (const c of cars) {
      for (const k of cacti) if (Math.hypot(c.x - k.x, c.y - k.y) < c.r + k.r) {
        if (c.hopT > 0) continue;
        const d = Math.hypot(c.x - k.x, c.y - k.y) || 1;
        c.x = k.x + ((c.x - k.x) / d) * (c.r + k.r); c.y = k.y + ((c.y - k.y) / d) * (c.r + k.r);
        hazardHit(c, k.x, k.y, 'OUCH!');
      }
      for (const w of weeds) if (!w.hit && Math.hypot(c.x - w.x, c.y - w.y) < c.r + w.r) {
        if (hazardHit(c, w.x, w.y, 'TUMBLEWEED!')) { w.hit = true; w.vx *= -0.6; w.vy = rand(-60, 60); fx.burst(w.x, w.y, 6, '#b08a4a', { speed: 50, life: 0.3 }); }
      }
      for (const b of boulders) if (b.warn <= 0 && Math.hypot(c.x - b.x, c.y - b.y) < c.r + b.r) {
        if (c.hopT > 0) continue;
        c.vy += Math.sign(b.vy) * 90;
        hazardHit(c, b.x, b.y, 'BOULDER!');
      }
      for (const dv of devils) {
        const d = Math.hypot(c.x - dv.x, c.y - dv.y);
        if (d < dv.r && c.hopT <= 0) { c.ang += 7 * dt; c.speed *= Math.pow(0.5, dt); c.vx += (dv.x - c.x) * 2 * dt; c.vy += (dv.y - c.y) * 2 * dt; }
      }
    }

    guns.update(dt);
    pickups.update(dt, cars.map((c) => ({ p: c, x: c.x, y: c.y, r: c.r + 2, mult: c.mult })));
    const allDone = cars.every((c) => c.finished);
    if (endT === null && (allDone || (deadline !== null && t >= deadline) || t >= TIME)) endT = 1.0;
    if (endT !== null) {
      endT -= dt;
      if (endT <= 0 && !game.finished) { game.finished = true; game.ranking = rank(); }
    }
  };

  function progress(c) {
    const passed = c.next === 0 ? G : c.next; // gates done this lap
    const g = T.gates[c.next];
    return c.lap * G + passed - Math.hypot(c.x - g.x, c.y - g.y) / 400;
  }
  function rank() {
    const fin = cars.filter((c) => c.finished).sort((a, b) => a.finishT - b.finishT);
    const rest = cars.filter((c) => !c.finished).sort((a, b) => progress(b) - progress(a));
    return [...fin, ...rest].map((c) => c.seat);
  }
  game.hud = (seat) => {
    const c = cars.find((x) => x.seat === seat);
    if (c.finished) return 'FINISHED';
    return `LAP ${clamp(c.lap + 1, 1, LAPS)}/${LAPS}`;
  };
  Object.defineProperty(game, 'timeLeft', { get: () => (deadline !== null ? Math.max(0, deadline - t) : Math.max(0, TIME - t)) });
  game.players = cars;
  const guns = new Guns({
    twist: tw,
    bounds: { x0: 0, y0: 15, x1: 320, y1: 180, open: {} },
    accel: () => [env.wind * 0.6, 0],
    solidAt: (x, y) => { for (const k of cacti) if (Math.hypot(k.x - x, k.y - y) < k.r) return { circle: k }; return null; },
    targets: () => cars.filter((c) => c.hopT <= 0).map((c) => ({ ref: c, owner: c, x: c.x, y: c.y, r: c.r })),
    onHit: (c, info) => {
      if (c.hopT > 0) return 'none';
      c.vx += info.dx * 90 * (info.g.knock || 1) * c.st.knockTaken; c.vy += info.dy * 90 * (info.g.knock || 1) * c.st.knockTaken;
      if (info.g.frost) c.slowT = 1.5;
      if (info.dmg >= 25) spinOut(c, 'BLASTED!'); else { c.speed *= 0.6; c.flashT = 0.1; }
      return 'hit';
    },
  }, fx, sound);
  const pickups = new Pickups({ fx, sound, types: ['rapid', 'mega', 'shield', 'speed', 'bounce'], spot: () => { const s = T.sm[Math.floor(rand(0, T.sm.length))]; return [s[0], s[1]]; } });

  game.draw = (g) => {
    if (T.img) g.c.drawImage(T.img, g.ox * S, g.oy * S);
    // gate markers: each car sees its next gate
    cars.forEach((c) => {
      if (c.finished) return;
      const gt = T.gates[c.next];
      const nx = -Math.sin(gt.a), ny = Math.cos(gt.a);
      const off = (c.idx - 1) * 4;
      g.rect(gt.x + nx * (HALF + 2) + off * Math.cos(gt.a) - 1, gt.y + ny * (HALF + 2) + off * Math.sin(gt.a) - 1, 3, 3, SEAT_COLORS[c.idx]);
      g.rect(gt.x - nx * (HALF + 2) + off * Math.cos(gt.a) - 1, gt.y - ny * (HALF + 2) + off * Math.sin(gt.a) - 1, 3, 3, SEAT_COLORS[c.idx]);
    });
    for (const k of cacti) {
      g.rect(k.x - 1.5, k.y - 5, 3, 9, '#2f8a3a'); g.rect(k.x - 4, k.y - 2, 2, 4, '#2f8a3a'); g.rect(k.x + 2, k.y - 3, 2, 4, '#2f8a3a');
      g.rect(k.x - 0.5, k.y - 4, 1, 7, '#5fbf5a');
    }
    for (const dv of devils) {
      for (let k = 0; k < 14; k++) {
        const a = dv.ph * 6 + k * 0.9, rr = (k / 14) * dv.r;
        g.alpha(0.5); g.rect(dv.x + Math.cos(a) * rr, dv.y + Math.sin(a) * rr * 0.7 - k * 0.4, 2, 1, '#f0d8b0'); g.alpha(1);
      }
    }
    for (const b of boulders) {
      if (b.warn > 0) {
        if (Math.floor(t * 5) % 2) {
          const y = b.vy > 0 ? 18 : 170;
          g.text('!', b.x, y - 6, { scale: 3, col: '#ff3a3a', align: 'center', ui: false });
          g.dotted(b.x, 16, b.x, 178, '#ff3a3a88', 5);
        }
        continue;
      }
      g.circle(b.x + 2, b.y + 2, b.r, '#00000055');
      g.circle(b.x, b.y, b.r, '#7a6a5e'); g.circle(b.x - 2, b.y - 2, b.r * 0.6, '#9a8a7a');
      g.rect(b.x + Math.cos(b.rot) * 4, b.y + Math.sin(b.rot) * 4, 2, 2, '#5a4a40');
    }
    for (const w of weeds) {
      for (let k = 0; k < 10; k++) { const a = w.rot + k * 2.4; g.rect(w.x + Math.cos(a) * w.r * (k % 3) / 2, w.y + Math.sin(a) * w.r * (k % 3) / 2, 1, 1, k % 2 ? '#8a6a3a' : '#c09a5a'); }
      g.ring(w.x, w.y, w.r, '#9a7a4a');
    }
    pickups.draw(g);
    guns.draw(g);
    for (const c of cars) {
      const a = art(c.idx);
      const lift = c.hopT > 0 ? Math.sin((c.hopT / c.hopMax) * Math.PI) * 7 : 0;
      g.alpha(0.35); g.circle(c.x + 1, c.y + 2, c.r + 1, '#000'); g.alpha(1);
      if (c.boostT > 0) fx.burst(c.x - Math.cos(c.ang) * 7, c.y - Math.sin(c.ang) * 7, 1, Math.random() < 0.5 ? '#ffd84a' : '#ff7a2e', { speed: 40, life: 0.18, angle: c.ang + Math.PI, spread: 0.6 });
      const sc = c.st.size * (1 + lift * 0.04) * 0.85;
      g.image(c.flashT > 0 ? a.carWhite : a.car, c.x, c.y - lift, { scale: sc, rot: c.ang, anchor: 'center', alpha: c.braceT > 0 && Math.floor(t * 5) % 2 ? 0.6 : 1 });
      if (c.braceT > 0) g.ring(c.x, c.y - lift, c.r + 3, '#5affd9');
      if (c.shields) g.ring(c.x, c.y - lift, c.r + 2, '#9fd3ff55');
      g.rect(c.x - 6, c.y - lift - 13, 12, 6, '#0b0a12');
      g.text(`P${c.idx + 1}`, c.x, c.y - lift - 12.5, { scale: 1, col: SEAT_COLORS[c.idx], align: 'center', ui: false, shadow: null });
      if (c.wrongT > 0.8 && Math.floor(t * 6) % 2) g.text('WRONG WAY!', c.x, c.y + 8, { scale: 1, col: '#ff5a5a', align: 'center', ui: false });
      if (c.hopCd <= 0 && !c.finished) g.rect(c.x - 1, c.y + c.r + 3, 2, 1, '#fff');
      drawBuffs(g, c, c.x, c.y - lift - 16);
    }
    // dusk tint
    g.alpha(0.12); g.rect(0, 0, 320, 180, '#5a1a6a', true); g.alpha(1);
  };
  return game;
}
