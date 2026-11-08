/* 天壳 / SHELLBREAK — 信仰页渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatFallback(value, params) {
    return String(value == null ? '' : value).replace(/\{([^{}]+)\}/g, function (match, name) {
      return params && params[name] !== undefined && params[name] !== null ? String(params[name]) : match;
    });
  }
  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || formatFallback(fallback, params);
  }
  function faithTenets(s) {
    var F = SB.faith;
    if (!F) return '';
    var fmt = SB.economy.fmtAmt;
    var total = Number(s.faithEarnedTotal) || 0;
    var next = F.nextThreshold(s);
    var h = '<section class="faith-tenets"><header class="faith-tenets-head">' +
      '<h3>' + escapeHtml(F.text('faith.tenets.section_title')) + '</h3>' +
      '<p>' + escapeHtml(F.text('faith.tenets.intro')) + '</p></header>' +
      '<div class="faith-tenets-progress"><b>' + escapeHtml(F.text('faith.tenets.cumulative', { amount: fmt(total) })) + '</b>' +
      '<span>' + escapeHtml(next === null
        ? F.text('faith.tenets.thresholds_complete')
        : F.text('faith.tenets.next_threshold', { threshold: fmt(next) })) + '</span></div>';
    var drafts = Array.isArray(s.faithTenetDrafts) ? s.faithTenetDrafts : [];
    for (var i = 0; i < drafts.length; i++) {
      var draft = drafts[i];
      if (!draft || draft.chosen) continue;
      var options = Array.isArray(draft.options) ? draft.options : [];
      h += '<section class="faith-tenet-draft"><div class="faith-tenet-draft-head"><h4>' +
        escapeHtml(F.text('faith.tenets.pending_title', { threshold: fmt(draft.threshold) })) + '</h4><p>' +
        escapeHtml(F.text('faith.tenets.choose_hint', { count: options.length })) + '</p></div>' +
        '<div class="faith-tenet-options">';
      for (var j = 0; j < options.length; j++) {
        var tenet = F.byId(options[j]);
        if (!tenet) continue;
        h += '<button type="button" class="faith-tenet-choice" data-faith-tenet="' + escapeHtml(tenet.id) +
          '" data-faith-threshold="' + Number(draft.threshold) + '"><img class="faith-tenet-icon" src="' +
          escapeHtml(tenet.icon) + '" alt="" loading="lazy"><span class="faith-tenet-copy"><b>' +
          escapeHtml(F.tenetName(tenet.id)) + '</b><span>' + escapeHtml(F.tenetEffect(tenet.id)) +
          '</span><i>' + escapeHtml(F.text('faith.tenets.choose_button')) + '</i></span></button>';
      }
      h += '</div></section>';
    }
    var chosen = Array.isArray(s.faithTenets) ? s.faithTenets : [];
    h += '<section class="faith-tenet-established"><h4>' + escapeHtml(F.text('faith.tenets.chosen_title')) + '</h4>';
    if (!chosen.length) h += '<p class="faith-tenets-empty">' + escapeHtml(F.text('faith.tenets.empty_chosen')) + '</p>';
    else {
      h += '<div class="faith-tenet-established-list">';
      for (var k = 0; k < chosen.length; k++) {
        var selected = F.byId(chosen[k]);
        if (!selected) continue;
        var threshold = F.thresholdForTenet(s, selected.id);
        var thresholdLabel = threshold === null ? '' : '<i>' +
          escapeHtml(F.text('faith.tenets.threshold_tag', { threshold: fmt(threshold) })) + '</i>';
        h += '<article class="faith-tenet-established-card"><img class="faith-tenet-icon" src="' +
          escapeHtml(selected.icon) + '" alt="" loading="lazy"><div><b>' + escapeHtml(F.tenetName(selected.id)) +
          '</b><span>' + escapeHtml(F.tenetEffect(selected.id)) + '</span>' + thresholdLabel +
          '</div></article>';
      }
      h += '</div>';
    }
    return h + '</section></section>';
  }

  /* ── 信仰页（2026-09-30 用户：「单独起一个信仰面板」）────────────────────
   * 原先信仰在主页面上只是一张小卡（#religionBox），里面孤零零一个命名输入框 ——
   * 玩家看得见框、看不见「信仰这条轴在做什么」。现在收成一个正式页签，
   * 与巢穴 / 科技 / 市政 并列。
   * ⚠️ 命名输入框**不在本函数的返回值里**：它必须留在持久节点 #religionBox
   *    （写进正文就会被每 2 秒的 PANE_REFRESH 换掉、丢焦点）。本页的静态标题与那个框
   *    都写在 index.html 的 #pane-faith 里，这里的正文写进 #pane-faith-body
   *    （renderPanes 认这个 body 容器）。
   * 门 = 完成《神学》，与资源行的 gate 同源（resUnlocked(s,'faith') ⇔ s.civics.theology），
   *    未开门时给一张说明卡而不是空白页。 */
  function paneFaith() {
    var s = SB.game.run();
    if (!s || !SB.economy.resUnlocked(s, 'faith')) return paneFaithLocked();
    var h = '';
    var f = s.res.faith || 0;
    var fr = SB.economy.faithRate(s) || 0;
    var fam = SB.economy.faithAllMul(s);
    var fm = SB.economy.faithMul(s);
    /* ERA9 虚境信仰卡：装填后信仰名强制「虚境」并锁死（覆盖玩家自定义名）。 */
    var rn = (SB.civic && SB.civic.faithDisplayName) ? SB.civic.faithDisplayName(s) : ((s.religionName || '').trim());
    var rnLocked = !!(SB.civic && SB.civic.faithNameLocked && SB.civic.faithNameLocked(s));
    /* 读数三件同框才叫「一条轴」：存量 / 每秒 / 它换来的全局加成。 */
    var faithName = tr('content.faith.name', null, '信仰');
    var faithRateText = fr > 0 ? '<i class="rate up">' + escapeHtml(tr('ui.faith.panel.current_rate', {
      faithPerSecond: fr.toFixed(3)
    }, '+{faithPerSecond}/秒')) + '</i>' : '';
    var generationText = tr('ui.faith.panel.generation_explanation', {
      faithPerPerson: SB.CFG.FAITH_PER_POP,
      currentMultiplier: fm.toFixed(2)
    }, '每个族民每秒产出{faithPerPerson}信仰，再乘以神庙与政策加成（当前乘数：×{currentMultiplier}）。信仰不占仓储，也不会被消耗。');
    h += '<div class="row faith-resource-row' + (rnLocked ? ' is-void-anchored' : '') + '"><div><div class="nm">' + escapeHtml(rn || faithName) + ' <b>' + SB.economy.fmtAmt(f) + '</b>' +
      faithRateText + '</div><div class="ds">' + escapeHtml(generationText) + '</div></div></div>';

    var bonusExamples = [];
    for (var order = 1; order <= 3; order++) {
      var stock = Math.pow(10, order);
      var stockMultiplier = SB.economy.faithAllMul({ res: { faith: stock } });
      bonusExamples.push(new Intl.NumberFormat(SB.i18n && SB.i18n.getLocale ? SB.i18n.getLocale() : 'zh-CN').format(stock) +
        ' → +' + ((stockMultiplier - 1) * 100).toFixed(0) + '%');
    }
    var bonusPerMagnitude = ((SB.economy.faithAllMul({ res: { faith: 100 } }) - SB.economy.faithAllMul({ res: { faith: 10 } })) * 100).toFixed(0) + '%';
    var affectedResources = [
      tr('content.coral.name', null, '珊瑚'),
      tr('content.stone.name', null, '石头'),
      tr('resource.kelp.name', null, '藻食')
    ].join(SB.i18n && SB.i18n.getLocale && SB.i18n.getLocale() === 'en-US' ? ', ' : ' / ');
    var bonusText = tr('ui.faith.global_bonus.explanation', {
      bonusExamples: bonusExamples.join(' · '),
      bonusPerMagnitude: bonusPerMagnitude,
      affectedResources: affectedResources
    }, '按信仰存量的数量级提供全产出加成：{bonusExamples}。每增加一个数量级，加成提高{bonusPerMagnitude}。此加成影响{affectedResources}等全部资源，但不影响信仰本身（避免正反馈）。');
    h += '<div class="row"><div><div class="nm">' + escapeHtml(tr('ui.faith.global_bonus.title', null, '全产加成')) + ' <b>+' +
      ((fam - 1) * 100).toFixed(0) + '%</b> <span class="tag">' + escapeHtml(tr('ui.faith.global_bonus.basis_tag', null, '按存量')) + '</span></div>' +
      '<div class="ds">' + escapeHtml(bonusText) + '</div></div></div>';

    var nameStatusKey = rn
      ? (rnLocked ? 'ui.faith.name.named_locked' : 'ui.faith.name.named_editable')
      : (rnLocked ? 'ui.faith.name.empty_locked' : 'ui.faith.name.empty_editable');
    var nameStatusParams = rn ? { playerFaithName: '<b>' + escapeHtml(rn) + '</b>' } : null;
    var nameStatusFallback = rn
      ? (rnLocked
        ? '当前 Faith 名称：{playerFaithName}。虚境信仰已将名称永久锚定，不可更改。'
        : '当前 Faith 名称：{playerFaithName}。可在上方输入框随时免费改名；此名称会显示在顶栏信仰资源格。')
      : (rnLocked
        ? '尚未命名。虚境信仰已将名称永久锚定，不可更改。'
        : '尚未命名。请在上方输入框设定名称；之后可随时免费修改，此名称会显示在顶栏信仰资源格。');
    h += '<div class="row faith-state-row' + (rnLocked ? ' is-void-anchored' : '') + '"><div><div class="nm">' + escapeHtml(tr('ui.faith.panel.your_faith.label', null, '你的信仰')) +
      (rnLocked ? ' <span class="faith-void-seal">' + escapeHtml(tr('ui.faith.name.anchor_badge', null, '◈ 虚境锚定')) + '</span>' : '') + '</div>' +
      '<div class="ds">' + tr(nameStatusKey, nameStatusParams, nameStatusFallback) + '</div></div></div>';
    /* 来源与出口：说清信仰从哪来、通往哪里（轮回系统的门就是「建立宗教」）。 */
    h += '<div class="row"><div><div class="nm">' + escapeHtml(tr('ui.faith.source.section_title', null, '信仰从哪来')) + '</div>' +
      '<div class="ds">' + escapeHtml(tr('ui.faith.source.population_temple', {
        faithPerPerson: SB.CFG.FAITH_PER_POP,
        templeBonusPerLevel: (((SB.BLD && SB.BLD.templeFaithRatio) || 0) * 100).toFixed(0)
      }, '人口是信仰的唯一来源（每人每秒{faithPerPerson}）。人口越多，信仰积累越快。神庙每级使信仰产出增加{templeBonusPerLevel}%；这是唯一的建筑加成。')) + '</div></div></div>';
    h += faithTenets(s);
    return h;
  }
  function paneFaithLocked() {
    var theologyName = tr('civic.data.theology.name', null, '神学');
    var theologyEra = tr('research.era.name.fallback', { eraId: 2 }, '纪元 {eraId}');
    return '<div class="row"><div><div class="nm">' + escapeHtml(tr('ui.faith.locked.title', null, '信仰页未开启')) + '</div>' +
      '<div class="ds">' + escapeHtml(tr('ui.faith.locked.overview', null, '信仰是第三条文明发展支柱：人口越多，信仰积累越快；信仰存量越高，全产加成越强。')) + '</div></div></div>' +
      '<div class="note">' + escapeHtml(tr('ui.faith.locked.unlock_note', {
        unlockCivicName: theologyName,
        unlockEra: theologyEra
      }, '完成「{unlockCivicName}」后开启此页；它是{unlockEra}的关键节点之一。在那之前，信仰也不会显示在顶栏。')) + '</div>';
  }

  parts.paneFaith = paneFaith;
})(typeof window !== 'undefined' ? window : globalThis);
