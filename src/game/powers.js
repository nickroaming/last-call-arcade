// Power cards. Each has an upside, a downside, and a concrete effect in every
// minigame. All powers write to one shared stat block, so they stack and combo.

export const MAX_STACK = 2;

export function baseStats() {
  return {
    speed: 1, jump: 1, grav: 1, size: 1, hp: 3, dmg: 1, fireCd: 1, bulletSpeed: 1,
    bounces: 0, blockCd: 1, reflect: false, shields: 0, knock: 1, knockTaken: 1,
    aftershock: 0, split: 0, homing: 0, spread: 0, magnet: 0,
  };
}

export const POWERS = [
  {
    id: 'ricochet', name: 'RICOCHET', icon: 'R', col: '#7dff8a',
    good: 'Shots bounce 2 more times', bad: 'Shots fly 10% slower',
    apply: (s) => { s.bounces += 2; s.bulletSpeed *= 0.9; },
    games: {
      rumble: 'Bullets bounce off walls and floors 2x',
      dustlap: 'Hitting a hazard BOOSTS you instead (3s cooldown)',
      lounge: 'Your turret orbs bounce off walls',
      coins: 'Running into a wall bounces you back with a kick',
    },
  },
  {
    id: 'aftershock', name: 'AFTERSHOCK', icon: 'A', col: '#ffd84a',
    good: 'Hits leave a second blast', bad: 'Fire 15% slower',
    apply: (s) => { s.aftershock += 1; s.fireCd *= 1.15; },
    games: {
      rumble: 'Bullet hits explode again 0.4s later',
      dustlap: 'Releasing a drift sends a shove wave',
      lounge: 'Your dash sends a shove wave',
      coins: 'Stomps and shoves make a shockwave',
    },
  },
  {
    id: 'airbag', name: 'AIRBAG', icon: '@', col: '#9fd3ff',
    good: 'Ignore the first hit', bad: 'Move 8% slower',
    apply: (s) => { s.shields += 1; s.speed *= 0.92; },
    games: {
      rumble: 'The first bullet or hazard does nothing',
      dustlap: 'Ignore the first spin-out',
      lounge: 'Ignore the first zap',
      coins: 'Keep your coins after the first hit',
    },
  },
  {
    id: 'bigfoot', name: 'BIGFOOT', icon: 'F', col: '#ff9a6b',
    good: '+1 heart, shove much harder', bad: 'Bigger and 10% slower',
    apply: (s) => { s.size *= 1.3; s.knock *= 1.6; s.hp += 1; s.speed *= 0.9; },
    games: {
      rumble: '+1 heart and bullets knock rivals far',
      dustlap: 'Big car: bumps launch rivals, wider turns',
      lounge: '+1 heart but a bigger target',
      coins: 'Shoves launch rivals further',
    },
  },
  {
    id: 'feather', name: 'FEATHER', icon: 'W', col: '#e8e8ff',
    good: 'Floaty high jumps, +10% speed', bad: 'You get shoved 40% further',
    apply: (s) => { s.jump *= 1.18; s.grav *= 0.72; s.speed *= 1.1; s.knockTaken *= 1.4; },
    games: {
      rumble: 'Floaty high jumps',
      dustlap: 'Hops (X) fly much further',
      lounge: 'Faster feet',
      coins: 'Floaty high jumps',
    },
  },
  {
    id: 'glass', name: 'GLASS CANNON', icon: 'G', col: '#ff5a5a',
    good: 'Double damage', bad: '-1 heart',
    apply: (s) => { s.dmg *= 2; s.hp -= 1; },
    games: {
      rumble: 'Bullets do double damage',
      dustlap: 'Your bumps spin rivals out',
      lounge: 'Turret orbs are huge',
      coins: 'Shoves knock out 2x coins (you drop 2x too)',
    },
  },
  {
    id: 'spray', name: 'SPRAY', icon: 'S', col: '#ffb3f0',
    good: '3-way shots, fire 30% faster', bad: 'Half damage per shot',
    apply: (s) => { s.spread += 2; s.fireCd *= 0.7; s.dmg *= 0.5; },
    games: {
      rumble: 'Fire 3 pellets at once, faster',
      dustlap: 'Hop recharges 30% faster',
      lounge: 'Turret fires a 3-way spread',
      coins: 'Shove recharges faster and hits wider',
    },
  },
  {
    id: 'homing', name: 'HOMING', icon: 'H', col: '#b48cff',
    good: 'Shots curve toward rivals', bad: 'Shots fly 20% slower',
    apply: (s) => { s.homing += 1; s.bulletSpeed *= 0.8; },
    games: {
      rumble: 'Bullets curve toward the nearest rival',
      dustlap: 'Snappier steering',
      lounge: 'Turret orbs chase survivors',
      coins: 'Shove lunges at the nearest rival',
    },
  },
  {
    id: 'quickshield', name: 'QUICKSHIELD', icon: 'Q', col: '#5affd9',
    good: 'Block 2x as often, reflects shots', bad: '-15% jump',
    apply: (s) => { s.blockCd *= 0.5; s.reflect = true; s.jump *= 0.85; },
    games: {
      rumble: 'Block recharges 2x faster and sends bullets back',
      dustlap: 'Brace (RB) recharges 2x faster',
      lounge: 'Dash recharges 2x faster',
      coins: 'Block recharges 2x faster',
    },
  },
  {
    id: 'splitter', name: 'SPLITTER', icon: 'Y', col: '#c6ff5a',
    good: 'Shots split in two on a bounce', bad: 'Fire 20% slower',
    apply: (s) => { s.split += 1; s.fireCd *= 1.2; },
    games: {
      rumble: 'Bullets split in two when they hit a wall',
      dustlap: 'Drift boosts last 50% longer',
      lounge: 'Turret orbs split when they hit a wall',
      coins: '25% of coins you grab count double',
    },
  },
  {
    id: 'nitro', name: 'NITRO', icon: 'N', col: '#ff7a2e',
    good: '+20% speed', bad: 'You get shoved 25% further',
    apply: (s) => { s.speed *= 1.2; s.knockTaken *= 1.25; },
    games: {
      rumble: 'Run 20% faster',
      dustlap: 'Top speed +20%',
      lounge: 'Move 20% faster',
      coins: 'Run 20% faster',
    },
  },
  {
    id: 'tiny', name: 'TINY', icon: 'T', col: '#ffe6a0',
    good: '30% smaller, harder to hit', bad: '-1 heart, shoved further',
    apply: (s) => { s.size *= 0.7; s.hp -= 1; s.knockTaken *= 1.2; },
    games: {
      rumble: 'Small target',
      dustlap: 'Small car squeezes past hazards',
      lounge: 'Small hitbox',
      coins: 'Small body slips between hazards',
    },
  },
  {
    id: 'magnet', name: 'MAGNET', icon: 'M', col: '#ff4f8b',
    good: 'Pulls good stuff to you', bad: 'Rival shots curve toward you',
    apply: (s) => { s.magnet += 1; },
    games: {
      rumble: 'Each hit you land heals you a little; rival bullets bend toward you',
      dustlap: 'Slipstream: draft rivals ahead for +speed',
      lounge: 'Turret orbs you fire curve toward survivors',
      coins: 'Coins fly to you from far away',
    },
  },
];

export const POWER_BY_ID = Object.fromEntries(POWERS.map((p) => [p.id, p]));

export function statsFor(powers) {
  const s = baseStats();
  for (const [id, n] of Object.entries(powers || {})) {
    const p = POWER_BY_ID[id];
    if (!p) continue;
    for (let i = 0; i < Math.min(n, MAX_STACK); i++) p.apply(s);
  }
  s.hp = Math.max(1, s.hp);
  s.size = Math.max(0.5, Math.min(1.8, s.size));
  return s;
}
