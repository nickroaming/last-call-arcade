# Build and playtest log

Lab results (desktop browser, simulated controllers) and hardware results (real Xbox) are kept apart.

## Builds
| Build | Date | What changed | Test link |
| --- | --- | --- | --- |
| m1-2026-11-19.3 | 2026-11-19 | ROUNDS-style gun system shared by all games (bounce, split, home, retarget, sticky, explode, boomerang, wind-up, wave, poison, frost, lifesteal, phase). 33 rarity cards with +/- lines. 3 new games (Orbit Outpost, Blast Ball, Splat City). 5 Rooftop maps. Physics twists. Color drift (Subtle/Wild/Off). Winner's Curse (tipsy handicap + optional sip prompt). Arena power-ups weighted to losers. 8-event playlist from 7 games | https://nickroaming.github.io/last-call-arcade/ |
| m1-2026-11-19.2 | 2026-11-19 | Full game: 4 hazard-heavy minigames, 13 trade-off power cards that stack (cap 2), comeback draft, 8-event match, sudden death, podium, rematch, pause, shake/sound/House Rules settings, synth music and SFX. Controller test moved to /controller-test.html | https://nickroaming.github.io/last-call-arcade/ |
| m0-2026-11-19.1 | 2026-11-19 | First controller test: 3 seats, 30 s test, pause, reconnect, PASS/FAIL | https://nickroaming.github.io/last-call-arcade/ |

## Lab results (not real hardware)
**m1-2026-11-19.3** · Chromium-based browser pane on macOS, gamepads simulated in JavaScript
- Tests: 69/69 pass. New tests cover gun physics (wall death vs. bounce, Rubber damage, Bank Shot damage per bounce, Splitter, Sticky Bomb stick-then-explode, Smart Ricochet hitting a target, ammo/reload), the 8-from-7 playlist, every card's lines/rarity/where-it-applies text, the Winner's Curse (gain, sober up, cap, stat penalties), the pickup multiplier, and every twist each game allows.
- Robot playthroughs: all 7 games finish in 6 variants, with every twist they allow, with 2 players, and with every card stacked twice.
- Full 8-event match with House Rules on: every game appeared, sip prompts showed, tipsy levels rose and fell, cards stacked, podium reached.
- Screens checked: Orbit Outpost intro and play with Moon Gravity, Blast Ball, Splat City, Crane Yard map, results with Winner's Curse line, draft with the new cards.
- Not covered: real Xbox, real people, balance of the new cards, Wild color mode on a TV, frame rate on the Series X with many bullets.

**m1-2026-11-19.2** · Chromium-based browser pane on macOS, gamepads simulated in JavaScript
- Tests: 44/44 pass. 22 controller-test checks plus: playlist with no back-to-back repeats, 3/2/1 points, draft order (last place first, none after the last event), offers never include a capped power, stacking across events, reset on rematch, tie detection and sudden-death order, every power has text for every game.
- Robot playthroughs: every minigame finishes with a full ranking in both layouts, with 2 or 3 players, with every power stacked twice, and with a sudden-death ghost.
- Full match with three simulated controllers: join → 4 events (`?rounds=1`) → results → drafts → podium. Screens checked by screenshot: title, intro, all four games, results, draft, podium.
- Not covered: real Xbox, real people (balance, difficulty, readability from the couch), sound on the console, frame rate on the Series X.

**m0-2026-11-19.1** · Chromium-based browser pane on macOS, gamepads simulated in JavaScript
- Unit tests: 22/22 pass (`tests/`): joins, one controller per seat, input separation, disconnect and auto-restore, restore by A in a new slot, oldest-first restore, joins closed during the test, device swap counts as a drop, all pass criteria, blame for the failed seat, reconnect pass/fail/skip/timeout.
- Full page run with three simulated pads: join → test → pause/resume → reconnect → **PASS** screen, all six checks ✔.
- FAIL run: P2 never held A and P3 pressed B just before a simulated focus loss → **FAIL**, "Problem seats: P2, P3", reconnect skipped shows NOT TESTED.
- Not covered in the lab: real Xbox Edge, real Bluetooth reconnect timing, what B/Menu/View do in Edge on Xbox, the Xbox guide popup.

## Hardware results (real Xbox Series X)
| Date | Build | Xbox OS version | Edge version (from result code) | Players | Result | Problem seats / notes |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | waiting for Nick | |
