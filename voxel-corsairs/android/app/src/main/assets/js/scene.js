'use strict';
// three.js scene core: renderer, camera, particles, actors, picking, hooks and the frame loop.
// World parts live in sea.js (sea & sky), island.js (island view) and stage.js (sea battles).
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
    viewOff: 0, wantViewOff: 0,
    hooks: {},
  };

  // Extension points used by the world modules (island.js, stage.js, sea.js, people.js, life.js):
  //   init(), island(state), buildings(state), playerShip(group, state), update(dt, t),
  //   battleStart({ships, player, enemy, region}), battleUpdate(dt, t), battleFx(event), battleEnd()
  Scene.on = function (name, fn) { (this.hooks[name] = this.hooks[name] || []).push(fn); };
  Scene.fire = function (name, a, b, c) {
    const list = this.hooks[name];
    if (list) for (const fn of list) fn.call(this, a, b, c);
  };
  Scene.cachedGeo = cachedGeo;
  Scene.geoCache = geoCache;

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
    this.fire('init');
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

  /** Spawns gold coins flying up from a screen point (tap feedback). */
  Scene.coinBurst = function (sx, sy, n, big) {
    const p = this.unproject(sx, sy, 0.8);
    if (!isFinite(p.x)) return;
    this.burst([p.x, p.y, p.z], n, { color: big ? ['#ffd23f', '#fff2a0', '#ff9b2a'] : ['#ffd23f', '#e0a020'], speed: big ? 5 : 3, up: 1.6, size: big ? 0.2 : 0.14, life: 0.8 });
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
    this.updateSky(dt, t);
    const cam = this.camera;
    if (this.mode === 'island') this.updateIsland(dt, t);
    else this.updateStage(dt, t);
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
    this.fire('update', dt, t);
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
