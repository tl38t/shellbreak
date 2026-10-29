/* 速率分项（economy.ratesParts）自洽性探针（2026-10-29）。
 *
 * 用户在顶栏点材料 → 面板只显示数值：存量/上限/净值 + 「产出/消耗各分项」。
 * 分项的**唯一合法来源**是 economy.ratesParts（与 rates 同一次计算，见
 * economy-rates.js 的 part() 注释）；本探针守三件事：
 *   ① 每个键的「分项之和 === Net」——否则面板会自己讲一套和库存对不上的账；
 *   ② 分项里没有 NaN/Infinity（NaN 会被 toFixed 印成 "NaN"，玩家看不出哪里错了）；
 *   ③ 覆盖率：主要资源在成熟局面下都真的有分项（漏包 = 面板只剩一个净值）。
 * ⚠️ 只读：不 tick、不写盘、不改状态。
 * 用法：node sim/probe_rates_parts.mjs
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '  [' + extra + ']' : '')); }
}

/* 成熟局面：尽量把 rates 的每一条分支都点亮（采石/加工/学院/异星/发射场）。 */
function richState() {
  const s = SB.state.freshRun(false);
  s.pop = 80; s.happy = 24;
  s.jobs = Object.assign(s.jobs || {}, { coralwright: 8, quarrier: 8, miner: 12, scholar: 10, scribe: 4, craft: 5, merchant: 4 });
  s.lvl = Object.assign(s.lvl || {}, {
    kelp: 3, quarry: 2, library: 3, furnace: 3, hall: 3, siltpit: 2, workshop: 2, institute: 2,
    researchlab: 2, school: 2, hydroturbine: 6, temple: 2, square: 2, bank: 1,
    rheamine: 2, mars_workshop: 2, titancloud: 2, fissionplant: 1, satellite: 2});
  s.techs = Object.assign(s.techs || {}, {
    writing: true, quarry: true, mining: true, metalrefine: true, masonry: true, exostruct: true,
    autodrill: true, physics: true, minipump: true, biomat: true, nanotech: true,
    interplanetary: true, adiabatic: true});
  s.upgrades = Object.assign(s.upgrades || {}, {
    upg_deepmine: true, upg_mineSilt: true, upg_mineWarm: true, upg_ironBonus: true,
    upg_pressSci: true, upg_instituteSci: true, upg_luxuryMul: true});
  s.wonders = Object.assign(s.wonders || {}, { wonder_albada: true, wonder_throne: true });
  s.civics = Object.assign(s.civics || {}, { market: true, theology: true });
  s.res = Object.assign(s.res, {
    stone: 8000, silt: 6000, warmstone: 4000, iron: 3000, kelp: 9000, coral: 4000,
    science: 2000, culture: 1500, faith: 800, luxury: 600, steel: 200, hydro: 100,
    titanium: 300, tiplate: 80, starExplore: 1e5, thetaMetal: 100, uranium: 300,
    strongProp: 60, thinafilm: 40, stoneBeam: 30, hardCoral: 30});
  return s;
}

function checkState(name, s) {
  const detail = SB.economy.ratesParts(s);
  const rp = detail.parts, rate = detail.rate;

  let worst = 0, worstKey = '', nanKeys = [], missing = [];
  for (const k of Object.keys(rate)) {
    const list = rp[k];
    if (!list) { missing.push(k); continue; }
    let sum = 0;
    for (const p of list) {
      if (!isFinite(p.v)) nanKeys.push(k + '.' + p.l);
      if (p.m) for (const mm of p.m) if (!isFinite(mm[1])) nanKeys.push(k + '.' + p.l + '×' + mm[0]);
      sum += p.v;
    }
    const d = Math.abs(sum - rate[k]);
    const scale = Math.max(1, Math.abs(rate[k]));
    if (d / scale > worst) { worst = d / scale; worstKey = k; }
  }
  ok(name + ' · 分项之和 === 净值（相对误差 < 1e-9）', worst < 1e-9,
    '最差 ' + worstKey + ' 相对误差 ' + worst.toExponential(2));
  ok(name + ' · 每个 rates 键都有分项（不许有键漏包）', missing.length === 0, missing.join(', '));
  ok(name + ' · 分项无 NaN/Infinity', nanKeys.length === 0, nanKeys.slice(0, 6).join(', '));
  return { missing: missing, rp: rp, rate: rate };
}

const base = SB.state.freshRun(false);
const r1 = checkState('开局', base);
ok('开局 · 净值全项有限', Object.keys(r1.rate).every(k => isFinite(r1.rate[k])));

const rich = richState();
const r2 = checkState('成熟局面', rich);

/* 覆盖率：这些资源在成熟局面下必须真有分项（否则面板只剩一个净值，等于没做）。 */
const NEED = ['kelp', 'coral', 'stone', 'silt', 'warmstone', 'iron', 'titanium', 'uranium',
  'tiplate', 'science', 'culture', 'faith', 'luxury', 'steel', 'hydro'];
for (const k of NEED) {
  ok('成熟局面 · ' + k + ' 有分项', !!(r2.rp[k] && r2.rp[k].length), '分项数 0');
}

/* 乘区必须真的被记下来（不然面板只能看到「基础 × ?」，答不出怎么算的）。 */
const siltMain = (r2.rp.silt || []).find(p => p.l === '矿工');
ok('成熟局面 · 金属矿工行带乘区明细', !!(siltMain && siltMain.m && siltMain.m.length >= 5),
  siltMain ? '乘区数 ' + (siltMain.m ? siltMain.m.length : 0) : '无矿工行');
ok('成熟局面 · 金属 = 基础 × 乘区（自洽）',
  !!siltMain && Math.abs(siltMain.b * siltMain.m.reduce((a, x) => a * x[1], 1) - siltMain.v) < 1e-9,
  siltMain ? (siltMain.b + ' → ' + siltMain.v) : '');

/* 净值符号与「产 → 耗」的可读性：藻食在有人口时必须同时有产与耗两笔。 */
const kelpParts = r2.rp.kelp || [];
ok('成熟局面 · 藻食同时有产出与消耗两笔',
  kelpParts.some(p => p.v > 0) && kelpParts.some(p => p.v < 0),
  '分项 ' + kelpParts.map(p => p.l + ':' + p.v.toFixed(2)).join(' | '));

/* 发射场拆项（帆/节点）只有在解锁后才出现，不许凭空有值。 */
const launch = (r2.rp.sunSailRate || [])[0];
ok('成熟局面 · 太阳帆分项带「启用等级 ÷ 节律」算式',
  !!launch && /级 ÷ \d+(\.\d+)?s/.test(launch.d || ''), launch ? String(launch.d) : '无该项');

console.log('\n== ' + pass + ' PASS / ' + fail + ' FAIL ==');
process.exit(fail ? 1 : 0);
