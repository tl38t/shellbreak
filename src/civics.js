/* 天壳 / SHELLBREAK — 市政（Civics）
 *
 * 兑现的是一条旧欠账：techs.js 的「石工」与 config.js 的「议事厅」都写过
 * 「议事厅（开启市政树）」，而本作此前根本没有市政系统（2026-09-27 补上）。
 *
 * ── 三条机制的口径（用户 2026-09-27 拍板，原文见 docs/CIVICS_v0.1.md §8.0）──
 *
 * 1. 市政点（culture）是**独立资源**，与科技两个池子 ⇒ 两条树可以错峰冲刺。
 *    来源双路：书手职业（主）+ 议事厅等级（少量）。
 * 2. 鼓舞（boost）= **揭示**，不是解锁。原话：「没有触发鼓舞之前就是『未揭露的市政』，
 *    触发之后才会显示，然后才能投入市政点。」
 *    ⇒ 揭示只打开「可以投点」这扇门，100 点的定价完好。
 *    ⚠️  Civ6 的鼓舞还返一笔文化（一次性），本作**不返**——用户口径是
 *       「只揭示、不填充 50%」，返一笔就是小号填充。要加请重新拍板，这不是遗漏。
 * 3. 政体 / 政策卡。**调整**东西要收费：卸下政策卡、重复采用政体均为当前最高已完成市政
 *    研究成本的 1/5。首次装填免费；每个政体首次采用也免费（避免对解锁动作重复收费）。
 *
 * ── 结构上的三条取舍（结构归我定，数值归用户）──
 *
 * · 槽位：酋邦制给 1 个政策卡槽（用户「就降到 1 吧」）。Era1 有多张政策卡 ⇒
 *   必须有取舍，换卡收费才不是收了个寂寞。
 * · 树形：《法典》无 cost、无鼓舞，是根；《技艺》《神秘主义》《乡镇集会》都以它为前置，
 *   「珊瑚培育」挂在《技艺》下。新增支线不作为后续市政的前置，避免锁住主树。
 * · 政体：酋邦制（法典自带）+ 独裁/寡头/古典共和（由《政治哲学》解锁，三选一采用）。
 *   换政体机制（统一 1/5 收费、越权拦截、槽位配方）已落地，三种新政体立即生效，无需返工。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  var civicData = SB.civicData || {};
  var CIVICS = civicData.CIVICS || [];
  var SLOT_TYPES = civicData.SLOT_TYPES || {};
  var GOVS = civicData.GOVS || [];
  var POLICIES = civicData.POLICIES || [];

  function byId(id) { for (var i = 0; i < CIVICS.length; i++) if (CIVICS[i].id === id) return CIVICS[i]; return null; }
  function govById(id) { for (var i = 0; i < GOVS.length; i++) if (GOVS[i].id === id) return GOVS[i]; return null; }
  function policyById(id) { for (var i = 0; i < POLICIES.length; i++) if (POLICIES[i].id === id) return POLICIES[i]; return null; }

  /* 政策卡的**乘区出口**：《戏剧与诗歌》《神学》《历史记录》的「效果 +100%」都走这里。
   * ⚠️【为什么乘区不进 `effect`】effect 走的是 flow() 那条「平坦加值/秒」通道，
   *    「效果 +100%」是**乘区**，塞进去会变成「每秒多给 ×2」——把「建筑变强」
   *    曲解成「凭空产两份」，完全不是一回事。⇒ 乘区挂在卡自己的字段上，由这里单独取。
   * ⚠️ 只认「装在槽位里」这一条路——研究出市政只是**拿到**这张卡，没装上等于没选它。
   *    这与 flow() 那条「卡只在装着时才生效」是同一条纪律，别在这儿放宽。
   *    副作用：拔下卡 ⇒ 返回 1（乘区消失），这是对的，不是漏判。
   * ⚠️ 返回 1 表示没装 ⇒ 调用方直接相乘，不用判分支。 */
  /* ⚠️⚠️【踩过的坑：乘区字段是按**建筑**分的，但「装没装卡」要看状态】
   *    早期版本写成 `policyMul(s, 'card_drama', 'squareMul')`，把卡 id 写死在参数里
   *    ⇒ 不看槽里装的是誰 ⇒ 恒返回那张卡的乘区值。症状是四条断言同时红：
   *    「没装卡时 squareMul = 1」拿到 2、「装卡 ×2」的比值变成 1（3.3 → 3.3）、
   *    「拔下」不回到 1、以及 cultureRate 被凭空顶到 1.1（0.45×2 + 0.2）。
   *    ⚠️ 关键在于两件事必须分开：*哪张卡*来自状态，*取哪个字段*由卡决定。
   *        所以先从状态拿到卡 id，再用卡 id 去查它该看哪个字段（下面那张表）。
   *        写成「按建筑查字段、拿卡片 id 当参数」是这条的镜像错误，同样会错。
   * ⚠️⚠️【「状态」指的是 s.cards 数组，不是 s.card】（2026-10-14 更正）
   *    2026-09-29 多槽升维后 s.card 降级为**第 0 号槽镜像**（见 ensureCards 那条注释），
   *    它**看不见装在 1 号及以后槽里的卡**。若照着本段注释的老措辞去读 s.card，
   *    玩家把卡装到 2 号槽时会得到「这张卡没装」⇒ 卡白装、效果为 0、还不报错。
   *    ⇒ **禁止新增任何读 s.card 的效果逻辑**。判断装没装一律走 `cardSlotted(s,id)`
   *      （= s.cards.indexOf），取乘区一律走下面 `mulOfField`（逐槽遍历 s.cards）。
   *      现存五条效果出口（mulOfField / cardCraftRatio / cardSlotted / flow / 退役清槽）
   *      已全部走数组，本次实测无遗漏读者。 */
  var MUL_FIELD = {
    card_drama: 'squareMul', card_theology: 'templeMul', card_records: 'libraryMul',
    /* 仓储容量链：中世纪集市 ×2 → 基础物流建设 ×3 → 洲际物流 ×5。 */
    card_market: 'storeMul', card_logistics: 'storeMul', card_interlog: 'storeMul',
    /* 启蒙运动（2026-10-01 ERA4）：潮纹馆科技 +100%，与《历史记录》同字段（卡退役后不冲突）。 */
    card_enlightenment: 'libraryMul',
    /* ERA7（2026-10 实装）：神不在此卡——潮纹馆科技 ×3（替代启蒙运动的 ×2，启蒙退役后不冲突）。 */
    card_no_god_here: 'libraryMul',
    /* ERA5（2026-10-02）：政治经济学卡——歌剧院的官员市政点乘区 ×2.5（theaterMul）。 */
    card_political_econ: 'theaterMul',
    /* ERA9（2026-10-20）：联邦枢密院卡**同时**给两个乘区（广场市政 ×4 + 歌剧院官员市政 ×4）。
     * ⚠️ 这是本表唯一一张「一卡两乘区」的卡：原表强制一卡一字段（见 mulOfField 上方注：
     *   「squareMul 只乘带 squareMul 字段的卡」），单字段会让其中一个乘区**静默为 1**。
     *   故值允许数组，mulOfField 按请求的 field 逐项匹配，两区各自独立相乘互不串扰。 */
    card_federal_privy: ['squareMul', 'theaterMul']
  };
  function policyMul(s, cardId) {
    if (!cardId) return 1;                       // 槽是空的（或还没这一项）⇒ 没有乘区
    var cd = policyById(cardId);
    if (!cd) return 1;                           // 装了一张不存在的卡：当没有，别让 NaN 往下走
    var f = MUL_FIELD[cardId];
    if (!f) return 1;
    /* 与 mulOfField 同构：值可为单字段或字段数组（ERA9 联邦枢密院一卡两乘区）。
     * 单卡语义下取第一个真正有数值的字段（缺失该字段的卡退化成 1，不产生 NaN）。 */
    var fl = (typeof f === 'string') ? [f] : f;
    for (var i = 0; i < fl.length; i++)
      if (typeof cd[fl[i]] === 'number') return cd[fl[i]];
    return 1;
  }
  /* 三个乘区出口各自**只认自己字段的那张卡**：squareMul 只乘带 squareMul 字段的卡，
   * 不碰别人槽里带 libraryMul / templeMul 的卡。否则装《戏剧与诗歌》+《历史记录》两张，
   * squareMul 会把《历史记录》的 ×2 也乘进来（症状：squareMul=4 而不是 2）。
   * ⚠️ 多个槽 ⇒ 同字段的卡**逐槽相乘**（理论上可装多张广场卡，乘区叠加），空槽/没装 = 1。 */
  function mulOfField(s, field) {
    var arr = (s && s.cards) || [], m = 1, id, cd;
    for (var i = 0; i < arr.length; i++) {
      id = arr[i]; if (!id) continue;
      var _f = MUL_FIELD[id];
      if (!_f) continue;
      /* 一卡可带多个乘区字段（ERA9 联邦枢密院：squareMul + theaterMul）。
       * 值是字符串还是数组都要认：只有请求的 field 命中才乘，两区不互相串。 */
      var _fl = (typeof _f === 'string') ? [_f] : _f;
      if (_fl.indexOf(field) >= 0) {
        cd = policyById(id);
        if (cd && typeof cd[field] === 'number') m *= cd[field];
      }
    }
    return m;
  }
  function squareMul(s)  { return mulOfField(s, 'squareMul'); }
  function templeMul(s)  { return mulOfField(s, 'templeMul'); }
  function libraryMul(s) { return mulOfField(s, 'libraryMul'); }
  function theaterMul(s) { return mulOfField(s, 'theaterMul'); }
  /* 仓储区容量乘区（2026-09-30 · 中世纪集市卡）：capOf 的海藻仓/压舱仓/灯塔三段读它。
   * 没装卡 = 1；装了 = 各槽的 storeMul 逐槽相乘（与上面三个同构，可多张叠加）。 */
  function storeMul(s)   { return mulOfField(s, 'storeMul'); }

  /* ── 三条「动态」政策卡乘区（2026-09-30 ERA3）──────────────────
   * 与 mulOfField 那批的区别：效果值随**建筑等级/状态**变，静态字段表达不了，
   * 所以各自一个函数，判「装没装」用 inSlot（s.cards 数组逐槽查，与 flow 同口径）。
   * ⚠️ 只在卡装着时才生效——研究出市政只是拿到卡，没装 = 恒 1，别在这儿放宽。 */
  function cardSlotted(s, id) { return !!(s && s.cards && s.cards.indexOf(id) >= 0); }
  /* 王权神授：城堡每级 +10% 信仰产出。乘在 faithRate 的整段产出上（economy 读）。
   * ⚠️ 2026-10-06 城堡「真升级」：城堡**不是独立建筑**，而是议事厅买下工坊升级
   *   `upg_castle` 之后的新名字 ⇒ 这里的「城堡等级」就是 `s.lvl.hall`（经济层的
   *   `coreLvl` 同源）。此前误读成独立的 `s.lvl.castle`，那座建筑已从 BUILDINGS 删除。 */
  function castleFaithMul(s) {
    if (!cardSlotted(s, 'card_sovereign')) return 1;
    var r = (SB.BLD && SB.BLD.castleFaithRatio) || 0.10;
    return 1 + (SB.economy && SB.economy.coreLvl ? SB.economy.coreLvl(s) : (s.lvl.hall || 0)) * r;
  }
  /* 农奴制：每级牧场（深海鱼牧场）给藻场效果 ×(1+1%)；每级藻场给牧场效果 ×(1+1%)。
   * 藻场效果 = foodRate 建筑侧（economy.foodRate 读 serfKelpMul）；
   * 牧场效果 = 口粮减免 foodSave（economy.foodUse 读 serfWarmMul，减免封顶 100% 不变）。 */
  function serfKelpMul(s) {
    if (!cardSlotted(s, 'card_serfdom')) return 1;
    var r = (SB.BLD && SB.BLD.serfCrossRatio) || 0.01;
    return 1 + (s.lvl.warmnest || 0) * r;
  }
  function serfWarmMul(s) {
    if (!cardSlotted(s, 'card_serfdom')) return 1;
    var r = (SB.BLD && SB.BLD.serfCrossRatio) || 0.01;
    return 1 + (s.lvl.kelp || 0) * r;
  }

  /* ── ERA4（2026-10-01 用户设计稿）· 各动态效果读数 ──
   * 统一纪律：只读 s.cards / s.gov / s.civics，没装/没采用 = 返回基准值（1 或 0），绝不污染产线。
   * 与 castleFaithMul / serfKelpMul 同构。 */
  /* 商人共和国：幸福度消耗 −30%（happyConsumeMul 0.7）。economy.happyBurn 读。 */
  function govHappyConsumeMul(s) {
    var g = govById(s.gov);
    return (g && typeof g.happyConsumeMul === 'number') ? g.happyConsumeMul : 1;
  }
  /* 三角贸易卡：王国潮道（运河）奢侈消耗减免额外 +100%。economy 的 _canalSave 段读。 */
  function canalSaveMul(s) {
    if (!cardSlotted(s, 'card_triangular')) return 1;
    var cd = policyById('card_triangular');
    return (cd && typeof cd.canalMul === 'number') ? cd.canalMul : 1;
  }
  /* 重商主义卡：银行商人产出加成 +100%。economy.bankMul 读（乘在 bankLux 那一段上）。 */
  /* 重商主义卡 / 跨国经济卡：银行的商人产出加成（bankMerchantMul 字段）。2026-10 ERA7：改为通用逐槽相乘，
   * 使《跨国经济》（card_transnational，×4）在《重商主义》退役后无缝上位（同一字段、互斥装填）。 */
  function bankMerchantMul(s) { return cardFieldMul(s, 'bankMerchantMul'); }
  /* 礁栖核心建筑每级 +N% 信仰产出（coreFaithMul 存的是每级比率）。
   * 乘在 faithRate 整段上，coreLevels = 礁栖核心分区建筑合计等级。
   * ⚠️ 2026-10-22 泛化：原硬编码只认 card_divine_right（天赋神权 0.10/级）。
   *   现扫所有装着的政策卡、累加其 coreFaithMul 字段（与 cardFieldMul 同口径），
   *   使《修道院》(0.05/级，ERA2-7 扩卡) 可与《天赋神权》(0.10/级) 叠加。
   *   没装任何带该字段的卡 ⇒ ratio=0 ⇒ 返回 1，原 card_divine_right 行为完全保留。 */
  function coreFaithMul(s) {
    if (!SB.BUILDINGS) return 1;
    var lv = 0, _i;
    for (_i = 0; _i < SB.BUILDINGS.length; _i++)
      if (SB.BUILDINGS[_i].zone === 'core') lv += (s.lvl[SB.BUILDINGS[_i].id] || 0);
    var ratio = 0, arr = (s && s.cards) || [], _j, cd;
    for (_j = 0; _j < arr.length; _j++) {
      if (!arr[_j]) continue;
      cd = policyById(arr[_j]);
      if (cd && typeof cd.coreFaithMul === 'number') ratio += cd.coreFaithMul;
    }
    if (ratio === 0) return 1;
    return 1 + lv * ratio;
  }
  /* 大学（研究所）科技乘区（universityMul 字段）。2026-10 ERA7：改为通用逐槽相乘，
   * 使《神不在此》（card_no_god_here，×3）在《启蒙运动》（×2）退役后无缝上位。 */
  function universityMul(s) { return cardFieldMul(s, 'universityMul'); }
  /* 神庙信仰乘区（templeFaithMul 字段）。2026-10 ERA7：改为通用逐槽相乘，
   * 使《神不在此》（×0.5）/《未来主义神学》（×5）在《启蒙运动》退役后无缝上位。
   * ⚠️ 与 MUL_FIELD 的 templeMul（卡《神学》×2）是**两个独立乘区**，economy 里两者相乘。 */
  function templeFaithMul(s) { return cardFieldMul(s, 'templeFaithMul'); }
  /* 博物馆建筑：官员（书手）市政点产出 +20%/级（museumCivicMul）。economy.cultureRate 的 scribe 段读。
   * ERA6：① 博物学完成后，艺术品效果随轮回 +10%/cycle（落点同为博物馆的市政加成，语义=博物馆即艺术展示口）；
   *   ② 博物馆管理卡装着时 effect.museumMul(2) 让博物馆效果翻倍。两者乘法叠加。 */
  function museumCivicMul(s) {
    var museumLv = (s.lvl && s.lvl.museum) || 0;
    var museumRatio = (SB.BLD && SB.BLD.museumCivRatio) || 0.20;
    var m = 1 + museumLv * museumRatio;
    if (s.civics && s.civics.naturalhistory) {
      var _cyc = (SB.game && SB.game.meta) ? (SB.game.meta().cycle || 0) : 0;
      m *= (1 + 0.10 * _cyc);
    }
    if (cardSlotted(s, 'card_museum')) {
      var cd = policyById('card_museum');
      m *= (cd && typeof cd.museumMul === 'number') ? cd.museumMul : 1;
    }
    return m;
  }
  /* 行政部门：书手（官员）市政点产出 +50%（scribeCivicMul，flat，叠加在 museum 之上）。 */
  function scribeCivicMul(s) {
    var c = byId('department');
    return (c && s.civics && s.civics.department && typeof c.scribeCivicMul === 'number')
      ? 1 + c.scribeCivicMul : 1;
  }
  /* 歌剧院建筑：官员（书手）市政点产出 +15%/级（theaterCivRatio）。只裹书手那一截，
   * 与 museumCivicMul/scribeCivicMul 同型的括号纪律。再乘政策卡《政治经济学》的歌剧院乘区
   * （theaterMul，MUL_FIELD 表），与广场 squareMul 同构。没建歌剧院 = 1（不污染产线）。 */
  function theaterCivicMul(s) {
    return (1 + (s.lvl.theater || 0) * ((SB.BLD && SB.BLD.theaterCivRatio) || 0))
      * ((SB.civic && SB.civic.theaterMul) ? SB.civic.theaterMul(s) : 1);
  }
  /* ── ERA5（2026-10-02 实装）· 政策卡对产线的动态乘区/偏移 ──
   * 统一纪律：只读 s.cards，没装 = 返回基准值（1），绝不污染产线（与 castleFaithMul 同构）。
   * cardCivicOutMul / cardSciOutMul：热能优先卡把市政/科技产出 ×0.5（civicOutMul/sciOutMul 字段）。
   * cardHydroMul：热能优先卡把热液能供给 ×2（hydroSupplyMul 字段）。
   * cardHappyOffset：工业化配给卡幸福度 −1（happyOffset 字段，求和进恒温器 _gb 基线）。 */
  function cardFieldMul(s, field) {
    var m = 1, arr = (s && s.cards) || [], i, cd;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (cd && typeof cd[field] === 'number') m *= cd[field];
    }
    return m;
  }
  /* 通用**求和**版（2026-10 ERA7）：同一字段多张卡相加（如奢侈消耗加成、人口建筑上限加成、
   * 太空建造减免）。与 cardFieldMul 同口径：只认装在槽里的卡（逐槽扫 s.cards）。返回 0 = 无任何卡。 */
  function cardFieldSum(s, field) {
    var m = 0, arr = (s && s.cards) || [], i, cd;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (cd && typeof cd[field] === 'number') m += cd[field];
    }
    return m;
  }
  function cardCivicOutMul(s) { return cardFieldMul(s, 'civicOutMul'); }
  function cardSciOutMul(s)   { return cardFieldMul(s, 'sciOutMul'); }
  function cardHydroMul(s)    { return cardFieldMul(s, 'hydroSupplyMul'); }
  function cardHappyOffsetFor(s, id) {
    if (!id || !cardSlotted(s, id)) return 0;
    var cd = policyById(id);
    return cd && typeof cd.happyOffset === 'number' ? cd.happyOffset : 0;
  }
  function cardHappyOffset(s) {
    var o = 0, arr = (s && s.cards) || [], i;
    for (i = 0; i < arr.length; i++) o += cardHappyOffsetFor(s, arr[i]);
    return o;
  }
  /* 神权政体：每级学术区建筑 +1 信仰、每级市政区建筑 +0.5 信仰（加在人口基础产出之上）。
   * 仅当采用神权政体时生效。返回**绝对量**（与 FAITH_PER_POP 同单位，信仰/秒）。 */
  function theoFaithBonus(s) {
    var g = govById(s.gov);
    if (!g || typeof g.faithPerAcademy !== 'number') return 0;
    var a = 0, cv = 0, _i;
    if (SB.BUILDINGS) for (_i = 0; _i < SB.BUILDINGS.length; _i++) {
      var _z = SB.BUILDINGS[_i].zone;
      if (_z === 'academy') a += (s.lvl[SB.BUILDINGS[_i].id] || 0);
      else if (_z === 'civic') cv += (s.lvl[SB.BUILDINGS[_i].id] || 0);
    }
    return a * g.faithPerAcademy + cv * (g.faithPerCivic || 0);
  }

  /* ── ERA6（2026-10-12 实装）· 各动态效果读数 ──
   * 统一纪律：只读 s.cards / s.gov / s.civics，没装/没采用 = 返回基准值，绝不污染产线。 */

  /* 大众传媒卡：每名鲛人 +0.5 市政点/秒（绝对量，加在 cultureRate 末尾）。economy.cultureRate 读。 */
  function civicPerPop(s) {
    if (!cardSlotted(s, 'card_massmedia')) return 0;
    var cd = policyById('card_massmedia');
    var per = (cd && typeof cd.civicPerPop === 'number') ? cd.civicPerPop : 0;
    return per * (s.pop || 0);
  }
  /* 奢侈消耗加成（luxConsumeMul 字段）求和：公摊面积 +100%、延长工时 +30%、大众传媒 +50% 等
   * 多张卡可同时生效，叠加进 luxDemandMul 的增耗项。2026-10 ERA7：改为通用求和（原只认大众传媒卡）。 */
  function cardLuxConsumeMul(s) { return cardFieldSum(s, 'luxConsumeMul'); }

  /* ── ERA7（2026-10 实装）· 各动态效果读数 ──
   * 统一纪律：只读 s.cards / s.civics / s.wonders，没装/没完成 = 返回基准值，绝不污染产线。 */
  /* 公摊面积卡：人口建筑每级 +0.5 人口上限（popCapPerPopBldg）。economy.popCap 读，乘人口建筑总级。 */
  function popCapPerPopBldg(s) { return cardFieldSum(s, 'popCapPerPopBldg'); }
  /* 乡镇集会 / 城市供给：人口上限固定加值、人口生育时长乘区。 */
  function cardPopCapFlat(s) { return cardFieldSum(s, 'popCapFlat'); }
  function cardPopGrowthTimeMul(s) { return cardFieldMul(s, 'popGrowthTimeMul'); }
  /* 延长工时卡：所有职业产出 ×(jobOutMul)。economy 职业产出行（tick/rates 两路）逐字同构地读。 */
  function cardJobOutMul(s) { return cardFieldMul(s, 'jobOutMul'); }
  /* 太空竞赛卡：太空建筑建造 −(spaceBuildSave)。economy.spaceCostMul 读，乘 (1 − 此值)。 */
  function cardSpaceBuildSave(s) { return cardFieldSum(s, 'spaceBuildSave'); }
  /* 神不在此卡：星空观测站产出 ×(obsSciMul)。economy.obsSciMul 读。 */
  function cardObsSciMul(s) { return cardFieldMul(s, 'obsSciMul'); }
  /* 直播竞技卡：体育场额外产出 = 人口 × 体育场等级 × liveCompCivic /秒（仅建体育场且装卡时生效）。
   * economy.cultureRate 加在总量上（绝对量，独立于乘区）。 */
  function stadiumCivic(s) {
    if (!cardSlotted(s, 'card_live_comp')) return 0;
    var lv = (s.lvl && s.lvl.stadium) || 0;
    if (lv < 1) return 0;
    var cd = policyById('card_live_comp');
    var per = (cd && typeof cd.liveCompCivic === 'number') ? cd.liveCompCivic : 0;
    return per * (s.pop || 0) * lv;
  }
  /* 文化遗产市政：每座已建奇观 +1% 市政点获取（wonderCivicGainMul）。economy.cultureRate 整段乘区。 */
  function wonderCivicGainMul(s) {
    if (!(s.civics && s.civics.cultural_heritage)) return 1;
    return 1 + 0.01 * builtWonderCount(s);
  }
  /* 旅游观光卡：每座已建奇观额外 −3% 奢侈品消耗（wonderLuxSave × 奇观数）。economy.luxSaveAll 加进减耗和。 */
  function cardWonderLuxSaveMul(s) {
    if (!cardSlotted(s, 'card_tourism')) return 0;
    var cd = policyById('card_tourism');
    var per = (cd && typeof cd.wonderLuxSave === 'number') ? cd.wonderLuxSave : 0;
    return per * builtWonderCount(s);
  }

  /* ── ERA8 市政（2026-10-18 用户规格 · 实装）动态卡读数 ──
   * 统一同构：装卡才生效、没装 = 基准值（乘区 1 / 加值 0），绝不污染产线。 */

  /* 星际广播（faithSatMul 0.05）+ 我们在此（coreSpaceFaithMul 0.10）：信仰产出的两张动态乘区卡。
   *   前者按轨道卫星等级（s.lvl.satellite，含停用座——广播是全频段信号，与运转开关解耦）；
   *   后者按 礁栖核心+星海区 建筑合计等级（BUILDINGS[].zone 判，不手抄分区清单）。
   *   economy.faithRate 读，两卡同时装则相乘。 */
  function dynFaithCardMul(s) {
    var m = 1, arr = (s && s.cards) || [], i, cd;
    var _csLv = null;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (!cd) continue;
      if (typeof cd.faithSatMul === 'number')
        m *= 1 + cd.faithSatMul * ((s.lvl && s.lvl.satellite) || 0);
      if (typeof cd.coreSpaceFaithMul === 'number') {
        if (_csLv === null) {
          _csLv = 0;
          if (SB.BUILDINGS) for (var _bi = 0; _bi < SB.BUILDINGS.length; _bi++)
            if (SB.BUILDINGS[_bi].zone === 'core' || SB.BUILDINGS[_bi].zone === 'space')
              _csLv += (s.lvl[SB.BUILDINGS[_bi].id] || 0);
        }
        m *= 1 + cd.coreSpaceFaithMul * _csLv;
      }
    }
    return m;
  }
  /* 星际探索热潮卡（starPerPop 1）：星空探索速率 +1%×人口。economy.starRate 读（用户拍 Q2：+x%）。 */
  function cardFeverStarMul(s) {
    var m = 1, arr = (s && s.cards) || [], i, cd;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (cd && typeof cd.starPerPop === 'number') m *= 1 + cd.starPerPop * 0.01 * (s.pop || 0);
    }
    return m;
  }
  /* 远见主义哲学被动：星空探索速率再 +1%×人口（与卡并行叠加，同式相乘；用户拍 Q2）。 */
  function civicFarsightStarMul(s) {
    return (s.civics && s.civics.far_sight) ? 1 + 0.01 * (s.pop || 0) : 1;
  }
  /* 星际物流网卡（planetOutMul 1.3）：异星建筑（瑞亚/泰坦）产出乘区。economy-tick/rates 异星行读。 */
  function cardPlanetOutMul(s) { return cardFieldMul(s, 'planetOutMul'); }
  /* ── ERA9 市政（2026-10-20 实装）· 各动态效果读数 ──
   * 统一纪律：只读 s.cards / s.gov / s.civics，没装/没采用 = 返回基准值，绝不污染产线。 */
  /* 星际联邦政体：全产 +10%（allOutMul）。economy.globalMul 末尾乘，覆盖珊瑚/石/金属/暖石/精铁/科技/市政点/藻食/地热/奢侈品。 */
  function govAllOutMul(s) {
    var g = govById(s.gov);
    return (g && typeof g.allOutMul === 'number') ? g.allOutMul : 1;
  }
  /* 寰宇教会政体：信仰产出 ×(faithMul) + 旧日信仰全产档 ×(oldFaithMul)。economy.faithRate / baseMul 读。 */
  function govFaithMul(s) {
    var g = govById(s.gov);
    return (g && typeof g.faithMul === 'number') ? g.faithMul : 1;
  }
  function govOldFaithMul(s) {
    var g = govById(s.gov);
    return (g && typeof g.oldFaithMul === 'number') ? g.oldFaithMul : 1;
  }
  /* 血肉苦弱卡：精铁/钢/θ金属等资源乘区（resOutMul map）。economy iron/steel/theta 行读，逐资源相乘。 */
  function cardResOutMul(s, res) {
    var m = 1, arr = (s && s.cards) || [], i, cd;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (cd && cd.resOutMul && typeof cd.resOutMul[res] === 'number') m *= cd.resOutMul[res];
    }
    return m;
  }
  /* 璀璨星图卡：人口信仰产出乘区（popFaithMul）。economy.faithRate 人口基项读。 */
  function cardPopFaithMul(s) {
    var m = 1, arr = (s && s.cards) || [], i, cd;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (cd && typeof cd.popFaithMul === 'number') m *= cd.popFaithMul;
    }
    return m;
  }
  /* 总动员令（card_mobilization）：每点闲置鲛人 +1% 破壳系数（乘区，乘在 breakCoef 整段上）。
   * 2026-10-24 用户拍「接线到破壳系数」：`shellSpeedPerIdle` 原是一条只有定义、没有消费者的挂起通道
   *   （civics-data.js 旧注写「等机器态落地再接线」），现由 shell.breakCoef 读本函数 —— 这是该字段的
   *   **唯一落点**，别在别处再乘一次。闲置口径 = folk.idle(s)（= pop − 各职业人数，人类；不含机器人）。
   * ⚠️ 本卡带 retiredBy='far_sight'，退役时由 research 顺手从 s.cards 拔下 ⇒ 退役后本函数自然回 1。 */
  function cardBreakCoefMul(s) {
    var m = 1, arr = (s && s.cards) || [], i, cd;
    var idle = (SB.folk && SB.folk.idle) ? SB.folk.idle(s) : 0;
    if (!(idle > 0)) return 1;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (cd && typeof cd.shellSpeedPerIdle === 'number') m *= 1 + cd.shellSpeedPerIdle * idle;
    }
    return m;
  }
  /* 心胜于物卡：奇观建造消耗减免求和（wonderBuildSave）。wonder.discountedCost 读 (1 − 此值)。 */
  function cardWonderBuildSave(s) { return cardFieldSum(s, 'wonderBuildSave'); }
  /* ERA2-7 扩卡（2026-10-22 实装）：奇观建造消耗按纪元闸门的减免（wonderBuildSaveEra）。
   * 征夫发役（cap 3）/ 王室特许（cap 5）各自带 wonderBuildSaveEra + wonderEraCap，
   * 仅对该 cap 覆盖的纪元内奇观生效；多张卡减耗相加。wonder.discountedCost 读。 */
  function cardWonderBuildSaveEra(s, era) {
    var sum = 0, arr = (s && s.cards) || [], i, cd;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (cd && typeof cd.wonderBuildSaveEra === 'number'
          && (cd.wonderEraCap == null || era <= cd.wonderEraCap)) sum += cd.wonderBuildSaveEra;
    }
    return sum;
  }
  /* 庄园制卡（foodOutMul 1.20）：食物产出乘区。economy.foodRate 末行乘（tick/rates 同源）。 */
  function cardFoodOutMul(s) { return cardFieldMul(s, 'foodOutMul'); }
  /* 公司税卡（companyBonusMul 1.30）：公司产出加成与奢侈消耗加成统一 ×此值。economy-social.companyMul / companyLuxMul 读。 */
  function cardCompanyBonusMul(s) { return cardFieldMul(s, 'companyBonusMul'); }
  /* 质量效应卡（breakStardustMul 1.15）：轮回星屑结算乘区。prestige.stardustGain 读（结算/预览同源）。 */
  function cardBreakStardustMul(s) { return cardFieldMul(s, 'breakStardustMul'); }
  /* 启蒙沙龙卡（sciToCivic 0.15）：科技产出的该比例转为市政点。
   * ⚠️ 这是「转化率」不是「乘区」——没装卡必须 = 0（不能像 cardFieldMul 那样空卡返回 1）。
   *   否则不装沙龙卡也会每 tick 把 100% 科技转市政点（严重 gameplay bug）。故走 cardFieldSum（空卡=0）。 */
  function cardSciToCivic(s) { return cardFieldSum(s, 'sciToCivic'); }
  /* 轮回之终末卡：信仰全产加成翻倍（faithAllProdDouble）。economy.baseMul 旧日信仰段 ×2（装卡才生效）。 */
  function cardFaithAllProdDouble(s) {
    return (cardSlotted(s, 'card_cycle_terminus')) ? 2 : 1;
  }
  /* ── ERA10 市政政策卡（2026-10-20 用户规格 · 实装）· 读数 ──
   * 统一纪律：只读 s.cards，没装 = 基准值（乘区 1 / 加值 0），绝不污染产线。
   * ⚠️ 这五条都不是「装哪张卡」的硬编码判断，而是按字段名扫 s.cards——
   *    将来再加一张带同名同义字段的卡不用改这里。 */
  /* 至高指令卡（launchCycle −2s）：**加法键**。economy.launchCycleOf 把它与科技
   *   《空间矢量控制》的 −2s 相加（10s −2 −2 = 6s，钳下限 1 在那一个函数里）。
   *   返回 Σ 该字段（多张卡同字段相加，与 resOutMul 的乘法语义不同）。 */
  function cardLaunchCycle(s) { return cardFieldSum(s, 'launchCycle'); }
  /* 节能减耗卡（launchHydroMul 0.5）：发射场每级热液能耗乘区。
   *   落点 economy.launchHydroPer —— tick / rates / hydroAlloc 三处共用那一个函数。 */
  function cardLaunchHydroMul(s) { return cardFieldMul(s, 'launchHydroMul'); }
  /* 我们的海卡（faithOutMul 0.7）：信仰产出乘区（economy.faithRate 整段乘）。 */
  function cardFaithOutMul(s) { return cardFieldMul(s, 'faithOutMul'); }
  /* 节能减耗卡（happyConsumeMul 1.5）：居民幸福度消耗乘区。
   *   落点 economy-social.happyBurn（与政体/奇观两条减免乘区同链相乘，互不抵消）。 */
  function cardHappyConsumeMul(s) { return cardFieldMul(s, 'happyConsumeMul'); }
  /* 我们的海卡（craftMul 2）：工坊效率**乘区 ×2**（用户 2026-10-20 拍「乘区」）。
   *   落点 workshop.craftMul 的乘区链（与 boomcraft / 工业机器人同形态），
   *   ⚠️ 不进 craftRatio 加法轴：加法轴里 +100% 在基值 0.5 时只等于 ×1.67，不是「翻倍」。 */
  function cardOurSeaCraftMul(s) { return cardFieldMul(s, 'craftMul'); }
  /* 星际后勤保障卡：指定配方工艺效率加成（craftRatioRecipes map）。workshop.craftMul 读，加法轴。 */
  function cardCraftRatioRecipes(s, recipeId) {
    var add = 0, arr = (s && s.cards) || [], i, cd;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (cd && cd.craftRatioRecipes && typeof cd.craftRatioRecipes[recipeId] === 'number') add += cd.craftRatioRecipes[recipeId];
    }
    return add;
  }
  /* 黑色方碑建筑：每级全局信仰产出 ×faithMulPerLvl（economy.faithRate 读，乘整段）。
   * ⚠️ 2026-10-24 用户拍板：由「建成即 ×1.2（一次性、等级不叠加）」改为「每级 ×1.05」。
   *    lvl=0 时 Math.pow(x, 0) === 1 ⇒ 未建成天然不生效，不需要 `> 0` 特判。 */
  function buildingFaithMul(s) {
    var m = 1, lv;
    if (SB.BUILDINGS) for (var _bi2 = 0; _bi2 < SB.BUILDINGS.length; _bi2++) {
      var _b2 = SB.BUILDINGS[_bi2];
      if (_b2 && typeof _b2.faithMulPerLvl === 'number') {
        lv = (s.lvl && s.lvl[_b2.id]) || 0;
        m *= Math.pow(_b2.faithMulPerLvl, lv);
      }
    }
    return m;
  }
  /* 虚境信仰（card_cycle_terminus，locked 卡）：信仰更名「虚境」并锁死。
   * 装填该卡后，信仰资源名强制为「虚境」，玩家改名框失效（覆盖并锁死，不可逆）。 */
  function faithNameLocked(s) {
    return cardSlotted(s, 'card_cycle_terminus');
  }
  function faithDisplayName(s) {
    return faithNameLocked(s) ? '虚境' : ((s && s.religionName) || '').trim();
  }
  /* 虚拟现实卡（craftRatioPerPop 1）：工坊效率加法轴 −1%×人口（用户确认加算、Q1 不设护栏）。
   * 返回**负的加值**，workshop.craftRatio 源⑩直加（轴上正源：工坊级/热锻级/科技/政体/卡/perk）。 */
  function cardVrCraftRatio(s) {
    var arr = (s && s.cards) || [], i, cd;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (cd && typeof cd.craftRatioPerPop === 'number')
        return -cd.craftRatioPerPop * 0.01 * (s.pop || 0);
    }
    return 0;
  }
  /* 教权国：所有建筑每级 +1 信仰/秒（绝对量，加在 faithRate 末尾）。仅采用该政体时生效。 */
  function faithPerBuildingBonus(s) {
    var g = govById(s.gov);
    if (!g || typeof g.faithPerBuilding !== 'number') return 0;
    var lv = 0, _i;
    if (SB.BUILDINGS) for (_i = 0; _i < SB.BUILDINGS.length; _i++)
      lv += (s.lvl[SB.BUILDINGS[_i].id] || 0);
    return lv * g.faithPerBuilding;
  }
  /* 平等主义：每名鲛人 +0.1% 工坊效率（加法乘区，叠进 govCraftRatio）。 */
  function govCraftPerPop(s) {
    var g = govById(s.gov);
    return (g && typeof g.craftPerPop === 'number') ? g.craftPerPop * (s.pop || 0) : 0;
  }
  /* 平等主义：每名鲛人 +0.1% 热液能产出（乘在 hydroAlloc 的 supply 上，返回乘区基准 1）。 */
  function govHydroPerPop(s) {
    var g = govById(s.gov);
    return (g && typeof g.hydroPerPop === 'number') ? 1 + g.hydroPerPop * (s.pop || 0) : 1;
  }
  /* 平等主义：每名鲛人 +0.1% 矿井产出（叠进 mineTaxMul，tick/rates 同源，返回乘区基准 1）。 */
  function govMinePerPop(s) {
    var g = govById(s.gov);
    var m = (g && typeof g.minePerPop === 'number') ? g.minePerPop * (s.pop || 0) : 0;
    return 1 + m;
  }
  /* 联邦制：科技/市政产出 +10%（乘区，与 cardOutMul 同乘区相乘返回基准 1）。 */
  function govCivicOutMul(s) {
    var g = govById(s.gov);
    return (g && typeof g.civicOutMul === 'number') ? g.civicOutMul : 1;
  }
  function govSciOutMul(s) {
    var g = govById(s.gov);
    return (g && typeof g.sciOutMul === 'number') ? g.sciOutMul : 1;
  }
  /* 联邦制：鲛人食物消耗 −10%（返回减耗比例，foodUse 乘以 (1 − 此值)）。 */
  function govMermanFoodMul(s) {
    var g = govById(s.gov);
    return (g && typeof g.mermanFoodMul === 'number') ? g.mermanFoodMul : 0;
  }
  /* 历史哲学：ERA1/2/3 的奇观每座 +5 市政点获取（wonderEraCivic 字段，绝对值/秒）。
   * 仅当《历史哲学》完成后生效。economy.cultureRate 读。 */
  function wonderEraCivicBonus(s) {
    var c = byId('historiography');
    if (!c || !(s.civics && s.civics.historiography) || !(c.wonderEraCivic)) return 0;
    if (!SB.wonder || !SB.wonder.list) return 0;
    var n = 0, L = SB.wonder.list(), i, o = (s.wonders && typeof s.wonders === 'object') ? s.wonders : {};
    for (i = 0; i < L.length; i++) {
      var w = L[i];
      if (o[w.id] && w.era && w.era <= 3) n++;
    }
    return n * c.wonderEraCivic;
  }
  /* 奇观送的宗教槽（2026-10-01 ERA4）：欧'洛瓦宗座教堂 effect.religSlot = +1 宗教槽。
   * slotList 读它，与政体自带的槽叠加。 */
  function wonderReligSlots(s) {
    var m = 0, i, o = (s.wonders && typeof s.wonders === 'object') ? s.wonders : {}, L = SB.wonder ? SB.wonder.list() : [];
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.religSlot) || 0;
    }
    return m;
  }
  /* 奇观送的市政政策槽（2026-10-02 ERA5）：夏'多桑大剧院 effect.civicSlots = +1 政策卡槽。
   * slotList 读它，叠加在政体自带槽之上（与 wonderReligSlots 同构）。type 用 'wild' —— 本作政策卡
   * 均为通用型，没有专门的「市政槽」类型，给一个可用的万能槽等价于「+1 政策槽」。 */
  function wonderCivicSlots(s) {
    var m = 0, i, o = (s.wonders && typeof s.wonders === 'object') ? s.wonders : {}, L = SB.wonder ? SB.wonder.list() : [];
    for (i = 0; i < L.length; i++) {
      if (!o[L[i].id]) continue;
      m += (L[i].effect && L[i].effect.civicSlots) || 0;
    }
    return m;
  }
  /* 已建奇观总数（2026-10 ERA7 复用）：文化遗产市政 / 旅游观光卡按奇观数缩放效果。 */
  function builtWonderCount(s) {
    var L = SB.wonder ? SB.wonder.list() : [], o = (s.wonders && typeof s.wonders === 'object') ? s.wonders : {}, n = 0, i;
    for (i = 0; i < L.length; i++) if (o[L[i].id]) n++;
    return n;
  }
  /* 超古代市政送的政策卡槽（2026-10 ERA7）：ancient_civics.policySlot = +1 政策槽（万能型）。
   * 与 wonderCivicSlots 同构：遍历已完成市政的 policySlot 字段求和。 */
  function civicPolicySlots(s) {
    var m = 0, i, c;
    for (i = 0; i < CIVICS.length; i++) {
      c = CIVICS[i];
      if (c.policySlot && s.civics && s.civics[c.id]) m += c.policySlot;
    }
    return m;
  }

  // ── 几何（横卷）──────────────────────────────────────────────────
  /* 与 tech.js 的 layout() **同构**：列 = `layer`、行 = 排版产物、连线 = `reqs`。
   * 用户 2026-09-27 的口径是「市政树要做成科技树这样」，所以两张树必须长得一样，
   * 几何也照抄同一套算法（连行的分配规则都一致：「同列不许撞行，其余尽量紧凑」）。
   *
   * ⚠️ 刻意**不共用函数**：科技树和市政树各自维护布局与纪元锚点，
   *    免得一边的节点几何变化牵动另一边；纪元导航的表现保持一致。
   * ⚠️ 但**卡片尺寸借用** `SB.tech.geo` 而不是另立一份：两张树的卡片是同一类东西，
   *    尺寸必须逐像素一致，两份数字迟早对不上，而症状只是「两张树长得不一样高」这种
   *    没人会报的 bug。代价是 layout() 依赖 tech.js 已加载 —— 它确实晚于 tech.js 加载，
   *    且只在渲染时调用（不在模块顶层），所以安全；下面留了兜底值防手滑。 */
  var GEO = { COL: 94, ROW: 20 };        // 列/行间距是本树自己的，改它不影响科技树
  function geo() {
    var t = SB.tech && SB.tech.geo;
    return t ? t : { W: 156, H: 106, PADX: 46, PADY: 52 };
  }

  function layout() {
    var C = SB.CIVICS || [], G = geo();
    var COL_PITCH = G.W + GEO.COL, ROW_PITCH = G.H + GEO.ROW;
    var i, t, e, maxL = {}, minL = {}, eraBase = {}, eraOffset = {}, base = 0, xOffset = 0, blocks = [];

    for (i = 0; i < C.length; i++) {
      t = C[i];
      maxL[t.era] = Math.max(maxL[t.era] || 1, t.layer || 1);
      minL[t.era] = Math.min(minL[t.era] == null ? Infinity : minL[t.era], t.layer || 1);
    }
    /* 逻辑列连续编号；时代之间只增加与科技树一致的像素间距，不空出整列。 */
    for (e = 1; e <= 12; e++) {
      if (!maxL[e]) break;
      var span = maxL[e] - minL[e] + 1;
      eraBase[e] = base;
      eraOffset[e] = xOffset;
      blocks.push({ era: e, x0: base, cols: span, start: base, offset: xOffset });
      base += span;
      xOffset += span * COL_PITCH + (maxL[e + 1] ? (G.ERAPAD || 30) : 0);
    }

    /* 行分配：按 (全局列, layoutOrder, id) 稳定排序，每列从 0 找第一个空行。
     * layoutOrder 只用于同列分支的视觉次序（例如让两条终局市政分别对齐各自前置），
     * 未指定时仍按 id 排，保持其它节点的位置稳定。
     * ⇒ 法典独占第 0 列第 0 行，技艺与神秘主义同在第 1 列、一上一下，互不撞行。 */
    var used = {}, order = [], cells = {};
    for (i = 0; i < C.length; i++) order.push(C[i]);
    order.sort(function (a, b) {
      var ca = colOf(a, eraBase, minL), cb = colOf(b, eraBase, minL);
      var ao = a.layoutOrder == null ? 0 : a.layoutOrder;
      var bo = b.layoutOrder == null ? 0 : b.layoutOrder;
      return ca - cb || ao - bo || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    for (i = 0; i < order.length; i++) {
      t = order[i];
      var col = colOf(t, eraBase, minL), row = 0;
      while (used[col] && used[col][row]) row++;
      (used[col] = used[col] || {})[row] = true;
      cells[t.id] = {
        id: t.id, era: t.era, layer: t.layer || 1, col: col, row: row,
        x: G.PADX + eraOffset[t.era] + ((t.layer || 1) - minL[t.era]) * COL_PITCH,
        y: G.PADY + row * ROW_PITCH
      };
    }

    var maxRight = 0, maxRow = 0;
    for (var k in cells) {
      maxRight = Math.max(maxRight, cells[k].x + G.W);
      if (cells[k].row > maxRow) maxRow = cells[k].row;
    }
    var w = G.PADX + maxRight;
    var h = G.PADY * 2 + maxRow * ROW_PITCH + G.H;

    /* 连线：前置节点右腰 → 本节点左腰，三次贝塞尔。两端都得在 cells 里
     * （数据写错 id 时静默少线，e2e 有断言盯着 reqs 数）。 */
    var edges = [];
    for (i = 0; i < C.length; i++) {
      t = C[i];
      if (!t.reqs || !t.reqs.length) {
        if (!t.reqsAny || !t.reqsAny.length) continue;
      }
      var to = cells[t.id];
      if (!to) continue;
      var _reqList = (t.reqs || []).concat(t.reqsAny || []);
      for (var r = 0; r < _reqList.length; r++) {
        var from = cells[_reqList[r]];
        if (!from) continue;
        var x1 = from.x + G.W, y1 = from.y + G.H / 2;
        var x2 = to.x, y2 = to.y + G.H / 2;
        var dx = Math.max(40, (x2 - x1) / 2);
        edges.push({
          from: _reqList[r], to: t.id,
          d: 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 +
             ' ' + x2 + ' ' + y2
        });
      }
    }
    return {
      geo: G, w: w, h: h, cells: cells, edges: edges, blocks: blocks, pitch: COL_PITCH,
      colOf: function (id) { return cells[id] ? cells[id].col : -1; },
      rowOf: function (id) { return cells[id] ? cells[id].row : -1; }
    };
  }
  /* 与科技树一致：layer 在时代内部决定列序，并减去该时代最早实际 layer，
   * 避免因数据从较高层起步而在时代开头留白。 */
  function colOf(t, eraBase, minL) {
    return (eraBase[t.era] || 0) + (t.layer || 1) - (minL[t.era] || 1);
  }

  function eraAnchorX(era) {
    var L = layout();
    for (var i = 0; i < L.blocks.length; i++) {
      if (L.blocks[i].era === era) return L.blocks[i].offset;
    }
    return 0;
  }

  /* 树形揭示按市政研究推进：完成某纪元任意一项市政，即展开下一纪元的节点骨架。
   * 这是显示范围，不替代 civic.blocked() 的科技纪元门槛，也不代替 boost 对名称/效果的揭示。 */
  function visibleEra(s) {
    var maxEra = (SB.ERAS || []).length || 1, era = 1, hasCompleted;
    while (era < maxEra) {
      hasCompleted = false;
      for (var i = 0; i < CIVICS.length; i++) {
        if ((CIVICS[i].era || 1) === era && s && s.civics && s.civics[CIVICS[i].id]) {
          hasCompleted = true;
          break;
        }
      }
      if (!hasCompleted) break;
      era++;
    }
    return era;
  }

  // ── 面板开门 ──────────────────────────────────────────────────────
  /* 判据 = 统治核心建成 ≥ 1 级（派生，不存档）。2026-10-06 城堡「真升级」后改读
   *   `SB.economy.coreLvl(s)`（= lvl.hall）——城堡是这座建筑的新名字而不是第二座，
   *   读数口径与另两条效果、面板注脚完全一致，不另立一份。 */
  function panelOpen(s) {
    return !!s && (SB.economy && SB.economy.coreLvl ? SB.economy.coreLvl(s) : (s.lvl.hall || 0)) >= 1;
  }
  function panelBlock(s) {
    var _c = (SB.economy && SB.economy.coreLvl) ? SB.economy.coreLvl(s) : ((s && s.lvl.hall) || 0);
    if (!_c) return '先建成议事厅（由「石工」解锁）——它同时是书手的岗位来源。';
    return null;
  }

  // ── 鼓舞 / 揭示 ──────────────────────────────────────────────────
  function condMet(s, c) {
    /* 复用科技树那套：cond 的语义、condShort 的「还差什么」文案全部同源，
     * 于是市政的鼓舞与科技的尤里卡在玩家眼里是**同一类东西**。 */
    return SB.tech && SB.tech.condMet ? SB.tech.condMet(s, c) : true;
  }
  function condShort(s, c) {
    return SB.tech && SB.tech.condShort ? SB.tech.condShort(s, c) : null;
  }
  /* 「鼓舞达成过」——与 tech.metOf 三档同构：已完成即铁证、台账记过算数、现算 cond。
   * 台账那一档是必须的：rate 类条件（「建成 N 座」反过来不成立，但将来加
   * 「市政点产出 ≥ N」就会回落）达成过一次不该被撤回。 */
  /* ⚠️ 参数是**市政对象**（取它的 .boost 与台账键），别再传 cond 进来。
   *    2026-09-27 踩到：boostText 传了市政对象、而函数体把它当 cond 递给 condMet，
   *    condMet 读不到 `.t` ⇒ 走 default 返回 false ⇒「已达成」永远判不出来，
   *    卡片上印成 `建成 工坊 2 / 1`（看着像坏掉了）。
   *    症状很轻（只是文案），但它出自一个会反复犯的错：**同一个对象在不同层的名字不同**
   *    （市政有 .boost，condMet 要的是 .boost 本身）。约定：凡是在市政语境里，
   *    公开 API 一律收**市政对象**，cond 只在 condMet/condShort 那一层出现。 */
  function boostMet(s, c) {
    if (!s || !c) return true;
    if (s.civBoost && s.civBoost[c.id]) return true;
    return c.boost ? condMet(s, c.boost) : true;
  }
  function isRevealed(s, id) { return !!(s && s.civShown && s.civShown[id]); }

  /* 每 2 秒（以及每次玩家动作后）跑一趟：记鼓舞台账 + 揭示新市政。
   * 返回本次新揭示条数（供播报）。与技术树 pump 同构，调用点也在一起
   * （game.pumpTech 里补一次，两类条件就都不会漏）。 */
  function pump(s, emit) {
    if (!s || !s.civShown) return 0;
    var n = 0;
    /* ⚠️⚠️ 2026-10-27 修复（玩家报「研究神学之后揭露这个归正会找不到」）：
     *   病根是**播报与渲染两套口径**：pump 遍历全部市政，`boostMet` 一成立就写 `civShown`
     *   并 `emit('市政已揭示：…')`；而 civicTree 只渲染 `era <= visibleEra` 的节点。
     *   《归正会》是 ERA4、鼓舞 = `religion`（读 `s.religionName`，见 tech.js:278），
     *   玩家研究完神学就会建宗教 ⇒ 鼓舞早早达成 ⇒ 播报「已揭示：归正会」，
     *   而 visibleEra 还停在 3 ⇒ **树里根本不渲染它，播报了却找不到**。
     * 【修法：揭示照旧，只把「播报」限制在节点已经渲染的纪元内】
     *   ⚠️ 不要改成「未展开纪元就不揭示」—— 那会打断既有约定（e2e 有多条
     *   「鼓舞达成即揭示」的断言），而且 `blocked()` 靠 civShown 区分
     *   「尚未揭示」与「纪元未到」，提前揭示才能给出更准确的原因。
     *   所以：civShown 照写（揭示语义不变），只有 `emit` 加纪元闸。
     *   玩家推进到该纪元时节点会直接可见，无需补播报（也不该重复播报）。 */
    var _visEra = visibleEra(s);
    for (var i = 0; i < CIVICS.length; i++) {
      var c = CIVICS[i];
      if (!s.civBoost) s.civBoost = {};
      if (c.boost && !s.civBoost[c.id] && condMet(s, c.boost)) s.civBoost[c.id] = 1;
      if (s.civShown[c.id]) continue;
      if (!(s.civics[c.id] || boostMet(s, c))) continue;   // ⚠️ 收市政对象，见 boostMet 那条注
      s.civShown[c.id] = 1;
      n++;
      if (emit && (c.era || 1) <= _visEra) emit('市政已揭示：' + c.name + '（' + c.desc + '）');
    }
    return n;
  }

  // ── 研究市政 ──────────────────────────────────────────────────────
  function reqsMet(s, c) {
    if (c.reqs) for (var i = 0; i < c.reqs.length; i++) if (!s.civics || !s.civics[c.reqs[i]]) return false;
    /* `reqsAny` —— **OR 前置**（ERA9 市政《太阳系后勤保障》的「繁荣一统/共同命运/神圣之路 任一」）。
     *   与 `reqs`（AND）互补：两者都空 ⇒ 无前置；两者都有 ⇒ AND(reqs) 且 OR(reqsAny)。 */
    if (c.reqsAny && c.reqsAny.length) {
      var _any = false;
      for (var j = 0; j < c.reqsAny.length; j++) if (s.civics && s.civics[c.reqsAny[j]]) { _any = true; break; }
      if (!_any) return false;
    }
    return true;
  }
  /* 返回 null 表示可以研究，否则返回「为什么不行」——这句会挂成灰按钮的 title。 */
  function blocked(s, c) {
    if (s.civics[c.id]) return null;
    if (!isRevealed(s, c.id)) return '尚未揭示——先达成鼓舞条件';
    /* 纪元闸（对齐 tech.studyBlocked:571）：鼓舞达成可揭示，但不能跳纪元偷研究。
     * 揭示与可研究脱钩，正是方案 A 的核心——让「100% 进度条」与「未揭示」不再自相矛盾。 */
    if (c.era && c.era > (s.era || 1)) return '纪元未到：属于 ' + (SB.tech && SB.tech.eraName ? SB.tech.eraName(c.era) : (c.era + ' 纪元')) + '，先推进当前纪元';
    if (!reqsMet(s, c)) {
      var need = [];
      if (c.reqs) for (var i = 0; i < c.reqs.length; i++) if (!s.civics[c.reqs[i]]) need.push(byId(c.reqs[i]).name);
      if (c.reqsAny) for (var k = 0; k < c.reqsAny.length; k++) if (!s.civics[c.reqsAny[k]]) need.push(byId(c.reqsAny[k]).name);
      return '需先完成：' + need.join('、');
    }
    if ((s.res.culture || 0) < c.cost) return '市政点 ' + Math.floor(s.res.culture || 0) + ' / ' + c.cost;
    return null;
  }

  /* 是否存在「当前即可研究」的市政（面板已开 + 有未投入且 blocked 为 null 的项）。
   * 供页签红点用，复用 blocked 这唯一门禁，与节点「可研究」状态同源。 */
  function hasResearchable(s) {
    if (!s || !panelOpen(s)) return false;
    var C = SB.CIVICS || [], i;
    for (i = 0; i < C.length; i++) {
      if (s.civics[C[i].id]) continue;
      if (blocked(s, C[i]) === null) return true;
    }
    return false;
  }

  function canResearch(s, id) {
    var c = byId(id);
    if (!c) return false;
    if (s.civics[id]) return false;
    return blocked(s, c) === null;
  }
  /* 即时扣费（与科技 study 同一口径，无队列）。返回 true 表示本次真的完成。 */
  function research(s, id, emit) {
    if (!canResearch(s, id)) return false;
    var c = byId(id);
    s.res.culture -= c.cost;
    s.civics[id] = 1;
    /* 2026-10-26 排行榜「最快虚境飞升」：research 已防重采（s.civics[id] 已置位即 return），
     * 天然只报一次；仅在采用 ascend_void 那一刻提交墙钟秒（与 firstFaith 同口径）。 */
    if (id === 'ascend_void' && SB.rank) SB.rank.submitRun([{ key: 'void', value: s.wallT }]);
    /* 2026-10-24 成就「市政大成」（docs/ACHV_DESIGN_v0.3.md §四·8）：单周目全表完成。
     * 判定收在 achv.checkCivicAll（数全表，不维护第二本计数器），这里只转发。
     * ⚠️ 只数 CIVICS 表（69）——GOVS/POLICIES 是市政的配套分支/政策卡，不计入。 */
    if (SB.achv && SB.achv.checkCivicAll && SB.game && SB.game.meta)
      SB.achv.checkCivicAll(s, SB.game.meta());
    if (emit) emit('市政完成：' + c.name + '（' + c.desc + '）');
    /* 2026-10-14：每完成一个市政，给 1 次**免费卸下机会**（可累积、无上限）。
     * 动机：让玩家有节奏地调整政策卡，不被「卸下收费」门槛卡死。
     * 消耗点在 setCardAt（卸下时优先扣 1 次令牌，令牌用尽再走市政点收费）。 */
    s.cardFreeRemoves = (s.cardFreeRemoves || 0) + 1;
    if (emit) emit('获得 1 次免费卸下机会（当前共 ' + s.cardFreeRemoves + ' 次）');
    /* 政体随《法典》自带。用 s.gov 是否为 null 判「还没采用过」而不是靠 cost 判——
     * 老档读进来时 gov 可能是 null，这条免费路径必须仍然走得到。 */
    if (c.gov && !s.gov) {
      s.gov = c.gov;
      s.govAdopted = s.govAdopted || {};
      s.govAdopted[c.gov] = true;
    }
    /* 卡退役（2026-09-30）：完成后扫一遍 POLICIES，把 retiredBy 指向本市政的卡从
     * 所有槽里拔下。**免费**——退役是制度行为，不是玩家「换卡」，不该收换卡费。
     * （不拔的话卡还留在 s.cards 里，craftRatio/mulOfField 只看槽不查所有权，
     *  等于退役卡永久生效——那是「数据退役了、结算没跟着走」的静默断链。） */
    ensureCards(s);
    for (var pi = 0; pi < POLICIES.length; pi++) {
      var pp = POLICIES[pi];
      if (pp.retiredBy !== id) continue;
      for (var si = 0; si < s.cards.length; si++) {
        if (s.cards[si] === pp.id) {
          s.cards[si] = null;
          if (emit) emit('政策卡「' + pp.name + '」已退役。');
        }
      }
      /* ⚠️ 仅第 0 号槽镜像，**勿读**（读→ cardSlotted / cardCraftRatio），2026-10-14 钉 */
      s.card = s.cards[0] || null;
    }
    return true;
  }

  // ── 换卡 / 换政体 ─────────────────────────────────────────────────
  /* 「当前最高已完成市政」的研究成本。空手时算 0（这时也确实无卡/政体可调整）。 */
  function topCost(s) {
    var m = 0;
    for (var i = 0; i < CIVICS.length; i++) {
      var c = CIVICS[i];
      if (s.civics && s.civics[c.id] && c.cost > m) m = c.cost;
    }
    return m;
  }
  /* ⚠️ 2026-10-05 用户拍板接线 govRoutine（此前它是**死 perk**）：
   *   applyPerk 把等级写进 `s.perk.govRoutine`（prestige.js:214），但全工程**无任何读取点**
   *   ⇒ 玩家花钱买了个从不生效的折扣。本函数是费用计算的唯一收口，接在这里即可三路同源：
   *   `cardBlocked` / `govBlocked`（判定）、`setCardAt` / `setGov`（实扣）、
   *   以及 ui/render 那两句展示（`C.cardCost(s)` / `C.govCost(s)`）全走这两个函数。
   * 【为什么折扣乘在这里、而不是乘在 topCost 上】topCost 是「最高已完成市政的 cost」这个
   *   **事实量**，被导出给外部（:1231）也可能被别处当基准读；折扣是商店 perk 的效果，
   *   两者语义不同，混在一个函数里会让「基准」随玩家买了什么而变。
   * 【为什么不用 Math.ceil / Math.round】费用是**市政点**（浮点池），工坊造价的先例
   *   （economy.costOf 去 Math.ceil、2026-10-05 用户拍板）就是让扣费保持真实小数：
   *   blocked 判定与实扣都读同一个值 ⇒ 不存在「显示够了但扣不动」的缝。
   * ⚠️ 5 级满档 = 0.50 ⇒ 最低 0.5×，数学上永远 > 0，不会出现免费换卡。
   *   若将来把 n 抬到 10（−100%），这里会归 0 ⇒ 免费换卡 ⇒ 那个「拔下→换槽→重装」的
   *   绕过路径就彻底失效了。届时必须加下限（参照 costOf 的 bsb 闸门写法）。 */
  function govRoutineMul(s) {
    return 1 - 0.10 * (s.perk && s.perk.govRoutine ? s.perk.govRoutine : 0);
  }
  function cardCost(s) { return topCost(s) * 0.2 * govRoutineMul(s); } // 卸下政策卡 = 最高已完成市政的 1/5 × 折扣
  function govCost(s) { return topCost(s) * 0.2 * govRoutineMul(s); } // 重复采用政体 = 同一费用

  function cardOwned(s, id) {
    var p = policyById(id);
    if (!p) return false;
    /* 退役（2026-09-30）：技艺卡被职业行会取代。retiredBy 指向**市政 id**，
     * 那项市政完成后卡即不可再装（已装的由 research 顺手拔下）。 */
    if (p.retiredBy && s.civics && s.civics[p.retiredBy]) return false;
    /* 卡要由**已完成的市政**解锁。与其自己的 civic 键对不上时一律视为未拥有——
     * 那意味着存档被手改，宁可不给，也不能让一张没解锁的卡生效。 */
    return !!(s.civics && s.civics[p.civic]);
  }
  function govOwned(s, id) {
    for (var i = 0; i < CIVICS.length; i++) {
      var c = CIVICS[i];
      /* ⚠️ 单值 `gov` 与复数 `govs` 都认：一个市政解锁一条政体（法典→酋邦制）
       *    或多条政体（政治哲学→独裁/寡头/古典共和）。没解锁 = false，setGov 会拦。 */
      if (c.gov === id) return !!(s.civics && s.civics[c.id]);
      if (c.govs && c.govs.indexOf(id) >= 0) return !!(s.civics && s.civics[c.id]);
    }
    return false;
  }

  /* 政体的三类**非平坦**效果出口（采用政体即生效，不依赖装在槽里）。
   * ⚠️ 这些不走 flow()（flow 只认平坦加值/秒的 effect），因为：
   *      · craftRatio 是**加法乘区**（工坊效率聚合，与建筑级/科技/奇观同口径）；
   *      · luxuryMul 是商人行的**乘区**（与马具 toolMul 独立相乘）；
   *      · happyBonus 是幸福度的**常驻偏移量**（剥掉上一帧偏移再算机制值，防漂移）。
   *    都只读当前政体（govById(s.gov)），没采用 = 返回 0/1，绝不参与运算。 */
  function govCraftRatio(s) { var g = govById(s.gov); return (g && typeof g.craftRatio === 'number' ? g.craftRatio : 0) + govCraftPerPop(s); }
  /* ⚠️ 政策卡的 craftRatio（2026-09-30 用户拍：技艺卡 = 工坊效率 +20%）。
   * 与 govCraftRatio 同一条加法乘区、同一纪律：数据在政策卡表、读在这里，
   * **装在卡槽里且仍拥有才生效**（没装/已退役 = 0），多个有效槽逐槽相加。
   * 读 s.cards 数组（与 mulOfField 同口径），单值 s.card 只是第 0 号槽镜像。 */
  function cardCraftRatio(s) {
    var arr = (s && s.cards) || [], m = 0, id, cd;
    for (var i = 0; i < arr.length; i++) {
      id = arr[i]; if (!id) continue;
      cd = policyById(id);
      /* 旧存档/手改状态即使残留已退役卡，也不能继续叠加工坊效率。 */
      if (cd && typeof cd.craftRatio === 'number' && cardOwned(s, id)) m += cd.craftRatio;
    }
    return m;
  }
  function govLuxuryMul(s)  { var g = govById(s.gov); return g && typeof g.luxuryMul === 'number' ? g.luxuryMul : 1; }
  function govHappyBonus(s) { var g = govById(s.gov); return g && typeof g.happyBonus === 'number' ? g.happyBonus : 0; }
  /* 君主制（2026-09-30）：礁栖核心建筑建造消耗 −10%。返回的是**乘数**（没采用 = 1），
   * economy.costOf 对 zone==='core' 的建筑乘上它——显示与扣费同走 costOf，天然同源。 */
  function govBuildCostMul(s, bid) {
    var g = govById(s.gov);
    if (!g || typeof g.buildSave !== 'number') return 1;
    /* 规格原文是「**所有礁栖核心建筑**建造消耗 −10%」——减耗只认 zone==='core' 的建筑。
     * ⚠️ bid 缺省 = 调用方没传建筑 id，按 1 处理（宁可不少减，不能错减）；
     *    建造面板与 costOf 都传 id，只有「泛问政体强度」这种调用才会缺省。 */
    if (bid && SB.BUILDINGS) {
      var _zb = null;
      for (var _i = 0; _i < SB.BUILDINGS.length; _i++) if (SB.BUILDINGS[_i].id === bid) _zb = SB.BUILDINGS[_i];
      if (!_zb || _zb.zone !== 'core') return 1;
    }
    return 1 - g.buildSave;
  }

  /* ERA6（2026-10-12 实装）：三个新政体（教权国 / 平等主义 / 联邦制）采用时弹窗让玩家起名，
   *   政体显示名 = 玩家起的名 + 后缀；城堡随政体更名（圣座居所 / 人民大厅 / 国会）。
   *   ⚠️ 这套只认这三个 id，其它政体（酋邦制 / 独裁 / 寡头 / 古典共和 / 神权）不沾，
   *       它们的名字就是数据里的 name，没有「玩家起名」这一步。 */
  var GOV_TITLE_SUFFIX = { theo_state: '教权国', egalitarianism: '联盟', federalism: '联邦',
    interstellar_federation: '星际联邦', star_sea_coop: '星海共同体', universal_church: '寰宇教会' };
  var GOV_CASTLE_NAME  = { theo_state: '圣座居所', egalitarianism: '人民大厅', federalism: '国会' };
  function govTitleSuffix(id) { return GOV_TITLE_SUFFIX[id] || ''; }
  /* 政体面板 / 顶栏用的「显示名」：新政体且已起名 ⇒ 玩家名 + 后缀；否则数据 name。 */
  function govTitleName(s) {
    var g = govById(s.gov);
    if (!g) return '酋邦制';
    var suf = GOV_TITLE_SUFFIX[s.gov];
    if (suf && s.govName && s.govName.trim()) return s.govName.trim() + suf;
    return g.name;
  }
  /* 城堡显示名覆盖：当前政体是新政体之一 ⇒ 返回新名（render 在「城堡/议事厅」之外再判这一层）；
   *   其它政体 ⇒ 返回 null，沿用默认的城堡/议事厅。 */
  function castleDisplayName(s) {
    if (s.gov && GOV_CASTLE_NAME[s.gov]) return GOV_CASTLE_NAME[s.gov];
    return null;
  }

  /* 换卡 blocked 文案。与科技 studyBlocked 同口径：要指得出**该做什么**。
   * ⚠️ `id === null` 是「拔下」这个动作，不是「装一张名为 null 的卡」——
   *    早期版本让 null 掉进 policyById 返回 '没有这张卡'，于是卡永远拔不下来，
   *    而症状只是「按钮点了没反应」，不会报任何错。 */
  /* ⚠️ 收费模型（2026-10-14 定稿，与玩家预期对齐）：**安装（装填）永远免费，只有「卸下」扣市政点。**
   *   - 2026-09-27 曾拍板「装和卸都收一次」，但玩家预期是「装填免费、卸除才消耗」，且实测该口径
   *     导致第 2/3 张卡因点数不足静默装不上（setCard 返回 false + 一句 log），表现为「只能装两个/
   *     不能选槽/万能槽装不上」。故改回「装填免费」。
   *   - 防滥用（2026-09-27 原担忧的「拔下→换槽→重装白嫖」）仍由**卸下收费**兜底：换卡 = 卸旧(付费)+
   *     装新(免费)，总付费一次，无法绕过。空槽免费判据那种漏洞在「卸下才扣点」下天然不存在
   *     （装填不碰点数，无所谓空槽非空槽）。
   *
   * ⚠️ 收费判据只有一条：`s.cardEver`（首次装填由 setCardAt 置位，一次性标记）。
   *    卸下时 `id===null && s.cardEver` 才扣 `cardCost`；安装分支 `fee` 恒为 0。
   * ⚠️ `id === null` 是「拔下」这个动作，不是「装一张名为 null 的卡」（早期版本
   *    让 null 掉进 policyById 返回 '没有这张卡'，于是卡永远拔不下来，
   *    而症状只是「按钮点了没反应」，不报任何错）。拔下必须一路走到收费判据。 */
  /* ── 多槽状态层（2026-09-29 升维：s.card 单值 → s.cards 数组）──
   * 一个政体给 N 个槽（酋邦制 1、三种纪元二政体各 3），s.cards[i] = 第 i 槽装的政策卡 id。
   * s.card 仍是第 0 号槽的**镜像**——不是事实来源。
   * ⚠️ 改政体 ⇒ 槽数变 ⇒ s.cards 按 index 截断/补 null（多出来的槽直接丢，
   *    保留的槽里那张卡还在）。这是「换政体 = 换槽位配方」的应有之义。
   * ⚠️ 2026-10-14：实测效果层已无任何 s.card 读者（乘区/工坊/动态卡/flow/退役清槽
   *    五条出口全部走 s.cards 数组）。**禁止新增读它的逻辑**——读 = 看不见 1 号及以后的槽，
   *    症状是「卡明明在槽里、效果却是 0」且不报错。要读就用 cardSlotted / mulOfField。 */
  function ensureCards(s) {
    if (!s.cards || !Array.isArray(s.cards)) s.cards = [];
    var L = slotList(s).length, out = [], i;
    for (i = 0; i < L; i++) out.push(s.cards[i] || null);
    s.cards = out;
    /* ⚠️ 仅第 0 号槽镜像，**勿读**（读→ cardSlotted / cardCraftRatio），2026-10-14 钉 */
    s.card = out[0] || null;
  }
  function inSlot(s, id) { return !!(s.cards && s.cards.indexOf(id) >= 0); }
  function firstFilled(s) {
    if (!s.cards) return -1;
    for (var i = 0; i < s.cards.length; i++) if (s.cards[i]) return i;
    return -1;
  }
  function hasFitSlot(s, p) {
    var L = slotList(s);
    for (var i = 0; i < L.length; i++) if (cardFits(p, L[i].type)) return true;
    return false;
  }

  function cardBlocked(s, id, slot) {
    var clear = (id === null || id === undefined);
    if (!clear) {
      var p = policyById(id);
      if (!p) return '没有这张卡';
      if (inSlot(s, id)) return null;                 // 已经在某槽里 ⇒ 幂等
      if (!cardOwned(s, id)) {
        var c = byId(p.civic);
        return '需先完成市政「' + c.name + '」';
      }
      /* ⚠️ 类型不匹配与「还没解锁」是两回事，文案要说清是哪一种：
       *    前者是「这张卡在别的槽里」，后者是「这张卡你还没有」。
       *    Civ6 也是这样：卡在手、但塞不进这个槽时，按钮灰着并告诉你缺哪类槽。 */
      /* ⚠️ 多槽：满槽时由 setCard 走「替换首槽」（firstFilled），不再在此拦死。
       *    这里只拦「类型真的塞不进任何槽」——与 Civ6 同口径（卡在手但槽不对口 ⇒ 灰按钮说话）。 */
      if (!hasFitSlot(s, p)) return '「' + p.name + '」装不下：需 ' + slotTypeName(p.type) + '（当前没有可用的槽位）';
      /* ⚠️ 2026-10-14 修：安装（装填）永远免费——扣点只在「卸下」时发生（见下方 clear 分支 / setCardAt）。
       *   之前的口径是「装和卸都收一次」（2026-09-27 拍板），与玩家预期「装填免费、卸除才消耗」不符，
       *   且导致第 2/3 张卡因点数不足静默装不上、「只能装两个」「不能选槽」等一连串现象。 */
      return null;
    }
    /* 拔下：slot 指定拔哪格（UI 逐槽按钮），不指定则拔第一格有卡的。 */
    var sl = (slot !== undefined && slot !== null) ? slot : firstFilled(s);
    if (sl < 0) return null;                          // 没卡可拔 ⇒ 无动作不收钱
    /* ERA9（2026-10-20）：被 lock 的政策卡（轮回之终末）不可卸下——拒绝拔下动作。 */
    var _lc = s.cards && s.cards[sl];
    if (_lc && policyById(_lc) && policyById(_lc).locked) return '「' + policyById(_lc).name + '」已锁死，不可卸下';
    if (!s.cardEver) return null;
    /* 2026-10-14：有免费卸下机会 ⇒ 直接放行（不查市政点）。令牌优先于市政点收费。 */
    if (s.cardFreeRemoves > 0) return null;
    var c2 = cardCost(s);
    if (c2 > 0 && (s.res.culture || 0) < c2)
      return '拔下需 ' + c2 + ' 市政点（现有 ' + Math.floor(s.res.culture || 0) +
        '；免费卸下机会剩 ' + (s.cardFreeRemoves || 0) + '）';
    return null;
  }
  function canSetCard(s, id) { return cardBlocked(s, id) === null; }
  /* 当前第 0 号槽的类型。无槽时返回 null ⇒ 「不提供卡槽」的政体下任何卡装不进。 */
  function currentSlotType(s) {
    var L = slotList(s);
    return L.length ? L[0].type : null;
  }

  /* 2026-10-07 用户拍板：槽上不再给「拔下」按钮——装填一张新卡就直接覆盖，卸除是多余入口。
   * 配套收紧：选槽只挑**对口**的槽（先空槽后已装槽），卡不会再被塞进不对口的槽里
   * （否则那张错位卡没有任何玩家入口能清出来，只能永远占着槽）。 */
  /* 选槽只挑对口的槽（先空槽后已装槽），卡不会再被塞进不对口的槽里。
   * ⚠️ 2026-10-13 修：原先按 slotList 顺序扫、万能槽排在 typed 槽之前 ⇒ relig 卡命中首个万能槽，
   *   真正的宗教槽（排在 slotList 末尾）永远空着（用户实测「最后一个宗教槽没词条」）。
   *   ⇒ 改为**按类型优先级排序候选槽**：优先「与卡类型相同」的槽，其次万能槽，最后其它类型槽；
   *   同优先级内再按 wantFilled（先空后满）筛选。relig 卡因此必进 relig 槽。 */
  function firstFitSlot(s, p, wantFilled) {
    var L = slotList(s), i;
    var pt = p && p.type;
    function tier(t) { if (pt && t === pt) return 0; if (t === 'wild') return 1; return 2; }
    var cand = [];
    for (i = 0; i < L.length; i++) if (cardFits(p, L[i].type)) cand.push(i);
    cand.sort(function (a, b) { return tier(L[a].type) - tier(L[b].type); });
    for (i = 0; i < cand.length; i++) {
      var idx = cand[i];
      if (!!(s.cards && s.cards[idx]) === wantFilled) return idx;
    }
    return -1;
  }

  /* ⚠️ 2026-10-13：新增可选 slot 参数（手动选槽）。slot 给定时直接装到那一格（须对口且在范围内），
   *   不走自动挑槽；用于 UI 的「点卡 → 点槽」两步选位。slot 缺省仍走自动挑槽（优先同类型槽）。 */
  function setCard(s, id, emit, slot) {
    ensureCards(s);
    var clear = (id === null || id === undefined);
    if (!clear && inSlot(s, id)) return false;        // 已装备 ⇒ 幂等无动作
    if (!canSetCard(s, id)) return false;
    var target;
    if (clear) {
      target = (slot !== undefined && slot !== null) ? slot : firstFilled(s);
    } else {
      var p = policyById(id);
      if (slot !== undefined && slot !== null) {
        var L2 = slotList(s);
        if (slot < 0 || slot >= L2.length) return false;          // 越界 ⇒ 拒绝
        if (!cardFits(p, L2[slot].type)) return false;            // 不对口 ⇒ 拒绝（不卡进错槽）
        target = slot;
      } else {
        target = firstFitSlot(s, p, false);
        if (target < 0) target = firstFitSlot(s, p, true);   // 全满 ⇒ 覆盖第一张对口的已装卡
      }
    }
    if (target < 0) return false;                        // 没卡可拔（拔下时）
    return setCardAt(s, target, id, emit);
  }
  /* 核心写入：把第 slot 号槽设为 id（id 为 null = 拔下）。判据由 cardBlocked 先过。 */
  function setCardAt(s, slot, id, emit) {
    ensureCards(s);
    if (slot < 0 || slot >= s.cards.length) return false;
    var tid = (id === undefined || id === null) ? null : id;
    if (s.cards[slot] === tid) return false;
    /* ERA9（2026-10-20）：被 lock 的政策卡（轮回之终末）不可卸下、也不可被覆盖——守住这一格。 */
    var _oc = s.cards[slot];
    if (_oc) { var _op = policyById(_oc); if (_op && _op.locked) return false; }
    /* ⚠️ 2026-10-14 修：安装（id 非 null）永远免费；市政点只在「卸下」（id===null）时扣。
     *   修正「装填免费、卸除才消耗」的预期模型；此前装和卸都扣，造成第 2/3 张卡静默装不上。
     *   同次新增：卸下时优先消耗 1 次「免费卸下机会」（s.cardFreeRemoves，每完成一个市政 +1、可累积），
     *   令牌用尽才走市政点收费。安装恒 0。 */
    var fee = 0, usedToken = false;
    if (id === null) {                                 // 卸下
      if (s.cardFreeRemoves > 0) { s.cardFreeRemoves -= 1; fee = 0; usedToken = true; }
      else if (s.cardEver) { fee = cardCost(s); }
    }
    if (fee > 0) s.res.culture -= fee;
    s.cardEver = true;                                // 拔下同样置位：也是一次「调整政策卡」
    s.cards[slot] = tid;
    /* ⚠️ 仅第 0 号槽镜像，**勿读**（读→ cardSlotted / cardCraftRatio），2026-10-14 钉 */
    s.card = s.cards[0] || null;
    if (emit) {
      if (tid === null) {
        var rmMsg = usedToken
          ? '（用掉 1 次免费卸下机会，剩 ' + s.cardFreeRemoves + ' 次）'
          : (fee > 0 ? '（花 ' + fee + ' 市政点）' : '（免费）');
        emit('政策卡已拔下' + rmMsg + '。');
      } else {
        var _np = policyById(tid);
        emit('政策卡换为「' + _np.name + '」' +
          (fee > 0 ? '（花 ' + fee + ' 市政点）' : '（人生第一次装填，免费）'));
        /* ERA9 虚境信仰卡：装填即刻给玩家提示——信仰更名「虚境」并永恒锚定。 */
        if (_np && _np.locked) emit('✦ 虚境信仰已锚定：信仰更名为「虚境」且<b>不可更改/不可卸下</b>，全产加成翻倍永久生效。');
      }
    }
    return true;
  }
  /* 拔下指定槽（UI 逐槽按钮走这里）。 */
  function removeCard(s, slot, emit) {
    ensureCards(s);
    if (!s.cards || !s.cards[slot]) return false;
    if (cardBlocked(s, null, slot) !== null) return false;
    return setCardAt(s, slot, null, emit);
  }

  /* 每个政体各有一次免费采用；自动随市政授予的当前政体也记作已采用。 */
  function govFirstAdoptionFree(s, id) {
    return !!govById(id) && !(s.govAdopted && s.govAdopted[id]);
  }
  function govBlocked(s, id) {
    if (!govById(id)) return '没有这个政体';
    if (s.gov === id) return null;
    if (!govOwned(s, id)) return '需先完成解锁它的市政';
    if (govFirstAdoptionFree(s, id)) return null;
    var cost = govCost(s);
    if (cost > 0 && (s.res.culture || 0) < cost)
      return '换政体需 ' + cost + ' 市政点（现有 ' + Math.floor(s.res.culture || 0) + '）';
    return null;
  }
  function canSetGov(s, id) { return govBlocked(s, id) === null; }

  function setGov(s, id, emit) {
    if (s.gov === id) return false;
    if (!canSetGov(s, id)) return false;
    var firstFree = govFirstAdoptionFree(s, id);
    var fee = firstFree ? 0 : govCost(s);
    if (fee > 0) s.res.culture -= fee;
    s.gov = id;
    s.govAdopted = s.govAdopted || {};
    s.govAdopted[id] = true;
    /* ERA6（2026-10-12）：采用三个新政体之一且尚未起名 ⇒ 弹窗命名（采用 = 命名时机，
     *   与用户规格「采用时弹窗命名、更名为 XX 教权国/联盟/联邦」一致）。无 DOM 环境
     *   （e2e 沙箱）直接跳过，govName 留空不报错。采用其它政体不触发。 */
    if ((id === 'theo_state' || id === 'egalitarianism' || id === 'federalism')
        && !(s.govName && s.govName.trim())
        && SB.game && SB.game.maybeGovNamingPopup) {
      SB.game.maybeGovNamingPopup(s, id);
    }
    ensureCards(s);                              // 换政体 ⇒ 槽数变 ⇒ s.cards 按 index 截断/补 null
    if (emit) emit(s.gov === null
      ? '政体已撤回。'
      : '政体换为「' + govById(id).name + '」' +
        (firstFree ? '（该政体首次采用免费）' : fee > 0 ? '（花 ' + fee + ' 市政点）' : '（免费）'));
    return true;
  }

  /* 卡槽数 = 当前政体给的槽；装了几张 = 记了几张（本作只有 1 张，留出扩展位）。
   * ⚠️ 数字由配方**现算**，不存第二份（配方是政体的属性，读它才有「换政体 = 换槽位」这回事）。 */
  function slots(s) {
    return slotList(s).length;
  }
  /* 当前政体的槽位配方，展开成**有序的槽位列表**（`[{type:'wild'}, ...]`）。
   * 顺序稳定，所以「第 0 号槽」这个概念才有意义 —— 单值 `s.card` 就装在第 0 号槽里。
   * ⚠️ 没采用任何政体时给空数组：面板会画「不提供政策卡槽」，而不是画一个空格子骗人。 */
  function slotList(s) {
    var g = govById(s.gov);
    if (!g || !g.slots) return [];
    var out = [], k;
    for (k in g.slots) {
      for (var i = 0; i < (g.slots[k] || 0); i++) out.push({ type: k });
    }
    /* 奇观送的宗教槽（2026-10-01 ERA4）：欧'洛瓦宗座教堂 effect.religSlot。叠加在政体自带槽之上。 */
    var _rs = wonderReligSlots(s);
    for (var _ri = 0; _ri < _rs; _ri++) out.push({ type: 'relig' });
    /* ERA5（2026-10-02）：夏'多桑大剧院送的市政政策槽（wonderCivicSlots），叠加在政体自带槽之上。 */
    var _cs = wonderCivicSlots(s);
    for (var _ci = 0; _ci < _cs; _ci++) out.push({ type: 'wild' });
    /* ERA7（2026-10）：超古代市政送的市政政策槽（civicPolicySlots），叠加在政体自带槽之上。 */
    var _ps = civicPolicySlots(s);
    for (var _pi = 0; _pi < _ps; _pi++) out.push({ type: 'wild' });
    return out;
  }
  /* 政策卡能进哪种槽。万能槽吃一切；卡的 type 缺省视为万能（老卡没标类型 ⇒ 不硬堵）。 */
  function cardFits(card, slotType) {
    if (!card) return false;
    if (slotType === 'wild' || !card.type) return true;
    return card.type === slotType;
  }
  function slotTypeName(t) { return SLOT_TYPES[t] ? SLOT_TYPES[t].name : t; }

  // ── 效果读出（economy 的唯一入口）────────────────────────────────
  /* 政体与政策卡的**平坦加值/秒**。economy.tick 与 economy.rates 都只读这里，
   * 于是「面板显示 +5/s」与「实际进账 +5/s」是同一份数据（面板/结算同源铁律）。
   * ⚠️ 本函数是纯读数，**任何调用方都可以随便调**——它没有副作用，不记账、不扣点。
   *    扣点在 setCard / setGov / research 里，与它分开。
   * ⚠️ 未知键直接丢弃：将来若给政体加一个 economy 不认识的效果，宁可无声无效，
   *    也不要让 undefined 顺着乘区把整条产线污染成 NaN。 */
  function flow(s) {
    var out = {}, k;
    if (s) {
      var gv = govById(s.gov);
      if (gv) for (k in gv.effect) if (typeof gv.effect[k] === 'number') out[k] = (out[k] || 0) + gv.effect[k];
      /* 卡只在**装着**时生效：逐槽扫 s.cards（多槽升维后 s.card 只是第 0 号槽镜像，
       * 不是事实来源）。研究出市政只是拿到这张卡，没装上就是没选它。 */
      if (s.cards) for (var ci = 0; ci < s.cards.length; ci++) {
        var cd = policyById(s.cards[ci]);
        if (cd && cd.effect) for (k in cd.effect) if (typeof cd.effect[k] === 'number') out[k] = (out[k] || 0) + cd.effect[k];
      }
    }
    return out;
  }

  function effectText(o) {
    var out = [], k;
    for (k in (o || {})) out.push(k === 'kelp' ? '藻食 +' + o[k] + '/秒'
      : k === 'science' ? '科技 +' + o[k] + '/秒' : k + ' +' + o[k]);
    return out.join('，') || '（无直接效果）';
  }
  /* 鼓舞条件的「还差多少」文案，UI 的卡片上直接挂。
   * ⚠️ 达成之后**不印数字比**：条件是「建成 1 级工坊」而工坊已经 2 级时，
   *    condShort 会老实返回 `建成 工坊 2 / 1` —— 读起来像「超出上限、坏掉了」。
   *    数字比只在**还差**的时候有意义，于是达成即改念条件本身。
   *    （科技树那边从不暴露这个问题：它的卡片达成即亮出效果、不显示这一行。）
   * ⚠️ 判据用 boostMet 而不是 condShort 是否为 null —— 后者是「现在算一遍」，
   *    鼓舞一旦达成过就永久算数（rate 类条件会回落），与揭示的判据必须同源。 */
  function boostText(s, c) {
    if (!c.boost) return '无需鼓舞';
    if (boostMet(s, c)) return '鼓舞已达成：' + boostDesc(c);
    var d = condShort(s, c.boost);
    return d ? '鼓舞：' + d.txt : '鼓舞条件已达成';
  }
  /* 鼓舞条件的**目标描述**（不含进度），由 cond 反写一句人话。
   * 加一种 cond 类型时这里要同步补，否则达成后会显示成一句干巴巴的兜底。 */
  function boostDesc(c) {
    var b = c.boost;
    switch (b.t) {
      case 'built': return '建成 ' + b.n + ' 级' + buildingName(b.b);
      case 'tech': return '掌握科技「' + techName(b.id) + '」';
      case 'civic': {
        var _civic = byId(b.id);
        return '完成市政「' + (_civic ? _civic.name : '另一项市政') + '」';
      }
      case 'total': return '建筑总级数达 ' + b.n;
      case 'res': return '存量 ' + resName(b.r) + ' 达 ' + b.n;
      case 'gathered': return '累计产出 ' + resName(b.r) + ' 达 ' + b.n;
      case 'pop': return '人口达 ' + b.n;
      /* zoneLvl（2026-09-30）：分区合计等级。分区名从 BUILD_ZONES 取，不另写清单。 */
      case 'zoneLvl': {
        var _zname = '未知区域';
        for (var _zi = 0; SB.BUILD_ZONES && _zi < SB.BUILD_ZONES.length; _zi++)
          if (SB.BUILD_ZONES[_zi].id === b.zone) _zname = SB.BUILD_ZONES[_zi].name;
        return _zname + '建筑合计等级达 ' + b.n;
      }
      /* ⚠️ 2026-10-04：原写死「匠人」是**显示 bug** —— 现存 job 型鼓舞是 merchant（本表 229 行
       *    `boost:{t:'job', j:'merchant', n:20}`），却被印成「匠人达 20 人」。改读实际职业名。
       *    匠人职业本身已按用户指令删除（config.JOBS）。 */
      case 'job': {
        var _jn = (SB.JOBS || []).filter(function (x) { return x.id === b.j; })[0];
        return (_jn ? _jn.name : '未知职业') + '达 ' + b.n + ' 人';
      }
      case 'techs': return '掌握 ' + b.n + ' 项科技';
      case 'coef': return '破壳系数达 ' + b.n;
      default: return '条件已满足';
    }
  }
  function buildingName(id) {
    for (var i = 0; SB.BUILDINGS && i < SB.BUILDINGS.length; i++)
      if (SB.BUILDINGS[i].id === id) return SB.BUILDINGS[i].name;
    return '未知建筑';
  }
  function techName(id) {
    for (var i = 0; SB.TECHS && i < SB.TECHS.length; i++)
      if (SB.TECHS[i].id === id) return SB.TECHS[i].name;
    return '未知科技';
  }
  function resName(id) { return SB.RESS && SB.RESS[id] ? SB.RESS[id].name : '未知资源'; }

  SB.CIVICS = CIVICS;
  SB.GOVS = GOVS;
  SB.POLICIES = POLICIES;
  SB.civic = {
    byId: byId, govById: govById, policyById: policyById,
    panelOpen: panelOpen, panelBlock: panelBlock,
    condMet: condMet, condShort: condShort, boostMet: boostMet, isRevealed: isRevealed,
    pump: pump,
    layout: layout, geo: geo, eraAnchorX: eraAnchorX, visibleEra: visibleEra,
    /* pitch 按当前 geo 现算（卡片尺寸是借来的，写死在导出对象里会与 geo 脱钩）。 */
    pitch: function () { var G = geo(); return { col: G.W + GEO.COL, row: G.H + GEO.ROW }; },
    reqsMet: reqsMet, blocked: blocked, hasResearchable: hasResearchable, canResearch: canResearch, research: research,
    topCost: topCost, cardCost: cardCost, govCost: govCost, govRoutineMul: govRoutineMul,
    cardOwned: cardOwned, govOwned: govOwned,
    cardBlocked: cardBlocked, canSetCard: canSetCard, setCard: setCard, setCardAt: setCardAt,
    removeCard: removeCard,
    govFirstAdoptionFree: govFirstAdoptionFree,
    govBlocked: govBlocked, canSetGov: canSetGov, setGov: setGov,
    slots: slots, slotList: slotList, cardFits: cardFits, slotTypeName: slotTypeName,
    currentSlotType: currentSlotType,
    flow: flow, effectText: effectText, boostText: boostText,
    govCraftRatio: govCraftRatio, cardCraftRatio: cardCraftRatio, govLuxuryMul: govLuxuryMul, govHappyBonus: govHappyBonus,
    /* ERA3（2026-09-30）：君主制的建造消耗乘数、仓储乘区、王权神授/农奴制的动态乘区。 */
    govBuildCostMul: govBuildCostMul, storeMul: storeMul,
    castleFaithMul: castleFaithMul, serfKelpMul: serfKelpMul, serfWarmMul: serfWarmMul,
    /* 三个乘区出口：政策卡的「效果 +100%」各自挂在卡的一个字段上，
     * 由这三个函数统一读出（实现见 policyMul）。 */
    squareMul: squareMul, templeMul: templeMul, libraryMul: libraryMul,
    /* ERA4（2026-10-01 用户设计稿）效果读数出口：happiness / faith / culture / bank / canal / 宗教槽。 */
    govHappyConsumeMul: govHappyConsumeMul, canalSaveMul: canalSaveMul, bankMerchantMul: bankMerchantMul,
    coreFaithMul: coreFaithMul, universityMul: universityMul, templeFaithMul: templeFaithMul,
    /* ERA8 市政（2026-10-18）：动态卡读数五件（见各函数头注）。 */
    dynFaithCardMul: dynFaithCardMul, cardFeverStarMul: cardFeverStarMul,
    civicFarsightStarMul: civicFarsightStarMul, cardPlanetOutMul: cardPlanetOutMul,
    govAllOutMul: govAllOutMul, govFaithMul: govFaithMul, govOldFaithMul: govOldFaithMul,
    cardResOutMul: cardResOutMul, cardPopFaithMul: cardPopFaithMul, cardWonderBuildSave: cardWonderBuildSave,
    cardBreakCoefMul: cardBreakCoefMul,
    cardWonderBuildSaveEra: cardWonderBuildSaveEra, cardFoodOutMul: cardFoodOutMul,
    cardCompanyBonusMul: cardCompanyBonusMul, cardBreakStardustMul: cardBreakStardustMul, cardSciToCivic: cardSciToCivic,
    cardFaithAllProdDouble: cardFaithAllProdDouble, cardCraftRatioRecipes: cardCraftRatioRecipes, buildingFaithMul: buildingFaithMul,
    /* ERA10 市政（2026-10-20）：五条新卡读数。economy.launchCycleOf / launchHydroPer / faithRate、
     *   economy-social.happyBurn、workshop.craftMul 各读其一（各自单一落点）。 */
    cardLaunchCycle: cardLaunchCycle, cardLaunchHydroMul: cardLaunchHydroMul,
    cardFaithOutMul: cardFaithOutMul, cardHappyConsumeMul: cardHappyConsumeMul,
    cardOurSeaCraftMul: cardOurSeaCraftMul,
    faithNameLocked: faithNameLocked, faithDisplayName: faithDisplayName,
    cardVrCraftRatio: cardVrCraftRatio,
    museumCivicMul: museumCivicMul, scribeCivicMul: scribeCivicMul,
    theaterMul: theaterMul, theaterCivicMul: theaterCivicMul,
    cardCivicOutMul: cardCivicOutMul, cardSciOutMul: cardSciOutMul,
    cardHydroMul: cardHydroMul, cardHappyOffset: cardHappyOffset,
    cardHappyOffsetFor: cardHappyOffsetFor,
    theoFaithBonus: theoFaithBonus, wonderEraCivicBonus: wonderEraCivicBonus,
    wonderReligSlots: wonderReligSlots, wonderCivicSlots: wonderCivicSlots,
    /* ERA7（2026-10 实装）：政策卡/市政的动态效果读数出口。 */
    civicPolicySlots: civicPolicySlots, builtWonderCount: builtWonderCount,
    popCapPerPopBldg: popCapPerPopBldg, cardPopCapFlat: cardPopCapFlat, cardPopGrowthTimeMul: cardPopGrowthTimeMul,
    cardJobOutMul: cardJobOutMul, cardSpaceBuildSave: cardSpaceBuildSave,
    cardObsSciMul: cardObsSciMul, stadiumCivic: stadiumCivic,
    wonderCivicGainMul: wonderCivicGainMul, cardWonderLuxSaveMul: cardWonderLuxSaveMul,
    /* ERA6（2026-10-12 实装）效果读数出口。 */
    civicPerPop: civicPerPop, cardLuxConsumeMul: cardLuxConsumeMul, faithPerBuildingBonus: faithPerBuildingBonus,
    govHydroPerPop: govHydroPerPop, govMinePerPop: govMinePerPop, govCraftPerPop: govCraftPerPop,
    govCivicOutMul: govCivicOutMul, govSciOutMul: govSciOutMul, govMermanFoodMul: govMermanFoodMul,
    /* ERA6（2026-10-12 实装）：三个新政体的「玩家起名 + 城堡更名」读数出口。 */
    govTitleSuffix: govTitleSuffix, govTitleName: govTitleName, castleDisplayName: castleDisplayName
  };
})(typeof window !== 'undefined' ? window : globalThis);
