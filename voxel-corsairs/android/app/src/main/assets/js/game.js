'use strict';
// Game core: main loop, economy, purchases, story flow, daily rewards, achievements, legend.
(function (VC) {
  const U = VC.util, ST = VC.State, UI = VC.UI;
  const { fmt } = U;

  const G = {
    s: null, frenzy: 0, lastTap: 0, saveT: 0, achT: 0, hudT: 0, panelT: 0, storyT: 0, minuteT: 0,
    buyMult: 1, ready: false, paused: false, autoTapAcc: 0,
  };
  VC.Game = G;

  // ------------------------------------------------------------------ boot
  G.boot = function () {
    UI.init();
    const loaded = ST.load();
    this.s = loaded || ST.defaultState();
    const s = this.s;
    // Measure the time away before the first frame saves (which refreshes lastSave).
    this.awaySec = loaded ? Math.max(0, (Date.now() - s.lastSave) / 1000) : 0;
    this.saveT = 10;
    VC.Audio.setSound(s.settings.sound);
    VC.Audio.setMusic(s.settings.music);
    ST.recompute(s);
    VC.Scene.init(document.getElementById('gl'), s.settings.quality);
    VC.Scene.buildIsland(s);
    document.getElementById('hud').classList.remove('hidden');
    this.bindInput();
    window.addEventListener('resize', () => VC.Scene.resize());
    VC.Events.init();
    VC.Duel.init();
    this.ready = true;
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
    setTimeout(() => {
      document.getElementById('loading').style.opacity = '0';
      setTimeout(() => document.getElementById('loading').remove(), 500);
      if (!loaded || !s.name) this.newGame();
      else this.welcomeBack();
    }, 400);
  };

  G.newGame = function () {
    const avatars = ['🏴‍☠️', '🧑‍✈️', '👒', '🦜', '⚓', '🗡️', '💀', '🧭', '🦈', '👑'];
    let sel = avatars[0];
    UI.modal({
      title: 'Воксельные Корсары', icon: '🏝️', noClose: true,
      html: `<p>Как зовут нового капитана?</p><input type="text" id="cap-name" maxlength="16" placeholder="Имя капитана">
        <p class="mini" style="margin-top:12px">Флаг-портрет:</p>
        <div class="avatars">${avatars.map((a, i) => `<button data-av="${a}" class="${i ? '' : 'sel'}">${a}</button>`).join('')}</div>`,
      buttons: [{ label: 'Поднять паруса!', cls: 'green wide', close: false, fn: m => {
        const name = m.querySelector('#cap-name').value.trim();
        if (!name) { UI.shakeEl(m.querySelector('#cap-name')); return; }
        this.s.name = name.slice(0, 16);
        this.s.avatar = sel;
        UI.modalStack[UI.modalStack.length - 1].close();
        this.save();
        this.startStory();
      } }],
      mount: m => {
        m.querySelectorAll('[data-av]').forEach(b => b.addEventListener('click', () => {
          sel = b.dataset.av;
          m.querySelectorAll('[data-av]').forEach(x => x.classList.toggle('sel', x === b));
        }));
      },
    });
  };

  /** The app came back from the background after `away` seconds. */
  G.offlineReturn = function (away) {
    if (VC.Battle.active || UI.inDialogue()) return;
    const s = this.s;
    this.dailyCheck();
    s.ship.hp = Math.min(1, s.ship.hp + VC.D.combat.regen * away);
    if (VC.D.income <= 0) return;
    const sec = Math.min(away, VC.D.offlineCap);
    const gold = VC.D.income * sec * VC.D.offlineRate;
    UI.modal({
      title: 'С возвращением!', icon: '🌙', noClose: true,
      html: `<p>Остров работал ${U.fmtTime(sec)} без вас.</p><div class="big">🪙 ${fmt(gold)}</div>`,
      buttons: [{ label: 'Забрать', cls: 'green', fn: () => this.addGold(gold) }],
      onClose: null,
    });
  };

  G.welcomeBack = function () {
    const s = this.s;
    const away = this.awaySec;
    UI.refreshTabs();
    this.dailyCheck();
    if (away > 60 && VC.D.income > 0) {
      const sec = Math.min(away, VC.D.offlineCap);
      const gold = VC.D.income * sec * VC.D.offlineRate;
      // Expeditions keep running while away; the ship repairs itself.
      s.ship.hp = Math.min(1, s.ship.hp + VC.D.combat.regen * away);
      UI.modal({
        title: 'Пока вас не было…', icon: '🌙', noClose: true,
        html: `<p>Остров работал ${U.fmtTime(sec)}${away > sec ? ` (лимит ${U.fmtTime(VC.D.offlineCap)})` : ''}.</p>
          <div class="big">🪙 ${fmt(gold)}</div><p class="mini">Офлайн-доход: ${Math.round(VC.D.offlineRate * 100)}% от обычного</p>`,
        buttons: [
          { label: 'Забрать', cls: 'green', fn: () => { this.addGold(gold); this.resumeStory(); } },
          { label: '×2 за 💎5', cls: 'pearl' + (s.pearls >= 5 ? '' : ' disabled'), fn: () => {
            if (s.pearls >= 5) { s.pearls -= 5; this.addGold(gold * 2); } else this.addGold(gold);
            this.resumeStory();
          } },
        ],
      });
    } else this.resumeStory();
  };

  // ------------------------------------------------------------------ input on the 3D view
  G.bindInput = function () {
    const c = document.getElementById('gl');
    let down = null, pinch = null;
    const pts = new Map();
    c.addEventListener('pointerdown', e => {
      VC.Audio.unlock();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        down = null;
        return;
      }
      down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, id: e.pointerId };
      // Taps register on press for snappy clicker feel; drags are detected separately.
      if (VC.Battle.active) { VC.Battle.tap(e.clientX, e.clientY); down.battle = true; return; }
    });
    c.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        VC.Scene.zoom(pinch / d);
        pinch = d;
        return;
      }
      if (down && !down.battle) {
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        down.moved += Math.abs(dx) + Math.abs(dy);
        if (down.moved > 14) VC.Scene.drag(dx, dy);
      }
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!down || down.id !== e.pointerId) return;
      const d = down;
      down = null;
      if (d.battle || d.moved > 14) return;
      this.tapAt(d.x, d.y);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', e => { pts.delete(e.pointerId); down = null; pinch = null; });
    c.addEventListener('wheel', e => VC.Scene.zoom(e.deltaY > 0 ? 1.08 : 0.92), { passive: true });
  };

  G.tapAt = function (x, y) {
    if (UI.inDialogue() || UI.hasModal()) return;
    const hit = VC.Scene.pick(x, y);
    if (hit && hit.actor) { hit.actor.onTap(x, y); return; }
    if (hit && hit.plot !== undefined && VC.Scene.buildMode) { VC.Panels.island.plotTapped(hit.plot); return; }
    if (this.panelBlocks(y)) return;
    this.tap(x, y);
  };
  // The open panel covers the lower part of the screen; taps there belong to the panel.
  G.panelBlocks = function (y) {
    const p = document.getElementById('panel');
    if (!p.classList.contains('open')) return false;
    return y > p.getBoundingClientRect().top;
  };

  // ------------------------------------------------------------------ clicker
  G.tap = function (x, y, auto) {
    const s = this.s, D = VC.D;
    if (!auto && s.story.idx === 0 && s.story.phase === 'intro') return;
    let g = D.tapPower;
    const crit = Math.random() < D.tapCrit;
    if (crit) g *= 10;
    this.addGold(g);
    s.stats.taps++;
    if (!auto) {
      this.lastTap = performance.now();
      if (D.frenzyMult <= 1) {
        this.frenzy = Math.min(100, this.frenzy + 1.6);
        if (this.frenzy >= 100) this.startFrenzy();
      }
      VC.Scene.coinBurst(x, y, crit ? 10 : 4, crit);
      UI.floater(x + U.rnd(-14, 14), y - 20, '+' + fmt(g), crit ? 'crit' : '');
      VC.Audio.sfx(crit ? 'crit' : 'coin');
      if (crit) this.vibrate(18);
      VC.Scene.chestPulse = 0.15;
      document.getElementById('tap-hint').classList.add('hidden');
    }
    if (D.pearlTapChance > 0 && Math.random() < D.pearlTapChance) {
      this.addPearls(1);
      if (!auto) UI.floater(x, y - 50, '+1 💎', 'pearl');
    }
  };

  G.startFrenzy = function () {
    const s = this.s;
    s._frenzyUntil = Date.now() + 10000;
    this.frenzy = 0;
    s.stats.frenzies++;
    ST.recompute(s);
    VC.Audio.sfx('frenzy');
    UI.toast('🔥 Золотая лихорадка! Тапы ×5 на 10 секунд!');
    this.vibrate(40);
  };

  G.vibrate = function (ms) {
    if (!this.s.settings.vibro) return;
    if (window.AndroidBridge && AndroidBridge.vibrate) AndroidBridge.vibrate(ms);
    else if (navigator.vibrate) navigator.vibrate(ms);
  };

  // ------------------------------------------------------------------ currencies
  G.addGold = function (n) {
    if (!(n > 0)) return;
    const s = this.s;
    s.gold += n; s.goldRun += n; s.stats.goldEarned += n;
  };
  G.spend = function (n) {
    if (this.s.gold < n) { VC.Audio.sfx('error'); UI.toast('Не хватает дублонов', 'bad'); return false; }
    this.s.gold -= n;
    return true;
  };
  G.spendPearls = function (n) {
    if (this.s.pearls < n) { VC.Audio.sfx('error'); UI.toast('Не хватает жемчуга 💎', 'bad'); return false; }
    this.s.pearls -= n;
    return true;
  };
  G.addPearls = function (n, mult) {
    n = Math.max(1, Math.round(n * (mult === false ? 1 : VC.D.pearlMult)));
    this.s.pearls += n;
    return n;
  };
  G.addXp = function (n) {
    const s = this.s;
    s.xp += Math.round(n);
    let up = false;
    while (s.xp >= ST.xpNeed(s.level)) {
      s.xp -= ST.xpNeed(s.level);
      s.level++;
      s.stats.level = s.level;
      up = true;
    }
    if (up) {
      VC.Audio.sfx('level');
      UI.toast(`⭐ Уровень капитана ${s.level}! +1 очко таланта`, 'ach');
      ST.recompute(s);
      UI.refreshTabs();
    }
  };
  G.talentPoints = function () {
    const s = this.s;
    let spent = 0;
    for (const k in s.talents) spent += s.talents[k];
    return s.level - 1 - spent;
  };

  // ------------------------------------------------------------------ buildings
  G.buildingAvailable = function (b) {
    const s = this.s;
    if (b.id === 'statue') return s.slava >= 10;
    return b.ch <= this.chapter();
  };
  G.buyBuilding = function (id, mult) {
    const s = this.s;
    const b = ST.BY_ID[id];
    if (!this.buildingAvailable(b)) return;
    let plot = ST.plotOf(s, id);
    if (plot < 0) {
      plot = ST.bestPlot(s, id);
      if (plot < 0) {
        UI.toast(b.plot === 'shore' ? '🏖️ Нужен свободный участок на берегу' : '🌴 Нужен свободный участок на суше', 'bad');
        return;
      }
    }
    let n = mult === 'max' ? Math.max(1, ST.maxAffordable(s, id)) : (mult || 1);
    const cost = ST.buildingCost(s, id, n);
    if (!this.spend(cost)) return;
    const first = s.buildings[id] === 0;
    if (first) s.layout[plot] = id;
    const before = ST.milestoneMult(s.buildings[id]);
    s.buildings[id] += n;
    s.stats.buildingLevels += n;
    ST.recompute(s);
    VC.Audio.sfx('buy');
    if (first) { VC.Scene.refreshBuildings(s); UI.toast(`${b.icon} Построено: ${b.name}!`); this.vibrate(20); }
    else if (ST.milestoneMult(s.buildings[id]) > before) { UI.toast(`${b.icon} ${b.name}: доход ×2!`, 'ach'); VC.Scene.refreshBuildings(s); }
    this.afterChange();
  };
  G.buyPlot = function () {
    const s = this.s;
    if (s.plots >= VC.PLOTS.length) return;
    if (!this.spend(VC.PLOTS[s.plots].cost)) return;
    s.plots++;
    VC.Audio.sfx('buy');
    UI.toast('🗺️ Новый участок расчищен!');
    VC.Scene.refreshBuildings(s);
    this.afterChange();
  };
  G.moveBuilding = function (from, to) {
    const s = this.s;
    if (to >= s.plots || from === to) return false;
    const a = s.layout[from], b = s.layout[to];
    if (!a) return false;
    const ta = ST.plotInfo(to).type, tb = ST.plotInfo(from).type;
    if (ST.BY_ID[a].plot !== ta) { UI.toast(ST.BY_ID[a].plot === 'shore' ? 'Эта постройка стоит только на берегу' : 'Эта постройка стоит только на суше', 'bad'); return false; }
    if (b && ST.BY_ID[b].plot !== tb) { UI.toast('Нельзя поменять местами: другой тип участка', 'bad'); return false; }
    s.layout[to] = a;
    if (b) s.layout[from] = b; else delete s.layout[from];
    ST.recompute(s);
    VC.Scene.refreshBuildings(s);
    VC.Audio.sfx('click');
    this.afterChange();
    return true;
  };

  // ------------------------------------------------------------------ ship
  G.buyUpgrade = function (uid) {
    const s = this.s;
    const cap = VC.SHIPS[s.ship.tier - 1].cap;
    if (s.ship[uid] >= cap) { UI.toast('Предел для этого корабля. Нужен корабль крупнее!', 'bad'); return; }
    if (!this.spend(ST.upgradeCost(s, uid))) return;
    const hpFrac = s.ship.hp;
    s.ship[uid]++;
    s.stats.shipLevels++;
    s.ship.hp = hpFrac;
    ST.recompute(s);
    VC.Audio.sfx('buy');
    this.afterChange();
  };
  G.buyTier = function () {
    const s = this.s;
    const next = VC.SHIPS[s.ship.tier];
    if (!next) return;
    if (next.ch > this.chapter() && !(next.slava && s.slava >= next.slava && s.unlocked.endless)) { UI.toast('🔒 Верфь ещё не готова строить такое', 'bad'); return; }
    if (next.slava && s.slava < next.slava) { UI.toast(`Нужно ${next.slava} Славы`, 'bad'); return; }
    if (!this.spend(next.cost)) return;
    s.ship.tier++;
    s.stats.shipTier = s.ship.tier;
    while (s.ship.deck.length < next.slots) s.ship.deck.push(null);
    s.ship.hp = 1;
    ST.recompute(s);
    VC.Scene.refreshPlayerShip(s);
    VC.Audio.sfx('win');
    this.vibrate(60);
    UI.modal({ title: `Новый корабль: ${next.name}!`, icon: '⛵', html: `<p>${next.desc}</p><p>Слотов на палубе: ${next.slots}. Предел улучшений: ${next.cap}.</p>`, buttons: [{ label: 'Йо-хо-хо!', cls: 'green' }] });
    this.afterChange();
  };
  G.buyModule = function (mid) {
    const s = this.s;
    const m = ST.MOD_BY_ID[mid];
    if (m.ch > this.chapter()) return;
    if (!this.spend(ST.moduleCost(s, mid))) return;
    s.ship.modules[mid]++;
    if (s.ship.modules[mid] === 1 && s.ship.deck.indexOf(mid) < 0) {
      const free = s.ship.deck.indexOf(null);
      if (free >= 0) { s.ship.deck[free] = mid; UI.toast(`${m.icon} ${m.name} установлен на палубу`); }
      else UI.toast('Палуба занята — снимите модуль, чтобы поставить этот');
    }
    s.stats.shipLevels++;
    ST.recompute(s);
    VC.Audio.sfx('buy');
    this.afterChange();
  };
  G.toggleModule = function (mid) {
    const s = this.s;
    const i = s.ship.deck.indexOf(mid);
    if (i >= 0) s.ship.deck[i] = null;
    else {
      const free = s.ship.deck.indexOf(null);
      if (free < 0) { UI.toast('Все слоты заняты. Снимите другой модуль.', 'bad'); return; }
      if (s.ship.modules[mid] <= 0) return;
      s.ship.deck[free] = mid;
    }
    ST.recompute(s);
    VC.Audio.sfx('click');
    this.afterChange();
  };
  G.repairCost = function () { return Math.max(10, ST.incomeFor(60) * (1 - this.s.ship.hp)); };
  G.repair = function () {
    if (this.s.ship.hp >= 0.999) return;
    if (!this.spend(this.repairCost())) return;
    this.s.ship.hp = 1;
    VC.Audio.sfx('buy');
    UI.toast('🔧 Корабль как новый!');
    this.afterChange();
  };

  // ------------------------------------------------------------------ captain
  G.learnTalent = function (id) {
    const s = this.s;
    const t = VC.TALENTS.find(x => x.id === id);
    if (this.talentPoints() <= 0 || s.talents[id] >= t.max) return;
    s.talents[id]++;
    ST.recompute(s);
    VC.Audio.sfx('buy');
    this.afterChange();
  };
  G.resetTalents = function () {
    UI.confirm('Сбросить таланты?', 'Все очки вернутся. Стоимость: 💎20', 'Сбросить', () => {
      if (!this.spendPearls(20)) return;
      for (const k in this.s.talents) this.s.talents[k] = 0;
      ST.recompute(this.s);
      this.afterChange();
    });
  };
  G.equipAbility = function (oid) {
    const s = this.s;
    const i = s.abilities.indexOf(oid);
    if (i >= 0) s.abilities[i] = null;
    else {
      const free = s.abilities.indexOf(null);
      if (free < 0) { UI.toast('Три способности уже выбраны. Снимите одну.', 'bad'); return; }
      s.abilities[free] = oid;
    }
    ST.recompute(s);
    this.afterChange();
  };

  // ------------------------------------------------------------------ boosts & shop
  G.addBoost = function (b) {
    const s = this.s;
    const now = Date.now();
    const ex = s.boosts.find(x => x.id === b.id && x.mult === b.mult && x.until > now);
    if (ex) ex.until += b.time * 1000;
    else s.boosts.push({ id: b.id, mult: b.mult, until: now + b.time * 1000 });
    ST.recompute(s);
  };
  G.buyShop = function (id) {
    const s = this.s;
    const it = ST.SHOP_BY_ID[id];
    if (it.once && s.perms[id]) return;
    if (!this.spendPearls(it.price)) return;
    VC.Audio.sfx('buy');
    if (it.boost) { this.addBoost(it.boost); UI.toast(`${it.icon} ${it.name}: ${it.desc}`); }
    if (it.warp) { const g = ST.incomeFor(it.warp); this.addGold(g); UI.reward('Песочные часы', { gold: g }, '⏳'); }
    if (it.chest) this.openChest(it.chest);
    if (it.once) { s.perms[id] = true; UI.toast(`${it.icon} ${it.name} — навсегда твоё!`, 'ach'); }
    ST.recompute(s);
    this.afterChange();
  };
  G.goldShopPrice = function (it) { return Math.max(50, ST.incomeFor(it.mins * 60)); };
  G.buyGoldShop = function (id) {
    const it = VC.GOLD_SHOP.find(x => x.id === id);
    if (it.repair && this.s.ship.hp >= 0.999) { UI.toast('Корабль и так цел'); return; }
    if (!this.spend(this.goldShopPrice(it))) return;
    VC.Audio.sfx('buy');
    if (it.boost) { this.addBoost(it.boost); UI.toast(`${it.icon} ${it.desc}`); }
    if (it.map) VC.Events.treasureHunt();
    if (it.repair) { this.s.ship.hp = 1; UI.toast('🔧 Корабль починен'); }
    this.afterChange();
  };
  G.openChest = function (kind) {
    const s = this.s;
    const loot = { extra: [] };
    let skinChance = 0;
    if (kind === 'wood') { loot.gold = ST.incomeFor(U.rnd(15, 45) * 60) + 200; skinChance = 0.1; }
    if (kind === 'silver') { loot.gold = ST.incomeFor(U.rnd(60, 180) * 60) + 2000; loot.pearls = this.addPearls(U.rndi(3, 10), false); skinChance = 0.35; }
    if (kind === 'gold') {
      loot.gold = ST.incomeFor(U.rnd(240, 480) * 60) + 20000; skinChance = 1;
      const b = U.pick([{ id: 'income', mult: 2, time: 1800 }, { id: 'tap', mult: 3, time: 900 }, { id: 'battle', mult: 1.5, time: 1800 }]);
      this.addBoost(b);
      loot.extra.push('✨ Буст на ' + (b.time / 60) + ' мин');
    }
    this.addGold(loot.gold);
    if (Math.random() < skinChance) {
      const sk = this.randomSkin();
      if (sk) { s.skins.owned.push(sk.key); loot.extra.push(`🎨 Скин: ${sk.name}`); }
      else { const p = this.addPearls(15, false); loot.pearls = (loot.pearls || 0) + p; }
    }
    UI.reward({ wood: 'Деревянный сундук', silver: 'Серебряный сундук', gold: 'Золотой сундук' }[kind], loot, { wood: '📦', silver: '🧰', gold: '👑' }[kind]);
  };
  G.randomSkin = function () {
    const s = this.s;
    const pool = [];
    for (const kind of ['sail', 'flag', 'hull']) for (const sk of VC.SKINS[kind]) {
      const key = kind + ':' + sk.id;
      if (sk.price > 0 && s.skins.owned.indexOf(key) < 0) pool.push({ key, name: sk.name + ' (' + { sail: 'паруса', flag: 'флаг', hull: 'корпус' }[kind] + ')' });
    }
    return pool.length ? U.pick(pool) : null;
  };
  G.buySkin = function (kind, id) {
    const s = this.s;
    const key = kind + ':' + id;
    const sk = VC.SKINS[kind].find(x => x.id === id);
    if (s.skins.owned.indexOf(key) < 0) {
      if (sk.special) { UI.toast('Открывается по сюжету: ' + sk.special); return; }
      if (!this.spendPearls(sk.price)) return;
      s.skins.owned.push(key);
      VC.Audio.sfx('buy');
    }
    s.skins[kind] = id;
    VC.Scene.refreshPlayerShip(s);
    this.afterChange();
  };

  // ------------------------------------------------------------------ expeditions
  G.startExpedition = function (id) {
    const s = this.s;
    const ex = VC.EXPEDITIONS.find(x => x.id === id);
    if (s.expeditions.length >= VC.D.expSlots) { UI.toast('Все шлюпки в море', 'bad'); return; }
    const time = ex.time * VC.D.expTimeMult / (s.settings.tester ? 30 : 1);
    const ok = Math.random() < Math.min(0.97, 0.75 + ex.power * 0 + 0.04 * s.talents.carto + (VC.D.power > 0 ? 0.1 : 0));
    const rec = {
      id, start: Date.now(), end: Date.now() + time * 1000, ok,
      gold: ST.incomeFor(ex.reward * 60) * VC.D.expRewardMult * (ok ? 1 : 0.5) + 50,
      xp: Math.round(ST.xpNeed(s.level) * ex.xp / 40 * (ok ? 1 : 0.5)) + 5,
      pearls: Math.random() < ex.pearls[0] ? U.rndi(ex.pearls[1], ex.pearls[2]) : 0,
      map: ex.map && Math.random() < ex.map ? 1 : 0,
      note: ex.note && Math.random() < ex.note ? 1 : 0,
    };
    s.expeditions.push(rec);
    VC.Audio.sfx('bell');
    UI.toast(`${ex.icon} Шлюпка ушла: ${ex.name}`);
    this.afterChange();
  };
  G.claimExpedition = function (i) {
    const s = this.s;
    const r = s.expeditions[i];
    if (!r || r.end > Date.now()) return;
    s.expeditions.splice(i, 1);
    const ex = VC.EXPEDITIONS.find(x => x.id === r.id);
    this.addGold(r.gold);
    this.addXp(r.xp);
    const loot = { gold: r.gold, xp: r.xp, extra: [] };
    if (r.pearls) loot.pearls = this.addPearls(r.pearls);
    if (r.map) { s.mapPieces++; loot.extra.push('🗺️ Кусок карты (' + s.mapPieces + '/3)'); }
    if (r.note) { const n = this.findNote(); if (n >= 0) loot.extra.push('📜 Записка Кремня №' + (n + 1)); }
    s.stats.expeditions++;
    UI.reward(r.ok ? `${ex.icon} ${ex.name}: успех!` : `${ex.icon} Шторм потрепал шлюпку`, loot, r.ok ? '🧭' : '🌧️', () => this.checkMapPieces());
    this.afterChange();
  };
  G.checkMapPieces = function () {
    if (this.s.mapPieces >= 3) {
      this.s.mapPieces -= 3;
      UI.toast('🗺️ Карта собрана! Ищем клад…', 'ach');
      setTimeout(() => VC.Events.treasureHunt(), 600);
    }
  };
  G.findNote = function () {
    const s = this.s;
    const left = [];
    for (let i = 0; i < VC.NOTES.length; i++) if (s.notes.indexOf(i) < 0) left.push(i);
    if (!left.length) return -1;
    // Notes come mostly in order so the story reads well.
    const n = Math.random() < 0.7 ? left[0] : U.pick(left);
    s.notes.push(n);
    s.stats.notes = s.notes.length;
    setTimeout(() => UI.modal({ title: '📜 Записка Кремня', html: `<p style="font-style:italic">${U.esc(VC.NOTES[n])}</p>`, buttons: [{ label: 'Сохранить в журнал', cls: 'green' }] }), 300);
    return n;
  };

  // ------------------------------------------------------------------ chapters & story
  G.chapter = function () {
    const m = VC.MISSIONS[this.s.story.idx];
    return m ? m.ch : 10;
  };
  G.mission = function () { return VC.MISSIONS[this.s.story.idx]; };
  G.tabUnlocked = function (tab) {
    const u = this.s.unlocked;
    return { island: u.island, ship: u.ship, map: u.map, captain: u.captain, shop: u.shop, duel: u.duel }[tab];
  };
  G.tabAttention = function (tab) {
    const s = this.s;
    const m = this.mission();
    if (tab === 'captain' && this.talentPoints() > 0) return true;
    if (tab === 'map' && s.expeditions.some(r => r.end <= Date.now())) return true;
    if (!m || s.story.phase !== 'goal') return false;
    const t = m.goal.t;
    if (tab === 'island' && t === 'build') return true;
    if (tab === 'ship' && (t === 'upg' || t === 'tier' || t === 'module')) return true;
    if (tab === 'map' && t === 'exped') return true;
    return false;
  };

  G.unlock = function (list) {
    for (const f of list || []) this.s.unlocked[f] = true;
    UI.refreshTabs();
  };

  G.startStory = function () {
    this.s.story = { idx: 0, phase: 'intro', base: null };
    this.resumeStory();
  };

  G.resumeStory = function () {
    const s = this.s;
    const m = this.mission();
    UI.refreshTabs();
    if (!m) return;
    if (s.story.phase === 'intro') {
      if (m.unlock) this.unlock(m.unlock);
      const ch = VC.CHAPTERS[m.ch];
      const firstOfChapter = !VC.MISSIONS[s.story.idx - 1] || VC.MISSIONS[s.story.idx - 1].ch !== m.ch;
      UI.dialogue(m.intro, { chapter: (firstOfChapter ? ch.title + ' · ' : '') + m.title, onDone: () => this.beginGoal() });
    } else if (s.story.phase === 'outro') {
      this.finishMission();
    }
  };

  G.goalBase = function (g) {
    const s = this.s;
    switch (g.t) {
      case 'taps': return s.stats.taps;
      case 'gold': return s.goldRun;
      case 'events': return s.stats.events;
      case 'exped': return s.stats.expeditions;
      default: return 0;
    }
  };

  G.beginGoal = function () {
    const s = this.s;
    const m = this.mission();
    s.story.phase = 'goal';
    s.story.base = this.goalBase(m.goal);
    s.story.base2 = m.goal.also ? this.goalBase(m.goal.also) : 0;
    if (m.goal.t === 'taps') document.getElementById('tap-hint').classList.remove('hidden');
    if (m.goal.t === 'choice') { this.showChoice(); return; }
    if (m.goal.t === 'battle' && s.story.idx < 6) setTimeout(() => this.storyGo(), 300);
    this.save();
  };

  /** Progress of a goal: {cur, need, done, text}. */
  G.goalProgress = function (g, base) {
    const s = this.s;
    const B = n => ST.BY_ID[n];
    switch (g.t) {
      case 'taps': { const c = s.stats.taps - base; return { cur: c, need: g.n, text: `Тапните ${Math.min(c, g.n)}/${g.n}` }; }
      case 'build': return { cur: s.buildings[g.id], need: g.n, text: g.n > 1 ? `${B(g.id).name}: ур. ${s.buildings[g.id]}/${g.n}` : `Постройте: ${B(g.id).name}` };
      case 'gold': { const c = s.goldRun - base; return { cur: c, need: g.n, text: `Заработайте 🪙 ${fmt(Math.min(c, g.n))}/${fmt(g.n)}` }; }
      case 'upg': { const u = VC.UPGRADES.find(x => x.id === g.id); return { cur: s.ship[g.id], need: g.n, text: `${u.name}: ур. ${s.ship[g.id]}/${g.n}` }; }
      case 'tier': return { cur: s.ship.tier, need: g.n, text: `Купите корабль: ${VC.SHIPS[g.n - 1].name}` };
      case 'module': { const m = ST.MOD_BY_ID[g.id]; const on = s.ship.deck.indexOf(g.id) >= 0; return { cur: on ? s.ship.modules[g.id] : 0, need: g.n, text: `Установите: ${m.name}` }; }
      case 'battle': { const e = VC.ENEMIES[g.enemy]; return { cur: 0, need: 1, text: `Бой: ${e.name} (ур. ${g.lvl})` }; }
      case 'level': return { cur: s.level, need: g.n, text: `Уровень капитана ${s.level}/${g.n}` };
      case 'events': { const c = s.stats.events - base; return { cur: c, need: g.n, text: `Морские события ${Math.min(c, g.n)}/${g.n}` }; }
      case 'exped': { const c = s.stats.expeditions - base; return { cur: c, need: g.n, text: `Экспедиции ${Math.min(c, g.n)}/${g.n}` }; }
      case 'choice': return { cur: 0, need: 1, text: 'Сделайте выбор' };
    }
    return { cur: 0, need: 1, text: '' };
  };

  G.updateObjective = function () {
    const s = this.s;
    const m = this.mission();
    if (!m) {
      UI.setObjective(s.unlocked.endless ? { icon: '🌊', title: 'Бездонные воды', text: 'Сюжет пройден! Рейды без конца ждут на карте', go: 'Карта' } : null);
      return;
    }
    if (s.story.phase !== 'goal') { UI.setObjective(null); return; }
    const p = this.goalProgress(m.goal, s.story.base);
    let done = p.cur >= p.need;
    let text = p.text;
    if (m.goal.also) {
      const p2 = this.goalProgress(m.goal.also, s.story.base2);
      done = done && p2.cur >= p2.need;
      text = p.text + ' · ' + p2.text;
    }
    const goMap = { build: 'Остров', upg: 'Корабль', tier: 'Корабль', module: 'Корабль', battle: 'В бой!', level: 'Рейды', exped: 'Карта', choice: 'Выбор' };
    UI.setObjective({
      icon: m.goal.t === 'battle' ? '⚔️' : '📜', title: `${VC.CHAPTERS[m.ch].title.split('.')[0]} · ${m.title}`, text,
      progress: m.goal.t === 'battle' || m.goal.t === 'choice' ? undefined : Math.min(1, p.cur / p.need), go: goMap[m.goal.t], done,
    });
    if (done && m.goal.t !== 'battle' && m.goal.t !== 'choice') this.completeGoal();
  };

  G.storyGo = function () {
    const m = this.mission();
    const s = this.s;
    if (!m) { if (s.unlocked.endless) UI.openPanel('map'); return; }
    if (s.story.phase !== 'goal') return;
    const t = m.goal.t;
    if (t === 'battle') {
      const reg = VC.REGIONS[VC.CHAPTERS[m.ch].region];
      VC.Battle.begin({ kind: 'story', enemy: m.goal.enemy, level: m.goal.lvl, region: reg, tutorial: s.story.idx <= 5 });
    } else if (t === 'build') UI.openPanel('island', 'list');
    else if (t === 'upg' || t === 'tier' || t === 'module') UI.openPanel('ship');
    else if (t === 'level') UI.openPanel('map', 'chart');
    else if (t === 'exped') UI.openPanel('map', 'exp');
    else if (t === 'choice') this.showChoice();
    else if (t === 'taps' || t === 'gold') { UI.closePanel(); document.getElementById('tap-hint').classList.remove('hidden'); }
    else if (t === 'events') UI.toast('🌊 Следите за морем: попугаи, бутылки, крабы и торговцы появляются сами');
  };

  G.onStoryBattleWon = function () {
    const m = this.mission();
    if (m && m.goal.t === 'battle' && this.s.story.phase === 'goal') this.completeGoal();
  };

  G.completeGoal = function () {
    const s = this.s;
    if (s.story.phase !== 'goal') return;
    s.story.phase = 'outro';
    document.getElementById('tap-hint').classList.add('hidden');
    this.save();
    setTimeout(() => this.finishMission(), 350);
  };

  G.finishMission = function () {
    const s = this.s;
    const m = this.mission();
    if (!m || UI.inDialogue()) { if (m) setTimeout(() => this.finishMission(), 500); return; }
    let outro = m.outro;
    if (m.choices && s.story.choice) {
      const c = m.choices.find(x => x.id === s.story.choice);
      outro = c.outro.concat(m.outro);
    }
    UI.dialogue(outro, {
      chapter: m.title,
      onDone: () => {
        if (m.nameShip) {
          UI.prompt('Имя корабля', 'Как назовём шлюп?', s.shipName, v => {
            s.shipName = v;
            this.grantMission(m);
          }, 18);
        } else this.grantMission(m);
      },
    });
  };

  G.grantMission = function (m) {
    const s = this.s;
    const r = m.reward;
    const loot = { extra: [] };
    if (r.gold) { const g = Math.min(r.gold, Math.max(ST.incomeFor(900), r.gold * 0.25)); this.addGold(g); loot.gold = g; }
    if (r.pearls) loot.pearls = this.addPearls(r.pearls);
    if (r.xp) { this.addXp(r.xp); loot.xp = r.xp; }
    if (r.officer && s.officers.indexOf(r.officer) < 0) {
      s.officers.push(r.officer);
      const o = ST.OFF_BY_ID[r.officer];
      const free = s.abilities.indexOf(null);
      if (free >= 0) s.abilities[free] = r.officer;
      loot.extra.push(`${o.icon} В команде: ${o.name}`);
    }
    if (r.shard && s.shards.indexOf(r.shard) < 0) {
      s.shards.push(r.shard);
      s.stats.shards = s.shards.length;
      loot.extra.push(`💠 ${VC.SHARDS[r.shard - 1].name}`);
    }
    if (r.skin) { if (s.skins.owned.indexOf(r.skin) < 0) s.skins.owned.push(r.skin); loot.extra.push('🎨 Призрачные паруса'); }
    if (r.unlock) {
      this.unlock(r.unlock);
      const names = { ship: '⛵ Корабль', map: '🗺️ Карта морей', captain: '🏴‍☠️ Капитан', shop: '🛒 Лавка', expeditions: '🧭 Экспедиции', duel: '⚔️ Дуэли', legend: '🌟 Легенда', endless: '🌊 Бездонные воды' };
      for (const u of r.unlock) if (names[u]) loot.extra.push('Открыто: ' + names[u]);
    }
    if (m.choices && s.story.choice) s.legendChoice = s.story.choice;
    s.story.idx++;
    s.story.phase = 'intro';
    s.story.base = null;
    s.story.choice = null;
    ST.recompute(s);
    if (r.unlock && r.unlock.indexOf('ship') >= 0) VC.Scene.refreshPlayerShip(s);
    VC.Audio.sfx('win');
    this.save();
    UI.reward('Задание выполнено!', loot, '📜', () => setTimeout(() => this.resumeStory(), 250));
    this.afterChange();
  };

  G.showChoice = function () {
    const m = this.mission();
    UI.modal({
      title: 'Сердце Моря', icon: '💠', noClose: true,
      html: m.choices.map(c => `<p><b>${c.label}</b><br><span class="mini">${c.desc}</span></p>`).join(''),
      buttons: m.choices.map(c => ({ label: c.label, cls: c.id === 'crown' ? '' : 'blue', fn: () => {
        this.s.story.choice = c.id;
        this.completeGoal();
      } })),
    });
  };

  // ------------------------------------------------------------------ battles
  G.raidLevel = function (rid) {
    const r = VC.REGIONS[rid];
    return Math.max(r.min, this.s.raids[rid] || r.min);
  };
  G.regionOpen = function (rid) {
    const s = this.s;
    if (rid === 11) return !!s.unlocked.endless;
    if (!s.unlocked.map) return false;
    const m = this.mission();
    const cur = m ? VC.CHAPTERS[m.ch].region : 10;
    return rid <= Math.max(cur, 1);
  };
  G.startRaid = function (rid, lvl) {
    const s = this.s;
    if (s.ship.hp < 0.3) {
      UI.confirm('Корабль повреждён', `Корпус цел на ${Math.round(s.ship.hp * 100)}%. Починить за 🪙 ${fmt(this.repairCost())}?`, 'Починить', () => { this.repair(); });
      return;
    }
    const r = VC.REGIONS[rid];
    const enemy = U.pick(r.enemies);
    VC.Battle.begin({ kind: 'raid', enemy, level: lvl || this.raidLevel(rid), region: r });
  };

  /** Called by battle.js with the outcome of a PvE fight. */
  G.onBattleEnd = function (o) {
    const s = this.s;
    s.ship.hp = Math.max(0.05, o.hpFrac);
    if (o.win) {
      s.stats.wins++;
      if (o.boss) s.stats.bosses++;
      if (o.reason === 'board') s.stats.boardings++;
      if (o.kind === 'raid') {
        const r = o.region;
        if (o.level >= this.raidLevel(r.id)) s.raids[r.id] = r.endless ? o.level + 1 : Math.min(r.max, o.level + 1);
        if (r.endless) s.stats.endless = Math.max(s.stats.endless, o.level - r.min + 1);
      }
    } else s.stats.losses++;
    ST.recompute(s);
    this.save();
    this.afterChange();
  };

  // ------------------------------------------------------------------ legend (prestige)
  G.slavaGain = function () {
    return Math.floor(3 * Math.cbrt(this.s.goldRun / 1e9));
  };
  G.legendReset = function () {
    const s = this.s;
    const gain = this.slavaGain();
    if (gain < 1) { UI.toast('Слишком рано: заработайте больше золота в этом пути', 'bad'); return; }
    UI.confirm('Стать легендой?', `Вы получите <b>${gain} Славы</b> (+${gain * 5}% дохода, +${gain}% к бою навсегда).<br><br>Сбросятся: золото, уровни построек, улучшения и модули корабля.<br>Останутся: сюжет, корабль, участки, таланты, офицеры, осколки, жемчуг, скины.`, 'Стать легендой', () => {
      s.slava += gain;
      s.gold = 0; s.goldRun = 0;
      for (const k in s.buildings) s.buildings[k] = 0;
      for (const k in s.ship.modules) s.ship.modules[k] = 0;
      s.ship.deck = s.ship.deck.map(() => null);
      s.ship.hull = s.ship.guns = s.ship.sails = s.ship.crew = 0;
      s.ship.hp = 1;
      s.boosts = [];
      s.stats.prestiges++;
      ST.recompute(s);
      VC.Scene.refreshBuildings(s);
      VC.Audio.sfx('win');
      UI.closePanel();
      UI.modal({ title: '🌟 Легенда растёт', icon: '🌟', html: `<p>Слава: <b>${s.slava}</b></p><p>Море запомнит имя капитана ${U.esc(s.name)}.</p>`, buttons: [{ label: 'В путь!', cls: 'green' }] });
      this.save();
      this.afterChange();
    });
  };

  // ------------------------------------------------------------------ daily
  G.dailyCheck = function () {
    const s = this.s;
    const today = U.dayKey();
    if (s.daily.day === today) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    s.daily.streak = s.daily.day === U.dayKey(y.getTime()) ? s.daily.streak + 1 : 0;
    s.daily.day = today;
    s.daily.loginClaimed = false;
    s.daily.bonus = false;
    const pool = VC.DAILY_QUESTS.filter(q => (q.stat !== 'expeditions' || s.unlocked.expeditions) && (q.stat !== 'duels' || s.unlocked.duel) && (q.stat !== 'wins' || s.unlocked.map));
    const picked = [];
    while (picked.length < 3 && pool.length) picked.push(pool.splice(U.rndi(0, pool.length - 1), 1)[0]);
    s.daily.quests = picked.map((q, i) => ({ id: q.id, stat: q.stat, n: q.n[Math.min(2, i)], base: s.stats[q.stat] || 0, claimed: false }));
  };
  G.claimLogin = function () {
    const s = this.s;
    if (s.daily.loginClaimed) return;
    const day = s.daily.streak % 7;
    const r = VC.DAILY_LOGIN[day];
    s.daily.loginClaimed = true;
    const loot = { extra: [] };
    if (r.pearls) loot.pearls = this.addPearls(r.pearls, false);
    if (r.mins) { loot.gold = ST.incomeFor(r.mins * 60) + 100; this.addGold(loot.gold); }
    if (r.boost) { this.addBoost(ST.SHOP_BY_ID[r.boost].boost); loot.extra.push('🌬️ ×2 доход на 30 мин'); }
    if (r.chest) { this.openChest(r.chest); return; }
    UI.reward(`Награда дня ${day + 1}`, loot, '🎁');
    this.afterChange();
  };
  G.questProgress = function (q) { return Math.min(q.n, (this.s.stats[q.stat] || 0) - q.base); };
  G.claimQuest = function (i) {
    const s = this.s;
    const q = s.daily.quests[i];
    if (!q || q.claimed || this.questProgress(q) < q.n) return;
    q.claimed = true;
    const loot = { pearls: this.addPearls(8, false), gold: ST.incomeFor(600) + 100 };
    this.addGold(loot.gold);
    if (!s.daily.bonus && s.daily.quests.every(x => x.claimed)) {
      s.daily.bonus = true;
      loot.pearls += this.addPearls(15, false);
      loot.extra = ['🏆 Бонус за все задания!'];
    }
    UI.reward('Задание дня выполнено', loot, '📋');
    this.afterChange();
  };

  // ------------------------------------------------------------------ achievements
  G.checkAchievements = function () {
    const s = this.s;
    s.stats.level = s.level;
    s.stats.shipTier = s.ship.tier;
    s.stats.pvpWins = s.pvp.wins;
    for (const a of VC.ACHIEVEMENTS) {
      if (s.achievements[a.id]) continue;
      if ((s.stats[a.stat] || 0) >= a.n) {
        s.achievements[a.id] = Date.now();
        const p = this.addPearls(a.pearls, false);
        UI.toast(`🏆 Достижение: «${a.name}» +${p} 💎, +1% дохода`, 'ach');
        VC.Audio.sfx('bell');
        ST.recompute(s);
      }
    }
  };

  // ------------------------------------------------------------------ actions (from data-act)
  G.action = function (act, d) {
    const [name, arg] = act.split(':');
    switch (name) {
      case 'tab': UI.openPanel(arg); break;
      case 'close': UI.closePanel(); break;
      case 'settings': VC.Panels.settings(); break;
      case 'objective': this.storyGo(); break;
      case 'daily': VC.Panels.daily(); break;
      case 'quests': VC.Panels.quests(); break;
      case 'buildmode': UI.openPanel('island', 'layout'); break;
      case 'buyB': this.buyBuilding(d.id, this.buyMult); break;
      case 'buyMult': this.buyMult = d.v === 'max' ? 'max' : +d.v; UI.renderPanel(); break;
      case 'buyPlot': this.buyPlot(); break;
      case 'upg': this.buyUpgrade(d.id); break;
      case 'tier': this.buyTier(); break;
      case 'mod': this.buyModule(d.id); break;
      case 'modToggle': this.toggleModule(d.id); break;
      case 'repair': this.repair(); break;
      case 'renameShip': UI.prompt('Имя корабля', 'Новое имя:', this.s.shipName, v => { this.s.shipName = v; this.afterChange(); }, 18); break;
      case 'talent': this.learnTalent(d.id); break;
      case 'resetTalents': this.resetTalents(); break;
      case 'equip': this.equipAbility(d.id); break;
      case 'shop': this.buyShop(d.id); break;
      case 'gshop': this.buyGoldShop(d.id); break;
      case 'skin': this.buySkin(d.kind, d.id); break;
      case 'exp': this.startExpedition(d.id); break;
      case 'expClaim': this.claimExpedition(+d.i); break;
      case 'raid': this.startRaid(+d.r, +d.l); break;
      case 'story': this.storyGo(); break;
      case 'legend': this.legendReset(); break;
      case 'login': this.claimLogin(); break;
      case 'quest': this.claimQuest(+d.i); break;
      case 'region': VC.Panels.map.select(+d.r); break;
      case 'raidLvl': VC.Panels.map.step(+d.v); break;
      case 'replay': VC.Panels.replay(+d.i); break;
      case 'note': VC.Panels.showNote(+d.i); break;
      default:
        if (VC.Duel.action(name, arg, d)) return;
        console.warn('unknown action', act);
    }
  };

  G.afterChange = function () {
    UI.renderPanel();
    UI.refreshTabs();
    this.updateObjective();
  };

  G.onPanel = function (tab) {
    VC.Scene.buildMode = tab === 'island' && UI.sub.island === 'layout';
    if (VC.Scene.buildMode) VC.Panels.island.highlight();
    else VC.Scene.highlightPlots(null);
    document.getElementById('btn-build').classList.toggle('hidden', !this.s.unlocked.island || this.s.plots < 3);
  };

  G.onBack = function () {
    if (UI.inDialogue()) { UI.advanceDialogue(); return true; }
    if (UI.closeTopModal()) return true;
    if (VC.Battle.active) { VC.Battle.askFlee(); return true; }
    if (UI.closePanel()) return true;
    return false;
  };

  G.save = function () { if (this.s) ST.save(this.s); };

  // ------------------------------------------------------------------ main loop
  G.frame = function (now) {
    requestAnimationFrame(t => this.frame(t));
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // Frames stop while the app is in the background; pay that time as offline income.
    const wall = Date.now();
    if (this.lastWall && wall - this.lastWall > 60000 && this.ready) this.offlineReturn((wall - this.lastWall) / 1000);
    this.lastWall = wall;
    if (this.paused) return;
    const speed = this.s.settings.tester ? (this.s.settings.speed || 1) : 1;
    this.tick(dt * speed, dt);
    VC.Scene.update(dt);
  };

  G.tick = function (dt, realDt) {
    const s = this.s;
    const D = VC.D;
    const storm = VC.Events.storm && !(s.buildings.light > 0) ? 0.5 : 1;
    this.addGold(D.income * dt * storm);
    // auto taps from the cabin boy
    if (D.autoTaps > 0) {
      this.autoTapAcc += D.autoTaps * dt;
      if (this.autoTapAcc >= 1) {
        const n = Math.floor(this.autoTapAcc);
        this.autoTapAcc -= n;
        for (let i = 0; i < Math.min(n, 20); i++) this.tap(0, 0, true);
        if (VC.Scene.chest && !VC.Battle.active && Math.random() < 0.5) {
          const p = VC.Scene.project(VC.Scene.chest.position);
          VC.Scene.burst([VC.Scene.chest.position.x, 0.9, VC.Scene.chest.position.z], 2, { color: ['#ffd23f'], speed: 2, up: 1.5, size: 0.1, life: 0.6 });
        }
      }
    }
    // frenzy decay
    if (performance.now() - this.lastTap > 1200 && this.frenzy > 0) this.frenzy = Math.max(0, this.frenzy - 10 * realDt);
    if (s._frenzyUntil && s._frenzyUntil < Date.now() && D.frenzyMult > 1) ST.recompute(s);
    // ship repairs itself in the dock
    if (!VC.Battle.active && s.ship.hp < 1) s.ship.hp = Math.min(1, s.ship.hp + D.combat.regen * dt);
    VC.Battle.update(realDt);
    VC.Events.update(dt, realDt);
    VC.Duel.update(realDt);
    s.stats.playTime += realDt;

    this.hudT -= realDt;
    if (this.hudT <= 0) { this.hudT = 0.1; UI.updateHud(); }
    this.panelT -= realDt;
    if (this.panelT <= 0) { this.panelT = 0.5; UI.refreshPanel(); }
    this.storyT -= realDt;
    if (this.storyT <= 0) {
      this.storyT = 0.5;
      this.updateObjective();
      // boosts expiring
      const before = s.boosts.length;
      s.boosts = s.boosts.filter(b => b.until > Date.now());
      if (s.boosts.length !== before) ST.recompute(s);
      document.querySelector('#btn-daily .dot').classList.toggle('hidden', s.daily.loginClaimed);
      const qReady = s.daily.quests.some(q => !q.claimed && this.questProgress(q) >= q.n);
      document.querySelector('#btn-quests .dot').classList.toggle('hidden', !qReady);
    }
    this.achT -= realDt;
    if (this.achT <= 0) { this.achT = 2; this.checkAchievements(); UI.refreshTabs(); ST.recompute(s); }
    this.minuteT -= realDt;
    if (this.minuteT <= 0) { this.minuteT = 60; this.dailyCheck(); }
    this.saveT -= realDt;
    if (this.saveT <= 0) { this.saveT = 10; this.save(); }
  };

  // Android lifecycle hooks (called from MainActivity) and browser equivalents.
  VC.onBack = () => G.onBack();
  VC.onPause = () => { G.save(); VC.Audio.suspend(); };
  VC.onResume = () => { VC.Audio.resume(); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { G.save(); VC.Audio.suspend(); } else VC.Audio.resume();
  });
  window.addEventListener('pagehide', () => G.save());

  window.addEventListener('load', () => {
    try { G.boot(); } catch (e) {
      console.error(e);
      const m = document.getElementById('load-msg');
      if (m) m.textContent = 'Ошибка запуска: ' + e.message;
    }
  });
})(window.VC);
