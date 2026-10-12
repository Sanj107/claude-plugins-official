#!/usr/bin/env node
// Balance simulation: a greedy bot plays the campaign using the real game tables and
// battle code, and prints when each chapter is reached.
// Usage: node tools/sim_economy.js [activeMinutesPerSession] [offlineMinutesBetween] [tapsPerSec]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'js');
const ctx = { window: {}, console, Math, Date, JSON, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['util.js', 'data.js', 'story.js', 'state.js', 'combat.js']) {
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
}
const VC = ctx.VC;
const ST = VC.State;
const U = VC.util;

const ACTIVE = +(process.argv[2] || 40) * 60;
const OFFLINE = +(process.argv[3] || 0) * 60;
const TAPS = +(process.argv[4] || 4);
const RAID_EVERY = 90; // seconds of active play between raids

let fakeNow = 1e12;
Date.now = () => fakeNow;
const s = ST.defaultState();
s.name = 'Sim';
ST.recompute(s);
let clock = 0; // seconds of simulated time
let active = 0; // seconds of active play
const log = [];
const chapterAt = {};
const TALENT_ORDER = ['trade', 'greed', 'heavy', 'tough', 'trade', 'banker', 'heavy', 'tough', 'aim', 'reload', 'midas',
  'trade', 'crit', 'wind', 'heavy', 'tough', 'drill', 'smuggle', 'carto', 'luck', 'haggle', 'carpenter', 'boarder', 'chain'];

function addGold(g) { s.gold += g; s.goldRun += g; s.stats.goldEarned += g; }
function addXp(x) {
  s.xp += x;
  while (s.xp >= ST.xpNeed(s.level)) { s.xp -= ST.xpNeed(s.level); s.level++; spendTalent(); }
}
function spendTalent() {
  const spent = Object.values(s.talents).reduce((a, b) => a + b, 0);
  if (spent >= s.level - 1) return;
  for (let k = 0; k < 200; k++) {
    const id = TALENT_ORDER[(spent + k) % TALENT_ORDER.length];
    const t = VC.TALENTS.find(x => x.id === id);
    if (s.talents[id] < t.max) { s.talents[id]++; return; }
  }
}
function chapter() { const m = VC.MISSIONS[s.story.idx]; return m ? m.ch : 11; }
function unlockedBuildings() { return VC.BUILDINGS.filter(b => b.ch <= chapter() && b.ch <= 10); }

function tryBuy() {
  ST.recompute(s);
  let bought = true, n = 0;
  while (bought && n++ < 500) {
    bought = false;
    ST.recompute(s);
    // candidates: best payback
    const cands = [];
    for (const b of unlockedBuildings()) {
      const placed = ST.plotOf(s, b.id) >= 0;
      if (!placed) {
        // needs a free plot of its type
        let free = -1;
        for (let i = 0; i < s.plots; i++) if (!s.layout[i] && ST.plotInfo(i).type === b.plot) { free = i; break; }
        if (free < 0) {
          // consider buying the next plot if of right type
          if (s.plots < VC.PLOTS.length) {
            const pc = VC.PLOTS[s.plots].cost;
            cands.push({ kind: 'plot', cost: pc, gain: b.inc * 2, plotFor: b.plot });
          }
          continue;
        }
      }
      const c = ST.buildingCost(s, b.id, 1);
      const l = s.buildings[b.id];
      const gainNow = b.inc * ST.milestoneMult(l + 1) * (l + 1) - b.inc * ST.milestoneMult(l) * l;
      cands.push({ kind: 'b', id: b.id, cost: c, gain: gainNow * VC.D.globalMult * (VC.D.bSyn[b.id] ? VC.D.bSyn[b.id].mult : 1) });
    }
    // economic modules
    for (const id of ['nets', 'hold', 'boy', 'rum']) {
      const m = ST.MOD_BY_ID[id];
      if (m.ch > chapter()) continue;
      if (s.ship.deck.indexOf(id) < 0) {
        const free = s.ship.deck.indexOf(null);
        if (free < 0) continue;
        s.ship.deck[free] = id;
      }
      const c = ST.moduleCost(s, id);
      let gain;
      const l = s.ship.modules[id];
      if (id === 'nets') gain = 0.8 * VC.D.globalMult * ((l + 1) * ST.milestoneMult(l + 1) - l * ST.milestoneMult(l));
      else if (id === 'hold') gain = VC.D.income * 0.03 / (1 + 0.03 * l);
      else if (id === 'boy') gain = 0.5 * VC.D.tapPower;
      else gain = 0.15 * VC.D.tapBase * TAPS * ACTIVE / (ACTIVE + OFFLINE);
      cands.push({ kind: 'm', id, cost: c, gain });
    }
    cands.sort((a, b) => a.cost / Math.max(a.gain, 1e-9) - b.cost / Math.max(b.gain, 1e-9));
    const best = cands[0];
    // Like a real player, save up for the current mission's purchase unless the item pays back fast.
    const reserve = goalCost();
    const fast = best && best.cost / Math.max(best.gain, 1e-9) < 120;
    if (best && s.gold >= best.cost && (fast || s.gold - best.cost >= reserve)) {
      s.gold -= best.cost;
      if (best.kind === 'b') {
        if (ST.plotOf(s, best.id) < 0) s.layout[ST.bestPlot(s, best.id)] = best.id;
        s.buildings[best.id]++;
        s.stats.buildingLevels++;
      } else if (best.kind === 'plot') s.plots++;
      else s.ship.modules[best.id]++;
      bought = true;
    }
  }
}

function goalCost() {
  const m = VC.MISSIONS[s.story.idx];
  if (!m) return 0;
  const g = m.goal;
  if (g.t === 'build' && s.buildings[g.id] < g.n) {
    let c = ST.buildingCost(s, g.id, 1);
    const b = ST.BY_ID[g.id];
    if (ST.plotOf(s, g.id) < 0) {
      let free = false;
      for (let i = 0; i < s.plots; i++) if (!s.layout[i] && ST.plotInfo(i).type === b.plot) free = true;
      if (!free && s.plots < VC.PLOTS.length) c += VC.PLOTS[s.plots].cost;
    }
    return c;
  }
  if (g.t === 'tier' && s.ship.tier < g.n) return VC.SHIPS[s.ship.tier].cost;
  return 0;
}

function shipUpgradeBudget(frac) {
  // Spend up to frac of gold on balanced ship upgrades up to the cap.
  const cap = VC.SHIPS[s.ship.tier - 1].cap;
  let budget = s.gold * frac;
  for (let k = 0; k < 400; k++) {
    ST.recompute(s);
    const opts = ['guns', 'hull', 'crew', 'sails'].filter(u => s.ship[u] < cap).map(u => ({ u, c: ST.upgradeCost(s, u) }));
    // combat modules too
    for (const id of ['powder', 'armor']) {
      if (ST.MOD_BY_ID[id].ch > chapter()) continue;
      if (s.ship.deck.indexOf(id) >= 0) opts.push({ u: id, c: ST.moduleCost(s, id), mod: true });
    }
    opts.sort((a, b) => a.c - b.c);
    if (!opts.length || opts[0].c > budget) break;
    budget -= opts[0].c; s.gold -= opts[0].c;
    if (opts[0].mod) s.ship.modules[opts[0].u]++; else s.ship[opts[0].u]++;
    s.stats.shipLevels++;
  }
}

function fight(enemy, L) {
  ST.recompute(s);
  const me = ST.combatStats(s);
  const foe = ST.enemyStats(enemy, L);
  const b = new VC.Combat.Battle(me, foe, ['ai', 'ai'], { seed: (clock | 0) + L });
  b.s[0].botTaps = TAPS;
  let t = 0;
  while (!b.over && t < 400) { b.step(0.1); t += 0.1; }
  clock += t + 8; active += t + 8;
  return { win: b.winner === 0, time: t };
}

function missionDone(m) {
  const g = m.goal;
  const check = (g) => {
    switch (g.t) {
      case 'taps': return true;
      case 'build': return s.buildings[g.id] >= g.n;
      case 'gold': return s.goldRun - s.story.base >= g.n;
      case 'upg': return s.ship[g.id] >= g.n;
      case 'tier': return s.ship.tier >= g.n;
      case 'module': return s.ship.modules[g.id] >= g.n && s.ship.deck.indexOf(g.id) >= 0;
      case 'level': return s.level >= g.n;
      case 'events': case 'exped': return clock - s.story.t0 > 600;
      case 'choice': return true;
      case 'battle': return false;
    }
  };
  return check(g) && (!g.also || check(g.also));
}

function grantReward(m) {
  const r = m.reward;
  if (r.gold) addGold(r.gold);
  if (r.xp) addXp(r.xp);
  if (r.pearls) s.pearls += r.pearls;
  if (r.officer) { s.officers.push(r.officer); const free = s.abilities.indexOf(null); if (free >= 0) s.abilities[free] = r.officer; }
  if (r.shard) s.shards.push(r.shard);
  if (m.goal.t === 'choice') s.legendChoice = 'free';
}

function progressMission() {
  const m = VC.MISSIONS[s.story.idx];
  if (!m) return;
  if (s.story.base === null) { s.story.base = s.goldRun; s.story.t0 = clock; }
  const g = m.goal;
  if (g.t === 'build' && s.buildings[g.id] < g.n) {
    const b = ST.BY_ID[g.id];
    if (ST.plotOf(s, b.id) < 0) {
      let free = -1;
      for (let i = 0; i < s.plots; i++) if (!s.layout[i] && ST.plotInfo(i).type === b.plot) { free = i; break; }
      if (free < 0 && s.gold >= VC.PLOTS[s.plots].cost) { s.gold -= VC.PLOTS[s.plots].cost; s.plots++; }
    }
    if (s.gold >= ST.buildingCost(s, g.id, 1)) {
      const pi = ST.plotOf(s, b.id) >= 0 ? ST.plotOf(s, b.id) : ST.bestPlot(s, b.id);
      if (pi >= 0) { s.gold -= ST.buildingCost(s, g.id, 1); s.layout[pi] = g.id; s.buildings[g.id]++; }
    }
  }
  if (g.t === 'upg' && s.ship[g.id] < g.n && s.gold >= ST.upgradeCost(s, g.id) && s.ship[g.id] < VC.SHIPS[s.ship.tier - 1].cap) {
    s.gold -= ST.upgradeCost(s, g.id); s.ship[g.id]++;
  }
  if (g.t === 'tier' && s.ship.tier < g.n && s.gold >= VC.SHIPS[s.ship.tier].cost) {
    s.gold -= VC.SHIPS[s.ship.tier].cost; s.ship.tier++;
    while (s.ship.deck.length < VC.SHIPS[s.ship.tier - 1].slots) s.ship.deck.push(null);
  }
  if (g.t === 'module' && s.ship.modules[g.id] < g.n && s.gold >= ST.moduleCost(s, g.id)) {
    if (s.ship.deck.indexOf(g.id) < 0) s.ship.deck[s.ship.deck.length - 1] = g.id;
    s.gold -= ST.moduleCost(s, g.id); s.ship.modules[g.id]++;
  }
  if (g.t === 'battle') {
    ST.recompute(s);
    const foe = ST.enemyStats(g.enemy, g.lvl);
    const pp = VC.D.power, ep = ST.powerOf(foe);
    if (pp < ep * 0.6) { shipUpgradeBudget(0.7); return; }
    shipUpgradeBudget(0.5);
    const r = fight(g.enemy, g.lvl);
    s.story.tries = (s.story.tries || 0) + 1;
    if (r.win) {
      const loot = ST.enemyLoot(g.enemy, g.lvl);
      addGold(loot.gold); addXp(loot.xp);
      finishMission(m, `win ${g.enemy} L${g.lvl} in ${r.time.toFixed(0)}s after ${s.story.tries} tries (P ${U.fmt(pp)} vs ${U.fmt(ep)})`);
    }
    return;
  }
  if (missionDone(m)) finishMission(m, '');
}

function finishMission(m, note) {
  grantReward(m);
  if (process.env.DBG) log.push("   plots=" + s.plots + " layout=" + JSON.stringify(s.layout) + " gold=" + U.fmt(s.gold) + " b=" + JSON.stringify(s.buildings));
  log.push(`${(clock / 3600).toFixed(2).padStart(6)}h  ${m.id.padEnd(6)} ${m.title.padEnd(26)} lvl ${String(s.level).padStart(3)}  gold/s ${U.fmt(VC.D.income).padStart(10)}  T${s.ship.tier} ${note}`);
  s.story.idx++;
  s.story.base = null; s.story.tries = 0;
  const nm = VC.MISSIONS[s.story.idx];
  if (nm && chapterAt[nm.ch] === undefined) chapterAt[nm.ch] = clock;
}

let lastRaid = 0;
function raid() {
  const ch = chapter();
  const reg = VC.REGIONS[Math.min(10, ch)];
  if (ch < 1) return;
  const L = Math.min(reg.max, s.raids[reg.id] || reg.min);
  const foe = U.pick(reg.enemies);
  ST.recompute(s);
  const ep = ST.powerOf(ST.enemyStats(foe, L));
  if (VC.D.power < ep * 0.7) { shipUpgradeBudget(0.3); return; }
  const r = fight(foe, L);
  if (r.win) {
    const loot = ST.enemyLoot(foe, L);
    addGold(loot.gold); addXp(loot.xp);
    s.raids[reg.id] = Math.min(reg.max, L + 1);
  }
}

const LIMIT = 200 * 3600;
let sessionT = 0;
while (s.story.idx < VC.MISSIONS.length && clock < LIMIT) {
  // active second
  ST.recompute(s);
  const inc = VC.D.income + VC.D.tapPower * (TAPS + VC.D.autoTaps);
  addGold(inc);
  clock += 1; active += 1; sessionT += 1; fakeNow += 1000;
  if (active - lastRaid > RAID_EVERY) { lastRaid = active; raid(); }
  if ((clock | 0) % 5 === 0) { tryBuy(); progressMission(); }
  if (OFFLINE > 0 && sessionT >= ACTIVE) {
    sessionT = 0;
    ST.recompute(s);
    const off = Math.min(OFFLINE, VC.D.offlineCap) * VC.D.income * VC.D.offlineRate;
    addGold(off);
    clock += OFFLINE; fakeNow += OFFLINE * 1000;
    tryBuy();
  }
}
console.log(log.join('\n'));
console.log('\nChapter reached at (hours):', Object.entries(chapterAt).map(([c, t]) => `ch${c}=${(t / 3600).toFixed(1)}`).join(' '));
console.log('Final: level', s.level, 'gold/s', U.fmt(VC.D.income), 'ship T' + s.ship.tier, JSON.stringify({ hull: s.ship.hull, guns: s.ship.guns, sails: s.ship.sails, crew: s.ship.crew }), 'active h', (active / 3600).toFixed(1));
