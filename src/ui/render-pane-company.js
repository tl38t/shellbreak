/* 天壳 / SHELLBREAK — 公司页渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function paneCompany() {
    var s = SB.game.run();
    if (!s || !(s.civics && s.civics.macroeconomics)) return paneCompanyLocked();
    if (!SB.COMPANIES) return '<div class="row"><div class="nm">公司数据未加载</div></div>';
    var h = '';

    for (var i = 0; i < SB.COMPANIES.length; i++) {
      var c = SB.COMPANIES[i];
      /* ⚠️ 名字查 res 优先、id 兜底：新档（pickCompanyNames 按 res 键）走 res，旧档走 id。 */
      var nm = (s.companyNames && (s.companyNames[c.res] || s.companyNames[c.id])) || '（未命名）';
      var st = (SB.companyState ? SB.companyState(s, c.res) : null);
      var active = !!(st && st.epoch > 0 && !st.closed);
      var reqMet = SB.companyReqMet ? SB.companyReqMet(s, c) : true;
      var tiers = c.tiers || SB.COMPANY_TIERS || [];

      if (active) {
        var idx = SB.companyTierIndex ? SB.companyTierIndex((s.t || 0) - st.epoch, tiers) : 0;
        var tier = (idx >= 0 && tiers[idx]) ? tiers[idx] : tiers[0];
        var tierName = tier ? tier.name : '乡镇企业';
        var bonus = (tier && tier.bonus) || 0;
        var elapsed = (s.t || 0) - st.epoch;
        var nextTier = (idx >= 0 && idx + 1 < tiers.length) ? tiers[idx + 1] : null;
        var remain = nextTier ? Math.max(0, nextTier.unlockSec - elapsed) : 0;
        var cd = nextTier
          ? ('距离升级为「' + nextTier.name + '」还需 ' + (SB.game && SB.game.fmtDur ? SB.game.fmtDur(remain) : remain + ' 秒'))
          : ('已达最高等级（' + (tier ? tier.name : '全国性企业') + '）');
        h += '<div class="row"><div><div class="nm">' + nm +
          ' <span class="tag">' + (c.label || c.res) + '</span> <span class="tag ok">' + tierName + '</span></div>' +
          '<div class="ds">' + (c.outLabel || (c.res === 'kelp' ? '藻食产出' : '珊瑚产出')) + ' +' + (bonus * 100).toFixed(0) +
          '%；奢侈品消耗恒 +10%。' + cd + '</div></div></div>';
        h += '<div class="row"><button type="button" class="btn warn" data-company-close="' + c.res + '">关闭 ' + nm + '</button></div>';
      } else if (st && st.closed) {
        h += '<div class="row"><div><div class="nm">' + nm +
          ' <span class="tag">' + (c.label || c.res) + '</span> <span class="tag off">已解散</span></div>' +
          '<div class="ds">该公司处于解散状态，不再提供任何产出加成、也不再增加奢侈品消耗。' +
          '可单独重建，从乡镇企业重新开始成长。</div></div></div>';
        h += '<div class="row"><button type="button" class="btn" data-company-rebuild="' + c.res + '">重建 ' + (c.label || c.res) + ' 公司</button></div>';
      } else if (!reqMet) {
        var reqTxt = SB.companyReqText ? SB.companyReqText(c) : '解锁前置';
        h += '<div class="row"><div><div class="nm">' + nm +
          ' <span class="tag">' + (c.label || c.res) + '</span> <span class="tag off">未解锁</span></div>' +
          '<div class="ds">尚未成立：需' + reqTxt + '后自动成立。</div></div></div>';
      }
      /* 其余：未成立且前置已满足但本趟泵尚未扫到（macro 刚点完的极短窗口），暂不渲染。 */
    }
    return h;
  }
  function paneCompanyLocked() {
    return '<div class="row"><div><div class="nm">公司页未开启</div>' +
      '<div class="ds">完成市政《宏观经济学》后，系统会自动成立多家行业公司（藻食、珊瑚等），' +
      '随成立时间成长、提供产出加成。</div></div></div>' +
      '<div class="note">研究「宏观经济学」之后这一页才打开。</div>';
  }

  parts.paneCompany = paneCompany;
})(typeof window !== 'undefined' ? window : globalThis);
