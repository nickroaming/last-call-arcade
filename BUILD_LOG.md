# Build and playtest log

Lab results (desktop browser, simulated controllers) and hardware results (real Xbox) are kept apart.

## Builds
| Build | Date | What changed | Test link |
| --- | --- | --- | --- |
| m1-2026-11-23.15-combos | 2026-11-23 | Cards and look overhaul. Modes: PARTY NIGHT / SHOWDOWN (Rooftop duels, a card for the losers every round, map pick, first to 3/5/7) / SANDBOX (any event, map and twist, card rack mid-fight). Cards stack 5 deep; 8 new gun and block cards; 22 named combos that add new rules (combos.js), shown on draft cards and announced when unlocked. Shared block hook gives Burst Block, Stasis Field and Perfect Parry to every event with a block. Renderer draws at the TV's resolution (up to 1920x1080) with smooth shapes, glowing bullets with trails, lit explosions, chain lightning; per-frame glow budget, 420-bullet and 700-spark caps; OPTIONS > GRAPHICS: FANCY/SIMPLE. Rooftop: a colour theme per map. Fix: Enter that paused a game no longer starts one from the title. 188 tests. Branch `feature/combos-facelift` | https://nickroaming.github.io/last-call-arcade/ |
| online-test-1 | 2026-11-19 | Online seat test: Xbox hosts and streams a test picture over WebRTC (PeerJS public service for setup, Google STUN, no relay server), the remote player sends controller input, PASS/FAIL on both sides | https://nickroaming.github.io/last-call-arcade/online-test.html |
| m1-2026-11-23.14-xbox-input | 2026-11-23 | Xbox fix: Edge on Xbox starts in "browsing controls" (the controller is a mouse), so no button reached the game. The game now spots this (cursor moves, no gamepad input, or nothing for 8 s on an Xbox) and shows step-by-step help: hold Menu, choose Use game controls, press A. Also: pauses and explains when the page loses focus (View button trap: open and close the Guide), accepts Edge's controller key events as a controller, goes full screen on the first click, `?pads` shows raw controller data for a photo. 176 tests. Branch `fix/xbox-input` | local: http://127.0.0.1:8777/?xbox |
| m1-2026-11-20.13-switcheroo | 2026-11-20 | New block card SWITCHEROO (uncommon): blocking also swaps places with a random rival, any time your block is charged (block recharges 60% slower). Works in all 18 events with a block (Dust Lap: on the hop; Body Snatch: the bodies you drive; Mirror Match: both twins). Only the spot moves; health, gems and score stay. 176 tests. Branch `power/switcheroo` | local: http://127.0.0.1:8777/ |
| m1-2026-11-20.12-switch | 2026-11-20 | Switch controllers (on a computer or phone browser; the Switch itself has no usable browser). Pro Controller, Joy-Con pairs and a lone sideways Joy-Con each seat one player. A/B layout learned on join so the printed A is A. On-screen names switch to L/R, ZL/ZR, -/+ and grey face buttons (OPTIONS > BUTTONS: AUTO/XBOX/SWITCH). 155/155 tests. Branch `switch-controllers` | local: http://127.0.0.1:8777/ |
| m1-2026-11-20.11-three | 2026-11-20 | Three new events on branch `events/three-more`, one per act: Spotlight (stand in the light alone), Zero Friction (the Cabinet breaks FRICTION: frictionless ice rink, best-of rounds, edge wobble), Body Snatch (the Cabinet breaks WHO YOU ARE: controllers jump bodies every 8 s). 19 events, core set 12 (four per act). Rounds: no hit, no round; fight-first tiebreak. Not published | local: http://127.0.0.1:8777/ |
| m1-2026-11-20.10-night | 2026-11-20 | The night, on branch `quality/facelift`: the Cabinet narrates (title, act break screens, results lines, 2:00 AM recap of every event and the rule it broke), night clock and strip on every intro, opener Rooftop / finale Rule Breaker, one stage per act with CRT scanlines and bezel, last place drafts from 4 cards, fairness fixes for Lounge/Blast Ball/Echo, gun arms and the impact kit in every event, no blink over 2.5 Hz, intro cards for all 16 events. Not published | local: http://127.0.0.1:8777/ |
| m1-2026-11-20.9-core | 2026-11-20 | Core pass on branch `quality/core-pass`: core set of 9 events (OPTIONS → EVENTS for all 16), Orbit and Mobius as best-of rounds (shared `rounds.js`), Orbit's Twin Planets and Gas Giant arenas, Wormhole tiebreak, game-feel kit (impact freeze, KO, layered hits, gun arms, climax music), OPTIONS screen (text size, screen fit, music volume), screen wipes, event health tool `/tests/measure.html`. Not published | local: http://127.0.0.1:8777/ |
| m1-2026-11-20.8-polish | 2026-11-20 | Polish slice on branch `polish/rooftop-slice`: Rooftop best-of rounds with land-a-hit, layered calm look, shared style module (palette roles, glyphs, drift on backdrop only), new intro/ready strip/countdown spotlight/draft/results, flash limiter + Calm Mode. Not published. See docs/audit/AUDIT.md, docs/DESIGN_GUIDE.md, docs/PLAYTEST.md | local: http://127.0.0.1:8777/ (before: /before/) |
| m1-2026-11-20.7 | 2026-11-20 | 3 more games: Wormhole, Rule Breaker, Still Life (16 total). Matches play in three acts (grounded → strange → mind-bending), named on the intro card. Smooth, animated characters (eyes, blink, walk, lean, squash). Creative direction doc | https://nickroaming.github.io/last-call-arcade/ |
| m1-2026-11-20.6 | 2026-11-20 | 3 mind-bending games: Mobius Loop, Echo Chamber, Mirror Twins (13 total). Title tells a lone player that RT adds a CPU | https://nickroaming.github.io/last-call-arcade/ |
| m1-2026-11-19.4 | 2026-11-19 | 3 new games: Tick Tock, Updraft, Lights Out (10 total). Office mode: CPU players (C key / RT), Enter starts, IJKL aim | https://nickroaming.github.io/last-call-arcade/ |
| m1-2026-11-19.3 | 2026-11-19 | ROUNDS-style gun system shared by all games (bounce, split, home, retarget, sticky, explode, boomerang, wind-up, wave, poison, frost, lifesteal, phase). 33 rarity cards with +/- lines. 3 new games (Orbit Outpost, Blast Ball, Splat City). 5 Rooftop maps. Physics twists. Color drift (Subtle/Wild/Off). Winner's Curse (tipsy handicap + optional sip prompt). Arena power-ups weighted to losers. 8-event playlist from 7 games | https://nickroaming.github.io/last-call-arcade/ |
| m1-2026-11-19.2 | 2026-11-19 | Full game: 4 hazard-heavy minigames, 13 trade-off power cards that stack (cap 2), comeback draft, 8-event match, sudden death, podium, rematch, pause, shake/sound/House Rules settings, synth music and SFX. Controller test moved to /controller-test.html | https://nickroaming.github.io/last-call-arcade/ |
| m0-2026-11-19.1 | 2026-11-19 | First controller test: 3 seats, 30 s test, pause, reconnect, PASS/FAIL | https://nickroaming.github.io/last-call-arcade/ |

## Lab results (not real hardware)
**m1-2026-11-23.15-combos** · Chromium-based browser pane on macOS, keyboard and CPU players, frames stepped by script (the pane was hidden)
- Tests: 188/188 pass. New: 5-deep stacking, every combo reachable from real cards, combo detection and "completes a combo" hints, Mash-Up, Growth Spurt, Drill Bit, Chain Zap, Shrapnel, Echo Shot and the 420-bullet cap, Perfect Parry, Burst Block and Stasis Field through the shared block hook, Fractal/Supernova/Cluster Storm.
- Showdown: a full first-to-5 match with CPUs ran from title to podium (9 rounds, draft after each). Sandbox: setup, card rack (add, remove), restart with new cards, and a heavily stacked three-player fight (6 combos on one player) ran with no errors. Orbit, Coin Storm, Laser Lounge and Tick Tock intro checked on screen after the renderer change.
- Not covered: real Xbox (frame rate with glow at 1080p: if it stutters, OPTIONS > GRAPHICS > SIMPLE), real people (combo balance, whether 5-deep stacks are too strong), Showdown with 2 humans.

**online-test-1** · two tabs of the same Chromium browser on one Mac
- Host and joiner both PASS: room opened through the PeerJS public service, direct connection made, video at 30 fps (640x360), controller input arriving at about 29/s, remote presses visible in the streamed picture.
- The 1 ms delay is meaningless (same machine). Not covered: two different homes, Xbox Edge sending video, the PS4 browser, networks that need a relay server.

**m1-2026-11-20.7** · Chromium-based browser pane on macOS, keyboard and CPU players
- Tests: 109/109 pass. New: act playlist (tiers never go backwards, always ends in act 3, no repeats), Rule Breaker (a word in a blank becomes the rule and changes play; walking into a word pushes it), Wormhole (standing on your floor hole sends you out of your wall hole at speed). Each new game also passes the robot, twist, power, 2-player, CPU-bot and draw tests.
- CPU runs (3 each): all three new games run the full 50 s. Wormhole: every player had both holes open and the orb changed hands. Still Life: time ranged 10%–100%. Rule Breaker: 14–38 gems per player.
- Screens checked: new characters on the title, Wormhole with holes on walls and ceilings plus the orb holder, Rule Breaker sentences and word blocks, Still Life time meter and beam, intro card "EVENT 1 OF 8 - WARM-UP". Orbit's rotated characters were broken by the art change; the draw test caught it and it was fixed.
- Not covered: real Xbox, real people (can everyone say each game's rule after one play?), frame rate on the Series X with the new smooth characters.

**m1-2026-11-20.6** · Chromium-based browser pane on macOS, keyboard and CPU players
- Tests: 94/94 pass. Each new game: robot playthroughs on 6 variants, every allowed twist, every power card stacked, 2-player, CPU bots finish, draw runs.
- CPU-only balance runs (6 each): Mirror Twins runs its full 45 s with 7-40 gems per player. Mobius Loop ends in 5-26 s and Echo Chamber in about 12 s, in line with Ricochet Rooftop (5-10 s) and Laser Lounge (10-15 s) under the same always-shooting bots. Echo Chamber was raised to 6 hearts and a 5 s loop after the first run ended before any echo appeared.
- Screens checked: Mobius intro (text trimmed to fit) and play (player walking upside down under a ceiling ledge, ceiling spikes armed), Echo Chamber with echoes and the loop bar, Mirror Twins in Upside Down mode with the right-side laser.
- Not covered: real Xbox, real people (whether the twists read clearly from the couch), frame rate on the Series X with many echoes.

**m1-2026-11-19.4** · Chromium-based browser pane on macOS, keyboard and CPU players
- Tests: 82/82 pass, including CPU bots driving all 10 games to a finish and robot playthroughs of the new games (6 variants, every twist, 2 players, every card stacked).
- Office mode checked with key presses only: Space joined, C added two CPUs, Enter started, Tick Tock played. Watch mode (3 CPUs) played Updraft through to results and the draft.
- Tuning from this check: Updraft got a 2.5 s grace period and a gentler climb (everyone was getting zapped in about 8 s). An untouched Tick Tock bomb now rolls toward the nearest player.
- Not covered: real people, Xbox, whether the CPUs are fun opponents (they're tuned to be testers, not rivals).

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
