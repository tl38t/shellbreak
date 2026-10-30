/* e2e suite: 离线补算必须收尾（2026-10-30「打开游戏卡几分钟」回归锁）
 *
 * 事故形态：外层 `while (j.left > 0)` 与内层 `while (gameLeft > 1e-9)` 两条门槛之间
 * 夹着一条 1e-9 宽的缝。算完后 j.left 剩 ~1e-10（浮点累加残渣）就会：
 *   内层不进 → realDone 不涨 → `Math.max(0, j.left - 0)` 原样写回 → 外层空转到预算耗尽
 *   → `finishCatchUp` 永不执行 → 离线闸门永不关闭。
 *
 * 判据（行为级，不是搜源码字符串）：
 *   收尾后 loop.job 被清空，drainCatchUp 首行 `if (!j) return;` ⇒ **调用耗时 0ms**；
 *   活锁时同一调用会空转烧满预算（≥ 200ms）。这个差异比「s.t 推进量」敏感得多
 *   （残渣只有 1e-10 秒，取整后完全看不出来）。
 *
 * ⚠️ 夹具必须让 dt 被切成非整数段（藻场生长期 + 勤耕 perk），否则走纯整数累加、
 *    残渣恒为 0，测不出事故形态（我在沙箱对照里实测过：整数 dt 路径 0% 触发）。
 */
export function run({ SB, check }) {
  const CFG = SB.CFG;
  const BUDGET = 225;

  function fixture(phaseShift) {
    SB.game.resetRun();
    const s = SB.game.run();
    s.t = 200000 + phaseShift;      // 稳定期，避开破壳与开局
    s.era = 8;
    s.broken = false;
    s.shellOpened = false;
    s.pop = 120;
    s.peak = 120;
    /* 生长期切分：growthDuration 被勤耕工作量乘区拉成非整数 ⇒ dt 不再是整齐的 2 秒 */
    s.lvl.kelp = 12;
    s.res.kelp = 5000;
    s._grow = 0.37 + phaseShift * 0.11;
    if (!s.perk) s.perk = {};
    s.perk.workSpeed = 0.17;
    s.warmOn = true;
    s.res.warmstone = 400;
    s.ad.on = false;
    s.ad.ms = 0;
    return s;
  }

  /* 模拟生产循环：每帧给 225ms 预算，直到 drainCatchUp 变成「0ms 立即返回」= job 已清空 */
  function driveToFinish(s, secs) {
    SB.game.planCatchUp(s, secs, true);      // silent：不弹闸门，e2e 没有可用遮罩
    const t0 = s.t;
    let frames = 0, maxFrame = 0, total = 0, closed = false;
    while (frames < 400) {
      const a = Date.now();
      SB.game.drainCatchUp(BUDGET);
      const ms = Date.now() - a;
      frames++; total += ms;
      if (ms > maxFrame) maxFrame = ms;
      if (ms === 0) { closed = true; break; }   // job 已清空 ⇒ 首行立即 return
    }
    return { closed, frames, maxFrame, total, advanced: s.t - t0 };
  }

  /* ── 1. 30 分钟档（旧逻辑实测 100% 活锁） ── */
  {
    const s = fixture(0.4);
    const r = driveToFinish(s, 1800);
    check('离线补算 30 分钟能收尾（活锁时 drainCatchUp 永不返回 0ms）', r.closed,
      'frames=' + r.frames + ' maxFrame=' + r.maxFrame + 'ms advanced=' + r.advanced.toFixed(2));
    check('30 分钟补算确实推进了对应时长', Math.abs(r.advanced - 1800) < 30,
      'advanced=' + r.advanced.toFixed(2) + '（期望 1800±30）');
  }

  /* ── 2. 8 小时档：既要收尾，也要真的分帧（旧逻辑一帧算完 + 永不收尾） ── */
  {
    const s = fixture(1.7);
    const r = driveToFinish(s, 28800);
    check('离线补算 8 小时能收尾（闸门会关闭）', r.closed,
      'frames=' + r.frames + ' maxFrame=' + r.maxFrame + 'ms advanced=' + r.advanced.toFixed(2));
    check('8 小时补算确实推进了对应时长', Math.abs(r.advanced - 28800) < 60,
      'advanced=' + r.advanced.toFixed(2) + '（期望 28800±60）');
    /* ⚠️ 这一条锁的是「内层让出预算」：旧代码内层不检查时间，整个 8 小时挤在一帧里
     *    （真机实测单条长任务 4471ms）。分帧后必然 ≥2 帧。 */
    check('8 小时补算分帧推进（≥2 帧），不是一帧算完', r.frames >= 2,
      'frames=' + r.frames + ' total=' + r.total + 'ms');
    check('单帧不超过预算上限（内层会让出）', r.maxFrame <= 600,
      'maxFrame=' + r.maxFrame + 'ms（预算 ' + BUDGET + 'ms + 64 步余量）');
  }

  /* ── 3. 残渣容差不许把「还没算完」误判成「算完了」 ── */
  {
    /* 只给 1ms 预算 ⇒ 一定算不完。此时绝不能被 CATCHUP_EPS 当成收尾。 */
    const s = fixture(0.9);
    SB.game.planCatchUp(s, 7200, true);
    const t0 = s.t;
    SB.game.drainCatchUp(1);
    const advanced = s.t - t0;
    check('预算不足时不会被当成已收尾（容差不许吞掉剩余时间）',
      advanced > 0 && advanced < 7200,
      'advanced=' + advanced.toFixed(2) + '（应远小于 7200）');
    /* 收尾掉这一批，避免污染后续 suite（下一次 drain 会给足预算） */
    for (let i = 0; i < 400 && s.t - t0 < 7200; i++) SB.game.drainCatchUp(2000);
  }
}
