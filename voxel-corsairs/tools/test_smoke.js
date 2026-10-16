#!/usr/bin/env node
// Smoke test in headless Chromium: boots the game, plays the prologue through the real UI,
// opens every tab, runs a battle and a bot duel, and checks for console errors.
// Usage: node tools/test_smoke.js [baseUrl] [outDir]
'use strict';
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const BASE = process.argv[2] || 'http://localhost:8766/android/app/src/main/assets/index.html';
const OUT = process.argv[3] || require('os').tmpdir();

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message + '\n' + e.stack));
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  const shot = async name => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('shot', name); };

  // New game
  await page.fill('#cap-name', 'Тестер');
  await page.click('text=Поднять паруса!');
  await page.waitForTimeout(500);
  await shot('01_intro');
  // Skip intro dialogue
  const skipDialogue = async () => {
    for (let i = 0; i < 30; i++) {
      const vis = await page.$eval('#dialogue', e => !e.classList.contains('hidden')).catch(() => false);
      if (!vis) break;
      await page.click('#dialogue .skip').catch(() => {});
      await page.waitForTimeout(150);
    }
  };
  const closeModals = async () => {
    for (let i = 0; i < 10; i++) {
      const b = await page.$('.modal > .btns > .btn.green') || await page.$('.modal > .btns > .btn:last-child');
      if (!b) break;
      await b.click().catch(() => {});
      await page.waitForTimeout(250);
    }
  };
  await skipDialogue();
  // p1: tap 30 times on the island
  for (let i = 0; i < 34; i++) await page.mouse.click(200 + (i % 5) * 5, 420 + (i % 3) * 5);
  await page.waitForTimeout(300);
  await shot('02_tapping');
  await page.waitForTimeout(800);
  await skipDialogue(); await closeModals(); await page.waitForTimeout(500); await skipDialogue();
  // p2: build the hut via island tab
  await page.evaluate(() => VC.UI.openPanel('island', 'list'));
  await page.waitForTimeout(300);
  await page.evaluate(() => { VC.Game.s.gold += 5000; });
  await page.click('[data-act=buyB][data-id=hut]');
  await page.waitForTimeout(700);
  await skipDialogue(); await closeModals(); await page.waitForTimeout(400); await skipDialogue();
  await shot('03_island_panel');
  // p3: hut 5 + grove
  for (let i = 0; i < 4; i++) { await page.click('[data-act=buyB][data-id=hut]'); await page.waitForTimeout(100); }
  await page.click('[data-act=buyB][data-id=grove]');
  await page.waitForTimeout(900);
  await skipDialogue(); await closeModals(); await page.waitForTimeout(400); await skipDialogue();
  // p4: earn 400 gold
  await page.evaluate(() => VC.UI.closePanel());
  await page.evaluate(() => { VC.Game.addGold(500); });
  for (let i = 0; i < 10; i++) await page.mouse.click(210, 430);
  await page.waitForTimeout(1200);
  await skipDialogue();
  await page.waitForTimeout(400);
  // ship name prompt
  const inp = await page.$('.modal input[type=text]');
  if (inp) { await inp.fill('Ласточка'); await page.click('.modal .btn.green'); }
  await page.waitForTimeout(500);
  await closeModals(); await page.waitForTimeout(400); await skipDialogue();
  await page.waitForTimeout(800);
  await shot('04_battle_start');
  // p5: battle vs crab - tap during battle
  const inBattle = await page.evaluate(() => !!VC.Battle.active);
  console.log('in battle:', inBattle);
  for (let i = 0; i < 80 && await page.evaluate(() => !!VC.Battle.active && !VC.Battle.active.done); i++) {
    await page.mouse.click(200, 380);
    await page.waitForTimeout(120);
    if (i === 20) await shot('05_battle');
  }
  // the battle-end sequence runs on game time (dt is capped per frame), so on slow software GL
  // wait for the result modal instead of a fixed delay
  for (let i = 0; i < 60 && await page.evaluate(() => !!VC.Battle.active && !VC.UI.hasModal()); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1200);
  await shot('06_battle_end');
  await closeModals(); await page.waitForTimeout(600); await skipDialogue(); await closeModals(); await page.waitForTimeout(500); await skipDialogue();
  const st = await page.evaluate(() => ({ idx: VC.Game.s.story.idx, phase: VC.Game.s.story.phase, gold: VC.Game.s.gold, lvl: VC.Game.s.level, unlocked: VC.Game.s.unlocked }));
  console.log('state after prologue', JSON.stringify(st));
  await shot('07_after_prologue');

  // Open every tab and sub-tab
  await page.evaluate(() => { const s = VC.Game.s; s.unlocked = { island: 1, ship: 1, map: 1, captain: 1, shop: 1, duel: 1, expeditions: 1, legend: 1 }; s.gold += 1e6; s.pearls += 200; VC.UI.refreshTabs(); });
  const tabs = { island: ['list', 'layout'], ship: ['ship', 'deck', 'yard', 'skins'], map: ['chart', 'exp'], captain: ['talents', 'crew', 'journal', 'ach', 'legend'], shop: ['pearls', 'gold', 'skins'], duel: [null] };
  for (const [tab, subs] of Object.entries(tabs)) {
    for (const sub of subs) {
      await page.evaluate(([t, s]) => VC.UI.openPanel(t, s || undefined), [tab, sub]);
      await page.waitForTimeout(350);
      await shot('tab_' + tab + (sub ? '_' + sub : ''));
    }
  }
  await page.evaluate(() => VC.UI.closePanel());
  // Settings modal
  await closeModals(); await skipDialogue(); await closeModals();
  await page.click('#btn-settings');
  await page.waitForTimeout(300);
  await shot('settings');
  await closeModals();
  // Daily + quests
  await page.click('#btn-daily'); await page.waitForTimeout(300); await shot('daily'); await closeModals();
  await page.waitForTimeout(300); await closeModals();
  // Events
  await page.evaluate(() => { for (const id of ['parrot', 'bottle', 'crabs', 'merchant', 'navy', 'sunken']) VC.Events[id](); });
  await page.waitForTimeout(1500);
  await shot('events');
  // Bot duel
  await page.evaluate(() => VC.Duel.startBot());
  await page.waitForTimeout(1500);
  for (let i = 0; i < 30; i++) { await page.mouse.click(200, 380); await page.waitForTimeout(80); }
  await shot('duel_bot');
  await page.evaluate(() => VC.Battle.active && VC.Battle.active.sim.input('flee'));
  await page.waitForTimeout(2800);
  await shot('duel_end');
  await closeModals();
  // Night + creature battle
  await page.evaluate(() => { VC.Battle.begin({ kind: 'raid', enemy: 'kraken', level: 3, region: VC.REGIONS[6] }); });
  await page.waitForTimeout(1500);
  await shot('kraken');
  await page.evaluate(() => VC.Battle.active && VC.Battle.active.sim.input('flee'));
  await page.waitForTimeout(2800);
  await closeModals();
  await page.evaluate(() => { VC.Scene.dayT = 0.85; });
  await page.waitForTimeout(500);
  await shot('night');

  console.log('ERRORS:', errors.length);
  for (const e of errors.slice(0, 20)) console.log(' -', e);
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
