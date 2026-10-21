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
  var sampleAt = 0, sampleGameT = 0, sampleScience = 0;
  var effectiveSpeed = null, actualScienceRate = null;

  function el(tag, text) {
    var n = document.createElement(tag);
    if (text != null) n.textContent = text;
    return n;
  }
  function initPanel() {
    var style = el('style');
    style.textContent = '#ai-player-panel{position:fixed;right:16px;bottom:16px;z-index:99999;width:290px;background:#10201f;color:#e6f1df;border:1px solid #719b72;border-radius:12px;padding:12px 14px;box-shadow:0 8px 32px #0008;font:13px/1.5 system-ui,sans-serif}#ai-player-panel b{color:#b8df8a}#ai-player-panel button{border:0;border-radius:7px;padding:7px 10px;margin:7px 6px 6px 0;background:#6d9f53;color:#10201f;font-weight:700;cursor:pointer}#ai-player-panel button.stop{background:#344a43;color:#fff}#ai-player-panel .stats{margin-top:5px;color:#d1dfd1}#ai-player-panel .log{max-height:100px;overflow:auto;color:#a8c4a9;font-size:11px}';
    document.head.appendChild(style);
    panel = el('section'); panel.id = 'ai-player-panel';
    var title = el('strong', 'AI 自动游玩 · 真实游戏'); title.style.fontSize = '15px'; panel.appendChild(title);
    var buttons = el('div');
    var stop = el('button', '暂停 AI'); stop.className = 'stop'; stop.onclick = pause; buttons.appendChild(stop);
    var resume = el('button', '继续 AI'); resume.onclick = start; buttons.appendChild(resume);
    panel.appendChild(buttons);
    var stats = el('div'); stats.className = 'stats'; stats.id = 'ai-player-stats'; panel.appendChild(stats);
    stats.style.whiteSpace = 'pre-line';
    logNode = el('div'); logNode.className = 'log'; logNode.id = 'ai-player-log'; panel.appendChild(logNode);
    document.body.appendChild(panel);
  }
  function say(message) {
    if (!logNode) return;
    var row = el('div', '· ' + message); logNode.insertBefore(row, logNode.firstChild);
    while (logNode.children.length > 6) logNode.removeChild(logNode.lastChild);
  }
  /* 自动轮回必须复用正式结算 API：不调用 resetRun/wipeSave，也不绕过资格与奖励计算。
   * 用户规则：本局超过 50 小时、已完成神学且预览轮回点 > 0 才结算；之后只买
   * 当前余额买得起的「广厦之基」，再通过 nextCycle 保留局外账本开启新周目。 */
  function tryAutoRebirth(s) {
    if (!s || s.broken || s.breakSettled || !SB.prestige || !SB.game.nextCycle) return false;
    if ((Number(s.t) || 0) <= 50 * 3600) return false;
    if (!SB.prestige.qualified(s)) {
      lastRebirth = { state: 'locked', cycle: SB.game.meta().cycle, hours: s.t / 3600, points: 0 };
      return false;
    }
    var preview = SB.prestige.breakReport(s);
    var points = Number(preview && preview.tidePoints);
    if (!(isFinite(points) && points > 0)) {
      lastRebirth = { state: 'zero-payout', cycle: SB.game.meta().cycle, hours: s.t / 3600, points: isFinite(points) ? points : 0 };
      return false;
    }
    var oldCycle = Number(SB.game.meta().cycle) || 1;
    var settled = SB.prestige.doBreak(s, SB.game.emit);
    if (!settled || !(Number(settled.tidePoints) > 0)) {
      lastRebirth = { state: 'settlement-failed', cycle: oldCycle, hours: s.t / 3600, points: 0 };
      return false;
    }
    var bought = 0;
    var perkState;
    while ((perkState = SB.prestige.perkState('popcap')) && !perkState.done && perkState.afford) {
      if (!SB.prestige.buyPerk('popcap')) break;
      bought++;
    }
    var totalPopcapLevel = (SB.game.meta().perks || {}).popcap || 0;
    /* doBreak 已经落盘奖励与旧周目；正常 nextCycle 会保留 meta 并应用永久 perk。 */
    SB.game.nextCycle();
    SB.game.setSpeed(GAME_SPEED);
    lastResult = null;
    lastError = null;
    lastRebirth = {
      state: 'completed', previousCycle: oldCycle,
      cycle: Number(SB.game.meta().cycle) || oldCycle + 1,
      points: settled.tidePoints, popcapLevelsBought: bought,
      popcapLevel: totalPopcapLevel,
    };
    say('自动轮回完成：+' + settled.tidePoints.toFixed(2) + ' 点；广厦之基 +' + bought + ' 级；已进入第 ' + lastRebirth.cycle + ' 周目。');
    return true;
  }
  function step() {
    if (!started) return;
    /* AI 接管期间保持配置速度；手动点速率按钮会改游戏引擎变量，不能只让面板继续显示常量。 */
    if (SB.game.getSpeed && SB.game.getSpeed() !== GAME_SPEED) SB.game.setSpeed(GAME_SPEED);
    var s = SB.game.run();
    if (!s || s.broken) { pause(); say('本局已结束。'); return; }
    try {
      if (tryAutoRebirth(s)) return;
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
    var effectiveJobs = SB.folk.effJobs(s);
    var techMultipliers = SB.tech.mul(s);
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
      population: Number(s.pop) || 0,
      populationCap: SB.economy.popCap(s),
      scienceRate: Number(economyRates.science) || 0,
      effectiveScholars: Number(effectiveJobs.scholar) || 0,
      scienceOutputMultiplier: Number(techMultipliers.sci) || 1,
      globalOutputMultiplier: Number(SB.economy.globalMul(s)) || 0,
      challengeId: s.challenge && s.challenge.id || null,
      civicGoal: result.civic || null,
      civicCondition: result.civicCondition || null,
      plannedUpgrade: result.plannedUpgrade || null,
      plannedBuild: result.build || null,
      plannedWonder: result.wonder || null,
      plannedBuildCost: result.buildCost || null,
      plannedBuildMaterials: result.buildMaterials || [],
      plannedResourceNeeds: result.plannedResourceNeeds || {},
      craftDiagnostics: result.craftDiagnostics || {},
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
      tidePoints: Number(SB.game.meta().tide) || 0,
      popcapPerkLevel: Number((SB.game.meta().perks || {}).popcap) || 0,
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
    var sampleNow = Date.now();
    if (sampleAt > 0 && sampleNow > sampleAt) {
      var wallSeconds = (sampleNow - sampleAt) / 1000;
      effectiveSpeed = (s.t - sampleGameT) / wallSeconds;
      actualScienceRate = ((s.res.science || 0) - sampleScience) / wallSeconds;
    }
    sampleAt = sampleNow; sampleGameT = s.t; sampleScience = s.res.science || 0;
    var stats = document.getElementById('ai-player-stats');
    var scienceRate = SB.economy.rates(s).science;
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
    if (lastResult) summary += '\n科技目标 ' + (lastResult.goal || '—') + ' · 市政目标 ' +
      (lastResult.civic || '—') + (lastResult.civicCondition ? '(' + lastResult.civicCondition + ')' : '') +
      ' · 计划 ' + (lastResult.plannedUpgrade ? '升级 ' + lastResult.plannedUpgrade :
        (lastResult.build ? '建造 ' + lastResult.build : '等资源')) + ' · 关键材料岗 ' +
      (lastResult.materialJobCounts && lastResult.materialJobCounts.length ? lastResult.materialJobCounts.join(',') : '—') +
      (lastResult.housingTarget > 0 ? ' · 住房目标 ' + lastResult.housingTarget +
        (lastResult.housingCapacityBlocked ? '（仓储不足）' : '') : '') +
      (lastResult.housingChecks && lastResult.housingChecks.length
        ? '\n住房门槛 ' + lastResult.housingChecks.join(' · ') : '') +
      (lastResult.zone ? ' · ' + lastResult.zone + '区 ' + (lastResult.buildMaterials || []).join(',') +
        ' 原料缺口 ' + JSON.stringify(lastResult.zoneNeeds || {}) : '');
    stats.textContent = summary;
    publishStatus(s, false, { science: scienceRate });
  }
  function start() {
    if (!started) {
      started = true; SB.game.setSpeed(GAME_SPEED);
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
