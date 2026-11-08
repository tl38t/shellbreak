/* 天壳 / SHELLBREAK — 轮回商店页渲染。仅依赖运行时 SB API。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  var TREE_ICON_BY_KEY = {
    remnant: 'assets/talent-icons/remnant.png?v=1',
    shelter: 'assets/talent-icons/shelter.png?v=1',
    forge: 'assets/talent-icons/forge.png?v=1',
    mineral: 'assets/talent-icons/mineral.png?v=1',
    food: 'assets/talent-icons/food.png?v=1',
    steel: 'assets/talent-icons/steel.png?v=1',
    politics: 'assets/talent-icons/politics.png?v=1',
    vision: 'assets/talent-icons/vision.png?v=1'
  };
  var RECIPE_ICON_BY_ID = {
    craft_stonebeam: 'assets/resource-icons/stoneBeam.png?v=2',
    craft_hardcoral: 'assets/resource-icons/hardCoral.png?v=2',
    craft_scaffold: 'assets/resource-icons/scaffold.png?v=2',
    craft_ironbracket: 'assets/resource-icons/ironBracket.png?v=2',
    craft_steelpart: 'assets/resource-icons/steelPart.png?v=2',
    craft_artwork: 'assets/resource-icons/artwork.png?v=2',
    craft_tidal_record: 'assets/resource-icons/tidalRecord.png?v=2',
    craft_drill: 'assets/resource-icons/resonantDrill.png?v=2'
  };
  var PERK_NAME_KEYS = null;
  var META_TREES = [
    { key: 'remnant', localeKey: 'remnants', icon: '✦', iconSrc: TREE_ICON_BY_KEY.remnant, accent: '#9fddb9', fallbackTitle: '先人孑遗', fallbackSubtitle: '开局馈赠与自动点击' },
    { key: 'shelter', localeKey: 'shelter', icon: '⌂', iconSrc: TREE_ICON_BY_KEY.shelter, accent: '#e2bf81', fallbackTitle: '安得广厦', fallbackSubtitle: '人口上限与资源仓储' },
    { key: 'forge', localeKey: 'forge', icon: '⚒', iconSrc: TREE_ICON_BY_KEY.forge, accent: '#f0a868', fallbackTitle: '铁血工造', fallbackSubtitle: '工坊制作与自动槽' },
    { key: 'mineral', localeKey: 'mineral', icon: '⛏', iconSrc: TREE_ICON_BY_KEY.mineral, accent: '#c9b08a', fallbackTitle: '金石为开', fallbackSubtitle: '矿工·采石·炉火效率' },
    { key: 'food', localeKey: 'food', icon: '✿', iconSrc: TREE_ICON_BY_KEY.food, accent: '#6ed4c1', fallbackTitle: '唯食与犁', fallbackSubtitle: '藻食·珊瑚·御寒' },
    { key: 'steel', localeKey: 'steel', icon: '🔩', iconSrc: TREE_ICON_BY_KEY.steel, accent: '#b8c0cc', fallbackTitle: '百炼成钢', fallbackSubtitle: '精铁·钢·工艺零件' },
    { key: 'politics', localeKey: 'political_economy', icon: '⚖', iconSrc: TREE_ICON_BY_KEY.politics, accent: '#e5a9d6', fallbackTitle: '政经往来', fallbackSubtitle: '商·书·奢侈·幸福' },
    { key: 'vision', localeKey: 'visionaries', icon: '🔭', iconSrc: TREE_ICON_BY_KEY.vision, accent: '#9eacff', fallbackTitle: '远见之人', fallbackSubtitle: '学者·钻机·薄壳·破壳·倍率' }
  ];

  function formatFallback(value, params) {
    return String(value == null ? '' : value).replace(/\{([A-Za-z0-9_]+)\}/g, function (match, name) {
      return params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
    });
  }
  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    if (value && !/\{[A-Za-z0-9_]+\}/.test(value)) return value;
    return formatFallback(fallback, params);
  }
  function englishLocale() {
    return !!(SB.i18n && SB.i18n.getLocale && SB.i18n.getLocale() === 'en-US');
  }
  function snakeCase(value) {
    return String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  }
  function perkNameKey(name) {
    if (!PERK_NAME_KEYS) {
      PERK_NAME_KEYS = Object.create(null);
      var zh = root.ShellbreakLocales && root.ShellbreakLocales['zh-CN'] || {};
      for (var key in zh) {
        if (Object.prototype.hasOwnProperty.call(zh, key) && /^prestige\.(?:perk|tide_tree)\..+\.name$/.test(key)) {
          PERK_NAME_KEYS[zh[key]] = key;
        }
      }
    }
    return PERK_NAME_KEYS[name] || '';
  }
  function perkLocaleKey(perk, field) {
    var nameKey = perkNameKey(perk && perk.name) || ('prestige.tide_tree.' + snakeCase(perk && perk.id) + '.name');
    if (field === 'name') return nameKey;
    var en = root.ShellbreakLocales && root.ShellbreakLocales['en-US'] || {};
    var direct = nameKey.replace(/\.name$/, '.description');
    if (typeof en[direct] === 'string') return direct;
    return 'prestige.tide_tree.' + snakeCase(perk && perk.id) + '.description';
  }
  function localizedPerkName(perk) {
    if (!perk || !englishLocale()) return perk ? perk.name : '';
    return tr(perkLocaleKey(perk, 'name'), null, perk.name);
  }
  function localizedPerkDescription(perk, state, meta) {
    if (!perk || !englishLocale()) return perk ? perk.desc : '';
    var key = perkLocaleKey(perk, 'description'), special = {};
    if (perk.id === 'autoClick') special.clickRate = Math.min(perk.n || 1, Math.max(1, (state && state.lv) || 0));
    if (perk.dyn === 'loop5') {
      special.bonusPerPrestigePercent = 5;
      special.prestigeCount = Number(meta && meta.cycle) || 0;
    }
    var info = SB.ui && SB.ui.renderParts && SB.ui.renderParts.info;
    var params = info && info.englishTemplateParams ? info.englishTemplateParams(key, perk.desc, special) : null;
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value && !/\{[A-Za-z0-9_]+\}/.test(value) ? value : perk.desc;
  }
  function treeProgress(treeKey, progress) {
    var tree = null;
    for (var i = 0; i < META_TREES.length; i++) if (META_TREES[i].key === treeKey) { tree = META_TREES[i]; break; }
    var name = tree ? tr('ui.prestige.tree.' + tree.localeKey + '.name', null, tree.fallbackTitle) : treeKey;
    return tr('ui.prestige.tree.jump_link.aria_label', {
      treeTitle: name, ownedCount: progress.owned, totalCount: progress.total
    }, '跳转到' + name + '，已点亮 ' + progress.owned + ' / ' + progress.total + ' 个节点');
  }

  /* 件数展示（2026-10-29）：旧日艺术品 / 潮纹碑石的件数是**跨周目无上限累加**的，
   * 此前裸拼 `(m.oldArtworkEarnedTotal || 0) + ' 件'`，到六位数会把卡片撑破。
   * 小于 1 万按整数原样（避免 fmtAmt 产出「12.0 件」这种怪相），1 万起走渲染层
   * 同一个 fmtAmt（12,345 ⇒ 12.3k / 1,000,000 ⇒ 1.00M），宽度有上界。
   * ⚠️ 不在这里新造一套大数格式：面板「旧日信仰」那张卡一直用 fmtAmt，同页两套口径会打架。 */
  function fmtCount(n) {
    n = Math.floor(+n || 0);
    return n >= 1e4 ? SB.economy.fmtAmt(n) : String(n);
  }

  function perkIconSrc(perk) {
    if (perk.give) {
      var resource = Object.keys(perk.give)[0];
      if (resource) return 'assets/resource-icons/' + resource + '.png?v=2';
    }
    if (perk.recipe && RECIPE_ICON_BY_ID[perk.recipe]) return RECIPE_ICON_BY_ID[perk.recipe];

    var id = perk.id || '';
    if (id === 'autoClick') return 'assets/tech-icons/era-1/era1-cultivation.png';
    if (id === 'autoEvent') return 'assets/tech-icons/era-1/era1-tide-divination.png';
    if (/^startPop|^housePlan/.test(id)) return 'assets/building-icons/era-1/era1-nest.png';
    if (/^matStore/.test(id)) return 'assets/building-icons/era-2/era2-ballast.png';
    if (/^wonderBlueprint/.test(id)) return 'assets/tech-icons/era-3/era3-castle.png';
    if (/^craftQuota|^autoCraft|^craftLoop|^slotCraft/.test(id)) return 'assets/building-icons/era-1/era1-workshop.png';
    if (/^minerPact/.test(id)) return 'assets/tech-icons/era-1/era1-mining.png';
    if (/^quarryPact/.test(id)) return 'assets/tech-icons/era-1/era1-stone-quarrying.png';
    if (/^furnace(Eff|Boost|HydroLoop)/.test(id)) return 'assets/building-icons/era-2/era2-furnace.png';
    if (/^hydroshop(Eff|Boost)/.test(id)) return 'assets/building-icons/era-3/era3-hydroshop.png';
    if (id === 'stoneBeam') return 'assets/resource-icons/stoneBeam.png?v=2';
    if (/^algaeCrop/.test(id)) return 'assets/resource-icons/kelp.png?v=2';
    if (/^coralPact/.test(id)) return 'assets/resource-icons/coral.png?v=2';
    if (/^workSpeed/.test(id)) return 'assets/tech-icons/era-1/era1-herding.png';
    if (id === 'coldPenalty') return 'assets/resource-icons/warmstone.png?v=2';
    if (/^luxuryPact|^luxDrain/.test(id)) return 'assets/resource-icons/luxury.png?v=2';
    if (/^scribePact/.test(id)) return 'assets/tech-icons/era-1/era1-writing.png';
    if (/^artwork/.test(id)) return 'assets/resource-icons/artwork.png?v=2';
    if (id === 'happiness') return 'assets/resource-icons/faith.png?v=2';
    if (id === 'autoCivic') return 'assets/resource-icons/culture.png?v=2';
    if (id === 'slotEcon') return 'assets/building-icons/era-4/era4-bank.png';
    if (/^scholarPact/.test(id)) return 'assets/building-icons/era-1/era1-library.png';
    if (/^shellSurvey/.test(id)) return 'assets/tech-icons/era-5/era5-sky-drill.png';
    if (/^tidalRecord/.test(id)) return 'assets/resource-icons/tidalRecord.png?v=2';
    if (id === 'thinShell') return 'assets/resource-icons/thinafilm.png?v=2';
    if (id === 'autoStudy' || id === 'slotSci') return 'assets/resource-icons/science.png?v=2';
    if (id === 'vibrodrill') return 'assets/resource-icons/resonantDrill.png?v=2';
    if (id === 'tengenToppa') return 'assets/tech-icons/era-5/era5-sky-drill.png';
    return '';
  }

  function paneMeta() {
    var m = SB.game.meta();
    var lg = SB.prestige.legacy();
    var trees = META_TREES;
    for (var treeIndex = 0; treeIndex < trees.length; treeIndex++) {
      trees[treeIndex].title = tr('ui.prestige.tree.' + trees[treeIndex].localeKey + '.name', null, trees[treeIndex].fallbackTitle);
      trees[treeIndex].subtitle = tr('ui.prestige.tree.' + trees[treeIndex].localeKey + '.subtitle', null, trees[treeIndex].fallbackSubtitle);
    }
    var ownedNodes = 0, totalLevels = 0, totalNodes = SB.TIDE_TREE.length;
    var treeProgressByKey = Object.create(null);
    for (var ti = 0; ti < trees.length; ti++) treeProgressByKey[trees[ti].key] = { owned: 0, total: 0 };
    for (var si = 0; si < SB.TIDE_TREE.length; si++) {
      var perkForProgress = SB.TIDE_TREE[si];
      var ownedState = SB.prestige.perkState(perkForProgress.id);
      var groupProgress = treeProgressByKey[perkForProgress.subtree];
      if (groupProgress) {
        groupProgress.total++;
        if (ownedState.lv > 0) groupProgress.owned++;
      }
      if (ownedState.lv > 0) ownedNodes++;
      totalLevels += ownedState.lv;
    }
    var h = '<section class="meta-overview"><div class="meta-balance"><span>' + tr('ui.prestige.balance.label', null, '轮回点余额') + '</span>' +
      '<strong>' + m.tide.toFixed(2) + '</strong><small>' + tr('ui.prestige.balance.retention_note', null, '跨周目保留 · 用于永久强化') + '</small></div>' +
      '<div class="meta-stats"><div><span>' + tr('ui.prestige.stats.spent', null, '累计消费/兑出') + '</span><b>' + m.spent.toFixed(2) + '</b></div>' +
      /* 2026-11-06：标签从「周目」改为「已轮回」——m.cycle 已收紧为合格轮回次数（重开本周目
       * 不再 +1），继续写「周目」会让玩家以为重开算一世。用「已轮回」而不是「轮回」是与上面
       * 的「轮回点余额」区分开，两个词挨着时「轮回 3」容易被读成「轮回点 3」。 */
      '<div><span>' + tr('ui.prestige.stats.cycles', null, '已轮回') + '</span><b>' + m.cycle + '</b></div><div><span>' + tr('ui.prestige.stats.layers_broken', null, '破层') + '</span><b>' + m.layers + '</b></div></div></section>';
    /* ⚠️ 2026-10-05 用户报「弹窗说会保留的东西，商店里很多都没显示」：
     *    结算弹窗承诺保留的旧日遗产四项，商店页此前一行都没渲染。数字全部走
     *    prestige.legacy() 同一个口（与实际加成同源），不在这里另写公式。 */
    h += '<section class="meta-legacy"><div class="meta-section-title"><b>' + tr('ui.prestige.legacy.section_title', null, '跨周目遗产') + '</b><span>' + tr('ui.prestige.legacy.section_note', null, '每次轮回累积，持续强化新文明') + '</span></div><div class="meta-legacy-grid">' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">✧</span><div><b>' + tr('ui.prestige.legacy.old_faith.name', null, '旧日信仰') + '</b><strong>' + SB.economy.fmtAmt(m.oldFaith || 0) + '</strong></div>' +
      '<small>' + tr('ui.prestige.legacy.old_faith.production_bonus', { bonusPercent: (lg.oldFaithAllProductionBonus * 100).toFixed(1) }, '全产出 +{bonusPercent}%') + '</small><p>' + tr('ui.prestige.legacy.old_faith.note', null, '剩余信仰并入；对数档位累积加成') + '</p></article>' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">◇</span><div><b>' + tr('ui.prestige.legacy.wonders.name', null, '纪念奇观') + '</b><strong>' + tr('ui.prestige.legacy.wonders.count', { wonderCount: lg.relicCount }, '{wonderCount} 座') + '</strong></div>' +
      '<small>' + tr('ui.prestige.legacy.wonders.research_civic_bonus', { bonusPercent: ((lg.relicCultureMul - 1) * 100).toFixed(0) }, '科技与市政 +{bonusPercent}%') + '</small><p>' + tr('ui.prestige.legacy.wonders.note', null, '首次建成的独特奇观收入藏') + '</p></article>' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">▧</span><div><b>' + tr('ui.prestige.legacy.artworks.name', null, '旧日艺术品') + '</b><strong>' + tr('ui.prestige.legacy.artworks.count', { artworkCount: fmtCount(m.oldArtworkEarnedTotal) }, '{artworkCount} 件') + '</strong></div>' +
      '<small>' + tr('ui.prestige.legacy.artworks.civic_points_rate', { ratePerSecond: lg.oldArtworkCultureRate.toFixed(2) }, '市政点 +{ratePerSecond}/秒') + '</small><p>' + tr('ui.prestige.legacy.artworks.note', null, '累积收藏，提供持续市政点') + '</p></article>' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">⌁</span><div><b>' + tr('ui.prestige.legacy.tide_steles.name', null, '旧日潮纹碑石') + '</b><strong>' + tr('ui.prestige.legacy.tide_steles.count', { steleCount: fmtCount(m.oldTideStelesEarnedTotal) }, '{steleCount} 件') + '</strong></div>' +
      '<small>' + tr('ui.prestige.legacy.tide_steles.research_points_rate', { ratePerSecond: lg.oldTideSteleScienceRate.toFixed(2) }, '科技点 +{ratePerSecond}/秒') + '</small><p>' + tr('ui.prestige.legacy.tide_steles.note', null, '累积收藏，提供持续科技点') + '</p></article></div></section>';
    h += '<section class="meta-tree-intro"><div><span class="meta-tree-kicker">' + tr('ui.prestige.tree.kicker', null, 'PERMANENT LEGACY · 轮回天赋') + '</span>' +
      '<h2>' + tr('ui.prestige.tree.title', null, '潮汐之树') + '</h2><p>' + tr('ui.prestige.tree.prerequisite_note', null, '前置连线表示真实解锁条件；没有前置的天赋可独立点亮。') + '</p></div>' +
      '<div class="meta-tree-progress"><span>' + tr('ui.prestige.tree.progress.activated_nodes', null, '已点亮节点') + '</span><b>' + ownedNodes + '<i> / ' + totalNodes + '</i></b>' +
      '<div class="meta-tree-progress-track"><i style="width:' + (totalNodes ? ownedNodes / totalNodes * 100 : 0) + '%"></i></div>' +
      '<small>' + tr('ui.prestige.tree.total_upgrade_levels', { levelCount: totalLevels }, '累计强化 {levelCount} 阶') + '</small></div>' +
      '<nav class="meta-tree-jump-list" aria-label="' + tr('ui.prestige.tree.jump_list.aria_label', null, '各天赋树进度与跳转') + '"><span>' + tr('ui.prestige.tree.jump_list.label', null, '各天赋树 · 点击跳转') + '</span><div class="meta-tree-jump-grid">';
    for (var ji = 0; ji < trees.length; ji++) {
      var jumpTree = trees[ji], jumpProgress = treeProgressByKey[jumpTree.key] || { owned: 0, total: 0 };
      var jumpPercent = jumpProgress.total ? jumpProgress.owned / jumpProgress.total * 100 : 0;
      h += '<a class="meta-tree-jump" href="#meta-tree-' + jumpTree.key + '" data-meta-tree-jump="' + jumpTree.key +
        '" style="--tree-accent:' + jumpTree.accent + '" aria-label="' + treeProgress(jumpTree.key, jumpProgress) + '">' +
        '<b>' + jumpTree.title + '</b><strong>' + jumpProgress.owned + '<i> / ' + jumpProgress.total + '</i></strong>' +
        '<span class="meta-tree-jump-track"><i style="width:' + jumpPercent + '%"></i></span></a>';
    }
    h += '</div></nav></section><div class="meta-tree-grid">';
    var SUBMAP = Object.create(null);
    for (var smi = 0; smi < trees.length; smi++) SUBMAP[trees[smi].key] = trees[smi].title;
    function getPerk(id) {
      for (var ni = 0; ni < SB.TIDE_TREE.length; ni++) if (SB.TIDE_TREE[ni].id === id) return SB.TIDE_TREE[ni];
      return null;
    }
    for (var gi = 0; gi < trees.length; gi++) {
      var group = trees[gi], items = [];
      for (var pi = 0; pi < SB.TIDE_TREE.length; pi++) {
        var perk = SB.TIDE_TREE[pi];
        if (perk.subtree === group.key) {
          items.push(perk);
        }
      }
      var nodes = [];
      for (var ii = 0; ii < items.length; ii++) {
        var p = items[ii], st = SB.prestige.perkState(p.id);
        var prereqIds = SB.prestige.perkPrerequisites ? SB.prestige.perkPrerequisites(p) : (p.nest ? [p.nest] : []);
        var nodeState = st.done ? 'is-done' : st.locked ? 'is-locked' : st.afford ? 'is-ready' : 'is-growing';
        var statusKey = st.done ? 'max_level' : st.locked ? 'waiting_prerequisites' : st.afford ? 'ready' : 'earn_points';
        var status = tr('ui.prestige.talent.status.' + statusKey, null,
          st.done ? '已满级' : st.locked ? '等待前置' : st.afford ? '可以点亮' : '积攒轮回点');
        /* ⚠️ 2026-11-01 用户拍板：自动研究开关从商店挪到科技页 / 市政页（做成拨动开关）。
         *   这里**不留第二份按钮** —— 两处都能改同一个 meta 字段，只会让玩家怀疑
         *   「我到底在哪儿改的」；节点卡改由 desc 说明开关去哪了。 */
        var extraHtml = '';
        /* 轮回联动节点（dyn:'loop5'）：效果 = 系数 × 5% × 轮回次数 × 等级，每局 freshRun 由
         * derivePerksFromMeta 重算（读 m.cycle，无封顶）。徽标直接显示当前轮回次数下的实时生效值，
         * 与结算口径同源（面板===结算），让玩家看到「这节点现在到底加多少」。
         * ⚠️ cycle 自 2026-11-06 起只数合格轮回 ⇒ 徽标数字不能再靠「重开本周目」刷上去。 */
        var dynBadge = '';
        if (p.dyn === 'loop5') {
          var dcyc = m.cycle || 0, deff = 0, dak;
          for (dak in p.apply) deff += p.apply[dak];
          deff = deff * 0.05 * dcyc * st.lv;
          var dynParams = { bonusPercent: (deff * 100).toFixed(1), cycleCount: dcyc, talentLevel: st.lv };
          dynBadge = '<span class="talent-node-dyn" title="' + tr('ui.prestige.talent.prestige_synergy.tooltip', null,
            '轮回联动：当前加成随轮回次数和天赋等级增长；每局开局重算，无上限。') + '">' +
            tr('ui.prestige.talent.prestige_synergy.badge', dynParams,
              '⟳ 轮回联动 · 当前 +{bonusPercent}%（{cycleCount} 周目 × {talentLevel} 级）') + '</span>';
        }
        var localizedName = localizedPerkName(p);
        var localizedDesc = localizedPerkDescription(p, st, m);
        var localizedPrerequisites = prereqIds.map(function (id) {
          var prerequisite = getPerk(id);
          return prerequisite ? localizedPerkName(prerequisite) : id;
        }).join(englishLocale() ? ', ' : '、');
        var localizedCost = st.done ? tr('ui.prestige.talent.status.max_level', null, '已满级') : st.locked ?
          tr('ui.prestige.talent.cost.prerequisites_unmet', null, '前置未达成') :
          tr('ui.prestige.talent.next_cost', { cost: st.next }, '✧ {cost} 点');
        nodes.push({
          id: p.id, name: localizedName, desc: localizedDesc, layer: p.layer, nests: prereqIds, nest: prereqIds[0] || '',
          nestName: localizedPrerequisites,
          rank: st.lv, rankText: st.lv + '/' + (isFinite(st.max) ? st.max : '∞'),
          status: status, cost: localizedCost,
          state: nodeState, disabled: st.done || st.locked || !st.afford,
          glyph: group.icon, iconSrc: perkIconSrc(p), attr: 'data-perk="' + p.id + '"',
          title: localizedName + ' · ' + (SUBMAP[p.subtree] || p.subtree), extraHtml: extraHtml + dynBadge
        });
      }
      h += SB.ui.talentTreeMarkup({
        anchorId: 'meta-tree-' + group.key,
        className: 'meta-talent-tree meta-tree-' + group.key,
        scrollKey: 'meta-' + group.key,
        title: group.title, subtitle: group.subtitle, icon: group.icon, iconSrc: group.iconSrc,
        accent: group.accent, layout: 'layered', nodes: nodes
      });
    }
    h += '</div><div class="note meta-shop-note">' + tr('ui.prestige.tree.footer_note', null,
      '轮回点跨周目保留。购买的强化永久生效；门槛减免能显著缩短后续周目的开荒时间。') + '</div>';
    return h;
  }

  parts.paneMeta = paneMeta;
})(typeof window !== 'undefined' ? window : globalThis);
