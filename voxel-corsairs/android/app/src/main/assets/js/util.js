'use strict';
// Shared helpers: number formatting, random, DOM shortcuts.
window.VC = window.VC || {};

(function (VC) {
  const SUFFIX = ['', ' тыс', ' млн', ' млрд', ' трлн', ' квдр', ' квнт', ' скст', ' сптл', ' октл', ' нонл', ' дцл'];

  /** 1234 -> "1 234", 12345678 -> "12,3 млн". Keeps numbers short for the HUD. */
  function fmt(n, digits) {
    if (n === Infinity) return '∞';
    if (!isFinite(n)) return '0';
    const neg = n < 0;
    n = Math.abs(n);
    let s;
    if (n < 1000) {
      if (n < 10 && n % 1 !== 0) s = n.toFixed(1).replace('.', ',').replace(',0', '');
      else s = String(Math.floor(n));
    } else if (n < 100000) {
      s = Math.floor(n).toLocaleString('ru-RU').replace(/ /g, ' ');
    } else {
      let e = Math.floor(Math.log10(n) / 3);
      let v = n / Math.pow(1000, e);
      if (v >= 999.95) { v /= 1000; e++; }
      let suf;
      if (e < SUFFIX.length) suf = SUFFIX[e];
      else {
        const k = e - SUFFIX.length;
        suf = ' ' + String.fromCharCode(97 + Math.floor(k / 26) % 26) + String.fromCharCode(97 + k % 26);
      }
      const d = digits !== undefined ? digits : (v < 10 ? 2 : v < 100 ? 1 : 0);
      s = v.toFixed(d).replace('.', ',') + suf;
    }
    return (neg ? '−' : '') + s;
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + ' ч ' + (m < 10 ? '0' : '') + m + ' мин';
    if (m > 0) return m + ':' + (s < 10 ? '0' : '') + s;
    return s + ' с';
  }

  function pct(x) { return Math.round(x * 100) + '%'; }

  /** Russian plural: plural(5, 'монета', 'монеты', 'монет'). */
  function plural(n, one, few, many) {
    n = Math.abs(Math.floor(n)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  // Small seeded RNG (mulberry32) for deterministic duels and procedural models.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rand = Math.random;
  function rnd(a, b) { return a + rand() * (b - a); }
  function rndi(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function weighted(list, wkey) {
    let tot = 0;
    for (const it of list) tot += it[wkey];
    let r = rand() * tot;
    for (const it of list) { r -= it[wkey]; if (r <= 0) return it; }
    return list[list.length - 1];
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function now() { return Date.now(); }
  function dayKey(t) {
    const d = new Date(t || Date.now());
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  VC.util = { fmt, fmtTime, pct, plural, rng, rnd, rndi, pick, clamp, lerp, weighted, $, $$, el, esc, now, dayKey };
})(window.VC);
