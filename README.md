# Last Call Arcade

A couch party game for 2-3 players on one Xbox Series X (Edge browser) and one TV.
Sixteen arcade minigames in three acts; a match plays 8 of them, starting grounded and ending mind-bending. Creative direction and storyboard: [docs/CREATIVE_DIRECTION.md](docs/CREATIVE_DIRECTION.md). Every game shares a ROUNDS-style gun: bullets drop, bounce, split, home in and explode. Losers draft trade-off cards that stack into combos. Winners get the Winner's Curse.

- **Play:** https://nickroaming.github.io/last-call-arcade/
- **Online seat test (remote player):** https://nickroaming.github.io/last-call-arcade/online-test.html · steps in [docs/ONLINE_SEAT_TEST.md](docs/ONLINE_SEAT_TEST.md)
- **Controller test (Milestone 0):** https://nickroaming.github.io/last-call-arcade/controller-test.html
- Design notes and research on ROUNDS and 8Bit Fiesta: [docs/DESIGN.md](docs/DESIGN.md)
- Builds and test results: [BUILD_LOG.md](BUILD_LOG.md) · Original brief: [Claude_Game_Brief.md](Claude_Game_Brief.md)

## How to play (controller only)
1. Each player presses **A** to join. Press **X** or **Menu ≡** to start.
2. Each event starts with a screen that shows the goal, controls, hazards and any **twist** (Moon Gravity, Crosswind, Rubber World…). Press **A** when ready.
3. After each event, 2nd and 3rd place each pick a power card: stick up/down, **A** to pick. Last place picks first. Cards are gun (G), block (B) or body (♥), in common, uncommon or rare.
4. **Winner's Curse:** each event win makes you tipsier (Buzzed → Tipsy → Wobbly): your stick drifts, your aim sways and your block slows. Losing sobers you up. Power-up icons in the arena help last place 2x and the leader least. With House Rules on, the winner also gets a "take a sip" prompt. Drinking never changes the score.
5. After 8 events, the most points wins (3/2/1 per event). A tie goes to a sudden-death shootout.
6. **Menu ≡** pauses. While paused: **A** resume, **X** screen shake, **LB** sound, **RB** color drift, **Y** quit.
7. Title screen: **Y** shake, **LB** sound, **RB** House Rules, **LT** color drift (Subtle / Wild / Off), hold **View** to leave a seat.

| Game | Move | A | X / RT | RB |
| --- | --- | --- | --- | --- |
| Ricochet Rooftop (5 maps) | stick (and aim) | jump, double jump | shoot | block |
| Dust Lap | stick points where to drive | hold to drift, release to boost | car blaster | hop |
| Laser Lounge | stick | dash | turret gun when you're out | – |
| Coin Storm | stick | jump, double jump | shoot (knocks coins loose) | block |
| Orbit Outpost | run around the planet | jump | shoot (bullets orbit) | block |
| Blast Ball | stick | dash into the ball | shoot the ball | block |
| Splat City | stick (your feet paint) | dash | paint gun | block |
| Tick Tock | stick | dash | holding the bomb: throw it; otherwise shoot to shove | block (tags bounce off) |
| Updraft | stick | jump, double jump | shoot (knock rivals off ledges) | block |
| Lights Out | stick (flashlight follows) | dash | shoot (shots light the room) | block |
| Mobius Loop | stick (walk the floor or the ceiling) | jump; double jump past the horizon to fall up | shoot (bullets curve to the closer surface) | block |
| Echo Chamber | stick | dash | shoot (your echoes repeat it) | block |
| Mirror Twins | stick moves both bodies (the mirror rule decides how) | both dash | both shoot | both block |
| Wormhole | stick | jump, double jump | shoot a hole into a wall (two per player) | block |
| Rule Breaker | stick (walk into word blocks to push them) | dash | shoot (shots push words too) | block |
| Still Life | stick (moving makes time move) | dash | shoot (frozen shots hang in the air) | block |

Handy link options: `?events=4` for a short match, `?only=orbit` to practise one game, `?twist=moon` to force a twist, `?solo` to start with one player, `?rules=Toast the winner|Snack break` for your own House Rules prompts.

## Playing without a controller (office mode)
Open the link in any desktop browser (Chrome, Edge or Safari):
1. Press **Space** to join as P1 on the keyboard.
2. Press **C** once or twice to add CPU players (on a controller, **RT** does the same). Press C again when all seats are full to remove the last CPU.
3. Press **Enter** to start.

Keys: **WASD** move · **Space** = A (jump/dash/ready) · **F** = X (shoot) · **G** = RB (block) · **IJKL** aim · **R** = Y · **E** = LB · **Enter** = Menu/pause.
A second person can use the arrows with **/** (A), **.** (X), **,** (RB) and **Backspace** (Menu).
With only CPUs seated, Enter still starts the match, so you can watch them play for balance checks.

## Run it on a Mac (no install needed)
```bash
python3 -m http.server 8777 --bind 127.0.0.1
```
Then open http://127.0.0.1:8777/. Keyboard players: WASD + Space (A) + F (X) + G (RB) + Enter (Menu), or arrows + / (A) + . (X) + , (RB).
Tests: http://127.0.0.1:8777/tests/ should say ALL PASS.

## Layout
- `src/input/gamepad-adapter.js`: seats, joins, reconnects (shared with the controller test).
- `src/engine/`: pixel renderer and font, effects (shake, hit-stop, slow-mo, particles), synth sound and music, character art.
- `src/game/`: match rules (`match.js`), cards, Winner's Curse and pickup buffs (`powers.js`), the shared gun physics (`weapons.js`), twists (`twists.js`), arena power-ups (`pickups.js`), controls, and the game-night flow (`main.js`).
- `src/games/`: the seven minigames. Each exports `meta` and `create(ctx)` → `{update, draw, hud, finished, ranking}`.
- `tests/`: unit tests and robot playthroughs that run in the browser.

Plain JavaScript modules, no build step, because this Mac has no Node.js. Match logic and minigames don't depend on the page, so moving to TypeScript later stays mechanical.
