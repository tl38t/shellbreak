/* e2e suite: war campaign rules, invasion timing, and diplomacy rendering. */
import { readFileSync } from 'node:fs';

export function run({ SB, check, noop, doc }) {
  console.log('\n=== War campaign ===');

  /* ===== 外交页「页签问号 intro」+「开门叙事弹窗」接线回归锁（2026-11-11） =====
   * 锁四件事：① 用户定稿的单行台词一字不动；② INTRO 与 i18n 两份文案逐字一致；
   * ③ 5 个 story key 真上屏（用哨兵串区分 fallback，防止 storySlugs 漏映射）；
   * ④ 双门 / 一次性旗标 / 老档补播口径。 */
  {
    const T = (k) => SB.i18n.t(k);
    const LINE = '军事上得不到的，也休想在谈判桌上得到。';
    const intro = SB.ui.renderContent && SB.ui.renderContent.INTRO
      ? SB.ui.renderContent.INTRO.diplomacy : null;
    check('外交问号 intro 条目存在，且与 zh-CN 三字段逐字一致（两份必须同步）',
      !!intro && !!intro.def && !!intro.step &&
      intro.ttl === T('ui.intro.diplomacy.title') &&
      intro.def === T('ui.intro.diplomacy.description') &&
      intro.step === T('ui.intro.diplomacy.step'),
      JSON.stringify({ has: !!intro, ttl: intro && intro.ttl }));
    check('外交解锁弹窗台词逐字等于用户定稿，且是单行（无 line_2）',
      T('game.story.unlock.diplomacy.line_1') === LINE &&
      T('game.story.unlock.diplomacy.line_2') === '' &&
      T('game.story.unlock.diplomacy.title') === '外交页解锁' &&
      T('game.story.unlock.diplomacy.action') === '进入外交页' &&
      T('game.story.unlock.diplomacy.system_title') === '七阶敌国战役已开放',
      JSON.stringify({ l1: T('game.story.unlock.diplomacy.line_1'),
        l2: T('game.story.unlock.diplomacy.line_2') }));
    check('锁态文案写全双门（导航 / 军事训练）',
      T('ui.war.campaign.locked').indexOf('军事训练') >= 0,
      T('ui.war.campaign.locked'));
    /* 运行时读不到 en-US（e2e 只挂 zh-CN）与 index.html（不进沙箱），用真实文件取证。 */
    const en = readFileSync(new URL('../../electron/locales/en-US.js', import.meta.url), 'utf8');
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const st = readFileSync(new URL('../../src/state.js', import.meta.url), 'utf8');
    const mg = readFileSync(new URL('../../src/state-migrate.js', import.meta.url), 'utf8');
    const enKeys = ['action', 'line_1', 'system_description', 'system_title', 'title']
      .every(f => en.indexOf('"game.story.unlock.diplomacy.' + f + '"') >= 0);
    check('英文 5 个 story key 齐全，且 diplomacy 页签挂上问号按钮',
      enKeys && en.indexOf('"ui.intro.diplomacy.title"') >= 0 &&
      html.indexOf("openIntro('diplomacy')") >= 0,
      JSON.stringify({ enKeys, qbtn: html.indexOf("openIntro('diplomacy')") >= 0 }));
    check('freshRun 登记 diplomacyPopup，老档按 B 补播（缺字段仍为 false）',
      st.indexOf('diplomacyPopup: false') >= 0 &&
      mg.indexOf('out.diplomacyPopup = false') >= 0,
      JSON.stringify({ fresh: st.indexOf('diplomacyPopup: false') >= 0,
        migrate: mg.indexOf('out.diplomacyPopup = false') >= 0 }));
    /* 真 DOM 上屏：故意把所有 fallback 换成哨兵串，若 storySlugs 漏映射或某个 key
     * 没写，哨兵就会出现在 modalBox 里 —— 比「看文案在不在」更能钉住接线。 */
    if (doc && SB.ui.render && SB.ui.render.storyPanel) {
      const box = doc.getElementById('modalBox'), modal = doc.getElementById('modal');
      const body = doc.body;
      const saved = { html: box.innerHTML,
        modal: new Set(modal._classes || []), box: new Set(box._classes || []),
        body: new Set((body && body._classes) || []) };
      const S = '__PROBE_FALLBACK__';
      try {
        SB.ui.render.storyPanel({ kind: 'diplomacy', icon: '⚔️', title: S,
          lines: [S], unlockTitle: S, unlockCopy: S, ok: S });
        const h = box.innerHTML;
        check('外交叙事弹窗真上屏：5 个 story key 生效（哨兵不出现），台词/✓块/按钮齐全',
          h.indexOf(S) < 0 && h.indexOf(LINE) >= 0 &&
          h.indexOf('外交页解锁') >= 0 && h.indexOf('七阶敌国战役已开放') >= 0 &&
          h.indexOf('进入外交页') >= 0 && h.indexOf('新系统解锁') >= 0,
          JSON.stringify({ len: h.length, sentinel: h.indexOf(S), line: h.indexOf(LINE) }));
      } finally {
        box.innerHTML = saved.html;
        if (modal._classes) modal._classes = saved.modal;
        if (box._classes) box._classes = saved.box;
        if (body && body._classes) body._classes = saved.body;
      }
    }
    {
      const oldSP = SB.ui.render.storyPanel, oldMD = SB.game.markDirty;
      const seen = [];
      try {
        SB.game.markDirty = noop;
        /* ⚠️ 全量 e2e 的前序套件可能留下 storyQueueBusy=true 且 #modal 不带 hidden：
         * queueStory 只在「busy 且 modal 含 hidden」时才解开中间态，否则新卡会被
         * 压在队列里（openNextStory 直接 return），spy 一张都收不到 —— 这正是
         * 本套件在 --war-only 全绿、全量却红 1 条的根因（不是生产 bug）。
         * 解法：先把 modal 放回 hidden 解锁 busy，再让 spy 主动驱动 onOk 把队列
         * 出清；无论之前积压了几张卡，本轮推入的 diplomacy 卡都一定会被收到。 */
        if (doc) doc.getElementById('modal').classList.add('hidden');
        SB.ui.render.storyPanel = (o) => {
          seen.push(o);
          if (o && typeof o.onOk === 'function') {
            try { o.onOk(); } catch (e) { /* 前序卡的 onOk 可能切页，与本断言无关 */ }
          }
        };
        const dipl = () => seen.filter(o => o && o.kind === 'diplomacy');
        const s0 = { techs: {}, civics: {}, diplomacyPopup: false };
        SB.game.maybeDiplomacyPopup(s0);
        check('外交解锁弹窗双门：两门都未满足时不弹不记账',
          s0.diplomacyPopup === false && dipl().length === 0,
          JSON.stringify({ flag: s0.diplomacyPopup, dipl: dipl().length, seen: seen.length }));
        const s1 = { techs: { navigation: true }, civics: {}, diplomacyPopup: false };
        /* ⚠️ 全量环境里前序套件的 fixture 也满足双门，会真实触发外交解锁弹窗并积压
         * 在队列里（实测 seen=23、其中 diplomacy 已有 2~3 张）。故判据必须表达
         * 「本次调用有增量、第二次无增量」，不能数 diplomacy 的绝对张数。 */
        const before = seen.length;
        SB.game.maybeDiplomacyPopup(s1);
        const afterFirst = seen.length;
        SB.game.maybeDiplomacyPopup(s1);
        const afterSecond = seen.length;
        check('《导航》门命中 → 推入叙事队列且只置一次旗标（第二次不重复）',
          s1.diplomacyPopup === true &&
          afterFirst > before && afterSecond === afterFirst &&
          dipl().length >= 1 && dipl()[0].lines[0] === LINE,
          JSON.stringify({ flag: s1.diplomacyPopup, delta: afterFirst - before,
            delta2: afterSecond - afterFirst, dipl: dipl().length, seen: seen.length }));
      } finally {
        SB.ui.render.storyPanel = oldSP;
        SB.game.markDirty = oldMD;
        /* 队列已被 spy 出清到空、busy=false；再把 modal 放回 hidden，
         * 保证后续所有叙事弹窗测试不继承本套件的中间态。 */
        if (doc) doc.getElementById('modal').classList.add('hidden');
      }
    }
  }

  const oldRng = SB.rng;
  const oldRun = SB.game.run;
  const oldMarkDirty = SB.game.markDirty;
  function fixture() {
    const s = SB.state.freshRun(false);
    s.techs.navigation = true;
    Object.assign(s.civics, {
      military_training: true, professional_army: true, mobilization: true,
      drama: true, sovereign: true, trade: true
    });
    SB.war.syncCampaign(s);
    return s;
  }

  try {
    SB.game.markDirty = noop;
    const stageScales = SB.war.ENEMIES.map(enemy => enemy.baseScale).join(',');
    check('战役有七个递增阶段，规模每级 ×5',
      stageScales === '1000,5000,25000,125000,625000,3125000,15625000', stageScales);

    const costState = fixture();
    const costEnemy = SB.war.currentEnemy(costState);
    const baseCosts = ['raid', 'invasion', 'totalWar'].map(id => SB.war.actionCost(costState, costEnemy, id));
    costState.lvl.fortress = 100;
    const fortifiedOdds = SB.war.actionProbabilities(costState, 'raid');
    check('三种军事行动成本为有效上限的 5% / 15% / 30%',
      baseCosts[0] === 50 && baseCosts[1] === 150 && baseCosts[2] === 300,
      baseCosts.join('/'));
    check('要塞能把失败率压到 5% 下限，概率总和仍为 100%',
      fortifiedOdds.failure >= 0.05 && Math.abs(fortifiedOdds.failure - 0.05) < 1e-9 &&
      Math.abs(fortifiedOdds.failure + fortifiedOdds.success + fortifiedOdds.greatSuccess - 1) < 1e-9,
      JSON.stringify(fortifiedOdds));

    const rateState = fixture();
    rateState.pop = 10;
    rateState.jobs.soldier = 10;
    rateState.lvl.barracks = 2;
    rateState.lvl.military_academy = 1;
    check('军力产出合并军人、军营加成与士官学院人口产出',
      Math.abs(SB.war.rate(rateState) - 5.2) < 1e-9,
      'rate=' + SB.war.rate(rateState) + ' expected=5.2');

    const softState = fixture();
    softState.res.culture = 100000;
    const soft = SB.war.executeSoftPowerAction(softState, 'enemy_1', 'culture', { random: () => 0.5 });
    check('文化行动按 1000 消耗并依概率削减 1.5% 上限',
      soft.ok && soft.cost === 1000 && Math.abs(soft.appliedReduction - 0.015) < 1e-9 &&
      softState.war.enemies.enemy_1.cultureActions === 1,
      JSON.stringify({ ok: soft.ok, cost: soft.cost, reduction: soft.appliedReduction }));
    check('单一软实力渠道上限 30%，两渠道总上限 60%',
      SB.war.reduceEnemyCap(softState.war.enemies.enemy_1, 'cultureReduction', 0.30) > 0 &&
      SB.war.reduceEnemyCap(softState.war.enemies.enemy_1, 'faithReduction', 0.30) > 0 &&
      SB.war.effectiveMaxScale(softState.war.enemies.enemy_1) === 400 &&
      SB.war.reduceEnemyCap(softState.war.enemies.enemy_1, 'faithReduction', 0.30) === 0,
      'maxScale=' + SB.war.effectiveMaxScale(softState.war.enemies.enemy_1));

    const combatState = fixture();
    combatState.jobs.soldier = 10;
    combatState.pop = 11;
    // 现实状态：jobs(军人10+采集1)=11 = pop11；损失后 pop10、军人9、jobs10=pop10，
    // trim 不会多裁军人，断言 soldier===9 才成立。采集=1 保证掠获资源费率>0
    // （否则行动在 loot 门禁提前退，损失根本不发生）。
    combatState.jobs.gather = 1;
    combatState.res.kelp = 0;
    combatState.war.power = 1000;
    const candidates = SB.war.lootResourceCandidates(combatState);
    const eligibleLoot = candidates.length > 0 && candidates.every(id =>
      SB.RESS[id] && SB.RESS[id].kind !== 'craft' && !SB.RESS[id].flow);
    SB.rng = () => 0;
    const failedAction = SB.war.executeAction(combatState, 'enemy_1', 'raid', { random: () => 0 });
    check('战利品候选只含已解锁的非工艺、非流动资源', eligibleLoot, candidates.join(','));
    check('行动失败不发战利品，并按国家人口比率损失人口（不可被调岗规避）',
      failedAction.ok && failedAction.outcome === 'failure' && failedAction.lootAmount === 0 &&
      failedAction.popLost === 1 && combatState.pop === 10 && combatState.jobs.soldier === 9,
      JSON.stringify({ outcome: failedAction.outcome, loot: failedAction.lootAmount,
        popLost: failedAction.popLost, population: combatState.pop }));

    const rewardState = fixture();
    rewardState.jobs.gather = 1;
    rewardState.res.kelp = 0;
    rewardState.war.power = 1000;
    rewardState.res.stone = 300;
    SB.war.establishTradeRoute(rewardState);
    const action = SB.war.executeAction(rewardState, 'enemy_1', 'raid', { random: () => 0.99 });
    const rewardEnemy = rewardState.war.enemies.enemy_1;
    check('大成功发放有限人口上限并在战争后清空商路',
      action.ok && action.outcome === 'greatSuccess' && action.populationCapAward === 1 &&
      rewardEnemy.popCapClaimed === 1 && rewardState.war.tradeRouteLevel === 0,
      JSON.stringify({ outcome: action.outcome, cap: action.populationCapAward,
        route: rewardState.war.tradeRouteLevel }));
    check('成功行动按行动前毛产出发放随机战利品',
      action.resourceId === 'kelp' && action.resourceRate > 0 && action.lootAmount > 0,
      JSON.stringify({ resource: action.resourceId, rate: action.resourceRate, loot: action.lootAmount }));
    rewardEnemy.currentScale = 0;
    rewardState.war.power = 0;
    const annex = SB.war.annexEnemy(rewardState, 'enemy_1');
    const nextEnemy = SB.war.currentEnemy(rewardState);
    check('吞并只发未领取的人口上限，零规模允许零军力吞并并推进阶段',
      annex.ok && annex.cost === 0 && annex.populationCapAward === 2 &&
      rewardState.war.campaignStage === 1 && nextEnemy && nextEnemy.id === 'enemy_2' &&
      Math.abs(SB.war.conquestProductionMultiplier(rewardState) - 1.01) < 1e-9,
      JSON.stringify({ cost: annex.cost, cap: annex.populationCapAward,
        stage: rewardState.war.campaignStage }));
    check('太阳镜反射阵列把吞并倍率从 ×5 降为 ×3',
      SB.war.annexCost(nextEnemy, false) === 25000 && SB.war.annexCost(nextEnemy, true) === 15000,
      'normal=' + SB.war.annexCost(nextEnemy, false) + ' mirror=' + SB.war.annexCost(nextEnemy, true));

    const invasionState = fixture();
    const invasionEnemy = SB.war.currentEnemy(invasionState);
    SB.rng = () => 0.99;
    SB.war.tick(invasionState, 1500, noop);
    const warningAt25 = invasionState.war.invasionWarningPending &&
      invasionState.war.invasionThreat === 1500 && invasionState.war.invasionWarning === 300;
    SB.war.tick(invasionState, 300, noop);
    check('满规模敌国在 25 分钟预警、30 分钟触发入侵并进入 30 分钟冷却',
      warningAt25 && invasionState.war.invasionThreat === 0 &&
      invasionState.war.invasionCooldown === 1800 && !invasionState.war.invasionWarningPending &&
      Math.abs(invasionEnemy.currentScale - 900) < 1e-9,
      JSON.stringify({ warningAt25, cooldown: invasionState.war.invasionCooldown,
        enemyScale: invasionEnemy.currentScale }));

    const offlineState = fixture();
    SB.rng = () => 0.99;
    SB.war.tick(offlineState, 3600, noop, { deferBreakUI: true });
    SB.war.tick(offlineState, 3600, noop, { deferBreakUI: true });
    const oneOfflineResolution = offlineState.war.offlineInvasionResolved &&
      offlineState.war.invasionReports.length === 1;
    SB.war.drainInvasionReports(offlineState);
    check('离线补算最多结算一次入侵，领取报告后状态复位',
      oneOfflineResolution && !offlineState.war.offlineInvasionResolved &&
      offlineState.war.invasionReports.length === 0,
      'reports after catchup=' + (oneOfflineResolution ? 1 : offlineState.war.invasionReports.length));

    if (SB.ui && SB.ui.renderParts && SB.ui.renderParts.paneWar) {
      const uiState = fixture();
      uiState.jobs.gather = 1;
      SB.game.run = () => uiState;
      SB.game.markDirty = noop;
      const html = SB.ui.renderParts.paneWar();
      check('外交页渲染分阶段敌方肖像、影响进度条和真实战争按钮',
        html.indexOf('enemy-stage-01.jpg?v=2') >= 0 &&
        html.indexOf('war-portrait-window') >= 0 &&
        html.indexOf('aria-valuemax="30"') >= 0 &&
        html.indexOf('data-war-action="raid"') >= 0 &&
        html.indexOf('data-war-annex="1"') >= 0,
        'portrait=' + (html.indexOf('enemy-stage-01.jpg?v=2') >= 0) +
          ' action=' + (html.indexOf('data-war-action="raid"') >= 0));

      /* ── 规模上限影响分解 · 用户定稿文案回归锁（2026-11-11） ─────────────
       * 口径：基础规模上限→文明规模；文化影响→受我们的文化影响；
       *       信仰影响→「转为信仰〈玩家设定的信仰名〉」，未命名时回落短标签。
       * ⚠️ 图例是窄屏紧凑条（.war-archive-legend flex-wrap），继续用 *_legend 短标签，
       *    否则长句 + 16 字自定义信仰名会把 390px 图例挤成三行。 */
      const tz = (k, p) => SB.i18n.t(k, p);
      check('规模分解三格按定稿改名：文明规模 / 受我们的文化影响 / 未命名回落「信仰影响」',
        html.indexOf('<span>' + tz('ui.war.scale_flow.base_cap') + '</span>') >= 0 &&
        html.indexOf('<span>' + tz('ui.war.scale_flow.culture') + '</span>') >= 0 &&
        html.indexOf('<span>' + tz('ui.war.scale_flow.faith') + '</span>') >= 0 &&
        html.indexOf('基础规模上限') < 0 &&
        html.indexOf('<span>文化影响</span>') < 0,
        '文明规模=' + (html.indexOf('<span>' + tz('ui.war.scale_flow.base_cap') + '</span>') >= 0) +
          ' 全称=' + (html.indexOf('<span>' + tz('ui.war.scale_flow.culture') + '</span>') >= 0) +
          ' 旧词残留=' + (html.indexOf('基础规模上限') >= 0));
      uiState.religionName = '渊海信仰';
      const htmlNamed = SB.ui.renderParts.paneWar();
      check('玩家设定信仰名后，信仰格显示「转为信仰〈该名〉」，图例仍用短标签',
        htmlNamed.indexOf(tz('ui.war.scale_flow.faith_named', { faithName: '渊海信仰' })) >= 0 &&
        htmlNamed.indexOf('</i>' + tz('ui.war.scale_flow.culture_legend') + ' ') >= 0 &&
        htmlNamed.indexOf('</i>' + tz('ui.war.scale_flow.faith_legend') + ' ') >= 0,
        'named=' + (htmlNamed.indexOf(tz('ui.war.scale_flow.faith_named', { faithName: '渊海信仰' })) >= 0));
      uiState.religionName = '<script>';
      const htmlEsc = SB.ui.renderParts.paneWar();
      check('玩家自定义信仰名进 HTML 前已转义（防 XSS）',
        htmlEsc.indexOf('&lt;script&gt;') >= 0 && htmlEsc.indexOf('<script>') < 0,
        'escaped=' + (htmlEsc.indexOf('&lt;script&gt;') >= 0));
      uiState.religionName = '';
      const enWar = readFileSync(new URL('../../electron/locales/en-US.js', import.meta.url), 'utf8');
      check('英文 scale_flow 五个新键齐全（双语不允许漏登记）',
        ['base_cap', 'culture', 'faith_named', 'culture_legend', 'faith_legend'].every(k =>
          enWar.indexOf('"ui.war.scale_flow.' + k + '"') >= 0) &&
        enWar.indexOf('Civilization scale') >= 0 && enWar.indexOf('Influenced by our culture') >= 0,
        'en keys ok');

      /* ── 外交页四处文案（2026-11-11 23:40 用户定稿） ─────────────────────
       * ① 删常驻「本局永久全局产出加成」条（机制仍在，只删显示）；
       * ② 软实力两卡补效果/限制；③ 战争行动三档后果数值必须同源 SB.war.ACTIONS；
       * ④ 传承墙卷首引文逐字。 */
      check('① 常驻征服奖励条已移除，产出加成机制仍由 war.js 提供',
        html.indexOf('war-conquest-reward') < 0 &&
        html.indexOf('本局永久全局产出加成') < 0 &&
        html.indexOf('Permanent global production bonus') < 0 &&
        typeof SB.war.conquestProductionMultiplier === 'function',
        'block=' + (html.indexOf('war-conquest-reward') >= 0));
      check('② 软实力两张卡都有「效果 + 限制」说明',
        html.indexOf(tz('ui.war.soft_power.effect')) >= 0 &&
        html.indexOf(tz('ui.war.soft_power.limit')) >= 0 &&
        (html.split(tz('ui.war.soft_power.effect')).length - 1) === 2,
        'effect/limit on both cards');
      const ACTIONS = SB.war.ACTIONS;
      const outcomeLine = (key, o, lootMinutes) => tz(key, {
        scaleLossPercent: Math.round(o.scaleLoss * 100),
        soldierText: o.popLoss > 0
          ? tz('ui.war.action.pop_loss', { popLossPercent: Math.round(o.popLoss * 100) })
          : tz('ui.war.action.no_pop_loss'),
        lootMinutes: lootMinutes,
        popCap: Number(o.popCap) || 0
      });
      const expectedOutcomes = [];
      for (const id of ['raid', 'invasion', 'totalWar']) {
        const sp = ACTIONS[id];
        const minutes = Math.round(sp.lootSeconds / 60 * 10) / 10;
        expectedOutcomes.push(outcomeLine('ui.war.action.outcome.failure', sp.outcomes.failure, minutes));
        expectedOutcomes.push(outcomeLine('ui.war.action.outcome.success', sp.outcomes.success, minutes));
        expectedOutcomes.push(outcomeLine('ui.war.action.outcome.great_success', sp.outcomes.greatSuccess, minutes));
      }
      check('③ 三个战争行动的三档后果逐字上屏，且数值与 ACTIONS 同源',
        expectedOutcomes.length === 9 &&
        expectedOutcomes.every(line => html.indexOf(line) >= 0) &&
        html.indexOf(tz('ui.war.action.common_note')) >= 0 &&
        (html.split('war-action-outcomes').length - 1) === 3,
        'lines=' + expectedOutcomes.length +
          ' hit=' + expectedOutcomes.filter(line => html.indexOf(line) >= 0).length);
      const HERITAGE_LINE = '他们没能经受时光的考验，但至少有一部分获得了新生……';
      check('④ 传承墙卷首引文逐字上屏（用户定稿，不改一字）',
        tz('ui.heritage.flavor') === HERITAGE_LINE &&
        html.indexOf('heritage-flavor') >= 0 && html.indexOf(HERITAGE_LINE) >= 0,
        'flavor');
      const newKeys = ['ui.heritage.flavor', 'ui.war.soft_power.effect', 'ui.war.soft_power.limit',
        'ui.war.action.common_note', 'ui.war.action.pop_loss', 'ui.war.action.no_pop_loss',
        'ui.war.action.outcome.failure', 'ui.war.action.outcome.success',
        'ui.war.action.outcome.great_success'];
      check('本批 9 个新增文案键双语齐全（含英文登记）',
        newKeys.every(k => tz(k) !== '' && enWar.indexOf('"' + k + '"') >= 0),
        'keys=' + newKeys.length);
    }

    /* ── 战争结果轻量提示（toast）回归锁 · 2026-11-11 ─────────────────────
       口径纪律：军力储备(state.power / cost) ≠ 人口损失(popLost)。
         · cost 是无条件「入场费」，war.js 三档都一样，与成败无关；
         · 人口损失才是随成败变化的代价（按国家人口比率 ceil 计，不可被调岗规避）；
         · 被动入侵完全不扣军力储备，只改敌国规模 + 三类惩罚。
       期望文案一律用 SB.i18n.t 现算 ⇒ 与 e2e 当前 locale 无关，不会假绿/假红。 */
    if (SB.ui && typeof SB.ui.showWarToast === 'function') {
      const realToast = SB.ui.showWarToast;
      const expectCostLine = SB.i18n.t('ui.war.toast.power_cost', { cost: SB.economy.fmtAmt(50) });
      // 用真实 failedAction.popLost 现算，避免写死 5 与实际 1 不匹配（损失比率改后漂移）
      const expectSoldierLine = SB.i18n.t('ui.war.toast.pop_loss', { popLost: SB.economy.fmtAmt(failedAction.popLost) });
      const expectNoPower = SB.i18n.t('ui.war.toast.no_power_loss');
      const expectOfflineTag = SB.i18n.t('ui.war.toast.offline_tag');
      const expectNoLoot = SB.i18n.t('ui.war.toast.no_loot');

      /* ① 三处触发点。spy 只记录、绝不在里面 check —— war.js 的 notifyWarToast
            整段 try/catch 吞异常，断言抛错会被吞掉造成假绿。 */
      const calls = [];
      SB.ui.showWarToast = function (kind, payload, opts) {
        calls.push({ kind, payload, opts });
        return null;
      };
      let spyResult = null;
      try {
        const spyState = fixture();
        spyState.pop = 10; spyState.jobs.soldier = 10; spyState.jobs.gather = 1;
        spyState.res.kelp = 0; spyState.war.power = 1000;
        SB.rng = () => 0;
        spyResult = SB.war.executeAction(spyState, 'enemy_1', 'raid', { random: () => 0 });
        const spyOnline = fixture();
        SB.rng = () => 0.99;
        SB.war.tick(spyOnline, 1500, noop);
        SB.war.tick(spyOnline, 300, noop);
        const spyOffline = fixture();
        SB.rng = () => 0.99;
        SB.war.tick(spyOffline, 3600, noop, { deferBreakUI: true });
        SB.war.tick(spyOffline, 3600, noop, { deferBreakUI: true });
        SB.war.drainInvasionReports(spyOffline);
      } finally {
        SB.ui.showWarToast = realToast;
      }
      const actionCalls = calls.filter(c => c.kind === 'action');
      const onlineCalls = calls.filter(c => c.kind === 'invasion' && !(c.opts && c.opts.offline));
      const offlineCalls = calls.filter(c => c.kind === 'invasion' && c.opts && c.opts.offline === true);
      check('战争 toast 三处触发点：行动结算 1 次、在线入侵 ≥1 次、离线补显 1 次带 offline 标记',
        actionCalls.length === 1 && actionCalls[0].payload === spyResult &&
        onlineCalls.length >= 1 && offlineCalls.length === 1,
        JSON.stringify({ action: actionCalls.length, online: onlineCalls.length, offline: offlineCalls.length }));

      /* ② 口径核心：军力储备行三档逐字相同，军人阵亡另起一行，不混为一个量。 */
      const mFail = realToast('action', failedAction);
      const mSuccess = realToast('action', Object.assign({}, failedAction, { outcome: 'success' }));
      const mGreat = realToast('action', Object.assign({}, failedAction, { outcome: 'greatSuccess' }));
      const costRow = m => m.lines.filter(l => l.cls.indexOf('is-cost') >= 0)[0];
      check('军力储备（入场费）三档逐字相同，军人阵亡是独立一行、不与军力混写',
        !!mFail && !!costRow(mFail) &&
        costRow(mFail).text === expectCostLine &&
        costRow(mSuccess).text === costRow(mFail).text &&
        costRow(mGreat).text === costRow(mFail).text &&
        mFail.lines.filter(l => l.text === expectSoldierLine).length === 1 &&
        expectCostLine !== expectSoldierLine,
        JSON.stringify({ costRow: costRow(mFail) && costRow(mFail).text, soldiersRow: expectSoldierLine }));
      check('失败档标红且明写无战利品；大成功档标金',
        mFail.variant === 'fail' && mGreat.variant === 'great' &&
        mFail.lines.some(l => l.text === expectNoLoot),
        JSON.stringify({ fail: mFail.variant, great: mGreat.variant }));

      /* ③ 被动入侵：明说军力储备不受影响；被攻入单独加重变体。 */
      const nameKey = (SB.war.ENEMIES[0] && SB.war.ENEMIES[0].nameKey) || '';
      const repelled = { type: 'repelled', enemyNameKey: nameKey, scaleLoss: 100 };
      const breached = { type: 'success', enemyNameKey: nameKey, enemySuccessPercent: 60,
        scaleLoss: 200, penalty: { kind: 'material', resourceId: 'stone', amount: 50 } };
      const mRepel = realToast('invasion', repelled);
      const mBreach = realToast('invasion', breached);
      check('被动入侵 toast 不带军力储备扣减行，并明写军力储备不受影响',
        !!mRepel && !!mBreach &&
        mRepel.lines.some(l => l.text === expectNoPower) &&
        mBreach.lines.some(l => l.text === expectNoPower) &&
        !mRepel.lines.some(l => l.text === expectCostLine) &&
        !mBreach.lines.some(l => l.text === expectCostLine),
        JSON.stringify({ repelLines: mRepel && mRepel.lines.length, breachLines: mBreach && mBreach.lines.length }));
      check('被攻入用 breach 变体（脉冲强调），击退用 success 变体',
        mBreach.variant === 'breach' && mRepel.variant === 'success',
        JSON.stringify({ breach: mBreach.variant, repel: mRepel.variant }));

      /* ④ 离线标记 + 外交页常驻「上一次结果」行（toast 消失后仍可回看）。 */
      const mOffline = realToast('invasion', repelled, { offline: true });
      const last = SB.ui.lastWarResult();
      check('离线补显带「离线期间」标记，常驻行不等延迟弹就立即更新',
        mOffline.title.indexOf(expectOfflineTag) >= 0 &&
        !!last && last.text.indexOf(expectOfflineTag) >= 0,
        JSON.stringify({ title: mOffline.title, last: last && last.text }));
      if (SB.ui.renderParts && SB.ui.renderParts.paneWar) {
        const warHtml = SB.ui.renderParts.paneWar();
        check('外交页真实渲染出「上一次结果」常驻行与最近一次文本',
          warHtml.indexOf('war-last-result') >= 0 && warHtml.indexOf(expectOfflineTag) >= 0,
          'hasRow=' + (warHtml.indexOf('war-last-result') >= 0));
      }
      /* ⑤ 真 DOM 上屏取证：toast 挂到 #warToastStack 且变体 class 上屏。 */
      if (doc) {
        const stack = doc.getElementById('warToastStack');
        const toastEls = (stack.children || []).filter(e => e.className &&
          String(e.className).indexOf('war-toast') >= 0);
        check('toast 真实挂到 #warToastStack 且变体 class 上屏（失败/被攻入）',
          toastEls.length >= 1 && toastEls.some(e => e.classList.contains('is-fail')) &&
          toastEls.some(e => e.classList.contains('is-breach')),
          JSON.stringify({ count: toastEls.length, classes: toastEls.map(e => e.className) }));
      }
    }

    /* ===== 传承（Heritage）实装回归锁（2026-11-11） =====
     * 核心判据：传承卡不写 s.cards、不改全局 cardEffective、不因市政退役、
     * 与政策卡允许叠加、战争规则走 war.js 内部旁路、榜单状态只在 s 里。 */
    {
      const H = SB.heritage;
      const c2e = new Map(SB.CIVICS.map(c => [c.id, c.era]));
      const perStage = [1, 2, 3, 4, 5, 6, 7].map(st => H.poolForStage(st).length);
      const eras = H.poolIds().map(id => c2e.get(H.policyById(id).civic));
      check('传承：效果出口全包装、池 68 张、七阶窗逐阶 ≥3、ERA10 弃用',
        !!H && H.EFFECT_FNS.filter(k => SB.civic[k] && SB.civic[k].__heritageWrapped).length === H.EFFECT_FNS.length &&
        H.poolIds().length === 68 && perStage.every(n => n >= 3) &&
        Math.max.apply(null, eras) === 9 && Math.min.apply(null, eras) === 1,
        JSON.stringify({ fns: H.EFFECT_FNS.length, pool: H.poolIds().length, perStage }));
      check('传承：七阶 era 窗硬表 = 1-3 / 2-4 / … / 7-9',
        JSON.stringify(H.WINDOWS) === JSON.stringify([[1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9]]),
        JSON.stringify(H.WINDOWS));

      const hs = fixture();
      hs.war.power = 1e9;
      const cardsBefore = JSON.stringify(hs.cards);
      const an = SB.war.annexEnemy(hs, SB.war.currentEnemy(hs).id);
      check('吞并自动发一张三选一榜，且绝不写 s.cards（政策卡槽零污染）',
        an.ok && !!an.heritageDraft && an.heritageDraft.options.length === 3 &&
        hs.war.heritage.pending.length === 1 && hs.war.heritage.owned.length === 0 &&
        JSON.stringify(hs.cards) === cardsBefore,
        JSON.stringify({ ok: an.ok, opts: an.heritageDraft && an.heritageDraft.options.length, cards: hs.cards.length }));
      const picked = an.heritageDraft.options[0];
      check('择取走唯一入口 chooseHeritage：入 owned、清 pending、释放另两张占位',
        SB.war.chooseHeritage(hs, 0, picked) === true && H.has(hs, picked) &&
        H.pendingOf(hs).length === 0 && Object.keys(H.takenIds(hs)).length === 1,
        JSON.stringify({ owned: hs.war.heritage.owned.length, taken: Object.keys(H.takenIds(hs)).length }));

      const es = fixture();
      es.war.heritage.owned = [{ id: 'card_craft', stage: 1 }];
      const cr0 = SB.civic.cardCraftRatio(es);
      es.civics.guild = true;
      const cr1 = SB.civic.cardCraftRatio(es);
      check('效果保真且永不退役：《技艺》工坊 +0.20，完成《职业行会》后仍生效',
        Math.abs(cr0 - 0.2) < 1e-9 && Math.abs(cr1 - 0.2) < 1e-9,
        'cr0=' + cr0 + ' cr1=' + cr1);
      check('传承不改全局 cardEffective（政策卡库 UI / AI / 安那其主义不受污染）',
        es.cards.length === 0 && SB.civic.cardEffective(es, 'card_craft') === false,
        'cards=' + es.cards.length);

      const ss = fixture();
      ss.cards = ['card_drama'];
      ss.war.heritage.owned = [{ id: 'card_drama', stage: 1 }];
      check('允许与政策卡同名叠加：广场乘区 ×2 × ×2 = ×4',
        Math.abs(SB.civic.squareMul(ss) - 4) < 1e-9, 'squareMul=' + SB.civic.squareMul(ss));

      /* 影子态把 s.civics 置空会让「已退役但仍残留 s.cards」的政策卡复活，
       * 使 baseP 与 real 的生效集分叉 ⇒ 乘区增量算成 ×3。这里钉死修复。 */
      const rs = fixture();
      rs.cards = ['card_drama'];
      rs.civics.rationing = true;
      rs.war.heritage.owned = [{ id: 'card_drama', stage: 1 }];
      check('退役卡残留 s.cards 时不复活：政策卡 ×1 × 传承 ×2 = ×2（不是 ×3）',
        SB.civic.cardEffective(rs, 'card_drama') === false &&
        Math.abs(SB.civic.squareMul(rs) - 2) < 1e-9,
        'squareMul=' + SB.civic.squareMul(rs));

      const ws = fixture();
      ws.war.tradeRouteLevel = 3;
      const wse = SB.war.currentEnemy(ws);
      const wc0 = SB.war.actionCost(ws, wse, 'raid');
      ws.war.heritage.owned = [{ id: 'card_official_business', stage: 3 }];
      const wc1 = SB.war.actionCost(ws, wse, 'raid');
      check('战争规则卡走 war.js 内部旁路：《官商》商路 3 级打七折',
        Math.abs(wc1 / wc0 - 0.70) < 1e-9 && SB.civic.cardEffective(ws, 'card_official_business') === false,
        'cost ' + wc0 + '→' + wc1);

      const srcDesc = H.policyById('card_craft').desc;
      check('卡面文案另立清洗表，源 POLICIES[].desc 一字不动',
        H.descOf('card_craft').indexOf('退役') < 0 && H.descOf('card_craft').indexOf('卡槽') < 0 &&
        H.descOf('card_craft').indexOf('+20%') >= 0 &&
        srcDesc.indexOf('后退役') >= 0 && srcDesc.indexOf('装在卡槽里才生效') >= 0,
        H.descOf('card_craft'));

      const fs2 = fixture();
      fs2.war.power = 1e9;
      SB.war.annexEnemy(fs2, SB.war.currentEnemy(fs2).id);
      const draft = SB.ui.showHeritageDraft(fs2);
      const hLayer = doc ? doc.getElementById('heritageDraftLayer') : null;
      const drawn = !!hLayer && (hLayer.children || []).length > 0;
      SB.ui.closeHeritageDraft();
      check('独立浮层渲染三选一；关闭不丢榜单（状态只在 s，不随重画消失）',
        !!draft && draft.options.length === 3 && drawn &&
        !SB.ui.heritageDraftOpen() && fs2.war.heritage.pending.length === 1,
        JSON.stringify({ opts: draft && draft.options.length, drawn, pending: fs2.war.heritage.pending.length }));

      const prevRun = SB.game.run;
      SB.game.run = () => fs2;
      fs2.war.heritage.owned = [{ id: 'card_drama', stage: 2 }];
      const warHtml2 = SB.ui.renderParts.paneWar();
      fs2.war.campaignStage = 7;
      const doneHtml = SB.ui.renderParts.paneWar();
      SB.game.run = prevRun;
      check('外交页收藏墙上屏：状态条 / 阶数戳 / 已生效 / 清洗后文案',
        warHtml2.indexOf('heritage-wall') >= 0 && warHtml2.indexOf('heritage-card-stage') >= 0 &&
        warHtml2.indexOf('已生效') >= 0 && warHtml2.indexOf(H.descOf('card_drama')) >= 0,
        'len=' + warHtml2.length);
      check('七阶吞完（currentEnemy=null）的完成分支仍挂收藏墙',
        doneHtml.indexOf('heritage-wall') >= 0 && doneHtml.indexOf('heritage-card-stage') >= 0,
        'len=' + doneHtml.length);

      const migrated = SB.state.migrateRun({ res: {}, techs: {}, lvl: {}, civics: {},
        war: { heritage: {
          owned: [{ id: 'card_drama', stage: 99 }, { id: '__evil__', stage: 1 }, { id: 'card_drama', stage: 1 }],
          pending: [{ stage: -5, options: ['card_craft', '__evil__', 'card_craft'] }]
        } } });
      check('读档迁移：68 张 id 白名单 + stage clamp + 去重，脏档注入被挡住',
        migrated.war.heritage.owned.length === 1 && migrated.war.heritage.owned[0].stage === 7 &&
        migrated.war.heritage.pending.length === 1 && migrated.war.heritage.pending[0].stage === 1 &&
        migrated.war.heritage.pending[0].options.length === 1,
        JSON.stringify(migrated.war.heritage));
      const freshH = SB.state.freshRun(false).war.heritage;
      check('freshRun 登记 heritage，新局为空（轮回自动清零）',
        !!freshH && freshH.owned.length === 0 && freshH.pending.length === 0,
        JSON.stringify(freshH));
    }
  } finally {
    SB.game.run = oldRun;
    SB.game.markDirty = oldMarkDirty;
    SB.rng = oldRng;
  }
}
