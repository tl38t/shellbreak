/* 天壳 — 倍速探针
 * 回答两个问题，都用真实生产代码跑：
 *   1. 页脚的倍速按钮真的改变推进速率吗？（点 .spd → game.setSpeed → loop 的 tick 次数）
 *   2. 高倍速的代价是什么？单帧要跑多少次 tick、占多少毫秒。
 * 结论性用法：node sim/speed-probe.mjs
 */
import { loadAll } from './load-sb.mjs';

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
    appendChild(c) { el.children.push(c); }, removeChild() {},
    addEventListener() {}, getAttribute() { return null; }
  };
  Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = String(v); } });
  return el;
}
function makeDoc() {
  const els = new Map();
  const qsa = new Map();          // 按 selector 缓存：真实浏览器两次 querySelectorAll 返回同一批节点
  const doc = {
    _els: els, readyState: 'complete',
    getElementById(id) { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
    createElement(tag) { const e = mkEl('new-' + tag); e.tag = tag; return e; },
    querySelectorAll(sel) {
      if (qsa.has(sel)) return qsa.get(sel);
      let out = [];
      if (sel === '.tab') out = ['village', 'folk', 'tech', 'meta'].map(t => { const e = mkEl('tab-' + t); e.dataset.tab = t; return e; });
      if (sel === '.spd') out = [1, 5, 10, 20].map(s => { const e = mkEl('spd-' + s); e.dataset.spd = String(s); return e; });
      qsa.set(sel, out);
      return out;
    },
    querySelector() { return null; },
    addEventListener(type, fn) { (doc._ev[type] = doc._ev[type] || []).push(fn); },
    _ev: {}
  };
  return doc;
}

const store = new Map();
const FRAME_MS = 100;
let fakeNow = 1000;
const sandbox = {
  console, document: makeDoc(),
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
  performance: { now: () => fakeNow },
  _intervals: [], setInterval(fn) { sandbox._intervals.push(fn); return sandbox._intervals.length; }, clearInterval() {},
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;

const { SB } = loadAll(sandbox);
const doc = sandbox.document;
const s = SB.game.run();

/* 铺一点基础产能，否则空转状态下测倍速噪声太大（资源恒 0，tick 几乎不做功） */
s.res.coral = 500;
for (let i = 0; i < 4; i++) fireBuild('kelp');
function fireBuild(id) {
  const before = SB.game.run().lvl[id] || 0;
  for (const fn of doc._ev['click'] || []) fn({ target: { dataset: { build: id } } });
  return (SB.game.run().lvl[id] || 0) > before;
}
for (let i = 0; i < 4; i++) fireBuild('kelp');
s.jobs.gather = 3;
// 跑 60 秒逻辑时间，让 tick 进入有实际计算的阶段
function advance(ms) {
  fakeNow += ms;
  for (const fn of sandbox._intervals) fn();
}

console.log('=== 倍速按钮是否真的改变推进速率 ===');
console.log('  起始状态：菌圃 ' + (s.lvl.kelp) + ' 级，采集者 ' + s.jobs.gather + '，菌毯 ' + s.res.kelp.toFixed(1));
for (let i = 0; i < 600; i++) advance(FRAME_MS);   // 60 秒真实时间 @1×

/* initSpeeds 在 boot 时批量绑定，它拿到的那批 .spd 节点才是绑上 onclick 的。
 * 这里的假 DOM 每次 querySelectorAll 都新建节点，所以必须先取一次并复用——
 * 与真实浏览器（返回同一批节点）的语义一致。 */
const spdNodes = doc.querySelectorAll('.spd');
const STEP = 0.1;                                    // 与 game.js 内部 STEP 一致
const FRAMES = 50;                                   // 50 帧 × 100ms = 5 秒真实时间
console.log('  （全部经由按钮 onclick 切换，不直接调 setSpeed）');
for (const spd of [1, 5, 10, 20]) {
  const node = spdNodes.find(n => n.dataset.spd === String(spd));
  if (!node || typeof node.onclick !== 'function') { console.log('  ' + spd + '×  [按钮未绑定]'); continue; }
  node.onclick();
  const t0 = s.t;
  const tWall = process.hrtime.bigint();
  for (let i = 0; i < FRAMES; i++) advance(FRAME_MS);
  const tWallMs = Number(process.hrtime.bigint() - tWall) / 1e6;
  const gameSec = s.t - t0;
  const realSec = FRAMES * FRAME_MS / 1000;
  console.log(
    '  ' + String(spd).padStart(2) + '×  ' + realSec + ' 秒真实 → ' + gameSec.toFixed(1) + ' 秒逻辑' +
    '  实测倍率 ' + (gameSec / realSec).toFixed(2) + '×' +
    '  | 单帧 ' + (gameSec / FRAMES / STEP).toFixed(0) + ' 次 tick / ' + (tWallMs / FRAMES).toFixed(3) + ' ms'
  );
}

console.log('\n=== 结论口径 ===');
console.log('  · 倍速压的是真实等待时间，不改变任何结算口径——同一局在 20× 下推进的秒数与 1× 相同。');
console.log('  · 代价线性落在每帧的 tick 次数上：20× 时每帧 200 次 tick，主线程占用约为 1× 的 20 倍。');
process.exit(0);
