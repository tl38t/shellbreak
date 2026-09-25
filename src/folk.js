/* 天壳 / SHELLBREAK — 族民职业分配
 * 三条职业互为转移目标，总量恒等于 pop。
 * 已修的坑：减员时必须补给「当前最少」的职业，否则玩家会看到「点了减号人却跑去别处」。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  var IDS = ['gather', 'craft', 'scholar'];

  function sum(s) { return s.jobs.gather + s.jobs.craft + s.jobs.scholar; }

  function assign(s, job, delta) {
    if (delta > 0) {
      var from = IDS.filter(function (o) { return o !== job && s.jobs[o] > 0; });
      if (!from.length) return false;
      // 从人数最多的那一类抽调
      from.sort(function (a, b) { return s.jobs[b] - s.jobs[a]; });
      s.jobs[from[0]]--; s.jobs[job]++;
      return true;
    }
    if (s.jobs[job] <= 0) return false;
    s.jobs[job]--;
    var to = IDS.filter(function (o) { return o !== job; });
    to.sort(function (a, b) { return s.jobs[a] - s.jobs[b]; });   // 补给最少的
    s.jobs[to[0]]++;
    return true;
  }

  /* 自动配工：按目标比例一次性调到位。
   * 关键：人口在两次决策之间会变化（出生/死亡），jobs 总和常常 ≠ pop。
   * 必须先消化这个差额（把新人补给缺口最大的职类），否则所有职类都低于目标、
   * 找不到供体，整个分配空转——表现就是「面板上还有 8 个人没活干，但按钮点了没反应」。 */
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

  SB.folk = { assign: assign, autoAssign: autoAssign, sum: sum, IDS: IDS };
})(typeof window !== 'undefined' ? window : globalThis);
