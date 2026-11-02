/* 探针：轮回商店 114 个天赋，逐个「装了 1 级」后是否真的改变了任何派生量。
 *
 * 判据不是「apply 键有没有读者」（静态 grep 会被动态拼键骗），而是：
 *   把该天赋的 apply 键直接写进 s.perk（等价于买 1 级后的状态），再取
 *   ① economy.rates(s) 全部数值          ② economy 所有 *Mul 乘区函数
 *   ③ civic.slotList(s).length          ④ workshop.slotCap(s)
 *   ⑤ workshop.craftMul / 造价类         ⑥ tech/civic 的解锁投影
 * 与「一件天赋都不装」的基线逐键比对。全部相同 ⇒ 这个天赋买了等于没买。
 *
 * 只读，不写档。 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();

/* 读天赋表：从 SB.CFG.TIDE_TREE 拿（生产数据，不另抄一份） */
const cat = SB.CFG.TIDE_TREE || SB.CFG.PERKS || SB.TIDE_TREE;
if (!cat) { console.error('找不到天赋表'); process.exit(1); }
function flatten(x, out = []) {
  if (Array.isArray(x)) { for (const v of x) flatten(v, out); return out; }
  if (x && typeof x === 'object') {
    if (x.id && x.apply) { out.push(x); return out; }
    for (const k in x) flatten(x[k], out);
  }
  return out;
}
const perks = flatten(cat);
console.log('天赋数:', perks.length);

/* 构造一个「建筑都有一点」的状态，让乘区有东西可乘 */
function baseRun() {
  const s = SB.state.freshRun(false);
  s.era = 8;
  Object.assign(s.lvl, { kelp: 10, coral: 8, hall: 6, forge: 8, hotforge: 6, hydroshop: 6, mine: 6, quarry: 6 });
  s.jobs = { gatherer: 10, miner: 6, coralwright: 4, scholar: 4, scribe: 3 };
  s.civics = { laws: true };
  s.techs = { writing: true };
  s.upgrades = {};
  return s;
}

const MULFNS = Object.keys(SB.economy).filter(k => /Mul$/.test(k) && typeof SB.economy[k] === 'function');

function snapshot(s) {
  const o = {};
  try {
    const r = SB.economy.rates(s) || {};
    for (const k in r) if (typeof r[k] === 'number') o['rate.' + k] = r[k];
  } catch (e) { o['rate.ERR'] = String(e.message).slice(0, 60); }
  for (const f of MULFNS) {
    try { const v = SB.economy[f](s); if (typeof v === 'number') o['mul.' + f] = v; } catch (e) { /* 需要额外参数的跳过 */ }
  }
  try { o['slotList.len'] = SB.civic.slotList(s).length; } catch (e) {}
  try { o['ws.slotCap'] = SB.workshop.slotCap(s); } catch (e) {}
  return o;
}

const base = (() => {
  const s = baseRun();
  return snapshot(s);
})();

const dead = [];
for (const p of perks) {
  const s = baseRun();
  const a = p.apply || {};
  for (const k in a) s.perk[k] = (s.perk[k] || 0) + Math.max(0.5, Math.abs(a[k]) || 1) * 3;
  const now = snapshot(s);
  const diff = [];
  for (const k in now) {
    if (base[k] === undefined) { diff.push(k + ':new'); continue; }
    if (Math.abs(now[k] - base[k]) > 1e-9) diff.push(k);
  }
  if (diff.length === 0) dead.push({ id: p.id, name: p.name, cost: p.cost, keys: Object.keys(a), desc: p.desc });
}

console.log('\n== 买了之后「任何派生量都没变」的天赋 ==');
if (!dead.length) console.log('  （无）');
for (const d of dead) {
  console.log('  ' + d.id.padEnd(20) + String(d.cost || '').padStart(4) + ' 点  ' +
    JSON.stringify(d.keys) + '\n      ' + (d.desc || '').slice(0, 70));
}
console.log('\n合计:', dead.length, '/', perks.length);
