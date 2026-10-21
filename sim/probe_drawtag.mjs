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
