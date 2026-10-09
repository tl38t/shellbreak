/* 渊海天壳 / SHELLBREAK — TapTap 排行榜封装
 *
 * 环境内置全局对象 `tap`（TapTap 运行时自带，无需引入 SDK）。
 * 关键 API：tap.getLeaderboardManager() → 实例；
 *   mgr.submitScores({ scores:[{leaderboardId, score}], callback }) —— **单次最多 5 条**；
 *   mgr.openLeaderboard({ leaderboardId, collection:"public", callback })。
 *
 * 榜 ID 由 MCP `create_leaderboard` 在**天壳应用**上创建后回填到 SB.CFG.RANK.LB。
 *
 * ── 参数真值（MCP create_leaderboard 的 schema，不是猜的）────────────────
 *   scoreType : 'numeric' | 'time'  （time = 时间榜）
 *   scoreOrder: 'desc'(高→低) | 'asc'(低→高)   ← asc = 越快越靠前
 *   calcType  : 'sum' | 'best' | 'latest'     ← best = 取历史最好一局
 *   ⚠️ score 必须是**整数**（平台文档明写 Integer）⇒ 时间榜只能提交整秒。
 *   错误码：500001 榜 ID 不存在 / 500002 参数错 / 500199 条数超 5。
 *
 * ── 与 ad.js 同一套边界纪律（2026-10-07）────────────────────────────────
 *   生产环境**无 SDK 或榜 ID 为空 ⇒ 不提交、入口不显示**，绝不"假装成功"。
 *   降级只发生在 URL 显式带 ?ranktest 时（与 ?adtest 同一套约定）。
 *
 * ── 为什么有两个时间口径（不是重复，是两件事）───────────────────────────
 *   S.wallT      墙钟秒，**不吃倍速** ⇒ 用于两个时间榜。
 *                离线挂机照算进去（游戏本就支持离线补算，那段时间确实在推进文明）。
 *   religionWall 建立宗教（解锁轮回系统）那一刻的 wallT 快照 ⇒ 「最快建立文明」。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG || {};
  var mgr = null;
  var inited = false;

  /* 单次提交上限 5 条，平台硬限制（错误码 500199）。 */
  var MAX_BATCH = 5;

  function rankCfg() { return (CFG && CFG.RANK) || { LB: {}, MAP: {} }; }
  function lbMap() { return rankCfg().LB || {}; }
  function meta() { return rankCfg().MAP || {}; }

  function devMode() {
    try { return !!(root.location && /[?&]rank(test)?\b/i.test(root.location.search)); }
    catch (e) { return false; }
  }
  function haveTap() {
    var t = root.tap;
    return !!(t && typeof t.getLeaderboardManager === 'function');
  }
  function getMgr() {
    if (!haveTap()) return null;
    if (!mgr) {
      try { mgr = root.tap.getLeaderboardManager(); } catch (e) { return null; }
    }
    return mgr;
  }

  /* ⛔ 榜 ID 合法性校验（2026-10-07，探针抓到的真bug 的防线）。
   * config 里曾把未回填的榜写成 `cycle: {}` —— `{}` 是 **truthy**，
   * 而 `if (lb[k])` 会据此判定「已回填」⇒ 拿一个对象当 leaderboardId 发请求 ⇒ 报 500001。
   * 与广告 `SPACE_ID: ''` 是同构的坑（占位值不是空串）。
   * ⇒ 判据不写 `if (lb[k])`，而是「必须是非空字符串」。这样任何对象/数字/数组占位
   *   都会退化成「未回填」而不是「已回填」。 */
  function idOf(k) {
    var v = lbMap()[k];
    /* ⚠️ 字符串 '0' 也是 truthy，但它显然不是合法榜 ID（平台会报 500001）⇒ 一并拒。
     *   判据：必须是非空字符串，且不等于 '0'。 */
    if (typeof v !== 'string' || !v) return '';
    if (v === '0') return '';
    return v;
  }

  function readyKeys() {
    var out = [];
    for (var k in meta()) {
      if (!Object.prototype.hasOwnProperty.call(meta(), k)) continue;
      if (idOf(k)) out.push(k);           // 只收有合法 ID 的
    }
    return out;
  }
  function missingKeys() {
    var out = [];
    for (var k in meta()) {
      if (!Object.prototype.hasOwnProperty.call(meta(), k)) continue;
      if (!idOf(k)) out.push(k);
    }
    return out;
  }

  function init() {
    if (inited) return;
    inited = true;
    if (root.console && devMode()) {
      var m = missingKeys();
      if (m.length) root.console.warn('[rank] 未回填榜ID（这些榜会被跳过）:', m.join(', '));
      else root.console.log('[rank] 已回填榜:', readyKeys().join(', '));
    }
  }

  /* 控件是否该出现。生产环境需 SDK + **至少一个**榜 ID。 */
  function available() {
    if (devMode()) return true;
    return !!(haveTap() && readyKeys().length > 0);
  }

  /* 把游戏内值翻译成平台要的整数分数。
   * ⛔ 返回 null 的情况一律**跳过提交**（宁可这一局没上榜，也不发脏数据）：
   *   null / undefined / 布尔 / 非数字 / 负数 / NaN / Infinity。
   * ⚠️ 为什么把 **0** 也归为「跳过」：0 分意味着从没玩过，或上游根本没取到值，
   *   挂在榜尾比不挂更糟，而且会掩盖真 bug（字段名写错 / 存档迁移漏键）。
   * ⚠️ 一律 Math.floor：平台只收 integer，小数交给平台丢的话丢的方向不可控。 */
  function toScore(v) {
    if (v === null || v === undefined || typeof v === 'boolean') return null;
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }

  /* 提交一局的成绩。entries = [{key:'fastest', value: 1234}, ...]
   * 内部会剔掉未回填 ID 的项、剔掉非法值，再按 MAX_BATCH 截断。
   * onDone(doneCount, sentCount) —— done 是「有多少项算得出成绩」，
   *   sent 是「真正发出去几条」（两者不等就说明有榜被跳过或被截断）。 */
  function submitRun(entries, onDone) {
    var mgr2 = getMgr();
    var done = 0, scores = [];
    for (var i = 0; i < (entries || []).length; i++) {
      var e = entries[i];
      if (!e || !e.key) continue;
      var id = idOf(e.key);
      if (!id) continue;                                  // 该榜未回填（或占位值非法）
      var sc = toScore(e.value);
      if (sc === null) { if (root.console) root.console.warn('[rank] 非法分数，已跳过', e.key, e.value); continue; }
      scores.push({ leaderboardId: id, score: sc });
      done++;
    }
    if (scores.length > MAX_BATCH) scores = scores.slice(0, MAX_BATCH);
    if (devMode()) {
      if (root.console) root.console.log('[rank] (?ranktest) 模拟提交', JSON.stringify(scores));
      if (onDone) onDone(done, scores.length);
      return;
    }
    if (!mgr2) { if (onDone) onDone(done, 0); return; }
    if (!scores.length) { if (onDone) onDone(0, 0); return; }
    try {
      mgr2.submitScores({
        scores: scores,
        callback: {
          onSuccess: function (res) {
            if (root.console) root.console.log('[rank] 提交成功', scores.length, '条', res);
            if (onDone) onDone(done, scores.length);
          },
          onFailure: function (code, msg) {
            if (root.console) root.console.warn('[rank] 提交失败', code, msg);
            if (onDone) onDone(done, 0);
          }
        }
      });
    } catch (e) {
      if (root.console) root.console.warn('[rank] 提交异常', e);
      if (onDone) onDone(done, 0);
    }
  }

  /* 打开排行榜 UI。key 缺省时打开第一个可用榜。
   * collection: 'public' 全平台总榜 / 'friend' 好友榜。 */
  function open(key, collection) {
    var m = getMgr();
    var id = (key && idOf(key)) || idOf(readyKeys()[0]);
    if (!id) { if (root.console) root.console.warn('[rank] 没有可打开的榜'); return false; }
    if (!m) return false;
    try {
      m.openLeaderboard({
        leaderboardId: id,
        collection: collection || 'public',
        callback: {
          onSuccess: function () {},
          onFailure: function (code, msg) { if (root.console) root.console.warn('[rank] 打开失败', code, msg); }
        }
      });
      return true;
    } catch (e) { return false; }
  }

  /* 时间榜的展示格式化（分数是整秒）。UI 用；不参与提交。 */
  function fmtSeconds(sec) {
    var s = Math.max(0, Math.floor(Number(sec) || 0));
    var d = Math.floor(s / (rankCfg().SECONDS_PER_DAY || 86400));
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var ss = s % 60;
    if (d > 0) return d + ' 天 ' + h + ' 小时';
    if (h > 0) return h + ' 小时 ' + m + ' 分';
    if (m > 0) return m + ' 分 ' + ss + ' 秒';
    return ss + ' 秒';
  }

  SB.rank = {
    init: init,
    submitRun: submitRun,
    open: open,
    available: available,
    devMode: devMode,
    readyKeys: readyKeys,
    missingKeys: missingKeys,
    fmtSeconds: fmtSeconds,
    toScore: toScore,
    _reset: function () { mgr = null; inited = false; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
