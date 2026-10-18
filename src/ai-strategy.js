/* 天壳 · 可复用自动游玩策略
 * 浏览器 AI、整局模拟和挑战验证共用这套决策；只调用游戏规则 API，不复制经济公式到各个 runner。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var warmstoneTargetCache = { state: null, rate: null, season: null, until: -Infinity, miners: 0 };

  function isOwned(s, id) { return !!(s && s.wonders && s.wonders[id]); }
  function availableBuilding(s, id) {
    var b = SB.habitat.buildingById(id);
    return !!(b && SB.habitat.unlocked(s, b) && SB.habitat.needMet(s, b));
  }
  function freeBuilding(s, id) {
    return availableBuilding(s, id) && SB.economy.canAfford(s, SB.economy.costOf(s, id));
  }
  function firstMissingPrereq(s, id, seen) {
    var t = SB.tech.byId(id), reqs = t && t.reqs || [];
    seen = seen || [];
    if (!t || s.techs[id] || seen.indexOf(id) >= 0) return null;
    seen.push(id);
    for (var i = 0; i < reqs.length; i++) {
      if (!s.techs[reqs[i]]) return firstMissingPrereq(s, reqs[i], seen) || reqs[i];
    }
    return id;
  }
  function wonderTechPrereq(s, key) {
    var cond = key && key.cond;
    if (!cond || cond.t !== 'wonders') return null;
    var ids = cond.ids || [];
    for (var i = 0; i < ids.length; i++) {
      var w = SB.workshop.wonderById(ids[i]);
      if (!w || isOwned(s, w.id) || !w.need || s.techs && s.techs[w.need]) continue;
      var id = firstMissingPrereq(s, w.need), t = id && SB.tech.byId(id);
      if (t && t.era <= s.era) return t;
    }
    return null;
  }
  function researchGoal(s) {
    var keys = SB.tech.keysOf(s.era) || [], key = null;
    for (var i = 0; i < keys.length; i++) if (!s.techs[keys[i].id]) { key = keys[i]; break; }
    /* 关键节点全清会推进纪元，但不少普通科技仍是后续系统的前置（导航→数学→教育等）。
     * 关键节点完成后，继续按科技表顺序补齐当前已开放时代的普通科技，不把它们误当成可忽略项。 */
    if (!key) {
      var all = SB.TECHS || [];
      for (var j = 0; j < all.length; j++) {
        if (all[j].era <= s.era && !s.techs[all[j].id]) { key = all[j]; break; }
      }
    }
    var id = key && firstMissingPrereq(s, key.id), tech = id && SB.tech.byId(id);
    /* 关键科技的尤里卡有时要求建奇观，而该奇观又被本纪元普通科技锁住。
     * 若只追 key 的尤里卡，bot 会永远等一个当前不可建的奇观（ERA5：天穹钻机
     * 等高压热机管道，但管道需要先研究《高压热机》）。先回溯必需奇观的科技门，
     * 把对应科技/其前置当作当前目标，让它自己的尤里卡驱动资源与建筑策略。 */
    var wonderTech = key && id === key.id ? wonderTechPrereq(s, key) : null;
    if (wonderTech) {
      key = wonderTech;
      id = firstMissingPrereq(s, key.id);
      tech = id && SB.tech.byId(id);
    }
    /* 关键科技被前置链挡住时，当前目标是缺失前置，不是关键科技本身。
     * 必须随 goal.id 切换尤里卡条件；否则会错误追逐远端 key 的地块门槛
     * （例如先冲学术区 35 级，却不建导航要求的 3 座压舱物）。 */
    return { key: key, id: id, tech: tech,
      cond: key && id === key.id ? key.cond : tech && tech.cond };
  }
  function houseCapacityTarget(s, goal, options) {
    var limit = SB.challenges && SB.challenges.populationLimit ? SB.challenges.populationLimit(s) : Infinity;
    var desired = options && options.targetPopulation;
    /* 纪元 2 起给岗位留出基本余量，但不为可选人口门槛一路扩到 50；住房造价
     * 会指数增长，过度追人口会挤掉学者/书手并拖慢破壳科技。只有当前尤里卡明确
     * 要求更高人口时，下面的 cond.pop 才会抬高目标。挑战人口上限仍在下方钳制。 */
    if (!(desired > 0)) {
      /* 寒流禁火期间不能用暖石免冻伤，人口会在寒流季持续损失；保留更大的住房
       * 缓冲，避免短期减员后人口门槛/岗位整体停摆。该挑战没有人口上限。 */
      desired = s.challenge && s.challenge.id === 'cold' ? 50 : (s.era >= 2 ? 30 : 25);
    }
    if (goal && goal.cond && goal.cond.t === 'pop') desired = Math.max(desired, goal.cond.n);
    if (isFinite(limit)) desired = Math.min(desired, limit);
    return Math.max(s.pop, desired);
  }
  function bedsPerLevel(s, id) {
    var before = SB.economy.popCap(s), old = s.lvl[id] || 0;
    s.lvl[id] = old + 1;
    var after = SB.economy.popCap(s);
    s.lvl[id] = old;
    return after - before;
  }
  function costExceedsCapacity(s, cost) {
    for (var r in cost || {}) {
      var cap = SB.economy.capOf(s, r);
      if (isFinite(cap) && cost[r] > cap) return true;
    }
    return false;
  }
  function pickHouse(s, targetCap) {
    if (SB.economy.popCap(s) >= targetCap) return null;
    var best = null, score = Infinity;
    ['nest', 'coralhouse'].forEach(function (id) {
      if (!availableBuilding(s, id)) return;
      var cost = SB.economy.costOf(s, id), per = bedsPerLevel(s, id);
      if (per <= 0 || costExceedsCapacity(s, cost)) return;
      var unit = 0;
      for (var r in cost) unit += cost[r] / per;
      if (unit < score) { score = unit; best = id; }
    });
    return best;
  }
  function housingBlockedByCapacity(s, targetCap) {
    if (SB.economy.popCap(s) >= targetCap) return false;
    var ids = ['nest', 'coralhouse'], any = false, allBlocked = true;
    for (var i = 0; i < ids.length; i++) {
      if (!availableBuilding(s, ids[i])) continue;
      any = true;
      if (!costExceedsCapacity(s, SB.economy.costOf(s, ids[i]))) allBlocked = false;
    }
    return any && allBlocked;
  }
  function storageBuild(s) {
    /* upg_castle 的议事厅同时提供仓储与递增减耗；先把核心升到衰减区（约 20 级），
     * 既提高上限，也降低住房/关键建筑造价，再用压舱仓补足剩余容量。 */
    if (s.upgrades && s.upgrades.upg_castle && availableBuilding(s, 'hall') &&
        (s.lvl.hall || 0) < 20) return 'hall';
    if (availableBuilding(s, 'ballast')) return 'ballast';
    if (s.upgrades && s.upgrades.upg_castle && availableBuilding(s, 'hall')) return 'hall';
    return null;
  }
  function storageUpgrade(s) {
    var ids = ['upg_ballast_1', 'upg_ballast_2', 'upg_alloy_warehouse'];
    for (var i = 0; i < ids.length; i++) {
      var u = SB.workshop.upgradeById(ids[i]);
      if (!u || s.upgrades && s.upgrades[ids[i]]) continue;
      if (u.need && !(s.techs && s.techs[u.need])) continue;
      return u;
    }
    return null;
  }
  function wonderEligible(s, w) {
    return !isOwned(s, w.id) && w.era <= s.era &&
      (!w.need || s.techs[w.need]) && (!w.needCivic || s.civics && s.civics[w.needCivic]);
  }
  function shellGateNeedsDrill(s, goal) {
    var cond = goal && goal.cond;
    return !!(cond && cond.t === 'shell' && SB.shell && SB.shell.brokenRatio &&
      SB.shell.brokenRatio(s) + 1e-9 < cond.n);
  }
  function goalCost(s, goal) {
    var cond = goal && goal.cond;
    if (!cond) return {};
    if (cond.t === 'upgrade') {
      var u = SB.workshop.upgradeById(cond.id);
      return u && u.cost || {};
    }
    if (cond.t === 'built') return SB.economy.costOf(s, cond.b);
    if (cond.t === 'wonders') {
      for (var i = 0; i < (cond.ids || []).length; i++) {
        var w = SB.workshop.wonderById(cond.ids[i]);
        if (w && wonderEligible(s, w)) return w.cost || {};
      }
    }
    return {};
  }
  function hydroSupportCap(s) {
    var per = SB.UNIT && SB.UNIT.hydroWarm || 5;
    /* ⚠️ 2026-10-16：rates().warmstone 已扣掉**当前运行**汽轮机的耗石（面板===结算，
     *   见 economy-rates 里那行 _turL 扣减）。直接拿它算「还能跑几座」会变成**循环定义** ——
     *   汽轮机一跑，余量就被它自己吃掉一份，cap 反而归 0；bot 于是把刚开的又停掉，
     *   停掉后余量回升、下一步再开，来回抖（症状：单步 step 后 running 恒为 0）。
     *   判断依据必须是**毛供**（不含汽轮机自身扣费）：把已扣的那一份加回来。 */
    var warmRate = SB.economy && SB.economy.rates ? SB.economy.rates(s).warmstone || 0 : 0;
    if (SB.economy && SB.economy.warmDraw) warmRate += SB.economy.warmDraw(s, 'hydroturbine');
    return Math.max(0, Math.floor((warmRate + 1e-9) / per));
  }
  function minersForWarmstone(s, targetRate) {
    if (!SB.economy || !SB.economy.rates || !s.jobs) return s.jobs && s.jobs.miner || 0;
    var season = SB.economy.seasonIdx ? SB.economy.seasonIdx(s) : null;
    if (warmstoneTargetCache.state === s && warmstoneTargetCache.rate === targetRate &&
        warmstoneTargetCache.season === season && (s.t || 0) < warmstoneTargetCache.until)
      return warmstoneTargetCache.miners;
    var old = s.jobs.miner || 0, base, one;
    try {
      s.jobs.miner = 0;
      base = SB.economy.rates(s).warmstone || 0;
      s.jobs.miner = 1;
      one = SB.economy.rates(s).warmstone || 0;
    } finally { s.jobs.miner = old; }
    var perMiner = one - base;
    var target = perMiner > 0 ? Math.max(0, Math.ceil((targetRate - base) / perMiner)) : old;
    warmstoneTargetCache = { state: s, rate: targetRate, season: season,
      until: (s.t || 0) + 2, miners: target };
    return target;
  }
  function chooseWonder(s, goal, options) {
    var ids = goal && goal.cond && goal.cond.t === 'wonders' ? goal.cond.ids || [] : [];
    for (var i = 0; i < ids.length; i++) {
      var required = SB.workshop.wonderById(ids[i]);
      if (required && wonderEligible(s, required)) return required.id;
    }
    var wonderUnlocksCivic = (SB.CIVICS || []).some(function (c) {
      return !s.civics[c.id] && c.boost && c.boost.t === 'wonder' &&
        (c.reqs || []).every(function (id) { return !!s.civics[id]; });
    });
    /* 可选奇观不能抢占刚需住房：尤其寒流禁火需要保留 50 人的冻伤缓冲，
     * 小国寡民则由人口上限自然钳住目标。若已解锁的待研究市政明确要求奇观，
     * 先补这座关键奇观，避免住房扩张反过来堵住《神学》等通关前置。 */
    if (!wonderUnlocksCivic && SB.economy.popCap(s) < houseCapacityTarget(s, goal, options)) return null;
    /* 可复用 bot 默认补齐所有可建奇观。天穹钻机通常排最后；但若当前关键科技
     * 明确要求壳层 100% 破除，且剩余奇观被破壳后的科技锁住，就必须先启动钻机打通时代门，
     * 玩家选择留在本局后 bot 再回来补齐剩余奇观。
     * 调用方可显式 buildAllWonders:false 恢复旧的「只建当前门槛奇观/首座奇观」策略。 */
    var rows = SB.WONDERS || [];
    if (!options || options.buildAllWonders !== false) {
      for (var j = 0; j < rows.length; j++)
        if (rows[j].id !== 'wonder_skydrill' && wonderEligible(s, rows[j])) return rows[j].id;
      var pendingBeforeDrill = rows.some(function (w) {
        return w.id !== 'wonder_skydrill' && !isOwned(s, w.id);
      });
      var drill = SB.workshop.wonderById('wonder_skydrill');
      if ((!pendingBeforeDrill || shellGateNeedsDrill(s, goal)) && drill && wonderEligible(s, drill)) return drill.id;
      return null;
    }
    if (SB.wonder.count(s) > 0) return null;
    for (var k = 0; k < rows.length; k++) if (wonderEligible(s, rows[k])) return rows[k].id;
    return null;
  }
  function wonderPrereqUpgrade(s, goal) {
    var ids = goal && goal.cond && goal.cond.t === 'wonders' ? goal.cond.ids || [] : [];
    for (var i = 0; i < ids.length; i++) {
      var w = SB.workshop.wonderById(ids[i]);
      if (!w || isOwned(s, w.id) || !w.need || s.techs && s.techs[w.need]) continue;
      var tech = SB.tech.byId(w.need), cond = tech && tech.cond;
      if (cond && cond.t === 'upgrade' && !(s.upgrades && s.upgrades[cond.id])) return cond.id;
    }
    return null;
  }
  function drillStockTarget(s) {
    if (!s || !s.techs || !s.techs.shellgeo || s.broken) return 0;
    var shellRate = SB.CFG.SKYDRILL_RATE * (1 + 0.05 * ((SB.prestige.legacy() || {}).shellSurveyLevel || 0));
    /* 基础削壳会先把壳推到 25% 下限；钻机要凿的是下限以内的整段，
     * 不是「当前壳厚超过下限的部分」。用 min 保证在下限处仍按最后 25% 备料。 */
    var drillShell = Math.min(Math.max(0, s.shell || 0),
      (s.iceShell || SB.CFG.ICE_SHELL) * SB.CFG.FLOOR_AT);
    return 20 + Math.ceil(drillShell / Math.max(1, shellRate) * SB.CFG.SKYDRILL_DRILL * 1.05);
  }
  function chooseBuild(s, goal, options) {
    var cond = goal.cond, targetCap = houseCapacityTarget(s, goal, options), id, rows, i;
    /* 工坊与议事厅是后续制作/市政的系统入口。避免先把有限材料全投给其他建筑，
     * 结果到了石梁、硬化珊瑚或市政门槛时才发现生产设施从未建起来。 */
    if (availableBuilding(s, 'workshop') && !s.lvl.workshop) return 'workshop';
    if (availableBuilding(s, 'hall') && !s.lvl.hall) return 'hall';
    /* 《工业化》的尤里卡检查热液能总供给，不是扣除工坊消耗后的净流量。
     * 关键科技回溯可能把该 rate 条件设为当前目标；按真实 rates 补汽轮机。 */
    if (cond && cond.t === 'rate' && cond.r === 'hydroSupply') {
      var hydroSupply = SB.economy.rates(s).hydroSupply || 0;
      if (hydroSupply + 1e-9 < cond.n) {
        var runningTurbines = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0));
        var perTurbine = runningTurbines > 0 ? hydroSupply / runningTurbines :
          Math.max(0.001, SB.UNIT && SB.UNIT.hydroOut || 1);
        perTurbine = Math.max(0.001, perTurbine);
        var neededTurbines = runningTurbines + Math.ceil((cond.n - hydroSupply) / perTurbine);
        /* 先铺出所需装机容量，即使当前暖石只够部分汽轮机运行；step() 会停掉不可持续部分，
         * 并提高矿工权重补暖石。把「当前可持续数」当建造上限会让条件长期低于阈值、反复选别的建筑。 */
        if (availableBuilding(s, 'hydroturbine') && (s.lvl.hydroturbine || 0) < neededTurbines)
          return 'hydroturbine';
      }
    }
    /* 钢制工具的工具尤里卡需要真实钢库存；钢来自「热液汽轮机 → 热液工坊」，
     * 不是矿工直接生产。门槛到达时补齐这条生产链，避免只给矿工配工却永远等不到钢。 */
    if (cond && cond.t === 'tools') {
      var steelNeeded = 0, tools = SB.workshop.tools() || [];
      (cond.ids || []).forEach(function (toolId) {
        if (s.tools && s.tools[toolId]) return;
        var tool = tools.filter(function (x) { return x.id === toolId; })[0];
        if (tool && tool.cost) steelNeeded += tool.cost.steel || 0;
      });
      if (steelNeeded > (s.res.steel || 0)) {
        if (availableBuilding(s, 'hydroturbine') && !(s.lvl.hydroturbine || 0)) return 'hydroturbine';
        if (availableBuilding(s, 'hydroshop') && !(s.lvl.hydroshop || 0)) return 'hydroshop';
      }
    }
    if (cond && cond.t === 'built' && (s.lvl[cond.b] || 0) < cond.n) {
      var requiredBuilding = SB.habitat.buildingById(cond.b);
      if (requiredBuilding && SB.habitat.unlocked(s, requiredBuilding) && SB.habitat.needMet(s, requiredBuilding)) return cond.b;
    }
    if (cond && cond.t === 'upgrade') {
      var requiredUpgrade = SB.workshop.upgradeById(cond.id);
      if (requiredUpgrade && requiredUpgrade.upgradesBuilding && !s.lvl[requiredUpgrade.upgradesBuilding] &&
          availableBuilding(s, requiredUpgrade.upgradesBuilding)) return requiredUpgrade.upgradesBuilding;
    }
    /* 高阶升级/奇观会消耗大量钢制零件。按当前目标扩充汽轮机与热液工坊配套，
     * 避免只靠单台产线慢慢攒；10 级上限也与「工业化」的 10/s 尤里卡目标同源。 */
    var partTarget = goalCost(s, goal).steelPart || 0;
    /* 选建普通奇观时也要筹热液产线：仅看当前科技尤里卡会漏掉可选奇观的钢制零件成本，
     * 结果 bot 有目标、也在派矿工，却没有汽轮机/工坊把钢转出来。 */
    var plannedWonderId = chooseWonder(s, goal, options);
    var plannedWonder = plannedWonderId && SB.workshop.wonderById(plannedWonderId);
    if (plannedWonder) partTarget = Math.max(partTarget, plannedWonder.cost && plannedWonder.cost.steelPart || 0);
    var upgradeForWonder = wonderPrereqUpgrade(s, goal);
    var wonderSupportUpgrade = upgradeForWonder && SB.workshop.upgradeById(upgradeForWonder);
    if (wonderSupportUpgrade) partTarget = Math.max(partTarget,
      wonderSupportUpgrade.cost && wonderSupportUpgrade.cost.steelPart || 0);
    var partRecipe = recipeByResource('steelPart');
    var partRemain = Math.max(0, partTarget - (s.res.steelPart || 0));
    if (partRemain > 0 && partRecipe && recipeUnlocked(s, partRecipe)) {
      var hydroTarget = Math.min(10, hydroSupportCap(s), Math.max(2, Math.ceil(partRemain / 25)));
      if (availableBuilding(s, 'hydroturbine') && (s.lvl.hydroturbine || 0) < hydroTarget) return 'hydroturbine';
      if (availableBuilding(s, 'hydroshop') && (s.lvl.hydroshop || 0) < hydroTarget) return 'hydroshop';
    }
    /* 开门基础科技页必须先铺到第 5 座藻场；若把住房扩张排在它之前，
     * 开局人口会一直挤在首座巢里，学者职业无法解锁，科技产出永远为 0。 */
    if (availableBuilding(s, 'kelp') && s.lvl.kelp < 5) return 'kelp';
    /* 口粮优先于扩容：提高建筑侧食物供给，给研究/采矿/市政岗位腾出族民。 */
    var kelpTarget = Math.max(5, Math.ceil(s.pop / 2) + 3);
    var nextKelpCost = SB.economy.costOf(s, 'kelp').kelp || 0;
    if (availableBuilding(s, 'kelpstore') && nextKelpCost > SB.economy.capOf(s, 'kelp') && s.lvl.kelpstore < 3) return 'kelpstore';
    if (availableBuilding(s, 'kelp') && s.lvl.kelp < kelpTarget) return 'kelp';
    id = pickHouse(s, targetCap);
    if (id) return id;
    /* 住房成本越过仓储时，不能因此饿死正在追逐的区域尤里卡；它可能解锁
     * 后续科技/市政，反过来提供扩仓与住房所需的系统。可建住房仍在上面优先。 */
    if (cond && cond.t === 'zoneLvl' && !SB.tech.condMet(s, cond)) {
      rows = (SB.BUILDINGS || []).filter(function (b) {
        return b.zone === cond.zone && SB.habitat.unlocked(s, b) && SB.habitat.needMet(s, b);
      });
      rows.sort(function (a, b) {
        function total(x) { var n = 0, c = SB.economy.costOf(s, x.id); for (var k in c) n += c[k]; return n; }
        return total(a) - total(b);
      });
      if (rows.length) return rows[0].id;
    }
    /* 住房价格会跨过珊瑚/石头的仓储上限；若候选住房因容量而不可达，
     * 再建压舱仓扩容，否则 bot 会永远选中买不起的下一座房并停在当前人口。 */
    if (housingBlockedByCapacity(s, targetCap)) {
      var storage = storageBuild(s);
      if (storage) return storage;
    }
    /* 先铺稳定口粮与储存，再解锁新系统；战时（寒流）不强行开保温法。 */
    if (availableBuilding(s, 'weir') && s.lvl.kelp > 0 && s.lvl.weir < 4) return 'weir';
    if (availableBuilding(s, 'warmnest') && s.pop >= 6 && s.lvl.warmnest < 8) return 'warmnest';
    if (availableBuilding(s, 'kelpstore') && s.lvl.kelp > 0 && s.lvl.kelpstore < 4) return 'kelpstore';
    if (availableBuilding(s, 'ballast') && s.lvl.kelp > 0 && s.lvl.ballast < 8) return 'ballast';
    var unlock = ['siltpit', 'hall', 'workshop', 'furnace', 'library'];
    for (i = 0; i < unlock.length; i++) if (availableBuilding(s, unlock[i]) && !s.lvl[unlock[i]]) return unlock[i];
    if (availableBuilding(s, 'furnace') && s.lvl.furnace < 3) return 'furnace';
    if (availableBuilding(s, 'library') && s.lvl.library < 6) return 'library';
    if (availableBuilding(s, 'siltpit') && s.lvl.siltpit < 3) return 'siltpit';
    return null;
  }
  function shouldPrioritizeConditionBuild(s, goal, buildId) {
    var cond = goal && goal.cond;
    return buildId === 'hydroturbine' && cond && cond.t === 'rate' && cond.r === 'hydroSupply' &&
      (SB.economy.rates(s).hydroSupply || 0) + 1e-9 < cond.n;
  }
  function recipeByResource(resource) {
    var rows = SB.workshop.crafts();
    for (var i = 0; i < rows.length; i++) if (rows[i].res === resource) return rows[i];
    return null;
  }
  function recipeUnlocked(s, c) {
    return !!(s.lvl.workshop > 0 && (!c.need || s.techs && s.techs[c.need]) &&
      (!c.needCivic || s.civics && s.civics[c.needCivic]));
  }
  function ensureCraft(s, resource, target, emit, seen) {
    var c = recipeByResource(resource), have = s.res[resource] || 0;
    if (!c || have >= target || !recipeUnlocked(s, c)) return false;
    seen = seen || [];
    if (seen.indexOf(resource) >= 0) return false;
    seen.push(resource);
    var mul = SB.workshop.craftMul(s, c), perOut = c.out * mul;
    var wanted = Math.max(1, Math.ceil((target - have) / perOut));
    var costMul = SB.workshop.craftCostMul(s, c);
    /* 原料库存可能永远装不下整份目标（例如多级压舱仓所需的石头 > 石料仓上限）。
     * 递归补料后按现有原料能支持的批数下调本次制造量，让 bot 能分批生产并累积工艺品。 */
    for (var k in c.in) {
      var perBatch = c.in[k] * costMul;
      var need = perBatch * wanted;
      if ((s.res[k] || 0) < need) {
        var inputRecipe = recipeByResource(k);
        if (inputRecipe && recipeUnlocked(s, inputRecipe))
          ensureCraft(s, k, (s.res[k] || 0) + need, emit, seen.slice());
      }
      var availableBatches = perBatch > 0 ? Math.floor((s.res[k] || 0) / perBatch) : wanted;
      wanted = Math.min(wanted, availableBatches);
      if (wanted <= 0) return false;
    }
    if (SB.workshop.craftBlocked(s, c.id) !== null) return false;
    return SB.workshop.craft(s, c.id, wanted, emit) > 0;
  }
  function expandPrimaryNeeds(s, resource, amount, out, seen) {
    var c = recipeByResource(resource);
    if (!c || !recipeUnlocked(s, c)) { out[resource] = (out[resource] || 0) + amount; return; }
    seen = seen || [];
    if (seen.indexOf(resource) >= 0) { out[resource] = (out[resource] || 0) + amount; return; }
    seen.push(resource);
    var n = Math.max(0, amount - (s.res[resource] || 0));
    if (n <= 0) return;
    var batches = n / (c.out * SB.workshop.craftMul(s, c));
    var cm = SB.workshop.craftCostMul(s, c);
    for (var k in c.in) expandPrimaryNeeds(s, k, batches * c.in[k] * cm, out, seen.slice());
  }
  function addCostNeeds(s, cost, out) {
    for (var k in cost || {}) {
      var deficit = Math.max(0, cost[k] - (s.res[k] || 0));
      if (deficit) expandPrimaryNeeds(s, k, deficit, out, []);
    }
  }
  function resourceJob(resource) {
    if (resource === 'coral') return 'coralwright';
    if (resource === 'stone') return 'quarrier';
    if (['silt', 'iron', 'steel', 'warmstone', 'titanium'].indexOf(resource) >= 0) return 'miner';
    if (resource === 'science') return 'scholar';
    if (resource === 'culture') return 'scribe';
    if (resource === 'luxury') return 'merchant';
    if (resource === 'kelp') return 'gather';
    return null;
  }
  function nextScienceCost(s, goal) {
    var ordered = [], seen = [];
    function add(id) {
      var t = SB.tech.byId(id);
      if (!t || s.techs[id] || seen.indexOf(id) >= 0) return;
      seen.push(id); (t.reqs || []).forEach(add); ordered.push(t);
    }
    if (goal.key) add(goal.key.id);
    (SB.TECHS || []).forEach(function (t) {
      if (t.era <= s.era && !s.techs[t.id] && seen.indexOf(t.id) < 0) ordered.push(t);
    });
    for (var i = 0; i < ordered.length; i++) {
      var t = ordered[i];
      /* 折扣口（2026-10-17）：科研所 researchLabSave 让实付 < t.cost，排序/预算按折后价才不失真。 */
      if (t.era <= s.era && SB.tech.isRevealed(s, t.id) && SB.tech.reqsMet(s, t) && SB.tech.condMet(s, t.cond))
        return SB.tech.researchCost ? SB.tech.researchCost(s, t) : t.cost;
    }
    return null;
  }
  function nextCivicCost(s) {
    if (!SB.civic.panelOpen(s)) return null;
    for (var i = 0; i < SB.CIVICS.length; i++) {
      var c = SB.CIVICS[i];
      if (!s.civics[c.id] && SB.civic.isRevealed(s, c.id) && SB.civic.reqsMet(s, c) && SB.civic.boostMet(s, c)) return c.cost;
    }
    return null;
  }
  function nextCivicBoost(s) {
    if (!SB.civic.panelOpen(s)) return null;
    var fallback = null;
    for (var i = 0; i < SB.CIVICS.length; i++) {
      var c = SB.CIVICS[i];
      if (c.era && c.era > s.era || s.civics[c.id] || !SB.civic.reqsMet(s, c)) continue;
      /* 节点未揭示时也要追它自己的鼓舞：否则像「累计奢侈品产出」这种显形门槛
       * 永远不会被 bot 主动推进，后继市政与政策卡就会一起卡住。 */
      if (!c.boost || SB.civic.boostMet(s, c)) continue;
      if (c.boost.t === 'job' && SB.folk.jobUnlocked(s, c.boost.j)) return c.boost;
      if (c.boost.t === 'gathered' || c.boost.t === 'res') {
        if (resourceJob(c.boost.r)) return c.boost;
      }
      if (!fallback) fallback = c.boost;
    }
    return fallback;
  }
  function step(s, options) {
    options = options || {};
    if (!s || s.broken || !SB || !SB.game || !SB.tech) return { changed: false, goal: null };
    var emit = options.emit || SB.game.emit, changed = false, actions = 0;
    function did(ok) { if (ok) { changed = true; actions++; } return !!ok; }
    var goal = researchGoal(s), cond = goal.cond;
    /* 真开局的两次手动采集：等价于点游戏内采集按钮，不注入免费资源。 */
    if (!(s.lvl.nest || 0)) {
      var nestCost = SB.economy.costOf(s, 'nest').coral || 0;
      for (var g = 0; g < 5 && (s.res.coral || 0) < nestCost; g++) did(SB.economy.addRes(s, 'coral', SB.GATHER.coral));
    }
    if (s.challenge && s.challenge.id === 'abyss' && !s.lvl.kelp) {
      var kelpCost = SB.economy.costOf(s, 'kelp').kelp || 0;
      for (var kg = 0; kg < 25 && (s.res.kelp || 0) < kelpCost; kg++) did(SB.economy.addRes(s, 'kelp', SB.GATHER.kelp));
    }
    var cold = SB.economy.isCold(s), gatherNow = s.jobs.gather || 0;
    /* 用真实 foodRate 暂时算出「建筑底产」与「每名采集者边际产量」，这样会自然包含
     * 季节、政策、公司、挑战产出惩罚等乘区，不在 bot 里维护一份近似版经济公式。 */
    s.jobs.gather = 0;
    var builtFood = SB.economy.foodRate(s);
    s.jobs.gather = 1;
    var foodJob = SB.economy.foodRate(s) - builtFood;
    s.jobs.gather = gatherNow;
    var foodNeed = foodJob > 0 ? Math.ceil((SB.economy.foodUse(s) * 1.12 - builtFood) / foodJob) : 0;
    foodNeed = Math.max(0, Math.min(foodNeed, s.pop > 1 ? s.pop - 1 : s.pop));
    var weights = { coralwright: 0.20, quarrier: 0.10, scholar: 0.20, miner: 0.18, scribe: 0.08, merchant: 0.04 };
    var scienceCost = nextScienceCost(s, goal);
    if (scienceCost && (s.res.science || 0) < scienceCost) weights.scholar = Math.max(weights.scholar, 0.62);
    var civicCost = nextCivicCost(s), civicBoost = nextCivicBoost(s);
    if (civicCost && (s.res.culture || 0) < civicCost) weights.scribe = Math.max(weights.scribe, 0.52);
    if (civicBoost && civicBoost.t === 'job') weights[civicBoost.j] = Math.max(weights[civicBoost.j] || 0, 0.92);
    if (civicBoost && civicBoost.t === 'gathered') {
      var boostJob = resourceJob(civicBoost.r);
      if (boostJob && boostJob !== 'gather') weights[boostJob] = Math.max(weights[boostJob] || 0, 0.92);
    }
    if (civicBoost && civicBoost.t === 'res') {
      var boostResJob = resourceJob(civicBoost.r);
      if (boostResJob && boostResJob !== 'gather') weights[boostResJob] = Math.max(weights[boostResJob] || 0, 0.92);
    }
    if (cond && cond.t === 'res') {
      var cj = resourceJob(cond.r); if (cj && cj !== 'gather') weights[cj] = 0.68;
    }
    if (cond && cond.t === 'rate' && cond.r === 'hydroSupply' &&
        (SB.economy.rates(s).hydroSupply || 0) + 1e-9 < cond.n) {
      var runningTurbines = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0));
      var perTurbine = runningTurbines > 0
        ? (SB.economy.rates(s).hydroSupply || 0) / runningTurbines
        : Math.max(0.001, SB.UNIT && SB.UNIT.hydroOut || 1);
      var requiredTurbines = Math.ceil(cond.n / Math.max(0.001, perTurbine));
      if (hydroSupportCap(s) < requiredTurbines) weights.miner = Math.max(weights.miner || 0, 0.85);
    }
    if (cond && cond.t === 'job') weights[cond.j] = 0.72;
    var nextBuild = chooseBuild(s, goal, options);
    var nextWonder = chooseWonder(s, goal, options);
    /* 未满足的硬性科技条件优先于可选奇观：否则奇观队列会抢走建造动作，
     * bot 明明识别出要补汽轮机，却一直停在同一尤里卡门槛。 */
    if (shouldPrioritizeConditionBuild(s, goal, nextBuild)) nextWonder = null;
    var supportUpgradeId = wonderPrereqUpgrade(s, goal);
    var housingTarget = houseCapacityTarget(s, goal, options);
    var housingNeed = pickHouse(s, housingTarget);
    /* 城堡升级能帮助打通住房或关键尤里卡建筑被仓储上限挡住的情况。 */
    var housingCapacityBlocked = housingBlockedByCapacity(s, housingTarget);
    var buildCapacityBlocked = !!(nextBuild && costExceedsCapacity(s, SB.economy.costOf(s, nextBuild)));
    var capacityUpgrade = (housingCapacityBlocked || buildCapacityBlocked) &&
      s.techs && s.techs.castle && !(s.upgrades && s.upgrades.upg_castle);
    var storageCapacityUpgrade = !capacityUpgrade && (housingCapacityBlocked || buildCapacityBlocked)
      ? storageUpgrade(s) : null;
    if (capacityUpgrade) nextBuild = null;
    else if (buildCapacityBlocked) {
      /* 尤里卡建筑自身也可能贵过当前仓储上限。用扩容建筑解锁下一档造价；若压舱仓
       * 的工艺成本也越过容量，再由已装城堡的议事厅提供一段扩容。 */
      var storageFallback = storageBuild(s);
      if (storageFallback) nextBuild = storageFallback;
    }
    var capUpgradeDef = capacityUpgrade ? SB.workshop.upgradeById('upg_castle') : null;
    var plannedCost = Object.assign({}, capacityUpgrade ? capUpgradeDef.cost || {} :
      storageCapacityUpgrade ? storageCapacityUpgrade.cost || {} :
      nextWonder ? (SB.workshop.wonderById(nextWonder).cost || {}) :
      nextBuild ? SB.economy.costOf(s, nextBuild) : {});
    if (supportUpgradeId) {
      var supportUpgrade = SB.workshop.upgradeById(supportUpgradeId);
      for (var suk in supportUpgrade && supportUpgrade.cost || {})
        plannedCost[suk] = (plannedCost[suk] || 0) + supportUpgrade.cost[suk];
    }
    var supportCost = nextWonder && nextBuild ? SB.economy.costOf(s, nextBuild) : {};
    if (!capacityUpgrade && cond && cond.t === 'upgrade') {
      var targetUpgrade = SB.workshop.upgradeById(cond.id);
      if (targetUpgrade) for (var uk in targetUpgrade.cost || {})
        plannedCost[uk] = (plannedCost[uk] || 0) + targetUpgrade.cost[uk];
    }
    if (!capacityUpgrade && cond && cond.t === 'tools') {
      (cond.ids || []).forEach(function (toolId) {
        if (s.tools && s.tools[toolId]) return;
        var tool = SB.workshop.tools().filter(function (x) { return x.id === toolId; })[0];
        if (tool) for (var tk in tool.cost || {}) plannedCost[tk] = (plannedCost[tk] || 0) + tool.cost[tk];
      });
    }
    var needs = {};
    addCostNeeds(s, plannedCost, needs);
    addCostNeeds(s, supportCost, needs);
    if (cond && cond.t === 'res') needs[cond.r] = Math.max(needs[cond.r] || 0, cond.n);
    /* 天穹钻机耗材按剩余壳厚计算：建造需要 20 个，运行需要 DRILL/s × 预计运行秒数。
     * 天穹钻机是奇观队列最后一座；其余奇观建完前不提前囤钻头，避免抢占钢制零件、绳等共用原料。 */
    var drillTarget = drillStockTarget(s);
    var allPreDrillWondersBuilt = (SB.WONDERS || []).every(function (w) {
      return w.id === 'wonder_skydrill' || isOwned(s, w.id);
    });
    if (!allPreDrillWondersBuilt && !shellGateNeedsDrill(s, goal)) drillTarget = 0;
    if (drillTarget > 0) {
      expandPrimaryNeeds(s, 'resonantDrill', Math.max(0, drillTarget - (s.res.resonantDrill || 0)), needs, []);
    }
    /* 主目标资源缺口会抬高对应职业权重；挑战限制仍由 folk.autoAssign 统一钳制。 */
    Object.keys(needs).forEach(function (r) {
      var j = resourceJob(r);
      if (!j || j === 'gather') return;
      var cap = SB.economy.capOf(s, r), shortage = needs[r] - (s.res[r] || 0);
      if (isFinite(cap) && shortage > Math.max(20, cap * 0.75)) weights[j] = Math.max(weights[j] || 0, 0.62);
      else if (shortage > 20) weights[j] = Math.max(weights[j] || 0, 0.42);
    });
    /* 奇观递归工艺链会把脚手架拆成大量珊瑚/藻食需求；即使当前科技目标不是
     * wonders，也要按正在排队的奇观补原料岗位，否则绳线缺藻食会让高阶奇观无限期等待。 */
    if (nextWonder || (cond && cond.t === 'wonders')) {
      if ((needs.steel || 0) > (s.res.steel || 0))
        weights.miner = Math.max(weights.miner || 0, 0.85);
      if ((needs.coral || 0) > (s.res.coral || 0))
        weights.coralwright = Math.max(weights.coralwright || 0, 4.0);
      var kelpShortage = Math.max(0, (needs.kelp || 0) - (s.res.kelp || 0));
      if (kelpShortage > 20 && foodJob > 0) {
        var coralTargetRate = Math.max(1, SB.economy.rates(s).coral || 0);
        var gatherTarget = Math.ceil((SB.economy.foodUse(s) + coralTargetRate - builtFood) / foodJob);
        /* 建筑侧即使已覆盖口粮，也可能让 foodNeed=0；这会让 bot 完全不派采集者，
         * 绳料（藻食）库存永远不涨。按每名额外采集者约支撑 1 个脚手架批次的原料
         * 需求折算岗位，并保留 25% 人口上限，避免为遥远总造价挤空科研/矿业。 */
        var craftGatherTarget = Math.ceil(kelpShortage / 10000);
        var extraGather = Math.min(Math.max(0, gatherTarget - foodNeed, craftGatherTarget),
          Math.ceil(s.pop * 0.25));
        foodNeed = Math.min(s.pop > 1 ? s.pop - 1 : s.pop, foodNeed + extraGather);
      }
    }
    /* 住房是关键科技的硬前置，不能让可选市政/常规岗位把建房资源挤掉。
     * 当前房屋买不起时，把对应采集岗位提到优先级首位；挑战的人口/职业门禁仍由
     * folk.autoAssign 统一执行，不会绕过挑战规则。 */
    if (housingNeed) {
      var housingCost = SB.economy.costOf(s, housingNeed);
      if (!SB.economy.canAfford(s, housingCost)) for (var hr in housingCost) {
        var hj = resourceJob(hr);
        if (hj && hj !== 'gather') weights[hj] = Math.max(weights[hj] || 0, 0.90);
      }
    }
    /* 扩仓建筑的成本是石梁/硬化珊瑚；持续攒仓料时必须保证原始石头与珊瑚优先，
     * 否则可选市政的 scribe 比例会抢走采石工，仓储建筑永远差最后几批工艺品。 */
    if (nextBuild === 'ballast') {
      weights.quarrier = Math.max(weights.quarrier || 0, 0.90);
      weights.coralwright = Math.max(weights.coralwright || 0, 0.90);
      weights.scribe = Math.min(weights.scribe || 0, 0.12);
    }
    /* 钢工具尤里卡要一次买齐三件，但汽轮机需要暖石流、汽轮机/工坊本身又吃大量石头。
     * 只为“缺钢”长期拉满矿工会把采石工挤成 0，结果有暖石却永远造不起生产线。
     * 临时把矿工目标精确到支撑一台汽轮机所需的人数（含 15% 余量），并在正在筹建
     * 汽轮机/工坊时同时保留采石工；rates() 复用当前季节、挑战与科技乘区计算边际暖石。 */
    if (cond && cond.t === 'tools') {
      var missingSteelTools = 0;
      (cond.ids || []).forEach(function (toolId) {
        if (s.tools && s.tools[toolId]) return;
        var tool = SB.workshop.tools().filter(function (x) { return x.id === toolId; })[0];
        if (tool && tool.cost) missingSteelTools += tool.cost.steel || 0;
      });
      if (missingSteelTools > (s.res.steel || 0)) {
        if (nextBuild && (nextBuild === 'hydroturbine' || nextBuild === 'hydroshop')) {
          var hydroCost = SB.economy.costOf(s, nextBuild);
          if ((s.res.stone || 0) < (hydroCost.stone || 0))
            weights.quarrier = Math.max(weights.quarrier || 0, 0.90);
        }
        var restWorkers = Math.max(0, s.pop - foodNeed);
        var targetMiners = Math.min(Math.max(0, restWorkers - 1),
          minersForWarmstone(s, (SB.UNIT.hydroWarm || 5) * 1.15));
        var otherJobWeight = 0, jobIds = SB.folk && SB.folk.IDS || [];
        for (var ji = 0; ji < jobIds.length; ji++) if (jobIds[ji] !== 'gather' && jobIds[ji] !== 'miner' &&
            SB.folk.jobUnlocked(s, jobIds[ji])) otherJobWeight += weights[jobIds[ji]] || 0;
        if (targetMiners > 0 && targetMiners < restWorkers && otherJobWeight > 0) {
          var minerWeight = targetMiners * otherJobWeight / (restWorkers - targetMiners);
          weights.miner = Math.max(weights.miner || 0, minerWeight);
        }
      }
    }
    var jobsBefore = JSON.stringify(s.jobs);
    SB.folk.autoAssign(s, Object.assign({ gather: foodNeed }, cold ? Object.assign({}, weights, {
      miner: Math.max(weights.miner || 0, 0.25)
    }) : weights));
    if (JSON.stringify(s.jobs) !== jobsBefore) { changed = true; actions++; }
    /* 现有汽轮机若超过暖石的可持续净产量就停一部分；热液工坊也不能运行得多过
     * 可用供给。按等价于 UI 停/开按钮的停用计数调整，不改建筑或资源，防止扩产反过来
     * 烧空暖石、冻死人口。新一轮暖石产出提升后，下次策略步会自动重新启用。 */
    var sustainableTurbines = hydroSupportCap(s);
    var runningTurbines = Math.min(s.lvl.hydroturbine || 0, sustainableTurbines);
    var runningShops = Math.min(s.lvl.hydroshop || 0, runningTurbines);
    var turbineStop = Math.max(0, (s.lvl.hydroturbine || 0) - runningTurbines);
    var hydroshopStop = Math.max(0, (s.lvl.hydroshop || 0) - runningShops);
    if ((s.turbineStop || 0) !== turbineStop || (s.hydroshopStop || 0) !== hydroshopStop) {
      s.turbineStop = turbineStop;
      s.hydroshopStop = hydroshopStop;
      changed = true; actions++;
    }
    /* 累计产出尤里卡来自合法手动采集/生产；只补手点型的 gathered 门。 */
    if (goal.key && goal.key.cond && goal.key.cond.t === 'gathered') {
      var gatheredNeed = Math.max(0, goal.key.cond.n - ((s.got || {})[goal.key.cond.r] || 0));
      for (var gg = 0; gg < Math.min(5, Math.ceil(gatheredNeed / Math.max(1, SB.GATHER[goal.key.cond.r] || 1))); gg++)
        did(SB.economy.addRes(s, goal.key.cond.r, SB.GATHER[goal.key.cond.r] || 1));
    }
    /* 递归补齐当前建设目标所需的工艺料；建材需求不足时，底层原料仍由职业正常生产。 */
    for (var nr in plannedCost) {
      if ((s.res[nr] || 0) < plannedCost[nr] && recipeByResource(nr))
        did(ensureCraft(s, nr, plannedCost[nr], emit, []));
    }
    for (var sr in supportCost) {
      if ((s.res[sr] || 0) < supportCost[sr] && recipeByResource(sr))
        did(ensureCraft(s, sr, supportCost[sr], emit, []));
    }
    if (supportUpgradeId && SB.workshop.upgradeCanBuy(s, supportUpgradeId))
      did(SB.workshop.upgradeBuy(s, supportUpgradeId, emit));
    if (drillTarget > 0 && (s.res.resonantDrill || 0) < drillTarget)
      did(ensureCraft(s, 'resonantDrill', drillTarget, emit, []));
    /* 按计划建设；最多 2 个动作，避免单帧连续消费刚产出的资源。 */
    for (var b = 0; b < 2; b++) {
      if (capacityUpgrade) {
        if (!SB.workshop.upgradeCanBuy(s, 'upg_castle')) break;
        if (!did(SB.workshop.upgradeBuy(s, 'upg_castle', emit))) break;
        capacityUpgrade = false;
        break;
      }
      if (storageCapacityUpgrade) {
        if (!SB.workshop.upgradeCanBuy(s, storageCapacityUpgrade.id)) break;
        did(SB.workshop.upgradeBuy(s, storageCapacityUpgrade.id, emit));
        break;
      }
      nextBuild = chooseBuild(s, goal, options);
      nextWonder = chooseWonder(s, goal, options);
      if (shouldPrioritizeConditionBuild(s, goal, nextBuild)) nextWonder = null;
      if (nextWonder && SB.workshop.wonderBlocked(s, nextWonder) === null) {
        if (!did(SB.workshop.build(s, nextWonder, emit))) break;
        continue;
      }
      if (nextBuild && freeBuilding(s, nextBuild)) {
        if (!did(SB.habitat.build(s, nextBuild, emit))) break;
        continue;
      }
      break;
    }
    if (cond && cond.t === 'tools') (cond.ids || []).forEach(function (id) {
      if (SB.workshop.canBuy(s, id)) did(SB.workshop.buy(s, id, emit));
    });
    if (cond && cond.t === 'upgrade' && SB.workshop.upgradeCanBuy(s, cond.id))
      did(SB.workshop.upgradeBuy(s, cond.id, emit));
    /* 研究当前可达项；关键科技链优先，其余可研究科技填空。 */
    for (var pass = 0; pass < 4; pass++) {
      var order = [], chain = [];
      function addTech(id) {
        var t = SB.tech.byId(id);
        if (!t || s.techs[id] || chain.indexOf(id) >= 0) return;
        chain.push(id);
        (t.reqs || []).forEach(addTech);
        order.push(id);
      }
      if (goal.key) addTech(goal.key.id);
      var all = (SB.TECHS || []).filter(function (t) { return t.era <= s.era; });
      for (var ti = 0; ti < all.length; ti++) if (order.indexOf(all[ti].id) < 0) order.push(all[ti].id);
      var studyId = null;
      for (var oi = 0; oi < order.length; oi++) if (SB.tech.canStudy(s, order[oi])) { studyId = order[oi]; break; }
      if (!studyId || !did(SB.tech.study(s, studyId, emit))) break;
      SB.game.pumpTech(s, emit);
    }
    if (SB.civic.panelOpen(s)) {
      var civic = null;
      for (var ci = 0; ci < SB.CIVICS.length; ci++) if (SB.civic.canResearch(s, SB.CIVICS[ci].id)) { civic = SB.CIVICS[ci]; break; }
      if (civic && did(SB.civic.research(s, civic.id, emit))) SB.game.pumpCivic(s, emit);
      if (s.gov) {
        var storagePressure = housingCapacityBlocked || buildCapacityBlocked, installedStorageCard = false;
        /* 2026-10-18：card_logistics 此前 retiredBy 方向写反（出生即退役）bot 永远装不上；
         *   修正后按链升级到 ERA8 洲际物流 ×5（canSetCard 自带退役判定，旧卡完成后自动跳下一张）。 */
        var storageCards = ['card_market', 'card_logistics', 'card_interlog'];
        /* 容量卡一旦把当前造价抬进仓储上限，storagePressure 会暂时变成 false；
         * 但如果目标住房还没建成，普通选卡会立刻把容量卡覆盖掉，下一帧又重新受阻。
         * 在住房目标达成前持续保护它，避免容量卡与普通卡来回切换。 */
        var storageGoalActive = housingTarget > SB.economy.popCap(s) || buildCapacityBlocked;
        var storagePolicyEquipped = storageGoalActive && s.cards && storageCards.some(function (id) {
          return s.cards.indexOf(id) >= 0;
        });
        if (storagePressure && !storagePolicyEquipped) {
          for (var sci = 0; sci < storageCards.length; sci++) {
            if (SB.civic.canSetCard(s, storageCards[sci])) {
              installedStorageCard = did(SB.civic.setCard(s, storageCards[sci], emit));
              if (installedStorageCard) break;
            }
          }
        }
        var policies = SB.POLICIES || [];
        if (!installedStorageCard && !storagePolicyEquipped) for (var pi = 0; pi < policies.length; pi++) {
          var p = policies[pi], effectful = Object.keys(p).some(function (k) {
            return ['id', 'name', 'civic', 'type', 'effect', 'retiredBy', 'desc'].indexOf(k) < 0 && p[k] != null;
          });
          if (effectful && SB.civic.canSetCard(s, p.id)) {
            if (did(SB.civic.setCard(s, p.id, emit))) break;
          }
        }
      }
      /* 政治哲学解锁的三槽政体是「城堡」尤里卡；按可用且可负担的顺序采用，
       * 否则这条前置会永远停在玩家手动点政体的入口。 */
      var currentGov = SB.civic.govById(s.gov), hasThreeSlots = !!(currentGov && currentGov.slots && currentGov.slots.wild >= 3);
      if (!hasThreeSlots) {
        var govs = SB.GOVS || [];
        for (var gi = 0; gi < govs.length; gi++) {
          if ((govs[gi].slots && govs[gi].slots.wild >= 3) && SB.civic.govOwned(s, govs[gi].id) &&
              SB.civic.canSetGov(s, govs[gi].id)) {
            if (did(SB.civic.setGov(s, govs[gi].id, emit))) break;
          }
        }
      }
    }
    SB.game.pumpTech(s, emit); SB.game.pumpCivic(s, emit);
    if (s.wonders && s.wonders.wonder_skydrill && !s.broken && !s.skydrillOn && SB.ui && SB.ui.input && SB.ui.input.toggleSkydrill)
      did(SB.ui.input.toggleSkydrill(s));
    if (changed && SB.game.markDirty) SB.game.markDirty();
    return { changed: changed, actions: actions, goal: goal.id || null, condition: cond && cond.t || null,
      build: nextBuild || null, wonder: nextWonder || null };
  }

  SB.aiStrategy = { step: step, researchGoal: researchGoal, firstMissingPrereq: firstMissingPrereq,
    drillStockTarget: drillStockTarget };
})(typeof window !== 'undefined' ? window : globalThis);
