/* Multiply or Release — shared helpers: RNG, palette, formatting, sound. */
'use strict';
(function () {
  const MOR = window.MOR = window.MOR || {};

  // Fixed simulation step. Speed x2/x3 simply runs more steps per frame.
  MOR.DT = 1 / 120;
  MOR.FONT = '"Russo One", Roboto, "Segoe UI", system-ui, sans-serif';

  // Small deterministic RNG (mulberry32) so a tournament can be replayed by seed.
  MOR.makeRng = function (seed) {
    let a = seed >>> 0;
    const r = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + r() * (hi - lo);
    r.int = (n) => Math.floor(r() * n);
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    };
    return r;
  };

  // 16 tournament colours.
  MOR.COLORS = [
    { id: 'red', name: 'Красный', hex: '#e53935' },
    { id: 'orange', name: 'Оранжевый', hex: '#fb8c00' },
    { id: 'yellow', name: 'Жёлтый', hex: '#fdd835' },
    { id: 'lime', name: 'Лаймовый', hex: '#a5e22e' },
    { id: 'green', name: 'Зелёный', hex: '#2e9e4f' },
    { id: 'teal', name: 'Бирюзовый', hex: '#1ec8b0' },
    { id: 'sky', name: 'Голубой', hex: '#4fc3f7' },
    { id: 'blue', name: 'Синий', hex: '#2f5fe0' },
    { id: 'violet', name: 'Фиолетовый', hex: '#8e44e0' },
    { id: 'magenta', name: 'Пурпурный', hex: '#e040c8' },
    { id: 'pink', name: 'Розовый', hex: '#ff9ec4' },
    { id: 'maroon', name: 'Бордовый', hex: '#8d1e3c' },
    { id: 'brown', name: 'Коричневый', hex: '#8d5a2b' },
    { id: 'white', name: 'Белый', hex: '#f1f3f6' },
    { id: 'gray', name: 'Серый', hex: '#8f98a8' },
    { id: 'black', name: 'Чёрный', hex: '#23262e' }
  ];

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  MOR.hexToRgb = hexToRgb;

  function luminance(rgb) {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  }

  MOR.mix = function (hexA, hexB, t) {
    const a = typeof hexA === 'string' ? hexToRgb(hexA) : hexA;
    const b = typeof hexB === 'string' ? hexToRgb(hexB) : hexB;
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  };

  MOR.rgba = function (hex, alpha) {
    const c = hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
  };

  MOR.COLORS.forEach((c) => {
    c.rgb = hexToRgb(c.hex);
    c.lum = luminance(c.rgb);
    c.light = c.lum > 0.45;
    c.ink = c.light ? '#11141d' : '#ffffff';
    c.edge = c.light ? 'rgba(12,14,22,0.75)' : 'rgba(255,255,255,0.8)';
    c.dark = MOR.mix(c.rgb, [8, 10, 18], 0.45);
  });

  MOR.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  MOR.lerp = (a, b, t) => a + (b - a) * t;
  MOR.easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  MOR.easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
  MOR.easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // Ball counts can grow huge (x2 / x4 chains), so long numbers get a suffix.
  MOR.fmt = function (n) {
    n = Math.max(0, Math.round(n));
    if (n < 100000) return String(n);
    const units = [['K', 1e3], ['M', 1e6], ['B', 1e9], ['T', 1e12], ['Qa', 1e15], ['Qi', 1e18]];
    for (let i = units.length - 1; i >= 0; i--) {
      if (n >= units[i][1] * 0.9995) {
        const v = n / units[i][1];
        if (v >= 1000 && i === units.length - 1) return n.toExponential(2).replace('+', '');
        return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + units[i][0];
      }
    }
    return String(n);
  };

  MOR.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  MOR.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // Draws a glossy marble.
  MOR.drawMarble = function (ctx, x, y, r, color) {
    ctx.fillStyle = color.hex;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.strokeStyle = color.light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.38, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  };

  // ---------------------------------------------------------------- Sound
  // Tiny WebAudio synth; every effect is generated, no audio files needed.
  const Sound = MOR.Sound = {
    ctx: null,
    enabled: true,
    suspended: false, // true while the debug fast-forward runs
    last: {},
    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      } catch (e) { this.ctx = null; }
    },
    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },
    ok(key, gap) {
      if (!this.enabled || this.suspended || !this.ctx || this.ctx.state !== 'running') return false;
      if (key) {
        const now = this.ctx.currentTime;
        if (this.last[key] !== undefined && now - this.last[key] < gap) return false;
        this.last[key] = now;
      }
      return true;
    },
    tone(freq, dur, type, vol, slideTo, delay) {
      const c = this.ctx;
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    },
    noise(dur, vol, lowpass) {
      const c = this.ctx;
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass || 1200;
      const g = c.createGain();
      g.gain.value = vol || 0.2;
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start();
    },
    play(name) {
      switch (name) {
        case 'x2': if (this.ok('x2', 0.06)) this.tone(520, 0.12, 'triangle', 0.09, 900); break;
        case 'x4': if (this.ok('x2', 0.06)) { this.tone(620, 0.1, 'triangle', 0.1, 1200); this.tone(930, 0.12, 'triangle', 0.07, 1500, 0.06); } break;
        case 'release': if (this.ok('rel', 0.12)) { this.tone(160, 0.22, 'sawtooth', 0.07, 60); this.noise(0.15, 0.12, 900); } break;
        case 'shot': if (this.ok('shot', 0.07)) this.tone(300 + Math.random() * 80, 0.04, 'square', 0.025, 180); break;
        case 'tick': if (this.ok('tick', 0.035)) this.tone(1400, 0.025, 'square', 0.035); break;
        case 'spin': if (this.ok('spin', 0.2)) this.tone(400, 0.25, 'triangle', 0.08, 800); break;
        case 'prize': if (this.ok('prize', 0.2)) { [660, 830, 990].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.08, null, i * 0.07)); } break;
        case 'elim': if (this.ok('elim', 0.2)) { this.noise(0.6, 0.25, 500); this.tone(200, 0.6, 'sawtooth', 0.08, 40); } break;
        case 'win': if (this.ok('win', 0.5)) { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.1, null, i * 0.12)); } break;
        case 'drop': if (this.ok('drop', 0.05)) this.tone(700 + Math.random() * 300, 0.05, 'sine', 0.05); break;
        case 'land': if (this.ok('land', 0.05)) this.tone(240, 0.09, 'triangle', 0.08, 180); break;
        case 'fist': if (this.ok('fist', 0.3)) { this.noise(0.35, 0.3, 300); this.tone(90, 0.35, 'sine', 0.2, 40); } break;
        case 'shield': if (this.ok('shield', 0.3)) this.tone(880, 0.4, 'sine', 0.08, 1760); break;
        case 'marble': if (this.ok('marble', 0.3)) { this.tone(990, 0.08, 'sine', 0.07); this.tone(1320, 0.1, 'sine', 0.07, null, 0.08); } break;
      }
    }
  };
})();
