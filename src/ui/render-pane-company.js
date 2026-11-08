/* 天壳 / SHELLBREAK — 公司页渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});
  var seedNameMaps = Object.create(null);
  var COMPANY_INDUSTRY = {
    algae: 'kelp', coral: 'coral', craftco: 'crafting', steelco: 'steel',
    storeco: 'storage', thetaco: 'theta_metal', scico: 'research'
  };
  var COMPANY_TIER = {
    town: 'local_enterprise', local: 'regional_enterprise', national: 'national_corporation',
    planetary: 'planetary_lifeline', cosmic: 'cosmic_megacorp'
  };

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
  function industryKey(company) {
    return COMPANY_INDUSTRY[company && company.id] || '';
  }
  function industryText(company, field) {
    var slug = industryKey(company);
    var fallback = field === 'name' ? (company.label || company.res) : (company.outLabel || company.res);
    return slug ? tr('company.industry.' + slug + '.' + field, null, fallback) : fallback;
  }
  function tierName(tier, fallback) {
    var slug = tier && COMPANY_TIER[tier.key];
    return slug ? tr('company.tier.' + slug, null, fallback || (tier && tier.name) || '') : (fallback || (tier && tier.name) || '');
  }
  function nodeName(type, id, fallback) {
    if (!englishLocale() || !id) return fallback || id || '';
    var key = type === 'tech' ? 'tech.' + id + '.name' : 'civic.data.' + id + '.name';
    return tr(key, null, fallback || id);
  }
  function requirementName(company) {
    var req = company && company.req;
    if (!req) return tr('company.prerequisite.fallback', null, '解锁前置');
    if (req.tech) {
      var tech = SB.tech && SB.tech.byId ? SB.tech.byId(req.tech) : null;
      return nodeName('tech', req.tech, tech ? tech.name : req.tech);
    }
    if (req.civic) {
      var civics = SB.CIVICS || [], civic = null;
      for (var i = 0; i < civics.length; i++) if (civics[i].id === req.civic) { civic = civics[i]; break; }
      return nodeName('civic', req.civic, civic ? civic.name : req.civic);
    }
    return tr('company.prerequisite.fallback', null, '解锁前置');
  }
  function localizedCompanyName(name, slug) {
    if (!englishLocale() || !name || !slug) return name || '';
    var map = seedNameMaps[slug];
    if (!map) {
      map = seedNameMaps[slug] = Object.create(null);
      var zh = root.ShellbreakLocales && root.ShellbreakLocales['zh-CN'] || {};
      var prefix = 'company.name.seed.' + slug + '.';
      for (var key in zh) {
        if (Object.prototype.hasOwnProperty.call(zh, key) && key.indexOf(prefix) === 0) map[zh[key]] = key;
      }
    }
    var nameKey = map[name];
    return nameKey ? tr(nameKey, null, name) : name;
  }
  function displayCompanyName(state, company) {
    var value = state.companyNames && (state.companyNames[company.res] || state.companyNames[company.id]);
    if (!value) return tr('company.name.unnamed', null, '（未命名）');
    return localizedCompanyName(value, industryKey(company));
  }
  function tierProgressLabel(name) {
    return tr('company.progress.aria_label', { companyName: name }, name + ' 晋级进度');
  }

  function paneCompany() {
    var s = SB.game.run();
    if (!s || !(s.civics && s.civics.macroeconomics)) return paneCompanyLocked();
    if (!SB.COMPANIES) return '<div class="company-empty">' + tr('company.data.unavailable', null, '公司数据未加载') + '</div>';
    var h = '<div class="company-grid">';

    for (var i = 0; i < SB.COMPANIES.length; i++) {
      var c = SB.COMPANIES[i];
      var companyIcon = '<img class="company-icon" src="assets/company-icons/' + c.id + '.png" alt="" aria-hidden="true" width="36" height="36" loading="lazy" decoding="async">';
      var nm = displayCompanyName(s, c);
      var st = (SB.companyState ? SB.companyState(s, c.res) : null);
      var active = !!(st && st.epoch > 0 && !st.closed);
      var reqMet = SB.companyReqMet ? SB.companyReqMet(s, c) : true;
      var tiers = c.tiers || SB.COMPANY_TIERS || [];
      var sectorName = industryText(c, 'name');
      var outputName = industryText(c, 'output');

      if (active) {
        var elapsed = Math.max(0, (s.t || 0) - st.epoch);
        var idx = SB.companyTierIndex ? SB.companyTierIndex(elapsed, tiers, s) : 0;
        var tier = (idx >= 0 && tiers[idx]) ? tiers[idx] : tiers[0];
        var nextTier = (idx >= 0 && idx + 1 < tiers.length) ? tiers[idx + 1] : null;
        var companyBonusMul = (SB.civic && SB.civic.cardCompanyBonusMul) ? SB.civic.cardCompanyBonusMul(s) : 1;
        var bonus = ((tier && tier.bonus) || 0) * companyBonusMul;
        var luxBonus = (c.luxBonus || 0.10) * companyBonusMul;
        var action = '<button type="button" class="btn warn company-action" data-company-close="' + c.res + '" aria-label="' +
          tr('company.action.close.aria_label', { companyName: nm }, '关闭 ' + nm) + '">' +
          tr('company.action.close.button', null, '关闭公司') + '</button>';

        h += '<article class="company-card is-active" data-company-res="' + c.res + '">' +
          '<header class="company-card-head"><div class="company-identity">' + companyIcon +
            '<strong class="company-name">' + nm + '</strong>' +
            '<span class="tag company-sector">' + sectorName + '</span>' +
            '<span class="tag ok company-tier">' + tierName(tier, '乡镇企业') + '</span>' +
          '</div>' + action + '</header>' +
          '<div class="company-effects">' +
            '<div class="company-effect"><span>' + tr('company.bonus.industry', null, '行业加成') + '</span><strong>' + outputName + ' +' + (bonus * 100).toFixed(0) + '%</strong></div>' +
            '<div class="company-effect company-lux-effect"><span>' + tr('company.bonus.luxury_consumption', null, '奢侈品消耗') + '</span><strong>+' + (luxBonus * 100).toFixed(0) + '%</strong></div>' +
          '</div>';

        if (nextTier) {
          var remain = Math.max(0, nextTier.unlockSec - elapsed);
          var remainText = SB.game && SB.game.fmtDur ? SB.game.fmtDur(remain) : tr('company.progress.duration.fallback', { durationSeconds: remain }, remain + ' 秒');
          var civicMet = !nextTier.unlockCivic || !!(s.civics && s.civics[nextTier.unlockCivic]);
          var civicName = nextTier.unlockCivic
            ? nodeName('civic', nextTier.unlockCivic, SB.companyTierUnlockName ? SB.companyTierUnlockName(nextTier) : nextTier.unlockCivic)
            : '';
          var range = Math.max(1, nextTier.unlockSec - ((tier && tier.unlockSec) || 0));
          var progress = Math.max(0, Math.min(1, (elapsed - ((tier && tier.unlockSec) || 0)) / range));
          var progressPct = Math.round(progress * 100);
          var progressText = remain > 0
            ? (civicMet
              ? tr('company.progress.time_remaining', { remainingTime: remainText }, '还需运营 {remainingTime}')
              : tr('company.progress.time_and_civic_remaining', { remainingTime: remainText, civicName: civicName }, '还需运营 {remainingTime} · 还需完成市政《{civicName}》'))
            : (!civicMet
              ? tr('company.progress.civic_remaining', { civicName: civicName }, '运营时间已达标 · 待完成市政《{civicName}》')
              : tr('company.progress.requirements_met', null, '晋级条件已达成'));
          var progressClass = civicMet ? '' : ' is-waiting';

          h += '<section class="company-progress' + progressClass + '" aria-label="' + tierProgressLabel(nm) + '">' +
            '<div class="company-progress-head"><span>' + tr('company.progress.next_tier', null, '下一级') + '</span><strong>' + tierName(nextTier, nextTier.name) + '</strong><span class="company-progress-pct">' + progressPct + '%</span></div>' +
            '<div class="company-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progressPct + '"><i style="width:' + progressPct + '%"></i></div>' +
            '<div class="company-progress-foot">' + progressText + '</div>' +
          '</section>';
        } else {
          h += '<div class="company-max-tier">' + tr('company.progress.max_tier', null, '已达最高等级') + '</div>';
        }
        h += '</article>';
      } else if (st && st.closed) {
        h += '<article class="company-card is-closed" data-company-res="' + c.res + '">' +
          '<header class="company-card-head"><div class="company-identity">' + companyIcon +
            '<strong class="company-name">' + nm + '</strong>' +
            '<span class="tag company-sector">' + sectorName + '</span>' +
            '<span class="tag off company-status">' + tr('company.status.closed', null, '已解散') + '</span>' +
          '</div>' +
          '<button type="button" class="btn company-action" data-company-rebuild="' + c.res + '">' + tr('company.action.rebuild', null, '重建公司') + '</button></header>' +
          '<div class="company-card-note">' + tr('company.closed.note', null, '重建后从乡镇企业重新成长，并恢复该公司的行业加成。') + '</div>' +
        '</article>';
      } else if (!reqMet) {
        var reqName = requirementName(c);
        h += '<article class="company-card is-locked" data-company-res="' + c.res + '">' +
          '<header class="company-card-head"><div class="company-identity">' + companyIcon +
            '<strong class="company-name">' + nm + '</strong>' +
            '<span class="tag company-sector">' + sectorName + '</span>' +
            '<span class="tag off company-status">' + tr('company.status.locked', null, '待解锁') + '</span>' +
          '</div></header>' +
          '<div class="company-card-note">' + tr('company.locked.prerequisites_note', { prerequisiteList: reqName }, '完成前置：' + reqName + '后自动成立。') + '</div>' +
        '</article>';
      }
      /* 前置已满足但本趟泵尚未扫到的极短窗口，保持原行为：暂不渲染。 */
    }
    return h + '</div>';
  }

  function paneCompanyLocked() {
    return '<div class="company-locked"><div class="company-locked-title">' + tr('company.locked.title', null, '公司网络尚未建立') + '</div>' +
      '<div>' + tr('company.locked.explanation', null, '完成市政《宏观经济学》后，系统会自动成立藻食、珊瑚等行业公司。每家公司独立成长、独立晋级。') + '</div>' +
      '<div class="note">' + tr('company.locked.note', null, '研究「宏观经济学」之后这一页才打开。') + '</div></div>';
  }

  parts.paneCompany = paneCompany;
})(typeof window !== 'undefined' ? window : globalThis);
