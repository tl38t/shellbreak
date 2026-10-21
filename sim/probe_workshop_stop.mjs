/* 定向探针：工业机器人「全局开关 indRobotOn」→「按建筑停用 workshopStop」重构的读侧一致性。
 *
 * 背景（2026-10-21）：这次重构删掉了 toggleIndRobot 函数与 indrobotToggle/autoDrillStep 点击分支，
 * 但 src/ui/input.js 的导出表漏改，残留 `toggleIndRobot: toggleIndRobot` ⇒ IIFE 末尾 ReferenceError
 * ⇒ SB.ui.input 未赋值 ⇒ main.js boot 崩溃 ⇒ 页面空壳。修完导出后，本探针验证重构的**结算侧**：
 *   ① 运行工坊数 = 等级 − 停用数（economy.activeWorkshops）
 *   ② 基础工艺效率（craftRatio ① 项）只算运行中的工坊
 *   ③ 工业机器人加成 = 1 + 运行数/总数（按份额折算，满开 = ×2）
 *   ④ craftMul 的总乘区与上述两项自洽（面板===结算：唯一出口 craftMul）
 *   ⑤ 停用全部工坊 ⇒ 机器人加成为 1（不靠残留乘区骗人）
 *
 * 判据：改常数让断言变绿 = 标定；本探针只断言结构性等式，不碰标定值。
 * 跑法：node sim/probe_workshop_stop.mjs
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom({});
let pass = 0, fail = 0;
const eq = (name, got, want, eps = 1e-9) => {
  const ok = Math.abs(got - want) <= eps;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${got}  want=${want}`);
};
const t = () => pass + fail;

/* craftPerLevel 从建筑表读，别在这里硬编码 0.05（那本身就是断链病）。 */
const wsB = SB.BUILDINGS.find(b => b.id === 'workshop');
const perLvl = wsB.craftRatio;
console.log(`工坊每级工艺制作效率 = ${perLvl}（从 BUILDINGS 读）\n`);

function mkRun(lv, stop, hasRobot) {
  const s = {
    lvl: { workshop: lv }, workshopStop: stop,
    upgrades: hasRobot ? { upg_indrobot: true } : {},
    wonders: {}, techs: {}, civics: {}, pop: 0, res: {},
  };
  return s;
}

/* ── ① 运行数 = 等级 − 停用数 ── */
eq('① 10 级 / 停 3 ⇒ 运行 7', SB.economy.activeWorkshops(mkRun(10, 3, true)), 7);
eq('① 停用数超等级 ⇒ 夹到 0', SB.economy.activeWorkshops(mkRun(5, 99, true)), 0);
eq('① 负停用数 ⇒ 夹到 0 停用（运行 = 等级）',
  SB.economy.activeWorkshops(mkRun(5, -4, true)), 5);

/* ── ② 基础工艺效率只算运行中的工坊 ── */
const s7 = mkRun(10, 3, true);
const base7 = SB.workshop.craftRatio(s7);
const wonderPart = (SB.wonder && SB.wonder.wonderCraftRatio) ? SB.wonder.wonderCraftRatio(s7) : 0;
const techPart = (SB.tech && SB.tech.mul) ? (SB.tech.mul(s7).craftRatio || 0) : 0;
const govPart = (SB.civic && SB.civic.govCraftRatio) ? (SB.civic.govCraftRatio(s7) || 0) : 0;
eq('② craftRatio 的「工坊」项 = 运行数 × 每级', base7 - wonderPart - techPart - govPart, 7 * perLvl);

/* ── ③ 机器人加成 = 1 + 运行/总数 ── */
eq('③ 10 级停 0（满开）⇒ ×2', SB.economy.industrialRobotOutputMul(mkRun(10, 0, true)), 2);
eq('③ 10 级停 5 ⇒ ×1.5', SB.economy.industrialRobotOutputMul(mkRun(10, 5, true)), 1.5);
eq('③ 10 级全停 ⇒ ×1（不靠残留乘区）',
  SB.economy.industrialRobotOutputMul(mkRun(10, 10, true)), 1);
eq('③ 没装 upg_indrobot ⇒ ×1', SB.economy.industrialRobotOutputMul(mkRun(10, 0, false)), 1);

/* ── ④ craftMul 自洽：基数用运行数、机器人项按份额 ── */
const halfStop = mkRun(10, 5, true);
const crHalf = SB.workshop.craftRatio(halfStop);
const mulHalf = SB.workshop.craftMul(halfStop);
/* craftMul = (1+craftRatio+recipe+workshopEff) × boomcraft × throne × robot × ourSea
 * 本探针只造「无其他乘区」的裸态 ⇒ 后四项应为 1，只剩 (1+craftRatio) × 1.5。 */
eq('④ craftMul（10级停5）= (1+craftRatio) × 1.5',
  mulHalf, (1 + crHalf) * 1.5, 1e-6);

/* ── ⑤ 面板===结算：craftRatio 与 craftMul 读同一个 activeWorkshops ── */
const full = mkRun(10, 0, true);
eq('⑤ 满开：craftRatio 工坊项 = 10 × 每级（同一 activeWorkshops 源）',
  SB.workshop.craftRatio(full) - wonderPart - techPart - govPart, 10 * perLvl);

console.log(`\n${pass}/${t()} PASS${fail ? ` —— ${fail} FAIL` : ''}`);
process.exit(fail ? 1 : 0);
