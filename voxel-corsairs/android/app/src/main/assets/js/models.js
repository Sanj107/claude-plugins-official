'use strict';
// Procedural voxel art: ships of every tier and faction, sea creatures, the island,
// buildings and props. Each builder returns a Vox (or {parts:[...]} for animated models).
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
    ghost: { hull: '#3d5c5a', trim: '#7dffc8', sail: '#bfeee0', flag: '#0d1a1a', fg: '#7dffc8', tattered: 0.22, emblem: 'skull' },
    bone: { hull: '#d9cfb4', trim: '#8a7a60', sail: '#9b9b9b', flag: '#111', fg: '#d9cfb4', tattered: 0.3 },
    fire: { hull: '#2c1a14', trim: '#ff6a2b', sail: '#c8323a', flag: '#111', fg: '#ff6a2b', emblem: 'skull' },
    black: { hull: '#1c1c22', trim: '#b03030', sail: '#2b2b30', flag: '#7a0f12', fg: '#fff', emblem: 'skull' },
    ice: { hull: '#dfefff', trim: '#7aa7e0', sail: '#f4f8ff', flag: '#1d4f91', fg: '#f0c03a', emblem: 'crown' },
    brass: { hull: '#b5893a', trim: '#6b4f1f', sail: null, steam: true, gears: true },
    abyss: { hull: '#1d1a3a', trim: '#a24bff', sail: '#4b3a8a', flag: '#000', fg: '#a24bff', tattered: 0.25, emblem: 'eye' },
    iron: { hull: '#4a4f57', trim: '#2e3238', sail: null, steam: true, rivets: true },
    raven: { hull: '#15151c', trim: '#f0c03a', sail: '#2a2a35', flag: '#15151c', fg: '#f0c03a', emblem: 'raven' },
    heart: { hull: '#15151c', trim: '#5ff3ff', sail: '#4fd9ff', flag: '#15151c', fg: '#5ff3ff', emblem: 'heart' },
  };

  function playerStyle(skin) {
    const sk = VC.SKINS;
    const sail = sk.sail.find(x => x.id === skin.sail) || sk.sail[0];
    const flag = sk.flag.find(x => x.id === skin.flag) || sk.flag[0];
    const hull = sk.hull.find(x => x.id === skin.hull) || sk.hull[0];
    return {
      hull: hull.color, trim: hull.trim, sail: sail.color, stripe: sail.stripe, flag: flag.color, fg: flag.fg,
      emblem: skin.flag === 'heart' ? 'heart' : skin.flag === 'anchor' ? 'anchor' : skin.flag === 'kraken' ? 'eye' : 'skull',
      ghost: skin.sail === 'ghost',
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

  /** opts: { tier 0..7, style key or {..palette}, skin, seed } -> { vox, waterline, length, mastTops } */
  function ship(opts) {
    const d = DIMS[Math.max(0, Math.min(7, opts.tier))];
    const P = typeof opts.style === 'object' ? opts.style : (STYLES[opts.style] || STYLES.navy);
    const rnd = VC.util.rng(opts.seed || 7);
    const v = new Vox();
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
    // stern castle
    const cx = Math.round(L * d.castle);
    if (cx > 0) {
      const top = H + (d.high ? 3 : 2);
      for (let x = 0; x < cx; x++) {
        const zr = Math.round(halfW[x]);
        for (let y = H + 1; y < top; y++) for (let z = -zr; z <= zr; z++) v.set(x, y, z, y === top - 1 ? trim : hull);
        for (let z = -zr; z <= zr; z++) v.set(x, top, z, x % 2 ? deck : shade(deck, 0.9));
        v.set(x, top + 1, zr, trim); v.set(x, top + 1, -zr, trim);
      }
      for (let z = -Math.round(halfW[0]) + 1; z < Math.round(halfW[0]); z += 2) v.set(-1, H + 1, z, '#ffd36b');
      v.set(0, top + 1, 0, trim);
      // stern lanterns
      v.set(0, top + 2, Math.round(halfW[0]), '#ffd36b');
      v.set(0, top + 2, -Math.round(halfW[0]), '#ffd36b');
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
    v.line(bx, H + 1, 0, bx + bLen, H + 3 + Math.round(opts.tier / 2), 0, '#5a3a1e');
    // figurehead
    v.set(L, H - 1, 0, P.trim);

    // masts & sails
    const mastTops = [];
    const mastC = '#6b4423', yardC = '#4f321a';
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
      for (let y = H + 1; y <= top; y++) v.set(mx, y, 0, mastC);
      mastTops.push([mx, top, 0]);
      if (!P.sail) return;
      const sw = Math.round(W / 2) + 1;
      const sails = opts.tier >= 3 ? [[H + 3, H + Math.round(mh * 0.55)], [H + Math.round(mh * 0.55) + 2, top - 2]] :
        [[H + 3, top - 2]];
      sails.forEach(([y0, y1], si) => {
        const w = si === 0 ? sw : sw - 1;
        for (let z = -w - 1; z <= w + 1; z++) { v.set(mx + 1, y1 + 1, z, yardC); v.set(mx + 1, y0 - 1, z, yardC); }
        for (let y = y0; y <= y1; y++) {
          for (let z = -w; z <= w; z++) {
            if (P.tattered && rnd() < P.tattered && y < y1 - 1) continue;
            let c = P.sail;
            if (P.stripe && (y - y0) % 2 === 0) c = P.stripe;
            if (P.patch && rnd() < 0.12) c = P.patch;
            const inner = Math.abs(z) < w && y > y0 && y < y1;
            v.set(mx + (inner ? 2 : 1), y, z, c);
            if (inner && Math.abs(z) < w - 1) v.set(mx + 1, y, z, shade(c, 0.94));
          }
        }
        // Emblem on the biggest sail of the main mast.
        if (si === 0 && P.emblem && mainBoost && EMBLEMS[P.emblem]) {
          const em = EMBLEMS[P.emblem];
          const ey = Math.round((y0 + y1) / 2) + Math.floor(em.length / 2);
          em.forEach((row, ri) => {
            for (let k = 0; k < row.length; k++) if (row[k] === 'X') v.set(mx + 3, ey - ri, k - Math.floor(row.length / 2), P.fg || '#fff');
          });
        }
      });
      if (d.nest && mainBoost) {
        const ny = top - 3;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) v.set(mx + dx, ny, dz, '#5a3a1e');
      }
    });
    // single mast boats still get an emblem
    if (d.masts.length === 1 && P.emblem && P.sail && EMBLEMS[P.emblem] && opts.tier >= 1) {
      const mx = Math.round(L * d.masts[0]);
      const em = EMBLEMS[P.emblem];
      const y0 = H + 3, y1 = H + d.mh - 2;
      const ey = Math.round((y0 + y1) / 2) + Math.floor(em.length / 2);
      em.forEach((row, ri) => {
        for (let k = 0; k < row.length; k++) if (row[k] === 'X') v.set(mx + 3, ey - ri, k - Math.floor(row.length / 2), P.fg || '#fff');
      });
    }
    // jib sail from the bowsprit to the fore mast
    if (P.sail && opts.tier >= 2) {
      const fm = Math.round(L * d.masts[d.masts.length - 1]);
      const tipX = bx + bLen, tipY = H + 3 + Math.round(opts.tier / 2);
      const topY = H + d.mh - 4;
      for (let x = fm + 2; x < tipX; x++) {
        const t = (x - fm) / (tipX - fm);
        const yTop = Math.round(topY + (tipY - topY) * t);
        const yBot = Math.round(H + 2 + (tipY - H - 2) * t);
        for (let y = yBot; y <= yTop; y++) {
          if (P.tattered && rnd() < P.tattered) continue;
          v.set(x, y, 0, shade(P.sail, 0.97));
        }
      }
    }
    // flag on the tallest mast
    if (P.flag && mastTops.length) {
      let best = mastTops[0];
      for (const m of mastTops) if (m[1] > best[1]) best = m;
      const [fx, fy] = best;
      for (let x = fx - 5; x <= fx - 1; x++) for (let y = fy - 2; y <= fy; y++) v.set(x, y, 0, P.flag);
      v.set(fx - 3, fy - 1, 0, P.fg || '#fff');
      v.set(fx - 2, fy, 0, P.fg || '#fff');
      v.set(fx - 4, fy, 0, P.fg || '#fff');
      v.set(fx, fy + 1, 0, '#f0c03a');
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
    return { vox: v, waterline: Math.round(H * 0.42), length: L, height: H, mastTops };
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

  // ------------------------------------------------------------------ island
  const PLOT = 7, PITCH = 8, GROUND = 3;
  function plotCenter(r, c) { return [(c - 1.5) * PITCH, (r - 1.5) * PITCH - 3]; }

  function island(seed) {
    const rnd = VC.util.rng(seed || 3);
    const v = new Vox();
    const rx = 25, rz = 24, cz = -2;
    for (let x = -rx - 2; x <= rx + 2; x++) {
      for (let z = -rz - 2 + cz; z <= rz + 2 + cz; z++) {
        const n = Math.sin(x * 0.45) * 0.04 + Math.cos(z * 0.37) * 0.04 + Math.sin((x + z) * 0.21) * 0.05;
        const d = Math.sqrt((x / rx) ** 2 + ((z - cz) / rz) ** 2) + n;
        if (d > 1) continue;
        let h, top;
        if (d > 0.9) { h = 0; top = '#e3cc8e'; }
        else if (d > 0.82) { h = 1; top = '#ead59b'; }
        else if (d > 0.76) { h = 2; top = '#e8d39a'; }
        else { h = GROUND; top = '#5fae46'; }
        // rocky hill at the back
        if (z < -15 && d < 0.85) {
          const hill = Math.max(0, 9 - Math.abs(x) * 0.35 - Math.abs(z + 20) * 0.6 + Math.sin(x * 0.9) * 1.2);
          if (hill > 0) { h = Math.round(GROUND + hill); top = h > 8 ? '#9a9a96' : '#7b8b5a'; }
        }
        for (let y = -3; y <= h; y++) {
          let c;
          if (y === h) c = top;
          else if (y >= h - 1 && top === '#5fae46') c = '#7a5a3a';
          else if (y < 0) c = '#cdb57a';
          else c = top === '#9a9a96' || top === '#7b8b5a' ? '#8a8a86' : '#d8c389';
          v.set(x, y, z, c);
        }
      }
    }
    // dirt paths between plots + plot beds
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const [px, pz] = plotCenter(r, c);
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
        const edge = Math.abs(x) === 4 || Math.abs(z) === 4;
        if (v.has(px + x, GROUND, pz + z)) v.set(px + x, GROUND, pz + z, edge ? '#b98d5a' : ((x + z) % 2 ? '#64b34b' : '#5aa743'));
      }
    }
    // pier toward the ship
    for (let z = 12; z <= 27; z++) {
      for (let x = 7; x <= 9; x++) v.set(x, 2, z, z % 2 ? '#9a6b3e' : '#8a5a32');
      if (z % 3 === 0) { v.box(6, -3, z, 6, 2, z, '#5a3a1e'); v.box(10, -3, z, 10, 2, z, '#5a3a1e'); }
    }
    return v;
  }

  /** Palm tree: trunk of height h, leaves reaching `spread` voxels out; `bend` scales the random lean. */
  function palm(h, seed, spread, bend) {
    const rnd = VC.util.rng(seed || 1);
    const v = new Vox();
    const lean = (rnd() * 2 - 1) * (bend === undefined ? 1 : bend);
    const reach = spread || 5;
    let x = 0, z = 0;
    for (let y = 0; y < h; y++) {
      x += lean * 0.18; z += (rnd() - 0.5) * 0.2;
      v.set(x, y, z, y % 2 ? '#8a6238' : '#9a7044');
    }
    const ty = h;
    const leaf = ['#2f9e44', '#37b24d', '#2b8a3e'];
    for (let a = 0; a < 6; a++) {
      const ang = a / 6 * Math.PI * 2 + rnd() * 0.3;
      for (let k = 1; k <= reach; k++) {
        v.set(x + Math.cos(ang) * k, ty + 1 - Math.floor(k * k / 8), z + Math.sin(ang) * k, leaf[(a + k) % 3]);
      }
    }
    v.set(x, ty, z, '#2f9e44');
    v.set(x + 1, ty - 1, z, '#6b4a2e'); v.set(x - 1, ty - 1, z, '#6b4a2e'); v.set(x, ty - 1, z + 1, '#6b4a2e');
    return v;
  }

  function rock(seed) {
    const rnd = VC.util.rng(seed || 5);
    const v = new Vox();
    v.ball(0, 0, 0, 2 + rnd() * 2, 1.5 + rnd() * 1.5, 2 + rnd() * 2, () => (rnd() < 0.3 ? '#9a9a96' : '#7f7f7b'), (x, y) => y >= 0);
    return v;
  }

  // ------------------------------------------------------------------ buildings (footprint -3..3)
  function roofGable(v, x0, x1, z0, z1, y, c, alongX) {
    const span = alongX ? (z1 - z0) : (x1 - x0);
    for (let k = 0; k <= Math.ceil(span / 2); k++) {
      if (alongX) v.box(x0 - 1, y + k, z0 + k - 1, x1 + 1, y + k, z1 - k + 1, k % 2 ? shade(c, 0.9) : c);
      else v.box(x0 + k - 1, y + k, z0 - 1, x1 - k + 1, y + k, z1 + 1, k % 2 ? shade(c, 0.9) : c);
    }
  }
  function windowLit(v, x, y, z) { v.set(x, y, z, '#ffd36b'); }

  const BUILD = {
    hut(v) {
      v.box(-2, 0, -2, 2, 3, 2, '#a0703c');
      v.box(-2, 0, -2, -2, 3, -2, '#6b4a2e'); v.box(2, 0, 2, 2, 3, 2, '#6b4a2e');
      v.box(2, 0, -2, 2, 3, -2, '#6b4a2e'); v.box(-2, 0, 2, -2, 3, 2, '#6b4a2e');
      v.box(0, 0, 2, 0, 1, 2, '#3a2614');
      for (let k = 0; k <= 3; k++) v.box(-3 + k, 4 + k, -3 + k, 3 - k, 4 + k, 3 - k, k % 2 ? '#c9a24a' : '#d9b45a');
      v.line(3, 0, 3, 3, 5, 3, '#6b4a2e');
      v.line(3, 5, 3, 0, 7, 3, '#6b4a2e');
      for (let y = 0; y < 4; y++) v.set(-3, y, (y % 2) - 1, '#d8d0b0');
    },
    grove(v) {
      // Three compact palms whose crowns stay inside the plot (full-size crowns reached the neighbours' roofs).
      const p1 = palm(8, 11, 3, 0.3), p2 = palm(6, 12, 2, 0.3), p3 = palm(5, 13, 2, 0.3);
      [[p1, -1, -1], [p2, 2, 1], [p3, -2, 2]].forEach(([p, ox, oz]) => p.each((x, y, z, c) => v.set(x + ox, y, z + oz, c)));
      v.ball(2, 0, -2, 1.5, 1, 1.5, '#6b4a2e');
      v.box(1, 0, 2, 1, 0, 2, '#c9a227'); v.set(-1, 0, 1, '#c9a227');
    },
    smoke(v) {
      v.box(-3, 0, -2, 2, 2, 2, '#8c8c88');
      v.box(-3, 3, -2, 2, 4, 2, '#8a5a32');
      roofGable(v, -3, 2, -2, 2, 5, '#5a3a1e', true);
      v.box(1, 5, -1, 2, 10, 0, '#6e6e6a'); v.box(1, 11, -1, 2, 11, 0, '#2a2a2a');
      for (let k = -2; k <= 1; k++) v.set(k, 3, 3, '#e8873a');
      v.set(-1, 0, 3, '#3a2614'); v.set(-1, 1, 3, '#3a2614');
    },
    tavern(v) {
      v.box(-3, 0, -2, 3, 2, 2, '#a89f91');
      v.box(-3, 3, -2, 3, 5, 2, '#8a5a32');
      roofGable(v, -3, 3, -2, 2, 6, '#b03a2e', true);
      v.box(-1, 0, 3, 0, 1, 3, '#3a2614');
      windowLit(v, 2, 1, 3); windowLit(v, -3, 4, 3); windowLit(v, 1, 4, 3); windowLit(v, 3, 4, 3);
      v.line(3, 3, 3, 4, 3, 3, '#5a3a1e'); v.box(4, 1, 3, 4, 2, 3, '#f0c03a');
      v.box(-2, 6, -1, -2, 9, -1, '#6e6e6a');
    },
    fort(v) {
      for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
        if (Math.abs(x) === 3 || Math.abs(z) === 3) {
          v.box(x, 0, z, x, 2, z, '#9a9a96');
          if ((x + z) % 2 === 0) v.set(x, 3, z, '#8a8a86');
        }
      }
      v.box(-1, 0, -1, 1, 6, 1, '#a8a8a4');
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) v.set(x, 7, z, '#8a8a86');
      v.line(0, 7, 0, 0, 11, 0, '#6b4423');
      v.box(-3, 9, 0, -1, 11, 0, '#111'); v.set(-2, 10, 0, '#fff');
      v.line(3, 3, 0, 4, 3, 0, '#222'); v.line(0, 3, 3, 0, 3, 4, '#222');
    },
    distill(v) {
      v.ball(-1, 3, 0, 2.6, 3, 2.6, '#d07a3a');
      v.box(-1, 6, 0, -1, 8, 0, '#b8622a');
      v.line(-1, 8, 0, 2, 6, 0, '#b8622a'); v.line(2, 6, 0, 2, 2, 0, '#b8622a');
      v.box(1, 0, -3, 3, 1, -1, '#8a5a32'); v.box(1, 0, 1, 3, 1, 3, '#8a5a32');
      v.box(1, 1, -3, 3, 1, -3, '#555'); v.box(1, 1, 3, 3, 1, 3, '#555');
      v.box(-3, 0, 2, -2, 2, 3, '#7a4a2a');
      v.box(-3, 0, -2, -2, 0, 2, '#6e6e6a');
    },
    sugar(v) {
      for (let x = -3; x <= 1; x += 2) for (let z = -3; z <= 3; z++) {
        const h = 3 + ((x * 3 + z * 7) & 1);
        for (let y = 0; y < h; y++) v.set(x, y, z, y === h - 1 ? '#c9d65a' : '#7ab648');
      }
      v.box(2, 0, -1, 3, 2, 1, '#a0703c');
      roofGable(v, 2, 3, -1, 1, 3, '#c9a24a', false);
    },
    market(v) {
      const tent = (x0, z0, c1, c2) => {
        for (let x = x0; x <= x0 + 2; x++) for (let z = z0; z <= z0 + 2; z++) {
          if ((x === x0 || x === x0 + 2) && (z === z0 || z === z0 + 2)) v.box(x, 0, z, x, 2, z, '#6b4a2e');
          v.set(x, 3, z, (x + z) % 2 ? c1 : c2);
        }
        v.set(x0 + 1, 4, z0 + 1, c1);
      };
      tent(-3, -3, '#c8323a', '#f2efe6'); tent(1, -3, '#3a7bd5', '#f2efe6'); tent(-1, 1, '#f0c03a', '#7a3fb0');
      v.box(2, 0, 2, 3, 1, 3, '#a0703c'); v.box(-3, 0, 2, -3, 0, 3, '#8a5a32');
      v.set(-3, 1, 2, '#ffd23f');
    },
    yard(v) {
      v.box(-3, 0, -3, 3, 0, 3, '#8a5a32');
      for (let x = -3; x <= 3; x += 2) {
        for (let a = 0; a <= 6; a++) {
          const t = a / 6 * Math.PI;
          v.set(x, 1 + Math.round(Math.sin(t) * 4), Math.round(Math.cos(t) * 3), '#c8a26a');
        }
      }
      v.line(-3, 1, 0, 3, 1, 0, '#6b4423');
      v.box(3, 0, -3, 3, 9, -3, '#5a3a1e'); v.line(3, 9, -3, -1, 9, -3, '#5a3a1e'); v.line(-1, 9, -3, -1, 6, -3, '#999');
    },
    mine(v) {
      v.ball(0, 0, -1, 3.6, 5, 3.5, (x, y, z) => ((x * 5 + y * 3 + z * 7) % 9 === 0 ? '#ffd23f' : '#7a7a76'), (x, y) => y >= 0);
      v.box(-1, 0, 2, 1, 2, 3, '#1a1410');
      v.box(-2, 3, 2, 2, 3, 3, '#6b4423'); v.box(-2, 0, 2, -2, 2, 3, '#6b4423'); v.box(2, 0, 2, 2, 2, 3, '#6b4423');
      v.box(1, 0, 3, 3, 1, 3, '#555'); v.set(2, 2, 3, '#ffd23f'); v.set(1, 2, 3, '#ffd23f');
    },
    mint(v) {
      v.box(-3, 0, -2, 3, 0, 2, '#d9d4c7');
      v.box(-3, 1, -2, 3, 4, 1, '#e8e4da');
      for (let x = -3; x <= 3; x += 2) v.box(x, 1, 2, x, 4, 2, '#f4f1e8');
      v.box(-3, 5, -2, 3, 5, 2, '#d9d4c7');
      for (let k = 0; k < 3; k++) v.box(-3 + k, 6 + k, 2, 3 - k, 6 + k, 2, '#e8e4da');
      v.ball(0, 9, 0, 2, 2, 0.6, '#ffd23f'); v.set(0, 9, 1, '#e0a020');
    },
    light(v) {
      for (let y = 0; y <= 13; y++) {
        const r = y < 4 ? 2 : 1.5;
        v.ball(0, y, 0, r, 0.5, r, Math.floor(y / 3) % 2 ? '#f2efe6' : '#c8323a');
      }
      v.box(-2, 14, -2, 2, 14, 2, '#2a2a2a');
      v.box(-1, 15, -1, 1, 16, 1, '#fff2a0');
      v.box(-1, 17, -1, 1, 17, 1, '#2a2a2a'); v.set(0, 18, 0, '#2a2a2a');
      v.box(-1, 0, 2, 0, 1, 2, '#3a2614');
    },
    bank(v) {
      v.box(-3, 0, -3, 3, 4, 3, '#8f8a80');
      v.ball(0, 5, 0, 3, 3, 3, '#ffd23f', (x, y) => y >= 5);
      v.ball(0, 2, 3.2, 1.8, 1.8, 0.6, '#e0b04a'); v.set(0, 2, 4, '#8a6420');
      for (let x = -3; x <= 3; x += 3) v.box(x, 0, 3, x, 4, 3, '#a8a398');
      v.set(0, 9, 0, '#ffd23f');
    },
    temple(v) {
      v.box(-3, 0, -3, 3, 0, 3, '#dfe8ef');
      for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -3], [0, 3]]) v.box(x, 1, z, x, 5, z, '#f4f8ff');
      v.box(-3, 6, -3, 3, 6, 3, '#3a7bd5');
      for (let k = 0; k < 3; k++) v.box(-3 + k, 7 + k, -3 + k, 3 - k, 7 + k, 3 - k, k % 2 ? '#2f6bc0' : '#3a7bd5');
      v.box(0, 1, 0, 0, 4, 0, '#f0c03a');
      v.line(0, 10, 0, 0, 13, 0, '#f0c03a');
      v.set(-1, 13, 0, '#f0c03a'); v.set(1, 13, 0, '#f0c03a'); v.set(-1, 14, 0, '#f0c03a'); v.set(1, 14, 0, '#f0c03a'); v.set(0, 14, 0, '#f0c03a');
    },
    obs(v) {
      v.box(-3, 0, -3, 3, 3, 3, '#e8e4da');
      v.ball(0, 4, 0, 3.4, 3.4, 3.4, '#f4f1e8', (x, y) => y >= 4);
      v.box(-1, 4, 0, 1, 8, 0, '#2a2a3a');
      v.line(0, 6, 0, 3, 10, 2, '#4a4a5a', 0.6);
      windowLit(v, 0, 1, 3);
    },
    statue(v) {
      v.box(-2, 0, -2, 2, 1, 2, '#9a9a96');
      v.box(-1, 2, -1, 1, 6, 1, '#b8b8b2');
      v.box(-2, 5, -1, 2, 6, 1, '#b8b8b2');
      v.box(-1, 7, -1, 1, 8, 1, '#c8c8c2');
      v.box(-2, 9, -2, 2, 9, 2, '#2a2a2a'); v.box(-1, 10, -1, 1, 10, 1, '#2a2a2a');
      v.line(2, 5, 0, 4, 8, 0, '#b8b8b2');
    },
  };

  function building(id) {
    const v = new Vox();
    (BUILD[id] || BUILD.hut)(v);
    return fitCell(v, PITCH);
  }

  /**
   * Keeps a model within n voxels along x and z, so it never reaches into the neighbouring plot
   * (a cell is the 7-voxel plot plus half of the path on each side). Overflowing columns are cut
   * from whichever side has fewer voxels in them.
   */
  function fitCell(v, n) {
    const keep = [];
    for (const axis of ['x', 'z']) {
      const cnt = new Map();
      v.each((x, y, z) => { const a = axis === 'x' ? x : z; cnt.set(a, (cnt.get(a) || 0) + 1); });
      let lo = Math.min(...cnt.keys()), hi = Math.max(...cnt.keys());
      while (hi - lo + 1 > n) { if ((cnt.get(lo) || 0) <= (cnt.get(hi) || 0)) lo++; else hi--; }
      keep.push([lo, hi]);
    }
    const [[x0, x1], [z0, z1]] = keep;
    if (x0 <= v.minX && x1 >= v.maxX && z0 <= v.minZ && z1 >= v.maxZ) return v;
    const out = new Vox();
    v.each((x, y, z, c) => { if (x >= x0 && x <= x1 && z >= z0 && z <= z1) out.set(x, y, z, c); });
    return out;
  }

  // ------------------------------------------------------------------ props
  function chest() {
    const v = new Vox();
    v.box(-3, 0, -2, 3, 2, 2, '#8a5a32');
    v.box(-3, 3, -2, 3, 4, 2, '#9a6b3e');
    v.box(-3, 0, -2, -3, 4, 2, '#f0c03a'); v.box(3, 0, -2, 3, 4, 2, '#f0c03a');
    v.box(-3, 2, -2, 3, 2, -2, '#f0c03a'); v.box(-3, 2, 2, 3, 2, 2, '#f0c03a');
    v.box(0, 1, 3, 0, 2, 3, '#ffd23f');
    v.box(-2, 5, -1, 2, 5, 1, '#ffd23f');
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

  VC.Models = {
    ship, playerStyle, STYLES, DIMS, CREATURES, island, palm, rock, building, plotCenter, PLOT, PITCH, GROUND,
    chest, parrot, coin, bottle, boat, cloudPuff, smallIsland, shade,
  };
})(window.VC);
