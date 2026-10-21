// 复现「机器人不起效」：验证 robotbay 人口 → assignRobot → effJobs 合并 → 生产率，
// 以及 upg_indrobot 工业机器人 craft 乘区。若全过 = 代码链路通，问题在「需手动分配/未自动分配」。
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = Math.abs(got - want) < 1e-6;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + '  got=' + got + '  want=' + want);
  ok ? pass++ : fail++;
}
function checkBool(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  cond ? pass++ : fail++;
}

const s = SB.state.freshRun();
s.lvl.robotbay = 2;            // robotPop = 8
s.pop = 100;                  // 人类人口足够，免得 autoAssign/limit 干扰
s.jobs = {};                  // 无人类职业，纯看机器人

// 1) robotPop 读数
check('robotPop = 4×2 = 8', SB.folk.robotPop(s), 8);

// 2) assignRobot 写入 s.robotJobs（miner 由科技 mining 解锁，先研究）
s.techs.mining = true;
const okAssign = SB.folk.assignRobot(s, 'miner', 5);
checkBool('assignRobot(miner,5) 成功', okAssign);
check('robotJobs.miner = 5', s.robotJobs.miner, 5);
check('robotIdle = 3', SB.folk.robotIdle(s), 3);

// 3) effJobs 合并机器人 ×1.2
const ej = SB.folk.effJobs(s);
check('effJobs.miner = 5×1.2 = 6', ej.miner, 6);

// 4) rates 实际产出含机器人（silt 由 miner 驱动）
const rWith = SB.economy.rates(s).silt;
console.log('rates.silt（机器人 5 矿工）=', rWith);
// 清空机器人对比
s.robotJobs = {};
const ej0 = SB.folk.effJobs(s);
check('清空后 effJobs.miner = 0', ej0.miner || 0, 0);
const rWithout = SB.economy.rates(s).silt;
console.log('rates.silt（无机器人）=', rWithout);
checkBool('机器人使 silt 产出上升', rWith > rWithout, '(' + rWith + ' > ' + rWithout + ')');

// 5) upg_strongai 把倍率升到 1.5
s.robotJobs = { miner: 5 };
s.upgrades.upg_strongai = true;
const ejAI = SB.folk.effJobs(s);
check('强人工智能后 effJobs.miner = 5×1.5 = 7.5', ejAI.miner, 7.5);
check('robotMult = 1.5', SB.folk.robotMult(s), 1.5);

// 6) upg_indrobot 工业机器人 craft 乘区（满开 ×2）
const s2 = SB.state.freshRun();
s2.lvl.workshop = 5;
s2.upgrades.upg_indrobot = true;
s2.workshopStop = 0;          // 全开
check('industrialRobotOutputMul（满开）= 2', SB.economy.industrialRobotOutputMul(s2), 2);
// 全停
s2.workshopStop = 5;
check('industrialRobotOutputMul（全停）= 1', SB.economy.industrialRobotOutputMul(s2), 1);
// 未买升级 ⇒ 1
const s3 = SB.state.freshRun();
s3.lvl.workshop = 5;
check('未买 upg_indrobot = 1', SB.economy.industrialRobotOutputMul(s3), 1);

// 7) craftMul 含工业机器人 ×2
const s4 = SB.state.freshRun();
s4.lvl.workshop = 5;
s4.upgrades.upg_indrobot = true;
const cm = SB.workshop.craftMul(s4, { id: 'craft_tidal_record' });
console.log('craftMul（工业机器人满开）=', cm, '（= (1+craftRatio 0.25) × 工业机器人 2 = 2.5）');
checkBool('craftMul 含工业机器人 ×2', Math.abs(cm - 2.5) < 1e-6, '(got ' + cm + ')');

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
