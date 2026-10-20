/* Fast targeted smoke for ERA9 wiring (no DOM). Validates the new logic without the heavy full e2e. */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom({});
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  ' + detail : '')); }
}
const finite = v => typeof v === 'number' && isFinite(v);

console.log('\n=== ERA9 静态形状 ===');
const T = SB.TECHS, byId = {}; T.forEach(t => byId[t.id] = t);
const era9ids = ['nuclear_fusion','ecological_restoration','interplanetary','microwave_heat',
  'alien_eng','blackhistory','terraform','interlog','winter'];
ok('9 个 ERA9 科技全部存在', era9ids.every(id => byId[id]),
  era9ids.filter(id => !byId[id]).join(',') || '全在');
ok('ERA9 科技 era 字段=9', era9ids.every(id => byId[id] && byId[id].era === 9));
ok('核聚变 eff 直读（无通用 mul 键）', !(byId.nuclear_fusion.eff && Object.keys(byId.nuclear_fusion.eff).length));
ok('行星际快速物流 alienOutMul=0.2', byId.interlog.eff && byId.interlog.eff.alienOutMul === 0.2);
/* G.E.E.K 奇观配置本轮未建（用户要求最后单独做），故 ecological_restoration 的 unlockWonder 暂未登记（eff 空）。
 * 此处仅验证科技存在且归属光帆纪；unlockWonder 待 G.E.E.K 落地后再接。 */
ok('生态重塑 归属纪元九（G.E.E.K 奇观待最后实装）', byId.ecological_restoration && byId.ecological_restoration.era === 9);
ok('超远距微波加热 unlockBuild=europa_launch', byId.microwave_heat.eff && (byId.microwave_heat.eff.unlockBuild||[]).indexOf('europa_launch')>=0);
ok('大型异星工程 unlockBuild=mars_workshop', byId.alien_eng.eff && (byId.alien_eng.eff.unlockBuild||[]).indexOf('mars_workshop')>=0);
ok('黑历史蓝图 workshopEff=1.2', byId.blackhistory.eff && byId.blackhistory.eff.workshopEff === 1.2);
ok('核热厂/欧罗巴/火星 建筑存在', ['fissionplant','europa_launch','mars_workshop'].every(id => SB.BUILDINGS.some(b=>b.id===id)));
const bz = SB.BUILD_ZONE_OF || {};
ok('mars_workshop 分区=space', bz.mars_workshop === 'space', JSON.stringify(bz.mars_workshop));
ok('europa_launch 分区=core', bz.europa_launch === 'core', JSON.stringify(bz.europa_launch));

console.log('\n=== costOf 减消耗管线 ===');
const s0 = SB.state.freshRun(false);
s0.lvl.siltpit = 10;
const cOff0 = SB.economy.costOf(s0, 'siltpit');
s0.geek.costOffset = 3;
const cOff3 = SB.economy.costOf(s0, 'siltpit');
const k0 = Object.keys(cOff0)[0];
ok('覆盖建筑 siltpit：costOffset=3 时造价更低', cOff3[k0] < cOff0[k0],
  k0 + ' 关=' + cOff0[k0].toFixed(2) + ' 开=' + cOff3[k0].toFixed(2));
const s0b = SB.state.freshRun(false);
s0b.lvl.robotbay = 6; // robotbay 不是覆盖建筑
const cNb0 = SB.economy.costOf(s0b, 'robotbay');
s0b.geek.costOffset = 3;
const cNb3 = SB.economy.costOf(s0b, 'robotbay');
ok('非覆盖建筑 robotbay：costOffset 无影响', Math.abs(cNb3[k0] - cNb0[k0]) < 1e-9 || Object.keys(cNb3)[0]===Object.keys(cNb0)[0] && cNb3[Object.keys(cNb0)[0]]===cNb0[Object.keys(cNb0)[0]]);

console.log('\n=== 马尔斯工造中心产出（tick===rates）===');
const s1 = SB.state.freshRun(false);
s1.lvl.mars_workshop = 10;
SB.economy.tick(s1, 1);
const r1 = SB.economy.rates(s1);
ok('tick 后 tiplate 增加且有限', finite(s1.res.tiplate) && s1.res.tiplate > 0, 'tiplate=' + (s1.res.tiplate||0).toFixed(3));
ok('tick 后 titanium 增加且有限', finite(s1.res.titanium) && s1.res.titanium > 0, 'titanium=' + (s1.res.titanium||0).toFixed(3));
ok('rates.tiplate 有限且>0', finite(r1.tiplate) && r1.tiplate > 0, 'rate=' + (r1.tiplate||0).toFixed(3));
ok('rates.titanium 有限且>0', finite(r1.titanium) && r1.titanium > 0, 'rate=' + (r1.titanium||0).toFixed(3));
ok('rates.tiplate 与 tick 一致（dt=1）', Math.abs(r1.tiplate - (s1.res.tiplate||0)) < 1e-6, 'diff=' + Math.abs(r1.tiplate-(s1.res.tiplate||0)));

console.log('\n=== 欧罗巴发射场 + 太阳帆 ===');
const s2 = SB.state.freshRun(false);
s2.lvl.hydroturbine = 20; s2.res.warmstone = 1e6;
s2.lvl.europa_launch = 1; s2.res.strongProp = 1e6; s2.res.thinafilm = 1e6;
for (let i=0;i<20;i++) SB.economy.tick(s2, 1);
const r2 = SB.economy.rates(s2);
ok('跑满 20s 后 sunSails >= 1', (s2.sunSails||0) >= 1, 'sunSails=' + (s2.sunSails||0) + ' proc=' + (s2.sunSailProc||0).toFixed(2));
ok('europa 满供时 strongProp 净速率<0', finite(r2.strongProp) && r2.strongProp < 0, 'rate=' + (r2.strongProp||0).toFixed(3));
ok('europa 满供时 thinafilm 净速率<0', finite(r2.thinafilm) && r2.thinafilm < 0, 'rate=' + (r2.thinafilm||0).toFixed(3));
// 断流测试：撤掉汽轮机后不应再累帆、不应再扣料
const before = (s2.sunSails||0);
s2.lvl.hydroturbine = 0;
for (let i=0;i<20;i++) SB.economy.tick(s2, 1);
ok('断流后 sunSails 不再增长', (s2.sunSails||0) === before, 'sunSails=' + (s2.sunSails||0));

console.log('\n=== 太阳帆热液能供给 ===');
const s3 = SB.state.freshRun(false);
s3.sunSails = 10;
const hf3 = SB.economy.hydroAlloc(s3, 1);
const r3 = SB.economy.rates(s3);
ok('10 帆 ⇒ hydroAlloc supplyRate=0.5', Math.abs(hf3.supplyRate - 0.5) < 1e-9, 'supply=' + hf3.supplyRate);
ok('10 帆 ⇒ rates.hydroSupply=0.5', Math.abs(r3.hydroSupply - 0.5) < 1e-9, 'hydroSupply=' + r3.hydroSupply);

console.log('\n=== 核聚变 核热厂 ×5 产出 / ×2 铀耗 ===');
const s4 = SB.state.freshRun(false);
s4.lvl.fissionplant = 5; s4.res.uranium = 1e6;
const hf4a = SB.economy.hydroAlloc(s4, 1);
s4.techs.nuclear_fusion = true;
const hf4b = SB.economy.hydroAlloc(s4, 1);
ok('核聚变使核热厂 hydro ×5', Math.abs(hf4b.fissionRate - hf4a.fissionRate*5) < 1e-9, '前=' + hf4a.fissionRate + ' 后=' + hf4b.fissionRate);
// 铀耗 ×2
const s5 = SB.state.freshRun(false);
s5.lvl.fissionplant = 5; s5.res.uranium = 1e6;
SB.economy.tick(s5, 1); const ua = 1e6 - s5.res.uranium;
s5.techs.nuclear_fusion = true; s5.res.uranium = 1e6;
SB.economy.tick(s5, 1); const ub = 1e6 - s5.res.uranium;
ok('核聚变使核热厂铀耗 ×2', Math.abs(ub - ua*2) < 1e-9, '前=' + ua.toFixed(4) + ' 后=' + ub.toFixed(4));

console.log('\n=== 行星际航行：异星建筑星空 +5%/级 ===');
// 两 state 都开 interplanetary。关键：保持 lvlSum 相等（breakCoef 含 lvlSum），
// 否则改异星等级会顺带改 breakCoef，比值就不纯了。
// A：异星 0 级 + 给中立建筑 nest 补 30 级；B：异星各 10 级（合计 30）+ nest 0。
// ⇒ breakCoef 一致，差异只剩 alienStarMul：1 vs 1+0.05×30=2.5。
function starState(alienLv, neutralLv) {
  const s = SB.state.freshRun(false);
  s.shell = 0; s.broken = true; s.starComplete = false; s.starExplore = 0;
  s.techs.interplanetary = true;
  s.lvl.rheamine = alienLv; s.lvl.titancloud = alienLv; s.lvl.mars_workshop = alienLv;
  s.lvl.nest = neutralLv;
  return s;
}
const s6a = starState(0, 30), s6b = starState(10, 0);
const starA = SB.economy.starRate(s6a), starB = SB.economy.starRate(s6b);
const expectMul = 1 + 0.05*(10+10+10);
ok('starRate 有限（非 NaN）', finite(starA) && finite(starB), 'A='+starA.toFixed(4)+' B='+starB.toFixed(4));
ok('异星建筑星空 ×(1+0.05×30)=2.5', starA > 0 && Math.abs(starB - starA*expectMul) < 1e-6, 'A='+starA.toFixed(4)+' B='+starB.toFixed(4)+' ratio='+(starB/starA).toFixed(4)+' 期望×'+expectMul);

console.log('\n=== prestige 回填 / 挑战 cond ===');
/* W / META_ERA 是 prestige 内部表，不暴露到 SB.prestige；改用 breakReport 验证回填生效：
 *   仅 level 单座 mars_workshop(era9) ⇒ buildingScore 应包含 W[9]×log2(2)=55；rheamine(era8)=34。 */
const sP = SB.state.freshRun(false);
sP.lvl.mars_workshop = 1; sP.lvl.rheamine = 1;
const repP = SB.prestige.breakReport(sP);
ok('breakReport：era8/era9 建筑计入 buildingScore', Math.abs(repP.buildingScore - (34 + 55)) < 1e-9, 'buildingScore=' + repP.buildingScore.toFixed(2) + ' 期望 89');
const sP2 = SB.state.freshRun(false);
sP2.lvl.rheamine = 1;  // 仅 era8
const repP2 = SB.prestige.breakReport(sP2);
ok('breakReport：仅 rheamine(era8) ⇒ 34', Math.abs(repP2.buildingScore - 34) < 1e-9, 'buildingScore=' + repP2.buildingScore.toFixed(2));
ok('挑战 drift_terra 在 DEFINITIONS', SB.challenges && SB.challenges.list && SB.challenges.list().some(d=>d.id==='drift_terra'));
// geekRhea cond
const s7 = SB.state.freshRun(false);
ok('condMet geekRhea：未完成=false', SB.tech.condMet(s7, {t:'geekRhea'}) === false);
s7.geek.rheaDone = true;
ok('condMet geekRhea：完成=true', SB.tech.condMet(s7, {t:'geekRhea'}) === true);
// challenge(entered) cond：entered = 当前周目正在运行该挑战（读 s.challenge，非 meta.completed）
const s8 = SB.state.freshRun(false);
s8.broken = false; s8.challenge = { id: 'drift_terra' };
ok('condMet challenge(entered)：进入 drift_terra=true', SB.tech.condMet(s8, {t:'challenge', id:'drift_terra'}) === true);
s8.challenge = { id: 'other' };
ok('condMet challenge(entered)：其它 id=false', SB.tech.condMet(s8, {t:'challenge', id:'other'}) === false);

console.log('\n=== 结果 ===');
console.log('PASS=' + pass + '  FAIL=' + fail);

console.log('\n=== G.E.E.K 星球重构机运行态 ===');
/* 1) 奇观配置已登记 + need 闸门生效 */
ok('wonder_geek 在 WONDERS 注册', SB.WONDERS.some(w => w.id === 'wonder_geek'));
const gW = SB.WONDERS.find(w => w.id === 'wonder_geek');
ok('wonder_geek need=ecological_restoration', gW && gW.need === 'ecological_restoration');
ok('wonder_geek cost 含五种资源', gW && gW.cost && gW.cost.thetaMetal===1000 && gW.cost.steel===4000 && gW.cost.iron===6000 && gW.cost.coral===10000 && gW.cost.kelp===10000);

/* 2) 未建成 / 未启动：geekDraw = 0（面板不谎报） */
const sG0 = SB.state.freshRun(false);
const hfG0 = SB.economy.hydroAlloc(sG0, 1);
ok('G.E.E.K 未建成 ⇒ geekDraw=0', hfG0.geekDraw === 0);

/* 3) 建成但未启动：geekDraw 仍 0 */
const sG1 = SB.state.freshRun(false);
sG1.wonders.wonder_geek = true;
const hfG1 = SB.economy.hydroAlloc(sG1, 1);
ok('G.E.E.K 建成未启动 ⇒ geekDraw=0', hfG1.geekDraw === 0);

/* 4) 建成且启动、资源充足：扣 kelp/metal/coral 各 GEEK_*×dt，累计 rheaRun，满 1800s ⇒ rheaDone + costOffset=3 */
const sG2 = SB.state.freshRun(false);
sG2.wonders.wonder_geek = true; sG2.geek = { geekOn: true, rheaDone:false, terraDone:false, costOffset:0, rheaRun:0, terraRun:0 };
sG2.res.kelp = 1e9; sG2.res.metal = 1e9; sG2.res.coral = 1e9; sG2.res.warmstone = 1e9;
sG2.lvl.hydroturbine = 50;   // 保证热液能剩流够 40/s
const kelpBefore = sG2.res.kelp, metalBefore = sG2.res.metal, coralBefore = sG2.res.coral;
SB.shell.tickShell(sG2, 1, null, {});
ok('G.E.E.K 运转扣 kelp 500/s', Math.abs((kelpBefore - sG2.res.kelp) - SB.CFG.GEEK_KELP) < 1e-6, 'Δkelp='+(kelpBefore-sG2.res.kelp));
ok('G.E.E.K 运转扣 metal 100/s', Math.abs((metalBefore - sG2.res.metal) - SB.CFG.GEEK_METAL) < 1e-6, 'Δmetal='+(metalBefore-sG2.res.metal));
ok('G.E.E.K 运转扣 coral 100/s', Math.abs((coralBefore - sG2.res.coral) - SB.CFG.GEEK_CORAL) < 1e-6, 'Δcoral='+(coralBefore-sG2.res.coral));
ok('G.E.E.K 累计 rheaRun=1s', Math.abs(sG2.geek.rheaRun - 1) < 1e-9, 'rheaRun='+sG2.geek.rheaRun);

/* 5) 跑满 1800s ⇒ rheaDone + costOffset=3 */
const sG3 = SB.state.freshRun(false);
sG3.wonders.wonder_geek = true; sG3.geek = { geekOn: true, rheaDone:false, terraDone:false, costOffset:0, rheaRun:0, terraRun:0 };
sG3.res.kelp = 1e12; sG3.res.metal = 1e12; sG3.res.coral = 1e12; sG3.res.warmstone = 1e9;
sG3.lvl.hydroturbine = 50;
for (let i=0;i<1800;i++) SB.shell.tickShell(sG3, 1, null, {});
ok('G.E.E.K 跑满 1800s ⇒ rheaDone', sG3.geek.rheaDone === true);
ok('G.E.E.K rhea 完成 ⇒ costOffset=3', sG3.geek.costOffset === 3, 'costOffset='+sG3.geek.costOffset);
/* costOf 减消耗落点：覆盖建筑 n=10 时 effN = max(0,10-3)=7（costOf 返回资源键对象） */
sG3.lvl.nest = 10;
const c10 = SB.economy.costOf(sG3, 'nest');
const c10base = SB.economy.costOf((function(){var z=SB.state.freshRun(false);z.lvl.nest=10;return z;})(), 'nest');
const k10 = Object.keys(c10)[0];
ok('costOf：Rhea 后 nest L10 比基准便宜（effN=7<10）', c10[k10] < c10base[k10] && c10[k10] > 0,
  k10 + ' Rhea后=' + c10[k10].toFixed(2) + ' 基准=' + c10base[k10].toFixed(2));

/* 6) 叠加 Terra：研究 terraform 后跑满 3600s ⇒ terraDone + costOffset=8 */
const sG4 = SB.state.freshRun(false);
sG4.wonders.wonder_geek = true; sG4.geek = { geekOn: true, rheaDone:true, terraDone:false, costOffset:3, rheaRun:1800, terraRun:0 };
sG4.techs.terraform = true;
sG4.res.kelp = 1e12; sG4.res.metal = 1e12; sG4.res.coral = 1e12; sG4.res.warmstone = 1e9;
sG4.lvl.hydroturbine = 50;
for (let i=0;i<3600;i++) SB.shell.tickShell(sG4, 1, null, {});
ok('G.E.E.K 跑满泰拉 3600s ⇒ terraDone', sG4.geek.terraDone === true);
ok('G.E.E.K Terra 叠加 ⇒ costOffset=8', sG4.geek.costOffset === 8, 'costOffset='+sG4.geek.costOffset);

/* 7) 缺料暂停、进度保留：kelp 不足时一分不扣、rheaRun 不增、不丢 geekOn */
const sG5 = SB.state.freshRun(false);
sG5.wonders.wonder_geek = true; sG5.geek = { geekOn: true, rheaDone:false, terraDone:false, costOffset:0, rheaRun:100, terraRun:0 };
sG5.res.kelp = 0; sG5.res.metal = 1e9; sG5.res.coral = 1e9; sG5.res.warmstone = 1e9;   // kelp 见底
sG5.lvl.hydroturbine = 50;
SB.shell.tickShell(sG5, 1, null, {});
ok('G.E.E.K 缺 kelp ⇒ 不扣任何材料', sG5.res.metal === 1e9 && sG5.res.coral === 1e9 && sG5.res.kelp === 0);
ok('G.E.E.K 缺料 ⇒ rheaRun 不增', sG5.geek.rheaRun === 100);
ok('G.E.E.K 缺料 ⇒ geekStarved 置位', sG5.geekStarved === true);
ok('G.E.E.K 缺料 ⇒ 不自动停机（geekOn 保留）', sG5.geek.geekOn === true);

/* 8) 迁移：geek 深合并不丢默认 */
const rawG = { res:{}, lvl:{}, geek:{ rheaDone:true } };
const migG = SB.state.migrateRun(rawG);
ok('迁移：geek 深合并保留 geekOn 默认', migG.geek && migG.geek.geekOn === false);
ok('迁移：geek 深合并保留 costOffset 默认', migG.geek && migG.geek.costOffset === 0);
ok('迁移：geek 深合并保留 rheaDone 真值', migG.geek && migG.geek.rheaDone === true);

process.exit(fail ? 1 : 0);
