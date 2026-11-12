/* e2e suite: 《流浪泰拉》「第 15 次轮回」开启前置
 * 建立于 2026-11-05（用户拍 #B）；2026-11-06 按 cycle 新口径重写。
 *
 * ⚠️ 2026-11-06 口径变更（用户拍板，见 game.js startRun 头注释）：
 *    `meta.cycle` 从「局数」收紧为「**合格轮回次数**」——只有 prestige.doBreak 过资格门
 *    （已建《神学》）才 +1；startRun 只涨 `meta.runs`（局数），不碰 cycle。
 *    ⇒ 开挑战时 cycle 会不会 +1，取决于「本局会不会真的结算」：
 *        会结算（已建神学且尚未结算）⇒ after = now + 1
 *        不会结算（未建神学 / 已经结算过）⇒ after = now
 *    旧套件整套建立在「startRun 必 +1 ⇒ after = now+1」上，那是旧口径的推导，已作废。
 *
 * 判据与生产同源，不重写算式：
 *   ① DEFINITIONS.prereq.n 必须等于 blackhistory.cond.n（唯一真源，防止两处漂移）；
 *   ② 门禁的 `after` 必须等于「进局后真实的 meta.cycle」，用 SB.tech.condMet 交叉验证
 *      （两档都验：会结算 ↔ condMet(cycle+1)，不结算 ↔ condMet(cycle)），不是自己算数；
 *   ③ UI 用真实 paneChallenges() / renderChallengeNotice() / prepareStart()，
 *      不 mock 实现、不复制文案。
 * ⚠️ `prereqState(id, meta, willBreak)` 的第三参是**测试用**：传假 meta 时必须显式给
 *    willBreak，否则它会去推算真实局的状态，用例之间互相污染。
 * ⚠️ 本套件放全量最尾部：会临时改 meta.cycle / meta.challenges.completed /
 *    s.challenge / s.challengeDone / s.civics.theology / s.lvl.terra_engine，finally 全还原。
 */
export function run({ SB, check, g, doc }) {
  console.log('\n=== 挑战开启前置：流浪泰拉（第 15 次轮回）===');
  const api = SB.challenges;
  const meta = SB.game.meta();
  const s = SB.game.run();
  const def = api.byId('drift_terra');
  const black = (SB.TECHS || []).find(t => t.id === 'blackhistory');
  const hadCompleted = !!(meta.challenges && meta.challenges.completed);
  const keep = {
    cycle: meta.cycle,
    driftDone: hadCompleted ? meta.challenges.completed.drift_terra : undefined,
    challenge: s.challenge,
    challengeDone: s.challengeDone,
    theology: !!(s.civics && s.civics.theology),
    settled: s.breakSettled,
    engine: s.lvl ? s.lvl.terra_engine : undefined
  };
  /* 造一个「开挑战时会不会触发合格结算」确定的假局：canStart 只读 civics.theology
   * 与 breakSettled，freshRun(false) 给的是干净一局。 */
  const fresh = (willBreak) => {
    const r = SB.state.freshRun(false);
    r.civics.theology = !!willBreak;
    r.breakSettled = false;
    return r;
  };
  /* DOM 断言走的是真实局（paneChallenges 内部读 SB.game.run()），所以直接改它的两个字段，
   * 让「会结算」这件事变成确定值；finally 里还原。 */
  const setWillBreak = (on) => {
    s.civics.theology = !!on;
    s.breakSettled = !on;
  };
  const starts = (html) => (html.match(/data-challenge-start=/g) || []).length;

  try {
    /* 清掉全局账本里可能残留的「流浪泰拉已通关」，否则 exhausted 会抢走状态徽标，
     * 低轮回卡片会显示「已完成」而不是「轮回不足」——那是夹具污染，不是被测行为。 */
    if (hadCompleted) meta.challenges.completed.drift_terra = false;
    s.challenge = null;
    s.challengeDone = false;

    /* ── 1. 定义与唯一真源 ─────────────────────────────────────────── */
    check('前置数字只有一个真源：drift_terra.prereq.n === blackhistory.cond.n === 15',
      !!def.prereq && def.prereq.t === 'cycle' && def.prereq.n === 15 &&
      !!black && black.cond.t === 'cycle' && black.cond.n === def.prereq.n,
      'prereq=' + JSON.stringify(def.prereq) + ' blackhistory=' + JSON.stringify(black && black.cond));
    check('blackhistory 是 winter 的 reqs（前置链没断，15 次轮回确实是通关链首）',
      !!black && (SB.TECHS || []).some(t => t.id === 'winter' && (t.reqs || []).indexOf('blackhistory') >= 0),
      'winter.reqs=' + JSON.stringify(((SB.TECHS || []).find(t => t.id === 'winter') || {}).reqs));
    check('其余 16 项挑战均无 prereq（门禁不误伤）',
      api.list().length === 17 && api.list().filter(d => d.prereq).length === 1,
      '带前置项数=' + api.list().filter(d => d.prereq).length);

    /* ── 2. 边界：after 取决于「本局会不会结算」 ────────────────────── */
    const st = (n, wb) => api.prereqState('drift_terra', { cycle: n }, wb);
    const st0T = st(0, true), st0F = st(0, false);
    const st13T = st(13, true), st13F = st(13, false);
    const st14T = st(14, true), st14F = st(14, false);
    const st15F = st(15, false);
    check('cycle=0 + 会结算：进局后 1/15，还差 14 次',
      !st0T.ok && st0T.after === 1 && st0T.lack === 14, JSON.stringify(st0T));
    check('cycle=0 + 不结算：进局后仍是 0/15，还差 15 次（旧口径会给 1）',
      !st0F.ok && st0F.after === 0 && st0F.lack === 15, JSON.stringify(st0F));
    check('cycle=13 + 会结算：进局后 14/15，还差 1 次',
      !st13T.ok && st13T.after === 14 && st13T.lack === 1 && st13T.lackInRun === 2, JSON.stringify(st13T));
    check('cycle=13 + 不结算：进局后 13/15，还差 2 次',
      !st13F.ok && st13F.after === 13 && st13F.lack === 2, JSON.stringify(st13F));
    check('cycle=14 + 会结算：进局后 15/15，刚好满足（不能按 now>=15 判）',
      st14T.ok && st14T.after === 15 && st14T.lack === 0, JSON.stringify(st14T));
    check('cycle=14 + 不结算：进局后仍是 14/15 ⇒ 必须挡住（本局不结算就别放人去打）',
      !st14F.ok && st14F.after === 14 && st14F.lack === 1, JSON.stringify(st14F));
    check('cycle=15 + 不结算：inRunOk 与 ok 都为真（已经够数，进行中不再 +1）',
      st15F.ok && st15F.inRunOk && st15F.lackInRun === 0, JSON.stringify(st15F));
    check('其他挑战 prereqState 为 null / prereqOk 为真 / 文案为空',
      api.prereqState('cold', { cycle: 0 }, true) === null &&
      api.prereqOk('cold', { cycle: 0 }, true) === true &&
      api.prereqText('cold', { cycle: 0 }, true) === '', 'cold 不受影响');

    /* ── 3. 文案（口径已从「第 N 周目」改为「N 次轮回」） ───────────── */
    const t13 = api.prereqText('drift_terra', { cycle: 13 }, true);
    const t14 = api.prereqText('drift_terra', { cycle: 14 }, true);
    check('未满足文案点名 15 次轮回 / 还差 1 次 / 黑历史蓝图 / 无法通关',
      t13.indexOf('15 次轮回') >= 0 && t13.indexOf('还差 1 次') >= 0 &&
      t13.indexOf('《黑历史蓝图》') >= 0 && t13.indexOf('无法通关') >= 0, t13);
    check('已满足文案写「已满足」且不写「还差」',
      t14.indexOf('已满足') >= 0 && t14.indexOf('还差') < 0, t14);
    check('文案不再出现「第 N 周目」这种旧口径说法',
      t13.indexOf('周目') < 0 && t14.indexOf('周目') < 0, t13);

    /* ── 4. 门禁（真实函数） ────────────────────────────────────────── */
    const fT = fresh(true), fF = fresh(false);
    check('cycle=13 + 会结算：canStart / canStartFresh 都挡住流浪泰拉',
      !api.canStart('drift_terra', fT, { cycle: 13 }) &&
      !api.canStartFresh('drift_terra', fT, { cycle: 13 }),
      'canStart=' + api.canStart('drift_terra', fT, { cycle: 13 }));
    check('cycle=14 + 会结算：canStart / canStartFresh 都放行',
      api.canStart('drift_terra', fT, { cycle: 14 }) &&
      api.canStartFresh('drift_terra', fT, { cycle: 14 }),
      'canStart=' + api.canStart('drift_terra', fT, { cycle: 14 }));
    check('cycle=14 + 不结算：两个入口都被挡住（新口径的关键分支）',
      !api.canStart('drift_terra', fF, { cycle: 14 }) &&
      !api.canStartFresh('drift_terra', fF, { cycle: 14 }),
      'canStart=' + api.canStart('drift_terra', fF, { cycle: 14 }));
    check('cycle=15 + 不结算：放行（已经够数，不靠本局结算）',
      api.canStart('drift_terra', fF, { cycle: 15 }), 'canStart=' + api.canStart('drift_terra', fF, { cycle: 15 }));
    check('cycle=0：其余 10 项挑战仍可开',
      api.list().filter(d => d.id !== 'drift_terra')
        .every(d => api.canStart(d.id, fF, { cycle: 0 })), '其他挑战不受影响');
    fT.challenge = { id: 'waterpollution', tier: 0 };
    check('已有进行中挑战时仍为 false（active 的原语义没丢）',
      !api.canStart('drift_terra', fT, { cycle: 14 }), 'active 优先');

    /* ── 5. 与 tech.condMet 真实交叉验证「after」两档 ──────────────── */
    meta.cycle = 14;
    const cm14 = SB.tech.condMet(fF, { t: 'cycle', n: 15 });
    meta.cycle = 15;
    const cm15 = SB.tech.condMet(fF, { t: 'cycle', n: 15 });
    check('真实 condMet：14 次轮回不揭露《黑历史蓝图》，15 次才揭露',
      cm14 === false && cm15 === true, '14=' + cm14 + ' 15=' + cm15);
    check('门禁「会结算」档与 condMet 同源：canStart(cycle=14, 会结算) === condMet(cycle=15)',
      api.canStart('drift_terra', fresh(true), { cycle: 14 }) === cm15, '+1 口径同源');
    check('门禁「不结算」档也与 condMet 同源：canStart(cycle=14, 不结算) === condMet(cycle=14)',
      api.canStart('drift_terra', fresh(false), { cycle: 14 }) === cm14, '原地口径同源');

    /* ── 6. 真实 DOM：挑战卡片 ──────────────────────────────────────── */
    setWillBreak(true);          // 本局已建神学且未结算 ⇒ 开挑战会 +1
    meta.cycle = 13;
    const paneLow = SB.ui.render.paneChallenges();
    check('低轮回卡片：显示「开启前置」/ 还差 1 次 / 轮回不足，且不给开始按钮',
      paneLow.indexOf('<small>开启前置</small>') >= 0 &&
      paneLow.indexOf('还差 1 次') >= 0 && paneLow.indexOf('>轮回不足<') >= 0 &&
      paneLow.indexOf('challenge-status locked') >= 0 &&
      paneLow.indexOf('data-challenge-start="drift_terra"') < 0,
      'starts=' + starts(paneLow));
    check('低轮回卡片：入口数 16（17 项减去被挡住的流浪泰拉）',
      starts(paneLow) === 16, 'starts=' + starts(paneLow));
    check('规则区的「开启前置」行只出现一次（不误加到别的挑战）',
      (paneLow.match(/<small>开启前置<\/small>/g) || []).length === 1,
      '次数=' + (paneLow.match(/<small>开启前置<\/small>/g) || []).length);
    check('低轮回卡片：其余挑战仍各有开始入口',
      paneLow.indexOf('data-challenge-start="cold"') >= 0 &&
      paneLow.indexOf('data-challenge-start="waterpollution"') >= 0, 'cold / 水体污染在');

    meta.cycle = 14;
    const paneOk = SB.ui.render.paneChallenges();
    check('第 14 次轮回 + 会结算：前置显示已满足，入口恢复 17 个且流浪泰拉可点',
      paneOk.indexOf('已满足') >= 0 && paneOk.indexOf('>轮回不足<') < 0 &&
      starts(paneOk) === 17 && paneOk.indexOf('data-challenge-start="drift_terra"') >= 0,
      'starts=' + starts(paneOk));

    /* 同一 cycle、但本局不会结算 ⇒ 卡片必须退回「还差 1 次」。
     * 这一条是「重开本周目不再算轮回」在 UI 上的直接体现。 */
    setWillBreak(false);
    const paneNoBreak = SB.ui.render.paneChallenges();
    check('第 14 次轮回 + 不结算：卡片退回「还差 1 次」，入口只剩 11 个',
      paneNoBreak.indexOf('还差 1 次') >= 0 && starts(paneNoBreak) === 11 &&
      paneNoBreak.indexOf('data-challenge-start="drift_terra"') < 0,
      'starts=' + starts(paneNoBreak));

    /* ── 7. 进行中的老档不能被门禁静默抹掉 ─────────────────────────── */
    setWillBreak(true);
    meta.cycle = 13;
    s.challenge = { id: 'drift_terra', tier: 0 };
    s.challengeDone = false;
    if (s.lvl) s.lvl.terra_engine = 7;
    const paneActive = SB.ui.render.paneChallenges();
    check('进行中老档：仍显示发动机进度 + 前置警示，且没有「结算并挑战」',
      paneActive.indexOf('行星发动机 7 / 50') >= 0 &&
      paneActive.indexOf('开启前置未满足') >= 0 &&
      paneActive.indexOf('data-challenge-start="drift_terra"') < 0,
      'engine7=' + paneActive.indexOf('行星发动机 7 / 50'));
    check('进行中老档：状态仍是「进行中」，不是「轮回不足」',
      paneActive.indexOf('challenge-status active">进行中') >= 0 &&
      paneActive.indexOf('>轮回不足<') < 0, 'active 分支优先');

    /* ── 8. 常驻通知条（真实渲染函数 + 假 DOM textContent） ─────────── */
    const noticeNode = doc.getElementById('challengeNoticeProgress');
    SB.ui.render.renderChallengeNotice(s);
    const noticeLow = noticeNode.textContent;
    check('常驻条低轮回：显示 13 / 15 与前置未满足',
      noticeLow.indexOf('13 / 15') >= 0 && noticeLow.indexOf('前置未满足') >= 0, noticeLow);
    meta.cycle = 15;
    SB.ui.render.renderChallengeNotice(s);
    const noticeOk = noticeNode.textContent;
    check('常驻条达标：显示「开启前置已满足」',
      noticeOk.indexOf('开启前置已满足') >= 0, noticeOk);

    /* ── 9. 确认面板（真实 prepareStart 路径，不 mock 挑战模块） ────── */
    setWillBreak(true);
    meta.cycle = 14;
    s.challenge = null;
    s.challengeDone = false;
    const origConfirm = SB.ui.render.confirmPanel;
    let panel = null;
    SB.ui.render.confirmPanel = (opts) => { panel = opts; };
    try {
      const opened = api.prepareStart('drift_terra');
      check('确认面板带「开启前置」段与 15 次轮回（玩家点按钮前就能看见）',
        opened === true && !!panel && panel.body.indexOf('<b>开启前置</b>') >= 0 &&
        panel.body.indexOf('15 次轮回') >= 0,
        'opened=' + opened + ' body=' + (panel ? panel.body.slice(0, 220) : 'null'));
      panel = null;
      meta.cycle = 13;
      const blockedOpen = api.prepareStart('drift_terra');
      check('cycle=13 时 prepareStart 直接拒绝，连确认面板都不弹',
        blockedOpen === false && panel === null, 'blockedOpen=' + blockedOpen);
    } finally {
      SB.ui.render.confirmPanel = origConfirm;
    }
  } finally {
    meta.cycle = keep.cycle;
    if (hadCompleted) meta.challenges.completed.drift_terra = keep.driftDone;
    s.challenge = keep.challenge;
    s.challengeDone = keep.challengeDone;
    if (s.civics) s.civics.theology = keep.theology;
    s.breakSettled = keep.settled;
    if (s.lvl) {
      if (keep.engine === undefined) delete s.lvl.terra_engine;
      else s.lvl.terra_engine = keep.engine;
    }
  }
}
