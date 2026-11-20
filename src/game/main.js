// LAST CALL ARCADE: game night flow.
// title/join → intro → countdown → play → finish → results → draft → … → podium → rematch
import { InputAdapter, BTN } from '../input/gamepad-adapter.js';
import { Gfx } from '../engine/gfx.js';
import { Fx, SHAKE_LEVELS } from '../engine/fx.js';
import { Sound } from '../engine/audio.js';
import { drawPlayer, SEAT_COLORS, SEAT_NAMES } from '../engine/sprites.js';
import { rand, clamp, choice } from '../engine/util.js';
import { readControls, installKeyboard, keyboardPads, NO_CONTROLS } from './controls.js';
import { Match } from './match.js';
import { POWER_BY_ID, RARITY, cardWhere, cardLines, TIPSY_NAMES, TIPSY_LINES, pickupMult } from './powers.js';
import { TWISTS } from './twists.js';
import * as rumble from '../games/rumble.js';
import * as dustlap from '../games/dustlap.js';
import * as lounge from '../games/lounge.js';
import * as coins from '../games/coins.js';
import * as orbit from '../games/orbit.js';
import * as blastball from '../games/blastball.js';
import * as splat from '../games/splat.js';
import * as tick from '../games/tick.js';
import * as updraft from '../games/updraft.js';
import * as lightsout from '../games/lightsout.js';
import * as mobius from '../games/mobius.js';
import * as echo from '../games/echo.js';
import * as mirror from '../games/mirror.js';
import * as wormhole from '../games/wormhole.js';
import * as rules from '../games/rules.js';
import * as still from '../games/still.js';
import { Bot } from './bots.js';
import { Drift, P, glyph, prompt } from '../engine/style.js';

export const BUILD = 'm1-2026-11-20.8-polish';
export const GAMES = { rumble, dustlap, lounge, coins, orbit, blastball, splat, tick, updraft, lightsout, mobius, echo, mirror, wormhole, rules, still };
const GAME_IDS = Object.keys(GAMES);
const params = new URLSearchParams(location.search);
const MIN_PLAYERS = params.has('solo') ? 1 : 2;
const EVENTS = params.get('rounds') === '1' ? 4 : clamp(parseInt(params.get('events') || '8', 10) || 8, 3, 14);
const FORCE_TWIST = params.get('twist');
const TWIST_CHANCE = 0.5;
// Colour drift looks (audit F-07). CALM and BOLD drift only the backdrop and
// inactive geometry through style.js; WILD adds the old whole-screen hue swing.
const TRIP_LEVELS = [
  { name: 'CALM', drift: 'calm', amp: 0, kick: 0, sat: 1 },
  { name: 'BOLD', drift: 'bold', amp: 0, kick: 0, sat: 1 },
  { name: 'WILD', drift: 'bold', amp: 45, kick: 90, sat: 1.35 },
  { name: 'OFF', drift: 'off', amp: 0, kick: 0, sat: 1 },
];
const ONLY = params.get('only'); // e.g. ?only=lounge to practise one game
const DRAFT_TIME = 15;
const DRAFT_AFTER_LOCK = 8;  // once one picker locks, the rest get at most this long (F-11)
const DRAFT_GUARD = 0.35;    // ignore draft input this long after the screen opens
const LOCK_BEAT = 0.7;       // hold the locked cards on screen before moving on
const DEFAULT_PROMPTS = ['Toast the winner!', 'Snack break - grab something', 'Loser picks the next song', 'Everyone swap couch seats', 'Winner tells a bad joke'];

// ---------- setup ----------
try { if ('gamepadInputEmulation' in navigator) navigator.gamepadInputEmulation = 'gamepad'; } catch (e) { /* ignore */ }
installKeyboard();
const bots = [];
let wantBot = 0;
let kbStart = false;
addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !e.repeat) wantBot += 1; if (e.code === 'Enter' && !e.repeat) kbStart = true; });
const input = new InputAdapter({
  seatCount: 3,
  getGamepads: () => [...(navigator.getGamepads ? Array.from(navigator.getGamepads()) : []), ...keyboardPads(), ...bots.map((b) => b.pad())],
});
const canvas = document.getElementById('game');
const g = new Gfx(canvas);
const fx = new Fx();
const drift = new Drift();
const sound = new Sound();

function load(key, def) { try { const v = localStorage.getItem('lca.' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
function save(key, v) { try { localStorage.setItem('lca.' + key, JSON.stringify(v)); } catch (e) { /* ignore */ } }
const settings = {
  shake: load('shake', 0), muted: load('muted', false), house: load('house', false), trip: load('look', 0), calm: load('calm', false),
  prompts: params.get('rules') ? params.get('rules').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 12) : DEFAULT_PROMPTS,
};
sound.setMuted(settings.muted);
function applyLook() {
  if (!TRIP_LEVELS[settings.trip]) settings.trip = 0;
  drift.setMode(settings.calm ? 'off' : TRIP_LEVELS[settings.trip].drift);
  fx.calm = settings.calm;
  fx.shakeK = settings.calm ? 0 : SHAKE_LEVELS[settings.shake].k;
}
applyLook();

// keep the controller from driving the browser
history.pushState({ lca: 1 }, '');
addEventListener('popstate', () => history.pushState({ lca: 1 }, ''));
addEventListener('keydown', (e) => { sound.ensure(); if (e.code !== 'F5' && e.code !== 'F11' && e.code !== 'F12') e.preventDefault(); }, { capture: true });
for (const ev of ['mousedown', 'pointerdown', 'touchstart']) addEventListener(ev, () => sound.ensure(), { passive: true });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
addEventListener('beforeunload', (e) => { if (st.match && st.screen !== 'title') { e.preventDefault(); e.returnValue = ''; } });

function fit() {
  const k = Math.min(innerWidth / 640, innerHeight / 360);
  const kk = k >= 1 ? Math.floor(k * 2) / 2 : k; // prefer clean scales
  canvas.style.width = `${640 * kk}px`;
  canvas.style.height = `${360 * kk}px`;
}
addEventListener('resize', fit); fit();

// ---------- state ----------
const st = {
  screen: 'title', t: 0, match: null, game: null, gameId: null, variants: {}, ready: new Set(),
  draft: null, awards: null, prompt: null, paused: false, sdWinner: null, finalOrder: null, viewHold: {}, events: [],
};
function go(screen) { st.screen = screen; st.t = 0; }
const seatsInMatch = () => (st.match ? st.match.players.map((p) => p.seat) : []);
const seatObj = (n) => input.seats[n - 1];
const anyPressed = (b, seats = null) => input.seats.some((s) => (!seats || seats.includes(s.n)) && s.pressed(b));

function startMatch() {
  const seats = input.seats.filter((s) => s.active).map((s) => s.n);
  input.joinOpen = false;
  st.match = new Match(seats, ONLY && GAMES[ONLY] ? [ONLY] : GAME_IDS, { perGame: ONLY ? 4 : 2, total: ONLY ? 4 : EVENTS, tierOf: ONLY ? null : (id) => GAMES[id].meta.tier || 1 });
  st.variants = {}; st.sdWinner = null;
  toIntro();
}
function toIntro() {
  st.gameId = st.match.current;
  st.ready = new Set();
  const m = GAMES[st.gameId].meta;
  st.twistId = null;
  if (FORCE_TWIST && TWISTS[FORCE_TWIST]) st.twistId = FORCE_TWIST;
  else if (!st.match.suddenDeath && st.match.eventIdx >= 1 && m.twists && m.twists.length && Math.random() < TWIST_CHANCE) st.twistId = choice(m.twists);
  st.twist = st.twistId ? { id: st.twistId, ...TWISTS[st.twistId] } : null;
  go('intro');
  sound.music('results');
}
function startGame() {
  const id = st.gameId;
  const v = st.match.suddenDeath ? Math.floor(rand(0, 4)) : (st.variants[id] = (st.variants[id] ?? -1) + 1);
  fx.reset();
  const n = st.match.players.length;
  st.game = GAMES[id].create({
    fx, sound, drift, variant: v, twist: st.twist,
    players: st.match.players.map((p) => {
      const stats = st.match.stats(p.seat);
      if (st.twist && st.twist.size) stats.size *= st.twist.size;
      return {
        seat: p.seat, idx: p.seat - 1, stats, tipsy: p.tipsy,
        pickupMult: pickupMult(st.match.rankIndex(p.seat), n, p.tipsy),
        ghost: !!(st.match.suddenDeath && !st.match.suddenDeath.includes(p.seat)),
      };
    }),
  });
  go('countdown');
  sound.music(GAMES[id].meta.music);
}
function finishGame() {
  const ranking = st.game.ranking.slice();
  st.lastRanking = ranking;
  if (st.match.suddenDeath) {
    st.sdWinner = ranking.find((s) => st.match.suddenDeath.includes(s));
    st.awards = null;
  } else {
    st.awards = st.match.award(ranking);
  }
  go('finish');
  sound.sfx('win');
}
function afterResults() {
  if (st.match.suddenDeath) return toFinal();
  const order = st.match.draftOrder(st.lastRanking);
  if (order.length) {
    st.draft = {
      next: st.match.next,
      pickers: order.map((seat) => ({ seat, hand: st.match.offer(seat), cur: 0, picked: null, lockedAt: null })),
      deadline: DRAFT_TIME, doneAt: null,
    };
    go('draft');
    return;
  }
  if (st.match.isLast) {
    const tied = st.match.tiedLeaders();
    if (tied.length > 1) { st.match.startSuddenDeath(tied); st.sdIntro = true; return toIntro(); }
    return toFinal();
  }
  st.match.advance(); toIntro();
}
function finishDraft() {
  for (const p of st.draft.pickers) {
    const id = p.picked || p.hand[p.cur];
    st.match.pick(p.seat, id);
  }
  st.draft = null;
  st.match.advance();
  toIntro();
}
function toFinal() {
  st.finalOrder = st.match.finalOrder(st.sdWinner);
  go('final');
  sound.music('title');
  sound.sfx('win');
}
function toTitle(resetSeats) {
  if (resetSeats) { input.resetAll(); bots.length = 0; }
  input.joinOpen = true;
  st.match = null; st.game = null; st.paused = false;
  go('title');
  sound.music('title');
}
function maybePrompt() {
  st.prompts = [];
  if (!settings.house) return false;
  const w = st.match.suddenDeath ? st.sdWinner : st.lastRanking[0];
  if (w) st.prompts.push({ title: "WINNER'S CURSE", text: `P${w} won. Take a sip!`, col: SEAT_COLORS[w - 1] });
  if (settings.prompts.length && Math.random() < 0.3) st.prompts.push({ title: 'HOUSE RULE', text: choice(settings.prompts), col: '#ffd84a' });
  if (!st.prompts.length) return false;
  go('prompt');
  return true;
}

// ---------- update ----------
const isBotSeat = (s) => s && s.padId === 'CPU player';
function addBot() {
  if (!input.joinOpen) return;
  if (input.seats.every((s) => s.state !== 'empty')) {
    const b = bots.pop();
    if (b) { const seat = input.seats.find((s) => s.padIndex === b.index); if (seat) input.leave(seat); sound.sfx('lose'); }
    return;
  }
  const b = new Bot(); b.tap(BTN.A); bots.push(b); sound.sfx('move');
}
function runBots(dt) {
  while (wantBot > 0) { wantBot -= 1; addBot(); }
  for (const b of bots) {
    const seat = input.seats.find((s) => s.padIndex === b.index && s.state !== 'empty');
    b.think({ screen: st.paused ? 'paused' : st.screen, dt, game: st.game, seatN: seat ? seat.n : null });
  }
}
function update(dt) {
  drift.update(dt);
  runBots(dt);
  const events = input.update(performance.now());
  if (events.some((e) => e.type === 'press' || e.type === 'join')) sound.ensure();
  for (const e of events) {
    if (e.type === 'join') { sound.sfx('join'); fx.burst(60 + (e.seat - 1) * 100, 120, 20, SEAT_COLORS[e.seat - 1], { speed: 90, life: 0.6 }); }
    if (e.type === 'rejoin') { sound.sfx('join'); fx.popup(`P${e.seat} IS BACK`, 160, 90, SEAT_COLORS[e.seat - 1], 2); }
  }
  st.t += dt;
  const inMatch = seatsInMatch();
  const missing = inMatch.filter((n) => !seatObj(n).active);

  if (st.screen === 'title') return updateTitle(dt);

  // pause (Menu) and controller drop
  if (!st.paused && (anyPressed(BTN.MENU, inMatch) || (missing.length && ['countdown', 'play'].includes(st.screen)))) {
    st.paused = true; sound.sfx('beep');
    return;
  }
  if (st.paused) {
    if (missing.length) return;
    if (anyPressed(BTN.A, inMatch)) { st.paused = false; sound.sfx('beep'); }
    else if (anyPressed(BTN.Y, inMatch)) toTitle(false);
    else if (anyPressed(BTN.X, inMatch)) cycleShake();
    else if (anyPressed(BTN.LB, inMatch)) toggleMute();
    else if (anyPressed(BTN.RB, inMatch)) cycleTrip();
    else if (anyPressed(BTN.B, inMatch)) toggleCalm();
    return;
  }

  const controls = new Map(inMatch.map((n) => [n, readControls(seatObj(n))]));
  fx.update(dt);

  switch (st.screen) {
    case 'intro': {
      for (const n of inMatch) if (controls.get(n).jumpP && !st.ready.has(n) && st.t > 0.25) { st.ready.add(n); sound.sfx('ready'); }
      if ((st.ready.size >= inMatch.length && st.t > 0.6) || st.t > 9) startGame();
      break;
    }
    case 'countdown': {
      const before = Math.ceil(3 - (st.t - dt) * 1.25), now = Math.ceil(3 - st.t * 1.25);
      if (now !== before && now > 0) sound.sfx('beep');
      if (st.t * 1.25 >= 3) { sound.sfx('go'); go('play'); }
      break;
    }
    case 'play': {
      const ts = fx.timeScale() * ((st.twist && st.twist.timeScale) || 1);
      tipsyControls(controls, dt);
      if (ts > 0) st.game.update(dt * ts, controls);
      if (st.game.finished) finishGame();
      break;
    }
    case 'finish': {
      if (st.t > 2.2) go('results');
      break;
    }
    case 'results': {
      if (st.t > 1.2 && (anyPressed(BTN.A, inMatch) || st.t > 6)) { if (!maybePrompt()) afterResults(); }
      break;
    }
    case 'prompt': {
      if (st.t > 0.4 && (anyPressed(BTN.X, inMatch) || anyPressed(BTN.A, inMatch) || st.t > 10)) {
        st.prompts.shift(); sound.sfx('move');
        if (st.prompts.length) go('prompt'); else afterResults();
      }
      break;
    }
    case 'draft': updateDraft(controls); break;
    case 'final': {
      if (st.t > 2 && anyPressed(BTN.A, inMatch)) { st.match.reset(); st.variants = {}; st.sdWinner = null; toIntro(); }
      else if (st.t > 2 && anyPressed(BTN.Y, inMatch)) toTitle(true);
      if (Math.random() < 0.5) fx.burst(rand(0, 320), -4, 2, SEAT_COLORS[Math.floor(rand(0, 3))], { speed: 30, life: 2.5, grav: 40, angle: Math.PI / 2, spread: 1, drag: 0.5 });
      break;
    }
    default: break;
  }
}

function tipsyControls(controls, dt) {
  const t = performance.now() / 1000;
  for (const p of st.match.players) {
    if (!p.tipsy) continue;
    const c = controls.get(p.seat);
    if (!c) continue;
    const w = [0, 0.28, 0.45, 0.62][p.tipsy];
    const out = { ...c, mx: clamp(c.mx + w * Math.sin(t * 2.1 + p.seat * 1.7), -1, 1), my: clamp(c.my + w * 0.7 * Math.cos(t * 1.6 + p.seat), -1, 1) };
    if (p.tipsy >= 3 && Math.random() < dt / 5) { out.jumpP = true; out.jump = true; fx.popup('HIC!', [30, 220, 284][st.match.players.indexOf(p)] || 160, 24, SEAT_COLORS[p.seat - 1], 2); sound.sfx('boing'); }
    controls.set(p.seat, out);
  }
}
function cycleTrip() { settings.trip = (settings.trip + 1) % TRIP_LEVELS.length; save('look', settings.trip); applyLook(); fx.hueKick = TRIP_LEVELS[settings.trip].kick; sound.sfx('move'); }
function toggleCalm() { settings.calm = !settings.calm; save('calm', settings.calm); applyLook(); sound.sfx('move'); }
function cycleShake() { settings.shake = (settings.shake + 1) % SHAKE_LEVELS.length; save('shake', settings.shake); applyLook(); fx.shake(0.5); sound.sfx('move'); }
function toggleMute() { settings.muted = !settings.muted; sound.setMuted(settings.muted); save('muted', settings.muted); sound.sfx('move'); }

function updateTitle(dt) {
  fx.update(dt);
  sound.music('title');
  for (const s of input.seats) {
    if (s.held(BTN.VIEW)) {
      st.viewHold[s.n] = (st.viewHold[s.n] || 0) + dt;
      if (st.viewHold[s.n] > 1.5) { input.leave(s); delete st.viewHold[s.n]; sound.sfx('lose'); }
    } else delete st.viewHold[s.n];
  }
  if (anyPressed(BTN.Y)) cycleShake();
  if (anyPressed(BTN.LB)) toggleMute();
  if (anyPressed(BTN.RB)) { settings.house = !settings.house; save('house', settings.house); sound.sfx('move'); }
  if (anyPressed(BTN.LT)) cycleTrip();
  if (anyPressed(BTN.B)) toggleCalm();
  if (anyPressed(BTN.RT)) wantBot += 1;
  const go2 = kbStart; kbStart = false;
  if (input.activeCount >= MIN_PLAYERS && (anyPressed(BTN.X) || anyPressed(BTN.MENU) || go2)) { sound.sfx('go'); startMatch(); }
}

function updateDraft(controls) {
  const d = st.draft;
  if (d.doneAt !== null) { if (st.t - d.doneAt >= LOCK_BEAT) finishDraft(); return; }
  for (const p of d.pickers) {
    if (p.picked) continue;
    if (st.t < DRAFT_GUARD) continue; // a press carried over from results can't pick (F-11)
    const c = controls.get(p.seat) || NO_CONTROLS;
    if (c.upP) { p.cur = (p.cur + 2) % 3; sound.sfx('move'); }
    if (c.downP) { p.cur = (p.cur + 1) % 3; sound.sfx('move'); }
    if (c.jumpP) {
      p.picked = p.hand[p.cur]; p.lockedAt = st.t; sound.sfx('lock');
      d.deadline = Math.min(d.deadline, st.t + DRAFT_AFTER_LOCK);
      const k4 = d.pickers.indexOf(p), n4 = d.pickers.length;
      fx.ring((n4 === 1 ? 58 : 6 + k4 * 156) + (n4 === 1 ? 102 : 76), 80, 30, POWER_BY_ID[p.picked].col, 0.4);
    }
  }
  const done = d.pickers.every((p) => p.picked);
  if (done && st.t > 0.3) { d.doneAt = st.t; return; }
  if (st.t > d.deadline) {
    for (const p of d.pickers) if (!p.picked) { p.picked = p.hand[p.cur]; p.lockedAt = st.t; p.auto = true; }
    sound.sfx('lock'); d.doneAt = st.t;
  }
}

// ---------- drawing helpers ----------
function chip(label, x, y, col = '#fff') {
  const w = g.textW(label, 2) + 4;
  g.rect(x, y - 1, w, 9, '#0b0a12', true);
  g.frame(x, y - 1, w, 9, col, 1, true);
  g.text(label, x + 2, y, { scale: 2, col, shadow: null });
  return w;
}
function panel(x, y, w, h, border = '#5b4f8a', fill = '#120f24') {
  g.rect(x, y, w, h, fill, true);
  g.frame(x, y, w, h, border, 1, true);
}
function bg(t, colA = '#1a0f33', colB = '#2b0f3f') {
  g.rect(0, 0, 320, 180, colA, true);
  for (let y = 0; y < 180; y += 6) { g.alpha(0.25 + 0.2 * Math.sin(y * 0.05 + t)); g.rect(0, y, 320, 3, colB, true); }
  g.alpha(1);
  for (let x = -20; x < 340; x += 20) { const xx = (x + t * 10) % 340; g.rect(xx, 0, 1, 180, '#ffffff08', true); }
}
const ordinal = (n) => ['1ST', '2ND', '3RD'][n - 1] || `${n}TH`;
function seatLabel(n) { return `P${n} ${SEAT_NAMES[n - 1]}`; }

// ---------- draw ----------
function draw() {
  const [ox, oy] = fx.offset();
  g.setOffset(ox, oy);
  switch (st.screen) {
    case 'title': drawTitle(); break;
    case 'intro': drawIntro(); break;
    case 'countdown': case 'play': case 'finish': drawPlay(); break;
    case 'results': case 'prompt': drawResults(); if (st.screen === 'prompt') drawPrompt(); break;
    case 'draft': drawDraft(); break;
    case 'final': drawFinal(); break;
    default: break;
  }
  fx.drawFlash(g);
  if (st.paused) drawPause();
}

function drawTitle() {
  const t = performance.now() / 1000;
  bg(t, '#140b2a', '#3a0f4a');
  // sun
  for (let k = 0; k < 8; k++) { g.rect(116, 70 + k * 4.5, 88, 3, k % 2 ? '#ff5fd2' : '#ff9a2e', true); }
  g.rect(0, 108, 320, 72, '#0d0820', true);
  for (let k = 0; k < 8; k++) g.rect(0, 112 + k * k * 1.2, 320, 1, '#ff5fd255', true);
  const wob = (i) => Math.sin(t * 3 + i * 0.5) * 2;
  const logo = 'LAST CALL';
  const lc = ['#ffd84a', '#ff9a2e', '#ff5fd2', '#33d6ff'];
  [...logo].forEach((ch, i) => g.text(ch, 160 - 81 + i * 18, 12 + (settings.calm ? 0 : wob(i)), { scale: 6, col: lc[i % 4], shadow: '#000' }));
  g.text('ARCADE', 160, 42, { scale: 4, col: '#fff', align: 'center', shadow: '#5a1a6a' });
  input.seats.forEach((s, i) => {
    const x = 60 + i * 100, y = 140;
    g.rect(x - 26, y, 52, 6, s.active ? SEAT_COLORS[i] : '#3a3050', true);
    if (s.state === 'empty') {
      drawPlayer(g, i, x, y, { alpha: 0.25, size: 2 });
      if (Math.floor(t * 2) % 2) g.text('PRESS A', x, y + 10, { scale: 2, col: '#fff', align: 'center' });
    } else {
      const hop = s.state === 'active' ? Math.abs(Math.sin(t * 5 + i)) * 6 : 0;
      drawPlayer(g, i, x, y - hop, { size: 2, squash: hop < 1 ? 0.5 : 0, alpha: s.state === 'active' ? 1 : 0.4 });
      g.text(seatLabel(i + 1) + (isBotSeat(s) ? ' CPU' : ''), x, y + 9, { scale: 2, col: SEAT_COLORS[i], align: 'center' });
      if (s.state === 'disconnected') g.text('CONTROLLER OFF', x, y + 18, { scale: 1, col: '#ff5a5a', align: 'center' });
    }
  });
  const n = input.activeCount;
  // the call to action never disappears; only its underline breathes
  g.rect(70, 57, 180, 12, P.ink, true);
  if (n >= MIN_PLAYERS) {
    prompt(g, 'X', 'START THE NIGHT', 160, 59, { col: P.good, align: 'center' });
    g.alpha(0.4 + 0.3 * Math.sin(t * 3)); g.rect(96, 68, 128, 1, P.good, true); g.alpha(1);
  } else if (n === 1 && MIN_PLAYERS > 1) prompt(g, 'RT', 'ADD A CPU, OR A TO JOIN', 160, 59, { col: P.text, align: 'center' });
  else prompt(g, 'A', 'JOIN', 160, 59, { col: P.text, align: 'center' });
  g.text(`Y SHAKE ${SHAKE_LEVELS[settings.shake].name}  LB SOUND ${settings.muted ? 'OFF' : 'ON'}  RB HOUSE RULES ${settings.house ? 'ON' : 'OFF'}  LT COLOR ${TRIP_LEVELS[settings.trip].name}  B CALM ${settings.calm ? 'ON' : 'OFF'}`, 160, 165, { scale: 1, col: P.dim, align: 'center' });
  g.text('KEYS: WASD MOVE  SPACE=A  F=SHOOT  G=BLOCK  IJKL=AIM  ENTER=START  C=ADD CPU', 160, 172, { scale: 1, col: '#9a90c0', align: 'center' });
  g.text(BUILD, 318, 2, { scale: 1, col: '#5a5080', align: 'right' });
  if (sound.blocked && !settings.muted) g.text('SOUND STARTS AFTER YOUR FIRST BUTTON PRESS', 160, 96, { scale: 1, col: '#ffd84a', align: 'center' });
  fx.draw(g);
}

function readyStrip(y) {
  // one column per seat: character, name, and a READY state you can see from the couch
  const ps = st.match.players;
  const colW = 320 / ps.length;
  ps.forEach((p, k) => {
    const i = p.seat - 1, x0 = k * colW, cx = x0 + colW / 2;
    const ready = st.ready.has(p.seat);
    g.rect(x0 + 3, y, colW - 6, 34, ready ? '#13261c' : P.panel, true);
    g.frame(x0 + 3, y, colW - 6, 34, ready ? P.good : SEAT_COLORS[i], 1, true);
    const hop = ready && !settings.calm ? Math.abs(Math.sin(st.t * 6 + k)) * 2 : 0;
    drawPlayer(g, i, x0 + 18, y + 26 - hop, { size: 1.3, squash: hop < 0.5 && ready ? 0.3 : 0 });
    g.text(`P${p.seat} ${SEAT_NAMES[i]}`, x0 + 32, y + 4, { scale: 2, col: SEAT_COLORS[i], shadow: null });
    if (ready) g.text('READY', x0 + 32, y + 15, { scale: 2, col: P.good, shadow: null });
    else prompt(g, 'A', 'READY?', x0 + 32, y + 15, { col: P.text });
    const cards = Object.values(p.powers).reduce((a2, n2) => a2 + n2, 0);
    const extra = (cards ? `${cards} CARD${cards > 1 ? 'S' : ''}` : '') + (p.tipsy ? `${cards ? '  ' : ''}${TIPSY_NAMES[p.tipsy]}` : '');
    if (extra) g.text(extra, x0 + 32, y + 26, { scale: 1, col: p.tipsy ? '#ffb03a' : P.dim, shadow: null });
  });
}

function drawIntro() {
  const m = GAMES[st.gameId].meta;
  const t = st.t;
  bg(t, '#120a24', m.color + '33');
  const sd = !!st.match.suddenDeath;
  const ACTS = ['', 'WARM-UP', 'THE MACHINE WAKES', 'LAST CALL'];
  const act = ONLY ? '' : ACTS[m.tier || 1];
  g.text(sd ? 'SUDDEN DEATH!' : `EVENT ${st.match.eventIdx + 1} OF ${st.match.eventCount}` + (act ? ` - ${act}` : ''), 160, 6, { scale: 2, col: sd ? '#ff5a5a' : (m.tier === 3 ? '#ff5fd2' : m.tier === 2 ? '#9fd3ff' : '#c8c0ff'), align: 'center' });
  const pop = Math.min(1, t * 4);
  g.text(m.name, 160, 16 + (1 - pop) * -20, { scale: 5, col: m.color, align: 'center', shadow: '#000' });
  if (st.twist) {
    g.text(`TWIST: ${st.twist.name}`, 160, 35, { scale: 2, col: P.warn, align: 'center' });
    g.text(st.twist.desc, 160, 43, { scale: 1, col: '#fff', align: 'center' });
  } else g.text(m.tagline.toUpperCase(), 160, 37, { scale: 2, col: '#fff', align: 'center' });
  if (m.card) {
    // short card: two rule lines, three buttons, one danger line. Everything at reading size.
    const c = m.card;
    panel(8, 50, 304, 24, m.color, P.panel);
    g.text(sd ? 'TIED PLAYERS ONLY. EVERYONE ELSE DROPS ANVILS' : c.rule, 160, 53, { scale: 2, col: P.text, align: 'center' });
    g.text(c.rule2, 160, 63, { scale: 2, col: P.warn, align: 'center' });
    const items = [['STICK', 'MOVE'], ...c.keys];
    const widths = items.map(([b2, txt]) => g.textW(txt, 2) + (b2.length === 1 ? 13 : g.textW(b2, 2) + 10) + 10);
    let x = 160 - widths.reduce((a2, w) => a2 + w, 0) / 2;
    items.forEach(([b2, txt], k) => { prompt(g, b2, txt, x, 82); x += widths[k]; });
    g.text('DANGER', 160 - (g.textW(c.danger, 2) + g.textW('DANGER ', 2)) / 2, 100, { scale: 2, col: P.danger });
    g.text(c.danger, 160 - (g.textW(c.danger, 2) + g.textW('DANGER ', 2)) / 2 + g.textW('DANGER ', 2), 100, { scale: 2, col: P.text });
    readyStrip(116);
    g.text(`TIEBREAK: ${m.tiebreak}`, 160, 173, { scale: 1, col: '#8a80b0', align: 'center' });
    fx.draw(g);
    return;
  }
  panel(8, 49, 304, 21, m.color);
  g.para(sd ? `Tied players fight it out. Everyone else is a ghost who drops anvils. ${m.objective}` : m.objective, 12, 51, 296, { scale: 2, col: '#fff' });
  panel(8, 73, 150, 64);
  g.text('CONTROLS', 12, 76, { scale: 1, col: '#c8c0ff' });
  m.controls.forEach(([b2, txt], i) => { const w = glyph(g, b2.split(' / ')[0], 12, 84 + i * 10, 1) + 2; g.text(txt, 12 + w + 2, 84 + i * 10, { scale: 1, col: '#fff' }); });
  panel(162, 73, 150, 64);
  g.text('DODGE', 166, 76, { scale: 1, col: '#ff5a5a' });
  const hz = g.para(m.hazards, 166, 83, 142, { scale: 1, col: '#ffb0b0' });
  g.text('WHEN OUT', 166, 86 + hz, { scale: 1, col: '#c8c0ff' });
  g.para(m.ghost, 166, 93 + hz, 142, { scale: 1, col: '#fff' });
  readyStrip(141);
  fx.draw(g);
}

function drawHud() {
  const game = st.game;
  g.rect(0, 0, 320, 14, '#0b0a12', true);
  g.rect(0, 14, 320, 1, '#2a2448', true);
  const ps = st.match.players;
  ps.forEach((p, k) => {
    const i = p.seat - 1;
    const bx = ps.length === 2 ? [4, 260][k] : [4, 196, 260][k];
    g.rect(bx, 2, 2, 10, SEAT_COLORS[i], true);
    g.text(`P${p.seat}`, bx + 4, 3, { scale: 2, col: SEAT_COLORS[i], shadow: null });
    const info = game.hudInfo ? game.hudInfo(p.seat) : null;
    if (info) {
      let x = bx + 18;
      for (let w = 0; w < info.pipMax; w++) { if (w < info.pips) g.circle(x + 3, 7, 2.6, SEAT_COLORS[i], true); else g.ring(x + 3, 7, 2.6, '#6a6290', true); x += 7; }
      g.text(info.text, x + 2, 3, { scale: 2, col: info.warn ? P.danger : P.text, shadow: null });
    } else {
      const val = game.hud(p.seat);
      const small = val.length > 5;
      g.text(val, bx + 19, small ? 5 : 3, { scale: small ? 1 : 2, col: val.includes('@') ? '#ff5a5a' : val.startsWith('$') ? '#ffd84a' : '#fff', shadow: null });
    }
    for (let k = 0; k < p.tipsy; k++) g.rect(bx + 4 + k * 3, 12, 2, 2, '#ffb03a', true);
  });
  if (st.twist) g.text(st.twist.name, 160, 16, { scale: 1, col: `hsl(${(performance.now() / 8) % 360},100%,70%)`, align: 'center' });
  const tl = Math.ceil(game.timeLeft);
  g.text(String(tl), 160, 2, { scale: 3, col: tl <= 5 ? (Math.floor(st.t * 4) % 2 ? '#ff5a5a' : '#fff') : '#fff', align: 'center', shadow: null });
}

/** Ring + name over each player so everyone finds themselves before play starts. */
function spotlight(a) {
  if (!st.game || !st.game.players) return;
  for (const p of st.game.players) {
    if (!p.pos || p.dead || p.out || p.perma || p.ghost === true) continue;
    const [x, y] = p.pos();
    const i = p.idx ?? p.seat - 1;
    const r = 13 + (settings.calm ? 0 : Math.sin(st.t * 6) * 1.5);
    g.alpha(a); g.ring(x, y, r, SEAT_COLORS[i]); g.ring(x, y, r + 1, SEAT_COLORS[i]);
    const label = `P${i + 1} ${SEAT_NAMES[i]}`;
    const w = g.textW(label, 2) + 6;
    const ly = Math.max(18, y - r - 14);
    g.rect(x - w / 2, ly - 1, w, 10, P.ink); g.frame(x - w / 2, ly - 1, w, 10, SEAT_COLORS[i]);
    g.text(label, x, ly + 0.5, { scale: 2, col: SEAT_COLORS[i], align: 'center', shadow: null, ui: false });
    g.alpha(1);
  }
}

function drawPlay() {
  st.game.draw(g);
  fx.draw(g);
  drawHud();
  if (st.screen === 'countdown') {
    const k = 3 - st.t * 1.25;
    const n = Math.ceil(k);
    const frac = k - Math.floor(k);
    g.alpha(0.3); g.rect(0, 15, 320, 165, '#000', true); g.alpha(1);
    spotlight(1);
    g.text(GAMES[st.gameId].meta.name, 160, 22, { scale: 3, col: GAMES[st.gameId].meta.color, align: 'center', shadow: '#000' });
    g.text(String(n), 160, 40, { scale: Math.round(5 + (settings.calm ? 0 : frac * 3)), col: '#fff', align: 'center', shadow: '#000' });
  } else if (st.screen === 'play' && st.t < 0.6) {
    spotlight(1 - st.t / 0.6);
    g.text('GO!', 160, 40, { scale: 6, col: P.good, align: 'center', shadow: '#000' });
  } else if (st.screen === 'finish') {
    const w = st.match.suddenDeath ? st.sdWinner : st.lastRanking[0];
    const i = w - 1;
    const pop = Math.min(1, st.t * 3);
    g.alpha(0.55 * pop); g.rect(0, 60, 320, 56, '#000', true); g.alpha(1);
    drawPlayer(g, i, 70, 110, { size: 3, squash: Math.sin(st.t * 10) * 0.3 });
    g.text(`P${w} WINS!`, 180, 70, { scale: 5, col: SEAT_COLORS[i], align: 'center', shadow: '#000' });
    g.text(SEAT_NAMES[i], 180, 96, { scale: 2, col: '#fff', align: 'center' });
  }
}

function drawResults() {
  const t = st.t;
  const m = GAMES[st.gameId].meta;
  bg(t, '#0f0a20', '#22123a');
  g.text(`${m.name} RESULTS`, 160, 6, { scale: 3, col: m.color, align: 'center' });
  const awards = st.awards || st.lastRanking.map((seat, i) => ({ seat, place: i + 1, pts: 0 }));
  awards.forEach((a, k) => {
    const y = 30 + k * 24, i = a.seat - 1;
    const slide = clamp((t - k * 0.25) * 4, 0, 1);
    const x = 20 - (1 - slide) * 200;
    panel(x, y, 180, 20, SEAT_COLORS[i]);
    g.text(ordinal(a.place), x + 4, y + 4, { scale: 3, col: k === 0 ? '#ffd84a' : '#fff' });
    drawPlayer(g, i, x + 52, y + 18, { size: 1.2 });
    g.text(seatLabel(a.seat), x + 62, y + 6, { scale: 2, col: SEAT_COLORS[i] });
    if (a.pts) g.text(`+${a.pts}`, x + 172, y + 4, { scale: 3, col: '#7dff8a', align: 'right' });
    if (a.tipsy !== undefined && (a.tipsy || k === 0)) g.text(TIPSY_NAMES[a.tipsy], x + 62, y + 14, { scale: 1, col: '#ffb03a' });
  });
  // standings
  panel(208, 30, 104, 70);
  g.text('MATCH POINTS', 260, 33, { scale: 1, col: '#c8c0ff', align: 'center' });
  const top = Math.max(1, ...st.match.players.map((p) => p.points));
  st.match.standings().forEach((p, k) => {
    const y = 44 + k * 18, i = p.seat - 1;
    g.text(`P${p.seat}`, 212, y + 2, { scale: 2, col: SEAT_COLORS[i] });
    const w = (p.points / top) * 60 * clamp(t * 1.5, 0, 1);
    g.rect(232, y + 2, w, 7, SEAT_COLORS[i], true);
    g.text(String(p.points), 310, y + 2, { scale: 2, col: '#fff', align: 'right' });
  });
  const left = st.match.eventCount - st.match.eventIdx - 1;
  g.text(st.match.suddenDeath ? 'SUDDEN DEATH DECIDED IT' : left ? `${left} EVENT${left > 1 ? 'S' : ''} LEFT. NEXT: ${GAMES[st.match.next].meta.name}` : 'LAST EVENT DONE!', 160, 112, { scale: 2, col: '#fff', align: 'center' });
  if (!st.match.isLast && !st.match.suddenDeath) g.text('LOSERS PICK A POWER NEXT', 160, 124, { scale: 2, col: P.warn, align: 'center' });
  if (st.awards) {
    const w = st.awards[0];
    g.text(`CURSE: P${w.seat} IS NOW ${TIPSY_NAMES[w.tipsy]}`, 160, 136, { scale: 2, col: '#ffb03a', align: 'center' });
    if (st.match.eventIdx === 0) g.text('WOBBLY STICK, SHAKY AIM. LOSERS GET 2X FROM ARENA POWER-UPS.', 160, 148, { scale: 1, col: P.dim, align: 'center' });
  }
  if (t > 1.2) { g.rect(96, 163, 128, 12, P.ink, true); prompt(g, 'A', 'CONTINUE', 160, 165, { col: P.good, align: 'center' }); }
  fx.draw(g);
}

function drawPrompt() {
  g.alpha(0.85); g.rect(0, 0, 320, 180, '#000', true); g.alpha(1);
  const pr = st.prompts[0];
  panel(30, 50, 260, 80, pr.col, '#1a1030');
  g.text(pr.title, 160, 58, { scale: 2, col: pr.col, align: 'center' });
  g.para(pr.text, 40, 76, 240, { scale: 3, col: '#fff' });
  g.text('X OR A: SKIP / DONE  (SCORES NEVER CHANGE)', 160, 120, { scale: 1, col: '#c8c0ff', align: 'center' });
}

function drawDraft() {
  const d = st.draft;
  const t = st.t;
  bg(t, '#0c0a1e', '#1a1440');
  g.text('COMEBACK DRAFT', 160, 3, { scale: 3, col: P.warn, align: 'center' });
  const winner = st.lastRanking[0];
  g.text(`P${winner} WON: NO CARD.  NEXT: ${GAMES[d.next].meta.name}`, 160, 17, { scale: 2, col: P.dim, align: 'center' });
  const n = d.pickers.length;
  const colW = n === 1 ? 204 : 152;
  d.pickers.forEach((p, k) => {
    const x0 = n === 1 ? 58 : 6 + k * 156;
    const i = p.seat - 1;
    const place = st.lastRanking.indexOf(p.seat) + 1;
    const locked = !!p.picked;
    // column header: who, what place, and their state
    drawPlayer(g, i, x0 + 8, 42, { size: 1.2, squash: locked && !settings.calm ? Math.max(0, 0.5 - (t - p.lockedAt) * 2) : 0 });
    g.text(`P${p.seat} ${ordinal(place)}`, x0 + 18, 29, { scale: 2, col: SEAT_COLORS[i], shadow: null });
    g.text(locked ? (p.auto ? 'AUTO-PICKED' : 'LOCKED') : 'CHOOSING', x0 + colW, 29, { scale: 2, col: locked ? P.good : P.dim, align: 'right', shadow: null });
    let y = 45;
    p.hand.forEach((id, c) => {
      const pw = POWER_BY_ID[id];
      const chosen = p.picked === id;
      if (locked && !chosen) return;                 // committed: the other cards fold away
      const focus = !locked && p.cur === c;
      const have = st.match.player(p.seat).powers[id] || 0;
      const rar = RARITY[pw.rarity];
      if (!focus && !chosen) {                        // browsing: a compact row
        panel(x0, y, colW, 15, '#3a3458', P.panel);
        g.rect(x0 + 3, y + 3, 9, 9, pw.col, true);
        g.text(pw.name, x0 + 16, y + 4, { scale: 2, col: P.dim, shadow: null });
        y += 18; return;
      }
      // focused or locked: the full card, everything at reading size
      const lines = cardLines(pw);
      const where = cardWhere(pw, GAMES[d.next].meta);
      const lift = focus && !settings.calm ? Math.sin(t * 4) * 0.6 : 0;
      const yy = y - 1 + lift;
      const h0 = 16;
      let h = h0;
      const lineH = lines.map((ln) => Math.max(8, g.paraH(ln.text, colW - 10, 2)));
      h += lineH.reduce((a2, v) => a2 + v + 1, 0) + 12;
      panel(x0, yy, colW, h, chosen ? P.good : pw.col, focus ? P.panelHi : '#132218');
      if (focus) { g.frame(x0 - 1, yy - 1, colW + 2, h + 2, P.warn, 1, true); g.text('>', x0 - 6, yy + 4, { scale: 2, col: P.warn }); }
      g.rect(x0 + 3, yy + 3, 11, 11, pw.col, true);
      g.text(pw.kind === 'gun' ? 'G' : pw.kind === 'block' ? 'B' : '@', x0 + 8.5, yy + 5, { scale: 2, col: P.ink, align: 'center', shadow: null });
      g.text(pw.name, x0 + 18, yy + 4, { scale: 2, col: P.text, shadow: null });
      if (!chosen) g.text(have ? `X${have + 1}` : rar.name, x0 + colW - 3, yy + 5, { scale: 1, col: have ? P.warn : rar.col, align: 'right', shadow: null });
      let ly = yy + h0;
      lines.forEach((ln, k2) => { g.para(ln.text, x0 + 5, ly, colW - 10, { scale: 2, col: ln.bad ? '#ff8a8a' : P.good }); ly += lineH[k2] + 1; });
      g.text(`NEXT: ${where}`.slice(0, Math.floor((colW - 8) / 3)), x0 + 5, ly + 1, { scale: 1, col: P.warn, shadow: null });
      if (chosen) { // the stamp lands in the corner, where the rarity was
        const k3 = Math.min(1, (t - p.lockedAt) * 5);
        g.alpha(k3); g.rect(x0 + colW - 46, yy + 2, 44, 11, P.good, true);
        g.text('LOCKED', x0 + colW - 24, yy + 4, { scale: 2, col: P.ink, align: 'center', shadow: null }); g.alpha(1);
      }
      y += h + 3;
    });
  });
  // footer: what to press, who we're waiting on, how long
  const left = Math.max(0, d.deadline - t);
  const waiting = d.pickers.filter((p) => !p.picked);
  g.rect(0, 156, 320, 24, P.ink, true);
  if (d.doneAt !== null) g.text('POWERS LOCKED IN', 160, 159, { scale: 2, col: P.good, align: 'center' });
  else if (waiting.length < d.pickers.length) g.text(`WAITING ON ${waiting.map((p) => 'P' + p.seat).join(' AND ')}: ${Math.ceil(left)}`, 160, 159, { scale: 2, col: P.warn, align: 'center' });
  else {
    const wv = g.textW('BROWSE', 2) + 17, wa = g.textW('LOCK IN', 2) + 17, wt = g.textW(`${Math.ceil(left)}s`, 2);
    let x = 160 - (wv + wa + wt + 24) / 2;
    x += prompt(g, 'STICK', 'BROWSE', x, 159) + 12;
    x += prompt(g, 'A', 'LOCK IN', x, 159) + 12;
    g.text(`${Math.ceil(left)}s`, x, 159.5, { scale: 2, col: P.dim });
  }
  g.rect(20, 172, 280 * Math.min(1, left / DRAFT_TIME), 3, left < 5 ? P.danger : P.warn, true);
  fx.draw(g);
}

function drawFinal() {
  const t = st.t;
  bg(t, '#140b2a', '#3a1a10');
  g.text('CHAMPION!', 160, 6, { scale: 4, col: '#ffd84a', align: 'center' });
  const order = st.finalOrder;
  const spots = [[160, 112, 40], [90, 128, 25], [230, 140, 15]];
  order.forEach((seat, k) => {
    const [x, y, h] = spots[k] || spots[2];
    const i = seat - 1;
    const p = st.match.player(seat);
    g.rect(x - 28, y, 56, 180 - y, k === 0 ? '#ffd84a' : k === 1 ? '#c8c8d8' : '#c98b52', true);
    g.text(String(k + 1), x, y + 4, { scale: 3, col: '#0b0a12', align: 'center', shadow: null });
    const hop = k === 0 ? Math.abs(Math.sin(t * 4)) * 8 : 0;
    drawPlayer(g, i, x, y - hop, { size: k === 0 ? 3 : 2 });
    g.text(seatLabel(seat), x, y - (k === 0 ? 48 : 34) - hop, { scale: 2, col: SEAT_COLORS[i], align: 'center' });
    g.text(`${p.points} PTS`, x, y + 18, { scale: 2, col: '#0b0a12', align: 'center', shadow: null });
    void h;
  });
  if (st.sdWinner) g.text('WON IN SUDDEN DEATH', 160, 30, { scale: 1, col: '#ff5a5a', align: 'center' });
  if (t > 2) {
    g.rect(0, 168, 320, 12, '#0b0a12', true);
    g.text('A: REMATCH (SAME SEATS, POWERS RESET)    Y: NEW PLAYERS', 160, 171, { scale: 1, col: '#7dff8a', align: 'center' });
  }
  fx.draw(g);
}

function drawPause() {
  g.alpha(0.82); g.rect(0, 0, 320, 180, '#000', true); g.alpha(1);
  const missing = seatsInMatch().filter((n) => !seatObj(n).active);
  if (missing.length) {
    g.text('CONTROLLER OFF', 160, 50, { scale: 4, col: '#ff5a5a', align: 'center' });
    missing.forEach((n, k) => g.text(`P${n}: TURN IT ON AND PRESS A`, 160, 82 + k * 12, { scale: 2, col: SEAT_COLORS[n - 1], align: 'center' }));
    g.text('YOUR SEAT AND POWERS ARE SAVED', 160, 120, { scale: 1, col: '#c8c0ff', align: 'center' });
    return;
  }
  g.text('PAUSED', 160, 40, { scale: 6, col: '#fff', align: 'center' });
  const rows = [['A', 'RESUME'], ['X', `SCREEN SHAKE: ${SHAKE_LEVELS[settings.shake].name}`], ['LB', `SOUND: ${settings.muted ? 'OFF' : 'ON'}`], ['RB', `COLOR DRIFT: ${TRIP_LEVELS[settings.trip].name}`], ['B', `CALM MODE: ${settings.calm ? 'ON' : 'OFF'}`], ['Y', 'QUIT TO TITLE']];
  rows.forEach(([b, txt], k) => prompt(g, b, txt, 92, 78 + k * 13, { col: P.text }));
}

// ---------- loop ----------
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
const trail = document.createElement('canvas'); trail.width = 640; trail.height = 360;
const trailC = trail.getContext('2d');
let lastFilter = '';
function trip(now) {
  const L = TRIP_LEVELS[settings.trip];
  fx.hueKick = (fx.hueKick || 0) * Math.pow(0.25, 1 / 60);
  const hue = L.amp ? L.amp * Math.sin(now / 1000 * (Math.PI * 2) / 26) + Math.min(L.kick, fx.hueKick) : 0;
  const f = L.amp ? `hue-rotate(${Math.round(hue)}deg) saturate(${L.sat})` : '';
  if (f !== lastFilter) { canvas.style.filter = f; lastFilter = f; }
  if (settings.trip === 1) {
    const c = g.c;
    c.save(); c.globalAlpha = 0.3; c.globalCompositeOperation = 'screen'; c.drawImage(trail, 0, 0); c.restore();
    trailC.clearRect(0, 0, 640, 360); trailC.drawImage(canvas, 0, 0);
  }
}
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  draw();
  trip(now);
  requestAnimationFrame(frame);
}
sound.music('title');
requestAnimationFrame(frame);

// For automated browser checks only.
window.__lca = {
  st, input, fx, sound, settings, GAMES, drift, applyLook, bots,
  step(n = 1) { for (let i = 0; i < n; i++) update(STEP); draw(); },
};
