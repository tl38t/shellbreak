// 定向机制探针：验证「装了城堡(upg_castle) + 核心高等级」时 hallMul 是否变负，
// 以及 costOf 给各建筑（含 hall 自身）的造价是否变负。复现生产代码路径（loadAll + 真实 costOf）。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadAll, ROOT } from './load-sb.mjs';

/* ---- 复制自 e2e.mjs 的最小假 DOM（与端到端同源） ---- */
function mkEl(id) {
  const el = {
    id, _html: '', textContent: '', value: '', checked: false, dataset: {}, style: {}, children: [], onclick: null,
    _classes: new Set(id === 'modal' ? ['hidden'] : []),
    classList: {
      add(c) { el._classes.add(c); }, remove(c) { el._classes.delete(c); },
      contains(c) { return el._classes.has(c); },
      toggle(c, on) { if (on === undefined) { el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c); } else if (on) el._classes.add(c); else el._classes.delete(c); }
    },
    appendChild(c) { el.children.push(c); }, removeChild() {}, addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector(sel) {
      if (typeof sel === 'string' && sel.charAt(0) === '#') return doc.getElementById(sel.slice(1));
      const cls = String(sel || '').replace(/^[.#]/, '');
      if (!cls) return null;
      if (String(el._html || '').indexOf(cls) >= 0) { if (!el._q) el._q = {}; if (!el._q[cls]) el._q[cls] = mkEl(cls); return el._q[cls]; }
      return null;
    }
  };
  Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = String(v); } });
  return el;
}
function makeDoc() {
  const els = new Map(); const q = {};
  const doc = {
    _els: els, _q: q, readyState: 'complete', body: mkEl('body'),
    getElementById(id) { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
    createElement(tag) { const e = mkEl('new-' + tag); e.tag = tag; return e; },
    querySelectorAll(sel) {
      if (q[sel]) return q[sel];
      let out = [];
      if (sel === '.tab') out = ['village', 'folk', 'tech', 'civic', 'faith', 'workshop', 'meta'].map((t, i) => { const e = mkEl('tab-' + t); e.dataset.tab = t; e._tab = i; return e; });
      else if (sel === '.spd') out = [1, 5, 10, 20].map(s => { const e = mkEl('spd-' + s); e.dataset.spd = String(s); return e; });
      q[sel] = out; return out;
    },
    querySelector(sel) { const m = /^\.tab\[data-tab="([^"]+)"\]$/.exec(sel || ''); if (!m) return null; for (const t of this.querySelectorAll('.tab')) if (t.dataset.tab === m[1]) return t; return null; },
    addEventListener() {}, _ev: {}
  };
  return doc;
}
const store = new Map();
const sandbox = {
  console,
  document: makeDoc(),
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
  performance: { now: () => 1 },
  setInterval() { return 0; }, clearInterval() {}, setTimeout() { return 0; }, clearTimeout() {},
  _intervals: [], _timeouts: [],
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;

const { SB } = loadAll(sandbox);
const eco = SB.economy;

SB.game.resetRun();
const s = SB.game.run();

// 模拟玩家存档：装了城堡升级、核心(hall) 92 级、几座普通建筑高等级
s.upgrades = s.upgrades || {};
s.upgrades.upg_castle = true;            // hallSaveMul = 0.5
s.lvl = s.lvl || {};
s.lvl.hall = 92;                         // 城堡 92 级（截图数字）
s.lvl.lighthouse = 40;
s.lvl.tenement = 55;
s.lvl.weir = 30;
s.perk = s.perk || {};

function show(id) {
  const c = eco.costOf(s, id);
  const k = Object.keys(c)[0];
  const v = c[k];
  console.log(`  ${id.padEnd(12)} cost[${k}]=${v}  ${v < 0 ? '<<< NEGATIVE' : (isFinite(v) ? 'ok' : 'NaN')}`);
}

console.log('=== 城堡已装 + 核心 92 级 ===');
['hall', 'lighthouse', 'tenement', 'weir'].forEach(show);

delete s.upgrades.upg_castle;
console.log('=== 对照：未装城堡（核心仍为 92 级）===');
['hall', 'lighthouse', 'tenement', 'weir'].forEach(show);

console.log('\n=== 用公式复现 hallMul 内部（新：基础50%/最高75%）===');
const HALL_SAVE = 0.02, HALL_DR_BASE = 0.50, HALL_DR_MAX = 0.75, HALL_DR_CASTLE_HSM = 0.5;
function getLimitedDR(effect, limit) {
  if (effect < limit * 0.75) return effect;
  const a = limit * 0.75;
  const b = (effect - a) / (limit - a);
  const c = 1 - Math.pow(1 - b, 0.75);
  return a + (limit - a) * c;
}
function hallMulOf(hsm, _n) {
  const rate = HALL_SAVE * (1 + hsm);
  const extra = Math.max(0, hsm - HALL_DR_CASTLE_HSM);
  const lim = Math.min(HALL_DR_BASE + extra, HALL_DR_MAX);
  const eff = getLimitedDR(Math.min(_n * rate, lim), lim);
  return 1 - eff;
}
// hsm 取值覆盖：0(纯议事厅) / 0.5(城堡本体) / 0.75(再叠一座仓库) / 1.0 / 5.0(海量仓库叠加)
for (const hsm of [0, 0.5, 0.75, 1.0, 5.0]) {
  const extra = Math.max(0, hsm - HALL_DR_CASTLE_HSM);
  const lim = Math.min(HALL_DR_BASE + extra, HALL_DR_MAX);
  const hm = hallMulOf(hsm, 200);
  console.log(`  hallSaveMul=${hsm}  lim=${lim.toFixed(2)}  hallMul@200级=${hm.toFixed(4)}  ${hm < 0.25 - 1e-9 ? '<<< BELOW 0.25!' : '(≥0.25 ok)'}`);
}

/* ---- 回归断言：修复后不变量 ---- */
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

console.log('\n=== 回归断言（修复后不变量）===');
// 1) 装城堡 + 核心 92 级：所有建筑 costOf 非负且有限
s.upgrades = s.upgrades || {}; s.upgrades.upg_castle = true;
s.lvl.hall = 92; s.lvl.lighthouse = 40; s.lvl.tenement = 55; s.lvl.weir = 30;
let allNonNeg = true;
for (const id of ['hall', 'lighthouse', 'tenement', 'weir', 'workshop', 'furnace', 'hydroturbine']) {
  const c = eco.costOf(s, id); const v = c[Object.keys(c)[0]];
  if (!(v >= 0) || !isFinite(v)) { allNonNeg = false; console.log(`    ${id} 异常 ${v}`); }
}
check('装城堡+核心92级：所有建筑 costOf 非负且有限', allNonNeg);
// 2) 即便更高等级（200级）也不变负
s.lvl.hall = 200; s.lvl.lighthouse = 150; s.lvl.tenement = 180; s.lvl.weir = 120;
let allNonNeg2 = true;
for (const id of ['hall', 'lighthouse', 'tenement', 'weir']) {
  const c = eco.costOf(s, id); const v = c[Object.keys(c)[0]];
  if (!(v >= 0) || !isFinite(v)) { allNonNeg2 = false; console.log(`    ${id} 异常 ${v}`); }
}
check('装城堡+核心200级：costOf 仍非负', allNonNeg2);
// 3) 公式层：hallMul 恒 ≥ 0.25（最高软上限 75% ⇒ 折扣最多 75%，hallMul 最低 0.25），
//    且对任何仓库建筑叠加（hsm 取 0 / 0.5 / 0.75 / 1.0 / 5.0）都不跌破 0.25
let hallMulMin = Infinity;
for (const hsm of [0, 0.5, 0.75, 1.0, 5.0]) hallMulMin = Math.min(hallMulMin, hallMulOf(hsm, 500));
check('hallMul 恒 ≥ 0.25（最高软上限 75%，含多仓库建筑叠加）', hallMulMin >= 0.25 - 1e-9);
// 3b) 城堡本体（hsm=0.5）基础软上限 = 50%：hallMul 最低 0.50（折扣封顶 50%）
check('城堡本体基础软上限 50%（hallMul ≥ 0.50）', hallMulOf(0.5, 500) >= 0.50 - 1e-9);
// 3c) 生产函数真调用：注入第二座带 hallSaveMul=0.25 的仓库建筑（模拟 hsm=0.5+0.25=0.75，
//     即「城堡 + 另一仓库」叠加到最高软上限 75%），验证生产路径 eco.costOf 仍非负。
const fakeStore = { id: '__probe_store', name: 'test-store', hallSaveMul: 0.25 };
SB.UPGRADES.push(fakeStore);
s.upgrades = s.upgrades || {}; s.upgrades.upg_castle = true; s.upgrades.__probe_store = true;
s.lvl.hall = 500;
let okStack = true;
for (const id of ['hall', 'lighthouse', 'tenement', 'weir', 'workshop', 'furnace', 'hydroturbine']) {
  const c = eco.costOf(s, id); const v = c[Object.keys(c)[0]];
  if (!(v >= 0) || !isFinite(v)) { okStack = false; console.log(`    ${id} 异常 ${v}`); }
}
check('生产函数：城堡+另一仓库(hsm=0.75) 叠加后所有 costOf 仍非负', okStack);
SB.UPGRADES.pop(); delete s.upgrades.__probe_store;
// 3d) 生产函数真调用：核心 1000 级（远超封顶），costOf 绝不跌破（hallMul 下界 0.25）
s.lvl.hall = 1000;
let okHi = true;
for (const id of ['hall', 'tenement', 'weir']) {
  const c = eco.costOf(s, id); const v = c[Object.keys(c)[0]];
  if (!(v >= 0) || !isFinite(v)) { okHi = false; }
}
check('生产函数：核心1000级 所有 costOf 仍非负', okHi);

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
