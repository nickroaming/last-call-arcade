// Online seat test. The host (Xbox) streams a test picture and receives the
// remote player's controller; the joiner (brother) watches and sends input.
// Connection setup goes through the free public PeerJS service; the video and
// controller data then flow directly between the two browsers (WebRTC).
(() => {
  const $ = (id) => document.getElementById(id);
  const PREFIX = 'lastcallarcade-';
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
  const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '▲', '▼', '◀', '▶'];
  const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  const show = (id) => { ['choose', 'host', 'join'].forEach((s) => $(s).classList.toggle('hidden', s !== id)); };

  function checks(el, list) {
    el.innerHTML = list.map(([state, text]) => `<li class="${state === true ? 'pass' : state === false ? 'fail' : 'wait'}">${text}</li>`).join('');
  }
  function padHTML(p) {
    if (!p) return '<div class="small">No controller input yet</div>';
    const btns = NAMES.map((n, i) => `<span class="b ${p.b[i] ? 'on' : ''}">${n}</span>`).join('');
    const st = (x, y) => `<span class="stick"><i style="transform:translate(${(x * 1.4).toFixed(2)}em,${(y * 1.4).toFixed(2)}em)"></i></span>`;
    return `<div>${st(p.a[0], p.a[1])} ${st(p.a[2], p.a[3])}</div><div class="pad">${btns}</div><div class="small">${p.src || ''}</div>`;
  }
  function readPad() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const gp = pads[0];
    if (gp) return { b: Array.from({ length: 16 }, (_, i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5))), a: [0, 1, 2, 3].map((i) => +(gp.axes[i] || 0).toFixed(2)), src: gp.id.slice(0, 50) };
    // keyboard fallback so a laptop without a controller can still test
    const k = keys;
    const b = Array(16).fill(false);
    b[0] = k.has('Space') || touch.a; b[1] = touch.b; b[2] = k.has('KeyF'); b[5] = k.has('KeyG'); b[9] = k.has('Enter');
    const kx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0), ky = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
    return { b, a: [touch.on ? touch.x : kx, touch.on ? touch.y : ky, 0, 0], src: touch.used ? 'touch screen' : 'keyboard (WASD, Space)' };
  }
  // ---------------- event log ----------------
  const t0 = performance.now();
  const logLines = [];
  function note(msg) {
    const s = ((performance.now() - t0) / 1000).toFixed(1).padStart(6);
    logLines.push(`${s}s  ${msg}`);
    if (logLines.length > 60) logLines.shift();
    if ($('log')) $('log').textContent = logLines.slice(-14).join('\n');
  }
  addEventListener('online', () => note('Device: internet back'));
  addEventListener('offline', () => note('Device: internet LOST'));
  document.addEventListener('visibilitychange', () => note(document.hidden ? 'Page hidden (app switched or screen locked)' : 'Page visible again'));

  // Keep the screen awake: a locked phone closes the page's connections.
  let wake = null, wakeFails = 0;
  async function keepAwake() {
    if (!navigator.wakeLock || document.hidden || wakeFails > 2) return;
    try { wake = await navigator.wakeLock.request('screen'); note('Screen will stay on'); }
    catch (e) {
      if (++wakeFails === 1) note('Screen-on needs a tap first');
      if (wakeFails <= 2) addEventListener('pointerdown', keepAwake, { once: true });
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && wake !== null) keepAwake(); });

  // A PeerJS peer that heals itself. Losing the connection service never ends
  // an established player link; it only stops new joins, so we reconnect.
  const RETRYABLE = ['network', 'socket-error', 'socket-closed', 'server-error', 'unavailable-id'];
  function steadyPeer(id, onState) {
    let peer = null, tries = 0, timer = null;
    const handlers = [];
    function make() {
      peer = id ? new window.Peer(id, { config: ICE, debug: 1 }) : new window.Peer({ config: ICE, debug: 1 });
      peer.on('open', () => { tries = 0; note('Connection service: connected'); onState('open'); });
      peer.on('disconnected', () => { note('Connection service: dropped'); retry('dropped'); });
      peer.on('error', (e) => {
        note('Error: ' + e.type + (e.message ? ' (' + String(e.message).slice(0, 70) + ')' : ''));
        if (RETRYABLE.includes(e.type)) retry(e.type);
      });
      for (const [ev, fn] of handlers) peer.on(ev, fn);
      window.__peers = (window.__peers || []).concat(peer); // for lab tests
    }
    function retry(why) {
      if (timer) return;
      tries++;
      const wait = Math.min(15000, 1000 * 2 ** Math.min(tries - 1, 4));
      onState(tries > 8 ? 'down' : 'retry', why, tries);
      note(`Retrying in ${wait / 1000}s (attempt ${tries})`);
      timer = setTimeout(() => {
        timer = null;
        if (peer.destroyed) { make(); return; }
        if (peer.disconnected) { try { peer.reconnect(); } catch (e) { peer.destroy(); make(); } }
      }, wait);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !peer || !(peer.disconnected || peer.destroyed)) return;
      clearTimeout(timer); timer = null; tries = 0; retry('back on screen');
    });
    make();
    return { on(ev, fn) { handlers.push([ev, fn]); peer.on(ev, fn); }, get peer() { return peer; } };
  }

  // on-screen stick and buttons for phones
  const touch = { on: false, x: 0, y: 0, a: false, b: false, used: false };
  function setupTouch() {
    $('touch').classList.remove('hidden');
    const zone = $('stickZone'), knob = $('stickKnob');
    let pid = null;
    const move = (e) => {
      const r = zone.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      touch.x = +x.toFixed(2); touch.y = +y.toFixed(2);
      knob.style.transform = `translate(${x * 75}%, ${y * 75}%)`;
    };
    zone.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; zone.setPointerCapture(pid); touch.on = touch.used = true; move(e); });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
    const end = (e) => { if (e.pointerId !== pid) return; pid = null; touch.on = false; touch.x = touch.y = 0; knob.style.transform = ''; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    for (const [id, key] of [['tA', 'a'], ['tB', 'b']]) {
      const el = $(id);
      const set = (v) => (e) => { e.preventDefault(); touch[key] = v; if (v) touch.used = true; el.classList.toggle('on', v); if (v && navigator.vibrate) navigator.vibrate(10); };
      el.addEventListener('pointerdown', set(true)); el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false)); el.addEventListener('pointerleave', set(false));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  const keys = new Set();
  addEventListener('keydown', (e) => { if (document.activeElement && document.activeElement.tagName === 'INPUT') return; keys.add(e.code); });
  addEventListener('keyup', (e) => keys.delete(e.code));

  // ---------------- HOST ----------------
  const COLORS = ['#ff5fd2', '#33d6ff', '#7dff8a', '#ffd84a', '#ff9a2e', '#b48cff', '#ffffff', '#ff5a5a'];
  function deviceName(ua) {
    if (!ua) return 'connecting…';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/PlayStation/.test(ua)) return 'PS4/PS5';
    if (/Xbox/.test(ua)) return 'Xbox';
    if (/Mac OS X/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'PC';
    return 'browser';
  }
  let started = false;
  function host() {
    if (started) return; started = true;
    show('host');
    const canvas = $('stage');
    const c = canvas.getContext('2d');
    let frame = 0;
    const players = new Map(); // peer id -> { n, color, pad, count, perSec, rtt, fps, ua, pressed, conn }
    let nextN = 1;
    const S = { signal: null, capture: typeof canvas.captureStream === 'function' };
    const boxes = Array.from({ length: 6 }, (_, i) => ({ x: 60 + i * 90, y: 80 + (i % 3) * 70, vx: 140 + i * 20, vy: 110 - i * 15, c: ['#ff9a2e', '#33d6ff', '#ff5fd2', '#7dff8a', '#ffd84a', '#b48cff'][i] }));
    let last = performance.now();
    function draw(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      frame++;
      c.fillStyle = '#140b2a'; c.fillRect(0, 0, 640, 360);
      for (let x = 0; x < 640; x += 40) { c.fillStyle = x % 80 ? '#1d1240' : '#22164a'; c.fillRect(x, 0, 40, 360); }
      for (const b of boxes) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < 0 || b.x > 610) b.vx *= -1; if (b.y < 40 || b.y > 330) b.vy *= -1;
        c.globalAlpha = 0.45; c.fillStyle = b.c; c.fillRect(b.x, b.y, 30, 30); c.globalAlpha = 1;
      }
      c.fillStyle = '#fff'; c.font = 'bold 36px monospace'; c.fillText('LAST CALL ONLINE TEST', 20, 44);
      c.font = 'bold 22px monospace'; c.fillText(players.size ? 'move your stick, press A' : 'waiting for players…', 20, 344);
      // each player's dot: proves their input reaches the TV and comes back in the video
      for (const p of players.values()) {
        if (!p.pad) continue;
        const rx = 320 + p.pad.a[0] * 270, ry = 190 + p.pad.a[1] * 130;
        const big = p.pad.b[0];
        c.fillStyle = p.color;
        c.beginPath(); c.arc(rx, ry, big ? 30 : 20, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#000'; c.font = 'bold 22px monospace'; c.fillText(String(p.n), rx - 7, ry + 8);
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    let stream = null;
    try { stream = canvas.captureStream(30); } catch (e) { S.capture = false; }

    function render() {
      const list0 = [...players.values()];
      const any = (f) => list0.some(f);
      const worst = list0.filter((p) => p.rtt != null).reduce((m, p) => Math.max(m, p.rtt), -1);
      const list = [
        [S.capture, S.capture ? 'This TV can send video' : 'This browser cannot send video'],
        [S.signal, S.signal === false ? 'Cannot reach the connection service' : S.signal ? 'Room is open' : 'Opening the room…'],
        [list0.length ? true : null, list0.length ? `${list0.length} player${list0.length > 1 ? 's' : ''} connected` : 'Waiting for a player'],
        [any((p) => p.fps >= 8) ? true : any((p) => p.fps != null && p.fps < 8) ? false : null, 'Video reaching them'],
        [any((p) => p.perSec >= 10) ? true : null, 'Their controls reach the TV'],
        [worst < 0 ? null : worst < 250, worst < 0 ? 'Delay' : `Delay: ${Math.round(worst)} ms ${worst < 120 ? '(great)' : worst < 250 ? '(fine)' : '(laggy)'}`],
      ];
      checks($('hostChecks'), list);
      const all = list.every(([s]) => s === true) && any((p) => p.pressed);
      const fail = list.some(([s]) => s === false);
      const v = $('hostVerdict');
      v.textContent = all ? 'PASS' : fail ? 'PROBLEM' : list0.length ? 'CONNECTING…' : 'WAITING FOR PLAYERS';
      v.className = 'verdict ' + (all ? 'ok' : fail ? 'no' : 'wait');
      $('players').innerHTML = list0.length ? list0.map((p) => `<li><span class="dot" style="background:${p.color}"></span><b>${p.n}</b> ${deviceName(p.ua)}${p.rtt != null ? ` · ${Math.round(p.rtt)} ms` : ''}${p.fps != null ? ` · ${p.fps} fps` : ''}${p.pressed ? ' · ✔' : ''}</li>`).join('') : '<li class="small">Nobody yet</li>';
    }
    setInterval(() => { for (const p of players.values()) { p.perSec = p.count; p.count = 0; } render(); }, 1000);
    render();

    const code = newCode();
    $('codeOut').textContent = code;
    const base = location.href.replace(/[?#].*$/, '').replace(/online-test\.html$/, '');
    const joinUrl = `${base}online-test.html?join=${code}`;
    $('shortUrl').textContent = (base + 'join').replace(/^https?:\/\//, '');
    try {
      const qr = window.qrcode(0, 'M'); qr.addData(joinUrl); qr.make();
      $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) { $('qr').classList.add('hidden'); note('QR code unavailable: ' + e.message); }
    if (!window.Peer) { S.signal = false; $('hostStatus').textContent = 'The connection library did not load. Reload the page.'; render(); return; }
    keepAwake();
    note(`Hosting room ${code}`);
    const sp = steadyPeer(PREFIX + code, (state, why, n) => {
      if (state === 'open') { S.signal = true; $('hostStatus').textContent = 'Ready. Up to 8 players can join.'; }
      else if (state === 'retry') { S.signal = null; $('hostStatus').textContent = `Reconnecting (try ${n})…`; }
      else { S.signal = false; $('hostStatus').textContent = 'Cannot reach the connection service. Reload, or run the check on the first screen.'; }
      render();
    });
    sp.on('connection', (conn) => {
      if (players.size >= 8) { note('Room full: turned a player away'); conn.on('open', () => conn.close()); return; }
      const p = { n: nextN++, pad: null, count: 0, perSec: 0, rtt: null, fps: null, ua: '', pressed: false, conn };
      p.color = COLORS[(p.n - 1) % COLORS.length];
      note(`Player ${p.n} knocking…`);
      let hp = null;
      conn.on('open', () => {
        players.set(conn.peer, p);
        note(`Player ${p.n} connected`);
        if (stream) { const call = sp.peer.call(conn.peer, stream); if (call) call.on('error', (e) => note('Video error: ' + e.type)); }
        if (conn.peerConnection) conn.peerConnection.addEventListener('iceconnectionstatechange', () => note(`Player ${p.n} link: ${conn.peerConnection.iceConnectionState}`));
        hp = setInterval(() => { if (conn.open) conn.send({ type: 'hping', t: performance.now() }); }, 500);
        conn.send({ type: 'welcome', n: p.n, color: p.color });
        render();
      });
      conn.on('data', (m) => {
        if (!m || !m.type) return;
        if (m.type === 'pad') { p.pad = m.pad; p.count++; if (m.pad.b.some(Boolean)) p.pressed = true; }
        else if (m.type === 'ping') conn.send({ type: 'pong', t: m.t });
        else if (m.type === 'hpong') { const r = performance.now() - m.t; p.rtt = p.rtt == null ? r : p.rtt * 0.7 + r * 0.3; }
        else if (m.type === 'hello') p.ua = m.ua;
        else if (m.type === 'stats') p.fps = m.fps;
      });
      conn.on('error', (e) => note(`Player ${p.n} link error: ${e.type || e.message}`));
      conn.on('close', () => { clearInterval(hp); players.delete(conn.peer); note(`Player ${p.n} left`); render(); });
    });
  }

  // ---------------- JOIN ----------------
  function join(code) {
    if (started || !code || code.replace(/[^a-z]/gi, '').length < 4) return; started = true;
    show('join');
    code = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    const S = { signal: null, connected: null, video: null, gamepad: !!navigator.getGamepads, rtt: null, fps: 0 };
    const video = $('remoteVideo');
    function render() {
      const list = [
        [S.signal, S.signal === false ? 'Could not reach the connection service' : 'Connection service reached'],
        [S.connected, S.connected === false ? `No room called ${code} (check the code on the TV)` : S.connected ? 'Connected to the TV' : 'Connecting to the TV'],
        [S.video, S.video ? `Video playing: ${S.fps} fps` : 'Video playing'],
        [padSeen ? true : null, padSeen ? 'Your controls work' : 'Move the stick or press A'],
        [S.rtt == null ? null : S.rtt < 250, S.rtt == null ? 'Delay (round trip)' : `Delay (round trip): ${Math.round(S.rtt)} ms`],
      ];
      checks($('joinChecks'), list);
      const ok = list.every(([s]) => s === true), bad = list.some(([s]) => s === false);
      $('joinVerdict').textContent = ok ? `PASS · you are player ${me || '?'}` : bad ? 'PROBLEM (open Details)' : S.connected ? `You are player ${me || '?'}: move and press A` : 'CONNECTING…';
      $('joinVerdict').className = 'verdict ' + (ok ? 'ok' : bad ? 'no' : 'wait');
      if (meColor) $('joinVerdict').style.color = ok || S.connected ? meColor : '';
    }
    let padSeen = false, me = null, meColor = null;
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) setupTouch();
    if (!window.Peer) { S.signal = false; note('The connection library did not load'); render(); return; }
    keepAwake();
    note(`Joining room ${code}`);
    let conn = null, misses = 0, pinger = null, knockTimer = null;
    const sp = steadyPeer(null, (state, why, n) => {
      if (state === 'open') { S.signal = true; if (!conn || !conn.open) knock(); }
      else if (state === 'retry') { S.signal = null; $('joinStats').textContent = `Connection service lost (${why}). Reconnecting, try ${n}…`; }
      else S.signal = false;
      render();
    });
    function knock() {
      clearTimeout(knockTimer);
      note(`Looking for room ${code}…`);
      conn = sp.peer.connect(PREFIX + code, { serialization: 'json' });
      const mine = conn;
      // no answer in 12 s: the room is gone or the direct link is blocked
      knockTimer = setTimeout(() => { if (mine === conn && !mine.open) { note('No answer from the room (direct link may be blocked)'); mine.close(); retryKnock(); } }, 12000);
      conn.on('open', () => {
        clearTimeout(knockTimer); misses = 0;
        S.connected = true; note('Connected to the host'); render();
        conn.send({ type: 'hello', ua: navigator.userAgent.slice(0, 120) });
        clearInterval(pinger);
        pinger = setInterval(() => conn.open && conn.send({ type: 'ping', t: performance.now() }), 500);
        if (conn.peerConnection) conn.peerConnection.addEventListener('iceconnectionstatechange', () => note('Direct link: ' + conn.peerConnection.iceConnectionState));
      });
      conn.on('data', (m) => {
        if (m && m.type === 'pong') { const r = performance.now() - m.t; S.rtt = S.rtt == null ? r : S.rtt * 0.7 + r * 0.3; }
        if (m && m.type === 'hping') conn.send({ type: 'hpong', t: m.t });
        if (m && m.type === 'welcome') { me = m.n; meColor = m.color; note(`You are player ${me}`); render(); }
      });
      conn.on('error', (e) => note('Link error: ' + (e.type || e.message)));
      conn.on('close', () => { if (mine !== conn) return; if (S.connected) { note('Link to host closed'); S.connected = null; render(); retryKnock(); } });
    }
    function retryKnock() {
      misses++;
      if (misses > 10) { S.connected = false; note('Gave up looking for the room'); render(); return; }
      setTimeout(() => { if (sp.peer.open && (!conn || !conn.open)) knock(); }, 3000);
    }
    sp.on('error', (e) => {
      if (e.type === 'peer-unavailable') { $('joinStats').textContent = `Room ${code} not found yet, retrying (${misses + 1}/10)…`; clearTimeout(knockTimer); retryKnock(); render(); }
    });
    sp.on('call', (call) => {
      note('Video arriving');
      call.answer();
      call.on('error', (e) => note('Video error: ' + e.type));
      call.on('stream', (s) => {
        video.srcObject = s;
        const p = video.play();
        if (p && p.catch) p.catch(() => { $('unmute').classList.remove('hidden'); });
      });
    });
    $('unmute').onclick = () => { video.play(); $('unmute').classList.add('hidden'); };
    let lastFrames = 0;
    setInterval(() => {
      const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
      const total = q ? q.totalVideoFrames : (video.webkitDecodedFrameCount || 0);
      S.fps = total - lastFrames; lastFrames = total;
      S.video = S.connected ? (S.fps >= 8 ? true : video.srcObject ? false : null) : null;
      if (conn && conn.open) conn.send({ type: 'stats', fps: S.fps, size: `${video.videoWidth}x${video.videoHeight}` });
      $('joinStats').textContent = S.connected && S.rtt != null ? `delay ${Math.round(S.rtt)} ms · ${S.fps} fps` : '';
      render();
    }, 1000);
    function loop() {
      const pad = readPad();
      const real = pad.src && !pad.src.startsWith('keyboard') && pad.src !== 'touch screen';
      if (real || pad.b.some(Boolean) || pad.a[0] || pad.a[1]) padSeen = true;
      $('localPad').innerHTML = padHTML(pad);
      if (conn && conn.open) conn.send({ type: 'pad', pad });
      setTimeout(loop, 33);
    }
    loop();
    render();
  }

  // ---------------- network check ----------------
  async function runCheck() {
    const btn = $('checkBtn'); btn.disabled = true; btn.textContent = 'CHECKING…';
    const rows = [
      [null, 'Connection library loaded'],
      [null, 'Connection service answers (web)'],
      [null, 'Full connection on this device (service + direct link)'],
      [null, 'Your internet gives a public address (STUN)'],
      [null, 'Your router allows direct connections between homes'],
      [null, 'Screen can be kept on'],
    ];
    const set = (i, ok, text) => { rows[i] = [ok, text || rows[i][1]]; checks($('netChecks'), rows); note(`Check: ${ok ? 'OK' : ok === false ? 'FAIL' : '?'}  ${rows[i][1]}`); };
    checks($('netChecks'), rows);
    note('Network check started');
    const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);

    set(0, !!window.Peer);

    try {
      const a = performance.now();
      const r = await timeout(fetch('https://0.peerjs.com/peerjs/id?ts=' + Date.now(), { cache: 'no-store' }), 8000);
      set(1, r.ok, `Connection service answers: ${r.status} in ${Math.round(performance.now() - a)} ms`);
    } catch (e) { set(1, false, `Connection service does not answer (${e.message})`); }

    // two peers on this device find each other through the service and talk
    if (window.Peer) {
      let A, B;
      try {
        const a = performance.now();
        A = new window.Peer({ config: ICE, debug: 0 });
        const idA = await timeout(new Promise((res, rej) => { A.on('open', res); A.on('error', (e) => rej(new Error(e.type))); }), 10000);
        B = new window.Peer({ config: ICE, debug: 0 });
        await timeout(new Promise((res, rej) => { B.on('open', res); B.on('error', (e) => rej(new Error(e.type))); }), 10000);
        A.on('connection', (c) => c.on('data', (m) => c.send(m)));
        const c = B.connect(idA, { serialization: 'json' });
        await timeout(new Promise((res, rej) => { c.on('open', () => c.send({ hi: 1 })); c.on('data', res); c.on('error', (e) => rej(new Error(e.type || 'link'))); }), 12000);
        set(2, true, `Full connection on this device works (${Math.round(performance.now() - a)} ms)`);
      } catch (e) { set(2, false, `Full connection on this device failed (${e.message})`); }
      try { A && A.destroy(); B && B.destroy(); } catch (e) { /* ignore */ }
    } else set(2, false);

    // STUN: ask two servers for our public address from one socket. If the
    // router hands out a different port per destination (symmetric NAT),
    // direct links between homes usually fail and a relay is needed.
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] });
      pc.createDataChannel('probe');
      const cands = [];
      pc.onicecandidate = (e) => { if (e.candidate && e.candidate.candidate) cands.push(e.candidate.candidate); };
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise((res) => { const t = setTimeout(res, 5000); pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }; });
      pc.close();
      const srflx = cands.filter((c) => / typ srflx /.test(c)).map((c) => { const p = c.split(' '); return { ip: p[4], port: p[5], base: (c.match(/rport (\d+)/) || [])[1] }; });
      if (!srflx.length) { set(3, false, 'No public address found (STUN blocked: direct links will fail)'); set(4, false, 'Unknown: needs a relay server'); }
      else {
        set(3, true, `Public address found (${srflx[0].ip.replace(/\.\d+\.\d+$/, '.x.x')})`);
        const byBase = {};
        for (const s of srflx) (byBase[s.base] = byBase[s.base] || new Set()).add(s.port);
        const symmetric = Object.values(byBase).some((ports) => ports.size > 1);
        if (symmetric) set(4, false, 'Strict router (symmetric NAT): direct links likely blocked, needs a relay');
        else set(4, true, 'Router keeps the same port: direct links should work');
      }
    } catch (e) { set(3, false, 'Address check failed (' + e.message + ')'); }

    set(5, !!navigator.wakeLock, navigator.wakeLock ? 'Screen can be kept on' : 'Screen cannot be kept on: turn off auto-lock while playing');
    note('Network check finished');
    btn.disabled = false; btn.textContent = 'RUN AGAIN';
  }

  // ---------------- choose ----------------
  $('hostBtn').onclick = host;
  $('checkBtn').onclick = runCheck;
  $('joinBtn').onclick = () => join($('codeIn').value);
  $('codeIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') join($('codeIn').value); });
  $('codeIn').addEventListener('input', (e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); e.target.value = v; if (v.length === 4) { e.target.blur(); join(v); } });
  const q = new URLSearchParams(location.search);
  if (q.get('join')) join(q.get('join'));
  else if (q.has('host')) host();
  else if (q.has('check')) runCheck();
  else if (q.has('typecode')) $('codeIn').focus();
  else {
    // controller-only path on the Xbox: A hosts
    const poll = () => {
      if (!$('choose').classList.contains('hidden')) {
        const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
        if (pads.some((p) => p.buttons[0] && p.buttons[0].pressed)) { host(); return; }
        requestAnimationFrame(poll);
      }
    };
    requestAnimationFrame(poll);
  }
})();
