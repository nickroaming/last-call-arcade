// Browser-check helper: three fake controllers driven from the console.
(function () {
  const ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
  const mk = (i) => ({ index: i, id: ID, connected: true, mapping: 'standard', timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] });
  const P = [mk(0), mk(1), mk(2)];
  navigator.getGamepads = () => P.slice();
  const L = window.__lca;
  const set = (i, b, on) => { P[i].buttons[b] = { pressed: on, value: on ? 1 : 0 }; };
  const tap = (i, b) => { set(i, b, true); L.step(); set(i, b, false); L.step(); };
  const bot = (frames) => { for (let f = 0; f < frames; f++) { if (f % 20 === 0) P.forEach((p) => { p.axes = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]; for (const b of [0, 2, 5]) p.buttons[b] = { pressed: Math.random() < 0.4, value: 0 }; }); L.step(1); } };
  const toPlay = () => { [0, 1, 2].forEach((i) => tap(i, 0)); L.step(10); tap(0, 2); L.step(5); [0, 1, 2].forEach((i) => tap(i, 0)); L.step(200); };
  window.SIM = { P, set, tap, bot, toPlay };
})();
