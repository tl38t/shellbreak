/* 天壳 / SHELLBREAK — 科技与市政研究面板。Classic script component; view state stays ephemeral. */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  function englishLocaleEnabled() {
    return SB.i18n && SB.i18n.isEnabled && SB.i18n.isEnabled() &&
      SB.i18n.getLocale && SB.i18n.getLocale() === 'en-US';
  }
  function tr(key, params, fallback) {
    var english = root.ShellbreakLocales && root.ShellbreakLocales['en-US'];
    var value = englishLocaleEnabled() && english && typeof english[key] === 'string' && SB.i18n.t
      ? SB.i18n.t(key, params) : '';
    return value || fallback || '';
  }
  function trComplete(key, params, fallback) {
    var value = tr(key, params, '');
    return value && !/\{[A-Za-z0-9_]+\}/.test(value) ? value : (fallback || '');
  }
  var exactLocaleKeyCache = Object.create(null);
  function exactLocaleKey(prefix, suffix, sourceValue) {
    var cacheKey = prefix + '|' + suffix;
    var map = exactLocaleKeyCache[cacheKey];
    if (!map) {
      map = Object.create(null);
      var zh = root.ShellbreakLocales && root.ShellbreakLocales['zh-CN'] || {};
      var en = root.ShellbreakLocales && root.ShellbreakLocales['en-US'] || {};
      var keys = Object.keys(zh);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.indexOf(prefix) !== 0 || key.slice(-suffix.length) !== suffix || typeof en[key] !== 'string') continue;
        if (typeof zh[key] === 'string' && !Object.prototype.hasOwnProperty.call(map, zh[key])) map[zh[key]] = key;
      }
      exactLocaleKeyCache[cacheKey] = map;
    }
    return map[sourceValue] || '';
  }
  function policyKey(policy, field) {
    var nameKey = exactLocaleKey('policy.card.', '.name', policy && policy.name);
    if (!nameKey) return '';
    return nameKey.slice(0, -'.name'.length) + '.' + field;
  }
  function policyText(policy, field, params, fallback) {
    return trComplete(policyKey(policy, field), params, fallback);
  }
  var GOV_DATA_ALIASES = {
    tribe: 'chiefdom', theo_state: 'theocracy', theocracy: 'theocratic_government',
    star_sea_coop: 'starsea_cooperative'
  };
  var GOV_TITLE_SUFFIX_KEYS = {
    theo_state: 'theocracy', egalitarianism: 'alliance', federalism: 'federation',
    interstellar_federation: 'interstellar_federation', star_sea_coop: 'starsea_collective',
    universal_church: 'universal_church'
  };
  function govSlug(government) { return GOV_DATA_ALIASES[government.id] || government.id; }
  function govName(government) {
    var slug = govSlug(government);
    return tr('government.data.' + slug + '.name', null, government.name);
  }
  function govTitle(s, government) {
    if (s && s.govName && s.govName.trim() && GOV_TITLE_SUFFIX_KEYS[government.id]) {
      return s.govName.trim() + tr('civic.government.title.' + GOV_TITLE_SUFFIX_KEYS[government.id], null,
        (SB.civic.govTitleName ? SB.civic.govTitleName(s) : government.name).slice(s.govName.trim().length));
    }
    return govName(government);
  }
  function govParams(government) {
    var p = {}, slots = government.slots || {};
    var slotCount = 0, type;
    for (type in slots) if (slots[type] > 0) slotCount += slots[type];
    p.policySlotCount = slotCount;
    p.universalSlotCount = slots.wild || 0;
    p.productionSlotCount = slots.prod || 0;
    p.growthSlotCount = slots.grow || 0;
    p.religionSlotCount = slots.relig || 0;
    if (government.effect && typeof government.effect.kelp === 'number') p.kelpOutputPerSecond = government.effect.kelp;
    if (typeof government.craftRatio === 'number') p.craftingEfficiencyBonusPercent = Math.round(government.craftRatio * 100);
    if (typeof government.luxuryMul === 'number') p.luxuryOutputBonusPercent = Math.round((government.luxuryMul - 1) * 100);
    if (typeof government.happyBonus === 'number') p.happinessBonus = government.happyBonus;
    if (typeof government.buildSave === 'number') p.coreBuildingCostReductionPercent = Math.round(government.buildSave * 100);
    if (typeof government.happyConsumeMul === 'number') p.happinessUpkeepReductionPercent = Math.round((1 - government.happyConsumeMul) * 100);
    if (typeof government.faithPerBuilding === 'number') p.faithPerBuildingPerSecond = government.faithPerBuilding;
    if (typeof government.faithPerAcademy === 'number') p.faithPerAcademicLevelPerSecond = government.faithPerAcademy;
    if (typeof government.faithPerCivic === 'number') p.faithPerCivicLevelPerSecond = government.faithPerCivic;
    if (typeof government.craftPerPop === 'number') p.outputBonusPerMerfolkPercent = government.craftPerPop * 100;
    if (typeof government.civicOutMul === 'number') p.researchAndCivicOutputBonusPercent = Math.round((government.civicOutMul - 1) * 100);
    if (typeof government.sciOutMul === 'number' && government.civicOutMul === undefined) p.researchAndCivicOutputBonusPercent = Math.round((government.sciOutMul - 1) * 100);
    if (typeof government.mermanFoodMul === 'number') p.merfolkFoodUpkeepReductionPercent = Math.round(government.mermanFoodMul * 100);
    if (typeof government.allOutMul === 'number') p.globalProductionBonusPercent = Math.round((government.allOutMul - 1) * 100);
    if (typeof government.faithMul === 'number') p.faithProductionMultiplier = government.faithMul;
    return p;
  }
  function govEffect(government) {
    var slug = govSlug(government);
    if (government.id === 'theo_state') slug = 'theocracy';
    if (government.id === 'theocracy') slug = 'theocratic_government';
    return trComplete('government.data.' + slug + '.effect', govParams(government), government.desc);
  }
  function govFlavor(government) {
    return trComplete('government.data.' + govSlug(government) + '.flavor', null, government.flavor || '');
  }
  function govBlockedText(s, government, why) {
    if (!why) return '';
    if (why.indexOf('美好旧日') >= 0) return tr('civic.government.good_old_days.locked', null, why);
    if (why.indexOf('需先完成解锁它的市政') >= 0) return tr('civic.government.requires_unlocking_civic', null, why);
    if (why.indexOf('换政体需') >= 0) return tr('civic.government.change_cost.blocked', {
      cost: SB.civic.govCost(s), current: Math.floor(s.res && s.res.culture || 0)
    }, why);
    return why;
  }
  var SLOT_LOCALE_KEYS = { wild: 'universal', prod: 'production', sci: 'research', grow: 'growth', relig: 'religion' };
  function slotName(type) {
    var fallback = SB.civic && SB.civic.slotTypeName ? SB.civic.slotTypeName(type) : type;
    return tr('policy.slot.' + (SLOT_LOCALE_KEYS[type] || type), null, fallback);
  }
  function slotTypeLabel(type) {
    return slotName(type).replace(/\s+slot$/i, '').replace(/槽$/, '');
  }
  function govBonusNote() {
    return hasAnarchyBonusSlot()
      ? tr('civic.government.anarchy_bonus_slot.note', { slotCountLabel: '1 Universal slot' }, '（另有安那其主义奖励的 1 个万能槽）')
      : '';
  }
  function policyParams(policy, s) {
    var p = {}, mult = function (x) { return Math.round((x - 1) * 100); };
    if (!policy) return p;
    if (typeof policy.craftRatio === 'number') p.craftingEfficiencyBonusPercent = Math.round(policy.craftRatio * 100);
    if (policy.effect && typeof policy.effect.science === 'number') p.researchPointsPerSecond = policy.effect.science;
    if (typeof policy.popCapFlat === 'number') p.populationCapIncrease = policy.popCapFlat;
    if (typeof policy.popCapPerPopBldg === 'number') p.populationCapPerBuildingLevel = policy.popCapPerPopBldg;
    if (typeof policy.popGrowthTimeMul === 'number') p.populationGrowthTimeReductionPercent = Math.round((1 - policy.popGrowthTimeMul) * 100);
    if (typeof policy.squareMul === 'number') {
      p.plazaCivicPointMultiplier = policy.squareMul;
      p.plazaEffectBonusPercent = mult(policy.squareMul);
    }
    if (typeof policy.theaterMul === 'number') p.operaHouseOfficialCivicPointMultiplier = policy.theaterMul;
    if (typeof policy.templeMul === 'number') {
      p.templeFaithMultiplier = policy.templeMul;
      p.templeEffectBonusPercent = mult(policy.templeMul);
    }
    if (typeof policy.libraryMul === 'number') p.tidalLibraryResearchMultiplier = policy.libraryMul;
    if (typeof policy.universityMul === 'number') p.researchBuildingBonusPercent = Math.round((policy.universityMul - 1) * 100);
    if (typeof policy.templeFaithMul === 'number') {
      p.templeFaithOutputMultiplier = policy.templeFaithMul;
      p.templeFaithBonusReductionPercent = Math.round((1 - policy.templeFaithMul) * 100);
    }
    if (typeof policy.obsSciMul === 'number') p.starObservatoryOutputMultiplier = policy.obsSciMul;
    if (typeof policy.storeMul === 'number') {
      p.storageCapacityMultiplier = policy.storeMul;
      p.storageCapacityBonusPercent = Math.round((policy.storeMul - 1) * 100);
    }
    if (typeof policy.bankMerchantMul === 'number') {
      p.bankMerchantOutputMultiplier = policy.bankMerchantMul;
      p.bankMerchantOutputBonusPercent = Math.round((policy.bankMerchantMul - 1) * 100);
    }
    if (typeof policy.popFaithMul === 'number') {
      p.populationFaithBonusPercent = Math.round((policy.popFaithMul - 1) * 100);
      p.populationFaithProductionReductionPercent = Math.round((1 - policy.popFaithMul) * 100);
      p.populationFaithProductionReductionPercent = Math.max(0, p.populationFaithProductionReductionPercent);
      if (typeof policy.sciOutMul === 'number') p.researchPointProductionMultiplier = policy.sciOutMul;
    }
    if (typeof policy.civicOutMul === 'number' && policy.civicOutMul < 1) p.civicPointProductionReductionPercent = Math.round((1 - policy.civicOutMul) * 100);
    if (typeof policy.sciOutMul === 'number' && policy.sciOutMul < 1) p.researchPointProductionReductionPercent = Math.round((1 - policy.sciOutMul) * 100);
    if (typeof policy.hydroSupplyMul === 'number') p.hydrothermalSupplyBonusPercent = Math.round((policy.hydroSupplyMul - 1) * 100);
    if (typeof policy.shellSpeedPerIdle === 'number') p.hatchSpeedBonusPerIdleMerfolkPercent = Math.round(policy.shellSpeedPerIdle * 100);
    if (typeof policy.civicPerPop === 'number') p.civicPointsPerMerfolkPerSecond = policy.civicPerPop;
    if (typeof policy.luxConsumeMul === 'number') {
      p.luxuryGoodsConsumptionIncreasePercent = Math.round((policy.luxConsumeMul - 1) * 100);
      p.luxuryGoodsConsumptionIncreasePerCardPercent = p.luxuryGoodsConsumptionIncreasePercent;
      p.luxuryGoodsConsumptionReductionPercent = Math.round((1 - policy.luxConsumeMul) * 100);
    }
    if (typeof policy.happyOffset === 'number') p.happinessPenalty = Math.abs(policy.happyOffset);
    if (typeof policy.jobOutMul === 'number') p.jobOutputBonusPercent = Math.round((policy.jobOutMul - 1) * 100);
    if (typeof policy.wonderBuildSave === 'number') p.wonderConstructionCostReductionPercent = Math.round(policy.wonderBuildSave * 100);
    if (typeof policy.wonderBuildSaveEra === 'number') {
      p.firstEra = 1;
      p.lastEra = policy.wonderEraCap;
      p.wonderConstructionCostReductionPercent = Math.round(policy.wonderBuildSaveEra * 100);
    }
    if (typeof policy.wonderEraCap === 'number' && p.lastEra === undefined) p.lastEra = policy.wonderEraCap;
    if (typeof policy.spaceBuildSave === 'number') p.spaceBuildingConstructionCostReductionPercent = Math.round(policy.spaceBuildSave * 100);
    if (typeof policy.canalMul === 'number') p.royalCanalEffectBonusPercent = Math.round((policy.canalMul - 1) * 100);
    if (typeof policy.wonderLuxSave === 'number') p.luxuryGoodsConsumptionReductionPerWonderPercent = Math.round(policy.wonderLuxSave * 100);
    if (typeof policy.faithSatMul === 'number') p.faithOutputBonusPerSatellitePercent = Math.round((policy.faithSatMul - 1) * 100);
    if (typeof policy.coreSpaceFaithMul === 'number') p.faithOutputBonusPerZoneBuildingLevelPercent = Math.round((policy.coreSpaceFaithMul - 1) * 100);
    if (typeof policy.craftRatioPerPop === 'number') p.workshopCraftingEfficiencyPenaltyPerPersonPercent = Math.round(policy.craftRatioPerPop * 100);
    if (typeof policy.craftMul === 'number') p.workshopCraftingEfficiencyMultiplier = policy.craftMul;
    if (typeof policy.starPerPop === 'number') p.explorationRateBonusPercent = Math.round(policy.starPerPop * 100);
    if (typeof policy.planetOutMul === 'number') p.alienBuildingOutputBonusPercent = Math.round((policy.planetOutMul - 1) * 100);
    if (typeof policy.breakStardustMul === 'number') p.stardustGainMultiplier = policy.breakStardustMul;
    if (typeof policy.foodOutMul === 'number') p.foodProductionMultiplier = policy.foodOutMul;
    if (typeof policy.sciToCivic === 'number') p.researchToCivicPointConversionPercent = Math.round(policy.sciToCivic * 100);
    if (typeof policy.companyBonusMul === 'number') p.companyModifierMultiplier = policy.companyBonusMul;
    if (typeof policy.faithOutMul === 'number' && typeof policy.sciOutMul === 'number' && policy.faithOutMul < 1)
      p.faithAndResearchOutputPenaltyPercent = Math.round((1 - policy.faithOutMul) * 100);
    if (typeof policy.craftRatioRecipes === 'number') p.craftingEfficiencyBonusPercent = Math.round(policy.craftRatioRecipes * 100);
    if (policy.craftRatioRecipes && typeof policy.craftRatioRecipes === 'object') {
      var recipes = Object.keys(policy.craftRatioRecipes);
      if (recipes.length) {
        p.craftingEfficiencyBonusPercent = Math.round(policy.craftRatioRecipes[recipes[0]] * 100);
        p.artifactCraftingEfficiencyBonusPercent = Math.round(policy.craftRatioRecipes[recipes[0]] * 100);
      }
    }
    if (typeof policy.liveCompCivic === 'number' && s) p.populationCount = s.pop || 0;
    if (policy.serfKelpMul !== undefined || policy.serfWarmMul !== undefined) p.crossBuildingEffectBonusPercent = 1;
    if (policy.id === 'card_sovereign' && SB.BLD) p.faithOutputBonusPerCastleLevelPercent = Math.round((SB.BLD.castleFaithRatio || 0) * 100);
    if (policy.id === 'card_serfdom' && SB.BLD) p.crossBuildingEffectBonusPercent = Math.round((SB.BLD.serfCrossRatio || 0) * 100);
    if (policy.id === 'card_divine_right' && typeof policy.coreFaithMul === 'number') p.faithOutputBonusPerLevelPercent = Math.round(policy.coreFaithMul * 100);
    if (policy.id === 'card_heat_priority' && typeof policy.civicOutMul === 'number' && typeof policy.sciOutMul === 'number')
      p.civicAndResearchOutputPenaltyPercent = Math.round((1 - Math.min(policy.civicOutMul, policy.sciOutMul)) * 100);
    if (policy.id === 'card_museum' && SB.BLD && typeof policy.museumMul === 'number') {
      p.scribeCivicPointBaseBonusPercent = Math.round((SB.BLD.museumCivRatio || 0) * 100);
      p.scribeCivicPointBonusWithCardPercent = Math.round((SB.BLD.museumCivRatio || 0) * policy.museumMul * 100);
    }
    if (policy.id === 'card_national_solidarity') {
      var guildCard = null, allPolicies = SB.POLICIES || [];
      for (var gp = 0; gp < allPolicies.length; gp++) if (allPolicies[gp].id === 'card_guild') { guildCard = allPolicies[gp]; break; }
      if (typeof policy.craftRatio === 'number') p.craftingEfficiencyBonusPercent = Math.round(policy.craftRatio * 100);
      if (guildCard && typeof guildCard.craftRatio === 'number')
        p.replacedCraftingEfficiencyBonusPercent = Math.round(guildCard.craftRatio * 100);
    }
    if (policy.id === 'card_live_comp' && s) {
      p.populationCount = s.pop || 0;
      p.stadiumLevel = s.lvl && s.lvl.stadium || 0;
    }
    if (policy.id === 'card_no_god_here' && typeof policy.universityMul === 'number')
      p.researchInstituteResearchMultiplier = policy.universityMul;
    if (policy.id === 'card_saving') {
      if (typeof policy.launchHydroMul === 'number') p.launchHydrothermalConsumptionReductionPercent = Math.round((1 - policy.launchHydroMul) * 100);
      if (typeof policy.happyConsumeMul === 'number') p.residentHappinessUpkeepIncreasePercent = Math.round((policy.happyConsumeMul - 1) * 100);
    }
    if (policy.id === 'card_supreme_directive' && typeof policy.launchCycle === 'number') {
      var baseCycle = SB.CFG && SB.CFG.LAUNCH_CYCLE || 10;
      var vectorTech = null, techs = SB.TECHS || [];
      for (var vt = 0; vt < techs.length; vt++) if (techs[vt].id === 'vector_ctrl') { vectorTech = techs[vt]; break; }
      var vectorReduction = vectorTech && vectorTech.eff && typeof vectorTech.eff.launchCycle === 'number'
        ? Math.abs(vectorTech.eff.launchCycle) : 0;
      var speedPerk = s && s.perk && s.perk.starLaunchSpeed || 0;
      p.launchCycleTimeReductionSeconds = Math.abs(policy.launchCycle);
      p.spaceVectorControlCycleTimeReductionSeconds = vectorReduction;
      p.baseLaunchCycleTimeSeconds = baseCycle;
      p.finalLaunchCycleTimeSeconds = Math.max(1, baseCycle - vectorReduction + policy.launchCycle - speedPerk);
    }
    var pollution = SB.CFG && SB.CFG.POLLUTION || {};
    if (policy.id === 'card_quarantine') {
      p.pollutionDeathChanceReductionPercent = Math.round((pollution.CARD_QUARANTINE || 0) * 100);
      p.hospitalSoftCapPercent = Math.round((pollution.HOSP_MAX_REDUCE || 0) * 100);
    }
    if (policy.id === 'card_disease_control') p.pollutionDeathChanceReductionPercent = Math.round((pollution.CARD_DISEASE || 0) * 100);
    if (policy.id === 'card_confession') p.burialSlotsPerTemple = pollution.BURIAL && pollution.BURIAL.PER_TEMPLE !== undefined ? pollution.BURIAL.PER_TEMPLE : 1;
    if (policy.id === 'card_protect_planet') p.pollutionPurifiedPerSecondPerMerfolk = pollution.CLEAN_PER_POP || 0;
    if (policy.id === 'card_last_resort') p.pollutionPurifiedPerSecondPerBuildingLevel = pollution.CLEAN_PER_ALIEN_LVL || 0;
    if (policy.id === 'card_pollution_control') p.pollutionOutputReductionPercent = Math.round((1 - (pollution.RATE_MUL_CONTROL || 1)) * 100);
    if (policy.id === 'card_green_movement') p.pollutionOutputReductionPercent = Math.round((1 - (pollution.RATE_MUL_GREEN || 1)) * 100);
    if (policy.resOutMul) {
      var resources = policy.resOutMul;
      if (typeof resources.coral === 'number') p.coralOutputBonusPercent = Math.round((resources.coral - 1) * 100);
      if (typeof resources.steel === 'number') p.steelOutputBonusPercent = Math.round((resources.steel - 1) * 100);
      if (typeof resources.iron === 'number') p.ironOutputBonusPercent = Math.round((resources.iron - 1) * 100);
      if (typeof resources.iron === 'number' && typeof resources.steel === 'number') p.ironAndSteelOutputBonusPercent = Math.round((resources.iron - 1) * 100);
      var resKeys = Object.keys(resources);
      if (resKeys.length) p.resourceOutputBonusPercent = Math.round((resources[resKeys[0]] - 1) * 100);
    }
    return p;
  }
  function policyDesc(policy, s) {
    return policyText(policy, 'desc', policyParams(policy, s), policy && policy.desc || '');
  }
  function policyFlavor(policy) {
    return policyText(policy, 'flavor', null, policy && policy.flavor || '');
  }
  function policyName(policy) {
    return policyText(policy, 'name', null, policy && policy.name || '');
  }
  function policyBlockedText(s, policy, why) {
    if (!why) return '';
    var C = SB.civic;
    if (why.indexOf('安那其主义挑战只允许') >= 0) return tr('civic.policy.anarchism_challenge_only', null, why);
    if (why.indexOf('已锁死') >= 0 && policy) return tr('civic.policy.locked_removal', { policyName: policyName(policy) }, why);
    if (why.indexOf('拔下需') >= 0) return tr('civic.policy.removal_cost.blocked', {
      cost: C.cardCost(s), current: Math.floor(s.res && s.res.culture || 0), freeRemovals: s.cardFreeRemoves || 0
    }, why);
    if (policy && policy.govPassive) {
      if (why.indexOf('不能装备与当前政体同名') >= 0) return tr('civic.policy.government_passive.same_government', null, why);
      if (why.indexOf('每局最多装备一张') >= 0) return tr('civic.policy.government_passive.limit_reached', null, why);
      if (why.indexOf('需先通关') >= 0) {
        var gov = C.govById ? C.govById(policy.govPassive) : null;
        return tr('civic.policy.requires_challenge_and_government', {
          governmentName: gov ? govName(gov) : policy.govPassive
        }, why);
      }
    }
    if (why.indexOf('需先完成市政') >= 0 && policy) {
      var civic = null, civics = SB.CIVICS || [];
      for (var i = 0; i < civics.length; i++) if (civics[i].id === policy.civic) { civic = civics[i]; break; }
      return civic ? tr('civic.policy.requires_civic', { civicName: civicName(civic) }, why)
        : tr('civic.policy.requires_civic.generic', null, why);
    }
    if (why.indexOf('装不下') >= 0 && policy) return tr('civic.policy.slot_mismatch', {
      policyName: policyName(policy), slotType: slotName(policy.type || 'wild')
    }, why);
    if (why.indexOf('市政点') >= 0 && policy) return tr('civic.policy.status.requires_civic_points', null, why);
    return why;
  }
  function res() { return SB.game.run(); }
  var techViewEra = 0;
  var civicViewEra = 0, civicEraChosen = false;
  var ERA_LOCALE_SLUGS = {
    1: 'undercurrent', 2: 'coldfire', 3: 'sulfur_vent', 4: 'ocean_current',
    5: 'shellbreak', 6: 'emergence', 7: 'stars', 8: 'exploration',
    9: 'seeking_light', 10: 'starforging'
  };
  function techName(technology) {
    return tr('tech.' + technology.id + '.name', null, technology.name);
  }
  function civicName(civic) {
    return tr('civic.data.' + civic.id + '.name', null, civic.name);
  }
  function eraOf(n) {
    var E = SB.ERAS || [];
    for (var i = 0; i < E.length; i++) {
      if (E[i].id === n) {
        var era = E[i], slug = ERA_LOCALE_SLUGS[era.id];
        if (!slug) return era;
        return {
          id: era.id,
          name: tr('tech.era.' + slug + '.name', null, era.name),
          motto: tr('tech.era.' + slug + '.motto', null, era.motto),
          desc: tr(era.id === 5 ? 'research.era.shellbreak.description' : 'tech.era.' + slug + '.description',
            era.id === 5 ? { shellThicknessPercent: 25 } : null, era.desc),
          color: era.color,
          glyph: tr('tech.era.' + slug + '.numeral', null, era.glyph)
        };
      }
    }
    return { id: n, name: n + ' 纪元', motto: '', color: '#6FE3D2', desc: '' };
  }
  /* ── 自动研究拨动开关（2026-11-01 用户：「把按钮改到科技、市政界面，做成拨动开关」）
   * 开关从「轮回商店 → 天赋树节点下方」搬到**用得着它的那一页**：玩家决定要不要开自动
   * 研究时，人就在科技页 / 市政页，不该为了按一下先跳到另一个页签再跳回来。
   *   解锁仍是轮回天赋 autoStudy / autoCivic，买断事实读 meta.perks（与
   *   auto-research.js 的 unlocked() 同源）；开关值只读 meta.autoResearch。
   *   本函数不缓存、不派生第二份真相 —— 点击后由 prestige.toggleAutoResearch 落盘，
   *   随 renderAll 重绘回读（这也是「面板显示 === 实际生效」的唯一保证）。
   * ⚠️ 未解锁**也渲染**（灰锁态），不隐藏：藏起来等于这个 20 点的天赋买完，玩家在
   *    页面上看不出任何变化，还得自己回商店翻才知道多了个开关。
   * ⚠️ 结构里带嵌套 span ⇒ input.js 的点击委托必须从 e.target 往上 closest 回
   *    [data-auto-research]；直读 dataset 会像 data-perk 那样「看着能点、点了没反应」。 */
  function autoResearchSwitch(kind) {
    var tech = kind === 'tech';
    var m = (SB.game && SB.game.meta) ? SB.game.meta() : null;
    var perkId = tech ? 'autoStudy' : 'autoCivic';
    var owned = !!(m && m.perks && m.perks[perkId] > 0);
    var on = !!(owned && m.autoResearch && m.autoResearch[kind] === true);
    var typeName = tr(tech ? 'research.auto.type.technology' : 'research.auto.type.civics', null, tech ? '科技' : '市政');
    var perkName = tr(tech ? 'prestige.perk.auto_study.name' : 'prestige.perk.auto_civic.name', null, tech ? '科技自转' : '市政自转');
    var branch = tr(tech ? 'ui.prestige.tree.visionaries.name' : 'ui.prestige.tree.political_economy.name', null,
      tech ? '远见之人' : '政经往来');
    var hint = owned
      ? tr(on ? 'research.auto.state.on' : 'research.auto.state.off', null, on ? '已开启' : '已关闭')
      : tr('research.auto_perk.locked_label', { perkName: perkName }, '未解锁 · 轮回天赋「' + perkName + '」');
    var tip = owned
      ? tr('research.auto_perk.requirements.tooltip', { researchType: typeName },
        '自动研究' + typeName + '：每项仍要过 canStudy / canResearch，不绕过尤里卡、前置、纪元与资源门槛')
      : tr('research.auto_perk.unlock.tooltip', { prestigePointCost: 20, perkName: perkName, perkBranch: branch },
        '在顶栏「轮回商店 → ' + branch + '」花 20 点买下「' + perkName + '」，这个开关才会解锁');
    /* 锁态用一枚挂锁代替滑块：光靠「灰轨道 + 虚线边」会被读成「关着的开关」，
     * 玩家点两下发现没反应才知道不是那么回事。挂锁是这一眼就懂的符号。 */
    var track = owned
      ? '<span class="sw-track" aria-hidden="true"><span class="sw-knob"></span></span>'
      : '<span class="sw-track sw-track-lock" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" focusable="false"><rect x="5.5" y="10.5" width="13" height="9" rx="2.4"/>' +
        '<path d="M8.6 10.5V8a3.4 3.4 0 0 1 6.8 0v2.5"/></svg></span>';
    var inner = track +
      '<span class="sw-copy"><b>' + tr('research.auto.label', { researchType: typeName }, '自动研究' + typeName) + '</b><i>' + hint + '</i></span>';
    if (!owned) {
      return '<div class="auto-research-bar is-locked"><span class="sw" role="switch" ' +
        'aria-checked="false" aria-disabled="true" data-auto-locked="' + kind +
        '" title="' + tip + '">' + inner + '</span></div>';
    }
    return '<div class="auto-research-bar"><button type="button" class="sw' + (on ? ' on' : '') +
      '" role="switch" aria-checked="' + on + '" data-auto-research="' + kind +
      '" title="' + tip + '">' + inner + '</button></div>';
  }

  /* ── 科技树本体（文明 6 式横卷）─────────────────────────────────────
   * 【为什么不是「第 N 层」小标题的竖排列表】用户 2026-09-26 明确纠正过两次：
   *   竖排列表里层一和层二读起来是**上下并列**，玩家看不出先后；文明 6 是把节点
   *   摆成 (列, 行) 的横卷，列 = 推进方向，跨列画连线，图比视口宽、横向滚动看后面。
   *   上一轮做成带「第 N 层」标题的分桶列表，被驳回 —— 它仍然是个列表。
   *
   * 【几何来自 tech.layout()，这里一行算术都不自己算】列号在 techs.js 里声明，
   *   行号是排版的产物。渲染只读 `data-x/data-y`，不重算 —— 重算就等于有两份真相，
   *   改了数据那边、这边还按旧公式摆，树会自己长歪。
   *
   * ⚠️ 未揭示的节点不上图（isRevealed 是尤里卡条件的可见性）⇒ 连线只在**两端都可见**
   *   时才画。否则会画出一条指向空气、而空气过一会儿又变成别的节点的线。
   * ⚠️ 节点宽度/高度走内联 style 而不是写死在 CSS 里：尺寸是几何的一部分，
   *   它和 PITCH 必须一起改，分开写在两个文件里迟早对不上。 */
  function techTree(s) {
    if (!SB.tech || !SB.tech.layout) return '<div class="note">' +
      tr('research.tree.geometry_not_loaded', null, '科技树几何尚未加载。') + '</div>';
    var L = SB.tech.layout(), G = L.geo, CP = SB.tech.pitch.col;
    var era = s.era || 1, T = SB.TECHS || [], i, b;

    var h = '<div class="techscroll tree-tech" id="techScroll"><div class="techcanvas"' +
      ' style="width:' + L.w + 'px;height:' + L.h + 'px">';

    /* ── 纪元轨道（横幅，钉在树顶当刻度）── */
    for (b = 0; b < L.blocks.length; b++) {
      var blk = L.blocks[b], er = eraOf(blk.era);
      var bx = G.PADX + blk.offset, bw = blk.cols * CP - G.COL;
      h += '<div class="tnband' + (blk.era === era ? ' on' : '') +
        '" style="left:' + bx + 'px;width:' + bw + 'px;color:' +
        (blk.era < era ? '#5b6b80' : er.color) + '">' +
        '<span class="tng">' + (er.glyph || '') + '</span>' + er.name +
        '<span class="tnc">' + tr('research.tree.era.column_count', { columnCount: blk.cols }, blk.cols + ' 列') + '</span></div>';
    }

    /* ── 连线：一层 SVG 压在节点底下 ── */
    h += '<svg class="techlines" width="' + L.w + '" height="' + L.h + '">' ;
    for (i = 0; i < L.edges.length; i++) {
      var e = L.edges[i], a = e.from, c = e.to;
      var ta = byIdOf(T, a), tc = byIdOf(T, c);
      if (!ta || !tc) continue;
      var va = visOf(s, ta, era), vb = visOf(s, tc, era);
      if (!va || !vb) continue;
      var cls = 'tel' + (s.techs[a] && s.techs[c] ? ' done' :
        (s.techs[a] ? ' open' : ''));
      h += '<path class="' + cls + '" d="' + e.d + '"></path>';
    }
    h += '</svg>';

    /* ── 节点 ── */
    for (i = 0; i < T.length; i++) {
      var t = T[i], cell = L.cells[t.id];
      if (!cell) continue;
      if (!visOf(s, t, era)) continue;              // 未揭示的不上图
      h += techNode(s, t, cell, G.W, G.H, G);
    }

    h += '</div></div>';
    return h;
  }

  function byIdOf(T, id) {
    for (var i = 0; i < T.length; i++) if (T[i].id === id) return T[i];
    return null;
  }

  /* 可见性 = 「这个节点在图上有位置」。判据只有一条：**当前纪元与更早的纪元全部上图**，
   * 未来纪元不上图（那纪元的悬念留到抵达时）。
   *
   * ⚠️ 2026-09-26 改：原判据里还有一条 `SB.tech.isRevealed`，于是「可见」与「亮出内容」
   *    被绑成同一件事 —— 进新纪元时 revealEra 把整批节点刷成已揭示，玩家看到的就是
   *    「尤里卡写着 0/60、科技名称与效果却已经摊在面前」（用户截图里报的那个问题）。
   *    现在两者分开：
   *      可见（本函数）⇒ 卡片出现在图上，未达成时是「未揭露的科技」占位 + 条件进度
   *      亮出（techNode 的 lit）⇒ 才显示科技名称与效果
   *    分开之后，「进新纪元是一整页空白」与「整批泄露内容」两个坏法同时消失了。 */
  function visOf(s, t, era) {
    return t.era <= era;
  }

  /* 科技卡片两态（用户 2026-09-26 截图指出：未达成尤里卡却已亮出科技内容/按钮，不对）。
   *   lit（metOf 为真 = 已掌握 / 达成过尤里卡至少一次）
   *     ⇒ 亮出科技名称与效果，**不再显示尤里卡进度**（用户原话：达到过就直接显示内容）。
   *   !lit（尤里卡没达成过）
   *     ⇒ 标题写「未揭露的科技」，效果行藏掉，只保留条件 + 进度条（用户选「保留条件+进度条」），
   *        研究按钮因 studyBlocked 返回「尤里卡未达成」而灰掉。
   * 两态的判据统一走 SB.tech.metOf —— 那本是 canStudy 的第四条门禁，渲染复用它，
   * 避免「亮没亮」与「能不能研究」各算各的而错位。 */
  function techNode(s, t, cell, w, hh, G) {
    var lv = SB.tech.level(s, t.id), maxLv = SB.tech.maxLevel(t);
    var done = lv >= maxLv;
    var partial = lv > 0 && !done;
    var lit = SB.tech.metOf(s, t);          // 已掌握 / 达成过尤里卡 = 亮出内容
    var localizedName = techName(t);
    var eureka = !lit ? SB.tech.condShort(s, t.cond) : null;
    /* 追踪尤里卡（2026-10-30 用户拍板「两处都放」）：只在**未揭示**时给 ——
     * 揭示=尤里卡已达成，没什么可追。
     * ⚠️ 用 `<span role="button">` 而不是 `<button>`：卡片本身就是 <button>，HTML 不许嵌套；
     *   点击由 input.js 的 document 委托拾取，且必须**先于** `[data-tree-node]` 判断，
     *   否则点 ★ 会先冒泡成「打开详情」。 */
    var trackStar = '';
    if (!lit && t.cond && t.cond.t !== 'default') {
      var _tk = (SB.ui.track && SB.ui.track.isTracked) ? SB.ui.track.isTracked('tech', t.id) : false;
      trackStar = '<span class="tree-track' + (_tk ? ' on' : '') + '" role="button"' +
        ' data-track-toggle="tech:' + t.id + '" aria-label="' + tr('research.tech.track_eureka.aria_label', null, '追踪尤里卡条件') + '"' +
        ' title="' + tr(_tk ? 'tree.track.stop' : 'tree.track.eureka', null, _tk ? '取消追踪尤里卡' : '追踪尤里卡') + '">★</span>';
    }
    var why = done ? null : SB.tech.studyBlocked(s, t.id);
    var fut = t.era > (s.era || 1);
    var status = done ? tr('tree.detail.status.completed', null, '已掌握')
      : partial ? tr('research.tech.partial_level.status', { level: lv, maxLevel: maxLv }, '等级 ' + lv + '/' + maxLv)
      : !lit ? tr('tree.detail.status.unrevealed', null, '未揭示')
      : why ? tr('tree.detail.status.unavailable', null, '暂不可研究')
      : tr('tree.detail.status.ready_to_research', null, '可研究');
    var eurekaPct = eureka && eureka.need > 0
      ? Math.max(0, Math.min(100, eureka.now / eureka.need * 100)) : 0;
    /* 挑战专属科技配色拆分（2026-11-08）：通用专属走 .co-node 琥珀细边，
     * 冰蓝的 .terra-tech-node 只留给流浪泰拉 4 项 —— 改前《装罐填埋》（水体污染）
     * 也被涂成泰拉配色，唯一的视觉区分反而在误导。归一化读共用 helper，不另写判定。 */
    var _coIds = (SB.ui.renderCommon && SB.ui.renderCommon.challengeTagIds)
      ? SB.ui.renderCommon.challengeTagIds(t) : [];
    /* ⚠️ 与角标同源：只给**当前周目**允许的专属节点上色。否则泰拉周目里
     *   水体污染的《装罐填埋》会顶着琥珀边却没有角标（UI 用 A、门禁用 B 的错位），
     *   基游戏里不该出现的节点也会莫名变色。 */
    var _coActive = _coIds.length > 0 && s && s.challenge && _coIds.indexOf(s.challenge.id) >= 0;
    /* ⚠️ 角标不能塞进 .tnhd：那是「图标 + 名字 + 关键标签」的紧凑 flex 行，
     *   多两个 item 会把 .tnm 挤成竖排（2026-11-08 CDP 截图实证「装罐填埋」四字换行）。
     *   移到 .tnhd 之后作为节点内独立一行，名字宽度不受影响。 */
    var _coHTML = SB.ui.renderCommon.challengeTag ? SB.ui.renderCommon.challengeTag(s, t) : '';
    var cls = 'technode st' + (done ? ' done' : why ? ' lock' : ' open') + (partial ? ' partial' : '') + (fut ? ' fut' : '') +
      (_coActive ? ' co-node' : '') +
      (_coActive && _coIds.indexOf('drift_terra') >= 0 ? ' terra-tech-node' : '') + ' tree-node';
    var h = '<button type="button" class="' + cls + '" id="techrow-' + t.id + '"' +
      ' data-node="' + t.id + '" data-x="' + cell.x + '" data-y="' + cell.y + '"' +
      ' data-layer="' + cell.layer + '"' +
      ' data-lit="' + (lit ? 1 : 0) + '"' +
      ' data-tree-node="1" data-tree-type="tech" data-tree-id="' + t.id + '"' +
      ' aria-label="' + tr('research.tree.node.aria_label', { nodeName: lit ? localizedName : tr('tree.detail.unrevealed.title', { nodeType: tr('tree.node_type.technology', null, '科技') }, '未揭露的科技'), nodeStatus: status }, (lit ? localizedName : '未揭露的科技') + '，' + status + '，打开详情') + '"' +
      ' style="left:' + cell.x + 'px;top:' + cell.y + 'px;width:' + w + 'px;height:' + hh + 'px">';
    h += '<span class="tnhd">' + SB.ui.renderCommon.treeIconHTML(t, lit, 'tree-node-icon branch-' + (t.branch || 'know')) +
      '<span class="tnm">' + (lit ? localizedName : tr('tree.detail.unrevealed.title', { nodeType: tr('tree.node_type.technology', null, '科技') }, '未揭露的科技')) + '</span>' +
      (t.key ? '<span class="tntag">' + tr('tree.node.tag.key', null, '关键') + '</span>' : '') + '</span>' +
      (_coHTML ? '<span class="co-tag-wrap">' + _coHTML + '</span>' : '') +
      (!lit ? '<span class="tree-eureka">' + tr('tree.condition.eureka.heading', null, '尤里卡') + ' · ' + (eureka ? eureka.txt : tr('tree.condition.eureka.default', null, '达成条件后揭示')) + '</span>' +
        (eureka && eureka.need > 0 ? '<span class="tree-eureka-meter"><span class="tree-eureka-track"><i style="width:' + eurekaPct.toFixed(1) + '%"></i></span><b>' + eurekaPct.toFixed(0) + '%</b></span>' : '') : '') +
      '<span class="tree-node-foot"><i class="tree-state-dot"></i>' +
      '<span class="tree-node-status">' + status + '</span>' + trackStar +
      '<span class="tree-open-hint">' + tr('tree.detail.open_hint', null, '查看详情　›') + '</span></span></button>';
    return h;
  }

  /* 科技面板未开门时的空态。
   * 【为什么要有这一屏而不是什么都不画】关闭条件是「建成 5 座深海藻场」，
   * tab 被 gate 掉之后玩家不会从 tab 进来到这里；但如果他记得 tab 位置，或
   * 存档从别的路径带进来，空面板 + 一句「为什么是空的」比空白强得多。
   * 门是派生的，所以这一屏的门槛数字也从 cond 读，不写死成 5。 */
  function paneTechLocked() {
    var w = SB.tech && SB.tech.byId ? SB.tech.byId('writing') : null;
    var need = (w && w.cond && w.cond.n) || 5;
    var habitatName = SB.habitat.habitatName(SB.game.run());
    return '<div class="row"><div><div class="nm">' + tr('research.panel.locked.title', null, '科技 · 未翻开') + '</div>' +
      '<div class="ds">' + tr('research.tech.locked_page.description', { farmCount: need }, '族里还分不出「今天」和「明天」——没有值得记下来的事，也就没有「明天」。建成 ' + need + ' 座深海藻场之后，这页才会打开。') + '</div></div></div>' +
      '<div class="note">' + tr('research.tech.locked_page.hint', { habitatName: habitatName, farmCount: need }, '在「' + habitatName + '」页铺藻场就行，它的产出就是「今天」；第 ' + need + ' 座落成时你会知道的。') + '</div>';
  }

  /* ── 纪元导航（2026-09-26 用户第三次重构科技页）────────────────────
   * 原状是「当前纪元横幅 + 五张竖排纪元卡片 + 长卷」三块。五张卡各约 130px，
   * 手机上要滑过一整屏才够到树，而每张卡里真正的新信息只有一句描述。用户的话：
   *   「这部分文本内容能不能放在科技树标题这里，然后在这里设计几个按钮，
   *     点一下就自动跳转到该纪元的科技树」。
   * 于是长卷标题区只剩两块：
   *   · 一排纪元按钮 —— 名称 + 该纪元进度。点它选中该纪元；已抵达的还会把长卷
   *     横向滚到那一纪元的左边界（纪元按钮就是这张图的目录）。
   *   · **只出选中那一个**纪元的详情卡（名/箴言/描述）。选中的恰好是当前纪元时，
   *     再把关键节点钥匙、进度条、现有科技与下一纪元一并摊开 —— 那是原横幅的内容，
   *     挪进来而不是删掉：它是「我现在该干什么」的部分，每趟进这页都得看见。
   * ⚠️ e2e 盯着「详情卡只有一张」：五张全展开正是这次要消灭的东西，而它长得跟正确
   *    版本**一模一样**（都是 .eracard），只能靠条数钉住。
   * ⚠️ 未来纪元的按钮**不置灰**：它点下去不改长卷位置（那一纪元的节点还没现身，
   *    滚过去只有空白和一条位置横幅 —— 那正是「点了没反应」的观感），但描述是有
   *    信息量的预告，读得到。详情卡会自己说清「尚未抵达」，不用按钮的灰态暗示。 */
  function eraStats(s, e) {
    var T = SB.TECHS || [], list = [], learned = 0, i;
    for (i = 0; i < T.length; i++) if (T[i].era === e) list.push(T[i]);
    for (i = 0; i < list.length; i++) if (s.techs[list[i].id]) learned++;
    return { total: list.length, learned: learned };
  }
  /* 纪元三条状态。已过去的用冷灰 —— 它的名字不该和正在做的那个一样亮。 */
  function eraState(era, sel) {
    return sel < era ? tr('research.era.state.past', null, '已过去')
      : sel === era ? tr('research.era.state.current', null, '进行中')
      : tr('research.era.state.not_reached', null, '未抵达');
  }
  function eraColor(era, sel) {
    return sel < era ? '#5b6b80' : eraOf(sel).color;
  }

  function eraNav(s, era, sel) {
    var E = SB.ERAS || [], h = '<div class="eranav" id="eraNav">', e;
    for (e = 1; e <= E.length; e++) {
      var er = eraOf(e), st = eraStats(s, e), col = eraColor(era, e);
      var label = eraState(era, e);
      h += '<button type="button" class="erabtn' + (e === sel ? ' on' : '') +
        (e === era ? ' cur' : '') + '" data-era="' + e + '"' +
        ' title="' + er.name + '「' + er.motto + '」· ' + label + ' ' +
        st.learned + '/' + st.total + ' · ' + tr(e <= era ? 'research.era.nav.jump_hint' : 'research.era.state.not_reached', null, e <= era ? '点它跳到这一纪元' : '尚未抵达') + '">' +
        '<span class="g" style="color:' + col + '">' + (er.glyph || '') + '</span>' +
        '<span class="n" style="color:' + col + '">' + er.name + '</span>' +
        '<span class="c">' + st.learned + '/' + st.total + '</span></button>';
    }
    /* 怎么读这张图 —— 原来挂在纪元一那张卡片里（只在当前纪元可见），
     * 现在它是长卷的图注，谁看这张图都该看到，所以不再挂条件。 */
    h += '</div><div class="note">' + tr('research.tree.scroll.instructions', null,
      '这张长卷按列推进：同一个纪元的每一项占一列，列号越往右越深，前置到本项之间画连线。图比这一屏宽，按住拖动（鼠标）或横向滑动（手指）看后面的纪元，也可以点上面的纪元按钮直接跳过去。') + '</div>';
    return h;
  }

  function eraDetail(s, era, sel, prog, sci) {
    var er = eraOf(sel), st = eraStats(s, sel), col = eraColor(era, sel);
    var label = eraState(era, sel);
    var h = '<div class="eracard' + (sel === era ? ' active' : '') + '" id="eraDetail"' +
      ' style="border-left-color:' + col + '">' +
      '<div class="erahd"><span class="glyph" style="color:' + col + '">' + (er.glyph || '') + '</span>' +
      '<span class="enm" style="color:' + col + '">' + er.name + '</span>' +
      '<span class="emotto">' + er.motto + '</span>' +
      '<span class="estate" style="background:' + (sel === era ? '#123a52' : '#153048') +
      ';color:' + col + '">' + label + ' · ' + st.learned + '/' + st.total + '</span></div>' +
      '<div class="edesc">' + er.desc + '</div>';

    if (sel === era) {
      /* 当前纪元：把「还差什么」摊开。这一段是原「当前纪元横幅」的内容，
       * 逐句搬过来 —— 删掉它这页就只剩一张地图，玩家不知道该往哪使力。
       * ⚠️ ERA10（2026-10-20）：**终局纪元必须单独分支**。keysOf(10) = 0（没有关键节点闸门，
       *    advanceEra 靠 `p.era >= E.length` 兜底，既不会瞬跳也不可能再推进），沿用通用文案会打出
       *    「本纪元关键节点 0 / 0。全部掌握即进入下一纪元」——一句在终局完全不成立的谎，
       *    0/0 的迷你进度条还像页面坏了。终局真正该说清的是「通关条件去哪看」。 */
      var isLast = era >= (SB.ERAS || []).length;
      if (isLast) {
        h += '<div class="edesc">' + tr('research.era.final.complete_note', {
          finalEraTechnologyCount: st.total, sphereCompletionPercent: 100,
          solarSailCount: 10000, dysonNodeCount: 1000
        }, '终局纪元：本纪元不设关键节点闸门，也没有下一纪元，七项科技点完为止。通关看<b>戴森球</b>——星图页的戴森球面板到 100%（太阳帆 10000 ＋ 戴森球节点 1000）即竣工。') + '</div>';
      } else {
        var keys = SB.tech.keysOf(era), kl = '', i;
        for (i = 0; i < keys.length; i++) {
          var k = keys[i];
          kl += '<span class="' + (s.techs[k.id] ? 'done' : '') + '">' +
            (s.techs[k.id] ? '✓ ' : '○ ') + techName(k) + '</span>';
        }
        h += '<div class="keysline">' + kl + '</div>';
        h += '<div class="minibar" style="margin-top:7px"><i style="width:' +
          (prog.keysTotal ? (prog.keysDone / prog.keysTotal * 100).toFixed(0) : 0) + '%"></i></div>';
        h += '<div class="edesc">' + tr('research.era.key_progress_gate', {
          completedKeyCount: prog.keysDone, totalKeyCount: prog.keysTotal
        }, '本纪元关键节点 ' + prog.keysDone + ' / ' + prog.keysTotal + '。全部掌握即进入下一纪元——越纪元研究是不可能的，这是硬闸门。') + '</div>';
      }
      var next = era < (SB.ERAS || []).length ? eraOf(era + 1) : null;
      h += '<div class="teaser">' + tr('research.era.current.science_summary', {
        researchPoints: Math.floor(s.res.science), researchPerSecond: sci.toFixed(2)
      }, '现有科技 ' + Math.floor(s.res.science) + '（+' + sci.toFixed(2) + '/ 秒）');
      h += next ? '<br>' + tr('research.era.current.next_preview', {
        nextEraName: next.name, nextEraMotto: next.motto, nextEraDescription: next.desc
      }, '下一纪元：' + next.name + '「' + next.motto + '」' + next.desc)
        : '<br>' + tr('research.era.current.final_preview', null, '这是终局纪元。');
      h += '</div>';
    } else if (sel < era) {
      h += '<div class="edesc">' + tr('research.era.past.explanation', null,
        '这个纪元已经过去：它的节点全部摊在长卷左边那一段里，随时可以回头补完（补不再卡纪元闸门）。') + '</div>';
    } else {
      /* ⚠️ 说清「长卷上目前只有它那条位置横幅」，否则玩家点完按钮看见一片空白
       *    会以为是坏了（纪元横幅是画给所有纪元的，节点才要等抵达）。 */
      h += '<div class="edesc">' + tr('research.era.future.locked_explanation', { eraName: eraOf(era).name },
        '尚未抵达——把 ' + eraOf(era).name + ' 的关键节点全部掌握，闸门才会打开，这一纪元的尤里卡条件到那时才现身。长卷上目前只有它一条位置横幅，所以点它不会滚过去。') + '</div>';
    }
    h += '</div>';
    return h;
  }

  function civicEraStats(s, era) {
    var C = SB.CIVICS || [], total = 0, completed = 0, revealed = 0;
    for (var i = 0; i < C.length; i++) {
      if ((C[i].era || 1) !== era) continue;
      /* 挑战专属市政不计数（2026-11-02）：否则基游戏里 era3 会显示「5 项 · 已完成 2」，
       * 而其中 1 项根本不存在于本周目（「树已展开」的数字会永远差一格）。 */
      if (C[i].challengeOnly && SB.civic.challengeAllows && !SB.civic.challengeAllows(s, C[i])) continue;
      total++;
      if (s.civics && s.civics[C[i].id]) completed++;
      if (SB.civic.isRevealed(s, C[i].id)) revealed++;
    }
    return { total: total, completed: completed, revealed: revealed };
  }

  function civicEraNav(s, gameEra, visibleEra, sel) {
    var E = SB.ERAS || [], h = '<div class="eranav" id="civicEraNav">';
    for (var e = 1; e <= E.length; e++) {
      var er = eraOf(e), st = civicEraStats(s, e), col = eraColor(visibleEra, e);
      var treeLabel = tr(e < visibleEra ? 'research.era.tree_status.revealed' : e === visibleEra ? 'research.era.tree_status.current' : 'research.era.tree_status.hidden', null,
        e < visibleEra ? '树已展开' : e === visibleEra ? '当前展开' : '树未展开');
      var gateLabel = tr(e <= gameEra ? 'research.era.science_gate.reached' : 'research.era.science_gate.not_reached', null,
        e <= gameEra ? '科技纪元已抵达' : '尚未到达科技纪元');
      var selectionHint = tr(e <= visibleEra ? 'research.era.nav.jump_hint' : 'civic.era.nav.reveal_hint', null,
        e <= visibleEra ? '点它跳到这一纪元' : '可查看揭示条件');
      h += '<button type="button" class="erabtn civic-erabtn' + (e === sel ? ' on' : '') +
        (e === visibleEra ? ' cur' : '') + '" data-civic-era="' + e + '"' +
        ' title="' + tr('civic.era.navigation.tooltip', {
          eraName: er.name, eraMotto: er.motto, treeStatus: treeLabel, scienceEraStatus: gateLabel,
          completedCount: st.completed, totalCount: st.total, revealedCount: st.revealed, selectionHint: selectionHint
        }, er.name + '「' + er.motto + '」· ' + treeLabel + ' · ' + gateLabel + ' · 已完成 ' + st.completed + '/' + st.total + ' · 已揭示 ' + st.revealed + '/' + st.total + ' · ' + selectionHint) + '">' +
        '<span class="g" style="color:' + col + '">' + (er.glyph || '') + '</span>' +
        '<span class="n" style="color:' + col + '">' + er.name + '</span>' +
        '<span class="c">' + st.completed + '/' + st.total + '</span></button>';
    }
    return h + '</div><div class="note">' + tr('civic.era.next_tree_reveal.note', null,
      '每完成一个纪元的任意一项市政，就揭露下一个纪元的市政树结构；市政名称与效果仍需满足各自的鼓舞条件才会揭示。') + '</div>';
  }

  function civicEraDetail(s, gameEra, visibleEra, sel) {
    var er = eraOf(sel), st = civicEraStats(s, sel), col = eraColor(visibleEra, sel);
    var treeState = tr(sel < visibleEra ? 'research.era.tree_status.revealed' : sel === visibleEra ? 'research.era.tree_status.current' : 'research.era.tree_status.hidden', null,
      sel < visibleEra ? '树已展开' : sel === visibleEra ? '当前展开' : '树未展开');
    var scienceState = tr(sel <= gameEra ? 'research.era.science_gate.reached' : 'research.era.science_gate.not_reached', null,
      sel <= gameEra ? '科技纪元已抵达' : '科技纪元未抵达');
    var h = '<div class="eracard' + (sel === visibleEra ? ' active' : '') + '" id="civicEraDetail"' +
      ' style="border-left-color:' + col + '">' +
      '<div class="erahd"><span class="glyph" style="color:' + col + '">' + (er.glyph || '') + '</span>' +
      '<span class="enm" style="color:' + col + '">' + er.name + '</span>' +
      '<span class="emotto">' + er.motto + '</span>' +
      '<span class="estate" style="background:' + (sel === visibleEra ? '#123a52' : '#153048') +
      ';color:' + col + '">' + tr('civic.era.detail.status_summary', {
        treeStatus: treeState, scienceEraStatus: scienceState, completedCount: st.completed,
        totalCount: st.total, revealedCount: st.revealed
      }, treeState + ' · ' + scienceState + ' · 已完成 ' + st.completed + '/' + st.total + ' · 已揭示 ' + st.revealed + '/' + st.total) + '</span></div>' +
      '<div class="edesc">' + er.desc + '</div>';
    if (sel < visibleEra) {
      h += '<div class="edesc">' + tr('civic.era.tree_revealed.explanation', null, '这个纪元的市政树已经展开，可以查看其中的节点。') + '</div>';
    } else if (sel > visibleEra) {
      var prev = eraOf(sel - 1);
      h += '<div class="edesc">' + tr('civic.era.previous_civic_reveal_hint', { previousEraName: prev.name }, '完成' + prev.name + '任意一项市政后，才会揭露这一纪元的市政树结构。') + '</div>';
    } else {
      var next = eraOf(sel + 1), maxEra = (SB.ERAS || []).length;
      h += '<div class="teaser">' + tr('civic.era.progress_summary', {
        completedCount: st.completed, totalCount: st.total, revealedCount: st.revealed
      }, '本纪元完成 ' + st.completed + ' / ' + st.total + ' 项市政，已揭示 ' + st.revealed + ' 项。') + ' ' +
        (sel < maxEra ? tr('civic.era.next_reveal_hint', { nextEraName: next.name }, '完成本纪元任意一项市政，即揭露' + next.name + '的市政树结构。')
          : tr('civic.era.all_trees_revealed.note', null, '全部纪元的市政树结构都已揭露。')) + '</div>';
    }
    if (sel > gameEra) h += '<div class="edesc">' + tr(sel <= visibleEra ? 'civic.era.waits_for_tech_after_reveal' : 'civic.era.waits_for_tech_before_reveal',
      { scienceEraName: er.name }, sel <= visibleEra
        ? '该纪元市政树已揭露，但要等科技纪元推进到' + er.name + '后才能研究其中的市政。'
        : '即使之后揭露了该纪元市政树，也要等科技纪元推进到' + er.name + '后才能研究其中的市政。') + '</div>';
    return h + '</div>';
  }

  function paneTech() {
    var s = res();
    /* 门与 tab 的灰读同一份派生值（SB.tech.panelOpen），不在这里另算一次。 */
    if (SB.tech && SB.tech.panelOpen && !SB.tech.panelOpen(s)) return paneTechLocked();
    var era = s.era || 1, E = SB.ERAS || [];
    var prog = SB.tech.eraProgress(s);
    var sci = SB.economy.rates(s).science || 0;
    /* 归一化后写回模块状态：按钮、详情卡、techGoEra 三处读的必须是同一个值。
     * （techViewEra 存 0 = 跟随当前纪元，这里把它翻译成具体的 era。） */
    var sel = (techViewEra >= 1 && techViewEra <= E.length) ? techViewEra : era;
    techViewEra = sel;

    var h = autoResearchSwitch('tech') + eraNav(s, era, sel);
    h += eraDetail(s, era, sel, prog, sci);
    h += techTree(s);
    h += '<div class="note">' + tr('research.technology.explanation.note', null,
      '尤里卡只「揭示」节点本身，不折算研究进度（设计已定）。研究是即时扣费：科技够了点一下就掌握，没有队列。') + '</div>';
    return h;
  }

  /* 破壳面板：让玩家看清「系数从哪来」和「祭坛为什么停」。
   * 这两件事一旦变成黑箱，玩家不知道自己该做什么，机制就白设了。 */
  /* ── 市政页（2026-09-27 兑现「议事厅开启市政树」那条欠账）────────────
   * 三块由上到下：**政体 → 政策卡槽 → 市政树**。这个顺序就是玩家的决策顺序——
   *   先看自己处在哪个政体（决定有几个槽），再选装哪张卡（槽之间的取舍），
   *   最后才是「为了拿某个卡，要不要先点出某条市政」。
   * ⚠️ 它**不是科技页的复制**：科技是「解锁什么」，市政是「你是谁、按哪套规矩办事」，
   *    所以政体与卡占了上面两整块，树只占下面一块。
   * ⚠️ 面板未开门时整页不渲染（与 paneTechLocked 同一手法），页面签上才不会
   *    出现「一个空壳页」。 */
  var civicView = 'government';
  function setCivicView(view) {
    if (view !== 'government' && view !== 'tree') return false;
    civicView = view;
    return true;
  }
  function emptyCivicSlotCount(s, C, list) {
    var slots = list || C.slotList(s), count = 0;
    for (var i = 0; i < slots.length; i++) {
      var cardId = s.cards && s.cards[i];
      if (!cardId || !C.policyById(cardId)) count++;
    }
    return count;
  }
  function civicNoticeState(s) {
    var C = SB.civic;
    if (!s || !C || !C.panelOpen(s)) return { emptySlots: 0, researchable: false };
    return {
      emptySlots: emptyCivicSlotCount(s, C),
      researchable: !!(C.hasResearchable && C.hasResearchable(s))
    };
  }
  function paneCivic() {
    var s = res();
    if (!SB.civic || !SB.civic.panelOpen(s)) return paneCivicLocked();
    var notice = civicNoticeState(s);
    var govHint = notice.emptySlots > 0
      ? '<span class="civic-subtab-status" aria-label="' + tr('civic.tab.empty_policy_slot.aria_label', null, '有空政策卡槽') + '"><i aria-hidden="true"></i>' +
        tr('civic.tab.empty_policy_slot.aria_label', null, '有空槽') + '</span>' : '';
    var treeHint = notice.researchable
      ? '<span class="civic-subtab-status" aria-label="' + tr('civic.tab.researchable.aria_label', null, '有可研究市政') + '"><i aria-hidden="true"></i>' +
        tr('civic.tab.researchable.status', null, '可研究市政') + '</span>' : '';
    var h = '<div class="panel-subtabs civic-subtabs" role="group" aria-label="' + tr('civic.subtabs.aria_label', null, '市政分区') + '">' +
      '<button type="button" class="subtab' + (civicView === 'government' ? ' on' : '') +
      '" data-civic-view="government" aria-pressed="' + (civicView === 'government') + '">' + tr('civic.subtab.government', null, '政体') + govHint + '</button>' +
      '<button type="button" class="subtab' + (civicView === 'tree' ? ' on' : '') +
      '" data-civic-view="tree" aria-pressed="' + (civicView === 'tree') + '">' + tr('civic.subtab.tree', null, '市政树') + treeHint + '</button></div>';
    return h + autoResearchSwitch('civic') + (civicView === 'tree'
      ? '<div class="subtab-panel civic-tree-panel">' + civicTree(s) + '</div>'
      : '<div class="subtab-panel civic-government-panel">' + paneCivicGov(s) + paneCivicSlot(s) + '</div>');
  }

  function paneCivicLocked() {
    var s = res();
    var why = SB.civic ? SB.civic.panelBlock(s) : tr('civic.system.locked.fallback', null, '市政系统尚未解锁。');
    var scribeName = SB.folk.jobName(s, 'scribe');
    return '<div class="secttl">' + tr('ui.research.type.civics', null, '市政') + '</div>' +
      '<div class="row"><div class="nm">' + tr('civic.page.locked.title', null, '市政页未开启') + '</div>' +
      '<div class="ds">' + (SB.i18n && SB.i18n.getLocale && SB.i18n.getLocale() === 'en-US'
        ? tr('civic.panel.council_hall.prerequisite', null, why || '') : (why || '')) + '</div></div>' +
      '<div class="note">' + tr('civic.pane.unlock_hint', { scribeJob: tr('job.name.scribe', null, scribeName) },
        '议事厅由「石工」解锁，它同时是' + scribeName + '这个职业的来源——建起来之后这里会给出：政体、政策卡槽，以及三条市政。') + '</div>';
  }

  /* 政体符号：统一的线性徽记，用几何关系表达权力结构，不依赖 emoji 字体。 */
  var GOV_SYMBOL_ART = {
    tribe: '<circle cx="16" cy="16" r="3"/><circle cx="16" cy="5.5" r="2"/><circle cx="6.7" cy="22" r="2"/><circle cx="25.3" cy="22" r="2"/><path d="m14.4 7.2-6.1 12.9m9.4-12.9 6.1 12.9M9 23h14"/>',
    autocracy: '<path d="M16 4v24M16 5 7 12m9-7 9 7M7 12h18M10 12v9m6-9v9m6-9v9M7 23h18M5 27h22"/>',
    oligarchy: '<circle cx="16" cy="16" r="3.2"/><circle cx="8" cy="9" r="2.2"/><circle cx="24" cy="9" r="2.2"/><circle cx="8" cy="23" r="2.2"/><circle cx="24" cy="23" r="2.2"/><path d="m10 10.5 3.7 3.7m4.6 0 3.7-3.7m-12 11 3.7-3.7m4.6 0 3.7 3.7"/>',
    classical_republic: '<path d="M5 12q11-10 22 0M7 13h18M9 14v9m7-9v9m7-9v9M6 24h20M8 27h16"/>',
    monarchy: '<path d="m5 10 5 5 6-9 6 9 5-5-2 13H7L5 10Z"/><path d="M8 26h16M10 18h12"/><circle cx="16" cy="11" r="1.3"/>',
    merchant_republic: '<circle cx="16" cy="16" r="11"/><path d="M8 13h12l-2.5-2.5M24 19H12l2.5 2.5M7 16h2m14 0h2"/>',
    theocracy: '<circle cx="16" cy="8" r="4"/><path d="M16 12v14m-7-5h14M11 26h10M8 8h2m12 0h2"/>',
    theo_state: '<path d="M16 4 18.4 11.6 26 14l-7.6 2.4L16 24l-2.4-7.6L6 14l7.6-2.4L16 4Z"/><path d="M8 26h16M11 23v3m10-3v3"/>',
    egalitarianism: '<path d="M7 8h18M7 16h18M7 24h18"/><circle cx="5" cy="8" r="1"/><circle cx="5" cy="16" r="1"/><circle cx="5" cy="24" r="1"/>',
    federalism: '<path d="m16 7 7 4v9l-7 4-7-4v-9l7-4Z"/><circle cx="16" cy="16" r="2.3"/><path d="M16 7V4M23 11l3-2M23 20l3 2M9 20l-3 2M9 11 6 9M16 24v4"/>',
    interstellar_federation: '<ellipse cx="16" cy="16" rx="12" ry="5.5" transform="rotate(-28 16 16)"/><ellipse cx="16" cy="16" rx="12" ry="5.5" transform="rotate(48 16 16)"/><path d="m16 10 1.7 4.3L22 16l-4.3 1.7L16 22l-1.7-4.3L10 16l4.3-1.7L16 10Z"/>',
    star_sea_coop: '<circle cx="16" cy="16" r="3"/><circle cx="16" cy="5.5" r="2"/><circle cx="25" cy="11" r="2"/><circle cx="22" cy="22.5" r="2"/><circle cx="10" cy="22.5" r="2"/><circle cx="7" cy="11" r="2"/><path d="m16 8 7.2 2.2 1 7.3-5.8 5.7h-7.8l-5.8-5.7 1-7.3L16 8Z"/>',
    universal_church: '<circle cx="16" cy="16" r="3"/><circle cx="16" cy="16" r="8"/><path d="M16 3v3m0 20v3M3 16h3m20 0h3M6.8 6.8 9 9m14 14 2.2 2.2m0-18.4L23 9M9 23l-2.2 2.2"/>'
  };
  function govSymbol(id, extraClass) {
    return '<span class="gov-symbol gov-symbol-' + id + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true">' +
      '<svg viewBox="0 0 32 32" focusable="false">' + (GOV_SYMBOL_ART[id] || GOV_SYMBOL_ART.tribe) + '</svg></span>';
  }

  /* 政体（Civ6 式）：政体是「一份被动 + 一份槽位配方」，不是一条标签。
   * ⚠️ 三条信息必须同框才叫政体：被动（这政体自己给了什么）、槽位配方（我能摆几张什么卡）、
   *    及第 0 号槽空不空。Civ6 的政体选择之所以有分量，全在这三样拼在一起。 */
  function paneCivicGov(s) {
    var C = SB.civic;
    /* ⚠️ 2026-10-05 用户「政体不解锁就不要露出来」：与资源 unlock 描述符、
     *   建筑移除 unlockRatio 同一条纪律——未解锁的政体**整张卡都不渲染**，
     *   只渲染 govOwned 成立的。避免开局就摆一排灰着的独裁/寡头/神权提前剧透。
     *   govOwned 读对应市政 s.civics[c.id]，与 setGov 同一判据（civics.js）。 */
    var owned = [];
    for (var i = 0; i < SB.GOVS.length; i++) if (C.govOwned(s, SB.GOVS[i].id)) owned.push(SB.GOVS[i]);
    var h = '<div class="secttl">' + tr('civic.government.heading', null, '政体') + '</div>';
    if (!owned.length) {
      /* 一个都没解锁：政体系统整体还没开，给一句指引而不是一堆灰卡。
       * ⚠️ 硬编码《法典》是因为它是当前唯一解锁 tribe 的市政
       *   （e2e:2320「研究《法典》⇒ 自带酋邦制」），与 govOwned 的反查同源。 */
      h += '<div class="row"><div class="ds">' + tr('civic.government.unlock_by_civic', {
        civicName: tr('civic.name.code_of_laws', null, '法典'), governmentName: tr('civic.government.name.chiefdom', null, '酋邦制')
      }, '政体系统尚未开启——研究《法典》开启酋邦制。') + '</div></div>';
      return h;
    }
    var currentGov = null;
    for (var ci = 0; ci < owned.length; ci++) if (owned[ci].id === s.gov) currentGov = owned[ci];
    if (!currentGov) {
      return h + '<div class="row gov-current-missing"><div class="ds">' + tr('civic.government.none_active', null, '当前没有生效的政体。') + '</div>' +
        '<button type="button" class="btn buy" data-gov-picker-open>' + tr('civic.government.choose.action', null, '选择政体') + '</button></div>';
    }
    var currentTitle = C.govTitleName ? govTitle(s, currentGov) : govName(currentGov);
    return h + '<article class="gov-picker-card gov-current-card is-expanded is-current">' +
      '<div class="gov-picker-detail">' +
        '<div class="gov-current-identity">' + govSymbol(currentGov.id, 'gov-symbol-current') + '<div class="gov-current-copy">' +
          '<div class="gov-expanded-kicker">' + tr('civic.government.current.label', null, '当前政体') + ' <i class="is-current">' + tr('civic.government.current_active.note', null, '生效中') + '</i></div>' +
          '<h3 class="gov-expanded-title">' + currentTitle + '</h3></div></div>' +
        '<p class="gov-picker-desc">' + govEffect(currentGov) + govBonusNote() + '</p>' +
        (govFlavor(currentGov) ? '<p class="gov-picker-flavor b-flavor">' + govFlavor(currentGov) + '</p>' : '') +
        '<div class="gov-picker-slots"><span>' + tr('civic.policy.slots.heading', null, '政策卡槽') + '</span><strong>' + recipeText(currentGov) + '</strong></div>' +
        '<div class="gov-picker-footer"><span>' + tr('civic.government.current_active.note', null, '当前政体正在生效') + SB.ui.renderCommon.happyBonusNote(s, 'gov') + '</span>' +
          '<button type="button" class="btn buy" data-gov-picker-open>' + tr('civic.government.change.action', null, '更换政体') + '</button></div>' +
      '</div></article>';
  }

  /* 政体选择器仅由 render.js 装入弹窗；主页面始终保留当前政体摘要。 */
  function paneGovPicker(s) {
    var C = SB.civic, owned = [];
    for (var i = 0; i < SB.GOVS.length; i++) if (C.govOwned(s, SB.GOVS[i].id)) owned.push(SB.GOVS[i]);
    if (!owned.length) return '<div class="gov-picker-empty">' + tr('civic.government.no_options', null, '尚未解锁可选政体。') + '</div>';
    var options = '';
    for (var k = 0; k < owned.length; k++) {
      var v = owned[k], on = s.gov === v.id;
      var firstFree = !on && C.govFirstAdoptionFree(s, v.id);
      var why = on ? null : C.govBlocked(s, v.id);
      var tileState = on ? tr('civic.government.option.current', null, '当前')
        : (firstFree ? tr('civic.government.option.first_free', null, '首次免费')
          : (why ? tr('civic.policy.status.cannot_equip', null, '条件不足') : tr('civic.government.option.available', null, '可采纳')));
      var statusClass = on ? 'is-current' : (why ? 'is-blocked' : (firstFree ? 'is-free' : 'is-ready'));
      var adoptionCost = C.govCost(s);
      options += '<article class="gov-picker-card gov-option-card' + (on ? ' is-current' : '') + '">' +
        '<header class="gov-option-head">' + govSymbol(v.id) + '<h3>' + govName(v) + '</h3><i class="' + statusClass + '">' + tileState + '</i></header>' +
        '<p class="gov-option-desc">' + govEffect(v) + govBonusNote() + '</p>' +
        (govFlavor(v) ? '<p class="gov-option-flavor b-flavor">' + govFlavor(v) + '</p>' : '') +
          '<div class="gov-option-slots"><span>' + tr('civic.policy.slots.heading', null, '政策卡槽') + '</span><strong>' + recipeText(v) + '</strong></div>' +
        '<footer class="gov-option-footer"><span>' + (on ? tr('civic.government.current_active.note', null, '当前政体正在生效')
          : (firstFree ? tr('civic.government.first_adoption.free', null, '首次采用免费')
            : tr('civic.government.change_cost', { civicPointCost: adoptionCost }, '更换费用：' + adoptionCost + ' 市政点'))) +
          (why ? '<small>' + govBlockedText(s, v, why) + '</small>' : '') + '</span>' +
          '<button type="button" class="btn buy gov-adopt" data-gov="' + v.id + '"' + ((on || why) ? ' disabled' : '') +
          '>' + (on ? tr('civic.government.option.current', null, '当前生效')
            : (why ? tr('civic.policy.status.cannot_equip', null, '条件不足')
              : (firstFree ? tr('civic.government.first_adoption.free', null, '免费采纳') : tr('civic.government.change.action', null, '采纳政体')))) + '</button></footer>' +
        '</article>';
    }
    var h = '<div class="gov-picker-list">' + options + '</div>';
    /* 每个政体各自首次采用免费；重采用收费规则也要明示。 */
    if (C.topCost(s) > 0) {
      h += '<div class="note">' + tr('civic.government.change_cost.note', {
        civicPointCost: C.govCost(s), researchCostFraction: '1/5'
      }, '每个政体首次采用免费一次；之后更换需 ' + C.govCost(s) + ' 市政点（当前最高已完成市政研究成本的 1/5）。') + '</div>';
    }
    return h;
  }
  /* 槽位配方的中文说明，如「1 万能槽」「1 工造槽 + 1 万能槽」。
   * ⚠️ 从 slots 配方**现算**，不另存一句写死的文案 —— 改配方时文案跟不上的 bug
   *    是那种「玩家看到描述与实际槽位对不上」的静默错。 */
  function recipeText(g) {
    var n = 0, k, out = [];
    for (k in (g.slots || {})) {
      if (!(g.slots[k] > 0)) continue;
      out.push(englishLocaleEnabled()
        ? g.slots[k] + ' ' + slotTypeLabel(k) + ' ' + (g.slots[k] === 1 ? 'slot' : 'slots')
        : g.slots[k] + ' ' + SB.civic.slotTypeName(k));
      n += g.slots[k];
    }
    if (hasAnarchyBonusSlot()) { out.push(englishLocaleEnabled() ? '1 Universal slot' : '1 万能槽（安那其主义奖励）'); n++; }
    if (!n) return tr('civic.policy.slots.none', null, '不提供政策卡槽');
    return out.join(englishLocaleEnabled() ? ' + ' : ' ＋ ');
  }
  function hasAnarchyBonusSlot() {
    var m = SB.game && SB.game.meta ? SB.game.meta() : null;
    return !!(SB.challenges && SB.challenges.tierDone && SB.challenges.tierDone('anarchy', m));
  }

  /* 政策卡槽（Civ6 式）：一个个**带类型的格子**，空格子也画出来 ——
   * 玩家得看见「还有个工造槽空着」，才会想到去解锁那张工造卡。 */
  /* 2026-10-13：政策卡「点卡→点槽」两步选位。armedCard 存待装卡 id（render 模块级视图状态，不存档）。
   * 点池里一张卡 = 选中它（paneCivicSlot 高亮可装槽）；点一个对口槽 = 装进去；再点同一张卡 = 取消。 */
  var armedCard = null;
  function armCard(id) { armedCard = id; }
  function disarmCard() { armedCard = null; }
  function getArmedCard() { return armedCard; }

  /* 族民分配步长（2026-10-14 方案 B）：×1 → ×5 → ×10 循环，全局记忆（所有职业共用）。
   * 视图状态，不进存档——重载回 ×1 是故意的（大多数调整是 ±1）。 */
  var jobStep = 1;
  function cycleJobStep() { jobStep = jobStep === 1 ? 5 : (jobStep === 5 ? 10 : 1); return true; }
  function getJobStep() { return jobStep; }

  function paneCivicSlot(s) {
    var C = SB.civic, list = C.slotList(s), i;
    var armedCard = SB.ui.render.armedCard();
    var emptyCount = emptyCivicSlotCount(s, C, list);
    var emptySlotText = englishLocaleEnabled()
      ? tr('civic.policy.slot.empty', null, '空槽') + ': ' + emptyCount
      : '空槽 ' + emptyCount;
    var h = '<div class="secttl civic-policy-heading">' + tr('civic.policy.slots.heading', null, '政策卡槽') + ' <span class="tag">' + list.length + '</span>' +
      (emptyCount > 0 ? '<span class="civic-slot-warning"><i aria-hidden="true"></i>' + emptySlotText + '</span>' : '') + '</div>';
    if (!list.length) {
      h += '<div class="row"><div class="ds">' + tr('civic.policy.no_slots.change_government_hint', null, '当前政体不提供政策卡槽——换个政体才能装卡。') + '</div></div>';
      return h + pool(s, armedCard);
    }
    h += '<div class="policy-slot-grid">';
    var slotGlyphs = { wild: '◇', prod: '⚙', sci: '✦', grow: '♧', relig: '☼' };
    for (i = 0; i < list.length; i++) {
      var st = list[i].type, filled = (s.cards && s.cards[i]) ? C.policyById(s.cards[i]) : null;
      var _terminusSlot = !!(filled && filled.id === 'card_cycle_terminus');
      var slotGlyph = slotGlyphs[st] || '▣';
      /* 2026-10-13：点卡选位两步法——armedCard 命中且本槽对口时高亮成 slot-target，提示「点这里装」。 */
      var _armed = armedCard && C.policyById(armedCard);
      var _locked = !!(filled && filled.locked);
      var _alreadySlotted = !!(armedCard && s.cards && s.cards.indexOf(armedCard) >= 0);
      var _canHere = !!(_armed && C.cardFits(_armed, st) && !_locked && !_alreadySlotted);
      /* 「轮回之终末」装入后不可解除：不再渲染成插槽，直接以虚境圣物面板占据原位置。 */
      if (_terminusSlot) {
        h += '<article class="terminus-relic-card" aria-label="' + tr('civic.relic.accessibility_label', null, '轮回之终末，虚境永恒锚定') + '">' +
          '<div class="terminus-relic-kicker"><span>' + tr('civic.name.verge_faith', null, '虚境信仰') + '</span><b><i aria-hidden="true"></i>' + tr('civic.relic.anchor.label', null, '永恒锚定') + '</b></div>' +
          '<div class="terminus-relic-main">' +
            '<div class="terminus-relic-sigil" aria-hidden="true"><span>✦</span></div>' +
            '<div class="terminus-relic-copy"><strong>' + policyName(filled) + '</strong>' +
              '<span class="terminus-relic-effect">' + tr('civic.relic.faith_multiplier.effect', { multiplier: 2 }, '信仰全产加成 ×2') + '</span></div>' +
          '</div>' +
          '<div class="terminus-relic-desc">' + tr('civic.relic.faith_renamed.description', null, '信仰更名为「虚境」 · 此契约已与文明共生') + '</div>' +
          '<div class="terminus-relic-seal"><span>∞</span> ' + tr('civic.relic.permanent_status', null, '永久生效 · 不可卸下') + '</div>' +
        '</article>';
        continue;
      }
      /* 逐槽：第 i 槽装的是 s.cards[i]。2026-10-07 曾拍板「不给拔下按钮，装新卡直接覆盖」，
       * 但玩家明确要能卸下（否则空槽/换思路无从下手，且说明文案已写「卸下收费」却没有入口）。
       * 故对「已装卡」的槽补一个「卸下」按钮（data-remove=i），空槽不显示。
       * 费用按当前模型由 removeCard → setCardAt 在卸下时扣（装填免费、卸下收费）。 */
      var _fit = filled && C.cardFits(filled, st);
      /* 2026-10-14：按钮 title 反映「免费卸下机会」——有令牌时写「免费（剩 N 次）」，否则写市政点花费。 */
      var _freeN = s.cardFreeRemoves || 0;
      var _rCost = _freeN > 0
        ? tr('civic.policy.remove_cost.free', { freeUses: _freeN }, '免费（剩 ' + _freeN + ' 次）')
        : tr('civic.policy.remove_cost.paid', { civicPointCost: C.cardCost(s) }, '收取 ' + C.cardCost(s) + ' 市政点');
      /* ERA9 虚境信仰卡（locked）：永恒锚定、不可卸下——槽里不显示「卸下」按钮，改成锁死提示。 */
      h += '<div class="slotbox slot-type-' + st + (_canHere ? ' slot-target' : '') + (!filled ? ' civic-slot-empty' : '') + '" id="slotrow-' + i + '" data-slot="' + i + '">' +
        '<div class="slottt"><i class="slot-type-glyph" aria-hidden="true">' + slotGlyph + '</i>' +
        '<span class="slot-type-name">' + slotName(st) + '</span><span class="tg">#' + (i + 1) + '</span>' +
        (_canHere ? '<span class="slot-target-flag">' + (filled ? tr('civic.policy.slot.replaceable', null, '可替换') : tr('civic.policy.slot.installable', null, '可插入')) + '</span>' :
          !filled ? '<span class="civic-slot-empty-flag"><i aria-hidden="true"></i>' + tr('civic.policy.slot.empty', null, '空槽') + '</span>' : '') + '</div>' +
        (filled
          ? '<div class="slotcard' + (_fit ? '' : ' bad') + (_locked ? ' locked-vr' : '') + '">' +
              '<i class="slot-module-mark" aria-hidden="true">▰</i><span class="slot-module-name">' + policyName(filled) + '</span>' +
              (_locked ? ' <span class="eye" title="' + tr('civic.relic.locked.tooltip', null, '虚境信仰 · 永恒锚定') + '">👁</span>' : '') + '</div>' +
            '<div class="slotsub' + (_fit ? '' : ' bad') + '">' +
              (_fit ? policyDesc(filled, s)
                    : tr('civic.policy.slot.incompatible_replacement_hint', null, '与这个槽不对口，装填新卡可覆盖')) +
            '</div>' +
            (_locked
              ? '<div class="locknote" title="' + tr('civic.relic.locked.tooltip', null, '虚境信仰已永恒锚定，不可卸下') + '">' + tr('civic.relic.locked_status', null, '🔒 永恒锚定 · 不可卸下') + '</div>'
              : '<button class="btn danger slot-eject" data-remove="' + i + '" ' +
                'title="' + tr('civic.policy.remove.tooltip', { removalCost: _rCost }, '卸下此政策卡（' + _rCost + '）') + '">' + tr('ui.action.remove.policy_card', null, '卸下') + '</button>')
          : '<div class="slotcard empty"><span class="slot-empty-glyph" aria-hidden="true">＋</span>' +
            '<span>' + (_canHere ? tr('civic.policy.slot.click_to_equip', null, '点击插入') : tr('civic.policy.slot.waiting_for_card', null, '等待装入')) + '</span></div>' +
            '<div class="slotsub">' + (_canHere ? tr('civic.policy.slot.selected_card_hint', null, '已选政策卡 · 点击此槽安装') : tr('civic.policy.slot.choose_compatible_hint', null, '选择兼容政策卡后插入')) + '</div>') +
        '</div>';
    }
    h += '</div>';
    if (armedCard && C.policyById(armedCard)) {
      h += '<div class="note">' + tr('civic.policy.slot.selected_card.note', {
        policyCardName: policyName(C.policyById(armedCard))
      }, '已选「' + C.policyById(armedCard).name + '」：点高亮的卡槽完成安装（再点这张卡取消）。') + '</div>';
    }
    var _fn = s.cardFreeRemoves || 0;
    h += '<div class="note">' + tr('civic.policy.removal_cost_and_credits.note', {
      civicPointCost: C.cardCost(s), researchCostFraction: '1/5', freeRemovalPerCivic: 1, freeRemovalCount: _fn
    }, '装填（安装）永远免费；卸下政策卡通常收取 ' + C.cardCost(s) + ' 市政点（当前最高已完成市政研究成本的 1/5），但每完成一个市政会积 1 次免费卸下机会（当前剩 ' + _fn + ' 次，可累积）。') + '</div>';
    return h + pool(s, armedCard);
  }

  /* 点槽直接选卡（2026-10-27 用户要求）：点一个政策槽 → 弹出「能装进这个槽的卡」，
   * 点卡片即装上，免掉「先在池子里找卡、再回头点槽」两步法的心智负担。
   * ⚠️ 两步法**完整保留**：已经 armedCard 时点槽仍然直接装（老习惯与回归断言都靠它），
   *    只有「没选中任何卡」时点槽才走这个弹窗。
   * 候选口径与 pool() 一致：cardOwned（已解锁）+ cardFits（槽型对口）；
   * 再排除「已装在别的槽里」的卡 —— setCard 本来也会拒，但列表里不该摆出会失败的假选项。 */
  function panePolicyPicker(s, slotIdx) {
    var C = SB.civic, list = C.slotList(s);
    if (!list || !(slotIdx >= 0) || slotIdx >= list.length) return '<div class="note">' + tr('civic.policy.slot.not_found', null, '这个槽位不存在。') + '</div>';
    var st = list[slotIdx].type;
    var cur = (s.cards && s.cards[slotIdx]) ? s.cards[slotIdx] : null;
    var curCard = cur ? C.policyById(cur) : null;
    var h = '';
    if (curCard) {
      h += '<div class="policy-picker-current"><span>' + tr('civic.policy.slot.currently_equipped', null, '当前已装：') + ' <b>' + policyName(curCard) + '</b></span>' +
        (curCard.locked
          ? '<span class="locknote" title="' + tr('civic.relic.locked.tooltip', null, '虚境信仰已永恒锚定，不可卸下') + '">' + tr('civic.relic.locked_status', null, '🔒 永恒锚定 · 不可卸下') + '</span>'
          : '<button type="button" class="btn danger slot-eject" data-remove="' + slotIdx + '">' + tr('ui.action.remove.policy_card', null, '卸下') + '</button>') +
        '</div>';
    }
    var cand = [], i, p;
    var policies = C.policyList ? C.policyList(s) : (SB.POLICIES || []);
    for (i = 0; i < policies.length; i++) {
      p = policies[i];
      if (!C.cardOwned(s, p.id)) continue;                     // 没解锁的不列（与池子同口径）
      if (!C.cardFits(p, st)) continue;                        // 槽型不对口
      if (cur && p.id === cur) continue;                       // 就是当前这张
      if (s.cards && s.cards.indexOf(p.id) >= 0) continue;     // 已装在别的槽
      cand.push(p);
    }
    if (!cand.length) {
      h += '<div class="note">' + tr('civic.policy.slot.no_compatible_cards', null,
        '没有可装进这个槽的政策卡。去市政树解锁对应类型的卡；若卡都装在别的槽里了，先把那个槽卸下来。') + '</div>';
      return h;
    }
    h += '<div class="policy-card-grid policy-picker-grid">';
    for (i = 0; i < cand.length; i++) {
      p = cand[i];
      var why = C.cardBlocked(s, p.id);
      /* 缺市政点是**软拦**：按钮照旧可点，setCard 会据实拒绝并说明（与 pool 同口径，
       * 禁用按钮会让买不起的卡彻底点不动）。 */
      var hard = why && why.indexOf('市政点') === -1;
      var gt = p.type || 'wild';
      h += '<article class="policy-card policy-card-' + gt + '">' +
        '<div class="policy-card-top"><span class="tag t' + gt + '">' + slotName(gt) + '</span>' +
          (SB.ui.renderCommon.challengeTag ? SB.ui.renderCommon.challengeTag(s, p) : '') + '</div>' +
        '<div class="policy-card-name">' + policyName(p) + '</div>' +
        '<div class="policy-card-desc">' + policyDesc(p, s) + '</div>' +
        (policyFlavor(p) ? '<div class="policy-card-flavor">' + policyFlavor(p) + '</div>' : '') +
        '<button type="button" class="btn' + (hard ? '' : ' buy') + '" data-card-pick="' + p.id + '" ' +
        'data-slot-pick="' + slotIdx + '"' + (hard ? ' disabled' : '') +
        ' title="' + (policyBlockedText(s, p, why) || tr('civic.policy.slot.equip_here', null, '装进这个槽')) + '">' +
        (hard ? tr('civic.policy.status.cannot_equip', null, '条件不足') : tr('civic.policy.slot.equip_here', null, '装进这个槽')) + '</button>' +
        '</article>';
    }
    h += '</div>';
    h += '<div class="note">' + tr('civic.policy.slot.install_cost.note', {
      civicPointCost: C.cardCost(s)
    }, '装填永远免费；卸下通常收取 ' + C.cardCost(s) + ' 市政点。') + '</div>';
    return h;
  }

  /* 政策卡库：**只显示已解锁的卡**（完成对应市政才出现），未解锁的不再列出。
   * 用户 2026-09-30：没解锁就不要显示。
   * ⚠️ 代价：玩家失去「我还差哪条市政能拿到下一张卡」的预览——这正是要的克制。
   *   卡是否解锁仍由 cardOwned（= 对应市政已完成）判定，与装填、政体、槽类型都无关。 */
  function pool(s, armedCard) {
    var C = SB.civic, h = '';
    var own = [], i, p;
    var categoryOrder = ['prod', 'sci', 'grow', 'relig', 'wild'];
    var categories = { prod: [], sci: [], grow: [], relig: [], wild: [] };
    var policies = C.policyList ? C.policyList(s) : (SB.POLICIES || []);
    for (i = 0; i < policies.length; i++) {
      p = policies[i];
      if (C.cardOwned(s, p.id)) {
        own.push(p);
        /* 老卡未标 type 时按规则视为万能卡；未知类型也安全回落，避免 UI 出现 undefined。 */
        var category = categories[p.type] ? p.type : 'wild';
        categories[category].push(p);
      }
    }
    h += '<div class="secttl">' + tr('civic.policy.library.heading', null, '政策卡库') + ' <span class="tag">' + own.length + '</span></div>';
    if (own.length === 0) {
      h += '<div class="row"><div class="ds">' + tr('civic.policy.library.empty', null, '尚未解锁任何政策卡——完成市政树上的条目即可解锁对应卡片。') + '</div></div>';
      return h;
    }
    for (var g = 0; g < categoryOrder.length; g++) {
      var groupType = categoryOrder[g], group = categories[groupType];
      if (!group.length) continue;
      var groupName = tr('civic.policy.category_label', { policyCategory: slotTypeLabel(groupType) },
        (groupType === 'wild' ? '万能类' : C.slotTypeName(groupType).replace(/槽$/, '') + '类'));
      h += '<section class="policy-group policy-group-' + groupType + '" data-policy-category="' + groupType + '">' +
        '<div class="policy-group-title"><span>' + groupName + '</span><span class="policy-group-count">' + group.length + '</span></div>' +
        '<div class="policy-card-grid">';
      for (var j = 0; j < group.length; j++) {
        var q = group[j], why = C.cardBlocked(s, q.id), on = (s.cards && s.cards.indexOf(q.id) >= 0);
        var fits = C.cardFits(q, C.currentSlotType(s));
        /* ERA9 虚境信仰卡（q.locked）：紫红色卡面 + 眼睛图标，池里标「永恒卡」，装填后仍不可卸下。 */
        var _qlocked = !!q.locked;
        var qFlavor = policyFlavor(q);
        var voidCard = q.id === 'card_cycle_terminus';
        if (voidCard && qFlavor && SB.ui.render && typeof SB.ui.render.voidCorrupt === 'function') {
          qFlavor = SB.ui.render.voidCorrupt(qFlavor, 127, 1);
        }
        h += '<article class="policy-card policy-card-' + groupType + (on ? ' is-installed' : '') +
          (_qlocked ? ' is-locked-vr' : '') +
          (armedCard === q.id ? ' is-armed' : '') + '">' +
          '<div class="policy-card-top"><span class="tag t' + groupType + '">' + slotName(groupType) + '</span>' +
          (_qlocked ? '<span class="tag vr">' + tr('civic.policy.tag.eternal', null, '👁 永恒卡') + '</span>' : (on ? '<span class="tag ok">' + tr('civic.policy.status.installed', null, '已装填') + '</span>' : '')) +
          (SB.ui.renderCommon.challengeTag ? SB.ui.renderCommon.challengeTag(s, q) : '') + '</div>' +
          '<div class="policy-card-name">' + policyName(q) + '</div>' +
          /* 幸福度提示按当前卡自己的 happyOffset 显示；不能把所有已装卡的合计重复贴到每张卡上。 */
          (on ? SB.ui.renderCommon.happyBonusNote(s, 'card', q.id) : '') +
          '<div class="policy-card-desc">' + policyDesc(q, s) +
          (on ? '' : fits ? '' : '<br><span class="policy-card-warning">' + tr('civic.policy.card.slot_mismatch.warning', {
            slotType: slotName(groupType)
          }, '⚠ 与当前槽型不对口：需要 ' + C.slotTypeName(groupType)) + '</span>') +
          '</div>' +
          (qFlavor ? '<div class="policy-card-flavor' + (voidCard ? ' void-flavor' : '') + '">' + qFlavor + '</div>' : '') +
          '<button class="btn' + (on || why ? '' : ' buy') + '" data-card="' + q.id + '"' +
          /* ⚠️ 2026-10-14 修：只有「硬拦」才禁用按钮——没解锁 / 槽型不对；
           *   「缺市政点」是软拦，必须放行点卡 arm，否则两步选槽对买不起的卡
           *   永远点不动（disabled 按钮不触发 click）。点槽时 setCard 会据实返回
           *   false 并在 log 报「换卡需 X 市政点」。 */
          ((why && armedCard !== q.id && why.indexOf('市政点') === -1) ? ' disabled' : '') +
          ' title="' + (policyBlockedText(s, q, why) || (on ? (_qlocked ? tr('civic.relic.locked.tooltip', null, '虚境信仰 · 永恒锚定') : tr('civic.policy.status.installed', null, '已装填')) : '')) + '">' +
          (on ? (_qlocked ? tr('civic.relic.locked_status', null, '永恒·不可卸下') : tr('civic.policy.status.in_slot', null, '在槽'))
            : (armedCard === q.id ? tr('civic.policy.card.click_slot_to_equip', null, '点槽安装')
              : (why ? (why.indexOf('市政点') >= 0 ? tr('civic.policy.status.requires_civic_points', null, '需市政点')
                : tr('civic.policy.status.cannot_equip', null, '装不了')) : tr('civic.policy.action.equip', null, '装填')))) + '</button></article>';
      }
      h += '</div></section>';
    }
    return h;
  }

  /* 市政树 —— **与科技树同一张横卷**（用户 2026-09-27：「市政树要做成科技树这样」）。
   * 几何来自 SB.civic.layout()，CSS 直接复用 .techscroll / .technode / .tel，
   * 于是两张树在玩家眼里是同一种东西，排布规则也一致（列 = layer，行 = 排版产物）。
   *
   * ⚠️ 两处刻意与科技树不同：
   *   ① 容器 id 是 **civicScroll**，不是 techScroll —— render.js 的 scrollLeft 留存
   *      与 input.js 的拖动都按 id 取容器，共用 id 会两边抢一个元素。
   *   ② 节点是三态（已完成 / 已揭示 / 未揭露），比科技的「亮 / 不亮」多一档：
   *      未揭露时**藏名字与 desc**，与科技一致；差别在于市政的「鼓舞」是揭示的前置，
   *      所以未揭露态要连鼓舞条件与进度一起摆出来，玩家的下一步动作才是明确的。 */
  function civicTree(s) {
    if (!SB.civic || !SB.civic.layout) return '<div class="note">' + tr('civic.tree.geometry_not_loaded', null, '市政树几何尚未加载。') + '</div>';
    var L = SB.civic.layout(), G = L.geo;
    var gameEra = s.era || 1, E = SB.ERAS || [];
    var visibleEra = SB.civic.visibleEra ? SB.civic.visibleEra(s) : gameEra;
    var sel = civicEraChosen && civicViewEra >= 1 && civicViewEra <= E.length ? civicViewEra : visibleEra;
    civicViewEra = sel;
    var C = SB.CIVICS || [], visible = {};
    /* 挑战专属市政（2026-11-02）：不在本局就整条不渲染 —— 它们的鼓舞条件读污染，
     * 基游戏恒 0 ⇒ 永远「未揭示」的灰节点，摆在树里只会让玩家以为漏了什么。
     * ⚠️ 判据走 SB.civic.challengeAllows（与 blocked / cardOwned 同一个函数）。 */
    for (var i = 0; i < C.length; i++) {
      if (C[i].challengeOnly && SB.civic.challengeAllows && !SB.civic.challengeAllows(s, C[i])) {
        visible[C[i].id] = false; continue;
      }
      visible[C[i].id] = (C[i].era || 1) <= visibleEra;
    }
    var treeW = G.PADX, treeMaxRow = 0;
    for (i = 0; i < C.length; i++) {
      if (!visible[C[i].id]) continue;
      var visibleCell = L.cells[C[i].id];
      if (!visibleCell) continue;
      treeW = Math.max(treeW, visibleCell.x + G.W + G.PADX);
      treeMaxRow = Math.max(treeMaxRow, visibleCell.row);
    }
    var treeH = G.PADY * 2 + treeMaxRow * (G.H + 20) + G.H;

    var h = civicEraNav(s, gameEra, visibleEra, sel) + civicEraDetail(s, gameEra, visibleEra, sel) +
      '<div class="techscroll tree-civic" id="civicScroll"><div class="techcanvas"' +
      ' style="width:' + treeW + 'px;height:' + treeH + 'px">';

    /* 纪元轨道（只有一条时不画：单纪元的横幅是纯噪音）。 */
    if (L.blocks.length > 1) {
      for (var b = 0; b < L.blocks.length; b++) {
        var blk = L.blocks[b], er = eraOf(blk.era);
        if (blk.era > visibleEra) continue;
        h += '<div class="tnband' + (blk.era === visibleEra ? ' on' : '') + '" style="left:' + (G.PADX + blk.offset) + 'px;width:' +
          (blk.cols * L.pitch - G.W) + 'px">' +
          '<span class="tng">' + (er.glyph || '') + '</span>' + er.name +
          '<span class="tnc">' + tr('research.tree.era.column_count', { columnCount: blk.cols }, blk.cols + ' 列') + '</span></div>';
      }
    }

    /* 连线先画，压在节点底下。虚境终局线单独着色，仍沿用同一张市政树。 */
    var voidPathIds = { void_faith: 1, void_explore: 1, ascend_void: 1 };
    h += '<svg class="techlines" width="' + treeW + '" height="' + treeH + '">';
    for (i = 0; i < L.edges.length; i++) {
      var e = L.edges[i];
      if (!visible[e.from] || !visible[e.to]) continue;
      var doneEdge = s.civics[e.from] && s.civics[e.to];
      h += '<path class="tel' + (doneEdge ? ' done' : s.civics[e.from] ? ' open' : '') +
        (voidPathIds[e.from] || voidPathIds[e.to] ? ' void-path-edge' : '') +
        '" d="' + e.d + '"></path>';
    }
    h += '</svg>';

    for (i = 0; i < C.length; i++) {
      var cell = L.cells[C[i].id];
      if (cell && visible[C[i].id]) h += civicNode(s, C[i], cell, G.W, G.H);
    }
    h += '</div></div>';

    var rate = SB.economy.cultureRate(s);
    /* ⚠️ 2026-10-06 城堡「真升级」：注脚里这座建筑在买下 `upg_castle` 之后**改叫城堡**，
     *   等级是同一个 `coreLvl`（= lvl.hall）。切名判据与建筑行那处同源（同一个 upgrades 键），
     *   否则这里会显示「＋ 议事厅 8 级」而上面那行写着「城堡 8」——同一局两种名字。 */
    var _coreName = (s.upgrades && s.upgrades.upg_castle) ? '城堡' : '议事厅';
    /* ERA6（2026-10-12）：采用三个新政体之一 ⇒ 城堡随政体更名（圣座居所/人民大厅/国会）。
     * castleDisplayName 返回 null 时沿用默认的城堡/议事厅，不覆盖。判据与这里同源。 */
    if (SB.civic && SB.civic.castleDisplayName) {
      var _castleOverride = SB.civic.castleDisplayName(s);
      if (_castleOverride) _coreName = _castleOverride;
    }
    var localizedHallName = _coreName === '议事厅' ? tr('building.hall.name', null, _coreName)
      : _coreName === '城堡' ? tr('building.upgrade.name.castle', null, _coreName)
      : _coreName === '圣座居所' ? tr('civic.government.castle.seat_of_holy_see', null, _coreName)
      : _coreName === '人民大厅' ? tr('civic.government.castle.peoples_hall', null, _coreName)
      : _coreName === '国会' ? tr('civic.government.castle.parliament', null, _coreName) : _coreName;
    h += '<div class="note">' + tr('civic.points.rate_breakdown', {
      civicPoints: SB.economy.fmtAmt(s.res.culture), civicPointsPerSecond: rate.toFixed(2),
      scribeCount: s.jobs.scribe || 0, scribeJob: tr('job.name.scribe', null, SB.folk.jobName(s, 'scribe')),
      civicPointsPerScribe: SB.UNIT.culture, hallName: localizedHallName,
      hallLevel: SB.economy.coreLvl(s), civicPointsPerHallLevel: SB.CFG.CIVIC.HALL_RATE
    }, '市政点 ' + SB.economy.fmtAmt(s.res.culture) + '（+' + rate.toFixed(2) + '/秒 ＝ ' +
      SB.folk.jobName(s, 'scribe') + ' ' + (s.jobs.scribe || 0) + ' × ' + SB.UNIT.culture + ' ＋ ' + _coreName + ' ' +
      SB.economy.coreLvl(s) + ' 级 × ' + SB.CFG.CIVIC.HALL_RATE + '）。鼓舞只揭示这条路，不替你付市政点。') + '</div>';
    return h;
  }

  /* 市政卡片三态，走与 techNode 同一套 class：
   *   done（已投入市政点）⇒ 标题挂绿标「已完成」，不再渲染按钮（诚实，不留假按钮）
   *   revealed（鼓舞达成过）⇒ 亮出名字与 desc，挂「N 市政点」，给研究按钮
   *   !revealed（未揭露）    ⇒ 标题写「未揭露的市政」，藏 desc，只留鼓舞条件 + 进度条
   * 三态的判据分别走 SB.civic 的三个函数（已完成 / isRevealed / blocked），
   * 不在这里另算一遍 —— 与「亮没亮」和「能不能研究」各算各的而错位是同一类错。 */
  function civicNode(s, c, cell, w, hh) {
    var C = SB.civic, done = !!s.civics[c.id], rev = C.isRevealed(s, c.id);
    var localizedName = civicName(c);
    var why = done ? null : C.blocked(s, c);
    var boost = !rev ? SB.tech.condShort(s, c.boost) : null;
    /* 追踪鼓舞（同 techNode 的那条 ★，判据换成 civic.isRevealed）。 */
    var trackStar = '';
    if (!rev && c.boost && c.boost.t !== 'default') {
      var _tk3 = (SB.ui.track && SB.ui.track.isTracked) ? SB.ui.track.isTracked('civic', c.id) : false;
      trackStar = '<span class="tree-track' + (_tk3 ? ' on' : '') + '" role="button"' +
        ' data-track-toggle="civic:' + c.id + '" aria-label="' + tr('civic.track.inspiration.aria_label', null, '追踪鼓舞条件') + '"' +
        ' title="' + tr(_tk3 ? 'tree.track.stop' : 'tree.track.inspiration', null, _tk3 ? '取消追踪鼓舞' : '追踪鼓舞') + '">★</span>';
    }
    var boostPct = boost && boost.need > 0
      ? Math.max(0, Math.min(100, boost.now / boost.need * 100)) : 0;
    var status = done ? tr('tree.detail.status.completed', null, '已完成')
      : !rev ? tr('tree.detail.status.unrevealed', null, '未揭示')
      : why ? tr('tree.detail.status.unavailable', null, '暂不可研究')
      : tr('tree.detail.status.ready_to_research', null, '可研究');
    var cls = 'technode st' + (done ? ' done' : why ? ' lock' : ' open') + ' tree-node' +
      (/^(void_faith|void_explore|ascend_void)$/.test(c.id) ? ' void-path-node' : '');
    /* 与 techNode 同口径：角标另起一行，不占 .tnhd 里名字的宽度。 */
    var _coHTML = SB.ui.renderCommon.challengeTag ? SB.ui.renderCommon.challengeTag(s, c) : '';
    var h = '<button type="button" class="' + cls + '" id="civicrow-' + c.id + '"' +
      ' data-node="' + c.id + '" data-x="' + cell.x + '" data-y="' + cell.y + '"' +
      ' data-layer="' + cell.layer + '"' +
      ' data-revealed="' + (rev ? 1 : 0) + '"' +
      ' data-tree-node="1" data-tree-type="civic" data-tree-id="' + c.id + '"' +
      ' aria-label="' + tr('research.tree.node.aria_label', {
        nodeName: rev ? localizedName : tr('tree.detail.unrevealed.title', { nodeType: tr('tree.node_type.civic', null, '市政') }, '未揭露的市政'), nodeStatus: status
      }, (rev ? localizedName : '未揭露的市政') + '，' + status + '，打开详情') + '"' +
      ' style="left:' + cell.x + 'px;top:' + cell.y + 'px;width:' + w +
      'px;height:' + hh + 'px">';
    h += '<span class="tnhd">' + SB.ui.renderCommon.treeIconHTML(c, rev, 'tree-node-icon civic-icon') +
      '<span class="tnm">' + (rev ? localizedName : tr('tree.detail.unrevealed.title', { nodeType: tr('tree.node_type.civic', null, '市政') }, '未揭露的市政')) + '</span>' +
      '</span>' + (_coHTML ? '<span class="co-tag-wrap">' + _coHTML + '</span>' : '') +
      (!rev ? '<span class="tree-eureka">' + tr('tree.condition.inspiration.heading', null, '鼓舞') + ' · ' +
        (boost ? boost.txt : c.boost ? tr('civic.reveal.inspiration.condition_hint', null, '达成鼓舞条件后揭示') : tr('civic.boost.not_required', null, '无需鼓舞')) + '</span>' +
        (boost && boost.need > 0 ? '<span class="tree-eureka-meter"><span class="tree-eureka-track"><i style="width:' + boostPct.toFixed(1) + '%"></i></span><b>' + boostPct.toFixed(0) + '%</b></span>' : '') : '') +
      '<span class="tree-node-foot"><i class="tree-state-dot"></i>' +
      '<span class="tree-node-status">' + status + '</span>' + trackStar +
      '<span class="tree-open-hint">' + tr('tree.detail.open_hint', null, '查看详情　›') + '</span></span></button>';
    return h;
  }

  function techGoEra(n) {
    var s = res(), era = (s && s.era) || 1;
    if (!(n >= 1 && n <= (SB.ERAS || []).length)) return false;
    if (n <= era) SB.ui.render.scheduleTechJumpTo(SB.tech.eraAnchorX(n));
    var changed = n !== (techViewEra || era);
    techViewEra = n;
    return changed || n <= era;
  }

  function civicGoEra(n) {
    var s = res(), visibleEra = s && SB.civic.visibleEra ? SB.civic.visibleEra(s) : (s && s.era) || 1;
    if (!(n >= 1 && n <= (SB.ERAS || []).length)) return false;
    if (n <= visibleEra) SB.ui.render.scheduleCivicJumpTo(SB.civic.eraAnchorX(n));
    var changed = n !== civicViewEra;
    civicViewEra = n;
    civicEraChosen = true;
    return changed || n <= visibleEra;
  }

  SB.ui = SB.ui || {};
  SB.ui.renderParts = SB.ui.renderParts || {};
  SB.ui.renderParts.research = {
    paneTech: paneTech, paneCivic: paneCivic,
    policyName: policyName, policyDesc: policyDesc, policyFlavor: policyFlavor,
    /* 2026-11-01：科技 / 市政页顶部的自动研究拨动开关。回归直接调它断言
     * 「已买=可拨、未买=锁态」，不必先把科技面板的门打开（paneTech 在未开门时
     * 整页换成 paneTechLocked，开关根本不出现 —— 那会测成「没开门 ⇒ 没开关」）。 */
    autoResearchSwitch: autoResearchSwitch,
    paneCivicGov: paneCivicGov, paneGovPicker: paneGovPicker, paneCivicSlot: paneCivicSlot,
    /* 2026-10-27：点槽直接选卡（`panePolicyPicker(s, slotIdx)`）。 */
    panePolicyPicker: panePolicyPicker,
    setCivicView: setCivicView, civicNoticeState: civicNoticeState,
    armCard: armCard, disarmCard: disarmCard, getArmedCard: getArmedCard,
    cycleJobStep: cycleJobStep, getJobStep: getJobStep,
    techGoEra: techGoEra, civicGoEra: civicGoEra
  };
})(typeof window !== 'undefined' ? window : globalThis);
