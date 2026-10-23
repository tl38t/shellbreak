/* 天壳 / SHELLBREAK — 轮回商店页渲染。仅依赖运行时 SB API。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function paneMeta() {
    var m = SB.game.meta();
    var lg = SB.prestige.legacy();
    var trees = [
      { key: 'remnant', icon: '✦', accent: '#9fddb9', title: '先人孑遗', subtitle: '开局馈赠与自动点击' },
      { key: 'shelter', icon: '⌂', accent: '#e2bf81', title: '安得广厦', subtitle: '人口上限与资源仓储' },
      { key: 'forge', icon: '⚒', accent: '#f0a868', title: '铁血工造', subtitle: '工坊制作与自动槽' },
      { key: 'mineral', icon: '⛏', accent: '#c9b08a', title: '金石为开', subtitle: '矿工·采石·炉火效率' },
      { key: 'food', icon: '✿', accent: '#6ed4c1', title: '唯食与犁', subtitle: '藻食·珊瑚·御寒' },
      { key: 'steel', icon: '🔩', accent: '#b8c0cc', title: '百炼成钢', subtitle: '精铁·钢·工艺零件' },
      { key: 'politics', icon: '⚖', accent: '#e5a9d6', title: '政经往来', subtitle: '商·书·奢侈·幸福' },
      { key: 'vision', icon: '🔭', accent: '#9eacff', title: '远见之人', subtitle: '学者·钻机·薄壳' }
    ];
    var ownedNodes = 0, totalLevels = 0, totalNodes = SB.TIDE_TREE.length;
    for (var si = 0; si < SB.TIDE_TREE.length; si++) {
      var ownedState = SB.prestige.perkState(SB.TIDE_TREE[si].id);
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
      '<h2>遗产天赋树</h2><p>前置连线表示真实解锁条件；没有前置的天赋可独立点亮。</p></div>' +
      '<div class="meta-tree-progress"><span>已点亮节点</span><b>' + ownedNodes + '<i> / ' + totalNodes + '</i></b>' +
      '<div class="meta-tree-progress-track"><i style="width:' + (totalNodes ? ownedNodes / totalNodes * 100 : 0) + '%"></i></div>' +
      '<small>累计强化 ' + totalLevels + ' 阶</small></div></section><div class="meta-tree-grid">';
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
          id: p.id, name: p.name, desc: p.desc, nest: p.nest, nestName: p.nest ? perkName(p.nest) : '',
          rank: st.lv, rankText: st.lv + '/' + (isFinite(st.max) ? st.max : '∞'),
          status: status, cost: st.done ? '已满级' : st.locked ? '前置未达成' : '✧ ' + st.next + ' 点',
          state: nodeState, disabled: st.done || st.locked || !st.afford,
          glyph: group.icon, attr: 'data-perk="' + p.id + '"',
          title: p.name + ' · ' + (SUBMAP[p.subtree] || p.subtree), extraHtml: extraHtml + dynBadge
        });
      }
      h += SB.ui.talentTreeMarkup({
        className: 'meta-talent-tree meta-tree-' + group.key,
        title: group.title, subtitle: group.subtitle, icon: group.icon, accent: group.accent, nodes: nodes
      });
    }
    h += '</div><div class="note meta-shop-note">轮回点跨周目保留。购买的强化永久生效；门槛减免能显著缩短后续周目的开荒时间。</div>';
    return h;
  }

  parts.paneMeta = paneMeta;
})(typeof window !== 'undefined' ? window : globalThis);
