/* 天壳 / SHELLBREAK — 玩家动作：建造与研究 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  function buildingById(id) {
    for (var i = 0; i < SB.BUILDINGS.length; i++) if (SB.BUILDINGS[i].id === id) return SB.BUILDINGS[i];
    return null;
  }

  /* 聚落名字：随纪元演进（家在长大：兽居 → 厝 → 镇 → 城 → 国）。
   * 纯显示层，s.era 在存档里现成（见 state.js），零迁移。
   * 命名与纪元 motto 咬合：
   *   一·暗流「摸到石头」→ 巢穴（开局兽居，教学文案不动）
   *   二·冷焰「第一次有光」→ 灯火山厝（有火有光，搬进厝）
   *   三·硫泉「材料革命」→ 锻火镇（精铁够用，出锻造业）
   *   四·洋流「借力」→ 潮机城（整座礁当一台机器）
   *   五·破壳「工业化」→ 渊海之国（2026-10-05 用户拍板：壳将破、往外走的国） */
  var HABITAT_NAMES = { 1: '巢穴', 2: '灯火山厝', 3: '锻火镇', 4: '潮机城', 5: '渊海之国' };
  function habitatName(s) {
    var e = (s && s.era) || 1;
    return HABITAT_NAMES[e] || HABITAT_NAMES[1];
  }

  // 前置建筑：未满足则灰掉（提示而非静默失败）
  function needMet(s, b) { return !b.need || s.lvl[b.need] > 0; }

  /* 科技解锁的建筑：由 techs.js 各项 eff.unlockBuild 反查一张「建筑 id → 解锁它的科技 id」表。
   *
   * ⚠️ 上一版这段注释写的是「解锁来源只有一处」，**那是错的**，而且是最危险的一种错——
   * 注释说的是一套、代码做的是另一套。真相是 `unlocked()` 里**两道都查**：
   *   ① 建筑身上的 `requiredTech`（下面第 56 行那一段）
   *   ② 这里的反查 `techOpensBuild`（第 61 行）
   * 于是「两边都写」不是冗余而是**叠加**：两边写成不同科技时，玩家得研究两项才解锁，
   * 而 lockReason 只报其中一项 ⇒ 教科书式的「研究完还是灰的」。
   * 现状有 4 座建筑是双写且一致的（保温巢/压舱仓/礁石平台/热泉炉），
   * 有 3 座只写一边（聆听巢、祭坛写在建筑侧；热泉井写在科技侧）——都还能跑。
   * 【为什么不一刀切删掉建筑侧那份】聆听巢（历法）与祭坛（破冰工程学）目前全靠建筑侧那一份
   * 撑着，删了就得把解锁搬到科技表去，动 5 处定义。所以保留双写，
   * 一致性交给 `sim/e2e.mjs`「建筑解锁来源」那三条静态断言守住——改一处忘另一处会立刻红。 */
  var BUILD_TECH = {};
  function buildTechOf(bid) {
    if (!BUILD_TECH[bid] && SB.TECHS) {
      for (var i = 0; i < SB.TECHS.length; i++) {
        var e = SB.TECHS[i].eff;
        if (e && e.unlockBuild && e.unlockBuild.indexOf(bid) >= 0) BUILD_TECH[bid] = SB.TECHS[i].id;
      }
    }
    return BUILD_TECH[bid] || null;
  }
  function techOpensBuild(s, bid) {
    var tid = buildTechOf(bid);
    return !tid || !!s.techs[tid];
  }
  function techNameOf(tid) {
    if (!SB.TECHS) return null;
    for (var i = 0; i < SB.TECHS.length; i++) if (SB.TECHS[i].id === tid) return SB.TECHS[i].name;
    return null;
  }
  /* 市政名（2026-09-28 · requiredCivic 的解锁理由要用）。与 techNameOf 同型：
   * 找不到返回 null —— 调用方会退化成显示 id，至少不会把 undefined 印给玩家看。 */
  function civicNameOf(cid) {
    if (!SB.CIVICS) return null;
    for (var i = 0; i < SB.CIVICS.length; i++) if (SB.CIVICS[i].id === cid) return SB.CIVICS[i].name;
    return null;
  }

  /* 解锁判定：四种机制并存，照抄猫国建设者 js/buildings.js 的 Spec（315-319 行）与
   * game.js:6119 的判定 `item.val >= item.unlockScheme.threshold`。
   *   ① defaultUnlockable —— 挂了它就永远可建（本作只有 kelp，即猫国的猫薄荷田）
   *   ② requiredTech      —— 科技前置（科技树 eff.unlockBuild 经 techOpensBuild 反查，也走这条）
   *   ③ unlockScheme      —— 某资源持有量达到阈值
   * need（建筑前置）不在这里：它是加工链的物理依赖，跟解锁是两回事。
   * ⚠️ 2026-10-05 用户拍板：**移除 unlockRatio（库存达首级价 30% 才「露头」）**。
   *    解锁只认科技/资源门槛，不再为「还没攒够 30% 造价」藏整行——研究完科技就立刻能看到、只是买不起。 */
  /* 退役判定：被 `retiredBy` 指向的建筑已建成 ⇒ 本建筑退休。
   * ⚠️ 2026-10-06：城堡「真升级」实施过程中曾用这个机制让议事厅在城堡建成后整行隐藏，
   *   **现已撤回**（城堡不是第二座建筑，只是议事厅的新名字 ⇒ 没有退役这回事）。
   *   函数与导出**留着**：它是 BUILDINGS 表上合法的可选字段位，将来真有建筑被取代时直接可用；
   *   表里目前没有任何建筑写 `retiredBy`（e2e 有断言守着这一点）。 */
  function retired(s, b) {
    return !!(b && b.retiredBy && s && s.lvl && (s.lvl[b.retiredBy] || 0) > 0);
  }
  function unlocked(s, b) {
    if (b.defaultUnlockable) return true;
    if (retired(s, b)) return false;
    /* 默认锁着。猫国的 `unlockable` 在 Spec 里是 MANDATORY（必填），
     * 漏写等于「忘了决定」。这里同样：没声明任何解锁条件的建筑一律不出现，
     * 否则一个只写了 need 的建筑（比如祭坛）会直接躺在开局列表里。 */
    if (!b.requiredTech && !b.unlockScheme && !b.requiredCivic) return false;
    if (b.requiredTech) {
      for (var i = 0; i < b.requiredTech.length; i++) if (!s.techs[b.requiredTech[i]]) return false;
    }
    /* ⚠️【`requiredCivic` 是 2026-09-28 新加的解锁轴：由市政《戏剧与诗歌》解锁广场】
     *    其余建筑的解锁权都写在科技侧（requiredTech 或 eff.unlockBuild，两边双写）。
     *    广场的解锁权在市政身上，所以这里认 `requiredCivic` 这个字段名——
     *    ⚠️ 字段命中的是 `s.civics`（**已完成**），不是 `civShown`（已揭示）：
     *      揭示只打开「可以投点」那扇门，玩家还得自己花掉市政点才算数。
     *          ⇒ 这里判的是「市政点已经花出去了」，与《法典》那条 `if (c.gov && !s.gov)`
     *            同一个口径（完成才发东西，揭示只发机会）。 */
    if (b.requiredCivic && !(s.civics && s.civics[b.requiredCivic])) return false;
    /* 科技解锁：后墙。反查表不认识的新建筑默认锁着——与 requiredTech 同规则，
     * 漏声明等于「忘了决定」，玩家看到的是一座永远建不起来的建筑。 */
    if (!techOpensBuild(s, b.id)) return false;
    if (b.unlockScheme && !SB.economy.enough(s.res[b.unlockScheme.name], b.unlockScheme.threshold)) return false;
    return true;
  }

  /* 「露头」永久化（用户 2026-09-25：露头就该一直保持）。
   * 原实现是 `lv<=0 && !unlocked()` 就整行不渲染，于是玩家一花钱把库存压到阈值以下，
   * 刚冒出来的建筑会当场消失——上一次攒到 12 藻食露头的采石场，花了钱就又不见了。
   * 这里把「曾经露过一次头」记进 s.seen，UI 用 `lv>0 || seen` 判可见。
   * 猫国也是单向的：unlockable 一旦置位不会因花掉猫薄荷而回退。 */
  function reveal(s, b) {
    if (!s.seen) s.seen = {};
    s.seen[b.id] = 1;
  }

  // 给 UI 用的解锁理由：为什么要灰掉
  function lockReason(s, b) {
    if (b.requiredTech) {
      for (var i = 0; i < b.requiredTech.length; i++) {
        if (!s.techs[b.requiredTech[i]]) {
          var t = b.requiredTech[i], nm = null;
          for (var j = 0; SB.TECHS && j < SB.TECHS.length; j++) if (SB.TECHS[j].id === t) nm = SB.TECHS[j].name;
          return '需先掌握科技：' + (nm || t);
        }
      }
    }
    /* 市政墙（2026-09-28 · `requiredCivic`）：排在科技墙之后、资源墙之前——
     * 「先花 200 市政点把《戏剧与诗歌》做完」是玩家当下就能执行的，
     * 而「再攒 150 珊瑚」只是时间问题，两种都列的顺序不该让时间问题抢在前。 */
    if (b.requiredCivic && !(s.civics && s.civics[b.requiredCivic])) {
      return '需先完成市政：' + civicNameOf(b.requiredCivic);
    }
    /* 王国潮道的跨建筑钳制：与 build() 同一条判定（两边不同源就会出现「按钮亮着点了没反应」）。 */
    if (b.id === 'canal' && (s.lvl.canal || 0) >= (s.lvl.lighthouse || 0)) {
      return '等级不能超过灯塔（当前灯塔 ' + (s.lvl.lighthouse || 0) + ' 级）';
    }
    if (b.unlockScheme && !SB.economy.enough(s.res[b.unlockScheme.name], b.unlockScheme.threshold)) {
      return SB.RESS[b.unlockScheme.name].name + ' ' + Math.floor(s.res[b.unlockScheme.name]) +
        ' / ' + b.unlockScheme.threshold;
    }
    /* 解锁理由按「从硬到软」报：科技与纪元是明确的墙，资源量只是时间问题。 */
    var tid = buildTechOf(b.id);
    if (tid && !s.techs[tid]) return '需先掌握科技：' + techNameOf(tid);
    if (b.requiredTech) {
      for (var i2 = 0; i2 < b.requiredTech.length; i2++) {
        if (!s.techs[b.requiredTech[i2]]) {
          var tn = techNameOf(b.requiredTech[i2]);
          return '需先掌握科技：' + (tn || b.requiredTech[i2]);
        }
      }
    }
    return null;
  }

  function build(s, id, emit) {
    var b = buildingById(id);
    if (!b || !unlocked(s, b)) return false;
    if (!needMet(s, b)) return false;
    var c = SB.economy.costOf(s, id);
    if (!SB.economy.canAfford(s, c)) return false;
    /* 王国潮道（2026-09-30 · 市政《行政部门》解锁2）：等级 ≤ 灯塔等级（规格原文）。
     * 这是全仓第一条**跨建筑**等级钳制——灯塔 0 级时潮道一座都建不起来。
     * ⚠️ 判定读 s.lvl 而不是建筑定义，灯塔没有等级上限，两边永远同源。 */
    if (id === 'canal' && (s.lvl.canal || 0) + 1 > (s.lvl.lighthouse || 0)) return false;
    SB.economy.pay(s, c);
    s.lvl[id]++;
    /* ⚠️ 这里**没有**「建城堡时把议事厅等级并过去」的转移逻辑——那是被撤回的误读。
   *   城堡 = 议事厅买下工坊升级 `upg_castle` 之后的新名字（render 改显示名），
   *   两者是同一座建筑、同一个 lvl.hall，不存在两座之间的等级搬运。 */
    reveal(s, b);
    // 建造不再直接削壳：壳厚只由「系数驱动的持续削壳」表达，
    // 建造的贡献体现在 lvlSum 推高破壳系数上。这样玩家看得到因果，而不是看到一次跳变。
    if (emit) emit('建成 ' + b.name + ' ×' + s.lvl[id] + '，破壳系数 ' + SB.shell.breakCoef(s).toFixed(2));
    return true;
  }

  /* 研究。判定与扣费都交给 tech.js（已揭示 / 前置 / 纪元闸门 / 扣科技），
   * 这里只做一层转发——两边各判一遍就会出现「面板说能研究、点了没反应」。 */
  function study(s, id, emit) {
    if (!SB.tech) {                       // tech.js 未加载时的兜底，避免整局假死
      var t = null;
      for (var i = 0; SB.TECHS && i < SB.TECHS.length; i++) if (SB.TECHS[i].id === id) t = SB.TECHS[i];
      if (!t || s.techs[id] || !SB.economy.enough(s.res.science, t.cost)) return false;
      s.res.science -= t.cost; s.techs[id] = true;
      if (emit) emit('研究完成：' + t.name);
      return true;
    }
    return SB.tech.study(s, id, emit);
  }

  /* 生息区自动升级（2026-09-30 用户规格 · 市政《封建主义》解锁2）：
   *   「解锁生息区建筑自动升级，可一一选择开关」。开关逐建筑放 s.autoUpg[id]
   *   （state 初始化空表），执行语义 = **「买得起就买一级」**——与手动点建造走同一条
   *   build() 通道（解锁/前置/钳制/扣费全复用，自动与手动不可能出现两套规则）。
   * ⚠️ 调用点只在**在线**泵（game.js 的 2 秒周期）：离线补算只结算产出、不替玩家花
   *   资源——这是「离线闸门」同一精神；玩家回来看到的存档不该被后台偷偷改。
   * ⚠️ 2 秒一拍而不是每 tick：每 tick 买会把玩家攒着的缓冲资源瞬间烧穿，2 秒的颗粒度
   *   让玩家还能抢在自动升级前面把资源留给大件。 */
  function autoTick(s, emit) {
    if (!s || !s.civics || !s.civics.feudalism || !s.autoUpg) return;
    for (var i = 0; i < SB.BUILDINGS.length; i++) {
      var b = SB.BUILDINGS[i];
      if (b.zone !== 'food' || !s.autoUpg[b.id]) continue;
      build(s, b.id, emit);
    }
  }

  SB.habitat = {
    buildingById: buildingById, build: build, study: study,
    needMet: needMet, unlocked: unlocked, lockReason: lockReason, reveal: reveal,
    /* retired（2026-10-06）：render 的可见性判定要用它滤掉已退役建筑的常驻行，
     *   与 unlocked() 里的那一判同源（同一个函数）。 */
    retired: retired,
    autoTick: autoTick, habitatName: habitatName
  };
})(typeof window !== 'undefined' ? window : globalThis);
