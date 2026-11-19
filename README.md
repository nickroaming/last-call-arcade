# Last Call Arcade

A couch party game for three players on one Xbox Series X and one TV (working title).
The full design brief is in [Claude_Game_Brief.md](Claude_Game_Brief.md).

## Current state: Milestone 0, the controller test
A web page that proves Edge on the Xbox accepts three controllers at once.
- Player steps and pass criteria: [docs/XBOX_CONTROLLER_TEST.md](docs/XBOX_CONTROLLER_TEST.md)
- What was tested, where, and the results: [BUILD_LOG.md](BUILD_LOG.md)

## Run it on a Mac (no install needed)
```bash
python3 -m http.server 8777 --bind 127.0.0.1
```
Then open:
- http://127.0.0.1:8777/ for the controller test (an Xbox controller over USB or Bluetooth works in Chrome or Edge on the Mac)
- http://127.0.0.1:8777/tests/ for the unit tests (the page should say ALL PASS)

## Layout
- `src/input/gamepad-adapter.js`: seats, joins, seat ownership and reconnects. No DOM, so the game reuses it.
- `src/controller-test/test-run.js`: the Milestone 0 pass criteria as plain logic with an injected clock.
- `src/controller-test/app.js` and `style.css`: the TV screen and the browser guards (back, focus, keys, mouse).
- `tests/`: unit tests that run in the browser, with fake gamepads.

Milestone 0 is plain JavaScript modules with no build step, because this Mac has no Node.js yet.
Milestone 1 moves to TypeScript and Phaser behind the same input adapter.
