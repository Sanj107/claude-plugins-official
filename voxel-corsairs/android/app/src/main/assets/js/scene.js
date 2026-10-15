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
    quality = quality || 'auto';
    const dpr = window.devicePixelRatio || 1;
    // MSAA is fixed for the life of the GL context: on unless asked for low graphics or the
    // screen is so dense that it is not worth the bandwidth.
    const aa = quality !== 'low' && dpr <= 2.5;
    const r = new THREE.WebGLRenderer({ canvas, antialias: aa, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(dpr, quality === 'low' ? 1 : 2));
    this.renderer = r;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog(0x9fd8f5, 42, 150);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    this.hemi = new THREE.HemisphereLight(0xdff3ff, 0x7a6a4a, 0.75);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 0.85);
    this.sun.position.set(-20, 40, 25);
    scene.add(this.sun);
    this.quality = quality;
    this.qualityLevel = this.resolveQuality(quality);
    this.Q = QUALITY[this.qualityLevel];
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
    this.applyQuality(this.qualityLevel);
    this.fire('init');
  };

  // ------------------------------------------------------------------ graphics quality
  // settings.quality: 'auto' | 'low' | 'medium' | 'high' ('auto' picks a level from the device and
  // a short frame-time probe). A level sets the pixel-ratio cap, the voxel-water density and LOD
  // distance (sea.js), the strength of the surface textures and the clouds and their shadows.
  const QUALITY = {
    low: { pr: 1, water: 'low', detail: 0.55, clouds: 5, shadows: false },
    medium: { pr: 1.5, water: 'medium', detail: 0.85, clouds: 8, shadows: true },
    high: { pr: 2, water: 'high', detail: 1, clouds: 11, shadows: true },
  };
  const LEVELS = ['low', 'medium', 'high'];
  Scene.QUALITY = QUALITY;

  /** First guess for 'auto' from the GPU and the screen. */
  Scene.guessQuality = function () {
    const r = this.renderer, caps = r.capabilities, gl = r.getContext();
    let name = '';
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    } catch (e) { /* not exposed */ }
    if (/swiftshader|llvmpipe|software|mali-4|adreno \(tm\) [23]\d\d\b|powervr sgx/i.test(name)) return 'low';
    if (caps.precision !== 'highp' || caps.maxTextureSize < 4096) return 'low';
    if (!caps.isWebGL2) return 'medium';
    if (/mali-t|adreno \(tm\) [45]\d\d\b/i.test(name)) return 'medium';
    return (window.devicePixelRatio || 1) > 3 ? 'medium' : 'high';
  };

  Scene.resolveQuality = function (q) {
    if (QUALITY[q]) return q;
    if (!this.autoLevel) {
      this.autoLevel = this.guessQuality();
      this.probe = { n: 0, t: 0, c: 0, steps: 0 };
    }
    return this.autoLevel;
  };

  /** Switches graphics quality at runtime (settings panel). */
  Scene.setQuality = function (q) {
    this.quality = q || 'auto';
    if (this.quality === 'auto' && this.probe) { this.probe.n = 0; this.probe.t = 0; this.probe.c = 0; }
    this.applyQuality(this.resolveQuality(this.quality));
  };

  Scene.applyQuality = function (level) {
    const Q = QUALITY[level] || QUALITY.medium;
    this.qualityLevel = level;
    this.Q = Q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    if (this.w) this.resize();
    VC.Voxel.uniforms.uVxDetail.value = Q.detail;
    this.fire('quality', level, Q);
  };

  /** 'auto': measures the frame time for a few seconds and steps the level down (or once up). */
  Scene.probeQuality = function (dt) {
    const p = this.probe;
    if (!p || this.quality !== 'auto' || p.done) return;
    p.n++;
    if (p.n < 45 || dt > 0.25) return; // skip loading hitches and background pauses
    p.t += dt; p.c++;
    if (p.c < 100) return;
    const avg = p.t / p.c, i = LEVELS.indexOf(this.autoLevel);
    p.n = 0; p.t = 0; p.c = 0;
    let next = i;
    if (avg > 0.036 && i > 0) next = i - 1;
    else if (avg < 0.0185 && i < 2 && !p.up) { next = i + 1; p.up = true; }
    if (next === i || ++p.steps > 3) { p.done = true; return; }
    this.autoLevel = LEVELS[next];
    this.applyQuality(this.autoLevel);
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

  // ------------------------------------------------------------------ shared materials & geometry helpers
  /** Time uniform shared by the animated materials (cloth, water). */
  Scene.clothTime = { value: 0 };
  const matCache = {};

  /**
   * Vertex-coloured Lambert material whose geometry carries a `cloth` attribute (vec3):
   * x = billow along +x, y = flag flutter amplitude, z = billow along +z (world units).
   * Sails breathe and flags wave in the vertex shader: no per-frame geometry updates.
   */
  Scene.clothMaterial = function (ghost) {
    const k = ghost ? 'clothGhost' : 'cloth';
    if (matCache[k]) return matCache[k];
    const m = new THREE.MeshLambertMaterial(ghost ? { vertexColors: true, transparent: true, opacity: 0.82, emissive: 0x1a4a3a } : { vertexColors: true });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = Scene.clothTime;
      sh.vertexShader = 'attribute vec3 cloth;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float cph = modelMatrix[3].x * 0.9 + modelMatrix[3].z * 0.6;',
        'transformed.x += cloth.x * (0.72 + 0.28 * sin(uTime * 1.7 + cph + position.y * 0.5));',
        'transformed.z += cloth.z * (0.7 + 0.3 * sin(uTime * 1.5 + cph));',
        'transformed.z += cloth.y * sin(uTime * 7.0 + position.x * 5.0 + cph);',
        'transformed.y += cloth.y * 0.3 * cos(uTime * 6.0 + position.x * 4.0 + cph);',
      ].join('\n'));
    };
    VC.Voxel.texturize(m, k);
    matCache[k] = m;
    return m;
  };

  /** Lamps, windows and fire: vertex colour emission scaled by Scene.glowLevel (night). */
  Scene.glowMaterial = function () {
    if (matCache.glow) return matCache.glow;
    const m = VC.Voxel.texturize(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.15 }), 'glow');
    matCache.glow = m;
    return m;
  };
  /** Sets how strongly lamps glow (0 day .. 1 night). */
  Scene.setGlow = function (k) {
    const m = this.glowMaterial();
    m.emissiveIntensity = 0.12 + k * 0.95;
  };

  Scene.ghostMaterial = function () {
    return matCache.ghost || (matCache.ghost = VC.Voxel.material({ transparent: true, opacity: 0.82, emissive: 0x1a4a3a }));
  };

  /** Scale of a normalized integer array (value / scale = float). */
  const NORM = new Map([[Int8Array, 127], [Uint8Array, 255], [Int16Array, 32767], [Uint16Array, 65535]]);
  /**
   * Merges geometries into one (positions/normals transformed). items: [{ geo, matrix? }].
   * Keeps position, normal, color and any extra attribute that every item has (plus the voxel
   * texture attribute `vox`, zero = untextured where an item lacks it). Attribute array types
   * (Int8 normals, Uint8 colours, Int16 voxel coordinates) are kept when all items agree.
   */
  Scene.mergeGeos = function (items) {
    items = items.filter(it => it.geo && it.geo.attributes.position.count);
    const out = new THREE.BufferGeometry();
    if (!items.length) {
      out.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
      out.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
      return out;
    }
    const names = Object.keys(items[0].geo.attributes).filter(n => items.every(it => it.geo.attributes[n]));
    if (names.indexOf('vox') < 0 && items.some(it => it.geo.attributes.vox)) names.push('vox');
    let nv = 0, ni = 0;
    for (const it of items) { nv += it.geo.attributes.position.count; ni += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
    const arrs = {}, spec = {};
    for (const n of names) {
      const ref = items.find(it => it.geo.attributes[n]).geo.attributes[n];
      const T = ref.array.constructor, norm = !!ref.normalized, size = ref.itemSize;
      const same = items.every(it => { const a = it.geo.attributes[n]; return !a || (a.array.constructor === T && !!a.normalized === norm && a.itemSize === size); });
      spec[n] = same ? { T, norm, size } : { T: Float32Array, norm: false, size };
      arrs[n] = new spec[n].T(nv * size);
    }
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const nm = new THREE.Matrix3();
    const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    let vo = 0, io = 0;
    for (const it of items) {
      const g = it.geo, cnt = g.attributes.position.count, m = it.matrix;
      let e = null, q = null, ql = 1;
      if (m) { nm.getNormalMatrix(m); e = m.elements; q = nm.elements; ql = 1 / (Math.hypot(q[0], q[1], q[2]) || 1); }
      for (const n of names) {
        const a = g.attributes[n];
        if (!a) continue; // stays zero
        const src = a.array, sz = a.itemSize, dst = arrs[n], sp = spec[n];
        const kin = a.normalized ? 1 / (NORM.get(src.constructor) || 1) : 1;
        if (n === 'position' && (e || !(src instanceof Float32Array))) {
          for (let i = 0, o = vo * 3; i < cnt * 3; i += 3, o += 3) {
            const x = src[i] * kin, y = src[i + 1] * kin, z = src[i + 2] * kin;
            let px = x, py = y, pz = z;
            if (e) { px = e[0] * x + e[4] * y + e[8] * z + e[12]; py = e[1] * x + e[5] * y + e[9] * z + e[13]; pz = e[2] * x + e[6] * y + e[10] * z + e[14]; }
            dst[o] = px; dst[o + 1] = py; dst[o + 2] = pz;
            if (px < bb[0]) bb[0] = px; if (py < bb[1]) bb[1] = py; if (pz < bb[2]) bb[2] = pz;
            if (px > bb[3]) bb[3] = px; if (py > bb[4]) bb[4] = py; if (pz > bb[5]) bb[5] = pz;
          }
        } else if (e && n === 'normal') {
          // rotation + uniform scale: unit normals only need the one scale factor
          const ko = sp.norm ? (NORM.get(sp.T) || 1) : 1, rnd = sp.T !== Float32Array;
          for (let i = 0, o = vo * 3; i < cnt * 3; i += 3, o += 3) {
            const x = src[i] * kin, y = src[i + 1] * kin, z = src[i + 2] * kin;
            const nx = (q[0] * x + q[3] * y + q[6] * z) * ql * ko, ny = (q[1] * x + q[4] * y + q[7] * z) * ql * ko, nz = (q[2] * x + q[5] * y + q[8] * z) * ql * ko;
            dst[o] = rnd ? Math.round(nx) : nx; dst[o + 1] = rnd ? Math.round(ny) : ny; dst[o + 2] = rnd ? Math.round(nz) : nz;
          }
        } else {
          if (sp.T === src.constructor) dst.set(src.subarray(0, cnt * sz), vo * sz);
          else for (let i = 0, o = vo * sz; i < cnt * sz; i++, o++) dst[o] = src[i] * kin;
          if (n === 'position') for (let i = 0; i < cnt * 3; i += 3) {
            const px = src[i], py = src[i + 1], pz = src[i + 2];
            if (px < bb[0]) bb[0] = px; if (py < bb[1]) bb[1] = py; if (pz < bb[2]) bb[2] = pz;
            if (px > bb[3]) bb[3] = px; if (py > bb[4]) bb[4] = py; if (pz > bb[5]) bb[5] = pz;
          }
        }
      }
      if (g.index) { const s = g.index.array; for (let i = 0; i < s.length; i++) idx[io + i] = s[i] + vo; io += s.length; }
      else { for (let i = 0; i < cnt; i++) idx[io + i] = vo + i; io += cnt; }
      vo += cnt;
    }
    for (const n of names) out.setAttribute(n, new THREE.BufferAttribute(arrs[n], spec[n].size, spec[n].norm));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    // bounding sphere from the box (cheaper than computeBoundingSphere on big merges)
    const c = new THREE.Vector3((bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2);
    out.boundingSphere = new THREE.Sphere(c, Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) / 2);
    return out;
  };

  // ------------------------------------------------------------------ ships
  const shipCache = new Map();
  const rigMats = {};
  /**
   * A ship as a THREE.Group: hull mesh, cloth mesh (sails + flags, animated in the shader),
   * rigging (LineSegments), lamps (glow). userData: { info, length, deckY, halfW } in world units
   * relative to the group origin (the waterline).
   */
  Scene.shipMesh = function (opts, key) {
    const k = key || ('ship:' + opts.tier + ':' + JSON.stringify(opts.style));
    let sp = shipCache.get(k);
    if (!sp) {
      const info = M.ship(opts);
      const center = [(info.vox.minX + info.vox.maxX + 1) / 2, info.waterline, 0];
      const mo = { scale: S, center };
      const hull = VC.Voxel.mesh(info.vox, { scale: S, center, occluders: info.glow });
      const glow = info.glow.count ? VC.Voxel.mesh(info.glow, { scale: S, center, occluders: info.vox }) : null;
      const cloth = info.cloth.length ? this.mergeGeos(info.cloth.map(c => ({ geo: VC.Voxel.mesh(c.vox, Object.assign({ attr: { name: 'cloth', size: 3, fn: c.fn }, occluders: info.vox }, mo)) }))) : null;
      let rig = null;
      if (info.rig.length) {
        const pts = new Float32Array(info.rig.length * 6);
        info.rig.forEach(([a, b], i) => {
          for (let j = 0; j < 3; j++) { pts[i * 6 + j] = (a[j] - center[j]) * S; pts[i * 6 + 3 + j] = (b[j] - center[j]) * S; }
        });
        rig = new THREE.BufferGeometry();
        rig.setAttribute('position', new THREE.BufferAttribute(pts, 3));
        rig.computeBoundingSphere();
      }
      sp = { info, hull, glow, cloth, rig, center };
      shipCache.set(k, sp);
    }
    const st = opts.style;
    const ghost = st === 'ghost' || st === 'abyss' || (st && st.ghost);
    const grp = new THREE.Group();
    const hullMesh = new THREE.Mesh(sp.hull, ghost ? this.ghostMaterial() : VC.Voxel.material());
    grp.add(hullMesh);
    if (sp.cloth) {
      const cm = new THREE.Mesh(sp.cloth, this.clothMaterial(ghost));
      cm.onBeforeRender = () => { Scene.clothTime.value = Scene.t; };
      grp.add(cm);
    }
    if (sp.rig) {
      const rk = ghost ? 'g' : 'n';
      const lm = rigMats[rk] || (rigMats[rk] = new THREE.LineBasicMaterial(ghost ? { color: 0x7dffc8, transparent: true, opacity: 0.55 } : { color: 0x3a2a1a }));
      grp.add(new THREE.LineSegments(sp.rig, lm));
    }
    if (sp.glow) grp.add(new THREE.Mesh(sp.glow, this.glowMaterial()));
    const info = sp.info;
    grp.userData.info = info;
    grp.userData.length = info.length * S;
    grp.userData.deckY = (info.deckY - sp.center[1]) * S;
    grp.userData.halfW = info.halfW * S;
    grp.userData.bowX = (info.length - sp.center[0]) * S;
    grp.userData.sternX = -sp.center[0] * S;
    grp.userData.hull = hullMesh;
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

  /** Seconds for a full day (dayT 0..1: 0.08 sunrise, 0.5 noon, 0.62 sunset, 0.72..1 night). */
  Scene.dayLen = 1200;

  Scene.update = function (dt) {
    this.t += dt;
    this.dayT = (this.dayT + dt / this.dayLen) % 1;
    this.probeQuality(dt);
    this.applyViewOffset(dt);
    const t = this.t;
    const U = VC.Voxel.uniforms;
    U.uVxTime.value = t;
    U.uVxNight.value = this.glowLevel || 0;
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
