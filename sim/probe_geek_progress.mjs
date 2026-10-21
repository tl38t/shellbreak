/* 探针：G.E.E.K 启动后的「进度条 + 倒计时」渲染（2026-10-21）。
 * 验收：
 *  ① 进度条用的是 .prog（有 CSS 定义、可见），**不再**是用 .progbar（无 CSS ⇒ 隐形）；
 *  ② 进度条 <i> 带 id="envGeekBar"，宽度每帧实时刷新（Fractional %）；
 *  ③ 计时标签 id="envGeekRemain" 存在且每帧写入「倒计时 MM:SS / H:MM:SS」；
 *  ④ 启动中段（enceladusRun=900/1800）⇒ 进度 50%、倒计时应为 15:00。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadNoDom, ROOT } from './load-sb.mjs';

const { ctx, SB } = loadNoDom();
ctx.SB.ui = ctx.SB.ui || {};
ctx.SB.ui.renderContent = { BUILDING_FLAVOR: {}, TECH_FLAVOR: {}, WONDER_ART: {}, WONDER_FLAVOR: {} };

/* 假 DOM：innerHTML 写入时解析出子节点 id 并登记，使随后的 getElementById 能取到
 * （renderGeek 先写 box.innerHTML、再 el('envGeekBar')/el('envGeekRemain') 做每帧刷新）。 */
const registry = {};
function makeEl(id) {
  const el = {
    id, style: {}, _text: '', _html: '',
    set textContent(v) { this._text = v; }, get textContent() { return this._text; },
    set innerHTML(html) {
      this._html = html;
      const ids = (html.match(/id="([^"]+)"/g) || []).map(m => m.slice(4, -1));
      ids.forEach(cid => { if (!registry[cid]) registry[cid] = makeEl(cid); });
    },
    get innerHTML() { return this._html; }
  };
  return el;
}
const box = makeEl('envGeek'); registry['envGeek'] = box;
ctx.document = {
  getElementById: (id) => registry[id] || (registry[id] = makeEl(id)),
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {}
};

vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/ui/render-environment.js'), 'utf8'), ctx, { filename: 'render-environment.js' });
const renderGeek = SB.ui.renderParts.renderGeek;
if (typeof renderGeek !== 'function') { console.error('FAIL: renderGeek not exposed'); process.exit(1); }

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra != null ? '  → ' + extra : '')); }
}

/* 构造「已建成 + 已启动 + 改造进行中」状态 */
const s = SB.state.freshRun(false);
s.wonders = { wonder_geek: true };
s.geek = { geekOn: true, enceladusDone: false, terraDone: false, costOffset: 0, enceladusRun: 900, terraRun: 0, starved: false };
s.geekStarved = false;
// 材料充足，避免落进 starved 分支
s.res = s.res || {};
s.res.kelp = 1e9; s.res.metal = 1e9; s.res.coral = 1e9;
// 热液能剩流充足：造一个核热厂给供给
s.lvl.fissionplant = 5;

renderGeek(s);

const html = box.innerHTML;
console.log('--- innerHTML (截取) ---');
console.log(html.slice(0, 400));
console.log('--- countdown span ---');
console.log('envGeekRemain.textContent =', JSON.stringify(registry['envGeekRemain'] && registry['envGeekRemain']._text));

check('进度条用 .prog（可见，有 CSS）', /class="prog"/.test(html) && !/class="progbar"/.test(html), html.match(/class="(progra?)[^"]*"/));
check('进度条 <i> 带 id envGeekBar', /<i id="envGeekBar"/.test(html));
check('倒计时标签带 id envGeekRemain', /<span class="tag" id="envGeekRemain">/.test(html));
check('进度条宽度 ≈ 50%', Math.abs(parseFloat(registry['envGeekBar'].style.width) - 50) < 0.5, registry['envGeekBar'].style.width);
check('倒计时文本 = 15:00（900/1800 剩 900s）', (registry['envGeekRemain'] && registry['envGeekRemain']._text) === '倒计时 15:00',
  registry['envGeekRemain'] && registry['envGeekRemain']._text);

/* 推进进度到 1700/1800，倒计时应变小、宽度变大 */
s.geek.enceladusRun = 1700;
renderGeek(s);
const w = parseFloat(registry['envGeekBar'].style.width);
const cd = registry['envGeekRemain']._text;
console.log('进度 1700/1800：宽度 ' + w + '% / 倒计时 ' + cd);
check('推进后宽度 ≈ 94.4%', Math.abs(w - (1700 / 1800 * 100)) < 0.5, w);
check('推进后倒计时 = 01:40（剩 100s）', cd === '倒计时 01:40', cd);

/* 完成恩克拉多斯后切换泰拉阶段：泰拉改造运转中，倒计时应显示（3600s 余 ⇒ 1:00:00） */
s.geek.enceladusDone = true; s.geek.enceladusRun = 1800;
s.techs = { terraform: true };   // 解锁泰拉
s.geek.terraRun = 0; s.res.kelp = 1e9; s.res.metal = 1e9; s.res.coral = 1e9; s.geekStarved = false;
renderGeek(s);
check('泰拉阶段：进度条仍在、宽度 0% 起', /<i id="envGeekBar"/.test(box.innerHTML));
check('泰拉阶段：倒计时显示（运转中，余 3600s ⇒ 1:00:00）', (registry['envGeekRemain']._text || '') === '倒计时 1:00:00',
  registry['envGeekRemain'] && registry['envGeekRemain']._text);

/* 停摆态：材料见底 ⇒ starved，倒计时标签不再渲染 */
s.res.kelp = 0;
s.geekStarved = true;
renderGeek(s);
check('停摆态：卡面不再含倒计时标签', !/id="envGeekRemain"/.test(box.innerHTML));

console.log('\n== ' + pass + ' PASS / ' + fail + ' FAIL ==');
process.exit(fail ? 1 : 0);
