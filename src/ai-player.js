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
   * 寒潮储备 1 级 2、科技/市政产出各 1 级共 2。节点终局复盘发现精铁是长期限速原料，
   * 因此余款优先补矿脉税契（精铁原料、金属、暖石）和炉心增压（精铁熔炼），再考虑省料。
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
        if (!st) return;
        if (st.done || st.lv >= target) return;
        /* 潮汐之树（2026-10-24）：买锁定节点前，递归补齐全部前置节点；
         * 多前置关系按 AND 处理，链式节点则买到 L1 后解锁后继。 */
        if (st.locked) {
          var prereqs = st.prerequisites || (st.perk && st.perk.nest ? [st.perk.nest] : []);
          if (prereqs.length) {
            for (var pi = 0; pi < prereqs.length; pi++) buyTo(prereqs[pi], 1);
            continue;
          }
          return;
        }
        if (!st.afford) return;
        var price = Number(st.next) || 0;
        if (!(price > 0) || !SB.prestige.buyPerk(id)) return;
        purchases.push({ id: id, level: st.lv + 1, cost: price });
      }
    }
    /* 潮汐之树（2026-10-23）：旧 PERKS 单键已拆分为 8 子树链式节点；按「等效旧档收益」重指向新节点
     *   （买到链末 = 旧满级收益）：生息规划 20、遗址图样满级(wbp1+2) 20、珊瑚契 2 级(coralPact1+2) 7、
     *   御寒之智(coldPenalty) 10。旧 tideProof/civicArchive（商店科/市政产出）在潮汐之树中无对应节点，已剔除。 */
    [
      ['housePlan', 1], ['wonderBlueprint2', 1], ['coralPact2', 1],
      ['coldPenalty', 1],
    ].forEach(function (item) { buyTo(item[0], item[1]); });
    /* 余款优先补矿脉税契（精铁原料/金属/暖石：minerPact3 + quarryPact3）和炉心增压（精铁熔炼 furnaceBoost3），
     *   再补工坊定额（craftQuota2）与珊瑚通汇（coralPactTail，无上限）。 */
    var fallback = [
      ['coralPactTail', 2], ['craftQuota2', 1],
      ['minerPact3', 1], ['quarryPact3', 1], ['furnaceBoost3', 1],
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
  function nextChallengeId() {
    if (!SB.challenges || !SB.challenges.canStart) return null;
    var order = ['cold', 'small', 'science', 'abyss', 'speedrun'];
    var s = SB.game.run(), meta = SB.game.meta();
    for (var i = 0; i < order.length; i++)
      if (SB.challenges.canStart(order[i], s, meta)) return order[i];
    return null;
  }
  function allImplementedChallengesDone(meta) {
    if (!SB.challenges || !SB.challenges.tierDone) return false;
    return SB.challenges.tierDone('cold', meta) >= 1 &&
      SB.challenges.tierDone('small', meta) >= 1 &&
      SB.challenges.tierDone('science', meta) >= 3 &&
      SB.challenges.tierDone('abyss', meta) >= 3 &&
      SB.challenges.tierDone('speedrun', meta) >= 3;
  }
  function continueAfterChallengeBreak(s, report) {
    if (!s || !s.challenge || !s.breakSettled) return false;
    var meta = SB.game.meta(), challenge = SB.challenges.byId(s.challenge.id);
    var completed = SB.challenges.tierDone(s.challenge.id, meta) > (s.challenge.tier | 0);
    if (!completed) {
      pause();
      var failure = report && report.challengeFailure;
      say(failure
        ? '挑战未通过：' + failure.name + ' · ' + failure.label + '；已停在结算页，检查限制后可重试。'
        : '本次破壳没有登记挑战奖励；AI 已暂停，保留结算页供检查。');
      return true;
    }
    say('挑战通关：' + challenge.name + ' · ' +
      (challenge.tiers[s.challenge.tier | 0].label || '完成挑战') + '。');
    investTidePoints(s, '挑战通关后');
    var nextId = nextChallengeId();
    if (nextId && SB.challenges.begin(nextId)) {
      say('按挑战顺序开始下一项：' + SB.challenges.byId(nextId).name + '。');
      return true;
    }
    /* 全部已实装挑战奖励均已正式登记后，只启动一次普通周目作为虚境终局局。
     * nextCycle 复用游戏自己的周目 API；普通局无 challenge 标记，戴森竣工后由
     * 现有终点守卫暂停，因此不会继续轮回或重复播放结局。 */
    if (allImplementedChallengesDone(meta) && SB.game.nextCycle) {
      var cycleBeforeFinal = Number(meta.cycle) || 0;
      SB.game.nextCycle();
      var finalRun = SB.game.run();
      var cycleAfterFinal = Number(SB.game.meta().cycle) || 0;
      if (finalRun && !finalRun.challenge && cycleAfterFinal === cycleBeforeFinal + 1) {
        lastRebirth = { state: 'post-challenge-void-ending', cycle: cycleAfterFinal,
          hours: 0, points: 0 };
        say('所有已实装挑战均已正式结算；启动唯一一次普通终局周目，目标为「飞升虚境」。');
        return true;
      }
    }
    pause();
    say('所有已实装挑战已完成，但无法安全启动虚境终局周目；AI 已停在结算页。');
    return true;
  }
  function settleChallengeAtShell(s) {
    if (!s || !s.challenge || !s.broken || !s.shellOpened || Number(s.shell) > 0 || s.breakSettled ||
        !SB.game.settleBreak) return false;
    var report = SB.game.settleBreak();
    if (!report) return false;
    return continueAfterChallengeBreak(SB.game.run(), report);
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
    var voidRun = SB.aiStrategy.isVoidEndingRun && SB.aiStrategy.isVoidEndingRun(s);
    var voidCivicReady = !!(s.civics && s.civics.ascend_void);
    var desired = (Number(s.sunSails) || 0) >= sailCap && (!voidRun || voidCivicReady)
      ? 'node' : 'sail';
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
    /* 用户明确改为跳过剩余挑战、跑一局普通虚境结局。挑战局不能沿用；
     * 用正式 nextCycle API 只退出这一次，保留 meta/永久进度，新局不带 challenge。
     * 普通局没有任何自动开启挑战的路径，因此不会再次进入挑战序列。 */
    if (s.challenge) {
      var cycleBeforeNormal = Number(SB.game.meta() && SB.game.meta().cycle) || 0;
      if (SB.game.nextCycle) SB.game.nextCycle();
      var normalRun = SB.game.run();
      var cycleAfterNormal = Number(SB.game.meta() && SB.game.meta().cycle) || 0;
      if (normalRun && !normalRun.challenge && cycleAfterNormal === cycleBeforeNormal + 1) {
        if (SB.aiStrategy.markVoidEndingRun) SB.aiStrategy.markVoidEndingRun();
        lastRebirth = { state: 'normal-void-ending-run', cycle: cycleAfterNormal,
          hours: 0, points: 0 };
        say('按用户指示退出挑战（不登记奖励），通过正式周目 API 开始普通虚境终局局。');
      } else {
        pause();
        say('未能通过正式周目 API 退出挑战；AI 已暂停，保留当前存档供检查。');
      }
      return;
    }
    /* 挑战的通关口径是「神学 + 破壳」正式结算。普通终局选择留在本局，
     * 会让 challenge 永远不登记奖励；挑战局到壳外时必须复用官方 settleBreak，
     * 成功后再由 challenge API 开下一项。 */
    if (s.challenge && s.broken && s.shellOpened && Number(s.shell) <= 0) {
      if (!s.breakSettled) {
        if (settleChallengeAtShell(s)) return;
      } else if (continueAfterChallengeBreak(s, null)) return;
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
      var measuredSpeed = Number(effectiveSpeed);
      if (!isFinite(measuredSpeed) || measuredSpeed <= 0)
        measuredSpeed = Number(SB.game.getSpeed ? SB.game.getSpeed() : GAME_SPEED) || GAME_SPEED;
      /* 页面每秒决策一次；30×时 45 秒游戏库存仅覆盖 1.5 次决策，后台调度稍有抖动
       * 就会断料停发。按 3 个决策周期备料，并至少保留 90 游戏秒缓冲。 */
      var dysonBufferSeconds = Math.max(90, Math.min(180, measuredSpeed * 3));
      var result = SB.aiStrategy.step(s, { dysonBufferSeconds: dysonBufferSeconds });
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
    var thetaInputRates = SB.economy.thetaInputRates ? SB.economy.thetaInputRates(s) : {};
    var miningTools = (SB.workshop.tools ? SB.workshop.tools() : []).filter(function (tool) {
      return tool.target && tool.target.indexOf('miner') >= 0;
    });
    var targetTech = result.goal && SB.tech.byId ? SB.tech.byId(result.goal) : null;
    var targetCondition = targetTech && targetTech.cond || null;
    var skydrillDef = SB.workshop && SB.workshop.wonderById
      ? SB.workshop.wonderById('wonder_skydrill') : null;
    var skydrillCost = SB.wonder && SB.wonder.discountedCost
      ? SB.wonder.discountedCost(s, 'wonder_skydrill') : (skydrillDef && skydrillDef.cost || {});
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
    ['stone', 'hardCoral', 'warmstone', 'stoneBeam', 'silt', 'iron'].forEach(function (resource) {
      storageCaps[resource] = SB.economy.capOf(s, resource);
    });
    var ironInputRate = Math.max(0, Number(thetaInputRates.iron) || 0);
    var nationalIronBonus = SB.wonder && SB.wonder.nationalLogisticsMul
      ? Number(SB.wonder.nationalLogisticsMul(s)) || 0 : 0;
    var storageUpgradeOptions = ['upg_ballast_1', 'upg_ballast_2', 'upg_alloy_warehouse'].map(function (id) {
      var upgrade = SB.workshop.upgradeById(id);
      return upgrade ? {
        id: id,
        installed: !!(s.upgrades && s.upgrades[id]),
        unlocked: !upgrade.need || !!(s.techs && s.techs[upgrade.need]),
        canBuy: SB.workshop.upgradeCanBuy ? !!SB.workshop.upgradeCanBuy(s, id) : false,
        blocked: SB.workshop.upgradeBlocked ? SB.workshop.upgradeBlocked(s, id) : null
      } : null;
    }).filter(Boolean);
    var ironProduction = {
      grossRate: Math.max(0, (Number(economyRates.iron) || 0) + ironInputRate),
      netRate: Number(economyRates.iron) || 0,
      thetaDemand: ironInputRate,
      furnaceLevels: Number(s.lvl && s.lvl.furnace) || 0,
      activeFurnaces: Math.max(0, (Number(s.lvl && s.lvl.furnace) || 0) - (Number(s.furnaceStop) || 0)),
      furnaceBoostLevel: Number(s.perk && s.perk.furnaceBoost) || 0,
      smeltMultiplier: Number(techMultipliers && techMultipliers.smelt) || 1,
      cardMultiplier: SB.civic && SB.civic.cardResOutMul ? Number(SB.civic.cardResOutMul(s, 'iron')) || 1 : 1,
      nationalLogisticsBonus: nationalIronBonus,
      cards: Array.isArray(s.cards) ? s.cards.slice() : [],
      logisticsWonder: !!(SB.wonder && SB.wonder.owned && SB.wonder.owned(s).wonder_logistics),
      silt: Number(s.res && s.res.silt) || 0,
      siltCap: SB.economy.capOf(s, 'silt'),
      storageUpgrades: storageUpgradeOptions,
      yieldUpgrades: ['upg_wasteforge', 'upg_fishbonemine'].map(function (id) {
        var upgrade = SB.workshop.upgradeById(id);
        return upgrade ? {
          id: id,
          installed: !!(s.upgrades && s.upgrades[id]),
          unlocked: (!upgrade.need || !!(s.techs && s.techs[upgrade.need])) &&
            (!upgrade.needCivic || !!(s.civics && s.civics[upgrade.needCivic])),
          canBuy: !!(SB.workshop.upgradeCanBuy && SB.workshop.upgradeCanBuy(s, id)),
          blocked: SB.workshop.upgradeBlocked ? SB.workshop.upgradeBlocked(s, id) : null
        } : null;
      }).filter(Boolean)
    };
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
      titaniumRate: Number(economyRates.titanium) || 0,
      titaniumSupplyRate: Math.max(0, (Number(economyRates.titanium) || 0) + (Number(thetaInputRates.titanium) || 0)),
      /* thetaInputRates() 返回正值表示正在消耗；不能取负，否则状态页永远显示 0。 */
      titaniumDemandRate: Math.max(0, Number(thetaInputRates.titanium) || 0),
      titaniumMining: Object.assign({}, result.titaniumMining || {}, {
        deepmineInstalled: !!(s.upgrades && s.upgrades.upg_deepmine),
        autodrillTech: !!(s.techs && s.techs.autodrill),
        autodrillInstalled: !!(s.upgrades && s.upgrades.upg_autodrill),
        siltpitLevels: Number(s.lvl && s.lvl.siltpit) || 0,
        activeSiltpits: SB.economy.activeSiltpit ? SB.economy.activeSiltpit(s) : Number(s.lvl && s.lvl.siltpit) || 0,
        minerJobs: Number(s.jobs && s.jobs.miner) || 0,
        toolMultiplier: SB.economy.toolMul ? SB.economy.toolMul(s, 'miner') : 1,
        ownedMiningTools: miningTools.filter(function (tool) { return !!(s.tools && s.tools[tool.id]); }).map(function (tool) { return tool.id; })
      }),
      hydroSupplyRate: Number(economyRates.hydroSupply) || 0,
      hydroPriority: result.hydroPriority || null,
      skydrillOn: !!s.skydrillOn,
      skydrillStarved: !!s.skydrillStarved,
      turbineLevel: turbineLevel,
      turbineStop: turbineStop,
      activeTurbines: Math.max(0, turbineLevel - turbineStop),
      highPressurePump: !!(s.upgrades && s.upgrades.upg_hppump),
      storageCaps: storageCaps,
      effectiveScholars: Number(effectiveJobs.scholar) || 0,
      scienceOutputMultiplier: Number(techMultipliers.sci) || 1,
      globalOutputMultiplier: Number(SB.economy.globalMul(s)) || 0,
      challengeId: s.challenge && s.challenge.id || null,
      challengeTier: s.challenge ? (Number(s.challenge.tier) || 0) : null,
      postChallengeVoidRun: SB.aiStrategy.isVoidEndingRun ? SB.aiStrategy.isVoidEndingRun(s) : false,
      voidFaithCompleted: !!(s.civics && s.civics.void_faith),
      voidExploreCompleted: !!(s.civics && s.civics.void_explore),
      ascendVoidCompleted: !!(s.civics && s.civics.ascend_void),
      voidAltarLevel: Number(s.lvl && s.lvl.void_altar) || 0,
      civicGoal: result.civic || null,
      civicCondition: result.civicCondition || null,
      civicConditionProgress: civicConditionProgress,
      thetaProduction: result.thetaProduction || null,
      thetaDemandActive: !!result.thetaDemandActive,
      thetaBoostCard: result.thetaBoostCard || null,
      thetaKelpCard: result.thetaKelpCard || null,
      ironStorageUpgrades: result.ironStorageUpgrades || [],
      ironProduction: ironProduction,
      thetaKelpGather: result.thetaKelpGather || null,
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
      capacityBlockedResource: result.capacityBlockedResource || null,
      plannedBuildMaterials: result.buildMaterials || [],
      plannedResourceNeeds: result.plannedResourceNeeds || {},
      dysonPlan: result.dysonPlan || null,
      craftDiagnostics: result.craftDiagnostics || {},
      buildCraftDiagnostics: result.buildCraftDiagnostics || {},
      wonderCraftDiagnostics: result.wonderCraftDiagnostics || {},
      skydrillGate: {
        selected: result.wonder === 'wonder_skydrill',
        owned: !!(s.wonders && s.wonders.wonder_skydrill),
        tech: !!(s.techs && s.techs.skydrill),
        scaffoldTech: !!(s.techs && s.techs.physics),
        ropeTech: !!(s.techs && s.techs.scaffoldT),
        cost: skydrillCost,
        blocked: SB.workshop && SB.workshop.wonderBlocked
          ? SB.workshop.wonderBlocked(s, 'wonder_skydrill') : null,
        scaffoldCraftBlocked: SB.workshop && SB.workshop.craftBlocked
          ? SB.workshop.craftBlocked(s, 'craft_scaffold') : null,
        ropeCraftBlocked: SB.workshop && SB.workshop.craftBlocked
          ? SB.workshop.craftBlocked(s, 'craft_rope') : null
      },
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
      popcapPerkLevel: Number((s.perk && s.perk.startPop) || 0),
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
    if (lastResult && lastResult.hydroPriority) {
      summary += '\n热液优先天穹钻机 ' + Number(lastResult.hydroPriority.supplyRate || 0).toFixed(1) + '/' +
        Number(lastResult.hydroPriority.requiredRate || 0).toFixed(1) + '/秒 · 工坊开 ' +
        Number(lastResult.hydroPriority.shopsOpen || 0).toFixed(0) + '/' +
        Number(lastResult.hydroPriority.shopsTotal || 0).toFixed(0);
    }
    if (lastResult && lastResult.dysonPlan) {
      summary += ' · 发射场 ' + lastResult.dysonPlan.activeLevels + ' 级运行';
      var dysonNeeds = Object.keys(lastResult.dysonPlan.targets || {}).map(function (resource) {
        return resource + ' ' + (Number(s.res[resource]) || 0).toFixed(0) + '/' +
          Number(lastResult.dysonPlan.targets[resource]).toFixed(0);
      });
      if (dysonNeeds.length) summary += '\n戴森材料储备 ' + dysonNeeds.join(' · ');
      summary += '\n戴森供料/需求 θ ' +
        Number(lastResult.dysonPlan.thetaRateAvailable || 0).toFixed(1) + '/' +
        Number(lastResult.dysonPlan.thetaRateRequired || 0).toFixed(1) + '/秒 · 暖石 ' +
        Number(lastResult.dysonPlan.warmstoneRateAvailable || 0).toFixed(0) + '/' +
        Number(lastResult.dysonPlan.warmstoneRateRequired || 0).toFixed(0) + '/秒 · 钛板 ' +
        Number(lastResult.dysonPlan.tiplateRateAvailable || 0).toFixed(1) + '/' +
        Number(lastResult.dysonPlan.tiplateRateRequired || 0).toFixed(1) + '/秒';
      summary += ' · θ矿工目标 ' +
        Number(lastResult.dysonPlan.thetaIronTargetMiners || 0).toFixed(0) +
        ' · 暖石矿工目标 ' + Number(lastResult.dysonPlan.warmstoneTargetMiners || 0).toFixed(0) +
        ' · θ研究所 ' + Number(lastResult.dysonPlan.thetaSupportedLabs || 0).toFixed(0) + '/' +
        Number(lastResult.dysonPlan.thetaTargetLabs || 0).toFixed(0);
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
      (lastResult.wonder ? ' · 奇观计划 ' + lastResult.wonder : '') +
      (SB.aiStrategy.isVoidEndingRun && SB.aiStrategy.isVoidEndingRun(s)
        ? ' · 虚境终局：信仰 ' + (s.civics && s.civics.void_faith ? '✓' : '待解锁') +
          ' / 探索 ' + (s.civics && s.civics.void_explore ? '✓' : '待解锁') +
          ' / 飞升 ' + (s.civics && s.civics.ascend_void ? '✓' : '待解锁') +
          ' / 祭坛 ' + (s.lvl && s.lvl.void_altar || 0) + '/3；飞升前保持太阳帆模式' : '') +
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
    if (lastResult && lastResult.thetaProduction) {
      var tp = lastResult.thetaProduction;
      summary += '\nθ产线 ' + tp.active + '/' + tp.levels + ' 座运行，原料可供 ' +
        tp.supportedLabs + ' 座，阶段原料目标 ' + (tp.stagedTargetLabs || tp.targetLabs) +
        '/' + tp.targetLabs + ' 座' +
        (tp.limiting ? ' · 当前瓶颈 ' + ({ iron: '精铁', titanium: '钛', uranium: '铀', kelp: '藻食', hydro: '热液能' }[tp.limiting] || tp.limiting) : '') +
        (lastResult.thetaDemandActive ? ' · 当前目标缺 θ，扩产上游优先' : '');
      if (lastResult.thetaBoostCard) summary += ' · 增产政策 ' +
        ({ card_flesh_weak: '血肉苦弱（精铁/θ +30%）', card_mineral_charter: '矿物章程（精铁 +15%）' }[lastResult.thetaBoostCard] || lastResult.thetaBoostCard);
      else if (lastResult.thetaKelpCard) summary += ' · 增产政策 农奴制（藻场随鱼牧场等级增产）';
      if (tp.limiting === 'iron') {
        var ironGross = Math.max(0, (Number(economyRates.iron) || 0) +
          (Number(SB.economy.thetaInputRates(s).iron) || 0));
        var nationalIronBonus = SB.wonder && SB.wonder.nationalLogisticsMul
          ? Number(SB.wonder.nationalLogisticsMul(s)) || 0 : 0;
        var storageUpgradeText = (lastResult.ironStorageUpgrades || []).map(function (upgrade) {
          return upgrade.installed ? upgrade.name + '已装' : upgrade.unlocked
            ? upgrade.name + (upgrade.canBuy ? '可买' : '筹料中') : upgrade.name + '未解锁';
        }).join('、');
        var ironYieldUpgradeText = ['upg_wasteforge', 'upg_fishbonemine'].map(function (id) {
          var upgrade = SB.workshop.upgradeById(id);
          if (!upgrade) return id + '不可用';
          if (s.upgrades && s.upgrades[id]) return id + '已装';
          var unlocked = (!upgrade.need || s.techs && s.techs[upgrade.need]) &&
            (!upgrade.needCivic || s.civics && s.civics[upgrade.needCivic]);
          return id + (unlocked ? (SB.workshop.upgradeCanBuy(s, id) ? '可买' : '筹料中') : '未解锁');
        }).join('、');
        summary += '\n精铁链：热泉炉 ' + Math.max(0, (s.lvl.furnace || 0) - (s.furnaceStop || 0)) + '/' +
          (s.lvl.furnace || 0) + ' · 毛产 ' + ironGross.toFixed(2) + '/秒，θ消耗 ' +
          (Number(SB.economy.thetaInputRates(s).iron) || 0).toFixed(2) + '/秒 · 金属库存 ' +
          (Number(s.res.silt) || 0).toFixed(0) + '/' + Number(SB.economy.capOf(s, 'silt')).toFixed(0) +
          ' · 物流铁产加成 +' + (nationalIronBonus * 100).toFixed(0) + '%' +
          ' · 增产升级 ' + ironYieldUpgradeText +
          (storageUpgradeText ? ' · 仓储升级 ' + storageUpgradeText : '');
      }
    }
    if (lastResult && lastResult.thetaKelpGather) {
      var kg = lastResult.thetaKelpGather;
      summary += '\nθ原料增产：采集者 ' + (kg.assigned || 0) + '/' + (kg.target || 0) +
        ' · 藻食净供给 ' + (Number(kg.currentSupply) || 0).toFixed(1) + '/' +
        (Number(kg.targetSupply) || 0).toFixed(1) + '/秒 · 每名采集者 +' +
        (Number(kg.marginalPerGather) || 0).toFixed(1) + '/秒';
    }
    if (lastResult && lastResult.titaniumMining) {
      var tm = lastResult.titaniumMining;
      var miningToolNames = { tool_pick: '青铜镐', tool_ironPick: '铁镐', tool_steelPick: '钢镐', tool_thetaPick: 'θ镐' };
      var ownedMiningNames = (tm.tools || []).map(function (id) { return miningToolNames[id] || id; });
      var plannedMiningNames = (tm.plannedTools || []).map(function (id) { return miningToolNames[id] || id; });
      var titaniumPlanText = tm.needed
        ? '钛供给 ' + (Number(tm.supply) || 0).toFixed(1) + '/' + (Number(tm.targetRate) || 0).toFixed(1) + '/秒 · 矿工 ' +
          (tm.assignedMiners || 0) + '/' + (tm.plannedMiners || 0)
        : '钛供给充足 ' + (Number(tm.supply) || 0).toFixed(1) + '/' + (Number(tm.targetRate) || 0).toFixed(1) + '/秒 · 矿工 ' +
          (tm.assignedMiners || 0);
      summary += '\n钛增产：深层矿井 ' + (tm.deepmineInstalled ? '已装' : '未装') + ' · 砂矿坑 ' +
        (tm.activeMineLevels || 0) + '/' + (tm.mineLevels || 0) + ' · ' + titaniumPlanText + ' · 镐效 ×' +
        (Number(tm.miningMultiplier) || 1).toFixed(2) + ' · 自动化钻探 ' +
        (tm.autodrill ? '已装' : tm.autodrillTech ? '已解锁、待装' : '科技未解锁') +
        (ownedMiningNames.length ? ' · 已有 ' + ownedMiningNames.join('、') : '') +
        (plannedMiningNames.length ? ' · 待购 ' + plannedMiningNames.join('、') : '');
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
      var blockedResourceName = ({ kelp: '藻食', coral: '珊瑚', stone: '石头', iron: '精铁',
        titanium: '钛', uranium: '铀', warmstone: '暖石' }[lastResult.capacityBlockedResource] ||
        lastResult.capacityBlockedResource || '材料');
      var capacityUpgradeNames = { upg_kelpstore_1: '藻食库扩容 I', upg_kelpstore_2: '藻食库扩容 II',
        upg_ballast_1: '压舱库扩容 I', upg_ballast_2: '压舱库扩容 II', upg_alloy_warehouse: '合金仓扩容' };
      var capacityBuildNames = { kelpstore: '海藻仓', ballast: '压舱仓', hall: '议事厅（城堡）' };
      var capacityAction = capacityUpgradeNames[lastResult.plannedUpgrade] ||
        capacityBuildNames[lastResult.build] || lastResult.build || '扩容设施';
      var fallbackSummary = Object.keys(fallbackCost).map(function (resource) {
        var cap = SB.economy.capOf(s, resource);
        return resource + ' ' + (s.res[resource] || 0).toFixed(0) + '/' +
          (isFinite(cap) ? cap.toFixed(0) : '∞') + ' (目标 ' + fallbackCost[resource].toFixed(0) + ')';
      }).join(' · ');
      summary += '\n仓储瓶颈：' + fallbackId + ' 超过材料上限（' + blockedResourceName + '），当前扩容目标 ' + capacityAction +
        (fallbackSummary ? ' · ' + fallbackSummary : '');
    }
    stats.textContent = summary;
    publishStatus(s, false, economyRates);
  }
  function safeRefresh() {
    try { refresh(); }
    catch (e) {
      lastError = '面板刷新异常：' + (e && e.message ? e.message : String(e));
      say(lastError);
      try { publishStatus(SB.game.run(), true); } catch (ignored) {}
    }
  }
  function timerTick() {
    var now = Date.now();
    if (now - lastDecision >= DECISION_INTERVAL_MS) {
      lastDecision = now;
      try { step(); }
      catch (e) {
        lastError = 'AI 决策异常：' + (e && e.message ? e.message : String(e));
        say(lastError);
      }
    }
    /* 即使策略或诊断面板抛错，也让另一部分继续执行并上报错误，避免整块遥测冻结。 */
    if (now - lastPanelRefresh >= PANEL_REFRESH_MS) {
      lastPanelRefresh = now;
      safeRefresh();
    }
  }
  function start() {
    if (!started) {
      started = true; SB.game.setSpeed(GAME_SPEED);
      investTidePoints(SB.game.run(), '继续AI');
      var b = document.querySelector('.spd[data-spd="' + GAME_SPEED + '"]'); if (b) b.classList.add('on');
      say('AI 正在通过共用策略和正式游戏 API 操作这一局。');
    }
    if (!timer) timer = root.setInterval(timerTick, AI_TIMER_MS);
    safeRefresh();
  }
  function pause() {
    started = false;
    if (timer) { root.clearInterval(timer); timer = null; }
    safeRefresh(); publishStatus(SB.game.run(), true); say('AI 已暂停；游戏仍按当前速度运行。');
  }
  function boot() {
    initPanel(); SB.game.setSpeed(GAME_SPEED);
    var speedBtn = document.querySelector('.spd[data-spd="' + GAME_SPEED + '"]'); if (speedBtn) speedBtn.classList.add('on');
    started = true;
    investTidePoints(SB.game.run(), '页面启动');
    timer = root.setInterval(timerTick, AI_TIMER_MS);
    say('接管当前周目，游戏速度 ' + GAME_SPEED + '×。'); safeRefresh();
  }
  /* 主游戏循环只用这个只读信号判断：AI 活跃且标签页被浏览器节流时，
   * 继续按 30×在线推进，暂停 AI 后则仍使用常规离线结算。 */
  SB.aiPlayer = { isRunning: function () { return started; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else root.setTimeout(boot, 0);
})(typeof window !== 'undefined' ? window : globalThis);
