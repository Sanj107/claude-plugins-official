'use strict';
// Game state, persistence and every derived number (income, tap power, ship stats).
(function (VC) {
  const U = VC.util;
  const SAVE_KEY = 'vc_save_v1';

  function defaultState() {
    const buildings = {};
    for (const b of VC.BUILDINGS) buildings[b.id] = 0;
    const modules = {};
    for (const m of VC.MODULES) modules[m.id] = 0;
    const talents = {};
    for (const t of VC.TALENTS) talents[t.id] = 0;
    return {
      v: 1,
      created: Date.now(),
      lastSave: Date.now(),
      name: '',
      avatar: '🏴‍☠️',
      shipName: 'Ласточка',
      gold: 0,
      pearls: 0,
      xp: 0,
      level: 1,
      goldRun: 0, // earned since the last Legend reset
      stats: {
        taps: 0, goldEarned: 0, wins: 0, losses: 0, boardings: 0, bosses: 0, buildingLevels: 0,
        shipLevels: 0, parrots: 0, events: 0, expeditions: 0, notes: 0, pvpWins: 0, pvpLosses: 0,
        duels: 0, frenzies: 0, prestiges: 0, endless: 0, shards: 0, shipTier: 1, level: 1, playTime: 0,
      },
      buildings,
      layout: {}, // plot index -> building id
      plots: 2,
      ship: { tier: 1, hull: 0, guns: 0, sails: 0, crew: 0, hp: 1, deck: [null, null], modules },
      skins: { owned: ['sail:white', 'flag:roger', 'hull:oak'], sail: 'white', flag: 'roger', hull: 'oak' },
      talents,
      officers: ['piastr'],
      abilities: ['piastr', null, null],
      shards: [],
      story: { idx: 0, phase: 'intro', base: null, choice: null },
      unlocked: {},
      raids: {}, // region id -> next raid level
      boosts: [], // {id, mult, until}
      perms: {},
      expeditions: [], // {slot, id, start, end, gold, xp, pearls, ok, note, map}
      daily: { day: '', streak: 0, loginClaimed: false, quests: [], bonus: false },
      notes: [],
      mapPieces: 0,
      achievements: {},
      slava: 0,
      legendChoice: null,
      pvp: { rating: 1000, wins: 0, losses: 0, history: [] },
      settings: { sound: true, music: true, vibro: true, quality: 'auto', tester: false, speed: 1 },
      seenTips: {},
    };
  }

  // Fill in fields added in later versions so old saves keep working.
  function migrate(s) {
    const d = defaultState();
    for (const k in d) {
      if (s[k] === undefined) s[k] = d[k];
      else if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) {
        for (const k2 in d[k]) if (s[k][k2] === undefined) s[k][k2] = d[k][k2];
      }
    }
    for (const m of VC.MODULES) if (s.ship.modules[m.id] === undefined) s.ship.modules[m.id] = 0;
    for (const b of VC.BUILDINGS) if (s.buildings[b.id] === undefined) s.buildings[b.id] = 0;
    for (const t of VC.TALENTS) if (s.talents[t.id] === undefined) s.talents[t.id] = 0;
    const slots = VC.SHIPS[s.ship.tier - 1].slots;
    while (s.ship.deck.length < slots) s.ship.deck.push(null);
    return s;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* storage blocked */ }
    if (!raw && window.AndroidBridge && AndroidBridge.loadBackup) {
      try { raw = AndroidBridge.loadBackup(); } catch (e) { /* no backup */ }
    }
    if (raw) {
      try { return migrate(JSON.parse(raw)); } catch (e) { console.warn('bad save', e); }
    }
    return null;
  }

  function save(s) {
    s.lastSave = Date.now();
    const raw = JSON.stringify(s);
    try { localStorage.setItem(SAVE_KEY, raw); } catch (e) { /* storage blocked */ }
    if (window.AndroidBridge && AndroidBridge.saveBackup) {
      try { AndroidBridge.saveBackup(raw); } catch (e) { /* ignore */ }
    }
  }

  function wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    if (window.AndroidBridge && AndroidBridge.saveBackup) AndroidBridge.saveBackup('');
  }

  // ------------------------------------------------------------------ lookups
  const BY_ID = {};
  for (const b of VC.BUILDINGS) BY_ID[b.id] = b;
  const MOD_BY_ID = {};
  for (const m of VC.MODULES) MOD_BY_ID[m.id] = m;
  const OFF_BY_ID = {};
  for (const o of VC.OFFICERS) OFF_BY_ID[o.id] = o;
  const SHOP_BY_ID = {};
  for (const it of VC.SHOP) SHOP_BY_ID[it.id] = it;

  function milestoneMult(level) {
    let m = 1;
    for (const ms of VC.MILESTONES) if (level >= ms) m *= 2; else break;
    return m;
  }
  function nextMilestone(level) {
    for (const ms of VC.MILESTONES) if (level < ms) return ms;
    return null;
  }

  function boostMult(s, id) {
    let m = 1;
    const t = Date.now();
    for (const b of s.boosts) if (b.id === id && b.until > t) m *= b.mult;
    return m;
  }

  function hasOfficer(s, id) { return s.officers.indexOf(id) >= 0; }
  function hasShard(s, n) { return s.shards.indexOf(n) >= 0; }
  function moduleLevel(s, id) {
    return s.ship.deck.indexOf(id) >= 0 ? s.ship.modules[id] : 0;
  }
  function modVal(s, id) {
    const l = moduleLevel(s, id);
    return l > 0 ? MOD_BY_ID[id].val(l) : 0;
  }

  // ------------------------------------------------------------------ island layout
  function plotInfo(i) {
    const p = VC.PLOTS[i];
    return { r: p.r, c: p.c, type: p.r === 3 ? 'shore' : 'land' };
  }
  function plotOf(s, bid) {
    for (const k in s.layout) if (s.layout[k] === bid) return +k;
    return -1;
  }
  function neighbors(i) {
    const a = VC.PLOTS[i];
    const out = [];
    VC.PLOTS.forEach((p, j) => {
      if (j !== i && Math.abs(p.r - a.r) <= 1 && Math.abs(p.c - a.c) <= 1) out.push(j);
    });
    return out;
  }
  /** Synergy multiplier of a placed building from its neighbours. */
  function synergy(s, bid) {
    const pi = plotOf(s, bid);
    if (pi < 0) return { mult: 1, parts: [] };
    let bonus = 0;
    const parts = [];
    const b = BY_ID[bid];
    let count = 0;
    for (const nj of neighbors(pi)) {
      if (nj >= s.plots) continue;
      const other = s.layout[nj];
      if (!other || s.buildings[other] <= 0) continue;
      count++;
      for (const [x, y, v] of VC.SYNERGIES) {
        if ((x === bid && y === other) || (y === bid && x === other)) {
          bonus += v;
          parts.push({ with: other, v });
        }
      }
      const ob = BY_ID[other];
      if (ob.aura) {
        bonus += ob.aura;
        parts.push({ with: other, v: ob.aura });
      }
    }
    if (b.perNeighbor && count) {
      bonus += b.perNeighbor * count;
      parts.push({ with: 'neighbors', v: b.perNeighbor * count });
    }
    return { mult: 1 + bonus, parts };
  }
  /** Best free plot for a building: allowed terrain, maximal synergy. */
  function bestPlot(s, bid) {
    const b = BY_ID[bid];
    let best = -1, bestScore = -1;
    for (let i = 0; i < s.plots; i++) {
      if (s.layout[i]) continue;
      if (plotInfo(i).type !== b.plot) continue;
      // Score by synergies with existing neighbours.
      let score = 0;
      for (const nj of neighbors(i)) {
        const other = nj < s.plots ? s.layout[nj] : null;
        if (!other) continue;
        score += 0.01;
        for (const [x, y, v] of VC.SYNERGIES) if ((x === bid && y === other) || (y === bid && x === other)) score += v;
        if (BY_ID[other].aura) score += BY_ID[other].aura;
      }
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  // ------------------------------------------------------------------ derived numbers
  const D = {};
  VC.D = D;

  function recompute(s) {
    const T = s.talents;
    const lvlMult = 1 + 0.02 * (s.level - 1);
    const achCount = Object.keys(s.achievements).length;
    let global = lvlMult * (1 + 0.1 * T.trade) * (1 + modVal(s, 'hold') / 100) *
      (1 + 0.1 * s.slava) * (1 + VC.ACH_BONUS * achCount);
    if (hasShard(s, 1)) global *= 1.1;
    if (hasShard(s, 6)) global *= 1.25;
    if (s.perms.perm_letter) global *= 1.25;
    if (hasOfficer(s, 'flint')) global *= 1.2;
    if (s.legendChoice === 'crown') global *= 1.5;
    if (s.legendChoice === 'free') global *= 1.3;
    const incomeBoost = boostMult(s, 'income');
    D.globalMult = global * incomeBoost;
    D.incomeBoost = incomeBoost;

    let total = 0;
    D.bIncome = {};
    D.bSyn = {};
    for (const b of VC.BUILDINGS) {
      const l = s.buildings[b.id];
      if (l <= 0) { D.bIncome[b.id] = 0; continue; }
      const syn = synergy(s, b.id);
      D.bSyn[b.id] = syn;
      const placed = plotOf(s, b.id) >= 0 ? 1 : 0;
      const inc = b.inc * l * milestoneMult(l) * syn.mult * D.globalMult * placed;
      D.bIncome[b.id] = inc;
      total += inc;
    }
    const netsL = moduleLevel(s, 'nets');
    D.netsIncome = netsL > 0 ? 0.8 * netsL * milestoneMult(netsL) * D.globalMult : 0;
    total += D.netsIncome;
    D.income = total;

    // Taps
    D.frenzyMult = s._frenzyUntil && s._frenzyUntil > Date.now() ? 5 : 1;
    D.tapBase = s.level * (1 + 0.25 * T.greed) * (1 + modVal(s, 'rum') / 100) * boostMult(s, 'tap') *
      (1 + 0.1 * s.slava);
    D.tapIncomeShare = 0.01 + 0.005 * T.banker;
    D.tapPower = (D.tapBase + D.income * D.tapIncomeShare) * D.frenzyMult;
    D.tapCrit = Math.min(0.5, 0.02 * T.midas + Math.min(0.25, 0.005 * moduleLevel(s, 'rum')));
    D.autoTaps = modVal(s, 'boy') + (s.perms.perm_boy ? 2 : 0);
    D.pearlTapChance = modVal(s, 'alchemy') / 100;

    // Offline
    const bankHours = Math.min(10, Math.floor(s.buildings.bank / 10));
    D.offlineCap = (2 + T.smuggle + (s.perms.perm_cap ? 3 : 0) + bankHours) * 3600;
    D.offlineRate = Math.min(1, 0.5 + 0.1 * T.smuggle);

    // Events
    D.eventFreq = (1 + 0.08 * T.luck) * (1 + modVal(s, 'figure') / 100) * (s.buildings.light > 0 ? 1.15 : 1);
    D.eventReward = (1 + 0.1 * T.luck) * (1 + Math.min(60, 2 * moduleLevel(s, 'figure')) / 100) *
      (hasOfficer(s, 'piastr') ? 1.1 : 1);
    D.pearlMult = (hasOfficer(s, 'lorelei') ? 1.15 : 1) * (hasShard(s, 5) ? 1.1 : 1) *
      (s.legendChoice === 'free' ? 1.25 : 1);
    D.templePearl = Math.floor(s.buildings.temple / 10) * 0.01;

    // Expeditions
    D.expSlots = 1 + (hasOfficer(s, 'mira') ? 1 : 0) + (hasShard(s, 5) ? 1 : 0) + (s.perms.perm_slot ? 1 : 0);
    D.expTimeMult = Math.max(0.3, (1 - 0.08 * T.carto) * (hasOfficer(s, 'mira') ? 0.9 : 1) *
      (1 - Math.min(0.3, s.ship.sails * 0.002)));
    D.expRewardMult = 1 + 0.1 * T.carto;

    // Ship costs
    D.yardDiscount = Math.min(0.4, Math.floor(s.buildings.yard / 10) * 0.02);
    D.buildDiscount = 0.03 * T.haggle;

    D.combat = combatStats(s, null);
    D.power = powerOf(D.combat);
    return D;
  }

  /** Battle stats of the player's ship. equal: override ship levels (PvP "equal" mode). */
  function combatStats(s, equal) {
    const T = s.talents;
    const sh = equal || s.ship;
    const tier = VC.SHIPS[(equal ? equal.tier : s.ship.tier) - 1];
    const legendC = 1 + 0.03 * s.slava;
    let hpM = (1 + 0.1 * T.tough) * (1 + modVal(s, 'armor') / 100) * legendC;
    let dmgM = (1 + 0.1 * T.heavy) * (1 + modVal(s, 'powder') / 100) * legendC * boostMult(s, 'battle');
    if (hasShard(s, 4)) hpM *= 1.2;
    if (hasShard(s, 3)) dmgM *= 1.15;
    if (hasShard(s, 7)) { hpM *= 1.25; dmgM *= 1.25; }
    if (hasOfficer(s, 'olga')) dmgM *= 1.15;
    if (hasOfficer(s, 'flint')) { hpM *= 1.2; dmgM *= 1.2; }
    if (s.legendChoice === 'free') { hpM *= 1.3; dmgM *= 1.3; }
    if (equal) { hpM = 1; dmgM = 1; }
    const hp = tier.hp * Math.pow(1.08, sh.hull) * hpM;
    const crew = tier.crew * Math.pow(1.07, sh.crew) * (1 + (equal ? 0 : modVal(s, 'galley')) / 100);
    const st = {
      name: s.shipName,
      tier: tier.tier,
      hp, maxHp: hp,
      volley: tier.guns * tier.gunDmg * Math.pow(1.08, sh.guns) * dmgM,
      guns: tier.guns,
      reload: Math.max(1.2, tier.reload * Math.pow(0.99, sh.crew) * (1 - 0.04 * (equal ? 0 : T.reload))),
      crew, maxCrew: crew,
      sails: tier.sails * Math.pow(1.06, sh.sails), maxSails: 0,
      eva: Math.min(0.5, tier.eva + 0.003 * sh.sails + (equal ? 0 : 0.02 * T.wind + (hasShard(s, 2) ? 0.05 : 0))),
      acc: Math.min(0.97, 0.75 + (equal ? 0 : 0.03 * T.aim + Math.min(0.15, 0.005 * moduleLevel(s, 'spyglass')))),
      crit: equal ? 0.05 : 0.05 + 0.04 * T.crit,
      armor: equal ? 0 : Math.min(0.3, 0.005 * moduleLevel(s, 'armor')),
      board: (equal ? 1 : (1 + 0.15 * T.boarder) * (hasOfficer(s, 'jacques') ? 1.3 : 1)),
      tapBoost: 0.05 + (equal ? 0 : 0.01 * T.drill),
      chainMult: 1 + (equal ? 0 : 0.12 * T.chain),
      fireAmmo: hasOfficer(s, 'olga'),
      abilities: s.abilities.filter(Boolean).map(id => OFF_BY_ID[id].abil.id),
      skin: { sail: s.skins.sail, flag: s.skins.flag, hull: s.skins.hull },
    };
    st.maxSails = st.sails;
    st.lootMult = 1 + modVal(s, 'spyglass') / 100;
    st.regen = 0.01 * (1 + 0.4 * T.carpenter) * (hasOfficer(s, 'bochka') ? 1.5 : 1) *
      (1 + Math.min(300, 10 * moduleLevel(s, 'galley')) / 100) * (s.perms.perm_regen ? 2 : 1);
    return st;
  }

  const G = 1.276;
  function enemyStats(id, L) {
    const e = VC.ENEMIES[id];
    const k = Math.pow(G, L);
    const hp = 50 * k * e.hp;
    const crew = e.crew > 0 ? 20 * Math.pow(1.2, L) * e.crew : 0;
    return {
      id, name: e.name, icon: e.icon, boss: !!e.boss, level: L,
      hp, maxHp: hp,
      volley: 4 * k * e.dmg,
      guns: e.model.kind === 'ship' ? Math.max(4, Math.min(48, 4 + Math.floor(L / 2))) : 0,
      reload: e.reload,
      crew, maxCrew: crew,
      sails: hp * 0.6, maxSails: hp * 0.6,
      eva: e.eva, acc: 0.72, crit: 0.05, armor: 0,
      board: 1, tapBoost: 0, chainMult: 1,
      abil: e.abil || [],
      model: e.model,
      creature: e.model.kind !== 'ship',
    };
  }
  function enemyLoot(id, L) {
    const e = VC.ENEMIES[id];
    const gold = 12 * Math.pow(1.46, L) * (e.loot || 1) * (e.boss ? 4 : 1);
    const xp = Math.round((8 + 4 * Math.pow(L, 1.55)) * (e.boss ? 3 : 1));
    return { gold, xp };
  }
  function powerOf(st) {
    const dps = st.volley * st.acc / st.reload;
    return Math.sqrt(dps * st.hp) * 2;
  }

  // ------------------------------------------------------------------ costs
  function buildingCost(s, bid, n) {
    const b = BY_ID[bid];
    const l = s.buildings[bid];
    const r = 1.15;
    const first = b.cost * Math.pow(r, l) * (1 - D.buildDiscount);
    if (!n || n === 1) return first;
    return first * (Math.pow(r, n) - 1) / (r - 1);
  }
  function maxAffordable(s, bid) {
    const b = BY_ID[bid];
    const first = b.cost * Math.pow(1.15, s.buildings[bid]) * (1 - D.buildDiscount);
    if (s.gold < first) return 0;
    return Math.floor(Math.log(s.gold * 0.15 / first + 1) / Math.log(1.15));
  }
  function upgradeCost(s, uid) {
    const u = VC.UPGRADES.find(x => x.id === uid);
    return u.cost * Math.pow(1.27, s.ship[uid]) * (1 - D.yardDiscount);
  }
  function moduleCost(s, mid) {
    const m = MOD_BY_ID[mid];
    return m.cost * Math.pow(m.grow, s.ship.modules[mid]) * (1 - D.yardDiscount * 0.5);
  }
  function xpNeed(level) {
    return Math.floor(20 * Math.pow(level, 1.6) + 30);
  }

  /** Gold over `sec` seconds at the current income (used by chests, warps, rewards). */
  function incomeFor(sec) {
    return Math.max(D.income, 1) * sec;
  }

  VC.State = {
    SAVE_KEY, defaultState, migrate, load, save, wipe, recompute, combatStats, enemyStats, enemyLoot, powerOf,
    buildingCost, maxAffordable, upgradeCost, moduleCost, xpNeed, incomeFor, milestoneMult, nextMilestone,
    boostMult, hasOfficer, hasShard, moduleLevel, modVal, plotInfo, plotOf, neighbors, synergy, bestPlot,
    BY_ID, MOD_BY_ID, OFF_BY_ID, SHOP_BY_ID,
  };
})(window.VC);
