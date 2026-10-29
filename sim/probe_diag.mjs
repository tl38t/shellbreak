/* 定向验证「存档诊断层 + 三个 P0 修复」（2026-10-29）
 * 非标定、不扫参数：只验判据本身。
 *   ① diag 独立 key 三写（localStorage / tap.setStorage / tapfile），且**不受** 33 键校验牵连
 *   ② 尸检副本：① 空而 ②③ 有档时能留一份，且**不覆盖**主档
 *   ③ P0-3 条件补位：有已知好值 ⇒ 补位写入；无已知好值 + 有旧档 ⇒ 照旧拒写
 *   ④ P0-2：主通道写失败时镜像仍然写
 *   ⑤ 读回校验：容器「假成功」（setItem 不报错但写不进去）能被 rbMismatch 抓到
 *   ⑥ P0-1：boot 的救援门锁不再只看 tap.getStorage（静态断言，剥注释后比对）
 * 【为什么必须单独一条】这五条一旦错，玩家端表现全都是「存档没了」，而我们在本地
 *   怎么点都复现不出来 —— 只有把它们钉成探针，才可能在下一次改动静默回归时立刻发现。
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadNoDom, ROOT } from './load-sb.mjs';

/* ── 假环境：localStorage + tap（setStorage / 文件系统）──────────────── */
function makeLS() {
  const map = new Map();
  const ls = {
    map, broken: false, throwOnSet: false, setCalls: 0,
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      ls.setCalls++;
      if (ls.throwOnSet) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      if (ls.broken) return;              /* 假成功：不抛错，但什么都没写进去 */
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); }
  };
  return ls;
}
function makeTap() {
  const store = new Map(), files = new Map();
  const calls = { setStorage: 0, writeFile: 0, getStorage: 0 };
  const fsMgr = {
    writeFile(o) { calls.writeFile++; files.set(o.filePath, o.data); o.success && o.success({}); },
    readFile(o) {
      if (files.has(o.filePath)) o.success && o.success({ data: files.get(o.filePath) });
      else o.fail && o.fail({ errMsg: 'readFile:no such file' });
    },
    unlink(o) { files.delete(o.filePath); o.success && o.success({}); }
  };
  const tap = {
    env: { USER_DATA_PATH: 'tapfile://usr' }, store, files, calls,
    getStorage(o) {
      calls.getStorage++;
      if (store.has(o.key)) o.success && o.success({ data: store.get(o.key) });
      else o.fail && o.fail({ errMsg: 'getStorage:not found' });
    },
    setStorage(o) { calls.setStorage++; store.set(o.key, o.data); o.success && o.success({}); },
    removeStorage(o) { store.delete(o.key); o.success && o.success({}); },
    getFileSystemManager() { return fsMgr; }
  };
  return tap;
}

const ls = makeLS();
const tap = makeTap();
const sandbox = { localStorage: ls, tap, setTimeout, clearTimeout, console };
const { SB } = loadNoDom(sandbox);
const CFG = SB.CFG, ST = SB.store;

let fail = 0;
function chk(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fail++;
}
/* 与 save-storage.js 的 fileNameFor + filePathFor **逐字一致**（2026-10-29 踩过：
 * 少了 `shellbreak-` 前缀，断言在明明写成功的情况下判红 —— 夹具口径错就是假红）。 */
function fileFor(key) {
  return 'tapfile://usr/shellbreak-' +
    String(key).replace(/^shellbreak[._-]/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') + '.json';
}
function run(over) {
  const r = SB.state.freshRun(false);
  r.t = 100;
  if (over) Object.assign(r, over);
  return r;
}

console.log('── ① 拒写分支：有旧档、无已知好值 ⇒ 保持原样 ──');
const oldTxt = JSON.stringify({ t: 5, res: {}, lvl: {}, jobs: {}, shell: 0 });
ls.setItem(CFG.RUN_KEY, oldTxt);
const rNoKey = run();
delete rNoKey.res[Object.keys(SB.RESS)[0]];      /* SB.RESS 里有、res 里没有 ⇒ undefined */
const refused = SB.state.saveRun(rNoKey);
chk('坏键无已知好值 + 有旧档 ⇒ saveRun 返回 false', refused === false);
chk('拒写时旧档一字未动', ls.getItem(CFG.RUN_KEY) === oldTxt);
chk('拒写被记进健康度', SB.state.saveStatus().skipCount >= 1,
  'skipCount=' + SB.state.saveStatus().skipCount);

console.log('── ② 无旧档 + 坏值 ⇒ 补 0 写入（无处可毁）──');
ls.removeItem(CFG.RUN_KEY);
const rZero = run(); rZero.res.coral = NaN;
const wroteZero = SB.state.saveRun(rZero);
const savedZero = JSON.parse(ls.getItem(CFG.RUN_KEY) || '{}');
chk('无旧档时坏值补 0 后仍然落盘', wroteZero === true);
chk('落盘内容里坏键是有限数（不是 null）',
  typeof savedZero.res.coral === 'number' && isFinite(savedZero.res.coral),
  'coral=' + savedZero.res.coral);

console.log('── ③ 有已知好值 ⇒ 补位写入（值 = 上一次成功值，不是 0）──');
const good = run(); good.res.coral = 4321; good.res.stone = 99;
SB.state.saveRun(good);
const rPatch = run(); rPatch.res.coral = NaN; rPatch.t = 200;
const wrotePatch = SB.state.saveRun(rPatch);
const savedPatch = JSON.parse(ls.getItem(CFG.RUN_KEY) || '{}');
chk('有已知好值时坏值被补位、存档继续写', wrotePatch === true);
chk('补进去的是上一次成功值 4321（不是 0）', savedPatch.res.coral === 4321,
  'coral=' + savedPatch.res.coral);
chk('其余字段写的是**最新**值（t=200）', savedPatch.t === 200, 't=' + savedPatch.t);
chk('补位单独计数，不与拒写混算', SB.state.saveStatus().patchCount >= 1,
  'patchCount=' + SB.state.saveStatus().patchCount);

console.log('── ④ diag 独立 key 三写 ──');
ST.diagLoad();
ST.diagSet({ boot: 'probe' }, true);
const diagKey = ST.DIAG_KEY;
const diagTextLS = ls.getItem(diagKey);
chk('diag 写进 ① localStorage', !!diagTextLS && diagTextLS.indexOf('"boot":"probe"') !== -1);
chk('diag 写进 ② tap.setStorage', tap.store.has(diagKey));
chk('diag 写进 ③ tapfile', tap.files.has(fileFor(diagKey)));
const capStr = ST.capText();
chk('能力探针含四项', /^ls[01]ts[01]fs[01]cl[01]$/.test(capStr), capStr);
chk('有 tap 时 ts=1', capStr.indexOf('ts1') !== -1);
chk('diag 记下了拒写次数（说明坏值也能写诊断）',
  (ST.diagGet().skip || 0) >= 1, 'skip=' + ST.diagGet().skip);
chk('diagText 含「启动 / 写盘 / 读回」三段',
  ST.diagText().indexOf('启动') !== -1 && ST.diagText().indexOf('写盘') !== -1
  && ST.diagText().indexOf('读回') !== -1);

console.log('── ⑤ 尸检副本：① 空而 ②③ 有档时留一份，且不覆盖主档 ──');
ls.removeItem(CFG.RUN_KEY);                       /* 模拟容器把 localStorage 清掉 */
tap.store.set(CFG.RUN_KEY, JSON.stringify({ t: 7777, res: { coral: 5 }, lvl: {}, jobs: {}, shell: 1 }));
ST.preserveEmergency(CFG.RUN_KEY, CFG.SAVE_KEY, function (hit) {
  chk('尸检副本生成（来源 tapStorage）', !!hit && String(hit.source).indexOf('tapStorage') !== -1,
    hit ? hit.source : 'null');
  const rec = ST.emergencyLoad();
  chk('副本内容就是那份旧档原文',
    !!rec && rec.run === JSON.stringify({ t: 7777, res: { coral: 5 }, lvl: {}, jobs: {}, shell: 1 }));
  chk('副本没有把主档写回去（① 仍为空）', ls.getItem(CFG.RUN_KEY) === null);
  chk('丢失次数 +1', (ST.diagGet().lost || 0) >= 1, 'lost=' + ST.diagGet().lost);
  ST.emergencyClear();
  chk('清档会一并清掉副本', ST.emergencyLoad() === null);
  finish();
});

/* ⑥⑦⑧ 三组必须在 ⑤ 的异步回调落定之后再跑（⑤ 会清掉副本、改 diag 计数）。
 * 所以它们的标题与调用全部收进 finish()，顶层只声明函数。 */
async function mirrorOnFail() {
  console.log('── ⑥ P0-2：主通道写失败时镜像仍然写 ──');
  const ls2 = makeLS();
  ls2.throwOnSet = true;
  sandbox.localStorage = ls2;
  const before = tap.calls.setStorage;
  const ok = SB.state.saveRun(run({ t: 300 }));
  chk('主通道失败时 saveRun 仍返回 false', ok === false);
  /* 镜像现在按 key 排队，等此前的写入完成，再断言失败分支的新快照也送达。 */
  await new Promise(resolve => setTimeout(resolve, 0));
  chk('但镜像写确实发生了', tap.calls.setStorage > before,
    'setStorage ' + before + ' → ' + tap.calls.setStorage);
}

function falseSuccess() {
  console.log('── ⑦ 读回校验：容器「假成功」能被抓到 ──');
  const ls3 = makeLS();
  sandbox.localStorage = ls3;
  /* 先放一份"旧"档在盘上，之后每次 setItem 都不生效 ⇒ 写成功但磁盘不变 */
  ls3.map.set(CFG.RUN_KEY, JSON.stringify({ t: 1, res: { coral: 1 }, lvl: {}, jobs: {}, shell: 0 }));
  ls3.broken = true;
  const before = ST.diagGet().rbMismatch || 0;
  for (let i = 0; i < 30 && (ST.diagGet().rbMismatch || 0) === before; i++) {
    SB.state.saveRun(run({ t: 500 + i }));
  }
  chk('写成功但读回是旧档 ⇒ rbMismatch 增加',
    (ST.diagGet().rbMismatch || 0) > before,
    'rbMismatch ' + before + ' → ' + (ST.diagGet().rbMismatch || 0));
}

function gateSource() {
  const src = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  /* ⚠️ 必须先剥注释 —— 注释里写着旧写法，裸 grep 会误判成"还在用旧判据"。 */
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function gateCheck() {
  console.log('── ⑧ P0-1：boot 救援门锁不再只看 tap.getStorage（静态）──');
  const code = gateSource();
  const at = code.indexOf('var rescueGate');
  const seg = at === -1 ? '' : code.slice(at, at + 700);
  chk('救援门锁存在', at !== -1);
  chk('门锁包含 fsAvailable（③ 用户目录文件）', seg.indexOf('fsAvailable') !== -1);
  chk('门锁包含 cloudAvailable（④ 云存档）', seg.indexOf('cloudAvailable') !== -1);
  chk('门锁不再单独依赖 envAvailable',
    /envAvailable\(\)\s*&&\s*SB\.state\.recoverAsync/.test(seg) === false);
}

async function finish() {
  await mirrorOnFail();
  falseSuccess();
  gateCheck();
  console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAILED');
  process.exit(fail === 0 ? 0 : 1);
}
