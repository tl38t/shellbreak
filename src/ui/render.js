/* 天壳 / SHELLBREAK — 渲染层
 * 只读：渲染函数不得修改游戏状态，需要改数据时走 SB.game 暴露的动作。
 * 脏标记合并：一帧内多次改数据只重渲染一次，避免「点一下卡一下」。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;
  var E = null, P = null;   // 延迟取，避免加载顺序耦合
  var _omenSig = '';        // #omen 横幅的渲染签名（活动事件 id，变化时才重写文案）
  var _breakAnimationTimers = [];
  var _breakAnimationReport = null;
  var _dysonAnimationTimers = [];

  /* 页签 / 面板键顺序（也是 renderPanes 的遍历顺序）。faith 紧挨 civic：
   *   两者都是「文明认了什么」的轴（市政=制度，信仰=宗教），语义相邻。 */
  var PANE_KEYS = ['village', 'folk', 'tech', 'civic', 'faith', 'workshop', 'wonder', 'star-map', 'company', 'meta', 'challenges', 'achievements'];

  function res() { return SB.game.run(); }
  function meta() { return SB.game.meta(); }

  function el(id) { return document.getElementById(id); }
  function formatFallback(value, params) {
    return String(value == null ? '' : value).replace(/\{([^{}]+)\}/g, function (match, name) {
      return params && params[name] !== undefined && params[name] !== null ? String(params[name]) : match;
    });
  }
  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || formatFallback(fallback, params);
  }
  function englishLocale() {
    return !!(SB.i18n && SB.i18n.getLocale && SB.i18n.getLocale() === 'en-US');
  }
  var STAR_MAP_LOCALE_CACHE = Object.create(null);
  var STAR_MAP_EXTRA_LOCALE_KEYS = [
    'resource.hardened_coral.name', 'resource.hydrothermal_energy.name',
    'resource.star_exploration.name', 'resource.stone_beam.name', 'resource.titanium.name',
    'resource.uranium.name', 'content.fuel.name', 'content.titanium.name'
  ];
  function starMapLocaleStrings() {
    var locale = SB.i18n && SB.i18n.getLocale ? SB.i18n.getLocale() : 'zh-CN';
    if (STAR_MAP_LOCALE_CACHE[locale]) return STAR_MAP_LOCALE_CACHE[locale];
    var strings = {};
    var dictionaries = root.ShellbreakLocales || {};
    var dictionary = dictionaries[locale] || dictionaries['zh-CN'] || {};
    Object.keys(dictionary).forEach(function (key) {
      if (key.indexOf('ui.star_map.') === 0) strings[key] = dictionary[key];
    });
    STAR_MAP_EXTRA_LOCALE_KEYS.forEach(function (key) {
      var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key) : '';
      if (value) strings[key] = value;
    });
    STAR_MAP_LOCALE_CACHE[locale] = strings;
    return strings;
  }
  function htmlText(value) {
    return String(value == null ? '' : value).replace(/[&<>\"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  /* 页面材质只跟随当前周目的纪元，不改存档数据。游戏重载页面时也会由这里从活动局恢复。 */
  function applyEraSkin(s) {
    var docRoot = root.document && root.document.documentElement;
    if (!docRoot || !docRoot.dataset) return;
    var maxEra = (SB.ERAS && SB.ERAS.length) || 6;
    var era = Math.floor(Number(s && s.era) || 1);
    era = Math.max(1, Math.min(maxEra, era));
    var value = String(era);
    if (docRoot.dataset.era !== value) docRoot.dataset.era = value;
  }

  /* ── 主页面分区卡片：标题配色 + 可折叠（2026-09-30 用户：各个区域可折叠，参考文明6）──
   * 【为什么折叠态不放在 DOM 上】面板（pane）每 2 秒被 PANE_REFRESH 整块重写 innerHTML；
   *   折叠态若写在「会被重写的节点」上，一重画就没了。所以状态记在模块里的 CARD_FOLDED，
   *   只把结果落成**持久卡片元素**（#card-* / #pane-*）上的一个 folded 类 ——
   *   那些元素本身不随重画重建，类是活的，重画不会把它冲掉。
   * 【为什么标题按钮走 document 级委托】同一条理由：标题节点会随 pane 重画被换掉，
   *   挂在它身上的 onclick 会静默失效（见 input.js 的 d.fold 分支）。
   * 【配色】一区一色，只用在标题条上、不铺正文 —— 正文保持单一深海底色，
   *   否则一屏六种底色会把读数淹没。 */
  var CARD_META = {
    res:      { color: '#4dd8e6' },
    env:      { color: '#a78bfa' },
    village:  { color: '#ffb84d' },
    folk:     { color: '#4ade80' },
    tech:     { color: '#7fb8e6' },
    civic:    { color: '#c4a2ff' },
    faith:    { color: '#e691b0' },
    workshop: { color: '#f0a45c' },
    wonder:   { color: '#ffd166' },
    'star-map': { color: '#87a7ff' },
    challenges: { color: '#f0a45c' },
    achievements: { color: '#d7bd80' },
    meta:     { color: '#9fb4ff' }
  };
  /* ── 巢穴页内的建筑分区标题配色（2026-09-30 晚，用户：「这里的文字颜色也改了，就是生息区这些」）──
   * 上一步只把最外层卡片标题上了色，页**内部**的区标题（礁栖核心 / 生息区 / 工坊区 …）还是
   * 深灰（.bztitle 的 var(--dim)），同一屏里两套标题语言，玩家分不清哪层是哪层。
   * 这里给八区各配一色，沿用 .cardhd 的 `--hc` 变量语言（左侧色条 + 同色文字），
   * 名字与卡片同义的就取同一色（工坊 / 市政 / 信仰 / 破界），让「区」与「页」对上号。
   * 与 CARD_META 同理：色只落在标题上、不铺正文，否则一屏八种底色会把读数淹掉。 */
  var ZONE_COLOR = {
    core:     '#4dd8e6',   // 礁栖核心 —— 基座，取青
    food:     '#4ade80',   // 生息区 —— 生计/食物，取绿
    workshop: '#f0a45c',   // 工坊区 —— 与「工坊」卡同色
    trade:    '#ffd166',   // 贸易区域 —— 货币，取金
    academy:  '#7fb8e6',   // 学术区 —— 与「科技」卡同色
    civic:    '#c4a2ff',   // 市政区 —— 与「市政」卡同色
    faith:    '#e691b0',   // 信仰区 —— 与「信仰」卡同色
    break:    '#ff5f6d'    // 破界区 —— 终局，取红
  };
  var CARD_FOLDED = {};
  var FOLD_SAVE = 'sb.fold.v1';
  function loadFold() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(FOLD_SAVE);
      if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') CARD_FOLDED = o; }
    } catch (e) { CARD_FOLDED = {}; }
  }
  function saveFold() {
    try { if (root.localStorage) root.localStorage.setItem(FOLD_SAVE, JSON.stringify(CARD_FOLDED)); } catch (e) {}
  }
  function cardEl(key) { return el('card-' + key) || el('pane-' + key); }
  function applyCardFold(key) {
    var c = cardEl(key);
    if (c && c.classList && c.classList.toggle) c.classList.toggle('folded', !!CARD_FOLDED[key]);
  }
  function applyAllFolds() { for (var k in CARD_FOLDED) applyCardFold(k); }
  function toggleCardFold(key) {
    CARD_FOLDED[key] = !CARD_FOLDED[key];
    applyCardFold(key);
    saveFold();
    return CARD_FOLDED[key];
  }
  /* 标题条 HTML。sub 是标题右侧的小字（可省）。⚠️ 只给「有 id 的持久卡」用；
   *   信仰页的标题写死在 index.html（它那页要护住命名的输入框，不能整块重画）。 */
  function cardHeadHTML(key, sub) {
    var m = CARD_META[key] || { color: 'var(--cyan)' };
    /* 巢穴页的名字随纪元演进（家在长大），其余页用固定名。
     * ⚠️ 取活动局 run() 的 era，2 秒面板重画时会自动跟着纪元走。 */
    var titleKeys = {
      res: 'ui.pane.resources.title', env: 'ui.pane.environment.title',
      folk: 'ui.pane.people.title', tech: 'ui.pane.research.title', civic: 'ui.pane.civics.title',
      faith: 'ui.pane.faith.title', workshop: 'ui.workshop.title', wonder: 'ui.pane.wonders.title',
      'star-map': 'ui.pane.star_map.title', company: 'ui.pane.companies.title',
      challenges: 'ui.pane.challenges.title', achievements: 'ui.pane.achievements.title',
      meta: 'ui.pane.prestige_shop.title'
    };
    var nm = (key === 'village')
      ? (SB.habitat && SB.habitat.habitatName ? SB.habitat.habitatName(SB.game.run()) : tr('ui.habitat.name'))
      : tr(titleKeys[key]);
    nm = htmlText(nm);
    return '<div class="cardhd" data-fold="' + key + '" style="--hc:' + m.color +
      '" title="' + htmlText(tr('ui.card.collapse_expand.tooltip', null, '点击折叠 / 展开')) + '"><span class="cv">▾</span>' + nm +
      (sub ? '<span class="hcsub">' + sub + '</span>' : '') + '</div>';
  }
  loadFold();
  applyAllFolds();

  /* ── 巢穴页内「建筑分区」折叠（2026-09-30 晚 · 用户：「各个分区的折叠呢，没做啊」）──
   * 上一轮只做了**最外层卡片**折叠，页**内部**的区（礁栖核心 / 生息区 / 工坊区 …）
   * 仍整段铺开，玩家点不到。这里补上，与外层卡片折叠的关键差别是：
   *   外层卡片节点（#card-* / #pane-*）是**持久的**，折叠态落个类就够了；
   *   但 paneVillage 的 HTML 每 2 秒被 PANE_REFRESH **整块重画**，落类会被冲掉 ——
   *   所以 ZONE_FOLDED 是**唯一真源**，折叠态必须每次从它**重拼进 HTML**。
   * 点击仍走 document 级委托（标题随重画被换掉，挂监听见 input.js 的 d.zfold）。 */
  var ZONE_FOLDED = {};
  var ZONE_FOLD_SAVE = 'sb.zfold.v1';
  function loadZoneFold() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(ZONE_FOLD_SAVE);
      if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') ZONE_FOLDED = o; }
    } catch (e) { ZONE_FOLDED = {}; }
  }
  function saveZoneFold() {
    try { if (root.localStorage) root.localStorage.setItem(ZONE_FOLD_SAVE, JSON.stringify(ZONE_FOLDED)); } catch (e) {}
  }
  function toggleZoneFold(id) {
    ZONE_FOLDED[id] = !ZONE_FOLDED[id];
    /* 立刻反馈：先把类翻到**当前活着**的那个区节点上（省一次整块重画）；
     * 下一次重画按状态重建，结果一致。查询不到（假 DOM / 区还没露头）就只靠状态。 */
    var n = document.querySelector('.bzone[data-zone="' + id + '"]');
    if (n && n.classList && n.classList.toggle) n.classList.toggle('folded', !!ZONE_FOLDED[id]);
    saveZoneFold();
    return ZONE_FOLDED[id];
  }
  function isZoneFolded(id) { return !!ZONE_FOLDED[id]; }
  function zoneColor(id) { return ZONE_COLOR[id]; }
  loadZoneFold();

  /* 巢穴建筑图标显隐：纯 UI 偏好，跨局持久化，不写入 run 存档。 */
  var BUILDING_ICONS_SHOWN = true;
  var BUILDING_ICON_SAVE = 'sb.buildingIcons.v1';
  function syncBuildingIconToggle() {
    var n = el('building-icon-toggle');
    if (!n) return;
    n.setAttribute('aria-pressed', BUILDING_ICONS_SHOWN ? 'true' : 'false');
    n.textContent = tr(BUILDING_ICONS_SHOWN ? 'ui.building_icons.shown.label' : 'ui.building_icons.hidden.label', null,
      BUILDING_ICONS_SHOWN ? '图标：显示' : '图标：隐藏');
    n.title = tr(BUILDING_ICONS_SHOWN ? 'ui.building_icons.hide.tooltip' : 'ui.building_icons.show.tooltip', null,
      BUILDING_ICONS_SHOWN ? '点击隐藏建筑图标' : '点击显示建筑图标');
  }
  function loadBuildingIconPreference() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(BUILDING_ICON_SAVE);
      if (raw === '0') BUILDING_ICONS_SHOWN = false;
    } catch (e) { BUILDING_ICONS_SHOWN = true; }
    syncBuildingIconToggle();
  }
  function toggleBuildingIcons() {
    BUILDING_ICONS_SHOWN = !BUILDING_ICONS_SHOWN;
    try { if (root.localStorage) root.localStorage.setItem(BUILDING_ICON_SAVE, BUILDING_ICONS_SHOWN ? '1' : '0'); } catch (e) {}
    syncBuildingIconToggle();
    return BUILDING_ICONS_SHOWN;
  }
  function buildingIconsShown() { return BUILDING_ICONS_SHOWN; }
  loadBuildingIconPreference();


  function renderRes() {
    var s = res(), g = el('res');
    if (!s || !g) return;
    var need = SB.economy.foodUse(s);
    var rate = SB.economy.rates(s);   // 与 tick 同一套公式的净速率，见 economy.rates
    var htmlBase = '', htmlCraft = '';
    for (var k in SB.RESS) {
      /* ⚠️ 2026-09-28 信仰面板 gate：信仰资源行只在《神学》完成后出现（用户规格
       *    「研究神学之后就开启信仰面板」）。神学前信仰恒为 0 也没地方显示，
       *    硬塞一行只会误导玩家以为已经有信仰系统。gate 读 `s.civics.theology`。 */
      /* 热液能是逐 tick 分配、不会累积的能流；星空探索是星图进度；星屑属于轮回局外资源。
       * 前两者分别在自然环境卡与星图展示，星屑在轮回商店展示，不混进本局材料库存网格。 */
      if (k === 'hydro' || k === 'starExplore' || k === 'stardust' || !SB.economy.resUnlocked(s, k)) continue;
      var isCraft = SB.RESS[k].kind === 'craft';
      var v = s.res[k];
      var cls = 'res' + (k === 'luxury' ? ' luxury' : '') + (k === 'kelp' && v < need ? ' neg' : '');
      /* 上限写进格子：只有有限上限的资源才显示 /N（科技、地热是 Infinity，不显示）。
       * 满了标红——那一刻起继续产出是在白流，玩家得知道该去造压舱仓或花掉。
       * ⚠️ 存量与上限是**两种精度**：存量走 fmtAmt（固定一位小数，因为珊瑚 0.1/次、
       *    科技 0.03/秒这种进项取整后点十下都不动），上限走 fmt（成本/上限天生是整数）。
       *    见 economy.js 里 fmtAmt 的注释。 */
      var cap = SB.economy.capOf(s, k);
      var capTxt = '';
      if (isFinite(cap)) {
        var full = v >= cap;
        capTxt = '<i class="cap' + (full ? ' full' : '') + '">/ ' + SB.economy.fmt(cap) + '</i>';
        if (full) cls = cls.replace(/ neg/, '');   // 满了和饥荒是两回事，别再标红成缺粮
      }
      /* 总获得速率（净值/秒）：正绿负红，0 不显示。中间资源（珊瑚/矿砂被加工
       * 转走、燃料被祭坛烧掉）净值可能是负的——这正是要暴露给玩家的信息。 */
      var r = rate[k] || 0;
      var rateTxt = '';
      if (Math.abs(r) >= 0.005) {
        var sign = r > 0 ? '+' : '';
        /* 计数单位与存量/上限同源（2026-11-09）：≥1e4 走 economy.fmtAbbr 的 k/M/B/T 阶梯，
         * 回落仍用原来的两档精度（≥100 取整、否则两位小数）—— +0.03/s 不能被压成 +0.0/s。 */
        rateTxt = '<i class="rate' + (r > 0 ? ' up' : ' down') + '">' + sign +
          SB.economy.fmtAbbr(r, Math.abs(r) >= 100 ? Math.round(r) : r.toFixed(2)) + '/s</i>';
      }
      var faithBonusTxt = '';
      if (k === 'faith') {
        /* 信仰行的「全产 +X%」：让玩家一眼看到信仰存量换来的全局产出加成
         *   （economy.faithAllMul，10→+1% / 100→+2% / 1000→+3%）。faith<10 时不显示（加成为 0）。 */
        var fam = SB.economy.faithAllMul(s);
        if (fam > 1) faithBonusTxt = ' <i class="rate up">全产+' + Math.round((fam - 1) * 100) + '%</i>';
      }
      /* 奢侈品行的「产 X · 耗 Y」小字（2026-10-05 用户拍板）：净速率会被**需求封顶** ——
       *   供给涨了之后净值停在 min(S,D) 那一档不动，玩家会以为购买项（奢侈品契/马具/马镫…）没生效。
       *   用小一号斜体把供给与消耗直接摆出来，一眼看出「净不变=需求封顶」而非加成失效。
       * ⚠️ 数字走 happyLedger 同一口（与 tick / 幸福度行同源），render 不自己拼第二份账。
       * ★ 2026-10-21（用户「产xx耗xx放到奢侈品后面去，把卡片调整成一样大的」）三处调整：
       *   ① 位置挪到**标签正后方**（原先排在净值之后，被挤到第二行）；
       *   ② 长括号解释（按幸福 X 计 / 已剔市政·奇观·卡的 +Y）收进 `title`：
       *      正是它把这张卡撑到 **3 行**，而 .grid 是 `align-items:stretch` ⇒ 整行被拉高 30px，
       *      卡片大小不齐。实测（5 列、卡宽 204.8px）：带长括号行高 101.7，收进 title 后 71.7
       *      = 普通卡行高，四行全部一致；
       *   ③ 奢侈品行不再叠一个净值：净 = 产 − 耗 是恒等式（rates.luxury = S − min(S,D)），
       *      两个分量都摆着了，第三个数字纯冗余，窄屏（≤390px）还会多折一行把卡撑高。
       *   ④ ②把解释塞进 title ⇒ **只有桌面 hover 能看见，手机端等于整条信息丢了**。
       *      按用户跨端约定（方案 C）补 ⓘ：CSS 只在 @media (hover:none) 显示 ⓘ，
       *      点按弹自定义浮层；内容读 ⓘ 自己的 title（与桌面同一份文本，单一落点）。 */
      var luxTxt = '';
      var tipBtn = '';      /* 手机端 ⓘ（见下 ④）：仅在有 title 解释时才生成 */
      var hideRate = false;
      if (k === 'luxury' && SB.economy.happyLedger) {
        var LL = SB.economy.happyLedger(s);
        /* ⚠️ 2026-10-06 用户报 bug：「这里的消耗是不是把市政加的这些额外幸福度也算上去了」
         *   —— 是的，那是读数 bug（真结算一直用机制值），已修（economy.happyMech）。
         *   现在把「用于计价的幸福度」也摆出来：有政体/奇观/卡加成时，
         *   玩家能验「人口 × 每人(mechH) = 耗」，不会以为加成被算成了消耗。
         *   ⚠️ 2026-10-21：这段解释改挂 `title`（桌面 hover 可见），数值一字不改。 */
        var _luxTip = '';
        if (Math.abs(LL.bonus) > 1e-9) {
          /* mechH ≤ 0 时 c(H) 走保底 BASE，那个负数对玩家没有意义，
           * 印出来只会让人以为「按 −1 计价」是更省的事（其实单价已是最低）。 */
          _luxTip = tr(LL.mechH > 0 ? 'ui.happiness.luxury.tooltip.mechanic' : 'ui.happiness.luxury.tooltip.floor', {
            mechanicHappiness: LL.mechH.toFixed(2), bonusOffset: (LL.bonus > 0 ? '+' : '') + LL.bonus.toFixed(2)
          }, LL.mechH > 0
            ? '按幸福 ' + LL.mechH.toFixed(2) + ' 计，已剔市政/奇观/卡的 ' + (LL.bonus > 0 ? '+' : '') + LL.bonus.toFixed(2)
            : '计价已到底线，已剔市政/奇观/卡的 ' + (LL.bonus > 0 ? '+' : '') + LL.bonus.toFixed(2));
        }
        luxTxt = '<i class="sd"' + (_luxTip ? ' title="' + _luxTip + '"' : '') + '>产 ' +
          '<span class="lux-out">' + LL.out.toFixed(2) + '</span> · 耗 ' +
          '<span class="lux-burn">' + LL.burn.toFixed(2) + '</span></i>';
        hideRate = true;
        /* ④ 手机端 ⓘ：解释文本只挂一次（ⓘ 的 title），点按时由 showHoverInfo 读出弹浮层。
         * 桌面端 ⓘ 不显示（CSS 门控），.sd 的原生 title hover 照旧 —— 两端同一份文本。 */
        if (_luxTip) {
          tipBtn = '<i class="hover-info-btn" title="' +
            _luxTip.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">ⓘ</i>';
        }
      }
      /* 信仰行的标签：玩家给信仰起了名 ⇒ 用宗教名代替「信仰」二字（神学解锁后可在 #religionBox 改名）。
       * ERA9 虚境信仰卡装填后强制「虚境」并锁死（覆盖玩家自定义名，见 civics.faithDisplayName）。 */
      var rowName = SB.i18n && SB.i18n.resourceName ? SB.i18n.resourceName(k, SB.RESS[k].name) : SB.RESS[k].name;
      if (k === 'faith') {
        var rn = (SB.civic && SB.civic.faithDisplayName)
          ? SB.civic.faithDisplayName(s)
          : ((s.religionName || '').trim());
        if (rn) rowName = rn;
      }
      /* 标签行顺序（2026-10-21 用户要求）：名称 → 产/耗 → 净值 → 全产加成。
       * 奢侈品行 hideRate=true ⇒ 不重复净值（净 = 产 − 耗，见上面 ③）。 */
      var resourceIcon = '<img class="res-icon" src="assets/resource-icons/' + k + '.png?v=2" alt="" aria-hidden="true" width="48" height="48" decoding="async">';
      /* data-res-detail：整格可点 ⇒ 弹「存量/上限 + 净值 + 产出消耗分项」面板
       * （2026-10-29 用户：只给数值）。委托在 input.js，重画不丢监听。 */
      var row = '<div class="' + cls + '" data-res-detail="' + k + '">' + resourceIcon + '<div class="res-content"><b data-res="' + k + '" data-raw="' + (+v).toFixed(2) + '">' +
        SB.economy.fmtAmt(v) + capTxt + '</b><span class="res-details"><span class="res-label"><span class="res-name">' + rowName + '</span></span>' + luxTxt + (hideRate ? '' : rateTxt) +
        faithBonusTxt + tipBtn + '</span></div></div>';
      if (isCraft) htmlCraft += row; else htmlBase += row;
    }
    g.innerHTML = htmlBase;
    /* 工艺资源独立分区：解锁前不显示（resUnlocked），且无任何可见项时整段隐藏。 */
    var gc = el('res-craft');
    if (gc) {
      gc.innerHTML = htmlCraft;
      var wrap = el('res-craft-wrap');
      if (wrap) wrap.hidden = (htmlCraft === '');
    }
    /* ⚠️ 这行「洋流季：… ×N｜族民…｜峰值…｜饿死…」已经删掉（2026-09-26 用户要求），
     *   因为**每一格在别处都有归属**，堆在这里只是同一份信息出现两次：
     *     ① 季节 → 顶上「自然环境」卡里的海底火山那块（renderEnv），它连周期与
     *        剩余潮日一起给，比这一行只念一个倍率有用；
     *     ② 族民 / 人口上限、峰值族民 → 巢穴页各自有专门一行；
     *     ③ 饿死 / 冻死 → 破壳结算报告里按增量报（game.js 的结算 lines）；
     *     ④ 冰封期 → 天壳条上的「冰封期」徽标。
     *   留着它的坏处是它同时是**每帧重画的**（季节会变），一个纯读数却挂在顶栏。 */
  }

  /* ══ 顶栏资源详情（2026-10-29 · 用户：「点最上方的材料，先显示介绍和当前产出是怎么算的」
   *    → 随后拍板：「不要是什么/怎么来/去哪这些文案，就单纯给数值」）════════════════
   * 面板只放三样东西：存量/上限、净值、产出与消耗的分项数值。
   * ⚠️ 数值**全部**来自 economy.ratesParts —— 它和顶栏那个净值是**同一次计算**（同一个
   *    rates()），所以「分项之和 === 净值」是结构保证。这里不许自己乘任何一个系数：
   *    一旦在 UI 里重算，就又是「面板撒谎」家族的新入口（玩家看到 +0.4/s，库存却在掉）。
   * ⚠️ 没有 prose：不写「是什么/怎么来/去哪」，也不给整句话解释。分项标签只是名字
   *    （矿工、砂矿坑、熔炉耗料），乘区行只是「×1.15」这种数值。 */
  function rdNum(v) {
    var a = Math.abs(v);
    if (!isFinite(v)) return '∞';
    /* 详情面板的净值 / 分项 / 汇总 / 基数与资源卡速率共用同一套计数单位；
     * 未达档时保留原来的一档一位、两档两位（原来这里 ≥10000 只加千分位，
     * 一亿仍会印成 100,000,000 撑破格子）。 */
    return SB.economy.fmtAbbr(v, a >= 100 ? v.toFixed(1) : v.toFixed(2));
  }
  function rdSigned(v) {
    if (!isFinite(v)) return '∞';
    return (v > 0 ? '+' : '') + rdNum(v);
  }
  function rdMul(f) {
    var a = Math.abs(f);
    if (a >= 100) return f.toFixed(0);
    if (a >= 10) return f.toFixed(1);
    return f.toFixed(2);
  }
  var RES_DETAIL_RATE_LABEL_KEYS = null;
  var RES_DETAIL_RATE_LABEL_ALIASES = {
    '马尔斯工造中心': 'building.mars_workshop.name',
    '瑞亚星矿井': 'building.rhea_mine.name',
    '老潮石碑': 'legacy.ancient_tide_stele.name',
    '泰坦气云采集站': 'building.titan_cloud_harvester.name',
    '生物材料研究所': 'building.biomaterials_research_institute.name',
    '启蒙沙龙': 'policy.card.enlightenment_salon.name',
    '寒流季': 'season.cold_season.name',
    '水体污染': 'challenge.water_pollution.name',
    '砂矿坑': 'building.sand_pit.name',
    '阿尔巴达': 'wonder.albada_hydrothermal_university.name',
    '炉火礼赞': 'faith.tenet.furnace_hymn.name',
    "哈'利法": 'wonder.khalifa_space_telescope.name',
    '王座': 'wonder.supreme_throne.name',
    '星炉献礼': 'faith.tenet.star_forge_offering.name',
    '政体': 'civic.government.heading'
  };
  function rdRateLabel(label) {
    if (!label) return '';
    if (!SB.i18n || !SB.i18n.getLocale || SB.i18n.getLocale() !== 'en-US') return label;
    if (!RES_DETAIL_RATE_LABEL_KEYS) {
      RES_DETAIL_RATE_LABEL_KEYS = Object.create(null);
      var dictionaries = root.ShellbreakLocales || {};
      var zh = dictionaries['zh-CN'] || {};
      var en = dictionaries['en-US'] || {};
      Object.keys(zh).forEach(function (key) {
        if (key.indexOf('ui.economy.rate.source.') !== 0 || typeof en[key] !== 'string') return;
        var sourceLabel = zh[key];
        if (Object.prototype.hasOwnProperty.call(RES_DETAIL_RATE_LABEL_KEYS, sourceLabel) &&
            RES_DETAIL_RATE_LABEL_KEYS[sourceLabel] !== key) {
          RES_DETAIL_RATE_LABEL_KEYS[sourceLabel] = null;
        } else {
          RES_DETAIL_RATE_LABEL_KEYS[sourceLabel] = key;
        }
      });
    }
    var key = RES_DETAIL_RATE_LABEL_ALIASES[label] || RES_DETAIL_RATE_LABEL_KEYS[label];
    return key ? tr(key, null, label) : label;
  }
  function showResDetail(k) {
    var s = res(), modal = el('modal'), box = el('modalBox');
    if (!s || !modal || !box || !SB.RESS[k]) return false;
    var detail = (SB.economy && SB.economy.ratesParts) ? SB.economy.ratesParts(s) : null;
    var rate = detail ? (detail.rate[k] || 0) : ((SB.economy.rates(s) || {})[k] || 0);
    var list = (detail && detail.parts && detail.parts[k]) || [];

    function partRow(p) {
      var cls = p.v > 0 ? 'out' : 'in';
      var html = '<div class="rd-row ' + cls + '"><span class="rd-l">' + htmlText(rdRateLabel(p.l)) + '</span><b class="rd-v">' +
        rdSigned(p.v) + '</b></div>';
      var chips = '', i;
      if (p.m && p.m.length) {
        for (i = 0; i < p.m.length; i++) {
          var f = p.m[i][1];
          /* ×1.00 的乘区一律不印：那一屏会全是「×1.00」，真加成反而看不见。
           * 隐藏它们不改变结论 —— 被藏的都是恒等乘区，分项值本身照旧是全额。 */
          if (!isFinite(f) || Math.abs(f - 1) < 1e-9) continue;
          chips += '<i>' + htmlText(rdRateLabel(p.m[i][0])) + '<em>×' + rdMul(f) + '</em></i>';
        }
        /* 基数必须一起印：只给乘区系数、不给起点，玩家没法把右边的数反推回去
         * （「×1.20 ×1.21 怎么得到 0.79」）。这一格就是算式里那个被乘的底数。 */
        if (chips) chips = '<i class="rd-b">' + htmlText(tr('ui.resource.detail.base', null, '基数')) + '<em>' + rdNum(p.b) + '</em></i>' + chips;
      }
      if (chips) html += '<div class="rd-fx">' + chips + '</div>';
      else if (p.d) html += '<div class="rd-fx"><i>' + htmlText(rdRateLabel(p.d)) + '</i></div>';
      return html;
    }

    var outRows = '', inRows = '', sumOut = 0, sumIn = 0, i2;
    for (i2 = 0; i2 < list.length; i2++) {
      var p2 = list[i2];
      if (!isFinite(p2.v) || Math.abs(p2.v) < 1e-9) continue;
      if (p2.v > 0) { outRows += partRow(p2); sumOut += p2.v; }
      else { inRows += partRow(p2); sumIn += p2.v; }
    }

    var cap = SB.economy.capOf(s, k);
    /* 有上限写「/ 200」，无上限只写「无上限」—— 拼成「/ 无上限」读着是病句。 */
    var capTxt = isFinite(cap) ? '/ ' + SB.economy.fmt(cap) : htmlText(tr('ui.resource.detail.unlimited', null, '无上限'));
    var v = s.res[k] || 0;
    var full = isFinite(cap) && cap > 0 && v >= cap;
    var name = SB.i18n && SB.i18n.getLocale && SB.i18n.getLocale() === 'en-US' && SB.i18n.resourceName
      ? SB.i18n.resourceName(k, SB.RESS[k].name)
      : SB.RESS[k].name;
    var netCls = rate > 1e-9 ? 'up' : (rate < -1e-9 ? 'down' : '');

    box.innerHTML = '<div class="res-detail">'
      + '<div class="modal-hd"><b><img class="res-icon" src="assets/resource-icons/' + k +
        '.png?v=2" alt="" aria-hidden="true" width="24" height="24" decoding="async">' + htmlText(name) + '</b>'
      + '<button type="button" class="modal-x" data-modal-close="1" aria-label="' + htmlText(tr('ui.action.close', null, '关闭')) + '">×</button></div>'
      + '<div class="rd-head">'
      +   '<div class="rd-cell"><span>' + htmlText(tr('ui.resource.detail.stock', null, '存量')) + '</span><b>' + SB.economy.fmtAmt(v) + '</b><i>' + capTxt +
            (full ? '<em class="rd-full">' + htmlText(tr('ui.resource.detail.full', null, '满')) + '</em>' : '') + '</i></div>'
      +   '<div class="rd-cell rd-net ' + netCls + '"><span>' + htmlText(tr('ui.resource.detail.net_rate', null, '净值')) + '</span><b>' + rdSigned(rate) + '<i>/s</i></b></div>'
      + '</div>'
      + (outRows ? '<div class="rd-sec">' + htmlText(tr('ui.resource.detail.output', null, '产出')) + '</div>' + outRows : '')
      + (inRows ? '<div class="rd-sec">' + htmlText(tr('ui.resource.detail.consumption', null, '消耗')) + '</div>' + inRows : '')
      + (list.length ? '' : '<div class="rd-empty">' + htmlText(tr('ui.resource.detail.empty', null, '该资源当前没有任何产出或消耗。')) + '</div>')
      + '<div class="rd-foot"><span>' + htmlText(tr('ui.resource.detail.summary', {
        outputRate: rdSigned(sumOut), consumptionRate: rdSigned(sumIn), netRate: rdSigned(rate)
      }, '产 {outputRate} · 耗 {consumptionRate} · 净 {netRate}')) + '</span></div>'
      + '</div>';
    resetModalChrome();
    modal.classList.remove('hidden');
    bodyModalClass(true);
    return true;
  }

  function renderShell() {
    var s = res(); if (!s) return;
    var f = el('shellFill'), txt = el('shellTxt'), hint = el('shellHint');
    /* 破壳后：同一条 shellbar 先显示星空探索进度；完成《绝热材料》启动戴森球工程后，
     * 这里直接切换为工程进度与帆/节点计数。 */
    if (s.shell <= 0 && (s.broken || s.shellOpened || s.breakSettled)) {
      if (s.techs && s.techs.adiabatic) {
        var dysonCapSails = SB.challenges && SB.challenges.dysonSailCap ? SB.challenges.dysonSailCap(s) : (SB.CFG.DYSON_SAIL_CAP || 10000);
        var dysonCapNodes = SB.challenges && SB.challenges.dysonNodeCap ? SB.challenges.dysonNodeCap(s) : (SB.CFG.DYSON_NODE_CAP || 1000);
        var dysonRatio = SB.economy && SB.economy.dysonPct ? SB.economy.dysonPct(s) : 0;
        var dysonPercent = Math.max(0, Math.min(100, dysonRatio * 100));
        var currentSails = Math.max(0, Number(s.sunSails) || 0);
        var currentNodes = Math.max(0, Number(s.dysonNodes) || 0);
        var stageTrack = el('shellDysonStages');
        var stageCount = stageTrack && stageTrack.children && stageTrack.children.length ? stageTrack.children.length : 5;
        var stageContributionPercent = 100 / stageCount;
        var stagePosition = s.dysonDone ? stageCount : dysonPercent / stageContributionPercent;
        var currentStage = Math.min(stageCount, Math.floor(dysonPercent / stageContributionPercent) + 1);
        if (s.dysonDone) currentStage = stageCount;
        if (stageTrack) {
          if (s.dysonDone) stageTrack.classList.add('is-finished');
          else stageTrack.classList.remove('is-finished');
          var stageCells = stageTrack.children || [];
          for (var si = 0; si < stageCells.length; si++) {
            var cell = stageCells[si];
            var cellProgress = Math.max(0, Math.min(1, stagePosition - si));
            var cellClass = 'dyson-stage' + (cellProgress >= 1 ? ' is-complete' : '') +
              (stagePosition >= si && stagePosition < si + 1 && !s.dysonDone ? ' is-current' : '');
            if (cell.className !== cellClass) cell.className = cellClass;
            var cellFill = cell.firstElementChild || (cell.children && cell.children[0]);
            if (cellFill) cellFill.style.width = (cellProgress * 100) + '%';
          }
        }
        f.style.width = dysonPercent + '%';
        f.className = 'shellfill dyson';
        if (f.parentNode) f.parentNode.classList.add('dyson-progress');
        var dysonLbl = el('shellLbl');
        if (dysonLbl) dysonLbl.innerHTML = '<img class="special-resource-icon" src="assets/building-icons/era-10/era10-solar-ring-v2.png" alt="" aria-hidden="true" width="20" height="20"><span>' +
          htmlText(tr('ui.shell.dyson.project.label', null, '戴森球工程进度')) + '</span>';
        var projectLabel = s.dysonDone
          ? tr('ui.shell.dyson.project.complete', null, '★ 戴森球已竣工')
          : tr('ui.shell.dyson.project.progress', { dysonProgressPercent: dysonPercent.toFixed(2) }, '戴森球工程 ' + dysonPercent.toFixed(2) + '%');
        var stageLabel = tr('ui.shell.dyson.project.stage', { currentStage: currentStage, stageCount: stageCount }, '阶段 ' + currentStage + ' / ' + stageCount);
        var countLabel = tr('ui.shell.dyson.project.sail_node_counts', {
          currentSails: currentSails.toLocaleString(), sailCap: dysonCapSails.toLocaleString(),
          currentNodes: currentNodes.toLocaleString(), nodeCap: dysonCapNodes.toLocaleString()
        }, '（太阳帆 ' + currentSails.toLocaleString() + ' / ' + dysonCapSails.toLocaleString() +
          ' ＋ 戴森球节点 ' + currentNodes.toLocaleString() + ' / ' + dysonCapNodes.toLocaleString() + '）');
        txt.innerHTML = htmlText(projectLabel) + ' <span class="dyson-stage-badge">' + htmlText(stageLabel) +
          '</span> <span class="cap">' + htmlText(countLabel) + '</span>';
        hint.textContent = tr('ui.shell.dyson.project.progress_hint', {
          stageCount: stageCount, stageContributionPercent: stageContributionPercent.toFixed(0)
        }, '五阶段各代表总工程的 20%；进度取太阳帆与戴森球节点中较慢的一项，两项都达标后工程竣工。');
        return;
      }
      var cap = SB.challenges && SB.challenges.starCap ? SB.challenges.starCap(s) : (SB.CFG.STAR_CAP || 0);
      var cur = s.res.starExplore || 0;
      var p = cap > 0 ? (cur / cap) * 100 : 0;
      f.style.width = Math.max(0, Math.min(100, p)) + '%';
      f.className = 'shellfill';
      if (f.parentNode) f.parentNode.classList.remove('dyson-progress');
      /* 卡片标题跟着翻转（2026-10-13 截图验证发现：条改了、标题还挂「天壳 · 冰封层厚度」）。 */
      var lbl = el('shellLbl');
      if (lbl) lbl.innerHTML = '<img class="special-resource-icon" src="assets/resource-icons/starExplore.png?v=2" alt="" aria-hidden="true" width="20" height="20"><span>' +
        htmlText(tr('ui.shell.star_exploration.progress_label', null, '星空 · 深空探索进度')) + '</span>';
      if (s.starComplete) {
        /* `.cap` 是线上原版的计数样式：拆成「标题 + 计数」两个语义 key，
         * 既不把 HTML 塞进文案，也不会让整串被 htmlText() 转义后丢掉样式。
         * ⚠️ 必须写 innerHTML：e2e 的 DOM 桩只从 _html 读 #shellTxt。 */
        var completeParams = {
          currentStarProgress: Math.round(cur).toLocaleString(), starProgressCap: cap.toLocaleString()
        };
        txt.innerHTML = htmlText(tr('ui.shell.star_exploration.complete', null, '★ 太空时代达成')) +
          ' <span class="cap">' + htmlText(tr('ui.shell.star_exploration.complete_counts', completeParams,
            '（' + completeParams.currentStarProgress + ' / ' + completeParams.starProgressCap + '）')) + '</span>';
        hint.textContent = tr('ui.shell.star_exploration.complete_hint', null, '星空探索已达上限；研究《绝热材料》后，戴森球工程进度会接替这里。');
      } else {
        /* ⚠️ 必须写 innerHTML：e2e 的 DOM 桩只把 innerHTML 同步到 _html，
         * 用 textContent 会让「星空槽」断言读到上一帧的旧串。 */
        txt.innerHTML = htmlText(tr('ui.shell.star_exploration.progress', {
          currentStarProgress: Math.round(cur).toLocaleString(), starProgressCap: cap.toLocaleString(), starProgressPercent: p.toFixed(2)
        }, '星空槽 ' + Math.round(cur).toLocaleString() + ' / ' + cap.toLocaleString() + '（' + p.toFixed(2) + '%）'));
        hint.textContent = tr('ui.shell.star_exploration.progress_hint', null, '破壳后由文明推力（人口/建筑/科技/轮回增益）被动累积，满槽即太空时代达成。卫星/空间站各自的「开几座」开关可单独停掉它们的星空贡献。');
      }
      return;
    }
    /* 破壳前：原有天壳条逻辑 */
    var lbl0 = el('shellLbl');
    if (lbl0) lbl0.textContent = tr('ui.shell.thickness.label', null, '天壳 · 冰封层厚度');
    var p2 = SB.economy.rOf(s) * 100;
    f.style.width = Math.max(0, p2) + '%';
    f.className = 'shellfill' + (SB.economy.isCold(s) ? ' cold' : '');
    if (f.parentNode) f.parentNode.classList.remove('dyson-progress');
    /* 线上原版是全角括号「（25.0%）」；接 i18n 时曾把整串硬编码成半角，
     * 现在收回词库，中文/英文各自保留正确标点，不再在渲染器里拼中文。 */
    txt.innerHTML = htmlText(tr('ui.shell.thickness.progress', {
      currentShell: Math.round(s.shell), iceShell: s.iceShell, shellPercent: p2.toFixed(1)
    }, Math.round(s.shell) + ' / ' + s.iceShell + '（' + p2.toFixed(1) + '%）')) +
      (SB.economy.isCold(s) ? ' <span class="coldbadge">' + htmlText(tr('ui.shell.thickness.frozen_badge', null, '· 本季冰封')) + '</span>' : '');
    /* 2026-10-30（用户）：「提醒玩家被动破壳只能到 25%，后续要造奇观钻头」。
     * 两件事必须在**没到下限时**就说清楚，不能等卡住了才讲：
     *   ① 基础（被动）削壳有天花板 = FLOOR_AT，不是无限推；
     *   ② 天花板之后唯一的出路 = 奇观「天穹钻机」，且它要先去科技页研究。
     * ⚠️ 旧句「在下方这行启动」是**假指引** —— 未建成奇观时 #envDrill 是 display:none，
     *    玩家顺着找会扑空（真机取证：`#card-env button` 一个都没有）。改成条件语态
     *    「建成后这一行下方就会出现启动按钮」，只在真的会有按钮时才指向它。 */
    var floorPct = Math.round((CFG.FLOOR_AT || 0) * 100);
    var hint2 = tr('ui.shell.thickness.hint.passive_limit', { shellFloorPercent: floorPct },
      '被动削壳：族民、建筑、科技推高它，但最多只能把天壳削到 ' + floorPct + '%——最后一段要靠建成奇观「天穹钻机」来凿。');
    if (SB.economy.rOf(s) <= CFG.FLOOR_AT) {
      hint2 = tr('ui.shell.thickness.hint.at_limit', { shellFloorPercent: floorPct },
        '已到 ' + floorPct + '% 下限，被动削壳到此为止。剩下的天壳要靠奇观「天穹钻机」：先在科技页研究同名科技，再到奇观页建成它，这一行下方就会出现启动按钮。');
    }
    /* 冰封那段是**次要信息**，不该跟主指令抢行数：已到下限时概率恒定（越薄越容易中到顶），
     * 再报一次「现在 25%」只会和主句的下限数字撞在一起读成一句话。 */
    if (SB.economy.isCold(s)) hint2 += ' ' + tr('ui.shell.thickness.hint.frozen_season', {
      coldSeasonGlobalProductionMultiplier: SB.economy.coldSeasonMul(s)
    }, '本季冰封：全局产出 ×0.6，族民会冻伤（拨开暖石开关即可免）。');
    /* 下限时只给短句（不重复报概率）；与未到下限的长句是两种语义，
     * 之前误用同一个 key ⇒ 下限态会显示长句。各自独立登记，不共用 key。 */
    else if (SB.economy.rOf(s) <= CFG.FLOOR_AT) hint2 += ' ' + tr('ui.shell.thickness.hint.freeze_chance_at_limit', null,
      '冰封按寒流季掷骰，壳越薄越容易中。');
    else {
      hint2 += ' ' + tr('ui.shell.thickness.hint.freeze_chance', {
        freezeChancePercent: Math.round(SB.economy.freezeChance(s) * 100)
      }, '冰封期在每个寒流季开局掷一次，壳越薄越容易中——按现在的壳厚是 ' + Math.round(SB.economy.freezeChance(s) * 100) + '%。');
    }
    hint.textContent = hint2;
  }

  /* 星空槽满槽占位结算面板（2026-10-13）。
   * 复用现有 #modal 浮层；无 modal 元素时直接 no-op（shellbar 已完成态仍会显示「★ 太空时代达成」）。 */
  function showStarComplete(s) {
    var modal = el('modal'), box = el('modalBox'); if (!modal || !box) return;
    resetModalChrome();
    var cap = SB.challenges && SB.challenges.starCap ? SB.challenges.starCap(s) : (SB.CFG.STAR_CAP || 0);
    var cur = (s && s.res && s.res.starExplore) || 0;
    var progress = tr('ui.shell.star_exploration.complete_modal.progress', {
      currentProgress: Math.round(cur).toLocaleString(), progressCap: cap.toLocaleString()
    }, '星空探索已满（{currentProgress} / {progressCap}）。');
    box.innerHTML = '<div class="star-complete-panel">'
      + '<h2>' + htmlText(tr('ui.shell.star_exploration.complete_modal.title', null, '★ 太空时代达成')) + '</h2>'
      + '<p>' + htmlText(progress) + '</p>'
      /* 2026-10-28 用户要求删掉「终局奖励与后续内容将在后续更新中开放」这一句：
       * 后半句把「后续内容」当卖点摆给玩家，等于在终局界面承认内容没做完；
       * 留着前半句（越过天壳、望向群星）就够收尾，不解释、不承诺。 */
      + '<p class="muted">' + htmlText(tr('ui.shell.star_exploration.complete_modal.note', null, '你的文明已越过天壳，望向群星。')) + '</p>'
      + '<div class="break-controls"><button class="btn big" type="button" id="starCompleteClose">' + htmlText(tr('ui.action.keep_playing', null, '继续游玩')) + '</button></div>'
      + '</div>';
    modal.classList.remove('hidden'); bodyModalClass(true);
    var btn = el('starCompleteClose');
    if (btn) btn.onclick = hideModal;
  }

  function showChallengeCompletePanel(outcome) {
    var modal = el('modal'), box = el('modalBox');
    if (!modal || !box || !outcome) return false;
    resetModalChrome();
    function escHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>\"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[ch];
      });
    }
    /* 2026-11-03：标题原先写死「流浪泰拉」，但 challenges.award() 对**任何** goal 型挑战都会
     * 挂 meta.challengePopupPending ⇒《水体污染》通关也弹「★ 流浪泰拉 · 挑战完成」，
     * 奖励与日志却是它自己的（账本没错、面板撒谎）。现在一律读 outcome：
     * award() 给的 name / label / goalText / reward 本来就是按定义取的。 */
    /* 设置栏「回看演出」走同一个面板，但**不能**说「永久奖励已生效」——那次是重播，
     * 一分钱都没发（同上一条注释的同一个坑：面板说的话必须是这次真的发生的事）。 */
    var isReview = outcome.review === true;
    var titleKey = isReview ? 'ui.challenge.completion.review.title' : 'ui.challenge.completion.title';
    var title = escHtml(tr(titleKey, { challengeName: outcome.name || '' }, '★ {challengeName} · 挑战完成'));
    var goal = escHtml(outcome.goalText || tr('ui.challenge.completion.status', null, '挑战完成'));
    box.innerHTML = '<div class="star-complete-panel challenge-complete-panel">' +
      '<h2>' + title + '</h2>' +
      '<p>' + goal + '</p>' +
      (isReview
        ? '<p class="muted">' + escHtml(tr('ui.challenge.completion.review_note', null, '这是通关演出的回放，不影响任何进度与奖励。')) + '</p>'
        : '<p class="muted">' + escHtml(tr('ui.challenge.completion.reward_notice', { rewardDescription: outcome.reward || '' }, '永久奖励已生效：{rewardDescription}。本局仍可继续发展。')) + '</p>') +
      '<div class="break-controls"><button class="btn big" type="button" id="challengeCompleteClose">' + htmlText(tr('ui.action.keep_playing', null, '继续游玩')) + '</button></div>' +
      '</div>';
    modal.classList.remove('hidden'); bodyModalClass(true);
    var btn = el('challengeCompleteClose');
    if (btn) btn.onclick = hideModal;
    return true;
  }

  /* 流浪泰拉达标后播放四段分镜：点火特写 → 炉芯满载 → 地表发动机群 → 深空远景。
   * ⚠️ 这四张图和四条字幕是**《流浪泰拉》专属素材**（行星发动机点火），2026-11-03 起加门控：
   *   `outcome.id !== 'drift_terra'` 直接出结算面板。在这之前任何 goal 型挑战通关都会播完
   *   泰拉发动机，再在结束卡上写「流浪泰拉 · 星际远航」—— 水体污染通关时整段张冠李戴。 */
  function showChallengeComplete(outcome) {
    var modal = el('modal'), box = el('modalBox');
    if (!modal || !box || !outcome) return false;
    if (outcome.id !== 'drift_terra') return showChallengeCompletePanel(outcome);
    /* 系统减弱动效偏好：默认让位（直接出静态面板）。但 `review` 是玩家在设置里**主动点**
     * 「回看演出」——他要的就是这段动画，这里再静音等于按钮骗人；四段切换本来就是 JS 定时
     * 换图，CSS 动效被系统关掉也仍是一场完整的分镜放映。 */
    if (prefersReducedMotion() && outcome.review !== true) return showChallengeCompletePanel(outcome);
    clearBreakAnimation();
    clearDysonAnimation();
    var phases = ['impact', 'core', 'gaze', 'departure'];
    var frameFiles = ['frame-01-ignition.webp', 'frame-02-v2.webp', 'frame-03-v2.webp', 'frame-04-v2.webp'];
    var phasePrefix = 'ui.finale.drift_terra.';
    var names = phases.map(function (phase) { return tr(phasePrefix + 'phase.' + phase); });
    var alts = phases.map(function (phase) { return tr(phasePrefix + 'alt.' + phase); });
    var captions = phases.map(function (phase) {
      var prefix = phasePrefix + 'caption.' + phase + '.';
      return '<small>' + htmlText(tr(prefix + 'label')) + '</small><h2>' +
        htmlText(tr(prefix + 'heading')) + '</h2><p>' + htmlText(tr(prefix + 'body')) + '</p>';
    });
    var framesHtml = '', captionsHtml = '';
    for (var i = 0; i < phases.length; i++) {
      framesHtml += '<img class="break-frame-' + phases[i] + '" src="assets/backgrounds/sequence/era-10/drift-terra/' + frameFiles[i] + '" alt="' + htmlText(alts[i]) + '">';
      captionsHtml += '<div class="break-caption-text break-cap-' + phases[i] + '">' + captions[i] + '</div>';
    }
    box.innerHTML =
      '<section class="break-showcase drift-terra-showcase" aria-label="' + htmlText(tr(phasePrefix + 'aria_label')) + '">' +
        '<div class="break-stage" id="terraStage" data-phase="impact">' +
          '<div class="break-scene">' + framesHtml + '</div>' +
          '<div class="terra-ignition" aria-hidden="true"></div>' +
          '<div class="break-hud"><span class="break-phase"><b>✦</b><span id="terraPhaseName">' + names[0] + '</span></span><span id="terraCounter">01 / 04</span></div>' +
          '<div class="break-caption" aria-live="polite">' + captionsHtml + '</div>' +
          '<div class="break-end-card"><small>' + htmlText(tr(outcome.review === true ? 'ui.challenge.completion.replay_label' : 'ui.challenge.completion.status')) + '</small><strong>' + htmlText(tr(phasePrefix + 'end_card.title')) + '</strong></div>' +
          '<div class="terra-progress" aria-hidden="true"><span></span></div>' +
        '</div>' +
        '<div class="break-controls"><button class="btn" id="terraReplay" type="button">' + htmlText(tr('ui.action.replay', null, '↻ 重播')) + '</button><button class="btn big" id="terraContinue" type="button">' + htmlText(tr('ui.action.skip_animation', null, '跳过动画')) + '</button></div>' +
      '</section>';
    resetModalChrome();
    modal.classList.add('break-modal', 'terra-ending-modal');
    modal.classList.remove('hidden');
    bodyModalClass(true);
    var stage = el('terraStage'), phaseName = el('terraPhaseName'), counter = el('terraCounter');
    var replay = el('terraReplay'), continueBtn = el('terraContinue');
    var times = [0, 2600, 5200, 7900];
    function setStep(index) {
      stage.dataset.phase = phases[index];
      if (phaseName) phaseName.textContent = names[index];
      if (counter) counter.textContent = '0' + (index + 1) + ' / 04';
      if (continueBtn && index === phases.length - 1) continueBtn.textContent = tr(outcome.review === true ? 'ui.action.finish_replay' : 'ui.action.view_ending', null, outcome.review === true ? '结束回顾' : '查看结局');
    }
    function play() {
      clearDysonAnimation();
      /* 重播时先撤销动画类，再强制一次布局，让第一幕的镜头运动也从头开始。 */
      stage.classList.remove('terra-animate');
      if (stage.offsetWidth) stage.offsetWidth;
      stage.classList.add('terra-animate');
      setStep(0);
      if (continueBtn) continueBtn.textContent = tr('ui.action.skip_animation', null, '跳过动画');
      for (var j = 1; j < phases.length; j++) {
        (function (index) { _dysonAnimationTimers.push(setTimeout(function () { setStep(index); }, times[index])); })(j);
      }
    }
    if (replay) replay.onclick = play;
    if (continueBtn) continueBtn.onclick = function () {
      clearDysonAnimation();
      showChallengeCompletePanel(outcome);
    };
    play();
    return true;
  }

  /* ── 设置栏「通关演出回看」（2026-11-03 用户要求：想再看可以反复播放）────────────
   * 起因：重复挑战（replay）通关时刻意不弹庆祝面板（challenges.award 的 replay 分支不写
   * meta.challengePopupPending），于是第二次通关的玩家再也看不到这段演出。
   * 与其改判定去重播，不如给一个**主动**入口：看过就通关过，随时回看。
   *
   * ⚠️ 三条纪律：
   *   ① 入口只在真的通关过《流浪泰拉》之后出现（`canReplayTerra`）—— 否则等于把终局演出
   *      当预告片剧透，还会和挑战页的「未挑战」状态自相矛盾。
   *   ② 回看用的是本地造的 outcome，`review: true`：**不碰账本**（不写 challengePopupPending、
   *      不调 challenges.award、不提交排行榜），面板与结束卡也据此换成「回放」口径。
   *   ③ 所有 DOM 访问都先判存在 —— e2e 的假 document 没有 querySelector / addEventListener。 */
  function canReplayTerra(m) {
    var meta = m || (SB.game && SB.game.meta ? SB.game.meta() : null);
    var c = meta && meta.challenges && meta.challenges.completed;
    return !!(c && c.drift_terra === true);
  }
  function terraReviewOutcome() {
    var d = SB.challenges && SB.challenges.byId ? SB.challenges.byId('drift_terra') : null;
    return {
      id: 'drift_terra',
      name: (d && d.name) || '流浪泰拉',
      label: (d && d.tiers && d.tiers[0] && d.tiers[0].label) || '星际远航',
      reward: null,
      goalText: (d && d.goalText) || '建成 50 座行星发动机，并把星核炉芯池灌满 50M 热液能',
      review: true
    };
  }
  function replayTerraSequence() {
    if (!canReplayTerra()) return false;
    /* 先收起设置浮层：它贴在顶栏下方，会把演出遮掉一块（modal 是 fixed 全屏遮罩）。 */
    var det = root.document && root.document.querySelector ? root.document.querySelector('details.ui-settings') : null;
    if (det) det.open = false;
    return showChallengeComplete(terraReviewOutcome());
  }
  /* 显隐：通关后设置里才出现「回看」这一块。
   * 只在 boot 与设置浮层展开时各同步一次 —— 面板是静态 HTML，不做每帧重算。 */
  function syncTerraReplayRow() {
    var block = el('terraReplayBlock');
    if (!block) return;
    var on = canReplayTerra();
    if (block.hidden !== !on) block.hidden = !on;
  }
  function bindSettingsExtras() {
    var btn = el('btnReplayTerra');
    if (btn) btn.onclick = replayTerraSequence;
    var det = root.document && root.document.querySelector ? root.document.querySelector('details.ui-settings') : null;
    if (det && det.addEventListener && !det._terraReplayBound) {
      det._terraReplayBound = true;
      det.addEventListener('toggle', syncTerraReplayRow);
    }
    syncTerraReplayRow();
  }

  /* ERA10（2026-10-20 · 用户 ERA10 表「绝热材料」解锁2 / 用户拍 Q2）：戴森球通关演出与弹窗。
   * 镜像星空槽满槽先例（showStarComplete）：复用 #modal 浮层；无 modal 元素时 no-op
   * （dysonDone 已置位，星图戴森面板仍会显示竣工态，不丢信息）。
   * 两个出口（用户原话「就和破壳一样，弹窗，可以轮回也可以继攒轮回和星屑」）：
   *   ① 立即轮回 ⇒ 调 SB.game.askReset()（顶栏重置钮同一条生产路径：确认面板 + 结算
   *      预览 + prestige.doBreak 分流，轮回点/星屑按现有公式入账）；
   *   ② 继续游玩 ⇒ 关弹窗接着攒（dysonPopupSeen 已置位，不再重播）。 */
  function showDysonComplete(s) { showDysonEnding(s, false); }

  function showDysonCompletePanel(s) {
    var modal = el('modal'), box = el('modalBox'); if (!modal || !box) return;
    resetModalChrome();
    var sails = (s && s.sunSails) || 0, nodes = (s && s.dysonNodes) || 0;
    /* ⚠️ 分母必须走 challenges.dysonSailCap / dysonNodeCap（本局档位快照），不可退回
     * CFG.DYSON_*_CAP：本面板在 4 段分镜结束后才渲染，此时 challengeDone 已是 true、
     * 限制已撤，但「五倍永恒」这一局的目标仍是 50,000 / 5,000（2026-11-09 面板撒谎修复）。 */
    var sailCap = SB.challenges && SB.challenges.dysonSailCap ? SB.challenges.dysonSailCap(s) : (SB.CFG.DYSON_SAIL_CAP || 10000);
    var nodeCap = SB.challenges && SB.challenges.dysonNodeCap ? SB.challenges.dysonNodeCap(s) : (SB.CFG.DYSON_NODE_CAP || 1000);
    box.innerHTML = '<div class="dyson-complete-panel">'
      + '<h2>' + htmlText(tr('ui.dyson.completion.title', null, '★ 戴森球竣工')) + '</h2>'
      + '<p>' + htmlText(tr('ui.dyson.completion.targets', {
        currentSails: sails.toLocaleString(), sailCap: sailCap.toLocaleString(),
        currentNodes: nodes.toLocaleString(), nodeCap: nodeCap.toLocaleString()
      }, '太阳帆 {currentSails} / {sailCap} ＋ 戴森球节点 {currentNodes} / {nodeCap} —— 双项均已达标。')) + '</p>'
      + '<p class="muted">' + htmlText(tr('ui.dyson.completion.flavor', null, '母星戴上了一圈星环，文明的火光第一次以恒星计量。')) + ' '
      + htmlText(tr('ui.dyson.completion.next_steps', null, '你可以立刻轮回结算（轮回点与星屑按现有公式入账），也可以继续留在这一局，攒取更多的轮回点与星屑。')) + '</p>'
      + '<div class="break-controls">'
      + '<button class="btn big" type="button" id="dysonBreakNow">' + htmlText(tr('ui.dyson.completion.prestige_action', null, '繁星轮回（结算）')) + '</button>'
      + '<button class="btn" type="button" id="dysonKeepPlaying">' + htmlText(tr('ui.action.keep_playing', null, '继续游玩')) + '</button>'
      + '</div></div>';
    modal.classList.remove('hidden'); bodyModalClass(true);
    var b1 = el('dysonBreakNow');
    if (b1) b1.onclick = function () {
      hideModal();
      if (SB.game && SB.game.askReset) SB.game.askReset();
    };
    var b2 = el('dysonKeepPlaying');
    if (b2) b2.onclick = hideModal;
  }

  /* ══ ERA10 市政《飞升虚境》（2026-10-20 用户规格 · 实装）══════════════
   * 用户表原文：「没什么效果，就是在戴森球建设完成后触发飞升虚境的特殊结局，
   *   但是游戏里要用乱码来展示」。用户拍板乱码风格 = **怪异符号叠加**（Zalgo 式）。
   *
   * 【为什么用「确定性腐蚀」而不是 Math.random】
   *   pane 每 2 秒重绘、弹窗也可能被重开；随机腐蚀会让同一段文字每次都不一样
   *   （画面抖动 + 玩家无法复述 + e2e 无法断言）。这里用「字符码 × 序号」的哈希选层数，
   *   同一份文案永远腐蚀成同一个样子。
   *
   * 【为什么只叠组合变音符、不替换成方块】
   *   用户选的是「怪异符号叠加」：字仍可辨，但视觉上像被什么从背后侵蚀。
   *   可读性保留到「能认出这是中文，但读不懂」的程度——这正是这个结局要的观感。
   *   ⚠️ 只用 U+0300–U+036F 的组合附加符，不引入 RTL/零宽字符：后者会把
   *      整行排版搞乱（零宽空格会让复制出来的文本不可见地断词）。 */
  /* 乱码字符集：西文用组合符，汉字沿用虚境风味文案中的半角片假名、盲文和迭代符。
   * ⚠️ 中文字体（Microsoft YaHei 等）**不含** U+0300–U+036F 组合变音符、也不含 U+20DD–U+20E4
   *    组合封闭符：叠在汉字上会被渲染成 tofu 方块（□），既不像乱码、又把正文顶得七零八落。
   *    组合符必须与基字**同一字体**才生效 ⇒ 追加 font-family 回退（Segoe UI Symbol 等）**救不了**，
   *    实测 A（纯中文）/ B（中文+组合符）/ C（拉丁+组合符）/ F（加回退）四行对照已确认。
   * ⇒ 拉丁、数字、半角符号走 VOID_MARKS；汉字/全角走 VOID_GLYPHS。
   *    VOID_GLYPHS 选取游戏现有虚境风味句已使用的符号，保持同一套视觉语言。
   * 两套都**确定性**（纯 charCode 运算、零 Math.random）：重绘不抖，e2e 可断言。 */
  var VOID_MARKS = ['\u0338', '\u0336', '\u0334', '\u0308\u0334', '\u0301\u0338', '\u0337\u0338'];
  var VOID_GLYPHS = ['\u309e', '\u2801', '\uff9f', '\u286b', '\uff66', '\u309d', '\u30fe', '\u2573',
    '\uff8a', '\uff9e', '\u2809', '\u2839'];
  function voidCorrupt(text, seed, intensity) {
    var out = '', i, ch, cc, h, k, S;
    intensity = intensity == null ? 1 : Math.max(0, Math.min(1, intensity));
    for (i = 0; i < text.length; i++) {
      ch = text.charAt(i);
      out += ch;
      cc = ch.charCodeAt(0);
      if (cc === 32 || cc === 10 || cc === 0x3000) continue;
      if (intensity <= 0) continue;
      h = (cc * 31 + (seed | 0) * 17 + i * 7) % 100;
      if (cc < 0x2e80) {
        /* 拉丁/数字：组合符真叠加（0~3 个） */
        if (h < 38 * intensity) out += VOID_MARKS[h % VOID_MARKS.length];
        else if (h < 66 * intensity) out += VOID_MARKS[(h + 1) % VOID_MARKS.length] + VOID_MARKS[(h + 3) % VOID_MARKS.length];
        else if (h < 78 * intensity) {
          for (k = 0; k < 3; k++) out += VOID_MARKS[(h + k * 2) % VOID_MARKS.length];
        }
      } else {
        /* 汉字/全角：追加怪异符号（0~2 个），密度略低于拉丁以控制行宽 */
        S = VOID_GLYPHS;
        if (h >= 100 - 66 * intensity) {
          out += S[(cc + seed * 11 + h) % S.length];
          if (h >= 100 - 22 * intensity) out += S[(cc + h * 3 + seed * 5) % S.length];
        }
      }
    }
    return out;
  }
  function showAscendVoid(s) { showDysonEnding(s, true); }

  function showAscendVoidPanel(s) {
    var modal = el('modal'), box = el('modalBox'); if (!modal || !box) return;
    resetModalChrome();
    var C = voidCorrupt;
    function vergePanelText(key, fallback) { return tr('ui.verge.ending.panel.' + key, null, fallback); }
    box.innerHTML = '<div class="void-ascend-panel">'
      + '<h2 class="void-title">' + C(tr('ui.render.show_dyson_ending.ascension_to_the_verge_a_new_universe', null, '飞升虚境'), 3) + '</h2>'
      + '<p class="void-line">' + C(vergePanelText('line.1', '戴森球的最后一圈光，照亮了裂隙。'), 7) + '</p>'
      + '<p class="void-line">' + C(vergePanelText('line.2', '旧宇宙正在身后崩解。'), 11) + '</p>'
      + '<p class="void-line void-garbled">' + C(vergePanelText('line.3', '另一重现实，正在展开。'), 13) + '</p>'
      + '<p class="void-line">' + C(vergePanelText('line.4', '我们不再是「我们」。'), 17) + '</p>'
      + '<p class="void-note">' + C(vergePanelText('note', '（这一局到此为止。你可以轮回结算，也可以留在这里看着它继续。'), 19) + '</p>'
      + '<div class="break-controls">'
      + '<button class="btn big" type="button" id="voidBreakNow">' + C(tr('ui.action.prestige', null, '轮回'), 23) + '</button>'
      + '<button class="btn" type="button" id="voidKeepPlaying">' + C(tr('ui.action.keep_playing', null, '继续游玩'), 29) + '</button>'
      + '</div></div>';
    /* 归一化在上面的 resetModalChrome 里做完了（void-civic-modal 等全部清掉），这里只补自己那个。 */
    modal.classList.add('void-ending-modal');
    modal.classList.remove('hidden'); bodyModalClass(true);
    var b1 = el('voidBreakNow');
    if (b1) b1.onclick = function () {
      hideModal();
      if (SB.game && SB.game.askReset) SB.game.askReset();
    };
    var b2 = el('voidKeepPlaying');
    if (b2) b2.onclick = hideModal;
  }

  function clearDysonAnimation() {
    for (var i = 0; i < _dysonAnimationTimers.length; i++) clearTimeout(_dysonAnimationTimers[i]);
    _dysonAnimationTimers = [];
  }

  /* ERA10 终局：普通戴森球与《飞升虚境》各有四段分镜，共用播放控件和结局出口。 */
  function showDysonEnding(s, ascendVoid) {
    var modal = el('modal'), box = el('modalBox');
    var phaseTypes = ['intro', 'impact', 'gaze', 'ending'];
    var fileNames = ['frame-01.webp', 'frame-02.webp', 'frame-03.webp', 'frame-04.webp'];
    var times = [0, 1500, 3200, 4900];
    var vergePrefix = 'ui.finale.verge.';
    var dysonPrefix = 'ui.render.show_dyson_ending.';
    var story;
    if (ascendVoid) {
      story = {
        aria: tr(vergePrefix + 'aria_label'),
        root: 'assets/backgrounds/sequence/era-10/ascend-void',
        phases: ['intro', 'impact', 'gaze', 'ending'].map(function (phase) { return tr(vergePrefix + 'phase.' + phase); }),
        alts: ['intro', 'impact', 'gaze', 'ending'].map(function (phase) { return tr(vergePrefix + 'alt.' + phase); }),
        captions: [
          { small: tr(vergePrefix + 'caption.1.label'), title: tr(vergePrefix + 'caption.1.heading'), body: tr(vergePrefix + 'caption.1.body') },
          { small: tr(dysonPrefix + 'old_universe_event_horizon_forms'), title: tr(dysonPrefix + 'everything_is_falling_toward_the_horizon'), body: tr(dysonPrefix + 'the_star_ring_fleet_and_homeworld_are') },
          { small: tr(dysonPrefix + 'the_great_evacuation_old_reality_unravels'), title: tr(dysonPrefix + 'leave_the_old_world_behind'), body: tr(dysonPrefix + 'beyond_the_rift_a_universe_not_yet') },
          { small: tr(dysonPrefix + 'ascension_to_the_verge_a_new_universe'), title: tr(dysonPrefix + 'the_old_realm_is_gone_a_new'), body: tr(dysonPrefix + 'the_old_universe_fades_behind_us_we') }
        ],
        cardSmall: tr(dysonPrefix + 'reality_shift'),
        cardTitle: tr(dysonPrefix + 'ascension_to_the_verge_a_new_universe')
      };
    } else {
      story = {
        aria: tr(dysonPrefix + 'dyson_sphere_finale'),
        root: 'assets/backgrounds/sequence/era-10',
        phases: [
          tr(dysonPrefix + 'the_final_node'), tr(dysonPrefix + 'structure_complete'),
          tr(dysonPrefix + 'the_star_wears_its_ring'), tr(dysonPrefix + 'among_the_stars')
        ],
        alts: [
          tr(dysonPrefix + 'an_orbital_engineer_guides_the_final_dyson'),
          tr(dysonPrefix + 'the_final_orbital_structures_and_solar_sails'),
          tr(dysonPrefix + 'the_completed_dyson_sphere_lights_up_around'),
          tr(dysonPrefix + 'beyond_the_dyson_sphere_merfolk_look_toward')
        ],
        captions: [
          { small: tr(dysonPrefix + 'finale_dyson_sphere_project'), title: tr(dysonPrefix + 'the_final_node_sb_004798'), body: tr(dysonPrefix + 'a_star_will_become_civilization_s_new') },
          { small: tr(dysonPrefix + 'structure_complete_a_thousand_sails_in_orbit'), title: tr(dysonPrefix + 'a_thousand_sails_gathered_as_one'), body: tr(dysonPrefix + 'countless_lights_from_distant_voyages_weave_an') },
          { small: tr(dysonPrefix + 'dyson_sphere_complete'), title: tr(dysonPrefix + 'the_star_wears_its_ring'), body: tr(dysonPrefix + 'the_final_arc_closes_for_the_first') },
          { small: tr(dysonPrefix + 'a_new_era_for_civilization'), title: tr(dysonPrefix + 'among_the_stars_sb_004806'), body: tr(dysonPrefix + 'the_light_we_once_looked_up_to') }
        ],
        cardSmall: tr(dysonPrefix + 'stage_complete'),
        cardTitle: tr(dysonPrefix + 'the_dyson_sphere_project_beyond_the_stars')
      };
    }
    var framesHtml = '', captionsHtml = '', endCardSmall, endCardTitle, i;
    function showResult() {
      if (ascendVoid) showAscendVoidPanel(s);
      else showDysonCompletePanel(s);
    }
    if (!modal || !box || prefersReducedMotion()) {
      clearBreakAnimation();
      clearDysonAnimation();
      showResult();
      return;
    }
    clearBreakAnimation();
    clearDysonAnimation();
    for (i = 0; i < phaseTypes.length; i++) {
      framesHtml += '<img class="break-frame-' + phaseTypes[i] + '" src="' + story.root + '/' + fileNames[i] + '" alt="' + htmlText(story.alts[i]) + '">';
      if (ascendVoid) {
        var caption = story.captions[i];
        captionsHtml += '<div class="break-caption-text break-cap-' + phaseTypes[i] + '">'
          + '<small>' + htmlText(voidCorrupt(caption.small, 83 + i * 5, 1)) + '</small>'
          + '<h2>' + htmlText(voidCorrupt(caption.title, 97 + i * 7, 1)) + '</h2>'
          + '<p>' + htmlText(voidCorrupt(caption.body, 109 + i * 11, 1)) + '</p></div>';
      } else {
        var captionText = story.captions[i];
        captionsHtml += '<div class="break-caption-text break-cap-' + phaseTypes[i] + '">'
          + '<small>' + htmlText(captionText.small) + '</small><h2>' + htmlText(captionText.title) + '</h2><p>' + htmlText(captionText.body) + '</p></div>';
      }
    }
    endCardSmall = ascendVoid ? htmlText(voidCorrupt(story.cardSmall, 71, 1)) : htmlText(story.cardSmall);
    endCardTitle = ascendVoid ? htmlText(voidCorrupt(story.cardTitle, 73, 1)) : htmlText(story.cardTitle);
    box.innerHTML =
      '<section class="break-showcase' + (ascendVoid ? ' void-ascension-showcase' : '') + '" aria-label="' + htmlText(story.aria) + '">' +
        '<div class="break-stage" id="dysonStage" data-phase="intro">' +
          '<div class="break-scene">' + framesHtml + '</div>' +
          '<div class="break-hud"><span class="break-phase"><b>✦</b><span id="dysonPhaseName">' + htmlText(story.phases[0]) + '</span></span><span id="dysonCounter">01 / 04</span></div>' +
          '<div class="break-caption" aria-live="polite">' + captionsHtml + '</div>' +
        '<div class="break-end-card"><small>' + endCardSmall + '</small><strong>' + endCardTitle + '</strong></div>' +
        '</div>' +
        '<div class="break-controls"><button class="btn" id="dysonReplay" type="button">' + htmlText(tr('ui.action.replay', null, '↻ 重播')) + '</button><button class="btn big" id="dysonContinue" type="button">' + htmlText(tr('ui.action.skip_animation', null, '跳过动画')) + '</button></div>' +
      '</section>';
    resetModalChrome();
    if (ascendVoid) modal.classList.add('void-ending-modal');
    modal.classList.add('break-modal');
    modal.classList.remove('hidden');
    bodyModalClass(true);

    var stage = el('dysonStage'), phaseName = el('dysonPhaseName'), counter = el('dysonCounter');
    var replay = el('dysonReplay'), continueBtn = el('dysonContinue');
    var steps = [];
    for (i = 0; i < phaseTypes.length; i++) steps.push([phaseTypes[i], story.phases[i], '0' + (i + 1) + ' / 04', times[i]]);
    function setStep(step) {
      if (!stage) return;
      stage.dataset.phase = step[0];
      if (phaseName) phaseName.textContent = step[1];
      if (counter) counter.textContent = step[2];
      if (continueBtn && step[0] === 'ending') continueBtn.textContent = tr('ui.action.view_ending', null, '查看结局');
    }
    function finish() {
      clearDysonAnimation();
      showResult();
    }
    function play() {
      clearDysonAnimation();
      setStep(steps[0]);
      if (continueBtn) continueBtn.textContent = tr('ui.action.skip_animation', null, '跳过动画');
      for (var i = 1; i < steps.length; i++) {
        (function (step) { _dysonAnimationTimers.push(setTimeout(function () { setStep(step); }, step[3])); })(steps[i]);
      }
    }
    if (replay) replay.onclick = play;
    if (continueBtn) continueBtn.onclick = finish;
    play();
  }


  var researchParts = SB.ui.renderParts.research;
  var paneTech = researchParts.paneTech;
  var paneCivic = researchParts.paneCivic;
  var paneCivicGov = researchParts.paneCivicGov;
  var paneGovPicker = researchParts.paneGovPicker;
  /* 2026-10-27 点槽直接选卡：候选卡列表由 research 侧渲染，弹窗外壳在下面 openPolicyPicker。 */
  var panePolicyPicker = researchParts.panePolicyPicker;
  var paneCivicSlot = researchParts.paneCivicSlot;
  var civicNoticeState = researchParts.civicNoticeState;
  var setCivicView = researchParts.setCivicView;
  var techGoEra = researchParts.techGoEra;
  var civicGoEra = researchParts.civicGoEra;
  var armCard = researchParts.armCard;
  var disarmCard = researchParts.disarmCard;
  var getArmedCard = researchParts.getArmedCard;
  var cycleJobStep = researchParts.cycleJobStep;
  var getJobStep = researchParts.getJobStep;
  // 独立 pane 脚本注册的 live 实现；调度与公开测试入口共用同一函数。
  var paneMeta = SB.ui.renderParts.paneMeta;
  var paneVillage = SB.ui.renderParts.paneVillage;
  var paneFolk = SB.ui.renderParts.paneFolk;


  var metaShopView = 'rebirth';
  var PANES = { village: paneVillage, folk: paneFolk, tech: paneTech, civic: paneCivic,
    faith: SB.ui.renderParts.paneFaith, workshop: SB.ui.renderParts.paneWorkshop, wonder: SB.ui.renderParts.paneWonder,
    'star-map': SB.ui.renderParts.paneStarMap, meta: paneMetaHub,
    challenges: SB.ui.renderParts.paneChallenges,
    /* 2026-10-24：成就独立页签。与 challenges 同一个渲染部件文件、同一道门
     * （meta.shopUnlocked = 首次轮回），只是从页尾拆成了独立 pane。 */
    achievements: SB.ui.renderParts.paneAchievements,
    company: SB.ui.renderParts.paneCompany };

  function stardustShopOpen() {
    if (SB.game && SB.game.stardustShopUnlocked) return SB.game.stardustShopUnlocked();
    var s = res();
    return !!(s && s.lvl && s.lvl.satellite >= 1);
  }

  function setMetaShopView(view) {
    if (view !== 'rebirth' && view !== 'stardust') return false;
    var m = meta();
    if (view === 'rebirth' && !(m && m.shopUnlocked)) return false;
    if (view === 'stardust' && !stardustShopOpen()) return false;
    metaShopView = view;
    renderPanes();
    return true;
  }

  function paneMetaHub() {
    var m = meta();
    var rebirthOpen = !!(m && m.shopUnlocked);
    var starOpen = stardustShopOpen();
    if (!rebirthOpen && starOpen) metaShopView = 'stardust';
    if (metaShopView === 'stardust' && !starOpen) metaShopView = rebirthOpen ? 'rebirth' : '';
    if (metaShopView !== 'stardust' && !rebirthOpen && starOpen) metaShopView = 'stardust';
    var showStar = metaShopView === 'stardust' && starOpen;
    /* 2026-11-01 用户拍板 A 方案：轮回点页签**始终渲染**，未解锁时置灰（与星屑页签同一套
     * 未解锁态：is-locked + disabled + title）。原先是 `if (rebirthOpen)` 直接不渲染，
     * 于是「建了轨道卫星（ERA7）但还没完成《神学》做过合格轮回」的玩家进商店只看到
     * 孤零零一个星屑页签，连「还有一个商店在等你」这件事都无从得知。
     * ⚠️ 这里只改可见性，**门本身一个字没动**：meta.shopUnlocked 仍只由
     *    prestige.doBreak 的合格分支（!qualified 会提前 return，走不到置真那句）置位。 */
    var showRebirth = !showStar && rebirthOpen;
    var tabs = '';
    tabs +=
      '<button type="button" class="meta-shop-tab' + (showRebirth ? ' is-active' : '') + (!rebirthOpen ? ' is-locked' : '') +
      '" role="tab" aria-selected="' + showRebirth + '" aria-controls="meta-shop-panel"' +
      (rebirthOpen ? ' onclick="SB.ui.render.setMetaShopView(\'rebirth\')"' : ' disabled title="' + htmlText(tr('ui.render.pane_meta_hub.unlocks_after_researching_theology', null, '完成《神学》后开放')) + '"') + '>' +
      '<span class="meta-shop-tab-icon" aria-hidden="true">✧</span><span>' + htmlText(tr('ui.render.pane_meta_hub.prestige_points_shop', null, '轮回点商店')) + '</span>' +
      (!rebirthOpen ? '<small>' + htmlText(tr('ui.meta.shop.prestige.locked_hint', null, '完成《神学》并轮回后开放')) + '</small>' : '') + '</button>';
    if (starOpen || rebirthOpen) tabs +=
      '<button type="button" class="meta-shop-tab' + (showStar ? ' is-active' : '') + (!starOpen ? ' is-locked' : '') + '" role="tab" aria-selected="' + showStar + '" aria-controls="meta-shop-panel"' +
      (starOpen ? ' onclick="SB.ui.render.setMetaShopView(\'stardust\')"' : ' disabled title="' + htmlText(tr('ui.render.pane_meta_hub.permanently_unlocks_after_building_your_first_sa', null, '首建卫星后永久解锁')) + '"') + '>' +
      '<span class="meta-shop-tab-icon" aria-hidden="true">✦</span><span>' + htmlText(tr('ui.render.pane_meta_hub.stardust_shop', null, '星屑商店')) + '</span>' +
      (!starOpen ? '<small>' + htmlText(tr('ui.meta.shop.stardust.locked_hint', null, '建成首座轨道卫星后永久解锁')) + '</small>' : '') + '</button>';
    var h = '<nav class="meta-shop-tabs" role="tablist" aria-label="' + htmlText(tr('ui.render.pane_meta_hub.shop_categories', null, '商店分类')) + '">' + tabs + '</nav>' +
      '<div id="meta-shop-panel" class="meta-shop-panel" role="tabpanel">' + (showStar ? paneStarDome() : (rebirthOpen ? paneMeta() : '')) + '</div>';
    return h;
  }

  var STAR_TREE_ICON_BY_KEY = {
    shell: 'assets/resource-icons/thinafilm.png?v=2',
    civilization: 'assets/tech-icons/era-10/era10-heir-of-stars.png',
    enterprise: 'assets/company-icons/craftco.png',
    industry: 'assets/building-icons/era-10/era10-solar-ring-v2.png',
    frontier: 'assets/resource-icons/starExplore.png',
    automation: 'assets/tech-icons/era-8/era8-robotics.png'
  };
  var STAR_PERK_ICON_BY_ID = {
    starShellPress1: 'assets/resource-icons/thinafilm.png?v=2',
    starFolk1: 'assets/tech-icons/era-1/era1-cultivation.png',
    starInfinite: 'assets/resource-icons/stardust.png',
    starModuleHousing: 'assets/building-icons/era-5/era5-tenement.png',
    starFoldableStructure: 'assets/building-icons/era-8/era8-robotbay.png',
    starCompanyMaturity1: 'assets/company-icons/craftco.png',
    starCompanyResearchSynergy: 'assets/company-icons/scico.png',
    starSmelt1: 'assets/resource-icons/thetaMetal.png',
    starLaunchSpeed1: 'assets/building-icons/era-9/era9-europa-launch-v2.png',
    starNuclearHydro1: 'assets/building-icons/era-7/era7-fissionplant.png',
    starSailHydro1: 'assets/resource-icons/starExplore.png',
    starSolarRing1: 'assets/building-icons/era-10/era10-solar-ring-v2.png',
    starRingRocketEngineCraft: 'assets/resource-icons/rocketEngine.png',
    starRingThetaFilmCraft: 'assets/resource-icons/thinafilm.png',
    starRingStrongPropellantCraft: 'assets/resource-icons/strongProp.png',
    starExplore1: 'assets/resource-icons/starExplore.png',
    starExploreScholar1: 'assets/building-icons/era-7/era7-spacestation.png',
    starAlienOutput1: 'assets/building-icons/era-9/era9-mars-workshop.png',
    starTerraform1: 'assets/tech-icons/era-9/era9-terraform.png',
    earlyAutoBuildCore: 'assets/building-icons/era-1/era1-nest.png',
    earlyAutoBuildFood: 'assets/building-icons/era-1/era1-kelp.png',
    earlyAutoBuildWorkshop: 'assets/building-icons/era-1/era1-workshop.png',
    earlyAutoBuildTrade: 'assets/building-icons/era-4/era4-caravanserai.png',
    earlyAutoBuildAcademy: 'assets/building-icons/era-5/era5-school.png',
    earlyAutoBuildCivic: 'assets/building-icons/era-3/era3-civichall.svg',
    earlyAutoBuildFaith: 'assets/building-icons/era-2/era2-temple.png',
    earlyAutoBuildSpace: 'assets/building-icons/era-7/era7-satellite.png'
  };
  function starPerkIconSrc(perk) {
    if (STAR_PERK_ICON_BY_ID[perk.id]) return STAR_PERK_ICON_BY_ID[perk.id];
    if (/^starShellPress/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starShellPress1;
    if (/^starFolk/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starFolk1;
    if (/^starCompanyMaturity/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starCompanyMaturity1;
    if (/^starSmelt/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starSmelt1;
    if (/^starNuclearHydro/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starNuclearHydro1;
    if (/^starSailHydro/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starSailHydro1;
    if (/^starSolarRing/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starSolarRing1;
    if (/^starExplore[123]$/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starExplore1;
    if (/^starExploreScholar/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starExploreScholar1;
    if (/^starAlienOutput/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starAlienOutput1;
    if (/^starTerraform/.test(perk.id)) return STAR_PERK_ICON_BY_ID.starTerraform1;
    return '';
  }

  function starPerkLocaleKey(id, field) {
    var slug = String(id || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    return 'prestige.star_perk.' + slug + '.' + field;
  }
  function localizedStarPerk(perk, field) {
    if (!perk) return '';
    var source = field === 'name' ? perk.name : perk.desc;
    var key = starPerkLocaleKey(perk.id, field);
    var params = null;
    if (field === 'description') {
      var info = SB.ui && SB.ui.renderParts && SB.ui.renderParts.info;
      params = info && info.englishTemplateParams ? info.englishTemplateParams(key, source) : null;
    }
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value && !/\{[A-Za-z0-9_]+\}/.test(value) ? value : source;
  }

  /* 星屑商店：星屑结算、永久强化和轮回点兑换。 */
  function paneStarDome() {
    var s = res(); if (!s) return '';
    var m = meta();
    var sd = (m && (m.stardust || 0)) || 0;
    var starCap = SB.challenges && SB.challenges.starCap ? SB.challenges.starCap(s) : SB.CFG.STAR_CAP;
    var starPct = (starCap > 0) ? Math.min(1, ((s.res && s.res.starExplore) || 0) / starCap) : 0;
    var dysonPct = SB.economy.dysonPct(s);
    var facilityLvls = SB.prestige.stardustFacilityLevels(s);
    var nextGain = SB.prestige.stardustGain(s);
    var facilityNames = [];
    for (var fi = 0; fi < SB.BUILDINGS.length; fi++) {
      var fb = SB.BUILDINGS[fi], fl = (s.lvl && s.lvl[fb.id]) || 0;
      if (fb.stardustFacility && fl > 0) {
        var localizedFacility = SB.i18n && SB.i18n.buildingName ? SB.i18n.buildingName(fb.id, fb.name) : fb.name;
        facilityNames.push(localizedFacility + ' ' + fl);
      }
    }
    var starTrees = [
      { key: 'shell', icon: '◐', accent: '#a8b8f0', ids: ['starShellPress1', 'starShellPress2', 'starShellPress3'] },
      { key: 'civilization', icon: '✦', accent: '#b2a5ff', ids: ['starFolk1', 'starFolk2', 'starFolk3', 'starInfinite', 'starModuleHousing', 'starFoldableStructure'] },
      { key: 'enterprise', icon: '⌂', accent: '#d9b878', ids: ['starCompanyMaturity1', 'starCompanyMaturity2', 'starCompanyMaturity3', 'starCompanyResearchSynergy'] },
      { key: 'industry', icon: '⚙', accent: '#70d0d9', ids: ['starSmelt1', 'starSmelt2', 'starSmelt3', 'starLaunchSpeed1', 'starNuclearHydro1', 'starNuclearHydro2', 'starNuclearHydro3', 'starSailHydro1', 'starSailHydro2', 'starSolarRing1', 'starSolarRing2', 'starSolarRing3', 'starRingRocketEngineCraft', 'starRingThetaFilmCraft', 'starRingStrongPropellantCraft'] },
      { key: 'frontier', icon: '◎', accent: '#83d9ba', ids: ['starExplore1', 'starExplore2', 'starExplore3', 'starExploreScholar1', 'starExploreScholar2', 'starAlienOutput1', 'starAlienOutput2', 'starAlienOutput3', 'starTerraform1', 'starTerraform2'] },
      { key: 'automation', icon: '◈', accent: '#dfb879', ids: ['earlyAutoBuildCore', 'earlyAutoBuildFood', 'earlyAutoBuildWorkshop', 'earlyAutoBuildTrade', 'earlyAutoBuildAcademy', 'earlyAutoBuildCivic', 'earlyAutoBuildFaith', 'earlyAutoBuildSpace'] }
    ];
    for (var treeIndex = 0; treeIndex < starTrees.length; treeIndex++) {
      var starTree = starTrees[treeIndex], starTreeKey = 'ui.star_dome.tree.' + starTree.key + '.';
      starTree.title = tr(starTreeKey + 'title', null, starTree.key);
      starTree.subtitle = tr(starTreeKey + 'subtitle', null, '');
    }
    var litStarNodes = 0, starLevels = 0, totalStarNodes = SB.STAR_PERKS.length;
    for (var si = 0; si < SB.STAR_PERKS.length; si++) {
      var ownedStar = SB.prestige.starPerkState(SB.STAR_PERKS[si].id);
      if (ownedStar.lv > 0) litStarNodes++;
      starLevels += ownedStar.lv;
    }
    var exchangeParams = { prestigePointsPerExchange: 10, stardustPerExchange: 1 };
    var facilitySummary = tr('prestige.stardust.facility_yield.summary', {
      starProgress: Math.floor(starPct * 100),
      facilityList: facilityNames.length ? facilityNames.map(htmlText).join(englishLocale() ? ', ' : '、') : tr('ui.render.pane_star_dome.none_yet', null, '尚无')
    }, '星空进度 {starProgress}% · 计入设施：{facilityList}');
    var settlementFormula = tr('ui.stardust.settlement.formula', { facilityWeight: '0.1', dysonWeight: '50%' },
      '预计星屑 = floor(设施等级 × {facilityWeight} × (1 + 星空进度) × (1 + 戴森进度 × {dysonWeight}) × 已解锁加成)。戴森进度取太阳帆与戴森节点两者中的较低值；星间遗迹、先民遗产和「继承繁星之人」也会计入。');
    var h = '<div class="cardbody">' +
      '<div class="meta-overview"><div class="meta-balance"><span class="meta-balance-label"><img class="special-resource-icon" src="assets/resource-icons/stardust.png?v=2" alt="" aria-hidden="true" width="20" height="20">' + htmlText(tr('ui.render.pane_star_dome.stardust_balance', null, '星屑余额')) + '</span><strong>' + sd + '</strong><small>' + htmlText(tr('ui.render.pane_star_dome.earned_from_settlements', null, '累计结算获得')) + ' ' + ((m && m.stardustEarned) || 0) + '</small></div>' +
      '<div class="meta-stats"><div><span>' + htmlText(tr('ui.render.pane_star_dome.estimated_next_settlement', null, '下次结算预计')) + '</span><b>' + nextGain + ' ' + htmlText(tr('content.stardust.name', null, '星屑')) + '</b></div><div><span>' + htmlText(tr('ui.render.pane_star_dome.space_and_alien_facilities', null, '太空与异星设施')) + '</span><b>' + facilityLvls + ' ' + htmlText(tr('ui.render.pane_star_dome.ranks', null, '阶')) + '</b></div><div><span>' + htmlText(tr('ui.render.pane_star_dome.dyson_sphere_progress', null, '戴森球进度')) + '</span><b>' + Math.floor(dysonPct * 100) + '%</b></div></div></div>' +
      '<details class="star-yield-details"><summary>' + htmlText(tr('ui.render.pane_star_dome.stardust_settlement_details', null, '星屑结算档案')) + ' <span>' + htmlText(facilitySummary) + '</span></summary><p>' + htmlText(settlementFormula) + '</p></details>' +
      '<section class="meta-tree-intro star-tree-intro"><div><span class="meta-tree-kicker">' + htmlText(tr('ui.render.pane_star_dome.stardust_legacy_between_run_progression', null, 'STARDUST LEGACY · 局外成长')) + '</span>' +
      '<h2>' + htmlText(tr('ui.render.pane_star_dome.treasures_of_the_stars', null, '星之至宝')) + '</h2><p>' + htmlText(tr('ui.render.pane_star_dome.unlock_nodes_along_each_star_path_to', null, '沿前置星脉逐层点亮，永久强化后续周目；根节点可独立投资。')) + '</p></div>' +
      '<div class="meta-tree-progress"><span>' + htmlText(tr('ui.prestige.tree.progress.activated_nodes', null, '已点亮节点')) + '</span><b>' + litStarNodes + '<i> / ' + totalStarNodes + '</i></b>' +
      '<div class="meta-tree-progress-track"><i style="width:' + (totalStarNodes ? litStarNodes / totalStarNodes * 100 : 0) + '%"></i></div>' +
      '<small>' + htmlText(tr('ui.prestige.tree.total_upgrade_levels', { levelCount: starLevels }, '累计强化 {levelCount} 阶')) + '</small></div></section><div class="star-tree-grid">';
    function starPerkName(id) {
      for (var ni = 0; ni < SB.STAR_PERKS.length; ni++) if (SB.STAR_PERKS[ni].id === id) return localizedStarPerk(SB.STAR_PERKS[ni], 'name');
      return id;
    }
    for (var ti = 0; ti < starTrees.length; ti++) {
      var tree = starTrees[ti], starItems = [];
      for (var pi = 0; pi < SB.STAR_PERKS.length; pi++) {
        var candidate = SB.STAR_PERKS[pi];
        if (tree.ids.indexOf(candidate.id) >= 0) {
          starItems.push(candidate);
        }
      }
      var starNodes = [];
      for (var si2 = 0; si2 < starItems.length; si2++) {
        var sp = starItems[si2], ss = SB.prestige.starPerkState(sp.id);
        var starPrerequisites = ss.prerequisites || [];
        var starState = ss.done ? 'is-done' : ss.locked ? 'is-locked' : ss.afford ? 'is-ready' : 'is-growing';
        var starStatusKey = ss.done ? 'ui.render.star_perk_name.at_maximum' : ss.locked ? 'ui.prestige.talent.status.waiting_prerequisites' :
          ss.afford ? 'ui.render.star_perk_name.ready_to_unlock' : 'ui.render.star_perk_name.gather_stardust';
        var starStatusFallback = ss.done ? '已达上限' : ss.locked ? '等待前置' : ss.afford ? '可点亮' : '积攒星屑';
        var starStatus = tr(starStatusKey, null, starStatusFallback);
        var starName = localizedStarPerk(sp, 'name');
        var starCost = ss.done ? tr('ui.render.star_perk_name.at_maximum', null, '已达上限') :
          tr('prestige.star_perk.cost', { stardustCost: ss.next }, '✧ {stardustCost} 星屑');
        starNodes.push({
          id: sp.id, name: starName, desc: localizedStarPerk(sp, 'description'), layer: sp.layer,
          nests: starPrerequisites, nest: starPrerequisites[0] || '',
          nestName: starPrerequisites.map(starPerkName).join(englishLocale() ? ', ' : '、'), rank: ss.lv,
          rankText: ss.lv + '/' + (isFinite(ss.max) ? ss.max : '∞'),
          status: starStatus,
          cost: starCost,
          state: starState, disabled: ss.done || ss.locked || !ss.afford,
          glyph: tree.icon, iconSrc: starPerkIconSrc(sp), attr: 'data-star-perk="' + sp.id + '"', title: starName
        });
      }
      h += SB.ui.talentTreeMarkup({
        className: 'star-talent-tree star-tree-' + tree.key,
        scrollKey: 'star-' + tree.key,
        title: tree.title, subtitle: tree.subtitle, icon: tree.icon, iconSrc: STAR_TREE_ICON_BY_KEY[tree.key],
        accent: tree.accent, layout: 'layered', nodes: starNodes
      });
    }
    h += '</div><section class="meta-shop-group star-exchange-group"><div class="meta-section-title"><b>' + htmlText(tr('ui.render.star_perk_name.stardust_exchange', null, '星屑炼金')) + '</b><span>' + htmlText(tr('ui.render.star_perk_name.fixed_exchange_rate_both_ways_with_no', null, '双向固定汇率，无手续费')) + '</span></div><div class="meta-shop-grid">' +
      '<article class="meta-perk-card"><div class="meta-perk-copy"><div class="nm">' + htmlText(tr('ui.stardust.exchange.prestige_to_stardust', exchangeParams, '10 轮回点 → 1 星屑')) + '</div><div class="ds">' + htmlText(tr('ui.stardust.exchange.prestige_to_stardust.description', exchangeParams, '消耗 10 轮回点，兑换 1 星屑。')) + '</div></div><button class="btn buy meta-buy" data-star-exchange="tide-to-stardust"' + ((m.tide || 0) < 10 ? ' disabled' : '') + '>' + htmlText(tr('ui.render.star_perk_name.exchange', null, '兑换')) + '</button></article>' +
      '<article class="meta-perk-card"><div class="meta-perk-copy"><div class="nm">' + htmlText(tr('ui.stardust.exchange.stardust_to_prestige', { stardustPerExchange: 1, prestigePointsPerExchange: 10 }, '1 星屑 → 10 轮回点')) + '</div><div class="ds">' + htmlText(tr('ui.stardust.exchange.stardust_to_prestige.description', { stardustPerExchange: 1, prestigePointsPerExchange: 10 }, '消耗 1 星屑，兑换 10 轮回点。')) + '</div></div><button class="btn buy meta-buy" data-star-exchange="stardust-to-tide"' + (sd < 1 ? ' disabled' : '') + '>' + htmlText(tr('ui.render.star_perk_name.exchange', null, '兑换')) + '</button></article>' +
      '</div></section>' +
      '<div class="note meta-shop-note">' + htmlText(tr('ui.render.star_perk_name.stardust_is_granted_at_eligible_prestige_settlem', null, '星屑由合格轮回结算发放。强化与兑换后的余额均跨周目保留。')) + '</div>' +
      '</div>';
    return h;
  }

  /* ── pane 重写会换掉里面的元素，于是「活在 DOM 上的滚动位置」归零 ──
   * 唯一有内部滚动条的是科技长卷（横卷）：内部位置 = 玩家正在看哪个纪元。
   * 面板每重画一次就被拽回最左边一次 —— 这不是「渲染时机」的毛病，是**重建容器**的
   * 必然结果：scrollLeft 只存在 DOM 元素上，重写 innerHTML 就等于把它扔了。
   * 于是这里在重画前后把它接回去，并**在模块里记一份**（跨页签切换也要活下来）。
   * ⚠️ 该不该信任 DOM 上那个值，取决于「上一趟是**可见**状态下画的吗」（techShown）：
   *    · pane 隐藏时 scrollLeft 恒为 0，把它当成玩家的位置 ⇒ 切一趟页签回来就回到最左边；
   *    · 反过来，可见时读到的 0 是玩家自己拖回最左的，**必须尊重**，不许弹回旧位置。
   * ⚠️ 顺序是「先读后写」。曾经写成「先写回老元素再回读」（想顺手解决隐藏态那个 0），
   *    结果每一次重画都先拿旧的记住值把玩家刚滚出来的位置盖掉 ⇒ 位置永远停在 0。
   * ⚠️ 容器 id（techScroll）由 techTree 输出，两处必须同名 —— 改名而漏改这边不会报错，
   *    只会让「滑到一半被拽回左边」静默复发，所以 e2e 有一条断言盯着这个 id。
   * ⚠️ 新内容比旧的短时浏览器会自己把 scrollLeft 夹到上限，不需要在这里 clamp。 */
  var techScrollLeft = 0, techShown = false;
  /* 星图是 iframe 动画组件：记上一次写进 pane-star-map 的 HTML，只有内容真的变化
   * （未破壳的提示 ↔ 已破壳的星图）才重写，否则每 2 秒 PANE_REFRESH 会把 iframe 重载。 */
  var lastStarMapHTML = null;
  /* 轮回/星屑商店（pane-meta）：与 star-map 同构。内容（余额/节点状态/轮回联动徽标）在两次
   * PANE_REFRESH 之间几乎不变，但每 2 秒壁钟 + 任意交互置脏都会整块 innerHTML 重写 ⇒ 约 101 张
   * 天赋图标 (decoding="async") 反复重插入重解码 ⇒ 部分设备/浏览器白闪（"一闪一闪"）。
   * 记上一次 HTML，指纹没变就跳过重写，根治反复闪；买节点导致内容变化时才重写一次。 */
  var lastMetaHTML = null;
  /* 市政树（civicScroll）与科技长卷同一个病、同一副药（2026-09-28 用户报：
   * 「市政树界面和之前科技树界面一样，固定时间会被拉到最左边」）。
   * 机制一模一样：PANE_REFRESH 每 2 秒壁钟重画一次 renderPanes，innerHTML 一重写，
   * civicScroll 上的 scrollLeft 就归零一次 —— 玩家拖到半路被定期拽回最左。
   * 修复与 tech 完全同构：重画前先读、重画后写回、模块里记一份（跨页签切换也活）。
   * ⚠️ 隐藏态的读数恒 0，不能当成玩家的位置（civicShown 与 techShown 同一个道理）：
   *    可见时读到的 0 是玩家自己拖回去的，必须尊重。
   * ⚠️ 两张卷各记各的，**不合并成一个通用函数**：shown 判定各查各的容器，
   *    合并会把「一张藏一张露」的中间态搅在一起（那正是这两个 flag 存在的理由）。 */
  var civicScrollLeft = 0, civicShown = false;
  var civicJumpTo = null, civicJumpDone = false;
  function scheduleCivicJumpTo(px) { civicJumpTo = px; }

  /* 轮回/星屑天赋树（都在 pane-meta 之内，每棵一个 `.talent-map-scroll`）同一个病、同一副药：
   * PANE_REFRESH 每 2 秒把 pane-meta 整块重写一次 ⇒ 每棵树的横向滚动容器被换成新元素
   * ⇒ scrollLeft 归零 ⇒ 玩家拖到半路被定期拽回最左。与 tech/civic 卷同构：重画前按
   * 稳定键（treeMarkup 输出的 data-talent-scroll：`meta-<组键>` / `star-<树键>`，由各树
   * 稳定派生、不随内容变化）把各树位置记进模块（跨页签切换也活），重画后写回。
   * ⚠️ 隐藏态（pane-meta 带 .hidden）读数恒为 0，不能当成玩家位置 ⇒ 只信可见态。
   * ⚠️ e2e 假 DOM 的 mkEl 没有 querySelectorAll（见 sim/e2e.mjs:76），必须 typeof 判存在再调，
   *    否则 boot 期 renderPanes 直接抛错、整份 e2e 在第 ~200 行断掉（与本次改动无关，极易误判回退）。 */
  var talentScroll = Object.create(null);
  function snapshotTalentScroll() {
    var node = el('pane-meta');
    if (!node || (node.classList && node.classList.contains && node.classList.contains('hidden'))) return;
    if (typeof node.querySelectorAll !== 'function') return;
    var scrolls = node.querySelectorAll('.talent-map-scroll');
    for (var i = 0; i < scrolls.length; i++) {
      var key = scrolls[i].getAttribute && scrolls[i].getAttribute('data-talent-scroll');
      if (key) talentScroll[key] = scrolls[i].scrollLeft || 0;
    }
  }
  function restoreTalentScroll() {
    var node = el('pane-meta');
    if (!node || (node.classList && node.classList.contains && node.classList.contains('hidden'))) return;
    if (typeof node.querySelectorAll !== 'function') return;
    var scrolls = node.querySelectorAll('.talent-map-scroll');
    for (var i = 0; i < scrolls.length; i++) {
      var key = scrolls[i].getAttribute && scrolls[i].getAttribute('data-talent-scroll');
      if (key && talentScroll[key] != null) {
        scrolls[i].scrollLeft = talentScroll[key];
        talentScroll[key] = scrolls[i].scrollLeft || 0;
      }
    }
  }
  /* 纪元导航（render 侧的状态）：
   *   techViewEra —— 详情卡正在讲哪个纪元。0 = 跟随当前纪元（默认）。
   *                 ⚠️ 存 0 而不是存「当前纪元 id」，是为了让「纪元推进了」自动跟着走：
   *                 存 id 的话玩家升到纪元四时，详情还停在纪元三，看起来像卡住了。
   *   techJumpTo  —— 待落地的横向目标（点纪元按钮时设）。**不立刻去滚**：那具滚动容器
   *                 马上要被重画换掉，滚它等于白滚；统一由 renderPanes 在写完之后落一次。
   *   techJumpDone—— 首次显形定位只做一次（见下面那段注释）。 */
  var techJumpTo = null, techJumpDone = false;
  function scheduleTechJumpTo(px) { techJumpTo = px; }

  function renderPanes() {
    /* 科技 tab 的灰态随开门那一刻翻转，所以每次画面板都同步一次（5 个节点，很便宜）。
     * 放在这里而不是只在 initTabs 做一次：开门是由建造动作触发的，那时 initTabs 早跑完了。 */
    syncTabLocks();
    syncTabResearchDots();
    var tech = el('pane-tech');
    var shown = !tech || !tech.classList || !tech.classList.contains('hidden');

    /* 首次显形时把长卷定位到**当前纪元**，只做一次。
     * 玩家在纪元四点开这页，第一眼该是他在做的那一段，而不是早已过去的纪元一。
     * ⚠️ 必须一次性：做成「每次显形都定位」就等于每趟切页签都把玩家拖走 ——
     *    那正是用户报过的「每隔一段时间被拉回最左边」。 */
    if (shown && !techShown && !techJumpDone) {
      techJumpDone = true;
      var ss = res();
      if (ss && (ss.era || 1) > 1) techJumpTo = SB.tech.eraAnchorX(ss.era);
    }

    var box = el('techScroll'), jumped = false;
    if (techJumpTo != null) { techScrollLeft = techJumpTo; techJumpTo = null; jumped = true; }
    else if (box && shown && techShown) techScrollLeft = box.scrollLeft || 0;

    /* 市政树同一套「先读」：只在本 pane **可见且上一趟也可见**时信任 DOM 读数。 */
    var cNode = el('pane-civic');
    var cShown = !cNode || !cNode.classList || !cNode.classList.contains('hidden');
    var cbox = el('civicScroll');
    if (cbox && cShown && civicShown) civicScrollLeft = cbox.scrollLeft || 0;

    /* 天赋树卷：先按可见态快照各树横向位置（详见上方注释）。 */
    snapshotTalentScroll();

    /* ⚠️ 2026-10-27 真机定位（iOS 16 / 390×844）：整块 innerHTML 替换会让页面总高在**中间态**
     *   瞬间变小（旧节点已移除、新节点未插入），此刻处于页面底部的 scrollTop 会被立刻钳死；
     *   新节点插回后总高恢复，但 scrollTop 不会自己回来。
     *   自测包实测：滚到底 1962（上限 2059）→ 3 秒后 1059，弹回 903px；同一时刻
     *   village 的 docH 在 700ms 内变了 9px，而其余 pane 全稳。
     *   页面中部完全不受影响（①静止 1000、②连续滚动全绿），**只有贴底才中招**——这与
     *   客户「滚到最底会弹回去」完全一致。
     *   所以在重写前后各取一次滚动位置：同一次同步任务内如果没有玩家操作，scrollY 变了就
     *   只可能是被钳，直接写回即可。 */
    var _se = document.scrollingElement || document.documentElement;
    var _sy = _se ? _se.scrollTop : 0;

    /* ⚠️ 2026-10-27 真机定位（iOS 16）：**重绘前先放掉 button 的焦点**。
     *   客户原话：「族民大部分时候正常，往下太多的话会回到农民在最上面的位置」——
     *   不是随机回弹，是精确对准某个元素。机制：iOS 上点过的 <button> 会保持 focus，
     *   而 #pane-folk 是**整卡重写**（连卡片标题一起换），按钮节点被销毁后 WebKit 会把
     *   滚动位置拉回焦点元素最后所在处；滚得浅时那一行还在视口内，看不出；滚深了就被拽回去。
     *   只放掉 BUTTON：input/textarea 的焦点绝不能动 —— 信仰/聚落命名框每敲一个字都要跨重绘保焦点。
     *   （blur 不带参数 = 不移交焦点，不会触发额外的滚动。） */
    var _ae = document.activeElement;
    if (_ae && _ae.tagName === 'BUTTON' && root.document && root.document.body !== _ae && _ae.blur) {
      try { _ae.blur(); } catch (e) {}
    }

    for (var k in PANES) {
      var node = el('pane-' + k);
      if (!node) continue;
      /* 只有信仰页背着**静态标题 + 持久命名框（#religionBox）**，所以它的可重写正文另放在
       * #pane-faith-body —— 直接写 pane-faith 会把命名框冲掉，玩家每敲一个字就丢焦点。
       * 其余页没有 body 容器，正文与标题条一起写进卡片本身。
       * ⚠️ 这里**只能特判 faith**，不能写成「探测 pane-KEY-body 是否存在」：
       * 假 DOM（e2e / 探针）的 getElementById 对任意 id 都懒造一个桩，于是
       * pane-village-body 也会返回真值，导致所有页的正文被写进幽灵桩、真面板恒空、
       * e2e 整片红（真实浏览器里这些 -body 不存在，反而正常）。 */
      if (k === 'star-map') {
        /* iframe 动画组件：内容只在门翻转时变化，其余 tick 跳过重写以免 iframe 重载。 */
        var smHtml = cardHeadHTML(k) + PANES[k]();
        if (smHtml !== lastStarMapHTML) { node.innerHTML = smHtml; lastStarMapHTML = smHtml; }
        /* 已破壳：每周期向星图 iframe 推送最新航天器与星空探索数据（frame 收到后动态绘制）。
         * 即使 innerHTML 未变也照推——iframe 是独立文档，父页面靠 postMessage 注入状态。 */
        var _smS = SB.game && SB.game.run ? SB.game.run() : null;
        if (_smS && (_smS.shellOpened || _smS.breakSettled) && _smS.shell <= 0) {
          var _ifr = node.querySelector('iframe');
          if (_ifr && _ifr.contentWindow) {
            var _smLvl = _smS.lvl || {};
            var _smSpacecraft = (_smS.spacecraft || []).map(function (craft) {
              if (!craft || !SB.i18n || !SB.i18n.t) return craft;
              var match = typeof craft.name === 'string'
                ? (craft.type === 'station' ? /^空间站 (\d+)$/.exec(craft.name)
                  : craft.type === 'satellite' ? /^卫星 (\d+)$/.exec(craft.name) : null) : null;
              var legacyGeneratedName = !Object.prototype.hasOwnProperty.call(craft, 'generatedName') && !!match;
              if (craft.generatedName !== true && !legacyGeneratedName) return craft;
              if (!match) return craft;
              var nameKey = craft.type === 'station' ? 'game.spacecraft.station_name' : 'game.spacecraft.satellite_name';
              var copy = {}, key;
              for (key in craft) copy[key] = craft[key];
              copy.name = SB.i18n.t(nameKey, { number: Number(match[1]) }) || craft.name || '';
              return copy;
            });
            var _smDysonPct = SB.economy && SB.economy.dysonPct ? SB.economy.dysonPct(_smS) : 0;
            _ifr.contentWindow.postMessage({
              type: 'sb-spacecraft',
              locale: SB.i18n && SB.i18n.getLocale ? SB.i18n.getLocale() : 'zh-CN',
              strings: starMapLocaleStrings(),
              list: _smSpacecraft,
              bodies: SB.STAR_MAP_BODIES || [],
              star: { value: (_smS.res && _smS.res.starExplore) || 0,
                cap: SB.challenges && SB.challenges.starCap ? SB.challenges.starCap(_smS) : ((SB.CFG && SB.CFG.STAR_CAP) || 0) },
              era: _smS.era || 1,
              sunSails: _smS.sunSails || 0,
              sunSailCap: SB.challenges && SB.challenges.dysonSailCap ? SB.challenges.dysonSailCap(_smS) : ((SB.CFG && SB.CFG.DYSON_SAIL_CAP) || 10000),
              dysonNodes: _smS.dysonNodes || 0,
              dysonNodeCap: SB.challenges && SB.challenges.dysonNodeCap ? SB.challenges.dysonNodeCap(_smS) : ((SB.CFG && SB.CFG.DYSON_NODE_CAP) || 1000),
              dysonPct: _smDysonPct,
              adiabatic: !!(_smS.techs && _smS.techs.adiabatic),
              solarRingLevel: _smLvl.solar_ring || 0,
              launchMode: _smS.launchMode === 'node' ? 'node' : 'sail',
              launchCycle: SB.economy && SB.economy.launchCycleOf
                ? SB.economy.launchCycleOf(_smS)
                : (SB.CFG && SB.CFG.LAUNCH_CYCLE) || 10,
              launchpads: {
                europa: _smLvl.europa_launch || 0,
                terra: _smLvl.terra_launch || 0,
                enceladus: _smLvl.enceladus_launch || 0
              }
            }, '*');
          }
          if (SB.ui.renderParts.refreshStarMapBuildings) SB.ui.renderParts.refreshStarMapBuildings(_smS);
        }
      } else if (k === 'folk' && SB.ui.input && SB.ui.input.isFolkControlPointerActive &&
                 SB.ui.input.isFolkControlPointerActive()) {
        /* 手机 tap 的 pointerdown 与合成 click 之间保留原按钮节点；定时 renderAll 若在这段窗口
         * 重建 #pane-folk，就会让浏览器丢掉 click target。动作 click 到达后会立刻恢复正常渲染。 */
        continue;
      } else if (k === 'faith' || k === 'company' || k === 'village') {
        var body = el('pane-' + k + '-body');
        if (body) body.innerHTML = PANES[k]();
      } else if (k === 'meta') {
        /* 轮回/星屑商店：内容指纹没变就跳过整块重写（见 lastMetaHTML 声明处注释），根治反复闪。
         * 买节点导致 HTML 变化时仍会重写一次，现有 restoreTalentScroll 会恢复天赋树横向位置。 */
        var metaHtml = cardHeadHTML(k) + PANES[k]();
        if (metaHtml !== lastMetaHTML) { node.innerHTML = metaHtml; lastMetaHTML = metaHtml; }
      } else {
        node.innerHTML = cardHeadHTML(k) + PANES[k]();
      }
    }
    /* 重写结束：把被中间态钳掉的滚动位置写回（见循环前那段注释）。 */
    if (_se) {
      var _now = _se.scrollTop;
      if (typeof _now === 'number' && isFinite(_now) && Math.abs(_now - _sy) > 1) _se.scrollTop = _sy;
    }
    SB.ui.renderCommon.paintHappy(res());
    techShown = shown;
    box = el('techScroll');
    /* ⚠️ 写回要连 **0** 一起写（炸开的只有「跳回纪元一」这一种情况：目标就是 0，
     *    而 `if (techScrollLeft)` 会把它当成「没什么可写的」跳过 ⇒ 容器里还留着上一次
     *    的位置，玩家点纪元一发现树纹丝不动）。所以用 jumped 单独记一笔意图。
     * ⚠️ 隐藏态一律不写：那时读数恒为 0，写下去等于把玩家的位置抹掉。 */
    if (box && shown && (jumped || techScrollLeft)) {
      box.scrollLeft = techScrollLeft;
      /* 回读一次：浏览器会把目标夹到 [0, scrollWidth−clientWidth]（末纪元常常滚不到那么远），
       * 不回读的话模块里记住的就是一个到不了的值。 */
      techScrollLeft = box.scrollLeft || 0;
    }
    /* 市政树首次打开时跟随当前已揭露的纪元；导航安排的目标在容器重建后再落地。 */
    civicShown = cShown;
    cbox = el('civicScroll');
    var civicJumped = false;
    if (cbox && cShown && !civicJumpDone) {
      civicJumpDone = true;
      var cs = res();
      if (cs && SB.civic && SB.civic.eraAnchorX) {
        var civicTargetEra = SB.civic.visibleEra ? SB.civic.visibleEra(cs) : (cs.era || 1);
        if (civicTargetEra > 1) civicJumpTo = SB.civic.eraAnchorX(civicTargetEra);
      }
    }
    if (cbox && cShown && civicJumpTo != null) {
      civicScrollLeft = civicJumpTo;
      civicJumpTo = null;
      civicJumped = true;
    }
    if (cbox && cShown && (civicJumped || civicScrollLeft)) {
      cbox.scrollLeft = civicScrollLeft;
      civicScrollLeft = cbox.scrollLeft || 0;
    }
    /* 天赋树卷：重写之后把各树横向位置写回（详见上方注释）。 */
    restoreTalentScroll();
  }

  /* 点纪元按钮：切详情卡 + （已抵达的纪元）把长卷滚到它的左边界。
   * 返回「要不要重画」。
   * ⚠️ 这里只改视图，**不碰任何游戏状态**：纪元闸门在 tech.canStudy 里，
   *    按钮不是玩法动作，所以也不补跑 pumpTech。
   * ⚠️ 再点一次当前选中项也要返回 true：那是玩家说「带我回那个纪元」，
   *    位置得重落一次（他可能自己滑到别处去了）。 */
  function renderBreakBtn() {
    var s = res(); if (!s) return;
    /* ── 六态轮回（2026-10-27 用户拍板，优先级由上到下）──
     *   ⑥ 飞升虚境：civics.ascend_void && dysonDone —— 点它先播终局动画、再出结算面板
     *   ⑤ 驭星轮回：dysonDone
     *   ④ 繁星轮回：已破壳 + 发射过轨道卫星（s.lvl.satellite > 0）
     *   ③ 破壳轮回：已破壳、还没发卫星
     *   ② 轮回：    研究完《神学》、壳还没凿穿 —— 走 #btnCycle，照发轮回点
     *   ① 重开本周目：连《神学》都没有 —— 同样走 #btnCycle，不发点、周目 +1
     * 【为什么拆成两个按钮】2026-10-21 把原底栏 btnReset 并进 btnBreak 时，新按钮继承了
     *   btnBreak 的 disabled（壳必须归零），于是 ② 和 ① 这两种「本来随时可达」的状态
     *   彻底没有入口，只剩「清空存档」（会连轮回点一起抹）。这里按语义一分为二：
     *   #btnBreak 只管凿壳与破壳后的各档轮回，#btnCycle 只管破壳前的轮回/重开，互斥显示，
     *   同一个动作不会出现两个入口。 */
    var opened = !!(s.shellOpened && s.shell <= 0);
    var qual = !!(SB.prestige && SB.prestige.qualified && SB.prestige.qualified(s));
    var hasSat = !!((s.lvl && s.lvl.satellite) > 0);
    var mode = opened
      ? (s.dysonDone
          ? ((s.civics && s.civics.ascend_void) ? 'void' : 'dyson')
          : (hasSat ? 'star' : 'broken'))
      : (qual ? 'cycle' : 'restart');
    var LABEL_KEY = {
      'void': 'civic.data.ascend_to_the_verge.name',
      dyson: 'ui.render.render_break_btn.stellar_prestige',
      star: 'ui.render.render_break_btn.starbound_prestige',
      broken: 'ui.render.render_break_btn.shellbreak_prestige',
      cycle: 'ui.action.prestige',
      restart: 'ui.render.render_break_btn.restart_this_run'
    };

    var btn = el('btnBreak'), cyc = el('btnCycle');
    if (btn) {
      /* ⚠️ disabled 只看「壳有没有归零」，**不要带 `!s.broken`**。
       * 原判据是 `shell<=0 && !broken && shellOpened`，但 shell.onShellZero 在壳归零那一刻
       * 就把 broken 置真了 —— 于是破壳后按钮永远灰着，「破壳轮回 / 繁星轮回 / 驭星轮回 /
       * 飞升虚境」四档全点不动，玩家反而在真正需要轮回时失去了入口（与原注释
       * 「只要已破壳进太空，按钮就保持可点」直接矛盾）。这里按注释的本意收窄到壳归零。
       * breakSettled（已结算但留在本局）同样落在这条判据里，仍然可点，死局不复现。 */
      btn.disabled = !(s.shell <= 0 && s.shellOpened);
      btn.textContent = tr(opened ? LABEL_KEY[mode] : 'ui.render.render_break_btn.break_through_the_ice_shell');
    }
    if (cyc) {
      cyc.hidden = opened;                 // 破壳后交给 btnBreak，不重复给入口
      cyc.textContent = tr(qual ? 'ui.action.prestige' : 'ui.render.render_break_btn.restart_this_run');
      cyc.title = tr(qual
        ? 'ui.render.render_break_btn.end_this_run_to_earn_prestige_points'
        : 'ui.render.render_break_btn.theology_isn_t_researched_this_will_restart');
    }

    var breakPreview = opened && qual ? SB.prestige.breakReport(s) : null;
    if (el('breakHint')) el('breakHint').textContent = (opened && s.breakSettled)
      ? tr('ui.render.render_break_btn.this_run_is_settled_select_this_button')
      : (opened
        ? breakPreview
          ? tr('prestige.break.preview.current', {
            prestigePoints: breakPreview.tidePoints.toFixed(2), stardust: breakPreview.stardust
          })
          : tr('ui.prestige.estimate.status', { prestigePoints: '0.00' })
        : s.shell > 0
          ? tr('shell.break.progress.hint', {
            remainingShell: Math.round(s.shell),
            settleHint: qual
              ? ((SB.i18n && SB.i18n.getLocale && SB.i18n.getLocale() === 'en-US') ? ' ' : '') +
                tr('ui.render.render_break_btn.you_can_also_settle_this_run_with')
              : ''
          })
          : tr('ui.render.render_break_btn.the_ice_shell_has_stopped_shrinking_build'));
  }

  function clock() {
    var s = res(); if (!s) return;
    el('clock').textContent = tr('run.clock.duration_and_shell', {
      hours: (s.t / 3600).toFixed(2), shellRemoved: Math.max(0, s.baseShell - s.shell).toFixed(0)
    }, '存续 ' + (s.t / 3600).toFixed(2) + ' 小时｜已削壳 ' + Math.max(0, s.baseShell - s.shell).toFixed(0));
  }

  /* 族民 tab 上的生育进度条：直接读 tick 里的 s._grow / economy.growthDuration（第 6 步），
   * 不另立计时器——显示与结算永远同源。
   * 【为什么停摆态是「整条红斜纹」而不是空条】生育条件不满足时 economy.tick 每帧把 _grow 归零，
   * 空条和「真的漏存了」在视觉上完全一样，玩家只能刷新十次来猜。
   * 于是：走不动 = 满格红色斜纹（被堵住），攒着 = 绿色填充（在推进）。两者不可能混淆。 */
  /* 【2026-09-26 改回「硬上限」，见 economy.popCap 的注】
   * 上一版「超住只减速」（每超 1 人 +5%）已于同日删除：它实测几乎没有约束力
   * （一座住房都不建、上限 0，41 分钟也能养到 18 人，比建 1 座礁口巢只慢 7%），
   * 而屏幕上同时写着「族民 7（人口上限 2）」——玩家读到的只能是 bug（用户 2026-09-26 原话：
   * 「上限不是 2 吗，怎么会有七个人」）。现在住满 = 停摆，住房是人口线唯一的闸门。
   * ⚠️ 于是这里要显式写出「缺住房」，否则玩家看到人数不动只会以为卡死了。 */
  function growState(s) {
    /* ⚠️ 判据顺序 = 优先级：**住房在前，口粮在后**（2026-09-26 修正）。
     *   两者都能让生育停摆，但性质不同：住房住满是**硬墙**（藻食再多也不生），
     *   口粮只是**缺粮**（补上就能生）。开局正好同时命中两条（上限 1、藻食 0），
     *   而玩法上要先解决住房（点采珊瑚建礁口巢），之后才轮到口粮。
     *   顺序反了玩家读到的就是「产藻食的人不够」⇒ 他会去补藻食，补完发现**还是**不生，
     *   而屏幕上的原因没变（因为它本来就一直写着口粮那条），白跑一趟。 */
    if (SB.economy.isFull(s)) {
      return { blocked: true,
        txt: tr('growth.blocked.population_cap', {
          population: s.pop, populationCap: SB.economy.popCap(s)
        }, '住房住满：人口 ' + s.pop + ' / 人口上限 ' + SB.economy.popCap(s) +
          '，不再生育——盖住房才能继续（第二档石屋 ratio 更平缓，中期更划算）') };
    }
    if (!(s.res.kelp > CFG.GROW_KEEP)) {
      return { blocked: true, txt: tr('growth.blocked.kelp_shortage', {
        kelpAmount: Math.max(0, s.res.kelp).toFixed(0), minimumKelp: CFG.GROW_KEEP
      }, '藻食 ' + Math.max(0, s.res.kelp).toFixed(0) +
        ' ≤ ' + CFG.GROW_KEEP + '，生育停摆——产藻食的人不够，或口粮超了') };
    }
    var g = s._grow || 0;
    /* _grow 记的是普通进度（每帧 += dt，见 economy.tick 第 6 步），没有加权，
     * 所以进度条与剩余秒数都直接由 g 算，不再需要按倍率还原。 */
    var need = SB.economy && SB.economy.growthDuration ? SB.economy.growthDuration(s) : CFG.GROW_NEED;
    return { blocked: false, p: Math.min(1, g / need),
      left: Math.ceil(need - g), txt: '' };
  }
  /* 族民页那行的每帧刷新：只改数字 / 条宽 / 原因文字，不重建整块 pane
   * （pane 重建走 renderPanes，只在切页时发生——见 paneFolk 里的注释）。 */
  function paintGrow(s) {
    var st = growState(s), g = s._grow || 0;
    var need = SB.economy && SB.economy.growthDuration ? SB.economy.growthDuration(s) : CFG.GROW_NEED;
    var p = st.blocked ? 0 : Math.min(1, g / need);
    var nm = el('growNm'), fill = el('growFill'), why = el('growWhy');
    if (nm) nm.innerHTML = st.blocked
      ? htmlText(tr('ui.growth.label', null, '生育')) + ' <span class="bad">' + htmlText(tr('ui.render.paint_grow.stalled', null, '停摆')) + '</span>'
      : htmlText(tr('ui.people.growth.progress', {
          secondsRemaining: st.left, growthPercent: (p * 100).toFixed(0)
        }, '距离下一位族民出生还需 {secondsRemaining} 秒（{growthPercent}%）'));
    if (fill) fill.style.width = (p * 100).toFixed(1) + '%';
    if (why) {
      /* 「有空住房才生」在新机制下是**正确**的说法（2026-09-25 那版把硬上限拆了，
       * 于是这句话被删过一次；现在墙回来了，它要回来）。 */
      why.textContent = st.blocked ? st.txt
        : tr('growth.requirement_and_interval', { minimumKelp: CFG.GROW_KEEP, growthInterval: need },
          '需藻食 > {minimumKelp}，每 {growthInterval} 秒出生一名。');
      why.className = 'ds' + (st.blocked ? ' badtxt' : '');
    }
  }
  function renderGrowBar() {
    var s = res(), bar = el('growbar'); if (!s || !bar) return;
    var st = growState(s);
    if (st.blocked) {
      bar.style.width = '100%';
      bar.className = 'growbar blocked';
      bar.title = st.txt;   // 桌面 hover；手机端看族民页那一行，这里不再重复「生育停摆」
    } else {
      bar.className = 'growbar';
      bar.style.width = (st.p * 100).toFixed(1) + '%';
      bar.title = tr('growth.next_person.progress', {
        remainingSeconds: st.left, progressPercent: (st.p * 100).toFixed(0)
      }, '下一名族民还需 {remainingSeconds} 秒（{progressPercent}%）。');
    }
    paintGrow(s);
  }

  /* 「族民」tab 的闲置角标（2026-09-30 用户拍）：有闲置时页签写「族民（N）」，没有就还原「族民」。
   * 【为什么挂在 span#folkTabName 上而不是改 tab 的 textContent】tab 里还有生育进度条
   * <i#growbar>，一把 textContent 写下去会把进度条节点整个吃掉——renderGrowBar 随后
   * 找不到 growbar 就静默不画，症状是「页签数字会动、条纹消失了」这种看不见的连锁。
   * 【为什么缓存上一次值】renderTick 每帧都跑；textContent 不变也重设会白付一次
   * 样式失效，先比对再写。闲置只在雇佣/出生/死亡时变，绝大多数帧走早退。 */
  var _lastIdleTag = -1;
  function renderIdleTag() {
    var s = res(); if (!s) return;
    var idle = SB.folk.idle(s);
    if (idle === _lastIdleTag) return;
    _lastIdleTag = idle;
    var t = el('folkTabName');
    if (t) {
      /* 用已登记的 people.tab.idle_count（全角括号），别在渲染器里手拼半角标签。 */
      t.textContent = idle > 0
        ? tr('people.tab.idle_count', { idleCount: idle }, '族民（' + idle + '）')
        : tr('ui.pane.people.title', null, '族民');
    }
  }

  /* 当前挑战提示放在页签与面板之间；子节点保持常驻，只改文本，避免每帧重建按钮吞掉点击。 */
  function renderChallengeNotice(s) {
    var notice = el('challengeNotice');
    if (!notice) return;
    var active = SB.challenges && SB.challenges.active ? SB.challenges.active(s) : null;
    var def = active && SB.challenges.byId(active.id);
    var tier = active && SB.challenges.activeTier(s);
    if (!active || !def || !tier) { notice.hidden = true; return; }

    var rule = '', progress = '', cap = tier.cap;
    var displayText = SB.ui && SB.ui.renderParts && SB.ui.renderParts.challengeDefinitionText;
    var progressLine = SB.ui && SB.ui.renderParts && SB.ui.renderParts.challengeProgressLine;
    var theologyStatus = tr(SB.prestige.qualified(s)
      ? 'ui.render.render_challenge_notice.theology_requirement_met'
      : 'ui.render.render_challenge_notice.theology_requirement_pending');
    if (displayText) rule = displayText(def, 'rule') || displayText(def, 'summary');
    if (active.id === 'science') {
      var scribeName = SB.folk.jobName(s, 'scribe');
      rule = tr('challenge.notice.science.rule', { scribeJob: scribeName, jobCap: cap });
      progress = tr('challenge.notice.science.progress', {
        scholarCount: (s.jobs && s.jobs.scholar) || 0,
        jobCap: cap,
        scribeJob: scribeName,
        scribeCount: (s.jobs && s.jobs.scribe) || 0
      });
    } else if (active.id === 'small') {
      rule = tr('challenge.notice.small.rule', { populationCap: cap });
      progress = tr('challenge.notice.small.progress', {
        population: Math.ceil(Number(s.pop) || 0), populationCap: cap
      });
    } else if (active.id === 'cold') {
      rule = tr('ui.challenge.notice.cold_rule', { warmstoneOutputPenalty: '−30%' });
      progress = tr(SB.challenges.warmHeatingBlocked(s)
        ? 'ui.render.render_challenge_notice.current_status_insulation_disabled'
        : 'ui.render.render_challenge_notice.current_status_insulation_available');
    } else if (active.id === 'abyss') {
      rule = tr('challenge.notice.abyss.rule', { penaltyPercent: Math.round(cap * 100) });
      progress = tr('challenge.notice.abyss.progress', {
        theologyStatus: theologyStatus,
        remainingShell: Math.max(0, Math.round(Number(s.shell) || 0))
      });
    } else if (def.timed) {
      rule = tr('challenge.notice.speedrun.rule', { timeLimit: SB.challenges.formatClock(cap) });
      if (SB.challenges.timedOut(s)) {
        progress = tr('ui.render.render_challenge_notice.timed_out_restart_this_run_to_try');
      } else if (def.goal && def.goal.t === 'dyson') {
        progress = tr('ui.challenge.progress.dyson_rush', {
          remainingTime: SB.challenges.formatClock(SB.challenges.remainingSeconds(s)),
          dysonProgressPercent: Math.floor((SB.economy.dysonPct ? SB.economy.dysonPct(s) : 0) * 100)
        });
      } else {
        progress = tr('challenge.notice.speedrun.progress', {
          remainingTime: SB.challenges.formatClock(SB.challenges.remainingSeconds(s)),
          theologyStatus: theologyStatus,
          remainingShell: Math.max(0, Math.round(Number(s.shell) || 0))
        });
      }
    } else if (active.id === 'anarchy') {
      var disallowed = (s.cards || []).filter(function (id) { return id && id !== 'card_cycle_terminus'; }).length;
      progress = tr(disallowed ? 'challenge.notice.anarchy.progress.with_violations' : 'ui.challenge.progress.anarchy.no_cards', {
        violationCount: disallowed
      });
    } else if (active.id === 'good_old_days') {
      var currentGovernmentName = s.govName && s.govName.trim()
        ? (SB.civic.govTitleName ? SB.civic.govTitleName(s) : s.govName.trim())
        : tr('civic.government.name.chiefdom');
      progress = tr('challenge.notice.good_old_days.government', {
        governmentName: currentGovernmentName
      });
    } else if (active.id === 'three_launch_sites') {
      rule = tr('ui.challenge.notice.launch_site_rule', {
        requiredLaunchSiteCount: 3, requiredLaunchSiteLevel: 11
      });
      progress = s.dysonDone && !s.dysonLaunchSitesReady
        ? tr('ui.challenge.progress.dyson_missing_launch_sites')
        : tr('challenge.notice.three_launch_sites.progress', {
          europaLevel: (s.lvl && s.lvl.europa_launch) || 0,
          terraLevel: (s.lvl && s.lvl.terra_launch) || 0,
          enceladusLevel: (s.lvl && s.lvl.enceladus_launch) || 0,
          completionWarning: ''
        });
    } else if (active.id === 'eternity_moment') {
      var eternityStarCap = SB.challenges.starCap(s);
      var eternitySailCap = SB.challenges.dysonSailCap(s), eternityNodeCap = SB.challenges.dysonNodeCap(s);
      rule = tr('challenge.notice.eternity_moment.rule', { multiplier: cap });
      progress = tr('challenge.notice.eternity_moment.progress', {
        shellProgress: Math.round(Math.max(0, s.shell || 0)).toLocaleString(),
        shellTarget: SB.challenges.shellTarget(s).toLocaleString(),
        starProgress: Math.round((s.res && s.res.starExplore) || 0).toLocaleString(),
        starTarget: eternityStarCap.toLocaleString(),
        sailCount: Math.floor(s.sunSails || 0).toLocaleString(),
        sailCap: eternitySailCap.toLocaleString(),
        nodeCount: Math.floor(s.dysonNodes || 0).toLocaleString(),
        nodeCap: eternityNodeCap.toLocaleString()
      });
    } else {
      if (active.id === 'anarchy' || active.id === 'good_old_days') rule = '';
      progress = progressLine
        ? progressLine(s, SB.challenges, def, tier)
        : tr('ui.render.anonymous_function.challenge_restrictions_remain_in_effect');
    }

    /* 状态徽标（2026-11-07）：原先是 index.html 里写死的「挑战进行中」，逐光竞速 /
     * 星海竞速超时后依旧显示进行中，与挑战页卡片自相矛盾。
     * ⚠️ 必须同时换 data-i18n：翻译器按这个属性回填文本，只改 textContent 会被覆盖回去。 */
    var headingNode = el('challengeNoticeHeading');
    if (headingNode) {
      var headingKey = (def.timed && SB.challenges.timedOut(s)) ? 'ui.challenge.status.timed_out' :
        s.challengeDone ? 'ui.challenge.status.goal_met' :
        active.replay === true ? 'ui.challenge.status.replay' : 'ui.challenge.notice.heading';
      if (headingNode.getAttribute('data-i18n') !== headingKey)
        headingNode.setAttribute('data-i18n', headingKey);
      var headingText = tr(headingKey);
      if (headingNode.textContent !== headingText) headingNode.textContent = headingText;
    }
    var titleNode = el('challengeNoticeTitle'), ruleNode = el('challengeNoticeRule'), progressNode = el('challengeNoticeProgress');
    var challengeName = displayText ? displayText(def, 'name') : tr('challenge.definition.' + def.id + '.name');
    var tierName = displayText ? displayText(def, 'tierLabel', active.tier) : tier.label;
    var title = challengeName + ' · ' + tierName;
    if (titleNode && titleNode.textContent !== title) titleNode.textContent = title;
    if (ruleNode && ruleNode.textContent !== rule) ruleNode.textContent = rule;
    if (progressNode && progressNode.textContent !== progress) progressNode.textContent = progress;
    notice.hidden = false;
  }

  function renderAll() {
    var s = res();
    applyEraSkin(s);
    renderChallengeNotice(s);
    /* 巢穴 tab 名随纪元演进（与卡片标题同一来源，避免 tab 写「巢穴」、面板写「渊海之国」打架）。 */
    var vt = el('villageTabName');
    if (vt && SB.habitat && SB.habitat.habitatName) vt.textContent = SB.habitat.habitatName(s);
    /* 巢穴页内卡片标题（#villageHeadName，index.html 静态头，不进 2 秒刷新的 body）同步聚落名。 */
    var vh = el('villageHeadName');
    if (vh && SB.habitat && SB.habitat.habitatName) vh.textContent = SB.habitat.habitatName(s);
    renderRes(); renderShell(); renderPanes(); renderBreakBtn(); clock(); renderGrowBar();
    SB.ui.renderParts.renderEnv(s); SB.ui.renderParts.renderWarm(s); SB.ui.renderParts.renderCore(s); SB.ui.renderParts.renderDrill(s);
    SB.ui.renderParts.renderGeek(s);
    SB.ui.renderParts.renderStar(s); SB.ui.renderParts.renderHydro(s); SB.ui.renderParts.renderReligion(s);
    /* 水体污染面板（2026-11-02）：仅挑战周目显示（函数内部首行判 pollutionOn）。
     * ⚠️ 两个调用点（正常渲染 + 轻量渲染）都要加 —— 只加一个的话面板会在
     *   某一条路径上不刷新（数字僵住，玩家以为污染不涨了）。 */
    if (SB.ui.renderParts.renderPollution) SB.ui.renderParts.renderPollution(s);
    SB.ui.renderParts.renderHabitatName(s);
    renderIdleTag(); renderEvent(s); renderAd(); renderRank();
  }
  function renderTick() {
    var s = res();
    if (SB.ui.renderParts.refreshLaunchProgress) SB.ui.renderParts.refreshLaunchProgress(s);
    applyEraSkin(s);
    renderChallengeNotice(s);
    renderRes(); renderShell(); renderBreakBtn(); clock(); renderGrowBar();
    SB.ui.renderParts.renderEnv(s); SB.ui.renderParts.renderWarm(s); SB.ui.renderParts.renderCore(s); SB.ui.renderParts.renderDrill(s);
    SB.ui.renderParts.renderGeek(s);
    SB.ui.renderParts.renderHydro(s);
    if (SB.ui.renderParts.renderPollution) SB.ui.renderParts.renderPollution(s);
    renderIdleTag(); renderEvent(s); SB.ui.renderCommon.paintHappy(s);
    /* 建造追踪小框（2026-10-29）：常驻节点（index.html 的 #trackDock），
     * 内部自带 200ms 节流 + 字符串指纹，数字没变不写 DOM —— 逐帧调它等于白调。
     * ⚠️ 用 `&&` 守卫而不是要求模块必在：e2e 的假 DOM 里这个节点不存在，
     *    paint 自己会早退；但加载顺序若被改动，这里也不该把整页渲染带崩。 */
    if (SB.ui.track && SB.ui.track.paint) SB.ui.track.paint(s);
  }
  /* 看广告加速控件（顶栏速度行）：持久节点 + textContent 更新，避免每帧重建 innerHTML 吞掉点击。
   * 余额 / 开关只在这里随 2 秒刷新（renderAll）与拨动时（toggleAdBoost / grantAdBoost 各自 renderAll）更新。 */
  function renderAd() {
    var s = res(); if (!s) return;
    var ctrl = el('adCtrl'); if (!ctrl) return;
    /* 广告不可用（没 SDK / 没配 space_id，且非 ?adtest）⇒ 整块隐藏。
     * 否则会留下一个「点了没反应」的死按钮，也暗示玩家这里该有东西。 */
    if (SB.ad && SB.ad.available && !SB.ad.available()) { ctrl.style.display = 'none'; return; }
    ctrl.style.display = '';
    var watch = el('btnAd'), tog = el('btnAdToggle'), rem = el('adRemain');
    var ad = s.ad || { ms: 0, on: true };
    if (watch) {
      watch.disabled = false;
      var boostMinutes = SB.CFG.AD ? SB.CFG.AD.BOOST_MIN : 30;
      var multiplier = SB.CFG.AD ? SB.CFG.AD.MUL : 2;
      var watchParams = { boostMinutes: boostMinutes, multiplier: multiplier };
      watch.textContent = tr('ui.ad.boost.watch.action', watchParams, '看广告 +{boostMinutes}min {multiplier}×');
      watch.title = tr('ui.ad.boost.watch.tooltip', watchParams,
        '看一次广告：获得 {boostMinutes} 分钟 {multiplier} 倍速（墙钟真实时间计时，不受游戏内倍速影响）');
    }
    if (rem) {
      if (ad.ms > 0) {
        var total = ad.ms / 1000, mm = Math.floor(total / 60), ss = Math.floor(total % 60);
        var duration = mm + ':' + (ss < 10 ? '0' + ss : ss);
        var remainKey = ad.on ? 'ui.ad.boost.remaining.active' : 'ui.ad.boost.remaining.paused';
        rem.textContent = tr(remainKey, { duration: duration }, ad.on ? '2× 生效 · 剩 {duration}' : '剩 {duration}');
      } else rem.textContent = tr('ui.ad.boost.remaining.empty', null, '无加速');
    }
    if (tog) {
      tog.classList.toggle('on', !!ad.on && ad.ms > 0);
      tog.classList.toggle('off', !ad.on && ad.ms > 0);
      tog.textContent = ad.ms > 0
        ? tr(ad.on ? 'ui.ad.boost.toggle.active' : 'ui.ad.boost.toggle.paused', null, ad.on ? '2× 加速 开' : '2× 加速 关')
        : tr('ui.ad.boost.toggle.default', null, '2× 加速');
      tog.title = tr('ui.ad.boost.toggle.tooltip', null, '开关 2× 加速（关着时剩余时间不流逝）');
      tog.disabled = ad.ms <= 0;                  // 没余额时开关无意义（中性灰，不显示开/关）
    }
    /* 「看广告 +1 轮回点」：按钮文案固定；副文本显示当日已看次数/上限；达上限禁用并提示。 */
    var rb = el('btnAdRebirth'), rbRem = el('adRebirthRemain');
    var max = (SB.CFG.AD ? SB.CFG.AD.REBIRTH_DAILY_MAX : 10) || 10;
    var m = (SB.game && SB.game.meta) ? SB.game.meta() : {};
    var st = (SB.game && SB.game.adRebirthState) ? SB.game.adRebirthState(m) : { count: 0 };
    if (rb) {
      rb.disabled = st.count >= max;
      rb.textContent = tr('ui.ad.rebirth.action', null, '看广告 +1 轮回点');
      rb.title = tr('ui.ad.rebirth.tooltip', { dailyMax: max }, '看一次广告：获得 1 轮回点（每日最多 {dailyMax} 次）');
    }
    if (rbRem) {
      var atLimit = st.count >= max;
      rbRem.textContent = tr(atLimit ? 'ui.ad.rebirth.count.limit' : 'ui.ad.rebirth.count.today', {
        count: st.count,
        max: max
      }, atLimit ? '今日已满 {count}/{max}' : '今日 {count}/{max}');
    }
  }
  /* 排行榜入口按钮的可见性（2026-10-10）：榜不可用（无 SDK / 无榜 ID）⇒ 隐藏，不留死按钮。 */
  function renderRank() {
    var btn = el('btnRank'); if (!btn) return;
    if (!(SB.rank && SB.rank.available && SB.rank.available())) { btn.style.display = 'none'; return; }
    btn.style.display = '';
  }
  /* 排行榜查看面板（2026-10-10）：点页脚「排行榜」按钮打开，列出已回填的榜，点哪个开哪个。
   * 复用 #modal 遮罩 + input.js 已有的 data-modal-close 关闭通道。 */
  function openRankChooser() {
    var box = el('modalBox'), modal = el('modal');
    if (!box || !modal || !(SB.rank && SB.rank.available && SB.rank.available())) return;
    var map = (SB.CFG && SB.CFG.RANK && SB.CFG.RANK.MAP) || {};
    var keys = (SB.rank.readyKeys && SB.rank.readyKeys()) || [];
    if (!keys.length) return;
    var titleKeys = {
      fastest: 'leaderboard.fastest_ice_shellbreak',
      firstFaith: 'leaderboard.fastest_faith_established',
      dev: 'leaderboard.highest_development_score',
      wonder: 'leaderboard.most_legacy_wonders',
      cycle: 'leaderboard.prestige_count',
      star: 'leaderboard.most_stardust',
      tide: 'leaderboard.most_prestige_points',
      dyson: 'leaderboard.fastest_dyson_sphere',
      void: 'leaderboard.fastest_verge_ascension',
      drift: 'leaderboard.fastest_wandering_terra_launch',
      pollution: 'leaderboard.lowest_pollution_clear'
    };
    var rows = keys.map(function (k) {
      var fallback = (map[k] && map[k].title) || k;
      var title = titleKeys[k] ? tr(titleKeys[k], null, fallback) : fallback;
      return '<button type="button" class="btn rank-open" data-rank-key="' + k + '">' + htmlText(title) + '</button>';
    }).join('');
    box.innerHTML =
      '<div class="modal-hd"><b>' + htmlText(tr('ui.footer.leaderboard_button', null, '排行榜')) + '</b>' +
      '<button type="button" class="modal-x" data-modal-close="1" aria-label="' + htmlText(tr('ui.action.close', null, '关闭')) + '">×</button></div>' +
      '<div class="rank-list">' + rows + '</div>';
    resetModalChrome();
    modal.classList.remove('hidden');
    bodyModalClass(true);
    var btns = box.querySelectorAll('.rank-open');
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = function () {
        var k = this.getAttribute('data-rank-key');
        hideModal();
        if (SB.rank && SB.rank.open) SB.rank.open(k);
      };
    }
  }
  /* 更新日志面板（2026-10-27 恢复；原实现 2026-10-25 被整体删除）：点页脚「更新日志」按钮，
   * 或新版本首次进入时自动弹出。列出 CFG.CHANGELOG（最新在前），复用 #modal 遮罩 +
   * data-modal-close 关闭通道（与排行榜 / 政体选择面板同款，不另写遮罩）。
   * ⚠️ 版本名直接输出 e.v 原样，**不要再拼 'v' 前缀**——旧实现写 `'v' + e.v`，而数据里 e.v
   *   本就是 'v0.1.8'，实际渲染出 'vv0.1.8'；现在版本名是 'Ver1.0.1'，同理不能拼。 */
  function openChangelog() {
    var box = el('modalBox'), modal = el('modal');
    if (!box || !modal) return;
    var log = (SB.CFG && SB.CFG.CHANGELOG) || [];
    /* 2026-11-06 本地化：CFG.CHANGELOG 的 items 存 i18n 语义 key，中文基准在
     * src/locales/zh-CN.js、英文在 electron/locales/en-US.js，二者由登记表生成。
     * TapTap / 未知运行时恒取 zh-CN；只有明确 Electron 才可能取 en-US。
     * 取不到词时退回 key 本身，方便在面板里立刻发现漏登记，而不是静默空行。 */
    function chgEsc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    var body = log.map(function (e) {
      var items = (e.items || []).map(function (it) {
        var txt = (SB.i18n && SB.i18n.t) ? (SB.i18n.t(it) || it) : it;
        return '<li>' + chgEsc(txt) + '</li>';
      }).join('');
      return '<div class="chg-entry">' +
        '<div class="chg-hd"><span class="chg-ver">' + (e.v || '?') + '</span>' +
        (e.date ? '<span class="chg-date">' + e.date + '</span>' : '') + '</div>' +
        (e.title ? '<div class="chg-title">' + e.title + '</div>' : '') +
        '<ul class="chg-items">' + items + '</ul></div>';
    }).join('');
    if (!body) body = '<div class="chg-empty">' + htmlText(tr('ui.render.anonymous_function.no_update_history_yet', null, '暂无更新记录。')) + '</div>';
    box.innerHTML =
      '<div class="modal-hd"><b>' + htmlText(tr('ui.footer.changelog_button', null, '更新日志')) + '</b>' +
      '<button type="button" class="modal-x" data-modal-close="1" aria-label="' + htmlText(tr('ui.action.close', null, '关闭')) + '">×</button></div>' +
      '<div class="chg-list">' + body + '</div>' +
      '<div class="chg-foot"><button type="button" class="btn" data-modal-close="1">' + htmlText(tr('ui.render.anonymous_function.got_it', null, '知道了')) + '</button></div>';
    /* 归一化（含 gov-picker-modal —— 政体/政策选择器会给 #modal 加宽版排版 + 滚动约束，
     * 残留会让更新日志面板套上别人的皮肤）。见 resetModalChrome 注释。 */
    resetModalChrome();
    modal.classList.remove('hidden');
    bodyModalClass(true);
  }
  /* 政体选择器：当前政体摘要留在市政页，候选项通过独立弹窗选择。 */
  function openGovPicker() {
    var box = el('modalBox'), modal = el('modal'), s = res();
    if (!box || !modal || !s || !paneGovPicker) return;
    var current = null;
    for (var i = 0; i < (SB.GOVS || []).length; i++) {
      if (SB.GOVS[i].id === s.gov) current = SB.GOVS[i];
    }
    var currentName = current
      ? ((SB.civic && SB.civic.govTitleName) ? SB.civic.govTitleName(s) : current.name)
      : tr('ui.render.open_gov_picker.none', null, '无');
    box.innerHTML =
      '<div class="gov-picker-modal-head"><div><span>' + htmlText(tr('ui.render.open_gov_picker.government', null, '文明制度')) + '</span><h2 id="gov-picker-title">' + htmlText(tr('civic.government.change.action', null, '更换政体')) + '</h2>' +
        '<p>' + htmlText(tr('ui.render.open_gov_picker.current', null, '当前：')) + htmlText(currentName) + htmlText(tr('ui.render.open_gov_picker.government_effects_and_adoption_requirements_are', null, '· 各政体效果与采纳条件如下')) + '</p></div>' +
        '<button type="button" class="modal-x" data-modal-close="1" aria-label="' + htmlText(tr('ui.render.open_gov_picker.close_government_selection', null, '关闭政体选择')) + '">×</button></div>' +
      '<div class="gov-picker-modal-content">' + paneGovPicker(s) + '</div>' +
      '<div class="gov-picker-modal-foot"><span>' + htmlText(tr('ui.render.open_gov_picker.government_effects_policy_card_slots_and_change', null, '政体效果、卡槽与更换费用均显示在卡片中。')) + '</span>' +
        '<button type="button" class="btn" data-modal-close="1">' + htmlText(tr('save.action.cancel', null, '取消')) + '</button></div>';
    resetModalChrome();
    modal.classList.add('gov-picker-modal');
    if (box.setAttribute) {
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', 'gov-picker-title');
    }
    modal.classList.remove('hidden');
    bodyModalClass(true);
  }
  /* 点政策槽 → 直接弹「能装进这个槽的卡」（2026-10-27 用户要求）。
   * 外壳与 openGovPicker 完全同构（同一个 #modal/#modalBox、同一套 gov-picker-modal 样式），
   * 只把内容换成卡片列表 —— 不为它另写一套弹窗样式，改配色时不用记两个地方。
   * ⚠️ 两步法仍然可用：input 侧只有「没 armedCard」时才调这里，选了卡再点槽照旧直接装。 */
  function openPolicyPicker(slotIdx) {
    var box = el('modalBox'), modal = el('modal'), s = res();
    if (!box || !modal || !s || !panePolicyPicker) return;
    var list = (SB.civic && SB.civic.slotList) ? SB.civic.slotList(s) : [];
    var st = (list[slotIdx] || {}).type;
    var typeName = st ? tr('policy.slot.' + st, null,
      (SB.civic && SB.civic.slotTypeName) ? SB.civic.slotTypeName(st) : '政策卡') : tr('ui.economy.rate.source.policy_cards', null, '政策卡');
    box.innerHTML =
      '<div class="gov-picker-modal-head"><div><span>' + htmlText(tr('ui.economy.rate.source.policy_cards', null, '政策卡')) + '</span>' +
        '<h2>' + htmlText(tr('ui.policy_picker.slot_heading', { slotNumber: slotIdx + 1, slotType: typeName }, '第 {slotNumber} 槽 · {slotType}')) + '</h2>' +
        '<p>' + htmlText(tr('ui.render.open_policy_picker.these_are_the_policy_cards_you_ve', null, '下面是能装进这个槽、且你已经解锁的政策卡。点一张直接装上。')) + '</p></div>' +
        '<button type="button" class="modal-x" data-modal-close="1" aria-label="' + htmlText(tr('ui.action.close', null, '关闭')) + '">×</button></div>' +
      '<div class="gov-picker-modal-content">' + panePolicyPicker(s, slotIdx) + '</div>' +
      '<div class="gov-picker-modal-foot"><span>' + htmlText(tr('ui.render.open_policy_picker.close_this_window_to_leave_the_slot', null, '直接关掉即可，槽里的卡不会变。')) + '</span>' +
        '<button type="button" class="btn" data-modal-close="1">' + htmlText(tr('save.action.cancel', null, '取消')) + '</button></div>';
    resetModalChrome();
    modal.classList.add('gov-picker-modal');
    if (box.setAttribute) {
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
    }
    modal.classList.remove('hidden');
    bodyModalClass(true);
    function emit(msg) { if (SB.game && SB.game.log) SB.game.log(msg); }
    function afterChange() {
      hideModal();
      if (SB.ui.render && SB.ui.render.disarmCard) SB.ui.render.disarmCard();
      if (SB.game && SB.game.markDirty) SB.game.markDirty();
      if (SB.game && SB.game.renderAll) SB.game.renderAll();
      if (SB.game && SB.game.pumpCivic) { try { SB.game.pumpCivic(res(), emit); } catch (e) {} }
    }
    /* 点卡片 = 直接装进这个槽 */
    var picks = box.querySelectorAll('[data-card-pick]'), pi;
    for (pi = 0; pi < picks.length; pi++) {
      picks[pi].onclick = (function (btn) {
        return function () {
          var id = btn.getAttribute('data-card-pick');
          var idx = +btn.getAttribute('data-slot-pick');
          var st2 = res();
          if (SB.civic.setCard(st2, id, emit, idx)) { afterChange(); return; }
          /* ⚠️ 失败必须**在弹窗里**说清原因：只写页面日志的话，玩家点了一下没反应、
           *    弹窗还开着，完全不知道是缺市政点还是卡不对口（日志在页面最底部）。 */
          var why = (SB.civic.cardBlocked && SB.civic.cardBlocked(st2, id))
            || '这张卡装不进这个槽（类型不对，或它已经装在别的槽里）。';
          var tip = box.querySelector('.policy-picker-error');
          if (!tip) {
            tip = document.createElement('div');
            tip.className = 'policy-picker-error';
            var content = box.querySelector('.gov-picker-modal-content');
            if (content && content.parentNode) content.parentNode.insertBefore(tip, content);
            else box.appendChild(tip);
          }
          var equipError = tr('ui.policy_picker.equip_error', { reason: why }, '装不上：{reason}');
          tip.textContent = equipError;
          emit(equipError);
        };
      })(picks[pi]);
    }
    /* 已装卡的槽：弹窗顶部也能直接卸下（不必先关弹窗回面板再点） */
    var rms = box.querySelectorAll('[data-remove]'), ri;
    for (ri = 0; ri < rms.length; ri++) {
      rms[ri].onclick = (function (btn) {
        return function () {
          var idx = +btn.getAttribute('data-remove');
          if (SB.civic.removeCard(res(), idx, emit)) afterChange();
          else emit(tr('ui.log.policy_card.remove_failed.empty_slot', null, '该槽是空的，无需卸下。'));
        };
      })(rms[ri]);
    }
  }
  /* 点击时间事件横幅（#omen）：顶部常驻卡，活动事件出现时显示、点上拾取。
   * ⚠️ 沿用 envWarm 那套签名节流：只在活动事件 id 变化时才重写标题/文案/按钮文字，
   *    倒计时走独立 span 的 textContent 每帧刷——否则每帧重建 innerHTML 会让那一次点击被吞。 */
  function renderEvent(s) {
    var def = (SB.events && SB.events.getActive && SB.events.getActive()) || null;
    var node = el('omen');
    // 事件出现/消失时给 body 切 omen-open：CSS 据此给页面底部留白，横幅 fixed 在视口底部不盖控制条。
    var bd = (typeof document !== 'undefined' && document.body) ? document.body : null;
    if (!node) return;
    if (!def) {
      if (_omenSig !== '') { node.hidden = true; _omenSig = ''; }
      if (bd) bd.classList.remove('omen-open');
      return;
    }
    if (_omenSig !== def.id) {
      _omenSig = def.id;
      node.hidden = false;
      var nm = el('omenName'), cp = el('omenCopy'), btn = el('omenBtn');
      var eventSlug = String(def.id || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
      if (nm) nm.textContent = tr('event.' + eventSlug + '.name', null, def.name);
      if (cp) cp.textContent = tr('event.' + eventSlug + '.description', null, def.copy);
      if (btn) btn.textContent = tr('ui.render.render_event.collect', null, '拾取');
    }
    if (bd) bd.classList.add('omen-open');
    var cd = el('omenCd');
    if (cd && SB.events.timeLeft) cd.textContent = tr('ui.event.countdown', {
      seconds: Math.ceil(SB.events.timeLeft())
    }, '{seconds} 秒后消失');
  }

  function clearBreakAnimation() {
    for (var i = 0; i < _breakAnimationTimers.length; i++) clearTimeout(_breakAnimationTimers[i]);
    _breakAnimationTimers = [];
    _breakAnimationReport = null;
  }

  function prefersReducedMotion() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* 破壳终章：结算前播放 4 段分镜。动画只读报告，不修改游戏状态；
   * 结算数据仍由 prestige.breakReport / doBreak 负责，避免动画层产生第二份真相。 */
  function showBreakAnimation(r, afterAnimation) {
    var modal = el('modal'), box = el('modalBox');
    clearDysonAnimation();
    if (!modal || !box || prefersReducedMotion()) {
      if (afterAnimation) afterAnimation();
      else showBreakResult(r);
      return;
    }
    clearBreakAnimation();
    _breakAnimationReport = r;
    var animationPrefix = 'ui.render.show_break_animation.';
    function animText(key, fallback) { return tr(animationPrefix + key, null, fallback); }
    box.innerHTML =
      '<section class="break-showcase" aria-label="' + htmlText(animText('shellbreak_finale', '破壳终章动画')) + '">' +
        '<div class="break-stage" id="breakStage" data-phase="intro">' +
          '<div class="break-scene">' +
            '<img class="break-frame-intro" src="assets/backgrounds/sequence/era-5/frame-01.webp" alt="' + htmlText(animText('the_sky_drill_charges_ready_to_strike', '天穹钻机蓄力，准备冲击天壳')) + '">' +
            '<img class="break-frame-impact" src="assets/backgrounds/sequence/era-5/frame-02.webp" alt="' + htmlText(animText('the_drill_strikes_the_shell_cracks_and', '钻机击中天壳，裂纹与碎冰亮起')) + '">' +
            '<img class="break-frame-gaze" src="assets/backgrounds/sequence/era-5/frame-03.webp" alt="' + htmlText(animText('merfolk_swim_toward_the_drill_and_gaze', '鲛人游近钻机，仰望裂开的天壳')) + '">' +
            '<img class="break-frame-ending" src="assets/backgrounds/breakthrough/end-stars-draft-low.jpg" alt="' + htmlText(animText('the_shell_opens_the_drill_and_merfolk', '天壳打开，钻机和鲛人共同仰望星空')) + '">' +
          '</div>' +
          '<div class="break-hud"><span class="break-phase"><b>✦</b><span id="breakPhaseName">' + htmlText(animText('drill_charging', '钻机蓄力')) + '</span></span><span id="breakCounter">01 / 04</span></div>' +
          '<div class="break-caption">' +
            '<div class="break-caption-text break-cap-intro"><small>' + htmlText(animText('finale_the_sky_drill', '终章 · 天穹钻机')) + '</small><h2>' + htmlText(animText('resonance_engage', '共振，启动。')) + '</h2><p>' + htmlText(animText('the_whole_undersea_city_gathers_strength_for', '整座海底城市，为这一击积蓄力量。')) + '</p></div>' +
            '<div class="break-caption-text break-cap-impact"><small>' + htmlText(animText('past_the_breaking_point', '突破临界点')) + '</small><h2>' + htmlText(animText('the_drill_meets_the_shell', '钻头触壳。')) + '</h2><p>' + htmlText(animText('resonance_spreads_through_the_ice_the_first', '共振沿冰层蔓延，第一道裂纹亮起。')) + '</p></div>' +
            '<div class="break-caption-text break-cap-gaze"><small>' + htmlText(animText('the_shell_breaks_merfolk_look_up', '天壳崩解 · 鲛人仰望')) + '</small><h2>' + htmlText(animText('the_fracture_spreads', '裂痕，扩散。')) + '</h2><p>' + htmlText(animText('merfolk_swim_toward_the_drill_and_watch', '鲛人游向钻机，望向逐渐打开的天穹。')) + '</p></div>' +
            '<div class="break-caption-text break-cap-ending"><small>' + htmlText(animText('a_new_era_for_civilization', '文明的新纪元')) + '</small><h2>' + htmlText(animText('beyond_the_shell', '天壳之外。')) + '</h2><p>' + htmlText(animText('the_boundary_we_once_looked_up_to', '曾经仰望的边界，如今已在身后。')) + '</p></div>' +
          '</div>' +
          '<div class="break-end-card"><small>' + htmlText(animText('stage_complete', '阶段完成')) + '</small><strong>' + htmlText(animText('the_shellbreak_era_looking_to_the_stars', '破壳纪 · 仰望群星')) + '</strong></div>' +
        '</div>' +
        '<div class="break-controls"><button class="btn" id="breakReplay" type="button">' + htmlText(tr('ui.action.replay', null, '↻ 重播')) + '</button><button class="btn big" id="breakContinue" type="button">' + htmlText(tr('ui.action.skip_animation', null, '跳过动画')) + '</button></div>' +
      '</section>';
    resetModalChrome();
    modal.classList.add('break-modal');
    modal.classList.remove('hidden');
    bodyModalClass(true);

    var stage = el('breakStage'), phaseName = el('breakPhaseName'), counter = el('breakCounter');
    var replay = el('breakReplay'), continueBtn = el('breakContinue');
    var steps = [
      ['intro', animText('drill_charging', '钻机蓄力'), '01 / 04', 0],
      ['impact', animText('drill_meets_the_shell', '钻头触壳'), '02 / 04', 1500],
      ['gaze', animText('merfolk_look_up', '鲛人仰望'), '03 / 04', 3200],
      ['ending', animText('stage_complete', '阶段完成'), '04 / 04', 4900]
    ];
    function setStep(step) {
      if (!stage) return;
      stage.dataset.phase = step[0];
      if (phaseName) phaseName.textContent = step[1];
      if (counter) counter.textContent = step[2];
      /* 2026-11-03：动画结束时不再是「查看结算」—— 破壳不是本局终点 */
      if (continueBtn && step[0] === 'ending') continueBtn.textContent = tr('ui.render.set_step.enter_the_beyond_the_shell_era', null, '进入壳外时代');
    }
    function finish() {
      var report = _breakAnimationReport;
      clearBreakAnimation();
      if (report) {
        if (afterAnimation) afterAnimation();
        else showBreakResult(report);
      }
    }
    function play() {
      clearBreakAnimation();
      _breakAnimationReport = r;
      setStep(steps[0]);
      if (continueBtn) continueBtn.textContent = tr('ui.action.skip_animation', null, '跳过动画');
      for (var i = 1; i < steps.length; i++) {
        (function (step) { _breakAnimationTimers.push(setTimeout(function () { setStep(step); }, step[3])); })(steps[i]);
      }
    }
    if (replay) replay.onclick = play;
    if (continueBtn) continueBtn.onclick = finish;
    play();
  }

  /* 破壳结果面板（2026-11-03）：破壳不再是本局终点，所以这里**不叫结算**。
   * 与 showBreakPanel 的分工：
   *   showBreakResult —— 破壳那一刻的「里程碑结果」：挑战判定 + 壳外时代开启
   *   showBreakPanel  —— 玩家主动轮回时的「账本明细」：本轮拿多少轮回点 / 星屑
   * ⚠️ 这里只有一个出口按钮，且它不写任何账本。点完继续玩 ERA10；
   *   要结算得去底栏「轮回」（askResetRun → doBreak）。
   * ⚠️ 挑战结果必须在这里显示：判定发生在破壳瞬间（challenges.sealRun），
   *   不在这里说，玩家要等下一次轮回结算才知道自己赢了还是超时了。 */
  /* 破壳结果面板（2026-11-03 B 方案，用户拍板）：破壳是本局中段里程碑，不是终点。
   * 与旧版三点差别：
   *   ① 挑战结果从「一行 note」升级成独立块 —— 旧文案玩家读完不知道限制还挂着；
   *   ② 出口变成二选一：结算并轮回 / 解除限制进入壳外时代（不再有「保留限制」这项）；
   *   ③ 解除是一次性的（challenges.release 置 challengeReleased），之后不可再打开。
   * ⚠️ 破壳后挑战限制**不再自动消失**：active() 的判据已从 `!s.broken` 换成
   *   `!s.challengeReleased`，所以这块必须给出「解除」的出口，否则玩家会被自己的挑战锁死。 */
  function showBreakResult(r, after) {
    clearBreakAnimation();
    resetModalChrome();
    r = r || {};
    var s = res();
    var a = s && s.challenge;
    var cd = a && SB.challenges && SB.challenges.byId ? SB.challenges.byId(a.id) : null;
    var qualified = !!(s && SB.prestige && SB.prestige.qualified(s));
    var breakResultPrefix = 'ui.render.show_break_result.';
    function breakResultText(key, fallback, params) { return tr(breakResultPrefix + key, params, fallback); }
    var acctLabel = breakResultText(qualified ? 'settle_and_begin_prestige' : 'settle_and_restart', qualified ? '结算并轮回' : '结算后重开');
    /* 挑战块：goal 型（流浪泰拉 / 水体污染）终点不在破壳，破壳时不该出块。 */
    var ch = '';
    if (cd && !cd.goal) {
      var tier = Math.max(0, Math.min(cd.tiers.length - 1, a.tier | 0));
      var cls = '', head = '', badge = '', body = '';
      if (r.challengeClear) {
        cls = ' ok';
        head = breakResultText('challenge_completed', '挑战达成');
        badge = tr('ui.challenge.status.tier_cleared', null, '已达成');
        body = r.challengeClear.replay
          ? breakResultText('repeating_a_completed_challenge_grants_no_additi', '重复挑战不重复发放永久奖励，本局成绩已计入排行榜。')
          : tr('ui.challenge.result.reward_applied', { reward: r.challengeClear.reward || '' }, '永久奖励已生效：{reward}');
      } else if (r.challengeFailure) {
        cls = ' fail';
        head = breakResultText('challenge_failed', '挑战未通关');
        badge = tr('ui.challenge.status.timed_out', null, '已超时');
        body = tr('ui.challenge.result.time_limit', {
          elapsedTime: SB.challenges.formatClock(r.challengeFailure.elapsed),
          timeLimit: SB.challenges.formatClock(r.challengeFailure.limit)
        }, '用时 {elapsedTime}，超过 {timeLimit} —— 本档奖励未领取。');
      } else if (!qualified) {
        /* 破壳那一刻还没学《神学》：判定挂起，补学后按同一份 seal 补判（challenges.evaluate）。 */
        cls = ' pending';
        head = breakResultText('challenge_evaluation_pending', '挑战判定挂起');
        badge = breakResultText('awaiting_evaluation', '待补判');
        body = breakResultText('challenge_evaluation_after_theology', '本局完成《神学》后，会按破壳那一刻的成绩补判挑战。');
      } else {
        /* 快照条件不满足（峰值人口 / 学者书手超档）：判据被绕过才会走到这，别静默成「没反应」。 */
        cls = ' fail';
        head = breakResultText('challenge_not_completed', '挑战未达成');
        badge = breakResultText('requirements_not_met', '条件不符');
        body = breakResultText('your_results_at_shellbreak_did_not_meet', '破壳那一刻的成绩没有满足本档限制，本档奖励未领取。');
      }
      /* 标题行取「判定结果自带的」名称/档位，而不是当前 s.challenge ——
       * 复核老档时两者可能不是同一条（结果来自 s.challengeOutcome，挑战可能是后开的）。 */
      var cInfo = r.challengeClear || r.challengeFailure || { name: cd.name, label: cd.tiers[tier].label };
      ch = '<div class="bresult' + cls + '">' +
        '<div class="cc-head">' +
        '<span class="cc-icon">' + (cls === ' ok' ? '✓' : (cls === ' fail' ? '✕' : '?')) + '</span>' +
        '<div class="cc-title"><b>' + htmlText(head) + '</b><small>' + htmlText(cInfo.name) + ' · ' + htmlText(cInfo.label) + '</small></div>' +
        '<span class="cc-badge">' + htmlText(badge) + '</span></div>' +
        '<div class="cc-reward">' + htmlText(body) + '</div>' +
        '<div class="cc-hint">' + htmlText(breakResultText('challenge_restrictions_are_still_active_choose_h', '挑战的限制仍然生效 —— 选一项继续：')) + '</div>' +
        '<div class="cc-actions">' +
        '<button class="btn" id="mCycle">' + htmlText(acctLabel) + '</button>' +
        '<button class="btn big" id="mRelease">' + htmlText(breakResultText('release_the_restrictions_and_enter_the_beyond', '解除限制，进入壳外时代')) + '</button>' +
        '</div></div>';
    }
    var tideLine = r.locked
      ? '<div class="note" style="color:var(--red)">' + htmlText(breakResultText('theology_isn_t_complete_this_run_so', '本局尚未完成《神学》，现在轮回不发放轮回点。研究完《神学》再结算即可。')) + '</div>'
      : '<div class="note">' + htmlText(tr('ui.prestige.result.available_rewards', {
        prestigePoints: (r.tidePoints || 0).toFixed(2), stardust: r.stardust || 0
      }, '当前可结算：{prestigePoints} 轮回点 · {stardust} 星屑。随时可领取。')) + '</div>';
    var box = el('modalBox');
    box.innerHTML =
      '<h3>' + htmlText(breakResultText('the_shell_has_broken', '天壳裂开了')) + '</h3>' +
      '<div class="note">' + htmlText(breakResultText('the_stars_beyond_the_ice_shell_are', '冰壳之外的星空已经打开。')) + ' <b>' +
        htmlText(breakResultText('this_run_isn_t_over', '本局不会结束')) + '</b> ' +
        htmlText(breakResultText('you_can_keep_building_launch_sites_and', '轨道发射场、戴森球、星图与星空槽都可以继续建设，发展分和星屑也还能接着攒。')) + '</div>' +
      tideLine + ch +
      (ch ? '' :
        '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
        '<button class="btn big" id="mGo">' + htmlText(breakResultText('enter_the_beyond_the_shell_era', '进入壳外时代')) + '</button></div>');
    el('modal').classList.remove('hidden');
    bodyModalClass(true);
    /* 关面板 + 落盘 + 重绘。keepAfter 才接着弹离线明细 ——
     * 选「结算并轮回」时周目已经换了，那张明细里的离线收益对新周目没有意义，不再追着弹。 */
    function leave(keepAfter) {
      hideModal();
      if (SB.game && SB.game.markDirty) SB.game.markDirty();
      if (SB.game && SB.game.renderAll) SB.game.renderAll();
      if (keepAfter && after) after();
    }
    if (el('mRelease')) el('mRelease').onclick = function () {
      /* 一次性：release 置 challengeReleased=true，之后 active() 再也不返回本局挑战。 */
      if (SB.challenges && SB.challenges.release) SB.challenges.release(s);
      leave(true);
    };
    if (el('mCycle')) el('mCycle').onclick = function () {
      if (SB.game && SB.game.settleAndCycle) SB.game.settleAndCycle();
      else { if (SB.game.settleBreak) SB.game.settleBreak(); if (SB.game.nextCycle) SB.game.nextCycle(); }
    };
    if (el('mGo')) el('mGo').onclick = function () {
      /* 非挑战局 / goal 型挑战（流浪泰拉、水体污染）：破壳不是它们的终点，也没有「本轮挑战限制」
       * 要撤 —— goal 型的 active() 仍按 !s.broken 判，破壳即失效。 */
      leave(true);
    };
  }

  /* 轮回结算面板（2026-10-02 重设）：契约与 prestige.breakReport 对齐 ——
   *   r: { P, popScore, buildingScore, developmentScore, q, shellFactor, tidePoints, stardust,
   *        relicTourism, oldArtwork, oldTideStele, locked }。
   * ⚠️ 不再有「人口门槛 / POP_GATE / 破层级数」那套旧口径：资格门 = 本局《神学》（由 doBreak 判定，
   *   未达则 r.locked=true、tidePoints=0）。面板只负责把报告渲染出来，判据不在这。 */
  function showBreakPanel(r) {
    clearBreakAnimation();
    /* ⚠️ 必须先归一化外壳：离线结算（offline-summary-modal）等类残留会把这张面板压成竖排。
     *   见 resetModalChrome 的注释（2026-10-29 玩家事故）。 */
    resetModalChrome();
    var m = meta();
    var box = el('modalBox');
    function breakPanelText(key, fallback, params) { return tr('ui.render.show_break_panel.' + key, params, fallback); }
    var settled = !!(res() && res().breakSettled);
    var workshopWeight = (CFG.TIDE && CFG.TIDE.CRAFT_W) || 4;
    var rows =
      '<div class="kv"><span>' + htmlText(breakPanelText('peak_population_p', '峰值族民 P')) + '</span><b>' + (r.P || 0) + '</b></div>' +
      '<div class="kv"><span>' + htmlText(breakPanelText('population_score', '人口分')) + '</span><b>' + (r.popScore || 0).toFixed(1) + '</b></div>' +
      '<div class="kv"><span>' + htmlText(breakPanelText('building_score_weighted_by_era', '建筑分（按纪元加权）')) + '</span><b>' + (r.buildingScore || 0).toFixed(1) + '</b></div>' +
      '<div class="kv"><span>' + htmlText(tr('ui.prestige.score.workshop_unlocks', { workshopCount: r.workshopCount || 0, workshopWeight: workshopWeight }, '工坊解锁项（{workshopCount} × {workshopWeight}）')) + '</span><b>' + (r.craftScore || 0).toFixed(1) + '</b></div>' +
      '<div class="kv"><span>' + htmlText(breakPanelText('total_development_score', '总发展分')) + '</span><b>' + (r.developmentScore || 0).toFixed(1) + '</b></div>' +
      '<div class="kv"><span>' + htmlText(breakPanelText('shellbreak_progress', '破壳进度')) + '</span><b>' + (r.q != null ? (r.q * 100).toFixed(0) : '0') + '%</b></div>' +
      '<div class="kv" style="border:0;margin-top:8px"><span>' + htmlText(breakPanelText(settled ? 'prestige_points_earned_this_time' : 'estimated_prestige_points', settled ? '本次获得轮回点' : '当前预估轮回点')) + '</span><b style="color:var(--amber);font-size:17px">' + (r.tidePoints || 0).toFixed(2) + '</b></div>' +
      (!r.locked ? '<div class="kv"><span>' + htmlText(breakPanelText(settled ? 'stardust_earned_this_time' : 'estimated_stardust', settled ? '本次获得星屑' : '当前预估星屑')) + '</span><b style="color:#82ddff;font-size:17px">' + (r.stardust || 0) + '</b></div>' : '');
    var extra = '';
    if (r.challengePointMul > 1 && !r.challengeClear) extra += '<div class="note">' + htmlText(tr('ui.challenge.result.prestige_bonus', {
      prestigePointBonus: Math.round((r.challengePointMul - 1) * 100) + '%'
    }, '挑战通关永久加成：轮回点获取 +{prestigePointBonus}')) + '</div>';
    /* 2026-11-02 挑战可重打：重复通关既没有永久奖励、也不加 +10%，原文案会写出
     * 「永久获得 null」并谎称再加 10%。按 replay 标记分两句。 */
    if (r.challengeClear) extra += '<div class="note">' + htmlText(r.challengeClear.replay
      ? tr('ui.challenge.result.repeated_clear', {
        challengeName: r.challengeClear.name || '', tierName: r.challengeClear.label || ''
      }, '再次通关：{challengeName} · {tierName}。重复通关不再发放永久奖励；本局成绩已计入排行榜。')
      : tr('ui.challenge.result.clear_reward', {
        challengeName: r.challengeClear.name || '', tierName: r.challengeClear.label || '',
        reward: r.challengeClear.reward || '', prestigePointBonus: '10%'
      }, '挑战通关：{challengeName} · {tierName}。永久奖励：{reward}。之后轮回点获取增加 {prestigePointBonus}。')) + '</div>';
    var challengeFailureNote = r.challengeFailure ? '<div class="note" style="color:var(--red)">' + htmlText(tr('ui.challenge.result.failed_time', {
      challengeName: r.challengeFailure.name || '', tierName: r.challengeFailure.label || '',
      elapsedTime: SB.challenges.formatClock(r.challengeFailure.elapsed),
      timeLimit: SB.challenges.formatClock(r.challengeFailure.limit)
    }, '挑战未通关：{challengeName} · {tierName} 超时（用时 {elapsedTime}，限时 {timeLimit}），本档奖励未领取。重开本周目后可重试。')) + '</div>' : '';
    if (challengeFailureNote) extra += challengeFailureNote;
    if (r.relicTourism) extra += '<div class="note">' + htmlText(tr('ui.prestige.legacy.wonders', {
      wonderCount: r.relicTourism, researchBonus: '1%'
    }, '新入藏奇观 {wonderCount} 座（每座增加科技与市政点获取 {researchBonus}）。')) + '</div>';
    if (r.oldArtwork) extra += '<div class="note"><b>' + htmlText(tr('ui.prestige.legacy.artworks.name', null, '旧日艺术品')) + '</b>：' +
      htmlText(tr('ui.prestige.legacy.artworks.count', { artworkCount: r.oldArtwork }, '{artworkCount} 件')) + '。' +
      htmlText(tr('ui.prestige.legacy.artworks.note', null, '旧日艺术品会持续产出市政点。')) + '</div>';
    if (r.oldTideStele) extra += '<div class="note"><b>' + htmlText(tr('ui.prestige.legacy.tide_steles.name', null, '旧日潮纹碑石')) + '</b>：' +
      htmlText(tr('ui.prestige.legacy.tide_steles.count', { steleCount: r.oldTideStele }, '{steleCount} 件')) + '。' +
      htmlText(tr('ui.prestige.legacy.tide_steles.note', null, '旧日潮纹碑石会持续产出科技点。')) + '</div>';
    var note = r.locked
      ? '<div class="note" style="color:var(--red)">' + htmlText(breakPanelText('theology_requirement_not_met_this_run_no', '本局未达《神学》资格门，不发放轮回点、不解锁商店。')) + '</div>' + challengeFailureNote
      : (res() && !res().breakSettled
        ? '<div class="note">' + htmlText(breakPanelText('this_is_only_an_estimate_keep_developing', '这只是当前预估，留在本局继续发展后，轮回结算会按最新进度重新计算。')) + '</div>'
        : (extra || '<div class="note">' + htmlText(tr('ui.prestige.settlement.formula', {
          prestigePointBase: 1,
          developmentMultiplier: (CFG.TIDE && CFG.TIDE.LINEAR_K) || 0.04,
          populationWeight: 2
        }, '轮回点 = {prestigePointBase} + floor(发展分 × {developmentMultiplier} × 破壳系数)；发展分 = {populationWeight} × 峰值族民 + 建筑纪元分 + 工坊解锁项。')) + '</div>'));
    /* 2026-11-03：这张面板现在只服务「主动轮回」（破壳那一刻走 showBreakResult），
     * 所以标题固定「轮回结算」—— 别再按 shell<=0 叫「冰壳裂开了」，那会让玩家
     * 以为破壳和结算是同一件事。 */
    box.innerHTML =
      '<h3>' + htmlText(breakPanelText('prestige_settlement', '轮回结算')) + '</h3>' +
      rows +
      note +
      '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
      '<button class="btn big" id="mNext">' + htmlText(breakPanelText(settled ? 'begin_prestige' : 'settle_and_claim_prestige_points', settled ? '开始轮回' : '结算并发放轮回点')) + '</button></div>';
    el('modal').classList.remove('hidden'); bodyModalClass(true);
    /* 2026-11-03：删掉「探索壳外的星空」（原 mStay）。
     * 那个按钮的全部作用是把 s.broken 改回 false，让本局继续 —— 破壳不再停摆之后
     * 它既无意义又有害：改回 false 会让挑战限制在破壳后重新生效（active() 的 !s.broken）。 */
    if (res() && res().breakSettled) {
      el('mNext').textContent = (m && m.religionSeen)
        ? breakPanelText('begin_prestige', '开始轮回')
        : breakPanelText('restart_this_run', '重开本周目');
      el('mNext').onclick = function () { SB.game.nextCycle(); };
    } else {
      el('mNext').textContent = SB.prestige.qualified(res())
        ? breakPanelText('settle_and_claim_prestige_points', '结算并发放轮回点')
        : breakPanelText('settle_and_restart', '结算后重开');
      el('mNext').onclick = function () { SB.game.settleBreak(); };
    }
  }

  /* body.modal-open 的开关（2026-09-30）：配合 main.css 的
   * `body.modal-open .tabs{pointer-events:none}` —— tab 栏抬到弹窗覆盖层之上让
   * 人口进度条可见，但弹窗期间禁止点 tab。⚠️ 必须走守卫：e2e 的假 document 没有
   * body，裸调 document.body.classList 会 TypeError 打断回归。 */
  function bodyModalClass(on) {
    var b = (typeof document !== 'undefined') && document && document.body;
    if (b && b.classList) { if (on) b.classList.add('modal-open'); else b.classList.remove('modal-open'); }
  }

  /* 弹窗外壳归一化（2026-10-29 实装）。
   * 【#modal / #modalBox 上有一批「变体类」决定排版】offline-summary-modal（报表 flex 布局）、
   *   break-modal（padding:0 / overflow:hidden）、tree-modal + tree-tech/civic（宽版树图）、
   *   void-ending-modal、story-modal、gov-picker-modal；box 侧有 tree-detail-box / story-box。
   * 【为什么必须有这个函数】这些类只能由「当前这张面板」自己加。任何一处只 remove('hidden')
   *   就上屏，就会整块继承上一张面板的排版 —— 这就是真实事故：离线结算（offline-summary-modal）
   *   的类残留在 #modal 上，随后弹出的破壳结算面板被套上 flex 报表布局，中文 min-content = 1 字符
   *   ⇒ 每行塌成一列、从左侧横铺、两个按钮压成 1 字宽（视觉上「没有任何可点项」），玩家看到的是
   *   「卡在竖排文字界面，点哪都没反应」，且 pendingBreak 每次启动都重弹 ⇒ 重启多少遍都一样。
   *   取证：tmp/_probe_break_proof.mjs（360×780 前后对照，逐像素同构）。
   * 【纪律】凡是往 #modal 里写内容的函数，写之前先 resetModalChrome()，再 add 自己的变体类。
   *   不许再靠「记得删掉哪几个类」——漏删 offline-summary-modal 正是这样发生的。 */
  var MODAL_VARIANT_CLASSES = ['offline-summary-modal', 'tree-modal', 'tree-tech', 'tree-civic',
    'break-modal', 'void-ending-modal', 'terra-ending-modal', 'void-civic-modal', 'story-modal', 'gov-picker-modal'];
  var MODAL_BOX_VARIANT_CLASSES = ['tree-detail-box', 'story-box'];
  function resetModalChrome() {
    var modal = el('modal'), box = el('modalBox'), i;
    if (modal && modal.classList) {
      for (i = 0; i < MODAL_VARIANT_CLASSES.length; i++) modal.classList.remove(MODAL_VARIANT_CLASSES[i]);
    }
    if (box && box.classList) {
      for (i = 0; i < MODAL_BOX_VARIANT_CLASSES.length; i++) box.classList.remove(MODAL_BOX_VARIANT_CLASSES[i]);
      /* 用存在性判断而不是直接调：无 DOM 的验收桩未必实现 removeAttribute。 */
      if (box.removeAttribute) {
        box.removeAttribute('role');
        box.removeAttribute('aria-modal');
        box.removeAttribute('aria-labelledby');
      }
    }
  }

  function hideModal() {
    clearBreakAnimation();
    clearDysonAnimation();
    var modal = el('modal');
    resetModalChrome();
    modal.classList.add('hidden');
    bodyModalClass(false);
  }

  var infoParts = SB.ui.renderParts.info;
  var linkInfoNames = infoParts.linkInfoNames;
  var showTreeDetail = infoParts.showTreeDetail;
  var showBuildingInfo = infoParts.showBuildingInfo;
  var showWonderInfo = infoParts.showWonderInfo;
  var showPolicyInfo = infoParts.showPolicyInfo;
  var showWorkshopInfo = infoParts.showWorkshopInfo;
  function openWorkshopFromInfo() {
    var s = SB.game && SB.game.run ? SB.game.run() : null;
    if (s && s.lvl && s.lvl.workshop > 0) {
      hideModal();
      SB.game.setTab('workshop');
    } else {
      showBuildingInfo('workshop');
    }
  }
  /* 通用确认框。danger: true 时确认键走红色配色。
   * requireCheck 存在时确认键初始禁用，必须勾上才能执行——不可逆操作靠这一步兜底，
   * 不靠「再点一次」这种玩家会顺手连点的惯性。 */
  function confirmPanel(o) {
    var box = el('modalBox');
    box.innerHTML =
      '<h3>' + (o.title || tr('ui.render.confirm_panel.confirm', null, '确认')) + '</h3>' + (o.body || '') +
      (o.requireCheck
        ? '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:10px 0;color:var(--dim);line-height:1.6">' +
          '<input type="checkbox" id="mChk" style="margin-top:2px">' + o.requireCheck + '</label>'
        : '') +
      '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
      '<button class="btn" id="mCancel">' + tr('save.action.cancel', null, '取消') + '</button>' +
      '<button class="btn' + (o.danger ? ' danger' : '') + '" id="mOk">' + (o.ok || tr('ui.render.confirm_panel.confirm', null, '确定')) + '</button></div>';
    resetModalChrome();
    el('modal').classList.remove('hidden'); bodyModalClass(true);
    var okBtn = el('mOk'), chk = el('mChk');
    el('mCancel').onclick = hideModal;
    if (chk) {
      okBtn.disabled = true;
      chk.onchange = function () { okBtn.disabled = !chk.checked; };
    }
    okBtn.onclick = function () { hideModal(); if (o.onOk) o.onOk(); };
  }

  /* 含无上限原料的配方沿用既有批次档，在单独弹窗里填写批次数。
   * 不能把数字输入框塞进每 2 秒重画一次的工坊 pane，否则输入时会丢焦点/丢值。 */
  function openAutoBatchDialog(id) {
    var s = res(), c = SB.workshop && SB.workshop.craftById(id);
    if (!s || !c || !SB.workshop.hasUnboundedInput(s, c)) return false;
    var box = el('modalBox'), modal = el('modal');
    var current = SB.workshop.slotBatch(s, id);
    var max = (CFG.AUTO && CFG.AUTO.BATCH_MAX) || 9007199254740991;
    var recipeName = htmlText(SB.i18n && SB.i18n.contentName ? SB.i18n.contentName(id, c.name) : c.name);
    box.innerHTML =
      '<div class="modal-hd"><b>' + tr('ui.render.open_auto_batch_dialog.automatic_crafting_batch', null, '自动制造批次') + '</b><button type="button" class="modal-x" data-modal-close="1" aria-label="' + tr('ui.action.close', null, '关闭') + '">×</button></div>' +
      '<p style="color:var(--dim);line-height:1.6;margin:0 0 14px">' + tr('ui.workshop.batch_dialog.description', { recipeName: recipeName }, recipeName + '：配方含无上限原料，沿用批次自动制造；所有原料足够制造你填写的数量时，自动制造这一整批。') + '</p>' +
      '<label for="autoBatchInput" style="display:block;margin-bottom:6px">' + tr('ui.render.open_auto_batch_dialog.crafts_per_batch', null, '每批制造次数') + '</label>' +
      '<input id="autoBatchInput" type="number" min="1" max="' + max + '" step="1" inputmode="numeric" value="' + current + '"' +
      ' style="box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel2);color:var(--text);font:inherit">' +
      '<div id="autoBatchError" role="alert" style="min-height:18px;margin-top:6px;color:var(--red);font-size:12px"></div>' +
      '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
      '<button type="button" class="btn" data-modal-close="1">' + tr('save.action.cancel', null, '取消') + '</button>' +
      '<button type="button" class="btn buy" id="autoBatchSave">' + tr('ui.render.open_auto_batch_dialog.save', null, '保存') + '</button></div>';
    resetModalChrome();
    modal.classList.remove('hidden'); bodyModalClass(true);
    var input = el('autoBatchInput'), save = el('autoBatchSave');
    function saveBatch() {
      var raw = String(input.value || '').trim();
      var batch = Number(raw);
      var error = el('autoBatchError');
      if (!/^\d+$/.test(raw) || !isFinite(batch) || Math.floor(batch) !== batch || batch < 1 || batch > max) {
        error.textContent = tr('ui.workshop.batch_dialog.invalid_count', { min: 1, max: max }, '请输入 {min} 到 {max} 之间的整数。');
        return;
      }
      var live = res();
      if (!live || !SB.workshop.setSlotBatch(live, id, batch)) {
        error.textContent = tr('ui.render.save_batch.couldn_t_save_this_automation_slot_is', null, '保存失败：自动槽已不可用，请检查工坊升级与槽位。');
        return;
      }
      hideModal();
      SB.game.markDirty(); SB.game.renderAll();
    }
    save.onclick = saveBatch;
    input.onkeydown = function (e) { if (e.key === 'Enter') saveBatch(); };
    if (input.focus) input.focus();
    return true;
  }

  /* 叙事弹窗：科研面板开门那一刻的台词（文案由用户 2026-09-25 给定，
   * 设计出处 docs/TECH_TREE_v0.3.md §2.1）。
   * 【它不承担任何机制】不揭示别的科技、不折算研究进度、不等于「两个结 = 两项科技」。
   * 触发与「面板变亮」是同一时刻的两件事：调用方在 game.maybeSciencePopup，这里只管表现。 */
  function storyPanel(o) {
    var box = el('modalBox'), modal = el('modal'), i;
    var storySlugs = { tech: 'technology', civic: 'civics', faith: 'faith', workshop: 'workshop',
      wonder: 'wonder', 'star-map': 'star_map', company: 'company', prestige: 'prestige' };
    var storySlug = storySlugs[o.kind] || '';
    function storyText(field, fallback) {
      return storySlug ? tr('game.story.unlock.' + storySlug + '.' + field, null, fallback) : (fallback || '');
    }
    var kind = o.kind || 'unlock';
    var isTech = kind === 'tech';
    var icon = o.icon || (isTech ? '⌘' : '✦');
    var kicker = o.kicker || tr(isTech ? 'ui.render.story_panel.technology_tree_unlocked' : 'ui.render.story_panel.new_system_unlocked', null, isTech ? '科技树已开放' : '新系统解锁');
    var title = storyText('title', o.title || '');
    var lines = (o.lines || []).map(function (line, index) {
      return storyText('line_' + (index + 1), line);
    });
    var unlockTitle = storyText('system_title', o.unlockTitle || tr(
      isTech ? 'ui.render.story_panel.technology_tree_unlocked' : 'ui.render.story_panel.new_system_unlocked',
      null, isTech ? '科技树已开放' : '新系统解锁'));
    var unlockCopy = storyText('system_description', o.unlockCopy || tr(
      isTech ? 'ui.render.story_panel.you_can_now_research_technologies_and_view' : 'ui.render.story_panel.new_content_has_been_added_to_your',
      null, isTech ? '现在可以研究科技，并查看每项科技的尤里卡条件。' : '新的内容已经加入你的文明。'));
    var action = storyText('action', o.ok || tr('ui.render.anonymous_function.got_it', null, '知道了'));
    resetModalChrome();
    modal.classList.add('story-modal');
    box.classList.add('story-box');
    box.innerHTML =
      '<div class="story-kicker"><span class="story-kicker-icon" aria-hidden="true">' + icon + '</span><span>' + htmlText(kicker) + '</span><i aria-hidden="true"></i></div>' +
      '<div class="story-hero"><div class="story-hero-icon" aria-hidden="true">' + icon + '</div><div class="story-hero-copy"><h3>' + htmlText(title) + '</h3><span class="story-state">' + htmlText(tr('ui.status.new', null, '新')) + '</span></div></div>' +
      '<div class="story-rule" aria-hidden="true"></div>' +
      '<div class="story">' + lines.map(function (x) {
        return '<p>' + htmlText(x) + '</p>';
      }).join('') + '</div>' + (o.body || '') +
      (unlockCopy ? '<div class="story-unlock"><span class="story-unlock-mark" aria-hidden="true">✓</span><div><strong>' + htmlText(unlockTitle) + '</strong><small>' + htmlText(unlockCopy) + '</small></div></div>' : '') +
      '<div class="foot story-actions"><button class="big" id="mStoryOk">' + htmlText(action) + '<span aria-hidden="true">→</span></button></div>';
    modal.classList.remove('hidden'); bodyModalClass(true);
    el('mStoryOk').onclick = function () { hideModal(); if (o.onOk) o.onOk(); };
  }

  /* 页签的解锁态：只服务于「科技面板未开门」这一次性 gate（其余 tab 一律可点）。
   * 灰掉而不是隐藏，是为了给玩家一个「这里将来会有东西」的预期；
   * 点不动由两道闸兜住：这里（onclick 直接返回）与 game.setTab 里那道。 */
  function techTabOpen() {
    var s = res();
    if (!SB.tech || !SB.tech.panelOpen) return true;
    return !!SB.tech.panelOpen(s);
  }
  function workshopTabOpen() {
    var s = res();
    return !!(s && s.lvl && s.lvl.workshop > 0);
  }
  function syncTabLocks() {
    var tabs = document.querySelectorAll('.tab'), open = techTabOpen(), i;
    for (i = 0; i < tabs.length; i++) {
      if (tabs[i].dataset.tab !== 'tech') continue;
      tabs[i].classList.toggle('locked', !open);
      /* 用赋空串而不是 removeAttribute：前者到处都支持，后者在无 DOM 的验收桩里会炸。 */
      tabs[i].title = open ? '' : tr('ui.render.sync_tab_locks.build_five_kelp_farms_to_see_what_tomorrow_holds');
    }
    /* 市政页的灰态与科技页是**两件事**：开门条件不同（议事厅 vs 5 座藻场），
     * 所以这里要单独判一次，不能跟着 tech 走——否则玩家建起议事厅、市政页还是灰的。 */
    var civ = document.querySelector('.tab[data-tab="civic"]');
    if (civ) {
      var cs = res(), cop = !!(SB.civic && cs && SB.civic.panelOpen(cs));
      civ.classList.toggle('locked', !cop);
      civ.title = cop ? '' : tr('ui.render.sync_tab_locks.unlock_after_building_the_council_hall_unlocked');
    }
    /* 工坊页的灰态同样得单独判：它的门是「建成工坊」这座建筑本身，
     * 与科技页的 5 座藻场、市政页的议事厅都不是一件事。 */
    var wk = document.querySelector('.tab[data-tab="workshop"]');
    if (wk) {
      var wop = workshopTabOpen();
      wk.classList.toggle('locked', !wop);
      wk.title = wop ? '' : tr('ui.render.sync_tab_locks.build_a_workshop_to_unlock_this_tab');
    }
    /* 奇观页的灰态：**第三个独立门槛** —— 石工那项科技。
     * ⚠️ 它的门是「研究过石工」，与上面三个（5 座藻场 / 议事厅 / 建成工坊）都不相同，
     *    所以必须单独判一次，不能顺手挂到任何一个下面。 */
    var wd = document.querySelector('.tab[data-tab="wonder"]');
    if (wd) {
      var s = res(), dop = !!(s && s.techs && s.techs.masonry);
      wd.classList.toggle('locked', !dop);
      wd.title = dop ? '' : tr('ui.render.sync_tab_locks.research_masonry_to_unlock_this_tab');
    }
    /* 局外商店（meta 页）的灰态：首次合格轮回开放轮回点区，首座卫星开放星屑区。 */
    var mt = document.querySelector('.tab[data-tab="meta"]');
    if (mt) {
      var mopen = !!((meta() && meta().shopUnlocked) || stardustShopOpen());
      mt.classList.toggle('locked', !mopen);
      mt.title = mopen ? '' : tr('ui.render.sync_tab_locks.unlock_after_your_first_prestige_or_after');
    }
    var ch = document.querySelector('.tab[data-tab="challenges"]');
    if (ch) {
      var chopen = !!(meta() && meta().shopUnlocked);
      ch.classList.toggle('locked', !chopen);
      ch.title = chopen ? '' : tr('ui.render.sync_tab_locks.unlocks_after_your_first_prestige');
    }
    /* 成就页签（2026-10-24 从「挑战与成就」拆出）：门与挑战页**同一个**
     * （meta.shopUnlocked = 首次轮回），不另立判据——两个页签本就是一门两页。 */
    var ac = document.querySelector('.tab[data-tab="achievements"]');
    if (ac) {
      var acopen = !!(meta() && meta().shopUnlocked);
      ac.classList.toggle('locked', !acopen);
      ac.title = acopen ? '' : tr('ui.render.sync_tab_locks.unlocks_after_your_first_prestige_sb_005137');
    }
    /* 信仰页的灰态：**第五个独立门槛** —— 神学（与资源行 / 产出线的 gate 同源：
     *   resUnlocked(s,'faith') ⇔ s.civics.theology），不在这里另立一份判据。 */
    var ft = document.querySelector('.tab[data-tab="faith"]');
    if (ft) {
      var fs2 = res(), fop = !!(SB.economy && fs2 && SB.economy.resUnlocked(fs2, 'faith'));
      ft.classList.toggle('locked', !fop);
      ft.title = fop ? '' : tr('ui.render.sync_tab_locks.research_theology_to_unlock_the_faith_tab');
    }
    /* 公司页的灰态：**第六个独立门槛** —— 宏观经济学（与 tab 灰态、公司成立触发同源：
     *   s.civics.macroeconomics ⇔ 公司系统解锁），不在这里另立一份判据。 */
    var cp = document.querySelector('.tab[data-tab="company"]');
    if (cp) {
      var cs2 = res(), copn = !!(cs2 && cs2.civics && cs2.civics.macroeconomics);
      cp.classList.toggle('locked', !copn);
      cp.title = copn ? '' : tr('ui.render.sync_tab_locks.research_macroeconomics_to_unlock_the_companies_');
    }
    var sm = document.querySelector('.tab[data-tab="star-map"]');
    if (sm) {
      var ss = res(), sop = !!(ss && (ss.shellOpened || ss.breakSettled) && ss.shell <= 0);
      sm.classList.toggle('locked', !sop);
      sm.title = sop ? '' : tr('ui.render.sync_tab_locks.break_through_the_shell_to_unlock_the');
    }
  }

  /* 科技 / 市政页签的「可研究」红点：各自分类存在当前即可研究的项时点亮（活指示，不记 localStorage）。
   * 复用 SB.tech/civic.hasResearchable（与节点「可研究」状态同源）；面板未开（locked）不亮。
   * 每次 PANE_REFRESH 重算 —— 尤里卡/鼓舞达成或攒够点数，红点应即时出现/消失。 */
  function syncTabResearchDots() {
    var doc = (typeof document !== 'undefined') ? document : null;
    if (!doc) return;
    var s = res();
    var tt = doc.querySelector('.tab[data-tab="tech"]');
    if (tt) {
      var techOn = !!(SB.tech && SB.tech.hasResearchable && techTabOpen() && SB.tech.hasResearchable(s));
      tt.classList.toggle('avail', techOn);
    }
    var ct = doc.querySelector('.tab[data-tab="civic"]');
    if (ct) {
      var cop = !!(SB.civic && SB.civic.panelOpen && s && SB.civic.panelOpen(s));
      var notices = cop && civicNoticeState ? civicNoticeState(s) : { emptySlots: 0, researchable: false };
      var civOn = cop && (notices.emptySlots > 0 || notices.researchable);
      ct.classList.toggle('avail', civOn);
      if (cop) {
        var reasons = [];
        if (notices.emptySlots > 0) reasons.push(tr('ui.tab.civic.empty_policy_slots', { emptySlotCount: notices.emptySlots }));
        if (notices.researchable) reasons.push(tr('civic.tab.researchable.status'));
        ct.title = reasons.join(' · ');
      }
    }
    var ft = doc.querySelector('.tab[data-tab="faith"]');
    if (ft) {
      var faithOpen = !!(SB.economy && s && SB.economy.resUnlocked(s, 'faith'));
      ft.classList.toggle('avail', faithOpen && !!(SB.faith && SB.faith.hasPending && SB.faith.hasPending(s)));
    }
    /* 奇观页签「可建造」红点（2026-10-20）：复用 masonry 门（与 syncTabLocks:1259 同源）
     * + wonderBlocked 门禁（与 render-pane-wonder.js:39 面板「可建造」绿色按钮同源），绝不另立判据。
     * 仅「已解锁且当前材料足够、可立即建造」才亮（用户拍板语义）；活指示不记 localStorage，
     * 与科技/市政页签红点一致。syncTabResearchDots 每次 PANE_REFRESH 重算（render.js:547）。 */
    var wt = doc.querySelector('.tab[data-tab="wonder"]');
    if (wt) {
      var s2 = s, wUnlocked = !!(s2 && s2.techs && s2.techs.masonry);
      var wonderOn = false;
      if (wUnlocked && SB.workshop && SB.wonder) {
        var WL = SB.wonder.list(), wi;
        for (wi = 0; wi < WL.length; wi++) {
          var wid = WL[wi].id;
          if (s2.wonders && s2.wonders[wid]) continue;        // 已建成
          if (SB.workshop.wonderBlocked(s2, wid)) continue;   // 未解锁 / 材料不足
          wonderOn = true; break;
        }
      }
      wt.classList.toggle('avail', wonderOn);
      if (wonderOn) wt.title = tr('ui.render.sync_tab_research_dots.a_wonder_is_ready_to_build');
    }
    /* 工坊页签「升级项可购买」红点（2026-10-21 用户）：复用 hasPurchasable（与升级项
     * 二级标签同源、与结算同式），仅工坊已建成（解锁）时亮。活指示，每次 PANE_REFRESH 重算。 */
    var wkt = doc.querySelector('.tab[data-tab="workshop"]');
    if (wkt) {
      var wkUnlocked = !!(s && s.lvl && s.lvl.workshop > 0);
      var wkOn = wkUnlocked && SB.workshop && SB.workshop.hasPurchasable && SB.workshop.hasPurchasable(s);
      wkt.classList.toggle('avail', wkOn);
      if (wkOn) wkt.title = (wkt.title ? wkt.title + ' · ' : '') + tr('ui.tab.workshop.upgrades_available');
    }
  }


    /* 公司页（ERA6 市政《宏观经济学》解锁）：与科技/市政并列。
   * 门 = 拥有《宏观经济学》（与 tab 灰态、公司成立触发同源：s.civics.macroeconomics）。
   * 公司由系统自动成立、名字写存档固定（src/companies.js 按行业分池随机），本页只展示。
   * ⚠️ 2026-10-13 改「单独关闭」：逐家公司独立展示各自的等级 / 升级倒计时 / 关闭 / 重建，
   *   关闭某一家的按钮只解散那一家，不影响其他家。 */


  function initTabs() {
    var tabs = document.querySelectorAll('.tab'), i;
    for (i = 0; i < tabs.length; i++) {
      tabs[i].onclick = (function (node) {
        return function () {
          if (node.dataset.tab === 'tech' && !techTabOpen()) return;
          if (node.dataset.tab === 'workshop' && !workshopTabOpen()) return;
          if (node.dataset.tab === 'meta' && !meta().shopUnlocked && !stardustShopOpen()) return;
          if (node.dataset.tab === 'challenges' && !meta().shopUnlocked) return;
          /* 成就页签与挑战同门（meta.shopUnlocked）——与 setTab 里那道是同一件事写两遍。 */
          if (node.dataset.tab === 'achievements' && !meta().shopUnlocked) return;
          /* 信仰页的门 = 神学（与 setTab 里那道是同一件事写两遍，理由同科技/市政）。
           * 走 resUnlocked 而不是直接读 s.civics.theology：门只有一处定义。 */
          if (node.dataset.tab === 'faith' &&
              !(SB.economy && SB.economy.resUnlocked(res(), 'faith'))) return;
          if (node.dataset.tab === 'star-map' && !(res() && (res().shellOpened || res().breakSettled) && res().shell <= 0)) return;
          /* 高亮不在这里翻 —— 它是 setTab 的一部分（见 game.js 那段注释：
           * 弹窗里那条直达科技的路径也走 setTab，高亮写在事件里就会漏掉那条路）。 */
          SB.game.setTab(node.dataset.tab);
        };
      })(tabs[i]);
    }
    syncTabLocks();
  }
  function initSpeeds() {
    var btns = document.querySelectorAll('.spd'), i;
    for (i = 0; i < btns.length; i++) {
      btns[i].onclick = (function (node) {
        return function () {
          var all = document.querySelectorAll('.spd');
          for (var k = 0; k < all.length; k++) all[k].classList.remove('on');
          node.classList.add('on');
          SB.game.setSpeed(+node.dataset.spd);
        };
      })(btns[i]);
    }
  }

  /* 离线闸门：复用 #modal 全屏遮罩，在离线补算期间锁住整个界面，
   * 玩家必须等补算完成、并点掉离线结算面板，才能操作（用户 2026-09-29 需求：
   * 「离线回来先算完离线进度，才能操作」）。
   * 两阶段：① 补算中 showProgress:true 且不给确认按钮（强制等）；② 结算时换 summary + 继续按钮。 */
  function showOfflineModal(o) {
    o = o || {};
    var box = el('modalBox');
    if (!box || !el('modal')) return false;   // 无 DOM 环境（如离线验收桩）直接跳过
    var modal = el('modal');
    /* ⚠️ 归一化后再加自己的类：清掉的 break-modal / tree-modal / story-modal 等都属于上一张面板，
     *   留着会把离线闸门压成别人的排版。 */
    resetModalChrome();
    if (o.summary) modal.classList.add('offline-summary-modal');
    var html = o.summary ? (o.body || '') : '<h3>' + (o.title || tr('game.offline.report.title', null, '离线')) + '</h3>' + (o.body || '');
    if (o.showProgress) {
      html += '<div class="prog"><i id="offPr" style="display:block;height:100%;width:0%;' +
        'background:linear-gradient(90deg,#2f9e6e,#5be3a4);border-radius:4px"></i></div>' +
        '<div id="offPct" class="note" style="margin-top:8px;color:var(--dim)"></div>';
    }
    if (o.ok) {
      html += o.summary
        ? '<footer class="offline-report-actions"><button class="big" id="mOk">' + o.ok + '<span aria-hidden="true">→</span></button></footer>'
        : '<div class="foot" style="justify-content:flex-end;margin-top:14px"><button class="big" id="mOk">' + o.ok + '</button></div>';
    }
    box.innerHTML = html;
    modal.classList.remove('hidden'); bodyModalClass(true);
    var okBtn = el('mOk');
    if (okBtn) okBtn.onclick = function () {
      /* 关掉的同一刻清外壳：onOk 里可能直接弹破壳结算面板（finishCatchUp 那条链），
       * 面板自己也会归一化一次，这里再清一遍是双保险，成本为零。 */
      resetModalChrome();
      modal.classList.add('hidden');
      bodyModalClass(false); if (o.onOk) o.onOk();
    };
    return true;
  }
  function setOfflineProgress(p) {
    var pr = el('offPr'), pct = el('offPct');
    if (pr) pr.style.width = Math.max(0, Math.min(100, p * 100)).toFixed(1) + '%';
    if (pct) pct.textContent = tr('ui.offline.progress.completed', { progressPercent: (p * 100).toFixed(0) }, '已完成 {progressPercent}%');
  }

  var INTRO = SB.ui.renderContent.INTRO;
  function openIntro(key) {
    var d = INTRO[key]; if (!d) return;
    var pop = el('introPop'); if (!pop) return;
    var token = String(key).replace(/-/g, '_');
    var prefix = 'ui.intro.' + token;
    var params = key === 'folk' ? { kelpThreshold: 20 }
      : key === 'company' ? { eraNumber: 6, luxuryConsumptionIncreasePercent: 10 } : null;
    var title = tr(prefix + '.title', params, d.ttl || '');
    var description = tr(prefix + '.description', params, d.def || '');
    var step = tr(prefix + '.step', params, d.step || '');
    if (key === 'happy') {
      title = tr('ui.happiness.help.title', null, d.ttl || '');
      description = tr('ui.happiness.dynamics.explanation', null, d.def || '');
      step = '';
    }
    pop.innerHTML =
      '<div class="ttl">' + (d.icon || '') + ' ' + title + '</div>' +
      '<div class="def">' + description + '</div>' +
      '<div class="step">' + step + '</div>' +
      '<div class="closebar"><button class="btn" onclick="SB.ui.closeIntro()">' + tr('ui.render.open_intro.got_it', null, '知道了') + '</button></div>';
    var m = el('introMask'); if (m) m.classList.remove('hidden');
    bodyModalClass(true);   /* 弹窗期间禁用 tab 交互（复用 body.modal-open 规则） */
  }
  function closeIntro() {
    var m = el('introMask'); if (m) m.classList.add('hidden');
    bodyModalClass(false);
  }

  /* ── 手机端 ⓘ 信息浮层（2026-10-21 用户「补一个」）────────────────────────────
   * 背景：资源面板奢侈品行把「按幸福 X 计，已剔市政/奇观/卡的 +Y」收进了 `title`
   *   （为了把卡片压回一行高、让整行卡片等高），结果**手机端完全没有入口看到它**。
   * 方案 C（用户跨端约定）：
   *   · 桌面（hover:hover）→ ⓘ 由 CSS 隐藏，保留 .sd 的原生 title hover；
   *   · 触控（hover:none）→ ⓘ 显示，点按弹自定义浮层，内容读 ⚘ 自己的 title。
   * ⚠️ 单一落点：文本只写在 ⓘ 的 title 上，浮层直接读它 —— 不复制第二份字符串，
   *    改文案时不会漏改一处。 */
  function showHoverInfo(txt) {
    if (!document.body) return;
    var layer = el('hoverInfoLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'hoverInfoLayer';
      layer.className = 'hover-info-layer hidden';
      document.body.appendChild(layer);
    }
    layer.textContent = txt || '';      /* textContent：纯文本，绝不 innerHTML 拼接用户输入 */
    layer.classList.remove('hidden');
  }
  SB.ui = SB.ui || {};
  SB.ui.showHoverInfo = showHoverInfo;  /* 导出：供探针/回归直接验证，不写第二份逻辑 */
  /* Esc 关弹窗（防重复绑定：render.js 只加载一次，这里挂一次即可）。 */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        /* ⓘ 浮层最浅 → 先关它，再轮到 intro / 弹窗（与层级顺序一致）。 */
        var hi0 = el('hoverInfoLayer');
        if (hi0 && !hi0.classList.contains('hidden')) { hi0.classList.add('hidden'); return; }
        var intro = el('introMask'), modal = el('modal');
        if (intro && !intro.classList.contains('hidden')) closeIntro();
        else if (modal && !modal.classList.contains('hidden') &&
                 (modal.classList.contains('tree-modal') || modal.classList.contains('gov-picker-modal'))) hideModal();
      } else if (e.key === 'Enter' || e.key === ' ') {
        var infoLink = e.target && e.target.closest ? e.target.closest('.inline-info-link') : null;
        if (infoLink) {
          e.preventDefault();
          if (infoLink.dataset.workshopTab !== undefined) openWorkshopFromInfo();
          else if (infoLink.dataset.buildInfo) showBuildingInfo(infoLink.dataset.buildInfo);
          else if (infoLink.dataset.wonderInfo) showWonderInfo(infoLink.dataset.wonderInfo);
          else if (infoLink.dataset.policyInfo) showPolicyInfo(infoLink.dataset.policyInfo);
        }
      }
    });

    /* ⓘ 点击 → 弹浮层（document 委托：资源面板每帧重画，绑定在节点上会随重画丢失）。
     * ⚠️ 与 input.js 的 onClick 互不干扰：那个只认 data-* 属性，ⓘ 不带任何 data-*。 */
    document.addEventListener('click', function (e) {
      var btn = (e.target && e.target.closest) ? e.target.closest('.hover-info-btn') : null;
      if (!btn) return;
      e.preventDefault();
      showHoverInfo(btn.getAttribute('title') || '');
    }, false);

    /* 点浮层外 / 点ⓘ之外任意处 → 关闭（ⓘ 本身已在上面处理，这里排除掉避免开完立刻关）。 */
    document.addEventListener('click', function (e) {
      var layer = el('hoverInfoLayer');
      if (!layer || layer.classList.contains('hidden')) return;
      if (e.target && e.target.closest) {
        if (e.target.closest('#hoverInfoLayer')) return;
        if (e.target.closest('.hover-info-btn')) return;
      }
      layer.classList.add('hidden');
    }, false);
  }

  SB.ui = SB.ui || {};
  if (root.addEventListener) root.addEventListener('shellbreak:locale-changed', function () {
    if (!SB.game || !SB.game.run || !SB.game.run()) return;
    _lastIdleTag = -1;
    _omenSig = '';
    syncBuildingIconToggle();
    renderAll();
  });

  SB.ui.openIntro = openIntro;     /* 供 index.html 页签「?」按钮 onclick 调用 */
  SB.ui.closeIntro = closeIntro;
  SB.ui.render = {
    renderAll: renderAll, renderTick: renderTick, renderPanes: renderPanes,
    setMetaShopView: setMetaShopView,
    /* 破壳槽 → 星空槽翻转（2026-10-13）：导出供回归直接断言 shellbar 文案翻转，
     * 与 paneWonder/paneCivicGov 同手法（只导出同一个渲染函数，不写第二份逻辑）。 */
    renderShell: renderShell,
    /* 顶栏资源详情面板（2026-10-29）：input.js 的 [data-res-detail] 委托调它。
     * 只读 economy.ratesParts，不写游戏状态。 */
    showResDetail: showResDetail,
    showBreakPanel: showBreakPanel, showBreakResult: showBreakResult, showBreakAnimation: showBreakAnimation, hideModal: hideModal, confirmPanel: confirmPanel,
    /* 2026-11-05：导出供回归直接断言挑战开启前置的常驻条文案（与 paneChallenges 同手法）。 */
    renderChallengeNotice: renderChallengeNotice,
    /* 弹窗外壳归一化（2026-10-29）：导出给 render-info.js（树图详情卡）/ game.js（政体命名框）/
     * save-transfer.js（存档管理）——它们都往同一个 #modal 里写内容，必须先清掉上一张面板的变体类。
     * 见 resetModalChrome 的注释（离线结算类残留把破壳面板压成竖排那次事故）。 */
    resetModalChrome: resetModalChrome,
    /* 星空槽满槽占位结算面板（2026-10-13 镜像破壳）：tickStar 满槽时调它弹面板。
     * 导出是因为 shell.tickStar 通过 SB.ui.render.showStarComplete 调用（与 showBreakPanel 同源）。 */
    showStarComplete: showStarComplete,
    showChallengeComplete: showChallengeComplete,
    /* 设置栏「通关演出回看」（2026-11-03）：bindSettingsExtras 由 game.bootUi 调一次接线，
     * replayTerraSequence 与 canReplayTerra 另外导出供回归直接断言（不依赖真实 DOM）。 */
    bindSettingsExtras: bindSettingsExtras,
    replayTerraSequence: replayTerraSequence, canReplayTerra: canReplayTerra,
    /* ERA10（2026-10-20）：戴森球通关弹窗。economy-tick 2f 段 dysonPct 达 1 时通过
     * SB.ui.render.showDysonComplete 调用（与 tickStar→showStarComplete 同款路径）。 */
    showDysonComplete: showDysonComplete,
    /* ERA10 市政《飞升虚境》：戴森竣工时若已掌握该市政，走这个乱码结局弹窗（tick 侧分叉调用）。 */
    showAscendVoid: showAscendVoid,
    voidCorrupt: voidCorrupt,
    storyPanel: storyPanel, techTabOpen: techTabOpen, syncTabLocks: syncTabLocks,
    initTabs: initTabs, initSpeeds: initSpeeds, techGoEra: techGoEra, scheduleTechJumpTo: scheduleTechJumpTo,
    civicGoEra: civicGoEra, scheduleCivicJumpTo: scheduleCivicJumpTo,
    showOfflineModal: showOfflineModal, setOfflineProgress: setOfflineProgress,
    showTreeDetail: showTreeDetail,
    openAutoBatchDialog: openAutoBatchDialog,
    /* 主页面分区卡片的折叠（2026-09-30）：toggle 供 input.js 的 d.fold 委托调用，
     * applyAllFolds 供启动时按持久化状态落地。
     * 巢穴页**内**的区折叠（2026-09-30 晚）同理由 d.zfold 委托调用 —— 用的也是这一对：
     * 区别只在状态是「落成类」（外层卡片，节点持久）还是「重拼进 HTML」（页内区，会被重画）。 */
    toggleCardFold: toggleCardFold, applyAllFolds: applyAllFolds,
    toggleZoneFold: toggleZoneFold, isZoneFolded: isZoneFolded, zoneColor: zoneColor,
    toggleBuildingIcons: toggleBuildingIcons, buildingIconsShown: buildingIconsShown,
    setCivicView: setCivicView,
    openGovPicker: openGovPicker,
    armCard: armCard, disarmCard: disarmCard, armedCard: getArmedCard,
    cycleJobStep: cycleJobStep, jobStep: getJobStep, paintGrow: paintGrow,
    setWorkshopView: SB.ui.renderParts.setWorkshopView,
    showBuildingInfo: showBuildingInfo,
    openWorkshopFromInfo: openWorkshopFromInfo,
    showWonderInfo: showWonderInfo,
    showPolicyInfo: showPolicyInfo,
    openRankChooser: openRankChooser,
    openChangelog: openChangelog,
    showWorkshopInfo: showWorkshopInfo,
    /* ⚠️ 2026-10-05：工坊「隐藏已完成」开关的切入口。
     *   ⚠️ 切完**必须触发一次整块重画**才生效（不像 zone 折叠能直接翻节点上的类）——
     *   因为「已完成项隐不显示」是渲染时**跳过行**决定的，DOM 上没有可翻的类。
     *   调用方（input.js 委托）负责重画。 */
    toggleHideDone: SB.ui.renderParts.toggleHideDone,
    toggleWonderHideDone: SB.ui.renderParts.toggleWonderHideDone,
    PANE_KEYS: PANE_KEYS,
    /* ⚠️ 2026-10-05：导出 `paneWonder` 供回归直接断言「未解锁的奇观不显示」。
     *   为什么单独导它而不让 e2e 走 renderPanes：那一路是把 HTML 写进假 DOM 的
     *   innerHTML，桩元素不回填 children ⇒ 取不到 `data-wonder` 属性。
     *   门只有一处定义（workshop.wonderBlocked），这里导出的也只是**同一个渲染函数**，
     *   不是另写一份过滤逻辑。 */
    paneWonder: SB.ui.renderParts.paneWonder,
    /* ⚠️ 2026-10-05：导出 `paneCivicGov` 供回归直接断言「未解锁的政体不显示」。
     *   与 paneWonder 同一手法：它只过滤渲染、不写第二份逻辑，门只有一处（govOwned）。 */
    paneCivicGov: paneCivicGov,
    /* ⚠️ 2026-10-26：导出 `paneGovPicker` 供回归断言「候选政体卡含完整效果 + 采纳按钮」。
     *   为什么必须单独导：候选卡住在 openGovPicker 的弹窗里，走 openGovPicker 那条路
     *   是把 HTML 写进假 DOM 的 innerHTML，桩元素不回填 children ⇒ 取不到 `data-gov`。
     *   与 paneGovPicker 同手法：导出的是**同一个渲染函数**，不是另写一份过滤逻辑。
     *   （旧断言测的是已废弃的行式 govrow-* + toggleGovDetail，那套在政体面板重构中被
     *     整体替换，导致 e2e 在 civics.mjs 硬崩、后续断言全跑不到。） */
    paneGovPicker: paneGovPicker,
    /* 2026-10-27：点槽直接选卡。两侧都导出——`panePolicyPicker(s, i)` 出候选卡列表
     * （回归用它断言「只列槽型对口的已解锁卡」），`openPolicyPicker(i)` 出弹窗外壳。 */
    panePolicyPicker: panePolicyPicker,
    openPolicyPicker: openPolicyPicker,
    /* ⚠️ 2026-10-14：导出 `paneCivicSlot` 供回归直接断言「已装槽含 data-remove 卸下按钮」。
     *   与 paneCivicGov 同一手法：只导出同一个渲染函数，不另写逻辑。 */
    paneCivicSlot: paneCivicSlot,
    /* ⚠️ 2026-10-05：导出 `paneMeta`（轮回商店页）供回归直接断言。
     *   【为什么要单独导它】走 renderPanes 那条路取不到属性：假 DOM 的 innerHTML
     *   不回填 children ⇒ 抓不到 `data-perk` / 等级 / 下一档价格。
     *   与 paneWonder 同一理由：导出的也只是**同一个渲染函数**，不是另写一份过滤逻辑。
     *   【它能钉住什么】新加的资源线 perk 是否真的上屏、desc 与 costs 档数是否匹配、
     *   st.next 是否是数字而不是 undefined（那类「undefined 点」的上屏事故就钉在它上面）。 */
    paneMeta: SB.ui.renderParts.paneMeta,
    /* 2026-11-05：导出 `paneStarDome`（星屑商店整棵树）供「天外重压」回归直接断言
     * 「新组上屏 / 三节点都在 / 图标不空」。与 paneMeta 同一手法：走 renderPanes 取不到
     * 属性（假 DOM 的 innerHTML 不回填 children，还有状态签名节流），导的是同一个函数。 */
    paneStarDome: paneStarDome,
    paneChallenges: SB.ui.renderParts.paneChallenges,
    /* ⚠️ 2026-10-24：导出 `paneAchievements`（成就墙独立页签）供回归直接断言
     * 「挑战页不再含成就墙、成就页含三区」——与 paneWonder 同一手法：
     * 只导出同一个渲染函数（render-pane-challenges.js 的 paneAchvWall 包装），
     * 不另写一份过滤逻辑。 */
    paneAchievements: SB.ui.renderParts.paneAchievements,
    /* ⚠️ 2026-10-05：同理导出工坊三段的渲染函数，回归要直接验「未解锁不显示」。
     *   （走 renderPanes 那条路取不到属性：假 DOM 的 innerHTML 不回填 children。） */
    paneToolRows: SB.ui.renderParts.paneToolRows, paneCraftRows: SB.ui.renderParts.paneCraftRows, paneUpgradeRows: SB.ui.renderParts.paneUpgradeRows,
    renderEvent: renderEvent
  };
})(typeof window !== 'undefined' ? window : globalThis);
