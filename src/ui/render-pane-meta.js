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
    var groups = [
      { key: 'start', title: '开局馈赠', hint: '为下一轮文明准备基础资源', kind: 'start' },
      { key: 'thin', title: '破壳门槛', hint: '永久削弱冰壳，缩短重复开荒', kind: 'thin' },
      { key: 'eff', title: '恒久增益', hint: '强化生产、研究与自动化', kind: 'eff' }
    ];
    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi], items = [];
      for (var pi = 0; pi < SB.PERKS.length; pi++) {
        var perk = SB.PERKS[pi];
        var bucket = perk.kind === 'start' ? 'start' : perk.kind === 'thin' ? 'thin' : 'eff';
        if (bucket === group.key) items.push(perk);
      }
      h += '<section class="meta-shop-group meta-shop-' + group.key + '"><div class="meta-section-title"><b>' + group.title +
        '</b><span>' + group.hint + '</span><i>' + items.length + ' 项</i></div><div class="meta-shop-grid">';
      for (var ii = 0; ii < items.length; ii++) {
        var p = items[ii], st = SB.prestige.perkState(p.id);
        h += '<article class="meta-perk-card' + (st.done ? ' is-done' : st.locked ? ' is-locked' : '') + '"><div class="meta-perk-copy"><div class="nm">' + p.name +
          ' <span class="tag">' + st.lv + '/' + (isFinite(st.max) ? st.max : '∞') + '</span>' +
          ' <span class="tag meta-kind-tag">' + (p.kind === 'start' ? '起始' : p.kind === 'thin' ? '门槛' : '效率') + '</span></div>' +
          '<div class="ds">' + p.desc + (st.locked ? '（需先解锁上一层）' : '') + '</div></div>' +
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
