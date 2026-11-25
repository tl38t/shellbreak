/* 星屑炼金：双向批量兑换回归锁（2026-11-15）
 *
 * ⚠️ 本套件**只写不跑**：用户 2026-11-15 09:14 明令「别跑 e2e，等我说跑再跑」，
 *    全量与 --xxx-only 单套件都须等当次明说「跑」。下面的断言只是先落盘。
 *
 * 钉死的三件事：
 *   ① 方向不对称，别搞反：
 *      正向 tide-to-stardust = 消耗 10 轮回点 → 得 1 星屑，钳制 floor(tide / 10)；
 *      反向 stardust-to-tide = 消耗 1 星屑 → 得 10 轮回点，钳制 floor(stardust / 1)。
 *   ② 汇率只在 CFG.STARDUST_EXCHANGE 一处；展示、钳制、扣费必须联动（改常量即变）。
 *   ③ 反向台账残差 -10/笔是**既有口径、本次刻意不补**，别有人顺手「修」成守恒。
 *
 * 不 mock SB：夹具只改 SB.game.meta() 账本字段 / 临时替换 saveMeta / 临时改 CFG，
 * 全部走 prestige.* 与 ui.render.paneStarDome() 生产路径；try/finally 里逐项还原。
 */
export function run({ SB, check, sandbox }) {
  console.log('\n=== 星屑炼金：双向批量兑换 ===');
  const P = SB.prestige, R = SB.ui.render;
  const meta = SB.game.meta();
  const origSave = SB.state.saveMeta;
  const cfg = SB.CFG.STARDUST_EXCHANGE;
  const keepMeta = {
    tide: meta.tide, stardust: meta.stardust, spent: meta.spent,
    tideEarnedTotal: meta.tideEarnedTotal, stardustEarned: meta.stardustEarned
  };
  const keepRate = { tidePerStardust: cfg.tidePerStardust, stardustPerBatch: cfg.stardustPerBatch };
  const startStep = R.exchangeStep();
  let saveCalls = 0;
  SB.state.saveMeta = function (m) { saveCalls++; return origSave(m); };

  /* 每个场景重置成「初始结算得 1000 点、10 星屑」的干净账本，残差 0。 */
  function reset(extra) {
    meta.tide = 1000; meta.stardust = 10; meta.spent = 0;
    meta.tideEarnedTotal = 1000; meta.stardustEarned = 10;
    if (extra) for (const k in extra) meta[k] = extra[k];
    saveCalls = 0;
  }
  function residual() {
    return (meta.tideEarnedTotal || 0) - (meta.tide || 0) - (meta.spent || 0);
  }
  function backToStepOne() {
    for (let i = 0; i < 8 && R.exchangeStep() !== 1; i++) R.cycleExchangeStep();
  }

  try {
    /* ── ① 汇率单一落点 + 方向 ───────────────────────────────── */
    const rate = P.exchangeRate();
    check('CFG.STARDUST_EXCHANGE 存在且为 10 轮回点 ⇄ 1 星屑',
      !!cfg && rate.tide === 10 && rate.sd === 1 && cfg.tidePerStardust === 10 && cfg.stardustPerBatch === 1,
      JSON.stringify({ cfg, rate }));
    check('exchangeMaxCount 正向按轮回点：tide 105 → 10 笔',
      P.exchangeMaxCount({ tide: 105, stardust: 0 }, 'tide-to-stardust') === 10);
    check('exchangeMaxCount 反向按星屑：stardust 7 → 7 笔（不与正向共用基数）',
      P.exchangeMaxCount({ tide: 0, stardust: 7 }, 'stardust-to-tide') === 7);
    /* 改常量联动：证明展示/钳制/扣费没有第二份写死的 10 / 1。 */
    cfg.tidePerStardust = 8;
    check('改 CFG 汇率后 exchangeRate / exchangeMaxCount 联动（无硬编码 10）',
      P.exchangeRate().tide === 8 && P.exchangeMaxCount({ tide: 105, stardust: 0 }, 'tide-to-stardust') === 13,
      'rate=' + P.exchangeRate().tide + ' cap=' + P.exchangeMaxCount({ tide: 105, stardust: 0 }, 'tide-to-stardust'));
    reset();
    const got8 = P.exchangeTideForStardust(1);
    check('改 CFG 后单笔扣费也联动：扣 8 点 / 得 1 星屑',
      got8 === 1 && meta.tide === 992 && meta.stardust === 11 && meta.spent === 8,
      'got=' + got8 + ' tide=' + meta.tide + ' sd=' + meta.stardust + ' spent=' + meta.spent);
    cfg.tidePerStardust = keepRate.tidePerStardust;

    /* ── ② 单笔：旧调用方零参数行为不变 ───────────────────────── */
    reset();
    const oneT2S = P.exchangeTideForStardust();
    check('正向单笔（不传 n）：返回 1，扣 10 点 / spent +10 / 得 1 星屑',
      oneT2S === 1 && meta.tide === 990 && meta.spent === 10 && meta.stardust === 11,
      JSON.stringify({ oneT2S, tide: meta.tide, spent: meta.spent, sd: meta.stardust }));
    check('正向不写 stardustEarned（排行榜/尤里卡口径）', meta.stardustEarned === 10,
      'stardustEarned=' + meta.stardustEarned);
    reset();
    const oneS2T = P.exchangeStardustForTide();
    check('反向单笔（不传 n）：返回 1，扣 1 星屑 / 得 10 点，spent 不动',
      oneS2T === 1 && meta.stardust === 9 && meta.tide === 1010 && meta.spent === 0,
      JSON.stringify({ oneS2T, tide: meta.tide, spent: meta.spent, sd: meta.stardust }));
    check('反向单笔台账残差 −10（既有口径，本次不补）', residual() === -10, 'residual=' + residual());

    /* ── ③ 批量：两侧各按自己的方向换算 ─────────────────────── */
    reset();
    const t10 = P.exchangeTideForStardust(10);
    check('正向 ×10：扣 100 轮回点 → 得 10 星屑，返回 10',
      t10 === 10 && meta.tide === 900 && meta.spent === 100 && meta.stardust === 20,
      JSON.stringify({ t10, tide: meta.tide, spent: meta.spent, sd: meta.stardust }));
    check('正向 ×10 台账守恒（残差 0）', residual() === 0, 'residual=' + residual());
    check('正向 ×10 只落盘一次（不在循环里写存档）', saveCalls === 1, 'saveCalls=' + saveCalls);

    reset();
    const s10 = P.exchangeStardustForTide(10);
    check('反向 ×10：扣 10 星屑 → 得 100 轮回点，返回 10（方向不写反）',
      s10 === 10 && meta.stardust === 0 && meta.tide === 1100 && meta.spent === 0,
      JSON.stringify({ s10, tide: meta.tide, spent: meta.spent, sd: meta.stardust }));
    check('反向 ×10 台账残差 −100（把既有漂移按笔数放大，已知不修）',
      residual() === -100, 'residual=' + residual());
    check('反向 ×10 也只落盘一次', saveCalls === 1, 'saveCalls=' + saveCalls);
    check('反向不写 stardustEarned', meta.stardustEarned === 10, 'stardustEarned=' + meta.stardustEarned);

    /* ── ④ 「全部」档与钳制 ─────────────────────────────────── */
    reset({ tide: 105, stardust: 0 });
    const allT = P.exchangeTideForStardust(Infinity);
    check('正向「全部」：105 点 → 10 笔，余 5 点 / 得 10 星屑',
      allT === 10 && meta.tide === 5 && meta.stardust === 10 && meta.spent === 100,
      JSON.stringify({ allT, tide: meta.tide, sd: meta.stardust, spent: meta.spent }));
    reset({ tide: 0, stardust: 7 });
    const allS = P.exchangeStardustForTide(Infinity);
    check('反向「全部」：7 星屑 → 7 笔，余 0 星屑 / 得 70 点',
      allS === 7 && meta.stardust === 0 && meta.tide === 70,
      JSON.stringify({ allS, tide: meta.tide, sd: meta.stardust }));
    reset({ tide: 25, stardust: 0 });
    const clamped = P.exchangeTideForStardust(100);
    check('×100 档余额不足时钳到可成交笔数：25 点 → 2 笔，余 5 点',
      clamped === 2 && meta.tide === 5 && meta.stardust === 2,
      JSON.stringify({ clamped, tide: meta.tide, sd: meta.stardust }));
    reset({ tide: 9, stardust: 0 });
    const zero = P.exchangeTideForStardust(Infinity);
    check('余额不足 1 笔 → 返回 0，账本不动、零落盘',
      zero === 0 && meta.tide === 9 && meta.stardust === 0 && meta.spent === 0 && saveCalls === 0,
      JSON.stringify({ zero, tide: meta.tide, sd: meta.stardust, saveCalls }));
    reset({ tide: 0, stardust: 1000 });
    P.exchangeTideForStardust(Infinity);
    check('方向不混淆：正向不会扣星屑（星屑充足但轮回点为 0 时仍不成交）',
      meta.stardust === 1000 && meta.tide === 0, 'sd=' + meta.stardust + ' tide=' + meta.tide);
    reset({ tide: 1000, stardust: 0 });
    P.exchangeStardustForTide(Infinity);
    check('方向不混淆：反向不会扣轮回点（轮回点充足但星屑为 0 时仍不成交）',
      meta.tide === 1000 && meta.stardust === 0, 'tide=' + meta.tide + ' sd=' + meta.stardust);

    /* ── ⑤ 步长档位：×1 → ×10 → ×100 → 全部 → ×1 ────────────── */
    backToStepOne();
    const steps = [R.exchangeStep()];
    for (let i = 0; i < 4; i++) { R.cycleExchangeStep(); steps.push(R.exchangeStep()); }
    check('档位循环 ×1 → ×10 → ×100 → 全部(Infinity) → ×1',
      steps.length === 5 && steps[0] === 1 && steps[1] === 10 && steps[2] === 100 &&
      steps[3] === Infinity && steps[4] === 1, JSON.stringify(steps));
    check('档位标签不出现 ×Infinity', R.exchangeStepLabel().indexOf('Infinity') < 0,
      'label=' + R.exchangeStepLabel());
    R.cycleExchangeStep(); R.cycleExchangeStep(); R.cycleExchangeStep();
    check('「全部」档标签为「全部」', R.exchangeStepLabel() === '全部',
      'label=' + R.exchangeStepLabel());
    backToStepOne();

    /* ── ⑥ 真实 DOM：胶囊 / ⓘ / 两向按钮 / 本批小结 ───────────── */
    reset({ tide: 1000, stardust: 10 });
    R.cycleExchangeStep();   // ×10
    const html = R.paneStarDome();
    check('真实 DOM：批量档位胶囊与手机端 ⓘ 上屏',
      html.indexOf('data-exchange-step="1"') >= 0 && html.indexOf('hover-info-btn') >= 0 &&
      html.indexOf('>×10</button>') >= 0, 'htmlLen=' + html.length);
    check('真实 DOM：两个方向的兑换按钮都在且方向属性正确',
      html.indexOf('data-star-exchange="tide-to-stardust"') >= 0 &&
      html.indexOf('data-star-exchange="stardust-to-tide"') >= 0);
    check('真实 DOM：正向本批小结是「消耗 100 轮回点 → 获得 10 星屑」（方向不写反）',
      html.indexOf('本批 10 笔：消耗 100 轮回点 → 获得 10 星屑') >= 0,
      'hint=' + (html.match(/本批 10 笔：[^<]*/) || [])[0]);
    check('真实 DOM：反向本批小结是「消耗 10 星屑 → 获得 100 轮回点」（方向不写反）',
      html.indexOf('本批 10 笔：消耗 10 星屑 → 获得 100 轮回点') >= 0);
    check('真实 DOM：按钮写「兑换 ×10」而非单笔「兑换」',
      (html.match(/兑换 ×10/g) || []).length === 2,
      'count=' + (html.match(/兑换 ×10/g) || []).length);
    reset({ tide: 0, stardust: 0 });
    const html0 = R.paneStarDome();
    check('真实 DOM：余额为 0 时两按钮 disabled 且带「余额不足」提示',
      (html0.match(/disabled title="余额不足，无法兑换"/g) || []).length === 2 &&
      (html0.match(/兑换 ×0/g) || []).length === 2,
      'disabled=' + (html0.match(/disabled title="余额不足，无法兑换"/g) || []).length);
    backToStepOne();

    /* ── ⑦ 滑动条确认弹窗：openStarExchangeModal ─────────────── */
    if (sandbox && sandbox.document && sandbox.document.getElementById) {
      reset({ tide: 250, stardust: 3 });
      const doc = sandbox.document;
      const modal = doc.getElementById('modal');
      const box = doc.getElementById('modalBox');
      const fake = {
        starExchangeRange: { value: '1', oninput: null },
        starExchangeNum: { value: '1', oninput: null, onchange: null, onkeydown: null },
        starExchangePreview: { innerHTML: '' },
        starExchangePresets: { addEventListener() {}, querySelectorAll() { return []; } },
        starExchangeConfirm: { onclick: null },
        starExchangeCancel: { onclick: null }
      };
      const origGet = doc.getElementById.bind(doc);
      doc.getElementById = (id) => (fake[id] || origGet(id));
      try {
        const opened = R.openStarExchangeModal('tide-to-stardust');
        check('滑动条弹窗可正常打开且预渲染 range max="25"',
          opened === true && modal && !modal.classList.contains('hidden') &&
          box.innerHTML.indexOf('id="starExchangeRange"') >= 0 &&
          box.innerHTML.indexOf('max="25"') >= 0,
          'opened=' + opened);
        fake.starExchangeRange.value = '12';
        if (fake.starExchangeRange.oninput) fake.starExchangeRange.oninput();
        check('拖动滑动条到 12 笔 ⇒ 同步输入框并实时预览「消耗 120 轮回点 → 获得 12 星屑」',
          fake.starExchangeNum.value === '12' &&
          fake.starExchangePreview.innerHTML.indexOf('120 轮回点 → 获得 12 星屑') >= 0,
          fake.starExchangePreview.innerHTML);
        if (fake.starExchangeConfirm.onclick) fake.starExchangeConfirm.onclick();
        check('点击确认兑换 ⇒ 按滑动条数量入账并关闭弹窗',
          meta.tide === 130 && meta.stardust === 15 && modal.classList.contains('hidden'),
          JSON.stringify({ tide: meta.tide, sd: meta.stardust }));
      } finally {
        doc.getElementById = origGet;
        if (modal && modal.classList) modal.classList.add('hidden');
      }
    }
  } finally {
    /* 逐项还原：账本、汇率、落盘函数、步长视图态。 */
    for (const k in keepMeta) meta[k] = keepMeta[k];
    cfg.tidePerStardust = keepRate.tidePerStardust;
    cfg.stardustPerBatch = keepRate.stardustPerBatch;
    SB.state.saveMeta = origSave;
    for (let i = 0; i < 8 && R.exchangeStep() !== startStep; i++) R.cycleExchangeStep();
    origSave(meta);
  }
}
