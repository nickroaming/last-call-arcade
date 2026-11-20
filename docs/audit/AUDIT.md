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
