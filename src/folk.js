/* 天壳 / SHELLBREAK — 族民职业分配
 * 照猫国建设者的单向雇佣模型：族民默认「闲置」，＋ 从闲置池雇佣，− 退回闲置池。
 * 职业总和 ≤ pop，永远不互相抢人——旧版「− 一个立刻补给别的职业」的转移制
 * 让玩家永远调不出自己想要的状态（比如「全部闲置」），已废弃。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  var IDS = ['gather', 'craft', 'scholar'];

  function sum(s) { return s.jobs.gather + s.jobs.craft + s.jobs.scholar; }
  function idle(s) { return s.pop - sum(s); }

  /* 单步分配：＋ 需要闲置池有人；− 把该职业退回闲置池。
   * 返回 false 表示动作无效（没闲置可雇 / 该职业没人），UI 层据此不重渲染。 */
  function assign(s, job, delta) {
    if (delta > 0) {
      if (idle(s) <= 0) return false;
      s.jobs[job]++;
      return true;
    }
    if (s.jobs[job] <= 0) return false;
    s.jobs[job]--;
    return true;
  }

  /* 人口减员后把超额职业位退回闲置池（死亡不吃掉在岗编制）。
   * 饿死/冻死在 economy.tick 里 pop-- 后调用，保证恒等式 jobs 总和 ≤ pop。 */
  function reconcile(s) {
    var over = sum(s) - s.pop;
    while (over > 0) {
      var top = null;
      for (var i = 0; i < IDS.length; i++) {
        if (s.jobs[IDS[i]] > 0 && (!top || s.jobs[IDS[i]] > s.jobs[top])) top = IDS[i];
      }
      if (!top) break;
      s.jobs[top]--; over--;
    }
  }

  /* 自动配工（sim 机器人用）：按目标比例一次性把闲置分掉。
   * 关键：人口在两次决策之间会变化（出生/死亡），jobs 总和常常 ≠ pop。
   * 必须先消化这个差额（把新人补给缺口最大的职类），否则所有职类都低于目标、
   * 找不到供体，整个分配空转。 */
  function autoAssign(s, ratio) {
    var pop = s.pop;
    if (pop <= 0) return;
    var g = Math.max(1, Math.round(pop * (ratio.gather != null ? ratio.gather : 0.6)));
    var c = Math.round(pop * (ratio.craft != null ? ratio.craft : 0.25));
    if (c > pop - g) c = Math.max(0, pop - g);
    var sc = Math.max(0, pop - g - c);
    var target = { gather: g, craft: c, scholar: sc };

    var diff = pop - (s.jobs.gather + s.jobs.craft + s.jobs.scholar);
    while (diff > 0) {
      var best = null, gap = 0;
      for (var i = 0; i < IDS.length; i++) {
        var d = target[IDS[i]] - s.jobs[IDS[i]];
        if (d > gap) { gap = d; best = IDS[i]; }
      }
      if (!best || gap <= 0) { s.jobs[best || 'gather']++; diff--; continue; }
      s.jobs[best]++; diff--;
    }
    while (diff < 0) {
      var top = null, over = 0;
      for (var j = 0; j < IDS.length; j++) {
        var o = target[IDS[j]] - s.jobs[IDS[j]];
        if (-o > over) { over = -o; top = IDS[j]; }
      }
      if (!top) { s.jobs.gather--; diff++; continue; }
      s.jobs[top]--; diff++;
    }

    // 再按目标做转移：只从「超编」的职类抽，避免把采集者反复抽空
    for (var pass = 0; pass < 24; pass++) {
      var moved = false;
      for (var m = 0; m < IDS.length; m++) {
        var k = IDS[m];
        if (s.jobs[k] < target[k]) {
          var donors = [];
          for (var n = 0; n < IDS.length; n++) {
            var o = IDS[n];
            if (o !== k && s.jobs[o] > target[o]) donors.push(o);
          }
          if (donors.length) {
            donors.sort(function (a, b) { return s.jobs[b] - s.jobs[a]; });
            s.jobs[donors[0]]--; s.jobs[k]++; moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }

  SB.folk = { assign: assign, autoAssign: autoAssign, reconcile: reconcile, sum: sum, idle: idle, IDS: IDS };
})(typeof window !== 'undefined' ? window : globalThis);
