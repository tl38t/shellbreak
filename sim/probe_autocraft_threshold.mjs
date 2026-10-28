/* 验证 workshop.autoReady 百分比触发门槛修复（2026-10-22）。
 * 证明：满仓档配方（全有限输入）现在按「容量×档位」触发，100% = 旧行为；
 * 批次档配方（含无上限输入）不受影响。 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
const W = SB.workshop;
SB.game.markDirty = () => {};   // 无 DOM 桩补齐 autoTick 末尾的脏标记调用

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? '  (got=' + got + ')' : '')); }
}
function approx(a, b) { return Math.abs(a - b) < 1e-9; }

// 最小 state：capOf 读 SB.CFG，craftCostMul 在无升级时=1
function st(res) {
  return { res: res || {}, lvl: {}, upgrades: {}, techs: {}, civics: {} };
}
function rec(id) { return W.craftById(id); }

console.log('— 满仓档：燃料（in={warmstone:100}, cap=600）—');
const fuel = rec('craft_rocketfuel');
ok('25% @暖石100 不触发', W.autoReady(st({ warmstone: 100 }), fuel, { pct: 0.25 }) === false);
ok('25% @暖石150 触发', W.autoReady(st({ warmstone: 150 }), fuel, { pct: 0.25 }) === true);
ok('25% @暖石600 触发', W.autoReady(st({ warmstone: 600 }), fuel, { pct: 0.25 }) === true);
ok('100% @暖石599 不触发(向后兼容)', W.autoReady(st({ warmstone: 599 }), fuel, { pct: 1 }) === false);
ok('100% @暖石600 触发', W.autoReady(st({ warmstone: 600 }), fuel, { pct: 1 }) === true);

console.log('— 满仓档：绳（in={kelp:100}, cap=200, 一份=100>25%×200=50 ⇒ 下界取100）—');
const rope = rec('craft_rope');
ok('25% @藻食50 不触发', W.autoReady(st({ kelp: 50 }), rope, { pct: 0.25 }) === false);
ok('25% @藻食100 触发(取到一份)', W.autoReady(st({ kelp: 100 }), rope, { pct: 0.25 }) === true);
ok('100% @藻食199 不触发', W.autoReady(st({ kelp: 199 }), rope, { pct: 1 }) === false);
ok('100% @藻食200 触发', W.autoReady(st({ kelp: 200 }), rope, { pct: 1 }) === true);

console.log('— 满仓档：石梁（in={stone:100}, cap=400）100% 向后兼容 —');
const beam = rec('craft_stonebeam');
ok('100% @石头399 不触发', W.autoReady(st({ stone: 399 }), beam, { pct: 1 }) === false);
ok('100% @石头400 触发', W.autoReady(st({ stone: 400 }), beam, { pct: 1 }) === true);

console.log('— 批次档：钢制零件（in={steel:25}, steel 无上限 ⇒ 原逻辑不变，按默认批次数触发）—');
const steel = rec('craft_steelpart');
ok('批次档 @钢0 不触发', W.autoReady(st({ steel: 0 }), steel, { pct: 0.25 }) === false);
ok('批次档 @钢2000 触发(够80批)', W.autoReady(st({ steel: 2000 }), steel, { pct: 0.25 }) === true);
ok('批次档 pct 不影响判定(0.25 与 1 同)', W.autoReady(st({ steel: 2000 }), steel, { pct: 1 }) === true);

console.log('— autoTick 实测：燃料槽 25%，暖石150，精炼已研究 ⇒ 造 1 份、暖石-100、燃料+1 —');
const s2 = st({ warmstone: 150, rocketFuel: 0 });
s2.lvl.workshop = 1;
s2.upgrades = { upg_autoshop: true };   // 开了「自动工坊」升级才有槽权限
s2.techs = { refine: true };
s2.autoSlots = [{ id: 'craft_rocketfuel', pct: 0.25 }];
const made = W.autoTick(s2, null);
ok('autoTick 造出 >0 份(阈值150已触发)', made > 0, made);
ok('暖石精确扣除 100（150→50）', approx(s2.res.warmstone, 50), s2.res.warmstone);
ok('燃料产出已入账(含工艺效率乘区)', s2.res.rocketFuel > 1, s2.res.rocketFuel);

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
