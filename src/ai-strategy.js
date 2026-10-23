/* 天壳 · 可复用自动游玩策略
 * 浏览器 AI、整局模拟和挑战验证共用这套决策；只调用游戏规则 API，不复制经济公式到各个 runner。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var warmstoneTargetCache = { state: null, rate: null, season: null, until: -Infinity, miners: 0 };
  var VOID_ENDING_RUN_KEY = 'shellbreak.ai.void-ending-run';

  function markVoidEndingRun() {
    try {
      if (root.localStorage) root.localStorage.setItem(VOID_ENDING_RUN_KEY, '1');
      return true;
    } catch (e) { return false; }
  }

  /* 所有已实装挑战结束后，普通周目就是唯一的虚境终局局。
   * 不把待实装的「流浪泰拉」占位计入完成门槛。 */
  function isVoidEndingRun(s) {
    if (!s || s.challenge) return false;
    try {
      if (root.localStorage && root.localStorage.getItem(VOID_ENDING_RUN_KEY) === '1') return true;
    } catch (e) {}
    if (!SB.challenges || !SB.challenges.tierDone || !SB.game || !SB.game.meta) return false;
    var meta = SB.game.meta();
    return SB.challenges.tierDone('cold', meta) >= 1 &&
      SB.challenges.tierDone('small', meta) >= 1 &&
      SB.challenges.tierDone('science', meta) >= 3 &&
      SB.challenges.tierDone('abyss', meta) >= 3 &&
      SB.challenges.tierDone('speedrun', meta) >= 3;
  }

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
  function thetaProductionPlan(s, targetRate) {
    if (!s || !SB.economy || !SB.economy.rates || !SB.economy.thetaInputRates) return null;
    var levels = Math.max(0, Number(s.lvl && s.lvl.biomatlab) || 0);
    var active = Math.max(0, levels - Math.max(0, Number(s.biomatlabStop) || 0));
    var rates = SB.economy.rates(s), inputs = SB.economy.thetaInputRates(s);
    var techMul = SB.tech && SB.tech.mul ? SB.tech.mul(s) : null;
    var buildEff = Math.max(0.01, Number(techMul && techMul.bldEff) || 1);
    var rawPerLab = {
      kelp: (SB.BLD.biomatlabKelp || 0) * buildEff,
      iron: (SB.BLD.biomatlabIron || 0) * buildEff,
      titanium: (SB.BLD.biomatlabTi || 0) * buildEff,
      uranium: (SB.BLD.biomatlabU || 0) * buildEff
    };
    var supported = Infinity, limiting = null, supply = {}, resourceCaps = {};
    Object.keys(rawPerLab).forEach(function (resource) {
      var gross = Math.max(0, (Number(rates[resource]) || 0) + (Number(inputs[resource]) || 0));
      supply[resource] = gross;
      var cap = rawPerLab[resource] > 0 ? Math.floor(gross / rawPerLab[resource] * 0.90) : Infinity;
      resourceCaps[resource] = cap;
      if (cap < supported) { supported = cap; limiting = resource; }
    });
    var labHydro = Math.max(0, Number(SB.BLD.biomatlabHydro) || 0);
    if (labHydro > 0) {
      var hydroSupply = Math.max(0, Number(rates.hydroSupply) || 0);
      var hydroDemand = Math.max(0, -(Number(rates.hydro) || 0));
      var otherHydroDemand = Math.max(0, hydroDemand - active * labHydro);
      var hydroCap = Math.floor(Math.max(0, hydroSupply - otherHydroDemand) / labHydro * 0.90);
      resourceCaps.hydro = hydroCap;
      if (hydroCap < supported) { supported = hydroCap; limiting = 'hydro'; }
    }
    if (!isFinite(supported)) supported = levels;
    supported = Math.max(0, Math.floor(supported));

    /* 探测一座满原料研究所的真实产率。用状态副本和纯 rates API，不改玩家资源；
     * 这样能区分「还缺研究所等级」与「原料产能根本撑不起更多研究所」。 */
    var probe = Object.assign({}, s);
    probe.lvl = Object.assign({}, s.lvl || {});
    probe.res = Object.assign({}, s.res || {});
    probe.lvl.biomatlab = Math.max(1, levels);
    probe.lvl.solar_ring = 0;
    probe.biomatlabStop = probe.lvl.biomatlab - 1;
    Object.keys(rawPerLab).forEach(function (resource) { probe.res[resource] = 1e12; });
    var perLabOutput = Math.max(0, Number(SB.economy.thetaRate(probe)) || 0);
    var requestedRate = Math.max(0, Number(targetRate) || 0);
    var targetLabs = requestedRate > 0 && perLabOutput > 0
      ? Math.max(1, Math.ceil(requestedRate / perLabOutput)) : levels;
    /* 原料扩产按阶段推进，而不是立刻为最终目标占满人口。之前钛矿工和藻食采集者
     * 都按 targetLabs（本局约 43 座）保岗；但精铁当时只够 14 座，52 名矿工和
     * 大批采集者因此挤掉采石工/珊瑚匠，压舱仓与住房材料长期攒不齐。每次只为
     * 当前可持续产能再多留 15%（至少 2 座）的原料余量；瓶颈提升后下一轮自动上调。 */
    var rampBaseLabs = Math.min(targetLabs, Math.max(active, supported));
    var stagedTargetLabs = Math.min(targetLabs, rampBaseLabs < targetLabs
      ? rampBaseLabs + Math.max(2, Math.ceil(rampBaseLabs * 0.15))
      : targetLabs);
    return { active: active, levels: levels, supportedLabs: supported, targetLabs: targetLabs,
      stagedTargetLabs: stagedTargetLabs, limiting: limiting, perLabOutput: perLabOutput,
      supply: supply, resourceCaps: resourceCaps,
      inputPerLab: rawPerLab };
  }
  function craftInputPerOutput(s, resource, inputResource) {
    var recipe = recipeByResource(resource);
    if (!recipe || !recipeUnlocked(s, recipe) || !SB.workshop ||
        !SB.workshop.craftMul || !SB.workshop.craftCostMul) return 0;
    var output = Math.max(1e-9, (Number(recipe.out) || 0) * SB.workshop.craftMul(s, recipe));
    return Math.max(0, Number(recipe.in && recipe.in[inputResource]) || 0) *
      Math.max(0, Number(SB.workshop.craftCostMul(s, recipe)) || 0) / output;
  }
  function dysonCraftTarget(s, resource, target, dysonPlan) {
    /* 节点原料制作与马尔斯工造中心升级争用 θ 金属。先预留下一等级造价，
     * 否则薄膜自动补库会把刚攒到的 θ 全做成薄膜，工造中心永远差最后一笔。 */
    if (!s || resource !== 'thinafilm' || !dysonPlan || dysonPlan.mode !== 'node' ||
        !(dysonPlan.tiplateRateRequired > dysonPlan.tiplateRateAvailable + 1e-9) ||
        !availableBuilding(s, 'mars_workshop')) return target;
    var recipe = recipeByResource(resource), buildCost = SB.economy.costOf(s, 'mars_workshop');
    if (!recipe || !recipe.in || !(recipe.in.thetaMetal > 0) ||
        !SB.workshop.craftMul || !SB.workshop.craftCostMul) return target;
    var reserve = Math.max(0, Number(buildCost && buildCost.thetaMetal) || 0);
    var costPerBatch = recipe.in.thetaMetal * SB.workshop.craftCostMul(s, recipe);
    var surplus = Math.max(0, (Number(s.res && s.res.thetaMetal) || 0) - reserve);
    var batches = costPerBatch > 0 ? Math.floor(surplus / costPerBatch) : 0;
    var safeOutput = batches * recipe.out * SB.workshop.craftMul(s, recipe);
    return Math.min(target, (Number(s.res && s.res[resource]) || 0) + safeOutput);
  }
  function thetaIronMiningPlan(s, plan) {
    if (!s || !plan || !plan.inputPerLab || !(plan.inputPerLab.iron > 0)) return null;
    var staged = Math.max(0, Number(plan.stagedTargetLabs) || 0);
    var targetRate = staged * plan.inputPerLab.iron / 0.90;
    var supply = Math.max(0, Number(plan.supply && plan.supply.iron) || 0);
    var miners = Math.max(0, Number(s.jobs && s.jobs.miner) || 0);
    var probe = Object.assign({}, s);
    probe.jobs = Object.assign({}, s.jobs || {});
    probe.jobs.miner = miners + 1;
    var probeRates = SB.economy.rates(probe), probeInputs = SB.economy.thetaInputRates(probe);
    var marginal = Math.max(0,
      (Number(probeRates.iron) || 0) + (Number(probeInputs.iron) || 0) - supply);
    var extra = marginal > 1e-9 ? Math.ceil(Math.max(0, targetRate - supply) / marginal) : 0;
    return { targetRate: targetRate, supply: supply, marginalPerMiner: marginal,
      currentMiners: miners, targetMiners: miners + extra, needed: targetRate > supply + 1e-9 };
  }
  function thetaSourceBuilding(s, plan) {
    if (!plan || !plan.limiting) return null;
    var id = plan.limiting === 'iron' ? 'furnace' :
      plan.limiting === 'titanium' ? 'siltpit' :
      plan.limiting === 'uranium' ? 'rheamine' :
      /* 藻食是θ研究所的大宗耗材。喷口导流堤每级放大全部藻食产出，
       * 远比在高等级后继续买单块 +0.45/秒的藻场有效；有余力时先升导流堤，
       * 若它暂不可建再回退到藻场。 */
      plan.limiting === 'kelp' ?
        (availableBuilding(s, 'weir') ? 'weir' : 'kelp') :
      plan.limiting === 'hydro' ? 'hydroturbine' : null;
    /* 精铁从矿工产出的矿砂冶炼。矿工达到深层矿井职业上限时，继续堆热泉炉
     * 只会把满仓矿砂和炉子成本推过仓储上限；先升矿坑增加矿砂产率/岗位上限。 */
    if (plan.limiting === 'iron' && SB.folk && SB.folk.jobLimit &&
        availableBuilding(s, 'siltpit')) {
      var ironPlan = thetaIronMiningPlan(s, plan);
      if (ironPlan && ironPlan.targetMiners > SB.folk.jobLimit(s, 'miner') + 1e-9)
        return 'siltpit';
    }
    return id && availableBuilding(s, id) ? id : null;
  }
  function thetaConditionTarget(s, cond) {
    if (!s || !cond) return 0;
    if (cond.t === 'res' && cond.r === 'thetaMetal') return Math.max(0, Number(cond.n) || 0);
    var cost = null;
    if (cond.t === 'built' && cond.b) cost = SB.economy.costOf(s, cond.b);
    else if (cond.t === 'upgrade' && cond.id) {
      var upgrade = SB.workshop.upgradeById(cond.id);
      cost = upgrade && upgrade.cost;
    }
    return Math.max(0, Number(cost && cost.thetaMetal) || 0);
  }
  function thetaKelpGatherPlan(s, plan, baseGather, minerTarget) {
    var stagedLabs = plan && (Number(plan.stagedTargetLabs) || Number(plan.targetLabs)) || 0;
    if (!s || !plan || !plan.inputPerLab || !(plan.inputPerLab.kelp > 0) ||
        !(stagedLabs > 0) || (Number(plan.resourceCaps && plan.resourceCaps.kelp) || 0) >= stagedLabs)
      return null;
    /* rate 门槛要看可持续的净余料。把口粮扣除后的藻食产能用于研究所输入；
     * 每名采藻者的边际量直接从正式 rates API 差分取得，涵盖科技、工具、季节与政体。 */
    var targetSupply = stagedLabs * plan.inputPerLab.kelp / 0.90;
    var currentSupply = Math.max(0, Number(plan.supply && plan.supply.kelp) || 0);
    if (currentSupply + 1e-9 >= targetSupply) return null;
    var probe = Object.assign({}, s);
    probe.jobs = Object.assign({}, s.jobs || {});
    probe.jobs.gather = (Number(probe.jobs.gather) || 0) + 1;
    var probeRates = SB.economy.rates(probe), probeInputs = SB.economy.thetaInputRates(probe);
    var baseRates = SB.economy.rates(s), baseInputs = SB.economy.thetaInputRates(s);
    var marginal = (Number(probeRates.kelp) || 0) + (Number(probeInputs.kelp) || 0) -
      (Number(baseRates.kelp) || 0) - (Number(baseInputs.kelp) || 0);
    if (!(marginal > 1e-9)) return null;
    /* currentSupply 已经包含现有采集者的产出，所以缺口必须加到当前人数上，
     * 不能加到 foodNeed（它只表示维持口粮所需人数）。旧算法把 41 名采集者的
     * 产量计进 currentSupply 后，又从 foodNeed=5 起算目标，结果报 target=37，
     * AI 便永远不会把采集者加到能供应 θ 研究所的数量。 */
    var currentGather = Math.max(Number(baseGather) || 0, Number(s.jobs && s.jobs.gather) || 0);
    var workersForOtherJobs = Math.max(12, (Number(minerTarget) || 0) + 12);
    var maxGather = Math.max(currentGather, (Number(s.pop) || 0) - workersForOtherJobs);
    var needed = Math.ceil((targetSupply - currentSupply) / marginal);
    return { target: Math.max(currentGather, Math.min(maxGather,
      currentGather + needed)), targetSupply: targetSupply,
      currentSupply: currentSupply, marginalPerGather: marginal, maxGather: maxGather };
  }
  function titaniumMiningPlan(s, thetaPlan) {
    if (!s || !thetaPlan || !(thetaPlan.inputPerLab && thetaPlan.inputPerLab.titanium > 0)) return null;
    var rampLabs = Number(thetaPlan.stagedTargetLabs) || Number(thetaPlan.targetLabs) || 0;
    var targetRate = Math.max(0, rampLabs) * thetaPlan.inputPerLab.titanium;
    var supply = Math.max(0, Number(thetaPlan.supply && thetaPlan.supply.titanium) || 0);
    var miners = Math.max(0, Number(s.jobs && s.jobs.miner) || 0);
    var probe = Object.assign({}, s);
    probe.jobs = Object.assign({}, s.jobs || {});
    probe.jobs.miner = miners + 1;
    var probeRates = SB.economy.rates(probe), probeInputs = SB.economy.thetaInputRates(probe);
    var marginal = Math.max(0, (Number(probeRates.titanium) || 0) + (Number(probeInputs.titanium) || 0) - supply);
    var extra = marginal > 1e-9 ? Math.ceil(Math.max(0, targetRate - supply) / marginal) : 0;
    return { targetRate: targetRate, supply: supply, marginalPerMiner: marginal,
      currentMiners: miners, targetMiners: miners + extra,
      needed: targetRate > supply + 1e-9 };
  }
  function titaniumMiningTools(s, plan) {
    if (!plan || !plan.needed || !SB.workshop || !SB.workshop.tools) return [];
    return (SB.workshop.tools() || []).filter(function (tool) {
      return tool && !tool.wip && tool.target && tool.target.indexOf('miner') >= 0 &&
        !(s.tools && s.tools[tool.id]) && (!tool.need || s.techs && s.techs[tool.need]);
    }).sort(function (a, b) { return (Number(b.bonus) || 0) - (Number(a.bonus) || 0); });
  }
  function titaniumMiningUpgrade(s, plan, missingTools) {
    if (!plan || !plan.needed || missingTools && missingTools.length) return null;
    var upgrade = SB.workshop.upgradeById('upg_autodrill');
    if (!upgrade || s.upgrades && s.upgrades[upgrade.id] ||
        !(s.techs && s.techs[upgrade.need])) return null;
    return upgrade.id;
  }
  function ironThetaSupportUpgrade(s, plan) {
    /* θ 的精铁门槛有两条正式工坊增产线：废钢锻造直接提高精铁 +20%，
     * 鱼骨矿井提高矿工金属 +50%。旧策略只换矿物章程卡，却从不检查/安装这两项，
     * 因此高纪元仍长期停在基础冶炼产率。先拿直接增产的废钢锻造，再补上游矿脉。 */
    if (!plan || plan.limiting !== 'iron') return null;
    var ids = ['upg_wasteforge', 'upg_fishbonemine'];
    for (var i = 0; i < ids.length; i++) {
      var upgrade = SB.workshop.upgradeById(ids[i]);
      if (!upgrade || (s.upgrades && s.upgrades[upgrade.id]) ||
          (upgrade.need && !(s.techs && s.techs[upgrade.need])) ||
          (upgrade.needCivic && !(s.civics && s.civics[upgrade.needCivic]))) continue;
      return upgrade.id;
    }
    return null;
  }
  function priorityBuildingUpgrade(s) {
    /* 城堡就是 upg_castle 后的统治核心 hall。议价减耗未到真实软上限前，
     * 城堡升级压过普通扩建；达到后先补齐核心区巢、石屋、砂矿坑和工坊，
     * 核心区目标暂时都不能升级时，再把灯塔作为区外次优先建筑。 */
    var castleInstalled = !!(s.upgrades && s.upgrades.upg_castle);
    var hallLevel = (s.lvl && s.lvl.hall) || 0;
    var discount = SB.economy.hallDiscount ? SB.economy.hallDiscount(s) : 0;
    var discountLimit = SB.economy.hallDiscountLimit ? SB.economy.hallDiscountLimit(s) : 0.5;
    /* 议价还没到软上限时，即使下一等级暂时买不起，也继续把 hall 保留为目标；
     * 这样材料岗位/工艺规划会为议事厅攒料，不会因短缺跳去升普通建筑或灯塔。 */
    if (castleInstalled && hallLevel > 0 && discount + 1e-9 < discountLimit && availableBuilding(s, 'hall'))
      return 'hall';
    var ids = ['nest', 'coralhouse', 'siltpit', 'workshop', 'lighthouse'];
    for (var i = 0; i < ids.length; i++)
      if ((s.lvl && s.lvl[ids[i]] || 0) > 0 && freeBuilding(s, ids[i])) return ids[i];
    return null;
  }
  function totalGovernmentSlots(gov) {
    var slots = gov && gov.slots, total = 0, key;
    if (!slots) return 0;
    for (key in slots) if (Object.prototype.hasOwnProperty.call(slots, key))
      total += Number(slots[key]) || 0;
    return total;
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
  function deferredCycleStardustTech(s, tech) {
    var cond = tech && tech.cond;
    /* 星屑只在正式轮回结算时入账；玩家选择留在破壳后的本局时，超古代科技等
     * 独立叶节点没有本局生产来源。它们没有下游前置，不应挡住太空建筑与戴森链。 */
    if (cond && cond.t === 'gathered' && cond.r === 'stardust' &&
        (Number(s.got && s.got.stardust) || 0) < (Number(cond.n) || 0)) return true;
    /* 黑历史蓝图只要求更高周目数，唯一后继「严冬计划」也是挑战占位科技；
     * 当前周目已明确选择留在壳外时，不为这条可选支线重开。 */
    if (tech && tech.id === 'blackhistory' && cond && cond.t === 'cycle') {
      var meta = SB.game && SB.game.meta ? SB.game.meta() : null;
      if (!meta || (Number(meta.cycle) || 0) < (Number(cond.n) || 0)) return true;
    }
    return false;
  }
  function deferredNoResetTechOrPrereq(s, tech) {
    if (!tech) return false;
    if (deferredCycleStardustTech(s, tech)) return true;
    /* 「严冬计划」的尤里卡要求进入尚未实装的「流浪泰拉」挑战。普通虚境终局局
     * 明确不再跑挑战；把它留作当前科研目标会让状态看起来卡在一个不可达门槛，
     * 因此只在这条普通终局路线跳过这个占位科技，继续可完成的 Era10 科技。 */
    if (isVoidEndingRun(s) && tech.id === 'winter' && tech.cond &&
        tech.cond.t === 'challenge' && tech.cond.id === 'drift_terra') return true;
    var missingId = firstMissingPrereq(s, tech.id);
    var missing = missingId && SB.tech.byId(missingId);
    return !!(missing && missing.id !== tech.id && deferredCycleStardustTech(s, missing));
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
    for (var i = 0; i < keys.length; i++)
      if (!s.techs[keys[i].id] && !deferredNoResetTechOrPrereq(s, keys[i])) { key = keys[i]; break; }
    /* 关键节点全清会推进纪元，但不少普通科技仍是后续系统的前置（导航→数学→教育等）。
     * 关键节点完成后，继续按科技表顺序补齐当前已开放时代的普通科技，不把它们误当成可忽略项。 */
    if (!key) {
      var all = SB.TECHS || [];
      for (var j = 0; j < all.length; j++) {
        if (all[j].era <= s.era && !s.techs[all[j].id] && !deferredNoResetTechOrPrereq(s, all[j])) {
          key = all[j]; break;
        }
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
  function capacityBlockedResource(s, cost) {
    for (var resource in cost || {}) {
      var cap = SB.economy.capOf(s, resource);
      if (isFinite(cap) && cost[resource] > cap + 1e-9) return resource;
    }
    return null;
  }
  function storageBuild(s, resource) {
    /* 藻食仓与压舱仓各管一条独立容量线。若藻场下一级越过藻食上限，
     * 继续堆压舱仓不会增加 kelp 容量，只会把 AI 锁进昂贵的梁材/硬化珊瑚链。 */
    if (resource === 'kelp') {
      if (availableBuilding(s, 'kelpstore')) return 'kelpstore';
      if (s.upgrades && s.upgrades.upg_castle && availableBuilding(s, 'hall')) return 'hall';
      return null;
    }
    /* 压舱仓每级直接给 +120 材料容量，优先用它解住房/建造门槛；只有尚无压舱仓入口时，
     * 才继续升级城堡核心扩容。核心减耗仍会随议事厅升级自然获得。 */
    if (availableBuilding(s, 'ballast')) return 'ballast';
    if (s.upgrades && s.upgrades.upg_castle && availableBuilding(s, 'hall') &&
        (s.lvl.hall || 0) < 20) return 'hall';
    if (s.upgrades && s.upgrades.upg_castle && availableBuilding(s, 'hall')) return 'hall';
    return null;
  }
  function storageUpgrade(s, resource) {
    var ids = resource === 'kelp'
      ? ['upg_kelpstore_1', 'upg_kelpstore_2']
      : ['upg_ballast_1', 'upg_ballast_2', 'upg_alloy_warehouse'];
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
  function civicNeedsWonder(s, civicGoal) {
    var boost = civicGoal && civicGoal.boost;
    if (!boost || ['anyWonders', 'wonders', 'wonderEra'].indexOf(boost.t) < 0 || SB.civic.boostMet(s, civicGoal)) return false;
    if (boost.t === 'wonderEra') return (SB.WONDERS || []).some(function (wonder) {
      return wonder && wonder.era === boost.era && wonderEligible(s, wonder);
    });
    return (boost.ids || []).some(function (id) {
      var wonder = SB.workshop.wonderById(id);
      return wonder && wonderEligible(s, wonder);
    });
  }
  function shellGateNeedsDrill(s, goal) {
    var cond = goal && goal.cond;
    return !!(cond && cond.t === 'shell' && SB.shell && SB.shell.brokenRatio &&
      SB.shell.brokenRatio(s) + 1e-9 < cond.n);
  }
  function shellNeedsDrill(s, goal) {
    if (shellGateNeedsDrill(s, goal)) return true;
    if (!s || s.broken || !(Number(s.shell) > 0) || !(s.techs && s.techs.shellgeo) ||
        !SB.economy || !SB.economy.rOf) return false;
    /* 基础削壳会停在 25%。此时钻机是继续本周目的唯一正式路径，不能等未来纪元
     * 的奇观；那些奇观有的本身就要先破壳，若算作钻机前置会形成永久死锁。 */
    return SB.economy.rOf(s) <= SB.CFG.FLOOR_AT + 1e-9;
  }
  function geekGateNeedsWonder(s, goal) {
    var cond = goal && goal.cond;
    return !!(cond && cond.t === 'geekEnceladus' &&
      !(s.geek && s.geek.enceladusDone) &&
      !(SB.wonder && SB.wonder.owned(s).wonder_geek));
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
  function chooseWonder(s, goal, options, civicGoal) {
    var ids = goal && goal.cond && goal.cond.t === 'wonders' ? goal.cond.ids || [] : [];
    /* 《星球改造》的尤里卡必须由 G.E.E.K 完成恩克拉多斯改造；此前该条件只显示
     * “等资源”，可选奇观又会被住房目标压过，AI 永远不建、不启动 G.E.E.K。把这座
     * 奇观明确作为当前科技的硬前置，让现有工艺材料计划与正式奇观 API 接手。 */
    if (geekGateNeedsWonder(s, goal)) {
      var geekWonder = SB.workshop.wonderById('wonder_geek');
      if (geekWonder && wonderEligible(s, geekWonder)) return geekWonder.id;
    }
    for (var i = 0; i < ids.length; i++) {
      var required = SB.workshop.wonderById(ids[i]);
      if (required && wonderEligible(s, required)) return required.id;
    }
    var wonderUnlocksCivic = (SB.CIVICS || []).some(function (c) {
      return !s.civics[c.id] && c.boost && ['wonder', 'anyWonders', 'wonders', 'wonderEra'].indexOf(c.boost.t) >= 0 &&
        (c.reqs || []).every(function (id) { return !!s.civics[id]; });
    });
    /* 可选奇观不能抢占刚需住房：尤其寒流禁火需要保留 50 人的冻伤缓冲，
     * 小国寡民则由人口上限自然钳住目标。若已解锁的待研究市政明确要求奇观，
     * 先补这座关键奇观，避免住房扩张反过来堵住《神学》等通关前置。 */
    if (!wonderUnlocksCivic && SB.economy.popCap(s) < houseCapacityTarget(s, goal, options)) return null;
    /* 市政「任意一座奇观」及「这几座奇观都要建」也是硬门槛。之前只看科技的 wonders 条件，
     * 所以星球村/全球化等市政虽然已经成为当前目标，AI 却把所需奇观当可选项；
     * 原料还没齐时连建造计划和岗位都不排，顺带错过奇观带来的铁/钢产能加成。 */
    var civicWonderBoost = civicGoal && civicGoal.boost;
    if (civicWonderBoost && ['anyWonders', 'wonders', 'wonderEra'].indexOf(civicWonderBoost.t) >= 0 &&
        !SB.civic.boostMet(s, civicGoal)) {
      var civicWonderCandidates = (SB.WONDERS || []).filter(function (wonder) {
        if (!wonder || !wonderEligible(s, wonder)) return false;
        if (civicWonderBoost.t === 'wonderEra') return wonder.era === civicWonderBoost.era;
        return (civicWonderBoost.ids || []).indexOf(wonder.id) >= 0;
      }).map(function (wonder) {
        var cost = wonder.cost || {}, score = 0, ready = SB.workshop.wonderBlocked(s, wonder.id) === null;
        for (var resource in cost) {
          var have = Number(s.res && s.res[resource]) || 0;
          var cap = SB.economy.capOf(s, resource);
          var scale = isFinite(cap) && cap > 0 ? cap : Math.max(1, Number(cost[resource]) || 1);
          score += Math.max(0, (Number(cost[resource]) || 0) - have) / scale;
        }
        return { wonder: wonder, ready: ready, score: score };
      }).sort(function (a, b) {
        if (a.ready !== b.ready) return a.ready ? -1 : 1;
        return a.score - b.score;
      });
      if (civicWonderCandidates.length) return civicWonderCandidates[0].wonder.id;
    }
    /* 可复用 bot 默认补齐所有可建奇观。天穹钻机通常排最后；但若当前关键科技
     * 明确要求壳层 100% 破除，且剩余奇观被破壳后的科技锁住，就必须先启动钻机打通时代门，
     * 玩家选择留在本局后 bot 再回来补齐剩余奇观。
     * 调用方可显式 buildAllWonders:false 恢复旧的「只建当前门槛奇观/首座奇观」策略。 */
    var rows = SB.WONDERS || [];
    var drill = SB.workshop.wonderById('wonder_skydrill');
    var drillIsCritical = shellNeedsDrill(s, goal);
    /* 钻机是 25% 壳层停点后的必经路径；即使缺脚手架/共振钻头，也必须先把它
     * 选作筹料目标。若仍用 wonderBlocked 过滤，缺料时目标会变回 null，形成死锁。 */
    if (drillIsCritical && drill && wonderEligible(s, drill)) return drill.id;
    if (!options || options.buildAllWonders !== false) {
      /* 可选奇观只有本轮已经买得起时才进入建造/岗位计划。旧逻辑即使奇观还差
       * 数千份原料，也把整座奇观的成本塞进 needs；于是矿工/采集岗位被远期目标
       * 抢满，学者和当前可建建筑反而停摆。指定为科技硬门槛的奇观仍在上面保留
       * 未满足时的筹料行为；市政奇观门槛也在这里优先挑一座当前可负担的奇观。 */
      for (var j = 0; j < rows.length; j++)
        if (rows[j].id !== 'wonder_skydrill' && wonderEligible(s, rows[j]) &&
            SB.workshop.wonderBlocked(s, rows[j].id) === null) return rows[j].id;
      var pendingBeforeDrill = rows.some(function (w) {
        return w.id !== 'wonder_skydrill' && wonderEligible(s, w) && !isOwned(s, w.id);
      });
      if ((!pendingBeforeDrill || drillIsCritical) && drill && wonderEligible(s, drill) &&
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
  function conditionSupportUpgrade(s, goal) {
    /* 《热液泵小型化》要求热液能总产出 50/s。仅靠汽轮机的基础 +1/s，
     *   AI 会继续堆指数造价的汽轮机；若《高压气泵》已解锁却不自动购买，
     *   这条门槛会被错误地当成纯建筑数量问题，长期卡在低供给。先应用
     *   已解锁的 +50% 汽轮机产出升级，再按真实 rates() 补足剩余产能。
     */
    var cond = goal && goal.cond;
    if (!cond || cond.t !== 'rate' || cond.r !== 'hydroSupply' ||
        SB.tech.condMet(s, cond)) return null;
    var upgrade = SB.workshop.upgradeById('upg_hppump');
    if (!upgrade || (s.upgrades && s.upgrades[upgrade.id]) ||
        (upgrade.need && !(s.techs && s.techs[upgrade.need]))) return null;
    return upgrade.id;
  }
  function drillStockTarget(s) {
    if (!s || !s.techs || !s.techs.shellgeo || s.broken) return 0;
    var shellRate = SB.CFG.SKYDRILL_RATE * (1 + 0.05 * ((s.perk && s.perk.shellSurvey) || 0));
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
  function dysonLaunchTarget(s, goal) {
    if (!s || s.dysonDone || !SB.economy || !SB.economy.launchLvl || !SB.economy.launchBids) return null;
    var cond = goal && goal.cond;
    var needsFirstPad = !!(cond && cond.t === 'sunSails');
    if (!needsFirstPad || SB.economy.launchLvl(s) > 0) return null;
    var ids = SB.economy.launchBids();
    for (var i = 0; i < ids.length; i++) if (availableBuilding(s, ids[i])) return ids[i];
    return null;
  }
  function dysonProductionPlan(s, options) {
    if (!s || s.dysonDone || !s.shellOpened || !(s.techs && s.techs.microwave_heat) ||
        !SB.economy || !SB.economy.launchRunLvl || !SB.economy.launchMaterialPer) return null;
    var active = SB.economy.launchRunLvl(s);
    if (active <= 0) return null; // 尊重玩家手动停用的发射场
    var per = SB.economy.launchMaterialPer(s), targets = {};
    var bufferSeconds = Number(options && options.dysonBufferSeconds);
    if (!isFinite(bufferSeconds) || bufferSeconds <= 0) bufferSeconds = 90;
    bufferSeconds = Math.max(1, Math.min(180, bufferSeconds));
    ['uranium', 'strongProp', 'thinafilm', 'tiplate'].forEach(function (resource) {
      var flow = Math.max(0, Number(per && per[resource]) || 0) * active;
      if (flow > 0) targets[resource] = (Number(s.res && s.res[resource]) || 0) + flow * bufferSeconds;
    });
    var rates = SB.economy.rates(s);
    var thetaPerStrongProp = craftInputPerOutput(s, 'strongProp', 'thetaMetal');
    var fuelPerStrongProp = craftInputPerOutput(s, 'strongProp', 'rocketFuel');
    var warmstonePerRocketFuel = craftInputPerOutput(s, 'rocketFuel', 'warmstone');
    var thetaPerFilm = craftInputPerOutput(s, 'thinafilm', 'thetaMetal');
    var thetaRateRequired = active * ((Number(per.strongProp) || 0) * thetaPerStrongProp +
      (Number(per.thinafilm) || 0) * thetaPerFilm);
    var warmstoneRateRequired = active * (Number(per.strongProp) || 0) *
      fuelPerStrongProp * warmstonePerRocketFuel;
    var turbineBurn = SB.economy.warmDraw
      ? SB.economy.warmDraw(s, 'hydroturbine') : 0;
    var tiplateRateRequired = active * (Number(per.tiplate) || 0);
    var tiplateProbe = Object.assign({}, s);
    tiplateProbe.lvl = Object.assign({}, s.lvl || {});
    tiplateProbe.launchStops = Object.assign({}, s.launchStops || {});
    (SB.economy.launchBids ? SB.economy.launchBids() : []).forEach(function (id) {
      tiplateProbe.launchStops[id] = Number(tiplateProbe.lvl[id]) || 0;
    });
    var tiplateRateAvailable = Math.max(0, Number(SB.economy.rates(tiplateProbe).tiplate) || 0);
    return { mode: SB.economy.launchNodeMode && SB.economy.launchNodeMode(s) ? 'node' : 'sail',
      activeLevels: active, bufferSeconds: bufferSeconds, targets: targets,
      thetaRateRequired: thetaRateRequired, thetaRateAvailable: Math.max(0, Number(rates.thetaMetal) || 0),
      warmstoneRateRequired: warmstoneRateRequired,
      warmstoneRateAvailable: Math.max(0, Number(rates.warmstone) || 0),
      warmstoneFixedBurn: turbineBurn,
      tiplateRateRequired: tiplateRateRequired, tiplateRateAvailable: tiplateRateAvailable };
  }
  function chooseBuild(s, goal, options, civicGoal, dysonPlan) {
    var cond = goal.cond, targetCap = houseCapacityTarget(s, goal, options), id, rows, i;
    /* 议事厅/城堡是本局核心建筑，未建时必须先于工坊和普通扩建落地；
     * 建成后再由 priorityBuildingUpgrade() 把城堡升级推到减费软上限。 */
    if (availableBuilding(s, 'hall') && !s.lvl.hall) return 'hall';
    /* 工坊是后续制作的系统入口；议事厅已建后优先补工坊，避免工艺链缺位。 */
    if (availableBuilding(s, 'workshop') && !s.lvl.workshop) return 'workshop';
    /* 《绝热材料》的尤里卡就是太阳帆数量。不能等通用「新建筑」回退队列碰巧轮到
     * 发射场；先建第一座欧罗巴/已解锁发射场，策略才能合法地产帆并开启戴森科技。 */
    var firstDysonPad = dysonLaunchTarget(s, goal);
    if (firstDysonPad) return firstDysonPad;
    var priorityUpgrade = priorityBuildingUpgrade(s);
    if (priorityUpgrade) return priorityUpgrade;
    /* 节点模式的钛板消耗远高于太阳帆。缺钛板时先扩马尔斯工造中心，
     * 不要等 θ 产率完全追上最终值后才开始补这条独立产线。 */
    if (dysonPlan && dysonPlan.mode === 'node' &&
        dysonPlan.tiplateRateRequired > dysonPlan.tiplateRateAvailable + 1e-9 &&
        availableBuilding(s, 'mars_workshop')) {
      if (freeBuilding(s, 'mars_workshop')) return 'mars_workshop';
      var marsCost = SB.economy.costOf(s, 'mars_workshop');
      if ((s.res.thetaMetal || 0) < (marsCost.thetaMetal || 0)) {
        var thetaSupplyPlan = thetaProductionPlan(s, dysonPlan.thetaRateRequired);
        var thetaSupplier = thetaSourceBuilding(s, thetaSupplyPlan);
        if (thetaSupplier) return thetaSupplier;
        if (thetaSupplyPlan && availableBuilding(s, 'biomatlab') &&
            (s.lvl.biomatlab || 0) < thetaSupplyPlan.stagedTargetLabs) return 'biomatlab';
      }
      return 'mars_workshop';
    }
    /* 市政的 lvlSum 鼓舞同样是硬建造目标。此前只有科技 lvlSum 有建造分支，
     * 《星际政治》停在异星建筑 4/5 时会继续死磕 θ 产率，错过下一座瑞亚星矿井：
     * 它既补齐市政门槛，也直接增加石梁、硬化珊瑚和铀，正好缓解扩仓→热泉炉扩产链。
     * 目标只差几级时优先当前可建项；星际政治特意先选瑞亚矿井，因为它提供这条
     * 生产链需要的结构材料，泰坦气云站则只补热液能和燃料。 */
    var civicBuildCond = civicGoal && civicGoal.boost;
    if (civicBuildCond && civicBuildCond.t === 'lvlSum' &&
        !SB.civic.boostMet(s, civicGoal)) {
      var civicBuildIds = (civicBuildCond.ids || []).filter(function (buildingId) {
        return availableBuilding(s, buildingId);
      });
      if (civicBuildIds.length) {
        var preferredCivicBuild = civicGoal.id === 'space_politics' &&
          civicBuildIds.indexOf('rheamine') >= 0 ? 'rheamine' : null;
        if (preferredCivicBuild) return preferredCivicBuild;
        var civicBuildRows = civicBuildIds.map(function (buildingId) {
          var cost = SB.economy.costOf(s, buildingId), score = 0;
          for (var resource in cost) {
            var cap = SB.economy.capOf(s, resource);
            var scale = isFinite(cap) && cap > 0 ? cap : Math.max(1000, cost[resource]);
            score += cost[resource] / scale + Math.max(0,
              cost[resource] - (s.res[resource] || 0)) / scale;
          }
          return { id: buildingId, score: score };
        }).sort(function (a, b) { return a.score - b.score; });
        var affordableCivicBuild = civicBuildRows.filter(function (row) {
          return freeBuilding(s, row.id);
        });
        return (affordableCivicBuild[0] || civicBuildRows[0]).id;
      }
    }
    /* 与科技 built 尤里卡同构，市政建造鼓舞也必须映射到正式建筑 API。
     * 否则市政面板已经明确显示“神庙 19/30”，chooseBuild 仍只围着 θ 原料扩产，
     * 市政永远不会完成，也会挡住后续更强的生产政策。 */
    if (civicBuildCond && civicBuildCond.t === 'built' && civicBuildCond.b &&
        (s.lvl[civicBuildCond.b] || 0) < civicBuildCond.n) {
      var civicRequiredBuilding = SB.habitat.buildingById(civicBuildCond.b);
      if (civicRequiredBuilding && SB.habitat.unlocked(s, civicRequiredBuilding) &&
          SB.habitat.needMet(s, civicRequiredBuilding)) return civicBuildCond.b;
    }
    /* θ 金属是建筑原料，不能只在“θ产率”科技目标下才扩产。
     * 例如《强人工智能》要求机器人充能站 10 级，后两级的 θ 成本已远超当前产线；
     * 旧分支只看 built 尤里卡，虽会显示机器人充能站目标，却没有给 θ 的上游扩产/配工。
     * 对任何当前硬目标的 θ 缺口都按实际限产原料扩产：藻食优先升导流堤，随后会自然
     * 转到热泉炉、砂矿坑或瑞亚星矿井补新的瓶颈；不再盲目只堆研究所等级。 */
    var thetaConditionNeed = thetaConditionTarget(s, cond) > (s.res.thetaMetal || 0) + 1e-9;
    var thetaRateNeed = cond && cond.t === 'rate' && cond.r === 'thetaMetal' &&
      (SB.economy.rates(s).thetaMetal || 0) + 1e-9 < cond.n;
    if (thetaConditionNeed || thetaRateNeed) {
      var thetaPlan = thetaProductionPlan(s, thetaRateNeed ? cond.n : 0);
      var thetaSource = thetaSourceBuilding(s, thetaPlan);
      if (thetaPlan && thetaPlan.supportedLabs < thetaPlan.targetLabs && thetaSource) return thetaSource;
      if (availableBuilding(s, 'biomatlab')) return 'biomatlab';
    }
    /* 科技和市政可以同时有未满足的硬门槛。此前先处理科技尤里卡（例如热液能产率），
     * 会让后面的市政区分支一直拿不到建造机会：面板显示市政目标 2/30，实际却每轮
     * 继续筹建汽轮机，市政区等级完全不涨。市政区鼓舞未完成时优先建一座当前可建的
     * 目标区域建筑；不可建时仍继续科技目标/材料规划，不绕过任何建筑解锁条件。 */
    var civicCond = civicGoal && civicGoal.boost;
    if (civicCond && civicCond.t === 'zoneLvl' && civicCond.zone === 'civic' && !SB.civic.boostMet(s, civicGoal)) {
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
    }    /* 《工业化》的尤里卡检查热液能总供给，不是扣除工坊消耗后的净流量。
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
    /* ERA9「大型异星工程」的尤里卡是若干异星建筑等级总和；此前只有市政 total
     * 条件有建造分支，科技 lvlSum 会被识别却不主动建目标矿井，Mars 工造中心也就
     * 永远解锁不了。按正式建筑 API 逐步补目标列表中当前可建的等级。 */
    if (cond && cond.t === 'lvlSum' && !SB.tech.condMet(s, cond)) {
      var levelSumCandidates = (cond.ids || []).filter(function (buildingId) {
        return availableBuilding(s, buildingId);
      }).map(function (buildingId) {
        var cost = SB.economy.costOf(s, buildingId), score = 0;
        for (var resource in cost) {
          var cap = SB.economy.capOf(s, resource);
          var scale = isFinite(cap) && cap > 0 ? cap : Math.max(1000, cost[resource]);
          score += cost[resource] / scale + Math.max(0, cost[resource] - (s.res[resource] || 0)) / scale;
        }
        return { id: buildingId, score: score };
      }).sort(function (a, b) { return a.score - b.score; });
      var affordableLevelSum = levelSumCandidates.filter(function (row) { return freeBuilding(s, row.id); });
      if (affordableLevelSum.length) return affordableLevelSum[0].id;
      if (levelSumCandidates.length) return levelSumCandidates[0].id;
    }
    if (cond && cond.t === 'upgrade') {
      var requiredUpgrade = SB.workshop.upgradeById(cond.id);
      if (requiredUpgrade && requiredUpgrade.upgradesBuilding && !s.lvl[requiredUpgrade.upgradesBuilding] &&
          availableBuilding(s, requiredUpgrade.upgradesBuilding)) return requiredUpgrade.upgradesBuilding;
    }
    /* 戴森发射场是持续耗料设施。连续需求必须反推 θ 产线，且节点模式钛金板件
     * 必须由马尔斯工造中心补产；只等库存降到短阈值会让发射场反复断料空转。 */
    if (dysonPlan) {
      if (dysonPlan.thetaRateRequired > dysonPlan.thetaRateAvailable + 1e-9) {
        var dysonThetaPlan = thetaProductionPlan(s, dysonPlan.thetaRateRequired);
        var dysonThetaSource = thetaSourceBuilding(s, dysonThetaPlan);
        if (dysonThetaPlan && dysonThetaPlan.supportedLabs < dysonThetaPlan.targetLabs && dysonThetaSource)
          return dysonThetaSource;
        if (dysonThetaPlan && availableBuilding(s, 'biomatlab') &&
            (s.lvl.biomatlab || 0) < dysonThetaPlan.stagedTargetLabs) return 'biomatlab';
      }
    }
    /* 高阶升级/奇观会消耗大量钢制零件。按当前目标扩充汽轮机与热液工坊配套，
     * 避免只靠单台产线慢慢攒；10 级上限也与「工业化」的 10/s 尤里卡目标同源。 */
    var partTarget = goalCost(s, goal).steelPart || 0;
    /* 选建普通奇观时也要筹热液产线：仅看当前科技尤里卡会漏掉可选奇观的钢制零件成本，
     * 结果 bot 有目标、也在派矿工，却没有汽轮机/工坊把钢转出来。 */
    var plannedWonderId = shouldPrioritizeConditionBuild(s, goal, null, civicGoal)
      ? null : chooseWonder(s, goal, options, civicGoal);
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
    /* 首巢已可负担时先扩出最低住房，避免低人口/受挑战减产时被藻场扩张
     * 独占建造队列：口粮库存上不去、人口不增长，下一座藻场也始终造不起。 */
    if (availableBuilding(s, 'nest') && !(s.lvl.nest || 0) &&
        SB.economy.popCap(s) < targetCap && freeBuilding(s, 'nest')) return 'nest';
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
  function shouldPrioritizeConditionBuild(s, goal, buildId, civicGoal) {
    var cond = goal && goal.cond;
    /* 壳层科技的 shell:1 尤里卡必须靠已研究的天穹钻机奇观继续削壳；
     * 它虽不是 wonders 条件，仍是这条硬门槛的必需建造，不能被通用过滤器当作可选项丢弃。 */
    if (shellNeedsDrill(s, goal)) return false;
    if (geekGateNeedsWonder(s, goal)) return false;
    /* 当前市政要求的奇观也是硬目标；即使科技正在追产率，也要并行筹这座奇观的材料，
     * 例如总物流站/全国快速物流通道能提高工艺与精铁产出，帮助打通 θ 产线。 */
    if (civicNeedsWonder(s, civicGoal)) return false;
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
    /* 满仓转制不能吞掉当前硬目标预留的原料。例：汽轮机还差 44,820 石头、
     * 石头仓上限 45,336 时，旧逻辑因石头压力超过 90% 转制 113 批石梁，
     * 一次吃掉约 11,300 石头，刚要造出的汽轮机又被自己转制卡住。只允许
     * 使用超过 plannedCost 的部分，并沿用正式配方成本倍率计算可转整数批次。 */
    var costMul = SB.workshop.craftCostMul ? SB.workshop.craftCostMul(s, best) : 1;
    for (var input in best.in || {}) {
      var reserve = Math.max(0, Number(plannedCost && plannedCost[input]) || 0);
      var inputPerBatch = (Number(best.in[input]) || 0) * costMul;
      if (reserve > 0 && inputPerBatch > 0) {
        var surplus = Math.max(0, (Number(s.res[input]) || 0) - reserve);
        batches = Math.min(batches, Math.floor((surplus + 1e-9) / inputPerBatch));
      }
    }
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
    if (resource === 'uranium') return 'miner';
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
      /* 星屑是正式轮回结算才入账的跨周目资源；戴森球完成前禁止轮回时，
       * 未达标的星屑鼓舞在本局无法取得。跳过这类只影响可选市政的死门槛，
       * 让队列继续规划可解锁深空科技的《太空竞赛》等后续市政。 */
      if (c.boost && c.boost.t === 'gathered' && c.boost.r === 'stardust' &&
          !SB.civic.boostMet(s, c)) continue;
      /* 当前目标是留在本周目建成戴森球。轮回次数门槛此时无法推进，不能让
       * 《神们自己》一类支线挡住其它可完成的市政及其生产政策；戴森竣工前只把
       * 这类市政延后，不结算轮回、不改周目。 */
      if (c.boost && c.boost.t === 'cycle' && !s.dysonDone) continue;
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
    function manualGatherTo(resource, target, maxClicks) {
      var click = Number(SB.GATHER && SB.GATHER[resource]) || 0;
      if (!(click > 0) || !SB.economy || !SB.economy.addRes) return 0;
      var count = 0;
      while ((Number(s.res && s.res[resource]) || 0) + 1e-9 < target && count < maxClicks) {
        var before = Number(s.res && s.res[resource]) || 0;
        SB.economy.addRes(s, resource, click);
        var after = Number(s.res && s.res[resource]) || 0;
        if (after <= before + 1e-9) break;
        changed = true; actions++; count++;
      }
      return count;
    }
    /* 保温法是玩家开的生存策略开关，不会因为暖石充足自动启用。
     * 热能科技已解锁且当前挑战允许时，AI 像玩家一样常开：只在减产季烧 1/s，
     * 可同时顶回口粮减产并免除冰封冻伤；暖石不足时游戏自己的门控会暂停燃烧。 */
    if (s.techs && s.techs.thermal && !s.warmOn &&
        !(SB.challenges && SB.challenges.warmHeatingBlocked(s))) {
      s.warmOn = true; changed = true; actions++;
    }
    var goal = researchGoal(s), cond = goal.cond;
    var dysonPlan = dysonProductionPlan(s, options);
    var thetaRateNeed = !!(cond && cond.t === 'rate' && cond.r === 'thetaMetal' &&
      (SB.economy.rates(s).thetaMetal || 0) + 1e-9 < cond.n);
    var thetaStockNeed = thetaConditionTarget(s, cond) > (s.res.thetaMetal || 0) + 1e-9;
    var dysonThetaNeed = !!(dysonPlan &&
      dysonPlan.thetaRateRequired > dysonPlan.thetaRateAvailable + 1e-9);
    var thetaProductionPriority = thetaRateNeed || thetaStockNeed || dysonThetaNeed;
    var thetaPriorityRate = Math.max(thetaRateNeed ? Number(cond.n) || 0 : 0,
      dysonPlan ? Number(dysonPlan.thetaRateRequired) || 0 : 0);
    /* 神学完成后，建立宗教是玩家需在信仰页输入名称的正式动作；不自动命名会让
     * 《归正会》的 religion 鼓舞与轮回系统长期停在空名门槛。用同一局状态字段和
     * 游戏回调模拟一次正常命名，名称可在 UI 中随时修改且不消耗资源。 */
    if (s.civics && s.civics.theology && !(s.religionName || '').trim()) {
      s.religionName = '渊海信仰';
      if (SB.game.maybeReligionPopup) SB.game.maybeReligionPopup(s);
      changed = true; actions++;
    }
    var thetaPlan = (Number(s.lvl && s.lvl.biomatlab) || 0) > 0
      ? thetaProductionPlan(s, thetaPriorityRate) : null;
    var titaniumPlan = titaniumMiningPlan(s, thetaPlan);
    var thetaIronPlan = thetaIronMiningPlan(s, thetaPlan);
    var dysonWarmstoneTargetMiners = dysonPlan
      ? minersForWarmstone(s, dysonPlan.warmstoneRateRequired + dysonPlan.warmstoneFixedBurn) : 0;
    var dysonMinerTarget = Math.max(
      Number(titaniumPlan && titaniumPlan.targetMiners) || 0,
      Number(thetaIronPlan && thetaIronPlan.targetMiners) || 0,
      Number(dysonWarmstoneTargetMiners) || 0);
    var titaniumToolTargets = titaniumMiningTools(s, titaniumPlan);
    if (thetaPlan && thetaPlan.levels > 0) {
      /* 只让原料/热液能能持续供养的研究所开工；停下的等级保留在库里，
       * 原料产能扩上来后会自动恢复。此前 20 座研究所同时运行，48 精铁/秒的
       * 需求压过热泉炉约 7.45/秒的供给，精铁归零，θ速率也随之归零。 */
      var thetaActiveTarget = Math.min(thetaPlan.levels, thetaPlan.supportedLabs, thetaPlan.targetLabs);
      var thetaStopTarget = thetaPlan.levels - thetaActiveTarget;
      if ((Number(s.biomatlabStop) || 0) !== thetaStopTarget) {
        s.biomatlabStop = thetaStopTarget;
        changed = true; actions++;
      }
    }
    /* 开局手动采集：等价于点游戏内采集按钮，不注入免费资源。 */
    if (!(s.lvl.nest || 0)) {
      var nestCost = SB.economy.costOf(s, 'nest').coral || 0;
      manualGatherTo('coral', nestCost, 5);
    }
    /* 深渊的全产出惩罚会让首座藻场 + 唯一采集者无法形成藻食盈余。
     * 旧逻辑只在 kelp=0 时手动采到首座藻场成本；建成后若存量又被口粮吃空，
     * 下一座藻场永远造不起，人口也无法增长来提供第二个采集岗位。按正常采集动作
     * 补到当前藻场下一级成本，最多 25 次，不绕过成本/库存上限。 */
    if (s.challenge && s.challenge.id === 'abyss' && (s.lvl.kelp || 0) < 5) {
      var kelpCost = SB.economy.costOf(s, 'kelp').kelp || 0;
      manualGatherTo('kelp', kelpCost, 25);
    }
    /* 有限资源库存尤里卡若没有已分配的生产岗位，按玩家的采集按钮补资源，
     * 避免 1 人开局时被 foodNeed 占满岗位后永远停在“库存 N / N”门槛。 */
    if (cond && cond.t === 'res' && cond.r && Number(cond.n) > (Number(s.res && s.res[cond.r]) || 0))
      manualGatherTo(cond.r, Number(cond.n), 5);
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
    var thetaKelpPlan = thetaProductionPriority
      ? thetaKelpGatherPlan(s, thetaPlan, foodNeed,
        dysonMinerTarget) : null;
    if (thetaKelpPlan) foodNeed = Math.max(foodNeed, thetaKelpPlan.target);
    if (dysonPlan && dysonMinerTarget > 0) {
      /* 原料岗位需要的人数随当前可持续 θ 台阶增长；为生产链留出有限住房余量，
       * 否则 220/220 满人口时即使算出更多矿工目标也没有可用工人。 */
      var dysonPopulationTarget = Math.min(800, Math.ceil(dysonMinerTarget +
        Math.max(foodNeed, Number(thetaKelpPlan && thetaKelpPlan.target) || 0) + 30));
      if (dysonPopulationTarget > SB.economy.popCap(s))
        options = Object.assign({}, options, { targetPopulation: Math.max(
          Number(options.targetPopulation) || 0, dysonPopulationTarget) });
    }
    /* θ 的产出尤里卡需要持续扩展岗位，而满住房会让 AI 永远没有新工人。
     * 先把人口目标抬到一个有限的 180 人运营里程碑，给采集者/矿工留下编制；
     * 到达后停止追人口，避免无止境扩房。挑战人口硬上限仍由 houseCapacityTarget 钳制。 */
    if (thetaProductionPriority && s.pop >= SB.economy.popCap(s) - 1) {
      options = Object.assign({}, options, {
        targetPopulation: Math.max(Number(options.targetPopulation) || 0, Math.min(180, Math.max(s.pop, 180)))
      });
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
    var hydroRateMinerTarget = 0;
    if (cond && cond.t === 'rate' && cond.r === 'hydroSupply' &&
        (SB.economy.rates(s).hydroSupply || 0) + 1e-9 < cond.n) {
      var requiredTurbines = hydroTurbineTarget(s, cond.n).required;
      hydroRateMinerTarget = minersForWarmstone(s,
        requiredTurbines * (SB.UNIT.hydroWarm || 5) *
        (SB.economy.warmEff ? SB.economy.warmEff(s) : 1) * 1.15);
      if (hydroSupportCap(s) < requiredTurbines) weights.miner = Math.max(weights.miner || 0, 0.85);
    }
    if (cond && cond.t === 'job') weights[cond.j] = 0.72;
    var nextBuild = chooseBuild(s, goal, options, civicGoal, dysonPlan);
    var nextWonder = chooseWonder(s, goal, options, civicGoal);
    var preferredUpgradeId = priorityBuildingUpgrade(s);
    if (preferredUpgradeId && nextBuild === preferredUpgradeId) nextWonder = null;
    /* 未满足的硬性科技条件优先于可选奇观：否则奇观队列会抢走建造动作，
     * bot 明明识别出要补汽轮机，却一直停在同一尤里卡门槛。 */
    if (shouldPrioritizeConditionBuild(s, goal, nextBuild, civicGoal)) nextWonder = null;
    var supportUpgradeId = wonderPrereqUpgrade(s, goal) ||
      titaniumMiningUpgrade(s, titaniumPlan, titaniumToolTargets) ||
      ironThetaSupportUpgrade(s, thetaPlan) || conditionSupportUpgrade(s, goal);
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
    var blockedBuildCost = nextBuild && SB.economy.costOf(s, nextBuild);
    var buildCapacityBlocked = !!(nextBuild && costExceedsCapacity(s, blockedBuildCost));
    var capacityResource = buildCapacityBlocked ? capacityBlockedResource(s, blockedBuildCost) : null;
    var capacityFallbackFor = buildCapacityBlocked ? nextBuild : null;
    var capacityFallbackCost = capacityFallbackFor ? SB.economy.costOf(s, capacityFallbackFor) : null;
    var castleUpgradePriority = !!((s.lvl.workshop || 0) > 0 && s.techs && s.techs.castle &&
      !(s.upgrades && s.upgrades.upg_castle));
    var capacityUpgrade = castleUpgradePriority || ((housingCapacityBlocked || buildCapacityBlocked) &&
      s.techs && s.techs.castle && !(s.upgrades && s.upgrades.upg_castle));
    var storageCapacityUpgrade = !capacityUpgrade && (housingCapacityBlocked || buildCapacityBlocked)
      ? storageUpgrade(s, capacityResource) : null;
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
      var storageFallback = storageBuild(s, capacityResource);
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
    /* 钛不是只能靠空等矿工慢慢挖：矿工镐有职业加成，自动化钻探又能把运行矿坑的
     * 钛/铀产出翻倍。把已解锁的采矿工具和这项工坊升级纳入同一条原料预案，
     * 缺钛时自动准备它们，而不是继续只扩藻场。 */
    titaniumToolTargets.forEach(function (tool) {
      for (var ttk in tool.cost || {}) plannedCost[ttk] = (plannedCost[ttk] || 0) + tool.cost[ttk];
    });
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
    /* `gathered` 尤里卡统计累计产出，而不是当前库存。若条件资源有工坊配方，
     * 需要按累计缺口主动排产；只看库存/通用溢出制作会让《空间站》卡在
     *「累计火箭引擎 0/10」：配方已解锁，AI 却没有任何建设需求来触发它。 */
    var gatheredCraftTarget = null;
    var gatheredCraftStatus = null;
    var conditionCraftTarget = null;
    var gatheredCond = goal && goal.cond;
    if (gatheredCond && gatheredCond.t === 'gathered') {
      var gatheredResource = gatheredCond.r;
      var gatheredHave = Number(s.got && s.got[gatheredResource]) || 0;
      var gatheredShortage = Math.max(0, (Number(gatheredCond.n) || 0) - gatheredHave);
      var gatheredRecipe = gatheredShortage > 0 ? recipeByResource(gatheredResource) : null;
      if (gatheredRecipe && recipeUnlocked(s, gatheredRecipe)) {
        gatheredCraftTarget = { resource: gatheredResource,
          target: (Number(s.res && s.res[gatheredResource]) || 0) + gatheredShortage,
          condition: Number(gatheredCond.n) || 0, produced: gatheredHave };
        expandPrimaryNeeds(s, gatheredResource, gatheredCraftTarget.target, needs, []);
      } else if (gatheredShortage > 0) {
        var gatheredJob = resourceJob(gatheredResource, s);
        if (gatheredJob && gatheredJob !== 'gather')
          weights[gatheredJob] = Math.max(weights[gatheredJob] || 0, 0.92);
      }
    }
    if (dysonPlan) Object.keys(dysonPlan.targets).forEach(function (resource) {
      expandPrimaryNeeds(s, resource, dysonPlan.targets[resource], needs, []);
    });
    addCostNeeds(s, supportCost, needs);
    if (cond && cond.t === 'res') {
      var conditionShortage = Math.max(0, (Number(cond.n) || 0) - (Number(s.res && s.res[cond.r]) || 0));
      var conditionRecipe = conditionShortage > 0 ? recipeByResource(cond.r) : null;
      /* 库存型尤里卡若要求工艺品（例如《刻纹腐蚀术》要 1000 潮纹记录），
       * 不能只把成品名写进 needs：resourceJob 不认识工艺品，AI 就会永远不造。
       * 解锁配方时按目标库存递归排出原料岗位并正式制造；配方未解锁时仍保留
       * 原有库存缺口，诊断会在 craftDiagnostics 标出配方门槛。 */
      if (conditionRecipe && recipeUnlocked(s, conditionRecipe)) {
        conditionCraftTarget = { resource: cond.r, target: Number(cond.n) || 0,
          condition: Number(cond.n) || 0, recipe: conditionRecipe.id };
        expandPrimaryNeeds(s, cond.r, conditionCraftTarget.target, needs, []);
      } else {
        needs[cond.r] = Math.max(needs[cond.r] || 0, conditionShortage);
        if (conditionRecipe) conditionCraftTarget = { resource: cond.r,
          target: Number(cond.n) || 0, condition: Number(cond.n) || 0, recipe: conditionRecipe.id };
      }
    }
    /* 天穹钻机耗材按剩余壳厚计算：建造需要 20 个，运行需要 DRILL/s × 预计运行秒数。
     * 天穹钻机是奇观队列最后一座；其余奇观建完前不提前囤钻头，避免抢占钢制零件、绳等共用原料。 */
    var drillTarget = drillStockTarget(s);
    var allPreDrillWondersBuilt = (SB.WONDERS || []).every(function (w) {
      return w.id === 'wonder_skydrill' || !wonderEligible(s, w) || isOwned(s, w.id);
    });
    if (!allPreDrillWondersBuilt && !shellNeedsDrill(s, goal)) drillTarget = 0;
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
    /* 资源型尤里卡也是一笔当前硬目标，不能只调整权重。
     * autoAssign 只填闲置人口，不会把现有学者转成采石工；例如「石工」要求
     * 石头 100，人口 2 时一个采集者加一个学者会永久挤掉唯一采石岗位。 */
    var conditionResourceJob = null;
    if (cond && cond.t === 'res' && cond.r &&
        (Number(s.res && s.res[cond.r]) || 0) + 1e-9 < (Number(cond.n) || 0)) {
      var conditionJob = resourceJob(cond.r, s);
      if (conditionJob && conditionJob !== 'gather' && SB.folk.jobUnlocked(s, conditionJob)) {
        conditionResourceJob = conditionJob;
        requiredMaterialJobs[conditionJob] = true;
        weights[conditionJob] = Math.max(weights[conditionJob] || 0, 1.5);
      }
    }
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
    /* 扩仓建筑只给当前确实短缺的工艺链留岗位。此前不看库存就同时把采石工和珊瑚匠
     * 拉到高权重；当石梁已经够、只缺硬化珊瑚时，采石工仍占约 30 个岗位，挤掉矿工，
     * 让钛/金属供给一起掉下来。递归核算这座压舱仓的实际缺料，再只保留对应生产岗位。 */
    if (nextBuild === 'ballast') {
      var ballastNeeds = {};
      addCostNeeds(s, SB.economy.costOf(s, 'ballast'), ballastNeeds);
      if ((ballastNeeds.stone || 0) > 0.01)
        weights.quarrier = Math.max(weights.quarrier || 0, 0.90);
      if ((ballastNeeds.coral || 0) > 0.01)
        /* 高等级压舱仓依赖大量硬化珊瑚。把“有缺口”从轻微权重提高到奇观材料同档，
         * 让当前扩仓目标实际拿到珊瑚匠；异星矿井升级会并行增加硬化珊瑚直产。 */
        weights.coralwright = Math.max(weights.coralwright || 0, 4.0);
      if (Object.keys(ballastNeeds).some(function (resource) { return ballastNeeds[resource] > 0.01; }))
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
    var titaniumTargetMiners = 0;
    if (titaniumPlan && titaniumPlan.needed && SB.folk.jobUnlocked(s, 'miner')) {
      /* 保留最低的其他生产岗位，剩余人力按实际每名矿工的钛边际产率反推矿工目标。
       * 这样不用猜一个固定矿工比例；矿镐、自动化钻探或季节倍率变化后会自动重算。 */
      var minerReserve = Math.min(8, Math.max(0, availableWorkers - 1));
      var maxMiningWorkers = Math.max(0, availableWorkers - minerReserve);
      titaniumTargetMiners = Math.min(titaniumPlan.targetMiners,
        SB.folk.jobLimit ? SB.folk.jobLimit(s, 'miner') : maxMiningWorkers, maxMiningWorkers);
    }
    var productionMinerTarget = Math.min(Math.max(titaniumTargetMiners,
      Number(thetaIronPlan && thetaIronPlan.targetMiners) || 0,
      Number(dysonWarmstoneTargetMiners) || 0,
      Number(hydroRateMinerTarget) || 0),
      SB.folk.jobLimit ? SB.folk.jobLimit(s, 'miner') : availableWorkers);
    if (productionMinerTarget > (s.jobs.miner || 0)) {
      var otherMiningWeight = 0;
      for (var mi = 0; mi < allJobs.length; mi++) if (allJobs[mi] !== 'gather' && allJobs[mi] !== 'miner' &&
          SB.folk.jobUnlocked(s, allJobs[mi])) otherMiningWeight += weights[allJobs[mi]] || 0;
      if (otherMiningWeight > 0 && productionMinerTarget < availableWorkers) {
        var productionMinerWeight = productionMinerTarget * otherMiningWeight /
          (availableWorkers - productionMinerTarget);
        weights.miner = Math.max(weights.miner || 0, productionMinerWeight);
      }
    }
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
    /* 自动配工按比例取整，且口粮校准会再次重分配剩余岗位；在满人口时，
     * θ 的关键矿工/采集者目标会被珊瑚匠等比例岗位挤掉。按正式 assign API
     * 把目标岗位补齐，同时给当前建筑原料、科研和采石各留最低人手。 */
    if (thetaProductionPriority && thetaPlan &&
        (thetaPlan.supportedLabs < thetaPlan.targetLabs || productionMinerTarget > (s.jobs.miner || 0))) {
      /* autoAssign 和口粮安全校准会改变 jobs.gather/miner。前面的 thetaKelpPlan 是按
       * 重分配前的岗位算的；在满人口时这可能只把采集者提升到旧目标，尽管实际供给仍
       * 远不足以供养目标研究所。用重分配后的真实 rates 再算一次缺口。 */
      var assignedThetaPlan = thetaProductionPlan(s, thetaPriorityRate);
      var assignedTitaniumPlan = titaniumMiningPlan(s, assignedThetaPlan);
      var assignedKelpPlan = thetaKelpGatherPlan(s, assignedThetaPlan, foodNeed,
        assignedTitaniumPlan && assignedTitaniumPlan.needed ? assignedTitaniumPlan.targetMiners : 0);
      if (assignedKelpPlan) thetaKelpPlan = assignedKelpPlan;
      var floors = {
        coralwright: needs.coral > 0 ? 12 : 2,
        quarrier: (needs.stone > 0 || needs.stoneBeam > 0) ? 2 : 1,
        scholar: 8,
        scribe: civicCost && (s.res.culture || 0) < civicCost ? 2 : 1,
        merchant: civicBoost && civicBoost.t === 'job' && civicBoost.j === 'merchant' ? 1 : 0
      };
      var productionJobTargets = {};
      /* 当前阻塞点是高等级压舱仓的梁材/硬珊瑚成本。矿工优先补暖石后，
       * autoAssign 会把采石工挤到 2 人，仓储材料就永远凑不齐；为这笔正在
       * 建造的扩仓成本明确保留两条原料岗位，后续自动配工不能再把它们抽空。 */
      if (nextBuild === 'ballast') {
        var activeBallastNeeds = {};
        addCostNeeds(s, SB.economy.costOf(s, 'ballast'), activeBallastNeeds);
        var workerPoolForBallast = Math.max(1, s.pop - foodNeed);
        if ((activeBallastNeeds.stone || 0) > 0.01 || (activeBallastNeeds.stoneBeam || 0) > 0.01)
          productionJobTargets.quarrier = Math.max(4, Math.ceil(workerPoolForBallast * 0.15));
        if ((activeBallastNeeds.coral || 0) > 0.01 || (activeBallastNeeds.hardCoral || 0) > 0.01)
          productionJobTargets.coralwright = Math.max(12, Math.ceil(workerPoolForBallast * 0.20));
        Object.keys(productionJobTargets).forEach(function (job) {
          floors[job] = Math.max(Number(floors[job]) || 0, productionJobTargets[job]);
        });
      }
      Object.keys(floors).forEach(function (job) {
        floors[job] = Math.min(Number(s.jobs[job]) || 0, floors[job]);
      });
      Object.keys(productionJobTargets).forEach(function (job) {
        floors[job] = Math.max(Number(floors[job]) || 0, productionJobTargets[job]);
      });
      var reserveWorkers = Object.keys(floors).reduce(function (sum, job) { return sum + floors[job]; }, 0);
      var assignedIronPlan = thetaIronMiningPlan(s, assignedThetaPlan);
      var currentTitaniumTarget = assignedTitaniumPlan && assignedTitaniumPlan.needed
        ? assignedTitaniumPlan.targetMiners : titaniumTargetMiners;
      var currentMinerTarget = Math.max(currentTitaniumTarget,
        Number(assignedIronPlan && assignedIronPlan.targetMiners) || 0,
        Number(dysonWarmstoneTargetMiners) || 0);
      var minerGoal = Math.min(currentMinerTarget, Math.max(0, s.pop - reserveWorkers));
      var gatherCapacity = Math.max(0, s.pop - reserveWorkers - minerGoal);
      var gatherGoal = Math.min(thetaKelpPlan ? thetaKelpPlan.target : (s.jobs.gather || 0), gatherCapacity);
      var donors = ['merchant', 'scribe', 'quarrier', 'coralwright', 'scholar'];
      function topUpJob(job, target) {
        var guard = 0;
        while ((Number(s.jobs[job]) || 0) < target && guard++ < s.pop) {
          var moved = false;
          for (var di = 0; di < donors.length; di++) {
            var donor = donors[di];
            if (donor === job || (Number(s.jobs[donor]) || 0) <= (floors[donor] || 0)) continue;
            if (SB.folk.assign(s, donor, -1) && SB.folk.assign(s, job, 1)) {
              changed = true; actions++; moved = true; break;
            }
          }
          if (!moved) break;
        }
      }
      topUpJob('miner', minerGoal);
      topUpJob('gather', gatherGoal);
      Object.keys(productionJobTargets).forEach(function (job) {
        topUpJob(job, productionJobTargets[job]);
      });
      /* 岗位调整后重新核算供给，并立即启用新增原料能支撑的研究所。 */
      var finalThetaPlan = thetaProductionPlan(s, thetaPriorityRate);
      if (finalThetaPlan) {
        var finalActiveLabs = Math.min(finalThetaPlan.levels, finalThetaPlan.supportedLabs,
          finalThetaPlan.targetLabs);
        var finalThetaStop = finalThetaPlan.levels - finalActiveLabs;
        if ((Number(s.biomatlabStop) || 0) !== finalThetaStop) {
          s.biomatlabStop = finalThetaStop;
          changed = true; actions++;
          finalThetaPlan = thetaProductionPlan(s, thetaPriorityRate);
        }
        thetaPlan = finalThetaPlan;
        var finalTitaniumPlan = titaniumMiningPlan(s, thetaPlan);
        thetaKelpPlan = thetaKelpGatherPlan(s, thetaPlan, foodNeed,
          finalTitaniumPlan && finalTitaniumPlan.needed ? finalTitaniumPlan.targetMiners : 0);
      }
    }
    /* 为当前硬门槛/建造原料保底调配已经在岗的人。
     * 比例配工在低人口时会把唯一空闲职业四舍五入给学者，而且不会重排旧岗位；
     * 因此缺石、缺珊瑚时，策略目标虽正确，生产职业仍可能连续数小时为 0。保留
     * 口粮岗位，先满足尤里卡资源，再依次满足当前建造和区域建造原料岗位。 */
    if (!thetaProductionPriority) {
      var priorityMaterialJobs = [];
      function addPriorityJob(job) {
        if (job && job !== 'gather' && priorityMaterialJobs.indexOf(job) < 0 &&
            SB.folk.jobUnlocked(s, job)) priorityMaterialJobs.push(job);
      }
      addPriorityJob(conditionResourceJob);
      Object.keys(requiredMaterialJobs).forEach(addPriorityJob);
      Object.keys(requiredZoneJobs).forEach(addPriorityJob);
      var specialistSlots = Math.max(0, s.pop - Math.max(foodNeed, Number(s.jobs.gather) || 0));
      var priorityTargets = priorityMaterialJobs.slice(0, specialistSlots);
      var priorityDonors = ['merchant', 'scribe', 'scholar', 'coralwright', 'quarrier', 'miner'];
      for (var pj = 0; pj < priorityTargets.length; pj++) {
        var targetJob = priorityTargets[pj];
        if ((Number(s.jobs[targetJob]) || 0) > 0) continue;
        var targetLimit = SB.folk.jobLimit ? SB.folk.jobLimit(s, targetJob) : Infinity;
        if ((Number(s.jobs[targetJob]) || 0) >= targetLimit) continue;
        for (var pd = 0; pd < priorityDonors.length; pd++) {
          var donorJob = priorityDonors[pd];
          if (donorJob === targetJob || (Number(s.jobs[donorJob]) || 0) <= 0) continue;
          /* 有明确欠款的科研/市政产出时，尽量不拆唯一对应岗位；硬资源尤里卡仍优先。 */
          if (donorJob === 'scribe' && civicCost && (Number(s.res.culture) || 0) < civicCost &&
              (Number(s.jobs.scribe) || 0) <= 1) continue;
          if (donorJob === 'scholar' && neededScienceCost && (Number(s.res.science) || 0) < neededScienceCost &&
              (Number(s.jobs.scholar) || 0) <= 1) continue;
          if (SB.folk.assign(s, donorJob, -1)) {
            if (SB.folk.assign(s, targetJob, 1)) {
              changed = true; actions++;
            } else {
              SB.folk.assign(s, donorJob, 1);
            }
            break;
          }
        }
      }
      /* 热液能尤里卡看的是瞬时总供给。仅提高矿工权重会被当前采石/学术岗位挤掉，
       * 尤其在满人口时矿工可能从几十人跌到个位数，汽轮机随之停机，科技目标数小时不动。
       * 按目标汽轮机数和实际暖石消耗反推矿工人数，再通过正式岗位 API 从非口粮岗位
       * 调人；给正在筹备的汽轮机保留至少一名采石工/珊瑚匠，并保留科研、市政最低岗位。 */
      if (cond && cond.t === 'rate' && cond.r === 'hydroSupply' &&
          (SB.economy.rates(s).hydroSupply || 0) + 1e-9 < cond.n &&
          SB.folk.jobUnlocked(s, 'miner')) {
        var hydroGoal = hydroTurbineTarget(s, cond.n);
        var hydroWarmPerTurbine = (SB.UNIT.hydroWarm || 5) *
          (SB.economy.warmEff ? SB.economy.warmEff(s) : 1);
        var hydroMinerTarget = minersForWarmstone(s,
          hydroGoal.required * hydroWarmPerTurbine * 1.15);
        var hydroBuildCost = nextBuild === 'hydroturbine'
          ? SB.economy.costOf(s, 'hydroturbine') : null;
        var hydroNeedsStone = !!(hydroBuildCost &&
          (Number(s.res.stone) || 0) + 1e-9 < (Number(hydroBuildCost.stone) || 0));
        var hydroNeedsCoral = !!(hydroBuildCost &&
          (Number(s.res.hardCoral) || 0) + 1e-9 < (Number(hydroBuildCost.hardCoral) || 0));
        var hydroFloors = {
          merchant: civicBoost && civicBoost.t === 'job' && civicBoost.j === 'merchant' ? 1 : 0,
          scribe: civicCost && (Number(s.res.culture) || 0) < civicCost ? 1 : 0,
          scholar: neededScienceCost && (Number(s.res.science) || 0) < neededScienceCost ? 1 : 0,
          coralwright: hydroNeedsCoral ? 1 : 0,
          quarrier: hydroNeedsStone ? 1 : 0
        };
        var hydroWorkerCeiling = Math.max(0,
          s.pop - Math.max(foodNeed, Number(s.jobs.gather) || 0));
        var hydroMinerLimit = SB.folk.jobLimit ? SB.folk.jobLimit(s, 'miner') : Infinity;
        hydroMinerTarget = Math.min(hydroMinerTarget, hydroWorkerCeiling, hydroMinerLimit);
        var hydroDonors = ['merchant', 'scribe', 'scholar', 'coralwright', 'quarrier'];
        var hydroMoveGuard = 0;
        while ((Number(s.jobs.miner) || 0) < hydroMinerTarget && hydroMoveGuard++ < s.pop) {
          var hydroMoved = false;
          for (var hd = 0; hd < hydroDonors.length; hd++) {
            var hydroDonor = hydroDonors[hd];
            if ((Number(s.jobs[hydroDonor]) || 0) <= (hydroFloors[hydroDonor] || 0)) continue;
            if (SB.folk.assign(s, hydroDonor, -1) && SB.folk.assign(s, 'miner', 1)) {
              changed = true; actions++; hydroMoved = true; break;
            }
          }
          if (!hydroMoved) break;
        }
      }
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
    var turbineStop = Math.max(0, (s.lvl.hydroturbine || 0) - runningTurbines);
    if ((s.turbineStop || 0) !== turbineStop) {
      s.turbineStop = turbineStop;
      changed = true; actions++;
    }
    var runningShops = Math.min(s.lvl.hydroshop || 0, runningTurbines);
    var hydroPriority = null;
    /* 破壳的硬门槛是钻机持续拿到 20/s 热液能。原先所有热液工坊先吃满，
     * 即使钻机因此只剩 15.5/s，AI 也只会升级研究所，导致关键科技永远卡在 75%。
     * 钻机启动且未破壳时，先给它保留额定流量，再用剩余供给开工坊；这只会暂时
     * 降低钢产量，壳破后下一步自动恢复工坊，不动存档、不注入资源。 */
    if (s.skydrillOn && !s.broken && SB.wonder && SB.wonder.owned(s).wonder_skydrill) {
      var drillFlow = SB.economy.hydroAlloc(s, 1);
      var drillNeed = Math.max(0, Number(SB.CFG.SKYDRILL_HYDRO) || 0);
      var shopPerLevel = Math.max(0.001, Number(SB.UNIT && SB.UNIT.hydroShopLvl) || 1);
      var shopsAfterDrill = Math.floor(Math.max(0,
        Number(drillFlow.supplyRate || 0) - drillNeed + 1e-9) / shopPerLevel);
      var plannedShops = Math.min(runningShops, shopsAfterDrill);
      hydroPriority = { target: 'skydrill', supplyRate: Number(drillFlow.supplyRate) || 0,
        requiredRate: drillNeed, shopsOpen: plannedShops, shopsTotal: Number(s.lvl.hydroshop) || 0 };
      runningShops = plannedShops;
    }
    
    var hydroshopStop = Math.max(0, (s.lvl.hydroshop || 0) - runningShops);
    if ((s.hydroshopStop || 0) !== hydroshopStop) {
      s.hydroshopStop = hydroshopStop;
      changed = true; actions++;
    }
    /* 累计产出尤里卡来自合法手动采集/生产；只补手点型的 gathered 门。 */
    if (goal.key && goal.key.cond && goal.key.cond.t === 'gathered') {
      var directGatherResource = goal.key.cond.r;
      var directGatherAmount = Number(SB.GATHER && SB.GATHER[directGatherResource]) || 0;
      var directGatherNeed = Math.max(0, goal.key.cond.n - ((s.got || {})[directGatherResource] || 0));
      /* 只模拟游戏里确实存在的手动采集按钮；工艺资源必须走正式配方。 */
      if (directGatherAmount > 0 && !recipeByResource(directGatherResource))
        for (var gg = 0; gg < Math.min(5, Math.ceil(directGatherNeed / directGatherAmount)); gg++)
          did(SB.economy.addRes(s, directGatherResource, directGatherAmount));
    }
    /* 递归补齐当前建设目标所需的工艺料；建材需求不足时，底层原料仍由职业正常生产。 */
    var craftDiagnostics = {};
    if (conditionCraftTarget) {
      var conditionCraftRecipe = recipeByResource(conditionCraftTarget.resource);
      var conditionBeforeCraft = Number(s.res && s.res[conditionCraftTarget.resource]) || 0;
      var conditionCraftUnlocked = !!(conditionCraftRecipe && recipeUnlocked(s, conditionCraftRecipe));
      var conditionCraftBlocked = conditionCraftRecipe
        ? SB.workshop.craftBlocked(s, conditionCraftRecipe.id) : '没有对应配方';
      var conditionCraftAvailable = conditionCraftRecipe
        ? SB.workshop.maxCraftable(s, conditionCraftRecipe) : 0;
      var conditionCraftMade = conditionCraftUnlocked
        ? ensureCraft(s, conditionCraftTarget.resource, conditionCraftTarget.target, emit, []) : false;
      craftDiagnostics[conditionCraftTarget.resource] = {
        have: conditionBeforeCraft, target: conditionCraftTarget.target,
        unlocked: conditionCraftUnlocked, blocked: conditionCraftBlocked,
        availableBatches: conditionCraftAvailable,
        made: Math.max(0, (Number(s.res && s.res[conditionCraftTarget.resource]) || 0) - conditionBeforeCraft)
      };
      did(conditionCraftMade);
    }
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
    /* 缺钛时按正式工坊购买 API 买齐已解锁的矿工镐；每件工具只购买一次，
     * 加成叠加到矿工职业，不会注入资源或绕过配方/科技门槛。 */
    titaniumToolTargets.forEach(function (tool) {
      if (SB.workshop.canBuy(s, tool.id)) did(SB.workshop.buy(s, tool.id, emit));
    });
    if (gatheredCraftTarget && (s.res[gatheredCraftTarget.resource] || 0) < gatheredCraftTarget.target) {
      var gatheredCraftRecipe = recipeByResource(gatheredCraftTarget.resource);
      var gatheredCraftBefore = s.res[gatheredCraftTarget.resource] || 0;
      var gatheredCraftBlocked = SB.workshop.craftBlocked(s, gatheredCraftRecipe.id);
      var gatheredCraftBatches = SB.workshop.maxCraftable(s, gatheredCraftRecipe);
      var gatheredCraftDidRun = ensureCraft(s, gatheredCraftTarget.resource,
        gatheredCraftTarget.target, emit, []);
      gatheredCraftStatus = {
        resource: gatheredCraftTarget.resource, have: gatheredCraftBefore,
        target: gatheredCraftTarget.target, produced: Number(s.got && s.got[gatheredCraftTarget.resource]) || 0,
        condition: gatheredCraftTarget.condition, blocked: gatheredCraftBlocked,
        availableBatches: gatheredCraftBatches,
        made: Math.max(0, (s.res[gatheredCraftTarget.resource] || 0) - gatheredCraftBefore)
      };
      did(gatheredCraftDidRun);
    }
    if (dysonPlan) Object.keys(dysonPlan.targets).forEach(function (resource) {
      var recipe = recipeByResource(resource);
      var target = dysonCraftTarget(s, resource, dysonPlan.targets[resource], dysonPlan);
      if (recipe && (s.res[resource] || 0) < target) {
        var beforeDysonCraft = Number(s.res && s.res[resource]) || 0;
        var dysonCraftUnlocked = recipeUnlocked(s, recipe);
        var dysonCraftBlocked = SB.workshop.craftBlocked(s, recipe.id);
        var dysonCraftBatches = SB.workshop.maxCraftable(s, recipe);
        var dysonCraftMade = ensureCraft(s, resource, target, emit, []);
        craftDiagnostics[resource] = { have: beforeDysonCraft, target: target,
          requestedTarget: dysonPlan.targets[resource],
          unlocked: dysonCraftUnlocked, blocked: dysonCraftBlocked,
          availableBatches: dysonCraftBatches,
          made: Math.max(0, (Number(s.res && s.res[resource]) || 0) - beforeDysonCraft) };
        did(dysonCraftMade);
      }
    });
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
    var firstBuildInPass = null, buildCraftDiagnostics = {}, wonderCraftDiagnostics = {};
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
      nextBuild = chooseBuild(s, goal, options, civicGoal, dysonPlan);
      /* chooseBuild() is recomputed inside the action loop. The preflight above may
       * already have replaced an unaffordable goal building with a storage building,
       * but this second selection used to discard that fallback. At high turbine
       * levels the next turbine can exceed the material cap, so the AI kept waiting
       * for an impossible stone stock while never adding the ballast capacity that
       * would make the turbine affordable. Re-apply the capacity fallback at the
       * point of construction, after every action. */
      if (nextBuild && costExceedsCapacity(s, SB.economy.costOf(s, nextBuild))) {
        var loopBuildCost = SB.economy.costOf(s, nextBuild);
        var loopCapacityResource = capacityBlockedResource(s, loopBuildCost);
        capacityResource = loopCapacityResource;
        if (!capacityFallbackFor) {
          capacityFallbackFor = nextBuild;
          capacityFallbackCost = loopBuildCost;
        }
        var loopStorageFallback = storageBuild(s, loopCapacityResource);
        if (loopStorageFallback) nextBuild = loopStorageFallback;
      }
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
      /* chooseBuild() 在动作循环里会按最新状态重新计算；这可能选出预检时尚不存在的
       * 空间站/发射场目标。对这个最终建造目标当场递归补齐工艺材料，避免状态显示“优先
       * 升级空间站”却因先前 plannedCost 已过期而没有制作火箭引擎、封闭藻仓或钛金板件。 */
      if (nextBuild) {
        var activeBuildCost = SB.economy.costOf(s, nextBuild);
        for (var bc in activeBuildCost) {
          var buildRecipe = recipeByResource(bc);
          if (!buildRecipe || (s.res[bc] || 0) >= activeBuildCost[bc]) continue;
          var beforeBuildCraft = s.res[bc] || 0;
          var buildCraftBlocked = SB.workshop.craftBlocked(s, buildRecipe.id);
          var buildCraftAvailable = SB.workshop.maxCraftable(s, buildRecipe);
          var buildCraftDidRun = ensureCraft(s, bc, activeBuildCost[bc], emit, []);
          buildCraftDiagnostics[bc] = {
            building: nextBuild, have: beforeBuildCraft, target: activeBuildCost[bc],
            blocked: buildCraftBlocked, availableBatches: buildCraftAvailable,
            made: Math.max(0, (s.res[bc] || 0) - beforeBuildCraft)
          };
          did(buildCraftDidRun);
        }
      }
      nextWonder = chooseWonder(s, goal, options, civicGoal);
      var loopPriorityUpgradeId = priorityBuildingUpgrade(s);
      if (loopPriorityUpgradeId && nextBuild === loopPriorityUpgradeId) nextWonder = null;
      if (shouldPrioritizeConditionBuild(s, goal, nextBuild, civicGoal)) nextWonder = null;
      /* 奇观目标会在本轮动作前重新选择；此时它可能刚刚变成硬门槛（例如《天穹钻机》
       * 是壳层科技 100% 的唯一后续）。前面的 plannedCost/needs 是按更早的候选集计算，
       * 有时仍为空，导致计划栏写着奇观、实际却只做满仓溢出配方并一直停在「等资源」。
       * 在正式建造门前按当前奇观的折后成本再补一次工艺料，仍走 ensureCraft/craft 正式配方；
       * 如果配方或原料真被锁住，把原因暴露到状态里，避免静默空转。 */
      if (nextWonder) {
        var loopWonder = SB.workshop.wonderById(nextWonder);
        var loopWonderCost = SB.wonder && SB.wonder.discountedCost
          ? SB.wonder.discountedCost(s, nextWonder) : (loopWonder && loopWonder.cost || {});
        var craftedWonderMaterial = false;
        for (var wc in loopWonderCost || {}) {
          if ((s.res[wc] || 0) + 1e-9 >= loopWonderCost[wc]) continue;
          var wonderRecipe = recipeByResource(wc);
          if (!wonderRecipe) continue;
          var beforeWonderCraft = Number(s.res && s.res[wc]) || 0;
          var wonderCraftBlocked = SB.workshop.craftBlocked(s, wonderRecipe.id);
          var wonderCraftAvailable = SB.workshop.maxCraftable(s, wonderRecipe);
          var wonderCraftDidRun = recipeUnlocked(s, wonderRecipe)
            ? ensureCraft(s, wc, loopWonderCost[wc], emit, []) : false;
          wonderCraftDiagnostics[wc] = {
            wonder: nextWonder, have: beforeWonderCraft, target: loopWonderCost[wc],
            recipe: wonderRecipe.id, unlocked: recipeUnlocked(s, wonderRecipe),
            blocked: wonderCraftBlocked, availableBatches: wonderCraftAvailable,
            made: Math.max(0, (Number(s.res && s.res[wc]) || 0) - beforeWonderCraft)
          };
          if (did(wonderCraftDidRun)) craftedWonderMaterial = true;
        }
        if (craftedWonderMaterial) continue;
      }
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
        /* 虚境之路的次序门槛：完成「虚境信仰」即拿到锁定卡「轮回之终末」，而
         * 「虚境探索」要到 Era10 才进入市政队列。若只等 nextCivicBoost()，Era9 不会
         * 预装这张卡；通用装卡又只填空槽，满槽时就会一直漏掉这个终局必需前置。
         * 现在在 void_faith 完成后立即通过正式 setCard API 装入，允许替换普通卡。 */
        if (s.civics && s.civics.void_faith && s.cards &&
            s.cards.indexOf('card_cycle_terminus') < 0 &&
            SB.civic.canSetCard(s, 'card_cycle_terminus'))
          installedPriorityCard = did(SB.civic.setCard(s, 'card_cycle_terminus', emit));
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
        if (!installedPriorityCard && storagePressure && !storagePolicyEquipped) {
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
        var thetaBoostCardId = null;
        var thetaKelpCardId = null;
        /* 农奴制会按现有深海鱼牧场等级放大藻场产量。θ研究所的藻食短缺时，
         * 这是直接的同局增产手段；原来的通用筛卡器只识别静态效果字段，因而漏掉
         * 了依赖 serfKelpMul() 的这张动态卡。需要换卡时只让出政治经济学槽，且
         * 先留足市政点，避免挤掉仓储、精铁、钢或工艺生产卡。 */
        if (thetaProductionPriority && thetaPlan && thetaPlan.limiting === 'kelp' &&
            thetaPlan.supportedLabs < thetaPlan.targetLabs && s.cards) {
          if (s.cards.indexOf('card_serfdom') >= 0) thetaKelpCardId = 'card_serfdom';
          else if (!installedPriorityCard && !storagePolicyEquipped &&
              SB.civic.canSetCard(s, 'card_serfdom')) {
            var serfdomSlot = -1;
            for (var sk = 0; sk < policySlots.length; sk++) if (!s.cards[sk] &&
                SB.civic.cardFits(SB.civic.policyById('card_serfdom'), policySlots[sk].type)) {
              serfdomSlot = sk; break;
            }
            var nextCivicForKelp = nextCivicCost(s);
            var cultureForKelp = Math.max(0, Number(s.res && s.res.culture) || 0);
            if (serfdomSlot < 0 && (!nextCivicForKelp ||
                cultureForKelp >= Math.max(100000, nextCivicForKelp * 5))) {
              var politicalSlot = s.cards.indexOf('card_political_econ');
              if (politicalSlot >= 0 && SB.civic.cardFits(SB.civic.policyById('card_serfdom'),
                  policySlots[politicalSlot] && policySlots[politicalSlot].type))
                serfdomSlot = politicalSlot;
            }
            if (serfdomSlot >= 0 && did(SB.civic.setCard(s, 'card_serfdom', emit, serfdomSlot))) {
              thetaKelpCardId = 'card_serfdom';
              installedPriorityCard = true;
            }
          }
        }
        /* θ产率尤里卡低于目标时，优先安装直接提高 θ 金属成品率的「血肉苦弱」(+30%)，
         * 不必等铁矿恰好成为当前最窄原料。它提高每座研究所的成品率，减少达到 5/s 所需的
         * 研究所与四种原料总量；若政策槽已满，只允许替换较弱的「矿物章程」，不挤仓储卡。 */
        if (thetaProductionPriority && thetaPlan && s.cards) {
          var ironBoostCards = ['card_flesh_weak', 'card_mineral_charter'];
          for (var ib = 0; ib < ironBoostCards.length; ib++) {
            var ironCardId = ironBoostCards[ib];
            if (s.cards.indexOf(ironCardId) >= 0) { thetaBoostCardId = ironCardId; break; }
            if (installedPriorityCard || !SB.civic.canSetCard(s, ironCardId)) continue;
            var ironCard = SB.civic.policyById(ironCardId), ironSlot = -1;
            for (var ips = 0; ironCard && ips < policySlots.length; ips++) {
              if (!s.cards[ips] && SB.civic.cardFits(ironCard, policySlots[ips].type)) { ironSlot = ips; break; }
            }
            if (ironSlot < 0 && ironCardId === 'card_flesh_weak') {
              var mineralSlot = s.cards.indexOf('card_mineral_charter');
              if (mineralSlot >= 0 && ironCard &&
                  SB.civic.cardFits(ironCard, policySlots[mineralSlot] && policySlots[mineralSlot].type))
                ironSlot = mineralSlot;
            }
            if (ironSlot >= 0 && did(SB.civic.setCard(s, ironCardId, emit, ironSlot))) {
              thetaBoostCardId = ironCardId;
              installedPriorityCard = true;
              break;
            }
          }
        }
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
      /* 先确保至少有三槽政体；若当前市政鼓舞明确要求更多槽位（例如《现代思潮》需 7 槽），
       * 就继续换到已解锁且满足门槛的政体。以前只检查“三槽”，导致 3 槽政体被视为完成，
       * 却永远不切换到教权国/平等主义/联邦制，市政与其后的太空竞赛、深空科技因此卡死。 */
      var currentGov = SB.civic.govById(s.gov);
      /* 有些市政的鼓舞要求采用指定政体。只检查政体槽数会让 AI 永远停在
       * “缺星海合作社/星际联邦”的鼓舞，相关政策卡（含精铁/θ +30%）就不会解锁。 */
      if (civicBoost && civicBoost.t === 'govId' && civicBoost.id &&
          s.gov !== civicBoost.id && SB.civic.govOwned(s, civicBoost.id) &&
          SB.civic.canSetGov(s, civicBoost.id)) {
        if (did(SB.civic.setGov(s, civicBoost.id, emit)))
          currentGov = SB.civic.govById(s.gov);
      }
      /* govWildSlots 的正式判定按所有政策槽总数计数，不是只数 wild 槽；Era6 的 7 槽政体
       * 实际是 4 wild + 其余专用槽。只比较 slots.wild 会让 AI 永远找不到任何 7 槽政体。 */
      var currentGovSlots = totalGovernmentSlots(currentGov);
      var desiredGovWildSlots = 3;
      if (civicBoost && civicBoost.t === 'govWildSlots' && !SB.civic.boostMet(s, civicGoal))
        desiredGovWildSlots = Math.max(desiredGovWildSlots, Number(civicBoost.n) || 0);
      if (currentGovSlots < desiredGovWildSlots) {
        var govs = SB.GOVS || [];
        for (var gi = 0; gi < govs.length; gi++) {
          if (totalGovernmentSlots(govs[gi]) >= desiredGovWildSlots && SB.civic.govOwned(s, govs[gi].id) &&
              SB.civic.canSetGov(s, govs[gi].id)) {
            if (did(SB.civic.setGov(s, govs[gi].id, emit))) break;
          }
        }
      }
    }
    SB.game.pumpTech(s, emit); SB.game.pumpCivic(s, emit);
    if (s.wonders && s.wonders.wonder_skydrill && !s.broken && !s.skydrillOn && SB.ui && SB.ui.input && SB.ui.input.toggleSkydrill)
      did(SB.ui.input.toggleSkydrill(s));
    /* G.E.E.K 需要一次明确启动操作；建成后自动调用同一 UI 正式切换 API，
     * 只在当前科技正等恩克拉多斯尤里卡时启动，不改写地形改造进度或跨周目状态。 */
    if (s.wonders && s.wonders.wonder_geek && !(s.geek && s.geek.geekOn) &&
        goal && goal.cond && goal.cond.t === 'geekEnceladus' &&
        !(s.geek && s.geek.enceladusDone) && SB.ui && SB.ui.input && SB.ui.input.toggleGeek)
      did(SB.ui.input.toggleGeek(s));
    if (changed && SB.game.markDirty) SB.game.markDirty();
    return { changed: changed, actions: actions, goal: goal.id || null, condition: cond && cond.t || null,
      thetaProduction: thetaPlan,
      thetaDemandActive: thetaProductionPriority,
      thetaBoostCard: thetaBoostCardId,
      thetaKelpCard: thetaKelpCardId,
      ironStorageUpgrades: ['upg_ballast_1', 'upg_ballast_2', 'upg_alloy_warehouse'].map(function (upgradeId) {
        var upgrade = SB.workshop.upgradeById(upgradeId);
        return upgrade ? {
          id: upgradeId, name: upgrade.name,
          installed: !!(s.upgrades && s.upgrades[upgradeId]),
          unlocked: !upgrade.need || !!(s.techs && s.techs[upgrade.need]),
          canBuy: SB.workshop.upgradeCanBuy ? !!SB.workshop.upgradeCanBuy(s, upgradeId) : false
        } : null;
      }).filter(Boolean),
      thetaKelpGather: thetaKelpPlan ? Object.assign({}, thetaKelpPlan, {
        assigned: Number(s.jobs && s.jobs.gather) || 0
      }) : null,
      titaniumMining: titaniumPlan ? Object.assign({}, titaniumPlan, {
        assignedMiners: Number(s.jobs && s.jobs.miner) || 0,
        plannedMiners: titaniumPlan.needed ? titaniumTargetMiners : titaniumPlan.currentMiners,
        deepmineInstalled: !!(s.upgrades && s.upgrades.upg_deepmine),
        mineLevels: Number(s.lvl && s.lvl.siltpit) || 0,
        activeMineLevels: SB.economy.activeSiltpit ? SB.economy.activeSiltpit(s) : Number(s.lvl && s.lvl.siltpit) || 0,
        miningMultiplier: SB.economy.toolMul ? SB.economy.toolMul(s, 'miner') : 1,
        autodrill: !!(s.upgrades && s.upgrades.upg_autodrill),
        autodrillTech: !!(s.techs && s.techs.autodrill),
        tools: (SB.workshop.tools() || []).filter(function (tool) {
          return tool.target && tool.target.indexOf('miner') >= 0 && s.tools && s.tools[tool.id];
        }).map(function (tool) { return tool.id; }),
        plannedTools: titaniumToolTargets.filter(function (tool) { return !(s.tools && s.tools[tool.id]); })
          .map(function (tool) { return tool.id; }),
        plannedUpgrade: supportUpgradeId === 'upg_autodrill' ? supportUpgradeId : null,
        upgradeBlock: supportUpgradeId === 'upg_autodrill' && SB.workshop.upgradeBlocked
          ? SB.workshop.upgradeBlocked(s, 'upg_autodrill') : null
      }) : null,
      civic: civicGoal && civicGoal.id || null, civicCondition: civicBoost && civicBoost.t || null,
      zoneJobs: Object.keys(requiredZoneJobs), zoneJobCounts: Object.keys(requiredZoneJobs).map(function (job) {
        return job + ':' + (s.jobs[job] || 0);
      }),
      materialJobCounts: Object.keys(reservedMaterialJobs).map(function (job) {
        return job + ':' + (s.jobs[job] || 0);
      }),
      plannedResourceNeeds: Object.assign({}, needs),
      hydroPriority: hydroPriority,
      dysonPlan: dysonPlan ? { mode: dysonPlan.mode, activeLevels: dysonPlan.activeLevels,
        bufferSeconds: dysonPlan.bufferSeconds, targets: Object.assign({}, dysonPlan.targets),
        thetaRateRequired: dysonPlan.thetaRateRequired, thetaRateAvailable: dysonPlan.thetaRateAvailable,
        warmstoneRateRequired: dysonPlan.warmstoneRateRequired,
        warmstoneRateAvailable: dysonPlan.warmstoneRateAvailable,
        tiplateRateRequired: dysonPlan.tiplateRateRequired,
        tiplateRateAvailable: dysonPlan.tiplateRateAvailable,
        warmstoneTargetMiners: dysonWarmstoneTargetMiners,
        thetaIronTargetMiners: Number(thetaIronPlan && thetaIronPlan.targetMiners) || 0,
        thetaTargetLabs: Number(thetaPlan && thetaPlan.targetLabs) || 0,
        thetaSupportedLabs: Number(thetaPlan && thetaPlan.supportedLabs) || 0 } : null,
      craftDiagnostics: craftDiagnostics,
      buildCraftDiagnostics: buildCraftDiagnostics, wonderCraftDiagnostics: wonderCraftDiagnostics,
      gatheredCraft: gatheredCraftStatus,
      overflowCraft: overflowCraftResult,
      zone: activeZoneCond && activeZoneCond.zone || null,
      zoneNeeds: zoneNeeds,
      housingTarget: housingTarget,
      housingCapacityBlocked: housingCapacityBlocked,
      capacityBlockedResource: capacityResource,
      housingChecks: housingChecks,
      plannedBuildingUpgrade: nextBuild && (s.lvl[nextBuild] || 0) > 0 ? nextBuild : null,
      castleDiscount: SB.economy.hallDiscount ? SB.economy.hallDiscount(s) : null,
      castleDiscountSoftCap: SB.economy.hallDiscountLimit ? SB.economy.hallDiscountLimit(s) : null,
      plannedUpgrade: capacityUpgrade ? 'upg_castle' :
        (storageCapacityUpgrade && storageCapacityUpgrade.id || supportUpgradeId || civicUpgradeId ||
          (cond && cond.t === 'upgrade' && !(s.upgrades && s.upgrades[cond.id]) ? cond.id : null)),
      supportUpgrade: supportUpgradeId || null,
      goalConditionText: cond && SB.tech.condText ? SB.tech.condText(cond) : null,
      buildCost: nextBuild ? SB.economy.costOf(s, nextBuild) : null,
      buildCapacityBlocked: !!capacityFallbackFor,
      capacityFallbackFor: capacityFallbackFor,
      capacityFallbackCost: capacityFallbackCost,
      buildMaterials: nextBuild ? Object.keys(SB.economy.costOf(s, nextBuild)).map(function (r) {
        return r + ':' + ((s.res[r] || 0).toFixed ? (s.res[r] || 0).toFixed(1) : (s.res[r] || 0)) + '/' +
          SB.economy.costOf(s, nextBuild)[r];
      }) : [],
      build: nextBuild || null, wonder: nextWonder || null };
  }

  SB.aiStrategy = { version: 91, step: step, researchGoal: researchGoal, firstMissingPrereq: firstMissingPrereq,
    markVoidEndingRun: markVoidEndingRun,
    isVoidEndingRun: isVoidEndingRun,
    drillStockTarget: drillStockTarget };
})(typeof window !== 'undefined' ? window : globalThis);
