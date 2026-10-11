/* Battle scene: 4 colours fight for a square tile field.
   Each colour has a corner cannon and a side box. Three marbles fall through a sparse
   rising peg grid into the x2 / spinner / release slots at the bottom of the box. */
'use strict';
(function () {
  const MOR = window.MOR, P = MOR.Phys;

  // ---- Field
  const N = 32;                    // field is N x N tiles
  const BULLET_SPEED = 15;         // tiles per second
  const REL_RATE = 50;             // a release fires 50 balls per second, like the video...
  const REL_MAX_TIME = 40;         // ...but never lasts longer than 40 s (huge counts fire faster)
  const SPAWN_RATE = 60;           // max bullets per second per cannon (faster releases -> heavier bullets)
  const SWEEP = 0.78;              // cannon sweep, radians either side of the diagonal
  const CANNON_HP = 30;            // enemy captures of the tile under a cannon it can survive
  const COLLAPSE_TIME = 3.0;       // a wrecked colour's land flows to the wrecker over this time
  const OVERTIME_AT = 100, OVERTIME_STEP = 35; // after 1:40 every shot hits x2, x4, x8...
  const INTRO_TIME = 2.8;          // round card ("Раунд 1", today's drum) and the cube drop
  const INSET = 1.6;               // cannon pivot sits this far inside its corner
  const PIVOTS = [[INSET, INSET], [N - INSET, INSET], [INSET, N - INSET], [N - INSET, N - INSET]];
  const BASE_ANG = [Math.PI / 4, Math.PI * 3 / 4, -Math.PI / 4, -Math.PI * 3 / 4];
  // Neutral cube dropped in the middle of the field: balls bounce off it and push it around.
  const CUBE_R = 1.3, CUBE_PUSH = 0.07, CUBE_DRAG = 1.2, CUBE_MAX_V = 3;

  // ---- Side box (local units: 100 x 100)
  // The two dividers around the narrow spinner slot rise above the other slots as
  // posts, so a marble can only drop into the spinner from above, never roll in.
  const CEIL = 13, SLOT_TOP = 82, POST_TOP = 75, POST_R = 1.2, TRIGGER_Y = 91, X_A = 300 / 7, X_B = 400 / 7;
  const MARBLES = 3, MARBLE_R = 2.9, GRAV = 240, SPAWN_VY = 45;
  // Slot colours as in the video: coral x2 (pink while x4 is on), pale yellow spinner, green R.
  const SLOT_X2 = '#e5484d', SLOT_X4 = '#ff5fae', SLOT_SPIN = '#ecd36f', SLOT_REL = '#2eb84f';
  // Sparse peg grid rising from bottom to top. Every row has a peg above each slot
  // divider, so pegs grow straight out of the dividers and guard the narrow spinner slot.
  const PEG_SPEED = 7, PEG_TOP = CEIL + 8, PEG_BOT = POST_TOP, PEG_FADE = 6;
  // Each peg: [x, radius]. Every other row grows a pair of pegs out of the spinner posts;
  // the gap between them is narrower than a marble, so the pair works as a roof over
  // the spinner and that slot is only reachable between pairs.
  const DIV_R = 4.6, MID_R = 3.4;
  const PEG_ROW_A = [[X_A / 4, MID_R], [X_A, DIV_R], [X_B, DIV_R], [100 - X_A / 4, MID_R]];
  const PEG_ROW_C = [[X_A * 0.6, MID_R], [X_A, DIV_R], [X_B, DIV_R], [100 - X_A * 0.6, MID_R]];
  const PEG_ROW_E = [[X_A * 0.6, MID_R], [X_A, DIV_R], [100 - X_A * 0.6, MID_R]];
  const PEG_PATTERN = [PEG_ROW_A, PEG_ROW_C, PEG_ROW_A, PEG_ROW_E];
  const PEG_ROWS = PEG_PATTERN.length, PEG_SP = (PEG_BOT - PEG_TOP) / PEG_ROWS;

  // ---- Spinner bonuses. Each tournament puts 5 random ones on the drum.
  const PLUS_BALLS = 200, X4_TIME = 45, SHIELD_TIME = 30, SHIELD_R = 3.4, CLUSTER_SHELLS = 3, CLUSTER_N = 36;
  const HALF_LAND_TIME = 1.2, CANNONBALL_HP = 150, TWIN_TIME = 20, FAN_N = 40;
  const BOMB_R = 4.5, BOLTS = 6, BOLT_R = 1.6, FREEZE_TIME = 8, TURBO_TIME = 20, REPAIR_HP = 15, REPAIR_R = 4, GOLD_TIME = 30;
  // label: on the drum; name: in lists; desc: caption after the drum stops.
  const BONUSES = {
    plus: { label: '+200', name: '+200 выстрелов', desc: '200 дополнительных выстрелов', color: '#e8a400' },
    x4: { label: '×4', name: '×4 вместо ×2 на 45 сек', desc: 'Лунка ×4 вместо ×2 на 45 секунд', color: '#9b5de5' },
    shield: { label: 'ЩИТ', name: 'Щит пушки на 30 сек', desc: 'Пушка под щитом 30 секунд', color: '#2fb3c9' },
    cluster: { label: 'КЛАСТЕР', name: 'Кластер: 3 снаряда', desc: 'Залп из 3 кластерных снарядов', color: '#f06a1d' },
    half: { label: 'HALF LAND', name: 'Half Land: разрезать самую большую землю', desc: 'Самая большая земля разрезана пополам', color: '#e64980' },
    ball: { label: 'ЯДРО', name: 'Ядро на 150 клеток', desc: 'Огромное ядро на 150 клеток', color: '#5f6b7a' },
    twin: { label: 'ДВОЙНАЯ', name: 'Двойная пушка на 20 сек', desc: 'Двойная пушка на 20 секунд', color: '#c2255c' },
    fan: { label: 'ВЕЕР', name: 'Веер: 40 шариков разом', desc: '40 шариков веером разом', color: '#be4bdb' },
    bomb: { label: 'БОМБА', name: 'Бомба по самой большой земле', desc: 'Бомба по самой большой земле', color: '#2b2f36' },
    bolt: { label: 'МОЛНИЯ', name: 'Молния: 6 ударов по врагам', desc: '6 молний по чужой земле', color: '#4263eb' },
    freeze: { label: 'ЛЁД', name: 'Лёд: соперники замерли на 8 сек', desc: 'Соперники замерли на 8 секунд', color: '#1098ad' },
    turbo: { label: 'ТУРБО', name: 'Турбо: своё поле ×2 на 20 сек', desc: 'Своё поле вдвое быстрее 20 секунд', color: '#e03131' },
    div: { label: '÷2', name: 'Числа соперников ÷2', desc: 'Числа всех соперников ÷2', color: '#364fc7' },
    repair: { label: 'РЕМОНТ', name: 'Ремонт: +15 прочности и земля вокруг', desc: '+15 прочности пушке и земля вокруг', color: '#8d5a2b' },
    gold: { label: '+ШАРИК', name: '+1 золотой шарик на 30 сек', desc: 'Золотой шарик на 30 секунд', color: '#0ca678' }
  };
  const BONUS_IDS = Object.keys(BONUSES);
  const WHEEL_SIZE = 5;

  // Slot-machine drum over the top edge of the field, as in the video: the bonuses
  // sit on bands around a horizontal cylinder held by arms in the spinning colour.
  class Roulette {
    constructor(battle, items) {
      this.b = battle;
      this.items = items;          // bonus ids on this drum
      this.bands = items.length * Math.ceil(10 / items.length); // items repeat around the drum
      this.queue = [];
      this.cur = null;
      this.pos = 0;                // band index facing the viewer (float)
    }
    request(t) { this.queue.push(t); }
    cancel(t) {
      this.queue = this.queue.filter((x) => x !== t);
      if (this.cur && this.cur.team === t) this.cur = null;
    }
    busy() { return !!this.cur || this.queue.length > 0; }
    itemAt(band) {
      const n = this.items.length;
      return this.items[((band % n) + n) % n];
    }
    start(t) {
      const rng = this.b.rng, n = this.items.length;
      const result = rng.int(n);
      let k = Math.ceil(this.pos + this.bands * 3);
      while (((k % n) + n) % n !== result) k++;
      this.cur = { team: t, result, t: 0, dur: 2.8, p0: this.pos, p1: k, phase: 'spin', last: Math.round(this.pos) };
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
        this.pos = c.p0 + (c.p1 - c.p0) * MOR.easeOutQuart(k);
        const s = Math.round(this.pos);
        if (s !== c.last) { c.last = s; MOR.Sound.play('tick'); }
        if (k >= 1) { c.phase = 'show'; c.t = 0; this.pos = c.p1; MOR.Sound.play('prize'); }
      } else if (c.t >= 1.6) {
        this.cur = null;
        this.b.applyItem(c.team, this.items[c.result]);
      }
    }
    render(ctx, F) {
      const c = this.cur;
      if (!c) return;
      const team = this.b.teams[c.team];
      const W = F.s * 0.42, R = F.s * 0.075;           // drum width and radius
      const cx = F.x + F.s / 2, cy = F.y + R * 1.25;
      const capW = F.s * 0.035, x0 = cx - W / 2;
      const fade = Math.min(1, (c.phase === 'spin' ? c.t : 1) / 0.2);
      const da = Math.PI * 2 / this.bands;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Holder: two arms in the spinner's colour joined under the drum.
      ctx.strokeStyle = team.color.hex;
      ctx.lineWidth = capW * 0.9;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 - capW * 0.55, cy);
      ctx.lineTo(x0 - capW * 0.55, cy + R * 1.35);
      ctx.lineTo(x0 + W + capW * 0.55, cy + R * 1.35);
      ctx.lineTo(x0 + W + capW * 0.55, cy);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, capW * 0.2);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.stroke();

      // Bands on the cylinder: projected height shrinks towards the top and bottom.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, cy - R, W, R * 2);
      ctx.clip();
      ctx.fillStyle = '#11141d';
      ctx.fillRect(x0, cy - R, W, R * 2);
      const base = Math.floor(this.pos) - Math.ceil(this.bands / 4) - 1;
      for (let j = base; j <= base + Math.ceil(this.bands / 2) + 2; j++) {
        const a = (j - this.pos) * da;
        const a0 = Math.max(-Math.PI / 2, a - da / 2), a1 = Math.min(Math.PI / 2, a + da / 2);
        if (a1 <= a0) continue;
        const y0 = cy + R * Math.sin(a0), y1 = cy + R * Math.sin(a1);
        const it = BONUSES[this.itemAt(j)];
        ctx.fillStyle = it.color;
        ctx.fillRect(x0, y0, W, y1 - y0);
        const cosA = Math.cos(MOR.clamp(a, -Math.PI / 2, Math.PI / 2));
        const lit = c.phase === 'show' && j === c.p1;
        if (lit) {
          ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + 0.15 * Math.sin(c.t * 16)) + ')';
          ctx.fillRect(x0, y0, W, y1 - y0);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x0, y1 - Math.max(0.5, R * 0.025), W, Math.max(0.5, R * 0.025));
        if (cosA > 0.15) {
          ctx.save();
          ctx.translate(cx, (y0 + y1) / 2);
          ctx.scale(1, cosA);
          const fs = Math.min(R * 0.62, W * 0.95 / Math.max(2.2, it.label.length * 0.68));
          ctx.font = Math.round(fs) + 'px ' + MOR.FONT;
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = 3;
          ctx.fillText(it.label, 0, 1);
          ctx.restore();
        }
      }
      // Cylinder shading.
      const g = ctx.createLinearGradient(0, cy - R, 0, cy + R);
      g.addColorStop(0, 'rgba(0,0,0,0.7)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(0.8, 'rgba(0,0,0,0.15)');
      g.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, cy - R, W, R * 2);
      ctx.restore();

      // End caps and frame.
      ctx.fillStyle = team.color.hex;
      ctx.strokeStyle = '#0b0d14';
      ctx.lineWidth = Math.max(1, capW * 0.15);
      for (const x of [x0 - capW, x0 + W]) {
        MOR.roundRect(ctx, x, cy - R * 1.12, capW, R * 2.24, capW * 0.4);
        ctx.fill(); ctx.stroke();
      }
      // Yellow arrow pointing at the winning band.
      const ax = x0 - capW * 1.25;
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      ctx.moveTo(ax, cy);
      ctx.lineTo(ax - R * 0.7, cy - R * 0.42);
      ctx.lineTo(ax - R * 0.7, cy - R * 0.16);
      ctx.lineTo(ax - R * 1.35, cy - R * 0.16);
      ctx.lineTo(ax - R * 1.35, cy + R * 0.16);
      ctx.lineTo(ax - R * 0.7, cy + R * 0.16);
      ctx.lineTo(ax - R * 0.7, cy + R * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = Math.max(1, R * 0.06);
      ctx.stroke();

      // Caption: who spins, then what they won.
      const won = BONUSES[this.items[c.result]];
      const show = c.phase === 'show';
      const caption = show ? won.desc : team.color.name + ' крутит';
      const fs = Math.round(F.s * 0.036);
      ctx.font = fs + 'px ' + MOR.FONT;
      const tw = Math.min(F.s * 0.96, ctx.measureText(caption).width + fs * 1.4);
      const ty = cy + R * 1.35 + capW * 0.45 + fs * 1.05;
      ctx.fillStyle = show ? won.color : 'rgba(10,12,22,0.88)';
      MOR.roundRect(ctx, cx - tw / 2, ty - fs * 0.85, tw, fs * 1.7, fs * 0.5);
      ctx.fill();
      ctx.lineWidth = Math.max(1, fs * 0.12);
      ctx.strokeStyle = team.color.hex;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(caption, cx, ty + 1, F.s * 0.92);
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

      this.teams = colors.map((color, i) => ({
        i, color, alive: true, count: 1, pale: MOR.mix(color.rgb, [255, 255, 255], 0.42),
        x4Until: -1, shieldUntil: -1, twinUntil: -1, frozenUntil: -1, turboUntil: -1,
        captured: 0, peak: 0, elimTime: null, lostAt: 0, spinBlocked: false,
        rel: { active: false, total: 0, rate: 0, acc: 0, spawn: 0 },
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
      this.lasers = [];    // Half Land cuts being drawn
      this.cube = { x: N / 2, y: N / 2, vx: 0, vy: 0, ang: Math.PI / 4, drop: 0, hit: 0, paint: -1 };
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

    shielded(t) { return this.teams[t].shieldUntil > this.time && !this.teams[t].cannon.dead; }
    // The shield guards only the cannon: tiles of its owner inside a small bubble around it.
    guarded(i) {
      const o = this.owner[i];
      if (!this.shielded(o)) return false;
      const c = this.teams[o].cannon;
      const dx = (i % N) + 0.5 - c.x, dy = ((i / N) | 0) + 0.5 - c.y;
      return dx * dx + dy * dy < SHIELD_R * SHIELD_R;
    }
    frozen(t) { return this.teams[t].frozenUntil > this.time; }
    working(t) { return t.alive && !t.cannon.dead; }
    enemiesOf(team) { return this.teams.filter((x) => x.alive && x !== team); }
    // Text anchor in front of a team's cannon, in field units.
    nearCannon(team) {
      return { x: team.cannon.x + (team.cannon.x < N / 2 ? 5 : -5), y: team.cannon.y + (team.cannon.y < N / 2 ? 4 : -4) };
    }

    setCell(i, t) {
      const prev = this.owner[i];
      if (prev === t || this.guarded(i)) return false;
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
      tm.count = Math.max(1, Math.round(tm.count + tm.rel.acc));
      tm.rel.acc = 0;
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
        this.waves.push({ team: by, target: t, cells, i: 0,
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
      tm.lostAt = this.clock;
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
      // While the cannon releases, all three slots are closed (as in the video).
      if (team.rel.active) return;
      if (slot === 0) {
        const mult = team.x4Until > this.time ? 4 : 2;
        team.count *= mult;
        box.pop = 1;
        box.flash[0] = 1;
        this.float('box' + team.i, X_A / 2, SLOT_TOP - 4, '×' + mult, mult === 4 ? '#ffb3dc' : '#ffd0d2', 1, 0.8);
        MOR.Sound.play(mult === 4 ? 'x4' : 'x2');
      } else if (slot === 1) {
        if (team.spinBlocked) return;
        team.spinBlocked = true;
        box.flash[1] = 1;
        this.roulette.request(team.i);
      } else {
        box.flash[2] = 1;
        this.startRelease(team);
      }
    }

    // Release: the cannon fires the whole count at a steady 50 balls per second while
    // the counter runs down to 1. Huge counts fire faster so a release never tops 40 s.
    startRelease(team) {
      const r = team.rel;
      r.active = true;
      r.total = team.count;
      r.rate = Math.max(REL_RATE, team.count / REL_MAX_TIME);
      r.acc = 0;
      r.spawn = 1;
      MOR.Sound.play('release');
    }

    stepRelease(team, dt) {
      const r = team.rel;
      if (!r.active) return;
      const v = Math.min(team.count, r.rate * dt);
      team.count -= v;
      r.acc += v;
      r.spawn = Math.min(r.spawn + dt * SPAWN_RATE, 3);
      while (r.spawn >= 1 && r.acc >= 1) {
        const hp = Math.floor(r.acc);
        r.acc -= hp;
        r.spawn -= 1;
        this.fire(team, hp, 0);
      }
      if (team.count <= 1e-9) {
        const rest = Math.round(r.acc);
        if (rest >= 1) this.fire(team, rest, 0);
        team.count = 1;
        r.acc = 0;
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
          this.float(box, X_A / 2, 60, '×4!', '#ffb3dc', 1.4, 1.2);
          break;
        case 'shield':
          team.shieldUntil = Math.max(team.shieldUntil, this.time) + SHIELD_TIME;
          this.float('field', at.x, at.y, 'ЩИТ ПУШКИ', '#9fe2ff', 1.1, 1.2);
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
          for (const e of this.enemiesOf(team).filter((x) => this.working(x))) {
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
          for (const e of this.enemiesOf(team).filter((x) => this.working(x))) {
            e.count = Math.max(1, Math.round(e.count / 2));
            e.rel.acc = Math.floor(e.rel.acc / 2);
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

    // Strongest enemy by territory.
    leader(team) {
      const cand = this.enemiesOf(team);
      cand.sort((a, b) => this.counts[b.i] - this.counts[a.i]);
      return cand[0] || null;
    }

    // Half Land: a straight cut through the middle of the largest enemy land; the half
    // away from its cannon goes to the spinner. A laser sweeps along the cut.
    startHalfLand(team) {
      const target = this.leader(team);
      if (!target) return;
      const pts = [];
      let mx = 0, my = 0;
      for (let i = 0; i < N * N; i++) {
        if (this.owner[i] !== target.i) continue;
        const x = (i % N) + 0.5, y = ((i / N) | 0) + 0.5;
        pts.push([i, x, y]);
        mx += x; my += y;
      }
      if (pts.length < 2) return;
      mx /= pts.length; my /= pts.length;
      const tc = target.cannon;
      let best = null;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 8 + (this.rng() - 0.5) * 0.12;
        const nx = -Math.sin(a), ny = Math.cos(a);
        let side = (tc.x - mx) * nx + (tc.y - my) * ny;
        if (Math.abs(side) < 1e-6) side = 1;
        let take = 0;
        for (const p of pts) if (((p[1] - mx) * nx + (p[2] - my) * ny) * side < 0) take++;
        // About half the land, with the cannon well clear of the cut.
        const score = Math.abs(take - pts.length / 2) / pts.length + (Math.abs(side) < 2.5 ? 1 : 0);
        if (!best || score < best.score) best = { score, a, nx, ny, side };
      }
      const ux = Math.cos(best.a), uy = Math.sin(best.a);
      const cut = [];
      let lo = Infinity, hi = -Infinity;
      for (const p of pts) {
        if (((p[1] - mx) * best.nx + (p[2] - my) * best.ny) * best.side >= 0) continue;
        const along = (p[1] - mx) * ux + (p[2] - my) * uy;
        cut.push([p[0], along]);
        if (along < lo) lo = along;
        if (along > hi) hi = along;
      }
      if (!cut.length) return;
      cut.sort((p, q) => p[1] - q[1]);
      this.waves.push({ team: team.i, target: target.i, cells: cut.map((p) => p[0]), i: 0,
        per: Math.max(1, Math.ceil(cut.length / (HALF_LAND_TIME / MOR.DT))) });
      this.lasers.push({ x: mx, y: my, ux, uy, lo: lo - 1, hi: hi + 1, t: 0, dur: HALF_LAND_TIME, color: team.color.hex });
      this.float('field', N / 2, N / 2, 'HALF LAND: ' + target.color.name + ' −' + cut.length, '#ffd0e4', 1.0, 1.6);
      this.shake = Math.max(this.shake, 0.5);
      MOR.Sound.play('zap');
    }

    startBomb(team) {
      const target = this.leader(team);
      if (!target) return;
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
        if (o !== team.i && this.teams[o].alive && !this.guarded(i)) pool.push(i);
      }
      if (!pool.length) return;
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
        this.stepCubeDrop();
        if (this.phaseT > INTRO_TIME) { this.phase = 'play'; this.phaseT = 0; this.cube.drop = 1; }
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
        // Frozen: box, cannon sweep, release and cluster shells all wait.
        if (this.frozen(t.i)) continue;
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
      this.stepCube(dt);
      this.stepBullets(dt);
      this.stepStrikes(dt);
      this.stepWaves();
      for (const t of this.teams) if (this.counts[t.i] > t.peak) t.peak = this.counts[t.i];
      this.checkStalemate();
    }

    // The cube falls onto the middle of the field during the round intro.
    stepCubeDrop() {
      const c = this.cube, was = c.drop;
      c.drop = MOR.clamp((this.phaseT - 0.4) / 0.6, 0, 1);
      if (was < 1 && c.drop >= 1) {
        this.shake = Math.max(this.shake, 0.5);
        this.burst(c.x, c.y, '#c9ced9', 14, 9);
        MOR.Sound.play('land');
      }
    }

    stepCube(dt) {
      const c = this.cube;
      c.hit = Math.max(0, c.hit - dt * 4);
      const v = Math.hypot(c.vx, c.vy);
      if (v > CUBE_MAX_V) { c.vx *= CUBE_MAX_V / v; c.vy *= CUBE_MAX_V / v; }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.ang += (c.vx + c.vy) * dt * 0.35;
      const f = Math.exp(-CUBE_DRAG * dt);
      c.vx *= f; c.vy *= f;
      const lo = CUBE_R, hi = N - CUBE_R;
      if (c.x < lo) { c.x = lo; c.vx = Math.abs(c.vx) * 0.5; } else if (c.x > hi) { c.x = hi; c.vx = -Math.abs(c.vx) * 0.5; }
      if (c.y < lo) { c.y = lo; c.vy = Math.abs(c.vy) * 0.5; } else if (c.y > hi) { c.y = hi; c.vy = -Math.abs(c.vy) * 0.5; }
      // Keep it off the cannons.
      for (const p of PIVOTS) {
        const dx = c.x - p[0], dy = c.y - p[1], d = Math.hypot(dx, dy), min = CUBE_R + 2.6;
        if (d < min && d > 1e-6) {
          c.x = p[0] + dx / d * min; c.y = p[1] + dy / d * min;
          const vn = c.vx * dx / d + c.vy * dy / d;
          if (vn < 0) { c.vx -= 1.5 * vn * dx / d; c.vy -= 1.5 * vn * dy / d; }
        }
      }
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
      for (let i = this.lasers.length - 1; i >= 0; i--) {
        this.lasers[i].t += dt;
        if (this.lasers[i].t > this.lasers[i].dur + 0.5) this.lasers.splice(i, 1);
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

    // Blocked slots become solid blocks: [x0, x1, top]. The spinner closes while its
    // drum spins; all three close while the cannon releases.
    blocks(team) {
      const out = [];
      if (team.rel.active) out.push([0, X_A, SLOT_TOP], [X_B, 100, SLOT_TOP]);
      if (team.spinBlocked || team.rel.active) out.push([X_A, X_B, POST_TOP]);
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
          m.air = 0;
          continue;
        }
        // A marble wedged between two pegs climbs out over one of them; one riding up
        // on a single peg rolls off it. The divider pair thus acts as a roof over the spinner.
        m.popT = Math.max(0, (m.popT || 0) - dt);
        const riding = m.touch && m.vy < 0 && m.vy > -PEG_SPEED - 6;
        m.ride = riding ? (m.ride || 0) + dt : 0;
        if (m.popT === 0 && (m.cradle || m.ride > 0.12)) {
          if (m.cradle) {
            // Wedged in the pair over the spinner, a marble hops clear over one of the
            // pegs; a weaker hop would land it in the same pair again and again.
            const mid = Math.abs(m.x - (X_A + X_B) / 2) < 3;
            m.vx = (this.rng() < 0.5 ? -1 : 1) * (mid ? this.rng.range(50, 60) : this.rng.range(40, 50));
            m.vy = mid ? -72 : -45;
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
        // Safety net: a marble that has not reached a slot for 10 s gets shoved sideways.
        m.air = team.rel.active ? 0 : (m.air || 0) + dt;
        if (m.air > 10) { m.vx = (m.x < 50 ? -1 : 1) * 70; m.vy = 10; m.air = 6; }
        const sp = Math.abs(m.vx) + Math.abs(m.vy);
        // Resting on the closed slots during a release is fine; elsewhere a still marble gets a kick.
        m.still = sp < 3 && !team.rel.active ? m.still + dt : 0;
        if (m.still > 1.0) { m.vx = this.rng.range(-40, 40); m.vy = -30; m.still = 0; }
      }
    }

    stepBullets(dt) {
      const owner = this.owner, teams = this.teams, cube = this.cube;
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
            // Bounce off the neutral cube and shove it.
            const qx = nx - cube.x, qy = ny - cube.y, q2 = qx * qx + qy * qy;
            if (q2 < CUBE_R * CUBE_R) {
              const q = Math.sqrt(q2) || 1e-6, ux = qx / q, uy = qy / q;
              const vn = b.vx * ux + b.vy * uy;
              if (vn < 0) {
                b.vx -= 2 * vn * ux; b.vy -= 2 * vn * uy;
                const push = CUBE_PUSH * Math.min(8, Math.sqrt(b.hp));
                cube.vx -= ux * push; cube.vy -= uy * push;
                cube.hit = 1;
                cube.paint = b.t;
              }
              b.x = cube.x + ux * CUBE_R; b.y = cube.y + uy * CUBE_R;
              continue;
            }
            const cx = Math.min(N - 1, nx | 0), cy = Math.min(N - 1, ny | 0);
            const ci = cy * N + cx;
            const o = owner[ci];
            if (o === b.t) { b.x = nx; b.y = ny; continue; }
            if (this.guarded(ci)) {
              // The shield bubble around a cannon swallows enemy balls.
              this.burst(nx, ny, '#bfefff', 3, 6);
              dead = true;
              break;
            }
            this.setCell(ci, b.t);
            if (b.kind === 1) {
              // Cluster shell bursts into many small balls. They start from just before
              // the tile it hit, so a burst on a cannon's tile does not hit it 36 times at once.
              const pw = this.power();
              for (let s = 0; s < CLUSTER_N; s++) {
                const a = (s / CLUSTER_N) * Math.PI * 2 + this.rng() * 0.15;
                const sp = BULLET_SPEED * (0.75 + this.rng() * 0.4);
                this.newBullets.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: b.t, hp: pw, kind: 0, life: 0 });
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
          if (o === t) continue;
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
          if (this.owner[ci] !== w.target) continue;
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
      if (this.phase === 'play') this.roulette.render(ctx, F);
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

      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x, F.y, F.s, F.s);
      ctx.clip();
      this.renderCube(ctx, F, cs);
      // Balls look like pale comets (head forward, tail back), batched per colour.
      for (const t of this.teams) {
        ctx.fillStyle = t.pale;
        ctx.beginPath();
        let any = false;
        for (const b of this.bullets) {
          if (b.t !== t.i || b.kind !== 0) continue;
          const r = Math.min(1.1, 0.3 + 0.08 * Math.log2(Math.max(1, b.hp))) * cs;
          const x = F.x + b.x * cs, y = F.y + b.y * cs;
          const a = Math.atan2(b.vy, b.vx), ux = Math.cos(a), uy = Math.sin(a);
          ctx.moveTo(x - ux * r * 3.2, y - uy * r * 3.2);
          ctx.arc(x, y, r, a + Math.PI / 2 + 0.25, a - Math.PI / 2 - 0.25, true);
          ctx.closePath();
          any = true;
        }
        if (any) ctx.fill();
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
      this.renderLasers(ctx, F, cs);
      ctx.restore();

      // Shield bubbles stay inside the field.
      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x, F.y, F.s, F.s);
      ctx.clip();
      for (const t of this.teams) this.drawShield(ctx, t, F, cs);
      ctx.restore();
      for (const t of this.teams) this.drawCannon(ctx, t, F, cs);

      // Frame.
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(F.x - 1, F.y - 1, F.s + 2, F.s + 2);
    }

    renderCube(ctx, F, cs) {
      const c = this.cube;
      if (c.drop <= 0) return;
      const k = MOR.easeInOut(c.drop);
      const x = F.x + c.x * cs, y = F.y + (c.y - (1 - k) * 12) * cs;
      const s = CUBE_R * 1.05 * cs * (1 + (1 - k) * 0.8);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + (0.15 + 0.25 * k) + ')';
      ctx.beginPath();
      ctx.ellipse(F.x + c.x * cs + cs * 0.25, F.y + c.y * cs + cs * 0.35, s * (0.6 + 0.4 * k), s * (0.6 + 0.4 * k), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(x, y);
      ctx.rotate(c.ang);
      // A grey cube seen from above: lighter top face, darker bevel, a stripe of
      // the last colour that hit it.
      ctx.fillStyle = '#4b505e';
      MOR.roundRect(ctx, -s, -s, s * 2, s * 2, s * 0.25);
      ctx.fill();
      if (c.paint >= 0) {
        ctx.strokeStyle = this.teams[c.paint].color.hex;
        ctx.lineWidth = s * 0.22;
        MOR.roundRect(ctx, -s * 0.88, -s * 0.88, s * 1.76, s * 1.76, s * 0.2);
        ctx.stroke();
      }
      ctx.fillStyle = c.hit > 0 ? MOR.mix('#8a90a0', '#ffffff', c.hit * 0.5) : '#8a90a0';
      MOR.roundRect(ctx, -s * 0.68, -s * 0.68, s * 1.36, s * 1.36, s * 0.16);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(-s * 0.6, -s * 0.6, s * 1.2, s * 0.3);
      ctx.restore();
    }

    renderLasers(ctx, F, cs) {
      for (const l of this.lasers) {
        const k = Math.min(1, l.t / l.dur);
        const fade = l.t > l.dur ? 1 - (l.t - l.dur) / 0.5 : 1;
        const sx = F.x + (l.x + l.ux * l.lo) * cs, sy = F.y + (l.y + l.uy * l.lo) * cs;
        const head = l.lo + (l.hi - l.lo) * k;
        const hx = F.x + (l.x + l.ux * head) * cs, hy = F.y + (l.y + l.uy * head) * cs;
        const ex = F.x + (l.x + l.ux * l.hi) * cs, ey = F.y + (l.y + l.uy * l.hi) * cs;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.lineCap = 'round';
        // Guide line where the cut will go.
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(1, cs * 0.12);
        ctx.setLineDash([cs * 0.6, cs * 0.4]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        // The beam itself.
        ctx.shadowColor = l.color;
        ctx.shadowBlur = cs * 1.2;
        ctx.strokeStyle = l.color;
        ctx.lineWidth = Math.max(2, cs * 0.6);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, cs * 0.2);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
        if (k < 1) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(hx, hy, cs * 0.55, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
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

    // Shield bubble around the cannon (only the cannon is protected), with time left.
    drawShield(ctx, t, F, cs) {
      if (!t.alive || !this.shielded(t.i)) return;
      const x = F.x + t.cannon.x * cs, y = F.y + t.cannon.y * cs;
      const k = (t.shieldUntil - this.time) / SHIELD_TIME;
      const SR = SHIELD_R * cs, pulse = 0.5 + 0.5 * Math.sin(this.clock * 5);
      const g = ctx.createRadialGradient(x, y, SR * 0.3, x, y, SR);
      g.addColorStop(0, 'rgba(160,235,255,0.05)');
      g.addColorStop(0.8, 'rgba(160,235,255,' + (0.18 + 0.08 * pulse) + ')');
      g.addColorStop(1, 'rgba(210,248,255,0.55)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, SR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(225,250,255,0.9)';
      ctx.lineWidth = Math.max(1.5, cs * 0.18);
      ctx.beginPath(); ctx.arc(x, y, SR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k)); ctx.stroke();
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
      if (this.shielded(t.i)) return ['ЩИТ', t.shieldUntil, '#9fe2ff'];
      if (t.turboUntil > this.time) return ['ТУРБО', t.turboUntil, '#ff8f8f'];
      if (t.twinUntil > this.time) return ['ДВОЙНАЯ', t.twinUntil, '#ff9fbf'];
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

      // Slots: coral x2 (pink x4 with seconds left), pale yellow spinner, green R.
      const x4 = t.x4Until > this.time;
      const slotCol = [x4 ? SLOT_X4 : SLOT_X2, SLOT_SPIN, SLOT_REL];
      const xs = [0, X_A, X_B, 100];
      const rel = t.rel.active;
      const blocked = [rel, rel || t.spinBlocked, rel];
      const tops = [SLOT_TOP, POST_TOP, SLOT_TOP];
      for (let k = 0; k < 3; k++) {
        const x0 = xs[k], w = xs[k + 1] - xs[k], top = tops[k], bh = 100 - top;
        if (!blocked[k]) {
          ctx.fillStyle = slotCol[k];
          ctx.fillRect(x0, top, w, bh);
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(x0, top, w, 1.2);
        } else {
          // A closed slot is a solid dark block.
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, top, w, bh);
          ctx.clip();
          ctx.fillStyle = '#1b1e27';
          ctx.fillRect(x0, top, w, bh);
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let d = -bh; d < w; d += 4) { ctx.moveTo(x0 + d, 100); ctx.lineTo(x0 + d + bh, top); }
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          ctx.fillRect(x0, top, w, 0.9);
        }
        if (box.flash[k] > 0) {
          ctx.fillStyle = 'rgba(255,255,255,' + box.flash[k] * 0.6 + ')';
          ctx.fillRect(x0, top, w, bh);
        }
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rel ? 'rgba(255,255,255,0.75)' : '#ffffff';
      ctx.font = '9px ' + MOR.FONT;
      if (x4) {
        ctx.fillStyle = rel ? '#ff8fc8' : '#fff36b';
        ctx.fillText('×4', X_A / 2 - 5, 91.5);
        ctx.font = '5.5px ' + MOR.FONT;
        ctx.fillStyle = rel ? 'rgba(255,255,255,0.75)' : '#ffffff';
        ctx.fillText(String(Math.ceil(t.x4Until - this.time)), X_A / 2 + 8, 92);
      } else {
        ctx.fillText('×2', X_A / 2, 91.5);
      }
      ctx.font = '9px ' + MOR.FONT;
      ctx.fillStyle = rel ? 'rgba(255,255,255,0.75)' : '#ffffff';
      ctx.fillText('R', (X_B + 100) / 2, 91.5);
      if (rel) {
        // Release progress under the R: the bar empties as the cannon fires.
        const left = MOR.clamp(t.count / Math.max(1, t.rel.total), 0, 1);
        ctx.fillStyle = SLOT_REL;
        ctx.fillRect(X_B + 3, 96.5, (100 - X_B - 6) * left, 1.6);
      }
      this.drawMiniDrum(ctx, (X_A + X_B) / 2, 91, t.spinBlocked ? this.clock * 9 : 0, blocked[1] ? 0.45 : 1);

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
        if (m.gold) {
          // White ring so the golden marble stands out even in a yellow box.
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 0.9, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // Header with the ball count.
      ctx.fillStyle = 'rgba(5,7,13,0.55)';
      ctx.fillRect(0, 0, 100, CEIL);
      const shown = t.rel.active ? Math.max(1, Math.ceil(t.count)) : t.count;
      const sc = 1 + box.pop * 0.25;
      ctx.save();
      ctx.translate(50, CEIL / 2 + 0.6);
      ctx.scale(sc, sc);
      ctx.font = '9.5px ' + MOR.FONT;
      ctx.fillStyle = t.rel.active ? '#ffcf3a' : '#ffffff';
      ctx.fillText(MOR.fmt(shown), 0, 0, 56);
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

      if (!t.alive) {
        // Eliminated: a big diagonal stamp over the box, as in the video.
        MOR.roundRect(ctx, 0, 0, 100, 100, 5);
        ctx.fillStyle = 'rgba(5,7,13,0.45)';
        ctx.fill();
        const k = MOR.clamp((this.clock - t.lostAt) / 0.3, 0, 1);
        ctx.save();
        ctx.translate(50, 54);
        ctx.rotate(-0.5);
        ctx.scale(2.2 - 1.2 * MOR.easeOutCubic(k), 2.2 - 1.2 * MOR.easeOutCubic(k));
        ctx.globalAlpha = k;
        ctx.font = '21px ' + MOR.FONT;
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeText('ВЫБЫЛ', 0, 0, 96);
        ctx.fillStyle = '#0b0d14';
        ctx.fillText('ВЫБЫЛ', 0, 0, 96);
        ctx.restore();
      } else if (!this.working(t)) {
        MOR.roundRect(ctx, 0, 0, 100, 100, 5);
        ctx.fillStyle = 'rgba(5,7,13,0.72)';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '7.5px ' + MOR.FONT;
        ctx.fillText('ПУШКА РАЗРУШЕНА', 50, 46);
        ctx.font = '6px ' + MOR.FONT;
        ctx.fillStyle = t.color.hex;
        ctx.fillText(t.color.name, 50, 58);
      }
      ctx.restore();
    }

    // Small drum icon in the spinner slot; it rolls while the big drum spins.
    drawMiniDrum(ctx, x, y, roll, alpha) {
      const items = this.roulette.items, n = items.length;
      const w = 9, h = 8, bh = h / 3;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.rect(x - w / 2, y - h / 2, w, h);
      ctx.clip();
      const off = (roll % 1) * bh;
      const first = Math.floor(roll);
      for (let k = -1; k < 4; k++) {
        ctx.fillStyle = BONUSES[items[(((first + k) % n) + n) % n]].color;
        ctx.fillRect(x - w / 2, y - h / 2 + k * bh - off, w, bh + 0.2);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x - w / 2, y - h / 2, w, 1.4);
      ctx.fillRect(x - w / 2, y + h / 2 - 1.4, w, 1.4);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
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
        // Round card: title, the four colours and today's drum (as "Today's Roulette").
        const k = Math.min(1, this.phaseT / 0.3);
        const out = INTRO_TIME - 0.35;
        ctx.globalAlpha = k * (this.phaseT > out ? Math.max(0, (INTRO_TIME - this.phaseT) / 0.35) : 1);
        const hh = F.s * 0.42;
        ctx.fillStyle = 'rgba(5,7,13,0.8)';
        ctx.fillRect(F.x, cy - hh / 2, F.s, hh);
        ctx.fillStyle = '#ffcf3a';
        ctx.font = Math.round(F.s * 0.085) + 'px ' + MOR.FONT;
        ctx.fillText(this.title, cx, cy - hh * 0.32);
        ctx.font = Math.round(F.s * 0.036) + 'px ' + MOR.FONT;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(this.teams.map((t) => t.color.name).join(' · '), cx, cy - hh * 0.12, F.s * 0.94);
        ctx.font = Math.round(F.s * 0.034) + 'px ' + MOR.FONT;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('Рулетка турнира', cx, cy + hh * 0.06);
        // Bonus chips in two rows (3 + 2).
        const items = this.roulette.items;
        const fs = Math.round(F.s * 0.034);
        ctx.font = fs + 'px ' + MOR.FONT;
        const rows = [items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))];
        rows.forEach((row, r) => {
          const ws = row.map((id) => ctx.measureText(BONUSES[id].label).width + fs * 1.2);
          const gap = fs * 0.5;
          let x = cx - (ws.reduce((a, b) => a + b, 0) + gap * (row.length - 1)) / 2;
          const y = cy + hh * 0.2 + r * fs * 2.0;
          row.forEach((id, j) => {
            ctx.fillStyle = BONUSES[id].color;
            MOR.roundRect(ctx, x, y - fs * 0.8, ws[j], fs * 1.6, fs * 0.45);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(BONUSES[id].label, x + ws[j] / 2, y + 1);
            x += ws[j] + gap;
          });
        });
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
