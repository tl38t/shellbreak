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
      desc: '解锁政策卡「技艺」（工坊效率 +20%）、「征夫发役」（纪元 1–3 奇观建造消耗 −20%）。',
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
    { id: 'town_meeting', name: '乡镇集会', icon: 'assets/civic-icons/era-1/era1-laws.png', cost: 150, era: 1, layer: 2, reqs: ['laws'],
      boost: { t: 'pop', n: 3 },
      card: 'card_town_meeting',
      desc: '解锁政策卡「乡镇集会」：人口上限 +3，人口生产时间 −50%。',
      note: '鼓舞：人口达到 3。' },
    { id: 'coral_cultivation', name: '珊瑚培育', icon: 'assets/civic-icons/era-1/era1-craft.png', cost: 200, era: 1, layer: 3, reqs: ['craft'],
      boost: { t: 'gathered', r: 'coral', n: 500 },
      card: 'card_coral_cultivation',
      desc: '解锁政策卡「珊瑚培育」：珊瑚产出 +15%。',
      note: '鼓舞：累计产出珊瑚达 500。' },

    /* ══ 纪元二 · 第一层（2026-09-28 用户规格）════════════════════════
     * 【为什么两项都 reqs ['laws']，而不是分别接着《技艺》《神秘主义》】
     *   若各自挂到 era1 的末项上，玩家就必须先在「对外贸易 / 戏剧与诗歌」之间
     *   选一条走 —— 而幕后的《技艺》《神秘主义》两张卡抢的是**同一个万能槽**
     *   （文件头 §3）。把新层再吊进那次取舍，就等于逼玩家在两条支线上做第二次
     *   二选一，而这条二选一他根本没有余裕：槽位只有 1 个。
     *   ⇒ 两项都挂根《法典》，玩家两条支线都能走到这一层，真正在等他的是
     *     「商人 vs 广场」这两个产能，而不是又一次互斥。
     * 【两者之间也互不前置】与 Era1 根市政支线同规矩：玩家可以自己决定先做哪一项。
     * 【cost 定案：era2 四项 = 250/300/600/500，2026-09-29 用户拍板「开始实装」。
     *   Era1 原有《技艺》《神秘主义》各 100；本层 250。再调 = 新一轮标定，须用户重拍。 */
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
     *   ⚠️ 2026-10-17 用户拍板：**王权神授 8000 → 3500**（消除 era3 同块梯度倒挂：原 8000
     *   比同块 feudal/market/guild/department(3000/4000/5000/6000) 都高，且背离 10-05 拍板的「降」意图）。
     *   现 3500 介于封建主义(3000) 与中世纪集市(4000) 之间，layer1 梯度顺。
     *   同块其余项(3000/4000/5000/6000) 仍是未单独拍板的提议值，维持不变。
     * 【layer 用规格表原值】王权神授/封建主义 1，其余 2。era3 块的列基准由 layout()
     *   的 eraBase 自动偏移，不需要手写间隔。 */
    { id: 'sovereign', name: '王权神授', icon: 'assets/civic-icons/era-3/era3-sovereign.png', cost: 3500, era: 3, layer: 1,
      reqs: ['theology', 'political'],
      autoBuildZones: ['faith'],
      boost: { t: 'gathered', r: 'faith', n: 10000 },
      card: 'card_sovereign',
      wonder: 'wonder_stt_abbey',
      desc: '解锁政策卡「王权神授」「修道院」，以及奇观「圣泰坦尼克修道院」；开放信仰区建筑自动建造/升级（逐建筑开关）。',
      note: '鼓舞：累计信仰产出达 10000。' },
    { id: 'feudalism', name: '封建主义', icon: 'assets/civic-icons/era-3/era3-feudalism.png', cost: 3000, era: 3, layer: 1,
      reqs: ['records'],
      boost: { t: 'zoneLvl', zone: 'food', n: 100 },
      /* autoBuildZones 声明本市政开放哪些区域的逐建筑自动建造/升级开关。
       * 执行与 UI 都读同一字段，新增区域自动化解锁不另造一套机制。 */
      autoBuildZones: ['food'],
      desc: '解锁政策卡「农奴制」、「庄园制」（食物产出 ×1.20），以及生息区建筑自动建造/升级（逐建筑开关）。',
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
      desc: '解锁政策卡「职业行会」（取代技艺）、「王室特许」（纪元 1–5 奇观建造消耗 −20%，取代征夫发役），以及奇观「大巴扎」。',
      note: '鼓舞：建筑总等级达 55。' },
    { id: 'steel_guild', name: '钢铁公会', icon: 'assets/civic-icons/era-3/era3-guild.png', cost: 7000, era: 3, layer: 3, reqs: ['guild'],
      boost: { t: 'gathered', r: 'steel', n: 10000 },
      card: 'card_steel_guild',
      desc: '解锁政策卡「钢铁公会」：钢产出 +15%。',
      note: '鼓舞：累计产出钢达 10000。' },
    { id: 'department', name: '行政部门', icon: 'assets/civic-icons/era-3/era3-department.png', cost: 6000, era: 3, layer: 2,
      reqs: ['feudalism'],
      /* 用户调整：行政部门人口鼓舞从 55 下调到 50，避免住房扩容成为中期过长的门槛。 */
      boost: { t: 'pop', n: 50 },
      govs: ['monarchy'],
      /* 额外效果（2026-10-01 ERA4 设计稿）：书手更名为官员，且行政点（市政点）产出 +50%。
       * 改名是 UI 标签、+50% 走 economy.cultureRate 的 scribeCivicMul（department 完成后 ×1.5）。 */
      scribeRename: true, scribeCivicMul: 0.50,
      desc: '解锁政体「君主制」（5 槽：礁栖核心建筑建造消耗 −10%），以及建筑「王国潮道」。书手更名为官员，市政点产出 +50%。',
      note: '鼓舞：人口达 50。' },

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
    { id: 'mineral_charter', name: '矿物章程', icon: 'assets/civic-icons/era-4/era4-explore.png', cost: 30000, era: 4, layer: 3, reqs: ['explore'],
      boost: { t: 'gathered', r: 'iron', n: 1000 },
      card: 'card_mineral_charter',
      desc: '解锁政策卡「矿物章程」：精铁产出 +15%。',
      note: '鼓舞：累计产出精铁达 1000。' },
    /* 公司系统总开关（2026-10-30 用户拍：从 ERA6 L2 提前到 ERA4 L3）。
     * 锚点理由：银行建筑本就是 ERA4《银行业》(techs.js:554, ERA4 L4) 的产物
     *   ⇒ 鼓舞「银行达 3 级」在 ERA4 内可达成，公司挂着它自己的激励条件放在 ERA6 本来就是错位。
     * 前置改挂《重商主义》(ERA4 L2 · 商人/贸易)：公司 = 商人的组织化，比旧链
     *   （ERA5《国民动员》→ ERA6《大众传媒》→ ERA6 宏观）在语义与时序上都更贴。
     * ⚠️ cost 70000 是**提议值**（ERA4 L3 参照：矿物章程 30000；ERA4 现有最高 60000），
     *   未经总时长核算 ⇒ 待用户拍板。旧值 320000 是 ERA6 量级，而 ERA4 整纪元的市政
     *   总预算约 22.5 万，留着旧值等于「门开了但摸不到」。
     * ⚠️ 副作用（标定范围，需拍）：藻食/珊瑚 +10%~+30% 从 ERA4 起全程生效
     *   （公司运营 3h 即满「全国性企业」），直接抬口粮与人口曲线。
     * ⚠️ icon 仍指 era-6 目录：资产文件名是 era6-macro.png，改路径会破图，故保留。 */
    { id: 'macroeconomics', name: '宏观经济学', icon: 'assets/civic-icons/era-6/era6-macro.png', cost: 70000, era: 4, layer: 3,
      reqs: ['mercantilism'], boost: { t: 'built', b: 'bank', n: 3 },
      desc: '解锁政策卡「公司税」（公司产出加成与奢侈消耗加成 ×1.3）；解锁「公司」页面，研究完成后自动成立藻食公司和珊瑚公司。',
      note: '鼓舞：银行达 3 级。' },
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
      autoBuildZones: ['trade'],
      desc: '解锁政策卡「重商主义」（银行的商人产出加成 +100%），以及贸易区域建筑自动建造/升级（逐建筑开关）。',
      note: '鼓舞：同时拥有 20 名商人。' },
    { id: 'enlightenment', name: '启蒙运动', icon: 'assets/civic-icons/era-4/era4-enlightenment.png', cost: 50000, era: 4, layer: 2,
      reqs: ['department'],
      boost: { t: 'built', b: 'observatory', n: 1 },
      card: 'card_enlightenment',
      building: 'museum',
      desc: '解锁政策卡「启蒙运动」（替代历史记录：潮纹馆/大学科技 +100%、神庙信仰 −50%）、「启蒙沙龙」（科技产出的 15% 转为市政点）、建筑「博物馆」。',
      note: '鼓舞：天壳观测站等级 ≥ 1。' },
    { id: 'historiography', name: '历史哲学', icon: 'assets/civic-icons/era-4/era4-historiography.png', cost: 60000, era: 4, layer: 2,
      reqs: ['reformed'],
      boost: { t: 'wonder', n: 6 },
      /* 工艺制品「艺术品 / 潮纹记录」的解锁走配方自身的 needCivic（见 config CRAFTS 的
       *   craft_artwork / craft_tidal_record），与奇观 needCivic 同构；此处不再放死字段。 */
      /* ERA1/2/3 的奇观 +5 市政点获取（economy.cultureRate 的 wonderEraCivicBonus 读它）。 */
      wonderEraCivic: 5,
      desc: '解锁工坊配方「艺术品」「潮纹记录」；纪元一至三的奇观每座额外提供 +5 市政点/秒。',
      note: '鼓舞：奇观建立超过 5 座（≥6 座）。' },

    /* ══ 纪元五 · ERA5 市政扩展（2026-10-02 实装，用户规格表逐格照录）════════
     * 【cost 为提议值，未拍板】era4 是 1300~1500，era5 提议 1600/1600/1800/1800/2200；
     *   调它 = 标定，会动整局时长，当前未做总时长核算 ⇒ 暂不调。
     * 【layer】渊潜鲛歌/工业化配给 1，社会科学/城市化 2，国民动员 3（与 era2/era3 同形）。
     * 【鼓舞类型】zoneLvl / gathered / total / pop / wonders —— 全部是 tech.condMet 已支持的现成类型，无新 cond。 */
    { id: 'sharksong', name: '渊潜鲛歌', icon: 'assets/civic-icons/era-5/era5-sharksong.png', cost: 80000, era: 5, layer: 1, reqs: ['enlightenment'],
      /* ⚠️ 2026-10-17 用户拍板：鼓舞「市政区建筑合计等级 50」**太高、基本达不到**
       *   ⇒ 改成 30（实测进度条卡在 31/50 ≈ 62% 就推不动，同期市政区总量远不到 50 级）。 */
      boost: { t: 'zoneLvl', zone: 'civic', n: 30 },
      wonder: 'wonder_shadow_theater', building: 'theater',
      desc: '解锁奇观「夏\'多桑大剧院」（+5 市政点/秒、+1 政策卡槽），以及建筑「歌剧院」。',
      note: '鼓舞：市政区建筑合计等级达 30。' },
    { id: 'rationing', name: '工业化配给', icon: 'assets/civic-icons/era-5/era5-rationing.png', cost: 90000, era: 5, layer: 1, reqs: ['enlightenment'],
      boost: { t: 'gathered', r: 'steel', n: 10000 },
      card: 'card_rationing',
      desc: '解锁政策卡「工业化配给」「政治经济学」「五年计划」（精铁、钢产出 +30%）。',
      note: '鼓舞：累计钢产量达 10000。' },
    /* ══ ERA4 市政（2026-10-17 新增 · 工坊学校）════════════════════════
     * 【定位】在市政里补一条「加钢生产」的通路：完成即解锁工坊升级「精炼钢厂」
     *   （upg_steelforge，钢产出 +25%，与废钢锻造 +20% 加法叠加 ⇒ 全开 ×1.45）。
     *   基础钢产出翻倍已在 config-content.js 的 UNIT.steelPerHydro 0.05→0.10 落实。
     * 【几何】：纪元四 · 第二列。2026-10-17 用户拍板「放在职业行会后面一层」——
     *   职业行会(era3/layer2) 的下一层即纪元四，故本市政落在 era4/layer2、前置《职业行会》
     *   （reqs:['guild']）。纪元四列数不变（仍是既有 layer1/2），e2e 市政树几何
     *   「连线条数==reqs 总数」仍成立（仅把一条边的起点从启蒙运动挪到职业行会）。
     *   语义上「工坊学校」从「职业行会」派生比从「启蒙运动」派生更贴（工坊=行会脉络）。
     * 【鼓舞 = 建成 3 座热液工坊（built/hydroshop/3）】与印刷术（techs.js:519）同口径，
     *   读 s.lvl.hydroshop。热液工坊是钢产线本体，锁它等于「先把产线铺起来」。
     *   ⚠️ 热液工坊由纪元三科技《金属精炼》解锁（techs.js:479），纪元四早已能建满 3 座，鼓舞可达。
     * 【cost 为提议值，未标定】量级对齐纪元四中段（探索 20000 / 重商主义 40000）取 30000；
     *   调它 = 标定，会动整局时长，且当前未做总时长核算 ⇒ 暂不调。 */
    { id: 'civ_steelschool', name: '工坊学校', icon: 'assets/civic-icons/era-4/era4-steelschool.png', cost: 30000, era: 4, layer: 2, reqs: ['guild'],
      boost: { t: 'built', b: 'hydroshop', n: 3 },
      desc: '解锁工坊升级「精炼钢厂」：钢产出 +25%。',
      note: '鼓舞：建成 3 座热液工坊。' },
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
    { id: 'city_supply', name: '城市供给', icon: 'assets/civic-icons/era-5/era5-urbanization.png', cost: 180000, era: 5, layer: 3, reqs: ['urbanization'],
      boost: { t: 'built', b: 'tenement', n: 5 },
      card: 'card_city_supply',
      desc: '解锁政策卡「城市供给」：人口上限 +5，人口生产时间 −50%；取代「乡镇集会」。',
      note: '鼓舞：廉租社区达到 5 级。' },
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
      desc: '解锁政策卡「博物馆管理」；每完成一次轮回，艺术品效果额外提高 10%。',
      note: '鼓舞：博物馆达 3 级。' },
    { id: 'urbandesign', name: '城市设计', icon: 'assets/civic-icons/era-6/era6-urbandesign.png', cost: 340000, era: 6, layer: 2,
      reqs: ['massmedia'], boost: { t: 'built', b: 'canal', n: 20 },
      desc: '解锁奇观「全国快速物流通道」；王国潮道每级使精铁、钢产能 +1%，若同时建成「总物流站」，这部分产能加成翻倍。',
      note: '鼓舞：王国潮道达 20 级。' },
    { id: 'archaeology', name: '考古学', icon: 'assets/civic-icons/era-6/era6-archaeology.png', cost: 300000, era: 6, layer: 2,
      reqs: ['naturalhistory'], boost: { t: 'cycle', n: 3 },
      desc: '解锁政策卡「考古发掘」（艺术品、潮纹记录的制作效率 +25%）；艺术品制造消耗 −20%。',
      note: '鼓舞：轮回数达 3 周目。' },
    { id: 'ideology', name: '意识形态', icon: 'assets/civic-icons/era-6/era6-ideology.png', cost: 380000, era: 6, layer: 2,
      reqs: ['massmedia', 'naturalhistory'], boost: { t: 'lifetimeCulture', n: 900000 },
      card: 'card_national_solidarity',
      desc: '解锁政策卡「国家凝聚力」。',
      note: '鼓舞：累计市政产出达 900000。' },
    { id: 'civilization', name: '文明构造', icon: 'assets/civic-icons/era-6/era6-civilization.png', cost: 500000, era: 6, layer: 3,
      reqs: ['archaeology'], boost: { t: 'cycle', n: 7 },
      desc: '本轮回破壳时获得的轮回点 +20%。',
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
      note: '鼓舞：完成市政「意识形态」。' },

    /* ══ ERA7 市政（用户规格表 · 实装）════════════════════════
     * 【cost 为提议值，未标定】量级对齐 era7 科技（rocket 450000 → spacestation 2400000），
     *   取其「略少」区间：入口项 45~50 万、深层项 80~110 万。调它 = 标定，会动整局时长，
     *   当前未做总时长核算 ⇒ 暂不调，待用户拍板。
     * 【前置/鼓舞全部复用 tech.condMet 既有类型】
     *   现代思潮/竞技体育 鼓舞 = 启用 7 槽政体（govWildSlots n:7，Task#1 已加）；
     *   超古代市政 鼓舞 = 星屑累积 5（gathered/stardust/5，与 techs 超古代科技同口径）；
     *   文化遗产 鼓舞 = 建成 10 座奇观（wonder n:10，condMet 计全部奇观总数）；
     *   太空竞赛 鼓舞 = 星海区建筑合计 5 级（zoneLvl/space/5，多实例建筑可叠建达成）；
     *   先民遗产 鼓舞 = 轮回数 10（cycle n:10）；星球村 鼓舞 = 总物流站/全国快速物流通道任一建成
     *   （anyWonders，Task#1 已加，OR 语义）。现代思潮 前置意识形态 + 鼓舞 7 槽政体，二者叠成硬门。
     * 【layer 用规格原值】现代思潮 1，竞技体育/超古代/文化遗产 2，太空竞赛/先民遗产/星球村 3。 */
    { id: 'modern_thought', name: '现代思潮', icon: 'assets/civic-icons/era-7/era7-modern-thought.png', cost: 450000, era: 7, layer: 1,
      reqs: ['ideology'], boost: { t: 'govWildSlots', n: 7 },
      desc: '解锁政策卡「公摊面积」「延长工时」。',
      note: '前置：完成市政「意识形态」。鼓舞：启用 7 槽政体（教权国/平等主义/联邦制）。' },
    { id: 'athletics', name: '竞技体育', icon: 'assets/civic-icons/era-7/era7-athletics.png', cost: 500000, era: 7, layer: 2,
      reqs: ['modern_thought'], boost: { t: 'govWildSlots', n: 7 },
      building: 'stadium',
      desc: '解锁建筑「体育场」，以及政策卡「直播竞技」。',
      note: '鼓舞：启用 7 槽政体。' },
    { id: 'ancient_civics', name: '超古代市政', icon: 'assets/civic-icons/era-7/era7-ancient.png', cost: 500000, era: 7, layer: 2,
      reqs: ['modern_thought'], boost: { t: 'gathered', r: 'stardust', n: 5 },
      /* 政策卡槽位 +1：走 civic.policySlot 字段，slotList 经 civicPolicySlots 读（与 wonderCivicSlots 同构，
       * 给一个可用的万能槽等价于「+1 政策槽」，本作政策卡均为通用型）。 */
      policySlot: 1,
      desc: '政策卡槽位 +1。',
      note: '鼓舞：星屑累积达 5。' },
    { id: 'cultural_heritage', name: '文化遗产', icon: 'assets/civic-icons/era-7/era7-heritage.png', cost: 500000, era: 7, layer: 2,
      reqs: ['modern_thought'], boost: { t: 'wonder', n: 10 },
      desc: '所有奇观额外 +1% 市政点获取；解锁政策卡「旅游观光」。',
      note: '鼓舞：建成 10 座奇观。' },
    { id: 'space_race', name: '太空竞赛', icon: 'assets/civic-icons/era-7/era7-space.png', cost: 900000, era: 7, layer: 3,
      reqs: ['athletics'], boost: { t: 'zoneLvl', zone: 'space', n: 5 },
      wonder: 'wonder_bolocillo',
      desc: '解锁政策卡「太空竞赛」「神不在此」，以及奇观「博洛西洛漂浮发射场」。',
      note: '鼓舞：星海区建筑合计等级达 5。' },
    { id: 'ancestor_heritage', name: '先民遗产', icon: 'assets/civic-icons/era-7/era7-ancestor.png', cost: 800000, era: 7, layer: 3,
      reqs: ['ancient_civics'], boost: { t: 'cycle', n: 10 },
      desc: '解锁政策卡「质量效应」（本轮回星屑获取 ×1.15）；本轮回星屑获取 +20%（破壳结算时计入）。',
      note: '鼓舞：轮回数达 10 周目。' },
    { id: 'planet_village', name: '星球村', icon: 'assets/civic-icons/era-7/era7-village.png', cost: 1100000, era: 7, layer: 3,
      reqs: ['cultural_heritage'], boost: { t: 'anyWonders', ids: ['wonder_logistics', 'wonder_national_logistics'] },
      desc: '解锁政策卡「跨国经济」「未来主义神学」。',
      note: '鼓舞：建成奇观「总物流站」或「全国快速物流通道」之一。' },

    /* ══ ERA8 市政（2026-10-18 用户规格表 · 实装）══════════════════════
     * 【cost 为提议值，未标定】对齐 ERA8 科技量级（200万~720万）取 130万~350万；调它 = 标定，待用户拍。
     * 【鼓舞全部走 tech.condMet】既有类型：starPct/wonders(AND)/built/tech/gathered；
     *   新类型 3 个（本波加进 tech.js 三处登记）：oldFaith(跨周目旧日信仰)、wonderEra(按纪元数奇观)、
     *   lvlSum(指定建筑等级合计——「真正别的星球上」= rheamine+titancloud，用户拍 Q5-A)。
     * 【被动市政有先例】信仰回响/远见主义哲学(解锁2)/星间遗迹/群星与神明(解锁1) 无卡无政体无奇观，
     *   效果由 economy/prestige 读 s.civics.*（与文明构造 +20% 轮回点、先民遗产 +20% 星屑同款）。
     * 【替代链】社交网络→大众传媒、我们在此→天赋神权、星际探索热潮→总动员令
     *   （retiredBy 设在被替代卡上，单值字段）；仓储链 2026-10-18 用户纠错后补全：
     *   中世纪集市 ×2 →(城市化)→ 基础物流建设 ×3 →(全球化)→ 洲际物流 ×5。 */
    { id: 'starfaith', name: '群星与神明', icon: 'assets/civic-icons/era-8/era8-starfaith.png', cost: 1300000, era: 8, layer: 1,
      reqs: ['space_race', 'planet_village'], boost: { t: 'starPct', n: 5 },
      /* 被动：信仰产出 ×(1 + 星空进度)（进度=starExplore/STAR_CAP 小数）。economy.faithRate 读。 */
      desc: '解锁政策卡「星际广播」（每颗轨道卫星使信仰产出 +5%）；信仰产出提高 x%，x 为星空探索进度（破壳后随星空累积持续变强）。',
      note: '鼓舞：星空探索进度超过 5%。' },
    { id: 'globalization', name: '全球化', icon: 'assets/civic-icons/era-8/era8-globalization.png', cost: 1500000, era: 8, layer: 1,
      reqs: ['planet_village'], boost: { t: 'wonders', ids: ['wonder_logistics', 'wonder_national_logistics'] },
      card: 'card_interlog',
      desc: '解锁政策卡「洲际物流」：仓储区建筑容量 ×5（取代「基础物流建设」×3，后者又取代中世纪集市 ×2）。',
      note: '鼓舞：总物流站与全国快速物流通道均已完成。' },
    { id: 'cosmic_indifference', name: '宇宙冷漠', icon: 'assets/civic-icons/era-8/era8-indifference.png', cost: 2000000, era: 8, layer: 2,
      reqs: ['starfaith'], boost: { t: 'built', b: 'spacestation', n: 3 },
      card: 'card_we_are_here', wonder: 'wonder_khalifa',
      desc: '解锁政策卡「我们在此」（取代天赋神权），以及奇观「哈\'利法宇宙望远镜」。',
      note: '鼓舞：空间站等级超过 3。' },
    { id: 'faith_echo', name: '信仰回响', icon: 'assets/civic-icons/era-8/era8-faithecho.png', cost: 1800000, era: 8, layer: 2,
      reqs: ['starfaith'], boost: { t: 'oldFaith', n: 50000 },
      /* 两个本轮回被动（用户拍 Q3）：① 全产加成档位 ×2（prestige.legacy().oldFaithAllProductionBonus 在 baseMul 乘 2）；
       *   ② doBreak 本局剩余信仰入账 ×1.2。都读 s.civics.faith_echo。 */
      desc: '本轮回：旧日信仰的全产出加成翻倍（每档 +1%）；本轮回破壳入账的旧日信仰 +20%。',
      note: '鼓舞：旧日信仰超过 50k（跨周目账本）。' },
    { id: 'social_network', name: '社交网络', icon: 'assets/civic-icons/era-8/era8-social.png', cost: 2200000, era: 8, layer: 2,
      reqs: ['globalization'], boost: { t: 'wonderEra', era: 7, n: 1 },
      card: 'card_social_network',
      desc: '解锁政策卡「社交网络」（取代大众传媒）。',
      note: '鼓舞：完成任意纪元七奇观。' },
    { id: 'virtual_reality', name: '虚拟现实', icon: 'assets/civic-icons/era-8/era8-vr.png', cost: 2400000, era: 8, layer: 2,
      reqs: ['globalization'], boost: { t: 'tech', id: 'biomat' },
      card: 'card_vr', wonder: 'wonder_fishvr',
      desc: '解锁政策卡「虚拟现实」，以及奇观「魔鱼世界VR」。',
      note: '鼓舞：完成科技「生物材料」。' },
    { id: 'space_politics', name: '星际政治', icon: 'assets/civic-icons/era-8/era8-spacepol.png', cost: 3000000, era: 8, layer: 3,
      reqs: ['cosmic_indifference', 'social_network'], boost: { t: 'lvlSum', ids: ['rheamine', 'titancloud'], n: 5 },
      card: 'card_space_net',
      desc: '解锁政策卡「星际物流网」：异星建筑（瑞亚星矿井/泰坦气云采集站）产出 +30%。',
      note: '鼓舞：异星建筑（瑞亚/泰坦）合计等级超过 5。' },
    { id: 'far_sight', name: '远见主义哲学', icon: 'assets/civic-icons/era-8/era8-farsight.png', cost: 3200000, era: 8, layer: 3,
      reqs: ['cosmic_indifference'], boost: { t: 'starPct', n: 25 },
      card: 'card_fever',
      /* 双份 +x%（用户拍 Q2：+x% 且卡与被动并行叠加）：卡走 cardFeverStarMul，被动走 civicFarsightStarMul，
       *   economy.starRate 各乘一次（两份都 = 1 + 0.01×人口）。 */
      desc: '解锁政策卡「星际探索热潮」（替代总动员令）；完成本市政额外使星空探索速率 +x%（x=人口数，与政策卡并行叠加）。',
      note: '鼓舞：星空探索进度超过 25%。' },
    { id: 'star_ruins', name: '星间遗迹', icon: 'assets/civic-icons/era-8/era8-ruins.png', cost: 3500000, era: 8, layer: 3,
      reqs: ['faith_echo'], boost: { t: 'gathered', r: 'stardust', n: 30 },
      /* 被动（用户拍 Q6）：doBreak 星屑结算乘 ×(1 + 0.01×星屑设施总等级)，prestige 读。 */
      desc: '本次轮回结算时，每级轨道与异星设施 +1% 星屑点获取。',
      note: '鼓舞：累计星屑点超过 30（跨周目）。' },

    /* ══ ERA9 市政（2026-10-20 用户规格 · 实装）══════════════════
     * 【cost 为提议值，用户拍板「用提议值」】对齐 era9 科技(300万~700万) 与 era8 市政(130万~350万)：
     *   layer1 = 200~240万、layer2 = 300万、layer3 = 400万。调它 = 标定，会动总时长。
     * 【前置/鼓舞全部走 tech.condMet 既有类型 + 1 个新类型 govId（采用特定政体，tech.js 已加）】
     *   分布式主权/超远见主义/繁星信仰/神们自己 前置《星际政治》(space_politics)、鼓舞分别为
     *   异星建筑合计≥10(lvlSum 全部异星/太空建筑) / 完成远见主义哲学(civic:far_sight) /
     *   神庙≥30级(built:temple) / 轮回≥15(cycle)。繁荣一统/共同命运/神圣之路 前置各自 layer1 项、
     *   鼓舞=采用对应 9 槽政体(govId)。太阳系后勤保障 前置 reqsAny(三者任一)、鼓舞=完成科技 interlog。
     *   虚境信仰 前置《神们自己》、鼓舞=黑色方碑≥3级(built:black_monolith)。
     * 【layer 用规格原值】四 layer1 / 三 layer2 / 二 layer3。era9 列基准由 layout() 的 eraBase 自动偏移。 */
    { id: 'distributed_sov', name: '分布式主权', icon: 'assets/civic-icons/era-9/era9-distributed.png?v=3', cost: 2000000, era: 9, layer: 1,
      reqs: ['space_politics'], boost: { t: 'lvlSum', ids: ['rheamine', 'titancloud', 'satellite', 'spacestation', 'robotbay', 'biomatlab'], n: 10 },
      gov: 'interstellar_federation',
      desc: '解锁政体「星际联邦」（9 槽，全产 +10%，幸福度 +1）；国家后缀改为星际联邦。',
      note: '前置：星际政治。鼓舞：异星/太空建筑（瑞亚/泰坦/卫星/空间站/机械湾/生物材料）合计等级超 10。' },
    { id: 'hypervision', name: '超远见主义', icon: 'assets/civic-icons/era-9/era9-hypervision.png?v=3', cost: 2200000, era: 9, layer: 1,
      reqs: ['space_politics'], boost: { t: 'civic', id: 'far_sight' },
      gov: 'star_sea_coop',
      desc: '解锁政体「星海合作社」（9 槽，工艺效率 +100%）；国家后缀改为星海共同体。',
      note: '前置：星际政治。鼓舞：完成市政「远见主义哲学」。' },
    { id: 'star_faith9', name: '繁星信仰', icon: 'assets/civic-icons/era-9/era9-starfaith.png?v=3', cost: 2200000, era: 9, layer: 1,
      reqs: ['space_politics'], boost: { t: 'built', b: 'temple', n: 30 },
      gov: 'universal_church',
      desc: '解锁政体「寰宇教会」（9 槽，信仰/旧日信仰产出加成 ×1.5）；国家后缀改为寰宇教会。',
      note: '前置：星际政治。鼓舞：神庙等级 ≥ 30。' },
    { id: 'gods_themselves', name: '神们自己', icon: 'assets/civic-icons/era-9/era9-godsthemselves.png?v=3', cost: 2400000, era: 9, layer: 1,
      reqs: ['space_politics'], boost: { t: 'cycle', n: 15 },
      building: 'black_monolith',
      desc: '解锁建筑「黑色方碑」（消耗 1000 石梁，每级造价 ×1.5，每级使全局信仰产出 ×1.05）。',
      note: '前置：星际政治。鼓舞：轮回次数超过 15。' },
    { id: 'prosperity_unity', name: '繁荣一统', icon: 'assets/civic-icons/era-9/era9-prosperity.png?v=3', cost: 3000000, era: 9, layer: 2,
      reqs: ['distributed_sov'], boost: { t: 'govId', id: 'interstellar_federation' },
      card: 'card_alien_abundance',
      desc: '解锁政策卡「上上善道」（异星建筑产出 +40%）；政策卡「联邦枢密院」（广场/歌剧院官员市政点乘区 ×4，取代政治经济学）。',
      note: '前置：分布式主权。鼓舞：采用政体「星际联邦」。' },
    { id: 'common_destiny', name: '共同命运', icon: 'assets/civic-icons/era-9/era9-commondestiny.png?v=3', cost: 3000000, era: 9, layer: 2,
      reqs: ['hypervision'], boost: { t: 'govId', id: 'star_sea_coop' },
      card: 'card_flesh_weak',
      desc: '解锁政策卡「血肉苦弱」（精铁/钢/θ金属产出 +30%）；政策卡「各员一层奋力努力」（工艺效率 +140%、幸福度 −2，取代工业化配给）。',
      note: '前置：超远见主义。鼓舞：采用政体「星海共同体」。' },
    { id: 'sacred_path', name: '神圣之路', icon: 'assets/civic-icons/era-9/era9-sacredpath.png?v=3', cost: 3000000, era: 9, layer: 2,
      reqs: ['star_faith9'], boost: { t: 'govId', id: 'universal_church' },
      card: 'card_mind_over_matter',
      desc: '解锁政策卡「心胜于物」（奇观建造消耗 −30%）；政策卡「超凡入圣」（科技 +300/秒，取代神秘主义）。',
      note: '前置：繁星信仰。鼓舞：采用政体「寰宇教会」。' },
    { id: 'solar_logistics', name: '太阳系后勤保障', icon: 'assets/civic-icons/era-9/era9-solarlogi.png?v=3', cost: 4000000, era: 9, layer: 3,
      reqsAny: ['prosperity_unity', 'common_destiny', 'sacred_path'], boost: { t: 'tech', id: 'interlog' },
      card: 'card_interstellar_logi',
      desc: '解锁政策卡「星际后勤保障」（火箭引擎/强工质火箭引擎工艺效率 +100%）；政策卡「璀璨星图」（人口信仰 −50%、科技 ×3.5，取代神不在此）。',
      note: '前置：繁荣一统/共同命运/神圣之路任一。鼓舞：完成科技「行星际快速物流」。' },
    { id: 'void_faith', name: '虚境信仰', icon: 'assets/civic-icons/era-9/era9-voidfaith.png?v=3', cost: 4000000, era: 9, layer: 3,
      reqs: ['gods_themselves'], boost: { t: 'built', b: 'black_monolith', n: 3 },
      card: 'card_cycle_terminus',
      desc: '解锁政策卡「轮回之终末」（信仰全产加成翻倍、不可卸下、信仰更名「虚境」并锁死）。',
      /* ⚠️ 2026-10-24 修文案/代码口径不符：原文案写「等级**超过** 3」，但 condMet 的
       *    `built` 判定是 `lvl >= n`（tech.js:183）⇒ **3 级即达成**，写成「超过」会让人白建一级。
       *    写法对齐兄弟条目《繁星信仰》（「神庙等级 ≥ 30」），统一用 ≥ 而不是中文数字。 */
      note: '前置：神们自己。鼓舞：黑色方碑等级 ≥ 3。' },

    /* ══ ERA10 市政（2026-10-20 用户规格 · 实装）══════════════════════
     * 【cost 为提议值，待标定】对齐 era10 科技（800万~1500万）与 era9 市政（200万~400万）之间：
     *   layer1 = 600万、layer2 = 800万、layer3 = 1000万。调它 = 标定，会动总时长。
     * 【前置/鼓舞全部走 tech.condMet 既有类型 + 1 个新类型】
     *   新类型 card（已装备指定政策卡，tech.js 三处已登记）：虚境探索 鼓舞 = 已装备「轮回之终末」。
     *   其余走现成：built（发射场≥2 / 虚境祭坛=3）、tech（绝热材料）、dysonPct（60%）。
     * 【解锁通道】建筑走 requiredCivic（公共工程局 → 泰拉/瑞亚星发射场；虚境探索 → 虚境祭坛），
     *   政策卡走 card 字段；《至高指令》带替代链（card_fever.retiredBy = 'supreme_directive'）。
     * 【layer 用规格原值】一 layer1 / 二 layer2 / 二 layer3；era10 列基准由 layout() 的 eraBase 自动偏移。
     * 【前置链】太阳系后勤保障 → 公共工程局 → 至高指令 → 我们的海（终局市政）；
     *   太阳系后勤保障 + 虚境信仰 → 虚境探索 → 飞升虚境（终局结局线）。 */
    { id: 'public_works', name: '公共工程局', icon: 'assets/civic-icons/era-10/era10-publicworks.png?v=3', cost: 6000000, era: 10, layer: 1,
      reqs: ['solar_logistics'], boost: { t: 'built', b: 'europa_launch', n: 2 },
      desc: '解锁建筑「泰拉星轨道发射场」「恩克拉多斯星轨道发射场」：制造节律与耗料与欧罗巴发射场完全相同，造价按 1 级起算（不吃星球改造的等级折扣）。',
      note: '前置：太阳系后勤保障。鼓舞：欧罗巴发射场等级 ≥ 2。' },
    { id: 'supreme_directive', name: '至高指令', icon: 'assets/civic-icons/era-10/era10-supreme.png?v=3', cost: 8000000, era: 10, layer: 2,
      reqs: ['public_works'], boost: { t: 'tech', id: 'adiabatic' },
      card: 'card_supreme_directive',
      desc: '解锁政策卡「至高指令」（发射场制造时间 −2s，取代「星际探索热潮」）；政策卡「节能减耗」（发射场热液能消耗 −50%、居民幸福度消耗 +50%）。',
      note: '前置：公共工程局。鼓舞：完成科技「绝热材料」。' },
    { id: 'void_explore', name: '虚境探索', icon: 'assets/civic-icons/era-10/era10-voidexplore.png?v=3', cost: 8000000, era: 10, layer: 2,
      reqs: ['solar_logistics', 'void_faith'], boost: { t: 'card', id: 'card_cycle_terminus', flavor: '我们都做了什么'},
      desc: '解锁建筑「虚境祭坛」：建造 1 级消耗 30 人口，升至 2 级消耗 75，升至 3 级消耗 200（按当前职业分配比例扣减）。',
      note: '前置：太阳系后勤保障、虚境信仰。鼓舞：已装备政策卡「轮回之终末」。' },
    { id: 'ascend_void', name: '飞升虚境', icon: 'assets/civic-icons/era-10/era10-ascend.png?v=3', cost: 10000000, era: 10, layer: 3, layoutOrder: 1,
      reqs: ['void_explore'], boost: { t: 'built', b: 'void_altar', n: 3 },
      desc: '本身没有产出。戴森球建设完成后，文明将迎来「飞升虚境」的结局——到那时，语言已不足以承载你们的名字。',
      note: '前置：虚境探索。鼓舞：虚境祭坛达到 3 级。' },
    { id: 'our_sea', name: '我们的海', icon: 'assets/civic-icons/era-10/era10-oursea.png?v=3', cost: 10000000, era: 10, layer: 3, layoutOrder: 0,
      reqs: ['supreme_directive'], boost: { t: 'dysonPct', n: 60 },
      card: 'card_our_sea',
      desc: '解锁政策卡「我们的海」：信仰与科研产出 −30%，工坊效率翻倍（乘区 ×2）。',
      note: '前置：至高指令。鼓舞：戴森球进度达到 60%。' }
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
      desc: '藻食产出 +5/秒。' , flavor: 'Waaaaaaaaagh!' },

    /* ══ 三种政体（2026-09-29 用户规格，由市政《政治哲学》解锁）══════════════
     * 玩家研究《政治哲学》后三选一采用（setGov），首次采用免费；之后调整政体按最高已完成市政研究成本的 1/5。
     * ⚠️【effect 是空的，但这是刻意的，不是漏装】三种效果都不是「平坦加值/秒」
     *    （那是 flow() 通道，政体采用即生效、不依赖装在槽里），而是：
     *      · 独裁的 +10% 工坊效率 → 走 `craftRatio` 加法乘区（workshop.craftRatio 读）；
     *      · 寡头的 +20% 奢侈品产出 → 走 `luxuryMul`（economy 商人行乘，与马具 toolMul 独立）；
     *      · 古典共和的 +1 幸福度 → 走 `happyBonus` 偏移量（economy happy 段，喂高 happyMul 档）。
     *    这些效果**只有采用该政体时才生效**（govById(s.gov) 读当前政体），没采用 = 0。
     * ⚠️【slots 全用 {wild:1} 是故意的】三种政体都给 1 个万能槽 ⇒ 配方槽数(1) ≤ 状态层
     *    承载(1)，不触发 e2e 那条「换槽要升维状态」的断言（s.card 仍是单值）。
     *    要差异化槽位（独裁给工造槽之类）是下一步，用户没拍 ⇒ 先聚焦三个效果本身。 */
    { id: 'autocracy', name: '独裁统治', slots: { wild: 1, prod: 1, sci: 1 }, effect: {},
      craftRatio: 0.10,
      desc: '工艺制作效率 +10%（石梁等工坊产物）。' , flavor: '也有你吗，布鲁图？！' },
    { id: 'oligarchy', name: '寡头统治', slots: { wild: 1, prod: 1, grow: 1 }, effect: {},
      luxuryMul: 1.2,
      desc: '奢侈品产出 +20%（商人贸易供给）。' , flavor: '有500仙人，乘大铁船至临高…' },
    { id: 'classical_republic', name: '古典共和', slots: { wild: 1, grow: 1, sci: 1 }, effect: {},
      happyBonus: 1,
      desc: '幸福度 +1（常驻，提高全产乘区档位）。' , flavor: '指卢比孔河为誓。' },

    /* ══ 君主制（2026-09-30 用户规格 · 市政《行政部门》解锁）══════════════
     * 5 个万能槽（比三种纪元二政体多 2 个）。效果不是平坦加值也不是产出乘区，
     * 而是「礁栖核心建筑建造消耗 −10%」——挂 buildSave 字段，由 govBuildCostMul(s)
     * 读出成 ×0.9 的成本乘数，economy.costOf 对 zone==='core' 的建筑乘上它
     * （costOf 是显示与扣费的唯一来源 ⇒ 面板与结算天然同源）。 */
    { id: 'monarchy', name: '君主制', slots: { wild: 3, prod: 1, sci: 1 }, effect: {},
      buildSave: 0.10,
      desc: '5 个政策卡槽；礁栖核心建筑建造消耗 −10%。' , flavor: '朕即国家。' },

    /* ══ ERA4 政体（2026-10-01 用户设计稿）════════
     * 商人共和国：3 万能 + 1 工造 + 1 民生（共 5 槽；与君主制**同数但配方不同**）。
     *   ⚠️ 文案曾误写「5 个万能槽」——万能只有 3 个（2026-10-29 玩家报「槽位数量与文本不符」后修正）。
     *   幸福度消耗 −30%（happyConsumeMul 0.7，economy.happyBurn 读）。效果不走平坦加值/秒，是消耗侧的偏移。
     * 神权政体：3 万能 + 2 宗教槽（relig 槽型，只吃天赋神权卡；宗座教堂奇观 effect.religSlot 再 +1）；
     *   每级学术区建筑 +1 信仰、每级市政区建筑 +0.5 信仰（faithPerAcademy/faithPerCivic，
     *   economy.faithRate 读，加在基础人口产出之上）。
     *   ⚠️ 文案曾误写「+1 宗教槽」（实际 relig:2，e2e civics.mjs 断言钉的就是 3+2）——2026-10-29 修正。 */
    { id: 'merchant_republic', name: '商人共和国', slots: { wild: 3, prod: 1, grow: 1 }, effect: {},
      happyConsumeMul: 0.7,
      desc: '5 个政策卡槽（3 万能 + 1 工造 + 1 民生）；幸福度消耗 −30%。' , flavor: '有七省，无联合。' },
    { id: 'theocracy', name: '神权政体', slots: { wild: 3, relig: 2 }, effect: {},
      faithPerAcademy: 1, faithPerCivic: 0.5,
      desc: '3 万能槽 + 2 宗教槽；每级学术区建筑 +1 信仰、每级市政区建筑 +0.5 信仰。' , flavor: '愿你的国降临…' },

    /* ══ ERA6 政体（2026-10-12 用户规格 · 由《神恩与威权》《层级理论》《权责对等》各解锁一条）══
     * 三个都是 7 万能槽（e2e 槽数断言已随多卡槽升维放开）。效果非平坦：
     *   theo_state 每建筑 +1 信仰/秒（faithPerBuilding）；egalitarianism 每鲛人 +0.1% 工坊/热液/矿井
     *   （craftPerPop/hydroPerPop/minePerPop）；federalism +10% 科技&市政、鲛人食物 −10%
     *   （civicOutMul/sciOutMul/mermanFoodMul）。采用即生效，没采用 = 0。 */
    { id: 'theo_state', name: '教权国', slots: { wild: 4, relig: 2, grow: 1 }, effect: {},
      faithPerBuilding: 1,
      desc: '7 个政策卡槽；所有建筑每级 +1 信仰/秒。' , flavor: '朕~乃~天~父~' },
    { id: 'egalitarianism', name: '平等主义', slots: { wild: 4, prod: 2, sci: 1 }, effect: {},
      craftPerPop: 0.001, hydroPerPop: 0.001, minePerPop: 0.001,
      desc: '7 个政策卡槽；每名鲛人 +0.1% 工坊效率 / +0.1% 热液能产出 / +0.1% 矿井产出。' , flavor: '打破枷锁。' },
    { id: 'federalism', name: '联邦制', slots: { wild: 4, prod: 1, sci: 1, grow: 1 }, effect: {},
      civicOutMul: 1.1, sciOutMul: 1.1, mermanFoodMul: 0.10,
      desc: '7 个政策卡槽；科技与市政产出 +10%，鲛人食物消耗 −10%。' , flavor: '无代表，不纳税。' },

    /* ══ ERA9 政体（2026-10-20 用户规格 · 由《分布式主权》《超远见主义》《繁星信仰》各解锁一条）══
     * 三个都是 9 万能槽（e2e 槽数断言随多卡槽升维放开）。效果非平坦：
     *   interstellar_federation 全产 +10%（allOutMul:1.1，economy.globalMul 读）、幸福度 +1（happyBonus:1）；
     *   star_sea_coop 工艺效率 +100%（craftRatio:1.0，加法轴）；
     *   universal_church 信仰/旧日信仰产出加成 ×1.5（faithMul:1.5 + oldFaithMul:1.5）。
     * 国家后缀走既有 GOV_TITLE_SUFFIX（civics.js 顶部），三条各加一条（星际联邦/星海共同体/寰宇教会）。 */
    { id: 'interstellar_federation', name: '星际联邦', slots: { wild: 6, prod: 1, sci: 1, grow: 1 }, effect: {},
      allOutMul: 1.1, happyBonus: 1,
      desc: '9 个政策卡槽；全产 +10%，幸福度 +1。' , flavor: '星海一言堂。' },
    { id: 'star_sea_coop', name: '星海合作社', slots: { wild: 6, prod: 1, sci: 1, grow: 1 }, effect: {},
      craftRatio: 1.0,
      desc: '9 个政策卡槽；工艺效率 +100%。' , flavor: '火星为何如此赤红？' },
    { id: 'universal_church', name: '寰宇教会', slots: { wild: 6, relig: 2, grow: 1 }, effect: {},
      faithMul: 1.5, oldFaithMul: 1.5,
      desc: '9 个政策卡槽；信仰与旧日信仰产出加成 ×1.5。' , flavor: '……如同行在天上。' }
  ];

  /* 政策卡。effect 同样是平坦加值/秒，且**只有在卡槽里装着它时才生效**。
   * ⚠️ type 决定它**能进哪种槽**（规则见 cardFits）。Era1 仍只有 1 个万能槽 ⇒
   *    类型不限制装填，但多张可选卡之间会形成实际取舍。 */
  var POLICIES = [
    { id: 'card_craft',  name: '技艺',     civic: 'craft',  type: 'prod', effect: {}, craftRatio: 0.20,
      /* retiredBy（2026-09-30）：市政《职业行会》完成后这张卡退役——
       *   cardOwned 对它返回 false（装不了新槽），research('guild') 会把已装的自动拔下
       *   （免费，退役是制度行为不是玩家动作）。字段存的是**市政 id**（guild）不是卡 id。 */
      retiredBy: 'guild',
      desc: '工坊效率 +20%（工艺制作产出，装在卡槽里才生效）。', flavor: '迈向文明的一步。'},
    { id: 'card_mystic', name: '神秘主义', civic: 'mystic', type: 'sci',  effect: { science: 0.3 },
      retiredBy: 'sacred_path',
      desc: '科技产出 +0.3/秒。', flavor: '大地、洋流、热泉，听我号令。'},
    { id: 'card_town_meeting', name: '乡镇集会', civic: 'town_meeting', type: 'grow', effect: {},
      /* 城市供给完成后由研究流程自动退役并卸下，避免两个加成叠加。 */
      retiredBy: 'city_supply', popCapFlat: 3, popGrowthTimeMul: 0.5,
      desc: '人口上限 +3，人口生产时间 −50%。完成「城市供给」后由该卡取代。', flavor: '天下熙熙皆为利来。' },
    { id: 'card_coral_cultivation', name: '珊瑚培育', civic: 'coral_cultivation', type: 'prod', effect: {},
      resOutMul: { coral: 1.15 },
      desc: '珊瑚产出 +15%。', flavor: '珊瑚在适宜的环境会生长得更快。' },
    /* ⚠️⚠️【这张卡的 effect 是空的，但它不是漏装】用户规格是「效果：广场效果 +100%」，
     *    而**政策卡的 effect 走的是 `flow()` 那条平坦加值/秒的通道**（上面神秘主义
     *    那种）。「广场 +100%」是一个**乘区**，塞进平坦加值通道会变成「每秒多给
     *    ×2 市政点」——那是把「这座建筑变强」曲解成「凭空产两份」，完全不是一回事。
     *    ⇒ 所以效果挂在 `squareMul` 这个字段上，由下面 `squareMul(s)` 单独取。
     *    ⚠️ 判断口径照抄文件头：空壳要能分清「漏装还是刻意」，这里刻意，
     *       理由就写在这三行里，别留给下一个人去猜。 */
    { id: 'card_drama',  name: '戏剧与诗歌', civic: 'drama', type: 'grow',
      effect: {}, squareMul: 2,
      /* 退役（广场效果三级链首环）：《工业化配给》(rationing) 完成后本卡直接退役，
       *   由 card_political_econ（squareMul ×2.5 + theaterMul ×2.5）上位替代。
       *   retiredBy 指向**后继卡的 civic id**（与 card_records→enlightenment 等先例同方向）。
       *   ⚠️ 原漏写此字段 ⇒ 戏剧与诗歌在政治经济学出来后从不消失（用户报 bug，2026-10-21 补）。 */
      retiredBy: 'rationing',
      desc: '广场的市政点乘区 ×2（即「广场效果 +100%」）。完成《工业化配给》后由「政治经济学」取代而退役。', flavor: '这是一个问题。'},
    /* ⚠️⚠️【effect 空壳与 squareMul / templeMul 是**刻意**的，不是漏装】
     *    与《戏剧与诗歌》那一条同一个道理：政策卡的 `effect` 走的是 `flow()` 那条
     *    平坦加值/秒的通道，而「效果 +100%」是**乘区**。塞进平坦通道会变成
     *    「每秒多给 ×2 这个东西」——把「建筑变强」曲解成「凭空产两份」。
     *    ⇒ 乘区挂在函数字段上，由下面 `templeMul(s)` 单独取。
     *    ⚠️ 装配判据（e2e 那条「装卡」用的）走的是 `effect` 非空 —— 这让这两张卡的
     *       effect 为空 ⇒ 整局模拟永远不会把卡装上 ⇒ 乘区整局不生效。改判据的时候
     *       记得这四张卡（craft / drama / theology / records）都是「空壳 + 乘区字段」，
     *       判据要比「乘区字段是否存在」，不是比 effect 非空。 */
    { id: 'card_theology', name: '神学', civic: 'theology', type: 'relig',
      effect: {}, templeMul: 2,
      /* 被《星球村》市政完成后退役（由 card_future_theology 上位替代：神庙信仰 ×5、科技 −30%）。 */
      retiredBy: 'planet_village',
      desc: '神庙的信仰产出乘区 ×2（即「神庙效果 +100%」）。', flavor: '教宗无谬？'},
    { id: 'card_records',  name: '历史记录', civic: 'records', type: 'sci',
      effect: {}, libraryMul: 2,
      /* retiredBy（2026-10-01 ERA4）：市政《启蒙运动》完成后这张卡退役——
       * 「启蒙运动」卡（libraryMul ×2 + universityMul ×2）是它的完全上位替代。 */
      retiredBy: 'enlightenment',
      desc: '潮纹馆的科技加成 ×2（即「图书馆效果」翻倍，不含研究所那一份）。', flavor: '历史如镜。'},

    /* ── ERA3 市政扩展的 4 张卡（2026-09-30 用户规格表）──
     * ⚠️【type 留空 = 视同万能】（cardFits 对缺 type 的卡不硬堵）。四张卡的效果
     *    都不属于现有三类（工造/科研/民生）的任何一类——硬归类只会误导玩家；
     *    槽位目前全是万能槽，类型约束还没开始咬人，等差异化槽位落地再标。
     * ⚠️【三张是「动态乘区」，一张是静态乘区】
     *   · card_market：storeMul:2 是**静态**字段 → 走 MUL_FIELD 表（与广场/神庙/图书馆同通道）；
     *   · card_sovereign / card_serfdom 的效果随**建筑等级**变（城堡每级+10%、藻场↔牧场互乘），
     *     静态字段表达不了 ⇒ 各自一个读数函数（castleFaithMul / serfKelpMul / serfWarmMul），
     *     读 s.cards 判断「装没装」——同一纪律：研究出市政只是拿到卡，没装 = 0。 */
    { id: 'card_sovereign', type: 'relig', name: '王权神授', civic: 'sovereign',
      effect: {},
      retiredBy: 'reformed',
      desc: '城堡每级增加 10% 信仰产出（装在卡槽里才生效）。完成《归正会》后被「天赋神权」取代而退役。', flavor: '绝罚！'},
    { id: 'card_monastery', name: '修道院', civic: 'sovereign', type: 'relig', effect: {},
      /* ERA2-7 扩卡（2026-10-22 用户拍板「直接实装」；原设计为 coreFaithMul 核心建筑每级+5%，
       * 用户改为「人口产出信仰 +50%」）：复用 popFaithMul 乘区（faithRate 人口基项 ×），1.5 = +50%。
       * 与《璀璨星图》(0.5，原神不在此的 −50% 遗产) 同通道相乘 ⇒ 同时装两张 = 人口信仰 ×0.75（净 −25%，属取舍）。
       * type='relig'（用户 2026-10-22 在待补表选「宗教槽」）：可装进 relig 专属槽，也可装进任意 wild（万能）槽
       * （cardFits: slotType==='wild' ⇒ 吃一切类型）。每个政体至少 1 个 wild 槽 ⇒ 修道院在全部 13 政体都能装，
       * 信仰 +50% 在任意政体都生效；有 relig 槽的政体（theocracy/theo_state/universal_church）则可腾出 wild 槽给别的卡。 */
      popFaithMul: 1.50,
      desc: '人口产出信仰 +50%（装在卡槽里才生效）。', flavor: '美人鱼修女，不喜欢吗？' },
    { id: 'card_serfdom', type: 'grow', name: '农奴制', civic: 'feudalism',
      effect: {},
      desc: '每级牧场给藻场效果 +1%，每级藻场给牧场效果 +1%（互乘，装在卡槽里才生效）。', flavor: '二十蒲式耳的麦粒……'},
    { id: 'card_market', name: '中世纪集市', civic: 'market', type: 'prod',
      effect: {}, storeMul: 2,
      /* 2026-10-18 用户纠错（原为 card_logistics.retiredBy='market'，方向写反 ⇒ 本卡永不退役、
       *   基础物流建设一出生就是退役态的死内容）：retiredBy 写在**旧卡**上指向**新市政**——
       *   《城市化》(ERA5) 完成后本卡退役，由 card_logistics（storeMul ×3）上位替代。
       *   与技艺→guild / 历史记录→enlightenment 等 5 处先例同方向。 */
      retiredBy: 'urbanization',
      desc: '仓储区所有建筑的仓储 +100%（即海藻仓/压舱仓/灯塔的容量贡献翻倍）。', flavor: '苹果、麦酒与乳酪。'},
    { id: 'card_guild', name: '职业行会', civic: 'guild', type: 'prod',
      effect: {}, craftRatio: 0.40,
      /* 国家凝聚力（意识形态）解锁后退役：新卡明确取代本卡，不能与 +80% 叠加。 */
      retiredBy: 'ideology',
      desc: '工坊效率 +40%（取代「技艺」；研究完成后技艺卡退役）。', flavor: '你不能逮捕盗贼行会……'},
    { id: 'card_steel_guild', name: '钢铁公会', civic: 'steel_guild', type: 'prod', effect: {},
      resOutMul: { steel: 1.15 },
      desc: '钢产出 +15%。', flavor: '批判的武器与武器的批判。' },

    /* ── ERA4 政策卡（2026-10-01 用户设计稿）──
     * 字段沿用既有通道：静态乘区走 MUL_FIELD（libraryMul 等）、动态/其余走专用读数函数
     * （canalSaveMul / bankMerchantMul / coreFaithMul / universityMul / templeFaithMul，见下方）。
     * ⚠️ type 留空 = 视同万能（cardFits 对缺 type 不硬堵），这里按卡的性质填 prod/sci/relig。 */
    { id: 'card_triangular', name: '三角贸易', civic: 'explore', type: 'grow', effect: {},
      /* 王国潮道效果额外 +100%：canalSaveMul(s) 读它，乘在 canalLuxSave 那一段上（economy 奢侈需求 D）。 */
      canalMul: 2,
      desc: '王国潮道（运河）效果额外 +100%（居民奢侈品消耗减免翻倍）。', flavor: '黑奴与黑美人鱼。'},
    { id: 'card_mineral_charter', name: '矿物章程', civic: 'mineral_charter', type: 'prod', effect: {},
      resOutMul: { iron: 1.15 },
      desc: '精铁产出 +15%。', flavor: 'Drum  links,zwei,drei' },
    { id: 'card_divine_right', name: '天赋神权', civic: 'reformed', type: 'relig', effect: {},
      /* ERA8（2026-10-18）：被《我们在此》卡取代后退役（core+space 每级 +10% 信仰 上位替代 core 每级 +10%）。 */
      retiredBy: 'cosmic_indifference',
      /* 礁栖核心所有建筑每级 +10% 信仰产出：coreFaithMul(s) 读它，乘在 faithRate 整段上。 */
      coreFaithMul: 0.10,
      desc: '礁栖核心所有建筑每级 +10% 信仰产出（替代「王权神授」）。', flavor: '主与我们同在。'},
    { id: 'card_mercantilism', name: '重商主义', civic: 'mercantilism', type: 'grow', effect: {},
      /* 被《星球村》市政完成后退役（由 card_transnational 上位替代：银行商人产出 ×4）。 */
      retiredBy: 'planet_village',
      /* 银行的商人产出加成 +100%：bankMerchantMul(s) 读它，乘在 bankLux 那一段上。 */
      bankMerchantMul: 2,
      desc: '银行的商人产出加成 +100%。', flavor: '魁奈是个外行！'},
    { id: 'card_enlightenment', name: '启蒙运动', civic: 'enlightenment', type: 'sci', effect: {},
      /* 被《太空竞赛》市政完成后退役（由 card_no_god_here 完全上位替代：潮纹馆/大学科技 ×3、神庙信仰 −50%、观测站 ×1.5）。 */
      retiredBy: 'space_race',
      /* 替代《历史记录》：潮纹馆科技 +100%（libraryMul，走 MUL_FIELD）、大学科技 +100%
       * （universityMul）、神庙信仰 −50%（templeFaithMul）。三处各自一个读数函数。 */
      libraryMul: 2, universityMul: 2, templeFaithMul: 0.5,
      desc: '潮纹馆、大学的科技加成 +100%，神庙信仰加成 −50%（替代「历史记录」）。', flavor: '伏尔泰是个外行！'},

    /* ── ERA5 政策卡（2026-10-02 实装）──
     * 字段沿用既有通道：craftRatio / happyOffset / retiredBy / squareMul / storeMul / 新动态乘区字段。
     * ⚠️ type 留空 = 视同万能（cardFits 对缺 type 不硬堵），与 era3/era4 同口径。
     * ⚠️【cost 为提议值，未拍板】同轮市政节点顺延。 */
    { id: 'card_rationing', name: '工业化配给', civic: 'rationing', type: 'prod', effect: {},
      /* 幸福度 −1（cardHappyOffset，economy 幸福恒温器 _gb 段读）；工坊效率 +40%（craftRatio，加法乘区）。 */
      retiredBy: 'common_destiny', happyOffset: -1, craftRatio: 0.40,
      desc: '幸福度 −1；工坊（工艺制作）效率 +40%。', flavor: '绳床，一夜仅需一便士。'},
    { id: 'card_political_econ', name: '政治经济学', civic: 'rationing', type: 'grow', effect: {},
      /* 替代《戏剧与诗歌》（retiredBy）：广场效果 ×2.5（squareMul）+ 歌剧院效果 ×2.5（theaterMul，新通道）。 */
      retiredBy: 'prosperity_unity', squareMul: 2.5, theaterMul: 2.5,
      desc: '广场的市政点乘区 ×2.5、歌剧院的官员市政点乘区 ×2.5（取代「戏剧与诗歌」）。', flavor: '可能性之兽。'},
    { id: 'card_logistics', name: '基础物流建设', civic: 'urbanization', type: 'prod', effect: {},
      /* 2026-10-18 用户纠错 + 链补全：原 retiredBy:'market' 方向反了（ERA2 市政淘汰 ERA5 卡 ⇒ 出生即死）。
       *   修正后替代链：中世纪集市 ×2 →(城市化)→ 本卡 ×3 →(全球化)→ 洲际物流 ×5（card_interlog）。 */
      retiredBy: 'globalization', storeMul: 3,
      desc: '仓储区建筑容量 ×3（取代「中世纪集市」）。', flavor: '国家的血管与神经。'},
    { id: 'card_city_supply', name: '城市供给', civic: 'city_supply', type: 'grow', effect: {},
      popCapFlat: 5, popGrowthTimeMul: 0.5,
      desc: '人口上限 +5，人口生产时间 −50%（取代「乡镇集会」）。', flavor: '天下攘攘皆为利往。' },
    { id: 'card_heat_priority', type: 'prod', name: '热能优先', civic: 'mobilization', effect: {},
      /* 市政/科技产出 −50%（cardCivicOutMul / cardSciOutMul）；热液能供给 +100%（cardHydroMul）。 */
      civicOutMul: 0.5, sciOutMul: 0.5, hydroSupplyMul: 2,
      desc: '市政与科技产出 −50%，热液能（蒸汽）供给 +100%。', flavor: '可是，这一切都值得吗？'},
    { id: 'card_mobilization', type: 'wild', name: '总动员令', civic: 'mobilization', effect: {},
      /* ERA8（2026-10-18）：被《星际探索热潮》卡取代后退役（退役时由 research 顺手从 s.cards 拔下）。 */
      retiredBy: 'far_sight',
      /* 闲置鲛人每提供 1% 破壳系数（shellSpeedPerIdle）。
       * ⚠️ 2026-10-24 用户拍「接线到破壳系数」：该字段**已接通** —— 唯一消费者是 civics.cardBreakCoefMul
       *   （被 shell.breakCoef 当整段乘区读）。别再当它「挂起通道」，也别在别处重复乘一次。
       *   闲置口径 = folk.idle(s) = pop − 各职业在岗人数（人类，不含机器人）。 */
      shellSpeedPerIdle: 0.01,
      desc: '每点闲置鲛人 +1% 破壳系数（破壳速度随之提升）。', flavor: '循此苦旅……'},

    /* ── ERA6 政策卡（2026-10-12 用户规格）──
     * 字段沿用既有通道：civicPerPop / luxConsumeMul（大众传媒卡）、museumMul（博物馆管理卡）、craftRatio（国家凝聚力卡）。 */
    { id: 'card_massmedia', name: '大众传媒', civic: 'massmedia', type: 'grow', effect: {},
      /* ERA8（2026-10-18）：被《社交网络》卡取代后退役（每鲛人 0.5→3 市政点的上位替代）。
       *   ⚠️ 幸福度新 3 档门控在**市政完成**（s.civics.massmedia，economy-social.happyTier），
       *      不在卡上 ⇒ 卡退役不影响档位，只换 civicPerPop/luxConsumeMul 这组数值。 */
      retiredBy: 'social_network', civicPerPop: 0.5, luxConsumeMul: 0.5,
      desc: '每名鲛人 +0.5 市政点/秒；但奢侈品消耗 +50%。', flavor: '号外！号外！'},
    { id: 'card_museum', name: '博物馆管理', civic: 'naturalhistory', type: 'wild', effect: {},
      museumMul: 2,
      desc: '博物馆效果翻倍（书手市政点 +40% 而非 +20%）；艺术品效果随轮回额外放大。', flavor: '博物馆奇妙夜。'},
    { id: 'card_national_solidarity', name: '国家凝聚力', civic: 'ideology', type: 'wild', effect: {},
      craftRatio: 0.80,
      desc: '工坊效率 +80%（取代「职业行会」的 +40%）。', flavor: '他们的土地，他们的血。'},

    /* ── ERA7 政策卡（用户规格 · 实装）──
     * 字段沿用既有通道：popCapPerPopBldg / luxConsumeMul（公摊面积）、jobOutMul / luxConsumeMul（延长工时）、
     * liveCompCivic（直播竞技）、wonderLuxSave（旅游观光）、spaceBuildSave / civicOutMul（太空竞赛）、
     * libraryMul / universityMul / templeFaithMul / obsSciMul（神不在此）、bankMerchantMul（跨国经济）、
     * templeFaithMul / sciOutMul（未来主义神学）。其中 luxConsumeMul 走通用求和（cardLuxConsumeMul），
     * civicOutMul / sciOutMul 走通用逐槽相乘（cardFieldMul），bankMerchantMul / universityMul / templeFaithMul
     * 在 Task#6 改为通用逐槽相乘，libraryMul 加入 MUL_FIELD。退役映射：
     * 启蒙运动→太空竞赛、重商主义→跨国经济（planet_village）、神学→未来主义神学（planet_village）。 */
    { id: 'card_public_share', name: '公摊面积', civic: 'modern_thought', type: 'grow', effect: {},
      /* 所有人口建筑每级 +0.5 人口上限：popCapPerPopBldg 由 economy.popCap 读（nest/coralhouse/tenement 各 +0.5/级）。
       * 取下卡时超额人口消失 = popCap 降回后由人口上限钳制自然解决（见 Task#6 人口钳制说明）。 */
      popCapPerPopBldg: 0.5, luxConsumeMul: 2,
      desc: '所有人口建筑（巢/珊瑚屋/廉租社区）每级 +0.5 人口上限；奢侈品消耗 +100%。取下卡时超额人口消失。', flavor: '狮子山精神。'},
    { id: 'card_overtime', name: '延长工时', civic: 'modern_thought', type: 'prod', effect: {},
      /* 所有职业产出 +30%：jobOutMul 由 economy 职业产出行（tick/rates 两路）逐字同构地读。
       * 奢侈品消耗 +30%（luxConsumeMul 走通用求和）。 */
      jobOutMul: 1.3, luxConsumeMul: 1.3,
      desc: '所有职业产出 +30%；奢侈品消耗 +30%。', flavor: '今日目标：'},
    { id: 'card_live_comp', name: '直播竞技', civic: 'athletics', type: 'grow', effect: {},
      /* 体育场额外产出 = 人口数 × 体育场等级 的市政点/秒（liveCompCivic 由 economy.cultureRate 读，
       * 仅当建造了体育场且装着本卡时生效）。 */
      liveCompCivic: 1,
      desc: '体育场额外产出 = 人口数 × 体育场等级 的市政点/秒（需建造体育场且装填本卡）。', flavor: '他不是一个人在战斗！'},
    { id: 'card_tourism', name: '旅游观光', civic: 'cultural_heritage', type: 'grow', effect: {},
      /* 所有奇观额外 -3% 奢侈品消耗：wonderLuxSave 由 economy.luxSaveAll 读（每座奇观 -3%，可叠加）。 */
      wonderLuxSave: 0.03,
      desc: '每座已建奇观额外 -3% 奢侈品消耗（叠加）。', flavor: '前职业：皇帝。'},
    { id: 'card_space_race', name: '太空竞赛', civic: 'space_race', type: 'sci', effect: {},
      /* 太空建筑建造 -20%（spaceBuildSave 由 economy.spaceCostMul 读）；市政产出 -20%（civicOutMul 走通用相乘）。 */
      spaceBuildSave: 0.20, civicOutMul: 0.80,
      desc: '太空建筑建造 -20%；市政产出 -20%。', flavor: '光荣的引路人'},
    { id: 'card_no_god_here', name: '神不在此', civic: 'space_race', type: 'sci', effect: {},
      retiredBy: 'solar_logistics',
      /* 替代《启蒙运动》（retiredBy 设在 card_enlightenment 上 = space_race）：潮纹馆科技 ×3（libraryMul，加入 MUL_FIELD）、
       * 研究所科技 ×3（universityMul，通用相乘）、神庙信仰 -50%（templeFaithMul，通用相乘）、星空观测站产出 ×1.5（obsSciMul）。 */
      libraryMul: 3, universityMul: 3, templeFaithMul: 0.5, obsSciMul: 1.5,
      desc: '替代「启蒙运动」：潮纹馆科技 ×3、研究所科技 ×3、神庙信仰 −50%、星空观测站产出 ×1.5。', flavor: '我没有看到上帝、天堂或者其他什么玩意。'},
    { id: 'card_transnational', name: '跨国经济', civic: 'planet_village', type: 'grow', effect: {},
      /* 链尾新卡（替代《重商主义》，旧卡 card_mercantilism 的 retiredBy:'planet_village' 已写对）。
       * ⚠️ 2026-10-21 纠错：原误带 `retiredBy:'planet_village'`（=自身 civic）⇒ 解锁即退役、卡库里永远看不到
       *   （与 2026-10-18 card_logistics 同款「方向反了 ⇒ 出生即死」）。本卡是链尾，**不应有 retiredBy**。 */
      bankMerchantMul: 4,
      desc: '替代「重商主义」：银行的商人产出加成 ×4。', flavor: '货出去，钱进来。'},
    { id: 'card_future_theology', name: '未来主义神学', civic: 'planet_village', type: 'relig', effect: {},
      /* 链尾新卡（替代《神学》，旧卡 card_theology 的 retiredBy:'planet_village' 已写对）。
       * ⚠️ 2026-10-21 纠错：原误带 `retiredBy:'planet_village'`（=自身 civic）⇒ 解锁即退役、卡库里永远看不到
       *   （与 card_transnational、2026-10-18 card_logistics 同款「方向反了 ⇒ 出生即死」）。本卡是链尾，**不应有 retiredBy**。 */
      templeFaithMul: 5, sciOutMul: 0.70,
      desc: '替代「神学」：神庙信仰 ×5、科技产出 −30%。', flavor: '第一因：宇宙大爆炸。'},

    /* ── ERA8 政策卡（2026-10-18 用户规格 · 实装）──
     * 字段通道：storeMul（MUL_FIELD，洲际物流 ×5）、civicPerPop / luxConsumeMul（社交网络，通用求和）、
     * craftRatioPerPop（虚拟现实，新动态字段：craftRatio 轴 −1%×人口，workshop 源⑩读）、
     * planetOutMul（星际物流网，cardFieldMul 通用逐槽相乘，economy 异星建筑行读）、
     * 动态信仰双乘（星际广播 faithSatMul / 我们在此 coreSpaceFaithMul，civics.dynFaithCardMul 读）、
     * starPerPop（星际探索热潮，civics.cardFeverStarMul 读）。退役映射：大众传媒→社交网络、
     * 天赋神权→我们在此、总动员令→星际探索热潮（retiredBy 设在各自被替代卡上）。 */
    { id: 'card_star_broadcast', name: '星际广播', civic: 'starfaith', type: 'relig', effect: {},
      /* 每颗（轨道卫星每级）+5% 信仰产出：dynFaithCardMul 动态读 s.lvl.satellite。 */
      faithSatMul: 0.05,
      desc: '每颗轨道卫星使信仰产出 +5%（随卫星升级变强）。', flavor: '……太阳升……'},
    { id: 'card_interlog', name: '洲际物流', civic: 'globalization', type: 'prod', effect: {},
      /* 仓储区建筑容量 ×5（storeMul 走 MUL_FIELD）。退役关系写在旧卡 card_logistics 上
       *   （retiredBy:'globalization'，2026-10-18 用户纠错后补全的 ×2→×3→×5 三级链末环）。 */
      storeMul: 5,
      desc: '仓储区建筑容量 ×5（取代「基础物流建设」）。', flavor: 'They took our job!'},
    { id: 'card_we_are_here', name: '我们在此', civic: 'cosmic_indifference', type: 'relig', effect: {},
      /* 礁栖核心+太空区所有建筑每级 +10% 信仰产出：dynFaithCardMul 动态读两级合计（用户拍 Q4 乘区）。 */
      coreSpaceFaithMul: 0.10,
      desc: '礁栖核心、星海区所有建筑每级 +10% 信仰产出（取代「天赋神权」）。', flavor: '好牌多抓。'},
    { id: 'card_social_network', name: '社交网络', civic: 'social_network', type: 'grow', effect: {},
      civicPerPop: 3, luxConsumeMul: 0.8,
      desc: '每名鲛人 +3 市政点/秒；但奢侈品消耗 +80%（取代「大众传媒」）。', flavor: '点赞哦亲。'},
    { id: 'card_vr', name: '虚拟现实', civic: 'virtual_reality', type: 'prod', effect: {},
      /* 工坊效率 −1%×人口（craftRatioPerPop，加法轴源⑩；用户确认轴上正源够厚不做护栏之外的处理）。
       * 奢侈品消耗 −60%（luxConsumeMul 通用求和可为负，luxDemandMul 已有 ≥0 护栏）。 */
      craftRatioPerPop: 1, luxConsumeMul: -0.6,
      desc: '工坊效率 −1%×人口数（加算）；奢侈品消耗 −60%（加算）。', flavor: '腐朽于摇篮。'},
    { id: 'card_space_net', name: '星际物流网', civic: 'space_politics', type: 'prod', effect: {},
      planetOutMul: 1.3,
      desc: '异星建筑（瑞亚星矿井/泰坦气云采集站）产出 +30%。', flavor: '川陀,450亿人口.'},
    { id: 'card_fever', name: '星际探索热潮', civic: 'far_sight', type: 'sci', effect: {},
      starPerPop: 1,
      /* ERA10（2026-10-20）：被《至高指令》取代（retiredBy 设在被替代卡上，值 = 替代它的市政 id）。 */
      retiredBy: 'supreme_directive',
      desc: '星空探索速率 +x%，x = 人口数（%）（替代「总动员令」）。', flavor: '翠绿的，翠绿的青草。'},

    /* ── ERA9 政策卡（2026-10-20 用户规格 · 实装）──
     * 字段通道：planetOutMul（上上善道，cardPlanetOutMul 通用相乘，economy 异星行读）、
     * squareMul/theaterMul（联邦枢密院，MUL_FIELD + 通用相乘，取代政治经济学）、
     * resOutMul（血肉苦弱，新资源乘区 map，economy iron/steel/theta 行读）、
     * craftRatio/happyOffset（各员一层奋力努力，加法轴 + 幸福度偏移，取代工业化配给）、
     * wonderBuildSave（心胜于物，新求和字段，wonder.discountedCost 读）、
     * effect.science（超凡入圣，平坦 +300/s，取代神秘主义）、
     * craftRatioRecipes（星际后勤保障，新配方级工艺加成，workshop.craftMul 读）、
     * popFaithMul/sciOutMul（璀璨星图，人口信仰乘区 + 科技乘区，取代神不在此）、
     * faithAllProdDouble/locked（轮回之终末，baseMul 旧日信仰段 ×2 + 不可卸下，信仰更名虚境）。 */
    { id: 'card_alien_abundance', name: '上上善道', civic: 'prosperity_unity', type: 'wild', effect: {},
      planetOutMul: 1.4,
      desc: '异星建筑（瑞亚星矿井/泰坦气云采集站）产出 +40%。', flavor: 'For the GREATER GOOD!'},
    { id: 'card_federal_privy', name: '联邦枢密院', civic: 'prosperity_unity', type: 'wild', effect: {},
      squareMul: 4, theaterMul: 4,
      /* 取代《政治经济学》（retiredBy 设在 card_political_econ 上 = prosperity_unity）。 */
      desc: '广场的市政点乘区 ×4、歌剧院的官员市政点乘区 ×4（取代「政治经济学」）。', flavor: 'ORDER!'},
    { id: 'card_flesh_weak', name: '血肉苦弱', civic: 'common_destiny', type: 'wild', effect: {},
      /* 精铁(iron)/钢(steel)/θ金属(thetaMetal) 产出 +30%（resOutMul map，逐资源相乘）。 */
      resOutMul: { iron: 1.3, steel: 1.3, thetaMetal: 1.3 },
      desc: '精铁、钢、θ金属产出 +30%。', flavor: '机械飞升。'},
    { id: 'card_egal_work', name: '各员一层奋力努力', civic: 'common_destiny', type: 'wild', effect: {},
      craftRatio: 1.4, happyOffset: -2,
      /* 取代《工业化配给》（retiredBy 设在 card_rationing 上 = common_destiny）。 */
      desc: '工艺效率 +140%、幸福度 −2（取代「工业化配给」）。', flavor: '滴答、滴答、滴答。'},
    { id: 'card_mind_over_matter', name: '心胜于物', civic: 'sacred_path', type: 'wild', effect: {},
      wonderBuildSave: 0.3,
      desc: '奇观建造消耗 −30%。', flavor: '我在此。'},
    { id: 'card_transcendence', name: '超凡入圣', civic: 'sacred_path', type: 'wild', effect: { science: 300 },
      /* 取代《神秘主义》（retiredBy 设在 card_mystic 上 = sacred_path）。 */
      desc: '科技产出 +300/秒（取代「神秘主义」）。', flavor: '愿你也在此。'},
    { id: 'card_interstellar_logi', name: '星际后勤保障', civic: 'solar_logistics', type: 'prod', effect: {},
      /* 指定配方工艺效率 +100%：火箭引擎(craft_rocketengine) 与 强工质火箭引擎(craft_strongprop)。 */
      craftRatioRecipes: { craft_rocketengine: 1.0, craft_strongprop: 1.0 },
      desc: '火箭引擎、强工质火箭引擎的工艺制作效率 +100%。', flavor: '冷酷的方程式。'},
    { id: 'card_brilliant_star_map', name: '璀璨星图', civic: 'solar_logistics', type: 'sci', effect: {},
      popFaithMul: 0.5, sciOutMul: 3.5,
      /* 取代《神不在此》（retiredBy 设在 card_no_god_here 上 = solar_logistics）。 */
      desc: '人口信仰产出 −50%、科技产出 ×3.5（取代「神不在此」）。', flavor: '星之海洋：初次启航'},
    { id: 'card_cycle_terminus', name: '轮回之终末', civic: 'void_faith', type: 'wild', effect: {},
      faithAllProdDouble: true, locked: true,
      desc: '信仰的全产加成翻倍；不可卸下；完成后信仰更名「虚境」并锁死。', flavor: '我们都做了什么'},

    /* ── ERA10 政策卡（2026-10-20 用户规格 · 实装）──
     * 字段通道：
     *   launchCycle（至高指令，**加法键**：与科技《空间矢量控制》的 −2s 同轴相加，
     *     落点 economy.launchCycleOf —— tick 与 rates 共用一个函数，不各写一份）；
     *   launchHydroMul（节能减耗，发射场每级热液能耗乘区，落点 economy.launchHydroPer，
     *     三处读取（tick/rates/hydroAlloc）同源）；
     *   happyConsumeMul（节能减耗，居民幸福度消耗乘区，**三处同乘**：economy-social.happyBurn
     *     / economy.js happyStep 的 _D / economy-rates.js 的 D——
     *     ⚠️ 与政体 govHappyConsumeMul / 奇观 happyConsumeMul 同一乘区链，相乘不冲突；
     *     ⚠️ 2026-10-28 前只落 happyBurn，tick/rates 漏乘 ⇒ 面板显示 +50% 而实扣不变，已修）；
     *   sciOutMul（我们的海 −30%，现成 cardFieldMul 通道）；
     *   faithOutMul（我们的海 −30%，新字段，economy.faithRate 整段乘区）；
     *   craftMul（我们的海，工坊效率**乘区 ×2**，落点 workshop.craftMul 乘区链——
     *     用户拍「乘区 ×2」，不进 craftRatio 加法轴：加法轴里 +100% 在基值 0.5 时只有 ×1.67）。 */
    { id: 'card_supreme_directive', name: '至高指令', civic: 'supreme_directive', type: 'prod', effect: {},
      launchCycle: -2,
      desc: '发射场制造节律 −2 秒（与《空间矢量控制》的 −2s 相加，10s → 6s）；取代「星际探索热潮」。', flavor: 'DAS WAR EIN BEFEHL!'},
    { id: 'card_saving', name: '节能减耗', civic: 'supreme_directive', type: 'prod', effect: {},
      launchHydroMul: 0.5, happyConsumeMul: 1.5,
      desc: '发射场热液能消耗 −50%；居民幸福度消耗 +50%。', flavor: '不惜一切代价。'},
    { id: 'card_our_sea', name: '我们的海', civic: 'our_sea', type: 'wild', effect: {},
      sciOutMul: 0.70, faithOutMul: 0.70, craftMul: 2,
      desc: '信仰、科研产出 −30%；工坊效率翻倍（乘区 ×2）。', flavor: '…直抵群星。'},

    /* ── ERA2-7 扩卡（2026-10-22 用户拍板「实装」）──
     * 不涉及新市政，全部挂在已有市政下。两张奇观减耗卡走 retiredBy 替代链（征夫发役→王室特许）。
     * type 一律留空 = 视同万能（早期 era 槽位少，万能才能装）。 */
    /* 征夫发役：纪元 1–3 奇观建造消耗 −20%。挂《技艺》(craft)，被《职业行会》(guild) 完成后退役，
     *   由《王室特许》上位替代（retiredBy 指向后继市政 id，与技艺→guild 同先例）。 */
    { id: 'card_corvee', name: '征夫发役', civic: 'craft',
      retiredBy: 'guild',
      wonderBuildSaveEra: 0.20, wonderEraCap: 3,
      desc: '纪元 1–3 奇观建造消耗 −20%。完成《职业行会》后由「王室特许」取代而退役。', flavor: '消耗建造者一次使用次数，为奇观建造提供20%进度。' },
    /* 王室特许：纪元 1–5 奇观建造消耗 −20%（取代征夫发役，覆盖到 era5）。挂《职业行会》(guild)，无 retiredBy（链尾）。 */
    { id: 'card_royal_charter', name: '王室特许', civic: 'guild',
      wonderBuildSaveEra: 0.20, wonderEraCap: 5,
      desc: '纪元 1–5 奇观建造消耗 −20%（取代「征夫发役」）。', flavor: '消耗一位大工程师，提供215产能。' },
    /* 五年计划：精铁 + 钢 产出 +30%。挂《工业化配给》(rationing)，复用 resOutMul 通道（economy iron/steel 行已读 cardResOutMul，零代码）。 */
    { id: 'card_five_year', name: '五年计划', civic: 'rationing', type: 'prod',
      resOutMul: { iron: 1.30, steel: 1.30 },
      desc: '精铁、钢产出 +30%。', flavor: '不依靠外国资本而实现工业化，就是赢了第一局。' },
    /* 庄园制：食物产出 ×1.20。挂《封建主义》(feudalism)，复用 foodOutMul 通道（economy.foodRate 末行乘区）。 */
    { id: 'card_manorialism', name: '庄园制', civic: 'feudalism', type: 'grow',
      foodOutMul: 1.20,
      desc: '食物产出 ×1.20。', flavor: '我们抓住了狼的耳朵，既不能抓住它，也不能安全地放开它。正义在天平的一端，自保在另一端' },
    /* 启蒙沙龙：科技产出的 15% 转为市政点，且计入累计市政产出（意识形态门槛）。
     * 挂《启蒙运动》(enlightenment)，sciToCivic 通道；tick 与 rates 同源（SB.economyInternals.sciOut）。 */
    { id: 'card_salon', name: '启蒙沙龙', civic: 'enlightenment', type: 'sci',
      sciToCivic: 0.15,
      desc: '科技产出的 15% 转为市政点（计入累计市政产出）。', flavor: '一种非宫廷的、基于理性与口才而非血统的社交秩序。' },
    /* 公司税：公司产出加成与奢侈消耗加成 ×1.3。挂《宏观经济学》(macroeconomics)，companyBonusMul 通道。 */
    { id: 'card_corp_tax', name: '公司税', civic: 'macroeconomics', type: 'grow',
      companyBonusMul: 1.30,
      desc: '公司产出加成与奢侈消耗加成 ×1.3。', flavor: '每个毛孔都滴着血和肮脏的东西。' },
    /* 考古发掘：艺术品 / 潮纹记录 工艺效率 +25%。挂《考古学》(archaeology)，复用 craftRatioRecipes 通道（workshop 已读，零代码）。 */
    { id: 'card_archaeology', name: '考古发掘', civic: 'archaeology',
      craftRatioRecipes: { craft_artwork: 0.25, craft_tidal_record: 0.25 },
      desc: '艺术品、潮纹记录的制作效率 +25%。', flavor: '我们的过去？谁的过去？' },
    /* 质量效应（星屑回流改名）：轮回星屑结算 ×1.15。挂《先民遗产》(ancestor_heritage)，breakStardustMul 通道（prestige.stardustGain 结算/预览同源）。 */
    { id: 'card_mass_effect', name: '质量效应', civic: 'ancestor_heritage',
      breakStardustMul: 1.15,
      desc: '本轮回星屑获取 ×1.15（破壳结算时计入）。', flavor: '红，蓝，还是绿？' }
  ];
  // Public content tables are shared by migration, UI, and the civic rules module.
  SB.CIVICS = CIVICS;
  SB.GOVS = GOVS;
  SB.POLICIES = POLICIES;
  SB.civicData = { CIVICS: CIVICS, SLOT_TYPES: SLOT_TYPES, GOVS: GOVS, POLICIES: POLICIES };
})(typeof window !== 'undefined' ? window : globalThis);
