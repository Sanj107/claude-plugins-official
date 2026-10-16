'use strict';
// Random sea events around the island: golden parrots, bottles with notes, crabs, merchants,
// navy raids, storms, sunken chests, ghost ships, and the treasure-map dig.
(function (VC) {
  const U = VC.util, ST = VC.State, UI = VC.UI;
  const { fmt } = U;
  const S = 0.25;

  const E = { next: 25, storm: null, active: [] };
  VC.Events = E;

  const TYPES = [
    { id: 'parrot', w: 30, ch: 0 },
    { id: 'bottle', w: 22, ch: 1 },
    { id: 'crabs', w: 16, ch: 1 },
    { id: 'merchant', w: 12, ch: 2 },
    { id: 'navy', w: 10, ch: 2 },
    { id: 'storm', w: 6, ch: 2 },
    { id: 'sunken', w: 10, ch: 3 },
    { id: 'ghost', w: 8, ch: 3, night: true },
  ];

  E.init = function () { this.next = 30; };

  E.stormLeft = function () { return this.storm ? Math.ceil(this.storm.left) + ' с' : ''; };

  E.canRun = function () {
    const G = VC.Game;
    return G.s.unlocked.island && !VC.Battle.active && G.s.story.idx >= 3 && VC.Scene.mode === 'island';
  };

  E.update = function (dt, realDt) {
    if (this.storm) {
      this.storm.left -= realDt;
      if (this.storm.left <= 0) this.endStorm();
    }
    if (!this.canRun()) return;
    this.next -= dt * VC.D.eventFreq;
    if (this.next <= 0) {
      this.next = U.rnd(55, 120);
      if (this.active.length < 2) this.spawnRandom(false);
    }
  };

  function caught(type) {
    const s = VC.Game.s;
    s.stats.events++;
    if (type === 'parrot') s.stats.parrots++;
  }
  function track(a, type) { a.type = type; E.active.push(a); return a; }
  function untrack(a) { const i = E.active.indexOf(a); if (i >= 0) E.active.splice(i, 1); }
  function evGold(sec) { return (ST.incomeFor(sec) + VC.D.tapPower * 15) * VC.D.eventReward; }

  // Spawn geometry on the island (see Scene.island in island.js). The docked ship lies in front of
  // the main pier, so sea events use the open water beside it or the lane in front of it.
  const isl = () => VC.Scene.island;
  const SHIP_LANE = 11.6;               // passing ships sail across the bottom of the view
  const FREE_X = [[-4.6, -2.2], [5.0, 5.6]]; // sea in view, clear of the pier and the docked ship
  const inFree = x => FREE_X.some(r => x >= r[0] - 0.4 && x <= r[1] + 0.4);
  function freeX() { const r = U.pick(FREE_X); return U.rnd(r[0], r[1]); }
  /** z of the water's edge in front of the town at x (marching in from the sea). */
  function shoreZ(x) {
    const I = isl();
    if (!I) return 6.2;
    for (let z = 13; z > 3; z -= 0.1) {
      const y = I.groundY(x, z);
      if (y !== null && y !== undefined && !(Math.abs(x - 1.5) < 1.5 && z > 6.2)) return z;
    }
    return 6.2;
  }
  function groundY(x, z, fb) { const I = isl(); const y = I ? I.groundY(x, z) : null; return y === null || y === undefined ? fb : y; }
  /** Beach spots in front of the town (in view of the fixed camera), optionally beside open water. */
  function beachSpots(sea) {
    const I = isl();
    const list = I && I.spots && I.spots.beach ? I.spots.beach.filter(p => Math.abs(p[0]) < 6.2 && (!sea || inFree(p[0]))) : [];
    return list.length ? list : [[-3.0, 5.6], [-1.0, 5.6], [3.6, 5.7], [4.9, 6.1]];
  }
  /** Sea spots near the island in view and clear of the docked ship. */
  function seaSpots() {
    const I = isl();
    const d = I && I.dock ? I.dock : { x: 1.5, z: 9.2 };
    const list = I && I.spots && I.spots.sea ? I.spots.sea.near.filter(p => Math.abs(p[0]) < 6.5 && p[1] < 11.5 && (Math.abs(p[0] - d.x) > 3.4 || p[1] > d.z + 2.2)) : [];
    return list.length ? list : [[-4.0, 8.8], [-3.2, 10.4], [5.6, 9.4]];
  }

  // ------------------------------------------------------------------ golden parrot
  E.parrot = function () {
    const sc = VC.Scene;
    const mesh = sc.voxMesh('gparrot', () => VC.Models.parrot(true), { scale: 0.12, center: 'base' });
    const g = new THREE.Group(); g.add(mesh);
    const dir = Math.random() < 0.5 ? 1 : -1;
    // flies across the island above the roofs of the plot grid
    const I = isl(), cell = I && I.plotCell;
    const z = cell ? U.rnd(cell.z0 + 1.5, cell.z1 - 0.5) : U.rnd(-2.5, 2.5), y0 = U.rnd(3.2, 4.6);
    g.position.set(-9 * dir, y0, z);
    g.rotation.y = dir > 0 ? 0 : Math.PI;
    let t = 0;
    const a = track({
      obj: g, tapRadius: 70,
      update: (dt) => {
        t += dt;
        g.position.x += dir * dt * 1.8;
        g.position.y = y0 + Math.sin(t * 3) * 0.4;
        mesh.rotation.z = Math.sin(t * 14) * 0.2;
        if (Math.random() < 0.3) sc.emit({ pos: [g.position.x, g.position.y, g.position.z], vel: [0, -0.5, 0], life: 0.5, size: 0.06, color: '#ffd23f', grav: 1 });
        if (Math.abs(g.position.x) > 10) { untrack(a); return false; }
      },
      onTap: (x, y) => {
        untrack(a); sc.removeActor(a);
        caught('parrot');
        VC.Audio.sfx('parrot');
        sc.burst([g.position.x, g.position.y, g.position.z], 30, { color: ['#ffd23f', '#fff2a0', '#3cb043'], speed: 4, size: 0.12 });
        const G = VC.Game;
        const r = Math.random();
        if (r < 0.6) { const gold = evGold(U.rnd(90, 240)); G.addGold(gold); UI.floater(x, y, '+' + fmt(gold), 'crit'); UI.toast(`🦜 Золотой попугай принёс 🪙 ${fmt(gold)}!`); }
        else if (r < 0.8) { G.frenzy = 100; G.startFrenzy(); }
        else if (r < 0.93) { const p = G.addPearls(U.rndi(1, 3)); UI.floater(x, y, `+${p} 💎`, 'pearl'); UI.toast(`🦜 Попугай обронил жемчуг: +${p} 💎`); }
        else { G.addBoost({ id: 'income', mult: 2, time: 120 }); UI.toast('🦜 Попугай поёт! ×2 доход на 2 минуты'); }
      },
    }, 'parrot');
    sc.addActor(a);
    VC.Audio.sfx('parrot');
  };

  // ------------------------------------------------------------------ bottle with a note / map piece
  E.bottle = function () {
    const sc = VC.Scene;
    const mesh = sc.voxMesh('bottle', () => VC.Models.bottle(), { scale: 0.12, center: 'base' });
    const g = new THREE.Group(); g.add(mesh);
    // drifts in from the open sea beside the pier and stops at the water's edge of the beach
    const bs = U.pick(beachSpots(true));
    const bx = bs[0] + U.rnd(-0.3, 0.3), stopZ = shoreZ(bx) + 0.3;
    g.position.set(bx, 0.1, stopZ + 3.5);
    let t = 0;
    const a = track({
      obj: g, tapRadius: 70,
      update: (dt) => {
        t += dt;
        g.position.z = Math.max(stopZ, g.position.z - dt * 0.25);
        g.position.y = sc.waveAt(g.position.x, g.position.z) + 0.05;
        g.rotation.z = Math.sin(t * 2) * 0.3;
        if (t > 30) { untrack(a); return false; }
      },
      onTap: (x, y) => {
        untrack(a); sc.removeActor(a);
        caught('bottle');
        VC.Audio.sfx('bell');
        const G = VC.Game, s = G.s;
        const r = Math.random();
        if (r < 0.45 && s.notes.length < VC.NOTES.length) G.findNote();
        else if (r < 0.8) { s.mapPieces++; UI.toast(`🗺️ Кусок карты сокровищ! (${s.mapPieces}/3)`); G.checkMapPieces(); }
        else { const gold = evGold(120); G.addGold(gold); UI.floater(x, y, '+' + fmt(gold)); UI.toast('🍾 В бутылке были монеты!'); }
      },
    }, 'bottle');
    sc.addActor(a);
    UI.toast('🍾 К берегу прибило бутылку!');
  };

  // ------------------------------------------------------------------ crabs on the beach
  E.crabs = function () {
    const sc = VC.Scene;
    const n = U.rndi(4, 7);
    let left = n;
    UI.toast('🦀 Нашествие крабов! Тапайте по ним!');
    caught('crabs');
    for (let i = 0; i < n; i++) {
      const mesh = sc.voxMesh('crabmini', () => {
        const v = new VC.Voxel.Vox();
        v.ball(0, 1, 0, 3, 1.5, 2.5, '#e2553a');
        v.box(3, 1, -3, 4, 2, -2, '#c9402a'); v.box(3, 1, 2, 4, 2, 3, '#c9402a');
        v.set(2, 3, -1, '#fff'); v.set(2, 3, 1, '#fff');
        return v;
      }, { scale: 0.1, center: 'base' });
      const g = new THREE.Group(); g.add(mesh);
      // scuttle along the beach in front of the promenade
      const bs = U.pick(beachSpots(false));
      const cz = Math.max(5.1, Math.min(5.8, bs[1] + U.rnd(-0.3, 0.2))), cx = Math.max(-4.5, Math.min(4.5, bs[0] + U.rnd(-0.6, 0.6)));
      g.position.set(cx, groundY(cx, cz, 0.5), cz);
      let t = U.rnd(0, 5), dir = Math.random() < 0.5 ? 1 : -1;
      const a = track({
        obj: g, tapRadius: 48,
        update: (dt) => {
          t += dt;
          g.position.x += dir * dt * 0.7;
          if (Math.abs(g.position.x - 0.3) > 4.8) dir = g.position.x > 0.3 ? -1 : 1;
          g.position.y = groundY(g.position.x, g.position.z, 0.5);
          g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          mesh.position.y = Math.abs(Math.sin(t * 9)) * 0.05;
          if (t > 22) { untrack(a); return false; }
        },
        onTap: (x, y) => {
          untrack(a); sc.removeActor(a);
          const gold = evGold(25);
          VC.Game.addGold(gold);
          VC.Audio.sfx('coin');
          UI.floater(x, y, '+' + fmt(gold));
          sc.burst([g.position.x, 0.4, g.position.z], 10, { color: ['#e2553a', '#ffd23f'], speed: 3, size: 0.1 });
          left--;
          if (left === 0) UI.toast('🦀 Пляж чист!');
        },
      }, 'crabs');
      sc.addActor(a);
    }
  };

  // ------------------------------------------------------------------ merchant ship
  E.merchant = function () {
    const sc = VC.Scene;
    const ship = sc.shipMesh({ tier: 2, style: 'merchant', seed: 3 });
    ship.scale.setScalar(0.8);
    const dir = Math.random() < 0.5 ? 1 : -1;
    ship.position.set(-9 * dir, 0, SHIP_LANE);
    ship.rotation.y = dir > 0 ? 0 : Math.PI;
    const a = track({
      obj: ship, tapRadius: 90,
      update: (dt, t) => {
        ship.position.x += dir * dt * 0.45;
        ship.position.y = sc.waveAt(ship.position.x, SHIP_LANE) * 0.8;
        if (Math.abs(ship.position.x) > 10) { untrack(a); return false; }
      },
      onTap: () => {
        untrack(a); sc.removeActor(a);
        caught('merchant');
        this.merchantOffer();
      },
    }, 'merchant');
    sc.addActor(a);
    UI.toast('🚢 На горизонте торговое судно! Нажмите на него');
    VC.Audio.sfx('bell');
  };

  E.merchantOffer = function () {
    const G = VC.Game, s = G.s;
    const reg = VC.REGIONS[Math.max(1, Math.min(10, VC.CHAPTERS[G.chapter()].region))];
    const lvl = G.raidLevel(reg.id);
    const pool = VC.SHOP.filter(x => x.cat !== 'perm');
    const deal = U.pick(pool);
    const price = Math.max(1, Math.round(deal.price * 0.6));
    UI.modal({
      title: '🚢 Торговая шхуна', icon: '⚖️',
      html: `<p>Капитан шхуны предлагает сделку… или можно взять всё силой.</p>
        <div class="card"><div class="row"><div class="ico-big">${deal.icon}</div><div class="grow" style="text-align:left"><div class="name">${deal.name}</div><div class="sub">${deal.desc}</div></div></div>
        <div class="sub">Цена: <s>💎${deal.price}</s> <b>💎${price}</b></div></div>`,
      buttons: [
        { label: `Купить 💎${price}`, cls: 'pearl' + (s.pearls >= price ? '' : ' disabled'), fn: () => {
          if (!G.spendPearls(price)) return;
          VC.Audio.sfx('buy');
          if (deal.boost) { G.addBoost(deal.boost); UI.toast(`${deal.icon} ${deal.desc}`); }
          if (deal.warp) { const g = ST.incomeFor(deal.warp); G.addGold(g); UI.reward('Песочные часы', { gold: g }, '⏳'); }
          if (deal.chest) G.openChest(deal.chest);
          G.afterChange();
        } },
        { label: '⚔️ Атаковать', cls: 'red', fn: () => VC.Battle.begin({ kind: 'event', enemy: 'merchant', level: lvl, region: reg, lootMult: 2 }) },
        { label: 'Отпустить' },
      ],
    });
  };

  // ------------------------------------------------------------------ navy raid
  E.navy = function () {
    const sc = VC.Scene;
    const s = VC.Game.s;
    const n = U.rndi(3, 5);
    let left = n, landed = 0;
    UI.toast('⚓ Налёт флота Короны! Топите шлюпки, пока не высадились!', 'bad');
    VC.Audio.sfx('bell');
    caught('navy');
    const fortKills = Math.min(n - 1, Math.floor(s.buildings.fort / 10) + (s.buildings.fort > 0 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const mesh = sc.voxMesh('navyboatHD', () => VC.Models.boat('#1f3e66'), { scale: 0.085, center: 'base' });
      const g = new THREE.Group(); g.add(mesh);
      const x = i % 2 ? U.rnd(-4.6, -2.2) : U.rnd(5.0, 6.2);
      const landZ = shoreZ(x) + 0.2;
      g.position.set(x, 0, U.rnd(12.4, 14.5));
      g.rotation.y = Math.PI / 2;
      let t = 0;
      const speed = U.rnd(0.45, 0.6);
      const sink = () => {
        sc.burst([g.position.x, 0.2, g.position.z], 16, { color: ['#ffffff', '#cdefff', '#1f3e66'], speed: 3, size: 0.12 });
        VC.Audio.sfx('splash');
        left--;
        if (left === 0) finish();
      };
      const finish = () => {
        if (landed === 0) {
          const gold = evGold(150);
          VC.Game.addGold(gold);
          UI.toast(`⚓ Налёт отбит! Трофеи: 🪙 ${fmt(gold)}`);
        } else {
          const lost = s.gold * 0.03 * landed;
          s.gold = Math.max(0, s.gold - lost);
          UI.toast(`⚓ Солдаты Короны утащили 🪙 ${fmt(lost)}. Стройте Форт!`, 'bad');
        }
      };
      const a = track({
        obj: g, tapRadius: 55,
        update: (dt) => {
          t += dt;
          g.position.z -= speed * dt;
          g.position.y = sc.waveAt(g.position.x, g.position.z) * 0.8;
          // The fort shoots the first boats by itself.
          if (i < fortKills && t > 3 + i * 1.5) {
            sc.burst([g.position.x, 0.6, g.position.z], 4, { color: ['#ffd23f', '#ff6a2b'], speed: 2, size: 0.2, grav: 0 });
            VC.Audio.sfx('cannon');
            untrack(a); sink(); return false;
          }
          if (g.position.z < landZ) {
            untrack(a);
            landed++;
            left--;
            if (left === 0) finish();
            return false;
          }
        },
        onTap: (x, y) => {
          untrack(a); sc.removeActor(a);
          UI.floater(x, y, '💥', 'crit');
          sink();
        },
      }, 'navy');
      sc.addActor(a);
    }
  };

  // ------------------------------------------------------------------ storm
  E.stormEvent = function () {
    const lighthouse = VC.Game.s.buildings.light > 0;
    this.storm = { left: 40 };
    VC.Scene.stormy = true;
    const ov = document.createElement('div');
    ov.className = 'storm-overlay';
    ov.id = 'storm-ov';
    document.body.appendChild(ov);
    VC.Audio.sfx('thunder');
    caught('storm');
    UI.toast(lighthouse ? '⛈️ Шторм! Маяк защищает остров' : '⛈️ Шторм! Доход −50% на 40 с. Маяк защитил бы остров', lighthouse ? '' : 'bad');
  };
  E.endStorm = function () {
    this.storm = null;
    VC.Scene.stormy = false;
    const ov = document.getElementById('storm-ov');
    if (ov) ov.remove();
    UI.toast('🌤️ Шторм утих. На берег выбросило сундук!');
    this.beachChest();
  };
  E.beachChest = function () {
    const sc = VC.Scene;
    const mesh = sc.voxMesh('chestHD', () => VC.Models.chest(), { scale: 0.125, center: 'base' });
    const g = new THREE.Group(); g.add(mesh);
    g.scale.setScalar(0.8);
    // washed up on the beach in front of the town, just above the water's edge
    const bs = U.pick(beachSpots(true));
    const cx = bs[0] + U.rnd(-0.25, 0.25), cz = Math.min(bs[1], shoreZ(cx) - 0.45);
    g.position.set(cx, groundY(cx, cz, 0.25), cz);
    let t = 0;
    const a = track({
      obj: g, tapRadius: 60,
      update: (dt) => { t += dt; g.rotation.y = Math.sin(t) * 0.2; if (t > 40) { untrack(a); return false; } },
      onTap: (x, y) => {
        untrack(a); sc.removeActor(a);
        const gold = evGold(300);
        VC.Game.addGold(gold);
        UI.floater(x, y, '+' + fmt(gold), 'crit');
        VC.Audio.sfx('crit');
        sc.burst([g.position.x, 0.6, g.position.z], 24, { color: ['#ffd23f', '#fff2a0'], speed: 4, size: 0.12 });
      },
    }, 'chest');
    sc.addActor(a);
  };

  // ------------------------------------------------------------------ sunken chest (tap-pull minigame)
  E.sunken = function () {
    const sc = VC.Scene;
    const g = new THREE.Group();
    const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0xd63a3a }));
    g.add(buoy);
    // bobs in the open water near the shore, clear of the pier and the docked ship
    const bp = U.pick(seaSpots());
    g.position.set(bp[0], 0, bp[1]);
    let t = 0;
    const a = track({
      obj: g, tapRadius: 60,
      update: (dt) => { t += dt; g.position.y = sc.waveAt(g.position.x, g.position.z) + 0.1; if (t > 35) { untrack(a); return false; } },
      onTap: () => {
        untrack(a); sc.removeActor(a);
        caught('sunken');
        let need = 25, time = 6;
        const rec = UI.modal({
          title: '🪝 Сундук на дне!', noClose: true,
          html: `<p>Тяните канат! Быстрее, пока не порвался!</p><div class="big" id="pull-n">${need}</div><p class="mini" id="pull-t">${time} с</p>
            <button class="btn wide" id="pull" style="height:90px;font-size:26px">💪 ТЯНУТЬ!</button>`,
          mount: m => {
            const timer = setInterval(() => {
              time -= 0.1;
              const el = m.querySelector('#pull-t');
              if (el) el.textContent = Math.max(0, time).toFixed(1) + ' с';
              if (time <= 0) { clearInterval(timer); rec.close(); UI.toast('Канат порвался… Сундук ушёл на дно', 'bad'); }
            }, 100);
            m.querySelector('#pull').addEventListener('pointerdown', () => {
              need--; VC.Audio.sfx('click');
              m.querySelector('#pull-n').textContent = Math.max(0, need);
              if (need <= 0) {
                clearInterval(timer); rec.close();
                const G = VC.Game;
                const gold = evGold(400);
                G.addGold(gold);
                const loot = { gold };
                if (Math.random() < 0.4) loot.pearls = G.addPearls(U.rndi(2, 5));
                UI.reward('Сундук поднят!', loot, '🧰');
              }
            });
          },
        });
      },
    }, 'sunken');
    sc.addActor(a);
    UI.toast('🔴 У острова всплыл буй. Там что-то есть!');
  };

  // ------------------------------------------------------------------ ghost ship at night
  E.ghost = function () {
    const sc = VC.Scene;
    const ship = sc.shipMesh({ tier: 2, style: 'ghost', seed: 4 });
    ship.scale.setScalar(0.9);
    ship.position.set(9, 0, SHIP_LANE);
    ship.rotation.y = Math.PI;
    const a = track({
      obj: ship, tapRadius: 90,
      update: (dt, t) => {
        ship.position.x -= dt * 0.35;
        ship.position.y = sc.waveAt(ship.position.x, SHIP_LANE) + Math.sin(t * 2) * 0.1;
        if (ship.position.x < -10) { untrack(a); return false; }
      },
      onTap: () => {
        untrack(a); sc.removeActor(a);
        caught('ghost');
        const G = VC.Game;
        const reg = VC.REGIONS[Math.max(1, VC.CHAPTERS[G.chapter()].region)];
        UI.confirm('👻 Корабль-призрак', 'В лунном свете скользит призрачный шлюп. Говорят, в его трюме жемчуг. Атаковать?', 'В бой!', () => {
          VC.Battle.begin({ kind: 'event', enemy: 'ghostsloop', level: G.raidLevel(reg.id), region: reg, lootMult: 1.5 });
        });
      },
    }, 'ghost');
    sc.addActor(a);
    UI.toast('👻 В тумане — корабль-призрак!');
  };

  // ------------------------------------------------------------------ treasure dig
  E.treasureHunt = function () {
    const G = VC.Game;
    const target = U.rndi(0, 15);
    let digs = 4;
    let found = false;
    const cells = Array.from({ length: 16 }, (_, i) => `<button data-cell="${i}" style="aspect-ratio:1;border-radius:10px;background:#e3cc8e;font-size:22px;border:2px solid #b99a52">⏺</button>`).join('');
    const rec = UI.modal({
      title: '🗺️ Поиск клада', noClose: true,
      html: `<p>Крест на карте где-то здесь. Копайте! После каждой попытки — подсказка: «горячо» или «холодно».</p>
        <p class="mini" id="dig-left">Лопат: ${digs}</p><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0">${cells}</div><p id="dig-hint" class="mini">&nbsp;</p>`,
      mount: m => {
        m.querySelectorAll('[data-cell]').forEach(b => b.addEventListener('click', () => {
          if (found || digs <= 0 || b.dataset.dug) return;
          const i = +b.dataset.cell;
          b.dataset.dug = 1;
          digs--;
          VC.Audio.sfx('click');
          const d = Math.abs((i % 4) - (target % 4)) + Math.abs(Math.floor(i / 4) - Math.floor(target / 4));
          if (i === target) {
            found = true;
            b.textContent = '💰'; b.style.background = '#ffd23f';
            setTimeout(() => {
              rec.close();
              const gold = evGold(1800);
              G.addGold(gold);
              const loot = { gold, pearls: G.addPearls(U.rndi(4, 9)), extra: [] };
              if (Math.random() < 0.5) { const n = G.findNote(); if (n >= 0) loot.extra.push('📜 Записка Кремня'); }
              UI.reward('Клад найден!', loot, '💰');
              G.s.stats.events++;
            }, 500);
            return;
          }
          b.textContent = d === 1 ? '🔥' : d === 2 ? '♨️' : d === 3 ? '🌡️' : '❄️';
          b.style.background = '#c9b27a';
          m.querySelector('#dig-hint').textContent = d === 1 ? 'Очень горячо!' : d === 2 ? 'Тепло…' : d === 3 ? 'Прохладно' : 'Холодно';
          m.querySelector('#dig-left').textContent = 'Лопат: ' + digs;
          if (digs <= 0) setTimeout(() => {
            rec.close();
            const gold = evGold(240);
            G.addGold(gold);
            UI.reward('Только мелочь…', { gold }, '🪙');
          }, 600);
        }));
      },
    });
  };

  E.spawnRandom = function (force) {
    const G = VC.Game;
    const ch = G.chapter();
    const pool = TYPES.filter(t => t.ch <= ch && (!t.night || VC.Scene.night || force) && !(t.id === 'storm' && E.storm) &&
      !E.active.some(a => a.type === t.id));
    if (!pool.length) return;
    const t = U.weighted(pool, 'w');
    if (t.id === 'storm') E.stormEvent();
    else E[t.id]();
  };
})(window.VC);
