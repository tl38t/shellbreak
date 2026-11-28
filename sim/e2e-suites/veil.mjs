/* e2e suite: 帷幕之后 · 大轮回（ERA11「α」+ 二层 prestige）
 * 2026-11-17 实装（spec docs/ERA11_VEIL_SPEC_v0.1.md + VEIL_HUB_SPEC_v0.1.md）。
 *
 * ⚠️ 这一族的共同背景：飞升系统全是**跨周目账本 + 原子清零**，错了不会报错——只会
 *    ①首次掀幕永远掀不动（veil===null 死锁，2026-11-17 用户静态核查抓到）；
 *    ②掀一次幕把玩家历史成绩抹掉；③周期账越算越大可以无限刷点。
 *    所以这里一律**行为断言**：给一个最小态，真调生产函数，比对「该变的变了、不该动的没动」。
 *
 * ⚠️ 数值全部是占位待标定（447M 是 44.7M×10 的拍板值，飞升点换算 10000/1000 也是拍板值）；
 *    改数值请改 techs.js / prestige.js，本文件的期望值若被改必须连带说明谁拍的板。
 * ⚠️ 本 suite 会**真掀幕**（清 meta 账本 + startRun），所以挂在 e2e 最尾部，
 *    自带 finally 快照还原，绝不压在整局 bot 前面。 */

export function run({ SB, check }) {
  console.log('\n=== 帷幕之后 · 大轮回（ERA11）===');
  const near = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 1e-9 : eps);
  const M = SB.game.meta();
  const snapMeta = JSON.parse(JSON.stringify(M));
  const restore = () => {
    for (const k of Object.keys(M)) delete M[k];
    Object.assign(M, JSON.parse(JSON.stringify(snapMeta)));
  };

  try {
    /* ---------------- ① 纪元 / 科技形状 ---------------- */
    const E = SB.ERAS || [];
    check('ERAS 第 11 项 = 「α」（用户 2026-11-16 拍板：ERA11 叫 α）',
      E.length === 11 && E[10].id === 11 && E[10].name === 'α',
      E.length + ' 项 / 末位=' + (E[10] ? E[10].id + ':' + E[10].name : '缺失'));

    const bv = (SB.TECHS || []).filter(t => t.id === 'beyond_veil')[0];
    const uf = (SB.TECHS || []).filter(t => t.id === 'unified_field')[0];
    check('《掀起帘幕》存在且 era=11 / key:true / 前置=大统一方程',
      !!bv && bv.era === 11 && bv.key === true && bv.reqs.join() === 'unified_field',
      bv ? ('era=' + bv.era + ' key=' + bv.key + ' reqs=' + bv.reqs.join()) : '缺失');
    check('成本 = 当前最高科技《大统一方程》× 10 = 447,000,000',
      !!bv && !!uf && uf.cost === 44700000 && bv.cost === uf.cost * 10,
      bv ? ('uf=' + (uf && uf.cost) + ' → bv=' + bv.cost) : '缺失');
    check('尤里卡 = 本周期累计星屑 ≥ 1000（复用现成 gathered 类型，零新增 cond）',
      !!bv && !!bv.cond && bv.cond.t === 'gathered' && bv.cond.r === 'stardust' && bv.cond.n === 1000,
      bv ? JSON.stringify(bv.cond) : '缺失');
    check('《大统一方程》自己的戴森 80% 尤里卡一字未动（2026-11-16 拍板 #9）',
      !!uf && !!uf.cond && uf.cond.t === 'dysonPct' && uf.cond.n === 80,
      uf ? JSON.stringify(uf.cond) : '缺失');
    const condTxt = bv ? SB.tech.condText(bv.cond) : '';
    check('尤里卡文案可渲染且说的是星屑（condText 走通，不需要新 cond 类型）',
      typeof condTxt === 'string' && /星屑/.test(condTxt), '文案=' + condTxt);

    /* ERA11 没有市政 ⇒ 市政树不能凭空长出一个空纪元。 */
    const ve = SB.civic.visibleEra(SB.state.freshRun(false));
    check('ERA11 无市政 ⇒ 市政树可见纪元上限夹在 10（不渲染空纪元）', ve <= 10, 'visibleEra=' + ve);

    /* ---------------- ② 首次掀幕：账本引导（2026-11-17 死锁回归锁） ---------------- */
    /* 造「真·首次掀幕」形状：veil === null（#4 口径 A 要求），但历史累计已够。
     * ⚠️ 这就是用户抓到的死锁现场：veil 为 null 时周期账恒为 0 ⇒ 门禁永不成立。 */
    M.veil = null;
    M.tideEarnedTotal = 25000;
    M.spent = 0;
    M.tide = 25000;
    M.stardustEarned = 600;
    M.stardust = 600;
    const sNo = SB.state.freshRun(false);       // 未建《神学》⇒ 本局无未结算收益
    const per0 = SB.prestige.veilPeriod(M, sNo);
    check('未掀幕档：周期账引导自存档累计（tide/stardust earned），不凭空造账',
      per0.hasLedger === false && per0.baseTide === 25000 && per0.baseStar === 600,
      'hasLedger=' + per0.hasLedger + ' base=' + per0.baseTide + '/' + per0.baseStar);
    check('飞升点 = round(tide/10000 + star/1000, 2)（不取整、留两位小数）',
      near(per0.points, 3.1), 'points=' + per0.points + '（期望 3.10）');
    const pv0 = SB.prestige.veilPreview(sNo);
    check('首次掀幕也能拿到预览（此前 veilPreview 返回 null ⇒ 整条路走不通）',
      !!pv0 && pv0.hasLedger === false && pv0.nextPath === 'si', pv0 ? 'nextPath=' + pv0.nextPath : 'null');
    check('预览给出「玩家可选池」selectable：硅基与生命织章均可选择',
      !!pv0 && pv0.selectable && pv0.selectable.join() === 'si,gn', pv0 ? 'selectable=' + (pv0.selectable || []).join() : 'null');

    /* ---------------- ③ 门槛：周期星屑 < 1000 ⇒ 拒绝且不改任何状态 ---------------- */
    const sLow = SB.state.freshRun(false);
    sLow.techs.beyond_veil = true;
    sLow.civics.theology = true;
    let lowErr = null;
    try { SB.prestige.doVeil(sLow, () => {}); } catch (e) { lowErr = e; }
    check('周期星屑 600/1000 ⇒ 掀幕被拒（抛错，不静默返回）', !!lowErr, lowErr ? lowErr.message : '没有抛错');
    check('被拒时账本都没建（原子性：失败不留半个 veil / 不清档）',
      M.veil === null && M.tideEarnedTotal === 25000 && M.stardustEarned === 600,
      'veil=' + JSON.stringify(M.veil) + ' earned=' + M.tideEarnedTotal + '/' + M.stardustEarned);

    /* 玩家自选的非法 id 校验（2026-11-18）：传未实装 / 不存在的 id 必须抛错且账本一字不动。
     * 门槛这里用 600/1000 的 sLow，本身也够不着 1000 —— 但 chooseId 的校验在算账之前，
     * 所以即使门槛没过，非法 id 也该先被拒（错误优先级确定）。用一个达标的 s 更干净地测。 */
    const sBad = SB.state.freshRun(false);
    sBad.techs.beyond_veil = true;
    sBad.civics.theology = false;
    M.stardustEarned = 1500; M.stardust = 1500;   // 达标，排除「因门槛被拒」的混淆
    let badErr = null;
    try { SB.prestige.doVeil(sBad, () => {}, 'vo'); } catch (e) { badErr = e; }  // vo 未实装
    check('选未实装路径（vo）⇒ 抛错、账本仍未建（自选校验先于算账，原子性）',
      !!badErr && M.veil === null, badErr ? badErr.message : '没有抛错');
    M.stardustEarned = 600; M.stardust = 600;     // 还原，继续下面的门槛测试

    /* ---------------- ④ 达标掀幕：原子事务的「清 / 保留」两列 ---------------- */
    M.stardustEarned = 1500;      // 跨过 1000 门槛
    M.stardust = 1500;
    const s1 = SB.state.freshRun(false);
    s1.techs.beyond_veil = true;
    s1.civics.theology = true;    // 过资格门 ⇒ 本局未结算部分要计入
    s1.peak = 12;
    const pv1 = SB.prestige.veilPreview(s1);
    check('掀幕前把「本局未结算收益」并入周期账（否则打穿一局换不来一点飞升点）',
      pv1.pendingActive === true && pv1.cycleStar >= 1500,
      'pending=' + pv1.pendingTide + '/' + pv1.pendingStar + ' cycleStar=' + pv1.cycleStar);

    const gained = pv1.points;
    /* 玩家自选：首掀显式传 'si'；未选择时仍按「没选就不开」处理。 */
    const r1 = SB.prestige.doVeil(s1, () => {}, 'si');
    check('首飞：第 1 重帷幕 / 玩家选 si ⇒ 开 si / newPath=si / 实发点数 === 预览点数',
      r1.count === 1 && r1.opened.join() === 'si' && r1.newPath === 'si'
        && near(r1.points, gained) && r1.firstVeil === true,
      'count=' + r1.count + ' opened=' + r1.opened.join() + ' newPath=' + r1.newPath
        + ' points=' + r1.points + ' vs ' + gained);
    check('清资产：轮回点 / 星屑余额归零，潮汐之树清空',
      M.tide === 0 && M.stardust === 0 && Object.keys(M.perks || {}).length === 0,
      'tide=' + M.tide + ' stardust=' + M.stardust);
    check('保留历史：tideEarnedTotal / stardustEarned 一字不动（决策 #1 / §2 保留列）',
      M.tideEarnedTotal === 25000 && M.stardustEarned === 1500,
      'earned=' + M.tideEarnedTotal + '/' + M.stardustEarned);
    check('定损方程不破：tideEarnedTotal − tide − spent ≡ 0（补发逻辑据此判断「丢了没」）',
      near(M.tideEarnedTotal - M.tide - M.spent, 0),
      'residual=' + (M.tideEarnedTotal - M.tide - M.spent) + ' spent=' + M.spent);
    check('周期账归零（下个周期的 1000 要重新攒）',
      M.veil.cycleTide === 0 && M.veil.cycleStar === 0,
      M.veil.cycleTide + '/' + M.veil.cycleStar);
    check('第 1 重帷幕后飞升点已入账、累计值同步',
      near(M.veil.points, gained) && near(M.veil.lifetimePoints, gained),
      'points=' + M.veil.points + ' lifetime=' + M.veil.lifetimePoints);
    check('新局从 ERA1 重建（删档重来）', SB.game.run().era === 1, 'era=' + SB.game.run().era);

    /* ---------------- ⑤ 口径 A：星屑种子切本周期 ---------------- */
    check('口径 A：未掀幕档星屑种子 = 历史累计（存量档行为零变化）',
      SB.state.starEarnedSeed({ veil: null, stardustEarned: 4321 }) === 4321,
      String(SB.state.starEarnedSeed({ veil: null, stardustEarned: 4321 })));
    check('口径 A：已掀幕档星屑种子 = 本帷幕周期（历史不再喂工坊/尤里卡）',
      SB.state.starEarnedSeed({ veil: { cycleStar: 37 }, stardustEarned: 4321 }) === 37,
      String(SB.state.starEarnedSeed({ veil: { cycleStar: 37 }, stardustEarned: 4321 })));
    check('新局 got.stardust 也走新口径（=0），不会开局白送尤里卡',
      SB.game.run().got.stardust === 0, 'got.stardust=' + SB.game.run().got.stardust);

    /* ---------------- ⑥ 自选解锁：si / gn 可选，已开启路径会退出可选池 ----------------
     * 玩家未选择时仍可照常掀幕、获得飞升点；可选路径保持可选，不会被默认开启。 */
    const prime = () => {
      const s = SB.game.run();
      s.techs.beyond_veil = true;
      s.civics.theology = false;     // 不带未结算收益，让周期账只由本行决定
      M.veil.cycleStar = 1000;
      M.veil.cycleTide = 0;
    };
    const pv2 = (prime(), SB.prestige.veilPreview(SB.game.run()));
    check('第 2 次掀幕前仅生命织章仍可选（si 已开，vo 仍为预览）',
      !!pv2 && pv2.selectable.join() === 'gn', pv2 ? 'selectable=' + pv2.selectable.join() : 'null');
    prime(); const r2 = SB.prestige.doVeil(SB.game.run(), () => {});
    check('第 2 重帷幕：没选路径 ⇒ 不开新路径（opened 仍 si），但 count 照涨到 2 且给出点数',
      r2.opened.join() === 'si' && r2.newPath === null && r2.count === 2 && r2.points > 0,
      'opened=' + r2.opened.join() + ' newPath=' + r2.newPath + ' count=' + r2.count + ' points=' + r2.points);
    prime(); const r3 = SB.prestige.doVeil(SB.game.run(), () => {}, 'gn');
    check('第 3 重帷幕：选择 gn 后生命织章开启并写入路径账本',
      r3.count === 3 && r3.opened.join() === 'si,gn' && r3.newPath === 'gn',
      'count=' + r3.count + ' opened=' + r3.opened.join() + ' newPath=' + r3.newPath);
    prime(); const r4 = SB.prestige.doVeil(SB.game.run(), () => {});
    check('第 4 次无可选路径（si / gn 均已开），只涨 count、不重复解锁',
      r4.opened.join() === 'si,gn' && r4.count === 4, 'opened=' + r4.opened.join() + ' count=' + r4.count);

    /* 重复选已开启的 si ⇒ 必须抛错、账本一字不动（校验在算账前，原子性）。
     * 另造一个达标局，避免复用被上面掀幕 startRun 换掉的本局。 */
    const sDup = SB.game.run();
    sDup.techs.beyond_veil = true; sDup.civics.theology = false;
    M.veil.cycleStar = 1000; M.veil.cycleTide = 0;
    const openedBeforeDup = M.veil.paths.opened.slice();
    let dupErr = null;
    try { SB.prestige.doVeil(sDup, () => {}, 'si'); } catch (e) { dupErr = e; }
    check('重复选已开启的 si ⇒ 抛错，账本 opened / 周期账一字不动（原子性）',
      !!dupErr && M.veil.paths.opened.join() === openedBeforeDup.join() && M.veil.cycleStar === 1000,
      (dupErr ? dupErr.message : '没有抛错') + ' opened=' + M.veil.paths.opened.join()
        + ' cycleStar=' + M.veil.cycleStar);

    /* ---------------- ⑥.5 飞升不清挑战：档位 / 永久奖励 / 轻车熟路累计全留 ----------------
     * 2026-11-22 用户改判（推翻同日早先的「飞升清普通挑战档位」）：
     *   档位是所有挑战永久奖励的唯一真源，清档位 = 连奖励一起撤；成就墙的章却保留，
     *   会造成「章在效果没了」。现口径：普通 / 飞升挑战的档位与奖励一律跨幕保留。
     * ⚠️ 这组断言锁两条边界：
     *    ① 挑战档位 + 由 tierDone 派生的永久效果（初始人口）跨幕不变；
     *    ② 轻车熟路（bld_* 成就）跨周目累计账 meta.buildingLvlTotal 不被清。 */
    const C = SB.challenges;
    M.challenges = M.challenges || { completed: {} };
    M.challenges.completed = {};
    M.challenges.completed.waterpollution = true;    // 普通·单档
    M.challenges.completed.good_old_days = true;     // 普通·单档
    M.challenges.completed.small = true;             // 普通·单档
    M.challenges.completed.veil_rush = 2;            // 飞升·三档
    M.challenges.completed.veil_cramped = 1;         // 飞升·三档
    M.buildingLvlTotal = { kelp: 99, hall: 120 };     // 轻车熟路跨周目累计账
    M.achv = M.achv || {};
    M.achv.pollutionClear = true;
    M.achv.challengeGoodOldDays = true;
    M.achv.challengeVeilRush = true;
    M.achv.firstRebirth = true;
    M.achievements = M.achievements || {};
    M.achievements.pollutionClear = true;
    M.achievementsSteam = M.achievementsSteam || {};
    M.achievementsSteam.challengeGoodOldDays = true;
    const countBeforeClear = C.completedCount(M);
    const popBeforeClear = C.startingPopulation();
    prime();
    SB.prestige.doVeil(SB.game.run(), () => {});
    check('飞升保留普通挑战：水体污染 / 美好旧日 / 小国寡民档位原样（挑战页仍标已完成）',
      C.tierDone('waterpollution', M) === 1 && C.tierDone('good_old_days', M) === 1
        && C.tierDone('small', M) === 1,
      'water=' + C.tierDone('waterpollution', M) + ' good=' + C.tierDone('good_old_days', M)
        + ' small=' + C.tierDone('small', M));
    check('飞升保留飞升挑战：veil_rush 2 档 / veil_cramped 1 档原样',
      C.tierDone('veil_rush', M) === 2 && C.tierDone('veil_cramped', M) === 1,
      'veil_rush=' + C.tierDone('veil_rush', M) + ' veil_cramped=' + C.tierDone('veil_cramped', M));
    check('挑战永久奖励随档位保留：初始人口仍为基础 +5（污染 +2 / 小国 +3）',
      popBeforeClear === SB.CFG.POP_START + 5 && C.startingPopulation() === SB.CFG.POP_START + 5,
      popBeforeClear + ' → ' + C.startingPopulation() + '（基准 ' + SB.CFG.POP_START + '）');
    check('完成数不变（6 → 6）：普通 + 飞升档位都不因飞升增减',
      countBeforeClear === 6 && C.completedCount(M) === 6,
      countBeforeClear + ' → ' + C.completedCount(M));
    check('轻车熟路累计账不清：buildingLvlTotal kelp=99 / hall=120 原样，成就墙进度读数不变',
      M.buildingLvlTotal.kelp === 99 && M.buildingLvlTotal.hall === 120
        && SB.achv.progressOf('bld_kelp', M, null).cur === 99,
      'kelp=' + M.buildingLvlTotal.kelp + ' hall=' + M.buildingLvlTotal.hall
        + ' progress=' + SB.achv.progressOf('bld_kelp', M, null).cur);
    check('成就不撤：本地成就墙 + 平台两本账的挑战章全部保留',
      !!M.achv.pollutionClear && !!M.achv.challengeGoodOldDays
        && !!M.achievements.pollutionClear && !!M.achievementsSteam.challengeGoodOldDays,
      'achv.p=' + !!M.achv.pollutionClear + ' achv.g=' + !!M.achv.challengeGoodOldDays
        + ' tap.p=' + !!M.achievements.pollutionClear
        + ' steam.g=' + !!M.achievementsSteam.challengeGoodOldDays);
    check('不乱清：飞升挑战章与非挑战成就（firstRebirth）保留',
      !!M.achv.challengeVeilRush && !!M.achv.firstRebirth,
      'veilRush=' + !!M.achv.challengeVeilRush + ' firstRebirth=' + !!M.achv.firstRebirth);
    check('飞升点乘区不受影响：ascensionTierCount 只数飞升挑战（2+1=3）',
      C.ascensionTierCount(M) === 3, 'ascensionTierCount=' + C.ascensionTierCount(M));
    /* 边界：玩家在**普通挑战进行中**飞升，且本局已达成其 goal（dysonDone）——
     * ⑤.5 现在全量 evaluate：已通关档位走 replay 分支，只刷榜、不写账、不重复发奖；
     * 档位保持原值（既不清零，也不凭空 +1）。 */
    M.challenges.completed.waterpollution = true;
    const sMid = SB.game.run();
    sMid.challenge = { id: 'waterpollution', tier: 0, startedAt: Date.now() };
    sMid.dysonDone = true;
    sMid.techs.beyond_veil = true;
    sMid.civics.theology = false;
    M.veil.cycleStar = 1000; M.veil.cycleTide = 0;
    SB.prestige.doVeil(sMid, () => {});
    check('边界：普通挑战进行中飞升 ⇒ 已通关档位保持 1，replay 不写账不重复发奖',
      C.tierDone('waterpollution', M) === 1 && !!M.achv.pollutionClear,
      'tierDone=' + C.tierDone('waterpollution', M) + ' achv=' + !!M.achv.pollutionClear);

    /* ---------------- ⑦ 已掀幕档：doBreak 增量累加周期账 ---------------- */
    M.veil.cycleStar = 0;
    M.veil.cycleTide = 0;
    const sB = SB.game.run();
    sB.techs.beyond_veil = true;
    sB.civics.theology = true;
    sB.breakSettled = false;
    sB.peak = 12;
    const beforeTide = M.veil.cycleTide, beforeStar = M.veil.cycleStar;
    const rb = SB.prestige.doBreak(sB, () => {}, { silent: true });
    check('已掀幕档：合格轮回把本局结算值累加进周期账（不另算一遍）',
      !!rb && near(M.veil.cycleTide - beforeTide, rb.tidePoints) && near(M.veil.cycleStar - beforeStar, rb.stardust),
      'Δ=' + (M.veil.cycleTide - beforeTide) + '/' + (M.veil.cycleStar - beforeStar) +
      ' vs 结算=' + (rb && rb.tidePoints) + '/' + (rb && rb.stardust));
    check('结算当场写回 s.got.stardust = 本周期累计（W2 与 freshRun 同源）',
      near(sB.got.stardust, SB.state.starEarnedSeed(M)),
      'got=' + sB.got.stardust + ' seed=' + SB.state.starEarnedSeed(M));

    /* ---------------- ⑦.5 政体被动卡跨帷幕保留（2026-11-28 用户拍板） ----------------
     * 《美好旧日》的奖励文案承诺「永久解锁你在各周目采用过的政体的被动卡」，而旧规格把
     * govPassiveCards / govEverAdopted 列进「清」列 ⇒ 每飞升一次奖励归零，且记录被清后
     * civics.unlockAdoptedGovPassiveCards 没有任何重建依据。这里钉死「掀幕不清这两张表」。 */
    M.govPassiveCards = { tribe: true };
    M.govEverAdopted = { tribe: true };
    const sGov = SB.game.run();
    sGov.techs.beyond_veil = true;
    sGov.civics.theology = false;
    M.veil.cycleStar = 1000; M.veil.cycleTide = 0;
    SB.prestige.doVeil(sGov, () => {});
    check('政体被动卡解锁表跨帷幕保留（否则《美好旧日》的永久奖励每次飞升归零）',
      !!(M.govPassiveCards && M.govPassiveCards.tribe === true)
        && !!(M.govEverAdopted && M.govEverAdopted.tribe === true),
      'passive=' + JSON.stringify(M.govPassiveCards) + ' ever=' + JSON.stringify(M.govEverAdopted));

    /* ---------------- ⑧ UI：帷幕是独立页签，不是弹窗 ---------------- */
    /* 2026-11-17 晚用户拍板：「加一个新的标签，就叫帷幕，点了就切换到帷幕页面，不是弹窗那种」。
     * 原先落在轮回商店页底部的 .meta-veil 入口卡已随本次改动删除 —— 这里改钉新形态：
     * ① 页签集合里有 veil；② 大厅正文由 veilHub.markup() 出；③ 不再有弹窗/关闭按钮。 */
    M.shopUnlocked = true;
    const keys = SB.ui.render.PANE_KEYS || [];
    check('PANE_KEYS 含独立页签 veil（点页签切页，不是弹窗）',
      keys.indexOf('veil') >= 0 && keys.indexOf('meta') >= 0, 'keys=' + keys.join(','));
    const hubHtml = SB.ui.veilHub && SB.ui.veilHub.markup ? SB.ui.veilHub.markup() : '';
    check('帷幕页正文出三张路径卡（data-veil-path）',
      (hubHtml.match(/data-veil-path=/g) || []).length === 3,
      'len=' + hubHtml.length + ' cards=' + (hubHtml.match(/data-veil-path=/g) || []).length);
    check('大厅写明第几重帷幕 / 已开路径数 / 飞升点余额',
      /第 \d+ 重帷幕/.test(hubHtml) && /已开启 \d+ \/ 3/.test(hubHtml) && /飞升点/.test(hubHtml), '');
    check('大厅不再有「关闭」语义（页签即导航，右上角改为飞升点余额）',
      hubHtml.indexOf('data-veil-action="close"') < 0 && hubHtml.indexOf('vh-points') >= 0, '');
    const metaHtml2 = SB.ui.render.paneMeta();
    check('轮回商店页不再有第二个帷幕入口（换成独立页签后是冗余）',
      typeof metaHtml2 === 'string' && metaHtml2.indexOf('data-veil-open') < 0 &&
      metaHtml2.indexOf('meta-veil') < 0, 'len=' + (metaHtml2 || '').length);
    /* 进装配台：view 从 hub 切到 si，正文换成十个器官热区 + 返回按钮。 */
    if (SB.ui.veilHub && SB.ui.veilHub.openPath) {
      SB.ui.veilHub.openPath('si');
      const pathHtml = SB.ui.veilHub.markup();
      check('点 si 路径后页内切到装配台（十热区 + 返回帷幕，仍不是弹窗）',
        (pathHtml.match(/data-organ=/g) || []).length === 10 &&
        pathHtml.indexOf('data-veil-action="back"') >= 0 &&
        pathHtml.indexOf('vm-box') >= 0,
        'organs=' + (pathHtml.match(/data-organ=/g) || []).length);
      SB.ui.veilHub.back && SB.ui.veilHub.back();
      check('返回后回到大厅', (SB.ui.veilHub.markup() || '').indexOf('vh-cards') >= 0, '');
    }
  } finally {
    restore();
    /* 掀幕把本局换成了 ERA1 新局；还原账本后再开一局，别让后续/收尾读到半截状态。 */
    try { SB.state.saveMeta(M); SB.game.startRun(); } catch (e) { /* 收尾不阻断断言结果 */ }
  }
}
