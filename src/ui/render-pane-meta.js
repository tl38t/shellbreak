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
    return '';
  }

  function paneMeta() {
    var m = SB.game.meta();
    var lg = SB.prestige.legacy();
    var trees = [
      { key: 'remnant', icon: '✦', iconSrc: TREE_ICON_BY_KEY.remnant, accent: '#9fddb9', title: '先人孑遗', subtitle: '开局馈赠与自动点击' },
      { key: 'shelter', icon: '⌂', iconSrc: TREE_ICON_BY_KEY.shelter, accent: '#e2bf81', title: '安得广厦', subtitle: '人口上限与资源仓储' },
      { key: 'forge', icon: '⚒', iconSrc: TREE_ICON_BY_KEY.forge, accent: '#f0a868', title: '铁血工造', subtitle: '工坊制作与自动槽' },
      { key: 'mineral', icon: '⛏', iconSrc: TREE_ICON_BY_KEY.mineral, accent: '#c9b08a', title: '金石为开', subtitle: '矿工·采石·炉火效率' },
      { key: 'food', icon: '✿', iconSrc: TREE_ICON_BY_KEY.food, accent: '#6ed4c1', title: '唯食与犁', subtitle: '藻食·珊瑚·御寒' },
      { key: 'steel', icon: '🔩', iconSrc: TREE_ICON_BY_KEY.steel, accent: '#b8c0cc', title: '百炼成钢', subtitle: '精铁·钢·工艺零件' },
      { key: 'politics', icon: '⚖', iconSrc: TREE_ICON_BY_KEY.politics, accent: '#e5a9d6', title: '政经往来', subtitle: '商·书·奢侈·幸福' },
      { key: 'vision', icon: '🔭', iconSrc: TREE_ICON_BY_KEY.vision, accent: '#9eacff', title: '远见之人', subtitle: '学者·钻机·薄壳' }
    ];
    var ownedNodes = 0, totalLevels = 0, totalNodes = SB.TIDE_TREE.length;
    var treeProgress = Object.create(null);
    for (var ti = 0; ti < trees.length; ti++) treeProgress[trees[ti].key] = { owned: 0, total: 0 };
    for (var si = 0; si < SB.TIDE_TREE.length; si++) {
      var perkForProgress = SB.TIDE_TREE[si];
      var ownedState = SB.prestige.perkState(perkForProgress.id);
      var groupProgress = treeProgress[perkForProgress.subtree];
      if (groupProgress) {
        groupProgress.total++;
        if (ownedState.lv > 0) groupProgress.owned++;
      }
      if (ownedState.lv > 0) ownedNodes++;
      totalLevels += ownedState.lv;
    }
    var h = '<section class="meta-overview"><div class="meta-balance"><span>轮回点余额</span>' +
      '<strong>' + m.tide.toFixed(2) + '</strong><small>跨周目保留 · 用于永久强化</small></div>' +
      '<div class="meta-stats"><div><span>累计消费/兑出</span><b>' + m.spent.toFixed(2) + '</b></div>' +
      '<div><span>周目</span><b>' + m.cycle + '</b></div><div><span>破层</span><b>' + m.layers + '</b></div></div></section>';
    /* ⚠️ 2026-10-05 用户报「弹窗说会保留的东西，商店里很多都没显示」：
     *    结算弹窗承诺保留的旧日遗产四项，商店页此前一行都没渲染。数字全部走
     *    prestige.legacy() 同一个口（与实际加成同源），不在这里另写公式。 */
    h += '<section class="meta-legacy"><div class="meta-section-title"><b>跨周目遗产</b><span>每次轮回累积，持续强化新文明</span></div><div class="meta-legacy-grid">' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">✧</span><div><b>旧日信仰</b><strong>' + SB.economy.fmtAmt(m.oldFaith || 0) + '</strong></div>' +
      '<small>全产出 +' + (lg.oldFaithAllProductionBonus * 100).toFixed(1) + '%</small><p>剩余信仰并入；对数档位累积加成</p></article>' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">◇</span><div><b>纪念奇观</b><strong>' + lg.relicCount + ' 座</strong></div>' +
      '<small>科技与市政 +' + ((lg.relicCultureMul - 1) * 100).toFixed(0) + '%</small><p>首次建成的独特奇观收入藏</p></article>' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">▧</span><div><b>旧日艺术品</b><strong>' + (m.oldArtworkEarnedTotal || 0) + ' 件</strong></div>' +
      '<small>市政点 +' + lg.oldArtworkCultureRate.toFixed(2) + '/秒</small><p>累积收藏，提供持续市政点</p></article>' +
      '<article class="meta-legacy-card"><span class="meta-legacy-icon">⌁</span><div><b>旧日潮纹碑石</b><strong>' + (m.oldTideStelesEarnedTotal || 0) + ' 件</strong></div>' +
      '<small>科技点 +' + lg.oldTideSteleScienceRate.toFixed(2) + '/秒</small><p>累积收藏，提供持续科技点</p></article></div></section>';
    h += '<section class="meta-tree-intro"><div><span class="meta-tree-kicker">PERMANENT LEGACY · 轮回天赋</span>' +
      '<h2>潮汐之树</h2><p>前置连线表示真实解锁条件；没有前置的天赋可独立点亮。</p></div>' +
      '<div class="meta-tree-progress"><span>已点亮节点</span><b>' + ownedNodes + '<i> / ' + totalNodes + '</i></b>' +
      '<div class="meta-tree-progress-track"><i style="width:' + (totalNodes ? ownedNodes / totalNodes * 100 : 0) + '%"></i></div>' +
      '<small>累计强化 ' + totalLevels + ' 阶</small></div>' +
      '<nav class="meta-tree-jump-list" aria-label="各天赋树进度与跳转"><span>各天赋树 · 点击跳转</span><div class="meta-tree-jump-grid">';
    for (var ji = 0; ji < trees.length; ji++) {
      var jumpTree = trees[ji], jumpProgress = treeProgress[jumpTree.key] || { owned: 0, total: 0 };
      var jumpPercent = jumpProgress.total ? jumpProgress.owned / jumpProgress.total * 100 : 0;
      h += '<a class="meta-tree-jump" href="#meta-tree-' + jumpTree.key + '" data-meta-tree-jump="' + jumpTree.key +
        '" style="--tree-accent:' + jumpTree.accent + '" aria-label="跳转到' + jumpTree.title + '，已点亮 ' + jumpProgress.owned + ' / ' + jumpProgress.total + ' 个节点">' +
        '<b>' + jumpTree.title + '</b><strong>' + jumpProgress.owned + '<i> / ' + jumpProgress.total + '</i></strong>' +
        '<span class="meta-tree-jump-track"><i style="width:' + jumpPercent + '%"></i></span></a>';
    }
    h += '</div></nav></section><div class="meta-tree-grid">';
    var SUBMAP = { remnant: '先人孑遗', shelter: '安得广厦', forge: '铁血工造', mineral: '金石为开',
      food: '唯食与犁', steel: '百炼成钢', politics: '政经往来', vision: '远见之人' };
    function perkName(id) {
      for (var ni = 0; ni < SB.TIDE_TREE.length; ni++) if (SB.TIDE_TREE[ni].id === id) return SB.TIDE_TREE[ni].name;
      return id;
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
        var autoKind = p.id === 'autoStudy' ? 'tech' : p.id === 'autoCivic' ? 'civic' : '';
        var autoOn = !!(autoKind && m.autoResearch && m.autoResearch[autoKind]);
        var nodeState = st.done ? 'is-done' : st.locked ? 'is-locked' : st.afford ? 'is-ready' : 'is-growing';
        var status = st.done ? '已满级' : st.locked ? '等待前置' : st.afford ? '可以点亮' : '积攒轮回点';
        var extraHtml = autoKind && st.lv > 0
          ? '<button type="button" class="btn meta-auto-toggle talent-auto-toggle" data-auto-research="' + autoKind +
            '" aria-pressed="' + autoOn + '" title="自动研究默认关闭；只会研究当前满足全部条件且资源足够的项目">' +
            (autoOn ? '关闭' : '开启') + (autoKind === 'tech' ? '科技' : '市政') + '自动研究</button>' : '';
        /* 轮回联动节点（dyn:'loop5'）：效果 = 系数 × 5% × 轮回次数 × 等级，每局 freshRun 由
         * derivePerksFromMeta 重算（读 m.cycle，无封顶）。徽标直接显示当前周目下的实时生效值，
         * 与结算口径同源（面板===结算），让玩家看到「这节点现在到底加多少」。 */
        var dynBadge = '';
        if (p.dyn === 'loop5') {
          var dcyc = m.cycle || 0, deff = 0, dak;
          for (dak in p.apply) deff += p.apply[dak];
          deff = deff * 0.05 * dcyc * st.lv;
          dynBadge = '<span class="talent-node-dyn" title="轮回联动：效果 = 系数 × 5% × 轮回次数 × 等级，' +
            '每局开局由 derivePerksFromMeta 重算（无封顶）">⟳ 轮回联动 · 当前 +' + (deff * 100).toFixed(1) +
            '%（' + dcyc + ' 周目 × ' + st.lv + ' 级）</span>';
        }
        nodes.push({
          id: p.id, name: p.name, desc: p.desc, layer: p.layer, nests: prereqIds, nest: prereqIds[0] || '',
          nestName: prereqIds.map(perkName).join('、'),
          rank: st.lv, rankText: st.lv + '/' + (isFinite(st.max) ? st.max : '∞'),
          status: status, cost: st.done ? '已满级' : st.locked ? '前置未达成' : '✧ ' + st.next + ' 点',
          state: nodeState, disabled: st.done || st.locked || !st.afford,
          glyph: group.icon, iconSrc: perkIconSrc(p), attr: 'data-perk="' + p.id + '"',
          title: p.name + ' · ' + (SUBMAP[p.subtree] || p.subtree), extraHtml: extraHtml + dynBadge
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
    h += '</div><div class="note meta-shop-note">轮回点跨周目保留。购买的强化永久生效；门槛减免能显著缩短后续周目的开荒时间。</div>';
    return h;
  }

  parts.paneMeta = paneMeta;
})(typeof window !== 'undefined' ? window : globalThis);
