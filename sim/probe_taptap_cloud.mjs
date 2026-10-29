import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let clock = 1_000_000_000, serial = 0;
const files = new Map(), archives = [];
const run = { res: {}, lvl: {}, jobs: {}, shell: 1, t: 3600 };
const meta = { cycle: 1 };
const fsManager = {
  writeFile(o) { files.set(o.filePath, o.data); o.success({}); },
  readFile(o) { o.success({ data: files.get(o.filePath) }); }
};
const cloud = {
  getArchiveList(o) { o.success({ saves: archives.map(a => ({
    name: a.name, uuid: a.uuid, fileId: a.fileId, extra: a.extra,
    playtime: a.playtime, modifiedTime: a.modifiedTime
  })) }); },
  createArchive(o) {
    archives.push({ name: o.archiveMetaData.name, uuid: 'u' + (++serial), fileId: 'f' + serial,
      extra: o.archiveMetaData.extra, playtime: o.archiveMetaData.playtime,
      modifiedTime: Math.floor(clock / 1000), data: files.get(o.archiveFilePath) });
    o.success({});
  },
  updateArchive(o) {
    const a = archives.find(x => x.uuid === o.archiveUUID);
    Object.assign(a, { extra: o.archiveMetaData.extra, playtime: o.archiveMetaData.playtime,
      modifiedTime: Math.floor(clock / 1000), data: files.get(o.archiveFilePath) });
    o.success({});
  },
  getArchiveData(o) {
    files.set(o.targetFilePath, archives.find(a => a.uuid === o.archiveUUID).data);
    o.success({ filePath: o.targetFilePath });
  }
};
const sandbox = {
  SB: {
    CFG: { RUN_KEY: 'run', SAVE_KEY: 'meta' },
    game: { run: () => run, meta: () => meta, snapshot: s => ({ ...s, _ts: clock }) },
    store: { nativeRevision: () => clock * 1000, diagBrief: () => '' }
  },
  tap: { env: { USER_DATA_PATH: 'tapfile://usr' },
    getCloudSaveManager: () => cloud, getFileSystemManager: () => fsManager },
  localStorage: { getItem: () => null, setItem: () => {} },
  Date: class extends Date { static now() { return clock; } },
  setTimeout, clearTimeout,
  document: { getElementById: () => null }
};
vm.runInContext(fs.readFileSync(path.join(rootDir, 'src/save-transfer.js'), 'utf8'),
  vm.createContext(sandbox), { filename: 'save-transfer.js' });
const transfer = sandbox.SB.saveTransfer;

await transfer.pushCloud(true);
assert.equal(archives.length, 1);
assert.equal(archives[0].name, 'shellbreak_main');
clock += 80_000; meta.cycle = 2; run.t = 10;
await transfer.pushCloud(true);
assert.equal(archives.length, 2);
assert.deepEqual(archives.map(a => a.name).sort(), ['shellbreak_main', 'shellbreak_previous']);
assert.equal(JSON.parse(archives.find(a => a.name === 'shellbreak_main').data).save.meta.cycle, 1);

clock += 80_000; meta.cycle = 1; run.t = 5000;
await assert.rejects(transfer.pushCloud(true), /云端存档较新/);
assert.equal(archives.length, 2);

/* 最新档损坏时，启动救援仍能使用上一版。 */
archives.find(a => a.name === 'shellbreak_previous').data = '{broken';
const recovered = await new Promise(resolve => transfer.restoreFromCloudIfAny(resolve));
assert.equal(recovered.status, 'found');
assert.equal(recovered.bundle.save.meta.cycle, 1);
console.log('TapTap 云端双版本、轮回防倒退、旧版恢复：ALL PASS');
