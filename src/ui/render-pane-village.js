/* 天壳 / SHELLBREAK — 巢穴 pane 渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});
  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || fallback || '';
  }
  function buildingName(id, fallback) {
    return SB.i18n && SB.i18n.buildingName ? SB.i18n.buildingName(id, fallback) : fallback;
  }
  function zoneName(id, fallback) {
    return SB.i18n && SB.i18n.zoneName ? SB.i18n.zoneName(id, fallback) : fallback;
  }
  function resourceName(id, fallback) {
    return SB.i18n && SB.i18n.resourceName ? SB.i18n.resourceName(id, fallback) : fallback;
  }
  function htmlText(value) {
    return String(value == null ? '' : value).replace(/[&<>\"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function launchProgressPct(s, buildingId) {
    if (!s || !SB.economy || !SB.economy.launchCycleOf) return 0;
    var cycle = SB.economy.launchCycleOf(s);
    if (!(cycle > 0)) return 0;
    var nodeMode = SB.economy.launchNodeMode ? SB.economy.launchNodeMode(s) : false;
    var proc = Number(SB.economy.launchProcOf ? SB.economy.launchProcOf(s, buildingId, nodeMode) : 0);
    if (!isFinite(proc) || proc < 0) proc = 0;
    return Math.max(0, Math.min(100, Math.floor(((proc % cycle) / cycle) * 100)));
  }

  /* renderTick 每帧调用；每条只读本发射场计数器，并在整数百分比变化时改两处 DOM，
   * 不重画建筑列表，也不另开定时器。满发后的计时余数由结算逻辑清零/保留。 */
  function refreshLaunchProgress(s) {
    var pane = typeof document !== 'undefined' && document.getElementById('pane-village');
    if (!pane || !pane.querySelectorAll) return;
    var bars = pane.querySelectorAll('[data-launch-progress]');
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i], id = bar.getAttribute('data-launch-progress');
      var pct = launchProgressPct(s, id), stamp = String(pct);
      if (bar.getAttribute('data-pct') === stamp) continue;
      bar.setAttribute('data-pct', stamp);
      bar.setAttribute('aria-valuenow', stamp);
      var fill = bar.querySelector('.launch-progress-track i');
      if (fill) fill.style.width = stamp + '%';
      var value = bar.querySelector('.launch-progress-value');
      if (value && value.textContent !== stamp + '%') value.textContent = stamp + '%';
    }
  }

  var VILLAGE_FILTER_ALLOWED = ['all', 'ready', 'running'];
  var VILLAGE_DENSITY_ALLOWED = ['detail', 'compact'];
  var villageFilterFallback = 'all';
  var villageDensityFallback = 'detail';
  function getVillageFilter() {
    var S = SB.store;
    if (S && S.prefGetStr) return S.prefGetStr('village.filter', VILLAGE_FILTER_ALLOWED, 'all');
    return villageFilterFallback;
  }
  function setVillageFilter(val) {
    if (VILLAGE_FILTER_ALLOWED.indexOf(val) < 0) return false;
    villageFilterFallback = val;
    var S = SB.store;
    if (S && S.prefSetStr) S.prefSetStr('village.filter', val, VILLAGE_FILTER_ALLOWED);
    paintVillageToolbar();
    return true;
  }
  function getVillageDensity() {
    var S = SB.store;
    if (S && S.prefGetStr) return S.prefGetStr('village.density', VILLAGE_DENSITY_ALLOWED, 'detail');
    return villageDensityFallback;
  }
  function paintVillageToolbar() {
    var pane = root.document && root.document.getElementById('pane-village');
    if (!pane) return;
    var filter = getVillageFilter(), density = getVillageDensity();
    pane.setAttribute('data-build-filter', filter);
    pane.classList.toggle('is-compact', density === 'compact');
    var buttons = root.document.querySelectorAll('[data-village-filter],[data-village-density]');
    for (var i = 0; i < buttons.length; i++) {
      var data = buttons[i].dataset;
      buttons[i].setAttribute('aria-pressed', String(data.villageFilter === filter || data.villageDensity === density));
    }
  }
  function setVillageDensity(val) {
    if (VILLAGE_DENSITY_ALLOWED.indexOf(val) < 0) return false;
    villageDensityFallback = val;
    var S = SB.store;
    if (S && S.prefSetStr) S.prefSetStr('village.density', val, VILLAGE_DENSITY_ALLOWED);
    paintVillageToolbar();
    return true;
  }

  var manualGatherExpanded = null;
  function isManualGatherCollapsed(s) {
    var rate = (s && s.perk && s.perk.autoClick) || 0;
    return manualGatherExpanded === null ? (rate > 0) : !manualGatherExpanded;
  }
  function toggleManualGatherFold() {
    var s = (SB.game && SB.game.run) ? SB.game.run() : null;
    manualGatherExpanded = isManualGatherCollapsed(s);
    return manualGatherExpanded;
  }
  function resetManualGatherFold() { manualGatherExpanded = null; }
  function manualGatherFoldState() {
    return manualGatherExpanded === null ? 'a' : (manualGatherExpanded ? 'e' : 'c');
  }

  function paneVillage() {
    var s = SB.game.run(); let h = '';
    var buildingIconsShown = !!(SB.ui.render && SB.ui.render.buildingIconsShown && SB.ui.render.buildingIconsShown());
    /* 按钮读数和实际采集收入共用 SB.GATHER。 */
    var GA = SB.GATHER || { kelp: 1, coral: 1 };
    /* 自动点击暂停时保留静态角标，让玩家能区分暂停和未解锁。 */
    var _acRate = (s.perk && s.perk.autoClick) || 0;
    var _acOn = _acRate > 0 && !(s.autoClickOn === false);
    var _acTag = _acRate <= 0 ? ''
      : (_acOn
        ? '<span class="auto-click-tag" title="' + htmlText(tr('village.auto_click.active.tooltip', null, '轮回商店「潮讯自拾」：自动替你点这两个按钮，不随游戏倍速放大。可在 ⚙ 设置 → 自动 里暂停')) + '">' +
          htmlText(tr('village.auto_click.active.status', { clicksPerSecond: _acRate }, '自动点击中 · ' + _acRate + ' 次/秒')) + '</span>'
        : '<span class="auto-click-tag is-off" title="' + htmlText(tr('village.auto_click.paused.tooltip', null, '已在 ⚙ 设置 → 自动 里暂停；手动点这两个按钮不受影响')) + '">' +
          htmlText(tr('village.auto_click.paused.status', null, '自动点击已暂停')) + '</span>');
    var _gatherCollapsed = isManualGatherCollapsed(s);
    if (_gatherCollapsed) {
      h += '<div class="row gather-row is-collapsed">' +
        '<div class="gather-collapsed-head">' +
          '<div class="nm">' + htmlText(tr('village.gather.manual.heading', null, '手动采集')) + _acTag + '</div>' +
          '<span class="gather-collapsed-note">' + htmlText(tr('village.gather.collapsed_hint', null, '已解锁自动采集，手动入口默认收起')) + '</span>' +
        '</div>' +
        '<button type="button" class="btn gather-fold-btn" data-gather-fold="1" aria-expanded="false">' +
          htmlText(tr('village.gather.expand', null, '展开 ▾')) + '</button>' +
        '</div>';
    } else {
      var startupPopulation = SB.challenges && SB.challenges.startingPopulation ? SB.challenges.startingPopulation() : SB.CFG.POP_START;
      var nestBuilding = SB.habitat.buildingById('nest') || {};
      var kelpBuilding = SB.habitat.buildingById('kelp') || {};
      var coralCost = nestBuilding.cost && nestBuilding.cost.coral || 0;
      var kelpCost = kelpBuilding.cost && kelpBuilding.cost.kelp || 0;
      /* 教程按开局住房和挑战奖励计算人口上限。后来建成的住房只影响当前人口上限。 */
      var startingCap = (SB.BLD.houseBase || 0) + (startupPopulation - SB.CFG.POP_START);
      var startupHint = tr('village.startup.housing_food_hint', {
        startingPopulation: startupPopulation, passiveIncome: 0, coralCost: coralCost,
        oldPopulationCap: startingCap, newPopulationCap: startingCap + (SB.BLD.house || 0), kelpCost: kelpCost
      }, '开局 ' + startupPopulation + ' 人、0 自动收入，靠这个起步：先攒 5 珊瑚盖起礁口巢（人口上限 ' +
        startingCap + ' → ' + (startingCap + (SB.BLD.house || 0)) + '），再攒 15 藻食建深海菌圃让口粮跟上。');
      var growthHint = tr('village.population.growth.kelp_threshold', { kelpThreshold: SB.CFG.GROW_KEEP },
        '人口要涨得同时满足两条：住房没住满，且藻食高于 ' + SB.CFG.GROW_KEEP + '（低于此值会一直停摆）。');
      var _foldBtn = _acRate > 0
        ? '<button type="button" class="btn gather-fold-btn" data-gather-fold="1" aria-expanded="true">' +
          htmlText(tr('village.gather.collapse', null, '收起 ▴')) + '</button>'
        : '';
      h += '<div class="row gather-row"><div><div class="nm">' + htmlText(tr('village.gather.manual.heading', null, '手动采集')) + _acTag + _foldBtn + '</div>' +
        '<div class="ds">' + htmlText(startupHint) +
        '<b>' + htmlText(growthHint) + '</b></div></div>' +
        '<div class="gather-btns">' +
        '<button class="btn buy" data-gather="kelp">' + htmlText(tr('village.gather.kelp.button', { gatherAmount: GA.kelp }, '采藻食 +' + GA.kelp)) + '</button>' +
        '<button class="btn buy" data-gather="coral">' + htmlText(tr('village.gather.coral.button', { gatherAmount: GA.coral }, '采珊瑚 +' + GA.coral)) + '</button>' +
        '</div></div>';
    }

    /* 空分区随建筑解锁显示。运行耗材的种类与信息卡共用 consumeMeta。 */
    h += '<div class="pane-toolbar" role="toolbar" aria-label="' + htmlText(tr('village.toolbar.aria_label', null, '建筑筛选与视图')) + '">' +
      '<div class="pane-filter-group">' +
        '<button type="button" class="pane-pill" data-village-filter="all">' + htmlText(tr('village.filter.all', null, '全部')) + '</button>' +
        '<button type="button" class="pane-pill" data-village-filter="ready">' + htmlText(tr('village.filter.ready', null, '可建造')) + '</button>' +
        '<button type="button" class="pane-pill" data-village-filter="running">' + htmlText(tr('village.filter.running', null, '运转中')) + '</button>' +
      '</div>' +
      '<div class="pane-density-group">' +
        '<button type="button" class="pane-pill" data-village-density="detail">' + htmlText(tr('village.density.detail', null, '详细')) + '</button>' +
        '<button type="button" class="pane-pill" data-village-density="compact">' + htmlText(tr('village.density.compact', null, '简洁')) + '</button>' +
      '</div>' +
    '</div>';
    var totalShown = 0, anyOwned = false, anyReady = false;
    for (var zi = 0; zi < (SB.BUILD_ZONES || []).length; zi++) {
      var z = SB.BUILD_ZONES[zi];
      var zRows = '';
      var zShown = 0, zoneOwned = false, zoneReady = false;
      for (var i = 0; i < SB.BUILDINGS.length; i++) {
        var b = SB.BUILDINGS[i];
        if (b.zone !== z.id) continue;
        /* 建筑首次解锁后记入 s.seen。花掉库存后仍显示已揭示的建筑。 */
        var lv = s.lvl[b.id] || 0;
        if (SB.habitat.retired && SB.habitat.retired(s, b)) continue;
        if (!(s.seen && s.seen[b.id])) {
          if (SB.habitat.unlocked(s, b)) SB.habitat.reveal(s, b);
          else if (lv <= 0) continue;
        }
        var c = SB.economy.costOf(s, b.id);
        var ok = SB.economy.canAfford(s, c);
        var blocked = !SB.habitat.needMet(s, b);
        var canalCap = b.id === 'canal' && (s.lvl.canal || 0) >= (s.lvl.lighthouse || 0);
        var maxReached = !!(b.maxLvl && lv >= b.maxLvl);
        var ready = ok && !blocked && !canalCap && !maxReached;
        if (lv > 0) zoneOwned = true;
        if (ready) zoneReady = true;
        /* 连锁升级沿用建筑 ID，显示最后一级已购升级的名称。 */
        var dispName = buildingName(b.id, b.name),
            dispDesc = (SB.ui && SB.ui.buildingInfoEffectText)
              ? SB.ui.buildingInfoEffectText(s, b, lv)
              : ((SB.ui && SB.ui.buildingDescText) ? SB.ui.buildingDescText(s, b) : b.desc);
        for (var _upi = 0; SB.UPGRADES && _upi < SB.UPGRADES.length; _upi++) {
          var _u = SB.UPGRADES[_upi];
          if (_u.upgradesBuilding === b.id && s.upgrades && s.upgrades[_u.id]) {
            dispName = SB.i18n && SB.i18n.contentName ? SB.i18n.contentName(_u.id, _u.name) : _u.name;
          }
        }
        var neededBuilding = b.need ? SB.habitat.buildingById(b.need) : null;
        var neededName = neededBuilding ? buildingName(neededBuilding.id, neededBuilding.name) : '';
        var label = blocked
          ? tr('village.building.requirement.needs', { requiredBuilding: neededName }, '需 ' + neededName)
          : tr(lv > 0 ? 'village.building.action.upgrade' : 'village.building.action.build', null, lv > 0 ? '升级' : '建造') + ' ' + SB.economy.buildCostTxt(s, b.id, c, true);
        if (canalCap) label = tr('village.building.lighthouse_level_required', { lighthouseLevel: s.lvl.lighthouse || 0 }, '需先升灯塔（现 ' + (s.lvl.lighthouse || 0) + ' 级）');
        if (maxReached) label = tr('village.building.level_cap', { maxLevel: b.maxLvl }, '已达上限 ' + b.maxLvl + ' 级');
        /* 缺料时可追踪当前等级。等级变化后，track-dock 根据 @lv 解除这项追踪。 */
        var trackBtn = '';
        if (!ok && !blocked && !canalCap && !maxReached) {
          var _tkey = 'bld:' + b.id + '@' + lv;
          /* s.track 可以同时记录多个目标。与工坊面板共用 isTracked 判断选中状态。 */
          var _ton = (SB.ui.track && SB.ui.track.isTracked) ? SB.ui.track.isTracked('bld', b.id, s)
            : (s.track === _tkey);
          trackBtn = '<button type="button" class="btn track-toggle' + (_ton ? ' on' : '') + '"' +
            ' data-track="bld:' + b.id + '" aria-pressed="' + (_ton ? 'true' : 'false') + '"' +
            ' title="' + htmlText(tr(_ton ? 'village.building.track.tracked.tooltip' : 'village.building.track.action.tooltip', null,
              _ton ? '已追踪：材料够了会在屏幕角落提示，点提示框可直接跳回来' : '追踪这个建筑：材料够了在屏幕角落提示你')) + '">' +
            htmlText(tr(_ton ? 'ui.track_dock.button.stop_tracking' : 'village.building.track.action.button', null, _ton ? '停止追踪' : '追踪')) + '</button>';
        }
        /* 区域建筑自动建造/升级开关：权限由已完成市政的 autoBuildZones 决定，
         * 生息区归封建主义、贸易区域归重商主义；仍复用 s.autoUpg 与 data-auto。 */
        var autoBtn = '';
        if (SB.habitat.autoZoneUnlocked(s, z.id)) {
          var _au = !!(s.autoUpg && s.autoUpg[b.id]);
          var _autoStatus = tr(_au ? 'village.automation.status.enabled' : 'village.automation.status.disabled',
            null, _au ? '已启用' : '已停用');
          var _autoAction = tr(_au ? 'village.automation.action.disable' : 'village.automation.action.enable',
            null, _au ? '停用' : '启用');
          autoBtn = '<button type="button" class="btn tog auto-upgrade-toggle' + (_au ? ' on' : '') + '" data-auto="' + b.id + '"' +
            ' aria-pressed="' + (_au ? 'true' : 'false') + '"' +
            ' aria-label="' + htmlText(tr('village.building.auto_toggle.aria_label', { automationStatus: _autoStatus }, '自动建造 / 升级' + _autoStatus)) + '"' +
            ' title="' + htmlText(tr('village.building.auto_toggle.tooltip', { automationStatus: _autoStatus, toggleAction: _autoAction }, '自动建造 / 升级' + _autoStatus + '，点击' + (_au ? '停用' : '启用'))) + '">' +
            htmlText(tr('ui.workshop.automation.label', null, '自动')) + '</button>';
        }
        /* 热泉炉的运行座数决定精铁产量及金属、暖石消耗。 */
        var furnBtn = '';
        if (b.id === 'furnace' && lv > 0) {
          var _frun = Math.max(0, lv - Math.max(0, s.furnaceStop || 0));
          furnBtn = '<span class="furnctl' + (_frun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-furnace-dec="1" title="' + htmlText(tr('village.active_units.decrease_one')) + '"' +
            (_frun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">' + htmlText(tr('village.building.active_level_count', { activeCount: _frun, totalLevels: lv })) + '</b>' +
            '<button class="fbtn" data-furnace-inc="1" title="' + htmlText(tr('village.active_units.increase_one')) + '"' +
            (_frun >= lv ? ' disabled' : '') + '>＋</button>' +
            SB.ui.drawTag(s, 'furnace') +
            '</span>';
        }
        /* 运行矿坑数决定矿脉加成，自动化钻探还按运行数计算耗能和钛、铀加成。 */
        var siltpitBtn = '';
        if (b.id === 'siltpit' && lv > 0 && s.upgrades && s.upgrades.upg_autodrill) {
          var _spstop = Math.max(0, Math.min(lv, Math.floor(s.siltpitStop || 0)));
          var _sprun = lv - _spstop;
          var _spAuto = !!(s.upgrades && s.upgrades.upg_autodrill);
          var _spExtra = '';
          if (_spAuto) {
            var _spPct = lv > 0 ? Math.round(_sprun / lv * 100) : 0;
            var _spHydro = _sprun * (SB.UNIT.drillHydro || 0.3);
            _spExtra = '<span class="fdraw" title="' + htmlText(tr('village.drilling.titanium_uranium.tooltip')) + '">' +
              htmlText(tr('village.drilling.output_and_cost', { outputBonusPercent: _spPct, hydrothermalEnergyUse: _spHydro.toFixed(2) })) + '</span>';
          }
          siltpitBtn = '<span class="furnctl' + (_sprun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-siltpit-dec="1" title="' + htmlText(tr('village.active_units.decrease_one')) + '"' +
            (_sprun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">' + htmlText(tr('village.building.active_level_count', { activeCount: _sprun, totalLevels: lv })) + '</b>' +
            '<button class="fbtn" data-siltpit-inc="1" title="' + htmlText(tr('village.active_units.increase_one')) + '"' +
            (_sprun >= lv ? ' disabled' : '') + '>＋</button>' + _spExtra +
            '</span>';
        }
        var terraVatBtn = '';
        if (b.id === 'terra_vat' && lv > 0) {
          var _tvstop = Math.max(0, Math.min(lv, Math.floor(s.terraVatStop || 0)));
          var _tvrun = lv - _tvstop;
          terraVatBtn = '<span class="furnctl' + (_tvrun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-terra-vat-dec="1" title="' + htmlText(tr('village.terra_vat.disable.tooltip', { populationCapReduction: SB.BLD.terraVatPop || 20 })) + '"' +
            (_tvrun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">' + htmlText(tr('village.building.active_level_count', { activeCount: _tvrun, totalLevels: lv })) + '</b>' +
            '<button class="fbtn" data-terra-vat-inc="1" title="' + htmlText(tr('village.terra_vat.enable.tooltip', {
              populationCapIncrease: SB.BLD.terraVatPop || 20,
              hydrothermalEnergyCost: SB.BLD.terraVatHydro || 100
            })) + '"' +
            (_tvrun >= lv ? ' disabled' : '') + '>＋</button>' +
            '<span class="fdraw" title="' + htmlText(tr('village.terra_vat.energy_source.tooltip')) + '">' + htmlText(tr('village.terra_vat.hydrothermal_demand.label', {
              hydrothermalEnergyDemand: _tvrun * (SB.BLD.terraVatHydro || 100)
            })) + '</span>' +
            '</span>';
        }
        /* 工坊「开几座」：基础工艺效率、工业机器人加成与耗流都按运行的工坊数量计算。 */
        var workshopBtn = '';
        if (b.id === 'workshop' && lv > 0 && s.upgrades && s.upgrades.upg_indrobot) {
          var _wsstop = Math.max(0, Math.min(lv, Math.floor(s.workshopStop || 0)));
          var _wsrun = lv - _wsstop;
          var _wsExtra = '';
          if (s.upgrades && s.upgrades.upg_indrobot) {
            var _wsPct = lv > 0 ? Math.round(_wsrun / lv * 100) : 0;
            var _wsHydro = _wsrun * (SB.UNIT.robotHydro || 3);
            _wsExtra = '<span class="fdraw" title="' + htmlText(tr('village.workshop.robotics.tooltip')) + '">' +
              htmlText(tr('village.workshop.output_and_cost', { outputBonusPercent: _wsPct, hydrothermalEnergyUse: _wsHydro.toFixed(2) })) + '</span>';
          }
          workshopBtn = '<span class="furnctl' + (_wsrun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-workshop-dec="1" title="' + htmlText(tr('village.active_units.decrease_one')) + '"' +
            (_wsrun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">' + htmlText(tr('village.building.active_level_count', { activeCount: _wsrun, totalLevels: lv })) + '</b>' +
            '<button class="fbtn" data-workshop-inc="1" title="' + htmlText(tr('village.active_units.increase_one')) + '"' +
            (_wsrun >= lv ? ' disabled' : '') + '>＋</button>' + _wsExtra +
            '</span>';
        }
        /* 运行汽轮机为 hydroAlloc 供能，steelFlow 据此扣减暖石。 */
        var turbBtn = '';
        if (b.id === 'hydroturbine' && lv > 0) {
          var _trun = Math.max(0, lv - Math.max(0, s.turbineStop || 0));
          turbBtn = '<span class="furnctl' + (_trun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-turbine-dec="1" title="' + htmlText(tr('village.active_units.decrease_one')) + '"' +
            (_trun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">' + htmlText(tr('village.building.active_level_count', { activeCount: _trun, totalLevels: lv })) + '</b>' +
            '<button class="fbtn" data-turbine-inc="1" title="' + htmlText(tr('village.active_units.increase_one')) + '"' +
            (_trun >= lv ? ' disabled' : '') + '>＋</button>' +
            SB.ui.drawTag(s, 'hydroturbine') +
            '</span>';
        }
        /* 停止热液工坊会释放分配给它的热液能流。 */
        var shopBtn = '';
        if (b.id === 'hydroshop' && lv > 0) {
          var _srun = Math.max(0, lv - Math.max(0, s.hydroshopStop || 0));
          shopBtn = '<span class="furnctl' + (_srun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-shop-dec="1" title="' + htmlText(tr('village.active_units.decrease_one')) + '"' +
            (_srun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">' + htmlText(tr('village.building.active_level_count', { activeCount: _srun, totalLevels: lv })) + '</b>' +
            '<button class="fbtn" data-shop-inc="1" title="' + htmlText(tr('village.active_units.increase_one')) + '"' +
            (_srun >= lv ? ' disabled' : '') + '>＋</button>' +
            SB.ui.drawTag(s, 'hydroshop') +
            '</span>';
        }
        /* 卫星和空间站的运行数同时影响星空产出与热液能消耗。 */
        var satBtn = '';
        if (b.id === 'satellite' && lv > 0) {
          var _satrun = Math.max(0, lv - Math.max(0, s.satelliteStop || 0));
          satBtn = '<span class="furnctl' + (_satrun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-satellite-dec="1" title="' + htmlText(tr('village.active_units.decrease_one')) + '"' +
            (_satrun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">' + htmlText(tr('village.building.active_level_count', { activeCount: _satrun, totalLevels: lv })) + '</b>' +
            '<button class="fbtn" data-satellite-inc="1" title="' + htmlText(tr('village.active_units.increase_one')) + '"' +
            (_satrun >= lv ? ' disabled' : '') + '>＋</button>' +
            SB.ui.drawTag(s, 'satellite') +
            '</span>';
        }
        var ssBtn = '';
        if (b.id === 'spacestation' && lv > 0) {
          var _ssrun = Math.max(0, lv - Math.max(0, s.spacestationStop || 0));
          ssBtn = '<span class="furnctl' + (_ssrun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-spacestation-dec="1" title="' + htmlText(tr('village.active_units.decrease_one')) + '"' +
            (_ssrun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">' + htmlText(tr('village.building.active_level_count', { activeCount: _ssrun, totalLevels: lv })) + '</b>' +
            '<button class="fbtn" data-spacestation-inc="1" title="' + htmlText(tr('village.active_units.increase_one')) + '"' +
            (_ssrun >= lv ? ' disabled' : '') + '>＋</button>' +
            SB.ui.drawTag(s, 'spacestation') +
            '</span>';
        }
        /* ERA8 生物材料研究所「开几座」：一并控制四种原料、θ产出和热液能耗。 */
        var biomatlabBtn = '';
        if (b.id === 'biomatlab' && lv > 0) {
          var _blrun = Math.max(0, lv - Math.max(0, s.biomatlabStop || 0));
          biomatlabBtn = '<span class="furnctl' + (_blrun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-biomatlab-dec="1" title="' + htmlText(tr('village.active_units.decrease_one')) + '"' +
            (_blrun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">' + htmlText(tr('village.building.active_level_count', { activeCount: _blrun, totalLevels: lv })) + '</b>' +
            '<button class="fbtn" data-biomatlab-inc="1" title="' + htmlText(tr('village.active_units.increase_one')) + '"' +
            (_blrun >= lv ? ' disabled' : '') + '>＋</button>' +
            SB.ui.drawTag(s, 'biomatlab') + '</span>';
        }
        /* 所有发射场共用 s.launchMode。研究绝热材料后可切换太阳帆和戴森球节点。 */
        var elBtn = '';
        var launchCtl = '';
        if (b.launchpad && lv > 0) {
          var _launchRun = SB.economy && SB.economy.launchActiveLvl
            ? SB.economy.launchActiveLvl(s, b.id) : lv;
          launchCtl = '<span class="furnctl launch-count' + (_launchRun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-launch-dec="' + b.id + '" title="' + htmlText(tr('village.active_units.decrease_one')) + '"' +
            (_launchRun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">' + htmlText(tr('village.building.active_level_count', { activeCount: _launchRun, totalLevels: lv })) + '</b>' +
            '<button class="fbtn" data-launch-inc="' + b.id + '" title="' + htmlText(tr('village.active_units.increase_one')) + '"' +
            (_launchRun >= lv ? ' disabled' : '') + '>＋</button></span>';
        }
        if (b.launchpad && lv > 0 && s.techs && s.techs.adiabatic) {
          var _nodeOn = (s.launchMode === 'node');
          var _launchUnit = SB.UNIT || {};
          var _sailModeParams = {
            uraniumRate: _launchUnit.launchSailUranium || 0.5,
            strongPropellantRate: _launchUnit.launchSailStrongProp || 0.3,
            adaptiveFilmRate: _launchUnit.launchSailThinafilm || 0.3,
            hydrothermalRate: _launchUnit.launchSailHydro || 4
          };
          var _nodeModeParams = {
            uraniumRate: _launchUnit.dysonNodeUranium || 5,
            strongPropellantRate: _launchUnit.dysonNodeStrongProp || 3,
            adaptiveFilmRate: _launchUnit.dysonNodeThinafilm || 3,
            titaniumAlloyRate: _launchUnit.dysonNodeTiplate || 30,
            hydrothermalRate: _launchUnit.dysonNodeHydro || 4
          };
          elBtn = '<span class="furnctl launch-mode' + (_nodeOn ? ' on' : '') + '">' +
            '<button class="fbtn launch-mode-toggle" data-launch-mode="1" title="' +
            htmlText(_nodeOn
              ? tr('village.launch.mode.solar_sail.tooltip', _sailModeParams)
              : tr('village.launch.mode.dyson_node.tooltip', _nodeModeParams)) +
            '"><span class="launch-mode-text">' + htmlText(_nodeOn
              ? tr('village.launch.target.dyson_nodes.name')
              : tr('village.launch.target.solar_sails.name')) + '</span>' +
            '<span class="launch-mode-swap" aria-hidden="true">⇄</span></button></span>';
        }
        // 等级标签显式标注“等级”，避免孤立数字被误认成其他状态。
        // 潮纹馆带「虚级」（大潮纹馆 +3，按效果算、按建筑不算，见 wonder.libBonus）：
        // 等级直接写成「等级 1+3」——真实等级在前、虚级在后，一眼看出哪部分是白送的。
        // 其它建筑没有虚级通道，照旧只写一个数。
        var lvValueTxt = (b.id === 'library' && SB.wonder && SB.wonder.libBonus(s) > 0)
          ? lv + '+' + SB.wonder.libBonus(s) : lv;
        /* ERA10 市政：带等级上限的建筑显示「当前/上限」，让玩家一眼看到还剩几级可建。 */
        if (b.maxLvl) lvValueTxt = lv + '/' + b.maxLvl;
        /* 等级标签和悬停提示各自使用对应的词条。 */
        var lvTitle = b.maxLvl ? tr('village.building.level.current_cap.label', null, '建筑等级（当前/上限）')
          : tr('village.building.level.tooltip', { levelText: lvValueTxt }, '建筑等级 ' + lvValueTxt);
        if (b.id === 'library' && SB.wonder && SB.wonder.libBonus(s) > 0 && !b.maxLvl) {
          lvTitle = tr('village.building.level.virtual_bonus.tooltip', { wonderName: buildingName('great_library', '大潮纹馆') }, '含大潮纹馆提供的额外等效等级（计入科技产出，不计建筑等级，也不提高建造成本）');
        }
        var rowState = 'bld-row' + (lv > 0 ? ' is-owned' : '') + (blocked || canalCap ? ' is-blocked' : '') +
          (ready ? ' is-ready' : '') +
          (!blocked && !canalCap && !maxReached && !ok ? ' is-unaffordable' : '') +
          (maxReached ? ' is-maxed' : '');
        /* 仅把“已满足前置、但库存不足”的资源差额展示在卡片上。
         * 数量与 track-dock / costOwnedTxt 走同一套存量取整和 enough 容差；
         * 前置未满足、等级封顶和灯塔等级钳制仍由原状态单独表达。 */
        var _shortfallHTML = '';
        if (!ok && !blocked && !canalCap && !maxReached && SB.economy && SB.economy.enough) {
          var _shortfallItems = [], _shortKey, _storageCapBlocked = false;
          for (_shortKey in c) {
            if (!Object.prototype.hasOwnProperty.call(c, _shortKey) || !(c[_shortKey] > 0)) continue;
            var _shortHaveRaw = _shortKey === 'pop' ? s.pop : (s.res && s.res[_shortKey]);
            var _shortHave = (typeof _shortHaveRaw === 'number' && isFinite(_shortHaveRaw)) ? Math.floor(_shortHaveRaw) : 0;
            var _shortIsEnough = SB.economy.enough(_shortHave, c[_shortKey]);
            if (!_shortIsEnough && _shortKey !== 'pop' && SB.economy.capOf) {
              var _shortCap = SB.economy.capOf(s, _shortKey);
              if (typeof _shortCap === 'number' && isFinite(_shortCap) && c[_shortKey] > _shortCap + 1e-9) {
                _storageCapBlocked = true;
                continue;
              }
            }
            if (_shortIsEnough) continue;
            /* shortfallItemText 和 paintLiveCost 共用差额标记，库存变化时只更新读数。 */
            var _sfFn = SB.ui && SB.ui.renderCommon && SB.ui.renderCommon.shortfallItemText;
            var _sfTxt = _sfFn ? _sfFn(s, _shortKey, c[_shortKey]) : '';
            var _sfItem = '<span class="bld-shortfall-item" data-live-short="' + _shortKey +
              '" data-live-need="' + c[_shortKey] + '">' + htmlText(_sfTxt) + '</span>';
            if (!SB.workshop.craftHasPrereqBlock(s, SB.workshop.craftByResource(_shortKey))) {
              _sfItem = '<span class="bld-shortfall-wrap">' + _sfItem +
                '<button type="button" class="bld-goto-craft" data-goto-craft-res="' + _shortKey +
                '" data-return-bld="' + b.id + '">' + htmlText(tr('village.shortfall.goto_craft', null, '去制造 ↗')) + '</button></span>';
            }
            _shortfallItems.push(_sfItem);
          }
          if (_storageCapBlocked) {
            _shortfallItems.unshift('<span class="bld-storage-cap-warning">' + htmlText(tr('village.building.storage_cap.insufficient')) + '</span>');
          }
          if (_shortfallItems.length) _shortfallHTML = '<div class="bld-shortfalls">' + _shortfallItems.join('') + '</div>';
        }
        /* void-lv-N 只控制祭坛的血纹装饰。 */
        if (b.id === 'void_altar') rowState += ' void-altar void-lv-' + lv;
        if (b.id === 'black_monolith') rowState += ' faith-monolith';
        var buildingIconHTML = buildingIconsShown && b.icon
          ? '<img class="building-icon" src="' + b.icon + '" alt="" aria-hidden="true" width="32" height="32">' : '';
        var launchProgressHTML = '';
        var _lpLackHTML = '';
        if (b.launchpad && lv > 0) {
          var _lpNodeMode = SB.economy && SB.economy.launchNodeMode ? SB.economy.launchNodeMode(s) : false;
          var _lpPct = launchProgressPct(s, b.id);
          var _lpCosts = SB.economy && SB.economy.launchMaterialPer ? SB.economy.launchMaterialPer(s) : {};
          var _lpHydroPer = SB.economy && SB.economy.launchHydroPer ? SB.economy.launchHydroPer(s) : 4;
          var _lpNames = {
            uranium: resourceName('uranium', '铀'),
            strongProp: resourceName('strongProp', '强工质火箭引擎'),
            thinafilm: resourceName('thinafilm', 'θ金属自适应薄膜'),
            tiplate: resourceName('tiplate', '钛合金板'),
            hydro: resourceName('hydro', '热液能')
          };
          /* 戴森球竣工后发射场停止耗料。结算、耗流和面板共用 dysonFull 判定。 */
          var _lpStopped = (SB.economy && SB.economy.dysonFull) ? SB.economy.dysonFull(s) : false;
          var _lpCostRows = [
            { key: 'uranium', name: _lpNames.uranium, per: _lpCosts.uranium || 0 },
            { key: 'strongProp', name: _lpNames.strongProp, per: _lpCosts.strongProp || 0 },
            { key: 'thinafilm', name: _lpNames.thinafilm, per: _lpCosts.thinafilm || 0 },
            { key: 'tiplate', name: _lpNames.tiplate, per: _lpCosts.tiplate || 0 },
            { key: 'hydro', name: _lpNames.hydro, per: _lpHydroPer }
          ];
          var _lpCostShort = [], _lpCostFull = [];
          if (!_lpStopped) for (var _lpc = 0; _lpc < _lpCostRows.length; _lpc++) {
            var _lpCost = _lpCostRows[_lpc];
            if (_lpCost.per <= 0) continue;
            var _lpTotal = _lpCost.per * _launchRun;
            var _lpRate = tr('village.launch.resource_rate.item', {
              resourceName: _lpCost.name,
              resourceAmount: _lpTotal.toFixed(2)
            });
            _lpCostShort.push(_lpRate);
            _lpCostFull.push(_lpRate);
          }
          /* 发射场缺料时，操作区显示 launchStatus 返回的原因，触屏玩家也能看到。 */
          var _lpLackName = '';
          var _lpSt = (SB.economy && SB.economy.launchStatus) ? SB.economy.launchStatus(s, b.id) : null;
          if (_lpStopped) {
            _lpLackHTML = '<b class="lack-tag is-done" title="' + htmlText(tr('village.launch.auto_stop.tooltip', null, '戴森球已达标，三座发射场自动停机，不再消耗原料与热液能。')) + '">' +
              htmlText(tr('village.launch.auto_stop.badge', null, '已竣工 · 自动停机')) + '</b>';
          } else if (_lpSt && _lpSt.lack) {
            for (var _lpl = 0; _lpl < _lpCostRows.length; _lpl++) {
              if (_lpCostRows[_lpl].key === _lpSt.lack) { _lpLackName = _lpCostRows[_lpl].name; break; }
            }
            if (_lpLackName) {
              /* 任一必要原料不足时，整座发射场停机。 */
              _lpLackHTML = '<b class="lack-tag is-stop">' + htmlText(tr('village.launch.resource_shortage.badge', { resourceName: _lpLackName })) + '</b>';
            }
          }
          var _lpCostTitle = _lpStopped
            ? tr('village.launch.auto_stop.tooltip', null, '戴森球已达标，三座发射场自动停机，不再消耗原料与热液能。')
            : tr('village.launch.resource_demand.tooltip', { resourceCostList: _lpCostFull.join(' · ') });
          if (_lpLackName) _lpCostTitle += ' ' + tr('village.launch.resource_shortage.status', { missingResource: _lpLackName });
          var _lpCostHTML = _lpStopped ? ''
            : '<span class="launch-consumption" title="' + htmlText(_lpCostTitle) + '">' + htmlText(_lpCostShort.join(' · ')) + '</span>';
          var _lpTargetName = tr(_lpNodeMode ? 'village.launch.target.dyson_nodes.name' : 'village.launch.target.solar_sails.name');
          launchProgressHTML = '<div class="launch-progress" id="launch-progress-' + b.id + '" data-launch-progress="' + b.id + '" title="' + htmlText(tr('village.launch.progress.tooltip', { resourceDemandTooltip: _lpCostTitle })) + '" role="progressbar" aria-label="' +
            htmlText(tr('village.launch.progress.aria_label', { launchTarget: _lpTargetName })) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + _lpPct + '" data-pct="' + _lpPct + '">' +
            '<span class="launch-progress-label">' + htmlText(tr('village.launch.progress.label')) + '</span><div class="launch-progress-track"><i style="width:' + _lpPct + '%"></i></div>' +
            '<span class="launch-progress-value">' + _lpPct + '%</span>' + _lpCostHTML + '</div>';
        }
        /* 角标另包一层，保持名称与等级的两列布局。 */
        var _coTagHTML = (SB.ui.renderCommon && SB.ui.renderCommon.challengeTag)
          ? SB.ui.renderCommon.challengeTag(s, b) : '';
        /* 运行数量放在标题行，发射进度和缺料提示放在操作区。 */
        var _inlineRunControlsHTML = siltpitBtn + terraVatBtn + workshopBtn + furnBtn + turbBtn + shopBtn + satBtn + ssBtn + biomatlabBtn + launchCtl;
        var _bldOpsHTML = _lpLackHTML + launchProgressHTML;
        zRows += '<div class="row ' + rowState + '"><div class="bld-main' + (buildingIconHTML ? ' has-building-icon' : '') + '">' + buildingIconHTML +
          '<div class="bld-copy"><div class="nm"><span class="bld-label"><button type="button" class="building-name" data-build-info="' + b.id +
          '" aria-haspopup="dialog" title="' + htmlText(tr('village.building.info.tooltip', { buildingName: dispName }, '查看' + dispName + '的效果与建造信息')) + '">' + htmlText(dispName) + '</button>' +
          ' <span class="tag" data-lv="' + b.id + '" title="' + htmlText(lvTitle) + '">' + htmlText(tr('village.building.level.label', { levelText: lvValueTxt }, '等级 ' + lvValueTxt)) + '</span>' +
          (_coTagHTML ? '<span class="co-tag-wrap">' + _coTagHTML + '</span>' : '') +
          ((elBtn || _inlineRunControlsHTML) ? '<span class="bld-ctrl-bar">' +
            (elBtn ? '<span class="launch-mode-anchor">' + elBtn + '</span>' : '') +
            (_inlineRunControlsHTML ? '<span class="bld-run-controls">' + _inlineRunControlsHTML + '</span>' : '') +
          '</span>' : '') +
          '</span>' + (_bldOpsHTML ? '<span class="bld-ops">' + _bldOpsHTML + '</span>' : '') + '</div>' +
          '<div class="ds">' + dispDesc + (blocked ? htmlText(tr('village.building.prerequisite.note', { requiredBuilding: neededName }, '（需先建成' + neededName + '）')) : '') +
          '</div></div></div>' +
          '<div class="buy-actions' + (autoBtn ? ' has-auto-toggle' : '') + (trackBtn ? ' has-track' : '') + '">' + _shortfallHTML + autoBtn +
          '<button class="btn buy" data-build="' + b.id + '"' + (ok && !blocked && !canalCap && !maxReached ? '' : ' disabled') + '><span class="bld-action-label">' + label + '</span></button>' +
          trackBtn + '</div></div>';
        zShown++;
        totalShown++;
      }
      /* 区块重画时从持久化的折叠偏好恢复 folded。 */
      if (zShown > 0) {
        anyOwned = anyOwned || zoneOwned;
        anyReady = anyReady || zoneReady;
        h += '<div class="bzone' + (zoneOwned ? ' has-owned' : '') + (zoneReady ? ' has-ready' : '') +
          (SB.ui.render.isZoneFolded(z.id) ? ' folded' : '') +
          '" data-zone="' + z.id + '">' +
          '<div class="bztitle" data-zfold="' + z.id + '" style="--hc:' +
          (SB.ui.render.zoneColor(z.id) || 'var(--dim)') + '" title="' + htmlText(tr('village.zone.collapse_expand.tooltip')) + '">' +
          '<span class="bzcv">▾</span>' + htmlText(zoneName(z.id, z.name)) + '</div>' +
          '<div class="bzbody">' + zRows + '</div></div>';
      }
    }
    h += '<div class="row village-empty"><div class="ds">' + htmlText(tr('village.filter.empty', null, '当前筛选下没有可显示的建筑，可点上方「全部」查看。')) + '</div></div>';
    return '<div class="village-view' + (totalShown ? ' has-buildings' : '') + (anyOwned ? ' has-owned' : '') +
      (anyReady ? ' has-ready' : '') + '">' + h + '</div>';
  }

  parts.paneVillage = paneVillage;
  parts.refreshLaunchProgress = refreshLaunchProgress;
  parts.setVillageFilter = setVillageFilter;
  parts.setVillageDensity = setVillageDensity;
  parts.syncVillageToolbar = paintVillageToolbar;
  parts.getVillageFilter = getVillageFilter;
  parts.getVillageDensity = getVillageDensity;
  parts.isManualGatherCollapsed = isManualGatherCollapsed;
  parts.toggleManualGatherFold = toggleManualGatherFold;
  parts.resetManualGatherFold = resetManualGatherFold;
  parts.manualGatherFoldState = manualGatherFoldState;
})(typeof window !== 'undefined' ? window : globalThis);
