# Xbox controller test (Milestone 0)

**Goal:** prove that Edge on the Xbox Series X lets three controllers play one web game at the same time.
It takes about 5 minutes with three people.

## What you need
- The Xbox, the TV, and **three controllers** that are charged or have fresh batteries.
- Three people (or one person with three controllers, but the "together" steps are much easier with three).
- The test link (see `BUILD_LOG.md` for the current link).
- A phone to take a photo of the result screen.

## Steps
1. Turn on all three controllers. Each one should be signed in or set to "guest". It doesn't matter which.
2. On the Xbox, open **Microsoft Edge**.
3. Go to the test link. The easy way is to type it into the address bar with the on-screen keyboard.
4. Optional: press the **View** button ⧉ inside Edge to hide the address bar, or use Edge's menu → Full screen.
5. **Join.** Each person presses **A** on their own controller. Their card lights up as **P1**, **P2** or **P3**.
   Each card has its own shape (▲ ● ■) and stripe/dot/checker pattern, so you don't need to tell colors apart.
   - No card reacts? Press any button once. Browsers only show controllers after a button press.
   - Move a stick or press buttons and watch *your own* card. Only your card should move.
6. **Start.** When all three cards say READY, anyone presses **X** (or **Menu ≡**).
7. **Do the 30-second test.** Follow the big words at the top. Each card shows that player's job:
   1. Everyone **holds A** together until the green bar fills (2 seconds).
   2. **Left stick**: P1 pushes ◀ LEFT, P2 pushes ▲ UP, P3 pushes ▶ RIGHT, all at once, for 2 seconds.
   3. Anyone presses **Menu ≡** to pause. The screen says PAUSED. Anyone presses **A** to resume.
   4. Tap your own button 3 times: P1 **X**, P2 **Y**, P3 **B**.
      (B is the browser's "Back" button. If the page disappears or goes back, that is a real FAIL. Write it down.)
   5. Everyone **holds RT** (right trigger) and pushes the **right stick** any way for 2 seconds.
   6. Then mash everything until the timer hits 0.
8. **Reconnect check.** Pick one player. **Pull the batteries out** of their controller (or hold its Xbox button and choose *Turn off controller*).
   Their card says "CONTROLLER OFF · seat saved". Put the batteries back (or press the Xbox button), then press **A**.
   The same number should come back. That player presses **A** to confirm it's their card (or **X** if it's wrong).
   If the Xbox shows its own controller popup, close it with B and carry on. Press **X** to skip this check.
9. **Result.** The screen shows **PASS**, **FAIL** or **INCOMPLETE** and names any problem seat (P1/P2/P3).
   **Take a photo of the whole screen** and send it to Claude.
10. Also send the Xbox OS version: Xbox button → Profile & system → Settings → System → **Console info** → "OS version".

## What PASS looks like
- Three cards show P1, P2 and P3, each moving only with its own controller.
- The sticks and buttons on all three cards move at the same time with no lag you can notice.
- PAUSED appears from Menu and goes away with A.
- Tapping B never leaves the page.
- After the battery pull, the same player gets the same number back.
- The final screen says **PASS** in big green letters, with six ✔ lines.

## Exact pass criteria (what the page checks)
| Check | PASS when |
| --- | --- |
| J. Join | 3 different controllers (3 different browser slots) joined seats P1-P3 with A. One controller can never hold two seats. |
| S. Simultaneous | All 4 action steps finished inside 30 s of play time (pause time doesn't count): all hold A together 2 s; each left stick in its own direction together 2 s; X/Y/B tapped 3× each; all hold RT + right stick together 2 s. A seat that never did its part is named. |
| P. Pause | Menu ≡ (or View) paused the timer and A resumed it. The note says which button worked. |
| D. Stable | No seat lost its controller and no controller changed slot during the 30 s. |
| N. No navigation | The page never lost focus, never got hidden and never received a "go back" during the 30 s. If it happened within 1.5 s of a button press, that seat and button are named. |
| R. Reconnect | One controller was switched off, its seat waited with the same number, it came back to that seat (automatically or by pressing A), the other two seats kept their controllers, and the player confirmed it with A within 2 minutes. |

**Overall:** PASS = all six pass. INCOMPLETE = reconnect skipped, everything else passed. FAIL = anything failed.
The small **result code** line (e.g. `PASS J1S1P1D1N1R1 3P XBOX Edg131…`) packs the same answer into one line for the log.

## Controller-only path
- Join: **A** · Start: **X** or **Menu ≡** · Pause: **Menu ≡** (View also works) · Resume: **A** · Quit while paused: **Y**
- Leave a seat on the join screen: hold **View** for 2 seconds.
- On the result screen: **A** runs again with the same seats, **Y** starts over with new joins.

## Practice without three people
Add `?seats=2` or `?seats=1` to the end of the link to try the flow with fewer controllers.
That result is labelled a dry run and doesn't count as the 3-controller result.
