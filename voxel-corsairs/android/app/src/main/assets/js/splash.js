'use strict';
// Studio splash (SG — Sanj Games) shown while the game boots. It runs before three.js loads, and all of its
// animation is CSS transforms/opacity (compositor), so it stays smooth while the main thread builds the island.
// It fades out once the game is ready and the logo has been on screen long enough; a tap skips the wait.
(function () {
  const sp = document.getElementById('splash');
  if (!sp) return;
  const t0 = performance.now();
  const MIN = navigator.webdriver ? 0 : 2800; // automated tests don't wait for the logo

  // Voxel cubes drifting outward from the logo, like the ones in the artwork.
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const html = [];
  for (let i = 0; i < 18; i++) {
    const green = i % 5 < 2;
    const ang = rnd() * Math.PI * 2;
    const r0 = 0.26 + rnd() * 0.22;
    const x = 50 + Math.cos(ang) * r0 * 90, y = 47 + Math.sin(ang) * r0 * 55;
    const dist = 10 + rnd() * 20;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 6;
    const size = 1.4 + rnd() * 3;
    const col = green ? ['#39ff6a', '#2be05a', '#7dff9a'][i % 3] : ['#f2f2f2', '#c9c9c9', '#8f8f8f', '#5a5a5a'][i % 4];
    html.push(`<div class="sp-cube${green ? ' g' : ''}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--s:${size.toFixed(2)}vmin;--c:${col};` +
      `--dx:${dx.toFixed(1)}vmin;--dy:${dy.toFixed(1)}vmin;--d:${(7 + rnd() * 6).toFixed(1)}s;--delay:${(-rnd() * 7).toFixed(1)}s;--r:${(5 + rnd() * 7).toFixed(1)}s">` +
      '<div class="c3"><i></i><i></i><i></i><i></i><i></i><i></i></div></div>');
  }
  sp.querySelector('.sp-cubes').innerHTML = html.join('');

  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    sp.classList.add('out');
    setTimeout(() => sp.remove(), 800);
  };
  const ready = () => !!(window.VC && VC.Game && VC.Game.ready);
  const failed = () => { const m = document.getElementById('load-msg'); return !!m && /Ошибка/.test(m.textContent); };
  const check = () => {
    if (done) return;
    const t = performance.now() - t0;
    if ((ready() && t >= MIN) || failed()) { hide(); return; }
    if (t >= MIN) sp.classList.add('slow'); // still booting: show a thin progress bar
    setTimeout(check, 120);
  };
  setTimeout(check, Math.min(MIN, 300));
  sp.addEventListener('pointerdown', () => { if (ready() && performance.now() - t0 > 900) hide(); });
})();
