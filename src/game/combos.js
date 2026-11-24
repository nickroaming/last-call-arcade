// COMBOS: when two kinds of card meet, something new happens. A combo is
// not "more of the same": each one adds a rule that neither card has alone.
// Combos are found from the cards a player holds (one card from each group),
// so they light up on the draft screen the moment you could complete one.
//
// Effects live where the rule lives: gun combos in weapons.js (flags on the
// gun, `g.cx.<id>`), block combos in blocks.js (`st.cx.<id>`).

export const GROUPS = {
  bounce: ['rubber', 'pinball', 'bankshot', 'splitter', 'smart'],
  bounceX: ['rubber', 'pinball', 'bankshot', 'smart'], // bounces from something other than a split
  home: ['seeker', 'smart'],
  boom: ['boomstick', 'stickybomb'],
  grow: ['growth', 'slug'],
  split: ['splitter'],
  many: ['scatter', 'tripletap', 'hair'],
  phase: ['phase'],
  sneak: ['sneaky'],
  chain: ['chain'],
  leech: ['leech'],
  poison: ['venom'],
  frost: ['frostbite'],
  boomerang: ['boomerang'],
  wind: ['windup'],
  sticky: ['stickybomb'],
  pierce: ['drill'],
  fast: ['fastlane'],
  echo: ['echo'],
  mirror: ['mirror'],
  shock: ['shockblock'],
  blink: ['blink'],
  burst: ['burstblock'],
  stasis: ['stasis'],
  parry: ['parry'],
  heal: ['patchup'],
  swap: ['switcheroo'],
};

const C = (id, name, kind, needs, text) => ({ id, name, kind, needs, text });

export const COMBOS = [
  // ---- gun combos ----
  C('pinwiz', 'PINBALL WIZARD', 'gun', ['bounce', 'home'], 'Every bounce: faster, harder, aimed at a rival'),
  C('supernova', 'SUPERNOVA', 'gun', ['grow', 'boom'], 'Big bullets make giant explosions'),
  C('cluster', 'CLUSTER STORM', 'gun', ['boom', 'many'], 'Every explosion throws 4 bomblets'),
  C('poltergeist', 'POLTERGEIST', 'gun', ['phase', 'sneak'], 'Invisible bullets glide through walls and hunt'),
  C('fractal', 'FRACTAL', 'gun', ['split', 'bounceX'], 'Splits come in threes'),
  C('stormcell', 'STORM CELL', 'gun', ['chain', 'bounce'], 'Every bounce zaps the nearest rival'),
  C('bloodmoon', 'BLOOD MOON', 'gun', ['leech', 'poison'], 'Poison heals you. Poison +50%'),
  C('flashfreeze', 'FLASH FREEZE', 'gun', ['frost', 'many'], 'Slowed rivals take +60% damage'),
  C('slingshot', 'SLINGSHOT', 'gun', ['boomerang', 'wind'], 'Bullets come back twice as fast and hard'),
  C('minefield', 'MINEFIELD', 'gun', ['sticky', 'many'], 'Stuck bombs wait for a rival to walk by'),
  C('railgun', 'RAILGUN', 'gun', ['pierce', 'fast'], 'No drop, drill through everyone, +40% damage'),
  C('mirrorhall', 'HALL OF MIRRORS', 'gun', ['echo', 'bounce'], 'Echo shots aim themselves at rivals'),
  C('mitosis', 'MITOSIS', 'gun', ['grow', 'split'], 'Split bullets are born full size'),
  C('hivemind', 'HIVE MIND', 'gun', ['many', 'home'], 'A swarm: every pellet hunts'),
  // ---- block combos ----
  C('sender', 'RETURN TO SENDER', 'block', ['mirror', 'bounce'], 'Reflected bullets: +3 bounces, double damage'),
  C('thunderstep', 'THUNDERSTEP', 'block', ['blink', 'shock'], 'Blink leaves a blast where you land'),
  C('fireworks', 'FIREWORKS', 'block', ['burst', 'many'], 'Burst block fires twice as many, and they pop'),
  C('timelock', 'TIME LOCK', 'block', ['stasis', 'home'], 'Frozen bullets become yours and hunt'),
  C('counter', 'COUNTERSTRIKE', 'block', ['parry', 'burst'], 'A perfect block fires a free burst'),
  C('secondwind', 'SECOND WIND', 'block', ['heal', 'leech'], 'Block heal x2 and a 1-hit bubble'),
  C('hotpotato', 'HOT POTATO', 'block', ['swap', 'boom'], 'Swapping leaves a bomb where you stood'),
  C('overclock', 'OVERCLOCK', 'block', ['parry', 'many'], 'A perfect block refills your ammo, double'),
];
export const COMBO_BY_ID = Object.fromEntries(COMBOS.map((c) => [c.id, c]));

const has = (powers, group) => GROUPS[group].some((id) => (powers[id] || 0) > 0);

/** Combos a set of cards ({id: count}) has unlocked. */
export function combosFor(powers) {
  powers = powers || {};
  return COMBOS.filter((c) => c.needs.every((g) => has(powers, g)));
}

/** Combos that taking `cardId` would newly unlock. */
export function combosUnlockedBy(powers, cardId) {
  const before = new Set(combosFor(powers).map((c) => c.id));
  const after = combosFor({ ...(powers || {}), [cardId]: ((powers || {})[cardId] || 0) + 1 });
  return after.filter((c) => !before.has(c.id));
}

/** Combos that use this card at all (for the "pairs with" hint). */
export function combosWith(cardId) {
  return COMBOS.filter((c) => c.needs.some((g) => GROUPS[g].includes(cardId)));
}
