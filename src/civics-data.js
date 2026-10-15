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
    { id: 'laws',   name: '法典',   icon: 'assets/civic-icons/era-1/era1-laws.png', cost: 0,   era: 1, layer: 1, reqs: [], boost: null,
      gov: 'tribe',
      desc: '定下规矩：解锁政体「酋邦制」。',
      note: '基础市政，无需鼓舞。' },

    /* 技艺：鼓舞 = 工坊 1 级（青铜术解锁后才建得起）。
     * ⚠️ 政策卡《技艺》的效果「工坊各项发明消耗 −5%」在骨材删除后**没有附着点**——
     *    工坊因为那条加工线作废而成了空壳，它的新内容正是下一步要设计的。
     *    所以这张卡**已可装填、但不产生任何效果**，UI 上明确标「待工坊内容」。
     *    等工坊有了消耗侧，把 eff 填上并接进 flow() 即可；别偷偷把它改成别的效果。 */
    { id: 'craft',  name: '技艺',   icon: 'assets/civic-icons/era-1/era1-craft.png', cost: 100, era: 1, layer: 2, reqs: ['laws'],
      boost: { t: 'built', b: 'workshop', n: 1 },
      card: 'card_craft',
      desc: '解锁政策卡「技艺」。',
      note: '鼓舞：建成 1 级工坊。' },

    /* 神秘主义：鼓舞 = 完成科技「海潮占卜」。
     * ⚠️ 效果由用户于 2026-09-27 拍为「科技 +0.3/秒」（原案 +1.0，他批了 +0.3）。
     *    这是**平坦加值**不是乘区：写进 economy.tick 的 science 行（乘区 mul() 那套管不到它），
     *    且**只有装上《神秘主义》卡才生效**——研究出市政不等于白拿。 */
    { id: 'mystic', name: '神秘主义', icon: 'assets/civic-icons/era-1/era1-mystic.png', cost: 100, era: 1, layer: 2, reqs: ['laws'],
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
    { id: 'trade', name: '对外贸易', icon: 'assets/civic-icons/era-2/era2-trade.png', cost: 800, era: 2, layer: 3, reqs: ['laws'],
      boost: { t: 'tech', id: 'lighting' },
      /* ⚠️【`job` 是新字段：职业解锁的市政通路】其余职业都靠科技 eff.unlockJob 反查，
       *    商人是个例外——它的解锁权在市政身上（用户规格明写「对外贸易解锁职业商人」）。
       *    folk.jobUnlocked 现在同时反查两侧，见那里的注释。
       * ⚠️ 这个字段不产生任何资源效果，它只是「放出一个人」——与上面 `gov`/`card`
       *    同型：效果由别处读走，这里只登记「本项送的是什么」。 */
      job: 'merchant',
      desc: '解锁职业「商人」——奢侈品的唯一进项。',
      note: '鼓舞：完成科技「照明」。' },

    { id: 'drama', name: '戏剧与诗歌', icon: 'assets/civic-icons/era-2/era2-drama.png', cost: 900, era: 2, layer: 3, reqs: ['laws'],
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
    { id: 'theology', name: '神学', icon: 'assets/civic-icons/era-2/era2-theology.png', cost: 1400, era: 2, layer: 4, reqs: ['drama'],
      /* ⚠️ 鼓舞判据 = 人口 `s.pop` 达 25（condMet 的 `pop` 类型，2026-09-28 由用户拍）。
       *    本作人口由住房决定（popCap = 巢 + 珊瑚屋）且只有增长没有上限，
       *    ⇒ 25 是一个**一定能到、但要专门为它建房**的门槛，不会变成死锁。 */
      boost: { t: 'pop', n: 25 },
      card: 'card_theology',
      desc: '解锁信仰资源、建筑「神庙」，以及政策卡「神学」。',
      note: '鼓舞：人口达 25。' },

    { id: 'records', name: '历史记录', icon: 'assets/civic-icons/era-2/era2-records.png', cost: 1200, era: 2, layer: 4, reqs: ['drama'],
      /* ⚠️ 鼓舞判据 = 潮纹馆（library）达 6 级。`built` 这个条件类型在 tech.js 里
       *    读的是 `s.lvl[c.b]` ⇒ 传**建筑 id**（library）而不是科技 id，写错不报错、
       *    只会永远达不成（与 `wonder` 那条注是同一类静默断链）。 */
      boost: { t: 'built', b: 'library', n: 6 },
      card: 'card_records',
      /* ⚠️ `wonder` 这个字段与上面的 `job` 同型：它只登记「本项送的是什么」，
       *    不产生资源效果。建筑「大图书馆」的解锁权由 habitat.unlocked 读 `s.civics`
       *    自动成立，这里登记出来是为了让面板/回归查得到「《历史记录》送了哪座奇观」。 */
      wonder: 'wonder_great_library',
      desc: '解锁奇观「大潮纹馆」，以及政策卡「历史记录」。',
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
    { id: 'political', name: '政治哲学', icon: 'assets/civic-icons/era-2/era2-political.png', cost: 1500, era: 2, layer: 5, reqs: ['records', 'theology'],
      boost: { t: 'tech', id: 'engineeringT' },
      govs: ['autocracy', 'oligarchy', 'classical_republic'],
      desc: '解锁三种政体：独裁统治、寡头统治、古典共和（择一采用）。',
      note: '鼓舞：掌握科技「工程学」。' },

    /* ══ 纪元三 · ERA3 市政扩展（2026-09-30 用户规格表，逐格照录）════════
     * 【鼓舞 = 硬门禁】用户拍板「鼓舞不满足就不能研究」——这正是本文件头 §2 的既有口径：
     *   未揭示的市政不能投点，揭示只由 boostMet 打开 ⇒ 不满足 = 连面板都看不见。
     * 【cost 是提议值】规格表没给造价，按 era2 的 250→750 递增规律提
     *   900/900/1000/1100/1200；要调请拍（调它 = 标定，会动整局时长）。
     *   ⚠️ 2026-10-05 用户拍板：**王权神授 900 → 2000**（「这个高了」）⇒
     *   块内现为 2000/900/1000/1100/1200，不再是等差。其余仍是未拍板的提议值。
     * 【layer 用规格表原值】王权神授/封建主义 1，其余 2。era3 块的列基准由 layout()
     *   的 eraBase 自动偏移，不需要手写间隔。 */
    { id: 'sovereign', name: '王权神授', icon: 'assets/civic-icons/era-3/era3-sovereign.png', cost: 8000, era: 3, layer: 1,
      reqs: ['theology', 'political'],
      boost: { t: 'gathered', r: 'faith', n: 10000 },
      card: 'card_sovereign',
      wonder: 'wonder_stt_abbey',
      desc: '解锁政策卡「王权神授」，以及奇观「圣泰坦尼克修道院」。',
      note: '鼓舞：累计信仰产出达 10000。' },
    { id: 'feudalism', name: '封建主义', icon: 'assets/civic-icons/era-3/era3-feudalism.png', cost: 3000, era: 3, layer: 1,
      reqs: ['records'],
      boost: { t: 'zoneLvl', zone: 'food', n: 100 },
      /* autoUpg 是新字段（本市政送的机制）：生息区建筑自动升级的解锁权归它。
       * game.pumpAuto 与渲染层的开关可见性都读 s.civics.feudalism。 */
      autoUpg: true,
      desc: '解锁政策卡「农奴制」，以及生息区建筑的自动升级（逐建筑开关）。',
      note: '鼓舞：生息区建筑合计等级达 100。' },
    { id: 'market', name: '中世纪集市', icon: 'assets/civic-icons/era-3/era3-market.png', cost: 4000, era: 3, layer: 2,
      reqs: ['political'],
      boost: { t: 'gathered', r: 'luxury', n: 10000 },
      card: 'card_market',
      desc: '解锁政策卡「中世纪集市」；商人同时产出科学 +0.05/秒、市政点 +0.05/秒。',
      note: '鼓舞：累计奢侈品产出达 10000。' },
    { id: 'guild', name: '职业行会', icon: 'assets/civic-icons/era-3/era3-guild.png', cost: 5000, era: 3, layer: 2,
      reqs: ['market'],
      /* ⚠️ 2026-10-06 用户拍板：鼓舞「工坊区建筑合计等级 100」⇒ 改成
       *   **「建筑总等级 55」** —— 不只是把数字从 100 调成 55，**口径也换了**：
       *   `t:'zoneLvl'`（限工坊区）→ `t:'total'`（全部建筑的等级总和）。
       *   `total` 分支在 tech.condMet / condShort 早就有了（tech.js:185/277/660），
       *   社交科学那条「建筑总等级 300」用的就是它 ⇒ 无新机制。
       *   影响：达成难度结构变了——限区要求玩家把工坊区堆到 100，全区则可由任意建筑凑够
       *   55。门槛降 + 口径放宽，所以这是明确的**变容易**方向。 */
      boost: { t: 'total', n: 55 },
      card: 'card_guild',
      wonder: 'wonder_grand_bazaar',
      desc: '解锁政策卡「职业行会」（取代技艺），以及奇观「大巴扎」。',
      note: '鼓舞：建筑总等级达 55。' },
    { id: 'department', name: '行政部门', icon: 'assets/civic-icons/era-3/era3-department.png', cost: 6000, era: 3, layer: 2,
      reqs: ['feudalism'],
      /* ⚠️ 2026-10-06 用户拍板：人口 70 → 55（与同批「建筑总等级 100→55」一起降门槛）。 */
      boost: { t: 'pop', n: 55 },
      govs: ['monarchy'],
      /* 额外效果（2026-10-01 ERA4 设计稿）：书手更名为官员，且行政点（市政点）产出 +50%。
       * 改名是 UI 标签、+50% 走 economy.cultureRate 的 scribeCivicMul（department 完成后 ×1.5）。 */
      scribeRename: true, scribeCivicMul: 0.50,
      desc: '解锁政体「君主制」（5 槽：礁栖核心建筑建造消耗 −10%），以及建筑「王国潮道」。书手更名为官员，市政点产出 +50%。',
      note: '鼓舞：人口达 55。' },

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
    { id: 'explore', name: '探索', icon: 'assets/civic-icons/era-4/era4-explore.png', cost: 20000, era: 4, layer: 1,
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
    { id: 'reformed', name: '归正会', icon: 'assets/civic-icons/era-4/era4-reformed.png', cost: 25000, era: 4, layer: 1,
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
    { id: 'mercantilism', name: '重商主义', icon: 'assets/civic-icons/era-4/era4-mercantilism.png', cost: 40000, era: 4, layer: 2,
      reqs: ['explore'],
      boost: { t: 'job', j: 'merchant', n: 20 },
      card: 'card_mercantilism',
      desc: '解锁政策卡「重商主义」（银行的商人产出加成 +100%）。',
      note: '鼓舞：同时拥有 20 名商人。' },
    { id: 'enlightenment', name: '启蒙运动', icon: 'assets/civic-icons/era-4/era4-enlightenment.png', cost: 50000, era: 4, layer: 2,
      reqs: ['department'],
      boost: { t: 'built', b: 'observatory', n: 1 },
      card: 'card_enlightenment',
      building: 'museum',
      desc: '解锁政策卡「启蒙运动」（替代历史记录：潮纹馆/大学科技 +100%、神庙信仰 −50%）、建筑「博物馆」。',
      note: '鼓舞：天壳观测站等级 ≥ 1。' },
    { id: 'historiography', name: '历史哲学', icon: 'assets/civic-icons/era-4/era4-historiography.png', cost: 60000, era: 4, layer: 2,
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
    { id: 'sharksong', name: '渊潜鲛歌', icon: 'assets/civic-icons/era-5/era5-sharksong.png', cost: 80000, era: 5, layer: 1, reqs: ['enlightenment'],
      boost: { t: 'zoneLvl', zone: 'civic', n: 50 },
      wonder: 'wonder_shadow_theater', building: 'theater',
      desc: '解锁奇观「夏\'多桑大剧院」（+5 市政点/秒、+1 政策卡槽），以及建筑「歌剧院」。',
      note: '鼓舞：市政区建筑合计等级达 50。' },
    { id: 'rationing', name: '工业化配给', icon: 'assets/civic-icons/era-5/era5-rationing.png', cost: 90000, era: 5, layer: 1, reqs: ['enlightenment'],
      boost: { t: 'gathered', r: 'steel', n: 10000 },
      card: 'card_rationing',
      desc: '解锁政策卡「工业化配给」「政治经济学」。',
      note: '鼓舞：累计钢产量达 10000。' },
    { id: 'socialscience', name: '社会科学', icon: 'assets/civic-icons/era-5/era5-socialscience.png', cost: 110000, era: 5, layer: 2, reqs: ['sharksong'],
      boost: { t: 'total', n: 300 },
      wonder: 'wonder_congress',
      desc: '解锁奇观「国会大厦」（鲛人幸福度消耗 −10%）。',
      note: '鼓舞：建筑总等级达 300。' },
    { id: 'urbanization', name: '城市化', icon: 'assets/civic-icons/era-5/era5-urbanization.png', cost: 120000, era: 5, layer: 2, reqs: ['rationing'],
      boost: { t: 'total', n: 510 },
      card: 'card_logistics', building: 'tenement',
      desc: '解锁建筑「廉租社区」、政策卡「基础物流建设」。',
      note: '鼓舞：建筑总等级达 510。' },
    { id: 'mobilization', name: '国民动员', icon: 'assets/civic-icons/era-5/era5-mobilization.png', cost: 150000, era: 5, layer: 3, reqs: ['socialscience', 'urbanization'],
      boost: { t: 'wonders', ids: ['wonder_shellcutter', 'wonder_presspipe'] },
      card: 'card_heat_priority',
      desc: '解锁政策卡「热能优先」「总动员令」。',
      note: '鼓舞：建成奇观「天壳切削器」与「高压热机管道」。' },

    /* ══ ERA6 市政（2026-10-12 用户规格表 · 实装）══
     * 已拍板设计：意识形态门槛 = 累计市政产出 ≥ 900000（lifetimeCulture，tech.condMet 新类型）；
     *   幸福度新 3 档由 massmedia 门控（economy.happyTier）；博物馆建筑 ratio 2.5 已在 config 改；
     *   文明构造本轮回 +20% 轮回点已在 prestige.doBreak 接；公司系统由 macroeconomics 触发（game.maybeCompanyFound）。
     * ⚠️【cost 为提议值，未标定】量级对齐 era6 顺延，待用户拍板。 */
    { id: 'massmedia', name: '大众传媒', icon: 'assets/civic-icons/era-6/era6-massmedia.png', cost: 200000, era: 6, layer: 1,
      reqs: ['mobilization'], boost: { t: 'built', b: 'tenement', n: 3 },
      card: 'card_massmedia',
      desc: '解锁政策卡「大众传媒」；拓展幸福度等级（兴盛/繁荣/黄金时代）。',
      note: '鼓舞：廉租社区达 3 级。' },
    { id: 'naturalhistory', name: '博物学', icon: 'assets/civic-icons/era-6/era6-naturalhistory.png', cost: 220000, era: 6, layer: 1,
      reqs: ['mobilization'], boost: { t: 'built', b: 'museum', n: 3 },
      card: 'card_museum',
      desc: '解锁政策卡「博物馆管理」；每轮回给艺术品效果 +10%（×1+0.1×cycle）。',
      note: '鼓舞：博物馆达 3 级。' },
    { id: 'macroeconomics', name: '宏观经济学', icon: 'assets/civic-icons/era-6/era6-macro.png', cost: 320000, era: 6, layer: 2,
      reqs: ['massmedia'], boost: { t: 'built', b: 'bank', n: 3 },
      desc: '解锁「公司」标签（藻食/珊瑚两家自动成立，见 game.maybeCompanyFound）。',
      note: '鼓舞：银行达 3 级。' },
    { id: 'urbandesign', name: '城市设计', icon: 'assets/civic-icons/era-6/era6-urbandesign.png', cost: 340000, era: 6, layer: 2,
      reqs: ['massmedia'], boost: { t: 'built', b: 'canal', n: 20 },
      desc: '解锁奇观「全国快速物流通道」（王国潮道每级 +1% 精铁/钢产能，与总物流站互锁翻倍）。',
      note: '鼓舞：王国潮道达 20 级。' },
    { id: 'archaeology', name: '考古学', icon: 'assets/civic-icons/era-6/era6-archaeology.png', cost: 300000, era: 6, layer: 2,
      reqs: ['naturalhistory'], boost: { t: 'cycle', n: 3 },
      desc: '艺术品制造消耗 −20%（craft_artwork 造价 ×0.8，见 workshop.craftCostMul）。',
      note: '鼓舞：轮回数达 3 周目。' },
    { id: 'ideology', name: '意识形态', icon: 'assets/civic-icons/era-6/era6-ideology.png', cost: 380000, era: 6, layer: 2,
      reqs: ['massmedia', 'naturalhistory'], boost: { t: 'lifetimeCulture', n: 900000 },
      card: 'card_national_solidarity',
      desc: '解锁政策卡「国家凝聚力」。',
      note: '鼓舞：累计市政产出达 900000。' },
    { id: 'civilization', name: '文明构造', icon: 'assets/civic-icons/era-6/era6-civilization.png', cost: 500000, era: 6, layer: 3,
      reqs: ['archaeology'], boost: { t: 'cycle', n: 7 },
      desc: '本次轮回，破壳结算轮回点 +20%（prestige.doBreak）。',
      note: '鼓舞：轮回数达 7 周目。' },
    { id: 'theo_merit', name: '神恩与威权', icon: 'assets/civic-icons/era-6/era6-theomerit.png', cost: 420000, era: 6, layer: 3,
      reqs: ['ideology'], boost: { t: 'civic', id: 'ideology' },
      gov: 'theo_state',
      desc: '解锁政体「教权国」（7 政策卡槽，所有建筑每级 +1 信仰/秒）；采用时弹窗命名、城堡更名「圣座居所」。',
      note: '鼓舞：完成市政「意识形态」。' },
    { id: 'egalitarianism', name: '层级理论', icon: 'assets/civic-icons/era-6/era6-egalitarianism.png', cost: 440000, era: 6, layer: 3,
      reqs: ['ideology'], boost: { t: 'civic', id: 'ideology' },
      gov: 'egalitarianism',
      desc: '解锁政体「平等主义」（7 政策卡槽，每名鲛人 +0.1% 工坊/热液/矿井产出）；采用时弹窗命名、城堡更名「人民大厅」。',
      note: '鼓舞：完成市政「意识形态」。' },
    { id: 'federalism', name: '权责对等', icon: 'assets/civic-icons/era-6/era6-federalism.png', cost: 460000, era: 6, layer: 3,
      reqs: ['ideology'], boost: { t: 'civic', id: 'ideology' },
      gov: 'federalism',
      desc: '解锁政体「联邦制」（7 政策卡槽，+10% 科技/市政产出、鲛人食物消耗 −10%）；采用时弹窗命名、城堡更名「国会」。',
      note: '鼓舞：完成市政「意识形态」。' }
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
      desc: '3 万能槽 + 1 宗教槽；每级学术区建筑 +1 faith、每级市政区建筑 +0.5 信仰。' },

    /* ══ ERA6 政体（2026-10-12 用户规格 · 由《神恩与威权》《层级理论》《权责对等》各解锁一条）══
     * 三个都是 7 万能槽（e2e 槽数断言已随多卡槽升维放开）。效果非平坦：
     *   theo_state 每建筑 +1 信仰/秒（faithPerBuilding）；egalitarianism 每鲛人 +0.1% 工坊/热液/矿井
     *   （craftPerPop/hydroPerPop/minePerPop）；federalism +10% 科技&市政、鲛人食物 −10%
     *   （civicOutMul/sciOutMul/mermanFoodMul）。采用即生效，没采用 = 0。 */
    { id: 'theo_state', name: '教权国', slots: { wild: 7 }, effect: {},
      faithPerBuilding: 1,
      desc: '7 个政策卡槽；所有建筑每级 +1 信仰/秒。' },
    { id: 'egalitarianism', name: '平等主义', slots: { wild: 7 }, effect: {},
      craftPerPop: 0.001, hydroPerPop: 0.001, minePerPop: 0.001,
      desc: '7 个政策卡槽；每名鲛人 +0.1% 工坊效率 / +0.1% 热液能产出 / +0.1% 矿井产出。' },
    { id: 'federalism', name: '联邦制', slots: { wild: 7 }, effect: {},
      civicOutMul: 1.1, sciOutMul: 1.1, mermanFoodMul: 0.10,
      desc: '7 个政策卡槽；科技与市政产出 +10%，鲛人食物消耗 −10%。' }
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
      retiredBy: 'reformed',
      desc: '城堡每级增加 10% 信仰产出（装在卡槽里才生效）。完成《归正会》后被「天赋神权」取代而退役。' },
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
      desc: '每点闲置鲛人提供 1% 破壳速度（待天穹钻机机器态实装后生效）。' },

    /* ── ERA6 政策卡（2026-10-12 用户规格）──
     * 字段沿用既有通道：civicPerPop / luxConsumeMul（大众传媒卡）、museumMul（博物馆管理卡）、craftRatio（国家凝聚力卡）。 */
    { id: 'card_massmedia', name: '大众传媒', civic: 'massmedia', type: 'prod', effect: {},
      civicPerPop: 0.5, luxConsumeMul: 0.5,
      desc: '每名鲛人 +0.5 市政点/秒；但奢侈品消耗 +50%。' },
    { id: 'card_museum', name: '博物馆管理', civic: 'naturalhistory', type: 'prod', effect: {},
      museumMul: 2,
      desc: '博物馆效果翻倍（书手市政点 +40% 而非 +20%）；艺术品效果随轮回额外放大。' },
    { id: 'card_national_solidarity', name: '国家凝聚力', civic: 'ideology', type: 'prod', effect: {},
      craftRatio: 0.80,
      desc: '工坊效率 +80%（取代「职业行会」的 +40%）。' }
  ];
  // Public content tables are shared by migration, UI, and the civic rules module.
  SB.CIVICS = CIVICS;
  SB.GOVS = GOVS;
  SB.POLICIES = POLICIES;
  SB.civicData = { CIVICS: CIVICS, SLOT_TYPES: SLOT_TYPES, GOVS: GOVS, POLICIES: POLICIES };
})(typeof window !== 'undefined' ? window : globalThis);
