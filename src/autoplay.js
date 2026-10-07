/* 天壳 / SHELLBREAK — 轮回商店：自动点击（采集 + 点击事件）
 *
 * 两个由轮回商店购买的永久增益驱动：
 *   · s.perk.autoClick（等级 0/1/2/3）→ 每秒自动点击 藻食+珊瑚 N 次（N = 等级）。
 *     三档商品 autoClicker1/2/3 各 apply {autoClick:1}，满购 ⇒ s.perk.autoClick=3 ⇒ 3 次/秒。
 *   · s.perk.autoEvent（0/1）→ 点击事件（天壳震动等）出现时自动拾取，无需手动点 #omen 横幅。
 *
 * 设计要点（与现有纪律一致）：
 *   ① 用「帧钟真实秒」累计点击预算（s.autoClickAcc），故「每秒 N 次」= N 次/真实秒，
 *      不受游戏倍速（1×/5×/10×/20×）放大——倍速只该加快世界，不该加快自动点击节奏。
 *   ② 只在线生效：主循环调用处用 `!loop.job` 把关，离线补算（drainCatchUp）不跑本系统，
 *      与「离线闸门：离线只结算产出、不替玩家操作」同一精神。
 *   ③ 每次自动点击复刻手动点击的两条线：addRes（受仓储上限约束、进累计台账），
 *      并在每帧点击批次后补一次 pumpTech（「累计产出」是若干尤里卡的条件，与手动点击同口径）。
 *   ④ 完全独立，不碰 SB.rng（事件模块自带种子），不读取 SB 之外的任何随机源。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  /* 单个自动点击动作：复刻 input.js 的 d.gather 分支（藻食 + 珊瑚各一次）。
   * 数值取自 SB.GATHER（config.js 顶层，与手动按钮同源——珊瑚 0.1/次、藻食 1/次）。 */
  function doClick(s) {
    var G = SB.GATHER || { kelp: 1, coral: 0.1 };
    SB.economy.addRes(s, 'kelp', G.kelp || 0);
    SB.economy.addRes(s, 'coral', G.coral || 0);
  }

  /* 主循环每帧调用：dt = 本帧真实流逝秒（game.loop 里的 elapsed）。
   * 按 s.perk.autoClick（次/秒）累计预算，整批执行；带安全上限防止极端帧爆量。 */
  function autoClick(s, dt, emit) {
    if (!s) return;
    var rate = (s.perk && s.perk.autoClick) || 0;
    if (!rate) return;
    var acc = (s.autoClickAcc || 0) + dt * rate;
    var n = Math.floor(acc);
    if (n <= 0) { s.autoClickAcc = acc; return; }
    s.autoClickAcc = acc - n;
    if (n > 50) n = 50;                       // 单帧安全上限
    for (var i = 0; i < n; i++) doClick(s);
    if (SB.game) {
      SB.game.markDirty();
      if (SB.game.pumpTech) SB.game.pumpTech(s, emit);   // 累计产出 → 尤里卡
    }
  }

  /* 点击事件自动拾取：仅当已购 autoEvent 且当前有活跃事件时 claim。
   * claim 返回真值表示真领到了奖（无活跃事件/已过窗口则 false，不误触）。 */
  function autoEventClaim(s, emit) {
    if (!s || !s.perk || !s.perk.autoEvent) return false;
    if (!SB.events || !SB.events.getActive()) return false;
    var ok = SB.events.claim(s, emit);
    if (ok && SB.game) SB.game.markDirty();
    return !!ok;
  }

  SB.autoplay = {
    autoClick: autoClick,
    autoEventClaim: autoEventClaim,
    _doClick: doClick
  };
})(typeof window !== 'undefined' ? window : globalThis);
