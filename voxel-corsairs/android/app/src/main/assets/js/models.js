'use strict';
// Procedural voxel art: ships of every tier and faction, sea creatures, island nature, the 16
// buildings and village props. Ships, creatures and the terrain use 0.25 units per voxel; island
// buildings and props are "part sets" at 0.125 units per voxel (see the detail kit below).
(function (VC) {
  const { Vox } = VC.Voxel;

  function shade(hex, k) {
    const c = VC.Voxel.toInt(hex);
    const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
    const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
    const b = Math.min(255, Math.round((c & 255) * k));
    return (r << 16) | (g << 8) | b;
  }

  // ------------------------------------------------------------------ ships
  const DIMS = [
    { L: 12, W: 5, H: 2, masts: [0.5], mh: 7, castle: 0, rows: 0 },
    { L: 18, W: 6, H: 3, masts: [0.55], mh: 12, castle: 0.2, rows: 1 },
    { L: 24, W: 7, H: 4, masts: [0.36, 0.66], mh: 15, castle: 0.2, rows: 1 },
    { L: 30, W: 8, H: 5, masts: [0.3, 0.55, 0.78], mh: 18, castle: 0.22, rows: 1, nest: true },
    { L: 34, W: 10, H: 6, masts: [0.28, 0.52, 0.76], mh: 20, castle: 0.27, rows: 1, high: true, nest: true },
    { L: 38, W: 11, H: 8, masts: [0.28, 0.52, 0.76], mh: 22, castle: 0.24, rows: 2, nest: true },
    { L: 40, W: 11, H: 7, masts: [0.28, 0.52, 0.76], mh: 22, castle: 0.24, rows: 2, nest: true },
    { L: 46, W: 12, H: 8, masts: [0.22, 0.42, 0.62, 0.8], mh: 24, castle: 0.24, rows: 2, nest: true },
  ];

  const STYLES = {
    navy: { hull: '#1f3e66', trim: '#e9e3d2', sail: '#f4f1e8', flag: '#1d4f91', fg: '#f0c03a', emblem: 'crown', deck: '#c8a26a' },
    merchant: { hull: '#9a6b3e', trim: '#d9b26a', sail: '#efe3c4', stripe: '#3f8f5a', flag: '#2f7a46', fg: '#fff' },
    smuggler: { hull: '#6b4a2e', trim: '#4a3220', sail: '#9a948a', flag: null },
    fisher: { hull: '#a0703c', trim: '#6b4a2e', sail: '#d8c9a3', flag: null, patch: '#b5a07a' },
    rust: { hull: '#7a4a2a', trim: '#c9663a', sail: '#b9a27a', flag: '#111', fg: '#c9663a', emblem: 'skull' },
    blue: { hull: '#24385c', trim: '#d9cfb4', sail: '#3a7bd5', flag: '#111', fg: '#3a7bd5', emblem: 'skull' },
    ghost: { hull: '#3d5c5a', trim: '#7dffc8', sail: '#bfeee0', flag: '#0d1a1a', fg: '#7dffc8', tattered: 0.22, emblem: 'skull', lamp: '#7dffc8' },
    bone: { hull: '#d9cfb4', trim: '#8a7a60', sail: '#9b9b9b', flag: '#111', fg: '#d9cfb4', tattered: 0.3 },
    fire: { hull: '#2c1a14', trim: '#ff6a2b', sail: '#c8323a', flag: '#111', fg: '#ff6a2b', emblem: 'skull', lamp: '#ff8a3a' },
    black: { hull: '#1c1c22', trim: '#b03030', sail: '#2b2b30', flag: '#7a0f12', fg: '#fff', emblem: 'skull' },
    ice: { hull: '#dfefff', trim: '#7aa7e0', sail: '#f4f8ff', flag: '#1d4f91', fg: '#f0c03a', emblem: 'crown', lamp: '#bfefff' },
    brass: { hull: '#b5893a', trim: '#6b4f1f', sail: null, steam: true, gears: true },
    abyss: { hull: '#1d1a3a', trim: '#a24bff', sail: '#4b3a8a', flag: '#000', fg: '#a24bff', tattered: 0.25, emblem: 'eye', lamp: '#c58bff' },
    iron: { hull: '#4a4f57', trim: '#2e3238', sail: null, steam: true, rivets: true },
    raven: { hull: '#15151c', trim: '#f0c03a', sail: '#2a2a35', flag: '#15151c', fg: '#f0c03a', emblem: 'raven' },
    heart: { hull: '#15151c', trim: '#5ff3ff', sail: '#4fd9ff', flag: '#15151c', fg: '#5ff3ff', emblem: 'heart', lamp: '#5ff3ff' },
  };

  function playerStyle(skin) {
    const sk = VC.SKINS;
    const sail = sk.sail.find(x => x.id === skin.sail) || sk.sail[0];
    const flag = sk.flag.find(x => x.id === skin.flag) || sk.flag[0];
    const hull = sk.hull.find(x => x.id === skin.hull) || sk.hull[0];
    return {
      hull: hull.color, trim: hull.trim, sail: sail.color, stripe: sail.stripe, flag: flag.color, fg: flag.fg,
      emblem: skin.flag === 'heart' ? 'heart' : skin.flag === 'anchor' ? 'anchor' : skin.flag === 'kraken' ? 'eye' : 'skull',
      ghost: skin.sail === 'ghost', lamp: skin.sail === 'ghost' ? '#7dffc8' : undefined,
    };
  }

  const EMBLEMS = {
    skull: ['.XXX.', 'X.X.X', 'XXXXX', '.X.X.'],
    crown: ['X.X.X', 'XXXXX', 'XXXXX'],
    raven: ['..X..', 'XXXXX', 'X.X.X', '..X..'],
    heart: ['XX.XX', 'XXXXX', '.XXX.', '..X..'],
    anchor: ['..X..', '.XXX.', '..X..', 'X.X.X', '.XXX.'],
    eye: ['.XXX.', 'XX.XX', '.XXX.'],
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

  /**
   * opts: { tier 0..7, style key or {..palette}, skin, seed } ->
   * { vox (hull, masts, yards, deck), glow (lanterns, lit stern windows), cloth: [{vox, fn}] (sails,
   *   flags), rig: [[a, b], ...] rope segments, waterline, length, height, halfW, deckY, mastTops }
   * All in voxels (scaled by Scene.S); the bow points to +x.
   */
  function ship(opts) {
    const d = DIMS[Math.max(0, Math.min(7, opts.tier))];
    const P = typeof opts.style === 'object' ? opts.style : (STYLES[opts.style] || STYLES.navy);
    const rnd = VC.util.rng(opts.seed || 7);
    const v = new Vox(), glow = new Vox(), cloth = [], rig = [];
    const lamp = P.lamp || '#ffd36b';
    const { L, W, H } = d;
    const hull = P.hull, trim = P.trim, bottom = shade(hull, 0.62), deck = P.deck || '#b8905a';
    const halfW = [];
    for (let x = 0; x < L; x++) {
      const t = x / (L - 1);
      let f = 1;
      if (t > 0.7) f = Math.max(0.12, Math.sqrt((1 - t) / 0.3));
      else if (t < 0.08) f = 0.82 + 0.18 * (t / 0.08);
      halfW.push((W / 2) * f);
      const y0 = t > 0.8 ? Math.round((t - 0.8) / 0.2 * H * 0.5) : 0;
      for (let y = y0; y < H; y++) {
        const hf = 0.45 + 0.55 * Math.pow(y / Math.max(1, H - 1), 0.7);
        const hw = (W / 2) * f * hf;
        const zr = Math.ceil(hw);
        for (let z = -zr; z <= zr; z++) {
          if (Math.abs(z) > hw + 0.35) continue;
          let c = y < H * 0.4 ? bottom : hull;
          if (y === H - 1) c = trim;
          // planking seams along the hull
          else if (y >= H * 0.4 && (x + y * 3) % 7 === 0) c = shade(hull, 0.9);
          v.set(x, y, z, c);
        }
      }
      // deck
      const zr = Math.round(halfW[x]);
      for (let z = -zr; z <= zr; z++) v.set(x, H, z, x % 2 ? deck : shade(deck, 0.9));
      // rails
      if (x > 0 && x < L - 1) {
        v.set(x, H + 1, zr, trim); v.set(x, H + 1, -zr, trim);
      }
    }
    const railZ = x => Math.round(halfW[Math.max(0, Math.min(L - 1, x))]);
    // gun ports
    const rows = d.rows;
    for (let r = 0; r < rows; r++) {
      const y = H - 2 - r * 2;
      if (y < 1) continue;
      for (let x = Math.round(L * 0.22); x < L * 0.78; x += 3) {
        const zr = Math.ceil(halfW[x] * (0.45 + 0.55 * Math.pow(y / Math.max(1, H - 1), 0.7)));
        for (const sgn of [1, -1]) {
          v.set(x, y, sgn * zr, '#1a1410');
          v.set(x, y, sgn * (zr + 1), '#2a2a2a');
        }
      }
    }
    // deck cannons on carriages, muzzles over the rail
    {
      const n = opts.tier === 0 ? 1 : Math.min(3, 1 + Math.floor(opts.tier / 2));
      for (let k = 0; k < n; k++) {
        const x = Math.round(L * (0.34 + k * 0.14)) + (opts.tier === 0 ? 1 : 0);
        const zr = railZ(x);
        if (zr < 2) continue;
        for (const sgn of [1, -1]) {
          v.set(x, H + 1, sgn * (zr - 1), '#5a3a1e');
          v.set(x - 1, H + 1, sgn * (zr - 1), '#5a3a1e');
          v.set(x, H + 2, sgn * (zr - 1), '#2a2a2a');
          v.set(x, H + 2, sgn * zr, '#2a2a2a');
        }
      }
    }
    // cargo hatch grating and barrels
    {
      const hx = Math.round(L * (d.masts.length > 1 ? (d.masts[0] + d.masts[1]) / 2 : 0.3));
      for (let x = hx - 1; x <= hx + 1; x++) for (let z = -1; z <= 1; z++) v.set(x, H, z, (x + z) % 2 ? '#3a2614' : '#6b4a2e');
      if (opts.tier >= 1) {
        const bx = Math.round(L * 0.82);
        const zr = railZ(bx);
        if (zr >= 2) { v.set(bx, H + 1, zr - 1, '#8a5a32'); v.set(bx, H + 2, zr - 1, '#9a6b3e'); v.set(bx - 1, H + 1, zr - 1, '#7a4a2a'); }
      }
    }
    // anchors hanging at the bow
    {
      const ax = Math.max(1, L - 4);
      const zr = Math.ceil(halfW[ax]) + 1;
      for (const sgn of [1, -1]) {
        v.set(ax, H - 1, sgn * zr, '#3a3a3a');
        if (H > 2) { v.set(ax, H - 2, sgn * zr, '#3a3a3a'); v.set(ax - 1, H - 2, sgn * zr, '#3a3a3a'); v.set(ax + 1, H - 2, sgn * zr, '#3a3a3a'); }
      }
    }
    // stern castle
    const cx = Math.round(L * d.castle);
    let sternTop = H + 1;
    if (cx > 0) {
      const top = H + (d.high ? 3 : 2);
      sternTop = top + 1;
      for (let x = 0; x < cx; x++) {
        const zr = Math.round(halfW[x]);
        for (let y = H + 1; y < top; y++) for (let z = -zr; z <= zr; z++) v.set(x, y, z, y === top - 1 ? trim : hull);
        for (let z = -zr; z <= zr; z++) v.set(x, top, z, x % 2 ? deck : shade(deck, 0.9));
        v.set(x, top + 1, zr, trim); v.set(x, top + 1, -zr, trim);
      }
      // stern gallery: lit windows between trim posts, a second row on tall castles
      const zr0 = Math.round(halfW[0]);
      for (let z = -zr0; z <= zr0; z++) {
        for (let y = H + 1; y <= (d.high || H >= 6 ? H + 2 : H + 1); y++) {
          if ((z + zr0) % 2 === 1) glow.set(-1, y, z, lamp); else v.set(-1, y, z, trim);
        }
        v.set(-1, H, z, shade(trim, 0.8));
      }
      v.set(0, top + 1, 0, trim);
      // stern lanterns on posts
      glow.set(0, top + 2, zr0, lamp);
      glow.set(0, top + 2, -zr0, lamp);
      v.set(0, top + 3, zr0, '#2a2a2a'); v.set(0, top + 3, -zr0, '#2a2a2a');
      // ship's wheel at the front edge of the castle
      const wx = cx;
      v.set(wx, H + 1, 0, '#5a3a1e'); v.set(wx, H + 2, 0, '#5a3a1e');
      v.set(wx, H + 4, 0, '#6b4423'); v.set(wx, H + 3, 1, '#6b4423'); v.set(wx, H + 3, -1, '#6b4423');
      v.set(wx, H + 3, 0, '#f0c03a');
    } else {
      // small boats: one lantern on a post at the stern
      v.set(1, H + 1, 0, '#5a3a1e');
      glow.set(1, H + 2, 0, lamp);
    }
    // forecastle
    if (opts.tier >= 3) {
      for (let x = Math.round(L * 0.84); x < L - 1; x++) {
        const zr = Math.round(halfW[x]);
        for (let z = -zr; z <= zr; z++) v.set(x, H + 1, z, deck);
      }
    }
    // bowsprit
    const bx = L - 1, bLen = 3 + Math.round(opts.tier * 0.8);
    const tipX = bx + bLen, tipY = H + 3 + Math.round(opts.tier / 2);
    v.line(bx, H + 1, 0, tipX, tipY, 0, '#5a3a1e');
    // figurehead
    v.set(L, H - 1, 0, P.trim);
    if (opts.tier >= 2) glow.set(tipX - 1, tipY - 1, 0, lamp);

    // masts, yards, sails (sails and flags are cloth: separate voxel sets)
    const mastTops = [];
    const mastC = '#6b4423', yardC = '#4f321a';
    const masts = [];
    d.masts.forEach((m, mi) => {
      const mx = Math.round(L * m);
      const mainBoost = d.masts.length > 1 && mi === Math.floor(d.masts.length / 2) ? 2 : 0;
      const mh = d.mh + mainBoost - (mi === d.masts.length - 1 && d.masts.length > 2 ? 2 : 0);
      const top = H + mh;
      if (P.steam) {
        // Steam ships: funnels instead of masts.
        const fh = 5 + Math.round(opts.tier * 0.6);
        for (let y = H + 1; y <= H + fh; y++)
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
            if (Math.abs(dx) + Math.abs(dz) < 2) v.set(mx + dx, y, dz, y > H + fh - 2 ? '#1b1b1b' : (P.rivets && y % 2 ? shade(hull, 1.2) : hull));
        mastTops.push([mx, H + fh + 1, 0]);
        return;
      }
      for (let y = H + 1; y <= top; y++) v.set(mx, y, 0, y > top - 2 ? shade(mastC, 0.85) : mastC);
      mastTops.push([mx, top, 0]);
      masts.push({ mx, top, mh, main: !!mainBoost });
      if (!P.sail) return;
      const sw = Math.round(W / 2) + 1;
      const sails = opts.tier >= 3 ? [[H + 3, H + Math.round(mh * 0.55)], [H + Math.round(mh * 0.55) + 2, top - 2]] :
        [[H + 3, top - 2]];
      sails.forEach(([y0, y1], si) => {
        const w = si === 0 ? sw : sw - 1;
        const sv = new Vox();
        for (let z = -w - 1; z <= w + 1; z++) { v.set(mx + 1, y1 + 1, z, yardC); v.set(mx + 1, y0 - 1, z, yardC); }
        for (let y = y0; y <= y1; y++) {
          for (let z = -w; z <= w; z++) {
            if (P.tattered && rnd() < P.tattered && y < y1 - 1) continue;
            let c = P.sail;
            if (P.stripe && (y - y0) % 2 === 0) c = P.stripe;
            if (P.patch && rnd() < 0.12) c = P.patch;
            const inner = Math.abs(z) < w && y > y0 && y < y1;
            sv.set(mx + (inner ? 2 : 1), y, z, c);
            if (inner && Math.abs(z) < w - 1) sv.set(mx + 1, y, z, shade(c, 0.94));
            // reef points: a darker row near the top of big sails
            if (!P.stripe && y === y1 - 1 && (z + 10) % 2 === 0 && w > 2) sv.set(mx + (inner ? 2 : 1), y, z, shade(c, 0.86));
          }
        }
        // Emblem on the biggest sail of the main mast.
        if (si === 0 && P.emblem && mainBoost && EMBLEMS[P.emblem]) {
          const em = EMBLEMS[P.emblem];
          const ey = Math.round((y0 + y1) / 2) + Math.floor(em.length / 2);
          em.forEach((row, ri) => {
            for (let k = 0; k < row.length; k++) if (row[k] === 'X') sv.set(mx + 3, ey - ri, k - Math.floor(row.length / 2), P.fg || '#fff');
          });
        }
        cloth.push({ vox: sv, fn: sailWeight(y0, y1, w, 0.05 + 0.012 * w) });
      });
      if (d.nest && mainBoost) {
        const ny = top - 3;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) v.set(mx + dx, ny, dz, '#5a3a1e');
        v.set(mx + 1, ny + 1, 1, '#5a3a1e'); v.set(mx - 1, ny + 1, -1, '#5a3a1e');
      }
    });
    // single mast boats still get an emblem
    if (d.masts.length === 1 && P.emblem && P.sail && EMBLEMS[P.emblem] && opts.tier >= 1 && cloth.length) {
      const mx = Math.round(L * d.masts[0]);
      const em = EMBLEMS[P.emblem];
      const y0 = H + 3, y1 = H + d.mh - 2;
      const ey = Math.round((y0 + y1) / 2) + Math.floor(em.length / 2);
      em.forEach((row, ri) => {
        for (let k = 0; k < row.length; k++) if (row[k] === 'X') cloth[0].vox.set(mx + 3, ey - ri, k - Math.floor(row.length / 2), P.fg || '#fff');
      });
    }
    // jib sail from the bowsprit to the fore mast
    if (P.sail && opts.tier >= 2) {
      const fm = Math.round(L * d.masts[d.masts.length - 1]);
      const topY = H + d.mh - 4;
      const jv = new Vox();
      for (let x = fm + 2; x < tipX; x++) {
        const t = (x - fm) / (tipX - fm);
        const yTop = Math.round(topY + (tipY - topY) * t);
        const yBot = Math.round(H + 2 + (tipY - H - 2) * t);
        for (let y = yBot; y <= yTop; y++) {
          if (P.tattered && rnd() < P.tattered) continue;
          jv.set(x, y, 0, shade(P.sail, 0.97));
        }
      }
      const x0 = fm + 2, x1 = tipX;
      cloth.push({ vox: jv, fn: (x, y, z, vx) => [0, 0, 0.1 * Math.sin(Math.PI * Math.max(0, Math.min(1, (vx - x0) / (x1 - x0))))] });
    }
    // flag on the tallest mast, pennants on the others
    if (P.flag && mastTops.length) {
      let best = mastTops[0];
      for (const m of mastTops) if (m[1] > best[1]) best = m;
      const [fx, fy] = best;
      const fv = new Vox();
      for (let x = fx - 5; x <= fx - 1; x++) for (let y = fy - 2; y <= fy; y++) fv.set(x, y, 0, P.flag);
      fv.set(fx - 3, fy - 1, 0, P.fg || '#fff');
      fv.set(fx - 2, fy, 0, P.fg || '#fff');
      fv.set(fx - 4, fy, 0, P.fg || '#fff');
      cloth.push({ vox: fv, fn: flagWeight(fx, 0.028) });
      v.set(fx, fy + 1, 0, '#f0c03a');
      if (!P.steam) {
        for (const m of mastTops) {
          if (m === best) continue;
          const pv = new Vox();
          const pc = P.fg && P.fg !== '#fff' ? P.fg : trim;
          pv.set(m[0] - 1, m[1], 0, pc); pv.set(m[0] - 2, m[1], 0, pc); pv.set(m[0] - 3, m[1], 0, P.flag);
          cloth.push({ vox: pv, fn: flagWeight(m[0], 0.03) });
        }
      }
      // stern ensign on a staff
      if (cx > 0) {
        v.line(-1, sternTop, 0, -2, sternTop + 4, 0, '#5a3a1e');
        const ev = new Vox();
        for (let x = -5; x <= -3; x++) for (let y = sternTop + 2; y <= sternTop + 3; y++) ev.set(x, y, 0, x === -4 && y === sternTop + 3 ? (P.fg || '#fff') : P.flag);
        cloth.push({ vox: ev, fn: flagWeight(-2, 0.03) });
      }
    }
    if (P.gears) {
      for (const sgn of [1, -1]) {
        const gx = Math.round(L * 0.5), gy = Math.round(H * 0.6), gz = sgn * (Math.ceil(W / 2) + 1);
        for (let a = 0; a < 16; a++) {
          const ang = a / 16 * Math.PI * 2;
          v.set(gx + Math.round(Math.cos(ang) * 3), gy + Math.round(Math.sin(ang) * 2), gz, a % 2 ? '#e0b04a' : '#8a6420');
        }
        v.set(gx, gy, gz, '#e0b04a');
      }
    }

    // Rigging (voxel-space points; voxel centres are at +0.5).
    const seg = (a, b) => rig.push([a, b]);
    const railPt = (x, sgn) => { const zr = railZ(x); return [x + 0.5, H + 2, sgn > 0 ? zr + 0.5 : -zr + 0.5]; };
    masts.forEach((m, mi) => {
      const yS = m.top - (m.main && d.nest ? 3 : 2);
      // shrouds with ratlines (rope ladders) on both sides
      for (const sgn of [1, -1]) {
        const feet = [m.mx - 2, m.mx - 1, m.mx].map(x => railPt(Math.max(1, x), sgn));
        const head = [m.mx + 0.5, yS, 0.5];
        feet.forEach(f => seg(head, f));
        const y0 = H + 3, y1 = yS - 1;
        for (let y = y0; y < y1; y += 1.5) {
          const pts = feet.map(f => {
            const t = (y - f[1]) / (head[1] - f[1]);
            return [f[0] + (head[0] - f[0]) * t, y, f[2] + (head[2] - f[2]) * t];
          });
          seg(pts[0], pts[1]); seg(pts[1], pts[2]);
        }
      }
      // stays: forward to the next mast, the last one to the bowsprit tip
      const topPt = [m.mx + 0.5, m.top + 1, 0.5];
      if (mi < masts.length - 1) seg(topPt, [masts[mi + 1].mx + 0.5, H + Math.round(masts[mi + 1].mh * 0.45), 0.5]);
      else seg(topPt, [tipX + 0.5, tipY + 0.5, 0.5]);
      // backstays down to the rails behind the mast
      if (mi === 0) seg(topPt, [Math.max(0.5, m.mx - 6.5), sternTop + 1, 0.5]);
      // braces from the yard ends to the rail
      if (P.sail) for (const sgn of [1, -1]) {
        const yh = Math.round(W / 2) + (opts.tier >= 3 ? 1 : 2);
        seg([m.mx + 1.5, m.top - 1, sgn > 0 ? yh + 0.5 : -yh + 0.5], railPt(Math.max(1, m.mx - 3), sgn));
      }
    });
    if (opts.tier >= 2 && masts.length) {
      const fm = masts[masts.length - 1];
      seg([fm.mx + 0.5, H + d.mh - 3, 0.5], [tipX + 0.5, tipY + 0.5, 0.5]);
      // bobstay under the bowsprit
      seg([tipX + 0.5, tipY, 0.5], [L + 0.5, H - 1, 0.5]);
    }

    return {
      vox: v, glow, cloth, rig, waterline: Math.round(H * 0.42), length: L, height: H, halfW: W / 2,
      deckY: H + 1, mastTops,
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
  function palm(h, seed) {
    const rnd = VC.util.rng(seed || 1);
    const v = new Vox();
    const lean = rnd() * 2 - 1;
    let x = 0, z = 0;
    for (let y = 0; y < h; y++) {
      x += lean * 0.18; z += (rnd() - 0.5) * 0.2;
      v.set(x, y, z, y % 2 ? '#8a6238' : '#9a7044');
    }
    const ty = h;
    const leaf = ['#2f9e44', '#37b24d', '#2b8a3e'];
    for (let a = 0; a < 6; a++) {
      const ang = a / 6 * Math.PI * 2 + rnd() * 0.3;
      for (let k = 1; k <= 5; k++) {
        v.set(x + Math.cos(ang) * k, ty + 1 - Math.floor(k * k / 8), z + Math.sin(ang) * k, leaf[(a + k) % 3]);
      }
    }
    v.set(x, ty, z, '#2f9e44');
    v.set(x + 1, ty - 1, z, '#6b4a2e'); v.set(x - 1, ty - 1, z, '#6b4a2e'); v.set(x, ty - 1, z + 1, '#6b4a2e');
    return v;
  }

  /** Detailed palm: ringed 2x2 trunk, drooping fronds with leaflets, coconuts. */
  function palmHD(h, seed) {
    const rnd = VC.util.rng(seed || 1);
    const v = new Vox();
    const ang0 = rnd() * Math.PI * 2, lean = 0.25 + rnd() * 0.35;
    const lx = Math.cos(ang0) * lean, lz = Math.sin(ang0) * lean;
    let x = 0, z = 0;
    for (let y = 0; y < h; y++) {
      const k = y / h;
      x = Math.round(lx * k * k * h * 0.6); z = Math.round(lz * k * k * h * 0.6);
      const c = y % 3 === 0 ? '#6e4c2a' : (y % 3 === 1 ? '#8a6238' : '#9a7044');
      v.box(x, y, z, x + 1, y, z + 1, c);
    }
    const tx = x + 0.5, tz = z + 0.5;
    const leaf = ['#2f9e44', '#37b24d', '#2b8a3e', '#45b84e'];
    const n = 6 + (rnd() * 2 | 0);
    for (let a = 0; a < n; a++) {
      const ang = a / n * Math.PI * 2 + rnd() * 0.5;
      const len = 6 + rnd() * 3;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let k = 1; k <= len; k++) {
        const t = k / len;
        const fx = tx + ca * k, fz = tz + sa * k, fy = h + 1 + 2.2 * t - 7 * t * t;
        v.set(fx, fy, fz, leaf[(a + k) % 4]);
        if (k > 1 && k < len - 1 && k % 2 === 0) {
          v.set(fx - sa, fy - 1, fz + ca, leaf[(a + k + 1) % 4]);
          v.set(fx + sa, fy - 1, fz - ca, leaf[(a + k + 2) % 4]);
        }
      }
    }
    v.box(Math.floor(tx) - 1, h - 1, Math.floor(tz), Math.floor(tx) - 1, h, Math.floor(tz), '#5a3a1e');
    v.box(Math.floor(tx) + 1, h - 2, Math.floor(tz) - 1, Math.floor(tx) + 1, h - 1, Math.floor(tz) - 1, '#6b4a2e');
    v.box(Math.floor(tx), h - 1, Math.floor(tz) + 1, Math.floor(tx), h, Math.floor(tz) + 1, '#5a3a1e');
    v.box(Math.floor(tx) - 1, h, Math.floor(tz) - 1, Math.floor(tx) + 1, h, Math.floor(tz) + 1, '#2b8a3e');
    return v;
  }

  /** Broadleaf jungle tree (low detail). */
  function tree(seed) {
    const rnd = VC.util.rng(seed || 2);
    const v = new Vox();
    const h = 4 + Math.round(rnd() * 3);
    for (let y = 0; y < h; y++) v.set(0, y, 0, y % 2 ? '#6b4a2e' : '#5a3d22');
    v.set(1, h - 2, 0, '#5a3d22'); v.set(-1, h - 1, 1, '#5a3d22');
    const greens = ['#3f8f3a', '#4fa64a', '#357a32', '#5cb84f'];
    const blobs = 3 + Math.round(rnd() * 2);
    for (let b = 0; b < blobs; b++) {
      const bx = (rnd() - 0.5) * 3, bz = (rnd() - 0.5) * 3, by = h + rnd() * 2;
      const r = 1.8 + rnd() * 1.3;
      v.ball(bx, by, bz, r, r * 0.8, r, (x, y, z) => greens[(y > by ? 3 : 0) + ((x * 7 + z * 3 + y) & 1) * (y > by ? -1 : 2) & 3]);
    }
    if (rnd() < 0.35) for (let k = 0; k < 4; k++) v.set((rnd() - 0.5) * 4, h + rnd() * 2, 2 + rnd(), rnd() < 0.5 ? '#ff7b3a' : '#ffd23f');
    return v;
  }

  /** Bush, optionally with flowers (low detail). */
  function bush(seed) {
    const rnd = VC.util.rng(seed || 3);
    const v = new Vox();
    const r = 1.2 + rnd() * 0.9;
    v.ball(0, 0, 0, r, r * 0.8, r, (x, y, z) => (y > 0 ? ((x + z) & 1 ? '#3f9a3e' : '#47a443') : '#357f34'), (x, y) => y >= 0);
    if (rnd() < 0.45) {
      const fc = ['#ff6fa8', '#ffd23f', '#ff7b3a', '#b07aff'][(rnd() * 4) | 0];
      for (let k = 0; k < 4; k++) v.set(Math.round((rnd() - 0.5) * r * 1.6), Math.round(r * 0.7), Math.round((rnd() - 0.5) * r * 1.6), fc);
    }
    return v;
  }

  function rock(seed) {
    const rnd = VC.util.rng(seed || 5);
    const v = new Vox();
    v.ball(0, 0, 0, 2 + rnd() * 2, 1.5 + rnd() * 1.5, 2 + rnd() * 2, () => (rnd() < 0.3 ? '#9a9a96' : '#7f7f7b'), (x, y) => y >= 0);
    return v;
  }

  /** HD ground clutter: flowers, grass tufts, shells, starfish, driftwood. */
  function flowers(seed) {
    const rnd = VC.util.rng(seed || 4);
    const v = new Vox();
    const fc = [['#ff6fa8', '#ffd23f'], ['#ffffff', '#ffd23f'], ['#b07aff', '#fff2a0'], ['#ff5a3a', '#ffd23f']][(rnd() * 4) | 0];
    for (let k = 0; k < 7; k++) {
      const x = Math.round((rnd() - 0.5) * 7), z = Math.round((rnd() - 0.5) * 7);
      const h = 1 + ((rnd() * 2) | 0);
      for (let y = 0; y < h; y++) v.set(x, y, z, '#3f8f3a');
      v.set(x, h, z, fc[0]);
      if (rnd() < 0.5) { v.set(x + 1, h, z, fc[0]); v.set(x, h + 1, z, fc[1]); }
    }
    return v;
  }
  function grass(seed) {
    const rnd = VC.util.rng(seed || 6);
    const v = new Vox();
    for (let k = 0; k < 6; k++) {
      const x = Math.round((rnd() - 0.5) * 5), z = Math.round((rnd() - 0.5) * 5);
      const h = 1 + ((rnd() * 3) | 0);
      for (let y = 0; y < h; y++) v.set(x, y, z, y === h - 1 ? '#6cc251' : '#4fa64a');
    }
    return v;
  }
  function shells(seed) {
    const rnd = VC.util.rng(seed || 7);
    const v = new Vox();
    for (let k = 0; k < 4; k++) {
      const x = Math.round((rnd() - 0.5) * 8), z = Math.round((rnd() - 0.5) * 8);
      const c = ['#ffd1dc', '#fff4e0', '#f2b8a0', '#e0d6ff'][k % 4];
      v.set(x, 0, z, c); if (rnd() < 0.5) v.set(x + 1, 0, z, shade(c, 0.9));
    }
    if (rnd() < 0.5) {
      const x = Math.round((rnd() - 0.5) * 6), z = Math.round((rnd() - 0.5) * 6);
      v.set(x, 0, z, '#ff8a3a'); v.set(x + 1, 0, z, '#ff8a3a'); v.set(x - 1, 0, z, '#ff8a3a'); v.set(x, 0, z + 1, '#ff8a3a'); v.set(x, 0, z - 1, '#ff8a3a');
    }
    return v;
  }
  function driftwood(seed) {
    const rnd = VC.util.rng(seed || 8);
    const v = new Vox();
    const len = 7 + ((rnd() * 5) | 0);
    for (let x = 0; x < len; x++) v.box(x, 0, Math.round(Math.sin(x * 0.5) * 0.8), x, x % 3 === 0 ? 1 : 0, Math.round(Math.sin(x * 0.5) * 0.8), x % 2 ? '#b59a78' : '#a08664');
    v.set(len - 2, 1, 2, '#a08664'); v.set(len - 1, 1, 3, '#a08664');
    return v;
  }

  // ------------------------------------------------------------------ detail kit (0.125 units per voxel)
  // Island models are a "part set": solid voxels, glowing voxels (windows, lamps, fire; lit at night),
  // cloth (flags and banners for the cloth shader) and smoke emitters (voxel positions):
  //   { v: Vox, g: Vox, cloth: [{ vox, fn }], smoke: [[x, y, z], ...] }
  // y = 0 is the first layer above the ground; the front (door side) faces +z.
  const HD = 0.125;
  const LAMP = '#ffd36b';
  function parts() { return { v: new Vox(), g: new Vox(), cloth: [], smoke: [] }; }
  function lit(P, x, y, z, c) { P.v.del(x, y, z); P.g.set(x, y, z, c || LAMP); }
  function hash(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
  const planks = (c) => (x, y) => (y % 2 ? c : shade(c, 0.9));
  const stone = (c) => (x, y, z) => { const h = hash(x >> 1, y, z >> 1); return h < 0.3 ? shade(c, 0.88) : h > 0.8 ? shade(c, 1.08) : c; };
  const brick = (c) => (x, y, z) => ((y % 2 === 0 && (x + z) % 4 === 0) || (y % 2 === 1 && (x + z + 2) % 4 === 0) ? shade(c, 0.8) : hash(x, y, z) < 0.2 ? shade(c, 1.08) : c);
  /** Plaster with a dark timber frame (corner posts, posts every 4 voxels, beams at y0/y1). */
  const timber = (c, beam, x0, x1, z0, z1, y0, y1) => (x, y, z) => {
    if (y === y0 || y === y1) return beam;
    const onZ = z === z0 || z === z1, onX = x === x0 || x === x1;
    if ((onZ && (x - x0) % 4 === 0) || (onX && (z - z0) % 4 === 0) || (onZ && onX)) return beam;
    return c;
  };

  /** Solid block with a surface colour function. */
  function block(P, x0, y0, z0, x1, y1, z1, c) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) P.v.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
  }
  /** Window in a wall facing +z (dir 1) or -z: lit panes, frame, sill, optional shutters. */
  function winZ(P, x, y, z, w, h, frame, shutter, glass) {
    for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) {
      const pane = i >= 0 && i < w && j >= 0 && j < h && !(w >= 3 && i === 1) && !(h >= 3 && j === 1);
      if (pane) lit(P, x + i, y + j, z, glass || LAMP);
      else P.v.set(x + i, y + j, z, frame);
    }
    P.v.box(x - 1, y - 1, z + 1, x + w, y - 1, z + 1, frame);
    if (shutter) for (let j = 0; j < h; j++) { P.v.set(x - 1, y + j, z + 1, shutter); P.v.set(x + w, y + j, z + 1, shutter); }
  }
  /** Window in a wall facing +x (dir 1) or -x (dir -1). */
  function winX(P, x, y, z, w, h, frame, dir, glass) {
    for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) {
      const pane = i >= 0 && i < w && j >= 0 && j < h;
      if (pane) lit(P, x, y + j, z + i, glass || LAMP);
      else P.v.set(x, y + j, z + i, frame);
    }
    P.v.box(x + dir, y - 1, z - 1, x + dir, y - 1, z + w, frame);
  }
  /** Door in a wall facing +z, with frame and knob. */
  function doorZ(P, x, z, w, h, c, frame, y0) {
    y0 = y0 || 0;
    for (let i = -1; i <= w; i++) for (let j = 0; j <= h; j++) {
      if (i >= 0 && i < w && j < h) P.v.set(x + i, y0 + j, z, i % 2 ? c : shade(c, 0.85));
      else P.v.set(x + i, y0 + j, z, frame);
    }
    P.v.set(x + w - 1, y0 + Math.floor(h / 2), z + 1, '#f0c03a');
  }
  function tileC(c1, c2, x, k) { const c = k & 1 ? c1 : c2; return (x + (k & 1) * 2) % 4 === 0 ? shade(c, 0.85) : c; }
  /** Gable roof with the ridge along x (the tiled slope faces the camera). Returns the ridge layer. */
  function roofX(P, x0, x1, z0, z1, y, c1, c2, gable, over) {
    over = over === undefined ? 1 : over;
    let k = 0;
    for (;; k++) {
      const za = z0 - over + k, zb = z1 + over - k;
      if (za > zb) break;
      for (let x = x0 - over; x <= x1 + over; x++) {
        const t = za === zb || za + 1 === zb ? shade(c1, 0.72) : tileC(c1, c2, x, k);
        P.v.set(x, y + k, za, t); P.v.set(x, y + k, zb, t);
        if (x >= x0 && x <= x1) for (let z = za + 1; z < zb; z++) P.v.set(x, y + k, z, (x === x0 || x === x1) && gable ? gable : c1);
      }
    }
    return y + k - 1;
  }
  /** Gable roof with the ridge along z (a gable end faces the camera). */
  function roofZ(P, x0, x1, z0, z1, y, c1, c2, gable, over) {
    over = over === undefined ? 1 : over;
    let k = 0;
    for (;; k++) {
      const xa = x0 - over + k, xb = x1 + over - k;
      if (xa > xb) break;
      for (let z = z0 - over; z <= z1 + over; z++) {
        const t = xa === xb || xa + 1 === xb ? shade(c1, 0.72) : tileC(c1, c2, z, k);
        P.v.set(xa, y + k, z, t); P.v.set(xb, y + k, z, t);
        if (z >= z0 && z <= z1) for (let x = xa + 1; x < xb; x++) P.v.set(x, y + k, z, (z === z0 || z === z1) && gable ? gable : c1);
      }
    }
    return y + k - 1;
  }
  /** Hipped / pyramid roof. */
  function roofHip(P, x0, x1, z0, z1, y, c1, c2, over) {
    over = over === undefined ? 1 : over;
    let k = 0;
    for (;; k++) {
      const xa = x0 - over + k, xb = x1 + over - k, za = z0 - over + k, zb = z1 + over - k;
      if (xa > xb || za > zb) break;
      for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) {
        const edge = x === xa || x === xb || z === za || z === zb;
        P.v.set(x, y + k, z, edge ? tileC(c1, c2, x + z, k) : c1);
      }
    }
    return y + k - 1;
  }
  function chimney(P, x, z, y0, y1, c) {
    block(P, x, y0, z, x + 1, y1, z + 1, stone(c || '#8c8c88'));
    P.v.box(x - 0, y1 + 1, z, x + 1, y1 + 1, z + 1, '#3a3a3a');
    P.smoke.push([x + 1, y1 + 2, z + 1]);
  }
  function barrel(P, x, y, z, c) {
    c = c || '#8a5a32';
    for (let yy = 0; yy < 4; yy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (dx && dz && (yy === 0 || yy === 3)) continue;
      P.v.set(x + dx, y + yy, z + dz, yy === 1 || yy === 3 ? '#5a5048' : ((dx + dz) & 1 ? c : shade(c, 0.86)));
    }
  }
  function crate(P, x, y, z, n, c) {
    n = n || 3; c = c || '#a0703c';
    for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) for (let dz = 0; dz < n; dz++) {
      const e = (dx === 0 || dx === n - 1) + (dy === 0 || dy === n - 1) + (dz === 0 || dz === n - 1);
      P.v.set(x + dx, y + dy, z + dz, e >= 2 ? shade(c, 0.72) : c);
    }
  }
  function sack(P, x, y, z, c) {
    c = c || '#c9b07a';
    P.v.box(x, y, z, x + 1, y + 1, z + 1, c); P.v.set(x, y + 2, z, shade(c, 0.85));
  }
  /** Lantern on a post (or hanging when h is 0): dark cap, lit glass. */
  function lamp(P, x, y, z, h, c) {
    for (let k = 0; k < h; k++) P.v.set(x, y + k, z, '#4a3a2a');
    lit(P, x, y + h, z, c || LAMP);
    P.v.set(x, y + h + 1, z, '#2a2a2a');
  }
  function torch(P, x, y, z, h) {
    for (let k = 0; k < h; k++) P.v.set(x, y + k, z, '#6b4423');
    lit(P, x, y + h, z, '#ff9a2a'); lit(P, x, y + h + 1, z, '#ffd23f');
  }
  /** Pole with a cloth flag extending toward -x. */
  function flag(P, x, y0, z, h, w, fh, c, c2) {
    for (let k = 0; k <= h; k++) P.v.set(x, y0 + k, z, '#5a3a1e');
    P.v.set(x, y0 + h + 1, z, '#f0c03a');
    const f = new Vox();
    const mi = Math.ceil(w / 2), mj = Math.floor(fh / 2);
    for (let i = 1; i <= w; i++) for (let j = 0; j < fh; j++) {
      const mark = c2 && ((i === mi && (j === mj || j === mj - 1)) || (j === mj && Math.abs(i - mi) === 1));
      f.set(x - i, y0 + h - j, z, mark ? c2 : c);
    }
    P.cloth.push({ vox: f, fn: flagWeight(x, 0.016) });
    return f;
  }
  /** Fence along x or z between two points (inclusive), posts every 3. */
  function fence(P, x0, z0, x1, z1, y, c) {
    c = c || '#8a6238';
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), z = Math.round(z0 + (z1 - z0) * i / n);
      if (i % 3 === 0) P.v.box(x, y, z, x, y + 3, z, shade(c, 0.85));
      P.v.set(x, y + 1, z, c); P.v.set(x, y + 3, z, c);
    }
  }
  function seal(P, x, y, z, c, face) {
    // round emblem 5x5 (coin, rosette) on a wall facing +z
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      if (Math.abs(i) + Math.abs(j) > 3) continue;
      P.v.set(x + i, y + j, z, Math.abs(i) + Math.abs(j) === 3 || (i === 0 && j === 0) ? shade(c, 0.75) : c);
    }
  }

  // ------------------------------------------------------------------ buildings (footprint x,z in -7..6, door to +z)
  const BUILD = {
    hut(P) {
      const v = P.v;
      // plank platform on stilts
      block(P, -7, 1, -5, 3, 1, 4, (x) => (x % 2 ? '#9a6b3e' : '#8a5a32'));
      for (const [x, z] of [[-7, -5], [3, -5], [-7, 4], [3, 4], [-2, 4], [-2, -5]]) v.set(x, 0, z, '#5a3a1e');
      // shack
      block(P, -6, 2, -4, 2, 8, 1, planks('#a0703c'));
      for (const [x, z] of [[-6, -4], [2, -4], [-6, 1], [2, 1]]) v.box(x, 2, z, x, 9, z, '#6b4a2e');
      doorZ(P, -4, 1, 2, 5, '#5a3a1e', '#6b4a2e', 2);
      winZ(P, -1, 5, 1, 2, 2, '#6b4a2e', '#3f7fae');
      roofX(P, -6, 2, -4, 1, 9, '#c9a24a', '#d9b45a', '#a0703c', 1);
      // drying nets on poles
      v.box(5, 0, -5, 5, 9, -5, '#6b4a2e'); v.box(5, 0, 3, 5, 9, 3, '#6b4a2e');
      v.box(5, 9, -4, 5, 9, 2, '#6b4a2e');
      for (let z = -4; z <= 2; z++) for (let y = 3; y <= 8; y++) if ((y + z) % 2 === 0) v.set(5, y, z, '#d8d0b0');
      v.set(5, 5, -1, '#9ab8c8'); v.set(5, 4, 1, '#c87a3a');
      // rowboat pulled up in front
      v.box(-1, 0, 5, 5, 0, 5, '#2f6bc0'); v.box(0, 1, 4, 4, 1, 4, '#2f6bc0'); v.box(0, 1, 6, 4, 1, 6, '#2f6bc0');
      v.box(-1, 1, 5, -1, 1, 5, '#2f6bc0'); v.box(5, 1, 5, 5, 2, 5, '#2f6bc0'); v.box(1, 0, 5, 3, 0, 5, '#6b4a2e');
      v.line(1, 1, 5, 4, 3, 2, '#c8a26a');
      // barrel, crate, hanging fish, lantern
      barrel(P, -6, 2, 3); crate(P, -7, 0, 5, 2);
      for (const z of [-3, -1]) { v.set(3, 6, z, '#9ab8c8'); v.set(3, 5, z, '#9ab8c8'); }
      lamp(P, -5, 7, 2, 0);
    },
    grove(P) {
      const v = P.v;
      for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) if (hash(x, 0, z) < 0.18) v.set(x, 0, z, hash(z, 1, x) < 0.5 ? '#4fa64a' : '#7a5a3a');
      [[palmHD(17, 11), -4, -4], [palmHD(13, 12), 3, -3], [palmHD(15, 13), -3, 3], [palmHD(11, 14), 3, 3]].forEach(([p, ox, oz]) => v.paste(p, ox, 0, oz));
      // coconut pile, baskets, sign
      for (const [x, z] of [[0, 2], [1, 2], [0, 3], [1, 1], [0, 1]]) v.set(x, 0, z, '#6b4a2e');
      v.set(0, 1, 2, '#5a3a1e'); v.set(1, 1, 2, '#6b4a2e');
      v.box(-1, 0, 5, 1, 1, 6, '#c9a24a'); v.box(0, 2, 5, 0, 2, 6, '#6b4a2e');
      v.box(5, 0, 5, 5, 3, 5, '#6b4a2e'); v.box(4, 3, 5, 6, 4, 5, '#c8a26a'); v.set(5, 4, 6, '#6b4a2e');
      // a ladder leaning on the big palm
      v.line(-6, 0, -2, -5, 9, -3, '#8a6238');
    },
    smoke(P) {
      const v = P.v;
      block(P, -6, 0, -5, 3, 4, 1, stone('#8c8c88'));
      block(P, -6, 5, -5, 3, 9, 1, planks('#8a5a32'));
      for (const [x, z] of [[-6, -5], [3, -5], [-6, 1], [3, 1]]) v.box(x, 5, z, x, 10, z, '#5a3a1e');
      roofX(P, -6, 3, -5, 1, 10, '#7a3a26', '#8a4a30', '#8a5a32', 1);
      chimney(P, 1, -3, 5, 19, '#7e7e7a');
      doorZ(P, -4, 1, 2, 4, '#4a3020', '#6e6e6a');
      lit(P, -1, 1, 1, '#ff7a2a'); lit(P, 0, 1, 1, '#ffb13a'); v.set(-2, 1, 1, '#3a3a3a'); v.set(1, 1, 1, '#3a3a3a');
      winZ(P, -3, 6, 1, 2, 2, '#5a3a1e', null, '#ff9a4a');
      // fish drying rack
      v.box(-6, 0, 4, -6, 6, 4, '#6b4a2e'); v.box(4, 0, 4, 4, 6, 4, '#6b4a2e'); v.box(-6, 6, 4, 4, 6, 4, '#6b4a2e');
      for (let x = -5; x <= 3; x += 2) { v.set(x, 5, 4, '#c8783a'); v.set(x, 4, 4, '#d88a4a'); v.set(x, 3, 4, '#b8682a'); }
      // firewood stack
      for (let z = -4; z <= 0; z++) for (let y = 0; y < 3; y++) v.set(5, y, z, (y + z) % 2 ? '#8a5a32' : '#6b4423');
      v.box(5, 0, -5, 5, 3, -5, '#5a3a1e');
      barrel(P, -7 + 1, 0, 3, '#7a4a2a');
    },
    tavern(P) {
      const v = P.v;
      block(P, -6, 0, -5, 5, 6, 2, stone('#b8ad98'));
      block(P, -7, 7, -6, 6, 12, 3, timber('#efe3c4', '#5a3a1e', -7, 6, -6, 3, 7, 12));
      const ry = roofX(P, -7, 6, -6, 3, 13, '#b03a2e', '#962f25', '#5a3a1e', 1);
      chimney(P, -5, -4, 13, ry + 2, '#8c8c88');
      // dormer
      block(P, 0, 15, 0, 3, 17, 1, '#efe3c4'); winZ(P, 1, 15, 1, 2, 2, '#5a3a1e'); roofZ(P, 0, 3, 0, 1, 18, '#b03a2e', '#962f25', null, 1);
      doorZ(P, -1, 2, 3, 5, '#6b4423', '#5a3a1e');
      v.box(-2, 6, 3, 3, 6, 4, '#8a3020'); // awning
      winZ(P, -5, 2, 2, 2, 2, '#5a3a1e'); winZ(P, 3, 2, 2, 2, 2, '#5a3a1e');
      winZ(P, -5, 8, 3, 2, 3, '#5a3a1e', '#2f7a46'); winZ(P, -1, 8, 3, 2, 3, '#5a3a1e', '#2f7a46'); winZ(P, 3, 8, 3, 2, 3, '#5a3a1e', '#2f7a46');
      // hanging sign with a mug
      v.box(6, 9, 4, 8, 9, 4, '#3a2614'); v.box(7, 5, 4, 8, 8, 4, '#6b4423');
      v.set(7, 6, 5, '#f0c03a'); v.set(7, 7, 5, '#fff4d0'); v.set(8, 6, 5, '#f0c03a'); v.set(8, 7, 5, '#f0c03a');
      barrel(P, 5, 0, 4); barrel(P, -6, 0, 4, '#7a4a2a');
      v.box(-4, 0, 5, -2, 1, 5, '#8a5a32'); // bench
      lamp(P, -2, 4, 3, 0);
    },
    fort(P) {
      const v = P.v;
      const st = stone('#9a9a96');
      // curtain walls
      for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) {
        if (x > -7 && x < 6 && z > -7 && z < 6) continue;
        for (let y = 0; y <= 5; y++) v.set(x, y, z, st(x, y, z));
        if ((x + z) % 2 === 0) v.set(x, 6, z, '#8a8a86');
      }
      v.box(-6, 0, -6, 5, 0, 5, '#7a7a76'); // courtyard
      // corner towers
      for (const [x, z] of [[-7, -7], [4, -7], [-7, 4], [4, 4]]) {
        block(P, x, 0, z, x + 2, 9, z + 2, stone('#a8a8a4'));
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) v.set(x + i, 10, z + j, '#8a8a86');
      }
      // keep
      block(P, -3, 0, -4, 2, 13, 1, stone('#a8a8a4'));
      for (let x = -3; x <= 2; x++) for (let z = -4; z <= 1; z++) if ((x === -3 || x === 2 || z === -4 || z === 1) && (x + z) % 2 === 0) v.set(x, 14, z, '#8a8a86');
      winZ(P, -1, 9, 1, 2, 2, '#6e6e6a', null, '#ffd36b');
      flag(P, 0, 14, -2, 9, 6, 4, '#111111', '#ffffff');
      // gate
      for (let x = -2; x <= 1; x++) for (let y = 0; y <= 3; y++) v.set(x, y, 6, y === 3 && (x === -2 || x === 1) ? '#9a9a96' : '#5a3a1e');
      v.box(-3, 4, 7, 2, 4, 7, '#8a8a86');
      // cannons poking out of the front wall
      for (const x of [-5, 3]) { v.set(x, 6, 6, '#2a2a2a'); v.set(x, 6, 7, '#2a2a2a'); v.set(x, 6, 5, '#5a3a1e'); }
      torch(P, -3, 4, 7, 1); torch(P, 2, 4, 7, 1);
      // cannonball pile
      v.set(-5, 1, -1, '#2a2a2a'); v.set(-4, 1, -1, '#2a2a2a'); v.set(-5, 1, 0, '#2a2a2a'); v.set(-5, 2, -1, '#3a3a3a');
    },
    distill(P) {
      const v = P.v;
      // open shed at the back with a lean-to roof
      block(P, -7, 0, -7, 6, 9, -6, planks('#a0703c'));
      for (const x of [-7, 6]) v.box(x, 0, -5, x, 9, -5, '#5a3a1e');
      for (let k = 0; k < 6; k++) for (let x = -8; x <= 7; x++) v.set(x, 10 - Math.floor(k / 2), -7 + k, tileC('#5a3a26', '#4a2e1e', x, k));
      winZ(P, -5, 4, -5, 2, 2, '#5a3a1e', null, '#ffb15a');
      // brick furnace with a fire under the copper pot still
      block(P, -6, 0, -3, -1, 2, 2, brick('#a8503a'));
      lit(P, -4, 1, 2, '#ff6a2a'); lit(P, -3, 1, 2, '#ffb13a');
      v.ball(-3.5, 6, -0.5, 3.2, 3.2, 3.2, (x, y, z) => (hash(x, y, z) < 0.18 ? '#ffc890' : y > 7 ? '#f0a060' : '#d8783a'), (x, y) => y >= 3);
      v.box(-4, 9, -1, -3, 12, 0, '#e0884a'); v.box(-4, 13, -1, -3, 13, 0, '#c8703a');
      v.line(-3, 13, 0, 3, 10, 0, '#e0884a');
      // coiled condenser into a barrel
      for (let y = 3; y <= 9; y++) { const a = y * 1.7; v.set(3 + Math.round(Math.cos(a) * 1.6), y, Math.round(Math.sin(a) * 1.6), '#f0a060'); }
      v.box(3, 0, 0, 3, 10, 0, '#c8703a');
      barrel(P, 3, 0, 3, '#7a4a2a');
      // stacked rum barrels and bottles
      barrel(P, -6, 0, 5); barrel(P, -3, 0, 5, '#7a4a2a'); barrel(P, -5, 4, 5, '#8a5a32');
      for (const [x, c] of [[1, '#3a7a3a'], [2, '#7a3a2a'], [0, '#3a7a3a']]) { v.set(x, 0, 6, c); v.set(x, 1, 6, c); v.set(x, 2, 6, '#c8a26a'); }
      // sign with a bottle
      v.box(6, 0, 4, 6, 6, 4, '#5a3a1e'); v.box(4, 5, 5, 7, 7, 5, '#c8a26a'); v.box(5, 5, 6, 5, 7, 6, '#3a7a3a'); v.set(5, 8, 6, '#3a7a3a');
      lamp(P, -1, 6, -5, 0);
    },
    sugar(P) {
      const v = P.v;
      // three rows of tall cane
      for (const z of [-6, -3, 0]) for (let x = -7; x <= 1; x++) {
        if (hash(x, 3, z) < 0.15) continue;
        const h = 9 + Math.floor(hash(x, 1, z) * 5);
        for (let y = 0; y < h; y++) v.set(x, y, z, y % 3 === 2 ? '#5a8a30' : '#7ab648');
        v.set(x, h, z, '#c9d65a'); v.set(x + (x & 1 ? 1 : -1) * 0, h + 1, z + 1, '#9ac83a');
        if (x % 2 === 0) v.set(x, h - 2, z + 1, '#9ac83a');
      }
      for (let x = -7; x <= 1; x++) for (const z of [-5, -2, 1]) v.set(x, 0, z, '#7a5a3a');
      // press shed with a thatched roof
      block(P, 2, 0, -6, 6, 5, -2, planks('#a0703c'));
      roofZ(P, 2, 6, -6, -2, 6, '#c9a24a', '#d9b45a', '#a0703c', 1);
      winZ(P, 3, 2, -2, 2, 2, '#6b4a2e');
      // round stone mill with a beam
      v.cyl(3.5, 0, 2.5, 2.2, 1, stone('#9a9a96'));
      v.box(3, 2, 2, 4, 3, 3, '#7a7a76');
      v.line(-1, 3, 2, 7, 3, 3, '#6b4423');
      // cane bundles and a cart
      for (let k = 0; k < 3; k++) v.box(-6 + k * 2, 0, 4, -6 + k * 2, 1, 6, '#a8c858');
      v.box(0, 1, 4, 3, 1, 6, '#8a5a32'); v.set(0, 0, 4, '#3a2614'); v.set(0, 0, 6, '#3a2614'); v.set(3, 0, 4, '#3a2614'); v.set(3, 0, 6, '#3a2614');
      v.box(1, 2, 5, 2, 2, 5, '#c9d65a');
    },
    market(P) {
      const v = P.v;
      const stall = (x0, z0, c1, c2, goods) => {
        for (const [dx, dz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) v.box(x0 + dx, 0, z0 + dz, x0 + dx, 6, z0 + dz, '#6b4a2e');
        for (let x = x0 - 1; x <= x0 + 5; x++) for (let z = z0 - 1; z <= z0 + 5; z++) {
          const y = 7 + (Math.min(z - z0 + 1, z0 + 5 - z) > 1 ? 1 : 0) + (Math.min(z - z0 + 1, z0 + 5 - z) > 2 ? 1 : 0);
          v.set(x, y, z, (x - x0) % 2 ? c1 : c2);
        }
        for (let x = x0 - 1; x <= x0 + 5; x++) v.set(x, 6, z0 + 5, (x - x0) % 2 ? c1 : c2);
        block(P, x0, 0, z0 + 3, x0 + 4, 2, z0 + 3, planks('#a0703c'));
        goods.forEach((c, i) => { v.set(x0 + i, 3, z0 + 3, c); if (i % 2) v.set(x0 + i, 4, z0 + 3, shade(c, 1.1)); });
      };
      stall(-7, -7, '#c8323a', '#f2efe6', ['#ff7b3a', '#ffd23f', '#3cb043', '#ff7b3a', '#e2553a']);
      stall(1, -7, '#3a7bd5', '#f2efe6', ['#9ab8c8', '#c8d8e0', '#9ab8c8', '#c8783a', '#9ab8c8']);
      stall(-3, 0, '#f0c03a', '#7a3fb0', ['#c8323a', '#3a7bd5', '#f0c03a', '#7a3fb0', '#3cb043']);
      crate(P, 4, 0, 1, 3); crate(P, 4, 3, 2, 2, '#8a5a32'); sack(P, 4, 0, 4); sack(P, -6, 0, 3); sack(P, -6, 0, 5, '#b8985a');
      barrel(P, -6, 0, 0);
      lamp(P, 0, 0, 6, 5);
      flag(P, -7, 8, 6, 3, 4, 2, '#7a3fb0', '#f0c03a');
    },
    yard(P) {
      const v = P.v;
      // slipway sloping toward the sea (+z)
      for (let z = -7; z <= 6; z++) for (let x = -5; x <= 3; x++) v.set(x, Math.max(0, Math.floor((2 - z) / 4)), z, (z + x) % 3 ? '#8a5a32' : '#7a4a2a');
      // keel, stem and ribs of a hull being built
      v.box(-1, 2, -6, -1, 2, 5, '#5a3a1e');
      v.line(-1, 2, 5, -1, 8, 7, '#5a3a1e');
      for (let z = -5; z <= 3; z += 2) {
        const w = 4 - Math.abs(z + 1) * 0.35;
        for (let a = 0; a <= 8; a++) {
          const t = a / 8 * Math.PI;
          v.set(-1 + Math.round(Math.cos(t) * w), 2 + Math.round(Math.sin(t) * 5), z, '#c8a26a');
        }
      }
      v.box(-4, 7, -5, 2, 7, -5, '#a07a4a'); v.box(-4, 4, -1, -4, 4, 3, '#a07a4a'); // planks on
      // wooden crane
      v.box(5, 0, -6, 5, 16, -6, '#6b4423'); v.box(4, 0, -7, 4, 3, -7, '#6b4423');
      v.line(5, 16, -6, -1, 15, -2, '#6b4423');
      v.line(-1, 15, -2, -1, 10, -2, '#d8d0b0'); v.box(-3, 9, -2, 1, 9, -2, '#8a5a32');
      // timber stack, tools, anchor
      for (let y = 0; y < 3; y++) v.box(4, y, -3 + y, 6, y, 5, (y % 2) ? '#a0703c' : '#8a5a32');
      v.box(-7, 0, 3, -6, 0, 6, '#3a3a3a'); v.box(-7, 1, 5, -7, 3, 5, '#3a3a3a'); v.box(-7, 3, 4, -7, 3, 6, '#3a3a3a');
      barrel(P, -6, 0, -4); torch(P, 3, 0, 6, 4);
    },
    mine(P) {
      const v = P.v;
      // rocky hill with gold veins
      const rockC = (x, y, z) => {
        const h = hash(x, y, z);
        if (h < 0.07) return '#ffd23f';
        return y > 8 && h < 0.5 ? '#7b8b5a' : h < 0.4 ? '#7a7a76' : h < 0.75 ? '#8a8a86' : '#6e6e6a';
      };
      v.ball(-1, 0, -2.5, 7.5, 10, 5, rockC, (x, y) => y >= 0);
      v.ball(3.5, 0, -3.5, 4, 7, 4, rockC, (x, y) => y >= 0);
      v.ball(-4.5, 0, -4, 3.5, 12, 3.5, rockC, (x, y) => y >= 0);
      for (let k = 0; k < 7; k++) lit(P, Math.round(-5 + k * 1.6), 2 + (k % 3) * 3, Math.round(1 - (k % 3)), '#ffd23f');
      // timbered tunnel entrance
      block(P, -3, 0, 1, 1, 5, 3, '#1a1410');
      v.box(-4, 0, 3, -4, 6, 3, '#6b4423'); v.box(2, 0, 3, 2, 6, 3, '#6b4423'); v.box(-4, 6, 3, 2, 6, 3, '#6b4423');
      v.box(-4, 7, 4, 2, 7, 4, '#5a3a1e'); v.box(-2, 8, 4, 0, 8, 4, '#c8a26a');
      // rails and a cart heaped with ore
      for (let z = 2; z <= 6; z++) { v.set(-2, 0, z, '#5a5a5a'); v.set(0, 0, z, '#5a5a5a'); if (z % 2) v.box(-2, 0, z, 0, 0, z, '#6b4423'); }
      v.box(-3, 1, 5, 1, 3, 6, '#6a6a6a'); v.box(-2, 4, 5, 0, 4, 6, '#ffd23f'); v.set(-1, 5, 5, '#fff2a0'); v.set(1, 4, 6, '#e0a020');
      lamp(P, -4, 7, 4, 0); lamp(P, 2, 7, 4, 0);
      // headframe winch tower on top
      v.line(-3, 9, -3, -1, 17, -3, '#6b4423'); v.line(1, 9, -3, -1, 17, -3, '#6b4423');
      v.box(-2, 16, -3, 0, 16, -3, '#5a3a1e'); v.cyl(-1, 17, -3, 1.2, 17, '#8a6238');
      v.line(-1, 16, -2, -1, 10, -1, '#d8d0b0');
      // pickaxe and a sack
      v.line(4, 0, 4, 6, 3, 3, '#8a6238'); v.box(5, 3, 2, 7, 3, 2, '#9a9a96'); sack(P, 4, 0, 1);
    },
    mint(P) {
      const v = P.v;
      block(P, -7, 0, -6, 6, 0, 5, '#cfc8b8'); block(P, -6, 1, -6, 5, 1, 4, '#ddd6c6');
      block(P, -6, 2, -6, 5, 10, 1, stone('#ece6d8'));
      for (const x of [-6, -3, 1, 4]) { v.box(x, 2, 3, x + 1, 10, 3, '#f8f4ea'); v.box(x, 2, 4, x + 1, 2, 4, '#ddd6c6'); v.box(x, 10, 4, x + 1, 10, 4, '#ddd6c6'); }
      block(P, -7, 11, -7, 6, 11, 4, '#ddd6c6');
      // pediment with the golden coin
      for (let k = 0; k < 6; k++) v.box(-7 + k, 12 + k, 4, 6 - k, 12 + k, 4, k === 0 ? '#ddd6c6' : '#ece6d8');
      for (let k = 0; k < 6; k++) v.box(-7 + k, 12 + k, -7, 6 - k, 12 + k, 3, '#b8b0a0');
      seal(P, 0, 14, 5, '#ffd23f');
      doorZ(P, -1, 1, 2, 5, '#b8862a', '#a8a090', 2);
      winZ(P, -5, 5, 1, 2, 3, '#a8a090'); winZ(P, 3, 5, 1, 2, 3, '#a8a090');
      chimney(P, 3, -5, 12, 17, '#8c8c88');
      // gold coin stacks by the steps
      for (const [x, h] of [[-7, 2], [-6, 3], [5, 2]]) v.box(x, 1, 5, x, h, 5, '#ffd23f');
      lamp(P, -3, 7, 2, 0); lamp(P, 2, 7, 2, 0);
    },
    light(P) {
      const v = P.v;
      // keeper's cottage at the back
      block(P, -7, 0, -7, -1, 5, -2, stone('#e8e4da'));
      roofX(P, -7, -1, -7, -2, 6, '#c8323a', '#b02a30', '#e8e4da', 1);
      winZ(P, -5, 2, -2, 2, 2, '#6e6e6a');
      // striped tower
      for (let y = 0; y <= 27; y++) {
        const r = 3.6 - y * 0.05;
        v.cyl(1.5, y, 1.5, r, y, Math.floor(y / 4) % 2 ? '#f2efe6' : '#c8323a');
      }
      doorZ(P, 1, 4, 2, 4, '#5a3a1e', '#8a8a86');
      for (const y of [9, 17]) { lit(P, 1, y, 4); lit(P, 2, y, 4); lit(P, 1, y + 1, 4); lit(P, 2, y + 1, 4); }
      // gallery with railing
      v.cyl(1.5, 28, 1.5, 3.6, 28, '#2a2a2a');
      for (let a = 0; a < 20; a++) { const t = a / 20 * Math.PI * 2; v.set(1.5 + Math.cos(t) * 3.6, 29, 1.5 + Math.sin(t) * 3.6, a % 2 ? '#2a2a2a' : '#4a4a4a'); }
      // lantern room
      for (let y = 29; y <= 32; y++) for (let x = 0; x <= 3; x++) for (let z = 0; z <= 3; z++) {
        const corner = (x === 0 || x === 3) && (z === 0 || z === 3);
        if (corner) v.set(x, y, z, '#2a2a2a'); else P.g.set(x, y, z, y === 30 || y === 31 ? '#fff6b0' : LAMP);
      }
      v.cyl(1.5, 33, 1.5, 2.6, 35, '#c8323a', 0.4);
      v.set(1, 36, 1, '#f0c03a'); v.set(1, 37, 1, '#f0c03a');
    },
    bank(P) {
      const v = P.v;
      block(P, -7, 0, -6, 6, 1, 5, stone('#8f8a80'));
      block(P, -6, 2, -6, 5, 10, 2, stone('#a8a296'));
      for (const x of [-6, -3, 1, 4]) v.box(x, 2, 3, x + 1, 10, 3, '#c8c2b4');
      block(P, -7, 11, -7, 6, 12, 4, '#8f8a80');
      // golden dome
      v.ball(-0.5, 13, -1.5, 5, 5, 5, (x, y, z) => (hash(x, y, z) < 0.15 ? '#fff2a0' : y > 16 ? '#ffd23f' : '#e8b830'), (x, y) => y >= 13);
      v.box(-1, 18, -2, 0, 20, -1, '#ffd23f'); v.set(-1, 21, -2, '#fff2a0');
      // round vault door
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const d = Math.hypot(i, j);
        if (d <= 3.3) v.set(-1 + i, 6 + j, 3, d > 2.4 ? '#5a5a62' : (i === 0 || j === 0) ? '#ffd23f' : '#7a7a84');
      }
      // gold bars and lanterns
      v.box(-7, 2, 4, -5, 2, 5, '#ffd23f'); v.box(-6, 3, 4, -6, 3, 5, '#ffd23f');
      v.box(4, 2, 4, 6, 2, 5, '#ffd23f');
      lamp(P, -4, 2, 4, 4); lamp(P, 3, 2, 4, 4);
    },
    temple(P) {
      const v = P.v;
      block(P, -7, 0, -7, 6, 1, 6, stone('#dfe8ef'));
      block(P, -6, 2, -6, 5, 2, 5, '#eef3f7');
      v.box(-2, 0, 6, 1, 0, 7, '#cfd8df'); v.box(-2, 1, 6, 1, 1, 6, '#dfe8ef'); // stairs
      for (const [x, z] of [[-6, -6], [4, -6], [-6, 4], [4, 4], [-6, -1], [4, -1], [-2, 4], [1, 4]]) v.box(x, 3, z, x + 1, 10, z + 1, (x + z) % 2 ? '#f4f8ff' : '#e6eef6');
      const top = roofHip(P, -6, 5, -6, 5, 11, '#3a7bd5', '#2f6bc0', 2);
      roofHip(P, -3, 2, -3, 2, top + 1, '#3a7bd5', '#2f6bc0', 1);
      // golden trident on top and in the shrine
      const ty = top + 5;
      v.box(-1, ty, -1, -1, ty + 6, -1, '#f0c03a');
      v.box(-3, ty + 4, -1, 1, ty + 4, -1, '#f0c03a'); v.box(-3, ty + 5, -1, -3, ty + 7, -1, '#f0c03a'); v.box(1, ty + 5, -1, 1, ty + 7, -1, '#f0c03a');
      v.set(-1, ty + 7, -1, '#fff2a0');
      block(P, -2, 3, -2, 1, 3, 1, '#2f6bc0');
      lit(P, -1, 4, 0, '#5ff3ff'); lit(P, 0, 4, 0, '#5ff3ff'); lit(P, -1, 5, 0, '#bff9ff');
      // fire bowls
      for (const x of [-5, 4]) { v.box(x, 2, 6, x, 3, 6, '#8a8a86'); lit(P, x, 4, 6, '#ff9a2a'); lit(P, x, 5, 6, '#ffd23f'); }
      // water basins
      v.box(-7, 2, -7, -6, 2, -6, '#4fb3df'); v.box(5, 2, -7, 6, 2, -6, '#4fb3df');
    },
    obs(P) {
      const v = P.v;
      block(P, -7, 0, -7, 6, 1, 6, stone('#8f8a9a'));
      v.cyl(-0.5, 2, -0.5, 6, 11, stone('#e8e4ee'));
      v.cyl(-0.5, 12, -0.5, 6.4, 12, '#5a4a8a');
      v.ball(-0.5, 12, -0.5, 6, 6, 6, (x, y, z) => (Math.abs(x + 0.5) < 1.2 && z < 3 ? '#2a2a3a' : hash(x, y, z) < 0.1 ? '#d8d4e4' : '#f4f1fa'), (x, y) => y >= 13);
      // telescope out of the slit
      v.line(-1, 15, 0, -1, 22, -6, '#b8862a', 1);
      v.line(-1, 22, -6, -1, 23, -7, '#5a4a8a', 1);
      lit(P, -1, 23, -8, '#c58bff');
      doorZ(P, -2, 5, 2, 5, '#3a2a5a', '#5a4a8a', 2);
      winZ(P, -6, 7, 3, 1, 2, '#5a4a8a', null, '#c58bff'); winZ(P, 4, 7, 3, 1, 2, '#5a4a8a', null, '#c58bff');
      // star symbols and a small orrery
      for (const [x, y] of [[-6, 4], [5, 5]]) { v.set(x, y, 6, '#f0c03a'); v.set(x + 1, y, 6, '#f0c03a'); v.set(x, y + 1, 6, '#f0c03a'); }
      v.box(4, 2, 4, 4, 4, 4, '#b8862a'); v.ball(4, 5, 4, 1, 1, 1, '#3a7bd5');
      lamp(P, -6, 2, 5, 4, '#c58bff');
    },
    statue(P) {
      const v = P.v;
      // plaza tiles and a stepped pedestal
      for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) v.set(x, 0, z, (x + z) % 2 ? '#b8b0a0' : '#a8a090');
      block(P, -4, 1, -4, 3, 2, 3, stone('#9a9a96'));
      block(P, -3, 3, -3, 2, 6, 2, stone('#8a8a86'));
      v.box(-1, 4, 3, 0, 5, 3, '#f0c03a'); // plaque
      // the captain in bronze: boots, coat, sash, head, tricorn, raised cutlass
      const bz = '#8a6a3a', bl = '#a8844a', dk = '#5a4428';
      v.box(-2, 7, -1, -1, 10, 0, dk); v.box(0, 7, -1, 1, 10, 0, dk);
      block(P, -3, 11, -2, 2, 17, 1, (x, y, z) => (y === 13 ? '#c8a050' : x === -1 || x === 0 ? bl : bz));
      v.box(-3, 11, 2, -2, 14, 2, bz); v.box(1, 11, 2, 2, 14, 2, bz);
      v.box(-4, 13, -1, -4, 16, 0, bz); // left arm
      v.box(3, 16, -1, 3, 19, 0, bz); // raised right arm
      v.line(3, 20, 0, 5, 26, 0, '#c8c8c2', 0); v.set(3, 19, 1, '#c8a050');
      block(P, -2, 18, -2, 1, 21, 1, bl);
      v.set(-1, 20, 2, dk); v.set(0, 20, 2, dk);
      block(P, -4, 22, -3, 3, 22, 2, dk); block(P, -2, 23, -2, 1, 24, 1, dk); v.box(-4, 23, -3, -4, 23, 2, dk); v.box(3, 23, -3, 3, 23, 2, dk);
      // a chest under the captain's boot, lanterns at the corners
      v.box(-3, 7, 1, 2, 8, 2, '#8a5a32'); v.box(-3, 8, 1, 2, 8, 2, '#f0c03a');
      for (const [x, z] of [[-7, -7], [6, -7], [-7, 6], [6, 6]]) lamp(P, x, 1, z, 4);
    },
  };

  /** Detailed building part set (0.125 units per voxel). */
  function buildingParts(id) {
    const P = parts();
    (BUILD[id] || BUILD.hut)(P);
    return P;
  }
  /** Legacy single-Vox access (debug viewer). */
  function building(id) { return buildingParts(id).v; }

  // ------------------------------------------------------------------ props
  /** The treasure chest (0.125 units per voxel): banded, locked, coins spilling out. */
  function chest() {
    const v = new Vox();
    for (let x = -6; x <= 5; x++) for (let y = 0; y <= 5; y++) for (let z = -4; z <= 3; z++) v.set(x, y, z, y % 2 ? '#8a5a32' : '#7a4a2a');
    for (let x = -6; x <= 5; x++) for (let y = 6; y <= 8; y++) for (let z = -4; z <= 3; z++) {
      if (y === 8 && (z === -4 || z === 3)) continue;
      v.set(x, y, z, y === 6 ? '#6b4423' : '#9a6b3e');
    }
    for (const x of [-6, -3, 2, 5]) for (let y = 0; y <= 8; y++) for (const z of [-4, 3]) if (!(y === 8)) v.set(x, y, z, '#f0c03a');
    for (const x of [-6, -3, 2, 5]) { for (let z = -3; z <= 2; z++) v.set(x, 8, z, '#f0c03a'); v.set(x, 7, -4, '#f0c03a'); v.set(x, 7, 3, '#f0c03a'); }
    for (let x = -6; x <= 5; x++) { v.set(x, 0, 3, '#c8902a'); v.set(x, 0, -4, '#c8902a'); }
    // lock plate with a keyhole
    v.box(-1, 4, 4, 0, 6, 4, '#ffd23f'); v.set(-1, 5, 4, '#2a1a0a'); v.set(0, 4, 4, '#e0a020');
    // gems on the lid, coins spilling at the front
    v.set(-5, 9, -1, '#c8323a'); v.set(4, 9, 0, '#3a7bd5'); v.box(-1, 9, -1, 0, 9, 0, '#ffd23f');
    for (const [x, z] of [[-4, 5], [-3, 5], [1, 5], [2, 6], [3, 5], [-6, 5], [5, 5], [4, 6]]) v.set(x, 0, z, '#ffd23f');
    v.set(-3, 1, 5, '#fff2a0'); v.set(3, 1, 5, '#e0a020');
    return v;
  }
  function parrot(gold) {
    const v = new Vox();
    const body = gold ? '#ffd23f' : '#3cb043', wing = gold ? '#ffb100' : '#2f6bc0', tail = gold ? '#fff2a0' : '#d63a3a';
    v.ball(0, 3, 0, 2, 2.6, 1.6, body);
    v.ball(1, 6, 0, 1.6, 1.6, 1.4, body);
    v.box(3, 5, 0, 3, 6, 0, '#ffd23f'); v.set(3, 4, 0, '#2a2a2a');
    v.set(2, 7, 1, '#fff'); v.set(2, 7, -1, '#fff');
    v.line(-1, 2, 0, -4, 0, 0, tail);
    v.box(-1, 2, 2, 1, 5, 2, wing); v.box(-1, 2, -2, 1, 5, -2, wing);
    return v;
  }
  function coin() {
    const v = new Vox();
    v.ball(0, 0, 0, 1.6, 1.6, 0.5, '#ffd23f');
    v.set(0, 0, 1, '#e0a020');
    return v;
  }
  function bottle() {
    const v = new Vox();
    v.box(-2, 0, 0, 2, 1, 1, '#4fae8a');
    v.box(3, 0, 0, 4, 1, 1, '#4fae8a'); v.set(5, 0, 0, '#8a5a32');
    v.set(0, 1, 2, '#f2ead6');
    return v;
  }
  function boat(color) {
    const v = new Vox();
    v.box(-4, 0, -1, 4, 1, 1, color || '#1f3e66');
    v.box(-3, 0, -2, 3, 1, 2, color || '#1f3e66');
    v.box(-2, 2, -1, -2, 3, -1, '#e9e3d2'); v.box(0, 2, 1, 0, 3, 1, '#e9e3d2'); v.box(2, 2, -1, 2, 3, -1, '#e9e3d2');
    v.set(-2, 4, -1, '#1d4f91'); v.set(0, 4, 1, '#1d4f91'); v.set(2, 4, -1, '#1d4f91');
    return v;
  }
  function cloudPuff(seed) {
    const rnd = VC.util.rng(seed || 9);
    const v = new Vox();
    for (let k = 0; k < 4; k++) v.ball(k * 4 - 6, rnd() * 2, rnd() * 4 - 2, 3 + rnd() * 2, 2 + rnd(), 3, '#ffffff');
    return v;
  }
  function smallIsland(seed) {
    const rnd = VC.util.rng(seed || 4);
    const v = new Vox();
    const r = 6 + rnd() * 5;
    v.ball(0, 0, 0, r, 3 + rnd() * 3, r * 0.8, (x, y) => (y > 1 ? '#5fae46' : '#e3cc8e'), (x, y) => y >= -2);
    const p = palm(6, seed);
    p.each((x, y, z, c) => v.set(x + 1, y + 4, z, c));
    return v;
  }

  // ------------------------------------------------------------------ village decor (part sets, 0.125 units per voxel)
  /** Village cottage: plaster/plank/stone walls, tiled/thatched/slate roof, door, lit windows, chimney. */
  function cottage(seed) {
    const rnd = VC.util.rng(seed || 1);
    const P = parts();
    const v = P.v;
    const hw = 4 + (rnd() * 2 | 0);
    const x0 = -hw, x1 = hw - 1, z0 = -4, z1 = 3;
    const wh = 6 + (rnd() * 2 | 0);
    const ws = (seed * 7) % 5;
    const wallC = ['#efe3c4', '#a0703c', '#c8bca8', '#e8d0a8', '#d9c9a3'][ws];
    const wallFn = ws === 1 ? planks(wallC) : ws === 2 ? stone(wallC) : timber(wallC, '#5a3a1e', x0, x1, z0, z1, 0, wh);
    const roofs = [['#b03a2e', '#962f25'], ['#c9a24a', '#d9b45a'], ['#4a6a8a', '#3a5a7a'], ['#7a4a2e', '#6b4023'], ['#3f7f5a', '#356b4c']];
    const [r1, r2] = roofs[(seed * 3 + 1) % 5];
    block(P, x0, 0, z0, x1, wh, z1, wallFn);
    const shutter = ['#2f7a46', '#3a7bd5', '#c8323a', '#6b4a2e'][seed % 4];
    doorZ(P, -1, z1, 2, 4, '#6b4423', '#4a3020');
    winZ(P, x0 + 2, 2, z1, 2, 2, '#5a3a1e', shutter);
    if (hw >= 5) winZ(P, x1 - 3, 2, z1, 2, 2, '#5a3a1e', shutter);
    // flower box under the first window
    v.box(x0 + 1, 1, z1 + 1, x0 + 4, 1, z1 + 1, '#6b4a2e');
    for (let x = x0 + 1; x <= x0 + 4; x++) v.set(x, 2, z1 + 2, x % 2 ? '#ff6fa8' : '#ffd23f');
    const ry = rnd() < 0.6 ? roofX(P, x0, x1, z0, z1, wh + 1, r1, r2, wallC, 1) : roofZ(P, x0, x1, z0, z1, wh + 1, r1, r2, wallC, 1);
    chimney(P, x1 - 2, z0 + 1, wh + 1, Math.max(ry + 1, wh + 6), '#8c8c88');
    if (rnd() < 0.5) barrel(P, x1 + 2, 0, z1); else crate(P, x0 - 3, 0, z1 - 1, 2);
    if (rnd() < 0.5) lamp(P, 1, 5, z1 + 1, 0);
    return P;
  }

  /** Windmill: body part set, sails (rotate around z at the hub), hub position in voxels. */
  function windmill() {
    const P = parts();
    const v = P.v;
    for (let y = 0; y <= 18; y++) v.cyl(0, y, 0, 4.6 - y * 0.08, y, stone('#d8d0c0'));
    block(P, -1, 0, 3, 0, 4, 4, '#5a3a1e');
    v.box(-2, 5, 4, 1, 5, 4, '#6b4a2e');
    lit(P, 2, 9, 3); lit(P, -3, 13, 2);
    v.cyl(0, 19, 0, 4, 19, '#6b4a2e');
    v.cyl(0, 20, 0, 3.8, 25, (x, y) => (y % 2 ? '#8a4a2e' : '#7a3a26'), 0.6);
    v.box(-1, 18, 4, 0, 20, 6, '#5a3a1e');
    const s = new Vox();
    for (let a = 0; a < 4; a++) {
      const ca = Math.round(Math.cos(a * Math.PI / 2)), sa = Math.round(Math.sin(a * Math.PI / 2));
      for (let k = 1; k <= 13; k++) {
        s.set(ca * k, sa * k, 0, '#5a3a1e');
        if (k > 3) for (let w = 1; w <= 3; w++) {
          const lattice = k % 3 === 0 || w === 3;
          s.set(ca * k - sa * w, sa * k + ca * w, 0, lattice ? '#6b4a2e' : '#efe3c4');
        }
      }
    }
    s.set(0, 0, 0, '#3a2614'); s.set(0, 0, 1, '#3a2614');
    return { body: P, sails: s, hub: [0, 19, 7] };
  }

  function watchtower() {
    const P = parts();
    const v = P.v;
    for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) v.box(x, 0, z, x, 17, z, '#6b4423');
    for (let y = 2; y <= 14; y += 6) {
      v.line(-4, y, 3, 3, y + 5, 3, '#8a6238'); v.line(-4, y, -4, 3, y + 5, -4, '#8a6238');
      v.line(-4, y, -4, -4, y + 5, 3, '#8a6238'); v.line(3, y, -4, 3, y + 5, 3, '#8a6238');
    }
    block(P, -5, 17, -5, 4, 17, 4, (x, y, z) => (x % 2 ? '#9a6b3e' : '#8a5a32'));
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) if (x === -5 || x === 4 || z === -5 || z === 4) { if ((x + z) % 2 === 0) v.set(x, 18, z, '#6b4423'); v.set(x, 19, z, '#8a6238'); }
    for (const [x, z] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) v.box(x, 18, z, x, 22, z, '#6b4423');
    roofHip(P, -5, 4, -5, 4, 23, '#c9a24a', '#d9b45a', 1);
    // ladder on the front
    for (let y = 0; y <= 16; y++) { v.set(-1, y, 5, '#8a6238'); v.set(1, y, 5, '#8a6238'); if (y % 2 === 0) v.set(0, y, 5, '#9a7044'); }
    torch(P, 3, 18, 3, 2);
    lit(P, -2, 18, -2, '#ffb13a');
    flag(P, 0, 28, 0, 5, 5, 3, '#111111', '#ffffff');
    return P;
  }

  /** Market stall with a striped awning and goods. */
  function stall(seed) {
    const P = parts();
    const v = P.v;
    const cols = [['#c8323a', '#f2efe6'], ['#3a7bd5', '#f2efe6'], ['#f0c03a', '#7a3fb0'], ['#3f8f5a', '#f2efe6']][seed % 4];
    for (const [x, z] of [[-4, -2], [3, -2], [-4, 2], [3, 2]]) v.box(x, 0, z, x, 7, z, '#6b4a2e');
    for (let x = -5; x <= 4; x++) for (let z = -3; z <= 3; z++) v.set(x, 8 + (z < 0 ? 1 : 0) + (z < -2 ? 0 : 0), z, (x & 1) ? cols[0] : cols[1]);
    for (let x = -5; x <= 4; x++) v.set(x, 7, 3, (x & 1) ? cols[0] : cols[1]);
    block(P, -4, 0, 1, 3, 2, 2, planks('#a0703c'));
    const goods = [['#ff7b3a', '#ffd23f', '#3cb043'], ['#9ab8c8', '#c8783a', '#9ab8c8'], ['#c8323a', '#3a7bd5', '#f0c03a'], ['#e0d0a0', '#a07a4a', '#e0d0a0']][seed % 4];
    for (let x = -4; x <= 3; x++) v.set(x, 3, 2, goods[(x + 4) % 3]);
    for (let x = -3; x <= 2; x += 2) v.set(x, 3, 1, goods[(x + 5) % 3]);
    crate(P, -6, 0, -1, 2); sack(P, 5, 0, -1);
    return P;
  }

  /** Campfire with stones, logs, log seats; smoke emitter in the middle. */
  function campfire() {
    const P = parts();
    const v = P.v;
    for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; v.set(Math.round(Math.cos(t) * 3), 0, Math.round(Math.sin(t) * 3), a % 2 ? '#8a8a86' : '#6e6e6a'); }
    v.line(-2, 0, -2, 2, 1, 2, '#5a3a1e'); v.line(-2, 0, 2, 2, 1, -2, '#6b4423');
    lit(P, 0, 1, 0, '#ff6a1a'); lit(P, 1, 1, 0, '#ff9a2a'); lit(P, 0, 1, 1, '#ff9a2a'); lit(P, -1, 1, 0, '#ff6a1a'); lit(P, 0, 1, -1, '#ff6a1a');
    lit(P, 0, 2, 0, '#ffd23f'); lit(P, 0, 3, 0, '#fff2a0'); lit(P, 1, 2, 0, '#ffb13a');
    for (const [x, z, alongX] of [[-1, 7, true], [-8, 0, false], [7, -1, false]]) {
      if (alongX) v.box(x - 2, 0, z, x + 2, 1, z, (x & 1) ? '#8a5a32' : '#7a4a2a');
      else v.box(x, 0, z - 2, x, 1, z + 2, '#8a5a32');
    }
    // cooking spit
    v.box(-3, 0, 0, -3, 4, 0, '#5a3a1e'); v.box(3, 0, 0, 3, 4, 0, '#5a3a1e'); v.box(-3, 4, 0, 3, 4, 0, '#3a2a1a');
    v.box(-1, 3, 0, 0, 3, 0, '#c8783a');
    P.smoke.push([0, 5, 0]);
    return P;
  }

  function lampPost() {
    const P = parts();
    P.v.box(0, 0, 0, 0, 10, 0, '#4a3a2a'); P.v.box(0, 10, 0, 2, 10, 0, '#4a3a2a');
    P.v.set(2, 9, 0, '#2a2a2a'); lit(P, 2, 8, 0); P.v.set(2, 7, 0, '#2a2a2a');
    P.v.box(-1, 0, -1, 1, 0, 1, '#6e6e6a');
    return P;
  }
  function torchPost() { const P = parts(); torch(P, 0, 0, 0, 7); return P; }

  function well() {
    const P = parts();
    const v = P.v;
    v.cyl(0, 0, 0, 3, 3, stone('#9a9a96'));
    v.cyl(0, 3, 0, 1.9, 3, '#2a6a9a');
    v.box(-3, 4, 0, -3, 10, 0, '#6b4423'); v.box(3, 4, 0, 3, 10, 0, '#6b4423');
    roofX(P, -3, 3, -1, 1, 11, '#b03a2e', '#962f25', null, 1);
    v.box(-2, 8, 0, 2, 8, 0, '#5a3a1e'); v.box(0, 5, 0, 0, 7, 0, '#d8d0b0'); v.box(0, 4, 0, 1, 5, 1, '#8a6238');
    return P;
  }

  /** Arched wooden footbridge along x. */
  function bridge(len) {
    len = len || 14;
    const P = parts();
    const v = P.v;
    for (let x = 0; x < len; x++) {
      const y = Math.round(Math.sin(x / (len - 1) * Math.PI) * 2) + 1;
      for (let z = -3; z <= 3; z++) v.set(x - len / 2, y, z, (x % 2) ? '#9a6b3e' : '#8a5a32');
      if (x % 3 === 0) { v.box(x - len / 2, y + 1, -3, x - len / 2, y + 3, -3, '#6b4423'); v.box(x - len / 2, y + 1, 3, x - len / 2, y + 3, 3, '#6b4423'); }
      v.set(x - len / 2, y + 3, -3, '#6b4423'); v.set(x - len / 2, y + 3, 3, '#6b4423');
    }
    return P;
  }

  /** Small rowboat (bow toward +x), optional oars. */
  function rowboat(color, seed) {
    const P = parts();
    const v = P.v;
    const c = color || '#2f6bc0', trim = '#e9e3d2';
    for (let x = -6; x <= 6; x++) {
      const t = Math.abs(x) / 6.5;
      const w = Math.round(2.6 * Math.sqrt(1 - t * t));
      for (let z = -w; z <= w; z++) {
        v.set(x, 0, z, shade(c, 0.75));
        if (Math.abs(z) === w || Math.abs(x) === 6) { v.set(x, 1, z, c); v.set(x, 2, z, trim); }
        else v.set(x, 1, z, '#8a5a32');
      }
    }
    v.box(-1, 2, -2, 0, 2, 2, '#9a6b3e'); v.box(3, 2, -1, 3, 2, 1, '#9a6b3e');
    if (seed % 2) { v.line(0, 3, -3, -3, 1, -7, '#c8a26a'); v.line(0, 3, 3, -3, 1, 7, '#c8a26a'); }
    else { v.box(-3, 2, -1, -3, 2, 1, '#b08a5a'); v.set(-4, 2, 0, '#d8d0b0'); }
    return P;
  }

  /** Fishing nets drying on two poles (along z). */
  function nets() {
    const P = parts();
    const v = P.v;
    v.box(0, 0, -5, 0, 9, -5, '#6b4423'); v.box(0, 0, 5, 0, 9, 5, '#6b4423'); v.box(0, 9, -5, 0, 9, 5, '#6b4423');
    for (let z = -4; z <= 4; z++) for (let y = 2; y <= 8; y++) if ((y + z) % 2 === 0 || y === 8) v.set(0, y - (Math.abs(z) < 2 ? 1 : 0), z, '#d8d0b0');
    v.set(0, 4, 2, '#e8b04a'); v.set(0, 6, -3, '#e8b04a');
    v.cyl(3, 0, 0, 1.6, 1, '#c8a26a'); v.set(3, 1, 0, '#8a6238');
    return P;
  }

  /** Pile of cargo: crates, barrels and sacks. */
  function cargo(seed) {
    const rnd = VC.util.rng(seed || 3);
    const P = parts();
    crate(P, -4, 0, -2, 3); crate(P, -1, 0, -3, 3, '#8a5a32');
    if (rnd() < 0.6) crate(P, -3, 3, -2, 2, '#b08050');
    barrel(P, 4, 0, 0); if (rnd() < 0.5) barrel(P, 2, 0, 3, '#7a4a2a');
    sack(P, -4, 0, 2); if (rnd() < 0.5) sack(P, -2, 0, 3, '#b8985a');
    if (rnd() < 0.5) { P.v.cyl(0, 0, 3, 1.4, 0, '#c8a26a'); P.v.set(0, 1, 3, '#a08050'); }
    return P;
  }

  /** Vegetable garden with a fence and a scarecrow. */
  function garden(seed) {
    const rnd = VC.util.rng(seed || 5);
    const P = parts();
    const v = P.v;
    for (let x = -6; x <= 5; x++) for (let z = -4; z <= 3; z++) v.set(x, 0, z, z % 2 ? '#6b4a2e' : '#7a5a3a');
    for (let x = -5; x <= 4; x += 2) for (let z = -4; z <= 3; z += 2) {
      const r = rnd();
      if (r < 0.4) { v.box(x, 1, z, x + 1, 1, z, '#5cb84f'); v.set(x, 2, z, '#7ac862'); }
      else if (r < 0.7) { v.set(x, 1, z, '#3f8f3a'); v.set(x, 2, z, '#4fa64a'); v.set(x + 1, 1, z, '#ff8a2a'); }
      else { v.set(x, 1, z, '#3f8f3a'); v.set(x, 2, z, '#e2553a'); }
    }
    fence(P, -7, -5, 6, -5, 0); fence(P, -7, -5, -7, 4, 0); fence(P, 6, -5, 6, 4, 0);
    // scarecrow
    v.box(0, 1, -6, 0, 9, -6, '#6b4423'); v.box(-3, 7, -6, 3, 7, -6, '#6b4423');
    v.box(-1, 5, -6, 1, 8, -6, '#c8323a'); v.box(0, 9, -6, 0, 10, -6, '#e8d8a0'); v.box(-1, 11, -6, 1, 11, -6, '#c9a24a'); v.set(0, 12, -6, '#c9a24a');
    return P;
  }

  function bench() {
    const P = parts();
    P.v.box(-3, 2, 0, 3, 2, 1, '#9a6b3e'); P.v.box(-3, 0, 0, -3, 1, 1, '#6b4423'); P.v.box(3, 0, 0, 3, 1, 1, '#6b4423');
    P.v.box(-3, 3, -1, 3, 4, -1, '#8a5a32');
    return P;
  }
  function signpost() {
    const P = parts();
    P.v.box(0, 0, 0, 0, 9, 0, '#6b4423');
    P.v.box(-4, 8, 1, 2, 9, 1, '#c8a26a'); P.v.set(3, 8, 1, '#c8a26a'); P.v.box(-3, 6, 1, 3, 6, 1, '#b08a5a'); P.v.set(-4, 6, 1, '#b08a5a');
    return P;
  }
  function cannon() {
    const P = parts();
    P.v.box(-3, 0, -2, 2, 1, 2, '#5a3a1e');
    P.v.box(-3, 2, -1, 4, 3, 0, '#2a2a2a'); P.v.set(5, 3, 0, '#1a1a1a'); P.v.set(-4, 2, 0, '#2a2a2a');
    for (const [x, z] of [[-3, -2], [-3, 2], [2, -2], [2, 2]]) P.v.set(x, 0, z, '#3a2614');
    P.v.set(-1, 0, 4, '#2a2a2a'); P.v.set(0, 0, 4, '#2a2a2a'); P.v.set(-1, 0, 5, '#2a2a2a');
    return P;
  }

  /**
   * Pier deck on posts: planks from (x0,z0) to (x1,z1) inclusive (planks run across z),
   * deck top layer y, posts every 5 voxels along the edges down to yb.
   */
  function deck(P, x0, z0, x1, z1, y, yb) {
    const v = P.v;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const plank = (z1 - z0 >= x1 - x0) ? z : x;
      v.set(x, y, z, hash(plank, 3, 1) < 0.15 ? '#7a4a2a' : plank % 2 ? '#9a6b3e' : '#a87a48');
    }
    for (let x = x0; x <= x1; x += 5) for (let z = z0; z <= z1; z += 5) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1 && x + 5 <= x1 && z + 5 <= z1) continue;
      v.box(x, yb, z, x, y - 1, z, '#5a3a1e');
    }
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) v.box(x, yb, z, x, y - 1, z, '#5a3a1e');
  }

  VC.Models = {
    ship, playerStyle, STYLES, DIMS, CREATURES, palm, palmHD, tree, bush, rock, flowers, grass, shells, driftwood,
    building, buildingParts, BUILD, HD, parts, kit: { block, winZ, winX, doorZ, roofX, roofZ, roofHip, chimney, barrel, crate, sack, lamp, torch, flag, fence, lit, deck, stone, planks, brick, hash },
    chest, parrot, coin, bottle, boat, cloudPuff, smallIsland, shade,
    cottage, windmill, watchtower, stall, campfire, lampPost, torchPost, well, bridge, rowboat, nets, cargo, garden, bench, signpost, cannon,
  };
})(window.VC);
