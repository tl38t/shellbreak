/* 天壳 / SHELLBREAK —— 奇观（2026-09-27 用户拍）
 *
 * ⚠️ 终局「持续机器」原本是破冰祭坛（纪元五、烧地热），2026-10-07 已整体撤除，
 *    改由天穹钻机（wonder）承担「凿穿最后 25% 壳厚」的终章职责（见 shell.js 钻机 block）。
 *  奇观 wonder = 一次性里程碑建筑（买断、永久、不重复），栏位也在别处。
 *
 * 三条纪律（改这个文件前先读）：
 *  ① **买断，不是等级**。建过一次就永久生效，没有重复购买（与工坊上半区的青铜工具同形态）。
 *  ② **效果走加法**（用户 2026-09-27 拍「加法」）。两个 +5% 是 105%，不是 110.25%。
 *     形参照猫国 `js/game.js:4412 getCraftRatio`：`getEffect("craftRatio") + ...` 就是加法。
 *  ③ **只从这两个函数出效果**。别的模块要问奇观的收益，必须调 wonderCraftRatio / matMaxBonus，
 *     不许散读 s.wonders —— 散读的后果是「加了奇观忘了接线」，玩家研究完什么都没发生还查不出。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  function list() { return SB.WONDERS || []; }
  function byId(id) {
    var L = list(), i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;
  }
  var THRONE_GOV = {
    theo_state: { name: '至高圣座', effect: '信仰产出 +10%' },
    egalitarianism: { name: '太空共同体', effect: '工坊工艺效率 +10%' },
    federalism: { name: '国际空间站', effect: '科技产出 +10%' }
  };
  function displayName(s, id) {
    var w = byId(id);
    if (!w) return id;
    if (id === 'wonder_throne' && s && THRONE_GOV[s.gov]) return THRONE_GOV[s.gov].name;
    return w.name;
  }
  function displayDesc(s, id) {
    var w = byId(id);
    if (!w || id !== 'wonder_throne') return w ? w.desc : '';
    var branch = s && THRONE_GOV[s.gov];
    if (!branch) return '空间站有效等级 +3（免费、不收差价）；当前政体未提供额外分支加成。';
    return '空间站有效等级 +3（免费、不收差价）；' + branch.effect + '。';
  }
  function owned(s) { return (s.wonders && typeof s.wonders === 'object') ? s.wonders : {}; }
  function crustplateMineMul(s) { return owned(s).wonder_crustplate ? 1.3 : 1; }
  function terraCoreOwned(s) { return !!owned(s).wonder_terra_core; }

  /* ③ 奇观给市政点的那一截（**每秒绝对量**，不是乘区）。
   *    ⚠️ 为什么是绝对量而不是「市政点 +20%」：市政点总量很小（书手 0.15/人/秒），
   *       乘区的基数会随书手数量漂移 —— 开局 +20% 等于 0，后期 +20% 等于 +3/秒。
   *       里程碑建筑应该给的是「一笔看得见的量」，那就得是常数。
   *    ⚠️ 通道只有这一条：economy.cultureRate 调它，别处不许散读 s.wonders。 */
  function civicBonus(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.civic) || 0;
    }
    return m;
  }

  /* ④ 奇观给「全资源产出」的那一截（加法叠进 economy.globalMul）。
   *    ⚠️ 目前**没有奇观用这个键**（大灯塔按用户规格只给市政点与仓储，不给产出），
   *       但它必须存在：globalMul 是乘区的宿主，若没有出口，将来加一个 globalProd 的
   *       奇观时又会踩到「数据里写了、实现层没读」那类静默断链 —— 现在留一个空函数，
   *       等于把那条通道事先接通，只是暂时没人用。
   *   ⚠️ 与 matMaxBonus 的区别：matMax 是**容量**（加到 capOf 上），这里是**产出率**
   *      （乘在每条产出行上）。两者名字像，落点完全不同，别互相抄。 */
  function globalBonus(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.globalProd) || 0;
    }
    return m;
  }

  /* ① 工艺制作效率来自奇观的那一截（工坊等级那截在 workshop.js 里）。 */
  function wonderCraftRatio(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.craftRatio) || 0;
    }
    return m;
  }
  /* ⑪ 总物流站（wonder_logistics）：王国潮道每级 +1% 工艺制作效率（effect.canalCraft）。
   *   与市政《城市设计》「全国快速物流通道」互锁翻倍：同时拥有该奇观时，本效果 ×2（鲛货两用物流管网）。
   *   读 effect.canalCraft × lvl.canal，与上面各源同加法乘区。 */
  function logisticsCraftRatio(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      var c = (L[i].effect && L[i].effect.canalCraft) || 0;
      if (c) m += c * ((s.lvl && s.lvl.canal) || 0);
    }
    if (m > 0 && o.wonder_national_logistics) m *= 2;  // 与全国快速物流通道互锁翻倍
    return m;
  }

  /* ⑬ 全国快速物流通道（ERA6 · 市政《城市设计》解锁1）：王国潮道每级 +1% 精铁 / 钢产能
   *    （effect.canalCraftIronSteel × lvl.canal，加法乘区；与总物流站的工艺效率同源但落点不同——
   *     那条进 craftMul、这条进 iron/steel 的产出那一段）。
   *    ⚠️ 与总物流站（wonder_logistics）互锁：若同时拥有总物流站，则本效果翻倍
   *        （「鲛货两用物流管网」——总物流站本来只给工艺效率，这里借它的管网把铁钢产能也带起来）。
   *    ⚠️ 落点：economy 的 iron / steel 产出（tick 与 rates 两路都进，保证面板===结算）。
   *        读 effect.canalCraftIronSteel，别在 economy 散读 s.wonders（纪律③）。 */
  function nationalLogisticsMul(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      var c = (L[i].effect && L[i].effect.canalCraftIronSteel) || 0;
      if (c) m += c * ((s.lvl && s.lvl.canal) || 0);
    }
    if (m > 0 && o.wonder_logistics) m *= 2;  // 与总物流站互锁翻倍
    return m;
  }

  /* ② 各**材料**仓储 +200。
   * ⚠️ 只加给材料，不加石梁 —— 石梁是无上限资源（用户拍），给它加 200 是没有意义的操作。
   * ⚠️ 用**白名单**而不是「石梁之外全加」：以后加新资源时白名单会逼着人决定
   *    「新资源吃不吃这个加成」，黑名单则让人默认漏掉。 */
  var MAT_MAX_KEYS = { kelp: 1, coral: 1, stone: 1, silt: 1, warmstone: 1, iron: 1, titanium: 1, thetaMetal: 1 };
  function matMaxBonus(s, k) {
    if (!MAT_MAX_KEYS[k]) return 0;
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.matMax) || 0;
    }
    return m;
  }

  /* 已建成的奇观**数量**（2026-09-28 为尤里卡条件「建成一座奇观」新加）。
   * ⚠️ 统计的是数量而不是条目数 —— s.wonders 的值恒为 1（买断制，见纪律①），
   *    将来若允许同一个奇观重复建成（升星？），这里改成取和也还是对的。
   * ⚠️ 这是 `s.wonders` 除 owned() 之外的第二个读取点，且**只此一处**：
   *    别在 tech.js 或 UI 里散读 s.wonders（纪律③的延伸——散读会让「奇观的效果
   *    只从 wonder.js 出」这条纪律出现第二个例外，下一个人就照着抄了）。 */
  function count(s) {
    var o = owned(s), k, n = 0;
    for (k in o) if (o[k]) n++;
    return n;
  }

  /* 大图书馆送的**图书馆虚级**（2026-09-28 用户规格「效果是图书馆 +3 级，只加效果，
   * 不提高建筑所需材料」）。
   * ⚠️【为什么它不写进 `s.lvl.library`】虚级的语义是「**按效果算、按建筑不算**」：
   *    一旦落进 s.lvl，会被 lvlSum、need 判定、建筑总级数那几条一并读走 —— 玩家会看到
   *    「图书馆还差 1 级就能建下一级，而那一级其实早就白送了」。所以只在这里出，
   *    落到 economy 算科技产出时，与 s.lvl.library **相加**成一个查看用的合计级数。
   * ⚠️ 这是 `s.wonders` 除 owned() / count() 之外的第三个读取点，纪律③的延伸同上。 */
  function libBonus(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.libLvl) || 0;
    }
    return m;
  }

  /* 奇观的一次性奖励（2026-09-28 用户规格 · 大图书馆的「建成时一次性 +1000 科技点」）。
   * ⚠️ 与上面那些**持续效果的区别**：那几个是「每秒都有一份」，这个只在建成那一下结算。
   *    所以它没有对应的资源行，由 workshop.buildWonder 拿到 `s.wonders[id]=true`
   *    之后调一次（买断制 ⇒ 第二次会被 wonderBlocked 拦住 ⇒ 天然只发一次）。
   * ⚠️ 返回的是**待发放的清单**而不是直接扣/加——扣在调用方（与 flow() 那条
   *    「纯读数、副作用在别处」同一条纪律）。没有奖励时返回 null，调用方免判分支。 */
  function oneShot(s) {
    var out = null, i, o = owned(s), L = list(), k;
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      var g = L[i].effect && L[i].effect.grant;
      if (!g) continue;
      out = out || {};
      for (k in g) if (typeof g[k] === 'number') out[k] = (out[k] || 0) + g[k];
    }
    return out;
  }

  /* ⑤ 圣泰坦尼克修道院（2026-09-30 · 市政《王权神授》解锁2）：
   *    每研发完成**一个**市政，信仰产出 +1%。「完成数」= s.civics 里真值条数
   *    （config 注释口径：不是「已揭示」——揭示只发机会，花掉市政点才算完成）。
   *    乘区形态 1 + 0.01×n，economy.faithRate 乘它；同类效果（faithPerCivic）多座加法叠加。 */
  function abbeyFaithMul(s) {
    var m = 0, i, o = owned(s), L = list(), n = 0, k;
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.faithPerCivic) || 0;
    }
    if (m > 0 && s.civics) for (k in s.civics) if (s.civics[k]) n++;
    return 1 + m * n;
  }

  /* ⑥ 大巴扎（2026-09-30 · 市政《职业行会》解锁2）：每名鲛人 +1% 奢侈品**获取**。
   *    乘在贸易供给 S 上（economy 4c 与显示同式），与马具/政体/马镫各来源**独立相乘**。
   *    ⚠️ 只影响奢侈品那一行——它是「获取」不是「全产」，别顺手塞进 globalMul。 */
  function bazaarLuxMul(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.luxPerPop) || 0;
    }
    return 1 + m * (s.pop || 0);
  }

  /* ⑦ ERA4（2026-09-30 用户规格表）· 天壳切削器：科技 / 市政 产出各 +x%，
   *    **x = 天壳观测站等级**（单位是百分点：等级 10 ⇒ +10% ⇒ 乘数 1.10）。
   *    ⚠️ 两个出口同源不同名：科技走 cutterSciMul、市政走 cutterCivicMul，
   *    economy 里 science 行与文化两处**各读一路**；少接一路就是标准的「面板撒谎」。 */
  function cutterMul(s) {
    var o = owned(s), L = list(), i;
    for (i = 0; i < L.length; i++) {
      if (o[L[i].id] && L[i].effect && L[i].effect.cutterMul) {
        return 1 + (s.lvl.observatory || 0) / 100;
      }
    }
    return 1;
  }
  function cutterSciMul(s) { return cutterMul(s); }
  function cutterCivicMul(s) { return cutterMul(s); }

  /* ⑧ 王国大交易所：幸福度 +1（effect.happyBonus）+ **贸易区域**建筑消耗 -10%（effect.tradeSave）。
   *    ⚠️ 两件不同性质的事别合成一个乘数：happyBonus 是平坦加值、tradeSave 是分区减耗，
   *    后者由 economy.costOf 在 zone==='trade' 时读，一般不在这里一次性摊平。 */
  function happyBonus(s) {
    var b = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      b += (L[i].effect && L[i].effect.happyBonus) || 0;
    }
    return b;
  }
  function tradeSaveMul(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.tradeSave) || 0;
    }
    /* ⚠️ Math.max(0, …)：多份减耗叠加时不能把造价乘成负数（负造价 = 白送还倒贴）。 */
    return Math.max(0, 1 - m);
  }

  /* ⑨ 高压热机管道（ERA5 · 2026-10-02）：热液能**供给侧** +x（effect.hydroBonus 求和）。
   *    ⚠️ 与 高压气泵升级的 hydroMul（乘区，只放大汽轮机）是**两件事**：
   *       hydroMul 是「供给 ×(1+0.5)」；这里是「供给 +10 绝对量」—— 加法加到总供给上，
   *       不随汽轮机台数缩放（管道是并联的独立进汽口，不是汽轮机的倍率）。
   *    ⚠️ 读取点只在 economy 的 steelFlow / steelRate 供给侧，别处不散读 effect.hydroBonus。 */
  function hydroWonderMul(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.hydroBonus) || 0;
    }
    return m;
  }

  /* ⑩ 国会大厦（ERA5 · 2026-10-02）：鲛人幸福度消耗 −10%（effect.happyConsume 求和后取 1−）。
   *   与政体 govHappyConsumeMul（乘整段）同乘区，economy.happyBurn 读。多座叠加时 Math.max 防负。 */
  function happyConsumeMul(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.happyConsume) || 0;
    }
    return Math.max(0, 1 - m);
  }

  /* ⑪ 天穹钻机（ERA5 破壳终章，2026-10-02 实装）：
   *   凿壳运行态：幸福度 −1（机器轰鸣）。
   *   天壳打开后：转奇观态，+100 市政点/s + 幸福度 +1。
   *   ⚠️ 这两个量**不能**写进 wonder_skydrill.effect（那样会在破壳前就生效、且不分运行/奇观态），
   *       所以走专属出口；破壳速率/资源消耗在 shell.tickShell ③，这里只出「持续效果」给 economy 读数。
   *   阶段判定必须用持久状态：已结算存档恢复时 broken 会被清掉，但 shellOpened / breakSettled 保留。 */
  function skydrillPostBreak(s) {
    return !!(s && s.shell <= 0 && (s.broken || s.shellOpened || s.breakSettled));
  }
  function skydrillCivic(s) {
    if (owned(s).wonder_skydrill && skydrillPostBreak(s)) return SB.CFG.SKYDRILL_CIVIC;
    return 0;
  }
  function skydrillHappyOffset(s) {
    if (!owned(s).wonder_skydrill) return 0;
    /* 2026-10-07 钻机改手动启动：「运行态 −1」的「运行」从此指 skydrillOn（真在转），
     *   不再是「建成就算」——停着不动的机器不该轰鸣。破壳后仍转奇观态 +1（与开关无关）。 */
    if (skydrillPostBreak(s)) return SB.CFG.SKYDRILL_HAPPY_WONDER;
    return s.skydrillOn ? -SB.CFG.SKYDRILL_HAPPY_RUN : 0;
  }

  /* ⑫ 轮回商店「遗址施工图」折扣：奇观建造成本 ×(1 − 0.05 × wonderBlueprint等级)，最多 −20%。
   *   ⚠️ 显示（render）、扣费（buildWonder）、可建造判定（wonderBlocked 的 lackText）三处必须同源，
   *       否则「面板写省了、扣费没省 / 按钮还能按但实际建不起」这类面板撒谎。 */
  function discountedCost(s, id) {
    var w = byId(id);
    if (!w || !w.cost) return {};
    /* 潮汐之树（2026-10-23）：遗址施工图节点（wonderBlueprint1/2）替代旧 wonderBlueprint；
     *   直接读 s.perk.wonderBlueprint（累积值，每点 −5% 奇观造价，与旧 wonderBlueprintLevel 同口径）。 */
    var lv = (s && s.perk && s.perk.wonderBlueprint) || 0;
    /* ERA9 心胜于物卡（wonderBuildSave：0.3）：奇观建造消耗 −30%（装卡才生效）。
     * 与蓝图折扣（−5%/级）独立相乘，两种减耗不冲突。 */
    var save = (SB.civic && SB.civic.cardWonderBuildSave) ? SB.civic.cardWonderBuildSave(s) : 0;
    /* ERA2-7 扩卡（2026-10-22）：按纪元闸门的奇观减耗（征夫发役 cap3 / 王室特许 cap5，各 −20%）。
     * 仅对该 cap 覆盖纪元内的奇观生效，与 cardWonderBuildSave 相加后统一进 (1 − save)。 */
    var saveEra = (SB.civic && SB.civic.cardWonderBuildSaveEra) ? SB.civic.cardWonderBuildSaveEra(s, w.era) : 0;
    var mul = Math.max(0, 1 - 0.05 * lv) * Math.max(0, 1 - save - saveEra);
    var cost = SB.economy && SB.economy.scaffoldAdjustedCost
      ? SB.economy.scaffoldAdjustedCost(s, w.cost) : w.cost;
    var out = {}, k;
    for (k in cost) out[k] = Math.ceil(cost[k] * mul);
    return out;
  }

  /* ⑭ ERA7（2026-10-17 · spec §4 摇篮）：矿线全产出 +20%（effect.mineMul，加法叠进矿工各产出行）。
   *   ⚠️ 与砂矿坑 per-level、鱼骨矿井、阿尔巴达热液大学的人口乘区是**独立乘区**：
   *       落点是 economy 矿工那几条 addRes（金属 silt / 伴生暖石 / 铀 / 钛），逐条 ×(1+mineMul)。
   *   ⚠️ 通道只有这一条：economy 读 wonder.mineMul，别在矿工行散读 s.wonders（纪律③）。 */
  function mineMul(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.mineMul) || 0;
    }
    return 1 + m;
  }

  /* ⑮ ERA7（spec §4 至高圣座）：空间站**有效等级 +3**（effect.stationBonus，免费、不收差价）。
   *   ⚠️ 只加在「效应读数」上（starRate / hydroAlloc stationDraw），**不**进 costOf / lvlSum：
   *       你不需要为这 3 级付钱，但空间站该给的星空加成与耗流照给。与图书馆虚级（libBonus）同构——
   *       「按效果算、按建筑不算」。 */
  function stationBonus(s) {
    var b = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      b += (L[i].effect && L[i].effect.stationBonus) || 0;
    }
    return b;
  }

  /* ⑰ ERA7（spec §4 博洛西洛漂浮发射场）：载人火箭工艺效率 +100%（effect.mannedRocket 加法，乘区 ×2）。
   *   ⚠️ 只应用于载人火箭工艺（craft_rocketengine），不进全局 craftMul 基值——
   *       否则会顺手放大所有工艺制品，把「火箭工艺 ×2」曲解成「全工艺 ×2」。
   *   ⚠️ 通道只有这一条：workshop.craftMul(s,c) 在 c.id==='craft_rocketengine' 时读它，别处不散读。 */
  function mannedRocketMul(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.mannedRocket) || 0;
    }
    return 1 + m;
  }

  /* ⑯ ERA7（spec §4 至高圣座 · 政体分支效果）：拥有时按 s.gov 三目给一项 +10%
   *   · theo_state      → 信仰产出 +10%（throneFaithMul，economy.faithRate 乘区）
   *   · egalitarianism  → 工艺效率 +10%（throneCraftMul，workshop.craftMul 乘区）
   *   · federalism      → 科技产出 +10%（throneSciMul，economy 科技行乘区）
   *   三项是**互斥分支**（一个政体只命中一条），与 cutterSci/Civic 那种「同值双出口」不同。 */
  function throneGovHit(s, target) {
    var o = owned(s);
    if (!o.wonder_throne) return 1;
    if (s.gov === target) return 1.10;
    return 1;
  }
  function throneFaithMul(s) { return throneGovHit(s, 'theo_state'); }
  function throneCraftMul(s) { return throneGovHit(s, 'egalitarianism'); }
  function throneSciMul(s) { return throneGovHit(s, 'federalism'); }

  /* ⑱ ERA8（2026-10-18 · spec §4 旅行者1号）：星空进度**两档**条件效果。
   *   未满 25% ⇒ +100 星空探索/秒（追赶档）；≥25% ⇒ +25/秒（巡航档）且学者产出 ×1.10。
   *   ⚠️ 不能写成 effect 静态键（建成时就得定档）——同天穹钻机 skydrillPostBreak 的
   *      「条件效果走专属出口」模式。阈值/两档数值在 CFG.VOYAGER_*（数值只改 config.js）。
   *   ⚠️ 进度 = 存量 / STAR_CAP（破壳前存量恒 0 ⇒ 未满档），不做插值：两档是用户规格原话。
   *   ⚠️ 落点：economy.starRate（星空速率）与 tick/rates 学者行（ScholarMul），各接一路；
   *       漏一路就是「面板撒谎」。 */
  function voyagerPct(s) {
    var cap = SB.CFG.STAR_CAP || 0;
    return cap > 0 ? (s.res && s.res.starExplore || 0) / cap : 1;
  }
  function voyagerStarRate(s) {
    if (!owned(s).wonder_voyager) return 0;
    return voyagerPct(s) < (SB.CFG.VOYAGER_PCT || 0.25)
      ? (SB.CFG.VOYAGER_STAR_FULL || 100)
      : (SB.CFG.VOYAGER_STAR_AFTER || 25);
  }
  function voyagerScholarMul(s) {
    if (!owned(s).wonder_voyager) return 1;
    return voyagerPct(s) >= (SB.CFG.VOYAGER_PCT || 0.25) ? 1 + (SB.CFG.VOYAGER_SCHOLAR || 0) : 1;
  }

  /* ⑲ ERA8（spec §4 萨图恩巨星气行星轨道采集站）：三个**绝对量**出口。
   *   hydroBonus 走既有 hydroWonderMul（供给侧，与高压热机管道同一通道，无需新函数）；
   *   fuelBonus / starBonus 是新键 ⇒ 新出口，economy 燃料行 / starRate 各接一路。
   *   ⚠️ 与 civicBonus 同款「每秒绝对量、不是乘区」口径——奇观给「一笔看得见的量」。 */
  function wonderFuelBonus(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.fuelBonus) || 0;
    }
    return m;
  }
  function wonderStarFlat(s) {
    var m = 0, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.starBonus) || 0;
    }
    return m;
  }

  /* ⑳ ERA8 市政奇观（2026-10-18 · 用户市政表）：哈'利法宇宙望远镜——与旅行者1号同构的两档条件效果，
   *   **独立叠加**（同进度两座满档 = +50/s；未满档两座 = +200/s，用户确认这是设计意图）。
   *   学者 +10% 挂满档（与旅行者文案同构：「已满时+25星空探索，且书手产出+10%」）。
   *   阈值/数值在 CFG.KHALIFA_*；economy.starRate 与 tick/rates 学者行各接一路。 */
  function khalifaStarRate(s) {
    if (!owned(s).wonder_khalifa) return 0;
    return voyagerPct(s) < (SB.CFG.KHALIFA_PCT || 0.25)
      ? (SB.CFG.KHALIFA_STAR_FULL || 100)
      : (SB.CFG.KHALIFA_STAR_AFTER || 25);
  }
  function khalifaScholarMul(s) {
    if (!owned(s).wonder_khalifa) return 1;
    return voyagerPct(s) >= (SB.CFG.KHALIFA_PCT || 0.25) ? 1 + (SB.CFG.KHALIFA_SCHOLAR || 0) : 1;
  }

  /* ㉑ ERA8 市政奇观：魔鱼世界VR——运转持续耗热液能（用户拍 H1=C：流量资源不能当库存造价，
   *   改为「建成 + 每秒持续耗 5」）。与空间站「断流只停耗、加成仍在」同口径：断流只停耗、幸福 +1 仍在
   *   （effect.happyBonus 走既有通道，与流解耦）。economy.hydroAlloc 的 vrDraw 读。 */
  function fishvrHydroDraw(s) {
    return owned(s).wonder_fishvr ? (SB.CFG.FISHVR_HYDRO || 0) : 0;
  }
  /* ERA10（2026-10-20 · 用户 ERA10 表「引力弹弓」解锁）：朱庇特质量加速站两个读数。
   * ① jupitorHydroDraw —— 运转耗 20 热液能/秒（hydroAlloc 的 jupitorDraw 调它，最低优先级）。
   * ② wonderBiomatlabOut —— 生物材料研究所产出乘区（默认 1；建成 = ×2）。
   *    ⚠️ 与纳米技术的 biomatlabOut（tech.mul 轴，×1.10）**独立相乘**，不进同一个轴——
   *       科技轴在 tech.js 的 mul() 默认表里，奇观轴在这里，两条各乘各的（合计 ×2.10）。
   *    ⚠️ economy.thetaOut 读它；漏接 = 奇观建成纹丝不动（「数据落了没人读」家族）。 */
  function jupitorHydroDraw(s) {
    return owned(s).wonder_jupitor_mas ? (SB.CFG.JUPITOR_HYDRO || 0) : 0;
  }
  function wonderBiomatlabOut(s) {
    var m = 1, i, o = owned(s), L = list();
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      var e = L[i].effect;
      if (e && typeof e.biomatlabOut === 'number') m *= 1 + e.biomatlabOut;
    }
    return m;
  }

  SB.wonder = {
    list: list, byId: byId, owned: owned, count: count,
    displayName: displayName, displayDesc: displayDesc,
    wonderCraftRatio: wonderCraftRatio, matMaxBonus: matMaxBonus,
    logisticsCraftRatio: logisticsCraftRatio, nationalLogisticsMul: nationalLogisticsMul,
    civicBonus: civicBonus, globalBonus: globalBonus,
    libBonus: libBonus, oneShot: oneShot,
    abbeyFaithMul: abbeyFaithMul, bazaarLuxMul: bazaarLuxMul,
    cutterSciMul: cutterSciMul, cutterCivicMul: cutterCivicMul,
    happyBonus: happyBonus, tradeSaveMul: tradeSaveMul,
    hydroWonderMul: hydroWonderMul, happyConsumeMul: happyConsumeMul,
    /* ERA10（2026-10-20）：朱庇特质量加速站两读数（耗流 + biomatlabOut 乘区）。 */
    jupitorHydroDraw: jupitorHydroDraw, wonderBiomatlabOut: wonderBiomatlabOut,
    skydrillPostBreak: skydrillPostBreak,
    skydrillCivic: skydrillCivic, skydrillHappyOffset: skydrillHappyOffset,
    discountedCost: discountedCost,
    mineMul: mineMul, stationBonus: stationBonus, mannedRocketMul: mannedRocketMul,
    throneFaithMul: throneFaithMul, throneCraftMul: throneCraftMul, throneSciMul: throneSciMul,
    voyagerStarRate: voyagerStarRate, voyagerScholarMul: voyagerScholarMul,
    wonderFuelBonus: wonderFuelBonus, wonderStarFlat: wonderStarFlat,
    khalifaStarRate: khalifaStarRate, khalifaScholarMul: khalifaScholarMul,
    fishvrHydroDraw: fishvrHydroDraw,
    crustplateMineMul: crustplateMineMul, terraCoreOwned: terraCoreOwned
  };
})(typeof window !== 'undefined' ? window : globalThis);
