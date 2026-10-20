/* 定向回归探针：验证「robotbay>0 但 s.robotJobs 缺失 ⇒ 族民页渲染抛错 ⇒ UI 刷新死掉 ⇒
 * 所有族民点击（人类＋/机器人＋/×N 步长）看起来全死」这一回归已被修复。
 * 用 e2e 的假 DOM + loadAll 加载真实脚本（按 index.html 顺序），走真实 onClick / renderAll 路径。
 * 不依赖 headless 浏览器。用法：node sim/probe_folk_render.mjs */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadAll } from './load-sb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
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
      if (sel === '.tab') out = ['village', 'folk', 'tech', 'civic', 'faith', 'workshop', 'wonder', 'company', 'meta'].map(t => { const e = mkEl('tab-' + t); e.dataset.tab = t; return e; });
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
  performance: { now: () => 1000 }, _intervals: [],
  setInterval(fn) { sandbox._intervals.push(fn); return sandbox._intervals.length; }, clearInterval() {},
  _timeouts: [], setTimeout(fn) { sandbox._timeouts.push(fn); return sandbox._timeouts.length; }, clearTimeout() {},
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;

let SB;
({ SB } = loadAll(sandbox));
const doc = sandbox.document;
const s = SB.game.run();

const results = [];
function check(name, cond, detail) { results.push({ name, pass: !!cond, detail }); }

// 模拟「在 robotJobs 种子加入前就建了 robotbay 的本局 / 老存档」：robotbay>0 但 robotJobs 缺失
s.lvl.robotbay = 1;
delete s.robotJobs;

// 1) 渲染不能再崩（根因：render-pane-folk 读 s.robotJobs[rj.id] 抛错）
let renderThrew = null;
try { SB.game.renderAll(); } catch (e) { renderThrew = e.message; }
check('族民页在 robotbay>0 & robotJobs 缺失时不再渲染崩溃', !renderThrew, renderThrew || 'ok');

// 2) 人类＋（用户主诉）走真实 onClick 必须成功且无抛错
s.pop = 5; s.jobs.gather = 0;
const beforeHuman = s.jobs.gather;
let humanThrew = null;
try { for (const fn of (doc._ev['click'] || [])) fn({ target: { dataset: { job: 'gather', d: '1' } } }); }
catch (e) { humanThrew = e.message; }
check('真实点击「人类＋」成功改变 state 且不抛错', !humanThrew && s.jobs.gather === beforeHuman + 1,
  (humanThrew || ('state ' + beforeHuman + '→' + s.jobs.gather)));

// 3) 机器人＋走真实 onClick 必须成功
s.robotJobs = {}; // 真实存档修复后会有
SB.folk.assignRobot(s, 'gather', 1);
s.jobs.gather = 0;
const beforeRobot = s.robotJobs.gather || 0;
let robotThrew = null;
try { for (const fn of (doc._ev['click'] || [])) fn({ target: { dataset: { robotJob: 'gather', d: '1' } } }); }
catch (e) { robotThrew = e.message; }
check('真实点击「机器人＋」成功改变 state 且不抛错', !robotThrew && (s.robotJobs.gather || 0) === beforeRobot + 1,
  (robotThrew || ('state ' + beforeRobot + '→' + (s.robotJobs.gather || 0))));

// 4) ×N 步长胶囊点击不抛错
let stepThrew = null;
try { for (const fn of (doc._ev['click'] || [])) fn({ target: { dataset: { step: '1' } } }); }
catch (e) { stepThrew = e.message; }
check('点击「×N 步长」胶囊不抛错', !stepThrew, stepThrew || 'ok');

let allPass = true;
for (const r of results) {
  console.log((r.pass ? '✓ PASS ' : '✗ FAIL ') + r.name + (r.detail && r.detail !== 'ok' ? '  [' + r.detail + ']' : ''));
  if (!r.pass) allPass = false;
}
console.log('\n' + (allPass ? '全部通过：族民分配回归已修复。' : '存在失败项，需排查。'));
process.exit(allPass ? 0 : 1);
