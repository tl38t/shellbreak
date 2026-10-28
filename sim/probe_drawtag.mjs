import fs from 'fs';
import vm from 'vm';

const code = fs.readFileSync('src/ui/render-info.js', 'utf8');
const sandbox = {
  SB: {
    game: { run: () => ({}) },
    ui: {
      renderContent: { BUILDING_FLAVOR: {}, TECH_FLAVOR: {}, WONDER_ART: {}, WONDER_FLAVOR: {} },
    },
    // 桩：卫星每运转 1/s、空间站每运转 2/s，按等级折算（0 运转→0 触发 IDLE 文案），仅验证格式与口径
    economy: { consumeRates: (s, id) => ({
      hydro: id === 'satellite' ? (s.lvl.satellite || 0) : (s.lvl.spacestation || 0) * 2,
    }) },
  },
  console,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'render-info.js' });

const dt = sandbox.SB.ui && sandbox.SB.ui.drawTag;
if (typeof dt !== 'function') { console.error('FAIL: SB.ui.drawTag not exposed'); process.exit(1); }

const sat = dt({ lvl: { satellite: 3 } }, 'satellite');
const station = dt({ lvl: { spacestation: 3 } }, 'spacestation');
const idle = dt({ lvl: { satellite: 0 } }, 'satellite');

console.log('SAT    :', sat);
console.log('STATION:', station);
console.log('IDLE   :', idle);

// 断言：与巢穴同源的两位小数格式 + tooltip，且不再带「·座」
function assert(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) process.exit(1); }
assert('sat has 热液能 −3.00/秒', /热液能 −3\.00\/秒/.test(sat));
assert('station has 热液能 −6.00/秒', /热液能 −6\.00\/秒/.test(station));
assert('no 秒·座 leftover', !/秒·座/.test(sat) && !/秒·座/.test(station));
assert('has tooltip (fdraw title)', /class="fdraw" title=/.test(sat));
assert('idle shows IDLE note not number', /停产时为 0/.test(idle));
console.log('OK all');

/* ── 2026-10-28 追加：缺料状态角标（runStatus 接入） ────────────────────────
 * 【这条测什么】drawTag 除了写「额定消耗」之外，缺料时必须把**结论**贴在数字左侧
 *   （「缺暖石 · 停产」/「缺热液能 · 开工 50%」），正常时一个字都不许加。
 * 【为什么用桩】真正算比例的是 economy.runStatus（那边有自己的探针/回归口径），
 *   这里只验**渲染接线**：给什么就画什么、null 就什么都不画。
 * ⚠️ 三种返回都要测：停产（ratio=0）/ 降产（0<ratio<1）/ 正常（null）。
 *   漏掉 null 这一支，就会出现「所有建筑永远挂着缺料角标」这种反向 bug。 */
const code2 = fs.readFileSync('src/ui/render-info.js', 'utf8');
let stub = null;                       // 由各用例逐个改写
const sb2 = {
  SB: {
    game: { run: () => ({}) },
    ui: { renderContent: { BUILDING_FLAVOR: {}, TECH_FLAVOR: {}, WONDER_ART: {}, WONDER_FLAVOR: {} } },
    economy: {
      consumeRates: (s, id) => ({ metal: 0.36, warm: 0.36 }),
      runStatus: () => stub,
    },
  },
  console,
};
vm.createContext(sb2);
vm.runInContext(code2, sb2, { filename: 'render-info.js (stub runStatus)' });
const dt2 = sb2.SB.ui.drawTag;
const fake = { lvl: { furnace: 3 }, res: {} };

stub = { ratio: 0, lack: 'warm' };
const stopHtml = dt2(fake, 'furnace');
stub = { ratio: 0.5, lack: 'hydro' };
const shortHtml = dt2(fake, 'furnace');
stub = null;
const okHtml = dt2(fake, 'furnace');

assert('停产态出「缺暖石 · 停产」', /<b class="lack-tag is-stop">缺暖石 · 停产<\/b>/.test(stopHtml));
assert('停产态仍保留额定消耗数字', /金属 −0\.36\/秒/.test(stopHtml) && /暖石 −0\.36\/秒/.test(stopHtml));
assert('降产态出「缺热液能 · 开工 50%」', /is-short">缺热液能 · 开工 50%</.test(shortHtml));
assert('正常态一个角标都不许有', okHtml.indexOf('lack-tag') < 0);
assert('角标在数字左侧（先结论后账）',
  stopHtml.indexOf('lack-tag') < stopHtml.indexOf('金属 −0.36'));
assert('角标与数字之间有分隔（不粘成一个词）', /<\/b> 金属/.test(stopHtml));
console.log('OK lack-tag');

