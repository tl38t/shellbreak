/* 天壳 / SHELLBREAK — 轮回挑战页渲染。挑战规则与进度由 SB.challenges 提供。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function paneChallenges() {
    var s = SB.game.run(), m = SB.game.meta(), api = SB.challenges;
    var list = api.list(), total = api.completedCount(m), active = api.active(s);
    var h = '<section class="challenge-overview"><div class="challenge-overview-title">' +
      '<span class="challenge-kicker">PRESTIGE TRIALS</span><h2>轮回挑战</h2>' +
      '<p>开启挑战会结算当前周目并立即开始新周目。完成《神学》资格并凿穿天壳，才算挑战通关。</p></div>' +
      '<div class="challenge-overview-stats"><div><small>挑战通关</small><b>' + total + '</b></div>' +
      '<div><small>轮回点获取</small><b>+' + (total * 10) + '%</b></div></div></section>';

    if (active) {
      var activeDef = api.byId(active.id), activeTier = activeDef.tiers[active.tier] || activeDef.tiers[0];
      var progressText = '';
      var activeTimedOut = active.id === 'speedrun' && api.timedOut(s);
      var scribeName = SB.folk.jobName(s, 'scribe');
      if (active.id === 'science') progressText = '学者 ' + (s.jobs.scholar || 0) + ' / ' + activeTier.cap +
        ' · ' + scribeName + ' ' + (s.jobs.scribe || 0) + ' / ' + activeTier.cap;
      else if (active.id === 'small') progressText = '当前人口 ' + s.pop + ' / ' + activeTier.cap;
      else if (active.id === 'abyss') progressText = '全产出 -' + Math.round(activeTier.cap * 100) + '%';
      else if (active.id === 'speedrun') progressText = activeTimedOut ? '已超时 · 本档不能领取奖励' :
        '剩余 ' + api.formatClock(api.remainingSeconds(s)) + ' · 离线继续计时';
      else progressText = api.warmHeatingBlocked(s) ? '寒流季：保温法禁用，产业仍可消耗暖石' : '非寒流季：保温法可正常使用';
      h += '<section class="challenge-active' + (activeTimedOut ? ' is-failed' : '') + '"><span class="challenge-active-mark">' +
        (activeTimedOut ? '已超时' : '进行中') + '</span>' +
        '<div><b>' + activeDef.name + ' · ' + activeTier.label + '</b><small>' + progressText + '</small></div>' +
        '<span class="challenge-active-hint">' + (activeTimedOut ? '重开本周目后可再次尝试，不消耗档位' : '通关目标：完成《神学》并凿穿天壳') + '</span></section>';
    } else {
      h += '<div class="challenge-howto">每档挑战首次通关都会让之后的轮回点获取永久提高 10%。分档挑战必须逐档完成；单次挑战完成后不会再次开放。</div>';
    }

    h += '<section class="challenge-grid">';
    for (var i = 0; i < list.length; i++) {
      var d = list[i], done = api.tierDone(d.id, m), isActive = active && active.id === d.id;
      var scribeName = SB.folk.jobName(s, 'scribe');
      var summary = d.id === 'science' ? '限制学者与' + scribeName + '人数，考验基础经营。' : d.summary;
      var rule = d.id === 'science' ? '学者与' + scribeName + '岗位人数各不得超过本档上限' : d.rule;
      var exhausted = done >= d.tiers.length, next = Math.min(done, d.tiers.length - 1);
      var blocked = !!active && !isActive;
      var activeTimedOut = isActive && d.id === 'speedrun' && api.timedOut(s);
      var status = isActive ? (activeTimedOut ? '已超时' : '进行中') : exhausted ? '已完成' : blocked ? '等待当前挑战结束' : (d.tiers.length > 1 ? '下一档可挑战' : '尚未完成');
      h += '<article class="challenge-card' + (isActive ? ' is-active' : '') + (exhausted ? ' is-complete' : '') + '">';
      h += '<header class="challenge-card-head"><span class="challenge-icon" aria-hidden="true"><img src="' + d.badge + '" alt=""></span>' +
        '<div class="challenge-card-name"><h3>' + d.name + '</h3><small>' + d.kind + ' · ' + summary + '</small></div>' +
        '<span class="challenge-status' + (exhausted ? ' done' : activeTimedOut ? ' failed' : isActive ? ' active' : '') + '">' + status + '</span></header>';
      h += '<div class="challenge-card-rule"><small>本轮限制</small><p>' + rule + '</p>' +
        '<small>通关目标</small><p>完成《神学》并凿穿天壳</p></div>';

      if (d.tiers.length > 1) {
        h += '<div class="challenge-tiers">';
        for (var ti = 0; ti < d.tiers.length; ti++) {
          var td = d.tiers[ti], tierActive = isActive && active.tier === ti;
          var tierState = ti < done ? '已通关' : tierActive ? (activeTimedOut ? '已超时' : '进行中') : ti === done && !blocked && !exhausted ? '下一档' : '锁定';
          var tierRule = d.id === 'science' ? '学者、' + scribeName + '各 ≤ ' + td.cap + ' 人' :
            d.id === 'speedrun' ? '限时 ' + api.formatClock(td.cap) + ' · 离线计时' : '本轮全产出 -' + Math.round(td.cap * 100) + '%';
          h += '<div class="challenge-tier' + (ti < done ? ' done' : tierActive ? (activeTimedOut ? ' active failed' : ' active') : ti === done && !blocked && !exhausted ? ' next' : '') + '">' +
            '<span class="challenge-tier-medal" aria-hidden="true"><img src="' + d.badge + '" alt=""><i>' + ['Ⅰ', 'Ⅱ', 'Ⅲ'][ti] + '</i></span>' +
            '<div><b>' + td.label + '</b><span>' + tierState + '</span></div><small>' + tierRule + '</small>' +
            '<em>奖励：' + d.rewards[ti] + '</em></div>';
        }
        h += '</div>';
      } else {
        h += '<div class="challenge-reward"><small>永久奖励</small><b>' + d.reward + '</b></div>';
      }

      if (exhausted) {
        h += '<footer class="challenge-card-foot"><span>奖励已永久生效，此挑战入口已关闭。</span></footer>';
      } else if (isActive) {
        h += '<footer class="challenge-card-foot"><span>' + (activeTimedOut ? '已超时；重开本周目后可重试，档位不会消耗。' : '本轮限制生效中。通关后领取当前档奖励。') +
          '</span><button class="btn" disabled>' + (activeTimedOut ? '本档已超时' : '本轮挑战中') + '</button></footer>';
      } else if (blocked) {
        h += '<footer class="challenge-card-foot"><span>先完成或重开当前挑战周目。</span><button class="btn" disabled>暂不可开始</button></footer>';
      } else {
        h += '<footer class="challenge-card-foot"><span>首次通关本档：轮回点获取永久 +10%。</span>' +
          '<button class="btn challenge-start" type="button" data-challenge-start="' + d.id + '">结算并挑战 · ' + d.tiers[next].label + '</button></footer>';
      }
      h += '</article>';
    }
    h += '</section><div class="challenge-footnote">挑战奖励跨周目保留。挑战失败或主动重开不会消耗档位，也不会领取奖励。</div>';
    return h;
  }

  parts.paneChallenges = paneChallenges;
})(typeof window !== 'undefined' ? window : globalThis);
