/* 天壳 / SHELLBREAK — TapTap 成就封装
 *
 * 环境内置全局对象 `tap`（TapTap 运行时自带，无需引入 SDK）。
 * 关键 API：tap.createAchievementManager({ toastEnable }) → 实例；
 *   mgr.registerListener({ onAchievementSuccess, onAchievementFailure })；
 *   mgr.unlockAchievement({ achievementId }) —— 解锁（平台侧幂等，重复调用不报错）。
 *
 * 成就 ID 由 TapTap 后台「游戏服务 → 成就」创建后回填到 SB.CFG.ACHV
 *   （MCP 无建成就工具，只能后台手建；见 assets/achievements/ 的填报清单）。
 *
 * ── 与 rank.js / ad.js 同一套边界纪律（2026-10-15）──────────────────────
 *   生产环境**无 tap 或成就 ID 为空 ⇒ 不调用、绝不"假装成功"**。
 *   降级只发生在 URL 显式带 ?achvtest 时（与 ?ranktest / ?adtest 同一约定）。
 *
 * ── 解锁时机（本模块只做判定，不散落各处）──────────────────────────────
 *   ① 首次轮回：第一次「合格破壳结算」即解锁（靠 meta.achievements 去重）。
 *   ② 挑战通关：仅当该挑战**最高档**完成时解锁 —— 多档挑战（科文 / 深渊）
 *      按「完成最高档」口径各记一条，中间档不单独出成就。
 *   由 prestige.doBreak 在合格轮回分支调用 SB.achv.onBreak(r, meta)。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG || {};
  var mgr = null;
  var inited = false;

  /* 5 条成就定义。键必须与 SB.CFG.ACHV 一致（改键名两处同改）。
   * name 仅用于本地日志与填报清单对照；正式文案在 TapTap 后台填。 */
  var DEFS = [
    { key: 'cold',         name: '寒流禁火' },
    { key: 'small',        name: '小国寡民' },
    { key: 'science',      name: '忽视科文' },
    { key: 'abyss',        name: '深渊重压' },
    { key: 'firstRebirth', name: '首次轮回' }
  ];

  function achvCfg() { return (CFG && CFG.ACHV) || {}; }

  /* dev 兜底开关：只有 URL 显式带裸 flag `achvtest` 才为真（取最严一侧）。 */
  function devMode() {
    try { return !!(root.location && /[?&]achvtest\b(?!=)/.test(root.location.search)); }
    catch (e) { return false; }
  }
  function haveTap() {
    var t = root.tap;
    return !!(t && typeof t.createAchievementManager === 'function');
  }

  /* ID 合法性：必须是非空字符串且不等于 '0'（与 rank.idOf 同一条防线）。
   * 占位值（'' / '0' / 对象 / 数字）一律视为「未回填」⇒ 跳过解锁。 */
  function idOf(key) {
    var v = achvCfg()[key];
    if (typeof v !== 'string' || !v || v === '0') return '';
    return v;
  }
  function readyKeys() {
    var out = [];
    for (var i = 0; i < DEFS.length; i++) if (idOf(DEFS[i].key)) out.push(DEFS[i].key);
    return out;
  }
  function missingKeys() {
    var out = [];
    for (var i = 0; i < DEFS.length; i++) if (!idOf(DEFS[i].key)) out.push(DEFS[i].key);
    return out;
  }

  function getMgr() {
    if (!haveTap()) return null;
    if (!mgr) {
      try {
        mgr = root.tap.createAchievementManager({ toastEnable: true });
        if (mgr && typeof mgr.registerListener === 'function') {
          mgr.registerListener({
            onAchievementSuccess: function (res) { if (root.console) root.console.log('[achv] 解锁成功', res); },
            onAchievementFailure: function (code, msg) { if (root.console) root.console.warn('[achv] 解锁失败', code, msg); }
          });
        }
      } catch (e) { return null; }
    }
    return mgr;
  }

  function init() {
    if (inited) return;
    inited = true;
    if (root.console && devMode()) {
      var m = missingKeys();
      if (m.length) root.console.warn('[achv] 未回填成就ID（这些会被跳过）:', m.join(', '));
      else root.console.log('[achv] 已回填成就:', readyKeys().join(', '));
    }
  }

  /* 控件/上报是否可用：dev 恒真；生产环境需 tap + 至少一个合法 ID。 */
  function available() {
    if (devMode()) return true;
    return !!(haveTap() && readyKeys().length > 0);
  }

  /* 解锁单条成就。
   * 返回 true = 本次真的发出（或 dev 模拟发出）；false = 未回填 / 无 SDK / 异常 ⇒ 调用方可重试。 */
  function unlock(key) {
    var id = idOf(key);
    if (!id) return false;
    if (devMode()) { if (root.console) root.console.log('[achv] (?achvtest) 模拟解锁', key, id); return true; }
    var m = getMgr();
    if (!m || typeof m.unlockAchievement !== 'function') return false;
    try {
      m.unlockAchievement({ achievementId: id });
      if (root.console) root.console.log('[achv] 请求解锁', key);
      return true;
    } catch (e) { if (root.console) root.console.warn('[achv] 解锁异常', key, e); return false; }
  }

  /* 破壳结算钩子：由 prestige.doBreak 在「合格轮回」分支调用。
   * ⛔ 只在 unlock 真的发出时才写 meta.achievements —— 这样「ID 尚未回填」时不会
   *   把已解锁状态错记成已完成，玩家回填 ID 后的下一次破壳仍能补发（对老玩家宽限）。 */
  function onBreak(report, meta) {
    if (!meta) return;
    var done = meta.achievements || (meta.achievements = {});
    if (!done.firstRebirth && unlock('firstRebirth')) done.firstRebirth = true;
    var clr = report && report.challengeClear;
    if (clr && SB.challenges && !done[clr.id]) {
      var d = SB.challenges.byId(clr.id);
      if (d && clr.tier === d.tiers.length - 1 && unlock(clr.id)) done[clr.id] = true;
    }
  }

  SB.achv = {
    init: init, unlock: unlock, onBreak: onBreak, available: available,
    readyKeys: readyKeys, missingKeys: missingKeys, devMode: devMode,
    _reset: function () { mgr = null; inited = false; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
