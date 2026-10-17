'use strict';
// Panel contents for every bottom tab plus settings / daily / quests modals.
(function (VC) {
  const U = VC.util, ST = VC.State, UI = VC.UI;
  const { fmt, esc } = U;
  const G = () => VC.Game;
  const S = () => VC.Game.s;

  const P = {};
  VC.Panels = P;

  function costBtn(act, cost, extra, label, cur) {
    return `<button class="btn ${cur === 'pearls' ? 'pearl' : ''}" data-act="${act}" data-cost="${cost}" ${cur ? `data-cur="${cur}"` : ''} ${extra || ''}>${label || ''}${cur === 'pearls' ? '💎' : '🪙'} ${fmt(cost)}</button>`;
  }
  function powerTag(mine, theirs) {
    const r = mine / Math.max(1, theirs);
    const cls = r >= 1.15 ? 'g' : r >= 0.8 ? 'y' : 'r';
    const txt = r >= 1.15 ? 'легко' : r >= 0.8 ? 'на равных' : 'опасно';
    return `<span class="tag ${cls}">⚔️ ${fmt(theirs)} · ${txt}</span>`;
  }
  P.powerTag = powerTag;

  // ================================================================== ISLAND
  P.island = {
    sel: -1,
    subs: () => [['list', '🏠 Постройки'], ['layout', '🧩 Планировка']],
    render(sub) {
      const s = S(), D = VC.D;
      if (sub === 'layout') return this.renderLayout();
      let h = `<div class="card dark row"><div class="grow"><div class="sub">Доход острова</div><div class="name" style="color:var(--gold2)">🪙 ${fmt(D.income)} / с</div></div>
        <div class="toggle-row">${[1, 10, 100, 'max'].map(v => `<button data-act="buyMult" data-v="${v}" class="${G().buyMult === v ? 'active' : ''}">${v === 'max' ? 'MAX' : '×' + v}</button>`).join('')}</div></div>`;
      if (s.plots < VC.PLOTS.length) {
        const np = VC.PLOTS[s.plots];
        const type = np.r === 3 ? 'берег 🏖️' : 'суша 🌴';
        const free = this.freePlots();
        h += `<div class="card row"><div class="ico-big">🗺️</div><div class="grow"><div class="name">Новый участок</div>
          <div class="sub">Тип: ${type}. Свободно сейчас: берег ${free.shore}, суша ${free.land}</div></div>${costBtn('buyPlot', np.cost)}</div>`;
      }
      let lockedShown = false;
      for (const b of VC.BUILDINGS) {
        if (!G().buildingAvailable(b)) {
          if (!lockedShown && b.id !== 'statue') {
            lockedShown = true;
            h += `<div class="card locked row"><div class="ico-big">❔</div><div class="grow"><div class="name">???</div><div class="sub">Откроется в главе ${b.ch}</div></div></div>`;
          }
          continue;
        }
        h += this.buildingCard(b);
      }
      return h;
    },
    buildingCard(b) {
      const s = S(), D = VC.D;
      const lvl = s.buildings[b.id];
      const placed = ST.plotOf(s, b.id) >= 0;
      const mult = G().buyMult;
      const n = mult === 'max' ? Math.max(1, ST.maxAffordable(s, b.id)) : mult;
      let cost = ST.buildingCost(s, b.id, n);
      // Unplaced building without a free plot of its type: the next plot is bought with it.
      let needPlot = false;
      if (!placed && ST.bestPlot(s, b.id) < 0) {
        if (s.plots < VC.PLOTS.length && ST.plotInfo(s.plots).type === b.plot) { cost += VC.PLOTS[s.plots].cost; needPlot = true; }
      }
      const per = b.inc * ST.milestoneMult(lvl + 1) * D.globalMult * (D.bSyn[b.id] ? D.bSyn[b.id].mult : 1);
      const next = ST.nextMilestone(lvl);
      const syn = D.bSyn[b.id];
      let tags = '';
      if (syn && syn.mult > 1) tags += `<span class="tag g">соседи +${Math.round((syn.mult - 1) * 100)}%</span>`;
      if (!placed) tags += `<span class="tag ${b.plot === 'shore' ? 'y' : 'g'}">${b.plot === 'shore' ? '🏖️ берег' : '🌴 суша'}${needPlot ? ' + участок' : ''}</span>`;
      if (next && lvl > 0) tags += `<span class="tag b">×2 на ур. ${next}</span>`;
      const pairs = VC.SYNERGIES.filter(x => x[0] === b.id || x[1] === b.id).map(x => ST.BY_ID[x[0] === b.id ? x[1] : x[0]]);
      const hl = G().mission() && G().mission().goal.t === 'build' && G().mission().goal.id === b.id ? ' hl' : '';
      return `<div class="card${hl}"><div class="row"><div class="ico-big">${b.icon}${lvl ? `<span class="badge">${lvl}</span>` : ''}</div>
        <div class="grow"><div class="name">${b.name}</div>
        <div class="sub">${lvl ? `Даёт 🪙 ${fmt(D.bIncome[b.id])}/с · ` : ''}+${fmt(per * (mult === 'max' ? n : mult))}/с за ${mult === 'max' ? n : mult} ур.</div>
        <div style="margin-top:3px">${tags}</div></div>
        ${costBtn('buyB', cost, `data-id="${b.id}"`, n > 1 ? `×${n} ` : '')}</div>
        <div class="sub" style="margin-top:6px">${b.desc}${pairs.length ? ` Дружит с: ${pairs.map(p => p.icon).join(' ')}` : ''}</div></div>`;
    },
    freePlots() {
      const s = S();
      const f = { shore: 0, land: 0 };
      for (let i = 0; i < s.plots; i++) if (!s.layout[i] || s.buildings[s.layout[i]] <= 0) f[ST.plotInfo(i).type]++;
      return f;
    },
    renderLayout() {
      const s = S();
      let h = `<div class="card dark"><div class="sub">Нажмите на постройку, затем на другой участок — она переедет (или поменяется местами). Соседи по стороне и по диагонали дают бонусы. Передний ряд — берег.</div></div><div class="plots">`;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const i = VC.PLOTS.findIndex(p => p.r === r && p.c === c);
        const shore = r === 3;
        if (i >= s.plots) {
          h += `<div class="plot locked">${i === s.plots ? `🔒<br>${fmt(VC.PLOTS[i].cost)}` : '🔒'}</div>`;
          continue;
        }
        const bid = s.layout[i];
        const b = bid && s.buildings[bid] > 0 ? ST.BY_ID[bid] : null;
        const syn = b && VC.D.bSyn[bid] ? Math.round((VC.D.bSyn[bid].mult - 1) * 100) : 0;
        h += `<div class="plot ${shore ? 'shore' : ''} ${this.sel === i ? 'sel' : ''}" data-plot="${i}">${b ? b.icon : ''}
          ${syn ? `<span class="syn">+${syn}%</span>` : ''}<small>${b ? s.buildings[bid] : shore ? 'берег' : ''}</small></div>`;
      }
      h += '</div>';
      if (this.sel >= 0 && s.layout[this.sel]) {
        const bid = s.layout[this.sel];
        const b = ST.BY_ID[bid];
        const syn = VC.D.bSyn[bid];
        h += `<div class="card"><div class="name">${b.icon} ${b.name}</div><div class="sub">${syn && syn.parts.length ? syn.parts.map(p => `${p.with === 'neighbors' ? 'соседи' : ST.BY_ID[p.with].icon} +${Math.round(p.v * 100)}%`).join(' · ') : 'Пока без бонусов соседства'}</div>
          <div class="sub" style="margin-top:4px">Выберите участок для переезда.</div></div>`;
      }
      h += `<div class="section-title">Пары-соседи</div><div class="card dark"><div class="sub">${VC.SYNERGIES.map(([a, b, v]) => `${ST.BY_ID[a].icon}+${ST.BY_ID[b].icon} +${v * 100}%`).join(' · ')}<br>⚖️ Рынок: +5% за каждого соседа · 🏰 Форт: +10% соседям</div></div>`;
      return h;
    },
    after(body, sub) {
      if (sub === 'layout') {
        body.querySelectorAll('[data-plot]').forEach(p => p.addEventListener('click', () => this.plotTapped(+p.dataset.plot)));
        this.highlight();
      }
    },
    plotTapped(i) {
      const s = S();
      if (i >= s.plots) return;
      if (this.sel < 0) {
        if (s.layout[i] && s.buildings[s.layout[i]] > 0) { this.sel = i; VC.Audio.sfx('click'); }
      } else if (this.sel === i) this.sel = -1;
      else {
        G().moveBuilding(this.sel, i);
        this.sel = -1;
      }
      if (UI.tab === 'island') UI.renderPanel();
      this.highlight();
    },
    highlight() {
      const s = S();
      const list = [];
      for (let i = 0; i < s.plots; i++) {
        if (i === this.sel) list.push({ plot: i, color: 0xffd23f });
        else if (this.sel >= 0) {
          const b = ST.BY_ID[s.layout[this.sel]];
          if (ST.plotInfo(i).type === b.plot) list.push({ plot: i, color: 0x7dff9a });
        } else if (!s.layout[i]) list.push({ plot: i, color: 0xffffff });
      }
      VC.Scene.highlightPlots(list);
    },
  };

  // ================================================================== SHIP
  function modDesc(m, lvl) {
    const v = m.val(Math.max(1, lvl));
    const c = { rum: Math.min(25, 0.5 * Math.max(1, lvl)), armor: Math.min(30, 0.5 * Math.max(1, lvl)), spyglass: Math.min(15, 0.5 * Math.max(1, lvl)), galley: Math.min(300, 10 * Math.max(1, lvl)), figure: Math.min(60, 2 * Math.max(1, lvl)) }[m.id] || 0;
    return m.desc.replace('{v}', fmt(v)).replace('{c}', fmt(c));
  }
  P.skinsHtml = function () {
    const s = S();
    let h = '';
    for (const [kind, title] of [['sail', '⛵ Паруса'], ['flag', '🏴 Флаг'], ['hull', '🪵 Корпус']]) {
      h += `<div class="section-title">${title}</div>`;
      for (const sk of VC.SKINS[kind]) {
        const key = kind + ':' + sk.id;
        const owned = s.skins.owned.indexOf(key) >= 0;
        const on = s.skins[kind] === sk.id;
        const sw = `<div class="ico-big" style="background:${sk.color};border:3px solid ${sk.trim || sk.fg || sk.stripe || '#0003'}">${kind === 'flag' ? '<span style="color:' + sk.fg + '">☠</span>' : ''}</div>`;
        let btn;
        if (on) btn = '<span class="tag g">✓ надето</span>';
        else if (owned) btn = `<button class="btn small green" data-act="skin" data-kind="${kind}" data-id="${sk.id}">Надеть</button>`;
        else if (sk.special) btn = `<span class="tag">${sk.special}</span>`;
        else btn = costBtn('skin', sk.price, `data-kind="${kind}" data-id="${sk.id}"`, '', 'pearls');
        h += `<div class="card row">${sw}<div class="grow"><div class="name">${sk.name}</div></div>${btn}</div>`;
      }
    }
    return h;
  };

  P.ship = {
    subs: () => [['ship', '⚓ Корабль'], ['deck', '🧰 Палуба'], ['yard', '🏗️ Верфь'], ['skins', '🎨 Облик']],
    render(sub) {
      const s = S(), D = VC.D, c = D.combat;
      const tier = VC.SHIPS[s.ship.tier - 1];
      if (sub === 'deck') return this.renderDeck();
      if (sub === 'yard') return this.renderYard();
      if (sub === 'skins') return P.skinsHtml();
      let h = `<div class="card"><div class="row"><div class="ico-big">⛵</div><div class="grow">
        <div class="name">«${esc(s.shipName)}» <button class="btn small" data-act="renameShip">✎</button></div>
        <div class="sub">${tier.name} · Боевая мощь <b>⚔️ ${fmt(D.power)}</b></div></div></div>
        <div class="sub" style="margin-top:6px">Корпус ${Math.round(s.ship.hp * 100)}%</div><div class="bar hp" style="margin-top:2px"><i data-live="hp" style="width:${s.ship.hp * 100}%"></i></div>
        ${s.ship.hp < 0.999 ? `<div class="row" style="margin-top:6px"><div class="sub grow">Чинится сам в доке, или…</div>${costBtn('repair', G().repairCost(), '', '🔧 ')}</div>` : ''}
        <div class="grid3" style="margin-top:8px">
          <div class="stat">Прочность<b>${fmt(c.hp)}</b></div><div class="stat">Залп<b>${fmt(c.volley)}</b></div><div class="stat">Перезарядка<b>${c.reload.toFixed(1)} с</b></div>
          <div class="stat">Команда<b>${fmt(c.crew)}</b></div><div class="stat">Уклонение<b>${Math.round(c.eva * 100)}%</b></div><div class="stat">Меткость<b>${Math.round(c.acc * 100)}%</b></div>
        </div></div>`;
      h += `<div class="section-title">Улучшения <span class="mini">предел ${tier.cap}</span></div>`;
      for (const u of VC.UPGRADES) {
        const lvl = s.ship[u.id];
        const capped = lvl >= tier.cap;
        const hl = G().mission() && G().mission().goal.t === 'upg' && G().mission().goal.id === u.id ? ' hl' : '';
        h += `<div class="card row${hl}"><div class="ico-big">${u.icon}<span class="badge">${lvl}</span></div><div class="grow"><div class="name">${u.name}</div>
          <div class="sub">${u.desc}</div><div class="bar" style="margin-top:4px"><i style="width:${lvl / tier.cap * 100}%"></i></div></div>
          ${capped ? '<span class="tag y">MAX</span>' : costBtn('upg', ST.upgradeCost(s, u.id), `data-id="${u.id}"`)}</div>`;
      }
      return h;
    },
    renderDeck() {
      const s = S();
      let h = `<div class="card dark"><div class="sub">Слоты палубы: модули работают, только пока стоят на палубе. Уровни сохраняются, если модуль снять.</div>
        <div class="slots" style="margin-top:8px">${s.ship.deck.map(id => id ? `<div class="slot full">${ST.MOD_BY_ID[id].icon}<small>${s.ship.modules[id]}</small></div>` : '<div class="slot">＋</div>').join('')}</div></div>`;
      for (const m of VC.MODULES) {
        const lvl = s.ship.modules[m.id];
        if (m.ch > G().chapter()) { h += `<div class="card locked row"><div class="ico-big">❔</div><div class="grow"><div class="name">???</div><div class="sub">Глава ${m.ch}</div></div></div>`; continue; }
        const on = s.ship.deck.indexOf(m.id) >= 0;
        const hl = G().mission() && G().mission().goal.t === 'module' && G().mission().goal.id === m.id ? ' hl' : '';
        h += `<div class="card${hl}"><div class="row"><div class="ico-big">${m.icon}${lvl ? `<span class="badge">${lvl}</span>` : ''}</div><div class="grow"><div class="name">${m.name}</div>
          <div class="sub">${modDesc(m, lvl)}${lvl ? '' : ' (на 1 ур.)'}</div></div>${costBtn('mod', ST.moduleCost(s, m.id), `data-id="${m.id}"`)}</div>
          ${lvl ? `<div style="margin-top:6px;text-align:right"><button class="btn small ${on ? 'red' : 'green'}" data-act="modToggle" data-id="${m.id}">${on ? 'Снять с палубы' : 'Поставить на палубу'}</button></div>` : ''}</div>`;
      }
      return h;
    },
    renderYard() {
      const s = S();
      let h = '';
      VC.SHIPS.forEach(t => {
        const own = t.tier <= s.ship.tier;
        const next = t.tier === s.ship.tier + 1;
        const ready = t.ch <= G().chapter() || (t.slava && s.unlocked.endless);
        let btn = own ? (t.tier === s.ship.tier ? '<span class="tag g">✓ ваш</span>' : '<span class="tag">пройден</span>') : '';
        if (next) {
          if (!ready) btn = `<span class="tag r">🔒 глава ${t.ch > 10 ? 'финал' : t.ch}</span>`;
          else if (t.slava && s.slava < t.slava) btn = `<span class="tag r">🌟 ${t.slava} Славы</span>`;
          else btn = costBtn('tier', t.cost);
        }
        h += `<div class="card ${!own && !next ? 'locked' : ''} ${next && ready ? 'hl' : ''}"><div class="row"><div class="ico-big">${['⛵', '⛵', '⛵', '⛵', '🚢', '🛳️', '👻', '🐉'][t.tier]}<span class="badge">${t.tier}</span></div>
          <div class="grow"><div class="name">${t.name}</div><div class="sub">Пушек ${t.guns} · Слотов ${t.slots} · Предел улучшений ${t.cap}</div></div>${btn}</div>
          <div class="sub" style="margin-top:4px">${t.desc}</div></div>`;
      });
      return h;
    },
    live(body) {
      const i = body.querySelector('[data-live=hp]');
      if (i) i.style.width = S().ship.hp * 100 + '%';
    },
  };
  P.ship.subs = P.ship.subs;

  // ================================================================== MAP
  P.map = {
    selected: null, lvl: {},
    subs: () => [['chart', '🗺️ Карта'], ['exp', '🧭 Экспедиции']],
    render(sub) {
      if (sub === 'exp') return this.renderExp();
      const s = S();
      if (this.selected === null) {
        const m = G().mission();
        this.selected = m ? VC.CHAPTERS[m.ch].region : 11;
        if (!G().regionOpen(this.selected)) this.selected = 1;
      }
      return `<canvas id="map-canvas"></canvas><div id="region-info">${this.regionHtml()}</div>`;
    },
    regionHtml() {
      const s = S(), D = VC.D;
      const r = VC.REGIONS[this.selected];
      if (!G().regionOpen(r.id)) return `<div class="card locked"><div class="name">🔒 ${r.name}</div><div class="sub">Откроется по сюжету.</div></div>`;
      const top = G().raidLevel(r.id);
      const lvl = Math.min(top, this.lvl[r.id] || top);
      const preview = ST.enemyStats(r.enemies[0], lvl);
      const ep = ST.powerOf(preview);
      let h = `<div class="card"><div class="name">${r.name}</div><div class="sub">${r.desc}</div>
        <div style="margin-top:4px"><span class="tag">☠️ ур. ${r.min}–${r.endless ? '∞' : r.max}</span>${r.hazards.length ? `<span class="tag b">${[...new Set(r.hazards)].map(z => VC.HAZARDS[z].icon + ' ' + VC.HAZARDS[z].name).join(', ')}</span>` : ''}</div>
        <div class="sub" style="margin-top:6px">Враги: ${r.enemies.map(e => VC.ENEMIES[e].icon + ' ' + VC.ENEMIES[e].name).join(', ')}</div></div>`;
      const m = G().mission();
      if (m && s.story.phase === 'goal' && m.goal.t === 'battle' && VC.CHAPTERS[m.ch].region === r.id) {
        const e = ST.enemyStats(m.goal.enemy, m.goal.lvl);
        h += `<div class="card hl row"><div class="ico-big">${VC.ENEMIES[m.goal.enemy].icon}</div><div class="grow"><div class="name">Сюжет: ${esc(m.title)}</div>
          <div class="sub">${VC.ENEMIES[m.goal.enemy].name} · ур. ${m.goal.lvl}</div>${powerTag(D.power, ST.powerOf(e))}</div><button class="btn red" data-act="story">В бой!</button></div>`;
      }
      if (s.unlocked.map && (r.id > 0 || s.story.idx > 5)) {
        const loot = ST.enemyLoot(r.enemies[0], lvl);
        h += `<div class="card"><div class="row"><div class="ico-big">⚔️</div><div class="grow"><div class="name">Рейд · ур. ${lvl}</div>
          <div class="sub">Добыча ~🪙 ${fmt(loot.gold * D.combat.lootMult)} · ⭐ ${fmt(loot.xp)}</div>${powerTag(D.power, ep)}</div>
          <button class="btn red" data-act="raid" data-r="${r.id}" data-l="${lvl}">В рейд</button></div>
          <div class="row" style="margin-top:8px;justify-content:center"><button class="btn small" data-act="raidLvl" data-v="-1">−</button>
          <span class="mini">уровень ${lvl} (максимум ${top}${!r.endless && top >= r.max ? ', регион покорён' : ''})</span><button class="btn small" data-act="raidLvl" data-v="1">＋</button></div></div>`;
      }
      return h;
    },
    step(v) {
      const r = VC.REGIONS[this.selected];
      const top = G().raidLevel(r.id);
      const cur = Math.min(top, this.lvl[r.id] || top);
      this.lvl[r.id] = Math.max(r.min, Math.min(top, cur + v));
      UI.renderPanel();
    },
    select(id) { this.selected = id; UI.renderPanel(); },
    after(body, sub) {
      if (sub === 'exp') return;
      const cv = body.querySelector('#map-canvas');
      const w = body.clientWidth - 20;
      const h = Math.round(w * 1.05);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.height = h + 'px';
      const ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      this.draw(ctx, w, h);
      cv.addEventListener('click', e => {
        const rc = cv.getBoundingClientRect();
        const x = e.clientX - rc.left, y = e.clientY - rc.top;
        let best = null, bd = 1e9;
        for (const r of VC.REGIONS) {
          const d = Math.hypot(r.x * w - x, r.y * h - y);
          if (d < bd) { bd = d; best = r; }
        }
        if (best && bd < w * 0.12) { VC.Audio.sfx('click'); this.select(best.id); }
      });
    },
    draw(ctx, w, h) {
      const s = S();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#f3e3b8'); g.addColorStop(1, '#dcc28a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // sea texture
      ctx.strokeStyle = 'rgba(58,123,213,0.18)'; ctx.lineWidth = 1.2;
      for (let y = 14; y < h; y += 18) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) ctx.lineTo(x, y + Math.sin(x * 0.08 + y) * 2.5);
        ctx.stroke();
      }
      // route
      ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(110,60,20,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath();
      VC.REGIONS.forEach((r, i) => { const x = r.x * w, y = r.y * h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
      const m = G().mission();
      const cur = m ? VC.CHAPTERS[m.ch].region : 11;
      for (const r of VC.REGIONS) {
        const x = r.x * w, y = r.y * h, rad = w * 0.045;
        const open = G().regionOpen(r.id);
        ctx.save();
        ctx.fillStyle = open ? r.sea : '#9a8a6a';
        ctx.globalAlpha = open ? 0.85 : 0.45;
        ctx.beginPath(); ctx.arc(x, y, rad * 1.35, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = open ? '#e8d39a' : '#b5a37a';
        ctx.beginPath();
        for (let a = 0; a < 12; a++) {
          const ang = a / 12 * Math.PI * 2, rr = rad * (0.62 + 0.18 * Math.sin(a * 2.3 + r.id));
          ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = open ? '#5fae46' : '#8a8a6a';
        ctx.beginPath(); ctx.arc(x, y, rad * 0.38, 0, Math.PI * 2); ctx.fill();
        if (this.selected === r.id) { ctx.strokeStyle = '#f5be3c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, rad * 1.45, 0, Math.PI * 2); ctx.stroke(); }
        ctx.font = `${Math.round(w * 0.032)}px Russo, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#3a2614';
        ctx.fillText(open ? r.name : '???', x, y + rad * 1.35 + w * 0.035);
        ctx.font = `${Math.round(w * 0.05)}px sans-serif`;
        if (!open) ctx.fillText('🔒', x, y + w * 0.018);
        else if (r.id === cur) ctx.fillText('⛵', x, y + w * 0.018);
        else if (r.endless) ctx.fillText('🌀', x, y + w * 0.018);
        ctx.restore();
      }
      // compass
      ctx.save(); ctx.translate(w * 0.9, h * 0.9); ctx.fillStyle = '#7a4a20';
      ctx.font = `${Math.round(w * 0.06)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🧭', 0, 0); ctx.restore();
      ctx.strokeStyle = '#7a4a20'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
    },
    renderExp() {
      const s = S(), D = VC.D;
      if (!s.unlocked.expeditions) return `<div class="card locked"><div class="name">🔒 Экспедиции</div><div class="sub">Откроются после победы над Ржавым Крюком.</div></div>`;
      let h = `<div class="card dark"><div class="sub">Шлюпки уходят за добычей сами и возвращаются даже когда игра закрыта. Слотов: ${D.expSlots}.</div></div>`;
      s.expeditions.forEach((r, i) => {
        const ex = VC.EXPEDITIONS.find(x => x.id === r.id);
        const left = (r.end - Date.now()) / 1000;
        const done = left <= 0;
        h += `<div class="card exp-slot"><div class="row"><div class="ico-big">${ex.icon}</div><div class="grow"><div class="name">${ex.name}</div>
          <div class="sub" data-exp="${i}">${done ? 'Вернулась!' : 'Вернётся через ' + U.fmtTime(left)}</div></div>
          ${done ? `<button class="btn green" data-act="expClaim" data-i="${i}">Забрать</button>` : ''}</div>
          <div class="bar"><i data-expbar="${i}" style="width:${Math.min(100, (Date.now() - r.start) / (r.end - r.start) * 100)}%"></i></div></div>`;
      });
      if (s.expeditions.length < D.expSlots) {
        h += '<div class="section-title">Отправить шлюпку</div>';
        for (const ex of VC.EXPEDITIONS) {
          const t = ex.time * D.expTimeMult / (s.settings.tester ? 30 : 1);
          h += `<div class="card row"><div class="ico-big">${ex.icon}</div><div class="grow"><div class="name">${ex.name}</div>
            <div class="sub">⏱ ${U.fmtTime(t)} · 🪙 ~${fmt(ST.incomeFor(ex.reward * 60) * D.expRewardMult)}${ex.pearls[0] >= 0.3 ? ' · 💎' : ''}${ex.note ? ' · 📜' : ''}${ex.map ? ' · 🗺️' : ''}</div></div>
            <button class="btn" data-act="exp" data-id="${ex.id}">Отправить</button></div>`;
        }
      }
      return h;
    },
    live(body, sub) {
      if (sub !== 'exp') return;
      const s = S();
      let needRender = false;
      s.expeditions.forEach((r, i) => {
        const t = body.querySelector(`[data-exp="${i}"]`), b = body.querySelector(`[data-expbar="${i}"]`);
        const left = (r.end - Date.now()) / 1000;
        if (t) { if (left <= 0 && t.textContent !== 'Вернулась!') needRender = true; t.textContent = left <= 0 ? 'Вернулась!' : 'Вернётся через ' + U.fmtTime(left); }
        if (b) b.style.width = Math.min(100, (Date.now() - r.start) / (r.end - r.start) * 100) + '%';
      });
      if (needRender) UI.renderPanel();
    },
  };

  // ================================================================== CAPTAIN
  P.captain = {
    subs: () => {
      const l = [['talents', '✨ Таланты'], ['crew', '👥 Офицеры'], ['journal', '📖 Журнал'], ['ach', '🏆 Достижения']];
      if (S().unlocked.legend) l.push(['legend', '🌟 Легенда']);
      return l;
    },
    render(sub) {
      const s = S();
      if (sub === 'crew') return this.renderCrew();
      if (sub === 'journal') return this.renderJournal();
      if (sub === 'ach') return this.renderAch();
      if (sub === 'legend') return this.renderLegend();
      const pts = G().talentPoints();
      let h = `<div class="card dark row"><div class="ico-big" style="background:none;font-size:36px">${s.avatar}</div><div class="grow"><div class="name" style="color:var(--gold2)">${esc(s.name)}</div>
        <div class="sub">Уровень ${s.level} · опыт ${fmt(s.xp)}/${fmt(ST.xpNeed(s.level))} · +${(s.level - 1) * 2}% дохода</div></div>
        <div style="text-align:center"><div class="name" style="color:var(--gold2);font-size:22px">${pts}</div><div class="mini">очков</div></div></div>`;
      for (const tree of ['trade', 'gun', 'sea']) {
        h += `<div class="section-title">${VC.TALENT_TREES[tree]}</div><div class="card">`;
        for (const t of VC.TALENTS.filter(x => x.tree === tree)) {
          const r = s.talents[t.id];
          h += `<div class="talent"><div class="ico-big" style="width:40px;height:40px;font-size:22px">${t.icon}</div><div class="grow"><div class="name" style="font-size:13px">${t.name} <span class="mini">${r}/${t.max}</span></div>
            <div class="sub">${t.desc}</div><div class="pips">${Array.from({ length: t.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('')}</div></div>
            ${r < t.max ? `<button class="btn small ${pts > 0 ? 'green' : 'disabled'}" data-act="talent" data-id="${t.id}">＋</button>` : '<span class="tag y">MAX</span>'}</div>`;
        }
        h += '</div>';
      }
      h += `<div class="card dark" style="text-align:center">${this.resetHtml()}</div>`;
      return h;
    },
    /** Talent reset button: price, or the time left until the 12-hour cooldown ends. */
    resetHtml() {
      const left = G().talentResetLeft();
      const cost = G().TALENT_RESET_COST;
      if (left > 0) return `<div class="sub">♻️ Сброс талантов доступен раз в 12 ч</div>
        <button class="btn small disabled" data-act="resetTalents">⏳ Через <span data-reset-left>${U.fmtTime(left / 1000)}</span></button>`;
      return `<div class="sub">♻️ Сброс талантов — раз в 12 ч</div>
        <button class="btn small pearl" data-act="resetTalents">Сбросить таланты · 💎${cost}</button>`;
    },
    live(body, sub) {
      if (sub && sub !== 'talents') return;
      const t = body.querySelector('[data-reset-left]');
      if (!t) return;
      const left = G().talentResetLeft();
      if (left > 0) t.textContent = U.fmtTime(left / 1000);
      else { const box = t.closest('.card'); if (box) box.innerHTML = this.resetHtml(); }
    },
    renderCrew() {
      const s = S();
      let h = `<div class="card dark"><div class="sub">В бою доступны 3 способности офицеров. Пассивные бонусы офицеров работают всегда.</div>
        <div class="slots" style="margin-top:8px">${s.abilities.map(id => id ? `<div class="slot full">${ST.OFF_BY_ID[id].abil.icon}</div>` : '<div class="slot">＋</div>').join('')}</div></div>`;
      for (const o of VC.OFFICERS) {
        const has = s.officers.indexOf(o.id) >= 0;
        if (!has) { h += `<div class="card locked row"><div class="ico-big">❔</div><div class="grow"><div class="name">???</div><div class="sub">Встретится по сюжету</div></div></div>`; continue; }
        const eq = s.abilities.indexOf(o.id) >= 0;
        h += `<div class="card"><div class="row"><div class="ico-big">${o.icon}</div><div class="grow"><div class="name">${o.name}</div><div class="sub">${o.role} · ${o.bonus}</div></div></div>
          <div class="row" style="margin-top:6px"><div class="grow sub">${o.abil.icon} <b>${o.abil.name}</b> (${o.abil.cd} с): ${o.abil.desc}</div>
          <button class="btn small ${eq ? 'red' : 'green'}" data-act="equip" data-id="${o.id}">${eq ? 'Убрать' : 'В бой'}</button></div></div>`;
      }
      return h;
    },
    renderJournal() {
      const s = S();
      let h = `<div class="section-title">💠 Осколки Сердца Моря</div><div class="card dark"><div class="shards">${VC.SHARDS.map(sh => `<div class="shard ${s.shards.indexOf(sh.id) >= 0 ? 'on' : ''}" style="background:${s.shards.indexOf(sh.id) >= 0 ? sh.color : ''}"></div>`).join('')}</div>
        <div class="sub" style="text-align:center">${VC.SHARDS.filter(x => s.shards.indexOf(x.id) >= 0).map(x => `${x.name}: ${x.desc}`).join('<br>') || 'Пока ни одного'}</div></div>`;
      h += `<div class="section-title">📜 Записки Кремня ${s.notes.length}/${VC.NOTES.length}</div><div class="card dark"><div class="sub">Находите бутылки у берега и отправляйте экспедиции.</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">`;
      for (let i = 0; i < VC.NOTES.length; i++) {
        const has = s.notes.indexOf(i) >= 0;
        h += has ? `<button class="btn small" data-act="note" data-i="${i}">№${i + 1}</button>` : `<span class="tag">№${i + 1} ❔</span>`;
      }
      h += '</div></div><div class="section-title">📖 История</div>';
      let lastCh = -1;
      for (let i = 0; i < Math.min(s.story.idx, VC.MISSIONS.length); i++) {
        const m = VC.MISSIONS[i];
        if (m.ch !== lastCh) { lastCh = m.ch; h += `<div class="sub" style="color:var(--gold2);margin:8px 4px 2px">${VC.CHAPTERS[m.ch].title}</div>`; }
        h += `<div class="card row" style="padding:6px 10px;margin:4px 0"><div class="grow name" style="font-size:13px">✓ ${esc(m.title)}</div><button class="btn small" data-act="replay" data-i="${i}">Перечитать</button></div>`;
      }
      if (!s.story.idx) h += '<div class="empty">История только начинается…</div>';
      return h;
    },
    renderAch() {
      const s = S();
      const got = Object.keys(s.achievements).length;
      let h = `<div class="card dark"><div class="sub">Получено ${got}/${VC.ACHIEVEMENTS.length}. Каждое достижение навсегда даёт +1% к доходу.</div></div>`;
      for (const a of VC.ACHIEVEMENTS) {
        const done = !!s.achievements[a.id];
        const cur = Math.min(a.n, s.stats[a.stat] || 0);
        h += `<div class="card row ach ${done ? '' : 'locked'}" data-act="achInfo" data-id="${a.id}" style="${done ? '' : 'filter:none;opacity:.85'}"><div class="ico-big">${done ? '🏆' : '🔒'}</div><div class="grow"><div class="name" style="font-size:13px">${a.name} <span class="mini">ⓘ</span></div>
          <div class="mini ach-how">${esc(P.achHow(a))}</div>
          <div class="bar" style="margin-top:4px"><i style="width:${cur / a.n * 100}%"></i></div><div class="mini">${fmt(cur)} / ${fmt(a.n)}</div></div><span class="tag b">💎${a.pearls}</span></div>`;
      }
      return h;
    },
    renderLegend() {
      const s = S();
      const gain = G().slavaGain();
      return `<div class="card"><div class="row"><div class="ico-big">🌟</div><div class="grow"><div class="name">Слава: ${s.slava}</div>
        <div class="sub">+${s.slava * 5}% дохода и силы тапа, +${s.slava * 3}% к бою</div></div></div></div>
        <div class="card"><div class="name">Стать легендой</div><div class="sub">Начните путь заново с новыми силами. Сюжет, корабль, участки, таланты, офицеры и жемчуг сохраняются.
        Сбрасываются золото, уровни построек, улучшения и модули корабля.</div>
        <div class="big r" style="color:var(--ink);font-size:20px;margin:8px 0">Получите: 🌟 ${gain}</div>
        <div class="sub">Слава растёт от золота, заработанного в этом пути (🪙 ${fmt(s.goldRun)}).</div>
        <div style="margin-top:8px"><button class="btn wide ${gain > 0 ? '' : 'disabled'}" data-act="legend">Стать легендой</button></div></div>
        <div class="card dark"><div class="sub">🗿 10 Славы — Памятник Кремню (постройка, +25% соседям)<br>🐉 50 Славы — корабль «Левиафан» после финала</div></div>`;
    },
  };

  // ================================================================== SHOP
  P.shop = {
    subs: () => [['pearls', '💎 За жемчуг'], ['gold', '🪙 За дублоны'], ['skins', '🎨 Скины']],
    render(sub) {
      const s = S();
      if (sub === 'skins') return P.skinsHtml();
      if (sub === 'gold') {
        return VC.GOLD_SHOP.map(it => `<div class="card row"><div class="ico-big">${it.icon}</div><div class="grow"><div class="name">${it.name}</div><div class="sub">${it.desc}</div></div>
          ${costBtn('gshop', G().goldShopPrice(it), `data-id="${it.id}"`)}</div>`).join('') +
          `<div class="card dark"><div class="sub">Цены зависят от дохода острова.</div></div>`;
      }
      let h = `<div class="card dark"><div class="sub">💎 Жемчуг даётся за сюжет, достижения, задания дня, редкие события, боссов и дуэли. Покупки за реальные деньги в игре нет.</div></div>`;
      const cats = { boost: '✨ Усилители', chest: '🧰 Сундуки', perm: '♾️ Навсегда' };
      for (const cat in cats) {
        h += `<div class="section-title">${cats[cat]}</div>`;
        for (const it of VC.SHOP.filter(x => x.cat === cat)) {
          const owned = it.once && s.perms[it.id];
          h += `<div class="card row"><div class="ico-big">${it.icon}</div><div class="grow"><div class="name">${it.name}</div><div class="sub">${it.desc}</div></div>
            ${owned ? '<span class="tag g">✓ куплено</span>' : costBtn('shop', it.price, `data-id="${it.id}"`, '', 'pearls')}</div>`;
        }
      }
      return h;
    },
  };

  // ================================================================== DUEL (rendered by duel.js)
  P.duel = {
    render() { return VC.Duel.renderPanel(); },
    after(body) { VC.Duel.afterPanel(body); },
    live(body) { VC.Duel.livePanel(body); },
  };

  // ================================================================== modals
  P.settings = function () {
    const s = S();
    const st = s.settings;
    const row = (label, key) => `<div class="row" style="justify-content:space-between;margin:8px 0"><span>${label}</span><button class="btn small ${st[key] ? 'green' : 'disabled'}" data-set="${key}">${st[key] ? 'Вкл' : 'Выкл'}</button></div>`;
    UI.modal({
      title: '⚙️ Настройки',
      html: `<div style="text-align:left">${row('🔊 Звуки', 'sound')}${row('🎵 Музыка', 'music')}${row('📳 Вибрация', 'vibro')}
        <div style="margin:8px 0"><span>🖥️ Графика</span>${(st.quality || 'auto') === 'auto' && VC.Scene.qualityLevel ? `<span class="mini" style="opacity:0.75"> · сейчас ${{ low: 'низкая', medium: 'средняя', high: 'высокая' }[VC.Scene.qualityLevel]}</span>` : ''}
          <div class="toggle-row" style="margin-top:6px">${['auto', 'low', 'medium', 'high'].map(q => `<button data-q="${q}" style="flex:1;padding:6px 2px" class="${(st.quality || 'auto') === q ? 'active' : ''}">${{ auto: 'Авто', low: 'Низкая', medium: 'Средняя', high: 'Высокая' }[q]}</button>`).join('')}</div></div>
        <div class="row" style="justify-content:space-between;margin:8px 0"><span>✏️ Капитан: ${esc(s.name)}</span><button class="btn small" data-x="rename">Изменить</button></div>
        <hr style="border-color:#6b4423">
        ${row('🧪 Режим тестировщика', 'tester')}
        ${st.tester ? `<div class="sub" style="color:#d9c49a">Ускорение времени и подарки для проверки контента.</div>
          <div class="toggle-row" style="margin:6px 0">${[1, 5, 20].map(v => `<button data-speed="${v}" class="${(st.speed || 1) === v ? 'active' : ''}">×${v}</button>`).join('')}</div>
          ${row('♻️ Сброс талантов без таймера', 'noResetTimer')}
          <div class="btns" style="justify-content:flex-start;margin-top:6px"><button class="btn small" data-x="gold">+1 ч дохода</button><button class="btn small" data-x="gold10">+×10 золота</button><button class="btn small pearl" data-x="pearls">+100 💎</button>
          <button class="btn small" data-x="xp">+5 уровней</button><button class="btn small red" data-x="skip">Пропустить миссию</button><button class="btn small" data-x="event">Событие</button></div>` : ''}
        <hr style="border-color:#6b4423">
        <div class="btns" style="justify-content:flex-start"><button class="btn small" data-x="export">Экспорт сохранения</button><button class="btn small" data-x="import">Импорт</button><button class="btn small red" data-x="reset">Начать заново</button></div>
        <p class="mini" style="margin-top:10px">Воксельные Корсары v${VC.VERSION}. three.js (MIT), шрифт Russo One (OFL), мелодия «Drunken Sailor» (народная).</p></div>`,
      buttons: [{ label: 'Закрыть', cls: 'green' }],
      mount: (m, close) => {
        m.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
          const k = b.dataset.set;
          st[k] = !st[k];
          if (k === 'sound') VC.Audio.setSound(st.sound);
          if (k === 'music') VC.Audio.setMusic(st.music);
          if (k === 'tester' && !st.tester) st.speed = 1;
          G().save(); close(); P.settings();
        }));
        m.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
          st.quality = b.dataset.q; G().save();
          VC.Scene.setQuality(st.quality);
          close(); P.settings();
        }));
        m.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { st.speed = +b.dataset.speed; close(); P.settings(); }));
        m.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
          const x = b.dataset.x;
          if (x === 'rename') { close(); UI.prompt('Имя капитана', 'Новое имя:', s.name, v => { s.name = v.slice(0, 16); G().save(); }, 16); }
          if (x === 'gold') { G().addGold(ST.incomeFor(3600) + 1000); UI.toast('+1 час дохода'); }
          if (x === 'gold10') { G().addGold(Math.max(1000, s.gold * 9)); UI.toast('Золото ×10'); }
          if (x === 'pearls') { s.pearls += 100; UI.toast('+100 💎'); }
          if (x === 'xp') { for (let i = 0; i < 5; i++) G().addXp(ST.xpNeed(s.level)); }
          if (x === 'skip') { close(); P.skipMission(); }
          if (x === 'event') { close(); VC.Events.spawnRandom(true); }
          if (x === 'export') {
            close();
            const code = btoa(unescape(encodeURIComponent(JSON.stringify(s))));
            UI.modal({ title: 'Сохранение', html: `<p class="mini">Скопируйте код:</p><textarea readonly>${code}</textarea>`, buttons: [{ label: 'Готово', cls: 'green' }],
              mount: mm => { const t = mm.querySelector('textarea'); t.focus(); t.select(); } });
          }
          if (x === 'import') {
            close();
            UI.modal({ title: 'Импорт', html: '<p class="mini">Вставьте код сохранения:</p><textarea></textarea>', buttons: [{ label: 'Отмена' }, { label: 'Загрузить', cls: 'green', fn: mm => {
              try {
                const data = JSON.parse(decodeURIComponent(escape(atob(mm.querySelector('textarea').value.trim()))));
                if (!data.stats) throw new Error('bad');
                ST.save(ST.migrate(data)); location.reload();
              } catch (e) { UI.toast('Код не подошёл', 'bad'); }
            } }] });
          }
          if (x === 'reset') {
            close();
            UI.confirm('Начать заново?', 'Весь прогресс будет удалён без возврата!', 'Удалить всё', () => {
              UI.confirm('Точно?', 'Это действительно сотрёт сохранение.', 'Да, стереть', () => { G().paused = true; ST.wipe(); location.reload(); });
            });
          }
          G().afterChange();
        }));
      },
    });
  };

  P.skipMission = function () {
    const s = S();
    const m = G().mission();
    if (!m) return;
    if (s.story.phase === 'intro') { UI.finishDialogue && UI.dialogueQueue.splice(0); if (UI.dlg) UI.finishDialogue(); return; }
    if (m.goal.t === 'choice') { G().showChoice(); return; }
    // Satisfy the requirement directly so the mission completes.
    const g = m.goal;
    if (g.t === 'build') { if (ST.plotOf(s, g.id) < 0) { const p = ST.bestPlot(s, g.id); if (p < 0) { s.plots = Math.min(16, s.plots + 1); } s.layout[ST.bestPlot(s, g.id)] = g.id; } s.buildings[g.id] = Math.max(s.buildings[g.id], g.n); VC.Scene.refreshBuildings(s); }
    if (g.also && g.also.t === 'build') { if (ST.plotOf(s, g.also.id) < 0) s.layout[ST.bestPlot(s, g.also.id)] = g.also.id; s.buildings[g.also.id] = Math.max(s.buildings[g.also.id], g.also.n); VC.Scene.refreshBuildings(s); }
    if (g.t === 'upg') s.ship[g.id] = Math.max(s.ship[g.id], g.n);
    if (g.t === 'tier') { s.ship.tier = Math.max(s.ship.tier, g.n); while (s.ship.deck.length < VC.SHIPS[s.ship.tier - 1].slots) s.ship.deck.push(null); VC.Scene.refreshPlayerShip(s); }
    if (g.t === 'module') { s.ship.modules[g.id] = Math.max(1, s.ship.modules[g.id]); if (s.ship.deck.indexOf(g.id) < 0) { const f = s.ship.deck.indexOf(null); s.ship.deck[f >= 0 ? f : 0] = g.id; } }
    if (g.t === 'level') while (s.level < g.n) G().addXp(ST.xpNeed(s.level));
    ST.recompute(s);
    G().completeGoal();
  };

  P.daily = function () {
    const s = S();
    G().dailyCheck();
    const day = s.daily.streak % 7;
    const label = r => r.pearls ? `💎${r.pearls}` : r.mins ? `🪙 ${r.mins} мин` : r.boost ? '🌬️ ×2' : '🧰';
    UI.modal({
      title: '🎁 Награда за вход',
      html: `<p class="mini">Заходите каждый день — награды растут. Пропуск сбрасывает серию.</p>
        <div class="grid3" style="grid-template-columns:repeat(4,1fr);margin:10px 0">${VC.DAILY_LOGIN.map((r, i) => `<div class="stat" style="${i === day ? 'outline:3px solid var(--gold2);' : ''}${i < day || (i === day && s.daily.loginClaimed) ? 'opacity:.5' : ''};color:#f6e7c1">День ${i + 1}<b>${label(r)}</b></div>`).join('')}</div>`,
      buttons: [s.daily.loginClaimed ? { label: 'Завтра будет ещё!', cls: 'disabled' } : { label: 'Забрать', cls: 'green', fn: () => G().claimLogin() }],
    });
  };

  P.quests = function () {
    const s = S();
    G().dailyCheck();
    const html = s.daily.quests.map((q, i) => {
      const t = VC.DAILY_QUESTS.find(x => x.id === q.id);
      const p = G().questProgress(q);
      return `<div class="card" style="text-align:left"><div class="name" style="font-size:13px">${t.text.replace('{n}', q.n)}</div>
        <div class="row" style="margin-top:6px"><div class="grow"><div class="bar"><i style="width:${p / q.n * 100}%"></i></div><div class="mini">${p}/${q.n} · награда 💎8 + 10 мин дохода</div></div>
        ${q.claimed ? '<span class="tag g">✓</span>' : `<button class="btn small ${p >= q.n ? 'green' : 'disabled'}" data-q="${i}">Забрать</button>`}</div></div>`;
    }).join('');
    UI.modal({
      title: '📋 Задания дня', html: html + `<p class="mini">Все три — ещё 💎15 сверху. Новые задания каждый день.</p>`,
      buttons: [{ label: 'Закрыть' }],
      mount: (m, close) => m.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { if (b.classList.contains('disabled')) return; close(); G().claimQuest(+b.dataset.q); })),
    });
  };

  P.replay = function (i) {
    const m = VC.MISSIONS[i];
    UI.dialogue(m.intro.concat(m.outro), { chapter: m.title });
  };
  // ================================================================== achievement help
  // What to do for each achievement statistic (an achievement may also carry its own `desc`).
  const ACH_HOW = {
    taps: n => `Тапните по острову ${fmt(n)} раз — считаются все тапы за всю игру, в том числе по сундуку.`,
    goldEarned: n => `Заработайте за всё время ${fmt(n)} 🪙: доход построек, тапы, награды миссий, добыча в боях и события.`,
    wins: n => `Победите в ${fmt(n)} морских боях: сюжетные бои, рейды с карты и бои из событий у острова.`,
    bosses: n => `Победите ${fmt(n)} боссов — сюжетных капитанов и чудовищ (в рейдах они тоже попадаются).`,
    buildingLevels: n => `Купите в сумме ${fmt(n)} уровней построек на острове (все постройки вместе).`,
    shipTier: n => { const sh = VC.SHIPS[n - 1]; return `Получите корабль ${n}-го класса${sh ? ` — «${sh.name}»` : ''} (вкладка «Корабль», новые классы открывает сюжет).`; },
    level: n => `Поднимите капитана до ${n} уровня. Опыт дают бои, сюжетные миссии и события.`,
    parrots: n => `Поймайте ${fmt(n)} попугаев: когда над островом пролетает попугай, тапните по нему.`,
    events: n => `Поучаствуйте в ${fmt(n)} событиях у острова: бутылки с записками, крабы, торговцы, попугаи, шторм и другие.`,
    expeditions: n => `Завершите ${fmt(n)} экспедиций (вкладка «Корабль» → «Экспедиции», откроются после победы над Ржавым Крюком).`,
    notes: n => `Найдите ${fmt(n)} записок Кремня — в бутылках у берега и в экспедициях.`,
    pvpWins: n => `Победите живых игроков в ${fmt(n)} дуэлях (вкладка «Дуэль», дуэли с ботом не считаются).`,
    frenzies: n => `Устройте ${fmt(n)} золотых лихорадок: тапайте быстро, пока шкала 🔥 справа не заполнится.`,
    shards: n => `Соберите все ${fmt(n)} осколков Сердца Моря, проходя сюжет.`,
    prestiges: n => `Станьте легендой ${n > 1 ? fmt(n) + ' раз' : ''}: «Капитан» → «🌟 Легенда» (открывается в 5-й главе). Путь начнётся заново, но со Славой.`,
    endless: n => `Пройдите ${fmt(n)} уровней в Бездонных водах — бесконечном регионе карты, который открывается после финала сюжета.`,
    boardings: n => `Возьмите на абордаж ${fmt(n)} кораблей.`,
  };
  P.achHow = function (a) {
    if (a.desc) return a.desc;
    const f = ACH_HOW[a.stat];
    return f ? f(a.n) : `Прогресс: ${fmt(a.n)}`;
  };
  /** Achievement card tap: what to do, progress and reward. */
  P.achInfo = function (id) {
    const s = S();
    const a = VC.ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return;
    const at = s.achievements[a.id];
    const cur = Math.min(a.n, s.stats[a.stat] || 0);
    const when = typeof at === 'number' && at > 1 ? new Date(at).toLocaleDateString('ru-RU') : '';
    UI.modal({
      icon: at ? '🏆' : '🔒',
      title: esc(a.name),
      html: `<p>${esc(P.achHow(a))}</p>
        <div class="bar" style="margin:8px 0 4px"><i style="width:${cur / a.n * 100}%"></i></div>
        <div class="mini">${at ? `Получено${when ? ' ' + when : ''} ✓` : `Прогресс: ${fmt(cur)} / ${fmt(a.n)}`}</div>
        <p class="mini" style="margin-top:8px">Награда: 💎${a.pearls} и +1% к доходу навсегда.</p>`,
      buttons: [{ label: 'Понятно', cls: 'green' }],
    });
  };

  P.showNote = function (i) {
    UI.modal({ title: '📜 Записка №' + (i + 1), html: `<p style="font-style:italic">${esc(VC.NOTES[i])}</p>`, buttons: [{ label: 'Закрыть' }] });
  };

  VC.VERSION = '0.2.0';
})(window.VC);
