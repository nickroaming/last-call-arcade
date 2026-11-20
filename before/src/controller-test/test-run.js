// Milestone 0 pass criteria as plain logic (no DOM). Time is passed in, so
// tests can drive it with a fake clock.
import { BTN, BUTTON_NAMES } from '../input/gamepad-adapter.js';

export const TEST_MS = 30000;
export const HOLD_MS = 2000;
export const TAPS = 3;
export const RECONNECT_MS = 120000;

const DIRS = [
  { x: -1, y: 0, label: '◀ LEFT' },
  { x: 0, y: -1, label: '▲ UP' },
  { x: 1, y: 0, label: '▶ RIGHT' },
];
const TAP_BUTTONS = [BTN.X, BTN.Y, BTN.B];

function stickToward(seat, which, dir) {
  const s = seat.stick(which);
  if (s.mag < 0.6) return false;
  return (s.x * dir.x + s.y * dir.y) / s.mag > 0.8;
}

export function makeTasks() {
  return [
    {
      id: 'holdA', kind: 'together', title: 'Everyone: HOLD  A',
      goal: () => 'Hold A',
      ok: (s) => s.held(BTN.A),
    },
    {
      id: 'sticks', kind: 'together', title: 'LEFT STICK — each player their own way',
      goal: (i) => `Left stick ${DIRS[i % 3].label}`,
      ok: (s, i) => stickToward(s, 0, DIRS[i % 3]),
    },
    {
      id: 'pause', kind: 'pause', title: 'Anyone: press MENU ≡ to pause',
      goal: () => 'Menu ≡ pauses · A resumes',
    },
    {
      id: 'taps', kind: 'taps', title: 'Tap YOUR button 3 times',
      goal: (i) => `Tap ${BUTTON_NAMES[TAP_BUTTONS[i % 3]]} × ${TAPS}`,
      button: (i) => TAP_BUTTONS[i % 3],
    },
    {
      id: 'triggers', kind: 'together', title: 'Everyone: hold RT + push the RIGHT stick',
      goal: () => 'Hold RT + right stick any way',
      ok: (s) => s.values[BTN.RT] > 0.5 && s.stick(1).mag > 0.6,
    },
  ];
}

export class TestRun {
  constructor(seats) {
    this.seats = seats;
    this.tasks = makeTasks().map((t) => ({
      ...t, done: false, doneAt: null, togetherSince: null,
      seatMs: seats.map(() => 0), taps: seats.map(() => 0),
    }));
    this.phase = 'running'; // running | paused | done
    this.elapsed = 0;
    this.lastNow = null;
    this.taskIdx = 0;
    this.issues = []; // { check, seat, text }
    this.pause = { count: 0, via: new Set(), resumed: false };
    this.startPads = seats.map((s) => s.padIndex);
    this.lastPress = null; // { seat, button, at }
    this.longestFrame = 0;
  }

  get task() { return this.tasks[this.taskIdx] || null; }
  get remaining() { return Math.max(0, TEST_MS - this.elapsed); }

  /** Called by the page when the browser blurs, hides, or tries to go back. */
  noteNav(kind) {
    if (this.phase === 'done') return;
    const lp = this.lastPress;
    const recent = lp && this.elapsed - lp.at < 1500;
    this.issues.push({
      check: 'nav', seat: recent ? lp.seat : null,
      text: `Browser ${kind}${recent ? ` right after P${lp.seat} pressed ${BUTTON_NAMES[lp.button]}` : ''}`,
    });
  }

  update(now, events) {
    if (this.lastNow === null) this.lastNow = now;
    let dt = now - this.lastNow;
    this.lastNow = now;
    if (this.phase === 'done') return;
    this.longestFrame = Math.max(this.longestFrame, dt);
    dt = Math.max(0, Math.min(dt, 250)); // clock hiccups never count

    for (const e of events) {
      if (e.type === 'press') this.lastPress = { seat: e.seat, button: e.button, at: this.elapsed };
      if (e.type === 'disconnect') {
        this.issues.push({ check: 'stable', seat: e.seat, text: `P${e.seat} controller dropped at ${(this.elapsed / 1000).toFixed(1)} s` });
      }
    }

    const pressedAny = (b) => this.seats.some((s) => s.pressed(b));

    if (this.phase === 'paused') {
      if (pressedAny(BTN.A)) {
        this.phase = 'running';
        this.pause.resumed = true;
        const t = this.task;
        if (t && t.kind === 'pause') this.completeTask(t);
      }
      return;
    }

    if (pressedAny(BTN.MENU) || pressedAny(BTN.VIEW)) {
      if (pressedAny(BTN.MENU)) this.pause.via.add('Menu');
      if (pressedAny(BTN.VIEW)) this.pause.via.add('View');
      this.pause.count += 1;
      this.phase = 'paused';
      return;
    }

    this.elapsed += dt;
    const t = this.task;
    if (t && t.kind === 'together') {
      let all = true;
      this.seats.forEach((s, i) => {
        const ok = t.ok(s, i);
        if (ok) t.seatMs[i] += dt; else all = false;
      });
      if (all) {
        if (t.togetherSince === null) t.togetherSince = this.elapsed - dt;
        if (this.elapsed - t.togetherSince >= HOLD_MS) this.completeTask(t);
      } else {
        t.togetherSince = null;
      }
    } else if (t && t.kind === 'taps') {
      this.seats.forEach((s, i) => { if (s.pressed(t.button(i))) t.taps[i] += 1; });
      if (t.taps.every((n) => n >= TAPS)) this.completeTask(t);
    }

    if (this.elapsed >= TEST_MS) this.phase = 'done';
  }

  completeTask(t) {
    t.done = true;
    t.doneAt = this.elapsed;
    this.taskIdx += 1;
  }

  /** Progress 0..1 of the current task's hold, for the UI. */
  holdProgress() {
    const t = this.task;
    if (!t || t.kind !== 'together' || t.togetherSince === null) return 0;
    return Math.min(1, (this.elapsed - t.togetherSince) / HOLD_MS);
  }
  seatOk(i) {
    const t = this.task;
    if (!t) return true;
    if (t.kind === 'together') return t.ok(this.seats[i], i);
    if (t.kind === 'taps') return t.taps[i] >= TAPS;
    return false;
  }

  /** Checks for the 30 second test. Reconnect is added by ReconnectCheck. */
  checks() {
    const n = this.seats.length;
    const pads = new Set(this.startPads);
    const checks = [];
    checks.push({
      id: 'join', label: `${n} different controllers joined ${n} seats with A`,
      pass: pads.size === n && !this.startPads.includes(null), seats: [],
    });

    const simulTasks = this.tasks.filter((t) => t.kind !== 'pause');
    const failSeats = new Set();
    const notes = [];
    for (const t of simulTasks) {
      if (t.done) continue;
      let blame = [];
      if (t.kind === 'together') blame = this.seats.filter((_, i) => t.seatMs[i] < HOLD_MS).map((s) => s.n);
      if (t.kind === 'taps') blame = this.seats.filter((_, i) => t.taps[i] < TAPS).map((s) => s.n);
      const reached = this.tasks.indexOf(t) <= this.taskIdx;
      if (!reached) { notes.push(`"${t.title}" not reached`); continue; }
      if (!blame.length) { notes.push(`"${t.title}": never all at once`); blame = this.seats.map((s) => s.n); } else {
        notes.push(`"${t.title}": ${blame.map((x) => 'P' + x).join(', ')} missed it`);
      }
      blame.forEach((x) => failSeats.add(x));
    }
    checks.push({
      id: 'simul', label: 'Everyone moved and pressed at the same time',
      pass: simulTasks.every((t) => t.done), seats: [...failSeats], note: notes.join(' · '),
    });

    const via = [...this.pause.via];
    checks.push({
      id: 'pause', label: 'Pause and resume with a controller',
      pass: this.tasks.find((t) => t.id === 'pause').done, seats: [],
      note: via.length ? `Paused with ${via.join(' and ')}` : 'Pause button never reached the page',
    });

    const stable = this.issues.filter((x) => x.check === 'stable');
    checks.push({
      id: 'stable', label: 'No controller dropped or swapped during the test',
      pass: stable.length === 0, seats: [...new Set(stable.map((x) => x.seat))],
      note: stable.map((x) => x.text).join(' · '),
    });

    const nav = this.issues.filter((x) => x.check === 'nav');
    checks.push({
      id: 'nav', label: 'Controller never made the browser navigate or lose focus',
      pass: nav.length === 0, seats: [...new Set(nav.map((x) => x.seat).filter(Boolean))],
      note: nav.map((x) => x.text).join(' · '),
    });
    return checks;
  }
}

/**
 * Reconnect check: one player switches their controller off and on again.
 * PASS when that seat comes back with the same number, the other seats keep
 * their controllers, and the player confirms the number on screen is theirs.
 */
export class ReconnectCheck {
  constructor(seats) {
    this.seats = seats;
    this.state = 'waiting-drop'; // waiting-drop | waiting-return | confirm | pass | fail | skipped
    this.seat = null;
    this.others = null;
    this.startedAt = null;
    this.note = '';
  }
  update(now, events) {
    if (this.startedAt === null) this.startedAt = now;
    if (['pass', 'fail', 'skipped'].includes(this.state)) return;
    for (const e of events) {
      if (e.type === 'disconnect' && this.state === 'waiting-drop') {
        this.seat = e.seat;
        this.others = this.seats.filter((s) => s.n !== e.seat).map((s) => [s.n, s.padIndex]);
        this.state = 'waiting-return';
      } else if (e.type === 'rejoin' && this.state === 'waiting-return') {
        if (e.seat !== this.seat) {
          this.state = 'fail';
          this.note = `P${this.seat} dropped but P${e.seat} came back`;
          return;
        }
        const moved = this.others.filter(([n, idx]) => {
          const s = this.seats.find((x) => x.n === n);
          return !s.active || s.padIndex !== idx;
        });
        if (moved.length) {
          this.state = 'fail';
          this.note = `Other seats lost their controller: ${moved.map(([n]) => 'P' + n).join(', ')}`;
          return;
        }
        this.how = e.how;
        this.state = 'confirm';
      }
    }
    if (this.state === 'confirm') {
      const s = this.seats.find((x) => x.n === this.seat);
      if (s.pressed(BTN.A)) { this.state = 'pass'; this.note = `P${this.seat} came back to seat ${this.seat} (${this.how === 'same-slot' ? 'automatically' : 'after pressing A'})`; }
      else if (s.pressed(BTN.X)) { this.state = 'fail'; this.note = `Player said the seat number was wrong after reconnect`; }
      return;
    }
    if (this.state === 'waiting-drop' && this.seats.some((s) => s.pressed(BTN.X))) {
      this.state = 'skipped';
      this.note = 'Skipped with X';
      return;
    }
    if (now - this.startedAt > RECONNECT_MS) {
      this.state = 'fail';
      this.note = this.seat ? `P${this.seat} did not come back within ${RECONNECT_MS / 1000} s` : 'No controller was switched off';
    }
  }
  check() {
    return {
      id: 'reconnect', label: 'A reconnected controller got its own seat back',
      pass: this.state === 'pass', skipped: this.state === 'skipped',
      seats: this.state === 'fail' && this.seat ? [this.seat] : [], note: this.note,
    };
  }
}

/** PASS / FAIL / INCOMPLETE for the whole run. */
export function verdict(checks) {
  const failed = checks.filter((c) => !c.pass && !c.skipped);
  if (failed.length) return 'FAIL';
  if (checks.some((c) => c.skipped)) return 'INCOMPLETE';
  return 'PASS';
}
