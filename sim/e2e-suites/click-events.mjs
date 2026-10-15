/* e2e suite: click-time events; uses the caller's shared fixture and check collector. */
export function run({ SB, check, noop }) {

/* ===========================================================================
 * 点击时间事件系统（天壳震动 / 深海火喷泉 / 信仰显圣 / 潮信石）
 * 覆盖：① API 露出；② eligible 解锁门（各事件只在该解锁时进候选池）；
 *       ③ forceSpawn + claim 的奖励落地（锚定 rates × 系数，不破平衡）；
 *       ④ 信仰显圣的临时全产 buff 真的进 globalMul（×1.10 乘区，且过期回收）；
 *       ⑤ claim 无活动事件时安全返回 false；⑥ 在线 update 勾子不抛错；
 *       ⑦ 独立 RNG 纪律（不替换/重设 SB.rng）。
 * ⚠️ 不测 RNG 生成概率（那要钉 Date.now 才有意义，且属标定）——
 *    确定性走 forceSpawn 这条绕过 RNG 与计时的测试钩子。
 * ⚠️ ⚠️ 这条纪律的来历（见 docs/JUDGMENTS §）：事件系统的 mulberry32 必须**绝不**
 *    碰 SB.rng —— 否则会冲掉 economy 冰封期冻结掷骰依赖的随机流，把 7.79h
 *    真开局基线冲歪。所以 ⑦ 是这条系统最该钉死的断言。 */
console.log('\n=== 点击时间事件系统 ===');
{
  const ev = SB.events;
  check('事件系统 API 已露出（update/claim/forceSpawn/getActive/timeLeft）',
    !!ev && typeof ev.update === 'function' && typeof ev.claim === 'function' &&
    typeof ev.forceSpawn === 'function' && typeof ev.getActive === 'function' &&
    typeof ev.timeLeft === 'function',
    ev ? Object.keys(ev).join(',') : '（SB.events 缺失）');

  /* ① 解锁门：freshRun 只有天壳震动（unlock 恒 true）。 */
  const s0 = SB.state.freshRun(false);
  const pool0 = ev.EVENTS.filter(d => d.unlock(s0)).map(d => d.id);
  check('开局只有「天壳震动」进入候选（其余各有解锁门槛）',
    JSON.stringify(pool0) === JSON.stringify(['skyTremor']), pool0.join(',') || '（空）');

  /* 采石/采矿后，深海火喷泉解锁。 */
  const s1 = SB.state.freshRun(false);
  s1.techs.mining = true; s1.techs.quarry = true;
  const pool1 = ev.EVENTS.filter(d => d.unlock(s1)).map(d => d.id).sort();
  check('掌握采矿+采石 ⇒ 「深海火喷泉」解锁',
    pool1.indexOf('fireVent') >= 0, pool1.join(',') || '（空）');

  /* 神学与历法+观潮解锁其余两条。 */
  const s2 = SB.state.freshRun(false);
  s2.civics.theology = true; s2.techs.calendar = true; s2.techs.tiddivine = true;
  const pool2 = ev.EVENTS.filter(d => d.unlock(s2)).map(d => d.id).sort();
  check('神学 ⇒ 信仰显圣；历法+观潮 ⇒ 潮信石，均解锁',
    pool2.indexOf('faithVision') >= 0 && pool2.indexOf('tideStone') >= 0,
    pool2.join(',') || '（空）');

  /* ② 天壳震动奖励 = rates.science × 600；claim 前后活动态正确翻转。 */
  const s3 = SB.state.freshRun(false);
  s3.jobs.scholar = 2;                                   // 学者产科技，无科技门槛
  const rateSci = SB.economy.rates(s3).science;
  check('claim 无活动事件时安全返回 false（不抛错、不改状态）',
    ev.claim(s3, noop) === false);
  ev.forceSpawn('skyTremor');
  check('forceSpawn 后 getActive 返回该事件定义',
    !!ev.getActive() && ev.getActive().id === 'skyTremor',
    ev.getActive() ? ev.getActive().id : '（无）');
  const sciBefore = s3.res.science || 0;
  const okClaim = ev.claim(s3, noop);
  check('天壳震动：claim 成功且科技点 = 速率×600',
    okClaim && Math.abs((s3.res.science || 0) - (sciBefore + rateSci * 600)) < 1e-6,
    'sci ' + sciBefore.toFixed(2) + ' → ' + (s3.res.science || 0).toFixed(2) +
    '（rate=' + rateSci.toFixed(4) + ' ×600=' + (rateSci * 600).toFixed(2) + '）');
  check('claim 后活动事件被清空（getActive 回 null）', ev.getActive() === null);

  /* ③ 信仰显圣：信仰奖励 + 临时全产 buff 进 globalMul（×1.10）且过期回收。 */
  const s4 = SB.state.freshRun(false);
  s4.civics.theology = true;                             // 神学解锁信仰产出（pop×FAITH_PER_POP）
  const rateFaith = SB.economy.rates(s4).faith;
  const faithBefore = s4.res.faith || 0;
  ev.forceSpawn('faithVision');
  ev.claim(s4, noop);
  check('信仰显圣：信仰点 = 速率×600 落地',
    Math.abs((s4.res.faith || 0) - (faithBefore + rateFaith * 600)) < 1e-6,
    'faith ' + faithBefore.toFixed(2) + ' → ' + (s4.res.faith || 0).toFixed(2) +
    '（rate=' + rateFaith.toFixed(4) + '）');
  check('…且写入 eventAllUntil（墙钟未来戳，临时 buff 计时源）',
    typeof s4.eventAllUntil === 'number' && s4.eventAllUntil > Date.now(),
    'eventAllUntil=' + s4.eventAllUntil + ' now=' + Date.now());
  /* ⚠️ 不跟「基准绝对数」比（基准会因 faithAllMul 等随信仰存量浮动，
   *    claim 一次给 12 信仰就触发 ×1.01），只钉 buff 的**相对效果**：
   *    命中期 ÷ 过期后 = ×1.10，过期即原样收回。 */
  const withBuff = SB.economy.globalMul(s4);
  s4.eventAllUntil = Date.now() - 1000;                  // 手工置于过期
  const noBuff = SB.economy.globalMul(s4);
  check('临时全产 buff 真的进 globalMul（命中 ×1.10，过期即收回，比值钉死）',
    Math.abs(withBuff / noBuff - 1.10) < 1e-9,
    '命中 ' + withBuff.toFixed(4) + ' ÷ 过期 ' + noBuff.toFixed(4) + ' = ' + (withBuff / noBuff).toFixed(4));

  /* ④ 深海火喷泉（石材/金属，capped 资源经 addRes 截断）—— 锚定逻辑同口径。 */
  const s5 = SB.state.freshRun(false);
  s5.techs.mining = true; s5.techs.quarry = true;
  s5.jobs.quarrier = 2; s5.jobs.miner = 2;
  const r5 = SB.economy.rates(s5);
  const stoneBefore = s5.res.stone || 0, siltBefore = s5.res.silt || 0;
  const stoneWant = Math.min(r5.stone * 120, SB.economy.capOf(s5, 'stone') - stoneBefore);
  const siltWant = Math.min(r5.silt * 120, SB.economy.capOf(s5, 'silt') - siltBefore);
  ev.forceSpawn('fireVent');
  ev.claim(s5, noop);
  const stoneGot = (s5.res.stone || 0) - stoneBefore;
  const siltGot = (s5.res.silt || 0) - siltBefore;
  check('深海火喷泉：石头/金属各 = 速率×120（capped 资源不破上限）',
    Math.abs(stoneGot - stoneWant) < 1e-6 && Math.abs(siltGot - siltWant) < 1e-6,
    'stone +' + stoneGot.toFixed(2) + '（want ' + stoneWant.toFixed(2) + '）' +
    ' silt +' + siltGot.toFixed(2) + '（want ' + siltWant.toFixed(2) + '）');

  /* ⑤ 潮信石（市政点，无上限）。 */
  const s6 = SB.state.freshRun(false);
  s6.techs.calendar = true; s6.techs.tiddivine = true;
  s6.jobs.scribe = 2;                                    // 书手产市政点
  const rateCul = SB.economy.rates(s6).culture;
  const culBefore = s6.res.culture || 0;
  ev.forceSpawn('tideStone');
  ev.claim(s6, noop);
  check('潮信石：市政点 = 速率×300 落地（无上限资源不截断）',
    Math.abs((s6.res.culture || 0) - (culBefore + rateCul * 300)) < 1e-6,
    'culture ' + culBefore.toFixed(2) + ' → ' + (s6.res.culture || 0).toFixed(2) +
    '（rate=' + rateCul.toFixed(4) + ' ×300=' + (rateCul * 300).toFixed(2) + '）');

  /* ⑥ 在线 update 勾子不抛错（真实 Date.now + 独立 RNG，freshRun 下大概率不生成，但必须安全）。 */
  const s7 = SB.state.freshRun(false);
  let threw = false;
  try { ev.update(s7, noop); } catch (e) { threw = true; }
  check('在线 update 勾子不抛错（独立 RNG，不碰 SB.rng）', !threw);

  /* ⑦ 独立 RNG 纪律（运行时验证）：给 SB.rng 套一个计数包装，连跑多次 ev.update
   *    （内部会走事件自己的 closure rng 做生成掷骰）后，确认游戏的 SB.rng 一次都没被碰过。
   *    ⚠️ 这条纪律的来历：economy 的冰封期冻结掷骰依赖 SB.rng，事件若共用会冲歪
   *    7.79h 真开局基线。测完立刻复原（无论本来有没有 rng），不影响后续。 */
  let rngCalls = 0;
  const realRng = SB.rng;
  SB.rng = function () { rngCalls++; return 0.5; };
  const s8 = SB.state.freshRun(false);
  for (let i = 0; i < 200; i++) ev.update(s8, noop);    // 触发多次 roll 尝试窗口
  const touched = rngCalls;
  SB.rng = realRng;
  check('事件系统 RNG 完全独立于 SB.rng（update ×200 未触碰游戏随机源）',
    touched === 0, 'SB.rng 被调用 ' + touched + ' 次');
}

}
