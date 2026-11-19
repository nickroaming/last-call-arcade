// Unit tests for the input adapter and the Milestone 0 pass criteria.
// Run: serve the project folder, open /tests/ in a browser. No install needed.
import { InputAdapter, BTN } from '../src/input/gamepad-adapter.js';
import { TestRun, ReconnectCheck, verdict, TEST_MS } from '../src/controller-test/test-run.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); }
}
function eq(a, b, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}
function ok(v, msg = 'expected true') { if (!v) throw new Error(msg); }

// ---- fake gamepads ----
const XID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
function pad(index, id = XID) {
  return { index, id, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
}
function press(p, b, on = true) { p.buttons[b] = { pressed: on, value: on ? 1 : 0 }; }
function rig(n = 3) {
  const slots = [];
  const adapter = new InputAdapter({ seatCount: n, getGamepads: () => slots.slice() });
  let t = 0;
  const step = (ms = 16) => { t += ms; return adapter.update(t); };
  const tap = (p, b) => { press(p, b); const e = step(); press(p, b, false); step(); return e; };
  return { slots, adapter, step, tap, now: () => t };
}
function joinThree(r) {
  for (let i = 0; i < 3; i++) { r.slots[i] = pad(i); }
  r.tap(r.slots[0], BTN.A); r.tap(r.slots[1], BTN.A); r.tap(r.slots[2], BTN.A);
}

// ---- adapter ----
test('A joins seats in order and one controller never takes two seats', () => {
  const r = rig();
  r.slots[0] = pad(0); r.slots[1] = pad(1);
  r.tap(r.slots[1], BTN.A);
  r.tap(r.slots[1], BTN.A);
  eq(r.adapter.seats.map((s) => s.padIndex), [1, null, null]);
  r.tap(r.slots[0], BTN.A);
  eq(r.adapter.seats.map((s) => s.padIndex), [1, 0, null]);
});

test('the A press that joins is not also seen as an action', () => {
  const r = rig();
  r.slots[0] = pad(0);
  press(r.slots[0], BTN.A);
  const ev = r.step();
  ok(ev.some((e) => e.type === 'join'));
  ok(!r.adapter.seats[0].pressed(BTN.A), 'join press leaked');
  ok(r.adapter.seats[0].held(BTN.A), 'held state should still show');
});

test('inputs stay separate per seat', () => {
  const r = rig(); joinThree(r);
  press(r.slots[1], BTN.Y); r.slots[2].axes = [1, 0, 0, 0];
  r.step();
  const [a, b, c] = r.adapter.seats;
  ok(!a.held(BTN.Y) && b.held(BTN.Y) && !c.held(BTN.Y));
  eq([a.stick(0).x, b.stick(0).x, c.stick(0).x], [0, 0, 1]);
});

test('disconnect keeps the seat; same slot coming back restores it automatically', () => {
  const r = rig(); joinThree(r);
  const saved = r.slots[1]; r.slots[1] = null;
  let ev = r.step();
  eq(ev.filter((e) => e.type === 'disconnect').map((e) => e.seat), [2]);
  eq(r.adapter.seats[1].state, 'disconnected');
  r.slots[1] = saved;
  ev = r.step();
  eq(ev.filter((e) => e.type === 'rejoin').map((e) => [e.seat, e.how]), [[2, 'same-slot']]);
  eq(r.adapter.seats.map((s) => s.state), ['active', 'active', 'active']);
});

test('controller returning in a different slot gets its seat back by pressing A', () => {
  const r = rig(); joinThree(r);
  r.slots[0] = null; r.step();
  r.slots[3] = pad(3);
  r.step();
  eq(r.adapter.seats[0].state, 'disconnected', 'should wait for A');
  r.tap(r.slots[3], BTN.A);
  eq([r.adapter.seats[0].state, r.adapter.seats[0].padIndex], ['active', 3]);
  eq(r.adapter.seats[1].padIndex, 1); eq(r.adapter.seats[2].padIndex, 2);
});

test('two dropped seats are restored oldest first', () => {
  const r = rig(); joinThree(r);
  r.slots[2] = null; r.step();
  r.slots[0] = null; r.step();
  r.slots[5] = pad(5); r.tap(r.slots[5], BTN.A);
  eq(r.adapter.seats[2].padIndex, 5);
  eq(r.adapter.seats[0].state, 'disconnected');
});

test('a 4th controller cannot join when joining is closed', () => {
  const r = rig(); joinThree(r);
  r.adapter.joinOpen = false;
  r.slots[3] = pad(3);
  const ev = r.tap(r.slots[3], BTN.A);
  ok(ev.some((e) => e.type === 'unassigned-press'));
});

test('a different device in a seat\'s slot counts as a disconnect', () => {
  const r = rig(); joinThree(r);
  r.slots[0] = pad(0, 'Some Other Pad');
  const ev = r.step();
  ok(ev.some((e) => e.type === 'disconnect' && e.seat === 1));
});

test('leave frees a seat', () => {
  const r = rig(); joinThree(r);
  r.adapter.leave(r.adapter.seats[1]);
  eq(r.adapter.seats[1].state, 'empty');
});

// ---- 30 s test ----
function runner() {
  const r = rig(); joinThree(r);
  const run = new TestRun(r.adapter.seats);
  const tick = (ms = 16) => { const ev = r.step(ms); run.update(r.now(), ev); };
  const P = r.slots;
  return { r, run, tick, P };
}
function holdFor(tick, ms) { for (let t = 0; t < ms; t += 16) tick(); }
function playPerfect(x) {
  const { run, tick, P } = x;
  P.forEach((p) => press(p, BTN.A)); holdFor(tick, 2100);
  P.forEach((p) => press(p, BTN.A, false));
  P[0].axes = [-1, 0, 0, 0]; P[1].axes = [0, -1, 0, 0]; P[2].axes = [1, 0, 0, 0]; holdFor(tick, 2100);
  P.forEach((p) => { p.axes = [0, 0, 0, 0]; });
  press(P[1], BTN.MENU); tick(); press(P[1], BTN.MENU, false); tick();
  eq(run.phase, 'paused');
  const before = run.elapsed; holdFor(tick, 1000); eq(run.elapsed, before, 'timer must stop while paused');
  press(P[2], BTN.A); tick(); press(P[2], BTN.A, false); tick();
  eq(run.phase, 'running');
  for (let k = 0; k < 3; k++) {
    press(P[0], BTN.X); press(P[1], BTN.Y); press(P[2], BTN.B); tick();
    press(P[0], BTN.X, false); press(P[1], BTN.Y, false); press(P[2], BTN.B, false); tick();
  }
  P.forEach((p) => { p.buttons[BTN.RT] = { pressed: true, value: 0.9 }; p.axes = [0, 0, 0.9, 0.2]; });
  holdFor(tick, 2100);
}

test('full perfect run passes every 30 s check', () => {
  const x = runner();
  playPerfect(x);
  eq(x.run.taskIdx, 5, 'all tasks done');
  holdFor(x.tick, TEST_MS);
  eq(x.run.phase, 'done');
  const checks = x.run.checks();
  ok(checks.every((c) => c.pass), JSON.stringify(checks.filter((c) => !c.pass)));
});

test('a seat that never holds A is named as the failed seat', () => {
  const x = runner();
  press(x.P[0], BTN.A); press(x.P[2], BTN.A);
  holdFor(x.tick, TEST_MS + 100);
  const simul = x.run.checks().find((c) => c.id === 'simul');
  ok(!simul.pass); eq(simul.seats, [2]);
});

test('holding apart (never together) fails everyone and does not complete', () => {
  const x = runner();
  for (let i = 0; i < 3; i++) { press(x.P[i], BTN.A); holdFor(x.tick, 2100); press(x.P[i], BTN.A, false); }
  eq(x.run.taskIdx, 0);
});

test('stick pointing the wrong way does not count', () => {
  const x = runner();
  x.P.forEach((p) => press(p, BTN.A)); holdFor(x.tick, 2100); x.P.forEach((p) => press(p, BTN.A, false));
  x.P.forEach((p) => { p.axes = [1, 0, 0, 0]; }); holdFor(x.tick, 3000);
  eq(x.run.task.id, 'sticks');
  ok(!x.run.seatOk(0) && !x.run.seatOk(1) && x.run.seatOk(2));
});

test('a dropped controller during the test fails stability for that seat', () => {
  const x = runner();
  x.r.slots[2] = null; x.tick();
  holdFor(x.tick, TEST_MS);
  const st = x.run.checks().find((c) => c.id === 'stable');
  ok(!st.pass); eq(st.seats, [3]);
});

test('browser losing focus right after B is blamed on that seat', () => {
  const x = runner();
  press(x.P[2], BTN.B); x.tick();
  x.run.noteNav('tried to go back');
  holdFor(x.tick, TEST_MS);
  const nav = x.run.checks().find((c) => c.id === 'nav');
  ok(!nav.pass); eq(nav.seats, [3]); ok(/P3 pressed B/.test(nav.note));
});

test('View also pauses and is reported', () => {
  const x = runner();
  press(x.P[0], BTN.VIEW); x.tick();
  eq(x.run.phase, 'paused');
  ok(x.run.pause.via.has('View'));
});

// ---- reconnect ----
function reconnectRig() {
  const r = rig(); joinThree(r);
  const rc = new ReconnectCheck(r.adapter.seats);
  const tick = (ms = 16) => { const ev = r.step(ms); rc.update(r.now(), ev); };
  return { r, rc, tick };
}
test('reconnect passes when the dropped seat returns and the player confirms', () => {
  const { r, rc, tick } = reconnectRig();
  const saved = r.slots[1]; r.slots[1] = null; tick();
  eq(rc.state, 'waiting-return');
  r.slots[1] = saved; tick();
  eq(rc.state, 'confirm');
  press(saved, BTN.A); tick();
  eq(rc.state, 'pass');
});
test('reconnect via a new slot plus A also passes', () => {
  const { r, rc, tick } = reconnectRig();
  r.slots[0] = null; tick();
  r.slots[4] = pad(4); press(r.slots[4], BTN.A); tick(); press(r.slots[4], BTN.A, false); tick();
  eq(rc.state, 'confirm');
  press(r.slots[4], BTN.A); tick();
  eq(rc.state, 'pass');
});
test('player saying "wrong seat" fails reconnect', () => {
  const { r, rc, tick } = reconnectRig();
  const saved = r.slots[2]; r.slots[2] = null; tick(); r.slots[2] = saved; tick();
  press(saved, BTN.X); tick();
  eq(rc.state, 'fail'); eq(rc.check().seats, [3]);
});
test('X skips reconnect → INCOMPLETE verdict', () => {
  const { r, rc, tick } = reconnectRig();
  press(r.slots[0], BTN.X); tick();
  eq(rc.state, 'skipped');
  eq(verdict([{ pass: true }, rc.check()]), 'INCOMPLETE');
});
test('reconnect times out', () => {
  const { rc, tick } = reconnectRig();
  tick(); tick(130000);
  eq(rc.state, 'fail');
});
test('verdict', () => {
  eq(verdict([{ pass: true }, { pass: true }]), 'PASS');
  eq(verdict([{ pass: true }, { pass: false }]), 'FAIL');
});

// ---- report ----
const failed = results.filter((r) => !r.ok);
document.getElementById('out').innerHTML =
  `<h1>${failed.length ? 'FAILED' : 'ALL PASS'}: ${results.length - failed.length}/${results.length}</h1>` +
  results.map((r) => `<div class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : ' — ' + r.err}</div>`).join('');
window.__testResults = { total: results.length, failed: failed.map((f) => `${f.name}: ${f.err}`) };
