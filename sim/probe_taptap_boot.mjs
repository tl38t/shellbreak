import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'src/game.js'), 'utf8');

async function check(scanStatus, cloudStatus) {
  let message = '';
  const sandbox = {
    SB: {
      CFG: { RUN_KEY: 'run', SAVE_KEY: 'meta' },
      state: { loadMeta: () => ({ cycle: 1 }), emptyMeta: () => ({ cycle: 1 }) },
      store: {
        fsAvailable: () => true, envAvailable: () => true,
        scanSaveCandidates: () => Promise.resolve({ status: scanStatus, best: null })
      },
      saveTransfer: {
        cloudAvailable: () => true,
        restoreFromCloudIfAny: cb => cb({ status: cloudStatus, error: '查询超时' }),
        showRecoveryPending: text => { message = text; }
      }
    },
    setTimeout, clearTimeout,
    document: {}
  };
  vm.runInContext(source, vm.createContext(sandbox), { filename: 'game.js' });
  sandbox.SB.game.boot();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(sandbox.SB.game.run(), null, '不确定结果不能创建新局');
  assert.ok(message, '应展示恢复提示');
}

await check('uncertain', 'absent');
await check('absent', 'timeout');
/* ③④ 静态钉住「明确没有 ⇒ 必须能开新局」这一半（2026-10-29 补）。
 * 【为什么只能用静态断言】要行为化就得让 sandbox 里的 startRun 真正跑起来，而它会
 *   连锁调用 renderAll / saveRun / unlockStardustShop 一整套 UI 与存档栈 —— 那个桩
 *   本身就是第二个实现，测它等于测桩。这里退一步只钉源码结构，和 probe_diag 的
 *   gateCheck 同一手法。
 * 【它防的退化】把「云端能力不存在」也当成「未知」⇒ 纯文件版容器里的真新玩家
 *   永远停在恢复界面（没有任何一条出口），把保护做成了死锁。 */
const src = fs.readFileSync(path.join(rootDir, 'src/game.js'), 'utf8');
assert.match(src, /cloud\.status === 'absent' \|\| cloud\.status === 'unavailable'/,
  '云端明确没有存档（absent/unavailable）时必须判为可开新局');
assert.match(src, /cloudAvailable && SB\.saveTransfer\.cloudAvailable\(\)/,
  '云能力不存在要单独分支，不能一律暂停');
assert.match(src, /forceFreshBoot/,
  '恢复暂停界面必须留一个显式出口（否则云接口长期异常时玩家无处可去）');
console.log('TapTap 启动不确定结果禁止新局覆盖：ALL PASS');
