/* 天壳 / SHELLBREAK — 外交与征服战役页。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function tr(key, params) {
    return SB.i18n && SB.i18n.t ? (SB.i18n.t(key, params) || '') : '';
  }
  function amount(value) {
    return SB.economy && SB.economy.fmtAmt ? SB.economy.fmtAmt(value) : String(Math.floor(Number(value) || 0));
  }
  function resourceName(id) {
    var fallback = SB.RESS && SB.RESS[id] ? SB.RESS[id].name : id;
    return SB.i18n && SB.i18n.resourceName ? SB.i18n.resourceName(id, fallback) : fallback;
  }
  function outcomePercent(value) { return (Math.max(0, Number(value) || 0) * 100).toFixed(1); }

  function enemyArtwork(stage) {
    var stageNumber = Math.max(1, Math.min(7, Math.floor(Number(stage) || 1)));
    var filenames = {
      1: 'enemy-stage-01.jpg',
      2: 'enemy-stage-02.jpg',
      3: 'enemy-stage-03.jpg',
      4: 'enemy-stage-04.jpg',
      5: 'enemy-stage-05.jpg',
      6: 'enemy-stage-06.jpg',
      7: 'enemy-stage-07.jpg'
    };
    return 'assets/war/enemies/' + filenames[stageNumber] + '?v=2';
  }

  /* 传承只读收藏墙（2026-11-11）。
   * ⚠️ 必须能被「战役完成」早退分支复用：七阶吞完 currentEnemy 变 null，
   *    若只挂在正常分支末尾，玩家刚拿满 7 张时反而看不到卡。
   * ⚠️ 纯只读，每次从 s 重建 ⇒ 面板每 2 秒整块重画不会丢状态；
   *    待选榜单状态在 s.war.heritage.pending，弹窗只由独立浮层渲染。 */
  function heritageSection(s) {
    var h = SB.heritage;
    if (!h || !s) return '';
    var pend = h.pendingOf(s), owned = h.ownedRecords(s), total = h.maxStage();
    var out = '<section class="war-section heritage-section"><div class="secttl">' +
      esc(tr('ui.heritage.title') || '传承') + '</div>' +
      /* 2026-11-11 用户定稿引文（逐字，不做风味条/品阶/分类）。 */
      '<div class="heritage-flavor">' + esc(tr('ui.heritage.flavor') ||
        '他们没能经受时光的考验，但至少有一部分获得了新生……') + '</div>';
    out += '<div class="heritage-status' + (pend.length ? ' is-pending' : '') + '"><span>' +
      esc(tr('ui.heritage.progress', { owned: owned.length, total: total }) ||
        ('本局已收录 ' + owned.length + ' / ' + total)) + '</span>';
    if (pend.length) {
      out += '<b>' + esc(tr('ui.heritage.pending', { count: pend.length }) ||
        ('有 ' + pend.length + ' 张传承待选')) + '</b>' +
        '<button type="button" class="btn buy" data-heritage-open="1">' +
        esc(tr('ui.heritage.open') || '择取') + '</button>';
    }
    out += '</div>';
    if (!owned.length) {
      out += '<div class="heritage-wall-empty">' +
        esc(tr('ui.heritage.empty') || '尚未收录传承。吞并敌国后可择取。') + '</div>';
    } else {
      var sorted = owned.slice().sort(function (a, b) {
        return (Number(a && a.stage) || 0) - (Number(b && b.stage) || 0);
      });
      out += '<div class="heritage-wall">';
      for (var i = 0; i < sorted.length; i++) {
        var r = sorted[i], id = typeof r === 'string' ? r : (r && r.id);
        if (!id) continue;
        var st = (r && typeof r.stage === 'number' && r.stage >= 1 && r.stage <= 7) ? r.stage : (i + 1);
        out += '<article class="heritage-card is-owned">' +
          '<span class="heritage-card-stage">' + esc(h.roman(st)) + '</span>' +
          '<div class="heritage-card-name">' + esc(h.nameOf(id)) + '</div>' +
          '<div class="heritage-card-desc">' + esc(h.descOf(id)) + '</div>' +
          '<span class="heritage-effective">' + esc(tr('ui.heritage.effective') || '已生效') +
          '</span></article>';
      }
      out += '</div>';
    }
    return out + '</section>';
  }

  function paneWar() {
    var s = SB.game && SB.game.run ? SB.game.run() : null;
    if (!s || !SB.war) return '';
    if (SB.war.syncCampaign) SB.war.syncCampaign(s);
    var hasWarCivic = !!(s.civics && s.civics.military_training);
    var hasDiplomacy = !!((s.techs && s.techs.navigation) || hasWarCivic);
    if (!hasDiplomacy) {
      return '<section class="war-campaign war-archive war-empty"><div class="war-empty-mark" aria-hidden="true"></div>' +
        '<div class="war-empty-title">' + esc(tr('ui.pane.diplomacy.title')) + '</div>' +
        '<div class="war-empty-copy">' + esc(tr('ui.war.campaign.locked')) + '</div></section>';
    }
    var state = s.war || {}, enemy = SB.war.currentEnemy(s);
    if (!enemy) return '<section class="war-campaign war-archive war-empty war-complete"><div class="war-empty-mark" aria-hidden="true"></div>' +
      '<div class="war-empty-title">' + esc(tr('ui.pane.diplomacy.title')) + '</div>' +
      '<div class="war-empty-copy">' + esc(tr('ui.war.campaign.complete', {
        bonusPercent: SB.war.conquestBonusPercent(s)
      })) + '</div>' + heritageSection(s) + '</section>';

    var currentScale = SB.war.currentScale(enemy), maxScale = SB.war.effectiveMaxScale(enemy);
    var power = SB.war.power(s), rate = SB.war.rate(s);
    var invasion = hasWarCivic && SB.war.invasionStatus ? SB.war.invasionStatus(s) : null;
    var enemyName = tr(enemy.nameKey);
    var baseScale = Math.max(0, Number(enemy.baseScale) || 0);
    var faithFraction = Math.max(0, Math.min(0.30, Number(enemy.faithReduction) || 0));
    var cultureFraction = Math.max(0, Math.min(0.30, Number(enemy.cultureReduction) || 0));
    var faithReduction = Math.round(faithFraction * 1000) / 10;
    var cultureReduction = Math.round(cultureFraction * 1000) / 10;
    var faithLoss = baseScale * faithFraction;
    var cultureLoss = baseScale * cultureFraction;
    var effectivePercent = baseScale > 0 ? Math.max(0, Math.min(100, maxScale / baseScale * 100)) : 0;
    var cultureFlow = Math.max(0, Math.min(100, cultureFraction * 100));
    var faithFlow = Math.max(0, Math.min(100 - cultureFlow, faithFraction * 100));
    var cultureMeter = Math.max(0, Math.min(100, cultureReduction / 30 * 100));
    var faithMeter = Math.max(0, Math.min(100, faithReduction / 30 * 100));
    var scaleMeter = maxScale > 0 ? Math.max(0, Math.min(100, currentScale / maxScale * 100)) : 0;
    var remainingCap = Math.max(0, (enemy.popCapPool || 0) - (enemy.popCapClaimed || 0));
    var lootResources = SB.war.lootResourceCandidates ? SB.war.lootResourceCandidates(s) : [];
    var enemyArt = enemyArtwork(enemy.stage);

    var scaleLabel = tr('ui.war.enemy.scale', {
      currentScale: amount(currentScale), maxScale: amount(maxScale)
    });
    var recoveryLabel = tr('ui.war.enemy.recovery', {
      scalePerSecond: (maxScale * SB.war.RECOVERY_PER_SECOND).toFixed(2)
    });
    var populationCapLabel = tr('ui.war.enemy.population_cap', { remainingPopCap: remainingCap });
    var capSummary = tr('ui.war.enemy.cap_reductions', {
      faithReductionPercent: faithReduction.toFixed(1), cultureReductionPercent: cultureReduction.toFixed(1)
    });
    /* 2026-11-11 用户定稿：信仰格写「转为信仰〈玩家设定的信仰名〉」。
     * ⚠️ 名字必须走权威读数 faithDisplayName：装填虚境信仰卡后信仰名被锁成「虚境」，
     *    直接读 s.religionName 会把玩家旧名显示出来，和信仰资源行不一致。
     *    未命名（神学未完成 / 玩家还没起名）时没有名字可填 ⇒ 回落短标签「信仰影响」。 */
    var faithName = (SB.civic && SB.civic.faithDisplayName)
      ? SB.civic.faithDisplayName(s)
      : ((s && s.religionName) || '').trim();
    var faithLabel = faithName
      ? tr('ui.war.scale_flow.faith_named', { faithName: faithName })
      : tr('ui.war.scale_flow.faith');
    var h = '<section class="war-campaign war-archive">' +
      '<div class="war-archive-grid">' +
      '<aside class="war-archive-cover" aria-label="' + esc(enemyName) + '">' +
      '<div class="war-portrait-window"><img class="war-archive-art" src="' + enemyArt + '" alt="" decoding="async">' +
      '<span class="war-archive-shade" aria-hidden="true"></span></div>' +
      '<i class="war-archive-rule top" aria-hidden="true"></i>' +
      '<div class="war-archive-name">' + esc(enemyName) + '</div>' +
      '<div class="war-archive-stage">' + esc(tr('ui.war.enemy.stage_name', { stage: enemy.stage, enemyName: enemyName })) + '</div>' +
      '<div class="war-archive-current">' + esc(scaleLabel) + '</div>' +
      '<div class="war-archive-current-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      outcomePercent(scaleMeter / 100) + '" aria-label="' + esc(scaleLabel) + '"><i style="width:' + scaleMeter.toFixed(2) + '%"></i></div>' +
      '<i class="war-archive-rule bottom" aria-hidden="true"></i>' +
      '</aside><article class="war-archive-record">' +
      '<div class="war-record-head"><h2>' + esc(tr('ui.war.scale_flow.title')) + '</h2>' +
      '<span class="war-record-stage">' + String(enemy.stage).padStart(2, '0') + '</span></div>' +
      '<div class="war-flow-grid">' +
      '<div class="war-flow-cell"><span>' + esc(tr('ui.war.scale_flow.base_cap')) + '</span><strong>' + amount(baseScale) + '</strong><small>' + outcomePercent(baseScale > 0 ? 1 : 0) + '%</small></div>' +
      '<div class="war-flow-cell culture"><span>' + esc(tr('ui.war.scale_flow.culture')) + '</span><strong>−' + amount(cultureLoss) + '</strong><small>' + cultureReduction.toFixed(1) + '%</small></div>' +
      '<div class="war-flow-cell faith"><span>' + esc(faithLabel) + '</span><strong>−' + amount(faithLoss) + '</strong><small>' + faithReduction.toFixed(1) + '%</small></div>' +
      '<div class="war-flow-cell effective"><span>' + esc(tr('ui.war.scale_flow.effective_cap')) + '</span><strong>' + amount(maxScale) + '</strong><small>' + effectivePercent.toFixed(1) + '%</small></div>' +
      '</div><div class="war-archive-bar" role="img" aria-label="' + esc(capSummary) + '">' +
      '<i class="retained" style="width:' + effectivePercent.toFixed(2) + '%"></i>' +
      '<i class="culture" style="width:' + cultureFlow.toFixed(2) + '%"></i>' +
      '<i class="faith" style="width:' + faithFlow.toFixed(2) + '%"></i></div>' +
      '<div class="war-archive-legend"><span><i class="retained"></i>' + esc(tr('ui.war.scale_flow.effective_cap')) + ' ' + effectivePercent.toFixed(1) + '%</span>' +
      '<span><i class="culture"></i>' + esc(tr('ui.war.scale_flow.culture_legend')) + ' ' + cultureReduction.toFixed(1) + '%</span>' +
      '<span><i class="faith"></i>' + esc(tr('ui.war.scale_flow.faith_legend')) + ' ' + faithReduction.toFixed(1) + '%</span></div>' +
      '<div class="war-archive-details"><div class="war-archive-detail">' + esc(recoveryLabel) + '</div>' +
      '<div class="war-archive-detail">' + esc(populationCapLabel) + '</div></div></article></div>' +
      '<div class="war-archive-status-row"><article class="war-overview-card war-power-card">' +
      '<span class="war-power-emblem" aria-hidden="true"></span><div class="war-power-summary">' + esc(tr('ui.war.power.summary', {
        power: amount(power), rate: rate.toFixed(2)
      })) + '</div></article>' +
      '</div>';
    if (invasion) {
      var formatDuration = function (seconds) {
        return SB.game && SB.game.fmtDur ? SB.game.fmtDur(Math.max(0, seconds)) : '';
      };
      var threatStatusText = tr('ui.war.invasion.threat_status', {
        threatPercent: invasion.threatPercent.toFixed(1)
      });
      h += '<article class="war-threat-card"><div class="war-threat-head"><div class="war-threat-copy">' + esc(threatStatusText) + '</div>';
      if (invasion.cooldownRemaining > 0) h += '<div class="war-threat-cooldown">' + esc(tr('ui.war.invasion.cooldown_status', {
        cooldown: formatDuration(invasion.cooldownRemaining)
      })) + '</div>';
      h += '</div><div class="war-threat-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
        Math.max(0, Math.min(100, Number(invasion.threatPercent) || 0)).toFixed(1) + '" aria-label="' + esc(threatStatusText) + '"><i style="width:' +
        Math.max(0, Math.min(100, Number(invasion.threatPercent) || 0)).toFixed(2) + '%"></i></div>';
      if (invasion.warningPending) h += '<div class="war-warning">' + esc(tr('ui.war.invasion.warning', {
        enemyName: enemyName,
        countdown: formatDuration(invasion.countdownRemaining),
        enemySuccessPercent: Math.round(invasion.enemySuccessChance * 100)
      })) + '</div>';
      h += '</article>';
    }
    if (hasWarCivic) {
      var actionRows = [
        { id: 'raid', civic: 'military_training', key: 'ui.war.action.raid' },
        { id: 'invasion', civic: 'professional_army', key: 'ui.war.action.invasion' },
        { id: 'totalWar', civic: 'mobilization', key: 'ui.war.action.total_war' }
      ];
      var visibleActions = 0;
      h += '<section class="war-section war-actions-section"><div class="secttl">' + esc(tr('ui.war.actions.title')) + '</div>';
      h += '<div class="war-action-grid">';
      for (var ai = 0; ai < actionRows.length; ai++) {
        var action = actionRows[ai];
        if (!s.civics[action.civic]) continue;
        visibleActions++;
        var cost = SB.war.actionCost(s, enemy, action.id);
        var odds = SB.war.actionProbabilities(s, action.id) || { failure: 0, success: 0, greatSuccess: 0 };
        var canAct = currentScale > 0 && lootResources.length > 0 && power + 1e-9 >= cost;
        var blockedKey = currentScale <= 0 || !lootResources.length
          ? 'ui.war.action.unavailable' : 'ui.war.action.power_shortage';
        /* 2026-11-11 用户要求「写清楚后果，失败会如何、成功会如何」。
         * ⚠️ 数值一律现读 SB.war.ACTIONS（war.js 唯一权威规则表），绝不写死：
         *    scaleLoss 是「军力成本 × 倍率」造成的敌国规模损失，不是减少我方军力；
         *    soldierLoss 是军人阵亡比例；失败无战利品、大成功额外给人口上限。
         *    政策卡 / 奇观 / 信仰带来的加成属于局内修正，说明写基础规则即可。 */
        var spec = (SB.war.ACTIONS && SB.war.ACTIONS[action.id]) || null;
        var outcomeHtml = '';
        if (spec && spec.outcomes) {
          var lootMinutes = Math.round((Number(spec.lootSeconds) || 0) / 60 * 10) / 10;
          var tiers = [
            { id: 'failure', key: 'ui.war.action.outcome.failure', o: spec.outcomes.failure },
            { id: 'success', key: 'ui.war.action.outcome.success', o: spec.outcomes.success },
            { id: 'great', key: 'ui.war.action.outcome.great_success', o: spec.outcomes.greatSuccess }
          ];
          outcomeHtml = '<div class="war-action-outcomes">';
          for (var ti = 0; ti < tiers.length; ti++) {
            var tier = tiers[ti], tierOut = tier.o || {};
            var soldierRate = Number(tierOut.soldierLoss) || 0;
            var soldierText = soldierRate > 0
              ? tr('ui.war.action.soldiers', { soldierLossPercent: Math.round(soldierRate * 100) })
              : (tr('ui.war.action.no_soldiers') || '无人阵亡');
            outcomeHtml += '<div class="ds is-' + tier.id + '">' + esc(tr(tier.key, {
              scaleLossPercent: Math.round((Number(tierOut.scaleLoss) || 0) * 100),
              soldierText: soldierText,
              lootMinutes: lootMinutes,
              popCap: Number(tierOut.popCap) || 0
            })) + '</div>';
          }
          outcomeHtml += '<div class="ds">' + esc(tr('ui.war.action.common_note')) + '</div></div>';
        }
        h += '<article class="war-action-card war-action-row"><div class="war-action-copy"><div class="nm">' + esc(tr(action.key)) + '</div>' +
          '<div class="ds">' + esc(tr('ui.war.action.cost', { militaryPowerCost: amount(cost) })) + '</div>' +
          '<div class="ds">' + esc(tr('ui.war.action.odds', {
            failureChance: outcomePercent(odds.failure), successChance: outcomePercent(odds.success),
            greatSuccessChance: outcomePercent(odds.greatSuccess)
          })) + '</div>' + outcomeHtml + '</div><button type="button" class="btn' + (canAct ? ' buy' : '') + '" data-war-action="' +
          esc(action.id) + '"' + (canAct ? '' : ' disabled title="' + esc(tr(blockedKey)) + '"') + '>' +
          esc(tr('ui.war.action.execute')) + '</button></article>';
      }
      if (!visibleActions) h += '<div class="note">' + esc(tr('ui.war.action.unavailable')) + '</div>';
      h += '</div></section>';
    }

    /* 常驻「上一次结果」行（2026-11-11）：toast 会自动消失，这里留一行可回看。
       ⚠️ 数据来自 ui/war-toast.js 的模块内存态，不写进存档 ⇒ 无需迁移、也不污染老档。
       ⚠️ tr() 本文件无 fallback 参数，缺 key 会返回空串，故逐字兜底。 */
    var lastWar = SB.ui && SB.ui.lastWarResult ? SB.ui.lastWarResult() : null;
    h += '<div class="war-last-result' + (lastWar && lastWar.variant ? ' is-' + esc(lastWar.variant) : '') + '">' +
      '<span>' + esc(tr('ui.war.toast.last_label') || '最近一次：') + '</span><b>' +
      esc(lastWar && lastWar.text ? lastWar.text : (tr('ui.war.toast.last_empty') || '— 尚未行动 —')) +
      '</b></div>';

    var softActions = [];
    if (s.civics.drama) softActions.push({ id: 'culture', civic: 'drama', resource: 'culture', key: 'ui.war.soft_power.culture' });
    if (s.civics.sovereign) softActions.push({ id: 'faith', civic: 'sovereign', resource: 'faith', key: 'ui.war.soft_power.faith' });
    h += '<section class="war-section war-softpower-section"><div class="secttl">' + esc(tr('ui.war.soft_power.title')) + '</div>' +
      '<div class="war-influence-chart" role="group" aria-label="' + esc(capSummary) + '">' +
      '<div class="war-influence-item war-influence-culture"><div class="war-influence-head"><span>' + esc(tr('ui.war.soft_power.culture')) +
      '</span><strong>' + cultureReduction.toFixed(1) + '%</strong></div><div class="war-influence-track" role="progressbar" aria-valuemin="0" aria-valuemax="30" aria-valuenow="' +
      cultureReduction.toFixed(1) + '" aria-label="' + esc(tr('ui.war.soft_power.culture')) + '"><i style="width:' + cultureMeter.toFixed(2) + '%"></i></div></div>' +
      '<div class="war-influence-item war-influence-faith"><div class="war-influence-head"><span>' + esc(tr('ui.war.soft_power.faith')) +
      '</span><strong>' + faithReduction.toFixed(1) + '%</strong></div><div class="war-influence-track" role="progressbar" aria-valuemin="0" aria-valuemax="30" aria-valuenow="' +
      faithReduction.toFixed(1) + '" aria-label="' + esc(tr('ui.war.soft_power.faith')) + '"><i style="width:' + faithMeter.toFixed(2) + '%"></i></div></div></div>';
    if (softActions.length) h += '<div class="war-soft-actions-grid">';
    for (var si = 0; si < softActions.length; si++) {
      var soft = softActions[si], softCost = SB.war.softPowerCost(s, enemy, soft.id);
      var reduction = soft.id === 'faith' ? (enemy.faithReduction || 0) : (enemy.cultureReduction || 0);
      var available = currentScale > 0 && reduction < 0.30 && Number(s.res[soft.resource] || 0) + 1e-9 >= softCost;
      var capReached = reduction >= 0.30;
      h += '<article class="war-action-card war-soft-action-card"><div class="war-action-copy"><div class="nm">' + esc(tr(soft.key)) + '</div>' +
        '<div class="ds">' + esc(tr('ui.war.soft_power.cost', {
          resourceCost: amount(softCost), resourceName: resourceName(soft.resource)
        })) + '</div>' +
        /* 2026-11-11 用户要求「这里要解释效果」。口径对齐 war.js:732-741：
         *   概率 25/50/25、削减 0.5/1.5/3%、单渠道上限 30%、每次执行后成本 ×1.5。 */
        '<div class="ds">' + esc(tr('ui.war.soft_power.effect')) + '</div>' +
        '<div class="ds">' + esc(tr('ui.war.soft_power.limit')) + '</div>' +
        '</div><button type="button" class="btn' + (available ? ' buy' : '') + '" data-war-soft="' +
        esc(soft.id) + '"' + (available ? '' : ' disabled' + (capReached ? ' title="' + esc(tr('ui.war.soft_power.cap')) + '"' : currentScale <= 0 ? ' title="' + esc(tr('ui.war.action.unavailable')) + '"' : '')) + '>' +
        esc(tr(soft.key)) + '</button></article>';
    }
    if (softActions.length) h += '</div>';
    h += '</section>';

    h += '<div class="war-services-grid"><section class="war-section war-route-section"><div class="secttl">' + esc(tr('ui.war.trade_route.title')) + '</div>';
    var route = SB.war.tradeRouteQuote(s);
    h += '<div class="war-route-card"><div class="war-route-status">' + esc(tr('ui.war.trade_route.level', {
      tradeRouteLevel: route.level,
      luxuryReductionPercent: Math.round((1 - SB.war.tradeRouteLuxuryUseMul(s)) * 100)
    })) + '</div>';
    if (s.civics.trade && route.level < 3) {
      h += '<button type="button" class="btn' + ((s.res.stone || 0) >= route.cost ? ' buy' : '') +
        '" data-war-route="1"' + ((s.res.stone || 0) >= route.cost ? '' : ' disabled') + '>' +
        esc(tr('ui.war.trade_route.establish', { nextLevel: route.nextLevel, stoneCost: amount(route.cost) })) + '</button>';
    } else if (s.civics.trade) h += '<span class="tag">' + esc(tr('ui.war.trade_route.max')) + '</span>';
    h += '</div></section>';

    h += '<section class="war-section war-annex-section"><div class="secttl">' + esc(tr('ui.war.annex.title')) + '</div>';
    var mirror = SB.war.mirrorBuilt(s), annexCost = SB.war.annexCost(enemy, mirror);
    var annexAllowed = power + 1e-9 >= annexCost;
    h += '<div class="war-annex-card"><div class="war-annex-copy">' + esc(tr('ui.war.annex.cost', {
      militaryPowerCost: amount(annexCost), currentPower: amount(power), annexMultiplier: SB.war.annexMultiplier(s)
    })) + '</div><button type="button" class="btn' + (annexAllowed ? ' buy' : '') +
      '" data-war-annex="1"' + (annexAllowed ? '' : ' disabled title="' + esc(tr('ui.war.action.power_shortage')) + '"') +
      '>' + esc(tr('ui.war.annex.button')) + '</button></div>';
    h += '</section></div></section>';
    h += heritageSection(s);
    return h;
  }

  parts.paneWar = paneWar;
})(typeof window !== 'undefined' ? window : globalThis);
