'use strict';
// Voxel sea, sky dome, voxel clouds with moving shadows, distant islands and the day/night colours.
//
// The sea is made of square water columns whose tops move up and down in quantized steps
// (STEP high). Everything moves on the GPU: the column geometry is static and the vertex shader
// evaluates the wave trains at each column centre, so the CPU never touches the vertices.
// Each column draws its top plus the walls toward its +x / +z neighbours (and toward a coarser
// ring or the far sea); a wall spans the height difference of the two columns, so it vanishes when
// they are level. Columns are 0.25 near the island (or the battle), 0.5 further out and 2.0 far
// away, then a flat far sea runs into the fog. Scene.waveAt(x, z) returns the same quantized level,
// so ships and props sit in the water.
(function (VC) {
  const Scene = VC.Scene;
  const M = VC.Models;
  const cachedGeo = Scene.cachedGeo;
  const VU = VC.Voxel.uniforms;

  // ------------------------------------------------------------------ waves
  const STEP = 0.125;     // height quantum of the water blocks (one detail voxel)
  const LEVEL0 = 0.03;    // rest level of the water tops (just above the sea-floor sand at y = 0)
  const RAMP = 0.2;       // part of a step spent rising: 0 = hard steps, 0.5 = smooth waves
  const AMP = 0.68;       // calm sea: about ±2 steps out at sea, ±1 in the harbour
  const G = 0.25;         // finest column (one terrain voxel)
  const FAR_SHORE = 60;   // "distance to land" used out at sea

  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function waveRaw(x, z, t) {
    return Math.sin(x * 0.18 + t * 1.1) * 0.16 + Math.sin(z * 0.23 + t * 1.4 + x * 0.05) * 0.12 +
      Math.sin((x + z) * 0.41 + t * 2.1) * 0.05 + Math.sin(x * 0.67 - z * 0.52 + t * 2.6) * 0.035;
  }
  // calmer in the shallows, and calmer far out where the columns get coarse (fades into the flat far sea)
  const damp = shore => 0.35 + 0.65 * smooth(0.5, 4.5, shore);
  const FADE0 = 30, FADE1 = 66;
  const farK = (x, z) => 1 - 0.7 * smooth(FADE0, FADE1, Math.hypot(x, z));
  function quantize(h) {
    const u = h / STEP, f = u - Math.floor(u);
    return LEVEL0 + STEP * (Math.floor(u) + smooth(0.5 - RAMP, 0.5 + RAMP, f));
  }

  /** Distance (world units) from x,z to the island's land, from the mask setShallow received. */
  Scene.shoreDist = function (x, z) {
    const L = this.landInfo;
    if (!L || this.mode !== 'island') return FAR_SHORE;
    const fi = (x - L.x0) / L.cell, fk = (z - L.z0) / L.cell;
    const i = Math.max(0, Math.min(L.nx - 1, Math.floor(fi))), k = Math.max(0, Math.min(L.nz - 1, Math.floor(fk)));
    const out = Math.hypot(Math.max(0, -fi, fi - L.nx), Math.max(0, -fk, fk - L.nz)) * L.cell;
    const j = i * L.nz + k;
    return (L.land[j] ? 0 : L.dL[j] * L.cell) + out;
  };

  /** Water surface height at x,z now: the same quantized level the water blocks show. */
  Scene.waveAt = function (x, z) {
    const amp = AMP * (this.stormy ? 2.2 : 1) * damp(this.shoreDist(x, z)) * farK(x, z);
    return quantize(waveRaw(x, z, this.t) * amp);
  };

  // ------------------------------------------------------------------ water shader
  const WATER_VS = `
#define STEP ${STEP.toFixed(4)}
#define LEVEL0 ${LEVEL0.toFixed(4)}
#define RAMP ${RAMP.toFixed(4)}
attribute vec4 aCol;   // column centre (x, z) and neighbour centre (x, z), 1/8 world units
attribute vec4 aVtx;   // corner (x, z) 1/8 units; kind + 8 * shore (1/4 units); neighbour shore + 4096 * size code
uniform float uTime;
uniform float uAmp;
uniform float uFar;
uniform vec3 uTint;
uniform vec4 uMix;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vW;
varying float vSide;
#include <fog_pars_vertex>
${VC.Voxel.GLSL_COMMON}
float wRaw(vec2 p) {
  return sin(p.x * 0.18 + uTime * 1.1) * 0.16 + sin(p.y * 0.23 + uTime * 1.4 + p.x * 0.05) * 0.12
    + sin((p.x + p.y) * 0.41 + uTime * 2.1) * 0.05 + sin(p.x * 0.67 - p.y * 0.52 + uTime * 2.6) * 0.035;
}
float wLevel(float raw, float shore, vec2 p) {
  float u = raw * uAmp * (0.35 + 0.65 * smoothstep(0.5, 4.5, shore)) * (1.0 - 0.7 * smoothstep(${FADE0.toFixed(1)}, ${FADE1.toFixed(1)}, length(p))) / STEP;
  float f = fract(u);
  return LEVEL0 + STEP * (floor(u) + smoothstep(0.5 - RAMP, 0.5 + RAMP, f));
}
float vSize;
vec3 wColor(vec2 c, float s, float lv, float raw) {
  // colours as lit at noon divide by ~1.4 (sky + sun light on a top face)
  vec3 shallow = vec3(0.34, 0.68, 0.64);
  vec3 mid = vec3(0.12, 0.47, 0.60);
  vec3 deep = vec3(0.05, 0.27, 0.52);
  vec3 col = s < 1.6 ? mix(shallow, mid, s / 1.6) : mix(mid, deep, clamp((s - 1.6) / 7.0, 0.0, 1.0));
  // region tint: take its hue, keep the palette's brightness
  vec3 tint = uMix.rgb * (dot(col, vec3(0.3, 0.59, 0.11)) / max(dot(uMix.rgb, vec3(0.3, 0.59, 0.11)), 0.01));
  col = mix(col, tint, uMix.a) * uTint;
  // mosaic: every block a little lighter or darker, some a touch greener; crests lighter than troughs
  float h = vxH2(floor(c * 4.0) + 0.5);
  float h2 = vxH2(floor(c * 4.0) + 17.3);
  col *= (1.0 + 0.08 * (lv - LEVEL0) / STEP) * (0.92 + 0.16 * h);
  col = mix(col, col * vec3(0.9, 1.07, 1.02), step(0.72, h2));
  // foam: white blocks on the highest crests out at sea and surf pulsing along the shore
  float crest = smoothstep(0.7, 0.85, raw / 0.365) * step(0.86, h) * smoothstep(1.5, 4.0, s) * step(vSize, 1.5);
  // surf: a broken white line on the blocks touching the beach, and foam bands washing in
  float edge = (1.0 - step(0.3, s)) * step(0.3, h);
  float band = smoothstep(0.55, 0.9, sin(uTime * 1.2 + s * 4.5 + h * 1.2)) * (1.0 - smoothstep(0.3, 1.3, s)) * step(0.25, fract(h * 7.0));
  float foam = max(crest * 0.75, max(edge * 0.8, band * 0.7));
  return mix(col, vec3(0.92, 0.97, 1.0) * uTint, foam);
}
void main() {
  vec2 own = aCol.xy * 0.125;
  vec2 nb = aCol.zw * 0.125;
  float kind = mod(aVtx.z, 8.0);
  float shO = floor(aVtx.z / 8.0) * 0.25;
  vSize = floor(aVtx.w / 4096.0);
  float shN = (aVtx.w - vSize * 4096.0) * 0.25;
  float rO = wRaw(own);
  float hO = wLevel(rO, shO, own);
  float y = hO;
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 col;
  vSide = 0.0;
  if (kind < 0.5) {
    col = wColor(own, shO, hO, rO);
  } else if (kind > 6.5) {
    y = uFar;
    col = wColor(own, 60.0, uFar, 0.0);
  } else {
    float rN = 0.0;
    float hN = uFar;
    if (kind < 4.5) { rN = wRaw(nb); hN = wLevel(rN, shN, nb); }
    float up = (kind < 1.5 || (kind > 4.5 && kind < 5.5)) ? 1.0 : 0.0;
    y = up > 0.5 ? max(hO, hN) : min(hO, hN);
    vec2 d = normalize(nb - own);
    float s = hO >= hN ? 1.0 : -1.0;
    n = vec3(d.x * s, 0.0, d.y * s);
    col = s > 0.0 ? wColor(own, shO, hO, rO) : (kind > 4.5 ? wColor(nb, 60.0, uFar, 0.0) : wColor(nb, shN, hN, rN));
    col *= 0.82;
    vSide = 1.0;
  }
  vec3 pos = vec3(aVtx.x * 0.125, y, aVtx.y * 0.125);
  vCol = col;
  vN = n;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
  const WATER_FS = `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vW;
varying float vSide;
#include <fog_pars_fragment>
${VC.Voxel.GLSL_COMMON}
void main() {
  vec3 n = normalize(vN);
  vec2 tc = (vSide > 0.5 ? vec2(abs(n.x) > 0.5 ? vW.z : vW.x, vW.y) : vW.xz) * 32.0;
  vec2 ti = floor(tc);
#ifdef VX_DERIV
  vec2 fw2 = fwidth(tc);
  float fw = max(max(fw2.x, fw2.y), 0.001);
#else
  float fw = 0.8;
#endif
  float kT = (1.0 - smoothstep(0.66, 1.4, fw)) * uVxDetail;
  float kL = (1.0 - smoothstep(1.6, 3.2, fw)) * uVxDetail;
  float t1 = vxH2(ti + floor(vW.y * 8.0 + 0.5) * 17.0);
  // ripple rows drifting across each block and a few twinkling glints
  float rip = vxSeam(tc.y + floor(sin(tc.x * 0.21 + uVxTime * 1.3) * 1.5) + floor(uVxTime * 2.0), 9.0, fw) * (1.0 - vSide);
  float gl = vxH2(ti * 0.73 + floor(uVxTime * 1.5 + t1 * 4.0));
  float glint = gl > 0.994 ? (1.0 - vSide) : 0.0;
  vec3 col = vCol * (1.0 + (t1 - 0.5) * 0.08 * kT + rip * 0.07 * kL);
  float sh = vxCloudShadow(vW);
  float dif = max(dot(n, uSunDir), 0.0);
  vec3 amb = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5);
  // a touch brighter by night so the sea still reads as water under the moon
  vec3 lit = col * (amb * (1.0 - 0.12 * sh) + uSunCol * dif * (1.0 - 0.8 * sh)) * (1.0 + 0.45 * uVxNight);
  vec3 V = normalize(cameraPosition - vW);
  vec3 H = normalize(V + uSunDir);
  float sp = pow(max(dot(n, H), 0.0), 90.0) * (1.0 - vSide);
  // sun glitter by day; by night the moon path glitters silver-blue
  vec3 gc = mix(uSunCol * 0.3, vec3(0.55, 0.65, 0.8), uVxNight);
  lit += uSunCol * sp * 0.4 * (1.0 - sh) + gc * glint * kT * (1.0 - sh);
  gl_FragColor = vec4(lit, 1.0);
  #include <fog_fragment>
}
`;

  function waterMaterial() {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uAmp: { value: AMP }, uFar: { value: LEVEL0 },
      uTint: { value: new THREE.Color(1, 1, 1) }, uMix: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
      uSkyCol: { value: new THREE.Color() }, uGroundCol: { value: new THREE.Color() },
    }]);
    Object.assign(uniforms, VU);
    const m = new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VS, fragmentShader: WATER_FS, fog: true, side: THREE.DoubleSide });
    m.extensions.derivatives = true;
    return m;
  }

  // ------------------------------------------------------------------ water field
  // Layouts per graphics level: rings finest first, [x0, z0, x1, z1] (world units), each nested in
  // the next and aligned to that ring's cell size.
  const LAYOUTS = {
    island: {
      high: [{ rect: [-20, 4, 20, 22], cell: 0.25 }, { rect: [-30, -30, 30, 24], cell: 0.5 }, { rect: [-48, -56, 48, 40], cell: 2 }, { rect: [-72, -88, 72, 56], cell: 4 }],
      medium: [{ rect: [-14, 6, 14, 20], cell: 0.25 }, { rect: [-26, -26, 26, 22], cell: 0.5 }, { rect: [-48, -56, 48, 40], cell: 2 }, { rect: [-72, -88, 72, 56], cell: 4 }],
      low: [{ rect: [-24, -24, 24, 22], cell: 0.5 }, { rect: [-48, -56, 48, 40], cell: 2 }, { rect: [-72, -88, 72, 56], cell: 4 }],
    },
    battle: {
      high: [{ rect: [-12, -10, 12, 10], cell: 0.25 }, { rect: [-26, -30, 26, 20], cell: 0.5 }, { rect: [-48, -60, 48, 40], cell: 2 }, { rect: [-72, -92, 72, 56], cell: 4 }],
      medium: [{ rect: [-10, -8, 10, 8], cell: 0.25 }, { rect: [-24, -28, 24, 18], cell: 0.5 }, { rect: [-48, -60, 48, 40], cell: 2 }, { rect: [-72, -92, 72, 56], cell: 4 }],
      low: [{ rect: [-20, -22, 20, 16], cell: 0.5 }, { rect: [-48, -60, 48, 40], cell: 2 }, { rect: [-72, -92, 72, 56], cell: 4 }],
    },
  };
  // every ring must sit on the next ring's grid
  for (const k in LAYOUTS) for (const q in LAYOUTS[k]) LAYOUTS[k][q].forEach((r, i, a) => {
    const o = a[i + 1];
    if (!o) return;
    const ok = [0, 1, 2, 3].every(j => Math.abs(((r.rect[j] - o.rect[j & 1]) / o.cell) % 1) < 1e-9) && r.rect[0] >= o.rect[0] && r.rect[1] >= o.rect[1] && r.rect[2] <= o.rect[2] && r.rect[3] <= o.rect[3];
    if (!ok) console.warn('sea: ring not aligned', k, q, i);
  });
  const FAR_R = 300;
  const MAXV = 65532;

  /**
   * Builds the static column geometry for a layout. land: setShallow info or null (open sea).
   * Returns { group, cols, verts, tris }.
   */
  function buildField(rings, land, mat) {
    const outer = rings[rings.length - 1].rect;
    const gx0 = outer[0], gz0 = outer[1];
    const gnx = Math.round((outer[2] - outer[0]) / G), gnz = Math.round((outer[3] - outer[1]) / G);
    const N = gnx * gnz;
    // land mask and distance to land (world units) per fine cell
    const landF = new Uint8Array(N), shoreF = new Float32Array(N).fill(FAR_SHORE);
    if (land) {
      for (let i = 0; i < gnx; i++) for (let k = 0; k < gnz; k++) {
        const x = gx0 + (i + 0.5) * G, z = gz0 + (k + 0.5) * G;
        const fi = (x - land.x0) / land.cell, fk = (z - land.z0) / land.cell;
        const li = Math.max(0, Math.min(land.nx - 1, Math.floor(fi))), lk = Math.max(0, Math.min(land.nz - 1, Math.floor(fk)));
        const out = Math.hypot(Math.max(0, -fi, fi - land.nx), Math.max(0, -fk, fk - land.nz)) * land.cell;
        const j = li * land.nz + lk;
        const isLand = !out && land.land[j];
        landF[i * gnz + k] = isLand ? 1 : 0;
        shoreF[i * gnz + k] = Math.min(FAR_SHORE, isLand ? 0 : land.dL[j] * land.cell + out);
      }
    }
    // columns: finer rings claim their cells first
    const owner = new Int32Array(N).fill(-1);
    const cols = [];
    rings.forEach((ring, ri) => {
      const [x0, z0, x1, z1] = ring.rect, s = ring.cell, n = Math.round(s / G);
      const ni = Math.round((x1 - x0) / s), nk = Math.round((z1 - z0) / s);
      for (let a = 0; a < ni; a++) for (let b = 0; b < nk; b++) {
        const i0 = Math.round((x0 + a * s - gx0) / G), k0 = Math.round((z0 + b * s - gz0) / G);
        if (owner[i0 * gnz + k0] !== -1) continue;
        let water = 0, shore = FAR_SHORE;
        for (let p = 0; p < n; p++) for (let q = 0; q < n; q++) {
          const j = (i0 + p) * gnz + k0 + q;
          if (!landF[j]) { water++; if (shoreF[j] < shore) shore = shoreF[j]; }
        }
        const id = water ? cols.length : -2;
        if (water) cols.push({ i0, k0, n, s, x: gx0 + i0 * G, z: gz0 + k0 * G, shore, ring: ri });
        for (let p = 0; p < n; p++) for (let q = 0; q < n; q++) owner[(i0 + p) * gnz + k0 + q] = id;
      }
    });
    // Chunks are areas the camera tends to see or miss as a whole (frustum culling): the fine
    // ring in two halves, the middle ring as back / left / right / centre, the far ring in one.
    const last = rings.length - 1;
    const zone = c => {
      const cx = c.x + c.s / 2, cz = c.z + c.s / 2;
      if ((c.ring === last && last > 0) || rings[c.ring].cell >= 2) return 0;
      if (rings[c.ring].cell <= G) return cx < 0 ? 1 : 2;
      if (cz < -18) return 3;
      return cx < -16 ? 4 : cx >= 16 ? 5 : 6;
    };
    cols.forEach(c => { c.zone = zone(c); });
    cols.sort((a, b) => a.zone - b.zone || a.x - b.x || a.z - b.z);
    // owner ids follow the sorted order
    owner.fill(-1);
    for (let id = 0; id < cols.length; id++) {
      const c = cols[id];
      for (let p = 0; p < c.n; p++) for (let q = 0; q < c.n; q++) owner[(c.i0 + p) * gnz + c.k0 + q] = id;
    }
    for (let i = 0; i < N; i++) if (owner[i] === -1) owner[i] = -2; // fully dry blocks

    const FAR = -3;
    const nbAt = (i, k) => (i < 0 || k < 0 || i >= gnx || k >= gnz) ? FAR : owner[i * gnz + k];
    const q8 = v => Math.round(v * 8);
    const sq = v => Math.min(4000, Math.round(v * 4));
    // emit quads into chunk buffers
    const chunks = [];
    let cur = null;
    const newChunk = () => {
      cur = { col: [], vtx: [], idx: [], nv: 0, bx0: 1e9, bz0: 1e9, bx1: -1e9, bz1: -1e9 };
      chunks.push(cur);
    };
    newChunk();
    let szc = 0; // column size code of the column being emitted: 0 = 0.25, 1 = 0.5, 2 = 1, 3 = 2+
    const vert = (x, z, cx, cz, nx, nz, kind, sh, shN) => {
      cur.col.push(q8(cx), q8(cz), q8(nx), q8(nz));
      cur.vtx.push(q8(x), q8(z), kind + 8 * sq(sh), sq(shN) + 4096 * szc);
      if (x < cur.bx0) cur.bx0 = x; if (x > cur.bx1) cur.bx1 = x;
      if (z < cur.bz0) cur.bz0 = z; if (z > cur.bz1) cur.bz1 = z;
      return cur.nv++;
    };
    const quad = (a, b, c, d) => { cur.idx.push(a, b, c, a, c, d); };
    let tris = 0;
    for (let id = 0; id < cols.length; id++) {
      const c = cols[id];
      if (cur.nv > MAXV - 200 || (id > 0 && cols[id - 1].zone !== c.zone && cur.nv)) newChunk();
      const cx = c.x + c.s / 2, cz = c.z + c.s / 2;
      szc = c.s <= 0.25 ? 0 : c.s <= 0.5 ? 1 : c.s <= 1 ? 2 : 3;
      // top
      quad(vert(c.x, c.z + c.s, cx, cz, cx, cz, 0, c.shore, c.shore), vert(c.x + c.s, c.z + c.s, cx, cz, cx, cz, 0, c.shore, c.shore),
        vert(c.x + c.s, c.z, cx, cz, cx, cz, 0, c.shore, c.shore), vert(c.x, c.z, cx, cz, cx, cz, 0, c.shore, c.shore));
      tris += 2;
      // walls, side by side in fine-cell steps, merged per neighbour
      for (let side = 0; side < 4; side++) {
        const dx = side === 0 ? 1 : side === 1 ? -1 : 0, dz = side === 2 ? 1 : side === 3 ? -1 : 0;
        let run = null;
        const flush = (endT) => {
          if (!run) return;
          const nbId = run.nb;
          let emit = false, far = false, nbc = null;
          if (nbId === FAR) { emit = true; far = true; }
          else if (nbId >= 0) {
            nbc = cols[nbId];
            if (nbc.s === c.s) emit = dx > 0 || dz > 0;
            else emit = nbc.s > c.s;
          }
          if (emit) {
            // wall line on the column edge from t0 to t1 (fine cells along the side)
            let ax, az, bx, bz;
            if (dx) { ax = bx = dx > 0 ? c.x + c.s : c.x; az = c.z + run.t0 * G; bz = c.z + endT * G; }
            else { az = bz = dz > 0 ? c.z + c.s : c.z; ax = c.x + run.t0 * G; bx = c.x + endT * G; }
            const ncx = far ? cx + dx * c.s : nbc.x + nbc.s / 2, ncz = far ? cz + dz * c.s : nbc.z + nbc.s / 2;
            const shN = far ? FAR_SHORE : nbc.shore;
            const ku = far ? 5 : 1, kl = far ? 6 : 2;
            quad(vert(ax, az, cx, cz, ncx, ncz, kl, c.shore, shN), vert(ax, az, cx, cz, ncx, ncz, ku, c.shore, shN),
              vert(bx, bz, cx, cz, ncx, ncz, ku, c.shore, shN), vert(bx, bz, cx, cz, ncx, ncz, kl, c.shore, shN));
            tris += 2;
          }
          run = null;
        };
        for (let t = 0; t < c.n; t++) {
          const i = dx ? (dx > 0 ? c.i0 + c.n : c.i0 - 1) : c.i0 + t;
          const k = dz ? (dz > 0 ? c.k0 + c.n : c.k0 - 1) : c.k0 + t;
          const nb = nbAt(i, k);
          if (run && run.nb === nb) continue;
          flush(t);
          run = { nb, t0: t };
        }
        flush(c.n);
      }
    }
    const group = new THREE.Group();
    let verts = 0;
    for (const ch of chunks) {
      if (!ch.nv) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('aCol', new THREE.BufferAttribute(new Int16Array(ch.col), 4));
      g.setAttribute('aVtx', new THREE.BufferAttribute(new Int16Array(ch.vtx), 4));
      g.setIndex(new THREE.BufferAttribute(ch.nv > 65535 ? new Uint32Array(ch.idx) : new Uint16Array(ch.idx), 1));
      const cxm = (ch.bx0 + ch.bx1) / 2, czm = (ch.bz0 + ch.bz1) / 2;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cxm, 0, czm), Math.hypot(ch.bx1 - ch.bx0, ch.bz1 - ch.bz0, 3) / 2 + 1.2);
      const m = new THREE.Mesh(g, mat);
      m.matrixAutoUpdate = false;
      group.add(m);
      verts += ch.nv;
    }
    // far sea: a flat ring from the field's edge to the horizon
    {
      const [x0, z0, x1, z1] = outer, R = FAR_R;
      const pts = [[-R, -R], [R, -R], [R, R], [-R, R], [x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      const col = [], vtx = [], idx = [];
      for (const [x, z] of pts) { col.push(q8(x), q8(z), q8(x), q8(z)); vtx.push(q8(x), q8(z), 7 + 8 * sq(FAR_SHORE), sq(FAR_SHORE) + 4096 * 3); }
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; idx.push(i, j, 4 + j, i, 4 + j, 4 + i); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('aCol', new THREE.BufferAttribute(new Int16Array(col), 4));
      g.setAttribute('aVtx', new THREE.BufferAttribute(new Int16Array(vtx), 4));
      g.setIndex(idx);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.5);
      const m = new THREE.Mesh(g, mat);
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      m.userData.far = true;
      group.add(m);
      tris += 8;
    }
    const perRing = rings.map((r, ri) => cols.filter(c => c.ring === ri).length);
    return { group, cols: cols.length, perRing, verts, tris, chunks: group.children.length };
  }

  Scene.buildSea = function () {
    this.waterMat = waterMaterial();
    this.fields = {};
    // Scene.shallow: the island's water (stage.js hides it during battles)
    this.shallow = new THREE.Group();
    this.shallow.name = 'islandWater';
    this.scene.add(this.shallow);
    this.battleWater = new THREE.Group();
    this.battleWater.name = 'battleWater';
    this.battleWater.visible = false;
    this.scene.add(this.battleWater);
    this.on('quality', function () { this.rebuildWater(); this.buildClouds(); });
    this.on('battleStart', function () { this.rebuildWater(); this.battleWater.visible = true; });
    this.on('battleEnd', function () { this.battleWater.visible = false; });
  };

  /** (Re)builds the water field(s) the current mode needs at the current quality. */
  Scene.rebuildWater = function () {
    const q = (this.Q && this.Q.water) || 'medium';
    const want = [['island', this.shallow, this.landInfo]];
    if (this.mode === 'battle' || this.fields.battle) want.push(['battle', this.battleWater, null]);
    for (const [name, grp, land] of want) {
      if (name === 'island' && !land) continue;
      const key = q + ':' + (land ? land.key : '-');
      const f = this.fields[name];
      if (f && f.key === key) continue;
      if (name === 'battle' && this.mode !== 'battle') { // rebuilt lazily at the next battle
        if (f) { this.disposeField(f, grp); delete this.fields[name]; }
        continue;
      }
      if (f) this.disposeField(f, grp);
      const t0 = performance.now();
      const res = buildField(LAYOUTS[name][q], land, this.waterMat);
      res.key = key;
      res.ms = performance.now() - t0;
      grp.add(res.group);
      this.fields[name] = res;
    }
  };
  Scene.disposeField = function (f, grp) {
    grp.remove(f.group);
    f.group.children.forEach(m => m.geometry.dispose());
  };

  /** Stats for tests: columns, vertices, triangles, draw calls of the water fields. */
  Scene.waterInfo = function () {
    const out = {};
    for (const k in this.fields) { const f = this.fields[k]; out[k] = { cols: f.cols, perRing: f.perRing, verts: f.verts, tris: f.tris, meshes: f.chunks, ms: Math.round(f.ms) }; }
    return out;
  };

  /**
   * The island tells the sea where its land is. info: { x0, z0, nx, nz, cell, land: Uint8Array,
   * dL: Float32Array (distance to land in cells) }, cells indexed i * nz + k.
   */
  Scene.setShallow = function (info) {
    if (this.landInfo && this.landInfo.land === info.land && this.landInfo.dL === info.dL) return;
    this.landInfo = Object.assign({ key: 'land' + (++this._landSeq || (this._landSeq = 1)) }, info);
    this.rebuildWater();
  };

  Scene.updateSea = function (t) {
    const u = this.waterMat.uniforms;
    u.uTime.value = t;
    u.uAmp.value = AMP * (this.stormy ? 2.2 : 1);
    u.uFar.value = LEVEL0;
    this.battleWater.visible = this.mode === 'battle';
  };

  // ------------------------------------------------------------------ sky dome, sun, moon, stars
  const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;
  const SKY_FS = `
uniform vec3 uTop;
uniform vec3 uHor;
uniform vec3 uBot;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uMoonDir;
uniform float uSunK;
uniform float uMoonK;
uniform float uStars;
uniform float uTime;
uniform float uFlash;
varying vec3 vDir;
float sH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 onDisc(vec3 d, vec3 c, float size) {
  vec3 sx = normalize(cross(vec3(0.0, 1.0, 0.0), c));
  vec3 sy = cross(c, sx);
  return vec2(dot(d, sx), dot(d, sy)) / size;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHor, uTop, pow(smoothstep(0.0, 0.65, h), 0.8)) : mix(uHor, uBot, smoothstep(0.0, 0.2, -h));
  // blocky sun with a soft glow
  float cs = dot(d, uSunDir);
  vec2 q = onDisc(d, uSunDir, 0.05);
  float disc = (cs > 0.0 && max(abs(q.x), abs(q.y)) < 1.0) ? 1.0 : 0.0;
  col += uSunCol * (pow(max(cs, 0.0), 20.0) * 0.35 + disc * (0.9 + 0.1 * step(0.5, max(abs(q.x), abs(q.y))))) * uSunK;
  // pixel moon with craters
  float cm = dot(d, uMoonDir);
  vec2 m = onDisc(d, uMoonDir, 0.04);
  if (cm > 0.0 && max(abs(m.x), abs(m.y)) < 1.0) {
    float cr = sH(floor(m * 4.0) + 7.0);
    col = mix(col, vec3(0.86, 0.9, 1.0) * (cr > 0.75 ? 0.78 : 1.0), uMoonK);
  }
  col += vec3(0.5, 0.6, 0.8) * pow(max(cm, 0.0), 30.0) * 0.25 * uMoonK;
  // stars
  if (uStars > 0.01 && h > 0.02) {
    vec2 sp = vec2(atan(d.z, d.x) * 160.0, asin(h) * 160.0);
    vec2 cell = floor(sp);
    float s = sH(cell);
    vec2 f = fract(sp) - 0.5;
    float star = (s > 0.988 && max(abs(f.x), abs(f.y)) < 0.24) ? (0.55 + 0.45 * sin(uTime * 2.3 + s * 80.0)) : 0.0;
    col += vec3(star) * uStars * smoothstep(0.02, 0.2, h);
  }
  gl_FragColor = vec4(mix(col, vec3(1.0), uFlash), 1.0);
}
`;

  Scene.buildSky = function () {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.95, 0.8) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunK: { value: 1 }, uMoonK: { value: 0 }, uStars: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 },
      },
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    dome.scale.setScalar(250);
    dome.frustumCulled = false;
    dome.renderOrder = 1000; // after the opaque world: only the uncovered pixels pay for it
    dome.onBeforeRender = (r, sc, cam) => { dome.position.copy(cam.position); dome.updateMatrixWorld(); };
    this.scene.add(dome);
    this.sky = dome;
    this.skyMat = mat;
    // distant islands on the horizon
    this.decor = [];
    const spots = [[-38, -48], [42, -55], [-55, -10], [60, -20], [25, -80]];
    spots.forEach(([x, z], i) => {
      const m = new THREE.Mesh(cachedGeo('isle' + i, () => M.smallIsland(i + 10)), VC.Voxel.material());
      m.position.set(x, -0.6, z);
      m.scale.setScalar(1.6);
      this.scene.add(m);
      this.decor.push(m);
    });
    this.cloudGroup = new THREE.Group();
    this.scene.add(this.cloudGroup);
  };

  // ------------------------------------------------------------------ clouds
  // Two layers drift along +x and wrap around:
  //   - near clouds float low over the back of the island, in view of the fixed island camera
  //     (the camera looks down, so the sky itself is never on screen); hidden in battles;
  //   - a high layer passes over the camera out of view and only shows as soft shadows sliding
  //     over the island and the sea (about one every 50 units, so one is often in view).
  // Every cloud is one merged mesh; the vertex shader moves and gently reshapes the puffs, so the
  // CPU only updates a time uniform and the four shadow slots.
  const CLOUD_H = 30;       // height of the shadow layer (shadow lookups project onto it)
  const CLOUD_SPAN = 120;   // clouds wrap around x in [-SPAN, SPAN]
  const cloudTime = { value: 0 };
  let cloudMat = null;
  function cloudMaterial() {
    if (cloudMat) return cloudMat;
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a3440 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uCloudT = cloudTime;
      sh.vertexShader = 'attribute vec4 cloudA;\nattribute vec3 cloudP;\nuniform float uCloudT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float cxw = mod(cloudA.x + uCloudT * cloudA.y + ${CLOUD_SPAN.toFixed(1)}, ${(CLOUD_SPAN * 2).toFixed(1)}) - ${CLOUD_SPAN.toFixed(1)};
  float br = 1.0 + 0.07 * sin(uCloudT * 0.45 + cloudA.z);
  transformed = cloudP + (transformed - cloudP) * vec3(br, 1.0 / br, br);
  transformed.y += 0.12 * sin(uCloudT * 0.3 + cloudA.z * 1.7);
  transformed.x += cxw - cloudA.x;`);
    };
    cloudMat = VC.Voxel.texturize(m, 'cloud');
    return cloudMat;
  }
  const CLOUD_COLS = ['#ffffff', '#f7f9fc', '#eef3f8', '#e2e9f1', '#d3dce8', '#c4cfde'];
  /**
   * One cloud: a few puffs (voxel ellipsoids, radii scaled by k) with flat-ish bottoms, white on
   * top and blue-grey underneath, with a few lighter and darker blocks mixed in.
   */
  function cloudPuffs(seed, k) {
    const rnd = VC.util.rng(seed * 7919 + 13);
    const puffs = [];
    const n = 3 + Math.floor(rnd() * 3);
    const len = (6 + rnd() * 6) * k;
    for (let i = 0; i < n; i++) {
      const v = new VC.Voxel.Vox();
      const mid = i === Math.floor(n / 2);
      const rx = (2.2 + rnd() * 2.2) * k, ry = (1.4 + rnd() * 1.2 + (mid ? 0.5 : 0)) * k, rz = (1.8 + rnd() * 1.6) * k;
      const px = (i / Math.max(1, n - 1) - 0.5) * len, pz = (rnd() - 0.5) * 3 * k, py = (rnd() * 0.8 + (mid ? 1 : 0)) * k;
      v.ball(0, 0, 0, rx, ry, rz, (x, y, z) => {
        const h = Math.abs(x * 7 + z * 13 + y * 3) % 7;
        const c = Math.round((ry - y) / (2 * ry) * 4.5 + (h === 0 ? 1 : h === 1 ? -1 : 0));
        return CLOUD_COLS[Math.max(0, Math.min(5, c))];
      }, (x, y) => y >= -ry * 0.55);
      puffs.push({ v, px, py, pz });
    }
    return puffs;
  }

  Scene.buildClouds = function () {
    const grp = this.cloudGroup;
    if (!grp) return;
    while (grp.children.length) { const c = grp.children.pop(); c.geometry.dispose(); }
    const nNear = (this.Q && this.Q.clouds) || 3;
    const nHigh = this.Q && !this.Q.shadows ? 0 : 5;
    const rnd = VC.util.rng(4242);
    const items = [];
    this.cloudList = [];
    const SC = 0.25;   // world units per cloud voxel (one terrain voxel)
    for (let i = 0; i < nNear + nHigh; i++) {
      const high = i >= nNear;
      const j = high ? i - nNear : i, n = high ? nHigh : nNear;
      const x0 = -CLOUD_SPAN + (j + 0.2 + rnd() * 0.6) * (CLOUD_SPAN * 2 / n);
      const y = high ? CLOUD_H + rnd() * 2 : 6.6 + rnd() * 1.6;
      const z = high ? -6 + ((j * 0.37 + rnd() * 0.3) % 1) * 36 : -10.5 + rnd() * 5;
      const speed = high ? 0.45 + rnd() * 0.35 : 0.32 + rnd() * 0.2;
      const phase = rnd() * 6.28;
      const k = high ? 2.8 : 1.0 + rnd() * 0.35; // cloud size (puff radii in half-unit voxels)
      let ext = 0, extZ = 0;
      for (const p of cloudPuffs(i + 1, 2 * k)) {
        ext = Math.max(ext, Math.abs(p.px * SC) + 4.4 * k * SC * 1.6);
        extZ = Math.max(extZ, Math.abs(p.pz * SC) + 3.4 * k * SC * 1.6);
        if (high) continue; // shadow only
        const geo = VC.Voxel.mesh(p.v, { scale: SC, center: [0, 0, 0], noise: 0.03, texels: 0 });
        const cnt = geo.attributes.position.count;
        const cx = x0 + p.px * SC, cy = y + p.py * SC, cz = z + p.pz * SC;
        const ca = new Float32Array(cnt * 4), cp = new Float32Array(cnt * 3);
        for (let q = 0; q < cnt; q++) { ca[q * 4] = x0; ca[q * 4 + 1] = speed; ca[q * 4 + 2] = phase + p.px * 0.3; cp[q * 3] = cx; cp[q * 3 + 1] = cy; cp[q * 3 + 2] = cz; }
        geo.setAttribute('cloudA', new THREE.BufferAttribute(ca, 4));
        geo.setAttribute('cloudP', new THREE.BufferAttribute(cp, 3));
        items.push({ geo, matrix: new THREE.Matrix4().makeTranslation(cx, cy, cz) });
      }
      this.cloudList.push({ x0, y, z, speed, high, rx: ext * 0.8, rz: extZ * 0.8 });
    }
    if (items.length) {
      const geo = this.mergeGeos(items);
      const mesh = new THREE.Mesh(geo, cloudMaterial());
      mesh.frustumCulled = false;
      mesh.name = 'clouds';
      grp.add(mesh);
    }
    items.forEach(it => it.geo.dispose());
  };

  /** Cloud x now (same wrap as the cloud vertex shader). */
  function cloudX(c, t) {
    const S2 = CLOUD_SPAN * 2;
    return ((c.x0 + t * c.speed + CLOUD_SPAN) % S2 + S2) % S2 - CLOUD_SPAN;
  }

  const shadowList = [];
  Scene.updateSky = function (dt, t) {
    cloudTime.value = t;
    const island = this.mode === 'island';
    if (this.cloudGroup) this.cloudGroup.visible = island;
    // The four clouds whose shadows fall nearest to the view centre cast them. Shadow lookups
    // project onto the CLOUD_H layer, so a low cloud's centre is moved along the sun ray to it.
    const U = VU.uVxCloud.value, K = VU.uVxCloudK.value;
    const on = this.Q ? this.Q.shadows : true;
    const S = VU.uVxSun.value;
    shadowList.length = 0;
    for (const c of this.cloudList || []) {
      if (!c.high && !island) continue;
      const x = cloudX(c, t) + S.x * (CLOUD_H - c.y), z = c.z + S.y * (CLOUD_H - c.y);
      // distance of the shadow from the middle of the view (sunlight there comes from S * CLOUD_H)
      shadowList.push({ c, x, z, d: Math.hypot(x - S.x * CLOUD_H, z - 2 - S.y * CLOUD_H) - c.rx });
    }
    shadowList.sort((a, b) => a.d - b.d);
    const k = on ? this.cloudShadowK || 0 : 0;
    for (let i = 0; i < 4; i++) {
      const e = shadowList[i];
      if (!e) { K.setComponent(i, 0); continue; }
      U[i].set(e.x, e.z, 1 / Math.max(1, e.c.rx), 1 / Math.max(1, e.c.rz));
      K.setComponent(i, k);
    }
  };

  // ------------------------------------------------------------------ day / night
  // [dayT, zenith, horizon (also fog), sea tint, ambient light, sun light]
  const SKY = [
    [0.0, 0x050d1f, 0x0b1a33, 0x14426e, 0.3, 0.24],
    [0.08, 0x3a6fb0, 0xf7a26b, 0x1d6690, 0.6, 0.55],
    [0.18, 0x3f9fe6, 0x8fd3f5, 0x1a78a8, 0.95, 0.85],
    [0.5, 0x3a96e0, 0x9fd8f5, 0x1a78a8, 1.0, 0.9],
    [0.62, 0x4a5fa8, 0xf28c5a, 0x1b6a92, 0.65, 0.6],
    [0.72, 0x050d1f, 0x0b1a33, 0x123c66, 0.32, 0.26],
    [1.0, 0x050d1f, 0x0b1a33, 0x14426e, 0.3, 0.24],
  ];
  const DAY_SEA = new THREE.Color(0x1a78a8);
  const cA = new THREE.Color(), cB = new THREE.Color(), cT = new THREE.Color();
  const lerpHex = (out, a, b, k) => out.set(a).lerp(cT.set(b), k);
  const STORM = new THREE.Color(0x3a4656), STORM_SEA = new THREE.Color(0x24414f);
  const sunV = new THREE.Vector3(), moonV = new THREE.Vector3();
  /** Direction toward the light at day fraction k (0 sunrise .. 1 sunset), front-left and high at noon. */
  function arcDir(out, k, el0, el1) {
    const phi = 2.245 + (k - 0.5) * 1.6; // around the default (-20, 40, 25)
    const el = el0 + (el1 - el0) * Math.sin(Math.PI * Math.max(0, Math.min(1, k)));
    return out.set(Math.cos(el) * Math.cos(phi), Math.sin(el), Math.cos(el) * Math.sin(phi));
  }

  Scene.applySky = function () {
    const d = ((this.dayT % 1) + 1) % 1;
    let i = 0;
    while (i < SKY.length - 2 && SKY[i + 1][0] <= d) i++;
    const a = SKY[i], b = SKY[i + 1];
    const k = (d - a[0]) / (b[0] - a[0]);
    const top = lerpHex(new THREE.Color(), a[1], b[1], k);
    const sky = lerpHex(new THREE.Color(), a[2], b[2], k);
    const sea = lerpHex(cA, a[3], b[3], k);
    const light = a[4] + (b[4] - a[4]) * k;
    let sunI = (a[5] + (b[5] - a[5]) * k) * (this.stormy ? 0.6 : 1);
    if (this.stormy) { sky.lerp(STORM, 0.7); top.lerp(STORM, 0.75); sea.lerp(STORM_SEA, 0.5); }
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    this.hemi.intensity = light * 0.8;
    this.night = light < 0.4;
    // sun by day, moon by night (the directional light follows whichever is up)
    const dayK = (d - 0.05) / 0.66;
    const nightK = ((d + 1 - 0.7) % 1) / 0.42;
    arcDir(sunV, dayK, 0.32, 0.9);
    arcDir(moonV, nightK, 0.5, 0.95);
    const isDay = dayK > 0 && dayK < 1;
    const L = isDay ? sunV : moonV;
    this.sun.position.copy(L).multiplyScalar(50);
    this.sun.intensity = sunI;
    if (isDay) this.sun.color.setRGB(1, 0.95 - 0.12 * (1 - Math.sin(Math.PI * dayK)), 0.84 - 0.25 * (1 - Math.sin(Math.PI * dayK)));
    else this.sun.color.setHex(0xb8ccff);
    VU.uVxSun.value.set(L.x / Math.max(0.2, L.y), L.z / Math.max(0.2, L.y), CLOUD_H, 0);
    this.cloudShadowK = isDay ? 0.85 * Math.min(1, sunI / 0.6) * (this.stormy ? 0.5 : 1) : 0;
    // water: lighting and tint
    const u = this.waterMat.uniforms;
    u.uSunDir.value.copy(L).normalize();
    u.uSunCol.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    u.uSkyCol.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity);
    u.uGroundCol.value.copy(this.hemi.groundColor).multiplyScalar(this.hemi.intensity);
    u.uTint.value.setRGB(sea.r / DAY_SEA.r, sea.g / DAY_SEA.g, sea.b / DAY_SEA.b);
    if (this.seaTint) { cB.set(this.seaTint); u.uMix.value.set(cB.r, cB.g, cB.b, 0.5); }
    else if (this.stormy) u.uMix.value.set(STORM_SEA.r, STORM_SEA.g, STORM_SEA.b, 0.5);
    else u.uMix.value.set(0, 0, 0, 0);
    // sky dome: the visible sun and moon sit in front of the camera's usual heading
    const su = this.skyMat.uniforms;
    su.uTop.value.copy(top);
    su.uHor.value.copy(sky);
    su.uBot.value.copy(sky).lerp(cB.copy(sea).multiplyScalar(0.8), 0.5);
    su.uSunDir.value.set(-sunV.x, sunV.y, -sunV.z).normalize();
    su.uMoonDir.value.set(-moonV.x, moonV.y, -moonV.z).normalize();
    su.uSunCol.value.copy(this.sun.color);
    su.uSunK.value = isDay ? Math.min(1, sunI / 0.5) * (this.stormy ? 0.2 : 1) : 0;
    su.uMoonK.value = isDay ? 0 : 1;
    su.uStars.value = Math.max(0, Math.min(1, (0.6 - light) * 2.2)) * (this.stormy ? 0.2 : 1);
    su.uTime.value = this.t;
    su.uFlash.value = this.flash > 0 ? 1 : 0;
  };

})(window.VC);
