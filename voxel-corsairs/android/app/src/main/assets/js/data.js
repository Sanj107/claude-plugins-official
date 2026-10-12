'use strict';
// All game content tables: economy, ships, enemies, regions, talents, shop, achievements.
(function (VC) {
  // ------------------------------------------------------------------ island buildings
  // plot: 'shore' buildings stand on the front row by the water, 'land' ones inland.
  // cost/inc: price of the first level and gold per second per level; each further level
  // costs x1.15, and levels 10/25/50/100/150/... double the building's income.
  VC.BUILDINGS = [
    { id: 'hut', name: 'Рыбацкая хижина', icon: '🎣', plot: 'shore', cost: 15, inc: 0.3, ch: 0,
      desc: 'Сети, лодка и запах свежей рыбы. Скромный, но верный доход.' },
    { id: 'grove', name: 'Кокосовая роща', icon: '🥥', plot: 'land', cost: 110, inc: 1.6, ch: 0,
      desc: 'Кокосы идут на продажу, скорлупа — на кружки для таверны.' },
    { id: 'smoke', name: 'Коптильня', icon: '🐟', plot: 'shore', cost: 1200, inc: 9, ch: 1,
      desc: 'Копчёная рыба не портится в долгом плавании. Купцы платят щедро.' },
    { id: 'tavern', name: 'Таверна «Пьяный Кракен»', icon: '🍺', plot: 'land', cost: 13000, inc: 48, ch: 2,
      desc: 'Сердце любой пиратской бухты: слухи, песни и звон монет.' },
    { id: 'fort', name: 'Форт', icon: '🏰', plot: 'land', cost: 60000, inc: 110, ch: 2, aura: 0.10,
      desc: 'Каменные стены и пушки. +10% к доходу соседних построек, отбивает налёты флота.' },
    { id: 'distill', name: 'Ромовая винокурня', icon: '🥃', plot: 'land', cost: 140000, inc: 260, ch: 3,
      desc: 'Медные котлы и дубовые бочки. Ром — вторая валюта Карибов.' },
    { id: 'sugar', name: 'Сахарная плантация', icon: '🌾', plot: 'land', cost: 1.5e6, inc: 1600, ch: 4,
      desc: 'Тростник для рома и сладостей. Особенно выгодна рядом с винокурней.' },
    { id: 'market', name: 'Рынок контрабандистов', icon: '⚖️', plot: 'land', cost: 4e7, inc: 9000, ch: 5, perNeighbor: 0.05,
      desc: 'Здесь продаётся всё. +5% к доходу рынка за каждую соседнюю постройку.' },
    { id: 'yard', name: 'Верфь', icon: '⚓', plot: 'shore', cost: 6e8, inc: 55000, ch: 6,
      desc: 'Стапели и доки. Каждые 10 уровней удешевляют улучшения корабля на 2% (до −40%).' },
    { id: 'mine', name: 'Золотой рудник', icon: '⛏️', plot: 'land', cost: 8e9, inc: 3.4e5, ch: 7,
      desc: 'Жила, найденная в руинах затонувшего Аурума.' },
    { id: 'mint', name: 'Монетный двор', icon: '🪙', plot: 'land', cost: 1e11, inc: 2.1e6, ch: 7,
      desc: 'Чеканит собственные дублоны с вашим профилем.' },
    { id: 'light', name: 'Маяк', icon: '🗼', plot: 'shore', cost: 1e12, inc: 1.3e7, ch: 8,
      desc: 'Свет в бурю. Защищает остров от штормов, события случаются на 15% чаще.' },
    { id: 'bank', name: 'Сокровищница', icon: '🏦', plot: 'land', cost: 1e13, inc: 8e7, ch: 9,
      desc: 'Подземное хранилище. Каждые 10 уровней: +1 ч к офлайн-доходу (до +10 ч).' },
    { id: 'temple', name: 'Храм Морского Бога', icon: '🔱', plot: 'land', cost: 1e14, inc: 5e8, ch: 9,
      desc: 'Дары морю возвращаются жемчугом: +1% шанс жемчуга в событиях за 10 уровней.' },
    { id: 'obs', name: 'Обсерватория Бездны', icon: '🔭', plot: 'land', cost: 1.2e15, inc: 3.1e9, ch: 10,
      desc: 'Звёзды подсказывают, где лежат самые глубокие клады.' },
    { id: 'statue', name: 'Памятник Кремню', icon: '🗿', plot: 'land', cost: 2e16, inc: 2e10, ch: 11, aura: 0.25,
      desc: 'Легенда в камне. +25% к доходу соседних построек. Открывается Славой.' },
  ];

  // Pairs of buildings that boost each other when they stand on neighbouring plots
  // (including diagonals). Both buildings receive the bonus.
  VC.SYNERGIES = [
    ['hut', 'smoke', 0.5], ['grove', 'distill', 0.3], ['sugar', 'distill', 0.5],
    ['tavern', 'distill', 0.4], ['tavern', 'market', 0.3], ['mine', 'mint', 0.5],
    ['yard', 'light', 0.3], ['bank', 'mint', 0.4], ['temple', 'light', 0.3],
    ['obs', 'temple', 0.4], ['grove', 'tavern', 0.2], ['hut', 'tavern', 0.2],
  ];

  // Island plots: a 4x4 grid; row 3 is the beach. Bought in this order.
  VC.PLOTS = [
    { r: 3, c: 1, cost: 0 }, { r: 2, c: 1, cost: 0 }, { r: 3, c: 2, cost: 300 },
    { r: 2, c: 2, cost: 4000 }, { r: 1, c: 1, cost: 2.5e4 }, { r: 1, c: 2, cost: 1e5 },
    { r: 2, c: 0, cost: 8e5 }, { r: 2, c: 3, cost: 2e7 }, { r: 3, c: 0, cost: 3e8 },
    { r: 1, c: 0, cost: 4e9 }, { r: 1, c: 3, cost: 5e10 }, { r: 3, c: 3, cost: 5e11 },
    { r: 0, c: 1, cost: 5e12 }, { r: 0, c: 2, cost: 5e13 }, { r: 0, c: 0, cost: 6e14 },
    { r: 0, c: 3, cost: 1e16 },
  ];
  VC.MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];

  // ------------------------------------------------------------------ ships
  VC.SHIPS = [
    { tier: 1, name: 'Шлюп', hp: 100, guns: 4, gunDmg: 3, reload: 4.0, crew: 20, sails: 80, eva: 0.08, slots: 2, cap: 20, cost: 0, ch: 0,
      desc: 'Маленький и юркий. Одна мачта, четыре пушки и много надежды.' },
    { tier: 2, name: 'Бригантина', hp: 450, guns: 8, gunDmg: 7, reload: 3.8, crew: 45, sails: 300, eva: 0.10, slots: 3, cap: 30, cost: 5e4, ch: 2,
      desc: 'Две мачты, восемь пушек. Уже не стыдно поднять чёрный флаг.' },
    { tier: 3, name: 'Фрегат', hp: 2600, guns: 16, gunDmg: 20, reload: 3.6, crew: 110, sails: 1500, eva: 0.12, slots: 4, cap: 50, cost: 3e7, ch: 4,
      desc: 'Быстрый охотник с полной орудийной палубой.' },
    { tier: 4, name: 'Галеон', hp: 16000, guns: 24, gunDmg: 75, reload: 3.6, crew: 260, sails: 8000, eva: 0.08, slots: 5, cap: 75, cost: 8e9, ch: 6,
      desc: 'Плавучая крепость с огромным трюмом.' },
    { tier: 5, name: 'Линейный корабль', hp: 1.1e5, guns: 40, gunDmg: 260, reload: 3.4, crew: 600, sails: 5e4, eva: 0.10, slots: 6, cap: 100, cost: 3e12, ch: 8,
      desc: 'Две орудийные палубы. Гроза любого флота.' },
    { tier: 6, name: 'Летучий Голландец', hp: 8e5, guns: 48, gunDmg: 1400, reload: 3.0, crew: 1500, sails: 3.5e5, eva: 0.18, slots: 7, cap: 130, cost: 4e14, ch: 9,
      desc: 'Призрачные паруса не боятся ни ветра, ни ядер.' },
    { tier: 7, name: 'Левиафан', hp: 7e6, guns: 64, gunDmg: 9000, reload: 2.8, crew: 4000, sails: 3e6, eva: 0.15, slots: 8, cap: 170, cost: 1e17, ch: 11, slava: 50,
      desc: 'Корабль из легенд. Требует 50 Славы.' },
  ];

  // Per-level ship upgrades (levels capped by the hull tier). Each level costs x1.3.
  VC.UPGRADES = [
    { id: 'hull', name: 'Корпус', icon: '🛡️', cost: 40, desc: '+8% прочности корпуса за уровень' },
    { id: 'guns', name: 'Пушки', icon: '💥', cost: 60, desc: '+8% урона залпа за уровень' },
    { id: 'sails', name: 'Паруса', icon: '⛵', cost: 30, desc: '+6% парусов, +0,3% уклонения, быстрее экспедиции' },
    { id: 'crew', name: 'Команда', icon: '👥', cost: 45, desc: '+7% команды, −1% перезарядки за уровень' },
  ];

  // Deck modules: placed into the ship's limited deck slots. Levels persist when removed.
  VC.MODULES = [
    { id: 'nets', name: 'Рыболовные сети', icon: '🕸️', cost: 100, grow: 1.15, ch: 0,
      desc: 'Ловят рыбу даже у причала: +{v}/с золота', val: l => 0.8 * l },
    { id: 'boy', name: 'Юнга-тапальщик', icon: '🧒', cost: 250, grow: 1.32, ch: 1,
      desc: 'Стучит по сундуку за вас: {v} тапов/с', val: l => 0.5 * l },
    { id: 'rum', name: 'Бочонок рома', icon: '🛢️', cost: 800, grow: 1.3, ch: 1,
      desc: 'Сила тапа +{v}%, шанс крит. тапа +{c}%', val: l => 15 * l },
    { id: 'hold', name: 'Торговый трюм', icon: '📦', cost: 3000, grow: 1.33, ch: 1,
      desc: 'Доход всех построек +{v}%', val: l => 3 * l },
    { id: 'powder', name: 'Пороховой погреб', icon: '🧨', cost: 4000, grow: 1.3, ch: 2,
      desc: 'Урон пушек +{v}%', val: l => 6 * l },
    { id: 'armor', name: 'Бронеплиты', icon: '🔩', cost: 4000, grow: 1.3, ch: 2,
      desc: 'Прочность корпуса +{v}%, броня +{c}%', val: l => 6 * l },
    { id: 'spyglass', name: 'Подзорная труба', icon: '🔭', cost: 1.5e4, grow: 1.3, ch: 3,
      desc: 'Добыча с боёв +{v}%, меткость +{c}%', val: l => 8 * l },
    { id: 'galley', name: 'Камбуз', icon: '🍲', cost: 4e4, grow: 1.3, ch: 3,
      desc: 'Команда +{v}%, починка между боями +{c}%', val: l => 6 * l },
    { id: 'figure', name: 'Носовая фигура', icon: '🧜', cost: 2e5, grow: 1.32, ch: 4,
      desc: 'События чаще на {v}%, награды событий +{c}%', val: l => Math.min(60, 3 * l) },
    { id: 'alchemy', name: 'Алхимический стол', icon: '⚗️', cost: 5e8, grow: 1.4, ch: 6,
      desc: 'Шанс жемчужины при тапе {v}%', val: l => Math.min(2, 0.02 * l) },
  ];

  // ------------------------------------------------------------------ captain
  VC.TALENTS = [
    { tree: 'trade', id: 'greed', name: 'Жадность', icon: '✋', max: 10, desc: 'Сила тапа +25% за ранг' },
    { tree: 'trade', id: 'trade', name: 'Торговая жилка', icon: '💰', max: 10, desc: 'Доход построек +10% за ранг' },
    { tree: 'trade', id: 'haggle', name: 'Торг', icon: '🤝', max: 5, desc: 'Постройки дешевле на 3% за ранг' },
    { tree: 'trade', id: 'smuggle', name: 'Контрабанда', icon: '🌙', max: 5, desc: 'Офлайн-доход +10% и +1 ч лимита за ранг' },
    { tree: 'trade', id: 'midas', name: 'Золотое касание', icon: '✨', max: 5, desc: 'Шанс тапа ×10: +2% за ранг' },
    { tree: 'trade', id: 'banker', name: 'Банкир', icon: '🏦', max: 6, desc: 'Тап приносит +0,5% дохода в секунду за ранг' },
    { tree: 'gun', id: 'aim', name: 'Точный прицел', icon: '🎯', max: 5, desc: 'Меткость +3% за ранг' },
    { tree: 'gun', id: 'heavy', name: 'Тяжёлые ядра', icon: '⚫', max: 10, desc: 'Урон залпа +10% за ранг' },
    { tree: 'gun', id: 'reload', name: 'Быстрая перезарядка', icon: '⏱️', max: 5, desc: 'Перезарядка −4% за ранг' },
    { tree: 'gun', id: 'crit', name: 'Меткий глаз', icon: '👁️', max: 5, desc: 'Шанс крит. залпа (×2) +4% за ранг' },
    { tree: 'gun', id: 'drill', name: 'Муштра', icon: '📯', max: 5, desc: 'Тап в бою ускоряет перезарядку на +1% за ранг' },
    { tree: 'gun', id: 'chain', name: 'Мастер книппелей', icon: '⛓️', max: 5, desc: 'Книппели и картечь бьют на 12% сильнее за ранг' },
    { tree: 'sea', id: 'tough', name: 'Крепкий корпус', icon: '🪵', max: 10, desc: 'Прочность корпуса +10% за ранг' },
    { tree: 'sea', id: 'wind', name: 'Чутьё ветра', icon: '🌬️', max: 5, desc: 'Уклонение +2% за ранг' },
    { tree: 'sea', id: 'carpenter', name: 'Корабельный плотник', icon: '🔨', max: 5, desc: 'Починка между боями +40% за ранг' },
    { tree: 'sea', id: 'boarder', name: 'Абордажник', icon: '🗡️', max: 5, desc: 'Сила абордажа +15% за ранг' },
    { tree: 'sea', id: 'carto', name: 'Картограф', icon: '🗺️', max: 5, desc: 'Экспедиции −8% времени, +10% награды за ранг' },
    { tree: 'sea', id: 'luck', name: 'Морская удача', icon: '🍀', max: 5, desc: 'События чаще на 8% и щедрее на 10% за ранг' },
  ];
  VC.TALENT_TREES = { trade: 'Делец', gun: 'Канонир', sea: 'Мореход' };

  VC.OFFICERS = [
    { id: 'piastr', name: 'Пиастр', icon: '🦜', role: 'Попугай-советник', bonus: 'Награды событий +10%',
      abil: { id: 'distract', name: 'Отвлечь', icon: '🦜', cd: 25, desc: 'Меткость врага −40% на 6 с' } },
    { id: 'bochka', name: 'Боцман Бочка', icon: '🧔', role: 'Кок и плотник', bonus: 'Починка между боями +50%',
      abil: { id: 'repair', name: 'Ремонт', icon: '🔨', cd: 30, desc: 'Восстанавливает 30% корпуса за 5 с' } },
    { id: 'mira', name: 'Мира Туманная', icon: '🧭', role: 'Штурман', bonus: 'Экспедиции −10% времени, +1 слот',
      abil: { id: 'evade', name: 'Манёвр', icon: '💨', cd: 28, desc: 'Уклонение +50% на 5 с' } },
    { id: 'jacques', name: 'Одноглазый Жак', icon: '🏴‍☠️', role: 'Абордажник', bonus: 'Сила абордажа +30%',
      abil: { id: 'raid', name: 'Абордажная команда', icon: '⚔️', cd: 40, desc: 'Бьёт по экипажу врага (−25%) и открывает абордаж раньше' } },
    { id: 'olga', name: 'Ольга «Порох»', icon: '💣', role: 'Канонир', bonus: 'Урон пушек +15%',
      abil: { id: 'firevolley', name: 'Огненный залп', icon: '🔥', cd: 35, desc: 'Мгновенный залп 150% и поджог на 6 с' } },
    { id: 'lorelei', name: 'Лорелея', icon: '🧜‍♀️', role: 'Морская ведьма', bonus: 'Жемчуг из всех источников +15%',
      abil: { id: 'song', name: 'Песнь сирены', icon: '🎵', cd: 45, desc: 'Враг заворожён и не стреляет 5 с' } },
    { id: 'flint', name: 'Капитан Кремень', icon: '🧓', role: 'Живая легенда', bonus: 'Весь доход и урон +20%',
      abil: { id: 'legend', name: 'Легендарный залп', icon: '⭐', cd: 60, desc: 'Три залпа подряд без перезарядки' } },
  ];

  VC.SHARDS = [
    { id: 1, name: 'Осколок Приливов', color: '#3fc1ff', desc: 'Доход +10%' },
    { id: 2, name: 'Осколок Туманов', color: '#c9d6e3', desc: 'Уклонение +5%' },
    { id: 3, name: 'Осколок Пламени', color: '#ff6a2b', desc: 'Урон +15%' },
    { id: 4, name: 'Осколок Стужи', color: '#9ff3ff', desc: 'Прочность +20%' },
    { id: 5, name: 'Осколок Глубин', color: '#2b6bff', desc: '+1 слот экспедиции, жемчуг +10%' },
    { id: 6, name: 'Осколок Золота', color: '#ffd23f', desc: 'Доход +25%' },
    { id: 7, name: 'Осколок Бездны', color: '#a24bff', desc: 'Урон и прочность +25%' },
  ];

  // ------------------------------------------------------------------ enemies
  // Stats are multipliers of the standard enemy at danger level L:
  //   hull 50*1.276^L, volley 4*1.276^L, crew 20*1.2^L.  Loot: 12*1.46^L gold.
  // model: ship tier/style or a creature generator from models.js.
  VC.ENEMIES = {
    crab: { name: 'Краб-переросток', icon: '🦀', model: { kind: 'crab', color: '#e2553a' }, hp: 0.8, dmg: 0.7, crew: 0, reload: 4.4, eva: 0.05 },
    smugglers: { name: 'Лодка контрабандистов', icon: '🛶', model: { kind: 'ship', tier: 0, style: 'smuggler' }, hp: 0.9, dmg: 0.9, crew: 0.8, reload: 4.2, eva: 0.12 },
    fisher: { name: 'Пьяный рыбак', icon: '🎣', model: { kind: 'ship', tier: 0, style: 'fisher' }, hp: 0.7, dmg: 0.6, crew: 0.6, reload: 5, eva: 0.05, loot: 1.4 },
    hook: { name: 'Капитан Ржавый Крюк', icon: '🪝', boss: true, model: { kind: 'ship', tier: 1, style: 'rust' }, hp: 2.4, dmg: 1.35, crew: 1.4, reload: 4.2, eva: 0.08, abil: ['heal'] },
    cutter: { name: 'Куттер Короны', icon: '⛵', model: { kind: 'ship', tier: 1, style: 'navy' }, hp: 1, dmg: 1.1, crew: 1, reload: 4.0, eva: 0.12 },
    merchant: { name: 'Торговая шхуна', icon: '🚢', model: { kind: 'ship', tier: 2, style: 'merchant' }, hp: 1.2, dmg: 0.5, crew: 0.7, reload: 5, eva: 0.04, loot: 2 },
    bluebeard: { name: 'Синебородые', icon: '🧔‍♂️', model: { kind: 'ship', tier: 2, style: 'blue' }, hp: 1.1, dmg: 1.1, crew: 1.2, reload: 4.2, eva: 0.1 },
    stern: { name: 'Командор Стерн', icon: '🎖️', boss: true, model: { kind: 'ship', tier: 2, style: 'navy' }, hp: 3, dmg: 1.5, crew: 1.5, reload: 3.8, eva: 0.1, abil: ['rally'] },
    crabking: { name: 'Король крабов', icon: '👑', boss: true, model: { kind: 'crab', color: '#ff8a1f', size: 1.6 }, hp: 3.4, dmg: 1.4, crew: 0, reload: 4.6, eva: 0.04, abil: ['grab'] },
    ghostsloop: { name: 'Призрачный шлюп', icon: '👻', model: { kind: 'ship', tier: 1, style: 'ghost' }, hp: 0.9, dmg: 1.1, crew: 0.9, reload: 4.0, eva: 0.2 },
    skeletons: { name: 'Лодка скелетов', icon: '💀', model: { kind: 'ship', tier: 0, style: 'bone' }, hp: 0.8, dmg: 1.2, crew: 1.3, reload: 3.8, eva: 0.1 },
    siren: { name: 'Туманная сирена', icon: '🧜‍♀️', model: { kind: 'serpent', color: '#7fb6b0', size: 0.8 }, hp: 0.9, dmg: 1, crew: 0, reload: 4, eva: 0.22, abil: ['charm'] },
    widow: { name: 'Вдова Тумана', icon: '🕯️', boss: true, model: { kind: 'ship', tier: 4, style: 'ghost' }, hp: 3, dmg: 1.5, crew: 1.6, reload: 4.0, eva: 0.18, abil: ['phase'] },
    fireraider: { name: 'Рейдер Огненного Братства', icon: '🔥', model: { kind: 'ship', tier: 2, style: 'fire' }, hp: 1, dmg: 1.2, crew: 1.1, reload: 4, eva: 0.1 },
    lavaturtle: { name: 'Лавовая черепаха', icon: '🐢', model: { kind: 'turtle', color: '#5b3a2a' }, hp: 1.6, dmg: 0.8, crew: 0, reload: 5, eva: 0.02 },
    jacques: { name: 'Одноглазый Жак', icon: '🏴‍☠️', boss: true, model: { kind: 'ship', tier: 3, style: 'black' }, hp: 2.8, dmg: 1.6, crew: 2, reload: 3.6, eva: 0.14, abil: ['board'] },
    crownraider: { name: 'Рейдер Короны', icon: '⚜️', model: { kind: 'ship', tier: 3, style: 'navy' }, hp: 1.2, dmg: 1.2, crew: 1.1, reload: 3.8, eva: 0.1 },
    icebreaker: { name: 'Ледокол Короны', icon: '🧊', model: { kind: 'ship', tier: 3, style: 'ice' }, hp: 1.5, dmg: 1, crew: 1, reload: 4.2, eva: 0.05 },
    narwhal: { name: 'Нарвал-таран', icon: '🦄', model: { kind: 'fish', color: '#9fb7c9', horn: true }, hp: 0.9, dmg: 1.3, crew: 0, reload: 4.6, eva: 0.18 },
    prison: { name: 'Тюремный корабль', icon: '⛓️', model: { kind: 'ship', tier: 3, style: 'navy' }, hp: 1.3, dmg: 1.1, crew: 1.3, reload: 4, eva: 0.06 },
    iceserpent: { name: 'Ледяной змей', icon: '🐉', boss: true, model: { kind: 'serpent', color: '#bfefff', size: 1.4 }, hp: 3.2, dmg: 1.5, crew: 0, reload: 4.2, eva: 0.12, abil: ['freeze'] },
    escort: { name: 'Эскорт Адмирала', icon: '🦅', model: { kind: 'ship', tier: 4, style: 'navy' }, hp: 1.6, dmg: 1.3, crew: 1.3, reload: 3.8, eva: 0.08 },
    hammer: { name: 'Акула-молот', icon: '🦈', model: { kind: 'fish', color: '#6f8796', hammer: true }, hp: 0.9, dmg: 1.3, crew: 0, reload: 3.8, eva: 0.2 },
    coralguard: { name: 'Коралловый страж', icon: '🪸', model: { kind: 'turtle', color: '#ff7b9c' }, hp: 1.5, dmg: 0.9, crew: 0, reload: 4.5, eva: 0.04 },
    kraken: { name: 'Древний Кракен', icon: '🐙', boss: true, model: { kind: 'kraken', color: '#9b3b6b' }, hp: 3.5, dmg: 1.5, crew: 0, reload: 4.4, eva: 0.05, abil: ['grab', 'ink'] },
    prisongal: { name: 'Тюремный галеон', icon: '🔒', model: { kind: 'ship', tier: 4, style: 'navy' }, hp: 1.8, dmg: 1.2, crew: 1.5, reload: 4, eva: 0.05 },
    clockwork: { name: 'Механический страж', icon: '⚙️', model: { kind: 'ship', tier: 3, style: 'brass' }, hp: 1.3, dmg: 1.2, crew: 0, reload: 3.6, eva: 0.06 },
    golem: { name: 'Хранитель Аурума', icon: '🗿', boss: true, model: { kind: 'golem', color: '#c9a640' }, hp: 3.8, dmg: 1.4, crew: 0, reload: 4.8, eva: 0.02, abil: ['shield'] },
    goldfish: { name: 'Золотой угорь', icon: '🐍', model: { kind: 'serpent', color: '#f0c03a', size: 0.8 }, hp: 0.9, dmg: 1.1, crew: 0, reload: 3.8, eva: 0.22, loot: 1.5 },
    linkor: { name: 'Линкор Короны', icon: '🛳️', model: { kind: 'ship', tier: 5, style: 'navy' }, hp: 1.6, dmg: 1.3, crew: 1.3, reload: 4, eva: 0.05 },
    fireship: { name: 'Брандер', icon: '🧨', model: { kind: 'ship', tier: 2, style: 'fire' }, hp: 0.7, dmg: 2, crew: 0.6, reload: 5, eva: 0.08 },
    brand: { name: 'Вице-адмирал Бранд', icon: '🎖️', boss: true, model: { kind: 'ship', tier: 5, style: 'navy' }, hp: 3, dmg: 1.6, crew: 1.8, reload: 3.6, eva: 0.08, abil: ['rally', 'heal'] },
    stormspirit: { name: 'Дух шторма', icon: '🌩️', boss: true, model: { kind: 'cloud', color: '#5a6b8c' }, hp: 2.6, dmg: 1.8, crew: 0, reload: 3.6, eva: 0.25, abil: ['lightning'] },
    angler: { name: 'Удильщик Бездны', icon: '🐡', model: { kind: 'fish', color: '#2d2f4f', lure: true }, hp: 1.1, dmg: 1.3, crew: 0, reload: 4, eva: 0.12, abil: ['charm'] },
    abyssghost: { name: 'Корабль-призрак Бездны', icon: '☠️', model: { kind: 'ship', tier: 4, style: 'abyss' }, hp: 1.2, dmg: 1.3, crew: 1.3, reload: 3.8, eva: 0.16 },
    leviathan: { name: 'Левиафан Бездны', icon: '🐋', boss: true, model: { kind: 'serpent', color: '#3b2f6b', size: 2 }, hp: 3.6, dmg: 1.6, crew: 0, reload: 4.4, eva: 0.06, abil: ['grab', 'freeze'] },
    dread: { name: 'Дредноут «Железная Корона»', icon: '👑', boss: true, model: { kind: 'ship', tier: 6, style: 'iron' }, hp: 3.2, dmg: 1.6, crew: 2, reload: 3.6, eva: 0.04, abil: ['rally', 'shield'] },
    crownfleet: { name: 'Флот Короны', icon: '⚓', model: { kind: 'ship', tier: 5, style: 'iron' }, hp: 1.5, dmg: 1.4, crew: 1.4, reload: 3.8, eva: 0.06 },
    raven: { name: 'Адмирал Ворон', icon: '🦅', boss: true, model: { kind: 'ship', tier: 6, style: 'raven' }, hp: 3.6, dmg: 1.7, crew: 2.2, reload: 3.4, eva: 0.1, abil: ['rally', 'shield', 'heal'] },
    ravenheart: { name: 'Ворон и Сердце Моря', icon: '💠', boss: true, model: { kind: 'ship', tier: 6, style: 'heart' }, hp: 4.2, dmg: 1.8, crew: 2.5, reload: 3.2, eva: 0.12, abil: ['lightning', 'freeze', 'heal'] },
    rival: { name: 'Капитан-соперник', icon: '🏴', model: { kind: 'ship', tier: 3, style: 'black' }, hp: 1, dmg: 1, crew: 1, reload: 4, eva: 0.1 },
  };

  // ------------------------------------------------------------------ regions / map
  // x,y: position on the sea chart (0..1). min..max: danger levels of the raid ladder.
  VC.REGIONS = [
    { id: 0, name: 'Черепаший остров', x: 0.22, y: 0.84, min: 1, max: 3, sea: '#2a8fb8',
      enemies: ['crab'], hazards: [], desc: 'Родная бухта. Здесь всё началось.' },
    { id: 1, name: 'Бухта Новичков', x: 0.42, y: 0.78, min: 1, max: 6, sea: '#2b9cc4',
      enemies: ['crab', 'smugglers', 'fisher'], hazards: ['reef'], desc: 'Мелкие контрабандисты и крабы размером с лодку.' },
    { id: 2, name: 'Изумрудные отмели', x: 0.66, y: 0.82, min: 6, max: 15, sea: '#1fae9b',
      enemies: ['cutter', 'merchant', 'bluebeard'], hazards: ['reef', 'storm'], desc: 'Торговые пути под надзором флота Железной Короны.' },
    { id: 3, name: 'Туманный пролив', x: 0.84, y: 0.66, min: 15, max: 19, sea: '#5f8ca3',
      enemies: ['ghostsloop', 'skeletons', 'siren'], hazards: ['fog', 'whirl'], desc: 'Туман здесь не рассеивается веками. Говорят, в нём плавают мёртвые.' },
    { id: 4, name: 'Огненный архипелаг', x: 0.66, y: 0.6, min: 19, max: 27, sea: '#2a6e92',
      enemies: ['fireraider', 'lavaturtle', 'crownraider'], hazards: ['storm', 'reef'], desc: 'Вулканы и вольница Пиратского Братства.' },
    { id: 5, name: 'Ледяной предел', x: 0.46, y: 0.56, min: 27, max: 32, sea: '#5aa5c7',
      enemies: ['icebreaker', 'narwhal', 'prison'], hazards: ['ice', 'fog'], desc: 'Льдины, северное сияние и тюрьмы Короны.' },
    { id: 6, name: 'Коралловое королевство', x: 0.22, y: 0.52, min: 32, max: 42, sea: '#18b3c4',
      enemies: ['hammer', 'coralguard', 'prisongal'], hazards: ['reef', 'whirl'], desc: 'Под водой поют русалки. Над водой — акулы.' },
    { id: 7, name: 'Затонувший Аурум', x: 0.16, y: 0.32, min: 42, max: 47, sea: '#1b7f9e',
      enemies: ['clockwork', 'goldfish'], hazards: ['whirl', 'reef'], desc: 'Золотой город, ушедший на дно за одну ночь.' },
    { id: 8, name: 'Штормовой предел', x: 0.38, y: 0.26, min: 47, max: 58, sea: '#3d5d7a',
      enemies: ['linkor', 'fireship'], hazards: ['storm', 'storm', 'fog'], desc: 'Вечная буря и блокада Армады.' },
    { id: 9, name: 'Бездна', x: 0.62, y: 0.3, min: 58, max: 67, sea: '#1d2d58',
      enemies: ['angler', 'abyssghost'], hazards: ['whirl', 'fog'], desc: 'Вода чёрная, как чернила. Внизу кто-то дышит.' },
    { id: 10, name: 'Сердце Моря', x: 0.82, y: 0.18, min: 67, max: 79, sea: '#3a2a7a',
      enemies: ['crownfleet', 'linkor', 'abyssghost'], hazards: ['storm', 'whirl'], desc: 'Место, где родился первый прилив.' },
    { id: 11, name: 'Бездонные воды', x: 0.5, y: 0.08, min: 79, max: 9999, sea: '#160f3a', endless: true,
      enemies: ['crownfleet', 'abyssghost', 'angler', 'linkor', 'hammer', 'clockwork', 'icebreaker', 'fireraider'],
      hazards: ['storm', 'whirl', 'fog', 'reef', 'ice'], desc: 'Бесконечные воды после конца истории. Чем глубже, тем богаче.' },
  ];

  VC.HAZARDS = {
    reef: { name: 'Рифы', icon: '🪨', text: 'Впереди острые рифы. Как пройти?',
      options: [
        { label: 'Осторожно, по лоту', desc: 'Медленно, но безопасно: бой начнётся без вашего первого залпа', effect: 'slow' },
        { label: 'Напролом!', desc: 'Шанс 50%: пробоина −20% корпуса', effect: 'risk20' },
      ] },
    storm: { name: 'Шторм', icon: '⛈️', text: 'Небо чернеет, налетает шквал!',
      options: [
        { label: 'Убрать паруса', desc: 'Переждать: −10% корпуса', effect: 'dmg10' },
        { label: 'Поймать ветер', desc: 'Шанс по парусам: первый залп ваш и +20% урона в бою, иначе −25% корпуса', effect: 'gamble' },
      ] },
    fog: { name: 'Туман', icon: '🌫️', text: 'Туман такой густой, что не видно собственного бушприта.',
      options: [
        { label: 'Зажечь фонари', desc: 'Безопасно, но враг стреляет первым', effect: 'enemyFirst' },
        { label: 'Тихо подкрасться', desc: 'Шанс 60%: вы стреляете первым с +50% уроном', effect: 'sneak' },
      ] },
    whirl: { name: 'Водоворот', icon: '🌀', text: 'Корабль затягивает в водоворот! Тапайте, чтобы грести!', effect: 'tapEscape' },
    ice: { name: 'Льдины', icon: '🧊', text: 'Путь преграждают льдины.',
      options: [
        { label: 'Колоть лёд пушками', desc: 'Первый залп уйдёт на лёд', effect: 'slow' },
        { label: 'Таранить', desc: '−15% корпуса', effect: 'dmg15' },
      ] },
  };

  // ------------------------------------------------------------------ expeditions
  // reward: minutes of current income; pearls: [chance, min, max]
  VC.EXPEDITIONS = [
    { id: 'fish', name: 'Ловля тунца', icon: '🐟', time: 5 * 60, reward: 4, xp: 1, pearls: [0.05, 1, 1], power: 0 },
    { id: 'wreck', name: 'Обшарить обломки', icon: '🪵', time: 30 * 60, reward: 26, xp: 4, pearls: [0.35, 1, 3], power: 0.3, map: 0.15 },
    { id: 'treasure', name: 'Остров сокровищ', icon: '🏝️', time: 2 * 3600, reward: 110, xp: 12, pearls: [0.8, 3, 6], power: 0.6, map: 0.3, note: 0.15 },
    { id: 'trade', name: 'Дальний торговый рейс', icon: '🧭', time: 8 * 3600, reward: 480, xp: 40, pearls: [1, 8, 15], power: 0.8, note: 0.4 },
  ];

  // ------------------------------------------------------------------ shop
  VC.SHOP = [
    { id: 'boost_income', cat: 'boost', name: 'Попутный ветер', icon: '🌬️', price: 25, desc: '×2 весь доход на 30 минут', boost: { id: 'income', mult: 2, time: 1800 } },
    { id: 'boost_tap', cat: 'boost', name: 'Ромовый кураж', icon: '🍹', price: 15, desc: '×3 сила тапа на 15 минут', boost: { id: 'tap', mult: 3, time: 900 } },
    { id: 'boost_battle', cat: 'boost', name: 'Боевой раж', icon: '⚔️', price: 20, desc: '×1,5 урон в боях на 30 минут', boost: { id: 'battle', mult: 1.5, time: 1800 } },
    { id: 'timewarp', cat: 'boost', name: 'Песочные часы', icon: '⏳', price: 40, desc: 'Мгновенно получить 2 часа дохода', warp: 7200 },
    { id: 'chest_wood', cat: 'chest', name: 'Деревянный сундук', icon: '📦', price: 8, desc: '15–45 мин дохода, шанс 10% на скин', chest: 'wood' },
    { id: 'chest_silver', cat: 'chest', name: 'Серебряный сундук', icon: '🧰', price: 35, desc: '1–3 ч дохода, 3–10 💎, шанс 35% на скин', chest: 'silver' },
    { id: 'chest_gold', cat: 'chest', name: 'Золотой сундук', icon: '👑', price: 110, desc: '4–8 ч дохода, гарантированный новый скин, буст', chest: 'gold' },
    { id: 'perm_boy', cat: 'perm', name: 'Второй юнга', icon: '🧒', price: 60, desc: 'Навсегда +2 автотапа в секунду', once: true },
    { id: 'perm_cap', cat: 'perm', name: 'Тайник в скале', icon: '🗝️', price: 80, desc: 'Навсегда +3 ч к лимиту офлайн-дохода', once: true },
    { id: 'perm_letter', cat: 'perm', name: 'Каперская грамота', icon: '📜', price: 150, desc: 'Навсегда +25% ко всему доходу', once: true },
    { id: 'perm_slot', cat: 'perm', name: 'Лишняя шлюпка', icon: '🚣', price: 120, desc: 'Навсегда +1 слот экспедиции', once: true },
    { id: 'perm_regen', cat: 'perm', name: 'Плотники-близнецы', icon: '🪚', price: 50, desc: 'Навсегда починка между боями ×2', once: true },
  ];
  VC.GOLD_SHOP = [
    { id: 'g_rum', name: 'Ром для команды', icon: '🍺', mins: 10, desc: '×2 доход на 5 минут', boost: { id: 'income', mult: 2, time: 300 } },
    { id: 'g_map', name: 'Карта сокровищ', icon: '🗺️', mins: 25, desc: 'Начать поиск клада прямо сейчас', map: true },
    { id: 'g_repair', name: 'Срочный ремонт', icon: '🔧', mins: 2, desc: 'Мгновенно починить корабль', repair: true },
  ];

  VC.SKINS = {
    sail: [
      { id: 'white', name: 'Белые', color: '#f2efe6', price: 0 },
      { id: 'black', name: 'Чёрные', color: '#2b2b30', price: 40 },
      { id: 'red', name: 'Алые', color: '#c8323a', price: 40 },
      { id: 'blue', name: 'Лазурные', color: '#3a7bd5', price: 40 },
      { id: 'stripe', name: 'Полосатые', color: '#f2efe6', stripe: '#c8323a', price: 60 },
      { id: 'purple', name: 'Королевские', color: '#7a3fb0', price: 80 },
      { id: 'gold', name: 'Золотые', color: '#f0c03a', price: 120 },
      { id: 'ghost', name: 'Призрачные', color: '#7dffc8', price: 0, special: 'Глава 9' },
    ],
    flag: [
      { id: 'roger', name: 'Весёлый Роджер', color: '#111', fg: '#fff', price: 0 },
      { id: 'sabres', name: 'Скрещённые сабли', color: '#111', fg: '#e8c25a', price: 30 },
      { id: 'redskull', name: 'Красный череп', color: '#7a0f12', fg: '#fff', price: 40 },
      { id: 'heart', name: 'Пронзённое сердце', color: '#111', fg: '#e23d4b', price: 50 },
      { id: 'kraken', name: 'Кракен', color: '#1d2f5c', fg: '#a8e0ff', price: 60 },
      { id: 'anchor', name: 'Золотой якорь', color: '#0e3a5c', fg: '#f0c03a', price: 60 },
    ],
    hull: [
      { id: 'oak', name: 'Дуб', color: '#8a5a32', trim: '#5a3a1e', price: 0 },
      { id: 'ebony', name: 'Чёрное дерево', color: '#2c2420', trim: '#c9a640', price: 50 },
      { id: 'crimson', name: 'Багровый', color: '#7c1f23', trim: '#e0b04a', price: 50 },
      { id: 'navy', name: 'Морская синь', color: '#1f3e66', trim: '#e9e3d2', price: 50 },
      { id: 'bone', name: 'Костяной', color: '#d9cfb4', trim: '#4a3a2a', price: 70 },
      { id: 'gold', name: 'Золочёный', color: '#6b4420', trim: '#f0c03a', price: 100 },
    ],
  };

  // ------------------------------------------------------------------ daily
  VC.DAILY_LOGIN = [
    { pearls: 5 }, { mins: 30 }, { pearls: 10 }, { boost: 'boost_income' }, { pearls: 15 }, { chest: 'silver' }, { pearls: 30 },
  ];
  VC.DAILY_QUESTS = [
    { id: 'taps', text: 'Сделайте {n} тапов', stat: 'taps', n: [300, 600, 1000] },
    { id: 'wins', text: 'Победите {n} врагов', stat: 'wins', n: [3, 5, 8] },
    { id: 'blvl', text: 'Улучшите постройки {n} раз', stat: 'buildingLevels', n: [10, 25, 40] },
    { id: 'events', text: 'Поймайте {n} морских события', stat: 'events', n: [2, 3, 5] },
    { id: 'exped', text: 'Завершите {n} экспедиции', stat: 'expeditions', n: [1, 2, 3] },
    { id: 'upg', text: 'Улучшите корабль {n} раз', stat: 'shipLevels', n: [3, 6, 10] },
    { id: 'frenzy', text: 'Устройте {n} золотые лихорадки', stat: 'frenzies', n: [1, 2, 3] },
    { id: 'duel', text: 'Проведите дуэль (с ботом или игроком)', stat: 'duels', n: [1, 1, 1] },
  ];

  // ------------------------------------------------------------------ achievements (+1% income each)
  VC.ACHIEVEMENTS = [
    { id: 'tap1', name: 'Первый стук', stat: 'taps', n: 100, pearls: 3 },
    { id: 'tap2', name: 'Пальцы в мозолях', stat: 'taps', n: 2000, pearls: 5 },
    { id: 'tap3', name: 'Дятел', stat: 'taps', n: 20000, pearls: 10 },
    { id: 'tap4', name: 'Тапокалипсис', stat: 'taps', n: 200000, pearls: 25 },
    { id: 'gold1', name: 'Горсть дублонов', stat: 'goldEarned', n: 1e3, pearls: 3 },
    { id: 'gold2', name: 'Тугой кошель', stat: 'goldEarned', n: 1e6, pearls: 5 },
    { id: 'gold3', name: 'Сундук мертвеца', stat: 'goldEarned', n: 1e9, pearls: 10 },
    { id: 'gold4', name: 'Пиратский банкир', stat: 'goldEarned', n: 1e12, pearls: 15 },
    { id: 'gold5', name: 'Золотой прилив', stat: 'goldEarned', n: 1e15, pearls: 25 },
    { id: 'gold6', name: 'Богаче Короны', stat: 'goldEarned', n: 1e18, pearls: 40 },
    { id: 'win1', name: 'Боевое крещение', stat: 'wins', n: 1, pearls: 3 },
    { id: 'win2', name: 'Гроза бухты', stat: 'wins', n: 25, pearls: 5 },
    { id: 'win3', name: 'Морской волк', stat: 'wins', n: 150, pearls: 10 },
    { id: 'win4', name: 'Ужас семи морей', stat: 'wins', n: 600, pearls: 25 },
    { id: 'board1', name: 'На абордаж!', stat: 'boardings', n: 1, pearls: 5 },
    { id: 'board2', name: 'Мастер абордажа', stat: 'boardings', n: 50, pearls: 15 },
    { id: 'boss1', name: 'Охотник на капитанов', stat: 'bosses', n: 3, pearls: 10 },
    { id: 'boss2', name: 'Убийца легенд', stat: 'bosses', n: 12, pearls: 25 },
    { id: 'bld1', name: 'Поселенец', stat: 'buildingLevels', n: 25, pearls: 3 },
    { id: 'bld2', name: 'Градоначальник', stat: 'buildingLevels', n: 250, pearls: 10 },
    { id: 'bld3', name: 'Губернатор', stat: 'buildingLevels', n: 1000, pearls: 20 },
    { id: 'bld4', name: 'Король архипелага', stat: 'buildingLevels', n: 3000, pearls: 40 },
    { id: 'ship2', name: 'Две мачты', stat: 'shipTier', n: 2, pearls: 5 },
    { id: 'ship4', name: 'Плавучая крепость', stat: 'shipTier', n: 4, pearls: 15 },
    { id: 'ship6', name: 'Капитан-призрак', stat: 'shipTier', n: 6, pearls: 30 },
    { id: 'lvl10', name: 'Бывалый', stat: 'level', n: 10, pearls: 5 },
    { id: 'lvl30', name: 'Ветеран', stat: 'level', n: 30, pearls: 10 },
    { id: 'lvl60', name: 'Адмирал вольницы', stat: 'level', n: 60, pearls: 25 },
    { id: 'parrot1', name: 'Птицелов', stat: 'parrots', n: 5, pearls: 5 },
    { id: 'parrot2', name: 'Золотая клетка', stat: 'parrots', n: 50, pearls: 15 },
    { id: 'ev1', name: 'Морские байки', stat: 'events', n: 20, pearls: 5 },
    { id: 'ev2', name: 'Бывалый мореход', stat: 'events', n: 200, pearls: 15 },
    { id: 'exp1', name: 'Первооткрыватель', stat: 'expeditions', n: 5, pearls: 5 },
    { id: 'exp2', name: 'Колумб', stat: 'expeditions', n: 60, pearls: 15 },
    { id: 'note1', name: 'Читатель бутылок', stat: 'notes', n: 5, pearls: 5 },
    { id: 'note2', name: 'Летописец Кремня', stat: 'notes', n: 20, pearls: 30 },
    { id: 'pvp1', name: 'Дуэлянт', stat: 'pvpWins', n: 1, pearls: 10 },
    { id: 'pvp2', name: 'Бретёр', stat: 'pvpWins', n: 10, pearls: 25 },
    { id: 'fr1', name: 'Золотая лихорадка', stat: 'frenzies', n: 10, pearls: 5 },
    { id: 'shard7', name: 'Сердце собрано', stat: 'shards', n: 7, pearls: 50 },
    { id: 'legend1', name: 'Стать легендой', stat: 'prestiges', n: 1, pearls: 30 },
    { id: 'deep1', name: 'Бездонный', stat: 'endless', n: 100, pearls: 40 },
  ];
  VC.ACH_BONUS = 0.01;

  // ------------------------------------------------------------------ duel
  VC.DUEL = {
    // "Равный бой": both captains get the same frigate with these upgrade levels.
    equalShip: { tier: 3, hull: 30, guns: 30, sails: 30, crew: 30 },
    emotes: ['Йо-хо-хо!', 'Сдавайся!', 'Ха-ха!', 'Неплохо!', 'Тысяча чертей!', '🏴‍☠️'],
  };
})(window.VC);
