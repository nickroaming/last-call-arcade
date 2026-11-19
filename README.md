# Last Call Arcade

A couch party game for 2-3 players on one Xbox Series X (Edge browser) and one TV.
Four arcade minigames, full of moving hazards, rotate through a match. Losers draft power cards that stack into combos.

- **Play:** https://nickroaming.github.io/last-call-arcade/
- **Controller test (Milestone 0):** https://nickroaming.github.io/last-call-arcade/controller-test.html
- Design notes and what we took from ROUNDS and 8Bit Fiesta: [docs/DESIGN.md](docs/DESIGN.md)
- Builds and test results: [BUILD_LOG.md](BUILD_LOG.md) · Original brief: [Claude_Game_Brief.md](Claude_Game_Brief.md)

## How to play (controller only)
1. Each player presses **A** to join. Press **X** or **Menu ≡** to start.
2. Each event starts with a screen that shows the goal, controls and hazards. Press **A** when ready.
3. After each event, 2nd and 3rd place each pick a power card: stick up/down, **A** to pick. Last place picks first.
4. After 8 events, the most points wins (3/2/1 per event). A tie goes to a sudden-death shootout.
5. **Menu ≡** pauses. While paused: **A** resumes, **X** changes screen shake, **LB** turns sound on/off, **Y** quits.
6. On the title screen: **Y** screen shake, **LB** sound, **RB** House Rules, hold **View** to leave a seat.

| Game | Move | A | X / RT | RB |
| --- | --- | --- | --- | --- |
| Ricochet Rooftop | stick (and aim) | jump, double jump | shoot | block |
| Dust Lap | stick points where to drive | hold to drift, release to boost | hop | brace |
| Laser Lounge | stick | dash | fire, as a turret when out | – |
| Coin Storm | stick | jump, double jump | shove | block |

Handy link options: `?rounds=1` for a short 4-event match, `?only=lounge` to practise one game, `?solo` to start with one player, `?rules=Toast the winner|Snack break` for your own House Rules prompts.

## Run it on a Mac (no install needed)
```bash
python3 -m http.server 8777 --bind 127.0.0.1
```
Then open http://127.0.0.1:8777/. Keyboard players: WASD + Space (A) + F (X) + G (RB) + Enter (Menu), or arrows + / (A) + . (X) + , (RB).
Tests: http://127.0.0.1:8777/tests/ should say ALL PASS.

## Layout
- `src/input/gamepad-adapter.js`: seats, joins, reconnects (shared with the controller test).
- `src/engine/`: pixel renderer and font, effects (shake, hit-stop, slow-mo, particles), synth sound and music, character art.
- `src/game/`: match rules (`match.js`), power cards (`powers.js`), controls, and the game-night flow (`main.js`).
- `src/games/`: the four minigames. Each exports `meta` and `create(ctx)` → `{update, draw, hud, finished, ranking}`.
- `tests/`: unit tests and robot playthroughs that run in the browser.

Plain JavaScript modules, no build step, because this Mac has no Node.js. Match logic and minigames don't depend on the page, so moving to TypeScript later stays mechanical.
