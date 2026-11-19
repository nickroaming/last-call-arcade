// Turns a seat's raw gamepad state into game controls, and provides two
// keyboard "controllers" for testing on a computer.
import { BTN } from '../input/gamepad-adapter.js';

const DEAD = 0.25;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export const NO_CONTROLS = Object.freeze({
  mx: 0, my: 0, ax: 0, ay: 0, aim: false,
  jump: false, jumpP: false, fire: false, fireP: false, block: false, blockP: false,
  up: false, down: false, upP: false, downP: false, leftP: false, rightP: false,
  y: false, yP: false, menuP: false, viewP: false, lbP: false, rbP: false,
});

/** Edge-detect stick flicks for menu navigation. */
const flick = new Map();

export function readControls(seat) {
  if (!seat || !seat.active) return NO_CONTROLS;
  let mx = dz(seat.axes[0]), my = dz(seat.axes[1]);
  if (seat.buttons[BTN.LEFT]) mx = -1;
  if (seat.buttons[BTN.RIGHT]) mx = 1;
  if (seat.buttons[BTN.UP]) my = -1;
  if (seat.buttons[BTN.DOWN]) my = 1;
  const ax = dz(seat.axes[2]), ay = dz(seat.axes[3]);
  const rt = seat.values[BTN.RT] > 0.5;
  const f = flick.get(seat.n) || { x: 0, y: 0 };
  const fx = mx > 0.6 ? 1 : mx < -0.6 ? -1 : 0, fy = my > 0.6 ? 1 : my < -0.6 ? -1 : 0;
  const c = {
    mx, my, ax, ay, aim: Math.hypot(ax, ay) > 0.35,
    jump: seat.buttons[BTN.A], jumpP: seat.justPressed[BTN.A],
    fire: seat.buttons[BTN.X] || rt, fireP: seat.justPressed[BTN.X] || seat.justPressed[BTN.RT],
    block: seat.buttons[BTN.RB] || seat.buttons[BTN.LB] || seat.buttons[BTN.Y],
    blockP: seat.justPressed[BTN.RB] || seat.justPressed[BTN.LB] || seat.justPressed[BTN.Y],
    y: seat.buttons[BTN.Y], yP: seat.justPressed[BTN.Y],
    menuP: seat.justPressed[BTN.MENU], viewP: seat.justPressed[BTN.VIEW],
    lbP: seat.justPressed[BTN.LB], rbP: seat.justPressed[BTN.RB], bP: seat.justPressed[BTN.B],
    upP: fy === -1 && f.y !== -1, downP: fy === 1 && f.y !== 1,
    leftP: fx === -1 && f.x !== -1, rightP: fx === 1 && f.x !== 1,
  };
  flick.set(seat.n, { x: fx, y: fy });
  return c;
}

// ---------- keyboard controllers (for testing on a computer) ----------
const KB_MAPS = [
  { name: 'Keyboard 1 (WASD)', up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    [BTN.A]: 'Space', [BTN.X]: 'KeyF', [BTN.RB]: 'KeyG', [BTN.Y]: 'KeyR', [BTN.LB]: 'KeyE', [BTN.MENU]: 'Enter', [BTN.VIEW]: 'Tab' },
  { name: 'Keyboard 2 (arrows)', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    [BTN.A]: 'Slash', [BTN.X]: 'Period', [BTN.RB]: 'Comma', [BTN.Y]: 'Quote', [BTN.LB]: 'KeyL', [BTN.MENU]: 'Backspace', [BTN.VIEW]: 'Backslash' },
];
const down = new Set();
const used = [false, false];
export function installKeyboard() {
  addEventListener('keydown', (e) => {
    down.add(e.code);
    KB_MAPS.forEach((m, i) => { if (Object.values(m).includes(e.code)) used[i] = true; });
  }, { capture: true });
  addEventListener('keyup', (e) => down.delete(e.code), { capture: true });
  addEventListener('blur', () => down.clear());
}
export function keyboardPads() {
  const pads = [];
  KB_MAPS.forEach((m, i) => {
    if (!used[i]) return;
    const buttons = Array.from({ length: 17 }, (_, b) => {
      const on = m[b] ? down.has(m[b]) : false;
      return { pressed: on, value: on ? 1 : 0 };
    });
    const ax = (down.has(m.right) ? 1 : 0) - (down.has(m.left) ? 1 : 0);
    const ay = (down.has(m.down) ? 1 : 0) - (down.has(m.up) ? 1 : 0);
    pads.push({ index: 40 + i, id: m.name, connected: true, mapping: 'standard', timestamp: 0, buttons, axes: [ax, ay, 0, 0] });
  });
  return pads;
}
