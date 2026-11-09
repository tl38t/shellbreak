/* 天壳 / SHELLBREAK — 可点击详情卡渲染。
 * 数据与门槛由各玩法模块提供；本文件只生成详情 UI，不修改游戏状态。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  function res() { return SB.game.run(); }
  function el(id) { return root.document.getElementById(id); }
  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || fallback || '';
  }
  function englishLocale() {
    return !!(SB.i18n && SB.i18n.getLocale && SB.i18n.getLocale() === 'en-US');
  }
  function localizedBuildingName(id, fallback) {
    return SB.i18n && SB.i18n.buildingName
      ? SB.i18n.buildingName(id, fallback) : (fallback || '');
  }
  function localizedUpgradeName(id, fallback) {
    if (id === 'upg_castle') return tr('building.upgrade.name.castle', null, fallback);
    return SB.i18n && SB.i18n.contentName
      ? SB.i18n.contentName(id, fallback) : (fallback || '');
  }
  function localizedWonderName(s, id, fallback) {
    if (!englishLocale()) return fallback || id || '';
    var throneNames = {
      theo_state: 'wonder.supreme_throne.name',
      egalitarianism: 'wonder.supreme_throne.name.space_collective',
      federalism: 'wonder.supreme_throne.name.international_space_station'
    };
    if (id === 'wonder_throne') return tr(throneNames[s && s.gov] || 'wonder.supreme_throne.name', null, fallback || id);
    var aliases = {
      wonder_albada: 'wonder.albada_hydrothermal_university.name',
      wonder_fishvr: 'wonder.fish_vr.name',
      wonder_geek: 'wonder.geek.name',
      wonder_great_library: 'wonder.great_tidal_library.name',
      wonder_presspipe: 'wonder.high_pressure_thermal_pipe.name',
      wonder_jupitor_mas: 'wonder.jupiter_mass_accelerator.name',
      wonder_khalifa: 'wonder.khalifa_space_telescope.name',
      wonder_grand_exchange: 'wonder.kingdom_grand_exchange.name',
      wonder_skydrill: 'wonder.skydrill.name',
      wonder_terra_core: 'wonder.terra_core.name'
    };
    var key = aliases[id] || ('content.' + id + '.name');
    return tr(key, null, fallback || id || '');
  }
  function workshopItemSlug(id) {
    return String(id || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  }
  function localizedWorkshopItemName(type, id, fallback) {
    if (!englishLocale()) return fallback || id || '';
    if (type === 'tool') return tr('tool.' + workshopItemSlug(id) + '.name', null, fallback || id || '');
    if (type === 'craft' && id === 'craft_strongprop') return tr('resource.strong_propellant_rocket_engine.name', null, fallback || id || '');
    if (type === 'craft' && id === 'craft_thinafilm') return tr('resource.theta_metal_adaptive_film.name', null, fallback || id || '');
    return SB.i18n && SB.i18n.contentName
      ? SB.i18n.contentName(id, fallback) : (fallback || id || '');
  }
  var policyLocaleNameKeys = null;
  function localizedPolicyKey(name, field) {
    if (!policyLocaleNameKeys) {
      policyLocaleNameKeys = Object.create(null);
      var locales = root.ShellbreakLocales || {}, zh = locales['zh-CN'] || {}, en = locales['en-US'] || {};
      for (var key in zh) {
        if (Object.prototype.hasOwnProperty.call(zh, key) && key.indexOf('policy.card.') === 0 &&
            /\.name$/.test(key) && typeof en[key] === 'string' && !Object.prototype.hasOwnProperty.call(policyLocaleNameKeys, zh[key])) {
          policyLocaleNameKeys[zh[key]] = key;
        }
      }
    }
    var nameKey = policyLocaleNameKeys[name];
    return nameKey ? nameKey.slice(0, -'.name'.length) + '.' + field : '';
  }
  function localizedPolicyName(policy) {
    if (!policy || !englishLocale()) return policy ? (policy.name || '') : '';
    var research = SB.ui && SB.ui.renderParts && SB.ui.renderParts.research;
    if (research && typeof research.policyName === 'function') return research.policyName(policy);
    var key = localizedPolicyKey(policy.name, 'name');
    return key ? tr(key, null, policy.name) : (policy.name || '');
  }
  function localizedContentDescription(key, fallback, params) {
    if (!englishLocale()) return fallback || '';
    var value = tr(key, params || {}, '');
    return value && !/\{[A-Za-z0-9_]+\}/.test(value) ? value : (fallback || '');
  }
  function englishTemplateParams(key, source, special) {
    var locales = root.ShellbreakLocales || {}, en = locales['en-US'] || {};
    var template = en[key];
    if (typeof template !== 'string') return null;
    var names = [], seen = Object.create(null), match, re = /\{([A-Za-z0-9_]+)\}/g;
    while ((match = re.exec(template))) {
      if (!seen[match[1]]) { seen[match[1]] = true; names.push(match[1]); }
    }
    var params = {}, supplied = special || {}, numericNames = [];
    for (var i = 0; i < names.length; i++) {
      if (Object.prototype.hasOwnProperty.call(supplied, names[i]) && supplied[names[i]] != null) params[names[i]] = supplied[names[i]];
      else numericNames.push(names[i]);
    }
    if (!numericNames.length) return params;
    var values = [], numberRe = /(?:[+＋×xX−-]\s*)?\d[\d,]*(?:\.\d+)?\s*(?:%|[KMB])?/g;
    while ((match = numberRe.exec(String(source || '')))) values.push(match[0].trim());
    if (values.length !== numericNames.length) return null;
    for (var j = 0; j < numericNames.length; j++) params[numericNames[j]] = formatDescriptionValue(numericNames[j], values[j]);
    return params;
  }
  function formatDescriptionValue(name, token) {
    var value = String(token || '').replace(/\s+/g, ''), n = value.replace(/^[+＋×xX−-]/, '');
    if (/^(?:effectPercent\d*|totalPercent|previousEffectPercent|populationPercent|observatoryLevelPercent|thresholdPercent|scribeBonus|scholarBonus)$/.test(name)) {
      return n.indexOf('%') >= 0 ? n : n + '%';
    }
    if (/^(?:storageMultiplier|combinedMultiplier|outputMultiplier|craftingMultiplier|previousMultiplier|newMultiplier)$/.test(name)) {
      return '×' + n.replace(/%$/, '');
    }
    return n;
  }
  function localizedMissingMaterials(s, cost) {
    if (!englishLocale() || !s || !cost) return '';
    var parts = [], key;
    for (key in cost) {
      if (!Object.prototype.hasOwnProperty.call(cost, key)) continue;
      var have = (s.res && s.res[key]) || 0;
      if (have >= cost[key]) continue;
      var fallbackName = SB.RESS && SB.RESS[key] ? SB.RESS[key].name : key;
      var resourceName = SB.i18n && SB.i18n.resourceName
        ? SB.i18n.resourceName(key, fallbackName) : fallbackName;
      parts.push(tr('tree.detail.blocked.materials', {
        resourceName: resourceName,
        currentAmount: Math.floor(have),
        requiredAmount: SB.economy && SB.economy.fmtAmt ? SB.economy.fmtAmt(cost[key]) : cost[key]
      }, ''));
    }
    return parts.join('; ');
  }
  function localizedWorkshopRequirement(item, s, type, why) {
    if (!englishLocale() || !item || !why) return why || '';
    if (type === 'tool' && item.wip) return tr('workshop.tool.work_in_progress', null, why);
    if ((type === 'tool' || type === 'upgrade' || type === 'craft') &&
        !(s.lvl && s.lvl.workshop > 0)) {
      return tr('workshop.requirement.workshop', null, why);
    }
    if (item.need && !(s.techs && s.techs[item.need])) {
      var tech = SB.tech && SB.tech.byId ? SB.tech.byId(item.need) : null;
      return tr('workshop.requirement.technology', {
        technologyName: localizedTreeNodeName('tech', item.need, tech ? tech.name : item.need)
      }, why);
    }
    if (item.needCivic && !(s.civics && s.civics[item.needCivic])) {
      var civic = treeNodeById('civic', item.needCivic);
      return tr('workshop.requirement.civic', {
        civicName: localizedTreeNodeName('civic', item.needCivic, civic ? civic.name : item.needCivic)
      }, why);
    }
    var cost = type === 'craft' ? item.in
      : type === 'upgrade' ? SB.workshop.upgradeCost(s, item.id) : item.cost;
    return localizedMissingMaterials(s, cost) || why;
  }
  function workshopHasRequirementBlock(item, s, type) {
    if (!item) return false;
    if (type === 'tool' && item.wip) return true;
    if (!(s.lvl && s.lvl.workshop > 0)) return true;
    if (item.need && !(s.techs && s.techs[item.need])) return true;
    return !!(item.needCivic && !(s.civics && s.civics[item.needCivic]));
  }
  function localizedWonderRequirement(s, id, w, why) {
    if (!englishLocale() || !w || !why) return why || '';
    if (w.need && !(s.techs && s.techs[w.need])) {
      var tech = SB.tech && SB.tech.byId ? SB.tech.byId(w.need) : null;
      return tr('workshop.requirement.technology', {
        technologyName: localizedTreeNodeName('tech', w.need, tech ? tech.name : w.need)
      }, why);
    }
    if (w.needCivic && !(s.civics && s.civics[w.needCivic])) {
      var civic = treeNodeById('civic', w.needCivic);
      return tr('workshop.requirement.civic', {
        civicName: localizedTreeNodeName('civic', w.needCivic, civic ? civic.name : w.needCivic)
      }, why);
    }
    if (w.challengeOnly) {
      var allowedChallenge = w.challengeOnly === true ? (s.challenge && s.challenge.id === 'drift_terra')
        : typeof w.challengeOnly === 'string' ? (s.challenge && s.challenge.id === w.challengeOnly)
          : (w.challengeOnly.indexOf(s.challenge && s.challenge.id) >= 0);
      if (!allowedChallenge) return tr('workshop.wonder.challenge_only', null, why);
    }
    var missing = localizedMissingMaterials(s, SB.wonder.discountedCost(s, id));
    if (!missing && SB.wonder.buildCostLack) {
      var lackingBuildings = SB.wonder.buildCostLack(s, id);
      if (lackingBuildings && lackingBuildings.length) {
        var requirements = [];
        for (var i = 0; i < lackingBuildings.length; i++) {
          var lack = lackingBuildings[i], building = SB.habitat && SB.habitat.buildingById
            ? SB.habitat.buildingById(lack.id) : null;
          var buildingName = localizedBuildingName(lack.id, building ? building.name : lack.id);
          requirements.push(tr('ui.wonder.build_cost.building_levels', {
            buildingName: buildingName, requiredLevels: lack.need
          }, buildingName + ' · Level ' + lack.need));
        }
        return tr('workshop.wonder.building_levels_missing', {
          buildingRequirements: requirements.join('; ')
        }, why);
      }
    }
    return missing || tr('ui.status.conditions_not_met', null, why);
  }
  function localizedWonderBuildCost(s, id) {
    if (!englishLocale() || !SB.wonder.buildCostNeed) return SB.wonder.buildCostText(s, id);
    var need = SB.wonder.buildCostNeed(s, id), parts = [];
    if (!need) return '';
    for (var key in need) {
      if (!Object.prototype.hasOwnProperty.call(need, key)) continue;
      var building = SB.habitat && SB.habitat.buildingById ? SB.habitat.buildingById(key) : null;
      var name = localizedBuildingName(key, building ? building.name : key);
      parts.push(tr('ui.wonder.build_cost.building_levels', {
        buildingName: name, requiredLevels: need[key]
      }, name + ' · Level ' + need[key]));
    }
    return parts.join('; ');
  }
  function wonderHasRequirementBlock(s, w) {
    if (!w) return false;
    if (w.need && s.techs && !s.techs[w.need]) return true;
    if (w.needCivic && s.civics && !s.civics[w.needCivic]) return true;
    if (!w.challengeOnly) return false;
    var current = s.challenge && s.challenge.id, allowed = w.challengeOnly;
    return allowed === true ? current !== 'drift_terra'
      : typeof allowed === 'string' ? current !== allowed
        : allowed.indexOf(current) < 0;
  }
  function localizedWonderDescription(s, id, fallback) {
    if (!englishLocale()) return fallback || '';
    if (id === 'wonder_throne') {
      var branch = s && s.gov === 'theo_state' ? 'faith'
        : s && s.gov === 'egalitarianism' ? 'crafting'
          : s && s.gov === 'federalism' ? 'research' : '';
      if (!branch) return tr('wonder.supreme_throne.description.no_branch', { stationLevelBonus: 3 }, fallback || '');
      var branchEffect = tr('wonder.supreme_throne.government_bonus.' + branch, { bonusPercent: 10 }, '');
      return tr('wonder.supreme_throne.description.branch', { stationLevelBonus: 3, branchEffect: branchEffect }, fallback || '');
    }
    if (id === 'wonder_geek') {
      var config = SB.CFG || {};
      var enceladusTime = SB.economy && SB.economy.starTerraformDuration
        ? SB.economy.starTerraformDuration(s, config.GEEK_ENCELADUS_SECONDS || 1800)
        : (config.GEEK_ENCELADUS_SECONDS || 1800);
      var terraTime = SB.economy && SB.economy.starTerraformDuration
        ? SB.economy.starTerraformDuration(s, config.GEEK_TERRA_SECONDS || 3600)
        : (config.GEEK_TERRA_SECONDS || 3600);
      var upgradeText = tr('tech.ecological_restoration.unlock_desc', { levelThreshold: 3 }, '');
      var listStart = upgradeText.indexOf('upgrade costs for '), listEnd = upgradeText.indexOf(' reset', listStart);
      var reductions = String(fallback || '').match(/恩克拉多斯下调(?:最多)?\s*(\d+)\s*级、泰拉再下调\s*(\d+)\s*级[\s\S]*?廉租社区单独为\s*(\d+)\s*级\s*\/\s*合计\s*(\d+)\s*级/);
      function levelReduction(value) { value = Number(value) || 0; return value + (value === 1 ? ' level' : ' levels'); }
      function durationText(seconds) {
        seconds = Math.max(0, Math.floor((Number(seconds) || 0) + 0.5));
        var hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), remainder = seconds % 60;
        if (hours) return tr('game.duration.hours_minutes', { hours: hours, minutes: minutes }, hours + ' hr ' + minutes + ' min');
        if (remainder) return tr('game.duration.minutes_seconds', { minutes: minutes, seconds: remainder }, minutes + ' min ' + remainder + ' sec');
        return tr('save.time.duration.minutes', { count: minutes }, minutes + ' min');
      }
      if (listStart >= 0 && listEnd > listStart && reductions) {
        return localizedContentDescription('wonder.geek.description', fallback || '', {
          environmentCardName: tr('ui.pane.environment.title', null, '自然环境'),
          worldAName: tr('ui.star_map.body.enceladus.name', null, '恩克拉多斯'),
          worldBName: tr('ui.star_map.body.terra.name', null, '泰拉'),
          worldATime: durationText(enceladusTime),
          worldBTime: durationText(terraTime),
          affectedBuildingList: upgradeText.slice(listStart + 'upgrade costs for '.length, listEnd),
          worldAReduction: levelReduction(reductions[1]),
          worldBAdditionalReduction: levelReduction(reductions[2]),
          communityReduction: levelReduction(reductions[3]),
          communityTotalReduction: levelReduction(reductions[4])
        });
      }
    }
    var key = 'content.' + id + '.description';
    var special = {};
    if (id === 'wonder_albada') special.populationPercent = String(Math.max(0, Number(s && s.pop) || 0)) + '%';
    if (id === 'wonder_shellcutter') special.observatoryLevelPercent = String(Math.max(0, Number(s && s.lvl && s.lvl.observatory) || 0)) + '%';
    var params = englishTemplateParams(key, fallback, special);
    return localizedContentDescription(key, fallback || '', params || {});
  }
  function workshopCraftDescription(item) {
    var params = {};
    if (item.id === 'craft_rocketfuel') {
      params.warmstonePerBatch = item.in && item.in.warmstone;
      params.fuelPerBatch = item.out;
    } else if (item.id === 'craft_strongprop') {
      params.fuelAmount = item.in && item.in.fuel;
      params.thetaMetalAmount = item.in && item.in.thetaMetal;
      params.engineCount = item.out;
    } else if (item.id === 'craft_thinafilm') {
      params.thetaMetalPerBatch = item.in && item.in.thetaMetal;
      params.filmPerBatch = item.out;
    } else if (item.id === 'craft_tiplate') {
      params.titaniumPerBatch = item.in && item.in.titanium;
      params.platesPerBatch = item.out;
    }
    return localizedContentDescription('content.' + item.id + '.description', item.desc || '', params);
  }
  function workshopToolDescription(item) {
    var params = { effectPercent1: '+' + (Math.round((item.bonus || 0) * 100)) + '%' };
    if (item.id === 'tool_steelSickle' || item.id === 'tool_thetaSickle') {
      var chain = item.id === 'tool_steelSickle'
        ? ['tool_sickle', 'tool_ironSickle', 'tool_steelSickle']
        : ['tool_sickle', 'tool_ironSickle', 'tool_steelSickle', 'tool_thetaSickle'];
      var multiplier = 1, tools = SB.TOOLS || [];
      for (var i = 0; i < chain.length; i++) {
        for (var j = 0; j < tools.length; j++) {
          if (tools[j].id === chain[i]) { multiplier += tools[j].bonus || 0; break; }
        }
      }
      params.combinedMultiplier = '×' + multiplier.toFixed(1);
    }
    return localizedContentDescription('tool.' + workshopItemSlug(item.id) + '.description', item.desc || '', params);
  }
  function localizedWorkshopItemDescription(type, item) {
    if (!item) return '';
    if (type === 'craft') return workshopCraftDescription(item);
    if (type === 'tool') return workshopToolDescription(item);
    var key = 'content.' + item.id + '.description';
    var special = {};
    if (item.capEra != null) special.eraCount = item.capEra;
    var params = englishTemplateParams(key, item.desc, special);
    return localizedContentDescription(key, item.desc || '', params || {});
  }
  function localizedTreeNodeName(type, id, fallback) {
    if (!englishLocale()) return fallback || id || '';
    var key = type === 'tech' ? 'tech.' + id + '.name' : 'civic.data.' + id + '.name';
    return tr(key, null, fallback || id || '');
  }
  function treeNodeById(type, id) {
    if (type === 'tech') return SB.tech && SB.tech.byId ? SB.tech.byId(id) : null;
    for (var i = 0; SB.CIVICS && i < SB.CIVICS.length; i++) {
      if (SB.CIVICS[i].id === id) return SB.CIVICS[i];
    }
    return null;
  }
  function localizedStaticText(key, fallback) {
    if (!englishLocale()) return fallback || '';
    var value = tr(key, null, '');
    return value && !/\{[A-Za-z0-9_]+\}/.test(value) ? value : (fallback || '');
  }
  function localizedJobName(s, id) {
    var fallback = SB.folk && SB.folk.jobName ? SB.folk.jobName(s, id) : id;
    var key = id;
    if (id === 'scribe' && fallback === '官员') key = 'official';
    if (id === 'scholar' && s && s.techs && s.techs.chemistry) key = 'scientist';
    return tr('job.name.' + key, null, fallback);
  }
  function joinInfoText(left, right) {
    return left + (englishLocale() ? '; ' : '；') + right;
  }
  function joinInfoList(items) {
    return items.join(englishLocale() ? ', ' : '、');
  }
  /* 弹窗外壳归一化（2026-10-29）：本文件的详情卡与树图共用 render.js 的 #modal/#modalBox。
   * 上一张面板的变体类（尤其 offline-summary-modal 的报表 flex 布局、break-modal 的 padding:0）
   * 残留会把详情卡一起压塌 —— 判据与清单只有一处，在 render.js 的 resetModalChrome。
   * 这里只做转发（不另写一份 remove 列表）；render 模块尚未加载时静默跳过。 */
  function primeModal() {
    var R = SB.ui && SB.ui.render;
    if (R && R.resetModalChrome) R.resetModalChrome();
  }
  function bodyModalClass(on) {
    var b = root.document && root.document.body;
    if (b && b.classList) { if (on) b.classList.add('modal-open'); else b.classList.remove('modal-open'); }
  }

  /* 在效果文案中把已解锁内容转成内联入口。逐段匹配并优先长名称，
   * 避免「大灯塔」被较短的「灯塔」再次切坏。 */
  function linkInfoNames(text, linkWorkshopTab) {
    text = String(text || '');
    var names = [], i, list = SB.BUILDINGS || [], wonders = SB.wonder ? SB.wonder.list() : [], policies = SB.POLICIES || [];
    function addName(name, id, type) {
      if (name) names.push({ name: name, id: id, type: type });
    }
    if (linkWorkshopTab) addName('工坊', 'workshop', 'workshopTab');
    for (i = 0; i < list.length; i++) {
      addName(list[i].name, list[i].id, 'build');
      var localizedBuilding = localizedBuildingName(list[i].id, list[i].name);
      if (localizedBuilding !== list[i].name) addName(localizedBuilding, list[i].id, 'build');
    }
    for (i = 0; SB.UPGRADES && i < SB.UPGRADES.length; i++) {
      var upgrade = SB.UPGRADES[i];
      if (!upgrade.upgradesBuilding) continue;
      var localizedUpgrade = localizedUpgradeName(upgrade.id, upgrade.name);
      addName(upgrade.name, upgrade.upgradesBuilding, 'build');
      if (localizedUpgrade !== upgrade.name) addName(localizedUpgrade, upgrade.upgradesBuilding, 'build');
    }
    for (i = 0; i < wonders.length; i++) {
      addName(wonders[i].name, wonders[i].id, 'wonder');
      var localizedWonder = localizedWonderName(res(), wonders[i].id, SB.wonder.displayName(res(), wonders[i].id));
      if (localizedWonder !== wonders[i].name) addName(localizedWonder, wonders[i].id, 'wonder');
    }
    for (i = 0; i < policies.length; i++) {
      addName(policies[i].name, policies[i].id, 'policy');
      var localizedPolicy = localizedPolicyName(policies[i]);
      if (localizedPolicy !== policies[i].name) addName(localizedPolicy, policies[i].id, 'policy');
    }
    names.sort(function (a, b) { return b.name.length - a.name.length; });
    var out = '', cursor = 0;
    while (cursor < text.length) {
      var bestAt = -1, best = null, at;
      for (i = 0; i < names.length; i++) {
        at = text.indexOf(names[i].name, cursor);
        if (at >= 0 && (bestAt < 0 || at < bestAt)) { bestAt = at; best = names[i]; }
        else if (at === bestAt && best && (names[i].name.length > best.name.length ||
          (names[i].name.length === best.name.length && names[i].type === 'workshopTab'))) best = names[i];
      }
      if (!best) break;
      out += text.slice(cursor, bestAt);
      out += '<span role="button" tabindex="0" class="inline-info-link" ' +
        (best.type === 'workshopTab' ? 'data-workshop-tab' : best.type === 'build' ? 'data-build-info' : best.type === 'wonder' ? 'data-wonder-info' : 'data-policy-info') +
        '="' + best.id + '" aria-haspopup="dialog">' + best.name + '</span>';
      cursor = bestAt + best.name.length;
    }
    return out + text.slice(cursor);
  }

  /* 科技 / 市政节点详情：树图节点只负责展示路径与状态，效果、条件和研究操作
   * 收进这张卡片。判据继续复用各自玩法模块，避免 UI 另算一次门槛。 */
  function showTreeDetail(type, id) {
    var s = res(), tech = type === 'tech', item = null, i;
    if (!s) return;
    if (tech) {
      item = SB.tech && SB.tech.byId ? SB.tech.byId(id) : null;
    } else {
      for (i = 0; SB.CIVICS && i < SB.CIVICS.length; i++) {
        if (SB.CIVICS[i].id === id) { item = SB.CIVICS[i]; break; }
      }
    }
    if (!item) return;

    var techLevel = tech ? SB.tech.level(s, id) : 0;
    var techMaxLevel = tech ? SB.tech.maxLevel(item) : 1;
    var done = tech ? techLevel >= techMaxLevel : !!s.civics[id];
    var revealed = tech ? SB.tech.metOf(s, item) : SB.civic.isRevealed(s, id);
    var blocked = done ? null : tech ? SB.tech.studyBlocked(s, id) : SB.civic.blocked(s, item);
    var short = SB.tech.condShort(s, tech ? item.cond : item.boost);
    var nodeTypeName = tr(tech ? 'tree.node_type.technology' : 'tree.node_type.civic.singular', null, tech ? '科技' : '市政');
    var title = revealed
      ? localizedTreeNodeName(tech ? 'tech' : 'civic', id, item.name)
      : tr('tree.detail.unrevealed.title', { nodeType: nodeTypeName }, '未揭露的' + (tech ? '科技' : '市政'));
    var detailReqsMet = true;
    if (tech && item.reqs) {
      for (i = 0; i < item.reqs.length; i++) {
        if (!s.techs[item.reqs[i]]) { detailReqsMet = false; break; }
      }
    }
    /* cost 必须先于 blockKind 算（2026-10-17 用户拍板实装折扣断链）：
     * 科技侧走唯一折扣口 researchCost（科研所 researchLabSave，与 canStudy/study 同源）；
     * 市政侧无折扣，走原价。旧版判定/显示各裸读 item.cost ⇒ 卡面显示原价、实扣折后价。 */
    var cost = tech
      ? (SB.tech.researchCost ? SB.tech.researchCost(s, item) : (item.cost || 0))
      : (SB.civic.researchCost ? SB.civic.researchCost(s, item) : (item.cost || 0));
    var blockKind = '';
    if (tech && !done && blocked) {
      if (!revealed) blockKind = 'unrevealed';
      else if (item.era > (s.era || 1)) blockKind = 'era';
      else if (!SB.tech.metOf(s, item)) blockKind = 'eureka';
      else if (!detailReqsMet) blockKind = 'prereq';
      /* 材料门排在科技点门之前 —— 与 studyBlocked 的顺序**逐字一致**，
       * 否则卡片报的原因会和灰按钮的 title 打架（同一个按钮两种说法）。 */
      else if (SB.tech.resCostLack && SB.tech.resCostLack(s, item)) blockKind = 'material';
      else if (!SB.economy.enough(s.res.science, cost)) blockKind = 'science';
    } else if (!tech && !done && blocked && revealed) {
      if (item.era && item.era > (s.era || 1)) blockKind = 'era';
      else if (!SB.civic.reqsMet(s, item)) blockKind = 'prereq';
      else if (!SB.economy.enough(s.res.culture, cost)) blockKind = 'culture';
    }
    /* ⚠️ 「等级 x/y」必须排在 blocked 之后（2026-11-03 修「科技升不了」的另一半）：
     *   原先 `tech && techLevel > 0` 紧跟在 done 后面 ⇒ 只要升过一级，徽章与按钮就
     *   **永远**显示「等级 3/5」，被任何门禁卡住都不说原因，玩家只看到一个灰按钮。
     *   现在只有「可研究」时才展示等级，被卡住一律报原因。 */
    var state = done ? tr(tech ? 'tree.detail.status.mastered' : 'tree.detail.status.completed', null, tech ? '已掌握' : '已完成')
      : !revealed ? tr('tree.detail.status.unrevealed', null, '未揭露')
      : !blocked ? (tech && techLevel > 0
        ? tr('tree.detail.level', { currentLevel: techLevel, maxLevel: techMaxLevel }, '等级 ' + techLevel + '/' + techMaxLevel)
        : tr('tree.detail.status.ready_to_research', null, '可研究'))
      : blockKind === 'science' ? tr('tree.detail.status.not_enough_research_points', null, '科技点不足')
      : blockKind === 'culture' ? tr('tree.detail.status.not_enough_civic_points', null, '市政点不足')
      : blockKind === 'material' ? tr('ui.status.materials_missing', null, '材料不足')
      : blockKind === 'prereq' ? tr(tech ? 'tree.detail.status.prerequisites_missing' : 'tree.detail.status.unavailable', null, tech ? '缺少前置' : '暂不可研究')
      : blockKind === 'era' ? tr('tree.detail.status.era_requirement_not_met', null, '纪元未到')
      : blockKind === 'eureka' ? tr('tree.detail.status.eureka_unmet', null, '尤里卡未达成')
      : tr('tree.detail.status.unavailable', null, '暂不可研究');
    var currency = tech ? 'science' : 'culture';
    var currencyName = tr(tech ? 'resource.research_points.name' : 'resource.civic_points.name', null, tech ? '科技点' : '市政点');
    var reqs = item.reqs || [], reqHtml = '', reqDone, parent, parentDone, parentName;
    for (i = 0; i < reqs.length; i++) {
      parent = tech ? SB.tech.byId(reqs[i]) : null;
      if (!tech) {
        for (var ci = 0; SB.CIVICS && ci < SB.CIVICS.length; ci++) {
          if (SB.CIVICS[ci].id === reqs[i]) { parent = SB.CIVICS[ci]; break; }
        }
      }
      parentDone = tech ? !!s.techs[reqs[i]] : !!s.civics[reqs[i]];
      parentName = parent ? localizedTreeNodeName(tech ? 'tech' : 'civic', reqs[i], parent.name) : reqs[i];
      reqHtml += '<span class="tree-req' + (parentDone ? ' met' : '') + '">' +
        (parentDone ? '✓ ' : '· ') + parentName + '</span>';
    }
    if (!reqHtml) reqHtml = '<span class="tree-req met">' + tr('tree.prerequisite.starting_node', null, '无 · 起始节点') + '</span>';

    /* 科技详情必须展示数据里的真实尤里卡条件（item.cond）。
     * 玩家效果与解锁说明走独立字段，不用设计备注或第三方对标文案兜底。 */
    var condition = tech
      ? (item.cond ? (SB.tech.condText(item.cond) || tr('tree.condition.eureka.default', null, '尤里卡条件')) : tr('tree.condition.eureka.not_required', null, '无需尤里卡'))
      : item.boost
        ? (englishLocale() ? (SB.tech.condText(item.boost) || SB.civic.boostText(s, item)) : SB.civic.boostText(s, item))
        : localizedStaticText('civic.data.' + id + '.inspiration', '无需鼓舞');
    var conditionProgress = tech && !revealed && short ? short.txt : '';
    var progress = short && short.need > 0 && !done
      ? Math.max(0, Math.min(100, short.now / short.need * 100)) : 0;
    var showProgress = !revealed && short && short.need > 0;
    /* 追踪尤里卡 / 鼓舞（2026-10-30）：入口之二。只在「未达成」时给 ——
     * 达成那一刻 track-dock 自己会把这条剔掉，按钮也就没意义了。
     * `data-track-kind="btn"` 是给 syncButtons 看的：树节点那颗是纯图标，只有这颗要换文案。 */
    var trackKind = tech ? 'tech' : 'civic';
    var canTrack = !done && !revealed &&
      (tech ? (item.cond && item.cond.t !== 'default') : (item.boost && item.boost.t !== 'default'));
    var trackOn = (canTrack && SB.ui.track && SB.ui.track.isTracked)
      ? SB.ui.track.isTracked(trackKind, id) : false;
    var effect = tech
      ? (SB.tech.effectDisplayText ? SB.tech.effectDisplayText(item) : SB.tech.effectText(item))
      : item.desc;
    if (!tech) effect = localizedStaticText('civic.data.' + id + '.description', effect);
    var unlockText = tech && item.unlockDesc
      ? localizedContentDescription('tech.' + id + '.unlock_desc', item.unlockDesc,
        englishTemplateParams('tech.' + id + '.unlock_desc', item.unlockDesc))
      : '';
    var unlockSection = tech && item.unlockDesc
      ? '<section class="tree-detail-section"><h4>' + tr('tree.detail.heading.unlocks', null, '解锁内容') + '</h4><p>' +
        (revealed ? linkInfoNames(unlockText, true) : tr('tree.detail.hidden_content_hint', null, '达成揭示条件后显示。')) + '</p></section>'
      : '';
    var blockDetail = '';
    function splitBlockMessage(message) {
      var asciiColon = message.indexOf(':'), fullColon = message.indexOf('：'), colon;
      if (asciiColon < 0) colon = fullColon;
      else if (fullColon < 0) colon = asciiColon;
      else colon = Math.min(asciiColon, fullColon);
      return colon < 0
        ? { heading: message, detail: '' }
        : { heading: message.slice(0, colon), detail: message.slice(colon + 1).replace(/^\s+/, '') };
    }
    function blockedMarkup(className, heading, detail) {
      return '<div class="tree-detail-blocked ' + className + '"><b>' + heading + '</b>' +
        (detail ? '<span>' + detail + '</span>' : '') + '</div>';
    }
    function localizedBlockMarkup(className, key, params, fallback, headingFallback) {
      var parts = splitBlockMessage(tr(key, params, fallback));
      return blockedMarkup(className, parts.heading || headingFallback, parts.detail);
    }
    function localizedMissingPrerequisite(idValue, nodeType) {
      var node = treeNodeById(nodeType, idValue);
      return localizedTreeNodeName(nodeType, idValue, node && node.name || idValue);
    }
    if (tech && !done && blocked) {
      if (blockKind === 'unrevealed') {
        blockDetail = blockedMarkup('unrevealed', tr('tree.detail.status.unrevealed', null, '未揭露'), tr('tree.detail.blocked.unrevealed_hint', null, '先达成尤里卡条件，才能看到这项科技的完整信息。'));
      } else if (blockKind === 'eureka') {
        blockDetail = blockedMarkup('eureka', tr('tree.detail.status.eureka_unmet', null, '尤里卡未达成'), tr('tree.detail.blocked.eureka_hint', null, '完成上方条件后，才能投入科技点研究。'));
      } else if (blockKind === 'science') {
        blockDetail = localizedBlockMarkup('science', 'tree.detail.blocked.research_points', {
          currentAmount: SB.economy.fmtAmt(s.res.science), requiredAmount: SB.economy.fmtAmt(cost)
        }, blocked, tr('tree.detail.status.not_enough_research_points', null, '科技点不足'));
      } else if (blockKind === 'prereq') {
        var missingTechNames = [];
        for (i = 0; i < reqs.length; i++) if (!s.techs[reqs[i]]) missingTechNames.push(localizedMissingPrerequisite(reqs[i], 'tech'));
        blockDetail = blockedMarkup('prereq', tr('tree.detail.blocked.missing_prerequisite_technology', null, '缺少前置科技'), missingTechNames.join(englishLocale() ? ', ' : '、'));
      } else if (blockKind === 'material') {
        var materialLack = SB.tech.resCostLack ? SB.tech.resCostLack(s, item) : null;
        var materialId = materialLack && materialLack.r;
        var materialFallback = materialId && SB.RESS && SB.RESS[materialId] ? SB.RESS[materialId].name : String(materialId || '');
        var materialMessage = tr('tree.detail.blocked.materials', {
          resourceName: SB.i18n && SB.i18n.resourceName ? SB.i18n.resourceName(materialId, materialFallback) : materialFallback,
          currentAmount: materialId ? SB.economy.fmtAmt(s.res && s.res[materialId] || 0) : '',
          requiredAmount: materialLack ? SB.economy.fmtAmt(materialLack.n) : ''
        }, blocked);
        var materialParts = splitBlockMessage(materialMessage);
        blockDetail = blockedMarkup('material', materialParts.heading || tr('ui.status.materials_missing', null, '材料不足'), materialParts.detail);
      } else if (blockKind === 'era') {
        blockDetail = localizedBlockMarkup('era', 'tree.detail.blocked.era_hint', {
          eraName: SB.tech.eraName ? SB.tech.eraName(item.era) : String(item.era)
        }, blocked, tr('tree.detail.status.era_requirement_not_met', null, '纪元未到'));
      }
    } else if (!tech && !done && blocked) {
      if (blockKind === 'era') {
        blockDetail = localizedBlockMarkup('era', 'tree.detail.blocked.era_hint', {
          eraName: SB.tech.eraName ? SB.tech.eraName(item.era) : String(item.era)
        }, blocked, tr('tree.detail.status.era_requirement_not_met', null, '纪元未到'));
      } else if (blockKind === 'culture') {
        blockDetail = localizedBlockMarkup('culture', 'tree.detail.blocked.civic_points', {
          currentAmount: SB.economy.fmtAmt(s.res.culture), requiredAmount: SB.economy.fmtAmt(cost)
        }, blocked, tr('tree.detail.status.not_enough_civic_points', null, '市政点不足'));
      } else if (blockKind === 'prereq') {
        var missingCivicNames = [], missingAnyNames = [], reqsAny = item.reqsAny || [];
        for (i = 0; i < reqs.length; i++) if (!s.civics[reqs[i]]) missingCivicNames.push(localizedMissingPrerequisite(reqs[i], 'civic'));
        var anyPrerequisiteMet = reqsAny.some(function (reqId) { return !!s.civics[reqId]; });
        if (reqsAny.length && !anyPrerequisiteMet) {
          for (i = 0; i < reqsAny.length; i++) missingAnyNames.push(localizedMissingPrerequisite(reqsAny[i], 'civic'));
        }
        var civicPrerequisiteDetail = missingCivicNames.join(englishLocale() ? ', ' : '、');
        if (missingAnyNames.length) {
          var oneOfDetail = tr('tree.detail.prerequisites.one_of', {
            civicNames: missingAnyNames.join(englishLocale() ? ', ' : '、')
          }, '完成以下任一市政：' + missingAnyNames.join('、'));
          civicPrerequisiteDetail += civicPrerequisiteDetail ? (englishLocale() ? '; ' : '；') + oneOfDetail : oneOfDetail;
        }
        blockDetail = blockedMarkup('prereq', tr('tree.detail.status.prerequisites_missing', null, '缺少前置'), civicPrerequisiteDetail);
      }
    }
    var studyCost = cost ? SB.economy.costOwnedTxt(s, (function () { var c = {}; c[currency] = cost; return c; })()) : '';
    var blockHead = blocked ? String(blocked).split('：')[0] : '';
    var buttonText = done ? state : blocked ? (englishLocale() ? state : (blockHead || state)) : cost
      ? tr('tree.detail.study_button.paid', { cost: studyCost }, '研究　' + studyCost)
      : tr('tree.detail.study_button.free', null, '免费研究');
    var box = el('modalBox'), modal = el('modal');
    primeModal();
    box.classList.add('tree-detail-box');
    var detailIcon = SB.ui.renderCommon.treeIconHTML(item, revealed, 'tree-detail-icon');
    var civicFlavor = !tech && revealed ? SB.ui.renderContent.CIVIC_FLAVOR[id] : '';
    if (civicFlavor) civicFlavor = localizedStaticText('ui.content.civic_flavor.' + id, civicFlavor);
    var voidCivics = { void_faith: 101, void_explore: 107, ascend_void: 113 };
    var voidCivic = Object.prototype.hasOwnProperty.call(voidCivics, id);
    if (voidCivic && civicFlavor && SB.ui.render && typeof SB.ui.render.voidCorrupt === 'function') {
      civicFlavor = SB.ui.render.voidCorrupt(civicFlavor, voidCivics[id], 1);
    }
    box.innerHTML =
      '<div class="tree-detail-head"><div class="tree-detail-mark' + (detailIcon ? ' has-image' : '') + '">' + (detailIcon || (item.key ? '✦' : tech ? '⌘' : '§')) +
      '</div><div class="tree-detail-title"><h3 id="treeDetailTitle">' + title + (item.key && revealed ? ' <span class="tree-key">' + tr('tree.detail.key_node', null, '关键节点') + '</span>' : '') +
      '</h3><span class="tree-detail-state ' + (done ? 'done' : blocked ? 'locked' : 'ready') + '">' + state + '</span></div>' +
      '<button class="tree-detail-close" type="button" data-modal-close="1" aria-label="' + tr('tree.detail.close.aria_label', null, '关闭详情') + '">×</button></div>' +
      (tech && techMaxLevel > 1 ? '<div class="tree-cost"><span>' + tr('ui.section.current_level', null, '当前等级') + '</span><b>' + techLevel + ' / ' + techMaxLevel + '</b></div>' : '') +
      '<div class="tree-cost"><span>' + tr('tree.detail.heading.research_cost', null, '本次研究成本') + '</span><b>' + (cost ? SB.economy.fmtAmt(cost) + ' ' + currencyName : tr('ui.build.cost.free', null, '免费')) + '</b></div>' + blockDetail +
      '<section class="tree-detail-section"><h4>' + tr(tech ? 'tree.condition.eureka.heading' : 'tree.condition.inspiration.heading', null, tech ? '尤里卡' : '鼓舞') + '</h4><p>' +
      linkInfoNames(condition) + '</p>' +
      (conditionProgress ? '<small class="tree-eureka-progress">' + tr('tree.detail.progress.current', null, '当前进度：') + conditionProgress + '</small>' : '') +
      (showProgress ? '<div class="tree-progress"><i style="width:' + progress.toFixed(1) + '%"></i></div>' : '') +
      (showProgress ? '<small>' + tr('tree.detail.progress.percent', { percent: progress.toFixed(0) }, '进度 ' + progress.toFixed(0) + '%') + '</small>' : '') +
      (canTrack ? '<button type="button" class="btn tree-track-btn' + (trackOn ? ' on' : '') +
        '" data-track-kind="btn" data-track-toggle="' + trackKind + ':' + id + '">' +
        tr(trackOn ? 'tree.track.stop' : tech ? 'tree.track.eureka' : 'tree.track.inspiration', null, trackOn ? '取消追踪' : '追踪' + (tech ? '尤里卡' : '鼓舞')) + '</button>' : '') + '</section>' +
      '<section class="tree-detail-section"><h4>' + tr('ui.section.effects', null, '效果') + '</h4><p>' +
      (revealed ? linkInfoNames(effect, !tech && /工坊配方/.test(effect)) : tr('tree.detail.hidden_content_hint', null, '达成揭示条件后显示。')) + '</p></section>' +
      unlockSection +
      '<section class="tree-detail-section"><h4>' + tr('tree.detail.heading.prerequisites', null, '前置节点') + '</h4><div class="tree-reqs">' + reqHtml + '</div></section>' +
      (tech && revealed && TECH_FLAVOR[id] ? '<p class="b-flavor">' + localizedStaticText('ui.content.tech_flavor.' + id, TECH_FLAVOR[id]) + '</p>' : '') +
      (civicFlavor ? '<p class="b-flavor' + (voidCivic ? ' void-flavor' : '') + '">' + civicFlavor + '</p>' : '') +
      '<div class="tree-detail-actions"><button class="btn buy" type="button" data-tree-study="' + (tech ? 'tech' : 'civic') + '" data-' + (tech ? 'tech' : 'civic') + '="' + id + '"' +
      (done || blocked ? ' disabled' : '') + (blocked ? ' title="' + (englishLocale() ? state : blocked) + '"' : '') + '>' + buttonText + '</button>' +
      '<button class="btn tree-back" type="button" data-modal-close="1">' + tr('tree.detail.action.back_to_tree', null, '返回树图') + '</button></div>';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'treeDetailTitle');
    modal.classList.add('tree-modal');
    modal.classList.remove('tree-tech');
    modal.classList.remove('tree-civic');
    modal.classList.add(tech ? 'tree-tech' : 'tree-civic');
    modal.classList.remove('void-civic-modal');
    modal.classList.remove('void-ending-modal');
    if (voidCivic) modal.classList.add('void-civic-modal');
    modal.classList.remove('hidden');
    bodyModalClass(true);
  }

  function openInfoCard(title, mark, state, body, actions, markClass) {
    var box = el('modalBox'), modal = el('modal');
    primeModal();
    box.classList.add('tree-detail-box');
    box.innerHTML = '<div class="tree-detail-head"><div class="tree-detail-mark' + (markClass ? ' ' + markClass : '') + '">' + mark +
      '</div><div class="tree-detail-title"><h3 id="treeDetailTitle">' + title + '</h3>' +
      '<span class="tree-detail-state ' + state.cls + '">' + state.text + '</span></div>' +
      '<button class="tree-detail-close" type="button" data-modal-close="1" aria-label="' + tr('tree.detail.close.aria_label', null, '关闭详情') + '">×</button></div>' +
      body + '<div class="tree-detail-actions">' + (actions || '') +
      '<button class="btn tree-back" type="button" data-modal-close="1">' + tr('ui.action.close', null, '关闭') + '</button></div>';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'treeDetailTitle');
    modal.classList.add('tree-modal');
    modal.classList.remove('void-civic-modal');
    modal.classList.remove('void-ending-modal');
    modal.classList.remove('hidden');
    bodyModalClass(true);
  }

  /* 建筑「一行描述」的**单一出口**（卡面 default 兜底 / 巢穴页建筑行 / 星图建筑行）。
   * 2026-10-21（用户拍板）：描述里**不许出现「如果研究了 X 就是多少」的条件句**——
   *   凡「科技会改写数值」的建筑，一律读本局实际状态出数。目前只有核热厂属这一类：
   *   核聚变（s.techs.nuclear_fusion）改两处（产出 ×5 / 铀耗 ×2，判据与结算逐字同源）。
   * 其余建筑退回静态 `b.desc`（那些 desc 本来就是「每级基础量」，不含条件分支）。
   * ⚠️ 调用点必须传当前局内状态 `s`；传 null 会按「未研究」出数（= 基础值）。 */
  function buildingDescText(s, b) {
    if (!b) return '';
    var _id = String(b.id || '');
    /* Water Pollution challenge descriptions use live rule/config values so the translated
     * card stays in sync with production and challenge balance settings. */
    var _cleanHydroKey = {
      tidemachine: 'tideHydro', solarstation: 'solarHydro', enladofarm: 'windHydro'
    }[_id];
    if (_cleanHydroKey) {
      var _cleanHydro = SB.BLD && SB.BLD[_cleanHydroKey];
      if (typeof _cleanHydro === 'number') {
        return tr('building.' + _id + '.description', {
          hydroEnergyPerLevelPerSecond: _cleanHydro
        }, b.desc || '');
      }
    }
    var _pollutionCfg = SB.CFG && SB.CFG.POLLUTION || {};
    var _burialCfg = _pollutionCfg.BURIAL || {};
    if (_id === 'grave' && typeof _burialCfg.PER_GRAVE === 'number' &&
        typeof _burialCfg.IN_CAP === 'number' && typeof _burialCfg.OVER_CAP === 'number') {
      return tr('building.grave.description', {
        burialSlotsPerGrave: _burialCfg.PER_GRAVE,
        happinessPenaltyWithinCapacity: String(Number((_burialCfg.IN_CAP * 100).toFixed(2))).replace(/\.0+$/, ''),
        happinessPenaltyOverCapacity: String(Number((_burialCfg.OVER_CAP * 100).toFixed(2))).replace(/\.0+$/, '')
      }, b.desc || '');
    }
    if (_id === 'hospital' && typeof _pollutionCfg.HOSP_MAX_LVL === 'number' &&
        typeof _pollutionCfg.HOSP_MAX_REDUCE === 'number') {
      return tr('building.hospital.description', {
        maximumHospitalLevel: _pollutionCfg.HOSP_MAX_LVL,
        maximumMortalityReduction: String(Number((_pollutionCfg.HOSP_MAX_REDUCE * 100).toFixed(2))).replace(/\.0+$/, '')
      }, b.desc || '');
    }
    if (_id === 'reserve' && typeof _pollutionCfg.CLEAN_RESERVE === 'number') {
      return tr('building.reserve.description', {
        pollutionRemovedPerSecond: _pollutionCfg.CLEAN_RESERVE
      }, b.desc || '');
    }
    /* ⚠️ 2026-10-27 这里曾有一段 warmnest 的动态出数（按等级算「当前 N 级 = −X%」），
     *   用户当天先要「说清楚」、看完又说「0.5% 之后的全部删掉」⇒ 已整体撤掉，
     *   现在 warmnest 直接回退到 config 里那句最短的 desc。
     *   要看当前实际减免，信息卡的「效果」段仍按统一格式给（buildingEffectText 的
     *   case 'warmnest' →「族民口粮消耗 −0.5%/级（当前 −2.5%）」），那里是**所有建筑通用**
     *   的「每级 / 当前」结构，不是这条建筑专属的冗长解释，所以保留。 */
    if (b.id === 'fissionplant') {
      var _nfz = !!(s && s.techs && s.techs.nuclear_fusion);
      var _h = (SB.BLD.fissionHydro || 0) * (_nfz ? 5 : 1) * (SB.economy.starNuclearHydroMul ? SB.economy.starNuclearHydroMul(s || { perk: {} }) : 1);
      var _u = (SB.BLD.fissionUranium || 0) * (_nfz ? 2 : 1);
      var _lx = (SB.BLD.fissionLuxAdd || 0) * 100;
      var _fusionNote = _nfz
        ? tr('building.effect.fission_plant.fusion_note', null, '。核聚变已研究，上列数已含其加成。')
        : (englishLocale() ? '' : '。');
      return tr('building.fissionplant.description', {
        hydroEnergyPerLevelPerSecond: _h,
        uraniumUsePerLevelPerSecond: _u.toFixed(2),
        luxuryUpkeepIncreasePerLevel: _lx.toFixed(0),
        fusionNote: _fusionNote
      }, '热液能 +' + _h + '/秒/级（不烧暖石）；耗铀 ' + _u.toFixed(2) +
        '/秒/级；居民奢侈品消耗 +' + _lx.toFixed(0) + '%/级（负面）。' +
        (_nfz ? '核聚变已研究，上列数已含其加成。' : ''));
    }
    if (b.id === 'researchlab') {
      var _researchPct = (SB.BLD.researchLabSci || 0) * 100;
      var _researchSavePct = (SB.BLD.researchLabSave || 0) * 100;
      return tr('building.researchlab.description', {
        researchOutputBonus: _researchPct.toFixed(1),
        researchCostReduction: _researchSavePct.toFixed(0)
      }, '学者科技产出 +' + _researchPct.toFixed(1) + '%/级；研究科技消耗 −' +
        _researchSavePct.toFixed(0) + '%/级。');
    }
    if (b.id === 'robotbay') {
      var _foldable = (s && s.perk && s.perk.starFoldableStructure) || 0;
      var _robotsPerBay = 4 + _foldable;
      var _robotBayHydro = (SB.UNIT.robotbayHydro || 0) + 2 * _foldable;
      var _robotBaseMult = SB.folk && SB.folk.robotMult ? SB.folk.robotMult({ upgrades: {} }) : 1.2;
      var _robotAIMult = SB.folk && SB.folk.robotMult ? SB.folk.robotMult({ upgrades: { upg_strongai: true } }) : 1.5;
      return tr('building.robotbay.description', {
        robotPopulationPerLevel: _robotsPerBay,
        robotOutputBonus: Math.round((_robotBaseMult - 1) * 100),
        strongAIOutputBonus: Math.round((_robotAIMult - 1) * 100),
        hydroEnergyConsumptionPerLevelPerSecond: _robotBayHydro
      }, '维持 ' + _robotsPerBay + ' 机器人人口/级：仅担任非书手/学者岗位，产出 +' +
        Math.round((_robotBaseMult - 1) * 100) + '%。工坊升级「强人工智能」后产出 +' +
        Math.round((_robotAIMult - 1) * 100) + '%，且按人口数量产出信仰。耗热液能 ' +
        _robotBayHydro + '/秒/级。');
    }
    var _staticDescription = tr('building.' + String(b.id || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() + '.description');
    if (_staticDescription && _staticDescription.indexOf('{') < 0) return _staticDescription;
    return b.desc || '';
  }

  /* 建筑信息卡「效果」段：把每座建筑的「每级基础量 × 当前等级 = 当前总量」写清楚，
   * 与住房那一支（人口上限 +X/级（当前 +Y））同构。所有带每级效果的产出 / 容量 / 减耗建筑都走这里；
   * 一次性效果（炉 / 城堡 / 观测站 / 工坊产钢）无「每级」概念，回退到 desc。
   * ⚠️「当前」= 基础每级量 × 当前等级，不含科技 / 奇观 / 政策等外部乘区——
   *   与住房那条保持一致（housePerLevel×lv 也不含 perk 外的乘区），避免面板与结算两套口径。 */
  function buildingEffectText(s, b, lv) {
    var B = SB.BLD, U = SB.UNIT || {}, id = b.id, L = lv;
    function effectLabel(key, fallback) {
      return tr('building.effect.label.' + key, null, fallback);
    }
    function add(label, perVal, curVal, unit, dec) {
      var d = dec == null ? 0 : dec;
      var per = perVal.toFixed(d), current = curVal.toFixed(d);
      return tr('building.effect.per_level.amount', {
        label: label, perLevelValue: per, currentValue: current,
        unit: unit || ''
      }, label + ' +' + per + '/级' + (unit || '') + '（当前 +' + current + (unit || '') + '）');
    }
    function pct(label, perPct, curPct, dec, sign) {
      var d = dec == null ? 1 : dec; sign = sign || '+';
      var per = perPct.toFixed(d), current = curPct.toFixed(d);
      return tr('building.effect.per_level.percent', {
        label: label, sign: sign, perLevelPercent: per, currentPercent: current
      }, label + ' ' + sign + per + '%/级（当前 ' + sign + current + '%）');
    }
    /* 大学（upg_university）在 BLD.instituteSci 之上再加一份 instituteSci ⇒ 面板这句
     * 必须**现读配置**。2026-10-30 之前这里写死「×100%」，而 BLD 从 0.50 降到 0.30 后
     * 合计只有 0.80（2026-11-02 又降到 0.60）⇒ 写死的数会立刻变成假话。凡「合计值 = 基础值 + 升级值」一律现算，
     * 不许留第二份真源。 */
    function uniSciTotal() {
      var t = (B.instituteSci || 0), i;
      for (i = 0; SB.UPGRADES && i < SB.UPGRADES.length; i++) {
        if (SB.UPGRADES[i].id === 'upg_university') t += (SB.UPGRADES[i].instituteSci || 0);
      }
      return t;
    }
    /* 「研究所有没有已经升级成大学」——判据与 showBuildingInfo 顶部那段改名循环**同一套**
     * （`upgradesBuilding === 'institute'` + `s.upgrades[id]`），不另写一份 id 常量：
     * 将来换升级项或再加一项顶替研究所时，改名与效果两句会一起跟着变，不会一处新一处旧。
     * ⚠️ `s.upgrades.<id>` 只有「装没装」两态（workshop.upgradeBuy 只写 true），别当等级用。 */
    function uniInstalled() {
      for (var i = 0; SB.UPGRADES && i < SB.UPGRADES.length; i++) {
        var u = SB.UPGRADES[i];
        if (u.upgradesBuilding === 'institute' && s && s.upgrades && s.upgrades[u.id]) return true;
      }
      return false;
    }
    switch (id) {
      /* 计数单位（2026-11-09）：等级 L 一大，当前产出就是十位数裸数字。
       * ⚠️ 词库参数 + 中文回退串成对改（本文件 tr 不插值 fallback）。 */
      case 'kelp': {
        var _kPer = SB.economy.fmtAbbr(B.food, B.food.toFixed(2));
        var _kCur = SB.economy.fmtAbbr(B.food * L, (B.food * L).toFixed(2));
        return tr('building.effect.kelp_farm', {
          perLevelProduction: _kPer, currentProduction: _kCur
        }, '自动产藻食 +' + _kPer + '/级/秒（当前 +' + _kCur + '）；吃季节减产');
      }
      case 'weir':         return pct(effectLabel('kelp_output', '藻食产出'), B.foodWeir * 100, B.foodWeir * 100 * L);
      case 'warmnest':     return pct(effectLabel('people_food_consumption', '族民口粮消耗'), B.foodSave * 100, B.foodSave * 100 * L, 1, '−');
      case 'kelpstore':    return add(effectLabel('kelp_storage_cap', '藻食上限'), B.kelpCap, B.kelpCap * L, '', 0);
      case 'ballast':      return add(effectLabel('other_resources_cap', '其余资源上限'), B.ballastCap, B.ballastCap * L, '', 0);
      case 'lighthouse':   return joinInfoText(
        pct(effectLabel('global_production', '全资源产出'), B.lighthouseProd * 100, B.lighthouseProd * 100 * L, 0),
        add(effectLabel('other_resources_cap', '其余资源上限'), B.lighthouseCap, B.lighthouseCap * L, '', 0));
      case 'workshop':     return pct(effectLabel('crafting_efficiency', '工艺制作效率'), (b.craftRatio || 0) * 100, (b.craftRatio || 0) * 100 * L, 0);
      case 'siltpit':      return pct(effectLabel('miner_quarry_output', '矿工与采石工产出'), B.siltBonus * 100, B.siltBonus * 100 * L, 0);
      case 'library':      return pct(effectLabel('scholar_research_output', '学者科技产出'), B.sciRatio * 100, B.sciRatio * 100 * L, 0);
      /* ⚠️ 2026-11-02 修（用户报「大学不是 +80% 吗，450% 是显示错误还是加成不对」）：
       *   原样输出是「学者科技产出 +30%/级（当前 +450%）；升级为大学后变 +80%/级」——
       *   而卡片标题此时已经是「大学」（showBuildingInfo 顶部按 upgradesBuilding 改名），
       *   前半句却仍是升级前的 30%，后半句还在说「升级后」，读起来就是「加没生效」。
       *   结算侧三条读取点（economy-rates 的 _sciBr / economy-tick / economy.js）
       *   写的都是 `BLD.instituteSci + upgSum(s,'instituteSci')` ⇒ 实际就是两值之和
       *   （2026-11-02 起 0.30 + 0.30 = 0.60/级），错的只有那句文案。
       *   已装升级时直接给合计值与真实当前值，不再提「升级后」。 */
      case 'institute': {
        if (uniInstalled()) return pct(effectLabel('scholar_research_output', '学者科技产出'), uniSciTotal() * 100, uniSciTotal() * 100 * L, 0);
        return tr('building.effect.institute.pre_university', {
          basePct: (B.instituteSci * 100).toFixed(0),
          currentPct: (B.instituteSci * 100 * L).toFixed(0),
          universityPct: (uniSciTotal() * 100).toFixed(0)
        }, '学者科技产出 +' + (B.instituteSci * 100).toFixed(0) + '%/级（当前 +' + (B.instituteSci * 100 * L).toFixed(0) + '%）；升级为大学后变 +' + (uniSciTotal() * 100).toFixed(0) + '%/级');
      }
      case 'square':       return tr('building.effect.civic_square', {
        scribeJob: localizedJobName(s, 'scribe'),
        perLevelPct: (B.squareCivRatio * 100).toFixed(0),
        currentPct: (B.squareCivRatio * 100 * L).toFixed(0)
      }, '市政点产出（仅' + SB.folk.jobName(s, 'scribe') + '） +' + (B.squareCivRatio * 100).toFixed(0) + '%/级（当前 +' + (B.squareCivRatio * 100 * L).toFixed(0) + '%）；装《戏剧与诗歌》后翻倍');
      case 'temple':       return tr('building.effect.temple', {
        perLevelPct: (B.templeFaithRatio * 100).toFixed(0),
        currentPct: (B.templeFaithRatio * 100 * L).toFixed(0)
      }, '信仰产出 +' + (B.templeFaithRatio * 100).toFixed(0) + '%/级（当前 +' + (B.templeFaithRatio * 100 * L).toFixed(0) + '%）；装《神学》后翻倍');
      case 'hydroturbine': return add(tr('content.hydro.short', null, '热液能'), U.hydroOut || 0, (U.hydroOut || 0) * L, tr('ui.unit.per_second.short', null, '/秒'), 0);
      case 'coralfarm':    return pct(effectLabel('coralworkers_output', '珊瑚匠产出'), B.coralFarmCW * 100, B.coralFarmCW * 100 * L, 0);
      case 'bank':         return pct(effectLabel('merchant_output', '商人产出'), B.bankLux * 100, B.bankLux * 100 * L, 0);
      case 'school':       return joinInfoText(
        add(effectLabel('merfolk_research_output', '每名鲛人科技产出'), B.schoolMermanSci, B.schoolMermanSci * L, tr('ui.unit.per_second.short', null, '/秒'), 1),
        add(effectLabel('merfolk_civic_output', '每名鲛人市政产出'), B.schoolMermanCivic, B.schoolMermanCivic * L, tr('ui.unit.per_second.short', null, '/秒'), 1));
      case 'theater':      return tr('building.effect.theater', {
        scribeJob: localizedJobName(s, 'scribe'),
        perLevelPct: (B.theaterCivRatio * 100).toFixed(0),
        currentPct: (B.theaterCivRatio * 100 * L).toFixed(0)
      }, SB.folk.jobName(s, 'scribe') + '市政点产出 +' + (B.theaterCivRatio * 100).toFixed(0) + '%/级（当前 +' + (B.theaterCivRatio * 100 * L).toFixed(0) + '%）');
      case 'hotforge':     return pct(effectLabel('crafting_efficiency', '工艺制作效率'), B.hotforgeCraft * 100, B.hotforgeCraft * 100 * L, 0);
      case 'canal':        return tr('building.effect.canal', {
        perLevelPct: (B.canalLuxSave * 100).toFixed(1), currentPct: (B.canalLuxSave * 100 * L).toFixed(1)
      }, '居民奢侈品消耗 −' + (B.canalLuxSave * 100).toFixed(1) + '%/级（当前 −' + (B.canalLuxSave * 100 * L).toFixed(1) + '%）；等级最高不超过灯塔等级');
      case 'caravanserai': return tr('building.effect.caravanserai', {
        perLevelPct: (B.caravanseraiLuxSave * 100).toFixed(0),
        currentPct: (B.caravanseraiLuxSave * 100 * L).toFixed(0),
        bonusDuration: tr('save.time.duration.minutes', { count: 1 }, '1 分钟')
      }, '居民奢侈品消耗 −' + (B.caravanseraiLuxSave * 100).toFixed(0) + '%/级（当前 −' + (B.caravanseraiLuxSave * 100 * L).toFixed(0) + '%）；每季节额外获得「等级 × 1 分钟」产量的任意时产资源');
      case 'museum':       return tr('building.effect.museum', {
        scribeJob: localizedJobName(s, 'scribe'),
        perLevelPct: ((B.museumCivRatio || 0.20) * 100).toFixed(0),
        currentPct: ((B.museumCivRatio || 0.20) * 100 * L).toFixed(0)
      }, SB.folk.jobName(s, 'scribe') + '市政点产出 +' + ((B.museumCivRatio || 0.20) * 100).toFixed(0) + '%/级（当前 +' + ((B.museumCivRatio || 0.20) * 100 * L).toFixed(0) + '%）');
      case 'civichall':    return pct(effectLabel('hall_civic_points_output', '议事厅／城堡市政点产出'), (B.civicHallRatio || 0.50) * 100,
                                 (B.civicHallRatio || 0.50) * 100 * L, 0);
      /* 2026-10-21（用户拍板）：核热厂卡面**按本局实际状态出数**——不再写「（核聚变后×2）」
       *   这种「如果你研究了会是多少」的条件句，该是多少就是多少。
       *   核聚变（s.techs.nuclear_fusion）在结算里只改两个量，这里逐字照抄那个判据：
       *     ① economy.js hydroAlloc：热液能产出 ×5（`_nf`）
       *     ② economy-tick.js 直扣：铀耗 ×2（`_nfu`）
       *   两态只有「已研究 / 未研究」，与结算同源 ⇒ 卡面数 = 结算数（面板撒谎家族纪律）。
       *   ⚠️ 别在这里另写一份「×5/×2」的乘区表：将来若结算改了字面量，这里必须同步改
       *      （与 rates 的 _fissionUraniumMul 同性质，属「同一乘区三处读数」）。 */
      case 'fissionplant': {
        var _nfz = !!(s && s.techs && s.techs.nuclear_fusion);
        var _fHyd = (B.fissionHydro || 0) * (_nfz ? 5 : 1);
        var _fUr = (B.fissionUranium || 0) * (_nfz ? 2 : 1);
        var _fLux = (B.fissionLuxAdd || 0) * 100;
        var _luxPer = Math.round(_fLux * 100) / 100, _luxCur = Math.round(_fLux * L * 100) / 100;
        /* 计数单位（2026-11-09）：四个 /秒 读数同源；两个 %/级 是百分比不是产出，保持原样。
         * ⚠️ 词库参数 + 中文回退串成对改（本文件 tr 不插值 fallback）。 */
        var _hydPer = SB.economy.fmtAbbr(_fHyd, _fHyd);
        var _hydCur = SB.economy.fmtAbbr(_fHyd * L, _fHyd * L);
        var _urPer = SB.economy.fmtAbbr(_fUr, _fUr.toFixed(2));
        var _urCur = SB.economy.fmtAbbr(_fUr * L, (_fUr * L).toFixed(2));
        return tr('building.effect.fission_plant', {
          hydroPerSecond: _hydPer, hydroCurrentPerSecond: _hydCur,
          uraniumPerSecond: _urPer, uraniumCurrentPerSecond: _urCur,
          luxuryIncrease: _luxPer, luxuryCurrentIncrease: _luxCur,
          fusionNote: _nfz ? tr('building.effect.fission_plant.fusion_note', null, '。核聚变已研究，上列数已含其加成。') : ''
        }, '热液能 +' + _hydPer + '/秒/级（当前 +' + _hydCur + '/秒，不烧暖石）；耗铀 ' + _urPer + '/秒/级（当前 −' + _urCur + '/秒）；居民奢侈品消耗 +' + _luxPer + '%/级（当前 +' + _luxCur + '%，负面）' + (_nfz ? '。核聚变已研究，上列数已含其加成。' : ''));
      }
      case 'hydroshop':    return tr('building.effect.hydroshop', null, '吃金属产钢（产钢量随热液能供给浮动）');
      case 'furnace':      return tr('building.effect.metal_to_iron', null, '解锁 金属 → 精铁（一次性效果，不随等级递增）');
      case 'observatory': {
        var _capPct = Math.max(0, Number(B.obsMaxBonus) || 0);
        var _stepPct = _capPct > 0 ? 100 / _capPct : 0;
        var _stepBonus = _stepPct * _capPct / 100;
        var _stepText = String(Math.round(_stepPct * 10) / 10);
        var _stepBonusText = String(Math.round(_stepBonus * 10) / 10);
        var _ob = tr('building.effect.observatory', {
          timing: tr(L > 0 ? 'building.effect.observatory.timing.current' : 'building.effect.observatory.timing.after_construction', null, L > 0 ? '当前' : '建成后可得'),
          bonusPct: SB.economy.observatoryBonusPct ? SB.economy.observatoryBonusPct(s).toFixed(1) : '0.0',
          shellReductionStepPct: _stepText,
          bonusPerStepPercentagePoints: _stepBonusText,
          bonusCap: _capPct.toFixed(0)
        }, (L > 0 ? '当前' : '建成后可得') + '：学者科技产出 +' + (SB.economy.observatoryBonusPct ? SB.economy.observatoryBonusPct(s).toFixed(1) : '0.0') + '%（本局壳体每削薄 ' + _stepText + '% 增加 ' + _stepBonusText + ' 个百分点，最高 +' + _capPct.toFixed(0) + '%；观测站等级不叠加）');
        /* 星空观测站升级（upg_starscope）额外加成：+40% 科技产出（obsSciBoost）+ 每 tick +1 星空探索
         * （starExplore，破壳后被动累积）。数值直接走 economy.upgSum 读 UPGRADES 表，与结算同口径，
         * 不硬编码，避免数值改了文案不跟。纯展示、不进存档、不被 e2e 读值。 */
        if (s.upgrades && s.upgrades.upg_starscope) {
          var _boost = SB.economy.upgSum(s, 'obsSciBoost') * 100;
          var _star = SB.economy.upgSum(s, 'starExplore');
          _ob += tr('building.effect.observatory.upgrade_bonus', {
            researchBonusPct: _boost.toFixed(0),
            starExplorationNote: _star > 0
              ? tr('building.effect.observatory.star_exploration_note', { starExplorationPerTick: _star.toFixed(0) }, '，每 tick +' + _star.toFixed(0) + ' 星空探索（破壳后累积）')
              : ''
          }, '；星空观测站升级额外 +' + _boost.toFixed(0) + '% 科技产出' + (_star > 0 ? '，每 tick +' + _star.toFixed(0) + ' 星空探索（破壳后累积）' : ''));
        }
        return _ob;
      }
      /* 2026-10-29（用户拍板「改成真边际效益」）：议价曲线换成**等比递减**
       *   （每级增量 = rate × ρ^(n−1)），从第 1 级起每级都在少省，且**永远差一点**到渐近上限。
       *   ⚠️ 2026-10-29 之前那句「约 N 级到顶」必须彻底删掉：旧曲线（getLimitedDR）确实有
       *     25 级/17 级硬到顶，但它的末段是凸的（18~24 级每级增量会回升到 3.16%），写
       *     「越升越少」会与玩家观察打架。现在两个问题一起解决：全程递减 + 没有假到顶。
       *   ⚠️ 文案里的每个数都走 SB.economy.hallInfo（与 costOf 同一段公式）——绝不在这里
       *     复刻 rate/limit/ρ，否则「面板说还能省、结算其实不是」就是下一个撒谎点。
       *   ⚠️ 2026-10-29 用户二次拍板：**面板上不许出现设计语汇**。
       *     「渐近上限 60%」「约每 N 级增量减半」「只能逼近不能到达」这类是设计文档的话，
       *     玩家读不懂也不需要——他要的是「我现在省多少、再升一级还能多省多少」。
       *     所以这里只留两个玩家能直接验算的数：当前 −X%、下一级 +Y%。
       *     「越升越少」由这两个数的序列本身体现，不再补任何参数说明。
       *     rate / limit / ρ / halfLvl 一律不进文案（只活在 hallInfo 的返回值里）。 */
      case 'hall': {
        var _hi = (SB.economy.hallInfo ? SB.economy.hallInfo(s) : null);
        var _castle = SB.workshop && SB.workshop.upgradeById ? SB.workshop.upgradeById('upg_castle') : null;
        var _capEra = _castle && _castle.capEra != null ? Number(_castle.capEra) : 3;
        var _capEraLabel = String(_capEra);
        if (!englishLocale()) {
          var _eraNames = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
          if (_capEra >= 0 && _capEra < _eraNames.length) _capEraLabel = _eraNames[_capEra];
        }
        var _capacity = _castle && _castle.castleCap != null ? Number(_castle.castleCap) : 50;
        var _capParams = { capEra: _capEraLabel, capacityPerLevel: _capacity };
        if (!_hi) return tr('building.effect.hall.fallback', _capParams,
          '随等级降低所有建筑下一级造价，但越升省得越少；升级为城堡后减得更多，并额外给纪元' + _capEraLabel + '及之前有上限资源 +' + _capacity + ' 容量/级');
        if (_hi.lvl <= 0) {
          return tr('building.effect.hall.unbuilt', Object.assign({
            firstLevelSaving: (_hi.nextGain * 100).toFixed(1)
          }, _capParams), '建成后每级降低所有建筑下一级造价，第 1 级省 ' + (_hi.nextGain * 100).toFixed(1) + '%，之后越升省得越少；另给纪元' + _capEraLabel + '及之前有上限资源 +' + _capacity + ' 容量/级');
        }
        if (_hi.nextGain > 0.0002) return tr('building.effect.hall.current_discount', Object.assign({
          currentDiscount: (_hi.discount * 100).toFixed(1),
          nextLevelSaving: (_hi.nextGain * 100).toFixed(2)
        }, _capParams), '所有建筑下一级造价 −' + (_hi.discount * 100).toFixed(1) + '%；再升 1 级多省 ' + (_hi.nextGain * 100).toFixed(2) + '%；另给纪元' + _capEraLabel + '及之前有上限资源 +' + _capacity + ' 容量/级');
        return tr('building.effect.hall.near_limit', Object.assign({
          currentDiscount: (_hi.discount * 100).toFixed(1)
        }, _capParams), '所有建筑下一级造价 −' + (_hi.discount * 100).toFixed(1) + '%，再升级几乎不再降低造价；另给纪元' + _capEraLabel + '及之前有上限资源 +' + _capacity + ' 容量/级');
      }
      default:             return buildingDescText(s, b);
    }
  }

  /* 建筑信息卡「运行消耗」段：把每座**持续消耗资源**的建筑吃掉的东西逐项写明，
   * 与 earlier「直接在消耗暖石的地方写明消耗多少」（2026-10-16，仅 furnace/turbine 行内标暖石）
   * 一脉相承，但把口径扩到**所有有消耗的建筑**、且**不只写暖石**——
   * 例如热泉炉除暖石外还吃金属、热液工坊吃热液能+金属，这些此前在卡面上都没写。
   * 【口径纪律】这里只列「资源名 + 可用速率」，不再重复写「产出」；产出归 buildingEffectText。
   *   ① 三个数一律走 economy.consumeRates（金属/暖石/热液能一次给齐，与结算同式的额定每秒）
   *      —— 巢穴页「开几座」控件行读同一函数，卡面与面板不会再各说一套（面板撒谎家族）。
   *      停产（运转座数=0）时它自然归 0，文案自动转「停产时为 0」避免写死一个过时数。
   *   ② 金属不再是「每份扣 1」这种模糊话：consumeRates 已把它折成每秒（含 bldEff 效率折扣），
   *      与 tick 实扣同式，所以卡面给的数就是玩家真的会看到的扣减速率。
   *   ③ 不进存档、不被 e2e 读值，纯展示——改它 = 改文案，不需要标定。 */
  /* 每种建筑**真吃哪几样**（顺序=效果描述的语序）。不在表里 = 不吃料、不出现「运行消耗」段。
   * ⚠️ 别用「有值就列」来推：汽轮机完全不吃金属，而它的 metal 恰好是 0，靠值判断会漏；
   *   反过来热泉炉停产时金属也是 0，靠值判断会把整段吞掉。**吃什么是静态事实，写死在表里**。 */
  var BUILDING_CONSUME = {
    furnace: ['metal', 'warm'],        // 金属 + 暖石 → 精铁
    hydroturbine: ['warm'],            // 暖石 → 热液能
    hydroshop: ['hydro', 'metal'],     // 热液能 + 金属 → 钢
    spacestation: ['hydro'],           // 热液能 → 星空探索（每级 2/s）
    satellite: ['hydro'],             // 热液能 → 星空探索（每级 1/s）
    biomatlab: ['kelp', 'iron', 'titanium', 'uranium', 'hydro'] // θ产线原料 + 热液能
  };
  var CONSUME_LABEL = {
    metal: '金属', warm: '暖石', hydro: '热液能',
    kelp: '藻食', iron: '精铁', titanium: '钛', uranium: '铀'
  };
  var CONSUME_RESOURCE_ID = {
    metal: 'silt', warm: 'warmstone', hydro: 'hydro',
    kelp: 'kelp', iron: 'iron', titanium: 'titanium', uranium: 'uranium'
  };
  var CONSUME_IDLE_KEY = {
    metal: 'metal', warm: 'warmstone', hydro: 'hydrothermal_energy',
    kelp: 'kelp', iron: 'iron', titanium: 'titanium', uranium: 'uranium'
  };
  function consumeResourceName(key) {
    var id = CONSUME_RESOURCE_ID[key], fallback = CONSUME_LABEL[key] || key;
    return SB.i18n && SB.i18n.resourceName
      ? SB.i18n.resourceName(id, fallback) : fallback;
  }
  function consumeIdleText(key) {
    var suffix = CONSUME_IDLE_KEY[key] || key;
    return tr('building.consume.idle.' + suffix, null, CONSUME_IDLE[key]);
  }
  function consumeRateText(key, rate) {
    /* 计数单位（2026-11-09）：消耗速率与资源卡 /s 同源；一处改动同时供词库参数与中文回退串。 */
    var resourceName = consumeResourceName(key);
    var amount = SB.economy.fmtAbbr(rate, rate.toFixed(2));
    return tr('building.consume.rate_item', { resourceName: resourceName, rate: amount },
      resourceName + ' −' + amount + '/秒');
  }
  /* 停产/未建成时的口径说明：不给数字 0，否则玩家会读成「这东西不要料」。 */
  var CONSUME_IDLE = {
    metal: '金属（按转制份数扣，停产时为 0）',
    warm: '暖石（按运转座数扣，停产时为 0）',
    hydro: '热液能（按等级需求，停产时为 0）',
    kelp: '藻食（按等级需求，缺料时按比例降产）',
    iron: '精铁（按等级需求，缺料时按比例降产）',
    titanium: '钛（按等级需求，缺料时按比例降产）',
    uranium: '铀（按等级需求，缺料时按比例降产）'
  };
  /* 2026-10-17：把「这座建筑吃哪几样」静态表与 IDLE 文案挂到 SB.ui.consumeMeta，
   * 供巢穴页控件行、信息卡与星图建筑管理（SB.ui.drawTag，原 render-pane-village.js 局部函数，
   * 2026-10-21 提升为共享）共用同一份事实——避免多处各写一份、改一处漏一处（单一数据源）。 */
  SB.ui.consumeMeta = { BUILDING_CONSUME: BUILDING_CONSUME, CONSUME_LABEL: CONSUME_LABEL, CONSUME_IDLE: CONSUME_IDLE };

  /* 2026-10-21：把「建筑运行消耗标注」抽成共享函数 SB.ui.drawTag（原 render-pane-village.js
   * 局部函数），巢穴页控件行、信息卡、星图建筑管理三处共用同一份口径/格式/tooltip——
   * 与 consumeMeta 同源，彻底消灭「面板撒谎 / 各写一份」。星图原本硬编码
   * 「热液能 −1/秒·座」这种脱离真实建筑定义的字面量，现已并入单源。 */
  function drawTag(sp, id) {
    var meta = SB.ui && SB.ui.consumeMeta;
    var cr = (SB.economy && SB.economy.consumeRates) ? SB.economy.consumeRates(sp, id) : null;
    if (!cr || !meta) return '';
    var eats = meta.BUILDING_CONSUME[id];
    if (!eats || !eats.length) return '';
    var ps = [], summary = [];
    for (var k = 0; k < eats.length; k++) {
      var key = eats[k];
      if (cr[key] > 0) {
        ps.push(consumeRateText(key, cr[key]));
        summary.push(consumeResourceName(key) + ' ' + cr[key].toFixed(2));
      } else {
        ps.push(consumeIdleText(key));
        summary.push(consumeIdleText(key));
      }
    }
    /* 缺料状态（2026-10-28，用户：「热泉炉那种需要原料制造的建筑，缺料要显示」）。
     * 【为什么必须放在最前面】上面那几个数永远是**额定**值（「这几座开满要烧多少」），
     *   缺料时它们一个都不变 ⇒ 玩家读到的是「炉子在烧」，实际一点铁都没产。
     *   把「缺暖石 · 停产」摆在数字左侧，是先给结论再给账。
     *   判据一律来自 economy.runStatus（单一判据：比例与「缺哪一样」都在引擎侧算好了），
     *   ⚠️ 这里**不许**再自己比较库存 —— 否则就是「面板撒谎」的第二个式子。 */
    var lackTxt = '', lackTip = '';
    var st = (SB.economy && SB.economy.runStatus) ? SB.economy.runStatus(sp, id) : null;
    if (st) {
      var lackName = consumeResourceName(st.lack), loadPct = Math.round(st.ratio * 100);
      if (st.ratio <= 0.001) {
        lackTxt = '<b class="lack-tag is-stop">' + tr('building.run_status.stopped.badge', { resourceName: lackName }, '缺' + lackName + ' · 停产') + '</b>';
        lackTip = tr('building.run_status.stopped.tooltip', { resourceName: lackName }, '当前状态：缺' + lackName + '，这几座已停止运转（产出为 0）。');
      } else {
        lackTxt = '<b class="lack-tag is-short">' + tr('building.run_status.reduced.badge', {
          resourceName: lackName, loadPct: loadPct
        }, '缺' + lackName + ' · 开工 ' + loadPct + '%') + '</b>';
        lackTip = tr('building.run_status.reduced.tooltip', {
          resourceName: lackName, loadPct: loadPct
        }, '当前状态：缺' + lackName + '，只能按 ' + loadPct + '% 的负荷运转（产出同比例下降）。');
      }
    }
    var fullLoadTip = tr('building.consume.full_load.tooltip', {
      consumptionSummary: joinInfoList(summary)
    }, '满负荷运转时：这几座每秒消耗 ' + joinInfoList(summary) + '（与结算同式，缺料时会按比例降产）');
    return '<span class="fdraw" title="' + lackTip + (lackTip && englishLocale() ? ' ' : '') + fullLoadTip + '">' +
      lackTxt + (lackTxt ? ' ' : '') + ps.join(' · ') + '</span>';
  }
  SB.ui.drawTag = drawTag;
  /* 2026-10-21：建筑行描述也提成共享出口（巢穴页 / 星图 / 卡面 default 三处同源），
   * 免得「条件句描述」在某一处被修好、另一处还写着「核聚变后×2」。 */
  SB.ui.buildingDescText = buildingDescText;

  function buildingConsumeText(s, b, lv) {
    /* ⚠️ 2026-10-17 改口径：三个数一律走 economy.consumeRates（与结算同式的**额定每秒**），
     *   不再在这里各写「每份扣 1 / 随等级」这类模糊话。理由：巢穴页「开几座」控件行
     *   也读同一个函数 ⇒ 卡面与面板不会再各说一套（面板撒谎家族）。 */
    var order = BUILDING_CONSUME[b.id];
    if (!order) return null;
    var cr = (SB.economy && SB.economy.consumeRates) ? SB.economy.consumeRates(s, b.id) : null;
    if (!cr) return null;
    var parts = [];
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      parts.push(cr[k] > 0 ? consumeRateText(k, cr[k]) : consumeIdleText(k));
    }
    /* 缺料实况（2026-10-28）：卡面此前只写「缺料按比例降产」这种**条件句**，玩家点开卡
     *   仍然不知道现在到底停没停。这里把 runStatus 的**当前**结论直接续在后面，
     *   与行内角标同源（同一个函数、同一个比例），不会出现「行内说停产、卡面说正常」。
     *   ⚠️ 正常时一个字都不加 —— 条件句已经解释过规则了，不缺料就别占版面。 */
    var st = (SB.economy && SB.economy.runStatus) ? SB.economy.runStatus(s, b.id) : null;
    var stateTxt = '';
    if (st) {
      var lackName = consumeResourceName(st.lack), loadPct = Math.round(st.ratio * 100);
      stateTxt = st.ratio <= 0.001
        ? tr('building.consume.shortage.stopped', { resourceName: lackName }, '。当前状态：缺' + lackName + '，已停产（没有产出）')
        : tr('building.consume.shortage.reduced', { resourceName: lackName, loadPct: loadPct }, '。当前状态：缺' + lackName + '，只能按 ' + loadPct + '% 负荷运转');
    }
    return parts.join(englishLocale() ? '; ' : '；') + tr('building.consume.full_load.note', null,
      '（满负荷运转：按当前开着的座数折算，缺料按比例降产）') + stateTxt;
  }

  // 展示文案由 render-content.js 提供，集中维护且不进入存档。
  var BUILDING_FLAVOR = SB.ui.renderContent.BUILDING_FLAVOR;
  var TECH_FLAVOR = SB.ui.renderContent.TECH_FLAVOR;

  function showBuildingInfo(id) {
    var s = res(), b = SB.habitat && SB.habitat.buildingById ? SB.habitat.buildingById(id) : null;
    if (!s || !b) return;
    var name = localizedBuildingName(b.id, b.name), desc = b.desc || '';
    for (var i = 0; SB.UPGRADES && i < SB.UPGRADES.length; i++) {
      var u = SB.UPGRADES[i];
      if (u.upgradesBuilding === b.id && s.upgrades && s.upgrades[u.id]) {
        name = localizedUpgradeName(u.id, u.name);
        desc = u.buildingDesc || u.desc || desc;
      }
    }
    var lv = (s.lvl && s.lvl[id]) || 0;
    var blocked = !SB.habitat.needMet(s, b), canalCap = id === 'canal' &&
      (s.lvl.canal || 0) >= (s.lvl.lighthouse || 0);
    var cost = SB.economy.costOf(s, id), state = blocked || canalCap
      ? { cls: 'locked', text: tr('building.info.status.prerequisites_not_met', null, '前置条件未满足') }
      : { cls: lv ? 'done' : 'ready', text: lv
        ? tr('building.info.status.built', { level: lv }, '已建造 · 等级 ' + lv)
        : tr('ui.status.ready_to_build', null, '可建造') };
    var housePlan = (s.perk && s.perk.housePlan) || 0;
    var moduleHousing = (s.perk && s.perk.starModuleHousing) || 0;
    var housePerLevel = id === 'nest' ? SB.BLD.house
      : id === 'coralhouse' ? SB.BLD.house2
        : id === 'tenement' ? SB.BLD.tenementPop : 0;
    var effectText;
    if (housePerLevel) {
      effectText = tr('building.effect.population_cap', {
        perLevelCap: housePerLevel, currentCap: housePerLevel * lv
      }, '人口上限 +' + housePerLevel + '/级（当前 +' + (housePerLevel * lv) + '）');
      if (housePlan) effectText += tr('building.effect.population_cap.house_plan', {
        perLevelBonus: housePlan, currentBonus: housePlan * lv
      }, ' · 生息建筑规划额外 +' + housePlan + '/级（当前 +' + (housePlan * lv) + '）');
      if (id === 'tenement' && moduleHousing) effectText += tr('building.effect.population_cap.modular_housing', {
        perLevelBonus: moduleHousing, currentBonus: moduleHousing * lv
      }, ' · 模块住房额外 +' + moduleHousing + '/级（当前 +' + (moduleHousing * lv) + '）');
      if (id === 'nest') effectText += tr('building.effect.population_cap.full', null, '。住满后不再生育。');
      if (id === 'tenement') effectText += tr('building.effect.tenement.luxury_cost', {
        perLevelPct: ((SB.BLD.tenementLuxAdd || 0) * 100).toFixed(0),
        currentPct: ((SB.BLD.tenementLuxAdd || 0) * lv * 100).toFixed(0)
      }, '；每级额外 +' + ((SB.BLD.tenementLuxAdd || 0) * 100).toFixed(0) + '% 居民奢侈品消耗（当前 +' + ((SB.BLD.tenementLuxAdd || 0) * lv * 100).toFixed(0) + '%）。');
    } else {
      effectText = buildingEffectText(s, b, lv);
    }
    var requirement = b.need ? SB.habitat.buildingById(b.need) : null;
    var reqText = requirement
      ? tr('building.info.requirement', {
        requiredBuilding: localizedBuildingName(requirement.id, requirement.name),
        requirementStatus: (s.lvl && s.lvl[b.need])
          ? tr('ui.status.met', null, '已满足') : tr('ui.status.not_met', null, '未满足')
      }, '需先建成「' + requirement.name + '」' + ((s.lvl && s.lvl[b.need]) ? ' · 已满足' : ' · 未满足'))
      : tr('building.info.requirement.none', null, '无额外建筑前置');
    if (canalCap) reqText = tr('building.info.requirement.canal_level_limit', null, '潮道等级不能超过灯塔等级；先升级灯塔。');
    var consumeText = buildingConsumeText(s, b, lv);
    var consumeSection = consumeText
      ? '<section class="tree-detail-section"><h4>' + tr('building.info.heading.operating_costs', null, '运行消耗') + '</h4><p>' + linkInfoNames(consumeText) + '</p></section>'
      : '';
    var maxed = b.maxLvl && lv >= b.maxLvl;
    /* 轻车熟路首建免费（2026-10-28）：costOwnedTxt 对 0 值全部跳过 ⇒ 免费态这一节会是空白，
     *   玩家看不出是「不要钱」还是「渲染坏了」。这里换成一句能解释因果的话。
     *   ⚠️ 判据与 costOf / build 同一个函数（SB.habitat.freeFirstBuild），不另写一份。 */
    var freeBuild = !maxed && lv === 0 && !blocked && !canalCap &&
      SB.habitat.freeFirstBuild && SB.habitat.freeFirstBuild(s, id);
    var nextLevelSection = maxed
      ? '<section class="tree-detail-section"><h4>' + tr('building.info.heading.level_cap', null, '等级上限') + '</h4><p>' +
        tr('building.info.level_cap.reached', { level: lv, maxLevel: b.maxLvl }, '已达最高等级（' + lv + '/' + b.maxLvl + '）') + '</p></section>'
      : '<section class="tree-detail-section"><h4>' + tr('building.info.heading.next_build_upgrade', null, '下一次建造 / 升级') + '</h4><p>' +
        (freeBuild ? tr('building.info.free_first_build', {
          buildingName: localizedBuildingName(id, b.name),
          populationRequirementNote: (typeof cost.pop === 'number' && cost.pop > 0)
            ? tr('building.info.free_first_build.population_note', { population: cost.pop }, '（人口要求照常：仍需 ' + cost.pop + ' 人）。')
            : (englishLocale() ? '.' : '。')
        }, '材料全免 —— 你已达成「' + b.name + '：轻车熟路」，每个轮回首次建造这座建筑不花材料。')
          : SB.economy.buildCostTxt(s, id, cost)) + '</p></section>';
    var buildingFlavor = tr('ui.content.building_flavor.' + b.id) || BUILDING_FLAVOR[b.id] || '';
    var voidBuilding = b.id === 'void_altar';
    if (voidBuilding && buildingFlavor && SB.ui.render && typeof SB.ui.render.voidCorrupt === 'function') {
      buildingFlavor = SB.ui.render.voidCorrupt(buildingFlavor, 137, 1);
    }
    var body = '<div class="tree-cost"><span>' + tr('ui.section.current_level', null, '当前等级') + '</span><b>' + lv + '</b></div>' +
      '<section class="tree-detail-section"><h4>' + tr('ui.section.effects', null, '效果') + '</h4><p>' + linkInfoNames(effectText) + '</p></section>' +
      consumeSection +
      nextLevelSection +
      '<section class="tree-detail-section"><h4>' + tr('building.info.heading.building_requirements', null, '建造条件') + '</h4><p>' + reqText + '</p></section>' +
      (buildingFlavor ? '<p class="b-flavor' + (voidBuilding ? ' void-flavor' : '') + '">' + buildingFlavor + '</p>' : '');
    var buildingMark = b.icon
      ? '<img class="tree-detail-icon" src="' + b.icon + '" alt="" aria-hidden="true">'
      : '⌂';
    openInfoCard(name, buildingMark, state, body, '', b.icon ? 'has-image' : '');
  }

  var WONDER_ART = SB.ui.renderContent.WONDER_ART;
  var WONDER_FLAVOR = SB.ui.renderContent.WONDER_FLAVOR;
  function wonderArt(w, s) {
    var src = WONDER_ART[w.id];
    if (src) return '<div class="wonder-art has-image"><img src="' + src + '" alt="' + localizedWonderName(s, w.id, SB.wonder.displayName(s, w.id)) + '"></div>';
    return '<div class="wonder-art placeholder"><span>✦</span></div>';
  }
  function showWonderInfo(id) {
    var s = res(), w = SB.wonder && SB.wonder.byId(id);
    if (!s || !w) return;
    var wonderName = localizedWonderName(s, id, SB.wonder.displayName(s, id));
    var wonderDesc = localizedWonderDescription(s, id, SB.wonder.displayDesc(s, id));
    var done = !!(s.wonders && s.wonders[id]);
    var why = done ? null : SB.workshop.wonderBlocked(s, id);
    var whyText = localizedWonderRequirement(s, id, w, why);
    var requirementBlocked = wonderHasRequirementBlock(s, w);
    var cost = SB.wonder.discountedCost(s, id);
    var state = done ? { cls: 'done', text: tr('wonder.info.status.built', null, '已建成 · 永久效果') }
      : why ? { cls: 'locked', text: requirementBlocked
        ? tr('ui.status.conditions_not_met', null, '条件未满足')
        : tr('wonder.status.materials_missing', null, '材料不足') }
        : { cls: 'ready', text: tr('wonder.status.ready_to_build', null, '可建造') };
    var reqs = [], i, t, c;
    if (w.need) {
      t = SB.tech.byId(w.need);
      reqs.push({ met: !!(s.techs && s.techs[w.need]), name: localizedTreeNodeName('tech', w.need, t ? t.name : w.need),
        suffix: tr('wonder.requirement.technology_label', null, '（科技）') });
    }
    if (w.needCivic) {
      c = null;
      for (i = 0; SB.CIVICS && i < SB.CIVICS.length; i++) if (SB.CIVICS[i].id === w.needCivic) c = SB.CIVICS[i];
      reqs.push({ met: !!(s.civics && s.civics[w.needCivic]), name: localizedTreeNodeName('civic', w.needCivic, c ? c.name : w.needCivic),
        suffix: tr('wonder.requirement.civic_label', null, '（市政）') });
    }
    var reqHtml = reqs.length
      ? '<div class="tree-reqs">' + reqs.map(function (x) { return '<span class="tree-req' + (x.met ? ' met' : '') + '">' + (x.met ? '✓ ' : '· ') + x.name + x.suffix + '</span>'; }).join('') + '</div>'
      : '<p>' + tr('wonder.info.unlock_requirements.none', null, '无额外解锁条件') + '</p>';
    var flavorFallback = WONDER_FLAVOR[id] || tr('wonder.info.flavor.fallback', null, '这座奇观正在等待一段属于它自己的历史。');
    var flavor = localizedStaticText('ui.content.wonder_flavor.' + id, flavorFallback);
    var body = wonderArt(w, s) +
      '<div class="tree-cost"><span>' + tr('wonder.info.heading.construction_cost', null, '建造成本') + '</span><b>' + SB.economy.costTxt(cost) + '</b></div>' +
      /* 建筑等级成分（2026-11-02 · costBuild）：单独一行。
       * ⚠️ 不能并进上面那行的 costTxt —— 它只认 RESS 键，把建筑 id 往里塞
       *   会打出一串看不懂的内部名。 */
      (function () {
        var bt = (SB.wonder && SB.wonder.buildCostText) ? localizedWonderBuildCost(s, id) : '';
        return bt ? '<div class="tree-cost"><span>' + tr('wonder.info.heading.consumed_buildings', null, '消耗建筑') + '</span><b>' + bt + '</b></div>' : '';
      })() +
      '<section class="tree-detail-section"><h4>' + tr('ui.section.effects', null, '效果') + '</h4><p>' + linkInfoNames(wonderDesc) + '</p>' +
      (done ? SB.ui.renderCommon.happyBonusNote(s, 'wonder', w.id) : '') + '</section>' +
      '<section class="tree-detail-section"><h4>' + tr('wonder.info.heading.unlock_requirements', null, '解锁条件') + '</h4>' + reqHtml + '</section>' +
      (why && !requirementBlocked ? '<section class="tree-detail-section"><h4>' + tr('wonder.info.heading.resource_status', null, '资源情况') + '</h4><p>' + whyText + '</p></section>' : '') +
      '<section class="tree-detail-section wonder-copy"><h4>' + tr('wonder.info.heading.lore', null, '奇观文案') + '</h4><p>' + flavor + '</p></section>';
    var action = done ? '' : '<button class="btn buy" type="button" data-wonder="' + id + '"' +
      (why ? ' disabled title="' + whyText + '"' : '') + '>' + tr('wonder.button.build', {
        costSummary: SB.economy.costOwnedTxt(s, cost)
      }, '建成 ' + SB.economy.costOwnedTxt(s, cost)) + '</button>';
    openInfoCard(wonderName, '✦', state, body, action);
  }

  function showPolicyInfo(id) {
    var s = res(), p = SB.civic && SB.civic.policyById(id);
    if (!s || !p) return;
    /* ⚠️ 2026-11-09：「在 s.cards 里」只是物理槽位，不等于正在生效；
     *   retiredBy 字段只说明「将来会被取代」，只有后继市政**已完成**才是真退役。
     *   此前无条件用 p.retiredBy 标「已退役」，玩家刚看到一张未解锁的旧卡就被判了死刑。 */
    var owned = SB.civic.cardOwned(s, id);
    var effective = SB.civic.cardEffective(s, id);
    var retired = SB.civic.cardRetired(s, p);
    var state = retired ? { cls: 'locked', text: tr('policy.info.status.retired', null, '已退役') }
      : effective ? { cls: 'done', text: tr('policy.info.status.slotted_active', null, '已装填 · 正在生效') }
        : owned ? { cls: 'ready', text: tr('policy.info.status.unlocked_unslotted', null, '已解锁 · 尚未装填') }
          : { cls: 'locked', text: tr('ui.status.not_unlocked', null, '尚未解锁') };
    var slotTypeKeys = { grow: 'growth', prod: 'production', sci: 'research', relig: 'religion' };
    var slot = p.type
      ? tr('policy.slot.' + (slotTypeKeys[p.type] || p.type), null, SB.civic.slotTypeName(p.type))
      : tr('policy.slot.universal', null, '万能槽');
    var research = SB.ui && SB.ui.renderParts && SB.ui.renderParts.research;
    var policyName = localizedPolicyName(p);
    var policyDesc = research && typeof research.policyDesc === 'function'
      ? research.policyDesc(p, s)
      : (localizedPolicyKey(p.name, 'desc')
        ? localizedStaticText(localizedPolicyKey(p.name, 'desc'), p.desc || '') : (p.desc || ''));
    var body = '<section class="tree-detail-section"><h4>' + tr('ui.section.effects', null, '效果') + '</h4><p>' + linkInfoNames(policyDesc) + '</p></section>' +
      '<section class="tree-detail-section"><h4>' + tr('policy.info.heading.compatible_slot', null, '适配槽位') + '</h4><p>' + slot + '</p></section>' +
      '<section class="tree-detail-section"><h4>' + tr('policy.info.heading.how_it_works', null, '生效方式') + '</h4><p>' +
      (retired ? tr('policy.info.retired_cannot_slot', null, '此卡已退役，不能再装填。')
        : tr('policy.info.unlock_and_slot_note', null, '研究解锁后，还需装填到适配槽位才会生效。')) + '</p></section>';
    openInfoCard(policyName, '▤', state, body, '');
  }

  function showWorkshopInfo(type, id) {
    var s = res(), W = SB.workshop, item = null, list = [], i;
    if (!s || !W) return;
    if (type === 'tool') list = SB.TOOLS || [];
    else if (type === 'upgrade') list = W.upgrades();
    else if (type === 'craft') list = W.crafts();
    for (i = 0; i < list.length; i++) if (list[i].id === id) { item = list[i]; break; }
    if (!item) return;
    var owned = type === 'tool' ? !!(s.tools && s.tools[id])
      : type === 'upgrade' ? !!(s.upgrades && s.upgrades[id]) : false;
    var why = type === 'tool' ? (owned ? null : W.blocked(s, id))
      : type === 'upgrade' ? (owned ? null : W.upgradeBlocked(s, id)) : W.craftBlocked(s, id);
    var whyText = localizedWorkshopRequirement(item, s, type, why);
    var requirementBlocked = workshopHasRequirementBlock(item, s, type);
    var state = owned ? { cls: 'done', text: type === 'tool'
      ? tr('ui.workshop.tool.status.owned', null, '已拥有')
      : tr('ui.workshop.upgrade.status.installed', null, '已装上') }
      : why ? { cls: 'locked', text: requirementBlocked
        ? tr('ui.status.conditions_not_met', null, '条件未满足')
        : tr('ui.status.materials_missing', null, '材料不足') }
        : { cls: 'ready', text: type === 'craft'
          ? tr('workshop.info.status.ready_to_craft', null, '可制作')
          : tr('workshop.info.status.ready_to_buy', null, '可购买') };
    var cost = type === 'craft' ? item.in
      : type === 'upgrade' ? W.upgradeCost(s, id) : item.cost;
    var desc = localizedWorkshopItemDescription(type, item);
    if (type === 'craft') {
      var mul = W.craftMul(s, item);
      if (englishLocale() && !/[\u3400-\u9fff]/.test(desc)) {
        var outputName = SB.i18n && SB.i18n.resourceName
          ? SB.i18n.resourceName(item.res, SB.RESS[item.res] ? SB.RESS[item.res].name : item.res)
          : (SB.RESS[item.res] ? SB.RESS[item.res].name : item.res);
        desc = tr('workshop.craft.effect_and_yield', {
          itemDescription: desc,
          inputCosts: SB.economy.costTxt(item.in),
          outputAmount: SB.economy.fmtAmt(item.out * mul),
          outputResource: outputName,
          craftEfficiency: ((mul - 1) * 100).toFixed(0)
        }, desc);
      } else {
        desc += ' 每次消耗 ' + SB.economy.costTxt(item.in) + '，产出 ' +
          SB.economy.fmtAmt(item.out * mul) + ' ' + (SB.RESS[item.res] ? SB.RESS[item.res].name : item.res) +
          '（含当前工艺效率 +' + ((mul - 1) * 100).toFixed(0) + '%）。';
      }
    }
    var label = type === 'tool' ? tr('ui.action.buy', null, '买下')
      : type === 'upgrade' ? tr('ui.action.install', null, '装上')
        : tr('workshop.craft.button', { amount: 1 }, '制作 +1');
    var action = '';
    if (type === 'tool' && !owned) action = '<button class="btn buy" data-tool="' + id + '"' + (why ? ' disabled title="' + whyText + '"' : '') + '>' + label + '　' + SB.economy.costOwnedTxt(s, cost) + '</button>';
    if (type === 'upgrade' && !owned) action = '<button class="btn buy" data-upgrade="' + id + '"' + (why ? ' disabled title="' + whyText + '"' : '') + '>' + label + '　' + SB.economy.costOwnedTxt(s, cost) + '</button>';
    if (type === 'craft') action = '<button class="btn buy" data-craft="' + id + '" data-craft-amt="1"' + (why ? ' disabled title="' + whyText + '"' : '') + '>' + label + '</button>';
    var localizedItemName = localizedWorkshopItemName(type, item.id, item.name);
    var body = '<div class="tree-cost"><span>' + tr(type === 'craft' ? 'workshop.info.heading.inputs_per_craft' : 'workshop.info.heading.required_materials', null, type === 'craft' ? '每次投入' : '所需材料') + '</span><b>' + SB.economy.costTxt(cost) + '</b></div>' +
      '<section class="tree-detail-section"><h4>' + tr('workshop.info.heading.effect_output', null, '效果 / 产出') + '</h4><p>' + linkInfoNames(desc) + '</p></section>' +
      (why ? '<section class="tree-detail-section"><h4>' + tr('workshop.info.heading.current_requirements', null, '当前条件') + '</h4><p>' + whyText + '</p></section>' : '');
    openInfoCard(localizedItemName, type === 'craft' ? '⚒' : '⌘', state, body, action);
  }

  SB.ui = SB.ui || {};
  SB.ui.renderParts = SB.ui.renderParts || {};
  SB.ui.renderParts.info = {
    linkInfoNames: linkInfoNames,
    showTreeDetail: showTreeDetail,
    showBuildingInfo: showBuildingInfo,
    showWonderInfo: showWonderInfo,
    showPolicyInfo: showPolicyInfo,
    showWorkshopInfo: showWorkshopInfo,
    localizedWonderName: localizedWonderName,
    localizedWonderDescription: localizedWonderDescription,
    localizedWonderRequirement: localizedWonderRequirement,
    localizedWonderBuildCost: localizedWonderBuildCost,
    wonderHasRequirementBlock: wonderHasRequirementBlock,
    localizedWorkshopItemName: localizedWorkshopItemName,
    localizedWorkshopItemDescription: localizedWorkshopItemDescription,
    localizedWorkshopRequirement: localizedWorkshopRequirement,
    workshopHasRequirementBlock: workshopHasRequirementBlock,
    englishTemplateParams: englishTemplateParams
  };
})(typeof window !== 'undefined' ? window : globalThis);
