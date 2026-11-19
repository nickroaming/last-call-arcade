// COIN STORM: side-view coin grab on a city block at night.
import { TAU, clamp, rand, overlap, circleRect } from '../engine/util.js';
import { drawPlayer, drawTag, SEAT_COLORS } from '../engine/sprites.js';
import { makeBody, platformControl, stepBody, moveMovers } from './platformer.js';

export const meta = {
  id: 'coins', name: 'COIN STORM', color: '#ffd84a', music: 'coins',
  tagline: "It's raining money",
  objective: 'Grab the most coins. Stomp heads and shove rivals to knock coins loose.',
  controls: [['STICK', 'Move'], ['A', 'Jump (double jump)'], ['X', 'Shove'], ['RB', 'Block']],
  hazards: 'Lightning strikes / rolling barrels / a swinging spike ball / moving platforms',
  ghost: 'Nobody is knocked out. Lose coins, not your place in the game',
  tiebreak: 'More coins > reached that total first',
};
const TIME = 30;

export function create(ctx) {
  const fx = ctx.fx, sound = ctx.sound;
  const flip = ctx.variant % 2 === 1;
  const fl = (o) => (flip ? { ...o, x: 320 - o.x - o.w } : o);
  const solids = [
    { x: 0, y: 168, w: 320, h: 12 },
    ...[{ x: 20, y: 136, w: 56, h: 4 }, { x: 244, y: 136, w: 56, h: 4 }, { x: 120, y: 120, w: 80, h: 4 },
      { x: 30, y: 92, w: 50, h: 4 }, { x: 240, y: 92, w: 50, h: 4 }, { x: 132, y: 64, w: 56, h: 4 }].map((s) => fl({ ...s, oneWay: 1 })),
  ];
  const movers = [
    { w: 32, h: 4, ax: 84, bx: 204, ay: 150, by: 150, period: 6, oneWay: 1 },
    { w: 28, h: 4, ax: 96, bx: 96, ay: 108, by: 52, period: 5, oneWay: 1 },
    { w: 28, h: 4, ax: 196, bx: 196, ay: 52, by: 108, period: 5, oneWay: 1 },
  ];
  moveMovers(movers, 0);
  const all = [...solids, ...movers];
  const players = ctx.players.map((pl, i) => {
    const st = pl.stats;
    const w = 8 * st.size, h = 11 * st.size;
    return {
      seat: pl.seat, idx: pl.idx, st, b: makeBody(70 + i * 90, 150, w, h), coins: 0, lastGain: 0,
      face: 1, shoveCd: 0, shoveT: 0, blockT: 0, blockCd: 0, shields: st.shields, stunT: 0, inv: 0, flashT: 0,
    };
  });
  const coins = [];
  const barrels = [];
  const bolts = [];
  const pend = { ax: 160, ay: 16, len: 58, a: 1.1, w: 0, r: 7 };
  let coinT = 0, jackT = 7, boltT = 3, barrelT = 4;
  let t = 0, endT = null;
  const game = { meta, finished: false, ranking: [], players };

  function dropCoin(x, y, value = 1, burst = false) {
    coins.push({ x, y, vx: burst ? rand(-90, 90) : rand(-10, 10), vy: burst ? rand(-180, -80) : 0, r: value > 1 ? 4 : 2.5, value, life: 9, grabDelay: burst ? 0.4 : 0, rot: rand(0, 6) });
  }
  function loseCoins(p, n, sx) {
    if (p.inv > 0 || p.blockT > 0) { if (p.blockT > 0) { fx.ring(p.b.x + p.b.w / 2, p.b.y + p.b.h / 2, 12, '#9ff'); sound.sfx('block'); } return false; }
    if (p.shields > 0) {
      p.shields -= 1; p.inv = 0.8;
      fx.popup('AIRBAG!', p.b.x + p.b.w / 2, p.b.y - 10, '#9fd3ff', 1); sound.sfx('block'); return false;
    }
    n = Math.min(p.coins, n);
    p.coins -= n; p.inv = 0.8; p.flashT = 0.12;
    for (let k = 0; k < n; k++) dropCoin(p.b.x + p.b.w / 2, p.b.y, 1, true);
    if (n) fx.popup(`-${n}`, p.b.x + p.b.w / 2, p.b.y - 10, '#ff5a5a', 2);
    sound.sfx('hit'); fx.shake(0.15);
    return true;
  }
  function knock(p, kx, ky) {
    if (p.blockT > 0) return;
    p.b.vx += kx * p.st.knockTaken; p.b.vy += ky * p.st.knockTaken; p.b.stun = 0.25;
  }
  function shockwave(p) {
    const cx = p.b.x + p.b.w / 2, cy = p.b.y + p.b.h;
    const R = 20 + 8 * p.st.aftershock;
    fx.ring(cx, cy, R, '#ffd84a', 0.3); sound.sfx('boom');
    for (const o of players) {
      if (o === p) continue;
      const ox = o.b.x + o.b.w / 2, oy = o.b.y + o.b.h;
      const d = Math.hypot(ox - cx, oy - cy);
      if (d < R) { knock(o, Math.sign(ox - cx || 1) * 160, -140); loseCoins(o, 1); }
    }
  }

  game.update = (dt, controls) => {
    t += dt;
    moveMovers(movers, t);
    // coin rain
    coinT -= dt;
    if (coinT <= 0) { coinT = rand(0.18, 0.34); dropCoin(rand(10, 310), 10); }
    jackT -= dt;
    if (jackT <= 0) { jackT = 8; dropCoin(rand(60, 260), 10, 5); fx.popup('JACKPOT COIN!', 160, 40, '#ffd84a', 2); sound.sfx('warn'); }
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.life -= dt; c.grabDelay -= dt; c.rot += dt * 8;
      // magnets
      for (const p of players) {
        if (!p.st.magnet) continue;
        const dx = p.b.x + p.b.w / 2 - c.x, dy = p.b.y + p.b.h / 2 - c.y, d = Math.hypot(dx, dy);
        if (d < 34 * p.st.magnet && d > 1) { c.vx += (dx / d) * 500 * dt; c.vy += (dy / d) * 500 * dt; if (Math.random() < 0.1) fx.burst(c.x, c.y, 1, '#ff4f8b', { speed: 10, life: 0.2 }); }
      }
      c.vy = Math.min(220, c.vy + 380 * dt);
      const py = c.y;
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.x < 2 || c.x > 318) { c.vx = -c.vx * 0.6; c.x = clamp(c.x, 2, 318); }
      for (const s of all) {
        if (c.x > s.x && c.x < s.x + s.w && c.y + c.r > s.y && py + c.r <= s.y + 3 && c.vy > 0) { c.y = s.y - c.r; c.vy = -c.vy * 0.35; c.vx *= 0.7; if (Math.abs(c.vy) < 20) c.vy = 0; c.x += s.dx || 0; }
      }
      let taken = false;
      if (c.grabDelay <= 0) for (const p of players) {
        if (!circleRect(c.x, c.y, c.r + 1, p.b)) continue;
        let v = c.value;
        if (p.st.split && Math.random() < 0.25 * p.st.split) { v *= 2; fx.popup('x2', c.x, c.y - 6, '#c6ff5a', 1); }
        p.coins += v; p.lastGain = t;
        sound.sfx(c.value > 1 ? 'jackpot' : 'coin');
        fx.burst(c.x, c.y, c.value > 1 ? 14 : 4, '#ffd84a', { speed: 50, life: 0.3 });
        if (c.value > 1) fx.popup('+5', c.x, c.y - 8, '#ffd84a', 2);
        taken = true; break;
      }
      if (taken || c.life <= 0) coins.splice(i, 1);
    }
    // lightning
    boltT -= dt;
    if (boltT <= 0) {
      boltT = Math.max(1.3, 3.2 - t * 0.06);
      const target = Math.random() < 0.6 ? players[Math.floor(rand(0, players.length))] : null;
      const x = target ? clamp(target.b.x + target.b.w / 2 + rand(-12, 12), 10, 310) : rand(10, 310);
      bolts.push({ x, warn: 1.0, life: 0.25, w: 14 });
      sound.sfx('warn');
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const bo = bolts[i];
      if (bo.warn > 0) {
        bo.warn -= dt;
        if (bo.warn <= 0) {
          sound.sfx('zap'); fx.shake(0.3); fx.flash('#e8f0ff', 0.25);
          fx.burst(bo.x, 168, 14, '#e8f0ff', { speed: 120, life: 0.4, angle: -Math.PI / 2, spread: 2 });
          for (const p of players) {
            const cx = p.b.x + p.b.w / 2;
            if (Math.abs(cx - bo.x) < bo.w / 2 + p.b.w / 2) {
              if (loseCoins(p, Math.ceil(p.coins / 2))) { p.stunT = 0.6; p.b.vy = -150; }
            }
          }
        }
        continue;
      }
      bo.life -= dt;
      if (bo.life <= 0) bolts.splice(i, 1);
    }
    // barrels
    barrelT -= dt;
    if (barrelT <= 0) {
      barrelT = rand(3, 4.5);
      const fromLeft = Math.random() < 0.5;
      barrels.push({ x: fromLeft ? -8 : 328, y: 160, vx: (fromLeft ? 1 : -1) * rand(70, 95), r: 7, rot: 0, warn: 0.8, fromLeft });
      sound.sfx('warn');
    }
    for (let i = barrels.length - 1; i >= 0; i--) {
      const br = barrels[i];
      if (br.warn > 0) { br.warn -= dt; continue; }
      br.x += br.vx * dt; br.rot += br.vx * dt * 0.15;
      if (Math.random() < 0.2) fx.dust(br.x, 168, '#6a6a7a', 1);
      for (const p of players) {
        if (p.inv > 0 || !circleRect(br.x, br.y, br.r, p.b)) continue;
        knock(p, Math.sign(br.vx) * 200, -170); loseCoins(p, 2);
      }
      if (br.x < -20 || br.x > 340) barrels.splice(i, 1);
    }
    // pendulum
    pend.w += -9.0 / pend.len * 60 * Math.sin(pend.a) * dt; // gravity-ish swing
    pend.a += pend.w * dt;
    if (Math.abs(pend.a) < 0.05 && Math.abs(pend.w) < 0.9) pend.w = Math.sign(pend.w || 1) * 1.6;
    const bx = pend.ax + Math.sin(pend.a) * pend.len, by = pend.ay + Math.cos(pend.a) * pend.len;
    for (const p of players) {
      if (p.inv > 0 || !circleRect(bx, by, pend.r, p.b)) continue;
      knock(p, Math.sign(p.b.x + p.b.w / 2 - bx || 1) * 230, -150); loseCoins(p, 3);
    }

    // players
    for (const p of players) {
      const c = controls.get(p.seat);
      p.inv -= dt; p.flashT -= dt; p.shoveCd -= dt; p.shoveT -= dt; p.blockT -= dt; p.blockCd -= dt;
      const ctl = p.stunT > 0 ? { ...c, mx: 0, jumpP: false, jump: false } : c;
      p.stunT -= dt;
      const ev = platformControl(p.b, ctl, p.st, dt);
      if (ev) { sound.sfx('jump'); fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#8a8aa8'); }
      if (Math.abs(c.mx) > 0.2) p.face = Math.sign(c.mx);
      if (c.blockP && p.blockCd <= 0) { p.blockT = 0.35; p.blockCd = 2.4 * p.st.blockCd; sound.sfx('block'); }
      if (c.fireP && p.shoveCd <= 0 && p.stunT <= 0) {
        p.shoveCd = 0.75 * p.st.fireCd; p.shoveT = 0.15; sound.sfx('shove');
        // homing lunge
        if (p.st.homing) {
          let best = null, bd = 60;
          for (const o of players) { if (o === p) continue; const d = Math.abs(o.b.x - p.b.x) + Math.abs(o.b.y - p.b.y); if (d < bd) { bd = d; best = o; } }
          if (best) { p.face = Math.sign(best.b.x - p.b.x) || p.face; p.b.vx = p.face * 220; p.b.stun = 0.12; }
        }
        const reach = 13 * p.st.size + 3 * p.st.spread;
        const box = { x: p.face > 0 ? p.b.x + p.b.w - 2 : p.b.x - reach + 2, y: p.b.y - 3 * p.st.spread, w: reach, h: p.b.h + 6 * p.st.spread };
        fx.burst(p.b.x + p.b.w / 2 + p.face * 8, p.b.y + p.b.h / 2, 5, '#fff', { speed: 70, life: 0.15, angle: p.face > 0 ? 0 : Math.PI, spread: 1 });
        let hitAny = false;
        for (const o of players) {
          if (o === p || !overlap(box, o.b)) continue;
          hitAny = true;
          knock(o, p.face * 210 * p.st.knock, -130);
          loseCoins(o, Math.round(2 * p.st.dmg));
        }
        if (hitAny) { fx.stop(0.04); if (p.st.aftershock) shockwave(p); }
      }
      stepBody(p.b, dt, all);
      if (p.b.landed) fx.dust(p.b.x + p.b.w / 2, p.b.y + p.b.h, '#8a8aa8');
      if (p.st.bounces && p.b.hitWallX && Math.abs(p.b.wallSpeed) > 60) {
        p.b.vx = -p.b.hitWallX * (130 + 30 * p.st.bounces); p.b.vy = Math.min(p.b.vy, -120); p.b.stun = 0.2;
        fx.burst(p.b.x + (p.b.hitWallX > 0 ? p.b.w : 0), p.b.y + p.b.h / 2, 5, '#7dff8a', { speed: 50, life: 0.2 }); sound.sfx('boing');
      }
      if (p.b.y > 190) { p.b.y = 150; p.b.vy = 0; }
    }
    // stomps
    for (const p of players) for (const o of players) {
      if (p === o || p.b.vy <= 60) continue;
      const feet = p.b.y + p.b.h;
      if (feet > o.b.y && feet < o.b.y + 6 && p.b.x + p.b.w > o.b.x + 1 && p.b.x < o.b.x + o.b.w - 1) {
        p.b.vy = -230; p.b.jumps = 1;
        o.stunT = 0.5; o.b.squash = 1;
        if (loseCoins(o, 3)) fx.popup('STOMP!', o.b.x + o.b.w / 2, o.b.y - 8, '#fff', 1);
        if (p.st.aftershock) shockwave(p);
      }
    }

    if (endT === null && t >= TIME) endT = 0.8;
    if (endT !== null) {
      endT -= dt;
      if (endT <= 0 && !game.finished) {
        game.finished = true;
        game.ranking = players.slice().sort((a, b) => b.coins - a.coins || a.lastGain - b.lastGain).map((p) => p.seat);
      }
    }
  };
  game.hud = (seat) => '$' + players.find((p) => p.seat === seat).coins;
  Object.defineProperty(game, 'timeLeft', { get: () => Math.max(0, TIME - t) });

  game.draw = (g) => {
    g.rect(0, 0, 320, 180, '#0e0a24', true);
    g.rect(0, 100, 320, 80, '#160f34', true);
    for (let k = 0; k < 14; k++) {
      const x = k * 24, h = 40 + ((k * 37) % 50);
      g.rect(x, 168 - h, 20, h, '#1f1846', true);
      for (let w = 0; w < 6; w++) if ((k + w) % 3) g.rect(x + 3 + (w % 2) * 9, 168 - h + 6 + Math.floor(w / 2) * 10, 4, 4, (k + w + Math.floor(t)) % 5 ? '#3a2f6a' : '#ffd27a', true);
    }
    // storm clouds
    for (let k = 0; k < 9; k++) g.circle(k * 40 + Math.sin(t * 0.5 + k) * 4, 8, 14, '#2a2448', true);
    // bolts
    for (const bo of bolts) {
      if (bo.warn > 0) {
        if (Math.floor(t * 14) % 2) { g.alpha(0.25); g.rect(bo.x - bo.w / 2, 14, bo.w, 154, '#e8f0ff'); g.alpha(1); }
        g.text('!', bo.x, 18, { scale: 3, col: '#e8f0ff', align: 'center', ui: false });
      } else {
        let x = bo.x;
        for (let y = 10; y < 168; y += 8) { const nx = bo.x + rand(-5, 5); g.beam(x, y, nx, y + 8, 3, '#e8f0ff'); x = nx; }
        g.alpha(0.4); g.rect(bo.x - bo.w / 2, 10, bo.w, 158, '#9fb8ff'); g.alpha(1);
      }
    }
    for (const s of solids) {
      if (s.oneWay) { g.rect(s.x, s.y, s.w, s.h, '#5a5480'); for (let x = s.x + 2; x < s.x + s.w; x += 5) g.rect(x, s.y + 1, 2, 2, '#2e2a48'); }
      else { g.rect(s.x, s.y, s.w, s.h, '#2a2244'); g.rect(s.x, s.y, s.w, 2, '#ffd84a'); for (let x = 4; x < 320; x += 16) g.rect(x, s.y + 5, 8, 1, '#ffd84a55'); }
    }
    for (const m of movers) { g.rect(m.x, m.y, m.w, m.h, '#33d6ff'); g.rect(m.x + 2, m.y + 1, m.w - 4, 1, '#bff3ff'); }
    // pendulum
    const bx = pend.ax + Math.sin(pend.a) * pend.len, by = pend.ay + Math.cos(pend.a) * pend.len;
    g.dotted(pend.ax, pend.ay, bx, by, '#9a9ab0', 2);
    g.circle(bx, by, pend.r, '#7a7a8a'); g.circle(bx - 2, by - 2, pend.r * 0.5, '#aaaabb');
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; g.rect(bx + Math.cos(a) * (pend.r + 1) - 1, by + Math.sin(a) * (pend.r + 1) - 1, 2, 2, '#ddd'); }
    // coins
    for (const c of coins) {
      if (c.life < 2 && Math.floor(t * 10) % 2) continue;
      const wv = Math.abs(Math.cos(c.rot)) * c.r + 0.6;
      g.rect(c.x - wv, c.y - c.r, wv * 2, c.r * 2, c.value > 1 ? '#fff2a0' : '#ffd84a');
      g.rect(c.x - wv * 0.4, c.y - c.r + 1, Math.max(1, wv * 0.8), c.r * 2 - 2, c.value > 1 ? '#ffd84a' : '#c99a1a');
    }
    // barrels
    for (const br of barrels) {
      if (br.warn > 0) { if (Math.floor(t * 12) % 2) g.text(br.fromLeft ? '>>' : '<<', br.fromLeft ? 10 : 300, 150, { scale: 2, col: '#ff5a5a', align: 'center', ui: false }); continue; }
      g.circle(br.x, br.y, br.r, '#8a5a2a');
      g.rect(br.x - br.r, br.y - 1, br.r * 2, 2, '#5a3a1a');
      g.rect(br.x + Math.cos(br.rot) * 4 - 1, br.y + Math.sin(br.rot) * 4 - 1, 2, 2, '#c08a4a');
    }
    // players
    for (const p of players) {
      const cx = p.b.x + p.b.w / 2;
      const blink = p.inv > 0 && Math.floor(t * 16) % 2;
      drawPlayer(g, p.idx, cx, p.b.y + p.b.h, { flip: p.face < 0, size: p.st.size, flash: p.flashT > 0, alpha: blink ? 0.5 : 1, squash: p.b.squash });
      if (p.shoveT > 0) { g.rect(cx + p.face * 6, p.b.y + p.b.h * 0.4, p.face * 8 * p.st.size, 3, '#fff'); }
      if (p.blockT > 0) g.ring(cx, p.b.y + p.b.h / 2, 10 * p.st.size, '#9ff');
      if (p.stunT > 0) for (let k = 0; k < 3; k++) { const a = t * 8 + k * 2; g.rect(cx + Math.cos(a) * 5, p.b.y - 4 + Math.sin(a) * 2, 1, 1, '#ffd84a'); }
      if (p.shields) g.ring(cx, p.b.y + p.b.h / 2, 8 * p.st.size, '#9fd3ff55');
      drawTag(g, p.idx, cx, p.b.y - 3);
      g.text('$' + p.coins, cx, p.b.y - 18, { scale: 1, col: '#ffd84a', align: 'center', ui: false });
    }
  };
  return game;
}
