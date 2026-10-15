/* 离线事件边界快进 — 效果实测探针
 * 镜像 sim/e2e.mjs 的假 DOM + loadAll，用真实生产代码驱动离线路径。
 * 对比：0.1s 逐步基准 (reference) vs 事件边界版 (planCatchUp+drainCatchUp)。
 * 报告：tick 调用次数 / 墙钟 / dt 分布 / 最大 dt / 资源误差。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { loadAll } from './load-sb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------- 假 DOM (copy from e2e.mjs) ---------- */
function mkEl(id) {
  const el = {
    id, _html: '', textContent: '', value: '', checked: false,
    dataset: {}, style: {}, children: [], onclick: null,
    _classes: new Set(id === 'modal' ? ['hidden'] : []),
    classList: {
      add(c) { el._classes.add(c); }, remove(c) { el._classes.delete(c); },
      contains(c) { return el._classes.has(c); },
      toggle(c, on) { if (on === undefined) { el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c); } else if (on) el._classes.add(c); else el._classes.delete(c); }
    },
    appendChild(c) { el.children.push(c); }, removeChild() {}, addEventListener() {},
    setAttribute() {}, getAttribute() { return null; },
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
      if (sel === '.tab') out = ['village', 'folk', 'tech', 'civic', 'faith', 'workshop', 'wonder', 'company', 'meta'].map((t, i) => { const e = mkEl('tab-' + t); e.dataset.tab = t; e._tab = i; return e; });
      else if (sel === '.spd') out = [1, 5, 10, 20].map(s => { const e = mkEl('spd-' + s); e.dataset.spd = String(s); return e; });
      q[sel] = out; return out;
    },
    querySelector(sel) { const m = /^\.tab\[data-tab="([^"]+)"\]$/.exec(sel || ''); if (!m) return null; const list = this.querySelectorAll('.tab'); for (const t of list) if (t.dataset.tab === m[1]) return t; return null; },
    addEventListener(type, fn) { (doc._ev[type] = doc._ev[type] || []).push(fn); }, _ev: {}
  };
  return doc;
}

const store = new Map();
const sandbox = {
  console, document: makeDoc(),
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
  performance: { now: () => 0 }, _intervals: [], setInterval(fn) { sandbox._intervals.push(fn); return sandbox._intervals.length; }, clearInterval() {},
  _timeouts: [], setTimeout(fn) { sandbox._timeouts.push(fn); return sandbox._timeouts.length; }, clearTimeout() {},
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
const { SB } = loadAll(sandbox);
const doc = sandbox.document;
SB.rng = () => 0.999999; // 固定种子，冻伤掷骰恒不触发，两路对照公平（与 offline-fastforward suite 同口径）

/* ---------- 状态构造 (copy from offline-fastforward suite) ---------- */
function configure(s) {
  s.t = 0; s._seasonIdx = 0; s.frozen = false; s.broken = false; s.era = 7;
  s.pop = 30; s.peak = 30;
  s.jobs = { gather: 35, coralwright: 2, quarrier: 1, miner: 1, scholar: 1, scribe: 0, merchant: 1 };
  s.lvl = { kelp: 40, kelpstore: 2, ballast: 100, nest: 20, siltpit: 10, library: 8, institute: 4, school: 3, researchlab: 2, furnace: 4, hydroturbine: 2, hydroshop: 2, caravanserai: 2, temple: 3 };
  s.res = Object.assign(s.res, { kelp: 10000, coral: 10000, stone: 10000, silt: 10000, warmstone: 10000, iron: 1000, science: 1000, culture: 1000, luxury: 1000, faith: 1000, fuel: 1000, hydro: 0, steel: 0 });
  s.civics = { trade: 1, theology: 1, explore: 1, market: 1 }; s.civShown = {};
  s.techs = {}; for (const t of SB.TECHS || []) s.techs[t.id] = true;
  s.eurekaMet = {}; s._grow = 0; s.famine = 0; s.warmOn = false; s.ad.on = false; s.ad.ms = 0;
  s.pop = SB.economy.popCap(s); s.peak = s.pop;
}
function runOne() { SB.game.resetRun(); const s = SB.game.run(); configure(s); return s; }
function clone(s) { return JSON.parse(JSON.stringify(s)); }

/* ---------- 0.1s 逐步基准 ---------- */
const STEP = 0.1;
function reference(state, seconds) {
  const s = clone(state);
  const n = seconds / STEP;
  let ticks = 0; const t0 = Date.now();
  for (let i = 1; i <= n; i++) {
    SB.economy.tick(s, STEP, null); ticks++;
    if (s._seasonGrantPending) { SB.economy.seasonGrant(s); s._seasonGrantPending = false; }
    if (i % 20 === 0) { SB.game.pumpTech(s, null); SB.game.pumpCivic(s, null); }
  }
  return { ticks, ms: Date.now() - t0, res: s.res, t: s.t };
}

/* ---------- 事件边界快进 (真实生产路径，必须用真实 S，不得 clone) ---------- */
function fast(state, seconds) {
  const s = state; // 真实 S：drainCatchUp 校验 j.s === 模块内部 S，clone 会让它直接 bail
  let ticks = 0; const dts = []; let maxDt = 0;
  const orig = SB.economy.tick;
  SB.economy.tick = function (st, dt, emit) { ticks++; dts.push(dt); if (dt > maxDt) maxDt = dt; return orig(st, dt, emit); };
  const t0 = Date.now();
  SB.game.planCatchUp(s, seconds);
  SB.game.drainCatchUp(1e9);
  SB.economy.tick = orig;
  const ms = Date.now() - t0;
  const hist = {};
  for (const d of dts) { const k = (Math.round(d * 100) / 100).toString(); hist[k] = (hist[k] || 0) + 1; }
  return { ticks, ms, maxDt, dts: dts.length, res: s.res, t: s.t, hist };
}

/* ---------- 比对 ---------- */
const RES_KEYS = ['kelp', 'coral', 'stone', 'silt', 'warmstone', 'iron', 'science', 'culture', 'luxury', 'faith', 'fuel', 'steel'];
function worstError(refRes, fastRes) {
  let w = { key: '', error: 0, ref: 0, fast: 0 };
  for (const k of RES_KEYS) {
    const expected = refRes[k] || 0, actual = fastRes[k] || 0;
    const err = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
    if (err > w.error) w = { key: k, error: err, ref: expected, fast: actual };
  }
  return w;
}
function fmtDur(sec) { const h = Math.floor(sec / 3600); return h > 0 ? h + 'h' : Math.round(sec / 60) + 'm'; }

function scenario(name, seconds, opts = {}) {
  const base = runOne();
  if (opts.ad2x) { base.ad.on = true; base.ad.ms = seconds * 1000; }
  if (opts.warmCold) { base.warmOn = true; base.res.warmstone = 10; base.t = 1200; base._seasonIdx = 2; } // t=1200 落在寒流季(冷)
  const ref = reference(base, seconds);
  const f = fast(base, seconds);
  const w = worstError(ref.res, f.res);
  const tickSpeedup = ref.ticks / f.ticks;
  const timeSpeedup = ref.ms / Math.max(1, f.ms);
  const topDt = Object.entries(f.hist).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => `dt=${k}:${v}`).join('  ');
  console.log(`\n=== ${name} (${fmtDur(seconds)}) ===`);
  console.log(`  ref : ticks=${ref.ticks}  wall=${ref.ms}ms  t=${ref.t.toFixed(1)}`);
  console.log(`  fast: ticks=${f.ticks}  wall=${f.ms}ms  t=${f.t.toFixed(1)}  maxDt=${f.maxDt.toFixed(3)}s`);
  console.log(`  speedup: 调用 x${tickSpeedup.toFixed(1)}   墙钟 x${timeSpeedup.toFixed(1)}`);
  console.log(`  dt分布Top5: ${topDt}`);
  console.log(`  资源误差(最坏): ${w.key} ${(w.error * 100).toFixed(2)}%  (ref=${w.ref.toFixed(2)}, fast=${w.fast.toFixed(2)})  ${w.error <= 0.2 ? 'PASS≤20%' : 'FAIL>20%'}`);
  return { name, seconds, refTicks: ref.ticks, fastTicks: f.ticks, tickSpeedup, timeSpeedup, errPct: w.error * 100, pass: w.error <= 0.2 };
}

console.log('天壳离线事件边界快进 — 效果实测');
console.log('OFFLINE_STEP=2, CATCHUP_BUDGET 由 drainCatchUp(1e9) 一次性跑完');
const rows = [];
rows.push(scenario('默认晚期局 · 30分钟', 1800));
rows.push(scenario('默认晚期局 · 8小时', 8 * 3600));
rows.push(scenario('2×双倍银行 · 8小时', 8 * 3600, { ad2x: true }));
rows.push(scenario('暖石寒流段回退 · 8小时', 8 * 3600, { warmCold: true }));

console.log('\n================ 汇总 ================');
for (const r of rows) console.log(`  ${r.name.padEnd(22)} 调用x${r.tickSpeedup.toFixed(1).padStart(6)}  墙钟x${r.timeSpeedup.toFixed(1).padStart(6)}  误差${r.errPct.toFixed(1).padStart(6)}%  ${r.pass ? 'PASS' : 'FAIL'}`);
