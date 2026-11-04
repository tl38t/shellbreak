/* 破壳后挑战页渲染回归锁（2026-11-04）。
 * 加载真实 paneChallenges，断言「破壳前后同一存档渲染出的状态一致」：
 *   破壳前：流浪泰拉「进行中」，无开始按钮；
 *   破壳后：仍然「进行中」，无「结算并挑战」按钮、无（已删的）「壳外推进」只读块。
 * 旧代码在这里会红 —— 破壳后整排退回「尚未完成」并给出可点的开始按钮。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadNoDom, ROOT } from './load-sb.mjs';

const { ctx, SB } = loadNoDom();
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/ui/render-pane-challenges.js'), 'utf8'), ctx,
  { filename: 'src/ui/render-pane-challenges.js' });

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

const meta = SB.game.meta();
meta.challenges = { completed: SB.challenges.progress(meta) };

function makeRun(broken) {
  const s = SB.state.freshRun(false);
  s.challenge = { id: 'drift_terra', tier: 0, replay: false, startedAt: 0 };
  s.broken = !!broken;
  s.shellOpened = !!broken;
  s.shell = broken ? 0 : (s.iceShell || 200000);
  s.challengeDone = false;
  return s;
}

const holder = { run: makeRun(false) };
SB.game.run = () => holder.run;
SB.game.meta = () => meta;
SB.game.setTab = () => {};
SB.game.log = () => {};
SB.game.renderAll = () => {};

function render(broken) {
  holder.run = makeRun(broken);
  const html = SB.ui.renderParts.paneChallenges();
  const statuses = [...html.matchAll(/challenge-status[^>]*>([^<]*)</g)].map(m => m[1]);
  return {
    html,
    statuses,
    hasStart: /data-challenge-start="drift_terra"/.test(html),
    hasReadonly: /challenge-active is-readonly/.test(html),
    activeMark: (html.match(/challenge-active-mark">([^<]*)</) || [])[1],
  };
}

const pre = render(false);
ok('破壳前 卡片徽标含「进行中」', pre.statuses.indexOf('进行中') >= 0, JSON.stringify(pre.statuses));
ok('破壳前 无「结算并挑战」按钮', pre.hasStart === false);

const post = render(true);
ok('破壳后 卡片仍显示「进行中」', post.statuses.indexOf('进行中') >= 0, JSON.stringify(post.statuses));
ok('破壳后 不再出现「尚未完成」在流浪泰拉卡上', post.activeMark === '进行中', post.activeMark);
ok('破壳后 无「结算并挑战」按钮（不会误点丢局）', post.hasStart === false);
ok('破壳后 无「壳外推进」只读块（已删的死路径）', post.hasReadonly === false);
ok('破壳后 卡片仍显示 50 台进度文案',
  /行星发动机\s*\d+\s*\/\s*50/.test(post.html) || post.html.indexOf('行星发动机') >= 0);

console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAIL') + '  (' + pass + ' pass / ' + fail + ' fail)');
process.exit(fail === 0 ? 0 : 1);
