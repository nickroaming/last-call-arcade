// LAST CALL ARCADE: game night flow.
// title/join → intro → countdown → play → finish → results → draft → … → podium → rematch
import { InputAdapter, BTN } from '../input/gamepad-adapter.js';
import { installXboxWatch, keyEventPad, watchPads, xboxProblem, xboxDiag, IS_XBOX } from '../input/xbox-mode.js';
import { Gfx } from '../engine/gfx.js';
import { Fx, SHAKE_LEVELS } from '../engine/fx.js';
import { Sound } from '../engine/audio.js';
import { drawPlayer, SEAT_COLORS, SEAT_NAMES } from '../engine/sprites.js';
import { rand, clamp, choice } from '../engine/util.js';
import { readControls, installKeyboard, keyboardPads, NO_CONTROLS } from './controls.js';
import { Match } from './match.js';
import { POWERS, POWER_BY_ID, RARITY, MAX_STACK, cardWhere, cardLines, TIPSY_NAMES, TIPSY_LINES, pickupMult } from './powers.js';
import { combosFor, combosUnlockedBy, COMBO_BY_ID } from './combos.js';
import { LAYOUTS as ROOF_MAPS } from '../games/rumble.js';
import { TWISTS } from './twists.js';
import { GAMES } from './registry.js';
import { Bot } from './bots.js';
import { Drift, P, glyph, prompt, setPadStyle } from '../engine/style.js';
import { Guns } from './weapons.js';
import { ACTS, clockAt, cabinetQuip, drawStage, drawCrt, drawBezel, drawVoice, drawCabinet, drawNightStrip } from './night.js';

export const BUILD = 'm1-2026-11-23.15-combos';
export { GAMES };
// The core set: the events that pass the quality bar (docs/PLAYTEST.md, tests/measure.html).
// Four per act, so every night builds from grounded to mind-bending. ALL EVENTS adds the rest.
export const CORE = ['rumble', 'coins', 'tick', 'spotlight', 'orbit', 'lightsout', 'mirror', 'slide', 'mobius', 'wormhole', 'rules', 'swap'];
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
installXboxWatch();
const SHOW_PADS = params.has('pads');
const rawPads = () => (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []);
const bots = [];
let wantBot = 0;
let kbStart = false;
addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !e.repeat) wantBot += 1; if (e.code === 'Enter' && !e.repeat) kbStart = true; });
const input = new InputAdapter({
  seatCount: 3,
  getGamepads: () => [...rawPads(), ...keyEventPad(), ...keyboardPads(), ...bots.map((b) => b.pad())],
});
const canvas = document.getElementById('game');
const g = new Gfx(canvas);
const fx = new Fx();
const drift = new Drift();
const sound = new Sound();

function load(key, def) { try { const v = localStorage.getItem('lca.' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
function save(key, v) { try { localStorage.setItem('lca.' + key, JSON.stringify(v)); } catch (e) { /* ignore */ } }
const FIT_LEVELS = [{ name: '100%', k: 1 }, { name: '95%', k: 0.95 }, { name: '90%', k: 0.9 }];
const MUSIC_LEVELS = [{ name: '100%', v: 1 }, { name: '50%', v: 0.5 }, { name: 'OFF', v: 0 }];
// Button names on screen: Xbox (A B X Y, LB RB, LT RT) or Switch (L R, ZL ZR).
// AUTO follows whoever is playing: the family most seats hold, Xbox on a tie;
// before anyone joins, the controllers that are switched on.
const PAD_STYLES = [{ name: 'AUTO' }, { name: 'XBOX', style: 'xbox' }, { name: 'SWITCH', style: 'nintendo' }];
function pickPadStyle() {
  const fixed = (PAD_STYLES[settings.pads] || PAD_STYLES[0]).style;
  if (fixed) { setPadStyle(fixed); return; }
  const human = (id) => !/^Keyboard|^CPU/.test(id || '');
  const seated = input.seats.filter((s) => s.active && human(s.padId)).map((s) => s.kind);
  const kinds = seated.length ? seated : input.pads.filter((p) => human(p.id)).map((p) => p.kind);
  const nin = kinds.filter((k) => k === 'nintendo' || k === 'joycon').length;
  setPadStyle(nin > kinds.length - nin ? 'nintendo' : 'xbox');
}
const settings = {
  shake: load('shake', 0), muted: load('muted', false), house: load('house', false), trip: load('look', 0), calm: load('calm', false),
  set: load('set', 'core'), large: load('large', false), fit: load('fit', 0), music: load('music', 0), pads: load('pads', 0), fancy: load('fancy', true),
  prompts: params.get('rules') ? params.get('rules').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 12) : DEFAULT_PROMPTS,
};
sound.setMuted(settings.muted);
function applyLook() {
  if (!TRIP_LEVELS[settings.trip]) settings.trip = 0;
  drift.setMode(settings.calm ? 'off' : TRIP_LEVELS[settings.trip].drift);
  fx.calm = settings.calm;
  fx.shakeK = settings.calm ? 0 : SHAKE_LEVELS[settings.shake].k;
  g.large = fx.large = !!settings.large;
  g.fancy = settings.fancy !== false;
  if (!MUSIC_LEVELS[settings.music]) settings.music = 0;
  sound.setMusicVol(MUSIC_LEVELS[settings.music].v);
  if (!FIT_LEVELS[settings.fit]) settings.fit = 0;
  if (!PAD_STYLES[settings.pads]) settings.pads = 0;
  fit();
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
  // SCREEN FIT shrinks the picture for TVs that crop the edges (overscan)
  const k = Math.min(innerWidth / 640, innerHeight / 360) * (FIT_LEVELS[settings.fit] || FIT_LEVELS[0]).k;
  const kk = k >= 1 ? Math.floor(k * 2) / 2 : k; // prefer clean scales
  canvas.style.width = `${640 * kk}px`;
  canvas.style.height = `${360 * kk}px`;
  // draw at the screen's real resolution (up to 1920×1080) so shapes stay sharp
  const want = Math.ceil((640 * kk * (devicePixelRatio || 1)) / 640 - 0.15);
  g.setRes(settings.fancy === false ? Math.min(2, want) : want);
}
addEventListener('resize', fit);

// ---------- state ----------
const st = {
  screen: 'title', t: 0, match: null, game: null, gameId: null, variants: {}, ready: new Set(),
  draft: null, awards: null, prompt: null, paused: false, sdWinner: null, finalOrder: null, viewHold: {}, events: [], opts: null, wipe: 0,
  mode: load('mode', 'party'), setup: null, rack: null, toasts: [], sd: { map: 0, to: 5 }, sb: { game: 'rumble', map: 0, twist: 0 },
};
const WIPE = 0.42;
const RECAP_STEP = 0.32;
function go(screen) {
  // a short shutter between screens; in-play changes (countdown → play → finish) don't wipe
  if (!['play', 'finish'].includes(screen) && screen !== st.screen) st.wipe = WIPE;
  st.screen = screen; st.t = 0;
}
const seatsInMatch = () => (st.match ? st.match.players.map((p) => p.seat) : []);
const seatObj = (n) => input.seats[n - 1];
const anyPressed = (b, seats = null) => input.seats.some((s) => (!seats || seats.includes(s.n)) && s.pressed(b));

const tierOf = (id) => GAMES[id].meta.tier || 1;
const curAct = () => (st.match && st.gameId ? tierOf(st.gameId) : 0);
const nightClock = (i) => clockAt(st.match.playlist, i, tierOf);
function startMatch() {
  const seats = input.seats.filter((s) => s.active).map((s) => s.n);
  input.joinOpen = false;
  const list = ONLY && GAMES[ONLY] ? [ONLY] : settings.set === 'all' ? GAME_IDS : CORE;
  st.match = new Match(seats, list, { perGame: ONLY ? 4 : 2, total: ONLY ? 4 : EVENTS, tierOf: ONLY ? null : tierOf, roleOf: (id) => (GAMES[id].meta.opener ? 'opener' : GAMES[id].meta.finale ? 'finale' : null) });
  st.variants = {}; st.sdWinner = null;
  toIntro();
}
function toIntro() {
  st.gameId = st.match.current;
  st.ready = new Set();
  const m = GAMES[st.gameId].meta;
  st.twistId = null;
  if (st.mode === 'sandbox') { const tl = GAMES[st.gameId].meta.twists || []; st.twistId = st.sb.twist > 0 ? tl[st.sb.twist - 1] || null : null; }
  else if (st.mode === 'showdown') st.twistId = null;
  else if (FORCE_TWIST && TWISTS[FORCE_TWIST]) st.twistId = FORCE_TWIST;
  else if (!st.match.suddenDeath && st.match.eventIdx >= 1 && m.twists && m.twists.length && Math.random() < TWIST_CHANCE) st.twistId = choice(m.twists);
  st.twist = st.twistId ? { id: st.twistId, ...TWISTS[st.twistId] } : null;
  // a new act opens with the Cabinet speaking (not in practice or sudden death)
  const i = st.match.eventIdx;
  const prevAct = i > 0 ? tierOf(st.match.playlist[i - 1]) : 0;
  if (st.mode === 'sandbox' || (st.mode === 'showdown' && i > 0)) { startGame(); return; } // straight back into the fight
  if (!ONLY && st.mode === 'party' && !st.match.suddenDeath && tierOf(st.gameId) !== prevAct) {
    const k = tierOf(st.gameId);
    const rules = st.match.playlist.filter((id) => tierOf(id) === k).map((id) => GAMES[id].meta.broken).filter(Boolean);
    st.act = { k, clock: nightClock(i), rules: [...new Set(rules)] };
    go('act');
    sound.music(null); sound.sfx('act');
    return;
  }
  go('intro');
  sound.music('results');
}
function startGame() {
  const id = st.gameId;
  let v = st.match.suddenDeath ? Math.floor(rand(0, 4)) : (st.variants[id] = (st.variants[id] ?? -1) + 1);
  if (st.mode === 'showdown') v = st.sd.map > 0 ? st.sd.map - 1 + (Math.random() < 0.5 ? ROOF_MAPS.length : 0) : Math.floor(rand(0, ROOF_MAPS.length * 2));
  if (st.mode === 'sandbox') v = st.sb.map;
  fx.reset();
  Guns.current = null;
  const n = st.match.players.length;
  st.game = GAMES[id].create({
    fx, sound, drift, variant: v, twist: st.twist, rounds: st.mode === 'party' ? undefined : 1, practice: st.mode === 'sandbox',
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
    st.quip = st.match.isLast ? null : cabinetQuip(st.match, st.awards);
  }
  go('finish');
  sound.sfx('win');
}
function afterResults() {
  if (st.match.suddenDeath) return toFinal();
  if (st.mode === 'showdown' && st.match.players.some((p) => p.wins >= st.sd.to)) return toFinal();
  const order = st.match.draftOrder(st.lastRanking);
  if (order.length) {
    st.draft = {
      next: st.match.next,
      // last place gets a fourth card: a real comeback, not a promise (B-08)
      pickers: order.map((seat, k) => ({ seat, last: k === 0 && order.length > 1, hand: st.match.offer(seat, k === 0 && order.length > 1 ? 4 : 3), cur: 0, picked: null, lockedAt: null })),
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
    const pl = st.match.player(p.seat);
    const before = new Set(combosFor(pl.powers).map((c) => c.id));
    st.match.pick(p.seat, id);
    if (id === 'mashup' && pl.gained) toast(`P${p.seat} MASH-UP: ${pl.gained.map((g2) => POWER_BY_ID[g2].name).join(' + ')}`, SEAT_COLORS[p.seat - 1]);
    for (const c of combosFor(pl.powers)) if (!before.has(c.id)) comboToast(p.seat, c);
  }
  st.draft = null;
  st.match.advance();
  toIntro();
}
function toFinal() {
  st.finalOrder = st.match.finalOrder(st.sdWinner);
  if (st.mode === 'showdown') st.finalOrder = st.match.players.slice().sort((a, b) => b.wins - a.wins || b.points - a.points).map((p) => p.seat);
  if (!ONLY && st.mode === 'party' && !st.recapDone) { go('recap'); sound.music(null); return; } // the night, laid out, before the podium
  st.recapDone = false;
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

// ---------- modes: PARTY NIGHT, SHOWDOWN, SANDBOX ----------
export const MODES = [
  { id: 'party', name: 'PARTY NIGHT', desc: 'A NIGHT OF EVENTS. CARDS BETWEEN EVENTS' },
  { id: 'showdown', name: 'SHOWDOWN', desc: 'ROOFTOP DUELS. LOSERS PICK A CARD EVERY ROUND' },
  { id: 'sandbox', name: 'SANDBOX', desc: 'PICK A MAP, STACK ANY CARDS, GO WILD' },
];
const modeIdx = () => Math.max(0, MODES.findIndex((m) => m.id === st.mode));
const SB_GAMES = () => [...CORE, ...GAME_IDS.filter((id) => !CORE.includes(id))];
function mapName(id, v) {
  if (id === 'rumble') return `${ROOF_MAPS[v % ROOF_MAPS.length].name}${Math.floor(v / ROOF_MAPS.length) % 2 ? ' (FLIPPED)' : ''}`;
  return `VERSION ${v + 1}`;
}
function setupRows() {
  if (st.setup.mode === 'showdown') {
    return [
      { label: 'MAP', vals: () => ['RANDOM EVERY ROUND', ...ROOF_MAPS.map((m) => m.name)], get: () => st.sd.map, set: (i) => { st.sd.map = i; } },
      { label: 'FIRST TO', vals: () => ['3 ROUNDS', '5 ROUNDS', '7 ROUNDS'], get: () => [3, 5, 7].indexOf(st.sd.to), set: (i) => { st.sd.to = [3, 5, 7][i]; } },
      { label: 'START', action: true },
    ];
  }
  const ids = SB_GAMES();
  const tw = () => GAMES[st.sb.game].meta.twists || [];
  return [
    { label: 'EVENT', vals: () => ids.map((id) => GAMES[id].meta.name), get: () => Math.max(0, ids.indexOf(st.sb.game)), set: (i) => { st.sb.game = ids[i]; st.sb.map = 0; st.sb.twist = 0; } },
    { label: 'MAP', vals: () => Array.from({ length: st.sb.game === 'rumble' ? ROOF_MAPS.length * 2 : 6 }, (_, v) => mapName(st.sb.game, v)), get: () => st.sb.map, set: (i) => { st.sb.map = i; } },
    { label: 'TWIST', vals: () => ['NONE', ...tw().map((k) => (TWISTS[k] ? TWISTS[k].name : k))], get: () => st.sb.twist, set: (i) => { st.sb.twist = i; } },
    { label: 'START', action: true },
  ];
}
function openSetup(mode) { st.setup = { mode, cur: 0 }; go('setup'); sound.sfx('go'); }
function updateSetup() {
  const rows = setupRows();
  const humans = input.seats.filter((s) => s.active && !isBotSeat(s));
  const go2 = kbStart; kbStart = false;
  for (const seat of humans) {
    const c = readControls(seat);
    if (st.t < 0.25) break;
    if (c.upP || c.downP) { st.setup.cur = (st.setup.cur + (c.upP ? -1 : 1) + rows.length) % rows.length; sound.sfx('move'); }
    const row = rows[st.setup.cur];
    if (seat.pressed(BTN.B)) { sound.sfx('move'); go('title'); st.setup = null; return; }
    if (row.action) { if (seat.pressed(BTN.A) || seat.pressed(BTN.X) || seat.pressed(BTN.MENU)) { beginMode(); return; } continue; }
    const n = row.vals().length;
    const d = c.leftP ? -1 : c.rightP || seat.pressed(BTN.A) ? 1 : 0;
    if (d) { row.set((row.get() + d + n) % n); sound.sfx('lock'); }
    if (seat.pressed(BTN.X) || seat.pressed(BTN.MENU)) { beginMode(); return; }
  }
  if (go2) beginMode();
}
function beginMode() {
  const mode = st.setup.mode;
  st.setup = null;
  save('mode', st.mode);
  const seats = input.seats.filter((s) => s.active).map((s) => s.n);
  input.joinOpen = false;
  if (mode === 'showdown') st.match = new Match(seats, ['rumble'], { perGame: 99, total: 60 });
  else st.match = new Match(seats, [st.sb.game], { perGame: 999, total: 999 });
  st.match.noTipsy = true; // no Winner's Curse outside a party night
  st.variants = {}; st.sdWinner = null;
  sound.sfx('go');
  toIntro();
}
/** SANDBOX card rack: any player opens it mid-fight and stacks whatever they like. */
const RACK_ROWS = 7;
function openRack(seat) { st.rack = { seat, cur: st.rack ? st.rack.cur : 0, t: 0, changed: false }; sound.sfx('pick'); }
function updateRack(dt) {
  const r = st.rack;
  r.t += dt;
  const seat = seatObj(r.seat);
  const c = readControls(seat);
  const n = POWERS.length;
  if (r.t < 0.15) return;
  if (c.upP) { r.cur = (r.cur + n - 1) % n; sound.sfx('move'); }
  if (c.downP) { r.cur = (r.cur + 1) % n; sound.sfx('move'); }
  if (c.leftP) { r.cur = (r.cur + n - RACK_ROWS) % n; sound.sfx('move'); }
  if (c.rightP) { r.cur = Math.min(n - 1, r.cur + RACK_ROWS); sound.sfx('move'); }
  const pl = st.match.player(r.seat);
  const id = POWERS[r.cur].id;
  if (seat.pressed(BTN.A)) {
    const before = new Set(combosFor(pl.powers).map((c2) => c2.id));
    if (id === 'mashup') { st.match.pick(r.seat, id); toast(`MASH-UP: ${pl.gained.map((g2) => POWER_BY_ID[g2].name).join(' + ')}`, SEAT_COLORS[r.seat - 1]); r.changed = true; }
    else if ((pl.powers[id] || 0) < MAX_STACK) { pl.powers[id] = (pl.powers[id] || 0) + 1; r.changed = true; sound.sfx('lock'); } else sound.sfx('bump');
    for (const c2 of combosFor(pl.powers)) if (!before.has(c2.id)) comboToast(r.seat, c2);
  }
  if (seat.pressed(BTN.X) && pl.powers[id]) { pl.powers[id] -= 1; if (!pl.powers[id]) delete pl.powers[id]; r.changed = true; sound.sfx('move'); }
  if (seat.pressed(BTN.LB)) { pl.powers = {}; r.changed = true; sound.sfx('lose'); }
  if (seat.pressed(BTN.B) || seat.pressed(BTN.Y) || seat.pressed(BTN.VIEW)) {
    const changed = r.changed;
    st.rack = null; sound.sfx('move');
    if (changed) startGame(); // new cards: fresh round with them
  }
}
function drawRack() {
  const r = st.rack;
  const pl = st.match.player(r.seat);
  const col = SEAT_COLORS[r.seat - 1];
  g.alpha(0.9); g.rect(0, 0, 320, 180, '#07060c', true); g.alpha(1);
  g.text(`P${r.seat} CARD RACK`, 160, 3, { scale: 3, col, align: 'center' });
  // the list: 8 rows per column, the focused column in the middle
  const per = RACK_ROWS, colIdx = Math.floor(r.cur / per), cols = Math.ceil(POWERS.length / per);
  const first = Math.max(0, Math.min(cols - 3, colIdx - 1));
  for (let ci = first; ci < Math.min(cols, first + 3); ci++) {
    const cc = ci === colIdx ? 0 : 1;
    const x0 = 6 + (ci - first) * 104;
    for (let k = 0; k < per; k++) {
      const i = ci * per + k;
      if (i >= POWERS.length) break;
      const pw = POWERS[i];
      const y = 19 + k * 11;
      const have = pl.powers[pw.id] || 0;
      const focus = i === r.cur;
      g.alpha(cc === 0 ? 1 : 0.45);
      panel(x0, y, 100, 10, focus ? P.warn : '#3a3458', focus ? P.panelHi : P.panel);
      g.rect(x0 + 2, y + 2, 6, 6, pw.col, true);
      g.text(pw.name, x0 + 11, y + 1.5, { scale: 2, col: focus ? P.text : P.dim, shadow: null });
      if (have) g.text(`X${have}`, x0 + 98, y + 1.5, { scale: 2, col: P.warn, align: 'right', shadow: null });
      g.alpha(1);
    }
  }
  // the focused card
  const pw = POWERS[r.cur];
  panel(4, 98, 216, 58, pw.col, P.panelHi);
  g.text(pw.name, 8, 101, { scale: 2, col: P.text, shadow: null });
  g.text(RARITY[pw.rarity].name, 216, 102, { scale: 1, col: RARITY[pw.rarity].col, align: 'right', shadow: null });
  let ly = 111;
  for (const ln of cardLines(pw)) ly += g.para(ln.text, 8, ly, 208, { scale: 2, col: ln.bad ? '#ff8a8a' : P.good, shadow: null }) + 1;
  const unlock = combosUnlockedBy(pl.powers, pw.id);
  if (unlock.length && ly < 148) g.text(`ADD IT: COMBO ${unlock[0].name}!`, 8, ly + 1, { scale: 1, col: P.warn, shadow: null });
  // combos you have
  const cs = combosFor(pl.powers);
  panel(224, 98, 92, 58, cs.length ? P.warn : '#3a3458', P.panel);
  g.text(cs.length ? `COMBOS ${cs.length}` : 'NO COMBOS', 228, 101, { scale: 2, col: cs.length ? P.warn : P.dim, shadow: null });
  cs.slice(0, 9).forEach((c2, k) => g.text(c2.name, 228, 111 + k * 5, { scale: 1, col: P.text, shadow: null }));
  g.rect(0, 158, 320, 22, P.ink, true);
  let x = 6;
  x += prompt(g, 'A', 'ADD', x, 162) + 8;
  x += prompt(g, 'X', 'REMOVE', x, 162) + 8;
  x += prompt(g, 'LB', 'CLEAR', x, 162) + 8;
  x += prompt(g, 'STICK', 'BROWSE', x, 162) + 8;
  prompt(g, 'B', 'FIGHT', x, 162);
  drawToasts();
}
function drawSetup() {
  const t = st.t;
  drawStage(g, 2, t, drift, { calm: settings.calm });
  const m = MODES.find((mm) => mm.id === st.setup.mode);
  g.text(m.name, 160, 8, { scale: 4, col: P.warn, align: 'center' });
  g.text(m.desc, 160, 30, { scale: 2, col: P.dim, align: 'center' });
  const rows = setupRows();
  rows.forEach((row, k) => {
    const y = 54 + k * 18;
    const focus = st.setup.cur === k;
    panel(30, y - 3, 260, 14, focus ? P.warn : '#3a3458', focus ? P.panelHi : P.panel);
    if (focus) g.text('>', 23, y, { scale: 2, col: P.warn });
    if (row.action) { g.text(row.label, 160, y, { scale: 2, col: focus ? P.good : P.text, align: 'center', shadow: null }); return; }
    g.text(row.label, 36, y, { scale: 2, col: focus ? P.text : P.dim, shadow: null });
    const v = row.vals()[row.get()] || '';
    g.text(focus ? `< ${v} >` : v, 284, y, { scale: 2, col: focus ? P.warn : P.text, align: 'right', shadow: null });
  });
  if (st.setup.mode === 'sandbox') g.text('IN THE FIGHT: PRESS VIEW OR Y TO OPEN YOUR CARD RACK', 160, 128, { scale: 1, col: P.good, align: 'center' });
  else g.text('EVERY ROUND: THE LOSERS EACH TAKE A CARD. CARDS STACK. COMBOS UNLOCK.', 160, 128, { scale: 1, col: P.good, align: 'center' });
  g.rect(0, 158, 320, 22, P.ink, true);
  let x = 40;
  x += prompt(g, 'STICK', 'CHOOSE', x, 162) + 10;
  x += prompt(g, 'X', 'START', x, 162) + 10;
  prompt(g, 'B', 'BACK', x, 162);
  fx.draw(g);
}
// ---------- toasts: combo unlocked, mash-up results ----------
function toast(text, col = P.warn, sub = null) { st.toasts.push({ text, col, sub, t: 0 }); if (st.toasts.length > 4) st.toasts.shift(); }
function comboToast(seat, c) { toast(`P${seat} COMBO: ${c.name}`, SEAT_COLORS[seat - 1], c.text); sound.sfx('jackpot'); }
function updateToasts(dt) { for (const q of st.toasts) q.t += dt; st.toasts = st.toasts.filter((q) => q.t < 4.2); }
function drawToasts() {
  st.toasts.forEach((q, k) => {
    const a = Math.min(1, q.t * 5, (4.2 - q.t) * 2);
    const slide = Math.max(0, 1 - q.t * 6) * 30;
    const y = 154 - (st.toasts.length - 1 - k) * 24;
    g.alpha(a * 0.92);
    g.rrect(40 - slide, y, 240, q.sub ? 21 : 12, 3, P.ink, true);
    g.alpha(a);
    g.rect(40 - slide, y, 3, q.sub ? 21 : 12, q.col, true);
    g.glow(160, y + 6, 60, q.col.length === 7 ? q.col : '#ffd84a', 0.15 * a, true);
    g.text(q.text, 160 - slide, y + 2.5, { scale: 2, col: q.col, align: 'center' });
    if (q.sub) g.text(q.sub, 160 - slide, y + 12.5, { scale: 1, col: P.text, align: 'center', shadow: null });
    g.alpha(1);
  });
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
  st.wipe = Math.max(0, st.wipe - dt);
  runBots(dt);
  watchPads(rawPads());
  const events = input.update(performance.now());
  pickPadStyle();
  if (events.some((e) => e.type === 'press' || e.type === 'join')) sound.ensure();
  for (const e of events) {
    if (e.type === 'join') { sound.sfx('join'); fx.burst(60 + (e.seat - 1) * 100, 120, 20, SEAT_COLORS[e.seat - 1], { speed: 90, life: 0.6 }); }
    if (e.type === 'rejoin') { sound.sfx('join'); fx.popup(`P${e.seat} IS BACK`, 160, 90, SEAT_COLORS[e.seat - 1], 2); }
  }
  st.t += dt;
  const inMatch = seatsInMatch();
  const missing = inMatch.filter((n) => !seatObj(n).active);

  updateToasts(dt);
  if (st.screen !== 'title' && st.screen !== 'setup') kbStart = false; // Enter that paused a game must not start one later
  if (st.opts) { fx.update(dt); return updateOptions(dt); }
  if (st.screen === 'title') return updateTitle(dt);
  if (st.screen === 'setup') { fx.update(dt); return updateSetup(); }
  if (st.rack) return updateRack(dt);
  if (st.mode === 'sandbox' && ['play', 'countdown'].includes(st.screen) && !st.paused) {
    const opener = inMatch.find((n) => !isBotSeat(seatObj(n)) && (seatObj(n).pressed(BTN.VIEW) || seatObj(n).pressed(BTN.Y)));
    if (opener) { openRack(opener); return; }
  }

  // pause (Menu) and controller drop
  if (!st.paused && (anyPressed(BTN.MENU, inMatch) || (xboxProblem() && ['countdown', 'play'].includes(st.screen)) || (missing.length && ['countdown', 'play'].includes(st.screen)))) {
    st.paused = true; sound.sfx('beep');
    return;
  }
  if (st.paused) {
    if (missing.length) return;
    if (anyPressed(BTN.A, inMatch)) { st.paused = false; sound.sfx('beep'); }
    else if (anyPressed(BTN.Y, inMatch)) toTitle(false);
    else if (anyPressed(BTN.X, inMatch)) openOptions('pause');
    else if (anyPressed(BTN.B, inMatch)) toggleCalm();
    return;
  }

  const controls = new Map(inMatch.map((n) => [n, readControls(seatObj(n))]));
  fx.update(dt);

  switch (st.screen) {
    case 'act': {
      voiceTick(dt, 0.5, ACTS[st.act.k].line, 32);
      if ((st.t > 1.4 && anyPressed(BTN.A, inMatch)) || st.t > 6) { go('intro'); sound.music('results'); }
      break;
    }
    case 'recap': {
      const rows = st.match.playlist.length;
      voiceTick(dt, 0.6 + rows * RECAP_STEP, 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 40);
      const k = Math.floor((st.t - 0.6) / RECAP_STEP);
      if (k >= 0 && k < rows && k !== st.recapRow) { st.recapRow = k; sound.sfx('tick'); }
      if (st.t > 0.6 + rows * RECAP_STEP + 0.8 && (anyPressed(BTN.A, inMatch) || st.t > 14)) { st.recapDone = true; st.recapRow = -1; toFinal(); }
      break;
    }
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
      if (st.mode === 'sandbox' && st.t > 1.6) startGame(); // sandbox never ends: straight into the next round
      else if (st.mode === 'showdown' && st.t > 1.8) afterResults();
      else if (st.t > 2.2) go('results');
      break;
    }
    case 'results': {
      if (st.quip && st.match.eventIdx > 0) voiceTick(dt, 0.8, st.quip, 32);
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
  // the music leans in for the last seconds and at match point
  const g2 = st.game;
  sound.intensity = st.screen === 'play' && g2 && !g2.finished && (g2.timeLeft < 10 || (g2.matchPoint && g2.matchPoint())) ? 1 : 0;
}

/** A soft blip every other character while the Cabinet types. */
function voiceTick(dt, start, text, speed) {
  const n0 = Math.floor((st.t - dt - start) * speed), n1 = Math.floor((st.t - start) * speed);
  if (n1 > n0 && n1 > 0 && n1 <= text.length && n1 % 2 === 0) sound.sfx('type');
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
function toggleCalm() { settings.calm = !settings.calm; save('calm', settings.calm); applyLook(); sound.sfx('move'); }

function updateTitle(dt) {
  fx.update(dt);
  sound.music('title');
  for (const s of input.seats) {
    if (s.held(BTN.VIEW)) {
      st.viewHold[s.n] = (st.viewHold[s.n] || 0) + dt;
      if (st.viewHold[s.n] > 1.5) { input.leave(s); delete st.viewHold[s.n]; sound.sfx('lose'); }
    } else delete st.viewHold[s.n];
  }
  if (anyPressed(BTN.Y)) { openOptions('title'); return; }
  if (anyPressed(BTN.B)) toggleCalm();
  if (anyPressed(BTN.RT)) wantBot += 1;
  const go2 = kbStart; kbStart = false;
  for (const s of input.seats) {
    if (!s.active || isBotSeat(s)) continue;
    const c = readControls(s);
    if (c.leftP || c.rightP) { st.mode = MODES[(modeIdx() + (c.leftP ? -1 : 1) + MODES.length) % MODES.length].id; save('mode', st.mode); sound.sfx('move'); }
  }
  const minP = st.mode === 'sandbox' ? 1 : MIN_PLAYERS;
  if (input.activeCount >= minP && (anyPressed(BTN.X) || anyPressed(BTN.MENU) || go2)) {
    if (st.mode === 'party') { sound.sfx('go'); startMatch(); } else openSetup(st.mode);
  }
}

// ---------- options ----------
// One focusable list instead of five shortcut buttons: every setting is
// visible, explained at reading size, and reachable with the stick or D-pad.
const OPTS = [
  { label: 'EVENTS', vals: () => [`CORE ${CORE.length}`, `ALL ${GAME_IDS.length}`], get: () => (settings.set === 'all' ? 1 : 0), set: (i) => { settings.set = i ? 'all' : 'core'; save('set', settings.set); }, help: `CORE: THE ${CORE.length} MOST POLISHED EVENTS`, titleOnly: true },
  { label: 'TEXT SIZE', vals: () => ['NORMAL', 'LARGE'], get: () => (settings.large ? 1 : 0), set: (i) => { settings.large = !!i; save('large', settings.large); applyLook(); }, help: 'LARGE: BIGGER NAME TAGS AND POP-UPS' },
  { label: 'SCREEN FIT', vals: () => FIT_LEVELS.map((f) => f.name), get: () => settings.fit, set: (i) => { settings.fit = i; save('fit', i); applyLook(); }, help: 'SHRINK IT IF YOUR TV CUTS OFF THE EDGES' },
  { label: 'COLOR LOOK', vals: () => TRIP_LEVELS.map((l) => l.name), get: () => settings.trip, set: (i) => { settings.trip = i; save('look', i); applyLook(); fx.hueKick = TRIP_LEVELS[i].kick; }, help: 'HOW MUCH THE BACKGROUND COLOR DRIFTS' },
  { label: 'GRAPHICS', vals: () => ['FANCY', 'SIMPLE'], get: () => (settings.fancy === false ? 1 : 0), set: (i) => { settings.fancy = !i; save('fancy', settings.fancy); applyLook(); }, help: 'SIMPLE: NO GLOW. TRY IT IF THE GAME STUTTERS' },
  { label: 'CALM MODE', vals: () => ['OFF', 'ON'], get: () => (settings.calm ? 1 : 0), set: (i) => { settings.calm = !!i; save('calm', settings.calm); applyLook(); }, help: 'NO FLASHES, SHAKE OR DRIFT. SAME GAME' },
  { label: 'SCREEN SHAKE', vals: () => SHAKE_LEVELS.map((l) => l.name), get: () => settings.shake, set: (i) => { settings.shake = i; save('shake', i); applyLook(); fx.shake(0.5); }, help: 'HOW HARD HITS SHAKE THE SCREEN' },
  { label: 'SOUND', vals: () => ['ON', 'OFF'], get: () => (settings.muted ? 1 : 0), set: (i) => { settings.muted = !!i; sound.setMuted(settings.muted); save('muted', settings.muted); }, help: 'ALL SOUND ON OR OFF' },
  { label: 'MUSIC', vals: () => MUSIC_LEVELS.map((m) => m.name), get: () => settings.music, set: (i) => { settings.music = i; save('music', i); applyLook(); }, help: 'MUSIC VOLUME. SOUND EFFECTS STAY' },
  { label: 'HOUSE RULES', vals: () => ['OFF', 'ON'], get: () => (settings.house ? 1 : 0), set: (i) => { settings.house = !!i; save('house', settings.house); }, help: 'PROMPTS BETWEEN EVENTS. SCORES NEVER CHANGE', titleOnly: true },
  { label: 'BUTTONS', vals: () => PAD_STYLES.map((p) => p.name), get: () => settings.pads, set: (i) => { settings.pads = i; save('pads', i); pickPadStyle(); }, help: 'AUTO: BUTTON NAMES MATCH YOUR CONTROLLERS' },
  { label: 'DONE', action: true, help: 'BACK TO THE GAME' },
];
function openOptions(from) { st.opts = { cur: 0, from, t: 0 }; sound.sfx('move'); }
function closeOptions() { st.opts = null; sound.sfx('move'); }
const optLocked = (o) => o.titleOnly && st.opts && st.opts.from === 'pause';
function updateOptions(dt) {
  const o = st.opts;
  o.t += dt;
  if (o.t < 0.2) return; // a press that opened the menu can't also change something
  const seats = o.from === 'pause' ? seatsInMatch() : input.seats.filter((s) => s.active).map((s) => s.n);
  for (const n of seats) {
    const seat = seatObj(n);
    const c = readControls(seat);
    if (c.upP || c.downP) {
      const step = c.upP ? -1 : 1;
      do { o.cur = (o.cur + step + OPTS.length) % OPTS.length; } while (optLocked(OPTS[o.cur]));
      sound.sfx('move');
    }
    const row = OPTS[o.cur];
    if (seat.pressed(BTN.B) || seat.pressed(BTN.MENU) || seat.pressed(BTN.Y)) { closeOptions(); return; }
    if (row.action) { if (seat.pressed(BTN.A)) { closeOptions(); return; } continue; }
    const n2 = row.vals().length;
    const d = c.leftP ? -1 : c.rightP || seat.pressed(BTN.A) ? 1 : 0;
    if (d && !optLocked(row)) { row.set((row.get() + d + n2) % n2); sound.sfx('lock'); }
  }
}
function drawOptions() {
  const o = st.opts;
  g.alpha(0.95); g.rect(0, 0, 320, 180, '#07060c', true); g.alpha(1);
  g.text('OPTIONS', 160, 5, { scale: 3, col: P.warn, align: 'center' });
  OPTS.forEach((row, k) => {
    const step = Math.min(12.4, 116 / (OPTS.length - 1)); // rows tighten as options are added, help stays clear
    const y = 21 + k * step;
    const focus = o.cur === k, locked = optLocked(row);
    if (focus) { g.rect(30, y - 1.5, 260, 10.5, P.panelHi, true); g.frame(30, y - 1.5, 260, 10.5, P.warn, 1, true); g.text('>', 24, y, { scale: 2, col: P.warn }); }
    g.text(row.label, 36, y, { scale: 2, col: locked ? '#5a5280' : focus ? P.text : P.dim, shadow: null });
    if (row.action) return;
    const v = row.vals()[row.get()];
    const txt = locked ? `${v} (TITLE ONLY)` : focus ? `< ${v} >` : v;
    g.text(txt, 284, y, { scale: 2, col: locked ? '#5a5280' : focus ? P.warn : P.text, align: 'right', shadow: null });
  });
  const row = OPTS[o.cur];
  g.text(row.help, 160, 149, { scale: 2, col: P.text, align: 'center' });
  g.rect(0, 162, 320, 18, P.ink, true);
  let x = 160 - 134;
  x += prompt(g, 'STICK', 'CHOOSE', x, 166) + 10;
  x += prompt(g, 'A', 'CHANGE', x, 166) + 10;
  prompt(g, 'B', 'DONE', x, 166);
}

function updateDraft(controls) {
  const d = st.draft;
  if (d.doneAt !== null) { if (st.t - d.doneAt >= LOCK_BEAT) finishDraft(); return; }
  for (const p of d.pickers) {
    if (p.picked) continue;
    if (st.t < DRAFT_GUARD) continue; // a press carried over from results can't pick (F-11)
    const c = controls.get(p.seat) || NO_CONTROLS;
    const hn = p.hand.length;
    if (c.upP) { p.cur = (p.cur + hn - 1) % hn; sound.sfx('move'); }
    if (c.downP) { p.cur = (p.cur + 1) % hn; sound.sfx('move'); }
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
    case 'act': drawAct(); break;
    case 'recap': drawRecap(); break;
    case 'setup': drawSetup(); break;
    default: break;
  }
  if (st.rack) drawRack(); else drawToasts();
  // everything is the Cabinet's screen: scanlines on menus, the glass bezel everywhere
  if (['countdown', 'play', 'finish'].includes(st.screen)) drawBezel(g); else drawCrt(g);
  fx.drawFlash(g);
  if (st.paused) drawPause();
  if (st.opts) drawOptions();
  drawWipe();
  drawXboxHelp();
  if (SHOW_PADS) drawPadDiag();
}
/** Edge on Xbox: tell the players how to hand the controller to the game. */
function drawXboxHelp() {
  const why = xboxProblem();
  if (!why) return;
  g.alpha(0.9); g.rect(0, 0, 320, 180, '#05040a', true); g.alpha(1);
  panel(20, 18, 280, 144, P.warn);
  if (why === 'focus') {
    g.text('THE GAME LOST THE CONTROLLER', 160, 32, { scale: 2, col: P.warn, align: 'center', raw: true });
    g.text('PRESS THE XBOX BUTTON TO OPEN THE GUIDE,', 160, 62, { scale: 2, col: P.text, align: 'center', raw: true });
    g.text('THEN PRESS IT AGAIN TO CLOSE IT.', 160, 76, { scale: 2, col: P.text, align: 'center', raw: true });
    g.text('THIS HAPPENS AFTER THE VIEW BUTTON IN EDGE.', 160, 104, { scale: 1, col: P.dim, align: 'center', raw: true });
    g.text('YOUR GAME IS SAVED AND PAUSED.', 160, 116, { scale: 1, col: P.dim, align: 'center', raw: true });
    return;
  }
  g.text('BUTTONS NOT WORKING?', 160, 28, { scale: 3, col: P.warn, align: 'center', raw: true });
  g.text('EDGE IS USING THE CONTROLLER AS A MOUSE.', 160, 52, { scale: 1, col: P.dim, align: 'center', raw: true });
  g.text('SWITCH IT TO GAME CONTROLS:', 160, 62, { scale: 1, col: P.dim, align: 'center', raw: true });
  g.text('1. HOLD THE MENU BUTTON', 44, 80, { scale: 2, col: P.text, raw: true });
  g.text('   (THREE LINES, RIGHT OF THE XBOX BUTTON)', 44, 93, { scale: 1, col: P.dim, raw: true });
  g.text('2. CHOOSE "USE GAME CONTROLS", PRESS A', 44, 104, { scale: 2, col: P.text, raw: true });
  g.text('3. PRESS A TO JOIN', 44, 120, { scale: 2, col: P.good, raw: true });
  g.text('STILL STUCK FOR ONE PLAYER? THEY DO STEP 1 TOO. DON\'T HOLD MENU IN PLAY:', 160, 140, { scale: 1, col: P.dim, align: 'center', raw: true });
  g.text('A QUICK PRESS PAUSES, A LONG HOLD SWITCHES BACK TO MOUSE MODE.', 160, 150, { scale: 1, col: P.dim, align: 'center', raw: true });
}
/** ?pads: what the browser reports, for a photo when something is wrong. */
function drawPadDiag() {
  const d = xboxDiag();
  const list = rawPads().filter(Boolean);
  g.alpha(0.85); g.rect(0, 0, 320, 12 + list.length * 20 + 14, '#000', true); g.alpha(1);
  g.text(`PADS ${list.length}  XBOX ${d.isXbox ? 'Y' : 'N'}  FOCUS ${d.focused ? 'Y' : 'N'}  MOUSE ${d.mouseCount}  KEY ${d.lastKey || '-'}  KEYPAD ${d.keyPad ? 'Y' : 'N'}  ${xboxProblem() || 'OK'}`, 2, 2, { scale: 1, col: '#fff', raw: true });
  list.forEach((gp, k) => {
    const on = Array.from(gp.buttons || []).map((b, i) => ((b.pressed || b.value > 0.5) ? i : null)).filter((i) => i !== null);
    const ax = Array.from(gp.axes || []).map((a) => a.toFixed(1)).join(' ');
    g.text(`${gp.index}: ${(gp.id || '?').slice(0, 70)}`, 2, 12 + k * 20, { scale: 1, col: '#9ef', raw: true });
    g.text(`  MAP ${gp.mapping || 'none'}  BTNS ${gp.buttons.length} [${on.join(',')}]  AXES ${ax}`, 2, 20 + k * 20, { scale: 1, col: '#ff9', raw: true });
  });
  g.text(navigator.userAgent.slice(0, 90), 2, 12 + list.length * 20 + 2, { scale: 1, col: '#888', raw: true });
}
/** A shutter that opens on each new screen: ink bands slide away, staggered. Calm mode fades instead. */
function drawWipe() {
  if (st.wipe <= 0) return;
  const k = st.wipe / WIPE;
  if (settings.calm) { g.alpha(k); g.rect(0, 0, 320, 180, P.ink, true); g.alpha(1); return; }
  const col = st.gameId ? GAMES[st.gameId].meta.color : P.warn;
  for (let i = 0; i < 9; i++) {
    const w = 320 * clamp(k * 1.7 - i * 0.08, 0, 1);
    if (w <= 0) continue;
    const y = i * 20, left = i % 2 === 0;
    const x = left ? 0 : 320 - w;
    g.rect(x, y, w, 20, P.ink, true);
    g.rect(left ? x + w - 2 : x, y, 2, 20, col, true);
  }
}

function drawTitle() {
  const t = performance.now() / 1000;
  drawStage(g, 0, t, drift, { calm: settings.calm });
  // the bar floor, then the Cabinet: the narrator of the night, centre stage
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
      g.alpha(0.65 + 0.35 * Math.sin(t * 3 + i)); prompt(g, 'A', 'JOIN', x, y + 10, { col: P.text, align: 'center' }); g.alpha(1); // steady, only breathes
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
  const md = MODES[modeIdx()];
  const minP = st.mode === 'sandbox' ? 1 : MIN_PLAYERS;
  // the mode picker is the centrepiece: three doors, the chosen one lit
  MODES.forEach((m, k) => {
    const x = 160 + (k - modeIdx()) * 112;
    const on = k === modeIdx();
    const w = on ? 104 : 80, h = on ? 20 : 15, y = on ? 74 : 76.5;
    g.alpha(on ? 1 : 0.45);
    if (on) g.glow(x, y + h / 2, 70, '#ffd84a', 0.25 + 0.08 * Math.sin(t * 3), true);
    g.rrect(x - w / 2, y, w, h, 4, on ? '#2a1d4a' : P.panel, true);
    g.frame(x - w / 2, y, w, h, on ? P.warn : '#4a4270', 1, true);
    g.text(m.name, x, y + (on ? 6.5 : 4), { scale: 2, col: on ? P.warn : P.dim, align: 'center', shadow: null });
    if (on) { g.text('<', x - w / 2 + 3, y + 6.5, { scale: 2, col: P.warn, shadow: null }); g.text('>', x + w / 2 - 8, y + 6.5, { scale: 2, col: P.warn, shadow: null }); }
    g.alpha(1);
  });
  g.text(md.desc, 160, 100, { scale: 1, col: P.text, align: 'center' });
  g.rect(70, 57, 180, 12, P.ink, true);
  if (n >= minP) {
    prompt(g, 'X', st.mode === 'party' ? 'START THE NIGHT' : `PLAY ${md.name}`, 160, 59, { col: P.good, align: 'center' });
  } else if (n === 1 && MIN_PLAYERS > 1) prompt(g, 'RT', 'ADD A CPU, OR A TO JOIN', 160, 59, { col: P.text, align: 'center' });
  else prompt(g, 'A', 'JOIN', 160, 59, { col: P.text, align: 'center' });
  // settings live in OPTIONS now; the title only shows what matters before you start
  g.rect(0, 158, 320, 22, P.ink, true);
  let fxx = 160 - 150;
  fxx += prompt(g, 'Y', 'OPTIONS', fxx, 161) + 10;
  fxx += prompt(g, 'RT', 'ADD CPU', fxx, 161) + 10;
  g.text(`${settings.set === 'all' ? `ALL ${GAME_IDS.length}` : `CORE ${CORE.length}`} EVENTS${settings.calm ? '  CALM' : ''}`, 310, 162, { scale: 2, col: P.dim, align: 'right', shadow: null });
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((p2) => p2 && p2.connected) : [];
  if (sound.blocked && !settings.muted) g.text('SOUND STARTS AFTER YOUR FIRST BUTTON PRESS', 160, 173, { scale: 1, col: P.warn, align: 'center' });
  else if (!pads.length) g.text('KEYS: WASD MOVE  SPACE=A  F=SHOOT  G=BLOCK  IJKL=AIM  ENTER=START  C=ADD CPU  R=OPTIONS', 160, 173, { scale: 1, col: '#9a90c0', align: 'center' });
  g.text(BUILD, 318, 2, { scale: 1, col: '#5a5080', align: 'right' });

  fx.draw(g);
}

const TITLE_LINES = ['THE BAR IS', 'CLOSED.', 'I AM NOT.'];
function drawTitleCabinet(t) {
  const x = 118, y = 84, w = 84;
  g.alpha(0.25); g.rect(x - 10, y - 4, w + 20, 52, ACTS[0].accent, true); g.alpha(1); // neon glow
  g.rect(x, y, w, 44, '#1a1630', true); g.frame(x, y, w, 44, '#6a5aa0', 1, true);
  g.rect(x + 2, y + 2, w - 4, 6, '#ff5fd2', true); g.text('LAST CALL', x + w / 2, y + 2.5, { scale: 1, col: P.ink, align: 'center', shadow: null });
  g.rect(x + 5, y + 11, w - 10, 26, '#07060c', true);
  // the screen types its line, holds, and starts again
  const cyc = t % 7, lines = TITLE_LINES;
  let chars = Math.floor(cyc * 14);
  lines.forEach((ln, k) => {
    const shown = ln.slice(0, Math.max(0, chars)); chars -= ln.length + 3;
    if (shown) g.text(shown, x + 9, y + 13 + k * 8, { scale: 2, col: P.warn, shadow: null });
  });
  g.alpha(0.08); g.rect(x + 5, y + 11, w - 10, 26, P.warn, true); g.alpha(1);
  g.rect(x + 10, y + 38, w - 20, 4, '#2a2448', true);
  g.rect(x + 6, y + 44, 6, 4, '#1a1630', true); g.rect(x + w - 12, y + 44, 6, 4, '#1a1630', true);
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
  const sd = !!st.match.suddenDeath;
  const k = ONLY ? 1 : (m.tier || 1);
  drawStage(g, sd ? 3 : k, t, drift, { calm: settings.calm });
  // header: the night clock and the shape of the whole night
  if (sd) g.text('SUDDEN DEATH', 160, 4, { scale: 2, col: P.danger, align: 'center' });
  else if (ONLY) g.text(`PRACTICE ${st.match.eventIdx + 1} OF ${st.match.eventCount}`, 160, 4, { scale: 2, col: P.dim, align: 'center' });
  else {
    g.text(nightClock(st.match.eventIdx), 8, 4, { scale: 2, col: ACTS[k].accent, shadow: null });
    drawNightStrip(g, 70, 5, 242, st.match.playlist, st.match.eventIdx, st.match.winners, tierOf, GAMES);
  }
  const pop = Math.min(1, t * 4);
  g.text(m.name, 160, 16 + (1 - pop) * -20, { scale: 5, col: m.color, align: 'center', shadow: '#000' });
  if (st.twist) {
    g.text(`TWIST: ${st.twist.name}`, 160, 35, { scale: 2, col: P.warn, align: 'center' });
    g.text(st.twist.desc, 160, 43, { scale: 1, col: '#fff', align: 'center' });
  } else if (m.broken && !ONLY) {
    // the thread of the night: which rule the Cabinet breaks here
    const a = 'THE CABINET BREAKS: ', w = g.textW(a + m.broken, 2);
    g.text(a, 160 - w / 2, 37, { scale: 2, col: P.dim, shadow: null });
    g.text(m.broken, 160 - w / 2 + g.textW(a, 2), 37, { scale: 2, col: ACTS[k].accent, shadow: null });
  } else g.text(m.tagline.toUpperCase(), 160, 37, { scale: 2, col: '#fff', align: 'center' });
  if (m.card) {
    // short card: two rule lines, three buttons, one danger line. Everything at reading size.
    const c = m.card;
    panel(8, 50, 304, 24, m.color, P.panel);
    g.text(sd ? 'TIED PLAYERS ONLY. EVERYONE ELSE DROPS ANVILS' : c.rule, 160, 53, { scale: 2, col: P.text, align: 'center' });
    g.text(c.rule2, 160, 63, { scale: 2, col: P.warn, align: 'center' });
    const items = [['STICK', 'MOVE'], ...c.keys];
    const widths = items.map(([b2, txt]) => g.textW(txt, 2) + (b2.length === 1 || b2.endsWith('STICK') ? 13 : g.textW(b2, 2) + 10) + 10);
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
  if (st.twist) g.text(st.twist.name, 160, 16, { scale: 1, col: P.warn, align: 'center' });
  if (game.matchPoint && game.matchPoint() && !game.finished) { const mp = 'MATCH POINT'; const w = g.textW(mp, 1) + 6; g.rect(160 - w / 2, st.twist ? 23 : 16, w, 7, P.ink, true); g.text(mp, 160, st.twist ? 24 : 17, { scale: 1, col: P.warn, align: 'center', shadow: null }); }
  const tl = Math.ceil(game.timeLeft);
  g.text(String(tl), 160, 2, { scale: 3, col: tl <= 5 ? P.danger : tl <= 10 ? P.warn : '#fff', align: 'center', shadow: null });
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
  drawStage(g, st.match.suddenDeath ? 3 : (m.tier || 1), t, drift, { calm: settings.calm });
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
    else if (st.quip && t > 0.8) drawVoice(g, st.quip, 160, 149, t - 0.8, { col: P.warn });
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
  drawStage(g, tierOf(d.next), t, drift, { calm: settings.calm });
  const winner = st.lastRanking[0];
  if (st.mode === 'showdown') {
    g.text(`ROUND ${st.match.eventIdx + 1}: PICK A CARD`, 160, 3, { scale: 3, col: P.warn, align: 'center' });
    g.text(`P${winner} TOOK IT.  ` + st.match.players.map((q) => `P${q.seat} ${q.wins}/${st.sd.to}`).join('  '), 160, 17, { scale: 2, col: P.dim, align: 'center' });
  } else {
    g.text('COMEBACK DRAFT', 160, 3, { scale: 3, col: P.warn, align: 'center' });
    g.text(`P${winner} WON: NO CARD.  NEXT: ${GAMES[d.next].meta.name}`, 160, 17, { scale: 2, col: P.dim, align: 'center' });
  }
  const n = d.pickers.length;
  const colW = n === 1 ? 204 : 152;
  d.pickers.forEach((p, k) => {
    const x0 = n === 1 ? 58 : 6 + k * 156;
    const i = p.seat - 1;
    const place = st.lastRanking.indexOf(p.seat) + 1;
    const locked = !!p.picked;
    // column header: who, what place, and their state
    drawPlayer(g, i, x0 + 8, 42, { size: 1.2, squash: locked && !settings.calm ? Math.max(0, 0.5 - (t - p.lockedAt) * 2) : 0 });
    g.text(`P${p.seat} ${ordinal(place)}` + (p.last && !locked ? ' +1' : ''), x0 + 18, 29, { scale: 2, col: SEAT_COLORS[i], shadow: null });
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
        const rh = p.hand.length > 3 ? 12 : 15;
        panel(x0, y, colW, rh, '#3a3458', P.panel);
        g.rect(x0 + 3, y + (rh - 9) / 2, 9, 9, pw.col, true);
        g.text(pw.name, x0 + 16, y + (rh - 7) / 2, { scale: 2, col: P.dim, shadow: null });
        if (combosUnlockedBy(st.match.player(p.seat).powers, id).length) g.text('~ COMBO', x0 + colW - 3, y + (rh - 7) / 2, { scale: 2, col: P.warn, align: 'right', shadow: null });
        y += rh + (p.hand.length > 3 ? 2 : 3); return;
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
      const unlock = locked ? [] : combosUnlockedBy(st.match.player(p.seat).powers, id);
      if (unlock.length) h += 10 * unlock.length + 2;
      panel(x0, yy, colW, h, chosen ? P.good : pw.col, focus ? P.panelHi : '#132218');
      if (focus) { g.frame(x0 - 1, yy - 1, colW + 2, h + 2, P.warn, 1, true); g.text('>', x0 - 6, yy + 4, { scale: 2, col: P.warn }); }
      g.rect(x0 + 3, yy + 3, 11, 11, pw.col, true);
      g.text(pw.kind === 'gun' ? 'G' : pw.kind === 'block' ? 'B' : '@', x0 + 8.5, yy + 5, { scale: 2, col: P.ink, align: 'center', shadow: null });
      g.text(pw.name, x0 + 18, yy + 4, { scale: 2, col: P.text, shadow: null });
      if (!chosen) g.text(have ? `X${have + 1}` : rar.name, x0 + colW - 3, yy + 5, { scale: 1, col: have ? P.warn : rar.col, align: 'right', shadow: null });
      let ly = yy + h0;
      lines.forEach((ln, k2) => { g.para(ln.text, x0 + 5, ly, colW - 10, { scale: 2, col: ln.bad ? '#ff8a8a' : P.good }); ly += lineH[k2] + 1; });
      g.text(`NEXT: ${where}`.slice(0, Math.floor((colW - 8) / 3)), x0 + 5, ly + 1, { scale: 1, col: P.warn, shadow: null });
      unlock.forEach((c2, k4) => { // this card completes a combo: say so loudly
        const cy = ly + 9 + k4 * 10;
        g.rect(x0 + 2, cy, colW - 4, 9, '#3a2a00', true); g.frame(x0 + 2, cy, colW - 4, 9, P.warn, 1, true);
        g.glow(x0 + colW / 2, cy + 4, 40, '#ffd84a', 0.25 + 0.1 * Math.sin(t * 6), true);
        g.text(`COMBO! ${c2.name}`, x0 + colW / 2, cy + 1, { scale: 2, col: P.warn, align: 'center', shadow: null });
      });
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
  else if (t < 2.2 && d.pickers.some((p) => p.last)) g.text(`LAST PLACE GETS A 4TH CARD`, 160, 159, { scale: 2, col: P.warn, align: 'center' });
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
  drawStage(g, 0, t, drift, { calm: settings.calm });
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
    g.text(st.mode === "showdown" ? `${p.wins} ROUNDS` : `${p.points} PTS`, x, y + 18, { scale: 2, col: '#0b0a12', align: 'center', shadow: null });
    const cards = Object.values(p.powers).reduce((a2, n2) => a2 + n2, 0);
    if (cards) g.text(`${cards} CARD${cards > 1 ? 'S' : ''}`, x, y + 28, { scale: 1, col: '#0b0a12', align: 'center', shadow: null });
    void h;
  });
  if (st.sdWinner) g.text('WON IN SUDDEN DEATH', 160, 30, { scale: 1, col: '#ff5a5a', align: 'center' });
  if (t > 2) {
    g.rect(0, 166, 320, 14, '#0b0a12', true);
    let fx2 = 160 - 128;
    fx2 += prompt(g, 'A', 'REMATCH', fx2, 170, { col: P.good }) + 14;
    prompt(g, 'Y', 'NEW PLAYERS', fx2, 170, { col: P.text });
  }
  fx.draw(g);
}

/** An act begins: the Cabinet wakes a little more. The clock, the act, its line, the rules it will break. */
function drawAct() {
  const a = st.act, A = ACTS[a.k], t = st.t;
  drawStage(g, a.k, t, drift, { calm: settings.calm });
  // a glitch as the act lands (not in calm mode)
  if (!settings.calm && t < 0.6) for (let k = 0; k < 7; k++) { const y = (k * 37 + Math.floor(t * 60) * 13) % 180; g.alpha(0.6); g.rect(0, y, 320, 2 + (k % 3), A.accent, true); g.alpha(1); }
  const pop = Math.min(1, t * 3);
  g.text(a.clock, 160, 18, { scale: 4, col: A.accent, align: 'center', shadow: '#000' });
  g.text(`ACT ${a.k}`, 160, 44 + (1 - pop) * 6, { scale: 3, col: P.dim, align: 'center' });
  g.text(A.name, 160, 60 + (1 - pop) * 10, { scale: 4, col: P.text, align: 'center', shadow: '#000' });
  if (t > 0.5) drawVoice(g, A.line, 160, 92, t - 0.5, { col: A.accent });
  if (t > 1.6) {
    const label = a.rules.length ? 'TONIGHT I BREAK:' : 'NOTHING IS BROKEN. YET.';
    g.text(label, 160, 112, { scale: 2, col: P.dim, align: 'center' });
    if (a.rules.length) g.text(a.rules.join('  /  '), 160, 124, { scale: 2, col: P.warn, align: 'center' });
  }
  drawNightStrip(g, 40, 144, 240, st.match.playlist, st.match.eventIdx, st.match.winners, tierOf, GAMES);
  if (t > 1.4) { g.rect(110, 160, 100, 14, P.ink, true); prompt(g, 'A', 'GO ON', 160, 163, { col: P.good, align: 'center' }); }
}

/** The night, laid out: every event, the rule it broke, who won it. The design of the night made visible. */
function drawRecap() {
  const t = st.t, m = st.match;
  drawStage(g, 3, t, drift, { calm: settings.calm });
  g.text('THE NIGHT', 160, 4, { scale: 3, col: P.text, align: 'center' });
  g.text('2:00 AM  LAST CALL', 160, 17, { scale: 1, col: ACTS[3].accent, align: 'center' });
  const rows = m.playlist.length;
  const rowH = Math.min(15, 118 / rows);
  m.playlist.forEach((id, i) => {
    const show = t > 0.6 + i * RECAP_STEP;
    if (!show) return;
    const y = 28 + i * rowH;
    const meta = GAMES[id].meta, k = tierOf(id), A = ACTS[k];
    const slide = clamp((t - 0.6 - i * RECAP_STEP) * 6, 0, 1);
    const x = 8 + (1 - slide) * 30;
    g.alpha(slide);
    g.rect(x, y, 3, rowH - 3, A.accent, true);
    g.text(nightClock(i).replace(' PM', '').replace(' AM', ''), x + 7, y + 1, { scale: 2, col: P.dim, shadow: null });
    g.text(meta.name, x + 44, y + 1, { scale: 2, col: meta.color, shadow: null });
    g.text(meta.broken ? `BROKE ${meta.broken}` : 'RULES INTACT', x + 158, y + 1, { scale: 2, col: meta.broken ? A.accent : '#5a5280', shadow: null });
    const w = m.winners[i];
    if (w) { drawPlayer(g, w - 1, 296, y + rowH - 2, { size: 0.7 }); g.text(`P${w}`, 304, y + 1, { scale: 1, col: SEAT_COLORS[w - 1], shadow: null }); }
    g.alpha(1);
  });
  const end = 0.6 + rows * RECAP_STEP;
  if (t > end) {
    const broke = new Set(m.playlist.map((id) => GAMES[id].meta.broken).filter(Boolean)).size;
    drawVoice(g, `${rows} GAMES. ${broke} BROKEN RULES. SAME TIME TOMORROW?`, 160, 150, t - end, { col: ACTS[3].accent, speed: 40 });
  }
  if (t > end + 0.8) { g.rect(110, 165, 100, 13, P.ink, true); prompt(g, 'A', 'PODIUM', 160, 167, { col: P.good, align: 'center' }); }
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
  const rows = [['A', 'RESUME'], ['X', 'OPTIONS'], ['B', `CALM MODE: ${settings.calm ? 'ON' : 'OFF'}`], ['Y', 'QUIT TO TITLE']];
  rows.forEach(([b, txt], k) => prompt(g, b, txt, 104, 80 + k * 15, { col: P.text }));
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
    trailC.clearRect(0, 0, 640, 360); trailC.drawImage(canvas, 0, 0, 640, 360);
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
  st, input, fx, sound, settings, xboxDiag, xboxProblem, IS_XBOX, GAMES, CORE, drift, applyLook, bots, openOptions, OPTS,
  step(n = 1) { for (let i = 0; i < n; i++) update(STEP); draw(); },
};
