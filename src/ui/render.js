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

  /* 页签 / 面板键顺序（也是 renderPanes 的遍历顺序）。faith 紧挨 civic：
   *   两者都是「文明认了什么」的轴（市政=制度，信仰=宗教），语义相邻。 */
  var PANE_KEYS = ['village', 'folk', 'tech', 'civic', 'faith', 'workshop', 'wonder', 'star-map', 'company', 'meta', 'challenges', 'star-dome'];

  function res() { return SB.game.run(); }
  function meta() { return SB.game.meta(); }

  function el(id) { return document.getElementById(id); }

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
    res:      { name: '资源',     color: '#4dd8e6' },
    env:      { name: '自然环境', color: '#a78bfa' },
    village:  { name: '巢穴',     color: '#ffb84d' },
    folk:     { name: '族民',     color: '#4ade80' },
    tech:     { name: '科技',     color: '#7fb8e6' },
    civic:    { name: '市政',     color: '#c4a2ff' },
    faith:    { name: '信仰',     color: '#e691b0' },
    workshop: { name: '工坊',     color: '#f0a45c' },
    wonder:   { name: '奇观',     color: '#ffd166' },
    'star-map': { name: '星图',   color: '#87a7ff' },
    meta:     { name: '轮回商店', color: '#9fb4ff' },
    'star-dome': { name: '星穹商店', color: '#b08bff' }
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
    var m = CARD_META[key] || { name: key, color: 'var(--cyan)' };
    /* 巢穴页的名字随纪元演进（家在长大），其余页用固定名。
     * ⚠️ 取活动局 run() 的 era，2 秒面板重画时会自动跟着纪元走。 */
    var nm = (key === 'village') ? (SB.habitat && SB.habitat.habitatName ? SB.habitat.habitatName(SB.game.run()) : m.name) : m.name;
    return '<div class="cardhd" data-fold="' + key + '" style="--hc:' + m.color +
      '" title="点击折叠 / 展开"><span class="cv">▾</span>' + nm +
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
    n.textContent = BUILDING_ICONS_SHOWN ? '图标：显示' : '图标：隐藏';
    n.title = BUILDING_ICONS_SHOWN ? '点击隐藏建筑图标' : '点击显示建筑图标';
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
      var cls = 'res' + (k === 'kelp' && v < need ? ' neg' : '');
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
        rateTxt = '<i class="rate' + (r > 0 ? ' up' : ' down') + '">' + sign +
          (Math.abs(r) >= 100 ? Math.round(r) : r.toFixed(2)) + '/s</i>';
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
       *   用小一号斜体把供给与消耗直接摆在净值旁边，一眼看出「净不变=需求封顶」而非加成失效。
       * ⚠️ 数字走 happyLedger 同一口（与 tick / 幸福度行同源），render 不自己拼第二份账。 */
      var luxTxt = '';
      if (k === 'luxury' && SB.economy.happyLedger) {
        var LL = SB.economy.happyLedger(s);
        /* ⚠️ 2026-10-06 用户报 bug：「这里的消耗是不是把市政加的这些额外幸福度也算上去了」
         *   —— 是的，那是读数 bug（真结算一直用机制值），已修（economy.happyMech）。
         *   现在把「用于计价的幸福度」也摆出来：有政体/奇观/卡加成时，
         *   玩家能验「人口 × 每人(mechH) = 耗」，不会以为加成被算成了消耗。 */
        luxTxt = ' <i class="sd">产 ' + LL.out.toFixed(2) + ' · 耗 ' + LL.burn.toFixed(2) +
          (Math.abs(LL.bonus) > 1e-9
            ? (LL.mechH > 0
              /* mechH ≤ 0 时 c(H) 走保底 BASE，那个负数对玩家没有意义，
               * 印出来只会让人以为「按 −1 计价」是更省的事（其实单价已是最低）。 */
              ? '（按幸福 ' + LL.mechH.toFixed(2) + ' 计，已剔市政/奇观/卡的 ' +
                (LL.bonus > 0 ? '+' : '') + LL.bonus.toFixed(2) + '）'
              : '（计价已到底线，已剔市政/奇观/卡的 ' +
                (LL.bonus > 0 ? '+' : '') + LL.bonus.toFixed(2) + '）')
            : '') +
          '</i>';
      }
      /* 信仰行的标签：玩家给信仰起了名 ⇒ 用宗教名代替「信仰」二字（神学解锁后可在 #religionBox 改名）。
       * ERA9 虚境信仰卡装填后强制「虚境」并锁死（覆盖玩家自定义名，见 civics.faithDisplayName）。 */
      var rowName = SB.RESS[k].name;
      if (k === 'faith') {
        var rn = (SB.civic && SB.civic.faithDisplayName)
          ? SB.civic.faithDisplayName(s)
          : ((s.religionName || '').trim());
        if (rn) rowName = rn;
      }
      var row = '<div class="' + cls + '"><b data-res="' + k + '" data-raw="' + (+v).toFixed(2) + '">' +
        SB.economy.fmtAmt(v) + capTxt + '</b><span>' + rowName + rateTxt + luxTxt + faithBonusTxt + '</span></div>';
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

  function renderShell() {
    var s = res(); if (!s) return;
    var f = el('shellFill'), txt = el('shellTxt'), hint = el('shellHint');
    /* 破壳后：破壳槽 → 星空槽（太空时代终局资源，2026-10-13 镜像破壳）。
     * 复用同一条 shellbar（#shellFill/#shellTxt/#shellHint），内容换成星空累积进度。 */
    if (s.shell <= 0 && (s.broken || s.shellOpened || s.breakSettled)) {
      var cap = SB.CFG.STAR_CAP || 0;
      var cur = s.res.starExplore || 0;
      var p = cap > 0 ? (cur / cap) * 100 : 0;
      f.style.width = Math.max(0, Math.min(100, p)) + '%';
      f.className = 'shellfill';
      /* 卡片标题跟着翻转（2026-10-13 截图验证发现：条改了、标题还挂「天壳 · 冰封层厚度」）。 */
      var lbl = el('shellLbl');
      if (lbl) lbl.textContent = '星空 · 深空探索进度';
      if (s.starComplete) {
        txt.innerHTML = '★ 太空时代达成 <span class="cap">（' + Math.round(cur).toLocaleString() + ' / ' + cap.toLocaleString() + '）</span>';
        hint.textContent = '星空槽已填满。太空时代完成——后续终局内容待接入。';
      } else {
        txt.innerHTML = '星空槽 ' + Math.round(cur).toLocaleString() + ' / ' + cap.toLocaleString() + '（' + p.toFixed(2) + '%）';
        hint.textContent = '破壳后由文明推力（人口/建筑/科技/轮回增益）被动累积，满槽即太空时代达成。'
          + '卫星/空间站各自的「开几座」开关可单独停掉它们的星空贡献。';
      }
      return;
    }
    /* 破壳前：原有天壳条逻辑 */
    var lbl0 = el('shellLbl');
    if (lbl0) lbl0.textContent = '天壳 · 冰封层厚度';
    var p2 = SB.economy.rOf(s) * 100;
    f.style.width = Math.max(0, p2) + '%';
    f.className = 'shellfill' + (SB.economy.isCold(s) ? ' cold' : '');
    txt.innerHTML =
      Math.round(s.shell) + ' / ' + s.iceShell + '（' + p2.toFixed(1) + '%）' +
      (SB.economy.isCold(s) ? ' <span class="coldbadge">· 本季冰封</span>' : '');
    var hint2 = '基础削壳持续中：系数越高削得越快，族民、建筑、科技都在推高它。';
    if (SB.economy.rOf(s) <= CFG.FLOOR_AT) {
      hint2 = '壳已薄到下限，基础削壳停手——建成「天穹钻机」后，在下方这行启动它凿穿最后一段。';
    }
    if (SB.economy.isCold(s)) hint2 += ' 本季冰封：全局产出 ×0.6，族民会冻伤（拨开暖石开关即可免）。';
    if (!SB.economy.isCold(s)) {
      hint2 += ' 冰封期在每个寒流季开局掷一次，壳越薄越容易中——按现在的壳厚是 ' +
        Math.round(SB.economy.freezeChance(s) * 100) + '%。';
    }
    hint.textContent = hint2;
  }

  /* 星空槽满槽占位结算面板（2026-10-13）。
   * 复用现有 #modal 浮层；无 modal 元素时直接 no-op（shellbar 已完成态仍会显示「★ 太空时代达成」）。 */
  function showStarComplete(s) {
    var modal = el('modal'), box = el('modalBox'); if (!modal || !box) return;
    var cap = SB.CFG.STAR_CAP || 0;
    var cur = (s && s.res && s.res.starExplore) || 0;
    box.innerHTML = '<div class="star-complete-panel">'
      + '<h2>★ 太空时代达成</h2>'
      + '<p>星空槽已填满（' + Math.round(cur).toLocaleString() + ' / ' + cap.toLocaleString() + '）。</p>'
      + '<p class="muted">你的文明已越过天壳，望向群星。终局奖励与后续内容将在后续版本接入。</p>'
      + '<div class="break-controls"><button class="btn big" type="button" id="starCompleteClose">继续</button></div>'
      + '</div>';
    modal.classList.remove('hidden'); bodyModalClass(true);
    var btn = el('starCompleteClose');
    if (btn) btn.onclick = hideModal;
  }

  /* ERA10（2026-10-20 · 用户 ERA10 表「绝热材料」解锁2 / 用户拍 Q2）：戴森球通关弹窗。
   * 镜像星空槽满槽先例（showStarComplete）：复用 #modal 浮层；无 modal 元素时 no-op
   * （dysonDone 已置位，星图戴森面板仍会显示竣工态，不丢信息）。
   * 两个出口（用户原话「就和破壳一样，弹窗，可以轮回也可以继攒轮回和星屑」）：
   *   ① 立即轮回 ⇒ 调 SB.game.askReset()（顶栏重置钮同一条生产路径：确认面板 + 结算
   *      预览 + prestige.doBreak 分流，轮回点/星屑按现有公式入账）；
   *   ② 继续游玩 ⇒ 关弹窗接着攒（dysonPopupSeen 已置位，不再重播）。 */
  function showDysonComplete(s) {
    var modal = el('modal'), box = el('modalBox'); if (!modal || !box) return;
    var sails = (s && s.sunSails) || 0, nodes = (s && s.dysonNodes) || 0;
    var sailCap = SB.CFG.DYSON_SAIL_CAP || 10000, nodeCap = SB.CFG.DYSON_NODE_CAP || 1000;
    box.innerHTML = '<div class="dyson-complete-panel">'
      + '<h2>★ 戴森球竣工</h2>'
      + '<p>太阳帆 <b>' + sails.toLocaleString() + '</b> / ' + sailCap.toLocaleString()
      + ' ＋ 戴森球节点 <b>' + nodes.toLocaleString() + '</b> / ' + nodeCap.toLocaleString()
      + ' —— 双达标达成。</p>'
      + '<p class="muted">母星戴上了一圈星环，文明的火光第一次以恒星计量。'
      + '你可以立刻轮回结算（轮回点与星屑按现有公式入账），也可以继续留在这一局，攒取更多的轮回点与星屑。</p>'
      + '<div class="break-controls">'
      + '<button class="btn big" type="button" id="dysonBreakNow">立即轮回（结算）</button>'
      + '<button class="btn" type="button" id="dysonKeepPlaying">继续游玩</button>'
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
  /* 乱码字符集：两套，按「基字属于哪种字体」分流 —— 2026-10-20 headless Chrome 实测结论。
   * ⚠️ 中文字体（Microsoft YaHei 等）**不含** U+0300–U+036F 组合变音符、也不含 U+20DD–U+20E4
   *    组合封闭符：叠在汉字上会被渲染成 tofu 方块（□），既不像乱码、又把正文顶得七零八落。
   *    组合符必须与基字**同一字体**才生效 ⇒ 追加 font-family 回退（Segoe UI Symbol 等）**救不了**，
   *    实测 A（纯中文）/ B（中文+组合符）/ C（拉丁+组合符）/ F（加回退）四行对照已确认。
   * ⇒ 拉丁、数字、半角符号走 VOID_MARKS（西文字体有字形，是真叠加，正经 Zalgo）；
   *    汉字/全角走 VOID_GLYPHS —— 全部经实测在中文字体下有字形：
   *    方框绘制 U+2501/254B/2550/256C/2573/2591-2593、日文迭代符 U+3005/3006/309D/309E/30FD/30FE、
   *    半角片假名 U+FF66/FF71/FF80/FF8A/FF9E/FF9F、盲文点阵 U+2801/2803/2809/2819/2839/286B/28FF。
   *    追加在字后（无法真叠加，但「数据损坏」观感到位，且不依赖组合符）。
   * 两套都**确定性**（纯 charCode 运算、零 Math.random）：重绘不抖，e2e 可断言。 */
  var VOID_MARKS = ['\u0338', '\u0336', '\u0334', '\u0308\u0334', '\u0301\u0338', '\u0337\u0338'];
  var VOID_GLYPHS = ['\u2501', '\u254b', '\u2550', '\u256c', '\u2573', '\u2591', '\u2592', '\u2593',
    '\u3005', '\u3006', '\u309d', '\u309e', '\u30fd', '\u30fe',
    '\uff66', '\uff71', '\uff80', '\uff8a', '\uff9e', '\uff9f',
    '\u2801', '\u2803', '\u2809', '\u2819', '\u2839', '\u286b', '\u28ff'];
  function voidCorrupt(text, seed) {
    var out = '', i, ch, cc, h, k, S;
    for (i = 0; i < text.length; i++) {
      ch = text.charAt(i);
      out += ch;
      cc = ch.charCodeAt(0);
      if (cc === 32 || cc === 10 || cc === 0x3000) continue;
      h = (cc * 31 + (seed | 0) * 17 + i * 7) % 100;
      if (cc < 0x2e80) {
        /* 拉丁/数字：组合符真叠加（0~3 个） */
        if (h < 38) out += VOID_MARKS[h % VOID_MARKS.length];
        else if (h < 66) out += VOID_MARKS[(h + 1) % VOID_MARKS.length] + VOID_MARKS[(h + 3) % VOID_MARKS.length];
        else if (h < 78) {
          for (k = 0; k < 3; k++) out += VOID_MARKS[(h + k * 2) % VOID_MARKS.length];
        }
      } else {
        /* 汉字/全角：追加怪异符号（0~2 个），密度略低于拉丁以控制行宽 */
        S = VOID_GLYPHS;
        if (h >= 34) {
          out += S[(cc + seed * 11 + h) % S.length];
          if (h >= 78) out += S[(cc + h * 3 + seed * 5) % S.length];
        }
      }
    }
    return out;
  }
  function showAscendVoid(s) {
    var modal = el('modal'), box = el('modalBox'); if (!modal || !box) return;
    var C = voidCorrupt;
    box.innerHTML = '<div class="void-ascend-panel">'
      + '<h2 class="void-title">' + C('飞升虚境', 3) + '</h2>'
      + '<p class="void-line">' + C('戴森球的最后一圈光收束了。', 7) + '</p>'
      + '<p class="void-line">' + C('所有的名字都从语言里剥落。', 11) + '</p>'
      + '<p class="void-line void-garbled">' + C('Zalgo has come.', 13) + '</p>'
      + '<p class="void-line">' + C('我们不再是「我们」。', 17) + '</p>'
      + '<p class="void-note">' + C('（这一局到此为止。你可以轮回结算，也可以留在这里看着它继续。', 19) + '</p>'
      + '<div class="break-controls">'
      + '<button class="btn big" type="button" id="voidBreakNow">' + C('轮回', 23) + '</button>'
      + '<button class="btn" type="button" id="voidKeepPlaying">' + C('继续游玩', 29) + '</button>'
      + '</div></div>';
    modal.classList.remove('hidden'); bodyModalClass(true);
    var b1 = el('voidBreakNow');
    if (b1) b1.onclick = function () {
      hideModal();
      if (SB.game && SB.game.askReset) SB.game.askReset();
    };
    var b2 = el('voidKeepPlaying');
    if (b2) b2.onclick = hideModal;
  }


  var researchParts = SB.ui.renderParts.research;
  var paneTech = researchParts.paneTech;
  var paneCivic = researchParts.paneCivic;
  var paneCivicGov = researchParts.paneCivicGov;
  var paneCivicSlot = researchParts.paneCivicSlot;
  var setCivicView = researchParts.setCivicView;
  var toggleGovDetail = researchParts.toggleGovDetail;
  var techGoEra = researchParts.techGoEra;
  var armCard = researchParts.armCard;
  var disarmCard = researchParts.disarmCard;
  var getArmedCard = researchParts.getArmedCard;
  var cycleJobStep = researchParts.cycleJobStep;
  var getJobStep = researchParts.getJobStep;
  // 独立 pane 脚本注册的 live 实现；调度与公开测试入口共用同一函数。
  var paneMeta = SB.ui.renderParts.paneMeta;
  var paneVillage = SB.ui.renderParts.paneVillage;
  var paneFolk = SB.ui.renderParts.paneFolk;


  var PANES = { village: paneVillage, folk: paneFolk, tech: paneTech, civic: paneCivic,
    faith: SB.ui.renderParts.paneFaith, workshop: SB.ui.renderParts.paneWorkshop, wonder: SB.ui.renderParts.paneWonder,
    'star-map': SB.ui.renderParts.paneStarMap, meta: paneMeta,
    challenges: SB.ui.renderParts.paneChallenges,
    company: SB.ui.renderParts.paneCompany, 'star-dome': paneStarDome };

  /* 星穹商店：星屑结算、永久强化和轮回点兑换。 */
  function paneStarDome() {
    var s = res(); if (!s) return '';
    var m = meta();
    var sd = (m && (m.stardust || 0)) || 0;
    var starPct = (SB.CFG.STAR_CAP > 0) ? Math.min(1, ((s.res && s.res.starExplore) || 0) / SB.CFG.STAR_CAP) : 0;
    var dysonPct = SB.economy.dysonPct(s);
    var facilityLvls = SB.prestige.stardustFacilityLevels(s);
    var nextGain = SB.prestige.stardustGain(s);
    var facilityNames = [];
    for (var fi = 0; fi < SB.BUILDINGS.length; fi++) {
      var fb = SB.BUILDINGS[fi], fl = (s.lvl && s.lvl[fb.id]) || 0;
      if (fb.stardustFacility && fl > 0) facilityNames.push(fb.name + ' ' + fl);
    }
    var h = '<div class="cardbody">' +
      '<div class="meta-overview"><div class="meta-balance"><span>星屑余额</span><strong>' + sd + '</strong><small>累计结算获得 ' + ((m && m.stardustEarned) || 0) + '</small></div>' +
      '<div class="meta-stats"><div><span>下次结算预计</span><b>' + nextGain + ' 星屑</b></div><div><span>太空与异星设施</span><b>' + facilityLvls + ' 级</b></div><div><span>戴森球进度</span><b>' + Math.floor(dysonPct * 100) + '%</b></div></div></div>' +
      '<div class="note">结算公式：floor(设施等级 × 0.1 × (1 + 星空进度) × (1 + 戴森进度 × 50%) × 已解锁加成)。' +
      '星间遗迹按设施总等级加成；先民遗产和继承繁星之人也会计入。</div>' +
      '<div class="note">计入设施：' + (facilityNames.length ? facilityNames.join('、') : '尚无') +
      '。星空进度 ' + Math.floor(starPct * 100) + '%；戴森球按太阳帆与戴森节点两者较低进度计算。</div>' +
      '<section class="meta-shop-group"><div class="meta-section-title"><b>星屑强化</b><span>购买后跨周目保留</span></div><div class="meta-shop-grid">';
    for (var pi = 0; pi < SB.STAR_PERKS.length; pi++) {
      var p = SB.STAR_PERKS[pi], st = SB.prestige.starPerkState(p.id);
      h += '<article class="meta-perk-card' + (st.done ? ' is-done' : '') + '"><div class="meta-perk-copy"><div class="nm">' + p.name +
        ' <span class="tag">' + st.lv + '/' + (isFinite(st.max) ? st.max : '∞') + '</span></div><div class="ds">' + p.desc + '</div></div>' +
        '<button class="btn buy meta-buy" data-star-perk="' + p.id + '"' + (st.done || !st.afford ? ' disabled' : '') + '>' +
        (st.done ? '已购满' : st.next + ' 星屑') + '</button></article>';
    }
    h += '</div></section>' +
      '<section class="meta-shop-group"><div class="meta-section-title"><b>轮回点兑换</b><span>双向固定汇率，无手续费</span></div><div class="meta-shop-grid">' +
      '<article class="meta-perk-card"><div class="meta-perk-copy"><div class="nm">10 轮回点 → 1 星屑</div><div class="ds">消耗 10 轮回点，兑换 1 星屑。</div></div><button class="btn buy meta-buy" data-star-exchange="tide-to-stardust"' + ((m.tide || 0) < 10 ? ' disabled' : '') + '>兑换</button></article>' +
      '<article class="meta-perk-card"><div class="meta-perk-copy"><div class="nm">1 星屑 → 10 轮回点</div><div class="ds">消耗 1 星屑，兑换 10 轮回点。</div></div><button class="btn buy meta-buy" data-star-exchange="stardust-to-tide"' + (sd < 1 ? ' disabled' : '') + '>兑换</button></article>' +
      '</div></section>' +
      '<div class="note meta-shop-note">星屑由合格轮回结算发放，也可按固定汇率兑换；购买强化与兑换后的余额均跨周目保留。</div>' +
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
            _ifr.contentWindow.postMessage({
              type: 'sb-spacecraft',
              list: _smS.spacecraft || [],
              bodies: SB.STAR_MAP_BODIES || [],
              star: { value: (_smS.res && _smS.res.starExplore) || 0, cap: (SB.CFG && SB.CFG.STAR_CAP) || 0 }
            }, '*');
          }
          if (SB.ui.renderParts.refreshStarMapBuildings) SB.ui.renderParts.refreshStarMapBuildings(_smS);
          /* ERA10（2026-10-20）：戴森面板随星图分支一起刷新（独立容器，不碰 iframe 签名）。 */
          if (SB.ui.renderParts.refreshDysonPanel) SB.ui.renderParts.refreshDysonPanel(_smS);
        }
      } else if (k === 'folk' && SB.ui.input && SB.ui.input.isFolkControlPointerActive &&
                 SB.ui.input.isFolkControlPointerActive()) {
        /* 手机 tap 的 pointerdown 与合成 click 之间保留原按钮节点；定时 renderAll 若在这段窗口
         * 重建 #pane-folk，就会让浏览器丢掉 click target。动作 click 到达后会立刻恢复正常渲染。 */
        continue;
      } else if (k === 'faith' || k === 'company' || k === 'village') {
        var body = el('pane-' + k + '-body');
        if (body) body.innerHTML = PANES[k]();
      } else {
        node.innerHTML = cardHeadHTML(k) + PANES[k]();
      }
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
    /* 市政树「后写」：与 tech 完全同构。 civicScrollLeft 为 0 时不写是安全的——
     * 0 本来就是容器重画后的自然位置，没有「跳回纪元一」那种必须显式写 0 的场景。 */
    civicShown = cShown;
    cbox = el('civicScroll');
    if (cbox && cShown && civicScrollLeft) {
      cbox.scrollLeft = civicScrollLeft;
      civicScrollLeft = cbox.scrollLeft || 0;
    }
  }

  /* 点纪元按钮：切详情卡 + （已抵达的纪元）把长卷滚到它的左边界。
   * 返回「要不要重画」。
   * ⚠️ 这里只改视图，**不碰任何游戏状态**：纪元闸门在 tech.canStudy 里，
   *    按钮不是玩法动作，所以也不补跑 pumpTech。
   * ⚠️ 再点一次当前选中项也要返回 true：那是玩家说「带我回那个纪元」，
   *    位置得重落一次（他可能自己滑到别处去了）。 */
  function renderBreakBtn() {
    var s = res(); if (!s) return;
    var ready = s.shell <= 0 && !s.broken && !s.breakSettled && s.shellOpened;
    el('btnBreak').disabled = !ready;
    el('btnBreak').textContent = s.shellOpened && s.shell <= 0 ? '轮回结算' : '凿穿冰壳';
    el('breakHint').textContent = s.shellOpened && s.shell <= 0
      ? '当前轮回预估：' + (SB.prestige.qualified(s) ? SB.prestige.breakReport(s).tidePoints.toFixed(2) : '0.00') + ' 点；留在本局继续发展可提高预估。'
      : ready ? '壳已归零——凿下去。'
      : s.shell > 0 ? '壳厚还剩 ' + Math.round(s.shell) + '，持续削壳中。'
      : '冰壳停住了：需要建成「天穹钻机」奇观才能凿穿最后一段。';
    /* 重置按钮文案随「**当局**是否建立宗教」翻转：本局还没建立宗教 ⇒「重开本周目」，
     * 建立了（玩家给它起了名）⇒「轮回」——2026-09-29 规格。
     * ⚠️ 2026-10-03 由 `meta().religionSeen` 改成 `SB.prestige.religionEstablished(s)`。
     *   旧写法读的是**永久**开关，于是「早前某周目建过宗教 / 旧档迁移补发」之后，
     *   新周目里神学被重置、宗教名也清了，底栏**却已经写「轮回」**（用户报：「这里还没研究
     *   神学怎么就是轮回了？」）。文案跟当局，机制（发点 / 商店解锁）仍跟永久开关 —— 分工见
     *   prestige.religionEstablished 的注释，不要在这里再写第二份判据。 */
    var rb = el('btnReset');
    if (rb) rb.textContent = SB.prestige.religionEstablished(s) ? '轮回' : '重开本周目';
  }

  function clock() {
    var s = res(); if (!s) return;
    el('clock').textContent = '存续 ' + (s.t / 3600).toFixed(2) + ' 小时｜已削壳 ' + Math.max(0, s.baseShell - s.shell).toFixed(0);
  }

  /* 族民 tab 上的生育进度条：直接读 tick 里的 s._grow / GROW_NEED（economy.js 第 6 步），
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
        txt: '住房住满：人口 ' + s.pop + ' / 人口上限 ' + SB.economy.popCap(s) +
          '，不再生育——盖住房才能继续（第二档石屋 ratio 更平缓，中期更划算）' };
    }
    if (!(s.res.kelp > CFG.GROW_KEEP)) {
      return { blocked: true, txt: '藻食 ' + Math.max(0, s.res.kelp).toFixed(0) +
        ' ≤ ' + CFG.GROW_KEEP + '，生育停摆——产藻食的人不够，或口粮超了' };
    }
    var g = s._grow || 0;
    /* _grow 记的是普通进度（每帧 += dt，见 economy.tick 第 6 步），没有加权，
     * 所以进度条与剩余秒数都直接由 g 算，不再需要按倍率还原。 */
    var need = SB.challenges ? SB.challenges.growthDuration(s) : CFG.GROW_NEED;
    return { blocked: false, p: Math.min(1, g / need),
      left: Math.ceil(need - g), txt: '' };
  }
  /* 族民页那行的每帧刷新：只改数字 / 条宽 / 原因文字，不重建整块 pane
   * （pane 重建走 renderPanes，只在切页时发生——见 paneFolk 里的注释）。 */
  function paintGrow(s) {
    var st = growState(s), g = s._grow || 0;
    var need = SB.challenges ? SB.challenges.growthDuration(s) : CFG.GROW_NEED;
    var p = st.blocked ? 0 : Math.min(1, g / need);
    var nm = el('growNm'), fill = el('growFill'), why = el('growWhy');
    if (nm) nm.innerHTML = st.blocked ? '生育 <span class="bad">停摆</span>'
      : '生育 <b>' + st.left + '</b> 秒后有下一名（' + (p * 100).toFixed(0) + '%）';
    if (fill) fill.style.width = (p * 100).toFixed(1) + '%';
    if (why) {
      /* 「有空住房才生」在新机制下是**正确**的说法（2026-09-25 那版把硬上限拆了，
       * 于是这句话被删过一次；现在墙回来了，它要回来）。 */
      why.textContent = st.blocked ? st.txt
        : '需藻食 > ' + CFG.GROW_KEEP + '，每 ' + CFG.GROW_NEED + ' 秒出生一名';
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
      bar.title = '下一名族民还需 ' + st.left + ' 秒（' + (st.p * 100).toFixed(0) + '%）';
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
    if (t) t.textContent = idle > 0 ? '族民（' + idle + '）' : '族民';
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
    if (active.id === 'science') {
      var scribeName = SB.folk.jobName(s, 'scribe');
      rule = '学者与' + scribeName + '岗位上限 ' + cap;
      progress = '学者 ' + ((s.jobs && s.jobs.scholar) || 0) + '/' + cap + ' · ' +
        scribeName + ' ' + ((s.jobs && s.jobs.scribe) || 0) + '/' + cap;
    } else if (active.id === 'small') {
      rule = '人口上限 ' + cap;
      progress = '当前人口 ' + Math.ceil(Number(s.pop) || 0) + '/' + cap;
    } else if (active.id === 'cold') {
      rule = '寒流季禁用保温法 · 暖石产出 -30%';
      progress = SB.challenges.warmHeatingBlocked(s) ? '当前：保温禁用' : '当前：保温可用';
    } else if (active.id === 'abyss') {
      rule = '全局产出 -' + Math.round(cap * 100) + '%';
      progress = (SB.prestige.qualified(s) ? '神学资格 ✓' : '待完成神学') + ' · 剩余壳厚 ' + Math.max(0, Math.round(Number(s.shell) || 0));
    } else if (active.id === 'speedrun') {
      var speedTimedOut = SB.challenges.timedOut(s);
      rule = '限时 ' + SB.challenges.formatClock(cap) + ' · 退出后继续计时';
      progress = speedTimedOut ? '已超时 · 重开本周目后可重试' :
        '剩余 ' + SB.challenges.formatClock(SB.challenges.remainingSeconds(s)) + ' · ' +
        (SB.prestige.qualified(s) ? '神学资格 ✓' : '待完成神学') + ' · 壳厚 ' + Math.max(0, Math.round(Number(s.shell) || 0));
    } else {
      rule = def.rule || def.summary || '';
      progress = '挑战限制持续生效';
    }

    var titleNode = el('challengeNoticeTitle'), ruleNode = el('challengeNoticeRule'), progressNode = el('challengeNoticeProgress');
    var title = def.name + ' · ' + tier.label;
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
    SB.ui.renderParts.renderEnv(s); SB.ui.renderParts.renderWarm(s); SB.ui.renderParts.renderDrill(s);
    SB.ui.renderParts.renderGeek(s);
    SB.ui.renderParts.renderStar(s); SB.ui.renderParts.renderHydro(s); SB.ui.renderParts.renderReligion(s);
    SB.ui.renderParts.renderHabitatName(s);
    renderIdleTag(); renderEvent(s); renderAd(); renderRank();
  }
  function renderTick() {
    var s = res();
    applyEraSkin(s);
    renderChallengeNotice(s);
    renderRes(); renderShell(); renderBreakBtn(); clock(); renderGrowBar();
    SB.ui.renderParts.renderEnv(s); SB.ui.renderParts.renderWarm(s); SB.ui.renderParts.renderDrill(s);
    SB.ui.renderParts.renderGeek(s);
    SB.ui.renderParts.renderHydro(s);
    renderIdleTag(); renderEvent(s); SB.ui.renderCommon.paintHappy(s);
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
      watch.textContent = '看广告 +' + (SB.CFG.AD ? SB.CFG.AD.BOOST_MIN : 30) + 'min ' +
        (SB.CFG.AD ? SB.CFG.AD.MUL : 2) + '×';
    }
    if (rem) {
      if (ad.ms > 0) {
        var total = ad.ms / 1000, mm = Math.floor(total / 60), ss = Math.floor(total % 60);
        rem.textContent = (ad.on ? '2× 生效 · ' : '') + '剩 ' + mm + ':' + (ss < 10 ? '0' + ss : ss);
      } else rem.textContent = '无加速';
    }
    if (tog) {
      tog.classList.toggle('on', !!ad.on && ad.ms > 0);
      tog.classList.toggle('off', !ad.on && ad.ms > 0);
      tog.textContent = ad.ms > 0 ? ('2× 加速 ' + (ad.on ? '开' : '关')) : '2× 加速';
      tog.disabled = ad.ms <= 0;                  // 没余额时开关无意义（中性灰，不显示开/关）
    }
    /* 「看广告 +1 轮回点」：按钮文案固定；副文本显示当日已看次数/上限；达上限禁用并提示。 */
    var rb = el('btnAdRebirth'), rbRem = el('adRebirthRemain');
    var max = (SB.CFG.AD ? SB.CFG.AD.REBIRTH_DAILY_MAX : 10) || 10;
    var m = (SB.game && SB.game.meta) ? SB.game.meta() : {};
    var st = (SB.game && SB.game.adRebirthState) ? SB.game.adRebirthState(m) : { count: 0 };
    if (rb) {
      rb.disabled = st.count >= max;
      rb.textContent = '看广告 +1 轮回点';
    }
    if (rbRem) {
      rbRem.textContent = (st.count >= max) ? ('今日已满 ' + max + '/10') : ('今日 ' + st.count + '/' + max);
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
    var rows = keys.map(function (k) {
      var t = (map[k] && map[k].title) || k;
      return '<button type="button" class="btn rank-open" data-rank-key="' + k + '">' + t + '</button>';
    }).join('');
    box.innerHTML =
      '<div class="modal-hd"><b>排行榜</b>' +
      '<button type="button" class="modal-x" data-modal-close="1" aria-label="关闭">×</button></div>' +
      '<div class="rank-list">' + rows + '</div>';
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
  /* 更新日志面板（2026-10-11）：点页脚「更新日志」按钮打开，列出 CFG.CHANGELOG（最新在前）。
   * 复用 #modal 遮罩 + data-modal-close 关闭通道（与排行榜选择面板同款）。 */
  function openChangelog() {
    var box = el('modalBox'), modal = el('modal');
    if (!box || !modal) return;
    var log = (SB.CFG && SB.CFG.CHANGELOG) || [];
    var body = log.map(function (e) {
      var items = (e.items || []).map(function (it) { return '<li>' + it + '</li>'; }).join('');
      return '<div class="chg-entry">' +
        '<div class="chg-hd"><span class="chg-ver">v' + (e.v || '?') + '</span>' +
        (e.date ? '<span class="chg-date">' + e.date + '</span>' : '') + '</div>' +
        (e.title ? '<div class="chg-title">' + e.title + '</div>' : '') +
        '<ul class="chg-items">' + items + '</ul></div>';
    }).join('');
    if (!body) body = '<div class="chg-empty">暂无更新记录。</div>';
    box.innerHTML =
      '<div class="modal-hd"><b>更新日志</b>' +
      '<button type="button" class="modal-x" data-modal-close="1" aria-label="关闭">×</button></div>' +
      '<div class="chg-list">' + body + '</div>' +
      '<div class="chg-foot"><button type="button" class="btn" data-modal-close="1">知道了</button></div>';
    modal.classList.remove('hidden');
    bodyModalClass(true);
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
      if (nm) nm.textContent = def.name;
      if (cp) cp.textContent = def.copy;
      if (btn) btn.textContent = '拾取';
    }
    if (bd) bd.classList.add('omen-open');
    var cd = el('omenCd');
    if (cd && SB.events.timeLeft) cd.textContent = Math.ceil(SB.events.timeLeft()) + ' 秒后消失';
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
  function showBreakAnimation(r) {
    var modal = el('modal'), box = el('modalBox');
    if (!modal || !box || prefersReducedMotion()) { showBreakPanel(r); return; }
    clearBreakAnimation();
    _breakAnimationReport = r;
    box.innerHTML =
      '<section class="break-showcase" aria-label="破壳终章动画">' +
        '<div class="break-stage" id="breakStage" data-phase="intro">' +
          '<div class="break-scene">' +
            '<img class="break-frame-intro" src="assets/backgrounds/sequence/era-5/frame-01.webp" alt="天穹钻机蓄力，准备冲击天壳">' +
            '<img class="break-frame-impact" src="assets/backgrounds/sequence/era-5/frame-02.webp" alt="钻机击中天壳，裂纹与碎冰亮起">' +
            '<img class="break-frame-gaze" src="assets/backgrounds/sequence/era-5/frame-03.webp" alt="鲛人游近钻机，仰望裂开的天壳">' +
            '<img class="break-frame-ending" src="assets/backgrounds/breakthrough/end-stars-draft-low.jpg" alt="天壳打开，钻机和鲛人共同仰望星空">' +
          '</div>' +
          '<div class="break-hud"><span class="break-phase"><b>✦</b><span id="breakPhaseName">钻机蓄力</span></span><span id="breakCounter">01 / 04</span></div>' +
          '<div class="break-caption">' +
            '<div class="break-caption-text break-cap-intro"><small>终章 · 天穹钻机</small><h2>共振，启动。</h2><p>整座海底城市，为这一击积蓄力量。</p></div>' +
            '<div class="break-caption-text break-cap-impact"><small>突破临界点</small><h2>钻头触壳。</h2><p>共振沿冰层蔓延，第一道裂纹亮起。</p></div>' +
            '<div class="break-caption-text break-cap-gaze"><small>天壳崩解 · 鲛人仰望</small><h2>裂痕，扩散。</h2><p>鲛人游向钻机，望向逐渐打开的天穹。</p></div>' +
            '<div class="break-caption-text break-cap-ending"><small>文明的新纪元</small><h2>天壳之外。</h2><p>曾经仰望的边界，如今已在身后。</p></div>' +
          '</div>' +
          '<div class="break-end-card"><small>阶段完成</small><strong>破壳纪 · 仰望群星</strong></div>' +
        '</div>' +
        '<div class="break-controls"><button class="btn" id="breakReplay" type="button">↻ 重播</button><button class="btn big" id="breakContinue" type="button">跳过动画</button></div>' +
      '</section>';
    modal.classList.remove('tree-modal');
    modal.classList.remove('tree-tech');
    modal.classList.remove('tree-civic');
    box.classList.remove('tree-detail-box');
    modal.classList.add('break-modal');
    modal.classList.remove('hidden');
    bodyModalClass(true);

    var stage = el('breakStage'), phaseName = el('breakPhaseName'), counter = el('breakCounter');
    var replay = el('breakReplay'), continueBtn = el('breakContinue');
    var steps = [
      ['intro', '钻机蓄力', '01 / 04', 0],
      ['impact', '钻头触壳', '02 / 04', 1500],
      ['gaze', '鲛人仰望', '03 / 04', 3200],
      ['ending', '阶段完成', '04 / 04', 4900]
    ];
    function setStep(step) {
      if (!stage) return;
      stage.dataset.phase = step[0];
      if (phaseName) phaseName.textContent = step[1];
      if (counter) counter.textContent = step[2];
      if (continueBtn && step[0] === 'ending') continueBtn.textContent = '查看结算';
    }
    function finish() {
      var report = _breakAnimationReport;
      clearBreakAnimation();
      if (report) showBreakPanel(report);
    }
    function play() {
      clearBreakAnimation();
      _breakAnimationReport = r;
      setStep(steps[0]);
      if (continueBtn) continueBtn.textContent = '跳过动画';
      for (var i = 1; i < steps.length; i++) {
        (function (step) { _breakAnimationTimers.push(setTimeout(function () { setStep(step); }, step[3])); })(steps[i]);
      }
    }
    if (replay) replay.onclick = play;
    if (continueBtn) continueBtn.onclick = finish;
    play();
  }

  /* 轮回结算面板（2026-10-02 重设）：契约与 prestige.breakReport 对齐 ——
   *   r: { P, popScore, buildingScore, developmentScore, q, shellFactor, tidePoints,
   *        relicTourism, oldArtwork, oldTideStele, locked }。
   * ⚠️ 不再有「人口门槛 / POP_GATE / 破层级数」那套旧口径：资格门 = 本局《神学》（由 doBreak 判定，
   *   未达则 r.locked=true、tidePoints=0）。面板只负责把报告渲染出来，判据不在这。 */
  function showBreakPanel(r) {
    clearBreakAnimation();
    var m = meta();
    var box = el('modalBox');
    var rows =
      '<div class="kv"><span>峰值族民 P</span><b>' + (r.P || 0) + '</b></div>' +
      '<div class="kv"><span>人口分</span><b>' + (r.popScore || 0).toFixed(1) + '</b></div>' +
      '<div class="kv"><span>建筑分（按纪元加权）</span><b>' + (r.buildingScore || 0).toFixed(1) + '</b></div>' +
      '<div class="kv"><span>工坊解锁项（' + (r.workshopCount || 0) + ' 项 ×' + ((CFG.TIDE && CFG.TIDE.CRAFT_W) || 4) + '）</span><b>' + (r.craftScore || 0).toFixed(1) + '</b></div>' +
      '<div class="kv"><span>总发展分</span><b>' + (r.developmentScore || 0).toFixed(1) + '</b></div>' +
      '<div class="kv"><span>破壳进度</span><b>' + (r.q != null ? (r.q * 100).toFixed(0) : '0') + '%</b></div>' +
      '<div class="kv" style="border:0;margin-top:8px"><span>' + (res() && res().breakSettled ? '本次获得轮回点' : '当前预估轮回点') + '</span><b style="color:var(--amber);font-size:17px">' + (r.tidePoints || 0).toFixed(2) + '</b></div>';
    var extra = '';
    if (r.challengePointMul > 1) extra += '<div class="note">轮回挑战永久加成：轮回点获取 +' + Math.round((r.challengePointMul - 1) * 100) + '%</div>';
    if (r.challengeClear) extra += '<div class="note">挑战通关：<b>' + r.challengeClear.name + ' · ' + r.challengeClear.label + '</b>，永久获得 ' + r.challengeClear.reward + '；之后轮回点获取再 +10%。</div>';
    var challengeFailureNote = r.challengeFailure ? '<div class="note" style="color:var(--red)">挑战未通关：<b>' + r.challengeFailure.name + ' · ' + r.challengeFailure.label + '</b>已超过 ' +
      SB.challenges.formatClock(r.challengeFailure.limit) + '（本次用时 ' + SB.challenges.formatClock(r.challengeFailure.elapsed) + '），本档奖励未领取。重开本周目后可重试。</div>' : '';
    if (challengeFailureNote) extra += challengeFailureNote;
    if (r.relicTourism) extra += '<div class="note">新入藏奇观 ' + r.relicTourism + ' 座（每座 +1% 科技/市政获取）</div>';
    if (r.oldArtwork) extra += '<div class="note">转入旧日艺术品 ' + r.oldArtwork + ' 件（固定市政点/秒）</div>';
    if (r.oldTideStele) extra += '<div class="note">转入旧日潮纹碑石 ' + r.oldTideStele + ' 件（固定科技点/秒）</div>';
    var note = r.locked
      ? '<div class="note" style="color:var(--red)">本局未达《神学》资格门，不发放轮回点、不解锁商店。</div>' + challengeFailureNote
      : (res() && !res().breakSettled
        ? '<div class="note">这只是当前预估，留在本局继续发展后，轮回结算会按最新进度重新计算。</div>'
        : (extra || '<div class="note">轮回点 = 1 + floor(发展分 × 系数 × 破壳系数)，发展分 = 2×峰值族民 + 建筑纪元分 + 工坊解锁项；下一局继承轮回点、已购增益与旧日遗产账本。</div>'));
    box.innerHTML =
      '<h3>冰壳裂开了</h3>' +
      rows +
      note +
      '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
      (res() && res().breakSettled ? '' : '<button class="btn" id="mStay">探索壳外的星空</button>') +
      '<button class="btn big" id="mNext">' + (res() && res().breakSettled ? '开始轮回' : '结算并轮回') + '</button></div>';
    el('modal').classList.remove('hidden'); bodyModalClass(true);
    if (el('mStay')) el('mStay').onclick = function () { SB.game.stay(); };
    if (res() && res().breakSettled) {
      el('mNext').textContent = (m && m.religionSeen) ? '开始轮回' : '重开本周目';
      el('mNext').onclick = function () { SB.game.nextCycle(); };
    } else {
      el('mNext').textContent = SB.prestige.qualified(res()) ? '结算并轮回' : '结算后重开';
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

  function hideModal() {
    clearBreakAnimation();
    var modal = el('modal');
    modal.classList.add('hidden');
    modal.classList.remove('offline-summary-modal');
    modal.classList.remove('tree-modal');
    modal.classList.remove('tree-tech');
    modal.classList.remove('tree-civic');
    modal.classList.remove('break-modal');
    modal.classList.remove('story-modal');
    el('modalBox').classList.remove('tree-detail-box');
    el('modalBox').classList.remove('story-box');
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
      '<h3>' + (o.title || '确认') + '</h3>' + (o.body || '') +
      (o.requireCheck
        ? '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:10px 0;color:var(--dim);line-height:1.6">' +
          '<input type="checkbox" id="mChk" style="margin-top:2px">' + o.requireCheck + '</label>'
        : '') +
      '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
      '<button class="btn" id="mCancel">取消</button>' +
      '<button class="btn' + (o.danger ? ' danger' : '') + '" id="mOk">' + (o.ok || '确定') + '</button></div>';
    el('modal').classList.remove('hidden'); bodyModalClass(true);
    var okBtn = el('mOk'), chk = el('mChk');
    el('mCancel').onclick = hideModal;
    if (chk) {
      okBtn.disabled = true;
      chk.onchange = function () { okBtn.disabled = !chk.checked; };
    }
    okBtn.onclick = function () { hideModal(); if (o.onOk) o.onOk(); };
  }

  /* 无上限原料配方没有「满仓」触发点，玩家在单独弹窗里填写批次数。
   * 不能把数字输入框塞进每 2 秒重画一次的工坊 pane，否则输入时会丢焦点/丢值。 */
  function openAutoBatchDialog(id) {
    var s = res(), c = SB.workshop && SB.workshop.craftById(id);
    if (!s || !c || SB.workshop.hasFiniteInput(s, c)) return false;
    var box = el('modalBox'), modal = el('modal');
    var current = SB.workshop.slotBatch(s, id);
    var max = (CFG.AUTO && CFG.AUTO.BATCH_MAX) || 9007199254740991;
    box.innerHTML =
      '<div class="modal-hd"><b>自动制造批次</b><button type="button" class="modal-x" data-modal-close="1" aria-label="关闭">×</button></div>' +
      '<p style="color:var(--dim);line-height:1.6;margin:0 0 14px">' + c.name + '：当库存足够制造你填写的数量时，自动制造这一整批；多出的材料会保留。</p>' +
      '<label for="autoBatchInput" style="display:block;margin-bottom:6px">每批制造次数</label>' +
      '<input id="autoBatchInput" type="number" min="1" max="' + max + '" step="1" inputmode="numeric" value="' + current + '"' +
      ' style="box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel2);color:var(--text);font:inherit">' +
      '<div id="autoBatchError" role="alert" style="min-height:18px;margin-top:6px;color:var(--red);font-size:12px"></div>' +
      '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
      '<button type="button" class="btn" data-modal-close="1">取消</button>' +
      '<button type="button" class="btn buy" id="autoBatchSave">保存</button></div>';
    modal.classList.remove('hidden'); bodyModalClass(true);
    var input = el('autoBatchInput'), save = el('autoBatchSave');
    function saveBatch() {
      var raw = String(input.value || '').trim();
      var batch = Number(raw);
      var error = el('autoBatchError');
      if (!/^\d+$/.test(raw) || !isFinite(batch) || Math.floor(batch) !== batch || batch < 1 || batch > max) {
        error.textContent = '请输入 1 到 ' + max + ' 之间的整数。';
        return;
      }
      var live = res();
      if (!live || !SB.workshop.setSlotBatch(live, id, batch)) {
        error.textContent = '保存失败：自动槽已不可用，请检查工坊升级与槽位。';
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
    var kind = o.kind || 'unlock';
    var isTech = kind === 'tech';
    var icon = o.icon || (isTech ? '⌘' : '✦');
    var kicker = o.kicker || '新系统解锁';
    var unlockTitle = o.unlockTitle || (isTech ? '科技树已开放' : '新的系统已开放');
    var unlockCopy = o.unlockCopy || (isTech ? '现在可以研究科技，并查看每项科技的尤里卡条件。' : '新的内容已经加入你的文明。');
    modal.classList.remove('tree-modal');
    modal.classList.remove('tree-tech');
    modal.classList.remove('tree-civic');
    modal.classList.remove('break-modal');
    modal.classList.add('story-modal');
    box.classList.remove('tree-detail-box');
    box.classList.add('story-box');
    box.innerHTML =
      '<div class="story-kicker"><span class="story-kicker-icon" aria-hidden="true">' + icon + '</span><span>' + kicker + '</span><i aria-hidden="true"></i></div>' +
      '<div class="story-hero"><div class="story-hero-icon" aria-hidden="true">' + icon + '</div><div class="story-hero-copy"><h3>' + (o.title || '') + '</h3><span class="story-state">已开启</span></div></div>' +
      '<div class="story-rule" aria-hidden="true"></div>' +
      '<div class="story">' + (o.lines || []).map(function (x) {
        return '<p>' + x + '</p>';
      }).join('') + '</div>' + (o.body || '') +
      '<div class="story-unlock"><span class="story-unlock-mark" aria-hidden="true">✓</span><div><strong>' + unlockTitle + '</strong><small>' + unlockCopy + '</small></div></div>' +
      '<div class="foot story-actions"><button class="big" id="mStoryOk">' + (o.ok || '知道了') + '<span aria-hidden="true">→</span></button></div>';
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
      tabs[i].title = open ? '' : '建成 5 座深海藻场后开启，才知道明天是什么';
    }
    /* 市政页的灰态与科技页是**两件事**：开门条件不同（议事厅 vs 5 座藻场），
     * 所以这里要单独判一次，不能跟着 tech 走——否则玩家建起议事厅、市政页还是灰的。 */
    var civ = document.querySelector('.tab[data-tab="civic"]');
    if (civ) {
      var cs = res(), cop = !!(SB.civic && cs && SB.civic.panelOpen(cs));
      civ.classList.toggle('locked', !cop);
      civ.title = cop ? '' : '建成议事厅后开启（议事厅由「石工」解锁）';
    }
    /* 工坊页的灰态同样得单独判：它的门是「建成工坊」这座建筑本身，
     * 与科技页的 5 座藻场、市政页的议事厅都不是一件事。 */
    var wk = document.querySelector('.tab[data-tab="workshop"]');
    if (wk) {
      var wop = workshopTabOpen();
      wk.classList.toggle('locked', !wop);
      wk.title = wop ? '' : '建成工坊后开启';
    }
    /* 奇观页的灰态：**第三个独立门槛** —— 石工那项科技。
     * ⚠️ 它的门是「研究过石工」，与上面三个（5 座藻场 / 议事厅 / 建成工坊）都不相同，
     *    所以必须单独判一次，不能顺手挂到任何一个下面。 */
    var wd = document.querySelector('.tab[data-tab="wonder"]');
    if (wd) {
      var s = res(), dop = !!(s && s.techs && s.techs.masonry);
      wd.classList.toggle('locked', !dop);
      wd.title = dop ? '' : '研究「石工」后开启';
    }
    /* 轮回商店（meta 页）的灰态：**第四个独立门槛** —— 首次轮回。
     * 与上面三个（5 座藻场 / 议事厅 / 石工）都不相同，必须单独判一次。 */
    var mt = document.querySelector('.tab[data-tab="meta"]');
    if (mt) {
      var mopen = !!(meta() && meta().shopUnlocked);
      mt.classList.toggle('locked', !mopen);
      mt.title = mopen ? '' : '首次轮回后开启轮回商店';
    }
    var ch = document.querySelector('.tab[data-tab="challenges"]');
    if (ch) {
      var chopen = !!(meta() && meta().shopUnlocked);
      ch.classList.toggle('locked', !chopen);
      ch.title = chopen ? '' : '首次轮回后开启轮回挑战';
    }
    /* 信仰页的灰态：**第五个独立门槛** —— 神学（与资源行 / 产出线的 gate 同源：
     *   resUnlocked(s,'faith') ⇔ s.civics.theology），不在这里另立一份判据。 */
    var ft = document.querySelector('.tab[data-tab="faith"]');
    if (ft) {
      var fs2 = res(), fop = !!(SB.economy && fs2 && SB.economy.resUnlocked(fs2, 'faith'));
      ft.classList.toggle('locked', !fop);
      ft.title = fop ? '' : '研究「神学」后开启信仰页';
    }
    /* 公司页的灰态：**第六个独立门槛** —— 宏观经济学（与 tab 灰态、公司成立触发同源：
     *   s.civics.macroeconomics ⇔ 公司系统解锁），不在这里另立一份判据。 */
    var cp = document.querySelector('.tab[data-tab="company"]');
    if (cp) {
      var cs2 = res(), copn = !!(cs2 && cs2.civics && cs2.civics.macroeconomics);
      cp.classList.toggle('locked', !copn);
      cp.title = copn ? '' : '研究「宏观经济学」后开启公司页';
    }
    var sm = document.querySelector('.tab[data-tab="star-map"]');
    if (sm) {
      var ss = res(), sop = !!(ss && (ss.shellOpened || ss.breakSettled) && ss.shell <= 0);
      sm.classList.toggle('locked', !sop);
      sm.title = sop ? '' : '凿穿天壳后开启星图';
    }
    /* 星穹商店（ERA7）：第七个独立门槛 —— 首个太空建筑（轨道卫星）。与 tab 灰态、pane 显示同源。 */
    var sd = document.querySelector('.tab[data-tab="star-dome"]');
    if (sd) {
      var ssd = res(), sdop = !!(ssd && ssd.lvl && ssd.lvl.satellite >= 1);
      sd.classList.toggle('locked', !sdop);
      sd.title = sdop ? '' : '建成首座太空建筑（轨道卫星）后开启星穹商店';
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
      var civOn = cop && !!(SB.civic.hasResearchable && SB.civic.hasResearchable(s));
      ct.classList.toggle('avail', civOn);
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
          if (node.dataset.tab === 'meta' && !meta().shopUnlocked) return;
          if (node.dataset.tab === 'challenges' && !meta().shopUnlocked) return;
          /* 信仰页的门 = 神学（与 setTab 里那道是同一件事写两遍，理由同科技/市政）。
           * 走 resUnlocked 而不是直接读 s.civics.theology：门只有一处定义。 */
          if (node.dataset.tab === 'faith' &&
              !(SB.economy && SB.economy.resUnlocked(res(), 'faith'))) return;
          if (node.dataset.tab === 'star-map' && !(res() && (res().shellOpened || res().breakSettled) && res().shell <= 0)) return;
          /* 星穹商店（ERA7）：门 = 首个太空建筑建成（轨道卫星），与 star-dome 页的显示/结算同源。 */
          if (node.dataset.tab === 'star-dome' && !(res() && res().lvl && res().lvl.satellite >= 1)) return;
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
    if (!box || !el('modal')) return;   // 无 DOM 环境（如离线验收桩）直接跳过
    var modal = el('modal');
    if (o.summary) modal.classList.add('offline-summary-modal');
    else modal.classList.remove('offline-summary-modal');
    var html = o.summary ? (o.body || '') : '<h3>' + (o.title || '离线') + '</h3>' + (o.body || '');
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
      modal.classList.add('hidden'); modal.classList.remove('offline-summary-modal');
      bodyModalClass(false); if (o.onOk) o.onOk();
    };
  }
  function setOfflineProgress(p) {
    var pr = el('offPr'), pct = el('offPct');
    if (pr) pr.style.width = Math.max(0, Math.min(100, p * 100)).toFixed(1) + '%';
    if (pct) pct.textContent = '已完成 ' + (p * 100).toFixed(0) + '%';
  }

  var INTRO = SB.ui.renderContent.INTRO;
  function openIntro(key) {
    var d = INTRO[key]; if (!d) return;
    var pop = el('introPop'); if (!pop) return;
    pop.innerHTML =
      '<div class="ttl">' + (d.icon || '') + ' ' + (d.ttl || '') + '</div>' +
      '<div class="def">' + (d.def || '') + '</div>' +
      '<div class="step">' + (d.step || '') + '</div>' +
      '<div class="closebar"><button class="btn" onclick="SB.ui.closeIntro()">知道了</button></div>';
    var m = el('introMask'); if (m) m.classList.remove('hidden');
    bodyModalClass(true);   /* 弹窗期间禁用 tab 交互（复用 body.modal-open 规则） */
  }
  function closeIntro() {
    var m = el('introMask'); if (m) m.classList.add('hidden');
    bodyModalClass(false);
  }
  /* Esc 关弹窗（防重复绑定：render.js 只加载一次，这里挂一次即可）。 */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var intro = el('introMask'), modal = el('modal');
        if (intro && !intro.classList.contains('hidden')) closeIntro();
        else if (modal && !modal.classList.contains('hidden') && modal.classList.contains('tree-modal')) hideModal();
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
  }

  SB.ui = SB.ui || {};
  SB.ui.openIntro = openIntro;     /* 供 index.html 页签「?」按钮 onclick 调用 */
  SB.ui.closeIntro = closeIntro;
  SB.ui.render = {
    renderAll: renderAll, renderTick: renderTick, renderPanes: renderPanes,
    /* 破壳槽 → 星空槽翻转（2026-10-13）：导出供回归直接断言 shellbar 文案翻转，
     * 与 paneWonder/paneCivicGov 同手法（只导出同一个渲染函数，不写第二份逻辑）。 */
    renderShell: renderShell,
    showBreakPanel: showBreakPanel, showBreakAnimation: showBreakAnimation, hideModal: hideModal, confirmPanel: confirmPanel,
    /* 星空槽满槽占位结算面板（2026-10-13 镜像破壳）：tickStar 满槽时调它弹面板。
     * 导出是因为 shell.tickStar 通过 SB.ui.render.showStarComplete 调用（与 showBreakPanel 同源）。 */
    showStarComplete: showStarComplete,
    /* ERA10（2026-10-20）：戴森球通关弹窗。economy-tick 2f 段 dysonPct 达 1 时通过
     * SB.ui.render.showDysonComplete 调用（与 tickStar→showStarComplete 同款路径）。 */
    showDysonComplete: showDysonComplete,
    /* ERA10 市政《飞升虚境》：戴森竣工时若已掌握该市政，走这个乱码结局弹窗（tick 侧分叉调用）。 */
    showAscendVoid: showAscendVoid,
    voidCorrupt: voidCorrupt,
    storyPanel: storyPanel, techTabOpen: techTabOpen, syncTabLocks: syncTabLocks,
    initTabs: initTabs, initSpeeds: initSpeeds, techGoEra: techGoEra, scheduleTechJumpTo: scheduleTechJumpTo,
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
    setCivicView: setCivicView, toggleGovDetail: toggleGovDetail,
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
    paneChallenges: SB.ui.renderParts.paneChallenges,
    /* ⚠️ 2026-10-05：同理导出工坊三段的渲染函数，回归要直接验「未解锁不显示」。
     *   （走 renderPanes 那条路取不到属性：假 DOM 的 innerHTML 不回填 children。） */
    paneToolRows: SB.ui.renderParts.paneToolRows, paneCraftRows: SB.ui.renderParts.paneCraftRows, paneUpgradeRows: SB.ui.renderParts.paneUpgradeRows,
    renderEvent: renderEvent
  };
})(typeof window !== 'undefined' ? window : globalThis);
