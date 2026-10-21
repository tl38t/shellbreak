/* 探针：核热厂（fissionplant）卡面 / 建筑行文案是否**按本局实际状态出数**。
 *
 * 用户原话（2026-10-21）：「这里要读到底有没有研究核聚变啊，不要写什么如果研究了是多少，
 *   该是多少就是多少」——即卡面不许出现「基础耗铀 0.35/秒/级（核聚变后×2）」这种条件句。
 *
 * 验收三条：
 *  ① 未研究核聚变：卡面 = 基础值（热液能 +10、耗铀 0.35），且**不含**「核聚变后」字样；
 *  ② 已研究：卡面 = 实际值（热液能 +50、耗铀 0.70），并注明加成已计入；
 *  ③ 卡面两个乘子与**结算**逐位同源：核聚变令 tick 铀耗 ×2、热液能速率 ×5。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadNoDom, ROOT } from './load-sb.mjs';

const { ctx, SB } = loadNoDom();

/* 假 DOM：只需接住 openInfoCard 对 modalBox / modal 的写入，用来抓卡面 HTML。 */
const captured = {};
function fakeEl(id) {
  return {
    id, innerHTML: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, addEventListener() {}, removeEventListener() {}
  };
}
ctx.document = {
  getElementById(id) { captured[id] = captured[id] || fakeEl(id); return captured[id]; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {}, removeEventListener() {},
  body: { classList: { add() {}, remove() {} } }
};
/* render-info.js 模块级会读 SB.ui.renderContent.BUILDING_FLAVOR（render-content.js 不在 NO_DOM 里），
 * 这里补一个空桩——探针只验效果段，不验 flavor。 */
SB.ui = SB.ui || {};
SB.ui.renderContent = SB.ui.renderContent || { BUILDING_FLAVOR: {}, TECH_FLAVOR: {}, WONDER_ART: {}, WONDER_FLAVOR: {} };

vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/ui/render-info.js'), 'utf8'), ctx, { filename: 'render-info.js' });

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra != null ? '  → ' + extra : '')); }
}
function has(text, sub) { return String(text).indexOf(sub) >= 0; }

const b = SB.habitat.buildingById('fissionplant');
check('核热厂建筑定义存在', !!b, b && b.id);

function mk(fusion, lv) {
  const s = SB.state.freshRun(false);
  s.techs = fusion ? { nuclear_fusion: true } : {};
  s.lvl.fissionplant = lv;
  SB.game.run = () => s;          // res() 读的是 game.run()
  return s;
}

/* ── ① 未研究核聚变 ───────────────────────────────────────────── */
const sOff = mk(false, 10);
SB.ui.renderParts.info.showBuildingInfo('fissionplant');
const htmlOff = captured.modalBox.innerHTML;

check('未研究：卡面含「热液能 +10/秒/级（当前 +100/秒，不烧暖石）」',
  has(htmlOff, '热液能 +10/秒/级（当前 +100/秒，不烧暖石）'),
  (htmlOff.match(/<h4>效果<\/h4><p>[\s\S]*?<\/p>/) || ['(未抓到效果段)'])[0]);
check('未研究：卡面含「耗铀 0.35/秒/级（当前 −3.50/秒）」', has(htmlOff, '耗铀 0.35/秒/级（当前 −3.50/秒）'));
check('未研究：奢侈品 +10%/级（当前 +100%，负面）', has(htmlOff, '居民奢侈品消耗 +10%/级（当前 +100%，负面）'));
check('未研究：卡面**不含**「核聚变后」条件句', !has(htmlOff, '核聚变后'));
check('未研究：卡面不含「×2」条件句', !has(htmlOff, '×2'));

const descOff = SB.ui.buildingDescText(sOff, b);
console.log('  行为文案（未研究）：' + descOff);
check('未研究：建筑行 desc 用基础值', has(descOff, '热液能 +10/秒/级') && has(descOff, '耗铀 0.35/秒/级'));
check('未研究：建筑行 desc 不含「核聚变后」', !has(descOff, '核聚变后'));

/* ── ② 已研究核聚变 ──────────────────────────────────────────── */
const sOn = mk(true, 10);
SB.ui.renderParts.info.showBuildingInfo('fissionplant');
const htmlOn = captured.modalBox.innerHTML;

check('已研究：卡面含「热液能 +50/秒/级（当前 +500/秒，不烧暖石）」',
  has(htmlOn, '热液能 +50/秒/级（当前 +500/秒，不烧暖石）'),
  (htmlOn.match(/<h4>效果<\/h4><p>[\s\S]*?<\/p>/) || ['(未抓到效果段)'])[0]);
check('已研究：卡面含「耗铀 0.70/秒/级（当前 −7.00/秒）」', has(htmlOn, '耗铀 0.70/秒/级（当前 −7.00/秒）'));
check('已研究：注明加成已计入', has(htmlOn, '核聚变已研究'));
check('已研究：卡面**不含**「核聚变后」条件句', !has(htmlOn, '核聚变后'));

const descOn = SB.ui.buildingDescText(sOn, b);
console.log('  行为文案（已研究）：' + descOn);
check('已研究：建筑行 desc 用实际值', has(descOn, '热液能 +50/秒/级') && has(descOn, '耗铀 0.70/秒/级'));

/* ── ③ 卡面乘子 == 结算乘子（逐位同源）────────────────────────── */
/* 铀耗：tick 直扣。L=2 跑 1 秒，未研究应扣 0.70，已研究应扣 1.40。 */
function uraniumBurn(fusion) {
  const s = mk(fusion, 2);
  s.res.uranium = 1000;
  s.pop = 0;                     // 去人口导致的其它扰动
  const before = s.res.uranium;
  SB.economy.tick(s, 1, null, {});
  return before - s.res.uranium;
}
const burnOff = uraniumBurn(false), burnOn = uraniumBurn(true);
console.log('  铀耗/秒 @L2：未研究 ' + burnOff.toFixed(4) + ' / 已研究 ' + burnOn.toFixed(4));
check('结算：未研究铀耗 = 2×0.35 = 0.70', Math.abs(burnOff - 0.70) < 1e-9, burnOff);
check('结算：已研究铀耗 = 2×0.70 = 1.40（×2 与卡面同一乘子）', Math.abs(burnOn - 1.40) < 1e-9, burnOn);

/* 热液能：hydroAlloc 是 tick / rates 共用的**唯一流分配出口**，
 *   它的 fissionRate 就是结算侧每秒真给的热液能（L=1 ⇒ 未研究 10 / 已研究 50）。 */
function hydroFissionRate(fusion) {
  const s = mk(fusion, 1);
  s.pop = 0;
  s.lvl.hydroturbine = 0; s.lvl.hydroshop = 0; s.lvl.spacestation = 0; s.lvl.satellite = 0;
  s.lvl.titancloud = 0; s.lvl.biomatlab = 0;
  s.sunSails = 0;
  return SB.economy.hydroAlloc(s, 1).fissionRate;
}
const hOff = hydroFissionRate(false), hOn = hydroFissionRate(true);
console.log('  hydroAlloc.fissionRate @L1：未研究 ' + hOff + ' / 已研究 ' + hOn);
check('结算：未研究热液能 = +10/秒（与卡面 +10 同源）', Math.abs(hOff - 10) < 1e-9, hOff);
check('结算：已研究热液能 = +50/秒（与卡面 +50 同源 ×5）', Math.abs(hOn - 50) < 1e-9, hOn);

/* rates() 的铀净速率也必须走同一个 ×2（面板与结算同源，否则又是面板撒谎）。 */
function uraniumRate(fusion) {
  const s = mk(fusion, 2);
  s.pop = 0;
  s.lvl.biomatlab = 0; s.lvl.europa_launch = 0; s.lvl.mars_workshop = 0;
  s.techs.autodrill = fusion ? true : false;   // 都关掉矿工伴生，避免噪声
  s.jobs = { gather: 0, coralwright: 0, quarrier: 0, miner: 0, scribe: 0, scholar: 0, merchant: 0 };
  s.robotJobs = {};
  return SB.economy.rates(s).uranium;
}
const uOff = uraniumRate(false), uOn = uraniumRate(true);
console.log('  rates().uranium @L2：未研究 ' + uOff + ' / 已研究 ' + uOn);
check('rates：未研究铀净速率 = −0.70/秒', Math.abs(uOff + 0.70) < 1e-9, uOff);
check('rates：已研究铀净速率 = −1.40/秒（×2）', Math.abs(uOn + 1.40) < 1e-9, uOn);

/* ── ④ 其它建筑不受影响（desc 出口不该改写无关建筑）────────────── */
const bk = SB.habitat.buildingById('kelp');
check('回归：普通建筑 desc 仍原样返回', SB.ui.buildingDescText(sOn, bk) === bk.desc);
const rl = SB.habitat.buildingById('researchlab');
check('回归：科研所 desc 原样', SB.ui.buildingDescText(sOn, rl) === rl.desc);

console.log('\n== ' + pass + ' PASS / ' + fail + ' FAIL ==');
process.exit(fail ? 1 : 0);
