// Power cards, ROUNDS-style: gun / body / block cards with +/- lines and
// rarities. Everything writes to one stat block, so cards stack and combo
// in every minigame. Also: the Winner's Curse (tipsy) and pickup buffs.

import { combosFor } from './combos.js';

// Cards stack up to five deep: the fun is in how far a build can go.
export const MAX_STACK = 5;
export const RARITY = {
  common: { name: 'COMMON', col: '#c8c0ff', weight: 6 },
  uncommon: { name: 'UNCOMMON', col: '#5affd9', weight: 3 },
  rare: { name: 'RARE', col: '#ff5fd2', weight: 1.3 },
};

export function baseStats() {
  return {
    hp: 100, speed: 1, jump: 1, airJumps: 1, grav: 1, size: 1, knockTaken: 1, shields: 0,
    blockCd: 1, blockShock: 0, blockBlink: 0, blockSwap: 0, blockHeal: 0, blockBurst: 0, blockStasis: 0, parry: 0, reflect: false, magnet: 0,
    tipsy: 0, wobble: 0, mult: 1,
    gun: {
      dmg: 34, pellets: 1, spread: 0.14, speed: 240, grav: 1, size: 1.6, ammo: 3, reload: 1.2, delay: 0.28, burst: 1,
      bounces: 0, bounceDmg: 1, homing: 0, retarget: 0, explode: 0, sticky: 0, split: 0, accel: 0, wave: 0,
      knock: 1, lifesteal: 0, poison: 0, frost: 0, ghost: false, boomerang: false, sway: 0,
      grow: 0, sneak: 0, chain: 0, pierce: 0, shrapnel: 0, echo: 0, chaos: 0,
    },
  };
}

const P = (id, name, rarity, kind, lines, apply) => ({ id, name, rarity, kind, lines, apply, col: RARITY[rarity].col });

export const POWERS = [
  // ---- gun: common ----
  P('rubber', 'RUBBER ROUNDS', 'common', 'gun', ['+2 bounces', '+25% damage', '-0.25s slower reload'],
    (s) => { s.gun.bounces += 2; s.gun.dmg *= 1.25; s.gun.reload += 0.25; }),
  P('scatter', 'SCATTERSHOT', 'common', 'gun', ['+4 pellets per shot', '+3 ammo', '-60% damage per pellet'],
    (s) => { s.gun.pellets += 4; s.gun.ammo += 3; s.gun.dmg *= 0.4; s.gun.reload += 0.25; }),
  P('slug', 'HEAVY SLUG', 'common', 'gun', ['+100% bullet size', '+50% damage, +60% knockback', '-30% bullet speed'],
    (s) => { s.gun.size *= 2; s.gun.dmg *= 1.5; s.gun.knock *= 1.6; s.gun.speed *= 0.7; s.gun.grav *= 1.3; }),
  P('hair', 'HAIR TRIGGER', 'common', 'gun', ['Fire twice as fast', '+2 ammo', '-20% damage'],
    (s) => { s.gun.delay *= 0.5; s.gun.ammo += 2; s.gun.dmg *= 0.8; }),
  P('fastlane', 'FAST LANE', 'common', 'gun', ['+80% bullet speed', 'Bullets drop 50% less', '-10% damage'],
    (s) => { s.gun.speed *= 1.8; s.gun.grav *= 0.5; s.gun.dmg *= 0.9; }),
  P('loader', 'SPEED LOADER', 'common', 'gun', ['Reload 45% faster', '+1 ammo', '-5% damage'],
    (s) => { s.gun.reload *= 0.55; s.gun.ammo += 1; s.gun.dmg *= 0.95; }),
  P('tripletap', 'TRIPLE TAP', 'common', 'gun', ['Each trigger fires a 3-round burst', '-45% damage', '-0.3s slower reload'],
    (s) => { s.gun.burst += 2; s.gun.dmg *= 0.55; s.gun.reload += 0.3; }),
  // ---- body: common ----
  P('thick', 'THICK SKIN', 'common', 'body', ['+50% health', '-8% move speed'],
    (s) => { s.hp *= 1.5; s.speed *= 0.92; }),
  P('springs', 'SPRING HEELS', 'common', 'body', ['+1 extra air jump', '+15% jump height'],
    (s) => { s.airJumps += 1; s.jump *= 1.15; }),
  P('nitro', 'NITRO', 'common', 'body', ['+25% move speed', 'You get shoved 25% further'],
    (s) => { s.speed *= 1.25; s.knockTaken *= 1.25; }),
  P('airbag', 'AIRBAG', 'common', 'body', ['Ignore the first hit each event', '-8% move speed'],
    (s) => { s.shields += 1; s.speed *= 0.92; }),
  // ---- gun: uncommon ----
  P('pinball', 'PINBALL', 'uncommon', 'gun', ['+5 bounces', '-15% damage', '-0.5s slower reload'],
    (s) => { s.gun.bounces += 5; s.gun.dmg *= 0.85; s.gun.reload += 0.5; }),
  P('bankshot', 'BANK SHOT', 'uncommon', 'gun', ['+2 bounces', 'Each bounce: +80% damage', '-20% base damage'],
    (s) => { s.gun.bounces += 2; s.gun.bounceDmg *= 1.8; s.gun.dmg *= 0.8; s.gun.reload += 0.5; }),
  P('seeker', 'SEEKER', 'uncommon', 'gun', ['Bullets curve toward rivals', '-25% bullet speed'],
    (s) => { s.gun.homing += 1; s.gun.speed *= 0.75; }),
  P('boomstick', 'BOOMSTICK', 'uncommon', 'gun', ['Bullets explode on impact', '-40% fire rate', '-0.25s slower reload'],
    (s) => { s.gun.explode = Math.max(s.gun.explode, 18) + (s.gun.explode ? 8 : 0); s.gun.delay *= 1.4; s.gun.reload += 0.25; }),
  P('splitter', 'SPLITTER', 'uncommon', 'gun', ['Bullets split in two on a bounce', '+1 bounce', '-25% damage'],
    (s) => { s.gun.split += 1; s.gun.bounces += 1; s.gun.dmg *= 0.75; }),
  P('windup', 'WIND-UP', 'uncommon', 'gun', ['Bullets speed up and hit harder in flight', '-35% starting speed'],
    (s) => { s.gun.accel += 1.2; s.gun.speed *= 0.65; }),
  P('leech', 'LEECH', 'uncommon', 'gun', ['Heal 40% of the damage you deal', '-20% health'],
    (s) => { s.gun.lifesteal += 0.4; s.hp *= 0.8; }),
  P('frostbite', 'FROSTBITE', 'uncommon', 'gun', ['Hits slow the target for 1.5s', '-15% damage'],
    (s) => { s.gun.frost += 1; s.gun.dmg *= 0.85; }),
  P('venom', 'VENOM', 'uncommon', 'gun', ['Hits poison: +35% damage over 3s', '-10% bullet speed'],
    (s) => { s.gun.poison += 1; s.gun.speed *= 0.9; }),
  P('snake', 'SNAKE SHOT', 'uncommon', 'gun', ['Bullets slither in a wave', '+30% damage'],
    (s) => { s.gun.wave += 1; s.gun.dmg *= 1.3; }),
  P('growth', 'GROWTH SPURT', 'uncommon', 'gun', ['Bullets grow as they fly', 'Bigger bullet, bigger hit', '-20% bullet speed'],
    (s) => { s.gun.grow += 0.9; s.gun.speed *= 0.8; }),
  P('sneaky', 'SNEAKY', 'uncommon', 'gun', ['Bullets vanish, then show up near a rival', '+15% damage', '-10% bullet speed'],
    (s) => { s.gun.sneak += 1; s.gun.dmg *= 1.15; s.gun.speed *= 0.9; }),
  P('chain', 'CHAIN ZAP', 'uncommon', 'gun', ['Hits jump to a 2nd rival for 50%', '-15% damage'],
    (s) => { s.gun.chain += 1; s.gun.dmg *= 0.85; }),
  P('drill', 'DRILL BIT', 'uncommon', 'gun', ['Bullets drill through rivals', '+1 rival per card', '-20% damage'],
    (s) => { s.gun.pierce += 1; s.gun.dmg *= 0.8; }),
  P('shrapnel', 'SHRAPNEL', 'uncommon', 'gun', ['Bullets burst into 3 shards when they stop', '-20% damage'],
    (s) => { s.gun.shrapnel += 1; s.gun.dmg *= 0.8; }),
  // ---- block: uncommon ----
  P('burstblock', 'BURST BLOCK', 'uncommon', 'block', ['Blocking fires a ring of your bullets', 'Uses every gun card you have', 'Block recharges 25% slower'],
    (s) => { s.blockBurst += 1; s.blockCd *= 1.25; }),
  P('stasis', 'STASIS FIELD', 'uncommon', 'block', ['Blocking freezes rival bullets nearby', 'Block recharges 10% slower'],
    (s) => { s.blockStasis += 1; s.blockCd *= 1.1; }),
  P('shockblock', 'SHOCK BLOCK', 'uncommon', 'block', ['Blocking blasts a shockwave', 'Block recharges 20% slower'],
    (s) => { s.blockShock += 1; s.blockCd *= 1.2; }),
  P('blink', 'BLINK BLOCK', 'uncommon', 'block', ['Blocking teleports you toward your stick', 'Block recharges 15% slower'],
    (s) => { s.blockBlink += 1; s.blockCd *= 1.15; }),
  P('mirror', 'MIRROR BLOCK', 'uncommon', 'block', ['Block recharges 40% faster', 'Blocking sends bullets back'],
    (s) => { s.blockCd *= 0.6; s.reflect = true; }),
  P('switcheroo', 'SWITCHEROO', 'uncommon', 'block', ['Blocking swaps places with a random rival', 'Block recharges 60% slower'],
    (s) => { s.blockSwap += 1; s.blockCd *= 1.6; }),
  P('patchup', 'PATCH-UP BLOCK', 'uncommon', 'block', ['Blocking heals 20 health', 'Block recharges 10% slower'],
    (s) => { s.blockHeal += 20; s.blockCd *= 1.1; }),
  // ---- body: uncommon ----
  P('bigfoot', 'BIGFOOT', 'uncommon', 'body', ['+40% health, shoves land harder', 'Bigger body, -10% speed'],
    (s) => { s.size *= 1.3; s.hp *= 1.4; s.gun.knock *= 1.3; s.speed *= 0.9; }),
  P('feather', 'FEATHER', 'uncommon', 'body', ['Floaty, low-gravity jumps', 'You get shoved 40% further'],
    (s) => { s.grav *= 0.7; s.jump *= 1.1; s.knockTaken *= 1.4; }),
  P('tiny', 'TINY', 'uncommon', 'body', ['30% smaller and harder to hit', '-25% health'],
    (s) => { s.size *= 0.7; s.hp *= 0.75; }),
  // ---- rare ----
  P('glass', 'GLASS CANNON', 'rare', 'gun', ['Double damage', '-50% health'],
    (s) => { s.gun.dmg *= 2; s.hp *= 0.5; }),
  P('smart', 'SMART RICOCHET', 'rare', 'gun', ['+2 bounces', 'Every bounce aims at the nearest rival', '-15% damage'],
    (s) => { s.gun.bounces += 2; s.gun.retarget = 1; s.gun.dmg *= 0.85; }),
  P('phase', 'PHASE ROUNDS', 'rare', 'gun', ['Bullets pass through walls and floors', '-20% damage'],
    (s) => { s.gun.ghost = true; s.gun.dmg *= 0.8; }),
  P('stickybomb', 'STICKY BOMB', 'rare', 'gun', ['Bullets stick to walls, then explode', '-0.5s slower reload'],
    (s) => { s.gun.sticky = 1; s.gun.explode = Math.max(s.gun.explode, 24); s.gun.reload += 0.5; }),
  P('boomerang', 'BOOMERANG', 'rare', 'gun', ['Bullets fly back and can hit twice', '-15% bullet speed'],
    (s) => { s.gun.boomerang = true; s.gun.speed *= 0.85; }),
  P('echo', 'ECHO SHOT', 'rare', 'gun', ['Every shot fires again 0.3s later', '+1 echo per card', '-0.4s slower reload'],
    (s) => { s.gun.echo += 1; s.gun.reload += 0.4; }),
  P('chaos', 'CHAOS ROUNDS', 'rare', 'gun', ['Every bullet gets a random power', 'Bounce, hunt, boom, split, grow...', '-10% damage'],
    (s) => { s.gun.chaos += 1; s.gun.dmg *= 0.9; }),
  P('parry', 'PERFECT PARRY', 'rare', 'block', ['Block just as a hit lands: block back at once', 'Then your next 3 shots hit +60%', 'Block recharges 10% slower'],
    (s) => { s.parry += 1; s.blockCd *= 1.1; }),
  P('mashup', 'MASH-UP', 'rare', 'gun', ['Take 2 random cards right now', 'Any rarity, any combo', 'You get their downsides too'],
    () => {}),
  P('magnet', 'MAGNET', 'rare', 'body', ['Pulls coins, paint and the ball your way', 'Rival bullets curve toward you'],
    (s) => { s.magnet += 1; }),
];

const BADN = { tripletap: 2, springs: 0, pinball: 2, boomstick: 2, snake: 0, mirror: 0, growth: 1, sneaky: 1, mashup: 1, parry: 1, chaos: 1, echo: 1 };
for (const p of POWERS) p.badN = BADN[p.id] ?? 1;
/** Card lines with a +/- marker so good and bad don't rely on colour. */
export function cardLines(card) {
  return card.lines.map((ln, k) => {
    const bad = k >= card.lines.length - card.badN;
    const mark = bad ? (ln.startsWith('-') ? '' : '- ') : (ln.startsWith('+') ? '' : '+ ');
    return { text: mark + ln, bad };
  });
}
export const POWER_BY_ID = Object.fromEntries(POWERS.map((p) => [p.id, p]));

/** Where a card does something in a given minigame (shown on the card). */
export function cardWhere(card, meta) {
  if (card.kind === 'gun') return meta.gunUse || 'No gun in this game';
  if (card.kind === 'block') return meta.blockUse || 'No block in this game';
  return meta.bodyUse || 'Your body';
}

function clone(s) { return { ...s, gun: { ...s.gun, cx: { ...(s.gun.cx || {}) } }, cx: { ...(s.cx || {}) } }; }

export function statsFor(powers, { tipsy = 0 } = {}) {
  const s = baseStats();
  for (const [id, n] of Object.entries(powers || {})) {
    const p = POWER_BY_ID[id];
    if (!p) continue;
    for (let i = 0; i < Math.min(n, MAX_STACK); i++) p.apply(s);
  }
  applyCombos(s, powers);
  applyTipsy(s, tipsy);
  return finish(s);
}
/** Combo flags (and the few combos that are plain stat changes). */
function applyCombos(s, powers) {
  const list = combosFor(powers);
  s.combos = list.map((c) => c.id);
  s.cx = {}; s.gun.cx = {};
  for (const c of list) { s.cx[c.id] = true; if (c.kind === 'gun') s.gun.cx[c.id] = true; }
  if (s.cx.bloodmoon) s.gun.poison *= 1.5;
  if (s.cx.railgun) { s.gun.grav = 0; s.gun.pierce += 99; s.gun.dmg *= 1.4; }
  if (s.cx.hivemind) s.gun.homing = Math.max(s.gun.homing, 0.7);
  if (s.cx.secondwind) { s.blockHeal *= 2; }
}
function finish(s) {
  s.hp = Math.max(25, Math.round(s.hp));
  s.size = Math.max(0.5, Math.min(1.8, s.size));
  s.gun.delay = Math.max(0.05, s.gun.delay);
  s.gun.reload = Math.max(0.3, s.gun.reload);
  s.gun.ammo = Math.min(30, s.gun.ammo);
  s.gun.bounces = Math.min(25, s.gun.bounces);
  s.gun.pellets = Math.min(24, s.gun.pellets);
  s.gun.size = Math.min(7, s.gun.size);
  s.gun.echo = Math.min(4, s.gun.echo);
  s.blockCd = Math.min(4, s.blockCd);
  return s;
}

// ---------- Winner's Curse ----------
export const MAX_TIPSY = 3;
export const TIPSY_NAMES = ['SOBER', 'BUZZED', 'TIPSY', 'WOBBLY'];
export const TIPSY_LINES = [
  [],
  ['Stick drifts a little', 'Aim sways'],
  ['Stick drifts more', 'Aim sways more', 'Block recharges 25% slower'],
  ['Big stick drift and hiccups', 'Wild aim', 'Slower block, -8% speed'],
];
function applyTipsy(s, lvl) {
  s.tipsy = lvl;
  if (!lvl) return;
  s.wobble = [0, 0.28, 0.45, 0.62][lvl];
  s.gun.sway += [0, 0.06, 0.12, 0.2][lvl];
  if (lvl >= 2) s.blockCd *= 1.25;
  if (lvl >= 3) s.speed *= 0.92;
}

// ---------- in-map pickups ----------
export const PICKUPS = {
  rapid: { name: 'RAPID FIRE', icon: 'R', col: '#ffd84a', time: 7 },
  mega: { name: 'MEGA SHOTS', icon: 'M', col: '#ff7a2e', time: 7 },
  shield: { name: 'BUBBLE', icon: '@', col: '#9fd3ff', time: 0 },
  speed: { name: 'ZOOMIES', icon: '>', col: '#7dff8a', time: 7 },
  bounce: { name: 'BOUNCE PARTY', icon: 'B', col: '#5affd9', time: 7 },
};
/** Pickup strength by standing: last place 2x, leader ~0.6x, minus tipsy. */
export function pickupMult(rankIdx, nPlayers, tipsy) {
  const byRank = nPlayers <= 1 ? 1 : [0.6, 1.25, 2][Math.round((rankIdx / (nPlayers - 1)) * 2)];
  return Math.max(0.3, byRank * (1 - 0.15 * tipsy));
}
/** Base stats + active buffs. buffs: [{type, mult, t}] */
export function withBuffs(base, buffs) {
  if (!buffs || !buffs.length) return base;
  const s = clone(base);
  for (const b of buffs) {
    const m = b.mult;
    if (b.type === 'rapid') { s.gun.delay /= 1 + 1.2 * m; s.gun.reload /= 1 + 1.2 * m; s.gun.ammo += Math.round(2 * m); }
    if (b.type === 'mega') { s.gun.size *= 1 + 0.6 * m; s.gun.dmg *= 1 + 0.4 * m; s.gun.knock *= 1 + 0.5 * m; }
    if (b.type === 'speed') { s.speed *= 1 + 0.25 * m; }
    if (b.type === 'bounce') { s.gun.bounces += Math.round(2 * m); }
  }
  return finish(s);
}
