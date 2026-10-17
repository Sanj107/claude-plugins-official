'use strict';
// UI framework: HUD, bottom tabs + sliding panel, modals, story dialogue, toasts, floaters.
(function (VC) {
  const U = VC.util;
  const { $, $$, el, esc, fmt } = U;

  const UI = {
    tab: null, sub: {}, panelScroll: {}, modalStack: [], dialogueQueue: [], dlg: null,
  };

  UI.init = function () {
    // Delegated click handling for everything with data-act / data-tab.
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-act],[data-tab],[data-sub]');
      if (!t) return;
      if (t.dataset.tab) { VC.Audio.sfx('click'); this.toggleTab(t.dataset.tab); return; }
      if (t.dataset.sub) { VC.Audio.sfx('click'); this.setSub(t.dataset.sub); return; }
      const act = t.dataset.act;
      if (t.classList.contains('disabled') || t.disabled) { VC.Audio.sfx('error'); this.shakeEl(t); return; }
      VC.Game.action(act, t.dataset, t);
    });
    this.hud = {
      gold: $('#hud-gold'), gps: $('#hud-gps'), pearls: $('#hud-pearls'), lvl: $('#hud-lvl'), xp: $('#hud-xp'),
      ava: $('#hud-ava'), obj: $('#objective'), boosts: $('#boosts'), frenzy: $('#frenzy'), frenzyBar: $('#frenzy i'),
    };
    this.vignette = el('div', 'vignette');
    document.body.appendChild(this.vignette);
  };

  UI.shakeEl = function (t) {
    t.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 200 });
  };

  // ------------------------------------------------------------------ HUD
  UI.updateHud = function () {
    const s = VC.Game.s, D = VC.D;
    this.hud.gold.textContent = fmt(s.gold);
    this.hud.gps.textContent = '+' + fmt(D.income) + ' / с' + (D.incomeBoost > 1 ? '  ×' + D.incomeBoost : '');
    this.hud.pearls.textContent = fmt(s.pearls);
    this.hud.lvl.textContent = s.level;
    this.hud.xp.style.width = Math.min(100, s.xp / VC.State.xpNeed(s.level) * 100) + '%';
    this.hud.ava.textContent = s.avatar;
    const fr = VC.Game.frenzy;
    this.hud.frenzyBar.style.height = (D.frenzyMult > 1 ? 100 : fr) + '%';
    this.hud.frenzy.classList.toggle('on', D.frenzyMult > 1);
    // boosts
    const now = Date.now();
    const active = s.boosts.filter(b => b.until > now);
    const html = active.map(b => {
      const ic = { income: '🌬️', tap: '🍹', battle: '⚔️' }[b.id] || '✨';
      return `<div class="boost">${ic} ×${b.mult} ${U.fmtTime((b.until - now) / 1000)}</div>`;
    }).join('') + (s._frenzyUntil > now ? `<div class="boost">🔥 Лихорадка ×5 ${Math.ceil((s._frenzyUntil - now) / 1000)}с</div>` : '') +
      (VC.Events && VC.Events.storm ? `<div class="boost" style="border-color:#7aa7e0;color:#bfe0ff">⛈️ Шторм ${VC.Events.stormLeft()}</div>` : '');
    if (html !== this._boostHtml) { this.hud.boosts.innerHTML = html; this._boostHtml = html; }
  };

  UI.setObjective = function (o) {
    const ob = this.hud.obj;
    if (!o) { ob.classList.add('hidden'); return; }
    ob.classList.remove('hidden');
    const key = o.icon + o.title + o.text + (o.go || '') + o.done + Math.round((o.progress || 0) * 50);
    if (key === this._objKey) return;
    this._objKey = key;
    ob.classList.toggle('done', !!o.done);
    ob.innerHTML = `<span class="ico">${o.icon}</span><span class="t"><b>${esc(o.title)}</b><span>${esc(o.text)}</span>` +
      (o.progress !== undefined ? `<div class="bar"><i style="width:${Math.min(100, o.progress * 100)}%"></i></div>` : '') +
      `</span>` + (o.go ? `<span class="go">${esc(o.go)}</span>` : '');
  };

  UI.setTabsVisible = function (on) {
    $('#tabs').classList.toggle('hidden', !on);
    $('#hud').classList.toggle('hidden', !on);
  };

  UI.refreshTabs = function () {
    const s = VC.Game.s;
    $$('#tabs button').forEach(b => {
      const tab = b.dataset.tab;
      const unlocked = VC.Game.tabUnlocked(tab);
      b.classList.toggle('hidden', !unlocked && tab !== 'island' && tab !== 'ship');
      b.classList.toggle('locked', !unlocked);
      b.classList.toggle('active', this.tab === tab);
      b.classList.toggle('attn', !!VC.Game.tabAttention(tab));
    });
    $('#tabs').classList.toggle('hidden', !s.unlocked.island || !!VC.Battle.active);
  };

  // ------------------------------------------------------------------ panel
  const TITLES = { island: '🏝️ Остров', ship: '⛵ Корабль', map: '🗺️ Карта морей', captain: '🏴‍☠️ Капитан', shop: '🛒 Лавка', duel: '⚔️ Дуэль' };

  UI.toggleTab = function (tab) {
    if (!VC.Game.tabUnlocked(tab)) { this.toast('🔒 Откроется по сюжету'); return; }
    if (this.tab === tab) this.closePanel();
    else this.openPanel(tab);
  };

  UI.openPanel = function (tab, sub) {
    if (this.tab && this.tab !== tab) this.panelScroll[this.tab] = $('#panel-body').scrollTop;
    this.tab = tab;
    if (sub) this.sub[tab] = sub;
    $('#panel').classList.add('open');
    $('#panel').classList.toggle('tall', tab === 'map' || tab === 'duel');
    $('#panel-title').textContent = TITLES[tab];
    this.renderPanel(true);
    this.refreshTabs();
    VC.Game.onPanel(tab);
    requestAnimationFrame(() => {
      // offsetTop ignores the slide-in transform, so this is where the sheet ends up
      VC.Scene.setPanelCover(Math.max(0, (window.innerHeight - $('#panel').offsetTop) / window.innerHeight - 0.12));
    });
  };

  UI.closePanel = function () {
    if (!this.tab) return false;
    this.panelScroll[this.tab] = $('#panel-body').scrollTop;
    this.tab = null;
    $('#panel').classList.remove('open');
    this.refreshTabs();
    VC.Game.onPanel(null);
    VC.Scene.setPanelCover(0);
    return true;
  };

  UI.setSub = function (sub) {
    this.sub[this.tab] = sub;
    this.renderPanel(true);
    VC.Game.onPanel(this.tab);
  };

  /** Re-renders the open panel. keepScroll=false keeps the current scroll position. */
  UI.renderPanel = function (fresh) {
    if (!this.tab) return;
    const P = VC.Panels[this.tab];
    const body = $('#panel-body');
    const scroll = fresh ? 0 : body.scrollTop;
    const subs = P.subs ? P.subs() : null;
    if (subs && !this.sub[this.tab]) this.sub[this.tab] = subs[0][0];
    $('#panel-sub').innerHTML = subs ? subs.map(([id, label]) => `<button data-sub="${id}" class="${this.sub[this.tab] === id ? 'active' : ''}">${label}</button>`).join('') : '';
    body.innerHTML = P.render(this.sub[this.tab]);
    if (P.after) P.after(body, this.sub[this.tab]);
    body.scrollTop = scroll;
    this.refreshPanel();
  };

  /** Cheap periodic refresh: affordability, live counters. */
  UI.refreshPanel = function () {
    if (!this.tab) return;
    const s = VC.Game.s;
    $$('#panel-body [data-cost]').forEach(b => {
      const cost = +b.dataset.cost;
      const cur = b.dataset.cur === 'pearls' ? s.pearls : s.gold;
      const ok = cur >= cost && b.dataset.block !== '1';
      b.classList.toggle('disabled', !ok);
    });
    const P = VC.Panels[this.tab];
    if (P.live) P.live($('#panel-body'), this.sub[this.tab]);
  };

  // ------------------------------------------------------------------ modals
  /** opts: { title, icon, html, buttons:[{label, cls, act, data, close}], onClose, noClose, cls } */
  UI.modal = function (opts) {
    const wrap = el('div', 'modal-wrap');
    const m = el('div', 'modal ' + (opts.cls || ''));
    let html = '';
    if (opts.icon) html += `<div class="icon">${opts.icon}</div>`;
    if (opts.title) html += `<h3>${opts.title}</h3>`;
    html += opts.html || '';
    if (opts.buttons && opts.buttons.length) {
      html += '<div class="btns">' + opts.buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-mb="${i}">${b.label}</button>`).join('') + '</div>';
    }
    m.innerHTML = html;
    wrap.appendChild(m);
    $('#modals').appendChild(wrap);
    const close = () => {
      if (!wrap.parentNode) return;
      wrap.remove();
      const i = this.modalStack.indexOf(rec);
      if (i >= 0) this.modalStack.splice(i, 1);
      if (opts.onClose) opts.onClose();
    };
    const rec = { wrap, close, opts };
    this.modalStack.push(rec);
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-mb]');
      if (!b) return;
      e.stopPropagation();
      const def = opts.buttons[+b.dataset.mb];
      VC.Audio.sfx('click');
      if (def.close !== false) close();
      if (def.fn) def.fn(m);
    });
    if (!opts.noClose) wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    if (opts.mount) opts.mount(m, close);
    return rec;
  };
  UI.closeTopModal = function () {
    const top = this.modalStack[this.modalStack.length - 1];
    if (!top || top.opts.noClose) return false;
    top.close();
    return true;
  };
  UI.hasModal = function () { return this.modalStack.length > 0; };

  UI.confirm = function (title, text, okLabel, fn) {
    this.modal({ title, html: `<p>${text}</p>`, buttons: [{ label: 'Отмена', cls: 'disabled' }, { label: okLabel || 'Да', cls: 'green', fn }] });
  };

  UI.prompt = function (title, text, value, fn, max) {
    this.modal({
      title, noClose: true,
      html: `<p>${text}</p><input type="text" maxlength="${max || 18}" value="${esc(value || '')}">`,
      buttons: [{ label: 'Готово', cls: 'green', close: false, fn: m => {
        const v = m.querySelector('input').value.trim();
        if (!v) { this.shakeEl(m.querySelector('input')); return; }
        this.modalStack[this.modalStack.length - 1].close();
        fn(v);
      } }],
      mount: m => setTimeout(() => { const i = m.querySelector('input'); i.focus(); i.select(); }, 100),
    });
  };

  UI.reward = function (title, loot, icon, then) {
    const items = [];
    if (loot.gold) items.push(`🪙 ${fmt(loot.gold)}`);
    if (loot.pearls) items.push(`💎 ${fmt(loot.pearls)}`);
    if (loot.xp) items.push(`⭐ ${fmt(loot.xp)} опыта`);
    if (loot.extra) items.push(...loot.extra);
    this.modal({ title, icon: icon || '🎁', html: `<div class="loot">${items.map(x => `<div>${x}</div>`).join('')}</div>`,
      buttons: [{ label: 'Отлично!', cls: 'green' }], onClose: then });
  };

  // ------------------------------------------------------------------ toasts & floaters
  UI.toast = function (text, cls) {
    const t = el('div', 'toast ' + (cls || ''), text);
    const box = $('#toasts');
    box.appendChild(t);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 2300);
    setTimeout(() => t.remove(), 2800);
  };

  const floaterPool = [];
  UI.floater = function (x, y, text, cls) {
    const box = $('#fx');
    if (box.children.length > 40) box.firstChild.remove();
    const f = el('div', 'floater ' + (cls || ''), text);
    f.style.left = x + 'px';
    f.style.top = y + 'px';
    box.appendChild(f);
    setTimeout(() => f.remove(), 950);
  };

  UI.hurt = function () {
    this.vignette.classList.add('hurt');
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => this.vignette.classList.remove('hurt'), 220);
  };

  // ------------------------------------------------------------------ dialogue
  /** lines: [[speaker, text]], opts: { chapter, onDone } */
  UI.dialogue = function (lines, opts) {
    this.dialogueQueue.push({ lines: lines.slice(), opts: opts || {} });
    if (!this.dlg) this.nextDialogue();
  };
  UI.inDialogue = function () { return !!this.dlg; };

  UI.nextDialogue = function () {
    const job = this.dialogueQueue.shift();
    const box = $('#dialogue');
    if (!job) {
      this.dlg = null;
      box.classList.add('hidden');
      const dim = $('#dialogue-dim');
      if (dim) dim.remove();
      return;
    }
    this.dlg = { job, i: 0 };
    if (!$('#dialogue-dim')) {
      const dim = el('div');
      dim.id = 'dialogue-dim';
      dim.addEventListener('click', () => this.advanceDialogue());
      document.body.appendChild(dim);
    }
    box.classList.remove('hidden');
    box.onclick = e => {
      if (e.target.closest('.skip')) { this.finishDialogue(); return; }
      this.advanceDialogue();
    };
    this.showLine();
  };

  UI.fill = function (text) {
    const s = VC.Game.s;
    return String(text).replace(/\{name\}/g, s.name || 'Капитан').replace(/\{ship\}/g, s.shipName).replace(/\{avatar\}/g, s.avatar);
  };

  UI.showLine = function () {
    const d = this.dlg;
    const [who, text] = d.job.lines[d.i];
    const sp = VC.SPEAKERS[who] || VC.SPEAKERS.narr;
    const box = $('#dialogue');
    const full = this.fill(text);
    box.innerHTML = `${d.job.opts.chapter ? `<div class="chapter">${esc(d.job.opts.chapter)}</div>` : ''}
      <div class="por">${this.fill(sp.icon)}</div>
      <div class="who" style="color:${sp.color}">${esc(this.fill(sp.name)) || '&nbsp;'}</div>
      <div class="txt" style="${who === 'narr' ? 'font-style:italic' : ''}"></div>
      <div class="nav"><span>${d.i + 1} / ${d.job.lines.length} · нажмите, чтобы продолжить</span><button class="skip">Пропустить »</button></div>`;
    const txt = box.querySelector('.txt');
    d.typing = true;
    d.full = full;
    let n = 0;
    clearInterval(d.timer);
    d.timer = setInterval(() => {
      n += 2;
      txt.textContent = full.slice(0, n);
      if (n >= full.length) { clearInterval(d.timer); d.typing = false; }
    }, 22);
    if (who === 'piastr') VC.Audio.sfx('parrot');
  };

  UI.advanceDialogue = function () {
    const d = this.dlg;
    if (!d) return;
    if (d.typing) {
      clearInterval(d.timer);
      d.typing = false;
      $('#dialogue .txt').textContent = d.full;
      return;
    }
    d.i++;
    if (d.i >= d.job.lines.length) this.finishDialogue();
    else this.showLine();
  };

  UI.finishDialogue = function () {
    const d = this.dlg;
    if (!d) return;
    clearInterval(d.timer);
    const cb = d.job.opts.onDone;
    this.dlg = null;
    this.nextDialogue();
    if (cb) cb();
  };

  VC.UI = UI;
})(window.VC);
