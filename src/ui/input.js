/* 天壳 / SHELLBREAK — 事件层
 * 全部交互走事件委托；数据变更一律调用动作函数，不在事件里直接改状态。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var E = null;

  function run() { return SB.game.run(); }
  function emit(msg) { SB.game.emit(msg); }

  function onClick(e) {
    /* 拖完松手浏览器还会补一个 click（落在起点元素上），会把「拖动长卷」当成
     * 「点了那个节点」。dragMoved 记着笔，这里吞掉那一次。
     * ⚠️ 不留残留：onPointerDown 开头会把它清掉，所以即使 click 没来（拖出容器外松手）
     *    也不会吃掉玩家的下一次真实点击。 */
    if (dragMoved) { dragMoved = false; return; }
    var t = e.target || {};
    var d = t.dataset || {};
    var s = run();
    if (!s) return;

    /* 市政 / 工坊页内的二级标签是纯视图状态；由 render 模块保留跨 2 秒重绘的选择。 */
    if (d.civicView) {
      if (SB.ui.render.setCivicView(d.civicView)) SB.ui.render.renderPanes();
      return;
    }
    if (d.workshopView) {
      if (SB.ui.render.setWorkshopView(d.workshopView)) SB.ui.render.renderPanes();
      return;
    }
    if (d.govDetail) {
      if (SB.ui.render.toggleGovDetail(d.govDetail)) SB.ui.render.renderPanes();
      return;
    }

    /* 主页面分区卡片的折叠开关（2026-09-30 用户：各个区域可折叠，参考文明6）。
     * 纯视图动作：只翻卡片元素上的 folded 类（状态记在 render 模块里、可持久化），
     * **不碰任何游戏状态**，所以不 markDirty、也不补跑科技泵。
     * ⚠️ 走 document 级委托是必须的：卡片标题会随 pane 每 2 秒的重画被换掉，
     *    挂在标题节点上的监听随第一次重画一起失效（不报错、只是点不动了）。 */
    if (d.fold !== undefined && d.fold !== null && d.fold !== '') {
      SB.ui.render.toggleCardFold(d.fold);
      return;
    }
    /* 巢穴页内「建筑分区」折叠（2026-09-30 晚，用户：「各个分区的折叠呢，没做啊」）：
     * 与上一分支同源——纯视图动作，只翻 render 模块里的 ZONE_FOLDED（并持久化），
     * **不碰游戏状态**，所以不 markDirty、也不补跑科技泵。
     * ⚠️ 与卡片折叠的差别：页内区标题所在的 HTML 每 2 秒被整块重画，状态由
     *    render.js 在重画时从 ZONE_FOLDED 重新拼出（落类会被冲掉）。 */
    if (d.zfold !== undefined && d.zfold !== null && d.zfold !== '') {
      SB.ui.render.toggleZoneFold(d.zfold);
      return;
    }
    /* 工坊「隐藏已完成」（2026-10-05 用户「工坊要能隐藏显示已经完成项目」）：
     * 同样是纯视图动作（只翻 render 模块里的 hideDone + 持久化），不碰游戏状态。
     * ⚠️ 与上面两个折叠分支的**关键差别**：卡片/区折叠是翻 DOM 上已有的类，
     *    而这个开关是「渲染时**跳不跳过这一行**」决定的 ⇒ **必须重画才生效**。
     *    忘了这次重画的话，按钮的文字会变（因为开关自身在标题行里）
     *    但列表不变 —— 看起来像只改字不生效。
     * ⚠️ 这里调 `renderPanes()` 而**不是** `renderAll()`：工坊面板写在 `#pane-workshop`，
     *    由 renderPanes 填（renderAll 只管顶栏资源与总页）。
     *    顶栏本来会跟着 2 秒节流重画，但开关要**立即**反馈，不能等。 */
    if (d.hidedone !== undefined && d.hidedone !== null && d.hidedone !== '') {
      SB.ui.render.toggleHideDone();
      SB.ui.render.renderPanes();
      return;
    }
    if (d.buildInfo) {
      SB.ui.render.showBuildingInfo(d.buildInfo);
      return;
    }
    if (d.wonderInfo) {
      SB.ui.render.showWonderInfo(d.wonderInfo);
      return;
    }
    if (d.policyInfo) {
      SB.ui.render.showPolicyInfo(d.policyInfo);
      return;
    }
    if (d.infoItem && d.infoId) {
      SB.ui.render.showWorkshopInfo(d.infoItem, d.infoId);
      return;
    }
    if (d.modalClose !== undefined) {
      SB.ui.render.hideModal();
      return;
    }
    if (t.id === 'modal' && t.classList && t.classList.contains('tree-modal')) {
      SB.ui.render.hideModal();
      return;
    }

    /* 科技树 / 市政树节点只做入口，内容和研究操作在 Civ6 式详情卡中。 */
    var treeNode = t.closest && t.closest('[data-tree-node]');
    if (treeNode) {
      SB.ui.render.showTreeDetail(treeNode.dataset.treeType, treeNode.dataset.treeId);
      return;
    }
    if (d.treeStudy) {
      var studied = false;
      if (d.treeStudy === 'tech') {
        studied = SB.habitat.study(s, d.tech, emit);
        SB.game.pumpTech(s, emit);
      } else if (d.treeStudy === 'civic') {
        studied = SB.civic.research(s, d.civic, emit);
        SB.game.pumpCivic(s, emit);
      }
      if (studied) {
        SB.ui.render.hideModal();
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }

    /* 每个动作后都补一次科技泵：尤里卡里有 built / total / job 三类，
     * 它们只被玩家动作改变。只靠循环里的 2 秒节流，点完要等一下才揭示，
     * 玩家会以为「点了没反应」。 */
    if (d.build) {
      if (SB.habitat.build(s, d.build, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
      SB.game.pumpTech(s, emit);
      return;
    }
    /* 生息区自动升级开关（2026-09-30 · 封建主义解锁2）：翻 s.autoUpg[id]。
     * 真正的「自动买级」在 game.js 在线泵的 habitat.autoTick（2 秒一拍），
     * 这里只翻开关——动作语义与状态变更分离，是本文件头那条规矩。 */
    if (d.auto) {
      s.autoUpg = s.autoUpg || {};
      s.autoUpg[d.auto] = !s.autoUpg[d.auto];
      SB.game.markDirty(); SB.game.renderAll();
      return;
    }
    /* 热泉炉「开几座」（2026-09-30 用户：「这行应该是选择开几个」）：只改**停用数**
     * `s.furnaceStop`，结算在 economy.ironFlow 读它（运行座数 = 等级 − 停用数）。
     *   data-furnace-inc = 多开一座（停用数 −1）、data-furnace-dec = 少开一座（停用数 +1），
     *   两头都夹在 [0, lv]。老档无 furnaceStop 键 ⇒ 0（全开），迁移见 state.migrateRun。
     * ⚠️ 不写 `!s.furnaceStop` 那种真值判断：0 是合法值（全开），`!0` 会把它当成「没设过」。 */
    if (d.furnaceInc || d.furnaceDec) {
      var _flv = s.lvl.furnace || 0;
      var _fstop = Math.max(0, Math.min(s.furnaceStop || 0, _flv));
      _fstop += d.furnaceDec ? 1 : -1;
      _fstop = Math.max(0, Math.min(_fstop, _flv));
      if (_fstop !== (s.furnaceStop || 0)) {
        s.furnaceStop = _fstop;
        var _frun = _flv - _fstop;
        SB.game.log('热泉炉：开 ' + _frun + '/' + _flv + ' 座' +
          (_frun === 0 ? '（停产，不再消耗金属与暖石）。' : '。'));
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    /* 热液汽轮机「开几座」（2026-10-07，与热泉炉 furnaceStop 同口径）：只改**停用数**
     * `s.turbineStop`，结算在 economy.hydroAlloc（供给）/ steelFlow（暖石扣费）读它
     * （运行座数 = 等级 − 停用数）。data-turbine-inc = 开一座（停用数 −1）、
     * data-turbine-dec = 停一座（停用数 +1），两头都夹在 [0, lv]。老档无 turbineStop 键 ⇒ 0（全开）。
     * ⚠️ 不写 `!s.turbineStop` 那种真值判断：0 是合法值（全开），`!0` 会当成「没设过」。 */
    if (d.turbineInc || d.turbineDec) {
      var _tlv = s.lvl.hydroturbine || 0;
      var _tstop = Math.max(0, Math.min(s.turbineStop || 0, _tlv));
      _tstop += d.turbineDec ? 1 : -1;
      _tstop = Math.max(0, Math.min(_tstop, _tlv));
      if (_tstop !== (s.turbineStop || 0)) {
        s.turbineStop = _tstop;
        var _trun = _tlv - _tstop;
        SB.game.log('热液汽轮机：开 ' + _trun + '/' + _tlv + ' 座' +
          (_trun === 0 ? '（停产，不再消耗暖石、不再产热液能）。' : '。'));
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    /* 热液工坊「开几座」（2026-10-07，与 furnaceStop / turbineStop 同口径）：只改**停用数**
     * `s.hydroshopStop`，结算在 economy.hydroAlloc 读它（运行座数 = 等级 − 停用数）。
     * data-shop-inc = 开一座（停用数 −1）、data-shop-dec = 停一座（停用数 +1），夹在 [0, lv]。
     * 老档无 hydroshopStop 键 ⇒ 0（全开）。工坊吃的是流（热液能），停产不省可囤资源，只把流让给天穹钻机。 */
    if (d.shopInc || d.shopDec) {
      var _slv = s.lvl.hydroshop || 0;
      var _sstop = Math.max(0, Math.min(s.hydroshopStop || 0, _slv));
      _sstop += d.shopDec ? 1 : -1;
      _sstop = Math.max(0, Math.min(_sstop, _slv));
      if (_sstop !== (s.hydroshopStop || 0)) {
        s.hydroshopStop = _sstop;
        var _srun = _slv - _sstop;
        SB.game.log('热液工坊：开 ' + _srun + '/' + _slv + ' 座' +
          (_srun === 0 ? '（停产，热液能流让给天穹钻机）。' : '。'));
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    if (d.tech) {
      if (SB.habitat.study(s, d.tech, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
      SB.game.pumpTech(s, emit);   // 关键节点全清 ⇒ 这里就进下一纪元
      return;
    }
    if (d.tool) {
      var toolModal = t.closest && t.closest('.tree-modal');
      if (SB.workshop.buy(s, d.tool, emit)) {
        if (toolModal) SB.ui.render.hideModal();
        SB.game.markDirty(); SB.game.renderAll();
      }
      SB.game.pumpTech(s, emit);
      return;
    }
    /* 工艺制作：四颗档位按钮（+1 / +25 / +100 / 100%）。
     * ⚠️ `d.craftAmt` 是**已经算好的份数**，不是按钮 id —— 档位换算
     *    （固定下限与库存百分比取大）是 workshop.stepAmt 的职责，放在这里会让
     *    「UI 层算游戏逻辑」这种断链以后没法单独回归。 */
    if (d.craft) {
      var craftModal = t.closest && t.closest('.tree-modal');
      if (SB.workshop.craft(s, d.craft, d.craftAmt, emit)) {
        if (craftModal) SB.ui.render.hideModal();
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    /* 工坊自动制作槽（2026-10-07）：`data-aslot` = 占一个槽（或改档），`data-aoff` = 腾出槽。
     * ⚠️ 这里只**翻状态**（setSlot / clearSlot），真正的「满了才造」在 game.js 在线泵的
     *    workshop.autoTick —— 与本文件里 data-auto（生息区自动升级）同一条分工。
     * ⚠️ pct 从按钮上原样带来（0.25/0.5/0.75/1），不在这里做换算：档位表只有一个来源
     *    （CFG.AUTO.PCTS），换算写在这儿就等于第二份事实。 */
    if (d.aslot) {
      var _ap = parseFloat(d.apct);
      if (SB.workshop.setSlot(s, d.aslot, _ap)) { SB.game.markDirty(); SB.game.renderAll(); }
      else SB.game.log('自动槽不够：先装「自动工坊」升级或在轮回商店买槽。');
      return;
    }
    if (d.aoff) {
      if (SB.workshop.clearSlot(s, d.aoff)) { SB.game.markDirty(); SB.game.renderAll(); }
      return;
    }
    /* 工艺升级项（2026-09-28 · era2 第三层）。⚠️ 与 `d.tool` 的区别不是文案而是**存量**：
     *   工具 → `s.tools`，升级项 → `s.upgrades`。同一件事分两个键，是为了让
     *   「这东西到底买过没有」只有一处可查（capOf 读 upgrades、产线读 tools，互不串）。
     * ⚠️ 没有补 pumpTech：升级项的门槛是科技（在 study 那一条里已经泵过了）与资源，
     *    它自己不改任何 built/job 类条件 —— 补泵等于每个点一下就多跑一次全树遍历。 */
    if (d.upgrade) {
      var upgradeModal = t.closest && t.closest('.tree-modal');
      if (SB.workshop.upgradeBuy(s, d.upgrade, emit)) {
        if (upgradeModal) SB.ui.render.hideModal();
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    if (d.wonder) {
      var wonderModal = t.closest && t.closest('.tree-modal');
      if (SB.workshop.build(s, d.wonder, emit)) {
        if (wonderModal) SB.ui.render.hideModal();
        SB.game.markDirty(); SB.game.renderAll();
      }
      SB.game.pumpTech(s, emit);
      return;
    }
    if (d.era) {
      /* 纪元导航按钮：纯视图动作 —— 切详情卡 + 把长卷滚到那一纪元的左边界。
       * 它不动任何游戏状态（纪元闸门在 tech.canStudy 里判），所以不补跑 pumpTech。
       * 已抵达的纪元才会真的滚；未来纪元的描述读得到，但滚过去只有空白，没意义。 */
      if (SB.ui.render.techGoEra(+d.era)) { SB.game.markDirty(); SB.game.renderAll(); }
      return;
    }
    if (d.warm) {
      toggleWarm(SB.game.run());
      return;
    }
    if (d.skydrill) {
      toggleSkydrill(SB.game.run());
      return;
    }
    if (d.perk) {
      if (SB.prestige.buyPerk(d.perk)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    if (d.gather) {
      /* 手动采集两条线（2026-09-26 用户要求开局两种资源都点得到）：
       *   藻食 1/次 —— 猫国 Gather catnip 的对应物；
       *   珊瑚 0.1/次 —— 只有职业产出的 1/5。这个落差是刻意的：它的作用是
       *     **开局那几十秒别让玩家对材料线完全没操作**，而不是让点珊瑚成为 Substitute
       *     职业。若把它抬到与职业同量级，珊瑚匠（UNIT.coral 0.5/s）就白设了，
       *     材料线从「雇人」退化成「手速」。参见 config.js 的 GATHER。
       * 走 addRes 而不是直接改 s.res：受仓储上限约束，也不会绕过累计台账（got）。 */
      /* ⚠️ GATHER 挂在 SB 顶层（config.js 里是 NS.GATHER，不在 CFG 里），
       *   写成 SB.CFG.GATHER 会永远取到兜底值 1 —— 珊瑚那颗按钮实际按 1 在给，
       *   数字看着对、手感全错，而且没有任何断言会红（e2e 这条断言现在直接读
       *   SB.GATHER，把两边焊在一起）。 */
      var amt = (SB.GATHER ? SB.GATHER[d.gather] : 1) || 0;
      SB.economy.addRes(s, d.gather, amt);
      SB.game.markDirty(); SB.game.renderAll();
      SB.game.pumpTech(s, emit);   // 「累计产出」是几条尤里卡的条件
      return;
    }
    if (d.job) {
      if (SB.folk.assign(s, d.job, +d.d)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      SB.game.pumpTech(s, emit);   // job 类条件（几个学者 / 几个匠人）
      return;
    }
    /* ---- 市政（2026-09-27）----
     * ⚠️ 三类动作之后都**不**补 pumpTech：市政的鼓舞条件是「建成工坊」「掌握海潮占卜」
     *    这类，它们只由建造 / 研究改变，而这两处已经各自补跑过了。
     *    反过来，**必须**补一次市政泵（pumpCivic）：研究《法典》会顺带派出政体、
     *    装填政策卡会改写产出 —— 面板上的政体块与速率就是那一帧起才对得上的。 */
    if (d.civic) {
      if (SB.civic.research(s, d.civic, emit)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      SB.game.pumpCivic(s, emit);
      return;
    }
    if (d.card) {
      if (SB.civic.setCard(s, d.card, emit)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      SB.game.pumpCivic(s, emit);
      return;
    }
    if (d.gov) {
      if (SB.civic.setGov(s, d.gov, emit)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      SB.game.pumpCivic(s, emit);
      return;
    }
    /* 点击时间事件：拾取当前活动事件（天壳震动 / 深海火喷泉 / 信仰显圣 / 潮信石）。
     * data-omen 只在 #omen 横幅里出现，与上面各动作互不相干。 */
    if (d.omen) {
      if (SB.events && SB.events.claim(s, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
      return;
    }
  }

  /* 暖石开关（保温法）。**只记账，不结算**——烧多少由 economy.tick 每个 tick 自己算，
   * 因为它得跟季节、跟库存、跟那个 dt 放在一起才算得对。这里拨了之后顶栏立刻变，
   * 但真正生效要等下一次 tick，这是对的：开关不该有「半个 tick」的效果。
   * ⚠️ 用 fire 的 dataset 传值，不走 change 事件：
   *    它是按钮不是 checkbox，玩家点的是「开/关」而不是某一瞬间的状态。 */
  function toggleWarm(s) {
    if (!s || !(s.techs && s.techs.thermal)) return false;
    s.warmOn = !s.warmOn;
    SB.game.markDirty(); SB.game.renderAll();
    SB.game.log(s.warmOn ? '暖石开关拨到「开」：减产季会烧暖石顶回一部分。' : '暖石开关已关。');
    return true;
  }

  /* ── 天穹钻机启动 / 停机（2026-10-07 用户：钻机造好之后加个启动按钮）────────
   * 闸门 = 奇观已建成（与 renderDrill 的显示条件同源：没建成这按钮根本不出现在页面上，
   * 这里再判一道防直达调用）。停摆（缺料）不回拨开关——补料后自动续转。 */
  function toggleSkydrill(s) {
    if (!s || !SB.wonder || !SB.wonder.owned(s).wonder_skydrill || s.broken) return false;
    s.skydrillOn = !s.skydrillOn;
    /* 从「停」拨到「开」的瞬间清一下停摆位：上一轮停摆的提示已经过时，
     * 下一 tick tickShell 会按真实供需重新落位。 */
    if (s.skydrillOn) s.skydrillStarved = false;
    SB.game.markDirty(); SB.game.renderAll();
    SB.game.log(s.skydrillOn ? '天穹钻机启动：共振钻头与热液能就位后开始凿壳。' : '天穹钻机已停机。');
    return true;
  }

  /* ── 长卷横向拖动 ──────────────────────────────────────────────────
   * 长卷是 overflow-x:auto 的横滚容器：手机上手指滑是原生滚动（有惯性、能回弹，
   * 别自己造一个更差的），但**桌面鼠标按住左键是拖不动的**（只有 shift+滚轮能横滚），
   * 所以这里只补「指针拖动」这一条路。
   * ⚠️ 三个坑：
   *   ① 监听只能挂在 **document** 上做委托 —— .techscroll 每次重画都被换成一个新元素，
   *      挂在容器上会随着第一次重画一起失效（不报错、只是拖不动了）。
   *   ② 触屏（pointerType === 'touch'）**故意不接管**：原生滚动的手感比手写的好，
   *      接管只会把它变成一次卡顿的自定义滚动。
   *   ③ 位移不足 DRAG_MIN 时一律不算拖动，否则「按在节点上想点它」会被判成拖。 */
  var DRAG_MIN = 5;
  var dragState = null, dragMoved = false;

  function onPointerDown(e) {
    if (e.pointerType === 'touch') return;              // 触屏交给原生滚动
    if (e.button != null && e.button !== 0) return;     // 只接左键
    dragMoved = false;                                  // 上一趟可能没等到 click
    var t = e.target;
    if (!t || !t.closest || !t.closest('.techscroll')) return;
    /* ⚠️ 容器从 closest 拿到就直接用，**不要再按 id 去 document 里取**
     *    （2026-09-27 市政树改成横卷之后踩到：市政 canvas 也带 .techscroll 类，
     *     但它的 id 是 civicScroll；按 id 取会拿到 techScroll 那个已游离的元素，
     *     于是「拖市政树」改的是科技树的滚动位置 —— 不报错，只是拖了动的是另一张图）。 */
    var box = t.closest('.techscroll');
    dragState = { x: e.clientX, box: box, left: (box ? box.scrollLeft : 0) || 0 };
    if (e.preventDefault) e.preventDefault();            // 别变成拖选文字
  }

  function onPointerMove(e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.x;
    if (!dragMoved && Math.abs(dx) < DRAG_MIN) return;
    dragMoved = true;
    /* ⚠️ 容器**每次现取**：重画会把容器换成新元素，存下来的那个已经游离了
     *    （游离元素上的 scrollLeft 写入不报错，只是动的是一张看不见的图）。
     *    先在按下那次解析的结果上试，取不到再从当前 target 解析（拖动途中面板可能重画）。 */
    var box = dragState.box;
    if ((!box || !box.isConnected) && e.target && e.target.closest) {
      box = e.target.closest('.techscroll');
      dragState.box = box;
    }
    if (box) box.scrollLeft = dragState.left - dx;
    if (e.preventDefault) e.preventDefault();   // 拖过的地方别顺手选上文字
  }

  function onPointerUp() { dragState = null; }

  function onChange(e) {
    var t = e.target || {};
    /* 宗教命名框（2026-09-29）：data-religion 的 input 在 blur/回车（change 事件）时写回名字。
     * ⚠️ 只写不重建：renderReligion 用 gate 签名节流，改名不触发重画 ⇒ 输入框焦点/内容不动。 */
    if (t.dataset && t.dataset.religion !== undefined) {
      var s = run(); if (!s) return;
      s.religionName = (t.value || '').slice(0, 16);
      SB.game.markDirty();
      SB.game.maybeReligionPopup(s);   // 写入第一个名字 = 建立宗教 ⇒ 播「轮回」弹窗
      SB.game.renderAll();
    }
  }

  function boot() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    /* 拖动：pointerup / pointercancel 只是收尾，pointermove 必须也挂在 document 上 ——
     * 玩家常把指针拖出容器再松手，只听容器的就收不到结尾，dragMoved 会卡在 true。 */
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  SB.ui = SB.ui || {};
  SB.ui.input = { boot: boot };
})(typeof window !== 'undefined' ? window : globalThis);
