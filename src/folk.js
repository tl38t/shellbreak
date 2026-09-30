/* 天壳 / SHELLBREAK — 族民职业分配
 * 照猫国建设者的单向雇佣模型：族民默认「闲置」，＋ 从闲置池雇佣，− 退回闲置池。
 * 职业总和 ≤ pop，永远不互相抢人——旧版「− 一个立刻补给别的职业」的转移制
 * 让玩家永远调不出自己想要的状态（比如「全部闲置」），已废弃。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  /* 职业表。采集者排首位不是排版偏好：它产的是口粮，喂不饱就没人生育、整局停摆，
   * 配工顺序必须是「先吃饭、再干活」。
   * 上一轮自创的「圃丁」已删（docs/DESIGN_v0.3.md §4：开局唯一职业就是采集者，
   * 产藻食），食物线只剩采集者这一条，不存在两个职业抢同一件事。 */
  /* ⚠️【2026-09-30：从「第二份手抄职业表」改为**由 config.JOBS 派生**】
   * 旧写法是手抄一份 id 数组，与 config.js 的 JOBS 是两份独立的表 —— 加职业要两处都改，
   * 漏一处就静默断链。2026-09-28 加商人时正是漏了这一处：`merchant` 不在 IDS ⇒
   *   sum() / idle() / reconcile() 全都看不见商人 ⇒ 商人**不吃人口上限**、可以无限雇
   *   （idle 恒 >0），减员时也收不回。玩家实测症状：「族民 34（上限 35）却挂着 100 名商人」。
   *   （历史同源案例：scribe 那次漏抄的后果是「人派进去不出市政点」。）
   * 改成派生后这类漏抄在结构上不可能再发生 —— config.JOBS 成为唯一权威。
   * ⚠️ 顺序取自 SB.JOBS：gather 排首位，保证 autoAssign 的 donor 优先填满口粮
   *   （「先吃饭、再干活」这条纪律不变）。folk.js 在 config.js 之后加载 ⇒ 此处 SB.JOBS 必已就绪。 */
  var IDS = (SB.JOBS || []).map(function (j) { return j.id; });

  /* 「种植」之后的采集者改称农民（用户 2026-09-26 原话：采集者职业变为农民）。
   * 【为什么用改称而不是新增 farmer 职业】见 config.js JOBS.gather 的注——
   * 要的是同一个人换了身份，不是多一个产同一资源的职业。
   * 【这里只管名字】+50% 产出走 tech 的 `farm` 乘区（economy.js 的 foodRate 读它），
   * 两处分开是为了让「显示为农民」和「产得更多」不会互相牵连：换了名字但没研究种植时，
   * 显示仍是采集者，产出也不该变。 */
  var FARM_JOB = 'gather', FARM_TECH = 'plant', FARM_NAME = '农民';
  function jobName(s, jid) {
    var base = (SB.JOBS || []).filter(function (x) { return x.id === jid; })[0];
    var n = base ? base.name : jid;
    if (jid === FARM_JOB && s && s.techs && s.techs[FARM_TECH]) n = FARM_NAME;
    return n;
  }

  /* 职业解锁有**两条通路**（2026-09-28）：① 科技树（techs.js 里各科技 eff.unlockJob，
   * 与建筑同理用反查表）；② 市政（civics 表各项的 `job` 字段，商人走这条）。
   * 反查表各自只服务自己那条通路，不合并——合并会让「谁解锁了它」变得看不出来。
   * 采集者 gather 无解锁条件——它是开局唯一能干活的人，
   * 若它也要求研究某项科技，玩家在第一次研究完成前没有任何产出。 */
  var JOB_TECH = {};
  function jobTechOf(jid) {
    if (!JOB_TECH[jid]) {
      var T = SB.TECHS || [];
      for (var i = 0; i < T.length; i++) {
        var e = T[i].eff;
        if (e && e.unlockJob && e.unlockJob.indexOf(jid) >= 0) JOB_TECH[jid] = T[i].id;
      }
    }
    return JOB_TECH[jid] || null;
  }
  /* 职业解锁的**第二条通路**：市政《对外贸易》的 `job` 字段（2026-09-28 用户规格
   * 「对外贸易解锁职业商人」）。其余七项职业走上面那条科技通路，两条并存、任一命中即解锁。
   * ⚠️【为什么不把商人也塞进 JOB_TECH】那等于宣布「解锁商人的其实是某项科技」，
   *    与规格相悖；而且将来想改解锁权时会出现两个地方都能改、改了也不报错的歧义。
   *    分开放 ⇒ 「谁解锁了商人」这件事在 config.js 的 JOBS 表与 civics 的 trade 项
   *    上各写一遍，两处都改才一致。
   * ⚠️【判定是「任一命中」而不是「两边都满足」】技术上两条通路可以同时命中同一个职业。
   *    用 OR 是因为解锁权本来就是「来自任何一处」，用 AND 会让「写了科技却没写市政」
   *    的职业被卡死——那是 UI 上一行都看不出来的哑锁。 */
  var JOB_CIVIC = {};
  function jobCivicOf(jid) {
    if (!JOB_CIVIC[jid] && SB.CIVICS) {
      for (var i = 0; i < SB.CIVICS.length; i++) {
        var c = SB.CIVICS[i];
        if (c.job && c.job === jid) JOB_CIVIC[jid] = c.id;
      }
    }
    return JOB_CIVIC[jid] || null;
  }
  function jobUnlocked(s, jid) {
    if (jid === 'gather') return true;
    var tid = jobTechOf(jid);
    if (tid && s.techs && s.techs[tid]) return true;
    var cid = jobCivicOf(jid);
    /* ⚠️⚠️【`!cid` 不能简单地返回 true】「两边都没声明 ⇒ 永远解锁」是**原有的语义**：
     *     珊瑚匠/采石工这类职业压根没挂任何解锁声明，它们本来就无条件可雇。
     *     若这里写成 `return !cid || ...`，等于宣布「凡是不挂市政的职业全都无条件解锁」，
     *     于是**每一个**没挂科技的职业（7 个里的 6 个）瞬间全部解锁——
     *     2026-09-28 实测一次就踩了：回归里「未解锁职业雇不动」直接红，
     *     因为连珊瑚匠都变成 unlocked=true（那是这行的默认夹具态）。
     * ⇒ 只有**真的挂了市政声明**的职业，才由市政来卡；没挂的沿用原语义。 */
    if (cid) return !!(s.civics && s.civics[cid]);
    return !tid;
  }

  function sum(s) {
    var n = 0;
    for (var i = 0; i < IDS.length; i++) n += (s.jobs[IDS[i]] || 0);
    return n;
  }
  function idle(s) { return s.pop - sum(s); }

  /* 单步分配：＋ 需要闲置池有人；− 把该职业退回闲置池。
   * 返回 false 表示动作无效（没闲置可雇 / 该职业没人），UI 层据此不重渲染。 */
  function assign(s, job, delta) {
    if (delta > 0) {
      /* ⚠️ 未解锁的职业不能雇。这是**根因侧**的守卫，不是 UI 的礼貌：
       * UI 已经把未解锁的行整行不渲染（render.js paneFolk），但按钮只是表现层，
       * 任何调用路径（未来的 QA 探针 / 脚本 / 事件被伪造）都该被同一判据拦住。
       * 判据与 autoAssign 的 others 过滤、render 的渲染过滤**同源**（都读 jobUnlocked），
       * 而 jobUnlocked 又只反查 techs.js 的 eff.unlockJob ⇒ 解锁权仍只有一处。
       * ⚠️ 只拦 delta>0：老档若有人卡在「职业有人但科技丢失」的不一致态上，
       *    − 必须仍然退得掉，否则闲置池永远收不回这个人（行也还在，见 render）。 */
      if (!jobUnlocked(s, job)) return false;
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

    /* 采集者（食物）的目标是「绝对人数」而不是比例：该雇几个由当下口粮缺口决定
     * （见 sim/balance.mjs 的配工段），这里只负责把它落实。
     * 传 0~1 之间的小数则仍按比例解释，保留原有写法。 */
    var g = ratio && ratio.gather != null ? ratio.gather : 0;
    if (g > 0 && g < 1) g = Math.round(pop * g);
    g = Math.max(0, Math.min(Math.round(g), pop));
    /* 至少留一人干活，否则整局没有资源进项；但 pop=1 时例外——
     * ⚠️ 2026-09-26 这条旧理由作废了：硬上限下「pop=1 全部当采集者」永远生不出人
     *    （上限 0，没有住房就不算住满也不长人，见 economy.isFull），
     *    于是 pop=1 必须有人去凿珊瑚才能盖起第一座礁口巢。规则见下面的 needCoral。 */
    if (pop > 1 && g > pop - 1) g = pop - 1;

    /* ⚠️ 这里曾经有一条「开局破局」：藻场铺起来、一座房都没有、珊瑚不够首级造价时，
     *   扣一个人去凿珊瑚。它随 2026-09-26 把「凿珊瑚」改回付费科技（现价 25）而**整体作废** ——
     *   珊瑚匠开局不可雇，这个条件恒为 false，留着只会让后人以为珊瑚匠能开局就上。
     *   开局的珊瑚进项从此改走 config.js 的 GATHER（手动点「采珊瑚」按钮），
     *   由 sim/balance.mjs 的主循环模拟那个点击 —— 玩家怎么破局，bot 就怎么破局。
     *   ⚠️ 教训：**别为了让 sim 跑通去改产品侧设计**。当时 balance 死锁是因为 bot 不会点
     *   按钮，正解是给 bot 补上手速，不是把科技免费送掉。 */

    /* 其余职业按比例分掉剩余人力。以前写死 craft/scholar 两档，加了珊瑚匠之后
     * 写死会让剩下的 0.12 权重没人接（rest 里只剩 scholar），珊瑚永远 0。 */
    var rest = pop - g;
    var others = [], w = {}, sumW = 0, i2;
    for (i2 = 0; i2 < IDS.length; i2++) if (IDS[i2] !== 'gather') others.push(IDS[i2]);
    /* 未解锁的职业不参与分配：否则 sim 会把人派到 UI 上根本不存在的职业，
     * 玩家看到的是「闲置池空了但什么都没产」。 */
    others = others.filter(function (x) { return jobUnlocked(s, x); });
    for (i2 = 0; i2 < others.length; i2++) {
      var wv = (ratio && ratio[others[i2]] != null) ? Math.max(0, ratio[others[i2]]) : 0;
      w[others[i2]] = wv; sumW += wv;
    }
    var target = { gather: g }, acc = 0;
    for (i2 = 0; i2 < others.length; i2++) {
      var k = others[i2];
      target[k] = sumW > 0 ? Math.round(rest * w[k] / sumW) : (k === 'craft' ? rest : 0);
      acc += target[k];
    }
    // 取整残差补给学者，避免总量差 1 导致下一轮空转
    if (target.scholar !== undefined) target.scholar = Math.max(0, rest - (acc - target.scholar));

    var diff = pop - sum(s);
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

  SB.folk = {
    assign: assign, autoAssign: autoAssign, reconcile: reconcile,
    sum: sum, idle: idle, IDS: IDS, jobUnlocked: jobUnlocked,
    jobTechOf: jobTechOf, jobCivicOf: jobCivicOf,
    jobName: jobName
  };
})(typeof window !== 'undefined' ? window : globalThis);
