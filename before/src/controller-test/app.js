// Milestone 0 page: join → 30 s test (with pause) → reconnect → result.
import { InputAdapter, BTN, BUTTON_NAMES } from '../input/gamepad-adapter.js';
import { TestRun, ReconnectCheck, verdict, TEST_MS, HOLD_MS, TAPS } from './test-run.js';

export const BUILD = 'm0-2026-11-19.1';

const params = new URLSearchParams(location.search);
const SEAT_COUNT = Math.min(3, Math.max(1, parseInt(params.get('seats') || '3', 10) || 3));
const SHAPES = ['▲', '●', '■'];

// Legacy Edge on Xbox: ask for raw gamepad input instead of mouse emulation.
try { if ('gamepadInputEmulation' in navigator) navigator.gamepadInputEmulation = 'gamepad'; } catch (e) { /* ignore */ }

const input = new InputAdapter({ seatCount: SEAT_COUNT });
const $ = (id) => document.getElementById(id);

const diag = { keys: [], mouseMoves: 0, clicks: 0, wheels: 0, navLog: [], ua: navigator.userAgent, osInfo: '' };
let screen = 'join'; // join | test | reconnect | result
let run = null;
let reconnect = null;
let lastChecks = null;
let viewHold = {};

// ---------- browser guards ----------
function logNav(kind) {
  diag.navLog.push(`${screen}: ${kind}`);
  if (screen === 'test' && run) run.noteNav(kind);
}
history.pushState({ lca: 1 }, '');
addEventListener('popstate', () => { history.pushState({ lca: 1 }, ''); logNav('tried to go back'); });
addEventListener('blur', () => logNav('lost focus'));
document.addEventListener('visibilitychange', () => { if (document.hidden) logNav('was hidden'); });
addEventListener('beforeunload', (e) => {
  if (screen === 'test' || screen === 'reconnect') { e.preventDefault(); e.returnValue = ''; }
});
addEventListener('keydown', (e) => {
  if (!diag.keys.includes(e.key)) diag.keys.push(e.key);
  if (diag.keys.length > 10) diag.keys.shift();
  if (e.key !== 'F5' && e.key !== 'F11') e.preventDefault();
}, { capture: true });
addEventListener('mousemove', () => { diag.mouseMoves++; }, { passive: true });
for (const t of ['mousedown', 'click', 'contextmenu', 'auxclick']) {
  addEventListener(t, (e) => { if (t === 'mousedown') diag.clicks++; e.preventDefault(); }, { capture: true });
}
addEventListener('wheel', (e) => { diag.wheels++; e.preventDefault(); }, { passive: false });

if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
  navigator.userAgentData.getHighEntropyValues(['platform', 'platformVersion', 'model', 'fullVersionList'])
    .then((v) => {
      const edge = (v.fullVersionList || []).find((b) => /Edge/i.test(b.brand));
      diag.osInfo = [v.platform, v.platformVersion, v.model, edge ? `Edge ${edge.version}` : ''].filter(Boolean).join(' · ');
    }).catch(() => {});
}

// ---------- rendering ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cache = new Map();
function setHTML(el, html) {
  if (cache.get(el) !== html) { cache.set(el, html); el.innerHTML = html; }
}

function btn(seat, b, label = BUTTON_NAMES[b]) {
  return `<span class="b ${seat.buttons[b] ? 'on' : ''}">${label}</span>`;
}
function stickHTML(seat, which, label) {
  const s = seat.stick(which);
  const x = (s.x * 38).toFixed(1), y = (s.y * 38).toFixed(1);
  return `<div class="stick ${s.mag > 0.6 ? 'on' : ''}"><i style="transform:translate(${x}%,${y}%)"></i><em>${label}</em></div>`;
}
function trig(seat, b, label) {
  const v = seat.values[b];
  return `<div class="trig ${v > 0.5 ? 'on' : ''}"><em>${label}</em><b style="width:${Math.round(v * 100)}%"></b></div>`;
}

function seatHTML(seat, i) {
  let stateText = 'PRESS  A  TO JOIN';
  if (seat.state === 'active') stateText = `READY · controller slot ${seat.padIndex}`;
  if (seat.state === 'disconnected') stateText = 'CONTROLLER OFF · seat saved — press A to come back';
  let goal = '';
  if (screen === 'test' && run && run.task && run.phase !== 'done') {
    const t = run.task;
    const ok = run.seatOk(i);
    const extra = t.kind === 'taps' ? ` (${Math.min(t.taps[i], TAPS)}/${TAPS})` : '';
    goal = `<div class="goal ${ok ? 'ok' : ''}">${ok ? '✔ ' : ''}${esc(t.goal(i))}${extra}</div>`;
  }
  const pad = seat.state === 'empty' ? '' : `
    <div class="pad">
      <div class="row">${trig(seat, BTN.LT, 'LT')}${trig(seat, BTN.RT, 'RT')}</div>
      <div class="row">${btn(seat, BTN.LB)}${btn(seat, BTN.VIEW)}${btn(seat, BTN.MENU, 'Menu≡')}${btn(seat, BTN.RB)}</div>
      <div class="row mid">
        ${stickHTML(seat, 0, 'L')}
        <div class="face">${btn(seat, BTN.Y)}<div>${btn(seat, BTN.X)}${btn(seat, BTN.B)}</div>${btn(seat, BTN.A)}</div>
      </div>
      <div class="row mid">
        <div class="dpad">${btn(seat, BTN.UP, '▲')}<div>${btn(seat, BTN.LEFT, '◀')}${btn(seat, BTN.RIGHT, '▶')}</div>${btn(seat, BTN.DOWN, '▼')}</div>
        ${stickHTML(seat, 1, 'R')}
      </div>
      <div class="row">${btn(seat, BTN.LS, 'L-click')}${btn(seat, BTN.RS, 'R-click')}</div>
    </div>`;
  return `<div class="seat p${seat.n} st-${seat.state}">
    <div class="tag"><span class="shape">${SHAPES[i]}</span><span class="num">P${seat.n}</span></div>
    <div class="state">${stateText}</div>${goal}${pad}</div>`;
}

function bannerHTML() {
  if (screen === 'join') {
    const filled = input.activeCount;
    if (input.allFilled) return `<h2>All ${SEAT_COUNT} seats ready</h2><p>Any player: press <b>X</b> or <b>Menu ≡</b> to start the 30-second test.</p><p class="small">Hold <b>View</b> for 2 seconds to leave a seat.</p>`;
    return `<h2>Each player: press <b>A</b> on your controller</h2><p>${filled} of ${SEAT_COUNT} seats filled. No controller showing? Press any button once — the browser only shows controllers after a press.</p>`;
  }
  if (screen === 'test' && run) {
    const secs = Math.ceil(run.remaining / 1000);
    const t = run.task;
    const step = t ? `Step ${run.taskIdx + 1} of ${run.tasks.length}` : 'All steps done';
    const title = t ? (t.kind === 'together' ? `${t.title} <span class="small">(together for ${HOLD_MS / 1000} s)</span>` : t.title)
      : 'FREE PLAY — everyone mash buttons and move both sticks!';
    const prog = Math.round(run.holdProgress() * 100);
    return `<div class="timer">${secs}</div><h2>${title}</h2><p>${step}</p><div class="bar"><b style="width:${prog}%"></b></div>`;
  }
  if (screen === 'reconnect' && reconnect) {
    const r = reconnect;
    if (r.state === 'waiting-drop') return `<h2>Reconnect check</h2><p>Pick one player. <b>Pull the batteries out of their controller</b> (or hold its Xbox button and choose Turn off controller).</p><p class="small">Press X on any controller to skip this check.</p>`;
    if (r.state === 'waiting-return') return `<h2>P${r.seat} is off. Seat ${r.seat} is saved.</h2><p>Put the batteries back (or press its Xbox button), then press <b>A</b> on that controller.</p>`;
    if (r.state === 'confirm') return `<h2>P${r.seat} is back</h2><p>Player ${r.seat}: is the <b>P${r.seat}</b> card moving with your controller? <b>A</b> = yes · <b>X</b> = no</p>`;
  }
  return '';
}

function resultHTML() {
  const checks = lastChecks;
  const v = verdict(checks);
  const failSeats = [...new Set(checks.flatMap((c) => (c.pass ? [] : c.seats)))].sort();
  const dry = SEAT_COUNT < 3 ? ` <span class="small">(${SEAT_COUNT}-seat dry run, not a 3-controller result)</span>` : '';
  const rows = checks.map((c) => `<li class="${c.pass ? 'pass' : c.skipped ? 'skip' : 'fail'}">
      <b>${c.pass ? '✔ PASS' : c.skipped ? '– NOT TESTED' : '✘ FAIL'}</b> ${esc(c.label)}
      ${c.seats.length ? `<span class="who">${c.seats.map((n) => 'P' + n).join(' ')}</span>` : ''}
      ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}</li>`).join('');
  const pads = input.seats.map((s) => `P${s.n}: slot ${s.padIndex ?? '-'} · ${esc((s.padId || 'none').slice(0, 60))} · ${esc(s.mapping || 'no standard mapping')}`).join('<br>');
  const code = resultCode(checks, v);
  return `<div class="verdict ${v.toLowerCase()}">${v}${dry}</div>
    ${failSeats.length ? `<div class="failseats">Problem seat${failSeats.length > 1 ? 's' : ''}: ${failSeats.map((n) => 'P' + n).join(', ')}</div>` : ''}
    <ul class="checks">${rows}</ul>
    <div class="diag">
      <div><b>Result code</b> ${esc(code)}</div>
      <div><b>Build</b> ${BUILD} · <b>Device</b> ${esc(diag.osInfo || 'n/a')}</div>
      <div><b>Browser</b> ${esc(diag.ua)}</div>
      <div><b>Controllers</b><br>${pads}</div>
      <div><b>Browser also saw</b> keys: ${esc(diag.keys.join(' ') || 'none')} · mouse moves: ${diag.mouseMoves} · clicks: ${diag.clicks} · scrolls: ${diag.wheels} · longest frame: ${run ? Math.round(run.longestFrame) : 0} ms</div>
      ${diag.navLog.length ? `<div><b>Focus/navigation log</b> ${esc(diag.navLog.slice(-6).join(' · '))}</div>` : ''}
    </div>
    <p class="next">📷 Take a photo of this screen. &nbsp; <b>A</b> run again (same seats) · <b>Y</b> start over with new joins</p>`;
}

export function resultCode(checks, v) {
  const m = { join: 'J', simul: 'S', pause: 'P', stable: 'D', nav: 'N', reconnect: 'R' };
  const parts = checks.map((c) => m[c.id] + (c.pass ? '1' : c.skipped ? '-' : '0'));
  const edg = (diag.ua.match(/Edg\/([\d.]+)/) || [])[1] || '?';
  const xbox = /Xbox/i.test(diag.ua) ? 'XBOX' : 'NOT-XBOX';
  return `${v} ${parts.join('')} ${SEAT_COUNT}P ${xbox} Edg${edg} ${BUILD}`;
}

function render() {
  const seen = input.pads.length;
  setHTML($('status'), `Controllers seen: <b>${seen}</b>${seen ? ' · slots ' + input.pads.map((p) => p.index + (p.seat ? `→P${p.seat}` : '')).join(' ') : ''}`);
  setHTML($('banner'), bannerHTML());
  setHTML($('seats'), input.seats.map(seatHTML).join(''));
  setHTML($('footer'), `Build ${BUILD} · Controller-only: A join · X/Menu start · Menu pause · A resume · <span class="small">Seat numbers stay with the controller that joined.</span>`);
  const ov = $('overlay');
  let ovHTML = '';
  if (screen === 'test' && run && run.phase === 'paused') {
    ovHTML = `<div class="paused"><h2>PAUSED</h2><p>Timer stopped at ${Math.ceil(run.remaining / 1000)} s</p><p><b>A</b> resume · <b>Y</b> quit to the join screen</p></div>`;
  } else if (screen === 'result') {
    ovHTML = `<div class="result">${resultHTML()}</div>`;
  }
  ov.classList.toggle('hidden', !ovHTML);
  setHTML(ov, ovHTML);
}

// ---------- flow ----------
function startTest() {
  input.joinOpen = false;
  run = new TestRun(input.seats);
  reconnect = null;
  diag.navLog = [];
  screen = 'test';
}
function toJoin() {
  input.joinOpen = true;
  run = null; reconnect = null;
  screen = 'join';
}
const anyPressed = (b) => input.seats.some((s) => s.pressed(b));

function frame(now) {
  step(now);
  requestAnimationFrame(frame);
}

function step(now) {
  const events = input.update(now);

  if (screen === 'join') {
    for (const s of input.seats) {
      if (s.held(BTN.VIEW)) {
        viewHold[s.n] = viewHold[s.n] || now;
        if (now - viewHold[s.n] > 2000) { input.leave(s); delete viewHold[s.n]; }
      } else delete viewHold[s.n];
    }
    if (input.allFilled && (anyPressed(BTN.X) || anyPressed(BTN.MENU))) startTest();
  } else if (screen === 'test') {
    if (run.phase === 'paused' && anyPressed(BTN.Y)) { toJoin(); }
    else {
      run.update(now, events);
      if (run.phase === 'done') {
        lastChecks = run.checks();
        reconnect = new ReconnectCheck(input.seats);
        screen = 'reconnect';
      }
    }
  } else if (screen === 'reconnect') {
    reconnect.update(now, events);
    if (['pass', 'fail', 'skipped'].includes(reconnect.state)) {
      lastChecks = [...lastChecks.filter((c) => c.id !== 'reconnect'), reconnect.check()];
      screen = 'result';
    }
  } else if (screen === 'result') {
    if (anyPressed(BTN.Y)) { input.resetAll(); toJoin(); }
    else if (anyPressed(BTN.A)) { if (input.allFilled) startTest(); else toJoin(); }
  }

  render();
}

addEventListener('gamepadconnected', () => {});
requestAnimationFrame(frame);

// Exposed for automated browser checks only.
window.__lca = { input, step, get screen() { return screen; }, get run() { return run; }, get reconnect() { return reconnect; }, get checks() { return lastChecks; }, BUILD };
