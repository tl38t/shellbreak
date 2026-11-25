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
  /* 终末危机（ERA11/12）：每局在掀起帘幕后从三类中随机选一类。
   * 基准直接引用七阶敌国规模：15,625,000 × 15 = 234,375,000。 */
  var CRISIS_SCALE_MULTIPLIER = 15;
  var CRISIS_BASE_SCALE = ENEMIES[ENEMIES.length - 1].baseScale * CRISIS_SCALE_MULTIPLIER;
  var CRISIS_PRODUCTION_MUL = 0.70;
  var CRISIS_HYDRO_ADDITIONAL_MUL = 0.70;
  var CRISIS_POPULATION_CAP_MUL = 0.67;
  var CRISIS_TYPES = [
    { id: 'horde', nameKey: 'ui.crisis.name.horde' },
    { id: 'machine', nameKey: 'ui.crisis.name.machine' },
    { id: 'voidwalker', nameKey: 'ui.crisis.name.voidwalker' }
  ];
  /* 2026-11-12：soldierLoss（军人比率损失）改为 popLoss（国家人口比率损失）。
   * 目的：失败/成功的损失不再可被「行动前把军人调去别的岗位」规避 —— 损失按总人口 ceil(pop × popLoss) 计，
   *   无论军人怎么调配都发生。数值由用户拍板：8% 对应最危险档（invasion/totalWar 失败，原 soldierLoss=1.0），
   *   其余按原 success/greatSuccess 比例等比缩放（缩放因子 0.08）。 */
  var ACTIONS = {
    raid: {
      costShare: 0.05, lootSeconds: 60, unlockCivic: 'military_training',
      outcomes: {
        failure: { chance: 0.25, scaleLoss: 0.30, popLoss: 0.04, popCap: 0 },
        success: { chance: 0.70, scaleLoss: 0.70, popLoss: 0.016, popCap: 0 },
        greatSuccess: { chance: 0.05, scaleLoss: 1.00, popLoss: 0, popCap: 1 }
      }
    },
    invasion: {
      costShare: 0.15, lootSeconds: 300, unlockCivic: 'professional_army',
      outcomes: {
        failure: { chance: 0.35, scaleLoss: 0.50, popLoss: 0.08, popCap: 0 },
        success: { chance: 0.60, scaleLoss: 0.80, popLoss: 0.04, popCap: 0 },
        greatSuccess: { chance: 0.05, scaleLoss: 1.20, popLoss: 0.016, popCap: 2 }
      }
    },
    totalWar: {
      costShare: 0.30, lootSeconds: 600, unlockCivic: 'mobilization',
      outcomes: {
        failure: { chance: 0.40, scaleLoss: 0.70, popLoss: 0.08, popCap: 0 },
        success: { chance: 0.55, scaleLoss: 1.20, popLoss: 0.04, popCap: 0 },
        greatSuccess: { chance: 0.05, scaleLoss: 1.50, popLoss: 0.016, popCap: 3 }
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
    var barracksBonusMul = policyEquipped(s, 'card_pan_galactic_defense') ? policyNumber(s, 'card_pan_galactic_defense', 'barracksBonusMul', 3)
      : policyEquipped(s, 'card_fleet_review') ? policyNumber(s, 'card_fleet_review', 'barracksBonusMul', 1.5)
      : policyEquipped(s, 'card_mercenary') ? policyNumber(s, 'card_mercenary', 'barracksBonusMul', 1)
        : policyEquipped(s, 'card_drill') ? policyNumber(s, 'card_drill', 'barracksBonusMul', 0.5) : 0;
    var soldierOutput = soldiers * baseSoldierRate * (1 + barracksLevel * barracksBonus * (1 + barracksBonusMul));
    /* 早打大打打核大战通关奖励（2026-11-12）：士兵职业产出 +15% 永久生效。 */
    var soldierChallengeMul = (SB.challenges && SB.challenges.soldierOutputMul) ? SB.challenges.soldierOutputMul(s) : 1;
    soldierOutput *= soldierChallengeMul;
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
    /* 2026-11-14「军契」三级：与 economy.js:1016-1053 的 xxPact 同口径
     * （s.perk.soldierPact 是级数，每级 10%）。⚠️ 只乘士兵这一项，不乘军校项、
     * 不碰 folk.effJobs（effJobs 已吃族民通用产出乘区，重复乘会与 starFolk 双算）。
     * powerParts() 必须同步这一行，否则「分项之和 ≠ 净值」（见 :206）。 */
    var soldierPactMul = 1 + 0.10 * nonNegative(s && s.perk && s.perk.soldierPact);
    /* 硅基承续 · 鳞/手（2026-11-17）：军人产出军力 +50/100/200%。与军契**相乘**（军契是级数加法轴）。 */
    if (SB.veilFx) soldierPactMul *= (1 + SB.veilFx.soldierPactPct())
      * (SB.veilFx.geneValorMul ? SB.veilFx.geneValorMul() : 1);
    var domainSoldierMul = SB.voidFx && SB.voidFx.domainSoldierMul ? SB.voidFx.domainSoldierMul() : 1;
    var domainFortressMul = SB.voidFx && SB.voidFx.domainFortressMul ? SB.voidFx.domainFortressMul(s) : 1;
    var creedMilitaryMul = SB.faith && SB.faith.creedMilitaryMul ? SB.faith.creedMilitaryMul(s) : 1;
    soldierOutput *= soldierPactMul * domainSoldierMul * domainFortressMul * creedMilitaryMul;
    var academyOutput = nonNegative(s.pop) * academyLevel * nonNegative(B.militaryAcademyPowerPerPopulationPerLevel);
    var cloneOutput = nonNegative(s.pop) * nonNegative(s.perk && s.perk.cloneMilitaryPowerPerPopulation);
    var total = (soldierOutput + academyOutput + cloneOutput) * conquestProductionMultiplier(s)
      * (SB.civic && SB.civic.militaryOutputMul ? SB.civic.militaryOutputMul(s) : 1);
    return isFinite(total) ? Math.max(0, total) : 0;
  }
  /* 军力来源分项（顶栏资源详情弹窗用）。格式与 economy.ratesParts 的 parts 对齐：
   * 每项 { l:来源名, v:最终值, b:基数, m:[[乘区名,倍率],...] }；partRow 据此渲染「基数 × 各乘区」。
   * 军力无逐 tick 消耗分项（只在战争行动中一次性扣减），故只返回产出分项；
   * 三项 v 均已含征服生产乘区，使「分项之和 === 净值(rate)」结构一致。
   * ⚠️ 整段复刻 rate() 的算式（不调用 rate()，以免把 soldierOutput 拆开）；
   *   若将来 rate() 改军工力公式，此处须同步。 */
  function powerParts(s) {
    if (!s) return [];
    var B = SB.BLD || {};
    var jobs = SB.folk && SB.folk.effJobs ? SB.folk.effJobs(s) : (s.jobs || {});
    var soldiers = nonNegative(jobs.soldier);
    var barracksLevel = nonNegative(s.lvl && s.lvl.barracks);
    var academyLevel = nonNegative(s.lvl && s.lvl.military_academy);
    var baseSoldierRate = nonNegative(B.soldierMilitaryPower);
    var barracksBonus = nonNegative(B.barracksMilitaryBonusPerLevel);
    var barracksBonusMul = policyEquipped(s, 'card_pan_galactic_defense') ? policyNumber(s, 'card_pan_galactic_defense', 'barracksBonusMul', 3)
      : policyEquipped(s, 'card_fleet_review') ? policyNumber(s, 'card_fleet_review', 'barracksBonusMul', 1.5)
      : policyEquipped(s, 'card_mercenary') ? policyNumber(s, 'card_mercenary', 'barracksBonusMul', 1)
        : policyEquipped(s, 'card_drill') ? policyNumber(s, 'card_drill', 'barracksBonusMul', 0.5) : 0;
    var soldierBase = soldiers * baseSoldierRate;
    var barracksFactor = 1 + barracksLevel * barracksBonus * (1 + barracksBonusMul);
    var soldierOutput = soldierBase * barracksFactor;
    var soldierChallengeMul = (SB.challenges && SB.challenges.soldierOutputMul) ? SB.challenges.soldierOutputMul(s) : 1;
    soldierOutput *= soldierChallengeMul;
    var soldierUpgradeBonus = SB.economy && SB.economy.upgSum ? nonNegative(SB.economy.upgSum(s, 'militarySoldierBonus')) : 0;
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
    /* 工坊升级(加成)与上帝之杖(奇观)同为加法叠加，合成一个乘区 chip，保证 b×m===v。 */
    var soldierBonusFactor = 1 + soldierUpgradeBonus + soldierWonderBonus;
    soldierOutput *= soldierBonusFactor;
    /* 与 rate() 同一行、同一系数（2026-11-14 军契）：b×m 必须仍等于 v。 */
    var soldierPactMul = 1 + 0.10 * nonNegative(s && s.perk && s.perk.soldierPact);
    /* 与 rate() 同一行、同一系数（硅基承续 · 鳞/手）：b×m 必须仍等于 v，漏这里就是面板撒谎。 */
    if (SB.veilFx) soldierPactMul *= (1 + SB.veilFx.soldierPactPct())
      * (SB.veilFx.geneValorMul ? SB.veilFx.geneValorMul() : 1);
    var domainSoldierMul = SB.voidFx && SB.voidFx.domainSoldierMul ? SB.voidFx.domainSoldierMul() : 1;
    var domainFortressMul = SB.voidFx && SB.voidFx.domainFortressMul ? SB.voidFx.domainFortressMul(s) : 1;
    var creedMilitaryMul = SB.faith && SB.faith.creedMilitaryMul ? SB.faith.creedMilitaryMul(s) : 1;
    soldierOutput *= soldierPactMul * domainSoldierMul * domainFortressMul * creedMilitaryMul;
    var academyOutput = nonNegative(s.pop) * academyLevel * nonNegative(B.militaryAcademyPowerPerPopulationPerLevel);
    var cloneOutput = nonNegative(s.pop) * nonNegative(s.perk && s.perk.cloneMilitaryPowerPerPopulation);
    var conquestMul = conquestProductionMultiplier(s);
    var civicMilitaryMul = SB.civic && SB.civic.militaryOutputMul ? SB.civic.militaryOutputMul(s) : 1;
    var militaryLabel = tr('civic.data.galactic_council.name', null, '银河议会');
    var parts = [];
    if (soldierBase > 0) {
      var sm = [];
      if (barracksFactor !== 1) sm.push([tr('building.barracks.name'), barracksFactor]);
      if (soldierChallengeMul !== 1) sm.push([tr('challenge.definition.totalwar_doctrine.name'), soldierChallengeMul]);
      if (soldierBonusFactor !== 1) sm.push([tr('ui.resource.detail.power.soldier_bonus'), soldierBonusFactor]);
      if (soldierPactMul !== 1) sm.push([tr('ui.resource.detail.power.soldier_pact', null, '军契'), soldierPactMul]);
      if (domainSoldierMul !== 1) sm.push([tr('domain.warlord.name'), domainSoldierMul]);
      if (domainFortressMul !== 1) sm.push([tr('building.fortress.name'), domainFortressMul]);
      if (creedMilitaryMul !== 1) sm.push([tr('faith.tenet.creed_bingkui.name'), creedMilitaryMul]);
      if (conquestMul !== 1) sm.push([tr('ui.resource.detail.power.conquest'), conquestMul]);
      if (civicMilitaryMul !== 1) sm.push([militaryLabel, civicMilitaryMul]);
      parts.push({ l: tr('job.soldier.name'), v: soldierOutput * conquestMul * civicMilitaryMul, b: soldierBase, m: sm });
    }
    if (academyOutput > 0) {
      var am = [];
      if (conquestMul !== 1) am.push([tr('ui.resource.detail.power.conquest'), conquestMul]);
      if (civicMilitaryMul !== 1) am.push([militaryLabel, civicMilitaryMul]);
      parts.push({ l: tr('building.military_academy.name'), v: academyOutput * conquestMul * civicMilitaryMul, b: academyOutput, m: am });
    }
    if (cloneOutput > 0) {
      var cm = [];
      if (conquestMul !== 1) cm.push([tr('ui.resource.detail.power.conquest'), conquestMul]);
      if (civicMilitaryMul !== 1) cm.push([militaryLabel, civicMilitaryMul]);
      parts.push({ l: tr('ui.resource.detail.power.clone_attack', null, '克隆人的进攻'), v: cloneOutput * conquestMul * civicMilitaryMul, b: cloneOutput, m: cm });
    }
    return parts;
  }
  /* ERA12 现实透孔仪（2026-11-23 · spec §4）：建成后每 30 分钟（1800 秒）自动对所有 active 敌国
   * 造成「规模上限 5%」的打击。与 recoverEnemies 同一遍历/同一 effectiveMaxScale 口径；
   * 计时器 s.apertureStrikeAcc 局内、随轮回清零；缺键按 0 起算（旧档零行为变化）。
   * ⚠️ 只在真有奇观时累加计时器——没建透孔仪的局不写这个字段，避免污染存档。 */
  var APERTURE_STRIKE_SEC = 1800;
  var APERTURE_STRIKE_RATIO = 0.05;
  function apertureAutoStrike(s, dt) {
    if (!wonderOwned(s, 'reality_aperture')) return 0;
    var state = ensureState(s);
    if (!state) return 0;
    if (hasCrisis(s) && !crisisActive(s)) return 0;
    s.apertureStrikeAcc = (Number(s.apertureStrikeAcc) || 0) + dt;
    if (s.apertureStrikeAcc < APERTURE_STRIKE_SEC) return 0;
    var strikes = Math.floor(s.apertureStrikeAcc / APERTURE_STRIKE_SEC);
    s.apertureStrikeAcc -= strikes * APERTURE_STRIKE_SEC;
    var totalLoss = 0, key, enemy, cap, loss;
    if (hasCrisis(s)) {
      enemy = crisisEnemy(s);
      cap = effectiveMaxScale(enemy);
      loss = cap * APERTURE_STRIKE_RATIO * strikes;
      if (loss <= 0) return 0;
      var crisisBefore = currentScale(enemy);
      enemy.currentScale = Math.max(0, crisisBefore - loss);
      var crisis = crisisOf(s);
      crisis.currentScale = enemy.currentScale;
      if (enemy.currentScale <= 0) crisis.defeated = true;
      return crisisBefore - enemy.currentScale;
    }
    for (key in state.enemies) if (Object.prototype.hasOwnProperty.call(state.enemies, key)) {
      enemy = state.enemies[key];
      if (!enemy || enemy.status === 'annexed') continue;
      cap = effectiveMaxScale(enemy);
      loss = cap * APERTURE_STRIKE_RATIO * strikes;
      if (loss <= 0) continue;
      var before = currentScale(enemy);
      enemy.currentScale = Math.max(0, before - loss);
      totalLoss += before - enemy.currentScale;
    }
    return totalLoss;
  }
  function tick(s, dt, emit, opts) {
    var state = ensureState(s);
    var elapsed = Number(dt);
    if (!state || !isFinite(elapsed) || elapsed <= 0) return 0;
    if (!hasCrisis(s)) syncCampaign(s);
    var generated = rate(s) * elapsed;
    if (isFinite(generated) && generated > 0) state.power += generated;
    if (hasCrisis(s)) {
      var crisisRecord = crisisOf(s);
      if (crisisRecord && crisisRecord.attackTimerInitialized !== true) {
        resetInvasion(state);
        crisisRecord.attackTimerInitialized = true;
        if (SB.game && SB.game.markDirty) SB.game.markDirty();
      }
      var crisisScaleAtStart = crisisActive(s) ? currentScale(crisisEnemy(s)) : 0;
      if (crisisActive(s)) {
        var boss = crisisEnemy(s);
        var crisisRecoveryMul = (SB.challenges && SB.challenges.enemyRecoveryMul)
          ? SB.challenges.enemyRecoveryMul(s) : 1;
        recoverEnemy(boss, elapsed, crisisRecoveryMul);
        crisisOf(s).currentScale = boss.currentScale;
      }
      apertureAutoStrike(s, elapsed);
      advanceInvasion(s, elapsed, emit, !!(opts && opts.deferBreakUI), crisisScaleAtStart);
      return generated;
    }
    var invasionEnemy = currentEnemy(s), invasionScaleAtStart = currentScale(invasionEnemy);
    recoverEnemies(s, elapsed);
    apertureAutoStrike(s, elapsed);
    advanceInvasion(s, elapsed, emit, !!(opts && opts.deferBreakUI), invasionScaleAtStart);
    return generated;
  }

  function effectiveMaxScale(enemy) {
    if (!enemy) return 0;
    var base = nonNegative(enemy.baseScale);
    /* 终末危机规模按拍板的 15 × 七阶基准固定；普通敌国的挑战/器官规模修正不缩小它。 */
    if (enemy.isTerminalCrisis === true) return base;
    var faithReduction = clamp(nonNegative(enemy.faithReduction), 0, 0.30);
    var cultureReduction = clamp(nonNegative(enemy.cultureReduction), 0, 0.30);
    var cap = base * Math.max(0.40, 1 - faithReduction - cultureReduction);
    /* 征服者三档永久奖励：敌国规模上限 ×0.95/×0.90/×0.85（−5%/−10%/−15%）。
     * 与 faith/culture/soft_power 按敌国累积的削减是不同轴，此处叠加为全局永久乘区。 */
    if (SB.challenges && SB.challenges.enemyScaleCapMul) cap *= SB.challenges.enemyScaleCapMul();
    /* 硅基承续 · 喉 LV3（2026-11-17）：敌国文明规模上限 −20%，与征服者 cap 乘子**相乘**（SPEC §7-7）。 */
    if (SB.veilFx) cap *= SB.veilFx.enemyCapMul();
    return cap;
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
  function recoverEnemy(enemy, dt, mul) {
    var elapsed = Number(dt), maxScale = effectiveMaxScale(enemy);
    var recoveryMul = (typeof mul === 'number' && isFinite(mul) && mul > 0) ? mul : 1;
    if (!enemy || !isFinite(elapsed) || elapsed <= 0 || maxScale <= 0 || enemy.status === 'annexed') return 0;
    var before = currentScale(enemy);
    enemy.currentScale = Math.min(maxScale, before + maxScale * RECOVERY_PER_SECOND * elapsed * recoveryMul);
    return enemy.currentScale - before;
  }
  function recoverEnemies(s, dt) {
    var state = ensureState(s), key;
    if (!state || hasCrisis(s)) return 0;
    /* 征服者三档（2026-11-12）：敌方规模恢复速度按档位 ×1.5 / ×2 / ×3。 */
    var mul = (SB.challenges && SB.challenges.enemyRecoveryMul) ? SB.challenges.enemyRecoveryMul(s) : 1;
    var total = 0;
    for (key in state.enemies) if (Object.prototype.hasOwnProperty.call(state.enemies, key))
      total += recoverEnemy(state.enemies[key], dt, mul);
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
    if (hasCrisis(s)) return null;
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
    if (hasCrisis(s)) return null;
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
  /* 与全工程其他模块同款的 tr（带 fallback）；本模块原本只有 translated，powerParts 弹窗需要它。 */
  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || fallback || '';
  }
  function randomValue() {
    var value = SB.rng ? Number(SB.rng()) : Math.random();
    if (!isFinite(value)) value = Math.random();
    return clamp(value, 0, 1 - Number.EPSILON);
  }
  function randomItem(items) {
    return items && items.length ? items[Math.floor(randomValue() * items.length)] : null;
  }
  function crisisDefinition(id) {
    for (var i = 0; i < CRISIS_TYPES.length; i++) if (CRISIS_TYPES[i].id === id) return CRISIS_TYPES[i];
    return null;
  }
  function crisisOf(s) {
    var crisis = s && s.crisis;
    return crisis && typeof crisis === 'object' && crisisDefinition(crisis.id) ? crisis : null;
  }
  function hasCrisis(s) { return !!crisisOf(s); }
  function crisisActive(s) {
    var crisis = crisisOf(s);
    return !!(crisis && crisis.defeated !== true && nonNegative(crisis.currentScale) > 0);
  }
  function crisisEnemy(s) {
    var crisis = crisisOf(s), definition = crisis && crisisDefinition(crisis.id);
    if (!crisis || !definition) return null;
    return {
      id: 'terminal_crisis_' + definition.id,
      nameKey: definition.nameKey,
      isTerminalCrisis: true,
      stage: 8,
      baseScale: CRISIS_BASE_SCALE,
      currentScale: nonNegative(crisis.currentScale),
      faithReduction: 0,
      cultureReduction: 0,
      popCapPool: 0,
      popCapClaimed: 0,
      status: crisis.defeated === true ? 'annexed' : 'active'
    };
  }
  function startCrisis(s) {
    if (!s || !(s.techs && s.techs.beyond_veil)) return null;
    var existing = crisisOf(s);
    if (existing) return existing;
    var selected = randomItem(CRISIS_TYPES);
    if (!selected) return null;
    s.crisis = {
      id: selected.id,
      currentScale: CRISIS_BASE_SCALE,
      defeated: false,
      storySeen: false,
      attackTimerInitialized: true
    };
    resetInvasion(ensureState(s));
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    return s.crisis;
  }
  function crisisProductionMul(s) { return crisisActive(s) ? CRISIS_PRODUCTION_MUL : 1; }
  function crisisAlienOutputMul(s) {
    var crisis = crisisOf(s);
    return crisisActive(s) && crisis.id === 'horde' ? 0 : 1;
  }
  function crisisRobotOutputMul(s) {
    var crisis = crisisOf(s);
    return crisisActive(s) && crisis.id === 'machine' ? 0 : 1;
  }
  function crisisHydroOutputMul(s) {
    var crisis = crisisOf(s), mul = crisisProductionMul(s);
    return mul * (crisisActive(s) && crisis.id === 'machine' ? CRISIS_HYDRO_ADDITIONAL_MUL : 1);
  }
  function crisisPopulationCapMul(s) {
    var crisis = crisisOf(s);
    return crisisActive(s) && crisis.id === 'voidwalker' ? CRISIS_POPULATION_CAP_MUL : 1;
  }
  function enemySuccessChance(s, enemy) {
    var enemyPower = currentScale(enemy);
    if (!(enemyPower > 0)) return 0;
    var defensePower = power(s) + rate(s) * 600;
    var baseChance = !(defensePower > 0) ? 0.80
      : clamp(0.25 + 0.25 * (Math.log(enemyPower / defensePower) / Math.LN2), 0, 0.80);
    return baseChance * (SB.wonder && SB.wonder.incomingInvasionSuccessMul
      ? SB.wonder.incomingInvasionSuccessMul(s) : 1);
  }
  /* 2026-11-14「潮线壁垒」：入侵威胁速率的**唯一落点**。
   * ⚠️ 面板倒计时(invasionStatus)、警告文案(beginInvasionWarning)、实际累积(advanceInvasion)、
   *    警告阈值(invasionWarningThreshold 的入参)必须共读这一个值，否则「显示的剩余时间」
   *    与「真正结算的时刻」分叉 —— 只改结算不改面板，玩家会看着倒计时归零却没被入侵。
   * ⚠️ scaleForRate 由调用方给：面板/警告用当前规模，结算用 tick 首尾规模均值；
   *    这里只统一乘折扣，绝不改规模基数的原有口径。 */
  function threatRateOf(s, scaleForRate, maxScale) {
    var base = maxScale > 0 ? clamp(Number(scaleForRate) / maxScale, 0, 1) : 0;
    var cut = clamp(nonNegative(s && s.perk && s.perk.warThreat), 0, 1);
    return clamp(base * (1 - cut), 0, 1);
  }
  function invasionWarningThreshold(threatRate) {
    return INVASION_CYCLE_SECONDS - INVASION_WARNING_SECONDS * clamp(threatRate, 0, 1);
  }
  function invasionStatus(s) {
    var state = ensureState(s), crisisMode = hasCrisis(s);
    var enemy = crisisMode ? crisisEnemy(s) : currentEnemy(s);
    var maxScale = effectiveMaxScale(enemy);
    var scale = currentScale(enemy);
    var atRisk = crisisMode ? crisisActive(s) : scale > 0;
    var threatRate = threatRateOf(s, scale, maxScale);
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
      messages.push(translated(report.crisis ? 'ui.crisis.attack.result.repulsed' : 'ui.war.invasion.result.repulsed', {
        enemyName: enemyName, scaleLoss: SB.economy && SB.economy.fmtAmt
          ? SB.economy.fmtAmt(report.scaleLoss) : String(Math.floor(nonNegative(report.scaleLoss)))
      }));
      return messages.filter(Boolean);
    }
    if (report.type !== 'success') return messages;
    messages.push(translated(report.crisis ? 'ui.crisis.attack.result.success' : 'ui.war.invasion.result.success', {
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
      enemySuccessPercent: Math.round(chance * 100), crisis: enemy.isTerminalCrisis === true
    };
    if (succeeded) {
      enemy.currentScale = Math.max(0, scaleBefore * 0.80);
      report.scaleLoss = scaleBefore - enemy.currentScale;
      report.penalty = applyInvasionPenalty(s);
    } else {
      enemy.currentScale = Math.max(0, scaleBefore * 0.90);
      report.scaleLoss = scaleBefore - enemy.currentScale;
    }
    if (report.crisis) {
      var crisis = crisisOf(s);
      if (crisis) crisis.currentScale = enemy.currentScale;
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
    var threatRate = threatRateOf(s, currentScale(enemy), maxScale);
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
    var state = ensureState(s), crisisMode = hasCrisis(s);
    var enemy = crisisMode ? crisisEnemy(s) : currentEnemy(s), remaining = elapsed;
    if (!state) return;
    if (!offlineCatchup) state.offlineInvasionResolved = false;
    if (!s.civics || !s.civics.military_training) { resetInvasion(state); return; }
    if (!enemy || (crisisMode ? !crisisActive(s) : !enemyAvailable(state, enemy))) { resetInvasion(state); return; }
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
    var threatRate = threatRateOf(s, (Number(scaleAtStart) + currentStrength) / 2, maxScale);
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
    /* 2026-11-14「胜算」三级：百分点**从 failure 挪到 success**。
     * ⚠️ 绝不能只加 success：下面按 total 归一化后，+0.10 实得只有 +2.73pp，
     *    且大成功从 5.00% 被压到 4.55%。一减一加则 total 恒 1、大成功不变。
     * ⚠️ clip 到「当前失败率 − 要塞下限」，避免撞上面 :723 的 floor 后
     *    total > 1 又被归一化稀释（与 fortressProbabilityAdjustment 同款兜底）。 */
    var perkDelta = Math.min(nonNegative(s && s.perk && s.perk.warSuccessOdds),
      Math.max(0, odds.failure - floor));
    odds.failure -= perkDelta;
    odds.success += perkDelta;
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
    /* 武器的批判通关奖励（2026-11-12）：战争行动军力消耗 -10% 永久生效。 */
    var challengeWarCostMul = (SB.challenges && SB.challenges.warCostMul) ? SB.challenges.warCostMul(s) : 1;
    return maxScale * spec.costShare * faithMul * routeMul * intelligenceMul * extra * challengeWarCostMul
      * (SB.wonder && SB.wonder.ringWarCostMul ? SB.wonder.ringWarCostMul(s) : 1);
  }
  function establishTradeRoute(s) {
    var state = ensureState(s);
    if (hasCrisis(s)) return { ok: false, reason: 'crisis_active' };
    if (!state || !s.civics || !s.civics.trade) return { ok: false, reason: 'locked' };
    /* 武器的批判挑战（2026-11-12）：整局禁止修建贸易路线。预防性拦截——UI 按钮已禁用，
     * 这里兜底 aibot / 任何旁路调用。 */
    if (SB.challenges && SB.challenges.tradeRouteBlocked && SB.challenges.tradeRouteBlocked(s))
      return { ok: false, reason: 'weapon_critique' };
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
      /* 2026-11-14「文教节流」三级：与两张政策卡的折扣**加算**，共享 max(0,…) 下限。
       * ⚠️ 只在 culture 分支生效；faith（传道信仰）分支的 cost 不受影响。
       * ⚠️ 这是软实力成本，不是 cultureReduction 的削减幅度（后者硬顶 0.30）。 */
      discount += nonNegative(s && s.perk && s.perk.cultureCostCut);
      cost *= Math.max(0, 1 - discount);
    }
    /* 和平主义者通关奖励（2026-11-12）：软实力（信仰 / 文化渗透）成本 -20%，永久生效。
     * 仅读账本 tierDone，不在挑战进行中生效——与其它终局挑战的永久奖励口径一致。 */
    if (SB.challenges && SB.challenges.tierDone &&
      SB.challenges.tierDone('pacifist', SB.game && SB.game.meta ? SB.game.meta() : null) >= 1) cost *= 0.8;
    /* 硅基承续 · 脑（2026-11-17）：软实力行动消耗 −20/40/60%。乘在既有折扣之后（SPEC §7-6：
     * 与文化折扣是乘算而非加算——加算会在折扣堆满时把成本压成 0 甚至负数）。 */
    if (SB.veilFx) cost *= SB.veilFx.softCostMul();
    return cost;
  }
  function executeSoftPowerAction(s, enemyId, actionId, options) {
    var state = ensureState(s), enemy = enemyOf(s, enemyId), opts = options || {};
    if (hasCrisis(s)) return { ok: false, reason: 'crisis_active' };
    /* 武器的批判挑战（2026-11-12）：整局禁止软实力（传播文化 / 传道信仰）。预防性拦截——
     * UI 按钮已禁用，这里兜底 aibot / 任何旁路调用。 */
    if (SB.challenges && SB.challenges.softPowerBlocked && SB.challenges.softPowerBlocked(s))
      return { ok: false, reason: 'weapon_critique' };
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
    if (hasCrisis(s)) return { ok: false, reason: 'crisis_active' };
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
  function executeActionForTarget(s, state, enemy, actionId, options, crisisMode) {
    var spec = ACTIONS[actionId];
    var opts = options || {};
    /* 战争行动被挑战禁用（2026-11-12）：细粒度预防性拦截。批判的武器禁全部；
     * 早打大打打核大战只许全面战争；grubby 只许劫掠。UI 已禁用对应按钮，这里兜底
     * aibot / 任何旁路调用，确保不可能真的发动被禁动作。 */
    var warActionReason = SB.challenges && SB.challenges.warActionBlockedReason
      ? SB.challenges.warActionBlockedReason(s, actionId) : null;
    if (warActionReason) return { ok: false, reason: warActionReason };
    var targetAvailable = crisisMode
      ? (hasCrisis(s) && crisisActive(s) && !!enemy)
      : (!hasCrisis(s) && enemyAvailable(state, enemy));
    if (!targetAvailable || currentScale(enemy) <= 0 || !spec) return { ok: false, reason: 'unavailable' };
    if (!s.civics || !s.civics[spec.unlockCivic]) return { ok: false, reason: 'locked' };
    var cost = actionCost(s, enemy, actionId, opts.costMultiplier);
    if (!(cost > 0) || state.power + 1e-9 < cost) return { ok: false, reason: 'insufficient_power', cost: cost };
    var resourceId = crisisMode ? null : randomItem(lootResourceCandidates(s));
    if (!crisisMode && !resourceId) return { ok: false, reason: 'no_loot_resource' };
    var lootRateBeforeAction = crisisMode ? 0 : grossResourceRate(s, resourceId);
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
    /* 2026-11-14「破阵」三级：与工坊三件套（+10/+30/+70%）**加算进同一个括号**，
     * 不另造乘区。独立乘区会让满配 2.10×1.30=2.73 而不是 2.40。
     * ⚠️ 只削 currentScale，不动 effectiveMaxScale / enemyScaleCapMul（征服者挑战轴）。 */
    scaleLoss *= 1 + enemyScaleDamageBonus + nonNegative(s && s.perk && s.perk.warScaleDamage);
    /* 硅基承续 · 喉（2026-11-17）：战争行动对敌人规模损失 +50/100/150%。乘在 warScaleDamage
     * 加法轴之后，与它独立（否则「军械劣评」那类加成就被器官悄悄放大）。 */
    if (SB.veilFx) scaleLoss *= SB.veilFx.warScaleDamageMul();
    var scaleBefore = currentScale(enemy);
    enemy.currentScale = Math.max(0, scaleBefore - scaleLoss);
    /* 2026-11-12：损失从「军人比率」改为「国家人口比率」，不可被调岗规避。
     * popLoss 为人口损失比率（向上取整）；优先减军人岗位，剩余落普通人口由 trimJobsToPop 兜底。
     * 胜利日游行卡（card_victory_day_parade）豁免成功时的人口损失，与原「豁免军人损失」口径一致。 */
    /* 2026-11-14「折冲之训」：只削**战争行动**的人口损失，不碰入侵结算的惩罚
     *    （resolveInvasion 走 invasionPenalty，与本行无关）。
     * ⚠️ 折扣必须落在「整数人数」而不是「损失比率」上：若在比率上先乘 0.9，
     *    0.04 × 0.9 = 0.036000000000000004，× 1000 = 36.00000000000001，
     *    Math.ceil 会多扣 1 人（40 → 37，实际只减了 7.5%）。先 ceil 成人数再乘，
     *    40 × 0.9 = 36 精确；未点亮时 cut=0 ⇒ ceil(n × 1) = n，行为零变更。 */
    var popLossRate = outcomeId !== 'failure' && policyEquipped(s, 'card_victory_day_parade')
      ? 0 : (result.popLoss || 0);
    var rawLostPop = Math.ceil(nonNegative(s.pop) * popLossRate);
    var lostPop = Math.ceil(rawLostPop
      * (1 - clamp(nonNegative(s && s.perk && s.perk.warPopLoss), 0, 1)));
    if (lostPop > 0) {
      var soldierBefore = nonNegative(s.jobs && s.jobs.soldier);
      var soldierPart = Math.min(soldierBefore, lostPop);
      if (soldierPart > 0) s.jobs.soldier = soldierBefore - soldierPart;   // 优先减军人
      s.pop = Math.max(0, nonNegative(s.pop) - lostPop);                   // 总减 lostPop
      if (SB.folk && typeof SB.folk.trimJobsToPop === 'function') SB.folk.trimJobsToPop(s);  // 兜底 jobs ≤ pop
    }
    var capAward = 0;
    if (!crisisMode) {
      capAward = Math.min(result.popCap, Math.max(0, nonNegative(enemy.popCapPool) - nonNegative(enemy.popCapClaimed)));
      enemy.popCapClaimed = nonNegative(enemy.popCapClaimed) + capAward;
      state.popCap += capAward;
    }
    /* 2026-11-14「战场回收」：战败时按天赋给保底战利品（0 → 0.50）。
     * ⚠️ opts.lootOnFailure 是历史遗留的「全额」开关（全库零调用方），保留其语义；
     *    新天赋与它取其一、绝不叠乘；未点亮时 warSalvage=0 ⇒ 仍为 0，默认行为零变更。 */
    var resourceRate = 0, lootAmount = 0, actualLoot = 0;
    if (!crisisMode) {
      var failureLootFrac = opts.lootOnFailure === true ? 1
        : clamp(nonNegative(s && s.perk && s.perk.warSalvage), 0, 1);
      resourceRate = outcomeId === 'failure'
        ? lootRateBeforeAction * failureLootFrac : lootRateBeforeAction;
      lootAmount = resourceRate * spec.lootSeconds;
      /* grubby 通关奖励（2026-11-12）：战利品产出 +20% 永久生效。 */
      var lootYieldMul = (SB.challenges && SB.challenges.lootYieldMul) ? SB.challenges.lootYieldMul(s) : 1;
      lootAmount *= lootYieldMul;
      var resourceBefore = nonNegative(s.res && s.res[resourceId]);
      if (lootAmount > 0 && SB.economy.addRes) SB.economy.addRes(s, resourceId, lootAmount);
      actualLoot = Math.max(0, nonNegative(s.res && s.res[resourceId]) - resourceBefore);
      state.tradeRouteLevel = 0;
    } else {
      var crisis = crisisOf(s);
      crisis.currentScale = enemy.currentScale;
      if (enemy.currentScale <= 0) {
        crisis.currentScale = 0;
        crisis.defeated = true;
      }
    }
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    var result = {
      ok: true, action: actionId, outcome: outcomeId, cost: cost, refund: refund,
      probabilities: odds, scaleBefore: scaleBefore, scaleLoss: scaleLoss,
      scaleAfter: enemy.currentScale, popLost: lostPop,
      populationCapAward: capAward, resourceId: resourceId,
      resourceRate: resourceRate, lootAmount: actualLoot
    };
    /* 结算点即唯一反馈落点：玩家点击（input.js）与 aibot 都走这里，
       不会出现「界面点了有提示、模拟跑起来没有」的分叉。 */
    if (crisisMode) {
      result.crisis = true;
      result.defeated = enemy.currentScale <= 0;
    } else notifyWarToast('action', result);
    return result;
  }
  function executeAction(s, enemyId, actionId, options) {
    var state = ensureState(s);
    if (hasCrisis(s)) return { ok: false, reason: 'crisis_active' };
    return executeActionForTarget(s, state, enemyOf(s, enemyId), actionId, options, false);
  }
  function executeCrisisAction(s, actionId, options) {
    var state = ensureState(s), enemy = crisisEnemy(s);
    if (!state || !hasCrisis(s) || !enemy) return { ok: false, reason: 'unavailable' };
    return executeActionForTarget(s, state, enemy, actionId, options, true);
  }

  SB.war = {
    ACTIONS: ACTIONS,
    CRISIS_TYPES: CRISIS_TYPES.map(function (crisis) { return { id: crisis.id, nameKey: crisis.nameKey }; }),
    CRISIS_SCALE_MULTIPLIER: CRISIS_SCALE_MULTIPLIER,
    CRISIS_BASE_SCALE: CRISIS_BASE_SCALE,
    CRISIS_PRODUCTION_MUL: CRISIS_PRODUCTION_MUL,
    CRISIS_HYDRO_ADDITIONAL_MUL: CRISIS_HYDRO_ADDITIONAL_MUL,
    CRISIS_POPULATION_CAP_MUL: CRISIS_POPULATION_CAP_MUL,
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
    powerParts: powerParts,
    lootResourceCandidates: lootResourceCandidates,
    conquestBonusPercent: conquestBonusPercent,
    conquestProductionMultiplier: conquestProductionMultiplier,
    tick: tick,
    effectiveMaxScale: effectiveMaxScale,
    currentScale: currentScale,
    registerEnemy: registerEnemy,
    enemy: enemyOf,
    currentEnemy: currentEnemy,
    hasCrisis: hasCrisis,
    crisisActive: crisisActive,
    crisisOf: crisisOf,
    crisisDefinition: crisisDefinition,
    crisisEnemy: crisisEnemy,
    startCrisis: startCrisis,
    crisisProductionMul: crisisProductionMul,
    crisisAlienOutputMul: crisisAlienOutputMul,
    crisisRobotOutputMul: crisisRobotOutputMul,
    crisisHydroOutputMul: crisisHydroOutputMul,
    crisisPopulationCapMul: crisisPopulationCapMul,
    invasionStatus: invasionStatus,
    /* 供回归断言直读：面板/警告/结算/阈值共用的威胁速率单点。 */
    threatRateOf: threatRateOf,
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
    executeCrisisAction: executeCrisisAction,
    populationCapBonus: function (s) { return nonNegative(s && s.war && s.war.popCap); },
    soldierBaseRate: function () { return nonNegative(SB.BLD && SB.BLD.soldierMilitaryPower); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
