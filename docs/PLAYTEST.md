# Playtest and backlog

**Build under test:** `m1-2026-11-20.8-polish` (branch `polish/rooftop-slice`). **Compared against:** `m1-2026-11-20.7` (commit `3fcacf5`), kept playable in `before/`.
**Date:** 2026-11-20. **Environment for everything below:** Chromium browser pane on macOS, keyboard P1 + CPU P2/P3. **Nothing here was run on the Series X.**

## Shipped, by finding
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
| Unit and robot suite | `/tests/` (113 tests: every game, twist, card stack, 2-player, CPU bots, drawing) | **113/113 pass** |
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
| B-01 | **Next** | Give every event a short `meta.card` and the scale-2 intro | The other 15 intros still carry scale-1 text (`after_intro_lounge_fallback.png`) | F-02 |
| B-02 | **Next** | Route every event's backdrop through `drift.col` and its hazards through `P.danger` | Only Rooftop follows the layer rules. The rest have no drift at all now that the whole-screen filter is opt-in | F-07, F-10 |
| B-03 | **Next** | Test best-of rounds (or a comparable "second chance") on the other fast shooters: Mobius, Orbit, Updraft | They ended in ~10 s in pass 1. The match ran ~4 min against a 5–8 min target | F-13 |
| B-04 | High | Cap live bullets and particles (and merge explosion rings) under extreme stacks | 4 ms p95 and a 49 ms spike on a Mac. The Series X browser is the unknown. The screen gets busy | perf |
| B-05 | High | Gun arms pointing at the aim on the new characters | Aim is still a 1-pixel dot | — |
| B-06 | Medium | Raise platform fill contrast vs the skyline (1.22:1 today) | The edge does all the separation work | F-10 |
| B-07 | Medium | Research a third couch reference for controller focus (not done this pass) | The brief asked for one | — |
| B-08 | Medium | Comeback balance: give last place something extra (a 4th card or a reroll) | "Picks first" was a false promise. A real one would be better | F-06 |
| B-09 | Low | Replace card icon letters (G/B/@) with drawn icons | Personality and scan speed | — |
| B-10 | Low | Text-size option (200%) and button remapping | XAG 101 scaling, XAG 107 remap | a11y |

## The next three worth building
1. **B-01 + B-02 as one pass:** every event gets the short card and the layer palette. It's mostly data and colour routing, now that the components exist.
2. **B-03:** take the round structure that worked for Rooftop to the other quick shooters, measured the same way (length, idle wins).
3. **B-04:** a bullet and particle budget, decided from the Series X stutter note in checklist step 9.
