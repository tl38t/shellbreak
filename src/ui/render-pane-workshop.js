/* 天壳 / SHELLBREAK — 工坊 pane 与行渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

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
   *   真要数累计产量得另记，是另一套需求，本轮不做（用户只说隐藏已完成项目）。 */
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

  /* ── 「升级项」页签的进度与未读 NEW（2026-10-17 用户）────────────────────
   * 需求原文：「工坊的升级项，要在这里展示 已完成xx项/共xx项；如果有新升级项玩家
   *          还没看过，还要显示 new」。
   *
   * 【计数口径（用户拍板）】n = 已买下的工具 + 已装填的升级项（复用 doneCount）；
   *   m = SB.TOOLS.length + SB.workshop.upgrades().length —— **全量，含还没解锁的**。
   *   写成「已完成 n / 共 m」而不是光秃秃的 n/m：这个页签里混着「职业工具」和
   *   「工坊升级」两段，标清楚才知道分母是什么。
   *
   * 【「看过」存 localStorage 而不是 s】与上面 hideDone 同一条理由，但更强：
   *   工具/升级项本身是**局内**状态（s.tools / s.upgrades），轮回会清空它们，
   *   而「这条内容我已经知道它存在了」是**跨局**的认知。跟着轮回清零的话，
   *   每开一局所有条目都会重新闪一次 NEW —— 那这个角标就废了。
   *
   * 【键带 `t:` / `u:` 前缀】工具与升级项分属两张表，id 当前不会撞（升级项统一
   *   `upg_` 前缀），但 id 表是活的：将来真撞了，不该让两件不同的东西互相把对方
   *   标成「已看过」。
   *
   * 【NEW 何时消（用户拍板：进去看完、离开页签才清）】
   *   进「升级项」：把**当时还没看过**的条目快照进 pendingNew，照着它给行打 NEW；
   *   离开它：整批落盘为已看。
   *   ⇒ render 只读、不写 seen，所以 PANE_REFRESH 每 2 秒重画也不会把行上的 NEW
   *     提前冲掉（落盘只发生在 setWorkshopView 这个显式动作里）。 */
  var SEEN_KEY = 'sb.wsSeen.v1';
  var pendingNew = null;   // 本次进入「升级项」时快照的未读条目（{ 't:id':1 }），离开时落盘

  function loadSeen() {
    var S = {};
    try {
      var raw = root.localStorage && root.localStorage.getItem(SEEN_KEY);
      var arr = raw ? JSON.parse(raw) : null;
      if (arr && arr.length) for (var i = 0; i < arr.length; i++) S[arr[i]] = 1;
    } catch (e) {}
    return S;
  }
  function saveSeen(S) {
    try {
      if (root.localStorage) root.localStorage.setItem(SEEN_KEY, JSON.stringify(Object.keys(S)));
    } catch (e) {}
  }
  /* 页签里全部条目的键：职业工具在前、工坊升级在后（与面板上的段落顺序一致）。 */
  function allItemKeys() {
    var K = [], i;
    for (i = 0; i < SB.TOOLS.length; i++) K.push('t:' + SB.TOOLS[i].id);
    var U = SB.workshop ? SB.workshop.upgrades() : [];
    for (i = 0; i < U.length; i++) K.push('u:' + U[i].id);
    return K;
  }
  function unseenCount() {
    var S = loadSeen(), K = allItemKeys(), n = 0, i;
    for (i = 0; i < K.length; i++) if (!S[K[i]]) n++;
    return n;
  }
  /* 这一行要不要打 NEW：只看本次进入页签时的快照（离开才落盘），见上面那段注。 */
  function isNewItem(kind, id) { return !!(pendingNew && pendingNew[kind + ':' + id]); }
  /* 页签上的进度文案 + 要不要 NEW 角标。
   * ⚠️ 人正在「升级项」页签上时**不画角标** —— 他正在吃这条提示，
   *    这时候还挂个 NEW 就成了「你已经看到了、但还没看到」。 */
  function upgradeTabMeta(s) {
    var done = doneCount(s);
    var total = SB.TOOLS.length + ((SB.workshop && SB.workshop.upgrades()) || []).length;
    return {
      cnt: '已完成 ' + done + ' / 共 ' + total,
      fresh: unseenCount() > 0 && workshopView !== 'upgrades'
    };
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
    var s = SB.game.run();
    if (!s || !s.lvl || !(s.lvl.workshop > 0)) return paneWorkshopLocked();
    var tm = upgradeTabMeta(s);
    var tabs = '<div class="panel-subtabs workshop-subtabs" role="group" aria-label="工坊分区">' +
      '<button type="button" class="subtab' + (workshopView === 'making' ? ' on' : '') +
      '" data-workshop-view="making" aria-pressed="' + (workshopView === 'making') + '">制造</button>' +
      '<button type="button" class="subtab' + (workshopView === 'upgrades' ? ' on' : '') +
      '" data-workshop-view="upgrades" aria-pressed="' + (workshopView === 'upgrades') + '">升级项' +
      '<span class="subcnt">' + tm.cnt + '</span>' +
      (tm.fresh ? '<span class="subnew" title="有升级项你还没看过">NEW</span>' : '') +
      '</button></div>';
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
    /* ⚠️ 快照 / 落盘**只在这两个显式切换的分支里**发生，绝不放 render 里——
     *    否则每 2 秒重画一次就等于「看一眼就算看过」，行上的 NEW 活不过一帧。 */
    if (view === 'upgrades' && workshopView !== 'upgrades') {
      var K = allItemKeys(), S = loadSeen(), i;
      pendingNew = {};
      for (i = 0; i < K.length; i++) if (!S[K[i]]) pendingNew[K[i]] = 1;
    }
    if (view !== 'upgrades' && pendingNew) {
      var S2 = loadSeen(), k;
      for (k in pendingNew) S2[k] = 1;
      saveSeen(S2);
      pendingNew = null;
    }
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
      var mul = SB.workshop.craftMul(s, c);
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
        /* MAX 档（「100%」）光写个百分比看不出到底会造多少（2026-10-16 用户）。
         * 在它后面标出**这一档实际到手的成品量** —— 数值由 workshop.stepOut 给，
         * 与 craft() 同源同取整（见该函数注）；UI 只负责拼字符串，不算游戏逻辑。
         * ⚠️ 灰态（why，材料不够）/ 造不出（amt≤0）时保持纯文案，与 +1/+25/+100 的灰态一致。 */
        var lbl = st.label;
        if (st.fixed <= 0 && amt > 0) lbl += ' →' + SB.economy.fmtAmt(SB.workshop.stepOut(s, c, st));
        h += '<button class="btn' + (why ? ' buy' : '') + '" data-craft="' + c.id + '"' +
          ' data-craft-amt="' + amt + '"' + (why ? ' disabled' : '') + '>' + lbl + '</button>';
      }
      h += '</div>' + autoSlotCtl(s, c) + '</div>';
    }
    if (!shown) return '<div class="row"><div class="nm">（还没有配方）</div></div>';
    return h + '<div class="note">四颗按钮是**同一份材料换不同份数**：+1 就是造 1 份，' +
      '+100 就是造 100 份（不是「库存的 100%」）；「100%」是把当前材料**全造完**，' +
      '按钮后面的 → 就是按当前材料与效率实际到手的成品量。效率和材料够了就更划算。</div>';
  }

  /* ── 自动制作槽控件 ────────────────────────────────────────────────
   * 有限原料：满仓后按 25/50/75/100% 转制；全无限原料：库存够玩家填写的批次数时制造。
   * ⚠️ 数字输入框放在独立弹窗，不放在 pane 内：本 pane 每 2 秒整块重画，输入会丢焦点/丢值。
   * ⚠️ 没解锁自动工坊时**整行不画**（不是画成灰按钮）：那升级项还没装，
   *    槽数就是 0，画一堆点不动的按钮等于预告一个玩家拿不到的功能。
   *    拿得到之后（slotCap > 0）才出现「＋自动」。 */
  function autoSlotCtl(s, c) {
    var cap = SB.workshop.slotCap(s);
    if (cap <= 0) return '';
    var pct = SB.workshop.slotPct(s, c.id);
    var finite = SB.workshop.hasFiniteInput(s, c);
    var batch = SB.workshop.slotBatch(s, c.id);
    var assigned = SB.workshop.slotIndexOf(s, c.id) >= 0;
    var on = finite ? pct > 0 : assigned;
    var h = '<div class="craftauto"><span class="asl">自动</span>';
    if (!on) {
      var full = !assigned && ((s.autoSlots && s.autoSlots.length) || 0) >= cap;
      h += '<button class="btn tog" data-aslot="' + c.id + '" ' + (finite ? 'data-apct="0.5"' : 'data-abatch="' + ((SB.CFG.AUTO && SB.CFG.AUTO.BATCH_DEFAULT) || 80) + '"') +
        (full ? ' disabled title="自动槽已用完（' + cap + '/' + cap + '）"' : '') + '>' +
        (full ? '槽位已满' : '＋自动') + '</button>';
    } else {
      if (finite) {
        var P = SB.workshop.pcts(), i;
        for (i = 0; i < P.length; i++) {
          var p = P[i];
          h += '<button class="btn tog' + (p === pct ? ' on' : '') + '" data-aslot="' + c.id + '"' +
            ' data-apct="' + p + '" title="本配方含有仓储上限原料；任一原料满仓后，转制当时可造量的 ' + (p * 100) + '%">' +
            (p * 100) + '%</button>';
        }
      } else {
        h += '<button class="btn tog on" data-abatch-edit="' + c.id + '"' +
          ' title="点击填写自动制造批次数">批次 ' + batch + ' 次 · 点击填写次数</button>';
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
      '含仓储上限原料（如钛）的配方：任一原料满仓后按 25 / 50 / 75 / 100% 转制；' +
      '全部原料无上限的配方：点击批次数填写数量，库存够造该数量时自动造一整批，多出的库存保留。</div>';
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
        '<div class="nm"><button type="button" class="building-name" data-info-item="tool" data-info-id="' + t.id + '" aria-haspopup="dialog">' + t.name + '</button>' + (isNewItem('t', t.id) ? ' <span class="tag new">NEW</span>' : '') + (owned ? ' <span class="tag ok">已买下</span>' : '') + '</div>' +
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
      var cost = W.upgradeCost(s, u.id);
      var ctxt = SB.economy.costOwnedTxt(s, cost);
      var label = on ? '已装上'
        : why ? (/^需要先/.test(why) ? '未解锁' : '材料不够 ' + ctxt)
          : '装上 ' + ctxt;
      h += '<div class="row"' + (on ? ' data-owned="1"' : '') + '>' +
        '<div class="nm"><button type="button" class="building-name" data-info-item="upgrade" data-info-id="' + u.id + '" aria-haspopup="dialog">' + u.name + '</button>' + (isNewItem('u', u.id) ? ' <span class="tag new">NEW</span>' : '') + (on ? ' <span class="tag ok">已装填</span>' : '') + '</div>' +
        '<div class="ds">' + u.desc + '（成本 ' + SB.economy.costTxt(cost) + '）</div>' +
        '<button class="btn' + (on || why ? '' : ' buy') + '" data-upgrade="' + u.id + '"' +
        (on || why ? ' disabled' : '') + ' title="' + (why || '') + '">' + label + '</button></div>';
    }
    if (!shown) return '<div class="row"><div class="nm">' +
      (hideDone && doneCount(s) > 0 ? '（可装的都装完了）' : '（还没有可装的升级项）') + '</div></div>';
    return h;
  }

  parts.paneWorkshop = paneWorkshop;
  parts.setWorkshopView = setWorkshopView;
  parts.toggleHideDone = toggleHideDone;
  parts.paneToolRows = paneToolRows;
  parts.paneCraftRows = paneCraftRows;
  parts.paneUpgradeRows = paneUpgradeRows;
})(typeof window !== 'undefined' ? window : globalThis);
