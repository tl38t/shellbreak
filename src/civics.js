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
 * 3. 政体 / 政策卡。**换**东西要收费：换政策卡 = 最高已完成市政的 cost；
 *    换政体 = 两倍。首次装填 / 首次采用免费（市政本身是白的，再收一次等于同一动作收两遍）。
 *
 * ── 结构上的三条取舍（结构归我定，数值归用户）──
 *
 * · 槽位：酋邦制给 1 个政策卡槽（用户「就降到 1 吧」）。era1 恰好有 2 张卡 ⇒
 *   必须有取舍，换卡收费才不是收了个寂寞（这是《技艺》与《神秘主义》的唯一竞争）。
 * · 树形：三条里《法典》无 cost、无鼓舞，是根；《技艺》《神秘主义》都以它为例
 *   （reqs: ['laws']）——这样「树」才成立，且两条之间玩家可以自己决定顺序。
 *   ⚠️ 《技艺》《神秘主义》之间**没有**互相前置：两条都解锁自己的政策卡，
 *      而卡槽只有 1 个 ⇒ 选哪张是玩家真要做出的取舍。
 * · 政体：酋邦制（法典自带）+ 独裁/寡头/古典共和（由《政治哲学》解锁，三选一采用）。
 *   换政体机制（2× 收费、越权拦截、槽位配方）已落地，三种新政体立即生效，无需返工。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  // ── 数据 ──────────────────────────────────────────────────────────
  /* cost 单位 = 市政点。boost = 鼓舞条件（复用 tech.condMet 的语义）。
   * gov / card 字段标明这项市政「送」的是什么——它们不产生直接资源效果。 */
  var CIVICS = [
    /* 法典：0 点、无鼓舞 ⇒ 面板一开就能直接投点。Civ6 的法典是 40 点且要鼓舞
     * 「改良 3 块地」，本作按用户口径做成白送的根节点（Civ6 是 20 点，本作更宽松，
     * 因为这里它还要同时派出「酋邦制」这个政体）。
     * ⚠️ 它解锁的政体**自带**：完成即采用，不收第一次的「换政体」费。 */
    /* ⚠️ layer = **列号**，市政树横卷几何的唯一依据（与 techs.js 的 layer 同义）。
     *    法典在根、两个子节点并列在同一列 ⇒ 摊开是一张 (列 × 行) 的齿梳状，
     *    不是一条竖着排的清单。改它等于改树形状，e2e 的「市政树几何」一节会跟着红。 */
    { id: 'laws',   name: '法典',   cost: 0,   era: 1, layer: 1, reqs: [], boost: null,
      gov: 'tribe',
      desc: '定下规矩：解锁政体「酋邦制」。',
      note: '基础市政，无需鼓舞。' },

    /* 技艺：鼓舞 = 工坊 1 级（青铜术解锁后才建得起）。
     * ⚠️ 政策卡《技艺》的效果「工坊各项发明消耗 −5%」在骨材删除后**没有附着点**——
     *    工坊因为那条加工线作废而成了空壳，它的新内容正是下一步要设计的。
     *    所以这张卡**已可装填、但不产生任何效果**，UI 上明确标「待工坊内容」。
     *    等工坊有了消耗侧，把 eff 填上并接进 flow() 即可；别偷偷把它改成别的效果。 */
    { id: 'craft',  name: '技艺',   cost: 100, era: 1, layer: 2, reqs: ['laws'],
      boost: { t: 'built', b: 'workshop', n: 1 },
      card: 'card_craft',
      desc: '解锁政策卡「技艺」。',
      note: '鼓舞：建成 1 级工坊。' },

    /* 神秘主义：鼓舞 = 完成科技「海潮占卜」。
     * ⚠️ 效果由用户于 2026-09-27 拍为「科技 +0.3/秒」（原案 +1.0，他批了 +0.3）。
     *    这是**平坦加值**不是乘区：写进 economy.tick 的 science 行（乘区 mul() 那套管不到它），
     *    且**只有装上《神秘主义》卡才生效**——研究出市政不等于白拿。 */
    { id: 'mystic', name: '神秘主义', cost: 100, era: 1, layer: 2, reqs: ['laws'],
      boost: { t: 'tech', id: 'tiddivine' },
      card: 'card_mystic',
      desc: '解锁政策卡「神秘主义」：科技产出 +0.3/秒。',
      note: '鼓舞：完成科技「海潮占卜」。' },

    /* ══ 纪元二 · 第一层（2026-09-28 用户规格）════════════════════════
     * 【为什么两项都 reqs ['laws']，而不是分别接着《技艺》《神秘主义》】
     *   若各自挂到 era1 的末项上，玩家就必须先在「对外贸易 / 戏剧与诗歌」之间
     *   选一条走 —— 而幕后的《技艺》《神秘主义》两张卡抢的是**同一个万能槽**
     *   （文件头 §3）。把新层再吊进那次取舍，就等于逼玩家在两条支线上做第二次
     *   二选一，而这条二选一他根本没有余裕：槽位只有 1 个。
     *   ⇒ 两项都挂根《法典》，玩家两条支线都能走到这一层，真正在等他的是
     *     「商人 vs 广场」这两个产能，而不是又一次互斥。
     * 【两者之间也互不前置】与 era1 那两条同规矩：玩家可以自己决定先做哪一项。
     * 【cost 定案：era2 四项 = 250/300/600/500，2026-09-29 用户拍板「开始实装」。
     *   era1 那两条是 100；本层 250。再调 = 新一轮标定，须用户重拍。 */
    { id: 'trade', name: '对外贸易', cost: 250, era: 2, layer: 3, reqs: ['laws'],
      boost: { t: 'tech', id: 'lighting' },
      /* ⚠️【`job` 是新字段：职业解锁的市政通路】其余职业都靠科技 eff.unlockJob 反查，
       *    商人是个例外——它的解锁权在市政身上（用户规格明写「对外贸易解锁职业商人」）。
       *    folk.jobUnlocked 现在同时反查两侧，见那里的注释。
       * ⚠️ 这个字段不产生任何资源效果，它只是「放出一个人」——与上面 `gov`/`card`
       *    同型：效果由别处读走，这里只登记「本项送的是什么」。 */
      job: 'merchant',
      desc: '解锁职业「商人」——奢侈品的唯一进项。',
      note: '鼓舞：完成科技「照明」。' },

    { id: 'drama', name: '戏剧与诗歌', cost: 300, era: 2, layer: 3, reqs: ['laws'],
      /* ⚠️ `wonder` 这个条件类型是 2026-09-28 新加的（tech.js 的 condMet），
       *    原先 12 种类型里没有「建成一座奇观」，写进去会静默永远达不成。 */
      boost: { t: 'wonder', n: 1 },
      card: 'card_drama',
      desc: '解锁建筑「广场」，以及政策卡「戏剧与诗歌」。',
      note: '鼓舞：建成一座奇观。' },

    /* ══ 纪元二 · 第二层（2026-09-28 用户规格）════════════════════════
     * 【为什么两项都 reqs ['drama'] 且互不前置】与上面第一层那两条同一个道理：
     *   用户明写「戏剧与诗歌引出神学市政」「戏剧与诗歌引出历史记录市政」⇒ 两项的共同
     *   前置就是《戏剧与诗歌》。挂到别的节点上会与他的描述对不上。
     *   第二层是「两条支线」而不是「一次取舍」：《戏剧与诗歌》完成后槽位不再挡人，
     *   《神学》与《历史记录》谁先谁后由玩家定——这与第一层「两项都挂根《法典》」
     *   是同一条几何规则，差别只在它们的共同前置是「一条支线的末项」而不是根。
     * 【cost 定案：era2 四项 = 250/300/600/500，2026-09-29 用户拍板「开始实装」（见上）。 */
    { id: 'theology', name: '神学', cost: 600, era: 2, layer: 4, reqs: ['drama'],
      /* ⚠️ 鼓舞判据 = 人口 `s.pop` 达 25（condMet 的 `pop` 类型，2026-09-28 由用户拍）。
       *    本作人口由住房决定（popCap = 巢 + 珊瑚屋）且只有增长没有上限，
       *    ⇒ 25 是一个**一定能到、但要专门为它建房**的门槛，不会变成死锁。 */
      boost: { t: 'pop', n: 25 },
      card: 'card_theology',
      desc: '解锁信仰资源、建筑「神庙」，以及政策卡「神学」。',
      note: '鼓舞：人口达 25。' },

    { id: 'records', name: '历史记录', cost: 500, era: 2, layer: 4, reqs: ['drama'],
      /* ⚠️ 鼓舞判据 = 潮纹馆（library）达 6 级。`built` 这个条件类型在 tech.js 里
       *    读的是 `s.lvl[c.b]` ⇒ 传**建筑 id**（library）而不是科技 id，写错不报错、
       *    只会永远达不成（与 `wonder` 那条注是同一类静默断链）。 */
      boost: { t: 'built', b: 'library', n: 6 },
      card: 'card_records',
      /* ⚠️ `wonder` 这个字段与上面的 `job` 同型：它只登记「本项送的是什么」，
       *    不产生资源效果。建筑「大图书馆」的解锁权由 habitat.unlocked 读 `s.civics`
       *    自动成立，这里登记出来是为了让面板/回归查得到「《历史记录》送了哪座奇观」。 */
      wonder: 'wonder_great_library',
      desc: '解锁奇观「大图书馆」，以及政策卡「历史记录」。',
      note: '鼓舞：潮纹馆达 6 级。' },

    /* ══ 纪元二 · 第三层 · 政治哲学（2026-09-29 用户规格）════════════════
     * 【为什么 reqs ['records','theology']（第二层两条都要完成）】
     *   用户口径「第三层政治哲学」——它是纪元二的深层汇合点，不是又一个分叉。
     *   第二层《神学》《历史记录》都 reqs《戏剧与诗歌》，政治哲学再 reqs 这两条，
     *   于是玩家必须把第二层两条都走完才进得了这一层（与 Civ6 政治哲学是汇合点同构）。
     *   layer 5（era2 现有到 4）：几何自动拉长一列，e2e「市政树几何」一节不红。
     * 【cost 定案：750】era2 四项是 250/300/600/500，第三层最深层给最高 750。
     *   这是本次新增、用户未单独拍的 cost —— 沿用「越深越贵」规律，若想调告诉我。
     * 【govs 是新字段（复数）】一个市政解锁**三种**政体（Civ6 政治哲学解锁独裁/
     *   寡头/古典共和三选一）。原 `gov` 单值只能挂一条 ⇒ 扩成 `govs` 数组，
     *   govOwned 同步认 `c.govs`。政体采用仍是玩家手动 setGov（research 不自动采用
     *   多政体，避免「研究完政治哲学自动锁死一条政体」）。 */
    { id: 'political', name: '政治哲学', cost: 750, era: 2, layer: 5, reqs: ['records', 'theology'],
      boost: { t: 'tech', id: 'engineeringT' },
      govs: ['autocracy', 'oligarchy', 'classical_republic'],
      desc: '解锁三种政体：独裁统治、寡头统治、古典共和（择一采用）。',
      note: '鼓舞：掌握科技「工程学」。' },

    /* ══ 纪元三 · ERA3 市政扩展（2026-09-30 用户规格表，逐格照录）════════
     * 【鼓舞 = 硬门禁】用户拍板「鼓舞不满足就不能研究」——这正是本文件头 §2 的既有口径：
     *   未揭示的市政不能投点，揭示只由 boostMet 打开 ⇒ 不满足 = 连面板都看不见。
     * 【cost 是提议值，未拍板】规格表没给造价，按 era2 的 250→750 递增规律提
     *   900/900/1000/1100/1200；要调请拍（调它 = 标定，会动整局时长）。
     * 【layer 用规格表原值】王权神授/封建主义 1，其余 2。era3 块的列基准由 layout()
     *   的 eraBase 自动偏移，不需要手写间隔。 */
    { id: 'sovereign', name: '王权神授', cost: 900, era: 3, layer: 1,
      reqs: ['theology', 'political'],
      boost: { t: 'gathered', r: 'faith', n: 10000 },
      card: 'card_sovereign',
      wonder: 'wonder_stt_abbey',
      desc: '解锁政策卡「王权神授」，以及奇观「圣泰坦尼克修道院」。',
      note: '鼓舞：累计信仰产出达 10000。' },
    { id: 'feudalism', name: '封建主义', cost: 900, era: 3, layer: 1,
      reqs: ['records'],
      boost: { t: 'zoneLvl', zone: 'food', n: 100 },
      /* autoUpg 是新字段（本市政送的机制）：生息区建筑自动升级的解锁权归它。
       * game.pumpAuto 与渲染层的开关可见性都读 s.civics.feudalism。 */
      autoUpg: true,
      desc: '解锁政策卡「农奴制」，以及生息区建筑的自动升级（逐建筑开关）。',
      note: '鼓舞：生息区建筑合计等级达 100。' },
    { id: 'market', name: '中世纪集市', cost: 1000, era: 3, layer: 2,
      reqs: ['political'],
      boost: { t: 'gathered', r: 'luxury', n: 10000 },
      card: 'card_market',
      desc: '解锁政策卡「中世纪集市」；商人同时产出科学 +0.05/秒、市政点 +0.05/秒。',
      note: '鼓舞：累计奢侈品产出达 10000。' },
    { id: 'guild', name: '职业行会', cost: 1100, era: 3, layer: 2,
      reqs: ['market'],
      boost: { t: 'zoneLvl', zone: 'workshop', n: 100 },
      card: 'card_guild',
      wonder: 'wonder_grand_bazaar',
      desc: '解锁政策卡「职业行会」（取代技艺），以及奇观「大巴扎」。',
      note: '鼓舞：工坊区建筑合计等级达 100。' },
    { id: 'department', name: '行政部门', cost: 1200, era: 3, layer: 2,
      reqs: ['feudalism'],
      boost: { t: 'pop', n: 70 },
      govs: ['monarchy'],
      /* 额外效果（2026-10-01 ERA4 设计稿）：书手更名为官员，且行政点（市政点）产出 +50%。
       * 改名是 UI 标签、+50% 走 economy.cultureRate 的 scribeCivicMul（department 完成后 ×1.5）。 */
      scribeRename: true, scribeCivicMul: 0.50,
      desc: '解锁政体「君主制」（5 槽：礁栖核心建筑建造消耗 −10%），以及建筑「王国潮道」。书手更名为官员，市政点产出 +50%。',
      note: '鼓舞：人口达 70。' },

    /* ══ 纪元四 · ERA4 市政扩展（2026-10-01 用户设计稿，逐格照录）════════
     * 【cost 是提议值，用户拍「先这样，后续重做」】era3 是 900~1200，era4 提议 1300/1300/1400/1400/1500；
     *   调它 = 标定，会动整局时长，且当前未做总时长核算 ⇒ 暂不调。
     * 【layer 用设计稿原值】探索/归正会 1，其余 2。era4 块的列基准由 layout() 的 eraBase 自动偏移。
     * 【鼓舞 = 硬门禁】与以往同口径：未揭示不能投点。
     * 【7 项参数用户 2026-10-01 全部拍板】① cost 先这样；② 每季发资源 = 所有按时间产出的资源
     *   （取当前速率 ×60s）；③ 商人共和国 5 槽全万能、幸福度消耗 −30%；④ 神权政体每级学术区建筑
     *   +1 信仰、每级市政区建筑 +0.5 信仰；⑤ 博物馆官员市政点 +20%、三角贸易王国潮道 +100%、
     *   启蒙运动潮纹馆/大学 +100%、神庙 −50%；⑥ 艺术品 5000 市政+100 绳 / 潮纹记录 5000 科技+10 钢零件；
     *   ⑦ 探索鼓舞「完成钢铁仓库升级」= 压舱库扩容 II（upg_ballast_2）。 */
    { id: 'explore', name: '探索', cost: 1300, era: 4, layer: 1,
      reqs: ['market'],
      /* 完成钢铁仓库升级 = 压舱库扩容 II（用户拍板映射）。upg_ballast_2 由城堡科技解锁，成本
       * 铁制支架 100 + 硬化珊瑚 150，capMul ×1.5（与 I 叠加 ⇒ ×2.25）。 */
      boost: { t: 'upgrade', id: 'upg_ballast_2' },
      building: 'caravanserai',
      card: 'card_triangular',
      gov: 'merchant_republic',
      /* 每季节判定一次：获得任意资源 1min 的产量（economy.seasonTurn 里实现，取 rates() 当前速率）。 */
      seasonGrant: true,
      desc: '解锁建筑「商队驿站」、政策卡「三角贸易」、政体「商人共和国」；每季节判定一次，获得任意资源 1 分钟产量。',
      note: '鼓舞：完成钢铁仓库升级（压舱库扩容 II）。' },
    { id: 'reformed', name: '归正会', cost: 1300, era: 4, layer: 1,
      reqs: ['department'],
      /* 已建立宗教（religion 鼓舞类型，2026-10-01 新增于 tech.condMet）。
       * ⚠️「且有 70 鲛人」被前置《行政部门》的 pop 70 鼓舞吸收（能研究行政部门即 pop≥70 且只增不减），
       *   故这里只判宗教；若以后想保留独立门槛，把 boost 改成复合条件即可。 */
      boost: { t: 'religion' },
      wonder: 'wonder_olo_wa_cathedral',
      religSlot: 1,
      gov: 'theocracy',
      card: 'card_divine_right',
      desc: '解锁奇观「欧\'洛瓦宗座教堂」(+1 宗教政策卡槽)、政体「神权政体」、政策卡「天赋神权」。',
      note: '鼓舞：已建立宗教（70 鲛人已由前置《行政部门》保证）。' },
    { id: 'mercantilism', name: '重商主义', cost: 1400, era: 4, layer: 2,
      reqs: ['explore'],
      boost: { t: 'job', j: 'merchant', n: 20 },
      card: 'card_mercantilism',
      desc: '解锁政策卡「重商主义」（银行的商人产出加成 +100%）。',
      note: '鼓舞：同时拥有 20 名商人。' },
    { id: 'enlightenment', name: '启蒙运动', cost: 1400, era: 4, layer: 2,
      reqs: ['department'],
      boost: { t: 'built', b: 'observatory', n: 1 },
      card: 'card_enlightenment',
      building: 'museum',
      desc: '解锁政策卡「启蒙运动」（替代历史记录：潮纹馆/大学科技 +100%、神庙信仰 −50%）、建筑「博物馆」。',
      note: '鼓舞：天壳观测站等级 ≥ 1。' },
    { id: 'historiography', name: '历史哲学', cost: 1500, era: 4, layer: 2,
      reqs: ['reformed'],
      boost: { t: 'wonder', n: 6 },
      /* 工艺制品「艺术品 / 潮纹记录」的解锁走配方自身的 needCivic（见 config CRAFTS 的
       *   craft_artwork / craft_tidal_record），与奇观 needCivic 同构；此处不再放死字段。 */
      /* ERA1/2/3 的奇观 +5 市政点获取（economy.cultureRate 的 wonderEraCivicBonus 读它）。 */
      wonderEraCivic: 5,
      desc: '解锁工艺制品「艺术品」「潮纹记录」；ERA1/2/3 的奇观 +5 市政点获取。',
      note: '鼓舞：奇观建立超过 5 座（≥6 座）。' },

    /* ══ 纪元五 · ERA5 市政扩展（2026-10-02 实装，用户规格表逐格照录）════════
     * 【cost 为提议值，未拍板】era4 是 1300~1500，era5 提议 1600/1600/1800/1800/2200；
     *   调它 = 标定，会动整局时长，当前未做总时长核算 ⇒ 暂不调。
     * 【layer】渊潜鲛歌/工业化配给 1，社会科学/城市化 2，国民动员 3（与 era2/era3 同形）。
     * 【鼓舞类型】zoneLvl / gathered / total / pop / wonders —— 全部是 tech.condMet 已支持的现成类型，无新 cond。 */
    { id: 'sharksong', name: '渊潜鲛歌', cost: 1600, era: 5, layer: 1, reqs: ['enlightenment'],
      boost: { t: 'zoneLvl', zone: 'civic', n: 50 },
      wonder: 'wonder_shadow_theater', building: 'theater',
      desc: '解锁奇观「夏\'多桑大剧院」（+5 市政点/秒、+1 政策卡槽），以及建筑「歌剧院」。',
      note: '鼓舞：市政区建筑合计等级达 50。' },
    { id: 'rationing', name: '工业化配给', cost: 1600, era: 5, layer: 1, reqs: ['enlightenment'],
      boost: { t: 'gathered', r: 'steel', n: 10000 },
      card: 'card_rationing',
      desc: '解锁政策卡「工业化配给」「政治经济学」。',
      note: '鼓舞：累计钢产量达 10000。' },
    { id: 'socialscience', name: '社会科学', cost: 1800, era: 5, layer: 2, reqs: ['sharksong'],
      boost: { t: 'total', n: 300 },
      wonder: 'wonder_congress',
      desc: '解锁奇观「国会大厦」（鲛人幸福度消耗 −10%）。',
      note: '鼓舞：建筑总等级达 300。' },
    { id: 'urbanization', name: '城市化', cost: 1800, era: 5, layer: 2, reqs: ['rationing'],
      boost: { t: 'pop', n: 100 },
      card: 'card_logistics', building: 'tenement',
      desc: '解锁建筑「廉租社区」、政策卡「基础物流建设」。',
      note: '鼓舞：总人口达 100（轮回商店「广厦之基」永久提升人口上限）。' },
    { id: 'mobilization', name: '国民动员', cost: 2200, era: 5, layer: 3, reqs: ['socialscience', 'urbanization'],
      boost: { t: 'wonders', ids: ['shellcutter', 'presspipe'] },
      card: 'card_heat_priority',
      desc: '解锁政策卡「热能优先」「总动员令」。',
      note: '鼓舞：建成奇观「天壳切削器」与「高压热机管道」。' }
  ];

  /* 槽位类型。Civ6 是 军事 / 经济 / 外交 / 万能；本作按约束 §2 砍掉军事（没有军事单位）、
   * 外交（没有城邦）⇒ 只剩这三类 + 万能。
   * ⚠️ 本作是纯放置经营、产出线只有「人口 × 职业 × 建筑」⇒ 槽位类型按**经济职能**分，
   *    不按资源分：给了「珊瑚 +X%」这种分类，玩家一眼能看出该塞哪张，反而是好事。 */
  var SLOT_TYPES = {
    wild: { name: '万能槽', desc: '可装填任意类型的政策卡。' },
    prod: { name: '工造槽', desc: '只吃工造类政策卡——加工与建造。' },
    sci:  { name: '科研槽', desc: '只吃科研类政策卡——科技产出。' },
    grow: { name: '民生槽', desc: '只吃民生类政策卡——人口与饮食。' },
    /* relig：宗教槽（ERA4 市政《归正会》解锁）。只吃 relig 类政策卡（天赋神权）。
     * 来源有二：神权政体自带 1 个 + 奇观「欧'洛瓦宗座教堂」再送 1 个（wonder.religSlotBonus）。 */
    relig: { name: '宗教槽', desc: '只吃宗教类政策卡——信仰相关。' }
  };

  /* 政体。effect 是**平坦加值/秒**（不乘季节、不吃采集倍率——它是制度给的，不是人给的）。
   *
   * ⚠️ slots 是**槽位配方**（各类型槽各几个），不是槽位数。2026-09-27 按用户
   *    「政体和政策卡做成文明 6 那样」改的：Civ6 每个政体自带一份配方
   *    （部落制 = 1 军事 + 1 经济；古典共和 = 2 经济 + 1 外交 + 1 万能），
   *    换政体 = 换槽位配方 + 换被动，这才是「政体」这个选择的分量所在。
   *    酋邦制现在是 `{ wild: 1 }` —— 一个万能槽。
   *
   * ⚠️⚠️ 加第二个槽时这套数据会与状态脱钩：`s.card` 是**单值**（装在第 0 号槽里），
   *     状态层此刻**只承载 1 个槽**。所以：
   *       · 只加配方不迁状态 ⇒ 面板会画出两个空格子、而装填第二个永远失败；
   *       · 正确做法 = 状态层一起升维（`s.card` → `s.cards: []`，`cardEver` → `cardsEver` 之类），
   *         `setCard` / `cardBlocked` / `flow` / 渲染四处一起改。
   *     这条在 e2e 里有一条断言钉着（「配方槽数 vs 状态能承载的槽数」），改配方时它会先红。 */
  var GOVS = [
    { id: 'tribe', name: '酋邦制', slots: { wild: 1 }, effect: { kelp: 5 },
      desc: '藻食产出 +5/秒。' },

    /* ══ 三种政体（2026-09-29 用户规格，由市政《政治哲学》解锁）══════════════
     * 玩家研究《政治哲学》后三选一采用（setGov），换政体 = 2× 最高已完成市政。
     * ⚠️【effect 是空的，但这是刻意的，不是漏装】三种效果都不是「平坦加值/秒」
     *    （那是 flow() 通道，政体采用即生效、不依赖装在槽里），而是：
     *      · 独裁的 +10% 工坊效率 → 走 `craftRatio` 加法乘区（workshop.craftRatio 读）；
     *      · 寡头的 +20% 奢侈品产出 → 走 `luxuryMul`（economy 商人行乘，与马具 toolMul 独立）；
     *      · 古典共和的 +1 幸福度 → 走 `happyBonus` 偏移量（economy happy 段，喂高 happyMul 档）。
     *    这些效果**只有采用该政体时才生效**（govById(s.gov) 读当前政体），没采用 = 0。
     * ⚠️【slots 全用 {wild:1} 是故意的】三种政体都给 1 个万能槽 ⇒ 配方槽数(1) ≤ 状态层
     *    承载(1)，不触发 e2e 那条「换槽要升维状态」的断言（s.card 仍是单值）。
     *    要差异化槽位（独裁给工造槽之类）是下一步，用户没拍 ⇒ 先聚焦三个效果本身。 */
    { id: 'autocracy', name: '独裁统治', slots: { wild: 3 }, effect: {},
      craftRatio: 0.10,
      desc: '工艺制作效率 +10%（石梁等工坊产物）。' },
    { id: 'oligarchy', name: '寡头统治', slots: { wild: 3 }, effect: {},
      luxuryMul: 1.2,
      desc: '奢侈品产出 +20%（商人贸易供给）。' },
    { id: 'classical_republic', name: '古典共和', slots: { wild: 3 }, effect: {},
      happyBonus: 1,
      desc: '幸福度 +1（常驻，提高全产乘区档位）。' },

    /* ══ 君主制（2026-09-30 用户规格 · 市政《行政部门》解锁）══════════════
     * 5 个万能槽（比三种纪元二政体多 2 个）。效果不是平坦加值也不是产出乘区，
     * 而是「礁栖核心建筑建造消耗 −10%」——挂 buildSave 字段，由 govBuildCostMul(s)
     * 读出成 ×0.9 的成本乘数，economy.costOf 对 zone==='core' 的建筑乘上它
     * （costOf 是显示与扣费的唯一来源 ⇒ 面板与结算天然同源）。 */
    { id: 'monarchy', name: '君主制', slots: { wild: 5 }, effect: {},
      buildSave: 0.10,
      desc: '5 个政策卡槽；礁栖核心建筑建造消耗 −10%。' },

    /* ══ ERA4 政体（2026-10-01 用户设计稿）════════
     * 商人共和国：5 个万能槽（与君主制同数）；幸福度消耗 −30%（happyConsumeMul 0.7，
     *   economy.happyBurn 读）。效果不走平坦加值/秒，是消耗侧的偏移。
     * 神权政体：3 万能 + 1 宗教槽（relig 槽型，只吃天赋神权卡）；每级学术区建筑 +1 信仰、
     *   每级市政区建筑 +0.5 信仰（faithPerAcademy/faithPerCivic，economy.faithRate 读，
     *   加在基础人口产出之上）。 */
    { id: 'merchant_republic', name: '商人共和国', slots: { wild: 5 }, effect: {},
      happyConsumeMul: 0.7,
      desc: '5 个万能政策卡槽；幸福度消耗 −30%。' },
    { id: 'theocracy', name: '神权政体', slots: { wild: 3, relig: 1 }, effect: {},
      faithPerAcademy: 1, faithPerCivic: 0.5,
      desc: '3 万能槽 + 1 宗教槽；每级学术区建筑 +1 信仰、每级市政区建筑 +0.5 信仰。' }
  ];

  /* 政策卡。effect 同样是平坦加值/秒，且**只有在卡槽里装着它时才生效**。
   * ⚠️ type 决定它**能进哪种槽**（规则见 cardFits）。era1 现在只有 1 个万能槽 ⇒
   *    两条卡都能塞、类型此刻**不产生取舍**——这是「只搬外壳」那一轮的预期结果，
   *    等第二个槽出现、且它不是万能槽时，类型约束才开始咬人。 */
  var POLICIES = [
    { id: 'card_craft',  name: '技艺',     civic: 'craft',  type: 'prod', effect: {}, craftRatio: 0.20,
      /* retiredBy（2026-09-30）：市政《职业行会》完成后这张卡退役——
       *   cardOwned 对它返回 false（装不了新槽），research('guild') 会把已装的自动拔下
       *   （免费，退役是制度行为不是玩家动作）。字段存的是**市政 id**（guild）不是卡 id。 */
      retiredBy: 'guild',
      desc: '工坊效率 +20%（工艺制作产出，装在卡槽里才生效）。' },
    { id: 'card_mystic', name: '神秘主义', civic: 'mystic', type: 'sci',  effect: { science: 0.3 },
      desc: '科技产出 +0.3/秒。' },
    /* ⚠️⚠️【这张卡的 effect 是空的，但它不是漏装】用户规格是「效果：广场效果 +100%」，
     *    而**政策卡的 effect 走的是 `flow()` 那条平坦加值/秒的通道**（上面神秘主义
     *    那种）。「广场 +100%」是一个**乘区**，塞进平坦加值通道会变成「每秒多给
     *    ×2 市政点」——那是把「这座建筑变强」曲解成「凭空产两份」，完全不是一回事。
     *    ⇒ 所以效果挂在 `squareMul` 这个字段上，由下面 `squareMul(s)` 单独取。
     *    ⚠️ 判断口径照抄文件头：空壳要能分清「漏装还是刻意」，这里刻意，
     *       理由就写在这三行里，别留给下一个人去猜。 */
    { id: 'card_drama',  name: '戏剧与诗歌', civic: 'drama', type: 'sci',
      effect: {}, squareMul: 2,
      desc: '广场的市政点乘区 ×2（即「广场效果 +100%」）。' },
    /* ⚠️⚠️【effect 空壳与 squareMul / templeMul 是**刻意**的，不是漏装】
     *    与《戏剧与诗歌》那一条同一个道理：政策卡的 `effect` 走的是 `flow()` 那条
     *    平坦加值/秒的通道，而「效果 +100%」是**乘区**。塞进平坦通道会变成
     *    「每秒多给 ×2 这个东西」——把「建筑变强」曲解成「凭空产两份」。
     *    ⇒ 乘区挂在函数字段上，由下面 `templeMul(s)` 单独取。
     *    ⚠️ 装配判据（e2e 那条「装卡」用的）走的是 `effect` 非空 —— 这让这两张卡的
     *       effect 为空 ⇒ 整局模拟永远不会把卡装上 ⇒ 乘区整局不生效。改判据的时候
     *       记得这四张卡（craft / drama / theology / records）都是「空壳 + 乘区字段」，
     *       判据要比「乘区字段是否存在」，不是比 effect 非空。 */
    { id: 'card_theology', name: '神学', civic: 'theology', type: 'sci',
      effect: {}, templeMul: 2,
      desc: '神庙的信仰产出乘区 ×2（即「神庙效果 +100%」）。' },
    { id: 'card_records',  name: '历史记录', civic: 'records', type: 'sci',
      effect: {}, libraryMul: 2,
      /* retiredBy（2026-10-01 ERA4）：市政《启蒙运动》完成后这张卡退役——
       * 「启蒙运动」卡（libraryMul ×2 + universityMul ×2）是它的完全上位替代。 */
      retiredBy: 'enlightenment',
      desc: '潮纹馆的科技加成 ×2（即「图书馆效果」翻倍，不含研究所那一份）。' },

    /* ── ERA3 市政扩展的 4 张卡（2026-09-30 用户规格表）──
     * ⚠️【type 留空 = 视同万能】（cardFits 对缺 type 的卡不硬堵）。四张卡的效果
     *    都不属于现有三类（工造/科研/民生）的任何一类——硬归类只会误导玩家；
     *    槽位目前全是万能槽，类型约束还没开始咬人，等差异化槽位落地再标。
     * ⚠️【三张是「动态乘区」，一张是静态乘区】
     *   · card_market：storeMul:2 是**静态**字段 → 走 MUL_FIELD 表（与广场/神庙/图书馆同通道）；
     *   · card_sovereign / card_serfdom 的效果随**建筑等级**变（城堡每级+10%、藻场↔牧场互乘），
     *     静态字段表达不了 ⇒ 各自一个读数函数（castleFaithMul / serfKelpMul / serfWarmMul），
     *     读 s.cards 判断「装没装」——同一纪律：研究出市政只是拿到卡，没装 = 0。 */
    { id: 'card_sovereign', name: '王权神授', civic: 'sovereign',
      effect: {},
      desc: '城堡每级增加 10% 信仰产出（装在卡槽里才生效）。' },
    { id: 'card_serfdom', name: '农奴制', civic: 'feudalism',
      effect: {},
      desc: '每级牧场给藻场效果 +1%，每级藻场给牧场效果 +1%（互乘，装在卡槽里才生效）。' },
    { id: 'card_market', name: '中世纪集市', civic: 'market', type: 'sci',
      effect: {}, storeMul: 2,
      desc: '仓储区所有建筑的仓储 +100%（即海藻仓/压舱仓/灯塔的容量贡献翻倍）。' },
    { id: 'card_guild', name: '职业行会', civic: 'guild', type: 'prod',
      effect: {}, craftRatio: 0.40,
      desc: '工坊效率 +40%（取代「技艺」；研究完成后技艺卡退役）。' },

    /* ── ERA4 政策卡（2026-10-01 用户设计稿）──
     * 字段沿用既有通道：静态乘区走 MUL_FIELD（libraryMul 等）、动态/其余走专用读数函数
     * （canalSaveMul / bankMerchantMul / coreFaithMul / universityMul / templeFaithMul，见下方）。
     * ⚠️ type 留空 = 视同万能（cardFits 对缺 type 不硬堵），这里按卡的性质填 prod/sci/relig。 */
    { id: 'card_triangular', name: '三角贸易', civic: 'explore', type: 'prod', effect: {},
      /* 王国潮道效果额外 +100%：canalSaveMul(s) 读它，乘在 canalLuxSave 那一段上（economy 奢侈需求 D）。 */
      canalMul: 2,
      desc: '王国潮道（运河）效果额外 +100%（居民奢侈品消耗减免翻倍）。' },
    { id: 'card_divine_right', name: '天赋神权', civic: 'reformed', type: 'relig', effect: {},
      /* 礁栖核心所有建筑每级 +10% 信仰产出：coreFaithMul(s) 读它，乘在 faithRate 整段上。 */
      coreFaithMul: 0.10,
      desc: '礁栖核心所有建筑每级 +10% 信仰产出（替代「王权神授」）。' },
    { id: 'card_mercantilism', name: '重商主义', civic: 'mercantilism', type: 'prod', effect: {},
      /* 银行的商人产出加成 +100%：bankMerchantMul(s) 读它，乘在 bankLux 那一段上。 */
      bankMerchantMul: 2,
      desc: '银行的商人产出加成 +100%。' },
    { id: 'card_enlightenment', name: '启蒙运动', civic: 'enlightenment', type: 'sci', effect: {},
      /* 替代《历史记录》：潮纹馆科技 +100%（libraryMul，走 MUL_FIELD）、大学科技 +100%
       * （universityMul）、神庙信仰 −50%（templeFaithMul）。三处各自一个读数函数。 */
      libraryMul: 2, universityMul: 2, templeFaithMul: 0.5,
      desc: '潮纹馆、大学的科技加成 +100%，神庙信仰加成 −50%（替代「历史记录」）。' },

    /* ── ERA5 政策卡（2026-10-02 实装）──
     * 字段沿用既有通道：craftRatio / happyOffset / retiredBy / squareMul / storeMul / 新动态乘区字段。
     * ⚠️ type 留空 = 视同万能（cardFits 对缺 type 不硬堵），与 era3/era4 同口径。
     * ⚠️【cost 为提议值，未拍板】同轮市政节点顺延。 */
    { id: 'card_rationing', name: '工业化配给', civic: 'rationing', type: 'prod', effect: {},
      /* 幸福度 −1（cardHappyOffset，economy 幸福恒温器 _gb 段读）；工坊效率 +40%（craftRatio，加法乘区）。 */
      happyOffset: -1, craftRatio: 0.40,
      desc: '幸福度 −1；工坊（工艺制作）效率 +40%。' },
    { id: 'card_political_econ', name: '政治经济学', civic: 'rationing', type: 'sci', effect: {},
      /* 替代《戏剧与诗歌》（retiredBy）：广场效果 ×2.5（squareMul）+ 歌剧院效果 ×2.5（theaterMul，新通道）。 */
      retiredBy: 'drama', squareMul: 2.5, theaterMul: 2.5,
      desc: '广场的市政点乘区 ×2.5、歌剧院的官员市政点乘区 ×2.5（取代「戏剧与诗歌」）。' },
    { id: 'card_logistics', name: '基础物流建设', civic: 'urbanization', type: 'prod', effect: {},
      /* 替代《中世纪集市》（retiredBy）：仓储区建筑容量 ×3（storeMul，走 MUL_FIELD）。 */
      retiredBy: 'market', storeMul: 3,
      desc: '仓储区建筑容量 ×3（取代「中世纪集市」）。' },
    { id: 'card_heat_priority', name: '热能优先', civic: 'mobilization', effect: {},
      /* 市政/科技产出 −50%（cardCivicOutMul / cardSciOutMul）；热液能供给 +100%（cardHydroMul）。 */
      civicOutMul: 0.5, sciOutMul: 0.5, hydroSupplyMul: 2,
      desc: '市政与科技产出 −50%，热液能（蒸汽）供给 +100%。' },
    { id: 'card_mobilization', name: '总动员令', civic: 'mobilization', effect: {},
      /* 闲置鲛人每提供 1% 破壳速度（shellSpeedPerIdle）。⚠️ 天穹钻机机器态（wonder_skydrill 的运转速度）
       *   尚未实装，此效果通道暂挂起——字段预留、不接读数函数，等机器态落地再接线。 */
      shellSpeedPerIdle: 0.01,
      desc: '每点闲置鲛人提供 1% 破壳速度（待天穹钻机机器态实装后生效）。' }
  ];

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
  /* ⚠️⚠️【踩过的坑：乘区字段是按**建筑**分的，但「装没装卡」要看的是 `s.card`】
   *    早期版本写成 `policyMul(s, 'card_drama', 'squareMul')`，把卡 id 写死在参数里
   *    ⇒ 不看 `s.card` 是誰 ⇒ 恒返回那张卡的乘区值。症状是四条断言同时红：
   *    「没装卡时 squareMul = 1」拿到 2、「装卡 ×2」的比值变成 1（3.3 → 3.3）、
   *    「拔下」不回到 1、以及 cultureRate 被凭空顶到 1.1（0.45×2 + 0.2）。
   *    ⚠️ 关键在于两件事必须分开：*哪张卡*来自 `s.card`，*取哪个字段*由卡决定。
   *        所以先查 `s.card`，再用卡 id 去查它该看哪个字段（下面那张表）。
   *        写成「按建筑查字段、拿 s.card 当参数」是这条的镜像错误，同样会错。 */
  var MUL_FIELD = {
    card_drama: 'squareMul', card_theology: 'templeMul', card_records: 'libraryMul',
    /* 中世纪集市（2026-09-30）：仓储区建筑的容量贡献 ×2。静态字段，走同一张表。 */
    card_market: 'storeMul',
    /* 启蒙运动（2026-10-01 ERA4）：潮纹馆科技 +100%，与《历史记录》同字段（卡退役后不冲突）。 */
    card_enlightenment: 'libraryMul',
    /* ERA5（2026-10-02）：政治经济学卡——歌剧院的官员市政点乘区 ×2.5（theaterMul）。 */
    card_political_econ: 'theaterMul'
  };
  function policyMul(s, cardId) {
    if (!cardId) return 1;                       // 槽是空的（或还没这一项）⇒ 没有乘区
    var cd = policyById(cardId);
    if (!cd) return 1;                           // 装了一张不存在的卡：当没有，别让 NaN 往下走
    var f = MUL_FIELD[cardId];
    return (f && typeof cd[f] === 'number') ? cd[f] : 1;
  }
  /* 三个乘区出口各自**只认自己字段的那张卡**：squareMul 只乘带 squareMul 字段的卡，
   * 不碰别人槽里带 libraryMul / templeMul 的卡。否则装《戏剧与诗歌》+《历史记录》两张，
   * squareMul 会把《历史记录》的 ×2 也乘进来（症状：squareMul=4 而不是 2）。
   * ⚠️ 多个槽 ⇒ 同字段的卡**逐槽相乘**（理论上可装多张广场卡，乘区叠加），空槽/没装 = 1。 */
  function mulOfField(s, field) {
    var arr = (s && s.cards) || [], m = 1, id, cd;
    for (var i = 0; i < arr.length; i++) {
      id = arr[i]; if (!id) continue;
      if (MUL_FIELD[id] === field) {
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
  /* 王权神授：城堡每级 +10% 信仰产出。乘在 faithRate 的整段产出上（economy 读）。 */
  function castleFaithMul(s) {
    if (!cardSlotted(s, 'card_sovereign')) return 1;
    var r = (SB.BLD && SB.BLD.castleFaithRatio) || 0.10;
    return 1 + (s.lvl.castle || 0) * r;
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
  function bankMerchantMul(s) {
    if (!cardSlotted(s, 'card_mercantilism')) return 1;
    var cd = policyById('card_mercantilism');
    return (cd && typeof cd.bankMerchantMul === 'number') ? cd.bankMerchantMul : 1;
  }
  /* 天赋神权卡：礁栖核心所有建筑每级 +10% 信仰产出（coreFaithMul 存的是每级比率）。
   * 乘在 faithRate 整段上，coreLevels = 礁栖核心分区建筑合计等级。 */
  function coreFaithMul(s) {
    if (!cardSlotted(s, 'card_divine_right')) return 1;
    var cd = policyById('card_divine_right');
    var ratio = (cd && typeof cd.coreFaithMul === 'number') ? cd.coreFaithMul : 0;
    var lv = 0, _i;
    if (SB.BUILDINGS) for (_i = 0; _i < SB.BUILDINGS.length; _i++)
      if (SB.BUILDINGS[_i].zone === 'core') lv += (s.lvl[SB.BUILDINGS[_i].id] || 0);
    return 1 + lv * ratio;
  }
  /* 启蒙运动卡：大学科技 +100%（universityMul）。economy 的学者/研究所科技段读。 */
  function universityMul(s) {
    if (!cardSlotted(s, 'card_enlightenment')) return 1;
    var cd = policyById('card_enlightenment');
    return (cd && typeof cd.universityMul === 'number') ? cd.universityMul : 1;
  }
  /* 启蒙运动卡：神庙信仰 −50%（templeFaithMul 0.5）。economy.faithMul 读（乘神庙那一段）。 */
  function templeFaithMul(s) {
    if (!cardSlotted(s, 'card_enlightenment')) return 1;
    var cd = policyById('card_enlightenment');
    return (cd && typeof cd.templeFaithMul === 'number') ? cd.templeFaithMul : 1;
  }
  /* 博物馆建筑：官员（书手）市政点产出 +20%（museumCivicMul，flat）。economy.cultureRate 的 scribe 段读。 */
  function museumCivicMul(s) { return (s.lvl.museum || 0) >= 1 ? 1.20 : 1; }
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
  function cardCivicOutMul(s) { return cardFieldMul(s, 'civicOutMul'); }
  function cardSciOutMul(s)   { return cardFieldMul(s, 'sciOutMul'); }
  function cardHydroMul(s)    { return cardFieldMul(s, 'hydroSupplyMul'); }
  function cardHappyOffset(s) {
    var o = 0, arr = (s && s.cards) || [], i, cd;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      cd = policyById(arr[i]);
      if (cd && typeof cd.happyOffset === 'number') o += cd.happyOffset;
    }
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

  // ── 几何（横卷）──────────────────────────────────────────────────
  /* 与 tech.js 的 layout() **同构**：列 = `layer`、行 = 排版产物、连线 = `reqs`。
   * 用户 2026-09-27 的口径是「市政树要做成科技树这样」，所以两张树必须长得一样，
   * 几何也照抄同一套算法（连行的分配规则都一致：「同列不许撞行，其余尽量紧凑」）。
   *
   * ⚠️ 刻意**不共用函数**：科技树那条带纪元横幅与 eraAnchorX（点纪元按钮滚过去），
   *    市政现在只有一个纪元、也没有跳转按钮。等两边都稳定了再合并。
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
    var i, t, e, maxL = {}, eraBase = {}, base = 0, blocks = [];

    for (i = 0; i < C.length; i++) {
      t = C[i];
      maxL[t.era] = Math.max(maxL[t.era] || 1, t.layer || 1);
    }
    /* 纪元基准：前一个纪元用满之后空一列当分隔。目前三条都在纪元一，这里只出一条块；
     * 以后加纪元二的市政，不用改这个函数。 */
    for (e = 1; e <= 12; e++) {
      if (!maxL[e]) break;
      eraBase[e] = base;
      blocks.push({ era: e, x0: base, cols: maxL[e], start: base });
      base += maxL[e] + 1;
    }

    /* 行分配：按 (全局列, 声明序) 扫一遍，每列从 0 找第一个空行。
     * ⇒ 法典独占第 0 列第 0 行，技艺与神秘主义同在第 1 列、一上一下，互不撞行。 */
    var used = {}, order = [], cells = {};
    for (i = 0; i < C.length; i++) order.push(C[i]);
    order.sort(function (a, b) {
      var ca = colOf(a, eraBase), cb = colOf(b, eraBase);
      return ca - cb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    for (i = 0; i < order.length; i++) {
      t = order[i];
      var col = colOf(t, eraBase), row = 0;
      while (used[col] && used[col][row]) row++;
      (used[col] = used[col] || {})[row] = true;
      cells[t.id] = {
        id: t.id, era: t.era, layer: t.layer || 1, col: col, row: row,
        x: G.PADX + col * COL_PITCH,
        y: G.PADY + row * ROW_PITCH
      };
    }

    var maxCol = 0, maxRow = 0;
    for (var k in cells) {
      if (cells[k].col > maxCol) maxCol = cells[k].col;
      if (cells[k].row > maxRow) maxRow = cells[k].row;
    }
    var w = G.PADX * 2 + maxCol * COL_PITCH + G.W;
    var h = G.PADY * 2 + maxRow * ROW_PITCH + G.H;

    /* 连线：前置节点右腰 → 本节点左腰，三次贝塞尔。两端都得在 cells 里
     * （数据写错 id 时静默少线，e2e 有断言盯着 reqs 数）。 */
    var edges = [];
    for (i = 0; i < C.length; i++) {
      t = C[i];
      if (!t.reqs || !t.reqs.length) continue;
      var to = cells[t.id];
      if (!to) continue;
      for (var r = 0; r < t.reqs.length; r++) {
        var from = cells[t.reqs[r]];
        if (!from) continue;
        var x1 = from.x + G.W, y1 = from.y + G.H / 2;
        var x2 = to.x, y2 = to.y + G.H / 2;
        var dx = Math.max(40, (x2 - x1) / 2);
        edges.push({
          from: t.reqs[r], to: t.id,
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
  /* 列号 = 纪元基准 + layer − 1。那个 −1 与 tech.js 的 colOf 是同一个换算
   * （layer 1 起点、列坐标 0 起点），少了它长卷最左边会凭空多出一块死区。 */
  function colOf(t, eraBase) {
    return (eraBase[t.era] || 0) + (t.layer || 1) - 1;
  }

  // ── 面板开门 ──────────────────────────────────────────────────────
  /* 判据 = 议事厅建成 ≥ 1 级（派生，不存档）。
   * 为什么不额外要求「已掌握 N 项科技」：石工本身要求石头 100，已经是一道不轻的门槛；
   * 再加一道科技数就是三重 gate，而 era1 时长已被证明对 gate 敏感
   * （住房 ratio 一档的改动 = 整局 +56%，见 CIVICS §2 约束 4）。 */
  function panelOpen(s) { return !!s && (s.lvl.hall || 0) >= 1; }
  function panelBlock(s) {
    if (!s || !(s.lvl.hall || 0)) return '先建成议事厅（由「石工」解锁）——它同时是书手的岗位来源。';
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
    for (var i = 0; i < CIVICS.length; i++) {
      var c = CIVICS[i];
      if (c.era && c.era > (s.era || 1)) continue;
      if (!s.civBoost) s.civBoost = {};
      if (c.boost && !s.civBoost[c.id] && condMet(s, c.boost)) s.civBoost[c.id] = 1;
      if (s.civShown[c.id]) continue;
      if (!(s.civics[c.id] || boostMet(s, c))) continue;   // ⚠️ 收市政对象，见 boostMet 那条注
      s.civShown[c.id] = 1;
      n++;
      if (emit) emit('市政已揭示：' + c.name + '（' + c.desc + '）');
    }
    return n;
  }

  // ── 研究市政 ──────────────────────────────────────────────────────
  function reqsMet(s, c) {
    for (var i = 0; i < c.reqs.length; i++) if (!s.civics || !s.civics[c.reqs[i]]) return false;
    return true;
  }
  /* 返回 null 表示可以研究，否则返回「为什么不行」——这句会挂成灰按钮的 title。 */
  function blocked(s, c) {
    if (s.civics[c.id]) return null;
    if (!isRevealed(s, c.id)) return '尚未揭示——先达成鼓舞条件';
    if (!reqsMet(s, c)) {
      var need = [];
      for (var i = 0; i < c.reqs.length; i++) if (!s.civics[c.reqs[i]]) need.push(byId(c.reqs[i]).name);
      return '需先完成：' + need.join('、');
    }
    if ((s.res.culture || 0) < c.cost) return '市政点 ' + Math.floor(s.res.culture || 0) + ' / ' + c.cost;
    return null;
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
    if (emit) emit('市政完成：' + c.name + '（' + c.desc + '）');
    /* 政体随《法典》自带。用 s.gov 是否为 null 判「还没采用过」而不是靠 cost 判——
     * 老档读进来时 gov 可能是 null，这条免费路径必须仍然走得到。 */
    if (c.gov && !s.gov) s.gov = c.gov;
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
      s.card = s.cards[0] || null;
    }
    return true;
  }

  // ── 换卡 / 换政体 ─────────────────────────────────────────────────
  /* 「当前最高完成的市政」的 cost。空手时算 0（这时也确实无卡可换）。 */
  function topCost(s) {
    var m = 0;
    for (var i = 0; i < CIVICS.length; i++) {
      var c = CIVICS[i];
      if (s.civics && s.civics[c.id] && c.cost > m) m = c.cost;
    }
    return m;
  }
  function cardCost(s) { return topCost(s); }        // 换政策卡 = 1× 最高已完成市政
  function govCost(s) { return topCost(s) * 2; }     // 换政体 = 2×，原话「两倍」

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
  function govCraftRatio(s) { var g = govById(s.gov); return g && typeof g.craftRatio === 'number' ? g.craftRatio : 0; }
  /* ⚠️ 政策卡的 craftRatio（2026-09-30 用户拍：技艺卡 = 工坊效率 +20%）。
   * 与 govCraftRatio 同一条加法乘区、同一纪律：数据在政策卡表、读在这里，
   * **装在卡槽里才生效**（没装 = 0），多个槽逐槽相加（可装多张带 craftRatio 的卡，叠加）。
   * 读 s.cards 数组（与 mulOfField 同口径），单值 s.card 只是第 0 号槽镜像。 */
  function cardCraftRatio(s) {
    var arr = (s && s.cards) || [], m = 0, id, cd;
    for (var i = 0; i < arr.length; i++) {
      id = arr[i]; if (!id) continue;
      cd = policyById(id);
      if (cd && typeof cd.craftRatio === 'number') m += cd.craftRatio;
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

  /* 换卡 blocked 文案。与科技 studyBlocked 同口径：要指得出**该做什么**。
   * ⚠️ `id === null` 是「拔下」这个动作，不是「装一张名为 null 的卡」——
   *    早期版本让 null 掉进 policyById 返回 '没有这张卡'，于是卡永远拔不下来，
   *    而症状只是「按钮点了没反应」，不会报任何错。 */
  /* ⚠️ 2026-09-27 用户拍板：**拔下也收费**。原口径是「装新卡才收、拔下免费」，
   *    玩家可以「拔下 → 换个槽 → 重装」把换卡费整条绕过去（拔下后槽是空的，
   *    若按「空槽 → 免费」判就白嫖了）。⇒ 拔下与装填是**同一笔操作的两半**，都收一次。
   *
   * ⚠️ 收费判据只有一条：`s.cardEver`（人生第一次装填由 setCard 置位，一次性标记）。
   *    **不能**用「槽现在是空的」来判断免费 —— 那个判据天然可被「先拔下」绕开。
   * ⚠️ `id === null` 是「拔下」这个动作，不是「装一张名为 null 的卡」（早期版本
   *    让 null 掉进 policyById 返回 '没有这张卡'，于是卡永远拔不下来，
   *    而症状只是「按钮点了没反应」，不报任何错）。拔下必须一路走到收费判据。 */
  /* ── 多槽状态层（2026-09-29 升维：s.card 单值 → s.cards 数组）──
   * 一个政体给 N 个槽（酋邦制 1、三种纪元二政体各 3），s.cards[i] = 第 i 槽装的政策卡 id。
   * s.card 仍是第 0 号槽的**镜像**（只用于旧代码/回归读方便，不是事实来源）。
   * ⚠️ 改政体 ⇒ 槽数变 ⇒ s.cards 按 index 截断/补 null（多出来的槽直接丢，
   *    保留的槽里那张卡还在）。这是「换政体 = 换槽位配方」的应有之义。 */
  function ensureCards(s) {
    if (!s.cards || !Array.isArray(s.cards)) s.cards = [];
    var L = slotList(s).length, out = [], i;
    for (i = 0; i < L; i++) out.push(s.cards[i] || null);
    s.cards = out;
    s.card = out[0] || null;
  }
  function inSlot(s, id) { return !!(s.cards && s.cards.indexOf(id) >= 0); }
  function firstEmpty(s) {
    var L = slotList(s).length;
    for (var i = 0; i < L; i++) if (!s.cards || !s.cards[i]) return i;
    return -1;                       // 全满
  }
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
      if (!s.cardEver) return null;                    // 人生第一次免费
      var cost = cardCost(s);
      if (cost > 0 && (s.res.culture || 0) < cost)
        return '换卡需 ' + cost + ' 市政点（现有 ' + Math.floor(s.res.culture || 0) + '）';
      return null;
    }
    /* 拔下：slot 指定拔哪格（UI 逐槽按钮），不指定则拔第一格有卡的。 */
    var sl = (slot !== undefined && slot !== null) ? slot : firstFilled(s);
    if (sl < 0) return null;                          // 没卡可拔 ⇒ 无动作不收钱
    if (!s.cardEver) return null;
    var c2 = cardCost(s);
    if (c2 > 0 && (s.res.culture || 0) < c2)
      return '拔下需 ' + c2 + ' 市政点（现有 ' + Math.floor(s.res.culture || 0) + '）';
    return null;
  }
  function canSetCard(s, id) { return cardBlocked(s, id) === null; }
  /* 当前第 0 号槽的类型。无槽时返回 null ⇒ 「不提供卡槽」的政体下任何卡装不进。 */
  function currentSlotType(s) {
    var L = slotList(s);
    return L.length ? L[0].type : null;
  }

  function setCard(s, id, emit) {
    ensureCards(s);
    var clear = (id === null || id === undefined);
    if (!clear && inSlot(s, id)) return false;        // 已装备 ⇒ 幂等无动作
    if (!canSetCard(s, id)) return false;
    var slot = clear ? firstFilled(s) : (firstEmpty(s) >= 0 ? firstEmpty(s) : firstFilled(s));
    if (slot < 0) return false;                        // 没卡可拔（拔下时）
    return setCardAt(s, slot, id, emit);
  }
  /* 核心写入：把第 slot 号槽设为 id（id 为 null = 拔下）。判据由 cardBlocked 先过。 */
  function setCardAt(s, slot, id, emit) {
    ensureCards(s);
    if (slot < 0 || slot >= s.cards.length) return false;
    var tid = (id === undefined || id === null) ? null : id;
    if (s.cards[slot] === tid) return false;
    var fee = s.cardEver ? cardCost(s) : 0;
    if (fee > 0) s.res.culture -= fee;
    s.cardEver = true;                                // 拔下同样置位：也是一次「调整政策卡」
    s.cards[slot] = tid;
    s.card = s.cards[0] || null;
    if (emit) {
      if (tid === null) emit('政策卡已拔下' + (fee > 0 ? '（花 ' + fee + ' 市政点）' : '（免费）') + '。');
      else emit('政策卡换为「' + policyById(tid).name + '」' +
        (fee > 0 ? '（花 ' + fee + ' 市政点）' : '（人生第一次装填，免费）'));
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

  function govBlocked(s, id) {
    if (!govById(id)) return '没有这个政体';
    if (s.gov === id) return null;
    if (!govOwned(s, id)) return '需先完成解锁它的市政';
    if (s.gov === null) return null;                        // 首次采用免费
    var cost = govCost(s);
    if (cost > 0 && (s.res.culture || 0) < cost)
      return '换政体需 ' + cost + ' 市政点（现有 ' + Math.floor(s.res.culture || 0) + '）';
    return null;
  }
  function canSetGov(s, id) { return govBlocked(s, id) === null; }

  function setGov(s, id, emit) {
    if (s.gov === id) return false;
    if (!canSetGov(s, id)) return false;
    var fee = govCost(s);
    if (s.gov !== null && fee > 0) s.res.culture -= fee;
    s.gov = id;
    ensureCards(s);                              // 换政体 ⇒ 槽数变 ⇒ s.cards 按 index 截断/补 null
    if (emit) emit(s.gov === null
      ? '政体已撤回。'
      : '政体换为「' + govById(id).name + '」' +
        (fee > 0 && s.gov !== null ? '（花 ' + fee + ' 市政点）' : '（首次采用免费）'));
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
      case 'total': return '建筑总级数达 ' + b.n;
      case 'res': return '存量 ' + resName(b.r) + ' 达 ' + b.n;
      case 'gathered': return '累计产出 ' + resName(b.r) + ' 达 ' + b.n;
      case 'pop': return '人口达 ' + b.n;
      /* zoneLvl（2026-09-30）：分区合计等级。分区名从 BUILD_ZONES 取，不另写清单。 */
      case 'zoneLvl': {
        var _zname = b.zone;
        for (var _zi = 0; SB.BUILD_ZONES && _zi < SB.BUILD_ZONES.length; _zi++)
          if (SB.BUILD_ZONES[_zi].id === b.zone) _zname = SB.BUILD_ZONES[_zi].name;
        return _zname + '建筑合计等级达 ' + b.n;
      }
      case 'job': return '匠人达 ' + b.n + ' 人';
      case 'techs': return '掌握 ' + b.n + ' 项科技';
      case 'coef': return '破壳系数达 ' + b.n;
      default: return '条件已满足';
    }
  }
  function buildingName(id) {
    for (var i = 0; SB.BUILDINGS && i < SB.BUILDINGS.length; i++)
      if (SB.BUILDINGS[i].id === id) return SB.BUILDINGS[i].name;
    return id;
  }
  function techName(id) {
    for (var i = 0; SB.TECHS && i < SB.TECHS.length; i++)
      if (SB.TECHS[i].id === id) return SB.TECHS[i].name;
    return id;
  }
  function resName(id) { return SB.RESS && SB.RESS[id] ? SB.RESS[id].name : id; }

  SB.CIVICS = CIVICS;
  SB.GOVS = GOVS;
  SB.POLICIES = POLICIES;
  SB.civic = {
    byId: byId, govById: govById, policyById: policyById,
    panelOpen: panelOpen, panelBlock: panelBlock,
    condMet: condMet, condShort: condShort, boostMet: boostMet, isRevealed: isRevealed,
    pump: pump,
    layout: layout, geo: geo,
    /* pitch 按当前 geo 现算（卡片尺寸是借来的，写死在导出对象里会与 geo 脱钩）。 */
    pitch: function () { var G = geo(); return { col: G.W + GEO.COL, row: G.H + GEO.ROW }; },
    reqsMet: reqsMet, blocked: blocked, canResearch: canResearch, research: research,
    topCost: topCost, cardCost: cardCost, govCost: govCost,
    cardOwned: cardOwned, govOwned: govOwned,
    cardBlocked: cardBlocked, canSetCard: canSetCard, setCard: setCard, setCardAt: setCardAt,
    removeCard: removeCard,
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
    museumCivicMul: museumCivicMul, scribeCivicMul: scribeCivicMul,
    theaterMul: theaterMul, theaterCivicMul: theaterCivicMul,
    cardCivicOutMul: cardCivicOutMul, cardSciOutMul: cardSciOutMul,
    cardHydroMul: cardHydroMul, cardHappyOffset: cardHappyOffset,
    theoFaithBonus: theoFaithBonus, wonderEraCivicBonus: wonderEraCivicBonus,
    wonderReligSlots: wonderReligSlots, wonderCivicSlots: wonderCivicSlots
  };
})(typeof window !== 'undefined' ? window : globalThis);
