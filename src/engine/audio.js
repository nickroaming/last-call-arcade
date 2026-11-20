// Original synthesized sound effects and chiptune loops (Web Audio, no files).

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const THEMES = {
  title:  { bpm: 112, root: 45, scale: MINOR, prog: [0, 5, 3, 4], lead: 'square', bass: 'triangle', drums: 1 },
  rumble: { bpm: 140, root: 43, scale: MINOR, prog: [0, 0, 5, 6], lead: 'square', bass: 'sawtooth', drums: 2 },
  dustlap:{ bpm: 150, root: 47, scale: MAJOR, prog: [0, 4, 5, 3], lead: 'square', bass: 'triangle', drums: 2 },
  lounge: { bpm: 124, root: 41, scale: MINOR, prog: [0, 6, 5, 4], lead: 'sawtooth', bass: 'square', drums: 3 },
  coins:  { bpm: 132, root: 48, scale: MAJOR, prog: [0, 3, 4, 0], lead: 'triangle', bass: 'square', drums: 1 },
  results:{ bpm: 100, root: 48, scale: MAJOR, prog: [0, 3, 4, 4], lead: 'triangle', bass: 'triangle', drums: 0 },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.theme = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }
  get blocked() { return !this.ctx || this.ctx.state !== 'running'; }
  /** Call on any input; browsers only allow audio after a user action. */
  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.32;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.38;
        this.musicGain.connect(this.master);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* audio unavailable */ }
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.32;
  }

  tone({ f = 440, f2 = null, type = 'square', dur = 0.1, vol = 0.3, at = 0, dest = null, attack = 0.005 }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = (at || c.currentTime);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise({ dur = 0.15, vol = 0.3, at = 0, hp = 0, lp = 0, dest = null }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = at || c.currentTime;
    if (!this.noiseBuf) {
      this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    let node = s;
    if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(dest || this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  sfx(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'jump': this.tone({ f: 260, f2: 520, dur: 0.09, vol: 0.12 }); break;
      case 'shoot': this.tone({ f: 900, f2: 200, dur: 0.08, vol: 0.13 }); this.noise({ dur: 0.04, vol: 0.08, hp: 2000 }); break;
      case 'hit': this.tone({ f: 180, f2: 60, type: 'sawtooth', dur: 0.14, vol: 0.25 }); this.noise({ dur: 0.1, vol: 0.2, lp: 2000 }); break;
      case 'block': this.tone({ f: 1200, f2: 1500, type: 'triangle', dur: 0.12, vol: 0.2 }); break;
      case 'boom': this.noise({ dur: 0.5, vol: 0.45, lp: 900 }); this.tone({ f: 120, f2: 30, type: 'sine', dur: 0.45, vol: 0.5 }); break;
      case 'ko': this.noise({ dur: 0.7, vol: 0.5, lp: 1200 }); this.tone({ f: 400, f2: 40, type: 'sawtooth', dur: 0.6, vol: 0.3 }); break;
      case 'coin': this.tone({ f: 988, dur: 0.05, vol: 0.13 }); this.tone({ f: 1319, dur: 0.12, vol: 0.13, at: t + 0.05 }); break;
      case 'jackpot': [0, 4, 7, 12, 16].forEach((n, i) => this.tone({ f: midi(72 + n), dur: 0.1, vol: 0.15, at: t + i * 0.05 })); break;
      case 'dash': this.noise({ dur: 0.12, vol: 0.18, hp: 1500 }); this.tone({ f: 300, f2: 700, dur: 0.1, vol: 0.08 }); break;
      case 'warn': this.tone({ f: 880, dur: 0.07, vol: 0.12 }); this.tone({ f: 880, dur: 0.07, vol: 0.12, at: t + 0.12 }); break;
      case 'zap': this.noise({ dur: 0.25, vol: 0.3, hp: 600 }); this.tone({ f: 60, f2: 1200, type: 'sawtooth', dur: 0.2, vol: 0.15 }); break;
      case 'laser': this.tone({ f: 110, f2: 90, type: 'sawtooth', dur: 0.4, vol: 0.12 }); break;
      case 'bump': this.tone({ f: 140, f2: 90, type: 'square', dur: 0.08, vol: 0.18 }); break;
      case 'boing': this.tone({ f: 200, f2: 800, type: 'triangle', dur: 0.18, vol: 0.2 }); break;
      case 'spin': this.tone({ f: 600, f2: 150, type: 'square', dur: 0.3, vol: 0.12 }); break;
      case 'shove': this.noise({ dur: 0.08, vol: 0.2, lp: 1500 }); this.tone({ f: 220, f2: 110, dur: 0.08, vol: 0.15 }); break;
      case 'crumble': this.noise({ dur: 0.3, vol: 0.2, lp: 600 }); break;
      case 'beep': this.tone({ f: 660, dur: 0.12, vol: 0.2 }); break;
      case 'go': this.tone({ f: 1320, dur: 0.3, vol: 0.22 }); this.tone({ f: 660, dur: 0.3, vol: 0.12, type: 'triangle' }); break;
      case 'move': this.tone({ f: 520, dur: 0.04, vol: 0.08 }); break;
      case 'pick': this.tone({ f: 523, dur: 0.08, vol: 0.15 }); this.tone({ f: 784, dur: 0.15, vol: 0.15, at: t + 0.07 }); break;
      case 'join': this.tone({ f: 392, dur: 0.08, vol: 0.15 }); this.tone({ f: 784, dur: 0.14, vol: 0.15, at: t + 0.08 }); break;
      case 'win': [0, 4, 7, 12, 7, 12, 16, 19].forEach((n, i) => this.tone({ f: midi(67 + n), dur: 0.14, vol: 0.16, at: t + i * 0.09, type: i % 2 ? 'square' : 'triangle' })); break;
      // round won: a rising three-note sting on a bed of noise (shorter than 'win', bigger than 'pick')
      case 'round': [0, 7, 12].forEach((n, i) => this.tone({ f: midi(64 + n), dur: 0.16, vol: 0.17, at: t + i * 0.07, type: 'square' })); this.noise({ dur: 0.25, vol: 0.12, hp: 3000 }); break;
      // a card locks in: low thunk + bright click
      case 'lock': this.tone({ f: 110, f2: 70, type: 'square', dur: 0.1, vol: 0.22 }); this.tone({ f: 1760, dur: 0.05, vol: 0.12, at: t + 0.04 }); break;
      // a seat is ready
      case 'ready': this.tone({ f: 784, dur: 0.06, vol: 0.13 }); this.tone({ f: 1047, dur: 0.1, vol: 0.13, at: t + 0.06 }); break;
      case 'lose': [7, 5, 3, 0].forEach((n, i) => this.tone({ f: midi(60 + n), dur: 0.2, vol: 0.12, at: t + i * 0.15, type: 'triangle' })); break;
      default: break;
    }
  }

  music(name) {
    if (this.theme === name) return;
    this.theme = name;
    this.step = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!name) return;
    this.nextTime = 0;
    this.timer = setInterval(() => this.schedule(), 50);
  }
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.theme) return;
    const th = THEMES[this.theme];
    const stepDur = 60 / th.bpm / 4;
    const now = this.ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.05;
    while (this.nextTime < now + 0.2) {
      this.playStep(th, this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 64;
      this.nextTime += stepDur;
    }
  }
  playStep(th, step, at, sd) {
    const bar = Math.floor(step / 16), s = step % 16;
    const deg = th.prog[bar];
    const note = (d) => th.root + th.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const dest = this.musicGain;
    // bass
    if (s % 4 === 0 || s === 6 || s === 14) this.tone({ f: midi(note(deg) - 12 + (s === 8 ? 12 : 0)), type: th.bass, dur: sd * 1.6, vol: 0.22, at, dest });
    // arpeggio
    const arp = [0, 2, 4, 7, 4, 2];
    if (s % 2 === 0 || th.drums >= 2) {
      const d = deg + arp[(step >> (th.drums >= 2 ? 0 : 1)) % arp.length];
      this.tone({ f: midi(note(d) + 12), type: th.lead, dur: sd * 0.9, vol: 0.07, at, dest });
    }
    // drums
    if (th.drums) {
      if (s % 8 === 0) this.tone({ f: 150, f2: 40, type: 'sine', dur: 0.12, vol: 0.5, at, dest });
      if (th.drums >= 2 && s % 8 === 4) this.noise({ dur: 0.1, vol: 0.18, at, hp: 1200, dest });
      if (s % 2 === 1 && th.drums !== 1) this.noise({ dur: 0.03, vol: 0.07, at, hp: 6000, dest });
      if (th.drums === 1 && s % 4 === 2) this.noise({ dur: 0.03, vol: 0.06, at, hp: 6000, dest });
    }
  }
}

/** Silent stand-in for tests. */
export const NO_SOUND = { sfx() {}, music() {}, ensure() {}, setMuted() {}, blocked: false, muted: true };
