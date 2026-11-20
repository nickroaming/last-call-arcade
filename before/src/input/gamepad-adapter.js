// Gamepad input adapter: seats, joins, seat ownership and reconnects.
// No DOM or rendering here, so the game (and tests) can reuse it as-is.
// The browser source is injectable: pass getGamepads() for tests.

/** Standard-mapping button indexes (W3C "standard" gamepad layout). */
export const BTN = Object.freeze({
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16,
});
export const BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu',
  'LS', 'RS', 'Up', 'Down', 'Left', 'Right', 'Xbox'];
const NB = 17;
const PRESS_THRESHOLD = 0.5;

function readPad(gp) {
  const buttons = new Array(NB).fill(false);
  const values = new Array(NB).fill(0);
  for (let i = 0; i < NB; i++) {
    const b = gp.buttons && gp.buttons[i];
    if (!b) continue;
    const v = typeof b === 'number' ? b : (b.value || 0);
    values[i] = v;
    buttons[i] = (typeof b === 'object' && b.pressed) || v > PRESS_THRESHOLD;
  }
  const axes = [0, 1, 2, 3].map((i) => (gp.axes && gp.axes[i]) || 0);
  return { buttons, values, axes };
}

export class Seat {
  constructor(n) {
    this.n = n;
    this.reset();
  }
  reset() {
    /** 'empty' | 'active' | 'disconnected' */
    this.state = 'empty';
    this.padIndex = null;
    this.padId = '';
    this.mapping = '';
    this.buttons = new Array(NB).fill(false);
    this.values = new Array(NB).fill(0);
    this.axes = [0, 0, 0, 0];
    this.justPressed = new Array(NB).fill(false);
    this.joinedAt = 0;
    this.disconnectedAt = 0;
    this.reconnects = 0;
    this.timestamp = 0;
  }
  get active() { return this.state === 'active'; }
  held(b) { return this.active && this.buttons[b]; }
  pressed(b) { return this.active && this.justPressed[b]; }
  /** stick 0 = left, 1 = right. y is negative when pushed up. */
  stick(which) {
    const x = this.axes[which * 2] || 0;
    const y = this.axes[which * 2 + 1] || 0;
    return { x, y, mag: Math.hypot(x, y) };
  }
  clearInput() {
    this.buttons.fill(false);
    this.values.fill(0);
    this.justPressed.fill(false);
    this.axes = [0, 0, 0, 0];
  }
}

/**
 * Seat rules
 * - A on a controller that owns no seat: it restores the seat that has waited
 *   longest for its controller; if none is waiting and joining is open, it
 *   takes the lowest empty seat.
 * - A seat whose controller disconnects keeps its number and waits. If the
 *   same controller comes back in the same browser slot it is restored at once.
 * - A seat is only freed by leave() or resetAll().
 */
export class InputAdapter {
  constructor({ seatCount = 3, getGamepads } = {}) {
    this.getGamepads = getGamepads || (() =>
      (typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []));
    this.seats = Array.from({ length: seatCount }, (_, i) => new Seat(i + 1));
    this.joinOpen = true;
    this.prev = new Map(); // padIndex -> buttons[] from last frame
    /** Diagnostics: every connected pad this frame. */
    this.pads = [];
  }

  ownerOf(padIndex) {
    return this.seats.find((s) => s.active && s.padIndex === padIndex) || null;
  }
  get activeCount() { return this.seats.filter((s) => s.active).length; }
  get allFilled() { return this.seats.every((s) => s.active); }

  leave(seat) { seat.reset(); }
  resetAll() { this.seats.forEach((s) => s.reset()); }

  /** Poll once per frame. Returns this frame's events. */
  update(now = 0) {
    const events = [];
    const live = new Map();
    for (const gp of this.getGamepads() || []) {
      if (gp && gp.connected !== false) live.set(gp.index, gp);
    }

    // 1. Seats that lost their controller.
    for (const s of this.seats) {
      if (!s.active) continue;
      const gp = live.get(s.padIndex);
      if (!gp || (s.padId && gp.id !== s.padId)) {
        s.state = 'disconnected';
        s.disconnectedAt = now;
        s.clearInput();
        events.push({ type: 'disconnect', seat: s.n, padIndex: s.padIndex });
      }
    }

    // 2. Read every pad and work out button edges.
    const reads = new Map();
    for (const [idx, gp] of live) {
      const r = readPad(gp);
      const prev = this.prev.get(idx) || new Array(NB).fill(false);
      r.just = r.buttons.map((b, i) => b && !prev[i]);
      r.gp = gp;
      reads.set(idx, r);
    }
    this.prev = new Map([...reads].map(([i, r]) => [i, r.buttons]));

    const restore = (seat, r, how) => {
      seat.state = 'active';
      seat.padIndex = r.gp.index;
      seat.padId = r.gp.id;
      seat.mapping = r.gp.mapping || '';
      seat.reconnects += 1;
      seat.fresh = true;
      events.push({ type: 'rejoin', seat: seat.n, padIndex: r.gp.index, how });
    };

    // 3. Same controller back in the same slot: restore immediately.
    for (const s of this.seats) {
      if (s.state !== 'disconnected') continue;
      const r = reads.get(s.padIndex);
      if (r && r.gp.id === s.padId && !this.ownerOf(s.padIndex)) restore(s, r, 'same-slot');
    }

    // 4. A pressed on a controller that owns no seat.
    for (const [idx, r] of reads) {
      if (this.ownerOf(idx) || !r.just[BTN.A]) continue;
      const waiting = this.seats.filter((s) => s.state === 'disconnected')
        .sort((a, b) => a.disconnectedAt - b.disconnectedAt)[0];
      if (waiting) { restore(waiting, r, 'press-a'); continue; }
      const empty = this.joinOpen ? this.seats.find((s) => s.state === 'empty') : null;
      if (empty) {
        empty.state = 'active';
        empty.padIndex = idx;
        empty.padId = r.gp.id;
        empty.mapping = r.gp.mapping || '';
        empty.joinedAt = now;
        empty.fresh = true;
        events.push({ type: 'join', seat: empty.n, padIndex: idx });
      } else {
        events.push({ type: 'unassigned-press', padIndex: idx });
      }
    }

    // 5. Copy input into active seats. The A press that joined is consumed.
    for (const s of this.seats) {
      if (!s.active) { s.clearInput(); continue; }
      const r = reads.get(s.padIndex);
      s.buttons = r.buttons;
      s.values = r.values;
      s.axes = r.axes;
      s.justPressed = s.fresh ? new Array(NB).fill(false) : r.just;
      s.fresh = false;
      s.timestamp = r.gp.timestamp || 0;
      s.justPressed.forEach((p, b) => { if (p) events.push({ type: 'press', seat: s.n, button: b }); });
    }

    this.pads = [...reads].map(([idx, r]) => ({
      index: idx, id: r.gp.id, mapping: r.gp.mapping || '',
      seat: (this.ownerOf(idx) || {}).n || null,
      anyHeld: r.buttons.some(Boolean),
    }));
    return events;
  }
}
