#!/usr/bin/env node
// Geometry overlap test for the island view. Seeds a save with all 16 buildings (high levels),
// then checks in world space, vertex by vertex:
//  - every building stays inside its own plot cell (plot footprint plus half of the path around it);
//  - no decoration (palms, rocks, props, merged decor meshes…) reaches into any plot cell above
//    the ground — e.g. palm leaves poking into a neighbouring roof.
// Terrain meshes are skipped (mark them with userData.terrain), as are plot highlight quads,
// ships and island-event actors.
// Usage: node tools/test_overlap.js [url] [outDir]
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
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    if (location.protocol === 'about:' || localStorage.getItem('vc_save_v1')) return;
    const ids = ['hut', 'grove', 'smoke', 'tavern', 'fort', 'distill', 'sugar', 'market', 'yard', 'mine', 'mint', 'light', 'bank', 'temple', 'obs', 'statue'];
    const buildings = {};
    ids.forEach(id => { buildings[id] = 160; });
    const shore = ['hut', 'smoke', 'yard', 'light'];
    const land = ids.filter(i => shore.indexOf(i) < 0);
    const layout = {};
    [0, 2, 8, 11].forEach((p, i) => { layout[p] = shore[i]; });
    [1, 3, 4, 5, 6, 7, 9, 10, 12, 13, 14, 15].forEach((p, i) => { layout[p] = land[i]; });
    localStorage.setItem('vc_save_v1', JSON.stringify({
      v: 1, name: 'Overlap', avatar: '🏴‍☠️', shipName: 'Ласточка', lastSave: Date.now(), story: { idx: 30, phase: 'goal', base: 0 },
      unlocked: { island: 1, ship: 1, map: 1, captain: 1, shop: 1 }, gold: 1, plots: 16, buildings, layout,
      ship: { tier: 4, hull: 1, guns: 1, sails: 1, crew: 1, hp: 1, deck: [], modules: {} }, slava: 20,
    }));
  });
  await page.goto(BASE);
  await page.waitForTimeout(1800);
  for (let i = 0; i < 5; i++) { const b = await page.$('.modal > .btns > .btn'); if (!b) break; await b.click(); await page.waitForTimeout(200); }
  await page.evaluate(() => { while (VC.UI.inDialogue()) VC.UI.finishDialogue(); });
  await page.screenshot({ path: path.join(OUT, 'overlap_island.png') });

  const report = await page.evaluate(() => {
    const Sc = VC.Scene;
    const T = THREE;
    const v = new T.Vector3();
    // Plot cells in world space: centre from the highlight quad, cell = half the distance between plot centres.
    const cells = Sc.plotMeshes.map((m, i) => {
      m.updateWorldMatrix(true, false);
      const c = new T.Vector3().setFromMatrixPosition(m.matrixWorld);
      return { i, x: c.x, y: c.y, z: c.z };
    });
    let pitch = Infinity;
    for (const a of cells) for (const b of cells) {
      if (a === b) continue;
      const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
      if (d > 1e-3 && d < pitch) pitch = d;
    }
    const half = pitch / 2;
    const eps = 0.02;
    const inCell = (cell, x, z, shrink) => Math.abs(x - cell.x) < half - shrink && Math.abs(z - cell.z) < half - shrink;
    const label = o => o.name || o.userData.kind || (o.userData.building ? 'building:' + o.userData.building : o.geometry && o.geometry.uuid.slice(0, 6));
    const buildingSet = new Set(Object.values(Sc.buildingMeshes || {}));
    const plotSet = new Set(Sc.plotMeshes);
    const issues = [];
    let checkedVerts = 0;
    const meshes = [];
    Sc.islandGroup.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      if (plotSet.has(o) || o === Sc.terrain || o.userData.terrain) continue;
      let p = o, isShip = false, isBuilding = null;
      while (p && p !== Sc.islandGroup) {
        if (p.userData && p.userData.info) isShip = true;
        if (buildingSet.has(p)) isBuilding = p;
        p = p.parent;
      }
      if (isShip) continue;
      o.updateWorldMatrix(true, false);
      const pos = o.geometry.attributes.position;
      if (isBuilding) {
        const own = cells[isBuilding.userData.plot];
        let worst = 0;
        for (let k = 0; k < pos.count; k++) {
          v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
          checkedVerts++;
          const over = Math.max(Math.abs(v.x - own.x), Math.abs(v.z - own.z)) - half;
          if (over > eps && over > worst) worst = over;
        }
        if (worst > 0) issues.push({ kind: 'building leaves its plot cell', mesh: label(isBuilding), plot: own.i, by: +worst.toFixed(3) });
        continue;
      }
      const hits = {};
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
        checkedVerts++;
        for (const c of cells) {
          if (v.y > c.y + 0.05 && inCell(c, v.x, v.z, eps)) { hits[c.i] = (hits[c.i] || 0) + 1; }
        }
      }
      for (const i in hits) issues.push({ kind: 'decor reaches into plot cell', mesh: label(o), plot: +i, vertices: hits[i] });
    }
    return { pitch: +pitch.toFixed(3), meshes: meshes.length, checkedVerts, issues };
  });
  console.log(`plot pitch ${report.pitch}, meshes ${report.meshes}, vertices checked ${report.checkedVerts}`);
  for (const it of report.issues) console.log(' -', JSON.stringify(it));
  console.log('ERRORS:', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
  const ok = !report.issues.length && !errors.length && report.checkedVerts > 0;
  console.log(ok ? 'OVERLAP TEST PASSED' : 'OVERLAP TEST FAILED');
  process.exit(ok ? 0 : 1);
})();
