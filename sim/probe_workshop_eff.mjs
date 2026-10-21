// 验证：workshopEff（ERA10）从「独立 ×2.2 乘区」改为「折进 _cr 基数的加法轴」。
// 纪律：面板===结算——craftMul 是工艺产出的唯一乘区出口（craft/stepOut/ai-strategy/面板 共用）。
// 注意：激光技术自 2026-10-21 起不再给全局 workshopEff（改为潮纹记录配方 +50%，见 probe_laser_tidalrecord.mjs）。
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = Math.abs(got - want) < 1e-9;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + '  got=' + got + '  want=' + want);
  ok ? pass++ : fail++;
}
function buildS(techs) {
  const s = SB.state.freshRun();
  s.techs = Object.assign({}, s.techs, techs);
  s.techVer = (s.techVer | 0) + 1;
  s.lvl.workshop = 100;            // 100 × 5% = 5.0 工艺制作效率（加法轴）
  s.wonders = {}; s.cards = {}; s.upgrades = {}; s.civics = {};
  s.perk = {}; s.got = {}; s.runBuffs = {};
  return s;
}
const c = { id: 'craft_stonebeam' };   // 非火箭、非潮纹记录配方 ⇒ 不触发 _recipeCraft

const sBase = buildS({});
const cr = SB.workshop.craftRatio(sBase);
console.log('craftRatio (100 工坊级) =', cr, '(期望 5.0)');
check('craftRatio=5.0', cr, 5.0);

// 无科技：_cr = 1 + 5.0 = 6.0
check('无科技 craftMul = 6.0', SB.workshop.craftMul(sBase, c), 6.0);

// 仅激光：激光自 2026-10-21 不再给全局 workshopEff ⇒ 对非潮纹记录配方 craftMul 仍 = 6.0
const sLaser = buildS({ laser: true });
check('激光(非潮纹记录配方) craftMul = 6.0（无全局加成）', SB.workshop.craftMul(sLaser, c), 6.0);

// ERA10(+120%)：应 = 1 + 5.0 + 1.2 = 7.2（基数 +120%，非 ×2.2 复利）
const era10list = (SB.TECHS || []).filter(t => t.eff && t.eff.workshopEff === 1.2);
check('找到唯一 ERA10 workshopEff+120% 科技', era10list.length, 1);
const era10id = era10list[0];
const sEra10 = buildS(era10id ? { [era10id.id]: true } : {});
check('ERA10 craftMul = 7.2（基数 +120%，不再 ×2.2）', SB.workshop.craftMul(sEra10, c), 7.2);
check('ERA10 ≠ 旧实现 6.0×2.2 = 13.2（乘区复利）', SB.workshop.craftMul(sEra10, c) === 13.2 ? 0 : 1, 1);

// 激光 + ERA10：激光对非潮纹记录配方无全局加成 ⇒ 仍 = 7.2
const sBoth = buildS(era10id ? { laser: true, [era10id.id]: true } : { laser: true });
check('激光+ERA10(非潮纹记录) craftMul = 7.2（激光不污染全局轴）', SB.workshop.craftMul(sBoth, c), 7.2);

// 面板===结算：render 用的 craftMul({id:'__global__'}) 同样含基数加法
check('面板口径(无 c 配方) ERA10 craftMul = 7.2', SB.workshop.craftMul(sEra10, { id: '__global__' }), 7.2);

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
