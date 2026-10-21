/* 定向探针：验证总物流站 ↔ 全国快速物流通道 双向互锁翻倍。
 * 不读核算段（balance.mjs 已删，禁令）；只验 wonder.logisticsCraftRatio / nationalLogisticsMul。
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();

const CANAL = 10; // 王国潮道 10 级
const mk = (wl, wnl) => ({ wonders: { wonder_logistics: wl, wonder_national_logistics: wnl }, lvl: { canal: CANAL } });

const neither = mk(false, false);
const onlyLog = mk(true, false);
const onlyNat = mk(false, true);
const both = mk(true, true);

// 总物流站侧（工艺效率，canalCraft 0.01 × 10 级 = 0.10；双建有 national 则 ×2）
const craftNeither = SB.wonder.logisticsCraftRatio(neither);
const craftOnlyLog = SB.wonder.logisticsCraftRatio(onlyLog);
const craftBoth = SB.wonder.logisticsCraftRatio(both);

// 全国快速物流通道侧（铁钢产能，canalCraftIronSteel 0.01 × 10 级 = 0.10；双建有 logistics 则 ×2）
const natNeither = SB.wonder.nationalLogisticsMul(neither);
const natOnlyNat = SB.wonder.nationalLogisticsMul(onlyNat);
const natBoth = SB.wonder.nationalLogisticsMul(both);

console.log('craft  (总物流站工艺效率): neither=%s onlyLog=%s both=%s', craftNeither, craftOnlyLog, craftBoth);
console.log('nat    (全国快速物流铁钢): neither=%s onlyNat=%s both=%s', natNeither, natOnlyNat, natBoth);

const okCraft = craftNeither === 0 && Math.abs(craftOnlyLog - 0.10) < 1e-9 && Math.abs(craftBoth - 0.20) < 1e-9;
const okNat = natNeither === 0 && Math.abs(natOnlyNat - 0.10) < 1e-9 && Math.abs(natBoth - 0.20) < 1e-9;

console.log('PASS craft interlock (总物流站被全国快速物流通道翻倍):', okCraft);
console.log('PASS nat   interlock (全国快速物流通道被总物流站翻倍):', okNat);
console.log(okCraft && okNat ? 'ALL PASS' : 'FAIL');
process.exit(okCraft && okNat ? 0 : 1);
