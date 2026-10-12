'use strict';
// 1v1 duels: LAN lobby, host-authoritative battle sync, rating, and a practice bot.
(function (VC) {
  const U = VC.util, ST = VC.State, UI = VC.UI;
  const { fmt, esc } = U;
  const PROTO = 1;
  const BOT_NAMES = ['Капитан Сиплый', 'Рыжая Бетти', 'Барон Суббота', 'Хромой Сэм', 'Чёрная Мэри', 'Дон Кальмар', 'Старый Гарпун', 'Леди Шторм'];

  const D = {
    phase: 'idle', // idle | hosting | searching | connecting | lobby | battle
    found: [], peer: null, mode: 'equal', ready: [false, false], isHost: false, snapT: 0, ips: '',
  };
  VC.Duel = D;

  D.init = function () {
    const N = VC.Net;
    N.on('hosting', o => { D.ips = o.ips || ''; D.code = o.code || ''; D.refresh(); });
    N.on('found', o => {
      if (D.phase !== 'searching') return;
      const ex = D.found.find(f => f.ip === o.ip);
      if (ex) { ex.t = Date.now(); ex.name = o.name; }
      else { D.found.push({ ip: o.ip, name: o.name, t: Date.now() }); D.refresh(); }
    });
    N.on('connected', () => {
      VC.Net.discover(false);
      D.phase = 'lobby';
      D.ready = [false, false];
      D.peer = null;
      D.send({ t: 'hello', v: PROTO, p: D.profile() });
      D.refresh();
      VC.Audio.sfx('bell');
    });
    N.on('msg', o => D.onMsg(o.data));
    N.on('closed', () => D.onClosed());
    N.on('error', o => {
      if (D.phase === 'connecting' || D.phase === 'hosting') {
        UI.toast('Связь не установлена: ' + (o.message || ''), 'bad');
        D.phase = 'idle';
        D.refresh();
      }
    });
  };

  D.send = function (o) { VC.Net.send(o); };

  /** What we tell the opponent about ourselves. */
  D.profile = function () {
    const s = VC.Game.s;
    ST.recompute(s);
    const own = Object.assign({}, VC.D.combat);
    own.hp = own.maxHp;
    const eq = ST.combatStats(s, VC.DUEL.equalShip);
    eq.abilities = own.abilities;
    eq.fireAmmo = own.fireAmmo;
    return {
      name: s.name, avatar: s.avatar, ship: s.shipName, rating: s.pvp.rating, tier: s.ship.tier, skin: s.skins,
      own, eq, power: VC.D.power,
    };
  };

  D.rank = function (r) {
    if (r >= 1700) return '🌟 Легенда морей';
    if (r >= 1500) return '🎖️ Адмирал';
    if (r >= 1350) return '⚓ Коммодор';
    if (r >= 1200) return '🏴‍☠️ Капитан';
    if (r >= 1100) return '🪢 Боцман';
    if (r >= 1000) return '⛵ Матрос';
    return '🧹 Юнга';
  };

  // ------------------------------------------------------------------ panel
  D.renderPanel = function () {
    const s = VC.Game.s;
    const net = VC.Net.kind;
    let h = `<div class="card"><div class="row"><div class="ico-big">${s.avatar}</div><div class="grow"><div class="name">${esc(s.name)}</div>
      <div class="sub">${D.rank(s.pvp.rating)} · рейтинг <b>${Math.round(s.pvp.rating)}</b> · побед ${s.pvp.wins} / поражений ${s.pvp.losses}</div></div></div></div>
      <div class="section-title">Режим боя</div>
      <div class="toggle-row" style="justify-content:center">
        <button data-act="duelMode" data-v="equal" class="${D.mode === 'equal' ? 'active' : ''}">⚖️ Равный бой</button>
        <button data-act="duelMode" data-v="own" class="${D.mode === 'own' ? 'active' : ''}">⛵ Свои корабли</button></div>
      <div class="card dark"><div class="sub">${D.mode === 'equal' ? 'Оба капитана на одинаковых фрегатах. Решают тапы, выбор ядер, способности офицеров и абордаж.' : 'Каждый выходит на своём корабле со всеми улучшениями, талантами и офицерами.'}</div></div>`;
    h += `<div class="section-title">Дуэль с другом рядом</div>`;
    if (net === 'none') h += `<div class="card locked"><div class="sub">Сетевая игра недоступна на этом устройстве.</div></div>`;
    else {
      h += `<div class="card dark"><div class="sub">${net === 'android'
        ? '📶 Оба телефона должны быть в одной сети Wi-Fi — или один телефон раздаёт точку доступа, а второй к ней подключён. Интернет не нужен.'
        : '🧪 Браузерный режим: откройте игру во второй вкладке — вкладки увидят друг друга как два телефона.'}</div></div>`;
      if (D.phase === 'idle') {
        h += `<div class="grid2"><button class="btn green" data-act="duelHost">📣 Создать дуэль</button><button class="btn blue" data-act="duelFind">🔭 Найти дуэль</button></div>
          ${net === 'android' ? '<div style="margin-top:8px;text-align:center"><button class="btn small" data-act="duelIp">Подключиться по IP</button></div>' : ''}`;
      } else if (D.phase === 'hosting') {
        h += D.online
          ? `<div class="card"><div class="name">🌐 Комната создана</div>${D.code ? `<div class="big r" style="font-size:34px;text-align:center;letter-spacing:6px;margin:6px 0">${esc(D.code)}</div><div class="sub">Сообщите этот код другу: «Дуэль → Онлайн → Войти по коду».</div>` : '<div class="sub">Подключаемся к серверу…</div>'}
            <div style="margin-top:8px"><button class="btn red small" data-act="duelCancel">Отмена</button></div></div>`
          : `<div class="card"><div class="name">📣 Ждём соперника…</div><div class="sub">Попросите друга нажать «Найти дуэль».${D.ips ? `<br>Ваш адрес: <b>${esc(D.ips)}</b>` : ''}</div>
            <div style="margin-top:8px"><button class="btn red small" data-act="duelCancel">Отмена</button></div></div>`;
      } else if (D.phase === 'searching') {
        h += `<div class="card"><div class="name">🔭 Ищем дуэли рядом…</div>`;
        const list = D.found.filter(f => Date.now() - f.t < 4000);
        h += list.length ? list.map(f => `<div class="row" style="margin-top:6px"><div class="grow">🏴‍☠️ <b>${esc(f.name)}</b> <span class="mini">${esc(f.ip)}</span></div>
          <button class="btn small green" data-act="duelJoin" data-ip="${esc(f.ip)}">Вызвать</button></div>`).join('') : '<div class="sub">Пока никого. Друг должен нажать «Создать дуэль».</div>';
        h += `<div style="margin-top:8px"><button class="btn red small" data-act="duelCancel">Отмена</button></div></div>`;
      } else if (D.phase === 'connecting') {
        h += `<div class="card"><div class="name">⏳ Подключаемся…</div><button class="btn red small" data-act="duelCancel">Отмена</button></div>`;
      } else if (D.phase === 'lobby' || D.phase === 'battle') {
        h += D.lobbyHtml();
      }
    }
    if (D.phase === 'idle') {
      const url = s.settings.relay || '';
      h += `<div class="section-title">Онлайн-дуэль (через сервер)</div>
        <div class="card dark"><div class="sub">Для игры с другом в другом месте нужен свой relay-сервер (tools/relay_server.js, см. README).
        Сервер: <b>${url ? esc(url) : 'не задан'}</b> <button class="btn small" data-act="duelServer">✎</button></div></div>
        <div class="grid2"><button class="btn green ${url ? '' : 'disabled'}" data-act="duelOnHost">🌐 Создать комнату</button><button class="btn blue ${url ? '' : 'disabled'}" data-act="duelOnJoin">🔑 Войти по коду</button></div>`;
    }
    h += `<div class="section-title">Тренировка</div>
      <div class="card row"><div class="ico-big">🤖</div><div class="grow"><div class="name">Дуэль с ботом</div><div class="sub">Капитан-соперник под управлением компьютера. Без рейтинга.</div></div>
      <button class="btn" data-act="duelBot">В бой</button></div>`;
    if (s.pvp.history.length) {
      h += `<div class="section-title">История</div>`;
      h += s.pvp.history.slice(-8).reverse().map(x => `<div class="card dark row" style="padding:6px 10px;margin:4px 0"><div class="grow">${x.win ? '🏆' : '💀'} ${esc(x.name)} <span class="mini">${x.mode === 'equal' ? '⚖️' : '⛵'} ${x.bot ? '🤖' : ''}</span></div><span class="mini">${x.delta ? (x.delta > 0 ? '+' : '') + x.delta : ''}</span></div>`).join('');
    }
    return h;
  };

  D.lobbyHtml = function () {
    const s = VC.Game.s;
    const p = D.peer;
    if (!p) return `<div class="card"><div class="name">🤝 Соединение установлено</div><div class="sub">Обмениваемся флагами…</div></div>`;
    const myReady = D.ready[D.isHost ? 0 : 1], theirReady = D.ready[D.isHost ? 1 : 0];
    const myStats = D.mode === 'equal' ? D.profile().eq : D.profile().own;
    const theirStats = D.mode === 'equal' ? p.eq : p.own;
    return `<div class="card"><div class="name" style="text-align:center">⚔️ Дуэль ${D.mode === 'equal' ? '⚖️ равная' : '⛵ на своих кораблях'}</div>
      <div class="row" style="margin-top:8px"><div class="grow" style="text-align:center"><div style="font-size:30px">${s.avatar}</div><b>${esc(s.name)}</b><div class="mini">⚔️ ${fmt(ST.powerOf(myStats))} · ${Math.round(s.pvp.rating)}</div>${myReady ? '<span class="tag g">готов</span>' : ''}</div>
      <div class="name">VS</div>
      <div class="grow" style="text-align:center"><div style="font-size:30px">${p.avatar}</div><b>${esc(p.name)}</b><div class="mini">⚔️ ${fmt(ST.powerOf(theirStats))} · ${Math.round(p.rating)}</div>${theirReady ? '<span class="tag g">готов</span>' : ''}</div></div>
      ${D.isHost ? '<div class="sub" style="text-align:center;margin-top:6px">Режим выбирает создатель дуэли (переключатель выше).</div>' : '<div class="sub" style="text-align:center;margin-top:6px">Режим выбирает создатель дуэли.</div>'}
      <div class="grid2" style="margin-top:8px"><button class="btn ${myReady ? 'disabled' : 'green'}" data-act="duelReady">${myReady ? 'Ждём…' : '✅ Готов!'}</button><button class="btn red" data-act="duelLeave">Выйти</button></div></div>`;
  };
  D.afterPanel = function () {};
  D.livePanel = function () {
    if (D.phase === 'searching') {
      const sig = D.found.filter(f => Date.now() - f.t < 4000).map(f => f.ip).join(',');
      if (sig !== D._sig) { D._sig = sig; UI.renderPanel(); }
    }
  };
  D.refresh = function () { if (UI.tab === 'duel') UI.renderPanel(); };

  // ------------------------------------------------------------------ actions
  D.action = function (name, arg, d) {
    const s = VC.Game.s;
    switch (name) {
      case 'duelMode':
        if (D.phase === 'lobby' && !D.isHost) { UI.toast('Режим выбирает создатель дуэли'); return true; }
        D.mode = d.v;
        if (D.phase === 'lobby' && D.isHost) { D.ready = [false, false]; D.send({ t: 'mode', m: D.mode }); }
        D.refresh();
        return true;
      case 'duelServer':
        UI.prompt('Relay-сервер', 'Адрес, например ws://192.168.1.10:8080 или wss://mygame.example.com', s.settings.relay || 'ws://', v => {
          s.settings.relay = v.trim(); VC.Game.save(); D.refresh();
        }, 120);
        return true;
      case 'duelOnHost':
        if (!s.settings.relay) return true;
        D.isHost = true; D.online = true; D.phase = 'hosting'; D.code = '';
        VC.Net.onlineHost(s.settings.relay);
        D.refresh();
        return true;
      case 'duelOnJoin':
        if (!s.settings.relay) return true;
        UI.prompt('Код комнаты', 'Введите 4 символа от друга:', '', code => {
          D.isHost = false; D.online = true; D.phase = 'connecting';
          VC.Net.onlineJoin(s.settings.relay, code.toUpperCase());
          D.refresh();
        }, 6);
        return true;
      case 'duelHost':
        D.online = false;
        D.isHost = true; D.phase = 'hosting'; D.ips = VC.Net.localIps();
        VC.Net.host(s.name);
        D.refresh();
        return true;
      case 'duelFind':
        D.online = false;
        D.isHost = false; D.phase = 'searching'; D.found = [];
        VC.Net.discover(true);
        D.refresh();
        return true;
      case 'duelIp':
        UI.prompt('Подключение', 'IP-адрес телефона соперника (показан у него на экране):', '192.168.', ip => D.join(ip), 40);
        return true;
      case 'duelJoin': D.join(d.ip); return true;
      case 'duelCancel': case 'duelLeave':
        D.leave(); return true;
      case 'duelReady':
        D.setReady(D.isHost ? 0 : 1);
        return true;
      case 'duelBot': D.startBot(); return true;
    }
    return false;
  };

  D.join = function (ip) {
    D.online = false;
    D.isHost = false;
    D.phase = 'connecting';
    VC.Net.discover(false);
    VC.Net.connect(ip);
    D.refresh();
  };

  D.leave = function () {
    VC.Net.discover(false);
    if (D.phase === 'lobby') D.send({ t: 'bye' });
    VC.Net.close();
    D.phase = 'idle'; D.peer = null; D.found = [];
    D.refresh();
  };

  D.setReady = function (i) {
    D.ready[i] = true;
    D.send({ t: 'ready', i });
    D.refresh();
    D.maybeStart();
  };

  D.maybeStart = function () {
    if (!D.isHost || !D.peer || !D.ready[0] || !D.ready[1] || D.phase !== 'lobby') return;
    const me = D.profile();
    const a = D.mode === 'equal' ? me.eq : me.own;
    const b = D.mode === 'equal' ? D.peer.eq : D.peer.own;
    const seed = (Math.random() * 1e9) | 0;
    const start = { t: 'start', seed, mode: D.mode, a, b, pa: { name: me.name, avatar: me.avatar, tier: me.tier, skin: me.skin, ship: me.ship }, pb: { name: D.peer.name, avatar: D.peer.avatar, tier: D.peer.tier, skin: D.peer.skin, ship: D.peer.ship } };
    D.send(start);
    D.beginNet(start, true);
  };

  // ------------------------------------------------------------------ protocol
  D.onMsg = function (m) {
    switch (m.t) {
      case 'hello':
        if (m.v !== PROTO) { UI.toast('У соперника другая версия игры', 'bad'); D.leave(); return; }
        D.peer = m.p;
        if (D.isHost) D.send({ t: 'mode', m: D.mode });
        D.refresh();
        break;
      case 'mode': D.mode = m.m; D.ready = [false, false]; D.refresh(); break;
      case 'ready': D.ready[m.i] = true; D.refresh(); D.maybeStart(); break;
      case 'bye': UI.toast('Соперник покинул лобби'); D.leave(); break;
      case 'start': if (!D.isHost) D.beginNet(m, false); break;
      case 'in': if (D.isHost && D.net) D.net.b.input(1, m.c, m.a); break;
      case 'st': if (!D.isHost && D.net) { D.net.b.applySnapshot(m.s); D.net.lastSnap = performance.now(); } break;
      case 'stalled':
        // The guest stopped hearing from us (e.g. this phone was in the background): it took a
        // technical win, so end the battle here as a loss instead of fighting on alone.
        if (D.isHost && D.net && !D.net.b.over) D.net.b.finish(1, 'stalled');
        break;
      case 'fx': if (!D.isHost && D.net) for (const e of m.l) D.net.queue.push(e); break;
      case 'end': if (!D.isHost && D.net) { D.net.b.over = true; D.net.b.winner = m.w; D.net.b.reason = m.r; } break;
      case 'emote': D.showEmote(m.i, false); break;
    }
  };

  D.onClosed = function () {
    if (D.phase === 'battle' && D.net && !D.net.b.over) {
      UI.toast('Соединение потеряно — победа присуждена вам', 'bad');
      D.net.b.over = true;
      D.net.b.winner = D.net.me;
      D.net.b.reason = 'disconnect';
    } else if (D.phase === 'lobby') UI.toast('Соединение с соперником потеряно', 'bad');
    if (D.phase !== 'battle') { D.phase = 'idle'; D.peer = null; D.refresh(); }
  };

  D.shipFor = function (p, mode) {
    const tier = mode === 'equal' ? VC.DUEL.equalShip.tier : p.tier;
    return { tier, style: VC.Models.playerStyle(p.skin), seed: 5 };
  };

  /** Starts the networked battle. host: side 0 simulates; client mirrors snapshots. */
  D.beginNet = function (m, host) {
    D.phase = 'battle';
    const b = new VC.Combat.Battle(m.a, m.b, host ? ['human', 'remote'] : ['remote', 'human'], { seed: m.seed, pvp: true });
    const me = host ? 0 : 1;
    const net = { b, me, queue: [], host, lastSnap: performance.now() };
    D.net = net;
    const mine = host ? m.pa : m.pb, theirs = host ? m.pb : m.pa;
    const sim = {
      b, me,
      input(cmd, arg) {
        if (host) return b.input(0, cmd, arg);
        D.send({ t: 'in', c: cmd, a: arg });
        // Optimistic local feedback for ammo choice.
        if (cmd === 'ammo') b.s[1].ammo = arg;
        return cmd !== 'abil' || (b.s[1].cds[arg] || 0) <= 0;
      },
      step(dt) {
        if (!host) return [];
        b.step(dt);
        const f = b.fx; b.fx = [];
        if (f.length) D.send({ t: 'fx', l: f });
        D.snapT -= dt;
        if (D.snapT <= 0 || b.over) { D.snapT = 0.1; D.send({ t: 'st', s: b.snapshot() }); }
        if (b.over && !net.sentEnd) { net.sentEnd = true; D.send({ t: 'end', w: b.winner, r: b.reason }); }
        return f;
      },
      drainFx() { const q = net.queue; net.queue = []; return q; },
    };
    UI.closePanel();
    VC.Battle.start({
      sim, kind: 'duel', pvp: true, emotes: true,
      myName: mine.ship, foeName: theirs.name + ' · «' + theirs.ship + '»', foeIcon: theirs.avatar,
      myShip: { shipOpts: D.shipFor(mine, m.mode), shipKey: 'duel:' + m.mode + JSON.stringify(mine.skin) + mine.tier },
      foeModel: Object.assign({ kind: 'ship' }, D.shipFor(theirs, m.mode)),
      region: VC.REGIONS[2],
      onEmote: i => { D.send({ t: 'emote', i }); D.showEmote(i, true); },
      onEnd: r => D.finishDuel(r, { name: theirs.name, rating: host ? D.peer.rating : D.peer.rating, mode: m.mode, bot: false }),
    });
  };

  D.showEmote = function (i, mine) {
    const sc = VC.Scene;
    if (!sc.bShips) return;
    const ship = sc.bShips[mine ? 0 : 1];
    const p = sc.project(ship.position.clone().add(new THREE.Vector3(0, 3.2, 0)));
    const e = document.createElement('div');
    e.className = 'speech';
    e.textContent = VC.DUEL.emotes[i];
    e.style.left = p.x + 'px'; e.style.top = p.y + 'px';
    document.getElementById('fx').appendChild(e);
    setTimeout(() => e.remove(), 2300);
    if (!mine) VC.Audio.sfx('parrot');
  };

  // ------------------------------------------------------------------ bot
  D.startBot = function () {
    const s = VC.Game.s;
    if (VC.Battle.active) return;
    const me = D.profile();
    const name = U.pick(BOT_NAMES);
    let a, b;
    if (D.mode === 'equal') {
      a = me.eq;
      b = ST.combatStats({ talents: s.talents, ship: { modules: {}, deck: [] }, shards: [], officers: [], perms: {}, slava: 0, abilities: [], skins: s.skins, boosts: [] }, VC.DUEL.equalShip);
    } else {
      a = me.own;
      const k = U.rnd(0.85, 1.12);
      b = Object.assign({}, me.own, { hp: me.own.maxHp * k, maxHp: me.own.maxHp * k, volley: me.own.volley * U.rnd(0.85, 1.1) });
    }
    b = Object.assign({}, b, { abilities: U.pick([['repair', 'distract'], ['evade', 'raid'], ['firevolley', 'repair'], ['song', 'evade']]), fireAmmo: true });
    const battle = new VC.Combat.Battle(a, b, ['human', 'ai'], { pvp: true });
    battle.s[1].botTaps = U.rnd(3.5, 5.5);
    const sim = {
      b: battle, me: 0,
      input(cmd, arg) { return battle.input(0, cmd, arg); },
      step(dt) { battle.step(dt); const f = battle.fx; battle.fx = []; return f; },
    };
    const skins = VC.SKINS;
    const botSkin = { sail: U.pick(skins.sail).id, flag: U.pick(skins.flag).id, hull: U.pick(skins.hull).id };
    UI.closePanel();
    let emoteT = U.rnd(6, 12);
    VC.Battle.start({
      sim, kind: 'duel', pvp: true, emotes: true,
      myName: s.shipName, foeName: name, foeIcon: '🏴',
      myShip: { shipOpts: D.shipFor({ tier: s.ship.tier, skin: s.skins }, D.mode), shipKey: 'duel:' + D.mode + JSON.stringify(s.skins) + s.ship.tier },
      foeModel: Object.assign({ kind: 'ship' }, D.shipFor({ tier: Math.max(2, s.ship.tier), skin: botSkin }, D.mode)),
      region: VC.REGIONS[4],
      onEmote: i => { D.showEmote(i, true); if (Math.random() < 0.5) setTimeout(() => D.showEmote(U.rndi(0, VC.DUEL.emotes.length - 1), false), 900); },
      onEnd: r => D.finishDuel(r, { name, rating: s.pvp.rating, mode: D.mode, bot: true }),
    });
    D.botEmote = () => { emoteT -= 0.1; if (emoteT <= 0) { emoteT = U.rnd(10, 18); D.showEmote(U.rndi(0, VC.DUEL.emotes.length - 1), false); } };
  };

  D.update = function (dt) {
    // Guest watchdog: the host simulates the battle; if its snapshots stop for 8 s
    // (host app paused, network gone quiet) end the duel instead of freezing the screen.
    const n = D.net;
    const now = performance.now();
    // If this phone itself was paused, give the host a fresh grace period after resuming.
    if (n && D.lastUpdate && now - D.lastUpdate > 2000) n.lastSnap = now;
    D.lastUpdate = now;
    if (n && !n.host && D.phase === 'battle' && !n.b.over && n.lastSnap && now - n.lastSnap > 8000) {
      D.send({ t: 'stalled' });
      n.b.over = true;
      n.b.winner = n.me;
      n.b.reason = 'stalled';
    }
    if (D.botEmote && VC.Battle.active && VC.Battle.active.kind === 'duel' && !VC.Battle.active.done) {
      D._et = (D._et || 0) + dt;
      if (D._et > 0.1) { D._et = 0; D.botEmote(); }
    }
  };

  // ------------------------------------------------------------------ result
  D.finishDuel = function (r, opp) {
    const G = VC.Game, s = G.s;
    D.botEmote = null;
    s.stats.duels++;
    let delta = 0;
    if (!opp.bot) {
      const exp = 1 / (1 + Math.pow(10, (opp.rating - s.pvp.rating) / 400));
      delta = Math.round(32 * ((r.win ? 1 : 0) - exp));
      s.pvp.rating = Math.max(100, s.pvp.rating + delta);
      if (r.win) s.pvp.wins++; else s.pvp.losses++;
      s.stats.pvpWins = s.pvp.wins;
    }
    s.pvp.history.push({ name: opp.name, win: r.win, mode: opp.mode, bot: opp.bot, delta, t: Date.now() });
    if (s.pvp.history.length > 30) s.pvp.history.shift();
    const loot = { extra: [] };
    loot.gold = ST.incomeFor(r.win ? (opp.bot ? 180 : 600) : 60) + 100;
    G.addGold(loot.gold);
    if (r.win && !opp.bot) loot.pearls = G.addPearls(5, false);
    if (!opp.bot) loot.extra.push(`Рейтинг ${delta >= 0 ? '+' : ''}${delta} → ${Math.round(s.pvp.rating)}`);
    VC.Audio.sfx(r.win ? 'win' : 'lose');
    G.save();
    UI.modal({
      title: r.win ? 'Дуэль выиграна!' : 'Дуэль проиграна', icon: r.win ? '🏆' : '💀', noClose: true,
      html: `<p>${r.reason === 'disconnect' ? 'Соперник отключился.' : r.reason === 'stalled' ? (r.win ? 'Соперник перестал отвечать — техническая победа.' : 'Связь с соперником прервалась — техническое поражение.') : r.reason === 'board' ? 'Решил абордаж!' : r.reason === 'flee' ? (r.win ? 'Соперник сдался.' : 'Флаг спущен.') : r.reason === 'time' ? 'Время вышло — победа по прочности корпуса.' : 'Корабль идёт ко дну!'}</p>
        <div class="loot">${['🪙 ' + fmt(loot.gold)].concat(loot.pearls ? ['💎 ' + loot.pearls] : []).concat(loot.extra).map(x => `<div>${x}</div>`).join('')}</div>`,
      buttons: [{ label: 'В порт', cls: 'green', fn: () => {
        r.close();
        D.net = null;
        if (D.phase === 'battle') { D.phase = VC.Net.connected ? 'lobby' : 'idle'; D.ready = [false, false]; }
        UI.openPanel('duel');
      } }],
    });
  };
})(window.VC);
