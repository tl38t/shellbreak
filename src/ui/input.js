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

    /* 每个动作后都补一次科技泵：尤里卡里有 built / total / job 三类，
     * 它们只被玩家动作改变。只靠循环里的 2 秒节流，点完要等一下才揭示，
     * 玩家会以为「点了没反应」。 */
    if (d.build) {
      if (SB.habitat.build(s, d.build, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
      SB.game.pumpTech(s, emit);
      return;
    }
    if (d.tech) {
      if (SB.habitat.study(s, d.tech, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
      SB.game.pumpTech(s, emit);   // 关键节点全清 ⇒ 这里就进下一纪元
      return;
    }
    if (d.miracle) {
      /* 复选框在 click 时刻的 checked 仍是旧值——浏览器先 click 后 change。
       * 所以这里必须取反求目标态。若照原样把 s.miracleOn 传回去，等于「把它设成它现在的值」，
       * 开关永远打不开：地热只产不烧，冰壳就永远卡在 25% 那道墙上。
       * change 监听会再按真实 checked 兜一次，两边结果一致。 */
      SB.game.toggleMiracle(!(t.checked === true));
      SB.game.markDirty(); SB.game.renderAll();
      return;
    }
    if (d.tool) {
      if (SB.workshop.buy(s, d.tool, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
      SB.game.pumpTech(s, emit);
      return;
    }
    /* 工艺制作：四颗档位按钮（+1 / +25 / +100 / 100%）。
     * ⚠️ `d.craftAmt` 是**已经算好的份数**，不是按钮 id —— 档位换算
     *    （固定下限与库存百分比取大）是 workshop.stepAmt 的职责，放在这里会让
     *    「UI 层算游戏逻辑」这种断链以后没法单独回归。 */
    if (d.craft) {
      if (SB.workshop.craft(s, d.craft, d.craftAmt, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
      return;
    }
    /* 工艺升级项（2026-09-28 · era2 第三层）。⚠️ 与 `d.tool` 的区别不是文案而是**存量**：
     *   工具 → `s.tools`，升级项 → `s.upgrades`。同一件事分两个键，是为了让
     *   「这东西到底买过没有」只有一处可查（capOf 读 upgrades、产线读 tools，互不串）。
     * ⚠️ 没有补 pumpTech：升级项的门槛是科技（在 study 那一条里已经泵过了）与资源，
     *    它自己不改任何 built/job 类条件 —— 补泵等于每个点一下就多跑一次全树遍历。 */
    if (d.upgrade) {
      if (SB.workshop.upgradeBuy(s, d.upgrade, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
      return;
    }
    if (d.wonder) {
      if (SB.workshop.build(s, d.wonder, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
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
    if (d.cardclear !== undefined && d.cardclear !== null && d.cardclear !== '') {
      /* 逐槽拔下：data-cardclear 带槽位下标，走 removeCard（指定槽的收费判据在
       * civics.cardBlocked 里统一管，别在这儿另写一遍）。 */
      if (SB.civic.removeCard(s, +d.cardclear, emit)) {
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
  }

  /* 暖石开关（保温法）。**只记账，不结算**——烧多少由 economy.tick 每个 tick 自己算，
   * 因为它得跟季节、跟库存、跟那个 dt 放在一起才算得对。这里拨了之后顶栏立刻变，
   * 但真正生效要等下一次 tick，这是对的：开关不该有「半个 tick」的效果。
   * ⚠️ 与 miracleOn 一样用 fire 的 dataset 传值，不走 change 事件：
   *    它是按钮不是 checkbox，玩家点的是「开/关」而不是某一瞬间的状态。 */
  function toggleWarm(s) {
    if (!s || !(s.techs && s.techs.thermal)) return false;
    s.warmOn = !s.warmOn;
    SB.game.markDirty(); SB.game.renderAll();
    SB.game.log(s.warmOn ? '暖石开关拨到「开」：减产季会烧暖石顶回一部分。' : '暖石开关已关。');
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
    if (t.id === 'miracleToggle') {
      SB.game.toggleMiracle(t.checked);
    }
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
