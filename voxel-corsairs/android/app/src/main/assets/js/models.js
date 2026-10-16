'use strict';
// Procedural voxel art: ships of every tier and faction, sea creatures, island nature, the 16
// buildings and village props. Ships, island buildings and props use 0.125 units per voxel (ships
// return their scale; island models are "part sets", see the detail kit below); creatures, the far
// jungle and the terrain use 0.25. Every voxel is tagged with a surface material (VC.Voxel.mat).
(function (VC) {
  const { Vox } = VC.Voxel;

  /** Colour scaled by k; keeps the material tag of a tagged colour (see VC.Voxel.mat). */
  function shade(hex, k) {
    const c = VC.Voxel.toInt(hex);
    const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
    const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
    const b = Math.min(255, Math.round((c & 255) * k));
    return ((r << 16) | (g << 8) | b) | (c & 0x7f000000);
  }
  /** Material-tagged colour: MT('plank', '#8a5a32'). */
  const MT = VC.Voxel.mat;

  // ------------------------------------------------------------------ ships (0.125 units per voxel)
  // Hull sizes per tier in detail voxels: length, beam, hull height, mast positions (fraction of the
  // length from the stern), mast height, stern castle length (fraction), gun-port rows, forecastle.
  const DIMS = [
    { L: 26, W: 10, H: 5, masts: [0.5], mh: 15, castle: 0, rows: 0 },
    { L: 36, W: 12, H: 6, masts: [0.55], mh: 24, castle: 0.22, rows: 0 },
    { L: 48, W: 14, H: 8, masts: [0.36, 0.66], mh: 30, castle: 0.22, rows: 1, fc: true },
    { L: 60, W: 16, H: 10, masts: [0.3, 0.55, 0.78], mh: 36, castle: 0.23, rows: 1, nest: true, fc: true },
    { L: 68, W: 20, H: 12, masts: [0.28, 0.52, 0.76], mh: 40, castle: 0.27, rows: 1, high: true, nest: true, fc: true },
    { L: 76, W: 22, H: 16, masts: [0.28, 0.52, 0.76], mh: 44, castle: 0.25, rows: 2, nest: true, fc: true },
    { L: 80, W: 22, H: 14, masts: [0.28, 0.52, 0.76], mh: 44, castle: 0.25, rows: 2, nest: true, fc: true },
    { L: 92, W: 24, H: 16, masts: [0.22, 0.42, 0.62, 0.8], mh: 48, castle: 0.24, rows: 2, nest: true, fc: true },
  ];

  const STYLES = {
    navy: { hull: '#1f3e66', trim: '#e9e3d2', sail: '#f4f1e8', flag: '#1d4f91', fg: '#f0c03a', emblem: 'crown', deck: '#c8a26a', band: '#e0b84a', figure: '#f0c03a' },
    merchant: { hull: '#9a6b3e', trim: '#d9b26a', sail: '#efe3c4', stripe: '#3f8f5a', flag: '#2f7a46', fg: '#fff' },
    smuggler: { hull: '#6b4a2e', trim: '#4a3220', sail: '#9a948a', flag: null },
    fisher: { hull: '#a0703c', trim: '#6b4a2e', sail: '#d8c9a3', flag: null, patch: '#b5a07a' },
    rust: { hull: '#7a4a2a', trim: '#c9663a', sail: '#b9a27a', flag: '#111', fg: '#c9663a', emblem: 'skull', patch: '#9a8460' },
    blue: { hull: '#24385c', trim: '#d9cfb4', sail: '#3a7bd5', flag: '#111', fg: '#3a7bd5', emblem: 'skull' },
    ghost: { hull: '#3d5c5a', trim: '#7dffc8', sail: '#bfeee0', flag: '#0d1a1a', fg: '#7dffc8', tattered: 0.22, emblem: 'skull', lamp: '#7dffc8' },
    bone: { hull: '#d9cfb4', trim: '#8a7a60', sail: '#9b9b9b', flag: '#111', fg: '#d9cfb4', tattered: 0.3 },
    fire: { hull: '#2c1a14', trim: '#ff6a2b', sail: '#c8323a', flag: '#111', fg: '#ff6a2b', emblem: 'skull', lamp: '#ff8a3a' },
    black: { hull: '#1c1c22', trim: '#b03030', sail: '#2b2b30', flag: '#7a0f12', fg: '#fff', emblem: 'skull' },
    ice: { hull: '#dfefff', trim: '#7aa7e0', sail: '#f4f8ff', flag: '#1d4f91', fg: '#f0c03a', emblem: 'crown', lamp: '#bfefff', band: '#7aa7e0' },
    brass: { hull: '#b5893a', trim: '#6b4f1f', sail: null, steam: true, gears: true },
    abyss: { hull: '#1d1a3a', trim: '#a24bff', sail: '#4b3a8a', flag: '#000', fg: '#a24bff', tattered: 0.25, emblem: 'eye', lamp: '#c58bff' },
    iron: { hull: '#4a4f57', trim: '#2e3238', sail: null, steam: true, rivets: true, flag: '#1d4f91', fg: '#f0c03a', emblem: 'crown' },
    raven: { hull: '#15151c', trim: '#f0c03a', sail: '#2a2a35', flag: '#15151c', fg: '#f0c03a', emblem: 'raven', band: '#f0c03a' },
    heart: { hull: '#15151c', trim: '#5ff3ff', sail: '#4fd9ff', flag: '#15151c', fg: '#5ff3ff', emblem: 'heart', lamp: '#5ff3ff' },
  };

  function playerStyle(skin) {
    const sk = VC.SKINS;
    const sail = sk.sail.find(x => x.id === skin.sail) || sk.sail[0];
    const flag = sk.flag.find(x => x.id === skin.flag) || sk.flag[0];
    const hull = sk.hull.find(x => x.id === skin.hull) || sk.hull[0];
    const em = { heart: 'heart', anchor: 'anchor', kraken: 'eye', sabres: 'sabres' }[skin.flag] || 'skull';
    return {
      hull: hull.color, trim: hull.trim, sail: sail.color, stripe: sail.stripe, flag: flag.color, fg: flag.fg,
      emblem: em, ghost: skin.sail === 'ghost', lamp: skin.sail === 'ghost' ? '#7dffc8' : undefined,
    };
  }

  const EMBLEMS = {
    skull: ['.XXX.', 'X.X.X', 'XXXXX', '.X.X.'],
    crown: ['X.X.X', 'XXXXX', 'XXXXX'],
    raven: ['..X..', 'XXXXX', 'X.X.X', '..X..'],
    heart: ['XX.XX', 'XXXXX', '.XXX.', '..X..'],
    anchor: ['..X..', '.XXX.', '..X..', 'X.X.X', '.XXX.'],
    eye: ['.XXX.', 'XX.XX', '.XXX.'],
    sabres: ['X...X', '.X.X.', '..X..', '.X.X.', 'X...X'],
  };

  // Cloth weights for the animated sail/flag shader (see Scene.clothMaterial): per vertex
  // [billow along +x, flag flutter amplitude, billow along +z], in world units.
  function sailWeight(y0, y1, w, amp) {
    return (x, y, z, cx, cy, cz) => {
      const ty = Math.max(0, Math.min(1, (cy - y0) / (y1 + 1 - y0)));
      const tz = (cz - 0.5) / (w + 0.5);
      return [amp * Math.sin(Math.PI * ty) * Math.max(0, 1 - tz * tz), 0, 0];
    };
  }
  /** Flag weights: the flutter grows with the distance from the pole at voxel x = poleX. */
  function flagWeight(poleX, amp) {
    return (x, y, z, cx) => [0, amp * Math.max(0, Math.abs(poleX - cx)), 0];
  }
  const mod = (a, n) => ((a % n) + n) % n;

  /**
   * opts: { tier 0..7, style key or {..palette}, skin, seed, wreck } ->
   * { vox (hull, masts, deck props), glow (lanterns, lit windows), cloth: [{vox, fn}] (fore-and-aft
   *   sails, flags), rigs: [{ pivot: [x, z], vox (yards), cloth }] (square sails of each mast, turned
   *   by `brace` radians around the pivot when meshed), rig: [[a, b], ...] rope segments (already
   *   braced), waterline, length, height, halfW, deckY, mastTops,
   *   scale (world units per voxel), cx / cz (hull centre), deck: { y, spots: [[x, z]], upper } }
   * All in voxels; the bow points to +x, the hull centre line is the voxel row z = 0.
   */
  function ship(opts) {
    const tier = Math.max(0, Math.min(7, opts.tier | 0));
    const d = DIMS[tier];
    const P = typeof opts.style === 'object' ? opts.style : (STYLES[opts.style] || STYLES.navy);
    const rnd = VC.util.rng(opts.seed || 7);
    const wreck = !!opts.wreck;
    const v = new Vox(), glow = new Vox(), cloth = [], rig = [];
    const lampC = P.lamp || '#ffd36b';
    const { L, W, H } = d;
    const hull = P.hull, trim = P.trim;
    const bottom = P.bottom || shade(hull, 0.55);
    const deckC = P.deck || '#c49a62';
    const mastC = '#6b4423', yardC = '#4f321a', metal = '#2b2b2e';
    const wl = Math.round(H * 0.4);
    const tatter = wreck ? 0.45 : (P.tattered || 0);
    const hullMat = P.steam ? 'metal' : 'plank';
    const lit = (x, y, z, c) => {
      if (wreck) { v.set(x, y, z, MT('glass', '#2a2a2a')); return; }
      v.del(x, y, z); glow.set(x, y, z, MT('glass', c || lampC));
    };
    const W_ = (c) => MT('wood', c);

    // --- hull: rows of planks, dark bottom, wales, trim at the top; deck on top
    const portRows = [];
    for (let r = 0; r < d.rows; r++) { const yp = H - 3 - r * 4; if (yp - 1 > wl) portRows.push(yp); }
    const wales = new Set();
    for (const yp of portRows) if (yp - 2 > wl) wales.add(yp - 2);
    if (!portRows.length && H - 3 > wl) wales.add(H - 3);
    const hullC = (x, y) => {
      if (y < wl) return MT(hullMat, shade(bottom, 0.92 + 0.12 * hash(x >> 3, y, 1)));
      if (y === wl) return W_(shade(bottom, 0.78));
      if (y === H - 1) return W_(trim);
      if (wales.has(y)) return W_(P.band && P.band !== trim ? shade(P.band, 0.9) : shade(hull, 0.6));
      if (P.rivets && x % 4 === 0 && y % 3 === 1) return MT('metal', shade(hull, 1.3));
      const off = (y * 5) & 7;
      const seam = ((x + off) & 7) === 0;
      const k = 0.9 + 0.16 * hash((x + off) >> 3, y, 3);
      return MT(hullMat, shade(hull, seam ? k * 0.84 : k));
    };
    const deckPlank = (x, z) => {
      const off = mod(z * 7 + 3, 11);
      const seam = mod(x + off, 11) === 0;
      return MT('plank', shade(deckC, (z & 1 ? 0.94 : 1.02) * (seam ? 0.8 : 0.97 + 0.06 * hash((x + off) / 11 | 0, z, 5))));
    };
    const outer = [], top = [];
    for (let x = 0; x < L; x++) {
      const t = x / (L - 1);
      let f = 1;
      if (t > 0.58) f = Math.max(0.05, Math.pow((1 - t) / 0.42, 0.6));
      else if (t < 0.12) f = 0.8 + 0.2 * (t / 0.12);
      const hm = (W / 2) * f;
      const ky = t > 0.76 ? Math.round(Math.pow((t - 0.76) / 0.24, 1.6) * (H - 1) * 0.85) : (t < 0.03 ? 1 : 0);
      const col = [];
      for (let y = 0; y < H; y++) {
        if (y < ky) { col.push(-1); continue; }
        const fy = y / Math.max(1, H - 1);
        const zr = Math.floor(hm * (0.32 + 0.68 * Math.sqrt(fy)) + 0.4);
        col.push(zr);
        for (let z = -zr; z <= zr; z++) v.set(x, y, z, hullC(x, y));
      }
      outer.push(col);
      top.push(col[H - 1]);
      for (let z = -col[H - 1]; z <= col[H - 1]; z++) v.set(x, H, z, deckPlank(x, z));
    }
    const topAt = x => top[Math.max(0, Math.min(L - 1, x))];
    // keel strip under the hull
    for (let x = 2; x < L - 3; x++) if (outer[x][0] >= 0) v.set(x, -1, 0, W_(shade(bottom, 0.7)));
    // protruding wales
    for (const y of wales) for (let x = 1; x < L - 1; x++) {
      const zr = outer[x][y];
      if (zr >= 2) for (const s of [1, -1]) v.set(x, y, s * (zr + 1), W_(shade(hull, 0.55)));
    }
    if (P.band) for (let x = 2; x < L - 2; x++) {
      const y = H - 2, zr = outer[x][y];
      if (zr >= 2 && !portRows.includes(y) && !portRows.includes(y + 1)) for (const s of [1, -1]) v.set(x, y, s * zr, W_(P.band));
    }

    // --- stern castle, forecastle, bulwarks
    const cx = Math.round(L * d.castle);
    const ch = d.high ? 5 : 4;
    const cTop = cx > 0 ? H + ch : H;
    const fcX = d.fc ? Math.round(L * 0.84) : L;
    const fcTop = H + 2;
    const floorAt = x => (cx > 0 && x < cx ? cTop + 1 : x >= fcX ? fcTop + 1 : H + 1); // first free layer
    const railTop = x => floorAt(x) + 1; // y of the cap rail
    const bh = tier === 0 ? 1 : 2;
    for (let x = 1; x < L - 1; x++) {
      if (cx > 0 && x < cx) continue;
      if (x >= fcX) continue;
      const zr = top[x];
      if (zr < 1) continue;
      for (const s of [1, -1]) {
        if (bh > 1) v.set(x, H + 1, s * zr, hullC(x, H + 1));
        v.set(x, H + bh, s * zr, W_(trim));
      }
    }
    if (cx > 0) {
      for (let x = 0; x < cx; x++) {
        const zr = top[x];
        for (let y = H + 1; y < cTop; y++) for (let z = -zr; z <= zr; z++) v.set(x, y, z, y === cTop - 1 ? W_(trim) : hullC(x, y));
        for (let z = -zr; z <= zr; z++) v.set(x, cTop, z, deckPlank(x, z));
        for (const s of [1, -1]) {
          if (x % 2 === 0) v.set(x, cTop + 1, s * zr, W_(shade(trim, 0.85)));
          v.set(x, cTop + 2, s * zr, W_(trim));
        }
      }
      // stern rail and the front rail of the quarterdeck (gaps for the stairs)
      const zs = Math.max(1, top[cx] - 3);
      for (let z = -top[0]; z <= top[0]; z++) { if (z % 2 === 0) v.set(0, cTop + 1, z, W_(shade(trim, 0.85))); v.set(0, cTop + 2, z, W_(trim)); }
      for (let z = -top[cx - 1]; z <= top[cx - 1]; z++) {
        if (Math.abs(z) >= zs - 1 && Math.abs(z) <= zs) continue;
        if (z % 2 === 0) v.set(cx - 1, cTop + 1, z, W_(shade(trim, 0.85)));
        v.set(cx - 1, cTop + 2, z, W_(trim));
      }
      // stairs up to the quarterdeck on both sides
      for (const s of [1, -1]) for (let k = 0; k < ch - 1; k++) {
        for (let y = H + 1; y <= cTop - 1 - k; y++) for (const z of [zs - 1, zs]) v.set(cx + k, y, s * z, W_(shade('#8a6238', k % 2 ? 0.9 : 1)));
      }
      // cabin door and windows in the front wall of the castle
      for (let y = H + 1; y <= H + 3; y++) for (let z = -1; z <= 1; z++) v.set(cx - 1, y, z, W_(z === 0 ? '#3a2614' : '#4a3020'));
      v.set(cx, H + 2, 1, MT('gold', '#e0b04a'));
      for (const s of [1, -1]) { const z = s * Math.max(2, top[cx - 1] - 3); if (Math.abs(z) > 2) { lit(cx - 1, H + 2, z); lit(cx - 1, H + 2, z - s); } }
      // side windows of the great cabin
      for (let x = 2; x < cx - 3; x += 4) for (const s of [1, -1]) {
        const zr = top[x];
        for (let y = H + 1; y <= H + 2 + (d.high ? 1 : 0); y++) { lit(x, y, s * zr); lit(x + 1, y, s * zr); }
        for (let y = H; y <= H + 3 + (d.high ? 1 : 0); y++) { v.set(x - 1, y, s * zr, W_(trim)); v.set(x + 2, y, s * zr, W_(trim)); }
      }
      // stern gallery: a carved transom with rows of lit windows, lanterns on the corners
      const z0 = top[0];
      for (let y = H - 2; y <= cTop + 1; y++) for (let z = -z0; z <= z0; z++) v.set(-1, y, z, W_(y === H - 2 || y === cTop + 1 || y === cTop - 1 ? trim : shade(hull, 0.8)));
      const rows = ch >= 5 ? [H, H + 3] : [H + 1];
      for (const wy of rows) for (let z = -z0 + 1; z + 1 <= z0 - 1; z += 3) {
        lit(-1, wy, z); lit(-1, wy, z + 1); lit(-1, wy + 1, z); lit(-1, wy + 1, z + 1);
        v.set(-2, wy - 1, z, W_(trim)); v.set(-2, wy - 1, z + 1, W_(trim));
      }
      for (let z = -z0 + 1; z <= z0 - 1; z++) v.set(-2, cTop + 1, z, W_(z % 3 ? trim : shade(trim, 0.8)));
      if (P.figure || P.band) for (let z = -2; z <= 2; z++) v.set(-2, cTop + 2, z, MT('gold', P.figure || P.band));
      for (const s of [1, -1]) {
        const lz = s * Math.max(1, z0 - 1);
        v.set(-2, cTop + 2, lz, MT('metal', metal));
        lit(-2, cTop + 3, lz); lit(-2, cTop + 4, lz);
        v.set(-2, cTop + 5, lz, MT('metal', metal));
      }
      if (tier >= 4) { v.set(-2, cTop + 3, 0, MT('metal', metal)); lit(-2, cTop + 4, 0); lit(-2, cTop + 5, 0); lit(-2, cTop + 6, 0); v.set(-2, cTop + 7, 0, MT('metal', metal)); }
      // ship's wheel on the quarterdeck
      const wx = cx - 3, wy = cTop + 4;
      v.set(wx, cTop + 1, 0, W_('#4a3020')); v.set(wx, cTop + 2, 0, W_('#4a3020'));
      for (let a = 0; a < 16; a++) {
        const an = a / 16 * Math.PI * 2;
        v.set(wx - 1, Math.round(wy + Math.sin(an) * 2), Math.round(Math.cos(an) * 2), W_('#6b4423'));
        if (a % 2 === 0) v.set(wx - 1, Math.round(wy + Math.sin(an) * 3), Math.round(Math.cos(an) * 3), W_('#8a6238'));
      }
      v.set(wx - 1, wy, 0, MT('gold', '#f0c03a'));
    } else {
      // small boats: a lantern on a post at the stern
      v.set(0, H + 1, 0, W_('#5a3a1e')); v.set(0, H + 2, 0, W_('#5a3a1e'));
      lit(0, H + 3, 0); v.set(0, H + 4, 0, MT('metal', metal));
    }
    if (d.fc) {
      for (let x = fcX; x < L; x++) {
        const zr = top[x];
        if (zr < 0) continue;
        for (let y = H + 1; y < fcTop; y++) for (let z = -zr; z <= zr; z++) v.set(x, y, z, hullC(x, y));
        for (let z = -zr; z <= zr; z++) v.set(x, fcTop, z, deckPlank(x, z));
        if (zr >= 1) for (const s of [1, -1]) { if (x % 2 === 0) v.set(x, fcTop + 1, s * zr, W_(shade(trim, 0.85))); v.set(x, fcTop + 2, s * zr, W_(trim)); }
      }
      const zr = top[fcX];
      for (let z = -zr; z <= zr; z++) { if (z % 2 === 0) v.set(fcX, fcTop + 1, z, W_(shade(trim, 0.85))); v.set(fcX, fcTop + 2, z, W_(trim)); }
      v.set(fcX, H + 1, 0, W_('#3a2614'));
      for (const s of [1, -1]) if (zr > 3) lit(fcX, H + 1, s * (zr - 2));
    }

    // --- gun ports with cannon muzzles
    const ports = [];
    for (const yp of portRows) {
      for (let x = Math.round(L * 0.2); x + 2 < L * 0.76; x += 6) {
        for (const s of [1, -1]) {
          const zr = outer[x + 1][yp];
          if (zr < 2) continue;
          for (let dx = 0; dx <= 2; dx++) for (let dy = -1; dy <= 0; dy++) v.set(x + dx, yp + dy, s * zr, MT('plain', '#16100c'));
          for (let dx = -1; dx <= 3; dx++) { v.set(x + dx, yp + 1, s * zr, W_(P.band || shade(trim, 0.9))); v.set(x + dx, yp - 2, s * zr, W_(shade(hull, 0.62))); }
          if (!wreck || rnd() < 0.5) for (let k = 1; k <= 2; k++) v.set(x + 1, yp - 1, s * (zr + k), MT('metal', k === 2 ? '#1a1a1c' : metal));
          ports.push([x + 1, yp, s]);
        }
      }
    }

    // --- bow: stem, figurehead, bowsprit, anchors
    const kyEnd = (() => { for (let y = 0; y < H; y++) if (outer[L - 1][y] >= 0) return y; return H - 1; })();
    const stemTop = (d.fc ? fcTop : H) + 3;
    for (let y = kyEnd; y <= stemTop; y++) {
      const k = (y - kyEnd) / Math.max(1, stemTop - kyEnd);
      const sx = L - 1 + Math.round(k * k * 3);
      v.set(sx, y, 0, W_(y > H ? trim : shade(hull, 0.7)));
      if (sx > L - 1) v.set(sx - 1, y, 0, W_(shade(hull, 0.7)));
    }
    const fig = P.figure || (P.band ? P.band : '#d8b060');
    for (let y = Math.max(kyEnd, H - 3); y <= H; y++) v.set(L, y, 0, MT('gold', fig));
    v.set(L + 1, H, 0, MT('gold', fig)); v.set(L + 1, H + 1, 0, MT('gold', shade(fig, 1.1)));
    v.set(L + 1, Math.max(kyEnd, H - 2), 0, MT('gold', shade(fig, 0.85)));
    const bLen = 6 + Math.round(tier * 2.2);
    const bx0 = L - 4, by0 = (d.fc ? fcTop : H) + 1;
    const tipX = L - 1 + bLen, tipY = by0 + Math.round(bLen * 0.42);
    v.line(bx0, by0, 0, tipX, tipY, 0, W_('#5a3a1e'));
    if (tier >= 2) v.line(bx0, by0 + 1, 0, Math.round(bx0 + (tipX - bx0) * 0.6), Math.round(by0 + 1 + (tipY - by0) * 0.6), 0, W_('#5a3a1e'));
    if (tier >= 2 && !wreck) lit(tipX - 2, tipY - 1, 0);
    if (tier >= 1) {
      const ax = L - Math.round(L * 0.14);
      for (const s of [1, -1]) {
        const zr = outer[ax][H - 1] + 1, z = s * zr;
        for (let y = H - 5; y <= H - 1; y++) v.set(ax, y, z, MT('metal', '#3a3a3e'));
        v.set(ax - 1, H - 1, z, MT('metal', '#3a3a3e')); v.set(ax + 1, H - 1, z, MT('metal', '#3a3a3e'));
        v.set(ax - 1, H - 5, z, MT('metal', '#3a3a3e')); v.set(ax + 1, H - 5, z, MT('metal', '#3a3a3e'));
        v.set(ax - 2, H - 4, z, MT('metal', '#3a3a3e')); v.set(ax + 2, H - 4, z, MT('metal', '#3a3a3e'));
        v.set(ax, H, z, W_('#5a3a1e')); v.set(ax, H, s * (zr + 1), W_('#5a3a1e'));
      }
    }

    // --- masts, tops, yards and sails; funnels on steam ships
    const masts = [], mastTops = [];
    const n = d.masts.length;
    // Square sails are braced: each mast's yards and sails turn by BR around the mast (done on the
    // mesh in Scene.shipMesh, so the cloth stays smooth), as on a ship sailing close to the wind.
    const BR = opts.brace !== undefined ? opts.brace : (wreck ? 0.12 : -0.6);
    const cB = Math.cos(BR), sB = Math.sin(BR);
    const rigs = [];
    /** Voxel-space point p of the rig of the mast at x = mx, turned with the braced yards. */
    const braceP = (mx, p) => { const dx = p[0] - (mx + 0.5), dz = p[2] - 0.5; return [mx + 0.5 + dx * cB + dz * sB, p[1], 0.5 - dx * sB + dz * cB]; };
    /** Cloth weights turned with the braced sail. */
    const braceW = fn => (x, y, z, cx, cy, cz) => { const a = fn(x, y, z, cx, cy, cz); return [a[0] * cB + a[2] * sB, a[1], -a[0] * sB + a[2] * cB]; };
    d.masts.forEach((m, mi) => {
      const mx = Math.round(L * m);
      const main = n === 1 || mi === Math.floor(n / 2);
      const base = floorAt(mx);
      let h = d.mh + (main && n > 1 ? 4 : 0) - (mi === 0 && n > 1 ? 6 : 0) - (mi === n - 1 && n > 2 ? 2 : 0);
      if (P.steam) {
        const fh = 12 + tier * 2;
        v.cyl(mx, base, 0, 2.4, base + fh, (x, y) => MT('metal', y > base + fh - 3 ? '#1b1b1b' : (y - base) % 6 === 5 ? shade(hull, 1.3) : shade(P.trim, 1.6)));
        mastTops.push([mx, base + fh + 1, 0]);
        masts.push({ mx, top: base + fh, h: fh, base, steam: true });
        return;
      }
      if (wreck) h = Math.round(h * (main ? 0.62 : 0.45));
      const topY = H + h;
      const thick = tier >= 2;
      const nestY = tier >= 3 ? topY - Math.round(h * 0.33) : 0;
      for (let y = base; y <= topY; y++) {
        const lower = thick && y < (nestY || topY - 8);
        const band = (y - base) % 8 === 7;
        const c = W_(band ? shade(mastC, 0.7) : y > topY - 2 ? shade(mastC, 0.85) : mastC);
        v.set(mx, y, 0, c);
        if (lower) { v.set(mx + 1, y, 0, c); v.set(mx - 1, y, 0, c); v.set(mx, y, 1, c); v.set(mx, y, -1, c); }
      }
      if (wreck) { v.set(mx + 1, topY + 1, 0, W_('#8a6238')); v.set(mx, topY + 2, 1, W_('#8a6238')); }
      // coiled ropes around the mast foot
      if (tier >= 1) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const r = Math.hypot(dx, dz);
        if (r > 1.6 && r < 2.6 && v.has(mx + dx, base - 1, dz) && !v.has(mx + dx, base, dz)) v.set(mx + dx, base, dz, MT('cloth', (dx + dz) & 1 ? '#c8b48a' : '#b09a70'));
      }
      // fighting top / crow's nest
      if (nestY && !wreck) {
        const nr = main || d.nest ? 3 : 2;
        for (let dx = -nr; dx <= nr; dx++) for (let dz = -nr; dz <= nr; dz++) {
          const r = Math.hypot(dx, dz);
          if (r > nr + 0.4) continue;
          if (dx || dz) v.set(mx + dx, nestY, dz, MT('plank', '#7a5530'));
          if (r > nr - 0.8 && (main && d.nest)) { v.set(mx + dx, nestY + 1, dz, MT('plank', '#8a6238')); v.set(mx + dx, nestY + 2, dz, W_('#5a3a1e')); }
        }
        if (main && d.nest) lit(mx + 1, nestY + 1, 2, lampC);
      }
      masts.push({ mx, top: topY, h, base, main, nestY, thick });
      mastTops.push([mx, topY, 0]);
      if (!P.sail) return;
      const R = { pivot: [mx + 0.5, 0.5], vox: new Vox(), cloth: [] };
      rigs.push(R);
      // square sails, stacked between the yards
      const nSails = wreck ? 1 : tier === 0 ? 1 : tier <= 2 ? 2 : (mi === 0 && n > 2 ? 2 : 3);
      const y0 = base + 5;
      const secs = [];
      if (nestY && nSails > 1) {
        secs.push([y0, nestY - 2]);
        const a = nestY + 3, b = topY - 3, k = nSails - 1, len = (b - a + 1 - (k - 1)) / k;
        for (let i = 0; i < k; i++) secs.push([Math.round(a + i * (len + 1)), Math.round(a + i * (len + 1) + len - 1)]);
      } else {
        const a = y0, b = wreck ? topY - 1 : topY - 3, len = (b - a + 1 - (nSails - 1)) / nSails;
        for (let i = 0; i < nSails; i++) secs.push([Math.round(a + i * (len + 1)), Math.round(a + i * (len + 1) + len - 1)]);
      }
      const w0 = Math.round(W / 2) + 2 + (main ? 1 : 0) - (mi === 0 && n > 1 ? 1 : 0);
      const sx0 = mx + (thick ? 2 : 1);
      secs.forEach(([sy0, sy1], si) => {
        if (sy1 - sy0 < 2) return;
        const w = Math.max(3, w0 - si * 2);
        const B = wreck ? 0 : Math.min(2, 1 + Math.round(w / 8));
        for (let z = -w - 2; z <= w + 2; z++) {
          const c = W_(Math.abs(z) > w ? shade(yardC, 1.2) : yardC);
          R.vox.set(sx0, sy1 + 1, z, c);
          if (si === 0) R.vox.set(sx0, sy0 - 1, z, c);
        }
        const sv = new Vox();
        const em = si === 0 && main && P.emblem && EMBLEMS[P.emblem] && !wreck ? EMBLEMS[P.emblem] : null;
        const es = em && w >= 7 && sy1 - sy0 >= 10 ? 2 : 1;
        const eh = em ? em.length * es : 0, ew = em ? em[0].length * es : 0;
        // the emblem must stand out from the sail: light sails get it in the flag colour
        const lum = c => { const q = VC.Voxel.toInt(c); return ((q >> 16) & 255) * 0.3 + ((q >> 8) & 255) * 0.59 + (q & 255) * 0.11; };
        const emC = Math.abs(lum(P.fg || '#fff') - lum(P.sail)) > 70 ? (P.fg || '#fff') : (P.flag && Math.abs(lum(P.flag) - lum(P.sail)) > 70 ? P.flag : '#1a1a1a');
        const ey0 = Math.round((sy0 + sy1) / 2 + eh / 2);
        for (let y = sy0; y <= sy1; y++) for (let z = -w; z <= w; z++) {
          if (tatter && y < sy1 - 1 && rnd() < tatter * (wreck ? 1.3 - (y - sy0) / (sy1 - sy0 + 1) : 1)) continue;
          const ty = (y - sy0) / Math.max(1, sy1 - sy0), tz = z / w;
          const belly = Math.round(B * Math.max(0, 1 - tz * tz) * (y === sy1 ? 0.45 : y === sy0 ? 0.8 : 1));
          let c = P.sail;
          if (P.stripe && mod(Math.floor((z + w) / 3), 2) === 0) c = P.stripe;
          if (P.patch && hash(Math.floor((z + 20) / 3), Math.floor(y / 3), mi * 7 + si) < 0.1) c = P.patch;
          let k = 0.97 + 0.05 * hash(z, y, si + mi * 5);
          if (Math.abs(z) === w || y === sy0 || y === sy1) k *= 0.86;
          else if (mod(z + w, 4) === 0) k *= 0.93;
          if (y === sy1 - 2 && w > 4) k *= mod(z, 2) ? 0.92 : 0.82;
          if (em) {
            const ri = Math.floor((ey0 - y) / es), ci = Math.floor((z + Math.floor(ew / 2)) / es);
            if (ey0 - y >= 0 && ri < em.length && z + Math.floor(ew / 2) >= 0 && ci < em[0].length && em[ri][ci] === 'X') { c = emC; k = 1; }
          }
          sv.set(sx0 + 1 + belly, y, z, MT('cloth', shade(c, k)));
        }
        R.cloth.push({ vox: sv, fn: braceW(sailWeight(sy0, sy1, w, 0.035 + 0.006 * w)) });
        masts[masts.length - 1].yards = (masts[masts.length - 1].yards || []).concat([[sy1 + 1, w + 2]]);
      });
    });

    // spanker (gaff sail) behind the rearmost mast, jibs between the bowsprit and the fore mast
    if (P.sail && tier >= 2 && !wreck && masts.length) {
      const m = masts[0];
      const sl = Math.round(L * 0.2);
      const xa = m.mx - (m.thick ? 2 : 1), xb = Math.max(1, m.mx - sl);
      const yb = Math.max(floorAt(xb), floorAt(xa)) + 4;
      const ytA = m.top - Math.round(m.h * 0.42);
      const sv = new Vox();
      for (let x = xb; x <= xa; x++) {
        const tx = (xa - x) / Math.max(1, xa - xb);
        const yt = Math.round(ytA + tx * sl * 0.35);
        v.set(x, yb - 1, 0, W_(yardC));
        v.set(x, yt + 1, 0, W_(yardC));
        for (let y = yb; y <= yt; y++) {
          if (tatter && rnd() < tatter) continue;
          const ty = (y - yb) / Math.max(1, yt - yb);
          const bz = Math.round(1.6 * Math.sin(Math.PI * tx) * Math.sin(Math.PI * ty));
          let k = 0.97 + 0.05 * hash(x, y, 9);
          if (x === xb || y === yb || y === yt) k *= 0.86; else if (mod(x, 4) === 0) k *= 0.93;
          const c = P.stripe && mod(Math.floor(x / 3), 2) === 0 ? P.stripe : P.sail;
          sv.set(x, y, bz, MT('cloth', shade(c, k)));
        }
      }
      cloth.push({ vox: sv, fn: (x, y, z, vx, vy) => [0, 0, 0.06 * Math.sin(Math.PI * Math.max(0, Math.min(1, (xa - vx) / Math.max(1, xa - xb))))] });
    }
    if (P.sail && tier >= 1 && !wreck && masts.length) {
      const fm = masts[masts.length - 1];
      const jibs = tier >= 3 ? [[1, 0.88], [0.62, 0.64]] : [[1, 0.8]];
      jibs.forEach(([bk, mk], ji) => {
        const ex = Math.round(bx0 + (tipX - bx0) * bk), ey = Math.round(by0 + (tipY - by0) * bk) - 1;
        const my = Math.round(fm.base + (fm.top - fm.base) * mk);
        const x0 = fm.mx + (fm.thick ? 8 : 6) + ji * 2;
        const jv = new Vox();
        for (let x = x0; x <= ex; x++) {
          const t = (x - x0) / Math.max(1, ex - x0);
          const yTop = Math.round(my + (ey - my) * t);
          const yBot = Math.round(fm.base + 4 + (ey - fm.base - 4) * Math.pow(t, 0.8));
          for (let y = yBot; y <= yTop; y++) {
            if (tatter && rnd() < tatter) continue;
            let k = 0.95 + 0.05 * hash(x, y, ji + 3);
            if (y === yTop || y === yBot) k *= 0.86;
            jv.set(x, y, 0, MT('cloth', shade(P.sail, k)));
          }
        }
        cloth.push({ vox: jv, fn: (x, y, z, vx) => [0, 0, 0.09 * Math.sin(Math.PI * Math.max(0, Math.min(1, (vx - x0) / Math.max(1, ex - x0))))] });
        rig.push([[x0 + 0.5, my + 0.5, 0.5], [ex + 0.5, ey + 1, 0.5]]);
      });
    }

    // --- flags: the main flag on the tallest mast, pennants, the stern ensign
    if (P.flag && mastTops.length && !wreck) {
      let best = mastTops[0];
      for (const m of mastTops) if (m[1] > best[1]) best = m;
      const [fx, fy] = best;
      for (let y = fy + 1; y <= fy + 4; y++) v.set(fx, y, 0, W_(mastC));
      v.set(fx, fy + 5, 0, MT('gold', '#f0c03a'));
      const fv = new Vox();
      const fw = 10, fh = 6;
      const em = EMBLEMS[P.emblem] || (P.fg ? EMBLEMS.skull : null);
      const ex0 = fx - 1 - Math.floor((fw - (em ? em[0].length : 0)) / 2), ey0 = fy + 4 - Math.floor((fh - (em ? em.length : 0)) / 2);
      for (let i = 1; i <= fw; i++) for (let j = 0; j < fh; j++) {
        const x = fx - i, y = fy + 4 - j;
        let c = P.flag;
        if (em) { const ci = ex0 - x, ri = ey0 - y; if (ci >= 0 && ri >= 0 && ri < em.length && ci < em[0].length && em[ri][em[0].length - 1 - ci] === 'X') c = P.fg || '#fff'; }
        if (i === fw && j % 2) continue;
        fv.set(x, y, 0, MT('cloth', c));
      }
      cloth.push({ vox: fv, fn: flagWeight(fx, 0.013) });
      if (!P.steam) for (const m of mastTops) {
        if (m === best) continue;
        const pv = new Vox();
        const pc = P.fg && P.fg !== '#fff' ? P.fg : trim;
        for (let i = 1; i <= 10; i++) {
          const hh = Math.max(1, Math.round(3 - i * 0.22));
          for (let j = 0; j < hh; j++) pv.set(m[0] - i, m[1] + 1 - j, 0, MT('cloth', i > 7 ? P.flag : pc));
        }
        v.set(m[0], m[1] + 1, 0, W_(mastC));
        cloth.push({ vox: pv, fn: flagWeight(m[0], 0.015) });
      }
      // stern ensign on a staff
      const sy = cx > 0 ? cTop + 2 : H + 2;
      v.line(-2, sy, 0, -4, sy + 9, 0, W_('#5a3a1e'));
      const ev = new Vox();
      for (let i = 1; i <= 8; i++) for (let j = 0; j < 5; j++) ev.set(-4 - i, sy + 9 - j, 0, MT('cloth', (i === 4 || i === 5) && (j === 1 || j === 2) ? (P.fg || '#fff') : P.flag));
      cloth.push({ vox: ev, fn: flagWeight(-4, 0.014) });
    }

    // --- steam machinery
    if (P.steam) {
      const mx = Math.round(L * 0.5), zr = top[mx];
      const bh2 = 6 + Math.round(tier / 2);
      for (let x = mx - 5; x <= mx + 5; x++) for (let y = H + 1; y <= H + bh2; y++) for (let z = -(zr - 3); z <= zr - 3; z++) {
        if (masts.some(m => Math.abs(m.mx - x) <= 2)) continue;
        v.set(x, y, z, y === H + bh2 ? MT('metal', shade(P.trim, 1.2)) : MT('metal', shade(hull, 1.12)));
      }
      for (let x = mx - 4; x <= mx + 4; x += 2) for (const s of [1, -1]) if (!masts.some(m => Math.abs(m.mx - x) <= 2)) lit(x, H + bh2 - 2, s * (zr - 3));
      if (P.gears) for (const s of [1, -1]) {
        const R = Math.max(4, Math.round(H * 0.7)), gy = wl + 2, gx = Math.round(L * 0.5);
        for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
          const r = Math.hypot(dx, dy);
          if (r > R + 0.4 || gy + dy < wl - 1) continue;
          const zz = s * (outer[gx][Math.min(H - 1, Math.max(0, gy + dy))] + 1);
          if (r > R - 1.2) { v.set(gx + dx, gy + dy, zz, MT('metal', '#8a6420')); v.set(gx + dx, gy + dy, zz + s, MT('metal', '#e0b04a')); }
          else if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) v.set(gx + dx, gy + dy, zz + s, MT('wood', '#5a3a1e'));
        }
        v.set(gx, gy, s * (outer[gx][gy] + 3), MT('gold', '#f0c03a'));
      }
      if (P.flag) {
        // signal mast with the flag above the bridge house
        const sx = Math.round(L * 0.5);
        for (let y = H + bh2 + 1; y <= H + bh2 + 14; y++) v.set(sx, y, 0, MT('metal', '#3a3a3e'));
        for (let z = -4; z <= 4; z++) v.set(sx, H + bh2 + 11, z, MT('metal', '#3a3a3e'));
        const fv = new Vox();
        for (let i = 1; i <= 9; i++) for (let j = 0; j < 5; j++) fv.set(sx - i, H + bh2 + 14 - j, 0, MT('cloth', j === 2 && i > 2 && i < 8 ? (P.fg || '#fff') : P.flag));
        cloth.push({ vox: fv, fn: flagWeight(sx, 0.014) });
      }
    }

    // --- deck furniture: hatch gratings, capstan, deck guns, barrels and crates
    const busy = (x0, x1, z0, z1, y0, y1) => {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (v.has(x, y, z)) return true;
      return false;
    };
    const mainX0 = cx > 0 ? cx + ch : 3, mainX1 = fcX - 3;
    if (tier >= 1 && !P.steam) {
      const hx = n > 1 ? Math.round((masts[n - 1].mx + masts[n - 2].mx) / 2) : Math.round(L * 0.35);
      const hw = Math.min(3, top[hx] - 3);
      if (hw >= 1 && !busy(hx - 3, hx + 3, -hw - 1, hw + 1, H + 1, H + 1)) {
        for (let x = hx - 3; x <= hx + 3; x++) for (let z = -hw - 1; z <= hw + 1; z++) {
          const edge = x === hx - 3 || x === hx + 3 || Math.abs(z) === hw + 1;
          v.set(x, H + 1, z, edge ? W_('#5a3a1e') : W_(mod(x + z, 2) ? '#2a1a0e' : '#8a6238'));
        }
      }
      // capstan
      const cpx = cx > 0 ? cx + ch + 3 : Math.round(L * 0.2);
      if (cpx < mainX1 && !busy(cpx - 2, cpx + 2, -2, 2, H + 1, H + 3)) {
        v.cyl(cpx, H + 1, 0, 1.3, H + 3, (x, y) => W_(y === H + 3 ? '#4a3020' : '#7a5530'));
        for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) v.set(cpx + dx, H + 3, dz, W_('#9a7044'));
      }
    }
    // deck guns on small ships (their muzzles poke through the bulwark)
    if (!portRows.length && !P.steam) {
      const ng = tier === 0 ? 1 : 2;
      for (let k = 0; k < ng; k++) {
        const gx = Math.round(L * (tier === 0 ? 0.32 : 0.36 + k * 0.26));
        if (masts.some(m => Math.abs(m.mx - gx) <= 3)) continue;
        for (const s of [1, -1]) {
          const zr = topAt(gx);
          if (zr < 3) continue;
          for (let dx = -1; dx <= 1; dx++) v.set(gx + dx, H + 1, s * (zr - 2), W_('#5a3a1e'));
          v.set(gx - 1, H + 1, s * (zr - 1), W_('#4a3020')); v.set(gx + 1, H + 1, s * (zr - 1), W_('#4a3020'));
          for (let z = zr - 2; z <= zr + 1; z++) v.set(gx, H + 2, s * z, MT('metal', z === zr + 1 ? '#1a1a1c' : metal));
          ports.push([gx, H + 2, s]);
        }
      }
    }
    // barrels and crates along the bulwarks at the front of the main deck
    if (tier >= 1 && !P.steam) {
      const bx = mainX1 - 2;
      for (const s of [1, -1]) {
        const zr = topAt(bx) - 2;
        if (zr < 2 || busy(bx - 1, bx, s > 0 ? zr - 1 : -zr, s > 0 ? zr : -zr + 1, H + 1, H + 3)) continue;
        for (let y = H + 1; y <= H + 3; y++) for (let dx = -1; dx <= 0; dx++) for (const dz of [0, -1]) {
          v.set(bx + dx, y, s * zr + dz * s, y === H + 2 ? MT('metal', '#4a4440') : W_(mod(dx + dz, 2) ? '#8a5a32' : '#7a4a2a'));
        }
      }
      const kx = Math.round((mainX0 + mainX1) / 2) + 3;
      const zr = topAt(kx) - 3;
      if (zr > 2 && !busy(kx, kx + 2, -zr, -zr + 2, H + 1, H + 3) && !masts.some(m => Math.abs(m.mx - kx) <= 3)) {
        for (let x = kx; x <= kx + 2; x++) for (let y = H + 1; y <= H + 3; y++) for (let z = -zr; z <= -zr + 2; z++) {
          const e = (x === kx || x === kx + 2) + (y === H + 1 || y === H + 3) + (z === -zr || z === -zr + 2);
          v.set(x, y, z, MT('plank', e >= 2 ? '#6b4a2e' : '#a0703c'));
        }
      }
    }
    // wreck: broken planks show dark holes in the hull
    if (wreck) for (let k = 0; k < 14; k++) {
      const x = 3 + Math.floor(rnd() * (L - 8)), y = wl + Math.floor(rnd() * (H - wl - 1)), s = rnd() < 0.5 ? 1 : -1;
      const zr = outer[x][y];
      if (zr > 0) { v.set(x, y, s * zr, MT('plain', '#1a120c')); v.set(x + 1, y, s * zr, MT('plain', '#24180e')); }
    }

    // --- rigging (voxel-space points; voxel centres are at +0.5, the centre line at z = 0.5)
    const seg = (a, b) => rig.push([a, b]);
    const railPt = (x, s) => { x = Math.max(0, Math.min(L - 1, x)); return [x + 0.5, railTop(x) + 0.5, 0.5 + s * (top[x] + 0.3)]; };
    if (!P.steam) masts.forEach((m, mi) => {
      const head = m.nestY || m.top - 4;
      for (const s of [1, -1]) {
        const feet = [m.mx - 4, m.mx - 2, m.mx, m.mx + 2].map(x => railPt(Math.max(1, x), s));
        const hp = [m.mx + 0.5, head, 0.5 + s * (m.nestY ? 2.5 : 0.5)];
        feet.forEach(f => seg(hp, f));
        if (!wreck) for (let y = feet[0][1] + 2; y < head - 2; y += 2.5) {
          const pts = feet.map(f => { const t = (y - f[1]) / (hp[1] - f[1]); return [f[0] + (hp[0] - f[0]) * t, y, f[2] + (hp[2] - f[2]) * t]; });
          for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1]);
        }
        if (m.nestY && !wreck) { seg([m.mx + 0.5, m.top - 2, 0.5], [m.mx + 0.5, m.nestY + 1, 0.5 + s * 3]); seg([m.mx - 0.5, m.top - 2, 0.5], [m.mx - 2.5, m.nestY + 1, 0.5 + s * 2]); }
        // backstays and braces
        seg([m.mx + 0.5, m.top, 0.5], railPt(m.mx - 9, s));
        for (const [yy, yw] of m.yards || []) {
          const arm = braceP(m.mx, [m.mx + (m.thick ? 2.5 : 1.5), yy + 0.5, 0.5 + s * (yw + 0.5)]);
          seg(arm, railPt(m.mx - 7, s));
          seg(arm, [m.mx + 0.5, Math.min(m.top, yy + 6), 0.5]);
        }
      }
      const topPt = [m.mx + 0.5, m.top + 0.5, 0.5];
      if (mi < masts.length - 1) seg(topPt, [masts[mi + 1].mx + 0.5, masts[mi + 1].nestY || Math.round(masts[mi + 1].base + masts[mi + 1].h * 0.5), 0.5]);
      else if (!wreck) seg(topPt, [tipX + 0.5, tipY + 0.5, 0.5]);
    });
    if (!P.steam && tier >= 1) seg([tipX + 0.5, tipY, 0.5], [L + 1.5, H - 3, 0.5]);

    // --- free deck spots for the crew (main deck and quarterdeck), in voxels
    const freeAt = (x, y, z) => !busy(x - 1, x + 1, z - 1, z + 1, y, y + 3) && v.has(x, y - 1, z);
    const spots = [], upper = [];
    for (let x = mainX0; x <= mainX1; x += 3) {
      const zr = topAt(x) - 2;
      for (let z = -zr; z <= zr; z += 3) if (freeAt(x, H + 1, z)) spots.push([x + 0.5, z + 0.5]);
    }
    if (cx > 0) for (let x = 2; x < cx - 4; x += 3) {
      const zr = top[x] - 2;
      for (let z = -zr; z <= zr; z += 3) if (freeAt(x, cTop + 1, z)) upper.push([x + 0.5, z + 0.5]);
    }

    return {
      vox: v, glow, cloth, rig, rigs, brace: BR, waterline: wl, length: L, height: H, halfW: W / 2, deckY: H + 1, mastTops,
      scale: 0.125, cx: L / 2, cz: 0.5, ports,
      deck: { y: H + 1, spots, upper: { y: cTop + 1, spots: upper } },
    };
  }

  // ------------------------------------------------------------------ creatures
  function crab(o) {
    const s = o.size || 1, c = o.color || '#e2553a';
    const light = shade(c, 1.25), dark = shade(c, 0.7);
    const body = new Vox();
    body.ball(0, 4 * s, 0, 7 * s, 3.2 * s, 6 * s, (x, y, z) => (y > 5 * s && (x + z) % 4 === 0 ? light : c));
    // eyes on stalks
    for (const sgn of [1, -1]) {
      body.line(3 * s, 6 * s, sgn * 2 * s, 5 * s, 10 * s, sgn * 2.5 * s, dark);
      body.ball(5 * s, 10.5 * s, sgn * 2.5 * s, 1.2, 1.2, 1.2, '#ffffff');
      body.set(6 * s + 1, 10.5 * s, sgn * 2.5 * s, '#111');
      // legs
      for (let k = 0; k < 3; k++) {
        const x = -3 * s + k * 3 * s;
        body.line(x, 3 * s, sgn * 5 * s, x - 1, 0, sgn * 10 * s, dark, 0.6);
      }
    }
    const parts = [{ vox: body, pos: [0, 0, 0] }];
    for (const sgn of [1, -1]) {
      const claw = new Vox();
      claw.line(0, 0, 0, 4 * s, 2 * s, 0, dark, 0.8 * s);
      claw.ball(6 * s, 2.5 * s, 0, 3 * s, 2 * s, 2 * s, c);
      claw.ball(9 * s, 4 * s, 0, 1.5 * s, 1 * s, 1.2 * s, light);
      claw.ball(9 * s, 1.5 * s, 0, 1.5 * s, 0.8 * s, 1.2 * s, light);
      parts.push({ vox: claw, pos: [5 * s, 4 * s, sgn * 5 * s], anim: 'claw', sign: sgn });
    }
    return { parts, waterline: Math.round(2 * s) };
  }

  function turtle(o) {
    const c = o.color || '#5b3a2a';
    const v = new Vox();
    const lava = c === '#5b3a2a';
    v.ball(0, 2, 0, 11, 6, 9, (x, y, z) => {
      if (lava && ((x * 3 + z * 5 + y) % 7 === 0)) return '#ff7a1f';
      if (!lava && y > 4 && (x + z) % 5 === 0) return '#ffd1dc';
      return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? c : shade(c, 1.2);
    }, (x, y) => y >= 0);
    const skin = lava ? '#3a2a20' : '#4f8a7a';
    v.ball(13, 2, 0, 3.5, 2.5, 3, skin);
    v.set(15, 3, 1, '#ffd23f'); v.set(15, 3, -1, '#ffd23f');
    for (const sx of [6, -6]) for (const sz of [1, -1]) v.ball(sx, 0, sz * 9, 3, 1, 2.5, skin);
    if (!lava) for (let k = 0; k < 6; k++) v.line(-6 + k * 2.5, 7, (k % 3) - 1, -6 + k * 2.5, 10 + (k % 2) * 2, (k % 3) - 1, '#ff7b9c');
    return { parts: [{ vox: v, pos: [0, 0, 0] }], waterline: 2 };
  }

  function serpent(o) {
    const s = o.size || 1, c = o.color || '#7fb6b0';
    const belly = shade(c, 1.35), dark = shade(c, 0.65);
    const parts = [];
    for (let h = 0; h < 3; h++) {
      const hump = new Vox();
      for (let a = 0; a <= 12; a++) {
        const t = a / 12 * Math.PI;
        const x = Math.cos(t) * 5 * s, y = Math.sin(t) * 5 * s;
        hump.ball(x, y, 0, 1.8 * s, 1.8 * s, 1.8 * s, (xx, yy) => (yy < y - 0.5 ? belly : c));
        if (a % 3 === 1) hump.line(x, y + 1.5 * s, 0, x, y + 3.5 * s, 0, dark);
      }
      parts.push({ vox: hump, pos: [-16 * s + h * 10 * s, -1, 0], anim: 'hump', phase: h });
    }
    const head = new Vox();
    head.line(0, 0, 0, 0, 10 * s, 0, c, 2 * s);
    head.ball(2 * s, 12 * s, 0, 4 * s, 2.5 * s, 2.5 * s, c);
    head.ball(4 * s, 10.5 * s, 0, 3 * s, 1 * s, 2 * s, belly);
    for (const sgn of [1, -1]) {
      head.set(3 * s, 13.5 * s, sgn * 2 * s, '#ffd23f');
      head.line(0, 14 * s, sgn * 1.5 * s, -3 * s, 17 * s, sgn * 3 * s, dark);
    }
    for (let k = 0; k < 4; k++) head.set(6 * s, 10 * s, k - 1.5, '#ffffff');
    parts.push({ vox: head, pos: [14 * s, -1, 0], anim: 'head' });
    return { parts, waterline: 0 };
  }

  function kraken(o) {
    const c = o.color || '#9b3b6b';
    const spot = shade(c, 1.4), dark = shade(c, 0.65);
    const parts = [];
    const head = new Vox();
    head.ball(0, 6, 0, 8, 10, 8, (x, y, z) => ((x * 7 + y * 3 + z * 5) % 11 === 0 ? spot : c), (x, y) => y >= -1);
    for (const sgn of [1, -1]) {
      head.ball(6, 5, sgn * 4, 2.2, 2.6, 2.2, '#ffd23f');
      head.box(8, 4, sgn * 4, 8, 6, sgn * 4, '#111');
    }
    parts.push({ vox: head, pos: [0, -2, 0], anim: 'breathe' });
    const angles = [-2.4, -1.6, -0.8, 0.8, 1.6, 2.4];
    angles.forEach((a, i) => {
      const t = new Vox();
      for (let k = 0; k < 18; k++) {
        const f = k / 17;
        const r = 2.2 * (1 - f) + 0.6;
        const x = k * 0.9;
        const y = Math.sin(f * 2.6) * 8 + f * 6;
        t.ball(x, y, 0, r, r, r, (xx, yy) => (yy < y - r * 0.4 ? '#f2a0c0' : (k % 4 === 0 ? dark : c)));
      }
      parts.push({ vox: t, pos: [Math.cos(a) * 9, -2, Math.sin(a) * 9], rotY: -a, anim: 'tentacle', phase: i });
    });
    return { parts, waterline: 0 };
  }

  function fish(o) {
    const c = o.color || '#6f8796';
    const belly = shade(c, 1.5), dark = shade(c, 0.7);
    const v = new Vox();
    v.ball(0, 0, 0, 12, 4, 4.5, (x, y) => (y < -1 ? belly : c));
    v.ball(-12, 1, 0, 3, 4, 1, dark); // tail
    v.line(0, 3, 0, -4, 9, 0, dark, 1); // dorsal fin
    for (const sgn of [1, -1]) {
      v.set(9, 1, sgn * 3, '#ffffff'); v.set(10, 1, sgn * 3, '#111');
      v.line(2, -2, sgn * 4, -1, -4, sgn * 8, dark, 0.7);
    }
    if (o.hammer) { v.box(10, -1, -6, 12, 1, 6, c); v.set(12, 0, 6, '#111'); v.set(12, 0, -6, '#111'); }
    if (o.horn) v.line(12, 0, 0, 24, 2, 0, '#f2ead6', 0.5);
    if (o.lure) {
      v.line(8, 4, 0, 14, 10, 0, dark, 0.4);
      v.line(14, 10, 0, 16, 8, 0, dark, 0.4);
      v.ball(16.5, 7, 0, 1.4, 1.4, 1.4, '#c9ffef');
      for (let k = 0; k < 6; k++) v.set(12 - k * 0.2, -1 - (k % 2), k - 2.5, '#ffffff');
    }
    return { parts: [{ vox: v, pos: [0, 0.5, 0], anim: 'swim' }], waterline: 0, glow: !!o.lure };
  }

  function golem(o) {
    const c = o.color || '#c9a640';
    const dark = shade(c, 0.6);
    const v = new Vox();
    v.box(-6, 0, -8, 6, 12, 8, (c));
    v.each(() => {});
    // cracks & shard
    for (let k = 0; k < 30; k++) v.set(-6 + (k * 7) % 13, (k * 5) % 12, 8, dark);
    v.ball(0, 8, 8.5, 2, 2, 1, '#5ff3ff');
    v.box(-4, 13, -5, 4, 19, 5, c); // head
    v.box(4, 16, -3, 4, 17, -2, '#5ff3ff'); v.box(4, 16, 2, 4, 17, 3, '#5ff3ff');
    v.box(-4, 20, -5, 4, 20, 5, dark);
    const parts = [{ vox: v, pos: [0, -3, 0] }];
    for (const sgn of [1, -1]) {
      const arm = new Vox();
      arm.box(-3, -12, -3, 3, 0, 3, c);
      arm.box(-4, -16, -4, 4, -12, 4, dark);
      parts.push({ vox: arm, pos: [0, 9, sgn * 12], anim: 'arm', sign: sgn });
    }
    return { parts, waterline: 0 };
  }

  function cloud(o) {
    const c = o.color || '#5a6b8c';
    const v = new Vox();
    const blobs = [[0, 10, 0, 8], [7, 9, 3, 6], [-7, 9, -2, 6], [3, 14, -2, 6], [-4, 13, 3, 5], [10, 11, -4, 4]];
    for (const [x, y, z, r] of blobs) v.ball(x, y, z, r, r * 0.75, r, (xx, yy) => (yy < y - 1 ? shade(c, 0.8) : c));
    v.ball(6, 11, 5, 1.6, 1.6, 0.8, '#fff6b0'); v.ball(-1, 11, 6, 1.6, 1.6, 0.8, '#fff6b0');
    v.box(1, 8, 6, 5, 8, 6, '#222');
    const bolt = new Vox();
    let x = 0, y = 0;
    for (let k = 0; k < 10; k++) { bolt.box(x, y, 0, x + 1, y, 0, '#ffe45a'); y -= 1; x += k % 3 === 0 ? 1 : -1; }
    return { parts: [{ vox: v, pos: [0, 2, 0], anim: 'float' }, { vox: bolt, pos: [2, 9, 4], anim: 'bolt' }], waterline: -4, glow: true };
  }

  const CREATURES = { crab, turtle, serpent, kraken, fish, golem, cloud };


  // ------------------------------------------------------------------ nature
  // Low-detail versions (0.25 units per voxel) are used for the far jungle, the HD ones
  // (0.125 units per voxel) close to the camera.
  const LEAF = ['#2f9e44', '#37b24d', '#2b8a3e', '#45b84e'];
  /** Palm tree: trunk of height h, leaves reaching `spread` voxels out; `bend` scales the random lean. */
  function palm(h, seed, spread, bend) {
    const rnd = VC.util.rng(seed || 1);
    const v = new Vox();
    const lean = (rnd() * 2 - 1) * (bend === undefined ? 1 : bend);
    const reach = spread || 5;
    let x = 0, z = 0;
    for (let y = 0; y < h; y++) {
      x += lean * 0.18; z += (rnd() - 0.5) * 0.2;
      v.set(x, y, z, MT('bark', y % 2 ? '#8a6238' : '#9a7044'));
    }
    const ty = h;
    for (let a = 0; a < 6; a++) {
      const ang = a / 6 * Math.PI * 2 + rnd() * 0.3;
      for (let k = 1; k <= reach; k++) {
        v.set(x + Math.cos(ang) * k, ty + 1 - Math.floor(k * k / 8), z + Math.sin(ang) * k, MT('leaf', LEAF[(a + k) % 3]));
      }
    }
    v.set(x, ty, z, MT('leaf', '#2f9e44'));
    v.set(x + 1, ty - 1, z, MT('bark', '#6b4a2e')); v.set(x - 1, ty - 1, z, MT('bark', '#6b4a2e')); v.set(x, ty - 1, z + 1, MT('bark', '#6b4a2e'));
    return v;
  }

  /**
   * Detailed palm (0.125): ringed 2x2 trunk that curves, drooping fronds with leaflets on both sides,
   * coconuts. `reach` limits the crown radius in voxels (default 8).
   */
  function palmHD(h, seed, reach) {
    const rnd = VC.util.rng(seed || 1);
    const v = new Vox();
    const R = reach || 8;
    const ang0 = rnd() * Math.PI * 2, lean = (0.2 + rnd() * 0.3) * Math.min(1, R / 8);
    const lx = Math.cos(ang0) * lean, lz = Math.sin(ang0) * lean;
    let x = 0, z = 0;
    for (let y = 0; y < h; y++) {
      const k = y / h;
      x = Math.round(lx * k * k * h * 0.6); z = Math.round(lz * k * k * h * 0.6);
      const ring = y % 3 === 0;
      const c = MT('bark', ring ? '#6e4c2a' : (y % 3 === 1 ? '#8a6238' : '#9a7044'));
      v.box(x, y, z, x + 1, y, z + 1, c);
      if (ring && y < 3) { v.set(x - 1, y, z, MT('bark', '#7a5530')); v.set(x + 2, y, z + 1, MT('bark', '#7a5530')); }
    }
    const tx = x + 0.5, tz = z + 0.5;
    const n = 7 + (rnd() * 2 | 0);
    for (let a = 0; a < n; a++) {
      const ang = a / n * Math.PI * 2 + rnd() * 0.5;
      const len = Math.min(R - 0.5, 6 + rnd() * 3);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const droop = len * (0.75 + rnd() * 0.45);
      for (let k = 1; k <= len; k++) {
        const t = k / len;
        const fx = tx + ca * k, fz = tz + sa * k, fy = h + 1 + 2.2 * t - droop * t * t;
        v.set(fx, fy, fz, MT('leaf', shade(LEAF[(a + k) % 4], 1.05 - t * 0.15)));
        if (k > 1 && k < len) {
          const lw = k < len * 0.7 ? 1 : 0;
          for (let q = 1; q <= 1 + lw; q++) {
            v.set(fx - sa * q, fy - q * 0.6, fz + ca * q, MT('leaf', LEAF[(a + k + q) % 4]));
            v.set(fx + sa * q, fy - q * 0.6, fz - ca * q, MT('leaf', LEAF[(a + k + q + 1) % 4]));
          }
        }
      }
    }
    const cx = Math.floor(tx), cz = Math.floor(tz);
    v.box(cx - 1, h, cz - 1, cx + 2, h, cz + 2, MT('leaf', '#2b8a3e'));
    v.box(cx, h + 1, cz, cx + 1, h + 1, cz + 1, MT('leaf', '#37b24d'));
    for (const [dx, dz, dy] of [[-1, 0, -1], [2, 1, -1], [0, 2, -2], [1, -1, -2], [2, -1, -1]]) v.set(cx + dx, h + dy, cz + dz, MT('wood', dy === -2 ? '#5a3a1e' : '#6b4a2e'));
    return v;
  }

  /** Broadleaf jungle tree (low detail, 0.25). */
  function tree(seed) {
    const rnd = VC.util.rng(seed || 2);
    const v = new Vox();
    const h = 4 + Math.round(rnd() * 3);
    for (let y = 0; y < h; y++) v.set(0, y, 0, MT('bark', y % 2 ? '#6b4a2e' : '#5a3d22'));
    v.set(1, h - 2, 0, MT('bark', '#5a3d22')); v.set(-1, h - 1, 1, MT('bark', '#5a3d22'));
    const greens = ['#3f8f3a', '#4fa64a', '#357a32', '#5cb84f'];
    const blobs = 3 + Math.round(rnd() * 2);
    for (let b = 0; b < blobs; b++) {
      const bx = (rnd() - 0.5) * 3, bz = (rnd() - 0.5) * 3, by = h + rnd() * 2;
      const r = 1.8 + rnd() * 1.3;
      v.ball(bx, by, bz, r, r * 0.8, r, (x, y, z) => MT('leaf', greens[(y > by ? 3 : 0) + ((x * 7 + z * 3 + y) & 1) * (y > by ? -1 : 2) & 3]));
    }
    if (rnd() < 0.35) for (let k = 0; k < 4; k++) v.set((rnd() - 0.5) * 4, h + rnd() * 2, 2 + rnd(), MT('leaf', rnd() < 0.5 ? '#ff7b3a' : '#ffd23f'));
    return v;
  }

  /** Broadleaf tree in detail (0.125): forked trunk with roots, layered leaf clusters. */
  function treeHD(seed, size) {
    const rnd = VC.util.rng(seed || 2);
    const v = new Vox();
    const sz = size || 1;
    const h = Math.round((9 + rnd() * 5) * sz);
    const bark = y => MT('bark', hash(0, y, seed) < 0.3 ? '#5a3d22' : y % 4 === 0 ? '#6e4c2a' : '#7a5530');
    for (let y = 0; y < h; y++) v.box(0, y, 0, 1, y, 1, bark(y));
    for (const [dx, dz] of [[-1, 0], [2, 1], [0, 2], [1, -1]]) v.set(dx, 0, dz, MT('bark', '#5a3d22'));
    const branches = 3 + (rnd() * 2 | 0);
    const greens = ['#3f8f3a', '#4fa64a', '#357a32', '#5cb84f', '#468f3c'];
    const blobs = [];
    for (let b = 0; b < branches; b++) {
      const a = b / branches * Math.PI * 2 + rnd();
      const len = (3 + rnd() * 2) * sz;
      const by = h - 3 - (rnd() * 3 | 0);
      const ex = Math.cos(a) * len, ez = Math.sin(a) * len, ey = by + 2 + rnd() * 2;
      v.line(0.5, by, 0.5, 0.5 + ex, ey, 0.5 + ez, MT('bark', '#6e4c2a'));
      blobs.push([0.5 + ex, ey + 1.5, 0.5 + ez, (3 + rnd() * 1.6) * sz]);
    }
    blobs.push([0.5, h + 1.5, 0.5, (3.6 + rnd()) * sz]);
    for (const [bx, by, bz, r] of blobs) {
      v.ball(bx, by, bz, r, r * 0.72, r, (x, y, z) => {
        const top = y > by;
        const g = greens[Math.floor(hash(x >> 1, y >> 1, z >> 1) * 5)];
        return MT('leaf', shade(g, top ? 1.08 : 0.88));
      }, (x, y, z) => hash(x, y, z) > 0.08);
    }
    if (rnd() < 0.4) for (let k = 0; k < 6; k++) {
      const [bx, by, bz, r] = blobs[k % blobs.length];
      const a = rnd() * 6.28;
      v.set(bx + Math.cos(a) * r * 0.9, by - 0.5, bz + Math.sin(a) * r * 0.9, MT('leaf', rnd() < 0.5 ? '#ff7b3a' : '#ffd23f'));
    }
    return v;
  }

  /** Bush, optionally with flowers (low detail). */
  function bush(seed) {
    const rnd = VC.util.rng(seed || 3);
    const v = new Vox();
    const r = 1.2 + rnd() * 0.9;
    v.ball(0, 0, 0, r, r * 0.8, r, (x, y, z) => MT('leaf', y > 0 ? ((x + z) & 1 ? '#3f9a3e' : '#47a443') : '#357f34'), (x, y) => y >= 0);
    if (rnd() < 0.45) {
      const fc = ['#ff6fa8', '#ffd23f', '#ff7b3a', '#b07aff'][(rnd() * 4) | 0];
      for (let k = 0; k < 4; k++) v.set(Math.round((rnd() - 0.5) * r * 1.6), Math.round(r * 0.7), Math.round((rnd() - 0.5) * r * 1.6), MT('leaf', fc));
    }
    return v;
  }
  /** Bush in detail (0.125): clustered leaves with berries or blossoms. */
  function bushHD(seed) {
    const rnd = VC.util.rng(seed || 3);
    const v = new Vox();
    const greens = ['#3f9a3e', '#47a443', '#357f34', '#55b04a'];
    const n = 2 + (rnd() * 2 | 0);
    for (let k = 0; k < n; k++) {
      const bx = (rnd() - 0.5) * 4, bz = (rnd() - 0.5) * 4, r = 2 + rnd() * 1.4;
      v.ball(bx, 0.5, bz, r, r * 0.8, r, (x, y, z) => MT('leaf', shade(greens[Math.floor(hash(x, y, z) * 4)], y > 1 ? 1.06 : 0.9)), (x, y) => y >= 0);
    }
    if (rnd() < 0.6) {
      const fc = ['#ff6fa8', '#ffd23f', '#ff7b3a', '#b07aff', '#e2553a'][(rnd() * 5) | 0];
      for (let k = 0; k < 7; k++) {
        const x = Math.round((rnd() - 0.5) * 6), z = Math.round((rnd() - 0.5) * 6);
        let y = 6; while (y > 0 && !v.has(x, y - 1, z)) y--;
        if (y > 0) v.set(x, y, z, MT('leaf', fc));
      }
    }
    return v;
  }

  function rock(seed) {
    const rnd = VC.util.rng(seed || 5);
    const v = new Vox();
    v.ball(0, 0, 0, 2 + rnd() * 2, 1.5 + rnd() * 1.5, 2 + rnd() * 2, (x, y) => MT('rock', rnd() < 0.3 ? '#9a9a96' : (y > 1 && rnd() < 0.25 ? '#7b8b5a' : '#7f7f7b')), (x, y) => y >= 0);
    return v;
  }

  /** HD ground clutter: flowers, grass tufts, shells, starfish, driftwood. */
  function flowers(seed) {
    const rnd = VC.util.rng(seed || 4);
    const v = new Vox();
    const fc = [['#ff6fa8', '#ffd23f'], ['#ffffff', '#ffd23f'], ['#b07aff', '#fff2a0'], ['#ff5a3a', '#ffd23f']][(rnd() * 4) | 0];
    for (let k = 0; k < 8; k++) {
      const x = Math.round((rnd() - 0.5) * 7), z = Math.round((rnd() - 0.5) * 7);
      const h = 1 + ((rnd() * 2) | 0);
      for (let y = 0; y < h; y++) v.set(x, y, z, MT('leaf', '#3f8f3a'));
      v.set(x, h, z, MT('leaf', fc[0]));
      if (rnd() < 0.5) { v.set(x + 1, h, z, MT('leaf', fc[0])); v.set(x, h + 1, z, MT('leaf', fc[1])); }
      if (rnd() < 0.4) v.set(x - 1, 0, z, MT('leaf', '#4fa64a'));
    }
    return v;
  }
  function grass(seed) {
    const rnd = VC.util.rng(seed || 6);
    const v = new Vox();
    for (let k = 0; k < 7; k++) {
      const x = Math.round((rnd() - 0.5) * 5), z = Math.round((rnd() - 0.5) * 5);
      const h = 1 + ((rnd() * 3) | 0);
      for (let y = 0; y < h; y++) v.set(x, y, z, MT('grass', y === h - 1 ? '#6cc251' : '#4fa64a'));
    }
    return v;
  }
  function shells(seed) {
    const rnd = VC.util.rng(seed || 7);
    const v = new Vox();
    for (let k = 0; k < 5; k++) {
      const x = Math.round((rnd() - 0.5) * 8), z = Math.round((rnd() - 0.5) * 8);
      const c = ['#ffd1dc', '#fff4e0', '#f2b8a0', '#e0d6ff'][k % 4];
      v.set(x, 0, z, MT('stone', c)); if (rnd() < 0.5) v.set(x + 1, 0, z, MT('stone', shade(c, 0.9)));
    }
    if (rnd() < 0.6) {
      const x = Math.round((rnd() - 0.5) * 6), z = Math.round((rnd() - 0.5) * 6);
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) v.set(x + dx, 0, z + dz, MT('plain', '#ff8a3a'));
    }
    return v;
  }
  function driftwood(seed) {
    const rnd = VC.util.rng(seed || 8);
    const v = new Vox();
    const len = 7 + ((rnd() * 5) | 0);
    for (let x = 0; x < len; x++) v.box(x, 0, Math.round(Math.sin(x * 0.5) * 0.8), x, x % 3 === 0 ? 1 : 0, Math.round(Math.sin(x * 0.5) * 0.8), MT('bark', x % 2 ? '#b59a78' : '#a08664'));
    v.set(len - 2, 1, 2, MT('bark', '#a08664')); v.set(len - 1, 1, 3, MT('bark', '#a08664'));
    return v;
  }

  // ------------------------------------------------------------------ detail kit (0.125 units per voxel)
  // Island models are a "part set": solid voxels, glowing voxels (windows, lamps, fire; lit at night),
  // cloth (flags, banners, awnings for the cloth shader) and smoke emitters (voxel positions):
  //   { v: Vox, g: Vox, cloth: [{ vox, fn }], smoke: [[x, y, z], ...] }
  // y = 0 is the first layer above the ground; the front (door side) faces +z. Every voxel carries a
  // surface material (plank, wood, stone, brick, roof, thatch, glass, metal, gold, cloth, leaf…).
  const HD = 0.125;
  const LAMP = '#ffd36b', GLASS = '#f2c46a';
  function parts() { return { v: new Vox(), g: new Vox(), cloth: [], smoke: [] }; }
  function lit(P, x, y, z, c) { P.v.del(x, y, z); P.g.set(x, y, z, MT('glass', c || LAMP)); }
  function hash(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
  const W = c => MT('wood', c);
  // Surface colour functions (x, y, z) -> tagged colour.
  /** Horizontal boards with staggered seams (walls, decks). */
  const planks = (c, len) => (x, y, z) => {
    len = len || 6;
    const a = x + z, off = (y * 3) % len;
    const seam = mod(a + off, len) === 0;
    return MT('plank', shade(c, (y & 1 ? 0.92 : 1) * (seam ? 0.8 : 0.94 + 0.1 * hash(Math.floor((a + off) / len), y, 7))));
  };
  /** Vertical boards (doors, sheds, shacks). */
  const vplanks = c => (x, y, z) => MT('plank', shade(c, ((x + z) & 1 ? 0.88 : 1) * (0.94 + 0.1 * hash(x + z, y >> 2, 11))));
  /** Stone blocks (running bond, 4 long and 2 high) with per-block shade. */
  const stone = (c, m) => (x, y, z) => {
    const row = y >> 1, a = x + z + (row & 1) * 2;
    return MT(m || 'stone', shade(c, 0.86 + 0.2 * hash(Math.floor(a / 4), row, 3)));
  };
  const brick = c => (x, y, z) => MT('brick', shade(c, 0.84 + 0.24 * hash(Math.floor((x + z + (y & 1)) / 2), y, 5)));
  const plaster = c => (x, y, z) => MT('plain', shade(c, 0.95 + 0.07 * hash(x, y, z)));
  const cobble = c => (x, y, z) => MT('cobble', shade(c, 0.82 + 0.28 * hash(x >> 1, z >> 1, y)));
  const rockC = c => (x, y, z) => MT('rock', shade(c, 0.8 + 0.3 * hash(x >> 1, y >> 1, z >> 1)));
  /**
   * Plaster with a timber frame (half-timbering): beams at y0 / y1, posts every 4 voxels along each
   * wall and diagonal braces in alternating panels (windows drawn later simply cut through them).
   */
  const timber = (c, beam, x0, x1, z0, z1, y0, y1) => (x, y, z) => {
    if (y === y0 || y === y1) return W(beam);
    const onZ = z === z0 || z === z1, onX = x === x0 || x === x1;
    if ((onZ && mod(x - x0, 4) === 0) || (onX && mod(z - z0, 4) === 0) || (onZ && onX)) return W(beam);
    const h = Math.min(y1, y0 + 9) - y0 - 1;
    if ((onZ || onX) && h >= 3 && y < y0 + 10) {
      const along = onZ ? x - x0 : z - z0, pi = Math.floor(along / 4), pu = mod(along, 4);
      const ud = 1 + Math.round(((y - y0 - 1) / Math.max(1, h - 1)) * 2);
      if (pi % 3 !== 1 && (pi % 2 ? 4 - pu : pu) === ud) return W(shade(beam, 1.06));
    }
    if (onZ && mod(x - x0, 4) === 2 && y === ((y0 + y1) >> 1)) return W(shade(beam, 1.1));
    return MT('plain', shade(c, 0.95 + 0.07 * hash(x, y, z)));
  };

  /** Solid block with a colour or a colour function. */
  function block(P, x0, y0, z0, x1, y1, z1, c) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) P.v.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
  }
  /** Dark corner posts and beams around a box (flush with the walls). */
  function frameBox(P, x0, z0, x1, z1, y0, y1, c) {
    const b = W(c || '#4a3020');
    for (let y = y0; y <= y1; y++) for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) P.v.set(x, y, z, b);
    for (let x = x0; x <= x1; x++) { P.v.set(x, y1, z0, b); P.v.set(x, y1, z1, b); P.v.set(x, y0, z0, b); P.v.set(x, y0, z1, b); }
    for (let z = z0; z <= z1; z++) { P.v.set(x0, y1, z, b); P.v.set(x1, y1, z, b); P.v.set(x0, y0, z, b); P.v.set(x1, y0, z, b); }
  }
  /**
   * Window in a wall facing +z (o.s = 1, default) or -z (o.s = -1): frame, cross mullions on big
   * windows, glass that lights up at night, a sill; optional open shutters and a flower box.
   */
  function winZ(P, x, y, z, w, h, o) {
    o = o || {};
    const s = o.s || 1, fr = W(o.frame || '#5a3a1e');
    for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) {
      const inside = i >= 0 && i < w && j >= 0 && j < h;
      const mull = inside && ((w >= 3 && i === (w >> 1)) || (h >= 3 && j === (h >> 1)));
      if (inside && !mull) lit(P, x + i, y + j, z, o.glass || GLASS);
      else P.v.set(x + i, y + j, z, fr);
    }
    for (let i = -1; i <= w; i++) P.v.set(x + i, y - 1, z + s, W(o.sill || shade(o.frame || '#5a3a1e', 1.15)));
    if (o.shutter) for (let j = 0; j < h; j++) {
      const c = W(shade(o.shutter, j & 1 ? 0.88 : 1));
      P.v.set(x - 2, y + j, z, c); P.v.set(x + w + 1, y + j, z, c);
      if (w >= 2) { P.v.set(x - 2, y + j, z + s, c); P.v.set(x + w + 1, y + j, z + s, c); }
    }
    if (o.flowers) for (let i = 0; i < w; i++) {
      P.v.set(x + i, y - 2, z + s, W('#6b4a2e'));
      P.v.set(x + i, y - 1, z + s * 2, MT('leaf', i % 2 ? o.flowers : '#4fa64a'));
    }
  }
  /** Window in a wall facing +x (s = 1) or -x (s = -1). */
  function winX(P, x, y, z, w, h, o) {
    o = o || {};
    const s = o.s || 1, fr = W(o.frame || '#5a3a1e');
    for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) {
      const inside = i >= 0 && i < w && j >= 0 && j < h;
      const mull = inside && ((w >= 3 && i === (w >> 1)) || (h >= 3 && j === (h >> 1)));
      if (inside && !mull) lit(P, x, y + j, z + i, o.glass || GLASS);
      else P.v.set(x, y + j, z + i, fr);
    }
    for (let i = -1; i <= w; i++) P.v.set(x + s, y - 1, z + i, W(shade(o.frame || '#5a3a1e', 1.15)));
    if (o.shutter) for (let j = 0; j < h; j++) { const c = W(shade(o.shutter, j & 1 ? 0.88 : 1)); P.v.set(x, y + j, z - 2, c); P.v.set(x, y + j, z + w + 1, c); }
  }
  /** Door in a wall facing +z: vertical boards, frame, iron bands, handle, a step in front. */
  function doorZ(P, x, y, z, w, h, o) {
    o = o || {};
    const c = o.c || '#6b4423', fr = W(o.frame || '#4a3020');
    for (let i = -1; i <= w; i++) for (let j = 0; j <= h; j++) {
      const inside = i >= 0 && i < w && j < h;
      if (inside) P.v.set(x + i, y + j, z, (j === 1 || j === h - 2) && o.bands !== false ? MT('metal', '#3a3634') : MT('plank', shade(c, (i & 1 ? 0.86 : 1) * (0.95 + 0.08 * hash(i, j, 3)))));
      else P.v.set(x + i, y + j, z, fr);
    }
    P.v.set(x + w - 1, y + (h >> 1), z + 1, MT('gold', o.knob || '#e0b04a'));
    if (o.step !== false && y === 0) for (let i = -1; i <= w; i++) P.v.set(x + i, 0, z + 1, MT('stone', '#9a948a'));
    else if (o.step !== false) for (let i = -1; i <= w; i++) P.v.set(x + i, y - 1, z + 1, MT('stone', '#9a948a'));
  }
  const tileOf = (c1, c2, m) => (row, a) => {
    const c = row & 1 ? c1 : c2;
    const ti = Math.floor((a + (row & 1)) / 2);
    return MT(m || 'roof', shade(c, (mod(a + (row & 1), 2) === 0 ? 0.9 : 1) * (0.92 + 0.14 * hash(ti, row, 13))));
  };
  /**
   * Gable roof over [x0..x1] x [z0..z1] from layer y. axis 'x' puts the ridge along x (the slopes face
   * ±z, toward the camera), 'z' puts a gable end toward the camera. o: { c1, c2, mat, over (eaves),
   * rise (layers per step), gable (colour fn for the gable walls), ridge, eave }. Returns the top layer.
   */
  function gable(P, x0, x1, z0, z1, y, axis, o) {
    const over = o.over === undefined ? 1 : o.over, rise = o.rise || 1;
    const along = axis !== 'z';
    const a0 = along ? x0 : z0, a1 = along ? x1 : z1, b0 = along ? z0 : x0, b1 = along ? z1 : x1;
    const put = (a, yy, b, c) => (along ? P.v.set(a, yy, b, c) : P.v.set(b, yy, a, c));
    const tile = tileOf(o.c1, o.c2 || shade(o.c1, 0.9), o.mat);
    const ridge = MT(o.mat || 'roof', o.ridge || shade(o.c1, 0.7));
    const eave = MT('wood', o.eave || shade(o.c1, 0.6));
    const gc = typeof o.gable === 'function' ? o.gable : (() => MT('plank', o.gable || '#8a5a32'));
    // bargeboards: the overhanging tiles at both gable ends are dark trim boards
    const barge = over > 0 && o.barge !== false ? MT('wood', o.barge || shade(o.c1, 0.5)) : null;
    let k = 0, topY = y;
    for (;; k++) {
      const ba = b0 - over + k, bb = b1 + over - k;
      if (ba > bb) break;
      const isRidge = ba >= bb - 1;
      for (let r = 0; r < rise; r++) {
        const yy = y + k * rise + r;
        topY = yy;
        for (let a = a0 - over; a <= a1 + over; a++) {
          const end = barge && (a === a0 - over || a === a1 + over);
          const t = isRidge ? ridge : end ? barge : (k === 0 && r === 0 && over > 0 ? eave : tile(k * rise + r, a));
          put(a, yy, ba, t); put(a, yy, bb, t);
          if (a >= a0 && a <= a1) for (let b = ba + 1; b < bb; b++) put(a, yy, b, (a === a0 || a === a1) ? (along ? gc(a, yy, b) : gc(b, yy, a)) : tile(0, a));
        }
      }
      if (isRidge) break;
    }
    return topY;
  }
  /** Hipped / pyramid roof (tiles on every side). */
  function hip(P, x0, x1, z0, z1, y, o) {
    const over = o.over === undefined ? 1 : o.over, rise = o.rise || 1;
    const tile = tileOf(o.c1, o.c2 || shade(o.c1, 0.9), o.mat);
    let k = 0, topY = y;
    for (;; k++) {
      const xa = x0 - over + k, xb = x1 + over - k, za = z0 - over + k, zb = z1 + over - k;
      if (xa > xb || za > zb) break;
      for (let r = 0; r < rise; r++) {
        const yy = y + k * rise + r;
        topY = yy;
        for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) {
          const edge = x === xa || x === xb || z === za || z === zb;
          const corner = (x === xa || x === xb) && (z === za || z === zb);
          P.v.set(x, yy, z, corner ? MT(o.mat || 'roof', o.ridge || shade(o.c1, 0.72)) : edge ? tile(k * rise + r, x + z) : tile(1, x));
        }
      }
    }
    return topY;
  }
  function chimney(P, x, z, y0, y1, c) {
    block(P, x, y0, z, x + 1, y1, z + 1, brick(c || '#9a5a46'));
    block(P, x - 1, y1 + 1, z - 1, x + 2, y1 + 1, z + 2, MT('stone', '#6e6e6a'));
    P.v.set(x, y1 + 1, z, MT('plain', '#1a1a1a')); P.v.set(x + 1, y1 + 1, z + 1, MT('plain', '#1a1a1a'));
    P.v.set(x + 1, y1 + 1, z, MT('plain', '#222')); P.v.set(x, y1 + 1, z + 1, MT('plain', '#222'));
    P.smoke.push([x + 1, y1 + 2, z + 1]);
    (P.chimneys || (P.chimneys = [])).push([x, z]);
  }
  /** Barrel 3x3 (or 2x2 when small) with iron hoops. */
  function barrel(P, x, y, z, c, small) {
    c = c || '#8a5a32';
    const n = small ? 2 : 3, hgt = small ? 3 : 4;
    for (let yy = 0; yy < hgt; yy++) for (let dx = 0; dx < n; dx++) for (let dz = 0; dz < n; dz++) {
      if (n === 3 && dx !== 1 && dz !== 1 && (yy === 0 || yy === hgt - 1)) continue;
      const hoop = yy === 1 || yy === hgt - 1 || (n === 3 && yy === 2 && false);
      P.v.set(x + dx, y + yy, z + dz, hoop ? MT('metal', '#4a4440') : MT('plank', shade(c, (dx + dz) & 1 ? 1 : 0.86)));
    }
    if (n === 3) P.v.set(x + 1, y + hgt - 1, z + 1, MT('wood', shade(c, 0.7)));
  }
  /** Crate with a darker frame. */
  function crate(P, x, y, z, n, c) {
    n = n || 3; c = c || '#a0703c';
    for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) for (let dz = 0; dz < n; dz++) {
      const e = (dx === 0 || dx === n - 1) + (dy === 0 || dy === n - 1) + (dz === 0 || dz === n - 1);
      P.v.set(x + dx, y + dy, z + dz, e >= 2 ? W(shade(c, 0.66)) : MT('plank', shade(c, (dx + dy + dz) & 1 ? 1 : 0.92)));
    }
  }
  function sack(P, x, y, z, c) {
    c = c || '#c9b07a';
    P.v.box(x, y, z, x + 1, y + 1, z + 1, MT('cloth', c)); P.v.set(x, y + 2, z, MT('cloth', shade(c, 0.85)));
    P.v.set(x + 1, y + 2, z + 1, MT('cloth', shade(c, 0.9)));
  }
  /** Lantern on a post of height h (h = 0: wall lantern): iron cap and base, lit glass. */
  function lamp(P, x, y, z, h, c) {
    for (let k = 0; k < h; k++) P.v.set(x, y + k, z, W('#3a2a1a'));
    P.v.set(x, y + h, z, MT('metal', '#2a2a2a'));
    lit(P, x, y + h + 1, z, c || LAMP);
    P.v.set(x, y + h + 2, z, MT('metal', '#2a2a2a'));
  }
  function torch(P, x, y, z, h) {
    for (let k = 0; k < h; k++) P.v.set(x, y + k, z, W('#6b4423'));
    lit(P, x, y + h, z, '#ff9a2a'); lit(P, x, y + h + 1, z, '#ffd23f');
  }
  /** Pole with a cloth flag extending toward -x; c2 draws a small cross/skull mark. */
  function flag(P, x, y0, z, h, w, fh, c, c2) {
    for (let k = 0; k <= h; k++) P.v.set(x, y0 + k, z, W('#5a3a1e'));
    P.v.set(x, y0 + h + 1, z, MT('gold', '#f0c03a'));
    const f = new Vox();
    const mi = Math.ceil(w / 2), mj = Math.floor(fh / 2);
    for (let i = 1; i <= w; i++) for (let j = 0; j < fh; j++) {
      const mark = c2 && ((i === mi && (j === mj || j === mj - 1)) || (j === mj && Math.abs(i - mi) === 1));
      f.set(x - i, y0 + h - j, z, MT('cloth', mark ? c2 : c));
    }
    P.cloth.push({ vox: f, fn: flagWeight(x, 0.016) });
    return f;
  }
  /** Hanging banner on a wall facing +z (cloth, gently swaying). */
  function banner(P, x, y, z, w, h, c, c2) {
    const f = new Vox();
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
      if (j === h - 1 && i === (w >> 1)) continue;
      const edge = i === 0 || i === w - 1;
      f.set(x + i, y - j, z, MT('cloth', c2 && (edge || j === 1) ? c2 : c));
    }
    for (let i = -1; i <= w; i++) P.v.set(x + i, y + 1, z, W('#4a3020'));
    P.cloth.push({ vox: f, fn: (vx, vy, vz, cx, cy) => [0, 0, 0.012 * Math.max(0, y + 1 - cy)] });
  }
  /** Striped cloth awning sloping down toward +z (s = 1) over [x0..x1], from z0 (at y) out to z1. */
  function awning(P, x0, x1, z0, z1, y, c1, c2) {
    const f = new Vox();
    const n = Math.abs(z1 - z0);
    for (let k = 0; k <= n; k++) {
      const z = z0 + Math.sign(z1 - z0) * k, yy = y - Math.floor(k / 2);
      for (let x = x0; x <= x1; x++) f.set(x, yy, z, MT('cloth', mod(x - x0, 4) < 2 ? c1 : c2));
      if (k === n) for (let x = x0; x <= x1; x++) if (mod(x - x0, 2) === 0) f.set(x, yy - 1, z, MT('cloth', mod(x - x0, 4) < 2 ? c1 : c2));
    }
    P.cloth.push({ vox: f, fn: (vx, vy, vz, cx, cy, cz) => [0, 0, 0.006 * Math.abs(cz - z0)] });
  }
  /** Fence between two points (inclusive) with posts every 3 and two rails. */
  function fence(P, x0, z0, x1, z1, y, c) {
    c = c || '#8a6238';
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), z = Math.round(z0 + (z1 - z0) * i / n);
      if (i % 3 === 0) { P.v.box(x, y, z, x, y + 3, z, W(shade(c, 0.8))); P.v.set(x, y + 4, z, W(shade(c, 0.7))); }
      P.v.set(x, y + 1, z, W(c)); P.v.set(x, y + 3, z, W(shade(c, 1.08)));
    }
  }
  /** Round emblem (coin, rosette) on a wall facing +z. */
  function seal(P, x, y, z, c) {
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      if (Math.abs(i) + Math.abs(j) > 3) continue;
      P.v.set(x + i, y + j, z, MT('gold', Math.abs(i) + Math.abs(j) === 3 || (i === 0 && j === 0) ? shade(c, 0.75) : c));
    }
  }
  /** Hanging shop sign on an iron bracket sticking out of a wall facing +z; `icon` draws on it. */
  function sign(P, x, y, z, c, icon) {
    for (let i = 0; i <= 3; i++) P.v.set(x, y, z + i, MT('metal', '#2a2a2a'));
    P.v.set(x, y - 1, z + 1, MT('metal', '#2a2a2a'));
    for (let j = 1; j <= 4; j++) for (let i = 1; i <= 3; i++) P.v.set(x, y - j, z + i, MT('plank', shade(c, j & 1 ? 1 : 0.9)));
    if (icon) icon.forEach(([dj, di, ic]) => { P.v.set(x + 1, y - dj, z + di, MT('plain', ic)); P.v.set(x - 1, y - dj, z + di, MT('plain', ic)); });
  }
  /** Coil of rope lying on the ground. */
  function rope(P, x, y, z) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) P.v.set(x + dx, y, z + dz, MT('cloth', (dx + dz) & 1 ? '#c8b48a' : '#b09a70'));
    P.v.set(x, y + 1, z + 1, MT('cloth', '#c8b48a'));
  }
  /** Small cannon on a carriage pointing +z. */
  function gun(P, x, y, z) {
    P.v.box(x - 1, y, z, x + 1, y, z + 2, W('#5a3a1e'));
    P.v.set(x - 1, y, z - 1, W('#3a2614')); P.v.set(x + 1, y, z - 1, W('#3a2614'));
    for (let k = -1; k <= 3; k++) P.v.set(x, y + 1, z + k, MT('metal', k === 3 ? '#1a1a1a' : '#2b2b2e'));
  }
  /** Keeps a part set inside the plot cell: voxels outside x/z in [lo, hi] are cut away. */
  function fitCell(P, lo, hi) {
    const clip = vox => {
      const out = new Vox();
      vox.each((x, y, z, c) => { if (x >= lo && x <= hi && z >= lo && z <= hi) out.set(x, y, z, c); });
      return out;
    };
    const inside = vox => vox.minX >= lo && vox.maxX <= hi && vox.minZ >= lo && vox.maxZ <= hi;
    if (!inside(P.v)) P.v = clip(P.v);
    if (P.g.count && !inside(P.g)) P.g = clip(P.g);
    P.cloth = P.cloth.map(c => (inside(c.vox) ? c : { vox: clip(c.vox), fn: c.fn })).filter(c => c.vox.count);
    P.smoke = P.smoke.filter(([x, , z]) => x >= lo && x <= hi + 1 && z >= lo && z <= hi + 1);
    return P;
  }

  // ------------------------------------------------------------------ buildings (footprint x,z in -7..6, door to +z)
  // Bodies stay in -7..6 (the 1.75-unit plot bed); eaves, signs and props may reach -8..7. Everything
  // outside is clipped (fitCell), so a building never reaches into the neighbouring plot.
  const BUILD = {
    hut(P) {
      const v = P.v;
      // plank platform on stilts
      block(P, -7, 2, -6, 3, 2, 4, (x, y, z) => MT('plank', shade('#9a6b3e', (x & 1 ? 0.9 : 1) * (0.94 + 0.1 * hash(x, z >> 2, 1)))));
      for (const [x, z] of [[-7, -6], [3, -6], [-7, 4], [3, 4], [-2, 4], [-2, -6]]) v.box(x, 0, z, x, 1, z, MT('bark', '#5a3a1e'));
      for (let x = -7; x <= 3; x++) v.set(x, 1, 4, W('#6b4423'));
      // shack of weathered vertical boards
      block(P, -6, 3, -5, 2, 9, 1, vplanks('#a87a4a'));
      frameBox(P, -6, -5, 2, 1, 3, 9, '#5a3a1e');
      doorZ(P, -5, 3, 1, 2, 5, { c: '#5a3a1e', step: false });
      winZ(P, -1, 5, 1, 2, 2, { shutter: '#3f7fae' });
      winX(P, 2, 5, -3, 2, 2, { shutter: '#3f7fae' });
      gable(P, -6, 2, -5, 1, 10, 'x', { c1: '#c9a24a', c2: '#b8913c', mat: 'thatch', over: 1, gable: vplanks('#9a6b3e'), ridge: '#8a6a2a' });
      // porch rail, ladder
      for (let x = -1; x <= 3; x += 2) v.box(x, 3, 4, x, 4, 4, W('#6b4423'));
      for (let x = -1; x <= 3; x++) v.set(x, 5, 4, W('#8a6238'));
      for (let y = 0; y <= 2; y++) { v.set(-6, y, 5, W('#7a5530')); v.set(-4, y, 5, W('#7a5530')); if (y !== 2) v.set(-5, y, 5, W('#9a7044')); }
      // drying net on poles, hanging fish
      v.box(5, 0, -5, 5, 10, -5, MT('bark', '#6b4a2e')); v.box(5, 0, 3, 5, 10, 3, MT('bark', '#6b4a2e'));
      v.box(5, 10, -4, 5, 10, 2, W('#6b4a2e'));
      for (let z = -4; z <= 2; z++) for (let y = 3; y <= 9; y++) if ((y + z) % 2 === 0) v.set(5, y - (Math.abs(z + 1) < 2 && y < 5 ? 1 : 0), z, MT('cloth', '#d8d0b0'));
      v.set(5, 6, -1, MT('plain', '#9ab8c8')); v.set(5, 5, 1, MT('plain', '#c87a3a')); v.set(5, 7, -3, MT('cloth', '#e8b04a'));
      for (const z of [-4, -2, 0]) { v.set(3, 8, z, MT('metal', '#9ab8c8')); v.set(3, 7, z, MT('metal', '#b8c8d0')); }
      // rowboat pulled up in front
      for (let x = 0; x <= 6; x++) {
        const w = x === 0 || x === 6 ? 0 : 1;
        for (let z = 5 - w; z <= 5 + w; z++) v.set(x, 0, z, MT('plank', '#2f6bc0'));
        if (w) { v.set(x, 1, 4, MT('plank', '#2f6bc0')); v.set(x, 1, 6, MT('plank', '#2f6bc0')); v.set(x, 1, 5, MT('plank', '#8a5a32')); }
      }
      v.set(0, 1, 5, MT('plank', '#e9e3d2')); v.set(6, 1, 5, MT('plank', '#e9e3d2')); v.set(6, 2, 5, MT('plank', '#e9e3d2'));
      v.line(2, 2, 5, 5, 3, 3, W('#c8a26a'));
      // barrel and crab trap on the porch, lantern by the door
      barrel(P, 0, 3, 2, '#8a5a32', true); crate(P, -7, 0, 5, 2, '#9a7a50');
      lamp(P, -2, 7, 2, 0);
      rope(P, -5, 3, 3);
    },
    grove(P) {
      const v = P.v;
      for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) {
        const h = hash(x, 0, z);
        if (h < 0.14) v.set(x, 0, z, MT('grass', hash(z, 1, x) < 0.5 ? '#4fa64a' : '#6cc251'));
        else if (h < 0.2) v.set(x, 0, z, MT('dirt', '#7a5a3a'));
      }
      // compact palms: their crowns stay inside the plot
      [[palmHD(19, 11, 6), -4, -4], [palmHD(15, 12, 5), 2, -3], [palmHD(13, 13, 5), -3, 2]].forEach(([p, ox, oz]) => v.paste(p, ox, 0, oz));
      // hammock between two trunks
      const hm = new Vox();
      for (let k = 0; k <= 6; k++) {
        const x = -3 + k, z = -4 + Math.round(k * 0.17), y = 6 - Math.round(Math.sin(k / 6 * Math.PI) * 2);
        for (let w = 0; w <= 1; w++) hm.set(x, y, z + w, MT('cloth', k % 2 ? '#c8323a' : '#f2efe6'));
      }
      P.cloth.push({ vox: hm, fn: (x, y, z, cx) => [0, 0, 0.02 * Math.sin(Math.PI * Math.max(0, Math.min(1, (cx + 3) / 7)))] });
      // coconut pile, baskets, a sign
      for (const [x, z, y] of [[2, 2, 0], [3, 2, 0], [2, 3, 0], [3, 3, 0], [2, 2, 1], [4, 2, 0], [3, 3, 1]]) v.set(x, y, z, W(y ? '#5a3a1e' : '#6b4a2e'));
      for (const [bx, bz] of [[-1, 4], [4, 5]]) {
        for (let dx = 0; dx <= 2; dx++) for (let dz = 0; dz <= 1; dz++) for (let y = 0; y <= 1; y++) v.set(bx + dx, y, bz + dz, MT('thatch', (dx + y) & 1 ? '#c9a24a' : '#b8913c'));
        v.set(bx + 1, 2, bz, W('#6b4a2e')); v.set(bx, 2, bz + 1, MT('leaf', '#ffd23f'));
      }
      v.box(5, 0, 1, 5, 4, 1, W('#6b4423')); v.box(4, 4, 1, 6, 5, 1, MT('plank', '#c8a26a')); v.set(5, 5, 2, MT('plain', '#3f8f3a'));
      // tall grass and ferns between the trunks
      for (const [x, z] of [[-6, 0], [-5, 5], [0, -6], [5, -6], [6, -2], [-1, -1], [4, 0]]) {
        for (let y = 0; y <= 1 + ((x + z) & 1); y++) v.set(x, y, z, MT('leaf', y ? '#5cb84f' : '#3f8f3a'));
        v.set(x + 1, 0, z, MT('leaf', '#4fa64a')); v.set(x, 0, z + 1, MT('leaf', '#4fa64a'));
      }
      v.line(-6, 0, -1, -5, 9, -3, W('#8a6238'));
      for (let y = 2; y <= 8; y += 2) v.set(-6 + (y > 5 ? 1 : 0), y, -1 - Math.round(y / 4.5), W('#a07a4a'));
    },
    smoke(P) {
      const v = P.v;
      block(P, -6, 0, -5, 3, 3, 1, stone('#8c8c88'));
      block(P, -6, 4, -5, 3, 9, 1, planks('#8a5a32'));
      frameBox(P, -6, -5, 3, 1, 4, 9, '#4a3020');
      gable(P, -6, 3, -5, 1, 10, 'x', { c1: '#5e4c44', c2: '#4e3e38', over: 1, gable: planks('#7a4a2a') });
      chimney(P, 1, -4, 4, 21, '#7e6e66');
      block(P, -4, 12, -3, -3, 15, -2, stone('#7e7e7a')); P.v.set(-4, 16, -3, MT('metal', '#2a2a2a')); P.smoke.push([-3, 17, -2]);
      doorZ(P, -5, 0, 1, 2, 4, { c: '#4a3020' });
      // fire hatch glowing under the smoking chamber
      for (let x = -1; x <= 1; x++) { lit(P, x, 1, 1, x === 0 ? '#ffb13a' : '#ff7a2a'); v.set(x, 2, 1, MT('metal', '#2a2a2a')); }
      v.set(-2, 1, 1, MT('metal', '#3a3a3a')); v.set(2, 1, 1, MT('metal', '#3a3a3a'));
      winZ(P, -2, 6, 1, 3, 2, { glass: '#ff9a4a', frame: '#4a3020' });
      // fish drying rack in front
      v.box(-6, 0, 4, -6, 7, 4, MT('bark', '#6b4a2e')); v.box(4, 0, 4, 4, 7, 4, MT('bark', '#6b4a2e')); v.box(-6, 7, 4, 4, 7, 4, W('#6b4a2e'));
      for (let x = -5; x <= 3; x += 2) { v.set(x, 6, 4, MT('plain', '#c8783a')); v.set(x, 5, 4, MT('plain', '#d88a4a')); v.set(x, 4, 4, MT('plain', '#b8682a')); v.set(x, 3, 4, MT('plain', '#a85a20')); }
      // firewood stack: bark sides, pale cut ends
      for (let z = -5; z <= 0; z++) for (let y = 0; y < 4; y++) for (let x = 5; x <= 6; x++) v.set(x, y, z, x === 6 ? MT('wood', (y + z) & 1 ? '#d8b078' : '#c89a60') : MT('bark', '#6b4423'));
      v.box(5, 0, -6, 6, 4, -6, MT('bark', '#5a3a1e')); v.box(5, 0, 1, 6, 4, 1, MT('bark', '#5a3a1e'));
      barrel(P, -7, 0, 2, '#7a4a2a');
      // stump with an axe
      v.box(2, 0, 3, 3, 1, 3, MT('bark', '#6b4a2e')); v.set(2, 2, 3, MT('metal', '#9a9a96')); v.set(3, 2, 3, W('#8a6238')); v.set(3, 3, 3, W('#8a6238'));
    },
    tavern(P) {
      const v = P.v;
      block(P, -6, 0, -5, 5, 6, 2, stone('#b8ad98'));
      // the upper floor juts out over the street on beams
      for (let x = -6; x <= 5; x += 3) v.set(x, 6, 3, W('#4a3020'));
      block(P, -7, 7, -6, 6, 13, 3, timber('#efe3c4', '#5a3a1e', -7, 6, -6, 3, 7, 13));
      const ry = gable(P, -7, 6, -6, 3, 14, 'x', { c1: '#b8402e', c2: '#9a3326', over: 1, gable: timber('#efe3c4', '#5a3a1e', -7, 6, -6, 3, 7, 30) });
      chimney(P, -5, -4, 14, ry + 2, '#9a5a46');
      // dormer with its own little roof
      block(P, 0, 16, 0, 3, 18, 2, plaster('#efe3c4'));
      winZ(P, 1, 16, 2, 2, 2, { frame: '#5a3a1e' });
      gable(P, 0, 3, 0, 2, 19, 'z', { c1: '#b8402e', c2: '#9a3326', over: 1, gable: plaster('#efe3c4') });
      // front: double door under a striped awning, windows with shutters and flower boxes
      doorZ(P, -1, 0, 2, 3, 5, { c: '#7a4a2a' });
      awning(P, -3, 3, 3, 5, 6, '#8a2a20', '#efe3c4');
      winZ(P, -5, 2, 2, 2, 3, { frame: '#5a3a1e' }); winZ(P, 3, 2, 2, 2, 3, { frame: '#5a3a1e' });
      for (const x of [-5, -1, 3]) winZ(P, x, 9, 3, 2, 3, { frame: '#5a3a1e', shutter: '#2f7a46', flowers: '#ff6fa8' });
      // hanging sign with a mug
      sign(P, 6, 11, 4, '#7a5530', [[2, 2, '#f0c03a'], [3, 2, '#f0c03a'], [2, 1, '#fff4d0']]);
      barrel(P, -7, 0, 4); barrel(P, -7, 4, 4, '#7a4a2a', true);
      v.box(3, 1, 5, 6, 1, 6, W('#8a5a32')); v.set(3, 0, 5, W('#5a3a1e')); v.set(6, 0, 6, W('#5a3a1e')); v.set(3, 0, 6, W('#5a3a1e')); v.set(6, 0, 5, W('#5a3a1e'));
      v.set(4, 2, 5, MT('metal', '#c8a050')); v.set(5, 2, 6, MT('glass', '#3a7a3a'));
      lamp(P, -3, 4, 3, 0); lamp(P, 3, 4, 3, 0);
    },
    fort(P) {
      const v = P.v;
      const st = stone('#9a9a96');
      for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) {
        const wall = x <= -6 || x >= 5 || z <= -6 || z >= 5;
        if (!wall) { v.set(x, 0, z, cobble('#8a857a')(x, 0, z)); continue; }
        for (let y = 0; y <= 5; y++) v.set(x, y, z, st(x, y, z));
        const outerEdge = x === -7 || x === 6 || z === -7 || z === 6;
        if (outerEdge && mod(x + z, 3) !== 0) v.set(x, 6, z, MT('stone', '#a8a8a2'));
      }
      // corner towers
      for (const [x, z] of [[-7, -7], [4, -7], [-7, 4], [4, 4]]) {
        block(P, x, 0, z, x + 2, 9, z + 2, stone('#a8a8a4'));
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) v.set(x + i, 10, z + j, MT('stone', '#8a8a86'));
        v.set(x + 1, 6, z + (z > 0 ? 2 : 0), MT('plain', '#1a1a1a'));
      }
      // keep with arrow slits and a flag
      block(P, -3, 0, -4, 2, 13, 1, stone('#b0aea8'));
      for (let x = -3; x <= 2; x++) for (let z = -4; z <= 1; z++) if ((x === -3 || x === 2 || z === -4 || z === 1) && mod(x + z, 2) === 0) v.set(x, 14, z, MT('stone', '#8a8a86'));
      for (const x of [-2, 1]) for (let y = 7; y <= 9; y++) v.set(x, y, 1, MT('plain', '#1a1a1a'));
      winZ(P, -1, 10, 1, 2, 2, { frame: '#6e6e6a', glass: LAMP });
      flag(P, 0, 14, -2, 9, 7, 5, '#111111', '#ffffff');
      // gate with studded doors and an arch
      for (let x = -2; x <= 1; x++) for (let y = 0; y <= 4; y++) {
        const arch = y === 4 && (x === -2 || x === 1);
        v.set(x, y, 6, arch ? MT('stone', '#9a9a96') : MT('plank', (x + y) % 3 === 0 ? '#3a3634' : (x & 1 ? '#5a3a1e' : '#4a3020')));
      }
      v.box(-3, 5, 7, 2, 5, 7, MT('stone', '#8a8a86'));
      banner(P, -6, 5, 7, 2, 4, '#1d4f91', '#f0c03a'); banner(P, 4, 5, 7, 2, 4, '#1d4f91', '#f0c03a');
      // cannons on the walls
      for (const x of [-5, 3]) { v.set(x, 6, 5, W('#5a3a1e')); v.set(x, 6, 6, MT('metal', '#2a2a2a')); v.set(x, 6, 7, MT('metal', '#1a1a1a')); }
      gun(P, -1, 6, -6);
      torch(P, -3, 5, 7, 1); torch(P, 2, 5, 7, 1);
      for (const [x, z, y] of [[-5, -1, 1], [-4, -1, 1], [-5, 0, 1], [-4, 0, 1], [-5, -1, 2]]) v.set(x, y, z, MT('metal', '#2a2a2a'));
      crate(P, 3, 1, -4, 2); barrel(P, -5, 1, 2, '#7a4a2a', true);
    },
    distill(P) {
      const v = P.v;
      // brick still house
      block(P, -7, 0, -7, -1, 8, -1, brick('#a8503a'));
      frameBox(P, -7, -7, -1, -1, 0, 8, '#6e6e6a');
      gable(P, -7, -1, -7, -1, 9, 'z', { c1: '#5a3a26', c2: '#4a2e1e', over: 1, gable: brick('#a8503a') });
      chimney(P, -6, -6, 9, 18, '#7a4a3a');
      winZ(P, -5, 3, -1, 3, 3, { glass: '#ffb15a', frame: '#4a3020' });
      doorZ(P, -3, 0, -1, 2, 5, { c: '#5a3a1e' });
      // open shed with a lean-to roof
      for (const [x, z] of [[0, -7], [6, -7], [0, -3], [6, -3]]) v.box(x, 0, z, x, 7 + (z < -4 ? 1 : 0), z, W('#5a3a1e'));
      for (let k = 0; k < 6; k++) for (let x = 0; x <= 7; x++) v.set(x, 9 - (k >> 1), -7 + k, tileOf('#6b4a2e', '#5a3a1e', 'plank')(k, x));
      for (let x = 1; x <= 5; x += 2) barrel(P, x - 1, 0, -6, x === 3 ? '#7a4a2a' : '#8a5a32');
      // copper pot still on a fire box, swan neck into the condenser
      block(P, -6, 0, 1, -2, 2, 5, brick('#8a4030'));
      lit(P, -4, 1, 5, '#ff6a2a'); lit(P, -3, 1, 5, '#ffb13a'); lit(P, -5, 1, 5, '#ff8a2a');
      // pot: a riveted copper drum with a domed helmet, then the swan neck down to a wooden
      // condenser tub with the copper worm coiling inside it
      const copper = y => MT('metal', y % 3 === 0 ? '#b8622e' : y > 6 ? '#e88a4a' : '#d0743a');
      v.cyl(-4, 3, 3, 2.4, 6, (x, y) => copper(y));
      v.ball(-4, 7, 3, 2.4, 2, 2.4, (x, y) => MT('metal', y > 8 ? '#f0a060' : '#e0884a'), (x, y) => y >= 7);
      v.box(-4, 9, 3, -4, 11, 3, MT('metal', '#e0884a')); v.set(-4, 12, 3, MT('metal', '#c8703a'));
      v.line(-4, 12, 3, 1, 9, 3, MT('metal', '#e0884a'));
      v.cyl(2, 0, 3, 1.6, 7, (x, y) => MT('plank', y === 1 || y === 6 ? '#4a4440' : '#8a5a32'));
      for (let y = 8; y <= 9; y++) { const a = y * 1.7; v.set(2 + Math.round(Math.cos(a) * 1.4), y, 3 + Math.round(Math.sin(a) * 1.4), MT('metal', '#f0a060')); }
      v.set(1, 9, 3, MT('metal', '#e0884a')); v.set(3, 1, 5, MT('metal', '#c8703a')); v.set(3, 0, 5, MT('metal', '#c8703a'));
      barrel(P, 1, 0, 5, '#7a4a2a', true);
      // stacked rum barrels and a crate of bottles
      barrel(P, 4, 0, 0); barrel(P, 4, 0, 3, '#7a4a2a'); barrel(P, 4, 4, 1, '#8a5a32');
      crate(P, -7, 0, 4, 3, '#a07a4a');
      for (const [x, c] of [[-7, '#3a7a3a'], [-6, '#7a3a2a'], [-5, '#3a7a3a']]) { v.set(x, 3, 5, MT('glass', c)); v.set(x, 4, 5, MT('glass', c)); v.set(x, 5, 5, W('#c8a26a')); }
      sign(P, -1, 8, 0, '#c8a26a', [[2, 2, '#3a7a3a'], [3, 2, '#3a7a3a'], [2, 1, '#3a7a3a']]);
      lamp(P, -1, 5, -1, 0);
    },
    sugar(P) {
      const v = P.v;
      // tilled rows of tall cane
      for (let x = -7; x <= 1; x++) for (let z = -7; z <= 3; z++) v.set(x, 0, z, MT('dirt', z % 3 === 1 ? '#6b4a2e' : '#7a5a3a'));
      for (const z of [-6, -3, 0, 3]) for (let x = -7; x <= 1; x++) {
        if (hash(x, 3, z) < 0.12) continue;
        const h = 9 + Math.floor(hash(x, 1, z) * 6);
        // jointed stalks (dark nodes), arching leaves, a few silvery plumes
        for (let y = 1; y < h; y++) v.set(x, y, z, MT('bark', y % 3 === 0 ? '#5a7a2a' : y < h - 3 ? '#8aa848' : '#6f9a3a'));
        v.set(x, h, z, MT('leaf', hash(x, 7, z) < 0.25 ? '#e0dcc0' : '#5f9a3a'));
        v.set(x, h - 1, z + (x & 1 ? 1 : -1), MT('leaf', '#4f8a32'));
        v.set(x, h - 3, z + (x & 1 ? -1 : 1), MT('leaf', '#5a9a3a'));
        if (x % 2 === 0) v.set(x + 1, h - 3, z, MT('leaf', '#68a840'));
      }
      // press shed with a thatched roof
      block(P, 2, 0, -7, 6, 5, -3, vplanks('#a0703c'));
      frameBox(P, 2, -7, 6, -3, 0, 5, '#5a3a1e');
      gable(P, 2, 6, -7, -3, 6, 'z', { c1: '#c9a24a', c2: '#b8913c', mat: 'thatch', over: 1, gable: vplanks('#9a6b3e') });
      winZ(P, 3, 2, -3, 2, 2, { shutter: '#6b4a2e' });
      doorZ(P, 5, 0, -3, 1, 4, { c: '#5a3a1e', step: false });
      // round stone mill turned by a beam
      v.cyl(4, 0, 2, 2.4, 1, stone('#9a9a96'));
      v.cyl(4, 2, 2, 1.4, 2, MT('stone', '#7a7a76'));
      v.box(4, 3, 2, 4, 6, 2, W('#6b4423'));
      v.line(4, 5, 2, -1, 4, 5, W('#6b4423'));
      // cart with cane bundles, sacks of sugar
      v.box(-6, 1, 5, -2, 1, 6, W('#8a5a32'));
      for (const x of [-6, -2]) { v.box(x, 0, 4, x, 1, 4, W('#3a2614')); v.box(x, 0, 7, x, 1, 7, W('#3a2614')); }
      for (let x = -6; x <= -2; x++) v.set(x, 2, x & 1 ? 5 : 6, MT('leaf', '#a8c858'));
      v.line(-1, 1, 5, 1, 0, 6, W('#6b4423'));
      sack(P, 1, 0, 4, '#f2efe6'); sack(P, 3, 0, 5, '#f2efe6'); sack(P, 5, 0, 5, '#e8e0d0');
    },
    market(P) {
      const v = P.v;
      for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) v.set(x, 0, z, cobble('#b5ab9c')(x, 0, z));
      const stall = (x0, z0, c1, c2, goods) => {
        for (const [dx, dz] of [[0, 0], [5, 0], [0, 4], [5, 4]]) v.box(x0 + dx, 1, z0 + dz, x0 + dx, 7 + (dz ? 0 : 1), z0 + dz, W('#6b4a2e'));
        // counter with goods and a cloth canopy
        block(P, x0, 1, z0 + 3, x0 + 5, 3, z0 + 3, planks('#a0703c'));
        goods.forEach((c, i) => {
          v.set(x0 + i, 4, z0 + 3, MT('plain', c));
          if (i % 2 === 0) v.set(x0 + i, 5, z0 + 3, MT('plain', shade(c, 1.1)));
          v.set(x0 + i, 4, z0 + 2, MT('plain', shade(c, 0.92)));
        });
        const f = new Vox();
        for (let x = x0 - 1; x <= x0 + 6; x++) for (let z = z0 - 1; z <= z0 + 5; z++) {
          const y = 9 - Math.floor((z - z0 + 1) / 3);
          f.set(x, y, z, MT('cloth', mod(x - x0, 2) ? c1 : c2));
          if (z === z0 + 5 && mod(x - x0, 2) === 0) f.set(x, y - 1, z, MT('cloth', c1));
        }
        P.cloth.push({ vox: f, fn: (vx, vy, vz, cx, cy, cz) => [0, 0, 0.004 * Math.max(0, cz - z0)] });
        crate(P, x0 + 1, 1, z0, 2, '#8a5a32');
      };
      stall(-7, -7, '#c8323a', '#f2efe6', ['#ff7b3a', '#ffd23f', '#3cb043', '#ff7b3a', '#e2553a', '#ffd23f']);
      stall(0, -7, '#3a7bd5', '#f2efe6', ['#9ab8c8', '#c8d8e0', '#9ab8c8', '#c8783a', '#9ab8c8', '#c8d8e0']);
      stall(-4, 0, '#f0c03a', '#7a3fb0', ['#c8323a', '#3a7bd5', '#f0c03a', '#7a3fb0', '#3cb043', '#c8323a']);
      crate(P, 3, 1, 1, 3); crate(P, 3, 4, 2, 2, '#8a5a32'); sack(P, 4, 1, 5); sack(P, -7, 1, 5); sack(P, -6, 1, 3, '#b8985a');
      barrel(P, 4, 1, -2, '#8a5a32', true);
      lamp(P, 0, 1, 6, 6);
      flag(P, 6, 1, 6, 11, 5, 3, '#7a3fb0', '#f0c03a');
    },
    yard(P) {
      const v = P.v;
      // slipway sloping toward the sea (+z)
      for (let z = -7; z <= 6; z++) for (let x = -5; x <= 3; x++) v.set(x, Math.max(0, Math.floor((2 - z) / 4)), z, MT('plank', shade('#8a5a32', mod(z + (x >> 1), 3) ? 1 : 0.86)));
      for (let z = -7; z <= 6; z += 3) { v.set(-5, Math.max(0, Math.floor((2 - z) / 4)) + 1, z, W('#5a3a1e')); v.set(3, Math.max(0, Math.floor((2 - z) / 4)) + 1, z, W('#5a3a1e')); }
      // keel, stem and ribs of a hull being built; the lower strakes are already planked
      v.box(-1, 3, -6, -1, 3, 5, W('#5a3a1e'));
      v.line(-1, 3, 5, -1, 10, 7, W('#5a3a1e'));
      for (let z = -5; z <= 4; z += 2) {
        const w = 4 - Math.abs(z + 0.5) * 0.3;
        for (let a = 0; a <= 10; a++) {
          const t = a / 10 * Math.PI;
          const x = -1 + Math.round(Math.cos(t) * w), y = 3 + Math.round(Math.sin(t) * 6);
          v.set(x, y, z, MT('wood', '#c8a26a'));
          if (y <= 5 && z < 3) { v.set(x, y, z + 1, MT('plank', '#a87a48')); }
        }
      }
      // scaffold along the side
      for (const z of [-6, -2, 2]) v.box(-6, 0, z, -6, 9, z, W('#7a5530'));
      v.box(-6, 6, -6, -6, 6, 2, MT('plank', '#9a7044'));
      // wooden crane with a beam on the rope
      v.box(5, 0, -6, 5, 17, -6, W('#6b4423')); v.box(4, 0, -7, 6, 1, -5, W('#5a3a1e'));
      v.line(5, 17, -6, -1, 16, -2, W('#6b4423')); v.line(5, 12, -6, 2, 16, -4, W('#6b4423'));
      v.line(-1, 16, -2, -1, 11, -2, MT('cloth', '#d8d0b0')); v.box(-4, 10, -2, 2, 10, -2, MT('plank', '#8a5a32'));
      // timber stack, saw horse, anchor, rope
      for (let y = 0; y < 3; y++) v.box(4, y, -3 + y, 6, y, 5, MT('plank', y % 2 ? '#a0703c' : '#8a5a32'));
      for (let z = -3; z <= 5; z += 2) v.set(6, 0, z, MT('wood', '#d8b078'));
      v.box(-7, 0, 3, -7, 3, 3, MT('metal', '#3a3a3a')); v.box(-7, 0, 2, -7, 1, 2, MT('metal', '#3a3a3a')); v.box(-7, 0, 4, -7, 1, 4, MT('metal', '#3a3a3a')); v.box(-7, 3, 2, -7, 3, 4, MT('metal', '#3a3a3a'));
      rope(P, -6, 0, 5);
      barrel(P, -7, 0, -5, '#8a5a32', true); torch(P, 3, 0, 6, 5);
    },
    mine(P) {
      const v = P.v;
      const rc = (x, y, z) => {
        const h = hash(x, y, z);
        if (h < 0.06) return MT('gold', '#ffd23f');
        if (y > 9 && h < 0.45) return MT('grass', '#6f9a4a');
        return rockC(h < 0.4 ? '#7a7a76' : h < 0.75 ? '#8a8a86' : '#6e6e6a')(x, y, z);
      };
      v.ball(-1, 0, -2.5, 7.4, 10, 5, rc, (x, y) => y >= 0);
      v.ball(3.5, 0, -3.5, 3.4, 7, 3.4, rc, (x, y) => y >= 0);
      v.ball(-4.5, 0, -4, 3.2, 12, 3.2, rc, (x, y) => y >= 0);
      for (let k = 0; k < 8; k++) lit(P, Math.round(-5 + k * 1.4), 2 + (k % 3) * 3, Math.round(1.5 - (k % 3)), '#ffd23f');
      // timbered tunnel entrance
      block(P, -3, 0, 0, 1, 5, 3, MT('plain', '#120e0a'));
      for (const x of [-4, 2]) v.box(x, 0, 3, x, 6, 3, MT('bark', '#6b4423'));
      v.box(-4, 6, 3, 2, 6, 3, W('#6b4423')); v.box(-4, 7, 4, 2, 7, 4, W('#5a3a1e'));
      v.box(-2, 8, 4, 0, 9, 4, MT('plank', '#c8a26a')); v.set(-1, 9, 5, MT('gold', '#ffd23f'));
      // rails and an ore cart
      for (let z = 1; z <= 7; z++) { v.set(-2, 0, z, MT('metal', '#5a5a5a')); v.set(0, 0, z, MT('metal', '#5a5a5a')); if (z % 2) v.box(-3, 0, z, 1, 0, z, W('#6b4423')); }
      block(P, -3, 1, 4, 1, 3, 6, (x, y, z) => MT('metal', (y === 3 || x === -3 || x === 1) ? '#5a5a5e' : '#6a6a6e'));
      for (const [x, z] of [[-3, 4], [1, 4], [-3, 6], [1, 6]]) v.set(x, 1, z, MT('metal', '#2a2a2a'));
      v.box(-2, 4, 4, 0, 4, 6, MT('gold', '#ffd23f')); v.set(-1, 5, 5, MT('gold', '#fff2a0')); v.set(0, 5, 4, MT('gold', '#e0a020'));
      lamp(P, -4, 7, 4, 0); lamp(P, 2, 7, 4, 0);
      // headframe winch tower on top
      v.line(-3, 9, -3, -1, 17, -3, W('#6b4423')); v.line(1, 9, -3, -1, 17, -3, W('#6b4423'));
      v.box(-2, 16, -3, 0, 16, -3, W('#5a3a1e'));
      for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; v.set(-1 + Math.round(Math.cos(t) * 1.6), 18 + Math.round(Math.sin(t) * 1.6), -2, W(a % 2 ? '#8a6238' : '#6b4423')); }
      v.line(-1, 16, -2, -1, 10, -1, MT('cloth', '#d8d0b0'));
      // pickaxe and sacks
      v.line(4, 0, 4, 6, 3, 3, W('#8a6238')); v.box(5, 3, 2, 6, 3, 2, MT('metal', '#9a9a96')); v.set(4, 3, 2, MT('metal', '#9a9a96'));
      sack(P, 4, 0, 0, '#b8985a'); sack(P, 5, 0, 5);
    },
    mint(P) {
      const v = P.v;
      block(P, -7, 0, -7, 6, 0, 6, stone('#cfc8b8'));
      for (let s = 0; s < 3; s++) block(P, -3, s, 6 - s, 2, s, 6 - s, MT('stone', s % 2 ? '#e2dccc' : '#d6cfbe'));
      block(P, -6, 1, -6, 5, 1, 4, stone('#ddd6c6'));
      block(P, -6, 2, -6, 5, 11, 1, stone('#ece6d8'));
      // columns with bases and capitals in front of the wall
      for (const x of [-6, -3, 1, 4]) {
        for (let y = 2; y <= 10; y++) { v.set(x, y, 3, MT('stone', y % 2 ? '#f8f4ea' : '#f0ebe0')); v.set(x + 1, y, 3, MT('stone', '#e8e2d4')); }
        v.box(x - 0, 2, 4, x + 1, 2, 4, MT('stone', '#ddd6c6')); v.box(x, 11, 4, x + 1, 11, 4, MT('stone', '#ddd6c6'));
      }
      block(P, -7, 12, -7, 6, 12, 4, MT('stone', '#ddd6c6'));
      for (let x = -7; x <= 6; x += 2) v.set(x, 12, 5, MT('gold', '#e0b04a'));
      // pediment with the golden coin
      for (let k = 0; k < 7; k++) {
        v.box(-7 + k, 13 + k, 4, 6 - k, 13 + k, 4, MT('stone', k === 0 ? '#ddd6c6' : '#ece6d8'));
        v.box(-7 + k, 13 + k, -7, 6 - k, 13 + k, 3, tileOf('#b8b0a0', '#a8a090', 'roof')(k, 0));
      }
      seal(P, 0, 15, 5, '#ffd23f');
      doorZ(P, -1, 2, 2, 2, 6, { c: '#b8862a', frame: '#a8a090', knob: '#fff2a0', step: false });
      winZ(P, -5, 5, 2, 2, 3, { frame: '#a8a090' }); winZ(P, 3, 5, 2, 2, 3, { frame: '#a8a090' });
      chimney(P, 3, -5, 13, 19, '#9a8a7a');
      // gold coin stacks by the steps, lanterns
      for (const [x, h] of [[-7, 3], [-6, 4], [5, 3], [6, 2]]) for (let y = 1; y <= h; y++) v.set(x, y, 5, MT('gold', y % 2 ? '#ffd23f' : '#e0a020'));
      lamp(P, -3, 8, 4, 0); lamp(P, 2, 8, 4, 0);
    },
    light(P) {
      const v = P.v;
      // rocks at the foot
      for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) if (hash(x, 2, z) < 0.12) v.set(x, 0, z, rockC('#8a8a86')(x, 0, z));
      // keeper's cottage at the back
      block(P, -7, 0, -7, -2, 5, -3, stone('#e8e4da'));
      gable(P, -7, -2, -7, -3, 6, 'x', { c1: '#c8323a', c2: '#a82830', over: 1, gable: stone('#e8e4da') });
      winZ(P, -6, 2, -3, 2, 2, { frame: '#6e6e6a', shutter: '#3a7bd5' });
      chimney(P, -6, -6, 6, 11, '#8a8a86');
      // tapering striped tower with windows
      for (let y = 0; y <= 27; y++) {
        const r = 3.7 - y * 0.05;
        const band = Math.floor(y / 4) % 2;
        v.cyl(1.5, y, 1.5, r, y, (x, yy, z) => MT('stone', shade(band ? '#f2efe6' : '#c8323a', 0.95 + 0.08 * hash(x, yy >> 1, z))));
      }
      doorZ(P, 1, 0, 5, 2, 4, { c: '#5a3a1e', frame: '#8a8a86' });
      for (const y of [9, 17]) winZ(P, 1, y, 4, 2, 2, { frame: '#6e6e6a' });
      winX(P, 4, 13, 1, 1, 2, { frame: '#6e6e6a' });
      // gallery with a railing, lantern room, roof and vane
      v.cyl(1.5, 28, 1.5, 3.8, 28, MT('metal', '#2a2a2a'));
      for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; v.set(1.5 + Math.cos(t) * 3.7, 29, 1.5 + Math.sin(t) * 3.7, MT('metal', a % 2 ? '#2a2a2a' : '#4a4a4a')); v.set(1.5 + Math.cos(t) * 3.7, 30, 1.5 + Math.sin(t) * 3.7, MT('metal', '#2a2a2a')); }
      for (let y = 29; y <= 32; y++) for (let x = 0; x <= 3; x++) for (let z = 0; z <= 3; z++) {
        const corner = (x === 0 || x === 3) && (z === 0 || z === 3);
        if (corner) v.set(x, y, z, MT('metal', '#2a2a2a')); else P.g.set(x, y, z, MT('glass', y === 30 || y === 31 ? '#fff6b0' : LAMP));
      }
      v.cyl(1.5, 33, 1.5, 2.6, 35, MT('metal', '#c8323a'), 0.4);
      v.set(1, 36, 1, MT('gold', '#f0c03a')); v.set(1, 37, 1, MT('gold', '#f0c03a')); v.box(0, 38, 1, 2, 38, 1, MT('metal', '#2a2a2a'));
      barrel(P, 4, 0, -6, '#8a5a32', true); rope(P, -6, 0, 4);
    },
    bank(P) {
      const v = P.v;
      block(P, -7, 0, -7, 6, 1, 6, stone('#8f8a80'));
      for (let s = 0; s < 2; s++) block(P, -4, s, 6 - s, 3, s, 6 - s, MT('stone', '#a8a296'));
      block(P, -6, 2, -6, 5, 10, 2, stone('#b8b2a6'));
      for (const x of [-6, -3, 1, 4]) { for (let y = 2; y <= 10; y++) { v.set(x, y, 3, MT('stone', '#d8d2c4')); v.set(x + 1, y, 3, MT('stone', '#c8c2b4')); } v.box(x, 2, 4, x + 1, 2, 4, MT('stone', '#a8a296')); }
      block(P, -7, 11, -7, 6, 12, 4, stone('#8f8a80'));
      for (let x = -7; x <= 6; x++) v.set(x, 12, 5, MT('gold', x % 2 ? '#e0b04a' : '#c8a040'));
      // drum with small arched windows, a ribbed golden dome, a glazed lantern and a spire
      v.cyl(-0.5, 13, -1.5, 4.4, 14, (x, y, z) => MT('stone', y === 14 ? '#d8d2c4' : '#c8c2b4'));
      for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2 + 0.2; lit(P, Math.round(-0.5 + Math.cos(t) * 4.3), 13, Math.round(-1.5 + Math.sin(t) * 4.3), '#ffe8a0'); }
      v.cyl(-0.5, 15, -1.5, 4.8, 15, MT('gold', '#c8a040'));
      v.ball(-0.5, 15, -1.5, 4.5, 5.2, 4.5, (x, y, z) => {
        const ang = Math.atan2(z + 1.5, x + 0.5), rib = mod(Math.round(ang / (Math.PI / 6)), 1) === 0 && Math.abs(ang / (Math.PI / 6) - Math.round(ang / (Math.PI / 6))) < 0.18;
        return MT('gold', rib ? '#c8962a' : y > 18 ? '#ffe070' : y > 16 ? '#f2c43a' : '#e0b030');
      }, (x, y) => y >= 16);
      v.box(-1, 20, -2, 0, 20, -1, MT('gold', '#c8962a'));
      for (const [x, z] of [[-1, -2], [0, -2], [-1, -1], [0, -1]]) lit(P, x, 21, z, '#fff2a0');
      v.box(-1, 22, -2, 0, 22, -1, MT('gold', '#c8962a')); v.set(-1, 23, -2, MT('gold', '#ffd23f')); v.set(-1, 24, -2, MT('gold', '#fff2a0'));
      // round vault door with spokes
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const d = Math.hypot(i, j);
        if (d <= 3.3) v.set(-1 + i, 6 + j, 3, MT('metal', d > 2.4 ? '#5a5a62' : (i === 0 || j === 0) ? '#ffd23f' : '#7a7a84'));
      }
      v.set(-1, 6, 4, MT('gold', '#fff2a0'));
      winZ(P, -5, 5, 2, 1, 3, { frame: '#8f8a80' }); winZ(P, 4, 5, 2, 1, 3, { frame: '#8f8a80' });
      // gold bars and lanterns
      for (const [x0, z0] of [[-7, 4], [5, 4]]) { v.box(x0, 2, z0, x0 + 1, 2, z0 + 1, MT('gold', '#ffd23f')); v.set(x0, 3, z0, MT('gold', '#e0a020')); }
      lamp(P, -4, 2, 5, 4); lamp(P, 3, 2, 5, 4);
    },
    temple(P) {
      const v = P.v;
      block(P, -7, 0, -7, 6, 1, 6, stone('#dfe8ef'));
      block(P, -6, 2, -6, 5, 2, 5, MT('stone', '#eef3f7'));
      for (let s = 0; s < 2; s++) v.box(-2, s, 6 + 0, 1, s, 6, MT('stone', s ? '#e6eef4' : '#cfd8df'));
      v.box(-2, 0, 7, 1, 0, 7, MT('stone', '#cfd8df'));
      for (const [x, z] of [[-6, -6], [4, -6], [-6, 4], [4, 4], [-6, -1], [4, -1], [-2, 4], [1, 4]]) {
        v.box(x, 3, z, x + 1, 10, z + 1, MT('stone', (x + z) % 2 ? '#f4f8ff' : '#e6eef6'));
        v.box(x, 3, z, x + 1, 3, z + 1, MT('stone', '#cfd8df')); v.box(x, 10, z, x + 1, 10, z + 1, MT('gold', '#e0b04a'));
      }
      const top = hip(P, -6, 5, -6, 5, 11, { c1: '#3a7bd5', c2: '#2f6bc0', over: 2 });
      hip(P, -3, 2, -3, 2, top + 1, { c1: '#3a7bd5', c2: '#2f6bc0', over: 1 });
      // golden trident on top
      const ty = top + 5;
      v.box(-1, ty, -1, -1, ty + 6, -1, MT('gold', '#f0c03a'));
      v.box(-3, ty + 4, -1, 1, ty + 4, -1, MT('gold', '#f0c03a')); v.box(-3, ty + 5, -1, -3, ty + 7, -1, MT('gold', '#f0c03a')); v.box(1, ty + 5, -1, 1, ty + 7, -1, MT('gold', '#f0c03a'));
      v.set(-1, ty + 7, -1, MT('gold', '#fff2a0'));
      // shrine: water basin with a glowing pearl
      block(P, -2, 3, -2, 1, 3, 1, MT('stone', '#2f6bc0'));
      v.box(-1, 4, -1, 0, 4, 0, MT('water', '#4fb3df'));
      lit(P, -1, 5, 0, '#5ff3ff'); lit(P, 0, 5, 0, '#bff9ff');
      for (const x of [-5, 4]) { v.box(x, 2, 6, x, 3, 6, MT('stone', '#8a8a86')); lit(P, x, 4, 6, '#ff9a2a'); lit(P, x, 5, 6, '#ffd23f'); }
      v.box(-7, 2, -7, -6, 2, -6, MT('water', '#4fb3df')); v.box(5, 2, -7, 6, 2, -6, MT('water', '#4fb3df'));
      banner(P, -4, 9, 6, 2, 4, '#3a7bd5', '#f0c03a'); banner(P, 2, 9, 6, 2, 4, '#3a7bd5', '#f0c03a');
    },
    obs(P) {
      const v = P.v;
      block(P, -7, 0, -7, 6, 1, 6, stone('#8f8a9a'));
      v.cyl(-0.5, 2, -0.5, 6, 11, stone('#e8e4ee'));
      v.cyl(-0.5, 12, -0.5, 6.4, 12, MT('stone', '#5a4a8a'));
      v.ball(-0.5, 12, -0.5, 6, 6, 6, (x, y, z) => MT('metal', Math.abs(x + 0.5) < 1.2 && z < 3 ? '#2a2a3a' : (y + Math.round(Math.atan2(z, x) * 4)) % 4 === 0 ? '#dcd8e8' : '#f4f1fa'), (x, y) => y >= 13);
      // brass telescope out of the slit
      v.line(-1, 15, 0, -1, 22, -6, MT('metal', '#b8862a'), 1);
      v.line(-1, 22, -6, -1, 23, -7, MT('metal', '#5a4a8a'), 1);
      lit(P, -1, 23, -8, '#c58bff');
      doorZ(P, -2, 2, 5, 2, 5, { c: '#3a2a5a', frame: '#5a4a8a', step: false });
      winZ(P, -6, 7, 3, 1, 2, { frame: '#5a4a8a', glass: '#c58bff' }); winZ(P, 4, 7, 3, 1, 2, { frame: '#5a4a8a', glass: '#c58bff' });
      for (const [x, y] of [[-6, 4], [4, 5]]) { v.set(x, y, 5, MT('gold', '#f0c03a')); v.set(x + 1, y, 5, MT('gold', '#f0c03a')); v.set(x, y + 1, 5, MT('gold', '#f0c03a')); }
      // a small orrery and a lamp
      v.box(4, 2, 4, 4, 4, 4, MT('metal', '#b8862a')); v.ball(4, 5, 4, 1, 1, 1, MT('plain', '#3a7bd5'));
      v.set(6, 5, 4, MT('gold', '#f0c03a')); v.set(2, 6, 4, MT('plain', '#c8323a'));
      lamp(P, -6, 2, 5, 4, '#c58bff');
    },
    statue(P) {
      const v = P.v;
      for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) v.set(x, 0, z, MT('cobble', (x + z) % 2 ? '#b8b0a0' : '#a8a090'));
      for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) { v.box(x, 1, z, x + 1, 1, z + 1, MT('grass', '#4fa64a')); v.set(x, 2, z, MT('leaf', '#ff6fa8')); v.set(x + 1, 2, z + 1, MT('leaf', '#ffd23f')); }
      block(P, -4, 1, -4, 3, 2, 3, stone('#9a9a96'));
      block(P, -3, 3, -3, 2, 6, 2, stone('#8a8a86'));
      // the captain in bronze (with a little green patina): boots, long coat, belt, sash, beard,
      // tricorn with a feather, a spyglass in one hand and the cutlass raised in the other
      const br = (c) => (x, y, z) => MT('metal', hash(x, y, z) < 0.12 ? '#6f8a6a' : shade(c, 0.94 + 0.12 * hash(z, x, y)));
      const bz = br('#8a6a3a'), bl = br('#a8844a'), dk = br('#6e5432');
      v.box(-3, 6, -3, 2, 6, 2, MT('stone', '#7a7a76'));
      // a treasure chest under one boot
      block(P, 0, 7, -1, 2, 8, 1, br('#7a5a32')); v.box(0, 9, -1, 2, 9, 1, MT('gold', '#d8a830'));
      block(P, -2, 7, -1, -1, 8, 0, dk); block(P, 0, 10, -1, 1, 10, 0, dk);
      block(P, -2, 9, -1, -1, 12, 0, bz); block(P, 0, 11, -1, 1, 12, 0, bz);
      // coat flaring toward the hem, open at the front
      block(P, -3, 12, -2, 2, 13, 1, (x, y, z) => (z === 1 && (x === -1 || x === 0) ? dk(x, y, z) : bz(x, y, z)));
      block(P, -3, 14, -2, 2, 18, 1, (x, y, z) => (y === 15 ? MT('metal', '#c8a050') : z === 1 && (x === -1 || x === 0) ? bl(x, y, z) : bz(x, y, z)));
      v.set(-1, 15, 2, MT('gold', '#f0c03a'));
      for (let y = 16; y <= 18; y++) v.set(1 - (y - 16), y, 2, MT('metal', '#7a2a20'));
      block(P, -4, 18, -2, 3, 18, 1, bz);
      // left arm down with a spyglass, right arm raised with the cutlass
      block(P, -5, 14, -1, -4, 18, 0, bz); v.box(-5, 12, 0, -5, 13, 0, MT('metal', '#c8a050')); v.set(-5, 11, 0, MT('metal', '#b8862a'));
      block(P, 3, 18, -1, 4, 22, 0, bz); block(P, 4, 23, 0, 4, 23, 0, bl);
      for (let k = 0; k <= 7; k++) v.set(4 + Math.round(k * 0.3), 24 + k, 0, MT('metal', k === 0 ? '#c8a050' : '#d8d8d2'));
      v.box(3, 24, -1, 5, 24, 1, MT('metal', '#c8a050'));
      // head, beard, eyes
      block(P, -2, 19, -2, 1, 22, 1, bl);
      // beard and moustache stand out from the face; small dark eyes under the brim
      block(P, -1, 19, 2, 0, 20, 2, dk); block(P, -2, 20, 2, -2, 20, 2, bz); block(P, 1, 20, 2, 1, 20, 2, bz);
      v.set(-2, 21, 1, MT('metal', '#3a2a18')); v.set(1, 21, 1, MT('metal', '#3a2a18')); block(P, -1, 21, 2, -1, 21, 2, bl);
      // tricorn: wide brim with turned-up corners, crown, feather
      block(P, -4, 23, -3, 3, 23, 2, dk);
      for (const [x, z] of [[-4, -3], [3, -3], [-4, 2], [3, 2], [-1, 2], [0, 2]]) block(P, x, 24, z, x, 24, z, dk);
      block(P, -2, 24, -2, 1, 25, 1, dk);
      v.line(-3, 24, -2, -5, 28, -3, MT('cloth', '#e8e0d0'));
      v.box(-1, 4, 3, 0, 5, 3, MT('gold', '#f0c03a'));
      for (const [x, z] of [[-7, -7], [6, -7], [-7, 6], [6, 6]]) lamp(P, x, 1, z, 4);
    },
  };

  /**
   * Detailed building part set (0.125 units per voxel). `stage` 0..2 grows with the building level:
   * stage 1 adds lanterns at the front corners, stage 2 also a pennant on the highest point.
   * Everything is clipped to the plot cell.
   */
  const NO_PENNANT = { statue: 1, light: 1, temple: 1, fort: 1, market: 1, grove: 1, obs: 1, bank: 1 };
  const MATS_ID = {};
  VC.Voxel.MATS.forEach((n, i) => { MATS_ID[n] = i; });
  function buildingParts(id, stage) {
    const P = parts();
    (BUILD[id] || BUILD.hut)(P);
    stage = stage || 0;
    if (stage >= 1) for (const x of [-7, 6]) {
      let free = true;
      for (let y = 0; y <= 8; y++) if (P.v.has(x, y, 7) || P.v.has(x, y, 6)) { free = false; break; }
      if (free) lamp(P, x, 0, 7, 5);
    }
    if (stage >= 2 && !NO_PENNANT[id]) {
      let best = null;
      // the highest point of the roof, but never a chimney (smoke) or a pole
      const nearChimney = (x, z) => (P.chimneys || []).some(([cx, cz]) => x >= cx - 2 && x <= cx + 3 && z >= cz - 2 && z <= cz + 3);
      P.v.each((x, y, z, c) => {
        if (x < -6 || x > 5 || z < -6 || z > 5 || nearChimney(x, z) || (best && y <= best[1])) return;
        const m = VC.Voxel.matOf(c);
        if (m !== MATS_ID.cloth && m !== MATS_ID.glass) best = [x, y, z];
      });
      if (best) {
        const [x, y, z] = best;
        for (let k = 1; k <= 6; k++) P.v.set(x, y + k, z, W('#5a3a1e'));
        P.v.set(x, y + 7, z, MT('gold', '#f0c03a'));
        const f = new Vox();
        const pc = ['#c8323a', '#2f6bc0', '#2f7a46', '#7a3fb0', '#e0a020'][Math.floor(hash(x, y, id.length) * 5)];
        for (let i = 1; i <= 4; i++) for (let j = 0; j < (i < 3 ? 2 : 1); j++) f.set(x - i, y + 6 - j, z, MT('cloth', pc));
        P.cloth.push({ vox: f, fn: flagWeight(x, 0.016) });
      }
    }
    return fitCell(P, -8, 7);
  }
  /** Legacy single-Vox access (debug viewer). */
  function building(id) { return buildingParts(id).v; }

  // ------------------------------------------------------------------ props
  /** The treasure chest (0.125 units per voxel): banded, locked, coins spilling out. */
  function chest() {
    const v = new Vox();
    for (let x = -6; x <= 5; x++) for (let y = 0; y <= 5; y++) for (let z = -4; z <= 3; z++) v.set(x, y, z, MT('plank', y % 2 ? '#8a5a32' : '#7a4a2a'));
    for (let x = -6; x <= 5; x++) for (let y = 6; y <= 8; y++) for (let z = -4; z <= 3; z++) {
      if (y === 8 && (z === -4 || z === 3)) continue;
      v.set(x, y, z, y === 6 ? W('#6b4423') : MT('plank', (x & 1) ? '#9a6b3e' : '#8a5e36'));
    }
    for (const x of [-6, -3, 2, 5]) for (let y = 0; y <= 7; y++) for (const z of [-4, 3]) v.set(x, y, z, MT('gold', '#f0c03a'));
    for (const x of [-6, -3, 2, 5]) { for (let z = -3; z <= 2; z++) v.set(x, 8, z, MT('gold', '#f0c03a')); v.set(x, 7, -4, MT('gold', '#f0c03a')); v.set(x, 7, 3, MT('gold', '#f0c03a')); }
    for (let x = -6; x <= 5; x++) { v.set(x, 0, 3, MT('gold', '#c8902a')); v.set(x, 0, -4, MT('gold', '#c8902a')); }
    v.box(-1, 4, 4, 0, 6, 4, MT('gold', '#ffd23f')); v.set(-1, 5, 4, MT('plain', '#2a1a0a')); v.set(0, 4, 4, MT('gold', '#e0a020'));
    v.set(-5, 9, -1, MT('glass', '#c8323a')); v.set(4, 9, 0, MT('glass', '#3a7bd5')); v.box(-1, 9, -1, 0, 9, 0, MT('gold', '#ffd23f'));
    for (const [x, z] of [[-4, 5], [-3, 5], [1, 5], [2, 6], [3, 5], [-6, 5], [5, 5], [4, 6]]) v.set(x, 0, z, MT('gold', '#ffd23f'));
    v.set(-3, 1, 5, MT('gold', '#fff2a0')); v.set(3, 1, 5, MT('gold', '#e0a020'));
    return v;
  }
  function parrot(gold) {
    const v = new Vox();
    const body = gold ? '#ffd23f' : '#3cb043', wing = gold ? '#ffb100' : '#2f6bc0', tail = gold ? '#fff2a0' : '#d63a3a';
    const m = gold ? 'gold' : 'cloth';
    v.ball(0, 3, 0, 2, 2.6, 1.6, MT(m, body));
    v.ball(1, 6, 0, 1.6, 1.6, 1.4, MT(m, body));
    v.box(3, 5, 0, 3, 6, 0, MT('plain', '#ffd23f')); v.set(3, 4, 0, MT('plain', '#2a2a2a'));
    v.set(2, 7, 1, MT('plain', '#fff')); v.set(2, 7, -1, MT('plain', '#fff'));
    v.line(-1, 2, 0, -4, 0, 0, MT(m, tail));
    v.box(-1, 2, 2, 1, 5, 2, MT(m, wing)); v.box(-1, 2, -2, 1, 5, -2, MT(m, wing));
    return v;
  }
  function coin() {
    const v = new Vox();
    v.ball(0, 0, 0, 1.6, 1.6, 0.5, MT('gold', '#ffd23f'));
    v.set(0, 0, 1, MT('gold', '#e0a020'));
    return v;
  }
  function bottle() {
    const v = new Vox();
    v.box(-2, 0, 0, 2, 1, 1, MT('glass', '#4fae8a'));
    v.box(3, 0, 0, 4, 1, 1, MT('glass', '#4fae8a')); v.set(5, 0, 0, W('#8a5a32'));
    v.set(0, 1, 2, MT('cloth', '#f2ead6'));
    return v;
  }
  /**
   * Navy longboat with a crew of marines (bow toward +x; meant for ~0.1 units per voxel): planked
   * hull with a white wale, thwarts, oars, a little Crown ensign at the stern.
   */
  function boat(color) {
    const v = new Vox();
    const c = color || '#1f3e66';
    for (let x = -8; x <= 8; x++) {
      const t = Math.abs(x) / 8.6, w = Math.max(0, Math.round(3.2 * Math.sqrt(1 - t * t)));
      for (let z = -w; z <= w; z++) {
        v.set(x, 0, z, MT('plank', shade(c, 0.7)));
        const side = Math.abs(z) === w || Math.abs(x) === 8;
        if (side) { v.set(x, 1, z, MT('plank', shade(c, x & 1 ? 1 : 0.9))); v.set(x, 2, z, MT('wood', '#e9e3d2')); }
        else v.set(x, 1, z, MT('plank', mod(x, 3) === 0 ? '#6b4423' : '#8a5a32'));
      }
    }
    v.set(9, 2, 0, MT('wood', '#e9e3d2')); v.set(9, 3, 0, MT('wood', '#e9e3d2'));
    // marines: blue coats with white cross belts, faces, black hats, muskets
    for (const [x, z] of [[-4, -1], [0, 1], [4, -1]]) {
      v.box(x, 2, z, x + 1, 4, z + 1, MT('cloth', '#1d4f91'));
      v.set(x, 3, z + 1, MT('cloth', '#f2efe6')); v.set(x + 1, 4, z, MT('cloth', '#f2efe6'));
      v.box(x, 5, z, x + 1, 5, z + 1, MT('plain', '#f2c8a0'));
      v.box(x - 1, 6, z, x + 2, 6, z + 1, MT('cloth', '#1a1a1a')); v.box(x, 7, z, x + 1, 7, z + 1, MT('cloth', '#1a1a1a'));
      v.set(x + 2, 6, z, MT('gold', '#f0c03a'));
      v.line(x + 2, 3, z + 2, x + 4, 8, z + 2, MT('metal', '#3a3a3e'));
      // oars over the side
      v.line(x, 3, z < 0 ? -3 : 3, x - 2, 0, z < 0 ? -7 : 7, MT('wood', '#c8a26a'));
    }
    v.box(-8, 3, 0, -8, 7, 0, MT('wood', '#5a3a1e'));
    for (let i = 1; i <= 3; i++) for (let j = 0; j < 2; j++) v.set(-8 - i, 7 - j, 0, MT('cloth', i === 2 && j === 0 ? '#f0c03a' : '#1d4f91'));
    return v;
  }
  function cloudPuff(seed) {
    const rnd = VC.util.rng(seed || 9);
    const v = new Vox();
    for (let k = 0; k < 4; k++) v.ball(k * 4 - 6, rnd() * 2, rnd() * 4 - 2, 3 + rnd() * 2, 2 + rnd(), 3, MT('plain', '#ffffff'));
    return v;
  }
  function smallIsland(seed) {
    const rnd = VC.util.rng(seed || 4);
    const v = new Vox();
    const r = 6 + rnd() * 5;
    v.ball(0, 0, 0, r, 3 + rnd() * 3, r * 0.8, (x, y) => (y > 1 ? MT('grass', '#5fae46') : MT('sand', '#e3cc8e')), (x, y) => y >= -2);
    const p = palm(6, seed);
    p.each((x, y, z, c) => v.set(x + 1, y + 4, z, c));
    return v;
  }

  // ------------------------------------------------------------------ village decor (part sets, 0.125 units per voxel)
  /** Village cottage: plank/timber/stone/brick walls, tiled/thatched/slate roof, door, windows, chimney. */
  function cottage(seed) {
    const rnd = VC.util.rng(seed || 1);
    const P = parts();
    const v = P.v;
    const hw = 4 + (rnd() * 2 | 0);
    const x0 = -hw, x1 = hw - 1, z0 = -4, z1 = 3;
    const two = seed % 3 === 0;
    const wh = two ? 11 : 6 + (rnd() * 2 | 0);
    const ws = (seed * 7) % 5;
    const wallC = ['#efe3c4', '#a0703c', '#c8bca8', '#b8604a', '#d9c9a3'][ws];
    const wallFn = ws === 1 ? planks(wallC) : ws === 2 ? stone(wallC) : ws === 3 ? brick(wallC) : timber(wallC, '#5a3a1e', x0, x1, z0, z1, 0, wh);
    const roofs = [['#b8402e', '#9a3326', 'roof'], ['#c9a24a', '#b8913c', 'thatch'], ['#4a6a8a', '#3a5a7a', 'roof'], ['#7a4a2e', '#6b4023', 'roof'], ['#3f7f5a', '#356b4c', 'roof']];
    const [r1, r2, rm] = roofs[(seed * 3 + 1) % 5];
    block(P, x0, 0, z0, x1, wh, z1, wallFn);
    if (ws !== 3 && ws !== 2) block(P, x0, 0, z0, x1, 0, z1, stone('#8c8a84'));
    if (ws === 1 || ws === 3) frameBox(P, x0, z0, x1, z1, 0, wh, ws === 3 ? '#8a8a86' : '#5a3a1e');
    const shutter = ['#2f7a46', '#3a7bd5', '#c8323a', '#6b4a2e'][seed % 4];
    doorZ(P, -1, 0, z1, 2, 4, { c: ['#6b4423', '#2f5a7a', '#7a2a20'][seed % 3] });
    winZ(P, x0 + 2, 2, z1, 2, 2, { shutter, flowers: '#ff6fa8' });
    if (hw >= 5) winZ(P, x1 - 2, 2, z1, 2, 2, { shutter, flowers: '#ffd23f' });
    if (two) { winZ(P, x0 + 2, 8, z1, 2, 2, { shutter }); winZ(P, x1 - 2, 8, z1, 2, 2, { shutter }); }
    winX(P, x1, 3, -2, 2, 2, {});
    const axis = rnd() < 0.6 ? 'x' : 'z';
    const ry = gable(P, x0, x1, z0, z1, wh + 1, axis, { c1: r1, c2: r2, mat: rm, over: 1, rise: two ? 1 : (seed % 2 ? 2 : 1), gable: ws === 1 ? planks(wallC) : plaster(ws === 2 ? '#c8bca8' : '#efe3c4') });
    chimney(P, x1 - 2, z0 + 1, wh + 1, Math.max(ry + 1, wh + 6), ws === 3 ? '#8a4a3a' : '#9a5a46');
    // porch lantern and clutter
    lamp(P, 1, 5, z1 + 1, 0);
    if (rnd() < 0.5) barrel(P, x1 + 1, 0, z1 - 1, '#8a5a32', true); else crate(P, x0 - 3, 0, z1 - 1, 2);
    if (seed % 4 === 1) { v.box(x0 - 2, 0, z0, x0 - 2, 3, z0, W('#6b4a2e')); for (let z = z0; z <= z1 - 2; z++) v.set(x0 - 2, 4, z, MT('cloth', z & 1 ? '#f2efe6' : '#7ab0e0')); }
    return P;
  }

  /** Windmill: body part set, sails (rotate around z at the hub), hub position in voxels. */
  function windmill() {
    const P = parts();
    const v = P.v;
    for (let y = 0; y <= 18; y++) v.cyl(0, y, 0, 4.6 - y * 0.08, y, stone('#d8d0c0'));
    doorZ(P, -1, 0, 4, 2, 4, { c: '#5a3a1e' });
    v.box(-2, 5, 4, 1, 5, 4, W('#6b4a2e'));
    winZ(P, 2, 9, 3, 1, 2, { frame: '#6b4a2e' }); winZ(P, -3, 13, 2, 1, 2, { frame: '#6b4a2e' });
    v.cyl(0, 19, 0, 4, 19, W('#6b4a2e'));
    v.cyl(0, 20, 0, 3.8, 25, (x, y) => MT('roof', y % 2 ? '#8a4a2e' : '#7a3a26'), 0.6);
    v.box(-1, 18, 4, 0, 20, 6, W('#5a3a1e'));
    sack(P, 2, 0, 4, '#e8e0d0'); sack(P, 3, 0, 2, '#d8d0c0');
    const s = new Vox();
    for (let a = 0; a < 4; a++) {
      const ca = Math.round(Math.cos(a * Math.PI / 2)), sa = Math.round(Math.sin(a * Math.PI / 2));
      for (let k = 1; k <= 13; k++) {
        s.set(ca * k, sa * k, 0, W('#5a3a1e'));
        if (k > 3) for (let w = 1; w <= 3; w++) {
          const lattice = k % 3 === 0 || w === 3;
          s.set(ca * k - sa * w, sa * k + ca * w, 0, lattice ? W('#6b4a2e') : MT('cloth', '#efe3c4'));
        }
      }
    }
    s.set(0, 0, 0, MT('metal', '#3a2614')); s.set(0, 0, 1, MT('metal', '#3a2614'));
    return { body: P, sails: s, hub: [0, 19, 7] };
  }

  function watchtower() {
    const P = parts();
    const v = P.v;
    for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) v.box(x, 0, z, x, 17, z, MT('bark', '#6b4423'));
    for (let y = 2; y <= 14; y += 6) {
      v.line(-4, y, 3, 3, y + 5, 3, W('#8a6238')); v.line(-4, y, -4, 3, y + 5, -4, W('#8a6238'));
      v.line(-4, y, -4, -4, y + 5, 3, W('#8a6238')); v.line(3, y, -4, 3, y + 5, 3, W('#8a6238'));
    }
    block(P, -5, 17, -5, 4, 17, 4, (x) => MT('plank', x % 2 ? '#9a6b3e' : '#8a5a32'));
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) if (x === -5 || x === 4 || z === -5 || z === 4) { if ((x + z) % 2 === 0) v.set(x, 18, z, W('#6b4423')); v.set(x, 19, z, W('#8a6238')); }
    for (const [x, z] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) v.box(x, 18, z, x, 22, z, W('#6b4423'));
    hip(P, -5, 4, -5, 4, 23, { c1: '#c9a24a', c2: '#b8913c', mat: 'thatch', over: 1 });
    for (let y = 0; y <= 16; y++) { v.set(-1, y, 5, W('#8a6238')); v.set(1, y, 5, W('#8a6238')); if (y % 2 === 0) v.set(0, y, 5, W('#9a7044')); }
    torch(P, 3, 18, 3, 2);
    lit(P, -2, 18, -2, '#ffb13a');
    flag(P, 0, 28, 0, 5, 6, 4, '#111111', '#ffffff');
    return P;
  }

  /** Market stall with a striped awning and goods. */
  function stall(seed) {
    const P = parts();
    const v = P.v;
    const cols = [['#c8323a', '#f2efe6'], ['#3a7bd5', '#f2efe6'], ['#f0c03a', '#7a3fb0'], ['#3f8f5a', '#f2efe6']][seed % 4];
    for (const [x, z] of [[-4, -2], [3, -2], [-4, 2], [3, 2]]) v.box(x, 0, z, x, 7 + (z < 0 ? 1 : 0), z, W('#6b4a2e'));
    awning(P, -5, 4, -3, 3, 9, cols[0], cols[1]);
    block(P, -4, 0, 1, 3, 2, 2, planks('#a0703c'));
    const goods = [['#ff7b3a', '#ffd23f', '#3cb043'], ['#9ab8c8', '#c8783a', '#9ab8c8'], ['#c8323a', '#3a7bd5', '#f0c03a'], ['#e0d0a0', '#a07a4a', '#e0d0a0']][seed % 4];
    for (let x = -4; x <= 3; x++) { v.set(x, 3, 2, MT('plain', goods[(x + 4) % 3])); if (x % 2) v.set(x, 4, 2, MT('plain', shade(goods[(x + 5) % 3], 1.1))); }
    for (let x = -3; x <= 2; x += 2) v.set(x, 3, 1, MT('plain', goods[(x + 5) % 3]));
    crate(P, -7, 0, -1, 2); sack(P, 5, 0, -1); barrel(P, 5, 0, 1, '#8a5a32', true);
    return P;
  }

  /** Campfire with stones, logs, log seats and a cooking spit; smoke emitter in the middle. */
  function campfire() {
    const P = parts();
    const v = P.v;
    for (let a = 0; a < 14; a++) { const t = a / 14 * Math.PI * 2; v.set(Math.round(Math.cos(t) * 3), 0, Math.round(Math.sin(t) * 3), MT('rock', a % 2 ? '#8a8a86' : '#6e6e6a')); }
    v.line(-2, 0, -2, 2, 1, 2, MT('bark', '#5a3a1e')); v.line(-2, 0, 2, 2, 1, -2, MT('bark', '#6b4423'));
    lit(P, 0, 1, 0, '#ff6a1a'); lit(P, 1, 1, 0, '#ff9a2a'); lit(P, 0, 1, 1, '#ff9a2a'); lit(P, -1, 1, 0, '#ff6a1a'); lit(P, 0, 1, -1, '#ff6a1a');
    lit(P, 0, 2, 0, '#ffd23f'); lit(P, 0, 3, 0, '#fff2a0'); lit(P, 1, 2, 0, '#ffb13a');
    for (const [x, z, alongX] of [[-1, 7, true], [-8, 0, false], [7, -1, false]]) {
      if (alongX) v.box(x - 2, 0, z, x + 2, 1, z, MT('bark', (x & 1) ? '#8a5a32' : '#7a4a2a'));
      else v.box(x, 0, z - 2, x, 1, z + 2, MT('bark', '#8a5a32'));
    }
    v.box(-3, 0, 0, -3, 4, 0, W('#5a3a1e')); v.box(3, 0, 0, 3, 4, 0, W('#5a3a1e')); v.box(-3, 4, 0, 3, 4, 0, MT('metal', '#3a2a1a'));
    v.box(-1, 3, 0, 0, 3, 0, MT('plain', '#c8783a'));
    v.box(5, 0, 4, 6, 1, 5, MT('metal', '#3a3a3a')); v.set(5, 2, 4, MT('metal', '#2a2a2a'));
    P.smoke.push([0, 5, 0]);
    return P;
  }

  function lampPost() {
    const P = parts();
    P.v.box(0, 0, 0, 0, 10, 0, MT('metal', '#3a3430')); P.v.box(0, 10, 0, 2, 10, 0, MT('metal', '#3a3430'));
    P.v.set(2, 9, 0, MT('metal', '#2a2a2a')); lit(P, 2, 8, 0); lit(P, 2, 7, 0); P.v.set(2, 6, 0, MT('metal', '#2a2a2a'));
    P.v.box(-1, 0, -1, 1, 0, 1, MT('stone', '#6e6e6a'));
    return P;
  }
  function torchPost() { const P = parts(); torch(P, 0, 0, 0, 7); P.v.set(0, 0, 1, MT('rock', '#7a7a76')); P.v.set(1, 0, 0, MT('rock', '#8a8a86')); return P; }

  function well() {
    const P = parts();
    const v = P.v;
    v.cyl(0, 0, 0, 3, 3, stone('#9a9a96'));
    v.cyl(0, 3, 0, 1.9, 3, MT('water', '#2a6a9a'));
    v.box(-3, 4, 0, -3, 10, 0, MT('bark', '#6b4423')); v.box(3, 4, 0, 3, 10, 0, MT('bark', '#6b4423'));
    gable(P, -3, 3, -1, 1, 11, 'x', { c1: '#b8402e', c2: '#9a3326', over: 1, gable: planks('#8a5a32') });
    v.box(-2, 8, 0, 2, 8, 0, W('#5a3a1e')); v.box(0, 5, 0, 0, 7, 0, MT('cloth', '#d8d0b0')); v.box(0, 4, 0, 1, 5, 1, MT('plank', '#8a6238'));
    v.set(4, 8, 0, W('#5a3a1e')); v.set(4, 7, 0, W('#5a3a1e'));
    return P;
  }

  /** Arched wooden footbridge along x. */
  function bridge(len) {
    len = len || 14;
    const P = parts();
    const v = P.v;
    for (let x = 0; x < len; x++) {
      const y = Math.round(Math.sin(x / (len - 1) * Math.PI) * 2) + 1;
      for (let z = -3; z <= 3; z++) v.set(x - len / 2, y, z, MT('plank', (x % 2) ? '#9a6b3e' : '#8a5a32'));
      if (x % 3 === 0) { v.box(x - len / 2, y + 1, -3, x - len / 2, y + 3, -3, W('#6b4423')); v.box(x - len / 2, y + 1, 3, x - len / 2, y + 3, 3, W('#6b4423')); }
      v.set(x - len / 2, y + 3, -3, W('#7a5530')); v.set(x - len / 2, y + 3, 3, W('#7a5530'));
      if (x === 0 || x === len - 1) for (const z of [-3, 3]) v.box(x - len / 2, 0, z, x - len / 2, y, z, MT('bark', '#5a3a1e'));
    }
    return P;
  }

  /** Small rowboat (bow toward +x): planked hull with ribs, seats, oars or a net. */
  function rowboat(color, seed) {
    const P = parts();
    const v = P.v;
    const c = color || '#2f6bc0', trim = '#e9e3d2';
    for (let x = -6; x <= 6; x++) {
      const t = Math.abs(x) / 6.5;
      const w = Math.round(2.6 * Math.sqrt(1 - t * t));
      for (let z = -w; z <= w; z++) {
        v.set(x, 0, z, MT('plank', shade(c, 0.72)));
        if (Math.abs(z) === w || Math.abs(x) === 6) { v.set(x, 1, z, MT('plank', shade(c, x & 1 ? 1 : 0.92))); v.set(x, 2, z, W(trim)); }
        else v.set(x, 1, z, MT('plank', x % 3 === 0 ? '#6b4423' : '#8a5a32'));
      }
    }
    v.box(-1, 2, -2, 0, 2, 2, MT('plank', '#9a6b3e')); v.box(3, 2, -1, 3, 2, 1, MT('plank', '#9a6b3e'));
    v.set(7, 1, 0, W(trim));
    if (seed % 2) { v.line(0, 3, -3, -3, 1, -7, W('#c8a26a')); v.line(0, 3, 3, -3, 1, 7, W('#c8a26a')); v.set(-3, 1, -7, W('#b08a5a')); v.set(-3, 1, 7, W('#b08a5a')); }
    else { v.box(-4, 2, -1, -2, 2, 1, MT('cloth', '#d8d0b0')); v.set(-4, 3, 0, MT('cloth', '#c8c0a0')); v.set(-3, 3, 0, MT('plain', '#9ab8c8')); }
    return P;
  }

  /** Fishing nets drying on two poles (along z), floats and a basket of fish. */
  function nets() {
    const P = parts();
    const v = P.v;
    v.box(0, 0, -5, 0, 9, -5, MT('bark', '#6b4423')); v.box(0, 0, 5, 0, 9, 5, MT('bark', '#6b4423')); v.box(0, 9, -5, 0, 9, 5, W('#6b4423'));
    for (let z = -4; z <= 4; z++) for (let y = 2; y <= 8; y++) if ((y + z) % 2 === 0 || y === 8) v.set(0, y - (Math.abs(z) < 2 ? 1 : 0), z, MT('cloth', '#d8d0b0'));
    v.set(0, 4, 2, MT('plain', '#e8b04a')); v.set(0, 6, -3, MT('plain', '#e8b04a')); v.set(0, 5, -1, MT('plain', '#c8323a'));
    v.cyl(3, 0, 0, 1.6, 1, MT('thatch', '#c8a26a')); v.set(3, 2, 0, MT('metal', '#9ab8c8')); v.set(2, 2, 1, MT('metal', '#b8c8d0'));
    return P;
  }

  /** Pile of cargo: crates, barrels and sacks, sometimes a rope coil. */
  function cargo(seed) {
    const rnd = VC.util.rng(seed || 3);
    const P = parts();
    crate(P, -4, 0, -2, 3); crate(P, -1, 0, -3, 3, '#8a5a32');
    if (rnd() < 0.6) crate(P, -3, 3, -2, 2, '#b08050');
    barrel(P, 3, 0, -1); if (rnd() < 0.5) barrel(P, 1, 0, 2, '#7a4a2a', true);
    sack(P, -4, 0, 2); if (rnd() < 0.5) sack(P, -2, 0, 3, '#b8985a');
    if (rnd() < 0.5) rope(P, 5, 0, 3);
    return P;
  }

  /** Vegetable garden with a fence and a scarecrow. */
  function garden(seed) {
    const rnd = VC.util.rng(seed || 5);
    const P = parts();
    const v = P.v;
    for (let x = -6; x <= 5; x++) for (let z = -4; z <= 3; z++) v.set(x, 0, z, MT('dirt', z % 2 ? '#6b4a2e' : '#7a5a3a'));
    for (let x = -5; x <= 4; x += 2) for (let z = -4; z <= 3; z += 2) {
      const r = rnd();
      if (r < 0.4) { v.box(x, 1, z, x + 1, 1, z, MT('leaf', '#5cb84f')); v.set(x, 2, z, MT('leaf', '#7ac862')); }
      else if (r < 0.7) { v.set(x, 1, z, MT('leaf', '#3f8f3a')); v.set(x, 2, z, MT('leaf', '#4fa64a')); v.set(x + 1, 1, z, MT('plain', '#ff8a2a')); }
      else { v.set(x, 1, z, MT('leaf', '#3f8f3a')); v.set(x, 2, z, MT('plain', '#e2553a')); }
    }
    fence(P, -7, -5, 6, -5, 0); fence(P, -7, -5, -7, 4, 0); fence(P, 6, -5, 6, 4, 0);
    v.box(0, 1, -6, 0, 9, -6, W('#6b4423')); v.box(-3, 7, -6, 3, 7, -6, W('#6b4423'));
    v.box(-1, 5, -6, 1, 8, -6, MT('cloth', '#c8323a')); v.box(0, 9, -6, 0, 10, -6, MT('cloth', '#e8d8a0')); v.box(-1, 11, -6, 1, 11, -6, MT('thatch', '#c9a24a')); v.set(0, 12, -6, MT('thatch', '#c9a24a'));
    return P;
  }

  function bench() {
    const P = parts();
    P.v.box(-3, 2, 0, 3, 2, 1, MT('plank', '#9a6b3e')); P.v.box(-3, 0, 0, -3, 1, 1, MT('metal', '#3a3430')); P.v.box(3, 0, 0, 3, 1, 1, MT('metal', '#3a3430'));
    P.v.box(-3, 3, -1, 3, 4, -1, MT('plank', '#8a5a32'));
    return P;
  }
  function signpost() {
    const P = parts();
    P.v.box(0, 0, 0, 0, 10, 0, MT('bark', '#6b4423'));
    P.v.box(-4, 8, 1, 2, 9, 1, MT('plank', '#c8a26a')); P.v.set(3, 8, 1, MT('plank', '#c8a26a')); P.v.set(3, 9, 1, MT('plank', '#b8925a'));
    P.v.box(-3, 5, 1, 3, 6, 1, MT('plank', '#b08a5a')); P.v.set(-4, 5, 1, MT('plank', '#b08a5a'));
    P.v.box(-2, 9, 2, 0, 9, 2, MT('plain', '#5a3a1e'));
    return P;
  }
  function cannon() {
    const P = parts();
    P.v.box(-3, 0, -2, 2, 1, 2, W('#5a3a1e'));
    P.v.box(-3, 2, -1, 4, 3, 0, MT('metal', '#2a2a2a')); P.v.set(5, 3, 0, MT('metal', '#1a1a1a')); P.v.set(-4, 2, 0, MT('metal', '#2a2a2a'));
    for (const [x, z] of [[-3, -2], [-3, 2], [2, -2], [2, 2]]) P.v.set(x, 0, z, W('#3a2614'));
    for (const [x, z, y] of [[-1, 4, 0], [0, 4, 0], [-1, 5, 0], [-1, 4, 1]]) P.v.set(x, y, z, MT('metal', '#2a2a2a'));
    return P;
  }
  /** Lobster / crab traps stacked by the water. */
  function traps() {
    const P = parts();
    for (const [x, y, z] of [[-3, 0, -1], [0, 0, -1], [-2, 3, -1], [1, 0, 2]]) {
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) for (let dz = 0; dz < 3; dz++) {
        const e = (dx === 0 || dx === 2) + (dy === 0 || dy === 2) + (dz === 0 || dz === 2);
        if (e >= 2 || (dy === 0)) P.v.set(x + dx, y + dy, z + dz, W(e >= 2 ? '#6b4a2e' : '#8a6238'));
      }
    }
    P.v.set(-5, 0, 2, MT('plain', '#e8b04a')); P.v.set(-5, 1, 2, MT('plain', '#c8323a'));
    return P;
  }
  /** Laundry line between two posts (cloth sways). */
  function laundry(seed) {
    const P = parts();
    P.v.box(-6, 0, 0, -6, 8, 0, MT('bark', '#6b4423')); P.v.box(6, 0, 0, 6, 8, 0, MT('bark', '#6b4423'));
    for (let x = -5; x <= 5; x++) P.v.set(x, 8 - (Math.abs(x) < 3 ? 1 : 0), 0, MT('cloth', '#d8d0b0'));
    const f = new Vox();
    const cols = ['#f2efe6', '#7ab0e0', '#c8323a', '#f0c03a', '#7ac862'];
    for (let k = 0; k < 4; k++) {
      const x0 = -5 + k * 3, h = 3 + (k + (seed || 0)) % 2;
      for (let x = x0; x < x0 + 2; x++) for (let j = 1; j <= h; j++) f.set(x, 7 - j - (Math.abs(x) < 3 ? 1 : 0) + 1, 0, MT('cloth', cols[(k + (seed || 0)) % 5]));
    }
    P.cloth.push({ vox: f, fn: (x, y, z, cx, cy) => [0, 0, 0.015 * Math.max(0, 8 - cy)] });
    return P;
  }
  /** Small dock crane with a hanging net of cargo. */
  function dockCrane() {
    const P = parts();
    const v = P.v;
    v.box(0, 0, 0, 1, 14, 1, MT('bark', '#6b4423'));
    v.line(0, 13, 0, 8, 15, 0, W('#6b4423')); v.line(0, 9, 0, 6, 14, 0, W('#5a3a1e'));
    v.line(8, 15, 0, 8, 8, 0, MT('cloth', '#d8d0b0'));
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 2; dy++) if ((dx + dz + dy) & 1) v.set(8 + dx, 5 + dy, dz, MT('cloth', '#c8b48a'));
    v.set(8, 6, 0, MT('plank', '#a0703c'));
    v.cyl(0.5, 0, 0.5, 2.2, 0, MT('stone', '#8a8a86'));
    return P;
  }

  /**
   * Pier deck on posts: planks from (x0,z0) to (x1,z1) inclusive (planks run across the longer side),
   * deck top layer y, posts every 5 voxels along the edges down to yb.
   */
  function deck(P, x0, z0, x1, z1, y, yb) {
    const v = P.v;
    const alongZ = z1 - z0 >= x1 - x0;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const plank = alongZ ? z : x, along = alongZ ? x : z;
      const seam = mod(along + plank * 5, 9) === 0;
      v.set(x, y, z, MT('plank', shade(hash(plank, 3, 1) < 0.15 ? '#7a4a2a' : plank % 2 ? '#9a6b3e' : '#a87a48', seam ? 0.82 : 1)));
    }
    for (let x = x0; x <= x1; x += 5) for (let z = z0; z <= z1; z += 5) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1 && x + 5 <= x1 && z + 5 <= z1) continue;
      v.box(x, yb, z, x, y - 1, z, MT('bark', '#5a3a1e'));
    }
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) v.box(x, yb, z, x, y - 1, z, MT('bark', '#5a3a1e'));
    // a beam under the deck edge
    for (let x = x0; x <= x1; x++) { v.set(x, y - 1, z0, W('#6b4423')); v.set(x, y - 1, z1, W('#6b4423')); }
  }

  VC.Models = {
    ship, playerStyle, STYLES, DIMS, EMBLEMS, CREATURES, palm, palmHD, tree, treeHD, bush, bushHD, rock, flowers, grass, shells, driftwood,
    building, buildingParts, BUILD, HD, parts, fitCell,
    kit: { block, frameBox, winZ, winX, doorZ, gable, hip, chimney, barrel, crate, sack, lamp, torch, flag, banner, awning, fence, seal, sign, rope, gun, lit, deck, planks, vplanks, stone, brick, plaster, cobble, rockC, timber, tileOf, hash, mod, W },
    chest, parrot, coin, bottle, boat, cloudPuff, smallIsland, shade, MT,
    cottage, windmill, watchtower, stall, campfire, lampPost, torchPost, well, bridge, rowboat, nets, cargo, garden, bench, signpost, cannon,
    traps, laundry, dockCrane,
  };
})(window.VC);
