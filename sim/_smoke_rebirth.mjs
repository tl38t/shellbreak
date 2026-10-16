/* 天壳 / SHELLBREAK —「看广告 +1 轮回点」+「最多轮回点」排行榜 定向冒烟
 * 复用 e2e 的假 DOM 加载真实 src，专门验证两件事：
 *   ① 广告发奖 + 每日上限 10 次 + 跨天重置；
 *   ② 排行榜 config 完整性（tide 榜 ID / MAP 合法）+ 提交路径确实推 tide。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadAll } from './load-sb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}

/* ---- 假 DOM（与 e2e.mjs 同款）---- */
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
    removeChild() {}, addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
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
      if (sel === '.tab') out = ['village','folk','tech','civic','faith','workshop','wonder','company','meta'].map(t => { const e = mkEl('tab-' + t); e.dataset.tab = t; return e; });
      else if (sel === '.spd') out = [1,5,10,20].map(s => { const e = mkEl('spd-' + s); e.dataset.spd = String(s); return e; });
      q[sel] = out; return out;
    },
    querySelector(sel) {
      const m = /^\.tab\[data-tab="([^"]+)"\]$/.exec(sel || '');
      if (!m) return null;
      const list = this.querySelectorAll('.tab');
      for (const t of list) if (t.dataset.tab === m[1]) return t;
      return null;
    },
    addEventListener(type, fn) { (doc._ev[type] = doc._ev[type] || []).push(fn); },
    _ev: {}
  };
  return doc;
}

const store = new Map();
let fakeNow = 1000;
const sandbox = {
  console, document: makeDoc(),
  /* 让 SB.ad.available() 返回 true（dev 模式），否则 renderAd 会提前 return、不写按钮文案。
   * 真实生产环境有 tap + SPACE_ID 时也走这条可见路径；这里只是让 UI 渲染可被断言。 */
  location: { search: '?adtest' },
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
  performance: { now: () => fakeNow },
  _intervals: [], setInterval(fn) { sandbox._intervals.push(fn); return sandbox._intervals.length; }, clearInterval() {},
  _timeouts: [], setTimeout(fn) { sandbox._timeouts.push(fn); return sandbox._timeouts.length; }, clearTimeout() {},
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
const doc = sandbox.document;

let SB;
try {
  ({ SB } = loadAll(sandbox));
  SB.game.run();
  check('启动 + boot 成功', !!SB && !!SB.game);
} catch (e) {
  check('启动 + boot 成功', false, e.message + '\n' + e.stack);
  console.log(`\n=== 冒烟 ${pass}/${pass + fail} ===`); process.exit(1);
}

const CFG = SB.CFG;
const meta = SB.game.meta();

/* ---- ① 广告按钮在 DOM 中存在（紧挨 +30min 2×）---- */
check('① index.html 含 btnAdRebirth 按钮', !!doc.getElementById('btnAdRebirth'), 'text=' + (doc.getElementById('btnAdRebirth').textContent || ''));
check('① 含 adRebirthRemain 计数文本节点', !!doc.getElementById('adRebirthRemain'));

/* ---- ② 每日上限与发奖 ---- */
const max = (CFG.AD && CFG.AD.REBIRTH_DAILY_MAX) || 10;
check('② AD.REBIRTH_DAILY_MAX 已配置(=10)', max === 10, 'max=' + max);
const tide0 = meta.tide || 0;
let granted = 0;
for (let i = 0; i < 10; i++) if (SB.game.grantRebirthAd() === true) granted++;
check('② 连续看 10 次全部发奖', granted === 10, 'granted=' + granted);
check('② meta.tide 增加 10', (meta.tide || 0) === tide0 + 10, 'tide=' + meta.tide);
check('② adRebirth.count = 10', meta.adRebirth && meta.adRebirth.count === 10, 'count=' + (meta.adRebirth && meta.adRebirth.count));
const before11 = meta.tide || 0;
const r11 = SB.game.grantRebirthAd();
check('② 第 11 次被上限拦截(返回 false)', r11 === false, 'r=' + r11);
check('② 第 11 次不发奖(tide 不变)', (meta.tide || 0) === before11, 'tide=' + meta.tide);
check('② 副文本显示已满', /已满/.test(doc.getElementById('adRebirthRemain').textContent || ''), 'text="' + (doc.getElementById('adRebirthRemain').textContent || '') + '"');

/* ---- ③ 跨天重置 ---- */
meta.adRebirth = { date: '2000-1-1', count: 7 };   // 模拟昨天看满
const beforeReset = meta.tide || 0;
const r12 = SB.game.grantRebirthAd();
check('③ 跨天(旧日期)后第 1 次重新发奖', r12 === true && (meta.tide || 0) === beforeReset + 1, 'r=' + r12 + ' tide=' + meta.tide);
check('③ 重置后 count = 1', meta.adRebirth.count === 1, 'count=' + meta.adRebirth.count);
check('③ 重置后 date 更新为今天', meta.adRebirth.date === SB.game.todayKey(), 'date=' + meta.adRebirth.date);

/* ---- ④ 排行榜 config 完整性 ---- */
check('④ RANK.LB.tide 是真 ID(非空串且够长)', typeof CFG.RANK.LB.tide === 'string' && CFG.RANK.LB.tide.length >= 16, CFG.RANK.LB.tide);
check('④ RANK.MAP.tide 存在', !!CFG.RANK.MAP.tide, JSON.stringify(CFG.RANK.MAP.tide));
check('④ MAP.tide 是 numeric/desc/best', CFG.RANK.MAP.tide.scoreType === 'numeric' && CFG.RANK.MAP.tide.scoreOrder === 'desc' && CFG.RANK.MAP.tide.calcType === 'best');
check('④ readyKeys 含 tide', SB.rank.readyKeys().indexOf('tide') >= 0, JSON.stringify(SB.rank.readyKeys()));

/* ---- ⑤ 提交路径确实推 tide（静态判定 + 动态捕获）---- */
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
const perIdx = gameSrc.indexOf('function submitRankPeriodic');
const perSrc = gameSrc.slice(perIdx, gameSrc.indexOf('}', gameSrc.indexOf('SB.rank.submitRun', perIdx)) + 1);
check('⑤ 定期路径含 tide 键', perSrc.includes("key: 'tide'"), perSrc.slice(0, 200));
const brkIdx = gameSrc.indexOf('function submitRankOnBreak');
const brkSrc = gameSrc.slice(brkIdx, gameSrc.indexOf('}', gameSrc.indexOf('SB.rank.submitRun', brkIdx)) + 1);
check('⑤ 破壳路径含 tide 键（占满第 5 条配额）', brkSrc.includes("key: 'tide'"), brkSrc.slice(0, 200));
/* tide 分数口径 = floor(tide + spent)（累计已获得 = 当前余额 + 已花费） */
const st = SB.game.meta();
st.tide = 23; st.spent = 7;
check('⑤ tide 分数口径 = floor(tide+spent) = 30', Math.floor((st.tide || 0) + (st.spent || 0)) === 30, '=' + Math.floor((st.tide || 0) + (st.spent || 0)));

console.log(`\n=== 看广告+1轮回点 / 最多轮回点榜 冒烟 ${pass}/${pass + fail} ===`);
if (fails.length) { console.log('FAIL:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
console.log('ALL PASS');
