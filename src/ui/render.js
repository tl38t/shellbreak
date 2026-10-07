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
  var PANE_KEYS = ['village', 'folk', 'tech', 'civic', 'faith', 'workshop', 'wonder', 'meta'];

  function res() { return SB.game.run(); }
  function meta() { return SB.game.meta(); }

  function el(id) { return document.getElementById(id); }

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
    meta:     { name: '轮回商店', color: '#9fb4ff' }
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
  loadZoneFold();

  /* ── 工坊「隐藏已完成」（2026-10-05 用户「工坊要能隐藏显示已经完成项目」）──
   * 【为什么是「全局一个开关」而不是「每条已完成项各自可折」】
   *   已完成的数量是**活的**（买下第二把斧头就从 1 变 2），而 zone 折叠那套的键是
   *   **固定 id**（ZONE_FOLDED[id]）⇒ 拿来记「第 N 项已完成」会在计数变化时对不上号。
   *   一个全局开关 + 实时计数，键固定、计数现算，两边都不会漂。
   * ⚠️ 状态存 localStorage 而不是 s（存局内状态会被轮回清掉，玩家每局都要重按）。
   * ⚠️ 默认**不隐藏**：已买下的工具是玩家的资产清单，默认藏起来会让人以为丢了。
   *   想「清爽」的玩家主动点一下，这是设置项该有的默认取向。 */
  var HIDE_DONE_KEY = 'sb.hideDone.v1';
  var hideDone = false;
  try {
    var rawHd = root.localStorage && root.localStorage.getItem(HIDE_DONE_KEY);
    if (rawHd === '1') hideDone = true;
  } catch (e) { hideDone = false; }
  function toggleHideDone() {
    hideDone = !hideDone;
    try { if (root.localStorage) root.localStorage.setItem(HIDE_DONE_KEY, hideDone ? '1' : '0'); } catch (e) {}
    return hideDone;
  }
  /* 「工坊里已完成了几项」——**只数买断类**（工具 + 工艺升级项）。
   * ⚠️ 配方（工艺制作）**不算**：它是反复制造，不存在「完成」状态，
   *   而 `s.res[c]` 是**存量**不是累计（「我做过 3 根石梁」不代表有 3 根在库里）——
   *   真要数得另记累计产量，是另一套需求，本轮不做（用户只说隐藏已完成项目）。 */
  function doneCount(s) {
    var n = 0, i;
    for (i = 0; i < SB.TOOLS.length; i++) if (s.tools && s.tools[SB.TOOLS[i].id]) n++;
    var U = SB.workshop ? SB.workshop.upgrades() : [];
    for (i = 0; i < U.length; i++) if (s.upgrades && s.upgrades[U[i].id]) n++;
    return n;
  }
  /* 开关 HTML。`data-hidedone` 由 input.js 的 document 级委托接手
   * （标题行每 2 秒被 PANE_REFRESH 重画，节点会被换掉 ⇒ 不能挂节点监听）。
   * ⚠️ tooltip 措辞**避开「已买下」三个字**：e2e 有一条断言数 `/已买下/g` 出现次数
   *   （验「买断制」：买过的那一行只应有一处标记），文案里多一个字就会让那条断言变红。
   *   判据：断言用关键词计数时，**UI 文案不得包含那个关键词**，否则文案一改断言就假红。 */
  function hideDoneBtn(s) {
    var n = doneCount(s);
    if (!n) return '';
    return '<button class="tgl" data-hidedone="1" aria-pressed="' + (hideDone ? 'true' : 'false') +
      '" title="点击切换是否显示已完成的项目（工具与升级项）">' +
      (hideDone ? '显示已完成（' + n + '）' : '隐藏已完成（' + n + '）') + '</button>';
  }

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
      if (!SB.economy.resUnlocked(s, k)) continue;
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
      /* 信仰行的标签：玩家给信仰起了名 ⇒ 用宗教名代替「信仰」二字（神学解锁后可在 #religionBox 改名）。 */
      var rowName = SB.RESS[k].name;
      if (k === 'faith') {
        var rn = (s.religionName || '').trim();
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
    var p = SB.economy.rOf(s) * 100;
    var f = el('shellFill');
    f.style.width = Math.max(0, p) + '%';
    f.className = 'shellfill' + (SB.economy.isCold(s) ? ' cold' : '');
    el('shellTxt').innerHTML =
      Math.round(s.shell) + ' / ' + s.iceShell + '（' + p.toFixed(1) + '%）' +
      (SB.economy.isCold(s) ? ' <span class="coldbadge">· 本季冰封</span>' : '');
    var hint = '基础削壳持续中：系数越高削得越快，族民、建筑、科技都在推高它。';
    if (SB.economy.rOf(s) <= CFG.FLOOR_AT) {
      hint = '壳已薄到下限，基础削壳停手——建成「天穹钻机」后，在下方这行启动它凿穿最后一段。';
    }
    /* ⚠️ 冻伤出口在 2026-09-26 换过轴：原来是「建暖壳石」，现在是「开暖石开关」，
     *    提示语要跟着走，否则玩家在新存档里翻遍建筑页也找不到防冻的路。
     * ⚠️ 2026-09-27 冰封期本身也换过轴：原来是「壳薄到 25% 就永久挨冻」，现在是
     *    「每个寒流季开局掷一次骰」。玩家必须能看见这个概率，否则「这季怎么突然冻了」
     *    读不出来 —— 概率按**当前壳厚**算，壳越薄越容易中（线性、封顶 33%）。 */
    if (SB.economy.isCold(s)) hint += ' 本季冰封：全局产出 ×0.6，族民会冻伤（拨开暖石开关即可免）。';
    if (!SB.economy.isCold(s)) {
      hint += ' 冰封期在每个寒流季开局掷一次，壳越薄越容易中——按现在的壳厚是 ' +
        Math.round(SB.economy.freezeChance(s) * 100) + '%。';
    }
    el('shellHint').textContent = hint;
  }

  /* ── 自然环境：天壳（上面那条 shellbar）+ 海底火山（这里这行）─────────────
   * 【为什么这两件事归到一张卡】用户 2026-09-26 指出：海底火山是**读天候的**，
   *   和天壳是同一类东西，摆在「巢穴」页那堆建造动作里没有归属感。
   *   拆分口径：巢穴页只答「我要做什么」，自然环境只答「外面现在什么样」。
   * 【为什么内容在这里拼、不写进 index.html】它随「历法」是否掌握整块换文案 ——
   *   静态 HTML 只能写「没掌握」的那一半，掌握之后那一半无处可放。
   * 没掌握历法时不显示读数，只给一句「看不出规律」——**这条信息缺口本身就是奖励**，
   * 玩家因此知道有件事还没解锁，而不是盯着一个没有解释的百分比。
   * 读数走 economy.seasonMeta，它读的是 seasonMul(s, relief)（玩家已享受到的那个数），
   * 不是 SEASONS[i].mult 的裸值——否则学了历法反而看到倍率“变差了”。
   * ⚠️ 2026-09-30：relief 也要并进去——烧暖石时这一格会从 0.573 抬到 0.947。
   *   卡片写的是「这一季深海藻场产出」，漏掉 relief 就是「面板撒谎」：
   *   拨开关数字不动，玩家只能得出「开关没用」。
   * ⚠️ 这个容器是每帧重画的（季节会变），所以**它里面不许放按钮**：每帧重建 DOM 会让
   *    「按下与抬起之间元素被换掉」的那次点击整个丢失。要塞东西进来先确认它是纯读数。
   *    （暖石开关曾经因此留在巢穴页；2026-09-27 用户要求搬到这张卡，于是另开一个
   *     #envWarm 容器 + **状态签名节流**——见下面 renderWarm，同样每帧刷但不无谓重建。）
   * ⚠️ 文案一样就不写回 innerHTML：内容其实只在换季那一刻变，10 次/秒的无谓重建
   *    既费 DOM 又会让文本选中被反复清掉。 */
  var envCache = '';
  function renderEnv(s) {
    if (!s) return;
    var box = el('envVolcano'); if (!box) return;
    var sm = SB.economy.seasonMeta(s);
    var html = '<div><div class="nm">海底火山 · ' +
      (sm.known ? sm.name : '看不出规律') + '</div><div class="ds">' +
      (sm.known
        ? '这一季深海藻场产出 ×' + sm.mult.toFixed(3) +
          '；约 ' + sm.left + ' 潮日后转<b>' + sm.next + '</b>。'
          + (sm.mult < 1 ? '<span style="color:var(--red)">减产季。</span>' : '')
        : '族民记下的次数对不上潮水的涨落——「历法」能把这一季的周期与减产幅度读出来。')
      + '</div></div>';
    if (html === envCache) return;
    envCache = html;
    box.innerHTML = html;
  }

  /* ── 暖石开关（「保温法」那道开关）────────────────────────────────────
   * 【为什么它住在这一卡而不是巢穴页】用户 2026-09-27 拍板：开关效果**只在寒流季发生**
   *   （见 economy.warmBurningNow 的季节闸），而寒流季是海底火山那条周期的一部分。
   *   摆在「建造 / 我要做什么」那一堆里，玩家是在考虑造什么时才找开关——
   *   恰好是永远用不上它的语境。自然环境卡才是「外面现在什么天候」的语境。
   * 【为什么它不能塞进 #envVolcano】那个容器每帧重画、纯读数。按钮在里面会被反复换掉，
   *   input.js 是 document 级委托，换掉之后 pointerup 落在已移除的元素上 ⇒ 那次点击整个丢。
   * 【怎么做到「也每帧刷、又不丢点击」】状态签名节流：
   *   签名 = 开/关 × 寒流季/非 × 正在烧/否 —— 三个量一季最多变几次，
   *   签名不变就**一个 DOM 节点都不动**，按钮元素始终在位。
   *   库存数字（每帧都可能变）走独立 span 的 textContent 单独刷，不进签名。
   * ⚠️ 别把库存数字并回签名：暖石烧起来时它每秒变 10 次（STEP=0.1），
   *   那会让按钮每 100ms 重建一次，点击必然丢——正是这套节流要防的事。
   * 面板四种状态，少写一种玩家就会以为开关坏了：
   *   没这项科技（整行不显示）/ 已关 / 待命（非寒流季，不耗石）/ 石不够 / 正在烧。 */
  var warmSig = '';
  function renderWarm(s) {
    var box = el('envWarm'); if (!box) return;
    var hasThermal = !!(s.techs && s.techs.thermal);
    if (!hasThermal) {
      if (warmSig !== '') { warmSig = ''; box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    box.style.display = '';
    /* 闸的判据在 economy.warmBurningNow（mult<1），这里只做展示层的归类：
     * 用 season 而不是 burning 反推「非寒流季」——烧不烧还叠加了石够不够，
     * 反推会把「石不够」误报成「不在寒流季」，提示就自相矛盾了。 */
    var inCold = SB.economy.season(s.t).mult < 1;
    var burning = SB.economy.warmBurning(s);
    var sig = (s.warmOn ? 'on' : 'off') + '|' + (inCold ? 'c' : 'w') + '|' + (burning ? 'b' : '-');
    if (sig !== warmSig) {
      warmSig = sig;
      var live = s.warmOn && (s.res.warmstone || 0) > 0;
      box.innerHTML = '<div><div class="nm">暖石开关 <span class="tag" id="envWarmWs">0</span></div>' +
        '<div class="ds">保温法：烧暖石（' + SB.CFG.WARM_RATE +
        '/秒）<b>只在寒流季生效</b>——顶回藻场减产（不是全额，留一点残余），' +
        '寒流季若触发冰封期则冻伤归零。一份暖石两件事都靠它，其余季不耗石。</div></div>' +
        /* 按钮文案 = **当前状态**（底色表态：绿=启用 / 灰=停用），不是「点了会怎样」——
         * 原先写「开/关」两可，玩家读不出此刻到底是开是关（用户 2026-09-30 报）。
         * 正在烧时再加一圈琥珀描边，把「已启用」与「真在烧」两个状态分开。 */
        '<button class="btn tog' + (s.warmOn ? ' on' : '') + (burning ? ' burning' : '') +
        '" data-warm="1" title="点击切换启用 / 停用">' + (s.warmOn ? '启用' : '停用') + '</button>';
    }
    /* 库存数字单独刷：不进签名，所以烧起来时它是唯一在动的节点，按钮不动。 */
    var ws = el('envWarmWs');
    if (ws) ws.textContent = Math.floor(s.res.warmstone || 0);
  }

  /* ── 天穹钻机启动行（2026-10-07）────────────────────────────────────
   * 【为什么它住在这一卡】与暖石开关同一个归属逻辑：钻机是「读着天壳才用得上」的动作
   *   （壳削到 25% 下限后才有意义），看壳的地方就是用它的地方。原「剥壳工程」页签
   *   同日删除（用户：「这个标签不需要保留」），钻机的入口从页签收成这一行。
   * 【状态签名节流】与 renderWarm 同一套纪律：#envDrill 是每帧刷的容器，但只在
   *   签名（启动/停 × 运转/停摆）变化时才重写 innerHTML，按钮元素始终在位不丢点击；
   *   共振钻头库存（每帧都可能变）走独立 span 的 textContent 单独刷，不进签名。
   * 【面板三态】未启动（灰按钮）/ 运转中 / 停摆——停摆 = 开着但缺料，是 shell.tickShell
   *   的 skydrillStarved 位；原因只有两种：共振钻头见底，或热液能剩流 < 20/s。
   *   每种都把「为什么」写全，否则玩家读不出该去补哪条线。
   * 【隐藏两态】未建成奇观 / 已破壳（钻机转奇观态，跟壳厚无关了）——整行不显示。 */
  var drillSig = '';
  function renderDrill(s) {
    var box = el('envDrill'); if (!box) return;
    var owned = !!(SB.wonder && SB.wonder.owned(s).wonder_skydrill);
    if (!owned || s.broken) {
      if (drillSig !== '') { drillSig = ''; box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    box.style.display = '';
    var starved = !!s.skydrillStarved && !!s.skydrillOn;
    /* ⚠️ 2026-10-07 用户报「已启动还是没反应」：停摆文案原是「钻头见底，或剩流不足」二选一
     *   的泛化句，玩家读不出自己卡在哪条。改为**带实测数字**的诊断：
     *   hydroAlloc(s,1) 是纯函数（dt=1 ⇒ 各字段已是每秒口径），直接给出供/吃/剩三数，
     *   并按「哪条线缺」分流文案——缺钻头说钻头，缺剩流就报汽轮机供给与工坊吃量。
     * ⚠️ 剩流整数部分纳入签名：玩家升汽轮机时这行数字跟着刷新（每 +1/s 重写一次），
     *    否则「补足了但文案还报旧数」又是一条面板撒谎。 */
    var _HF = (SB.economy && SB.economy.hydroAlloc) ? SB.economy.hydroAlloc(s, 1) : null;
    var _left = _HF ? Math.max(0, _HF.left) : 0;
    var sig = (s.skydrillOn ? 'on' : 'off') + '|' + (starved ? 's' : '-') + '|' +
      Math.min(999, Math.floor(_left));
    if (sig !== drillSig) {
      drillSig = sig;
      var ds;
      if (!s.skydrillOn) {
        ds = '建成即就绪，尚未启动。点右侧按钮开始凿穿最后 ' + (CFG.FLOOR_AT * 100) +
          '% 壳厚——运转期间持续吃共振钻头（' + SB.CFG.SKYDRILL_DRILL + '/秒）与热液能（' +
          SB.CFG.SKYDRILL_HYDRO + '/秒，从热液工坊吃剩的流里取）。';
      } else if (starved) {
        if ((s.res.resonantDrill || 0) < SB.CFG.SKYDRILL_DRILL) {
          ds = '停摆：共振钻头见底（现存 ' + Math.floor(s.res.resonantDrill || 0) +
            '，运转每秒耗 ' + SB.CFG.SKYDRILL_DRILL + '）。去工坊打「共振钻头」补货，补足后自动恢复，无需重启。';
        } else {
          var _tur = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0));
          ds = '停摆：热液能剩流 ' + _left.toFixed(1) + '/秒，不足 ' + SB.CFG.SKYDRILL_HYDRO +
            '/秒——汽轮机运行 ' + _tur + ' 座供 ' + (_HF ? _HF.supplyRate.toFixed(1) : '?') +
            '/秒，热液工坊吃 ' + (_HF ? _HF.shopRate.toFixed(1) : '?') + '/秒。' +
            '升汽轮机（每级 +1/秒）或停用热液工坊；暖石断供汽轮机也会停产。补足后自动恢复，无需重启。';
        }
      } else {
        ds = '运转中：钻头以 ' + SB.CFG.SKYDRILL_RATE + ' 点/秒削壳（轮回「壳层勘探」可再加成），吃完停摆、补足自动续。';
      }
      box.innerHTML = '<div><div class="nm">天穹钻机 <span class="tag" id="envDrillCt">0</span></div>' +
        '<div class="ds">' + ds + '</div></div>' +
        '<button class="btn tog' + (s.skydrillOn ? ' on' : '') +
        '" data-skydrill="1" title="点击启动 / 停机">' + (s.skydrillOn ? '已启动' : '已停机') + '</button>';
    }
    var ct = el('envDrillCt');
    if (ct) ct.textContent = Math.floor(s.res.resonantDrill || 0) + ' 钻头';
  }

  /* ── 宗教命名框（2026-09-29）────────────────────────────────────
   * 【为什么是持久容器、不走 #res / pane 每帧重建】信仰资源行在 #res（每帧 innerHTML 重写），
   *   civic pane 每 2 秒重写 —— 里面塞 <input> 每敲一字就被换掉、丢焦点。
   *   所以宗教名框是 index.html 里的一个**持久**节点 #religionBox，这里用签名节流只管 gate：
   *   签名 = 神学前/后。theology 一解锁才渲染一次输入框，之后只在 gate 翻转时重建；
   *   玩家打字只写 state、不触发本函数重建 ⇒ 焦点不丢。
   * 【写回时机】走 input.js 的 onChange（blur/回车）→ 写 s.religionName。不用 input 事件，
   *   避免每键都 markDirty；faith 行（#res）每帧读 s.religionName，改名后下一帧即刷新。 */
  var relSig = '';
  function renderReligion(s) {
    var box = el('religionBox'); if (!box) return;
    var open = !!(s.civics && s.civics.theology);
    if (!open) {
      if (relSig !== '') { relSig = ''; box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    box.style.display = '';
    if (relSig !== 'open') {
      relSig = 'open';
      var nm = (s.religionName || '').trim();
      box.innerHTML = '<div class="nm">你的信仰</div>' +
        '<input class="relname" data-religion="1" type="text" maxlength="16" placeholder="给信仰起个名字…"' +
        (nm ? ' value="' + nm.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"' : '') + '>' +
        '<div class="ds">这个名字会显示在你的信仰资源上。改名随时可改，无消耗。</div>';
    }
  }

  function paneVillage() {
    var s = res(); let h = '';
    /* 猫国开局唯一产能是手动点 "Gather catnip"（点一下 +1 猫薄荷）。
     * 本作对应物：点一下 +1 藻食——对齐 docs/DESIGN_v0.3.md §4「采集者 gatherer |
     * 藻食（手动也能点）」。手动采集产珊瑚是错的：那会把采集接到材料线上，
     * 珊瑚线从此由「采集」白送，珊瑚匠这个职业就没有存在理由了（见 config.js UNIT）。
     * 【开局路径（2026-09-26 硬上限 + 撤回「凿珊瑚」免费之后）】首座住房吃珊瑚
     *   （猫国 hut = wood），且人口是**硬上限** ⇒ 珊瑚那条线才是第一步：
     *   手动点「采珊瑚」100 下（0.1/次）→ 建礁口巢 → 上限 1 变 3 → 才有空位生人；
     *   生人同时还要口粮藻食 > GROW_KEEP。**先藻食后珊瑚那个顺序在硬上限下是错的**
     *   （建了菌圃也不生人），旧注释照 2026-09-25 的软容量写的，已改。 */
    /* 开局两条手动进项：藻食（食物线，攒够 15 建第一座深海菌圃）与珊瑚（材料线，
     * 攒够 10 建第一座礁口巢）。珊瑚给 0.1/次是刻意的——它是起步的零钱不是产线，
     * 真要用还得雇珊瑚匠（见 config.js 的 GATHER）。 */
    /* ⚠️ 按钮上的读数直接取 SB.GATHER，不在这里写死「+1 / +0.1」——
     * 写死的那一版曾经和 input.js 里真正入账的量对不上（那次是路径取错，
     * 这次是常数取错），玩家点一下发现和按钮上写的不一样。同源了之后
     * e2e 那条「读数与常数同源」断言才真的在守什么东西。 */
    var GA = SB.GATHER || { kelp: 1, coral: 1 };
    h += '<div class="row"><div><div class="nm">手动采集</div>' +
      '<div class="ds">开局 1 人、0 自动收入，靠这个起步：先攒 5 珊瑚盖起礁口巢' +
      '（人口上限 1 → 3），再攒 15 藻食建深海菌圃让口粮跟上。</div></div>' +
      '<button class="btn buy" data-gather="kelp">采藻食 +' + GA.kelp + '</button>' +
      '<button class="btn buy" data-gather="coral">采珊瑚 +' + GA.coral + '</button></div>';

    /* ── 海底火山周期已挪走（2026-09-26 用户要求）──
     * 它是**读天候的**，和天壳（冰封层厚度）是一类东西，摆在「巢穴」这堆建造动作里
     * 没有归属感。现在两条一起住在顶上的「自然环境」卡里，实现见 renderEnv。
     * 拆分口径：巢穴页只答「我要做什么」，自然环境只答「外面现在什么样」。 */

    /* ── 暖石开关已搬走（2026-09-27 用户要求）──
     * 它原来在这一页，现在住顶上「自然环境」卡里的独立容器 #envWarm（实现见 renderWarm）。
     * 搬的理由：它的效果**完全由天候决定**（只在寒流季烧），摆在建造成那一堆里，
     * 玩家是在「外面什么天候」的语境下才会想到它——那正是自然环境卡的语境。
     * 它**不是**一条环境读数而是一项玩家动作，所以不能塞进同样每帧重画的 #envVolcano，
     * 而是另开一个容器 + 状态签名节流（细节见 renderWarm）。 */
    /* ── 建筑按区分组渲染（2026-09-30 纯 UI 分区 A 方案）──
     * 外层按 BUILD_ZONES 顺序分区，区内沿用上面「露头/解锁」判定；
     * 某区零可见建筑时整段区标题隐藏（开局只露出礁栖核心 + 生息区，其余随进度展开）。
     * 露头逻辑与原平铺版完全一致，只是多了一层分区外壳。 */
    for (var zi = 0; zi < (SB.BUILD_ZONES || []).length; zi++) {
      var z = SB.BUILD_ZONES[zi];
      var zRows = '';
      var zShown = 0;
      for (var i = 0; i < SB.BUILDINGS.length; i++) {
        var b = SB.BUILDINGS[i];
        if (b.zone !== z.id) continue;
        /* 没解锁的建筑整行不渲染——开局列表里只有深海菌圃一张脸，
         * 其余随 unlockScheme / requiredTech / 科技 eff.unlockBuild 逐个出现。
         * 露头是单向的：露过一次就永久可见（lv>0 或已记进 s.seen）。
         * 否则玩家一花藻食把库存压回阈值以下，刚冒出来的采石场/导流堤会当场消失，
         * 看着像「建筑自己跳出来又自己没了」——猫国 unlockable 同样只进不退。 */
        var lv = s.lvl[b.id] || 0;
        var isUnlocked = SB.habitat.unlocked(s, b);
        if (SB.habitat.retired && SB.habitat.retired(s, b)) continue;
        if (lv <= 0 && !(s.seen && s.seen[b.id]) && !isUnlocked) continue;
        if (isUnlocked) SB.habitat.reveal(s, b);
        /* ⚠️⚠️ 建筑升级型 = 同一座建筑改名字（2026-10-06 用户两次纠偏定死）。
         *   本作有四条升级项 desc 写的是「X升级：…」——鱼骨矿井 / 大学 / 城堡 / 深层矿井。
         *   它们的语义都是**那座建筑买下之后就地改名**，不是另造一座：
         *     砂矿坑 → 鱼骨矿井 → 深层矿井（两级链）
         *     研究所 → 大学
         *     议事厅 → 城堡
         *   ⇒ 这一行的 id、等级键、造价曲线**全程不变**，只有显示名与效果文案变。
         *   判据读 UPGRADES 的 `upgradesBuilding` 字段（声明在数据侧，见 config 那段注释），
         *   UI 侧只做一次通用查找 ⇒ 加第五个这种升级时不必再动这个文件。
         *   ⚠️【为什么不能靠改 `b.name` 实现】建筑定义是全局常量，被 costOf / 科技 / 分区
         *      多处共读，在那里改名会让所有跨模块读数一起变。改显示名是**纯 UI 动作**。
         *   ⚠️【链式取最深一级】矿坑有两级升级（鱼骨矿井 → 深层矿井），两件都装了时
         *      面板要显示**最后一级**的名字（深层矿井），所以按 UPGRADES 的声明顺序遍历、
         *      命中即记、继续往后覆盖 —— 而不是「命中就 break」。 */
        /* ⚠️ 变量名不许叫 `ui`：`SB.ui` 是本模块在文件末尾挂上去的**全局命名空间**
         *   （SB.ui.openIntro / SB.ui.render）。在这里 `var ui` 会把它遮蔽成循环下标，
         *   于是模块末尾 `SB.ui = SB.ui || {}` 读到数字 0 → falsy → 整个命名空间重建为空对象，
         *   页面启动即 `querySelector is not a function`。踩过一次，改名 `_upi`。 */
        var dispName = b.name, dispDesc = b.desc;
        for (var _upi = 0; SB.UPGRADES && _upi < SB.UPGRADES.length; _upi++) {
          var _u = SB.UPGRADES[_upi];
          if (_u.upgradesBuilding === b.id && s.upgrades && s.upgrades[_u.id]) {
            dispName = _u.name;
            /* `buildingDesc` 是给建筑行准备的完整文案；没写就退回 `desc`。
             *   两者主语不同：desc 说「砂矿坑升级：…」（升级面板里正确），buildingDesc
             *   直接陈述效果（那一行已经叫鱼骨矿井了）。见 config 那段分工注释。 */
            dispDesc = _u.buildingDesc || _u.desc;
          }
        }
        var c = SB.economy.costOf(s, b.id);
        var ok = SB.economy.canAfford(s, c);
        var blocked = !SB.habitat.needMet(s, b);
        /* 按钮文案**一律带成本**。旧写法是「够钱写『建造』、不够才写成本」，于是
         * 恰好在最该看成本的那一刻（攒够了）成本从按钮上消失，而按钮宽度还会随库存
         * 反复跳变（够 → 变窄 → 花掉 → 又变宽），点起来像在躲手指。
         * 等级 >0 用「升级」、首级用「建造」：买的是同一件事，但玩家心里问的是
         * 「这一级要多少」，用词跟着等级走比一律写「建造」更答得上话。
         * 前置没满足时只说「需 XX」——那时按钮点不动，成本不是当下该看的信息。 */
        var label = blocked ? '需 ' + (SB.habitat.buildingById(b.need) || {}).name
          : (lv > 0 ? '升级 ' : '建造 ') + SB.economy.costOwnedTxt(s, c);
        /* 王国潮道的跨建筑钳制与 build()/lockReason() 同一条判定——不判它按钮会
         * 「亮着但点了没反应」（build 内部静默 return false）。 */
        var canalCap = b.id === 'canal' && (s.lvl.canal || 0) >= (s.lvl.lighthouse || 0);
        if (canalCap) label = '需先升灯塔（现 ' + (s.lvl.lighthouse || 0) + ' 级）';
        /* 生息区自动升级开关（2026-09-30 · 封建主义解锁2）：逐建筑开关放 s.autoUpg[id]，
         * 点击走 input.js 的 data-auto 分支。执行在 game.js 在线泵的 habitat.autoTick。 */
        var autoBtn = '';
        if (z.id === 'food' && s.civics && s.civics.feudalism) {
          var _au = !!(s.autoUpg && s.autoUpg[b.id]);
          /* 与暖石开关同一套「启用 / 停用 + 绿 / 灰」（2026-09-30 用户：开/关分不清）——
           * 同一页里两种开关语言会让人以为它们不是一回事。 */
          autoBtn = '<button class="btn tog' + (_au ? ' on' : '') + '" data-auto="' + b.id + '"' +
            ' title="自动升级：点击切换启用 / 停用">' +
            (_au ? '自动·启用' : '自动·停用') + '</button>';
        }
        /* 热泉炉「开几座」（2026-09-30 用户：「这行应该是选择开几个」）：建成（lv>0）后才出现。
         * 炉子是「金属+暖石 → 精铁」的持续消耗口，玩家按原料供给决定开几座。
         * 运行座数 = lv − 停用数（s.furnaceStop），结算在 economy.ironFlow。
         * ± 按钮走 document 级委托，所以 pane 每 2 秒重画也不会丢点击。 */
        var furnBtn = '';
        if (b.id === 'furnace' && lv > 0) {
          var _frun = Math.max(0, lv - Math.max(0, s.furnaceStop || 0));
          furnBtn = '<span class="furnctl' + (_frun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-furnace-dec="1" title="少开一座"' +
            (_frun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _frun + '/' + lv + '</b>' +
            '<button class="fbtn" data-furnace-inc="1" title="多开一座"' +
            (_frun >= lv ? ' disabled' : '') + '>＋</button>' +
            '</span>';
        }
        /* 热液汽轮机「开几座」（2026-10-07，与热泉炉 furnaceStop 同口径）：建成（lv>0）后才出现。
         * 汽轮机每台恒烧暖石 5/s、产热液能流 1/s；玩家要省暖石（或没工坊/钻机吃流）时按下几座。
         * 运行座数 = lv − 停用数（s.turbineStop），结算在 economy.hydroAlloc（供给）/ steelFlow（暖石扣费）。
         * 复用 .furnctl 样式（−/＋/数字，绿=运转中），± 走 document 级委托防丢点击。 */
        var turbBtn = '';
        if (b.id === 'hydroturbine' && lv > 0) {
          var _trun = Math.max(0, lv - Math.max(0, s.turbineStop || 0));
          turbBtn = '<span class="furnctl' + (_trun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-turbine-dec="1" title="停一座"' +
            (_trun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _trun + '/' + lv + '</b>' +
            '<button class="fbtn" data-turbine-inc="1" title="开一座"' +
            (_trun >= lv ? ' disabled' : '') + '>＋</button>' +
            '</span>';
        }
        /* 热液工坊「开几座」（2026-10-07，与汽轮机 turbineStop / 热泉炉 furnaceStop 同口径）：建成（lv>0）后才出现。
         * 工坊吃热液能流产钢；玩家要「把流让给天穹钻机」或不想产钢时按下几座。
         * 运行座数 = lv − 停用数（s.hydroshopStop），结算在 economy.hydroAlloc（shopL）。复用 .furnctl 样式。 */
        var shopBtn = '';
        if (b.id === 'hydroshop' && lv > 0) {
          var _srun = Math.max(0, lv - Math.max(0, s.hydroshopStop || 0));
          shopBtn = '<span class="furnctl' + (_srun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-shop-dec="1" title="停一座"' +
            (_srun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _srun + '/' + lv + '</b>' +
            '<button class="fbtn" data-shop-inc="1" title="开一座"' +
            (_srun >= lv ? ' disabled' : '') + '>＋</button>' +
            '</span>';
        }
        // 没有等级上限，所以只显示当前级数，不显示 x/上限
        // 潮纹馆带「虚级」（大潮纹馆 +3，按效果算、按建筑不算，见 wonder.libBonus）：
        // 徽章直接写成「1+3」——真实等级在前、虚级在后，一眼看出哪部分是白送的。
        // 其它建筑没有虚级通道，照旧只写一个数。
        var lvTxt = (b.id === 'library' && SB.wonder && SB.wonder.libBonus(s) > 0)
          ? lv + '+' + SB.wonder.libBonus(s) : lv;
        var rowState = 'bld-row' + (lv > 0 ? ' is-owned' : '') + (blocked || canalCap ? ' is-blocked' : '') +
          (!blocked && !canalCap && ok ? ' is-ready' : '');
        zRows += '<div class="row ' + rowState + '"><div><div class="nm"><button type="button" class="building-name" data-build-info="' + b.id +
          '" aria-haspopup="dialog" title="查看' + dispName + '的效果与建造信息">' + dispName + '</button>' +
          ' <span class="tag" data-lv="' + b.id + '"' +
          (lvTxt !== String(lv) ? ' title="含大潮纹馆虚级（只算科技产出效果，不算建筑等级、不加建造成本）"' : '') +
          '>' + lvTxt + '</span>' + autoBtn + furnBtn + turbBtn + shopBtn + '</div>' +
          '<div class="ds">' + dispDesc + (blocked ? '（需先建成' + (SB.habitat.buildingById(b.need) || {}).name + '）' : '') +
          '</div></div>' +
          '<button class="btn buy" data-build="' + b.id + '"' + (ok && !blocked && !canalCap ? '' : ' disabled') + '>' + label + '</button></div>';
        zShown++;
      }
      /* 区标题按区着色（2026-09-30 晚）：--hc 交给 CSS 画左色条 + 同色文字，
       * 与最外层 cardhd 同一套语言（见 ZONE_COLOR）。
       * 2026-09-30 晚再补折叠：外包一层 .bzone，标题带 data-zfold（点击委托），
       * 正文进 .bzbody；折叠态从 ZONE_FOLDED 重拼（pane 每 2 秒重画，落类会被冲掉）。 */
      if (zShown > 0) {
        h += '<div class="bzone' + (ZONE_FOLDED[z.id] ? ' folded' : '') +
          '" data-zone="' + z.id + '">' +
          '<div class="bztitle" data-zfold="' + z.id + '" style="--hc:' +
          (ZONE_COLOR[z.id] || 'var(--dim)') + '" title="点击折叠 / 展开">' +
          '<span class="bzcv">▾</span>' + z.name + '</div>' +
          '<div class="bzbody">' + zRows + '</div></div>';
      }
    }
    return h;
  }

  function happyPanelHTML(s) {
    if (!SB.economy.resUnlocked(s, 'luxury') || !SB.economy.happyLedger) return '';
    var L = SB.economy.happyLedger(s);
    var tiers = SB.economy.HAPPY_TIERS || [];
    var low = CFG.HAPPY_FLOOR, high = tiers.length ? tiers[tiers.length - 1].lo : 3;
    var pct = Math.max(0, Math.min(100, (L.H - low) / (high - low) * 100));
    var flow = '奢侈品供给 ' + L.out.toFixed(2) + '/秒 · 居民消耗 ' + L.burn.toFixed(2) + '/秒 · ' +
      (Math.abs(L.net) < 0.0005 ? '幸福度持平' : '幸福度' + (L.net > 0 ? ' +' : ' ') + L.net.toFixed(3) + '/秒');
    var bonus = '';
    if (L.bonusParts && L.bonusParts.length) {
      var parts = [];
      for (var i = 0; i < L.bonusParts.length; i++) {
        var bp = L.bonusParts[i];
        parts.push(bp.label + (bp.v > 0 ? ' +' : ' ') + (+bp.v.toFixed(2)));
      }
      /* ⚠️ 2026-10-06 用户报 bug：消耗的单价里曾把下面这些「固定加成」也算进去
       *   （等于加成自己把居民养贵 ⇒ 政体 +1 幸福真实是负收益）。已修：消耗按 `mechH`
       *   计价。把这句明写出来，玩家才知道加成只是补贴、不会被反向征税。 */
      bonus = '<div class="happy-bonus">固定加成：' + parts.join(' · ') +
        (L.mechH > 0
          ? '　（不计入消耗单价 —— 居民消耗按幸福 ' + L.mechH.toFixed(2) + ' 计）'
          /* mechH ≤ 0 ⇒ 每人的消耗单价已落到保底 0.005，再印那个负数只会误导。 */
          : '　（不计入消耗单价 —— 计价已落到保底）') +
        '</div>';
    }
    var next = L.toNext == null ? '幸福度已达最高档' : L.toNext > 0
      ? '距「' + L.tier.nextName + '」还差 ' + L.toNext.toFixed(2)
      : '再下降 ' + Math.abs(L.toNext).toFixed(2) + ' 将跌至「' + L.tier.nextName + '」';
    return '<section class="happy-panel" id="happyPanel" aria-label="幸福度">' +
      '<div class="happy-head"><div class="happy-reading"><span>幸福度</span> <b id="happyValue">' + L.H.toFixed(2) +
      '</b><i id="happyTier">' + L.tier.name + '</i></div><span class="happy-effect" id="happyEffect">全产 ×' +
      SB.economy.happyMul(s).toFixed(2) + '</span></div>' +
      '<div class="happy-meter" role="meter" aria-label="幸福度等级" aria-valuemin="' + low + '" aria-valuemax="' + high +
      '" aria-valuenow="' + L.H.toFixed(2) + '"><div class="happy-meter-fill"></div>' +
      '<i class="happy-marker" id="happyMarker" style="left:' + pct.toFixed(2) + '%"></i></div>' +
      '<div class="happy-labels"><span>动荡</span><span>不满</span><span>安定</span><span>愉悦</span><span>欢欣</span><span>欣喜若狂</span></div>' +
      '<div class="happy-flow" id="happyFlow">' + flow + '</div>' + bonus +
      '<div class="happy-next" id="happyNext">' + next + '</div></section>';
  }

  function paintHappy(s) {
    var marker = el('happyMarker');
    if (!marker || !s || !SB.economy.happyLedger) return;
    var L = SB.economy.happyLedger(s);
    var tiers = SB.economy.HAPPY_TIERS || [];
    var low = CFG.HAPPY_FLOOR, high = tiers.length ? tiers[tiers.length - 1].lo : 3;
    marker.style.left = Math.max(0, Math.min(100, (L.H - low) / (high - low) * 100)) + '%';
    var value = el('happyValue'), tier = el('happyTier'), effect = el('happyEffect');
    if (value) value.textContent = L.H.toFixed(2);
    if (tier) tier.textContent = L.tier.name;
    if (effect) effect.textContent = '全产 ×' + SB.economy.happyMul(s).toFixed(2);
    var flow = el('happyFlow');
    if (flow) flow.textContent = '奢侈品供给 ' + L.out.toFixed(2) + '/秒 · 居民消耗 ' + L.burn.toFixed(2) + '/秒 · ' +
      (Math.abs(L.net) < 0.0005 ? '幸福度持平' : '幸福度' + (L.net > 0 ? ' +' : ' ') + L.net.toFixed(3) + '/秒');
    var next = el('happyNext');
    if (next) next.textContent = L.toNext == null ? '幸福度已达最高档' : L.toNext > 0
      ? '距「' + L.tier.nextName + '」还差 ' + L.toNext.toFixed(2)
      : '再下降 ' + Math.abs(L.toNext).toFixed(2) + ' 将跌至「' + L.tier.nextName + '」';
    var meter = el('happyPanel');
    if (meter) {
      var bar = meter.querySelector('.happy-meter');
      if (bar) bar.setAttribute('aria-valuenow', L.H.toFixed(2));
    }
  }

  function paneFolk() {
    var s = res();
    var T = CFG.TIDE;
    /* ⚠️ 硬上限下 `pop` 永远 ≤ `popCap`，所以括号里的上限不会再和人数打架
     * （2026-09-25 那版软容量会打出「族民 7（人口上限 2）」，玩家报过一次 bug）。
     * 但光看数字，玩家仍会问「那为什么不再生人」⇒ 顶到时直接标红「住满」，
     * 下一行的生育进度条会写明原因（缺住房）。 */
    var h = '<div class="row folk-summary"><div><div class="nm">族民 ' + s.pop + '（人口上限 ' + SB.economy.popCap(s) + '）' +
      (SB.economy.isFull(s) ? '<span class="bad">住满</span>' : '') + '</div>' +
      '<div class="ds">藻场见底会饿死；冰封期会冻死。保温巢能省口粮，藻场不够就先补场。</div></div></div>';
    h += happyPanelHTML(s);
    /* 生育状态常驻一行：进度条只有 3px，且停摆时空着和漏存长得一样，
     * 这里用文字把「还需几秒」和「为什么走不动」摊开，手机上不靠 hover 也能看见。
     * 【为什么用 id 而不是整块重画】renderPanes 只在切页/置脏时跑，
     * 每帧的 renderTick 不碰 pane 的 innerHTML——这行要是拼死在字符串里就永远不会动
     * （实测：数字定格、条纹丝不动，刷新页面才更新）。于是挂 id，paintGrow 每帧只改这三处。 */
    h += '<div class="row folk-growth"><div><div class="nm" id="growNm"></div>' +
      '<div class="gbar"><i id="growFill" style="width:0%"></i></div>' +
      '<div class="ds" id="growWhy"></div></div></div>';
    paintGrow(s);   // renderPanes 还没把 innerHTML 挂上时这里是空操作，下一帧（≤100ms）会补上
    /* 峰值族民是破冰结算的主指标之一：人口越深、工坊解锁越多、破壳越彻底，轮回点越多。
     * 直接把 breakReport 的实时预计摆出来，避免再显示已废弃的 POP_GATE / POP_SLOPE 旧口径。 */
    var br = SB.prestige.breakReport(s);
    h += '<div class="row folk-peak"><div><div class="nm">峰值族民 <b>' + s.peak + '</b> ' +
      '<span class="tag ok">预计轮回点 ' + br.tidePoints.toFixed(2) + '</span></div>' +
      '<div class="ds">轮回点 = 1 + floor(发展分 × ' + (T.LINEAR_K) + ' × 破壳系数)，' +
      '发展分 = 2×峰值 + 建筑纪元分 + 工坊解锁项（' + br.workshopCount + ' 项）。' +
      '养人口、破壳、开工坊三条线都给点。</div></div></div>';
    /* 照猫国：族民默认闲置，＋ 雇 / − 退。没有闲置时 ＋ 禁用，
     * 职业总和永远 ≤ pop——不搞「减 A 立刻补给 B」的转移制。 */
    var idle = SB.folk.idle(s);
    h += '<div class="row folk-idle"><div><div class="nm">闲置 <b>' + idle + '</b></div>' +
      '<div class="ds">没活干的族民。点职业行的 ＋ 雇佣，− 退回闲置。</div></div></div>';
    /* ⚠️ 未解锁的职业**整行不渲染**（用户 2026-09-26：「一开始不要把这些职业显示出来，
     *   解锁一个显示一个」）。判据只有一处：`SB.folk.jobUnlocked`，它反查 techs.js 的
     *   eff.unlockJob。开局族民页上有「采集者」与「珊瑚匠」两张脸
     *   （gather 无解锁条件；珊瑚匠随免费的「凿珊瑚」开局掌握，理由见 techs.js 那条注），
     *   采石/采矿/匠作/学者各点亮一项、就多出一行。
     * 【为什么职业不需要建筑那套 `s.seen` 单向表】建筑解锁挂在科技/资源门槛上，
     *   职业挂在 s.techs 上，而科技一旦掌握**永不回退**
     *   ⇒ 露头天然只进不退，不需要额外的记忆位。
     * 【为什么带 `s.jobs[j.id] > 0`】防御老档：若某人卡在未解锁职业上（早期版本的档），
     *   行必须留下来，否则那个人从界面上凭空消失、玩家只能在闲置池里看到总数对不上。 */
    for (var i = 0; i < SB.JOBS.length; i++) {
      var j = SB.JOBS[i];
      /* ⚠️ `|| 0` 不是可省的小节：它是**根因侧的第二道闸**。2026-09-28 加商人时，
       *    state.js 的 jobs 字面量漏了 merchant ⇒ 这里是 `undefined <= 0` ⇒ **false** ⇒
       *    守卫以为「这行有人」⇒ 未解锁的商人被整行渲染出来，玩家看得见、点 ＋ 却雇不到。
       *    economy 那侧当时都写了 `(s.jobs.x || 0)` 才没出 NaN，说明数据层的覆盖纪律
       *    已经反复漏过；UI 不该把「存档一定给全了键」当前提。补这个 `|| 0` 是
       *    让下一份漏键至少不会长成「看得见但按不动」的哑控件。 */
      if ((s.jobs[j.id] || 0) <= 0 && !SB.folk.jobUnlocked(s, j.id)) continue;
      /* ⚠️ 名字必须走 `SB.folk.jobName(s, id)` 而不是 `j.name`：采集者在掌握「种植」之后
       * 要改称「农民」（用户 2026-09-26 拍板：是同一个人换了身份，不是多一个职业）。
       * 改称机制写在 folk.js（FARM_JOB / FARM_TECH / FARM_NAME），但这里原先直接印
       * 数据表的 `j.name`，于是那套机制**只在科技页生效、族民页从不生效**——
       * 科技页说「…农民」，族民页同一行照旧写着「采集者」，两边打架且都不报错。
       * （与「科技面板从不渲染 note」同族：机制写好了、UI 不读它。） */
      h += '<div class="row folk-job-row" data-job-row="' + j.id + '"><div><div class="nm">' + SB.folk.jobName(s, j.id) +
        ' <b id="j-' + j.id + '">' + s.jobs[j.id] + '</b></div>' +
        '<div class="ds">' + j.desc + '</div></div>' +
        '<div class="folk-job-controls">' +
        '<button class="btn" data-job="' + j.id + '" data-d="-1"' + (s.jobs[j.id] <= 0 ? ' disabled' : '') + '>−</button>' +
        '<button class="btn" data-job="' + j.id + '" data-d="1"' + (idle <= 0 ? ' disabled' : '') + '>＋</button></div></div>';
    }
    /* ⚠️ 硬上限之后开局的**第一步是珊瑚不是藻食**（2026-09-26）：那 1 名族民顶着
     * 人口上限 1，先把藻食堆到 20 以上也生不出人——必须先有礁口巢才有空位。
     * 旧文案只教「攒藻食建菌圃」，玩家照做会发现人口纹丝不动。 */
    h += '<div class="note">开局 1 名族民顶着人口上限：先在「' + SB.habitat.habitatName(SB.game.run()) + '」页点「采珊瑚」攒 5 建礁口巢' +
      '（上限 1 → 3），再让藻食超过 ' + CFG.GROW_KEEP + '，才生得下第二人。</div>';
    return h;
  }

  function eraOf(n) {
    var E = SB.ERAS || [];
    for (var i = 0; i < E.length; i++) if (E[i].id === n) return E[i];
    return { id: n, name: n + ' 纪元', motto: '', color: '#6FE3D2', desc: '' };
  }
  /* ── 科技树本体（文明 6 式横卷）─────────────────────────────────────
   * 【为什么不是「第 N 层」小标题的竖排列表】用户 2026-09-26 明确纠正过两次：
   *   竖排列表里层一和层二读起来是**上下并列**，玩家看不出先后；文明 6 是把节点
   *   摆成 (列, 行) 的横卷，列 = 推进方向，跨列画连线，图比视口宽、横向滚动看后面。
   *   上一轮做成带「第 N 层」标题的分桶列表，被驳回 —— 它仍然是个列表。
   *
   * 【几何来自 tech.layout()，这里一行算术都不自己算】列号在 techs.js 里声明，
   *   行号是排版的产物。渲染只读 `data-x/data-y`，不重算 —— 重算就等于有两份真相，
   *   改了数据那边、这边还按旧公式摆，树会自己长歪。
   *
   * ⚠️ 未揭示的节点不上图（isRevealed 是尤里卡条件的可见性）⇒ 连线只在**两端都可见**
   *   时才画。否则会画出一条指向空气、而空气过一会儿又变成别的节点的线。
   * ⚠️ 节点宽度/高度走内联 style 而不是写死在 CSS 里：尺寸是几何的一部分，
   *   它和 PITCH 必须一起改，分开写在两个文件里迟早对不上。 */
  function techTree(s) {
    if (!SB.tech || !SB.tech.layout) return '<div class="note">科技树几何尚未加载。</div>';
    var L = SB.tech.layout(), G = L.geo, CP = SB.tech.pitch.col;
    var era = s.era || 1, T = SB.TECHS || [], i, b;

    var h = '<div class="techscroll tree-tech" id="techScroll"><div class="techcanvas"' +
      ' style="width:' + L.w + 'px;height:' + L.h + 'px">';

    /* ── 纪元轨道（横幅，钉在树顶当刻度）── */
    for (b = 0; b < L.blocks.length; b++) {
      var blk = L.blocks[b], er = eraOf(blk.era);
      var bx = G.PADX + blk.offset, bw = blk.cols * CP - G.COL;
      h += '<div class="tnband' + (blk.era === era ? ' on' : '') +
        '" style="left:' + bx + 'px;width:' + bw + 'px;color:' +
        (blk.era < era ? '#5b6b80' : er.color) + '">' +
        '<span class="tng">' + (er.glyph || '') + '</span>' + er.name +
        '<span class="tnc">' + blk.cols + ' 列</span></div>';
    }

    /* ── 连线：一层 SVG 压在节点底下 ── */
    h += '<svg class="techlines" width="' + L.w + '" height="' + L.h + '">' ;
    for (i = 0; i < L.edges.length; i++) {
      var e = L.edges[i], a = e.from, c = e.to;
      var ta = byIdOf(T, a), tc = byIdOf(T, c);
      if (!ta || !tc) continue;
      var va = visOf(s, ta, era), vb = visOf(s, tc, era);
      if (!va || !vb) continue;
      var cls = 'tel' + (s.techs[a] && s.techs[c] ? ' done' :
        (s.techs[a] ? ' open' : ''));
      h += '<path class="' + cls + '" d="' + e.d + '"></path>';
    }
    h += '</svg>';

    /* ── 节点 ── */
    for (i = 0; i < T.length; i++) {
      var t = T[i], cell = L.cells[t.id];
      if (!cell) continue;
      if (!visOf(s, t, era)) continue;              // 未揭示的不上图
      h += techNode(s, t, cell, G.W, G.H, G);
    }

    h += '</div></div>';
    return h;
  }

  function byIdOf(T, id) {
    for (var i = 0; i < T.length; i++) if (T[i].id === id) return T[i];
    return null;
  }
  /* 可见性 = 「这个节点在图上有位置」。判据只有一条：**当前纪元与更早的纪元全部上图**，
   * 未来纪元不上图（那纪元的悬念留到抵达时）。
   *
   * ⚠️ 2026-09-26 改：原判据里还有一条 `SB.tech.isRevealed`，于是「可见」与「亮出内容」
   *    被绑成同一件事 —— 进新纪元时 revealEra 把整批节点刷成已揭示，玩家看到的就是
   *    「尤里卡写着 0/60、科技名称与效果却已经摊在面前」（用户截图里报的那个问题）。
   *    现在两者分开：
   *      可见（本函数）⇒ 卡片出现在图上，未达成时是「未揭露的科技」占位 + 条件进度
   *      亮出（techNode 的 lit）⇒ 才显示科技名称与效果
   *    分开之后，「进新纪元是一整页空白」与「整批泄露内容」两个坏法同时消失了。 */
  function visOf(s, t, era) {
    return t.era <= era;
  }

  /* 科技卡片两态（用户 2026-09-26 截图指出：未达成尤里卡却已亮出科技内容/按钮，不对）。
   *   lit（metOf 为真 = 已掌握 / 达成过尤里卡至少一次）
   *     ⇒ 亮出科技名称与效果，**不再显示尤里卡进度**（用户原话：达到过就直接显示内容）。
   *   !lit（尤里卡没达成过）
   *     ⇒ 标题写「未揭露的科技」，效果行藏掉，只保留条件 + 进度条（用户选「保留条件+进度条」），
   *        研究按钮因 studyBlocked 返回「尤里卡未达成」而灰掉。
   * 两态的判据统一走 SB.tech.metOf —— 那本是 canStudy 的第四条门禁，渲染复用它，
   * 避免「亮没亮」与「能不能研究」各算各的而错位。 */
  function techNode(s, t, cell, w, hh, G) {
    var done = !!s.techs[t.id];
    var lit = SB.tech.metOf(s, t);          // 已掌握 / 达成过尤里卡 = 亮出内容
    var eureka = !lit ? SB.tech.condShort(s, t.cond) : null;
    var why = done ? null : SB.tech.studyBlocked(s, t.id);
    var fut = t.era > (s.era || 1);
    var status = done ? '已掌握' : !lit ? '未揭示' : why ? '暂不可研究' : '可研究';
    var eurekaPct = eureka && eureka.need > 0
      ? Math.max(0, Math.min(100, eureka.now / eureka.need * 100)) : 0;
    var cls = 'technode st' + (done ? ' done' : why ? ' lock' : ' open') + (fut ? ' fut' : '') + ' tree-node';
    var h = '<button type="button" class="' + cls + '" id="techrow-' + t.id + '"' +
      ' data-node="' + t.id + '" data-x="' + cell.x + '" data-y="' + cell.y + '"' +
      ' data-layer="' + cell.layer + '"' +
      ' data-lit="' + (lit ? 1 : 0) + '"' +
      ' data-tree-node="1" data-tree-type="tech" data-tree-id="' + t.id + '"' +
      ' aria-label="' + (lit ? t.name : '未揭露的科技') + '，' + status + '，打开详情"' +
      ' style="left:' + cell.x + 'px;top:' + cell.y + 'px;width:' + w + 'px;height:' + hh + 'px">';
    h += '<span class="tnhd"><span class="tnm">' + (lit ? t.name : '未揭露的科技') + '</span>' +
      (t.key ? '<span class="tntag">关键</span>' : '') + '</span>' +
      (!lit ? '<span class="tree-eureka">尤里卡 · ' + (eureka ? eureka.txt : '达成条件后揭示') + '</span>' +
        (eureka && eureka.need > 0 ? '<span class="tree-eureka-meter"><span class="tree-eureka-track"><i style="width:' + eurekaPct.toFixed(1) + '%"></i></span><b>' + eurekaPct.toFixed(0) + '%</b></span>' : '') : '') +
      '<span class="tree-node-foot"><i class="tree-state-dot"></i>' + status +
      '<span class="tree-open-hint">查看详情　›</span></span></button>';
    return h;
  }

  /* 科技面板未开门时的空态。
   * 【为什么要有这一屏而不是什么都不画】关闭条件是「建成 5 座深海藻场」，
   * tab 被 gate 掉之后玩家不会从 tab 进来到这里；但如果他记得 tab 位置，或
   * 存档从别的路径带进来，空面板 + 一句「为什么是空的」比空白强得多。
   * 门是派生的，所以这一屏的门槛数字也从 cond 读，不写死成 5。 */
  function paneTechLocked() {
    var w = SB.tech && SB.tech.byId ? SB.tech.byId('writing') : null;
    var need = (w && w.cond && w.cond.n) || 5;
    return '<div class="row"><div><div class="nm">科技 · 未翻开</div>' +
      '<div class="ds">族里还分不出「今天」和「明天」——没有值得记下来的事，' +
      '也就没有「明天」。建成 ' + need + ' 座深海藻场之后，这页才会打开。</div></div></div>' +
      '<div class="note">在「' + SB.habitat.habitatName(SB.game.run()) + '」页铺藻场就行，它的产出就是「今天」；第 ' + need + ' 座落成时' +
      '你会知道的。</div>';
  }

  /* ── 纪元导航（2026-09-26 用户第三次重构科技页）────────────────────
   * 原状是「当前纪元横幅 + 五张竖排纪元卡片 + 长卷」三块。五张卡各约 130px，
   * 手机上要滑过一整屏才够到树，而每张卡里真正的新信息只有一句描述。用户的话：
   *   「这部分文本内容能不能放在科技树标题这里，然后在这里设计几个按钮，
   *     点一下就自动跳转到该纪元的科技树」。
   * 于是长卷标题区只剩两块：
   *   · 一排纪元按钮 —— 名称 + 该纪元进度。点它选中该纪元；已抵达的还会把长卷
   *     横向滚到那一纪元的左边界（纪元按钮就是这张图的目录）。
   *   · **只出选中那一个**纪元的详情卡（名/箴言/描述）。选中的恰好是当前纪元时，
   *     再把关键节点钥匙、进度条、现有科技与下一纪元一并摊开 —— 那是原横幅的内容，
   *     挪进来而不是删掉：它是「我现在该干什么」的部分，每趟进这页都得看见。
   * ⚠️ e2e 盯着「详情卡只有一张」：五张全展开正是这次要消灭的东西，而它长得跟正确
   *    版本**一模一样**（都是 .eracard），只能靠条数钉住。
   * ⚠️ 未来纪元的按钮**不置灰**：它点下去不改长卷位置（那一纪元的节点还没现身，
   *    滚过去只有空白和一条位置横幅 —— 那正是「点了没反应」的观感），但描述是有
   *    信息量的预告，读得到。详情卡会自己说清「尚未抵达」，不用按钮的灰态暗示。 */
  function eraStats(s, e) {
    var T = SB.TECHS || [], list = [], learned = 0, i;
    for (i = 0; i < T.length; i++) if (T[i].era === e) list.push(T[i]);
    for (i = 0; i < list.length; i++) if (s.techs[list[i].id]) learned++;
    return { total: list.length, learned: learned };
  }
  /* 纪元三条状态。已过去的用冷灰 —— 它的名字不该和正在做的那个一样亮。 */
  function eraState(era, sel) {
    return sel < era ? '已过去' : sel === era ? '进行中' : '未抵达';
  }
  function eraColor(era, sel) {
    return sel < era ? '#5b6b80' : eraOf(sel).color;
  }

  function eraNav(s, era, sel) {
    var E = SB.ERAS || [], h = '<div class="eranav" id="eraNav">', e;
    for (e = 1; e <= E.length; e++) {
      var er = eraOf(e), st = eraStats(s, e), col = eraColor(era, e);
      var label = eraState(era, e);
      h += '<button type="button" class="erabtn' + (e === sel ? ' on' : '') +
        (e === era ? ' cur' : '') + '" data-era="' + e + '"' +
        ' title="' + er.name + '「' + er.motto + '」· ' + label + ' ' +
        st.learned + '/' + st.total + (e <= era ? '　点它跳到这一纪元' : '　尚未抵达') + '">' +
        '<span class="g" style="color:' + col + '">' + (er.glyph || '') + '</span>' +
        '<span class="n" style="color:' + col + '">' + er.name + '</span>' +
        '<span class="c">' + st.learned + '/' + st.total + '</span></button>';
    }
    /* 怎么读这张图 —— 原来挂在纪元一那张卡片里（只在当前纪元可见），
     * 现在它是长卷的图注，谁看这张图都该看到，所以不再挂条件。 */
    h += '</div><div class="note">这张长卷按列推进：同一个纪元的每一项占一列，' +
      '列号越往右越深，前置到本项之间画连线。图比这一屏宽，按住拖动（鼠标）或横向滑动（手指）' +
      '看后面的纪元，也可以点上面的纪元按钮直接跳过去。</div>';
    return h;
  }

  function eraDetail(s, era, sel, prog, sci) {
    var er = eraOf(sel), st = eraStats(s, sel), col = eraColor(era, sel);
    var label = eraState(era, sel);
    var h = '<div class="eracard' + (sel === era ? ' active' : '') + '" id="eraDetail"' +
      ' style="border-left-color:' + col + '">' +
      '<div class="erahd"><span class="glyph" style="color:' + col + '">' + (er.glyph || '') + '</span>' +
      '<span class="enm" style="color:' + col + '">' + er.name + '</span>' +
      '<span class="emotto">' + er.motto + '</span>' +
      '<span class="estate" style="background:' + (sel === era ? '#123a52' : '#153048') +
      ';color:' + col + '">' + label + ' · ' + st.learned + '/' + st.total + '</span></div>' +
      '<div class="edesc">' + er.desc + '</div>';

    if (sel === era) {
      /* 当前纪元：把「还差什么」摊开。这一段是原「当前纪元横幅」的内容，
       * 逐句搬过来 —— 删掉它这页就只剩一张地图，玩家不知道该往哪使力。 */
      var keys = SB.tech.keysOf(era), kl = '', i;
      for (i = 0; i < keys.length; i++) {
        var k = keys[i];
        kl += '<span class="' + (s.techs[k.id] ? 'done' : '') + '">' +
          (s.techs[k.id] ? '✓ ' : '○ ') + k.name + '</span>';
      }
      h += '<div class="keysline">' + kl + '</div>';
      h += '<div class="minibar" style="margin-top:7px"><i style="width:' +
        (prog.keysTotal ? (prog.keysDone / prog.keysTotal * 100).toFixed(0) : 0) + '%"></i></div>';
      h += '<div class="edesc">本纪元关键节点 ' + prog.keysDone + ' / ' + prog.keysTotal +
        '。全部掌握即进入下一纪元——越纪元研究是不可能的，这是硬闸门。</div>';
      var next = era < (SB.ERAS || []).length ? eraOf(era + 1) : null;
      h += '<div class="teaser">现有科技 <b>' + Math.floor(s.res.science) + '</b>（+' +
        sci.toFixed(2) + '/ 秒）' + (next ? '　下一纪元：<b>' + next.name + '</b>「' +
        next.motto + '」' + next.desc : '　这是终局纪元。') + '</div>';
    } else if (sel < era) {
      h += '<div class="edesc">这个纪元已经过去：它的节点全部摊在长卷左边那一段里，' +
        '随时可以回头补完（补不再卡纪元闸门）。</div>';
    } else {
      /* ⚠️ 说清「长卷上目前只有它那条位置横幅」，否则玩家点完按钮看见一片空白
       *    会以为是坏了（纪元横幅是画给所有纪元的，节点才要等抵达）。 */
      h += '<div class="edesc">尚未抵达——把 ' + eraOf(era).name + ' 的关键节点全部掌握，' +
        '闸门才会打开，这一纪元的尤里卡条件到那时才现身。长卷上目前只有它一条位置横幅，' +
        '所以点它不会滚过去。</div>';
    }
    h += '</div>';
    return h;
  }

  function paneTech() {
    var s = res();
    /* 门与 tab 的灰读同一份派生值（SB.tech.panelOpen），不在这里另算一次。 */
    if (SB.tech && SB.tech.panelOpen && !SB.tech.panelOpen(s)) return paneTechLocked();
    var era = s.era || 1, E = SB.ERAS || [];
    var prog = SB.tech.eraProgress(s);
    var sci = SB.economy.rates(s).science || 0;
    /* 归一化后写回模块状态：按钮、详情卡、techGoEra 三处读的必须是同一个值。
     * （techViewEra 存 0 = 跟随当前纪元，这里把它翻译成具体的 era。） */
    var sel = (techViewEra >= 1 && techViewEra <= E.length) ? techViewEra : era;
    techViewEra = sel;

    var h = eraNav(s, era, sel);
    h += eraDetail(s, era, sel, prog, sci);
    h += techTree(s);
    h += '<div class="note">尤里卡只「揭示」节点本身，不折算研究进度（设计已定）。' +
      '研究是即时扣费：科技够了点一下就掌握，没有队列。</div>';
    return h;
  }

  /* 破壳面板：让玩家看清「系数从哪来」和「祭坛为什么停」。
   * 这两件事一旦变成黑箱，玩家不知道自己该做什么，机制就白设了。 */
  /* ── 市政页（2026-09-27 兑现「议事厅开启市政树」那条欠账）────────────
   * 三块由上到下：**政体 → 政策卡槽 → 市政树**。这个顺序就是玩家的决策顺序——
   *   先看自己处在哪个政体（决定有几个槽），再选装哪张卡（槽之间的取舍），
   *   最后才是「为了拿某个卡，要不要先点出某条市政」。
   * ⚠️ 它**不是科技页的复制**：科技是「解锁什么」，市政是「你是谁、按哪套规矩办事」，
   *    所以政体与卡占了上面两整块，树只占下面一块。
   * ⚠️ 面板未开门时整页不渲染（与 paneTechLocked 同一手法），页面签上才不会
   *    出现「一个空壳页」。 */
  var civicView = 'government';
  var govExpanded = {};
  function setCivicView(view) {
    if (view !== 'government' && view !== 'tree') return false;
    civicView = view;
    return true;
  }
  function toggleGovDetail(id) {
    if (!id) return false;
    govExpanded[id] = !govExpanded[id];
    return true;
  }
  function paneCivic() {
    var s = res();
    if (!SB.civic || !SB.civic.panelOpen(s)) return paneCivicLocked();
    var h = '<div class="panel-subtabs civic-subtabs" role="group" aria-label="市政分区">' +
      '<button type="button" class="subtab' + (civicView === 'government' ? ' on' : '') +
      '" data-civic-view="government" aria-pressed="' + (civicView === 'government') + '">政体</button>' +
      '<button type="button" class="subtab' + (civicView === 'tree' ? ' on' : '') +
      '" data-civic-view="tree" aria-pressed="' + (civicView === 'tree') + '">市政树</button></div>';
    return h + (civicView === 'tree'
      ? '<div class="subtab-panel civic-tree-panel">' + civicTree(s) + '</div>'
      : '<div class="subtab-panel civic-government-panel">' + paneCivicGov(s) + paneCivicSlot(s) + '</div>');
  }

  function paneCivicLocked() {
    var why = SB.civic ? SB.civic.panelBlock(res()) : '市政系统尚未解锁。';
    return '<div class="secttl">市政</div>' +
      '<div class="row"><div class="nm">市政页未开启</div>' +
      '<div class="ds">' + (why || '') + '</div></div>' +
      '<div class="note">议事厅由「石工」解锁，它同时是书手这个职业的来源——' +
      '建起来之后这里会给出：政体、政策卡槽，以及三条市政。</div>';
  }

  /* 政体（Civ6 式）：政体是「一份被动 + 一份槽位配方」，不是一条标签。
   * ⚠️ 三条信息必须同框才叫政体：被动（这政体自己给了什么）、槽位配方（我能摆几张什么卡）、
   *    及第 0 号槽空不空。Civ6 的政体选择之所以有分量，全在这三样拼在一起。 */
  function paneCivicGov(s) {
    var C = SB.civic;
    /* ⚠️ 2026-10-05 用户「政体不解锁就不要露出来」：与资源 unlock 描述符、
     *   建筑移除 unlockRatio 同一条纪律——未解锁的政体**整张卡都不渲染**，
     *   只渲染 govOwned 成立的。避免开局就摆一排灰着的独裁/寡头/神权提前剧透。
     *   govOwned 读对应市政 s.civics[c.id]，与 setGov 同一判据（civics.js）。 */
    var owned = [];
    for (var i = 0; i < SB.GOVS.length; i++) if (C.govOwned(s, SB.GOVS[i].id)) owned.push(SB.GOVS[i]);
    var h = '<div class="secttl">政体</div>';
    if (!owned.length) {
      /* 一个都没解锁：政体系统整体还没开，给一句指引而不是一堆灰卡。
       * ⚠️ 硬编码《法典》是因为它是当前唯一解锁 tribe 的市政
       *   （e2e:2320「研究《法典》⇒ 自带酋邦制」），与 govOwned 的反查同源。 */
      h += '<div class="row"><div class="ds">政体系统尚未开启——研究《法典》开启酋邦制。</div></div>';
      return h;
    }
    var current = null, options = '';
    for (var j = 0; j < owned.length; j++) {
      var v = owned[j], on = s.gov === v.id;
      var why = on ? null : C.govBlocked(s, v.id);
      if (on) {
        current = '<div class="gov-current" id="govrow-' + v.id + '">' +
          '<div class="gov-current-label">当前政体 <span class="tag ok">生效中</span></div>' +
          '<div class="gov-current-main"><strong>' + v.name + '</strong><span>' + v.desc + '</span></div>' +
          '<div class="gov-current-meta"><span class="govslots">' + recipeText(v) + '</span>' +
          /* 幸福度偏移只在采用中成立，不在未采用的预览卡上暗示为常驻效果。 */
          happyBonusNote(s, 'gov') + '</div></div>';
        continue;
      }
      var expanded = !!govExpanded[v.id];
      options += '<div class="gov-choice' + (expanded ? ' expanded' : '') + '" id="govrow-' + v.id + '">' +
        '<div class="gov-choice-main"><button type="button" class="inline-info-link gov-choice-name"' +
        ' data-gov-detail="' + v.id + '" aria-expanded="' + expanded + '" aria-controls="govdetail-' + v.id + '">' +
        v.name + '<span class="gov-choice-chevron" aria-hidden="true">⌄</span></button>' +
        '<div class="gov-choice-preview">' + v.desc + '</div>' +
        '<div class="gov-choice-slots">' + recipeText(v) + '</div></div>' +
        '<button class="btn buy gov-adopt" data-gov="' + v.id + '"' + (why ? ' disabled' : '') +
        ' title="' + (why || '采用此政体') + '">采用</button>' +
        (expanded ? '<div class="gov-choice-detail" id="govdetail-' + v.id + '"><b>完整效果</b><p>' + v.desc +
          '</p><span>政策卡槽：' + recipeText(v) + '</span>' + (why ? '<small>' + why + '</small>' : '') + '</div>' : '') +
        '</div>';
    }
    h += current || '';
    if (options) h += '<div class="gov-options-heading"><b>可选政体</b><span>' + (owned.length - (current ? 1 : 0)) + ' 项</span></div>' +
      '<div class="gov-choice-grid">' + options + '</div>';
    /* 换政体收费要写在明面上，否则玩家以为按钮只是灰着。只在已采用过政体后提示。 */
    if (s.gov && C.topCost(s) > 0) {
      h += '<div class="note">换政体需 ' + C.govCost(s) + ' 市政点（两倍最高已完成市政）；' +
        '首次采用免费。</div>';
    }
    return h;
  }
  /* 槽位配方的中文说明，如「1 万能槽」「1 工造槽 + 1 万能槽」。
   * ⚠️ 从 slots 配方**现算**，不另存一句写死的文案 —— 改配方时文案跟不上的 bug
   *    是那种「玩家看到描述与实际槽位对不上」的静默错。 */
  function recipeText(g) {
    var n = 0, k, out = [];
    for (k in (g.slots || {})) {
      if (!(g.slots[k] > 0)) continue;
      out.push(g.slots[k] + ' ' + SB.civic.slotTypeName(k));
      n += g.slots[k];
    }
    if (!n) return '不提供政策卡槽';
    return out.join(' ＋ ');
  }

  /* 政策卡槽（Civ6 式）：一个个**带类型的格子**，空格子也画出来 ——
   * 玩家得看见「还有个工造槽空着」，才会想到去解锁那张工造卡。 */
  function paneCivicSlot(s) {
    var C = SB.civic, list = C.slotList(s), i;
    var h = '<div class="secttl">政策卡槽 <span class="tag">' + list.length + '</span></div>';
    if (!list.length) {
      h += '<div class="row"><div class="ds">当前政体不提供政策卡槽——换个政体才能装卡。</div></div>';
      return h + pool(s);
    }
    h += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
    for (i = 0; i < list.length; i++) {
      var st = list[i].type, filled = (s.cards && s.cards[i]) ? C.policyById(s.cards[i]) : null;
      /* 逐槽：第 i 槽装的是 s.cards[i]。2026-10-07 用户拍板：不给「拔下」按钮——
       * 装填一张新卡就直接覆盖本槽（setCard 先挑对口的空槽、全满则覆盖对口已装槽）。 */
      h += '<div class="slotbox" id="slotrow-' + i + '">' +
        '<div class="slottt">' + C.slotTypeName(st) + ' <span class="tg">#' + (i + 1) + '</span></div>' +
        (filled && C.cardFits(filled, st)
          ? '<div class="slotcard">' + filled.name + '</div>' +
            '<div class="slotsub">' + (filled.effectText ? C.effectText(filled.effect) : filled.desc) +
            '</div>'
          : filled && !C.cardFits(filled, st)
            ? '<div class="slotcard bad">' + filled.name + '</div>' +
              '<div class="slotsub bad">与这个槽不对口，装填新卡可覆盖</div>'
            : '<div class="slotcard empty">空置</div>' +
              '<div class="slotsub">点击装填</div>') +
        '</div>';
    }
    h += '</div>';
    h += '<div class="note">人生第一次装填免费；之后每一次装填／更换都收 ' +
      C.cardCost(s) + ' 市政点。</div>';
    return h + pool(s);
  }

  /* 政策卡库：**只显示已解锁的卡**（完成对应市政才出现），未解锁的不再列出。
   * 用户 2026-09-30：没解锁就不要显示。
   * ⚠️ 代价：玩家失去「我还差哪条市政能拿到下一张卡」的预览——这正是要的克制。
   *   卡是否解锁仍由 cardOwned（= 对应市政已完成）判定，与装填、政体、槽类型都无关。 */
  function pool(s) {
    var C = SB.civic, h = '';
    var own = [], i, p;
    for (i = 0; i < SB.POLICIES.length; i++) {
      p = SB.POLICIES[i];
      if (C.cardOwned(s, p.id)) own.push(p);
    }
    h += '<div class="secttl">政策卡库 <span class="tag">' + own.length + '</span></div>';
    if (own.length === 0) {
      h += '<div class="row"><div class="ds">尚未解锁任何政策卡——完成市政树上的条目即可解锁对应卡片。</div></div>';
      return h;
    }
    for (var j = 0; j < own.length; j++) {
      var q = own[j], why = C.cardBlocked(s, q.id), on = (s.cards && s.cards.indexOf(q.id) >= 0);
      var fits = C.cardFits(q, C.currentSlotType(s));
      h += '<div class="row"><div><div class="nm">' +
        '<span class="tag t' + q.type + '">' + C.slotTypeName(q.type) + '</span> ' + q.name +
        (on ? ' <span class="tag ok">已装填</span>' : '') +
        /* ⚠️ 2026-10-05 用户「都补上」：cardHappyOffset 读 s.cards（只算**装在槽里**的），
         *   所以只在 on 时挂。库里的卡片摆着这个提示会骗人 —— 装填了才生效。 */
        (on ? happyBonusNote(s, 'card') : '') + '</div>' +
        '<div class="ds">' + q.desc +
        (on ? '' : fits ? '' : '<br>⚠ 与第 0 号槽不对口：需要 ' + C.slotTypeName(q.type) + '类槽') +
        '</div></div>' +
        '<button class="btn' + (on || why ? '' : ' buy') + '" data-card="' + q.id + '"' +
        (on || why ? ' disabled' : '') + ' title="' + (why || (on ? '已装填' : '')) + '">' +
        (on ? '在槽' : why ? '装不了' : '装填') + '</button></div>';
    }
    return h;
  }

  /* 市政树 —— **与科技树同一张横卷**（用户 2026-09-27：「市政树要做成科技树这样」）。
   * 几何来自 SB.civic.layout()，CSS 直接复用 .techscroll / .technode / .tel，
   * 于是两张树在玩家眼里是同一种东西，排布规则也一致（列 = layer，行 = 排版产物）。
   *
   * ⚠️ 三处刻意与科技树不同：
   *   ① 容器 id 是 **civicScroll**，不是 techScroll —— render.js 的 scrollLeft 留存
   *      与 input.js 的拖动都按 id 取容器，共用 id 会两边抢一个元素。
   *   ② CSS 类名共用，但**滚动位置不共用**（市政现在只有一个纪元、没有纪元跳转按钮，
   *      不需要 persist/restore 那一套）。
   *   ③ 节点是三态（已完成 / 已揭示 / 未揭露），比科技的「亮 / 不亮」多一档：
   *      未揭露时**藏名字与 desc**，与科技一致；差别在于市政的「鼓舞」是揭示的前置，
   *      所以未揭露态要连鼓舞条件与进度一起摆出来，玩家的下一步动作才是明确的。 */
  function civicTree(s) {
    if (!SB.civic || !SB.civic.layout) return '<div class="note">市政树几何尚未加载。</div>';
    var L = SB.civic.layout(), G = L.geo;
    var h = '<div class="techscroll tree-civic" id="civicScroll"><div class="techcanvas"' +
      ' style="width:' + L.w + 'px;height:' + L.h + 'px">';

    /* 纪元轨道（只有一条时不画：单纪元的横幅是纯噪音）。 */
    if (L.blocks.length > 1) {
      for (var b = 0; b < L.blocks.length; b++) {
        var blk = L.blocks[b], er = eraOf(blk.era);
        h += '<div class="tnband" style="left:' + (G.PADX + blk.offset) + 'px;width:' +
          (blk.cols * L.pitch - G.W) + 'px">' +
          '<span class="tng">' + (er.glyph || '') + '</span>' + er.name +
          '<span class="tnc">' + blk.cols + ' 列</span></div>';
      }
    }

    /* 连线先画，压在节点底下。 */
    h += '<svg class="techlines" width="' + L.w + '" height="' + L.h + '">';
    for (var i = 0; i < L.edges.length; i++) {
      var e = L.edges[i];
      var doneEdge = s.civics[e.from] && s.civics[e.to];
      h += '<path class="tel' + (doneEdge ? ' done' : s.civics[e.from] ? ' open' : '') +
        '" d="' + e.d + '"></path>';
    }
    h += '</svg>';

    var C = SB.CIVICS;
    for (i = 0; i < C.length; i++) {
      var cell = L.cells[C[i].id];
      if (cell) h += civicNode(s, C[i], cell, G.W, G.H);
    }
    h += '</div></div>';

    var rate = SB.economy.cultureRate(s);
    /* ⚠️ 2026-10-06 城堡「真升级」：注脚里这座建筑在买下 `upg_castle` 之后**改叫城堡**，
     *   等级是同一个 `coreLvl`（= lvl.hall）。切名判据与建筑行那处同源（同一个 upgrades 键），
     *   否则这里会显示「＋ 议事厅 8 级」而上面那行写着「城堡 8」——同一局两种名字。 */
    var _coreName = (s.upgrades && s.upgrades.upg_castle) ? '城堡' : '议事厅';
    h += '<div class="note">市政点 ' + SB.economy.fmtAmt(s.res.culture) +
      '（+' + rate.toFixed(2) + '/秒 ＝ 书手 ' + (s.jobs.scribe || 0) + ' × ' + SB.UNIT.culture +
      ' ＋ ' + _coreName + ' ' + SB.economy.coreLvl(s) + ' 级 × ' + SB.CFG.CIVIC.HALL_RATE + '）。' +
      '鼓舞只揭示这条路，不替你付市政点。</div>';
    return h;
  }

  /* 市政卡片三态，走与 techNode 同一套 class：
   *   done（已投入市政点）⇒ 标题挂绿标「已完成」，不再渲染按钮（诚实，不留假按钮）
   *   revealed（鼓舞达成过）⇒ 亮出名字与 desc，挂「N 市政点」，给研究按钮
   *   !revealed（未揭露）    ⇒ 标题写「未揭露的市政」，藏 desc，只留鼓舞条件 + 进度条
   * 三态的判据分别走 SB.civic 的三个函数（已完成 / isRevealed / blocked），
   * 不在这里另算一遍 —— 与「亮没亮」和「能不能研究」各算各的而错位是同一类错。 */
  function civicNode(s, c, cell, w, hh) {
    var C = SB.civic, done = !!s.civics[c.id], rev = C.isRevealed(s, c.id);
    var why = done ? null : C.blocked(s, c);
    var boost = !rev ? SB.tech.condShort(s, c.boost) : null;
    var boostPct = boost && boost.need > 0
      ? Math.max(0, Math.min(100, boost.now / boost.need * 100)) : 0;
    var status = done ? '已完成' : !rev ? '未揭示' : why ? '暂不可研究' : '可研究';
    var cls = 'technode st' + (done ? ' done' : why ? ' lock' : ' open') + ' tree-node';
    var h = '<button type="button" class="' + cls + '" id="civicrow-' + c.id + '"' +
      ' data-node="' + c.id + '" data-x="' + cell.x + '" data-y="' + cell.y + '"' +
      ' data-layer="' + cell.layer + '"' +
      ' data-revealed="' + (rev ? 1 : 0) + '"' +
      ' data-tree-node="1" data-tree-type="civic" data-tree-id="' + c.id + '"' +
      ' aria-label="' + (rev ? c.name : '未揭露的市政') + '，' + status + '，打开详情"' +
      ' style="left:' + cell.x + 'px;top:' + cell.y + 'px;width:' + w +
      'px;height:' + hh + 'px">';
    h += '<span class="tnhd"><span class="tnm">' + (rev ? c.name : '未揭露的市政') + '</span>' +
      '</span>' + (!rev ? '<span class="tree-eureka">鼓舞 · ' +
        (boost ? boost.txt : c.boost ? '达成鼓舞条件后揭示' : '无需鼓舞') + '</span>' +
        (boost && boost.need > 0 ? '<span class="tree-eureka-meter"><span class="tree-eureka-track"><i style="width:' + boostPct.toFixed(1) + '%"></i></span><b>' + boostPct.toFixed(0) + '%</b></span>' : '') : '') +
      '<span class="tree-node-foot"><i class="tree-state-dot"></i>' + status +
      '<span class="tree-open-hint">查看详情　›</span></span></button>';
    return h;
  }

  function paneMeta() {
    var m = meta();
    var lg = SB.prestige.legacy();
    var h = '<section class="meta-overview"><div class="meta-balance"><span>轮回点余额</span>' +
      '<strong>' + m.tide.toFixed(2) + '</strong><small>跨周目保留 · 用于永久强化</small></div>' +
      '<div class="meta-stats"><div><span>累计消费</span><b>' + m.spent.toFixed(2) + '</b></div>' +
      '<div><span>周目</span><b>' + m.cycle + '</b></div><div><span>破层</span><b>' + m.layers + '</b></div></div></section>';
    /* ⚠️ 2026-10-05 用户报「弹窗说会保留的东西，商店里很多都没显示」：
     *    结算弹窗承诺保留的旧日遗产四项，商店页此前一行都没渲染。数字全部走
     *    prestige.legacy() 同一个口（与实际加成同源），不在这里另写公式。 */
    h += '<section class="meta-legacy"><div class="meta-section-title"><b>跨周目遗产</b><span>每次轮回累积，持续强化新文明</span></div><div class="meta-legacy-grid">' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">✧</span><div><b>旧日信仰</b><strong>' + SB.economy.fmtAmt(m.oldFaith || 0) + '</strong></div>' +
      '<small>全产出 +' + (lg.oldFaithAllProductionBonus * 100).toFixed(1) + '%</small><p>剩余信仰并入；对数档位累积加成</p></article>' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">◇</span><div><b>纪念奇观</b><strong>' + lg.relicCount + ' 座</strong></div>' +
      '<small>科技与市政 +' + ((lg.relicCultureMul - 1) * 100).toFixed(0) + '%</small><p>首次建成的独特奇观收入藏</p></article>' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">▧</span><div><b>旧日艺术品</b><strong>' + (m.oldArtworkEarnedTotal || 0) + ' 件</strong></div>' +
      '<small>市政点 +' + lg.oldArtworkCultureRate.toFixed(2) + '/秒</small><p>累积收藏，提供持续市政点</p></article>' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">⌁</span><div><b>旧日潮纹碑石</b><strong>' + (m.oldTideStelesEarnedTotal || 0) + ' 件</strong></div>' +
      '<small>科技点 +' + lg.oldTideSteleScienceRate.toFixed(2) + '/秒</small><p>累积收藏，提供持续科技点</p></article></div></section>';
    var groups = [
      { key: 'start', title: '开局馈赠', hint: '为下一轮文明准备基础资源', kind: 'start' },
      { key: 'thin', title: '破壳门槛', hint: '永久削弱冰壳，缩短重复开荒', kind: 'thin' },
      { key: 'eff', title: '恒久增益', hint: '强化生产、研究与自动化', kind: 'eff' }
    ];
    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi], items = [];
      for (var pi = 0; pi < SB.PERKS.length; pi++) {
        var perk = SB.PERKS[pi];
        var bucket = perk.kind === 'start' ? 'start' : perk.kind === 'thin' ? 'thin' : 'eff';
        if (bucket === group.key) items.push(perk);
      }
      h += '<section class="meta-shop-group meta-shop-' + group.key + '"><div class="meta-section-title"><b>' + group.title +
        '</b><span>' + group.hint + '</span><i>' + items.length + ' 项</i></div><div class="meta-shop-grid">';
      for (var ii = 0; ii < items.length; ii++) {
        var p = items[ii], st = SB.prestige.perkState(p.id);
        h += '<article class="meta-perk-card' + (st.done ? ' is-done' : st.locked ? ' is-locked' : '') + '"><div class="meta-perk-copy"><div class="nm">' + p.name +
          ' <span class="tag">' + st.lv + '/' + (isFinite(st.max) ? st.max : '∞') + '</span>' +
          ' <span class="tag meta-kind-tag">' + (p.kind === 'start' ? '起始' : p.kind === 'thin' ? '门槛' : '效率') + '</span></div>' +
          '<div class="ds">' + p.desc + (st.locked ? '（需先解锁上一层）' : '') + '</div></div>' +
          '<button class="btn buy meta-buy" data-perk="' + p.id + '"' +
          (st.done || st.locked || !st.afford ? ' disabled' : '') + '>' +
          (st.done ? '已满级' : st.locked ? '尚未解锁' : st.next + ' 点') + '</button></article>';
      }
      h += '</div></section>';
    }
    h += '<div class="note meta-shop-note">轮回点跨周目保留。购买的强化永久生效；门槛减免能显著缩短后续周目的开荒时间。</div>';
    return h;
  }

  /* ── 工坊 ────────────────────────────────────────────────────────────────
   * 门槛 = 建成工坊（用户拍板）。这里只列**青铜工具**这一批内容：
   * 工坊本身原本的效果（珊瑚 → 骨材）已随骨材线一起作废，它是**空壳建筑**，
   * 空壳不该长期占着一个页签，所以给它装第一批看得见的内容就是这件事。
   * ⚠️ 三条纪律，改这个面板前先读 src/workshop.js 顶上那一段：
   *    · 工具是**买断**的，不是等级 —— 已经买过的行不画按钮；
   *    · 每件只服务它指定那条职业线 —— 文案要写成「珊瑚匠凿珊瑚 +80%」这种，
   *      不能写成「全采集 +80%」（写宽了玩家会拿镰刀去量矿工）；
   *    · 叠加是**乘算** —— 三件齐了是 1.8×1.8×1.8 ≈ 5.83 倍，不是 +240%。 */
  /* ⚠️ 工坊面板是**上下两块**（用户 2026-09-27 拍「照着猫国那种感觉来」），
   * 对应猫国 `js/jsx/left.jsx.js:494-505` 的那两块：
   *   「升级项」页签 = 买断一次就完事（职业工具 + 工坊升级）
   *   下半「工艺制作」 = 可以反复制造（石梁）
   * 顶部那一栏「工艺制作效率」是**一个全局数字**，来源是工坊建筑等级 + 奇观，见 workshop.craftRatio。 */
  function paneWorkshop() {
    var s = res();
    if (!s || !s.lvl || !(s.lvl.workshop > 0)) return paneWorkshopLocked();
    var tabs = '<div class="panel-subtabs workshop-subtabs" role="group" aria-label="工坊分区">' +
      '<button type="button" class="subtab' + (workshopView === 'making' ? ' on' : '') +
      '" data-workshop-view="making" aria-pressed="' + (workshopView === 'making') + '">制造</button>' +
      '<button type="button" class="subtab' + (workshopView === 'upgrades' ? ' on' : '') +
      '" data-workshop-view="upgrades" aria-pressed="' + (workshopView === 'upgrades') + '">升级项</button></div>';
    /* 已完成数走 doneCount(s) 现算；控件仍使用原 data-hidedone 委托，不改变刷新行为。 */
    var overview = '<div class="workshop-overview"><div class="workshop-efficiency">' +
      '<span class="workshop-mark" aria-hidden="true">⚒</span><div><small>CRAFT · 工坊</small>' +
      '<strong>工艺制作效率 <b>+' + (SB.workshop.craftRatio(s) * 100).toFixed(0) + '%</b></strong></div>' +
      '<div class="workshop-done-toggle">' + hideDoneBtn(s) + '</div></div></div>';
    if (workshopView === 'upgrades') {
      return overview + tabs + '<section class="workshop-section"><header class="workshop-section-title"><b>职业工具</b>' +
        '<small>买断后持续生效；每件工具只作用于对应职业。</small></header><div class="workshop-grid">' + paneToolRows(s) + '</div></section>' +
        '<section class="workshop-section"><header class="workshop-section-title"><b>工坊升级</b>' +
        '<small>一次装填，永久生效。</small></header><div class="workshop-grid">' + paneUpgradeRows(s) + '</div></section>' +
        (hideDone ? '<div class="note">已完成的项目当前被隐藏（' + doneCount(s) + ' 项）——点上方「显示已完成」把它们放回来。</div>' : '') +
        '<div class="note">工具、职业加成与容量等升级都在这里统一管理；已买断/装填的效果会持续生效。</div>';
    }
    return overview + tabs + '<section class="workshop-section"><header class="workshop-section-title"><b>工艺制作</b>' +
      '<small>查看每次投入、当前产出与批量选项。</small></header>' +
      autoSlotSummary(s) + '<div class="workshop-grid workshop-crafts">' + paneCraftRows(s) + '</div></section>' +
      (hideDone ? '<div class="note">已完成的项目当前被隐藏' +
        '（' + doneCount(s) + ' 项）——点上方「显示已完成」把它们放回来。</div>' : '') +
      '<div class="note">这里的配方可以反复制造，石梁是当前奇观的主要建材。' +
      '（礁石平台、深潜那一类通用采集加成，仍然会一并作用在职业产出上。）' +
      '工具与永久升级请切换到「升级项」。<\/div>';
  }

  var workshopView = 'making';
  function setWorkshopView(view) {
    if (view !== 'making' && view !== 'upgrades') return false;
    workshopView = view;
    return true;
  }

  /* ── 下半区：工艺制作 ───────────────────────────────────────────────
   * 形参照猫国 `js/jsx/left.jsx.js:502-505` 的四颗按钮
   * （craftFixed 1/25/100 + craftPercent 0.01/0.05/0.1/1，取大）。 */
  function paneCraftRows(s) {
    var L = SB.workshop.crafts(), h = '', i, j, shown = 0;
    if (!L.length) return '<div class="row"><div class="nm">（还没有配方）</div></div>';
    for (i = 0; i < L.length; i++) {
      var c = L[i];
      var why = SB.workshop.craftBlocked(s, c.id);
      /* ⚠️ 2026-10-05 用户拍板：与工具/升级项同口径 —— **未解锁的配方不显示**。
       *   配方没有「已拥有」概念（是反复制造，不是买断）⇒ 不需要那条例外。
       *   ⚠️ 判据仍是 `craftBlocked` 返回值的 `/^需要先/` 前缀（门未开）vs
       *      「还缺…」（材料不足）—— 两者都在 `craftBlocked` 里，见 workshop.js。 */
      if (why && /^需要先/.test(why)) continue;
      shown++;
      var mul = SB.workshop.craftMul(s);
      var cost = [], k;
      for (k in c.in) cost.push(SB.RESS[k].name + ' ' + c.in[k]);
      h += '<div class="row"><div class="nm"><button type="button" class="building-name" data-info-item="craft" data-info-id="' + c.id + '" aria-haspopup="dialog">' + c.name + '</button></div>' +
        '<div class="ds">每次：' + cost.join(' + ') +
        ' ⇒ <b>' + SB.economy.fmtAmt(c.out * mul) + '</b>' +
        '（效率 +' + ((mul - 1) * 100).toFixed(0) + '%）</div>';
      h += '<div class="craftbtns">';
      for (j = 0; j < SB.workshop.steps.length; j++) {
        var st = SB.workshop.steps[j];
        var amt = why ? 0 : SB.workshop.stepAmt(s, c, st);
        h += '<button class="btn' + (why ? ' buy' : '') + '" data-craft="' + c.id + '"' +
          ' data-craft-amt="' + amt + '"' + (why ? ' disabled' : '') + '>' + st.label + '</button>';
      }
      h += '</div>' + autoSlotCtl(s, c) + '</div>';
    }
    if (!shown) return '<div class="row"><div class="nm">（还没有配方）</div></div>';
    return h + '<div class="note">四颗按钮是**同一份材料换不同份数**：+1 就是造 1 份，' +
      '+100 就是造 100 份（不是「库存的 100%」）。效率和材料够了就更划算。</div>';
  }

  /* ── 自动制作槽的控件（2026-10-07 用户拍板）─────────────────────────
   * 语义：**原料满了才造，造当时可造量的这一档百分比**。四个档 25/50/75/100%。
   * ⚠️ 做成**按钮组而不是下拉框**：本 pane 每 2 秒整块重画（PANE_REFRESH），
   *    select 展开态会被 innerHTML 重写冲掉，玩家选到一半就弹回去（与本文件各处
   *    「每帧重画的容器里不放需要与用户交互的原生控件」同一条纪律）。
   * ⚠️ 没解锁自动工坊时**整行不画**（不是画成灰按钮）：那升级项还没装，
   *    槽数就是 0，画一堆点不动的按钮等于预告一个玩家拿不到的功能。
   *    拿得到之后（slotCap > 0）才出现「＋自动」。 */
  function autoSlotCtl(s, c) {
    var cap = SB.workshop.slotCap(s);
    if (cap <= 0) return '';
    var pct = SB.workshop.slotPct(s, c.id);
    var on = pct > 0;
    var h = '<div class="craftauto"><span class="asl">自动</span>';
    if (!on) {
      var full = ((s.autoSlots && s.autoSlots.length) || 0) >= cap;
      h += '<button class="btn tog" data-aslot="' + c.id + '" data-apct="0.5"' +
        (full ? ' disabled title="自动槽已用完（' + cap + '/' + cap + '）"' : '') + '>' +
        (full ? '槽位已满' : '＋自动') + '</button>';
    } else {
      var P = SB.workshop.pcts(), i;
      for (i = 0; i < P.length; i++) {
        var p = P[i];
        h += '<button class="btn tog' + (p === pct ? ' on' : '') + '" data-aslot="' + c.id + '"' +
          ' data-apct="' + p + '" title="原料满仓后，转制当时可造量的 ' + (p * 100) + '%">' +
          (p * 100) + '%</button>';
      }
      h += '<button class="btn tog" data-aoff="' + c.id + '" title="腾出这个自动槽">停用</button>';
    }
    return h + '</div>';
  }

  /* 自动槽的存量提示（挂在「工艺制作」段标题下）：玩家得先知道**有几个槽、从哪来的**。 */
  function autoSlotSummary(s) {
    var cap = SB.workshop.slotCap(s);
    if (cap <= 0) {
      return '<div class="note">自动制作槽：未解锁。' +
        '装上工坊升级项「自动工坊」自带 1 个，轮回商店可再买 3 个。</div>';
    }
    var used = (s.autoSlots && s.autoSlots.length) || 0;
    return '<div class="note">自动制作槽 <b>' + used + '/' + cap + '</b>：' +
      '给配方挂上「自动」后，<b>该配方的原料攒满仓储上限</b>时才动手，' +
      '按你选的档位转制当时能造的部分（25 / 50 / 75 / 100%）——' +
      '料还没满的时候不会碰你的建材。</div>';
  }

  function paneWorkshopLocked() {
    return '<div class="secttl">工坊</div>' +
      '<div class="row"><div class="nm">工坊尚未建成</div>' +
      '<div class="ds">先把工坊立起来（' + SB.habitat.habitatName(SB.game.run()) + '页那一座），这里才会给出加工线。</div></div>';
  }

  function paneToolRows(s) {
    var W = SB.workshop, h = '', i, shown = 0;
    for (i = 0; i < SB.TOOLS.length; i++) {
      var t = SB.TOOLS[i];
      var owned = !!(s.tools && s.tools[t.id]);
      var why = owned ? null : W.blocked(s, t.id);
      /* ⚠️ 2026-10-05 用户拍板：「工坊要能隐藏显示已经完成项目」。
       *   开关开着时跳过已买下的行。⚠️ 顺序要点：**先判开关、再判解锁**——
       *   反过来的话开关一开，「未解锁」与「已完成」两种行会一起消失，
       *   玩家会以为「连没解锁的东西都藏了」，而设置项该只管完成态。
       *   ⚠️ 计数在 doneCount(s) 里现算（不受这里的循环影响），不另记一份。 */
      if (hideDone && owned) continue;
      /* ⚠️ 2026-10-05 用户拍板：**未解锁的条目不显示**（改前七件工具全列）。
       *   判据复用按钮文案已在用的 `/^需要先/` 前缀（未解锁 vs 买不起），不新立一套。
       *   例外：已买下的永远显示（否则玩家看不到自己买过什么）——
       *   ⚠️ 但 hideDone 开着时上面已经把「已买下」过滤掉了，这条例外在隐藏态不生效。 */
      if (!owned && why && /^需要先/.test(why)) continue;
      shown++;
      /* 按钮的文案要说清「现在是什么状态」，而不只是「买」——
       * 灰着还写「买」会让玩家以为点了会发生什么，实际什么都没发生。 */
      var ctxt = SB.economy.costOwnedTxt(s, t.cost);
      var label = owned ? '已拥有'
        : why ? (/^需要先/.test(why) ? '未解锁' : '买不起 ' + ctxt)
          : '买下 ' + ctxt;
      h += '<div class="row"' + (owned ? ' data-owned="1"' : '') + '>' +
        '<div class="nm"><button type="button" class="building-name" data-info-item="tool" data-info-id="' + t.id + '" aria-haspopup="dialog">' + t.name + '</button>' + (owned ? ' <span class="tag ok">已买下</span>' : '') + '</div>' +
        '<div class="ds">' + t.desc + '（成本 ' + SB.economy.costTxt(t.cost) + '）</div>' +
        '<button class="btn' + (owned || why ? '' : ' buy') + '" data-tool="' + t.id + '"' +
        (owned || why ? ' disabled' : '') + ' title="' + (why || '') + '">' + label + '</button></div>';
    }
    if (!shown) return '<div class="row"><div class="nm">' +
      (hideDone && doneCount(s) > 0 ? '（可买的都买完了）' : '（还没有可买的工具）') + '</div></div>';
    return h + '<div class="note">门槛是建成工坊本身，不是青铜术——青铜术是纪元一最贵的科技，' +
      '等它解锁工具就晚到了。</div>';
  }

  /* ── 工坊的**第三块**：工艺升级项（2026-09-28 · era2 第三层）──────────
   * ⚠️ 这块曾经**完全不存在**：capOf 里那条 `upg_ballast_1` 的乘区早就通了，
   *    e2e 也绿，但面板上没有任何一处能点到它 —— 玩家得去翻存档改 `s.upgrades`
   *    才吃得到那 ×1.5。与「系数加了没接线」是同一类病，只是这次缺的是**入口**。
   *    判据：**一个效果如果玩家点不到，就等于它不存在**，UI 少了那一行不算「以后再加」。
   * ⚠️ 形态与上半区的工具最像（一次性装填、装完永久生效），但**存的地方不同**：
   *    工具存 s.tools、升级项存 s.upgrades —— 按「买断」这一语义分别归类，
   *    不共用一个键，将来查「这东西到底买没买」才不会串。 */
  function paneUpgradeRows(s) {
    var W = SB.workshop, L = W.upgrades(), h = '', i, shown = 0;
    for (i = 0; i < L.length; i++) {
      var u = L[i];
      var on = !!(s.upgrades && s.upgrades[u.id]);
      var why = on ? null : W.upgradeBlocked(s, u.id);
      /* ⚠️ 2026-10-05：与工具同口径 —— ① hideDone 开着时跳过已装上的（先判开关）；
       *   ② 未解锁不显示，已装上的在显示态永远显示。 */
      if (hideDone && on) continue;
      if (!on && why && /^需要先/.test(why)) continue;
      shown++;
      /* 与工具同口径：灰着还写「装上」会让玩家以为点了会怎样，实际什么都没有。 */
      var ctxt = SB.economy.costOwnedTxt(s, u.cost);
      var label = on ? '已装上'
        : why ? (/^需要先/.test(why) ? '未解锁' : '材料不够 ' + ctxt)
          : '装上 ' + ctxt;
      h += '<div class="row"' + (on ? ' data-owned="1"' : '') + '>' +
        '<div class="nm"><button type="button" class="building-name" data-info-item="upgrade" data-info-id="' + u.id + '" aria-haspopup="dialog">' + u.name + '</button>' + (on ? ' <span class="tag ok">已装填</span>' : '') + '</div>' +
        '<div class="ds">' + u.desc + '（成本 ' + SB.economy.costTxt(u.cost) + '）</div>' +
        '<button class="btn' + (on || why ? '' : ' buy') + '" data-upgrade="' + u.id + '"' +
        (on || why ? ' disabled' : '') + ' title="' + (why || '') + '">' + label + '</button></div>';
    }
    if (!shown) return '<div class="row"><div class="nm">' +
      (hideDone && doneCount(s) > 0 ? '（可装的都装完了）' : '（还没有可装的升级项）') + '</div></div>';
    return h;
  }

  var PANES = { village: paneVillage, folk: paneFolk, tech: paneTech, civic: paneCivic,
    faith: paneFaith, workshop: paneWorkshop, wonder: paneWonder, meta: paneMeta };

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
  var techViewEra = 0, techJumpTo = null, techJumpDone = false;

  function renderPanes() {
    /* 科技 tab 的灰态随开门那一刻翻转，所以每次画面板都同步一次（5 个节点，很便宜）。
     * 放在这里而不是只在 initTabs 做一次：开门是由建造动作触发的，那时 initTabs 早跑完了。 */
    syncTabLocks();
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
      if (k === 'faith') {
        var body = el('pane-faith-body');
        if (body) body.innerHTML = PANES[k]();
      } else {
        node.innerHTML = cardHeadHTML(k) + PANES[k]();
      }
    }
    paintHappy(res());
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
  function techGoEra(n) {
    var s = res(), era = (s && s.era) || 1;
    if (!(n >= 1 && n <= (SB.ERAS || []).length)) return false;
    if (n <= era) techJumpTo = SB.tech.eraAnchorX(n);
    var changed = n !== (techViewEra || era);
    techViewEra = n;
    return changed || n <= era;
  }

  function renderBreakBtn() {
    var s = res(); if (!s) return;
    var ready = s.shell <= 0 && !s.broken;
    el('btnBreak').disabled = !ready;
    el('breakHint').textContent = ready ? '壳已归零——凿下去。'
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
    return { blocked: false, p: Math.min(1, g / CFG.GROW_NEED),
      left: Math.ceil(CFG.GROW_NEED - g), txt: '' };
  }
  /* 族民页那行的每帧刷新：只改数字 / 条宽 / 原因文字，不重建整块 pane
   * （pane 重建走 renderPanes，只在切页时发生——见 paneFolk 里的注释）。 */
  function paintGrow(s) {
    var st = growState(s), g = s._grow || 0;
    var p = st.blocked ? 0 : Math.min(1, g / CFG.GROW_NEED);
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

  function renderAll() {
    var s = res();
    /* 巢穴 tab 名随纪元演进（与卡片标题同一来源，避免 tab 写「巢穴」、面板写「渊海之国」打架）。 */
    var vt = el('villageTabName');
    if (vt && SB.habitat && SB.habitat.habitatName) vt.textContent = SB.habitat.habitatName(s);
    renderRes(); renderShell(); renderPanes(); renderBreakBtn(); clock(); renderGrowBar(); renderEnv(s); renderWarm(s); renderDrill(s); renderReligion(s); renderIdleTag(); renderEvent(s); renderAd();
  }
  function renderTick() {
    var s = res();
    renderRes(); renderShell(); renderBreakBtn(); clock(); renderGrowBar(); renderEnv(s); renderWarm(s); renderDrill(s); renderIdleTag(); renderEvent(s); paintHappy(s);
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
      '<div class="kv" style="border:0;margin-top:8px"><span>获得轮回点</span><b style="color:var(--amber);font-size:17px">' + (r.tidePoints || 0).toFixed(2) + '</b></div>';
    var extra = '';
    if (r.relicTourism) extra += '<div class="note">新入藏奇观 ' + r.relicTourism + ' 座（每座 +1% 科技/市政获取）</div>';
    if (r.oldArtwork) extra += '<div class="note">转入旧日艺术品 ' + r.oldArtwork + ' 件（固定市政点/秒）</div>';
    if (r.oldTideStele) extra += '<div class="note">转入旧日潮纹碑石 ' + r.oldTideStele + ' 件（固定科技点/秒）</div>';
    var note = r.locked
      ? '<div class="note" style="color:var(--red)">本局未达《神学》资格门，不发放轮回点、不解锁商店。</div>'
      : (extra || '<div class="note">轮回点 = 1 + floor(发展分 × 系数 × 破壳系数)，发展分 = 2×峰值族民 + 建筑纪元分 + 工坊解锁项；下一局继承轮回点、已购增益与旧日遗产账本。</div>');
    box.innerHTML =
      '<h3>冰壳裂开了</h3>' +
      rows +
      note +
      '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
      '<button class="btn" id="mStay">留在这一局</button>' +
      '<button class="big" id="mNext">开始轮回</button></div>';
    el('modal').classList.remove('hidden'); bodyModalClass(true);
    el('mStay').onclick = function () { SB.game.stay(); };
    el('mNext').textContent = (m && m.religionSeen) ? '开始轮回' : '重开本周目';
    el('mNext').onclick = function () { SB.game.nextCycle(); };
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
    modal.classList.remove('tree-modal');
    modal.classList.remove('tree-tech');
    modal.classList.remove('tree-civic');
    modal.classList.remove('break-modal');
    modal.classList.remove('story-modal');
    el('modalBox').classList.remove('tree-detail-box');
    el('modalBox').classList.remove('story-box');
    bodyModalClass(false);
  }

  /* 在效果文案中把已解锁内容转成内联入口。逐段匹配并优先长名称，
   * 避免「大灯塔」被较短的「灯塔」再次切坏。 */
  function linkInfoNames(text) {
    text = String(text || '');
    var names = [], i, list = SB.BUILDINGS || [], wonders = SB.wonder ? SB.wonder.list() : [], policies = SB.POLICIES || [];
    for (i = 0; i < list.length; i++) names.push({ name: list[i].name, id: list[i].id, type: 'build' });
    for (i = 0; i < wonders.length; i++) names.push({ name: wonders[i].name, id: wonders[i].id, type: 'wonder' });
    for (i = 0; i < policies.length; i++) names.push({ name: policies[i].name, id: policies[i].id, type: 'policy' });
    names.sort(function (a, b) { return b.name.length - a.name.length; });
    var out = '', cursor = 0;
    while (cursor < text.length) {
      var bestAt = -1, best = null, at;
      for (i = 0; i < names.length; i++) {
        at = text.indexOf(names[i].name, cursor);
        if (at >= 0 && (bestAt < 0 || at < bestAt)) { bestAt = at; best = names[i]; }
        else if (at === bestAt && best && names[i].name.length > best.name.length) best = names[i];
      }
      if (!best) break;
      out += text.slice(cursor, bestAt);
      out += '<span role="button" tabindex="0" class="inline-info-link" ' +
        (best.type === 'build' ? 'data-build-info' : best.type === 'wonder' ? 'data-wonder-info' : 'data-policy-info') +
        '="' + best.id + '" aria-haspopup="dialog">' + best.name + '</span>';
      cursor = bestAt + best.name.length;
    }
    return out + text.slice(cursor);
  }

  /* 科技 / 市政节点详情：树图节点只负责展示路径与状态，效果、条件和研究操作
   * 收进这张卡片。判据继续复用各自玩法模块，避免 UI 另算一次门槛。 */
  function showTreeDetail(type, id) {
    var s = res(), tech = type === 'tech', item = null, i;
    if (!s) return;
    if (tech) {
      item = SB.tech && SB.tech.byId ? SB.tech.byId(id) : null;
    } else {
      for (i = 0; SB.CIVICS && i < SB.CIVICS.length; i++) {
        if (SB.CIVICS[i].id === id) { item = SB.CIVICS[i]; break; }
      }
    }
    if (!item) return;

    var done = tech ? !!s.techs[id] : !!s.civics[id];
    var revealed = tech ? SB.tech.metOf(s, item) : SB.civic.isRevealed(s, id);
    var blocked = done ? null : tech ? SB.tech.studyBlocked(s, id) : SB.civic.blocked(s, item);
    var short = SB.tech.condShort(s, tech ? item.cond : item.boost);
    var title = revealed ? item.name : '未揭露的' + (tech ? '科技' : '市政');
    var detailReqsMet = true;
    if (tech && item.reqs) {
      for (i = 0; i < item.reqs.length; i++) {
        if (!s.techs[item.reqs[i]]) { detailReqsMet = false; break; }
      }
    }
    var blockKind = '';
    if (tech && !done && blocked) {
      if (!revealed) blockKind = 'unrevealed';
      else if (item.era > (s.era || 1)) blockKind = 'era';
      else if (!SB.tech.metOf(s, item)) blockKind = 'eureka';
      else if (!detailReqsMet) blockKind = 'prereq';
      else if (!SB.economy.enough(s.res.science, item.cost || 0)) blockKind = 'science';
    }
    var state = done ? (tech ? '已掌握' : '已完成') : !revealed ? '未揭露' :
      !blocked ? '可研究' : blockKind === 'science' ? '科技点不足' :
      blockKind === 'prereq' ? '缺少前置' : blockKind === 'era' ? '纪元未到' :
      blockKind === 'eureka' ? '尤里卡未达成' : '暂不可研究';
    var currency = tech ? 'science' : 'culture';
    var currencyName = tech ? '科技点' : '市政点';
    var reqs = item.reqs || [], reqHtml = '', reqDone, parent, parentDone, parentName;
    for (i = 0; i < reqs.length; i++) {
      parent = tech ? SB.tech.byId(reqs[i]) : null;
      if (!tech) {
        for (var ci = 0; SB.CIVICS && ci < SB.CIVICS.length; ci++) {
          if (SB.CIVICS[ci].id === reqs[i]) { parent = SB.CIVICS[ci]; break; }
        }
      }
      parentDone = tech ? !!s.techs[reqs[i]] : !!s.civics[reqs[i]];
      parentName = parent ? parent.name : reqs[i];
      reqHtml += '<span class="tree-req' + (parentDone ? ' met' : '') + '">' +
        (parentDone ? '✓ ' : '· ') + parentName + '</span>';
    }
    if (!reqHtml) reqHtml = '<span class="tree-req met">无 · 起始节点</span>';

    /* 科技详情必须展示数据里的真实尤里卡条件（item.cond）。
     * item.note 只是 Civ6 对标/氛围备注，不能在揭示后拿来替换条件；否则同一项科技
     * 会从「实际门槛」变成一段看似合理但游戏根本不判定的自编文案。 */
    var condition = tech
      ? (item.cond ? (SB.tech.condText(item.cond) || '尤里卡条件') : '无需尤里卡')
      : SB.civic.boostText(s, item);
    var conditionProgress = tech && !revealed && short ? short.txt : '';
    var progress = short && short.need > 0 && !done
      ? Math.max(0, Math.min(100, short.now / short.need * 100)) : 0;
    var showProgress = !revealed && short && short.need > 0;
    var effect = tech ? SB.tech.effectText(item) : item.desc;
    if (tech && effect.indexOf('（无直接效果）') === 0 && item.note) effect = item.note.split('\n')[0];
    var cost = item.cost || 0;
    var blockDetail = '';
    if (tech && !done && blocked) {
      if (blockKind === 'unrevealed') {
        blockDetail = '<div class="tree-detail-blocked unrevealed"><b>未揭露</b><span>先达成尤里卡条件，才能看到这项科技的完整信息。</span></div>';
      } else if (blockKind === 'eureka') {
        blockDetail = '<div class="tree-detail-blocked eureka"><b>尤里卡未达成</b><span>完成上方条件后，才能投入科技点研究。</span></div>';
      } else if (blockKind === 'science') {
        blockDetail = '<div class="tree-detail-blocked science"><b>科技点不足</b><span>现有 ' + SB.economy.fmtAmt(s.res.science) + ' / 需求 ' + SB.economy.fmtAmt(cost) + '</span></div>';
      } else if (blockKind === 'prereq') {
        blockDetail = '<div class="tree-detail-blocked prereq"><b>缺少前置科技</b><span>' + blocked.replace(/^缺少前置科技：/, '') + '</span></div>';
      } else if (blockKind === 'era') {
        blockDetail = '<div class="tree-detail-blocked era"><b>纪元未到</b><span>' + blocked.replace(/^纪元未到：/, '') + '</span></div>';
      }
    }
    var buttonText = done ? state : blocked ? (blockKind === 'science' ? '科技点不足' : state) : cost
      ? '研究　' + SB.economy.costOwnedTxt(s, (function () { var c = {}; c[currency] = cost; return c; })())
      : '免费研究';
    var box = el('modalBox'), modal = el('modal');
    box.classList.add('tree-detail-box');
    box.innerHTML =
      '<div class="tree-detail-head"><div class="tree-detail-mark">' + (item.key ? '✦' : tech ? '⌘' : '§') +
      '</div><div class="tree-detail-title"><h3 id="treeDetailTitle">' + title + (item.key && revealed ? ' <span class="tree-key">关键节点</span>' : '') +
      '</h3><span class="tree-detail-state ' + (done ? 'done' : blocked ? 'locked' : 'ready') + '">' + state + '</span></div>' +
      '<button class="tree-detail-close" type="button" data-modal-close="1" aria-label="关闭详情">×</button></div>' +
      '<div class="tree-cost"><span>研究成本</span><b>' + (cost ? cost + ' ' + currencyName : '免费') + '</b></div>' + blockDetail +
      '<section class="tree-detail-section"><h4>' + (tech ? '尤里卡' : '鼓舞') + '</h4><p>' +
      linkInfoNames(condition) + '</p>' +
      (conditionProgress ? '<small class="tree-eureka-progress">当前进度：' + conditionProgress + '</small>' : '') +
      (showProgress ? '<div class="tree-progress"><i style="width:' + progress.toFixed(1) + '%"></i></div>' : '') +
      (showProgress ? '<small>进度 ' + progress.toFixed(0) + '%</small>' : '') + '</section>' +
      '<section class="tree-detail-section"><h4>效果</h4><p>' +
      (revealed ? linkInfoNames(effect) : '达成揭示条件后显示。') + '</p></section>' +
      '<section class="tree-detail-section"><h4>前置节点</h4><div class="tree-reqs">' + reqHtml + '</div></section>' +
      '<div class="tree-detail-actions"><button class="btn buy" type="button" data-tree-study="' + (tech ? 'tech' : 'civic') + '" data-' + (tech ? 'tech' : 'civic') + '="' + id + '"' +
      (done || blocked ? ' disabled' : '') + (blocked ? ' title="' + blocked + '"' : '') + '>' + buttonText + '</button>' +
      '<button class="btn tree-back" type="button" data-modal-close="1">返回树图</button></div>';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'treeDetailTitle');
    modal.classList.add('tree-modal');
    modal.classList.remove('tree-tech');
    modal.classList.remove('tree-civic');
    modal.classList.add(tech ? 'tree-tech' : 'tree-civic');
    modal.classList.remove('hidden');
    bodyModalClass(true);
  }

  function openInfoCard(title, mark, state, body, actions) {
    var box = el('modalBox'), modal = el('modal');
    box.classList.add('tree-detail-box');
    box.innerHTML = '<div class="tree-detail-head"><div class="tree-detail-mark">' + mark +
      '</div><div class="tree-detail-title"><h3 id="treeDetailTitle">' + title + '</h3>' +
      '<span class="tree-detail-state ' + state.cls + '">' + state.text + '</span></div>' +
      '<button class="tree-detail-close" type="button" data-modal-close="1" aria-label="关闭详情">×</button></div>' +
      body + '<div class="tree-detail-actions">' + (actions || '') +
      '<button class="btn tree-back" type="button" data-modal-close="1">关闭</button></div>';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'treeDetailTitle');
    modal.classList.add('tree-modal');
    modal.classList.remove('hidden');
    bodyModalClass(true);
  }

  /* 建筑信息卡「效果」段：把每座建筑的「每级基础量 × 当前等级 = 当前总量」写清楚，
   * 与住房那一支（人口上限 +X/级（当前 +Y））同构。所有带每级效果的产出 / 容量 / 减耗建筑都走这里；
   * 一次性效果（炉 / 城堡 / 观测站 / 博物馆 / 工坊产钢）无「每级」概念，回退到 desc。
   * ⚠️「当前」= 基础每级量 × 当前等级，不含科技 / 奇观 / 政策等外部乘区——
   *   与住房那条保持一致（housePerLevel×lv 也不含 perk 外的乘区），避免面板与结算两套口径。 */
  function buildingEffectText(s, b, lv) {
    var B = SB.BLD, U = SB.UNIT || {}, id = b.id, L = lv;
    function add(label, perVal, curVal, unit, dec) {
      var d = dec == null ? 0 : dec;
      return label + ' +' + perVal.toFixed(d) + '/级' + unit + '（当前 +' + curVal.toFixed(d) + '）';
    }
    function pct(label, perPct, curPct, dec, sign) {
      var d = dec == null ? 1 : dec; sign = sign || '+';
      return label + ' ' + sign + perPct.toFixed(d) + '%/级（当前 ' + sign + curPct.toFixed(d) + '%）';
    }
    switch (id) {
      case 'kelp':         return add('自动产藻食', B.food, B.food * L, '/秒', 2) + '；吃季节减产';
      case 'weir':         return pct('藻食产出', B.foodWeir * 100, B.foodWeir * 100 * L);
      case 'warmnest':     return pct('族口粮', B.foodSave * 100, B.foodSave * 100 * L, 1, '−');
      case 'kelpstore':    return add('藻食上限', B.kelpCap, B.kelpCap * L, '', 0);
      case 'ballast':      return add('其余资源上限', B.ballastCap, B.ballastCap * L, '', 0);
      case 'lighthouse':   return pct('全资源产出', B.lighthouseProd * 100, B.lighthouseProd * 100 * L, 0) +
                                 '；' + add('其余资源上限', B.lighthouseCap, B.lighthouseCap * L, '', 0);
      case 'workshop':     return pct('工艺制作效率', (b.craftRatio || 0) * 100, (b.craftRatio || 0) * 100 * L, 0);
      case 'siltpit':      return pct('矿工与采石工产出', B.siltBonus * 100, B.siltBonus * 100 * L, 0);
      case 'library':      return pct('科技产出（仅学者）', B.sciRatio * 100, B.sciRatio * 100 * L, 0);
      case 'institute':    return pct('科技产出（仅学者）', B.instituteSci * 100, B.instituteSci * 100 * L, 0) +
                                 '；升级为大学后变 ×100%/级';
      case 'square':       return pct('市政点产出（仅书手）', B.squareCivRatio * 100, B.squareCivRatio * 100 * L, 0) +
                                 '；装《戏剧与诗歌》后翻倍';
      case 'temple':       return pct('信仰产出', B.templeFaithRatio * 100, B.templeFaithRatio * 100 * L, 0) +
                                 '；宗教系统落地后生效';
      case 'hydroturbine': return add('热液能', U.hydroOut || 0, (U.hydroOut || 0) * L, '/秒', 0) +
                                 '；耗暖石 ' + ((U.hydroWarm || 0) * L) + '/秒';
      case 'coralfarm':    return pct('珊瑚匠产出', B.coralFarmCW * 100, B.coralFarmCW * 100 * L, 0);
      case 'bank':         return pct('商人产出', B.bankLux * 100, B.bankLux * 100 * L, 0);
      case 'school':       return add('每名商人科技产出', B.schoolMerchantSci, B.schoolMerchantSci * L, '/秒', 1);
      case 'theater':      return pct('官员（书手）市政点产出', B.theaterCivRatio * 100, B.theaterCivRatio * 100 * L, 0);
      case 'hotforge':     return pct('工艺制作效率', B.hotforgeCraft * 100, B.hotforgeCraft * 100 * L, 0);
      case 'canal':        return pct('居民奢侈品消耗', B.canalLuxSave * 100, B.canalLuxSave * 100 * L, 1, '−') +
                                 '；等级最高不超过灯塔等级';
      case 'caravanserai': return pct('居民奢侈品消耗', B.caravanseraiLuxSave * 100, B.caravanseraiLuxSave * 100 * L, 0, '−') +
                                 '；每季节额外获得「等级 × 1 分钟」产量的任意时产资源';
      case 'museum':       return '官员（书手）市政点产出 +20%（建成即生效，不随等级递增）';
      case 'hydroshop':    return '每级耗 ' + (U.hydroShopLvl || 0) + ' 热液能/秒，吃金属产钢（产钢量随热液能供给浮动）';
      case 'furnace':      return '解锁 金属 → 精铁（一次性效果，不随等级递增）';
      case 'observatory':  return '科技产出 +x%（x 与冰壳厚度成反比，最高 +' + (B.obsMaxBonus || 0) + '%，与建筑等级无关）';
      case 'hall':         return '随等级降低所有建筑下一级成本；升级为城堡后议价效果 +50%、并额外给所有有上限资源 +50 容量/级';
      default:             return b.desc || '';
    }
  }

  function showBuildingInfo(id) {
    var s = res(), b = SB.habitat && SB.habitat.buildingById ? SB.habitat.buildingById(id) : null;
    if (!s || !b) return;
    var name = b.name, desc = b.desc || '';
    for (var i = 0; SB.UPGRADES && i < SB.UPGRADES.length; i++) {
      var u = SB.UPGRADES[i];
      if (u.upgradesBuilding === b.id && s.upgrades && s.upgrades[u.id]) {
        name = u.name;
        desc = u.buildingDesc || u.desc || desc;
      }
    }
    var lv = (s.lvl && s.lvl[id]) || 0;
    var blocked = !SB.habitat.needMet(s, b), canalCap = id === 'canal' &&
      (s.lvl.canal || 0) >= (s.lvl.lighthouse || 0);
    var cost = SB.economy.costOf(s, id), state = blocked || canalCap
      ? { cls: 'locked', text: '前置条件未满足' }
      : { cls: lv ? 'done' : 'ready', text: lv ? '已建造 · 等级 ' + lv : '可建造' };
    var housePlan = (s.perk && s.perk.housePlan) || 0;
    var housePerLevel = id === 'nest' ? SB.BLD.house
      : id === 'coralhouse' ? SB.BLD.house2
        : id === 'tenement' ? SB.BLD.tenementPop : 0;
    var effectText;
    if (housePerLevel) {
      effectText = '人口上限 +' + housePerLevel + '/级（当前 +' + (housePerLevel * lv) + '）';
      if (housePlan) effectText += ' · 生息建筑规划额外 +' + housePlan + '/级（当前 +' + (housePlan * lv) + '）';
      if (id === 'nest') effectText += '。住满后不再生育。';
    } else {
      effectText = buildingEffectText(s, b, lv);
    }
    var requirement = b.need ? SB.habitat.buildingById(b.need) : null;
    var reqText = requirement
      ? '需先建成「' + requirement.name + '」' + ((s.lvl && s.lvl[b.need]) ? ' · 已满足' : ' · 未满足')
      : '无额外建筑前置';
    if (canalCap) reqText = '潮道等级不能超过灯塔等级；先升级灯塔。';
    var body = '<div class="tree-cost"><span>当前等级</span><b>' + lv + '</b></div>' +
      '<section class="tree-detail-section"><h4>效果</h4><p>' + linkInfoNames(effectText) + '</p></section>' +
      '<section class="tree-detail-section"><h4>下一次建造 / 升级</h4><p>' +
      SB.economy.costOwnedTxt(s, cost) + '</p></section>' +
      '<section class="tree-detail-section"><h4>建造条件</h4><p>' + reqText + '</p></section>';
    openInfoCard(name, '⌂', state, body, '');
  }

  var WONDER_ART = {
    wonder_tide_stele: 'assets/wonders/icons-demo-v1/tide-stele.png',
    wonder_great_lighthouse: 'assets/wonders/icons-demo-v1/great-lighthouse.png',
    wonder_great_library: 'assets/wonders/icons-demo-v1/great-tide-archive.png',
    /* generated-v2 这批详情图已转webp（1254² → 880²，q=0.85）：
     * 原 PNG 10 张共 31.7MB ⇒ webp 10 张共 2.5MB，省 29MB。
     * 降采样依据：详情浮层 max-width 440px（css/10-tech-tree.css:109），880 = 2× 高清屏已足。
     * 画质已用 headless Chrome 在 420px 实际显示尺寸下左右对比验收，肉眼无差异。*/
    wonder_albada: 'assets/wonders/generated-v2/wonder-albada.webp',
    wonder_stt_abbey: 'assets/wonders/generated-v2/wonder-stt-abbey.webp',
    wonder_grand_bazaar: 'assets/wonders/generated-v2/wonder-grand-bazaar.webp',
    wonder_grand_exchange: 'assets/wonders/generated-v2/wonder-grand-exchange.webp',
    wonder_shellcutter: 'assets/wonders/generated-v2/wonder-shellcutter.webp',
    wonder_luluka: 'assets/wonders/generated-v2/wonder-luluka.webp',
    wonder_presspipe: 'assets/wonders/generated-v2/wonder-presspipe.webp',
    wonder_skydrill: 'assets/wonders/icons-demo-v1/sky-drill.png',
    wonder_olo_wa_cathedral: 'assets/wonders/generated-v2/wonder-olo-wa-cathedral.webp',
    wonder_shadow_theater: 'assets/wonders/generated-v2/wonder-shadow-theater.webp',
    wonder_congress: 'assets/wonders/generated-v2/wonder-congress.webp'
  };
  var WONDER_FLAVOR = {
    wonder_tide_stele: '第一道潮纹被刻进石碑，也把工匠们共同的尺度留给了后来者。',
    wonder_great_lighthouse: '灯火穿过深海的黑潮，为远礁航线标出一条不会熄灭的路。',
    wonder_great_library: '每一道潮纹都是一次记忆，散落在各巢穴的知识终于重新汇成文明。',
    wonder_albada: '热液喷口旁的学者记录矿脉、人口与压力，第一次把经验写成定律。',
    wonder_stt_abbey: '在最深的静水里，诵唱声让每一项新知识都有了回响。',
    wonder_grand_bazaar: '来自不同巢穴的商队在这里交换盐、光与故事，价格也开始拥有方向。',
    wonder_grand_exchange: '一座真正的城市，需要一张能让远方货物汇流的桌面。',
    wonder_shellcutter: '天壳不再只是头顶的禁忌，它被测量、标记，最后被当成工程来处理。',
    wonder_luluka: '卢卢卡的炉火昼夜不熄，旧工艺在这里被拆开，再装成更大的机器。',
    wonder_presspipe: '高压热液沿着管道奔涌，把深海最猛烈的热量送到每一座工坊。',
    wonder_skydrill: '当钻头第一次触到天壳，所有关于终点的传说都变成了倒计时。',
    wonder_shadow_theater: '舞台让城市学会共同想象；散落的声音，终于有了同一片穹顶。',
    wonder_congress: '争论被写进石墙，决定被交给所有愿意留下的人。'
  };
  function wonderArt(w) {
    var src = WONDER_ART[w.id];
    if (src) return '<div class="wonder-art has-image"><img src="' + src + '" alt="' + w.name + '"></div>';
    return '<div class="wonder-art placeholder"><span>✦</span><small>奇观视觉稿 · 待补</small></div>';
  }
  function showWonderInfo(id) {
    var s = res(), w = SB.wonder && SB.wonder.byId(id);
    if (!s || !w) return;
    var done = !!(s.wonders && s.wonders[id]);
    var why = done ? null : SB.workshop.wonderBlocked(s, id);
    var cost = SB.wonder.discountedCost(s, id);
    var state = done ? { cls: 'done', text: '已建成 · 永久效果' }
      : why ? { cls: 'locked', text: /^需要先/.test(why) ? '条件未满足' : '材料不足' }
        : { cls: 'ready', text: '可建造' };
    var reqs = [], i, t, c;
    if (w.need) {
      t = SB.tech.byId(w.need);
      reqs.push((s.techs && s.techs[w.need] ? '✓ ' : '· ') + (t ? t.name : w.need) + '（科技）');
    }
    if (w.needCivic) {
      c = null;
      for (i = 0; SB.CIVICS && i < SB.CIVICS.length; i++) if (SB.CIVICS[i].id === w.needCivic) c = SB.CIVICS[i];
      reqs.push((s.civics && s.civics[w.needCivic] ? '✓ ' : '· ') + (c ? c.name : w.needCivic) + '（市政）');
    }
    var reqHtml = reqs.length
      ? '<div class="tree-reqs">' + reqs.map(function (x) { return '<span class="tree-req' + (x.indexOf('✓') === 0 ? ' met' : '') + '">' + x + '</span>'; }).join('') + '</div>'
      : '<p>无额外解锁条件</p>';
    var flavor = WONDER_FLAVOR[id] || '这座奇观正在等待一段属于它自己的历史。';
    var body = wonderArt(w) +
      '<div class="tree-cost"><span>建造成本</span><b>' + SB.economy.costTxt(cost) + '</b></div>' +
      '<section class="tree-detail-section"><h4>效果</h4><p>' + linkInfoNames(w.desc) + '</p>' +
      (done ? happyBonusNote(s, 'wonder', w.id) : '') + '</section>' +
      '<section class="tree-detail-section"><h4>解锁条件</h4>' + reqHtml + '</section>' +
      (why && !/^需要先/.test(why) ? '<section class="tree-detail-section"><h4>资源情况</h4><p>' + why + '</p></section>' : '') +
      '<section class="tree-detail-section wonder-copy"><h4>奇观文案</h4><p>' + flavor + '</p></section>';
    var action = done ? '' : '<button class="btn buy" type="button" data-wonder="' + id + '"' +
      (why ? ' disabled title="' + why + '"' : '') + '>建成　' + SB.economy.costOwnedTxt(s, cost) + '</button>';
    openInfoCard(w.name, '✦', state, body, action);
  }

  function showPolicyInfo(id) {
    var s = res(), p = SB.civic && SB.civic.policyById(id);
    if (!s || !p) return;
    var owned = SB.civic.cardOwned(s, id), slotted = !!(s.cards && s.cards.indexOf(id) >= 0);
    var state = slotted ? { cls: 'done', text: '已装填 · 正在生效' }
      : owned ? { cls: 'ready', text: '已解锁 · 尚未装填' }
        : { cls: 'locked', text: p.retiredBy ? '已退役' : '尚未解锁' };
    var slot = p.type ? SB.civic.slotTypeName(p.type) : '万能槽';
    var body = '<section class="tree-detail-section"><h4>效果</h4><p>' + linkInfoNames(p.desc) + '</p></section>' +
      '<section class="tree-detail-section"><h4>适配槽位</h4><p>' + slot + '</p></section>' +
      '<section class="tree-detail-section"><h4>生效方式</h4><p>' +
      (p.retiredBy ? '此卡已退役，不能再装填。' : '研究解锁后，还需装填到适配槽位才会生效。') + '</p></section>';
    openInfoCard(p.name, '▤', state, body, '');
  }

  function showWorkshopInfo(type, id) {
    var s = res(), W = SB.workshop, item = null, list = [], i;
    if (!s || !W) return;
    if (type === 'tool') list = SB.TOOLS || [];
    else if (type === 'upgrade') list = W.upgrades();
    else if (type === 'craft') list = W.crafts();
    for (i = 0; i < list.length; i++) if (list[i].id === id) { item = list[i]; break; }
    if (!item) return;
    var owned = type === 'tool' ? !!(s.tools && s.tools[id])
      : type === 'upgrade' ? !!(s.upgrades && s.upgrades[id]) : false;
    var why = type === 'tool' ? (owned ? null : W.blocked(s, id))
      : type === 'upgrade' ? (owned ? null : W.upgradeBlocked(s, id)) : W.craftBlocked(s, id);
    var state = owned ? { cls: 'done', text: type === 'tool' ? '已拥有' : '已装上' }
      : why ? { cls: 'locked', text: /^需要先/.test(why) ? '条件未满足' : '材料不足' }
        : { cls: 'ready', text: type === 'craft' ? '可制作' : '可购买' };
    var cost = type === 'craft' ? item.in : item.cost;
    var desc = item.desc || '';
    if (type === 'craft') {
      var mul = W.craftMul(s);
      desc += ' 每次消耗 ' + SB.economy.costTxt(item.in) + '，产出 ' +
        SB.economy.fmtAmt(item.out * mul) + ' ' + (SB.RESS[item.res] ? SB.RESS[item.res].name : item.res) +
        '（含当前工艺效率 +' + ((mul - 1) * 100).toFixed(0) + '%）。';
    }
    var label = type === 'tool' ? '买下' : type === 'upgrade' ? '装上' : '制作 +1';
    var action = '';
    if (type === 'tool' && !owned) action = '<button class="btn buy" data-tool="' + id + '"' + (why ? ' disabled' : '') + '>' + label + '　' + SB.economy.costOwnedTxt(s, cost) + '</button>';
    if (type === 'upgrade' && !owned) action = '<button class="btn buy" data-upgrade="' + id + '"' + (why ? ' disabled' : '') + '>' + label + '　' + SB.economy.costOwnedTxt(s, cost) + '</button>';
    if (type === 'craft') action = '<button class="btn buy" data-craft="' + id + '" data-craft-amt="1"' + (why ? ' disabled' : '') + '>' + label + '</button>';
    var body = '<div class="tree-cost"><span>' + (type === 'craft' ? '每次投入' : '所需材料') + '</span><b>' + SB.economy.costTxt(cost) + '</b></div>' +
      '<section class="tree-detail-section"><h4>效果 / 产出</h4><p>' + linkInfoNames(desc) + '</p></section>' +
      (why ? '<section class="tree-detail-section"><h4>当前条件</h4><p>' + why + '</p></section>' : '');
    openInfoCard(item.name, type === 'craft' ? '⚒' : '⌘', state, body, action);
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
    /* 信仰页的灰态：**第五个独立门槛** —— 神学（与资源行 / 产出线的 gate 同源：
     *   resUnlocked(s,'faith') ⇔ s.civics.theology），不在这里另立一份判据。 */
    var ft = document.querySelector('.tab[data-tab="faith"]');
    if (ft) {
      var fs2 = res(), fop = !!(SB.economy && fs2 && SB.economy.resUnlocked(fs2, 'faith'));
      ft.classList.toggle('locked', !fop);
      ft.title = fop ? '' : '研究「神学」后开启信仰页';
    }
  }

  /* ── 信仰页（2026-09-30 用户：「单独起一个信仰面板」）────────────────────
   * 原先信仰在主页面上只是一张小卡（#religionBox），里面孤零零一个命名输入框 ——
   * 玩家看得见框、看不见「信仰这条轴在做什么」。现在收成一个正式页签，
   * 与巢穴 / 科技 / 市政 并列。
   * ⚠️ 命名输入框**不在本函数的返回值里**：它必须留在持久节点 #religionBox
   *    （写进正文就会被每 2 秒的 PANE_REFRESH 换掉、丢焦点）。本页的静态标题与那个框
   *    都写在 index.html 的 #pane-faith 里，这里的正文写进 #pane-faith-body
   *    （renderPanes 认这个 body 容器）。
   * 门 = 完成《神学》，与资源行的 gate 同源（resUnlocked(s,'faith') ⇔ s.civics.theology），
   *    未开门时给一张说明卡而不是空白页。 */
  function paneFaith() {
    var s = res();
    if (!s || !SB.economy.resUnlocked(s, 'faith')) return paneFaithLocked();
    var h = '';
    var f = s.res.faith || 0;
    var fr = SB.economy.faithRate(s) || 0;
    var fam = SB.economy.faithAllMul(s);
    var fm = SB.economy.faithMul(s);
    var rn = (s.religionName || '').trim();
    /* 读数三件同框才叫「一条轴」：存量 / 每秒 / 它换来的全局加成。 */
    h += '<div class="row"><div><div class="nm">信仰 <b>' + SB.economy.fmtAmt(f) + '</b>' +
      (fr > 0 ? '<i class="rate up">+' + fr.toFixed(3) + '/s</i>' : '') + '</div>' +
      '<div class="ds">每个族民每秒产 ' + CFG.FAITH_PER_POP + ' 信仰，再乘神庙与政策的乘区' +
      '（现值 ×' + fm.toFixed(2) + '）。信仰不占仓储，也不会被花掉。</div></div></div>';
    h += '<div class="row"><div><div class="nm">全产加成 <b>+' +
      ((fam - 1) * 100).toFixed(0) + '%</b> <span class="tag">按存量</span></div>' +
      '<div class="ds">按信仰<b>存量</b>的对数刻度给：10 → +1%、100 → +2%、1000 → +3%……' +
      '每高一个数量级多 1%。这条加成推的是珊瑚 / 石头 / 藻食等全部资源，' +
      '但<b>不推信仰自己</b>（否则会自激）。</div></div></div>';
    h += '<div class="row"><div><div class="nm">你的信仰</div>' +
      '<div class="ds">' + (rn ? '当前名为「<b>' + rn + '</b>」，' : '尚未命名，') +
      '名字就写在上面那个框里，改名随时可改、无消耗。它会显示在顶栏的信仰资源格上。</div></div></div>';
    /* 来源与出口：说清信仰从哪来、通往哪里（轮回系统的门就是「建立宗教」）。 */
    h += '<div class="row"><div><div class="nm">信仰从哪来</div>' +
      '<div class="ds">人口是它唯一的来源（每人 ' + CFG.FAITH_PER_POP + '/s）——' +
      '养的人越多、攒得越快；神庙每级 +' +
      (((SB.BLD && SB.BLD.templeFaithRatio) || 0) * 100).toFixed(0) +
      '% 是它唯一的建筑乘区。</div></div></div>';
    return h;
  }
  function paneFaithLocked() {
    return '<div class="row"><div><div class="nm">信仰页未开启</div>' +
      '<div class="ds">信仰是第三条文明轴：族民越多、信仰攒得越快，' +
      '存量按数量级给你全局产出加成。</div></div></div>' +
      '<div class="note">完成「神学」之后这一页才打开——神学是纪元二的关键节点之一。' +
      '在那之前，顶栏也不会显示信仰这一格。</div>';
  }

  /* ── 幸福度常驻偏移量的「就地说明」（2026-10-05 用户「都补上」）──
   * 【为什么顶栏已经列了还要在各自面板再列一遍】顶栏那行给的是**汇总**（谁给了多少一目了然），
   *   但玩家是在**奇观页/政策卡页/钻机页**做决策的 —— 那一页不写「它 +1 幸福度」，
   *   他就看不出这件东西买来干什么。⇒ 汇总归顶栏、说明归各面板，两处都要有。
   * ⚠️ **唯一数据源是 economy.happyLedger 的 bonusParts**，这里只做「按 label 过滤 + 摆文字」，
   *   绝不自己算一遍偏移量 —— 重算就是第二份口径，与 tick 的 _gb 会漂。
   * ⚠️ 逐字匹配 label（'王国大交易所' 等）**要防改名漂移**：label 改了这里会静默失效
   *   （显示"该来源无效果"而不是报错）。所以找不到时**不显示这一行**、让顶栏去暴露那个变化，
   *   而不是在这里打一个自造的提示。 */
  var HAPPY_BONUS_LABELS = {
    gov: '政体', wonder: '王国大交易所', card: '政策卡', skydrill: '天穹钻机'
  };
  function happyBonusNote(s, which, sourceId) {
    /* 奇观页的提示必须绑定当前奇观；幸福度账本是汇总口径，不能把
     * 「王国大交易所」这一项的标签复用到所有已建成奇观上。 */
    if (which === 'wonder' && sourceId !== 'wonder_grand_exchange') return '';
    if (!SB.economy.happyLedger) return '';
    var L = SB.economy.happyLedger(s);
    if (!L.bonusParts || !L.bonusParts.length) return '';
    var want = HAPPY_BONUS_LABELS[which], out = [];
    for (var i = 0; i < L.bonusParts.length; i++) {
      if (L.bonusParts[i].label === want) out.push(L.bonusParts[i].v);
    }
    if (!out.length) return '';   // 这件东西此刻没给幸福度 ⇒ 不摆（别在奇观页给每座都挂一句"无效果"）
    var v = out[0];
    /* ⚠️ 措辞分方向：policy card「工业化配给」是 **−1**（压低），
     *   若统一写「抬高全产乘区档位」，玩家读到「−1 · 抬高」会以为抵消不了。 */
    return '<i class="cap">幸福度 ' + (v > 0 ? '+' : '') + (+v.toFixed(2)) +
      '（常驻，' + (v > 0 ? '抬高' : '压低') + '全产乘区档位）</i>';
  }

  function paneWonder() {
    var s = res();
    if (!s) return '';
    var L = SB.wonder ? SB.wonder.list() : [], cards = '', i, completed = 0;
    /* ⚠️ 2026-10-05 用户拍板：**未解锁的奇观不显示**（改前 14 座全列出来）。
     *   判据复用 `wonderBlocked` 的门控返回**前缀**（`/^需要先/`）——那是同文件里
     *   按钮文案区分「未解锁 / 建不起」时**已经在用**的判据（见下），不新立一套。
     *   为什么不新写 `wonderUnlocked()`：门只有一处定义（workshop.wonderBlocked），
     *   在 render 再写一份就是「同一道门写两遍」，改一处忘另一处就会门户不一致
     *   ——本仓记过多次（页签双闸就是这个形态）。
     * ⚠️【已建成的永远显示】`done` 排在过滤**之前**判：否则玩家拆了/读档后
     *   奇观从列表里消失，看不到自己建过什么。
     * ⚠️【无门奇观必须仍显示】`wonder_great_library`（大图书馆）在「通识」删除后
     *   **既无 need 也无 needCivic** ⇒ `wonderBlocked` 对它只可能返回成本不足或 null，
     *   永远不以「需要先…」开头 ⇒ 自动落在「显示」这一侧，正合需要。
     *   若这里写成「有门才显示」，大图书馆会永久消失（它那 1000 精铁本来就
     *   超基础容量，门早被 2026-09-28 删干净了）。 */
    var shown = 0;
    for (i = 0; i < L.length; i++) {
      var w = L[i];
      var done = !!(s.wonders && s.wonders[w.id]);
      var why = done ? null : SB.workshop.wonderBlocked(s, w.id);
      if (!done && why && /^需要先/.test(why)) continue;   // 未解锁 ⇒ 整行不显示
      shown++;
      if (done) completed++;
      cards += '<div class="row"' + (done ? ' data-owned="1"' : '') + '>' +
        '<div class="nm"><button type="button" class="building-name" data-wonder-info="' + w.id + '" aria-haspopup="dialog" title="查看奇观效果与建造条件">' + w.name + '</button>' + (done ? ' <span class="tag ok">已建成</span>' : '') +
        (done ? happyBonusNote(s, 'wonder', w.id) : '') + '</div>' +
        '<div class="ds">' + w.desc + '<span class="wonder-cost">建造材料：' + SB.economy.costTxt(SB.wonder ? SB.wonder.discountedCost(s, w.id) : w.cost) + '</span></div>' +
        (!done ? '<span class="wonder-state ' + (why ? 'waiting' : 'ready') + '">' + (why ? '材料不足' : '可建造') + '</span>' : '') +
        '<button class="btn' + (done || why ? '' : ' buy') + '" data-wonder="' + w.id + '"' +
        (done || why ? ' disabled' : '') + ' title="' + (why || '') + '">' +
        (function () {
          var wcost = SB.wonder ? SB.wonder.discountedCost(s, w.id) : w.cost;
          var wtxt = SB.economy.costOwnedTxt(s, wcost);
          return done ? '已建成' : why ? (/^需要先/.test(why) ? '未解锁' : '建不起 ' + wtxt) : '建成 ' + wtxt;
        })() + '</button></div>';
    }
    /* 一座都还没解锁时给一句说明，别留一个只有表头的空面板。
     *（末座奇观解锁后必然有一座可建，所以这里只在开局那段时间出现。） */
    var h = '<div class="wonder-overview"><div><small>WONDERS · 里程碑</small><h2>奇观</h2>' +
      '<p>建成后永久留存的独特建筑；名称可点开查看完整效果与条件。</p></div>' +
      '<div class="wonder-count"><b>' + completed + '<i> / </i>' + shown + '</b><small>已建成 / 已揭晓</small></div></div>' +
      '<div class="wonder-intro">奇观不会重复建造或消耗维护。石梁是当前主要建造材料，例如海潮方碑需要 20 根。</div>' +
      '<div class="wonder-grid">' + (shown ? cards : '<div class="note">还没有任何奇观向你揭开。</div>') + '</div>';
    return h;
  }

  function initTabs() {
    var tabs = document.querySelectorAll('.tab'), i;
    for (i = 0; i < tabs.length; i++) {
      tabs[i].onclick = (function (node) {
        return function () {
          if (node.dataset.tab === 'tech' && !techTabOpen()) return;
          if (node.dataset.tab === 'workshop' && !workshopTabOpen()) return;
          if (node.dataset.tab === 'meta' && !meta().shopUnlocked) return;
          /* 信仰页的门 = 神学（与 setTab 里那道是同一件事写两遍，理由同科技/市政）。
           * 走 resUnlocked 而不是直接读 s.civics.theology：门只有一处定义。 */
          if (node.dataset.tab === 'faith' &&
              !(SB.economy && SB.economy.resUnlocked(res(), 'faith'))) return;
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
    var html = '<h3>' + (o.title || '离线') + '</h3>' + (o.body || '');
    if (o.showProgress) {
      html += '<div class="prog"><i id="offPr" style="display:block;height:100%;width:0%;' +
        'background:linear-gradient(90deg,#2f9e6e,#5be3a4);border-radius:4px"></i></div>' +
        '<div id="offPct" class="note" style="margin-top:8px;color:var(--dim)"></div>';
    }
    if (o.ok) {
      html += '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
        '<button class="big" id="mOk">' + o.ok + '</button></div>';
    }
    box.innerHTML = html;
    el('modal').classList.remove('hidden'); bodyModalClass(true);
    var okBtn = el('mOk');
    if (okBtn) okBtn.onclick = function () { el('modal').classList.add('hidden'); bodyModalClass(false); if (o.onOk) o.onOk(); };
  }
  function setOfflineProgress(p) {
    var pr = el('offPr'), pct = el('offPct');
    if (pr) pr.style.width = Math.max(0, Math.min(100, p * 100)).toFixed(1) + '%';
    if (pct) pct.textContent = '已完成 ' + (p * 100).toFixed(0) + '%';
  }

  /* 2026-10-05 系统指引：页签「?」按钮点击后弹出的简介（def=定义，step=第一步）。
   * 内容覆盖全部页签（village/folk/tech/civic/faith/workshop/wonder/meta）。
   * ⚠️ 纯 UI 文案，不碰任何数值/平衡；钥匙 key 与 index.html 里 onclick="SB.ui.openIntro('KEY')" 一一对应。 */
  var INTRO = {
    village: { icon:'🏝️', ttl:'这是什么 · 巢穴',
      def:'你的居所与基础产能中心：手点采集<b>藻食</b>/<b>珊瑚</b>，建<b>住房</b>扩人口，建解锁后续系统的关键建筑（议事厅/工坊/藻场）。',
      step:'第一步：先手点「采珊瑚」攒够资源，建起礁口巢——人口上限从 1 升到 3，才有空位生人。' },
    folk: { icon:'👥', ttl:'这是什么 · 族民',
      def:'人口与职业层：族民吃<b>藻食</b>、住<b>住房</b>，被分配去采集/建造/科研等职业线，驱动各类产出。',
      step:'第一步：人口顶到上限就建更多住房；藻食见底先扩藻场，否则会饿死。' },
    tech: { icon:'🔬', ttl:'这是什么 · 科技',
      def:'文明的科技树：按纪元推进，研究项解锁<b>建筑</b>、<b>资源线</b>与后续系统；每清完一个纪元的关键节点就推进到下一纪元。',
      step:'第一步：攒够科技点，研究最左边已揭示的项；右侧暗着的是本纪元尚未到时点的科技。' },
    civic: { icon:'📜', ttl:'这是什么 · 市政',
      def:'文明的「规则层」：<b>政体</b>决定被动与卡槽配方，<b>政策卡</b>填进卡槽给即时增益，<b>市政树</b>解锁更多卡与建筑。',
      step:'第一步：先研究《法典》开启「酋邦制」政体；完成市政树条目解锁对应政策卡。' },
    faith: { icon:'🕯️', ttl:'这是什么 · 信仰',
      def:'信仰系统：研究《神学》后开放，<b>信仰点</b>（存量/速率）驱动宗教加成与鼓舞效果。',
      step:'第一步：研究《神学》开启本页；之后靠赞美/仪式累积信仰点来驱动加成。' },
    workshop: { icon:'🔨', ttl:'这是什么 · 工坊',
      def:'把原料加工成进阶物资：<b>青铜工具</b>是买断的永久增益，<b>工艺制作</b>是反复制造的产出线。',
      step:'第一步：先在「巢穴」页把工坊建起来；建成后在「青铜工具」里挑第一条线买下。' },
    wonder: { icon:'🏛️', ttl:'这是什么 · 奇观',
      def:'大型工程项目：耗巨量资源建成，给<b>全局强增益</b>或解锁终局机制（如天穹钻机）。',
      step:'第一步：攒齐奇观所需石梁/精铁等，在巢穴页动工；建成后效果全局生效。' },
    meta: { icon:'♻️', ttl:'这是什么 · 轮回商店',
      def:'跨周目成长层：<b>破壳结算</b>给轮回点，在商店换永久增益（起始／门槛／效率三类）。',
      step:'第一步：先推进到第一次破壳结算；拿到轮回点后回到本页挑最贵的「门槛减免」类。' }
  };
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
          if (infoLink.dataset.buildInfo) showBuildingInfo(infoLink.dataset.buildInfo);
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
    showBreakPanel: showBreakPanel, showBreakAnimation: showBreakAnimation, hideModal: hideModal, confirmPanel: confirmPanel,
    storyPanel: storyPanel, techTabOpen: techTabOpen, syncTabLocks: syncTabLocks,
    initTabs: initTabs, initSpeeds: initSpeeds, techGoEra: techGoEra,
    showOfflineModal: showOfflineModal, setOfflineProgress: setOfflineProgress,
    showTreeDetail: showTreeDetail,
    /* 主页面分区卡片的折叠（2026-09-30）：toggle 供 input.js 的 d.fold 委托调用，
     * applyAllFolds 供启动时按持久化状态落地。
     * 巢穴页**内**的区折叠（2026-09-30 晚）同理由 d.zfold 委托调用 —— 用的也是这一对：
     * 区别只在状态是「落成类」（外层卡片，节点持久）还是「重拼进 HTML」（页内区，会被重画）。 */
    toggleCardFold: toggleCardFold, applyAllFolds: applyAllFolds,
    toggleZoneFold: toggleZoneFold,
    setCivicView: setCivicView, toggleGovDetail: toggleGovDetail,
    setWorkshopView: setWorkshopView,
    showBuildingInfo: showBuildingInfo,
    showWonderInfo: showWonderInfo,
    showPolicyInfo: showPolicyInfo,
    showWorkshopInfo: showWorkshopInfo,
    /* ⚠️ 2026-10-05：工坊「隐藏已完成」开关的切入口。
     *   ⚠️ 切完**必须触发一次整块重画**才生效（不像 zone 折叠能直接翻节点上的类）——
     *   因为「已完成项隐不显示」是渲染时**跳过行**决定的，DOM 上没有可翻的类。
     *   调用方（input.js 委托）负责重画。 */
    toggleHideDone: toggleHideDone,
    PANE_KEYS: PANE_KEYS,
    /* ⚠️ 2026-10-05：导出 `paneWonder` 供回归直接断言「未解锁的奇观不显示」。
     *   为什么单独导它而不让 e2e 走 renderPanes：那一路是把 HTML 写进假 DOM 的
     *   innerHTML，桩元素不回填 children ⇒ 取不到 `data-wonder` 属性。
     *   门只有一处定义（workshop.wonderBlocked），这里导出的也只是**同一个渲染函数**，
     *   不是另写一份过滤逻辑。 */
    paneWonder: paneWonder,
    /* ⚠️ 2026-10-05：导出 `paneCivicGov` 供回归直接断言「未解锁的政体不显示」。
     *   与 paneWonder 同一手法：它只过滤渲染、不写第二份逻辑，门只有一处（govOwned）。 */
    paneCivicGov: paneCivicGov,
    /* ⚠️ 2026-10-05：导出 `paneMeta`（轮回商店页）供回归直接断言。
     *   【为什么要单独导它】走 renderPanes 那条路取不到属性：假 DOM 的 innerHTML
     *   不回填 children ⇒ 抓不到 `data-perk` / 等级 / 下一档价格。
     *   与 paneWonder 同一理由：导出的也只是**同一个渲染函数**，不是另写一份过滤逻辑。
     *   【它能钉住什么】新加的资源线 perk 是否真的上屏、desc 与 costs 档数是否匹配、
     *   st.next 是否是数字而不是 undefined（那类「undefined 点」的上屏事故就钉在它上面）。 */
    paneMeta: paneMeta,
    /* ⚠️ 2026-10-05：同理导出工坊三段的渲染函数，回归要直接验「未解锁不显示」。
     *   （走 renderPanes 那条路取不到属性：假 DOM 的 innerHTML 不回填 children。） */
    paneToolRows: paneToolRows, paneCraftRows: paneCraftRows, paneUpgradeRows: paneUpgradeRows,
    renderEvent: renderEvent
  };
})(typeof window !== 'undefined' ? window : globalThis);
