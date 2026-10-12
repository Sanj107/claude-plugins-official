'use strict';
// Naval battle simulation shared by story fights, raids, the duel bot and LAN duels.
// Pure logic: no DOM, no three.js. The renderer reads `fx` events and side state.
(function (VC) {
  const AMMO = {
    ball: { name: 'Ядра', icon: '⚫', hull: 1.0, sails: 0.15, crew: 0.1, desc: 'Бьют по корпусу' },
    chain: { name: 'Книппели', icon: '⛓️', hull: 0.3, sails: 1.25, crew: 0.1, desc: 'Рвут паруса: враг легче попадает под залп и не сбежит' },
    grape: { name: 'Картечь', icon: '🔸', hull: 0.25, sails: 0.1, crew: 1.25, desc: 'Косит команду: враг медленнее заряжает, проще абордаж' },
    fire: { name: 'Брандскугели', icon: '🔥', hull: 0.6, sails: 0.4, crew: 0.2, burn: 0.8, desc: 'Поджигают корабль: урон со временем' },
  };
  // Creatures have no sails or crew: every ammo hits the body.
  const CREATURE_HULL = { ball: 1.0, chain: 0.6, grape: 0.7, fire: 0.6 };

  const ABIL = {
    distract: { cd: 25, name: 'Отвлечь', icon: '🦜' },
    repair: { cd: 30, name: 'Ремонт', icon: '🔨' },
    evade: { cd: 28, name: 'Манёвр', icon: '💨' },
    raid: { cd: 40, name: 'Абордажная команда', icon: '⚔️' },
    firevolley: { cd: 35, name: 'Огненный залп', icon: '🔥' },
    song: { cd: 45, name: 'Песнь сирены', icon: '🎵' },
    legend: { cd: 60, name: 'Легендарный залп', icon: '⭐' },
    // enemy-only
    heal: { cd: 20, name: 'Починка', icon: '🔧' },
    rally: { cd: 18, name: 'Боевой клич', icon: '📯' },
    grab: { cd: 24, name: 'Хватка', icon: '🐙' },
    ink: { cd: 22, name: 'Чернила', icon: '🖤' },
    charm: { cd: 25, name: 'Чары', icon: '💫' },
    phase: { cd: 16, name: 'Бесплотность', icon: '👻' },
    freeze: { cd: 24, name: 'Ледяное дыхание', icon: '❄️' },
    shield: { cd: 22, name: 'Щит', icon: '🛡️' },
    lightning: { cd: 20, name: 'Молния', icon: '⚡' },
    board: { cd: 25, name: 'Налёт абордажников', icon: '🗡️' },
  };

  const FLIGHT = 0.55; // seconds between a volley and its impact
  const TAP_CAP = 8; // taps per second that still count

  function makeSide(st, ctrl) {
    return Object.assign({}, st, {
      ctrl, // 'human' | 'ai' | 'remote'
      reloadT: 0,
      ammo: 'ball',
      cds: {},
      fx: {}, // effect name -> seconds left
      tapBucket: TAP_CAP,
      boardCd: 0,
      burn: 0, burnDps: 0,
      heal: 0, healRate: 0,
      dmgMult: 1,
      nextDmgMult: 1,
      grab: null, // {need, t} while a creature holds this ship
      volleys: 0, dealt: 0,
      aiT: 0,
    });
  }

  class Battle {
    /**
     * sides: [playerStats, enemyStats]; ctrl: ['human','ai'] etc.
     * opts: { seed, pvp, timeLimit, start: hazard effect, tutorial }
     */
    constructor(a, b, ctrl, opts) {
      opts = opts || {};
      this.rand = VC.util.rng(opts.seed || ((Math.random() * 1e9) | 0));
      this.s = [makeSide(a, ctrl[0]), makeSide(b, ctrl[1])];
      for (const side of this.s) for (const ab of (side.abilities || side.abil || [])) side.cds[ab] = ABIL[ab] ? ABIL[ab].cd * 0.35 : 0;
      this.t = 0;
      this.pvp = !!opts.pvp;
      this.timeLimit = opts.timeLimit || (this.pvp ? 150 : 180);
      this.pending = [];
      this.fx = [];
      this.over = false;
      this.winner = -1;
      this.reason = '';
      this.tutorial = !!opts.tutorial;
      // Hazard outcomes decide who fires first.
      this.s[0].reloadT = 0.35;
      this.s[1].reloadT = 0.25;
      const st = opts.start;
      if (st === 'slow') { this.s[0].reloadT = 0; this.s[1].reloadT = 0.6; }
      if (st === 'enemyFirst') this.s[1].reloadT = 0.95;
      if (st === 'first') { this.s[0].reloadT = 0.97; this.s[0].nextDmgMult = 1.5; }
      if (st === 'gambleWin') { this.s[0].reloadT = 0.97; this.s[0].dmgMult = 1.2; }
    }

    other(i) { return this.s[1 - i]; }

    emit(e) { this.fx.push(e); }

    /** Player / remote / AI commands. */
    input(i, cmd, arg) {
      if (this.over) return false;
      const me = this.s[i];
      const foe = this.other(i);
      switch (cmd) {
        case 'tap': {
          if (me.grab) {
            me.grab.need--;
            if (me.grab.need <= 0) {
              me.grab = null;
              this.applyHull(1 - i, foe.maxHp * 0.05, false, 'cut');
              this.emit({ t: 'grabFree', side: i });
            }
            return true;
          }
          if (me.tapBucket < 1) return false;
          me.tapBucket -= 1;
          if (me.fx.song > 0 || me.fx.freeze > 0) return true;
          me.reloadT = Math.min(1, me.reloadT + me.tapBoost);
          return true;
        }
        case 'ammo':
          if (!AMMO[arg]) return false;
          if (arg === 'fire' && !me.fireAmmo) return false;
          me.ammo = arg;
          return true;
        case 'abil':
          return this.useAbility(i, arg);
        case 'board':
          return this.tryBoard(i);
        case 'flee':
          this.finish(1 - i, 'flee');
          return true;
      }
      return false;
    }

    canBoard(i) {
      const me = this.s[i], foe = this.other(i);
      if (foe.creature || me.creature || me.boardCd > 0 || foe.maxCrew <= 0) return false;
      const thr = me.fx.raid > 0 ? 0.6 : 0.35;
      return foe.crew / foe.maxCrew < thr || foe.hp / foe.maxHp < 0.3;
    }

    tryBoard(i) {
      if (!this.canBoard(i)) return false;
      const me = this.s[i], foe = this.other(i);
      const mine = me.crew * me.board * (0.8 + this.rand() * 0.4);
      const theirs = foe.crew * foe.board * (0.8 + this.rand() * 0.4) * (foe.hp / foe.maxHp < 0.3 ? 0.7 : 1);
      if (mine > theirs) {
        this.emit({ t: 'board', side: i, ok: true });
        this.finish(i, 'board');
      } else {
        me.crew *= 0.7;
        this.applyHull(i, me.maxHp * 0.1, false, 'board');
        me.boardCd = 10;
        this.emit({ t: 'board', side: i, ok: false });
      }
      return true;
    }

    useAbility(i, id) {
      const me = this.s[i], foe = this.other(i);
      const list = me.abilities || me.abil || [];
      if (list.indexOf(id) < 0 || (me.cds[id] || 0) > 0 || this.over) return false;
      const a = ABIL[id];
      me.cds[id] = a.cd;
      this.emit({ t: 'abil', side: i, id });
      switch (id) {
        case 'distract': foe.fx.distract = 6; break;
        case 'ink': foe.fx.distract = 6; break;
        case 'repair': me.heal = 5; me.healRate = me.maxHp * 0.3 / 5; break;
        case 'heal': me.heal = 4; me.healRate = me.maxHp * 0.2 / 4; break;
        case 'evade': me.fx.evade = 5; break;
        case 'raid':
          if (foe.maxCrew > 0) foe.crew *= 0.75;
          else this.applyHull(1 - i, me.volley * 0.6, false, 'raid');
          me.fx.raid = 8;
          break;
        case 'firevolley': this.fire(i, { mult: 1.5, ammo: 'fire', free: true }); break;
        case 'song': foe.fx.song = 5; break;
        case 'charm': foe.fx.song = 3; break;
        case 'freeze': foe.fx.freeze = 3; break;
        case 'legend':
          this.fire(i, { free: true });
          me.legendQueue = 2; me.legendT = 0.45;
          break;
        case 'rally': me.fx.rally = 5; break;
        case 'phase': me.fx.phase = 4; break;
        case 'shield': me.fx.shield = 5; break;
        case 'lightning':
          me.lightning = 1.3; // telegraph, then strike
          break;
        case 'grab':
          if (foe.ctrl === 'human' || foe.ctrl === 'remote') {
            foe.grab = { need: 14, t: 4.5 };
          } else {
            this.applyHull(1 - i, foe.maxHp * 0.12, false, 'grab');
          }
          break;
        case 'board':
          if (foe.maxCrew > 0) foe.crew *= 0.8;
          this.applyHull(1 - i, me.volley * 0.4, false, 'board');
          break;
      }
      return true;
    }

    /** Fires a broadside from side i. */
    fire(i, o) {
      o = o || {};
      const me = this.s[i], foe = this.other(i);
      if (!o.free) {
        if (me.fx.song > 0 || me.fx.freeze > 0) return;
        me.reloadT = 0;
      }
      me.volleys++;
      const ammoId = o.ammo || me.ammo;
      const ammo = AMMO[ammoId];
      let acc = me.acc * (me.fx.distract > 0 ? 0.6 : 1);
      const sailsF = foe.maxSails > 0 ? foe.sails / foe.maxSails : 1;
      let eva = foe.eva * (0.5 + 0.5 * sailsF) + (foe.fx.evade > 0 ? 0.5 : 0);
      if (foe.fx.phase > 0) eva = 0.9;
      const hitChance = Math.max(0.05, Math.min(0.98, acc * (1 - eva)));
      // A broadside is many balls: damage scales with the share that hits, plus noise.
      const balls = Math.max(3, Math.min(14, me.guns || 6));
      let hits = 0;
      for (let k = 0; k < balls; k++) if (this.rand() < hitChance) hits++;
      const share = hits / balls;
      const crit = this.rand() < me.crit;
      let dmg = me.volley * share * (0.88 + this.rand() * 0.24) * (o.mult || 1) * me.dmgMult * me.nextDmgMult *
        (crit ? 2 : 1) * (me.fx.rally > 0 ? 1.15 : 1);
      me.nextDmgMult = 1;
      if (foe.fx.shield > 0) dmg *= 0.3;
      const parts = { hull: 0, sails: 0, crew: 0 };
      if (foe.creature) {
        parts.hull = dmg * CREATURE_HULL[ammoId];
      } else {
        const special = ammoId === 'chain' || ammoId === 'grape' ? me.chainMult : 1;
        parts.hull = dmg * ammo.hull;
        parts.sails = dmg * ammo.sails * special;
        parts.crew = dmg * ammo.crew * special;
      }
      const burn = ammo.burn && hits > 0 ? dmg * ammo.burn : 0;
      this.pending.push({ at: this.t + FLIGHT, target: 1 - i, parts, burn, crit });
      this.emit({ t: 'fire', side: i, ammo: ammoId, balls, hits, crit, dmg: parts.hull });
    }

    applyHull(target, amount, crit, kind) {
      const f = this.s[target];
      const real = amount * (1 - (f.armor || 0));
      f.hp = Math.max(0, f.hp - real);
      this.other(target).dealt += real;
      this.emit({ t: 'hit', side: target, dmg: real, crit, kind });
      if (f.hp <= 0) this.finish(1 - target, 'sink');
    }

    impact(p) {
      const f = this.s[p.target];
      if (this.over) return;
      if (p.parts.hull > 0) this.applyHull(p.target, p.parts.hull, p.crit, 'ball');
      else this.emit({ t: 'miss', side: p.target });
      // Sails and crew damage are proportional to the same share of the hull pool.
      if (f.maxSails > 0 && p.parts.sails > 0) f.sails = Math.max(0, f.sails - p.parts.sails / f.maxHp * f.maxSails);
      if (f.maxCrew > 0 && p.parts.crew > 0) f.crew = Math.max(0, f.crew - p.parts.crew / f.maxHp * f.maxCrew);
      if (p.burn > 0) { f.burn = 6; f.burnDps = p.burn / 6; }
    }

    finish(winner, reason) {
      if (this.over) return;
      this.over = true;
      this.winner = winner;
      this.reason = reason;
      this.emit({ t: 'end', winner, reason });
    }

    step(dt) {
      if (this.over) return;
      this.t += dt;
      for (let i = 0; i < 2; i++) {
        const me = this.s[i];
        me.tapBucket = Math.min(TAP_CAP, me.tapBucket + TAP_CAP * dt);
        for (const k in me.fx) if (me.fx[k] > 0) me.fx[k] -= dt;
        for (const k in me.cds) if (me.cds[k] > 0) me.cds[k] = Math.max(0, me.cds[k] - dt);
        if (me.boardCd > 0) me.boardCd -= dt;
        if (me.heal > 0) {
          const h = Math.min(me.heal, dt);
          me.hp = Math.min(me.maxHp, me.hp + me.healRate * h);
          me.heal -= dt;
        }
        if (me.burn > 0) {
          const h = Math.min(me.burn, dt);
          me.burn -= dt;
          const d = me.burnDps * h;
          me.hp = Math.max(0, me.hp - d);
          if (me.hp <= 0) { this.finish(1 - i, 'sink'); return; }
        }
        if (me.lightning > 0) {
          me.lightning -= dt;
          if (me.lightning <= 0) {
            const foe = this.other(i);
            const dodge = foe.fx.evade > 0 ? 0.25 : 1;
            this.emit({ t: 'lightning', side: 1 - i });
            this.applyHull(1 - i, me.volley * 2.2 * dodge, true, 'lightning');
            if (this.over) return;
          }
        }
        if (me.grab) {
          me.grab.t -= dt;
          if (me.grab.t <= 0) {
            me.grab = null;
            this.emit({ t: 'grabHit', side: i });
            this.applyHull(i, me.maxHp * 0.22, false, 'grab');
            if (this.over) return;
          }
        }
        if (me.legendQueue > 0) {
          me.legendT -= dt;
          if (me.legendT <= 0) { this.fire(i, { free: true }); me.legendQueue--; me.legendT = 0.45; }
        }
        // Reload: fewer crew -> slower; song/freeze pause it.
        if (!(me.fx.song > 0) && !(me.fx.freeze > 0) && !me.grab) {
          const crewF = me.maxCrew > 0 ? 0.4 + 0.6 * (me.crew / me.maxCrew) : 1;
          const rate = crewF / me.reload * (me.fx.rally > 0 ? 2 : 1);
          me.reloadT = Math.min(1, me.reloadT + rate * dt);
        }
        if (me.reloadT >= 1) this.fire(i);
        if (this.over) return;
        if (me.ctrl === 'ai') this.ai(i, dt);
      }
      // Impacts
      for (let k = this.pending.length - 1; k >= 0; k--) {
        const p = this.pending[k];
        if (p.at <= this.t) {
          this.pending.splice(k, 1);
          this.impact(p);
          if (this.over) return;
        }
      }
      if (this.t >= this.timeLimit) {
        const a = this.s[0].hp / this.s[0].maxHp, b = this.s[1].hp / this.s[1].maxHp;
        this.finish(this.pvp ? (a >= b ? 0 : 1) : 1, 'time');
      }
    }

    /** Simple captain AI used by enemies and the duel bot. */
    ai(i, dt) {
      const me = this.s[i], foe = this.other(i);
      me.aiT -= dt;
      if (me.botTaps) {
        // The duel bot taps like a person: 3..6 per second.
        me.tapAcc = (me.tapAcc || 0) + dt * me.botTaps;
        while (me.tapAcc >= 1) { me.tapAcc -= 1; this.input(i, 'tap'); }
      }
      if (me.aiT > 0) return;
      me.aiT = 0.8 + this.rand() * 0.6;
      const list = me.abilities || me.abil || [];
      for (const ab of list) {
        if ((me.cds[ab] || 0) > 0) continue;
        let use = true;
        if ((ab === 'heal' || ab === 'repair') && me.hp / me.maxHp > 0.65) use = false;
        if (ab === 'board' && (foe.maxCrew <= 0 || foe.crew / foe.maxCrew > 0.6)) use = false;
        if (ab === 'grab' && this.tutorial) use = false;
        if (use) { this.useAbility(i, ab); break; }
      }
      if (!foe.creature && !me.creature && foe.maxCrew > 0) {
        const crewF = foe.crew / foe.maxCrew, hpF = foe.hp / foe.maxHp;
        if (this.canBoard(i) && me.crew * me.board > foe.crew * foe.board * 1.2) { this.tryBoard(i); return; }
        if (me.botTaps) {
          if (crewF > 0.45 && hpF < 0.7 && me.crew > foe.crew) me.ammo = 'grape';
          else if (foe.sails / foe.maxSails > 0.5 && this.rand() < 0.2) me.ammo = 'chain';
          else me.ammo = me.fireAmmo && this.rand() < 0.3 ? 'fire' : 'ball';
        } else if (me.boss) {
          me.ammo = this.rand() < 0.25 ? 'grape' : 'ball';
        }
      }
    }

    /** Compact snapshot for the network (host -> client). */
    snapshot() {
      return {
        t: +this.t.toFixed(2),
        s: this.s.map(x => ({
          hp: x.hp, crew: x.crew, sails: x.sails, r: +x.reloadT.toFixed(3), a: x.ammo,
          cd: x.cds, fx: x.fx, b: x.burn > 0 ? 1 : 0, g: x.grab ? x.grab.need : 0, bc: x.boardCd > 0 ? 1 : 0,
        })),
      };
    }
    applySnapshot(sn) {
      this.t = sn.t;
      sn.s.forEach((x, i) => {
        const me = this.s[i];
        me.hp = x.hp; me.crew = x.crew; me.sails = x.sails; me.reloadT = x.r; me.ammo = x.a;
        me.cds = x.cd; me.fx = x.fx; me.burn = x.b ? 1 : 0; me.grab = x.g ? { need: x.g, t: 1 } : null;
        me.boardCd = x.bc ? 1 : 0;
      });
    }
  }

  VC.Combat = { Battle, AMMO, ABIL };
})(window.VC);
