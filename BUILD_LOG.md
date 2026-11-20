# Build and playtest log

Lab results (desktop browser, simulated controllers) and hardware results (real Xbox) are kept apart.

## Builds
| Build | Date | What changed | Test link |
| --- | --- | --- | --- |
| online-test-1 | 2026-11-19 | Online seat test: Xbox hosts and streams a test picture over WebRTC (PeerJS public service for setup, Google STUN, no relay server), the remote player sends controller input, PASS/FAIL on both sides | https://nickroaming.github.io/last-call-arcade/online-test.html |
| m1-2026-11-20.8-polish | 2026-11-20 | Polish slice on branch `polish/rooftop-slice`: Rooftop best-of rounds with land-a-hit, layered calm look, shared style module (palette roles, glyphs, drift on backdrop only), new intro/ready strip/countdown spotlight/draft/results, flash limiter + Calm Mode. Not published. See docs/audit/AUDIT.md, docs/DESIGN_GUIDE.md, docs/PLAYTEST.md | local: http://127.0.0.1:8777/ (before: /before/) |
| m1-2026-11-20.7 | 2026-11-20 | 3 more games: Wormhole, Rule Breaker, Still Life (16 total). Matches play in three acts (grounded → strange → mind-bending), named on the intro card. Smooth, animated characters (eyes, blink, walk, lean, squash). Creative direction doc | https://nickroaming.github.io/last-call-arcade/ |
| m1-2026-11-20.6 | 2026-11-20 | 3 mind-bending games: Mobius Loop, Echo Chamber, Mirror Twins (13 total). Title tells a lone player that RT adds a CPU | https://nickroaming.github.io/last-call-arcade/ |
| m1-2026-11-19.4 | 2026-11-19 | 3 new games: Tick Tock, Updraft, Lights Out (10 total). Office mode: CPU players (C key / RT), Enter starts, IJKL aim | https://nickroaming.github.io/last-call-arcade/ |
| m1-2026-11-19.3 | 2026-11-19 | ROUNDS-style gun system shared by all games (bounce, split, home, retarget, sticky, explode, boomerang, wind-up, wave, poison, frost, lifesteal, phase). 33 rarity cards with +/- lines. 3 new games (Orbit Outpost, Blast Ball, Splat City). 5 Rooftop maps. Physics twists. Color drift (Subtle/Wild/Off). Winner's Curse (tipsy handicap + optional sip prompt). Arena power-ups weighted to losers. 8-event playlist from 7 games | https://nickroaming.github.io/last-call-arcade/ |
| m1-2026-11-19.2 | 2026-11-19 | Full game: 4 hazard-heavy minigames, 13 trade-off power cards that stack (cap 2), comeback draft, 8-event match, sudden death, podium, rematch, pause, shake/sound/House Rules settings, synth music and SFX. Controller test moved to /controller-test.html | https://nickroaming.github.io/last-call-arcade/ |
| m0-2026-11-19.1 | 2026-11-19 | First controller test: 3 seats, 30 s test, pause, reconnect, PASS/FAIL | https://nickroaming.github.io/last-call-arcade/ |

## Lab results (not real hardware)
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
