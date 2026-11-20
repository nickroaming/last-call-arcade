# Audit and evidence

**Baseline build:** `m1-2026-11-20.7`, commit `3fcacf5` on `main`, clean working tree. Polish work is on branch `polish/rooftop-slice`.
**Environment:** Chromium-based browser pane in the Claude desktop app on macOS. The game was served locally (`python3` static server, caching off) at `http://127.0.0.1:8777/`. Inputs: P1 on the keyboard (simulated key events), P2 and P3 as the game's own CPU players (fake gamepads that go through the same input path). The canvas is 640×360. Captures are lossless canvas PNGs saved to `docs/audit/captures/`.
**Not covered:** the real Xbox Series X, real controllers, real TV distance, sound quality, and the CSS colour drift (captures read the canvas, which is drawn before the browser applies the drift filter). Every "observed" note below comes from this browser environment.

Evidence labels: **[O]** observed in play · **[C]** code inspection · **[A]** assumption or open question.

---

## Baseline session (before any change)

### Pass 1: normal entry point, P1 plays like a person
Join on the title with A (Space), two CPUs added, start with Enter. The playlist came out as Updraft → Ricochet Rooftop → Laser Lounge → Orbit Outpost → Lights Out → Mobius Loop → Wormhole → Echo Chamber, so the act order held. P1's policy moved toward rivals, jumped, aimed and shot, took about 3 s to ready on each intro, and browsed one card before picking.

Measured in game time (screen changes sampled every 0.1 s):

| Stretch | Time |
| --- | --- |
| Start → first input in play (intro read + ready + countdown) | ~5.3 s (intro 2.9 s with all ready, countdown 2.4 s) |
| Each event's fixed overhead (intro + countdown + finish + results + draft) | ~11–13 s |
| Live play per event | Rooftop ≤ 4.5 s (Heavy Metal twist), Updraft ~10 s, Orbit ~10 s, Mobius ~10 s, Lounge ~18 s, Echo ~15 s, Wormhole 34 s, Lights Out 35 s |
| Whole 8-event match, title to podium | ~4 min (brief target: 5–8 min) |
| Podium → rematch intro | 2.5 s (A after the 2 s lock). Rematch resets points, powers and tipsy to 0 ✔ |

Final score 17 / 16 / 15, so the match stayed close. Every player collected 4–5 cards over the night.

### Pass 2: the player who keeps losing (Rooftop only, P1 never moves and never touches the draft)
| Event | Map | Length | First KO | Order |
| --- | --- | --- | --- | --- |
| 1 | Neon Roofs | 7.2 s | 2.2 s | P3, **P1 (idle)**, P2 |
| 2 | Water Tower | 11.7 s | 1.9 s | P3, P2, P1 |
| 3 | Billboard + Heavy Metal | 15.5 s | 12.0 s | P2, **P1 (idle)**, P3 |
| 4 | Crane Yard | 15.2 s | 6.9 s | **P1 (idle) won** |

When P1 skipped the draft, the others waited out the full 15 s and P1 got the highlighted card. P1 drafted in 3 of 3 drafts.

### Join → first comeback pick: what feels unfinished, and why
1. **The lobby sometimes has no call to action.** The start line blinks on and off, so half the frames show none (`before_lobby.png`). On a TV, a blinking line reads as "something is loading".
2. **The intro is a wall of small text.** About 70 words, mostly at the small size, sit in five boxes. The button "chips" are yellow outlined words, not controller buttons. The ready state is a tiny grey "A = READY" at the far right edge, so you can't tell at a glance who is holding things up (`before_05_intro_rumble.png`).
3. **Nothing says "you are this one" when play starts.** The countdown dims the arena and shows the number. Each player's only marker is a 12-pixel "P1" tag (`before_00_countdown.png`).
4. **Rooftop is over before it starts.** The first KO came at ~2 s and the event ended in ≤ 15 s. Its best hazards (searchlight at 11 s, rising water at 25 s) mostly never appear, and standing still is a real strategy in a 3-way last-man-standing.
5. **The finish contradicts itself.** "P3 WINS!" shows while the HUD lists every player, the winner included, as "GHOST", because everyone died and the last to die wins (`before_06_play_rumble.png`).
6. **The draft looks good but says the wrong thing.** "3RD PLACE – PICKS FIRST", but both losers pick at the same time from separate hands, and the important lines are small (`before_04_draft_updraft.png`).

---

## Findings

Severity: **Blocker** (breaks a game night or the TV read), **Major** (felt every event), **Minor**, **Aesthetic**. Status: open / shipped (see the playtest record) / backlog.

| ID | Scene | Severity | Evidence | What happens | Why it matters on game night | Recommendation | Acceptance check |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **F-01** | Rooftop | Blocker (pacing) | [O] pass 1 and 2, `before_06_play_rumble.png` | Event decided in 4–15 s, first KO ~2 s. Hazards at 11 s / 25 s rarely appear. The idle player placed 2nd twice and won once in 4. | The flagship ROUNDS-style event is the shortest thing on screen. One mistake ends your event, and camping is rewarded. | Make Rooftop a short **best-of rounds** event: first to 2 round wins, quick 1.5 s round resets, a spawn shield, hazards timed per round, and the water rising from 9 s into a round to end standoffs. | Event lasts 20–45 s. ≥ 2 rounds per event. Idle player wins < 15% of rounds in CPU runs. |
| **F-02** | Intro, draft, results, title, pause, HUD | Major (readability) | [C] font metrics + [O] captures | Small text (scale 1) is 7 canvas px ≈ **21 px at 1080p**, below the Xbox minimum of 26 px (XAG 101). It carries controls, hazards, card effects, draft instructions and the curse explanation. | Nobody reads it from the couch, so rules get explained out loud or skipped. | Anything a player must read during a night is at scale 2 (≈ 42 px). Cut the copy so it fits. Scale 1 only for non-essential detail (build ID, tiebreak). | No must-read text at scale 1 on the intro, draft or results for the polished event. |
| **F-03** | Intro, countdown | Major | [O] `before_05`, `before_00` | Ready state is tiny grey text. No per-player spotlight at round start. | "Wait, which one am I?" every event, worse with tipsy wobble and lookalike echoes. | Ready strip with each character, a big ✔ and a READY label. Countdown spotlight: ring + name over each player, held through "GO". | Each seat shows character + name + ready state at scale ≥ 2. Spotlight visible for ≥ 1.2 s. |
| **F-04** | Title | Minor | [O] `before_lobby.png` | Start prompt blinks fully off. | A missing call to action reads as loading or broken. | Steady prompt. Only the button glyph pulses. | Prompt present in every frame. |
| **F-05** | Rooftop finish | Major | [O] `before_06_play_rumble.png`, [C] `rumble.rank()` | Winner shown as GHOST in the HUD when all died. | Undermines the win moment and trust in the result. | HUD shows round wins. Simultaneous KOs end the round with "LAST ONE DOWN WINS" explained. | No winner labelled GHOST. |
| **F-06** | Draft | Minor (copy) | [C] `match.offer`, `draftOrder` | "PICKS FIRST" is false: hands are separate and picks are simultaneous. | Players wait for nothing or think 2nd place is penalised. | Say who is picking and that both pick now. Show "WAITING ON P2" when one has locked. | Copy matches the rules. |
| **F-07** | All screens (drift) | Major (identity, a11y) | [C] `main.js trip()` | Colour drift is a CSS `hue-rotate` on the whole canvas. Seat colours, HUD and hazard red all shift, by up to ±12° (Subtle) or ±45° (Wild), plus kicks. | Player identity and danger colours should never move (XAG 103). ROUNDS-style calm comes from drifting only inactive geometry. | Drift only the background and inactive geometry, through a palette function. Players, HUD, hazards and pickups stay fixed. Whole-screen hue stays opt-in as WILD. Add REDUCED MOTION. | Seat colour pixels identical across a drift cycle. Drift ≤ 15° hue, ≤ 6% lightness. |
| **F-08** | All events | Major (photosensitivity) | [C] `fx.flash` callers, blink code | Full-screen white flashes at 0.35 alpha on every KO. Invulnerability blinks at 10 Hz. Several hazard warnings blink at 6 Hz. | XAG 118 fails above ~3 flashes/s over ≥ 20% of the screen. Back-to-back KOs plus a flood can stack flashes. | Cap full-screen flash rate (≥ 0.4 s apart) and alpha (≤ 0.25). Large blinking at ≤ 3 Hz. Reduced motion turns flashes into a border pulse. | Flash limiter unit-tested. No large-area blink above 3 Hz in the polished event. |
| **F-09** | Intro, pause, draft | Minor | [O] `before_05` | Controller prompts are text in yellow boxes. | Players scan for the face-button colour and shape, not a word. | One glyph component: round face buttons in their colour with the letter, pill bumpers and triggers. Used everywhere a prompt appears. | Every prompt in the slice uses the glyph. |
| **F-10** | Rooftop | Aesthetic | [O] `before_06` | The background (lit windows, rain, blinking neon title) competes with platforms of similar value. Platform fill `#2a2548` vs buildings `#1b1640`. | Busy, and "where can I stand?" is slower to read than it should be. | Layer values: background darkest and slow, platforms brightest edges, hazards the only saturated warm colour. | Value steps between layers in the design guide hold in captures. |
| **F-11** | Draft | Minor | [O] pass 2 | An AFK picker makes everyone wait 15 s. | Dead air. | Show who is still choosing. Shorten to 12 s once one picker has locked. | Wait visible and capped. |
| **F-12** | Results | Minor | [O] `before_07` | Curse and pickup rules explained in one long small line after every event. | Repeating fine print every event is noise. | Short scale-2 line only when something changed ("P3 IS NOW BUZZED"). Full rules in the intro of event 2 only. | Results under 25 words of small text. |
| **F-13** | Whole match | Minor | [O] pass 1 | 8 events took ~4 min. | Below the 5–8 min target. Feels over fast for the setup. | F-01 lengthens Rooftop. Revisit other shooters (backlog). | Match 5–8 min in CPU runs. |
| **F-14** | Rooftop | Minor | [O] pass 2 | Ghost anvils keep knocked-out players busy. | Good: no dead air after elimination. | Keep, and carry it across rounds (ghosts come back next round). | — |

### Verification status (build `m1-2026-11-20.8-polish`, 2026-11-20, browser pane, not Series X)
| ID | Status | Check result |
| --- | --- | --- |
| F-01 | Shipped (Rooftop) | 24.4 s avg, 2.7 rounds. Idle player 0/30 events, 9% of rounds (target < 15%) ✔ |
| F-02 | Shipped for Rooftop's intro, ready strip, results, draft, HUD, pause | Other events' intros still scale 1 → B-01 |
| F-03 | Shipped (all events) | Ready strip + countdown spotlight seen in `after_intro_ready.png`, `after_countdown_rumble.png` ✔ |
| F-04 | Shipped | Prompt present every frame (`after_lobby.png`) ✔ |
| F-05 | Shipped (Rooftop) | HUD pips + OUT. Everyone-fell rounds explained ✔ |
| F-06 | Shipped | Headers CHOOSING / LOCKED / AUTO-PICKED ✔ |
| F-07 | Shipped (mechanism + Rooftop) | Unit test: seat and hazard colours never drift ✔. Other events → B-02 |
| F-08 | Shipped | Unit test: flash limiter + Calm Mode ✔ |
| F-09 | Shipped on shared screens | ✔ |
| F-10 | Shipped (Rooftop) | Platform edge 8.2:1 vs backdrop. Fill 1.22:1 → B-06 |
| F-11 | Shipped | Guard and wait text verified ✔ |
| F-12 | Shipped | ✔ |
| F-13 | Partly (Rooftop longer) | Whole-match length not re-measured → B-03 |
| F-14 | Kept, and ghosts return each round | ✔ |

### Pass 3: the core pass (build `m1-2026-11-20.9-core`, branch `quality/core-pass`, 2026-11-20)
Goal from the brief: make the game feel higher end. Method: measure every event the same way, keep the ones that pass a written bar, and bring the weakest of those up to Rooftop's level instead of adding more events.

**Event health** ([`tests/measure.html`](../../tests/measure.html), CPU players only, 20 runs each with seat 1 idle plus 10 runs with all three active; same browser pane as above):

| Event | Act | Before: avg s | Before: idle wins | After: avg s | After: idle wins | Core? |
| --- | --- | --- | --- | --- | --- | --- |
| Ricochet Rooftop | 1 | 28.2 | 0% | 29.3 | 0% | ✔ |
| Coin Storm | 1 | 30.8 | 0% | 30.8 | 5% | ✔ |
| Tick Tock | 1 | 22.3 | 0% | 21.9 | 0% | ✔ |
| Orbit Outpost | 2 | **10.3** | **33%** | **33.2** | **0%** | ✔ (fixed) |
| Lights Out | 2 | 35.8 | 0% | 35.8 | 0% | ✔ |
| Mirror Twins | 2 | 47.5 | 0% | 47.5 | 0% | ✔ |
| Mobius Loop | 3 | **14.5** | 8% | **38.5** | 5% | ✔ (fixed) |
| Wormhole | 3 | 51.2 | **25%** | 52.4 | **5%** | ✔ (fixed) |
| Rule Breaker | 3 | 51.2 | 0% | 51.2 | 0% | ✔ |
| Dust Lap | 1 | 56.0 | 17% | 56.0 | 15% | extra |
| Laser Lounge | 1 | 14.7 | 33% | 14.0 | 40% | extra |
| Blast Ball | 1 | 51.2 | 50% | 51.2 | 55% | extra |
| Splat City | 1 | 32.8 | 0% | 32.8 | 0% | extra |
| Updraft | 1 | 6.6 | 0% | 6.9 | 0% | extra |
| Echo Chamber | 3 | 13.4 | 17% | 12.6 | 30% | extra |
| Still Life | 2 | 51.2 | 0% | 51.2 | 0% | extra |

"Before" used 12 runs, "after" 20. Idle-win swings of ±10% between the two columns on untouched events are noise at these sample sizes. **The bar:** at least 20 s of play, idle player wins ≤ 15%, a short intro card, three per act. Splat City and Still Life pass the numbers but were left out to keep three per act; they stay one switch away (OPTIONS → EVENTS → ALL 16).

**Whole night (core set, three CPUs, normal entry):** Rooftop → Tick Tock → Coin Storm → Lights Out → Orbit → Mobius → Rule Breaker → Wormhole, **6.8 min** title to podium (was ~4 min, target 5–8). Acts stayed in order. No errors.

| ID | Scene | Sev. | Evidence | What happens | Why it matters | Change | Check | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **F-15** | Orbit, Mobius | Major (pacing, fairness) | [O] measure table | One life each: over in 10–15 s, and a player who never moved won 8–33%. | The two most distinctive shooters were the shortest and least fair things in the night. | Shared best-of rounds (`src/game/rounds.js`) with the land-a-hit rule; hazards on the round clock with one escalation per round (Orbit: fire vents at 8 s; Mobius: horizon saws speed up at 10 s). | ≥ 20 s, idle ≤ 15%, ≥ 2 rounds | Shipped ✔ (33.2 s / 0%, 38.5 s / 5%) |
| **F-16** | Wormhole | Major (fairness) | [O] 25% idle wins, [C] `rank()` | When nobody held the orb long, "took fewer hits" decided it, so hiding won. | Rewards the opposite of the verb. | Tiebreak: whole seconds held > hits landed > hits taken. | idle ≤ 15% | Shipped ✔ (5%) |
| **F-17** | Orbit | Minor (levels) | [C] one hard-coded planet | Every visit looked and played the same. | No reason to look forward to it twice in a night. | Three arenas: Outpost, Twin Planets (gravity switches to the nearest planet), Gas Giant. | All three run (unit test) | Shipped ✔ |
| **F-18** | All shooters | Major (feel) | [C] `fx.stop(0.03)` everywhere, one `hit` sound, aim = 1-px dot | Every hit felt the same; you couldn't see where anyone pointed. | Hits are the core verb; they should read and land. | Shared kit: `fx.impact` (35–100 ms freeze by damage, directional sparks, contact ring), `fx.ko`, two-layer pitch-varied hit + `hitBig`, `drawGun` arm with recoil and muzzle flash. | Unit test on the freeze; visual check | Shipped (Rooftop, Orbit, Mobius, Wormhole) |
| **F-19** | Title, pause | Major (UI) | [O] `after_lobby.png` | Five settings on five shortcut buttons in one line of scale-1 text. Empty seats' "PRESS A" blinked fully off. | Nobody can read or find them from the couch, and a stray LB mutes the game. | One OPTIONS screen (Y on the title, X in pause): focus, value arrows, a reading-size explanation per row, locked rows marked. Adds EVENTS, TEXT SIZE, SCREEN FIT and MUSIC. Steady join prompt. | Opened, changed, closed with keyboard pad ✔ | Shipped |
| **F-20** | Every screen change | Minor (polish) | [O] | Hard cuts between title, intro, results and draft. | Cuts read as unfinished. | A 0.42 s shutter wipe in the event's colour; a plain fade in Calm Mode. | Seen mid-wipe (`core_wipe_mid.png`) ✔ | Shipped |
| **F-21** | Lounge, Echo, Blast Ball, Updraft | Major (for those events) | [O] measure table | Idle wins 30–55% (Lounge, Echo, Blast Ball); Updraft lasts ~7 s. | Would fail the bar. | Out of the core set until fixed (backlog B-11 to B-14). | — | Backlog |

**Performance** (same pane, `performance.now()` around each fixed step + draw, 600 steps per arena, active 3-player Orbit): median 0.3–0.4 ms, p95 0.7–1.7 ms. Every arena showed one ~41 ms step about every 1.2 s. It also appears when **only drawing** a still screen, and the old build shows more of it (22 spikes, max 67 ms, on its title screen), so it is the hidden browser pane's canvas flush, not game code. **[A]** The real Series X frame pacing is still unmeasured.

### Pass 4: the night (build `m1-2026-11-20.10-night`, branch `quality/facelift`, 2026-11-20)
Goal from the brief: a facelift for the whole game, the audit's open items, and a concept you can feel ("that ah-ha moment when I realize this game was really well crafted").

| ID | Scene | Sev. | Evidence | What happens | Why it matters | Change | Check | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **F-22** | Whole night | Major (identity) | [O] captures, [C] the Cabinet appears nowhere in code | The story frame (a cabinet that wakes and breaks rules) exists only in the design doc. Players see unrelated minigames. | Without a thread, a party game feels like a pile of prototypes. | The night layer (`src/game/night.js`): the Cabinet on the title, act break screens, the night clock and strip, a broken rule on every act 2 and 3 card, results quips, an end-of-night recap. The night opens with Rooftop and ends with Rule Breaker. | Full night with CPUs reaches the recap; unit tests for order, clock, winners | Shipped |
| **F-23** | Menus | Minor (polish) | [O] | Each menu had its own striped background. | No shared look. | One stage per act (amber → cyan → magenta), scanlines and CRT bezel. | Captures | Shipped |
| **F-24** | Draft | Major (fairness promise) | backlog B-08 | Last place got the same three cards as second. | The comeback promise was copy only. | Last place gets a 4th card; "LAST PLACE GETS A 4TH CARD" on open; "+1" in their header. | `night_draft_4cards.png` | Shipped |
| **F-25** | Lounge, Blast Ball, Echo | Major (fairness) | [O] measure table | An idle player won 30–55%. | Rewards not playing. | Lounge: the floor heats up under anyone still for 2.2 s ("DANCE!"). Blast Ball: goal difference, and you have to score (or at least play) to place above someone who did. Echo: a survivor who never landed a hit ranks below everyone who did. | Idle wins: Lounge 40% → 5%, Blast Ball 55% → 5%, Echo 30% → 0%; unit test with an idle seat | Shipped |
| **F-26** | All events | Major (feel) | [C] | Seven events still had the 1-px aim dot and the flat hit. | Inconsistent feel across the night. | Guns record aim and last shot (`weapons.js`), so `drawArm` gives every event gun arms with recoil. Every hit goes through `fx.impact`. The freeze now has a cooldown (≤ ~30% of time under constant hits) so stacked powers can't stall a game. | Unit test: a hit every frame freezes < 35% of the time | Shipped |
| **F-27** | Many events | Major (photosensitivity) | [C] `Math.floor(t * 10..20) % 2` | Warnings and invulnerability blinked at 5–10 Hz. | XAG 118 asks ≤ 3 Hz for large blinking. | All blinks in events are 2.5 Hz. | grep: none faster | Shipped |
| **F-28** | Updraft | Minor (pacing) | [O] 6.9 s | Over before anyone climbs. | — | A 4 s teach beat, then a gentler rise. | 6.9 s → 11.1 s with CPUs | Partly: **[A]** the CPU can't really climb, so human length is unmeasured |

**Event health after pass 4** (20 runs each, same method; length / idle wins): Rooftop 29.3 s / 0%, Coin Storm 32.9 / 5%, Tick Tock 22.3 / 0%, Orbit 28.0 / 0%, Lights Out 38.4 / 0%, Mirror 50.2 / 0%, Mobius 39.7 / 0%, Wormhole 52.9 / 0%, Rule Breaker 54.9 / 0%, Lounge 13.8 / **5%**, Blast Ball 54.2 / **5%**, Echo 13.5 / **0%**, Splat 36.1 / 0%, Still Life 55.7 / 0%, Updraft 11.1 / 0%, Dust Lap 56.0 / 25%.

**[A]** Dust Lap's 25% is likely the CPU driver crashing more than an idle car sitting still; it needs a human race to judge. Lounge, Echo and Updraft are still short with CPUs.

### Pass 5: three new events (build `m1-2026-11-20.11-three`, branch `events/three-more`, 2026-11-20)
Built to the bar from the start: a short card, a broken rule (acts 2 and 3), the feel kit, the layer palette, ≥ 20 s and idle wins ≤ 15% in `measure.html`. Results: Spotlight 56 s / 0%, Zero Friction 53 s / 0%, Body Snatch 55 s / 0%. Design notes and the tuning record are in [PLAYTEST.md](../PLAYTEST.md#three-more-events-m1-2026-11-2011-three).

| ID | Scene | Finding | Change | Status |
| --- | --- | --- | --- | --- |
| **F-29** | Zero Friction | **[O]** CPU players slide off on their own, so rounds lasted ~5 s | Edge wobble (0.7 s save window); CPU steers against its slide | Shipped |
| **F-30** | Rounds (Orbit, Mobius, Zero Friction) | **[O]** If nobody landed a hit, the round still went to a survivor; the final tie went to whoever survived longest | No hit: nobody takes the round. Tiebreak: wins > hits landed > played > survival | Shipped |
| **F-31** | Body Snatch | **[O]** "SWAP IN" sat inside the arena and was covered when bodies were near the top | The swap clock owns a strip under the HUD; the arena starts below it | Shipped |
| **F-32** | Spotlight | **[O]** An idle player could win if the light started on their spawn | First light never on a spawn; standing still in the light for 2 s gets booed | Shipped |
| **[A]** | Body Snatch | Finding yourself after a swap is the hardest read in the game. The ring, tag, arrows and "P1: BLOOP" popup help on a laptop; the TV test decides | — | Open |

### Matched before / after
| Screen | Sheet | What to look at |
| --- | --- | --- |
| Lobby | `captures/compare_lobby.png` | Steady "[X] START THE NIGHT". Calm setting visible |
| Intro | `captures/compare_intro.png` | ~70 words of small text → two rule lines, four glyphs, one danger line, ready strip |
| Countdown | `captures/compare_countdown.png` | Tiny P-tags → ring + name on every player |
| Play | `captures/compare_play.png` | Busy backdrop → calm layers. "P3 WINS" with everyone GHOST → round banner with pips |
| Results | `captures/compare_results.png` | Two small fine-print lines → three readable lines |
| Draft | `captures/compare_draft.png` | Three equal small cards → one expanded focus card, LOCKED stamp, "WAITING ON P1" |
| Studies | `captures/study_A_vs_B_rumble.png` | CALM vs BOLD drift at the peaks of each cycle |
| Orbit intro (core pass) | `captures/compare_core_orbit_intro.png` | Small text boxes → short card |
| Orbit play (core pass) | `captures/compare_core_orbit_play.png` | One life → rounds with pips and MATCH POINT, gun arms, upright health bars |
| Mobius (core pass) | `captures/compare_core_mobius.png` | Strobing horizon → calm line; round banner explains a land-a-hit decision |
| Title (core pass) | `captures/compare_core_title.png` | Tiny settings line → OPTIONS prompt; steady join prompt |
| Title (night) | `captures/compare_night_title.png` | Neon sun → the Cabinet types the premise |
| Intro (night) | `captures/compare_night_intro.png` | "EVENT 4 OF 8" → clock + night strip |
| New screens (night) | `captures/night_new_screens.png` | Act break and the end-of-night recap |

### Assumptions and open questions
- **[A]** Text size math assumes the 640×360 canvas fills a 1080p TV (Edge full screen). If Edge shows its address bar, the game is a little smaller still.
- **[A]** Real players will last longer than CPUs, which shoot almost constantly. Rooftop may run ~1.5× longer with people, which is still short.
- **[A]** The CSS drift filter's real cost on the Series X is unknown. If it's expensive, the layer drift will also be faster.
- **Open:** does anyone in the trio have colour vision differences? That decides how hard to lean on shape and pattern.

---

## Reference notes
| Source | What it says or shows | Our problem | Decision |
| --- | --- | --- | --- |
| [XAG 101 Text display](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101) | Console minimum text 26 px at 1080p (52 px at 4K), measured on body height. Button glyph text counts. | F-02 | Must-read text at scale 2 (≈ 42 px). Scale 1 (≈ 21 px) only for optional detail. |
| [XAG 102 Contrast](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102) | 4.5:1 for standard text and important elements, 3:1 for large. Measure against the busiest background. | F-02, F-10 | Text sits on solid panels. Arena text gets a dark backing. |
| [XAG 103 Additional channels](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103) | Colour alone must never carry information. Critical cues also need sound or haptics. | F-03, F-07 | Seats keep shape + pattern + label. Every state change has a sound. Drift never touches seat colours. |
| [XAG 112 UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112) | Predictable focus. Consistent prompts across screens. Linear menus may loop. | F-09, draft | One glyph component. Draft focus loops up and down. |
| [XAG 118 Photosensitivity](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/118) | Fails above ~3 flashes/s or ~20% of the screen. Saturated red flashes count separately. | F-08 | Flash limiter. Big blinks ≤ 3 Hz. Reduced-motion mode. |
| [ROUNDS press kit](https://landfall.se/rounds-press-kit) and [Steam page](https://store.steampowered.com/app/1557740/ROUNDS/) | 1v1. "Each round gets more intense". The loser of each round unlocks upgrades. 65+ power-ups. Press media: an animated GIF and 5 round screenshots. No art-style statement. | F-01, F-07 | Keep rounds short but make an event several rounds, so losing a round is a beat, not the end. Visual restraint is my reading of those images, not a confirmed technique. **I could not watch gameplay footage here**, so no timestamps: video wasn't viewable in this environment. |
| [8Bit Fiesta Steam page](https://store.steampowered.com/app/382260/8Bit_Fiesta_The_Drinking_Game/) | Local multiplayer with a built-in, optional drinking game. The page gives no minigame count or round length. | House Rules | Keep House Rules optional and skippable, with scores independent of them (already true). |
| [Juice It or Lose It (GDC Europe 2012)](https://www.gdcvault.com/play/1016487/juice-it-or-lose) | Vault page only: small feedback tricks layered onto a plain game. No written technique list was reachable. | F-08, KO moment | Spend juice on meaning: biggest effect on a round win, smaller on hits, none on idle. Juice must clarify cause → effect. |

The third couch reference the brief asks for (one that handles controller focus well) was **not researched**. That's in the backlog.
