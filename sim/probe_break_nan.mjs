/* 破壳后「任何进度都不进行 + 存档数值异常」的实证探针（2026-11-04）。
 *
 * 玩家报（线上 Ver1.0.15）：破壳后卡死、任何进度都不进行，存档显示错误/进入保护状态，
 *   重启后正常并弹出星图页，另有一次进度回退。
 *
 * 这条链在代码里对应三处：
 *   ① state.saveRun 的坏值判定 —— res 里出现非有限数 ⇒ patchBadRes/整份拒写；
 *   ② save-transfer.saveHealthText —— 拒写/补位时面板上会出现「数值异常」那一行；
 *   ③ 资源被写成 NaN ⇒ JSON.stringify 变 null ⇒ 下次读档迁移层只能回落 0（= 进度回退）。
 * 所以本探针的目标只有一个：**满配 ERA10 破壳局长跑，找出第一个变坏的数值。**
 *
 * ⚠️ 夹具刻意「全学全满」：玩家报的是晚期局，而既有 break-continue 的长跑断言用的是
 *   freshRun 空局（没科技没建筑），跑的根本不是同一条分支。
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

/* 造一个「晚期满配」局：全科技、全市政、全建筑 10 级、资源充裕、已破壳、流浪泰拉挑战中。 */
function makeLateRun(opts) {
  opts = opts || {};
  const s = SB.state.freshRun(false);
  SB.TECHS.forEach(t => { s.techs[t.id] = true; });
  SB.CIVICS.forEach(c => { s.civics[c.id] = true; });
  SB.BUILDINGS.forEach(b => { s.lvl[b.id] = 10; });
  Object.keys(SB.RESS).forEach(k => { s.res[k] = 1e6; });
  s.pop = 100;
  s.peak = 120;
  s.jobs = s.jobs || {};
  s.jobs.kelp = 20; s.jobs.coral = 10; s.jobs.siltpit = 10;
  s.jobs.scholar = 12; s.jobs.scribe = 8; s.jobs.builder = 10;
  s.era = 10;
  s.gov = opts.gov || 'republic';
  s.challenge = { id: opts.challenge || 'drift_terra', tier: 0, replay: false, startedAt: Date.now() - 3600e3 };
  s.challengeDone = false;
  s.shell = opts.broken === false ? 200000 : 0;
  s.iceShell = s.iceShell || 500000;
  s.broken = opts.broken !== false;
  s.shellOpened = opts.broken !== false;
  s.breakSettled = false;
  s.sunSails = 500;
  s.dysonNodes = 100;
  s.wallT = 3600;
  s.geek = { geekOn: true, enceladusRun: 0, enceladusDone: true, terraRun: 0, terraDone: false };
  return s;
}

/* 递归找第一个「数字但非有限」的字段，返回 "路径=值"。 */
function findBad(o, base, depth) {
  if (o === null || o === undefined) return null;
  if (depth > 4) return null;
  if (typeof o === 'number') return isFinite(o) ? null : (base + '=' + o);
  if (typeof o !== 'object') return null;
  if (Array.isArray(o)) {
    for (let i = 0; i < o.length; i++) {
      const r = findBad(o[i], base + '[' + i + ']', depth + 1);
      if (r) return r;
    }
    return null;
  }
  for (const k in o) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
    if (k.charAt(0) === '_') continue;          // 内部瞬态（_shellSnap / _hydroFlow）不算存档字段
    const r = findBad(o[k], base ? base + '.' + k : k, depth + 1);
    if (r) return r;
  }
  return null;
}

/* ── ① 破壳后满配长跑：找第一个变坏的数值 ─────────────────── */
{
  const s = makeLateRun();
  let bad = '', threw = null, steps = 0;
  const t0 = s.t;
  try {
    for (let i = 0; i < 6000; i++) {
      SB.economy.tick(s, 0.1, null);
      if (SB.shell && SB.shell.tickShell) SB.shell.tickShell(s, 0.1, null);
      if (SB.shell && SB.shell.tickStar) SB.shell.tickStar(s, 0.1, null);
      steps = i;
      if (i % 50 === 0) {
        for (const k in SB.RESS) {
          const v = s.res[k];
          if (!(typeof v === 'number' && isFinite(v))) { bad = 'res.' + k + '=' + v + ' @step' + i; break; }
        }
        if (!bad) bad = findBad(s, '', 0) || '';
        if (bad) break;
      }
    }
  } catch (e) {
    threw = e;
  }
  ok('满配破壳局 600 秒 tick 不抛异常',
    !threw, threw ? String(threw && threw.message) : 'ok');
  ok('满配破壳局 600 秒无 NaN/Infinity 字段',
    !bad, bad || ('t ' + t0.toFixed(1) + '→' + s.t.toFixed(1)));
  ok('破壳局游戏时钟持续推进',
    s.t > t0 + 1, 't ' + t0 + '→' + s.t.toFixed(1) + ' (steps=' + steps + ')');
}

/* ── ② 同样长跑，但破壳前（对照组）：证明上面那条不是夹具自带的噪声 ── */
{
  const s = makeLateRun({ broken: false });
  let bad = '';
  for (let i = 0; i < 2000; i++) {
    SB.economy.tick(s, 0.1, null);
    if (SB.shell && SB.shell.tickShell) SB.shell.tickShell(s, 0.1, null);
    if (i % 50 === 0) { bad = findBad(s, '', 0) || ''; if (bad) break; }
  }
  ok('破壳前（对照组）200 秒同样无坏值', !bad, bad || 'ok');
}

/* ── ③ 存档序列化：snapshot 后逐 res 键检查能不能安全落盘 ──── */
{
  const s = makeLateRun();
  for (let i = 0; i < 300; i++) SB.economy.tick(s, 0.1, null);
  let snap = null, err = null;
  try { snap = SB.game && SB.game.snapshot ? SB.game.snapshot(s) : s; } catch (e) { err = e; }
  const payload = snap || s;
  let bad = '';
  for (const k in SB.RESS) {
    const v = payload.res && payload.res[k];
    if (!(typeof v === 'number' && isFinite(v))) { bad = k + '=' + v; break; }
  }
  ok('快照里每个 RESS 键都是有限数（否则 saveRun 会拒写整份）',
    !err && !bad, err ? String(err.message) : (bad || 'ok'));

  /* 再走一次真实 JSON：Infinity/NaN 会静默变 null，这正是「读档回落 0」的入口。 */
  let json = null, roundtripBad = '';
  try { json = JSON.stringify(payload); } catch (e) { roundtripBad = 'stringify: ' + e.message; }
  if (json) {
    const back = JSON.parse(json);
    for (const k in SB.RESS) {
      const v = back.res && back.res[k];
      if (v === null || typeof v !== 'number') { roundtripBad = 'res.' + k + ' 落盘后是 ' + v; break; }
    }
  }
  ok('快照 JSON 往返后资源仍为数字（null = 一次进度回退）',
    !roundtripBad, roundtripBad || 'ok');
}

/* ── ④ 破壳瞬间链路：onShellZero 前后状态是否自洽 ──────────── */
{
  const s = makeLateRun({ broken: false });
  s.shell = 50;                 // 只差最后一点壳
  s.challenge = { id: 'drift_terra', tier: 0, replay: false, startedAt: Date.now() - 60e3 };
  let threw = null;
  /* 直接调壳归零事件，而不是靠 tickShell 削 —— 末段削壳只能靠天穹钻机，
   * 夹具里没有钻机时 tickShell 会老老实实一直不破（那是设计，不是 bug）。 */
  try { SB.shell.onShellZero(s, null); } catch (e) { threw = e; }
  ok('壳归零过程不抛异常', !threw, threw ? String(threw.message) : 'shell=' + s.shell);
  ok('破壳后 broken / shellOpened 同时置位',
    s.shell <= 0 && s.broken === true && s.shellOpened === true,
    'shell=' + s.shell + ' broken=' + s.broken + ' opened=' + s.shellOpened);
  const bad = findBad(s, '', 0);
  ok('破壳瞬间状态无 NaN/Infinity', !bad, bad || 'ok');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
