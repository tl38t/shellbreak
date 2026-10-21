// 真实 tick 累计探针：验证机器人分配后，实际库存增量 == 面板 rates 预测。
// 用法：node sim/probe_robot_realtick.mjs
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name + (extra ? '  (' + extra + ')' : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  (' + extra + ')' : '')); }
}

// ---- 状态准备 ----
const s = SB.state.freshRun();
s.lvl.robotbay = 2;                 // 2 级 ⇒ robotPop = 8
s.techs.mining = true;              // 解锁 miner（否则 assignRobot 静默失败）
s.pop = 5; s.jobs.miner = 0;        // 人类不派矿工，纯测机器人

// 分配 8 个机器人到 miner
const okAssign = SB.folk.assignRobot(s, 'miner', 8);
check('分配 8 机器人到 miner 成功', okAssign === true, 'ridle=' + SB.folk.robotIdle(s));
check('s.robotJobs.miner == 8', (s.robotJobs.miner || 0) === 8, 'got ' + (s.robotJobs.miner || 0));

// effJobs 合并检查
const ej = SB.folk.effJobs(s);
check('effJobs.miner == 8×1.2 = 9.6', Math.abs(ej.miner - 9.6) < 1e-9, 'got ' + ej.miner);

// 面板速率
const rateSilt = SB.economy.rates(s).silt;
console.log('  面板 rates().silt =', rateSilt.toFixed(4), '/秒');

// ---- 真实 tick 累计 10 秒 ----
const before = s.res.silt || 0;
for (let i = 0; i < 10; i++) SB.economy.tick(s, 1, null, {});
const after = s.res.silt || 0;
const actualDelta = after - before;
const predicted = rateSilt * 10;
console.log('  实际 10s 库存增量 =', actualDelta.toFixed(4), ' 预测 =', predicted.toFixed(4));
check('真实累计增量 ≈ 面板预测（误差<1%）',
  Math.abs(actualDelta - predicted) / (Math.abs(predicted) + 1e-9) < 0.01,
  'Δ=' + actualDelta.toFixed(4) + ' vs ' + predicted.toFixed(4));

// ---- 对照：不分配机器人，纯人类 miner=0 时 silt 应为 0 ----
const s2 = SB.state.freshRun();
s2.lvl.robotbay = 2;
s2.techs.mining = true;
const b2 = s2.res.silt || 0;
for (let i = 0; i < 10; i++) SB.economy.tick(s2, 1, null, {});
const a2 = s2.res.silt || 0;
check('无机器人且人类 miner=0 时 silt 增量≈0', Math.abs(a2 - b2) < 1e-9, 'Δ=' + (a2 - b2));

// ---- 顶栏是否读 rates（含机器人）----
check('rates().silt 含机器人贡献 > 0', rateSilt > 0, 'got ' + rateSilt.toFixed(4));

console.log('\n结果：' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
