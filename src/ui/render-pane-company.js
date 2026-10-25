/* 天壳 / SHELLBREAK — 公司页渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function paneCompany() {
    var s = SB.game.run();
    if (!s || !(s.civics && s.civics.macroeconomics)) return paneCompanyLocked();
    if (!SB.COMPANIES) return '<div class="company-empty">公司数据未加载</div>';
    var h = '<div class="company-grid">';

    for (var i = 0; i < SB.COMPANIES.length; i++) {
      var c = SB.COMPANIES[i];
      var companyIcon = '<img class="company-icon" src="assets/company-icons/' + c.id + '.png" alt="" aria-hidden="true" width="36" height="36" loading="lazy" decoding="async">';
      /* 名字查 res 优先、id 兜底：新档按 res 键，旧档按 id 键。 */
      var nm = (s.companyNames && (s.companyNames[c.res] || s.companyNames[c.id])) || '（未命名）';
      var st = (SB.companyState ? SB.companyState(s, c.res) : null);
      var active = !!(st && st.epoch > 0 && !st.closed);
      var reqMet = SB.companyReqMet ? SB.companyReqMet(s, c) : true;
      var tiers = c.tiers || SB.COMPANY_TIERS || [];

      if (active) {
        var elapsed = Math.max(0, (s.t || 0) - st.epoch);
        var idx = SB.companyTierIndex ? SB.companyTierIndex(elapsed, tiers, s) : 0;
        var tier = (idx >= 0 && tiers[idx]) ? tiers[idx] : tiers[0];
        var nextTier = (idx >= 0 && idx + 1 < tiers.length) ? tiers[idx + 1] : null;
        var companyBonusMul = (SB.civic && SB.civic.cardCompanyBonusMul) ? SB.civic.cardCompanyBonusMul(s) : 1;
        var bonus = ((tier && tier.bonus) || 0) * companyBonusMul;
        var luxBonus = (c.luxBonus || 0.10) * companyBonusMul;
        var action = '<button type="button" class="btn warn company-action" data-company-close="' + c.res + '" aria-label="关闭 ' + nm + '">关闭公司</button>';

        h += '<article class="company-card is-active" data-company-res="' + c.res + '">' +
          '<header class="company-card-head"><div class="company-identity">' + companyIcon +
            '<strong class="company-name">' + nm + '</strong>' +
            '<span class="tag company-sector">' + (c.label || c.res) + '</span>' +
            '<span class="tag ok company-tier">' + (tier ? tier.name : '乡镇企业') + '</span>' +
          '</div>' + action + '</header>' +
          '<div class="company-effects">' +
            '<div class="company-effect"><span>行业加成</span><strong>' + (c.outLabel || '资源产出') + ' +' + (bonus * 100).toFixed(0) + '%</strong></div>' +
            '<div class="company-effect company-lux-effect"><span>奢侈品消耗</span><strong>+' + (luxBonus * 100).toFixed(0) + '%</strong></div>' +
          '</div>';

        if (nextTier) {
          var remain = Math.max(0, nextTier.unlockSec - elapsed);
          var remainText = SB.game && SB.game.fmtDur ? SB.game.fmtDur(remain) : remain + ' 秒';
          var civicMet = !nextTier.unlockCivic || !!(s.civics && s.civics[nextTier.unlockCivic]);
          var civicName = nextTier.unlockCivic
            ? (SB.companyTierUnlockName ? SB.companyTierUnlockName(nextTier) : nextTier.unlockCivic)
            : '';
          var range = Math.max(1, nextTier.unlockSec - ((tier && tier.unlockSec) || 0));
          var progress = Math.max(0, Math.min(1, (elapsed - ((tier && tier.unlockSec) || 0)) / range));
          var progressPct = Math.round(progress * 100);
          var progressText = remain > 0
            ? ('还需运营 ' + remainText + (civicMet ? '' : ' · 还需完成市政《' + civicName + '》'))
            : (!civicMet ? ('运营时间已达标 · 待完成市政《' + civicName + '》') : '晋级条件已达成');
          var progressClass = civicMet ? '' : ' is-waiting';

          h += '<section class="company-progress' + progressClass + '" aria-label="' + nm + '晋级进度">' +
            '<div class="company-progress-head"><span>下一级</span><strong>' + nextTier.name + '</strong><span class="company-progress-pct">' + progressPct + '%</span></div>' +
            '<div class="company-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progressPct + '"><i style="width:' + progressPct + '%"></i></div>' +
            '<div class="company-progress-foot">' + progressText + '</div>' +
          '</section>';
        } else {
          h += '<div class="company-max-tier">已达最高等级</div>';
        }
        h += '</article>';
      } else if (st && st.closed) {
        h += '<article class="company-card is-closed" data-company-res="' + c.res + '">' +
          '<header class="company-card-head"><div class="company-identity">' + companyIcon +
            '<strong class="company-name">' + nm + '</strong>' +
            '<span class="tag company-sector">' + (c.label || c.res) + '</span>' +
            '<span class="tag off company-status">已解散</span>' +
          '</div>' +
          '<button type="button" class="btn company-action" data-company-rebuild="' + c.res + '">重建公司</button></header>' +
          '<div class="company-card-note">重建后从乡镇企业重新成长，并恢复该公司的行业加成。</div>' +
        '</article>';
      } else if (!reqMet) {
        var reqTxt = SB.companyReqText ? SB.companyReqText(c) : '解锁前置';
        h += '<article class="company-card is-locked" data-company-res="' + c.res + '">' +
          '<header class="company-card-head"><div class="company-identity">' + companyIcon +
            '<strong class="company-name">' + nm + '</strong>' +
            '<span class="tag company-sector">' + (c.label || c.res) + '</span>' +
            '<span class="tag off company-status">待解锁</span>' +
          '</div></header>' +
          '<div class="company-card-note">完成前置：' + reqTxt + '后自动成立。</div>' +
        '</article>';
      }
      /* 前置已满足但本趟泵尚未扫到的极短窗口，保持原行为：暂不渲染。 */
    }
    return h + '</div>';
  }

  function paneCompanyLocked() {
    return '<div class="company-locked"><div class="company-locked-title">公司网络尚未建立</div>' +
      '<div>完成市政《宏观经济学》后，系统会自动成立藻食、珊瑚等行业公司。每家公司独立成长、独立晋级。</div>' +
      '<div class="note">研究「宏观经济学」之后这一页才打开。</div></div>';
  }

  parts.paneCompany = paneCompany;
})(typeof window !== 'undefined' ? window : globalThis);
