'use strict';
// Synthesised sound effects and a chiptune sea shanty (the traditional "Drunken Sailor").
(function (VC) {
  const A = {
    ctx: null, master: null, sfxGain: null, musicGain: null, ambGain: null,
    soundOn: true, musicOn: true, started: false, musicTimer: null, nextNote: 0, step: 0, track: 'calm',
  };

  A.unlock = function () {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.soundOn ? 0.55 : 0;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.16 : 0;
      this.musicGain.connect(this.master);
      this.ambGain = this.ctx.createGain();
      this.ambGain.gain.value = this.soundOn ? 0.05 : 0;
      this.ambGain.connect(this.master);
      this.noiseBuf = this.makeNoise();
      this.startAmbience();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.started) { this.started = true; this.startMusic(); }
  };

  A.setSound = function (on) {
    this.soundOn = on;
    if (this.sfxGain) { this.sfxGain.gain.value = on ? 0.55 : 0; this.ambGain.gain.value = on ? 0.05 : 0; }
  };
  A.setMusic = function (on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 0.16 : 0;
  };
  A.suspend = function () { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); };
  A.resume = function () { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };

  A.makeNoise = function () {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  A.tone = function (freq, dur, type, vol, when, slide, dest) {
    if (!this.ctx) return;
    const t = (when || this.ctx.currentTime);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    env(g, t, 0.005, vol || 0.3, dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  };

  A.noise = function (dur, vol, filter, freq, when, q) {
    if (!this.ctx) return;
    const t = when || this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = filter || 'lowpass';
    f.frequency.value = freq || 800;
    if (q) f.Q.value = q;
    const g = this.ctx.createGain();
    env(g, t, 0.005, vol || 0.4, dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  };

  let lastCoin = 0;
  A.sfx = function (name, k) {
    if (!this.ctx || !this.soundOn) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'coin':
        if (t - lastCoin < 0.04) return;
        lastCoin = t;
        this.tone(1320 + Math.random() * 200, 0.07, 'square', 0.05);
        this.tone(1980 + Math.random() * 200, 0.12, 'triangle', 0.07, t + 0.04);
        break;
      case 'crit':
        [988, 1319, 1760].forEach((f, i) => this.tone(f, 0.12, 'square', 0.06, t + i * 0.04));
        break;
      case 'buy':
        this.tone(660, 0.06, 'square', 0.06); this.tone(990, 0.12, 'square', 0.06, t + 0.06);
        this.noise(0.06, 0.08, 'highpass', 4000, t + 0.02);
        break;
      case 'click': this.tone(520, 0.04, 'triangle', 0.08); break;
      case 'error': this.tone(180, 0.15, 'square', 0.06, t, 0.7); break;
      case 'cannon':
        this.noise(0.5, 0.5, 'lowpass', 500);
        this.tone(90, 0.35, 'sine', 0.5, t, 0.4);
        break;
      case 'hit':
        this.noise(0.25, 0.4, 'bandpass', 900, t, 1.2);
        this.tone(140, 0.18, 'square', 0.12, t, 0.5);
        break;
      case 'splash': this.noise(0.45, 0.22, 'bandpass', 1800, t, 0.6); break;
      case 'level':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.18, 'square', 0.07, t + i * 0.08));
        break;
      case 'win':
        [392, 523, 659, 784, 659, 1047].forEach((f, i) => this.tone(f, 0.22, 'square', 0.07, t + i * 0.12));
        break;
      case 'lose':
        [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.12, t + i * 0.18));
        break;
      case 'parrot':
        this.tone(1800, 0.09, 'sawtooth', 0.05, t, 1.6);
        this.tone(2200, 0.12, 'sawtooth', 0.05, t + 0.11, 0.6);
        break;
      case 'bell':
        this.tone(1568, 0.6, 'sine', 0.12); this.tone(2349, 0.5, 'sine', 0.05, t + 0.01);
        break;
      case 'ability':
        this.tone(440, 0.25, 'sawtooth', 0.06, t, 2.2);
        break;
      case 'thunder': this.noise(1.4, 0.6, 'lowpass', 300); break;
      case 'frenzy':
        [523, 659, 784, 988, 1175].forEach((f, i) => this.tone(f, 0.1, 'square', 0.06, t + i * 0.05));
        break;
    }
  };

  // ------------------------------------------------------------------ ambience: surf
  A.startAmbience = function () {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = this.ctx.createGain(); g.gain.value = 0.6;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lg = this.ctx.createGain(); lg.gain.value = 0.45;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(this.ambGain);
    s.start(); lfo.start();
  };

  // ------------------------------------------------------------------ music
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(n) {
    // "A4", "C5", "D4" ...
    const m = 12 * (+n[n.length - 1] + 1) + NOTE[n[0]] + (n[1] === '#' ? 1 : 0);
    return 440 * Math.pow(2, (m - 69) / 12);
  }
  // Traditional melody (public domain), D dorian. [note, beats]
  const VERSE = [
    ['A4', 1], ['A4', 0.5], ['A4', 0.5], ['A4', 1], ['A4', 0.5], ['A4', 0.5], ['A4', 1], ['D4', 1], ['F4', 1], ['A4', 1],
    ['G4', 1], ['G4', 0.5], ['G4', 0.5], ['G4', 1], ['G4', 0.5], ['G4', 0.5], ['G4', 1], ['C4', 1], ['E4', 1], ['G4', 1],
    ['A4', 1], ['A4', 0.5], ['A4', 0.5], ['A4', 1], ['A4', 0.5], ['A4', 0.5], ['A4', 1], ['B4', 1], ['C5', 1], ['D5', 1],
    ['C5', 1], ['A4', 1], ['G4', 1], ['E4', 1], ['D4', 2], ['D4', 2],
  ];
  const CHORUS = [
    ['A4', 2], ['A4', 1], ['A4', 1], ['A4', 1], ['D4', 1], ['F4', 1], ['A4', 1],
    ['G4', 2], ['G4', 1], ['G4', 1], ['G4', 1], ['C4', 1], ['E4', 1], ['G4', 1],
    ['A4', 2], ['A4', 1], ['A4', 1], ['A4', 1], ['B4', 1], ['C5', 1], ['D5', 1],
    ['C5', 1], ['A4', 1], ['G4', 1], ['E4', 1], ['D4', 2], ['D4', 2],
  ];
  const SONG = VERSE.concat(CHORUS);
  const BASS = ['D3', 'D3', 'C3', 'C3', 'D3', 'D3', 'A2', 'D3'];

  A.startMusic = function () {
    if (!this.ctx) return;
    this.nextNote = this.ctx.currentTime + 0.3;
    this.step = 0;
    this.beat = 0;
    clearInterval(this.musicTimer);
    this.musicTimer = setInterval(() => this.schedule(), 120);
  };
  A.setTrack = function (tr) { this.track = tr; };

  A.schedule = function () {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const bpm = this.track === 'battle' ? 168 : 120;
    const spb = 60 / bpm;
    while (this.nextNote < this.ctx.currentTime + 0.4) {
      const [n, beats] = SONG[this.step % SONG.length];
      const dur = beats * spb;
      const t = this.nextNote;
      if (this.musicOn) {
        this.tone(freq(n), Math.min(dur * 0.9, 0.5), this.track === 'battle' ? 'square' : 'triangle', 0.22, t, null, this.musicGain);
        // bass on every beat boundary
        const startBeat = this.beat, endBeat = this.beat + beats;
        for (let b = Math.ceil(startBeat - 1e-6); b < endBeat - 1e-6; b++) {
          const bt = t + (b - startBeat) * spb;
          const bn = BASS[Math.floor(b / 4) % BASS.length];
          if (b % 2 === 0) this.tone(freq(bn), spb * 0.8, 'triangle', 0.35, bt, null, this.musicGain);
          // soft hi-hat on off-beats
          const hb = bt + spb / 2;
          const s = this.ctx.createBufferSource();
          s.buffer = this.noiseBuf;
          const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
          const g = this.ctx.createGain(); env(g, hb, 0.002, this.track === 'battle' ? 0.12 : 0.06, 0.05);
          s.connect(f); f.connect(g); g.connect(this.musicGain);
          s.start(hb, Math.random()); s.stop(hb + 0.08);
        }
      }
      this.beat += beats;
      this.nextNote += dur;
      this.step++;
    }
  };

  VC.Audio = A;
})(window.VC);
