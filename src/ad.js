/* 天壳 / SHELLBREAK — TapTap 激励视频广告封装
 * 环境内置全局对象 `tap`（TapTap 小游戏运行时自带，无需引入 SDK）。
 * 关键 API：tap.createRewardedVideoAd({ adUnitId }) → 实例；
 *   实例.onClose(res => res.isEnded) 判定是否看完；附 onError / onLoad / load() / show()。
 * 真实 space_id（广告位 ID）由 MCP get_ad_integration_guide 注入到 SB.CFG.AD.SPACE_ID。
 *
 * ⚠️ dev 兜底的边界（2026-10-07 收紧）：兜底**只在 URL 显式带 ?adtest 时**生效。
 *   原因：原先「无 tap 或 SPACE_ID 为空 ⇒ 直接发奖」，而 SPACE_ID 要等天壳应用建好、
 *   广告位开通后才能取回——那之前线上点一下就白拿 30min 2×，等于白送加速。
 *   现在生产环境无广告位时一律走 onSkip（不发奖），控件由 available() 隐藏。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG || {};
  var ad = null;          // 激励视频实例（只建一次）
  var pending = null;     // 当前这次展示的回调
  var inited = false;

  function spaceId() { return (CFG.AD && CFG.AD.SPACE_ID) || ''; }
  /* dev 兜底开关：只有 URL **显式**带裸 flag `adtest` 才为真。
   * ⚠️ 这里必须是 `adtest` 整词，不能写成 `ad(test)?` —— 后者让 `?ad` / `?add`
   *   这类正常 query 也命中，等于任何人加个参数就能白拿30min 2×（2026-10-07 修）。
   *   `(?!=)` 再堵一层：只认裸 flag（`?adtest` / `?a=1&adtest`），
   *   任何带值形式（`?adtest=0` / `?adtest=1` / `?adtest=false`）一律算**关闭**
   *   —— 取最严的一侧，不留「=1 也能开」的绕路。 */
  function devMode() {
    try { return !!(root.location && /[?&]adtest\b(?!=)/.test(root.location.search)); }
    catch (e) { return false; }
  }
  function haveTap() {
    var t = root.tap;
    return !!(t && typeof t.createRewardedVideoAd === 'function');
  }

  function makeAd() {
    var sid = spaceId();
    if (!haveTap() || !sid) return null;
    try {
      var a = root.tap.createRewardedVideoAd({ adUnitId: sid });
      a.onLoad(function () {});
      a.onError(function (err) {
        if (root.console) root.console.warn('[ad] rewarded video error', err && err.errCode, err && err.errMsg);
      });
      a.onClose(function (res) {
        var cb = pending; pending = null;
        if (res && res.isEnded) { if (cb && cb.onReward) cb.onReward(); }
        else if (cb && cb.onSkip) cb.onSkip();
      });
      var p = a.load();
      if (p && typeof p.catch === 'function') p.catch(function () {});
      return a;
    } catch (e) { return null; }
  }

  function init() {
    if (inited) return;
    inited = true;
    if (haveTap() && spaceId()) ad = makeAd();   // 无环境则留空，等 show 时走兜底
  }

  /* 展示激励视频。onReward 看完发奖；onSkip 中途退出 / 广告不可用（不发奖）。
   * ⚠️ 只有 ?adtest 才走 dev 兜底直接发奖；生产环境无 tap 或无 space_id ⇒ 走 onSkip。 */
  function show(onReward, onSkip) {
    if (devMode()) { if (onReward) onReward(); return; }
    if (!haveTap() || !spaceId()) {
      if (root.console) root.console.warn('[ad] 广告不可用（无 SDK 或未配置 SPACE_ID），本次不发奖');
      if (onSkip) onSkip('unavailable');
      return;
    }
    if (!ad) ad = makeAd();
    if (!ad) { if (onSkip) onSkip('init-failed'); return; }
    pending = { onReward: onReward, onSkip: onSkip };
    try {
      var r = ad.show();
      if (r && typeof r.catch === 'function') {
        r.catch(function () { try { ad.load(function () { ad.show(); }); } catch (e2) {} });
      }
    } catch (e) {
      try { ad.load(function () { ad.show(); }); } catch (e2) { pending = null; if (onSkip) onSkip('show-failed'); }
    }
  }

  /* 控件是否该出现：dev 模式恒 true（本地可调试）；生产环境需同时有 SDK 与 space_id。 */
  function available() {
    if (devMode()) return true;
    return !!(haveTap() && spaceId());
  }

  SB.ad = {
    init: init,
    show: show,
    available: available,
    devMode: devMode,
    _reset: function () { ad = null; pending = null; inited = false; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
