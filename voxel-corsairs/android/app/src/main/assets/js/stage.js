'use strict';
// Sea battle stage: both ships or creatures, cannonballs, hits, sinking, battle camera.
(function (VC) {
  const Scene = VC.Scene;
  const S = Scene.S;
  const M = VC.Models;
  const cachedGeo = Scene.cachedGeo;
  const geoCache = Scene.geoCache;

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
    this.fire('battleStart', { ships: this.bShips, player, enemy, region });
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
    this.fire('battleEnd');
  };

  function sidePoint(ship, frac, y, facingSign) {
    const L = ship.userData.length || 5;
    const p = ship.position;
    return [p.x + (frac - 0.5) * L * 0.75, p.y + y, p.z + facingSign * 0.9];
  }

  /** Visualises a combat fx event. */
  Scene.battleFx = function (e) {
    if (this.mode !== 'battle' || !this.bShips) return;
    this.fire('battleFx', e);
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

  Scene.updateStage = function (dt, t) {
    const cam = this.camera;
    const b = this.bCam;
    if (cam.fov !== b.fov) { cam.fov = b.fov; cam.updateProjectionMatrix(); }
    cam.position.set(b.x, b.y, b.z);
    cam.lookAt(0, b.ly, b.lz);
    this.updateBattle(dt);
    this.fire('battleUpdate', dt, t);
  };

})(window.VC);
