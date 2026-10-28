/* e2e suite: prestige auto-click; uses the caller's shared fixture and check collector. */
export function run({ SB, check }) {

/* ── 轮回商店：自动点击（采集 + 点击事件）──
 * 覆盖：① API 露出；② autoClick 按「帧钟真实秒 × 等级」累计、整批执行（秒率不随倍速放大）；
 *       ③ 三档叠加 ⇒ s.perk.autoClick=3 ⇒ 3 次/秒；④ 分数秒预算跨帧累积（不丢点击）；
 *       ⑤ 自动拾取：有活跃事件且购 autoEvent ⇒ claim 领奖，无活跃/未购则不误触；
 *       ⑥ 设置栏开关 s.autoClickOn（false = 停，缺字段 = 开、且关闭期间不攒预算）；
 *       ⑦ 跨周目继承：meta.autoClickOn 是偏好，startRun 把它播种进新周目（暂停要活过破壳）。
 * ⚠️ 只验证函数级行为（src/autoplay.js），不依赖主循环墙钟——主循环只是按 elapsed 调它。 */
console.log('\n=== 轮回商店·自动点击 ===');
{
  const ap = SB.autoplay;
  const noop = function () {};
  check('自动点击 API 已露出（autoClick / autoEventClaim）',
    !!ap && typeof ap.autoClick === 'function' && typeof ap.autoEventClaim === 'function',
    ap ? Object.keys(ap).join(',') : '（SB.autoplay 缺失）');

  /* ② 秒率：autoClick(s, dt, emit) 按 dt（真实秒）× s.perk.autoClick 累计，整批执行。
   *    1 次/秒 ⇒ dt=1.0 ⇒ 1 次点击（藻食 +1、珊瑚 +0.1）。 */
  const a1 = SB.state.freshRun(false);
  a1.perk.autoClick = 1;
  const kelpBefore = a1.res.kelp, coralBefore = a1.res.coral;
  ap.autoClick(a1, 1.0, noop);
  check('autoClick 1 次/秒 × dt=1s ⇒ 1 次点击（藻食 +1）',
    Math.abs((a1.res.kelp - kelpBefore) - 1) < 1e-9,
    'kelp ' + kelpBefore.toFixed(2) + ' → ' + a1.res.kelp.toFixed(2));
  check('autoClick 1 次/秒 × dt=1s ⇒ 珊瑚 +0.1（与手动按钮同源，GATHER.coral）',
    Math.abs((a1.res.coral - coralBefore) - 0.1) < 1e-9,
    'coral ' + coralBefore.toFixed(2) + ' → ' + a1.res.coral.toFixed(2));

  /* ③ 三档叠加 ⇒ 3 次/秒 ⇒ dt=1s ⇒ 3 次点击（藻食 +3、珊瑚 +0.3）。 */
  const a3 = SB.state.freshRun(false);
  a3.perk.autoClick = 3;
  const k3 = a3.res.kelp, c3 = a3.res.coral;
  ap.autoClick(a3, 1.0, noop);
  check('三档叠加 autoClick=3 × dt=1s ⇒ 3 次点击（藻食 +3）',
    Math.abs((a3.res.kelp - k3) - 3) < 1e-9, 'kelp +' + (a3.res.kelp - k3).toFixed(2));
  check('三档叠加 autoClick=3 × dt=1s ⇒ 珊瑚 +0.3',
    Math.abs((a3.res.coral - c3) - 0.3) < 1e-9, 'coral +' + (a3.res.coral - c3).toFixed(2));

  /* ④ 分数秒预算跨帧累积：dt=0.4（率1 ⇒ 0.4，不点）→ dt=0.7（累计 1.1 ⇒ 1 点）。 */
  const a4 = SB.state.freshRun(false);
  a4.perk.autoClick = 1;
  const k4 = a4.res.kelp;
  ap.autoClick(a4, 0.4, noop);
  check('分数秒预算不丢：dt=0.4（累计 0.4）< 1 ⇒ 本帧 0 次点击',
    Math.abs((a4.res.kelp - k4) - 0) < 1e-9, 'kelp +' + (a4.res.kelp - k4).toFixed(2));
  ap.autoClick(a4, 0.7, noop);
  check('分数秒预算跨帧累积：再 dt=0.7（累计 1.1）⇒ 1 次点击',
    Math.abs((a4.res.kelp - k4) - 1) < 1e-9, 'kelp 总 +' + (a4.res.kelp - k4).toFixed(2));

  /* ⑥ 设置栏开关（2026-10-28 用户要求）：`s.autoClickOn === false` ⇒ 一次都不点、
   *    且预算**不累积**（关着的时候不该偷偷攒，否则重新打开会瞬间补一串点击）；
   *    改回 true ⇒ 立刻恢复；老存档没有这个字段 ⇒ 按「开」处理（不能因为加了个开关
   *    就让所有老玩家的自动点击凭空失效 —— 那是静默失效，最难查的一类）。 */
  const a6 = SB.state.freshRun(false);
  a6.perk.autoClick = 1;
  a6.autoClickOn = false;
  const k6 = a6.res.kelp;
  ap.autoClick(a6, 1.0, noop);
  check('开关关闭：autoClickOn=false ⇒ 一次都不点（资源不变）',
    Math.abs(a6.res.kelp - k6) < 1e-9, 'kelp +' + (a6.res.kelp - k6).toFixed(2));
  check('开关关闭：预算不累积（acc 仍为 0，重新开启不会补点）',
    Math.abs(a6.autoClickAcc || 0) < 1e-9, 'acc=' + (a6.autoClickAcc || 0).toFixed(3));
  a6.autoClickOn = true;
  ap.autoClick(a6, 1.0, noop);
  check('开关重新打开：立刻恢复 1 次/秒',
    Math.abs((a6.res.kelp - k6) - 1) < 1e-9, 'kelp +' + (a6.res.kelp - k6).toFixed(2));
  const a7 = SB.state.freshRun(false);
  a7.perk.autoClick = 1;
  delete a7.autoClickOn;                    // 模拟老存档：字段根本不存在
  const k7 = a7.res.kelp;
  ap.autoClick(a7, 1.0, noop);
  check('老存档缺 autoClickOn 字段 ⇒ 默认按「开」处理（行为不回退）',
    Math.abs((a7.res.kelp - k7) - 1) < 1e-9, 'kelp +' + (a7.res.kelp - k7).toFixed(2));

  /* ⑦ 跨周目继承（2026-10-28 用户拍「跨周目继承状态」）：meta.autoClickOn 是跨周目偏好，
   *    startRun 播种进新局 ⇒ 拨成「暂停」后破壳开新周目仍是暂停。
   *    ⚠️ 这里真走 startRun（不是直接改 s），否则测不到接线；末尾把它还原成「从未拨过」并留一局干净新档。 */
  const gm = SB.game, mm = gm.meta();
  const prefBefore = mm.autoClickOn;
  delete mm.autoClickOn;                      // 还原成「玩家从未拨过开关」
  gm.startRun();
  check('跨周目继承：meta 无偏好 ⇒ 新周目默认「开」',
    gm.run().autoClickOn === true, 'on=' + gm.run().autoClickOn);
  mm.autoClickOn = false;                     // 等价于玩家在设置里拨成暂停
  gm.startRun();
  const r2 = gm.run();
  r2.perk.autoClick = 1;
  const kk = r2.res.kelp;
  ap.autoClick(r2, 1.0, noop);
  check('跨周目继承：偏好=暂停 ⇒ 破壳后新周目仍是关（且真的一次都不点）',
    r2.autoClickOn === false && Math.abs(r2.res.kelp - kk) < 1e-9,
    'on=' + r2.autoClickOn + ' kelp +' + (r2.res.kelp - kk).toFixed(2));
  if (prefBefore === undefined) delete mm.autoClickOn; else mm.autoClickOn = prefBefore;
  gm.startRun();                              // 还原：留一局干净新档给后续套件

  /* ⑤ 自动拾取：有活跃事件 + 购 autoEvent ⇒ claim 领奖；无活跃/未购不误触。 */
  const ae1 = SB.state.freshRun(false);
  ae1.perk.autoEvent = 1;
  check('自动拾取：无活跃事件时不误触（返回 false）',
    ap.autoEventClaim(ae1, noop) === false);
  const ae2 = SB.state.freshRun(false);
  SB.events.forceSpawn('skyTremor');
  check('自动拾取：有活跃事件但未购 autoEvent ⇒ 不领（返回 false）',
    ap.autoEventClaim(ae2, noop) === false &&
    typeof SB.events.getActive() === 'object' && SB.events.getActive() !== null);
  const ae3 = SB.state.freshRun(false);
  ae3.perk.autoEvent = 1;
  const sciBefore = SB.economy.rates(ae3).science;
  SB.events.forceSpawn('skyTremor');
  const claimed = ap.autoEventClaim(ae3, noop);
  check('自动拾取：有活跃事件且已购 autoEvent ⇒ 自动领奖（claim 返回 true）',
    claimed === true && SB.events.getActive() === null,
    'claimed=' + claimed + ' active=' + SB.events.getActive());
  check('自动拾取领奖落地：科技点 = 速率 × 600（天壳震动）',
    Math.abs((ae3.res.science || 0) - sciBefore * 600) < 1e-6,
    'science → ' + (ae3.res.science || 0).toFixed(2) + '（rate=' + sciBefore.toFixed(4) + '）');
}

}
