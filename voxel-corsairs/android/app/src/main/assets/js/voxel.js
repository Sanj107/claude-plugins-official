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
  // The index of a face in this list is its direction id (0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z),
  // which the texture shader reads to pick the face plane.
  const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.82 },
    { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.82 },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
    { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.92 },
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.92 },
  ];
  FACES.forEach((f, i) => { f.dir = i; });
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

  // ------------------------------------------------------------------ vertex layout
  // Every voxel mesh carries (memory per vertex: 12 + 3 + 3 + 8 = 26 bytes):
  //   position  Float32 x3            object space
  //   normal    Int8 x3, normalized   axis-aligned face normal
  //   color     Uint8 x3, normalized  colour with the baked face shade, AO and per-voxel noise
  //   vox       Int16 x4              voxel-space corner (x, y, z) and a packed word:
  //                                   material id * 128 + face direction * 16 + texels per voxel
  // The shader draws the material's pixel texture from `vox` at a constant world-space density
  // (TEXELS per world unit), so 0.25 terrain and 0.125 detail models look like one world.
  const TEXELS = 32;
  /** Texels per voxel for a mesh scale (0 turns the texture off; max 15). */
  function texelsFor(scale) { return Math.max(1, Math.min(15, Math.round(scale * TEXELS))); }
  function newBuffers(faces, extraSize) {
    const nv = faces * 4;
    return {
      pos: new Float32Array(nv * 3), nor: new Int8Array(nv * 3), col: new Uint8Array(nv * 3), vox: new Int16Array(nv * 4),
      extra: extraSize ? new Float32Array(nv * extraSize) : null,
      idx: nv > 65535 ? new Uint32Array(faces * 6) : new Uint16Array(faces * 6),
    };
  }
  function finishGeo(B, extraAttr) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(B.nor, 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(B.col, 3, true));
    g.setAttribute('vox', new THREE.BufferAttribute(B.vox, 4));
    if (extraAttr) g.setAttribute(extraAttr.name, new THREE.BufferAttribute(B.extra, extraAttr.size));
    g.setIndex(new THREE.BufferAttribute(B.idx, 1));
    return g;
  }
  const c255 = v => (v >= 1 ? 255 : v <= 0 ? 0 : (v * 255 + 0.5) | 0);

  /**
   * Builds a BufferGeometry. opts: { scale, center: [x,y,z] in voxels or 'base', noise }
   * Coordinates: model voxel (x,y,z) occupies [x,x+1] etc., scaled by `scale`.
   * Extra options (all optional):
   *   occluders: Vox or [Vox]  - voxels treated as solid for culling/AO but not drawn
   *   skipBottom: true         - drop downward faces (terrain, things standing on the ground)
   *   attr: { name, size, fn(x, y, z, cx, cy, cz) -> number[] } - extra per-vertex attribute;
   *          (x,y,z) is the voxel, (cx,cy,cz) the vertex position in voxel space.
   *   texels: texels per voxel for the surface texture (default from the scale; 0 = untextured)
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
    const tpv = opts.texels === undefined ? texelsFor(s) : opts.texels;
    const A = opts.attr, asz = A ? A.size : 0;
    if (!v.map.size) {
      const g = finishGeo(newBuffers(0, asz), A);
      g.computeBoundingSphere();
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
    const B = newBuffers(faces, asz);
    const { pos, nor, col, vox, extra, idx } = B;
    let vi = 0, pi = 0, ii = 0, ei = 0, qi = 0;
    const aos = [0, 0, 0, 0];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const x = (k & 1023) - OFF, y = ((k >> 10) & 1023) - OFF, z = ((k >> 20) & 1023) - OFF;
      const gi = (x - x0) * SX + (y - y0) * SY + (z - z0);
      const c = v.map.get(k);
      const rgb = rgbOf(c);
      const mword = ((c >>> 24) & 127) * 128 + tpv;
      // Stable per-voxel noise so surfaces look hand-painted rather than flat.
      const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      const nzk = 1 + ((h - Math.floor(h)) - 0.5) * 2 * noise;
      for (let j = 0; j < 6; j++) {
        const F = fd[j];
        if (F.skip) continue;
        const ni = gi + F.dn;
        if (grid[ni]) continue;
        const f = F.f;
        const w = tpv ? mword + j * 16 : 0;
        for (let c4 = 0; c4 < 4; c4++) {
          const d = F.ao[c4];
          const s1 = grid[ni + d[0]], s2 = grid[ni + d[1]], cc = grid[ni + d[2]];
          const ao = AO[s1 && s2 ? 0 : 3 - (s1 + s2 + cc)];
          aos[c4] = ao;
          const corner = f.c[c4];
          const cx = x + corner[0], cy = y + corner[1], cz = z + corner[2];
          pos[pi] = (cx - ox) * s; pos[pi + 1] = (cy - oy) * s; pos[pi + 2] = (cz - oz) * s;
          nor[pi] = f.n[0] * 127; nor[pi + 1] = f.n[1] * 127; nor[pi + 2] = f.n[2] * 127;
          const b = f.shade * ao * nzk;
          col[pi] = c255(rgb[0] * b); col[pi + 1] = c255(rgb[1] * b); col[pi + 2] = c255(rgb[2] * b);
          pi += 3;
          vox[qi] = cx; vox[qi + 1] = cy; vox[qi + 2] = cz; vox[qi + 3] = w; qi += 4;
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
    const g = finishGeo(B, A);
    g.computeBoundingSphere();
    return g;
  }

  /**
   * Fast mesher for heightfields (terrain): columns of voxels from yMin up to height(i,k).
   * hf: { i0, k0, ni, nk, yMin, height(i,k) -> top layer or -Infinity, color(i,y,k) -> int }
   * Same look and vertex layout as mesh(): per-voxel faces with baked AO and noise; no bottom faces.
   */
  function heightMesh(hf, opts) {
    opts = opts || {};
    const s = opts.scale || 0.25;
    const noise = opts.noise === undefined ? 0.05 : opts.noise;
    const tpv = opts.texels === undefined ? texelsFor(s) : opts.texels;
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
    const B = newBuffers(faces, 0);
    const { pos, nor, col, vox, idx } = B;
    let vi = 0, pi = 0, ii = 0, qi = 0;
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
    const emit = (F, c0, x, y, z, rgb, nzk, mword) => {
      const f = F.f, nc = c0 + F.dc, ny = y + F.dy;
      const w = tpv ? mword + f.dir * 16 : 0;
      for (let c = 0; c < 4; c++) {
        const a = F.ao[c];
        const s1 = sol(nc + a[0], ny + a[1]) ? 1 : 0, s2 = sol(nc + a[2], ny + a[3]) ? 1 : 0, cc = sol(nc + a[4], ny + a[5]) ? 1 : 0;
        const ao = AO[s1 && s2 ? 0 : 3 - (s1 + s2 + cc)];
        aos[c] = ao;
        const corner = f.c[c];
        const vx = x + corner[0], vy = y + corner[1], vz = z + corner[2];
        const px = vx * s, py = vy * s, pz = vz * s;
        pos[pi] = px; pos[pi + 1] = py; pos[pi + 2] = pz;
        if (px < bx0) bx0 = px; if (py < by0) by0 = py; if (pz < bz0) bz0 = pz;
        if (px > bx1) bx1 = px; if (py > by1) by1 = py; if (pz > bz1) bz1 = pz;
        nor[pi] = f.n[0] * 127; nor[pi + 1] = f.n[1] * 127; nor[pi + 2] = f.n[2] * 127;
        const b = f.shade * ao * nzk;
        col[pi] = c255(rgb[0] * b); col[pi + 1] = c255(rgb[1] * b); col[pi + 2] = c255(rgb[2] * b);
        pi += 3;
        vox[qi] = vx; vox[qi + 1] = vy; vox[qi + 2] = vz; vox[qi + 3] = w; qi += 4;
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
        const c = hf.color(i, y, k);
        const rgb = rgbOf(c);
        const mword = ((toInt(c) >>> 24) & 127) * 128 + tpv;
        const hh = Math.sin(i * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
        const nzk = 1 + ((hh - Math.floor(hh)) - 0.5) * 2 * noise;
        if (y === h) emit(FT, c0, i, y, k, rgb, nzk, mword);
        for (let q = 0; q < 4; q++) if (Math.max(Hs[c0 + SD[q]], yMin - 1) < y) emit(FS[q], c0, i, y, k, rgb, nzk, mword);
      }
    }
    const g = finishGeo(B, null);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((bx0 + bx1) / 2, (by0 + by1) / 2, (bz0 + bz1) / 2), Math.hypot(bx1 - bx0, by1 - by0, bz1 - bz0) / 2);
    return g;
  }

  // ------------------------------------------------------------------ surface texture shader
  // Shared uniforms (scene.js updates them every frame):
  //   uVxTime    seconds (gold sparkle, lava pulse)
  //   uVxDetail  0..1 pattern strength (graphics quality; 0 = flat colours)
  //   uVxNight   0..1 (window glass glows at night)
  //   uVxCloud   up to 4 cloud shadows: (x, z) on the cloud layer, 1/radius x, 1/radius z
  //   uVxCloudK  shadow strength of each of them (0 = unused)
  //   uVxSun     (sun.x / sun.y, sun.z / sun.y, cloud layer height, -) for projecting shadows
  const U = {
    uVxTime: { value: 0 },
    uVxDetail: { value: 1 },
    uVxNight: { value: 0 },
    uVxCloud: { value: [new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(0, 0, 1, 1)] },
    uVxCloudK: { value: new THREE.Vector4(0, 0, 0, 0) },
    uVxSun: { value: new THREE.Vector4(0.5, -0.6, 30, 0) },
  };

  // GLSL shared by the voxel material and the voxel water (sea.js): hashes, anti-aliased seams,
  // cloud shadows.
  const GLSL_COMMON = `
uniform float uVxTime;
uniform float uVxDetail;
uniform float uVxNight;
uniform vec4 uVxCloud[4];
uniform vec4 uVxCloudK;
uniform vec4 uVxSun;
#if defined(GL_OES_standard_derivatives) || __VERSION__ >= 300
#define VX_DERIV 1
#endif
float vxH2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vxH3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
// Coverage of the 1-texel lines at x = k*P .. k*P+1 (x in texels), filtered over fw texels per pixel.
float vxSeam(float x, float P, float fw) {
  float y = mod(x, P);
  float d = min(abs(y - 0.5), abs(y - P - 0.5));
  float h = max(0.5 * fw, 0.03);
  return (1.0 - smoothstep(0.5 - h, 0.5 + h, d)) * min(1.0, 1.0 / max(fw, 0.001));
}
float vxCloudOne(vec2 q, vec4 c, float k) {
  vec2 d = (q - c.xy) * c.zw;
  return k * (1.0 - smoothstep(0.25, 1.0, dot(d, d)));
}
// 0..1 how much the sun is hidden by a cloud above world point w.
float vxCloudShadow(vec3 w) {
  vec2 q = w.xz + uVxSun.xy * (uVxSun.z - w.y);
  float s = vxCloudOne(q, uVxCloud[0], uVxCloudK.x);
  s = max(s, vxCloudOne(q, uVxCloud[1], uVxCloudK.y));
  s = max(s, vxCloudOne(q, uVxCloud[2], uVxCloudK.z));
  s = max(s, vxCloudOne(q, uVxCloud[3], uVxCloudK.w));
  return s;
}
`;

  // The per-material pixel textures. c = vertex colour (already shaded); returns the textured
  // colour and adds glow (lava, gold sparkle, lit windows at night) to em.
  const GLSL_TEX = `
varying vec4 vVox;
varying vec3 vVxW;
vec3 vxTexture(vec3 c, inout vec3 em) {
  float w = floor(vVox.w + 0.5);
  float tpv = mod(w, 16.0);
  if (tpv < 0.5 || uVxDetail < 0.01) return c;
  float dir = mod(floor(w / 16.0), 8.0);
  float mat = floor(w / 128.0);
  float ax = floor(dir * 0.5);
  float sg = mod(dir, 2.0) < 0.5 ? 1.0 : -1.0;
  vec3 p = vVox.xyz;
  vec3 nrm = ax < 0.5 ? vec3(sg, 0.0, 0.0) : (ax < 1.5 ? vec3(0.0, sg, 0.0) : vec3(0.0, 0.0, sg));
  vec2 uv = ax < 0.5 ? p.zy : (ax < 1.5 ? p.xz : p.xy);
  vec3 cell = floor(p - nrm * 0.5);
  float top = (ax > 0.5 && ax < 1.5) ? 1.0 : 0.0;
  vec2 tc = uv * tpv;
  vec2 ti = floor(tc);
  vec2 lc = fract(uv);
#ifdef VX_DERIV
  vec2 fw2 = fwidth(tc);
  float fw = max(max(fw2.x, fw2.y), 0.001);
#else
  float fw = 0.8;
#endif
  // texel-sized detail fades out below ~1.5 px per texel, seams/rows below ~0.4 px
  float kT = (1.0 - smoothstep(0.66, 1.4, fw)) * uVxDetail;
  float kL = (1.0 - smoothstep(1.6, 3.2, fw)) * min(1.0, uVxDetail * 1.4);
  float plane = dot(p, abs(nrm)) * 1.37 + dir * 3.1;
  float n = vxH3(vec3(ti, plane));
  float ch = vxH3(cell + vec3(0.31, 0.17, 0.73));
  float m = 0.0;
  vec3 col = c;
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  if (mat < 0.5) {                       // plain: soft per-texel noise
    m = (n - 0.5) * 0.09 * kT;
  } else if (mat < 1.5 || mat > 19.5) {  // wood / bark
    if (top > 0.5) {
      float r = length(lc - 0.5) * tpv;
      m = -0.13 * vxSeam(r + ch * 2.0, 2.0, fw) * kL + (n - 0.5) * 0.06 * kT;
    } else if (mat < 1.5) {
      float g = vxH2(vec2(ti.x, floor(tc.y / 6.0) + plane)) - 0.5;
      m = g * 0.14 * kT - 0.10 * vxSeam(tc.x + floor(ch * 5.0), 5.0, fw) * kL + (n - 0.5) * 0.04 * kT;
    } else {
      float fx = tc.x + floor(vxH2(vec2(floor(tc.y / 5.0), plane)) * 3.0);
      float g = vxH2(vec2(ti.x, floor(tc.y / 3.0) + plane)) - 0.5;
      m = -0.30 * vxSeam(fx, 3.0, fw) * kL + g * 0.16 * kT;
    }
  } else if (mat < 2.5) {                // plank: boards along u, staggered joints, grain, nails
    float b = floor(tc.y / 4.0);
    float bh = vxH2(vec2(b, plane));
    float L = 16.0 + floor(bh * 3.0) * 4.0;
    float al = tc.x + floor(bh * 37.0);
    float sh = vxH2(vec2(floor(al / L), b + plane * 3.0));
    float seam = max(vxSeam(tc.y, 4.0, fw), vxSeam(al, L, fw));
    float grain = vxH2(vec2(floor(al / 3.0), ti.y + plane)) - 0.5;
    float ai = floor(mod(al, L)), bi = floor(mod(tc.y, 4.0));
    float nail = ((ai == 1.0 || ai == L - 2.0) && bi == 2.0) ? 1.0 : 0.0;
    m = (sh - 0.5) * 0.18 * kL + grain * 0.10 * kT + (n - 0.5) * 0.04 * kT - 0.34 * seam * kL - 0.28 * nail * kT;
  } else if (mat < 3.5) {                // stone: big staggered blocks
    float r = floor(tc.y / 8.0);
    float xx = tc.x + mod(r, 2.0) * 6.0;
    float bh = vxH2(vec2(floor(xx / 12.0), r + plane * 7.0));
    float mortar = max(vxSeam(tc.y, 8.0, fw), vxSeam(xx, 12.0, fw));
    float mott = vxH3(vec3(floor(tc / 2.0), plane)) - 0.5;
    float bev = (mod(tc.y, 8.0) >= 7.0 && top < 0.5) ? 1.0 : 0.0;
    m = (bh - 0.5) * 0.16 * kL + mott * 0.10 * kT + (n - 0.5) * 0.06 * kT - 0.30 * mortar * kL + 0.06 * bev * kT;
  } else if (mat < 4.5) {                // brick: staggered courses with light mortar
    float r = floor(tc.y / 4.0);
    float xx = tc.x + mod(r, 2.0) * 4.0;
    float bh = vxH2(vec2(floor(xx / 8.0), r + plane * 7.0));
    float mortar = max(vxSeam(tc.y, 4.0, fw), vxSeam(xx, 8.0, fw));
    m = (bh - 0.5) * 0.22 * kL + (n - 0.5) * 0.07 * kT;
    col = mix(col, vec3(lum * 1.2 + 0.03), mortar * 0.7 * kL);
  } else if (mat < 5.5) {                // cobble: irregular stones with dark gaps
    float r = floor(tc.y / 5.0);
    float xx = tc.x + floor(vxH2(vec2(r, plane)) * 5.0);
    float sh = vxH2(vec2(floor(xx / 5.0), r + plane * 5.0));
    vec2 l = vec2(mod(xx, 5.0), mod(tc.y, 5.0));
    float gap = max(vxSeam(tc.y, 5.0, fw), vxSeam(xx, 5.0, fw));
    float corner = (l.x < 2.0 || l.x >= 4.0) && (l.y < 2.0 || l.y >= 4.0) && (l.x < 1.0 || l.x >= 4.0 || l.y < 1.0 || l.y >= 4.0) ? 1.0 : 0.0;
    float hi = (l.y >= 3.0 && l.y < 4.0 && l.x >= 1.0 && l.x < 4.0) ? 1.0 : 0.0;
    m = (sh - 0.5) * 0.26 * kL + (n - 0.5) * 0.06 * kT - 0.36 * max(gap * kL, corner * 0.6 * kT) + 0.07 * hi * kT;
  } else if (mat < 6.5) {                // roof: overlapping tile rows with shadow lines
    float r = floor(tc.y / 4.0);
    float ly = mod(tc.y, 4.0);
    float xx = tc.x + mod(r, 2.0) * 2.0;
    float th = vxH2(vec2(floor(xx / 4.0), r + plane * 3.0));
    float lx = mod(xx, 4.0);
    float shadow = vxSeam(tc.y, 4.0, fw);
    float split = vxSeam(xx, 4.0, fw) * (ly >= 1.0 ? 1.0 : 0.0);
    float round_ = (ly >= 1.0 && ly < 2.0 && (lx < 1.0 || lx >= 3.0)) ? 1.0 : 0.0;
    m = (th - 0.5) * 0.20 * kL + (n - 0.5) * 0.06 * kT - 0.36 * shadow * kL - 0.16 * split * kL - 0.14 * round_ * kT + (ly >= 3.0 ? 0.08 : 0.0) * kT;
  } else if (mat < 7.5) {                // thatch: straw streaks in layers
    float st = vxH2(vec2(ti.x, floor(tc.y / 3.0) + plane)) - 0.5;
    m = st * 0.24 * kT + (n - 0.5) * 0.06 * kT - 0.24 * vxSeam(tc.y + floor(vxH2(vec2(floor(tc.x / 3.0), plane)) * 2.0), 6.0, fw) * kL;
  } else if (mat < 8.5) {                // leaf: clusters with dark gaps and light tips
    float c1 = vxH3(vec3(floor(tc / 2.0), plane + ch * 13.0));
    m = (c1 < 0.22 ? -0.34 : (c1 - 0.5) * 0.18) + (n > 0.86 ? 0.13 : (n - 0.5) * 0.06);
    m *= kT;
  } else if (mat < 9.5) {                // grass: speckled blades; sides: grass overhang over dirt
    if (top > 0.5) {
      float bl = vxH2(vec2(ti.x, floor(tc.y / 2.0) + plane * 3.0));
      m = (n < 0.14 ? -0.20 : (n > 0.88 ? 0.14 : (n - 0.5) * 0.10)) + (bl > 0.9 ? 0.08 : 0.0);
      m *= kT;
    } else {
      float fromTop = (1.0 - lc.y) * tpv;
      float edge = 1.0 + floor(vxH2(vec2(ti.x, plane)) * 2.5) * (tpv > 5.0 ? 1.0 : 0.5);
      float dirt = fromTop >= edge ? 1.0 : 0.0;
      vec3 dc = vec3(0.52, 0.36, 0.22) * (dot(c, vec3(0.333)) / 0.40);
      col = mix(col, dc, dirt * min(1.0, kL * 1.2));
      m = (n - 0.5) * 0.12 * kT + ((dirt > 0.5 && n > 0.9) ? 0.10 : 0.0) * kT;
    }
  } else if (mat < 10.5) {               // sand: fine speckle
    float mt = vxH3(vec3(floor(tc / 2.0), plane)) - 0.5;
    m = ((n - 0.5) * 0.07 + (n > 0.96 ? -0.06 : 0.0) + (n < 0.03 ? 0.06 : 0.0)) * kT + mt * 0.04 * kL;
  } else if (mat < 11.5) {               // rock: mottling and jagged cracks across 10-texel cells
    float mt = vxH3(vec3(floor(tc / 3.0), plane)) - 0.5;
    vec2 cc = floor(tc / 10.0);
    float hc = vxH3(vec3(cc, plane));
    vec2 cd = normalize(vec2(vxH3(vec3(cc, plane + 1.7)) - 0.5, vxH3(vec3(cc, plane + 4.3)) - 0.5) + 0.001);
    vec2 q = tc - (cc + 0.5) * 10.0 - (vec2(vxH3(vec3(cc, plane + 2.9)), vxH3(vec3(cc, plane + 6.1))) - 0.5) * 4.0;
    float along = dot(q, cd);
    float jag = floor(vxH2(vec2(floor(along / 2.0), hc * 50.0)) * 3.0) - 1.0;
    float dl = abs(dot(q, vec2(-cd.y, cd.x)) + jag * 0.6);
    float hw = max(0.5 * fw, 0.03);
    float crack = (hc > 0.45 ? 1.0 : 0.0) * (1.0 - smoothstep(0.5 - hw, 0.5 + hw, dl)) * (abs(along) < 4.5 ? 1.0 : 0.0) * min(1.0, 1.0 / fw);
    m = mt * 0.16 * kL + (n - 0.5) * 0.08 * kT - 0.30 * crack * kL + (ch - 0.5) * 0.06 * kL;
  } else if (mat < 12.5) {               // metal: panels, rivets, brushed streaks
    vec2 pl = floor(mod(tc, 8.0));
    float riv = ((pl.x == 1.0 || pl.x == 6.0) && (pl.y == 1.0 || pl.y == 6.0)) ? 1.0 : 0.0;
    float edge = max(vxSeam(tc.x, 8.0, fw), vxSeam(tc.y, 8.0, fw));
    float br = vxH2(vec2(floor(tc.x / 5.0) + plane, ti.y)) - 0.5;
    m = br * 0.10 * kT - 0.18 * edge * kL + 0.24 * riv * kT;
  } else if (mat < 13.5) {               // gold: soft bands and twinkling sparkles
    float tw = max(sin(uVxTime * 3.0 + n * 40.0), 0.0);
    float sp = n > 0.9 ? tw : 0.0;
    m = (vxH3(vec3(floor(tc / 2.0), plane)) - 0.5) * 0.14 * kT + sp * 0.5 * kT;
    em += c * sp * 0.35 * kT;
  } else if (mat < 14.5) {               // cloth: weave
    float wv = mod(ti.x + ti.y, 2.0);
    m = (wv - 0.5) * 0.08 * kT + (vxH2(vec2(floor(tc.y / 3.0), plane)) - 0.5) * 0.06 * kL + (n - 0.5) * 0.03 * kT;
  } else if (mat < 15.5) {               // glass: pane with a frame, glint, lit at night
    vec2 lt = floor(lc * tpv);
    float fr = (lt.x < 0.5 || lt.y < 0.5) ? 1.0 : 0.0;
    float glint = (abs(lt.x - lt.y - 1.0) < 0.5 && fr < 0.5) ? 1.0 : 0.0;
    m = -0.45 * fr * kL + 0.18 * glint * kT + 0.05;
    em += vec3(1.0, 0.78, 0.42) * (1.0 - fr * kL) * uVxNight * 0.65;
  } else if (mat < 16.5) {               // water: drifting ripple lines
    float rip = vxSeam(tc.x + tc.y * 0.5 + floor(uVxTime * 2.0 + ch * 6.0), 7.0, fw);
    m = rip * 0.12 * kL + (n - 0.5) * 0.05 * kT;
  } else if (mat < 17.5) {               // snow: faint sparkle
    m = ((n - 0.5) * 0.05 + (n > 0.95 ? 0.08 : 0.0)) * kT;
  } else if (mat < 18.5) {               // lava: dark crust with glowing cracks
    float r = floor(tc.y / 5.0);
    float xx = tc.x + floor(vxH2(vec2(r, plane)) * 6.0);
    float pc = floor(xx / 6.0);
    float crack = max(vxSeam(tc.y, 5.0, fw) * step(0.35, vxH2(vec2(pc, r + plane))), vxSeam(xx, 6.0, fw));
    float pulse = 0.6 + 0.4 * sin(uVxTime * 2.0 + ch * 6.28 + tc.x * 0.3);
    vec3 crust = mix(c, vec3(0.16, 0.11, 0.09), 0.72) * (0.85 + 0.3 * vxH2(vec2(pc, r)));
    col = mix(crust, vec3(1.0, 0.55, 0.15), crack * kL);
    em += vec3(1.0, 0.42, 0.08) * crack * pulse * 0.8 * max(kL, 0.3) + c * 0.06;
  } else {                               // dirt: speckle and pebbles
    m = ((n - 0.5) * 0.12 + (n > 0.92 ? 0.12 : 0.0) + (n < 0.07 ? -0.12 : 0.0)) * kT + (vxH3(vec3(floor(tc / 3.0), plane)) - 0.5) * 0.08 * kL;
  }
  // block edges read as separate voxels on natural surfaces (plain, sand, grass top, dirt, snow, rock)
  if (mat < 0.5 || (mat > 9.5 && mat < 11.5) || (mat > 8.5 && mat < 9.5 && top > 0.5) || (mat > 16.5 && mat < 17.5) || mat > 18.5 && mat < 19.5) {
    m -= 0.05 * max(vxSeam(lc.x * tpv, tpv, fw), vxSeam(lc.y * tpv, tpv, fw)) * kL;
  }
  return col * (1.0 + m);
}
`;

  /**
   * Adds the procedural pixel textures and cloud shadows to a vertex-coloured Lambert shader.
   * variant 'glow': the emission (lamps, windows) follows the texture too.
   */
  function patchShader(sh, variant) {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 vox;\nvarying vec4 vVox;\nvarying vec3 vVxW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vVox = vox;
#ifdef USE_INSTANCING
  vVxW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vVxW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL_TEX)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 vxEm = vec3(0.0);
  vec3 vxBase = diffuseColor.rgb;
  diffuseColor.rgb = vxTexture(diffuseColor.rgb, vxEm);
  vec3 vxRatio = diffuseColor.rgb / max(vxBase, vec3(0.002));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' +
        (variant === 'glow' ? '  totalEmissiveRadiance *= vColor * vxRatio;\n' : '') + '  totalEmissiveRadiance += vxEm;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directDiffuse *= 1.0 - 0.6 * vxCloudShadow(vVxW);');
  }

  /**
   * Turns a vertex-coloured MeshLambertMaterial into a textured voxel material. Keeps any
   * onBeforeCompile it already has (runs first). `variant` names the shader variant for the
   * program cache: materials with different shader code need different names.
   */
  function texturize(m, variant) {
    const prev = m.onBeforeCompile;
    const own = prev && prev !== THREE.Material.prototype.onBeforeCompile ? prev : null;
    m.extensions = Object.assign({}, m.extensions, { derivatives: true });
    m.onBeforeCompile = function (sh, r) {
      if (own) own.call(this, sh, r);
      patchShader(sh, variant);
    };
    const key = 'vx-' + (variant || 'std') + (own ? ':' + own.toString() : '');
    m.customProgramCacheKey = () => key;
    return m;
  }

  let sharedMat = null;
  function material(opts) {
    if (!opts && sharedMat) return sharedMat;
    const m = texturize(new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, opts || {})), 'std');
    if (!opts) sharedMat = m;
    return m;
  }

  function toMesh(v, opts) {
    const g = mesh(v, opts);
    const m = new THREE.Mesh(g, (opts && opts.material) || material());
    return m;
  }

  VC.Voxel = {
    Vox, mesh, heightMesh, toMesh, material, texturize, patchShader, uniforms: U, GLSL_COMMON, TEXELS, texelsFor,
    hexToRgb, toInt, MATS, mat, matOf,
  };
})(window.VC);
