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

  /* 已建成的奇观**数量**（2026-09-28 为尤里卡条件「建成一座奇观」新加）。
   * ⚠️ 统计的是数量而不是条目数 —— s.wonders 的值恒为 1（买断制，见纪律①），
   *    将来若允许同一个奇观重复建成（升星？），这里改成取和也还是对的。
   * ⚠️ 这是 `s.wonders` 除 owned() 之外的第二个读取点，且**只此一处**：
   *    别在 tech.js 或 UI 里散读 s.wonders（纪律③的延伸——散读会让「奇观的效果
   *    只从 wonder.js 出」这条纪律出现第二个例外，下一个人就照着抄了）。 */
  function count(s) {
    var o = owned(s), k, n = 0;
    for (k in o) if (o[k]) n++;
    return n;
  }

  /* 大图书馆送的**图书馆虚级**（2026-09-28 用户规格「效果是图书馆 +3 级，只加效果，
   * 不提高建筑所需材料」）。
   * ⚠️【为什么它不写进 `s.lvl.library`】虚级的语义是「**按效果算、按建筑不算**」：
   *    一旦落进 s.lvl，会被 lvlSum、need 判定、建筑总级数那几条一并读走 —— 玩家会看到
   *    「图书馆还差 1 级就能建下一级，而那一级其实早就白送了」。所以只在这里出，
   *    落到 economy 算科技产出时，与 s.lvl.library **相加**成一个查看用的合计级数。
   * ⚠️ 这是 `s.wonders` 除 owned() / count() 之外的第三个读取点，纪律③的延伸同上。 */
  function libBonus(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.libLvl) || 0;
    }
    return m;
  }

  /* 奇观的一次性奖励（2026-09-28 用户规格 · 大图书馆的「建成时一次性 +1000 科技点」）。
   * ⚠️ 与上面那些**持续效果的区别**：那几个是「每秒都有一份」，这个只在建成那一下结算。
   *    所以它没有对应的资源行，由 workshop.buildWonder 拿到 `s.wonders[id]=true`
   *    之后调一次（买断制 ⇒ 第二次会被 wonderBlocked 拦住 ⇒ 天然只发一次）。
   * ⚠️ 返回的是**待发放的清单**而不是直接扣/加——扣在调用方（与 flow() 那条
   *    「纯读数、副作用在别处」同一条纪律）。没有奖励时返回 null，调用方免判分支。 */
  function oneShot(s) {
    var out = null, i, o = owned(s), L = list(), k;
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      var g = L[i].effect && L[i].effect.grant;
      if (!g) continue;
      out = out || {};
      for (k in g) if (typeof g[k] === 'number') out[k] = (out[k] || 0) + g[k];
    }
    return out;
  }

  SB.wonder = {
    list: list, byId: byId, count: count,
    wonderCraftRatio: wonderCraftRatio, matMaxBonus: matMaxBonus,
    civicBonus: civicBonus, globalBonus: globalBonus,
    libBonus: libBonus, oneShot: oneShot
  };
})(typeof window !== 'undefined' ? window : globalThis);
