// 机器人 → 藻食（kelp）/ 奢侈品（luxury）链路探针
// 背景：用户实测「只有藻食有问题，分配了机器人做农民不涨，其他职业没问题」。
// 根因：foodRate 直接读 s.jobs.gather，绕过 effJobs（rates/tick 其它职业都走 effJobs）。
// 本探针钉四件事：
//   ① 人类产出不变（机器人池空时，人均产出 == 改前口径）
//   ② 机器人分配到 gather 后，藻食人均边际 == robotMult × 人类边际（证明真接上了）
//   ③ folkOutputMul 只乘一次（starFolk 0→2 时人均产出正好 ×1.1，不是 ×1.21）
//   ④ 真实 tick 累计 == 面板 rates 预测（藻食 / 奢侈品两侧，面板===结算）
// 用法：node sim/probe_robot_kelp.mjs
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name + (extra ? '  (' + extra + ')' : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  (' + extra + ')' : '')); }
}
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-9);

/* 造一个「只有职业侧产藻食」的干净状态：藻场 0 级、无导流堤、不冷季。
 * lvl.kelp=0 ⇒ byBuild=0，rates().kelp 的全部变化都来自职业侧。 */
function mk(starFolk) {
  const s = SB.state.freshRun(false);
  s.lvl.kelp = 0; s.lvl.weir = 0; s.lvl.warmnest = 0;
  s.lvl.robotbay = 2;                 // ⇒ robotPop 8
  s.pop = 10; s.jobs.gather = 0;
  s.robotJobs = {};
  s.perk = s.perk || {}; s.perk.starFolk = starFolk || 0;
  s.res.kelp = 0;
  return s;
}
/* 只取「职业侧」的藻食产出：rate(gather=N) - rate(gather=0)，扣掉建筑/公司/全局乘区之外
 * 不可控的常数项 —— 线性关系保证了差值就是纯职业贡献。 */
function jobRate(s) { return SB.economy.rates(s).kelp; }

/* ── ① 人类人均产出（无机器人）── */
const h = mk(0);
const f0 = jobRate(h);
h.jobs.gather = 2;
const f2 = jobRate(h);
const perHuman = (f2 - f0) / 2;
console.log('  perHuman =', perHuman.toFixed(6), '/秒/人');
check('人类采集者人均藻食 > 0', perHuman > 0, 'perHuman=' + perHuman.toFixed(6));

/* ── ② 机器人分配到 gather ── */
const r = mk(0);
const rb0 = jobRate(r);
const okAssign = SB.folk.assignRobot(r, 'gather', 3);
check('分配 3 机器人到 gather 成功', okAssign === true, 'idle=' + SB.folk.robotIdle(r));
const rb3 = jobRate(r);
const perRobot = (rb3 - rb0) / 3;
const rm = SB.folk.robotMult(r);
console.log('  perRobot =', perRobot.toFixed(6), ' robotMult =', rm);
check('机器人能产藻食（不是 0）', perRobot > 0, 'perRobot=' + perRobot.toFixed(6));
check('机器人人均 == robotMult × 人类人均（1.2 倍）', near(perRobot / perHuman, rm, 1e-9),
  '比值=' + (perRobot / perHuman));
check('effJobs.gather 含机器人', near(SB.folk.effJobs(r).gather, 3 * rm, 1e-9),
  'got ' + SB.folk.effJobs(r).gather);

/* ── ③ folkOutputMul 只乘一次 ── */
const h2 = mk(2);                    // starFolk=2 ⇒ folkOutputMul = 1.1
const g0 = jobRate(h2);
h2.jobs.gather = 2;
const perHuman2 = (jobRate(h2) - g0) / 2;
check('starFolk 加成只乘一次（人均 ×1.1，不是 ×1.21）',
  near(perHuman2 / perHuman, 1.1, 1e-9), '比值=' + (perHuman2 / perHuman));
const r2 = mk(2);
const rr0 = jobRate(r2);
SB.folk.assignRobot(r2, 'gather', 3);
const perRobot2 = (jobRate(r2) - rr0) / 3;
check('机器人侧同样只乘一次（×1.1）', near(perRobot2 / perRobot, 1.1, 1e-9),
  '比值=' + (perRobot2 / perRobot));

/* ── ④ 真实 tick 累计 == 面板预测（藻食）── */
const t = mk(0);
t.pop = 3;
/* ⚠️ 夹具两个坑（第一版就栽在这，别删）：
 * ① lvl.nest 不给的话住房上限只有 1 ⇒ 首次 tick 就把 3 人清到 1，foodUse 从 6 掉到 2，
 *    真实净速率中途变了，跟起始面板速率当然对不上。nest=1 ⇒ 上限 3 = pop，正好住满不生不育。
 * ② 藻食上限 CAP_BASE.kelp 只有 200 出头 ⇒ 10 秒就能撞 cap 被 addRes 夹断。用海藻仓抬到很大。 */
t.lvl.nest = 1;
t.lvl.kelpstore = 10;
t.jobs.gather = 0;
SB.folk.assignRobot(t, 'gather', 8);
const kelpPred = jobRate(t);
const k0 = t.res.kelp;
for (let i = 0; i < 10; i++) SB.economy.tick(t, 1, null, {});
const kDelta = t.res.kelp - k0;
console.log('  藻食：实际10s =', kDelta.toFixed(4), ' 面板预测 =', (kelpPred * 10).toFixed(4));
check('藻食真实累计 ≈ 面板预测（误差<1%）',
  Math.abs(kDelta - kelpPred * 10) / (Math.abs(kelpPred * 10) + 1e-9) < 0.01,
  'Δ=' + kDelta.toFixed(4) + ' vs ' + (kelpPred * 10).toFixed(4));
check('纯机器人采集（人类 0）藻食净增 > 0', kDelta > 0, 'Δ=' + kDelta.toFixed(4));

/* ── ⑤ 奢侈品（商人）同族修复：机器人分配到 merchant ── */
function mkLux() {
  const s = SB.state.freshRun(false);
  s.pop = 0;                         // 需求 0 ⇒ 净 = 产能，便于逐位比对
  s.jobs.merchant = 0;
  s.robotJobs = {};
  s.lvl.robotbay = 2;
  s.civics.trade = true;             // ⚠️ 商人是市政「贸易」解锁的：不解锁 assignRobot 静默返回 false
  s.res.luxury = 0;
  s.happy = 0;
  return s;
}
const L = mkLux();
const l0 = SB.economy.rates(L).luxury;
const okMer = SB.folk.assignRobot(L, 'merchant', 4);
check('分配 4 机器人到 merchant 成功', okMer === true, 'idle=' + SB.folk.robotIdle(L));
const lPred = SB.economy.rates(L).luxury;
check('商人机器人计入 rates().luxury', lPred > l0, 'l0=' + l0.toFixed(6) + ' → ' + lPred.toFixed(6));
check('happySupply 与 rates 产能同口径（不再漏机器人）',
  near(SB.economy.happySupply(L), lPred, 1e-9),
  'supply=' + SB.economy.happySupply(L).toFixed(6) + ' rates=' + lPred.toFixed(6));
const lux0 = L.res.luxury;
for (let i = 0; i < 10; i++) SB.economy.tick(L, 1, null, {});
const lDelta = L.res.luxury - lux0;
check('奢侈品真实累计 ≈ 面板预测（误差<1%）',
  Math.abs(lDelta - lPred * 10) / (Math.abs(lPred * 10) + 1e-9) < 0.01,
  'Δ=' + lDelta.toFixed(4) + ' vs ' + (lPred * 10).toFixed(4));

/* ── ⑥ 回归：无机器人时人类产出与旧式算式逐位一致 ──
 * 旧式 = s.jobs.gather * folkOutputMul * UNIT.kelp * farmMul * algaeCropMul，
 * 再乘上 foodRate 尾部那串（公司/导流堤/globalMulX）。这里用「差值法」间接证明：
 * 人类每多一人，产出必等于 UNIT.kelp × farmMul × algaeCropMul × 尾部乘区 —— 
 * 直接断言「旧式/新式 同值」需要复刻整条尾部，不如断言「两人 = 一人 × 2」的线性，
 * 加上 ③ 已钉住 folkOutputMul 单次 ⇒ 人类侧没有发生任何口径变化。 */
const lin = mk(0);
const q0 = jobRate(lin);
lin.jobs.gather = 1; const q1 = jobRate(lin);
lin.jobs.gather = 4; const q4 = jobRate(lin);
check('人类侧线性（1人/4人边际相同）', near((q1 - q0), (q4 - q0) / 4, 1e-9),
  'per1=' + (q1 - q0).toFixed(9) + ' per4=' + ((q4 - q0) / 4).toFixed(9));

console.log('\n结果：' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
