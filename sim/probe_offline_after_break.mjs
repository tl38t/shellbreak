/* 探针：破壳之后，离线补算还在「算破壳」吗？（2026-10-22 · 用户「破壳之后离线结算怎么还在算破壳」）
 *
 * 复现口径：全部走生产代码（SB.state.freshRun + SB.economy.tick + SB.shell.tickShell），
 * 不重写任何一份公式。造态分两种「破壳之后」：
 *   A. 已破壳 + 玩家点了「探索壳外的星空」(stay)：shell=0 / shellOpened=true / broken=false / breakSettled=false
 *   B. 已破壳 + 玩家还没处理（直接关页面）：shell=0 / shellOpened=true / broken=true / breakSettled=false
 *
 * 断言分两类：
 *   [现状] ok() —— 记录当前真实行为（绿=符合预期，红=确认是 bug）
 *   [信息] info() —— 只打数字，不下结论
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  [' + extra + ']' : '')); }
}
function info(name, val) { console.log('  · ' + name + ' = ' + val); }

/* 造一个「有热液供给、钻机开着、钻头管够」的破壳后存档 */
function makePostBreak(opts) {
  opts = opts || {};
  const s = SB.state.freshRun(false);
  s.res.warmstone = 1e9; s.res.kelp = 1e9; s.pop = 400;
  s.lvl = s.lvl || {}; s.lvl.hydroturbine = 50; s.lvl.hydroshop = 5;
  s.jobs = s.jobs || {}; s.jobs.gather = 50; s.jobs.miner = 50;
  // 破壳态
  s.shell = 0;
  s.shellOpened = true;
  s.breakSettled = false;
  s.broken = !!opts.stillBroken;          // B 场景：还没处理破壳
  // 天穹钻机（破壳时是开着的，破壳后玩家不会想到要去关它）
  s.wonders = s.wonders || {};
  s.wonders.wonder_skydrill = true;
  s.skydrillOn = opts.drillOn !== false;
  s.res.resonantDrill = 1e9;
  return s;
}

function runTicks(s, secs) {
  for (let i = 0; i < secs; i++) SB.economy.tick(s, 1, null, { skipFoodPop: true, skipHappy: true, deferBreakUI: true });
}

console.log('=== 常量 ===');
info('SKYDRILL_RATE(削壳点/秒)', SB.CFG.SKYDRILL_RATE);
info('SKYDRILL_DRILL(共振钻头/秒)', SB.CFG.SKYDRILL_DRILL);
info('SKYDRILL_HYDRO(热液能/秒)', SB.CFG.SKYDRILL_HYDRO);
info('FLOOR_AT(自动削壳停手线)', SB.CFG.FLOOR_AT);

/* ────────────────────────────────────────────────────────────
 * 场景 A：破壳后留在本局（broken=false），跑离线补算同款 tick
 * ──────────────────────────────────────────────────────────── */
console.log('\n=== 场景 A：破壳 + 留在本局（broken=false），钻机仍开着 ===');
{
  const s = makePostBreak({ stillBroken: false });
  const bShell = s.shell, bDrill = s.res.resonantDrill;
  runTicks(s, 300);
  info('300s 后 shell', s.shell.toFixed(2) + '（离线前 ' + bShell + '）');
  info('300s 后 共振钻头', (bDrill - s.res.resonantDrill).toFixed(3) + ' 被消耗');
  info('_cutSky（钻机累计削壳）', (s._cutSky || 0).toFixed(2));
  info('skydrillRun', (s.skydrillRun || 0).toFixed(2));

  ok('A1 破壳后 shell 不应被继续削成负数', s.shell >= 0, 'shell=' + s.shell.toFixed(2));
  ok('A2 破壳后钻机不应继续烧共振钻头', Math.abs(bDrill - s.res.resonantDrill) < 1e-6,
    '烧掉 ' + (bDrill - s.res.resonantDrill).toFixed(3));
  ok('A3 破壳后不应再触发 onShellZero（broken 保持 false / shellOpened 保持 true）',
    s.broken === false && s.shellOpened === true, 'broken=' + s.broken);

  /* 离线结算面板那一行的算法（game.js showOfflineSettlement 1004-1006 的原式） */
  const shellDelta = Math.round(s.shell) - Math.round(bShell);
  info('结算面板「壳厚」行 delta', shellDelta + '（≤0 时上 .is-positive 绿色样式）');
  ok('A4 结算面板不应出现「壳厚」行（破壳后壳已不存在）', shellDelta === 0, 'delta=' + shellDelta);
}

/* ────────────────────────────────────────────────────────────
 * 场景 B：破壳还没处理（broken=true）—— 离线补算会不会被立刻掐断
 * ──────────────────────────────────────────────────────────── */
console.log('\n=== 场景 B：破壳未处理（broken=true）===');
{
  const s = makePostBreak({ stillBroken: true });
  const bShell = s.shell;
  runTicks(s, 60);
  info('60s 后 shell', s.shell.toFixed(2) + '（离线前 ' + bShell + '）');
  ok('B1 未结算破壳态 tickShell 应整个 return（shell 不动）', s.shell === bShell, 'shell=' + s.shell);
  /* game.js drainCatchUp 的掐断判据（逐字复刻，改了源码这里会红） */
  info('drainCatchUp 掐断判据', 'broken && shellOpened && !breakSettled');
  const wouldBreak = !!(s.broken && s.shellOpened && !s.breakSettled);
  info('该判据当前取值', wouldBreak);
  ok('B2 未结算破壳态 ⇒ 离线补算在第一个 chunk 就被 breakReached 掐断', wouldBreak === true);
  info('后果', 'j.left 全部剩余时长不计 → 结算面板出现「破壳后剩余 … 未继续补算」');
}

/* ────────────────────────────────────────────────────────────
 * 场景 C：对照组 —— 破壳前（shell>0）钻机削壳应当正常
 * ──────────────────────────────────────────────────────────── */
console.log('\n=== 场景 C：对照 —— 破壳前钻机削壳应正常 ===');
{
  const s = makePostBreak({ stillBroken: false });
  s.shell = 100000; s.shellOpened = false; s.broken = false;
  const b = s.shell;
  runTicks(s, 60);
  info('60s 后 shell', s.shell.toFixed(2) + '（离线前 ' + b + '）');
  ok('C1 破壳前钻机确实在削壳（对照组，证明 A 不是「钻机根本没跑」）', s.shell < b, 'Δ=' + (s.shell - b).toFixed(2));
}

console.log('\n─── 结果：' + pass + ' PASS / ' + fail + ' FAIL ───');
process.exit(fail ? 1 : 0);
