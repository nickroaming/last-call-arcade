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
    b[0] = k.has('Space'); b[2] = k.has('KeyF'); b[5] = k.has('KeyG'); b[9] = k.has('Enter');
    return { b, a: [(k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0), (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0), 0, 0], src: 'keyboard (WASD, Space, F, G)' };
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
  let wake = null;
  async function keepAwake() {
    try { if (navigator.wakeLock && !document.hidden) { wake = await navigator.wakeLock.request('screen'); note('Screen will stay on'); } } catch (e) { note('Screen-on needs a tap first (' + e.name + ')'); const again = () => { removeEventListener('pointerdown', again); removeEventListener('keydown', again); keepAwake(); }; addEventListener('pointerdown', again); addEventListener('keydown', again); }
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

  const keys = new Set();
  addEventListener('keydown', (e) => { if (document.activeElement && document.activeElement.tagName === 'INPUT') return; keys.add(e.code); });
  addEventListener('keyup', (e) => keys.delete(e.code));

  // ---------------- HOST ----------------
  function host() {
    show('host');
    const canvas = $('stage');
    const c = canvas.getContext('2d');
    let frame = 0;
    let remote = null; // latest remote pad
    const S = {
      signal: null, capture: typeof canvas.captureStream === 'function', connected: false, video: null, input: null, rtt: null,
      padsPerSec: 0, pressed: false, peerUA: '', vfps: 0, vsize: '',
    };
    let padCount = 0;
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
        c.fillStyle = b.c; c.fillRect(b.x, b.y, 30, 30);
      }
      c.fillStyle = '#fff'; c.font = 'bold 40px monospace'; c.fillText('LAST CALL ONLINE TEST', 20, 44);
      c.font = 'bold 28px monospace'; c.fillText(`frame ${frame}`, 20, 344);
      // the remote player's cursor: proves their input reaches the host
      if (remote) {
        const rx = 320 + remote.a[0] * 260, ry = 190 + remote.a[1] * 140;
        c.fillStyle = remote.b[0] ? '#ffffff' : '#ff5fd2';
        c.beginPath(); c.arc(rx, ry, remote.b[0] ? 26 : 18, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#000'; c.font = 'bold 18px monospace'; c.fillText('P4', rx - 11, ry + 6);
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    let stream = null;
    try { stream = canvas.captureStream(30); } catch (e) { S.capture = false; }

    function render() {
      const rttOk = S.rtt == null ? null : S.rtt < 250;
      const list = [
        [S.capture, 'This browser can send video (canvas capture)'],
        [S.signal, S.signal === false ? 'Could not reach the connection service' : 'Room is open (connection service reached)'],
        [S.connected || null, S.connected ? 'Remote player connected directly' : 'Waiting for the remote player to join'],
        [S.video, S.video ? `Video reaching them: ${S.vfps} fps, ${S.vsize}` : S.video === false ? 'Video is not reaching them' : 'Video reaching them'],
        [S.input, S.input ? `Their controller arrives here: ${S.padsPerSec}/s${S.pressed ? ', buttons seen' : ', press A on it'}` : 'Their controller arrives here'],
        [rttOk, S.rtt == null ? 'Delay (round trip)' : `Delay (round trip): ${Math.round(S.rtt)} ms ${S.rtt < 120 ? '(great)' : S.rtt < 250 ? '(fine)' : '(laggy)'}`],
      ];
      checks($('hostChecks'), list);
      const all = list.every(([s]) => s === true);
      const fail = list.some(([s]) => s === false);
      const v = $('hostVerdict');
      v.textContent = all && S.pressed ? 'PASS' : fail ? 'FAIL' : 'WAITING';
      v.className = 'verdict ' + (all && S.pressed ? 'ok' : fail ? 'no' : 'wait');
      $('remotePad').innerHTML = padHTML(remote);
      $('hostStats').textContent = S.peerUA ? `Their browser: ${S.peerUA}` : '';
    }
    setInterval(() => { S.padsPerSec = padCount; padCount = 0; if (S.connected) S.input = S.padsPerSec >= 10; render(); }, 1000);
    render();

    const code = newCode();
    $('codeOut').textContent = code;
    $('hostStatus').textContent = 'Opening the room…';
    if (!window.Peer) { S.signal = false; $('hostStatus').textContent = 'The connection library did not load.'; render(); return; }
    keepAwake();
    note(`Hosting room ${code}`);
    const sp = steadyPeer(PREFIX + code, (state, why, n) => {
      if (state === 'open') { S.signal = true; $('hostStatus').textContent = 'Room open. Tell the remote player the code.'; }
      else if (state === 'retry') { S.signal = null; $('hostStatus').textContent = `Connection service lost (${why}). Reconnecting, try ${n}…`; }
      else { S.signal = false; $('hostStatus').textContent = 'Cannot reach the connection service. Run the network check.'; }
      render();
    });
    sp.on('connection', (conn) => {
      note('Remote player knocking…');
      conn.on('open', () => {
        S.connected = true; $('hostStatus').textContent = 'Remote player connected.';
        note('Remote player connected');
        if (stream) { const call = sp.peer.call(conn.peer, stream); if (call) call.on('error', (e) => note('Video error: ' + e.type)); }
        if (conn.peerConnection) conn.peerConnection.addEventListener('iceconnectionstatechange', () => note('Direct link: ' + conn.peerConnection.iceConnectionState));
        setInterval(() => { if (conn.open) conn.send({ type: 'hping', t: performance.now() }); }, 500);
        render();
      });
      conn.on('data', (m) => {
        if (!m || !m.type) return;
        if (m.type === 'pad') { remote = m.pad; padCount++; if (m.pad.b.some(Boolean)) S.pressed = true; }
        else if (m.type === 'ping') conn.send({ type: 'pong', t: m.t });
        else if (m.type === 'hpong') { const r = performance.now() - m.t; S.rtt = S.rtt == null ? r : S.rtt * 0.7 + r * 0.3; }
        else if (m.type === 'hello') S.peerUA = m.ua;
        else if (m.type === 'stats') { S.vfps = m.fps; S.vsize = m.size; S.video = m.fps >= 8; }
      });
      conn.on('error', (e) => note('Player link error: ' + (e.type || e.message)));
      conn.on('close', () => { S.connected = false; S.input = null; S.video = null; note('Remote player left'); $('hostStatus').textContent = 'Remote player left. They can join again with the same code.'; render(); });
    });
  }

  // ---------------- JOIN ----------------
  function join(code) {
    show('join');
    code = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    const S = { signal: null, connected: null, video: null, gamepad: !!navigator.getGamepads, rtt: null, fps: 0 };
    const video = $('remoteVideo');
    function render() {
      const list = [
        [S.signal, S.signal === false ? 'Could not reach the connection service' : 'Connection service reached'],
        [S.connected, S.connected === false ? `No room called ${code} (check the code on the TV)` : S.connected ? 'Connected to the Xbox' : 'Connecting to the Xbox'],
        [S.video, S.video ? `Video playing: ${S.fps} fps` : 'Video playing'],
        [S.gamepad && padSeen ? true : S.gamepad ? null : false, padSeen ? 'Your controller is being read' : S.gamepad ? 'Press a button on your controller' : 'This browser cannot read controllers'],
        [S.rtt == null ? null : S.rtt < 250, S.rtt == null ? 'Delay (round trip)' : `Delay (round trip): ${Math.round(S.rtt)} ms`],
      ];
      checks($('joinChecks'), list);
      const ok = list.every(([s]) => s === true), bad = list.some(([s]) => s === false);
      $('joinVerdict').textContent = ok ? 'PASS' : bad ? 'FAIL' : 'CONNECTING';
      $('joinVerdict').className = 'verdict ' + (ok ? 'ok' : bad ? 'no' : 'wait');
    }
    let padSeen = false;
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
      $('joinStats').textContent = `Video ${video.videoWidth}x${video.videoHeight}`;
      render();
    }, 1000);
    function loop() {
      const pad = readPad();
      if (pad.src && !pad.src.startsWith('keyboard')) padSeen = true;
      if (pad.src.startsWith('keyboard') && pad.b.some(Boolean)) padSeen = true;
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
  const q = new URLSearchParams(location.search);
  if (q.get('join')) join(q.get('join'));
  else if (q.has('host')) host();
  else if (q.has('check')) runCheck();
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
