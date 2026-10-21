// 验证：robotbay 升级成本增长系数 ratio 改为 3（每级 ×3）。
// costOf(s,id) = base * ratio^level（其余乘区默认 1，无折扣源）。
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = Math.abs(got - want) < 1e-9;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + '  got=' + got + '  want=' + want);
  ok ? pass++ : fail++;
}

const s = SB.state.freshRun();
const base = SB.BUILDINGS.find(b => b.id === 'robotbay').cost;
console.log('robotbay 基础造价 =', JSON.stringify(base), 'ratio =', SB.BUILDINGS.find(b => b.id === 'robotbay').ratio);

// level 0 → 1：本级为第 1 级，_effN = max(0, 0 - 0) = 0 ⇒ 基础造价
s.lvl.robotbay = 0;
let c0 = SB.economy.costOf(s, 'robotbay');
check('L1 θ金属 = 100', c0.thetaMetal, 100);
check('L1 tiplate = 800', c0.tiplate, 800);

// level 1 → 2：_effN = 1 ⇒ ×3
s.lvl.robotbay = 1;
let c1 = SB.economy.costOf(s, 'robotbay');
check('L2 θ金属 = 300 (100×3)', c1.thetaMetal, 300);
check('L2 tiplate = 2400 (800×3)', c1.tiplate, 2400);

// level 2 → 3：_effN = 2 ⇒ ×9
s.lvl.robotbay = 2;
let c2 = SB.economy.costOf(s, 'robotbay');
check('L3 θ金属 = 900 (100×9)', c2.thetaMetal, 900);
check('L3 tiplate = 7200 (800×9)', c2.tiplate, 7200);

// 比值核验：每级恰为上一级 ×3
check('L2/L1 = 3', c1.thetaMetal / c0.thetaMetal, 3);
check('L3/L2 = 3', c2.thetaMetal / c1.thetaMetal, 3);

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
