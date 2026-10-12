#!/usr/bin/env node
// Two-player duel test: two tabs act as two phones (BroadcastChannel transport).
// Host creates a duel, the guest finds and joins it, both get ready, they fight,
// and the test checks that both screens agree on the battle state and the result.
'use strict';
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const BASE = process.argv[2] || 'http://localhost:8766/android/app/src/main/assets/index.html';
const OUT = process.argv[3] || path.join(__dirname, '..', 'docs');
// --online ws://host:port : go through tools/relay_server.js with a room code instead of LAN discovery
const ONLINE = process.argv.indexOf('--online') > 0 ? process.argv[process.argv.indexOf('--online') + 1] : null;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errors = [];
  // Both tabs share one browser context so BroadcastChannel links them; each keeps its own save
  // by namespacing localStorage keys with window.name.
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    if (location.protocol === 'about:') return;
    const role = window.name;
    const name = role === 'host' ? 'Хост' : 'Гость';
    // Each tab keeps its own save by namespacing localStorage keys.
    const real = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) { return real.call(this, role + ':' + k); };
    Storage.prototype.setItem = function (k, v) { return set.call(this, role + ':' + k, v); };
    if (!localStorage.getItem('vc_save_v1')) {
      const s = { v: 1, name, avatar: role === 'host' ? '🏴‍☠️' : '🦜', shipName: role === 'host' ? 'Ласточка' : 'Буревестник', lastSave: Date.now(),
        story: { idx: 30, phase: 'goal', base: 0 }, unlocked: { island: 1, ship: 1, map: 1, captain: 1, shop: 1, duel: 1, expeditions: 1 },
        gold: 1e6, ship: { tier: 3, hull: 20, guns: 20, sails: 20, crew: 20, hp: 1, deck: [], modules: {} },
        officers: ['piastr', 'bochka', 'mira'], abilities: ['piastr', 'bochka', 'mira'], pvp: { rating: role === 'host' ? 1000 : 1100, wins: 0, losses: 0, history: [] } };
      localStorage.setItem('vc_save_v1', JSON.stringify(s));
    }
  });
  const open = async role => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(role + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(role + ': ' + m.text()); });
    await p.goto('about:blank');
    await p.evaluate(r => { window.name = r; }, role);
    await p.goto(BASE);
    await p.waitForTimeout(1500);
    for (let i = 0; i < 5; i++) { const b = await p.$('.modal > .btns > .btn.green'); if (!b) break; await b.click(); await p.waitForTimeout(200); }
    for (let i = 0; i < 20; i++) { const v = await p.$eval('#dialogue', e => !e.classList.contains('hidden')).catch(() => false); if (!v) break; await p.click('#dialogue .skip').catch(() => {}); await p.waitForTimeout(100); }
    return p;
  };
  const host = await open('host');
  const guest = await open('guest');
  const shot = async (p, n) => { await p.screenshot({ path: path.join(OUT, n + '.png') }); console.log('shot', n); };

  await host.evaluate(() => VC.UI.openPanel('duel'));
  await host.click('[data-act=duelMode][data-v=equal]');
  if (ONLINE) {
    for (const p of [host, guest]) await p.evaluate(url => { VC.Game.s.settings.relay = url; }, ONLINE);
    await host.evaluate(() => VC.UI.renderPanel());
    await host.click('[data-act=duelOnHost]');
    await host.waitForFunction(() => VC.Duel.code, null, { timeout: 8000 });
    const code = await host.evaluate(() => VC.Duel.code);
    console.log('room code', code);
    await shot(host, 'duel_online_room');
    await guest.evaluate(() => VC.UI.openPanel('duel'));
    await guest.click('[data-act=duelOnJoin]');
    await guest.fill('.modal input[type=text]', code);
    await guest.click('.modal .btn.green');
  } else {
    await host.click('[data-act=duelHost]');
    await guest.evaluate(() => VC.UI.openPanel('duel'));
    await guest.click('[data-act=duelFind]');
    await guest.waitForSelector('[data-act=duelJoin]', { timeout: 8000 });
    await shot(guest, 'duel_found');
    await guest.click('[data-act=duelJoin]');
  }
  await host.waitForSelector('[data-act=duelReady]', { timeout: 8000 });
  await guest.waitForSelector('[data-act=duelReady]', { timeout: 8000 });
  await host.waitForTimeout(500);
  await shot(host, 'duel_lobby');
  await host.click('[data-act=duelReady]');
  await guest.click('[data-act=duelReady]');
  await host.waitForFunction(() => VC.Battle.active, null, { timeout: 8000 });
  await guest.waitForFunction(() => VC.Battle.active, null, { timeout: 8000 });
  console.log('both in battle');
  // Fight: both tap, guest switches ammo and uses an ability.
  for (let i = 0; i < 60; i++) {
    await host.mouse.click(200, 500);
    await guest.mouse.click(200, 500);
    if (i === 10) await guest.evaluate(() => VC.Battle.active.sim.input('ammo', 'chain'));
    if (i === 20) await guest.evaluate(() => VC.Battle.active.sim.input('abil', 'repair'));
    if (i === 25) await guest.evaluate(() => document.querySelector('[data-emote="0"]').click());
    await host.waitForTimeout(60);
  }
  await shot(host, 'duel_host');
  await shot(guest, 'duel_guest');
  const hs = await host.evaluate(() => VC.Battle.active.sim.b.s.map(x => Math.round(x.hp)));
  const gs = await guest.evaluate(() => VC.Battle.active.sim.b.s.map(x => Math.round(x.hp)));
  const gAmmo = await host.evaluate(() => VC.Battle.active.sim.b.s[1].ammo);
  console.log('host sees hp', hs, 'guest sees hp', gs, 'guest ammo on host', gAmmo);
  const sync = hs.every((v, i) => Math.abs(v - gs[i]) <= Math.max(5, v * 0.05));
  console.log('in sync:', sync);
  // Guest surrenders.
  await guest.evaluate(() => VC.Battle.active.sim.input('flee'));
  await host.waitForSelector('.modal h3', { timeout: 10000 });
  await guest.waitForSelector('.modal h3', { timeout: 10000 });
  const ht = await host.$eval('.modal h3', e => e.textContent);
  const gt = await guest.$eval('.modal h3', e => e.textContent);
  console.log('host result:', ht, '| guest result:', gt);
  await shot(host, 'duel_result_host');
  const ratings = [await host.evaluate(() => VC.Game.s.pvp.rating), await guest.evaluate(() => VC.Game.s.pvp.rating)];
  console.log('ratings after:', ratings);
  console.log('ERRORS:', errors.length);
  for (const e of errors.slice(0, 10)) console.log(' -', e);
  await browser.close();
  const ok = sync && /выиграна/.test(ht) && /проиграна/.test(gt) && gAmmo === 'chain' && !errors.length;
  console.log(ok ? 'DUEL TEST PASSED' : 'DUEL TEST FAILED');
  process.exit(ok ? 0 : 1);
})();
