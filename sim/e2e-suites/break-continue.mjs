/* e2e suite: 「破壳不是本局终点」——破壳后在线推进与存档不被 broken 掐死。
 *
 * 背景（2026-11-03 玩家反馈「挑战中破壳后游戏卡着不动，资源不跳、自动研究不动、
 * 星空槽不动、挑战还不见了」，附存档诊断截图 = Ver1.0.12）：
 *   Ver1.0.13 声称「破壳不再停摆」，但只删了 economy-tick.js 首行的 `if (s.broken) return;`，
 *   调用方 game.js 的 `!S.broken` 门（主循环 while / 存档 flush / 自动存档 / UI 刷新）原样保留
 *   ⇒ tick 压根不会被调用，删早退等于零效果。本套件是那次的回归锁。
 *
 * 两类判据，缺一不可：
 *   ① 源码判据（**剥注释后**）：那些门不许回来；
 *   ② 行为判据：broken 状态下 economy.tick 仍推进、手动存档仍成功。
 * ⚠️ 源码判据必须先剥注释：这两个文件里到处是「原本是 `!S.broken`」这类历史注记，
 *   不剥就会把注释判成代码 —— 静态 grep 假警报同样算 bug。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../load-sb.mjs';

/* 粗剥注释（足够应付本项目风格：块注释 + 行注释；http:// 这类不误伤）。 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function run({ SB, check }) {
  console.log('\n=== 破壳不是本局终点（2026-11-03 回归锁）===');

  const gameSrc = stripComments(fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8'));
  const tickSrc = stripComments(fs.readFileSync(path.join(ROOT, 'src/economy-tick.js'), 'utf8'));
  const saveSrc = stripComments(fs.readFileSync(path.join(ROOT, 'src/save-transfer.js'), 'utf8'));

  /* ① 主循环：破壳后必须照跑。这是 1.0.13「改动零效果」的那一行。 */
  check('game.js 主循环不再用 broken 当暂停开关',
    /while \(!loop\.job && loop\.acc >= STEP && S\)/.test(gameSrc)
      && !/loop\.acc >= STEP && S && !S\.broken/.test(gameSrc),
    'while (!loop.job && loop.acc >= STEP && S)');

  /* ② economy.tick 首行：不得再有 broken 早退（删了也没用，但不能让它回来混淆判据）。 */
  check('economy-tick.js 不再有 broken 早退',
    !/function tick\(s, dt, emit, opts\) \{\s*if \(s\.broken\) return;/.test(tickSrc),
    'tick 首行无 if (s.broken) return;');

  /* ③ 存档：退出 flush / 自动存档 / 手动保存 / 云备份四条通道都不许带 broken 门。 */
  check('退出 flush 在 broken 时仍落盘',
    /function flush\(\) \{ if \(!suppressExitSave && S\) SB\.state\.saveRun/.test(gameSrc),
    'flush 只看 suppressExitSave');
  check('自动存档在 broken 时仍跑',
    /if \(S && now - \(loop\._lastSave \|\| 0\) > 5000\) \{/.test(gameSrc)
      && !/S && !S\.broken && now - \(loop\._lastSave/.test(gameSrc),
    '破壳后 5 秒节流照常存档');
  check('手动「立即保存」不再以 broken 为由拒绝',
    !/if \(s\.broken\) \{ saveNowFeedback\('当前进度异常/.test(saveSrc),
    'saveNow 无存档保护分支');
  check('云备份不再跳过 broken 局',
    !/if \(!s \|\| s\.broken\) return;/.test(saveSrc),
    'autoCloudPump 只看 !s');

  /* ④ 行为：broken 态下 economy.tick 真的推进（破壳后资源/科技继续产出）。 */
  {
    const s = SB.state.freshRun(false);
    s.shell = 0; s.shellOpened = true; s.broken = true; s.breakSettled = false;
    s.t = 1000;
    const t0 = s.t;
    let threw = null;
    try { SB.economy.tick(s, 1, null); } catch (e) { threw = e; }
    check('broken 态下 economy.tick 正常推进（不早退、不抛错）',
      !threw && s.t > t0 && s.shell === 0 && s.shellOpened === true,
      threw ? String(threw && threw.message) : ('t ' + t0 + '→' + s.t));

    /* 破壳是一次性事件：tick 跑起来后不许把 onShellZero 再触发一遍
     * （重复触发会重弹破壳面板、重放分镜、并再写一次成就账本）。 */
    check('破壳后重复 tick 不会二次触发壳归零',
      s.shellOpened === true && !Number.isNaN(s.pop) && !Number.isNaN(s.t),
      'shell=' + s.shell + ' pop=' + s.pop);
  }

  /* ④-b 破壳后长跑：本次修复让 broken 态第一次真正进入 tick 热路径
   *   （改动前这里一次都不跑），所以必须证明长跑不出 NaN/Infinity ——
   *   资源写坏会让 saveRun 整份拒写（见 state.saveRun 的坏值补位逻辑）。 */
  {
    const s2 = SB.state.freshRun(false);
    s2.shell = 0; s2.shellOpened = true; s2.broken = true; s2.breakSettled = false;
    let bad = '';
    for (let i = 0; i < 3000 && !bad; i++) {
      SB.economy.tick(s2, 0.1, null);
      if (i % 100 === 0) { SB.game.pumpTech(s2, null); SB.game.pumpCivic(s2, null); }
      for (const k in (SB.RESS || {})) {
        const v = s2.res[k];
        if (!(typeof v === 'number' && isFinite(v))) { bad = k + '=' + v; break; }
      }
    }
    check('破壳后长跑 300 秒无 NaN/Infinity',
      !bad && isFinite(s2.pop) && isFinite(s2.t),
      bad || ('pop=' + s2.pop + ' t=' + s2.t.toFixed(1)));
  }

  /* ⑤ 行为：手动保存通道对 broken 局放行。
   *   用主 fixture 临时置 broken，测完立刻还原并重新落盘 —— 放在全量尾部跑，
   *   避免影响后面依赖存档内容的套件。 */
  {
    const S = SB.game.run();
    const hadBroken = !!(S && S.broken);
    let ok = null, err = null;
    if (S) {
      S.broken = true;
      try { ok = SB.saveTransfer.saveNow(); } catch (e) { err = e; }
      S.broken = hadBroken;
    }
    check('broken 局手动保存返回成功',
      !!S && !err && ok === true,
      err ? String(err && err.message) : ('saveNow=' + ok));
  }
}
