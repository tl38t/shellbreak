/* e2e suite: civics, governments, policy slots, and connected civic systems.
 * Runs at the original point in the single shared fixture; do not create a new loadAll here.
 */
export function run({ SB, check, noop, doc, g, fs, path, ROOT }) {
/* ---------------- 市政（2026-09-27 实装）---------------- */
/* 覆盖三条：市政点的产线、鼓舞＝揭示、政体/卡槽的收费。
 * ⚠️ 这批断言里**没有**任何标定类断言（整局时长、攒点快慢），那些走 defer()。
 *    判定口径照旧：改代码让断言变绿 = bug 修好了；改常数让断言变绿 = 标定，停下。 */
console.log('\n=== 市政 ===');
{
  const noop = function () {};

  const playerFacingIds = ['historiography', 'naturalhistory', 'macroeconomics', 'archaeology', 'civilization'];
  const unclearDesc = playerFacingIds.map(id => SB.civic.byId(id)).filter(c =>
    !c || /\b(?:game|workshop|prestige|economy)\.|\bcycle\b|ERA[1-6]|×\s*1\s*\+/i.test(c.desc)
  ).map(c => c ? c.id : 'missing civic');
  check('重点市政效果文案不暴露内部代码、原始公式或英文纪元缩写', unclearDesc.length === 0,
    unclearDesc.join(','));

  /* 新增市政《工坊学校》(2026-10-17)：在市政里补一条「加钢生产」通路 ——
   * 完成即解锁工坊升级「精炼钢厂」(upg_steelforge, 钢产出 +25%)。基础钢产出翻倍
   * 已在 config-content.js 的 UNIT.steelPerHydro 落实。这里只钉**数据契约**三条：
   *   ① era4 第二列、挂《职业行会》之下（2026-10-17 用户拍板「放在职业行会后面一层」——
   *      职业行会 era3/layer2 的下一层即纪元四，故 era4/layer2、reqs=['guild']，纪元四列数不变、
   *      连线条数==reqs 总数仍成立）；
   *   ② 鼓舞 = 建成 3 座热液工坊（built/hydroshop/3，与印刷术 techs.js:519 同口径；热液工坊由纪元三《金属精炼》解锁，纪元四可达）；
   *   ③ 兑现物「精炼钢厂」的 needCivic 指回本市政、steelBonus=0.25（门的行为见 workshop-economy.mjs ⑤-b）。 */
  {
    const c = SB.civic.byId('civ_steelschool');
    check('新市政《工坊学校》存在且为 era4 第二列、reqs=[guild]（挂在《职业行会》之后的纪元四）',
      !!c && c.name === '工坊学校' && c.era === 4 && c.layer === 2 &&
      (c.reqs || []).join() === 'guild',
      c ? JSON.stringify({ n: c.name, era: c.era, layer: c.layer, reqs: c.reqs }) : 'missing civic');
    check('《工坊学校》鼓舞 = 建成 3 座热液工坊（built/hydroshop/3）',
      !!c && c.boost && c.boost.t === 'built' && c.boost.b === 'hydroshop' && c.boost.n === 3,
      c ? JSON.stringify(c.boost) : 'missing civic');
    const up = (SB.UPGRADES || []).filter(u => u.id === 'upg_steelforge')[0];
    check('《工坊学校》兑现物「精炼钢厂」由它解锁（upgrade.needCivic 指回本市政、steelBonus=0.25）',
      !!up && up.needCivic === 'civ_steelschool' && Math.abs(up.steelBonus - 0.25) < 1e-9,
      up ? JSON.stringify({ needCivic: up.needCivic, steelBonus: up.steelBonus }) : 'missing upgrade');
  }

  // ①-甲 数值校准（2026-10-17）：王权神授 cost 倒挂修复 —— 原 8000 比同块 feudal/market/guild/department
  //   (3000/4000/5000/6000) 都高、且背离 10-05 拍板的「降」意图；用户拍板定为 3500（介于封建主义 3000 与中世纪集市 4000 之间）。
  check('王权神授 cost 校准为 3500（消除 era3 同块梯度倒挂，防回归）',
    SB.civic.byId('sovereign').cost === 3500,
    'sovereign.cost=' + SB.civic.byId('sovereign').cost);

  // ①-乙 数值校准（2026-10-17）：渊潜鲛歌的鼓舞「市政区建筑合计等级」50 → 30。
  //   用户实测进度条长期卡在 31/50（62%）推不动 ⇒ 拍板降到 30。锁死这个阈值防回归，
  //   同时锁 note 文案与 boost.n 同源（文案写 30、门也按 30 判，不许各写一份）。
  {
    const sk = SB.civic.byId('sharksong');
    check('渊潜鲛歌鼓舞 zoneLvl/civic 校准为 30（原 50 基本达不到，防回归）',
      !!sk && sk.boost && sk.boost.t === 'zoneLvl' && sk.boost.zone === 'civic' && sk.boost.n === 30,
      sk ? JSON.stringify(sk.boost) : 'missing civic');
    check('渊潜鲛歌 note 文案与 boost.n 同源（都写 30）',
      !!sk && /达 30/.test(String(sk.note)) && !/达 50/.test(String(sk.note)),
      sk ? String(sk.note) : 'missing civic');
  }

  // ① 面板开门就是议事厅：派生值，不存档
  const shut = SB.state.freshRun(false);
  check('未建议事厅 ⇒ 市政页不开', SB.civic.panelOpen(shut) === false);
  check('不开时给的是可执行的理由（不是空话）', /议事厅/.test(SB.civic.panelBlock(shut) || ''),
    String(SB.civic.panelBlock(shut)));
  shut.lvl.hall = 1;
  check('建成议事厅 ⇒ 市政页开', SB.civic.panelOpen(shut) === true);

  // ③ 页签红点谓词 hasResearchable：复用 blocked 同一门禁，与节点「可研究」状态同源
  check('SB.civic.hasResearchable 是可调用函数', typeof SB.civic.hasResearchable === 'function');
  check('面板关（未建议事厅）⇒ 无红点', SB.civic.hasResearchable(shut) === false);
  const hr = SB.state.freshRun(false); hr.lvl.hall = 1;
  check('初始（无鼓舞/无市政点）⇒ 无红点', SB.civic.hasResearchable(hr) === false);
  const c0 = SB.CIVICS[0];
  hr.civShown = hr.civShown || {}; hr.civShown[c0.id] = true;
  (c0.reqs || []).forEach(r => { hr.civics[r] = 1; });
  hr.res.culture = c0.cost;
  check('揭示某市政 + 前置满足 + 市政点够 ⇒ 有红点', SB.civic.hasResearchable(hr) === true,
    'c0=' + c0.id + ' blocked=' + (SB.civic.blocked(hr, c0) || 'null'));
  hr.civics[c0.id] = 1;
  check('该市政完成后 ⇒ 红点消（完成项不再计入）', SB.civic.hasResearchable(hr) === false);

  // ② 市政点产线：tick 与 rates 必须同式（面板/结算同源铁律）
  const cv = SB.state.freshRun(false);
  cv.jobs.scribe = 3; cv.lvl.hall = 4; cv.res.culture = 0;
  SB.economy.tick(cv, 1, noop);
  const want = 3 * SB.UNIT.culture + 4 * SB.CFG.CIVIC.HALL_RATE;
  check('书手＋议事厅产市政点，且 tick 与 rates 同式',
    Math.abs(cv.res.culture - want) < 1e-9 &&
    Math.abs(SB.economy.rates(cv).culture - want) < 1e-9,
    'tick=' + cv.res.culture.toFixed(4) + ' rates=' + SB.economy.rates(cv).culture.toFixed(4) +
    'tick=' + cv.res.culture.toFixed(4) + ' rates=' + SB.economy.rates(cv).culture.toFixed(4));

  /* 市政点是**独立线**：采集倍率不该管到书手上。
   * ⚠️ 2026-09-28 换载体：原先用 `g1.lvl.reef = 3`（礁石平台）当「采集倍率」的施力点，
   *    而**礁石平台已删除**、`BLD.reefMul` 与 gatherMul 那一项一并拆掉了 ⇒ 再用 reef
   *    会得到一个永远为 0 的等级键，这条断言会**变成空跑**（比值恒 1、恒绿），
   *    属于「夹具还在、力已经不作用了」的那种假绿。
   *    ⇒ 改用采集倍率**当前仅剩的**那条建筑外来源：`perk.gather`（gatherMul 里那份
   *    `1 + 0.10 × perk.gather`）。它才是这条断言要证的真命题：采集乘区不进书手那条线。 */
  const g0 = SB.state.freshRun(false); g0.jobs.scribe = 2;
  const g1 = SB.state.freshRun(false); g1.jobs.scribe = 2; g1.perk.gather = 3;
  SB.economy.tick(g0, 1, noop); SB.economy.tick(g1, 1, noop);
  check('市政点不吃采集倍率（书手持的是笔不是鳃）',
    Math.abs(g0.res.culture - g1.res.culture) < 1e-9 &&
    SB.economy.gatherMul(g1) > SB.economy.gatherMul(g0),
    '无采集加成=' + g0.res.culture.toFixed(4) + ' 采集 perk 3 级=' + g1.res.culture.toFixed(4) +
    ' gatherMul ' + SB.economy.gatherMul(g0).toFixed(3) + '→' + SB.economy.gatherMul(g1).toFixed(3));

  /* ②b 广场乘区（2026-09-28 用户规格「广场 = 图书馆的对位，加的是市政点获取」）。
   * ⚠️ 乘区的括号只裹「书手那一项」：议事厅与奇观是同一条产线上的另外两项，
   *    把乘区提到它们外面，会得到「广场顺带给议事厅加料」这种谁都没答应过的效果
   *    （那不是 +100% 广场，是 +100% 市政点总量）。 */
  const HALL2 = 2 * SB.CFG.CIVIC.HALL_RATE;          // 与书手那份分开比，才测得出谁被放大
  function sqFixture(sqLv, card) {
    const st = SB.state.freshRun(false);
    st.jobs.scribe = 10; st.lvl.hall = 2; st.lvl.square = sqLv;
    /* ⚠️ 多槽升维后事实来源是 s.cards 数组（s.card 只是第 0 号槽镜像）。
     *    装卡必须写 s.cards，否则 squareMul 读不到 ⇒ ×2 不生效。 */
    st.cards = card ? [card] : [];
    st.card = card || null;
    return st;
  }
  const scribePart = SB.economy.cultureRate(sqFixture(0)) - HALL2;
  check('广场 1 级 ⇒ 书手那一项 ×' + (1 + SB.BLD.squareCivRatio) + '，议事厅那份一点不动',
    Math.abs((SB.economy.cultureRate(sqFixture(1)) - HALL2) / scribePart -
             (1 + SB.BLD.squareCivRatio)) < 1e-9 &&
    Math.abs(SB.economy.cultureRate(sqFixture(0)) - scribePart - HALL2) < 1e-9,
    '基准=' + scribePart.toFixed(4) + ' 广场1级=' +
    (SB.economy.cultureRate(sqFixture(1)) - HALL2).toFixed(4));
  check('广场是线性的：2 级不是 1+0.1²',
    Math.abs((SB.economy.cultureRate(sqFixture(2)) - HALL2) / scribePart -
             (1 + 2 * SB.BLD.squareCivRatio)) < 1e-9);
  check('广场乘区 tick 与 rates 同式（面板不撒谎）',
    Math.abs(SB.economy.rates(sqFixture(1)).culture - SB.economy.cultureRate(sqFixture(1))) < 1e-9);
  /* 广场是**图书馆的对位**：“对标图书馆、不过加的是市政点获取” ⇒ 科技产出必须纹丝不动。
   * ⚠️ 两侧都给上书手，否则 culture 两份都是 0，`a > b` 这种比较会假绿（0 > 0 是 false，
   *    但「两边都没动」这个结论就测不出来了——要测的是**动了但只动一边**）。 */
  const sc0 = SB.state.freshRun(false);
  sc0.jobs.scholar = 3; sc0.jobs.scribe = 2;
  const sc1 = SB.state.freshRun(false);
  sc1.jobs.scholar = 3; sc1.jobs.scribe = 2; sc1.lvl.square = 5;
  check('广场不动科技产出（它是图书馆的姊妹，不是同一座）',
    Math.abs(SB.economy.rates(sc0).science - SB.economy.rates(sc1).science) < 1e-9 &&
    SB.economy.rates(sc1).culture > SB.economy.rates(sc0).culture,
    'science ' + SB.economy.rates(sc0).science.toFixed(4) + ' → ' +
    SB.economy.rates(sc1).science.toFixed(4) +
    ' / culture ' + SB.economy.rates(sc0).culture.toFixed(4) + ' → ' +
    SB.economy.rates(sc1).culture.toFixed(4));

  /* ②c 政策卡《戏剧与诗歌》=「广场效果 +100%」⇒ 乘区 ×2。
   * ⚠️ 这张卡的 effect 是**空的**（刻意）——乘区走 `squareMul` 那条通道，不是 flow 的
   *    平坦加值。若哪天有人「顺手补上 effect: {culture: ...}」，这里会红：那等于把
   *    「这座建筑变强」改成「凭空产两份市政点」，不是同一个东西。 */
  check('没装卡时 squareMul = 1（返回 1 是「没装」不是「0 倍」）',
    SB.civic.squareMul(sqFixture(1)) === 1);
  /* ⚠️ 比的是**书手那一段**而不是 cultureRate 全值：议事厅那份（2 × HALL_RATE）在
   *    乘区外面，全值一比会把「没被放大」的那部分也算进来 ⇒ 显示 1.94 而不是 2。 */
  const sqRate = sq => SB.economy.cultureRate(sq) - HALL2;
  check('装政策卡《戏剧与诗歌》⇒ 广场乘区 ×2，且 tick 与 rates 同式',
    SB.civic.squareMul(sqFixture(1, 'card_drama')) === 2 &&
    Math.abs(sqRate(sqFixture(1, 'card_drama')) / sqRate(sqFixture(1)) - 2) < 1e-9 &&
    Math.abs(SB.economy.rates(sqFixture(1, 'card_drama')).culture -
             SB.economy.cultureRate(sqFixture(1, 'card_drama'))) < 1e-9,
    '书手段 ' + sqRate(sqFixture(1)).toFixed(4) + ' → ' +
    sqRate(sqFixture(1, 'card_drama')).toFixed(4) + '（×2）');
  /* 拔下即失效（与 flow 那条「研究出 ≠ 白拿」同口径：卡在槽里才算选了它）。 */
  check('拔下《戏剧与诗歌》⇒ 乘区回到 1×（不是留在装填时的值）',
    SB.civic.squareMul(sqFixture(1, null)) === 1);

  /* ②d 商人 × 奢侈品（用户规格「对外贸易解锁职业商人，可获取叫奢侈品的资源」）。
   * ⚠️ 2026-09-28 陆地贸易落地：奢侈品**现在有开销渠道**——每人每秒按 happyCost(H)
   *    烧 luxury 维持幸福度（见 economy.js 4c 段）。所以这条线不再是「只有进项」，
   *    净速率 = 产能 − 幸福度消耗。上限仍无限（CAPLESS 白名单那条保留：luxury 不进仓储上限）。 */
  const mk = SB.state.freshRun(false);
  check('没完成《对外贸易》⇒ 商人雇不了（市政通路不通 ⇒ 没人产奢侈品）',
    SB.folk.jobUnlocked(mk, 'merchant') === false);
  check('商人的解锁权写在市政表上，不是某项科技（两条通路分开放）',
    SB.folk.jobCivicOf('merchant') === 'trade' && SB.folk.jobTechOf('merchant') === null,
    'civic=' + SB.folk.jobCivicOf('merchant') + ' tech=' + SB.folk.jobTechOf('merchant'));
  mk.civics.trade = true;
  check('完成《对外贸易》⇒ 商人解锁（OR 语义：另一条通路没写也不影响）',
    SB.folk.jobUnlocked(mk, 'merchant') === true);
  const ml = SB.state.freshRun(false);
  ml.jobs.merchant = 4; ml.res.luxury = 0;
  SB.economy.tick(ml, 1, noop);
  /* ⚠️ 落地后 luxury 有消耗端（幸福度）。验证两条不变量（不依赖 H 在 1 秒内的微小漂移）：
   *   ① rates.luxury 公式 = 产能(baseMul) − 实际消耗 min(产能, 需求)，精确；
   *   ② tick 1 秒真实净增量 ∈ (0, 产能)，证明「有产出、有消耗」两件事都发生。
   *   注：tick 累积与 rates 的微小差来自 H 随贸易充足度漂移（面板显示当前速率，非撒谎）。 */
  const _S = 4 * SB.UNIT.luxury * SB.economy.baseMul(ml);
  const _D = ml.pop * SB.economy.happyCost(ml.happy || 0);
  const _net = _S - Math.min(_S, _D);
  check('商人产奢侈品：净速率 = 产能 − 幸福度消耗（公式精确）',
    Math.abs(SB.economy.rates(ml).luxury - _net) < 1e-9,
    'rates=' + SB.economy.rates(ml).luxury.toFixed(5) + ' net=' + _net.toFixed(5));
  check('商人产奢侈品：tick 1 秒净增量 ∈ (0, 产能)（有产出有消耗）',
    ml.res.luxury > 1e-9 && ml.res.luxury < _S + 1e-12,
    'luxury=' + ml.res.luxury.toFixed(5) + ' 产能=' + _S.toFixed(5));
  /* ⚠️ 这条盯的是「状态表里有没有开好口子」：奢侈品每帧都进 addRes，缺键会在开局
   *    几秒内把整个 res 染成 NaN（jobs.merchant 那次就是这么漏的——economy 侧写了
   *    `(s.jobs.merchant || 0)`，所以没有 NaN，反而更晚才被发现）。 */
  const mf = SB.state.freshRun(false);
  check('状态表已开好 luxury / merchant 两个口子（有产出没开销 ⇒ 每帧都跑）',
    typeof mf.res.luxury === 'number' && typeof mf.jobs.merchant === 'number' &&
    typeof mf.lvl.square === 'number' &&
    typeof SB.state.freshRun(false).lvl.institute === 'number');
  /* 除商人外没有任何职业碰奢侈品——「唯一进项」是规格本身，别让它悄悄多一个来源。 */
  const mo = SB.state.freshRun(false);
  mo.res.luxury = 0; mo.jobs.coralwright = 3;
  SB.economy.tick(mo, 1, noop);
  check('奢侈品是商人的独占产出（珊瑚匠也碰不到它）', mo.res.luxury === 0,
    'luxury=' + mo.res.luxury);

  /* ⚠️ 陆地贸易核心不变量（2026-09-28 落地）：钉住设计，而非迁就绿。 */
  // ⓪ 民生轴跟贸易解锁走（2026-10-05 用户拍板）：未解锁（civics.trade 没有）⇒ 民生轴不存在，
  //    H 恒 0 —— 不许在玩家看得见之前就滑到保底 −2（旧版「一上来就是负的」的根因）。
  const htLocked = SB.state.freshRun(false);
  htLocked.happy = 0;
  SB.economy.tick(htLocked, 5, noop);
  check('对外贸易未解锁 ⇒ 幸福度恒 0（民生轴不存在，不积累负值）',
    htLocked.happy === 0, 'H=' + htLocked.happy);
  // ① 无贸易产能（商人=0、贸易已解锁）⇒ 民生轴进入**断供**：幸福度按 K·(0−D) 渐降（惩罚方向正确），
  //    ⚠️ 不再是旧版「中性不惩罚」——那是 2026-10-05 方案 A 删掉的 `if(_S<=0){s.happy=_gb}` 分支的语义，
  //       删它的理由正是「无民生不该凭空扣全产」反例：商人拉到 0 的瞬间攒了几小时的幸福度一秒蒸发。
  //       新语义：断供 = 慢慢崩（恒温器积分），不是归零、也不是冻结。渐降由 3500/3511 钉死。
  //    ⚠️ 夹具必须开 civics.trade：断供语义只存在于解锁之后（⓪ 钉的是解锁前恒 0）。
  const ht0 = SB.state.freshRun(false);
  ht0.civics = { trade: true };
  SB.economy.tick(ht0, 1, noop);
  check('贸易已解锁但商人=0 ⇒ 幸福度下降（断供惩罚方向正确，非旧版「中性不惩罚」）',
    ht0.happy < 0 && SB.economy.happyMul({ happy: ht0.happy }) < 1.0,
    'H=' + ht0.happy + ' happyMul=' + SB.economy.happyMul({ happy: ht0.happy }));
  // ② 档位映射（台阶式，与文明6 同构）
  const hM = s => SB.economy.happyMul(s);
  check('幸福度档位：动荡<−1→0.80｜不满→0.92｜安定→1.00｜愉悦→1.05｜欢欣→1.10｜欣喜若狂≥3→1.20',
    hM({happy:-2})===0.80 && hM({happy:-1})===0.92 && hM({happy:0})===1.00 &&
    hM({happy:1})===1.05 && hM({happy:2})===1.10 && hM({happy:3})===1.20 && hM({happy:99})===1.20,
    '');
  // ③ 贸易产能 < 需求 ⇒ H 下降（动荡惩罚方向正确）
  const htStarve = SB.state.freshRun(false);
  htStarve.civics = { trade: true };
  htStarve.jobs.merchant = 1; htStarve.pop = 100; htStarve.res.luxury = 0;  // 产能0.05 < 需求0.5
  SB.economy.tick(htStarve, 1, noop);
  check('贸易产能 < 需求 ⇒ 幸福度下降（断供惩罚方向）',
    htStarve.happy < 0, 'H=' + htStarve.happy.toFixed(4));
  // ④ 贸易产能 > 需求 ⇒ H 上升（欢欣增益方向正确）
  const htRich = SB.state.freshRun(false);
  htRich.civics = { trade: true };
  htRich.jobs.merchant = 10; htRich.pop = 1;  // 产能0.5 >> 需求0.005
  SB.economy.tick(htRich, 1, noop);
  check('贸易产能 > 需求 ⇒ 幸福度上升（增益方向）',
    htRich.happy > 0, 'H=' + htRich.happy.toFixed(4));
  // ⑤ 反自指：luxury 产出走 baseMul（不含 happyMul），happy 增益不放大自己的燃料
  const htLux = SB.state.freshRun(false);
  htLux.jobs.merchant = 4; htLux.happy = 3;   // 欣喜若狂档
  const _cap = 4 * SB.UNIT.luxury * SB.economy.baseMul(htLux);   // 产能（baseMul，不含 happy）
  check('luxury 产出走 baseMul（不含 happyMul，防自激）',
    Math.abs(SB.economy.rates(htLux).luxury - (_cap - Math.min(_cap, htLux.pop * SB.economy.happyCost(3)))) < 1e-9 &&
    Math.abs(_cap - 4 * SB.UNIT.luxury) < 1e-9,   // happy=3 不影响 luxury 产能
    'lux=' + SB.economy.rates(htLux).luxury.toFixed(5) + ' 产能=' + _cap.toFixed(5));

  // ③ 鼓舞 = 揭示，不是解锁、也不是替玩家付点
  const cs = SB.state.freshRun(false);
  cs.lvl.hall = 1;
  SB.civic.pump(cs, noop);
  check('法典无鼓舞 ⇒ 面板一开就揭示', SB.civic.isRevealed(cs, 'laws'));
  check('技艺未建成工坊 ⇒ 仍是「未揭露」', !SB.civic.isRevealed(cs, 'craft'));
  check('神秘主义未掌握海潮占卜 ⇒ 仍是「未揭露」', !SB.civic.isRevealed(cs, 'mystic'));
  check('未揭露 ⇒ 投不进市政点（100 点的定价没被鼓舞免掉）',
    SB.civic.canResearch(cs, 'craft') === false);
  check('《技艺》的鼓舞条件正是「建成 1 级工坊」',
    SB.civic.byId('craft').boost.b === 'workshop' && SB.civic.byId('craft').boost.n === 1);
  check('《神秘主义》的鼓舞条件正是「掌握海潮占卜」这一项（不是计数量）',
    SB.civic.byId('mystic').boost.t === 'tech' && SB.civic.byId('mystic').boost.id === 'tiddivine');

  /* ③b era2 第一层两项：对外贸易 / 戏剧与诗歌（2026-09-28 用户规格）。
   * ⚠️ 【为什么两项都 reqs ['laws']，而不是各自接着《技艺》《神秘主义》】
   *    若各自挂到 era1 的末项上，玩家要先在「对外贸易 / 戏剧与诗歌」之间选一条走，
   *    而《技艺》《神秘主义》两张卡抢的是**同一个万能槽**——把新一层再吊进那次取舍，
   *    等于逼他在两条支线上做第二次互斥，而他根本没有余裕（槽位只有 1 个）。
   *    ⇒ 都挂根《法典》：两条支线都能走到这一层，真正在等他的是那两个产能。 */
  const ct = SB.civic.byId('trade'), cd = SB.civic.byId('drama');
  check('新一层两项都挂根《法典》、彼此不前置（不逼玩家再做一次二选一）',
    ct.reqs.join() === 'laws' && cd.reqs.join() === 'laws' &&
    (cd.reqs || []).indexOf('trade') < 0 && (ct.reqs || []).indexOf('drama') < 0 &&
    ct.id !== cd.id,
    'trade←[' + ct.reqs.join() + '] drama←[' + cd.reqs.join() + ']');
  check('《对外贸易》的鼓舞条件正是「完成照明科技」',
    ct.boost.t === 'tech' && ct.boost.id === 'lighting', JSON.stringify(ct.boost));
  /* ⚠️ `wonder` 这个条件类型是 2026-09-28 新加的：原先 12 种条件类型里**没有**
   *    「建成一座奇观」，只写 `boost: {t:'wonder'}` 会静默永远达不成（不报错、不红）。 */
  check('《戏剧与诗歌》的鼓舞条件正是「建成一座奇观」',
    cd.boost.t === 'wonder' && cd.boost.n === 1, JSON.stringify(cd.boost));
  const w0 = SB.state.freshRun(false);
  check('一座奇观都没建 ⇒ 该鼓舞不成立',
    SB.tech.condMet(w0, cd.boost) === false && SB.wonder.count(w0) === 0,
    'count=' + SB.wonder.count(w0));
  /* 建成一座 ⇒ 成立。这里不真跑一遍建造流程（那属于别的节），只把 s.wonders 摆成
   * 「已建成 1 座」—— w0.wonders 的键就是 SB.WONDERS 的 id，count 数的是它。
   * ⚠️ 走 condMet 而不是直接判 s.wonders：直接判读的是实现，走 condMet 读的是契约。 */
  w0.wonders[SB.WONDERS[0].id] = true;
  check('建成一座奇观 ⇒ 该鼓舞成立（condMet 认得 wonder 这个类型）',
    SB.wonder.count(w0) === 1 && SB.tech.condMet(w0, cd.boost) === true,
    'count=' + SB.wonder.count(w0) + ' condMet=' + SB.tech.condMet(w0, cd.boost));
  /* 达成后不能印「1 / 1」这种读数本身没意义，但要盯住「已达成」能被 boostText 改念
   *    （与上面 craft 那条同型：condShort 的原始读数照搬上屏会读成坏掉了）。 */
  const bt2 = SB.civic.boostText(w0, cd);
  check('鼓舞已达成时不显示「1 / 1」这种原始读数', bt2.indexOf('1 / 1') === -1,
    bt2 + '（原始读数 ' + SB.civic.condShort(w0, cd.boost).txt + '）');
  /* cardOwned 看的是 `s.civics`（已完成），所以要先记为已完成——上面那一组只摆了
   * 奇观数、没摆完成状态，这里补上，别把「没完成却拿到卡」当成 bug。 */
  w0.civics.drama = true;
  check('《戏剧与诗歌》同时放出政策卡「戏剧与诗歌」（广场 + 乘区两件一起给）',
    SB.civic.policyById('card_drama').civic === 'drama' &&
    SB.civic.cardOwned(w0, 'card_drama') === true);

  /* `wonders`（指定奇观全建成）类型的 id 必须是**完整配置 id**（wonder_xxx）。
   * ⚠️ 2026-10-07 实测病：《国民动员》鼓舞写成 ['shellcutter','presspipe']（漏前缀）⇒
   *    owned()['shellcutter'] 恒 undefined ⇒ 两座奇观都建成了鼓舞还恒 0%。
   *    静态扫全表：civics.boost 与 techs.cond 里所有 t==='wonders' 的 id 都必须命中 SB.WONDERS。 */
  const _wAll = [];
  for (const c of SB.CIVICS) if (c.boost && c.boost.t === 'wonders') _wAll.push(...c.boost.ids);
  for (const t of SB.TECHS) if (t.cond && t.cond.t === 'wonders') _wAll.push(...t.cond.ids);
  const _wIds = new Set(SB.WONDERS.map(w => w.id));
  check('所有 wonders 类鼓舞/尤里卡的 id 都是真实奇观 id（漏 wonder_ 前缀在此现形）',
    _wAll.length > 0 && _wAll.every(id => _wIds.has(id)),
    'bad=' + JSON.stringify(_wAll.filter(id => !_wIds.has(id))));
  const mob = SB.CIVICS.find(c => c.id === 'mobilization');
  const w2 = SB.state.freshRun(false);
  w2.wonders['wonder_shellcutter'] = true; w2.wonders['wonder_presspipe'] = true;
  check('《国民动员》鼓舞：天壳切削器+高压热机管道都建成 ⇒ 成立',
    SB.civic.boostMet(w2, mob) === true);
  const w3 = SB.state.freshRun(false);
  w3.wonders['wonder_shellcutter'] = true;
  check('《国民动员》鼓舞：只建成一座 ⇒ 不成立',
    SB.civic.boostMet(w3, mob) === false);
  /* 未达成态卡片要出**中文奇观名**，不能印生 id（2026-10-07 截图病：shellcutter、presspipe）。 */
  const w4 = SB.state.freshRun(false);
  check('《国民动员》鼓舞未达成时文案出中文名「天壳切削器」（不印生 id）',
    SB.civic.boostText(w4, mob).indexOf('天壳切削器') >= 0 &&
    SB.civic.boostText(w4, mob).indexOf('shellcutter') === -1,
    SB.civic.boostText(w4, mob));

  /* 广场的解锁轴是 `requiredCivic`（第四条，其余建筑走 requiredTech 或科技侧 unlockBuild）。
   * ⚠️ 命中的是 **s.civics（已完成）**，不是 civShown（已揭示）：揭示只打开「可以投点」
   *    那扇门，玩家还得自己花掉市政点。这里两条都测，别只测其中一条。 */
  const sqB = SB.habitat.buildingById('square');
  const sh = SB.state.freshRun(false);
  sh.civShown.drama = true;
  check('只揭示《戏剧与诗歌》不给广场（揭示只开门，花掉点才算数）',
    SB.habitat.unlocked(sh, sqB) === false, 'civics=' + JSON.stringify(sh.civics));
  check('锁着的广场给的是玩家当下能执行的理由（不是「再攒 200 珊瑚」）',
    /戏剧与诗歌/.test(SB.habitat.lockReason(sh, sqB) || ''),
    String(SB.habitat.lockReason(sh, sqB)));
  sh.civics.drama = true;
  check('完成《戏剧与诗歌》⇒ 广场解锁（requiredCivic 这条轴通了）',
    SB.habitat.unlocked(sh, sqB) === true);

  /* ③d era2 **第二层**两项：神学 / 历史记录（2026-09-28 用户规格）。
   * ⚠️ 两项的共同前置是《戏剧与诗歌》（用户原话「戏剧与诗歌引出神学市政」「……引出历史记录
   *    市政」）⇒ 它们同列、彼此不前置，几何与第一层同构，差别只在共同前置是「一条支线的
   *    末项」而不是根。与第一层那条判据是同一个道理换个前置。 */
  const cx = SB.civic.byId('theology'), cr = SB.civic.byId('records');
  check('第二层两项都由《戏剧与诗歌》引出、彼此不前置（几何与第一层同构）',
    cx.reqs.join() === 'drama' && cr.reqs.join() === 'drama' &&
    (cx.reqs || []).indexOf('records') < 0 && (cr.reqs || []).indexOf('theology') < 0 &&
    cx.era === 2 && cx.layer > cd.layer && cr.layer > cd.layer,
    'theology←[' + cx.reqs.join() + '] records←[' + cr.reqs.join() + '] layer=' +
    cx.layer + '/' + cr.layer);
  /* ⚠️ 两条鼓舞条件的**否定侧**都要摆出来：只测「达成后成立」是假绿——
   *    写错条件类型（比如把 pop 写成 job）时，达成侧照样能绿。 */
  const p24 = SB.state.freshRun(false); p24.pop = 24;
  const p25 = SB.state.freshRun(false); p25.pop = 25;
  check('《神学》的鼓舞条件正是「人口达 25」，且 24 人不成立',
    cx.boost.t === 'pop' && cx.boost.n === 25 &&
    SB.civic.boostMet(p24, cx) === false && SB.civic.boostMet(p25, cx) === true,
    JSON.stringify(cx.boost));
  /* ⚠️ `built` 读的是 `s.lvl[c.b]` ⇒ 必须传**建筑 id**。传科技 id（比如 'loreway'）
   *    不会报错，只会永远达不成——与 `wonder` 那条是同一类静默断链。 */
  const lb5 = SB.state.freshRun(false); lb5.lvl.library = 5;
  const lb6 = SB.state.freshRun(false); lb6.lvl.library = 6;
  check('《历史记录》的鼓舞条件正是「潮纹馆达 6 级」（传的是建筑 id 不是科技 id）',
    cr.boost.t === 'built' && cr.boost.b === 'library' && cr.boost.n === 6 &&
    SB.civic.boostMet(lb5, cr) === false && SB.civic.boostMet(lb6, cr) === true,
    JSON.stringify(cr.boost));
  check('两项各放出一张政策卡，且卡 ↔ 市政一一对应',
    SB.civic.policyById(cx.card).civic === 'theology' &&
    SB.civic.policyById(cr.card).civic === 'records',
    cx.card + ' / ' + cr.card);
  check('《历史记录》登记的那座奇观就是「大图书馆」（存在且是奇观表里的真条目）',
    cr.wonder === 'wonder_great_library' && !!SB.wonder.byId(cr.wonder),
    String(cr.wonder));

  /* 神庙的解锁轴 = 《神学》**完成**（与广场那个 requiredCivic 同一条轴）。
   * ⚠️ 命中的是 s.civics。这里正反两条都测，别只测「完成 ⇒ 解锁」。 */
  const tmB = SB.habitat.buildingById('temple');
  check('神庙挂在 requiredCivic「theology」上（不是科技、也不是 need）',
    tmB.requiredCivic === 'theology' && !tmB.requiredTech && !tmB.need);
  const th = SB.state.freshRun(false);
  th.civics.theology = true;
  check('完成《神学》⇒ 神庙解锁', SB.habitat.unlocked(th, tmB) === true);
  th.civics.theology = false;
  check('撤销《神学》⇒ 神庙重新锁上（解锁权真的挂在市政上）',
    SB.habitat.unlocked(th, tmB) === false);

  /* 《神学》解锁的**信仰资源**（宗教系统已落地，2026-09-28）：基础产出 = 人口 × FAITH_PER_POP，
   *   神庙乘区叠加上去；存量攒到 10/100/1000 时按对数刻度给全产加成，且加成进入 globalMul。
   *   ⚠️ 2026-09-30 修：信仰产出**必须等《神学》完成**——faithRate 内部读 resUnlocked(s,'faith')，
   *    神学前即使有人口也恒为 0（不开局偷偷攒、也不偷偷给全产加成）。这是把当初漏门控的漏洞堵上，
   *    也对齐了 RES S.faith 的 unlock:{civic:'theology'} 与面板 faith 行 gate 同一条判定。 */
  const fa0 = SB.state.freshRun(false);              // 神学前
  SB.economy.tick(fa0, 1, noop);
  check('神学前信仰产出恒为 0（与资源行 gate 同判，不开局偷偷攒）',
    SB.economy.faithRate(fa0) === 0 && fa0.res.faith === 0,
    'faithRate=' + SB.economy.faithRate(fa0) + ' 存量=' + fa0.res.faith);
  const fa = SB.state.freshRun(false);
  fa.civics = { theology: true };                    // 完成《神学》
  SB.economy.tick(fa, 1, noop);
  check('完成《神学》后信仰基础产出 = 人口 × 0.02/s（叠神庙乘区）',
    SB.RESS.faith && typeof fa.res.faith === 'number' && fa.res.faith > 0 &&
    Math.abs(SB.economy.faithRate(fa) - fa.pop * SB.CFG.FAITH_PER_POP) < 1e-9,
    'pop=' + fa.pop + ' faithRate=' + SB.economy.faithRate(fa).toFixed(4) + '/s 存量=' + fa.res.faith.toFixed(4));
  /* 信仰全产加成刻度：10→+1% / 100→+2% / 1000→+3%（<10 不加成）。 */
  const fAll = lv => { const r = SB.state.freshRun(false); r.res.faith = lv; return r; };
  check('信仰全产加成：9→0% / 10→+1% / 100→+2% / 1000→+3%',
    Math.abs(SB.economy.faithAllMul(fAll(9)) - 1) < 1e-9 &&
    Math.abs(SB.economy.faithAllMul(fAll(10)) - 1.01) < 1e-9 &&
    Math.abs(SB.economy.faithAllMul(fAll(100)) - 1.02) < 1e-9 &&
    Math.abs(SB.economy.faithAllMul(fAll(1000)) - 1.03) < 1e-9,
    '9=' + SB.economy.faithAllMul(fAll(9)).toFixed(3) + ' 10=' + SB.economy.faithAllMul(fAll(10)).toFixed(3) +
    ' 100=' + SB.economy.faithAllMul(fAll(100)).toFixed(3) + ' 1000=' + SB.economy.faithAllMul(fAll(1000)).toFixed(3));
  /* ⚠️ 2026-10-05 补：面板 === 结算（用户报「信仰怎么不体现每秒出率」）。
   *   根因：rates() 的返回对象当时**漏了 faith 键** ⇒ renderRes 里 `rate['faith']||0`=0
   *   ⇒ 顶栏信仰行永远不显示 `/s`，而 tick 里 `addRes(s,'faith',faithRate*dt)` 照涨。
   *   这条钉死「rates.faith === faithRate === 面板显示的那个数」。 */
  const faR = SB.state.freshRun(false);
  faR.civics = { theology: true }; faR.pop = 10; faR.lvl.temple = 1; faR.res.faith = 15.4;
  const faithTickBefore = faR.res.faith;
  SB.economy.tick(faR, 1, noop);
  const faithTickDelta = faR.res.faith - faithTickBefore;
  check('面板 === 结算：rates.faith 有键且与 faithRate、tick 增量三者同值（顶栏信仰行显示 /s）',
    'faith' in SB.economy.rates(faR) &&
    Math.abs(SB.economy.rates(faR).faith - SB.economy.faithRate(faR)) < 1e-9 &&
    Math.abs(SB.economy.rates(faR).faith - faithTickDelta) < 1e-9,
    'rates.faith=' + SB.economy.rates(faR).faith + ' faithRate=' + SB.economy.faithRate(faR).toFixed(4) +
    ' tickΔ=' + faithTickDelta.toFixed(4));
  /* 覆盖率闸：凡 tick 里会结算的资源，rates() 都必须有同名键（漏一个就「面板撒谎」）。 */
  const rateKeys = Object.keys(SB.economy.rates(faR));
  const noRate = ['kelp','coral','silt','titanium','stone','warmstone','iron','steel','hydro',
    'science','fuel','culture','luxury','faith'].filter(k => !(k in SB.economy.rates(faR)));
  check('rates() 覆盖全部会结算的资源键（漏一个 = 顶栏该行永远不显示 /s）',
    noRate.length === 0, noRate.length ? 'rates() 缺：' + noRate.join('/') : '共 ' + rateKeys.length + ' 键齐全');
  /* 信仰全产加成确实进入 globalMul（作用于珊瑚/石头/…/奢侈品这些 tick 产出；不含信仰自身，反自指）。 */
  check('信仰全产加成进入 globalMul（基座无灯塔/奇观时 = 1.03 @1000 信仰）',
    Math.abs(SB.economy.globalMul(fAll(1000)) - 1.03) < 1e-9 &&
    SB.economy.globalMul(fAll(1000)) > SB.economy.globalMul(fAll(1)),
    'faith=1 ⇒ ' + SB.economy.globalMul(fAll(1)).toFixed(3) + ' / faith=1000 ⇒ ' + SB.economy.globalMul(fAll(1000)).toFixed(3));
  /* ⚠️ 神庙是纯乘区、没有基础产出可乘 ⇒ 乘区系数本身必须**独立可读**，
   *    否则「+10%/级」这条规则在宗教落地前完全测不出来（乘 0 恒等于没挂）。 */
  const tmf = lv => { const r = SB.state.freshRun(false); r.lvl.temple = lv; return r; };
  const tmRatio = SB.BLD.templeFaithRatio;
  check('神庙乘区系数独立可读且线性（' + tmRatio + '/级）',
    Math.abs(SB.economy.faithMul(tmf(0)) - 1) < 1e-9 &&
    Math.abs(SB.economy.faithMul(tmf(1)) - (1 + tmRatio)) < 1e-9 &&
    Math.abs(SB.economy.faithMul(tmf(2)) - (1 + 2 * tmRatio)) < 1e-9,
    '0级=' + SB.economy.faithMul(tmf(0)).toFixed(4) + ' 1级=' +
    SB.economy.faithMul(tmf(1)).toFixed(4) + ' 2级=' + SB.economy.faithMul(tmf(2)).toFixed(4));
  /* 政策卡《神学》= 「神庙效果 +100%」⇒ 乘区 ×2，且**拔下即失效**（与广场那条同一条纪律：
   *    卡在槽里才算选了它，研究出市政只是拿到它）。 */
  check('装《神学》⇒ 神庙乘区 ×2，拔下回 1×',
    SB.civic.templeMul(tmf(1)) === 1 &&
    SB.civic.templeMul(Object.assign(tmf(1), { cards: ['card_theology'] })) === 2 &&
    SB.civic.templeMul(Object.assign(tmf(1), { cards: [] })) === 1);

  /* 宗教命名（2026-09-29）：玩家可以给信仰起名，名字显示在信仰资源行上。
   * 数据层：freshRun 默认 ''；migrateRun 老档补 ''、新档原样保留。
   * 标签层：renderRes 信仰行用 s.religionName（非空时）代替「信仰」二字。 */
  const rnFresh = SB.state.freshRun(false);
  check('宗教名默认空（未命名）', rnFresh.religionName === '');
  const rnOld = SB.state.migrateRun({ res: {}, techs: {}, lvl: {}, civics: {} });
  check('读档迁移：老档无 religionName ⇒ 补空字符串', rnOld.religionName === '');
  const rnNew = SB.state.migrateRun({ res: {}, techs: {}, lvl: {}, civics: {}, religionName: '深渊低语' });
  check('读档迁移：新档 religionName 原样保留', rnNew.religionName === '深渊低语');
  const govOld = SB.state.migrateRun({ res: {}, techs: {}, lvl: {}, civics: { laws: true }, gov: 'tribe' });
  check('读档迁移：旧档当前政体记为已采用', govOld.govAdopted.tribe === true);
  /* 标签逻辑（与 renderRes 同源）：信仰行 rowName = 有名字用名字、否则用「信仰」。 */
  function faithRowName(st) { var rn = (st.religionName || '').trim(); return rn ? rn : SB.RESS.faith.name; }
  check('信仰行标签：命名后用宗教名、未命名用「信仰」',
    faithRowName({ religionName: '' }) === SB.RESS.faith.name &&
    faithRowName({ religionName: '深渊低语' }) === '深渊低语');

  /* ── 大图书馆（2026-09-28 用户规格 · 市政《历史记录》解锁）────────────
   * 【核心结构】「图书馆 +3 级」是**虚级**：只加效果，**不提高建筑所需材料**。
   *    ⇒ 它绝不写进 `s.lvl.library`：那会被 lvlSum（破壳系数）、need 判定、
   *      costOf（下一级的材料）一并读走。用户那句「只加效果，不提高材料」
   *      就是为这条定的，下面四条断言逐面钉住它。 */
  const sciFx = o => {                       // 学者 3 人 + 可选覆盖项（lvl / wonders）
    const r = SB.state.freshRun(false);
    r.jobs.scholar = 3;
    if (o) Object.assign(r, o);
    return r;
  };
  const gLib = sciFx();
  const gWon = sciFx();
  gWon.wonders = { wonder_great_library: true };
  check('大图书馆给的是虚级：s.lvl.library 纹丝不动',
    gWon.lvl.library === 0, 'lvl.library=' + gWon.lvl.library);
  check('虚级不进 lvlSum ⇒ 建筑总级数 / 破壳系数纹丝不动',
    SB.economy.lvlSum(gWon) === SB.economy.lvlSum(gLib),
    'lvlSum ' + SB.economy.lvlSum(gLib) + ' → ' + SB.economy.lvlSum(gWon));
  check('虚级只进效果侧：libraryLevel = 真实 0 + 虚 3',
    SB.economy.libraryLevel(gLib) === 0 && SB.economy.libraryLevel(gWon) === 3,
    'libraryLevel=' + SB.economy.libraryLevel(gWon));
  /* ⚠️ costOf 读的是 `s.lvl[id]` ⇒ 虚级若被写进 lvl.library，这条**当场红**。
   *    「不提高建筑所需材料」这句话的落点就在这一行上。 */
  check('大图书馆不提高图书馆的建造材料（costOf 读不到那 3 级）',
    JSON.stringify(SB.economy.costOf(gWon, 'library')) ===
    JSON.stringify(SB.economy.costOf(gLib, 'library')),
    JSON.stringify(SB.economy.costOf(gWon, 'library')));
  const real3 = sciFx(); real3.lvl.library = 3;
  check('虚级 3 级的效果 = 图书馆真 3 级（逐值相同，不是另算一套）',
    Math.abs(SB.economy.rates(gWon).science - SB.economy.rates(real3).science) < 1e-9,
    '虚3=' + SB.economy.rates(gWon).science.toFixed(6) +
    ' 真3=' + SB.economy.rates(real3).science.toFixed(6));
  check('虚级落点只有科技产出这一处（涨的只有 science）',
    Math.abs(SB.economy.rates(gWon).culture - SB.economy.rates(gLib).culture) < 1e-9 &&
    SB.economy.rates(gWon).science > SB.economy.rates(gLib).science,
    'culture ' + SB.economy.rates(gLib).culture.toFixed(4) + ' → ' +
    SB.economy.rates(gWon).culture.toFixed(4));

  /* 政策卡《历史记录》=「图书馆效果翻倍」⇒ 乘区 ×2，且**只裹图书馆那一份**。
   * ⚠️ 研究所是另一座建筑，它的 +50%/级 不在「图书馆效果」里面（用户 2026-09-28 明选）。 */
  /* ⚠️【装前 / 装后必须是**两个独立 fixture**】早期版本写成一个 `withCard(s)` 在
   *    断言表达式里来回切同一个对象，而断言参数是**从左到右**求值的 ⇒ 条件里先把卡装上去，
   *    同一条 check 的 detail（以及后面的 `rates(lib2)`）读到的已经是装卡态，
   *    症状是「比值恒 1、libraryMul 装前也报 2」这种自相矛盾的输出。
   *    ⚠️ 判据：凡是「X 装前 / X 装后」对照，一律先各自造好，别在同一个对象上切。 */
  const lib2  = sciFx(); lib2.lvl.library = 2;
  const lib2c = sciFx(); lib2c.lvl.library = 2; lib2c.cards = ['card_records'];
  const lib2i  = sciFx(); lib2i.lvl.library = 2; lib2i.lvl.institute = 1;
  const lib2ic = sciFx(); lib2ic.lvl.library = 2; lib2ic.lvl.institute = 1; lib2ic.cards = ['card_records'];
  const sciRatio = SB.BLD.sciRatio, instSci = SB.BLD.instituteSci;
  /* ⚠️⚠️【语义钉子：翻的是「那一截」而不是「那一条」】
   *    「图书馆效果翻倍」= 图书馆的每级 +10% 变成 +20%（乘区 ×2 落在
   *    `(1 + 图书馆等级 × sciRatio)` 这一截上），**不是**「图书馆 + 研究所合起来 ×2」。
   *    ⇒ 纯图书馆情形下总比值也**不是** 2，而是 (1+2×0.1×2)/(1+2×0.1) = 7/6 ≈ 1.1667。
   *    ⚠️ 两种读法的数字差得很远（1.17 vs 2），所以这条断言是「效果翻倍」这句话
   *       唯一的裁判；改乘区位置之前先回来读这一段。用户 2026-09-28 选的是「只翻
   *       图书馆那一份、研究所那份不翻」，即本条钉住的那一种。 */
  const wantLib = (1 + 2 * sciRatio * 2) / (1 + 2 * sciRatio);
  const gotLib = SB.economy.rates(lib2c).science / SB.economy.rates(lib2).science;
  check('装《历史记录》⇒ 图书馆那一截的效果翻倍（每级 +' + (sciRatio * 100) + '% → ×2）',
    SB.civic.libraryMul(lib2) === 1 && SB.civic.libraryMul(lib2c) === 2 &&
    Math.abs(gotLib - wantLib) < 1e-9,
    lib2.card + ' → ' + lib2c.card + ' 比值=' + gotLib.toFixed(6) + '（整条 ×2 的话会是 2）');
  /* ⚠️ 这条盯的是**括号位置**：研所有一级时比值必须退化成「只翻图书馆那一截」，
   *    而不是 2。写成「整条科技产出 ×2」会把研究所一起翻掉——用户否掉了那一档。 */
  const wantWithInst = (1 + 2 * sciRatio * 2 + instSci) / (1 + 2 * sciRatio + instSci);
  const gotInst = SB.economy.rates(lib2ic).science / SB.economy.rates(lib2i).science;
  check('研究所那份不跟着翻（括号没裹到研究所，有研究所时比值进一步回落）',
    Math.abs(gotInst - wantWithInst) < 1e-9 && Math.abs(gotInst - 2) > 1e-6,
    '比值=' + gotInst.toFixed(6) + '（只翻图书馆=' + wantWithInst.toFixed(6) +
    '；若研究所也被翻，这里会是 2）');
  const gCard = sciFx(); gCard.wonders = { wonder_great_library: true }; gCard.cards = ['card_records']; gCard.card = 'card_records';
  gCard.res.science = 0;
  SB.economy.tick(gCard, 1, noop);
  check('虚级 + 政策卡：tick 与 rates 同式（面板不撒谎）',
    Math.abs(gCard.res.science - SB.economy.rates(gCard).science) < 1e-9,
    'tick=' + gCard.res.science.toFixed(6) + ' rates=' +
    SB.economy.rates(gCard).science.toFixed(6));

  // ④ 研究《法典》⇒ 白送根节点 + 自带酋邦制
  check('法典 cost 0 ⇒ 面板一开就能研究', SB.civic.canResearch(cs, 'laws') === true);
  SB.civic.research(cs, 'laws', noop);
  check('法典完成即自带政体「酋邦制」', cs.gov === 'tribe', 'gov=' + cs.gov);
  check('酋邦制给 1 个政策卡槽（用户「就降到 1 吧」）', SB.civic.slots(cs) === 1);
  check('政体的加成：藻食平坦 +5/秒', SB.civic.flow(cs).kelp === 5);

  // ⑤ 政策卡：装填（安装）永远免费，只有「卸下」扣市政点（2026-10-14 与玩家预期对齐）
  cs.res.culture = 500;
  cs.civics.mystic = 1; cs.civics.craft = 1;   // 直接记为已完成，跳过攒点（攒点速度是标定）
  check('已完成的市政解锁它的政策卡', SB.civic.cardOwned(cs, 'card_mystic') === true);
  /* ⚠️ 2026-10-14 新口径：装填免费、卸下才收费。此前「装和卸都收一次」导致第 2/3 张卡
   *    因点数不足静默装不上（setCard 返回 false），表现为「只能装两个/不能选槽」。 */
  check('装填（安装）永远免费——首次装填不扣点',
    SB.civic.setCard(cs, 'card_mystic', noop) === true && cs.res.culture === 500,
    'culture=' + cs.res.culture);
  check('政策卡装填后才生效（神秘主义 科技 +0.3/秒）',
    Math.abs(SB.civic.flow(cs).science - 0.3) < 1e-9, 'science=' + SB.civic.flow(cs).science);
  const _cardFee = SB.civic.topCost(cs) / 5;
  check('卸下收费单价 = 最高已完成市政研究成本的 1/5', SB.civic.cardCost(cs) === _cardFee);
  /* ⚠️ 2026-10-14 新增「免费卸下机会」后，本节的「卸下扣市政点」断言必须先清零令牌：
   *    第 ④ 节 `research(cs,'laws')` 真的完成了法典 ⇒ 给 cs 送了 1 次免费卸下机会，
   *    不清零则本节卸下会走令牌路径（免费）、culture 不降 ⇒ 断言误红。
   *    清零是为了**隔离测「令牌用尽后的纯市政点收费路径」**；令牌本身的路径由 ⑤c 专测。 */
  cs.cardFreeRemoves = 0;
  /* 卸下才扣点：装填免费、卸下收费，换卡 = 卸旧(付费) + 装新(免费) 总付费一次，无法绕过。 */
  check('卸下收费（唯一扣点动作）',
    SB.civic.setCard(cs, null, noop) === true && cs.res.culture === 500 - _cardFee, 'culture=' + cs.res.culture);
  /* 槽空 ⇒ 加成整体消失（flow 里 policyById(null) 返回 null，不是「给了 0」）。
   * ⚠️ 断言要写在卸下之后：写在前面读到的是**装填中**的 0.3，会误判成没生效。 */
  check('卸下即失效（研究出市政 ≠ 白拿效果）',
    !SB.civic.flow(cs).science && cs.card === null,
    'science=' + SB.civic.flow(cs).science + ' card=' + cs.card);
  /* 重新装填 = 免费（安装不再扣点，仅之前那次卸下已收费） */
  check('重新装填 = 免费（安装不扣点）',
    SB.civic.setCard(cs, 'card_mystic', noop) === true && cs.res.culture === 500 - _cardFee,
    'culture=' + cs.res.culture);
  /* 「拔下 → 再装填」一个来回：卸下扣 1×、装填免费 ⇒ 总共只扣 1 次（不是两次）。 */
  check('「拔下 → 再装填」一个来回只扣 1×',
    SB.civic.setCard(cs, null, noop) === true &&
    SB.civic.setCard(cs, 'card_mystic', noop) === true &&
    Math.abs(cs.res.culture - (500 - 2 * _cardFee)) < 1e-9, 'culture=' + cs.res.culture);
  /* 再换卡仍只扣一次卸下费用，装填免费。
   * 这条证明「装填免费」：若安装也扣点，这里会被再扣一次变 100。 */
  check('两张卡之间互换：卸旧(扣) + 装新(免费) 只扣 1×',
    SB.civic.cardOwned(cs, 'card_craft') === true &&
    SB.civic.setCard(cs, null, noop) === true &&           // 先卸下 mystic
    SB.civic.setCard(cs, 'card_craft', noop) === true &&    // 再装填 craft（免费）
    Math.abs(cs.res.culture - (500 - 3 * _cardFee)) < 1e-9, 'culture=' + cs.res.culture);
  /* 余额归零后卸下应被拦——卸下收费的**拦逆**一侧，别只测扣钱那一侧。 */
  cs.res.culture = 0;
  check('余额为 0 时卸下被拦（卸下收费受付不起约束）',
    SB.civic.setCard(cs, null, noop) === false && cs.card === 'card_craft',
    'card=' + cs.card + ' culture=' + cs.res.culture);
  check('重复采用政体费用 = 最高已完成市政研究成本的 1/5', SB.civic.govCost(cs) === _cardFee);

  // ⑤b 卸下按钮真的上了屏：已装槽渲染出 data-remove，空槽不渲染（否则没法卸下、也没有卸下入口）
  /* ⚠️ 这条钉死本次修复的 UI 缺口：之前「不给拔下按钮」拍板后，说明文案却写「卸下收费」，
   *   形成「广告了卸下却没有入口」的矛盾。现在已装槽必须渲染 data-remove=i。
   *   用 paneCivicSlot 直接吃 s 参数（与 paneCivicGov 同一导出手法），不污染全局 run。 */
  const slotHtml = SB.ui.render.paneCivicSlot(cs);   // cs.cards[0] 仍为 'card_craft'（上面被拦）
  check('已装槽渲染出「卸下」按钮（data-remove=i，input.js 据此扣点）',
    /data-remove="0"/.test(slotHtml) && /class="btn danger"[^>]*data-remove="0"/.test(slotHtml),
    'slotHtml 是否含 data-remove="0"=' + /data-remove="0"/.test(slotHtml));
  const emptyS = cs;                 // 复用 cs（tribe 政体，已确认给 1 槽）
  emptyS.cards = [null];             // 清空已装卡 ⇒ 槽 0 变成空槽
  const emptyHtml = SB.ui.render.paneCivicSlot(emptyS);
  check('空槽不渲染卸下按钮（只对已装槽显示）',
    /data-remove="0"/.test(emptyHtml) === false,
    'emptyHtml 是否误含 data-remove="0"=' + /data-remove="0"/.test(emptyHtml));
  check('政策卡槽使用统一网格容器，卡库保留卡牌与分类结构',
    /class="policy-slot-grid"/.test(slotHtml) && /class="policy-card-grid"/.test(slotHtml) &&
    /class="policy-card /.test(slotHtml), '槽位/卡牌网格标记');
  const policyUi = SB.state.freshRun(false);
  policyUi.gov = 'tribe';
  policyUi.civics.feudalism = 1; policyUi.civics.mystic = 1; policyUi.civics.craft = 1;
  const policyPoolHtml = SB.ui.render.paneCivicSlot(policyUi);
  check('未标类型的政策卡按万能类归组，不再显示 undefined',
    /data-policy-category="wild"/.test(policyPoolHtml) && /data-card="card_serfdom"/.test(policyPoolHtml) &&
    !/undefined/.test(policyPoolHtml), '农奴制万能类归组=' + /data-card="card_serfdom"/.test(policyPoolHtml));
  const happyCardUi = SB.state.freshRun(false);
  happyCardUi.gov = 'autocracy';
  happyCardUi.civics.craft = 1; happyCardUi.civics.rationing = 1;
  happyCardUi.cards = ['card_craft', 'card_rationing', null];
  const happyCardsHtml = SB.ui.render.paneCivicSlot(happyCardUi);
  const happyCardBlocks = happyCardsHtml.match(/<article class="policy-card[\s\S]*?<\/article>/g) || [];
  const cardBlock = id => happyCardBlocks.find(block => block.indexOf('data-card="' + id + '"') >= 0) || '';
  const rationingBlock = cardBlock('card_rationing'), craftBlock = cardBlock('card_craft');
  check('政策卡幸福度惩罚只显示在产生该效果的《工业化配给》上',
    /幸福度 -1（常驻/.test(rationingBlock) && craftBlock && !/幸福度/.test(craftBlock),
    '工业化配给有 -1=' + /幸福度 -1（常驻/.test(rationingBlock) +
      '；技艺卡误带提示=' + /幸福度/.test(craftBlock));

  // ⑤c 免费卸下机会（2026-10-14 新功能）：每完成一个市政 +1、可累积；卸下优先消耗，令牌用尽再走市政点收费
  /* 授予点 = research；消耗点 = setCardAt（卸下优先扣令牌）；拦截点 = cardBlocked（有令牌即便市政点 0 也放行）。
   * 动机：让玩家有节奏地调整政策卡，不被「卸下收费」卡死。 */
  const ft = SB.state.freshRun(false);
  ft.res.culture = 1e9;
  /* ⚠️ SB.CIVICS 是**数组**（civics-data.js `var CIVICS = [...]`），
   *    用 `for..in` 会遍历下标 "0"/"1"… 而非 id ⇒ byId 全 undefined。
   *    必须 `for..of` 取元素再读 c.id。
   * ⚠️ blocked() 要求 isRevealed（s.civShown）⇒ fresh 状态必须先跑一次生产揭示路径
   *    （civic.pump）：法典无鼓舞（boost=null ⇒ boostMet 恒真）必被揭示。 */
  SB.civic.pump(ft, noop);
  let _c1 = null;
  for (const _cv of SB.CIVICS) { if (SB.civic.canResearch(ft, _cv.id)) { _c1 = _cv.id; break; } }
  check('⑤c pump 揭示后能找到一个可研究的市政', !!_c1, 'first=' + _c1);
  const _tok0 = ft.cardFreeRemoves || 0;
  const _r1 = SB.civic.research(ft, _c1, noop);
  check('⑤c 完成一个市政 ⇒ 免费卸下机会 +1',
    _r1 === true && (ft.cardFreeRemoves || 0) === _tok0 + 1, 'cardFreeRemoves=' + ft.cardFreeRemoves);
  /* 累积：第二张走技艺（craft，reqs=[laws] 已满足、cost 100 < 1e9）。
   * 技艺的鼓舞（建工坊）在 fresh 状态没达成 ⇒ pump 不会揭示它；但 ⑤c 测的是**授予机制**
   * 不是揭示机制，所以直接标 civShown（与 pump 揭示后的状态等价）再研究。 */
  ft.civShown.craft = 1;
  const _r2 = SB.civic.research(ft, 'craft', noop);
  check('⑤c 再完成一个市政 ⇒ 机会累积到 2',
    _r2 === true && (ft.cardFreeRemoves || 0) === _tok0 + 2, 'cardFreeRemoves=' + ft.cardFreeRemoves);
  /* 消耗点：装 card_mystic（tribe 万能槽可装任意卡）→ 反复卸下/装回，验证令牌扣减 + 0 市政点不拦 + 用尽后回落收费 */
  const fr = SB.state.freshRun(false);
  fr.gov = 'tribe'; fr.civics.mystic = 1;       // 拥有 card_mystic（cost 100 ⇒ cardCost>0，门槛可测）
  fr.cards = ['card_mystic']; fr.cardEver = true;
  fr.cardFreeRemoves = 2; fr.res.culture = 0;
  const _rm1 = SB.civic.removeCard(fr, 0, noop);
  check('⑤c 有令牌时卸下：成功 + 扣 1 次令牌 + 0 市政点不拦',
    _rm1 === true && fr.cardFreeRemoves === 1 && fr.res.culture === 0,
    'cardFreeRemoves=' + fr.cardFreeRemoves + ' culture=' + fr.res.culture);
  SB.civic.setCard(fr, 'card_mystic', noop);     // 免费装回
  const _rm2 = SB.civic.removeCard(fr, 0, noop);
  check('⑤c 第二次卸下：令牌 2→0，仍不扣市政点',
    _rm2 === true && fr.cardFreeRemoves === 0 && fr.res.culture === 0,
    'cardFreeRemoves=' + fr.cardFreeRemoves + ' culture=' + fr.res.culture);
  SB.civic.setCard(fr, 'card_mystic', noop);     // 再装回（令牌已 0）
  fr.res.culture = 1e9;                          // 令牌用尽 ⇒ 走市政点收费：补够点
  const _before = fr.res.culture, _cc = SB.civic.cardCost(fr);
  const _rm3 = SB.civic.removeCard(fr, 0, noop);
  check('⑤c 令牌用尽后：补够市政点可正常卸下并扣 cardCost',
    _rm3 === true && fr.cards[0] === null && fr.res.culture === _before - _cc,
    'culture=' + fr.res.culture + ' cardCost=' + _cc);
  SB.civic.setCard(fr, 'card_mystic', noop);     // 重装
  fr.res.culture = 0;                            // 令牌=0 且 市政点=0
  const _rm4 = SB.civic.removeCard(fr, 0, noop);
  check('⑤c 令牌=0 且 市政点=0 ⇒ 卸下被拦（门槛仍在）',
    _rm4 === false && fr.cards[0] === 'card_mystic',
    'cardFreeRemoves=' + fr.cardFreeRemoves + ' culture=' + fr.res.culture + ' card=' + fr.cards[0]);

  // ⑥ 付不起就禁止操作，绝不扣成负数
  /* ⚠️ 上一节结束时余额被置 0（卸下被拦），所以这里必须先补钱再装回，
   *    否则这一行自己被拦、测的就不是「付不起」了。装填免费 ⇒ 补钱后直接 setCard 不扣点。 */
  cs.res.culture = 500;
  SB.civic.setCard(cs, 'card_mystic', noop);   // 装填免费，culture 仍为 500
  cs.res.culture = 10;
  check('付不起卸下 ⇒ 禁止（不扣成负数）',
    SB.civic.setCard(cs, null, noop) === false && cs.res.culture === 10,
    'culture=' + cs.res.culture);

  /* ⚠️ 这条是「刷新之后市政树会不会重置」的正面证据，2026-09-27 实测复现过：
   *    state.js 里 `out.civics = fixTable(raw.civics, base.civics)` —— fixTable 按
   *    **ref 的键**遍历，而 base.civics 是空表 `{}` ⇒ 读回的是空对象 ⇒ 所有已完成的
   *    市政没了，政体/政策卡却还在（它们是标量、走 173-174 行的直接拷贝）。
   *    症状只有「树重置了」，不报错，极难察觉。改 state.js 的 civics 读档时先在这里停下。 */
  const sv = SB.state.freshRun(false);
  sv.civics.laws = 1; sv.civics.craft = 1; sv.gov = 'tribe'; sv.cards = ['card_craft'];
  const rv = SB.state.migrateRun(JSON.parse(JSON.stringify(sv)));
  check('刷新（存档 → migrateRun）不掉已完成的市政',
    rv.civics.laws === true && rv.civics.craft === true,
    JSON.stringify(rv.civics));
  check('读回的市政值域统一是真值（不是 1 / 非真值混着）',
    Object.keys(rv.civics).every(function (q) { return rv.civics[q] === true || rv.civics[q] === false; }),
    JSON.stringify(rv.civics));
  /* 老档缺新 id：补成 false，别留 undefined（undefined 会让 topCost 的「已完成」判定落空）。
   * ⚠️ 期望 topCost = 0 不是 100：老档只完成过 laws，而 **laws 的 cost 本身就是 0**
   *    （它是根节点，见 civics.js）；craft 读回是 false ⇒ 不算已完成 ⇒ topCost 就是 0。
   *    写成 100 是我把「缺的那项」当成了「已完成的那项」。 */
  const rv2 = SB.state.migrateRun({ civics: { laws: 1 } });
  check('老档缺新市政 id ⇒ 补 false，不是 undefined',
    rv2.civics.laws === true && rv2.civics.craft === false &&
    isFinite(SB.civic.topCost(rv2)) && SB.civic.topCost(rv2) === 0,
    JSON.stringify(rv2.civics) + ' topCost=' + SB.civic.topCost(rv2));

  // ⑦ 接进真实经济：政体 + 政策卡那两份平坦加值要真的进 tick 与面板
  const gi = SB.state.freshRun(false);
  gi.gov = 'tribe'; gi.cards = ['card_mystic']; gi.card = 'card_mystic';
  gi.lvl.hall = 2; gi.jobs.scribe = 2;
  SB.economy.tick(gi, 1, noop);
  /* ⚠️ 藻食那条是**净**的： tick 先 addRes(+5)，同一趟再减口粮消耗。
   *    pop=1 时正好吃掉 FOOD_PER（2026-09-30 自 0.30 放大到 1.50，2026-10-05 用户拍板再调到 2.00），
   *    所以落点是 5 − FOOD_PER 而不是 5。
   *    写成 5 就说明你没读 economy.tick 的顺序，会把「扣口粮」这条误判成 bug。 */
  check('tick 结出市政点、藻食 +5 净、科技 +0.3 三份',
    Math.abs(gi.res.culture - (2 * SB.UNIT.culture + 2 * SB.CFG.CIVIC.HALL_RATE)) < 1e-9 &&
    Math.abs(gi.res.science - 0.3) < 1e-9 &&
    Math.abs(gi.res.kelp - (5 - SB.CFG.FOOD_PER * gi.pop)) < 1e-9,
    'culture=' + gi.res.culture.toFixed(3) + ' science=' + gi.res.science.toFixed(3) +
    ' kelp=' + gi.res.kelp.toFixed(3) + '（5 − 口粮 ' + (SB.CFG.FOOD_PER * gi.pop) + '）');
  check('同样的三份也出现在 rates 上（面板不撒谎）',
    Math.abs((SB.economy.rates(gi).kelp + SB.economy.foodUse(gi)) - 5) < 1e-9 &&
    Math.abs(SB.economy.rates(gi).science - 0.3) < 1e-9);

  // ⑧ UI 落点：页签、面板容器、职业表
  /* ⚠️ 这条断言**直接读 index.html 而不是查假 DOM**：
   *    假 DOM 的 .tab 列表是手写的桩（见上面那处注释），查它只能证明「桩里有」。
   *    要证明的是**真实页面上写没写**，所以这里读文件、搜属性。 */
  const realHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('真实 index.html 里写着市政页签与面板容器',
    realHtml.indexOf('data-tab="civic"') >= 0 && realHtml.indexOf('id="pane-civic"') >= 0);
  check('真实 index.html 加载了市政脚本（且早于 state，被 economy 调用）',
    /civics\.js\?v=\d+/.test(realHtml) &&
    realHtml.indexOf('civics.js') < realHtml.indexOf('src/state.js'));
  check('市政页容器已就位', !!doc.getElementById('pane-civic'));
  check('市政页已注册进面板表', SB.ui.render.PANE_KEYS.indexOf('civic') >= 0,
    SB.ui.render.PANE_KEYS.join(','));
  /* 信仰页（2026-09-30 用户：「单独起一个信仰面板」）：与巢穴/科技/市政并列的独立页签，
   * 命名框 #religionBox 移入 #pane-faith 内（持久节点，护住输入框焦点）。
   * ⚠️ 这条断言**直接读 index.html 而不是查假 DOM**（理由同上方市政页那条注释）。 */
  check('真实 index.html 里写着信仰页签、面板容器与命名框',
    realHtml.indexOf('data-tab="faith"') >= 0 &&
    realHtml.indexOf('id="pane-faith"') >= 0 &&
    realHtml.indexOf('id="religionBox"') >= 0 &&
    realHtml.indexOf('id="pane-faith-body"') >= 0);
  check('信仰页容器已就位', !!doc.getElementById('pane-faith'));
  check('信仰页已注册进面板表（且排在 civic 之后）',
    SB.ui.render.PANE_KEYS.indexOf('faith') >= 0 &&
    SB.ui.render.PANE_KEYS.indexOf('faith') > SB.ui.render.PANE_KEYS.indexOf('civic'),
    SB.ui.render.PANE_KEYS.join(','));
  check('假 DOM 页签表已含 faith（syncTabLocks 能取到信仰页门槛）',
    doc.querySelectorAll('.tab').some(t => t.dataset.tab === 'faith'));
  check('书手三处表齐全：JOBS / folk.IDS / 状态默认表',
    SB.JOBS.some(j => j.id === 'scribe') &&
    SB.folk.IDS.indexOf('scribe') >= 0 &&
    SB.state.freshRun(false).jobs.scribe === 0);
  /* ⚠️ 2026-09-30：folk.IDS 已改为**从 SB.JOBS 派生**（商人漏抄那次的根因修复）。
   *   这条把「两份表逐项一致（含顺序）」焊死 —— 以后加职业只需改 config.JOBS；
   *   派生一旦被破坏（比如有人又手抄回去）立刻变红。 */
  check('folk.IDS 与 config.JOBS 逐项一致（含顺序）',
    SB.folk.IDS.length === SB.JOBS.length &&
    SB.JOBS.every((j, i) => SB.folk.IDS[i] === j.id),
    'IDS=' + SB.folk.IDS.join(',') + ' / JOBS=' + SB.JOBS.map(j => j.id).join(','));
  check('书手由「石工」解锁（与议事厅同一个科技）',
    SB.folk.jobTechOf('scribe') === 'masonry', '→ ' + SB.folk.jobTechOf('scribe'));
  const scribeRenameRun = SB.state.freshRun(false);
  check('行政部门完成前，scribe 职业显示为书手',
    SB.folk.jobName(scribeRenameRun, 'scribe') === '书手');
  scribeRenameRun.civics.department = 1;
  check('完成声明 scribeRename 的行政部门后，职业显示名变为官员',
    SB.civic.byId('department').scribeRename === true &&
    SB.folk.jobName(scribeRenameRun, 'scribe') === '官员',
    SB.folk.jobName(scribeRenameRun, 'scribe'));

  /* ⑨ bot 是否真的跑过这条线。断言放在最后是因为它读的是**整局结束后的真实存档**——
   *    ⚠️ 「回归全绿」证明不了新东西在跑。书手若不在 bot 的配工权重表里（上面 ② 那处），
   *       市政点恒 0、市政页永不开、法典永远研究不了，而**不会有任何一条断言变红**。
   *    所以下面这三条是这条纪律的执行者，不是锦上添花。 */
  const fin = SB.game.run();
  check('整局跑完：议事厅建起 ⇒ 市政页开过', SB.civic.panelOpen(fin) === true, 'hall=' + fin.lvl.hall);
  check('整局跑完：市政点确实产过（书手与议事厅两条都在产）',
    (fin.got.culture || 0) > 0, '累计 ' + (fin.got.culture || 0).toFixed(1) + ' 点');
  check('整局跑完：法典已完成并采用已拥有的政体', !!fin.civics.laws &&
    !!SB.civic.govById(fin.gov) && SB.civic.govOwned(fin, fin.gov),
    'civics=' + JSON.stringify(fin.civics) + ' gov=' + fin.gov);

  /* ── 市政树横卷几何（用户 2026-09-27「市政树要做成科技树这样」）──
   * ⚠️ 只断言「页面上出现过市政三个字」是不够的：缩进列表也能过，而那正是这次要消灭的。
   *    几何是判据本身 —— 于是这里按 (列, 行) 把形状重新推一遍，与渲染用的是同一个 layout()。 */
  const CL = SB.civic.layout();
  const cellL = CL.cells.laws, cellC = CL.cells.craft, cellM = CL.cells.mystic;
  check('市政树是横卷：三条节点摊到 (列, 行) 上，不是一列竖排',
    !!cellL && !!cellC && !!cellM &&
    cellL.col === 0 && cellL.row === 0 &&
    cellC.col === 1 && cellM.col === 1 &&
    cellC.row !== cellM.row,
    `法典(c${cellL.col},r${cellL.row}) 技艺(c${cellC.col},r${cellC.row}) ` +
    `神秘主义(c${cellM.col},r${cellM.row})`);

  check('市政树用与科技树相同的卡片尺寸（两张树长得一样高）',
    CL.geo.W === SB.tech.geo.W && CL.geo.H === SB.tech.geo.H &&
    CL.geo.PADX === SB.tech.geo.PADX && CL.geo.PADY === SB.tech.geo.PADY,
    `市政 ${CL.geo.W}×${CL.geo.H} / 科技 ${SB.tech.geo.W}×${SB.tech.geo.H}`);

  /* 连线必须数与 reqs 数一致：少一条线时树是「断的」，而渲染层对此完全静默。 */
  const reqN = SB.CIVICS.filter(c => c.reqs && c.reqs.length)
    .reduce((n, c) => n + c.reqs.length, 0);
  check('市政树的连线条数与 reqs 总数一致（线不是漏画的）',
    CL.edges.length === reqN && CL.edges.length > 0,
    `${CL.edges.length} 条线 / ${reqN} 条 reqs`);

  /* 已达成的鼓舞不印 `2 / 1` 这种「超上限」读数（工坊 2 级 vs 条件 1 级）。
   * ⚠️ 这条盯的是 condShort 的原始读数**不能直接上屏**：它返回的 now 可以大于 need，
   *    照搬会读成「坏掉了」。boostText 必须在达成时改念条件本身。 */
  const cs2 = SB.state.freshRun(false);
  cs2.lvl.hall = 1; cs2.lvl.workshop = 2;          // 条件要 1 级，现给 2 级 ⇒ now > need
  const craftC = SB.civic.byId('craft');
  const bt = SB.civic.boostText(cs2, craftC);
  check('鼓舞已达成时不显示「2 / 1」这种超上限读数',
    bt.indexOf('2 / 1') === -1 && bt.indexOf('已达成') >= 0 &&
    SB.civic.condShort(cs2, craftC.boost).now > craftC.boost.n,
    bt + '（condShort 原始读数 ' + SB.civic.condShort(cs2, craftC.boost).txt + '）');

  /* ── 政体 / 政策卡（Civ6 式外壳，用户 2026-09-27「做成文明 6 那样」）──
   * ⚠️ 这批不是「UI 好看不好看」的断言。核心是三条机制真的存在：
   *      ① 政体带**槽位配方**（不只是槽位数），换政体 = 换被动 + 换配方；
   *      ② 政策卡带**类型**，且规则真的拦（cardFits 不是摆设）；
   *      ③ 状态层此刻只承载 1 个槽 —— 下面第 4 条把这个限制钉住，
   *         否则「只加配方不迁状态」会让面板画出两个空格子、装填第二个永远失败。 */
  const cs3 = SB.state.freshRun(false);
  cs3.lvl.hall = 1;
  cs3.civics.laws = 1; cs3.gov = 'tribe';
  const tribe = SB.GOVS.find(v => v.id === 'tribe');
  const cmyst = SB.POLICIES.find(p => p.id === 'card_mystic'); // type sci
  check('政体的 slots 是**槽位配方**（各类型各几个），不是槽位数',
    tribe && typeof tribe.slots === 'object' && tribe.slots.wild === 1 &&
    SB.civic.slotList(cs3).length === 1 &&
    SB.civic.slotTypeName(SB.civic.slotList(cs3)[0].type) === '万能槽',
    JSON.stringify(tribe.slots) + ' → ' + SB.civic.slotTypeName(SB.civic.slotList(cs3)[0].type));

  check('政策卡带类型，且规则真拦：科研槽装不下工造卡',
    cmyst.type === 'sci' &&
    SB.civic.cardFits(cmyst, 'sci') === true &&
    SB.civic.cardFits(cmyst, 'prod') === false &&
    SB.civic.cardFits(cmyst, 'wild') === true &&
    /* 老卡没标类型 ⇒ 不硬堵（缺省视同万能），否则一张卡会永久装不进去 */
    SB.civic.cardFits({ name: '没标类型的老卡' }, 'prod') === true,
    cmyst.name + '=' + cmyst.type + '：科研槽✓ 工造槽✗ 万能槽✓');

  /* ⚠️ 这条盯的是上面那个脱钩坑：只改配方、不动状态 ⇒ 面板画出两个槽而状态只记得一张。
   *    判据不用「配方有几个槽」，而用「**状态层能承载几个**」——
   *    因为单值 s.card 是此刻的唯一事实。加第二槽时这条会红，提醒你连状态一起升维。 */
  const cap = 3;                                    // 状态已升维到 s.cards 数组 ⇒ 承载 3 个槽
  const recipeN = (() => { let n = 0; for (const k in tribe.slots) n += tribe.slots[k]; return n; })();
  check('配方槽数不超过状态层能承载的槽数（状态已升维到 s.cards，cap=3）',
    recipeN <= cap, `tribe 配方 ${recipeN} 个 / 状态承载 ${cap} 个`);

  /* ── 多槽（2026-09-29：三种纪元二政体各 3 槽，状态升维 s.cards）── */
  const era2Govs = ['autocracy', 'oligarchy', 'classical_republic'];
  let allThree = true, badThree = [];
  for (const gid of era2Govs) {
    const g = SB.GOVS.find(v => v.id === gid);
    let n = 0; for (const k in g.slots) n += g.slots[k];
    const st = SB.state.freshRun(false); st.gov = gid;
    const L = SB.civic.slotList(st).length;
    if (n !== 3 || L !== 3) { allThree = false; badThree.push(gid + '=' + n + '/' + L); }
  }
  check('三种纪元二政体各给 3 个槽（用户「三个政体都给三个槽」），配方与状态一致',
    allThree, badThree.join(' '));

  /* 多槽可同时装多张卡：flow 逐槽聚合、乘区逐槽相乘。 */
  const g3 = SB.state.freshRun(false);
  g3.civics = { laws: 1, craft: 1, mystic: 1, drama: 1, records: 1, theology: 1, political: 1 };
  g3.gov = 'autocracy'; g3.cards = []; g3.res.culture = 9999;
  check('独裁统治给 3 个槽', SB.civic.slots(g3) === 3);
  check('可同时装 3 张卡（填满 3 槽）',
    SB.civic.setCard(g3, 'card_mystic', noop) &&
    SB.civic.setCard(g3, 'card_drama', noop) &&
    SB.civic.setCard(g3, 'card_records', noop) &&
    g3.cards.filter(Boolean).length === 3, 'cards=' + JSON.stringify(g3.cards));
  check('flow 逐槽聚合：3 槽里神秘主义贡献 science +0.3',
    Math.abs(SB.civic.flow(g3).science - 0.3) < 1e-9, 'science=' + SB.civic.flow(g3).science);
  check('乘区逐槽相乘：广场×2 与图书馆×2 各自生效',
    SB.civic.squareMul(g3) === 2 && SB.civic.libraryMul(g3) === 2,
    'squareMul=' + SB.civic.squareMul(g3) + ' libraryMul=' + SB.civic.libraryMul(g3));
  /* 2026-10-07 用户拍板：槽上不再有「拔下」按钮——满槽装填 = 直接覆盖第一张对口已装卡。 */
  check('满槽再装填 ⇒ 直接覆盖第 0 号槽（装填即覆盖，无卸除入口）',
    SB.civic.setCard(g3, 'card_theology', noop) &&
    g3.cards[0] === 'card_theology' &&
    g3.cards[1] === 'card_drama' && g3.cards[2] === 'card_records',
    'cards=' + JSON.stringify(g3.cards));
  /* 换政体截断溢出槽：独裁(3) → 酋邦制(1) 只保留第 0 号槽。 */
  SB.civic.setGov(g3, 'tribe', noop);
  check('换政体截断溢出槽（独裁3槽→酋邦制1槽，保留第0号槽的卡）',
    SB.civic.slots(g3) === 1 && g3.cards.length === 1 && g3.cards[0] === 'card_theology',
    'cards=' + JSON.stringify(g3.cards));
  /* 逐槽拔下：removeCard 只清指定槽，不碰其他槽。 */
  const g4 = SB.state.freshRun(false);
  g4.civics = { laws: 1, political: 1, mystic: 1, records: 1 };
  g4.gov = 'autocracy'; g4.res.culture = 9999;
  SB.civic.setCard(g4, 'card_mystic', noop); SB.civic.setCard(g4, 'card_records', noop);
  check('逐槽拔下只清指定槽，其余槽不动',
    SB.civic.removeCard(g4, 0, noop) &&
    g4.cards[0] === null && g4.cards[1] === 'card_records',
    'cards=' + JSON.stringify(g4.cards));

  /* 类型不匹配必须能被解释出来 —— 按钮灰着却不说话，玩家只会觉得坏了。 */
  const cs4 = SB.state.freshRun(false);
  cs4.lvl.hall = 1; cs4.civics.laws = 1; cs4.civics.craft = 1; cs4.civics.mystic = 1; cs4.gov = 'tribe';
  const prodCard = SB.POLICIES.find(p => p.id === 'card_craft');
  cs4.cards = ['card_craft']; cs4.card = 'card_craft';
  /* 造一个「非万能槽」的情形：酋邦制是万能槽，所以它装工造卡是合法的。
   * 于是拿**万能槽规则**去验证：任何卡都能塞 ⇒ 不该报「不对口」。 */
  const noFitWhy = SB.civic.cardBlocked(cs4, cmyst.id);
  check('万能槽装科研卡不报「不对口」（外壳上线但类型此刻不咬人，是预期的）',
    noFitWhy === null, 'cardBlocked → ' + (noFitWhy === null ? 'null（允许装填）' : noFitWhy));
  /* 直接验证规则层：把槽位换成工造槽，同一张卡就该被拒。 */
  const cs5 = SB.state.freshRun(false);
  cs5.lvl.hall = 1; cs5.civics.laws = 1; cs5.civics.craft = 1; cs5.civics.mystic = 1; cs5.gov = 'tribe';
  const tribeFake = SB.GOVS.find(v => v.id === 'tribe');
  const realSlots = tribeFake.slots;
  tribeFake.slots = { prod: 1 };                    // 临时改成工造槽
  const whyProd = SB.civic.cardBlocked(cs5, cmyst.id);
  tribeFake.slots = realSlots;                      // 还原，别污染后续断言
  check('工造槽装科研卡 ⇒ 明确报装不下并指出类型（灰按钮有话说，不是静默失败）',
    whyProd !== null &&
    whyProd.indexOf('装不下') >= 0 && whyProd.indexOf('神秘主义') >= 0 &&
    whyProd.indexOf('科研槽') >= 0,
    whyProd);

  /* ── 政治哲学 + 三种政体（2026-09-29 用户规格）──
   * ⚠️ 与政体外壳同批：核三件事真存在：
   *      ① 政治哲学解锁三条政体（govs 数组被 govOwned 认）；
   *      ② 三选一采用后各自效果真进结算（工坊效率/奢侈品/幸福度）；
   *      ③ 采用走 setGov（重复采用时按最高已完成市政成本的 1/5 收费），不自动锁死。 */
  const pol = SB.state.freshRun(false);
  pol.lvl.hall = 1; pol.civics.laws = 1; pol.gov = 'tribe';
  check('政治哲学未完成 ⇒ 三种政体都锁（govOwned=false）',
    SB.civic.govOwned(pol, 'autocracy') === false &&
    SB.civic.govOwned(pol, 'oligarchy') === false &&
    SB.civic.govOwned(pol, 'classical_republic') === false, 'govOwned 三者');
  pol.civics.political = 1;
  check('政治哲学完成 ⇒ 解锁三种政体（govs 数组生效，三选一）',
    SB.civic.govOwned(pol, 'autocracy') === true &&
    SB.civic.govOwned(pol, 'oligarchy') === true &&
    SB.civic.govOwned(pol, 'classical_republic') === true, 'govOwned 三者');

  /* 渲染层：未解锁的政体整张卡不显示（2026-10-05 用户「政体不解锁就不要露出来」）。
   * 复用 paneWonder 同款手法：直接调导出的 paneCivicGov(st) 拿 HTML 字符串断言，
   * 不污染全局 SB.game.S。govOwned 读对应市政 s.civics[c.id]，与 setGov 同源。 */
  {
    const st = SB.state.freshRun(false);
    st.lvl.hall = 1;                 // 议会厅建成 ⇒ 市政页开门（civics.panelOpen）
    // 不置 civics.laws ⇒ 法典未完成 ⇒ 任何政体都不 owned
    const locked = SB.ui.render.paneCivicGov(st);
    const lockedIds = ['tribe', 'autocracy', 'oligarchy', 'classical_republic',
      'monarchy', 'merchant_republic', 'theocracy'];
    const anyRow = lockedIds.some(id => locked.indexOf('govrow-' + id) >= 0);
    const tagUnlocked = '<span class="tag">未解锁</span>';   // 旧渲染对每张锁卡打的灰标
    check('政体面板：全未解锁时不渲染任何政体卡（含酋邦制）',
      !anyRow && locked.indexOf(tagUnlocked) < 0 &&
      locked.indexOf('政体系统尚未开启') >= 0,
      '含任何行=' + anyRow + ' 含未解锁标=' + (locked.indexOf(tagUnlocked) >= 0));
    st.civics.laws = 1;              // 研究《法典》⇒ 自带酋邦制（e2e:2323）
    const oneOwned = SB.ui.render.paneCivicGov(st);
    check('政体面板：完成《法典》后只渲染酋邦制，其余仍不露脸',
      oneOwned.indexOf('govrow-tribe') >= 0 &&
      ['autocracy', 'oligarchy', 'classical_republic',
        'monarchy', 'merchant_republic', 'theocracy'].every(
        id => oneOwned.indexOf('govrow-' + id) < 0) &&
      oneOwned.indexOf(tagUnlocked) < 0,
      'tribe行=' + (oneOwned.indexOf('govrow-tribe') >= 0));
    st.civics.political = 1;
    const withChoices = SB.ui.render.paneCivicGov(st);
    SB.ui.render.toggleGovDetail('autocracy');
    const expandedChoice = SB.ui.render.paneCivicGov(st);
    check('候选政体名称可展开完整效果，采用按钮仍独立可用',
      /data-gov-detail="autocracy" aria-expanded="true"/.test(expandedChoice) &&
      /id="govdetail-autocracy"/.test(expandedChoice) &&
      /data-gov="autocracy"/.test(expandedChoice) &&
      /首次免费/.test(expandedChoice) &&
      /gov-choice-grid/.test(withChoices),
      '展开=' + /id="govdetail-autocracy"/.test(expandedChoice) +
      ' 采用按钮=' + /data-gov="autocracy"/.test(expandedChoice));
    SB.ui.render.toggleGovDetail('autocracy');
  }

  /* ── 2026-10-13 用户反馈四项回归（面板===结算 / 选槽 / 工民分配 / 暖石读数）──
   * 这四条是真实玩家反馈的回归钉：任何改动若让「面板与结算同源」或「选槽对口」破功，这里立刻红。 */

  /* ① 商人共和国 −30% 幸福度消耗必须进 **tick 结算**（原先只 happyBurn 面板减、_D 不减
   *    ⇒ 玩家看到「消耗 0.7」但幸福度不掉那 0.3/s）。每帧 s.happy 下滑量应与政体乘子成比。 */
  {
    const mkHap = () => { const s = SB.state.freshRun(false); s.pop = 10; s.civics.trade = 1; s.jobs.merchant = 0; s.happy = 5; return s; };
    const ht = mkHap(); ht.gov = 'tribe';
    const hm = mkHap(); hm.gov = 'merchant_republic';
    SB.economy.tick(ht, 1); SB.economy.tick(hm, 1);
    const dtT = ht.happy - 5, dtM = hm.happy - 5;
    check('🚨 商人共和国 −30% 幸福度消耗进 tick 结算（每帧下滑 = 部落制的 0.7×）',
      dtT < 0 && dtM < 0 && Math.abs(dtM / dtT - 0.7) < 1e-6,
      'tribeΔ=' + dtT.toFixed(8) + ' MRΔ=' + dtM.toFixed(8) + ' 比=' + (dtM / dtT).toFixed(6));
  }

  /* ② 政策卡「按类型选槽」：宗教卡必须进宗教槽，绝不挤占万能槽（用户实测「宗教槽空着、卡塞进万能槽」）。
   * 神权政体带 3 万能 + 1 宗教槽；自动装填宗教卡应落在宗教槽位，万能槽保持空。 */
  {
    const rs = SB.state.freshRun(false);
    rs.lvl.hall = 1; rs.gov = 'theocracy'; rs.civics.reformed = 1; rs.res.culture = 9999;
    const L = SB.civic.slotList(rs);
    const religIdx = L.findIndex(x => x.type === 'relig');
    const ok = SB.civic.setCard(rs, 'card_divine_right', noop) === true
      && religIdx >= 0 && rs.cards[religIdx] === 'card_divine_right'
      && L.every((x, i) => x.type !== 'wild' || rs.cards[i] == null);
    check('🚨 宗教卡自动装填进宗教槽（不挤占万能槽，用户「宗教槽空着」回归）',
      ok, 'religIdx=' + religIdx + ' cards=' + JSON.stringify(rs.cards));
  }

  /* ③ 工人分配一键最大 / 最小：最大把闲置全塞进该职业、最小清零（受 jobUnlocked 门控，与 assign 同源）。 */
  {
    const fs = SB.state.freshRun(false);
    fs.pop = 10; fs.jobs = {};
    const okMax = SB.folk.assignMax(fs, 'gather') === true && (fs.jobs.gather || 0) === 10 && (fs.pop - (fs.jobs.gather || 0)) === 0;
    const okMin = SB.folk.assignMin(fs, 'gather') === true && (fs.jobs.gather || 0) === 0 && (fs.pop - 0) === 10;
    check('🚨 工人一键最大：闲置全塞进职业；一键最小：清零退回闲置',
      okMax && okMin, 'max后gather=' + (fs.jobs.gather || 0) + ' idle=' + (fs.pop - (fs.jobs.gather || 0)));
  }

  /* ③b 批量步进（2026-10-14 猫国式 ±5/±10）：assign 按 |delta| 批量 + 双向钳制
   *（加钳到 idle、减钳到在岗数）。±1 时必须与旧版逐次点击完全等价。 */
  {
    const bs = SB.state.freshRun(false);
    bs.pop = 12; bs.jobs = {};
    const a1 = SB.folk.assign(bs, 'gather', 5) === true && (bs.jobs.gather || 0) === 5 && (bs.pop - 5) === 7;
    const a2 = SB.folk.assign(bs, 'gather', 10) === true && (bs.jobs.gather || 0) === 12;  // idle 7 ⇒ 钳到 7，不是 10
    const a3 = SB.folk.assign(bs, 'gather', 1) === false;                                   // idle 0 ⇒ 拒绝
    const a4 = SB.folk.assign(bs, 'gather', -10) === true && (bs.jobs.gather || 0) === 2;   // 在岗 12 ⇒ 退 10
    const a5 = SB.folk.assign(bs, 'gather', -5) === true && (bs.jobs.gather || 0) === 0;    // 在岗 2 ⇒ 钳到全退
    const a6 = SB.folk.assign(bs, 'gather', -1) === false;                                  // 在岗 0 ⇒ 拒绝
    const a7 = SB.folk.assign(bs, 'gather', 0) === false;                                   // 步长 0 ⇒ 无动作
    check('🚨 批量步进 ±5/±10：加钳到闲置、减钳到在岗；±1 等价旧版；0/超额边界拒绝',
      a1 && a2 && a3 && a4 && a5 && a6 && a7,
      'gather=' + (bs.jobs.gather || 0) + ' idle=' + (bs.pop - (bs.jobs.gather || 0)));
    /* 解锁守卫对批量同样生效（+5 也不许雇未解锁职业）。 */
    const lk = SB.state.freshRun(false);
    lk.pop = 10; lk.jobs = {};
    check('🚨 批量加人同样受 jobUnlocked 门控（未解锁 +5 被拒）',
      SB.folk.assign(lk, 'merchant', 5) === false && (lk.jobs.merchant || 0) === 0);
  }

  /* ④ 暖石面板读数：汽轮机每秒暖石消耗 = 运行座数 × hydroWarm × warmEff（降耗科技收窄），
   * 且 warmEff 已导出（UI 不谎报基准值）。面板===结算：tick 实扣用的是同一 warmEff。 */
  {
    const ws = SB.state.freshRun(false);
    ws.lvl.hydroturbine = 3; ws.turbineStop = 0;
    const base = ws.lvl.hydroturbine * SB.UNIT.hydroWarm * SB.economy.warmEff(ws);
    ws.techs = ws.techs || {}; ws.techs.refine = 1; ws.techs.specfuel = 1;
    const cut = ws.lvl.hydroturbine * SB.UNIT.hydroWarm * SB.economy.warmEff(ws);
    check('🚨 汽轮机暖石消耗读数 = 运行座数×hydroWarm×warmEff，且降耗科技收窄',
      SB.economy.warmEff(ws) > 0 && cut < base && Math.abs(cut - base * 0.49) < 1e-9,
      'base=' + base.toFixed(4) + ' cut=' + cut.toFixed(4) + ' warmEff=' + SB.economy.warmEff(ws).toFixed(4));
  }

  /* ⑤ 装填免费 / 仅卸下扣点（2026-10-14 修）：此前装与卸都扣 topCost，导致第 2/3 张卡因点数不足
   *   静默装不上（setCard 返回 false + 一句 log），表现为「只能装两个 / 不能选槽 / 万能槽装不上」。
   *   现改为：安装（setCardAt 的 id≠null）永远免费；只有卸下（id===null）才走 cardCost 扣点路径。
   *   用 0 市政点把 3 槽装满，证明安装不再被点数拦截。 */
  {
    const cs = SB.state.freshRun(false);
    cs.lvl.hall = 1; cs.gov = 'autocracy'; cs.res = cs.res || {}; cs.res.culture = 0; // 故意 0 点
    ['drama', 'theology', 'market'].forEach(k => cs.civics[k] = 1);
    const a = SB.civic.setCard(cs, 'card_drama', noop, 0);
    const b = SB.civic.setCard(cs, 'card_theology', noop, 1);
    const c = SB.civic.setCard(cs, 'card_market', noop, 2);
    const allIn = a && b && c && cs.cards[0] === 'card_drama' && cs.cards[1] === 'card_theology' && cs.cards[2] === 'card_market';
    // 装填全程 0 点已验证免费；再给足点数验证「卸下」走独立扣点路径（与安装互不污染）
    cs.res.culture = 1e9;
    const before = cs.res.culture;
    const rm = SB.civic.removeCard(cs, 0, noop);
    check('🚨 装填免费（0 市政点也能装满 3 槽；原 bug「第 2/3 张静默装不上」回归）；卸下走扣点路径',
      allIn && rm && cs.cards[0] === null && cs.res.culture <= before,
      'install3=' + allIn + ' cards=' + JSON.stringify(cs.cards) + ' 卸下成功=' + rm);
  }

  /* 独裁 +10% 工坊效率：加法档，与建筑级/科技/奇观同聚合 */
  const au = SB.state.freshRun(false); au.gov = 'autocracy';
  check('独裁统治：工坊效率 +10%（craftRatio 含政体项，加法档）',
    Math.abs(SB.workshop.craftRatio(au) - 0.10) < 1e-9 &&
    Math.abs(SB.workshop.craftMul(au) - 1.10) < 1e-9,
    'craftRatio=' + SB.workshop.craftRatio(au) + ' craftMul=' + SB.workshop.craftMul(au));

  /* 技艺 +20% 工坊效率（政策卡，2026-09-30 用户拍）：走与政体同一条加法乘区，
   * 装在卡槽里才生效（cardCraftRatio 读 s.cards，与 mulOfField 同口径）。 */
  const cc = SB.state.freshRun(false); cc.civics.craft = 1; cc.cards = ['card_craft']; cc.card = 'card_craft';
  check('技艺卡：工坊效率 +20%（craftRatio 含卡片项，装槽才生效）',
    SB.civic.policyById('card_craft').craftRatio === 0.20 &&
    Math.abs(SB.workshop.craftRatio(cc) - 0.20) < 1e-9 &&
    Math.abs(SB.workshop.craftMul(cc) - 1.20) < 1e-9,
    'card craftRatio=' + SB.civic.policyById('card_craft').craftRatio +
    ' craftRatio(cc)=' + SB.workshop.craftRatio(cc));

  /* ══ ERA6 市政系统（2026-10-12 实装）═════════════════════════════
   * 钉住：10 项市政 / 3 政体 / 3 政策卡的数据形状 + 关键接线。
   * 不钉数值（cost 是提议值，待标定）；钉的是结构与「指针真的命中」。 */
  {
    const cBy = id => SB.CIVICS.find(c => c.id === id);
    const want = ['massmedia','naturalhistory','macroeconomics','urbandesign','archaeology',
                  'ideology','civilization','theo_merit','egalitarianism','federalism'];
    check('ERA6：10 项市政全部存在', want.every(id => !!cBy(id)),
      want.filter(id => !cBy(id)).join(',') || '全到齐');
    check('ERA6：10 项市政 era 均为 6', want.every(id => cBy(id).era === 6));
    check('ERA6：10 项市政均带 cost（非根节点）', want.every(id => typeof cBy(id).cost === 'number'));
    check('ERA6：所有前置(reqs)命中现有市政',
      want.every(id => (cBy(id).reqs || []).every(r => !!cBy(r))));
    /* built 类鼓舞 → 真实建筑；cycle 阈值；lifetimeCulture 门槛；civic 指针 */
    check('ERA6：built 类鼓舞指向真实建筑（tenement/museum/bank/canal）',
      ['massmedia','naturalhistory','macroeconomics','urbandesign'].every(id => {
        const b = cBy(id).boost; return b && b.t === 'built' && SB.BUILDINGS && SB.BUILDINGS.some(x => x.id === b.b); }));
    check('ERA6：考古/文明 鼓舞走 cycle 阈值（3/7），博物学走 built（博物馆 3 级）',
      cBy('naturalhistory').boost.t === 'built' && cBy('naturalhistory').boost.b === 'museum' && cBy('naturalhistory').boost.n === 3 &&
      cBy('archaeology').boost.t === 'cycle' && cBy('archaeology').boost.n === 3 &&
      cBy('civilization').boost.t === 'cycle' && cBy('civilization').boost.n === 7);
    check('ERA6：意识形态 鼓舞走 lifetimeCulture（门槛 900000）',
      cBy('ideology').boost.t === 'lifetimeCulture' && cBy('ideology').boost.n === 900000);
    check('ERA6：三新政府市政 鼓舞走 civic（完成意识形态）',
      ['theo_merit','egalitarianism','federalism'].every(id => cBy(id).boost.t === 'civic' && cBy(id).boost.id === 'ideology'));
    check('ERA6：大众传媒/博物学/意识形态 各解锁一张政策卡',
      cBy('massmedia').card === 'card_massmedia' && cBy('naturalhistory').card === 'card_museum' &&
      cBy('ideology').card === 'card_national_solidarity');
    check('ERA6：三新政府市政各带 gov（theo_state/egalitarianism/federalism）',
      cBy('theo_merit').gov === 'theo_state' && cBy('egalitarianism').gov === 'egalitarianism' &&
      cBy('federalism').gov === 'federalism');
    check('ERA6：城市设计解锁奇观 全国快速物流通道（needCivic=urbandesign, canalCraftIronSteel=0.01）',
      !!SB.WONDERS.find(w => w.id === 'wonder_national_logistics' && w.needCivic === 'urbandesign' &&
        w.effect && w.effect.canalCraftIronSteel === 0.01));
    /* 政体形状：7 万能槽 + 效果字段 */
    const gBy = id => SB.GOVS.find(g => g.id === id);
    check('ERA6：三新政府均给 7 万能槽',
      ['theo_state','egalitarianism','federalism'].every(id => { const g = gBy(id); return g && g.slots && g.slots.wild === 7; }));
    check('ERA6：教权国 faithPerBuilding=1；平等主义 三 perPop=0.001；联邦制 civic/sci ×1.1、食物 −0.10',
      gBy('theo_state').faithPerBuilding === 1 &&
      gBy('egalitarianism').craftPerPop === 0.001 && gBy('egalitarianism').hydroPerPop === 0.001 && gBy('egalitarianism').minePerPop === 0.001 &&
      gBy('federalism').civicOutMul === 1.1 && gBy('federalism').sciOutMul === 1.1 && gBy('federalism').mermanFoodMul === 0.10);
    /* 政策卡形状 */
    check('ERA6：三张政策卡 civic 字段命中对应市政 + 效果字段',
      SB.civic.policyById('card_massmedia').civic === 'massmedia' && SB.civic.policyById('card_massmedia').civicPerPop === 0.5 &&
      SB.civic.policyById('card_museum').civic === 'naturalhistory' && SB.civic.policyById('card_museum').museumMul === 2 &&
      SB.civic.policyById('card_national_solidarity').civic === 'ideology' && SB.civic.policyById('card_national_solidarity').craftRatio === 0.80);
  }

  /* ERA6 接线功能验证（造态喂读数函数，证「效果真的出来」，不靠肉眼看面板） */
  {
    const f0 = SB.state.freshRun(false), f1 = SB.state.freshRun(false); f1.civics.archaeology = true;
    check('ERA6：考古学完成 ⇒ 艺术品制造消耗 ×0.8',
      SB.workshop.craftCostMul(f0, { id: 'craft_artwork' }) === 1 &&
      SB.workshop.craftCostMul(f1, { id: 'craft_artwork' }) === 0.8,
      'before=' + SB.workshop.craftCostMul(f0, { id: 'craft_artwork' }) + ' after=' + SB.workshop.craftCostMul(f1, { id: 'craft_artwork' }));
    const fed = SB.state.freshRun(false); fed.gov = 'federalism';
    check('ERA6：联邦制 ⇒ 市政产出 ×1.1、食物 −10%',
      Math.abs(SB.civic.govCivicOutMul(fed) - 1.1) < 1e-9 && Math.abs(SB.civic.govMermanFoodMul(fed) - 0.10) < 1e-9);
    const fedS = SB.state.freshRun(false); fedS.gov = 'federalism';
    check('ERA6：联邦制 ⇒ 科技产出 ×1.1', Math.abs(SB.civic.govSciOutMul(fedS) - 1.1) < 1e-9);
    const eg = SB.state.freshRun(false); eg.gov = 'egalitarianism'; eg.pop = 10;
    check('ERA6：平等主义 ⇒ 每鲛人 0.1% 三产（10 鲛人 ⇒ 各自 0.010 加法量）',
      Math.abs(SB.civic.govCraftPerPop(eg) - 0.010) < 1e-9 &&
      Math.abs(SB.civic.govHydroPerPop(eg) - 1.010) < 1e-9 && Math.abs(SB.civic.govMinePerPop(eg) - 1.010) < 1e-9);
    const th = SB.state.freshRun(false); th.gov = 'theo_state'; th.lvl.hall = 3; th.lvl.workshop = 2;
    check('ERA6：教权国 ⇒ 每建筑级 +1 信仰/秒（5 级建筑 ⇒ +5）',
      Math.abs(SB.civic.faithPerBuildingBonus(th) - 5) < 1e-9, '=' + SB.civic.faithPerBuildingBonus(th));
    const mm = SB.state.freshRun(false); mm.cards = ['card_massmedia']; mm.card = 'card_massmedia'; mm.pop = 6;
    check('ERA6：大众传媒卡 ⇒ 每名鲛人 +0.5 市政点（6 鲛人 ⇒ +3/秒）',
      Math.abs(SB.civic.civicPerPop(mm) - 3) < 1e-9, '=' + SB.civic.civicPerPop(mm));
    const _cyc = (SB.game && SB.game.meta) ? (SB.game.meta().cycle || 0) : 0;
    const mu = SB.state.freshRun(false); mu.civics.naturalhistory = true;
    check('ERA6：博物学 ⇒ 博物馆效果 ×(1+0.1×cycle)', Math.abs(SB.civic.museumCivicMul(mu) - (1 + 0.10 * _cyc)) < 1e-9, 'cyc=' + _cyc);
    const mu2 = SB.state.freshRun(false); mu2.civics.naturalhistory = true; mu2.cards = ['card_museum']; mu2.card = 'card_museum';
    check('ERA6：博物馆管理卡 ⇒ 博物馆效果 再 ×2（与轮回加成独立相乘）',
      Math.abs(SB.civic.museumCivicMul(mu2) - SB.civic.museumCivicMul(mu) * 2) < 1e-9, '=' + SB.civic.museumCivicMul(mu2));
    const nl = SB.state.freshRun(false); nl.wonders.wonder_national_logistics = true; nl.lvl.canal = 10;
    check('ERA6：全国快速物流通道 ⇒ 王国潮道每级 +1% 铁钢（10 级 ⇒ +10%）',
      Math.abs(SB.wonder.nationalLogisticsMul(nl) - 0.10) < 1e-9, '=' + SB.wonder.nationalLogisticsMul(nl));
    const nl2 = SB.state.freshRun(false); nl2.wonders.wonder_national_logistics = true; nl2.wonders.wonder_logistics = true; nl2.lvl.canal = 10;
    check('ERA6：同时拥有总物流站 ⇒ 铁钢效果翻倍（10 级 ⇒ +20%）',
      Math.abs(SB.wonder.nationalLogisticsMul(nl2) - 0.20) < 1e-9, '=' + SB.wonder.nationalLogisticsMul(nl2));
    const nm = SB.state.freshRun(false); nm.gov = 'theo_state'; nm.govName = '深渊';
    check('ERA6：教权国 + 已起名 ⇒ 显示名 = 名+教权国', SB.civic.govTitleName(nm) === '深渊教权国');
    check('ERA6：教权国 ⇒ 城堡更名 圣座居所', SB.civic.castleDisplayName(nm) === '圣座居所');
    const nm2 = SB.state.freshRun(false); nm2.gov = 'egalitarianism';
    check('ERA6：平等主义 ⇒ 城堡更名 人民大厅', SB.civic.castleDisplayName(nm2) === '人民大厅');
    const nm3 = SB.state.freshRun(false); nm3.gov = 'federalism';
    check('ERA6：联邦制 ⇒ 城堡更名 国会', SB.civic.castleDisplayName(nm3) === '国会');
    const nm4 = SB.state.freshRun(false); nm4.gov = 'tribe';
    check('ERA6：非新政体 ⇒ 城堡名沿用默认（返回 null）', SB.civic.castleDisplayName(nm4) === null);
  }

  /* ══ 星空槽（2026-10-13 镜像破壳：破壳后终局资源，被动累积到 STAR_CAP）═══════════
   * 设计：破壳前星空探索恒 0；破壳后由文明推力被动累积（速率 = STAR_BASE × breakCoef + 升级加成），
   *   满槽 STAR_CAP（现 1e9 占位）即太空时代达成，弹占位结算面板。旧「吃热液能产出」路线已废弃。 */
  {
    /* 资源 cap：10000 → 1e7 → 2026-10-17 用户拍板抬到 1e9 占位（ERA7 完工后标定结局阈值）。 */
    check('星空槽：资源 cap = STAR_CAP（1e9 占位，破壳后终局累积目标）',
      SB.CFG.CAP_BASE.starExplore === SB.CFG.STAR_CAP && SB.CFG.STAR_CAP === 1000000000,
      'cap=' + SB.CFG.CAP_BASE.starExplore);

    /* 破壳前：tickStar 不累积（starExplore 恒 0）。 */
    const pre = SB.state.freshRun(false);
    pre.techs.exostruct = true;                 // 掌握 exostruct 但**未破壳**
    SB.shell.tickStar(pre, 100, null);
    check('星空槽：未破壳（s.broken=false）⇒ tickStar 不累积（starExplore 恒 0）',
      (pre.res.starExplore || 0) === 0, '=' + pre.res.starExplore);

    /* 破壳后、无升级：freshRun 上 breakCoef=0 ⇒ starRate = STAR_BASE×0 + 0 = 0 ⇒ 不累积。 */
    const brk = SB.state.freshRun(false);
    brk.broken = true; brk.shell = 0;
    const r0 = SB.economy.starRate(brk);
    check('星空槽：破壳后无升级 ⇒ starRate≥0（freshRun 下 coef=0 ⇒ 0/s）', r0 >= 0, 'r0=' + r0);

    /* 装 upg_starscope ⇒ 每级 +STAR_UPG_BONUS(1)/s（保留旧升级语义），叠加在 coef 之上。 */
    brk.upgrades.upg_starscope = true;
    const r1 = SB.economy.starRate(brk);
    check('星空槽：装 1 级观测站升级 ⇒ starRate 增加 STAR_UPG_BONUS(1)/s',
      Math.abs((r1 - r0) - SB.CFG.STAR_UPG_BONUS) < 1e-9, 'Δ=' + (r1 - r0) + ' bonus=' + SB.CFG.STAR_UPG_BONUS);

    /* tickStar 破壳后按 rate×dt 累积。 */
    const before = brk.res.starExplore || 0;
    SB.shell.tickStar(brk, 10, null);
    const gained = (brk.res.starExplore || 0) - before;
    check('星空槽：破壳后 tickStar 按 rate×dt 累积', Math.abs(gained - r1 * 10) < 1e-6, 'gained=' + gained + ' expect=' + (r1 * 10));

    /* 2026-10-17 重构：顶栏已无全局暂停开关，星空产出只受太空建筑「开几座」控制。 */
    brk.lvl.spacestation = 1; brk.spacestationStop = 0;
    const rSsOn = SB.economy.starRate(brk);
    brk.spacestationStop = 1;   // 全停空间站
    const rSsOff = SB.economy.starRate(brk);
    check('星空槽：停掉空间站 ⇒ 该建筑星空贡献归零（starRate 下降 stationStar×等级）',
      Math.abs((rSsOn - rSsOff) - (SB.BLD.stationStar || 0)) < 1e-9, 'Δ=' + (rSsOn - rSsOff) + ' expect=' + (SB.BLD.stationStar || 0));
    brk.spacestationStop = 0;   // 恢复运行
    /* got 台账修复（2026-10-17）：tickStar 直写 res 不经过 addRes，须手动同步 got.starExplore，否则 crewed 尤里卡卡死。 */
    const gotBefore = brk.got.starExplore || 0;
    const resBefore = brk.res.starExplore || 0;
    SB.shell.tickStar(brk, 10, null);
    const dRes = (brk.res.starExplore || 0) - resBefore;
    const dGot = (brk.got.starExplore || 0) - gotBefore;
    check('星空槽：tickStar 同步累计台账 got.starExplore（修复 crewed 尤里卡卡死）',
      Math.abs(dGot - dRes) < 1e-6 && dRes > 0, 'dRes=' + dRes + ' dGot=' + dGot);
    brk.broken = false; brk.breakSettled = true;
    SB.shell.tickStar(brk, 10, null);
    check('星空槽：破壳后留在本局（breakSettled）仍继续累积', brk.res.starExplore > resBefore);

    /* 满槽 ⇒ 置 starComplete + 触发结算回调（与 showStarComplete 挂钩），且 cap 不溢出。 */
    const full = SB.state.freshRun(false);
    full.broken = true; full.shell = 0; full.upgrades.upg_starscope = true;
    full.res.starExplore = SB.CFG.STAR_CAP - 0.5;   // 差一点满
    let shown = false;
    SB.shell.tickStar(full, 10, function () { shown = true; });
    check('星空槽：达 STAR_CAP ⇒ 置 starComplete=true', full.starComplete === true);
    check('星空槽：达满槽 ⇒ 触发结算回调（showStarComplete 挂钩）', shown === true);
    check('星空槽：满槽后 starExplore 不溢出（= STAR_CAP）',
      Math.abs((full.res.starExplore || 0) - SB.CFG.STAR_CAP) < 1e-6, '=' + full.res.starExplore);

    /* 满槽后幂等：不再涨、不再触发。 */
    const afterFull = (full.res.starExplore || 0);
    SB.shell.tickStar(full, 100, function () { shown = true; });
    check('星空槽：starComplete 后 tickStar 幂等（不重复触发、不溢出）',
      (full.res.starExplore || 0) === afterFull && full.starComplete === true);

    /* 架构约束：economy.tick 在 s.broken 时顶部早退（1335 行），故星空累积不能放 tick 内。
     * 钉死「破壳后调 economy.tick 不动星空」这一事实，防止有人把 tickStar 误放回 tick（变死代码）。
     * 真实累积由 game.loop()（在线）/ drainCatchUp()（离线）直接调 SB.shell.tickStar 推进（上文已逐测）。 */
    const tInv = SB.state.freshRun(false);
    tInv.broken = true; tInv.upgrades.upg_starscope = true;
    const invBefore = tInv.res.starExplore || 0;
    SB.economy.tick(tInv, 100, null);
    check('星空槽：economy.tick 在破壳后早退（不负责星空累积，由 game.loop 负责）',
      (tInv.res.starExplore || 0) === invBefore, 'before=' + invBefore + ' after=' + tInv.res.starExplore);

    /* 渲染层：破壳后 renderShell 把 shellbar 翻转为星空槽文案（含 STAR_CAP 目标）。 */
    const loop = SB.game.run();            // 直接 mutate 当前 live run（与 cpRun 同手法）
    const oldShell = loop.shell;
    loop.broken = true; loop.shell = 0; loop.upgrades.upg_starscope = true;
    SB.ui.render.renderShell();
    var shellTxt = (doc.getElementById('shellTxt') || {})._html || '';
    check('星空槽：破壳后 renderShell 显示星空槽进度（含 STAR_CAP 目标数值）',
      shellTxt.indexOf('星空槽') >= 0 && shellTxt.indexOf(SB.CFG.STAR_CAP.toLocaleString()) >= 0, 'snip=' + shellTxt.slice(0, 80));

    /* 还原 live run，避免污染后续测试。 */
    loop.broken = false; loop.shell = oldShell; loop.upgrades.upg_starscope = false;
    loop.res.starExplore = 0; loop.starComplete = false;

    const emptyRun = SB.state.freshRun(false);
    check('星图：新周目锁定且发射记录为空', !emptyRun.breakSettled && emptyRun.spacecraft.length === 0);
    const savedCraft = loop.spacecraft;
    const settled = loop.breakSettled;
    loop.shell = 0; loop.breakSettled = true;
    loop.spacecraft = [{ id: 'europa-1', type: 'satellite', body: 'europa', name: '欧罗巴一号', launchedAt: 42 },
      { id: 'saturn-1', type: 'station', body: 'saturn', name: '土星站', launchedAt: 84 }];
    const mapHTML = SB.ui.renderParts.paneStarMap();
    /* 2026-10-17 星图改版：视觉换成 GPT 制作的 iframe 动画星图（star-map-frame.html），
     * 发射记录尚未接入 frame（占位期）⇒ 断言改为「iframe 挂载 + 记录不被清空」；
     * 待 frame 接入游戏状态后，把「发射记录上屏」的展示断言加回来。 */
    check('星图：破壳后挂载 iframe 动画星图（star-map-frame.html?v=1）',
      mapHTML.indexOf('<iframe') >= 0 && mapHTML.indexOf('star-map-frame.html?v=1') >= 0,
      'snip=' + mapHTML.slice(0, 120));
    check('星图：本周目发射记录仍在（frame 接入后上屏）',
      loop.spacecraft.length === 2 && loop.spacecraft[0].name === '欧罗巴一号' && loop.spacecraft[1].name === '土星站');
    const restored = SB.state.migrateRun(JSON.parse(JSON.stringify(loop)));
    check('星图：刷新后保留解锁与本周目发射记录',
      restored.breakSettled && restored.spacecraft.length === 2);
    loop.shell = oldShell; loop.breakSettled = settled; loop.spacecraft = savedCraft;
  }

  /* ══ 公司页可见性 + 公司系统接线（2026-10-12 修两个实装 bug）═════════════════
   * Bug1：PANE_KEYS 漏 'company' ⇒ 点公司 tab 时所有 pane 被藏、company pane 永不显示（"没东西"）。
   * Bug2：pickCompanyNames 用行业 id 做键、paneCompany 用 res 查 ⇒ 藻食公司永远"未命名"。
   * 另：SB.companyMul 未导出 ⇒ 公司页加成恒显 +0%。 */
  {
    check('公司页：PANE_KEYS 含 company（点 tab 能显示 pane，修"没东西"）',
      SB.ui.render.PANE_KEYS.indexOf('company') >= 0, 'PANE_KEYS=' + SB.ui.render.PANE_KEYS.join(','));
    const names = SB.pickCompanyNames();
    check('公司名：pickCompanyNames 按 res 键（kelp/coral，非行业 id）',
      !!names.kelp && !!names.coral, 'keys=' + Object.keys(names).join(','));

    const cm = SB.state.freshRun(false);
    cm.civics.macroeconomics = true;        // 公司系统闸门（closeCompany/rebuildCompany 都守它）
    SB.companyState(cm, 'kelp').epoch = 1;   // 模拟两家公司成立（逐家独立 epoch）
    SB.companyState(cm, 'coral').epoch = 1;
    cm.t = 1;                               // 成立后 0s ⇒ 乡镇企业（bonus 0.10）
    check('公司系统：SB.companyMul 已导出且 kelp 产出 +10%（乡镇企业）',
      Math.abs(SB.economy.companyMul(cm, 'kelp') - 1.10) < 1e-9, '=' + SB.economy.companyMul(cm, 'kelp'));
    check('公司系统：companyMul 对非公司资源（iron）恒 1', SB.economy.companyMul(cm, 'iron') === 1);

    /* ⚠️ 单独关闭：只关 kelp，coral 不受影响（2026-10-13 改「单独关闭」的核心回归）。 */
    SB.closeCompany(cm, 'kelp');
    check('公司系统：单独关闭 kelp ⇒ 仅 kelp 加成归零、coral 仍 +10%',
      SB.economy.companyMul(cm, 'kelp') === 1 && Math.abs(SB.economy.companyMul(cm, 'coral') - 1.10) < 1e-9);
    check('公司系统：companyLuxMul 仅统计存活公司（关掉 1 家 ⇒ 0.10）',
      Math.abs(SB.economy.companyLuxMul(cm) - 0.10) < 1e-9, '=' + SB.economy.companyLuxMul(cm));
    SB.rebuildCompany(cm, 'kelp');          // 复原，避免影响后续

    /* 端到端：宏观经济学后真的把两家公司渲染进 #pane-company-body（钉死"公司页面下没东西"）。 */
    const cpRun = SB.game.run();
    cpRun.civics.macroeconomics = true;
    SB.companyState(cpRun, 'kelp').epoch = 1;
    SB.companyState(cpRun, 'coral').epoch = 1;
    cpRun.t = 1;
    cpRun.companyNames = SB.pickCompanyNames();
    SB.ui.render.renderPanes();
    const cpBody = (doc.getElementById('pane-company-body') || {})._html || '';
    check('公司页：宏观经济学后渲染出两家公司（非空、且藻食公司非"未命名"）',
      cpBody.indexOf('藻食') >= 0 && cpBody.indexOf('未命名') < 0, 'len=' + cpBody.length);
    SB.game.setTab('company');
    check('公司页：setTab("company") 后 #pane-company 不再 hidden',
      !(doc.getElementById('pane-company')._classes || new Set()).has('hidden'));

    /* 单独关闭一家公司 ⇒ 页面对应项显示「已解散」+「重建」按钮，另一家仍活跃（含"关闭"按钮）。 */
    SB.closeCompany(cpRun, 'kelp');
    SB.ui.render.renderPanes();
    var cpBody2 = (doc.getElementById('pane-company-body') || {})._html || '';
    check('公司页：单独关闭 kelp ⇒ 页面显示「已解散」+「重建」按钮，且 coral 仍活跃',
      cpBody2.indexOf('已解散') >= 0 && cpBody2.indexOf('重建') >= 0 &&
      cpBody2.indexOf('关闭') >= 0 && cpBody2.indexOf('藻食') >= 0);

    /* 单独重建 kelp ⇒ 其加成回到 +10%（从乡镇企业 tier 0 重启），不影响 coral。 */
    SB.rebuildCompany(cpRun, 'kelp');
    check('公司系统：单独重建 kelp ⇒ 其加成回到 +10%（tier 0 重启）、coral 不变',
      Math.abs(SB.economy.companyMul(cpRun, 'kelp') - 1.10) < 1e-9 &&
      Math.abs(SB.economy.companyMul(cpRun, 'coral') - 1.10) < 1e-9);

    /* 升级倒计时：成立后 0s ⇒ tier 0，距「地方企业」(3600s) 的倒计时应上屏。 */
    SB.companyState(cpRun, 'kelp').epoch = 100; cpRun.t = 100;
    SB.ui.render.renderPanes();
    var cpBody3 = (doc.getElementById('pane-company-body') || {})._html || '';
    check('公司页：活跃态显示升级倒计时（"距离升级为「地方企业」还需…"）',
      cpBody3.indexOf('距离升级为「地方企业」还需') >= 0, 'snip=' + cpBody3.slice(0, 220));
  }

  /* ══ 工坊自动制作槽（2026-10-07 用户拍板）═══════════════════════════
   * ⚠️ 这组断言的由来：`s.perk.autoCraft`（轮回商店「自动制作槽 I/II/III」）此前是
   *    **零读端死字段** —— 买了扣轮回点、等级真涨、UI 显示已购，而全项目没有任何一行
   *    读它 ⇒ 不报错、也不生效（与 BLD.workshopCraft / T.craftRatio 同一类静默断链）。
   *    与它配套的还有「自动工坊」这个升级项：名字叫自动，却只给 +10% 效率、不自动制造。
   * ⇒ 现在两者合一：**自动工坊升级自带 1 槽 + perk 每级 1 槽**；
   *    有限原料配方满仓后按比例转制，无上限原料配方按玩家填写的批次数触发。
   *    判据：**谁读它**必须有断言钉住，否则下次改表又会退化成死键。 */
  {
    const W = SB.workshop;
    /* 槽数 = 自动工坊自带 1 + perk，封顶 CFG.AUTO.SLOT_MAX */
    const s0 = SB.state.freshRun(false);
    check('自动槽：未装自动工坊 = 0 槽（perk 是**额外**槽，不是唯一来源）',
      W.slotCap(s0) === 0, 'slotCap=' + W.slotCap(s0));
    s0.upgrades = s0.upgrades || {}; s0.upgrades.upg_autoshop = true;
    check('自动槽：装上「自动工坊」⇒ 自带 1 槽', W.slotCap(s0) === 1, 'slotCap=' + W.slotCap(s0));
    s0.perk.autoCraft = 2;
    check('自动槽：+ 轮回商店 2 级 ⇒ 3 槽', W.slotCap(s0) === 3, 'slotCap=' + W.slotCap(s0));
    s0.perk.autoCraft = 9;
    check('自动槽：封顶 CFG.AUTO.SLOT_MAX',
      W.slotCap(s0) === SB.CFG.AUTO.SLOT_MAX, 'slotCap=' + W.slotCap(s0));

    /* 占槽 / 改档 / 释放。比例档位只认 CFG.AUTO.PCTS。 */
    const sa = SB.state.freshRun(false);
    sa.lvl.workshop = 1; sa.upgrades = { upg_autoshop: true };   // 只有自带那 1 槽 ⇒ 好验「槽位用完」
    check('自动槽：非法档位（0.9）被拒 —— 手改存档也造不出怪东西',
      W.setSlot(sa, 'craft_stonebeam', 0.9) === false && W.slotPct(sa, 'craft_stonebeam') === 0,
      'pct=' + W.slotPct(sa, 'craft_stonebeam'));
    check('自动槽：占槽成功且档位生效',
      W.setSlot(sa, 'craft_stonebeam', 0.25) === true && W.slotPct(sa, 'craft_stonebeam') === 0.25,
      'pct=' + W.slotPct(sa, 'craft_stonebeam'));
    /* 幂等：同一配方再设一次只改档，不会占第二个槽（占两槽 = 阈值判两次、只造一半） */
    W.setSlot(sa, 'craft_stonebeam', 1);
    check('自动槽：改档幂等 —— 同一配方永远只占一个槽',
      sa.autoSlots.length === 1 && W.slotPct(sa, 'craft_stonebeam') === 1,
      'slots=' + sa.autoSlots.length + ' pct=' + W.slotPct(sa, 'craft_stonebeam'));
    /* 槽位用完：第二个配方进不来（不是静默挤掉第一个） */
    check('自动槽：槽位用完 ⇒ 第二个配方进不来',
      W.setSlot(sa, 'craft_hardcoral', 0.5) === false && sa.autoSlots.length === 1,
      'slots=' + sa.autoSlots.length);
    check('自动槽：停用后槽位释放，可再分配',
      W.clearSlot(sa, 'craft_stonebeam') === true && sa.autoSlots.length === 0 &&
      W.setSlot(sa, 'craft_hardcoral', 0.5) === true,
      'slots=' + sa.autoSlots.length);

    /* ── 阈值语义：没满不动手，满了才造 ── */
    const sb = SB.state.freshRun(false);
    sb.lvl.workshop = 1; sb.upgrades = { upg_autoshop: true };
    W.setSlot(sb, 'craft_stonebeam', 0.25);
    const capStone = SB.economy.capOf(sb, 'stone');
    /* 差一点没满：石头 = 上限 − 1（可造 ≥1 份，但没满 ⇒ 不许碰玩家的建材） */
    sb.res.stone = capStone - 1;
    const beamBefore = sb.res.stoneBeam, stoneBefore = sb.res.stone;
    W.autoTick(sb, null);
    check('自动槽：原料**没满** ⇒ 一动不动（不抢玩家正在攒的建材）',
      sb.res.stoneBeam === beamBefore && sb.res.stone === stoneBefore,
      'stone=' + sb.res.stone + '/' + capStone + ' beam=' + sb.res.stoneBeam);

    /* 满了：造可造量的 25%（至少 1 份） */
    sb.res.stone = capStone;
    const all = W.maxCraftable(sb, W.craftById('craft_stonebeam'));
    const want = Math.max(1, Math.floor(all * 0.25));
    const made = W.autoTick(sb, null);
    check('自动槽：原料**满仓** ⇒ 按档位转制（25% 档 = 造可造量的 25%，至少 1 份）',
      Math.abs(sb.res.stone - (capStone - want * 100)) < 1e-9 &&
      Math.abs(made - want * SB.workshop.craftMul(sb)) < 1e-9,
      '可造=' + all + ' 应造=' + want + ' 实造=' + made + ' 余石头=' + sb.res.stone);

    /* 100% 档：满仓全转 */
    const sc = SB.state.freshRun(false);
    sc.lvl.workshop = 1; sc.upgrades = { upg_autoshop: true };
    W.setSlot(sc, 'craft_stonebeam', 1);
    sc.res.stone = SB.economy.capOf(sc, 'stone');
    const allC = W.maxCraftable(sc, W.craftById('craft_stonebeam'));
    W.autoTick(sc, null);
    check('自动槽：100% 档 ⇒ 满仓全转（可造多少造多少）',
      Math.abs(sc.res.stoneBeam - allC * SB.workshop.craftMul(sc)) < 1e-9 && sc.res.stone < 100,
      '可造=' + allC + ' 石梁=' + sc.res.stoneBeam + ' 余石头=' + sc.res.stone);

    /* 无上限原料（硬化珊瑚 + 绳 → 脚手架）：按批次数触发，不因「够一份」就抢着吃掉库存。 */
    const sd = SB.state.freshRun(false);
    sd.lvl.workshop = 1; sd.upgrades = { upg_autoshop: true };
    sd.techs.physics = true;          // 脚手架配方的 need 门
    check('自动槽：无上限原料配方允许填写任意正整数、拒绝零和小数',
      W.setSlotBatch(sd, 'craft_scaffold', 137) === true &&
      W.slotBatch(sd, 'craft_scaffold') === 137 &&
      W.setSlotBatch(sd, 'craft_scaffold', 0) === false &&
      W.setSlotBatch(sd, 'craft_scaffold', 1.5) === false &&
      W.setSlot(sd, 'craft_scaffold', 0.5) === false &&
      W.setSlotBatch(sd, 'craft_scaffold', 80) === true &&
      W.slotBatch(sd, 'craft_scaffold') === 80,
      'batch=' + W.slotBatch(sd, 'craft_scaffold'));
    sd.res.hardCoral = 7999; sd.res.rope = 8000;
    check('自动槽：脚手架库存不到 80 份原料时不触发',
      W.autoReady(sd, W.craftById('craft_scaffold')) === false,
      '可造=' + W.maxCraftable(sd, W.craftById('craft_scaffold')));
    W.autoTick(sd, null);
    check('自动槽：脚手架阈值未到时不消耗材料',
      sd.res.hardCoral === 7999 && sd.res.rope === 8000 && sd.res.scaffold === 0);
    sd.res.hardCoral = 9000; sd.res.rope = 9000;
    check('自动槽：达到 80 份材料阈值后触发',
      W.autoReady(sd, W.craftById('craft_scaffold')) === true,
      '可造=' + W.maxCraftable(sd, W.craftById('craft_scaffold')));
    W.autoTick(sd, null);
    check('自动槽：达到 80 次后只造 80 次，并保留多出的材料',
      Math.abs(sd.res.scaffold - 80 * W.craftMul(sd)) < 1e-9 &&
      sd.res.hardCoral === 1000 && sd.res.rope === 1000,
      '脚手架=' + sd.res.scaffold + ' 硬化珊瑚余=' + sd.res.hardCoral + ' 绳余=' + sd.res.rope);

    const migratedAuto = SB.state.migrateRun({ autoSlots: [
      { id: 'craft_scaffold', batch: 137 },
      { id: 'craft_stonebeam', pct: 0.75 },
      { id: 'craft_steelpart', pct: 0.5 }
    ] });
    check('自动槽存档：新批次档与旧百分比档都能保留',
      migratedAuto.autoSlots.length === 3 &&
      W.slotBatch(migratedAuto, 'craft_scaffold') === 137 &&
      W.slotPct(migratedAuto, 'craft_stonebeam') === 0.75 &&
      W.slotBatch(migratedAuto, 'craft_steelpart') === 80,
      JSON.stringify(migratedAuto.autoSlots));

    /* ── UI：功能点得到才算存在（本轮死字段的根因就是**只有数据、没有入口**）── */
    const su = SB.state.freshRun(false); su.lvl.workshop = 1;
    const noSlot = SB.ui.render.paneCraftRows(su);
    check('自动槽 UI：未装自动工坊 ⇒ 不画自动控件（不预告拿不到的功能）',
      noSlot.indexOf('data-aslot') < 0 && noSlot.indexOf('data-aoff') < 0);
    su.upgrades = { upg_autoshop: true };
    const withSlot = SB.ui.render.paneCraftRows(su);
    check('自动槽 UI：装上之后出现「＋自动」按钮', withSlot.indexOf('＋自动') >= 0);
    su.techs.physics = true;
    check('自动槽 UI：脚手架默认提供 80 次批次入口',
      SB.ui.render.paneCraftRows(su).indexOf('data-aslot="craft_scaffold" data-abatch="80"') >= 0);
    W.setSlotBatch(su, 'craft_scaffold', 137);
    const scaffoldAutoRow = SB.ui.render.paneCraftRows(su);
    check('自动槽 UI：脚手架显示玩家填写的批次数并提供编辑入口',
      scaffoldAutoRow.indexOf('data-abatch-edit="craft_scaffold"') >= 0 &&
      scaffoldAutoRow.indexOf('批次 137 次') >= 0 &&
      scaffoldAutoRow.indexOf('点击填写次数') >= 0 &&
      scaffoldAutoRow.indexOf('data-aoff="craft_scaffold"') >= 0);
    check('自动槽 UI：编辑入口打开数字输入弹窗（不是预设档位）',
      SB.ui.render.openAutoBatchDialog('craft_scaffold') === true &&
      g('modalBox').indexOf('type="number"') >= 0 &&
      g('modalBox').indexOf('step="1"') >= 0 &&
      g('modalBox').indexOf('保存') >= 0);
    SB.ui.render.hideModal();
    W.clearSlot(su, 'craft_scaffold');
    const drillAuto = SB.state.freshRun(false);
    drillAuto.lvl.workshop = 1; drillAuto.upgrades = { upg_autoshop: true };
    drillAuto.techs.shellgeo = true;
    W.setSlot(drillAuto, 'craft_drill', 0.5);
    const drillAutoRow = SB.ui.render.paneCraftRows(drillAuto);
    check('共振钻头含有仓储上限钛，沿用满仓百分比自动档而非批次输入',
      W.hasFiniteInput(drillAuto, W.craftById('craft_drill')) &&
      drillAutoRow.indexOf('data-aslot="craft_drill" data-apct="0.5"') >= 0 &&
      drillAutoRow.indexOf('data-abatch-edit="craft_drill"') < 0);
    W.setSlot(su, 'craft_stonebeam', 0.25);
    const onRow = SB.ui.render.paneCraftRows(su);
    check('自动槽 UI：占槽后四档都在、当前档 25% 高亮',
      onRow.indexOf('data-apct="0.25"') >= 0 && onRow.indexOf('data-apct="1"') >= 0 &&
      onRow.indexOf('data-aoff="craft_stonebeam"') >= 0 &&
      /data-apct="0\.25"/.test(onRow.split('craft_stonebeam')[0] + onRow) &&
      onRow.indexOf('btn tog on') >= 0);
  }

  /* 寡头 +20% 奢侈品产出：与马具 toolMul 独立乘，tick/rates 同式 */
  const ol = SB.state.freshRun(false); ol.gov = 'oligarchy'; ol.jobs.merchant = 2; ol.pop = 0;
  const _luxCap = 2 * SB.UNIT.luxury * SB.economy.baseMul(ol);
  check('寡头统治：奢侈品产出 ×1.2（tick/rates 同式，与马具独立乘）',
    Math.abs(SB.economy.rates(ol).luxury - _luxCap * 1.2) < 1e-9,
    'rates.luxury=' + SB.economy.rates(ol).luxury + ' 期望=' + (_luxCap * 1.2).toFixed(4));

  /* ══ ERA3 市政扩展（2026-09-30 用户规格表，5 节点 + 君主制 + 4 卡 + 2 奇观 + 潮道）══ */

  /* ① 君主制：礁栖核心建筑造价 ×0.9，其他分区不动（规格原文「所有礁栖核心建筑」）。 */
  {
    const mo = SB.state.freshRun(false); mo.gov = 'monarchy';
    const tr = SB.state.freshRun(false); tr.gov = 'tribe';
    const coreM = SB.economy.costOf(mo, 'hall'), coreT = SB.economy.costOf(tr, 'hall');
    const tradeM = SB.economy.costOf(mo, 'ballast'), tradeT = SB.economy.costOf(tr, 'ballast');
    check('君主制：礁栖核心建筑造价 ×0.9（hall），贸易区域不动（ballast）',
      Math.abs(coreM.stone - coreT.stone * 0.9) < 1e-9 &&
      Math.abs(coreM.coral - coreT.coral * 0.9) < 1e-9 &&
      tradeM.stoneBeam === tradeT.stoneBeam && tradeM.hardCoral === tradeT.hardCoral,
      'hall ' + coreT.stone + '→' + coreM.stone + ' ballast ' + tradeT.stoneBeam + '=' + tradeM.stoneBeam +
      '（⚠️ 2026-10-05 起 costOf 不再取整，故用容差比而非 === Math.ceil(·)）');
  }

  /* ② 王国潮道：等级 ≤ 灯塔等级（灯塔 0 级建不起来；1 级灯塔只准 1 级潮道）。 */
  {
    const ca = SB.state.freshRun(false);
    ca.civics.department = 1; ca.res.stone = 1e6; ca.res.steel = 1e6;
    const locked = SB.habitat.build(ca, 'canal', null) === false;
    ca.lvl.lighthouse = 1;
    const first = SB.habitat.build(ca, 'canal', null) === true && ca.lvl.canal === 1;
    const second = SB.habitat.build(ca, 'canal', null) === false && ca.lvl.canal === 1;
    check('王国潮道：等级钳制在灯塔等级（0 级灯塔锁死 → 1 级放行一级 → 拒绝第二级）',
      locked && first && second,
      'lock=' + locked + ' first=' + first + ' second=' + second +
      ' reason=' + (SB.habitat.lockReason(ca, SB.habitat.buildingById('canal')) || 'null'));
  }

  /* ②' 王国潮道的效果面：每级 −0.3% 居民奢侈品消耗（需求 D 侧缩减，净速率上升）。 */
  {
    const cs = SB.state.freshRun(false);
    cs.jobs.merchant = 10; cs.pop = 1; cs.happy = 0;
    const n0 = SB.economy.rates(cs).luxury;
    cs.lvl.canal = 1;
    const n1 = SB.economy.rates(cs).luxury;
    const D0 = 1 * SB.economy.happyCost(0);
    check('王国潮道：1 级 −0.3% 居民奢侈品消耗（D 侧缩，Δnet = D×0.003）',
      Math.abs((n1 - n0) - D0 * 0.003) < 1e-9,
      'Δnet=' + (n1 - n0).toFixed(6) + ' 期望=' + (D0 * 0.003).toFixed(6));
  }

  /* ③ 商人副产（中世纪集市解锁2）：每名商人 +0.05/s 科学与市政点，面板与结算同式。 */
  {
    const mk = SB.state.freshRun(false);
    mk.jobs.merchant = 4; mk.pop = 0;
    mk.civics.market = 0;
    const rA = SB.economy.rates(mk);
    mk.civics.market = 1;
    const rB = SB.economy.rates(mk);
    const g = SB.economy.globalMul(mk);
    check('中世纪集市：商人副产 +0.05/s 科学 +0.05/s 市政（rates 路，×globalMul）',
      Math.abs((rB.science - rA.science) - 4 * 0.05 * g) < 1e-9 &&
      Math.abs((rB.culture - rA.culture) - 4 * 0.05 * g) < 1e-9,
      'Δsci=' + (rB.science - rA.science).toFixed(4) + ' Δcult=' + (rB.culture - rA.culture).toFixed(4) +
      ' 期望=' + (4 * 0.05 * g).toFixed(4));
  }

  /* ④ 中世纪集市卡：仓储区建筑容量贡献 ×2（基础容量与科技容量不翻）。
   * fresh 档 techCap=0 ⇒ cap0 = B + 3K、cap1 = B + 6K，等价于 cap1 − 3K === cap0。 */
  {
    const st = SB.state.freshRun(false);
    st.lvl.kelpstore = 3;
    const cap0 = SB.economy.capOf(st, 'kelp');
    st.cards = ['card_market']; st.card = 'card_market';
    const cap1 = SB.economy.capOf(st, 'kelp');
    check('中世纪集市卡：海藻仓容量贡献 ×2（base 与科技段不动）',
      Math.abs(cap1 - 3 * SB.BLD.kelpCap - cap0) < 1e-6,
      'cap0=' + cap0 + ' cap1=' + cap1 + ' kelpCap=' + SB.BLD.kelpCap);
  }

  /* ⑤ 农奴制卡：藻场↔牧场互乘（每级 ×1.01，互不吃自己的等级）。 */
  {
    const sf = SB.state.freshRun(false);
    sf.lvl.kelp = 5; sf.lvl.warmnest = 3;
    sf.cards = ['card_serfdom']; sf.card = 'card_serfdom';
    const noKelp = SB.state.freshRun(false);
    noKelp.lvl.kelp = 5; noKelp.lvl.warmnest = 3;
    check('农奴制卡：牧场 3 级给藻场 ×1.03、藻场 5 级给牧场减免 ×1.05',
      Math.abs(SB.civic.serfKelpMul(sf) - 1.03) < 1e-9 &&
      Math.abs(SB.civic.serfWarmMul(sf) - 1.05) < 1e-9 &&
      SB.civic.serfKelpMul(noKelp) === 1,
      'serfKelp=' + SB.civic.serfKelpMul(sf) + ' serfWarm=' + SB.civic.serfWarmMul(sf));
  }

  /* ⑥ 王权神授卡：城堡每级 +10% 信仰产出（装卡才生效）。
   * ⚠️ 2026-10-06：城堡不是独立建筑，「城堡等级」= 议事厅等级 `lvl.hall`（= coreLvl），
   *    这条断言跟着改用 lvl.hall，不再造那个已删除的 lvl.castle 键。 */
  {
    const so = SB.state.freshRun(false);
    so.lvl.hall = 2;
    so.cards = ['card_sovereign']; so.card = 'card_sovereign';
    const soOff = SB.state.freshRun(false); soOff.lvl.hall = 2;
    check('王权神授卡：城堡 2 级 → 信仰 ×1.2（不装卡 ×1）',
      Math.abs(SB.civic.castleFaithMul(so) - 1.2) < 1e-9 && SB.civic.castleFaithMul(soOff) === 1,
      'on=' + SB.civic.castleFaithMul(so) + ' off=' + SB.civic.castleFaithMul(soOff));
  }

  /* ⑦ 两座奇观：needCivic 门 + 效果（修道院每市政 +1% 信仰 / 大巴扎每人 +1% 奢侈）。 */
  {
    const wb = SB.state.freshRun(false);
    const abbeyLocked = SB.workshop.wonderBlocked(wb, 'wonder_stt_abbey');
    wb.civics.sovereign = 1;
    wb.civics.laws = 1; wb.civics.craft = 1; wb.civics.theology = 1; // 凑 4 个完成市政
    const abbeyOpen = SB.workshop.wonderBlocked(wb, 'wonder_stt_abbey') === null ||
      (SB.workshop.wonderBlocked(wb, 'wonder_stt_abbey') || '').indexOf('市政') < 0;
    wb.wonders = { wonder_stt_abbey: true };
    const fm = SB.wonder.abbeyFaithMul(wb);
    const bz = SB.state.freshRun(false);
    bz.civics.guild = 1; bz.wonders = { wonder_grand_bazaar: true }; bz.pop = 30;
    check('奇观：修道院 needCivic 门 + 4 市政 ×1.04；大巴扎 30 人 ×1.30',
      (abbeyLocked || '').indexOf('市政') >= 0 && abbeyOpen &&
      Math.abs(fm - 1.04) < 1e-9 && Math.abs(SB.wonder.bazaarLuxMul(bz) - 1.30) < 1e-9,
      'locked=' + abbeyLocked + ' faith=' + fm + ' lux=' + SB.wonder.bazaarLuxMul(bz));
  }

  /* ⑧ 卡退役：职业行会完成后技艺卡不可再装（cardOwned=false）。 */
  {
    const gd = SB.state.freshRun(false);
    gd.civics.craft = 1;
    const before = SB.civic.cardOwned(gd, 'card_craft');
    gd.civics.guild = 1;
    check('职业行会：完成后技艺卡退役（之前可装、之后不可装）',
      before === true && SB.civic.cardOwned(gd, 'card_craft') === false,
      'before=' + before + ' after=' + SB.civic.cardOwned(gd, 'card_craft'));
  }

  /* 国家凝聚力明确取代职业行会卡：完成意识形态时清槽，旧档迁移也不能保留双卡叠加。 */
  {
    const oldGuildCard = SB.state.freshRun(false);
    oldGuildCard.era = 6;
    oldGuildCard.civics.guild = 1;
    oldGuildCard.civics.massmedia = 1;
    oldGuildCard.civics.naturalhistory = 1;
    oldGuildCard.civShown.ideology = 1;
    oldGuildCard.gov = 'tribe';
    oldGuildCard.res.culture = SB.civic.byId('ideology').cost;
    oldGuildCard.cards = ['card_guild', null]; oldGuildCard.card = 'card_guild';
    const researchIdeology = SB.civic.research(oldGuildCard, 'ideology');
    check('意识形态完成后自动退役并卸下职业行会卡',
      researchIdeology && oldGuildCard.cards[0] === null && oldGuildCard.card === null &&
      !SB.civic.cardOwned(oldGuildCard, 'card_guild'),
      'research=' + researchIdeology + ' cards=' + JSON.stringify(oldGuildCard.cards));

    const legacyDouble = SB.state.freshRun(false);
    legacyDouble.civics.guild = 1; legacyDouble.civics.ideology = 1;
    legacyDouble.cards = ['card_guild', 'card_national_solidarity'];
    check('双卡旧状态的效果按退役规则过滤，只保留国家凝聚力 +80%',
      Math.abs(SB.civic.cardCraftRatio(legacyDouble) - 0.80) < 1e-9,
      'craftRatio=' + SB.civic.cardCraftRatio(legacyDouble));

    const migratedDouble = SB.state.migrateRun({
      era: 6,
      civics: { guild: true, ideology: true },
      cards: ['card_guild', 'card_national_solidarity']
    });
    check('读档会清除已退役的职业行会卡并保留槽位中的国家凝聚力',
      migratedDouble.cards[0] === null && migratedDouble.cards[1] === 'card_national_solidarity' &&
      migratedDouble.card === null && Math.abs(SB.civic.cardCraftRatio(migratedDouble) - 0.80) < 1e-9,
      'cards=' + JSON.stringify(migratedDouble.cards));
  }

  /* ⑧b 两条鼓舞门槛下调（2026-10-06 用户拍板，与同批科技三条一起降）。
   *   ⚠️ 重点是**口径也换了**：职业行会从「工坊区合计等级 100」改成「**建筑总等级 55**」
   *   （`zoneLvl` → `total`）。所以必须证明 `total` 真的按**全区**算 ——
   *   只改数字不改口径的写法在这里会假通过。 */
  {
    const guildC = SB.CIVICS.find(c => c.id === 'guild');
    const deptC = SB.CIVICS.find(c => c.id === 'department');
    check('职业行会鼓舞 = 建筑总等级 55（口径已从工坊区改为 total）',
      guildC.boost.t === 'total' && guildC.boost.n === 55 && !guildC.boost.zone,
      JSON.stringify(guildC.boost));
    check('行政部门鼓舞 = 人口 55', deptC.boost.t === 'pop' && deptC.boost.n === 55,
      JSON.stringify(deptC.boost));
    check('两条 note 文案与门槛一致（防「文案 ≠ 门槛」的撒谎点）',
      guildC.note.indexOf('55') >= 0 && deptC.note.indexOf('55') >= 0,
      'guild=' + guildC.note + ' / dept=' + deptC.note);
    /* 「total 按全区算」的正向证据：工坊区为 0、别的区堆够 55 ⇒ 仍揭示。
     *   若 total 还在按 zoneLvl 算，这条会红。
   * ⚠️ 判据必须走 `SB.civic.pump`：**鼓舞的揭示是 pump 写进 `s.civShown` 的台账**
   *   （`isRevealed` 只是读那个台账，`blocked` 压根不看鼓舞数值——它只管
   *   「已揭示？前置齐？市政点够？」）。所以「这条鼓舞达没达成」的唯一实时判据
   *   = 跑一次 pump 再看 civShown[id]。 */
    const g = SB.state.freshRun(false);
    /* ⚠️ era 必须设到 3：职业行会是 `era:3` 市政，而 `pump` 开头就有 era 闸门
     *   （`if (c.era && c.era > (s.era||1)) continue`）⇒ 不设 era 会被整条跳过，
     *   civShown 恒 undefined，看起来像「total 口径没生效」其实是没进门。 */
    g.era = 3;
    g.lvl.workshop = 0; g.lvl.furnace = 0;                    // 工坊区 = 0
    g.lvl.hall = 30; g.lvl.lighthouse = 25;                    // 全区 = 55
    SB.civic.pump(g, null);
    check('工坊区 0、但全区 55 ⇒ 职业行会鼓舞达成并揭示（证明 total 不限区）',
      !!g.civShown.guild, 'civShown.guild=' + g.civShown.guild + ' 工坊区=0 全区=55');
    const g2 = SB.state.freshRun(false);
    g2.era = 3; g2.lvl.workshop = 0; g2.lvl.hall = 29; g2.lvl.lighthouse = 25;   // 全区 = 54
    SB.civic.pump(g2, null);
    check('全区 54 ⇒ 未揭示（门槛 55 精确命中）',
      !g2.civShown.guild, 'civShown.guild=' + g2.civShown.guild);
    const d = SB.state.freshRun(false);
    d.pop = 54; d.era = 3;
    SB.civic.pump(d, null);
    check('人口 54 ⇒ 行政部门鼓舞未揭示', !d.civShown.department, 'shown=' + d.civShown.department);
    d.pop = 55;
    SB.civic.pump(d, null);
    check('人口 55 ⇒ 行政部门鼓舞揭示（门槛 55 精确命中）',
      !!d.civShown.department, 'shown=' + d.civShown.department);
  }

  /* ⑨ 区域建筑自动建造/升级：对应市政 + 逐建筑开关 → 买得起就自动建一级。 */
  {
    const aU = SB.state.freshRun(false);
    aU.res.kelp = 1e6;
    SB.habitat.autoTick(aU, null);                       // 没封建主义：不动
    const before = aU.lvl.kelp;
    aU.civics.feudalism = 1;
    SB.habitat.autoTick(aU, null);                       // 有封建主义但没开开关：不动
    const mid = aU.lvl.kelp;
    aU.autoUpg = { kelp: true };
    SB.habitat.autoTick(aU, null);                       // 开关打开：自动买一级
    check('生息区自动升级：封建主义+开关才动作（kelp 0→1），前两拍不动',
      before === 0 && mid === 0 && aU.lvl.kelp === 1,
      'before=' + before + ' mid=' + mid + ' after=' + aU.lvl.kelp);
  }

  {
    const trade = SB.state.freshRun(false);
    trade.res.stone = 1e6; trade.res.silt = 1e6;
    trade.techs.navigation = true;
    const tradeBuilding = SB.habitat.buildingById('lighthouse');
    check('重商主义声明开放贸易区域自动建造/升级',
      SB.civic.byId('mercantilism').autoBuildZones.indexOf('trade') >= 0 &&
      SB.habitat.autoZoneUnlocked(trade, 'trade') === false);
    SB.habitat.autoTick(trade, null);
    const noCivic = trade.lvl.lighthouse || 0;
    trade.civics.mercantilism = 1;
    SB.habitat.autoTick(trade, null);
    const noToggle = trade.lvl.lighthouse || 0;
    trade.autoUpg = { lighthouse: true };
    SB.habitat.autoTick(trade, null);
    check('贸易区域自动建造：重商主义 + 对应建筑开关才动作（灯塔 0→1）',
      !!tradeBuilding && noCivic === 0 && noToggle === 0 && trade.lvl.lighthouse === 1 &&
      SB.habitat.autoZoneUnlocked(trade, 'trade') === true,
      '无市政=' + noCivic + ' 无开关=' + noToggle + ' 开启后=' + trade.lvl.lighthouse);

    const live = SB.game.run();
    const liveSnapshot = { civics: live.civics, techs: live.techs, seen: live.seen };
    live.civics = Object.assign({}, live.civics, { mercantilism: 0 });
    live.techs = Object.assign({}, live.techs, { navigation: true });
    live.seen = Object.assign({}, live.seen);
    const noAutoControl = SB.ui.renderParts.paneVillage();
    live.civics.mercantilism = 1;
    const withAutoControl = SB.ui.renderParts.paneVillage();
    check('贸易区建筑行复用逐建筑自动开关，且仅重商主义完成后出现',
      noAutoControl.indexOf('data-auto="lighthouse"') < 0 &&
      withAutoControl.indexOf('data-auto="lighthouse"') >= 0 &&
      withAutoControl.indexOf('自动建造 / 升级') >= 0,
      '未完成重商主义=' + (noAutoControl.indexOf('data-auto="lighthouse"') >= 0) +
        ' 完成后=' + (withAutoControl.indexOf('data-auto="lighthouse"') >= 0));
    live.civics = liveSnapshot.civics;
    live.techs = liveSnapshot.techs;
    live.seen = liveSnapshot.seen;
  }

  /* ⑩ 职业行会卡：工坊效率 +40%（取代技艺的 +20% 通道，同一加法聚合）。 */
  {
    const gl = SB.state.freshRun(false);
    gl.civics.guild = 1;
    gl.cards = ['card_guild']; gl.card = 'card_guild';
    check('职业行会卡：工坊效率 +40%（craftMul=1.40）',
      Math.abs(SB.workshop.craftRatio(gl) - 0.40) < 1e-9,
      'craftRatio=' + SB.workshop.craftRatio(gl));
  }

  /* 古典共和 +1 幸福度偏移：有供给时稳定落在「无政体 +1 档」之上（政体红利真实生效，不是靠断供保底）。
   *   ⚠️ 旧断言名「断供也保底」是旧语义（删掉冻结分支前的口径）；新语义下断供=渐崩（见 ①/3500/3511），
   *      政体红利只在「有供给维持」时表现为持续 +1 偏移。偏移量是否被蒸发由下面 crRep vs noGov 钉。 */
  const crRep = SB.state.freshRun(false); crRep.gov = 'classical_republic'; crRep.jobs.merchant = 3; crRep.pop = 1;
  const noGov7 = SB.state.freshRun(false); noGov7.jobs.merchant = 3; noGov7.pop = 1;
  /* ⚠️ 2026-10-05 民生轴跟 trade 解锁走 ⇒ 「有贸易」夹具必须开 civics.trade，否则恒温器根本不跑、H 恒 0。 */
  crRep.civics.trade = true; noGov7.civics.trade = true;
  /* ⚠️ 收敛门限：政体 +1 偏移是恒温器的**平衡点差**（两状态按同一 ODE 收敛到同一 _Hmech，
   *    再各自叠加 _gb），初期差 ≈0、渐近才逼近 +1。探针实测 Δ@3000=0.43 / @10000=0.86 /
   *    @20000=0.98 / @50000=1.00 ⇒ 取 20000 才能在 <0.1 容差内钉住「偏移常驻、不蒸发」。 */
  for (let _i = 0; _i < 20000; _i++) { SB.economy.tick(crRep, 1, noop); SB.economy.tick(noGov7, 1, noop); }
  check('古典共和：政体 +1 偏移常驻（稳定供给下偏移量保留，不蒸发）',
    SB.civic.govHappyBonus(crRep) === 1 &&
    crRep.happy > noGov7.happy &&
    Math.abs((crRep.happy - noGov7.happy) - 1) < 0.1,
    'cr=' + crRep.happy.toFixed(3) + ' noGov=' + noGov7.happy.toFixed(3));
  const cr2 = SB.state.freshRun(false); cr2.gov = 'classical_republic'; cr2.jobs.merchant = 3; cr2.pop = 1;
  const noGov = SB.state.freshRun(false); noGov.jobs.merchant = 3; noGov.pop = 1;
  cr2.civics.trade = true; noGov.civics.trade = true;   // 同上：有贸易 ⇒ 必须开 trade 门
  for (var _k = 0; _k < 50000; _k++) { SB.economy.tick(cr2, 1, noop); SB.economy.tick(noGov, 1, noop); }
  check('古典共和：有贸易时幸福度稳定高于无政体 +1（偏移量，非每帧累加漂移）',
    Math.abs(cr2.happy - (noGov.happy + 1)) < 0.1 && cr2.happy > noGov.happy && cr2.happy < 50,
    '共和 H=' + cr2.happy.toFixed(3) + ' 无政体 H=' + noGov.happy.toFixed(3));

  /* 每个政体首次采用免费一次；之后重采用按最高已完成市政研究成本的 1/5 收费。 */
  const firstGov = SB.state.freshRun(false);
  firstGov.lvl.hall = 1; firstGov.civics.laws = 1; firstGov.civics.political = 1;
  firstGov.gov = 'tribe'; firstGov.govAdopted = { tribe: true }; firstGov.res.culture = 0;
  check('新解锁政体首次采用：即使市政点为 0 也可免费采用',
    SB.civic.govFirstAdoptionFree(firstGov, 'autocracy') &&
    SB.civic.govBlocked(firstGov, 'autocracy') === null &&
    SB.civic.setGov(firstGov, 'autocracy', noop) === true &&
    firstGov.gov === 'autocracy' && firstGov.res.culture === 0 && firstGov.govAdopted.autocracy === true);
  firstGov.gov = 'tribe'; firstGov.res.culture = 0;
  check('不同政体分别享有首次免费；已采用过的政体不能重复免费',
    SB.civic.govFirstAdoptionFree(firstGov, 'oligarchy') &&
    SB.civic.govBlocked(firstGov, 'oligarchy') === null &&
    SB.civic.govBlocked(firstGov, 'autocracy') !== null);
  const adopt = SB.state.freshRun(false);
  adopt.lvl.hall = 1; adopt.civics.laws = 1; adopt.civics.political = 1;
  adopt.gov = 'tribe'; adopt.govAdopted = { tribe: true, autocracy: true }; adopt.res.culture = 5000;
  const _topC = SB.civic.topCost(adopt);
  check('采用独裁统治（换政体）= 最高已完成市政研究成本的 1/5',
    SB.civic.setGov(adopt, 'autocracy', noop) === true && adopt.gov === 'autocracy' &&
    Math.abs(adopt.res.culture - (5000 - _topC / 5)) < 1e-9,
    'culture=' + adopt.res.culture + ' 收费=' + (_topC / 5));

  SB.ui.render.setCivicView('tree');
  SB.game.markDirty(); SB.game.render();
  const civicPane = g('pane-civic');
  check('市政页输出的是横卷容器（.techscroll + .technode），不是缩进列表',
    /class="techscroll[^\"]*"[^>]*id="civicScroll"/.test(civicPane) &&
    /class="technode st[^"]*"/.test(civicPane) &&
    civicPane.indexOf('civicrow-laws') >= 0,
    'canvas=' + /id="civicScroll"/.test(civicPane) +
    ' 节点=' + (civicPane.match(/class="technode/g) || []).length + ' 个');

  /* ⚠️ 这条是专门防上面那个 id 耦合 bug 的：市政 canvas 与科技 canvas 都带
   *    .techscroll 类，若拖动逻辑按 id 取容器，拖市政树会去动科技树的滚动位置。
   *    断言 = 拖市政 canvas，科技树的 scrollLeft 必须纹丝不动。 */
  const civicBox = doc.getElementById('civicScroll');
  const techBox = doc.getElementById('techScroll');
  if (civicBox && techBox) {
    civicBox.closest = sel => (sel === '.techscroll' ? civicBox : null);
    techBox.scrollLeft = 400;                       // 脏初值：0 与「没写」读数相同
    const ptrC = kind => (doc._ev[kind] || []).forEach(fn =>
      fn({ pointerType: 'mouse', button: 0, clientX: 900, target: civicBox, preventDefault() {} }));
    ptrC('pointerdown'); ptrC('pointermove'); ptrC('pointerup');
    check('拖市政长卷不会连带拖走科技长卷（两个容器各归各的 id）',
      techBox.scrollLeft === 400,
      '科技树 scrollLeft=' + techBox.scrollLeft + '（应仍是脏初值 400）');
  } else {
    check('拖市政长卷不会连带拖走科技长卷（两个容器各归各的 id）', false,
      ' civicScroll / techScroll 容器没找到');
  }
  SB.ui.render.setCivicView('government');
  SB.game.markDirty(); SB.game.render();
}


}
