/* 天壳 / SHELLBREAK — 玩家动作：建造与研究 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  function buildingById(id) {
    for (var i = 0; i < SB.BUILDINGS.length; i++) if (SB.BUILDINGS[i].id === id) return SB.BUILDINGS[i];
    return null;
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

  /* 解锁判定：四种机制并存，照抄猫国建设者 js/buildings.js 的 Spec（315-319 行）与
   * game.js:6119 的判定 `item.val >= item.unlockScheme.threshold`。
   *   ① defaultUnlockable —— 挂了它就永远可建（本作只有 kelp，即猫国的猫薄荷田）
   *   ② requiredTech      —— 科技前置
   *   ③ unlockScheme      —— 某资源持有量达到阈值
   *   ④ unlockRatio       —— 库存达到首级价格的这个比例才「露头」（0.3 = 猫国默认值）
   * need（建筑前置）不在这里：它是加工链的物理依赖，跟解锁是两回事。 */
  function unlocked(s, b) {
    if (b.defaultUnlockable) return true;
    /* 默认锁着。猫国的 `unlockable` 在 Spec 里是 MANDATORY（必填），
     * 漏写等于「忘了决定」。这里同样：没声明任何解锁条件的建筑一律不出现，
     * 否则一个只写了 need 的建筑（比如祭坛）会直接躺在开局列表里。 */
    if (!b.requiredTech && !b.unlockScheme && !b.unlockRatio) return false;
    /* 纪元闸门 outermost，排在 requiredTech 之前。它比科技更硬：破冰祭坛的
     * requiredTech 是「破冰工程学」，而后者本身就是纪元五的科技——纪元四时玩家
     * 就算把精铁堆到 300 也建不了祭坛。放在科技之后判定，lockReason 就会报出
     * 「需先掌握破冰工程学」这种玩家当下根本做不到的事（2026-09-25 实测复现）。 */
    if (b.id === 'miracle' && (s.era || 1) < CFG.MIRACLE_ERA) return false;
    if (b.requiredTech) {
      for (var i = 0; i < b.requiredTech.length; i++) if (!s.techs[b.requiredTech[i]]) return false;
    }
    /* 科技解锁：后墙。反查表不认识的新建筑默认锁着——与 requiredTech 同规则，
     * 漏声明等于「忘了决定」，玩家看到的是一座永远建不起来的建筑。 */
    if (!techOpensBuild(s, b.id)) return false;
    if (b.unlockScheme && !SB.economy.enough(s.res[b.unlockScheme.name], b.unlockScheme.threshold)) return false;
    if (b.unlockRatio) {
      for (var k in b.cost) if (!SB.economy.enough(s.res[k], b.cost[k] * b.unlockRatio)) return false;
    }
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
    /* 与 unlocked() 同序：纪元在最外。破壳纪之前报「需破冰工程学」，
     * 而那是纪元五的科技，玩家会在一个当下无法执行的目标上白攒资源。 */
    if (b.id === 'miracle' && (s.era || 1) < CFG.MIRACLE_ERA) {
      return '破壳纪（工业时代）才能建造——推完洋流纪的关键节点';
    }
    if (b.requiredTech) {
      for (var i = 0; i < b.requiredTech.length; i++) {
        if (!s.techs[b.requiredTech[i]]) {
          var t = b.requiredTech[i], nm = null;
          for (var j = 0; SB.TECHS && j < SB.TECHS.length; j++) if (SB.TECHS[j].id === t) nm = SB.TECHS[j].name;
          return '需先掌握科技：' + (nm || t);
        }
      }
    }
    if (b.unlockScheme && !SB.economy.enough(s.res[b.unlockScheme.name], b.unlockScheme.threshold)) {
      return SB.RESS[b.unlockScheme.name].name + ' ' + Math.floor(s.res[b.unlockScheme.name]) +
        ' / ' + b.unlockScheme.threshold;
    }
    if (b.unlockRatio) {
      for (var k in b.cost) {
        if (!SB.economy.enough(s.res[k], b.cost[k] * b.unlockRatio)) {
          return SB.RESS[k].name + ' ' + Math.floor(s.res[k]) + ' / ' + Math.ceil(b.cost[k] * b.unlockRatio);
        }
      }
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
    if (b.id === 'miracle') {
      var cap = SB.shell.miracleCap(s);
      if ((s.lvl.miracle || 0) + 1 > cap && (s.lvl.miracle || 0) >= cap) {
        return '供能不足：地热仅够 ' + cap + ' 级（先建热泉井或加派匠人）';
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
    /* 祭坛等级受地热产能约束（见 shell.miracleCap）。没有这条，堆建筑永远是最优解，
     * 「燃料流」在结构上不可能赢——理性流照样把祭坛堆到燃料允许的天花板。 */
    if (id === 'miracle') {
      var cap = SB.shell.miracleCap(s);
      if ((s.lvl.miracle || 0) + 1 > cap) return false;
    }
    SB.economy.pay(s, c);
    s.lvl[id]++;
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

  SB.habitat = {
    buildingById: buildingById, build: build, study: study,
    needMet: needMet, unlocked: unlocked, lockReason: lockReason, reveal: reveal
  };
})(typeof window !== 'undefined' ? window : globalThis);
