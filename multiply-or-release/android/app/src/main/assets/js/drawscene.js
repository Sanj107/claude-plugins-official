/* Pre-tournament draw: 16 marbles fall through an obstacle board into 4 tubes of 4.
   Tube 1..4 (left to right) = round 1..4; inside a tube the first marble in (bottom)
   takes the top-left cannon, then top-right, bottom-left, bottom-right. */
'use strict';
(function () {
  const MOR = window.MOR, P = MOR.Phys;

  const W = 100, H = 176, BR = 3, G = 160;
  const TUBE_X = [12.5, 37.5, 62.5, 87.5], TUBE_HW = 4, TUBE_TOP = 136, TUBE_BOT = 164, CAP = 4;
  const WALL_R = 0.6;

  class DrawScene {
    constructor(game, colors, rng) {
      this.kind = 'draw';
      this.game = game;
      this.rng = rng;
      this.time = 0;
      this.phase = 'ready';
      this.doneT = 0;
      this.settleT = 0;
      this.full = [false, false, false, false];
      this.groups = null;

      this.balls = colors.map((c, i) => {
        const row = i < 8 ? 0 : 1, j = i % 8;
        return { c, x: (row ? 17 : 11.5) + 11 * j, y: row ? 13 : 6, vx: 0, vy: 0, r: BR, still: 0, flash: 0, tube: -1 };
      });

      // Static pegs: rows alternate between wall-anchored and centred offsets.
      this.pegs = [];
      const sp = 100 / 6;
      [24, 33, 42, 51, 85, 94, 103, 112].forEach((y, row) => {
        if (row % 2 === 0) for (let j = 0; j <= 6; j++) this.pegs.push({ x: j * sp, y, r: 1.6 });
        else for (let j = 0; j < 6; j++) this.pegs.push({ x: sp / 2 + j * sp, y, r: 1.6 });
      });
      // Rotating bars between the two peg blocks.
      this.bars = [
        { x: 20, y: 68, half: 7, ang: 0.3, w: 2.4 },
        { x: 50, y: 68, half: 7, ang: 1.7, w: -2.9 },
        { x: 80, y: 68, half: 7, ang: 2.6, w: 2.4 }
      ];
      // Static segments: walls, funnels, tubes.
      const s = this.segs = [];
      s.push([0, -20, 0, H], [W, -20, W, H]);
      const L = TUBE_X.map((x) => x - TUBE_HW), R = TUBE_X.map((x) => x + TUBE_HW);
      s.push([0, 124, L[0], TUBE_TOP]);
      for (let i = 0; i < 3; i++) {
        const mid = (R[i] + L[i + 1]) / 2;
        s.push([R[i], TUBE_TOP, mid, 126], [mid, 126, L[i + 1], TUBE_TOP]);
      }
      s.push([R[3], TUBE_TOP, W, 124]);
      for (let i = 0; i < 4; i++) {
        s.push([L[i], TUBE_TOP, L[i], TUBE_BOT], [R[i], TUBE_TOP, R[i], TUBE_BOT], [L[i], TUBE_BOT, R[i], TUBE_BOT]);
      }
    }

    capSegs(i) {
      const x = TUBE_X[i];
      return [[x - TUBE_HW, TUBE_TOP, x, TUBE_TOP - 4], [x, TUBE_TOP - 4, x + TUBE_HW, TUBE_TOP]];
    }

    tubeOf(b) {
      if (b.y <= TUBE_TOP + BR) return -1;
      for (let i = 0; i < 4; i++) if (Math.abs(b.x - TUBE_X[i]) < TUBE_HW) return i;
      return -1;
    }

    respawn(b) {
      const open = [];
      for (let i = 0; i < 4; i++) if (!this.full[i]) open.push(i);
      const tx = open.length ? TUBE_X[this.rng.pick(open)] : 50;
      b.x = MOR.clamp(tx + this.rng.range(-10, 10), 6, 94);
      b.y = 4;
      b.vx = this.rng.range(-5, 5);
      b.vy = 0;
      b.still = 0;
      b.flash = 1;
      b.routed = false;
    }

    step(dt) {
      this.time += dt;
      for (const bar of this.bars) bar.ang += bar.w * dt;
      for (const b of this.balls) b.flash = Math.max(0, b.flash - dt * 2);

      if (this.phase === 'ready') {
        if (this.time > 1.4) {
          this.phase = 'drop';
          for (const b of this.balls) b.vx = this.rng.range(-18, 18);
          MOR.Sound.play('spin');
        }
        return;
      }
      if (this.phase === 'done') {
        this.doneT += dt;
        if (this.doneT > 1.6 && !this.reported) {
          this.reported = true;
          this.game.onDrawDone(this.groups);
        }
        return;
      }

      const sub = 3, h = dt / sub;
      const segs = this.segs.slice();
      for (let i = 0; i < 4; i++) if (this.full[i]) segs.push.apply(segs, this.capSegs(i));
      for (let k = 0; k < sub; k++) {
        for (const b of this.balls) {
          if (b.route) continue;
          b.vy += G * h;
          b.x += b.vx * h;
          b.y += b.vy * h;
          for (const p of this.pegs) {
            if (P.circle(b, p.x, p.y, p.r, 0.5, 0.05, 0, 0) && Math.abs(b.vy) > 30) MOR.Sound.play('drop');
          }
          for (const bar of this.bars) P.rotBar(b, bar.x, bar.y, bar.half, bar.ang, bar.w, 1.2, 0.45, 0.05);
          for (const sg of segs) P.segment(b, sg[0], sg[1], sg[2], sg[3], WALL_R, 0.3, 0.06);
          P.limit(b, 160);
        }
        const bs = this.balls;
        for (let i = 0; i < bs.length; i++) {
          if (bs[i].route) continue;
          for (let j = i + 1; j < bs.length; j++) if (!bs[j].route) P.balls(bs[i], bs[j], 0.3);
        }
      }
      this.stepRoute(dt);

      // Tube bookkeeping.
      const counts = [0, 0, 0, 0];
      let inTubes = 0, moving = 0;
      for (const b of this.balls) {
        const prev = b.tube;
        b.tube = this.tubeOf(b);
        if (b.tube >= 0) { counts[b.tube]++; inTubes++; if (prev < 0) MOR.Sound.play('land'); }
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 3) moving++;
        if (b.tube < 0 && !b.route) {
          // A marble resting outside a tube (e.g. on a closed cap) goes back to the top.
          const onCap = this.full.some((f, i) => f && Math.abs(b.x - TUBE_X[i]) < TUBE_HW + 2 && b.y > TUBE_TOP - 9 && b.y < TUBE_TOP + BR + 0.5);
          b.still = sp < 4 ? b.still + dt : 0;
          if (b.still > 0.8 || (onCap && b.still > 0.25) || !(b.y < H + 10) || !isFinite(b.x)) this.respawn(b);
        }
      }
      for (let i = 0; i < 4; i++) if (!this.full[i] && counts[i] >= CAP) { this.full[i] = true; MOR.Sound.play('x2'); }
      this.autoRoute(counts);

      // Safety net: after a long draw, steer stragglers straight into an open tube.
      if (this.time > 35) {
        for (const b of this.balls) {
          if (b.tube >= 0 || b.y > 120 || b.route || b.routed) continue;
          const open = [0, 1, 2, 3].filter((i) => counts[i] < CAP);
          if (!open.length) break;
          const i = open[0];
          b.x = TUBE_X[i]; b.y = TUBE_TOP - 6; b.vx = 0; b.vy = 0; b.flash = 1;
          counts[i]++;
        }
      }

      if (inTubes === this.balls.length && moving === 0) this.settleT += dt; else this.settleT = 0;
      if (this.settleT > 0.5) this.finish();
    }

    // Once only one tube is still open, every remaining marble belongs to it:
    // send them there one by one instead of waiting for the bounces.
    autoRoute(counts) {
      const open = [0, 1, 2, 3].filter((i) => counts[i] < CAP);
      if (open.length !== 1) return;
      if (this.balls.some((b) => b.route || b.routed)) {
        // Wait until the previous marble has dropped into the tube.
        for (const b of this.balls) if (b.routed && b.tube >= 0) b.routed = false;
        if (this.balls.some((b) => b.route || b.routed)) return;
      }
      const free = this.balls.filter((b) => b.tube < 0);
      if (!free.length) return;
      free.sort((a, b) => b.y - a.y);
      const b = free[0];
      b.route = { tube: open[0], x0: b.x, y0: b.y, t: 0 };
      this.routeTube = open[0];
      MOR.Sound.play('spin');
    }

    stepRoute(dt) {
      for (const b of this.balls) {
        const r = b.route;
        if (!r) continue;
        r.t += dt;
        const k = Math.min(1, r.t / 0.7);
        const e = MOR.easeInOut(k);
        const tx = TUBE_X[r.tube], ty = TUBE_TOP - 5;
        b.x = MOR.lerp(r.x0, tx, e);
        b.y = MOR.lerp(r.y0, ty, e) - Math.sin(Math.PI * k) * 14;
        b.vx = 0; b.vy = 0;
        b.flash = Math.max(b.flash, 0.5);
        if (k >= 1) {
          b.route = null;
          b.routed = true;
          b.x = tx; b.y = ty; b.vy = 40;
          b.still = 0;
        }
      }
    }

    finish() {
      this.phase = 'done';
      this.groups = [0, 1, 2, 3].map((i) => this.balls.filter((b) => b.tube === i).sort((a, b) => b.y - a.y).map((b) => b.c));
      MOR.Sound.play('prize');
    }

    layout(w, h, top) {
      const pad = 12;
      const availW = w - pad * 2, availH = h - top - pad * 2;
      const side = availW > availH * 0.95;
      const s = Math.min(availH / (H + 3), (side ? availW * 0.5 : availW) / (W + 6));
      const bw = W * s, bh = H * s;
      const ox = side ? pad + (availW * 0.55 - bw) / 2 + availW * 0.02 : (w - bw) / 2;
      const oy = top + pad + (availH - bh) / 2;
      return { s, ox, oy, side, listX: ox + bw + 28, listW: w - (ox + bw + 28) - pad };
    }

    render(ctx, w, h, top) {
      const L = this.layout(w, h, top);
      const s = L.s;
      ctx.save();
      ctx.translate(L.ox, L.oy);
      ctx.scale(s, s);

      // Board.
      MOR.roundRect(ctx, -3, -3, W + 6, H + 3, 4);
      ctx.fillStyle = '#121729';
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = '#2b3355';
      ctx.stroke();

      // Tube backgrounds and round labels.
      for (let i = 0; i < 4; i++) {
        const x = TUBE_X[i];
        ctx.fillStyle = this.full[i] ? 'rgba(255,207,58,0.12)' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(x - TUBE_HW, TUBE_TOP, TUBE_HW * 2, TUBE_BOT - TUBE_TOP);
        ctx.fillStyle = '#c9cfe8';
        ctx.font = '3.6px ' + MOR.FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Раунд ' + (i + 1), x, TUBE_BOT + 6);
      }

      // Pegs.
      ctx.fillStyle = '#d7dcef';
      for (const p of this.pegs) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      // Bars.
      ctx.lineCap = 'round';
      for (const bar of this.bars) {
        const ux = Math.cos(bar.ang) * bar.half, uy = Math.sin(bar.ang) * bar.half;
        ctx.strokeStyle = '#ffcf3a';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(bar.x - ux, bar.y - uy); ctx.lineTo(bar.x + ux, bar.y + uy); ctx.stroke();
        ctx.fillStyle = '#121729';
        ctx.beginPath(); ctx.arc(bar.x, bar.y, 0.9, 0, Math.PI * 2); ctx.fill();
      }
      // Walls / funnels / tubes.
      ctx.strokeStyle = '#8a93b8';
      ctx.lineWidth = WALL_R * 2;
      for (let i = 2; i < this.segs.length; i++) {
        const sg = this.segs[i];
        ctx.beginPath(); ctx.moveTo(sg[0], sg[1]); ctx.lineTo(sg[2], sg[3]); ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        if (!this.full[i]) continue;
        ctx.strokeStyle = '#ffcf3a';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const c = this.capSegs(i);
        ctx.moveTo(c[0][0], c[0][1]); ctx.lineTo(c[0][2], c[0][3]); ctx.lineTo(c[1][2], c[1][3]);
        ctx.stroke();
      }

      // Marbles.
      for (const b of this.balls) {
        if (b.flash > 0) {
          ctx.fillStyle = 'rgba(255,255,255,' + (b.flash * 0.35) + ')';
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3 * b.flash, 0, Math.PI * 2); ctx.fill();
        }
        MOR.drawMarble(ctx, b.x, b.y, b.r, b.c);
      }

      const routing = this.balls.find((b) => b.route);
      if (routing) {
        ctx.fillStyle = 'rgba(5,7,13,0.75)';
        MOR.roundRect(ctx, 12, 2, 76, 8, 2);
        ctx.fill();
        ctx.fillStyle = '#ffcf3a';
        ctx.font = '3.8px ' + MOR.FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(routing.c.name + ' → Раунд ' + (routing.route.tube + 1), 50, 6.2);
      }

      if (this.phase === 'ready') {
        const n = Math.max(1, Math.ceil(1.4 - this.time));
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px ' + MOR.FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), W / 2, 62);
      }
      ctx.restore();

      if (L.side && L.listW > 150) this.renderList(ctx, L);
    }

    // Live list of tube contents (landscape only).
    renderList(ctx, L) {
      const x = L.listX, w = Math.min(L.listW, 320);
      let y = L.oy + 8;
      const rowH = Math.min(22, (H * L.s) / 22);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 4; i++) {
        const inTube = this.balls.filter((b) => b.tube === i).sort((a, b) => b.y - a.y);
        ctx.fillStyle = '#ffcf3a';
        ctx.font = Math.round(rowH * 0.72) + 'px ' + MOR.FONT;
        ctx.fillText('Раунд ' + (i + 1), x, y + rowH / 2);
        y += rowH * 1.1;
        for (let k = 0; k < 4; k++) {
          const b = inTube[k];
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(x, y + 1, w, rowH - 2);
          if (b) {
            MOR.drawMarble(ctx, x + rowH / 2, y + rowH / 2, rowH * 0.32, b.c);
            ctx.fillStyle = '#eef1ff';
            ctx.font = Math.round(rowH * 0.6) + 'px ' + MOR.FONT;
            ctx.fillText(b.c.name, x + rowH * 1.1, y + rowH / 2 + 1);
          }
          y += rowH;
        }
        y += rowH * 0.5;
      }
    }
  }

  MOR.DrawScene = DrawScene;
})();
