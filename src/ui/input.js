/* 天壳 / SHELLBREAK — 事件层
 * 全部交互走事件委托；数据变更一律调用动作函数，不在事件里直接改状态。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var E = null;
  var folkControlPointerActive = false;
  var folkControlPointerGeneration = 0;

  function run() { return SB.game.run(); }
  function emit(msg) { SB.game.emit(msg); }

  var FOLK_CONTROL_SELECTOR =
    '#pane-folk .folk-job-controls button[data-step], ' +
    '#pane-folk .folk-job-controls button[data-job], ' +
    '#pane-folk .folk-job-controls button[data-robot-job]';

  /* 族民动作仍走 document 的普通冒泡委托；只匹配三种明确的岗位动作。 */
  function handleFolkControlClick(e) {
    var target = e.target || {};
    var button = target.closest && target.closest(FOLK_CONTROL_SELECTOR);
    /* 轻量测试 DOM 没实现 closest；真实浏览器会走上面的分支。 */
    if (!button) {
      var targetData = target.dataset || {};
      if (targetData.step || targetData.job || targetData.robotJob) button = target;
    }
    if (!button) return false;

    dragMoved = false;
    folkControlPointerActive = false;
    folkControlPointerGeneration++;
    if (button.disabled) return true;
    var d = button.dataset || {};
    if (d.step) {
      SB.ui.render.cycleJobStep();
      SB.game.markDirty(); SB.game.renderAll();
      return true;
    }

    var s = run();
    if (!s) return true;
    if (d.job) {
      if (SB.folk.assign(s, d.job, +d.d)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      SB.game.pumpTech(s, emit);
      return true;
    }
    if (d.robotJob) {
      if (SB.folk.assignRobot(s, d.robotJob, +d.d)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      SB.game.pumpTech(s, emit);
    }
    return true;
  }

  function onClick(e) {
    var rawTarget = e.target || {};
    /* 拖完松手浏览器还会补一个 click（落在起点元素上），会把「拖动长卷」当成
     * 「点了那个节点」。dragMoved 记着笔，这里吞掉那一次。
     * 只吞掉落在科技树滚动区里的合成 click。指针离开滚动区后若浏览器没有合成 click，
     * 下次真实点击可能先到岗位按钮；不能把全页面下一次 click 一刀切吞掉。 */
    if (dragMoved) {
      dragMoved = false;
      if (rawTarget.closest && rawTarget.closest('.techscroll')) return;
    }
    if (handleFolkControlClick(e)) return;
    var t = rawTarget;
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

    /* 巢穴建筑图标显隐是持久化 UI 偏好，不改游戏状态；按钮在静态标题栏，列表重绘立即生效。 */
    if (d.buildingIconsToggle !== undefined) {
      SB.ui.render.toggleBuildingIcons();
      SB.ui.render.renderPanes();
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
    if (d.wonderHidedone !== undefined && d.wonderHidedone !== null && d.wonderHidedone !== '') {
      SB.ui.render.toggleWonderHideDone();
      SB.ui.render.renderPanes();
      return;
    }
    if (d.workshopTab !== undefined) {
      SB.ui.render.openWorkshopFromInfo();
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
    /* 区域建筑自动建造/升级开关：翻 s.autoUpg[id]。
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
    /* 砂矿坑「开几座」：只改停用数量 s.siltpitStop。矿坑总等级仍保留建造/升级数量，
     * 运行数 = 等级 − 停用数；矿脉加成、自动化钻探钛/铀加成与热液能消耗都读这一个数。 */
    if (d.siltpitInc || d.siltpitDec) {
      var _splv = s.lvl.siltpit || 0;
      var _spstop = Math.max(0, Math.min(_splv, Math.floor(s.siltpitStop || 0)));
      _spstop += d.siltpitDec ? 1 : -1;
      _spstop = Math.max(0, Math.min(_spstop, _splv));
      if (_spstop !== (s.siltpitStop || 0)) {
        s.siltpitStop = _spstop;
        var _sprun = _splv - _spstop;
        var _spmsg = '砂矿坑：开 ' + _sprun + '/' + _splv + ' 座';
        if (s.upgrades && s.upgrades.upg_autodrill) {
          var _sppct = _splv > 0 ? Math.round(_sprun / _splv * 100) : 0;
          _spmsg += '，自动化钻探钛/铀总产出 +' + _sppct + '%，热液能需求 ' +
            (_sprun * (SB.UNIT.drillHydro || 0.3)).toFixed(2) + '/秒';
        }
        SB.game.log(_spmsg + '。');
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    /* 工坊「开几座」：停用数量同时控制工坊自身的基础工艺效率、工业机器人加成与热液能需求。 */
    if (d.workshopInc || d.workshopDec) {
      var _wslv = s.lvl.workshop || 0;
      var _wsstop = Math.max(0, Math.min(_wslv, Math.floor(s.workshopStop || 0)));
      _wsstop += d.workshopDec ? 1 : -1;
      _wsstop = Math.max(0, Math.min(_wsstop, _wslv));
      if (_wsstop !== (s.workshopStop || 0)) {
        s.workshopStop = _wsstop;
        var _wsrun = _wslv - _wsstop;
        var _wsmsg = '工坊：开 ' + _wsrun + '/' + _wslv + ' 座';
        if (s.upgrades && s.upgrades.upg_indrobot) {
          var _wspct = _wslv > 0 ? Math.round(_wsrun / _wslv * 100) : 0;
          _wsmsg += '，工业机器人使工艺总产出 +' + _wspct + '%，热液能需求 ' +
            (_wsrun * (SB.UNIT.robotHydro || 3)).toFixed(2) + '/秒';
        }
        SB.game.log(_wsmsg + '。');
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
    /* 轨道卫星「开几座」（2026-10-17 · spec §5，与 furnaceStop / turbineStop / hydroshopStop 同口径）：
     * 只改**停用数** `s.satelliteStop`，结算在 economy.starRate 读它（运行座数 = 等级 − 停用数）。
     * data-satellite-inc = 多开一颗（停用数 −1）、data-satellite-dec = 少开一颗（停用数 +1），夹在 [0, lv]。
     * 老档无 satelliteStop 键 ⇒ 0（全开）。卫星只产星空探索（每级 +5/s），停产只停星空贡献。 */
    if (d.satelliteInc || d.satelliteDec) {
      var _satlv = s.lvl.satellite || 0;
      var _satstop = Math.max(0, Math.min(s.satelliteStop || 0, _satlv));
      _satstop += d.satelliteDec ? 1 : -1;
      _satstop = Math.max(0, Math.min(_satstop, _satlv));
      if (_satstop !== (s.satelliteStop || 0)) {
        s.satelliteStop = _satstop;
        var _satrun = _satlv - _satstop;
        SB.game.log('轨道卫星：开 ' + _satrun + '/' + _satlv + ' 颗' +
          (_satrun === 0 ? '（停产，不再贡献星空探索）。' : '。'));
        SB.game.syncSpacecraft(s);  // 星图：停几座 ⇒ 移除对应在轨航天器
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    /* 空间站「开几座」（2026-10-17 · spec §5，与 satelliteStop 同口径）：只改**停用数**
     * `s.spacestationStop`，结算在 economy.starRate（星空产出）与 economy.hydroAlloc（每级耗 2 热液能/秒）两处
     * （运行座数 = 等级 − 停用数）。data-spacestation-inc = 开一座（停用数 −1）、
     * data-spacestation-dec = 停一座（停用数 +1），夹在 [0, lv]。老档无此键 ⇒ 0（全开）。 */
    if (d.spacestationInc || d.spacestationDec) {
      var _stlv = s.lvl.spacestation || 0;
      var _ststop = Math.max(0, Math.min(s.spacestationStop || 0, _stlv));
      _ststop += d.spacestationDec ? 1 : -1;
      _ststop = Math.max(0, Math.min(_ststop, _stlv));
      if (_ststop !== (s.spacestationStop || 0)) {
        s.spacestationStop = _ststop;
        var _strun = _stlv - _ststop;
        SB.game.log('空间站：开 ' + _strun + '/' + _stlv + ' 座' +
          (_strun === 0 ? '（停产，不再贡献星空探索、不再消耗热液能）。' : '。'));
        SB.game.syncSpacecraft(s);  // 星图：停几座 ⇒ 移除对应在轨航天器
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    /* ERA8 生物材料研究所「开几座」：停用座数同时控制四种原料、θ产出与热液能需求。 */
    if (d.biomatlabInc || d.biomatlabDec) {
      var _blv = s.lvl.biomatlab || 0;
      var _bstop = Math.max(0, Math.min(s.biomatlabStop || 0, _blv));
      _bstop += d.biomatlabDec ? 1 : -1;
      _bstop = Math.max(0, Math.min(_bstop, _blv));
      if (_bstop !== (s.biomatlabStop || 0)) {
        s.biomatlabStop = _bstop;
        var _brun = _blv - _bstop;
        SB.game.log('生物材料研究所：开 ' + _brun + '/' + _blv + ' 座' +
          (_brun === 0 ? '（停产，不再消耗原料与热液能）。' : '。'));
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
    var batchEdit = t.closest && t.closest('[data-abatch-edit]');
    if (batchEdit) {
      SB.ui.render.openAutoBatchDialog(batchEdit.dataset.abatchEdit);
      return;
    }
    /* 工坊自动制作槽：`data-aslot` = 占槽 / 选满仓档，`data-abatch` = 含无上限原料配方的批次数，
     * `data-apct` = 全部原料有上限时的满仓转制比例，`data-aoff` = 腾出槽。
     * ⚠️ 这里只**翻状态**（setSlot / setSlotBatch / clearSlot），真正制造在 game.js 在线泵的
     *    workshop.autoTick —— 与本文件里 data-auto（生息区自动升级）同一条分工。
     * ⚠️ 新增无上限配方时使用默认批次；后续修改走独立数字弹窗，不在被定时重画的 pane 内输入。 */
    if (d.aslot) {
      var _saved = d.abatch !== undefined
        ? SB.workshop.setSlotBatch(s, d.aslot, parseInt(d.abatch, 10))
        : SB.workshop.setSlot(s, d.aslot, parseFloat(d.apct));
      if (_saved) { SB.game.markDirty(); SB.game.renderAll(); }
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
    var civicEraTarget = d.civicEra !== undefined ? t : (t.closest && t.closest('.civic-erabtn[data-civic-era]'));
    var civicEraValue = civicEraTarget && civicEraTarget.dataset ? civicEraTarget.dataset.civicEra : undefined;
    if (civicEraValue !== undefined) {
      if (SB.ui.render.civicGoEra(+civicEraValue)) { SB.game.markDirty(); SB.game.renderAll(); }
      return;
    }
    /* ⚠️ 2026-10-20 真 bug（用户「手动采集珊瑚没反应」）：这里原先是裸的
     *   `t.closest('[data-era]')` —— 任何**祖先**带 data-era 就会被当成点了纪元按钮。
     *   而「页面材质随纪元」把 `data-era` 写在了 `<html>` 根元素上（render.js applyEraSkin，
     *   CSS 见 70-era-skins.css 的 :root[data-era]）⇒ 从任何按钮往上找，第一个命中的
     *   永远是根元素 ⇒ 本分支 return，**排在它后面的所有分支全部变成死代码**：
     *   采集(gather)、一键最大/最小(jobmax/jobmin)、市政研究(civic)、政策卡装填/卸下(slot/remove)、
     *   暖石(warm)、天穹钻机/地热(geek)、发射场模式(launchMode)、自动研究、挑战、购增益(perk)……
     *   症状是「点了完全没反应、日志不报错、控制台零异常」——静默吞点击，最难查的一类。
     *   修法：判定收到**真正的控件**上（`.erabtn` 只由 render-pane-research.eraNav 产出），
     *   而不是「祖先里有没有这个属性」。皮肤属性因此可以继续挂在根元素上，两边不再撞名。
     *   ⚠️ 别再退回宽判定：`[data-era]` 这种「祖先特征」判据，只要哪天有别的模块把同名
     *      属性挂到 body/html，就会重演同一次全站静默失联。 */
    var eraTarget = d.era !== undefined ? t : (t.closest && t.closest('.erabtn[data-era]'));
    var eraValue = eraTarget && eraTarget.dataset ? eraTarget.dataset.era : undefined;
    if (eraValue !== undefined) {
      /* 纪元导航按钮：纯视图动作 —— 切详情卡 + 把长卷滚到那一纪元的左边界。
       * 它不动任何游戏状态（纪元闸门在 tech.canStudy 里判），所以不补跑 pumpTech。
       * 已抵达的纪元才会真的滚；未来纪元的描述读得到，但滚过去只有空白，没意义。 */
      if (SB.ui.render.techGoEra(+eraValue)) { SB.game.markDirty(); SB.game.renderAll(); }
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
    if (d.geek) {
      toggleGeek(SB.game.run());
      return;
    }
    /* ERA10（2026-10-20）：欧罗巴冰面发射场制造模式切换（太阳帆 ⇄ 戴森球节点）。
     * 闸门 = 建成发射场且完成《绝热材料》（与 render-pane-village 的按钮显示条件同源）。
     * 只改 s.launchMode 一个字段，结算在 economy-tick 2f 读——切换的下一 tick 生效。 */
    if (d.launchMode) {
      toggleLaunchMode(SB.game.run());
      return;
    }
    /* 三座发射场分别「开几级」：停用数只影响本场耗材、热液能与批次发射量，
     * 本场周期余数保留；全部停用时本场进度暂停。data-launch-dec 停一级，inc 开一级。 */
    if (d.launchInc || d.launchDec) {
      var _launchId = d.launchInc || d.launchDec;
      var _launchDef = SB.habitat && SB.habitat.buildingById ? SB.habitat.buildingById(_launchId) : null;
      if (!_launchDef || !_launchDef.launchpad) return;
      var _launchTotal = Math.max(0, Math.floor((s.lvl && s.lvl[_launchId]) || 0));
      s.launchStops = s.launchStops || {};
      var _launchStop = Math.max(0, Math.min(_launchTotal, Math.floor(s.launchStops[_launchId] || 0)));
      _launchStop += d.launchDec ? 1 : -1;
      _launchStop = Math.max(0, Math.min(_launchTotal, _launchStop));
      if (_launchStop !== (s.launchStops[_launchId] || 0)) {
        s.launchStops[_launchId] = _launchStop;
        var _launchRun = _launchTotal - _launchStop;
        SB.game.log(_launchDef.name + '：开 ' + _launchRun + '/' + _launchTotal + ' 级' +
          (_launchRun === 0 ? '（本场暂停，周期进度保留）。' : '。'));
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    if (d.companyClose) {
      /* data-company-close="kelp" ⇒ d.companyClose === 'kelp'：只解散这一家。 */
      if (SB.closeCompany && SB.closeCompany(SB.game.run(), d.companyClose)) {
        SB.game.markDirty(); SB.game.renderAll();
        SB.game.log('已关闭 ' + d.companyClose + ' 公司：其产出加成与奢侈品消耗加成停止，其他公司不受影响。');
      }
      return;
    }
    if (d.companyRebuild) {
      /* data-company-rebuild="coral" ⇒ d.companyRebuild === 'coral'：只重建这一家。 */
      if (SB.rebuildCompany && SB.rebuildCompany(SB.game.run(), d.companyRebuild)) {
        SB.game.markDirty(); SB.game.renderAll();
        SB.game.log('已重建 ' + d.companyRebuild + ' 公司：从乡镇企业重新开始成长。');
      }
      return;
    }
    if (d.autoResearch) {
      var autoState = SB.prestige.toggleAutoResearch(d.autoResearch);
      if (autoState !== null) {
        SB.game.markDirty(); SB.game.renderAll();
        SB.game.log((d.autoResearch === 'tech' ? '科技' : '市政') + '自动研究已' + (autoState ? '开启' : '关闭') + '。');
      }
      return;
    }
    if (d.perk) {
      if (SB.prestige.buyPerk(d.perk)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    if (d.starPerk) {
      if (SB.prestige.buyStarPerk(d.starPerk)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    if (d.starExchange) {
      var exchanged = d.starExchange === 'tide-to-stardust'
        ? SB.prestige.exchangeTideForStardust()
        : d.starExchange === 'stardust-to-tide' ? SB.prestige.exchangeStardustForTide() : false;
      if (exchanged) { SB.game.markDirty(); SB.game.renderAll(); }
      return;
    }
    if (d.challengeStart) {
      if (SB.challenges && SB.challenges.prepareStart(d.challengeStart)) return;
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
    if (d.jobmax) {
      /* 一键最大：把所有闲置族民塞进该职业（受 jobUnlocked 门控）。 */
      if (SB.folk.assignMax(s, d.jobmax)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      SB.game.pumpTech(s, emit);   // job 类条件（几个学者 / 几个匠人）
      return;
    }
    if (d.jobmin) {
      /* 一键最小：把该职业清零（退回闲置）。 */
      if (SB.folk.assignMin(s, d.jobmin)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      SB.game.pumpTech(s, emit);
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
    /* 政策卡「卸下」：点槽格里的「卸下」按钮（data-remove = 槽号，仅槽里有卡时出现）。
     * ⚠️ 必须在 slotBox 分支之前拦截——卸下按钮是槽格 <div data-slot> 的子元素，
     *   点它会被 t.closest('[data-slot]') 一并命中，不先拦就会走成「装卡」逻辑。
     * 费用按当前模型由 removeCard → setCardAt 在卸下时扣（装填免费、卸下收费）。 */
    if (d.remove !== undefined && d.remove !== null && d.remove !== '') {
      var _rSlot = +d.remove;
      if (SB.civic.removeCard(s, _rSlot, emit)) {
        SB.game.markDirty(); SB.game.renderAll();
      } else {
        var _rWhy = SB.civic.cardBlocked(s, null, _rSlot);
        SB.game.log('政策卡卸下失败：' + (_rWhy || '该槽是空的，无需卸下'));
      }
      SB.game.pumpCivic(s, emit);
      return;
    }
    /* 政策卡「点卡→点槽」两步选位（2026-10-13）：先点池里一张卡（d.card → 选中/取消），
     * 再点高亮的卡槽（data-slot）把 armed 卡装入该格（setCard 的 slot 参数走手动选槽）。
     * 类型不对或越界 ⇒ setCard 拒绝（返回 false），提示换个槽；已装在别的槽里也拒绝（不搬槽）。 */
    var slotBox = t.closest && t.closest('[data-slot]');
    if (slotBox && slotBox.dataset && slotBox.dataset.slot !== undefined) {
      var _cid = SB.ui.render.armedCard();
      if (_cid) {
        if (SB.civic.setCard(s, _cid, emit, +slotBox.dataset.slot)) {
          SB.ui.render.disarmCard();
          SB.game.markDirty(); SB.game.renderAll();
        } else {
          SB.game.log('这张卡装不进这个槽（类型不对、越界，或已装在别的槽里）。');
        }
      } else {
        SB.game.log('先点池里一张政策卡选中它，再点这里安装。');
      }
      SB.game.pumpCivic(s, emit);
      return;
    }
    if (d.card) {
      /* 2026-10-13 两步选位：点卡 = 选中/取消选中（render 模块级 armedCard），
       * 真正落槽由点高亮槽触发；再点同一张卡 = 取消选中。 */
      var _armedNow = SB.ui.render.armedCard();
      if (_armedNow === d.card) SB.ui.render.disarmCard();
      else SB.ui.render.armCard(d.card);
      SB.game.renderAll();
      return;
    }
    if (d.gov) {
      if (SB.civic.setGov(s, d.gov, emit)) {
        SB.game.markDirty(); SB.game.renderAll();
      } else {
        /* 2026-10-14：换政体失败（没解锁 / 市政点不够）时给一句理由，
         * 否则按钮静默无反应，玩家以为「政体没法改」却不知是差市政点。 */
        var _gw = SB.civic.govBlocked(s, d.gov);
        if (_gw) SB.game.log('政体没法换：' + _gw);
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
    if (!s || !SB.wonder || !SB.wonder.owned(s).wonder_skydrill || SB.wonder.skydrillPostBreak(s)) return false;
    s.skydrillOn = !s.skydrillOn;
    /* 从「停」拨到「开」的瞬间清一下停摆位：上一轮停摆的提示已经过时，
     * 下一 tick tickShell 会按真实供需重新落位。 */
    if (s.skydrillOn) s.skydrillStarved = false;
    SB.game.markDirty(); SB.game.renderAll();
    SB.game.log(s.skydrillOn ? '天穹钻机启动：共振钻头与热液能就位后开始凿壳。' : '天穹钻机已停机。');
    return true;
  }

  /* ── 星球重构机 G.E.E.K 启动 / 停机（ERA9 · 生态重塑解锁奇观，2026-10-19 实装）──
   * 闸门 = 奇观已建成（与 renderGeek 的显示条件同源：没建成这按钮不出现在页面上，这里再判一道防直达调用）。
   * 停摆（缺料）不回拨开关——补料后自动续转。运行态不加幸福度 −1（用户拍板）。 */
  function toggleGeek(s) {
    if (!s || !SB.wonder || !SB.wonder.owned(s).wonder_geek) return false;
    if (!s.geek) s.geek = { geekOn: false };
    s.geek.geekOn = !s.geek.geekOn;
    /* 从「停」拨到「开」的瞬间清一下停摆位：下一 tick tickShell 会按真实供需重新落位。 */
    if (s.geek.geekOn) s.geekStarved = false;
    SB.game.markDirty(); SB.game.renderAll();
    SB.game.log(s.geek.geekOn ? '星球重构机 G.E.E.K 启动：改造恩克拉多斯星……' : '星球重构机 G.E.E.K 已停机。');
    return true;
  }

  /* ── ERA10（2026-10-20）：欧罗巴冰面发射场制造模式切换 ──────────────
   * 用户 ERA10 表「绝热材料」解锁1。闸门 = 发射场已建成（lv>0）且完成《绝热材料》
   * （与 render-pane-village 的 elBtn 显示条件、economy-tick 2f 的 _nodeMode 三处同源）。
   * 只翻 s.launchMode（'sail' ⇄ 'node'）——耗料/产出/进度全在 tick 读这一个字段。 */
  function toggleLaunchMode(s) {
    /* ERA10 市政（2026-10-20）：判据从 s.lvl.europa_launch>0 换成 launchLvl>0——
     * 泰拉/瑞亚星发射场建好后同一个钮也生效（三座共用 s.launchMode，同一套制造体系）。 */
    if (!s || !(SB.economy && SB.economy.launchLvl && SB.economy.launchLvl(s) > 0)) return false;
    if (!(s.techs && s.techs.adiabatic)) return false;
    var node = s.launchMode === 'node';
    s.launchMode = node ? 'sail' : 'node';
    SB.game.markDirty(); SB.game.renderAll();
    SB.game.log(node
      ? '发射场已切回太阳帆模式：每级每秒耗铀 0.5、强工质火箭引擎 0.3、θ金属自适应薄膜 0.3、热液能 4；每座发射场每 ' + (SB.economy.launchCycleOf ? SB.economy.launchCycleOf(s) : 10) + 's 发射该场等级数量的太阳帆。'
      : '发射场已切换到戴森球节点模式：每级每秒耗铀 5、强工质火箭引擎 3、θ金属自适应薄膜 3、钛合金板 30、热液能 4；每座发射场每个周期发射该场等级数量的节点。');
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
    var t = e.target;
    folkControlPointerActive = !!(t && t.closest && t.closest('#pane-folk .folk-job-controls button'));
    /* 每次新指针操作都清掉上次树图拖动标记。触屏不接管拖动，但仍要清标记；
     * 否则上一次拖出页面且没有合成 click 时，后续触屏点击会被 onClick 当成拖动吞掉。 */
    dragMoved = false;
    folkControlPointerGeneration++;
    if (e.pointerType === 'touch') return;              // 触屏交给原生滚动
    if (e.button != null && e.button !== 0) return;     // 只接左键
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

  function onPointerUp() {
    dragState = null;
    /* 若 pointercancel 或浏览器没有合成 click，下一任务也要解除保护。延迟到当前输入序列结束，
     * 让 pointerup 与 click 之间排队的定时重画仍暂缓替换岗位按钮。 */
    if (folkControlPointerActive) {
      var generation = folkControlPointerGeneration;
      root.setTimeout(function () {
        if (generation === folkControlPointerGeneration) folkControlPointerActive = false;
      }, 120);
    }
  }

  function isFolkControlPointerActive() { return folkControlPointerActive; }

  function onChange(e) {
    var t = e.target || {};
    /* 宗教命名框（2026-09-29）：data-religion 的 input 在 blur/回车（change 事件）时写回名字。
     * ⚠️ 只写不重建：renderReligion 用 gate 签名节流，改名不触发重画 ⇒ 输入框焦点/内容不动。 */
    if (t.dataset && t.dataset.religion !== undefined) {
      var s = run(); if (!s) return;
      /* ERA9 虚境信仰卡装填后信仰名锁死（覆盖并锁死），禁写回玩家自定义名。 */
      if (SB.civic && SB.civic.faithNameLocked && SB.civic.faithNameLocked(s)) return;
      s.religionName = (t.value || '').slice(0, 16);
      SB.game.markDirty();
      SB.game.maybeReligionPopup(s);   // 写入第一个名字 = 建立宗教 ⇒ 播「轮回」弹窗
      SB.game.renderAll();
    }
    /* 聚落命名框（2026-10-17 · ERA6+）：data-habitat 的 input 在 blur/回车（change 事件）时写回名字。
     * ⚠️ 只写不重建：renderHabitatName 用签名节流，改名不触发重画 ⇒ 输入框焦点/内容不动。
     *   本轮回有效，轮回重置（freshRun 把 habitatName 归 ''）。 */
    if (t.dataset && t.dataset.habitat !== undefined) {
      var s2 = run(); if (!s2) return;
      s2.habitatName = (t.value || '').slice(0, 16);
      SB.game.markDirty();
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
  SB.ui.input = {
    /* ⚠️ 2026-10-21 修复：导出表里曾残留 toggleIndRobot —— 工业机器人已从「全局开关 indRobotOn」
     *   重构为「按建筑停用数 workshopStop + industrialRobotOutputMul」（economy.js:1225/1230），
     *   函数本体已删、导出却还引用 ⇒ IIFE 末尾 ReferenceError ⇒ SB.ui.input 整块没赋上值 ⇒
     *   main.js:10 `SB.ui.input.boot()` 跟着崩 ⇒ 页面只剩空壳（资源/巢穴面板全空）。 */
    boot: boot, toggleSkydrill: toggleSkydrill, toggleGeek: toggleGeek,
    toggleLaunchMode: toggleLaunchMode,
    isFolkControlPointerActive: isFolkControlPointerActive
  };
})(typeof window !== 'undefined' ? window : globalThis);
