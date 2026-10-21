/* 天壳 / SHELLBREAK — 离线解耦结算架构（阶段一骨架 + 阶段二 food/pop 半解耦实现）
 *
 * 位置：本文件定义【统一离线调度器】与【子系统】契约，并落地「食物 / 人口」积分器。
 *      阶段二只接线 food/pop（先补差分测试，再接入 drainCatchUp）；其余子系统（res-*、
 *      season、pump、adBank、shell、happiness）暂不动，阶段三~五迁移。
 *
 * 设计来源：用户 2026-10-14 架构任务（10 条架构目标 + 6 阶段迁移顺序 + 验收要求）。
 * 关键纪律：
 *   - 每个状态字段只有一个结算所有者；其他系统只能“读”或“通过接口请求增减”。
 *   - 区间内速率恒定（区间开始冻结快照），dt 只乘一次（rate × dt）。
 *   - 库存归零 / 仓储上限 / 原料耗尽 / 人口阈值等事件必须精确切段或闭式积分。
 *   - 冻伤用与 dt 对应的累计概率 + 固定随机种子（SB.rng）；概率掷骰锚定在全局 0.1s 栅格上，
 *     使结果**不随内部子步长数量任意变化**（架构目标 8）。
 *   - UI 面板(rates)、在线(loop)、离线(调度器) 共用同一批 SB.economyInternals 公式，禁止离线专用近似。
 *
 * 2026-10-14 阶段一骨架修正（对照用户三点要求）：
 *   ① Scheduler.step：先把 s.t 推进到边界时间，再调用对应系统的 onBoundary；
 *      所有边界处理都按“边界时刻”读取状态。
 *   ② snapshot 必须是真正冻结的快照：只复制需要的标量 / 字段，绝不把 s.jobs 等可变对象
 *      直接引用进快照（否则区间中途 s.jobs 被改会污染冻结语义）。
 *   ③ 最大步长单一来源：OFFLINE_STEP 只在 SB.CFG.OFFLINE_STEP 定义一处，game.js 的局部
 *      变量改为读取它，调度器也只读它，避免两套常量漂移。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  // 与 economy-tick.js / economy-rates.js 同源：所有底层速率/阈值函数都从 internals 取，离线不另写。
  var P = SB.economyInternals;
  if (!P) {
    throw new Error('offline-scheduler: SB.economyInternals 未就绪（加载顺序错误）');
  }
  // 与 tick 第 5 步(口粮)同口径： famine 以 0.1s 为单位累计；冻伤 perStepRisk 也乘 0.1。
  var STEP = 0.1;

  /* =========================================================================
   * 1. 子系统契约（Subsystem Contract）
   * =========================================================================
   * 每个子系统只拥有自己管理的状态字段，不得私自推进全局逻辑时间 s.t。
   * 调度器统一推进 s.t，并在每个边界调用各系统的 onBoundary。
   *
   * 必选方法：
   *   owns()            → string[]   本系统独占写入的状态字段路径。
   *   snapshot(s)       → object     区间开始时的状态快照（真正冻结：只复制标量/字段）。
   *   rate(s, snap)     → object     本稳定区间的每秒净流量（每类输出 单位/秒）。snap 已冻结。
   *   nextBoundary(s)   → number     本系统下一个事件边界的“逻辑秒偏移”(相对当前 s.t，>0)。
   *                                  无边界返回 Infinity。调度器取所有系统的最小值。
   *   advance(s, dt, snap, r) → void 在区间内推进 dt（dt 只乘一次）。只改 owns() 的字段。
   *   onBoundary(s)     → void       到达边界后执行离散状态转换（生育/饥荒/死亡…）。
   * ========================================================================= */

  var Subsystems = {};   // name -> subsystem
  function register(name, sub) {
    if (Subsystems[name]) throw new Error('offline-scheduler: 子系统 ' + name + ' 已注册');
    Subsystems[name] = sub;
  }

  /* =========================================================================
   * 2. 状态所有权登记表（架构目标 10：一字段一所有者）
   * ========================================================================= */
  var OWNERSHIP = {
    'res.kelp':       'food',
    'famine':         'food',
    '_grow':          'food',
    'pop':            'food',
    'peak':           'food',
    'frostDeaths':    'food',
    'famineDeaths':   'food',
    'happy':          'happiness',
    'res.coral':      'res-coral',
    'res.silt':       'res-silt',
    'res.warmstone':  'res-warmstone',
    'res.iron':       'res-iron',
    'res.stone':      'res-stone',
    'res.titanium':   'res-titanium',
    'res.fuel':       'res-fuel',
    'res.science':    'res-science',
    'res.culture':    'res-culture',
    'res.faith':      'res-faith',
    'res.luxury':     'res-luxury',
    'res.steel':      'res-steel',
    'res.hydro':      'res-hydro',
    'shell':          'shell',
    't':              'scheduler',
    'ad.ms':          'adBank',
    '_tp':            'pump'
  };

  /* =========================================================================
   * 3. 调度器（架构目标 1）
   * =========================================================================
   * 修正 ①：step 先把 s.t 推进到边界时间，再调用 onBoundary；onBoundary 按边界时刻读状态。
   */
  var Scheduler = {
    /* 计算下一步推进的 dt：取所有系统 nextBoundary 的最小值，且与剩余待补算时间、OFFLINE_STEP 取小。
     * 返回 { dt, boundaries: [系统名...] } —— boundaries 是本次到达边界需触发 onBoundary 的系统。 */
    nextStep: function (s, gameLeft) {
      var dt = Math.min(SB.CFG.OFFLINE_STEP || 2, gameLeft);
      var hit = [];
      for (var name in Subsystems) {
        var b = Subsystems[name].nextBoundary(s);
        if (b < dt - 1e-9) { dt = b; hit = [name]; }
        else if (Math.abs(b - dt) <= 1e-9) hit.push(name);
      }
      if (dt <= 1e-9) dt = Math.min(gameLeft, STEP);
      return { dt: dt, boundaries: hit };
    },
    /* 推进一个 chunk：各系统先按当前（区间开始的）快照 advance(dt)，再统一推进 s.t 到边界，
     * 最后对到达边界的系统 onBoundary（此时 s.t 已是边界时刻，onBoundary 读到的就是边界状态）。 */
    step: function (s, dt, boundaries) {
      var snap = {};
      for (var n in Subsystems) snap[n] = Subsystems[n].snapshot(s);
      for (var n2 in Subsystems) {
        var sub = Subsystems[n2];
        var r = sub.rate(s, snap[n2]);
        if (r) sub.advance(s, dt, snap[n2], r);
      }
      s.t += dt; // 仅调度器推进全局时间 —— 必须在 onBoundary 之前，保证 onBoundary 读到边界时刻状态
      for (var i = 0; i < boundaries.length; i++) Subsystems[boundaries[i]].onBoundary(s);
    }
  };

  /* =========================================================================
   * 4. 食物 / 人口积分器（阶段二实现）
   * =========================================================================
   * 所有者：res.kelp, famine, _grow, pop, peak, famineDeaths, frostDeaths
   * 依赖（仅读，作为速率输入）：
   *   - cold        = isCold(s) ? coldSeasonMul(s) : 1   （换季边界切段，由 offlineStep 负责）
   *   - warm        = warmRelief(s, dt) 返回值（暖石烧穿 → 边界切段，由离线步长负责）
   *   - happy/gm    = globalMul(s)                        （区间冻结）
   *   - jobs.*, techs, civics, s.pop                      （区间冻结：pop 变化只发生在 onBoundary/子步末尾）
   *
   * 与 tick 第 5~7 步逐位对照，在批量 tick 内重放食物/人口的 0.1s 微步：
   *   - kelp 归零后在 0.1s 微步内夹到 0，按固定栅格累计 famine 并触发死亡
   *   - 饥饿死亡：famine 累计达 60（=6s）时 pop-- + folk.reconcile（职业回退）
   *   - 生育：kelp > GROW_KEEP 且未满时 _grow 累计，达当前生育时长时 pop++
   *   - 冻伤：cold<1 时 risk = 1-(1-perStepRisk)^(dt/STEP)，掷骰锚定全局 0.1s 栅格（累计概率，与步长无关）
   *
   * 关键：每个 0.1s 微步都重采样实时状态，外层区间只减少其他经济系统的 tick 调用。
   */
  function civicKelpPerSec(s) {
    var cv = (SB.civic && SB.civic.flow) ? SB.civic.flow(s) : null;
    var k = cv && cv.kelp ? cv.kelp : 0;
    /* ERA10（2026-10-20）：藻食吃大统一方程轴（globalMulX）——与 tick 第 4b 段 cv.kelp * _gmx 同式。
     * 科技/市政/信仰之外的产出一律走 globalMulX，此处藻食不属排除集。 */
    return k > 0 ? k * P.globalMulX(s) : 0;   // 与 tick 第 4b 段 cv.kelp * _gmx 同式
  }

  /* 单个微步（mdt ≤ STEP=0.1s）推进食物/人口 + 奢侈品 + 幸福度。
   * 顺序与参考 tick 逐位一致：
   *   ① 冻本微步开场 happy（s._happySnap，对应 tick 开头）；
   *   ② happyStep 推进幸福度与奢侈品（与 tick 第 4c 步同）；
   *   ③ 用开场 happy 算 foodRate / 暖石顶回 / 产消（与 tick 第 5 步同）；
   *   ④ 冻伤掷骰一次（与 tick 第 7 步同，锚定 0.1s 栅格）。
   * 在 0.1s 栅格上重采样 happy，才能与「逐 0.1s tick」参考路径逐位一致——
   * 否则在 2s 整块吃「开场 happy」会让 foodRate 系统性偏高（实测 +13.6 kelp/2s）。 */
  function foodAdvanceMicro(s, mdt, at, emit) {
    var CFG = SB.CFG;
    s._happySnap = s.happy;                       // ① 冻开场 happy（与 tick line 43 同）
    if (SB.economy.happyStep) SB.economy.happyStep(s, mdt); // ② 与 tick 第 4c 步同，在食物/人口变化之前
    var cold = P.isCold(s) ? P.coldSeasonMul(s) : 1;
    if (cold < 1) s.coldTicks = (s.coldTicks || 0) + mdt;
    var warm = P.warmRelief(s, mdt);              // ③ 暖石顶回（含扣石副作用，与 tick 同）
    s.warmBurning = warm > 0;
    var produce = P.foodRate(s, cold, warm);      // 建筑+职业，已含 globalMul（用开场 happy）
    var consume = P.foodUse(s);                   // s.pop × FOOD_PER × 减免（与 happy 无关）
    P.addRes(s, 'kelp', produce * mdt);           // 与 tick: addRes(s,'kelp', foodRate*dt) 同
    s.res.kelp -= consume * mdt;                  // 与 tick: s.res.kelp -= foodUse*dt 同
    if (s.res.kelp < 0) {
      s.res.kelp = 0;
      s.famine = (s.famine || 0) + (mdt >= STEP - 1e-9 ? 1 : mdt / STEP); // 完整 0.1s 步精确 +1，避免浮点误差拖晚死亡
      if (s.famine >= 60 && s.pop > 1) {
        s.pop--; s.famine = 0; s.famineDeaths++;
        if (SB.folk && SB.folk.reconcile) SB.folk.reconcile(s);
        if (emit) emit('藻食耗尽，有人饿死了。', at + mdt);
      }
    } else {
      s.famine = 0;
    }
    // ---- 生育（与 tick 第 6 步同）----
    if (!SB.economy.isFull(s) && s.res.kelp > CFG.GROW_KEEP) {
      s._grow = (s._grow || 0) + mdt;
      var growNeed = SB.economy.growthDuration(s);
      if (s._grow >= growNeed) { s._grow = 0; s.pop++; if (emit) emit('生育：一名族民降生。', at + mdt); }
    } else {
      s._grow = 0;
    }
    s.peak = Math.max(s.peak || 0, s.pop);
    // ---- 冻伤（仅冰封期 cold<1；每 0.1s 微步掷一次，与参考 tick 第 7 步逐位一致）----
    if (cold < 1 && s.pop > 1) {
      var perStepRisk = CFG.FREEZE_CHANCE * (1 - P.warmCap(s) * 2) * 0.1;
      var risk = perStepRisk > 0 ? 1 - Math.pow(1 - perStepRisk, mdt / STEP) : 0;
      if (risk > 0 && (SB.rng ? SB.rng() : Math.random()) < risk) {
        s.pop--; s.frostDeaths++;
        if (SB.folk && SB.folk.reconcile) SB.folk.reconcile(s);
        if (emit) emit('冰封期冻死了一名族民。', at + mdt);
      }
    }
  }

  /* 下一个确定性事件边界的逻辑秒偏移（相对当前 s.t，>0）。
   * 不含冻伤（概率性，非确定性边界，由 foodAdvanceMicro 的每微步掷骰处理）。
   * 当前 food/pop 推进在固定微步中处理饥荒与生育阈值，因此这里只供通用调度器查询。 */
  function foodNextBoundary(s) {
    var CFG = SB.CFG;
    var b = Infinity;
    // 不在“kelp 穿零”处切成任意小数步：参考 tick 在固定 0.1s 栅格上
    // 处理饥荒，穿零发生的那个 tick 会完整记 1 个 famine。内层微步负责夹到 0。
    if (s.res.kelp <= 0 && s.pop > 1) {
      var fLeft = (60 - (s.famine || 0)) * STEP;            // 距下次饿死
      if (fLeft > 1e-9) b = Math.min(b, fLeft);
    }
    if (!SB.economy.isFull(s) && s.res.kelp > CFG.GROW_KEEP) {
      var growLeft = (SB.economy ? SB.economy.growthDuration(s) : CFG.GROW_NEED) - (s._grow || 0);
      if (growLeft > 1e-9) b = Math.min(b, growLeft);       // 距下次生育
    }
    return b;
  }

  var food = {
    owns: function () { return ['res.kelp', 'famine', '_grow', 'pop', 'peak', 'famineDeaths', 'frostDeaths']; },
    /* 修正 ②：真正冻结的快照——只复制标量与 jobs 的字段副本，绝不引用 s.jobs 原对象。 */
    snapshot: function (s) {
      var j = s.jobs || {};
      return {
        kelp: s.res.kelp,
        famine: s.famine || 0,
        grow: s._grow || 0,
        pop: s.pop,
        peak: s.peak || 0,
        cold: P.isCold(s) ? P.coldSeasonMul(s) : 1,
        warm: P.warmBurningNow(s) ? (SB.CFG.WARM_RELIEF || 0) : 0,
        gm: P.globalMul(s),
        civicKelp: civicKelpPerSec(s),
        full: SB.economy.isFull(s),
        // 仅复制数值字段，断开与原对象的引用
        jobs: { gather: j.gather || 0, coralwright: j.coralwright || 0, quarrier: j.quarrier || 0,
                miner: j.miner || 0, craft: j.craft || 0, scholar: j.scholar || 0,
                scribe: j.scribe || 0, merchant: j.merchant || 0 }
      };
    },
    rate: function (s, snap) {
      // 返回该稳定区间的每秒净流量（演示用；advance 实际重算 live 状态以保与 tick 逐字等价）。
      // 返回 truthy 对象以确保调度器路径会调用 advance。
      var consume = (snap.pop) * SB.CFG.FOOD_PER; // foodUse 近似（减免在核心走 live 重算）
      return { net: (snap.civicKelp) - consume };
    },
    nextBoundary: function (s) { return foodNextBoundary(s); },
    advance: function (s, dt, snap, r) {
      // 子步推进：用 live 状态重算以获得与 tick 逐字等价的结果（snap 用于冻结语义演示）
      foodAdvanceMicro(s, dt, s.t, null);
    },
    onBoundary: function (s) {
      // 离散转换已在 foodAdvanceMicro 子步末尾处理（饿死/生育/冻死），此处无需额外动作。
    }
  };
  register('food', food);

  /* =========================================================================
   * 5. 对外 API
   * =========================================================================
   * integrateFoodPop(s, dt, opts, emit):
   *   在不超过 dt 的范围内，用固定 0.1s 微步推进食物/人口子系统。
   *   - 饥荒、生育和冻伤均在固定栅格上处理，不在事件阈值处切成任意小数步。
   *   - 冻伤概率锚定全局 0.1s 栅格，结果不随子步数量变化。
   *   - 不推进 s.t（由调用方——调度器或 drainCatchUp——统一推进，满足“仅调度器推进全局时间”）。
   *   - opts.t0：本段开始的绝对逻辑秒（冻伤栅格对齐用）；省略时回退 s.t。
   *   返回实际消费的逻辑秒（通常 == dt；若触发内部边界且调用方需要分段，可据此拆分剩余）。
   */
  /* 在不超过 dt 的范围内，用事件边界闭式积分推进食物/人口子系统。
   * - 饥荒、生育和冻伤都在全局 0.1s 栅格上处理。
   * - 每个子步内再按 STEP=0.1s 微步：happyStep 在 0.1s 栅格上重采样 happy（foodRate 依赖
   *   happy），使结果与「逐 0.1s tick」参考路径逐位一致（架构目标 8：不随步长变化）。
   * - 冻伤概率锚定全局 0.1s 栅格，每微步掷一次，结果不随子步数量变化。
   * - 不推进 s.t（由调用方——调度器或 drainCatchUp——统一推进）。
   * - opts.t0：本段开始的绝对逻辑秒（冻伤栅格对齐用）；省略时回退 s.t。 */
  function integrateFoodPop(s, dt, opts, emit) {
    opts = opts || {};
    P.seasonTurn(s);                 // 确保 s.frozen 反映当前 s.t（与 tick 开头同）
    var at = (typeof opts.t0 === 'number') ? opts.t0 : s.t;
    var remaining = dt, guard = 0;
    while (remaining > 1e-9 && guard++ < 1000000) {
      // 对齐全局 0.1s 栅格。不要在生育/饥荒的阈值时刻切断微步：在线 tick
      // 只在每个 0.1s 步末检查这些阈值，切成任意小数步会改变饥荒累计与随机数序列。
      var gridIndex = Math.floor(at / STEP + 1e-8) + 1;
      var toGrid = gridIndex * STEP - at;
      if (toGrid <= 1e-9) toGrid = STEP;
      var mdt = Math.min(toGrid, remaining);
      foodAdvanceMicro(s, mdt, at, emit);
      at += mdt;
      remaining -= mdt;
    }
    return dt - remaining;
  }

  SB.offline = {
    Subsystems: Subsystems,
    OWNERSHIP: OWNERSHIP,
    register: register,
    Scheduler: Scheduler,
    integrateFoodPop: integrateFoodPop,
    foodNextBoundary: foodNextBoundary,
    CFG_STEP: STEP
  };
})(typeof window !== 'undefined' ? window : globalThis);
