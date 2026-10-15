/* e2e suite: prestige auto-click; uses the caller's shared fixture and check collector. */
export function run({ SB, check }) {

/* ── 轮回商店：自动点击（采集 + 点击事件）──
 * 覆盖：① API 露出；② autoClick 按「帧钟真实秒 × 等级」累计、整批执行（秒率不随倍速放大）；
 *       ③ 三档叠加 ⇒ s.perk.autoClick=3 ⇒ 3 次/秒；④ 分数秒预算跨帧累积（不丢点击）；
 *       ⑤ 自动拾取：有活跃事件且购 autoEvent ⇒ claim 领奖，无活跃/未购则不误触。
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
