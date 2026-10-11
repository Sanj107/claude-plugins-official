/* Game shell: tournament flow, HUD, overlays, main loop. */
'use strict';
(function () {
  const MOR = window.MOR;
  const DT = MOR.DT;
  const $ = (id) => document.getElementById(id);

  function params() {
    const out = {};
    try {
      new URLSearchParams(location.search).forEach((v, k) => { out[k] = v; });
    } catch (e) { /* no query string support */ }
    return out;
  }

  function storeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storeSet(key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { /* storage unavailable */ }
  }

  function chip(color, cls) {
    const el = document.createElement('span');
    el.className = 'chip' + (cls ? ' ' + cls : '');
    const dot = document.createElement('i');
    dot.style.background = color.hex;
    el.appendChild(dot);
    el.appendChild(document.createTextNode(color.name));
    return el;
  }

  class Game {
    constructor() {
      const q = params();
      this.seed = q.seed ? (parseInt(q.seed, 10) >>> 0) : ((Date.now() ^ (Math.random() * 1e9)) >>> 0);
      this.speed = MOR.clamp(parseInt(q.speed || storeGet('mor.speed') || '1', 10) || 1, 1, 3);
      this.paused = false;
      this.scene = null;
      this.stage = 'menu';
      this.T = null;
      this.countdown = null;
      this.acc = 0;
      this.last = performance.now();
      this.auto = false; // debug: skip countdowns

      this.canvas = $('cv');
      this.ctx = this.canvas.getContext('2d');
      MOR.Sound.enabled = storeGet('mor.sound') !== 'off';

      this.bindUi();
      this.resize();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

      this.startDemo();
      if (q.autostart) this.newTournament();
      requestAnimationFrame((t) => this.frame(t));
    }

    // ------------------------------------------------------------ UI
    bindUi() {
      document.querySelectorAll('[data-speed]').forEach((b) => {
        b.addEventListener('click', () => this.setSpeed(parseInt(b.dataset.speed, 10)));
      });
      $('btn-pause').addEventListener('click', () => this.togglePause());
      $('btn-sound').addEventListener('click', () => {
        MOR.Sound.enabled = !MOR.Sound.enabled;
        storeSet('mor.sound', MOR.Sound.enabled ? 'on' : 'off');
        if (MOR.Sound.enabled) MOR.Sound.resume();
        this.syncHud();
      });
      $('btn-start').addEventListener('click', () => this.newTournament());
      $('btn-resume').addEventListener('click', () => this.togglePause(false));
      $('btn-restart').addEventListener('click', () => { this.togglePause(false); this.newTournament(); });
      $('btn-menu').addEventListener('click', () => { this.togglePause(false); this.toMenu(); });
      $('btn-bracket-go').addEventListener('click', () => this.bracketGo());
      $('btn-again').addEventListener('click', () => this.newTournament());
      $('btn-results-menu').addEventListener('click', () => this.toMenu());
      // Leaving the app (or tab) pauses a running match.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && !this.paused && ['draw', 'round', 'final'].indexOf(this.stage) >= 0) this.togglePause(true);
      });
      // Any first tap unlocks audio (mobile browsers start AudioContext suspended).
      const unlock = () => MOR.Sound.resume();
      window.addEventListener('pointerdown', unlock, { passive: true });
      document.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'p') { if (this.stage !== 'menu') this.togglePause(); e.preventDefault(); }
        if (e.key === '1' || e.key === '2' || e.key === '3') this.setSpeed(parseInt(e.key, 10));
      });
      this.syncHud();
    }

    show(id, on) { $(id).hidden = !on; }

    setSpeed(s) {
      this.speed = MOR.clamp(s, 1, 3);
      storeSet('mor.speed', String(this.speed));
      this.syncHud();
    }

    togglePause(force) {
      if (this.stage === 'menu' || this.stage === 'results') return;
      this.paused = typeof force === 'boolean' ? force : !this.paused;
      this.show('pause', this.paused);
      this.syncHud();
    }

    syncHud() {
      document.querySelectorAll('[data-speed]').forEach((b) => {
        const on = parseInt(b.dataset.speed, 10) === this.speed;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $('btn-sound').classList.toggle('off', !MOR.Sound.enabled);
      $('btn-sound').setAttribute('aria-label', MOR.Sound.enabled ? 'Выключить звук' : 'Включить звук');
      $('btn-pause').classList.toggle('on', this.paused);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth, h = window.innerHeight;
      this.dpr = dpr;
      this.w = w;
      this.h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.top = $('hud').getBoundingClientRect().bottom;
    }

    // ------------------------------------------------------------ flow
    startDemo() {
      const rng = MOR.makeRng(this.seed ^ 0x9e3779b9);
      const cols = rng.shuffle(MOR.COLORS.slice()).slice(0, 4);
      this.scene = new MOR.Battle(this, cols, { title: 'ДЕМО' }, rng);
      this.scene.demo = true;
      this.stage = 'menu';
      this.paused = false;
      this.show('menu', true);
      this.show('bracket', false);
      this.show('results', false);
      this.show('pause', false);
      $('stage').textContent = 'Multiply or Release';
      $('timer').textContent = '';
    }

    toMenu() {
      this.countdown = null;
      this.startDemo();
      this.syncHud();
    }

    newTournament() {
      MOR.Sound.resume();
      this.rng = MOR.makeRng(this.seed);
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0; // next tournament gets a new seed
      const colors = this.rng.shuffle(MOR.COLORS.slice());
      this.T = { colors, groups: null, rounds: [], final: null };
      this.stage = 'draw';
      this.paused = false;
      this.countdown = null;
      this.show('menu', false);
      this.show('bracket', false);
      this.show('results', false);
      this.show('pause', false);
      this.scene = new MOR.DrawScene(this, colors, this.rng);
      $('stage').textContent = 'Жеребьёвка';
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* not supported */ }
      this.syncHud();
    }

    onDrawDone(groups) {
      this.T.groups = groups;
      this.showBracket(0);
    }

    onBattleEnd(res) {
      if (this.scene && this.scene.demo) {
        // Attract mode: just start another demo battle.
        this.startDemo();
        return;
      }
      if (res.isFinal) {
        this.T.final = res;
        this.showResults();
        return;
      }
      this.T.rounds.push(res);
      this.showBracket(this.T.rounds.length);
    }

    showBracket(next) {
      const T = this.T;
      this.stage = 'bracket';
      this.nextRound = next;
      const wrap = $('bracket-groups');
      wrap.textContent = '';
      T.groups.forEach((g, i) => {
        const res = T.rounds[i];
        const winner = res ? res.order[3] : null;
        const card = document.createElement('div');
        card.className = 'group' + (i === next ? ' current' : '') + (res ? ' played' : '');
        const h = document.createElement('h3');
        h.textContent = 'Раунд ' + (i + 1);
        card.appendChild(h);
        g.forEach((c) => card.appendChild(chip(c, winner ? (c === winner ? 'win' : 'out') : '')));
        wrap.appendChild(card);
      });
      const fin = document.createElement('div');
      fin.className = 'group final' + (next === 4 ? ' current' : '');
      const h = document.createElement('h3');
      h.textContent = 'Финал';
      fin.appendChild(h);
      for (let i = 0; i < 4; i++) {
        const res = T.rounds[i];
        if (res) fin.appendChild(chip(res.order[3]));
        else {
          const el = document.createElement('span');
          el.className = 'chip empty';
          el.textContent = 'Победитель Р' + (i + 1);
          fin.appendChild(el);
        }
      }
      wrap.appendChild(fin);
      $('bracket-title').textContent = next === 0 ? 'Группы сформированы' : next === 4 ? 'Финалисты определены' : 'Раунд ' + next + ' завершён';
      this.countdown = this.auto ? 0 : 6;
      this.updateBracketButton();
      this.show('bracket', true);
      $('stage').textContent = 'Турнирная сетка';
      $('timer').textContent = '';
    }

    updateBracketButton() {
      const n = this.nextRound;
      const label = n < 4 ? 'Начать раунд ' + (n + 1) : 'Начать финал';
      $('btn-bracket-go').textContent = label + (this.countdown !== null ? ' · ' + Math.ceil(this.countdown) : '');
    }

    bracketGo() {
      if (this.stage !== 'bracket') return;
      this.countdown = null;
      this.show('bracket', false);
      const n = this.nextRound;
      if (n < 4) {
        this.stage = 'round';
        this.scene = new MOR.Battle(this, this.T.groups[n], { title: 'РАУНД ' + (n + 1) }, this.rng);
      } else {
        this.stage = 'final';
        const finalists = this.T.rounds.map((r) => r.order[3]);
        this.scene = new MOR.Battle(this, finalists, { title: 'ФИНАЛ', isFinal: true }, this.rng);
      }
    }

    standings() {
      const T = this.T;
      const rows = T.final.stats.slice().sort((a, b) => a.place - b.place).map((s) => ({
        color: s.color, where: 'Финал', inStage: s.place, captured: s.captured
      }));
      for (let p = 2; p <= 4; p++) {
        const grp = [];
        T.rounds.forEach((r, ri) => r.stats.forEach((s) => {
          if (s.place === p) grp.push({ color: s.color, where: 'Раунд ' + (ri + 1), inStage: p, captured: s.captured, elim: s.elimTime || 0 });
        }));
        grp.sort((a, b) => (b.captured - a.captured) || (b.elim - a.elim));
        rows.push.apply(rows, grp);
      }
      return rows.map((r, i) => Object.assign(r, { place: i + 1 }));
    }

    showResults() {
      this.stage = 'results';
      const rows = this.standings();
      this.lastStandings = rows;
      const pod = $('podium');
      pod.textContent = '';
      [1, 0, 2].forEach((i) => {
        const r = rows[i];
        const col = document.createElement('div');
        col.className = 'step p' + r.place;
        const ball = document.createElement('i');
        ball.style.background = r.color.hex;
        const name = document.createElement('b');
        name.textContent = r.color.name;
        const block = document.createElement('div');
        block.className = 'block';
        block.textContent = String(r.place);
        col.appendChild(ball); col.appendChild(name); col.appendChild(block);
        pod.appendChild(col);
      });
      const list = $('standings');
      list.textContent = '';
      rows.forEach((r) => {
        const li = document.createElement('li');
        const pl = document.createElement('span');
        pl.className = 'pl';
        pl.textContent = r.place;
        const sw = document.createElement('i');
        sw.style.background = r.color.hex;
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = r.color.name;
        const info = document.createElement('span');
        info.className = 'info';
        info.textContent = r.where + ' · ' + r.inStage + ' место · ' + r.captured + ' клеток';
        li.appendChild(pl); li.appendChild(sw); li.appendChild(nm); li.appendChild(info);
        list.appendChild(li);
      });
      this.show('results', true);
      $('stage').textContent = 'Итоги турнира';
      $('timer').textContent = '';
      MOR.Sound.play('win');
    }

    // ------------------------------------------------------------ loop
    frame(now) {
      const real = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        if (this.scene) {
          this.acc += real * this.speed;
          let n = 0;
          while (this.acc >= DT && n < 60) { this.scene.step(DT); this.acc -= DT; n++; }
          if (n >= 60) this.acc = 0;
        }
        if (this.stage === 'bracket' && this.countdown !== null) {
          this.countdown -= real;
          if (this.countdown <= 0) this.bracketGo();
          else this.updateBracketButton();
        }
      }
      this.render();
      requestAnimationFrame((t) => this.frame(t));
    }

    render() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#0b0e1a';
      ctx.fillRect(0, 0, this.w, this.h);
      if (this.scene) this.scene.render(ctx, this.w, this.h, this.top);
      if (this.scene && this.scene.kind === 'battle' && (this.stage === 'round' || this.stage === 'final')) {
        this.setText('stage', this.stage === 'final' ? 'Финал' : 'Раунд ' + (this.nextRound + 1) + ' из 4');
        this.setText('timer', MOR.fmtTime(this.scene.time));
      }
    }

    setText(id, text) {
      const el = $(id);
      if (el.textContent !== text) el.textContent = text;
    }

    // Android back button: returns true when handled.
    onBack() {
      if (this.stage === 'menu') return false;
      if (this.paused) this.togglePause(false); else this.togglePause(true);
      return true;
    }
  }

  // ------------------------------------------------------------ debug / test hooks
  MOR.debug = {
    // Fast-forward the simulation without rendering (used by automated tests).
    simulate(seconds) {
      const g = MOR.game;
      MOR.Sound.suspended = true;
      const steps = Math.round(seconds / DT);
      for (let i = 0; i < steps; i++) {
        if (g.stage === 'bracket') g.bracketGo();
        if (g.stage === 'results' || !g.scene) break;
        g.scene.step(DT);
      }
      MOR.Sound.suspended = false;
      return MOR.debug.state();
    },
    state() {
      const g = MOR.game, s = g.scene;
      const out = { stage: g.stage, scene: s && s.kind, phase: s && s.phase, speed: g.speed };
      if (s && s.kind === 'battle') {
        out.time = s.time;
        out.bullets = s.bullets.length;
        out.teams = s.teams.map((t) => ({ name: t.color.name, alive: t.alive, tiles: s.counts[t.i], count: t.count }));
      }
      if (g.T) {
        out.groups = g.T.groups && g.T.groups.map((gr) => gr.map((c) => c.name));
        out.rounds = g.T.rounds.map((r) => ({ winner: r.order[3].name, duration: r.duration }));
        if (g.T.final) out.final = { winner: g.T.final.order[3].name, duration: g.T.final.duration };
      }
      if (g.lastStandings && g.stage === 'results') out.standings = g.lastStandings.map((r) => r.place + '. ' + r.color.name);
      return out;
    }
  };

  window.addEventListener('DOMContentLoaded', () => {
    let started = false;
    const go = () => { if (started) return; started = true; MOR.game = new Game(); };
    // Start once the display font is ready, but never wait on it for long.
    setTimeout(go, 1500);
    if (document.fonts && document.fonts.load) document.fonts.load('16px "Russo One"').then(go, go);
    else go();
  });
  MOR.onBack = () => (MOR.game ? MOR.game.onBack() : false);
})();
