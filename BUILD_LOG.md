# Build and playtest log

Lab results (desktop browser, simulated controllers) and hardware results (real Xbox) are kept apart.

## Builds
| Build | Date | What changed | Test link |
| --- | --- | --- | --- |
| m0-2026-11-19.1 | 2026-11-19 | First controller test: 3 seats, 30 s test, pause, reconnect, PASS/FAIL | https://nickroaming.github.io/last-call-arcade/ |

## Lab results (not real hardware)
**m0-2026-11-19.1** · Chromium-based browser pane on macOS, gamepads simulated in JavaScript
- Unit tests: 22/22 pass (`tests/`): joins, one controller per seat, input separation, disconnect and auto-restore, restore by A in a new slot, oldest-first restore, joins closed during the test, device swap counts as a drop, all pass criteria, blame for the failed seat, reconnect pass/fail/skip/timeout.
- Full page run with three simulated pads: join → test → pause/resume → reconnect → **PASS** screen, all six checks ✔.
- FAIL run: P2 never held A and P3 pressed B just before a simulated focus loss → **FAIL**, "Problem seats: P2, P3", reconnect skipped shows NOT TESTED.
- Not covered in the lab: real Xbox Edge, real Bluetooth reconnect timing, what B/Menu/View do in Edge on Xbox, the Xbox guide popup.

## Hardware results (real Xbox Series X)
| Date | Build | Xbox OS version | Edge version (from result code) | Players | Result | Problem seats / notes |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | waiting for Nick | |
