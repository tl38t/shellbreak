/* 天壳 / SHELLBREAK — 轮回商店页渲染。仅依赖运行时 SB API。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function paneMeta() {
    var m = SB.game.meta();
    var lg = SB.prestige.legacy();
    var h = '<section class="meta-overview"><div class="meta-balance"><span>轮回点余额</span>' +
      '<strong>' + m.tide.toFixed(2) + '</strong><small>跨周目保留 · 用于永久强化</small></div>' +
      '<div class="meta-stats"><div><span>累计消费</span><b>' + m.spent.toFixed(2) + '</b></div>' +
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
    /* 商店分组：每个 perk.kind 映射到唯一分组（与 config-catalog.js 的 kind 一一对应）。
     * 顺序即面板自上而下：开局 → 破壳 → 人口 → 产出 → 建造 → 自动化 → 科研 → 市政 → 信仰 → 奇观。
     * ⚠️ 2026-10-16 重排：原来只有 start/thin/eff 三桶，eff 一个桶塞了 40+ 项大杂烩。
     *    现按数据 kind 拆成 10 个语义组，perk 的 kind 已在 config-catalog.js 归一化。 */
    var KMAP = { start: '起始', break: '破壳', pop: '人口', gather: '产出', build: '建造',
      auto: '自动', science: '科研', civic: '市政', faith: '信仰', wonder: '奇观' };
    var groups = [
      { key: 'start',  title: '开局馈赠',   hint: '为下一轮文明准备基础资源' },
      { key: 'break',  title: '破壳攻坚',   hint: '削弱冰壳、提升破壳系数与削壳效率，缩短重复开荒' },
      { key: 'pop',    title: '人口与储备', hint: '人口上限、住房、寒季与离线产出、资源仓储' },
      { key: 'gather', title: '采集与产出', hint: '各类资源（采集/珊瑚/矿/藻食/精铁/工坊/奢侈）产出加成' },
      { key: 'build',  title: '建造减耗',   hint: '降低所有建筑消耗' },
      { key: 'auto',   title: '自动化',     hint: '自动制作、自动采集与事件拾取' },
      { key: 'science',title: '科研',       hint: '科技点获取、初始科技与自动研究' },
      { key: 'civic',  title: '市政治理',   hint: '市政点获取、政体/政策方案与换政减费' },
      { key: 'faith',  title: '信仰',       hint: '信仰产出加成' },
      { key: 'wonder', title: '奇观营造',   hint: '奇观建造成本减免' }
    ];
    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi], items = [];
      for (var pi = 0; pi < SB.PERKS.length; pi++) {
        var perk = SB.PERKS[pi];
        if (perk.kind === group.key) items.push(perk);
      }
      h += '<section class="meta-shop-group meta-shop-' + group.key + '"><div class="meta-section-title"><b>' + group.title +
        '</b><span>' + group.hint + '</span><i>' + items.length + ' 项</i></div><div class="meta-shop-grid">';
      for (var ii = 0; ii < items.length; ii++) {
        var p = items[ii], st = SB.prestige.perkState(p.id);
        var autoKind = p.id === 'autoStudy' ? 'tech' : p.id === 'autoCivic' ? 'civic' : '';
        var autoOn = !!(autoKind && m.autoResearch && m.autoResearch[autoKind]);
        h += '<article class="meta-perk-card' + (st.done ? ' is-done' : st.locked ? ' is-locked' : '') +
          (autoKind && st.lv > 0 ? ' has-auto-toggle' : '') + '"><div class="meta-perk-copy"><div class="nm">' + p.name +
          ' <span class="tag">' + st.lv + '/' + (isFinite(st.max) ? st.max : '∞') + '</span>' +
          ' <span class="tag meta-kind-tag">' + (KMAP[p.kind] || p.kind) + '</span></div>' +
          '<div class="ds">' + p.desc + (st.locked ? '（需先解锁上一层）' : '') + '</div>' +
          (autoKind && st.lv > 0 ? '<button type="button" class="btn meta-auto-toggle" data-auto-research="' + autoKind +
            '" aria-pressed="' + autoOn + '" title="自动研究默认关闭；只会研究当前满足全部条件且资源足够的项目">' +
            (autoOn ? '关闭' : '开启') + (autoKind === 'tech' ? '科技' : '市政') + '自动研究</button>' : '') + '</div>' +
          '<button class="btn buy meta-buy" data-perk="' + p.id + '"' +
          (st.done || st.locked || !st.afford ? ' disabled' : '') + '>' +
          (st.done ? '已满级' : st.locked ? '尚未解锁' : st.next + ' 点') + '</button></article>';
      }
      h += '</div></section>';
    }
    h += '<div class="note meta-shop-note">轮回点跨周目保留。购买的强化永久生效；门槛减免能显著缩短后续周目的开荒时间。</div>';
    return h;
  }

  parts.paneMeta = paneMeta;
})(typeof window !== 'undefined' ? window : globalThis);
