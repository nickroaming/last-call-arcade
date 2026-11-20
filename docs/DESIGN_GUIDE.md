# Design guide

**Build:** `m1-2026-11-20.10-night` (branch `quality/facelift`), extending `.9-core` and `.8-polish` · **Date:** 2026-11-20
**Code:** shared decisions live in [`src/engine/style.js`](../src/engine/style.js). If you need a colour, text size, button prompt or drift, take it from there instead of hard-coding it.

## 1. Direction: Study A, "calm"
Two studies of the same Rooftop moment ([`captures/study_A_vs_B_rumble.png`](audit/captures/study_A_vs_B_rumble.png)):

| | Study A: CALM (chosen) | Study B: BOLD (kept as an option) |
| --- | --- | --- |
| Drift | ±9° hue, 48 s cycle, ±3% lightness | ±24° hue, 20 s cycle, ±7% lightness |
| Backdrop motion | none | far skyline breathes ±1.5 px, slow motes |
| Reads as | the same bar at a different hour | a light show |

**Why A:**
- **It keeps the night-blue identity.** Players, HUD and hazards sit on a backdrop whose value barely moves, so the value steps between layers (§3) hold all night.
- **It doesn't compete with the game.** Over B's 20 s cycle the whole frame visibly recolours. In busy play that competes with bullets for attention, which was the main reason for the change (F-07, F-10).
- **It leaves headroom for the meaningful moment.** The round-win "kick" pulls the backdrop toward the winner's colour. On a calm base that moment is obvious; on B it gets lost.

**Why B isn't removed:** some nights want more. It's the BOLD colour look (LT on the title, RB in pause). WILD adds the old whole-screen hue swing on top, for people who want it. It's never the default.

## 2. What may move, and what never does
| Layer | Example | Colour | Motion |
| --- | --- | --- | --- |
| L0 Backdrop | sky bands, skyline, moon | **drifts** (`drift.col(c, 'bg')`) | none in CALM. BOLD: slow breathing |
| L1 Arena geometry | platforms, walls | fill drifts at half strength (`'geo'`), **top edges fixed bright** `#b9adff` | only gameplay motion (movers, crumbles) |
| L2 Players | characters, tags, health bars | **fixed** seat colours | gameplay + procedural animation |
| L3 Hazards | saws, searchlight, water, anvils | **fixed** danger red `#ff4a4a` + white | gameplay motion. Warnings ≥ 1 s |
| L4 Feedback | particles, rings, popups | fixed | short (≤ 0.9 s) |
| L5 HUD / UI | top bar, banners, cards | fixed palette roles | UI holds still while you read it |

**Testable limits** (unit-tested in `tests/game-tests.js`):
- **Drift scope:** players, hazards and HUD are never drifted. `drift.col(c, 'player')` returns exactly `c`.
- **Drift size:** the hue offset stays within ±9° (CALM) or ±24° (BOLD). Lightness moves ±3% or ±7%, and only on L0.
- **Clock independence:** the drift clock is decorative. Physics and timers never read it.
- **Event cues:**
  - Round win: `drift.kick(winnerColour)` pulls the backdrop hue 55% of the way, fading over ~2 s.
  - Knockout: `drift.hush()` dims the backdrop ≤ 45%, fading over ~1 s.

## 3. Palette roles (`P` in style.js)
| Role | Hex | Means | Contrast (vs panel `#120f24`) |
| --- | --- | --- | --- |
| `text` | `#f4f1ff` | body text | 16.9:1 |
| `dim` | `#b8b0dc` | secondary text | 9.2:1 |
| `warn` | `#ffd84a` | look here: prompts, focus, timers | 13.6:1 |
| `good` | `#7dff8a` | ready, locked, GO, positive card lines | 14.8:1 |
| `danger` | `#ff4a4a` | this hurts: hazards, negative lines | 5.7:1 |
| `safe` | `#5affd9` | blocking, shields | 15.0:1 |
| Seat colours | `#ff9a2e` / `#33d6ff` / `#ff5fd2` | players only | 8.9 / 10.9 / 7.0:1 |

**Rules:**
- Seat colours appear only on players and their UI.
- Danger red appears only on things that hurt.
- Yellow means "act or look". It never means "good".
- Colour is never the only signal (XAG 103):
  - seats also differ by shape (horns, antenna, spikes), belly pattern and a P-label
  - danger also has motion, a ≥ 1 s warning and a sound
  - ready or locked also has a word

Ratios are WCAG relative-luminance contrast computed from the hex values, not measured on a TV. In Rooftop, the platform top edge vs the near skyline is **8.2:1**, but the platform fill vs the skyline is only **1.22:1**, so the bright edge is what separates "where I can stand". Keep edges on every platform (backlog B-06 raises the fill).

## 4. Type
| Role | Scale | ≈ px at 1080p | Use |
| --- | --- | --- | --- |
| title | 5 | 105 | game name on the intro |
| head | 3 | 63 | screen titles, round banner |
| **body** | **2** | **42** | **minimum for anything a player must read** (XAG 101 asks ≥ 26) |
| fine | 1 | 21 | optional detail only: build ID, tiebreak, card rarity, the "NEXT:" hint |

**Copy rules:**
- Lead with the verb ("LOCK IN", "START THE NIGHT").
- One idea per line.
- The rule fits in two lines.
- Labels are words, not sentences.
- All caps is the pixel font's only case. XAG prefers sentence case; with a pixel font we compensate with size and spacing.

## 5. Layout and focus
- **Safe area:** keep important content inside x 4–316 and y 2–176 (world px). The HUD bar sits at y 0–14.
- **Intro (short card):**
  - name
  - tagline
  - one panel with the rule in two lines
  - one row of controller glyphs
  - one danger line
  - a ready strip with one column per seat
- **Ready strip:** each column shows the character, "P1 BRICK", and either `[A] READY?` or a green READY. The column border turns green when that seat is ready.
- **Focus:** one focused item per player, shown three ways: a yellow border, a `>` marker, and the expanded card. Up and down loop through three cards (XAG 112: linear lists may loop).
- **Ownership:** the draft is split into columns. Each column's header names the player and their state (CHOOSING / LOCKED / AUTO-PICKED). Only that seat's stick and A move it.
- **Input safety:**
  - Draft input is ignored for 0.35 s after the screen opens, so a carried-over press can't pick.
  - Intro ready is ignored for 0.25 s.
  - Every confirm is edge-triggered. A held A never repeats and never leaks into play (verified).

## 6. Component states
| Component | Base | Focus | Selected / locked | Disabled / waiting | Won | Lost / out | Disconnected |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Seat (ready strip) | seat-colour border, `[A] READY?` | — | green border + READY + hop | — | — | — | (pause screen: CONTROLLER OFF + name) |
| Draft card | compact row, dim name | expanded, yellow frame, `>` | green frame, LOCKED stamp, others fold away, `lock` sound | AUTO-PICKED when time runs out | — | — | game pauses |
| HUD seat | name, pips, health % | — | filled pip per round won | — | pips fill | OUT | game pauses |
| Round banner | — | — | "P2 TAKES ROUND 1" in the winner's colour + reason line | "ROUND 2" on reset | backdrop kick | "P1 NEVER LANDED A HIT" | — |
| Glyph | face button in its colour + letter; pill for bumpers and triggers; ring for the stick | — | — | — | — | — | — |
| Options row | label in dim, value in white | panelHi fill, yellow frame, `>` marker, value shown as `< VALUE >`, explanation line at the bottom | `lock` click on change, saved at once | "(TITLE ONLY)" in dim purple, skipped by focus | — | — | game stays paused |
| HUD timer | white | — | — | — | — | — | yellow from 10 s, red from 5 s (steady, no blink); "MATCH POINT" under it when someone is one round away |
| Gun arm | ink barrel + seat-dark core, pointing at the aim | — | recoil pulls it back, muzzle flash on fire | — | — | hidden when out | — |

## 7. Motion and sound
- **Spend juice on meaning.** The bigger the moment, the bigger the effect:
  - Knockout: slow-mo, ring, backdrop hush, `ko`.
  - Round win: banner, backdrop kick toward the winner, ring, `round` sting (new).
  - Card lock: stamp, column fold, `lock` thunk (new).
  - Ready: hop + `ready` chirp (new).
  - Hits stay small.
- **Flashes (XAG 118):**
  - Full-screen flashes are limited to one per 0.4 s and ≤ 25% opacity, and are off in Calm Mode.
  - Large-area blinking stays ≤ 3 Hz. The new searchlight warning is a steady column with a 2.5 Hz pip.
  - The spawn shield is a ring, not a strobe.
- **Calm Mode** (B on the title or in pause) turns off:
  - flashes
  - screen shake
  - colour drift
  - logo wobble
  - countdown pulsing
  - ready hops

  Gameplay is unchanged.

**How to try it:**
- CALM vs BOLD: switch the colour look with LT on the title or RB in pause.
- Calm Mode: press B. Then watch a busy round and a quiet pause, with sound on and muted.

## 8. Game-feel kit (core pass)
One vocabulary for hits, so every event lands the same way:

| Moment | Call | What you get |
| --- | --- | --- |
| A hit | `fx.impact(x, y, { dmg, col, dx, dy })` + `sound.sfx(dmg >= 30 ? 'hitBig' : 'hit')` | Freeze 35–100 ms by damage, white sparks along the hit direction, seat-colour burst, small contact ring, shake (none in Calm Mode). The hit sound is a body thump plus a crack, pitch-varied ±12% |
| A knockout | `fx.ko(x, y, seatColour)` + `sound.sfx('ko')` + `drift.hush()` | 90 ms freeze, slow-mo, two rings, limited flash |
| Firing | set `p.recoil = 1`, draw `drawGun(g, idx, x, y, aim, { size, recoil })` | Arm kicks back, muzzle flash, decays in ~0.2 s |
| A round | `makeRounds(...)` in `src/game/rounds.js` | Rounds, land-a-hit rule, banner with pips, `hudInfo`, `matchPoint`, `leader`, ranking |
| Tension | `game.matchPoint()` / `timeLeft < 10` | Music adds a hi-hat and octave lead; HUD says MATCH POINT |
| Screen change | `go(screen)` | 0.42 s shutter in the event's colour; fade in Calm Mode |

**Rules:**
- **Escalate once per round, with a warning.** A popup plus a sound at least 1 s before (Orbit: "FIRE VENTS AWAKE", Mobius: "THE HORIZON SPEEDS UP", Wormhole: "LAVA IN 3").
- **Arena names are a title card, not decoration.** They show for the first 2.5 s of a round, then fade out of the HUD's way.
- **Bars and tags stay screen-upright**, even on a planet. Rotating UI is unreadable.

## 9. Adaptive UI
- **OPTIONS** is one focusable list. Each row has a reading-size explanation. Rows that would break a match in progress are marked TITLE ONLY rather than hidden.
- **SCREEN FIT** (100/95/90%) shrinks the whole picture for TVs that crop the edges.
- **TEXT SIZE → LARGE** draws in-play name tags, ghost labels and pop-ups at scale 2 (`g.large`, `fx.large`). Screen text is already scale 2 or larger.
- **Prompts follow the device:** the keyboard hint only appears when no controller is connected.
- **Player count:** ready strip, draft columns, HUD and round pips lay out from the number of players (2 or 3).

## 10. The night layer (`src/game/night.js`)
The story frame is a design system too:

| Piece | Rule |
| --- | --- |
| Stage (`drawStage(g, act, t, drift)`) | Every menu: act 0 title/podium (violet + pink), act 1 amber, act 2 cyan, act 3 magenta. Base and bands drift like any backdrop. Two neon tubes in the act accent. Act 3 slips a thin accent slice every ~4 s (not in Calm Mode). |
| CRT (`drawCrt`, `drawBezel`) | Scanlines at 9% on menus; the rounded bezel on every screen, play included. Never over text that matters more than the frame. |
| The Cabinet's voice (`drawVoice`) | Its icon plus one line, typed at 32 characters per second with a `type` blip every other character. Max ~40 characters, scale 2, in the act accent or warn yellow. One voice line on screen at a time. |
| Night strip (`drawNightStrip`) | One slot per event; act accent border; finished slots show the winner's colour; the current slot is framed in white; a thin divider between acts. |
| Clock (`clockAt`) | 11 PM, midnight and 1 AM start acts 1, 2 and 3; events inside an act share its hour; the recap is 2:00 AM. |
| Broken rule (`meta.broken`) | Every act 2 and 3 event names one rule in 1–3 words (GRAVITY, LIGHT, YOUR BODY, TIME, FRICTION, UP AND DOWN, THE PAST, SPACE, WHO YOU ARE, THE RULES). Act 1 events have none, on purpose: the rules are intact. |

**Component states:**
| Component | Base | Focus | Selected / locked | Disabled / waiting | Won | Lost / out | Disconnected |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Night strip slot | dark, act border | current: act fill + white frame | — | future: dark | winner colour bar | — | — |
| Act screen | glitch in (0.6 s), then still | — | `[A] GO ON` after 1.4 s | auto after 6 s | — | — | game pauses |
| Recap row | slides in, one every 0.32 s with a `tick` | — | — | — | winner character + P-label | "RULES INTACT" in dim purple | — |

## 11. Extending to other events
1. Give the event a `meta.card` (`rule`, `rule2`, `keys`, `danger`). The intro switches to the short layout automatically.
2. Draw backdrop colours through `drift.col(c, 'bg')` and platform fills through `'geo'`. Keep edges, players, hazards and UI on fixed colours.
3. Use `P.danger` for anything that hurts, and nowhere else.
4. If the event has rounds or pips, return `hudInfo(seat)` → `{ text, pips, pipMax, warn }`. For an elimination event, use `makeRounds` and you get this for free.
5. Every hazard gets ≥ 1 s of steady warning and a sound.
6. Hits go through `fx.impact`, knockouts through `fx.ko`, and anything with a gun draws `drawGun`.
7. Run `/tests/measure.html`. The event joins the core set when it averages ≥ 20 s and an idle player wins ≤ 15%.
8. If it is act 2 or 3, give it `meta.broken`: the one rule it breaks, in 1–3 words. That line is how the event joins the night's story.
