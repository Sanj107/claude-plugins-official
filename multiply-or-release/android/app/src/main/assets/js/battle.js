/* Battle scene: 4 colours fight for a square tile field.
   Each colour has a corner cannon and a side box. Three marbles fall through a sparse
   rising peg grid into the x2 / spinner / release slots at the bottom of the box. */
'use strict';
(function () {
  const MOR = window.MOR, P = MOR.Phys;

  // ---- Field
  const N = 32;                    // field is N x N tiles
  const BULLET_SPEED = 15;         // tiles per second
  const SPAWN_RATE = 60;           // max bullets per second per cannon (larger counts -> heavier bullets)
  const SWEEP = 0.78;              // cannon sweep, radians either side of the diagonal
  const CANNON_HP = 30;            // enemy captures of the tile under a cannon it can survive
  const COLLAPSE_TIME = 3.0;       // a wrecked colour's land flows to the wrecker over this time
  const OVERTIME_AT = 120, OVERTIME_STEP = 40; // after 2:00 every shot hits x2, x4, x8...
  const INSET = 1.6;               // cannon pivot sits this far inside its corner
  const PIVOTS = [[INSET, INSET], [N - INSET, INSET], [INSET, N - INSET], [N - INSET, N - INSET]];
  const BASE_ANG = [Math.PI / 4, Math.PI * 3 / 4, -Math.PI / 4, -Math.PI * 3 / 4];

  // ---- Side box (local units: 100 x 100)
  // The two dividers around the narrow spinner slot rise above the other slots as
  // posts, so a marble can only drop into the spinner from above, never roll in.
  const CEIL = 13, SLOT_TOP = 82, POST_TOP = 75, POST_R = 1.2, TRIGGER_Y = 91, X_A = 300 / 7, X_B = 400 / 7;
  const MARBLES = 3, MARBLE_R = 2.9, GRAV = 240, SPAWN_VY = 45;
  // Sparse peg grid rising from bottom to top. Every row has a peg above each slot
  // divider, so pegs grow straight out of the dividers and guard the narrow spinner slot.
  const PEG_SPEED = 7, PEG_TOP = CEIL + 8, PEG_BOT = POST_TOP, PEG_FADE = 6;
  // Each peg: [x, radius]. Every other row grows a pair of pegs out of the spinner posts;
  // the gap between them is narrower than a marble, so the pair works as a roof over
  // the spinner and that slot is only reachable between pairs.
  const DIV_R = 4.6, MID_R = 3.4;
  const PEG_ROW_A = [[X_A / 4, MID_R], [X_A, DIV_R], [X_B, DIV_R], [100 - X_A / 4, MID_R]];
  const PEG_ROW_B = [[X_A * 0.6, MID_R], [100 - X_A * 0.6, MID_R]];
  const PEG_ROW_C = [[X_A * 0.6, MID_R], [X_A, DIV_R], [X_B, DIV_R], [100 - X_A * 0.6, MID_R]];
  const PEG_ROW_E = [[X_A * 0.6, MID_R], [X_A, DIV_R], [100 - X_A * 0.6, MID_R]];
  const PEG_ROW_F = [[X_A * 0.6, MID_R], [X_B, DIV_R], [100 - X_A * 0.6, MID_R]];
  const PEG_PATTERN = [PEG_ROW_A, PEG_ROW_C, PEG_ROW_A, PEG_ROW_E];
  const PEG_ROWS = PEG_PATTERN.length, PEG_SP = (PEG_BOT - PEG_TOP) / PEG_ROWS;

  // ---- Spinner bonuses. Each tournament puts 5 random ones on the wheel.
  const PLUS_BALLS = 200, X4_TIME = 45, SHIELD_TIME = 20, CLUSTER_SHELLS = 3, CLUSTER_N = 36;
  const HALF_LAND_TIME = 1.0, CANNONBALL_HP = 150, TWIN_TIME = 20, FAN_N = 40;
  const BOMB_R = 4.5, BOLTS = 6, BOLT_R = 1.6, FREEZE_TIME = 8, TURBO_TIME = 20, REPAIR_HP = 15, REPAIR_R = 4, GOLD_TIME = 30;
  const BONUSES = {
    plus: { label: '+200', name: '+200 шариков', color: '#e8a400' },
    x4: { label: 'x4', name: 'x4 вместо x2 на 45 сек', color: '#2b9a52' },
    shield: { label: 'ЩИТ', name: 'Щит на 20 сек', color: '#2f8fd8' },
    cluster: { label: 'КЛАСТЕР', name: 'Кластерная пушка: 3 снаряда', color: '#f06a1d' },
    half: { label: 'HALF LAND', name: 'Half Land: половина земли лидера', color: '#7c4ddc' },
    ball: { label: 'ЯДРО', name: 'Ядро: один шар на 150 клеток', color: '#5f6b7a' },
    twin: { label: 'ДВОЙНАЯ', name: 'Двойная пушка на 20 сек', color: '#c2255c' },
    fan: { label: 'ВЕЕР', name: 'Веер: 40 шариков разом', color: '#be4bdb' },
    bomb: { label: 'БОМБА', name: 'Бомба по земле лидера', color: '#2b2f36' },
    bolt: { label: 'МОЛНИЯ', name: 'Молния: 6 ударов по врагам', color: '#4263eb' },
    freeze: { label: 'ЛЁД', name: 'Лёд: соперники замерли на 8 сек', color: '#1098ad' },
    turbo: { label: 'ТУРБО', name: 'Турбо: своё поле ×2 на 20 сек', color: '#e03131' },
    div: { label: '÷2', name: 'Числа соперников ÷2', color: '#364fc7' },
    repair: { label: 'РЕМОНТ', name: 'Ремонт: +15 прочности и земля вокруг', color: '#8d5a2b' },
    gold: { label: '+ШАРИК', name: '+1 золотой шарик на 30 сек', color: '#0ca678' }
  };
  const BONUS_IDS = Object.keys(BONUSES);
  const WHEEL_SIZE = 5;

  class Roulette {
    constructor(battle, items) {
      this.b = battle;
      this.items = items;          // bonus ids on this wheel
      this.queue = [];
      this.cur = null;
      this.ang = 0;
    }
    request(t) { this.queue.push(t); }
    cancel(t) {
      this.queue = this.queue.filter((x) => x !== t);
      if (this.cur && this.cur.team === t) this.cur = null;
    }
    busy() { return !!this.cur || this.queue.length > 0; }
    segAt(ang) {
      const n = this.items.length, seg = Math.PI * 2 / n;
      let a = (-Math.PI / 2 - ang) % (Math.PI * 2);
      if (a < 0) a += Math.PI * 2;
      return Math.floor(a / seg) % n;
    }
    start(t) {
      const rng = this.b.rng;
      const n = this.items.length, seg = Math.PI * 2 / n;
      const result = rng.int(n);
      const target = -Math.PI / 2 - (result + 0.15 + rng() * 0.7) * seg;
      const minEnd = this.ang + Math.PI * 2 * 4;
      const a1 = target + Math.PI * 2 * Math.ceil((minEnd - target) / (Math.PI * 2));
      this.cur = { team: t, result, t: 0, dur: 2.8, a0: this.ang, a1, phase: 'spin', lastSeg: this.segAt(this.ang) };
      MOR.Sound.play('spin');
    }
    step(dt) {
      if (!this.cur) {
        if (!this.queue.length) return;
        this.start(this.queue.shift());
      }
      const c = this.cur;
      c.t += dt;
      if (c.phase === 'spin') {
        const k = Math.min(1, c.t / c.dur);
        this.ang = c.a0 + (c.a1 - c.a0) * MOR.easeOutQuart(k);
        const s = this.segAt(this.ang);
        if (s !== c.lastSeg) { c.lastSeg = s; MOR.Sound.play('tick'); }
        if (k >= 1) { c.phase = 'show'; c.t = 0; MOR.Sound.play('prize'); }
      } else if (c.t >= 1.0) {
        this.cur = null;
        this.b.applyItem(c.team, this.items[c.result]);
      }
    }
    render(ctx, cx, cy, R) {
      const c = this.cur;
      if (!c) return;
      const team = this.b.teams[c.team];
      const n = this.items.length, seg = Math.PI * 2 / n;
      const fade = Math.min(1, (c.phase === 'spin' ? c.t : 1) / 0.2);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(6,8,16,0.55)';
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2); ctx.fill();

      for (let i = 0; i < n; i++) {
        const it = BONUSES[this.items[i]];
        const a0 = this.ang + i * seg, a1 = a0 + seg;
        ctx.fillStyle = it.color;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath(); ctx.fill();
        if (c.phase === 'show' && i === c.result) {
          ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.2 * Math.sin(c.t * 18)) + ')';
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(10,12,20,0.55)';
        ctx.lineWidth = Math.max(1, R * 0.015);
        ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a0 + seg / 2);
        ctx.fillStyle = '#ffffff';
        const label = it.label;
        const fs = R * (label.length > 7 ? 0.105 : label.length > 5 ? 0.125 : label.length > 3 ? 0.14 : 0.17);
        ctx.font = Math.round(fs) + 'px ' + MOR.FONT;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        ctx.fillText(label, R * 0.9, 0);
        ctx.restore();
      }
      // Rim in the spinning team's colour, with bulbs.
      ctx.lineWidth = R * 0.09;
      ctx.strokeStyle = team.color.hex;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.04, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = Math.max(1, R * 0.015);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.085, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2 + this.ang * 0.15;
        const on = (i + Math.floor(this.b.clock * 8)) % 2 === 0;
        ctx.fillStyle = on ? '#fff6c8' : 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 1.04, cy + Math.sin(a) * R * 1.04, R * 0.022, 0, Math.PI * 2); ctx.fill();
      }
      // Hub.
      ctx.fillStyle = team.color.hex;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = R * 0.03;
      ctx.strokeStyle = team.color.light ? '#11141d' : '#ffffff';
      ctx.stroke();
      // Pointer.
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#11141d';
      ctx.lineWidth = Math.max(1, R * 0.02);
      ctx.beginPath();
      ctx.moveTo(cx, cy - R * 0.86);
      ctx.lineTo(cx - R * 0.09, cy - R * 1.2);
      ctx.lineTo(cx + R * 0.09, cy - R * 1.2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      // Caption.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fs = Math.round(R * 0.12);
      ctx.font = fs + 'px ' + MOR.FONT;
      const won = BONUSES[this.items[c.result]];
      const caption = c.phase === 'show' ? won.name : 'Спиннер: ' + team.color.name;
      const tw = ctx.measureText(caption).width + fs * 1.2;
      const ty = cy + R * 1.38;
      ctx.fillStyle = c.phase === 'show' ? won.color : 'rgba(10,12,22,0.85)';
      MOR.roundRect(ctx, cx - tw / 2, ty - fs * 0.85, tw, fs * 1.7, fs * 0.5);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(caption, cx, ty + 1);
      ctx.restore();
    }
  }

  class Battle {
    constructor(game, colors, opts, rng) {
      this.kind = 'battle';
      this.game = game;
      this.rng = rng;
      this.title = opts.title;
      this.isFinal = !!opts.isFinal;
      this.time = 0;       // battle clock (play phase only)
      this.clock = 0;      // total scene clock, drives animations
      this.phase = 'intro';
      this.phaseT = 0;
      this.shake = 0;

      this.owner = new Int8Array(N * N);
      this.counts = [0, 0, 0, 0];
      this.tileCanvas = document.createElement('canvas');
      this.tileCanvas.width = N; this.tileCanvas.height = N;
      this.tileCtx = this.tileCanvas.getContext('2d');
      this.img = this.tileCtx.createImageData(N, N);
      this.shieldCanvas = document.createElement('canvas');
      this.shieldCanvas.width = N; this.shieldCanvas.height = N;
      this.shieldCtx = this.shieldCanvas.getContext('2d');
      this.shieldImg = this.shieldCtx.createImageData(N, N);

      this.teams = colors.map((color, i) => ({
        i, color, alive: true, count: 1,
        x4Until: -1, shieldUntil: -1, twinUntil: -1, frozenUntil: -1, turboUntil: -1,
        captured: 0, peak: 0, elimTime: null, spinBlocked: false,
        rel: { active: false, end: 0, val: 0, spawn: 0 },
        cannon: {
          x: PIVOTS[i][0], y: PIVOTS[i][1], base: BASE_ANG[i], ang: BASE_ANG[i], dead: false, hp: CANNON_HP, hit: 0,
          cell: Math.floor(PIVOTS[i][1]) * N + Math.floor(PIVOTS[i][0]),
          phase: rng() * Math.PI * 2, speed: 1.15 + rng() * 0.35, recoil: 0, cluster: 0, clusterT: 0
        },
        box: { marbles: [], time: rng() * 10, pop: 0, flash: [0, 0, 0] }
      }));
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const t = (x < N / 2 ? 0 : 1) + (y < N / 2 ? 0 : 2);
          this.owner[y * N + x] = t;
          this.counts[t]++;
          const c = colors[t].rgb, o = (y * N + x) * 4;
          this.img.data[o] = c[0]; this.img.data[o + 1] = c[1]; this.img.data[o + 2] = c[2]; this.img.data[o + 3] = 255;
        }
      }
      this.teams.forEach((t) => {
        t.peak = this.counts[t.i];
        for (let k = 0; k < MARBLES; k++) this.addMarble(t, 12 + k * 38 + rng() * 10);
      });
      this.dirty = true;

      this.bullets = [];
      this.newBullets = [];
      this.particles = [];
      this.floaters = [];
      this.waves = [];
      this.strikes = [];   // bombs and lightning waiting to land
      this.bolts = [];     // lightning flashes being drawn
      this.elimOrder = [];
      let items = (opts.bonuses || []).filter((id) => BONUSES[id]);
      if (items.length < 2) items = rng.shuffle(BONUS_IDS.slice()).slice(0, WHEEL_SIZE);
      this.roulette = new Roulette(this, items);
      this.lastPower = 1;
    }

    // ------------------------------------------------------------ helpers
    addMarble(team, x, gold) {
      team.box.marbles.push({
        x: x === undefined ? this.rng.range(12, 88) : x, y: CEIL + MARBLE_R + 1,
        vx: this.rng.range(-15, 15), vy: SPAWN_VY, r: MARBLE_R, flash: 1, still: 0,
        gold: !!gold, expires: gold ? this.time + GOLD_TIME : Infinity
      });
    }

    float(space, x, y, text, color, size, dur) {
      this.floaters.push({ space, x, y, text, color: color || '#ffffff', size: size || 1, t: 0, dur: dur || 1.1 });
      if (this.floaters.length > 60) this.floaters.shift();
    }

    burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        if (this.particles.length > 400) this.particles.shift();
        const a = this.rng() * Math.PI * 2, s = speed * (0.3 + this.rng() * 0.7);
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.4 + this.rng() * 0.5, color });
      }
    }

    shielded(t) { return this.teams[t].shieldUntil > this.time; }
    frozen(t) { return this.teams[t].frozenUntil > this.time; }
    working(t) { return t.alive && !t.cannon.dead; }
    enemiesOf(team) { return this.teams.filter((x) => x.alive && x !== team); }
    // Text anchor in front of a team's cannon, in field units.
    nearCannon(team) {
      return { x: team.cannon.x + (team.cannon.x < N / 2 ? 5 : -5), y: team.cannon.y + (team.cannon.y < N / 2 ? 4 : -4) };
    }

    setCell(i, t) {
      const prev = this.owner[i];
      if (prev === t) return false;
      this.owner[i] = t;
      this.counts[prev]--;
      this.counts[t]++;
      this.teams[t].captured++;
      const c = this.teams[t].color.rgb, o = i * 4;
      this.img.data[o] = c[0]; this.img.data[o + 1] = c[1]; this.img.data[o + 2] = c[2];
      this.dirty = true;
      const pt = this.teams[prev];
      if (i === pt.cannon.cell && !pt.cannon.dead && pt.alive) {
        // The cannon holds its own tile: each capture costs it HP (more in overtime)
        // and the tile flips back.
        pt.cannon.hp -= this.power();
        pt.cannon.hit = 1;
        if (pt.cannon.hp <= 0) this.destroyCannon(prev, t);
        else { this.restoreCell(i, prev); return true; }
      }
      if (this.counts[prev] === 0 && pt.alive) this.eliminate(prev);
      return true;
    }

    restoreCell(i, t) {
      const prev = this.owner[i];
      this.owner[i] = t;
      this.counts[prev]--;
      this.counts[t]++;
      this.teams[prev].captured--;
      const c = this.teams[t].color.rgb, o = i * 4;
      this.img.data[o] = c[0]; this.img.data[o + 1] = c[1]; this.img.data[o + 2] = c[2];
    }

    // Losing the tile under the cannon wrecks it: that colour stops shooting and its
    // remaining land collapses to the colour that took the cannon.
    destroyCannon(t, by) {
      const tm = this.teams[t];
      tm.cannon.dead = true;
      tm.count = Math.max(1, Math.round(tm.count + tm.rel.val));
      tm.rel.val = 0;
      tm.rel.active = false;
      tm.cannon.cluster = 0;
      tm.spinBlocked = false;
      this.roulette.cancel(t);
      this.burst(tm.cannon.x, tm.cannon.y, '#ffd27a', 30, 12);
      this.shake = Math.max(this.shake, 0.8);
      const at = this.nearCannon(tm);
      this.float('field', at.x + (tm.cannon.x < N / 2 ? 1 : -1), at.y - 1, 'Пушка разрушена', '#ffd27a', 0.9, 1.6);
      MOR.Sound.play('boom');
      const cells = this.cellsOf(t, tm.cannon.x, tm.cannon.y);
      if (cells.length) {
        this.waves.push({ team: by, target: t, cells, i: 0, force: true,
          per: Math.max(1, Math.ceil(cells.length / (COLLAPSE_TIME / MOR.DT))) });
      }
    }

    // Tiles of colour t sorted by distance from (x, y).
    cellsOf(t, x, y) {
      const cells = [];
      for (let i = 0; i < N * N; i++) {
        if (this.owner[i] !== t) continue;
        const dx = (i % N) + 0.5 - x, dy = Math.floor(i / N) + 0.5 - y;
        cells.push([i, dx * dx + dy * dy]);
      }
      cells.sort((a, b) => a[1] - b[1]);
      return cells.map((c) => c[0]);
    }

    aliveTeams() { return this.teams.filter((t) => t.alive); }

    eliminate(t) {
      const tm = this.teams[t];
      tm.alive = false;
      tm.elimTime = this.time;
      tm.rel.active = false;
      tm.spinBlocked = false;
      this.elimOrder.push(t);
      this.roulette.cancel(t);
      this.burst(tm.cannon.x, tm.cannon.y, tm.color.hex, 40, 14);
      this.shake = Math.max(this.shake, 1);
      this.float('field', N / 2, N / 2, tm.color.name + ' выбывает', tm.color.hex, 1.4, 1.8);
      MOR.Sound.play('elim');
      const alive = this.aliveTeams();
      if (alive.length === 1) this.finish(alive[0].i);
    }

    finish(winner) {
      if (this.phase === 'over') return;
      this.phase = 'over';
      this.phaseT = 0;
      this.winner = winner;
      // finish() can run mid-iteration over bullets/waves/strikes, so those are
      // cleared on the next step instead of here.
      this.floaters = this.floaters.filter((f) => f.space !== 'field');
      MOR.Sound.play('win');
    }

    result() {
      const order = this.elimOrder.concat([this.winner]);
      return {
        title: this.title,
        isFinal: this.isFinal,
        duration: this.time,
        order: order.map((i) => this.teams[i].color),
        stats: this.teams.map((t) => ({
          color: t.color,
          place: 4 - order.indexOf(t.i),
          captured: t.captured,
          peakShare: t.peak / (N * N),
          elimTime: t.elimTime
        }))
      };
    }

    // ------------------------------------------------------------ slots & release
    onSlot(team, slot) {
      const box = team.box;
      if (slot === 0) {
        const mult = team.x4Until > this.time ? 4 : 2;
        team.count *= mult;
        box.pop = 1;
        box.flash[0] = 1;
        this.float('box' + team.i, X_A / 2, SLOT_TOP - 4, 'x' + mult, mult === 4 ? '#ffd84a' : '#7dffa8', 1, 0.8);
        MOR.Sound.play(mult === 4 ? 'x4' : 'x2');
      } else if (slot === 1) {
        if (team.spinBlocked) return;
        team.spinBlocked = true;
        box.flash[1] = 1;
        this.roulette.request(team.i);
      } else {
        if (team.rel.active) return;
        box.flash[2] = 1;
        this.startRelease(team);
      }
    }

    startRelease(team) {
      const r = team.rel;
      r.active = true;
      r.end = this.time + MOR.clamp(0.35 + team.count / 120, 0.4, 3.0);
      r.val = 0;
      r.spawn = 1;
      MOR.Sound.play('release');
    }

    stepRelease(team, dt) {
      const r = team.rel;
      if (!r.active) return;
      const left = r.end - this.time;
      let v = left <= dt ? team.count : team.count * dt / left;
      if (v > team.count) v = team.count;
      team.count -= v;
      r.val += v;
      r.spawn = Math.min(r.spawn + dt * SPAWN_RATE, 3);
      while (r.spawn >= 1 && r.val >= 1) {
        const hp = Math.floor(r.val);
        r.val -= hp;
        r.spawn -= 1;
        this.fire(team, hp, 0);
      }
      if (left <= dt) {
        const restHp = Math.round(r.val + team.count);
        if (restHp >= 1) this.fire(team, restHp, 0);
        team.count = 1;
        r.val = 0;
        r.active = false;
      }
    }

    // Overtime multiplier for shot strength (1 before OVERTIME_AT).
    power() {
      if (this.time < OVERTIME_AT) return 1;
      return Math.pow(2, 1 + Math.floor((this.time - OVERTIME_AT) / OVERTIME_STEP));
    }

    // kind: 0 ball, 1 cluster shell, 2 cannonball.
    fire(team, hp, kind) {
      const c = team.cannon;
      const a = c.ang + (this.rng() - 0.5) * 0.06;
      this.fireAt(team, a, hp, kind);
      // Twin cannon: every ordinary ball gets a sibling at a slight angle.
      if (kind === 0 && team.twinUntil > this.time) this.fireAt(team, a + (this.rng() < 0.5 ? 0.16 : -0.16), hp, kind);
      c.recoil = 1;
      MOR.Sound.play('shot');
    }

    fireAt(team, a, hp, kind) {
      const c = team.cannon;
      if (kind !== 1) hp *= this.power();
      const dx = Math.cos(a), dy = Math.sin(a);
      const sp = (kind === 0 ? BULLET_SPEED : kind === 1 ? 11 : 9) * (0.96 + this.rng() * 0.08);
      this.newBullets.push({ x: c.x + dx * 1.8, y: c.y + dy * 1.8, vx: dx * sp, vy: dy * sp, t: team.i, hp, kind, life: 0 });
    }

    // ------------------------------------------------------------ bonuses
    applyItem(t, id) {
      const team = this.teams[t];
      team.spinBlocked = false;
      if (!this.working(team) || this.phase !== 'play') return;
      const at = this.nearCannon(team);
      const box = 'box' + t;
      switch (id) {
        case 'plus':
          team.count += PLUS_BALLS;
          team.box.pop = 1;
          this.float(box, 50, 30, '+' + PLUS_BALLS, '#ffd84a', 1.4, 1.2);
          break;
        case 'x4':
          team.x4Until = Math.max(team.x4Until, this.time) + X4_TIME;
          this.float(box, X_A / 2, 60, 'x4!', '#ffd84a', 1.4, 1.2);
          break;
        case 'shield':
          team.shieldUntil = Math.max(team.shieldUntil, this.time) + SHIELD_TIME;
          this.float('field', at.x, at.y, 'ЩИТ', '#9fe2ff', 1.2, 1.2);
          MOR.Sound.play('shield');
          break;
        case 'cluster':
          team.cannon.cluster += CLUSTER_SHELLS;
          this.float('field', at.x, at.y, 'КЛАСТЕР', '#ffb27a', 1.2, 1.2);
          break;
        case 'half':
          this.startHalfLand(team);
          break;
        case 'ball':
          this.fire(team, CANNONBALL_HP, 2);
          this.float('field', at.x, at.y, 'ЯДРО', '#e6e9f5', 1.2, 1.2);
          MOR.Sound.play('boom');
          break;
        case 'twin':
          team.twinUntil = Math.max(team.twinUntil, this.time) + TWIN_TIME;
          this.float('field', at.x, at.y, 'ДВОЙНАЯ ПУШКА', '#ff9fbf', 1.0, 1.3);
          break;
        case 'fan': {
          const c = team.cannon;
          for (let k = 0; k < FAN_N; k++) this.fireAt(team, c.base - SWEEP + (2 * SWEEP * k) / (FAN_N - 1), 1, 0);
          c.recoil = 1;
          this.float('field', at.x, at.y, 'ВЕЕР', '#f3b8ff', 1.2, 1.2);
          MOR.Sound.play('release');
          break;
        }
        case 'bomb':
          this.startBomb(team);
          break;
        case 'bolt':
          this.startBolts(team);
          break;
        case 'freeze':
          for (const e of this.enemiesOf(team)) {
            e.frozenUntil = Math.max(e.frozenUntil, this.time) + FREEZE_TIME;
            this.float('box' + e.i, 50, 45, 'ЛЁД', '#bff3ff', 1.5, 1.2);
          }
          MOR.Sound.play('freeze');
          break;
        case 'turbo':
          team.turboUntil = Math.max(team.turboUntil, this.time) + TURBO_TIME;
          this.float(box, 50, 45, 'ТУРБО', '#ff8f8f', 1.5, 1.2);
          break;
        case 'div':
          for (const e of this.enemiesOf(team)) {
            e.count = Math.max(1, Math.round(e.count / 2));
            e.rel.val = Math.floor(e.rel.val / 2);
            e.box.pop = 1;
            this.float('box' + e.i, 50, 30, '÷2', '#9fb4ff', 1.4, 1.2);
          }
          break;
        case 'repair':
          team.cannon.hp = Math.min(CANNON_HP, team.cannon.hp + REPAIR_HP);
          this.convertDisk(team.cannon.x, team.cannon.y, REPAIR_R, t);
          this.float('field', at.x, at.y, 'РЕМОНТ', '#ffd9a8', 1.2, 1.2);
          MOR.Sound.play('shield');
          break;
        case 'gold':
          this.addMarble(team, undefined, true);
          this.float(box, 50, 45, '+1 шарик', '#ffd84a', 1.3, 1.2);
          MOR.Sound.play('marble');
          break;
      }
    }

    // Strongest enemy by territory, optionally skipping shielded ones.
    leader(team, allowShielded) {
      const cand = this.enemiesOf(team).filter((x) => allowShielded || !this.shielded(x.i));
      cand.sort((a, b) => this.counts[b.i] - this.counts[a.i]);
      return cand[0] || null;
    }

    startHalfLand(team) {
      const target = this.leader(team, false);
      if (!target) { this.float('field', N / 2, N / 2, 'Цель под щитом', '#ffffff', 1, 1.2); return; }
      const cells = this.cellsOf(target.i, team.cannon.x, team.cannon.y);
      const take = Math.floor(cells.length / 2);
      if (take < 1) return;
      this.waves.push({ team: team.i, target: target.i, cells: cells.slice(0, take), i: 0,
        per: Math.max(1, Math.ceil(take / (HALF_LAND_TIME / MOR.DT))) });
      this.float('field', N / 2, N / 2, 'HALF LAND: −' + take + ' у ' + target.color.name, '#d7c2ff', 1.1, 1.6);
      MOR.Sound.play('shield');
    }

    startBomb(team) {
      const target = this.leader(team, false);
      if (!target) { this.float('field', N / 2, N / 2, 'Цель под щитом', '#ffffff', 1, 1.2); return; }
      // Aim at the target's tile closest to the middle of its land.
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < N * N; i++) if (this.owner[i] === target.i) { sx += i % N; sy += Math.floor(i / N); n++; }
      const cells = this.cellsOf(target.i, sx / n + 0.5, sy / n + 0.5);
      const ci = cells[0];
      this.strikes.push({ kind: 'bomb', team: team.i, x: (ci % N) + 0.5, y: Math.floor(ci / N) + 0.5, t: 0, delay: 0.9, r: BOMB_R });
      this.float('field', N / 2, N / 2, 'БОМБА → ' + target.color.name, '#e6e9f5', 1.1, 1.4);
    }

    startBolts(team) {
      const pool = [];
      for (let i = 0; i < N * N; i++) {
        const o = this.owner[i];
        if (o !== team.i && this.teams[o].alive && !this.shielded(o)) pool.push(i);
      }
      if (!pool.length) { this.float('field', N / 2, N / 2, 'Цель под щитом', '#ffffff', 1, 1.2); return; }
      for (let k = 0; k < BOLTS; k++) {
        const ci = pool[this.rng.int(pool.length)];
        this.strikes.push({ kind: 'bolt', team: team.i, x: (ci % N) + 0.5, y: Math.floor(ci / N) + 0.5, t: 0, delay: 0.2 + k * 0.18, r: BOLT_R });
      }
      this.float('field', N / 2, N / 2, 'МОЛНИЯ', '#b7c5ff', 1.3, 1.3);
    }

    // ------------------------------------------------------------ simulation
    step(dt) {
      this.clock += dt;
      this.phaseT += dt;
      this.shake = Math.max(0, this.shake - dt * 2.5);
      this.stepFx(dt);
      if (this.phase === 'intro') {
        if (this.phaseT > 1.8) { this.phase = 'play'; this.phaseT = 0; }
        return;
      }
      if (this.phase === 'over') {
        this.bullets.length = 0;
        this.waves.length = 0;
        this.strikes.length = 0;
        if (this.phaseT > 3.5 && !this.reported) {
          this.reported = true;
          this.game.onBattleEnd(this.result());
        }
        return;
      }
      this.time += dt;

      const pw = this.power();
      if (pw !== this.lastPower) {
        this.lastPower = pw;
        this.float('field', N / 2, N / 2 + 4, 'ОВЕРТАЙМ ×' + pw + ': шары пробивают насквозь', '#ffcf3a', 0.9, 2.0);
        MOR.Sound.play('spin');
      }

      for (const t of this.teams) {
        if (!this.working(t)) continue;
        const c = t.cannon;
        if (this.frozen(t.i)) {
          // Frozen: box, cannon sweep, release and cluster shells all wait.
          if (t.rel.active) t.rel.end += dt;
          continue;
        }
        this.stepBox(t, dt);
        if (t.turboUntil > this.time) this.stepBox(t, dt);
        c.phase += c.speed * dt;
        c.ang = c.base + SWEEP * Math.sin(c.phase);
        c.recoil = Math.max(0, c.recoil - dt * 6);
        this.stepRelease(t, dt);
        if (c.cluster > 0) {
          c.clusterT -= dt;
          if (c.clusterT <= 0) { c.cluster--; c.clusterT = 0.45; this.fire(t, 1, 1); }
        }
      }
      if (this.phase !== 'play') return;
      this.roulette.step(dt);
      this.stepBullets(dt);
      this.stepStrikes(dt);
      this.stepWaves();
      for (const t of this.teams) if (this.counts[t.i] > t.peak) t.peak = this.counts[t.i];
      this.checkStalemate();
    }

    // If every surviving colour has lost its cannon and nothing is in flight,
    // the colour holding the most tiles absorbs the rest and wins.
    checkStalemate() {
      if (this.phase !== 'play' || this.bullets.length || this.waves.length || this.strikes.length) return;
      const alive = this.aliveTeams();
      if (alive.some((t) => !t.cannon.dead)) return;
      alive.sort((a, b) => this.counts[b.i] - this.counts[a.i]);
      const w = alive[0].i;
      for (let i = 0; i < N * N && this.phase === 'play'; i++) if (this.owner[i] !== w) this.setCell(i, w);
    }

    stepFx(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life += dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.97; p.vy *= 0.97;
        if (p.life > p.max) this.particles.splice(i, 1);
      }
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.t += dt;
        if (f.t > f.dur) this.floaters.splice(i, 1);
      }
      for (let i = this.bolts.length - 1; i >= 0; i--) {
        this.bolts[i].life -= dt;
        if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
      }
      for (const t of this.teams) {
        t.cannon.hit = Math.max(0, t.cannon.hit - dt * 5);
        t.box.pop = Math.max(0, t.box.pop - dt * 4);
        for (let k = 0; k < 3; k++) t.box.flash[k] = Math.max(0, t.box.flash[k] - dt * 3);
        for (const m of t.box.marbles) m.flash = Math.max(0, m.flash - dt * 2.5);
      }
    }

    // Pegs of one box at its own clock (frozen boxes stop, turbo boxes run double).
    pegsAt(time) {
      const out = [];
      const span = PEG_ROWS * PEG_SP;
      for (let k = 0; k < PEG_ROWS; k++) {
        const row = PEG_PATTERN[k];
        for (const p of row) {
          const y = PEG_BOT - ((time * PEG_SPEED + k * PEG_SP) % span);
          const f = MOR.clamp(Math.min(PEG_BOT - y, y - PEG_TOP) / PEG_FADE, 0, 1);
          if (f >= 0.02) out.push({ x: p[0], y, r: p[1] * f });
        }
      }
      return out;
    }

    // Blocked slots become solid blocks: [x0, x1, top].
    blocks(team) {
      const out = [];
      if (team.spinBlocked) out.push([X_A, X_B, POST_TOP]);
      if (team.rel.active) out.push([X_B, 100, SLOT_TOP]);
      return out;
    }

    stepBox(team, dt) {
      const box = team.box;
      box.time += dt;
      const pegs = this.pegsAt(box.time);
      const blocks = this.blocks(team);
      const sub = 2, h = dt / sub;
      const ms = box.marbles;
      for (let s = 0; s < sub; s++) {
        for (const m of ms) {
          m.vy += GRAV * h;
          m.x += m.vx * h;
          m.y += m.vy * h;
          for (const p of pegs) {
            if (P.circle(m, p.x, p.y, p.r, 0.5, 0.03, 0, -PEG_SPEED)) {
              m.vx += (this.rng() - 0.5) * 2;
              if (m.touch && m.touch !== p) m.cradle = true;
              m.touch = p;
            }
          }
          P.segment(m, 0, 0, 0, 100, 0, 0.5, 0.02);
          P.segment(m, 100, 0, 100, 100, 0, 0.5, 0.02);
          P.segment(m, 0, CEIL, 100, CEIL, 0, 0.1, 0.02);
          P.segment(m, X_A, POST_TOP, X_A, 100, POST_R, 0.4, 0.02);
          P.segment(m, X_B, POST_TOP, X_B, 100, POST_R, 0.4, 0.02);
          // Marbles already inside a slot when it closes just finish falling.
          for (const bl of blocks) if (m.y < bl[2] + 1) P.rect(m, bl[0], bl[2], bl[1], 100, 0.45, 0.02);
          P.limit(m, 140);
        }
        for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) P.balls(ms[i], ms[j], 0.5);
      }
      for (let i = ms.length - 1; i >= 0; i--) {
        const m = ms[i];
        if (m.gold && this.time > m.expires) { ms.splice(i, 1); continue; }
        if (m.y > TRIGGER_Y) {
          this.onSlot(team, m.x < X_A ? 0 : m.x < X_B ? 1 : 2);
          m.x = this.rng.range(10, 90);
          m.y = CEIL + MARBLE_R + 1;
          m.vx = this.rng.range(-15, 15);
          m.vy = SPAWN_VY;
          m.flash = 1;
          m.still = 0;
          continue;
        }
        // A marble wedged between two pegs climbs out over one of them; one riding up
        // on a single peg rolls off it. The divider pair thus acts as a roof over the spinner.
        m.popT = Math.max(0, (m.popT || 0) - dt);
        const riding = m.touch && m.vy < 0 && m.vy > -PEG_SPEED - 6;
        m.ride = riding ? (m.ride || 0) + dt : 0;
        if (m.popT === 0 && (m.cradle || m.ride > 0.12)) {
          if (m.cradle) {
            m.vx = (this.rng() < 0.5 ? -1 : 1) * this.rng.range(40, 50);
            m.vy = -45;
          } else {
            const dir = m.x < m.touch.x ? -1 : m.x > m.touch.x ? 1 : (this.rng() < 0.5 ? -1 : 1);
            m.vx = dir * this.rng.range(35, 50);
            m.vy = 5;
          }
          m.ride = 0;
          m.popT = 0.25;
        }
        m.touch = null;
        m.cradle = false;
        const sp = Math.abs(m.vx) + Math.abs(m.vy);
        m.still = sp < 3 ? m.still + dt : 0;
        if (m.still > 1.0) { m.vx = this.rng.range(-40, 40); m.vy = -30; m.still = 0; }
      }
    }

    stepBullets(dt) {
      const owner = this.owner, teams = this.teams;
      const pierce = this.power() > 1;
      const list = this.bullets;
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        let dead = !teams[b.t].alive;
        b.life += dt;
        if (!dead) {
          const dist = Math.hypot(b.vx, b.vy) * dt;
          const steps = Math.max(1, Math.ceil(dist / 0.45));
          for (let k = 0; k < steps && !dead; k++) {
            const px = b.x, py = b.y;
            let nx = px + b.vx * dt / steps, ny = py + b.vy * dt / steps;
            if (nx < 0) { nx = -nx; b.vx = -b.vx; } else if (nx > N) { nx = 2 * N - nx; b.vx = -b.vx; }
            if (ny < 0) { ny = -ny; b.vy = -b.vy; } else if (ny > N) { ny = 2 * N - ny; b.vy = -b.vy; }
            const cx = Math.min(N - 1, nx | 0), cy = Math.min(N - 1, ny | 0);
            const ci = cy * N + cx;
            const o = owner[ci];
            if (o === b.t) { b.x = nx; b.y = ny; continue; }
            if (teams[o].shieldUntil > this.time) {
              this.burst(nx, ny, '#bfefff', 3, 6);
              dead = true;
              break;
            }
            this.setCell(ci, b.t);
            if (b.kind === 1) {
              // Cluster shell bursts into many small balls.
              for (let s = 0; s < CLUSTER_N; s++) {
                const a = (s / CLUSTER_N) * Math.PI * 2 + this.rng() * 0.15;
                const sp = BULLET_SPEED * (0.75 + this.rng() * 0.4);
                this.newBullets.push({ x: cx + 0.5, y: cy + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: b.t, hp: 1, kind: 0, life: 0 });
              }
              this.burst(cx + 0.5, cy + 0.5, '#ffd0a0', 18, 12);
              this.shake = Math.max(this.shake, 0.4);
              dead = true;
              break;
            }
            b.hp -= 1;
            if (b.hp <= 0) { dead = true; break; }
            // In overtime heavy balls punch straight through enemy land toward the cannons.
            if (pierce) { b.x = nx; b.y = ny; continue; }
            // Otherwise a heavy ball bounces off the tile it just took and keeps going.
            const pcx = Math.min(N - 1, px | 0), pcy = Math.min(N - 1, py | 0);
            if (pcx !== cx) b.vx = -b.vx;
            if (pcy !== cy) b.vy = -b.vy;
            b.x = px; b.y = py;
          }
        }
        if (dead || b.life > 30 || this.phase !== 'play') {
          list[i] = list[list.length - 1];
          list.pop();
        }
      }
      if (this.newBullets.length) {
        for (const b of this.newBullets) if (teams[b.t].alive) list.push(b);
        this.newBullets.length = 0;
      }
    }

    convertDisk(x, y, R, t) {
      for (let cy = Math.max(0, Math.floor(y - R)); cy <= Math.min(N - 1, Math.floor(y + R)); cy++) {
        for (let cx = Math.max(0, Math.floor(x - R)); cx <= Math.min(N - 1, Math.floor(x + R)); cx++) {
          const dx = cx + 0.5 - x, dy = cy + 0.5 - y;
          if (dx * dx + dy * dy > R * R) continue;
          const i = cy * N + cx, o = this.owner[i];
          if (o === t || this.shielded(o)) continue;
          if (this.setCell(i, t) && this.rng() < 0.3) this.burst(cx + 0.5, cy + 0.5, this.teams[t].color.hex, 1, 8);
          if (this.phase !== 'play') return;
        }
      }
    }

    stepStrikes(dt) {
      for (let i = this.strikes.length - 1; i >= 0; i--) {
        const s = this.strikes[i];
        if (!this.teams[s.team].alive || this.phase !== 'play') { this.strikes.splice(i, 1); continue; }
        s.t += dt;
        if (s.t < s.delay) continue;
        this.strikes.splice(i, 1);
        if (s.kind === 'bomb') {
          this.burst(s.x, s.y, '#ffb347', 40, 18);
          this.burst(s.x, s.y, '#ffffff', 16, 10);
          this.shake = Math.max(this.shake, 1);
          MOR.Sound.play('boom');
        } else {
          this.bolts.push({ x: s.x, y: s.y, life: 0.3, seed: this.rng() * 1000 });
          this.burst(s.x, s.y, '#dbe4ff', 10, 10);
          MOR.Sound.play('zap');
        }
        this.convertDisk(s.x, s.y, s.r, s.team);
      }
    }

    stepWaves() {
      for (let i = this.waves.length - 1; i >= 0; i--) {
        const w = this.waves[i];
        if (!this.teams[w.team].alive || this.phase !== 'play') { this.waves.splice(i, 1); continue; }
        for (let n = 0; n < w.per && w.i < w.cells.length; n++) {
          const ci = w.cells[w.i++];
          if (this.owner[ci] !== w.target || (!w.force && this.shielded(w.target))) continue;
          this.setCell(ci, w.team);
          if (this.phase !== 'play') break;
        }
        if (w.i >= w.cells.length) this.waves.splice(i, 1);
      }
    }

    // ------------------------------------------------------------ layout & render
    layout(w, h, top) {
      const pad = 8, gap = 8, barH = 16;
      const aw = w - pad * 2, ah = h - top - pad * 2;
      const L = { barH };
      const boxes = [];
      if (h - top >= w * 1.1) {
        const S = Math.min(aw, (ah - barH - gap * 3) / 2);
        const B = Math.min((ah - S - barH - gap * 3) / 2, (aw - gap) / 2);
        const total = 2 * B + S + barH + gap * 3;
        const y0 = top + pad + Math.max(0, (ah - total) / 2);
        L.field = { x: (w - S) / 2, y: y0 + B + gap, s: S };
        L.bar = { x: L.field.x, y: L.field.y + S + gap, w: S };
        const yb = L.bar.y + barH + gap;
        const xl = w / 2 - gap / 2 - B, xr = w / 2 + gap / 2;
        boxes[0] = { x: xl, y: y0, s: B };
        boxes[1] = { x: xr, y: y0, s: B };
        boxes[2] = { x: xl, y: yb, s: B };
        boxes[3] = { x: xr, y: yb, s: B };
      } else {
        const S = Math.min(ah - barH - gap, (aw - gap * 4) / 2);
        const B = Math.min((ah - gap) / 2, (aw - S - gap * 4) / 2);
        const total = 2 * B + S + gap * 4;
        const x0 = pad + (aw - total) / 2;
        const y0 = top + pad + (ah - (S + barH + gap)) / 2;
        const by0 = top + pad + (ah - (2 * B + gap)) / 2;
        L.field = { x: x0 + B + gap * 2, y: y0, s: S };
        L.bar = { x: L.field.x, y: y0 + S + gap, w: S };
        const xr = L.field.x + S + gap * 2;
        boxes[0] = { x: x0, y: by0, s: B };
        boxes[2] = { x: x0, y: by0 + B + gap, s: B };
        boxes[1] = { x: xr, y: by0, s: B };
        boxes[3] = { x: xr, y: by0 + B + gap, s: B };
      }
      L.boxes = boxes;
      return L;
    }

    render(ctx, w, h, top) {
      const L = this.layout(w, h, top);
      const F = L.field;
      const cs = F.s / N;
      ctx.save();
      if (this.shake > 0) {
        const a = this.shake * Math.min(6, F.s * 0.012);
        ctx.translate((Math.random() - 0.5) * a * 2, (Math.random() - 0.5) * a * 2);
      }
      this.renderField(ctx, F, cs);
      ctx.restore();
      for (let i = 0; i < 4; i++) this.renderBox(ctx, this.teams[i], L.boxes[i]);
      this.renderBar(ctx, L.bar, L.barH);
      this.renderFloaters(ctx, L, cs);
      if (this.phase === 'play') this.roulette.render(ctx, F.x + F.s / 2, F.y + F.s / 2, F.s * 0.3);
      this.renderBanner(ctx, F);
    }

    renderField(ctx, F, cs) {
      if (this.dirty) { this.tileCtx.putImageData(this.img, 0, 0); this.dirty = false; }
      ctx.fillStyle = '#05070d';
      ctx.fillRect(F.x - 3, F.y - 3, F.s + 6, F.s + 6);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.tileCanvas, F.x, F.y, F.s, F.s);
      ctx.imageSmoothingEnabled = true;

      // Grid lines.
      if (cs >= 4) {
        ctx.strokeStyle = 'rgba(0,0,0,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < N; i++) {
          const p = Math.round(F.x + i * cs) + 0.5;
          ctx.moveTo(p, F.y); ctx.lineTo(p, F.y + F.s);
          const q = Math.round(F.y + i * cs) + 0.5;
          ctx.moveTo(F.x, q); ctx.lineTo(F.x + F.s, q);
        }
        ctx.stroke();
      }

      // Shield overlay.
      const anyShield = this.teams.some((t) => t.alive && this.shielded(t.i));
      if (anyShield) {
        const d = this.shieldImg.data;
        const pulse = 0.5 + 0.5 * Math.sin(this.clock * 6);
        for (let i = 0; i < N * N; i++) {
          const o = i * 4;
          const sh = this.shielded(this.owner[i]);
          d[o] = 200; d[o + 1] = 240; d[o + 2] = 255;
          d[o + 3] = sh ? 70 + 60 * pulse : 0;
        }
        this.shieldCtx.putImageData(this.shieldImg, 0, 0);
        ctx.drawImage(this.shieldCanvas, F.x, F.y, F.s, F.s);
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x, F.y, F.s, F.s);
      ctx.clip();
      // Bullets, batched per colour.
      for (const t of this.teams) {
        ctx.fillStyle = t.color.hex;
        ctx.strokeStyle = t.color.edge;
        ctx.lineWidth = Math.max(1, cs * 0.12);
        ctx.beginPath();
        let any = false;
        for (const b of this.bullets) {
          if (b.t !== t.i || b.kind !== 0) continue;
          const r = Math.min(1.1, 0.27 + 0.08 * Math.log2(Math.max(1, b.hp)));
          const x = F.x + b.x * cs, y = F.y + b.y * cs;
          ctx.moveTo(x + r * cs, y);
          ctx.arc(x, y, r * cs, 0, Math.PI * 2);
          any = true;
        }
        if (any) { ctx.fill(); ctx.stroke(); }
      }
      // Cluster shells and cannonballs.
      for (const b of this.bullets) {
        if (b.kind === 0) continue;
        const x = F.x + b.x * cs, y = F.y + b.y * cs, col = this.teams[b.t].color;
        if (b.kind === 1) {
          ctx.fillStyle = col.hex;
          ctx.beginPath(); ctx.arc(x, y, 0.75 * cs, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1.5, cs * 0.2);
          ctx.beginPath(); ctx.arc(x, y, 0.95 * cs, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.fillStyle = '#20242e';
          ctx.beginPath(); ctx.arc(x, y, 1.25 * cs, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = col.hex;
          ctx.lineWidth = Math.max(2, cs * 0.35);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath(); ctx.arc(x - cs * 0.4, y - cs * 0.4, cs * 0.35, 0, Math.PI * 2); ctx.fill();
        }
      }
      // Particles.
      for (const p of this.particles) {
        const a = 1 - p.life / p.max;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(F.x + p.x * cs - cs * 0.2, F.y + p.y * cs - cs * 0.2, cs * 0.4, cs * 0.4);
      }
      ctx.globalAlpha = 1;
      this.renderStrikes(ctx, F, cs);
      ctx.restore();

      for (const t of this.teams) this.drawCannon(ctx, t, F, cs);

      // Frame.
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(F.x - 1, F.y - 1, F.s + 2, F.s + 2);
    }

    renderStrikes(ctx, F, cs) {
      for (const s of this.strikes) {
        if (s.kind !== 'bomb') continue;
        const x = F.x + s.x * cs, y = F.y + s.y * cs;
        const k = Math.min(1, s.t / s.delay);
        // Target ring.
        ctx.strokeStyle = 'rgba(255,90,90,' + (0.5 + 0.4 * Math.sin(this.clock * 20)) + ')';
        ctx.lineWidth = Math.max(1.5, cs * 0.25);
        ctx.setLineDash([cs * 0.8, cs * 0.5]);
        ctx.beginPath(); ctx.arc(x, y, s.r * cs, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // Falling bomb with its shadow.
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(x, y, cs * (0.5 + k), cs * (0.25 + k * 0.5), 0, 0, Math.PI * 2); ctx.fill();
        const by = y - (1 - k) * cs * 10;
        ctx.fillStyle = '#16181e';
        ctx.beginPath(); ctx.arc(x, by, cs * 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = Math.max(1.5, cs * 0.2);
        ctx.beginPath(); ctx.moveTo(x + cs * 0.6, by - cs * 0.8); ctx.lineTo(x + cs * 1.1, by - cs * 1.5); ctx.stroke();
      }
      for (const b of this.bolts) {
        const x = F.x + b.x * cs, y = F.y + b.y * cs;
        ctx.globalAlpha = Math.min(1, b.life / 0.15);
        ctx.strokeStyle = '#e7ecff';
        ctx.lineWidth = Math.max(2, cs * 0.35);
        ctx.shadowColor = '#7f96ff';
        ctx.shadowBlur = cs * 1.5;
        ctx.beginPath();
        ctx.moveTo(x + Math.sin(b.seed) * cs * 3, F.y);
        const steps = 7;
        for (let i = 1; i <= steps; i++) {
          const k = i / steps;
          const jitter = i === steps ? 0 : Math.sin(b.seed * (i + 1) * 1.7) * cs * 1.6;
          ctx.lineTo(MOR.lerp(x + Math.sin(b.seed) * cs * 3, x, k) + jitter, MOR.lerp(F.y, y, k));
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }

    drawCannon(ctx, t, F, cs) {
      const c = t.cannon;
      const x = F.x + c.x * cs, y = F.y + c.y * cs;
      const R = cs * 1.25;
      const working = this.working(t);
      const frozen = working && this.frozen(t.i);
      ctx.save();
      ctx.translate(x, y);
      if (working) {
        ctx.rotate(c.ang);
        const back = c.recoil * cs * 0.3;
        const twin = t.twinUntil > this.time;
        const barrels = twin ? [-0.32, 0.32] : [0];
        for (const off of barrels) {
          ctx.fillStyle = '#2a2f40';
          ctx.strokeStyle = '#0b0d14';
          ctx.lineWidth = Math.max(1, cs * 0.16);
          const bw = twin ? 0.56 : 0.84;
          MOR.roundRect(ctx, R * 0.3 - back, off * cs - cs * bw / 2, cs * 2.3, cs * bw, cs * 0.2);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = t.color.hex;
          ctx.fillRect(R * 0.3 - back + cs * 1.8, off * cs - cs * bw / 2, cs * 0.42, cs * bw);
        }
        ctx.rotate(-c.ang);
      }
      ctx.fillStyle = working ? t.color.hex : '#3a3f4f';
      ctx.strokeStyle = '#0b0d14';
      ctx.lineWidth = Math.max(1.5, cs * 0.2);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (working) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + c.hit * 0.5) + ')';
        ctx.beginPath(); ctx.arc(-R * 0.25, -R * 0.25, R * 0.35, 0, Math.PI * 2); ctx.fill();
        if (c.hp < CANNON_HP) {
          // Health ring: green -> red.
          const k = c.hp / CANNON_HP;
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = Math.max(2, cs * 0.3);
          ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = k > 0.5 ? '#5ef08a' : k > 0.25 ? '#ffcf3a' : '#ff4d5e';
          ctx.lineWidth = Math.max(1.5, cs * 0.2);
          ctx.beginPath(); ctx.arc(0, 0, R * 0.72, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
        }
        if (frozen) {
          ctx.fillStyle = 'rgba(170,230,255,0.55)';
          ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        // Wrecked: grey base with a cross.
        ctx.strokeStyle = t.color.hex;
        ctx.lineWidth = Math.max(1.5, cs * 0.25);
        ctx.beginPath();
        ctx.moveTo(-R * 0.5, -R * 0.5); ctx.lineTo(R * 0.5, R * 0.5);
        ctx.moveTo(R * 0.5, -R * 0.5); ctx.lineTo(-R * 0.5, R * 0.5);
        ctx.stroke();
      }
      // Shield ring (time left) and cluster shells left.
      if (t.alive && this.shielded(t.i)) {
        const k = (t.shieldUntil - this.time) / SHIELD_TIME;
        ctx.strokeStyle = '#bfefff';
        ctx.lineWidth = Math.max(2, cs * 0.28);
        ctx.beginPath(); ctx.arc(0, 0, R * 1.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k)); ctx.stroke();
      }
      if (working && c.cluster > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.font = Math.round(cs * 1.1) + 'px ' + MOR.FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×' + c.cluster, 0, 1);
      }
      ctx.restore();
    }

    // Name and seconds left of the most relevant timed effect on a team.
    status(t) {
      if (this.frozen(t.i)) return ['ЛЁД', t.frozenUntil, '#9fe8ff'];
      if (t.turboUntil > this.time) return ['ТУРБО', t.turboUntil, '#ff8f8f'];
      if (t.twinUntil > this.time) return ['2×', t.twinUntil, '#ff9fbf'];
      return null;
    }

    renderBox(ctx, t, R) {
      const u = R.s / 100;
      const box = t.box;
      ctx.save();
      ctx.translate(R.x, R.y);
      ctx.scale(u, u);
      // Panel.
      MOR.roundRect(ctx, 0, 0, 100, 100, 5);
      ctx.fillStyle = MOR.mix(t.color.rgb, [14, 17, 30], 0.82);
      ctx.fill();
      ctx.save();
      ctx.clip();

      // Slots.
      const x4 = t.x4Until > this.time;
      const slotCol = [x4 ? '#b8860b' : '#1f8a4c', '#c79a00', '#c0392b'];
      const xs = [0, X_A, X_B, 100];
      const blocked = [false, t.spinBlocked, t.rel.active];
      const tops = [SLOT_TOP, POST_TOP, SLOT_TOP];
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = slotCol[k];
        ctx.fillRect(xs[k], tops[k], xs[k + 1] - xs[k], 100 - tops[k]);
        if (box.flash[k] > 0) {
          ctx.fillStyle = 'rgba(255,255,255,' + box.flash[k] * 0.6 + ')';
          ctx.fillRect(xs[k], tops[k], xs[k + 1] - xs[k], 100 - tops[k]);
        }
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '9px ' + MOR.FONT;
      ctx.fillText(x4 ? 'x4' : 'x2', X_A / 2, 92);
      if (x4) {
        const k = (t.x4Until - this.time) / X4_TIME;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(3, 97.5, (X_A - 6) * Math.min(1, k), 1.5);
      }
      ctx.font = '5.6px ' + MOR.FONT;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('ВЫПУСК', (X_B + 100) / 2, 92);
      this.drawMiniWheel(ctx, (X_A + X_B) / 2, 92, 4.6, t.spinBlocked ? this.clock * 8 : 0);

      // Blocked slots turn into solid dark blocks.
      for (let k = 1; k < 3; k++) {
        if (!blocked[k]) continue;
        const x0 = xs[k], w = xs[k + 1] - xs[k], top = tops[k], bh = 100 - top;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, top, w, bh);
        ctx.clip();
        ctx.fillStyle = 'rgba(8,10,16,0.86)';
        ctx.fillRect(x0, top, w, bh);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let d = -bh; d < w; d += 4) { ctx.moveTo(x0 + d, 100); ctx.lineTo(x0 + d + bh, top); }
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x0, top, w, 0.9);
        if (k === 2) {
          // Release progress: the block empties as the cannon fires.
          const left = Math.max(0, Math.min(1, (t.rel.end - this.time) / 3));
          ctx.fillStyle = 'rgba(192,57,43,0.55)';
          ctx.fillRect(x0 + 3, 96, (w - 6) * left, 1.6);
        } else {
          this.drawMiniWheel(ctx, x0 + w / 2, 92, 4.6, this.clock * 8, 0.35);
        }
      }

      // Divider posts around the spinner slot.
      ctx.strokeStyle = '#e9ecf7';
      ctx.lineWidth = POST_R * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X_A, POST_TOP); ctx.lineTo(X_A, 100);
      ctx.moveTo(X_B, POST_TOP); ctx.lineTo(X_B, 100);
      ctx.stroke();

      // Pegs (rising grid growing out of the dividers and walls).
      ctx.fillStyle = '#e6e9f5';
      for (const p of this.pegsAt(box.time)) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }

      // Marbles.
      const gold = MOR.GOLD_COLOR;
      for (const m of box.marbles) {
        if (m.flash > 0) {
          ctx.fillStyle = 'rgba(255,255,255,' + m.flash * 0.4 + ')';
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 3 * m.flash, 0, Math.PI * 2); ctx.fill();
        }
        MOR.drawMarble(ctx, m.x, m.y, m.r, m.gold ? gold : t.color);
      }

      // Header with the ball count.
      ctx.fillStyle = 'rgba(5,7,13,0.55)';
      ctx.fillRect(0, 0, 100, CEIL);
      const shown = t.rel.active ? Math.max(1, t.count + t.rel.val) : t.count;
      const sc = 1 + box.pop * 0.25;
      ctx.save();
      ctx.translate(50, CEIL / 2 + 0.6);
      ctx.scale(sc, sc);
      ctx.font = '9.5px ' + MOR.FONT;
      ctx.fillStyle = t.rel.active ? '#ffcf3a' : '#ffffff';
      ctx.fillText(MOR.fmt(shown), 0, 0);
      ctx.restore();
      // Marbles in play (dots) on the left, active timed effect on the right.
      box.marbles.forEach((m, k) => {
        ctx.fillStyle = m.gold ? gold.hex : '#ffffff';
        ctx.beginPath(); ctx.arc(5 + k * 4.2, CEIL / 2, 1.4, 0, Math.PI * 2); ctx.fill();
      });
      const st = this.status(t);
      if (st) {
        ctx.font = '4.6px ' + MOR.FONT;
        ctx.textAlign = 'right';
        ctx.fillStyle = st[2];
        ctx.fillText(st[0] + ' ' + Math.ceil(st[1] - this.time), 97, CEIL / 2 + 0.4);
        ctx.textAlign = 'center';
      }
      if (this.frozen(t.i) && this.working(t)) {
        ctx.fillStyle = 'rgba(150,220,255,0.22)';
        ctx.fillRect(0, CEIL, 100, 100 - CEIL);
      }
      ctx.restore(); // clip

      MOR.roundRect(ctx, 0, 0, 100, 100, 5);
      const turbo = t.turboUntil > this.time && this.working(t);
      ctx.lineWidth = turbo ? 2.4 : 1.6;
      ctx.strokeStyle = turbo && Math.floor(this.clock * 6) % 2 === 0 ? '#ffffff' : t.color.hex;
      ctx.stroke();

      if (!this.working(t)) {
        MOR.roundRect(ctx, 0, 0, 100, 100, 5);
        ctx.fillStyle = 'rgba(5,7,13,0.72)';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = (t.alive ? '7.5px ' : '10px ') + MOR.FONT;
        ctx.fillText(t.alive ? 'ПУШКА РАЗРУШЕНА' : 'ВЫБЫЛ', 50, 46);
        ctx.font = '6px ' + MOR.FONT;
        ctx.fillStyle = t.color.hex;
        ctx.fillText(t.color.name, 50, 58);
      }
      ctx.restore();
    }

    drawMiniWheel(ctx, x, y, r, ang, alpha) {
      const items = this.roulette.items, n = items.length;
      ctx.save();
      if (alpha !== undefined) ctx.globalAlpha = alpha;
      for (let i = 0; i < n; i++) {
        const a0 = ang + i * Math.PI * 2 / n;
        ctx.fillStyle = BONUSES[items[i]].color;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0, a0 + Math.PI * 2 / n); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    renderBar(ctx, B, h) {
      let x = B.x;
      const total = N * N;
      MOR.roundRect(ctx, B.x, B.y, B.w, h, h / 2);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#1a1f33';
      ctx.fillRect(B.x, B.y, B.w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = Math.round(h * 0.68) + 'px ' + MOR.FONT;
      for (const t of this.teams) {
        const ww = B.w * this.counts[t.i] / total;
        if (ww <= 0) continue;
        ctx.fillStyle = t.color.hex;
        ctx.fillRect(x, B.y, ww + 0.5, h);
        if (ww > h * 2.6) {
          ctx.fillStyle = t.color.ink;
          ctx.fillText(Math.round(this.counts[t.i] / total * 100) + '%', x + ww / 2, B.y + h / 2 + 1);
        }
        x += ww;
      }
      ctx.restore();
    }

    renderFloaters(ctx, L, cs) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const f of this.floaters) {
        const k = f.t / f.dur;
        let x, y, unit;
        if (f.space === 'field') {
          x = L.field.x + f.x * cs; y = L.field.y + f.y * cs - k * cs * 3; unit = cs * 1.6;
        } else {
          const b = L.boxes[+f.space.slice(3)];
          const u = b.s / 100;
          x = b.x + f.x * u; y = b.y + (f.y - k * 10) * u; unit = u * 8;
        }
        ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
        ctx.font = Math.round(unit * f.size) + 'px ' + MOR.FONT;
        ctx.lineWidth = Math.max(2, unit * f.size * 0.18);
        ctx.strokeStyle = 'rgba(5,7,13,0.85)';
        ctx.strokeText(f.text, x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, x, y);
      }
      ctx.globalAlpha = 1;
    }

    renderBanner(ctx, F) {
      if (this.phase === 'play') return;
      const cx = F.x + F.s / 2, cy = F.y + F.s / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (this.phase === 'intro') {
        const k = Math.min(1, this.phaseT / 0.3);
        ctx.globalAlpha = k * (this.phaseT > 1.5 ? Math.max(0, (1.8 - this.phaseT) / 0.3) : 1);
        ctx.fillStyle = 'rgba(5,7,13,0.75)';
        ctx.fillRect(F.x, cy - F.s * 0.13, F.s, F.s * 0.26);
        ctx.fillStyle = '#ffcf3a';
        ctx.font = Math.round(F.s * 0.09) + 'px ' + MOR.FONT;
        ctx.fillText(this.title, cx, cy - F.s * 0.035);
        ctx.font = Math.round(F.s * 0.04) + 'px ' + MOR.FONT;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(this.teams.map((t) => t.color.name).join(' · '), cx, cy + F.s * 0.065);
      } else if (this.phase === 'over') {
        const t = this.teams[this.winner];
        const k = Math.min(1, this.phaseT / 0.4);
        ctx.globalAlpha = k;
        ctx.fillStyle = 'rgba(5,7,13,0.78)';
        ctx.fillRect(F.x, cy - F.s * 0.16, F.s, F.s * 0.32);
        ctx.fillStyle = '#ffffff';
        ctx.font = Math.round(F.s * 0.045) + 'px ' + MOR.FONT;
        ctx.fillText(this.isFinal ? 'ЧЕМПИОН ТУРНИРА' : 'ПОБЕДИТЕЛЬ РАУНДА', cx, cy - F.s * 0.075);
        ctx.font = Math.round(F.s * 0.1 * (0.8 + 0.2 * MOR.easeOutCubic(k))) + 'px ' + MOR.FONT;
        ctx.fillStyle = t.color.hex;
        ctx.lineWidth = Math.max(2, F.s * 0.008);
        ctx.strokeStyle = t.color.light ? '#11141d' : 'rgba(255,255,255,0.6)';
        ctx.strokeText(t.color.name.toUpperCase(), cx, cy + F.s * 0.04);
        ctx.fillText(t.color.name.toUpperCase(), cx, cy + F.s * 0.04);
      }
      ctx.restore();
    }
  }

  MOR.Battle = Battle;
  MOR.Battle.N = N;
  MOR.BONUSES = BONUSES;
  MOR.BONUS_IDS = BONUS_IDS;
  MOR.WHEEL_SIZE = WHEEL_SIZE;
})();
