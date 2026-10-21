// 验证：机器人充能站 robotbay 分区已改为 core（礁栖核心），且会进入核心信仰乘区。
import { readFileSync } from 'fs';
const code = readFileSync('src/config-buildings.js', 'utf8');
const sandbox = {};
const fn = new Function('window', code);
fn(sandbox);
const SB = sandbox.SB || globalThis.SB;
let fail = 0;
function chk(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : ''));
  if (!ok) fail++;
}
const b = SB.BUILDINGS.find(x => x.id === 'robotbay');
chk('robotbay 存在于 BUILDINGS', !!b);
chk('robotbay.zone === "core"', b && b.zone === 'core', 'zone=' + (b && b.zone));
// coreFaithMul 遍历 zone==='core' 的建筑求和（civics.js:176），robotbay 现在应被计入
const coreIds = SB.BUILDINGS.filter(x => x.zone === 'core').map(x => x.id);
chk('robotbay 在 core 建筑清单内', coreIds.indexOf('robotbay') >= 0, 'coreIds=' + coreIds.join(','));
// 确认不再出现在 workshop 区
const wsIds = SB.BUILDINGS.filter(x => x.zone === 'workshop').map(x => x.id);
chk('robotbay 已不在 workshop 区', wsIds.indexOf('robotbay') < 0);
console.log('core 区建筑数=' + coreIds.length + '，workshop 区建筑数=' + wsIds.length);
console.log(fail === 0 ? 'ALL_PASS' : ('FAIL_COUNT=' + fail));
process.exit(fail === 0 ? 0 : 1);
