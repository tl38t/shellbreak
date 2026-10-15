/* 离线双倍加速（看广告 2× 时间银行）机制探针 —— 不跑时长标定，只验机制。
 * 复用 load-sb.mjs 的 loadAll（与 e2e.mjs 同源的假 DOM），让离线补算跑在生产代码上，
 * 不另写一份离线公式。通过 wrapper 计数 SB.economy.tick，核对：
 *   ① 银行覆盖到的离线时段按 2× 结算（tick 数翻倍）；
 *   ② 银行按真实秒正确扣减（覆盖段扣到 0，超出部分不扣）；
 *   ③ 开关关着时离线保持 1× 且银行冻结。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadAll, ROOT } from './load-sb.mjs';

/* ---- 复制自 e2e.mjs 的最小假 DOM（与端到端同源，保证 render 路径一致） ---- */
function mkEl(id) {
  const el = {
    id, _html: '', textContent: '', value: '', checked: false,
    dataset: {}, style: {}, children: [], onclick: null,
    _classes: new Set(id === 'modal' ? ['hidden'] : []),
    classList: {
      add(c) { el._classes.add(c); },
      remove(c) { el._classes.delete(c); },
      contains(c) { return el._classes.has(c); },
      toggle(c, on) { if (on === undefined) { el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c); } else if (on) el._classes.add(c); else el._classes.delete(c); }
    },
    appendChild(c) { el.children.push(c); },
    removeChild() {},
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector(sel) {
      if (typeof sel === 'string' && sel.charAt(0) === '#') return doc.getElementById(sel.slice(1));
      const cls = String(sel || '').replace(/^[.#]/, '');
      if (!cls) return null;
      if (String(el._html || '').indexOf(cls) >= 0) {
        if (!el._q) el._q = {};
        if (!el._q[cls]) el._q[cls] = mkEl(cls);
        return el._q[cls];
      }
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
    querySelector(sel) {
      const m = /^\.tab\[data-tab="([^"]+)"\]$/.exec(sel || '');
      if (!m) return null;
      for (const t of this.querySelectorAll('.tab')) if (t.dataset.tab === m[1]) return t;
      return null;
    },
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
  setInterval() { return 0; }, clearInterval() {},
  setTimeout() { return 0; }, clearTimeout() {},
  _intervals: [], _timeouts: [],
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const { SB } = loadAll(sandbox);

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? '  ' + detail : ''));
  if (!cond) failures++;
}

/* 离线稳定区间最多推进 2 游戏秒；核对批量步数及完整时间覆盖。 */
const OFFLINE_STEP = 2;

/* 跑一个离线场景，返回 {tick, msAfter, tDelta} */
function runScenario(gap, adOn, adMs) {
  SB.game.resetRun();              // 重开干净周目（= startRun）
  const S = SB.game.run();
  const origTick = SB.economy.tick;
  let tickCount = 0;
  SB.economy.tick = function (s, step, emit) { tickCount++; return origTick(s, step, emit); };

  S.ad.on = adOn;
  S.ad.ms = adMs;
  const msBefore = S.ad.ms;
  const tBefore = S.t;

  SB.game.planCatchUp(S, gap);     // 规划离线补算
  SB.game.drainCatchUp(100000);    // 单次跑完（200s 离线只花亚秒级墙钟）

  const msAfter = S.ad.ms;
  const tDelta = S.t - tBefore;
  SB.economy.tick = origTick;      // 还原，避免污染下个场景
  return { tick: tickCount, msBefore, msAfter, tDelta, gap };
}

function expectTicks(gap, adOn, adMs) {
  // 银行覆盖的真实秒（不超过 gap、不超过 bank 秒）
  const bankSec = Math.min(adMs / 1000, gap);
  const covered = adOn && bankSec > 0 ? bankSec : 0;
  const rest = gap - covered;
  const gameSeconds = covered * 2 + rest;
  return Math.ceil(gameSeconds / OFFLINE_STEP);
}

function expectMsAfter(gap, adOn, adMs) {
  if (!adOn) return adMs;          // 关着：冻结
  const bankSec = Math.min(adMs / 1000, gap);
  return Math.max(0, adMs - bankSec * 1000);
}

console.log('=== 离线双倍加速机制探针 ===');
console.log('OFFLINE_STEP = ' + OFFLINE_STEP + 's/批\n');

// 场景 A：银行(60s) < 离线(200s) → 前 60s@2× 后 140s@1×
const A = runScenario(200, true, 60000);
const AexpT = expectTicks(200, true, 60000), AexpM = expectMsAfter(200, true, 60000);
console.log('场景A  银行60s/离线200s：');
check('  A.tick 数符合 2×覆盖+1×剩余的批量推进', A.tick === AexpT, 'got=' + A.tick + ' exp=' + AexpT);
check('  A.银行扣到 0', A.msAfter === AexpM, 'got=' + A.msAfter + ' exp=' + AexpM);
check('  A.游戏时间完整覆盖离线时长', Math.abs(A.tDelta - (60 * 2 + 140)) < 1e-6, 'tDelta=' + A.tDelta.toFixed(1));

// 场景 B：银行(600s) > 离线(200s) → 全程 2×
const B = runScenario(200, true, 600000);
const BexpT = expectTicks(200, true, 600000), BexpM = expectMsAfter(200, true, 600000);
console.log('场景B  银行600s/离线200s（全程2×）：');
check('  B.tick 数符合全程2×批量推进', B.tick === BexpT, 'got=' + B.tick + ' exp=' + BexpT);
check('  B.银行扣 200s×1000', B.msAfter === BexpM, 'got=' + B.msAfter + ' exp=' + BexpM);
check('  B 全程2× 的 tick 是 1× 的两倍', B.tick === 2 * expectTicks(200, false, 0), '2×=' + B.tick + ' 1×=' + expectTicks(200, false, 0));

// 场景 C：开关关 → 全程 1×，银行冻结
const C = runScenario(200, false, 60000);
const CexpT = expectTicks(200, false, 60000), CexpM = expectMsAfter(200, false, 60000);
console.log('场景C  开关关/离线200s（1×冻结）：');
check('  C.tick 数符合全程1×批量推进', C.tick === CexpT, 'got=' + C.tick + ' exp=' + CexpT);
check('  C.银行不动（冻结）', C.msAfter === CexpM, 'got=' + C.msAfter + ' exp=' + CexpM);

// 坑2 守卫：主循环银行扣减段必须带 !loop.job，离线补算期间不被墙钟 nibble
const guard = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
check('  坑2守卫：主循环扣减段含 !loop.job',
  /if \(!loop\.job && S && !S\.broken && S\.ad && S\.ad\.on && S\.ad\.ms > 0\)/.test(guard),
  '（静态核对 game.js:481 主循环扣减段）');

console.log('\n=== 结论 ===');
if (failures === 0) {
  console.log('  ✓ 全部通过：离线确实按 2× 结算覆盖时段，银行按真实秒正确扣减，开关关时冻结。');
  process.exitCode = 0;
} else {
  console.log('  ✗ 有 ' + failures + ' 项失败，机制有回退，先别封包。');
  process.exitCode = 1;
}
