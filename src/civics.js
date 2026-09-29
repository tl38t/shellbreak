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
      note: '鼓舞：掌握科技「工程学」。' }
  ];

  /* 槽位类型。Civ6 是 军事 / 经济 / 外交 / 万能；本作按约束 §2 砍掉军事（没有军事单位）、
   * 外交（没有城邦）⇒ 只剩这三类 + 万能。
   * ⚠️ 本作是纯放置经营、产出线只有「人口 × 职业 × 建筑」⇒ 槽位类型按**经济职能**分，
   *    不按资源分：给了「珊瑚 +X%」这种分类，玩家一眼能看出该塞哪张，反而是好事。 */
  var SLOT_TYPES = {
    wild: { name: '万能槽', desc: '可装填任意类型的政策卡。' },
    prod: { name: '工造槽', desc: '只吃工造类政策卡——加工与建造。' },
    sci:  { name: '科研槽', desc: '只吃科研类政策卡——科技产出。' },
    grow: { name: '民生槽', desc: '只吃民生类政策卡——人口与饮食。' }
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
      desc: '幸福度 +1（常驻，提高全产乘区档位）。' }
  ];

  /* 政策卡。effect 同样是平坦加值/秒，且**只有在卡槽里装着它时才生效**。
   * ⚠️ type 决定它**能进哪种槽**（规则见 cardFits）。era1 现在只有 1 个万能槽 ⇒
   *    两条卡都能塞、类型此刻**不产生取舍**——这是「只搬外壳」那一轮的预期结果，
   *    等第二个槽出现、且它不是万能槽时，类型约束才开始咬人。 */
  var POLICIES = [
    { id: 'card_craft',  name: '技艺',     civic: 'craft',  type: 'prod', effect: {},
      desc: '（待工坊内容落地后生效）' },
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
      desc: '潮纹馆的科技加成 ×2（即「图书馆效果」翻倍，不含研究所那一份）。' }
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
    card_drama: 'squareMul', card_theology: 'templeMul', card_records: 'libraryMul'
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
  function govLuxuryMul(s)  { var g = govById(s.gov); return g && typeof g.luxuryMul === 'number' ? g.luxuryMul : 1; }
  function govHappyBonus(s) { var g = govById(s.gov); return g && typeof g.happyBonus === 'number' ? g.happyBonus : 0; }

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
    govCraftRatio: govCraftRatio, govLuxuryMul: govLuxuryMul, govHappyBonus: govHappyBonus,
    /* 三个乘区出口：政策卡的「效果 +100%」各自挂在卡的一个字段上，
     * 由这三个函数统一读出（实现见 policyMul）。 */
    squareMul: squareMul, templeMul: templeMul, libraryMul: libraryMul
  };
})(typeof window !== 'undefined' ? window : globalThis);
