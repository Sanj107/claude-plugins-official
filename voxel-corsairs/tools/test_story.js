#!/usr/bin/env node
// Plays the whole campaign through the game's own flow (dialogues, goals, rewards, prompts,
// the final choice), satisfying each goal like the tester-mode "skip mission" button does,
// then checks endless mode, a Legend reset, offline earnings and a save/load round trip.
'use strict';
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const BASE = process.argv[2] || 'http://localhost:8766/android/app/src/main/assets/index.html';
const OUT = process.argv[3] || require('os').tmpdir();

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE);
  await page.waitForTimeout(1200);
  await page.fill('#cap-name', 'Сюжет');
  await page.click('text=Поднять паруса!');
  await page.waitForTimeout(300);

  let last = -1, stuck = 0;
  for (let step = 0; step < 2000; step++) {
    const st = await page.evaluate(() => {
      const G = VC.Game, s = G.s, UI = VC.UI;
      // Drive the UI: finish dialogues, answer prompts, close reward modals.
      if (UI.inDialogue()) { UI.finishDialogue(); return { act: 'dlg', idx: s.story.idx }; }
      const top = UI.modalStack[UI.modalStack.length - 1];
      if (top) {
        const inp = top.wrap.querySelector('input[type=text]');
        if (inp) { inp.value = 'Ласточка'; top.wrap.querySelector('.btn.green').click(); return { act: 'prompt', idx: s.story.idx }; }
        const choice = top.wrap.querySelector('.btn.blue');
        if (choice && G.mission() && G.mission().goal.t === 'choice') { choice.click(); return { act: 'choice', idx: s.story.idx }; }
        const b = top.wrap.querySelector('.modal > .btns > .btn');
        if (b) { b.click(); return { act: 'modal', idx: s.story.idx }; }
      }
      if (VC.Battle.active) { const sim = VC.Battle.active.sim; sim.b.s[1].hp = 0; sim.b.finish(0, 'sink'); return { act: 'battle', idx: s.story.idx }; }
      const m = G.mission();
      if (!m) return { act: 'end', idx: s.story.idx };
      if (s.story.phase === 'goal') {
        if (m.goal.t === 'battle') G.storyGo();
        else if (m.goal.t === 'taps' || m.goal.t === 'gold' || m.goal.t === 'events' || m.goal.t === 'exped') {
          if (m.goal.t === 'taps') s.stats.taps += m.goal.n;
          if (m.goal.t === 'gold') G.addGold(m.goal.n);
          if (m.goal.t === 'events') s.stats.events += m.goal.n;
          if (m.goal.t === 'exped') s.stats.expeditions += m.goal.n;
          G.updateObjective();
        } else VC.Panels.skipMission();
        return { act: 'goal', idx: s.story.idx, t: m.goal.t };
      }
      return { act: 'wait', idx: s.story.idx, phase: s.story.phase };
    });
    if (st.act === 'end') { console.log('campaign finished at step', step); break; }
    if (st.idx !== last) { last = st.idx; stuck = 0; } else if (++stuck > 60) { console.log('STUCK at mission', st); break; }
    await page.waitForTimeout(st.act === 'battle' ? 2600 : st.act === 'wait' ? 400 : 60);
  }
  const fin = await page.evaluate(() => {
    const s = VC.Game.s;
    return { idx: s.story.idx, total: VC.MISSIONS.length, unlocked: s.unlocked, officers: s.officers, shards: s.shards, choice: s.legendChoice, level: s.level, tier: s.ship.tier, pearls: s.pearls };
  });
  console.log('final:', JSON.stringify(fin));
  await page.screenshot({ path: path.join(OUT, 'story_end.png') });

  // Endless raid
  await page.evaluate(() => VC.Game.startRaid(11));
  // A random sea hazard (a choice window) may come first; answer it until the battle starts.
  for (let i = 0; i < 30 && !(await page.evaluate(() => !!(VC.Battle.active && VC.Battle.active.sim))); i++) {
    await page.evaluate(() => { const b = document.querySelector('.modal > .btns > .btn'); if (b) b.click(); });
    await page.waitForTimeout(500);
  }
  const raid = await page.evaluate(() => VC.Battle.active ? VC.Battle.active.opts.enemy + '@' + VC.Battle.active.opts.level : 'none');
  console.log('endless raid:', raid);
  await page.evaluate(() => { const sim = VC.Battle.active.sim; sim.b.s[1].hp = 0; sim.b.finish(0, 'sink'); });
  await page.waitForTimeout(2600);
  await page.evaluate(() => { const b = document.querySelector('.modal > .btns > .btn'); if (b) b.click(); });
  // Legend reset
  const legend = await page.evaluate(() => {
    const G = VC.Game, s = G.s;
    s.goldRun = 1e15;
    const gain = G.slavaGain();
    G.legendReset();
    const ok = document.querySelector('.modal .btn.green');
    ok.click();
    return { gain, slava: s.slava, gold: s.gold, hut: s.buildings.hut, story: s.story.idx };
  });
  console.log('legend:', JSON.stringify(legend));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector('.modal > .btns > .btn'); if (b) b.click(); });
  // Save/load round trip + offline earnings
  await page.evaluate(() => { const G = VC.Game; G.addGold(1e6); G.buyBuilding('hut', 1); G.save(); });
  // Pretend the game was closed an hour ago: rewind lastSave before the page boots again.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('rewound')) return;
    sessionStorage.setItem('rewound', '1');
    const s = JSON.parse(localStorage.getItem('vc_save_v1'));
    s.lastSave = Date.now() - 3600 * 1000;
    localStorage.setItem('vc_save_v1', JSON.stringify(s));
  });
  await page.evaluate(() => { VC.Game.save = () => {}; });
  await page.reload();
  await page.waitForTimeout(1500);
  const off = await page.evaluate(() => { const h = document.querySelector('.modal h3'); return h ? h.textContent + ' / ' + (document.querySelector('.modal .big') || {}).textContent : 'no modal ' + JSON.stringify({ ls: VC.Game.s.lastSave, now: Date.now(), inc: VC.D.income, modals: VC.UI.modalStack.length, dlg: VC.UI.inDialogue() }); });
  console.log('offline modal:', off);
  await page.screenshot({ path: path.join(OUT, 'offline.png') });
  console.log('ERRORS:', errors.length);
  for (const e of errors.slice(0, 10)) console.log(' -', e);
  await browser.close();
  const ok = fin.idx === fin.total && fin.unlocked.endless && fin.shards.length === 7 && legend.slava > 0 && /не было/.test(off) && !errors.length;
  console.log(ok ? 'STORY TEST PASSED' : 'STORY TEST FAILED');
  process.exit(ok ? 0 : 1);
})();
