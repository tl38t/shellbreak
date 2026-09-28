/* 天壳 / SHELLBREAK —— 奇观（2026-09-27 用户拍）
 *
 * ⚠️ 与「破冰祭坛」是**两回事**，别混：
 *    · 破冰祭坛 miracle = 纪元五的持续机器（烧地热、可升多级、受 shell.miracleCap 约束）；
 *    · 奇观 wonder      = 一次性里程碑建筑（买断、永久、不重复），栏位也在别处。
 *  两者都在 habitat 的建筑列表里出现（miracle 是），但一个是产能单元、一个是纪念碑。
 *
 * 三条纪律（改这个文件前先读）：
 *  ① **买断，不是等级**。建过一次就永久生效，没有重复购买（与工坊上半区的青铜工具同形态）。
 *  ② **效果走加法**（用户 2026-09-27 拍「加法」）。两个 +5% 是 105%，不是 110.25%。
 *     形参照猫国 `js/game.js:4412 getCraftRatio`：`getEffect("craftRatio") + ...` 就是加法。
 *  ③ **只从这两个函数出效果**。别的模块要问奇观的收益，必须调 wonderCraftRatio / matMaxBonus，
 *     不许散读 s.wonders —— 散读的后果是「加了奇观忘了接线」，玩家研究完什么都没发生还查不出。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  function list() { return SB.WONDERS || []; }
  function byId(id) {
    var L = list(), i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;
  }
  function owned(s) { return (s.wonders && typeof s.wonders === 'object') ? s.wonders : {}; }

  /* ③ 奇观给市政点的那一截（**每秒绝对量**，不是乘区）。
   *    ⚠️ 为什么是绝对量而不是「市政点 +20%」：市政点总量很小（书手 0.15/人/秒），
   *       乘区的基数会随书手数量漂移 —— 开局 +20% 等于 0，后期 +20% 等于 +3/秒。
   *       里程碑建筑应该给的是「一笔看得见的量」，那就得是常数。
   *    ⚠️ 通道只有这一条：economy.cultureRate 调它，别处不许散读 s.wonders。 */
  function civicBonus(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.civic) || 0;
    }
    return m;
  }

  /* ④ 奇观给「全资源产出」的那一截（加法叠进 economy.globalMul）。
   *    ⚠️ 目前**没有奇观用这个键**（大灯塔按用户规格只给市政点与仓储，不给产出），
   *       但它必须存在：globalMul 是乘区的宿主，若没有出口，将来加一个 globalProd 的
   *       奇观时又会踩到「数据里写了、实现层没读」那类静默断链 —— 现在留一个空函数，
   *       等于把那条通道事先接通，只是暂时没人用。
   *   ⚠️ 与 matMaxBonus 的区别：matMax 是**容量**（加到 capOf 上），这里是**产出率**
   *      （乘在每条产出行上）。两者名字像，落点完全不同，别互相抄。 */
  function globalBonus(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.globalProd) || 0;
    }
    return m;
  }

  /* ① 工艺制作效率来自奇观的那一截（工坊等级那截在 workshop.js 里）。 */
  function wonderCraftRatio(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.craftRatio) || 0;
    }
    return m;
  }

  /* ② 各**材料**仓储 +200。
   * ⚠️ 只加给材料，不加石梁 —— 石梁是无上限资源（用户拍），给它加 200 是没有意义的操作。
   * ⚠️ 用**白名单**而不是「石梁之外全加」：以后加新资源时白名单会逼着人决定
   *    「新资源吃不吃这个加成」，黑名单则让人默认漏掉。 */
  var MAT_MAX_KEYS = { kelp: 1, coral: 1, stone: 1, silt: 1, warmstone: 1, iron: 1 };
  function matMaxBonus(s, k) {
    if (!MAT_MAX_KEYS[k]) return 0;
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.matMax) || 0;
    }
    return m;
  }

  SB.wonder = {
    list: list, byId: byId,
    wonderCraftRatio: wonderCraftRatio, matMaxBonus: matMaxBonus,
    civicBonus: civicBonus, globalBonus: globalBonus
  };
})(typeof window !== 'undefined' ? window : globalThis);
