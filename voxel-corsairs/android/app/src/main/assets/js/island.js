'use strict';
// Island view: terrain, village and jungle decor, plots and buildings, piers, the docked player
// ship, island animation (windmill, waterfall, smoke, lamps at night) and the fixed camera.
//
// Layout (world units; the island group sits at the origin, sea level is y = 0, +x is right and
// +z points toward the camera, i.e. to the main bay in front of the town):
//   - a 4x4 plot grid in the centre-front (row r = 3 is the shore row by the bay), 2.25 apart,
//     plots 1.75 wide, ground level y = 0.75; lanes run between the plots;
//   - a cobbled harbour promenade in front of the grid, a sandy beach, the main T-pier (chest on
//     its landing, the player's ship moored along its head) and a small second pier on the left;
//   - a village around the grid, a jungle belt, a hill with a waterfall, pond and river at the
//     back, a rocky cape on the left arm and a lagoon in the right arm.
//
// API for the people / ambient-life modules:
//   VC.Scene.island = {
//     radius,                       // approx land radius in world units
//     ground,                       // plateau ground height (top of the plots), 0.75
//     groundY(x, z),                // walkable top height at x,z (terrain, promenade, pier decks)
//                                   // or null over water
//     paths: [[[x,z],...], ...],    // walkable polylines: plot lanes, promenade, piers, beach, village
//     spots: { pier:[x,z], pier2:[x,z], plaza:[x,z], chest:[x,z], campfire:[x,z], well:[x,z],
//              beach:[[x,z],...], doors:{<plotIndex>:[x,z]},
//              sea:{ near:[[x,z],...], horizon:[[x,z],...] } },
//     shoreline: [[x,z],...],       // closed polygon roughly following the outer coast
//     plotWorld(i) -> {x, y, z},    // centre of plot i on the ground
//     dock: {x, z},                 // where the player's ship is moored (hull centre at the waterline)
//   }
//   Hooks fired: 'island'(state) after buildIsland, 'buildings'(state), 'playerShip'(group, state).
//   Lamps glow through Scene.glowMaterial(); its level follows Scene.night (Scene.glowLevel 0..1).
(function (VC) {
  const Scene = VC.Scene;
  const S = Scene.S;            // terrain voxel (0.25)
  const M = VC.Models;
  const HD = M.HD;              // detail voxel (0.125)
  const T = S;
  const GL = 2;                 // plateau top layer
  const GY = (GL + 1) * T;      // ground height 0.75
  // Terrain grid (voxel columns at 0.25): x in [-23, 23), z in [-21, 16.5)
  const IX0 = -92, IX1 = 92, IZ0 = -84, IZ1 = 66;
  const NX = IX1 - IX0, NZ = IZ1 - IZ0;
  const WATER = -99;

  // ------------------------------------------------------------------ layout
  const plotCol = c => -17 + 9 * c;  // first voxel column of the plot bed (7 wide)
  const plotRow = r => -21 + 9 * r;
  function plotWorld(i) {
    const p = VC.PLOTS[i];
    return { x: (plotCol(p.c) + 3.5) * T, y: GY, z: (plotRow(p.r) + 3.5) * T };
  }
  // Main pier (world units): landing on the beach, stem, T-head where the ship moors.
  const PIER = {
    landing: [-0.25, 5.5, 2.75, 7.5], stem: [1.0, 7.5, 2.0, 9.5], head: [-1.75, 9.5, 4.75, 10.5],
    deckY: 0.75,
  };
  const PIER2 = { rect: [-5.75, 8.25, -5.0, 11.75], deckY: 0.625 };
  const PROM = [-6.5, 3.25, 6.5, 5.5]; // cobbled promenade
  const DOCK = { x: 1.5, z: 10.5 };
  const POND = { x: 2.6, z: -9.0, rx: 1.7, rz: 1.25 };
  const FALL = { x0: 2.25, x1: 3.0, z: -10.25 };
  const CLIFF_Z = -10.25;
  const RIVER = [[4.1, -8.3], [6.2, -7.6], [8.0, -5.6], [9.3, -2.6], [10.3, 0.4], [11.0, 2.0]];
  const LAGOON = { x: 12.0, z: 4.6, rx: 2.3, rz: 2.9 };
  const CAMPFIRE = [-3.7, 6.55];

  const sdEllipse = (x, z, cx, cz, rx, rz) => (Math.hypot((x - cx) / rx, (z - cz) / rz) - 1) * Math.min(rx, rz);
  function sdSeg(x, z, ax, az, bx, bz, r) {
    const px = x - ax, pz = z - az, dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / (dx * dx + dz * dz)));
    return Math.hypot(px - dx * t, pz - dz * t) - r;
  }
  function distPolyline(x, z, pl) {
    let best = 1e9;
    for (let i = 0; i < pl.length - 1; i++) best = Math.min(best, sdSeg(x, z, pl[i][0], pl[i][1], pl[i + 1][0], pl[i + 1][1], 0));
    return best;
  }
  /** Signed distance-like land function: < 0 is land. */
  function landSD(x, z) {
    const n = 0.45 * Math.sin(x * 0.41 + 1.3) * Math.cos(z * 0.33 - 0.4) + 0.3 * Math.sin((x - z) * 0.23 + 2.1) + 0.18 * Math.sin(x * 0.93 + z * 0.71);
    let d = sdEllipse(x, z, 0, -3, 17.5, 14.2);
    d = Math.min(d, sdEllipse(x, z, -12.5, -11, 5.5, 5));
    d = Math.min(d, sdSeg(x, z, -9.5, 3, -14.2, 11.6, 3.0));
    d = Math.min(d, sdSeg(x, z, 9.0, 2, 13.4, 10.2, 3.4));
    d += n * 0.9;
    // the bay in front of the town (kept smooth so the beach reads clearly)
    d = Math.max(d, -sdEllipse(x, z, 0.5, 13.35, 7.5, 6.0));
    // lagoon in the right arm with a channel to the sea
    d = Math.max(d, -sdEllipse(x, z, LAGOON.x, LAGOON.z, LAGOON.rx, LAGOON.rz));
    d = Math.max(d, -sdSeg(x, z, LAGOON.x, LAGOON.z + 1.5, 16.5, 8.5, 0.55));
    return d;
  }
  /** Extra height (layers) of the hill / rocks above the plateau. */
  function hillLayers(x, z) {
    let h = 0;
    const peak = (cx, cz, ax, az, mh) => {
      const r2 = ((x - cx) / ax) ** 2 + ((z - cz) / az) ** 2;
      if (r2 < 1) h = Math.max(h, mh * Math.pow(1 - r2, 0.75));
    };
    peak(-1.5, -13.4, 8.2, 4.6, 19);
    peak(5.8, -12.8, 5.0, 3.8, 13);
    peak(-8.8, -12.0, 4.4, 3.9, 10);
    peak(-13.5, -10.5, 3.2, 3.0, 5);
    if (h > 0) h += Math.sin(x * 1.7) * Math.cos(z * 1.3) * 1.2 + Math.sin(x * 0.7 + z) * 0.8;
    // cliff in front of the waterfall
    if (z > CLIFF_Z && x > -1.2 && x < 6.2) h = 0;
    // rocky cape
    const cape = -sdSeg(x, z, -10.5, 5, -14.4, 11.8, 2.4);
    if (cape > 0) h = Math.max(h, Math.min(6, cape * 3) + Math.sin(x * 2.1 + z * 1.3) * 1.5);
    return Math.max(0, Math.round(h));
  }

  // ------------------------------------------------------------------ terrain
  function buildTerrain() {
    const land = new Uint8Array(NX * NZ);
    const at = (i, k) => (i - IX0) * NZ + (k - IZ0);
    for (let i = IX0; i < IX1; i++) for (let k = IZ0; k < IZ1; k++) {
      const x = (i + 0.5) * T, z = (k + 0.5) * T;
      if (landSD(x, z) < 0) land[at(i, k)] = 1;
    }
    // distance to water (for land) and to land (for water), chamfer 3-4 in cells
    const dW = new Float32Array(NX * NZ), dL = new Float32Array(NX * NZ);
    const chamfer = (dst, isSrc) => {
      for (let j = 0; j < dst.length; j++) dst[j] = isSrc(j) ? 0 : 1e6;
      const pass = (i0, i1, di, k0, k1, dk) => {
        for (let i = i0; i !== i1; i += di) for (let k = k0; k !== k1; k += dk) {
          const j = (i) * NZ + k;
          let v = dst[j];
          const ni = i - di, nk = k - dk;
          if (ni >= 0 && ni < NX) v = Math.min(v, dst[ni * NZ + k] + 1);
          if (nk >= 0 && nk < NZ) v = Math.min(v, dst[i * NZ + nk] + 1);
          if (ni >= 0 && ni < NX && nk >= 0 && nk < NZ) v = Math.min(v, dst[ni * NZ + nk] + 1.414);
          if (ni >= 0 && ni < NX && k + dk >= 0 && k + dk < NZ) v = Math.min(v, dst[ni * NZ + k + dk] + 1.414);
          dst[j] = v;
        }
      };
      pass(0, NX, 1, 0, NZ, 1);
      pass(NX - 1, -1, -1, NZ - 1, -1, -1);
      pass(0, NX, 1, NZ - 1, -1, -1);
      pass(NX - 1, -1, -1, 0, NZ, 1);
    };
    chamfer(dW, j => !land[j]);
    chamfer(dL, j => land[j]);
    const H = new Int8Array(NX * NZ).fill(WATER);
    const C = new Int32Array(NX * NZ);
    const isPath = new Uint8Array(NX * NZ); // 1 dirt lane, 2 cobble, 3 plot bed, 4 water feature
    // plot beds and the lanes between them
    for (let i = -19; i <= 18; i++) for (let k = -23; k <= 14; k++) {
      const pi = i + 17, pk = k + 21;
      const inBed = pi >= 0 && pk >= 0 && pi % 9 < 7 && pk % 9 < 7 && pi < 36 && pk < 36;
      isPath[at(i, k)] = inBed ? 3 : 1;
    }
    for (let i = Math.round(PROM[0] / T); i < Math.round(PROM[2] / T); i++) for (let k = 15; k < Math.round(PROM[3] / T); k++) isPath[at(i, k)] = 2;
    const lanes = villageLanes();
    for (const pl of lanes) {
      const bb = [Math.min(...pl.map(p => p[0])) - 0.5, Math.min(...pl.map(p => p[1])) - 0.5, Math.max(...pl.map(p => p[0])) + 0.5, Math.max(...pl.map(p => p[1])) + 0.5];
      for (let i = IX0; i < IX1; i++) for (let k = IZ0; k < IZ1; k++) {
        const x = (i + 0.5) * T, z = (k + 0.5) * T;
        if (isPath[at(i, k)]) continue;
        if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue;
        if (distPolyline(x, z, pl) < 0.3) isPath[at(i, k)] = 1;
      }
    }
    const grassC = ['#5fae46', '#64b34b', '#58a541', '#6cb84f'];
    for (let i = IX0; i < IX1; i++) for (let k = IZ0; k < IZ1; k++) {
      const j = at(i, k);
      const x = (i + 0.5) * T, z = (k + 0.5) * T;
      const hn = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453, rn = hn - Math.floor(hn);
      if (!land[j]) {
        if (dL[j] <= 3) { H[j] = -1; C[j] = rn < 0.5 ? 0xcdb57a : 0xc4ab70; }
        continue;
      }
      const dw = dW[j] * T;
      let h, c;
      if (dw < 0.55) { h = 0; c = rn < 0.5 ? 0xd9c48c : 0xd2bc84; }
      else if (dw < 1.25) { h = 1; c = rn < 0.5 ? 0xe8d39a : 0xead59b; }
      else if (dw < 1.9) { h = GL; c = rn < 0.6 ? 0xead59b : 0xe3cc8e; }
      else { h = GL; c = VC.Voxel.toInt(grassC[(rn * 4) | 0]); }
      const hl = dw > 1.0 ? hillLayers(x, z) : 0;
      if (hl > 0) {
        h = GL + hl;
        const rock = hl > 16 || (x < -9 && z > 0);
        c = rock ? (rn < 0.4 ? 0x9a9a96 : rn < 0.8 ? 0x8a8a86 : 0xa8a8a2) : hl > 7 ? (rn < 0.5 ? 0x6f9a4a : 0x5f9440) : VC.Voxel.toInt(grassC[(rn * 4) | 0]);
      }
      // jungle floor is darker
      if (h >= GL && hl <= 5 && z < -8.5 && c !== 0x9a9a96) c = rn < 0.5 ? 0x4f9a3c : 0x57a442;
      const p = isPath[j];
      if (p === 3) { h = GL; c = ((i + k) & 1) ? 0x64b34b : 0x5aa743; }
      else if (p === 1 && hl < 3 && h >= GL) { h = GL; c = rn < 0.5 ? 0xb98d5a : 0xae8452; }
      else if (p === 2) { h = GL; c = rn < 0.33 ? 0xa89f91 : rn < 0.66 ? 0x9a9284 : 0xb5ab9c; if ((i + k * 3) % 7 === 0) c = 0x8a8478; }
      // beach in front of the promenade: a low quay wall, then sand down to the water
      if (z > PROM[3] && x > PROM[0] - 1 && x < PROM[2] + 1 && h >= GL && !p) { h = dw < 0.55 ? 0 : 1; c = rn < 0.5 ? 0xe8d39a : 0xead59b; }
      H[j] = h; C[j] = c;
    }
    // pond, river and the stream above the waterfall
    const water = (j, top) => { H[j] = Math.min(H[j], top); C[j] = (H[j] & 1) ? 0x3f9fd0 : 0x4fb0dc; isPath[j] = 4; };
    for (let i = IX0; i < IX1; i++) for (let k = IZ0; k < IZ1; k++) {
      const j = at(i, k);
      if (H[j] === WATER || H[j] < 0) continue;
      const x = (i + 0.5) * T, z = (k + 0.5) * T;
      const dp = sdEllipse(x, z, POND.x, POND.z, POND.rx, POND.rz);
      if (dp < 0) { water(j, GL - 1); continue; }
      if (dp < 0.3 && !isPath[j]) { C[j] = 0x8a8a86; H[j] = GL; continue; }
      if (Math.abs(x - POND.x) < 1.5 && z < CLIFF_Z && z > CLIFF_Z - 3.2) {
        if (x > FALL.x0 && x < FALL.x1) { water(j, H[j] - 1); continue; }
      }
      const dr = distPolyline(x, z, RIVER);
      if (dr < 0.32) water(j, Math.min(GL - 1, H[j] - 1));
      else if (dr < 0.55 && H[j] >= GL && !isPath[j]) C[j] = 0x8a7a5a;
    }
    // steep hill faces are bare rock
    for (let i = IX0 + 1; i < IX1 - 1; i++) for (let k = IZ0 + 1; k < IZ1 - 1; k++) {
      const j = at(i, k), h = H[j];
      if (h <= GL + 1 || isPath[j]) continue;
      let lo = h;
      for (const n of [at(i + 1, k), at(i - 1, k), at(i, k + 1), at(i, k - 1)]) lo = Math.min(lo, H[n] === WATER ? -2 : H[n]);
      if (h - lo >= 4) C[j] = (i + k) & 1 ? 0x8a8a86 : 0x9a9a96;
    }
    // column colours (top voxel, mossy rock on hill faces, soil under grass, sand under the beach)
    const colorAt = (i, y, k) => {
      const j = at(i, k), h = H[j], top = C[j];
      if (y === h) return top;
      const hv = Math.sin(i * 3.1 + y * 7.7 + k * 5.3) * 9631.7, rv = hv - Math.floor(hv);
      if (y > GL) return rv < (y > h - 3 ? 0.4 : 0.12) ? (rv < 0.06 ? 0x4f8a3a : 0x5f9a46) : rv < 0.5 ? 0x8a8a86 : rv < 0.8 ? 0x7f7f7b : 0x969690;
      const rocky = top === 0x9a9a96 || top === 0x8a8a86 || top === 0xa8a8a2 || top === 0x7b8b5a || top === 0x6f8a4e;
      if (rocky) return (y + i + k) % 3 ? 0x8a8a86 : 0x7f7f7b;
      const sandy = top === 0xe8d39a || top === 0xead59b || top === 0xe3cc8e || top === 0xd9c48c || top === 0xd2bc84;
      if (sandy || y < 0) return 0xd8c389;
      return y >= h - 1 ? 0x7a5a3a : 0x8a6a48;
    };
    return { H, C, land, dW, dL, isPath, at, colorAt };
  }

  /** Lanes from the plot grid into the village (also used for the API paths). */
  function villageLanes() {
    return [
      [[-4.5, -5.5], [-5.8, -6.4], [-7.6, -6.9]],
      [[0, -5.5], [0, -7.0], [1.2, -7.4]],
      [[4.5, -5.5], [5.4, -6.2], [6.6, -6.4]],
      [[-4.5, -1.0], [-6.2, -1.4], [-7.6, -2.0]],
      [[-4.5, 3.5], [-6.0, 3.4], [-7.4, 2.4], [-8.4, 0.5]],
      [[-6.5, 4.4], [-6.0, 6.2], [-5.4, 7.6], [-5.4, 8.4]],
      [[4.5, -1.0], [6.1, -1.4], [7.3, -2.2]],
      [[4.5, 3.5], [6.2, 3.0], [7.6, 2.2], [9.0, 2.6]],
    ];
  }

  // ------------------------------------------------------------------ decor
  /** Cached meshes of a part set (or a Vox) at a given voxel size. */
  const partCache = new Map();
  function partGeo(key, build, scale, center) {
    let e = partCache.get(key);
    if (e) return e;
    const P = build();
    const ps = P instanceof VC.Voxel.Vox ? { v: P, g: new VC.Voxel.Vox(), cloth: [], smoke: [] } : P;
    const c = center === 'base' ? [(ps.v.minX + ps.v.maxX + 1) / 2, ps.v.minY, (ps.v.minZ + ps.v.maxZ + 1) / 2] : (center || [0, 0, 0]);
    const mo = { scale, center: c, skipBottom: true };
    e = {
      geo: VC.Voxel.mesh(ps.v, Object.assign({ occluders: ps.g }, mo)),
      glow: ps.g.count ? VC.Voxel.mesh(ps.g, Object.assign({ occluders: ps.v }, mo)) : null,
      cloth: ps.cloth.length ? Scene.mergeGeos(ps.cloth.map(cl => ({ geo: VC.Voxel.mesh(cl.vox, Object.assign({ attr: { name: 'cloth', size: 3, fn: cl.fn }, occluders: ps.v }, mo)) }))) : null,
      smoke: ps.smoke.map(p => [(p[0] - c[0]) * scale, (p[1] - c[1]) * scale, (p[2] - c[2]) * scale]),
      extra: ps,
    };
    partCache.set(key, e);
    return e;
  }

  /** Layout of the static decor: [{ key, build, scale, x, z, rot, y? }]. */
  function decorLayout(ter) {
    const items = [];
    const add = (key, build, x, z, rot, opt) => items.push(Object.assign({ key, build, scale: HD, x, z, rot: rot || 0 }, opt || {}));
    // village cottages around the grid (doors toward the camera)
    const houses = [
      [-6.9, -3.1, 1], [-7.2, 0.5, 2], [-9.6, -4.6, 3], [-5.9, -7.6, 4], [-3.0, -8.3, 5], [6.6, -3.4, 6], [7.0, 0.2, 7],
      [6.4, -7.4, 8], [-10.2, -0.9, 9], [9.6, -6.6, 10],
    ];
    houses.forEach(([x, z, s]) => add('cottage' + s, () => M.cottage(s), x, z, 0));
    add('windmill', () => M.windmill().body, -8.4, -7.6, 0);
    add('watchtower', () => M.watchtower(), -8.9, -12.2, 0.3);
    add('well', () => M.well(), 0.0, -7.4, 0);
    add('stall0', () => M.stall(0), -5.6, 4.0, 0);
    add('stall1', () => M.stall(1), 5.7, 4.0, 0);
    add('stall2', () => M.stall(2), -2.0, -6.9, 0);
    add('garden1', () => M.garden(1), -8.6, 2.6, 0);
    add('garden2', () => M.garden(2), 8.6, -3.5, Math.PI / 2);
    add('garden3', () => M.garden(3), -4.6, -9.4, 0);
    add('campfire', () => M.campfire(), CAMPFIRE[0], CAMPFIRE[1], 0);
    add('nets', () => M.nets(), -7.4, 6.6, 0.2);
    add('cargo1', () => M.cargo(1), 2.3, 6.0, 0, { deck: true });
    add('cargo2', () => M.cargo(2), -5.4, 5.0, 0.4);
    add('cargo3', () => M.cargo(3), 4.0, 10.0, Math.PI, { deck: true });
    add('cargo4', () => M.cargo(4), 6.8, 4.6, 0.8);
    add('bench', () => M.bench(), -1.6, 4.9, 0);
    add('bench', () => M.bench(), 3.6, 4.9, 0);
    add('sign', () => M.signpost(), -5.05, 2.75, 0);
    add('bridge', () => M.bridge(14), 9.15, -2.75, 1.15);
    add('bridge', () => M.bridge(12), 7.1, -6.5, 0.45);
    add('cannon', () => M.cannon(), -12.6, 9.6, -0.6);
    add('cannon', () => M.cannon(), -11.3, 7.2, -0.3);
    add('rowboat1', () => M.rowboat('#c8323a', 1), -7.9, 8.4, 0.5);
    add('rowboat2', () => M.rowboat('#2f6bc0', 2), 5.6, 8.0, -0.4);
    add('rowboat3', () => M.rowboat('#3f8f5a', 3), -6.35, 10.6, Math.PI / 2, { water: true });
    add('rowboat4', () => M.rowboat('#e8d8a8', 4), -4.45, 11.0, Math.PI / 2 + 0.1, { water: true });
    add('rowboat2', () => M.rowboat('#2f6bc0', 2), 11.6, 4.0, 0.9, { water: true });
    // lamps along the promenade and the piers, torches by the village
    for (const x of [-6.0, -2.8, 3.2, 6.0]) add('lamppost', () => M.lampPost(), x, 5.25, 0);
    add('lamppost', () => M.lampPost(), -1.6, 10.3, 0, { deck: true });
    add('lamppost', () => M.lampPost(), 4.6, 10.3, Math.PI, { deck: true });
    add('lamppost', () => M.lampPost(), -5.6, 11.5, 0, { deck: PIER2.deckY });
    for (const [x, z] of [[-4.9, -5.9], [4.9, -5.9], [-8.2, -6.4], [8.7, 2.0], [-9.0, 1.8], [1.4, -9.2]]) add('torch', () => M.torchPost(), x, z, 0);
    // beach clutter
    const beach = [[-8.4, 7.4], [-4.0, 7.9], [3.4, 7.4], [6.8, 8.6], [-1.3, 7.0], [9.5, 9.5], [-10.4, 9.3], [11.4, 11.1], [-12.5, 12.4]];
    beach.forEach(([x, z], k) => add('shells' + (k % 4), () => M.shells(k % 4 + 1), x, z, k));
    [[-9.6, 8.4, 0.3], [7.6, 9.2, -0.5], [10.3, 12.0, 1.0]].forEach(([x, z, r], k) => add('drift' + k, () => M.driftwood(k + 1), x, z, r));
    return items;
  }

  /** Scatters trees, palms, bushes, flowers and rocks over free land. */
  function scatterNature(ter, items, reserved) {
    const rnd = VC.util.rng(77);
    const { H, C, at, dW, isPath } = ter;
    const free = (x, z, r) => {
      const i0 = Math.floor((x - r) / T), i1 = Math.floor((x + r) / T), k0 = Math.floor((z - r) / T), k1 = Math.floor((z + r) / T);
      for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
        if (i < IX0 || i >= IX1 || k < IZ0 || k >= IZ1) return false;
        const j = at(i, k);
        if (H[j] === WATER || H[j] < 0 || isPath[j] || reserved[j]) return false;
      }
      return true;
    };
    const reserve = (x, z, r) => {
      for (let i = Math.floor((x - r) / T); i <= Math.floor((x + r) / T); i++) for (let k = Math.floor((z - r) / T); k <= Math.floor((z + r) / T); k++) {
        if (i >= IX0 && i < IX1 && k >= IZ0 && k < IZ1) reserved[at(i, k)] = 1;
      }
    };
    const place = (n, tries, test, mk) => {
      let placed = 0;
      for (let t = 0; t < tries && placed < n; t++) {
        const x = (rnd() * 2 - 1) * 21, z = -20 + rnd() * 35;
        const r = test(x, z);
        if (!r) continue;
        if (!free(x, z, r)) continue;
        reserve(x, z, r * 0.9);
        mk(x, z, placed);
        placed++;
      }
    };
    const cellOf = (x, z) => at(Math.floor(x / T), Math.floor(z / T));
    // palms along the beaches (HD near the camera, LD elsewhere)
    place(46, 4000, (x, z) => {
      if (z > 4.8 && x > -3.2 && x < 5.4) return 0; // keep the harbour clear
      const j = cellOf(x, z); const d = dW[j] * T; return d > 0.4 && d < 3.2 && H[j] <= GL + 1 && H[j] >= 0 ? 0.55 : 0;
    }, (x, z, k) => {
      const near = z > -2 && Math.abs(x) < 10;
      const a = k % 6, b = k % 5;
      if (near) items.push({ key: 'palmHD' + a, build: () => M.palmHD(18 + (a % 4) * 3, 30 + a), scale: HD, x, z, rot: rnd() * 6.28 });
      else items.push({ key: 'palm' + b, build: () => M.palm(7 + (b % 4), 40 + b), scale: T, x, z, rot: rnd() * 6.28, center: 'base' });
    });
    // jungle trees on the hill slopes and around the village
    place(64, 6000, (x, z) => { const j = cellOf(x, z); const d = dW[j] * T; return d > 2.2 && (z < -8.6 || Math.abs(x) > 9.5) && H[j] < GL + 14 ? 0.7 : 0; }, (x, z, k) => {
      const b = k % 5;
      if (rnd() < 0.3) items.push({ key: 'palm' + b, build: () => M.palm(7 + (b % 4), 40 + b), scale: T, x, z, rot: rnd() * 6.28, center: 'base' });
      else items.push({ key: 'tree' + (k % 7), build: () => M.tree(60 + (k % 7)), scale: T, x, z, rot: rnd() * 6.28, center: 'base' });
    });
    // bushes and rocks
    place(70, 6000, (x, z) => { const j = cellOf(x, z); return dW[j] * T > 1.5 && H[j] >= GL && (Math.abs(x) > 5.6 || z < -6.4) ? 0.35 : 0; }, (x, z, k) => {
      if (rnd() < 0.25 || C[cellOf(x, z)] === 0x9a9a96) items.push({ key: 'rock' + (k % 5), build: () => M.rock(k % 5 + 3), scale: T * 0.6, x, z, rot: rnd() * 6.28, center: 'base', sink: 0.05 });
      else items.push({ key: 'bush' + (k % 6), build: () => M.bush(k % 6 + 1), scale: T * 0.7, x, z, rot: rnd() * 6.28, center: 'base' });
    });
    // flowers and grass tufts (tiny, HD)
    place(80, 5000, (x, z) => { const j = cellOf(x, z); return dW[j] * T > 1.6 && H[j] === GL ? 0.25 : 0; }, (x, z, k) => {
      items.push(k % 2 ? { key: 'flowers' + (k % 6), build: () => M.flowers(k % 6 + 1), scale: HD, x, z, rot: rnd() * 6.28 }
        : { key: 'grass' + (k % 4), build: () => M.grass(k % 4 + 1), scale: HD, x, z, rot: rnd() * 6.28 });
    });
    // rocks on the cape and around the coast
    for (let k = 0; k < 14; k++) {
      const x = -10 - rnd() * 6, z = 2 + rnd() * 12;
      const j = cellOf(x, z);
      if (H[j] === WATER || H[j] < 0) continue;
      items.push({ key: 'rock' + (k % 5), build: () => M.rock(k % 5 + 3), scale: T, x, z, rot: rnd() * 6.28, center: 'base', sink: 0.1 });
    }
  }

  /** Piers and other world-anchored HD structures as one part set (voxel = world / 0.125). */
  function piersParts() {
    const P = M.parts();
    const K = M.kit;
    const r = (a) => Math.round(a / HD);
    const dk = (rect, y) => K.deck(P, r(rect[0]), r(rect[1]), r(rect[2]) - 1, r(rect[3]) - 1, y, -5);
    dk(PIER.landing, 5); dk(PIER.stem, 5); dk(PIER.head, 5);
    dk(PIER2.rect, 4);
    // bollards along the T-head and rope rails along the stem
    for (let x = r(PIER.head[0]) + 2; x < r(PIER.head[2]); x += 8) P.v.box(x, 6, r(PIER.head[3]) - 1, x, 7, r(PIER.head[3]) - 1, '#3a3a3a');
    for (let z = r(PIER.stem[1]); z < r(PIER.stem[3]); z += 4) { P.v.box(r(PIER.stem[0]), 6, z, r(PIER.stem[0]), 8, z, '#6b4423'); P.v.box(r(PIER.stem[2]) - 1, 6, z, r(PIER.stem[2]) - 1, 8, z, '#6b4423'); }
    for (let z = r(PIER.stem[1]); z < r(PIER.stem[3]); z++) { P.v.set(r(PIER.stem[0]), 8, z, '#c8a26a'); P.v.set(r(PIER.stem[2]) - 1, 8, z, '#c8a26a'); }
    // quay wall in front of the promenade
    for (let x = r(PROM[0]); x < r(PROM[2]); x++) {
      if (x >= r(PIER.landing[0]) && x < r(PIER.landing[2])) continue;
      for (let y = 0; y <= 5; y++) P.v.set(x, y, r(PROM[3]), M.kit.hash(x >> 1, y, 3) < 0.3 ? '#8a8478' : '#a09886');
    }
    // stone steps from the promenade down to the beach
    for (const sx of [r(-4.0), r(5.0)]) for (let s = 0; s < 3; s++) P.v.box(sx, 0, r(PROM[3]) + 1 + s, sx + 5, 4 - s * 2, r(PROM[3]) + 1 + s, '#a09886');
    return P;
  }

  // ------------------------------------------------------------------ water materials
  let waterMat = null;
  function waterMaterial() {
    if (waterMat) return waterMat;
    waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0a2a3a });
    waterMat.onBeforeCompile = sh => {
      sh.uniforms.uTime = Scene.clothTime;
      sh.vertexShader = 'varying float vFall;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFall = position.y * 2.6 + sin(position.x * 23.0) * 0.35;');
      sh.fragmentShader = 'varying float vFall;\nuniform float uTime;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\nfloat fl = fract(vFall + uTime * 1.8);\ndiffuseColor.rgb *= 0.82 + 0.38 * smoothstep(0.55, 0.75, fl) * (1.0 - smoothstep(0.8, 0.95, fl));');
    };
    return waterMat;
  }

  // ------------------------------------------------------------------ island
  Scene.buildIsland = function (state) {
    const g = this.islandGroup;
    while (g.children.length) g.remove(g.children[0]);
    this.tappables = this.tappables.filter(t => t.persistent);
    const t0 = performance.now();
    const ter = this._ter || (this._ter = buildTerrain());
    this.ter = ter;
    // terrain mesh (voxel (i,y,k) spans [i*T, (i+1)*T] etc.)
    const tgeo = this.geoCache.get('terrain2') || VC.Voxel.heightMesh({
      i0: IX0, k0: IZ0, ni: NX, nk: NZ, yMin: -2,
      height: (i, k) => { const h = ter.H[ter.at(i, k)]; return h === WATER ? -999 : h; }, color: ter.colorAt,
    }, { scale: T, noise: 0.06 });
    this.geoCache.set('terrain2', tgeo);
    const terrain = new THREE.Mesh(tgeo, VC.Voxel.material());
    g.add(terrain);
    this.terrain = terrain;

    // static decor merged into a few meshes
    if (!this._decor) {
      const reserved = new Uint8Array(NX * NZ);
      const items = decorLayout(ter);
      const resv = (x, z, r) => {
        for (let i = Math.floor((x - r) / T); i <= Math.floor((x + r) / T); i++) for (let k = Math.floor((z - r) / T); k <= Math.floor((z + r) / T); k++)
          if (i >= IX0 && i < IX1 && k >= IZ0 && k < IZ1) reserved[ter.at(i, k)] = 1;
      };
      items.forEach(it => resv(it.x, it.z, it.key.startsWith('cottage') ? 1.2 : it.key === 'windmill' ? 1.1 : 0.7));
      resv(POND.x, POND.z, 2.0); resv(CAMPFIRE[0], CAMPFIRE[1], 1.2);
      for (let x = -1.5; x <= 6; x += 0.5) resv(x, CLIFF_Z + 0.5, 0.5);
      for (let x = 1; x <= 4.5; x += 0.5) resv(x, CLIFF_Z - 0.9, 1.0);
      scatterNature(ter, items, reserved);
      const main = [], glow = [], cloth = [], smoke = [];
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      for (const it of items) {
        const e = partGeo(it.key + '@' + it.scale, it.build, it.scale, it.center);
        let y;
        if (it.deck) y = it.deck === true ? PIER.deckY : it.deck;
        else if (it.water) y = 0.02;
        else y = groundAt(ter, it.x, it.z);
        y -= it.sink || 0;
        q.setFromAxisAngle(up, it.rot || 0);
        mtx.compose(new THREE.Vector3(it.x, y, it.z), q, new THREE.Vector3(1, 1, 1));
        main.push({ geo: e.geo, matrix: mtx.clone() });
        if (e.glow) glow.push({ geo: e.glow, matrix: mtx.clone() });
        if (e.cloth) cloth.push({ geo: e.cloth, matrix: mtx.clone() });
        for (const s of e.smoke) smoke.push(new THREE.Vector3(s[0], s[1], s[2]).applyMatrix4(mtx));
      }
      // world-anchored piers and quay
      const pe = partGeo('piers', piersParts, HD, [0, 0, 0]);
      main.push({ geo: pe.geo });
      if (pe.glow) glow.push({ geo: pe.glow });
      // waterfall + foam
      const fall = new VC.Voxel.Vox();
      const fx0 = Math.round(FALL.x0 / HD), fx1 = Math.round(FALL.x1 / HD) - 1, fz = Math.round(FALL.z / HD);
      const topY = Math.round(groundAt(ter, (FALL.x0 + FALL.x1) / 2, FALL.z - 0.4) / HD);
      for (let x = fx0; x <= fx1; x++) for (let y = 4; y < topY; y++) {
        fall.set(x, y, fz, (x + y) % 3 ? '#9fe0ff' : '#e8f8ff');
        if (y < topY - 2 && (x + y) % 2) fall.set(x, y, fz + 1, '#c8f0ff');
      }
      for (let x = fx0 - 3; x <= fx1 + 3; x++) for (let z = fz + 1; z <= fz + 4; z++) if (M.kit.hash(x, 1, z) < 0.6) fall.set(x, 4, z, '#ffffff');
      const fallGeo = VC.Voxel.mesh(fall, { scale: HD, center: [0, 0, 0], skipBottom: true, noise: 0.02 });
      this._decor = {
        main: this.mergeGeos(main), glow: this.mergeGeos(glow), cloth: cloth.length ? this.mergeGeos(cloth) : null, smoke, fallGeo,
        mill: partGeo('millSails', () => M.windmill().sails, HD, [0.5, 0.5, 0.5]),
      };
    }
    const D = this._decor;
    g.add(new THREE.Mesh(D.main, VC.Voxel.material()));
    g.add(new THREE.Mesh(D.glow, this.glowMaterial()));
    if (D.cloth) {
      const cm = new THREE.Mesh(D.cloth, this.clothMaterial(false));
      cm.onBeforeRender = () => { Scene.clothTime.value = Scene.t; };
      g.add(cm);
    }
    const fallMesh = new THREE.Mesh(D.fallGeo, waterMaterial());
    fallMesh.onBeforeRender = () => { Scene.clothTime.value = Scene.t; };
    g.add(fallMesh);
    // windmill sails rotate around the hub
    const mill = new THREE.Mesh(D.mill.geo, VC.Voxel.material());
    const hub = [-8.4 + 0 * HD, groundAt(ter, -8.4, -7.6) + 19.5 * HD, -7.6 + 7.5 * HD];
    mill.position.set(hub[0], hub[1], hub[2]);
    g.add(mill);
    this.millSails = mill;
    this.smokers = D.smoke.map(p => ({ p, t: Math.random() }));
    this.fallBase = new THREE.Vector3((FALL.x0 + FALL.x1) / 2, GY - 0.2, FALL.z + 0.4);
    this.campfire = new THREE.Vector3(CAMPFIRE[0], groundAt(ter, CAMPFIRE[0], CAMPFIRE[1]) + 0.25, CAMPFIRE[1]);

    // treasure chest on the pier landing: the main tap target
    const chest = new THREE.Mesh(this.cachedGeo('chestHD', () => M.chest(), { scale: HD, center: 'base' }), VC.Voxel.material());
    chest.position.set(0.55, PIER.deckY, 6.45);
    chest.rotation.y = 0.25;
    chest.userData.baseY = PIER.deckY;
    g.add(chest);
    this.chest = chest;

    // plots: highlight planes (hidden unless build mode highlights them; still pickable)
    this.plotMeshes = [];
    this.buildingMeshes = {};
    const plotGeo = this.geoCache.get('plotPlane') || new THREE.PlaneGeometry(7 * T, 7 * T).rotateX(-Math.PI / 2);
    this.geoCache.set('plotPlane', plotGeo);
    VC.PLOTS.forEach((p, i) => {
      const w = plotWorld(i);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0, depthWrite: false });
      const hl = new THREE.Mesh(plotGeo, mat);
      hl.position.set(w.x, GY + 0.03, w.z);
      hl.visible = false;
      hl.userData.plot = i;
      g.add(hl);
      this.plotMeshes.push(hl);
    });
    this.bGlow = new THREE.Mesh(new THREE.BufferGeometry(), this.glowMaterial());
    this.bCloth = new THREE.Mesh(new THREE.BufferGeometry(), this.clothMaterial(false));
    this.bCloth.onBeforeRender = () => { Scene.clothTime.value = Scene.t; };
    g.add(this.bGlow); g.add(this.bCloth);
    this.buildShallow(ter);
    this.island = this.islandApi(ter);
    this.refreshBuildings(state);
    this.refreshPlayerShip(state);
    this.buildMs = performance.now() - t0;
    this.fire('island', state);
  };

  function groundAt(ter, x, z) {
    const i = Math.floor(x / T), k = Math.floor(z / T);
    if (i < IX0 || i >= IX1 || k < IZ0 || k >= IZ1) return 0;
    const h = ter.H[ter.at(i, k)];
    return h === WATER ? 0 : (h + 1) * T;
  }
  const inRect = (x, z, r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

  Scene.buildShallow = function (ter) {
    if (this.setShallow) this.setShallow({ x0: IX0 * T, z0: IZ0 * T, nx: NX, nz: NZ, cell: T, land: ter.land, dL: ter.dL });
  };

  Scene.islandApi = function (ter) {
    const groundY = (x, z) => {
      if (inRect(x, z, PIER.landing) || inRect(x, z, PIER.stem) || inRect(x, z, PIER.head)) return PIER.deckY;
      if (inRect(x, z, PIER2.rect)) return PIER2.deckY;
      const i = Math.floor(x / T), k = Math.floor(z / T);
      if (i < IX0 || i >= IX1 || k < IZ0 || k >= IZ1) return null;
      const j = ter.at(i, k);
      const h = ter.H[j];
      if (h === WATER || h < 0 || ter.isPath[j] === 4) return null;
      return (h + 1) * T;
    };
    // grid lanes, promenade, piers, beach, village lanes
    const paths = [];
    const xs = [-4.5, -2.25, 0, 2.25, 4.5], zs = [-5.5, -3.25, -1.0, 1.25, 3.5];
    for (const x of xs) paths.push([[x, -5.5], [x, 3.5]]);
    for (const z of zs) paths.push([[-4.5, z], [4.5, z]]);
    paths.push([[-6.5, 4.4], [6.5, 4.4]]);
    paths.push([[1.5, 4.4], [1.5, 10.0]], [[-1.5, 10.0], [4.5, 10.0]]);
    paths.push([[-5.4, 8.4], [-5.4, 11.5]]);
    paths.push([[-9.0, 7.6], [-6.2, 7.0], [-4.4, 7.4], [-1.0, 7.0], [0.0, 6.4]]);
    paths.push([[3.0, 6.6], [5.0, 7.4], [7.4, 8.4], [9.0, 9.6]]);
    for (const l of villageLanes()) paths.push(l.map(p => p.slice()));
    // doors: in front of each plot, on the lane below it
    const doors = {};
    VC.PLOTS.forEach((p, i) => { const w = plotWorld(i); doors[i] = [w.x, w.z + 1.05]; });
    // outer shoreline: march around the land mask
    const shoreline = traceShore(ter);
    // sea spots in front of the island (in view of the fixed camera) and far out
    const near = [[-4.2, 9.4], [-3.0, 11.4], [-5.2, 11.8], [-1.8, 12.6], [5.8, 12.2], [-7.4, 12.8], [7.2, 11.0], [3.2, 13.2], [-9.6, 11.6], [12.0, 4.6]];
    const horizon = [[-26, -30], [-13, -33], [0, -35], [13, -33], [26, -30], [-30, 6], [30, 8], [-18, 22], [18, 22]];
    return {
      radius: 18, ground: GY, groundY, paths, shoreline, plotWorld, dock: { x: DOCK.x, z: DOCK.z },
      spots: {
        pier: [1.5, 9.9], pier2: [-5.4, 11.2], plaza: [0.6, 4.4], chest: [0.55, 6.45], campfire: CAMPFIRE.slice(), well: [0.0, -6.6],
        beach: [[-8.6, 7.6], [-6.8, 7.1], [-4.8, 7.4], [-2.4, 7.3], [-1.2, 6.9], [3.6, 6.9], [4.8, 7.4], [6.6, 8.2], [8.6, 9.2], [-10.8, 9.6]],
        doors, sea: { near, horizon },
      },
    };
  };

  /** Traces the outer coast of the land mask into a simplified closed polygon (world coords). */
  function traceShore(ter) {
    const pts = [];
    const N = 120;
    for (let a = 0; a < N; a++) {
      const ang = a / N * Math.PI * 2;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      let last = null;
      for (let r = 26; r > 0; r -= 0.25) {
        const x = dx * r, z = -2 + dz * r;
        const i = Math.floor(x / T), k = Math.floor(z / T);
        if (i < IX0 || i >= IX1 || k < IZ0 || k >= IZ1) continue;
        if (ter.land[ter.at(i, k)]) { last = [+x.toFixed(2), +z.toFixed(2)]; break; }
      }
      if (last) pts.push(last);
    }
    return pts;
  }

  // ------------------------------------------------------------------ buildings
  function buildingGeo(id) {
    return partGeo('b:' + id, () => M.buildingParts(id), HD, [0, 0, 0]);
  }

  Scene.refreshBuildings = function (state) {
    const g = this.islandGroup;
    for (const k in this.buildingMeshes) g.remove(this.buildingMeshes[k]);
    this.buildingMeshes = {};
    const glow = [], cloth = [];
    this.bSmoke = [];
    const mtx = new THREE.Matrix4();
    VC.PLOTS.forEach((p, i) => {
      const hl = this.plotMeshes[i];
      const owned = i < state.plots;
      hl.material.color.set(owned ? 0xffd23f : 0x553311);
      const bid = state.layout[i];
      if (!bid || !owned || state.buildings[bid] <= 0) return;
      const w = plotWorld(i);
      const e = buildingGeo(bid);
      const m = new THREE.Mesh(e.geo, VC.Voxel.material());
      m.position.set(w.x, GY, w.z);
      const lvl = state.buildings[bid];
      const grow = 1 + Math.min(0.18, Math.floor(Math.log2(1 + lvl / 10)) * 0.04);
      m.scale.setScalar(grow);
      m.userData.building = bid;
      m.userData.plot = i;
      g.add(m);
      this.buildingMeshes[i] = m;
      m.updateMatrix();
      mtx.copy(m.matrix);
      if (e.glow) glow.push({ geo: e.glow, matrix: mtx.clone() });
      if (e.cloth) cloth.push({ geo: e.cloth, matrix: mtx.clone() });
      for (const s of e.smoke) this.bSmoke.push({ p: new THREE.Vector3(s[0], s[1], s[2]).applyMatrix4(mtx), t: Math.random() });
    });
    if (this.bGlow) { this.bGlow.geometry.dispose(); this.bGlow.geometry = this.mergeGeos(glow); }
    if (this.bCloth) { this.bCloth.geometry.dispose(); this.bCloth.geometry = this.mergeGeos(cloth); }
    this.fire('buildings', state);
  };

  /** Highlights plots for build mode: list of {plot, color} or null to hide. */
  Scene.highlightPlots = function (list) {
    this.plotMeshes.forEach(m => { m.material.opacity = 0; m.visible = false; });
    if (!list) return;
    for (const it of list) {
      const m = this.plotMeshes[it.plot];
      m.material.color.set(it.color);
      m.material.opacity = 0.55;
      m.visible = true;
    }
  };

  Scene.refreshPlayerShip = function (state) {
    if (this.playerShip) this.islandGroup.remove(this.playerShip);
    if (!state.unlocked.ship && state.story.idx < 4) {
      // Wrecked sloop lying on its side on the beach until the prologue repairs it.
      const wreck = this.shipMesh(Object.assign(this.playerShipOpts(state, 1), { wreck: true }), 'wreck');
      wreck.rotation.set(0, -0.5, 0.8, 'YXZ');
      wreck.position.set(4.9, 0.32, 7.35);
      this.islandGroup.add(wreck);
      this.playerShip = wreck;
      this.playerShip.userData.wreck = true;
      this.fire('playerShip', wreck, state);
      return;
    }
    const key = 'player:' + state.ship.tier + ':' + state.skins.sail + state.skins.flag + state.skins.hull;
    const ship = this.shipMesh(this.playerShipOpts(state), key);
    // Big hulls would hide the island: show them a bit smaller at the pier.
    const k = Math.min(1, 6.4 / ship.userData.length);
    ship.scale.setScalar(k);
    // moored along the pier head, turned a little so the sails catch the light
    ship.rotation.y = -0.18;
    ship.position.set(DOCK.x, 0, PIER.head[3] + ship.userData.halfW * k + 0.35 + ship.userData.length * k * 0.5 * Math.sin(0.18));
    ship.userData.dockZ = ship.position.z;
    this.islandGroup.add(ship);
    this.playerShip = ship;
    this.fire('playerShip', ship, state);
  };

  // ------------------------------------------------------------------ fixed camera
  // The camera never moves with input. Its framing is solved per screen aspect so the plot grid
  // fills the free part of the screen (between the HUD bars), with the pier and the docked ship
  // in front; when a bottom panel is open (Scene.setPanelCover) the plots are refit above it.
  Scene.islandCam = { pos: new THREE.Vector3(0, 17, 18), target: new THREE.Vector3(0, 0.75, 1) };
  const fitCache = new Map();
  Scene.solveIslandCam = function (cover) {
    const w = this.w, h = this.h;
    const tune = this.camTune || {};
    const key = w + 'x' + h + ':' + cover.toFixed(2) + JSON.stringify(tune);
    if (fitCache.has(key)) return fitCache.get(key);
    const aspect = w / h, portrait = aspect < 0.8;
    const cam = new THREE.PerspectiveCamera(this.camera.fov, aspect, 0.1, 400);
    const pitch = tune.pitch || (portrait ? 0.9 : (aspect > 1.6 ? 0.82 : 0.86));
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const pts = [];
    for (const x of [-4.7, 4.7]) for (const z of [-5.7, 3.4]) { pts.push(new THREE.Vector3(x, GY, z)); if (z < 0) pts.push(new THREE.Vector3(x, GY + 2.2, z)); }
    if (!cover) for (const x of [-1.8, 4.8]) pts.push(new THREE.Vector3(x, 0, 12.6));
    // free band in NDC: below the top HUD, above the tab bar (or the panel)
    const topPx = portrait ? 150 : 74, botPx = portrait ? 72 : 64;
    let yMax = 1 - 2 * topPx / h, yMin = -1 + 2 * botPx / h;
    if (cover) { yMin = -1 + 2 * (cover + 0.12) - cover + 0.04; yMax -= cover; }
    const xLim = tune.xLim || (portrait ? 0.78 : 0.9);
    const tgt = new THREE.Vector3(0, GY, 0);
    let d = 22;
    const measure = () => {
      cam.position.copy(tgt).addScaledVector(dir, d);
      cam.lookAt(tgt);
      cam.updateMatrixWorld();
      let y0 = 1e9, y1 = -1e9, ax = 0;
      for (const p of pts) {
        const q = p.clone().project(cam);
        y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); ax = Math.max(ax, Math.abs(q.x));
      }
      return { y0, y1, ax };
    };
    for (let it = 0; it < 40; it++) {
      let m = measure();
      // centre vertically by moving the look-at point along z (numeric slope)
      const mid = (m.y0 + m.y1) / 2, want = (yMin + yMax) / 2;
      tgt.z += 0.5; const m2 = measure(); tgt.z -= 0.5;
      const slope = ((m2.y0 + m2.y1) / 2 - mid) / 0.5;
      if (Math.abs(slope) > 1e-4) tgt.z += Math.max(-4, Math.min(4, (want - mid) / slope));
      m = measure();
      const f = Math.max((m.y1 - m.y0) / (yMax - yMin), m.ax / xLim);
      if (Math.abs(f - 1) < 0.004) break;
      d *= Math.pow(f, 0.85);
    }
    measure();
    const res = { pos: cam.position.clone(), target: tgt.clone() };
    fitCache.set(key, res);
    return res;
  };

  Scene.updateIslandCam = function () {
    const base = this.solveIslandCam(0);
    const want = this.wantViewOff;
    if (want > 0.01) { this._panelWant = Math.round(want * 50) / 50; }
    let pos = base.pos, target = base.target;
    if (this._panelWant) {
      const k = Math.max(0, Math.min(1, this.viewOff / this._panelWant));
      if (k > 0.001) {
        const pc = this.solveIslandCam(this._panelWant);
        pos = this._camPos || (this._camPos = new THREE.Vector3());
        target = this._camTgt || (this._camTgt = new THREE.Vector3());
        pos.lerpVectors(base.pos, pc.pos, k);
        target.lerpVectors(base.target, pc.target, k);
      } else if (want <= 0.01) this._panelWant = 0;
    }
    this.islandCam.pos.copy(pos);
    this.islandCam.target.copy(target);
    const cam = this.camera;
    cam.position.copy(pos);
    cam.lookAt(target);
  };

  // ------------------------------------------------------------------ animation
  Scene.glowLevel = 0;
  Scene.on('update', function (dt, t) {
    this.clothTime.value = t;
    const want = this.night ? 1 : 0;
    this.glowLevel += (want - this.glowLevel) * Math.min(1, dt * 1.5);
    this.setGlow(this.glowLevel);
  });

  Scene.updateIsland = function (dt, t) {
    this.updateIslandCam();
    if (this.playerShip && !this.playerShip.userData.wreck) {
      const s = this.playerShip;
      s.position.y = this.waveAt(s.position.x, s.position.z) * 0.6;
      s.rotation.z = Math.sin(t * 0.8) * 0.025;
      s.rotation.x = Math.sin(t * 0.6) * 0.018;
    }
    if (this.chest) this.chest.position.y = this.chest.userData.baseY + (this.chestPulse > 0 ? Math.abs(Math.sin(this.chestPulse * 30)) * 0.06 : 0);
    if (this.chestPulse > 0) this.chestPulse -= dt;
    if (this.millSails) this.millSails.rotation.z -= dt * 0.7;
    // chimney smoke, campfire flames, waterfall spray
    const smoke = (list, rate) => {
      for (const s of list) {
        s.t -= dt;
        if (s.t > 0) continue;
        s.t = rate * (0.7 + Math.random() * 0.6);
        this.emit({ pos: [s.p.x + (Math.random() - 0.5) * 0.06, s.p.y, s.p.z], vel: [0.12 + Math.random() * 0.1, 0.45, (Math.random() - 0.5) * 0.08], life: 2.6, size: 0.1, color: Math.random() < 0.5 ? '#d8d8d8' : '#bdbdbd', grav: 0, grow: 1.6, shrink: false, drag: 0.15 });
      }
    };
    if (this.smokers) smoke(this.smokers, 0.55);
    if (this.bSmoke) smoke(this.bSmoke, 0.5);
    if (this.campfire && Math.random() < dt * 9) {
      const c = this.campfire;
      this.emit({ pos: [c.x + (Math.random() - 0.5) * 0.15, c.y, c.z + (Math.random() - 0.5) * 0.15], vel: [(Math.random() - 0.5) * 0.2, 0.9 + Math.random() * 0.5, 0], life: 0.45, size: 0.07, color: Math.random() < 0.5 ? '#ffb13a' : '#ff6a1a', grav: 0, shrink: true });
    }
    if (this.fallBase && Math.random() < dt * 6) {
      const f = this.fallBase;
      this.emit({ pos: [f.x + (Math.random() - 0.5) * 0.7, f.y + 0.1, f.z], vel: [(Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.6, 0.3 + Math.random() * 0.3], life: 0.6, size: 0.06, color: '#e8f8ff', grav: 4, shrink: true });
    }
  };

})(window.VC);
