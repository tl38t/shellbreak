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
    if (b.requiredTech) {
      for (var i = 0; i < b.requiredTech.length; i++) if (!s.techs[b.requiredTech[i]]) return false;
    }
    if (b.unlockScheme && s.res[b.unlockScheme.name] < b.unlockScheme.threshold) return false;
    if (b.unlockRatio) {
      for (var k in b.cost) if (s.res[k] < b.cost[k] * b.unlockRatio) return false;
    }
    return true;
  }

  // 给 UI 用的解锁理由：为什么要灰掉
  function lockReason(s, b) {
    if (b.requiredTech) {
      for (var i = 0; i < b.requiredTech.length; i++) {
        if (!s.techs[b.requiredTech[i]]) {
          var t = b.requiredTech[i];
          for (var j = 0; j < SB.TECHS.length; j++) if (SB.TECHS[j].id === t) return '需学问：' + SB.TECHS[j].name;
        }
      }
    }
    if (b.unlockScheme && s.res[b.unlockScheme.name] < b.unlockScheme.threshold) {
      return SB.RESS[b.unlockScheme.name].name + ' ' + Math.floor(s.res[b.unlockScheme.name]) +
        ' / ' + b.unlockScheme.threshold;
    }
    if (b.unlockRatio) {
      for (var k in b.cost) {
        if (s.res[k] < b.cost[k] * b.unlockRatio) {
          return SB.RESS[k].name + ' ' + Math.floor(s.res[k]) + ' / ' + Math.ceil(b.cost[k] * b.unlockRatio);
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
    SB.economy.pay(s, c);
    s.lvl[id]++;
    // 建造不再直接削壳：壳厚只由「系数驱动的持续削壳」表达，
    // 建造的贡献体现在 lvlSum 推高破壳系数上。这样玩家看得到因果，而不是看到一次跳变。
    if (emit) emit('建成 ' + b.name + ' ×' + s.lvl[id] + '，破壳系数 ' + SB.shell.breakCoef(s).toFixed(2));
    return true;
  }

  function study(s, id, emit) {
    var t = null;
    for (var i = 0; i < SB.TECHS.length; i++) if (SB.TECHS[i].id === id) t = SB.TECHS[i];
    if (!t || s.techs[id] || s.res.science < t.cost) return false;
    s.res.science -= t.cost;
    s.techs[id] = true;
    if (emit) emit('研究完成：' + t.name + '（' + t.desc + '）');
    return true;
  }

  SB.habitat = {
    buildingById: buildingById, build: build, study: study,
    needMet: needMet, unlocked: unlocked, lockReason: lockReason
  };
})(typeof window !== 'undefined' ? window : globalThis);
