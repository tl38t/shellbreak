import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = new Map(), local = new Map();
let writes = 0;
const manager = {
  writeFile(o) {
    const delay = writes++ === 0 ? 40 : 0;
    setTimeout(() => { files.set(o.filePath, o.data); o.success({}); }, delay);
  },
  readFile(o) {
    if (!files.has(o.filePath)) return o.fail({ errMsg: 'ENOENT' });
    o.success({ data: files.get(o.filePath) });
  },
  writeFileSync(p, data) { files.set(p, data); },
  readFileSync(p) { return files.get(p); },
  unlink(o) { files.delete(o.filePath); o.success({}); }
};
const sandbox = {
  SB: { CFG: { RUN_KEY: 'shellbreak.run.v2', SAVE_KEY: 'shellbreak.meta.v2' } },
  localStorage: {
    getItem(k) { return local.has(k) ? local.get(k) : null; },
    setItem(k, v) { local.set(k, v); },
    removeItem(k) { local.delete(k); }
  },
  tap: {
    env: { USER_DATA_PATH: 'tapfile://usr' },
    getStorage() { /* 故意永不回调：文件读取必须独立完成。 */ },
    getFileSystemManager() { return manager; }
  },
  setTimeout, clearTimeout
};
vm.runInContext(fs.readFileSync(path.join(rootDir, 'src/save-storage.js'), 'utf8'),
  vm.createContext(sandbox), { filename: 'save-storage.js' });
const store = sandbox.SB.store;
const meta = JSON.stringify({ cycle: 3 });
const run = n => JSON.stringify({ res: {}, lvl: {}, jobs: {}, shell: 1, t: n, _ts: Date.now() + n });

const first = store.writeNativeSave(meta, run(10));
const second = store.writeNativeSave(meta, run(20));
assert.equal(await first, true);
assert.equal(await second, true);
const slots = ['a', 'b'].map(s => JSON.parse(files.get('tapfile://usr/shellbreak-save-' + s + '.json')));
assert.equal(slots.length, 2);
assert.equal(slots.some(s => JSON.parse(s.run).t === 10), true);
assert.equal(slots.some(s => JSON.parse(s.run).t === 20), true);

const start = Date.now();
const scan = await store.scanSaveCandidates(sandbox.SB.CFG.RUN_KEY, sandbox.SB.CFG.SAVE_KEY);
assert.equal(scan.status, 'found');
assert.equal(JSON.parse(scan.best.runRaw).t, 20);
assert.equal(Date.now() - start < 3500, true, 'tap.getStorage 挂起不得拖住原生文件');

/* 原生 API 长时间挂起时，带序号的浏览器快照仍可作为较新的候选。 */
const topSeq = Math.max(...slots.map(s => s.seq));
local.set(sandbox.SB.CFG.SAVE_KEY, meta);
local.set(sandbox.SB.CFG.RUN_KEY, JSON.stringify({
  res: {}, lvl: {}, jobs: {}, shell: 1, t: 25, _ts: Date.now() + 25, _saveSeq: topSeq + 1
}));
const newerLocal = await store.scanSaveCandidates(sandbox.SB.CFG.RUN_KEY, sandbox.SB.CFG.SAVE_KEY);
assert.equal(JSON.parse(newerLocal.best.runRaw).t, 25);
local.clear();

const newestSlot = slots[0].seq > slots[1].seq ? 'a' : 'b';
files.set('tapfile://usr/shellbreak-save-' + newestSlot + '.json', '{broken');
const fallback = await store.scanSaveCandidates(sandbox.SB.CFG.RUN_KEY, sandbox.SB.CFG.SAVE_KEY);
assert.equal(JSON.parse(fallback.best.runRaw).t, 10);

const third = store.writeNativeSave(meta, run(30));
assert.equal(store.flushNativeSync(), true);
assert.equal(JSON.parse(JSON.parse(files.get('tapfile://usr/shellbreak-save-hide.json')).run).t, 30);
assert.equal(await third, true);

/* 版本升级前的分键文件仍可迁移为候选。 */
files.clear();
files.set('tapfile://usr/shellbreak-run_v2.json', run(77));
files.set('tapfile://usr/shellbreak-meta_v2.json', meta);
const legacy = await store.scanSaveCandidates(sandbox.SB.CFG.RUN_KEY, sandbox.SB.CFG.SAVE_KEY);
assert.equal(JSON.parse(legacy.best.runRaw).t, 77);
console.log('TapTap 原生队列、双版本、挂起隔离、后台快照、旧版迁移：ALL PASS');
