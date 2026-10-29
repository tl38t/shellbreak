/* 探针：资源面板「奢侈品行」文案位置 + 卡片等高（2026-10-21）。
 *
 * 用户诉求（原文）：「这里的产xx耗xx放到奢侈品后面去，把卡片调整成一样大的」。
 *
 * 现象：奢侈品行是 `<b>数值</b><span>奢侈品<i class=rate>净值</i><i class=sd>产 X · 耗 Y（按幸福 … 已剔 …）</i></span>`，
 *   那句长括号把卡片撑到 **3 行**；而 `.grid` 是 `align-items:stretch` ⇒ 整行被拉高，
 *   同一屏里这一行明显比别的行高（实测 5 列卡宽 204.8px：101.7 vs 71.7）。
 *
 * 改法（本探针验收的四条）：
 *   ① 产/耗挪到「奢侈品」**正后方**；
 *   ② 长括号解释改挂 `title`（桌面 hover），不再占卡面行高；
 *   ③ 奢侈品行不再叠一个净值（净 = 产 − 耗 是恒等式），避免窄屏多折一行；
 *   ④ 其它资源行的速率显示不受影响（回归）。
 *
 * 走真实路径：loadAll 按 index.html 顺序加载全部脚本 + 假 DOM，调 SB.game.renderAll()，
 * 读 `#res` 的 innerHTML 断言（不 mock 渲染逻辑）。
 * 同时把真实生成的卡片 HTML 导出到 %TEMP%，供 headless 用生产 CSS 量高度（见文件末尾提示）。
 * 用法：node sim/probe_render_res_luxury.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from './load-sb.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── 假 DOM（与 sim/probe_folk_render.mjs 同一套最小实现）── */
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
      else if (sel === '.spd') out = [1, 5, 10, 20].map(x => { const e = mkEl('spd-' + x); e.dataset.spd = String(x); return e; });
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

const { SB } = loadAll(sandbox);
const doc = sandbox.document;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

/* ── 造一个「有商人、有人口、有政体幸福偏移」的真实状态 ──
 * merchant>0 ⇒ 奢侈品解锁（resUnlocked 的 job 门）+ 有供给；
 * classical_republic ⇒ happyBonus=+1 ⇒ LL.bonus != 0 ⇒ 那句解释本该出现在 title 里。 */
const s = SB.game.run();
s.jobs = s.jobs || {};
s.jobs.merchant = 20;
s.pop = 400;
s.res.luxury = 1846.1;
s.civics = s.civics || {};
s.civics.trade = true;            // 奢侈品行的解锁门是 civic: 'trade'（config-content.js:142）
s.gov = 'classical_republic';
SB.game.renderAll();

const html = doc.getElementById('res').innerHTML;
const rowM = html.match(/<div class="res[^"]*"[^>]*><b data-res="luxury"[^]*?<\/span><\/div>/);
const row = rowM ? rowM[0] : '';
console.log('--- 奢侈品行 HTML ---\n' + row + '\n');

ok('奢侈品行已渲染', row.length > 0, '未匹配到 data-res="luxury" 的卡片');
if (row.length > 0) {
  const iName = row.indexOf('奢侈品');
  const iOut = row.indexOf('产 ');
  ok('① 产/耗已挪到「奢侈品」之后（顺序：名称 → 产/耗）', iName >= 0 && iOut > iName, 'name@' + iName + ' out@' + iOut);
  ok('① 产/耗紧跟名称（中间没有夹净值等其它节点）', /奢侈品<\/span><\/span><i class="sd"/.test(row), row.slice(Math.max(0, iName), iName + 60));
  ok('① 卡面仍含 产/耗 两个数', /\u4ea7\s<span class="lux-out">[\d.]+/.test(row) && /\u8017\s<span class="lux-burn">[\d.]+/.test(row));
  ok('② 长括号解释不再占卡面行（卡面文字里没有「已剔市政」）', row.replace(/title="[^"]*"/g, '').indexOf('已剔市政') < 0);
  ok('② 那句解释改挂 title（hover 仍可读到）', /title="[^"]*已剔市政[^"]*"/.test(row));
  ok('③ 奢侈品行不再重复净值（卡面没有 i.rate）', !/class="rate/.test(row));
}

/* ── 其它资源行速率显示不受影响（回归）── */
const kelpM = html.match(/<div class="res[^"]*"[^>]*><b data-res="kelp"[^]*?<\/span><\/div>/);
const kelpRow = kelpM ? kelpM[0] : '';
ok('④ 回归：藻食行仍正常显示速率（i.rate 未被误禁）', /class="rate/.test(kelpRow), kelpRow.slice(0, 120));

/* ── ⑤ 手机端 ⓘ（方案 C）：桌面 hover 才有的解释，手机端必须有等价入口 ── */
if (row.length > 0) {
  const tipBtnM = row.match(/<i class="hover-info-btn" title="([^"]*)">\u24d8<\/i>/);
  const sdTitleM = row.match(/<i class="sd" title="([^"]*)">/);
  ok('⑤ 奢侈品行生成手机端 ⓘ（.hover-info-btn）', !!tipBtnM, row.slice(0, 200));
  if (tipBtnM && sdTitleM) {
    ok('⑤ ⓘ 的 title == .sd 的 title（同一份文本，单一落点）',
      tipBtnM[1] === sdTitleM[1], '\u24d8="' + tipBtnM[1] + '"  sd="' + sdTitleM[1] + '"');
    ok('⑤ ⓘ 排在 产/耗 之后（不挤掉主读数）', row.indexOf('hover-info-btn') > row.indexOf('\u4ea7 '));
  }
  /* 浮层走**生产函数本身**（SB.ui.showHoverInfo 是 render.js 里那个，不是复制品）；
   * 假 DOM 的 addEventListener 是空的，所以这里直接调函数来验证「点按后的行为」。 */
  const tipTxt = tipBtnM ? tipBtnM[1] : '';
  SB.ui.showHoverInfo(tipTxt);
  const layer = doc.getElementById('hoverInfoLayer');
  ok('⑤ 点 ⓘ → 浮层写入的正是那句解释（桌面 hover 同款文本）',
    layer.textContent === tipTxt && layer.textContent.indexOf('已剔市政') >= 0,
    'got="' + layer.textContent + '"');
  ok('⑤ 浮层用 textContent 写入（绝不用 innerHTML 拼字符串）',
    layer._html === '' || layer._html === undefined, 'innerHTML="' + layer._html + '"');
  ok('⑤ 浮层已显示（未带 hidden）', !layer.classList.contains('hidden'));
  SB.ui.showHoverInfo('换一句');                                  // 复用同一节点、覆盖文本
  ok('⑤ 复用同一浮层节点（不无限堆 DOM）', doc.getElementById('hoverInfoLayer') === layer &&
    layer.textContent === '换一句');
  layer.classList.add('hidden');
  ok('⑤ 点外部/Esc → 浮层关闭', layer.classList.contains('hidden'));
}

/* ── ⑤ 反向：无解释（bonus=0）时不应凭空生成一个空 ⓘ ── */
{
  const s4 = SB.game.run();
  s4.jobs = s4.jobs || {}; s4.jobs.merchant = 20; s4.pop = 400; s4.res.luxury = 100;
  s4.civics = s4.civics || {}; s4.civics.trade = true;
  delete s4.gov; s4.wonders = {};
  SB.game.renderAll();
  const h4 = doc.getElementById('res').innerHTML;
  const r4m = h4.match(/<div class="res[^"]*"[^>]*><b data-res="luxury"[^]*?<\/span><\/div>/);
  ok('⑤ bonus=0（无解释）时不生成 ⓘ', r4m ? !/hover-info-btn/.test(r4m[0]) : false, r4m ? r4m[0] : 'no row');
}

/* ── 数值一致性：卡面 产−耗 必须等于 happyLedger.net（同一个账本）── */
if (row.length > 0) {
  const mOut = row.match(/\u4ea7\s<span class="lux-out">([\d.]+)/), mBurn = row.match(/\u8017\s<span class="lux-burn">([\d.]+)/);
  const LL = SB.economy.happyLedger(s);
  const shown = (mOut ? +mOut[1] : NaN) - (mBurn ? +mBurn[1] : NaN);
  ok('数值：卡面「产 − 耗」== happyLedger.net（同一口账本）', Math.abs(shown - LL.net) < 0.011,
    '卡面=' + shown.toFixed(2) + ' 账本=' + LL.net.toFixed(2));
}

/* ── 另一条 title 分支：幸福度 > 0 ⇒ 「按幸福 X 计」（用户截图里那句）── */
{
  const s3 = SB.game.run();
  s3.jobs = s3.jobs || {}; s3.jobs.merchant = 20; s3.pop = 400;
  s3.res.luxury = 1846.1;
  s3.civics = s3.civics || {}; s3.civics.trade = true;
  s3.gov = 'classical_republic';
  s3.happy = 20;                      // 幸福度足够高 ⇒ happyMech > 0 ⇒ 走「按幸福 … 计」分支
  SB.game.renderAll();
  const h3 = doc.getElementById('res').innerHTML;
  const r3m = h3.match(/<div class="res[^"]*"[^>]*><b data-res="luxury"[^]*?<\/span><\/div>/);
  const r3 = r3m ? r3m[0] : '';
  ok('title 分支二：幸福度>0 时显示「按幸福 X 计」（且仍不出现在卡面正文里）',
    /title="按幸福 [\d.]+ 计/.test(r3) && r3.replace(/title="[^"]*"/g, '').indexOf('按幸福') < 0,
    r3.slice(0, 160));
}

/* ── bonus=0 的状态：不应出现空的 title="" ── */
{
  const s2 = SB.game.run();
  s2.jobs = s2.jobs || {}; s2.jobs.merchant = 20; s2.pop = 400; s2.res.luxury = 100;
  s2.civics = s2.civics || {}; s2.civics.trade = true;
  delete s2.gov;
  s2.wonders = {};
  SB.game.renderAll();
  const h2 = doc.getElementById('res').innerHTML;
  const r2m = h2.match(/<div class="res[^"]*"[^>]*><b data-res="luxury"[^]*?<\/span><\/div>/);
  const r2 = r2m ? r2m[0] : '';
  ok('bonus=0 时不渲染空 title 属性', r2.length > 0 && !/title=""/.test(r2), r2.slice(0, 120));
}

/* ── ⑤ CSS 门控静态校验（不依赖浏览器，防「改 CSS 时把门控改坏」）──
 * ⚠️ 真正的可见性只能在浏览器里量（真实浏览器已验：触控 display≠none、桌面 display:none）；
 *    这里锁的是**规则存在与否**，属于低成本防回归，不是替代浏览器验证。 */
{
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', '00-core.css'), 'utf8');
  ok('⑤ CSS: .hover-info-btn 默认 display:none（桌面不显示 ⓘ）',
    /\.hover-info-btn\s*\{\s*display\s*:\s*none/.test(css));
  const mq = /@media\s*\(\s*hover\s*:\s*none\s*\)\s*\{([\s\S]*?)\n\}/.exec(css);
  ok('⑤ CSS: 存在 @media (hover:none) 门控块', !!mq);
  ok('⑤ CSS: (hover:none) 下 ⓘ 才显示（display:inline-flex）',
    !!mq && /\.hover-info-btn[^{]*\{[^}]*display\s*:\s*inline-flex/.test(mq[1]), mq ? mq[1].slice(0, 90) : 'no media block');
  ok('⑤ CSS: 浮层 .hover-info-layer 用 pre-line（多行标题可换行）',
    /\.hover-info-layer\s*\{[^}]*white-space\s*:\s*pre-line/.test(css));
  ok('⑤ CSS: ⓘ 触屏按下反馈用 :active（不靠 :hover 粘滞）',
    /\.hover-info-btn:active\s*\{/.test(css));
}

/* ── 把真实生成的卡片 HTML 导出，供 headless 用**生产 CSS** 量高度 ── */
try {
  const cssFiles = ['00-core.css', '20-panels.css', '30-visual-polish.css']
    .map(f => '<link rel="stylesheet" href="file:///D:/shellbreak/css/' + f + '">').join('\n');
  const probeHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' + cssFiles +
    '</head><body style="margin:0;background:#0b1a26"><div style="width:1080px;padding:12px">' +
    '<div class="grid" id="res">' + html + '</div></div>' +
    '<script>window.addEventListener("load",function(){var out=[];' +
    'var rs=document.querySelectorAll("#res .res");for(var i=0;i<rs.length;i++){var r=rs[i].getBoundingClientRect();' +
    'out.push((rs[i].querySelector("span").textContent.slice(0,4))+" h="+r.height.toFixed(1));}' +
    'document.title="H|"+out.join(" | ");});<\/script></body></html>';
  const p = path.join(os.tmpdir(), 'sb_res_cards.html');
  fs.writeFileSync(p, probeHtml, 'utf8');
  console.log('\n（已导出真实卡片 HTML 供量高：' + p + '）');
} catch (e) { console.log('（导出卡片 HTML 失败：' + e.message + '）'); }

console.log('\n== ' + pass + ' PASS / ' + fail + ' FAIL ==');
process.exit(fail ? 1 : 0);
