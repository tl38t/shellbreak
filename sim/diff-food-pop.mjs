/* 食物/人口半解耦积分器 · 差分测试
 * 对照：逐帧参考路径（0.1s tick）vs 半解耦路径（tick 跳过 food/pop + integrateFoodPop）
 *      + 朴素路径（dt=2s 整块 tick，无切段 —— 用于复现「寒流穿零 100% 误差」）
 * 覆盖：寒流季 / 暖石耗尽 / 口粮穿零 / 饥荒死亡 / 职业回退 / 生育 / 人口上限
 * 纪律：参考与半解耦两路共用同一固定随机种子（SB.rng = mulberry32(seed)），
 *       冻伤掷骰锚定 0.1s 栅格 → 结果不随内部步长变化（架构目标 8）。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { loadAll, mulberry32 } from './load-sb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STEP = 0.1;

/* ---------- 假 DOM（复制自 _probe_offline_effect.mjs）---------- */
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
    addEventListener(type, fn) { (doc._ev = doc._ev || {})[type] = (doc._ev[type] || []); doc._ev[type].push(fn); }, _ev: {}
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

/* ---------- 默认状态夹具（完整默认：run + configure）----------
 * ⚠️ 关键：SB.game.run() 已把 s.lvl 初始化为「全建筑键=0」的完整对象（state.js freshRun）。
 *   这里只能【增量赋值】到 s.lvl，绝不能用局部对象整体替换——否则 coralhouse/tenement 等键
 *   丢失 ⇒ economy.popCap 里 `s.lvl.coralhouse * SB.BLD.house2` 变成 undefined*数 = NaN
 *   ⇒ s.pop = NaN ⇒ JSON 往返变 null ⇒ 两条路径都在 pop=null（食物消耗=0）的脏状态下跑，
 *     所谓「寒流穿零 100% 误差」正是这种 NaN 夹具的假象（用户第 5 条明令禁止引用 NaN 状态结果）。
 */
function configure(s) {
  s.t = 0; s._seasonIdx = 0; s.frozen = false; s.broken = false; s.era = 7;
  if (!s.perk) s.perk = (SB.state && SB.state.emptyPerks) ? SB.state.emptyPerks() : {};
  s.pop = 30; s.peak = 30;
  s.jobs = { gather: 35, coralwright: 2, quarrier: 1, miner: 1, scholar: 1, scribe: 0, merchant: 1 };
  // 增量写入：保留 run() 给的全部建筑键（coralhouse/tenement/...=0），只覆盖我们要的等级
  Object.assign(s.lvl, { kelp: 40, kelpstore: 2, ballast: 100, nest: 20, siltpit: 10, library: 8, institute: 4, school: 3, researchlab: 2, furnace: 4, hydroturbine: 2, hydroshop: 2, caravanserai: 2, temple: 3 });
  s.res = Object.assign(s.res || {}, { kelp: 10000, coral: 10000, stone: 10000, silt: 10000, warmstone: 10000, iron: 1000, science: 1000, culture: 1000, luxury: 1000, faith: 1000, fuel: 1000, hydro: 0, steel: 0 });
  s.civics = { trade: 1, theology: 1, explore: 1, market: 1 }; s.civShown = {};
  s.techs = {}; for (const t of SB.TECHS || []) s.techs[t.id] = true;
  s.eurekaMet = {}; s._grow = 0; s.famine = 0; s.warmOn = false; s.ad = { on: false, ms: 0 };
  // 真实游戏里雇佣后立即 reconcile 使 jobs ≤ pop；这里镜像，避免「jobs>pop」成为夹具假象
  if (SB.folk && SB.folk.reconcile) SB.folk.reconcile(s);
  s.pop = SB.economy.popCap(s); s.peak = s.pop;
  s.happy = 0; s.coldTicks = 0; s.warmBurning = false; s._seasonGrantPending = false;
}
function makeState() {
  SB.rng = mulberry32(20260928);
  SB.game.resetRun();
  const s = SB.game.run();
  configure(s);
  return s;
}
function clone(s) { return JSON.parse(JSON.stringify(s)); }

function msgToType(m) {
  if (m.indexOf('饿死') >= 0) return 'famine';
  if (m.indexOf('冻死') >= 0) return 'frost';
  if (m.indexOf('降生') >= 0) return 'birth';
  return '?';
}

/* ---------- 参考路径：0.1s 逐帧 ---------- */
function runReference(state, seconds, seed) {
  SB.rng = mulberry32(seed);
  const s = clone(state);
  const events = [];
  let prevPop = s.pop;
  const n = Math.round(seconds / STEP);
  const t0 = Date.now();
  for (let i = 1; i <= n; i++) {
    SB.economy.tick(s, STEP, function (m) { events.push({ type: msgToType(m), t: s.t, pop: s.pop }); });
    prevPop = s.pop;
  }
  return { s, events, ms: Date.now() - t0 };
}

/* ---------- 半解耦路径：tick(skipFoodPop) + integrateFoodPop（事件边界闭式积分）---------- */
function runDecoupled(state, seconds, seed) {
  SB.rng = mulberry32(seed);
  const s = clone(state);
  const chunk = SB.CFG.OFFLINE_STEP;
  const events = [];
  let prevPop = s.pop;
  let remaining = seconds, guard = 0;
  const t0 = Date.now();
  while (remaining > 1e-9 && guard++ < 1e7) {
    let dt = Math.min(chunk, remaining);
    // Mirror game.js offlineStep: tick(dt) settles non-food warmstone flows before
    // integrateFoodPop burns relief, so shrink the chunk when those flows can cross
    // the warmstone burn threshold inside this interval.
    const warmCold = s.warmOn && SB.economy.season(s.t).mult < 1;
    if (warmCold && s.res.warmstone > 0) {
      const wsRate = SB.economy.rates(s).warmstone || 0;
      const reliefRate = SB.economy.warmBurningNow(s) ? SB.CFG.WARM_RATE : 0;
      const otherDrain = Math.max(0, -(wsRate + reliefRate));
      const warmBuffer = SB.CFG.WARM_RATE * (1 + dt) + otherDrain * dt;
      if (s.res.warmstone <= warmBuffer) dt = Math.min(dt, STEP);
    }
    const tc = s.t;
    // 参考 tick 把 _gm 冻在「本 tick 开场 happy」（economy-tick.js:54，早于恒温器 step 4c）；
    // 积分器跑在 tick(skipFoodPop) 之后，故在 tick 之前抓「本段开场 happy」快照传给积分器，
    // 使 foodRate/civic 与参考用同一份 happy 基准（与面板===结算 同纪律）。
    const chunkHappy = s.happy;
    SB.economy.tick(s, dt, null, { skipFoodPop: true, skipHappy: true });
    SB.offline.integrateFoodPop(s, dt, { t0: tc }, function (m, tm) { events.push({ type: msgToType(m), t: tm, pop: s.pop }); });
    prevPop = s.pop;
    remaining -= dt;
  }
  return { s, events, ms: Date.now() - t0 };
}

/* ---------- 朴素路径：dt=2s 整块 tick，无切段（复现「寒流穿零 100% 误差」）---------- */
function runNaive(state, seconds, seed) {
  SB.rng = mulberry32(seed);
  const s = clone(state);
  const chunk = SB.CFG.OFFLINE_STEP;
  const events = [];
  let prevPop = s.pop;
  let remaining = seconds, guard = 0;
  const t0 = Date.now();
  while (remaining > 1e-9 && guard++ < 1e7) {
    const dt = Math.min(chunk, remaining);
    SB.economy.tick(s, dt, function (m) { events.push({ type: msgToType(m), t: s.t, pop: s.pop }); });
    if (s.pop > prevPop) events.push({ type: 'birth', t: s.t, pop: s.pop });
    prevPop = s.pop;
    remaining -= dt;
  }
  return { s, events, ms: Date.now() - t0 };
}

/* ---------- 比对 ---------- */
const FIELDS = ['kelp', 'pop', 'famine', 'famineDeaths', 'frostDeaths', 'peak', '_grow'];
const EPS = 1e-3;
function fieldErrors(ref, dec) {
  const out = {};
  for (const k of FIELDS) {
    const a = (k === 'kelp') ? (ref.res[k] || 0) : (ref[k] === undefined ? 0 : ref[k]);
    const b = (k === 'kelp') ? (dec.res[k] || 0) : (dec[k] === undefined ? 0 : dec[k]);
    out[k] = Math.abs(a - b);
  }
  return out;
}
function invariantsOK(s, tag) {
  const probs = [];
  if ((s.res.kelp || 0) < -1e-6) probs.push('kelp<0 (' + s.res.kelp + ')');
  if (s.pop < 1) probs.push('pop<1 (' + s.pop + ')');
  const cap = SB.economy.popCap(s);
  if (s.pop > cap + 1e-6) probs.push('pop>cap (' + s.pop + '>' + cap + ')');
  let jobSum = 0; for (const j in (s.jobs || {})) jobSum += (s.jobs[j] || 0);
  if (jobSum > s.pop + 1e-6) probs.push('jobs(' + jobSum + ')>pop(' + s.pop + ')');
  if (isNaN(s.res.kelp) || isNaN(s.pop) || isNaN(s.famine) || isNaN(s._grow)) probs.push('NaN');
  return probs;
}
function eventSeqOK(refEv, decEv, tol = SB.CFG.OFFLINE_STEP) {
  if (refEv.length !== decEv.length) return { ok: false, why: `事件数 ${refEv.length} vs ${decEv.length}` };
  for (let i = 0; i < refEv.length; i++) {
    if (refEv[i].type !== decEv[i].type) return { ok: false, why: `第${i}个事件类型 ${refEv[i].type} vs ${decEv[i].type}` };
    if (Math.abs((refEv[i].t || 0) - (decEv[i].t || 0)) > tol) return { ok: false, why: `第${i}个事件(${refEv[i].type})时刻差 ${(refEv[i].t - decEv[i].t).toFixed(3)}s` };
  }
  return { ok: true, why: '' };
}

const SEED = 20260928;
const results = [];

function scenario(name, setup, seconds, opts = {}) {
  const base = makeState();
  const st = clone(base); setup(st);
  const ref = runReference(st, seconds, SEED);
  const dec = runDecoupled(st, seconds, SEED);
  const fe = fieldErrors(ref.s, dec.s);
  const maxFE = Math.max.apply(null, FIELDS.map(k => fe[k]));
  // 离线资源流允许用户确认的 20% 近似误差；人口、死亡/生育计数、计时器仍要求近乎一致。
  const fieldOK = FIELDS.every(k => k === 'kelp'
    ? fe[k] <= Math.max(1, Math.abs(ref.s.res.kelp)) * 0.2
    : k === '_grow' ? fe[k] <= 2 * STEP
    : fe[k] < EPS);
  const invR = invariantsOK(ref.s, 'ref'), invD = invariantsOK(dec.s, 'dec');
  const ev = eventSeqOK(ref.events, dec.events);
  const pass = fieldOK && invR.length === 0 && invD.length === 0 && ev.ok;
  results.push({ name, seconds, pass, maxFE, fe, invR, invD, ev, refMs: ref.ms, decMs: dec.ms, refPop: ref.s.pop, decPop: dec.s.pop, refKelp: ref.s.res.kelp, decKelp: dec.s.res.kelp, refFamD: ref.s.famineDeaths, decFamD: dec.s.famineDeaths, refFrostD: ref.s.frostDeaths, decFrostD: dec.s.frostDeaths });
  console.log(`\n=== ${name} (${seconds}s, 种子 ${SEED}) ===`);
  console.log(`  参考: pop=${ref.s.pop} kelp=${ref.s.res.kelp.toFixed(2)} 饿死=${ref.s.famineDeaths} 冻死=${ref.s.frostDeaths} 事件=${ref.events.length} 墙钟=${ref.ms}ms`);
  console.log(`  半解耦: pop=${dec.s.pop} kelp=${dec.s.res.kelp.toFixed(2)} 饿死=${dec.s.famineDeaths} 冻死=${dec.s.frostDeaths} 事件=${dec.events.length} 墙钟=${dec.ms}ms`);
  console.log(`  字段最大误差: ${maxFE.toExponential(2)} (kelp≤20%，_grow≤${2 * STEP}s，其余<${EPS})  ${fieldOK ? 'PASS' : 'FAIL'}`);
  if (!fieldOK) console.log('  字段误差明细:', fe);
  if (invR.length) console.log(`  ⚠ 参考不变量违例: ${invR.join('; ')}`);
  if (invD.length) console.log(`  ⚠ 半解耦不变量违例: ${invD.join('; ')}`);
  console.log(`  事件序列: ${ev.ok ? 'PASS' : 'FAIL — ' + ev.why}  (参考${ref.events.length} / 半解耦${dec.events.length})`);
  if (opts.naive) {
    const nv = runNaive(st, seconds, SEED);
    const nvKelpErr = Math.abs(nv.s.res.kelp - ref.s.res.kelp) / Math.max(1, Math.abs(ref.s.res.kelp));
    const nvPopErr = Math.abs(nv.s.pop - ref.s.pop);
    console.log(`  朴素(dt=2s整块): pop=${nv.s.pop} kelp=${nv.s.res.kelp.toFixed(2)} 饿死=${nv.s.famineDeaths} 冻死=${nv.s.frostDeaths}`);
    console.log(`  → 朴素路径 vs 参考: kelp误差=${(nvKelpErr*100).toFixed(1)}% pop差=${nvPopErr}  ${nvKelpErr > 0.5 ? '★「寒流穿零 100% 误差」已复现' : ''}`);
  }
}

console.log('天壳 · 食物/人口半解耦积分器 差分测试');
console.log(`资源误差上限 20%；_grow 进度差不超过 ${2 * STEP}s，其他离散字段要求 ${EPS} 内；事件时刻容差 ${SB.CFG.OFFLINE_STEP}s`);
console.log('OFFLINE_STEP=' + SB.CFG.OFFLINE_STEP + '  SEASON_TICKS=' + SB.CFG.SEASON_TICKS + ' (寒流季=索引2, t∈[1200,1800))');

// 1) 暖石耗尽：寒流季 + 暖石=10（~9.1s 烧穿）→ 烧穿后冻伤恢复、口粮走寒流减产
scenario('①暖石耗尽（寒流季·暖石=10）', s => {
  s.t = 1200; s._seasonIdx = 2; s.frozen = true; s.warmOn = true; s.res.warmstone = 10;
}, 500);

// 2) 寒流季·口粮穿零（复现「100% 误差」的主场景）
scenario('②寒流季·口粮穿零（复现 100% 误差）', s => {
  s.t = 1200; s._seasonIdx = 2; s.frozen = true; s.warmOn = false; s.res.kelp = 50;
}, 500, { naive: true });

// 3) 口粮穿零·暖季（无季节减产，纯阈值切段）
scenario('③口粮穿零·暖季（kelp=20）', s => {
  s.t = 0; s._seasonIdx = 0; s.frozen = false; s.warmOn = false; s.res.kelp = 20;
}, 300);

// 4) 饥荒死亡 + 职业回退（暖季·kelp=5，净为负）
scenario('④饥荒死亡 + 职业回退（kelp=5）', s => {
  s.t = 0; s._seasonIdx = 0; s.frozen = false; s.warmOn = false; s.res.kelp = 5;
}, 300);

// 5) 生育 + 人口上限（暖季·满粮·pop=cap-1，应恰好生 1 人后停）
scenario('⑤生育 + 人口上限（pop=cap-1）', s => {
  s.t = 0; s._seasonIdx = 0; s.frozen = false; s.warmOn = false;
  s.pop = SB.economy.popCap(s) - 1; s.peak = s.pop; s.res.kelp = 10000;
}, 200);

// 6) 长时段稳定（暖季·满配·8h 内不跨季，验证无漂移）
scenario('⑥长时段稳定（暖季·500s）', s => {
  s.t = 0; s._seasonIdx = 0; s.frozen = false; s.warmOn = false;
}, 500);

// 7) 寒流季·长时段（冷季·满粮·验证冻伤掷骰栅格对齐）
scenario('⑦寒流季·冻伤掷骰（冷季·暖石充足）', s => {
  s.t = 1200; s._seasonIdx = 2; s.frozen = true; s.warmOn = true; s.res.warmstone = 10000;
}, 500);

console.log('\n================ 汇总 ================');
let allPass = true;
for (const r of results) {
  allPass = allPass && r.pass;
  console.log(`  ${r.name.padEnd(30)} 误差${r.maxFE.toExponential(1).padStart(8)}  ${r.pass ? 'PASS ✓' : 'FAIL ✗'}`);
}
console.log(allPass ? '\n全部场景 PASS ✓' : '\n存在 FAIL ✗');
process.exit(allPass ? 0 : 1);
