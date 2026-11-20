# Last Call Arcade: creative direction

The master overview: what the game is, why it's mind-bending, how one night plays from title to podium, and the rules every screen, character and minigame follows. When a new idea doesn't fit this page, either the idea changes or this page does, on purpose.

---

## 1. The one-line pitch
**After last call, the bar's arcade cabinet wakes up and starts rewriting its own rules, and the drunker the winner gets, the weirder it gets.**

Three friends on one couch and one TV. A night is 8 short events, 5–8 minutes in all. The night starts as a normal party game and ends somewhere impossible.

## 2. The world (the story frame)
- **The Cabinet** is the only character with no face. It's the "house": it picks the events, deals the cards, hands out the Winner's Curse and announces twists. Its voice is the on-screen copy: short, deadpan, a little smug. ("THE MIRROR IS CHANGING...", "TIME IS SLIPPING", "NOTHING HAPPENS.")
- **The players** are three little regulars who live inside the machine: **BRICK** (P1, square, orange), **BLOOP** (P2, round, cyan) and **SPIKE** (P3, spiked, pink). Each is recognizable by **shape first** and color second, so colorblind players are never lost.
- **The bar** is the neon backdrop that turns more psychedelic over the night through color drift, twists and the curse.

### The three acts of a night
| Act | Events | Feel | Games |
| --- | --- | --- | --- |
| **1. Warm-up** | first ~40% | Normal physics, learn the gun, trash talk | Ricochet Rooftop, Dust Lap, Laser Lounge, Coin Storm, Blast Ball, Splat City, Tick Tock, Updraft |
| **2. The machine wakes** | next ~25% | One rule is off: gravity, light, mirrors, time | Orbit Outpost, Lights Out, Mirror Twins, Still Life |
| **3. Last call** | final events | Space and logic break | Mobius Loop, Echo Chamber, Wormhole, Rule Breaker |

**Built:** each game has a `tier` (1, 2 or 3), and the playlist deals events in act order. You always start grounded and finish in the weird stuff, but which games show up still changes every night.

## 3. What makes a game mind-bending (research → our rules)
Lessons taken from the games that do this best, turned into rules we follow. We borrow **mechanics** only, never names, characters, art or levels.

| Source | What it does | Our rule |
| --- | --- | --- |
| Portal | Teaches one skill alone with few distractions, then reinforces it. Momentum through portals was the part playtesters loved most, so the designers leaned into flinging. | **Break exactly one rule per game** and keep everything else normal. The first 5 seconds of every mind-bender are a quiet "teach beat". Momentum is the payoff (Wormhole). |
| Baba Is You | Rules are physical blocks you push. Objects have no meaning except what the rules say. | **Make the rule visible and physical.** If a rule changes, it's on screen as a thing, not a hidden number (Rule Breaker, the Mirror Twins label, the Echo loop bar). |
| Superhot | Time moves only when you move, so your body becomes the clock. | **The player causes the weirdness.** Best when the twist comes from what *you* did: your echoes, your movement, your portals. |
| Echo Chamber (ours) | Your past self is the obstacle. | **You vs. you.** A mistake you made 5 seconds ago comes back to hurt you, and it's funny every time. |
| Mobius / non-Euclidean games | Space connects in ways that shouldn't work, but the logic is consistent. | **Impossible but consistent.** The same edge always does the same thing. Players can learn it in one try. |

### The six pillars (checklist for every new game)
1. **One broken rule.** Say it in one sentence, or the game isn't ready.
2. **Readable from the couch.** The twist shows up on the TV at 3 meters away: a color, a shape, a label. Never just a number.
3. **3-second teach beat.** The intro card says the rule. The first seconds are safe enough to try it.
4. **The turn.** Around 25–30 s every game escalates once: faster echoes, saws speeding up, a mirror warning, rules locking in.
5. **Comeback-safe.** Losers get pickups at 2x and draft first. Every mechanic must leave room for a lucky swing.
6. **Short.** 45–55 s max. Leave them wanting the next one.

## 4. Storyboard: one night, screen by screen
```
[TITLE]  neon sign, three regulars bob on stools. "PRESS A TO JOIN".
   │      RT adds a CPU, so one person can always play.
   ▼
[INTRO CARD] event number + act name · game name in its color · tagline
   │      ONE-sentence rule (big) · controls (left) · dodge + "when out" (right)
   │      each player readies with A. Twist shown here if any.
   ▼
[COUNTDOWN] 3-2-1 over the live arena: the teach beat starts here
   ▼
[PLAY]  HUD: P1 · timer · P2 · P3 along the top, one status word each
   │      one big popup at a time (the Cabinet's voice) · the turn at ~25 s
   ▼
[FINISH] slow-mo on the deciding moment, then the "WINNER" stamp
   ▼
[RESULTS] 3/2/1 points fly to the podium bars
   ▼
[WINNER'S CURSE] the winner gets tipsier (optional sip prompt with House Rules)
   ▼
[DRAFT]  last place picks first: 3 cards, each with +/- lines and where it
   │      applies in the NEXT game. The winner gets nothing.
   └──► next INTRO CARD (act changes get a banner: "THE MACHINE WAKES")
...after the last event:
[PODIUM] confetti, trophies, rematch with A
```

### Storyboard beats per act
- **Act 1 frames:** bright rooftops and arenas, stable camera, color drift at its quietest. Players learn: jump, shoot, block, bounce.
- **Act 2 frames:** the frame itself starts to lie: a mirror down the middle, a dark room, a planet. The intro card shows a small "THE MACHINE WAKES" tag.
- **Act 3 frames:** split skies, the playfield wrapping on itself, echoes and portals. Color drift and twists are at full strength. The intro tag reads "LAST CALL".

## 5. The new act 3 and act 2 games
| Game | The one broken rule | Teach beat | The turn |
| --- | --- | --- | --- |
| **Wormhole** | Your shots punch holes in walls. Enter one hole, exit your other, keeping your speed. | First 5 s: no orb yet, just play with holes. | 25 s: the floor turns to lava, so you have to fling. |
| **Rule Breaker** | The rules are word blocks on the floor. Push words into the sentences to change the game. | Starts with "STICK IS NORMAL" and the words close by. | 30 s: the sentences lock one by one. Last chance to rig them. |
| **Still Life** | Time only moves when somebody moves. Stand still and the bullets freeze. | First seconds: one slow turret, so you can feel time stop. | 25 s: more turrets, and time can't drop below 30%. |

## 6. Characters (art direction)
Goal: **round, bouncy, expressive, ROUNDS-like.** Smooth shapes drawn at full screen resolution, not 8-bit sprites.

- **Bodies:** smooth filled shapes with a dark outline, a lower shade and a highlight. BRICK is a rounded square, BLOOP a circle and SPIKE a circle with three spikes. The shape is the identity.
- **Face:** two big eyes with pupils that look where the player is moving or aiming. They blink every few seconds, at different times for each player. Getting hit flashes white with squinted eyes.
- **Motion (procedural, no frame art):**
  - Idle: a slow breathing bob.
  - Walk: little feet alternate, and the body leans into the run and bobs with each step.
  - Jump and land: stretch going up, squash on landing (already driven by the physics).
  - Speed: the faster you go, the more you lean.
- **Ghosts and echoes:** the same character at low opacity, so you always know whose past it is.
- **Rules:** never rely on color alone. Every on-screen player has a shape and a P-tag.

## 7. UI system
- **Canvas:** 320×180 world units at 2x (640×360), scaled to the TV. Keep a 5% safe margin for TV overscan: nothing important in the outer 8 px.
- **Type scale (pixel font):** scale 3 for game names and the big stamp, scale 2 for the Cabinet's announcements and the timer, scale 1 for labels and HUD details. No more than one scale-3 line on screen at once.
- **Color roles:**
  - Seat colors only for players.
  - Yellow `#ffd84a` means "look here / warning".
  - Red `#ff5a5a` means "this hurts".
  - Mint `#5affd9` means "safe / block".
  - Each game owns one accent color (its title color), and that accent tints its UI.
- **HUD:** always the top strip: P1 left, timer center, P2 and P3 right, one short status each ("63%", "4 GEMS", "HOLDING 12s").
- **Popups:** the Cabinet speaks with one center popup at a time, at most about a second. Player-local popups (+1, BLOCKED!) stay small and near the player.
- **Warnings:** every hazard blinks yellow for at least 1 second before it hurts. No unfair surprises.
- **Motion:** UI never moves while you need to read it. Cards slide in, then hold.
- **Controller-only:** every screen works with A to confirm and the stick to move. No mouse cursor, ever.

## 8. Audio direction
Chiptune themes per game family. The SFX vocabulary stays consistent everywhere: "warn" means a hazard is coming, "boing" means a rule changed, "ko" means a player is out. Act 3 games reuse the darker themes.

## 9. Status
| Area | Built | Next |
| --- | --- | --- |
| Three acts (tiered playlist) | ✔ | Act banner on the intro card |
| Six pillars applied to the new games | ✔ Wormhole, Rule Breaker, Still Life | Retrofit a clear "turn" into every act 1 game |
| Smooth animated characters | ✔ shape identity, eyes, blink, walk, lean, squash | Gun arms pointing at the aim |
| UI system | Mostly in place | Audit every screen against the type scale and safe margin |
| Real-world test | Not yet | Xbox couch session: can everyone say each game's rule after one play? |

**Sources:** [Portal post-mortem (GDC 2008)](https://cdn.fastly.steamstatic.com/apps/valve/2008/GDC2008_PortalPostMortem.pdf) · [Kim Swift on design lessons](https://gamedeveloper.com/design/10-years-of-design-lessons-from-em-portal-em-s-kim-swift) · [Portal developer commentary](https://theportalwiki.com/wiki/Portal_developer_commentary) · [Designing Baba Is You's rule system](https://www.gamedeveloper.com/design/designing-i-baba-is-you-i-s-delightfully-innovative-rule-writing-system) · [Baba Is You (Wikipedia)](https://en.wikipedia.org/wiki/Baba_Is_You) · [Superhot's origin](https://www.gamedeveloper.com/disciplines/the-origin-and-future-of-frozen-time-fps-hit-superhot-and-the-positive-crunching-behind-it)
