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
 *   ⑤ **静默**（2026-10-28 用户要求）：自动点击**不触发任何重画**，只写 s.res。
 *      旧实现在每批点击后 markDirty() ⇒ 每秒 1~3 次整块重建全部 pane，屏幕上表现为
 *      「一直闪」。现在面板刷新退回主循环的 PANE_REFRESH（墙钟 2 秒），
 *      资源数字仍走每帧的 renderTick，玩家看得到在涨，只是不再有 DOM 抖动。
 *   ⑥ **可暂停**（2026-10-28 用户要求「设置栏里加一个自动点击开关」）：`s.autoClickOn === false`
 *      ⇒ 本函数直接早退（预算也不累积）。默认「开」，老存档无该字段时行为不变。
 *      开关 UI 在 ⚙ 设置 → 自动；未购买 perks 时禁用并提示去轮回商店（见 game.js 的
 *      syncAutoClickSetting）。
 *      ⑦ **跨周目继承**（同日用户拍）：本函数只认 `s.autoClickOn`（本局行为）；跨周目偏好是
 *      `meta.autoClickOn`，由 game.startRun / resumeRun 播种进 s —— 所以这里**不需要**读 meta，
 *      也别改成读 meta：sim 里的裸 freshRun 夹具没有 meta，改了会让所有函数级断言失真。
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
    /* 设置栏的开关（2026-10-28）：`s.autoClickOn === false` 才算关。
     * ⚠️ 默认值是「开」——老存档没有这个字段，写成 `if (!s.autoClickOn) return` 会让
     *   所有老玩家的自动点击**凭空失效**（而且不报错，只是资源不涨，最难查的一类）。
     * ⚠️ 这是**周目状态**不是浏览器偏好：它决定本局每帧要不要采集，必须跟着存档走
     *   （换设备 / 云存档恢复后行为要一致）。 */
    if (s.autoClickOn === false) return;
    var acc = (s.autoClickAcc || 0) + dt * rate;
    var n = Math.floor(acc);
    if (n <= 0) { s.autoClickAcc = acc; return; }
    s.autoClickAcc = acc - n;
    if (n > 50) n = 50;                       // 单帧安全上限
    for (var i = 0; i < n; i++) doClick(s);
    /* ⚠️ 2026-10-28（用户：「自动点击一直闪，能不能改成静默的，单纯给资源」）：
     *   **这里不再 markDirty()**。置脏 ⇒ 主循环下一帧 renderAll() ⇒ renderPanes() 把
     *   **全部 pane 整块重建**（含隐藏的科技长卷那 33 个节点）。实测单次 renderAll ≈ 3.2ms
     *   （手机上是这个数的数倍），满购 3 档就是每秒 3 次 ⇒ 屏幕持续闪；更硬的一刀是
     *   面板里的按钮会在玩家「按下与抬起之间」被换掉，手指那一下直接丢失（见 pumpTech 注释）。
     *   静默口径 = **只改 s.res，不动任何 DOM**：
     *     · 资源数字本来就走每帧的 renderTick（便宜通道，renderRes 每帧刷），玩家照样看得到
     *       藻食/珊瑚在涨 —— 这正是用户要的「单纯给资源」；
     *     · 面板本身按主循环既有的 PANE_REFRESH（**墙钟** 2 秒）刷一次，与「什么都不点」同节奏；
     *     · 巢穴页采集行有一枚**静态**角标「自动点击中 · N 次/秒」告知它正在工作
     *       （见 render-pane-village.js；刻意不加动画，否则等于换个方式闪）。
     * ⚠️ pumpTech 保留：它只在**真的揭示了尤里卡**时才自己 markDirty，空转 0.002ms/次。
     *   删掉它，「累计产出」那一类尤里卡就得等主循环 2 秒那一拍才亮，与手动点击不一致。 */
    if (SB.game && SB.game.pumpTech) SB.game.pumpTech(s, emit);   // 累计产出 → 尤里卡
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
