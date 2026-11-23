// Edge on Xbox: getting the controller to the game.
//
// Edge on the console has two controller modes. In BROWSING mode (the default
// for most sites) the controller is a mouse: the stick moves a cursor and A
// clicks. The page sees mouse events and navigator.getGamepads() reports no
// presses, so the game looks dead. In GAME CONTROLS mode the controller reaches
// the page as a gamepad. Only the player can switch: hold the Menu button and
// pick "Use game controls". A page can't do it for them.
//
// So we watch for the tell-tale signs (mouse moves and clicks, no gamepad
// presses) and explain the switch on screen. We also spot the other known
// trap: pressing View can take focus away from the page until the Guide is
// opened and closed with the Xbox button.

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const IS_XBOX = params.has('xbox') ||
  (typeof navigator !== 'undefined' && /xbox/i.test(navigator.userAgent || ''));

const HUMAN = (id) => !/^Keyboard|^CPU/.test(id || '');
const state = {
  start: 0,
  lastMouse: -1e9,     // a cursor move or click: the controller is acting as a mouse
  mouseCount: 0,
  lastPad: -1e9,       // a real gamepad button or stick: game controls are working
  padEver: false,
  padsSeen: 0,
  lastKey: '',         // last key name, for the diagnostic panel
  focused: true,
  hidden: false,
};

/** Keys Edge may send for controller buttons in browsing mode (old Xbox Edge did). */
const GAMEPAD_KEYS = {
  GamepadA: 0, GamepadB: 1, GamepadX: 2, GamepadY: 3,
  GamepadLeftShoulder: 4, GamepadRightShoulder: 5, GamepadLeftTrigger: 6, GamepadRightTrigger: 7,
  GamepadView: 8, GamepadMenu: 9, GamepadLeftThumbstick: 10, GamepadRightThumbstick: 11,
  GamepadDPadUp: 12, GamepadDPadDown: 13, GamepadDPadLeft: 14, GamepadDPadRight: 15,
  GamepadLeftThumbstickUp: 'ly-', GamepadLeftThumbstickDown: 'ly+', GamepadLeftThumbstickLeft: 'lx-', GamepadLeftThumbstickRight: 'lx+',
};
const keyPad = { buttons: new Set(), dirs: new Set(), used: false };

export function installXboxWatch(now = () => performance.now()) {
  state.start = now();
  const mouse = () => { state.lastMouse = now(); state.mouseCount += 1; };
  for (const ev of ['mousemove', 'mousedown', 'pointerdown', 'click', 'wheel']) addEventListener(ev, mouse, { passive: true, capture: true });
  addEventListener('keydown', (e) => {
    state.lastKey = e.key || e.code || String(e.keyCode);
    const b = GAMEPAD_KEYS[e.key];
    if (b === undefined) return;
    keyPad.used = true;
    if (typeof b === 'number') keyPad.buttons.add(b); else keyPad.dirs.add(b);
  }, { capture: true });
  addEventListener('keyup', (e) => {
    const b = GAMEPAD_KEYS[e.key];
    if (typeof b === 'number') keyPad.buttons.delete(b); else if (b) keyPad.dirs.delete(b);
  }, { capture: true });
  addEventListener('blur', () => { state.focused = false; keyPad.buttons.clear(); keyPad.dirs.clear(); });
  addEventListener('focus', () => { state.focused = true; });
  document.addEventListener('visibilitychange', () => { state.hidden = document.visibilityState === 'hidden'; });
  // A click in browsing mode is a real user gesture: use it to go full screen on the TV.
  if (IS_XBOX) {
    addEventListener('click', () => {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    }, { capture: true });
  }
}

/**
 * A controller driven through Edge's keyboard events, if Edge sends them.
 * Joins like any other controller.
 */
export function keyEventPad() {
  if (!keyPad.used) return [];
  const buttons = Array.from({ length: 17 }, (_, b) => {
    const on = keyPad.buttons.has(b);
    return { pressed: on, value: on ? 1 : 0 };
  });
  const d = keyPad.dirs;
  const ax = (d.has('lx+') ? 1 : 0) - (d.has('lx-') ? 1 : 0);
  const ay = (d.has('ly+') ? 1 : 0) - (d.has('ly-') ? 1 : 0);
  return [{ index: 45, id: 'Xbox controller (key events)', connected: true, mapping: 'standard', timestamp: 0, buttons, axes: [ax, ay, 0, 0] }];
}

/** Call once per frame with the raw browser gamepads. */
export function watchPads(gamepads, t = performance.now()) {
  let n = 0;
  for (const gp of gamepads) {
    if (!gp || gp.connected === false || !HUMAN(gp.id)) continue;
    n += 1;
    const btn = gp.buttons && Array.from(gp.buttons).some((b) => b && (b.pressed || b.value > 0.5));
    const stick = gp.axes && Array.from(gp.axes).some((a) => Math.abs(a) > 0.5);
    if (btn || stick) { state.lastPad = t; state.padEver = true; }
  }
  if (keyPad.buttons.size || keyPad.dirs.size) { state.lastPad = t; state.padEver = true; }
  state.padsSeen = n;
}

/**
 * What, if anything, to tell the players.
 * 'browsing' : the controller is acting as a mouse (or nothing has reached the game on Xbox)
 * 'focus'    : the page lost focus (the View button trap)
 * null       : all good
 */
export function xboxProblem(t = performance.now()) {
  if (state.hidden || !state.focused) return IS_XBOX ? 'focus' : null;
  const mouseRecent = t - state.lastMouse < 6000;
  const padRecent = t - state.lastPad < 6000;
  if (!IS_XBOX) return null;
  // The cursor is moving and the gamepad is silent: browsing mode.
  if (mouseRecent && !padRecent && state.mouseCount > 3) return 'browsing';
  // On the Xbox, nothing at all has reached the game for a while.
  if (!state.padEver && t - state.start > 8000) return 'browsing';
  return null;
}

export function xboxDiag() { return { ...state, isXbox: IS_XBOX, keyPad: keyPad.used }; }
