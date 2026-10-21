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
    if (!b || !SB.habitat.unlocked(s, b) || !SB.habitat.needMet(s, b)) return false;
    /* `unlocked()` 只代表科技/市政已开门，不代表下一等级现在真能建。
     * 王国潮道还受灯塔等级钳制；此前总建筑等级目标把 canal 当作可建候选，
     * 但 lighthouse=0 时 build() 永远拒绝，AI 就会每轮重复选 canal 并原地空转。
     * 同时跳过已达 maxLvl 的建筑，避免总等级目标反复点上限建筑。 */
    var level = (s.lvl && s.lvl[id]) || 0;
    if (b.maxLvl && level >= b.maxLvl) return false;
    if (id === 'canal' && level >= ((s.lvl && s.lvl.lighthouse) || 0)) return false;
    return true;
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
    /* 压舱仓每级直接给 +120 材料容量，优先用它解住房/建造门槛；只有尚无压舱仓入口时，
     * 才继续升级城堡核心扩容。核心减耗仍会随议事厅升级自然获得。 */
    if (availableBuilding(s, 'ballast')) return 'ballast';
    if (s.upgrades && s.upgrades.upg_castle && availableBuilding(s, 'hall') &&
        (s.lvl.hall || 0) < 20) return 'hall';
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
  function recipeChainUnlocked(s, resource, seen) {
    var c = recipeByResource(resource);
    if (!c) return true;
    if (!recipeUnlocked(s, c)) return false;
    seen = seen || [];
    if (seen.indexOf(resource) >= 0) return true;
    seen.push(resource);
    for (var input in c.in || {}) if (!recipeChainUnlocked(s, input, seen.slice())) return false;
    return true;
  }
  function storageUpgradeMaterialsUnlocked(s, upgrade) {
    for (var resource in upgrade && upgrade.cost || {})
      if (!recipeChainUnlocked(s, resource, [])) return false;
    return true;
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
      /* 尤里卡升级一旦买过，后续研究只需要科研点；不能再次把已支付的钢件/钛料
       * 当作待筹目标，否则会按这笔旧成本拉满矿工，挤空学者并拖慢科技树。 */
      if (s.upgrades && s.upgrades[cond.id]) return {};
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
  function hydroTurbineTarget(s, targetSupply) {
    var flow = SB.economy && SB.economy.hydroAlloc ? SB.economy.hydroAlloc(s, 1) : null;
    var active = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0));
    var turbineRate = flow ? Math.max(0, flow.turbineRate || 0) : 0;
    /* 固定热液源（高压热机管道等）不能摊进单台汽轮机产能；rates().hydroSupply
     * 是总供给，把它除以运行台数会高估汽轮机输出，导致计划过早转去建研究所。 */
    var fixedSupply = flow ? Math.max(0, (flow.supplyRate || 0) - turbineRate) : 0;
    var perTurbine = active > 0 && turbineRate > 0 ? turbineRate / active :
      Math.max(0.001, SB.UNIT && SB.UNIT.hydroOut || 1);
    return {
      active: active,
      fixedSupply: fixedSupply,
      perTurbine: Math.max(0.001, perTurbine),
      required: Math.max(0, Math.ceil((targetSupply - fixedSupply) / Math.max(0.001, perTurbine)))
    };
  }
  function minersForWarmstone(s, targetRate) {
    if (!SB.economy || !SB.economy.rates || !s.jobs) return s.jobs && s.jobs.miner || 0;
    var season = SB.economy.seasonIdx ? SB.economy.seasonIdx(s) : null;
    if (warmstoneTargetCache.state === s && warmstoneTargetCache.rate === targetRate &&
        warmstoneTargetCache.season === season && (s.t || 0) < warmstoneTargetCache.until)
      return warmstoneTargetCache.miners;
    var old = s.jobs.miner || 0, oldStop = s.turbineStop || 0;
    var allTurbines = Math.max(0, s.lvl && s.lvl.hydroturbine || 0), base, one;
    try {
      /* rates().warmstone 是净速率，会扣掉当前正在运行的所有汽轮机。
       * 这里的 targetRate 表示要给目标机组准备的毛暖石供给；若保留当前扣费，
       * 例如 9 台在运、目标 3 台时，会把 45/s 旧负荷再次加进目标，矿工被顶到人口上限。 */
      s.turbineStop = allTurbines;
      s.jobs.miner = 0;
      base = SB.economy.rates(s).warmstone || 0;
      s.jobs.miner = 1;
      one = SB.economy.rates(s).warmstone || 0;
    } finally {
      s.jobs.miner = old;
      s.turbineStop = oldStop;
    }
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
      /* 可选奇观只有本轮已经买得起时才进入建造/岗位计划。旧逻辑即使奇观还差
       * 数千份原料，也把整座奇观的成本塞进 needs；于是矿工/采集岗位被远期目标
       * 抢满，学者和当前可建建筑反而停摆。指定为科技硬门槛的奇观仍在上面保留
       * 未满足时的筹料行为；市政奇观门槛也在这里优先挑一座当前可负担的奇观。 */
      for (var j = 0; j < rows.length; j++)
        if (rows[j].id !== 'wonder_skydrill' && wonderEligible(s, rows[j]) &&
            SB.workshop.wonderBlocked(s, rows[j].id) === null) return rows[j].id;
      var pendingBeforeDrill = rows.some(function (w) {
        return w.id !== 'wonder_skydrill' && !isOwned(s, w.id);
      });
      var drill = SB.workshop.wonderById('wonder_skydrill');
      if ((!pendingBeforeDrill || shellGateNeedsDrill(s, goal)) && drill && wonderEligible(s, drill) &&
          (shellGateNeedsDrill(s, goal) || SB.workshop.wonderBlocked(s, drill.id) === null)) return drill.id;
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
  function portfolioBuild(s, excludeId) {
    /* 建造总等级门槛期间，不能把第二个建造动作也全投给同一个硬门槛建筑。
     * 先补一座当前已解锁、买得起的关键建筑，再逐步把高收益项升到小目标；
     * future-era/未解锁项由 availableBuilding 自然过滤。 */
    var firstLevels = [
      ['lighthouse', 1], ['temple', 1], ['civichall', 1], ['canal', 1],
      ['school', 1], ['theater', 1], ['coralfarm', 1], ['bank', 1], ['caravanserai', 1]
    ];
    var growthLevels = [
      ['lighthouse', 3], ['temple', 3], ['civichall', 3], ['canal', 3],
      ['school', 3], ['theater', 3], ['coralfarm', 3], ['museum', 8], ['bank', 3], ['caravanserai', 2]
    ];
    var phases = [firstLevels, growthLevels];
    for (var p = 0; p < phases.length; p++) for (var i = 0; i < phases[p].length; i++) {
      var id = phases[p][i][0], target = phases[p][i][1];
      if (id === excludeId || (s.lvl[id] || 0) >= target) continue;
      if (freeBuilding(s, id)) return id;
    }
    /* 先验投资都已建/锁住时，也别让总建筑等级任务空转：补任意一座已解锁、
     * 买得起且尚未建过的建筑。只补首级，后续等级仍由上方明确的收益目标控制。 */
    var allBuildings = SB.BUILDINGS || [];
    for (var bi = 0; bi < allBuildings.length; bi++) {
      var candidate = allBuildings[bi] && allBuildings[bi].id;
      if (!candidate || candidate === excludeId || (s.lvl[candidate] || 0) > 0) continue;
      if (freeBuilding(s, candidate)) return candidate;
    }
    return null;
  }
  function chooseBuild(s, goal, options, civicGoal) {
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
        var hydroTarget = hydroTurbineTarget(s, cond.n);
        var neededTurbines = hydroTarget.required;
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
    var plannedWonderId = shouldPrioritizeConditionBuild(s, goal, null)
      ? null : chooseWonder(s, goal, options);
    var plannedWonder = plannedWonderId && SB.workshop.wonderById(plannedWonderId);
    if (plannedWonder) partTarget = Math.max(partTarget, plannedWonder.cost && plannedWonder.cost.steelPart || 0);
    var upgradeForWonder = wonderPrereqUpgrade(s, goal);
    var wonderSupportUpgrade = upgradeForWonder && SB.workshop.upgradeById(upgradeForWonder);
    if (wonderSupportUpgrade) partTarget = Math.max(partTarget,
      wonderSupportUpgrade.cost && wonderSupportUpgrade.cost.steelPart || 0);
    var partRecipe = recipeByResource('steelPart');
    var partRemain = Math.max(0, partTarget - (s.res.steelPart || 0));
    if (partRemain > 0 && partRecipe && recipeUnlocked(s, partRecipe)) {
      /* 先铺出所需装机容量；暖石不足时 step() 会停用超出可持续供给的机组，
       * 同时增加矿工，避免“没汽轮机所以没钢、没暖石所以不建汽轮机”的死锁。 */
      var hydroTarget = Math.min(10, Math.max(2, Math.ceil(partRemain / 25)));
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
      var affordableTechRows = rows.filter(function (b) { return freeBuilding(s, b.id); });
      if (affordableTechRows.length) rows = affordableTechRows;
      rows.sort(function (a, b) {
        function total(x) { var n = 0, c = SB.economy.costOf(s, x.id); for (var k in c) n += c[k]; return n; }
        return total(a) - total(b);
      });
      if (rows.length) return rows[0].id;
    }
    /* 市政鼓舞和科技尤里卡共用正式条件 API。未揭示的当前可达市政也要追它的
     * 建筑/分区门槛；此前这里只传 tech goal，导致 ERA4《探索》的仓库升级等
     * 鼓舞永远不执行，后续市政也就一直隐藏。 */
    var civicCond = civicGoal && civicGoal.boost;
    if (civicCond && !SB.civic.boostMet(s, civicGoal)) {
      if (civicCond.t === 'built' && (s.lvl[civicCond.b] || 0) < civicCond.n &&
          availableBuilding(s, civicCond.b)) return civicCond.b;
      if (civicCond.t === 'upgrade') {
        var civicUpgrade = SB.workshop.upgradeById(civicCond.id);
        if (civicUpgrade && civicUpgrade.upgradesBuilding && !s.lvl[civicUpgrade.upgradesBuilding] &&
            availableBuilding(s, civicUpgrade.upgradesBuilding)) return civicUpgrade.upgradesBuilding;
      }
      if (civicCond.t === 'zoneLvl') {
        rows = (SB.BUILDINGS || []).filter(function (b) {
          return b.zone === civicCond.zone && SB.habitat.unlocked(s, b) && SB.habitat.needMet(s, b);
        });
        var affordableCivicRows = rows.filter(function (b) { return freeBuilding(s, b.id); });
        if (affordableCivicRows.length) rows = affordableCivicRows;
        rows.sort(function (a, b) {
          function total(x) { var n = 0, c = SB.economy.costOf(s, x.id); for (var k in c) n += c[k]; return n; }
          return total(a) - total(b);
        });
        if (rows.length) return rows[0].id;
      }
      /* `total` 鼓舞要求把所有建筑等级加总到门槛。之前没有对应建造分支，
       * 因而像 ERA5《社会科学》会停在“建筑总级数 220 / 300”，AI 也不再排建造目标。
       * 先挑可建的科研建筑，兼顾当前科技推进；若材料暂时不足，则选库存/仓储压力
       * 最小的可用建筑，让后续材料岗位按 plannedCost 自动补齐。 */
      if (civicCond.t === 'total') {
        var totalBuildingLevels = 0;
        for (var totalId in (s.lvl || {})) totalBuildingLevels += s.lvl[totalId] || 0;
        if (totalBuildingLevels < civicCond.n) {
          var scienceBuildIds = ['institute', 'library', 'researchlab', 'observatory'];
          var candidates = (SB.BUILDINGS || []).filter(function (b) {
            return availableBuilding(s, b.id);
          });
          candidates.sort(function (a, b) {
            function buildScore(row) {
              var cost = SB.economy.costOf(s, row.id), score = 0;
              for (var resource in cost) {
                var cap = SB.economy.capOf(s, resource);
                var scale = isFinite(cap) && cap > 0 ? cap : Math.max(1000, cost[resource]);
                score += cost[resource] / scale + Math.max(0, cost[resource] - (s.res[resource] || 0)) / scale;
              }
              if (scienceBuildIds.indexOf(row.id) >= 0) score *= 0.75;
              return score;
            }
            return buildScore(a) - buildScore(b);
          });
          var affordableScience = candidates.filter(function (b) {
            return scienceBuildIds.indexOf(b.id) >= 0 && freeBuilding(s, b.id);
          });
          if (affordableScience.length) return affordableScience[0].id;
          var affordableAny = candidates.filter(function (b) { return freeBuilding(s, b.id); });
          if (affordableAny.length) return affordableAny[0].id;
          if (candidates.length) return candidates[0].id;
        }
      }
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
    /* 科研建筑是长局推进的基础投资：首座潮纹馆尽早给学者加成；数学解锁后把研究所
     * 铺到 3 级，既增强科研，也直接满足《教育》的尤里卡；后续把潮纹馆补到 6 级。
     * 《化学》解锁科研所后再建 5 级，兼得 +50% 科研与 −10% 研究消耗。 */
    if (availableBuilding(s, 'library') && s.lvl.library < 1) return 'library';
    if (availableBuilding(s, 'institute') && s.lvl.institute < 3) return 'institute';
    if (availableBuilding(s, 'library') && s.lvl.library < 6) return 'library';
    if (availableBuilding(s, 'researchlab') && s.lvl.researchlab < 5) return 'researchlab';
    if (availableBuilding(s, 'siltpit') && s.lvl.siltpit < 3) return 'siltpit';
    /* 主科技暂时只差科研点、而住房/扩仓链又被后续科技锁住时，不能因为没有
     *「当前门槛建筑」就让 AI 空等。沿用市政总建筑等级使用的同一组合选择器，
     * 只补一座已解锁且当前买得起的建筑；不绕过科技/市政门槛，也不赊账。
     * 这能让早期仓储死锁期间继续铺基础设施，并推进总建筑等级类市政。 */
    return portfolioBuild(s, null);
  }
  function shouldPrioritizeConditionBuild(s, goal, buildId) {
    var cond = goal && goal.cond;
    /* 壳层科技的 shell:1 尤里卡必须靠已研究的天穹钻机奇观继续削壳；
     * 它虽不是 wonders 条件，仍是这条硬门槛的必需建造，不能被通用过滤器当作可选项丢弃。 */
    if (shellGateNeedsDrill(s, goal)) return false;
    /* 关键科技当前尤里卡未满足时，暂停可选奇观投入。否则奇观会反复消耗
     * 石头制作石梁，抢走研究区/住房等硬门槛所需的建材，让关键科技永远停在原地。
     * 显式要求奇观的门槛仍由 chooseWonder 正常推进。 */
    if (goal && goal.key && cond && cond.t !== 'wonders' && !SB.tech.condMet(s, cond)) return true;
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
  function overflowCraft(s, plannedCost, emit) {
    /* 没有当前建筑需求时，工坊不会把满仓原料转成半成品。只处理四条通用建材链，
     * 且只在某个原料达到仓储上限的 90% 后制作最多 25% 的可造批次；保留大部分
     * 原料给住房/建造，防止“转制”反过来把当前建筑卡住。 */
    var outputs = ['stoneBeam', 'hardCoral', 'rope', 'ironBracket'];
    var best = null, bestDemand = -1, bestPressure = 0;
    for (var i = 0; i < outputs.length; i++) {
      var c = recipeByResource(outputs[i]);
      if (!c || !recipeUnlocked(s, c) || SB.workshop.craftBlocked(s, c.id) !== null) continue;
      var pressure = 0;
      for (var input in c.in || {}) {
        var cap = SB.economy.capOf(s, input), have = s.res[input] || 0;
        if (isFinite(cap) && cap > 0) pressure = Math.max(pressure, have / cap);
      }
      if (pressure < 0.90) continue;
      var currentDemand = Math.max(0, (plannedCost && plannedCost[outputs[i]] || 0) - (s.res[outputs[i]] || 0));
      if (currentDemand > bestDemand || (currentDemand === bestDemand && pressure > bestPressure)) {
        best = c; bestDemand = currentDemand; bestPressure = pressure;
      }
    }
    if (!best) return null;
    var available = Math.floor(SB.workshop.maxCraftable(s, best));
    var batches = Math.floor(available * 0.25);
    if (batches <= 0) return null;
    var before = s.res[best.res] || 0;
    var made = SB.workshop.craft(s, best.id, batches, emit);
    return made > 0 ? { recipe: best.id, resource: best.res, batches: batches, made: made,
      from: Math.max(0, before), inputPressure: bestPressure } : null;
  }
  function expandPrimaryNeeds(s, resource, amount, out, seen) {
    var missing = Math.max(0, amount - (s.res[resource] || 0));
    if (missing <= 0) return;
    var c = recipeByResource(resource);
    if (!c || !recipeUnlocked(s, c)) { out[resource] = (out[resource] || 0) + missing; return; }
    seen = seen || [];
    if (seen.indexOf(resource) >= 0) { out[resource] = (out[resource] || 0) + missing; return; }
    seen.push(resource);
    /* 工坊只能制作整数批次；按连续产出反推会低估最后一批原料（例如还差 1.3
     * 硬化珊瑚、每批产 1.4，却错误认为现有 96/100 珊瑚已够），导致岗位再次归零。 */
    var batches = Math.ceil(missing / (c.out * SB.workshop.craftMul(s, c)));
    var cm = SB.workshop.craftCostMul(s, c);
    for (var k in c.in) expandPrimaryNeeds(s, k, batches * c.in[k] * cm, out, seen.slice());
  }
  function addCostNeeds(s, cost, out) {
    for (var k in cost || {}) {
      if (cost[k] > (s.res[k] || 0)) expandPrimaryNeeds(s, k, cost[k], out, []);
    }
  }
  function resourceJob(resource, s) {
    if (resource === 'coral') return 'coralwright';
    if (resource === 'stone') return 'quarrier';
    /* 钢不是矿工直接采出的资源，而是热液工坊的产物。把远期钢需求映射为矿工
     * 会让 AI 为可选奇观囤钢、即使暖石/精铁仓接近满仓仍占掉大半人口。当前钢件
     * 目标的暖石供给由下方 minersForWarmstone 精确安排，故这里不再拿钢冒充矿物。 */
    if (resource === 'steel') {
      var warmCapForSteel = SB.economy.capOf(s, 'warmstone');
      if (!isFinite(warmCapForSteel) || (s.res.warmstone || 0) < warmCapForSteel * 0.90) return 'miner';
      return null;
    }
    if (['silt', 'iron', 'warmstone', 'titanium'].indexOf(resource) >= 0) return 'miner';
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
  function nextCivicGoal(s) {
    if (!SB.civic.panelOpen(s)) return null;
    for (var i = 0; i < SB.CIVICS.length; i++) {
      var c = SB.CIVICS[i];
      if (c.era && c.era > s.era || s.civics[c.id] || !SB.civic.reqsMet(s, c)) continue;
      /* 节点未揭示时也要追它自己的鼓舞：否则像「累计奢侈品产出」这种显形门槛
       * 永远不会被 bot 主动推进，后继市政与政策卡就会一起卡住。 */
      if (!c.boost || SB.civic.boostMet(s, c)) continue;
      return c;
    }
    return null;
  }
  function nextCivicBoost(s) {
    var goal = nextCivicGoal(s);
    return goal && goal.boost || null;
  }
  function step(s, options) {
    options = options || {};
    if (!s || s.broken || !SB || !SB.game || !SB.tech) return { changed: false, goal: null };
    var emit = options.emit || SB.game.emit, changed = false, actions = 0;
    function did(ok) { if (ok) { changed = true; actions++; } return !!ok; }
    /* 保温法是玩家开的生存策略开关，不会因为暖石充足自动启用。
     * 热能科技已解锁且当前挑战允许时，AI 像玩家一样常开：只在减产季烧 1/s，
     * 可同时顶回口粮减产并免除冰封冻伤；暖石不足时游戏自己的门控会暂停燃烧。 */
    if (s.techs && s.techs.thermal && !s.warmOn &&
        !(SB.challenges && SB.challenges.warmHeatingBlocked(s))) {
      s.warmOn = true; changed = true; actions++;
    }
    var goal = researchGoal(s), cond = goal.cond;
    /* 神学完成后，建立宗教是玩家需在信仰页输入名称的正式动作；不自动命名会让
     * 《归正会》的 religion 鼓舞与轮回系统长期停在空名门槛。用同一局状态字段和
     * 游戏回调模拟一次正常命名，名称可在 UI 中随时修改且不消耗资源。 */
    if (s.civics && s.civics.theology && !(s.religionName || '').trim()) {
      s.religionName = '渊海信仰';
      if (SB.game.maybeReligionPopup) SB.game.maybeReligionPopup(s);
      changed = true; actions++;
    }
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
    /* 低库存时保留一部分农民作为口粮缓冲。只靠瞬时 rates() 会在库存已经见底、
     * 但短期建筑产出看起来足够时把采集者降为 0；20× 下几个游戏分钟就会饿死人。
     * 库存回到安全线后逐级放回岗位，让人口与建设优先级能继续恢复。 */
    var foodCap = SB.economy.capOf(s, 'kelp'), foodStock = s.res.kelp || 0;
    if (isFinite(foodCap) && foodCap > 0) {
      if (foodStock < foodCap * 0.08) foodNeed = Math.max(foodNeed, Math.ceil(s.pop * 0.60));
      else if (foodStock < foodCap * 0.25) foodNeed = Math.max(foodNeed, Math.ceil(s.pop * 0.40));
      else if (foodStock < foodCap * 0.50) foodNeed = Math.max(foodNeed, Math.ceil(s.pop * 0.25));
      foodNeed = Math.min(foodNeed, s.pop > 1 ? s.pop - 1 : s.pop);
    }
    var weights = { coralwright: 0.20, quarrier: 0.10, scholar: 0.20, miner: 0.18, scribe: 0.08, merchant: 0.04 };
    var scienceCost = nextScienceCost(s, goal);
    /* nextScienceCost 只返回 Eureka 已满足的可研究节点。若当前关键科技仍差工具、建筑等
     * Eureka，它会返回 null，学者就只剩 0.20 的默认权重；其他材料岗一多，自动配工会把
     * 学者四舍五入到 0。接着 AI 既攒不出购买前置所需的科技，也无法推进后续科技。
     * 此时按当前目标科技的实际折后成本保留科研岗位，Eureka 仍照常由资源/建筑策略处理。 */
    var goalScienceCost = goal && goal.tech && !s.techs[goal.tech.id] &&
      SB.tech.researchCost ? SB.tech.researchCost(s, goal.tech) : null;
    var neededScienceCost = scienceCost == null ? goalScienceCost : scienceCost;
    if (neededScienceCost && (s.res.science || 0) < neededScienceCost)
      weights.scholar = Math.max(weights.scholar, 0.90);
    var civicCost = nextCivicCost(s), civicGoal = nextCivicGoal(s), civicBoost = civicGoal && civicGoal.boost;
    if (civicBoost && civicBoost.t === 'pop' && !SB.civic.boostMet(s, civicGoal))
      options = Object.assign({}, options, { targetPopulation: Math.max(options.targetPopulation || 0, civicBoost.n) });
    if (civicCost && (s.res.culture || 0) < civicCost) weights.scribe = Math.max(weights.scribe, 0.52);
    if (civicBoost && civicBoost.t === 'job') weights[civicBoost.j] = Math.max(weights[civicBoost.j] || 0, 0.92);
    if (civicBoost && civicBoost.t === 'gathered') {
      var boostJob = resourceJob(civicBoost.r, s);
      if (boostJob && boostJob !== 'gather') weights[boostJob] = Math.max(weights[boostJob] || 0, 0.92);
    }
    if (civicBoost && civicBoost.t === 'res') {
      var boostResJob = resourceJob(civicBoost.r, s);
      if (boostResJob && boostResJob !== 'gather') weights[boostResJob] = Math.max(weights[boostResJob] || 0, 0.92);
    }
    if (cond && cond.t === 'res') {
      var cj = resourceJob(cond.r, s); if (cj && cj !== 'gather') weights[cj] = 0.68;
    }
    if (cond && cond.t === 'rate' && cond.r === 'hydroSupply' &&
        (SB.economy.rates(s).hydroSupply || 0) + 1e-9 < cond.n) {
      var requiredTurbines = hydroTurbineTarget(s, cond.n).required;
      if (hydroSupportCap(s) < requiredTurbines) weights.miner = Math.max(weights.miner || 0, 0.85);
    }
    if (cond && cond.t === 'job') weights[cond.j] = 0.72;
    var nextBuild = chooseBuild(s, goal, options, civicGoal);
    var nextWonder = chooseWonder(s, goal, options);
    /* 未满足的硬性科技条件优先于可选奇观：否则奇观队列会抢走建造动作，
     * bot 明明识别出要补汽轮机，却一直停在同一尤里卡门槛。 */
    if (shouldPrioritizeConditionBuild(s, goal, nextBuild)) nextWonder = null;
    var supportUpgradeId = wonderPrereqUpgrade(s, goal);
    var civicUpgradeId = civicBoost && civicBoost.t === 'upgrade' && !SB.civic.boostMet(s, civicGoal)
      ? civicBoost.id : null;
    var civicUpgradeDef = civicUpgradeId && SB.workshop.upgradeById(civicUpgradeId);
    var housingTarget = houseCapacityTarget(s, goal, options);
    var housingNeed = pickHouse(s, housingTarget);
    /* 城堡升级能帮助打通住房或关键尤里卡建筑被仓储上限挡住的情况。 */
    var housingCapacityBlocked = housingBlockedByCapacity(s, housingTarget);
    var housingChecks = ['nest', 'coralhouse'].filter(function (id) {
      return availableBuilding(s, id);
    }).map(function (id) {
      var cost = SB.economy.costOf(s, id);
      return id + ':' + Object.keys(cost).map(function (resource) {
        var cap = SB.economy.capOf(s, resource);
        return resource + '=' + (cost[resource].toFixed ? cost[resource].toFixed(1) : cost[resource]) +
          '/' + (isFinite(cap) ? cap.toFixed(1) : '∞');
      }).join(',');
    });
    var buildCapacityBlocked = !!(nextBuild && costExceedsCapacity(s, SB.economy.costOf(s, nextBuild)));
    var capacityUpgrade = (housingCapacityBlocked || buildCapacityBlocked) &&
      s.techs && s.techs.castle && !(s.upgrades && s.upgrades.upg_castle);
    var storageCapacityUpgrade = !capacityUpgrade && (housingCapacityBlocked || buildCapacityBlocked)
      ? storageUpgrade(s) : null;
    /* 材料工艺链已解锁时，优先买仓储扩容升级；它通常比逐级堆议事厅更快提升容量。
     * 若配方链仍被科技/市政锁住，再走直接建仓路径，避免升级计划无料可做而空转。 */
    if (storageCapacityUpgrade && !storageUpgradeMaterialsUnlocked(s, storageCapacityUpgrade))
      storageCapacityUpgrade = null;
    /* 扩容 II 的硬化珊瑚成本较高；住房受阻时，先把压舱仓铺到 8 级可快速扩容。
     * 超过这档后建筑成本指数上涨，及时改买扩容 II，避免无限堆仓拖住住房与人口门槛。 */
    var storageUpgradeIsGoal = !!(storageCapacityUpgrade &&
      ((cond && cond.t === 'upgrade' && cond.id === storageCapacityUpgrade.id) ||
       (civicBoost && civicBoost.t === 'upgrade' && civicBoost.id === storageCapacityUpgrade.id)));
    if (storageCapacityUpgrade && storageCapacityUpgrade.id === 'upg_ballast_2' &&
        availableBuilding(s, 'ballast') && (s.lvl.ballast || 0) < 8 && !storageUpgradeIsGoal)
      storageCapacityUpgrade = null;
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
    if (civicUpgradeDef && (!storageCapacityUpgrade || storageCapacityUpgrade.id !== civicUpgradeDef.id)) {
      for (var cuk in civicUpgradeDef.cost || {})
        plannedCost[cuk] = (plannedCost[cuk] || 0) + civicUpgradeDef.cost[cuk];
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
    if (cond && cond.t === 'res') needs[cond.r] = Math.max(needs[cond.r] || 0,
      Math.max(0, cond.n - (s.res[cond.r] || 0)));
    /* 天穹钻机耗材按剩余壳厚计算：建造需要 20 个，运行需要 DRILL/s × 预计运行秒数。
     * 天穹钻机是奇观队列最后一座；其余奇观建完前不提前囤钻头，避免抢占钢制零件、绳等共用原料。 */
    var drillTarget = drillStockTarget(s);
    var allPreDrillWondersBuilt = (SB.WONDERS || []).every(function (w) {
      return w.id === 'wonder_skydrill' || isOwned(s, w.id);
    });
    if (!allPreDrillWondersBuilt && !shellGateNeedsDrill(s, goal)) drillTarget = 0;
    if (drillTarget > 0) {
      expandPrimaryNeeds(s, 'resonantDrill', drillTarget, needs, []);
    }
    /* 主目标资源缺口会抬高对应职业权重；挑战限制仍由 folk.autoAssign 统一钳制。 */
    Object.keys(needs).forEach(function (r) {
      var j = resourceJob(r, s);
      if (!j || j === 'gather') return;
      /* addCostNeeds / expandPrimaryNeeds 已将 needs 写成「还缺多少」，这里不可再扣一次库存。 */
      var cap = SB.economy.capOf(s, r), shortage = needs[r] || 0;
      if (isFinite(cap) && shortage > Math.max(20, cap * 0.75)) weights[j] = Math.max(weights[j] || 0, 0.62);
      else if (shortage > 0.01) weights[j] = Math.max(weights[j] || 0, 0.42);
    });
    /* 当前建造/升级的原料岗不能只靠权重争抢。多资源目标（如城堡仓储升级）
     * 会同时需要采石工与珊瑚匠；高暖石目标把矿工权重拉高后，这些 0.42/0.90
     * 权重仍会被按比例取整成 0 人，材料因此永远凑不齐。把当前直接计划的递归
     * 原料岗位标记出来，稍后按最低人数保底；遥远的钻机/奇观缺口不在此范围内。 */
    var requiredMaterialJobs = {}, materialNeeds = {};
    addCostNeeds(s, plannedCost, materialNeeds);
    addCostNeeds(s, supportCost, materialNeeds);
    Object.keys(materialNeeds).forEach(function (r) {
      var j = resourceJob(r, s);
      if (j && j !== 'gather' && (materialNeeds[r] || 0) > 0.01) {
        requiredMaterialJobs[j] = true;
        weights[j] = Math.max(weights[j] || 0, 0.90);
      }
    });
    /* 区域等级鼓舞常会卡在一笔很小的单栋建筑差额上（例如鱼牧场只差十几珊瑚）。
     * 明确把这座目标建筑的递归原料缺口提到首要岗位权重，避免通用经济配比把
     * 珊瑚匠/采石工四舍五入成 0 人，导致分区门槛停在最后几级。 */
    var activeZoneCond = cond && cond.t === 'zoneLvl' && !SB.tech.condMet(s, cond) ? cond :
      (civicBoost && civicBoost.t === 'zoneLvl' && !SB.civic.boostMet(s, civicGoal) ? civicBoost : null);
    var requiredZoneJobs = {}, zoneNeeds = {};
    if (activeZoneCond && nextBuild) {
      addCostNeeds(s, SB.economy.costOf(s, nextBuild), zoneNeeds);
      Object.keys(zoneNeeds).forEach(function (r) {
        var j = resourceJob(r, s);
        if (j && j !== 'gather' && (zoneNeeds[r] || 0) > 0.01) {
          requiredZoneJobs[j] = true;
          weights[j] = Math.max(weights[j] || 0, 0.90);
        }
      });
    }
    var plannedStoneShortage = Math.max(0, needs.stone || 0);
    if (plannedStoneShortage > 0) weights.quarrier = Math.max(weights.quarrier || 0, 0.90);
    /* 奇观递归工艺链会把脚手架拆成大量珊瑚/藻食需求；即使当前科技目标不是
     * wonders，也要按正在排队的奇观补原料岗位，否则绳线缺藻食会让高阶奇观无限期等待。 */
    if (nextWonder || (cond && cond.t === 'wonders')) {
      if ((needs.steel || 0) > 0.01)
        weights.miner = Math.max(weights.miner || 0, 0.85);
      if ((needs.coral || 0) > 0.01)
        weights.coralwright = Math.max(weights.coralwright || 0, 4.0);
      var kelpShortage = Math.max(0, needs.kelp || 0);
      if (kelpShortage > 20 && foodJob > 0) {
        var coralTargetRate = Math.max(1, SB.economy.rates(s).coral || 0);
        var gatherTarget = Math.ceil((SB.economy.foodUse(s) + coralTargetRate - builtFood) / foodJob);
        /* 建筑侧即使已覆盖口粮，也可能让 foodNeed=0；这会让 bot 完全不派采集者，
         * 绳料（藻食）库存永远不涨。按每名额外采集者约支撑 1 个脚手架批次的原料
         * 需求折算岗位，并保留 25% 人口上限，避免为遥远总造价挤空科研/矿业。 */
        var craftGatherTarget = Math.ceil(kelpShortage / 10000);
        var extraGather = Math.min(Math.max(0, gatherTarget - foodNeed, craftGatherTarget),
          Math.ceil(s.pop * 0.25));
        /* 额外采集者只负责把工艺料补进藻食仓，不应在仓库已满时占住岗位。
         * 否则 20× 下满仓采集仍吃掉最多 25% 人口，再配合暖石目标的精确矿工权重，
         * 会把珊瑚匠压到 1–2 人；例如硬化珊瑚/脚手架或仓储升级就会变成数十小时瓶颈。
         * 库存高于 75% 时逐步收回这部分采集岗位，跌到 50% 再完全恢复；口粮岗位 foodNeed 不变。 */
        var kelpCap = SB.economy.capOf(s, 'kelp'), kelpStock = s.res.kelp || 0;
        if (isFinite(kelpCap) && kelpCap > 0) {
          var craftBufferHeadroom = Math.max(0, Math.min(1,
            (kelpCap * 0.75 - kelpStock) / (kelpCap * 0.25)));
          extraGather = Math.ceil(extraGather * craftBufferHeadroom);
        }
        foodNeed = Math.min(s.pop > 1 ? s.pop - 1 : s.pop, foodNeed + extraGather);
      }
    }
    /* 住房是关键科技的硬前置，不能让可选市政/常规岗位把建房资源挤掉。
     * 当前房屋买不起时，把对应采集岗位提到优先级首位；挑战的人口/职业门禁仍由
     * folk.autoAssign 统一执行，不会绕过挑战规则。 */
    if (housingNeed) {
      var housingCost = SB.economy.costOf(s, housingNeed);
      if (!SB.economy.canAfford(s, housingCost)) for (var hr in housingCost) {
        var hj = resourceJob(hr, s);
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
        var minerReserve = plannedStoneShortage > 0 ? 2 : 1;
        var targetMiners = Math.min(Math.max(0, restWorkers - minerReserve),
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
    /* 奇观/升级需要钢制零件时也要先采暖石。仅在当前零件配方已解锁时启用，
     * 并按所需机组数量分配矿工；汽轮机超出可持续供给的部分会在下方自动停用。 */
    var steelPartTarget = goalCost(s, goal).steelPart || 0;
    if (nextWonder) {
      var steelPartWonder = SB.workshop.wonderById(nextWonder);
      steelPartTarget = Math.max(steelPartTarget, steelPartWonder && steelPartWonder.cost &&
        steelPartWonder.cost.steelPart || 0);
    }
    if (supportUpgradeId) {
      var steelPartSupport = SB.workshop.upgradeById(supportUpgradeId);
      steelPartTarget = Math.max(steelPartTarget, steelPartSupport && steelPartSupport.cost &&
        steelPartSupport.cost.steelPart || 0);
    }
    var steelPartRecipe = recipeByResource('steelPart');
    var steelPartRemain = Math.max(0, steelPartTarget - (s.res.steelPart || 0));
    if (steelPartRemain > 0 && steelPartRecipe && recipeUnlocked(s, steelPartRecipe)) {
      /* 首台汽轮机/工坊的建造料要先到位；矿工目标很高时，显式保留采石工，
       * 否则石头只在可选建筑与主目标间循环，生产线始终无法落地。 */
      if (nextBuild === 'hydroturbine' || nextBuild === 'hydroshop') {
        var hydroBuildCost = SB.economy.costOf(s, nextBuild);
        if ((s.res.stone || 0) < (hydroBuildCost.stone || 0))
          weights.quarrier = Math.max(weights.quarrier || 0, 0.90);
        if ((s.res.hardCoral || 0) < (hydroBuildCost.hardCoral || 0))
          weights.coralwright = Math.max(weights.coralwright || 0, 0.90);
      }
      var desiredHydro = Math.min(10, Math.max(2, Math.ceil(steelPartRemain / 25)));
      var restHydroWorkers = Math.max(0, s.pop - foodNeed);
      var hydroMinerReserve = plannedStoneShortage > 0 ? 2 : 1;
      var targetHydroMiners = Math.min(Math.max(0, restHydroWorkers - hydroMinerReserve),
        minersForWarmstone(s, (SB.UNIT.hydroWarm || 5) * desiredHydro * 1.15));
      var otherHydroWeight = 0, hydroJobIds = SB.folk && SB.folk.IDS || [];
      for (var hi = 0; hi < hydroJobIds.length; hi++) if (hydroJobIds[hi] !== 'gather' &&
          hydroJobIds[hi] !== 'miner' && SB.folk.jobUnlocked(s, hydroJobIds[hi]))
        otherHydroWeight += weights[hydroJobIds[hi]] || 0;
      if (targetHydroMiners > 0 && targetHydroMiners < restHydroWorkers && otherHydroWeight > 0) {
        var hydroMinerWeight = targetHydroMiners * otherHydroWeight /
          (restHydroWorkers - targetHydroMiners);
        weights.miner = Math.max(weights.miner || 0, hydroMinerWeight);
      }
    }
    /* 其它目标（尤其暖石产线）可能把矿工权重抬得很高；即使上面把缺口岗位提到
     * 0.90，按比例取整仍可能分到 0 人。对当前建造/升级与分区门槛所需原料至少
     * 预留 1.5 个岗位，让 rounded target 保留 1–2 人直到材料到手。 */
    var availableWorkers = Math.max(1, s.pop - foodNeed), allJobs = SB.folk && SB.folk.IDS || [];
    var reservedMaterialJobs = Object.assign({}, requiredMaterialJobs, requiredZoneJobs);
    Object.keys(reservedMaterialJobs).forEach(function (job) {
      if (!SB.folk.jobUnlocked(s, job)) return;
      var otherWeight = 0;
      for (var wj = 0; wj < allJobs.length; wj++) if (allJobs[wj] !== 'gather' && allJobs[wj] !== job &&
          SB.folk.jobUnlocked(s, allJobs[wj])) otherWeight += weights[allJobs[wj]] || 0;
      var minimumWeight = availableWorkers > 1.5 && otherWeight > 0
        ? 1.5 * otherWeight / (availableWorkers - 1.5) : 1;
      weights[job] = Math.max(weights[job] || 0, minimumWeight);
    });
    var jobsBefore = JSON.stringify(s.jobs);
    var assignWeights = cold ? Object.assign({}, weights, {
      miner: Math.max(weights.miner || 0, 0.25)
    }) : weights;
    var assignment = Object.assign({ gather: foodNeed }, assignWeights);
    SB.folk.autoAssign(s, assignment);
    /* 再用 rates() 的实际净口粮速率校准。foodRate 的简算没有带入所有季节/保温修正，
     * 单靠上面的预测在转季时曾把农民从 8 人降到 0，触发连环饥荒；现在按实际面板
     * 速率逐个增加采集者，直到净产量覆盖消耗并留下 25% 余量。 */
    var safeFoodRate = Math.max(0.1, SB.economy.foodUse(s) * 0.25);
    for (var foodPass = 0; foodPass < s.pop; foodPass++) {
      if ((SB.economy.rates(s).kelp || 0) >= safeFoodRate) break;
      var oldGather = s.jobs.gather || 0;
      if (oldGather >= (s.pop > 1 ? s.pop - 1 : s.pop)) break;
      assignment.gather = oldGather + 1;
      SB.folk.autoAssign(s, assignment);
      if ((s.jobs.gather || 0) <= oldGather) break;
    }
    if (JSON.stringify(s.jobs) !== jobsBefore) { changed = true; actions++; }
    /* 现有汽轮机若超过暖石的可持续净产量就停一部分；热液工坊也不能运行得多过
     * 可用供给。按等价于 UI 停/开按钮的停用计数调整，不改建筑或资源，防止扩产反过来
     * 烧空暖石、冻死人口。新一轮暖石产出提升后，下次策略步会自动重新启用。 */
    var sustainableTurbines = hydroSupportCap(s);
    /* 工业化等「热液能产出达到 N/s」的尤里卡只检查瞬时供给，不要求长期维持。
     * 若汽轮机已建齐、仓里有充足暖石，却只按持续产量启机，策略会永远停在 1/N。
     * 保留四分之一暖石仓储，并允许用最多 30 游戏秒库存短时开足所需机组；只计新增机组
     * 相对当前运转状态的净暖石消耗，不能把已在运行的机组重复从库存预算中扣除。门槛研究后
     * 下一步会回到 hydroSupportCap() 给出的可持续台数。 */
    if (cond && cond.t === 'rate' && cond.r === 'hydroSupply') {
      var currentHydro = SB.economy.rates(s).hydroSupply || 0;
      var hydroTarget = hydroTurbineTarget(s, cond.n), activeTurbines = hydroTarget.active;
      if (currentHydro + 1e-9 < cond.n) {
        var burstTurbines = Math.max(activeTurbines, hydroTarget.required);
        var warmPerTurbine = activeTurbines > 0 && SB.economy.warmDraw
          ? SB.economy.warmDraw(s, 'hydroturbine') / activeTurbines
          : Math.max(0.001, SB.UNIT && SB.UNIT.hydroWarm || 5);
        var warmCap = SB.economy.capOf(s, 'warmstone');
        var warmReserve = isFinite(warmCap) ? warmCap * 0.25 : 0;
        var addedWarmRate = Math.max(0, burstTurbines - activeTurbines) * warmPerTurbine;
        var currentWarmRate = SB.economy.rates(s).warmstone || 0;
        /* Eureka reads the instantaneous rate, and pumpTech() is called immediately below.
         * Budget one game second of extra burn so a brief rate spike can satisfy the gate
         * without requiring the population/resources to sustain 50/s for half a minute. */
        var burstWarm = Math.max(0, addedWarmRate - currentWarmRate);
        if ((s.lvl.hydroturbine || 0) >= burstTurbines &&
            (s.res.warmstone || 0) - burstWarm >= warmReserve)
          sustainableTurbines = Math.max(sustainableTurbines, burstTurbines);
      }
    }
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
    var craftDiagnostics = {};
    for (var nr in plannedCost) {
      var plannedRecipe = recipeByResource(nr);
      if ((s.res[nr] || 0) < plannedCost[nr] && plannedRecipe) {
        var beforePlannedCraft = s.res[nr] || 0;
        var craftIsUnlocked = recipeUnlocked(s, plannedRecipe);
        var craftBlockedReason = SB.workshop.craftBlocked(s, plannedRecipe.id);
        var craftAvailableBatches = SB.workshop.maxCraftable(s, plannedRecipe);
        var craftDidRun = ensureCraft(s, nr, plannedCost[nr], emit, []);
        craftDiagnostics[nr] = {
          have: beforePlannedCraft, target: plannedCost[nr], unlocked: craftIsUnlocked,
          blocked: craftBlockedReason, availableBatches: craftAvailableBatches,
          made: Math.max(0, (s.res[nr] || 0) - beforePlannedCraft)
        };
        did(craftDidRun);
      }
    }
    for (var sr in supportCost) {
      if ((s.res[sr] || 0) < supportCost[sr] && recipeByResource(sr))
        did(ensureCraft(s, sr, supportCost[sr], emit, []));
    }
    var overflowCraftResult = overflowCraft(s, plannedCost, emit);
    if (overflowCraftResult) did(true);
    if (supportUpgradeId && SB.workshop.upgradeCanBuy(s, supportUpgradeId))
      did(SB.workshop.upgradeBuy(s, supportUpgradeId, emit));
    if (drillTarget > 0 && (s.res.resonantDrill || 0) < drillTarget)
      did(ensureCraft(s, 'resonantDrill', drillTarget, emit, []));
    /* 按计划建设；最多 2 个动作，避免单帧连续消费刚产出的资源。 */
    var firstBuildInPass = null;
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
      nextBuild = chooseBuild(s, goal, options, civicGoal);
      /* 主科技建筑有时被指数造价卡住（例如高等级汽轮机的硬化珊瑚）。
       * 之前只有本轮已经成功建成第一栋后，第二个动作才会走 portfolioBuild；
       * 若第一个目标本身买不起，循环直接 break，市政的总建筑等级和其他建筑
       * 就会一起停摆。此时在不放弃主目标/材料岗位计划的前提下，改建一栋
       * 现在买得起的组合建筑，让科技材料继续积累、市政等级也继续推进。 */
      if (nextBuild && !freeBuilding(s, nextBuild) && civicBoost && civicBoost.t === 'total' &&
          !SB.civic.boostMet(s, civicGoal)) {
        var affordablePortfolioId = portfolioBuild(s, nextBuild);
        if (affordablePortfolioId) nextBuild = affordablePortfolioId;
      }
      /* 仍有市政「总建筑等级」门槛时，如果本轮第一个动作已经建了目标建筑，
       * 第二个动作不要再次堆同一栋；用可负担的关键建筑拓宽产出面。主门槛仍先建，
       * 且材料计划仍按主门槛核算，所以多样化不会让 AI 丢掉当前科技条件。 */
      if (b > 0 && firstBuildInPass && nextBuild === firstBuildInPass &&
          civicBoost && civicBoost.t === 'total' && !SB.civic.boostMet(s, civicGoal)) {
        var portfolioId = portfolioBuild(s, firstBuildInPass);
        if (portfolioId) nextBuild = portfolioId;
      }
      nextWonder = chooseWonder(s, goal, options);
      if (shouldPrioritizeConditionBuild(s, goal, nextBuild)) nextWonder = null;
      if (nextWonder && SB.workshop.wonderBlocked(s, nextWonder) === null) {
        if (!did(SB.workshop.build(s, nextWonder, emit))) break;
        continue;
      }
      if (nextBuild && freeBuilding(s, nextBuild)) {
        if (!did(SB.habitat.build(s, nextBuild, emit))) break;
        if (b === 0) firstBuildInPass = nextBuild;
        continue;
      }
      break;
    }
    if (cond && cond.t === 'tools') (cond.ids || []).forEach(function (id) {
      if (SB.workshop.canBuy(s, id)) did(SB.workshop.buy(s, id, emit));
    });
    if (cond && cond.t === 'upgrade' && SB.workshop.upgradeCanBuy(s, cond.id))
      did(SB.workshop.upgradeBuy(s, cond.id, emit));
    if (civicUpgradeId && SB.workshop.upgradeCanBuy(s, civicUpgradeId))
      did(SB.workshop.upgradeBuy(s, civicUpgradeId, emit));
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
        var storagePressure = housingCapacityBlocked || buildCapacityBlocked, installedPriorityCard = false;
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
              installedPriorityCard = did(SB.civic.setCard(s, storageCards[sci], emit));
              if (installedPriorityCard) break;
            }
          }
        }
        /* 仓储推进优先保留工艺卡；市政若明确要求一张政策卡，则该卡优先于普通选择。 */
        var civicCardBoost = nextCivicBoost(s);
        var priorityCard = storagePolicyEquipped ? null :
          (civicCardBoost && civicCardBoost.t === 'card' ? civicCardBoost.id :
          (storagePressure ? 'card_craft' : null));
        if (!installedPriorityCard && priorityCard && s.cards && s.cards.indexOf(priorityCard) < 0 &&
            SB.civic.canSetCard(s, priorityCard))
          installedPriorityCard = did(SB.civic.setCard(s, priorityCard, emit));
        var policies = SB.POLICIES || [];
        var policySlots = SB.civic.slotList(s);
        /* 通用卡只填空槽，不在槽位已满时反复替换；同时跳过已装备的卡，避免逐帧覆盖。 */
        if (!installedPriorityCard) for (var pi = 0; pi < policies.length; pi++) {
          var p = policies[pi], effectful = Object.keys(p).some(function (k) {
            return ['id', 'name', 'civic', 'type', 'effect', 'retiredBy', 'desc'].indexOf(k) < 0 && p[k] != null;
          });
          var targetPolicySlot = -1;
          if (effectful && s.cards.indexOf(p.id) < 0 && SB.civic.canSetCard(s, p.id)) {
            for (var psi = 0; psi < policySlots.length; psi++) if (!s.cards[psi] &&
                SB.civic.cardFits(p, policySlots[psi].type)) { targetPolicySlot = psi; break; }
          }
          if (targetPolicySlot >= 0) {
            if (did(SB.civic.setCard(s, p.id, emit, targetPolicySlot))) break;
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
      civic: civicGoal && civicGoal.id || null, civicCondition: civicBoost && civicBoost.t || null,
      zoneJobs: Object.keys(requiredZoneJobs), zoneJobCounts: Object.keys(requiredZoneJobs).map(function (job) {
        return job + ':' + (s.jobs[job] || 0);
      }),
      materialJobCounts: Object.keys(reservedMaterialJobs).map(function (job) {
        return job + ':' + (s.jobs[job] || 0);
      }),
      plannedResourceNeeds: Object.assign({}, needs),
      craftDiagnostics: craftDiagnostics,
      overflowCraft: overflowCraftResult,
      zone: activeZoneCond && activeZoneCond.zone || null,
      zoneNeeds: zoneNeeds,
      housingTarget: housingTarget,
      housingCapacityBlocked: housingCapacityBlocked,
      housingChecks: housingChecks,
      plannedUpgrade: capacityUpgrade ? 'upg_castle' :
        (storageCapacityUpgrade && storageCapacityUpgrade.id || civicUpgradeId ||
          (cond && cond.t === 'upgrade' && !(s.upgrades && s.upgrades[cond.id]) ? cond.id : null)),
      buildCost: nextBuild ? SB.economy.costOf(s, nextBuild) : null,
      buildMaterials: nextBuild ? Object.keys(SB.economy.costOf(s, nextBuild)).map(function (r) {
        return r + ':' + ((s.res[r] || 0).toFixed ? (s.res[r] || 0).toFixed(1) : (s.res[r] || 0)) + '/' +
          SB.economy.costOf(s, nextBuild)[r];
      }) : [],
      build: nextBuild || null, wonder: nextWonder || null };
  }

  SB.aiStrategy = { version: 35, step: step, researchGoal: researchGoal, firstMissingPrereq: firstMissingPrereq,
    drillStockTarget: drillStockTarget };
})(typeof window !== 'undefined' ? window : globalThis);
