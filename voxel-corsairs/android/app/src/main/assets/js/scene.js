'use strict';
// three.js scene: sea, sky, island with buildings, docked ship, battle stage, particles.
(function (VC) {
  const S = 0.25; // world units per voxel
  const M = VC.Models;
  const geoCache = new Map();

  function cachedGeo(key, build, opts) {
    let g = geoCache.get(key);
    if (!g) { g = VC.Voxel.mesh(build(), opts || { scale: S, center: 'base' }); geoCache.set(key, g); }
    return g;
  }

  const Scene = {
    renderer: null, scene: null, camera: null,
    mode: 'island',
    t: 0,
    actors: [],
    tappables: [],
    shake: 0,
    dayT: 0.18,
    cam: { yaw: 0, dist: 25, pitch: 0.82, target: new THREE.Vector3(0.6, 0, 1.6), wantYaw: 0 },
    viewOff: 0, wantViewOff: 0,
  };

  Scene.init = function (canvas, quality) {
    const hi = quality === 'high' || (quality === 'auto' && (window.devicePixelRatio || 1) <= 2.5);
    const r = new THREE.WebGLRenderer({ canvas, antialias: hi, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : hi ? 2 : 1.5));
    this.renderer = r;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog(0x9fd8f5, 40, 140);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    this.hemi = new THREE.HemisphereLight(0xdff3ff, 0x7a6a4a, 0.75);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 0.85);
    this.sun.position.set(-20, 40, 25);
    scene.add(this.sun);
    this.quality = quality;
    this.buildSea();
    this.buildSky();
    this.islandGroup = new THREE.Group();
    this.battleGroup = new THREE.Group();
    this.actorGroup = new THREE.Group();
    scene.add(this.islandGroup);
    scene.add(this.battleGroup);
    scene.add(this.actorGroup);
    this.battleGroup.visible = false;
    this.buildParticles();
    this.raycaster = new THREE.Raycaster();
    this.resize();
  };

  Scene.resize = function () {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait screens need a wider vertical FOV to fit the island.
    this.camera.fov = w / h < 0.7 ? 60 : 50;
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  };

  // ------------------------------------------------------------------ sea & sky
  Scene.buildSea = function () {
    const seg = this.quality === 'low' ? 40 : 72;
    const g = new THREE.PlaneGeometry(260, 260, seg, seg);
    g.rotateX(-Math.PI / 2);
    this.seaBase = g.attributes.position.array.slice();
    this.seaMat = new THREE.MeshPhongMaterial({ color: 0x2a8fb8, specular: 0x9fe3ff, shininess: 70, flatShading: true });
    this.sea = new THREE.Mesh(g, this.seaMat);
    this.sea.position.y = 0;
    this.scene.add(this.sea);
    // Shallow-water ring around the island.
    const ring = new THREE.Mesh(new THREE.CircleGeometry(9.5, 40), new THREE.MeshBasicMaterial({ color: 0x5fd0d8, transparent: true, opacity: 0.35 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.06, -0.4);
    ring.scale.set(1, 1.1, 1);
    this.shallow = ring;
    this.scene.add(ring);
  };

  Scene.updateSea = function (t) {
    const p = this.sea.geometry.attributes.position;
    const a = p.array, b = this.seaBase;
    const amp = this.stormy ? 2.2 : 1;
    for (let i = 0; i < a.length; i += 3) {
      const x = b[i], z = b[i + 2];
      a[i + 1] = (Math.sin(x * 0.18 + t * 1.1) * 0.16 + Math.sin(z * 0.23 + t * 1.4 + x * 0.05) * 0.12 +
        Math.sin((x + z) * 0.41 + t * 2.1) * 0.05) * amp;
    }
    p.needsUpdate = true;
  };
  Scene.waveAt = function (x, z) {
    const t = this.t, amp = this.stormy ? 2.2 : 1;
    return (Math.sin(x * 0.18 + t * 1.1) * 0.16 + Math.sin(z * 0.23 + t * 1.4 + x * 0.05) * 0.12) * amp;
  };

  Scene.buildSky = function () {
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(cachedGeo('cloud' + (i % 3), () => M.cloudPuff(i % 3 + 1)), VC.Voxel.material());
      m.position.set(-60 + i * 20, 14 + (i % 3) * 3, -50 - (i % 2) * 20);
      m.scale.setScalar(1.5 + (i % 2));
      this.scene.add(m);
      this.clouds.push(m);
    }
    this.decor = [];
    const spots = [[-38, -48], [42, -55], [-55, -10], [60, -20], [25, -80]];
    spots.forEach(([x, z], i) => {
      const m = new THREE.Mesh(cachedGeo('isle' + i, () => M.smallIsland(i + 10)), VC.Voxel.material());
      m.position.set(x, -0.6, z);
      m.scale.setScalar(1.6);
      this.scene.add(m);
      this.decor.push(m);
    });
    // Stars for the night sky.
    const sg = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 300; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.45 + 0.05;
      pts.push(Math.cos(th) * Math.cos(ph) * 180, Math.sin(ph) * 180, Math.sin(th) * Math.cos(ph) * 180);
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0 }));
    this.scene.add(this.stars);
  };

  const SKY = [
    [0.0, 0x0b1a33, 0x0f3352, 0.25, 0.2],
    [0.08, 0xf7a26b, 0x1d6690, 0.6, 0.55],
    [0.18, 0x8fd3f5, 0x1a78a8, 0.95, 0.85],
    [0.5, 0x9fd8f5, 0x1a78a8, 1.0, 0.9],
    [0.62, 0xf28c5a, 0x1b6a92, 0.65, 0.6],
    [0.72, 0x0b1a33, 0x0f2f50, 0.3, 0.25],
    [1.0, 0x0b1a33, 0x0f3352, 0.25, 0.2],
  ];
  function lerpColor(a, b, t) {
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    return ca.lerp(cb, t);
  }
  Scene.applySky = function () {
    let d = this.dayT % 1;
    let i = 0;
    while (i < SKY.length - 2 && SKY[i + 1][0] <= d) i++;
    const a = SKY[i], b = SKY[i + 1];
    const k = (d - a[0]) / (b[0] - a[0]);
    const sky = lerpColor(a[1], b[1], k);
    let sea = lerpColor(a[2], b[2], k);
    if (this.seaTint) sea = sea.lerp(new THREE.Color(this.seaTint), 0.55);
    if (this.stormy) { sky.lerp(new THREE.Color(0x3a4656), 0.7); sea.lerp(new THREE.Color(0x24414f), 0.5); }
    this.scene.background = sky;
    this.scene.fog.color = sky;
    this.seaMat.color = sea;
    const light = a[3] + (b[3] - a[3]) * k;
    this.sun.intensity = (a[4] + (b[4] - a[4]) * k) * (this.stormy ? 0.6 : 1);
    this.hemi.intensity = light * 0.8;
    this.night = light < 0.4;
    this.stars.material.opacity = Math.max(0, 0.6 - light) * 1.5;
  };

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

  Scene.shipMesh = function (opts, key) {
    const info = M.ship(opts);
    const k = key || ('ship:' + opts.tier + ':' + JSON.stringify(opts.style));
    let g = geoCache.get(k);
    if (!g) {
      g = VC.Voxel.mesh(info.vox, { scale: S, center: [(info.vox.minX + info.vox.maxX + 1) / 2, info.waterline, 0] });
      geoCache.set(k, g);
    }
    const ghost = opts.style === 'ghost' || opts.style === 'abyss' || (opts.style && opts.style.ghost);
    const mat = ghost ? VC.Voxel.material({ transparent: true, opacity: 0.82, emissive: 0x1a4a3a }) : VC.Voxel.material();
    const mesh = new THREE.Mesh(g, mat);
    const grp = new THREE.Group();
    grp.add(mesh);
    grp.userData.info = info;
    grp.userData.length = info.length * S;
    return grp;
  };

  Scene.playerShipOpts = function (state, tierOverride) {
    const st = M.playerStyle(state.skins);
    return { tier: tierOverride || state.ship.tier, style: st, seed: 5 };
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
      return;
    }
    const key = 'player:' + state.ship.tier + ':' + state.skins.sail + state.skins.flag + state.skins.hull;
    const ship = this.shipMesh(this.playerShipOpts(state), key);
    ship.position.set(2.2, 0, 7.4 + state.ship.tier * 0.12);
    this.islandGroup.add(ship);
    this.playerShip = ship;
  };

  // ------------------------------------------------------------------ particles
  Scene.buildParticles = function () {
    const MAX = 700;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const im = new THREE.InstancedMesh(geo, mat, MAX);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    im.count = 0;
    im.frustumCulled = false;
    this.scene.add(im);
    this.pim = im;
    this.parts = [];
    this.PMAX = MAX;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._sc = new THREE.Vector3();
    this._e = new THREE.Euler();
    this._c = new THREE.Color();
  };

  /** p: {pos:[x,y,z], vel:[...], life, size, color, grav, spin, shrink, drag} */
  Scene.emit = function (p) {
    if (this.parts.length >= this.PMAX) this.parts.shift();
    p.age = 0;
    p.rot = [Math.random() * 3, Math.random() * 3, 0];
    this.parts.push(p);
  };

  Scene.burst = function (pos, n, o) {
    for (let i = 0; i < n; i++) {
      const sp = o.speed || 3;
      this.emit({
        pos: [pos[0] + (Math.random() - 0.5) * (o.spread || 0.3), pos[1] + (Math.random() - 0.5) * (o.spread || 0.3), pos[2] + (Math.random() - 0.5) * (o.spread || 0.3)],
        vel: [(Math.random() - 0.5) * sp, Math.random() * sp * (o.up || 1), (Math.random() - 0.5) * sp],
        life: (o.life || 0.8) * (0.7 + Math.random() * 0.6),
        size: (o.size || 0.12) * (0.6 + Math.random() * 0.8),
        color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color,
        grav: o.grav === undefined ? 9 : o.grav,
        shrink: o.shrink !== false,
        drag: o.drag || 0,
        grow: o.grow || 0,
      });
    }
  };

  Scene.updateParticles = function (dt) {
    const im = this.pim;
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      p.vel[1] -= p.grav * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vel[0] *= k; p.vel[1] *= k; p.vel[2] *= k; }
      p.pos[0] += p.vel[0] * dt; p.pos[1] += p.vel[1] * dt; p.pos[2] += p.vel[2] * dt;
      if (p.pos[1] < -0.3 && p.grav > 0 && !p.sink) { p.vel[1] *= -0.2; p.pos[1] = -0.3; p.vel[0] *= 0.5; p.vel[2] *= 0.5; }
      p.rot[0] += dt * 4; p.rot[1] += dt * 3;
    }
    const list = this.parts;
    for (let i = 0; i < list.length && n < this.PMAX; i++) {
      const p = list[i];
      const k = p.age / p.life;
      let s = p.size * (p.shrink ? 1 - k * k : 1) * (1 + (p.grow || 0) * k);
      this._e.set(p.rot[0], p.rot[1], 0);
      this._q.setFromEuler(this._e);
      this._v.set(p.pos[0], p.pos[1], p.pos[2]);
      this._sc.set(s, s, s);
      this._m4.compose(this._v, this._q, this._sc);
      im.setMatrixAt(n, this._m4);
      this._c.set(p.color);
      im.setColorAt(n, this._c);
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };

  // ------------------------------------------------------------------ actors (event objects)
  /** actor: { obj (Object3D), update(dt, t) -> false to remove, onTap(), tapRadius } */
  Scene.addActor = function (a) {
    this.actorGroup.add(a.obj);
    this.actors.push(a);
    return a;
  };
  Scene.removeActor = function (a) {
    this.actorGroup.remove(a.obj);
    const i = this.actors.indexOf(a);
    if (i >= 0) this.actors.splice(i, 1);
  };
  Scene.voxMesh = function (key, build, opts) {
    return new THREE.Mesh(cachedGeo(key, build, opts), (opts && opts.material) || VC.Voxel.material());
  };

  // ------------------------------------------------------------------ input
  Scene.pick = function (sx, sy) {
    const ndc = new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Actors first, with a generous screen-space radius (fingers are fat).
    let best = null, bestD = 1e9;
    for (const a of this.mode === 'island' ? this.actors : []) {
      if (!a.onTap) continue;
      const p = this.project(a.obj.position);
      const d = Math.hypot(p.x - sx, p.y - sy);
      const r = a.tapRadius || 60;
      if (d < r && d < bestD) { best = a; bestD = d; }
    }
    if (best) return { actor: best };
    if (this.mode === 'island' && this.buildMode) {
      const hits = this.raycaster.intersectObjects(this.plotMeshes.concat(Object.values(this.buildingMeshes)), false);
      if (hits.length) return { plot: hits[0].object.userData.plot };
    }
    return null;
  };

  Scene.project = function (v3) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.copy(v3).project(this.camera);
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, behind: v.z > 1 };
  };
  Scene.unproject = function (sx, sy, y) {
    const ndc = new THREE.Vector3((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1, 0.5);
    ndc.unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const t = (y - this.camera.position.y) / dir.y;
    return this.camera.position.clone().add(dir.multiplyScalar(t));
  };

  Scene.drag = function (dx, dy) {
    if (this.mode !== 'island') return;
    this.cam.wantYaw = Math.max(-1.1, Math.min(1.1, this.cam.wantYaw - dx * 0.006));
    this.cam.pitch = Math.max(0.45, Math.min(1.05, this.cam.pitch + dy * 0.003));
  };
  Scene.zoom = function (k) {
    this.cam.dist = Math.max(12, Math.min(34, this.cam.dist * k));
  };

  /** Spawns gold coins flying up from a screen point (tap feedback). */
  Scene.coinBurst = function (sx, sy, n, big) {
    const p = this.unproject(sx, sy, 0.8);
    if (!isFinite(p.x)) return;
    this.burst([p.x, p.y, p.z], n, { color: big ? ['#ffd23f', '#fff2a0', '#ff9b2a'] : ['#ffd23f', '#e0a020'], speed: big ? 5 : 3, up: 1.6, size: big ? 0.2 : 0.14, life: 0.8 });
  };

  // ------------------------------------------------------------------ battle stage
  Scene.startBattle = function (player, enemy, region) {
    this.mode = 'battle';
    this.islandGroup.visible = false;
    this.shallow.visible = false;
    this.decor.forEach(d => { d.visible = true; });
    const g = this.battleGroup;
    while (g.children.length) g.remove(g.children[0]);
    g.visible = true;
    this.seaTint = region ? region.sea : null;
    this.stormy = region && region.id === 8;
    this.balls = [];
    // player ship (side 0) on the near side, broadside toward the enemy
    const ps = player.model ? this.makeEnemyModel(player.model) : this.shipMesh(player.shipOpts, player.shipKey);
    ps.position.set(0, 0, 4.2);
    g.add(ps);
    const es = this.makeEnemyModel(enemy.model);
    es.position.set(0, 0, -4.6);
    const k = enemy.model.kind;
    // Ships and long creatures show their side; compact creatures face the player.
    if (!k || k === 'ship' || k === 'serpent' || k === 'fish') es.rotation.y = Math.PI;
    else es.rotation.y = -Math.PI / 2;
    g.add(es);
    this.bShips = [ps, es];
    this.bState = [{ sink: 0, hitT: 0 }, { sink: 0, hitT: 0 }];
    // Frame both ships: move the camera back until both hulls fit the part of the
    // screen that the battle HUD leaves free.
    const portrait = this.w / this.h < 0.8;
    const yaw = portrait ? 0.32 : 0.25, pitch = portrait ? 0.78 : 0.6;
    const halfL = Math.max(ps.userData.length || 5, es.userData.length || 5, 5) / 2 + 0.6;
    const top = 3.2 + halfL * 0.35;
    const corners = [];
    for (const x of [-halfL, halfL]) for (const y of [-0.3, top]) for (const z of [-4.6 - 1.6, 4.2 + 1.6]) corners.push(new THREE.Vector3(x, y, z));
    const target = new THREE.Vector3(0, 0.6, -0.1);
    const tmp = this.camera.clone();
    tmp.clearViewOffset();
    tmp.fov = portrait ? 64 : 50;
    tmp.aspect = this.w / this.h;
    tmp.updateProjectionMatrix();
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    let d = 8;
    const yMin = portrait ? -0.36 : -0.5, yMax = portrait ? 0.68 : 0.72;
    for (let it = 0; it < 60; it++) {
      tmp.position.copy(target).addScaledVector(dir, d);
      tmp.lookAt(target);
      tmp.updateMatrixWorld();
      let fit = true;
      for (const c of corners) {
        const p = c.clone().project(tmp);
        if (p.x < -0.94 || p.x > 0.94 || p.y < yMin || p.y > yMax) { fit = false; break; }
      }
      if (fit) break;
      d *= 1.06;
    }
    // Shift the look-at point so the fitted box is centred in the free band.
    this.bCam = { x: target.x + dir.x * d, y: target.y + dir.y * d, z: target.z + dir.z * d, ly: target.y, lz: target.z, fov: tmp.fov,
      off: 0 };
  };

  Scene.makeEnemyModel = function (model) {
    if (!model || model.kind === 'ship' || !model.kind) {
      const grp = this.shipMesh({ tier: model.tier, style: model.style, seed: 9 });
      return grp;
    }
    const build = M.CREATURES[model.kind](model);
    const grp = new THREE.Group();
    grp.userData.parts = [];
    build.parts.forEach((p, i) => {
      const key = 'cr:' + model.kind + ':' + JSON.stringify(model) + ':' + i;
      let geo = geoCache.get(key);
      if (!geo) { geo = VC.Voxel.mesh(p.vox, { scale: S, center: [0, 0, 0] }); geoCache.set(key, geo); }
      const mat = build.glow ? VC.Voxel.material({ emissive: 0x222244 }) : VC.Voxel.material();
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.pos[0] * S, p.pos[1] * S - build.waterline * S, p.pos[2] * S);
      if (p.rotY) m.rotation.y = p.rotY;
      m.userData.anim = p.anim; m.userData.phase = p.phase || 0; m.userData.sign = p.sign || 1;
      m.userData.base = m.position.clone();
      grp.add(m);
      grp.userData.parts.push(m);
    });
    grp.userData.length = model.kind === 'serpent' ? 8 * (model.size || 1) : model.kind === 'kraken' ? 7 : 5 * (model.size || 1);
    grp.userData.creature = true;
    return grp;
  };

  Scene.animCreature = function (grp, t) {
    for (const m of grp.userData.parts || []) {
      const a = m.userData.anim, ph = m.userData.phase, b = m.userData.base;
      if (a === 'claw') m.rotation.z = Math.sin(t * 3 + ph) * 0.25 * m.userData.sign;
      else if (a === 'hump') m.position.y = b.y + Math.sin(t * 1.5 + ph) * 0.25;
      else if (a === 'head') { m.position.y = b.y + Math.sin(t * 1.3) * 0.3; m.rotation.z = Math.sin(t * 0.9) * 0.1; }
      else if (a === 'breathe') m.scale.y = 1 + Math.sin(t * 1.4) * 0.05;
      else if (a === 'tentacle') { m.rotation.z = Math.sin(t * 1.2 + ph) * 0.25; m.rotation.x = Math.cos(t * 0.9 + ph) * 0.15; }
      else if (a === 'swim') { m.position.y = b.y + Math.sin(t * 2) * 0.15; m.rotation.x = Math.sin(t * 1.5) * 0.08; }
      else if (a === 'arm') m.rotation.x = Math.sin(t * 1.1) * 0.3 * m.userData.sign;
      else if (a === 'float') m.position.y = b.y + Math.sin(t * 1.2) * 0.3;
      else if (a === 'bolt') m.visible = Math.sin(t * 17) > 0.3;
    }
  };

  Scene.endBattle = function () {
    this.mode = 'island';
    this.resize();
    this.battleGroup.visible = false;
    this.islandGroup.visible = true;
    this.shallow.visible = true;
    this.seaTint = null;
    this.stormy = false;
    this.balls = [];
  };

  function sidePoint(ship, frac, y, facingSign) {
    const L = ship.userData.length || 5;
    const p = ship.position;
    return [p.x + (frac - 0.5) * L * 0.75, p.y + y, p.z + facingSign * 0.9];
  }

  /** Visualises a combat fx event. */
  Scene.battleFx = function (e) {
    if (this.mode !== 'battle' || !this.bShips) return;
    if (e.t === 'fire') {
      const from = this.bShips[e.side], to = this.bShips[1 - e.side];
      const dirSign = e.side === 0 ? -1 : 1;
      const n = Math.min(8, e.balls);
      for (let k = 0; k < n; k++) {
        const a = sidePoint(from, (k + 0.5) / n, 0.55, dirSign);
        const hit = k < Math.round(e.hits / e.balls * n);
        const b = hit ? sidePoint(to, Math.random(), 0.5 + Math.random() * 0.6, -dirSign) :
          [to.position.x + (Math.random() - 0.5) * 6, -0.1, to.position.z + (Math.random() - 0.5) * 3 - dirSign * 1.5];
        this.balls.push({ a, b, t: -k * 0.04, dur: 0.55, hit, ammo: e.ammo, target: 1 - e.side });
        // muzzle flash + smoke
        this.burst(a, 3, { color: ['#ffd23f', '#ff8a1f'], speed: 1.5, grav: 0, life: 0.18, size: 0.18 });
        this.burst(a, 3, { color: ['#e8e8e8', '#cfcfcf'], speed: 0.8, grav: -0.6, life: 0.9, size: 0.25, grow: 1.4, shrink: false, drag: 2 });
      }
      this.bState[e.side].recoil = 0.25;
    } else if (e.t === 'hit') {
      this.bState[e.side].hitT = 0.25;
      if (e.side === 0) this.shake = Math.max(this.shake, e.crit ? 0.35 : 0.18);
    } else if (e.t === 'lightning') {
      const s = this.bShips[e.side].position;
      for (let y = 0; y < 14; y++) this.emit({ pos: [s.x + Math.sin(y * 2.3) * 0.4, 12 - y * 0.85, s.z], vel: [0, 0, 0], life: 0.35, size: 0.3, color: '#fff6a0', grav: 0, shrink: true });
      this.flash = 0.25;
      this.shake = 0.4;
    } else if (e.t === 'abil') {
      const s = this.bShips[e.side].position;
      const col = { repair: '#7dff9a', heal: '#7dff9a', evade: '#c9f3ff', distract: '#5fd068', song: '#6fe0d0', firevolley: '#ff6a2b', raid: '#e85d5d', legend: '#ffd23f', rally: '#ffd23f', shield: '#5ff3ff', phase: '#bfeee0', freeze: '#bfefff', ink: '#222', charm: '#ff9ad5', grab: '#9b3b6b', board: '#e85d5d' }[e.id] || '#fff';
      this.burst([s.x, s.y + 1.5, s.z], 24, { color: col, speed: 3, grav: 1, life: 1, size: 0.16 });
    } else if (e.t === 'end') {
      if (e.reason === 'sink' || e.reason === 'board') this.bState[1 - e.winner].sink = 0.001;
    } else if (e.t === 'board' && e.ok) {
      this.bState[1 - e.side].sink = 0.001;
    }
  };

  Scene.updateBattle = function (dt) {
    const t = this.t;
    if (!this.bShips) return;
    this.bShips.forEach((s, i) => {
      const st = this.bState[i];
      const baseZ = i === 0 ? 4.2 : -4.6;
      if (s.userData.creature) this.animCreature(s, t);
      const w = this.waveAt(s.position.x, baseZ);
      s.position.y = w * 0.8 - (st.sink > 0 ? st.sink * st.sink * 1.2 : 0);
      s.rotation.x = Math.sin(t * 0.9 + i) * 0.035 + (st.hitT > 0 ? Math.sin(st.hitT * 40) * 0.03 : 0) + (st.recoil || 0) * (i === 0 ? 0.15 : -0.15);
      s.rotation.z = Math.sin(t * 0.7 + i * 2) * 0.03 + (st.sink > 0 ? st.sink * 0.25 * (i ? -1 : 1) : 0);
      if (st.hitT > 0) st.hitT -= dt;
      if (st.recoil > 0) st.recoil = Math.max(0, st.recoil - dt);
      if (st.sink > 0) {
        st.sink = Math.min(3.5, st.sink + dt);
        if (Math.random() < 0.3) this.burst([s.position.x + (Math.random() - 0.5) * 3, 0.2, s.position.z], 2, { color: ['#ffffff', '#bfe9ff'], speed: 2, life: 0.6, size: 0.12 });
      }
      if (st.burn) {
        if (Math.random() < 0.5) this.emit({ pos: [s.position.x + (Math.random() - 0.5) * (s.userData.length || 4) * 0.6, s.position.y + 0.8 + Math.random(), s.position.z], vel: [0, 1.5, 0], life: 0.7, size: 0.18, color: Math.random() < 0.5 ? '#ff6a2b' : '#ffd23f', grav: -1, shrink: true });
      }
    });
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      if (b.t < 0) continue;
      const k = Math.min(1, b.t / b.dur);
      const x = b.a[0] + (b.b[0] - b.a[0]) * k;
      const y = b.a[1] + (b.b[1] - b.a[1]) * k + Math.sin(k * Math.PI) * 1.4;
      const z = b.a[2] + (b.b[2] - b.a[2]) * k;
      const col = b.ammo === 'fire' ? '#ff6a2b' : b.ammo === 'chain' ? '#555555' : b.ammo === 'grape' ? '#8a8a8a' : '#1a1a1a';
      this.emit({ pos: [x, y, z], vel: [0, 0, 0], life: 0.03, size: b.ammo === 'grape' ? 0.1 : 0.16, color: col, grav: 0, shrink: false });
      if (b.ammo === 'fire') this.emit({ pos: [x, y, z], vel: [0, 0.3, 0], life: 0.25, size: 0.12, color: '#ffd23f', grav: 0 });
      if (k >= 1) {
        this.balls.splice(i, 1);
        if (b.hit) {
          const ship = this.bShips[b.target];
          const hullCol = ship.userData.creature ? ['#9b3b6b', '#e2553a', '#7fb6b0'] : ['#8a5a32', '#6b4423', '#c8a26a', '#2a2a2a'];
          this.burst([x, y, z], 7, { color: hullCol, speed: 4, life: 1.1, size: 0.14 });
          this.burst([x, y, z], 3, { color: ['#ffd23f', '#ff6a2b'], speed: 2, grav: 0, life: 0.2, size: 0.25 });
          this.burst([x, y, z], 2, { color: '#9a9a9a', speed: 0.6, grav: -0.5, life: 1, size: 0.3, grow: 1, shrink: false, drag: 2 });
        } else {
          this.burst([x, 0.05, z], 10, { color: ['#ffffff', '#cdefff', '#8fd3f5'], speed: 2.2, up: 2.2, life: 0.7, size: 0.13 });
        }
      }
    }
  };

  Scene.setBurning = function (side, on) {
    if (this.bState && this.bState[side]) this.bState[side].burn = on;
  };

  // ------------------------------------------------------------------ frame
  /** Shifts the picture up so the island stays visible above an open panel (0..1 of screen height). */
  Scene.setPanelCover = function (frac) { this.wantViewOff = frac; };

  Scene.applyViewOffset = function (dt) {
    this.viewOff += (this.wantViewOff - this.viewOff) * Math.min(1, dt * 7);
    const cam = this.camera;
    if (Math.abs(this.viewOff) < 0.002 && this.mode === 'island' && this.wantViewOff === 0) {
      if (cam.view && cam.view.enabled) { cam.clearViewOffset(); }
      return;
    }
    // In battle the HUD cards cover the bottom third: keep the ships above them.
    const off = this.mode === 'island' ? this.viewOff : (this.bCam ? this.bCam.off : 0);
    cam.setViewOffset(this.w, this.h, 0, this.h * off * 0.5, this.w, this.h);
  };

  Scene.update = function (dt) {
    this.t += dt;
    this.applyViewOffset(dt);
    const t = this.t;
    this.updateSea(t);
    this.applySky();
    for (const c of this.clouds) { c.position.x += dt * 0.6; if (c.position.x > 90) c.position.x = -90; }
    const cam = this.camera;
    if (this.mode === 'island') {
      this.cam.yaw += (this.cam.wantYaw - this.cam.yaw) * Math.min(1, dt * 6);
      const c = this.cam;
      const d = c.dist;
      cam.position.set(c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * d, c.target.y + Math.sin(c.pitch) * d,
        c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * d);
      cam.lookAt(c.target);
      if (this.playerShip && !this.playerShip.userData.wreck) {
        const s = this.playerShip;
        s.position.y = this.waveAt(s.position.x, s.position.z) * 0.8;
        s.rotation.z = Math.sin(t * 0.8) * 0.03;
        s.rotation.x = Math.sin(t * 0.6) * 0.02;
      }
      if (this.chest) this.chest.position.y = 0.25 + (this.chestPulse > 0 ? Math.sin(this.chestPulse * 30) * 0.05 : 0);
      if (this.chestPulse > 0) this.chestPulse -= dt;
    } else {
      const b = this.bCam;
      if (cam.fov !== b.fov) { cam.fov = b.fov; cam.updateProjectionMatrix(); }
      cam.position.set(b.x + Math.sin(t * 0.2) * 0.3, b.y, b.z);
      cam.lookAt(0, b.ly, b.lz);
      this.updateBattle(dt);
    }
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    // Island events freeze (and hide) while a sea battle is on.
    this.actorGroup.visible = this.mode === 'island';
    if (this.mode === 'island') {
      for (let i = this.actors.length - 1; i >= 0; i--) {
        const a = this.actors[i];
        if (a.update && a.update(dt, t) === false) this.removeActor(a);
      }
    }
    this.updateParticles(dt);
    if (this.flash > 0) {
      this.flash -= dt;
      this.scene.background = new THREE.Color(0xffffff);
    }
    this.renderer.render(this.scene, cam);
  };

  Scene.S = S;
  VC.Scene = Scene;
})(window.VC);
