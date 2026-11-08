/* e2e suite: 兑换码（2026-11-07 起：本地礼包码，零网络）
 *
 * 背景：TapTap TDS 平台通兑码通道整体下线（送审包被静态扫描判「含联网功能 → 需 ICP 核准」）。
 * 原套件里那 30 条测签名 / 请求体 / 错误码 / 超时 / 并发的断言随功能一并移除；
 * 「账本自洽」这条最重要的判据迁移到本地 tide 码上继续钉。现在钉的是：
 *
 *   ① ★ **包内不再有联网能力**：api 为空串、platformReady() 恒 false（填回 ID 也不复活）、
 *      fetch 桩全程零调用、连没有 fetch 的环境都能正常兑换。
 *   ② **账本自洽**（本套最重要的一条）：入账必须同时写 `tide` 与 `tideEarnedTotal`。
 *      定损方程 `tide = tideEarnedTotal − spent + 10M`，残差
 *      `residual = tideEarnedTotal − tide − spent` 在任何合法操作下都不变。
 *      只加 tide 会让 residual 掉 −N ⇒ 下次对账把「补偿」当成「又丢了 N 点」。
 *   ③ **星屑只加余额**：不许写 stardustEarned（会同时抬高排行榜与尤里卡进度）。
 *   ④ **防重**：大小写、空格、连字符归一化后仍是同一个码，不许二次入账。
 *   ⑤ **入口门控**：一个本地码都没配时整块隐藏（连标题），配了就照常显示。
 *
 * ⚠️ 夹具纪律：装一个「一被调用就抛」的 fetch 桩并计数，跑完必须还原
 *   （CFG / meta / fetch / 面板），否则后续套件会看到一个被改过的世界。
 */
export async function run({ SB, check, sandbox, doc, g }) {
  console.log('\n=== 兑换码（本地礼包码 / 零网络）===');
  const R = SB.redeem;
  if (!R) {
    check('SB.redeem 已随 index.html 加载', false, 'SB.redeem 不存在');
    return;
  }
  check('SB.redeem 已随 index.html 加载', true);

  /* ── ① 通道下线锚点（防止平台兑换偷偷复活）── */
  check('★ 不再有外部接口地址（api 为空串）', R.api === '', String(R.api));
  check('★ platformReady() 恒 false', R.platformReady() === false, String(R.platformReady()));
  const RC = SB.CFG.REDEEM;
  const savedIDs = { CLIENT_ID: RC.CLIENT_ID, ACTIVITY_ID: RC.ACTIVITY_ID };
  check('★ CFG 里平台两项默认留空', RC.CLIENT_ID === '' && RC.ACTIVITY_ID === '',
    RC.CLIENT_ID + ' / ' + RC.ACTIVITY_ID);
  RC.CLIENT_ID = 'probe_client_1'; RC.ACTIVITY_ID = 'act_probe';
  check('★ 即使把平台两项 ID 填回去，平台通道仍不可用', R.platformReady() === false,
    String(R.platformReady()));
  RC.CLIENT_ID = savedIDs.CLIENT_ID; RC.ACTIVITY_ID = savedIDs.ACTIVITY_ID;

  /* ── ② SHA-1 向量（本地码的哈希校验仍依赖它，不许一起删）── */
  const VEC = [
    ['', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ['The quick brown fox jumps over the lazy dog', '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12'],
    ['1793348240K7M2Pab12cd34', '982e6df47cb59e033fca3bce3f99bbd677c062ac'],
    ['SBTEST120POINTS', '249c49f2a56873bb0dec31d822643200545a0d4a']
  ];
  let vecOK = 0;
  for (const [inp, want] of VEC) if (R.sha1(inp) === want) vecOK++;
  check('sha1 与规范向量逐字一致（5/5）', vecOK === 5, vecOK + '/5');
  check('sha1 对中文不崩且长度恒 40', R.sha1('天壳补偿').length === 40, R.sha1('天壳补偿'));

  /* ── ③ 归一化 ── */
  check('归一化：去空格 + 连字符', R.normalize(' krv-pcacr 334es ') === 'krvpcacr334es',
    R.normalize(' krv-pcacr 334es '));
  check('归一化：下划线也去掉', R.normalize('ab_cd') === 'abcd', R.normalize('ab_cd'));
  check('防重键转大写：同一码换大小写/加连字符视为同一个',
    R.dedupeKey('KRVP-CACR 334ES') === 'KRVPCACR334ES' &&
    R.dedupeKey('krvpcacr334es') === 'KRVPCACR334ES',
    R.dedupeKey('KRVP-CACR 334ES'));

  /* ── 夹具：fetch 桩 + 改 CFG（全部在 finally 里还原）── */
  const savedCfg = { CLIENT_ID: RC.CLIENT_ID, ACTIVITY_ID: RC.ACTIVITY_ID, REWARD_NUM: RC.REWARD_NUM,
    LOCAL_GRANTS: RC.LOCAL_GRANTS };
  const hadFetch = Object.prototype.hasOwnProperty.call(sandbox, 'fetch');
  const savedFetch = sandbox.fetch;
  const m = SB.game.meta();
  const savedMeta = {
    tide: m.tide, tideEarnedTotal: m.tideEarnedTotal, spent: m.spent,
    compensationTotal: m.compensationTotal, redeemed: m.redeemed, installId: m.installId,
    stardust: m.stardust, stardustEarned: m.stardustEarned, stardustShopUnlocked: m.stardustShopUnlocked
  };

  let calls = [];
  function trapFetch(url) {
    calls.push(String(url));
    return Promise.reject(new Error('不该联网：平台兑换通道已下线'));
  }
  sandbox.fetch = trapFetch;

  /* 定损方程残差：任何合法入账都不许改变它。 */
  const residual = () => (Number(m.tideEarnedTotal) || 0) - (Number(m.tide) || 0) - (Number(m.spent) || 0);
  function resetLedger() {
    m.tide = 0; m.tideEarnedTotal = 0; m.spent = 0;
    m.compensationTotal = 0; m.redeemed = {};
    m.stardust = 0; m.stardustEarned = 0; m.stardustShopUnlocked = false;
    calls = [];
  }

  try {
    /* ── ④ 一个码都没配 ⇒ 入口整块隐藏、兑换拒绝、零请求 ── */
    resetLedger();
    const savedLocal = RC.LOCAL_GRANTS;
    RC.LOCAL_GRANTS = [];
    check('未配本地码时 ready() 为假', R.ready() === false, String(R.ready()));
    let r = await R.redeem('ABCD1234');
    check('未配本地码 ⇒ 拒绝且一个请求都不发', r.ok === false && calls.length === 0, r.msg);
    R.boot();
    check('未配本地码 ⇒ 设置里整块隐藏（不留死按钮）',
      doc.getElementById('redeemSettingBlock').style.display === 'none',
      String(doc.getElementById('redeemSettingBlock').style.display));

    /* ── ⑤ 配了本地码 ⇒ 入口照常显示（临时发福利时不能找不到输入框）── */
    RC.LOCAL_GRANTS = [{ code: 'GATEKEEPER', stardust: 1, label: '门控探针' }];
    check('配了本地码 ⇒ ready() 为真', R.ready() === true, String(R.ready()));
    R.boot();
    check('配了本地码 ⇒ 入口照常显示',
      doc.getElementById('redeemSettingBlock').style.display === '',
      String(doc.getElementById('redeemSettingBlock').style.display));
    check('入口按钮接上 open()',
      typeof doc.getElementById('btnSettingsRedeem').onclick === 'function');

    /* ── ⑥ 本地 tide 码：账本自洽（原平台段最重要的判据迁到这里）── */
    RC.LOCAL_GRANTS = [{ code: 'LOCALTIDE120', tide: 120, label: '轮回点礼包' }];
    resetLedger();
    const before = residual();
    r = await R.redeem(' local-tide 120 ');
    check('本地 tide 码兑换成功并返回点数', r.ok === true && r.tide === 120, r.msg);
    check('★ 全程零 fetch（平台通道确实没有复活）', calls.length === 0, String(calls.length));
    check('tide +120', m.tide === 120, String(m.tide));
    check('tideEarnedTotal 同步 +120（只加 tide 会让对账把补偿当成新缺口）',
      m.tideEarnedTotal === 120, String(m.tideEarnedTotal));
    check('compensationTotal 记账 +120', m.compensationTotal === 120, String(m.compensationTotal));
    check('★ 定损方程残差不变（补偿没有伪造出新缺口）', residual() === before,
      'before=' + before + ' after=' + residual());
    check('meta.redeemed 记下这个码与数量（键是大写防重键）',
      !!m.redeemed && !!m.redeemed.LOCALTIDE120 && m.redeemed.LOCALTIDE120.n === 120,
      JSON.stringify(m.redeemed));
    if (SB.state && SB.state.saveMeta && SB.state.loadMeta) {
      SB.state.saveMeta(m);
      const back = SB.state.loadMeta();
      check('存盘→读回：redeemed 与 compensationTotal 都还在',
        !!back.redeemed && !!back.redeemed.LOCALTIDE120 && back.compensationTotal === 120,
        JSON.stringify({ redeemed: back.redeemed, comp: back.compensationTotal }));
      check('存盘→读回：tideEarnedTotal 不被改写成 tide+spent',
        back.tideEarnedTotal === 120, String(back.tideEarnedTotal));
    }
    const tideAfter = m.tide;
    r = await R.redeem('LOCAL-TIDE-120');
    check('同一个码（换大小写/连字符）不许二次入账',
      r.ok === false && m.tide === tideAfter && /领过/.test(r.msg), r.msg);

    /* ── ⑦ 本地星屑码：余额加、统计不加 ── */
    const LOCALSTAR = 'LOCALSTAR50';
    RC.LOCAL_GRANTS = [{ code: LOCALSTAR, stardust: 50, label: '星屑礼包' }];
    resetLedger();
    r = await R.redeem('local-star-50');
    check('本地星屑码命中即成功（大小写/连字符不影响）', r.ok === true && r.stardust === 50, r.msg);
    check('★ 本地码一个网络请求都不发', calls.length === 0, String(calls.length));
    check('星屑余额 +50', m.stardust === 50, String(m.stardust));
    check('★ stardustEarned 不变（白送的星屑不许抬高排行榜与尤里卡）',
      m.stardustEarned === 0, String(m.stardustEarned));
    check('顺手解锁星屑商店（有余额却进不去是死路）', m.stardustShopUnlocked === true);
    check('本地码也进 meta.redeemed 防重表（记 s=星屑数）',
      !!m.redeemed[LOCALSTAR] && m.redeemed[LOCALSTAR].s === 50,
      JSON.stringify(m.redeemed[LOCALSTAR]));
    const stardustAfter = m.stardust;
    r = await R.redeem(LOCALSTAR);
    check('本地码不许二次领取', r.ok === false && /领过/.test(r.msg) && m.stardust === stardustAfter, r.msg);

    /* ── ⑧ 哈希码（包里只有 h，不放明文）── */
    const HASHED = 'HASHSTAR25';
    RC.LOCAL_GRANTS = [{ h: R.localHash(HASHED), stardust: 25, label: '哈希礼包' }];
    resetLedger();
    check('哈希项 h 与 localHash(明文) 一致', R.findLocal(HASHED) !== null, R.localHash(HASHED));
    r = await R.redeem('hash-star-25');
    check('哈希码兑换成功（明文不在配置里）', r.ok === true && r.stardust === 25, r.msg);
    r = await R.redeem('HASHSTAR25');
    check('哈希码同样防重', r.ok === false && /领过/.test(r.msg), r.msg);

    /* ── ⑨ 未命中 ⇒ 判「码无效」，绝不落到平台 ── */
    r = await R.redeem('NOTLOCAL1');
    check('未命中的码判「无效」（而不是联网失败/配置错误）',
      r.ok === false && /无效/.test(r.msg), r.msg);
    check('未命中时余额没动', m.stardust === 25, String(m.stardust));
    check('未命中也不发请求', calls.length === 0, String(calls.length));

    /* 奖励为 0 的条目不许发空气。 */
    RC.LOCAL_GRANTS = [{ code: 'EMPTY001', label: '空' }];
    check('奖励为 0 的本地条目被忽略', R.localGrants().length === 0, R.localGrants().length);

    /* ── ⑩ 连 fetch 能力都没有的环境：照样能领 ── */
    RC.LOCAL_GRANTS = [{ code: 'NOFETCH50', stardust: 5, label: '无网络能力档' }];
    resetLedger();
    delete sandbox.fetch;
    r = await R.redeem('NOFETCH50');
    check('★ 环境完全没有 fetch ⇒ 本地码仍然能领', r.ok === true && r.stardust === 5, r.msg);
    sandbox.fetch = trapFetch;

    /* ── ⑪ 面板：真的能打开、能关掉 ── */
    RC.LOCAL_GRANTS = savedLocal;
    R.open();
    check('面板打开后 #modal 不再 hidden',
      doc.getElementById('modal').classList.contains('hidden') === false);
    check('面板里有输入框与兑换按钮',
      g('modalBox').indexOf('id="redeemCode"') >= 0 && g('modalBox').indexOf('id="redeemGo"') >= 0);
    check('面板里的累计行常驻（空则 CSS :empty 隐藏，不靠插节点）',
      g('modalBox').indexOf('id="redeemUsed"') >= 0);
    if (SB.ui && SB.ui.render && SB.ui.render.hideModal) SB.ui.render.hideModal();
    check('面板能关掉', doc.getElementById('modal').classList.contains('hidden') === true);

    check('★ 整轮兑换流程网络请求数 = 0', calls.length === 0, String(calls.length));
  } finally {
    /* 还原世界：CFG、meta、fetch、面板。漏一个后续套件就会跑在被改过的状态上。 */
    RC.CLIENT_ID = savedCfg.CLIENT_ID; RC.ACTIVITY_ID = savedCfg.ACTIVITY_ID; RC.REWARD_NUM = savedCfg.REWARD_NUM;
    RC.LOCAL_GRANTS = savedCfg.LOCAL_GRANTS;
    m.tide = savedMeta.tide; m.tideEarnedTotal = savedMeta.tideEarnedTotal; m.spent = savedMeta.spent;
    m.compensationTotal = savedMeta.compensationTotal; m.redeemed = savedMeta.redeemed;
    m.stardust = savedMeta.stardust; m.stardustEarned = savedMeta.stardustEarned;
    m.stardustShopUnlocked = savedMeta.stardustShopUnlocked;
    if (savedMeta.installId === undefined) delete m.installId; else m.installId = savedMeta.installId;
    if (hadFetch) sandbox.fetch = savedFetch; else delete sandbox.fetch;
    if (SB.ui && SB.ui.render && SB.ui.render.hideModal) SB.ui.render.hideModal();
    R.boot();
  }
}
