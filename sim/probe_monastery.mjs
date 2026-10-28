/* 验证 修道院（card_monastery）实装 + coreFaithMul 泛化：
 * 1) card_monastery 存在、挂在 sovereign、effect 空壳 + coreFaithMul:0.05。
 * 2) 只装 修道院 ⇒ coreFaithMul = 1 + lv*0.05。
 * 3) 只装 天赋神权 ⇒ 1 + lv*0.10（原行为保留）。
 * 4) 两卡同装 ⇒ 1 + lv*0.15（叠加）。
 * 5) 都不装 ⇒ 1。
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
const C = SB.civic;

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

// 找一张核心建筑拿到 lv
const coreB = SB.BUILDINGS.find(b => b.zone === 'core');
chk('存在核心建筑(' + (coreB && coreB.id) + ')', !!coreB);
const BID = coreB.id;

const mk = (cards) => ({ cards: cards.slice(), lvl: { [BID]: 10 }, civics: { sovereign: 1, reformed: 1 } });

chk('card_monastery 在 POLICIES 中', !!C.policyById('card_monastery'));
const cm = C.policyById('card_monastery');
chk('card_monastery.civic === sovereign', cm && cm.civic === 'sovereign', cm && cm.civic);
chk('card_monastery.coreFaithMul === 0.05', cm && cm.coreFaithMul === 0.05, cm && cm.coreFaithMul);
chk('card_monastery 无 type（万能）', cm && !cm.type, cm && cm.type);

const lv = 10;
const sNone = mk([]);
const sMon = mk(['card_monastery']);
const sDiv = mk(['card_divine_right']);
const sBoth = mk(['card_monastery', 'card_divine_right']);

chk('都不装 ⇒ 1', Math.abs(C.coreFaithMul(sNone) - 1) < 1e-9, C.coreFaithMul(sNone));
chk('只装修道院 ⇒ 1+10*0.05=1.5', Math.abs(C.coreFaithMul(sMon) - 1.5) < 1e-9, C.coreFaithMul(sMon));
chk('只装天赋神权 ⇒ 1+10*0.10=2.0（原行为保留）', Math.abs(C.coreFaithMul(sDiv) - 2.0) < 1e-9, C.coreFaithMul(sDiv));
chk('两卡同装 ⇒ 1+10*0.15=2.5（叠加）', Math.abs(C.coreFaithMul(sBoth) - 2.5) < 1e-9, C.coreFaithMul(sBoth));

// cardOwned 校验：sovereign 完成后修道院可用
chk('cardOwned(card_monastery) 在 sovereign 完成后为真', C.cardOwned(mk([], ), 'card_monastery') === false ? false : true);
const sOwned = { cards: [], civics: { sovereign: 1 } };
chk('sovereign 完成 ⇒ 修道院拥有', C.cardOwned(sOwned, 'card_monastery') === true, C.cardOwned(sOwned, 'card_monastery'));

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
