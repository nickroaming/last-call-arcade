# Last Call Arcade
## Project brief for Claude Code

Act as the lead game designer and developer. Build an original couch party game for Nick and two friends on one retail Xbox Series X and one TV. All three need to play simultaneously with their own Xbox controllers. Take ownership of the design and implementation. Make routine design decisions yourself and use the milestone results to revise the plan. The working title is Last Call Arcade. You can change it.

### What we want

8Bit Fiesta is our reference for rapid changes in rules, chunky pixel art, short competitive minigames, and a game night where people can talk and laugh between rounds. Rounds is our reference for the best part of losing. You get a choice of absurd powers that stack into combinations. Create original minigames, characters, art, sounds, upgrade names, and arenas.

The previous prototype was a single overhead ringout arena. Its rule that both eliminated players can earn powers is worth keeping. The sequel should feel like a collection of little arcade games that affect each other through the upgrades. Give each event distinct movement, objectives, and screen composition. Include a short race for the friend who likes racing. Keep all three people involved until the end of most events.

### Milestone 0. Prove three controllers on the Series X

First, deliver a small HTTPS test page that anyone with its link can open in Xbox Edge without signing into a development workspace. Use a fresh deploy or local infrastructure that the owner authorizes. Keep personal data and credentials out of the page and source. A plain controller screen is enough for this milestone. The existing prototype can be a quick preliminary signal if Nick already has access to it.

Show three seats with live button and stick indicators. Require A to join each seat, then run a 30 second test with all three pressing and holding actions at the same time. Check that the browser assigns stable separate inputs, all three can move and act simultaneously, a reconnect restores the right seat, and controller input in play does not accidentally navigate the browser. Make the screen report PASS or FAIL and show which seat failed. Provide a controller-only path through join, pause and resume.

Only Nick or someone at the console can verify physical hardware. Give them the test URL and a short checklist. Save what was tested, the Xbox browser or build version if available, and the result. Desktop or simulated gamepads can verify the code before that handoff.

If the real Edge test passes, use the web build for the first game night. A reasonable starting stack is TypeScript, Phaser, and a static HTTPS host. Keep the match logic independent of Phaser and put gamepad joins, seat ownership, and reconnect behavior behind a small input adapter.

If Edge fails, inspect the actual failure before committing to a new stack. For private play, evaluate a small Windows UWP test package using Windows.Gaming.Input and deploy it on the retail Series X in Developer Mode. Prove three physical controllers in that package before choosing the rendering stack. This route needs a Windows build environment and access to the console. Keep it a separate build decision from any future Xbox Store release. For a store release, review Microsoft’s current ID@Xbox onboarding and GDK console requirements. A desktop build or an engine’s Windows export does not establish Series X support.

### Milestone 1. Build one complete game night loop

Ship a match that takes five to eight minutes. Start with six events, with each of the three launch minigames played twice in a shuffled rotation that avoids back to back repeats. Aim for 20 to 40 seconds per event. Show the objective and controls on one interstitial, then run a brief countdown. Allow a short pause between events and a rematch with the same controller assignments. Use a shared screen for the three launch games.

Suggested launch lineup. Prototype the controls before spending time on art.

1. Dust Lap. Shared overhead sprint on a compact desert track. Auto throttle, stick to steer, A to drift. Gate checkpoints enforce the course and keep scoring clear. A bump or wrong turn costs time. Everyone stays in the race.
2. Cratequake. Carry crates to your own deposit zone. A grabs or throws. A thrown crate can knock cargo out of a rival’s hands. Everyone can respawn quickly. The highest haul at the horn wins.
3. Neon Knockout. Side view brawler on short platforms with collapsing edges. A jumps and X fires a shove pulse. On elimination, the player can trigger one announced stage hazard while the survivors finish. Keep the wait short and show where the hazard will hit.

Give first, second, and third 3, 2, and 1 match points. Use published event tiebreakers if a ranking is ambiguous. Second and third each draft one of three visible powers after every event except the last. Start with third place so they get first pick if you use a shared pool. A knockout sends that player to the draft after the event, without stopping the other players. Show each power's effect in the next event on its card. Stack upgrades between events and reset them on rematch. Start with a two stack cap per power and adjust it after playtesting. Use a short pick timer, with a visible default option. If the match is tied, run one short sudden death event for the tied players. Give any third player a limited hazard role for that event.

Give each power a tangible effect in each launch game. Here are four examples to prove combinations early.

| Power | Dust Lap | Cratequake | Neon Knockout |
| --- | --- | --- | --- |
| Aftershock | Drift exit leaves a brief, visible bump wave | Throws send out a short shove wave | A shove pulse creates a delayed second pulse |
| Airbag | Ignore the first meaningful bump | Keep your cargo after the first hit | Block the first shove |
| Ricochet | Wall bumps give a small forward boost with a cooldown | Thrown crates bounce once off walls | Shove pulses bounce once off walls |
| BigFoot | Your bump area grows and turns get slightly wider | Larger thrown crates push harder | Shove pulses grow wider |

Prototype Aftershock plus Ricochet together. It should change what rivals do and remain readable on the TV. Scale effects separately per game so a strong draft does not decide the next event in advance. Add more powers only after the first four feel distinct with a full group.

### Art, sound, and game night pacing

Use original chunky pixel sprites and backgrounds. Start with a 320 × 180 virtual canvas, nearest neighbor scaling, and pixel alignment for sprites. Give the three characters strong silhouettes, big player numbers, and patterns so they are easy to follow without relying on color. Use bright foreground effects and darker environments. Build motion into the game with hit flashes, dust, anticipation before hazards, and short win stingers. Keep screen shake adjustable. Check that the timer, score and button prompts read from a couch.

Make each minigame look like its own arcade cabinet. A dusk desert track, a warehouse with conveyor belts, and a wet rooftop are starting points. Draw a single character sheet and one environment tile sheet before committing to the full set. Use short original sound effects and a mute toggle.

Include an optional House Rules toggle, off by default. Allow the host to enter or disable short prompts. Start with harmless examples like “Toast the winner” and “Take a snack break.” Anyone can skip the prompt immediately. Keep scoring and powerups independent of drink participation. Make the pauses quick enough to talk, grab a beer or switch to the next round.

### Build and playtest workflow

1. Open or create one project on the owner’s computer. Put this brief at the project root. Use one Git repository and small commits so the owner can restore any playable build. Keep a short build and playtest log.
2. Build Milestone 0 first. Include a reproducible command and a usable test link or package. Ask Nick for the physical controller result while you work on control feel or art mockups that do not depend on the platform decision.
3. Implement one complete loop with placeholder art before expanding. Start with Dust Lap and Neon Knockout, including scoring, two comeback drafts, pause and rematch. Then add Cratequake, the game night playlist, and House Rules.
4. Test joins, identity on reconnect, simultaneous input, event ties, draft pick timeouts, power stacking across events, and clearing powers on rematch. Run a smoke test that finishes a match. Exercise the full build on the Series X with three people and a TV.
5. Ask the trio to play three full matches. Record whether a first timer understood the controls on the first life, which minigame earned a rematch, which perk combo made everyone react, and when anyone was stuck waiting. Change one major gameplay variable per build so the feedback identifies what worked.
6. Deliver one launch route that works on Nick’s console, concise controller instructions, a tested build identifier, and the source project. Track observed hardware results separately from lab results. Add more minigames after the first three earn repeat play.

Start by creating the controller test and proposing exact pass criteria. In your first update, show what you built, how to open it on the Xbox, and what Nick should see when three controllers work. The goal of this first session is evidence from the console and one playable interaction, followed by the full game in short iterations.

### Platform references

Xbox retail Developer Mode
https://learn.microsoft.com/en-us/previous-versions/windows/uwp/xbox-apps/devkit-activation

Deploy a UWP package from a Windows PC
https://learn.microsoft.com/en-us/previous-versions/windows/uwp/xbox-apps/getting-started

Windows.Gaming.Input
https://learn.microsoft.com/en-us/windows/uwp/gaming/input-for-games

Microsoft documentation on browser gamepad input
https://learn.microsoft.com/en-us/microsoft-edge/dev-guide/dom/gamepad-api

ID@Xbox onboarding
https://learn.microsoft.com/en-us/gaming/game-publishing/onboarding/onboarding-join-id-at-xbox

Example of console engine access requirements
https://learn.microsoft.com/en-us/gaming/gdk/docs/gdk-dev/pc-dev/tutorials/getting-started-with-monogame/gc-get-started-monogame
