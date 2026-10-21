/* 天壳 · 可见的真实游戏 AI 玩家（浏览器内运行）
 * 面板和定时器只负责驱动/展示，决策统一交给 src/ai-strategy.js。
 */
(function (root) {
  'use strict';
  var SB = root.SB;
  if (!SB || !SB.game || !SB.aiStrategy) return;
  var GAME_SPEED = 30;
  /* 主模拟与 AI 共用浏览器主线程。30× 时主循环已经要结算约 300 个 0.1s tick/秒；
   * 每 400ms 再跑一次完整策略（里面会多次计算 rates）会把主线程挤满，名义 30×
   * 反而实际不到 1×。策略不需要跟着每个模拟 tick 跑：每秒重规划一次足够及时。 */
  var AI_TIMER_MS = 250, DECISION_INTERVAL_MS = 1000, PANEL_REFRESH_MS = 2000;
  var panel, timer, lastDecision = 0, lastPanelRefresh = 0, started = false, logNode, lastResult = null;
  var lastStatusSent = 0, statusPostPending = false, lastError = null;
  var lastRebirth = null;
  var lastInvestment = null;
  var legacyPrep = null;
  var LEGACY_PREP_MIN_SECONDS = 2 * 60 * 60;
  var sampleAt = 0, sampleGameT = 0, sampleScience = 0;
  var effectiveSpeed = null, actualScienceRate = null;

  function el(tag, text) {
    var n = document.createElement(tag);
    if (text != null) n.textContent = text;
    return n;
  }
  function syncPanelState() {
    if (!panel) return;
    var isRunning = !!started;
    panel.setAttribute('data-ai-state', isRunning ? 'running' : 'paused');
    var badge = document.getElementById('ai-player-state');
    if (badge) {
      badge.textContent = isRunning ? '● AI 运行中' : 'Ⅱ AI 已暂停';
      badge.setAttribute('aria-label', isRunning ? 'AI 正在运行' : 'AI 已暂停');
    }
    var pauseButton = document.getElementById('ai-player-pause');
    var resumeButton = document.getElementById('ai-player-resume');
    if (pauseButton) pauseButton.disabled = !isRunning;
    if (resumeButton) resumeButton.disabled = isRunning;
  }
  function initPanel() {
    var style = el('style');
    style.textContent = [
      '#ai-player-panel{position:fixed;right:16px;bottom:16px;z-index:99999;width:310px;background:#10201f;color:#e6f1df;border:2px solid #e05b66;border-radius:12px;padding:12px 14px;box-shadow:0 0 0 3px #e05b6633,0 8px 32px #0008;font:13px/1.5 system-ui,sans-serif;transition:border-color .2s,box-shadow .2s}',
      '#ai-player-panel[data-ai-state="running"]{border-color:#32d17c;box-shadow:0 0 0 3px #32d17c44,0 8px 32px #0008}',
      '#ai-player-panel[data-ai-state="paused"]{border-color:#ff5964;box-shadow:0 0 0 3px #ff596455,0 8px 32px #0008}',
      '#ai-player-panel .ai-player-header{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '#ai-player-panel .ai-player-state{font-size:11px;font-weight:800;letter-spacing:.2px;border-radius:999px;padding:3px 8px;white-space:nowrap}',
      '#ai-player-panel[data-ai-state="running"] .ai-player-state{background:#124a31;color:#8affb7}',
      '#ai-player-panel[data-ai-state="paused"] .ai-player-state{background:#64262e;color:#ffb5bb}',
      '#ai-player-panel b{color:#b8df8a}',
      '#ai-player-panel button{border:0;border-radius:7px;padding:8px 11px;margin:8px 6px 6px 0;font-weight:800;cursor:pointer;transition:background .2s,color .2s,box-shadow .2s}',
      '#ai-player-panel[data-ai-state="running"] button.stop{background:#d64050;color:#fff;box-shadow:0 0 0 2px #ff728055}',
      '#ai-player-panel[data-ai-state="running"] button#ai-player-resume{background:#344a43;color:#c4d0ca}',
      '#ai-player-panel[data-ai-state="paused"] button.stop{background:#604047;color:#efc8cc}',
      '#ai-player-panel[data-ai-state="paused"] button#ai-player-resume{background:#25bd75;color:#071b11;box-shadow:0 0 0 2px #77ffb366}',
      '#ai-player-panel button:disabled{cursor:default;filter:saturate(.45) brightness(.75);opacity:.68}',
      '#ai-player-panel button:not(:disabled):hover{filter:brightness(1.12)}',
      '#ai-player-panel .stats{margin-top:5px;color:#d1dfd1}',
      '#ai-player-panel .log{max-height:100px;overflow:auto;color:#a8c4a9;font-size:11px}'
    ].join('');
    document.head.appendChild(style);
    panel = el('section'); panel.id = 'ai-player-panel';
    var header = el('div'); header.className = 'ai-player-header';
    var title = el('strong', 'AI 自动游玩 · 真实游戏'); title.style.fontSize = '15px'; header.appendChild(title);
    var badge = el('span', 'Ⅱ AI 已暂停'); badge.id = 'ai-player-state'; badge.className = 'ai-player-state';
    header.appendChild(badge); panel.appendChild(header);
    var buttons = el('div');
    var stop = el('button', '暂停 AI'); stop.id = 'ai-player-pause'; stop.className = 'stop'; stop.onclick = pause; buttons.appendChild(stop);
    var resume = el('button', '继续 AI'); resume.id = 'ai-player-resume'; resume.onclick = start; buttons.appendChild(resume);
    panel.appendChild(buttons);
    var stats = el('div'); stats.className = 'stats'; stats.id = 'ai-player-stats'; panel.appendChild(stats);
    stats.style.whiteSpace = 'pre-line';
    logNode = el('div'); logNode.className = 'log'; logNode.id = 'ai-player-log'; panel.appendChild(logNode);
    document.body.appendChild(panel);
    syncPanelState();
  }
  function say(message) {
    if (!logNode) return;
    var row = el('div', '· ' + message); logNode.insertBefore(row, logNode.firstChild);
    while (logNode.children.length > 6) logNode.removeChild(logNode.lastChild);
  }
  /* 轮回点不能只投人口上限：轮回后按本局瓶颈配置一篮子增益，并把可买余额用完。
   * 基础组合（无既有等级时恰好 50 点）：住房规划 20、奇观蓝图满级 20、珊瑚礁契 2 级 6、
   * 寒潮储备 1 级 2、科技/市政产出各 1 级共 2。余款再投珊瑚、工坊、科技、市政、矿脉与省料。
   * buyPerk 走正式商店 API 并写入 meta；永久等级保留到后续周目，运行态效果也即时应用。 */
  function investTidePoints(s, reason) {
    if (!s || !SB.prestige || !SB.prestige.perkState || !SB.prestige.buyPerk) return null;
    var meta = SB.game.meta();
    if (!meta || !meta.shopUnlocked || !(Number(meta.tide) > 0)) return null;
    var before = Number(meta.tide) || 0;
    var purchases = [];
    function buyTo(id, target) {
      var guard = 0, st;
      while (guard++ < 100) {
        st = SB.prestige.perkState(id);
        if (!st || st.done || st.lv >= target || st.locked || !st.afford) break;
        var price = Number(st.next) || 0;
        if (!(price > 0) || !SB.prestige.buyPerk(id)) break;
        purchases.push({ id: id, level: st.lv + 1, cost: price });
      }
    }
    [
      ['housePlan', 1], ['wonderBlueprint', 4], ['coralPact', 2],
      ['coldStore', 1], ['tideProof', 1], ['civicArchive', 1],
    ].forEach(function (item) { buyTo(item[0], item[1]); });
    /* 已买过基础组合或余额较大时，继续买有直接收益的等级；只要还有可负担项就继续。 */
    var fallback = [
      ['coralPact', 5], ['craftQuota', 2], ['tideProof', 3],
      ['civicArchive', 3], ['mineTax', 1], ['buildSave', 3],
    ];
    var changed = true, passes = 0;
    while (changed && passes++ < 100) {
      changed = false;
      for (var i = 0; i < fallback.length; i++) {
        var item = fallback[i], prior = purchases.length;
        buyTo(item[0], item[1]);
        if (purchases.length > prior) { changed = true; break; }
      }
    }
    var after = Number(SB.game.meta().tide) || 0;
    lastInvestment = {
      reason: reason || 'AI启动', before: before, after: after,
      spent: before - after, purchases: purchases,
      perks: Object.assign({}, SB.game.meta().perks || {}),
    };
    if (purchases.length) {
      var labels = purchases.map(function (p) { return p.id + ' Lv.' + p.level; });
      say('轮回点投入 ' + lastInvestment.spent.toFixed(2) + '：' + labels.join('、') +
        '；余额 ' + after.toFixed(2) + '。');
      if (SB.game.renderAll) SB.game.renderAll();
    }
    return lastInvestment;
  }
  /* 轮回前把两种可转入遗产账本的工艺品尽可能制完。
   * 仅走正式 workshop.craft，仍受历史哲学、材料、成本折扣与工坊效率规则约束。
   * 进入准备期后每次 AI 决策都造当前库存可支持的最大整数批次；持续准备 2 个游戏小时，
   * 让生产链补充材料后还能继续制作，不因单个短暂无料窗口提前结算。 */
  function prepareLegacyCraft(s) {
    var cycle = Number(SB.game.meta().cycle) || 0;
    if (!legacyPrep || legacyPrep.cycle !== cycle) {
      legacyPrep = { cycle: cycle, active: false, startedAt: null, lastCraftAt: null,
        made: { artwork: 0, tidalRecord: 0 }, blocked: {} };
    }
    var report = legacyPrep;
    report.hours = Number(s.t) / 3600;
    report.inventory = {
      artwork: Number(s.res && s.res.artwork) || 0,
      tidalRecord: Number(s.res && s.res.tidalRecord) || 0,
    };
    if (!(s.civics && s.civics.historiography)) {
      report.state = 'waiting-historiography';
      report.blocked = { historiography: '历史哲学尚未完成，配方未解锁' };
      return report;
    }
    if (!SB.workshop || !SB.workshop.craftById || !SB.workshop.maxCraftable || !SB.workshop.craft) {
      report.state = 'workshop-unavailable';
      report.blocked = { workshop: '工坊制作接口不可用' };
      return report;
    }
    if (!report.active) {
      report.active = true;
      report.startedAt = Number(s.t) || 0;
      report.lastCraftAt = Number(s.t) || 0;
    }
    report.blocked = {};
    var craftedThisCall = false;
    [
      { id: 'craft_artwork', res: 'artwork', label: '艺术品' },
      { id: 'craft_tidal_record', res: 'tidalRecord', label: '潮纹碑石' },
    ].forEach(function (recipe) {
      var row = SB.workshop.craftById(recipe.id);
      if (!row) { report.blocked[recipe.res] = '缺少配方'; return; }
      var blocked = SB.workshop.craftBlocked(s, recipe.id);
      var max = Number(SB.workshop.maxCraftable(s, row));
      var batches = isFinite(max) ? Math.floor(max) : 0;
      if (batches > 0) {
        var made = Number(SB.workshop.craft(s, recipe.id, batches, null)) || 0;
        if (made > 0) {
          craftedThisCall = true;
          report.made[recipe.res] += made;
          report.lastCraftAt = Number(s.t) || 0;
          report.inventory[recipe.res] = Number(s.res && s.res[recipe.res]) || 0;
        }
      } else if (blocked) report.blocked[recipe.res] = blocked;
    });
    var artworkReady = report.inventory.artwork >= 1 || report.made.artwork >= 1;
    var recordReady = report.inventory.tidalRecord >= 1 || report.made.tidalRecord >= 1;
    var prepElapsed = (Number(s.t) || 0) - report.startedAt;
    var minWaitDone = prepElapsed >= LEGACY_PREP_MIN_SECONDS;
    report.prepElapsedSeconds = prepElapsed;
    report.prepRemainingSeconds = Math.max(0, LEGACY_PREP_MIN_SECONDS - prepElapsed);
    report.ready = artworkReady && recordReady && minWaitDone;
    report.state = report.ready ? 'ready' : 'preparing';
    if (craftedThisCall) {
      if (SB.game.markDirty) SB.game.markDirty();
      if (SB.game.renderAll) SB.game.renderAll();
    }
    return report;
  }
  /* 自动轮回必须复用正式结算 API：不调用 resetRun/wipeSave，也不绕过资格与奖励计算。
   * 用户规则：本局超过 50 小时、神学合格且预览为正、轮回遗产工艺品都备妥才结算。 */
  function tryAutoRebirth(s) {
    /* 戴森球是这次 AI 的终点。超过 50 小时也不能自动结算/nextCycle，
     * 否则后期科技和发射场刚开始时就会被送回新周目，永远到不了 Era10。 */
    if (!s || s.dysonDone) return false;
    var meta = SB.game.meta();
    lastRebirth = {
      state: 'deferred-until-dyson', cycle: Number(meta && meta.cycle) || 0,
      hours: (Number(s.t) || 0) / 3600, points: 0,
    };
    return false;
  }
  function chooseLaunchMode(s) {
    if (!s || s.dysonDone || !(s.techs && s.techs.adiabatic) ||
        !SB.economy || !SB.economy.launchLvl || SB.economy.launchLvl(s) <= 0 ||
        !SB.ui || !SB.ui.input || !SB.ui.input.toggleLaunchMode) return false;
    var sailCap = Number(SB.CFG.DYSON_SAIL_CAP) || 10000;
    var desired = (Number(s.sunSails) || 0) >= sailCap ? 'node' : 'sail';
    var current = s.launchMode === 'node' ? 'node' : 'sail';
    if (current === desired) return false;
    if (!SB.ui.input.toggleLaunchMode(s)) return false;
    say(desired === 'node'
      ? '太阳帆目标已达，自动切换全部发射场到戴森节点模式。'
      : '太阳帆尚未达标，自动切回太阳帆模式。');
    return true;
  }
  function step() {
    if (!started) return;
    /* AI 接管期间保持配置速度；手动点速率按钮会改游戏引擎变量，不能只让面板继续显示常量。 */
    if (SB.game.getSpeed && SB.game.getSpeed() !== GAME_SPEED) SB.game.setSpeed(GAME_SPEED);
    var s = SB.game.run();
    if (!s) { pause(); say('未读到当前周目状态，AI 已暂停以保护存档。'); return; }
    if (s.dysonDone) {
      pause(); say('戴森球已竣工，AI 停在终点；保留本周目和竣工记录。'); return;
    }
    /* 破壳弹窗的「探索壳外的星空」正式动作是 SB.game.stay()。
     * 以前遇到 s.broken 就直接暂停，模拟冻结在破壳选择上；现在自动选择留在本局，
     * 不结算轮回、不新建周目，继续同一存档的星空和戴森阶段。 */
    if (s.broken && s.shellOpened && Number(s.shell) <= 0 && SB.game.stay) {
      SB.game.stay();
      s = SB.game.run();
      lastRebirth = { state: 'continuing-after-shellbreak', cycle: Number(SB.game.meta().cycle) || 0,
        hours: (Number(s && s.t) || 0) / 3600, points: 0 };
      say('破壳完成：选择留在本局探索星空，沒有轮回或重开。');
    }
    if (!s || s.broken) { pause(); say('当前周目处于非破壳结束状态，AI 已暂停。'); return; }
    try {
      if (tryAutoRebirth(s)) return;
      chooseLaunchMode(s);
      var result = SB.aiStrategy.step(s);
      lastResult = result;
      lastError = null;
      if (result.changed) SB.game.renderAll();
    } catch (e) { lastError = e && e.message ? e.message : String(e); say('策略异常：' + lastError); }
  }
  function numericMap(value) {
    var out = {};
    if (!value || typeof value !== 'object') return out;
    Object.keys(value).forEach(function (key) {
      if (typeof value[key] === 'number' && isFinite(value[key])) out[key] = value[key];
    });
    return out;
  }
  function publishStatus(s, force, cachedRates) {
    if (!s || typeof root.fetch !== 'function' || statusPostPending) return;
    var now = Date.now();
    if (!force && now - lastStatusSent < 1000) return;
    lastStatusSent = now;
    var techDone = Object.keys(s.techs || {}).filter(function (key) { return s.techs[key]; }).length;
    var result = lastResult || {};
    var runtime = SB.game.runtimeStatus ? SB.game.runtimeStatus() : {};
    var economyRates = cachedRates || SB.economy.rates(s);
    var targetTech = result.goal && SB.tech.byId ? SB.tech.byId(result.goal) : null;
    var targetCondition = targetTech && targetTech.cond || null;
    var targetConditionProgress = null;
    if (targetCondition) {
      if (targetCondition.t === 'rate') {
        var targetRate = Number(economyRates[targetCondition.r]) || 0;
        targetConditionProgress = { txt: (SB.tech.condText(targetCondition) || targetCondition.r) +
          ' ' + targetRate.toFixed(2) + ' / 秒 · 需 ' + targetCondition.n,
          now: targetRate, need: targetCondition.n };
      } else if (SB.tech.condShort) targetConditionProgress = SB.tech.condShort(s, targetCondition);
    }
    var civicDef = (SB.CIVICS || []).filter(function (item) { return item.id === result.civic; })[0];
    var civicConditionProgress = civicDef && civicDef.boost && SB.tech.condShort
      ? SB.tech.condShort(s, civicDef.boost) : null;
    var effectiveJobs = SB.folk.effJobs(s);
    var techMultipliers = SB.tech.mul(s);
    var turbineLevel = Number(s.lvl && s.lvl.hydroturbine) || 0;
    var turbineStop = Math.max(0, Number(s.turbineStop) || 0);
    var storageCaps = {};
    ['stone', 'hardCoral', 'warmstone', 'stoneBeam'].forEach(function (resource) {
      storageCaps[resource] = SB.economy.capOf(s, resource);
    });
    var plannedBuildCaps = {};
    Object.keys(result.buildCost || {}).forEach(function (resource) {
      plannedBuildCaps[resource] = {
        have: Number(s.res && s.res[resource]) || 0,
        need: Number(result.buildCost[resource]) || 0,
        cap: SB.economy.capOf(s, resource)
      };
    });
    var payload = {
      running: started,
      strategyVersion: SB.aiStrategy.version || null,
      speed: SB.game.getSpeed ? SB.game.getSpeed() : GAME_SPEED,
      configuredSpeed: GAME_SPEED,
      effectiveSpeed: effectiveSpeed,
      actualScienceRate: actualScienceRate,
      gameLoopAgeMs: runtime.loopAgeMs,
      catchupActive: !!runtime.catchupActive,
      queuedGameSeconds: Number(runtime.queuedGameSeconds) || 0,
      gameTickMs: Number(runtime.tickMs) || 0,
      batchTicks: Number(runtime.batchTicks) || 0,
      batchFastTicks: Number(runtime.batchFastTicks) || 0,
      batchMs: Number(runtime.batchMs) || 0,
      batchSimSeconds: Number(runtime.batchSimSeconds) || 0,
      pageHidden: !!document.hidden,
      gameHours: s.t / 3600,
      era: Number(s.era) || 0,
      techDone: techDone,
      techTotal: SB.TECHS.length,
      techGoal: result.goal || null,
      techConditionText: result.goalConditionText || null,
      techConditionProgress: targetConditionProgress,
      population: Number(s.pop) || 0,
      populationCap: SB.economy.popCap(s),
      scienceRate: Number(economyRates.science) || 0,
      stoneRate: Number(economyRates.stone) || 0,
      warmstoneRate: Number(economyRates.warmstone) || 0,
      hydroSupplyRate: Number(economyRates.hydroSupply) || 0,
      turbineLevel: turbineLevel,
      turbineStop: turbineStop,
      activeTurbines: Math.max(0, turbineLevel - turbineStop),
      highPressurePump: !!(s.upgrades && s.upgrades.upg_hppump),
      storageCaps: storageCaps,
      effectiveScholars: Number(effectiveJobs.scholar) || 0,
      scienceOutputMultiplier: Number(techMultipliers.sci) || 1,
      globalOutputMultiplier: Number(SB.economy.globalMul(s)) || 0,
      challengeId: s.challenge && s.challenge.id || null,
      civicGoal: result.civic || null,
      civicCondition: result.civicCondition || null,
      civicConditionProgress: civicConditionProgress,
      plannedUpgrade: result.plannedUpgrade || null,
      plannedBuildingUpgrade: result.plannedBuildingUpgrade || null,
      castleDiscount: result.castleDiscount,
      castleDiscountSoftCap: result.castleDiscountSoftCap,
      castleLevel: Number(s.lvl && s.lvl.hall) || 0,
      castleTechUnlocked: !!(s.techs && s.techs.castle),
      castleUpgradeInstalled: !!(s.upgrades && s.upgrades.upg_castle),
      supportUpgrade: result.supportUpgrade || null,
      plannedBuild: result.build || null,
      plannedWonder: result.wonder || null,
      plannedBuildCost: result.buildCost || null,
      plannedBuildCaps: plannedBuildCaps,
      buildCapacityBlocked: !!result.buildCapacityBlocked,
      plannedBuildMaterials: result.buildMaterials || [],
      plannedResourceNeeds: result.plannedResourceNeeds || {},
      dysonPlan: result.dysonPlan || null,
      craftDiagnostics: result.craftDiagnostics || {},
      buildCraftDiagnostics: result.buildCraftDiagnostics || {},
      gatheredCraft: result.gatheredCraft || null,
      overflowCraft: result.overflowCraft || null,
      autoCraftSlotCapacity: SB.workshop.slotCap ? SB.workshop.slotCap(s) : 0,
      autoCraftSlots: Array.isArray(s.autoSlots) ? s.autoSlots.slice() : [],
      strategyActions: Number(result.actions) || 0,
      materialJobCounts: result.materialJobCounts || [],
      housingTarget: result.housingTarget || 0,
      housingCapacityBlocked: !!result.housingCapacityBlocked,
      housingChecks: result.housingChecks || [],
      zone: result.zone || null,
      zoneNeeds: result.zoneNeeds || {},
      resources: numericMap(s.res),
      jobs: numericMap(s.jobs),
      buildingLevels: numericMap(s.lvl),
      strategyError: lastError,
      cycle: Number(SB.game.meta().cycle) || 0,
      shell: Number(s.shell) || 0,
      shellOpened: !!s.shellOpened,
      broken: !!s.broken,
      breakSettled: !!s.breakSettled,
      starExplore: Number(s.res && s.res.starExplore) || 0,
      sunSails: Number(s.sunSails) || 0,
      dysonNodes: Number(s.dysonNodes) || 0,
      dysonPct: SB.economy.dysonPct ? Number(SB.economy.dysonPct(s)) || 0 : 0,
      dysonDone: !!s.dysonDone,
      launchMode: s.launchMode === 'node' ? 'node' : 'sail',
      launchpadLevel: SB.economy.launchLvl ? SB.economy.launchLvl(s) : 0,
      tidePoints: Number(SB.game.meta().tide) || 0,
      popcapPerkLevel: Number((SB.game.meta().perks || {}).popcap) || 0,
      metaPerks: numericMap(SB.game.meta().perks),
      lastInvestment: lastInvestment,
      legacyPrep: lastRebirth && lastRebirth.legacy ? lastRebirth.legacy : legacyPrep,
      rebirth: lastRebirth || {
        state: (Number(s.t) || 0) > 50 * 3600
          ? (SB.prestige.qualified(s) ? 'eligible-awaiting-positive-preview' : 'awaiting-theology')
          : 'under-50-hours',
        hours: s.t / 3600,
        points: (SB.prestige.qualified(s) ? Number(SB.prestige.breakReport(s).tidePoints) : 0) || 0,
      },
    };
    statusPostPending = true;
    root.fetch('/__ai-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(payload),
    }).then(function () { statusPostPending = false; }, function () { statusPostPending = false; });
  }
  function refresh() {
    if (!panel) return;
    var s = SB.game.run(); if (!s) return;
    syncPanelState();
    var sampleNow = Date.now();
    if (sampleAt > 0 && sampleNow > sampleAt) {
      var wallSeconds = (sampleNow - sampleAt) / 1000;
      effectiveSpeed = (s.t - sampleGameT) / wallSeconds;
      actualScienceRate = ((s.res.science || 0) - sampleScience) / wallSeconds;
    }
    sampleAt = sampleNow; sampleGameT = s.t; sampleScience = s.res.science || 0;
    var stats = document.getElementById('ai-player-stats');
    var economyRates = SB.economy.rates(s);
    var scienceRate = economyRates.science;
    var engineSpeed = SB.game.getSpeed ? SB.game.getSpeed() : GAME_SPEED;
    var runtime = SB.game.runtimeStatus ? SB.game.runtimeStatus() : {};
    var summary = (started ? '运行中 · 引擎 ' + engineSpeed + '×' : '已暂停') + ' | Era ' + s.era + ' | ' +
      (s.t / 3600).toFixed(2) + ' 游戏小时 | 人口 ' + s.pop + '/' + SB.economy.popCap(s) +
      ' | 实际推进 ' + (effectiveSpeed == null ? '采样中' : effectiveSpeed.toFixed(1) + '×') +
      ' | 科技 ' + Object.keys(s.techs).filter(function (k) { return s.techs[k]; }).length + '/' + SB.TECHS.length +
      ' | 科研 ' + (s.res.science || 0).toFixed(1) + ' (' + scienceRate.toFixed(2) + '/秒，净变 ' +
      (actualScienceRate == null ? '采样中' : (actualScienceRate >= 0 ? '+' : '') + actualScienceRate.toFixed(2) + '/秒') + ')';
    summary += '\n页面 ' + (document.hidden ? '后台（浏览器可能节流）' : '前台') +
      (runtime.catchupActive ? ' · 离线补算中' : '') +
      ' · 主循环积压 ' + (Number(runtime.queuedGameSeconds) || 0).toFixed(1) + ' 游戏秒';
    summary += '\n破壳 ' + (s.shellOpened ? '已开启' : '未开启') + ' · 星空 ' +
      Math.floor(Number(s.res && s.res.starExplore) || 0) + '/' +
      (Number(SB.CFG.STAR_CAP) || 0) + ' · 戴森球 ' +
      Math.floor((SB.economy.dysonPct ? SB.economy.dysonPct(s) : 0) * 100) + '% (' +
      Math.floor(Number(s.sunSails) || 0) + '/10000 帆，' +
      Math.floor(Number(s.dysonNodes) || 0) + '/1000 节点) · 发射模式 ' +
      (s.launchMode === 'node' ? '节点' : '太阳帆');
    if (lastResult && lastResult.dysonPlan) {
      summary += ' · 发射场 ' + lastResult.dysonPlan.activeLevels + ' 级运行';
      var dysonNeeds = Object.keys(lastResult.dysonPlan.targets || {}).map(function (resource) {
        return resource + ' ' + (Number(s.res[resource]) || 0).toFixed(0) + '/' +
          Number(lastResult.dysonPlan.targets[resource]).toFixed(0);
      });
      if (dysonNeeds.length) summary += '\n戴森材料储备 ' + dysonNeeds.join(' · ');
    }
    if (lastResult) summary += '\n科技目标 ' + (lastResult.goal || '—') + ' · 市政目标 ' +
      (lastResult.civic || '—') + (lastResult.civicCondition ? '(' + lastResult.civicCondition + ')' : '') +
      ' · 计划 ' + (lastResult.plannedUpgrade ? '升级 ' +
        (lastResult.plannedUpgrade === 'upg_castle' ? '城堡升级（议事厅）' : lastResult.plannedUpgrade) :
        (lastResult.plannedBuildingUpgrade ? '优先升级 ' +
          (lastResult.plannedBuildingUpgrade === 'hall' ? '议事厅（城堡）' :
            ({ nest: '礁口巢', coralhouse: '石屋', siltpit: '砂矿坑', workshop: '工坊', lighthouse: '灯塔' }[lastResult.plannedBuildingUpgrade] || lastResult.plannedBuildingUpgrade)) :
          (lastResult.build ? '建造 ' + lastResult.build : '等资源'))) + ' · 关键材料岗 ' +
      (lastResult.materialJobCounts && lastResult.materialJobCounts.length ? lastResult.materialJobCounts.join(',') : '—') +
      (lastResult.housingTarget > 0 ? ' · 住房目标 ' + lastResult.housingTarget +
        (lastResult.housingCapacityBlocked ? '（仓储不足）' : '') : '') +
      (lastResult.housingChecks && lastResult.housingChecks.length
        ? '\n住房门槛 ' + lastResult.housingChecks.join(' · ') : '') +
      (lastResult.zone ? ' · ' + lastResult.zone + '区 ' + (lastResult.buildMaterials || []).join(',') +
        ' 原料缺口 ' + JSON.stringify(lastResult.zoneNeeds || {}) : '') +
      (lastResult.castleDiscount != null && lastResult.castleDiscountSoftCap != null
        ? '\n议事厅（城堡）等级 ' + (s.lvl.hall || 0) + ' · 城堡科技 ' +
          (s.techs && s.techs.castle ? '已解锁' : '未解锁') + ' · 城堡升级 ' +
          (s.upgrades && s.upgrades.upg_castle ? '已安装' : '未安装') + ' · 减费 ' +
          (lastResult.castleDiscount * 100).toFixed(1) + '%/' +
          (lastResult.castleDiscountSoftCap * 100).toFixed(0) + '% 软上限' : '');
    if (lastResult && lastResult.goalConditionText) {
      var goalDef = SB.tech.byId(lastResult.goal), goalCond = goalDef && goalDef.cond;
      var goalProgress = goalCond && goalCond.t === 'rate'
        ? economyRates[goalCond.r] : null;
      summary += '\n科技门槛 ' + lastResult.goalConditionText +
        (goalProgress == null ? '' : ' · 当前 ' + goalProgress.toFixed(2) + '/秒');
    }
    if (lastResult && lastResult.gatheredCraft) {
      var gc = lastResult.gatheredCraft;
      summary += '\n尤里卡工艺排产 ' + gc.resource + ' ' +
        Number(gc.produced || 0).toFixed(0) + '/' + Number(gc.condition || 0).toFixed(0) +
        ' · 库存 ' + Number(gc.have || 0).toFixed(1) + '/' + Number(gc.target || 0).toFixed(1) +
        (gc.blocked ? ' · 阻塞：' + gc.blocked : '');
    }
    if (legacyPrep) {
      var lpState = legacyPrep.state || (legacyPrep.active ? 'preparing' : 'waiting');
      var lpLabel = lpState === 'waiting-historiography' ? '等待《历史哲学》解锁配方' :
        lpState === 'ready' ? '两种成品已备齐，准备结算' :
        lpState === 'preparing' ? '制作中' : lpState;
      var lpBlocked = Object.keys(legacyPrep.blocked || {}).map(function (k) {
        return k + ': ' + legacyPrep.blocked[k];
      }).join('；');
      summary += '\n轮回前遗产准备：' + lpLabel + ' · 艺术品 ' +
        Math.floor(Number(s.res.artwork) || 0) + ' · 潮纹碑石 ' +
        Math.floor(Number(s.res.tidalRecord) || 0) +
        (legacyPrep.prepRemainingSeconds > 0
          ? ' · 制作窗口剩余 ' + Math.ceil(legacyPrep.prepRemainingSeconds / 60) + ' 游戏分钟' : '') +
        (lpBlocked ? ' · 阻塞：' + lpBlocked : '');
    }
    if (lastResult && lastResult.capacityFallbackFor) {
      var fallbackId = lastResult.capacityFallbackFor;
      var fallbackCost = lastResult.capacityFallbackCost || {};
      var fallbackSummary = Object.keys(fallbackCost).map(function (resource) {
        var cap = SB.economy.capOf(s, resource);
        return resource + ' ' + (s.res[resource] || 0).toFixed(0) + '/' +
          (isFinite(cap) ? cap.toFixed(0) : '∞') + ' (目标 ' + fallbackCost[resource].toFixed(0) + ')';
      }).join(' · ');
      summary += '\n仓储瓶颈：' + fallbackId + ' 超过材料上限，当前改建压舱仓' +
        (fallbackSummary ? ' · ' + fallbackSummary : '');
    }
    stats.textContent = summary;
    publishStatus(s, false, economyRates);
  }
  function start() {
    if (!started) {
      started = true; SB.game.setSpeed(GAME_SPEED);
      investTidePoints(SB.game.run(), '继续AI');
      var b = document.querySelector('.spd[data-spd="' + GAME_SPEED + '"]'); if (b) b.classList.add('on');
      say('AI 正在通过共用策略和正式游戏 API 操作这一局。');
    }
    if (!timer) timer = root.setInterval(function () {
      var now = Date.now();
      if (now - lastDecision >= DECISION_INTERVAL_MS) { lastDecision = now; step(); }
      /* 全量 rates() 会遍历整套经济链；每 100ms 由 UI 再算一遍，和 30× 主模拟争用
       * 主线程，可能把名义倍速压成近乎停摆。面板/遥测按墙钟 1 秒刷新已足够。 */
      if (now - lastPanelRefresh >= PANEL_REFRESH_MS) { lastPanelRefresh = now; refresh(); }
    }, AI_TIMER_MS);
    refresh();
  }
  function pause() {
    started = false;
    if (timer) { root.clearInterval(timer); timer = null; }
    refresh(); publishStatus(SB.game.run(), true); say('AI 已暂停；游戏仍按当前速度运行。');
  }
  function boot() {
    initPanel(); SB.game.setSpeed(GAME_SPEED);
    var speedBtn = document.querySelector('.spd[data-spd="' + GAME_SPEED + '"]'); if (speedBtn) speedBtn.classList.add('on');
    started = true;
    investTidePoints(SB.game.run(), '页面启动');
    timer = root.setInterval(function () {
      var now = Date.now();
      if (now - lastDecision >= DECISION_INTERVAL_MS) { lastDecision = now; step(); }
      if (now - lastPanelRefresh >= PANEL_REFRESH_MS) { lastPanelRefresh = now; refresh(); }
    }, AI_TIMER_MS);
    say('接管当前周目，游戏速度 ' + GAME_SPEED + '×。'); refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else root.setTimeout(boot, 0);
})(typeof window !== 'undefined' ? window : globalThis);
