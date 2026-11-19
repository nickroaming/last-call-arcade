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
    const peer = new window.Peer(PREFIX + code, { config: ICE, debug: 1 });
    peer.on('open', () => { S.signal = true; $('hostStatus').textContent = 'Room open. Tell the remote player the code.'; render(); });
    peer.on('error', (e) => { $('hostStatus').textContent = 'Error: ' + (e.type || e.message); if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') S.signal = false; render(); });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        S.connected = true; $('hostStatus').textContent = 'Remote player connected.';
        if (stream) peer.call(conn.peer, stream);
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
      conn.on('close', () => { S.connected = false; S.input = null; S.video = null; $('hostStatus').textContent = 'Remote player left. They can join again with the same code.'; render(); });
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
        [S.connected, S.connected === false ? `No room called ${code} (check the code on the TV)` : 'Connected to the Xbox'],
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
    if (!window.Peer) { S.signal = false; render(); return; }
    const peer = new window.Peer({ config: ICE, debug: 1 });
    let conn = null;
    peer.on('open', () => {
      S.signal = true; render();
      conn = peer.connect(PREFIX + code, { serialization: 'json' });
      conn.on('open', () => {
        S.connected = true; render();
        conn.send({ type: 'hello', ua: navigator.userAgent.slice(0, 120) });
        setInterval(() => conn.open && conn.send({ type: 'ping', t: performance.now() }), 500);
      });
      conn.on('data', (m) => {
        if (m && m.type === 'pong') { const r = performance.now() - m.t; S.rtt = S.rtt == null ? r : S.rtt * 0.7 + r * 0.3; }
        if (m && m.type === 'hping') conn.send({ type: 'hpong', t: m.t });
      });
      conn.on('close', () => { S.connected = false; render(); });
    });
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') S.connected = false;
      else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') S.signal = false;
      $('joinStats').textContent = 'Error: ' + (e.type || e.message);
      render();
    });
    peer.on('call', (call) => {
      call.answer();
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

  // ---------------- choose ----------------
  $('hostBtn').onclick = host;
  $('joinBtn').onclick = () => join($('codeIn').value);
  $('codeIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') join($('codeIn').value); });
  const q = new URLSearchParams(location.search);
  if (q.get('join')) join(q.get('join'));
  else if (q.has('host')) host();
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
