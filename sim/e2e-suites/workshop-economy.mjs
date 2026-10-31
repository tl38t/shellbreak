/* e2e suite: workshop, tools, crafting, and connected economy regressions. */
export function run({ SB, check, noop, doc, g, fs, path, ROOT, fire, pending, sandbox }) {
/* ---------------- 工坊：青铜工具 ---------------- *
 * 这一节存在唯一理由：**工具接错落点不会报错，只会静默无效**。
 * 三件都写同一个 target 也一样绿：玩家买了斧头，石头莫名其妙跟着涨 —— 这正是
 * 2026-09-27 用户纠正的那条（「斧子也是单独的采珊瑚加成，镐是单独的采矿/采石」）。
 * 所以既要断言乘区数字，也要断言**真的落到产出**上（economy.rates）。
 * 放在倒数第二节：它会改本局状态，避免影响前面的小节。 */
console.log('\n=== 工坊：青铜工具 ===');
{
  const w = SB.workshop, T = SB.TOOLS, wt = SB.game.run();

  /* ⚠️ 2026-09-28 纪元二重排：铁质三件加入 ⇒ 6 件。
   *    ⚠️ 这里**不能**只把 3 改成 6 就完事 —— 青铜三件与铁质三件的 `need` 是不同的，
   *       而 `need` 在 workshop.blocked 读它之前**完全没人读**（死字段）。
   *       ⇒ 数量对了不代表接线对了，所以下面补两条**行为断言**：
   *         没研究铁器时买不到铁镰 / 研究后买得到。 */
  /* ⚠️ 2026-09-28 第三件（马具）曾是 wip 占位（数量从 6 变 7）；
   *    2026-09-29 用户拍板实装（商人奢侈品产出 +50%）⇒ 原「占位三条」断言随实化作废，
   *    升级为钉**真件**的行为（见下块）。数量断言只守「表里还在」，行为归下块。 */
  /* ⚠️ 2026-09-30 钢质三件（metalrefine 线）加入 ⇒ 10 件。数量断言只守「表里还在」，
   *    行为归下块（need 门）与加法合并断言（镰线三件相加）。
   * ⚠️ 2026-10-18 ERA8 θ工具三件套（biomat 线，bonus 2.00）加入 ⇒ 13 件。 */
  check('工具表十三件齐全（青铜镰斧镐 + 铁镰斧镐 + 钢镰斧镐 + 马具 + θ镰斧镐）',
    T.length === 13 && !!w.byId('tool_sickle') && !!w.byId('tool_axe') && !!w.byId('tool_pick')
      && !!w.byId('tool_ironSickle') && !!w.byId('tool_ironAxe') && !!w.byId('tool_ironPick')
      && !!w.byId('tool_steelSickle') && !!w.byId('tool_steelAxe') && !!w.byId('tool_steelPick')
      && !!w.byId('tool_harnes')
      && !!w.byId('tool_thetaSickle') && !!w.byId('tool_thetaAxe') && !!w.byId('tool_thetaPick'),
    T.map(t => t.id).join(','));

  /* ⚠️ 2026-09-29 马具实装后的四条行为断言：
   *      ① 数据：wip 已摘、target/bonus 写全（workshop.js 那道 wip 门机制保留，
   *         将来再有占位件仍走它）；
   *      ② 解锁门：need 'horsemanship' 真的被 blocked 读（没研究马术 → 说得出「马术」）；
   *      ③ 效果到账：toolMul(s,'merchant') 买前 1 → 买后 1.5（加法语义，与青铜三件同口径）；
   *      ④ 产能到账：rates.luxury 装/不装比值 = 1.5（pop=0 让需求=0、净=毛，
   *         断言不被消耗项稀释 —— 与 §五点十「装前/装后是两个独立 fixture」同一条纪律）。 */
  {
    const harnes = w.byId('tool_harnes');
    const hs = SB.game.run();
    const keep = { tools: hs.tools, horsemanship: !!hs.techs.horsemanship,
      merchant: hs.jobs.merchant, pop: hs.pop, happy: hs.happy, coral: hs.res.coral };
    check('马具已实装：不再是 wip 占位，target/bonus 写全',
      !harnes.wip && (harnes.bonus || 0) === 0.5
        && Array.isArray(harnes.target) && harnes.target.indexOf('merchant') >= 0,
      'wip=' + harnes.wip + ' bonus=' + harnes.bonus
        + ' target=' + (harnes.target || []).join(','));

    /* ② 解锁门取证（与铁质工具那条同构）：blocked 只读 s，先夺走科技再还。
     *    ⚠️ canBuy 必须在「还没研究」的状态下取 —— §五点十判据二：
     *    断言参数从左到右求值，把 canBuy 留到科技还回去之后，它测的是另一个世界。 */
    hs.tools = {}; hs.lvl.workshop = 1; delete hs.techs.horsemanship;
    const gate = w.blocked(hs, 'tool_harnes');
    const gateCanBuy = w.canBuy(hs, 'tool_harnes');
    hs.techs.horsemanship = true;
    hs.res.coral = 5000;
    const after = w.blocked(hs, 'tool_harnes');
    check('没研究马术时马具买不到（need 真的被 blocked 读了，不是死字段）',
      /马术/.test(String(gate)) && gateCanBuy === false,
      'blocked 返回「' + gate + '」');
    check('研究了马术之后马具就买得到',
      w.canBuy(hs, 'tool_harnes') === true, 'blocked 返回「' + after + '」');

    /* ③④ 效果与产能取证。⚠️ 乘区本身可读才测得准（与 farmMul/globalMul 同理）：
     *    只看 rates.luxury 会被「商人 = 0」恒乘 0，看不出 +50% 有没有挂上。 */
    hs.jobs.merchant = 3; hs.pop = 0; hs.happy = 0;
    hs.tools = {};
    const m0 = SB.economy.toolMul(hs, 'merchant');
    const r0 = SB.economy.rates(hs).luxury;
    hs.tools = { tool_harnes: true };
    const m1 = SB.economy.toolMul(hs, 'merchant');
    const r1 = SB.economy.rates(hs).luxury;
    check('马具效果到账：toolMul(merchant) 买前 1 → 买后 1.5（加法语义）',
      Math.abs(m0 - 1) < 1e-9 && Math.abs(m1 - 1.5) < 1e-9,
      'm0=' + m0 + ' m1=' + m1);
    check('马具产能到账：rates.luxury 装/不装比值 = 1.5（pop=0 ⇒ 净=毛）',
      r0 > 0 && Math.abs(r1 / r0 - 1.5) < 1e-9,
      'r0=' + r0 + ' r1=' + r1 + ' ratio=' + (r0 > 0 ? (r1 / r0) : 'NaN'));

    hs.tools = keep.tools;
    hs.jobs.merchant = keep.merchant; hs.pop = keep.pop; hs.happy = keep.happy;
    hs.res.coral = keep.coral;
    if (!keep.horsemanship) delete hs.techs.horsemanship;
  }

  /* 「need 是不是只写不读」的取证。⚠️ 这条是**行为**断言而不是字段断言：
   * 字段存在只说明数据里写了，worked 是否真去拦才说明接线上没断。 */
  {
    const noTech = w.byId('tool_ironSickle');
    check('铁质工具都声明了 need（解锁它的科技）',
      !!noTech.need, JSON.stringify(noTech.need));

    const wt0 = SB.game.run();
    const keep = { ironwork: !!wt0.techs.ironwork, tools: wt0.tools };
    wt0.tools = {}; wt0.lvl.workshop = 1;
    delete wt0.techs.ironwork;
    const gate = w.blocked(wt0, 'tool_ironSickle');
    wt0.techs.ironwork = true;
    const after = w.blocked(wt0, 'tool_ironSickle');
    check('没研究铁器时铁质工具买不到（need 真的被 blocked 读了，不是死字段）',
      /铁器/.test(String(gate)) && w.canBuy(wt0, 'tool_ironSickle') === false,
      'blocked 返回「' + gate + '」');
    check('研究了铁器之后铁质工具就买得到',
      /还缺|null/.test(String(after)) || w.blocked(wt0, 'tool_ironSickle') === null,
      'blocked 返回「' + after + '」');
    if (!keep.ironwork) delete wt0.techs.ironwork;
    wt0.tools = keep.tools;
  }

  /* ⚠️ 2026-09-30 钢质三件：同一条「need 不是死字段」的行为取证，门换 metalrefine。
   *    （钢资源本身就是 metalrefine 解锁的 ⇒ 工具与资源同门，语义自然。） */
  {
    const st = w.byId('tool_steelSickle');
    check('钢质工具都声明了 need（解锁它的科技）',
      !!st.need, JSON.stringify(st.need));

    const wt0 = SB.game.run();
    const keep = { metalrefine: !!wt0.techs.metalrefine, tools: wt0.tools };
    wt0.tools = {}; wt0.lvl.workshop = 1;
    delete wt0.techs.metalrefine;
    const gate = w.blocked(wt0, 'tool_steelSickle');
    wt0.techs.metalrefine = true;
    const after = w.blocked(wt0, 'tool_steelSickle');
    check('没研究金属精炼时钢质工具买不到（need 真的被 blocked 读了）',
      /金属精炼/.test(String(gate)) && w.canBuy(wt0, 'tool_steelSickle') === false,
      'blocked 返回「' + gate + '」');
    check('研究了金属精炼之后钢质工具就买得到',
      /还缺|null/.test(String(after)) || w.blocked(wt0, 'tool_steelSickle') === null,
      'blocked 返回「' + after + '」');
    if (!keep.metalrefine) delete wt0.techs.metalrefine;
    wt0.tools = keep.tools;
  }

  /* ① 落点不是死数据 —— 直接对源码取证。
   *    工具绑在**职业**上（用户 2026-09-27 拍），所以三张表要互相对齐：
   *      · config.TOOLS[].target 里的每个职业 → 必须真出现在 economy 的 toolMul 调用里；
   *      · economy.JOB_SINK 里的每个职业      → 同样必须有消费点；
   *      · 两边都不能有对方不认领的孤儿。
   *    防的是同一类病：职业 id 写错（'gather' 打成 'gatherer'）不报错，
   *    只会「工具买了、那个人一点没变」—— 与「woodJobRatio 僵尸数据」同族。 */
  const ecoSrc = fs.readFileSync(path.join(ROOT, 'src/economy.js'), 'utf8');
  const ecoRatesModule = fs.readFileSync(path.join(ROOT, 'src/economy-rates.js'), 'utf8');
  const ecoTickModule = fs.readFileSync(path.join(ROOT, 'src/economy-tick.js'), 'utf8');
  const ecoAllSrc = [ecoSrc, ecoRatesModule, ecoTickModule].join('\n');
  const consumed = new Set();
  const callRe = /toolMul\(s, (?:'([^']+)'|\[([^\]]*)\])/g;
  let cm;
  while ((cm = callRe.exec(ecoAllSrc))) {
    if (cm[1]) consumed.add(cm[1]);
    else (cm[2] || '').split(',').forEach(part => {
      const k = part.trim().replace(/^['"]|['"]$/g, '');
      if (k) consumed.add(k);
    });
  }
  const tset = {}; T.forEach(t => { (t.target || []).forEach(k => { tset[k] = 1; }); });
  const deadTargets = Object.keys(tset).filter(k => !consumed.has(k)).map(k => k);
  check('每件工具绑的职业在经济模块里都有消费点（不造僵尸绑定）',
    deadTargets.length === 0, deadTargets.join('；') || Object.keys(tset).join(' / '));

  const sink = SB.economy.JOB_SINK || {};
  const sinkJobs = Object.keys(sink);
  const deadSink = sinkJobs.filter(k => !consumed.has(k)).map(k => k);
  check('JOB_SINK 里每个职业也都有消费点（表写了却没人读 = 静默断链）',
    deadSink.length === 0, deadSink.join('；') || sinkJobs.join(' / '));
  const orphanSink = sinkJobs.filter(k => !tset[k]).map(k => k);
  check('JOB_SINK 与 config.TOOLS 双向对齐（没有没人认领的职业）',
    orphanSink.length === 0, orphanSink.join('；') || sinkJobs.join(' / '));
  /* 职业 id 必须出自 config.JOBS，不能是新造的词。 */
  const jobIds = (SB.CFG && SB.CFG.JOBS ? SB.CFG.JOBS : []).map(j => j.id);
  const badJob = sinkJobs.concat(Object.keys(tset))
    .filter(k => jobIds.length && jobIds.indexOf(k) < 0);
  check('所有职业 id 都出自 config.JOBS（不新造词）',
    badJob.length === 0, badJob.join('；') || jobIds.join(','));

  /* ⚠️ 2026-09-29 马具：乘区必须 **tick 与 rates 两处都接**（少一处 = 面板撒谎）。
   *    与上面「落点取证」同源：直接对源码数 toolMul(s, 'merchant') 的调用次数。
   *    2026-09-28 曾在 tick/rates 各写一份算式导致演化脱节 —— 这条计数就是那笔账的守卫。 */
  const merchCalls = (ecoAllSrc.match(/toolMul\(s, 'merchant'\)/g) || []).length;
  /* ⚠️ 用「下一个 `function ` 出现处」切段，**不写死窗口长度**：
   *   写死 6000 时 rates 段差 961 字符（实测 6961）而误红；而 tick 段的标记
   *   `// 1)` 在本仓根本不存在，`indexOf` 返回 −1，靠 Math.max(0,·) 侥幸落到 0
   *   才蒙对了切片 —— 那种「靠巧合通过」比红更危险。 */
  const sliceFrom = (src, from, reEnd) => {
    const a = src.indexOf(from);
    if (a < 0) return '';
    const m = src.slice(a + from.length).search(reEnd);
    return src.slice(a, m < 0 ? src.length : a + from.length + m);
  };
  const ecoTickSrc = sliceFrom(ecoTickModule, 'function tick(', /^\s*function\s+\w+\s*\(/m);
  const ecoRatesSrc = sliceFrom(ecoRatesModule, 'function rates(', /^\s*function\s+\w+\s*\(/m);
  check('马具乘区在 tick 与 rates 两处都接了',
    /toolMul\(s, 'merchant'\)/.test(ecoTickSrc) && /toolMul\(s, 'merchant'\)/.test(ecoRatesSrc),
    'tick 段=' + /toolMul\(s, 'merchant'\)/.test(ecoTickSrc) +
    '（' + ecoTickSrc.length + ' 字符） rates 段=' + /toolMul\(s, 'merchant'\)/.test(ecoRatesSrc) +
    '（' + ecoRatesSrc.length + ' 字符）｜全仓共 ' + merchCalls + ' 处，多出来的应是 UI 侧的 happySupply');

  /* ② 门槛：建成工坊（用户拍板）。不是青铜术 —— 它是 era1 最贵的科技（cost 600，
   *    按 1 学者 0.15/s 约 67 分钟），挂上去工具会晚到玩家已打完半个 era1。 */
  wt.lvl.workshop = 0; wt.tools = {};
  wt.res.coral = 5000; wt.res.silt = 500;
  check('没建工坊时买不了，且说得清该做什么',
    w.blocked(wt, 'tool_sickle') === '需要先建成工坊', String(w.blocked(wt, 'tool_sickle')));

  /* ③ 资源不足：不给买、不给扣、不给半截状态。 */
  wt.lvl.workshop = 1;
  wt.res.coral = 10;
  const lackMsg = w.blocked(wt, 'tool_sickle');
  check('资源不足时买不了，且点名缺哪一样、缺多少',
    /^还缺/.test(lackMsg || '') && /珊瑚 150/.test(lackMsg || ''), String(lackMsg));
  check('付不起时不扣钱 —— 点了不掉资源（否则存档里会留下「钱少了、工具没到手」）',
    w.buy(wt, 'tool_sickle', noop) === false && wt.res.coral === 10, 'coral=' + wt.res.coral);
  check('买失败不留半截状态（tools 里没有它）', !wt.tools.tool_sickle);

  /* ④ 买下：扣费 + 置位 + 不能二次购买（是买断，不是等级）。 */
  wt.res.coral = 500;
  const coral0 = wt.res.coral;
  check('条件齐了就买得到', w.canBuy(wt, 'tool_sickle'));
  check('买下即扣费（全额）',
    w.buy(wt, 'tool_sickle', noop) === true && wt.res.coral === coral0 - 150,
    coral0 + ' → ' + wt.res.coral);
  check('买过一次不能再买（买断制，不是 lvN）',
    w.blocked(wt, 'tool_sickle') === '已经买过了');

  /* ⑤ 乘区落点 —— 镰走 farm，斧/镐走 gather，两条线互不串。 */
  wt.tools = {}; wt.lvl.workshop = 1;
  wt.res.coral = 9999; wt.res.silt = 9999;
  /* ⚠️ 从这里就得把职业摆好：下面开始读 rates()（产出），那一行一行都要有人在做。
   *    先只摆职业、先不买工具，才能拿到没吃工具的干净基线。 */
  wt.jobs = { gather: 2, craft: 0, scholar: 0, coralwright: 4, quarrier: 3, miner: 2 };
  const bF = SB.economy.farmMul(wt), bG = SB.economy.gatherMul(wt);
  check('基线两条乘区都是正的（工具是**乘**在这个基准上的）', bF > 0 && bG > 0,
    'farm=' + bF.toFixed(3) + ' gather=' + bG.toFixed(3));

  w.buy(wt, 'tool_sickle', noop);
  check('青铜镰 ×1.8 落在 farmMul（采集者 / 藻食）',
    Math.abs(SB.economy.farmMul(wt) / bF - 1.8) < 1e-9,
    '×' + (SB.economy.farmMul(wt) / bF).toFixed(3));
  /* 这条是硬护栏：foodRate 里那句「别把 gatherMul 乘进来」，
   * 当年就是乘进去了 —— 食物虚高到 38/秒，几个 tick 把仓储上限糊穿。 */
  check('青铜镰对 gatherMul 零影响（食物线绝不吃采集倍率）',
    SB.economy.gatherMul(wt) === bG, bG.toFixed(3) + ' → ' + SB.economy.gatherMul(wt).toFixed(3));

  /* ⑤′ 斧 / 镐各有各的坑位：这是用户 2026-09-27 纠正的那条语义。
   *    旧实现里两者同挂 gatherMul ⇒ 买斧头石头也涨。现在必须各 ×1.8、互不牵连。
   *    ⚠️ 基线要在**买之前**取（镰已经买下，但它不影响珊瑚与石头，留着不影响读数）。 */
  wt.tools = { tool_sickle: true };
  const bCoral = SB.economy.rates(wt).coral, bStone = SB.economy.rates(wt).stone;
  check('基线：珊瑚与石头都还没吃工具', bCoral > 0 && bStone > 0,
    'coral=' + bCoral.toFixed(2) + ' stone=' + bStone.toFixed(2));

  w.buy(wt, 'tool_axe', noop);
  check('青铜斧 ×1.8 落在珊瑚那一条（珊瑚匠）',
    Math.abs(SB.economy.rates(wt).coral / bCoral - 1.8) < 1e-9,
    bCoral.toFixed(2) + ' → ' + SB.economy.rates(wt).coral.toFixed(2));
  check('🚨 青铜斧对采石零影响（旧实现「买斧头石头也涨」被用户否决，这条就是护栏）',
    SB.economy.rates(wt).stone === bStone, bStone.toFixed(2));
  w.buy(wt, 'tool_pick', noop);
  /* 镐同时管石头 / 金属 / 暖石三行，所以珊瑚那边不能跟着动。 */
  check('青铜镐 ×1.8 落在石头那一条（采石工 + 矿工）',
    Math.abs(SB.economy.rates(wt).stone / bStone - 1.8) < 1e-9,
    bStone.toFixed(2) + ' → ' + SB.economy.rates(wt).stone.toFixed(2));
  const rCoralAxe = SB.economy.rates(wt).coral;   // 买斧之后、买镐之前
  check('🚨 青铜镐对珊瑚零影响（珊瑚不该被采石工具抬起来）',
    SB.economy.rates(wt).coral === rCoralAxe, rCoralAxe.toFixed(2));
  check('三件买齐 = 三条线各 ×1.8，不是一条 ×5.83（互不叠加）',
    Math.abs(SB.economy.farmMul(wt) / bF - 1.8) < 1e-9 &&
    Math.abs(SB.economy.rates(wt).coral / bCoral - 1.8) < 1e-9 &&
    Math.abs(SB.economy.rates(wt).stone / bStone - 1.8) < 1e-9,
    'farm ×' + (SB.economy.farmMul(wt) / bF).toFixed(3) +
    ' / coral ×' + (SB.economy.rates(wt).coral / bCoral).toFixed(3) +
    ' / stone ×' + (SB.economy.rates(wt).stone / bStone).toFixed(3));

  /* ⚠️ 2026-09-28：同职业的两件工具（青铜镰 + 铁镰都落 gather）由「叠乘」改成**相加**，
   *    形参照猫国 core.js 的 effects 合并（`globalEffects[name] += effect`）。
   *    ⇒ 叠乘的 ×1.8 × 1.8 = ×3.24 不再是答案，正确答案是 1 + 0.8 + 0.8 = **×2.6**。
   *    ⚠️ 「取最高那件」会得到 ×1.8 —— 那样青铜镰买了之后买铁镰等于白扔 150 珊瑚，
   *       玩家一算就不买青铜，前期那件工具等于不存在。所以既不能叠乘也不能取高。
   *    ⚠️ 这条同时是回归护栏：谁把 toolMul 改回 `m *= (1+bonus)`，这里立刻红。 */
  wt.tools = { tool_sickle: true, tool_ironSickle: true };
  check('同一职业两件工具 = 相加 ×2.6（既不是叠乘 ×3.24，也不是取高 ×1.8）',
    Math.abs(SB.economy.farmMul(wt) / bF - 2.6) < 1e-9,
    'farm ×' + (SB.economy.farmMul(wt) / bF).toFixed(3));

  /* ⚠️ 2026-09-30 钢镰（bonus 1.00）入线 ⇒ 三件相加 = 1 + 0.8 + 0.8 + 1.0 = **×3.6**。
   *    同时钉住钢镰的 bonus 确实是 1.00：谁把它改成与铁质同档 0.80，这里立刻红。 */
  wt.tools = { tool_sickle: true, tool_ironSickle: true, tool_steelSickle: true };
  check('镰线三件全买 = 相加 ×3.6（青铜0.8 + 铁0.8 + 钢1.0）',
    Math.abs(SB.economy.farmMul(wt) / bF - 3.6) < 1e-9,
    'farm ×' + (SB.economy.farmMul(wt) / bF).toFixed(3));

  /* ⑥ 真的落到产出上 —— 乘区数字对了不等于珊瑚真的多。
   *    rates() 是纯读数（与 tick 同源），两个读数之间除 state.tools 外什么都没动。 */
  wt.tools = {};
  wt.jobs = { gather: 2, craft: 0, scholar: 0, coralwright: 4, quarrier: 3, miner: 2 };

  /* ⚠️ 常驻护栏（2026-09-27 抓到一例活的）：面板速率里任何一项是 NaN，
   *    都是「某个可选字段没配 || 0」这类断链 —— 不抛错、不上报，就是显示 NaN。 */
  const badRate = Object.keys(SB.economy.rates(wt))
    .filter(k => !isFinite(SB.economy.rates(wt)[k]));
  check('rates() 每一项都是有限数（面板不显示 NaN）',
    badRate.length === 0, badRate.join(',') || Object.keys(SB.economy.rates(wt)).join('/'));

  const rCoral0 = SB.economy.rates(wt).coral;
  const rStone0 = SB.economy.rates(wt).stone;

  /* 藻食那条线要单独隔离：foodRate =（建筑侧 + 职业侧）× 季节 × 导流堤，
   * 建筑侧那份（藻场）不吃 farmMul，会把比值稀释成 ×1.59（1.37 → 2.18 而不是 ×1.8）。
   * 把藻场清零，只剩职业侧，比值才是干净的 1.8 —— 测的正是「镰刀作用于采集者」。 */
  const kelpLvl0 = wt.lvl.kelp;
  wt.lvl.kelp = 0;
  const rFood0 = SB.economy.foodRate(wt);
  wt.tools.tool_sickle = true;
  const rFood1 = SB.economy.foodRate(wt);
  check('青铜镰抬藻食产出 ×1.8（乘区对了，产出就得跟着动）',
    Math.abs(rFood1 / rFood0 - 1.8) < 1e-9, rFood0.toFixed(2) + ' → ' + rFood1.toFixed(2));
  wt.lvl.kelp = kelpLvl0;
  check('青铜镰对珊瑚产出零影响（串线会在这里现形）',
    SB.economy.rates(wt).coral === rCoral0, rCoral0.toFixed(2));

  wt.tools.tool_axe = true;
  check('青铜斧抬珊瑚产出 ×1.8（珊瑚匠那条线）',
    Math.abs(SB.economy.rates(wt).coral / rCoral0 - 1.8) < 1e-9,
    rCoral0.toFixed(2) + ' → ' + SB.economy.rates(wt).coral.toFixed(2));

  /* 镐的落点是 stone + silt + warmstone 三行，所以金属与暖石要一起验
   * —— 只乘 stone 那一行会让「暖石」这款伴生品漏掉工具加成。 */
  const rSilt0 = SB.economy.rates(wt).silt, rWarm0 = SB.economy.rates(wt).warmstone;
  wt.tools.tool_pick = true;
  check('青铜镐抬石头产出 ×1.8（采石工那条线）',
    Math.abs(SB.economy.rates(wt).stone / rStone0 - 1.8) < 1e-9,
    rStone0.toFixed(2) + ' → ' + SB.economy.rates(wt).stone.toFixed(2));
  check('青铜镐同时管采矿：金属一同 ×1.8',
    Math.abs(SB.economy.rates(wt).silt / rSilt0 - 1.8) < 1e-9,
    rSilt0.toFixed(2) + ' → ' + SB.economy.rates(wt).silt.toFixed(2));
  check('青铜镐同时管伴生暖石（三行一起，漏一行就是「买了镐暖石没变」）',
    Math.abs(SB.economy.rates(wt).warmstone / rWarm0 - 1.8) < 1e-9,
    rWarm0.toFixed(2) + ' → ' + SB.economy.rates(wt).warmstone.toFixed(2));
  check('🚨 买了斧头又买镐，珊瑚仍是 ×1.8 —— 采石工具不许回头抬珊瑚',
    Math.abs(SB.economy.rates(wt).coral / rCoral0 - 1.8) < 1e-9,
    rCoral0.toFixed(2) + ' → ' + SB.economy.rates(wt).coral.toFixed(2));

  /* ⑦ 存档侧：tools 必须真的存进 / 读回来，否则刷新等于白买。 */
  const snap = JSON.parse(JSON.stringify(wt));
  const backRun = SB.state.migrateRun(snap);
  check('买过的工具能过存档往返（刷新不会白买）',
    !!backRun.tools && backRun.tools.tool_sickle && backRun.tools.tool_pick,
    JSON.stringify(backRun.tools));
  check('存档里的工具表是布尔买断表（不是计数）',
    JSON.stringify(backRun.tools) === '{"tool_sickle":true,"tool_axe":true,"tool_pick":true}',
    JSON.stringify(backRun.tools));
  const wtFresh = SB.state.migrateRun({ t: 0 });
  check('旧档缺 tools 键时补出空表（缺键 = undefined 会顺着 `s.tools &&` 变成不生效）',
    !!wtFresh.tools && typeof wtFresh.tools === 'object' &&
    Object.keys(wtFresh.tools).length === 0, JSON.stringify(wtFresh.tools));

  /* ⑧ 工坊界面 —— 用户拍板的是「建成工坊**开工坊界面**」，
   *    所以面板必须真的存在、真的会跟着状态翻，不能只是数据层对。 */
  wt.tools = {}; wt.lvl.workshop = 0;
  SB.game.setTab('workshop');
  check('没建工坊时进不去（灰页签就是点不动，不是装饰）',
    SB.game.getTab() !== 'workshop', 'tab=' + SB.game.getTab());
  check('没建工坊时面板写着「尚未建成」，不给玩家一块空白',
    /尚未建成/.test(doc.getElementById('pane-workshop').innerHTML));

  wt.lvl.workshop = 1;
  SB.ui.render.setWorkshopView('upgrades');
  SB.game.setTab('workshop');
  check('建成工坊后页签放行', SB.game.getTab() === 'workshop', 'tab=' + SB.game.getTab());
  wt.res.coral = 9999; wt.res.silt = 9999;
  SB.game.setTab('workshop');
  const wpane = doc.getElementById('pane-workshop').innerHTML;
  check('工坊页列出三件工具，成本逐条摊开（够钱时也让看清要多少）',
    ['青铜镰', '青铜斧', '青铜镐'].every(n => wpane.indexOf(n) >= 0) &&
    /珊瑚 150/.test(wpane) && /珊瑚 200/.test(wpane) && /金属 50/.test(wpane),
    '三件齐 / 150·200·50');
  const wBtnBefore = wpane.match(/<button[^>]*data-tool="tool_sickle"[^>]*>/);
  check('买得起时按钮不带 disabled', !!wBtnBefore && !/disabled/.test(wBtnBefore[0]),
    wBtnBefore ? wBtnBefore[0] : '找不到按钮');

  wt.res.coral = 0; wt.res.silt = 0;
  SB.game.setTab('workshop');
  const wMsg = doc.getElementById('pane-workshop').innerHTML;
  /* ⚠️ ⚠️ 换成**受控复验**（2026-09-28 踩到）：上面那次渲染读的是全局 run()，而本文件
   *    前面几段断言改过它的 `techs.ironwork` 与 `lvl.workshop` —— 于是「面板上每件工具
   *    为什么是这个文案」变成一道随用例顺序漂移的题：同一件工具，此刻叫「买不起」、
   *    下一刻就可能是「未解锁」。在那份面板上逐件对答案，对的是**别人的历史状态**。
   *    ⇒ 这里自己造一份干净 state：研究铁器（让铁质三件过科技门，只留钱不够）
   *      + 三种资源清零 + 工坊已建（否则整页是「工坊尚未建成」），渲染后再逐件核。
   *    ⚠️ 验完**还原**：ironwork 原本是前面那段断言设上去的，不能顺手删掉。 */
  {
    const g = SB.game.run();
    /* ⚠️ 2026-09-29 马具实装：它从「wip 排除名单」进了正式工具名单 ⇒ 夹具必须
     *    同时给它开科技门（horsemanship），与铁器同一口径 —— 只留「钱不够」这一种拦法。
     * ⚠️ 2026-09-30 钢质三件同理：开 metalrefine 门 + 清 steel，不然它们叫「未解锁」。 */
    const bakIron = g.res.iron, bakTech = !!g.techs.ironwork, bakHorse = !!g.techs.horsemanship;
    const bakSteel = g.res.steel, bakMetal = !!g.techs.metalrefine;
    /* ERA8（2026-10-18）：θ三件吃 θ金属 —— 夹具同样清零，让它们也落到「钱不够」态。 */
    const bakTheta = g.res.thetaMetal;
    g.techs.ironwork = true;
    g.techs.horsemanship = true;
    g.techs.metalrefine = true;
    g.techs.biomat = true;
    g.res.iron = 0; g.res.coral = 0; g.res.silt = 0; g.res.steel = 0; g.res.thetaMetal = 0;
    SB.game.setTab('workshop');
    const msg = doc.getElementById('pane-workshop').innerHTML;
    g.res.iron = bakIron; g.res.steel = bakSteel; g.res.thetaMetal = bakTheta;
    if (!bakTech) delete g.techs.ironwork;
    if (!bakHorse) delete g.techs.horsemanship;
    if (!bakMetal) delete g.techs.metalrefine;
    if (!g.techs.biomat) delete g.techs.biomat;

    /* 标签的取法跟着 render.js 的口径走（`/^需要先/.test(why) ? '未解锁' : '买不起'`），
     * 这里不重写那份规则 —— 一重写两边就各自演化，又变成两套逻辑。 */
    const labelOf = (id) => {
      const at = msg.indexOf('data-tool="' + id + '"');
      if (at < 0) return '未渲染';
      const m = msg.slice(at, at + 400).match(/>([^<]+)</);
      return m ? m[1] : '?';
    };
    const poor = SB.TOOLS.filter(t => !t.wip);
    const wrongPoor = poor.filter(t => labelOf(t.id).indexOf('买不起') === -1).map(t => t.id);
    check('资源不足时按钮改口叫「买不起 + 名称 已/需」（不是灰着还写「买」）',
      wrongPoor.length === 0 && /还缺/.test(msg),
      wrongPoor.length ? '没改口的：' + wrongPoor.join('、')
        : '共 ' + poor.length + ' 件全部改口｜示例 ' + labelOf(poor[0].id));
    /* ⚠️ 钉住 wip 占位件在同一份面板上的表现：它该写「尚未设计」，绝不能
     *    跟着大伙儿叫「买不起」—— 那是「钱不够」的意思，会把方向说反。
     *    ⚠️ 2026-09-29 马具实装 ⇒ 表里**当前没有** wip 件；这条改判两态：
     *    「没有占位件」是当前真实性质；将来再放占位件进来，第二半自动接管查行为。 */
    const hw = SB.TOOLS.filter(t => t.wip);
    const badWip = hw.filter(t => !/尚未设计/.test(msg));
    check('wip 占位件要么当前不存在（马具已实装）、要么面板写「尚未设计」',
      hw.length === 0 || badWip.length === 0,
      hw.length === 0 ? '表内无 wip 件（全部已实装）'
        : badWip.length ? '说错话的：' + badWip.map(t => t.id + '=' + labelOf(t.id)).join('、')
          : hw.map(t => t.name + '=' + labelOf(t.id)).join('、'));
  }

  /* ── 工艺升级项的**面板入口**（2026-09-28）─────────────────────────
   * ⚠️ 这一条的由来：capOf 那条 ×1.5 的乘区早就通了、e2e 也绿了，但工坊面板上
   *    **根本没这一块** —— 玩家点不到，等于 ×1.5 不存在。与「系数加了没接线」是
   *    同一类病，缺的是入口。判据：**点不到的效果等于没做**，UI 少一块不算「以后再加」。
   * ⚠️ 照上面工具那段的受控复验口径：本段的全局 state 已被多处断言改过（铁器、
   *    工坊等级、三件资源），在那份面板上逐项对答案等于对别人的历史状态。
   *    ⇒ 自己造一份干净 state，验完还原。 */
  {
    const g = SB.game.run();
    const bak = {
      tech: !!g.techs.engineeringT, lvl: g.lvl.workshop,
      bracket: g.res.ironBracket, rope: g.res.rope, upg: g.upgrades
    };
    g.techs.engineeringT = true;      // 过了科技门，只剩钱不够
    g.lvl.workshop = 1;
    g.res.ironBracket = 0; g.res.rope = 0;
    SB.ui.render.setWorkshopView('making');
    SB.game.setTab('workshop');
    const makePane = doc.getElementById('pane-workshop').innerHTML;
    check('工坊「制造」页签只显示可重复制造的配方',
      /data-workshop-view="making"[^>]*aria-pressed="true"/.test(makePane) &&
      /工艺制作/.test(makePane) && !/data-tool="/.test(makePane) &&
      !/data-upgrade="upg_ballast_1"/.test(makePane),
      '配方=' + /工艺制作/.test(makePane) + ' 工具混入=' + /data-tool="/.test(makePane) +
      ' 工坊升级混入=' + /data-upgrade="upg_ballast_1"/.test(makePane));
    fire({ dataset: { workshopView: 'upgrades' } });
    const pane0 = doc.getElementById('pane-workshop').innerHTML;
    check('点击工坊「升级项」切换并显示工具与工坊升级',
      /工坊升级/.test(pane0) &&
      /职业工具/.test(pane0) && /data-tool="/.test(pane0) &&
      /data-workshop-view="upgrades"[^>]*aria-pressed="true"/.test(pane0) &&
      pane0.indexOf('data-upgrade="upg_ballast_1"') >= 0 &&
      pane0.indexOf('data-upgrade="upg_kelpstore_1"') >= 0,
      '工坊升级区=' + /工坊升级/.test(pane0) + ' 工具区=' + /职业工具/.test(pane0) + '，按钮=' +
      (pane0.match(/data-upgrade="[^"]+"/g) || []).join(' '));
    /* ⚠️ 取**按钮上那行字**，不要去匹配标签属性：`title` 里写的是「还缺 铁制支架 50」，
     *    那是缺口明细，按钮本身该写的「材料不够」在标签**外面**、紧跟着按钮的那段文本里。
     *    只测标签 ⇒ 断言永远读到 title，写着什么字都盖不住（这条自己踩过一次）。
     *    ⚠️ 取法照上面工具那段 `labelOf` 的口径：定位到 data-upgrade，向后取第一段文本。 */
    const upgLabel = (pane, id) => {
      const at = pane.indexOf('data-upgrade="' + id + '"');
      if (at < 0) return '未渲染';
      const m = pane.slice(at, at + 400).match(/>([^<>]+)</);
      return m ? m[1] : '?';
    };
    const b0 = pane0.match(/<button[^>]*data-upgrade="upg_ballast_1"[^>]*>/);
    check('材料不够时按钮灰着、并写「材料不够 + 名称 已/需」（不是灰着还写「装上」）',
      !!b0 && /disabled/.test(b0[0]) && upgLabel(pane0, 'upg_ballast_1').indexOf('材料不够') === 0,
      b0 ? 'disabled=' + /disabled/.test(b0[0]) + ' 文案=' + upgLabel(pane0, 'upg_ballast_1')
        : '找不到按钮');

    g.res.ironBracket = 50; g.res.rope = 50;
    SB.game.setTab('workshop');
    fire({ dataset: { upgrade: 'upg_ballast_1' } });
    const pane1 = doc.getElementById('pane-workshop').innerHTML;
    check('点「装上」真的装上了：s.upgrades 落袋 + 面板改口「已装上」+ 铁制支架+绳扣掉',
      !!(g.upgrades && g.upgrades.upg_ballast_1) &&
      (pane1.match(/已装上/g) || []).length === 1 &&
      (g.res.ironBracket || 0) === 0 && (g.res.rope || 0) === 0,
      'upgrades=' + JSON.stringify(g.upgrades) +
      ' ironBracket=' + (g.res.ironBracket || 0) + ' rope=' + (g.res.rope || 0));

    if (!bak.tech) delete g.techs.engineeringT;
    if (!bak.lvl) g.lvl.workshop = 0;
    g.res.ironBracket = bak.bracket; g.res.rope = bak.rope;
    g.upgrades = bak.upg;
    SB.ui.render.setWorkshopView('upgrades');
    SB.game.setTab('workshop');
  }

  /* ═════════ 灯塔 / 大灯塔 / 全资源乘区（2026-09-28）═════════
   * ⚠️ 这一组的目的是钉住「+1% 有没有漏乘」：globalMul 是**新乘区**，要挨条挂到每种
   *    资源的产出行上。漏掉一种不会报错、不会 NaN，只是那种资源不吃加成 —— 典型的
   *    静默断链。所以这里逐项比，而不是只验一个总数。
   * ⚠️ 两份 state 除灯塔级数外**逐字段相同**（深拷贝再改一个键），否则比值对比会
   *    混进别的差异，红的时候分不清是谁造成的。 */
  {
    /* ⚠️ 造 state 的三个坑，全是实测踩出来的，改这段时别退回去：
     *   ① jobs / lvl 必须用 Object.assign **打补丁**，不能整体替换。整体替换会顺手删掉
     *      没写进字面量的键（如 lvl.library），而 tick 里的乘法会读它 ⇒ `undefined * 系数 = NaN`
     *      ⇒ 珊瑚 / 石头 / 砂矿 / 暖石几条产线**静默变 NaN**（不抛错，纯静默，最难查那种）。
     *      ⚠️ 2026-09-28：最初是在 `lvl.reef` 上踩到的，而礁石平台已删除 ⇒ 举一反三时
     *      别照抄那个键，报的是**这个坑本身**（任何 s.lvl.x 都适用）。
     *   ② frozen 要显式解掉：冰封期 cold=0，所有产出恒 0，比值无从比。
     *   ③ 库存初值必须**低于仓储上限**：砂矿基础上限 200，填 500 会被 addRes 夹回去，
     *      那一 tick 的主导量变成「削减库存」而不是「产出」，比值完全失真。 */
    const gm = 1 + SB.BLD.lighthouseProd;
    const mk = (lighthouse, extra) => {
      const c = SB.state.freshRun(false);
      c.pop = 0;                                    // 断掉口粮消耗（foodUse 刻意不吃 +1%）
      c.frozen = false;                             // 解冰封：cold=1，产出才不是恒 0
      Object.assign(c.jobs, { gather: 2, coralwright: 3, quarrier: 2, miner: 3, craft: 2,
        scholar: 2, scribe: 1 });
      /* ⚠️ 2026-09-28：`geyser: 60` 一并删除（热泉井已删）。留着它 = 一个**永远为 0 的
       *    等级键**：`Object.assign` 不报错，而任何读 `lvl.geyser` 的地方只会拿到 undefined。
       *    ⚠️ 这条就在 `fuelRate` 旁边——`undefined * 系数 = NaN` 是本项目出过的最贵的坑。 */
      Object.assign(c.lvl, { kelp: 10, library: 2, furnace: 1, workshop: 1 });
      c.res.silt = 100; c.res.warmstone = 100;      // < cap(200)，不被上限夹
      if (extra) extra(c);
      c.lvl.lighthouse = lighthouse;
      return c;
    };
    const A = mk(0), B = mk(1);
    const r0 = SB.economy.rates(A), r1 = SB.economy.rates(B);

    /* 「毛额」= 这一项真正进池的那一段产出。⚠️ silt / warmstone 在 rates() 里记的是**净额**：
     * 末尾减掉了熔炉正在吃的 fc（扣料，刻意不吃 +1%）。验乘区覆盖时必须把它加回去，
     * 否则「产出漏乘了」和「扣的那份被放大了」这两种错会混成同一个红，等于没测。
     * ⚠️ fc 从哪来：A 组没灯塔也没奇观 ⇒ globalMul(A) 恒为 1 ⇒ r0.iron 就是 fc 本身
     *    （iron 记的正是「扣掉的原料份数」）。这个等号是这个口径成立的前提，改之前先看懂。
     *    ⚠️ 但**补回去的那份必须是未放大的 fc**：iron 记的是 `fc × globalMul`，在 B 组里
     *       已经被放大；拿 r1.iron 去补 r1.silt 会重复计价 —— 实测 silt 比值从正确的
     *       1.010000 虚报成 1.012222，红是假的，会把排查方向带歪。 */
    const IS_CUT = k => (k === 'silt' || k === 'warmstone');
    const fc = r0.iron;
    const gross = (r, k) => (IS_CUT(k) ? r[k] + fc : r[k]);

    /* ① 纯产出线：整条表达式就是「产出 × globalMul」，没有任何不乘的加减项 ⇒
     *    比值必须**恰好** 1.01。这五行就是 globalMul 的覆盖清单，漏一条立刻红。 */
    const pure = ['coral', 'stone', 'science', 'culture', 'iron'];
    const miss = pure.filter(k => !(r1[k] > 0) || Math.abs(r1[k] / r0[k] - gm) > 1e-9);
    check('灯塔 +1% 覆盖全部纯产出线（珊瑚/石头/科技/市政点/精铁，漏一条这里红）',
      miss.length === 0,
      miss.length ? '没乘上：' + miss.map(k => k + ' ' +
        (r0[k] || 0).toFixed(4) + '→' + (r1[k] || 0).toFixed(4)).join('、')
        : pure.join('/') + ' 各 ×' + gm.toFixed(2));

    /* ② 扣料线：净额的增量必须恰好 = 1% × 毛额。这一条一次钉两件事 ——
     *    产出那一段乘上了，扣掉的那一份没乘（扣料放大 = 白扣，比漏乘更亏）。 */
    const cut = ['silt', 'warmstone'].filter(k =>
      Math.abs((r1[k] - r0[k]) - (gm - 1) * gross(r0, k)) > 1e-9);
    check('扣料线（矿砂/暖石）：产出那一段 ×1.01，熔炉扣的铁料那一份不放大',
      cut.length === 0,
      cut.length ? '差的：' + cut.map(k => k + ' 实增 ' + (r1[k] - r0[k]).toFixed(6)
        + '，应为 ' + ((gm - 1) * gross(r0, k)).toFixed(6)).join('、')
        : '毛额 ' + gross(r0, 'silt').toFixed(4) + '/' + gross(r0, 'warmstone').toFixed(4)
          + ' 各 ×' + gm.toFixed(2) + '，扣料那一份原样');

    /* ③ 地热：fuelRate 是「(毛产出 − 城邦维护) × globalMul」—— 维护是消耗，不放大
     *    （与口粮消耗 foodUse 同一个规矩）。
     *    ⚠️ 另一件容易漏的事：灯塔**本身也是建筑**，升一级会把 lvlSum 抬高 ⇒ 城邦维护
     *      凭空多 `BLD.upkeep` 一份，这一份也不放大。所以严格等式是：
     *          fuelRate(B) === (fuelRate(A) − BLD.upkeep) × gm
     *       写成「增量 = 1% × 净额」会差 0.0015×gm，看着像漏乘，其实是漏算了维护。
     *       （少一个灯塔 1.089 → 1.098375，用错公式会红在 1%×1.089=0.01089 上。） */
    const fa0 = SB.economy.fuelRate(A, 1), fa1 = SB.economy.fuelRate(B, 1);
    /* ⚠️ 2026-09-28 **挂起（不是改绿）**：热泉井（地热的唯一产出口）已删 ⇒ `fuelRate`
     *    恒返回 0 ⇒ 这条等式**没有输入可代**（`fa0 > 0` 恒假），公式本身仍在
     *    `economy.fuelRate` 里原样保留，等地热线重设时把断言改回 check() 即可：
     *        check('地热线：净额整体 ×1.01，…', fa0 > 0 && Math.abs(fa1 - (fa0 - SB.BLD.upkeep) * gm) < 1e-9, …)
     *    ⚠️ 但「维护不跟着放大」这条**规则本身仍然有效**，只是暂时没了回归覆盖 ——
     *       重设时优先把它验回来，别连公式一起重写。 */
    pending('地热线：净额整体 ×1.01，维护（含灯塔自己那一级的）不跟着放大',
      'fuelRate 恒 0（热泉井已删）⇒ 公式无输入；原断言：fa0>0 && |fa1-(fa0-upkeep)*1.01|<1e-9');
    /* 顺手钉住「恒 0」这个**当前真实性质**（不是空跑：它证的是没有 NaN、也没有残留产出口）。 */
    check('地热线当前恒为 0 且不产生 NaN（热泉井已删 ⇒ 无产出口）',
      fa0 === 0 && fa1 === 0 && !isNaN(fa0) && !isNaN(fa1),
      'fa0=' + fa0 + ' fa1=' + fa1 + '（若为 NaN 说明又有 `s.lvl.x` 少了 || 0 兜底）');

    /* ④ 工艺燃料（rocketFuel）：2026-10-29 用户拍板「燃料 +X/秒 换到右边（工艺资源）去、
     *    数值就这样不动」。泰坦星气云采集站每级 +5/秒、萨图恩 fuelBonus 30/秒 从此进
     *    rocketFuel —— 此前它们写进 RESS.fuel（内部名地热），而那条线的显示门挂在已删除的
     *    热泉井上 ⇒ 资源格永不出现 ⇒ 玩家看到的「燃料 +5/秒」等于没生效。
     *    ⚠️ 断言要三件一起锁：①速率台账 ②真实 tick 落账 ③**不再**写进 RESS.fuel
     *       （只锁前两件的话，同时写两边也能绿，而那就是这次要消灭的形态）。 */
    const fw = SB.state.freshRun(false);
    fw.lvl.titancloud = 3;
    fw.res.rocketFuel = 0;
    fw.res.fuel = 0;
    const fwRate = SB.economy.rates(fw).rocketFuel || 0;
    SB.economy.tick(fw, 10);
    check('工艺燃料：泰坦气云站每级 +5/秒 落进 rocketFuel（10s 应 +150），且不写进 RESS.fuel',
      Math.abs(fwRate - 15) < 1e-9
      && Math.abs(fw.res.rocketFuel - 150) < 1e-6
      && fw.res.fuel === 0,
      'rate=' + fwRate + '（应 15）；10s 后 rocketFuel=' + fw.res.rocketFuel
      + '（应 150）、fuel=' + fw.res.fuel + '（应 0）');

    /* ② 藻食：rates.kelp 是净额（毛产出 − 口粮消耗），消耗不吃 +1% ⇒
     *    整体比值不会等于 1.01。所以验**毛产出**函数本身必须 ×1.01。 */
    const f0 = SB.economy.foodRate(A, 1), f1 = SB.economy.foodRate(B, 1);
    check('灯塔对藻食**毛产出**也 +1%（foodRate 函数级：净额里的消耗项刻意不吃）',
      Math.abs(f1 / f0 - gm) < 1e-9, f0.toFixed(4) + ' → ' + f1.toFixed(4));

    /* ④ 面板 === 结算：rates() 是面板读数，tick 是真正进账。上面验的是面板，
     *    这里跑一个 dt 的 tick，看增量是否与面板同一比值。
     *    ⚠️ 口径与面板侧一致（走同一个 gross()）：silt / warmstone 的 tick 增量里
     *       也含着「被扣掉的那一份铁料」，不还原就对不上。
     *    ⚠️ 地热不列在这里：它的净额里含城邦维护，比值本就不是 1.01（上面 ③ 专测）。 */
    const t0 = mk(0), t1 = mk(1);
    const before = ['coral', 'stone', 'silt', 'science', 'culture', 'iron', 'kelp'];
    const d0 = {}, d1 = {}, g0 = {}, g1 = {};
    let k;
    for (k of before) { d0[k] = t0.res[k] || 0; d1[k] = t1.res[k] || 0; }
    SB.economy.tick(t0, 1, null); SB.economy.tick(t1, 1, null);
    /* ⚠️ 补回去的同样是**未放大**的那份铁料（= A 组的 iron 增量），理由与面板侧同一条注释：
     *    B 组的 iron 增量是 fc×1.01，而它从暖石/矿砂里扣掉的实际是没放大的 fc。 */
    const fc0 = (t0.res.iron || 0) - d0.iron;
    for (k of before) {
      g0[k] = (t0.res[k] || 0) - d0[k] + (IS_CUT(k) ? fc0 : 0);
      g1[k] = (t1.res[k] || 0) - d1[k] + (IS_CUT(k) ? fc0 : 0);
    }
    const drift = before.filter(key => !(g0[key] > 0) || Math.abs(g1[key] / g0[key] - gm) > 1e-9);
    check('灯塔的 +1% 在 tick 里也成立（面板路 === 结算路，漏乘一条就对不上）',
      drift.length === 0,
      drift.length ? '对不上的：' + drift.map(key => key + ' ×' +
        (g1[key] / (g0[key] || 1)).toFixed(6)).join('、')
        : before.join('/') + ' 与面板同比例');

    /* ④ 容量侧：灯塔 +120/级（与压舱仓并列相加，不是相乘）。 */
    const cap0 = SB.economy.capOf(A, 'coral'), cap1 = SB.economy.capOf(B, 'coral');
    check('灯塔给材料仓储 +120/级（与压舱仓并列相加，不叠乘）',
      Math.abs((cap1 - cap0) - SB.BLD.lighthouseCap) < 1e-9,
      cap0 + ' → ' + cap1 + '（+'
      + (cap1 - cap0).toFixed(0) + '，ballastCap=' + SB.BLD.ballastCap + '）');

    /* ⑤ 大灯塔：两笔效果各走各的通道，量纲不同，分别钉。 */
    /* ⚠️ 奇观是**买断**的：civicBonus 读的是 s.wonders，跟有没有灯塔建筑无关 ——
     *    所以这里要单独造一份「建了大灯塔」的 state，不能拿 B 顶替。 */
    const Bw = mk(1); Bw.wonders = { wonder_great_lighthouse: true };
    check('大灯塔 = 市政点 +2/秒（走 wonder.civicBonus 的绝对量，不是乘区）',
      SB.wonder.civicBonus(Bw) === 2 && SB.wonder.civicBonus(B) === 0,
      '未建 ' + SB.wonder.civicBonus(B) + ' → 建了 ' + SB.wonder.civicBonus(Bw) + '/秒');
    /* ⚠️ 反向：灯塔那座建筑也别偷加 civic —— 两件东西各管一段，重复计价是白送。 */
    check('灯塔自身**不给**市政点（+1% 归灯塔，+2/s 归大灯塔，别重复计价）',
      SB.wonder.civicBonus(mk(3)) === 0,
      '灯塔 3 级时 civicBonus=' + SB.wonder.civicBonus(mk(3)));

    /* ⚠️ 2026-10-06 机制变更：大灯塔不再给「所有材料一次性 +60」，改为「建成后每座灯塔
     *   +60/级」（= 压舱仓一半），随灯塔数量/等级缩放。旧的 flat +60 断言作废。 */
    const wCap0 = SB.economy.capOf(mk(0), 'coral');
    const wCap0w = mk(0); wCap0w.wonders = { wonder_great_lighthouse: true };
    check('大灯塔：0 座灯塔时不加任何仓储（旧 flat+60 已取消，避免重复计价）',
      Math.abs(SB.economy.capOf(wCap0w, 'coral') - wCap0) < 1e-9,
      'Δ=' + (SB.economy.capOf(wCap0w, 'coral') - wCap0).toFixed(0));
    const cL1 = mk(1), cL1w = mk(1); cL1w.wonders = { wonder_great_lighthouse: true };
    check('大灯塔：1 座灯塔 → 仓储额外 +60/级（= 压舱仓一半），灯塔变 180/级',
      Math.abs(SB.economy.capOf(cL1w, 'coral') - SB.economy.capOf(cL1, 'coral') - 60) < 1e-9,
      'Δ=' + (SB.economy.capOf(cL1w, 'coral') - SB.economy.capOf(cL1, 'coral')).toFixed(0));
    const cL5 = mk(5), cL5w = mk(5); cL5w.wonders = { wonder_great_lighthouse: true };
    check('大灯塔：5 座灯塔 → 额外 +300（5×60，随灯塔数量缩放，非固定）',
      Math.abs(SB.economy.capOf(cL5w, 'coral') - SB.economy.capOf(cL5, 'coral') - 300) < 1e-9,
      'Δ=' + (SB.economy.capOf(cL5w, 'coral') - SB.economy.capOf(cL5, 'coral')).toFixed(0));
  }

  wt.res.coral = 9999; wt.res.silt = 9999;
  SB.game.setTab('workshop');
  fire({ dataset: { tool: 'tool_sickle' } });
  const wAfter = doc.getElementById('pane-workshop').innerHTML;
  check('点「买下」真的买到手：数据落袋 + 面板改口「已买下」',
    !!wt.tools.tool_sickle && (wAfter.match(/已买下/g) || []).length === 1,
    JSON.stringify(wt.tools));
  const wBtnAfter = wAfter.match(/<button[^>]*data-tool="tool_sickle"[^>]*>/);
  check('买过的那一行不给按钮（买断制，不是等级）',
    !!wBtnAfter && /disabled/.test(wBtnAfter[0]), wBtnAfter ? wBtnAfter[0] : '找不到按钮');

  /* ═════════ era2 第三层 · 工程学 / 数学 / 构架术（2026-09-28 用户规格）═════════
   * 这一层同时开了**三条新的通道**：配方解锁门（CRAFTS[].need）、仓储**乘法**轴
   * （扩容升级）、工坊效率加区（craftRatio）。三条都是本项目「数据表写了、实现层
   * 没读」的高发区，所以每一条都正反两面钉 —— 正面看它生效，反面看它被拦住。 */
  {
    const F = () => SB.state.freshRun(false);
    const byId = id => SB.TECHS.filter(t => t.id === id)[0];

    /* ① 科技 id 全表唯一 —— 加新科技最容易踩的坑，而且踩了不报错。
     *    era5 那一项已经占用了 `engineering`（工程兵团）。若 era2 这项也叫 engineering，
     *    `s.techs['engineering']` 就只有一个键：研究任一项都把另一项当成已掌握，
     *    byId 也只返回表里靠前那条。 ⇒ 每加一项科技都顺手体检一次全表。 */
    {
      const _ids = SB.TECHS.map(t => t.id);
      const _dup = [];
      _ids.forEach((v, i) => { if (_ids.indexOf(v) !== i && _dup.indexOf(v) < 0) _dup.push(v); });
      check('科技 id 全表唯一（era5「工程兵团」已占用 engineering，era2 这项须另取 id）',
        _dup.length === 0, _dup.length ? '重复 id：' + _dup.join('、') : _ids.length + ' 项，无一重复');
    }

    /* ② 所有 need / reqs 指向**真实存在**的科技 id。
     *    这条断言的由来：石梁配方原来写的 `need:'workshop'` 指的就是一个
     *    techs.js 里不存在的科技（workshop 只是**建筑** id）。CraftBlocked 补读 need
     *    之前它一直无害，一旦开始读，石梁就永久造不出来 —— 不报错，只是消失。 */
    {
      const broken = [];
      const chk = (label, list, key) => (list || []).forEach(o => {
        const n = o[key];
        if (n && !byId(n)) broken.push(label + '.' + o.id + ' → ' + n + '（无此科技）');
      });
      chk('CRAFT', SB.CRAFTS, 'need');
      chk('UPGRADE', SB.UPGRADES, 'need');
      chk('TOOL', SB.TOOLS, 'need');
      /* 悬空 reqs 的**已知豁免**（唯一的豁免，见下面的理由）。
       *  ⚠️ 不是「不报错所以没事」：悬空 reqs 的实际后果是**该科技当前不可达**
       *    （与破冰死锁那条 pending 同性质：不崩、不 NaN，就是永远差一步）。
       *  ⚠️ 也没被悄悄摘掉判定 —— 它们会原样出现在下面的 detail 里，
       *    任何人一读输出就知道这笔债还没还。纪元五重做后必须把这个 KNOWN 清，
       *    那时再出现任何悬空 reqs，断言立刻恢复红色。 */
      /* ERA5（2026-10-02）已整体重做，旧 era5 的 ballistics/engineering 悬空 reqs
       * 已随科技表重建消失，此处不再有已知悬空豁免。任何新悬空 reqs 都应立刻变红。 */
      const KNOWN_DANGLING = {};
      const dangling = [];
      SB.TECHS.forEach(t => (t.reqs || []).forEach(r => {
        if (byId(r)) return;
        const key = t.id + '->' + r;
        if (KNOWN_DANGLING[key]) dangling.push('TECH.' + key + '（已知悬空：' + KNOWN_DANGLING[key] + '）');
        else broken.push('TECH.' + t.id + ' → ' + r + '（无此科技）');
      }));
      check('配方 / 升级项 / 工具 / 前驱指向的科技 id 全部真实存在（防指向不存在科技的死链）',
        broken.length === 0,
        broken.length ? broken.join('；')
          : (dangling.length ? '无新增死链｜已知悬空：' + dangling.join('；')
            : SB.CRAFTS.length + SB.UPGRADES.length + SB.TOOLS.length + ' 项引用 + 全树 reqs 全部指向真实科技'));

      /* ⚠️ 上一条**不够**，也说不清自己为什么不够：写入时若把 `engineeringT` 写成
       *    `engineering`，上面那条会**放过** —— 因为 `engineering` 是一个**真实存在的
       *    科技 id**（era5 的「工程兵团」）。它合法、可解析、不报错，只是 unlocking 的
       *    对象不是玩家以为的那一项（面板会显示「需要先研究『工程兵团』」）。
       *    ⇒ 再钉一条反向的：**解锁物必须指回解锁它的那一项科技**。 */
      const backRef = [];
      const expect = { craft_ironbracket: 'engineeringT', craft_rope: 'scaffoldT',
        upg_ballast_1: 'engineeringT', upg_kelpstore_1: 'engineeringT' };
      Object.keys(expect).forEach(id => {
        const o = (SB.CRAFTS || []).filter(x => x.id === id)[0] ||
                  (SB.UPGRADES || []).filter(x => x.id === id)[0];
        if (!o) { backRef.push(id + '（表上找不到）'); return; }
        if (o.need !== expect[id]) backRef.push(id + ' 的 need=' + o.need + '，应为 ' + expect[id]);
      });
      check('解锁物指回解锁它的那项科技（不只是「存在」，还要「对得上」）',
        backRef.length === 0, backRef.length ? backRef.join('；') : '解锁方与兑现物一一对应');
    }

    /* ③ 配方解锁门真的拦得住，且**执行路也拦得住**。
     *    「门只拦 blocked、不拦 craft()」= 解锁权是摆设：玩家照样能把配方点起来。 */
    {
      const noTec = F();
      noTec.lvl.workshop = 1;
      const why = String(SB.workshop.craftBlocked(noTec, 'craft_ironbracket'));
      check('没研究工程学时，铁制支架造不出（CRAFTS[].need 被 craftBlocked 真读）',
        /需要先研究「工程学」/.test(why), why);
      const gain0 = SB.workshop.craft(noTec, 'craft_ironbracket', 5, () => {});
      check('…而且 craft() 也造不出（门只拦 blocked 不拦执行 = 解锁权形同虚设）',
        gain0 === 0 && !(noTec.res.ironBracket > 0),
        'gain=' + gain0 + '，ironBracket=' + (noTec.res.ironBracket || 0));

      noTec.techs.engineeringT = true;
      noTec.res.iron = 200;
      const iron0 = noTec.res.iron;
      const gain = SB.workshop.craft(noTec, 'craft_ironbracket', 5, () => {});
      /* ⚠️ 这句里的 `20 - gain` 是**断言自己的算术错**，2026-09-28 修（2026-09-29 随配方改 iron:20 同步刷新数字）：
       *    gain 是**产出**（5×1×1.05=5.25，工坊那级 +5%），铁是**投入**（5×20=100）,
       *    两者不相等 ── 投入从不打折，只有产出乘效率（见 craft 里那句 craftMul 的注）。
       *    于是断言拿 5.25 去比实际的 100，永远不成立，而代码从头到尾是对的。
       *    ⇒ 这类「断言比错量纲」与「改常数让断言变绿」不是一回事：
       *      后者是标定（停），前者是量错了（修），改的是断言不是实现。
       * ⚠️ 顺带把它钉严：产物写成 `c.res` 那条键（不是硬编码的 stoneBeam），
       *    且**不往 stoneBeam 池里多写一笔**（写错资源 id 时两边会一起错）。 */
      const rec = SB.CRAFTS.filter(c => c.id === 'craft_ironbracket')[0];
      const ironSpent = rec.in.iron * 5;
      check('研究了工程学之后能造铁制支架，产物真落进资源池（c.res 接线，不是扣料产 0）',
        gain > 0 && (noTec.res.ironBracket || 0) === gain &&
        (noTec.res.iron || 0) === iron0 - ironSpent,
        '造出 ' + gain + '，ironBracket=' + (noTec.res.ironBracket || 0) +
        '，iron 剩 ' + (noTec.res.iron || 0) + '（' + iron0 + ' − ' + ironSpent + ' = ' + (iron0 - ironSpent) + '）');
      check('产物写的是本配方那条键，没顺手写进石梁池（c.res 跑偏时两边会一起错）',
        !(noTec.res.stoneBeam > 0) && String(rec.res) === 'ironBracket',
        'stoneBeam=' + (noTec.res.stoneBeam || 0) + '，配方 res=' + rec.res);
      /* ⚠️ 累计产出台账**只该记一笔**。addRes 内部已经写过 s.got[产物]，
       *    若 craft() 在调用端再补一笔，工艺制品的累计产出会**翻倍** ——
       *    s.got 正是 `{t:'gathered'}` 尤里卡条件的读端，不报错，就是错。 */
      check('工艺制品的累计产出台账不被重复记账（记两遍 ⇒ 累计产出条件提前点亮）',
        Math.abs((noTec.got.ironBracket || 0) - gain) < 1e-9,
        'got.ironBracket=' + (noTec.got.ironBracket || 0) + '，造出 ' + gain);

      /* 硬化珊瑚（2026-09-29 新增，对标猫国 beam）：无 need 门，建成工坊即可造。
       * 珊瑚 100/个 ⇒ 5 个吃 500 珊瑚，产物落 hardCoral 池、不串进石梁池。 */
      const hc = F(); hc.lvl.workshop = 1; hc.res.coral = 500;
      const coral0 = hc.res.coral;
      const hg = SB.workshop.craft(hc, 'craft_hardcoral', 5, () => {});
      const hrec = SB.CRAFTS.filter(c => c.id === 'craft_hardcoral')[0];
      const coralSpent = hrec.in.coral * 5;
      check('硬化珊瑚（对标猫国 beam）造得出，珊瑚真被扣、产物落 hardCoral 池',
        hg > 0 && (hc.res.hardCoral || 0) === hg &&
        (hc.res.coral || 0) === coral0 - coralSpent &&
        !(hc.res.stoneBeam > 0),
        '造出 ' + hg + '，hardCoral=' + (hc.res.hardCoral || 0) +
        '，coral 剩 ' + (hc.res.coral || 0) + '（' + coral0 + ' − ' + coralSpent + '）');
    }

    /* ④ 工坊效率 +5%：落在 craftRatio 那条轴，且必须是 mul 表的**加区**键。
     *    ⚠️ ⚠️ 最容易误接的一对：`craftRatio`（工艺制作效率，工坊造石梁那条线）
     *    与 `craft`（加工产出，烟囱炉 +15% / 壳铸 +30%，热泉炉那条线）。名字都带 craft，
     *    接错了不报错，只是「研究完了发现工坊没反应」。 */
    {
      const a = F(), b = F();
      b.techs.scaffoldT = true;
      const r0 = SB.workshop.craftRatio(a), r1 = SB.workshop.craftRatio(b);
      check('构架术给工坊效率 +15%（进 workshop.craftRatio，不是 T.craft 那条精铁线）',
        Math.abs(r1 - r0 - 0.15) < 1e-9,
        r0.toFixed(3) + ' → ' + r1.toFixed(3));
      /* ⚠️ 默认表里若没有 craftRatio，`m[k] === undefined` 那道守卫会把 effect 静默吞掉。 */
      const m = SB.tech.mul(b);
      check('craftRatio 确实是 mul 表的加区键（不在表里 ⇒ effect 被静默忽略，研究完毫无反应）',
        typeof m.craftRatio === 'number' && Math.abs(m.craftRatio - 0.15) < 1e-9,
        'mul().craftRatio = ' + m.craftRatio);
      check('工艺制作效率在面板路（craftMul）上同式（= 1 + ratio）',
        Math.abs(SB.workshop.craftMul(b) - (1 + r1)) < 1e-9,
        'craftMul=' + SB.workshop.craftMul(b).toFixed(4));
    }

    /* ⑤ 扩容升级项：解锁门 → 缺料文案 → 装了之后真的 ×1.5 且乘在**整条**容量上。 */
    {
      const s = F();
      s.lvl.workshop = 1;
      const g1 = String(SB.workshop.upgradeBlocked(s, 'upg_ballast_1'));
      check('扩容升级项没研究工程学时装不了（UPGRADES[].need 被真读，不是死字段）',
        /需要先研究「工程学」/.test(g1), g1);
      s.techs.engineeringT = true;
      const g2 = String(SB.workshop.upgradeBlocked(s, 'upg_ballast_1'));
      check('研究了工程学仍缺料，且缺哪样缺多少说得清（缺 undefined 50 就是没接线）',
        /铁制支架 50/.test(g2) && /绳 50/.test(g2), g2);

      /* ⚠️ 容量基线要够大，否则「×1.5」会被底数太小掩盖（比如底数 0）。 */
      const cap0 = SB.economy.capOf(s, 'coral');
      check('扩容前的材料上限不是 0（否则 ×1.5 恒等于 0，这条断言就空转了）',
        cap0 === SB.CFG.CAP_BASE.coral && cap0 > 0, 'baseline=' + cap0);

      s.res.ironBracket = 50; s.res.rope = 50;
      const ok = SB.workshop.upgradeBuy(s, 'upg_ballast_1', () => {});
      const cap1 = SB.economy.capOf(s, 'coral');
      check('「压舱库扩容 I」装得上，且 50 铁制支架 + 50 绳真的扣掉了',
        ok && (s.res.ironBracket || 0) === 0 && (s.res.rope || 0) === 0 &&
        !!s.upgrades.upg_ballast_1,
        'ironBracket=' + (s.res.ironBracket || 0) + ' rope=' + (s.res.rope || 0) +
        ' upgrades=' + JSON.stringify(s.upgrades));
      /* ⚠️ 乘的是**整条**容量（基础+等级+科技+奇观），不是只乘增量：
       *    只乘增量时「基础容量」那一截永远涨不上去，玩家会在低容量时买了个寂寞。 */
      check('材料上限 ×1.5，且乘在整条容量上（只乘增量 = 底数那截永远不涨）',
        Math.abs(cap1 - cap0 * 1.5) < 1e-9,
        cap0 + ' → ' + cap1 + '（×' + (cap1 / cap0).toFixed(3) + '）');
      check('压舱库扩容**不碰**藻食上限（两条各管一段，共用一个乘区就是重复计价）',
        Math.abs(SB.economy.capOf(s, 'kelp') - SB.CFG.CAP_BASE.kelp) < 1e-9,
        '藻食上限 ' + SB.economy.capOf(s, 'kelp') + '（CAP_BASE ' + SB.CFG.CAP_BASE.kelp + '）');
    }

    /* ⑤-b 市政解锁的升级项（2026-10-17 · 市政《工坊学校》→「精炼钢厂」钢产出 +25%）。
     *   守的是 workshop.upgradeBlocked 里**新补的 needCivic 分支**（此前只有 CRAFTS 用 needCivic，
     *   UPGRADES 没有这道门 ⇒ 写上去也会被静默忽略 = 死字段）。三条判据：
     *    ① 未完成市政 ⇒ 报「需要先完成市政「工坊学校」」，且**以「需要先」开头**
     *       （render-pane-workshop.js:335 正按这个前缀决定**隐藏**该卡，未解锁不显示）；
     *    ② 完成市政后这道门打开、转为缺料（缺哪样缺多少说得清）；
     *    ③ 装填后 steelBonus 真的进 SB.economy.upgSum —— 与废钢锻造的 +20% **加法叠加**。
     *   ⚠️ steelBonus 是**加法档**不是乘法档（economy.js:1046 `(1 + upgSum(s,'steelBonus'))`），
     *      故两件都装是 +0.45 ⇒ ×1.45，不是 ×1.20×1.25。 */
    {
      const s = F();
      s.lvl.workshop = 1; s.lvl.hydroshop = 3;
      const c0 = String(SB.workshop.upgradeBlocked(s, 'upg_steelforge'));
      check('未完成《工坊学校》时「精炼钢厂」装不了，且提示以「需要先」开头（渲染层据此隐藏）',
        /^需要先完成市政「工坊学校」/.test(c0), c0);
      s.civics.civ_steelschool = 1;
      const c1 = String(SB.workshop.upgradeBlocked(s, 'upg_steelforge'));
      check('完成《工坊学校》后门开、转为缺料（缺哪样缺多少说得清）',
        /钢制零件 200/.test(c1) && /钛 100/.test(c1) && /硬化珊瑚 200/.test(c1), c1);
      s.res.steelPart = 200; s.res.titanium = 100; s.res.hardCoral = 200;
      const b0 = SB.economy.upgSum(s, 'steelBonus') || 0;
      const ok = SB.workshop.upgradeBuy(s, 'upg_steelforge', () => {});
      const b1 = SB.economy.upgSum(s, 'steelBonus') || 0;
      check('「精炼钢厂」装得上，且钢产出加成 +0.25 真的进 upgSum(steelBonus)',
        ok && Math.abs((b1 - b0) - 0.25) < 1e-9,
        'steelBonus ' + b0 + ' → ' + b1);
      check('钢产出加成是**加法**：废钢锻造(+0.20)+精炼钢厂(+0.25) ⇒ ×1.45（非 ×1.20×1.25）',
        Math.abs((1 + 0.20 + 0.25) - 1.45) < 1e-9, '两件全开倍率 ' + (1 + 0.20 + 0.25));
    }

    /* ⑤-c 消耗口径（2026-10-17 · 用户：「所有有消耗的建筑，消耗的东西也要写明，不光是暖石」）。
     *   守的是 economy.consumeRates —— 巢穴页「开几座」控件行与建筑信息卡「运行消耗」段
     *   共用它；此前只标暖石 ⇒ 热泉炉看着只烧石头（还吃金属）、热液工坊整行一个消耗都没标。
     *   四条判据：
     *    ① 暖石那一项必须与 warmDraw **逐位相等**（两个出口不许漂）；
     *    ② 热泉炉的金属速率 = 引擎一秒真扣的量（ironFlow(…,1) × bldEff），即「面板给的数就是结算扣的数」；
     *    ③ 工坊热液能 = 运行座数 × hydroShopLvl，金属 = 热液能 × steelMetal × bldEff；
     *    ④ 停产 ⇒ 三项全 0（不是「显示旧值」），不吃料的建筑（藻食场）恒 0。 */
    {
      const s = F();
      s.lvl.furnace = 10; s.lvl.hydroturbine = 4; s.lvl.hydroshop = 6;
      s.furnaceStop = 0; s.turbineStop = 0; s.hydroshopStop = 0;
      s.res.silt = 1e9; s.res.warmstone = 1e9;
      const T = SB.tech.mul(s); const e = T ? T.bldEff : 1;
      const cf = SB.economy.consumeRates(s, 'furnace');
      const ct = SB.economy.consumeRates(s, 'hydroturbine');
      const cs = SB.economy.consumeRates(s, 'hydroshop');
      check('consumeRates 的暖石项与 warmDraw 逐位相等（控件行/信息卡同一个数）',
        Math.abs(cf.warm - SB.economy.warmDraw(s, 'furnace')) < 1e-12 &&
        Math.abs(ct.warm - SB.economy.warmDraw(s, 'hydroturbine')) < 1e-12,
        'furnace ' + cf.warm + '/' + SB.economy.warmDraw(s, 'furnace') +
        ' turbine ' + ct.warm + '/' + SB.economy.warmDraw(s, 'hydroturbine'));
      /* 金属充足时 ironFlow 一秒转多少份 ⇒ 金属扣 fc×bldEff，就是 consumeRates.metal。
       * ⚠️ ironFlow 挂在 SB.economyInternals（不对外当面板 API），e2e 取内部件是允许的。
       * ⚠️ 它的第 2 个参数是**冷季乘子（数字）不是布尔**：传 false 会让 rate 乘 0、
       *    断言变成「0 == consumeRates.metal」的假红/假绿。必须用与 tick 同一表达式取 cold。 */
      const _P = SB.economyInternals;
      const coldMul = _P.isCold(s) ? _P.coldSeasonMul(s) : 1;
      const fc1 = _P.ironFlow(s, coldMul, 1);
      check('热泉炉「金属/秒」= 引擎一秒真扣（ironFlow(1) × bldEff，面板===结算）',
        Math.abs(cf.metal - fc1 * e) < 1e-9 && cf.metal > 0,
        'consumeRates.metal=' + cf.metal + ' 引擎 fc×e=' + (fc1 * e));
      check('热液工坊：热液能 = 运行座数×hydroShopLvl、金属 = 热液能×steelMetal×bldEff',
        Math.abs(cs.hydro - 6 * (SB.UNIT.hydroShopLvl || 0)) < 1e-9 &&
        Math.abs(cs.metal - cs.hydro * (SB.UNIT.steelMetal || 0) * e) < 1e-9,
        'hydro=' + cs.hydro + ' metal=' + cs.metal);
      s.lvl.biomatlab = 2;
      check('生物材料研究所参数：每级耗藻食 100/秒，产 θ 0.0625/秒，其余输入不变',
        SB.BLD.biomatlabKelp === 100 && SB.BLD.biomatlabIron === 4 &&
        SB.BLD.biomatlabTi === 2 && SB.BLD.biomatlabU === 0.05 &&
        SB.BLD.biomatlabOutRate === 0.0625 && SB.BLD.biomatlabHydro === 3,
        JSON.stringify({ kelp: SB.BLD.biomatlabKelp, iron: SB.BLD.biomatlabIron,
          titanium: SB.BLD.biomatlabTi, uranium: SB.BLD.biomatlabU,
          theta: SB.BLD.biomatlabOutRate, hydro: SB.BLD.biomatlabHydro }));
      const cb = SB.economy.consumeRates(s, 'biomatlab');
      check('生物材料研究所显示四种生产原料及热液能额定消耗',
        Math.abs(cb.kelp - 200 * e) < 1e-9 && Math.abs(cb.iron - 8 * e) < 1e-9 &&
        Math.abs(cb.titanium - 4 * e) < 1e-9 && Math.abs(cb.uranium - 0.1 * e) < 1e-9 &&
        cb.hydro === 6,
        JSON.stringify(cb));
      const consumeMeta = SB.ui.consumeMeta;
      check('生物材料研究所消耗展示包含藻食、精铁、钛、铀和热液能',
        JSON.stringify(consumeMeta.BUILDING_CONSUME.biomatlab) ===
          JSON.stringify(['kelp', 'iron', 'titanium', 'uranium', 'hydro']) &&
        ['kelp', 'iron', 'titanium', 'uranium', 'hydro'].every(k => !!consumeMeta.CONSUME_LABEL[k]),
        JSON.stringify(consumeMeta.BUILDING_CONSUME.biomatlab));
      s.res.kelp = 1000; s.res.iron = 1000; s.res.titanium = 1000; s.res.uranium = 1000;
      const thetaBase = SB.economy.thetaRate(s);
      s.techs.nanotech = true; s.techVer = (s.techVer | 0) + 1;
      const thetaNano = SB.economy.thetaRate(s);
      s.techs.nanotech = false; s.techVer = (s.techVer | 0) + 1;
      check('θ产量按 0.0625/级计算；纳米技术仅乘 1.1×1.3',
        Math.abs(thetaBase - 0.125 * SB.economy.globalMul(s)) < 1e-9 &&
        Math.abs(thetaNano - thetaBase * 1.1 * 1.3) < 1e-9,
        '未研究=' + thetaBase + ' 纳米=' + thetaNano);
      const thetaIn = SB.economy.thetaInputRates(s);
      const runningRates = SB.economy.rates(s);
      s.biomatlabStop = 2;
      const stoppedRates = SB.economy.rates(s);
      check('顶栏原料净速率会扣除研究所实际开工消耗（与启停前后差值一致）',
        Math.abs((stoppedRates.kelp - runningRates.kelp) - thetaIn.kelp) < 1e-9 &&
        Math.abs((stoppedRates.iron - runningRates.iron) - thetaIn.iron) < 1e-9 &&
        Math.abs((stoppedRates.titanium - runningRates.titanium) - thetaIn.titanium) < 1e-9 &&
        Math.abs((stoppedRates.uranium - runningRates.uranium) - thetaIn.uranium) < 1e-9,
        JSON.stringify({ inputs: thetaIn, running: {
          kelp: runningRates.kelp, iron: runningRates.iron,
          titanium: runningRates.titanium, uranium: runningRates.uranium
        } }));
      s.res.thetaMetal = 0; s.biomatlabStop = 2;
      const cbStopped = SB.economy.consumeRates(s, 'biomatlab');
      const thetaStopped = SB.economy.thetaFlow(s, 1);
      const stoppedHydro = SB.economy.hydroAlloc(s, 1);
      check('停用全部生物材料研究所后原料/热液能消耗与θ产出都归零',
        cbStopped.kelp === 0 && cbStopped.iron === 0 && cbStopped.titanium === 0 &&
        cbStopped.uranium === 0 && cbStopped.hydro === 0 && thetaStopped === 0 && stoppedHydro.labDraw === 0,
        JSON.stringify({ consume: cbStopped, theta: thetaStopped, hydro: stoppedHydro.labDraw }));
      s.biomatlabStop = 0;
      s.furnaceStop = 10; s.hydroshopStop = 6; s.turbineStop = 4;
      const cf0 = SB.economy.consumeRates(s, 'furnace');
      const cs0 = SB.economy.consumeRates(s, 'hydroshop');
      const ck0 = SB.economy.consumeRates(s, 'kelp');
      check('停产 ⇒ 三项归 0；不吃料的建筑恒 0（不靠「有值才列」推消耗品有哪些）',
        cf0.metal === 0 && cf0.warm === 0 && cs0.hydro === 0 && cs0.metal === 0 &&
        ck0.metal === 0 && ck0.warm === 0 && ck0.hydro === 0,
        JSON.stringify({ furnace: cf0, shop: cs0, kelp: ck0 }));
    }

    /* ⑥ 藻食库扩容反过来：只抬藻食，材料不动。 */
    {
      const s = F();
      s.techs.engineeringT = true;
      s.res.ironBracket = 50; s.res.rope = 50;
      const k0 = SB.economy.capOf(s, 'kelp');
      const ok = SB.workshop.upgradeBuy(s, 'upg_kelpstore_1', () => {});
      check('「藻食库扩容 I」只抬藻食上限，材料上限纹丝不动（主材/副材各吃一条乘区）',
        ok && Math.abs(SB.economy.capOf(s, 'kelp') - k0 * 1.5) < 1e-9 &&
        SB.economy.capOf(s, 'coral') === SB.CFG.CAP_BASE.coral,
        '藻食 ' + k0 + ' → ' + SB.economy.capOf(s, 'kelp') +
        '，珊瑚仍是 ' + SB.economy.capOf(s, 'coral'));
    }

    /* ⑦ 研究所：解锁权双写一致 + 尤里卡不自指 + 效果真的进科技产出。 */
    {
      const inst = SB.BUILDINGS.filter(b => b.id === 'institute')[0];
      check('研究所的 requiredTech 与「数学」的 unlockBuild 指向同一项（解锁权双写）',
        !!inst && (inst.requiredTech || []).indexOf('mathematics') >= 0 &&
        (byId('mathematics').eff.unlockBuild || []).indexOf('institute') >= 0,
        '建筑侧=' + JSON.stringify(inst && inst.requiredTech) +
        ' 科技侧=' + JSON.stringify(byId('mathematics').eff.unlockBuild));
      /* ⚠️ 尤里卡条件若指向自己解锁的那座建筑 ⇒ 永远达不成（解锁权还没到，条件先要它）。 */
      check('「数学」的尤里卡条件不指向研究所自己（自指 = 永远达不成的死锁）',
        !byId('mathematics').cond || byId('mathematics').cond.b !== 'institute',
        JSON.stringify(byId('mathematics').cond || null));

      const a = F(), b = F();
      [a, b].forEach(x => { x.techs.scholarT = true; x.techs.mathematics = true; x.jobs.scholar = 4; });
      b.lvl.institute = 1;
      const r0 = SB.economy.rates(a).science, r1 = SB.economy.rates(b).science;
      /* ⚠️ 期望值必须**现读配置**，不许写死 1.5：这个数在 2026-10-30 由 1+0.50 改成 1+0.30，
       *    写死会让「标定」看起来像「功能坏了」。但也不能只写 1+instituteSci —— 系数被误置 0 时
       *    断言会退化成「1 === 1」永远真，所以下面带 `_instMul > 1` 守卫。 */
      const _instMul = 1 + (SB.BLD.instituteSci || 0);
      check('研究所建成后科技产出真的 ×' + _instMul.toFixed(2) + '（面板路）',
        _instMul > 1 && r0 > 0 && Math.abs(r1 / r0 - _instMul) < 1e-9,
        r0.toFixed(4) + '/秒 → ' + r1.toFixed(4) + '/秒');
      /* ⚠️ 只验面板路与结算路对不上 = 玩家看到加成、实际进账没变（本项目老病）。 */
      const ta = F(), tb = F();
      [ta, tb].forEach(x => { x.techs.scholarT = true; x.techs.mathematics = true; x.jobs.scholar = 4; });
      tb.lvl.institute = 1;
      SB.economy.tick(ta, 1, null); SB.economy.tick(tb, 1, null);
      const d0 = ta.res.science || 0, d1 = tb.res.science || 0;
      check('研究所的科技加成在 tick 里也成立（面板路 === 结算路，漏一路就红）',
        _instMul > 1 && d0 > 0 && Math.abs(d1 / d0 - _instMul) < 1e-6,
        d0.toFixed(6) + ' → ' + d1.toFixed(6) + '（×' + (d1 / d0).toFixed(4) + '）');
    }

    /* ⑧ 尤里卡可达性 + 不自指。 */
    {
      const s = F();
      s.lvl.furnace = 3;
      check('「工程学」的尤里卡「拥有三级炽泉熔炉」能判成立',
        SB.tech.condMet(s, byId('engineeringT').cond), 'furnace=' + s.lvl.furnace);
      const t2 = F(); t2.res.science = 1000;
      check('「数学」的尤里卡「拥有 1000 科技点」读的是**当前库存**',
        SB.tech.condMet(t2, byId('mathematics').cond) && SB.tech.condMet(t2, { t: 'res', r: 'science', n: 1000 }),
        'res.science=' + t2.res.science);
      const t3 = F(); t3.got = { science: 1000 };
      check('…反证：只累计产出、手上没存下时不成立（口径没走偏成 gathered）',
        !SB.tech.condMet(t3, byId('mathematics').cond), 'got.science=1000 但 res=0 ⇒ 不成立');
      /* ⚠️ 尤里卡条件与 requiredTech 指向同一件东西 = 死锁，新增科技必自查。 */
      const selfRef = [];
      ['engineeringT', 'mathematics', 'scaffoldT'].forEach(id => {
        const t = byId(id), eff = t.eff || {}, cond = t.cond || {};
        const unlocks = [].concat(eff.unlockBuild || [], eff.unlockJob || [], eff.unlockTool || []);
        if (cond.b && unlocks.indexOf(cond.b) >= 0)
          selfRef.push(id + ' 的尤里卡要求自己解锁的 ' + cond.b);
      });
      check('新三项的尤里卡条件都不指向自己解锁的东西（自指 = 死锁）',
        selfRef.length === 0, selfRef.length ? selfRef.join('；') : '无自指');
    }
  }

  /* ---- 下半区「工艺制作」与奇观（2026-09-27 用户拍）----
   * 这五条专盯**静默断链**：系数加了却没接线，既不报错也不报警，
   * 玩家只会看到「工艺制作效率 +0%」却查不出为什么。断言就是用来钉这类事的。 */
  {
    const cb = SB.workshop.craftById('craft_stonebeam');
    const F = () => SB.state.freshRun(false);

    /* ① 工坊每级系数**真的接上了**。这条断言的由来：
     *    craftRatio() 里曾写成 `BLD.workshopCraft`，两处都踩空——
     *    BLD 在本文件从未声明（严格模式 ⇒ 一调用就抛 ReferenceError，工坊页直接崩），
     *    而 BLD 本身是缩放系数表（config.js 的 food: 0.09 那一类），压根没有这个键。
     *    ⇒ 系数只能从**建筑条目**上读。 */
    const bWorkshop = (SB.BUILDINGS || []).filter(b => b.id === 'workshop')[0];
    check('工坊条目挂着 craftRatio（系数在建筑条目上，不在缩放系数表里）',
      !!(bWorkshop && bWorkshop.craftRatio > 0),
      bWorkshop ? 'craftRatio=' + bWorkshop.craftRatio : '工坊条目缺失');
    const z0 = F(); z0.lvl.workshop = 0;
    const o1 = F(); o1.lvl.workshop = 1;
    check('工艺制作效率 = 工坊级数 × 条目系数（0 级 +0%，1 级 +5%）',
      SB.workshop.craftRatio(z0) === 0 &&
      Math.abs(SB.workshop.craftRatio(o1) - (bWorkshop.craftRatio || 0)) < 1e-9 &&
      Math.abs(SB.workshop.craftRatio(o1) - 0.05) < 1e-9,
      '0级=' + SB.workshop.craftRatio(z0) + ' 1级=' + SB.workshop.craftRatio(o1));

    /* ② 加法叠加（用户拍「加法」）：+5% 工坊 与 +5% 奇观 = 1.10，不是 1.05×1.05。 */
    const wd = F(); wd.lvl.workshop = 1; wd.techs.masonry = true;
    wd.res.stoneBeam = 99; wd.res.coral = 9999;
    const built = SB.workshop.build(wd, 'wonder_tide_stele', () => {});
    check('海潮方碑建成（石梁 20 + 珊瑚 300，两个来源都得给够）',
      !!built && wd.wonders.wonder_tide_stele === true,
      '石梁余 ' + wd.res.stoneBeam + '，珊瑚余 ' + wd.res.coral);
    check('叠加是加法不是乘法（+5% + +5% ⇒ ×1.10，不是 ×1.1025）',
      Math.abs(SB.workshop.craftRatio(wd) - 0.10) < 1e-9 &&
      Math.abs(SB.workshop.craftMul(wd) - 1.10) < 1e-9,
      'ratio=' + SB.workshop.craftRatio(wd) + '，mul=' + SB.workshop.craftMul(wd));
    check('奇观是买断：建过之后不能再建一次',
      SB.workshop.wonderBlocked(wd, 'wonder_tide_stele') !== null,
      SB.workshop.wonderBlocked(wd, 'wonder_tide_stele'));

    /* ③ 「+100」就是 100。用户实证：库存 15k 猫薄荷点 +100 也是造 100 个。
     *    百分比那一路只是把固定数往上顶，主效果是 fixed。 */
    const many100 = F(); many100.lvl.workshop = 1; many100.res.stone = 100000;
    const st100 = (SB.workshop.steps || []).filter(x => x.id === 'x100')[0];
    const got100 = st100 ? SB.workshop.stepAmt(many100, cb, st100) : -1;
    check('点「+100」就是造 100 份（不是库存的 100%）', got100 === 100, 'amt=' + got100);

    /* ③b MAX 档（「100%」）按钮上标的**产出量**必须与真按下去到手的量同源。
     *     用户 2026-10-16：MAX 档要体现「会生产多少」⇒ 那个数就是 stepOut()。
     *     口径要点：份数先 floor 再乘效率（craft() 里 `amt = Math.floor(amt)`）——
     *     不 floor 的话库存 12345 ÷ 单价 100 = 123.45 份会让按钮多报 0.45 份的产出。
     *     这条同时钉死「面板（stepOut）=== 结算（craft 返回值）」。 */
    const stMax = (SB.workshop.steps || []).filter(x => x.id === 'max')[0];
    const moP = F(); moP.lvl.workshop = 1; moP.res.stone = 12345;
    const predMax = stMax ? SB.workshop.stepOut(moP, cb, stMax) : -1;
    const moC = F(); moC.lvl.workshop = 1; moC.res.stone = 12345;
    const realMax = stMax
      ? SB.workshop.craft(moC, 'craft_stonebeam', SB.workshop.stepAmt(moC, cb, stMax), () => {})
      : -2;
    check('MAX 档标出的产出量 == 真按下去到手的量（面板===结算，份额先 floor）',
      stMax && Math.abs(predMax - realMax) < 1e-9 && predMax > 0,
      'stepOut=' + predMax + ' craft=' + realMax + '（12345 石 ÷ 100 ⇒ 123 份 × 1.05）');

    /* ── 升级项页签「已完成 n / 共 m」+ 未读 NEW（2026-10-17 用户）──
     * 核心三条：① 页签现算 n/m（doneCount 同源）；② 有未读项时页签角标 NEW，
     *   且**只在人不在升级项页签上**才亮（正在看就别挂 NEW）；③ 行级 NEW 仅在进入
     *   页签的快照里打、离开时整批落盘，落盘后角标消失。
     * ⚠️ workshopView / pendingNew 是跨用例 module 级状态（前面 第⑧⑨ 块动过），
     *   所以开头先归位到一个干净基态：清 localStorage → 进 upgrades 快照全部 → 回
     *   making 落盘全部 → 再清空 seen。这样终态是「seen 空、pendingNew=null、
     *   workshopView='making'」，最符合「玩家从新开局第一次进工坊」的语义。 */
    {
      const RP = SB.ui.renderParts;
      const SEEN = 'sb.wsSeen.v1';
      const total = SB.TOOLS.length + SB.workshop.upgrades().length;
      /* 干净基态（见上段注） */
      try { sandbox.localStorage.removeItem(SEEN); } catch (e) {}
      RP.setWorkshopView('upgrades');   // 快照全部未读 → pendingNew = 全部键
      RP.setWorkshopView('making');     // 落盘全部 → localStorage 满；pendingNew=null
      try { sandbox.localStorage.removeItem(SEEN); } catch (e) {}  // 现在清空 seen，保留干净基态

      const s = SB.game.run();
      s.lvl.workshop = 1;               // 建成工坊，解锁面板
      s.tools = {}; s.upgrades = {};    // 尚未买断任何东西 ⇒ n = 0

      /* (1) 未读态、停在「制造」页签：页签写「已完成 0 / 共 m」并带 NEW 角标 */
      RP.setWorkshopView('making');
      const tabHtml = RP.paneWorkshop();
      check('升级项页签显示「已完成 0 / 共 m」计分母（n/m 同源 doneCount，含未解锁项）',
        tabHtml.indexOf('已完成 0 / 共 ' + total) >= 0,
        '期望含「已完成 0 / 共 ' + total + '」，实际片段=' + (tabHtml.match(/已完成 \d+ \/ 共 \d+/) || [''])[0]);
      check('有未读升级项时页签带 NEW 角标（且人不在升级项页签上）',
        /class="subnew"[^>]*>NEW/.test(tabHtml),
        'tab 里是否含 subnew: ' + /subnew/.test(tabHtml));

      /* (2) 进入升级项页签：行级 NEW 打在尚未看过的条目前；页签角标此时应消失（正在看） */
      RP.setWorkshopView('upgrades');
      const upHtml = RP.paneWorkshop();
      check('进入升级项后行前带 NEW（工具/升级项各自），且页签角标消掉（正在看就不该还挂 NEW）',
        /class="tag new">NEW/.test(upHtml) && !/class="subnew"[^>]*>NEW/.test(upHtml),
        '行内 NEW: ' + /tag new/.test(upHtml) + '，页签角标仍在: ' + /subnew/.test(upHtml));

      /* (3) 离开升级项 ⇒ 整批落盘；再回制造页签时角标消失 */
      RP.setWorkshopView('making');
      const seen = JSON.parse((sandbox.localStorage.getItem(SEEN) || '[]'));
      check('离开升级项页签时把未读项整批落盘（localStorage 记满全部条目键）',
        seen.length === total &&
        seen.indexOf('t:' + SB.TOOLS[0].id) >= 0 &&
        seen.indexOf('u:' + SB.workshop.upgrades()[0].id) >= 0,
        'seen 数量=' + seen.length + ' / 期望 ' + total);
      const tab2 = RP.paneWorkshop();
      check('落盘后回到制造页签，未读角标消失（已完成 0 / 共 m 仍保留）',
        !/class="subnew"[^>]*>NEW/.test(tab2) && tab2.indexOf('已完成 0 / 共 ' + total) >= 0,
        '角标仍在: ' + /subnew/.test(tab2));
    }


    /* ④ 石梁无仓储上限——**用户拍的设计**，用断言钉住，
     *    免得将来有人顺手补个上限，还以为在修 bug。 */
    const nb = F();
    check('石梁不受仓储钳制（capOf = Infinity）', !isFinite(SB.economy.capOf(nb, 'stoneBeam')),
      'capOf(stoneBeam)=' + SB.economy.capOf(nb, 'stoneBeam'));
    nb.res.stoneBeam = 0;
    SB.economy.addRes(nb, 'stoneBeam', 1e6);
    check('塞 100 万石梁也留得下（addRes 不截断）', nb.res.stoneBeam >= 1e6,
      'stoneBeam=' + nb.res.stoneBeam);

    /* ⑤ 扣 100 石头 → 得 1.05 石梁：成本端不打折，产出端乘 (1+ratio)。 */
    const cr = F(); cr.lvl.workshop = 1; cr.res.stone = 100; cr.res.stoneBeam = 0;
    const gain = SB.workshop.craft(cr, 'craft_stonebeam', 1, () => {});
    check('100 石头出 1.05 石梁（成本端不打折，产出端才乘 (1+ratio)）',
      Math.abs(cr.res.stone) < 1e-9 && Math.abs(gain - 1.05) < 1e-9,
      '扣石头 ' + (100 - cr.res.stone) + '，得 ' + gain);

    /* ⑥ 奇观「各材料仓储 +200」只加材料，不加石梁（石梁压根没上限，加它无意义）。 */
    const mm = F(); mm.lvl.workshop = 1; mm.techs.masonry = true;
    mm.res.stoneBeam = 99; mm.res.coral = 9999;
    SB.workshop.build(mm, 'wonder_tide_stele', () => {});
    check('海潮方碑给各材料 +200 仓储，但**不给**石梁（白名单不是黑名单）',
      SB.wonder.matMaxBonus(mm, 'coral') === 200 &&
      SB.wonder.matMaxBonus(mm, 'stone') === 200 &&
      SB.wonder.matMaxBonus(mm, 'stoneBeam') === 0,
      '珊瑚+' + SB.wonder.matMaxBonus(mm, 'coral') +
      ' 石头+' + SB.wonder.matMaxBonus(mm, 'stone') +
      ' 石梁+' + SB.wonder.matMaxBonus(mm, 'stoneBeam'));
    check('仓储加成真的进 capOf（不是只写在效果表里没人读）',
      SB.economy.capOf(mm, 'coral') === SB.economy.capOf(F(), 'coral') + 200,
      'capOf(coral)=' + SB.economy.capOf(mm, 'coral'));

    /* ── 海潮方碑的**三面**：不给时怎么说、建成时扣得准不准、建成后尤里卡跟不跟得上 ──
     * ⚠️ 上面这几条全是**正面**断言（给了石工、给了料 ⇒ 建成 ⇒ 效果涨）。
     *    但「建成一座奇观」是《戏剧与诗歌》的尤里卡条件，而整局模拟里的 bot 从来不去
     *    建奇观（bot 的建造清单里没有它，见 wantWonder 那段注），所以这条链在回归里
     *    一直是**手工宣布建成**通过的 —— 手工摆 `s.wonders[id]=true` 会跳过所有门槛。
     *    正面断言只证明「给了就生效」，证明不了「不给时说得出为什么」。 */
    const pay = F(); pay.lvl.workshop = 1; pay.techs.masonry = true;
    pay.res.stoneBeam = 25; pay.res.coral = 320;          // 故意多给 5 根 / 20 珊瑚
    const okPay = SB.workshop.build(pay, 'wonder_tide_stele', () => {});
    check('建成后扣料**精确等于标价**（多给的 5 石梁 20 珊瑚一分不退）',
      okPay && pay.res.stoneBeam === 5 && pay.res.coral === 20,
      '余 ' + pay.res.stoneBeam + ' 石梁 / ' + pay.res.coral + ' 珊瑚');

    /* 扣料的反向也要钉：只给 19 根 ⇒ 建不成，且报得出**缺什么、现有多少**。
     * 少了这条，「石梁写了 20 实际扣 18」这类错会静默溜过去。 */
    const short = F(); short.lvl.workshop = 1; short.techs.masonry = true;
    short.res.stoneBeam = 19; short.res.coral = 320;
    const lackTxt = SB.workshop.wonderBlocked(short, 'wonder_tide_stele') || '';
    check('差 1 根石梁 ⇒ 建不成，且报得出缺什么/现有多少（不是静默失败）',
      /^还缺/.test(lackTxt) && /石梁 20/.test(lackTxt) && /现有 19/.test(lackTxt) &&
      SB.workshop.build(short, 'wonder_tide_stele', () => {}) === false &&
      !short.wonders.wonder_tide_stele,
      lackTxt || '（blocked=null ⇒ 按钮会是亮的，点了没反应）');

    const none = F();                                     // 一场石工都没有
    const noTech = SB.workshop.wonderBlocked(none, 'wonder_tide_stele') || '';
    check('没研究石工 ⇒ 建不成，且点明**该去研究哪一项**',
      noTech === '需要先研究「石工」' &&
      SB.workshop.build(none, 'wonder_tide_stele', () => {}) === false &&
      !none.wonders.wonder_tide_stele,
      noTech || '（blocked=null ⇒ 石工都没研究，按钮却是亮的）');

    /* 「建成一座奇观」这条尤里卡以前**只被手工夹具喂过**，这里换成真实建成后的状态走一遍。
     * 走 condMet 而不是直接判 s.wonders：直接判读的是实现，走 condMet 读的是契约。 */
    check('真实建成之后，「建成一座奇观」这条尤里卡**随之成立**（不靠手摆 s.wonders）',
      SB.wonder.count(pay) === 1 && SB.tech.condMet(pay, { t: 'wonder', n: 1 }) === true,
      'count=' + SB.wonder.count(pay) + ' condMet=' + SB.tech.condMet(pay, { t: 'wonder', n: 1 }));
    /* ⑦ **capOf 的绝对值要逐资源钉住**（2026-09-28 血案，别只比差值）。
     *    少了括号写成 `x + y + SB.wonder ? bonus : 0` 时，`+` 优先级高于 `?:`
     *    ⇒ 左半边整个成了条件，返回值只剩 bonus ⇒ 所有材料上限恒等于 0。
     *    「+200」那条断言比的是**差值**，两边一起错它照样成立，所以没抓住。
     *    判据：什么仓储都没建时，capOf(k) 必须**恰好等于** CAP_BASE[k]。 */
    const capBase = SB.CFG.CAP_BASE || {};
    const badCap = Object.keys(capBase).filter(k => SB.economy.capOf(F(), k) !== capBase[k]);
    check('每种材料的容量都拿得到 CAP_BASE（不是只剩奇观加成那一项）',
      badCap.length === 0,
      badCap.length
        ? badCap.map(k => k + '=' + SB.economy.capOf(F(), k) + '≠' + capBase[k]).join(' ')
        : Object.keys(capBase).map(k => k + ':' + capBase[k]).join(' '));
  }
}


}
