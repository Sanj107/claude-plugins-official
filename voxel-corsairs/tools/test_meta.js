#!/usr/bin/env node
// Captain meta features: talent reset (pearls, once per 12 h, tester switch for the timer),
// achievement descriptions (inline + info window on tap) and the studio splash.
// Usage: node tools/test_meta.js [url] [outDir]
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
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    if (location.protocol === 'about:' || localStorage.getItem('vc_save_v1')) return;
    localStorage.setItem('vc_save_v1', JSON.stringify({
      v: 1, name: 'Meta', avatar: '🏴‍☠️', shipName: 'Ласточка', lastSave: Date.now(), story: { idx: 12, phase: 'goal', base: 0 },
      unlocked: { island: 1, ship: 1, map: 1, captain: 1, shop: 1 }, gold: 100, pearls: 100, level: 8,
      talents: { greed: 3, trade: 2 }, stats: { taps: 150, wins: 3 }, achievements: { tap1: Date.now() - 86400e3 },
    }));
  });
  await page.goto(BASE);
  await page.waitForTimeout(1800);
  check(await page.evaluate(() => !document.getElementById('splash') || document.getElementById('splash').classList.contains('out')), 'splash gets out of the way once the game is ready');
  for (let i = 0; i < 5; i++) { const b = await page.$('.modal > .btns > .btn'); if (!b) break; await b.click(); await page.waitForTimeout(200); }
  await page.evaluate(() => { while (VC.UI.inDialogue()) VC.UI.finishDialogue(); });

  // ---- talent reset
  const before = await page.evaluate(() => ({ pts: VC.Game.talentPoints(), pearls: VC.Game.s.pearls, left: VC.Game.talentResetLeft() }));
  check(before.left === 0, 'reset is available on a save that never reset');
  await page.evaluate(() => VC.UI.openPanel('captain'));
  await page.waitForTimeout(300);
  await page.click('[data-act="resetTalents"]');
  await page.waitForTimeout(200);
  await page.click('.modal .btns .btn.green');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ pts: VC.Game.talentPoints(), pearls: VC.Game.s.pearls, left: VC.Game.talentResetLeft(), spent: Object.values(VC.Game.s.talents).reduce((a, b) => a + b, 0) }));
  check(after.spent === 0 && after.pts === before.pts + 5, `talents returned (${before.pts} → ${after.pts} points)`);
  check(after.pearls === before.pearls - 20, `cost 20 pearls (${before.pearls} → ${after.pearls})`);
  check(after.left > 11.9 * 3600e3, 'cooldown of 12 h started');
  await page.waitForTimeout(1200);
  const btn = await page.evaluate(() => { const b = document.querySelector('[data-act="resetTalents"]'); return b ? { text: b.textContent, disabled: b.classList.contains('disabled') } : null; });
  check(btn && btn.disabled && /Через/.test(btn.text), `button shows the countdown (${btn && btn.text.trim()})`);
  await page.screenshot({ path: path.join(OUT, 'meta_talents_cooldown.png') });
  // a second reset inside the cooldown does nothing
  await page.evaluate(() => { VC.Game.s.talents.greed = 1; VC.Game.resetTalents(); });
  await page.waitForTimeout(200);
  check(await page.evaluate(() => !document.querySelector('.modal') && VC.Game.s.talents.greed === 1), 'reset blocked during the cooldown');
  // tester switch turns the timer off
  await page.evaluate(() => { VC.Game.s.settings.tester = true; VC.Game.s.settings.noResetTimer = true; });
  check(await page.evaluate(() => VC.Game.talentResetLeft() === 0), 'tester "no timer" switch makes the reset available');
  await page.evaluate(() => { VC.Game.s.settings.tester = false; });
  check(await page.evaluate(() => VC.Game.talentResetLeft() > 0), 'the switch only works in tester mode');
  // a clock moved back by a day must not lock the reset for more than 12 h
  await page.evaluate(() => { VC.Game.s.talentResetAt = Date.now() + 86400e3; });
  check(await page.evaluate(() => VC.Game.talentResetLeft() <= 12 * 3600e3), 'cooldown capped at 12 h when the clock goes backwards');
  await page.evaluate(() => { VC.UI.closePanel && VC.UI.closePanel(); VC.Panels.settings(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const b = document.querySelector('[data-set="tester"]'); if (b) b.click(); });
  await page.waitForTimeout(300);
  check(await page.evaluate(() => !!document.querySelector('[data-set="noResetTimer"]')), 'settings show the timer switch in tester mode');
  await page.screenshot({ path: path.join(OUT, 'meta_settings_tester.png') });
  await page.evaluate(() => { document.querySelectorAll('.modal-wrap').forEach(w => w.remove()); VC.UI.modalStack.length = 0; });

  // ---- achievements
  await page.evaluate(() => VC.UI.openPanel('captain', 'ach'));
  await page.waitForTimeout(300);
  const inline = await page.evaluate(() => ({ n: VC.ACHIEVEMENTS.length, texts: [...document.querySelectorAll('.card.ach .ach-how')].map(e => e.textContent) }));
  check(inline.texts.length === inline.n, `every achievement card carries its condition (${inline.texts.length}/${inline.n})`);
  const vague = inline.texts.filter(t => t.length <= 12 || /^Прогресс/.test(t));
  check(!vague.length, 'every condition is a real sentence' + (vague.length ? ': ' + vague.join(' | ') : ''));
  await page.screenshot({ path: path.join(OUT, 'meta_achievements.png') });
  await page.click('.card.ach[data-id="win2"]');
  await page.waitForTimeout(300);
  const modal = await page.evaluate(() => { const m = document.querySelector('.modal'); return m ? m.textContent : ''; });
  check(/Гроза бухты/.test(modal) && /морских боях/.test(modal) && /3 \/ 25/.test(modal), 'tap opens the achievement window with condition and progress');
  await page.screenshot({ path: path.join(OUT, 'meta_ach_modal.png') });

  console.log('ERRORS:', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
  const ok = !fail.length && !errors.length;
  console.log(ok ? 'META TEST PASSED' : 'META TEST FAILED');
  process.exit(ok ? 0 : 1);
})();
