/* SHELLBREAK — Military production, enemy scale, and campaign action rules. */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  var RECOVERY_PER_SECOND = 0.0001;
  var INVASION_CYCLE_SECONDS = 1800;
  var INVASION_WARNING_SECONDS = 300;
  var INVASION_COOLDOWN_SECONDS = 1800;
  var POP_CAP_POOLS = [3, 5, 8, 12, 18, 25, 35];
  var MAX_CAMPAIGN_STAGE = 7;
  var ENEMY_NAME_POOLS = {
    1: [
      'enemy.name_pool.stage_1.tidemark_reef_clans',
      'enemy.name_pool.stage_1.mistbay_foragers_camp',
      'enemy.name_pool.stage_1.riftstone_cavern_settlement',
      'enemy.name_pool.stage_1.saltmist_shorefolk_tribe',
      'enemy.name_pool.stage_1.floating_kelp_flats_settlement',
      'enemy.name_pool.stage_1.whitegravel_trench_clans',
      'enemy.name_pool.stage_1.sunkstone_clan_council',
      'enemy.name_pool.stage_1.moontide_cavern_tribe'
    ],
    2: [
      'enemy.name_pool.stage_2.coral_harbor_city_state',
      'enemy.name_pool.stage_2.far_tide_port_cities_league',
      'enemy.name_pool.stage_2.thousand_reefs_trade_council',
      'enemy.name_pool.stage_2.blue_bay_free_city',
      'enemy.name_pool.stage_2.mirror_sea_pearl_guild',
      'enemy.name_pool.stage_2.lighthouse_isles_city_league',
      'enemy.name_pool.stage_2.pearl_route_merchants_guild',
      'enemy.name_pool.stage_2.tidegate_free_port_league'
    ],
    3: [
      'enemy.name_pool.stage_3.azure_reef_kingdom',
      'enemy.name_pool.stage_3.trench_lords_alliance',
      'enemy.name_pool.stage_3.undertow_maritime_dynasty',
      'enemy.name_pool.stage_3.hundred_reefs_grand_duchy',
      'enemy.name_pool.stage_3.pearl_sea_united_kingdom',
      'enemy.name_pool.stage_3.red_tide_realm',
      'enemy.name_pool.stage_3.umbral_shell_grand_duchy',
      'enemy.name_pool.stage_3.tidecrown_dynasty'
    ],
    4: [
      'enemy.name_pool.stage_4.tidal_foundry_republic',
      'enemy.name_pool.stage_4.circumsea_industrial_federation',
      'enemy.name_pool.stage_4.abyssal_industrial_union',
      'enemy.name_pool.stage_4.seabed_rail_republic',
      'enemy.name_pool.stage_4.coral_steel_alliance',
      'enemy.name_pool.stage_4.cold_bay_industrial_union',
      'enemy.name_pool.stage_4.rift_energy_republic',
      'enemy.name_pool.stage_4.new_tide_workers_federation'
    ],
    5: [
      'enemy.name_pool.stage_5.terra_oceanic_assembly',
      'enemy.name_pool.stage_5.ice_shell_planetary_government',
      'enemy.name_pool.stage_5.global_tide_commonwealth',
      'enemy.name_pool.stage_5.terra_unified_republic',
      'enemy.name_pool.stage_5.surface_deepsea_coordination_pact',
      'enemy.name_pool.stage_5.planetary_resources_council',
      'enemy.name_pool.stage_5.unified_oceanic_ecology_pact',
      'enemy.name_pool.stage_5.new_terra_commonwealth'
    ],
    6: [
      'enemy.name_pool.stage_6.outer_ring_colonial_federation',
      'enemy.name_pool.stage_6.multiport_stellar_confederation',
      'enemy.name_pool.stage_6.starring_expedition_compact',
      'enemy.name_pool.stage_6.solar_system_colonial_council',
      'enemy.name_pool.stage_6.inner_outer_planets_union',
      'enemy.name_pool.stage_6.distant_orbit_defense_league',
      'enemy.name_pool.stage_6.interplanetary_trade_network',
      'enemy.name_pool.stage_6.many_worlds_colonial_republics'
    ],
    7: [
      'enemy.name_pool.stage_7.starsea_route_collective',
      'enemy.name_pool.stage_7.far_stellar_reaches_federation',
      'enemy.name_pool.stage_7.deep_space_civilization_compact',
      'enemy.name_pool.stage_7.starways_joint_council',
      'enemy.name_pool.stage_7.galactic_frontier_union',
      'enemy.name_pool.stage_7.transstellar_civilizations_league',
      'enemy.name_pool.stage_7.stellar_beacon_union_civilization',
      'enemy.name_pool.stage_7.multistar_systems_cooperative_council'
    ]
  };
  var ENEMY_NAME_KEYS = [];
  for (var nameStage = 1; nameStage <= MAX_CAMPAIGN_STAGE; nameStage++)
    ENEMY_NAME_KEYS = ENEMY_NAME_KEYS.concat(ENEMY_NAME_POOLS[nameStage]);
  function enemyNamePool(stage) {
    var normalizedStage = clamp(Math.floor(nonNegative(stage) || 1), 1, MAX_CAMPAIGN_STAGE);
    return ENEMY_NAME_POOLS[normalizedStage] || [];
  }
  function isEnemyNameKeyForStage(key, stage) {
    return enemyNamePool(stage).indexOf(key) >= 0;
  }
  /* 七阶基准规模继续按每阶 ×5；后续可按实测战役时长统一调参。 */
  var ENEMIES = [
    { id: 'enemy_1', stage: 1, baseScale: 1000, popCapPool: 3 },
    { id: 'enemy_2', stage: 2, baseScale: 5000, popCapPool: 5 },
    { id: 'enemy_3', stage: 3, baseScale: 25000, popCapPool: 8 },
    { id: 'enemy_4', stage: 4, baseScale: 125000, popCapPool: 12 },
    { id: 'enemy_5', stage: 5, baseScale: 625000, popCapPool: 18 },
    { id: 'enemy_6', stage: 6, baseScale: 3125000, popCapPool: 25 },
    { id: 'enemy_7', stage: 7, baseScale: 15625000, popCapPool: 35 }
  ];
  var ACTIONS = {
    raid: {
      costShare: 0.05, lootSeconds: 60, unlockCivic: 'military_training',
      outcomes: {
        failure: { chance: 0.25, scaleLoss: 0.30, soldierLoss: 0.50, popCap: 0 },
        success: { chance: 0.70, scaleLoss: 0.70, soldierLoss: 0.20, popCap: 0 },
        greatSuccess: { chance: 0.05, scaleLoss: 1.00, soldierLoss: 0, popCap: 1 }
      }
    },
    invasion: {
      costShare: 0.15, lootSeconds: 300, unlockCivic: 'professional_army',
      outcomes: {
        failure: { chance: 0.35, scaleLoss: 0.50, soldierLoss: 1, popCap: 0 },
        success: { chance: 0.60, scaleLoss: 0.80, soldierLoss: 0.50, popCap: 0 },
        greatSuccess: { chance: 0.05, scaleLoss: 1.20, soldierLoss: 0.20, popCap: 2 }
      }
    },
    totalWar: {
      costShare: 0.30, lootSeconds: 600, unlockCivic: 'mobilization',
      outcomes: {
        failure: { chance: 0.40, scaleLoss: 0.70, soldierLoss: 1, popCap: 0 },
        success: { chance: 0.55, scaleLoss: 1.20, soldierLoss: 0.50, popCap: 0 },
        greatSuccess: { chance: 0.05, scaleLoss: 1.50, soldierLoss: 0.20, popCap: 3 }
      }
    }
  };

  function nonNegative(value) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? n : 0;
  }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function ensureState(s) {
    if (!s) return null;
    if (!s.war || typeof s.war !== 'object') s.war = {
      power: 0, popCap: 0, campaignStage: 0, tradeRouteLevel: 0, enemies: {},
      invasionThreat: 0, invasionCooldown: 0, invasionWarning: 0, invasionWarningPending: false,
      offlineInvasionResolved: false, invasionReports: []
    };
    if (!(typeof s.war.power === 'number' && isFinite(s.war.power) && s.war.power >= 0)) s.war.power = 0;
    if (!(typeof s.war.popCap === 'number' && isFinite(s.war.popCap) && s.war.popCap >= 0)) s.war.popCap = 0;
    if (!(typeof s.war.campaignStage === 'number' && isFinite(s.war.campaignStage))) s.war.campaignStage = 0;
    s.war.campaignStage = clamp(Math.floor(s.war.campaignStage), 0, MAX_CAMPAIGN_STAGE);
    if (!(typeof s.war.tradeRouteLevel === 'number' && isFinite(s.war.tradeRouteLevel))) s.war.tradeRouteLevel = 0;
    s.war.tradeRouteLevel = clamp(Math.floor(s.war.tradeRouteLevel), 0, 3);
    if (!s.war.enemies || typeof s.war.enemies !== 'object' || Array.isArray(s.war.enemies)) s.war.enemies = {};
    if (!(typeof s.war.invasionThreat === 'number' && isFinite(s.war.invasionThreat) && s.war.invasionThreat >= 0)) s.war.invasionThreat = 0;
    s.war.invasionThreat = Math.min(INVASION_CYCLE_SECONDS, s.war.invasionThreat);
    if (!(typeof s.war.invasionCooldown === 'number' && isFinite(s.war.invasionCooldown) && s.war.invasionCooldown >= 0)) s.war.invasionCooldown = 0;
    s.war.invasionCooldown = Math.min(INVASION_COOLDOWN_SECONDS, s.war.invasionCooldown);
    if (!(typeof s.war.invasionWarning === 'number' && isFinite(s.war.invasionWarning) && s.war.invasionWarning >= 0)) s.war.invasionWarning = 0;
    s.war.invasionWarning = Math.min(INVASION_WARNING_SECONDS, s.war.invasionWarning);
    s.war.invasionWarningPending = s.war.invasionWarningPending === true;
    s.war.offlineInvasionResolved = s.war.offlineInvasionResolved === true;
    if (!Array.isArray(s.war.invasionReports)) s.war.invasionReports = [];
    return s.war;
  }
  function power(s) {
    var state = ensureState(s);
    return state ? state.power : 0;
  }
  function rate(s) {
    if (!s) return 0;
    var B = SB.BLD || {};
    var jobs = SB.folk && SB.folk.effJobs ? SB.folk.effJobs(s) : (s.jobs || {});
    var soldiers = nonNegative(jobs.soldier);
    var barracksLevel = nonNegative(s.lvl && s.lvl.barracks);
    var academyLevel = nonNegative(s.lvl && s.lvl.military_academy);
    var baseSoldierRate = nonNegative(B.soldierMilitaryPower);
    var barracksBonus = nonNegative(B.barracksMilitaryBonusPerLevel);
    /* effJobs 已应用职业信条与族民通用产出乘区，不能在这里重复乘信仰守护。 */
    var barracksBonusMul = policyEquipped(s, 'card_fleet_review') ? policyNumber(s, 'card_fleet_review', 'barracksBonusMul', 1.5)
      : policyEquipped(s, 'card_mercenary') ? policyNumber(s, 'card_mercenary', 'barracksBonusMul', 1)
        : policyEquipped(s, 'card_drill') ? policyNumber(s, 'card_drill', 'barracksBonusMul', 0.5) : 0;
    var soldierOutput = soldiers * baseSoldierRate * (1 + barracksLevel * barracksBonus * (1 + barracksBonusMul));
    var soldierUpgradeBonus = SB.economy && SB.economy.upgSum
      ? nonNegative(SB.economy.upgSum(s, 'militarySoldierBonus')) : 0;
    var soldierWonderBonus = 0;
    if (wonderOwned(s, 'wonder_goddard_rod')) {
      var spacecraftCount = 0;
      if (Array.isArray(s.spacecraft)) for (var si = 0; si < s.spacecraft.length; si++) {
        var craft = s.spacecraft[si];
        if (craft && (craft.type === 'satellite' || craft.type === 'station')) spacecraftCount++;
      }
      soldierWonderBonus = wonderEffectValue('wonder_goddard_rod', 'soldierOutputBonus', 0.10)
        + spacecraftCount * wonderEffectValue('wonder_goddard_rod', 'spacecraftSoldierOutputBonus', 0.05);
    }
    soldierOutput *= 1 + soldierUpgradeBonus + soldierWonderBonus;
    var academyOutput = nonNegative(s.pop) * academyLevel * nonNegative(B.militaryAcademyPowerPerPopulationPerLevel);
    var total = (soldierOutput + academyOutput) * conquestProductionMultiplier(s);
    return isFinite(total) ? Math.max(0, total) : 0;
  }
  function tick(s, dt, emit, opts) {
    var state = ensureState(s);
    var elapsed = Number(dt);
    if (!state || !isFinite(elapsed) || elapsed <= 0) return 0;
    syncCampaign(s);
    var generated = rate(s) * elapsed;
    if (isFinite(generated) && generated > 0) state.power += generated;
    var invasionEnemy = currentEnemy(s), invasionScaleAtStart = currentScale(invasionEnemy);
    recoverEnemies(s, elapsed);
    advanceInvasion(s, elapsed, emit, !!(opts && opts.deferBreakUI), invasionScaleAtStart);
    return generated;
  }

  function effectiveMaxScale(enemy) {
    if (!enemy) return 0;
    var base = nonNegative(enemy.baseScale);
    var faithReduction = clamp(nonNegative(enemy.faithReduction), 0, 0.30);
    var cultureReduction = clamp(nonNegative(enemy.cultureReduction), 0, 0.30);
    return base * Math.max(0.40, 1 - faithReduction - cultureReduction);
  }
  function currentScale(enemy) {
    return enemy ? Math.min(effectiveMaxScale(enemy), nonNegative(enemy.currentScale)) : 0;
  }
  function chooseEnemyNameKey(s, enemyId, stage) {
    var state = ensureState(s), used = {}, pool = enemyNamePool(stage), key;
    if (state) for (key in state.enemies) if (Object.prototype.hasOwnProperty.call(state.enemies, key) && key !== enemyId) {
      var candidate = state.enemies[key] && state.enemies[key].nameKey;
      if (isEnemyNameKeyForStage(candidate, stage)) used[candidate] = true;
    }
    var available = pool.filter(function (nameKey) { return !used[nameKey]; });
    if (!available.length) available = pool;
    return available[Math.floor(randomValue() * available.length)];
  }
  function registerEnemy(s, definition) {
    var state = ensureState(s);
    if (!state || !definition || !definition.id || !(nonNegative(definition.baseScale) > 0)) return null;
    var id = String(definition.id), existing = state.enemies[id];
    var enemyStage = clamp(Math.floor(nonNegative(definition.stage) || 1), 1, MAX_CAMPAIGN_STAGE);
    var pool = definition.popCapPool;
    if (!(typeof pool === 'number' && isFinite(pool) && pool >= 0)) {
      var stageIndex = clamp(Math.floor(nonNegative(definition.stage) || 1) - 1, 0, POP_CAP_POOLS.length - 1);
      pool = POP_CAP_POOLS[stageIndex];
    }
    var enemy = existing && typeof existing === 'object' ? existing : {
      id: id, currentScale: nonNegative(definition.baseScale), faithReduction: 0,
      cultureReduction: 0, faithActions: 0, cultureActions: 0,
      popCapClaimed: 0, status: 'active'
    };
    enemy.id = id;
    var existingNameKey = existing && isEnemyNameKeyForStage(existing.nameKey, enemyStage) ? existing.nameKey : '';
    var definedNameKey = isEnemyNameKeyForStage(definition.nameKey, enemyStage) ? definition.nameKey : '';
    enemy.nameKey = existingNameKey || definedNameKey || chooseEnemyNameKey(s, id, enemyStage);
    enemy.stage = enemyStage;
    enemy.baseScale = nonNegative(definition.baseScale);
    enemy.popCapPool = pool;
    enemy.popCapClaimed = clamp(nonNegative(enemy.popCapClaimed), 0, pool);
    enemy.faithReduction = clamp(nonNegative(enemy.faithReduction), 0, 0.30);
    enemy.cultureReduction = clamp(nonNegative(enemy.cultureReduction), 0, 0.30);
    enemy.faithActions = Math.max(0, Math.floor(nonNegative(enemy.faithActions)));
    enemy.cultureActions = Math.max(0, Math.floor(nonNegative(enemy.cultureActions)));
    enemy.currentScale = Math.min(effectiveMaxScale(enemy),
      typeof enemy.currentScale === 'number' && isFinite(enemy.currentScale) ? Math.max(0, enemy.currentScale) : enemy.baseScale);
    if (enemy.status !== 'annexed') enemy.status = 'active';
    state.enemies[id] = enemy;
    return enemy;
  }
  function reduceEnemyCap(enemy, channel, amount) {
    if (!enemy || (channel !== 'faithReduction' && channel !== 'cultureReduction')) return 0;
    var previous = clamp(nonNegative(enemy[channel]), 0, 0.30);
    var next = clamp(previous + nonNegative(amount), 0, 0.30);
    enemy[channel] = next;
    enemy.currentScale = Math.min(currentScale(enemy), effectiveMaxScale(enemy));
    return next - previous;
  }
  function recoverEnemy(enemy, dt) {
    var elapsed = Number(dt), maxScale = effectiveMaxScale(enemy);
    if (!enemy || !isFinite(elapsed) || elapsed <= 0 || maxScale <= 0 || enemy.status === 'annexed') return 0;
    var before = currentScale(enemy);
    enemy.currentScale = Math.min(maxScale, before + maxScale * RECOVERY_PER_SECOND * elapsed);
    return enemy.currentScale - before;
  }
  function recoverEnemies(s, dt) {
    var state = ensureState(s), key;
    if (!state) return 0;
    var total = 0;
    for (key in state.enemies) if (Object.prototype.hasOwnProperty.call(state.enemies, key))
      total += recoverEnemy(state.enemies[key], dt);
    return total;
  }
  function enemyOf(s, enemyId) {
    var state = ensureState(s);
    return state && state.enemies[String(enemyId)] || null;
  }
  function wonderOwned(s, wonderId) {
    return !!(SB.wonder && SB.wonder.owned && SB.wonder.owned(s) && SB.wonder.owned(s)[wonderId]);
  }
  function wonderEffectValue(wonderId, field, fallback) {
    var definition = SB.wonder && SB.wonder.byId ? SB.wonder.byId(wonderId) : null;
    var value = definition && definition.effect && definition.effect[field];
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }
  function syncCampaign(s) {
    var state = ensureState(s);
    var hasDiplomacy = !!(s && ((s.techs && s.techs.navigation) ||
      (s.civics && s.civics.military_training)));
    if (!state || !hasDiplomacy || state.campaignStage >= ENEMIES.length) return null;
    var nextStage = state.campaignStage + 1;
    for (var i = 0; i < ENEMIES.length; i++) {
      if (ENEMIES[i].stage === nextStage) return registerEnemy(s, ENEMIES[i]);
    }
    return null;
  }
  function currentEnemy(s) {
    var state = ensureState(s);
    return state && state.campaignStage < ENEMIES.length ? enemyOf(s, 'enemy_' + (state.campaignStage + 1)) : null;
  }
  function conquestBonusPercent(s) {
    var stage = s && s.war && s.war.campaignStage;
    return typeof stage === 'number' && isFinite(stage)
      ? clamp(Math.floor(stage), 0, MAX_CAMPAIGN_STAGE) : 0;
  }
  function conquestProductionMultiplier(s) { return 1 + conquestBonusPercent(s) / 100; }
  function enemyAvailable(state, enemy) {
    return !!(state && enemy && enemy.status !== 'annexed' && enemy.stage === state.campaignStage + 1);
  }
  function translated(key, params) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || '';
  }
  function randomValue() {
    var value = SB.rng ? Number(SB.rng()) : Math.random();
    if (!isFinite(value)) value = Math.random();
    return clamp(value, 0, 1 - Number.EPSILON);
  }
  function randomItem(items) {
    return items && items.length ? items[Math.floor(randomValue() * items.length)] : null;
  }
  function enemySuccessChance(s, enemy) {
    var enemyPower = currentScale(enemy);
    if (!(enemyPower > 0)) return 0;
    var defensePower = power(s) + rate(s) * 600;
    if (!(defensePower > 0)) return 0.80;
    return clamp(0.25 + 0.25 * (Math.log(enemyPower / defensePower) / Math.LN2), 0, 0.80);
  }
  function invasionWarningThreshold(threatRate) {
    return INVASION_CYCLE_SECONDS - INVASION_WARNING_SECONDS * clamp(threatRate, 0, 1);
  }
  function invasionStatus(s) {
    var state = ensureState(s), enemy = currentEnemy(s);
    var maxScale = effectiveMaxScale(enemy);
    var scale = currentScale(enemy), atRisk = scale > 0;
    var threatRate = maxScale > 0 ? clamp(scale / maxScale, 0, 1) : 0;
    var threatTime = threatRate > 0
      ? Math.max(0, (INVASION_CYCLE_SECONDS - (state ? state.invasionThreat : 0)) / threatRate) : 0;
    return {
      threatPercent: state && atRisk ? clamp(state.invasionThreat / INVASION_CYCLE_SECONDS * 100, 0, 100) : 0,
      cooldownRemaining: state ? state.invasionCooldown : 0,
      warningRemaining: state ? state.invasionWarning : 0,
      countdownRemaining: state && state.invasionWarningPending && atRisk
        ? Math.max(state.invasionWarning, state.invasionCooldown, threatTime) : state ? state.invasionWarning : 0,
      warningPending: !!(state && state.invasionWarningPending && atRisk),
      enemySuccessChance: enemy ? enemySuccessChance(s, enemy) : 0
    };
  }
  function invasionReportMessages(report) {
    if (!report || typeof report !== 'object') return [];
    var enemyName = translated(report.enemyNameKey) || '';
    var messages = [];
    if (report.type === 'repelled') {
      messages.push(translated('ui.war.invasion.result.repulsed', {
        enemyName: enemyName, scaleLoss: SB.economy && SB.economy.fmtAmt
          ? SB.economy.fmtAmt(report.scaleLoss) : String(Math.floor(nonNegative(report.scaleLoss)))
      }));
      return messages.filter(Boolean);
    }
    if (report.type !== 'success') return messages;
    messages.push(translated('ui.war.invasion.result.success', {
      enemyName: enemyName, enemySuccessPercent: report.enemySuccessPercent,
      scaleLoss: SB.economy && SB.economy.fmtAmt ? SB.economy.fmtAmt(report.scaleLoss) : String(report.scaleLoss)
    }));
    var penalty = report.penalty || {};
    if (penalty.kind === 'material') {
      var resource = SB.RESS && SB.RESS[penalty.resourceId];
      var resourceName = SB.i18n && SB.i18n.resourceName
        ? SB.i18n.resourceName(penalty.resourceId, resource && resource.name || penalty.resourceId)
        : resource && resource.name || penalty.resourceId;
      messages.push(translated('ui.war.invasion.penalty.material', {
        amount: SB.economy && SB.economy.fmtAmt ? SB.economy.fmtAmt(penalty.amount) : String(penalty.amount),
        resourceName: resourceName
      }));
    } else if (penalty.kind === 'population') {
      messages.push(translated('ui.war.invasion.penalty.population', { populationLoss: penalty.amount }));
    } else if (penalty.kind === 'building') {
      var building = (SB.BUILDINGS || []).filter(function (item) { return item && item.id === penalty.buildingId; })[0];
      var buildingName = SB.i18n && SB.i18n.buildingName
        ? SB.i18n.buildingName(penalty.buildingId, building && building.name || penalty.buildingId)
        : building && building.name || penalty.buildingId;
      messages.push(translated('ui.war.invasion.penalty.building', { buildingName: buildingName }));
    }
    return messages.filter(Boolean);
  }
  function invasionMaterialCandidates(s) {
    var excluded = { kelp: true, starExplore: true, science: true, culture: true, luxury: true, faith: true };
    var candidates = [], resources = SB.RESS || {};
    for (var id in resources) if (Object.prototype.hasOwnProperty.call(resources, id) && !excluded[id]) {
      var definition = resources[id], amount = nonNegative(s && s.res && s.res[id]);
      if (definition && definition.kind !== 'craft' && !definition.flow && amount > 0 && SB.economy && SB.economy.resUnlocked &&
          SB.economy.resUnlocked(s, id) && grossResourceRate(s, id) > 0) candidates.push(id);
    }
    return candidates;
  }
  function invasionBuildingCandidates(s) {
    var candidates = [], buildings = SB.BUILDINGS || [];
    for (var i = 0; i < buildings.length; i++) {
      var building = buildings[i], level = nonNegative(s && s.lvl && s.lvl[building && building.id]);
      if (!building || !building.id || level < 2 || building.unique === true || building.wonder === true || building.maxLevel === 1) continue;
      var capAfterDowngrade = Infinity;
      if (SB.economy && SB.economy.popCap && s.lvl) {
        var previous = s.lvl[building.id];
        s.lvl[building.id] = level - 1;
        try { capAfterDowngrade = SB.economy.popCap(s); }
        finally { s.lvl[building.id] = previous; }
      }
      if (capAfterDowngrade + 1e-9 >= nonNegative(s.pop)) candidates.push(building.id);
    }
    return candidates;
  }
  function loseRandomMaterial(s) {
    var resourceId = randomItem(invasionMaterialCandidates(s));
    if (!resourceId) return null;
    var amount = Math.min(nonNegative(s.res[resourceId]), grossResourceRate(s, resourceId) * 300);
    if (!(amount > 0)) return null;
    s.res[resourceId] = Math.max(0, nonNegative(s.res[resourceId]) - amount);
    return { kind: 'material', resourceId: resourceId, amount: amount };
  }
  function losePopulation(s) {
    var population = nonNegative(s.pop);
    if (!(population > 0)) return null;
    var amount = Math.min(population, clamp(Math.round(population * 0.005), 1, 100));
    s.pop = Math.max(0, population - amount);
    if (SB.folk && SB.folk.reconcile) SB.folk.reconcile(s);
    if (SB.folk && SB.folk.reconcileRobot) SB.folk.reconcileRobot(s);
    return { kind: 'population', amount: amount };
  }
  function downgradeRandomBuilding(s) {
    var buildingId = randomItem(invasionBuildingCandidates(s));
    if (!buildingId) return null;
    s.lvl[buildingId] = Math.max(0, Math.floor(nonNegative(s.lvl[buildingId])) - 1);
    return { kind: 'building', buildingId: buildingId };
  }
  function applyInvasionPenalty(s) {
    var roll = randomValue(), penalty = null;
    if (roll < 0.70) penalty = loseRandomMaterial(s) || losePopulation(s) || downgradeRandomBuilding(s);
    else if (roll < 0.95) penalty = losePopulation(s) || loseRandomMaterial(s) || downgradeRandomBuilding(s);
    else penalty = downgradeRandomBuilding(s) || losePopulation(s) || loseRandomMaterial(s);
    return penalty || { kind: 'none' };
  }
  function resetInvasion(state) {
    if (!state) return;
    state.invasionThreat = 0;
    state.invasionCooldown = 0;
    state.invasionWarning = 0;
    state.invasionWarningPending = false;
  }
  /* 战争结果轻量提示（2026-11-11）：把结构化结算结果通知给 UI 层弹 toast。
     ⚠️ 逻辑层只发通知、绝不碰 DOM —— 无 UI 环境（loadNoDom / 纯规则探针）自动 no-op。
     ⚠️ 提示层异常绝不能影响结算本身：整段 try/catch 吞掉，事件日志照常写。
     ⚠️ 离线补算不在这里弹（报表 modal 尚未渲染），由 drainInvasionReports 以
        {offline:true} 统一补显，避免同一份报告弹两次。 */
  function notifyWarToast(kind, payload, opts) {
    if (!SB.ui || typeof SB.ui.showWarToast !== 'function') return;
    try { SB.ui.showWarToast(kind, payload, opts || null); }
    catch (e) { /* 提示失败不影响结算 */ }
  }
  function emitInvasionReport(state, report, emit, offlineCatchup) {
    if (offlineCatchup) {
      state.invasionReports.push(report);
      state.offlineInvasionResolved = true;
      return;
    }
    if (emit) invasionReportMessages(report).forEach(emit);
    notifyWarToast('invasion', report);
  }
  function resolveInvasion(s, state, enemy, emit, offlineCatchup) {
    var chance = enemySuccessChance(s, enemy), scaleBefore = currentScale(enemy), succeeded = randomValue() < chance;
    var report = {
      type: succeeded ? 'success' : 'repelled', enemyNameKey: enemy.nameKey,
      enemySuccessPercent: Math.round(chance * 100)
    };
    if (succeeded) {
      enemy.currentScale = Math.max(0, scaleBefore * 0.80);
      report.scaleLoss = scaleBefore - enemy.currentScale;
      report.penalty = applyInvasionPenalty(s);
    } else {
      enemy.currentScale = Math.max(0, scaleBefore * 0.90);
      report.scaleLoss = scaleBefore - enemy.currentScale;
    }
    state.invasionThreat = 0;
    state.invasionWarning = 0;
    state.invasionWarningPending = false;
    state.invasionCooldown = INVASION_COOLDOWN_SECONDS;
    emitInvasionReport(state, report, emit, offlineCatchup);
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
  }
  function beginInvasionWarning(s, state, enemy, emit) {
    if (state.invasionWarningPending) return;
    state.invasionWarning = INVASION_WARNING_SECONDS;
    state.invasionWarningPending = true;
    var maxScale = effectiveMaxScale(enemy);
    var threatRate = maxScale > 0 ? clamp(currentScale(enemy) / maxScale, 0, 1) : 0;
    var threatTime = threatRate > 0
      ? Math.max(0, (INVASION_CYCLE_SECONDS - state.invasionThreat) / threatRate) : Infinity;
    if (emit) emit(translated('ui.war.invasion.warning', {
      enemyName: translated(enemy.nameKey), countdown: SB.game && SB.game.fmtDur
        ? SB.game.fmtDur(Math.max(INVASION_WARNING_SECONDS, state.invasionCooldown, threatTime))
        : String(Math.max(INVASION_WARNING_SECONDS, state.invasionCooldown, threatTime)),
      enemySuccessPercent: Math.round(enemySuccessChance(s, enemy) * 100)
    }));
  }
  function advanceInvasion(s, elapsed, emit, offlineCatchup, scaleAtStart) {
    var state = ensureState(s), enemy = currentEnemy(s), remaining = elapsed;
    if (!state) return;
    if (!offlineCatchup) state.offlineInvasionResolved = false;
    if (!s.civics || !s.civics.military_training) { resetInvasion(state); return; }
    if (!enemy || !enemyAvailable(state, enemy)) { resetInvasion(state); return; }
    if (offlineCatchup && state.offlineInvasionResolved) return;
    if (!(Number(scaleAtStart) > 0)) {
      state.invasionThreat = 0;
      state.invasionWarning = 0;
      state.invasionWarningPending = false;
      state.invasionCooldown = Math.max(0, state.invasionCooldown - elapsed);
      return;
    }
    var maxScale = effectiveMaxScale(enemy);
    if (!(maxScale > 0)) return;
    var currentStrength = currentScale(enemy);
    var threatRate = clamp(((Number(scaleAtStart) + currentStrength) / 2) / maxScale, 0, 1);
    var warningAt = invasionWarningThreshold(threatRate);
    while (remaining > 1e-9) {
      if (offlineCatchup && state.offlineInvasionResolved) return;
      if (state.invasionWarningPending) {
        var threatTimeRemaining = threatRate > 0
          ? Math.max(0, (INVASION_CYCLE_SECONDS - state.invasionThreat) / threatRate) : Infinity;
        var resolveInSeconds = Math.max(state.invasionWarning, state.invasionCooldown, threatTimeRemaining);
        if (resolveInSeconds <= 1e-9) {
          resolveInvasion(s, state, enemy, emit, offlineCatchup);
          return;
        }
        var pendingStep = Math.min(remaining, resolveInSeconds);
        state.invasionThreat = Math.min(INVASION_CYCLE_SECONDS, state.invasionThreat + threatRate * pendingStep);
        state.invasionWarning = Math.max(0, state.invasionWarning - pendingStep);
        state.invasionCooldown = Math.max(0, state.invasionCooldown - pendingStep);
        remaining -= pendingStep;
        if (state.invasionWarning <= 1e-9 && state.invasionCooldown <= 1e-9 &&
            state.invasionThreat >= INVASION_CYCLE_SECONDS - 1e-9) {
          resolveInvasion(s, state, enemy, emit, offlineCatchup);
          return;
        }
        if (pendingStep <= 1e-9) return;
        continue;
      }
      if (state.invasionThreat >= warningAt - 1e-9) {
        beginInvasionWarning(s, state, enemy, emit);
        continue;
      }
      var timeToWarning = threatRate > 0
        ? Math.max(0, (warningAt - state.invasionThreat) / threatRate) : Infinity;
      var step = Math.min(remaining, timeToWarning);
      if (state.invasionCooldown > 0) step = Math.min(step, state.invasionCooldown);
      if (!(step > 1e-9)) {
        if (state.invasionCooldown <= 1e-9) {
          state.invasionThreat = warningAt;
          continue;
        }
        return;
      }
      state.invasionThreat = Math.min(INVASION_CYCLE_SECONDS, state.invasionThreat + threatRate * step);
      state.invasionCooldown = Math.max(0, state.invasionCooldown - step);
      remaining -= step;
      if (state.invasionThreat >= warningAt - 1e-9)
        beginInvasionWarning(s, state, enemy, emit);
    }
  }
  function drainInvasionReports(s) {
    var state = ensureState(s);
    if (!state) return [];
    var hadReports = state.invasionReports.length > 0, wasResolvedOffline = state.offlineInvasionResolved;
    var reports = state.invasionReports.splice(0), messages = [];
    for (var i = 0; i < reports.length; i++) {
      messages = messages.concat(invasionReportMessages(reports[i]));
      /* 离线补算的入侵结果也要让玩家看见：以 offline 标记延迟弹（等报表 modal 先渲染）。
         ⚠️ 最多一次入侵结算，所以这里 normally 0~1 条，不会刷屏。 */
      notifyWarToast('invasion', reports[i], { offline: true });
    }
    if (state.offlineInvasionResolved) {
      resetInvasion(state);
      state.offlineInvasionResolved = false;
    }
    if ((hadReports || wasResolvedOffline) && SB.game && SB.game.markDirty) SB.game.markDirty();
    return messages;
  }

  function fortressProbabilityAdjustment(s) {
    var B = SB.BLD || {};
    var level = nonNegative(s && s.lvl && s.lvl.fortress);
    return {
      failure: -level * nonNegative(B.fortressFailureChanceChangePerLevel),
      success: level * nonNegative(B.fortressSuccessChanceChangePerLevel),
      failureFloor: nonNegative(B.fortressFailureChanceFloor)
    };
  }
  function policyEquipped(s, cardId) {
    /* 传承旁路（2026-11-11）：传承卡不写 s.cards，但战争规则读点要认它。
     * ⚠️ 只挂在 war.js 内部这个判据上，**绝不改 SB.civic.cardEffective** ——
     *    后者被政策卡库 UI / economy.polHasCard / ai-strategy 共用，改了会串味。
     *    policyNumber 直接读 POLICIES 表字段、不看 s.cards，数值源天然唯一。 */
    if (SB.heritage && SB.heritage.has && SB.heritage.has(s, cardId)) return true;
    return !!(SB.civic && SB.civic.cardEffective && SB.civic.cardEffective(s, cardId));
  }
  function policyNumber(s, cardId, field, fallback) {
    var policy = SB.civic && SB.civic.policyById ? SB.civic.policyById(cardId) : null;
    return policy && (typeof policy[field] === 'number' || Array.isArray(policy[field])) ? policy[field] : fallback;
  }
  function policyProbabilityModifiers(s, actionId) {
    var mods = { failure: 0, success: 0, greatSuccess: 0 };
    if ((actionId === 'raid' && policyEquipped(s, 'card_sweep'))
        || (actionId === 'totalWar' && policyEquipped(s, 'card_scorched_earth'))) {
      mods.failure -= 0.10; mods.success += 0.05; mods.greatSuccess += 0.05;
    }
    if (wonderOwned(s, 'wonder_victory_monument')) {
      mods.failure += wonderEffectValue('wonder_victory_monument', 'militaryFailureChanceChange', -0.05);
      mods.greatSuccess += wonderEffectValue('wonder_victory_monument', 'militaryGreatSuccessChanceChange', 0.05);
    }
    return mods;
  }
  function actionProbabilities(s, actionId, modifiers) {
    var spec = ACTIONS[actionId];
    if (!spec) return null;
    var mods = policyProbabilityModifiers(s, actionId) || {};
    modifiers = modifiers || {};
    var odds = {
      failure: spec.outcomes.failure.chance + (Number(mods.failure) || 0) + (Number(modifiers.failure) || 0),
      success: spec.outcomes.success.chance + (Number(mods.success) || 0) + (Number(modifiers.success) || 0),
      greatSuccess: spec.outcomes.greatSuccess.chance + (Number(mods.greatSuccess) || 0) + (Number(modifiers.greatSuccess) || 0)
    };
    var fortress = fortressProbabilityAdjustment(s);
    var B = SB.BLD || {};
    var level = nonNegative(s && s.lvl && s.lvl.fortress);
    var nominalDelta = level * nonNegative(B.fortressFailureChanceChangePerLevel);
    var floor = Math.max(0, fortress.failureFloor);
    var actualDelta = Math.min(nominalDelta, Math.max(0, odds.failure - floor));
    odds.failure -= actualDelta;
    odds.success += actualDelta;
    odds.failure = Math.max(floor, odds.failure);
    odds.success = Math.max(0, odds.success);
    odds.greatSuccess = Math.max(0, odds.greatSuccess);
    var total = odds.failure + odds.success + odds.greatSuccess;
    if (total <= 0) return null;
    /* Policy adjustments are applied as percentage points. Normalize defensively to keep a valid roll. */
    odds.failure /= total;
    odds.success /= total;
    odds.greatSuccess /= total;
    return odds;
  }
  function actionCost(s, enemy, actionId, extraCostMul) {
    var spec = ACTIONS[actionId], maxScale = effectiveMaxScale(enemy);
    if (!spec || maxScale <= 0) return 0;
    var faithMul = SB.faith && SB.faith.militaryActionCostMul
      ? SB.faith.militaryActionCostMul(s, actionId === 'totalWar' ? 'total-war' : actionId) : 1;
    var routeLevel = clamp(Math.floor(nonNegative(s && s.war && s.war.tradeRouteLevel)), 0, 3);
    var routeDiscounts = policyEquipped(s, 'card_official_business')
      ? policyNumber(s, 'card_official_business', 'tradeRouteWarCostDiscounts', [0, 0.06, 0.16, 0.30])
      : policyEquipped(s, 'card_trade_intelligence')
        ? policyNumber(s, 'card_trade_intelligence', 'tradeRouteWarCostDiscounts', [0, 0.03, 0.08, 0.15])
        : [0, 0, 0, 0];
    var routeMul = 1 - routeDiscounts[routeLevel];
    var intelligenceMul = wonderOwned(s, 'wonder_military_intelligence_bureau')
      ? wonderEffectValue('wonder_military_intelligence_bureau', 'militaryActionCostMul', 0.80) : 1;
    var extra = (typeof extraCostMul === 'number' && isFinite(extraCostMul) && extraCostMul >= 0) ? extraCostMul : 1;
    return maxScale * spec.costShare * faithMul * routeMul * intelligenceMul * extra;
  }
  function establishTradeRoute(s) {
    var state = ensureState(s);
    if (!state || !s.civics || !s.civics.trade) return { ok: false, reason: 'locked' };
    if (state.tradeRouteLevel >= 3) return { ok: false, reason: 'max_level' };
    var cost = 300 * Math.pow(3, state.tradeRouteLevel);
    if (!s.res || nonNegative(s.res.stone) < cost) return { ok: false, reason: 'insufficient_resource', cost: cost };
    s.res.stone -= cost;
    state.tradeRouteLevel++;
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    return { ok: true, level: state.tradeRouteLevel, cost: cost };
  }
  function tradeRouteLuxuryUseMul(s) {
    var level = clamp(Math.floor(nonNegative(s && s.war && s.war.tradeRouteLevel)), 0, 3);
    return Math.max(0, 1 - level * 0.05);
  }
  function tradeRouteQuote(s) {
    var level = clamp(Math.floor(nonNegative(s && s.war && s.war.tradeRouteLevel)), 0, 3);
    return { level: level, nextLevel: Math.min(3, level + 1), cost: level < 3 ? 300 * Math.pow(3, level) : 0 };
  }
  function softPowerCost(s, enemy, actionId) {
    if (!enemy || (actionId !== 'faith' && actionId !== 'culture')) return 0;
    var actions = actionId === 'faith' ? enemy.faithActions : enemy.cultureActions;
    var cost = 1000 * Math.pow(1.5, Math.floor(nonNegative(actions)));
    if (actionId === 'faith' && SB.faith && SB.faith.scaleCapFaithCostMul) cost *= SB.faith.scaleCapFaithCostMul(s);
    if (actionId === 'culture') {
      var discount = 0;
      if (policyEquipped(s, 'card_tour_performance')) {
        discount += nonNegative(s && s.lvl && s.lvl.museum)
          * policyNumber(s, 'card_tour_performance', 'cultureCostDiscountPerMuseumLevel', 0.01);
      }
      if (policyEquipped(s, 'card_overseas_advertising')) {
        var builtWonders = SB.wonder && SB.wonder.count ? SB.wonder.count(s) : 0;
        discount += nonNegative(builtWonders)
          * policyNumber(s, 'card_overseas_advertising', 'cultureCostDiscountPerWonder', 0.01);
      }
      cost *= Math.max(0, 1 - discount);
    }
    return cost;
  }
  function executeSoftPowerAction(s, enemyId, actionId, options) {
    var state = ensureState(s), enemy = enemyOf(s, enemyId), opts = options || {};
    var isFaith = actionId === 'faith', isCulture = actionId === 'culture';
    if (!enemyAvailable(state, enemy) || currentScale(enemy) <= 0 || (!isFaith && !isCulture))
      return { ok: false, reason: 'unavailable' };
    var civicId = isFaith ? 'sovereign' : 'drama';
    if (!s.civics || !s.civics[civicId]) return { ok: false, reason: 'locked' };
    var channel = isFaith ? 'faithReduction' : 'cultureReduction';
    var attemptsKey = isFaith ? 'faithActions' : 'cultureActions';
    if (nonNegative(enemy[channel]) >= 0.30) return { ok: false, reason: 'reduction_cap' };
    var cost = softPowerCost(s, enemy, actionId);
    if (typeof opts.costMultiplier === 'number' && isFinite(opts.costMultiplier) && opts.costMultiplier >= 0)
      cost *= opts.costMultiplier;
    var resourceId = isFaith ? 'faith' : 'culture';
    if (!s.res || nonNegative(s.res[resourceId]) + 1e-9 < cost)
      return { ok: false, reason: 'insufficient_resource', cost: cost, resourceId: resourceId };
    var probabilities = { failure: 0.25, success: 0.50, greatSuccess: 0.25 };
    var outcomeId = rollOutcome(probabilities, opts.random);
    var share = outcomeId === 'failure' ? 0.005 : outcomeId === 'success' ? 0.015 : 0.03;
    s.res[resourceId] = Math.max(0, nonNegative(s.res[resourceId]) - cost);
    enemy[attemptsKey] = Math.floor(nonNegative(enemy[attemptsKey])) + 1;
    var appliedReduction = reduceEnemyCap(enemy, channel, share);
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    return {
      ok: true, action: actionId, outcome: outcomeId, cost: cost,
      probabilities: probabilities, requestedReduction: share,
      appliedReduction: appliedReduction, maxScale: effectiveMaxScale(enemy),
      currentScale: currentScale(enemy)
    };
  }
  function mirrorBuilt(s) { return wonderOwned(s, 'wonder_sun_mirror_array'); }
  /* Annexation scales from the remaining enemy strength, so reducing it through
   * combat lowers the quote; at zero strength the nation is already defeated. */
  function annexCost(enemy, hasMirror) {
    return currentScale(enemy) * (hasMirror ? wonderEffectValue('wonder_sun_mirror_array', 'annexPowerCostMultiplier', 3) : 5);
  }
  function annexMultiplier(s) {
    return mirrorBuilt(s) ? wonderEffectValue('wonder_sun_mirror_array', 'annexPowerCostMultiplier', 3) : 5;
  }
  function annexEnemy(s, enemyId, hasMirrorOverride) {
    var state = ensureState(s), enemy = enemyOf(s, enemyId);
    if (!enemyAvailable(state, enemy)) return { ok: false, reason: 'unavailable' };
    if (enemy.stage !== state.campaignStage + 1) return { ok: false, reason: 'stage_locked' };
    var cost = annexCost(enemy, hasMirrorOverride === true || (hasMirrorOverride !== false && mirrorBuilt(s)));
    if (state.power + 1e-9 < cost) return { ok: false, reason: 'insufficient_power', cost: cost };
    state.power = Math.max(0, state.power - cost);
    var capAward = Math.max(0, nonNegative(enemy.popCapPool) - nonNegative(enemy.popCapClaimed));
    enemy.popCapClaimed += capAward;
    state.popCap += capAward;
    enemy.status = 'annexed';
    state.campaignStage = enemy.stage;
    resetInvasion(state);
    state.offlineInvasionResolved = false;
    state.invasionReports = [];
    syncCampaign(s);
    /* 吞并成功 → 从对应纪元窗发一张「传承」三选一榜（状态进 s.war.heritage.pending）。
     * 破壳后 s.broken 不解散本局，吞并照样发生 ⇒ 这里不设 broken 门。 */
    var heritageDraft = (SB.heritage && SB.heritage.onAnnex)
      ? SB.heritage.onAnnex(s, state.campaignStage) : null;
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    return { ok: true, cost: cost, populationCapAward: capAward, campaignStage: state.campaignStage,
      productionBonusPercent: 1, totalProductionBonusPercent: conquestBonusPercent(s),
      heritageDraft: heritageDraft };
  }
  function grossResourceRate(s, resourceId) {
    if (!s || !resourceId || !SB.economy) return 0;
    if (SB.economy.resUnlocked && !SB.economy.resUnlocked(s, resourceId)) return 0;
    if (SB.economyRateParts && SB.economyRateParts.rateParts) {
      var detail = SB.economyRateParts.rateParts(s).parts[resourceId] || [];
      var gross = 0;
      for (var i = 0; i < detail.length; i++) if (detail[i] && detail[i].v > 0) gross += detail[i].v;
      return isFinite(gross) ? gross : 0;
    }
    var rates = SB.economy.rates ? SB.economy.rates(s) : {};
    return Math.max(0, Number(rates && rates[resourceId]) || 0);
  }
  function lootResourceCandidates(s) {
    var candidates = [], resources = SB.RESS || {};
    if (!SB.economy || !SB.economy.resUnlocked) return candidates;
    for (var id in resources) if (Object.prototype.hasOwnProperty.call(resources, id)) {
      var definition = resources[id];
      if (!definition || definition.kind === 'craft' || definition.flow) continue;
      if (SB.economy.resUnlocked(s, id) && grossResourceRate(s, id) > 0) candidates.push(id);
    }
    return candidates;
  }
  function rollOutcome(probabilities, rng) {
    if (!probabilities) return null;
    var roll = typeof rng === 'function' ? Number(rng()) : randomValue();
    if (!isFinite(roll)) roll = randomValue();
    roll = clamp(roll, 0, 1 - Number.EPSILON);
    if (roll < probabilities.failure) return 'failure';
    if (roll < probabilities.failure + probabilities.success) return 'success';
    return 'greatSuccess';
  }
  function executeAction(s, enemyId, actionId, options) {
    var state = ensureState(s), enemy = enemyOf(s, enemyId), spec = ACTIONS[actionId];
    var opts = options || {};
    if (!enemyAvailable(state, enemy) || currentScale(enemy) <= 0 || !spec) return { ok: false, reason: 'unavailable' };
    if (!s.civics || !s.civics[spec.unlockCivic]) return { ok: false, reason: 'locked' };
    var cost = actionCost(s, enemy, actionId, opts.costMultiplier);
    if (!(cost > 0) || state.power + 1e-9 < cost) return { ok: false, reason: 'insufficient_power', cost: cost };
    var resourceId = randomItem(lootResourceCandidates(s));
    if (!resourceId) return { ok: false, reason: 'no_loot_resource' };
    var lootRateBeforeAction = grossResourceRate(s, resourceId);
    var modifiers = opts.probabilityModifiers || {};
    var odds = actionProbabilities(s, actionId, modifiers);
    var outcomeId = rollOutcome(odds, opts.random);
    if (!outcomeId) return { ok: false, reason: 'invalid_odds' };
    var result = spec.outcomes[outcomeId];
    state.power = Math.max(0, state.power - cost);
    var refund = outcomeId === 'failure' && SB.faith && SB.faith.failedMilitaryRefund
      ? SB.faith.failedMilitaryRefund(s, cost) : 0;
    state.power += refund;
    var enemyScaleDamageBonus = SB.economy && SB.economy.upgSum
      ? nonNegative(SB.economy.upgSum(s, 'militaryEnemyScaleDamageBonus')) : 0;
    var scaleLoss = cost * result.scaleLoss;
    if (outcomeId !== 'failure' && SB.faith && SB.faith.successfulWarScaleReduction)
      scaleLoss += SB.faith.successfulWarScaleReduction(s, currentScale(enemy));
    scaleLoss *= 1 + enemyScaleDamageBonus;
    var scaleBefore = currentScale(enemy);
    enemy.currentScale = Math.max(0, scaleBefore - scaleLoss);
    var soldiersBefore = nonNegative(s.jobs && s.jobs.soldier);
    var soldierLossRate = outcomeId !== 'failure' && policyEquipped(s, 'card_victory_day_parade')
      ? 0 : result.soldierLoss;
    var soldiersLost = Math.min(soldiersBefore, Math.round(soldiersBefore * soldierLossRate));
    if (soldiersLost > 0) {
      s.jobs.soldier = soldiersBefore - soldiersLost;
      s.pop = Math.max(0, nonNegative(s.pop) - soldiersLost);
    }
    var capAward = Math.min(result.popCap, Math.max(0, nonNegative(enemy.popCapPool) - nonNegative(enemy.popCapClaimed)));
    enemy.popCapClaimed = nonNegative(enemy.popCapClaimed) + capAward;
    state.popCap += capAward;
    var resourceRate = outcomeId === 'failure' && opts.lootOnFailure !== true ? 0 : lootRateBeforeAction;
    var lootAmount = resourceRate * spec.lootSeconds;
    var resourceBefore = nonNegative(s.res && s.res[resourceId]);
    if (lootAmount > 0 && SB.economy.addRes) SB.economy.addRes(s, resourceId, lootAmount);
    var actualLoot = Math.max(0, nonNegative(s.res && s.res[resourceId]) - resourceBefore);
    state.tradeRouteLevel = 0;
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    var result = {
      ok: true, action: actionId, outcome: outcomeId, cost: cost, refund: refund,
      probabilities: odds, scaleBefore: scaleBefore, scaleLoss: scaleLoss,
      scaleAfter: enemy.currentScale, soldiersLost: soldiersLost,
      populationCapAward: capAward, resourceId: resourceId,
      resourceRate: resourceRate, lootAmount: actualLoot
    };
    /* 结算点即唯一反馈落点：玩家点击（input.js）与 aibot 都走这里，
       不会出现「界面点了有提示、模拟跑起来没有」的分叉。 */
    notifyWarToast('action', result);
    return result;
  }

  SB.war = {
    ACTIONS: ACTIONS,
    ENEMIES: ENEMIES.map(function (enemy) { return { id: enemy.id, stage: enemy.stage, baseScale: enemy.baseScale, popCapPool: enemy.popCapPool }; }),
    POP_CAP_POOLS: POP_CAP_POOLS.slice(),
    ENEMY_NAME_KEYS: ENEMY_NAME_KEYS.slice(),
    ENEMY_NAME_POOLS: Object.keys(ENEMY_NAME_POOLS).reduce(function (pools, stage) {
      pools[stage] = ENEMY_NAME_POOLS[stage].slice();
      return pools;
    }, {}),
    RECOVERY_PER_SECOND: RECOVERY_PER_SECOND,
    INVASION_CYCLE_SECONDS: INVASION_CYCLE_SECONDS,
    INVASION_WARNING_SECONDS: INVASION_WARNING_SECONDS,
    INVASION_COOLDOWN_SECONDS: INVASION_COOLDOWN_SECONDS,
    power: power,
    rate: rate,
    lootResourceCandidates: lootResourceCandidates,
    conquestBonusPercent: conquestBonusPercent,
    conquestProductionMultiplier: conquestProductionMultiplier,
    tick: tick,
    effectiveMaxScale: effectiveMaxScale,
    currentScale: currentScale,
    registerEnemy: registerEnemy,
    enemy: enemyOf,
    currentEnemy: currentEnemy,
    invasionStatus: invasionStatus,
    /* 供 ui/war-toast.js 复用：toast 正文与事件日志必须是同一份译文，不另造口径。 */
    invasionReportMessages: invasionReportMessages,
    drainInvasionReports: drainInvasionReports,
    syncCampaign: syncCampaign,
    mirrorBuilt: mirrorBuilt,
    annexMultiplier: annexMultiplier,
    reduceEnemyCap: reduceEnemyCap,
    recoverEnemy: recoverEnemy,
    recoverEnemies: recoverEnemies,
    actionProbabilities: actionProbabilities,
    fortressProbabilityAdjustment: fortressProbabilityAdjustment,
    actionCost: actionCost,
    establishTradeRoute: establishTradeRoute,
    tradeRouteLuxuryUseMul: tradeRouteLuxuryUseMul,
    tradeRouteQuote: tradeRouteQuote,
    softPowerCost: softPowerCost,
    executeSoftPowerAction: executeSoftPowerAction,
    annexCost: annexCost,
    annexEnemy: annexEnemy,
    /* 传承择取的唯一逻辑入口（2026-11-11）：UI 只调它，choose 逻辑不散到 input / render。 */
    chooseHeritage: function (s, pendingIndex, cardId) {
      return SB.heritage && SB.heritage.choose ? SB.heritage.choose(s, pendingIndex, cardId) : false;
    },
    grossResourceRate: grossResourceRate,
    executeAction: executeAction,
    populationCapBonus: function (s) { return nonNegative(s && s.war && s.war.popCap); },
    soldierBaseRate: function () { return nonNegative(SB.BLD && SB.BLD.soldierMilitaryPower); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
