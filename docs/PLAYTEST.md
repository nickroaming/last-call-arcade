# Playtest and backlog

**Latest build:** `m1-2026-11-20.12-switch` (branch `switch-controllers`, not published). **Live on the Xbox link:** `m1-2026-11-20.11-three`. **Before that:** `m1-2026-11-20.9-core` (branch `quality/core-pass`), `m1-2026-11-20.8-polish` (live on the Xbox link). The rooftop slice below is compared against `m1-2026-11-20.7`, kept playable in `before/`.
**Date:** 2026-11-20. **Environment for everything below:** Chromium browser pane on macOS, keyboard P1 + CPU P2/P3. **Nothing here was run on the Series X.**

## Switch controllers (`m1-2026-11-20.12-switch`)
The Switch and Switch 2 have no browser you can open (only a hidden one Nintendo keeps locking down), so the game cannot run on the console. What works: Switch controllers on a computer plugged into the TV, in Chrome or Edge.
- **Pairing (Mac):** hold the small sync button on the controller until the lights run, then pick it in System Settings > Bluetooth. A Joy-Con pair shows up as one player; a single Joy-Con held sideways is one player too.
- **Joining:** press the **A printed on the controller**. The game learns from that press which way the browser reports A and B, so A is always A afterwards (tests: Chrome-style and Safari-style reports, and a reconnect).
- **Lone Joy-Con:** one stick moves and aims (aim follows movement), SL/SR block, the face buttons do the rest, and either minus or plus pauses.
- **On screen:** when most players hold Switch controllers, prompts show L/R, ZL/ZR, -/+ and grey face buttons. Mixed groups follow the majority; OPTIONS > BUTTONS forces XBOX or SWITCH.
- **Checked:** simulated Pro Controller + lone Joy-Con: join, labels, move, shoot, pause (`switch_*` captures). **Not checked:** real Joy-Cons. Browsers report Joy-Cons differently; if a stick is turned 90° or a button is wrong, note which controller and browser.

## Three more events (`m1-2026-11-20.11-three`)
| Event | Act | Length (CPU, 12-20 runs) | Idle wins | Notes |
| --- | --- | --- | --- | --- |
| Spotlight (`spotlight.js`) | 1 | 56 s | 0% | 3 stages (Main Stage, The Bar Top, Balcony). Falling lamps target the star |
| Zero Friction (`slide.js`) | 2 | 53 s, 2.4 rounds | 0% | 3 rinks (The Rink, Cracked, Twin Holes). Uses `rounds.js` |
| Body Snatch (`swap.js`) | 3 | 55 s | 0% | 3 rooms (The Lounge, Hall of Mirrors, Open Floor) |

All three are in the core set, which is now **12: four per act**. A full night with three CPUs ran Rooftop → Tick Tock → Coin Storm → Zero Friction → Lights Out → Wormhole → Body Snatch → Rule Breaker in 7.75 min with no errors.

**Rule changes found while building:**
- **Zero Friction tuning.** It first ran at 17.5 s, then 11.8 s after weakening the shove: the CPU players slid off on their own. The fix that worked is a design beat, not a number: over the edge you **wobble for 0.7 s** and can push back in ("SAVED!"). Result: 44–53 s, 2.4–2.5 rounds.
- **Shared rounds (`rounds.js`), affects Orbit and Mobius too.** If nobody landed a hit, nobody takes the round ("NOBODY LANDED A HIT"). The final tiebreak is now round wins > hits landed across the event > played at all > survival.
- **Night order.** With four act 1 events, an opener could be dealt out of the night. Openers and finales now always make the cut.
- **Laser Lounge.** A survivor who barely moved all event ranks below everyone who played.

**Series X checks for these:**
1. Spotlight: does "CONTESTED" read instantly? Is the boo rule clear the first time?
2. Zero Friction: does shooting backwards to brake click without being told? Do the wobble saves feel fair?
3. Body Snatch: after the first swap, can each of you find yourself within a second? This is the hardest read in the game.

## The night (`m1-2026-11-20.10-night`), by finding
| Finding | What changed | Files |
| --- | --- | --- |
| F-22 | The Cabinet narrates the night: on the title, at each act break (clock, act name, its line, "TONIGHT I BREAK: ..."), after each result, and in the 2:00 AM recap. Intro cards carry the night clock, the night strip, and "THE CABINET BREAKS: GRAVITY" for act 2 and 3 events. Every night opens with Rooftop and ends with Rule Breaker. | `src/game/night.js` (new), `main.js`, `match.js`, every event's `meta.broken` / `opener` / `finale` |
| F-23 | One stage for every menu, changing per act, with scanlines and a CRT bezel; the bezel stays on in play. | `night.js`, `main.js` |
| F-24 | Last place drafts from 4 cards. | `main.js` |
| F-25 | Lounge: "DANCE!" tiles under anyone still for 2.2 s. Blast Ball: goal difference, score or play to place. Echo: land a hit to place above someone who did. | `lounge.js`, `blastball.js`, `echo.js` |
| F-26 | Gun arms and the impact kit in every event; freeze cooldown. | `weapons.js`, `sprites.js`, `fx.js`, all events |
| F-27 | No blink faster than 2.5 Hz in any event. | all events |
| B-01 | Every event (16/16) has a short intro card. | all events |
| — | New sounds: `act` (an act begins), `type` (the Cabinet types), `tick` (a recap line lands). Podium shows each player's card count. Rematch / new players prompts use glyphs. | `audio.js`, `main.js` |

**Measured:** idle-player wins are 0–5% in every event except Dust Lap. A full night with three CPUs reached the recap and podium with no errors, in about 9 minutes including the act screens (I held two act screens and a results screen open for captures). **[A]** Without the held screens a night runs about 8 minutes, at the top of the 5–8 minute target. If it feels long on the couch, the act screens can be skipped with A after 1.4 s.

## Core pass (`m1-2026-11-20.9-core`), by finding
| Finding | What changed | Files |
| --- | --- | --- |
| F-15 | Orbit and Mobius are best-of rounds like Rooftop (first to 2, land a hit to take a round, ghosts and satellites return next round). One escalation per round: Orbit's fire vents wake at 8 s, Mobius's horizon saws speed up at 10 s. HUD shows round pips; "MATCH POINT" appears under the timer. | `src/game/rounds.js` (new, shared), `src/games/orbit.js`, `src/games/mobius.js` |
| F-16 | Wormhole tiebreak: whole seconds held > hits landed > hits taken. | `src/games/wormhole.js` |
| F-17 | Orbit has three arenas: Outpost, Twin Planets, Gas Giant. Gravity, bullets and meteors follow the nearest planet. | `src/games/orbit.js` |
| F-18 | Game-feel kit: `fx.impact` (freeze 35–100 ms by damage, sparks along the hit, contact ring), `fx.ko`, two-layer pitch-varied hit and a heavy `hitBig`, gun arms with recoil and muzzle flash, music adds a hi-hat and octave lead in the last 10 s and at match point. | `src/engine/fx.js`, `src/engine/sprites.js`, `src/engine/audio.js`, the four shooters, `main.js` |
| F-19 | OPTIONS screen (Y on the title, X in pause): EVENTS (Core 9 / All 16), TEXT SIZE (Large = bigger name tags and pop-ups), SCREEN FIT (100/95/90% for overscan), COLOR LOOK, CALM MODE, SCREEN SHAKE, SOUND, MUSIC volume, HOUSE RULES. Title-only rows show "(TITLE ONLY)" in pause. Title join prompt is steady. Keyboard hint only shows when no controller is connected. | `src/game/main.js` |
| F-20 | Shutter wipe between screens (fade in Calm Mode). | `main.js` |
| B-01 (part) | Short intro cards for all 9 core events. | `src/games/*.js` |
| — | Core set: Rooftop, Coin Storm, Tick Tock / Orbit, Lights Out, Mirror Twins / Mobius, Wormhole, Rule Breaker. A shared `registry.js` lists every event once for the game, tests and measurement tool. Timer turns yellow at 10 and red at 5 (steady, no blink). Arena names show for the first 2.5 s of a round, then fade. | `main.js`, `src/game/registry.js` |

**Measured** (details and the full 16-event table in [AUDIT.md](audit/AUDIT.md#pass-3-the-core-pass-build-m1-2026-1120-9-core-branch-qualitycore-pass-2026-11-20)):
- Orbit 10.3 s → 33.2 s per event, idle wins 33% → 0%.
- Mobius 14.5 s → 38.5 s, idle wins 8% → 5%.
- Wormhole idle wins 25% → 5%.
- A full core night with three CPUs: **6.8 min** (was ~4 min; target 5–8).

**Tuning knobs:**
- `makeRounds({ win, max, breakT, cap, time, shield })` in each event's `create()`.
- `VENTS_AT` (Orbit) and `RUSH_AT` (Mobius) set when each round escalates.
- `CORE` at the top of `main.js` chooses the core set.

**Re-measure any time:** open `/tests/measure.html` (add `?runs=30` for more runs).

## Rooftop slice (`m1-2026-11-20.8-polish`), by finding
| Finding | What changed | Files |
| --- | --- | --- |
| F-01 | Rooftop is a best-of: last standing takes the round, first to 2 round wins, at most 5 rounds, 54 s cap. 1.8 s between rounds, 1 s spawn shield. Searchlight at 6 s, water rises from 9 s each round. **Land a hit to take the round.** | `src/games/rumble.js` |
| F-02 | Must-read text on the Rooftop intro, ready strip, results, draft, HUD and pause is scale 2 (≈ 42 px at 1080p). Copy cut to fit. | `src/game/main.js` |
| F-03 | Ready strip (character, name, READY) on every intro. Countdown spotlight (ring + "P1 BRICK") on every event, held into GO. | `main.js` |
| F-04 | Title call to action is steady ("[X] START THE NIGHT"). Only its underline breathes. | `main.js` |
| F-05 | HUD shows round pips + health or OUT. "GHOST" only for sudden-death spectators. A round where everyone fell is explained ("LAST ONE DOWN TAKES IT"). | `rumble.js`, `main.js` |
| F-06 | Draft headers say who and their state (CHOOSING / LOCKED / AUTO-PICKED). The false "PICKS FIRST" is gone. | `main.js` |
| F-07 | Drift moved from a whole-canvas CSS filter to the backdrop and geometry only (`style.js`). CALM default, BOLD optional, WILD keeps the old whole-screen swing as opt-in. | `style.js`, `main.js`, `rumble.js` |
| F-08 | Flash limiter (1 per 0.4 s, ≤ 25%). Calm Mode (B) turns off flashes, shake, drift and decorative motion. Rooftop warnings ≤ 3 Hz. Spawn shield is a ring, not a strobe. | `fx.js`, `rumble.js`, `main.js` |
| F-09 | One glyph component (round face buttons in Xbox colours + letter, pills, stick ring) on the title, intro, ready strip, results, draft and pause. | `style.js` |
| F-10 | Rooftop layers: calm two-depth skyline (no twinkling, no rain), platforms with a fixed bright top edge, hazards the only reds. | `rumble.js` |
| F-11 | Draft input guard 0.35 s. After the first lock, the rest get ≤ 8 s with "WAITING ON P2: 8". A 0.7 s locked beat before leaving. | `main.js` |
| F-12 | Results: three short scale-2 lines. The fine print appears only after event 1. | `main.js` |
| — | New sounds: `round` (round win sting), `lock` (card thunk), `ready` (chirp). | `src/engine/audio.js` |

### Rule change record: Rooftop (F-01)
- **Old:** one life each. Last one standing wins the event. Hazards ran on the event clock (searchlight 11 s, water 25 s).
- **Evidence:**
  - Pass 1 Rooftop ended ≤ 4.5 s.
  - In 20 events with an idle P1 and two CPUs, the average was 10.2 s, the first KO came at 4.0 s, and the idle player won 8/20.
- **New:** best-of rounds as above, plus land-a-hit.
- **Measured** (CPU runs, `?only=rumble` logic driven directly):

| | Old (20 events) | Rounds + hunting searchlight (30, **rejected**) | Rounds + land-a-hit (30, **shipped**) | Shipped, 3 active CPUs (30) |
| --- | --- | --- | --- | --- |
| Avg event length | 10.2 s (5–18.6) | 24.0 s | **24.4 s (14.3–41.8)** | 25.4 s (11.4–41.5) |
| Avg rounds | 1 | 2.7 | **2.7** | 3.1 |
| Idle player's event wins | 8/20 | 13/30 | **0/30** | — |
| Idle player's round wins | — | 32/80 (40%) | **7/80 (9%)** | — |
| Event wins by seat | — | — | — | 11 / 14 / 5 |

- **Rejected experiment:** the searchlight that hunted the least active player made camping *worse* (13/30). One hazard hit per sweep is small next to the damage two fighting players take, so it was removed. Land-a-hit fixes the cause instead: survival without engagement no longer scores.
- **Tuning knobs** (top of `rumble.js`):
  - `WIN_ROUNDS` (2)
  - `MAX_ROUNDS` (5)
  - `TIME` (54)
  - `BREAK` (1.8)
  - `ROUND_CAP` (24)
  - `SPAWN_SHIELD` (1.0)
  - `LASER_FIRST` / `LASER_EVERY` (6 / 8)
  - `FLOOD_AT` / `FLOOD_SPEED` (9 / 5)

  The land-a-hit rule is in `endRound()`.

## Tests and results
| Check | How | Result |
| --- | --- | --- |
| Unit and robot suite | `/tests/` (149 tests: every game, twist, card stack, 2-player, CPU bots, drawing) | **149/149 pass** (three-events build) |
| New-event tests | Spotlight never scores more than elapsed time; Zero Friction is a best-of (2+ rounds, most wins first, ≤ 62 s) and its ghosts stay out; Body Snatch moves every controller to a new body at each swap and gems travel with the player; an idle seat never wins any of the three (6 variants each); core set is 4 per act | pass |
| Night tests | opener/finale order and acts in order (100 playlists); every act 2/3 event names a broken rule and act 1 events don't; all 16 events have a card; winners recorded per event; clock 11 PM → 2 AM; an idle seat never wins Lounge, Blast Ball or Echo (6 variants each); a hit every frame freezes < 35% of the time | pass |
| Core-pass tests | Orbit and Mobius best-of (2+ rounds, most wins first, ≤ 62 s, round pips); their sudden-death ghosts never respawn; all three Orbit arenas run; Wormhole's idle player can't win a tie; impact freeze grows with damage and is capped, no shake in Calm Mode; core set has 3 per act, cards, no repeats; every intro card fits at reading size | pass |
| Core night, normal entry | 3 CPUs, title → podium, default options | ✔ 6.8 min, acts in order, no errors |
| Options | keyboard pad: Y opens, down + right changes TEXT SIZE to LARGE, B closes | ✔ setting saved and applied |
| New tests | Rooftop best-of (2+ rounds, first-to-2 ranks first, ≤ 62 s); sudden-death ghost never respawns; flash limiter + Calm Mode; drift never touches players or hazards and stays inside its amplitude | pass |
| Join, all three seats | keyboard P1 + 2 CPUs | ✔ all active |
| First event start → play | normal entry, `?only=rumble` | ✔ |
| Held A from intro into play | A held through the countdown, P1's vertical speed traced for 40 frames | ✔ no jump, no leak |
| Draft guard | A pressed the frame the draft opened | ✔ ignored |
| Both comeback picks | CPU P2 locked, keyboard P1 browsed then locked | ✔ both applied; "WAITING ON P1" shown; timer cut to 8 s |
| Pause / resume / Calm toggle | Menu → B → B → A | ✔ |
| Controller drop + return | CPU P2's pad removed mid-round, then returned | ✔ CONTROLLER OFF, same seat restored, paused until A, P2's card kept |
| Match result + rematch | full 8-event baseline session | ✔ rematch resets points, powers and tipsy (baseline. The polished flow uses the same code path; not re-run end-to-end) |
| Strongest combo readability | all three with Pinball x2, Splitter x2, Scatter x2, Seeker, Boomstick | HUD, banner, hazards readable (`after_strongest_combo.png`). Busy. See B-04 |
| Performance (script time per fixed step + draw, active 3-player round, this Mac) | `performance.now()` around 600 steps | before median 0.20 ms / p95 0.30. After 0.20 / 0.70. Strongest combo p95 4.0 ms, max 49 ms |
| Before/after captures | `docs/audit/captures/compare_*.png` | lobby, intro, countdown, play, results, draft |

**Coverage gaps:**
- real controllers and the Xbox's Edge
- the 2-player version of the polished flow (it's covered by the robot test, but I didn't look at it)
- sound (not audible here)
- the House Rules prompt on the polished flow (code path unchanged)

## Series X checklist: the night (do this first)
1. Play one full night with all three of you. Don't explain anything beforehand.
2. At the **act 2 screen** ("THE MACHINE WAKES"), does anyone react to "TONIGHT I BREAK: GRAVITY / LIGHT"? Did anyone connect it to the next game?
3. At **2:00 AM**, when the recap lists the night, ask: did that feel planned? That's the moment this build is for. Write down what people say.
4. Do the Cabinet's results lines land, or get in the way? Is the typing blip annoying?
5. Is the night too long? Note the time from title to podium.
6. Last place: did the 4th card get noticed?

## Series X checklist: core pass (add these to the list below)
1. Title: press **Y**. Can everyone read OPTIONS from the couch? Move with the stick and the D-pad, change a value with left/right and A, leave with B.
2. **SCREEN FIT:** if the TV cuts off the HUD or the bottom prompts, try 95% or 90%. Note which one your TV needs.
3. **TEXT SIZE → LARGE:** are the in-play name tags readable now? Does anything overlap?
4. Play **Orbit Outpost** and **Mobius Loop**. Do the rounds feel like a fight rather than a coin flip? Does "MATCH POINT" add tension?
5. **Hits:** does a big hit feel heavier than a small one? Can you see where everyone is aiming (gun arms)?
6. Music: does it get busier in the last 10 seconds and at match point? Too much?
7. Between screens: does the wipe feel quick (it's 0.4 s) or in the way?

## Series X checklist (10 minutes, three controllers)
1. Open the play link. On the title: does "[X] START THE NIGHT" read from the couch? Press **B**: does CALM ON appear? Press B again.
2. Join all three and start. On the Rooftop intro, can each person read the rule line and the danger line without leaning in? Does your column turn green when you press A?
3. Countdown: can each person point at their own character before GO?
4. Play a full Rooftop event. Do you understand why each round ended? Does "NEVER LANDED A HIT" make sense the first time?
5. Round banner: is the backdrop shift toward the winner noticeable but not distracting?
6. Draft: is it clear who is choosing? Does the LOCKED stamp feel final? Did anyone pick by accident?
7. Pause with Menu, toggle Calm Mode with B, resume with A.
8. Turn one controller off mid-round, then back on. Same seat? Same cards?
9. Watch for stutter during the busiest moment. If it stutters, note when.

## Trio session log (your feedback, kept separate from mine)
Make a tick or a note each time it happens. Write the event name.

| Time | Event | Someone asked "what do I do?" | Someone lost track of their character | Waited too long (where?) | Wanted to replay this event | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
| | | | | | | |
| | | | | | | |

## Backlog (prioritised)
| # | Priority | Item | Why | Finding |
| --- | --- | --- | --- | --- |
| B-01 | Done | Short intro card for every event | 16/16 | F-02 |
| B-02 | **Next** | Route every event's backdrop through `drift.col` and its hazards through `P.danger` | Only Rooftop follows the layer rules. The rest have no drift at all now that the whole-screen filter is opt-in | F-07, F-10 |
| B-03 | Done | Best-of rounds on Orbit and Mobius | 33 s / 38 s, idle ≤ 5%. Night 6.8 min | F-13, F-15 |
| B-04 | High | Cap live bullets and particles (and merge explosion rings) under extreme stacks | 4 ms p95 and a 49 ms spike on a Mac. The Series X browser is the unknown. The screen gets busy | perf |
| B-05 | Done (4 shooters) | Gun arms pointing at the aim | Rooftop, Orbit, Mobius, Wormhole. Coin Storm, Lights Out, Mirror Twins still use the old marker | F-18 |
| B-06 | Medium | Raise platform fill contrast vs the skyline (1.22:1 today) | The edge does all the separation work | F-10 |
| B-07 | Medium | Research a third couch reference for controller focus (not done this pass) | The brief asked for one | — |
| B-08 | Done | Last place drafts from 4 cards | Shipped in the night build | F-06, F-24 |
| B-09 | Low | Replace card icon letters (G/B/@) with drawn icons | Personality and scan speed | — |
| B-10 | Low | Button remapping | TEXT SIZE and SCREEN FIT shipped in OPTIONS. Remap (XAG 107) still open | a11y |
| B-11 | Done (fairness) | Laser Lounge idle wins 40% → 5% via the DANCE floor. Still ~14 s with CPUs | F-25 |
| B-12 | Done | Blast Ball idle wins 55% → 5% (goal difference) | F-25 |
| B-13 | Partly | Echo idle wins 30% → 0%. Still ~13 s: rounds would lengthen it | F-25 |
| B-14 | Medium | Updraft: ~7 s per event | Too short to matter. Rounds, or a longer climb | F-21 |
| B-15 | Done | Feel kit and gun arms in every event; calm backdrop drift in Coin Storm, Tick Tock, Mirror Twins, Rule Breaker | F-26 |
| B-16 | Medium | The Cabinet's results lines: more of them, and reacting to cards ("P3 HAS TWO SPLITTERS. OH NO.") | One voice is the thread; it should notice more | F-22 |
| B-17 | Medium | Lights Out, Splat, Blast Ball, Echo, Still Life, Updraft, Dust Lap backdrops through the layer palette (B-02 for the rest) | Most visible remaining inconsistency | F-23 |

## The next three worth building
1. **Play a night on the Series X** with the checklist above. The recap moment is a guess until three people see it.
2. **B-16:** more Cabinet lines, reacting to cards and streaks. Cheap, and it is the thread.
3. **B-13/B-14 + B-17:** rounds for Echo and Updraft, the palette on the remaining backdrops, then promote Lounge and Splat into the core set.
