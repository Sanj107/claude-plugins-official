'use strict';
// Sea surface, sky colours over the day, clouds, stars and distant islands.
(function (VC) {
  const Scene = VC.Scene;
  const S = Scene.S;
  const M = VC.Models;
  const cachedGeo = Scene.cachedGeo;
  const geoCache = Scene.geoCache;

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
  Scene.updateSky = function (dt) {
    for (const c of this.clouds) { c.position.x += dt * 0.6; if (c.position.x > 90) c.position.x = -90; }
  };

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

})(window.VC);
