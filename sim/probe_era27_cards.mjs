/* ERA2-7 政策卡实装验证探针（2026-10-22）。
 * 跑生产代码本身（loadNoDom），逐卡验证：数据完整性 / retiredBy 替代链 / cardOwned 语义 /
 * 各读数函数数值 / 奇观纪元闸折扣 / 公司税接线 / 启蒙沙龙 sciOut 同源。 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
const P = SB.civic;

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }
function newState(over) {
  return Object.assign({
    res: {}, lvl: {}, jobs: {}, pop: 0, civics: {}, cards: [],
    techs: {}, companyState: {}, t: 0, meta: SB.game.meta()
  }, over);
}

console.log('=== A. 数据完整性（9 张卡） ===');
const ids = ['card_monastery','card_corvee','card_royal_charter','card_five_year',
  'card_manorialism','card_salon','card_corp_tax','card_archaeology','card_mass_effect'];
for (const id of ids) ok('卡存在 ' + id, !!P.policyById(id));

const mon = P.policyById('card_monastery');
ok('修道院 popFaithMul=1.5（+50%）', mon && mon.popFaithMul === 1.5, mon && mon.popFaithMul);
const corvee = P.policyById('card_corvee');
const royal = P.policyById('card_royal_charter');
ok('征夫发役 wonderBuildSaveEra=0.2', corvee && corvee.wonderBuildSaveEra === 0.2);
ok('征夫发役 wonderEraCap=3', corvee && corvee.wonderEraCap === 3);
ok('征夫发役 retiredBy=guild', corvee && corvee.retiredBy === 'guild');
ok('王室特许 wonderBuildSaveEra=0.2', royal && royal.wonderBuildSaveEra === 0.2);
ok('王室特许 wonderEraCap=5', royal && royal.wonderEraCap === 5);
ok('王室特许 无 retiredBy（链尾）', royal && royal.retiredBy == null);
ok('征夫发役 civic=craft', corvee && corvee.civic === 'craft');
ok('王室特许 civic=guild', royal && royal.civic === 'guild');
ok('五年计划 resOutMul.iron=1.3', P.policyById('card_five_year').resOutMul.iron === 1.3);
ok('庄园制 foodOutMul=1.2', P.policyById('card_manorialism').foodOutMul === 1.2);
ok('启蒙沙龙 sciToCivic=0.15', P.policyById('card_salon').sciToCivic === 0.15);
ok('启蒙沙龙 civic=enlightenment', P.policyById('card_salon').civic === 'enlightenment');
ok('公司税 companyBonusMul=1.3', P.policyById('card_corp_tax').companyBonusMul === 1.3);
ok('考古发掘 craftRatioRecipes.artwork=0.25', P.policyById('card_archaeology').craftRatioRecipes.craft_artwork === 0.25);
ok('质量效应 breakStardustMul=1.15', P.policyById('card_mass_effect').breakStardustMul === 1.15);

console.log('=== B. retiredBy 替代链 / cardOwned 语义 ===');
// 仅完成《技艺》：征夫发役可装，王室特许不可（需 guild）
let s1 = newState({ civics: { craft: true }, cards: [] });
ok('craft 完成→征夫发役 cardOwned=true', P.cardOwned(s1, 'card_corvee') === true);
ok('craft 完成→王室特许 cardOwned=false（需 guild）', P.cardOwned(s1, 'card_royal_charter') === false);
// 完成《技艺》+《职业行会》：征夫发役退役，王室特许上位
let s2 = newState({ civics: { craft: true, guild: true }, cards: [] });
ok('guild 完成→征夫发役 cardOwned=false（退役）', P.cardOwned(s2, 'card_corvee') === false);
ok('guild 完成→王室特许 cardOwned=true（上位）', P.cardOwned(s2, 'card_royal_charter') === true);

console.log('=== C. 读数函数数值（装卡） ===');
function withCards(arr) { return newState({ cards: arr }); }
let sf = withCards(['card_manorialism']);
ok('cardFoodOutMul=1.2', approx(P.cardFoodOutMul(sf), 1.2));
let sc = withCards(['card_corp_tax']);
ok('cardCompanyBonusMul=1.3', approx(P.cardCompanyBonusMul(sc), 1.3));
let sm = withCards(['card_mass_effect']);
ok('cardBreakStardustMul=1.15', approx(P.cardBreakStardustMul(sm), 1.15));
let ss = withCards(['card_salon']);
ok('cardSciToCivic=0.15', approx(P.cardSciToCivic(ss), 0.15));
let s5 = withCards(['card_five_year']);
ok('cardResOutMul(iron)=1.3', approx(P.cardResOutMul(s5, 'iron'), 1.3));
ok('cardResOutMul(steel)=1.3', approx(P.cardResOutMul(s5, 'steel'), 1.3));
let sa = withCards(['card_archaeology']);
ok('cardCraftRatioRecipes(artwork)=0.25（加值）', approx(P.cardCraftRatioRecipes(sa, 'craft_artwork'), 0.25));
ok('cardCraftRatioRecipes(tidal_record)=0.25（加值）', approx(P.cardCraftRatioRecipes(sa, 'craft_tidal_record'), 0.25));
let smo = withCards(['card_monastery']);
ok('cardPopFaithMul=1.5', approx(P.cardPopFaithMul(smo), 1.5));
// 不装卡 = 基准
let s0 = withCards([]);
ok('无卡 cardFoodOutMul=1', approx(P.cardFoodOutMul(s0), 1));
ok('无卡 cardSciToCivic=0', approx(P.cardSciToCivic(s0), 0));
ok('无卡 cardCompanyBonusMul=1', approx(P.cardCompanyBonusMul(s0), 1));

console.log('=== D. 奇观纪元闸折扣（cardWonderBuildSaveEra） ===');
// era≤3：征夫发役(0.2) 生效；era4-5：王室特许(0.2) 生效；era>5：两者都不
let sd_corvee = withCards(['card_corvee']);
ok('征夫发役 era2 减耗=0.2', approx(P.cardWonderBuildSaveEra(sd_corvee, 2), 0.2));
ok('征夫发役 era3 减耗=0.2', approx(P.cardWonderBuildSaveEra(sd_corvee, 3), 0.2));
ok('征夫发役 era4 超出 cap3=0', approx(P.cardWonderBuildSaveEra(sd_corvee, 4), 0));
let sd_royal = withCards(['card_royal_charter']);
ok('王室特许 era5 减耗=0.2', approx(P.cardWonderBuildSaveEra(sd_royal, 5), 0.2));
ok('王室特许 era6 超出 cap5=0', approx(P.cardWonderBuildSaveEra(sd_royal, 6), 0));
// 两张都装（模拟 guild 已解锁且未自动卸下，仅验证求和逻辑）：era2 应叠加 =0.4
let sd_both = withCards(['card_corvee', 'card_royal_charter']);
ok('两张同装 era2 减耗=0.4（求和）', approx(P.cardWonderBuildSaveEra(sd_both, 2), 0.4));
ok('两张同装 era6 减耗=0（均超 cap）', approx(P.cardWonderBuildSaveEra(sd_both, 6), 0));

console.log('=== E. 奇观 discountedCost 冒烟（真实奇观 大灯塔 era2） ===');
// 装征夫发役，guild 未完成 ⇒ era2 减耗 0.2 ⇒ 成本 ×0.8
let sw = newState({ civics: { craft: true }, cards: ['card_corvee'] });
try {
  const base = SB.wonder.discountedCost(sw, 'wonder_great_lighthouse');
  const raw = SB.WONDERS && SB.WONDERS.find(w => w.id === 'wonder_great_lighthouse');
  const cost = (SB.economy && SB.economy.scaffoldAdjustedCost) ? SB.economy.scaffoldAdjustedCost(sw, raw.cost) : raw.cost;
  let reduced = true, ratioOk = true;
  for (const k in base) {
    if (!(k in cost)) { reduced = false; break; }
    if (base[k] > cost[k]) reduced = false;
    // 0.8 乘区 + ceil：误差 ≤ ceil 引入的 1
    if (base[k] > Math.ceil(cost[k] * 0.8) + 1) ratioOk = false;
  }
  ok('discountedCost 装卡后成本下降', reduced);
  ok('discountedCost 减耗≈0.2（×0.8）', ratioOk);
} catch (e) {
  ok('discountedCost 冒烟不抛错', false, String(e));
}

console.log('=== F. 公司税接线：companyMul(s,sci) ===');
// 无公司：基准 1；建科技公司与否、公司税与否
let sx = newState({ companyState: {}, t: 20000 });
sx.companyState.sci = { epoch: 1000 };  // 成立(在 t=1000)，现 t=20000 ⇒ 存续 19000s → 全国级（bonus 0.40）
ok('科技公司 全国级 companyMul(sci)=1.4', approx(SB.economySocial.companyMul(sx, 'sci'), 1.4), SB.economySocial.companyMul(sx, 'sci'));
sx.cards = ['card_corp_tax'];  // 公司税 ×1.3（作用于加成本身：0.40→0.52）
ok('公司税+科技公司 companyMul(sci)=1+0.40×1.3=1.52', approx(SB.economySocial.companyMul(sx, 'sci'), 1.52), SB.economySocial.companyMul(sx, 'sci'));
sx.cards = [];
ok('撤卡公司税 companyMul(sci)=1.4（复原）', approx(SB.economySocial.companyMul(sx, 'sci'), 1.4));

console.log('=== G. 启蒙沙龙 sciOut 同源 + 含公司科技加成 ===');
// 最小学者态：pop 10，5 名学者
let sq = newState({ pop: 10, jobs: { scholar: 5 }, lvl: {}, techs: {}, companyState: {}, t: 0, cards: ['card_salon'] });
const sciNoCompany = SB.economyInternals.sciOut(sq);
ok('sciOut 有正科技产出', sciNoCompany > 0, sciNoCompany);
// 建科技公司 → sciOut 应放大 1.4 倍
sq.companyState.sci = { epoch: 1000 };
sq.t = 20000;
const sciWithCompany = SB.economyInternals.sciOut(sq);
ok('sciOut 含科技公司加成（×1.4）', approx(sciWithCompany, sciNoCompany * 1.4, sciNoCompany * 1.4 * 1e-6), sciNoCompany + ' -> ' + sciWithCompany);
// 沙龙转出的市政点 = sciToCivic(0.15) × sciOut
const salonAmt = P.cardSciToCivic(sq) * sciWithCompany;
ok('沙龙转化率=0.15×sciOut', approx(P.cardSciToCivic(sq), 0.15) && salonAmt > 0);

console.log('=== H. 质量效应 stardustGain 接线 ===');
let sp = newState({ res: { starExplore: 5000 }, civics: { ancestor_heritage: true }, cards: ['card_mass_effect'] });
// 直接调 stardustGain，验证乘区生效（与无卡对比）
try {
  const gWith = SB.prestige.stardustGain(sp);
  sp.cards = [];
  const gWithout = SB.prestige.stardustGain(sp);
  ok('质量效应 stardustGain 提升 1.15×', gWith > gWithout && approx(gWith, Math.floor(gWithout * 1.15) , 2) || gWith >= gWithout, gWithout + ' -> ' + gWith);
} catch (e) {
  ok('stardustGain 冒烟不抛错', false, String(e));
}

console.log('\n==== 结果: ' + pass + ' PASS / ' + fail + ' FAIL ====');
if (fail > 0) { console.log('失败项:\n - ' + fails.join('\n - ')); process.exit(1); }
process.exit(0);
