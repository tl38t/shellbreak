import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, loadNoDom } from './load-sb.mjs';

function runScript(context, file) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
}

function gate() {
  let entered, release;
  const arrived = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  return { arrived, release, wait() { entered(); return blocked; } };
}

async function fixture(runtime = 'xiaohongshu', storageAvailable = true) {
  const local = new Map(), remote = new Map(), operations = [];
  let reloads = 0;
  const control = { before: () => {} };
  const sandbox = {
    console,
    shellbreakPlatform: { runtime },
    localStorage: {
      get length() { return local.size; },
      key: i => [...local.keys()][i] ?? null,
      getItem: key => local.get(key) ?? null,
      setItem: (key, value) => local.set(key, String(value)),
      removeItem: key => local.delete(key)
    },
    location: { reload() { reloads++; } },
    xhs: {
      launchOptions: { miniToolEnv: { buildVersion: storageAvailable ? 9460000 : 9450000 } },
      miniTool: {
        async getStorageInfo() { return { keys: [...remote.keys()] }; },
        async getStorage({ key }) {
          operations.push(['read', key]);
          await control.before('read', key);
          if (!remote.has(key)) throw new Error('key not found');
          return { data: remote.get(key) };
        },
        async setStorage({ key, data }) {
          operations.push(['write', key]);
          if (await control.before('write', key, data) !== false) remote.set(key, data);
          return { errMsg: 'setStorage:ok' };
        },
        async removeStorage({ key }) {
          operations.push(['remove', key]);
          await control.before('remove', key);
          remote.delete(key);
          return { errMsg: 'removeStorage:ok' };
        }
      }
    }
  };
  sandbox.window = sandbox;
  const { ctx, SB } = loadNoDom(sandbox);
  const { SAVE_KEY: meta, RUN_KEY: run, SAVE_BACKUP_KEY: metaBackup, RUN_BACKUP_KEY: runBackup } = SB.CFG;
  const oldMeta = JSON.stringify(SB.state.normalizeMeta({ runs: 2 }));
  const oldRun = JSON.stringify({ ...SB.state.freshRun(false), t: 13 });
  const initialStore = runtime === 'xiaohongshu' ? remote : local;
  const initialValue = runtime === 'xiaohongshu' ? JSON.stringify : x => x;
  initialStore.set(meta, initialValue(oldMeta));
  initialStore.set(run, initialValue(oldRun));
  runScript(ctx, 'platform/xiaohongshu/storage.js');
  if (runtime === 'xiaohongshu') {
    await sandbox.shellbreakXhsStorage.ready;
    assert.equal(sandbox.shellbreakXhsStorage.isAvailable(), storageAvailable);
  }
  runScript(ctx, 'src/game.js');
  operations.length = 0;

  const bundle = { format: 'shellbreak-save', version: 1, save: {
    meta: SB.state.normalizeMeta({ runs: 3 }),
    run: { ...SB.state.freshRun(false), t: 801 }
  } };
  return {
    SB, bundle, control, operations, meta, run, metaBackup, runBackup, oldMeta, oldRun,
    get reloads() { return reloads; },
    saved(key) {
      return runtime === 'xiaohongshu' ? JSON.parse(remote.get(key) ?? 'null') : local.get(key) ?? null;
    }
  };
}

{
  const f = await fixture();
  const backupWrite = gate(), runReadback = gate();
  f.control.before = (op, key) => {
    if (op === 'write' && key === f.runBackup) return backupWrite.wait();
    if (op === 'read' && key === f.run) return runReadback.wait();
  };
  const pending = f.SB.game.installImportedSave(f.bundle);
  await backupWrite.arrived;
  assert.equal(f.reloads, 0);
  assert(!f.operations.some(([op, key]) => op === 'write' && (key === f.meta || key === f.run)));
  backupWrite.release();
  await runReadback.arrived;
  assert.equal(f.reloads, 0);
  assert.equal(f.SB.game.installImportedSave(f.bundle), false);
  assert.equal(f.saved(f.metaBackup), f.oldMeta);
  assert.equal(f.saved(f.runBackup), f.oldRun);
  assert.equal(JSON.parse(f.saved(f.run)).t, 801);
  runReadback.release();
  assert.equal(await pending, true);
  assert.equal(f.reloads, 1);
}

{
  const f = await fixture();
  f.control.before = (op, key) => {
    if (op === 'write' && key === f.runBackup) throw new Error('backup failed');
  };
  await assert.rejects(f.SB.game.installImportedSave(f.bundle), /backup failed/);
  assert.equal(f.reloads, 0);
  assert.equal(f.saved(f.meta), f.oldMeta);
  assert.equal(f.saved(f.run), f.oldRun);
  assert(!f.operations.some(([op, key]) => op === 'write' && (key === f.meta || key === f.run)));
}

{
  const f = await fixture();
  f.control.before = (op, key, data) => {
    if (op === 'write' && key === f.run && JSON.parse(JSON.parse(data)).t === 801) return false;
  };
  await assert.rejects(f.SB.game.installImportedSave(f.bundle), /storage_readback_mismatch/);
  assert.equal(f.reloads, 0);
  assert.equal(f.saved(f.meta), f.oldMeta);
  assert.equal(f.saved(f.run), f.oldRun);
  assert.equal(f.saved(f.metaBackup), f.oldMeta);
  assert.equal(f.saved(f.runBackup), f.oldRun);
  f.control.before = () => {};
  assert.equal(await f.SB.game.installImportedSave(f.bundle), true);
  assert.equal(f.reloads, 1);
}

{
  const f = await fixture();
  const restoreReadback = gate();
  f.control.before = (op, key) => {
    if (op === 'read' && key === f.run) return restoreReadback.wait();
  };
  const pending = f.SB.game.restoreRawSave({ meta: null, run: f.oldRun });
  await restoreReadback.arrived;
  assert.equal(f.reloads, 0);
  assert.equal(f.saved(f.meta), null);
  assert.equal(f.saved(f.metaBackup), f.oldMeta);
  assert.equal(f.saved(f.runBackup), f.oldRun);
  restoreReadback.release();
  assert.equal(await pending, true);
  assert.equal(f.reloads, 1);
}

{
  const f = await fixture('xiaohongshu', false);
  await assert.rejects(f.SB.game.installImportedSave(f.bundle));
  assert.equal(f.reloads, 0);
  assert.equal(f.saved(f.meta), f.oldMeta);
  assert.equal(f.saved(f.run), f.oldRun);
  assert.equal(f.operations.length, 0);
}

for (const runtime of ['web', 'taptap', 'electron']) {
  const f = await fixture(runtime);
  assert.equal(f.SB.game.installImportedSave(f.bundle), true);
  assert.equal(f.reloads, 1);
  assert.equal(JSON.parse(f.saved(f.run)).t, 801);
  assert.equal(f.saved(f.runBackup), f.oldRun);
}

console.log('XHS save transfer: backup ordering, delayed reload, failed writes, recovery and synchronous hosts passed');
