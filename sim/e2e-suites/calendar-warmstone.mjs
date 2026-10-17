/* e2e suite: calendar, warmstone, and seasonal resource regressions. */
export function run({ SB, check, noop, doc, g, fs, path, ROOT, fire }) {
console.log('\n=== 历法读数与暖石开关 ===');
{
  const s = SB.state.freshRun(false);
  s.lvl.kelp = 1;
  SB.game.markDirty(); SB.game.render();

  /* ⚠️ DOM 侧那两条断言必须在**活着的这一局**上做：假的渲染层画的永远是 SB.game.run()，
   *    拿上面那个 freshRun 的 `s` 去比对，等于测「A 状态渲染出来的 B 状态」，
   *    两边永远对不上（也永远测不到接线）。`s` 只用来测 economy.seasonMeta 这类纯函数口径。 */
  const live = SB.game.run();
  const wasCal = !!(live.techs && live.techs.calendar);

  /* ① 没掌握历法 ⇒ 读数必须**缺位**，而不是给个裸值。
   *    缺位本身就是奖励：玩家看到「看不出规律」，才知道还有一件事没解锁。
   * ⚠️ 2026-09-26 起它住在顶上那张「自然环境」卡里（与天壳同卡），不再在巢穴页 ——
   *    所以这里读的是 envVolcano（由 renderEnv 每帧填）而不是 pane-village。 */
  let sm = SB.economy.seasonMeta(s);
  check('未掌握历法：seasonMeta 标记 known=false', sm.known === false, 'known=' + sm.known);
  check('未掌握历法：面板不报季名，只说看不出规律',
    g('envVolcano').indexOf('看不出规律') !== -1, '');
  check('海底火山已离开巢穴页（它是环境读数，不是建造动作）',
    g('pane-village-body').indexOf('海底火山') === -1, '');

  /* ② 掌握了 ⇒ 报的是 seasonMul（实际生效值），不是 SEASONS 的裸倍率。
   *    报裸值会出现「学了历法反而看到倍率变差」，那纯属显示坑。 */
  s.techs.calendar = true;
  sm = SB.economy.seasonMeta(s);
  check('掌握历法：seasonMeta 报出季名与周期读数',
    sm.known === true && typeof sm.name === 'string' && sm.left > 0 && !!sm.next,
    JSON.stringify(sm));
  check('读数用的是实际生效倍率 seasonMul，不是 SEASONS 裸值',
    Math.abs(sm.mult - SB.economy.seasonMul(s)) < 1e-12,
    'seasonMeta=' + sm.mult + ' / seasonMul=' + SB.economy.seasonMul(s));

  /* ③ ⚠️ 面板 == 实账（2026-09-26 修掉的「面板撒谎」）。
   *    seasonMul 的第二参数原名 reliefOverride，语义是「**顶替** tech 的 relief」；
   *    而 tick 传进来的是 warmRelief(s, dt)，**没烧暖石时它返回 0（不是 null）**
   *    ⇒ `0 != null` 为真 ⇒ 历法那 0.25 被整个吞掉。
   *    症状：面板走 rates()（不传参）读得到历法、tick 走 foodRate(s, cold, 0) 读不到，
   *    实测 面板 0.196875 / 实账 0.112500，**面板撒谎 1.75 倍**，且不报错、只偏数值。
   *    ⇒ 这条不变式是这类 bug 的唯一防线：rates() 的每一项必须与 tick 同项逐位相等。
   *      ⚠️ 2026-09-30 补：它原先只写了「**不烧暖石**时」，正好漏掉 relief≠0 那一档 ——
   *        `rates().kelp` 漏传 relief 就是这么静默穿过整轮回归的（用户报的原话：
   *        「开关暖石产出完全没区别」）。relief≠0 那一档的钉子见下面那段
   *        「烧暖石时顶栏藻食速率必须变（rates().kelp 并进 relief）」。
   *      改 seasonMul / foodRate / tick / rates 任何一处都要把两档（relief=0 / ≠0）都看一遍。 */
  {
    /* 探的是季节乘区本身，不是 rates().kelp —— 后者是**净额**（已经减掉口粮消耗），
     * 拿它跟毛额比会得到「面板 -0.1875 / 实账 0.1125」这种假红。 */
    const ss = SB.state.freshRun(false);
    /* ⚠️ 同文件另一处一样的坑：旧版写死 `SEASON_TICKS * 3`（第 4 季 = 寒流季），
     * 2026-09-27 删季后 3 % 3 = 0 ⇒ 落到暖流季（mult 1.5），断言假红。按表查索引。 */
    ss.t = SB.CFG.SEASON_TICKS * SB.SEASONS.findIndex(x => x.mult < 1);   // 寒流季（减产最狠的一季）
    /* ① 没烧暖石 = tick 那条路传 0 ⇒ 必须与面板（不传参）**逐位相等**。
     *    这就是 bug 的形状：`0 != null` 为真 ⇒ tech 的 relief 被顶掉。 */
    check('暖石没烧时（tick 传 0）季节乘区与面板一致——历法不得被吞',
      Math.abs(SB.economy.seasonMul(ss, 0) - SB.economy.seasonMul(ss)) < 1e-12,
      'tick 路 ' + SB.economy.seasonMul(ss, 0).toFixed(6) +
      ' / 面板路 ' + SB.economy.seasonMul(ss).toFixed(6));
    const bare = SB.economy.season(ss.t).mult;
    check('未掌握历法：季节乘区就是裸倍率（两条路都对）',
      Math.abs(SB.economy.seasonMul(ss, 0) - bare) < 1e-12,
      'seasonMul=' + SB.economy.seasonMul(ss, 0) + ' SEASONS=' + bare);
    /* ② 2026-09-30 起历法**只**给信息型奖励，不再收窄产量：掌握历法后 tick 那条路的
     *   季节乘区必须仍等于裸倍率，不能因为掌握了历法而变化（防有人把 eff.season 加回来）。 */
    ss.techs.calendar = true;
    const withTech = SB.economy.seasonMul(ss, 0);
    check('历法只给信息型奖励、不收窄产量（掌握历法后季节乘区仍 == 裸倍率）',
      Math.abs(withTech - bare) < 1e-12 &&
      Math.abs(withTech - SB.economy.seasonMul(ss)) < 1e-12,
      '寒流季裸倍率 ' + bare + ' / 掌握历法后 ' + withTech.toFixed(6));
    /* ③ 暖石顶回减产：seasonMul 里 warmRelief 与 tech 收窄是**相加**不是互斥
     *   （历法已不再参与，这里验证暖石独立在裸倍率之上再顶一层）。 */
    const bothCh = SB.economy.seasonMul(ss, SB.CFG.WARM_RELIEF);
    check('暖石顶回减产（warmRelief 与 tech 收窄相加而非互斥，历法已不参与）',
      bothCh > withTech + 1e-9 && bothCh <= 1,
      '裸倍率 ' + withTech.toFixed(6) + ' → 暖石顶回 ' + bothCh.toFixed(6));
  }

  /* 掌握之后同一格要换成有内容的读数（换的是文案，不是换一格）。
   * 这一行只在活的那局上临时置位，测完立刻还原 —— 后面还有整局跑，别把夹具漏进去。 */
  live.techs = live.techs || {};
  live.techs.calendar = true;
  SB.game.markDirty(); SB.game.render();
  const ev = g('envVolcano');
  check('掌握历法后自然环境报出季名与周期（同一格，不再说看不出规律）',
    ev.indexOf('海底火山') !== -1 && ev.indexOf('看不出规律') === -1 &&
    ev.indexOf('×') !== -1 && /\d/.test(ev),
    '「' + ev.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64) + '」');
  check('自然环境文案不吐 undefined（读数换文案时最容易漏的分支）',
    ev.indexOf('undefined') === -1 && ev.indexOf('NaN') === -1, '');
  /* ③ 季节读数只此一处。2026-09-26 用户要求把顶栏那行读数**整行删掉**
   *    （原话：「这部分直接删掉，不是改成用海底火山活跃期代替了吗」）——
   *    ⚠️ 删一个 DOM 节点不会报错，坏法只在它哪天被加回来，所以这里钉两条：
   *    ① 静态结构里没有 `seasonLine` 这个 id（假 DOM 的 getElementById 对不存在的 id
   *       照样返回桩对象，靠渲染层测不出来，只能从 index.html 读）；
   *    ② 渲染出来的顶栏资源卡不再复述季名。
   *    族民 / 峰值 / 饿死 / 冻死不在这里查：那些读数归巢穴页与破壳结算，本就不在顶栏。 */
  const html2 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('顶栏那行季节读数已删（海底火山活跃期是唯一出处）',
    html2.indexOf('seasonLine') === -1 && g('res').indexOf('季') === -1,
    'index.html 里 seasonLine 出现 ' + (html2.match(/seasonLine/g) || []).length +
    ' 次；顶栏资源卡含「季」？' + (g('res').indexOf('季') >= 0));
  live.techs.calendar = wasCal;
  SB.game.markDirty(); SB.game.render();

  /* ③ 暖石开关：三件事——惩罚季才烧、石不够就顶不住、只顶建筑侧。 */
  const coldT = SB.state.freshRun(false);
  coldT.lvl.kelp = 10;
  coldT.techs.calendar = true;                       // 把 relief 固定在历法那一档
  coldT.res.kelp = 1e6;                              // 隔离口粮，只观察季节
  coldT.warmOn = true;
  coldT.res.warmstone = 100;
  /* 找一个惩罚季（mult < 1）。SEASONS 里只有寒流季 0.25 < 1，所以把 t 推到它头上。 */
  /* 把时间推到惩罚季的**下一季头**（seasonIdx 按 t/SEASON_TICKS 取模，取上一季的头也行，
   * 这里选下一季避免正好压在本季刚换的边界上）。 */
  const idx = SB.economy.seasonIdx(coldT.t);
  const coldIdx = SB.SEASONS.findIndex(x => x.mult < 1);
  coldT.t = (coldIdx - idx + SB.SEASONS.length) * SB.CFG.SEASON_TICKS;
  const before = coldT.res.warmstone;
  SB.economy.tick(coldT, 1, noop);
  check('惩罚季开开关：暖石真的被烧掉', coldT.res.warmstone < before,
    before + ' → ' + coldT.res.warmstone);

  /* 顶回的落点：藻场产出（建筑侧那只季节乘区）。
   * ⚠️ 不测 seasonMul——它不带这个参数，只有 foodRate 收 reliefOverride。
   *    等到「只顶建筑侧」那条断言里会再解释一次为什么必须是建筑侧。 */
  const r0 = SB.economy.foodRate(coldT, 1, 0);
  const r1 = SB.economy.foodRate(coldT, 1, SB.CFG.WARM_RELIEF);
  check('惩罚季开开关：藻场产出被顶回', r1 > r0, r0.toFixed(4) + ' → ' + r1.toFixed(4) + '/秒');
  check('开关只顶回一部分，不是全额抵消', SB.economy.seasonMul(coldT, SB.CFG.WARM_RELIEF) < 1,
    SB.economy.seasonMul(coldT, SB.CFG.WARM_RELIEF).toFixed(4));

  /* 与「职业侧不吃季节」同一条纪律：暖石不能变成全局乘区，
   * 否则寒流季的采集者跟着一起被抬高——看着像开关很划算，实际是绕过了季节设计。
   * 判据用「多雇采集者不改变顶回量」而不是抄公式：前者直接证伪后者。 */
  coldT.jobs.gather = 0;
  const d0 = SB.economy.foodRate(coldT, 1, SB.CFG.WARM_RELIEF) - SB.economy.foodRate(coldT, 1, 0);
  coldT.jobs.gather = 5;
  const d1 = SB.economy.foodRate(coldT, 1, SB.CFG.WARM_RELIEF) - SB.economy.foodRate(coldT, 1, 0);
  check('暖石只顶建筑侧：多雇采集者不改变顶回量（职业侧不吃季节）',
    Math.abs(d0 - d1) < 1e-9, 'gather=0 顶回 ' + d0.toFixed(4) + ' / gather=5 顶回 ' + d1.toFixed(4));

  /* 石够 vs 石不够，同一个 tick 的差别。
   * ⚠️ 不能写成「跑一 tick 前后比对 foodRate(…, 0)」：relief=0 那一支跟开关根本无关，
   *    前后必然逐位相等（实测 0.2250 → 0.2250），测的是空气。
   *    要看的是「开关实际顶回了多少」，所以直接问 warmRelief 这一 tick 顶回几成。 */
  coldT.jobs.gather = 0;
  coldT.warmOn = true;
  coldT.res.warmstone = 100;
  const wFull = SB.economy.warmRelief(coldT, 1);
  const rateFull = SB.economy.foodRate(coldT, 1, wFull);
  check('暖石充足：这一 tick 顶得上来', wFull > 0 && rateFull > r0,
    'warmRelief=' + wFull + ' 产出 ' + r0.toFixed(4) + ' → ' + rateFull.toFixed(4));
  check('暖石充足：burning 标记起来', SB.economy.warmBurning(coldT) === true, '');

  coldT.res.warmstone = 0.01;                        // 不够烧这一 tick 的
  const wDry = SB.economy.warmRelief(coldT, 1);
  const rateDry = SB.economy.foodRate(coldT, 1, wDry);
  check('暖石见底：这一 tick 顶不住，产出回落', wDry === 0 && rateDry < rateFull,
    '顶回 ' + wFull + ' → ' + wDry + '；产出 ' + rateFull.toFixed(4) + ' → ' + rateDry.toFixed(4));
  check('暖石见底：burning 标记落下去（不让面板骗玩家在烧）',
    SB.economy.warmBurning(coldT) === false, '');

  /* rates() 的暖石净速率必须与 warmRelief 同源。这条判据分叉的窗口很窄
   * （暖石剩不到一个 WARM_RATE 的那几秒），但症状是「面板说在烧、结算没烧」，
   * 而且只在这一个落点出现，别的数值回归碰不到它。 */
  const dryT = SB.state.freshRun(false);
  dryT.lvl.kelp = 10; dryT.res.kelp = 1e6;
  dryT.techs.calendar = true;
  dryT.jobs.miner = 1;                     // 暖石只有矿工这一条产线
  const di = SB.economy.seasonIdx(dryT.t);
  dryT.t = (coldIdx - di + SB.SEASONS.length) * SB.CFG.SEASON_TICKS;   // 推到惩罚季
  dryT.warmOn = false;
  const prod = SB.economy.rates(dryT).warmstone;
  check('暖石产出基线 > 0（伴生线是这条开关的燃料）', prod > 0, prod.toFixed(4) + '/秒');

  dryT.warmOn = true;
  dryT.res.warmstone = 0.5;                // WARM_RATE = 1：不够烧满一 tick
  const netThin = SB.economy.rates(dryT).warmstone;
  const relThin = SB.economy.warmRelief(dryT, 1);
  check('暖石剩不到一个 tick 的量：rates 与 warmRelief 都不认这口',
    Math.abs(netThin - prod) < 1e-9 && relThin === 0 && SB.economy.warmBurningNow(dryT) === false,
    'rates ' + netThin.toFixed(4) + ' / warmRelief ' + relThin + ' / 纯产出 ' + prod.toFixed(4));

  dryT.res.warmstone = 2;
  const netFull = SB.economy.rates(dryT).warmstone;
  check('暖石够烧：rates 扣掉那一口，与 warmRelief 同步',
    Math.abs(netFull - (prod - SB.CFG.WARM_RATE)) < 1e-9 && SB.economy.warmRelief(dryT, 1) > 0,
    'rates ' + netFull.toFixed(4) + ' / 期望 ' + (prod - SB.CFG.WARM_RATE).toFixed(4));

  /* ⚠️ 面板 == 实账：「**烧暖石**」那一档（2026-09-30 补，用户报「开关暖石产出完全没区别」）。
   *    上面那条不变式（见「③ 面板 == 实账」）只覆盖「**不烧暖石**」（relief=0），
   *    于是 `rates().kelp` 漏传 relief 这件事静默穿过了整轮回归 ——
   *    症状正是顶栏速率拨开关纹丝不动、而 tick 走 foodRate(s, cold, warm) 真的在顶。
   *    ⚠️ 两条读数路径都要查：「顶栏速率」rates().kelp、「火山卡读数」seasonMeta().mult。
   *    判据取 warmBurningNow（纯查询、无副作用）而不是 warmRelief（它会烧石+置 warmBurning，
   *    渲染路径里调 = 玩家盯着面板就偷烧一 tick，见 economy.js warmRelief 上方那段注）。 */
  {
    const bal = SB.state.freshRun(false);
    bal.lvl.kelp = 10; bal.jobs.gather = 3; bal.res.kelp = 1e6;
    const bi = SB.economy.seasonIdx(bal.t);
    bal.t = (coldIdx - bi + SB.SEASONS.length) * SB.CFG.SEASON_TICKS;   // 推到惩罚季（寒流季）
    bal.res.warmstone = 100;
    bal.warmOn = false;
    const offRate = SB.economy.rates(bal).kelp;
    const offMult = SB.economy.seasonMeta(bal).mult;
    bal.warmOn = true;
    const onRate = SB.economy.rates(bal).kelp;
    const onMult = SB.economy.seasonMeta(bal).mult;
    check('烧暖石时顶栏藻食速率必须变（rates().kelp 并进 relief，不再是死数）',
      onRate > offRate + 1e-9,
      '关 ' + offRate.toFixed(4) + ' → 开 ' + onRate.toFixed(4) + ' /秒');
    check('烧暖石时面板速率与 tick 同项逐位相等',
      Math.abs(onRate - (SB.economy.foodRate(bal, 1, SB.CFG.WARM_RELIEF) - SB.economy.foodUse(bal))) < 1e-12,
      '面板 ' + onRate.toFixed(6) + ' / 结算 ' +
      (SB.economy.foodRate(bal, 1, SB.CFG.WARM_RELIEF) - SB.economy.foodUse(bal)).toFixed(6));
    check('烧暖石时火山卡读数也含 relief（seasonMeta 与实账同源）',
      Math.abs(onMult - SB.economy.seasonMul(bal, SB.CFG.WARM_RELIEF)) < 1e-12 && onMult > offMult + 1e-9,
      '关 ' + offMult.toFixed(4) + ' → 开 ' + onMult.toFixed(4));
    bal.warmOn = false;
    check('拨回关：两条读数都回落到不带 relief 的那一档（开关是可逆的读数）',
      Math.abs(SB.economy.rates(bal).kelp - offRate) < 1e-12 &&
      Math.abs(SB.economy.seasonMeta(bal).mult - offMult) < 1e-12, '');
  }

  /* 非惩罚季不烧：开关开着也不该白白扔暖石。 */
  const warmT = SB.state.freshRun(false);
  warmT.lvl.kelp = 10; warmT.res.kelp = 1e6;
  warmT.warmOn = true; warmT.res.warmstone = 100;
  const wi = SB.economy.seasonIdx(warmT.t);
  warmT.t = (SB.SEASONS.findIndex(x => x.mult >= 1) - wi + SB.SEASONS.length) % SB.SEASONS.length
    * SB.CFG.SEASON_TICKS;
  /* 非惩罚季不烧（2026-09-27 用户拍板回到季节闸）。历史：这条曾因「两轴不重合」被改判成
   * 反向对照（一开就烧）；冰封期改成寒流季随机触发后两轴重合，季节闸重新自洽 ⇒ 改回来。
   * 两层断言：暖石一粒不许少（囤货不许凭空消失）+ burning 标记不许亮（面板不许骗人）。 */
  warmT.warmOn = true;
  const st1 = warmT.res.warmstone;
  SB.economy.tick(warmT, 1, noop);
  check('非寒流季：开关拨开也不烧暖石（囤货不许凭空消失）',
    warmT.res.warmstone === st1, st1 + ' → ' + warmT.res.warmstone);
  check('非寒流季：burning 标记是落的（面板不许显示在烧）',
    SB.economy.warmBurning(warmT) === false, '');

  /* 【用户规格的正面断言：「一份暖石」同时达到两个效果】
   *    「同时」不只是时间上凑巧，它还意味着**一个 tick 只扣一份**。若将来有人给冻伤
   *    也加一次消耗（「防冻伤要多烧一倍暖石」），这条会红——而那正好会把用户的规格
   *    破坏回两个消耗口，正是这一轮要消掉的东西。
   *    ⚠️ 必须站在寒流季问：季节闸（2026-09-27）下暖流季根本不烧，站在暖流季测会
   *    假绿——量没动不是因为「只扣一次」而是因为「一口没烧」。 */
  const bothT = SB.state.freshRun(false);
  bothT.warmOn = true; bothT.res.warmstone = 100;
  const bothColdI = SB.SEASONS.findIndex(x => x.mult < 1);
  bothT.t = bothColdI * SB.CFG.SEASON_TICKS;
  const bs0 = bothT.res.warmstone;
  SB.economy.tick(bothT, 1, noop);
  check('一份暖石只扣一次：同一 tick 里减产与冻伤共用同一个消耗口',
    Math.abs((bs0 - bothT.res.warmstone) - SB.CFG.WARM_RATE) < 1e-9,
    '扣掉 ' + (bs0 - bothT.res.warmstone).toFixed(4) + '，期望 ' + SB.CFG.WARM_RATE);

  /* ⑤ 冰封期（2026-09-27 用户拍板：改成「每个寒流季随机触发、壳越薄概率越高、线性、封顶 33%」）
   * 旧形态是「壳 ≤ 25% 就恒定挨冻、且永不解除」——它让冰封期变成后期一个**永久状态**，
   * 而不是一件会发生的事。下面五条是新形态的正面证据，缺一条就可能被悄悄改回旧形态：
   *   ① 概率随壳厚线性、壳见底封顶 33%（满壳开局 = 0，不会莫名其妙挨冻）
   *   ② 挨冻与否**不再由壳厚单独决定**：壳见底但不在寒流季 ⇒ 不冻
   *   ③ 寒流季掷骰：中了整季冰封、没中就不冻
   *   ④ 季末自动解除
   * ⚠️ 掷骰必须 stub，否则这条断言自己也在掷骰子。随机源走 `SB.rng`（rollFreeze 内部读它），
   *   不是覆盖 SB.economy.rollFreeze —— 后者改不了 seasonTurn 里那次闭包内的调用。 */
  {
    const MAX = SB.CFG.FREEZE_MAX;
    const T = SB.CFG.SEASON_TICKS;
    const WARM_I = SB.SEASONS.findIndex(x => x.mult >= 1);
    const COLD_I = SB.SEASONS.findIndex(x => x.mult < 1);
    const chanceAt = (ratio) => {
      const x = SB.state.freshRun(false);
      x.shell = x.iceShell * ratio;
      return SB.economy.freezeChance(x);
    };
    check('冰封概率线性且封顶 33%：满壳 0 / 半壳 16.5% / 见底 33%',
      Math.abs(chanceAt(1)) < 1e-12 &&
      Math.abs(chanceAt(0.5) - MAX * 0.5) < 1e-12 &&
      Math.abs(chanceAt(0) - MAX) < 1e-12,
      '满壳 ' + chanceAt(1).toFixed(4) + ' / 半壳 ' + chanceAt(0.5).toFixed(4) +
      ' / 见底 ' + chanceAt(0).toFixed(4));
    check('封顶值就是用户拍的那个 33%', Math.abs(MAX - 0.33) < 1e-12, String(MAX));

    const thin = SB.state.freshRun(false);
    thin.shell = 1;                                  // 壳几乎见底
    thin.t = T * WARM_I;                             // 但还在暖流季
    SB.economy.seasonTurn(thin);
    check('壳见底但非寒流季 ⇒ 不挨冻（冰封期不再由壳厚单独决定）',
      SB.economy.isCold(thin) === false, '壳比 ' + SB.economy.rOf(thin).toFixed(6));

    /* 半壳 ⇒ p = 16.5% > 0，这时 rng 才有意义（满壳 p=0，掷什么都是不中）。 */
    const mk = (seasonI) => {
      const x = SB.state.freshRun(false);
      x.shell = x.iceShell * 0.5;
      x.t = T * seasonI;
      return x;
    };
    const hadRng = 'rng' in SB;
    SB.rng = () => 0;                                // 必中
    const hit = mk(COLD_I); SB.economy.seasonTurn(hit);
    SB.rng = () => 1;                                // 必不中
    const miss = mk(COLD_I); SB.economy.seasonTurn(miss);
    if (!hadRng) delete SB.rng;
    check('寒流季掷骰：中了整季冰封，没中就不冻',
      SB.economy.isCold(hit) === true && SB.economy.isCold(miss) === false,
      '中 ' + SB.economy.isCold(hit) + ' / 不中 ' + SB.economy.isCold(miss));

    SB.rng = () => 0;
    const carried = mk(COLD_I);
    SB.economy.seasonTurn(carried);
    const wasCold = SB.economy.isCold(carried);
    carried.t = T * WARM_I;                          // 换季到暖流季
    SB.economy.seasonTurn(carried);
    if (!hadRng) delete SB.rng;
    check('季末自动解除：换到非寒流季就不再冰封（旧形态是永不解除）',
      wasCold === true && SB.economy.isCold(carried) === false, '换季前 ' + wasCold);

    check('季节表三季且已无浊流季', SB.SEASONS.length === 3 &&
      !SB.SEASONS.some(x => x.name === '浊流季'), SB.SEASONS.map(x => x.name).join(' / '));
  }

  /* ④ UI 接线：按钮真的渲染出来，点了真的改状态。 */
  /* ⚠️ 这里必须用 SB.game.run() 而不是另开一份 freshRun：render 画的是**线上那一份**，
   *    拿另一份去渲染，等于测了「A 状态渲染出来的 B 状态」，永远测不到接线。 */
  const ui = SB.game.run();
  ui.techs.thermal = true; ui.res.warmstone = 5;
  SB.game.markDirty(); SB.game.render();
  /* ⚠️ 开关 2026-09-27 从巢穴页搬到了「自然环境」卡的 #envWarm（用户要求）：
   *    它只在寒流季生效，而寒流季是海底火山那条周期的一部分 —— 摆在建造成那一堆里，
   *    玩家是在「我要造什么」的语境下去找它，恰好是永远用不上它的语境。
   *    两条断言都得跟着走：一条钉它在哪、一条钉它不在别处（防止又出现两份）。 */
  check('保温法已掌握：开关出现在「自然环境」卡的 #envWarm',
    g('envWarm').indexOf('data-warm="1"') !== -1, '');
  check('开关已从巢穴页搬走（不在出现两份）',
    g('pane-village-body').indexOf('data-warm="1"') === -1, '');
  /* ⚠️ 搬容器带来一个真实风险，必须钉住：#envWarm 是每帧刷新的容器，
   *    input.js 是 document 级委托 ⇒ 按钮元素若被逐帧换掉，「按下与抬起之间元素被换掉」
   *    的那次点击会整个丢失（开关点了没反应，而且不报任何错）。
   *    renderWarm 用「状态签名」节流规避：签名 = 开/关 × 寒流季/非 × 正在烧/否，
   *    签名不变就一个 DOM 节点都不写。**库存数字故意不进签名**（烧起来时每秒变 10 次），
   *    改走独立 span 的 textContent。
   *    ⇒ 这条断言盯的就是「库存变了但 HTML 逐字节没变」——把库存并回签名会让它红，
   *      而那正好会把点击丢失这个 bug 放回来。 */
  const warmBox = doc.getElementById('envWarm');
  const html0 = warmBox._html;
  ui.res.warmstone = 4;                        // 还够烧（≥ WARM_RATE），签名里的「正在烧」不变
  /* ⚠️ 这里必须先 markDirty：SB.game.render() 是**脏标记门控**的
   *    （game.js:126 `if (dirty)`）。上一次 render 已经把 dirty 清了，直接调
   *    `render()` 会整帧压根不跑 —— 量没刷上去是测试的锅，不是节流的锅。
   *    真实游戏里开关每帧都被 renderTick 无脑刷新，不受 dirty 影响。 */
  SB.game.markDirty(); SB.game.render();
  check('库存数字在动时按钮不被重建（签名节流，防点击丢失）',
    warmBox._html === html0, warmBox._html === html0 ? '' : 'HTML 被重写了');
  check('但库存数字确实刷上了（节流没把读数冻住）',
    (doc.getElementById('envWarmWs').textContent === 4 ||
     doc.getElementById('envWarmWs').textContent === '4'),
    'envWarmWs=' + doc.getElementById('envWarmWs').textContent +
    ' ui.warmstone=' + ui.res.warmstone);
  /* 「一份暖石办两件事」是用户 2026-09-26 的规格落点，也是这一版最容易在文案重构里
   * 被顺手改掉的一句话——它没有数据流，删了不会红任何断言，只会悄悄退回「只顶减产」。 */
  /* 2026-09-27 用户拍板改回季节闸后，文案落点换成「只在寒流季生效」——
   * 「一份暖石两件事」仍在（同一季内顶减产 + 压冻伤），但宣传语必须说清季节能闸，
   * 否则玩家在暖流季看到开关烧不起来会以为坏了。 */
  check('面板讲清「只在寒流季生效」（季节闸必须让玩家看得见）',
    g('envWarm').indexOf('只在寒流季生效') !== -1, '');
  check('面板保留「一份暖石两件事」（同季内顶减产 + 压冻伤的规格落点）',
    g('envWarm').indexOf('一份暖石两件事') !== -1, '');
  check('不再宣传不分季节的旧口径「一份暖石办两件事」',
    g('envWarm').indexOf('一份暖石办两件事') === -1, '');
  const on = ui.warmOn;
  fire({ dataset: { warm: '1' } });
  check('点开关：状态真的翻转', ui.warmOn !== on, 'warmOn=' + ui.warmOn);

  /* ④ 树真的是「文明 6 那种」几何，不是列表换皮。
   * ⚠️ 用户 2026-09-26 连续两次纠正同一件事：先做成了带「第 N 层」标题的竖排分桶列表
   *    （列表里层一和层二读起来是上下并列，看不出先后），驳回；再做成横卷。
   *    两次的共同根因都是**形状只活在注释里、代码里没有可观测的形状**。所以这里不测
   *    文案（文案改一个字这条就红，但形状没变），去测 HTML 里的几何三元组
   *    `data-layer / data-x / data-y` —— 列 = 层 = 推进方向，行 = 排版的产物。 */
  /* ⚠️ 揭示记在 s.eureka 上，不是 s.techs —— 写错落点不会报错，只会让这一行看起来
   *    什么都没发生（那一项依旧不渲染，断言接着红在奇怪的地方）。 */
  /* 多揭示一个「有前置方」的节点：结绳→学者的那条边只有两端都揭示才画，
   * 只揭示结绳的话边数是 0，「连线一条不少」这条断言就退化成恒真、测不到东西。 */
  ui.eureka = ui.eureka || {}; ui.eureka.calendar = true; ui.eureka.scholarT = true;
  SB.game.setTab('tech'); SB.game.markDirty(); SB.game.render();
  const pt = g('pane-tech');
  const pos = id => pt.indexOf('data-node="' + id + '"');
  /* 从最终 HTML 里抓节点几何。同一个 id 在本该只画一次的长卷里出现了两次，
   * 八成是有人在每张纪元卡片里又嵌了一份树 —— 下面那条断言会揪出来。 */
  const nodes = [];
  const nRe = /data-node="([a-zA-Z]+)"\s+data-x="(\d+)"\s+data-y="(\d+)"\s+data-layer="(\d+)"/g;
  let nm;
  while ((nm = nRe.exec(pt))) {
    nodes.push({ id: nm[1], x: +nm[2], y: +nm[3], layer: +nm[4] });
  }

  check('长卷只画一份：每个节点在 HTML 里恰好出现一次',
    nodes.length > 0 && new Set(nodes.map(n => n.id)).size === nodes.length,
    nodes.length + ' 个节点，去重后 ' + new Set(nodes.map(n => n.id)).size + ' 个');

  const cnv = pt.match(/class="techcanvas"\s+style="width:(\d+)px;height:(\d+)px"/);
  check('画布比视口宽（横向滚动看后面的纪元）',
    !!cnv && +cnv[1] > 640,
    cnv ? cnv[1] + '×' + cnv[2] + ' px' : '（没找到 techcanvas）');

  /* 滚动容器必须带 id：renderPanes 整块重写 pane 的 innerHTML 会把容器元素换掉，
   * 而横向位置只存在 DOM 元素上 ⇒ 它在重写前后靠这个 id 把 scrollLeft 接回去。
   * ⚠️ 这条是**契约断言**（id 名是两个文件的接头处）。它测不出「接回去」这个行为本身
   *    —— 假 DOM 的 getElementById 永远返回同一个桩对象，scrollLeft 当然不会变，
   *    写成行为断言就成了恒真。真正的验证在真实浏览器里做（换个 id 不会报错，
   *    只会让「滑到一半被拽回最左边」静默复发，所以至少要钉住这个接头）。 */
  check('长卷滚动容器带 id（renderPanes 靠它接回横向位置）',
    /<div class="techscroll[^\"]*"[^>]*id="techScroll"/.test(pt),
    'techscroll 在 pane-tech 的第 ' + pt.indexOf('techscroll') + ' 字符处');

  const G = SB.tech.geo;
  const byId2 = id => nodes.find(n => n.id === id);

  /* ⚠️ 节点卡片高必须装得下「名字 / 效果（最多两行）/ 尤里卡条件 / 进度条 / 研究按钮」。
   *    76px 那版装不下：`.technode` 是 flex 列 + overflow:hidden，内容超高时默认的
   *    flex-shrink:1 不会「溢出可见」，而是把效果行与条件行**压扁** —— 字被拦腰截断，
   *    就是用户 2026-09-26 报的「这里显示不全」。
   *    102 这个下限是真实浏览器量出来的（headless Chrome 逐张 height:auto 读 offsetHeight，
   *    最挤的一张是「书写」：两行效果 + 进度条 = 102px）。把 H 调小，这条立刻红。 */
  const CARD_NEED = 102;
  check('节点卡片高装得下四行 + 进度条（不够会把效果行/条件行压扁 ⇒「显示不全」）',
    G.H >= CARD_NEED, 'H=' + G.H + '，真实浏览器实测最挤 ' + CARD_NEED + 'px');

  /* 契约断言：卡片子项的 flex-shrink 必须关掉。只把 H 改大不够 —— 哪天有人再把
   * shrink 打开，超高内容又会退化回「压扁」，而那时 H 看着完全正常。
   * 2026-10-07 CSS 拆分后规则分布在 css/*.css 模块里（main.css 只剩 @import 入口），
   * 扫描目标改为全部模块。 */
  const cssDir = path.join(ROOT, 'css');
  const cssAll = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'))
    .map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n');
  check('卡片子项禁止 flex 压缩（超高内容只会顶出框，不会被压成半截字）',
    /\.technode>\*\{[^}]*flex:none/.test(cssAll),
    'css/*.css 里 .technode>*{flex:none} 的第 ' + cssAll.indexOf('.technode>*') + ' 字符处');

  /* ⚠️ 长卷最左边**不许有死区**。x = PADX + col×列距，而 col 由 1 起点的 layer 换算而来：
   *    少减那个 1，首列就落在 col 1 ⇒ x = 46 + 250 = 296。手机内容宽约 334px，
   *    于是整个首屏都落在死区里，一进「科技」只看得见纪元标题那条线、看不到任何节点
   *    —— 用户 2026-09-26 报的「科技树太靠右了，一开始根本看不到」就是它。
   *    这里比的是**几何真值**（layout 的全部格子），不是「渲染出来的节点」：
   *    后者取决于谁已揭示，结绳恰好是第 0 列时这条断言会退化。 */
  const allX = Object.keys(SB.tech.layout().cells).map(k => SB.tech.layout().cells[k].x);
  check('首列贴在左边界上（长卷左边没有死区，手机上开面板就能看见第一个节点）',
    Math.min.apply(null, allX) === G.PADX,
    '最左列 x=' + Math.min.apply(null, allX) + '，PADX=' + G.PADX);

  /* 列 = 层。结绳层一在最左、历法层二在它右边 —— 这正是「不是并排」的判据：
   * 并列的话两项 x 相同（同一行），树里它们的 x 必须差整整一个列距。 */
  const wr = byId2('writing'), ca = byId2('calendar');
  check('列 = 层：结绳在最左列、历法往右一列（不是上下并列）',
    !!wr && !!ca && wr.layer === 1 && ca.layer === 2 &&
    wr.x < ca.x && ca.x - wr.x >= G.W,
    'writing L' + (wr && wr.layer) + '@x' + (wr && wr.x) +
    '　calendar L' + (ca && ca.layer) + '@x' + (ca && ca.x) + '　列距=' + G.W);

  /* 同列不许撞行。撞了会两块卡片叠在一起，树看着像坏了，而数据完全看不出来。 */
  const colRows = {};
  nodes.forEach(n => { (colRows[n.layer] = colRows[n.layer] || []).push(n.y); });
  let clash = 0;
  for (const k in colRows) if (new Set(colRows[k]).size !== colRows[k].length) clash++;
  check('同列不撞行（叠加的卡片在数据层完全看不出来）',
    clash === 0, clash + ' 列存在重叠行');

  /* ⚠️ 列倒流：这是横卷独有的、肉眼看不出来的坏法。
   *    边的方向是「前置在左、本项在右」，而左/右由**列号**决定。若某项 layer 比它
   *    同纪元前置的 layer 还小或相等，那根连线就会从右往左画 —— 树看起来像被谁
   *    打了结，但数据、渲染、日志全都正常，唯一的表现是「有几根线很怪」。
   *    列号是**手写在 techs.js 里的**（不是算出来的），改一个节点的层很容易漏掉它的
   *    前置还没到那列，所以这条必须钉住。跨纪元不看：纪元基准是累加的，天然有序。 */
  const layerOf = id => {
    const c = SB.tech.layout().cells[id];
    return c ? c.layer : null;
  };
  const backflow = [];
  (SB.TECHS || []).forEach(t => {
    if (!t.reqs || !t.reqs.length) return;
    const mine = layerOf(t.id);
    if (mine == null) return;
    t.reqs.forEach(r => {
      const p = SB.TECHS.filter(x => x.id === r)[0];
      if (!p || p.era !== t.era) return;
      const pl = layerOf(r);
      if (pl != null && pl >= mine) {
        backflow.push(t.id + '(L' + mine + ') ← ' + r + '(L' + pl + ')');
      }
    });
  });
  check('列号随依赖递增（没有从右往左倒着画的连线）',
    backflow.length === 0,
    backflow.length ? backflow.join('、') : '（各前置都在左侧）');

  /* 连线是树的核心可读性：有节点无连线 = 玩家看不出谁要求谁。
   * ⚠️ 不能只测「path > 0」—— 把树画成五个孤立方块也能过，那就等于没测。
   *    两端都可见才画，所以期望条数要按「两端都可见的 reqs 对数」算一遍再比。
   *    可见性判据必须和 render.visOf 逐字一致，否则这里测的是另一套规则。 */
  const eraNow = ui.era || 1;
  /* 可见性判据必须与 render.visOf **逐字一致**（见上方注释）。2026-09-26 把 visOf 改成
   * `t.era <= era`（当前与过去纪元的节点全部上图，未达成尤里卡的画成「未揭露的科技」），
   * 这里同步成同一条规则，否则会按旧的「只画已揭示的」算出 want=1，而 render 画了 7 条线。 */
  const vis = id => {
    const t = SB.tech.byId ? SB.tech.byId(id) : null;
    if (!t) return false;
    return t.era <= eraNow;
  };
  let want = 0;
  (SB.tech.layout().edges || []).forEach(e => { if (vis(e.from) && vis(e.to)) want++; });
  const paths = (pt.match(/<path class="tel/g) || []).length;
  check('前置连线一条不少（SVG path 数 = 两端均可见的 reqs 对数）',
    want > 0 && paths === want,
    'SVG path=' + paths + '　期望=' + want +
    '（已揭示节点 ' + nodes.length + '）');

  /* ══ 两态渲染契约（用户 2026-09-26 截图：未达成尤里卡却已亮出名称/效果/按钮，不对）══
   * 用一个**受控的小状态**驱动渲染，不依赖上面那局乱糟糟的进度：
   *   纪元一、清空科技与台账、建 5 座藻场 ⇒ 结绳的尤里卡达成（免费项揭示即掌握），
   *   其余纪元一节点尚未达成尤里卡 ⇒ 走「未揭露」暗态。
   * 判据：
   *   · 亮态（结绳）：亮出真名 + 效果，**不**出现「未揭露的科技」、**不**出现尤里卡进度；
   *   · 暗态（任一未达成尤里卡的纪元一节点）：标题写「未揭露的科技」、保留尤里卡条件、
   *     节点本身可点开详情；未揭示时不在树面泄露效果，也不把研究按钮塞在节点里。
   * 用 data-lit 与 data-node 把每个节点切块，避免「整页 HTML 里有没有某词」这种会误判的断言。 */
  {
    const _era = ui.era, _techs = ui.techs, _met = ui.eurekaMet, _eur = ui.eureka,
          _kelp = ui.lvl.kelp, _peak = ui.peak, _pop = ui.pop, _panelOpen = ui.techPopup;
    ui.era = 1; ui.techs = {}; ui.eurekaMet = {}; ui.eureka = {};
    ui.lvl.kelp = 5; ui.peak = Math.max(ui.peak, 5); ui.pop = Math.max(ui.pop, 5);
    SB.tech.discover(ui); SB.tech.settleFree(ui);
    SB.game.setTab('tech'); SB.game.markDirty(); SB.game.render();
    const html = g('pane-tech');
    /* 按节点切块：每个节点 div 带 id="techrow-<id>"。 */
    const nb = {};
    const nre = /id="techrow-([a-zA-Z]+)"([\s\S]*?)(?=id="techrow-|$)/g;
    let nx; while ((nx = nre.exec(html))) nb[nx[1]] = nx[2];
    const litId = 'writing';                       // 上面强制达成尤里卡并掌握
    let darkId = null;
    for (const t of SB.TECHS) if (t.era === 1 && !SB.tech.metOf(ui, t)) { darkId = t.id; break; }

    check('亮态：达成过尤里卡的节点亮出真名（结绳）',
      !!nb[litId] && nb[litId].indexOf('>结绳<') >= 0,
      'writing 块含真名=' + (nb[litId] ? nb[litId].indexOf('>结绳<') >= 0 : '无此块'));
    check('亮态：不再显示「未揭露的科技」字样',
      !!nb[litId] && nb[litId].indexOf('未揭露的科技') === -1, '');
    check('亮态：不再显示尤里卡进度行',
      !!nb[litId] && nb[litId].indexOf('尤里卡') === -1, '');
    check('暗态：未达成尤里卡的节点写「未揭露的科技」',
      !!darkId && !!nb[darkId] && nb[darkId].indexOf('未揭露的科技') >= 0,
      darkId ? ('暗态节点=' + darkId) : '（没有未达成尤里卡的纪元一节点）');
    check('暗态：保留尤里卡条件文案',
      !!darkId && !!nb[darkId] && nb[darkId].indexOf('尤里卡') >= 0, '');
    check('暗态：节点打开详情，树面不再放研究按钮',
      !!darkId && !!nb[darkId] &&
      new RegExp('data-tree-node="1"[^>]*data-tree-type="tech"[^>]*data-tree-id="' + darkId + '"').test(nb[darkId]) &&
      nb[darkId].indexOf('data-tech=') === -1 &&
      nb[darkId].indexOf('未揭露的科技') >= 0, '');

    /* 不变式：每个上屏节点的 data-lit 必须 === metOf（亮没亮与能不能研究同源）。
     * 这条把 data-lit 从「没人读的装饰字段」变成有读者的契约：哪天有人把渲染的亮/暗
     * 判据从 metOf 换成别的（或漏改一处），这里立刻红，而不是等玩家发现「写着未揭露却能点」。 */
    let litMismatch = 0;
    for (const t of SB.TECHS) {
      if (t.era > (ui.era || 1)) continue;
      if (!nb[t.id]) continue;                       // 未上图的（未来纪元）不管
      const domLit = (nb[t.id].match(/data-lit="(\d)"/) || [])[1];
      const want = SB.tech.metOf(ui, t) ? '1' : '0';
      if (domLit !== want) litMismatch++;
    }
    check('不变式：每个上屏节点的 data-lit 与 metOf 逐项一致（渲染与门禁同源）',
      litMismatch === 0, litMismatch + ' 项不一致');

    /* 还原，避免影响后面纪元导航那节的渲染。 */
    ui.era = _era; ui.techs = _techs; ui.eurekaMet = _met; ui.eureka = _eur;
    ui.lvl.kelp = _kelp; ui.peak = _peak; ui.pop = _pop; ui.techPopup = _panelOpen;
    SB.game.setTab('tech'); SB.game.markDirty(); SB.game.render();
  }

  /* ⑤ 抗寒上限删干净了，但不能留下「加法读 undefined」。
   * ⚠️ tech.js 的乘区表里没了 `warm`，economy.warmCap 若还写着 `+ T.warm`，那一项就是
   *    undefined；`数字 + undefined = NaN` **不抛错也不报警**，只顺着 FREEZE_CHANCE
   *    烂掉整条结算链。排查时会误判成「设计上那道墙」。这里三连问：不该有、不是 NaN、
   *    建筑侧还在。 */
  const thermalDef = SB.TECHS.filter(t => t.id === 'thermal')[0];
  check('保温法不再给抗寒上限（规格外的东西，删掉就别加回来）',
    !thermalDef.eff || !('warm' in thermalDef.eff),
    'eff=' + JSON.stringify(thermalDef.eff || {}));
  const wc = SB.economy.warmCap(ui);
  check('warmCap 不是 NaN（删键之后最典型的静默断链）',
    typeof wc === 'number' && !isNaN(wc), 'warmCap=' + wc);
  /* 【2026-09-26：冻伤减免换轴，从「建筑等级 lvl.hearth」→「暖石在不在烧」】
   * ⚠️ 断言必须钉住**新**的供给口，不能只测「不是 NaN」——否则把 warmCap 改回读一个
   *    不存在的键，这条仍然全绿，机制已经静默失效（本作这类断链已有前科，见 MEMORY）。
   * ⚠️ 2026-09-27 季节闸：warmCap 跟着 warmBurningNow 走 ⇒ 只在寒流季非零。
   *    必须把 t 推进寒流季再问，站在暖流季这三条会**假绿**（恒 0 不是「关了」是「季不对」）。
   *    问完把 t 还原，别污染后面纪元导航那节的渲染。 */
  const wcColdI = SB.SEASONS.findIndex(x => x.mult < 1);
  const _wcT = ui.t;
  ui.t = wcColdI * SB.CFG.SEASON_TICKS;
  ui.warmOn = true; ui.res.warmstone = 50;
  check('冻伤减免改由暖石供给：开关拨开且石够（寒流季）⇒ warmCap 顶到上限',
    SB.economy.warmCap(ui) === SB.CFG.WARM_FREEZE_CAP, 'warmCap=' + SB.economy.warmCap(ui));
  ui.warmOn = false;
  check('开关拨回「关」⇒ warmCap 落回 0（冻伤照常，不给白嫖的减免）',
    SB.economy.warmCap(ui) === 0, 'warmCap=' + SB.economy.warmCap(ui));
  ui.warmOn = true; ui.res.warmstone = 0;
  check('开关开着但石不够 ⇒ warmCap 仍是 0（减免跟着消耗走，不是跟着开关走）',
    SB.economy.warmCap(ui) === 0, 'warmCap=' + SB.economy.warmCap(ui));
  ui.t = _wcT;
  ui.warmOn = true; ui.res.warmstone = 50;
  check('非寒流季：开关开着、石也够，warmCap 仍是 0（季节闸管住减免的另一半）',
    SB.economy.warmCap(ui) === 0, 'warmCap=' + SB.economy.warmCap(ui));

  /* ⑥ 保温法现在没有 eff，它的兑现物是暖石开关；科技树节点是精简入口，
   *    完整效果放在点击后详情卡内，断言跟随当前交互路径。 */
  ui.eureka.thermal = true;
  SB.game.markDirty(); SB.game.render();
  SB.ui.render.showTreeDetail('tech', 'thermal');
  const thermalDetail = g('modalBox');
  check('保温法详情卡说明暖石开关效果，而不是「无直接效果」',
    thermalDetail.indexOf('（无直接效果）') === -1 && thermalDetail.indexOf('暖石') !== -1,
    '「' + thermalDetail.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) + '」');
  SB.ui.render.hideModal();

  /* ⑦ 科技泵「没变东西就不置脏」—— 长卷横向位置与按钮点击的命门。
   * ⚠️ 泵过去无条件 markDirty()，而它按**逻辑秒**每 2 秒跑一趟（10× 速下 = 0.2 秒），
   *    于是「整块重建五个 pane（含 33 个节点的长卷）」成了每 0.2–2 秒一次的常态：
   *    长卷 scrollLeft 被冲掉（用户报的「被拉回最左边」），pane 里的按钮还会经历
   *    「按下与抬起之间被换掉」⇒ 那一次点击整个丢失。
   * 判据用 **DOM 哨兵**：脏标记会让 render() 整块重写 pane，哨兵就会消失。
   * ⚠️ 夹具必须是**确定无事可做的状态**，否则泵里真揭示一项、这条就误报：
   *    于是拿一份「全部科技已掌握 + 已在最后一个纪元」的克隆去跑 —— 没有可揭示的、
   *    也没有下一纪元可推进（advanceEra 在最后一纪元直接返回 0）。 */
  const settled = SB.game.snapshot(ui);
  settled.techs = {};
  SB.TECHS.forEach(t => { settled.techs[t.id] = true; });
  settled.era = (SB.ERAS || []).length;
  settled.eureka = Object.assign({}, settled.eureka);
  settled.techPopup = true;      // 否则开门弹窗会在回调里 markDirty，这条断言就测到别的东西上
  SB.game.pumpTech(settled, null);   // 幂等：先把可能的揭示跑完
  SB.game.render();
  doc.getElementById('pane-village').innerHTML = '<span id="SENT"></span>';
  const sentEra = settled.era;
  SB.game.pumpTech(settled, null);   // 这一趟应当什么都不改 ⇒ 不该置脏
  SB.game.render();
  check('科技泵没有新揭示 / 不推进时不置脏（否则每 0.2 秒重画一次长卷）',
    g('pane-village').indexOf('SENT') !== -1,
    '哨兵' + (g('pane-village').indexOf('SENT') !== -1 ? '还在' : '被重画冲掉') +
    '；era ' + sentEra + '（末纪元，无可推进）');

  /* ⑧ 纪元导航：文本搬进长卷标题 + 一排按钮跳转（用户 2026-09-26 的第三次返工）。
   * 原状是「当前纪元横幅 + 五张竖排纪元卡片 + 长卷」，五张卡各约 130px ——
   * 手机上要先滑过一整屏才够到树。用户的原话：
   *   「这部分文本内容能不能放在科技树标题这里，然后在这里设计几个按钮，
   *     点一下就自动跳转到该纪元的科技树」。
   * ⚠️ 这一节盯的是**条数与位置**，不是文案：五张卡展开的版本和正确版本长得
   *    一模一样（都是 .eracard），改一个字就红的那类断言在这里测不到东西。 */
  const eraSaved = ui.era;
  ui.era = 2;                        // 造一个「已有已过去的纪元」的视图，否则跳转无从谈起
  SB.game.setTab('tech'); SB.game.markDirty(); SB.game.render();

  /* 页签高亮与 pane 必须是**同一份状态**。原来高亮只写在 tab 的 onclick 里，于是
   * 任何走 setTab 的路径（最典型：开门弹窗里那句「去看看」）都只换 pane、不换高亮 ——
   * 页签写着「巢穴」、底下画着科技。
   * ⚠️ 这条只能靠「按选择器记忆化」的假 DOM 测（见 makeDoc 的注释）：每次发一批新桩
   *    的话，改 class 不会有后效，断言就成了恒真。 */
  const onTabs = doc.querySelectorAll('.tab').filter(t => t._classes.has('on')).map(t => t.dataset.tab);
  check('页签高亮跟着 setTab 走（不是只换 pane）',
    onTabs.length === 1 && onTabs[0] === SB.game.getTab(),
    '高亮的页签=' + (onTabs.join(',') || '（无）') + '，当前 pane=' + SB.game.getTab());

  const pt3 = g('pane-tech');
  const eraBtns = (pt3.match(/data-era="(\d+)"/g) || []).map(x => +x.match(/\d+/)[0]);

  check('五个纪元按钮都在，顺序照 ERAS 走',
    (SB.ERAS || []).length > 0 && eraBtns.join() === (SB.ERAS || []).map((e, i) => i + 1).join(),
    'data-era=' + eraBtns.join(','));

  let btnOk = true; const btnBad = [];
  (SB.ERAS || []).forEach((er, i) => {
    const blk = (pt3.match(new RegExp('<button[^>]*data-era="' + (i + 1) + '"[\\s\\S]*?</button>')) || [''])[0];
    if (blk.indexOf(er.name) === -1) { btnOk = false; btnBad.push((i + 1) + '缺「' + er.name + '」'); }
  });
  check('每个按钮带的是该纪元自己的名字（按钮 = 这张图的目录）',
    btnOk, btnOk ? (SB.ERAS || []).length + ' 个按钮逐个对上了名字' : btnBad.join('、'));

  /* ⚠️ 只能靠条数钉住：五张卡全展开是这次要消灭的东西，而它的 HTML 与正确版本
   *    完全同构（都是 .eracard），没有别的可观测差别。
   *    id=eraDetail 是给这条断言（以及日后的探针）留的抓手 —— 谁都能再写一个
   *    「详情卡」出来，但只有带这个 id 的那张才是这一张。 */
  const cardN = (pt3.match(/class="eracard/g) || []).length;
  const detailN = (pt3.match(/id="eraDetail"/g) || []).length;
  check('纪元详情只出选中那一个（五张全展开正是这次要消灭的）',
    cardN === 1 && detailN === 1, cardN + ' 张详情卡 / ' + detailN + ' 个 eraDetail 锚点');

  /* 未选中的纪元只留按钮：拿**纪元五**的描述来试 —— 不能用「下一个纪元」的描述，
   * 它本来就该出现在当前纪元的 teaser 里（那是对的信息，不是漏出来的）。 */
  const e5 = (SB.ERAS || [])[4];
  check('未选中的纪元的描述不出现在页面上（文本没有被复制成五份）',
    !e5 || pt3.indexOf(e5.desc) === -1,
    e5 ? (pt3.indexOf(e5.desc) === -1 ? '纪元五的描述只在点开它时才出现' : '纪元五的描述漏在页面上了') : '（没有纪元五）');

  /* 锚点是**几何真值**：纪元一必须 = 0（点它 = 回到开面板时的位置，与「长卷左边没有
   * 死区」是同一条边距），往后严格递增。写成「滚过去的数变大了」是恒真的，测不出跳对没有。 */
  const ancX = e => SB.tech.eraAnchorX(e);
  const nE = (SB.ERAS || []).length;
  let inc = ancX(1) === 0;
  for (let e = 2; e <= nE; e++) if (!(ancX(e) > ancX(e - 1))) inc = false;
  check('纪元锚点：纪元一 = 0、往后严格递增（跳转目标不是拍出来的）',
    inc, Array.from({ length: nE }, (_, i) => (i + 1) + '→' + ancX(i + 1)).join(' '));

  /* 行为断言：按钮真把长卷滚过去。假 DOM 里 getElementById 是按 id 记忆化的，
   * 所以那个桩元素的 scrollLeft 能跨重画留存 —— 正好用来验「写下去了没有」。
   * ⚠️ 先塞一个脏初值 777：否则「跳回纪元一」写出 0 与「根本没写」在读数上一样，
   *    而这两件事差一个 bug（`if (techScrollLeft)` 会把 0 当成「没什么可写的」跳过去，
   *    玩家点纪元一会发现树纹丝不动）。 */
  const tbox = doc.getElementById('techScroll');
  tbox.scrollLeft = 777;
  fire({ dataset: { era: '2' } });
  const jump2 = tbox.scrollLeft;
  fire({ dataset: { era: '1' } });
  const jump1 = tbox.scrollLeft;
  check('点纪元按钮真的把长卷滚过去（纪元一 = 写回 0，不是「不写」）',
    jump2 === ancX(2) && jump1 === 0,
    '纪元二 → ' + jump2 + '（锚点 ' + ancX(2) + '）　纪元一 → ' + jump1 + '（脏初值 777）');

  const pt4 = g('pane-tech');
  const e1 = (SB.ERAS || [])[0], e2 = (SB.ERAS || [])[1];
  check('选中项真的换了：按钮高亮 + 详情卡改念纪元一的描述，纪元二的描述退场',
    /class="erabtn on[^"]*" data-era="1"/.test(pt4) &&
    pt4.indexOf('<div class="edesc">' + e1.desc) !== -1 &&
    pt4.indexOf(e2.desc) === -1,
    '纪元一描述上屏？' + (pt4.indexOf(e1.desc) !== -1) +
    '　纪元二描述还在？' + (pt4.indexOf(e2.desc) !== -1));

  /* 浏览器点击按钮里的名字/徽标时，event.target 是 span 而不是 button；
   * 必须沿 closest('[data-era]') 找回纪元按钮，否则看起来像「纪元点不动」。 */
  const eraButtonTarget = { dataset: { era: '2' } };
  fire({ dataset: {}, closest: selector => selector === '[data-era]' ? eraButtonTarget : null });
  const nestedEraHtml = g('pane-tech');
  const era2Desc = e2.desc;
  check('点击纪元按钮内部文字也能切换（子元素事件向上找到 data-era）',
    /class="erabtn on[^"]*" data-era="2"/.test(nestedEraHtml) &&
    nestedEraHtml.indexOf('<div class="edesc">' + era2Desc) !== -1,
    '纪元二描述上屏？' + (nestedEraHtml.indexOf(era2Desc) !== -1));

  /* ── 长卷拖动 ────────────────────────────────────────────────────
   * 手机上手指滑是原生滚动（有惯性、能回弹，不该接管），**桌面鼠标按住左键拖是拖不动的**
   * ——浏览器里 overflow-x:auto 只认滚轮 / shift+滚轮 / 触屏。这条就是补桌面那一截。
   * ⚠️ 监听只能挂在 document 上做委托：挂在 .techscroll 上会随着每次重画一起失效，
   *    而「失效」是不报错的静默行为（拖了没反应，别的都正常），所以先断言监听在。 */
  const tbox2 = doc.getElementById('techScroll');
  tbox2.closest = sel => (sel === '.techscroll' ? tbox2 : null);
  const ptr = (type, x, kind) => {
    for (const fn of (doc._ev[type] || [])) {
      fn({ pointerType: kind || 'mouse', button: 0, clientX: x, target: tbox2, preventDefault() {} });
    }
  };
  const drag = (from, to, kind) => {
    ptr('pointerdown', from, kind);
    ptr('pointermove', to, kind);
    ptr('pointerup', to, kind);
  };

  check('长卷的指针拖拽挂在 document 上做委托（挂在容器上会随每次重画一起失效）',
    (doc._ev['pointerdown'] || []).length > 0 && (doc._ev['pointermove'] || []).length > 0,
    'pointerdown / pointermove 监听 ' + (doc._ev['pointerdown'] || []).length + ' / ' +
    (doc._ev['pointermove'] || []).length + ' 个');

  tbox2.scrollLeft = 600;
  drag(1000, 880);                                   // 往左拖 120px ⇒ 内容右移，scrollLeft +120
  check('鼠标按住往左拖 120px，长卷跟着走 +120',
    tbox2.scrollLeft === 720, 'scrollLeft=' + tbox2.scrollLeft);

  tbox2.scrollLeft = 600;
  drag(1000, 997);                                   // 只动 3px < 阈值
  check('位移不足阈值（3px）不算拖动 —— 否则「按在节点上想点它」会被判成拖',
    tbox2.scrollLeft === 600, 'scrollLeft=' + tbox2.scrollLeft);

  tbox2.scrollLeft = 600;
  drag(1000, 700, 'touch');
  check('触屏（pointerType=touch）不接管：原生滚动的惯性和回弹比手写的好',
    tbox2.scrollLeft === 600, 'scrollLeft=' + tbox2.scrollLeft);

  /* 拖完松手浏览器还会补一个 click，落在起点元素上 —— 必须被吞掉，
   * 否则「拖一把」等于「点了那个节点」（最典型的就是误触研究按钮）。 */
  const kelpA = SB.game.run().res.kelp;
  drag(1000, 880);
  fire({ dataset: { gather: 'kelp' } });
  check('拖完松手补发的那一次 click 被吞掉（拖动不被当成点节点）',
    SB.game.run().res.kelp === kelpA, 'kelp ' + kelpA + ' → ' + SB.game.run().res.kelp);

  const kelpB = SB.game.run().res.kelp;
  fire({ dataset: { gather: 'kelp' } });
  check('抑制标志没有残留：下一次真实点击照常生效',
    SB.game.run().res.kelp > kelpB, 'kelp ' + kelpB + ' → ' + SB.game.run().res.kelp);

  ui.era = eraSaved;
  SB.game.markDirty(); SB.game.render();
}


}
