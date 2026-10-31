/* e2e suite: 兑换码（2026-10-30 · TapTap TDS 无服务器礼包，用于发放轮回点补偿）
 *
 * 这条链路是全游戏**唯一**一处「依赖外部网络」的功能，也是最容易出「看起来成功、
 * 实际账本已经歪了」的地方。所以这里钉的不是「点了有反应」，而是：
 *
 *   ① **签名逐字节正确**：sha1 是自己实现的（不能用 crypto.subtle，非安全上下文没有）。
 *      算法错一位 ⇒ 线上全部兑换失败，而在本地看起来一切正常。用规范向量钉死。
 *   ② ★ **账本自洽**（本套最重要的一条）：入账必须同时写 `tide` 与 `tideEarnedTotal`。
 *      定损方程是 `tide = tideEarnedTotal − spent + 10M`，残差
 *      `residual = tideEarnedTotal − tide − spent` 在**任何合法操作下都不变**。
 *      只加 tide 会让 residual 掉 −120 ⇒ 下次对账把「补偿」当成「又丢了 120 点」
 *      ⇒ 重复补偿，且已经发给玩家、收不回来。
 *   ③ **失败不核销**：网络断 / 平台报错 / 码不属于本活动 —— 状态一个字节都不动，
 *      玩家可以原样重试（码没有被平台用掉）。
 *   ④ **重复领取**：大小写、空格、连字符归一化后仍是同一个码，不许二次入账。
 *   ⑤ 奖励数**读 CFG**，不许把 120 写死在代码里（改档位只改一处）。
 *
 * ⚠️ 夹具纪律：`SB.redeem` 在调用时才读 `root.fetch`，所以这里能就地装桩；
 *   跑完必须还原（删 fetch / 复原 CFG 与 meta），否则后续套件会看到一个被改过的世界。
 */
export async function run({ SB, check, sandbox, doc, g }) {
  console.log('\n=== 兑换码（TDS 无服务器礼包 / 补偿发放）===');
  const R = SB.redeem;
  if (!R) {
    check('SB.redeem 已随 index.html 加载', false, 'SB.redeem 不存在');
    return;
  }
  check('SB.redeem 已随 index.html 加载', true);
  check('接口地址与评审过的那个一致',
    R.api === 'https://poster-api.xd.cn/api/v1.0/cdk/game/submit-simple', R.api);

  /* ── ① SHA-1 向量（前三组是公开规范向量，第四组是真实签名串）── */
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

  /* ── ② 归一化 ──
   * ⚠️ 这一组的语义 2026-10-30 改过：原来钉的是「转大写」，现在必须钉「**保留大小写**」。
   *   TDS 随机生成的券码是大小写混排的 13 位串（本活动那颗实际是全小写 krvpcacr334es），
   *   转大写再发出去，平台一旦大小写敏感就是全员 100016。桩不管大小写，所以这条只能靠
   *   断言钉住「发出去的字节 == 玩家输入的字节」。 */
  check('归一化：去空格 + 连字符，且**保留大小写**（转大写会让平台认不出码）',
    R.normalize(' krv-pcacr 334es ') === 'krvpcacr334es', R.normalize(' krv-pcacr 334es '));
  check('归一化：下划线也去掉', R.normalize('ab_cd') === 'abcd', R.normalize('ab_cd'));
  check('防重键仍转大写：同一码换大小写/加连字符视为同一个',
    R.dedupeKey('KRVP-CACR 334ES') === 'KRVPCACR334ES' &&
    R.dedupeKey('krvpcacr334es') === 'KRVPCACR334ES',
    R.dedupeKey('KRVP-CACR 334ES'));

  /* ── 夹具：装 fetch 桩 + 改 CFG（全部在 finally 里还原）── */
  const RC = SB.CFG.REDEEM;
  const savedCfg = { CLIENT_ID: RC.CLIENT_ID, ACTIVITY_ID: RC.ACTIVITY_ID, REWARD_NUM: RC.REWARD_NUM };
  const hadFetch = Object.prototype.hasOwnProperty.call(sandbox, 'fetch');
  const savedFetch = sandbox.fetch;
  const m = SB.game.meta();
  const savedMeta = {
    tide: m.tide, tideEarnedTotal: m.tideEarnedTotal, spent: m.spent,
    compensationTotal: m.compensationTotal, redeemed: m.redeemed, installId: m.installId
  };

  let calls = [];
  let responder = () => ({ success: true, error: 0, activity_id: 'act_probe' });
  sandbox.fetch = function (url, opts) {
    calls.push({ url: url, opts: opts, body: JSON.parse(opts.body) });
    let r;
    try { r = responder(); } catch (e) { return Promise.reject(e); }
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve({ json: function () { return Promise.resolve(r); } });
  };

  /* 定损方程残差：任何合法入账都不许改变它（见文件头 ②）。 */
  const residual = () => (Number(m.tideEarnedTotal) || 0) - (Number(m.tide) || 0) - (Number(m.spent) || 0);
  function resetLedger() {
    m.tide = 0; m.tideEarnedTotal = 0; m.spent = 0;
    m.compensationTotal = 0; m.redeemed = {};
    calls = [];
  }

  try {
    /* ── ③ 未配置 ⇒ 不开网络、不写状态（按钮也整块不显示）── */
    resetLedger();
    RC.CLIENT_ID = ''; RC.ACTIVITY_ID = ''; RC.REWARD_NUM = 120;
    check('未配置时 ready() 为假', R.ready() === false);
    let r = await R.redeem('ABCD1234');
    check('未配置 ⇒ 拒绝且一个请求都不发', r.ok === false && calls.length === 0, r.msg);
    R.boot();
    check('未配置 ⇒ 设置里整块隐藏（不留死按钮）',
      doc.getElementById('redeemSettingBlock').style.display === 'none',
      String(doc.getElementById('redeemSettingBlock').style.display));

    /* ── ④ 配好之后：成功路径 ── */
    RC.CLIENT_ID = 'probe_client_1'; RC.ACTIVITY_ID = 'act_probe'; RC.REWARD_NUM = 120;
    R.boot();
    check('配置齐全 ⇒ 整块显示', doc.getElementById('redeemSettingBlock').style.display === '',
      String(doc.getElementById('redeemSettingBlock').style.display));
    check('配置齐全 ⇒ 按钮接上 open()',
      typeof doc.getElementById('btnSettingsRedeem').onclick === 'function');

    resetLedger();
    const before = residual();
    r = await R.redeem(' krv-pcacr 334es ');
    check('兑换成功并返回点数', r.ok === true && r.tide === 120, r.msg);
    check('请求打到评审过的那个地址、POST', calls.length === 1 && calls[0].url === R.api &&
      calls[0].opts.method === 'POST', calls.length ? calls[0].url : 'no call');

    const b = calls[0] ? calls[0].body : {};
    check('请求体字段齐全（client_id / gift_code / character_id / nonce_str / sign / timestamp）',
      b.client_id === 'probe_client_1' && b.gift_code === 'krvpcacr334es' &&
      typeof b.character_id === 'string' && b.character_id.length > 0 &&
      typeof b.nonce_str === 'string' && b.nonce_str.length === 5 &&
      Number.isInteger(b.timestamp));
    check('sign === sha1(timestamp + nonce_str + client_id)',
      b.sign === R.sha1(String(b.timestamp) + b.nonce_str + b.client_id), b.sign);
    check('发出去的码是清洗过的原样（去空格连字符，大小写一个字母都不许改）',
      b.gift_code === 'krvpcacr334es', b.gift_code);

    /* ★ character_id 必须是「每个存档一个」的随机 id。
     * 传常量 ⇒ 平台按 (活动, character_id) 算同一用户 ⇒ 通兑码只有第一个玩家能领，
     * 其余全员 100017。这条错了本地全绿、线上全崩，所以必须钉死。 */
    check('character_id 不是写死的常量（写死会让第二个玩家起全部 100017）',
      b.character_id !== 'shellbreak-local' && /^[a-z0-9]{8,50}$/.test(b.character_id), b.character_id);
    check('character_id 落在 meta.installId 里（可随存档带走）',
      m.installId === b.character_id, String(m.installId));
    const cid1 = b.character_id;
    check('characterId() 在同一存档内稳定（不换人）', R.characterId(m) === cid1, R.characterId(m));
    /* ⚠️ 这里传 null 而不是一个假 meta：characterId(假 meta) 会顺手 saveMeta(那个假 meta)，
     * 把整个跨周目存档覆盖成两字段的残骸 —— 后面所有套件就跑在废档上了。
     * null 走「只生成、不落盘」分支，既能验随机性又不污染存档。 */
    const n1 = R.characterId(null), n2 = R.characterId(null);
    check('生成的 id 每次不同且合法（真随机，不是固定串）',
      n1 !== n2 && /^[a-z0-9]{8,50}$/.test(n1) && /^[a-z0-9]{8,50}$/.test(n2), n1 + ' / ' + n2);

    check('tide +120', m.tide === 120, String(m.tide));
    check('tideEarnedTotal 同步 +120（只加 tide 会让对账把补偿当成新缺口）',
      m.tideEarnedTotal === 120, String(m.tideEarnedTotal));
    check('compensationTotal 记账 +120', m.compensationTotal === 120, String(m.compensationTotal));
    check('★ 定损方程残差不变（补偿没有伪造出新缺口）', residual() === before,
      'before=' + before + ' after=' + residual());
    check('meta.redeemed 记下这个码与数量（键是大写防重键）',
      !!m.redeemed && !!m.redeemed.KRVPCACR334ES && m.redeemed.KRVPCACR334ES.n === 120,
      JSON.stringify(m.redeemed));

    /* 写盘后再读回来，字段不能丢（丢了就能反复领）。 */
    if (SB.state && SB.state.saveMeta && SB.state.loadMeta) {
      SB.state.saveMeta(m);
      const back = SB.state.loadMeta();
      check('存盘→读回：redeemed 与 compensationTotal 都还在',
        !!back.redeemed && !!back.redeemed.KRVPCACR334ES && back.compensationTotal === 120,
        JSON.stringify({ redeemed: back.redeemed, comp: back.compensationTotal }));
      check('存盘→读回：tideEarnedTotal 不被改写成 tide+spent',
        back.tideEarnedTotal === 120, String(back.tideEarnedTotal));
    }

    /* ── ⑤ 重复领取 ── */
    const n0 = calls.length;
    r = await R.redeem('KRVP-CACR 334ES');
    check('同一个码（换大小写/连字符）不许二次入账',
      r.ok === false && m.tide === 120 && calls.length === n0, r.msg);

    /* ── ⑥ 码不属于本活动 ⇒ 不认 ── */
    responder = () => ({ success: true, error: 0, activity_id: 'act_someone_else' });
    const tideB = m.tide;
    r = await R.redeem('OTHER001');
    check('别的活动的码 ⇒ 拒绝', r.ok === false && /不属于/.test(r.msg), r.msg);
    check('被拒后点数与记录都没动',
      m.tide === tideB && !m.redeemed.OTHER001, 'tide=' + m.tide);

    /* ── ⑦ 平台报错 ⇒ 不核销，可原样重试 ── */
    responder = () => ({ success: false, error: 100005 });
    r = await R.redeem('RETRY001');
    check('平台错误码有可读文案（100005 指向后台配置有误）',
      r.ok === false && /配置有误/.test(r.msg), r.msg);
    check('平台报错后码不算用掉', !m.redeemed.RETRY001);
    /* 通兑码下玩家最可能撞的两条：100017（本机已领过）与 100016（码打错）。 */
    responder = () => ({ success: false, error: 100017 });
    r = await R.redeem('RETRY002');
    check('100017 有「每个码每人限领一次」的说明', /每人限领一次/.test(r.msg), r.msg);
    responder = () => ({ success: false, error: 100016 });
    r = await R.redeem('RETRY003');
    check('100016 有「码无效，请核对」的说明', /无效/.test(r.msg), r.msg);
    check('这两条也都没核销码', !m.redeemed.RETRY002 && !m.redeemed.RETRY003);
    responder = () => ({ success: true, error: 0, activity_id: 'act_probe' });
    r = await R.redeem('RETRY001');
    check('同一个码重试成功（证明上一轮失败没有核销）', r.ok === true && !!m.redeemed.RETRY001, r.msg);

    /* ── ⑧ 断网 ⇒ 状态一个字节都不动 ── */
    responder = () => new Error('network down');
    const tideC = m.tide, resC = residual();
    r = await R.redeem('OFFLINE1');
    check('断网 ⇒ 明确告知，且提示「码没被使用」',
      r.ok === false && /网络不通/.test(r.msg) && /没有被使用/.test(r.msg), r.msg);
    check('断网后点数/残差/记录都没动',
      m.tide === tideC && residual() === resC && !m.redeemed.OFFLINE1,
      'tide=' + m.tide + ' residual=' + residual());

    /* ── ⑨ 并发：同一时刻只允许一个在飞 ── */
    responder = () => ({ success: true, error: 0, activity_id: 'act_probe' });
    const p1 = R.redeem('BUSY0001');
    const r2 = await R.redeem('BUSY0002');
    const r1 = await p1;
    check('并发第二枪被 busy 拦下（不重复发请求）',
      r2.ok === false && /正在兑换/.test(r2.msg), r2.msg);
    check('第一枪正常完成', r1.ok === true, r1.msg);

    /* ── ⑩ 奖励数读 CFG，不写死在代码里 ── */
    RC.REWARD_NUM = 7;
    check('reward() 跟着 CFG 走', R.reward() === 7, String(R.reward()));
    const tideD = m.tide;
    r = await R.redeem('SMALL007');
    check('改档位后入账 7 点（换 120 只需改 config 一处）',
      r.ok === true && m.tide === tideD + 7, 'tide=' + m.tide);
    RC.REWARD_NUM = 120;

    /* ── ⑪ 环境没有 fetch ⇒ 说清楚，而不是静默失败 ── */
    delete sandbox.fetch;
    r = await R.redeem('NOFETCH1');
    check('没有网络能力时明确拒绝', r.ok === false && /不能联网/.test(r.msg), r.msg);
    sandbox.fetch = function () { return Promise.resolve({ json: function () { return Promise.resolve({}); } }); };

    /* ── ⑫ 面板：真的能打开、能关掉 ── */
    R.open();
    check('面板打开后 #modal 不再 hidden',
      doc.getElementById('modal').classList.contains('hidden') === false);
    check('面板里有输入框与兑换按钮',
      g('modalBox').indexOf('id="redeemCode"') >= 0 && g('modalBox').indexOf('id="redeemGo"') >= 0);
    check('面板里的累计行常驻（空则 CSS :empty 隐藏，不靠插节点）',
      g('modalBox').indexOf('id="redeemUsed"') >= 0);
    if (SB.ui && SB.ui.render && SB.ui.render.hideModal) SB.ui.render.hideModal();
    check('面板能关掉', doc.getElementById('modal').classList.contains('hidden') === true);
  } finally {
    /* 还原世界：CFG、meta、fetch、面板。漏一个后续套件就会跑在被改过的状态上。 */
    RC.CLIENT_ID = savedCfg.CLIENT_ID; RC.ACTIVITY_ID = savedCfg.ACTIVITY_ID; RC.REWARD_NUM = savedCfg.REWARD_NUM;
    m.tide = savedMeta.tide; m.tideEarnedTotal = savedMeta.tideEarnedTotal; m.spent = savedMeta.spent;
    m.compensationTotal = savedMeta.compensationTotal; m.redeemed = savedMeta.redeemed;
    if (savedMeta.installId === undefined) delete m.installId; else m.installId = savedMeta.installId;
    if (hadFetch) sandbox.fetch = savedFetch; else delete sandbox.fetch;
    if (SB.ui && SB.ui.render && SB.ui.render.hideModal) SB.ui.render.hideModal();
    R.boot();
  }
}
