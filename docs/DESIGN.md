# Last Call Arcade: design notes

## What makes the two reference games work

### ROUNDS (Landfall)
1. **The loser picks a card.** Losing a round gives you an upgrade. That keeps the loser excited, and it means the matchup changes every round.
2. **Cards come with trade-offs.** A card gives a big plus and a real minus (more damage but less health). Picking one is a decision, not a free stat bump.
3. **Cards stack into combos.** Bouncing bullets plus explosions on hit, or a giant body plus a giant shove. Combos create "did you SEE that" moments, and every new build changes how rivals have to play.
4. **You can see the build.** Upgrades change your body, your bullets and your effects, so everyone can read what a player has.
5. **Short, lethal rounds.** A few hits and you're out. Rounds take seconds, so losing costs almost nothing.
6. **Skill tools with counterplay.** Jump, aim and a block on a cooldown. Blocking at the right moment beats anything.
7. **Small, dense arenas.** Tight platforms, gaps, and hazards that move. You have to keep moving.
8. **Physical feedback.** Knockback, bullets that bounce, slow motion on a kill, screen shake, chunky particles.
9. **Simple art with strong color.** Flat shapes and faces read instantly on screen.

### 8Bit Fiesta (FrozenDev)
1. **The rules change every few seconds.** Random short minigames mean nobody gets good at "the game". Everyone keeps adapting.
2. **Same simple controls, different skills.** Platforming, shooting, dodging and survival all use a stick and two buttons.
3. **Side view and top-down mixed.** Each minigame has its own screen layout and its own look.
4. **Short events with gaps to talk.** 20-30 second games with breaks to trash-talk and grab a drink.
5. **Pixel art you can read from the couch.** Big sprites, bright hazards on dark backgrounds.
6. **Built for the party.** An optional drinking/house-rules layer that never touches scoring.

## How Last Call Arcade uses each element

| Element | In this game |
| --- | --- |
| Loser picks | After every event, 2nd and 3rd place each pick 1 of 3 power cards. Last place picks first. |
| Trade-off cards | 13 powers. Each card shows a green upside, a red downside, and what it does in the next event. |
| Stacking combos | Each power stacks up to 2×. Powers share one stat system, so they combine in every game (Ricochet + Splitter + Aftershock = a bullet storm). |
| Readable builds | Bigger or smaller bodies, colored bullets, shield rings and power icons under each player. |
| Lethal, short rounds | Three hearts in Ricochet Rooftop. One zap costs a heart in Laser Lounge. Events run 25-45 s. |
| Block with counterplay | RB/LB/Y blocks in the side-view games. A blocks dash in Laser Lounge. RB braces in Dust Lap. |
| Moving hazards | Every event has hazards that warn first, then move: saws on rails, a sweeping searchlight laser, rising electric water, crumbling ledges, rolling boulders, tumbleweeds, dust devils, rotating lasers, disco balls, laser walls, lightning, barrels, a spiked pendulum. |
| Physical feedback | Knockback, hit-stop, slow motion on knockouts, adjustable screen shake, particles, flashes, popups. |
| Rotating rules | 4 minigames, each played twice in a shuffled playlist with no back-to-back repeats. |
| Distinct screens | Side-view rooftop shootout, top-down desert race, top-down neon dance floor, side-view city coin rain. Each has its own palette and music loop. |
| Nobody sits out | Knocked-out players become ghosts who drop anvils (Rooftop) or turrets who fire orbs (Laser Lounge). The race keeps everyone driving. Coin Storm keeps everyone in. |
| Couch reading | 320×180 pixel canvas scaled up crisp. Seats are told apart by shape (▲ ● ■), pattern (diagonal / dots / bars) and a big P-number, never by color alone. |
| House Rules | Optional, off by default. Prompts after some events, skippable with X. They never change scores or powers. |

## Launch minigames
1. **Ricochet Rooftop** (side view, wet rooftop at night). Shoot, jump and block. Saws on rails, ledges that crumble, a moving platform, a sweeping searchlight laser, and rising electric water after 25 s. Falling off costs a heart and launches you back up. Knocked-out players drop anvils on a marked spot.
2. **Dust Lap** (top-down, dusk desert, 3 laps). Auto throttle, steer with the stick, hold A to drift and release for a boost, X to hop, RB to brace. Gates enforce the course. Tumbleweeds, rolling boulders, cactus and wandering dust devils.
3. **Laser Lounge** (top-down neon dance floor). Pure dodging: rotating lasers, laser walls with gaps, floor tiles that zap, bouncing disco balls. A dashes. Knocked-out players ride the walls as turrets.
4. **Coin Storm** (side-view city at night). Coins rain down. Grab the most. X shoves, stomping a head steals coins, RB blocks. Lightning strikes a column (with a warning), barrels roll along the floor, and a spiked pendulum swings.

## Event tiebreakers (shown on the intro screen)
- Ricochet Rooftop: still standing → more health → knocked out later.
- Dust Lap: finish order → laps and gates done → closer to the next gate.
- Laser Lounge: still standing → more hearts → knocked out later.
- Coin Storm: more coins → reached that total first.
- Match: points → event wins → a sudden-death Ricochet Rooftop between the tied players, with everyone else as anvil-dropping ghosts.

## Points
Each event gives 1st/2nd/3rd place 3/2/1 points. A match is 8 events (4 games × 2).

---

# Build 3: ROUNDS-style guns, physics twists, three new games

## What makes ROUNDS' gun physics fun (research notes)
- **Bullets are physical objects.** They fall with gravity, carry knockback, and bounce off walls once you have bounce cards. A bad angle can still be a good shot.
- **Gun cards change numbers with clear trade-offs.** Examples: *Bouncy* gives +2 bounces and +25% damage but +0.25 s reload. *Mayhem* gives +5 bounces but -15% damage and +0.5 s reload. *Trickster* adds 2 bounces where each bounce adds +80% damage, but -20% base damage. *Buckshot* gives +4 bullets and +5 ammo but -60% damage. *Explosive Bullet* explodes on impact but slows your attack speed.
- **Ammo and reload are a rhythm.** You empty a magazine, then you're open while you reload. Cards trade damage against fire rate against reload.
- **Cards multiply each other.** Bounces × split × homing × explosions is where the stories come from.
- **Block is a skill with its own cards:** shockwave blocks, teleport blocks, healing blocks.
- **Rarity** (common / uncommon / rare) keeps the wildest cards special.

## Our gun system (`src/game/weapons.js`), shared by every game with a gun
Each player's gun has: damage, pellets, spread, bullet speed, bullet gravity, bullet size, ammo, reload, shot delay, burst count, bounces, damage per bounce, homing, retarget on bounce, explosion radius, sticky fuse, split on bounce, speed-up in flight, wave, knockback, lifesteal, poison, frost, phase-through-walls, and boomerang.
Bullets are moved in sub-steps so fast bullets don't skip thin ledges. They bounce off solid ground, round planets and the arena's edges. Gravity comes from the game, so in Orbit Outpost bullets curve around the planet.

## 30 original power cards in 3 rarities
Gun cards, body cards and block cards, each with ROUNDS-style +/- lines. The card also says where it applies in the next game: your gun, your turret, your car's blaster, your block, or your dash. Each card stacks to 2×.

## Physics twists (8Bit Fiesta-style rule changes)
From the 2nd event on, each event has a 50% chance of a twist, shown on the intro screen. Moon Gravity, Heavy Metal, Crosswind, Tilt-a-Whirl (gravity swings), Rubber World (+3 bounces on every bullet), Bullet Time, Big Head Mode, Warp Edges (bullets wrap around the screen), Hyper Speed and Ice Rink. Each game only uses the twists that make sense for it.

## Color drift
The whole screen slowly shifts hue, and the shift kicks harder on knockouts. **SUBTLE** is the default, **WILD** adds stronger color plus light trails, and **OFF** turns it off (Y on the title screen, X in pause). Players are still told apart by shape, pattern and number, so color drift never hides who is who.

## Three new minigames
5. **Orbit Outpost.** A tiny planet with its own gravity. Run all the way around it, and bullets curve into orbits. Dodge two moons, marked meteor strikes and fire geysers. Knocked-out players become satellites and shoot down at the planet.
6. **Blast Ball.** Top-down pinball soccer. Each player guards a goal. Shoot the ball (bullet knockback pushes it), dash into it, and bank it off bumpers. Three goals against you and you're out, and your goal becomes a wall you ride as a turret. Multiball at 20 s.
7. **Splat City.** Top-down paint war. Bullets paint the streets as they fly and splat where they land, so bounces paint more. Shooting a rival splats paint around them. Street sweepers and a rotating sprinkler wash paint away. Most of the map painted wins. Each player's paint has its own pattern.

## Ricochet Rooftop maps
Five arenas: Neon Roofs, Water Tower, Billboard, Crane Yard and Staircase.

## Match length
7 games. A match plays 8 events: every game once plus one repeat, shuffled with no back-to-back repeats.

---

# Build 4: three more minigames and office mode

8. **Tick Tock** (top-down). Hot potato with a live bomb you can throw. A thrown bomb sticks to whoever it hits. Blocking bounces tags and throws away. A loose bomb that nobody touches rolls toward the nearest player. If it blows while loose, whoever touched it last is out. The fuse ticks faster as it burns, and the numbers only show for the last 3 seconds. Conveyor belts, ice and pillars move the bomb around. Players without the bomb shoot to shove the holder, or the loose bomb, toward someone else. Blown-up players become ghosts with a gust that shoves people and the bomb.
9. **Updraft** (vertical climb). The screen climbs and a laser floor follows. Ledges come in normal, moving, crumbling and spring types. Falling icicles have warnings, and side gusts push you. Shoot rivals off their ledges. The sky changes color as you climb. Zapped players become storm clouds that drop icicles.
10. **Lights Out** (top-down, in the dark). You see only what flashlights, bullets, glinting gems and lightning reveal. A guard robot patrols with a red searchlight, and getting spotted costs half your gems. A second guard arrives at 18 s, and a big gem spawns somewhere every 9 s.
11. **Mobius Loop** (side view, two floors). Gravity pulls toward whichever surface is closer, floor or ceiling. A double jump past the glowing horizon makes you fall up and walk upside down. Leaving a side edge wraps you to the other side on the opposite surface, and bullets do the same, so a shot fired off the right edge comes back out of the left on the ceiling. Saws ride the horizon (faster after 25 s), spike strips arm on the floor or the ceiling (never both), and knocked-out ghosts drop gravity bombs. 3 maps: Twin Horizon, Stairs to Nowhere, Hourglass.
12. **Echo Chamber** (top-down). Every 5 s each player's last 5 s comes back as an echo that replays every step and shot, on a loop, up to 3 per player. Echo bullets hit everyone, including the player who made them, and touching any echo hurts ("paradox"). After 30 s time slips and echoes replay at 1.5x. Your own past aim becomes the hazard you must dodge, and a knocked-out player's echoes keep fighting. 3 rooms.
13. **Mirror Twins** (top-down, split by a mirror). One stick drives two bodies: you on the left, your twin on the right. Every 11 s the mirror rule changes: Mirror (left-right swap), Upside Down, Spin (both), Clone (same). The pillars differ on each side, so walls knock the twins out of sync. The left laser sweeps sideways while the right one sweeps up and down, spike balls bounce on both sides, and hits drop gems. Most gems wins. 3 layouts.
14. **Wormhole** (side view). Your bullets punch holes in walls; each player owns two, and a new shot moves the older one. Anything entering one of your holes (a player, a bullet, the orb) comes out of the other at the same speed, straight out of the wall, so dropping into a floor hole flings you. Anyone can use anyone's holes. Hold the orb the longest. At 25 s the floor turns to lava. 3 chambers.
15. **Rule Breaker** (top-down). Four sentences lie on the floor: FLOOR IS _, SHOTS ARE _, LEADER IS _, STICK IS _. Word blocks (ICE, FAST, SLOW, HUGE, TINY, BOUNCY, MAGNET, REVERSED, NORMAL) are pushed by walking into them or shooting them; a word in a blank is the live rule for everyone, and nonsense combinations do nothing. Most gems wins. From 30 s the sentences lock one by one.
16. **Still Life** (top-down). Time only moves when someone moves: players always move at full speed, but bullets, turrets and the sweeping beam run at the speed of everyone's combined movement. Fire while frozen and your bullets hang in the air like mines. Most gems wins. At 25 s time never drops below 30%.

**Acts.** Every game has a tier: 1 grounded, 2 strange (Orbit, Lights Out, Mirror Twins, Still Life), 3 mind-bending (Mobius, Echo, Wormhole, Rule Breaker). A match deals ~40% act 1, ~25% act 2 and the rest act 3, in that order, and the intro card names the act. See docs/CREATIVE_DIRECTION.md.
