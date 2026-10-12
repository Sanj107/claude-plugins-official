'use strict';
// Battle controller: runs a Combat.Battle (local or networked), drives the 3D stage and battle HUD.
(function (VC) {
  const U = VC.util, ST = VC.State, UI = VC.UI;
  const { fmt, esc } = U;
  const AMMO = VC.Combat.AMMO, ABIL = VC.Combat.ABIL;

  const B = { active: null };
  VC.Battle = B;

  // ------------------------------------------------------------------ PvE entry
  /** opts: { kind:'story'|'raid'|'event', enemy, level, region, tutorial, lootMult, onDone } */
  B.begin = function (opts) {
    if (this.active) return;
    const G = VC.Game, s = G.s;
    if (s.ship.hp < 0.15 && opts.kind !== 'story') { UI.toast('Корабль слишком повреждён', 'bad'); return; }
    const reg = opts.region;
    const hz = opts.kind === 'raid' && reg.hazards.length && Math.random() < 0.3 ? U.pick(reg.hazards) : null;
    UI.closePanel();
    if (hz) this.hazard(hz, start => this.launch(opts, start));
    else this.launch(opts, null);
  };

  B.hazard = function (id, cb) {
    const hz = VC.HAZARDS[id];
    const s = VC.Game.s;
    if (hz.effect === 'tapEscape') {
      let left = 18, t = 5;
      const rec = UI.modal({
        title: hz.icon + ' ' + hz.name, noClose: true,
        html: `<p>${hz.text}</p><div class="big" id="whirl-n">${left}</div><p class="mini" id="whirl-t">${t} с</p>
          <button class="btn wide red" id="whirl-tap" style="height:90px;font-size:26px">🚣 ГРЕСТИ!</button>`,
        mount: m => {
          const btn = m.querySelector('#whirl-tap');
          btn.addEventListener('pointerdown', () => {
            left--; VC.Audio.sfx('click');
            m.querySelector('#whirl-n').textContent = Math.max(0, left);
            if (left <= 0) { clearInterval(timer); rec.close(); UI.toast('🌀 Вырвались из водоворота!'); cb(null); }
          });
          const timer = setInterval(() => {
            t -= 0.1;
            const el = m.querySelector('#whirl-t');
            if (el) el.textContent = Math.max(0, t).toFixed(1) + ' с';
            if (t <= 0) {
              clearInterval(timer); rec.close();
              s.ship.hp = Math.max(0.1, s.ship.hp - 0.15);
              UI.toast('🌀 Водоворот потрепал корабль: −15% корпуса', 'bad'); cb(null);
            }
          }, 100);
        },
      });
      return;
    }
    UI.modal({
      title: hz.icon + ' ' + hz.name, noClose: true, html: `<p>${hz.text}</p>`,
      buttons: hz.options.map(o => ({ label: o.label, cls: 'small', fn: () => cb(this.applyHazard(o.effect)) })),
      mount: m => {
        const b = m.querySelector('.btns');
        b.style.flexDirection = 'column';
        hz.options.forEach((o, i) => { m.querySelectorAll('[data-mb]')[i].insertAdjacentHTML('beforeend', `<br><span class="mini" style="font-family:Roboto">${o.desc}</span>`); m.querySelectorAll('[data-mb]')[i].style.whiteSpace = 'normal'; });
      },
    });
  };

  B.applyHazard = function (effect) {
    const s = VC.Game.s;
    const sailsF = Math.min(0.85, 0.35 + s.ship.sails * 0.006);
    switch (effect) {
      case 'slow': return 'slow';
      case 'risk20': if (Math.random() < 0.5) { s.ship.hp = Math.max(0.1, s.ship.hp - 0.2); UI.toast('💥 Пробоина! −20% корпуса', 'bad'); } else UI.toast('Проскочили!'); return null;
      case 'dmg10': s.ship.hp = Math.max(0.1, s.ship.hp - 0.1); return null;
      case 'dmg15': s.ship.hp = Math.max(0.1, s.ship.hp - 0.15); return null;
      case 'gamble': if (Math.random() < sailsF) { UI.toast('🌬️ Поймали ветер! +20% урона'); return 'gambleWin'; } s.ship.hp = Math.max(0.1, s.ship.hp - 0.25); UI.toast('⛈️ Шквал! −25% корпуса', 'bad'); return null;
      case 'enemyFirst': return 'enemyFirst';
      case 'sneak': if (Math.random() < 0.6) { UI.toast('🤫 Подкрались незаметно!'); return 'first'; } UI.toast('Нас заметили!', 'bad'); return 'enemyFirst';
    }
    return null;
  };

  B.launch = function (opts, start) {
    const G = VC.Game, s = G.s;
    ST.recompute(s);
    const me = Object.assign({}, VC.D.combat);
    me.hp = Math.max(1, me.maxHp * s.ship.hp);
    const foe = ST.enemyStats(opts.enemy, opts.level);
    const b = new VC.Combat.Battle(me, foe, ['human', 'ai'], { start, tutorial: opts.tutorial });
    const sim = {
      b, me: 0, local: true,
      input(cmd, arg) { return b.input(0, cmd, arg); },
      step(dt) { b.step(dt); const f = b.fx; b.fx = []; return f; },
    };
    this.start({
      sim, kind: opts.kind, opts,
      myName: s.shipName, foeName: foe.name, foeIcon: foe.icon, foeLevel: opts.level,
      myShip: { shipOpts: VC.Scene.playerShipOpts(s), shipKey: 'player:' + s.ship.tier + ':' + s.skins.sail + s.skins.flag + s.skins.hull },
      foeModel: foe.model, region: opts.region,
    });
  };

  // ------------------------------------------------------------------ generic start (PvE + PvP)
  /** cfg: { sim, kind, myName, foeName, foeIcon, foeLevel, myShip:{shipOpts, shipKey} | {model}, foeModel, region, pvp, emotes, onEnd } */
  B.start = function (cfg) {
    this.active = cfg;
    cfg.acc = 0;
    cfg.endT = 0;
    cfg.done = false;
    const sc = VC.Scene;
    const foeShip = cfg.foeModel.kind ? cfg.foeModel : cfg.foeModel;
    sc.startBattle(cfg.myShip, { model: foeShip }, cfg.region);
    UI.closePanel();
    UI.setTabsVisible(false);
    document.getElementById('battle-ui').classList.remove('hidden');
    this.buildUi();
    VC.Audio.setTrack('battle');
    if (cfg.kind === 'story' && VC.Game.s.story.idx <= 5) cfg.tip = true;
  };

  B.buildUi = function () {
    const c = this.active;
    const b = c.sim.b, me = b.s[c.sim.me], foe = b.s[1 - c.sim.me];
    const ring = `<svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="17" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="5"/><circle class="rl" cx="21" cy="21" r="17" fill="none" stroke="#ffd23f" stroke-width="5" stroke-dasharray="106.8" stroke-dashoffset="106.8"/></svg>`;
    const card = (side, name, icon, sub) => `<div class="bcard ${side}"><div class="row"><span style="font-size:26px">${icon}</span>
      <div class="grow"><div class="nm">${esc(name)}</div><div class="lv">${sub}</div></div><div class="fxs" data-fx></div><div class="reload">${ring}<span data-ammo></span></div></div>
      <div class="hpbar"><i data-hp></i><span data-hpt></span></div>
      ${side === 'foe' && foe.creature ? '' : `<div class="minis"><div>⛵<div class="bar blue"><i data-sails></i></div></div><div>👥<div class="bar red"><i data-crew></i></div></div></div>`}</div>`;
    const myAbils = (me.abilities || []);
    const ammoBtns = Object.keys(AMMO).filter(a => a !== 'fire' || me.fireAmmo).map(a => `<button data-ammo-btn="${a}"><span>${AMMO[a].icon}</span>${AMMO[a].name}</button>`).join('');
    const abilBtns = myAbils.map(a => `<button data-abil="${a}"><span>${ABIL[a].icon}</span>${ABIL[a].name}<div class="cd"></div><div class="cdt"></div></button>`).join('');
    const ui = document.getElementById('battle-ui');
    ui.innerHTML = card('foe', c.foeName, c.foeIcon, c.pvp ? `⚔️ ${fmt(ST.powerOf(foe))}` : `ур. ${c.foeLevel}${foe.boss ? ' · БОСС' : ''} · ⚔️ ${fmt(ST.powerOf(foe))}`) +
      `<div class="tap-tip" data-tip>${c.pvp ? 'Тапайте по морю — пушки заряжаются быстрее!' : '👆 Тапайте по морю — пушки заряжаются быстрее!'}</div>` +
      card('me', c.myName, VC.Game.s.avatar, `⚔️ ${fmt(ST.powerOf(me))}`) +
      `<div class="controls"><div class="ammo-row">${ammoBtns}</div><div class="abil-row">${abilBtns}<button class="flee" data-flee><span>🏳️</span>${c.pvp ? 'Сдаться' : 'Уйти'}</button></div></div>
      <button id="board-btn" class="hidden">⚔️ НА АБОРДАЖ!</button><div id="qte" class="hidden"></div>` +
      (c.emotes ? `<div class="emotes">${VC.DUEL.emotes.map((e, i) => `<button data-emote="${i}">${e}</button>`).join('')}</div>` : '');
    this.el = {
      foe: ui.querySelector('.bcard.foe'), me: ui.querySelector('.bcard.me'),
      board: ui.querySelector('#board-btn'), qte: ui.querySelector('#qte'), tip: ui.querySelector('[data-tip]'),
    };
    ui.querySelectorAll('[data-ammo-btn]').forEach(bt => bt.addEventListener('pointerdown', e => {
      e.stopPropagation(); VC.Audio.sfx('click'); c.sim.input('ammo', bt.dataset.ammoBtn); this.refreshUi(true);
    }));
    ui.querySelectorAll('[data-abil]').forEach(bt => bt.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (c.sim.input('abil', bt.dataset.abil)) VC.Audio.sfx('ability'); else VC.Audio.sfx('error');
    }));
    ui.querySelector('[data-flee]').addEventListener('click', e => { e.stopPropagation(); this.askFlee(); });
    this.el.board.addEventListener('pointerdown', e => { e.stopPropagation(); c.sim.input('board'); VC.Audio.sfx('cannon'); });
    ui.querySelectorAll('[data-emote]').forEach(bt => bt.addEventListener('click', e => { e.stopPropagation(); if (c.onEmote) c.onEmote(+bt.dataset.emote); }));
    this.refreshUi(true);
  };

  B.askFlee = function () {
    const c = this.active;
    if (!c || c.done) return;
    UI.confirm(c.pvp ? 'Сдаться?' : 'Отступить?', c.pvp ? 'Дуэль будет проиграна.' : 'Бой будет проигран, добычи не будет.', c.pvp ? 'Сдаться' : 'Отступить', () => c.sim.input('flee'));
  };

  /** Tap on the sea during battle. */
  B.tap = function (x, y) {
    const c = this.active;
    if (!c || c.done || UI.hasModal()) return;
    const me = c.sim.b.s[c.sim.me];
    c.sim.input('tap');
    if (me.grab) { VC.Audio.sfx('hit'); UI.floater(x, y - 20, '💪', ''); }
    else { VC.Audio.sfx('click'); UI.floater(x, y - 20, '⚡', 'heal'); }
    VC.Scene.burst(VC.Scene.unproject(x, y, 0.1).toArray(), 3, { color: ['#ffffff', '#cdefff'], speed: 1.5, up: 1.4, size: 0.1, life: 0.4 });
    if (this.el.tip) { this.el.tip.remove(); this.el.tip = null; }
  };

  // ------------------------------------------------------------------ frame
  B.update = function (dt) {
    const c = this.active;
    if (!c) return;
    if (!c.done) {
      c.acc += dt;
      while (c.acc >= 0.05) {
        c.acc -= 0.05;
        const fx = c.sim.step(0.05);
        for (const e of fx) this.handleFx(e);
      }
      // fx coming from the network (client side)
      if (c.sim.drainFx) for (const e of c.sim.drainFx()) this.handleFx(e);
      this.refreshUi();
      if (c.sim.b.over && !c.done) {
        c.done = true;
        c.endT = 2.2;
        this.el.board.classList.add('hidden');
      }
    } else if (c.endT > 0) {
      c.endT -= dt;
      if (c.endT <= 0) this.finish();
    }
  };

  B.sceneSide = function (side) { return side === this.active.sim.me ? 0 : 1; };

  B.handleFx = function (e) {
    const c = this.active;
    const sc = VC.Scene;
    const ss = e.side !== undefined ? this.sceneSide(e.side) : undefined;
    const se = Object.assign({}, e, { side: ss });
    if (e.t === 'end') se.winner = this.sceneSide(e.winner);
    sc.battleFx(se);
    const ship = sc.bShips && sc.bShips[ss];
    const pos = ship ? sc.project(ship.position.clone().add(new THREE.Vector3(U.rnd(-1, 1), 2.2, 0))) : null;
    switch (e.t) {
      case 'fire': VC.Audio.sfx('cannon'); if (ss === 0) VC.Game.vibrate(12); break;
      case 'hit':
        if (pos && e.dmg > 0) UI.floater(pos.x, pos.y, (e.crit ? 'КРИТ! −' : '−') + fmt(e.dmg), ss === 0 ? 'dmg' : (e.crit ? 'crit' : ''));
        VC.Audio.sfx('hit');
        if (ss === 0) { UI.hurt(); VC.Game.vibrate(e.crit ? 60 : 25); }
        break;
      case 'miss': if (pos) UI.floater(pos.x, pos.y, 'мимо', 'miss'); VC.Audio.sfx('splash'); break;
      case 'abil': {
        const a = ABIL[e.id];
        if (pos) UI.floater(pos.x, pos.y - 30, a.icon + ' ' + a.name, 'heal');
        VC.Audio.sfx('ability');
        if (ss === 1 && e.id === 'lightning') UI.toast('⚡ Молния собирается! Манёвр поможет увернуться');
        if (ss === 1 && e.id === 'grab') UI.toast('🐙 Хватка! Тапайте, чтобы вырваться!', 'bad');
        if (ss === 1 && e.id === 'phase') UI.toast('👻 Враг стал бесплотным — ядра пролетают насквозь');
        break;
      }
      case 'lightning': VC.Audio.sfx('thunder'); break;
      case 'grabFree': UI.toast('💪 Вырвались!'); break;
      case 'grabHit': VC.Game.vibrate(120); break;
      case 'board':
        if (!e.ok) UI.toast(ss === 0 ? '⚔️ Абордаж отбит! Команда потеряла людей' : '⚔️ Вражеский абордаж отбит!', ss === 0 ? 'bad' : '');
        break;
    }
  };

  function pct(a, b) { return Math.max(0, Math.min(100, a / Math.max(1e-9, b) * 100)); }

  B.refreshUi = function (force) {
    const c = this.active;
    const b = c.sim.b;
    const meI = c.sim.me;
    [['me', meI], ['foe', 1 - meI]].forEach(([k, i]) => {
      const sd = b.s[i], el = this.el[k];
      el.querySelector('[data-hp]').style.width = pct(sd.hp, sd.maxHp) + '%';
      el.querySelector('[data-hpt]').textContent = fmt(sd.hp) + ' / ' + fmt(sd.maxHp);
      const sl = el.querySelector('[data-sails]');
      if (sl) { sl.style.width = pct(sd.sails, sd.maxSails) + '%'; el.querySelector('[data-crew]').style.width = pct(sd.crew, sd.maxCrew) + '%'; }
      el.querySelector('.rl').style.strokeDashoffset = 106.8 * (1 - Math.min(1, sd.reloadT));
      el.querySelector('[data-ammo]').textContent = AMMO[sd.ammo] ? AMMO[sd.ammo].icon : '';
      const fx = [];
      if (sd.fx.distract > 0) fx.push('😵');
      if (sd.fx.evade > 0) fx.push('💨');
      if (sd.fx.song > 0) fx.push('🎵');
      if (sd.fx.freeze > 0) fx.push('❄️');
      if (sd.fx.shield > 0) fx.push('🛡️');
      if (sd.fx.phase > 0) fx.push('👻');
      if (sd.fx.rally > 0) fx.push('📯');
      if (sd.burn > 0) fx.push('🔥');
      if (sd.heal > 0) fx.push('🔧');
      if (sd.lightning > 0) fx.push('⚡');
      el.querySelector('[data-fx]').textContent = fx.join('');
      VC.Scene.setBurning(this.sceneSide(i), sd.burn > 0);
    });
    const me = b.s[meI];
    // ammo buttons
    document.querySelectorAll('#battle-ui [data-ammo-btn]').forEach(bt => bt.classList.toggle('active', bt.dataset.ammoBtn === me.ammo));
    document.querySelectorAll('#battle-ui [data-abil]').forEach(bt => {
      const id = bt.dataset.abil;
      const cd = me.cds[id] || 0;
      const max = ABIL[id].cd;
      bt.querySelector('.cd').style.height = (cd > 0 ? cd / max * 100 : 0) + '%';
      bt.querySelector('.cdt').textContent = cd > 0 ? Math.ceil(cd) : '';
      bt.classList.toggle('ready', cd <= 0);
    });
    const canBoard = !b.over && b.canBoard(meI);
    this.el.board.classList.toggle('hidden', !canBoard);
    if (me.grab) {
      this.el.qte.classList.remove('hidden');
      this.el.qte.innerHTML = `ТАПАЙ!<small>Вырвись из хватки: ещё ${me.grab.need}</small>`;
    } else this.el.qte.classList.add('hidden');
  };

  // ------------------------------------------------------------------ end
  B.finish = function () {
    const c = this.active;
    const b = c.sim.b;
    const meI = c.sim.me;
    const win = b.winner === meI;
    const me = b.s[meI], foe = b.s[1 - meI];
    const hpFrac = me.hp / me.maxHp;
    const close = () => {
      this.active = null;
      document.getElementById('battle-ui').classList.add('hidden');
      document.getElementById('battle-ui').innerHTML = '';
      VC.Scene.endBattle();
      UI.setTabsVisible(true);
      UI.refreshTabs();
      VC.Audio.setTrack('calm');
    };
    if (c.onEnd) { c.onEnd({ win, reason: b.reason, hpFrac, dealt: me.dealt, close }); return; }
    const G = VC.Game, s = G.s;
    const o = c.opts;
    VC.Audio.sfx(win ? 'win' : 'lose');
    G.onBattleEnd({ win, kind: o.kind, boss: foe.boss, reason: b.reason, region: o.region, level: o.level, hpFrac: win ? hpFrac : 0.08 });
    if (win) {
      const loot = ST.enemyLoot(o.enemy, o.level);
      let gold = loot.gold * VC.D.combat.lootMult * (b.reason === 'board' ? 1.5 : 1) * (o.lootMult || 1);
      const res = { gold, xp: loot.xp, extra: [] };
      G.addGold(gold);
      G.addXp(loot.xp);
      if (b.reason === 'board') res.extra.push('⚔️ Абордаж: добыча ×1,5');
      let pearlChance = o.kind === 'raid' ? 0.06 : o.kind === 'event' ? 0.5 : 0;
      if (foe.boss && o.kind === 'raid') pearlChance = 0.3;
      if (Math.random() < pearlChance) res.pearls = G.addPearls(U.rndi(1, 2));
      if (o.region && o.region.endless && (o.level - o.region.min + 1) % 10 === 0) res.pearls = (res.pearls || 0) + G.addPearls(5);
      UI.modal({
        title: b.reason === 'board' ? 'Абордаж удался!' : 'ПОБЕДА!', icon: b.reason === 'board' ? '🏴‍☠️' : '🏆', noClose: true,
        html: `<p>${esc(foe.name)} ${b.reason === 'sink' ? 'идёт ко дну!' : b.reason === 'board' ? 'захвачен!' : 'отступает!'}</p>
          <div class="loot">${['🪙 ' + fmt(res.gold), '⭐ ' + fmt(res.xp)].concat(res.pearls ? ['💎 ' + res.pearls] : []).concat(res.extra).map(x => `<div>${x}</div>`).join('')}</div>
          <p class="mini">Корпус: ${Math.round(hpFrac * 100)}%</p>`,
        buttons: [
          { label: 'Дальше', cls: 'green', fn: () => { close(); if (o.kind === 'story') G.onStoryBattleWon(); if (o.onDone) o.onDone(true); } },
        ].concat(o.kind === 'raid' ? [{ label: '⚔️ Ещё рейд', fn: () => { close(); G.startRaid(o.region.id); } }] : []),
      });
    } else {
      const fled = b.reason === 'flee';
      G.addXp(Math.round(ST.enemyLoot(o.enemy, o.level).xp * 0.2));
      UI.modal({
        title: fled ? 'Отступление' : 'Поражение…', icon: fled ? '🏳️' : '💀', noClose: true,
        html: `<p>${fled ? 'Корабль уходит из боя.' : 'Корабль едва держится на плаву и возвращается в порт.'}</p>
          <div class="card dark" style="text-align:left"><div class="sub">Советы:<br>• Улучшайте корпус и пушки во вкладке «Корабль».<br>• Тапайте чаще — это ускоряет залпы.<br>• Книппели и картечь ослабляют врага, абордаж приносит ×1,5 добычи.<br>• Выбирайте способности офицеров и изучайте таланты «Канонира».<br>• Мощь врага видна на карте: ⚔️ зелёная — легко, красная — опасно.</div></div>`,
        buttons: [{ label: 'В порт', fn: () => { close(); if (o.onDone) o.onDone(false); } }],
      });
    }
  };
})(window.VC);
