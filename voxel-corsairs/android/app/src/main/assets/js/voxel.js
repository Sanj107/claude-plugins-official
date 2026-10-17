'use strict';
// Voxel models and a face-culling mesher with baked ambient occlusion.
(function (VC) {
  const OFF = 512;
  function key(x, y, z) { return (x + OFF) | ((y + OFF) << 10) | ((z + OFF) << 20); }

  /** '#fff' / '#a0703c' / 0xa0703c -> integer colour (parsed strings are cached). */
  const intCache = new Map();
  function toInt(c) {
    if (typeof c !== 'string') return c;
    let r = intCache.get(c);
    if (r !== undefined) return r;
    let h = c.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    r = parseInt(h, 16);
    intCache.set(c, r);
    return r;
  }

  // Surface materials. Models tag a voxel with mat(name, colour): the colour keeps the low 24 bits and
  // the material id goes into bits 24-30, so tagged colours still work everywhere a colour does.
  // The renderer draws a procedural pixel texture per material (planks, bricks, roof tiles, leaves…);
  // untagged voxels are 'plain'. Append new names at the end only — ids are positional.
  const MATS = ['plain', 'wood', 'plank', 'stone', 'brick', 'cobble', 'roof', 'thatch', 'leaf', 'grass',
    'sand', 'rock', 'metal', 'gold', 'cloth', 'glass', 'water', 'snow', 'lava', 'dirt', 'bark'];
  function mat(name, c) {
    const id = MATS.indexOf(name);
    return (toInt(c) & 0xffffff) | ((id > 0 ? id : 0) << 24);
  }
  /** Material id of a (possibly tagged) colour. */
  function matOf(c) { return (toInt(c) >>> 24) & 127; }

  function hexToRgb(c) {
    c = toInt(c);
    return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  }

  class Vox {
    constructor() {
      this.map = new Map();
      this.minX = this.minY = this.minZ = Infinity;
      this.maxX = this.maxY = this.maxZ = -Infinity;
    }
    set(x, y, z, c) {
      x = Math.round(x); y = Math.round(y); z = Math.round(z);
      if (c === null || c === undefined) { this.map.delete(key(x, y, z)); return; }
      this.map.set(key(x, y, z), toInt(c));
      if (x < this.minX) this.minX = x; if (x > this.maxX) this.maxX = x;
      if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
      if (z < this.minZ) this.minZ = z; if (z > this.maxZ) this.maxZ = z;
    }
    get(x, y, z) { return this.map.get(key(x, y, z)); }
    has(x, y, z) { return this.map.has(key(x, y, z)); }
    del(x, y, z) { this.map.delete(key(x, y, z)); }
    box(x0, y0, z0, x1, y1, z1, c) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
          for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, c);
    }
    /** Ellipsoid centred at (cx,cy,cz) with radii rx,ry,rz. */
    ball(cx, cy, cz, rx, ry, rz, c, filter) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
          for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
            const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
            if (d <= 1 && (!filter || filter(x, y, z))) this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
          }
    }
    /** Line of voxels from a to b (inclusive), optional thickness radius. */
    line(x0, y0, z0, x1, y1, z1, c, r) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
        if (r) this.ball(x, y, z, r, r, r, c); else this.set(x, y, z, c);
      }
    }
    /** Vertical cylinder (or cone when r1 is given) from y0 to y1. */
    cyl(cx, y0, cz, r, y1, c, r1) {
      for (let y = y0; y <= y1; y++) {
        const rr = r1 === undefined ? r : r + (r1 - r) * (y - y0) / Math.max(1, y1 - y0);
        for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++)
          for (let z = Math.floor(cz - rr); z <= Math.ceil(cz + rr); z++)
            if ((x - cx) ** 2 + (z - cz) ** 2 <= rr * rr + 0.3) this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
      }
    }
    /** Copies another Vox in, shifted and turned by `rot` quarter turns around +y. */
    paste(o, dx, dy, dz, rot) {
      rot = ((rot || 0) % 4 + 4) % 4;
      o.each((x, y, z, c) => {
        let px = x, pz = z;
        if (rot === 1) { px = z; pz = -x; } else if (rot === 2) { px = -x; pz = -z; } else if (rot === 3) { px = -z; pz = x; }
        this.set(px + (dx || 0), y + (dy || 0), pz + (dz || 0), c);
      });
      return this;
    }
    each(fn) {
      for (const [k, c] of this.map) {
        fn((k & 1023) - OFF, ((k >> 10) & 1023) - OFF, ((k >> 20) & 1023) - OFF, c);
      }
    }
    get count() { return this.map.size; }
  }

  // Face definitions: normal, the 4 corners (unit cube), and the two in-plane axes for AO.
  const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.82 },
    { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.82 },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
    { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.92 },
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.92 },
  ];
  const AO = [0.5, 0.68, 0.84, 1.0];
  // For every face corner: the in-plane offsets (u, w) of the AO neighbours.
  for (const f of FACES) {
    const axes = [0, 1, 2].filter(a => f.n[a] === 0);
    f.ao = f.c.map(corner => {
      const d = [corner[0] * 2 - 1, corner[1] * 2 - 1, corner[2] * 2 - 1];
      const u = [0, 0, 0], w = [0, 0, 0];
      u[axes[0]] = d[axes[0]];
      w[axes[1]] = d[axes[1]];
      return [u, w];
    });
  }
  const rgbCache = new Map();
  function rgbOf(c) {
    let r = rgbCache.get(c);
    if (!r) { r = hexToRgb(c); rgbCache.set(c, r); }
    return r;
  }

  /**
   * Builds a BufferGeometry. opts: { scale, center: [x,y,z] in voxels or 'base', noise }
   * Coordinates: model voxel (x,y,z) occupies [x,x+1] etc., scaled by `scale`.
   * Extra options (all optional):
   *   occluders: Vox or [Vox]  - voxels treated as solid for culling/AO but not drawn
   *   skipBottom: true         - drop downward faces (terrain, things standing on the ground)
   *   attr: { name, size, fn(x, y, z, cx, cy, cz) -> number[] } - extra per-vertex attribute;
   *          (x,y,z) is the voxel, (cx,cy,cz) the vertex position in voxel space.
   * Uses a dense occupancy grid over the model bounds, so big models mesh quickly.
   */
  function mesh(v, opts) {
    opts = opts || {};
    const s = opts.scale || 0.25;
    let ox = 0, oy = 0, oz = 0;
    if (opts.center === 'base') {
      ox = (v.minX + v.maxX + 1) / 2; oy = v.minY; oz = (v.minZ + v.maxZ + 1) / 2;
    } else if (Array.isArray(opts.center)) [ox, oy, oz] = opts.center;
    const noise = opts.noise === undefined ? 0.05 : opts.noise;
    const g = new THREE.BufferGeometry();
    if (!v.map.size) {
      g.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
      if (opts.attr) g.setAttribute(opts.attr.name, new THREE.Float32BufferAttribute([], opts.attr.size));
      g.setIndex([]);
      return g;
    }
    // Dense occupancy grid with a one-voxel border.
    const x0 = v.minX - 1, y0 = v.minY - 1, z0 = v.minZ - 1;
    const nx = v.maxX - v.minX + 3, ny = v.maxY - v.minY + 3, nz = v.maxZ - v.minZ + 3;
    const grid = new Uint8Array(nx * ny * nz);
    const SY = nz, SX = ny * nz;
    const mark = (vox) => {
      for (const k of vox.map.keys()) {
        const x = (k & 1023) - OFF - x0, y = ((k >> 10) & 1023) - OFF - y0, z = ((k >> 20) & 1023) - OFF - z0;
        if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
        grid[x * SX + y * SY + z] = 1;
      }
    };
    mark(v);
    if (opts.occluders) (Array.isArray(opts.occluders) ? opts.occluders : [opts.occluders]).forEach(mark);
    // Per face: neighbour delta and per-corner AO deltas.
    const fd = FACES.map(f => ({
      f, dn: f.n[0] * SX + f.n[1] * SY + f.n[2],
      ao: f.ao.map(([u, w]) => [u[0] * SX + u[1] * SY + u[2], w[0] * SX + w[1] * SY + w[2], (u[0] + w[0]) * SX + (u[1] + w[1]) * SY + (u[2] + w[2])]),
      skip: opts.skipBottom && f.n[1] === -1,
    }));
    // Pass 1: count visible faces.
    const keys = Array.from(v.map.keys());
    let faces = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const gi = ((k & 1023) - OFF - x0) * SX + (((k >> 10) & 1023) - OFF - y0) * SY + (((k >> 20) & 1023) - OFF - z0);
      for (let j = 0; j < 6; j++) if (!fd[j].skip && !grid[gi + fd[j].dn]) faces++;
    }
    const pos = new Float32Array(faces * 12), nor = new Float32Array(faces * 12), col = new Float32Array(faces * 12);
    const A = opts.attr, asz = A ? A.size : 0;
    const extra = A ? new Float32Array(faces * 4 * asz) : null;
    const big = faces * 4 > 65535;
    const idx = big ? new Uint32Array(faces * 6) : new Uint16Array(faces * 6);
    let vi = 0, pi = 0, ii = 0, ei = 0;
    const aos = [0, 0, 0, 0];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const x = (k & 1023) - OFF, y = ((k >> 10) & 1023) - OFF, z = ((k >> 20) & 1023) - OFF;
      const gi = (x - x0) * SX + (y - y0) * SY + (z - z0);
      const rgb = rgbOf(v.map.get(k));
      // Stable per-voxel noise so surfaces look hand-painted rather than flat.
      const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      const nzk = 1 + ((h - Math.floor(h)) - 0.5) * 2 * noise;
      for (let j = 0; j < 6; j++) {
        const F = fd[j];
        if (F.skip) continue;
        const ni = gi + F.dn;
        if (grid[ni]) continue;
        const f = F.f;
        for (let c = 0; c < 4; c++) {
          const d = F.ao[c];
          const s1 = grid[ni + d[0]], s2 = grid[ni + d[1]], cc = grid[ni + d[2]];
          const ao = AO[s1 && s2 ? 0 : 3 - (s1 + s2 + cc)];
          aos[c] = ao;
          const corner = f.c[c];
          const cx = x + corner[0], cy = y + corner[1], cz = z + corner[2];
          pos[pi] = (cx - ox) * s; pos[pi + 1] = (cy - oy) * s; pos[pi + 2] = (cz - oz) * s;
          nor[pi] = f.n[0]; nor[pi + 1] = f.n[1]; nor[pi + 2] = f.n[2];
          const b = f.shade * ao * nzk;
          col[pi] = rgb[0] * b; col[pi + 1] = rgb[1] * b; col[pi + 2] = rgb[2] * b;
          pi += 3;
          if (A) { const a = A.fn(x, y, z, cx, cy, cz); for (let q = 0; q < asz; q++) extra[ei++] = a[q] || 0; }
        }
        // Flip the quad diagonal to avoid AO anisotropy.
        if (aos[0] + aos[2] < aos[1] + aos[3]) {
          idx[ii++] = vi + 1; idx[ii++] = vi + 2; idx[ii++] = vi + 3; idx[ii++] = vi + 1; idx[ii++] = vi + 3; idx[ii++] = vi;
        } else {
          idx[ii++] = vi; idx[ii++] = vi + 1; idx[ii++] = vi + 2; idx[ii++] = vi; idx[ii++] = vi + 2; idx[ii++] = vi + 3;
        }
        vi += 4;
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (A) g.setAttribute(A.name, new THREE.BufferAttribute(extra, asz));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  /**
   * Fast mesher for heightfields (terrain): columns of voxels from yMin up to height(i,k).
   * hf: { i0, k0, ni, nk, yMin, height(i,k) -> top layer or -Infinity, color(i,y,k) -> int }
   * Same look as mesh(): per-voxel faces with baked AO and noise; no bottom faces.
   */
  function heightMesh(hf, opts) {
    opts = opts || {};
    const s = opts.scale || 0.25;
    const noise = opts.noise === undefined ? 0.05 : opts.noise;
    const { i0, k0, ni, nk, yMin } = hf;
    const W = ni + 2, Dk = nk + 2;
    const Hs = new Int16Array(W * Dk).fill(-32768);
    for (let i = 0; i < ni; i++) for (let k = 0; k < nk; k++) {
      const h = hf.height(i0 + i, k0 + k);
      if (h >= yMin) Hs[(i + 1) * Dk + k + 1] = h;
    }
    const ti = (i, k) => (i - i0 + 1) * Dk + (k - k0 + 1);
    // count faces
    const SD = [Dk, -Dk, 1, -1];
    let faces = 0;
    for (let i = i0; i < i0 + ni; i++) for (let k = k0; k < k0 + nk; k++) {
      const c0 = ti(i, k), h = Hs[c0];
      if (h < yMin) continue;
      faces++;
      for (let q = 0; q < 4; q++) {
        const nh = Math.max(Hs[c0 + SD[q]], yMin - 1);
        if (nh < h) faces += h - nh;
      }
    }
    const pos = new Float32Array(faces * 12), nor = new Float32Array(faces * 12), col = new Float32Array(faces * 12);
    const big = faces * 4 > 65535;
    const idx = big ? new Uint32Array(faces * 6) : new Uint16Array(faces * 6);
    let vi = 0, pi = 0, ii = 0;
    const aos = [0, 0, 0, 0];
    const HL = Hs.length;
    // solid test on (column index, layer); out-of-range columns are empty
    const sol = (c, y) => c >= 0 && c < HL && y >= yMin && y <= Hs[c];
    // per face, per corner: column deltas and layer deltas of the 3 AO neighbours
    const fset = [FACES[0], FACES[1], FACES[2], FACES[4], FACES[5]].map(f => ({
      f, dc: f.n[0] * Dk + f.n[2], dy: f.n[1],
      ao: f.ao.map(([u, w]) => [u[0] * Dk + u[2], u[1], w[0] * Dk + w[2], w[1], (u[0] + w[0]) * Dk + u[2] + w[2], u[1] + w[1]]),
    }));
    const FT = fset[2], FS = [fset[0], fset[1], fset[3], fset[4]];
    let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
    const emit = (F, c0, x, y, z, rgb, nzk) => {
      const f = F.f, nc = c0 + F.dc, ny = y + F.dy;
      for (let c = 0; c < 4; c++) {
        const a = F.ao[c];
        const s1 = sol(nc + a[0], ny + a[1]) ? 1 : 0, s2 = sol(nc + a[2], ny + a[3]) ? 1 : 0, cc = sol(nc + a[4], ny + a[5]) ? 1 : 0;
        const ao = AO[s1 && s2 ? 0 : 3 - (s1 + s2 + cc)];
        aos[c] = ao;
        const corner = f.c[c];
        const px = (x + corner[0]) * s, py = (y + corner[1]) * s, pz = (z + corner[2]) * s;
        pos[pi] = px; pos[pi + 1] = py; pos[pi + 2] = pz;
        if (px < bx0) bx0 = px; if (py < by0) by0 = py; if (pz < bz0) bz0 = pz;
        if (px > bx1) bx1 = px; if (py > by1) by1 = py; if (pz > bz1) bz1 = pz;
        nor[pi] = f.n[0]; nor[pi + 1] = f.n[1]; nor[pi + 2] = f.n[2];
        const b = f.shade * ao * nzk;
        col[pi] = rgb[0] * b; col[pi + 1] = rgb[1] * b; col[pi + 2] = rgb[2] * b;
        pi += 3;
      }
      if (aos[0] + aos[2] < aos[1] + aos[3]) {
        idx[ii++] = vi + 1; idx[ii++] = vi + 2; idx[ii++] = vi + 3; idx[ii++] = vi + 1; idx[ii++] = vi + 3; idx[ii++] = vi;
      } else {
        idx[ii++] = vi; idx[ii++] = vi + 1; idx[ii++] = vi + 2; idx[ii++] = vi; idx[ii++] = vi + 2; idx[ii++] = vi + 3;
      }
      vi += 4;
    };
    for (let i = i0; i < i0 + ni; i++) for (let k = k0; k < k0 + nk; k++) {
      const c0 = ti(i, k), h = Hs[c0];
      if (h < yMin) continue;
      let lo = h;
      for (let q = 0; q < 4; q++) lo = Math.min(lo, Math.max(Hs[c0 + SD[q]], yMin - 1) + 1);
      for (let y = Math.max(yMin, lo); y <= h; y++) {
        const rgb = rgbOf(hf.color(i, y, k));
        const hh = Math.sin(i * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
        const nzk = 1 + ((hh - Math.floor(hh)) - 0.5) * 2 * noise;
        if (y === h) emit(FT, c0, i, y, k, rgb, nzk);
        for (let q = 0; q < 4; q++) if (Math.max(Hs[c0 + SD[q]], yMin - 1) < y) emit(FS[q], c0, i, y, k, rgb, nzk);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((bx0 + bx1) / 2, (by0 + by1) / 2, (bz0 + bz1) / 2), Math.hypot(bx1 - bx0, by1 - by0, bz1 - bz0) / 2);
    return g;
  }

  let sharedMat = null;
  function material(opts) {
    if (!opts && sharedMat) return sharedMat;
    const m = new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, opts || {}));
    if (!opts) sharedMat = m;
    return m;
  }

  function toMesh(v, opts) {
    const g = mesh(v, opts);
    const m = new THREE.Mesh(g, (opts && opts.material) || material());
    return m;
  }

  VC.Voxel = { Vox, mesh, heightMesh, toMesh, material, hexToRgb, toInt, MATS, mat, matOf };
})(window.VC);
