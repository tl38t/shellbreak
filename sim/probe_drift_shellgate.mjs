/* 破壳不再清挑战 —— goal 型挑战的破壳门禁回归锁（2026-11-04）。
 *
 * 背景：用户报「存档停在破壳前、挑战还在；一破壳挑战就被清除，然后正常运行」。
 *   根因 = challenges.active() 的旧判据 `s.broken && !d.persistAfterShell ? null : a`：
 *   没有 persistAfterShell 的 goal 型（drift_terra / waterpollution）破壳即返回 null
 *   ⇒ 挑战页整排退回「尚未完成」、canStart 变 true、卡片给出「结算并挑战」。
 *   真源从没丢（s.challenge / evaluate / 寒流必冰封都不看 active），坏的是状态与入口。
 *
 * 修法（2026-11-04 用户拍板方案 A）：goal 型只要没 challengeDone 就返回 a，
 *   破壳不是终点；同时删掉 4 处已冗余的 persistAfterShell。
 *
 * 本探针只读生产代码，断言的是「修复后的口径」——改回旧判据会立刻红。 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

const meta = SB.game.meta();
meta.challenges = { completed: SB.challenges.progress(meta) };

function makeRun(id, broken, extra) {
  const s = SB.state.freshRun(false);
  s.challenge = { id: id, tier: 0, replay: false, startedAt: 0 };
  s.broken = !!broken;
  s.shellOpened = !!broken;
  s.shell = broken ? 0 : (s.iceShell || 200000);
  s.challengeDone = false;
  if (extra) Object.assign(s, extra);
  return s;
}

/* ── ① 流浪泰拉：破壳前 / 破壳后都必须「进行中」 ───────────── */
const pre = makeRun('drift_terra', false);
const preA = SB.challenges.active(pre);
ok('破壳前 active() = 流浪泰拉', !!preA && preA.id === 'drift_terra', preA && preA.id);
ok('破壳前 canStart false', SB.challenges.canStart('drift_terra', pre, meta) === false);

const post = makeRun('drift_terra', true);
const postA = SB.challenges.active(post);
ok('破壳后 active() 仍是流浪泰拉（破壳不是 goal 型终点）',
  !!postA && postA.id === 'drift_terra', postA ? postA.id : 'null');
ok('破壳后 canStart false（不给「结算并挑战」入口）',
  SB.challenges.canStart('drift_terra', post, meta) === false);
ok('破壳后 s.challenge 保留', !!post.challenge && post.challenge.id === 'drift_terra');

/* ── ② 水体污染同源（goal = 戴森球，同样在壳外） ──────────── */
const pol = makeRun('waterpollution', true);
const polA = SB.challenges.active(pol);
ok('破壳后 水体污染 active() 仍有效', !!polA && polA.id === 'waterpollution',
  polA ? polA.id : 'null');
ok('破壳后 水体污染 canStart false', SB.challenges.canStart('waterpollution', pol, meta) === false);

/* ── ③ 四项终局挑战（原 persistAfterShell:true）口径不变 ──── */
['anarchy', 'good_old_days', 'three_launch_sites', 'eternity_moment'].forEach(function (id) {
  const s = makeRun(id, true);
  const a = SB.challenges.active(s);
  ok('破壳后 ' + id + ' active() 仍有效', !!a && a.id === id, a ? a.id : 'null');
});

/* ── ④ 通关后必须回到「可开新挑战」 ───────────────────────── */
const done = makeRun('drift_terra', true);
done.challengeDone = true;
ok('已通关 → active() null', SB.challenges.active(done) === null);
ok('已通关 → canStart true（可以再战）', SB.challenges.canStart('drift_terra', done, meta) === true);

/* ── ⑤ 破壳后 goal 判定照常发奖 ───────────────────────────── */
const g = makeRun('drift_terra', true);
g.lvl.terra_engine = 50;
g.res.coreCharge = 50e6;
ok('破壳后 goalMet(50 台 + 50M) true',
  SB.challenges.goalMet(g, SB.challenges.byId('drift_terra').goal) === true);

let awarded = null;
const prevLog = SB.game.log, prevMeta = SB.state.saveMeta, prevRun = SB.state.saveRun;
SB.game.log = () => {}; SB.state.saveMeta = () => {}; SB.state.saveRun = () => {};
try { awarded = SB.challenges.evaluate(g, meta); } catch (e) { console.log('INFO evaluate 抛错: ' + e.message); }
SB.game.log = prevLog; SB.state.saveMeta = prevMeta; SB.state.saveRun = prevRun;
ok('破壳后 evaluate() 仍判定通关', !!awarded && awarded.id === 'drift_terra', awarded && awarded.id);
ok('　└ 写入 challengeDone', g.challengeDone === true);

console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAIL') + '  (' + pass + ' pass / ' + fail + ' fail)');
process.exit(fail === 0 ? 0 : 1);
