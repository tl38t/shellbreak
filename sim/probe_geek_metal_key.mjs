/* G.E.E.K「金属读到 0 / 永久停摆」bug 修复验证（2026-10-21）。
 * 根因：资源表里「金属」的键是 silt（config-content.js:41），旧代码读 s.res.metal（不存在 → 0），
 *   ⇒ GEEK 永远判金属不足而永久停摆、卡面恒显「金属 0」。
 * 修复：tick 与卡面改读 s.res.silt；新配方 = 1500 藻食 + 500 金属(silt) + 500 石头 + 500 珊瑚 / 秒。
 * 本探针直接跑真实 tickShell + 真实 renderGeek，验证修复后行为（不mock扣费）。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadNoDom, ROOT } from './load-sb.mjs';

const { ctx, SB } = loadNoDom();
ctx.SB.ui = ctx.SB.ui || {};
ctx.SB.ui.renderContent = { BUILDING_FLAVOR: {}, TECH_FLAVOR: {}, WONDER_ART: {}, WONDER_FLAVOR: {} };
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/ui/render-environment.js'), 'utf8'), ctx, { filename: 'render-environment.js' });

function fakeDoc() {
  const reg = {};
  function makeEl(id) {
    return { id, style: {}, _t: '', _h: '',
      set textContent(v) { this._t = v; }, get textContent() { return this._t; },
      set innerHTML(h) { this._h = h; (h.match(/id="([^"]+)"/g) || []).forEach(m => { const c = m.slice(4, -1); if (!reg[c]) reg[c] = makeEl(c); }); },
      get innerHTML() { return this._h; } };
  }
  return { reg, document: { getElementById: (id) => reg[id] || (reg[id] = makeEl(id)), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} } };
}

function makeState(overrides) {
  const s = SB.state.freshRun(false);
  s.wonders = { wonder_geek: true };
  s.geek = { geekOn: true, enceladusDone: false, terraDone: false, costOffset: 0, enceladusRun: 0, terraRun: 0 };
  s.geekStarved = false;
  s.res = s.res || {};
  s.res.kelp = 1e9; s.res.silt = 1e9; s.res.stone = 1e9; s.res.coral = 1e9;
  s._hydroFlow = { geekDraw: 1, skyDraw: 1, left: 1e9, supplyRate: 1e9, shopRate: 0 };
  if (overrides) Object.assign(s.res, overrides);
  return s;
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

const C = SB.CFG;
ok('常量: GEEK_KELP=1500', C.GEEK_KELP === 1500, C.GEEK_KELP);
ok('常量: GEEK_METAL=500', C.GEEK_METAL === 500, C.GEEK_METAL);
ok('常量: GEEK_STONE=500', C.GEEK_STONE === 500, C.GEEK_STONE);
ok('常量: GEEK_CORAL=500', C.GEEK_CORAL === 500, C.GEEK_CORAL);

// ── 场景 1：资源全满 + 热液能足够 → GEEK 应真正运转并按新配方扣料 ──
{
  const s = makeState();
  const d = fakeDoc(); ctx.document = d.document;
  const emit = () => {};
  for (let i = 0; i < 10; i++) SB.shell.tickShell(s, 1, emit, {});
  ok('全满料: enceladusRun 推进到 10（不再永久停摆）', s.geek.enceladusRun === 10, 'enceladusRun=' + s.geek.enceladusRun);
  ok('全满料: 未判定停摆', s.geekStarved === false);
  ok('扣费: 藻食 -15000 (1500×10)', Math.floor(s.res.kelp) === 1e9 - 15000, 'kelp=' + Math.floor(s.res.kelp));
  ok('扣费: 金属(silt) -5000 (500×10)', Math.floor(s.res.silt) === 1e9 - 5000, 'silt=' + Math.floor(s.res.silt));
  ok('扣费: 石头 -5000 (500×10)', Math.floor(s.res.stone) === 1e9 - 5000, 'stone=' + Math.floor(s.res.stone));
  ok('扣费: 珊瑚 -5000 (500×10)', Math.floor(s.res.coral) === 1e9 - 5000, 'coral=' + Math.floor(s.res.coral));

  SB.ui.renderParts.renderGeek(s);
  const html = d.reg['envGeek'] ? d.reg['envGeek'].innerHTML : '';
  ok('运转卡面: 进度条用 .prog 类（非不可见的 .progbar）', /class="prog"/.test(html) && !/class="progbar"/.test(html));
  ok('运转卡面: 有进度条 fill id="envGeekBar" 且宽度 > 0', /id="envGeekBar"[^>]*width:\s*([\d.]+)%/.test(html) && parseFloat(html.match(/id="envGeekBar"[^>]*width:\s*([\d.]+)%/)[1]) > 0);
  ok('运转卡面: 有倒计时槽 id="envGeekRemain"', /id="envGeekRemain"/.test(html));
  ok('运转卡面: ds 文案为「运转中」', /运转中/.test(html));
}

// ── 场景 1b：金属(silt)满仓、但藻食=0 → 停摆文案应读「金属」真实值（证明键=silt 非 metal=0）──
{
  const s = makeState({ kelp: 0 });
  const d = fakeDoc(); ctx.document = d.document;
  const emit = () => {};
  for (let i = 0; i < 3; i++) SB.shell.tickShell(s, 1, emit, {});
  SB.ui.renderParts.renderGeek(s);
  const html = d.reg['envGeek'] ? d.reg['envGeek'].innerHTML : '';
  const m = html.match(/金属\s*([\d,]+)/);
  ok('停摆卡面: 「金属」显示真实库存 1,000,000,000（读 silt，非恒 0）',
    m && (function(){ var n = +m[1].replace(/,/g,''); return n === 1e9; })(),
    'got=' + (m ? m[1] : 'null'));
  ok('停摆卡面: 含「石头」且数值=1,000,000,000（真实 stone，非 0）',
    (function(){ var mm = html.match(/石头\s*([\d,]+)/); return mm && (+mm[1].replace(/,/g,'') === 1e9); })(), 'got=' + (html.match(/石头\s*([\d,]+)/) || []).slice(1).join(''));
  ok('停摆卡面: 文案为「材料见底」', /停摆：材料见底/.test(html));
  ok('停摆卡面: 不再有「金属 0」（证明不再读不存在的 metal 键）', !/金属\s*0\b/.test(html));
}

// ── 场景 2：金属(silt)=0 → 应停摆且不扣费 ──
{
  const s = makeState({ silt: 0 });
  const emit = () => {};
  for (let i = 0; i < 10; i++) SB.shell.tickShell(s, 1, emit, {});
  ok('金属=0: 判定停摆', s.geekStarved === true);
  ok('金属=0: enceladusRun 不增长', s.geek.enceladusRun === 0, 'enceladusRun=' + s.geek.enceladusRun);
  ok('金属=0: 其它料不被误扣（藻食仍满）', Math.floor(s.res.kelp) === 1e9, 'kelp=' + Math.floor(s.res.kelp));
}

// ── 场景 3：石头=0（其余满）→ 现石头也是必耗项，应停摆 ──
{
  const s = makeState({ stone: 0 });
  const emit = () => {};
  for (let i = 0; i < 10; i++) SB.shell.tickShell(s, 1, emit, {});
  ok('石头=0: 判定停摆（石头已成必耗项）', s.geekStarved === true);
  ok('石头=0: enceladusRun 不增长', s.geek.enceladusRun === 0, 'enceladusRun=' + s.geek.enceladusRun);
}

// ── 场景 4：藻食不足（=100 < 1500）→ 停摆、不扣费 ──
{
  const s = makeState({ kelp: 100 });
  const emit = () => {};
  for (let i = 0; i < 10; i++) SB.shell.tickShell(s, 1, emit, {});
  ok('藻食不足: 判定停摆', s.geekStarved === true);
  ok('藻食不足: enceladusRun 不增长', s.geek.enceladusRun === 0);
  ok('藻食不足: 金属/石头/珊瑚不被误扣', Math.floor(s.res.silt) === 1e9 && Math.floor(s.res.stone) === 1e9 && Math.floor(s.res.coral) === 1e9);
}

// ── 场景 5：未启动态卡面应列出新配方 ──
{
  const s = makeState(); s.geek.geekOn = false;
  const d = fakeDoc(); ctx.document = d.document;
  SB.ui.renderParts.renderGeek(s);
  const html = d.reg['envGeek'] ? d.reg['envGeek'].innerHTML : '';
  ok('未启动卡面: 列出 藻食(1500)+金属(500)+石头(500)+珊瑚(500)', /藻食\(1500[^)]*\)[^<]*金属\(500[^)]*\)[^<]*石头\(500[^)]*\)[^<]*珊瑚\(500/.test(html), html.replace(/<[^>]+>/g,' ').slice(0,200));
}

console.log('\n== ' + pass + ' PASS / ' + fail + ' FAIL ==');
process.exit(fail ? 1 : 0);
