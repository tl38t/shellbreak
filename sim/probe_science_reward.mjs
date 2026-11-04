/* 忽视科文（science）挑战奖励全链路探针（2026-11-04）
 *
 * 玩家反馈：在「忽视科文」挑战周目里走到「驭星轮回」（戴森球竣工后点轮回），
 * 感觉轮回奖励被吞了。本探针把这条链拆成可断言的点：
 *   ① 破壳即判：seal → sealRun 是否写 meta.challenges.completed
 *   ② 破壳时没学《神学》：判定挂起，补学后 evaluate 是否补判
 *   ③ 破壳后解除限制并把学者堆回 20：补判必须仍读 seal（不能被惩罚）
 *   ④ 驭星轮回结算：doBreak 的轮回点 / 星屑增量是否与 breakReport 预览一致
 *   ⑤ 永久奖励是否真的接到产出上（scienceCultureMul / challengePointMul）
 *   ⑥ 重打（replay）：只刷榜不发奖是设计，但要能区分出「这是 replay 不是吞」
 *   ⑦ tier 与 tierDone 不一致时静默 null（旧档风险点）
 *
 * 跑法：node sim/probe_science_reward.mjs
 */
import { loadNoDom } from './load-sb.mjs';

const { ctx, SB } = loadNoDom();
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra === undefined ? '' : '  ← ' + extra)); }
}
function eq(name, got, want) { check(name, got === want, 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }

/* 每个场景用独立 meta（跨周目账本） */
function freshMeta(opts) {
  const m = SB.state.emptyMeta();
  m.shopUnlocked = true;
  m.religionSeen = true;
  if (opts && opts.completed) m.challenges.completed = Object.assign(m.challenges.completed, opts.completed);
  return m;
}
function useMeta(m) { SB.game.meta = () => m; return m; }

/* 造一个「已经在忽视科文某一档、即将破壳」的局 */
function makeRun(tier, opts) {
  opts = opts || {};
  const s = SB.state.freshRun(false);
  s.challenge = { id: 'science', tier: tier, replay: false, startedAt: 0 };
  s.challengeDone = false;
  s.challengeOutcome = null;
  s.challengeSeal = null;
  s.challengeReleased = false;
  s.civics = s.civics || {};
  s.civics.theology = opts.theology === false ? 0 : 1;
  s.jobs.scholar = opts.scholar === undefined ? 5 : opts.scholar;
  s.jobs.scribe = opts.scribe === undefined ? 5 : opts.scribe;
  s.peak = opts.peak || 300;
  s.pop = s.peak;
  s.res.science = 1000;
  s.res.culture = 1000;
  s.shell = 0;
  s.shellOpened = true;
  s.broken = true;
  s.lvl = s.lvl || {};
  s.lvl.library = 3;          // 保证科文产出非零，便于检查乘区
  return s;
}

console.log('\n=== ① 破壳即判（学神学、岗位在档内）===');
{
  const m = useMeta(freshMeta({ completed: { science: 2 } }));  // 前两档已通
  const s = makeRun(2);              // 第三档，上限 5
  /* 模拟 onShellZero 的两步：先冻 seal，再当场判 */
  s.challengeSeal = SB.challenges.seal(s);
  const out = SB.challenges.sealRun(s, m);
  check('sealRun 返回非空结果', !!out, String(out));
  eq('结果不是 failed', !!(out && out.failed), false);
  eq('meta.challenges.completed.science = 3（第三档）', m.challenges.completed.science, 3);
  eq('s.challengeDone = true', s.challengeDone, true);
  eq('scienceCultureMul = 1 + 2（+200%）= 3', SB.challenges.scienceCultureMul(s), 3);
  eq('completedCount = 3（三档各 +10% 轮回点）', SB.challenges.completedCount(m), 3);

  /* ④ 驭星轮回结算 */
  s.dysonDone = true;
  s.civics.ascend_void = 0;
  const rep = SB.prestige.breakReport(s);
  const tideBefore = m.tide, sdBefore = m.stardust;
  const r = SB.prestige.doBreak(s, () => {});
  check('doBreak 返回结算报告', !!r, String(r));
  check('meta.tide 增量 = 预览 tidePoints', Math.abs((m.tide - tideBefore) - rep.tidePoints) < 1e-6,
    'delta=' + (m.tide - tideBefore) + ' preview=' + rep.tidePoints);
  eq('meta.stardust 增量 = 预览 stardust', (m.stardust - sdBefore), rep.stardust);
  check('挑战点乘区 = 1 + 3×10% = 1.3', Math.abs(rep.challengePointMul - 1.3) < 1e-9, String(rep.challengePointMul));
  eq('结算后 s.breakSettled = true', s.breakSettled, true);
}

console.log('\n=== ② 破壳时没学《神学》：挂起 → 补学后补判 ===');
{
  const m = useMeta(freshMeta({ completed: { science: 2 } }));
  const s = makeRun(2, { theology: false });
  s.challengeSeal = SB.challenges.seal(s);
  const out1 = SB.challenges.sealRun(s, m);
  eq('破壳当刻判定返回 null（挂起）', out1, null);
  eq('账本停在前两档（本次未写）', m.challenges.completed.science, 2);
  eq('challengeSeal 已存在', !!(s.challengeSeal && s.challengeSeal.scholar === 5), true);
  eq('challengeDone 仍是 false', s.challengeDone, false);

  /* 补学神学 → evaluate 补判 */
  s.civics.theology = 1;
  const out2 = SB.challenges.evaluate(s, m);
  check('补学后 evaluate 补判出结果', !!out2, String(out2));
  eq('账本写入 3', m.challenges.completed.science, 3);
  eq('challengeDone = true', s.challengeDone, true);
}

console.log('\n=== ③ 破壳后解除限制 + 学者堆回 20，再补学神学 ===');
{
  const m = useMeta(freshMeta({ completed: { science: 2 } }));
  const s = makeRun(2, { theology: false });
  s.challengeSeal = SB.challenges.seal(s);
  SB.challenges.sealRun(s, m);            // 挂起
  s.challengeReleased = true;             // 玩家点了「解除限制」
  s.jobs.scholar = 20; s.jobs.scribe = 20; // 限制解除后堆回去
  s.civics.theology = 1;
  const out = SB.challenges.evaluate(s, m);
  check('补判仍读 seal（学者 20 不惩罚）', !!out && !out.failed, String(out));
  eq('账本写入 3', m.challenges.completed.science, 3);
}

console.log('\n=== ④ 破壳瞬间岗位超档（限制失效/老档）→ 静默 null ===');
{
  const m = useMeta(freshMeta());
  const s = makeRun(0, { scholar: 20 });   // 第一档上限 15，学者 20
  s.challengeSeal = SB.challenges.seal(s);
  const out = SB.challenges.sealRun(s, m);
  eq('判定返回 null（无失败原因、无提示）', out, null);
  eq('账本未写', m.challenges.completed.science, 0);
  eq('challengeDone 仍 false ⇒ 之后每帧 evaluate 都会重复尝试', s.challengeDone, false);
}

console.log('\n=== ⑤ 重打（三档全通后再打）：只刷榜、不发奖 ===');
{
  const m = useMeta(freshMeta({ completed: { science: 3 } }));
  const s = makeRun(2);
  s.challenge.replay = true;
  s.challengeSeal = SB.challenges.seal(s);
  const out = SB.challenges.sealRun(s, m);
  check('返回 replay 结果', !!(out && out.replay), JSON.stringify(out));
  eq('reward 为 null（不发奖）', out && out.reward, null);
  eq('账本保持 3（不重复累加）', m.challenges.completed.science, 3);
}

console.log('\n=== ⑥ tier 与 tierDone 不一致：静默 null（旧档风险）===');
{
  const m = useMeta(freshMeta({ completed: { science: 1 } }));
  const s = makeRun(1);                    // tier=1（第二档），账本 = 1 ⇒ 一致
  s.challengeSeal = SB.challenges.seal(s);
  const ok = SB.challenges.sealRun(s, m);
  check('一致时应判定成功', !!ok, String(ok));

  const m2 = useMeta(freshMeta({ completed: { science: 1 } }));
  const s2 = makeRun(2);                   // tier=2，账本 = 1 ⇒ 不一致
  s2.challengeSeal = SB.challenges.seal(s2);
  const bad = SB.challenges.sealRun(s2, m2);
  eq('不一致时返回 null（静默吞掉）', bad, null);
  eq('账本停在 1', m2.challenges.completed.science, 1);
}

console.log('\n=== ⑦ 结算预览 vs 实际入账（无挑战时对照）===');
{
  const m = useMeta(freshMeta());
  const s = makeRun(0);
  s.challenge = null;                      // 非挑战局
  s.dysonDone = true;
  const rep = SB.prestige.breakReport(s);
  const before = m.tide;
  SB.prestige.doBreak(s, () => {});
  check('非挑战局 delta = 预览', Math.abs((m.tide - before) - rep.tidePoints) < 1e-6,
    'delta=' + (m.tide - before) + ' preview=' + rep.tidePoints);
  eq('非挑战局 challengePointMul = 1', rep.challengePointMul, 1);
}

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
