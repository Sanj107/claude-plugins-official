/* Minimal circle physics for marbles: circles, segments, rotating bars, ball-ball. */
'use strict';
(function () {
  const P = window.MOR.Phys = {};

  // Push ball b out of a circle (cx, cy, cr) that moves with velocity (vx, vy).
  // e = restitution, fr = tangential friction (0..1).
  P.circle = function (b, cx, cy, cr, e, fr, vx, vy) {
    const dx = b.x - cx, dy = b.y - cy;
    const rr = b.r + cr;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return false;
    let d = Math.sqrt(d2), nx, ny;
    if (d < 1e-6) { nx = 0; ny = -1; d = 0; } else { nx = dx / d; ny = dy / d; }
    b.x = cx + nx * rr;
    b.y = cy + ny * rr;
    vx = vx || 0; vy = vy || 0;
    const rvx = b.vx - vx, rvy = b.vy - vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      const tx = -ny, ty = nx;
      const vt = rvx * tx + rvy * ty;
      b.vx -= vt * fr * tx;
      b.vy -= vt * fr * ty;
    }
    return true;
  };

  // Capsule segment (x1,y1)-(x2,y2) with radius sr.
  P.segment = function (b, x1, y1, x2, y2, sr, e, fr) {
    const ex = x2 - x1, ey = y2 - y1;
    const L2 = ex * ex + ey * ey;
    let t = L2 > 0 ? ((b.x - x1) * ex + (b.y - y1) * ey) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return P.circle(b, x1 + ex * t, y1 + ey * t, sr, e, fr, 0, 0);
  };

  // Bar rotating around (cx, cy) with half-length `half`, angle `ang`, angular speed `w`.
  P.rotBar = function (b, cx, cy, half, ang, w, sr, e, fr) {
    const ux = Math.cos(ang), uy = Math.sin(ang);
    let t = (b.x - cx) * ux + (b.y - cy) * uy;
    t = t < -half ? -half : t > half ? half : t;
    const px = cx + ux * t, py = cy + uy * t;
    return P.circle(b, px, py, sr, e, fr, -w * (py - cy), w * (px - cx));
  };

  // Equal-mass ball-ball collision.
  P.balls = function (a, b, e) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const rr = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return false;
    let d = Math.sqrt(d2), nx, ny;
    if (d < 1e-6) { nx = 1; ny = 0; d = 0; } else { nx = dx / d; ny = dy / d; }
    const pen = (rr - d) / 2;
    a.x -= nx * pen; a.y -= ny * pen;
    b.x += nx * pen; b.y += ny * pen;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn < 0) {
      const j = -(1 + e) * vn / 2;
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
    }
    return true;
  };

  P.limit = function (b, max) {
    const s2 = b.vx * b.vx + b.vy * b.vy;
    if (s2 > max * max) {
      const k = max / Math.sqrt(s2);
      b.vx *= k; b.vy *= k;
    }
  };
})();
