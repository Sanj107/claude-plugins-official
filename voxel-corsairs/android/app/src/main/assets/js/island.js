'use strict';
// Island view: terrain, decor, plots and buildings, the docked player ship, fixed camera.
(function (VC) {
  const Scene = VC.Scene;
  const S = Scene.S;
  const M = VC.Models;
  const cachedGeo = Scene.cachedGeo;
  const geoCache = Scene.geoCache;

  // ------------------------------------------------------------------ island
  Scene.buildIsland = function (state) {
    const g = this.islandGroup;
    while (g.children.length) g.remove(g.children[0]);
    this.tappables = this.tappables.filter(t => t.persistent);
    const terrain = new THREE.Mesh(cachedGeo('island', () => M.island(3), { scale: S, center: [0, 0, 0] }), VC.Voxel.material());
    terrain.position.y = -0.35;
    g.add(terrain);
    this.terrain = terrain;
    const palms = [[-21, 6], [-19, 14], [20, 9], [22, 2], [-12, 17], [16, 16], [-23, -4], [23, -8], [2, 19]];
    palms.forEach(([x, z], i) => {
      const m = new THREE.Mesh(cachedGeo('palm' + (i % 4), () => M.palm(7 + (i % 3), i + 20)), VC.Voxel.material());
      m.position.set(x * S, (z > 14 || Math.abs(x) > 20 ? 1.5 : 3) * S - 0.35 + S, z * S);
      m.rotation.y = i * 1.3;
      g.add(m);
    });
    [[-17, 18], [19, 18], [-24, 10], [13, 21]].forEach(([x, z], i) => {
      const m = new THREE.Mesh(cachedGeo('rock' + i, () => M.rock(i + 3)), VC.Voxel.material());
      m.position.set(x * S, 0.05, z * S);
      g.add(m);
    });
    // treasure chest: the main tap target
    const chest = new THREE.Mesh(cachedGeo('chest', () => M.chest()), VC.Voxel.material());
    chest.position.set(-2.2, 0.25, 4.9);
    chest.rotation.y = 0.3;
    g.add(chest);
    this.chest = chest;
    // plots
    this.plotMeshes = [];
    this.buildingMeshes = {};
    const plotGeo = new THREE.PlaneGeometry(7 * S, 7 * S);
    plotGeo.rotateX(-Math.PI / 2);
    VC.PLOTS.forEach((p, i) => {
      const [px, pz] = M.plotCenter(p.r, p.c);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0, depthWrite: false });
      const hl = new THREE.Mesh(plotGeo, mat);
      hl.position.set(px * S + S / 2, (M.GROUND + 1) * S - 0.35 + 0.02, pz * S + S / 2);
      hl.userData.plot = i;
      g.add(hl);
      this.plotMeshes.push(hl);
    });
    this.refreshBuildings(state);
    this.refreshPlayerShip(state);
    this.fire('island', state);
  };

  Scene.refreshBuildings = function (state) {
    const g = this.islandGroup;
    for (const k in this.buildingMeshes) g.remove(this.buildingMeshes[k]);
    this.buildingMeshes = {};
    VC.PLOTS.forEach((p, i) => {
      const hl = this.plotMeshes[i];
      hl.visible = true;
      const owned = i < state.plots;
      hl.material.color.set(owned ? 0xffd23f : 0x553311);
      const bid = state.layout[i];
      if (!bid || !owned || state.buildings[bid] <= 0) return;
      const [px, pz] = M.plotCenter(p.r, p.c);
      const m = new THREE.Mesh(cachedGeo('b:' + bid, () => M.building(bid)), VC.Voxel.material());
      m.position.set(px * S + S / 2, (M.GROUND + 1) * S - 0.35, pz * S + S / 2);
      const lvl = state.buildings[bid];
      const grow = 1 + Math.min(0.18, Math.floor(Math.log2(1 + lvl / 10)) * 0.04);
      m.scale.setScalar(grow);
      m.userData.building = bid;
      m.userData.plot = i;
      g.add(m);
      this.buildingMeshes[i] = m;
    });
    this.fire('buildings', state);
  };

  /** Highlights plots for build mode: list of {plot, color} or null to hide. */
  Scene.highlightPlots = function (list) {
    this.plotMeshes.forEach(m => { m.material.opacity = 0; });
    if (!list) return;
    for (const it of list) {
      const m = this.plotMeshes[it.plot];
      m.material.color.set(it.color);
      m.material.opacity = 0.55;
    }
  };

  Scene.refreshPlayerShip = function (state) {
    if (this.playerShip) this.islandGroup.remove(this.playerShip);
    if (!state.unlocked.ship && state.story.idx < 4) {
      // Wrecked sloop lying on its side until the prologue repairs it.
      const wreck = this.shipMesh(this.playerShipOpts(state, 1), 'wreck');
      wreck.rotation.z = 0.9;
      wreck.position.set(4.5, -0.2, 6.6);
      this.islandGroup.add(wreck);
      this.playerShip = wreck;
      this.playerShip.userData.wreck = true;
      this.fire('playerShip', wreck, state);
      return;
    }
    const key = 'player:' + state.ship.tier + ':' + state.skins.sail + state.skins.flag + state.skins.hull;
    const ship = this.shipMesh(this.playerShipOpts(state), key);
    // Big hulls would hide the island: show them a bit smaller at the pier.
    const k = Math.min(1, 6.2 / ship.userData.length);
    ship.scale.setScalar(k);
    ship.position.set(2.2, 0, 7.3 + ship.userData.length * k * 0.04);
    this.islandGroup.add(ship);
    this.playerShip = ship;
    this.fire('playerShip', ship, state);
  };

  // Fixed camera over the island (no drag or zoom by design).
  Scene.islandCam = { pos: new THREE.Vector3(0.6, 17.3, 18.6), target: new THREE.Vector3(0.6, 0, 1.6) };

  Scene.updateIsland = function (dt, t) {
    const cam = this.camera;
    cam.position.copy(this.islandCam.pos);
    cam.lookAt(this.islandCam.target);
    if (this.playerShip && !this.playerShip.userData.wreck) {
      const s = this.playerShip;
      s.position.y = this.waveAt(s.position.x, s.position.z) * 0.8;
      s.rotation.z = Math.sin(t * 0.8) * 0.03;
      s.rotation.x = Math.sin(t * 0.6) * 0.02;
    }
    if (this.chest) this.chest.position.y = 0.25 + (this.chestPulse > 0 ? Math.sin(this.chestPulse * 30) * 0.05 : 0);
    if (this.chestPulse > 0) this.chestPulse -= dt;
  };

})(window.VC);
