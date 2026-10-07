/* 天壳 / SHELLBREAK — 科技树数据层（五纪元 / 28 项）
 *
 * ⚠️ 本文件在 2026-09-25 之前是「死文件」：里面那份 44 项五纪元树用的是另一套经济
 * （藻食/壳礁/研究、冰窟/藻食田/礁矿、12 职业），与跑着的游戏完全不重合，
 * 且没有在 index.html 里加载、没有任何模块读它。
 * 现按用户拍板「根据科技树对整个游戏进行改造」整体重写：
 *   —— **数据挂到现有经济上**（7 资源 / 4 职业 / 13 建筑 / 已调好的 8-14h 节奏不动），
 *   —— **科技树成为整局推进的骨架**：尤里卡揭示 → 投科技研究 → 解锁建筑/职业/效果
 *      → 本纪元关键节点全清 → 进入下一纪元 → 显示下一纪元的尤里卡条件 → 循环
 *      → 破壳纪（工业）才解锁破冰祭坛（奇迹装置）。
 *
 * 数据结构
 *   era  —— 所属纪元（1..5）
 *   cost —— 研究所需科技
 *   key  —— 关键节点。本纪元 key 全清 ⇒ 进入下一纪元
 *   free —— 免费项：揭示即掌握，不花科技（防「研究资源自己锁死研究资源」的死锁）
 *   reqs —— 前置科技 id，全部掌握才可在树上选它
 *   cond —— 尤里卡条件。未达成则该节点保持「未知」，不显示在可研究列表里
 *   eff  —— 研究完成后生效。见下方「闭合效果词表」
 *
 * ── 闭合效果词表（改动前先读）──
 * 本文件只承认下面这些键。多一个键就多一处「研究完没反应」的可能，
 * 所以每加一个键，必须同时把 economy.js / shell.js 的算式改到读它（见 SB.tech.mul）。
 *   乘区（默认 1）   gather 采集产出 ｜ food 藻食产出 ｜ sci 科技产出 ｜ craft 加工产出
 *                    fuel 地热产出 ｜ smelt 矿砂→精铁（骨工法已于 2026-09-27 随骨材线删除）
 *                    miracle 祭坛削壳
 *   加区（默认 0）   warm 抗寒上限 ｜ coef 破壳系数 ｜ house 住房（生育速率）
 *                    ｜ kelpCap 藻食上限
 *   特殊             season 季节减产（0..1，越大越不挨冻）
 *   解锁             unlockBuild [建筑 id] ｜ unlockJob [职业 id]
 *
 * 尤里卡条件（cond.t）种类，与 src/tech.js 的判定逐个对应：
 *   default           开局即可见
 *   built  {b,n}      该建筑累计达到 n 级
 *   total  {n}        建筑总级数达到 n
 *   res    {r,n}      某资源存量达到 n
 *   gathered{r,n}     该资源累计产出达到 n
 *   rate   {r,n}      该资源每秒产出达到 n
 *   pop    {n}        人口达到 n
 *   job    {j,n}      某职业人数达到 n
 *   techs  {n}        已掌握科技数达到 n
 *   coef   {n}        破壳系数达到 n
 *   eraTechs{era,n}   某纪元已掌握科技数达到 n
 *
 * ── 依赖深度（改 reqs 之前必读）──
 * reqs 只决定「树上哪些节点能同时点亮」，**不决定研究顺序**：真正卡节奏的是尤里卡条件
 * （cond），而 canStudy 的纪元闸门又把跨纪元的提前研究一并挡掉。所以压深度不会让任何
 * 科技提前到本纪元之前——它买来的是**同层并行度**：
 *   压平前，纪元三是「冶炼 → 烟囱炉 → 机械」三段串着走，玩家没有选择，只有等待；
 *   压平后这三项与精铁术同时可点，同一段时间里第一次出现了方向之争。
 *
 * 2026-09-25 压平（用户拍板「压深度」，把主干直链打散成网状）：
 *   压平前  11 层，最深 shellBreaker = L10，主干一根串到底：
 *             craftT→smelt→ironpeak→keel→ignition→turbine→ballistics→siegeT→shellBreaker
 *   压平后   7 层，最深 shellBreaker = L6
 *             L0×7  L1×4  L2×3  L3×5  L4×6  L5×2  L6×1
 * 手法定式：**给深层节点补一根浅层宽基做旁路**，而不是把原有的深层前置删掉。
 *   例：匠作除「骨工法」之外再挂「凿珊瑚」（开局默认可见），这条线就不必再从骨工法
 *       一路等下去——旁路是加出来的，主干一条没动。
 * ⚠️ 6 层是这棵树的**硬下限**，不是没做到：
 *      shellBreaker ≥ siegeT+1 ≥ ballistics+2 ≥ turbine+3 ≥ ignition+4 ≥ hearthfire+5 = L6
 *   每一段「≥1」都有证据：热泉井由点火术解锁、热泉井是涡轮的尤里卡条件、
 *   地热产出速率是冲击弹道的尤里卡条件、破壳系数 9 是破冰工程学的尤里卡条件。
 *   想最深压到 L5，只能删祭坛链上的某一环（那是在改终局内容），不是改 reqs 能解决的。
 * ⚠️ 改 reqs 的两条自查：
 *   ① 「尤里卡条件与 requiredTech 不能指向同一件东西」——见 smelt / 热泉炉 那条注。
 *   ② 新加的浅层前置，它的 cond 必须**已经能达成**，否则等于给这个节点又加了一把锁；
 *      反过来，若换掉的深层前置本来就会被某条 cond 逼着去研究，那它留在 reqs 里只是
 *      把树画成一条链，不产生任何额外顺序约束（精铁术换父就是这种情形）。
 */
(function (root) {
  'use strict';
  var NS = (root.TB = root.TB || {});
  var SB = (root.SB = root.SB || {});

  /* ── 纪元 ──
   * 五个纪元 = 一整局的推进骨架，与「破壳系数 / 削壳进度」这条主线的关系：
   *   纪元一 暗流 → 摸到珊瑚与骨材
   *   纪元二 冷焰 → 学会保温与加工（匠人）
   *   纪元三 硫泉 → 热泉炉出精铁
   *   纪元四 洋流 → 热泉井出地热
   *   纪元五 破壳 → 祭坛凿穿最后 25%，奇迹装置在此解锁
   * 与人类技术史的顺序刻意相反（火→力→电），见 docs/TECH_TREE_v0.2.md §1.1。 */
  var ERAS = [
    { id: 1, name: '暗流纪', motto: '摸到石头', color: '#6FE3D2', glyph: '一',
      desc: '在冰壳下认得第一块能用的东西：珊瑚、骨材、怎么活过第一个寒季。' },
    { id: 2, name: '冷焰纪', motto: '第一次有光', color: '#7FE9C8', glyph: '二',
      desc: '学会留住热、把珊瑚凿成骨材、让一部分人不再去采而是去想。' },
    { id: 3, name: '硫泉纪', motto: '材料革命', color: '#FF7A45', glyph: '三',
      desc: '热液丘把硫铁送到手里。精铁一旦够用，冰壳就第一次变成「可以算的工程量」。' },
    { id: 4, name: '洋流纪', motto: '借力', color: '#4FC3F7', glyph: '四',
      desc: '潮汐的机械能被抓在手里：地热、转速、把整座礁当成一台机器。' },
    { id: 5, name: '破壳纪', motto: '工业化', color: '#F2C14E', glyph: '五',
      desc: '造得出天穹钻机这样的奇迹装置，凿穿最后 ' + 25 + '% 壳厚是这一纪元的全部内容。' }
  ];

  var TECHS = [
    /* ═════════ 纪元一 · 暗流（12 项 · 四层） ═════════
     * 2026-09-26 用户重排（原 7 项单层 → 现 12 项四层）。四层的形状是刻意的：
     *   层一「记事」   —— 只有一个动作：学会记下昨天
     *   层二「下手」   —— 四个方向同时打开（时间 / 材料 / 食物 / 石头）
     *   层三「加深」   —— 前一层拿到的东西被加工成第二层成果（科技 / 食物 / 更准的周期 / 金属）
     *   层四「成事」   —— 前三层攒够了才谈得上盖东西
     * 这样玩家每往上一层都看得见「我上一个选择带来了什么」，而不是一堆平铺的名词。
     * 成本带 25…600。⚠️ 2026-09-27 用户按猫国形态重新定价后，**层深与价格已不成比例**：
     *   最贵的青铜术 600 落在层四，最便宜的凿珊瑚 25 落在层二 ——「层越深越贵」这条
     *   旧口径已失效（见下面七项各自的定价注）。
     * ⚠️ **layer 是列号（x 轴），不是「第几层」这个order** —— 2026-09-26 用户两次纠正都
     *    指向同一件事：他要的是**文明 6 那种科技树**（节点按行列摆在横卷上、前置之间画
     *    连线、横向滚动看后面的纪元），不是带「第 N 层」小标题的竖排列表。
     *    竖排列表里「层一」和「层二」读起来是上下并列，看不到先后；摆成列之后
     *    「结绳在最左、历法往右一列」才是用户要的形状。
     *    行（y 轴）不由数据定，由 tech.js 的 layout() 分配（同列不许撞行），见那里。 */
    /* ⚠️ 结绳的尤里卡条件**同时就是「科技面板的开门条件」**——这是全树唯一一个不靠玩家
     * 投科技、也不靠玩家自己去点开的节点（docs/TECH_TREE_v0.3.md §2.1）。
     * 顺序是刻意的：建成第 5 座深海藻场 ⇒ 弹叙事窗 ⇒ 科技页翻开 ⇒ 结绳已在树上（已掌握）⇒ 往下铺。
     * 【为什么 cost 还是 0】它不花科技。科技是研究资源，若「学者职业」自己要花科技去换，
     * 整棵树开局死锁。canStudy 对 cost 为 0 的项直接返回 false，所以它由 discover() 的
     * free 分支「揭示即掌握」完成，不走研究按钮。
     * 【为什么不是开局 default】面板在开门前根本不显示，cond 写 default 会让
     * 「开门」这件事变成纯 UI 开关，与树上那条 built kelp n=5 说两套话。 */
    { id: 'writing',    name: '结绳',   era: 1, cost: 0,   branch: 'know', free: true, key: false, reqs: [], layer: 1,
      cond: { t: 'built', b: 'kelp', n: 5 },
      eff: { unlockJob: ['scholar'] },
      note: '免费项，且是科技面板的开门节点：建成第 5 座深海藻场即掌握。层一。' },

    /* ── 层二 · 下手 ──
     * 四项同时可点：玩家在同一刻第一次有「往哪边走」的选择。
     * 四个尤里卡条件刻意分属四种不同的「玩家行为」（攒 / 建 / 点 / 没人），
     * 这样不管玩家开局怎么玩都能点亮其中两项，不会卡在「非得先做某件事」。 */
    /* 【科技定价 2026-09-26 二调】era1 ×0.64、era2 ×0.74（era3-5 不动），四舍五入到 5。
     * 依据（用户拍板「科技太慢了，降消耗」）：探针实测 rational 时间线，
     * era1 全程 1-2 学者、没有潮纹馆，每项干等 28-44 分钟（间隙 = 成本 ÷ 0.03，sci 是唯一约束），
     * era1 用 7.6% 的科技点数占了 61% 的科技时间；潮纹馆上线后 era2-5 合计 9725 sci 只花 3.0h。
     * 锚点：era1 每项 1 学者 ≤ 25 分钟 / 2 学者 ≤ 15 分钟（cost ≤ 0.03×1500 ≈ 45-65）。
     * ⚠️ 代价：rational 破冰时长会随之跌破 8h 下限（已在标定债清单，等标定轮重锚窗口）。
     * 【前情】同一天早些时候我为救一次 balance 死锁，把它改成 `free: true`（开局默认可见），
     *   理由写的是「珊瑚匠锁在付费科技后面 ⇒ 开局死锁」。**那个理由本身没错，
     *   解法选错了**：死锁的成因是 sim 的 bot 不会「点手动采集按钮」，
     *   而 config.js 的 GATHER 那条手动口子本来就是留给玩家的破局路径 ——
     *   与其改科技解锁（产品侧设计），不如让 sim 走玩家那条路。
     * 【改回后的开局（用户 2026-09-26 拍板）】珊瑚匠照旧锁在这项科技后面，
     *   于是首座礁口巢的珊瑚 5 只能靠手动点「采珊瑚」攒：手速 1 次/秒约 50 秒、
     *   3 次/秒约 17 秒。这是真实玩家的开局第一步，不是 bug。
     * ⚠️ 配套的两处（少了它们撤回之后会重新死锁，别只改这里）：
     *   ① `sim/balance.mjs` 主循环在珊瑚匠解锁前模拟手动点击入账；
     *   ② `sim/e2e.mjs` 用真实点击路径断言「手动采集珊瑚能建起首座礁口巢」。
     * 「住房是真闸门」照样成立 —— 闸门是容量，不是材料。 */
    { id: 'coralcut',   name: '凿珊瑚', era: 1, cost: 25,  branch: 'live', key: false, reqs: [], layer: 2,
      cond: { t: 'default' },
      eff: { unlockJob: ['coralwright'] },
      note: '珊瑚匠随之开放。首座礁口巢的珊瑚得先靠手动凿——攒够了再解放一个职业。' },

    { id: 'quarry',     name: '采石',   era: 1, cost: 30,  branch: 'live', key: false, reqs: [], layer: 2,
      cond: { t: 'res', r: 'coral', n: 40 },
      eff: { unlockJob: ['quarrier'] },
      note: '采石工产「石头」。cond 用珊瑚存量而不是时间：玩家攒够了自然会去凿石头，\n      *   这也是石头这条线第一次在树上露面（它后面要养石屋）。' },

    { id: 'plant',      name: '种植',   era: 1, cost: 30,  branch: 'live', key: false, reqs: [], layer: 2,
      cond: { t: 'res', r: 'kelp', n: 60 },
      eff: { farm: 0.50, unlockBuild: ['kelpstore'] },
      /* ⚠️ 这不是「多一个产藻食的职业」，而是**同一个人换了身份**——
       * 采集者职业在掌握本项之后显示名变成「农民」（folk.jobName），产出 +50%（farm 乘区）。
       * 另开一个 farmer id 会让玩家在两个产同一资源的职业之间无从取舍。
       * cond 用「存量 60」而不是「已经研究别的」：它是层二，不需要前置。
       * ⚠️【2026-09-26 第三轮加 unlockBuild】用户拍板「种植解锁海藻仓，对标粮仓」——
       *   藻食的储存能力从此挂在**生存支**的第一项上（有吃的 ⇒ 才谈得上存得住），
       *   与猫国 barn 由「Pottery/早期科技」带出场的节奏同构。
       *   这条以前挂在储藻术（warmkeep，era2）上，era1 完全没有藻食扩容手段。 */
      note: '采集者 → 农民，藻食产出 +50%，并解锁海藻仓。同一个人换了身份，不是新职业。' },

    { id: 'calendar',   name: '历法',   era: 1, cost: 40,  branch: 'know', key: true,  reqs: [], layer: 2,
      cond: { t: 'gathered', r: 'kelp', n: 200 },
      /* 【2026-09-30 用户拍板：去掉历法的「季节减产收窄」效果】
       * 历法现在**只**是信息型奖励：掌握后 seasonMeta 才返回海底火山周期名与读数
       * （见 economy.seasonMeta / ui/render.js renderEnv），不再动任何产量。
       * 季节减产的收窄改由**海潮占卜（tiddivine.season 0.18）单独提供**，避免两档叠加；
       * 若哪天想让历法也收窄，把下面这行加回来即可：eff: { season: 0.25 }。
       * ⚠️ 历法仍是纪元一关键节点（与石工一起推进纪元），去掉收窄不影响它的 key 地位。
       * 【「看得见」在哪】seasonMeta(s) 在历法掌握后才返回周期名与读数，
       *   未掌握时玩家只看到一句「看不出规律」——信息型奖励（海底 lens 铁律 3）。 */
      note: '信息型奖励：第一次把海底火山的活跃 / 平稳 / 休眠周期变成一句能背下来的算数。\n      *   关键节点。' },

    /* ── 层三 · 加深 ── */
    /* 书写 = 原「治学」（scholarT）改名 + 提前，并**接管潮纹馆的解锁**。
     * 用户规格：书写可以建立潮纹馆（对标猫国图书馆），同时学者产出 +25%。
     * 【为什么 id 还是 scholarT 没换】换 id 会污染存档默认表与所有按 id 取的算式，
     *   而这里要换的只是名字与定位；`s.techs.scholarT` 在老档里照常读得到。
     * 【为什么 cond 从「已有学者」改成「已有学者 + 潮纹馆已露头」】
     *   原来的 cond 是 job scholar n=1（研究完结绳就达成了），那几乎等于免费送；
     *   现在它要解锁潮纹馆，得让玩家先真的开始想事情再给工具。 */
    /* ⚠️ 2026-10-05 用户拍板：**书写 400 → 150**（理由同「农民产出过高」那轮 ——
     *    era1 点价整体偏高，书写卡在 400 会让「潮纹馆 + 学者 +25%」这条线太晚才启动）。
     *    era1 合计随之 2875 → **2625**（对猫国同期 14630 = 17.9%）。
     * ⚠️ 2026-09-27 用户全新定价（era1 点价从「按时间反推 2h」掀翻成「按猫国形态给」）：
     *    畜牧 200 / 采矿 200 / 海潮占卜 350 / 书写 150(原400) / 石工 500 / 青铜术 600 / 保温法 500，
     *    合计 2625（不含免费的结绳与层二四项中的凿珊瑚 25 / 采石 30 / 种植 30 / 历法 40，
     *    那四项按用户指示未动）。对照猫国同期累计 14630 点 ⇒ 本作仍是其 17.9%。
     *    ⚠️ 这批数字**推翻**了 09-27 早前那轮「era1 压到 2h」的全部实测结论
     *      （205 / 224 / 230 / 265 / 385 那串档位与 1.65h / 1.75h / 2.84h 那些读数，
     *       来源是已删除的 sim/balance.mjs，**不可复现、已作废，别再引用**）。
     *    ⚠️ 排他的另一条结论仍然有效：era1 的时长不是点价决定的，是
     *      「人口 / 藻场 / 住房」节律在托底 —— 把成本抹成 0 整局反而更慢（48h 凿不穿）。
     *      所以这批涨价**不会**线性拉长 era1，真正的瓶颈仍在那三个 cond。 */
    { id: 'scholarT',   name: '书写',   era: 1, cost: 150,  branch: 'know', key: false, reqs: ['writing'], layer: 3,
      cond: { t: 'job', j: 'scholar', n: 1 },
      eff: { sci: 0.25, unlockBuild: ['library'] },
      note: '潮纹馆（原「聆听巢」）的解锁项 + 学者产出 +25%。层三。' },

    { id: 'herd',       name: '畜牧',   era: 1, cost: 200,  branch: 'live', key: false, reqs: ['plant'], layer: 3,
      cond: { t: 'built', b: 'kelp', n: 6 },
      eff: { unlockBuild: ['warmnest'] },
      /* 「深海鱼牧场」= 现有 warmnest（保温巢）的深海化改名。
       * 【为什么不是新建筑】猫国 pasture 那一格（省口粮）我们已经有了 warmnest，
       *   用户说的「深海鱼牧场，消耗少量珊瑚 + 藻食」正好就是 warmnest 的成本
       *   （catnip 100 + wood 10 那个配比）。再做一个省口粮建筑 = 两个同效果建筑。
       * 【为什么把解锁从「保温法」移到这里】原 warmnest.requiredTech 是纪元二那项
       *   （现已删除的 insulation），而用户规格里的「保温法」在新结构里是**暖石开关**
       *   （不再解锁建筑），所以省口粮这个建筑必须由畜牧来开，否则会没人解锁。 */
      note: '解锁深海鱼牧场（省口粮）。猫国 pasture 位，本作改名为鱼牧场。' },

    { id: 'tiddivine',  name: '海潮占卜', era: 1, cost: 350, branch: 'know', key: false, reqs: ['calendar'], layer: 3,
      cond: { t: 'res', r: 'science', n: 30 },
      eff: { season: 0.18 },
      /* 用户规格：活跃产出 +43%、休眠 −37%。
       * 海潮占卜**单独**把季节减产再收窄 0.18（历法自 2026-09-30 起不再收窄，本项是唯一收窄来源），
       *   寒流季裸倍率 0.25 → 1-(1-0.25)×(1-0.18) = 0.385。
       * ⚠️ ADD 表里 season 是**累加**项（tech.js 的 ADD.season = 1）—— 若日后历法重新加回 season，
       *   两项会叠加 0.25 + 0.18 = 0.43，而不是覆盖。
       *   （见历法上方那段注）—— 现在两项一起真正生效了。
       * 数值不必逐位对齐「43/37」——那两个数描述的是手感（波动更明显、更可预测），
       * 真正要锁的是「比裸季更窄一档」，标定那轮调一个数即可。 */
      note: '比裸季更窄：海底火山的周期波动被读得更死（活跃更旺、休眠更枯），是唯一的季节收窄来源。' },

    { id: 'mining',     name: '采矿',   era: 1, cost: 200,  branch: 'live', key: false, reqs: ['quarry'], layer: 3,
      cond: { t: 'res', r: 'stone', n: 30 },
      eff: { unlockJob: ['miner'], unlockBuild: ['siltpit'] },
      /* 矿工产「金属」（silt 这个 **id** 对应的显示名）+ **伴生暖石**；砂矿坑同门解锁，
       * 只给矿工金属产出 +20%/级、自己一克不产（2026-09-26 对齐猫国，见 config 砂矿坑注）。
       * ⚠️ cond 要求石头 30 而不是直接 default：它挂在采石之后，
       *   玩家先摸到石头、再发现石头里还能刨出金属——顺序感来自 cond 而不是 reqs。
       * ⚠️ 建筑侧也挂了 requiredTech:['mining']（双写一致），e2e「建筑解锁来源」守着两边。 */
      note: '解锁矿工与砂矿坑：矿工产金属、伴生暖石（保温法开关的燃料）；砂矿坑把金属产出再提两成。' },

    /* ── 层四 · 成事 ──
     * 三项都要先有前三层的东西才露面，所以这一层是「兑现」而不是「选择」。 */
    { id: 'masonry',    name: '石工',   era: 1, cost: 500, branch: 'survive', key: true, reqs: ['quarry'], layer: 4,
      cond: { t: 'res', r: 'stone', n: 100 },
      /* ⚠️ 2026-09-27 加了 `unlockJob: ['scribe']`：市政页的开门条件（市政点产出口）
       *    与这一项是**同一个科技**——石工 = 「文明成型」那一刻，同时给出住房第二档、
       *    议事厅、书手。这样市政页不会在书手还没解锁时就开着一个空页面。
       *    ⚠️ 书手解锁项只能挂在这一项上：era1 的其它科技要么太早（人口还少、抽人抽不起），
       *       要么已经被别的职业占掉（凿珊瑚→珊瑚匠、采石→采石工、采矿→矿工、书写→学者）。
       *    解锁机制本身走 folk.js 的反查表（eff.unlockJob ⇒ 职业），无需新造。
       * ⚠️ 「开启市政树」那句承诺的兑现口径：议事厅**建筑**由本项解锁（一直如此），
       *    而市政**页面**的开门判据是「议事厅建成 ≥ 1 级」（civics.panelOpen，派生、不存档）。
       *    议价效果（每级 −2% 成本）仍在 economy.costOf，与产市政点是两件事并存。 */
      eff: { unlockBuild: ['coralhouse', 'hall'], unlockJob: ['scribe'] },
      note: '解锁石屋（人口上限 +4）、议事厅与书手。关键节点，本纪元收尾。' },

    { id: 'bronze',     name: '青铜术', era: 1, cost: 600, branch: 'live', key: false, reqs: ['mining'], layer: 4,
      cond: { t: 'res', r: 'silt', n: 60 },
      eff: { unlockBuild: ['workshop'] },
      note: '解锁工坊：珊瑚→骨材、矿砂→精铁两条加工线的物理前提。' },

    /* ⚠️ 这里**没有任何 eff.warm**：抗寒上限已经跟着纪元二那项「御寒术」一起删掉了
     *    （用户规格里从来没有过它，是我重排时自己造的）。删干净之后 tech.js 的
     *    `warm` 乘区也没有了生产者，于是 economy.warmCap 只读建筑侧（保温巢/热泉炉的等级）。
     * ⚠️ 不要「顺手加回 eff.warm 让面板好看」——那会让 保温法 与已删的御寒术 效果重复。
     *    保温法这层的全部兑现物就是下面这个暖石开关。
     * ⚠️ id 用的是 `thermal` 而不是沿用 `insulation`：`s.techs` 是存档默认表的键，
     *    migrate 按 id 过滤老档，换 id 等于给「保温法」换了一个存档身份。 */
    { id: 'thermal',    name: '保温法', era: 1, cost: 500, branch: 'survive', key: false, reqs: ['mining'], layer: 4,
      cond: { t: 'res', r: 'warmstone', n: 20 },
      /* ⚠️ 这里**故意没有 eff**。整个兑现物就是下面那个暖石开关，顶回多少由
       *    SB.CFG.WARM_RELIEF 决定，接线在 economy.warmRelief → foodRate。
       * ⚠️ 别改成 `eff: { season: 0.25 }` —— 理由**不是**「seasonMul 不读 m.season」：
       *    那条路 2026-09-26 已修好（暖石顶回与历法收窄现在是**相加**，见 economy.seasonMul）。
       *    现在的理由是**效果重复**：纪元一已有一项「历法」专门负责收窄季节减产，保温法再给
       *    一份 season，两项叠在同一个乘区里，玩家只读到「又收窄一次」却分不清是谁给的。
       *    保温法的身份就是「开一个开关」。
       * ⟨历史：修好之前，凡是写了 `eff.season` 的科技都只改到 seasonMeta 那个面板读数 ——
       *   生产路径传 0（= 没烧暖石）把 m.season 整个顶掉 ⇒ 面板说收窄 25%、实账一点没变。
       *   当时在这里留了「千万别写 eff.season」的警告，但警告写给了保温法，
       *   真正挂着这个 eff 的历法反倒一直没被覆盖。⟩
       * 【为什么 cond 要暖石 20】暖石只有矿工产、且是伴生（SB.UNIT.warmstone 0.05），
       *   要求存量 20 等于要求玩家真的雇了矿工——这条线的存在感全在这里。 */
      eff: { },
      note: '暖石开关：休眠期消耗暖石，抵消季节减产。' },

    /* ── 以下三项随纪元一重排一起处理 ──
     * reefwork / warmkeep / tidewatch：原纪元一成員，重排后移到纪元二（见下）。 */

    /* ═════════ 纪元二 · 冷焰（4 项 · 90/110/110/150） ═════════
     * 「第一次有光」：照明（生活层面的光）+ 铁器（技术层面的光）。
     * ⚠️ 2026-09-28 重排：这一层原先是 礁石术 / 储藻术 / 保暖术 三项（其中保暖术还是个
     *    空壳：它解锁的 hearth 建筑已于 2026-09-26 删除），用户拍板**全部废弃重做**，
     *    只留下面两项 + 下面靠后的匠作 / 通识。 */
    /* 照明：解锁压舱库。
     * ⚠️ 用户规格原话「不需要尤里卡直接显示」⇒ **故意不写 cond**，不是漏写。
     *    不写 cond 的科技走 default 分支直接露面，与写 `cond:{t:'always'}` 等价但更短。
     * ⚠️ 解锁权双写：这里的 eff.unlockBuild 与 config 里 `ballast.requiredTech` 指向同一项
     *    （同 kelpstore/plant 的老规矩；⚠️ 2026-09-28 礁石平台删除后，本项只解锁压舱仓一座），e2e「建筑解锁来源」守着两边一致。
     * ⚠️ eff.kelpCap 是**加法**量 ⇒ 藻食上限 +200，与其它仓储加成同口径。 */
    /* ⚠️ 2026-09-28 用户拍板：**照明升为纪元二关键节点**（原话：「工程学和照明吧」——
     *    指补回 era2 的 key 节点）。背景：删掉「通识」后 era2 一个 `key:true` 都不剩，
     *    `eraProgress` 的 `done >= keysTotal`（0>=0）恒真 ⇒ 一进 era2、下一次 pump 就
     *    自动跳到 era3，本纪元的内容玩家来不及玩。现在 key = 照明 + 工程学两项，
     *    era2 的推进重新有账可查。 */
    { id: 'lighting',  name: '照明',   era: 2, cost: 800,  branch: 'live', key: true, reqs: [], layer: 1,
      eff: { kelpCap: 200, unlockBuild: ['ballast'] },
      note: 'Civ6: Pottery 位 · 藻食第一次有了「可以存下来」的意思（藻食上限 +200）。' },

    /* 铁器：解锁热泉炉与工坊里的铁质工具三件。
     * ⚠️ 尤里卡条件为什么是「库存金属 60」而不是别的数，两个方向都有硬约束：
     *    · **上限**：cond 判的是**当前库存**，而 CAP_BASE.silt = 200（压舱仓每级 +120）。
     *      N 一旦 > 200，玩家会撞上「攒不到 N → 研究不了铁器 → 也就建不了压舱仓」
     *      这条自锁链；就算 ≤ 200，只要要求「得先建成压舱仓才攒得到」也一样锁死。
     *    · **下限**：矿工 SB.UNIT.silt = 0.09/人/秒 ⇒ 单人攒到 60 约需 11 分钟，
     *      而 era2 整代原本只跑 8 分钟。嫌长**直接调这个 n**，别顺手改 UNIT/上限系数
     *      ——动那些会连累整局时长账（用户拍板的标定纪律：一次只动一个旋钮）。
     * ⚠️ 本项**不给 eff.unlockTool**：铁质工具的解锁权挂在 TOOLS[].need 上，
     *    由 workshop.blocked() 真读（改 blocked 之前它一直是死字段，见 workshop.js）。
     *    「解锁一件工具」这件事本来就属于工坊而不是科技效果表，写在这里会造出一个
     *    没有任何代码去读的死键 —— 与 craftRatio / capOf 少括号那两处是同一类病。 */
    /* ── 纪元二 · 第二层（2026-09-28 用户规格：由「照明」引出）──
     * 【为什么照明会分叉成两条】照明本身不产出、也不解锁职业，它只是把「看得见」
     *   这件事坐实了 ⇒ 下一步自然要问「看得见之后能去哪」（导航）与「看得见之后
     *   能把谁派出去」（马术）。两条共用同一个前置是本层的形状，不是我硬凑的。 */
    /* 导航：灯塔的解锁项。
     * ⚠️ 尤里卡条件「压舱库 3 级」的可达性（逐项核过，不是拍的）：
     *    · 压舱仓由「照明」解锁（本层第一项），玩家研究完照明即可建；
     *    · 首级 120 珊瑚，ratio 1.15 ⇒ 三级累计约 461 珊瑚；
     *    · 珊瑚唯一来源 = 珊瑚匠（SB.UNIT.coral 0.5/人/秒），开局 1 人转珊瑚匠约 15 分钟。
     *    ⇒ 不会自锁（压舱仓不是本项的前置，只是本项的条件）。
     * ⚠️ 不能写成「建成灯塔 x N」：灯塔正是本项解锁的，条件指向的东西在自己身上
     *    —— 与「匠作 / 匠人 ≥ 2」是同一类自指错误（见匠作那段的注）。 */
    { id: 'navigation', name: '导航',  era: 2, cost: 1000, branch: 'live', key: false, reqs: ['lighting'], layer: 2,
      cond: { t: 'built', b: 'ballast', n: 3 },
      eff: { unlockBuild: ['lighthouse'] },
      note: 'Civ6: Sailing 位 · 光落在远处的礁石上，才知道那边有什么。' },

    /* 马术：马具的解锁项（工坊里那件，效果待补）。
     * ⚠️ 本项**不给 eff.unlockTool**：与「铁器」同理 —— 「解锁一件工具」属于工坊，
     *    挂在 TOOLS[].need 上由 workshop.blocked() 真读。写 unlockTool 会造出一个
     *    全仓无人读取的死键（它目前只在注释里出现过一次，没有任何实现）。
     * ⚠️ 尤里卡条件「牧场 8 级」：深海鱼牧场由纪元一「畜牧」解锁，首级 kelp 100 + coral 10，
     *    ratio 1.15 ⇒ 8 级累计约 1373 藻食 + 137 珊瑚。可达，且牧场不是本项的前置。 */
    { id: 'horsemanship', name: '马术', era: 2, cost: 1200, branch: 'live', key: false, reqs: ['lighting'], layer: 2,
      cond: { t: 'built', b: 'warmnest', n: 8 },
      eff: {},
      note: 'Civ6: Horseback Riding 位 · 有了光才知道什么时候该出门。' },

    { id: 'ironwork',  name: '铁器',   era: 2, cost: 800, branch: 'survive', key: false, reqs: [], layer: 1,
      cond: { t: 'res', r: 'silt', n: 60 },
      eff: { smelt: 0.40, unlockBuild: ['furnace'] },
      note: 'Civ6: Iron Working 位 · 金属第一次不只是存货，是能敲出东西的材料。' },

    /* ⚠️ 「御寒术」（原 id `insulation`，Civ6 Construction 位，解锁保温巢 + 抗寒上限）
     *    已于 2026-09-26 **整项删除** —— 用户规格里从来没有过它，是我重排时自己造的，
     *    而且它和纪元一层四的「保温法」重名、效果（抗寒上限）也完全重复。
     *    删它要连带改两处，漏了就会埋雷：
     *      ① 下面保暖术原来的 reqs 是 insulation —— 留着它这项永远点不亮，
     *         现已改为空 reqs，它自己有 cond「骨材 50」当门槛，跟礁石术/储藻术同级；
     *      ② tech.js 的乘区表与 effectText 名册里的 `warm` 键 —— 保温法那项的抗寒上限
     *         一并撤掉，否则抗寒会变成一串没人读的死键（读的人还会踩到 undefined ⇒ NaN）。
     *    保温巢的解锁已挪到纪元一的畜牧，暖壳石由保暖术解锁。 */

    /* ⚠️ 原「治学」已于纪元一重排时改名「书写」并提到纪元一（它现在是层三，解锁潮纹馆）。
     * ⚠️ 2026-09-28 用户指令：**「通识」这一项已整体删除**（「我没设计过的科技，删掉」，
     *    等都等着重新设计）。它挂着三样东西，一起说明，免得重设时漏：
     *    ① `key: true` —— 它是纪元二的**关键节点之一**，`tech.keysOf` 的分子分母都拿它
     *       当分母；删掉后纪元二少一个关键节点（不会卡住推进，但推进条件里的权重变了）。
     *    ② `eff: { coef: 0.5 }` —— 破壳系数 **+0.5**；这一项没了，破壳系数从此少这 0.5。
     *    ③ 大图书馆的 `need`（见 config.js 奇观表那处注）——已一并清空。
     *    ⇒ 重设时如果还要「知识推动破壳」这条轴，它得换个位置落回来。 */

    /* ⚠️ 2026-09-28 用户指令：**「匠作」这一项已整体删除**（「我没设计过的科技，删掉」，
     *    等都等着重新设计）。⚠️ 它是**整棵树里最贵的一次删除**，因为它同时是三样东西：
     *    ① **匠人职业（`jobs.craft`）的唯一解锁口**：职业解锁只有一条通路——反查各科技的
     *       `eff.unlockJob`（folk.js 的 JOB_TECH 建表）。`eff:{unlockJob:['craft']}` 是
     *       全树里唯一给 craft 的那些 ⇒ 删掉后 `jobs.craft` **恒为 0**（folk 自动派工那步
     *       会把人分到别的职业上）。匠人是地热算式的一项，所以地热也跟着归零。
     *    ② 四项纪元三科技的**唯一前置**：冶炼术 / 烟囱炉 / 机械 / 精铁术原先都写
     *       `reqs:['craftT']` ⇒ 这四项的前置已一并清空成 `reqs: []`（即纪元内立即可研究），
     *       否则它们会变成四个**永远点不动**的科技。重设时把前置填回来即可，字段语义不变。
     *    ③ 纪元二第三层里「生活」那一支的中间节点 ⇒ 现在 `coralcut` 之后那一层是空的。
     *    ⚠️ 这里曾经记着一条**自指尤里卡**的教训（条件写成「匠人 ≥ 2」会让条件要求在它自己
     *       解锁的东西上，于是永假）——那条教训本身没错，但它保护的那一项已经没了，
     *       连同注释一并删除，别照抄。 */

    /* ═══ 纪元二 · 第三层（2026-09-28 用户规格）═══════════════════════
     * 【本层的形状】用户原话：「铁器引出工程学」「导航引出数学」「导航引出构架术」。
     *   所以 reqs 分别挂在 **ironwork / navigation / navigation** 上，不是把三条都
     *   塞给同一项 —— 「谁引出谁」就是这个层级的形状，别为了整齐改成一条链。
     * 【为什么数学与构架术同从「导航」分出】方向定了，接下来自然要问两件不同的事：
     *   「怎么算」（数学，研究所那条线）与「怎么搭」（构架术，绳那条线）。
     * 【三项的尤里卡条件只有两个】工程学与数学用户给了，构架术没给 ⇒ 不写 cond
     *   （default 分支直接露面，与 lighting / ironwork 同口径），不是漏写。 */
    /* ⚠️ id 是 `engineeringT` 而不是 `engineering`：era5 那一项**已经占用了
     *    `engineering`**（工程兵团，cost 805 / coef 1.2）。两项共用同一个 id 时
     *    `s.techs['engineering']` 只有一个键 —— 研究任一项都会把另一项当成已掌握，
     *   而且 byId 只会返回表里靠前的那一条。这类冲突不报错、不 NaN，只是悄悄错。
     *   与 craftT / loreway / siegeT / ironpeak 用的是同一套 `XxxT` 后缀习惯。 */
    /* 【为什么 eff 是空的】解锁物（铁制支架的配方、两道扩容升级项）写在它们自己的
     *   表里（CRAFTS[].need / UPGRADES[].need），由 workshop 的 blocked 真读 ——
     *   与铁质三件工具、马具完全同构。在 eff 里再写一个 `unlockUpgrade` 键会造出
     *   一个全仓无人读取的死键（同 unlockTool 那个教训），而且面板会显示一个
     *   玩家点进去发现没有兑现物的东西。 */
    /* ⚠️ 2026-09-28 用户拍板：**工程学也升为纪元二关键节点**（与照明一起，见上面 lighting
     *    那条注）。两项 key 的位置一头一尾：照明在 layer 1（进门就见），工程学在 layer 3
     *    且吃「热泉炉 3 级」这道尤里卡 ⇒ era2 的推进被钉在「本纪元真的玩过一遍」上，
     *    而不是进门即过。 */
    { id: 'engineeringT', name: '工程学', era: 2, cost: 1500, branch: 'live', key: true,
      reqs: ['ironwork'], layer: 3,
      cond: { t: 'built', b: 'furnace', n: 3 },
      eff: {},
      note: '热泉炉冒到第三级，才有人开始算「这炉子能撑多少料」。解锁铁制支架的配方，'
          + '以及压舱库 / 藻食库两道扩容升级。' },

    /* 【尤里卡「拥有 1000 科技点」的可达性，逐项核过】
     *   · 判的是**当前库存**（`t:'res'`），不是累计产出 —— 用户口径「拥有」，
     *     且这样它与纪元四点火术那条 `rate`（产出速率）门槛形成「攒够 / 跑起来」的区分。
     *   ⚠️ science 在 CAP_BASE 里**故意没有键** ⇒ capOf 恒 Infinity ⇒ 无上限可撞，
     *     不存在「攒 1000 却被仓储卡住」的自锁（与 culture 同口径）。
     *   · 代价：按 SB.UNIT.sci = 0.15/人/秒，1 位学者要 111 分钟才攒够 1000；
     *     3 位学者 + 3 级潮纹馆（×1.3）约 28 分钟；8 位学者约 10 分钟。
     *     ⇒ 可达，但**不是顺手就到**的：它要求玩家在攒满之前先把科技点攒着别花。
     *     这个「卡流程」的代价是**标定权**，数字照规格写死在这里，等用户对账。 */
    { id: 'mathematics', name: '数学',   era: 2, cost: 1800, branch: 'know', key: false,
      reqs: ['navigation'], layer: 3,
      cond: { t: 'res', r: 'science', n: 1000 },
      eff: { unlockBuild: ['institute'] },
      note: 'Civ6: Writing 位 · 有了方向才量得出距离。解锁研究所。' },

    /* 【为什么 eff 只有 craftRatio：+5% 走的是「工艺制作效率」那条轴】
     *   猫国那个数叫 craftRatio（工坊顶部那一行），本作 workshop.craftRatio 的三个来源
     *   是「工坊建筑等级 / 海潮方碑奇观 / 这一项」。⚠️ **别把它当成 T.craft**：
     *   `T.craft`（烟囱炉 +15%、壳铸 +30%）是**精铁加工产出**乘区，作用于热泉炉那条线；
     *   `craftRatio` 是**工艺制作产出**乘区，作用于工坊制造石梁那条线。两个名字都带
     *   「craft」，是本项目最容易误接的一对 —— 接错了不报错，只是研究完工坊没反应。 */
    { id: 'scaffoldT',   name: '构架术', era: 2, cost: 1600, branch: 'live', key: false,
      reqs: ['navigation'], layer: 3,
      eff: { craftRatio: 0.15 },
      note: 'Civ6: Masonry 位 · 解锁成捆东西的绳。同时工坊效率 +15%。' },


    /* ═════════ 纪元三 · 硫泉（5 项 · 300/300/390/390/390） ═════════
     * 材料革命：钢与热液能上线。破壳从「能不能活」变成「要凿多久」。 */
    /* ⚠️ 2026-09-29 整表替换：旧 6 项（冶炼术/烟囱炉/机械/精铁术/深潜/壳骨）删除，
     *   改「钢 + 热液能」新线。key = 学徒制 + 金属精炼（见各自行 key:true）。
     *   旧「热泉炉解锁权」那 3 段注已废（热泉炉的解锁权早归铁器，与纪元三无关）。 */
    { id: 'apprentice', name: '学徒制', era: 3, cost: 3000, branch: 'survive', key: true, reqs: [], layer: 1,
      cond: { t: 'tools', ids: ['tool_ironSickle', 'tool_ironAxe', 'tool_ironPick'] },
      eff: {},
      note: 'Civ6: Apprenticeship · 买齐三件铁制工具（镰/斧/镐）即掌握。解锁鱼骨矿井。' },

    /* 马镫的尤里卡 = 5 名商人（cond 'job'）。与马具(tool_harnes) 是独立乘区：
     *   马具走 toolMul(merchant)、马镫走工坊升级 upg_horseshoe(luxuryMul 0.5)，
     *   economy 商人行两处相乘 ⇒ 合计 +100%。 */
    { id: 'horseshoe',  name: '马镫',   era: 3, cost: 4500, branch: 'live', key: false, reqs: [], layer: 1,
      cond: { t: 'job', j: 'merchant', n: 5 },
      eff: {},
      note: 'Civ6: Horseshoeing · 5 名商人即掌握。解锁马镫（工坊升级，奢侈品 +50%）。' },

    /* 教育前置 = 学徒制 + 数学。尤里卡 = 三级研究所（built institute n=3）。
     * 大学(工坊升级 upg_university) 与 阿尔巴达(奇观 wonder_albada) 的解锁权各自写在其表。 */
    { id: 'education',  name: '教育',   era: 3, cost: 8000, branch: 'know', key: false, reqs: ['apprentice', 'mathematics'], layer: 3,
      cond: { t: 'built', b: 'institute', n: 3 },
      eff: {},
      note: 'Civ6: Education · 三级研究所即掌握。解锁大学（工坊升级）与阿尔巴达热液大学（奇观）。' },

    /* 金属精炼前置 = 学徒制。尤里卡 = 完成鱼骨矿井（装 upg_fishbonemine，cond 'upgrade'）。
     * 尤里卡查鱼骨矿井、unlockBuild 查汽轮机/工坊——两件不同节点，不互锁。 */
    { id: 'metalrefine', name: '金属精炼', era: 3, cost: 6500, branch: 'survive', key: true, reqs: ['apprentice'], layer: 2,
      cond: { t: 'upgrade', id: 'upg_fishbonemine' },
      eff: { unlockBuild: ['hydroturbine', 'hydroshop'] },
      note: 'Civ6: Metalurgy · 完成鱼骨矿井即掌握。解锁热液汽轮机 / 热液工坊 / 自动工坊 / 钢制零件。' },

    /* 城堡前置 = 工程学（engineeringT，纪元二第三层）。尤里卡 = 启用三槽政体
     * （autocracy/oligarchy/classical_republic，新 cond 'gov'，排除酋邦制 tribe 1 槽）。
     * 城堡(工坊升级 upg_castle) 解锁权写在工坊表。 */
    { id: 'castle',     name: '城堡',   era: 3, cost: 10000, branch: 'live', key: false, reqs: ['engineeringT'], layer: 3,
      cond: { t: 'gov', wild: 3 },
      eff: {},
      note: 'Civ6: Castles · 启用任一三槽政体即掌握。解锁工坊升级「城堡」——议事厅升级为城堡：议价减耗 +50%、每级 +50 容量。' },

    /* ═════════ 纪元四 · 天壳工程（6 项 · 2万~7.5万） ═════════
     * ⚠️ 2026-09-30 用户重设计：旧五项（点火术/涡轮/测壳/洋流/壳铸）**整体删除**，换成下面六项。
     *    key = 天壳观测 + 倒置搭建（首尾各一）—— 纪元推进 = 清 key → 推进，缺一不可。
     * ⚠️ 旧项被别处引用的残留：era5 的 ballistics / engineering 两条 reqs 是 `['turbine']`，
     *    用户拍板「纪元五科技全部重置」 ⇒ 这两条 reqs 悬空（不可达，**不报错**），
     *    与「破冰死锁待重设」同状态处理 —— 不在这里顺手改写，等纪元五整体重做时一起处理。
     * ⚠️【绝对层级是 3/4/5，不是用户表里写的 1/2/3 —— 这不是我改的设计】layer 在 techs.js 里是
     *    **全局列号**（era1 = L1~4、era2 = L1~3、era3 = L1~3、旧 era4 = L2~5），不是「纪元内第几层」。
     *    e2e 那条「没有科技的前置比它自己更深一层」拦的是 **`reqs 那一项的 layer ≤ 自己的 layer`**：
     *    天壳观测的前置是「教育」(era3 L3)、印刷术的前置是「金属精炼」(era3 L2)
     *    ⇒ 本纪元最浅的一项只能是 L3，否则那条断言当场红。用户表里的三行形状原样保留：
     *    天壳观测 + 印刷术同行(L3)、物理/银行业/热力学同行(L4)、倒置搭建独自一行(L5)。 */
    { id: 'shellwatch', name: '天壳观测', era: 4, cost: 20000, branch: 'know', key: true,
      reqs: ['education'], layer: 3,
      cond: { t: 'zoneLvl', zone: 'academy', n: 35 },
      eff: { unlockBuild: ['observatory'] },
      note: 'Civ6: Astronomy · 关键节点。学术区铺到 35 级，天壳才第一次能被天天盯着看。' },

    { id: 'printing', name: '印刷术', era: 4, cost: 25000, branch: 'know', key: false,
      reqs: ['metalrefine'], layer: 3,
      cond: { t: 'built', b: 'hydroshop', n: 3 },
      eff: { unlockBuild: ['coralfarm'] },
      note: 'Civ6: Printing · 热液工坊三级开版。字能印了，珊瑚也能催了。' },

    { id: 'physics', name: '物理', era: 4, cost: 40000, branch: 'know', key: false,
      reqs: ['shellwatch'], layer: 4,
      /* 「完成所有钢铁工具的升级」= 钢镰/钢斧/钢镐三件都买断。与学徒制同一 cond 类型。 */
      cond: { t: 'tools', ids: ['tool_steelSickle', 'tool_steelAxe', 'tool_steelPick'] },
      eff: {},
      note: 'Civ6: Scientific Theory · 钢器趁手了，才谈得上把力气算成数。' },

    { id: 'banking', name: '银行业', era: 4, cost: 40000, branch: 'live', key: false,
      reqs: ['printing'], layer: 4,
      cond: { t: 'zoneLvl', zone: 'trade', n: 35 },
      eff: { unlockBuild: ['bank'] },
      /* ⚠️ 2026-10-06 用户口径「贸易区合计 70 改成 35」—— 但**代码里原本是 100**
       *   （2026-09-30 ERA4 实装时按用户规格表落的「贸易区百级」，note 也写着「百级」）。
       *   本轮按用户的**目标值 35** 执行，note 一并改掉，否则科技树上写着「35 级」以外的
       *   旧数字会与实际门槛矛盾（文案 ≠ 门槛 = 又一个面板撒谎点）。 */
      note: 'Civ6: Banking · 贸易区 35 级，账本才比货值钱。' },

    { id: 'thermo', name: '热力学', era: 4, cost: 50000, branch: 'survive', key: false,
      reqs: ['metalrefine'], layer: 4,
      /* 用户 2026-09-30 澄清：「热液泵」= **热液汽轮机**(hydroturbine)。 */
      cond: { t: 'built', b: 'hydroturbine', n: 5 },
      eff: {},
      note: 'Civ6: Industrialization · 汽轮机五级，压力才谈得上被拿去利用。' },

    { id: 'invert', name: '倒置搭建', era: 4, cost: 75000, branch: 'survive', key: true,
      reqs: ['physics'], layer: 5,
      cond: { t: 'pop', n: 50 },
      eff: {},
      note: 'Civ6: Urban Design · 关键节点。五十人同族，才有把天壳当工地的一批人。' },

    /* ═════════ 纪元五 · 破壳（6 项 · layer 5/5/5/6/6/7） ═════════
     * 工业化。破冰祭坛（奇迹装置）的解锁仍走 config 的 miracle.requiredTech（见下方别处），
     * 本纪元只负责把「破壳纪」的科技线铺到收尾的 key 节点（天穹钻机）。
     * ⚠️ 6 项分两层半：layer 5 = 三项（工业化 / 普及教育 / 渊海地质学），
     *    layer 6 = 两项（高压热机 / 天壳地质学），layer 7 = 关键节点天穹钻机。
     *    推导（e2e 的「前置 layer ≤ 自身 layer」拦着，不能更低）：
     *      era4 最深 invert=L5 ⇒ 本纪元任何项 ≥ L5；
     *      工业化/普及教育/渊海地质学前最深 L4(physics/thermo) ⇒ 自身 L5；
     *      高压热机/天壳地质学前 L5(invert) ⇒ 自身 L6；
     *      天穹钻机前 L5+L6 ⇒ 自身 L7。 */
    /* ⚠️ cost 为**暂定值**（用户表未给成本），量级对齐 era4（shellwatch 2万 → invert 7.5万），
     *    顺延到 8万~15万。最终数值等用户标定轮拍板，不在本轮定死。 */
    { id: 'industrialize', name: '工业化', era: 5, cost: 80000, branch: 'survive', key: false,
      reqs: ['thermo'], layer: 5,
      /* ⚠️ 2026-10-07 修：原来写 `r:'hydro'`，而 rates().hydro 是**净消耗（取负）** ⇒
       *    这个条件恒不成立（负数永远 ≥ 不了 10），工业化**永不揭示**、热锻工厂永不可达，
       *    且表面只表现为「尤里卡那行显示的是被吃掉的那一截」。
       *    「产出达到 10/s」要的是**总生产** ⇒ 读 rates().hydroSupply（供给侧）。 */
      cond: { t: 'rate', r: 'hydroSupply', n: 10 },
      eff: { unlockBuild: ['hotforge'] },
      note: 'Civ6: Industrialization · 热液能产出达到 10/s。解锁热锻工厂。' },

    { id: 'pubedu', name: '普及教育', era: 5, cost: 90000, branch: 'know', key: false,
      reqs: ['printing', 'physics'], layer: 5,
      cond: { t: 'rate', r: 'science', n: 100 },
      eff: { unlockBuild: ['school'] },
      note: 'Civ6: Public Schooling · 科学产出达到 100/s。解锁学校（每级 +0.5 科技/秒）。' },

    { id: 'abyssgeo', name: '渊海地质学', era: 5, cost: 100000, branch: 'know', key: false,
      reqs: ['physics'], layer: 5,
      cond: { t: 'upgrade', id: 'upg_deepmine' },
      eff: { warmMul: 5.0, titaniumMul: 1.0 },
      note: 'Civ6: Seafaring · 完成深层矿井升级。暖石 +500% / 钛 +100%。' },

    { id: 'highthermo', name: '高压热机', era: 5, cost: 110000, branch: 'survive', key: false,
      reqs: ['industrialize'], layer: 6,
      cond: { t: 'upgrade', id: 'upg_hppump' },
      eff: {},
      note: 'Civ6: High Pressure Engines · 完成高压气泵升级。' },

    { id: 'shellgeo', name: '天壳地质学', era: 5, cost: 120000, branch: 'know', key: false,
      reqs: ['invert'], layer: 6,
      cond: { t: 'shell', n: 0.5 },
      eff: {},
      note: 'Civ6: Geology · 破壳达到 50%（壳剩余 ≤ 50%）。' },

    { id: 'skydrill', name: '天穹钻机', era: 5, cost: 150000, branch: 'know', key: true,
      reqs: ['abyssgeo', 'shellgeo'], layer: 7,
      cond: { t: 'wonders', ids: ['wonder_shellcutter', 'wonder_presspipe'] },
      eff: {},
      note: 'Civ6: Skyscraper · 关键节点。建成天壳切削器 + 高压热机管道两座奇观。破壳纪收尾。' }
  ];

  var BRANCHES = [
    { id: 'survive', name: '生存', color: '#D85A30', desc: '采集 · 抗寒 · 住房 · 破壳' },
    { id: 'live',    name: '生计', color: '#5DCAA5', desc: '产出 · 加工 · 仓储' },
    { id: 'know',    name: '求知', color: '#7F77DD', desc: '科技 · 效率 · 解锁' }
  ];

  /* 老档（2026-09-25 单位统一之前那 8 项平铺科技）到新树的映射。
   * 做法：能一一对应的直接改名，不能对应的折算成等价效果对应的那一项
   * ——否则老玩家研究过的科技会凭空消失、破壳系数凭空掉一截。 */
  var LEGACY_MAP = {
    calendar: 'calendar',
    /* ⚠️ 原 `ignition: 'ignition'` 已随 2026-09-30 纪元四整体重设计删除：新纪元四没有等价项
     *    （旧点火术给的是燃料/地热线上的功能，整条地热线还在待重设），⇒ 老档里的 ignition
     *    一律丢弃（与 bonework / hearthfire 同口径），不折算成新树的任何一项。 */
    /* ⚠️ 原表里的 `bonework: 'bonework'` 已随骨工法科技一并删除（2026-09-27）：
     *    老档里若有人研究过它，那项知识在新树里无处落 —— 按丢弃处理，不断链。
     * ⚠️ `heat: 'hearthfire'` 亦已删除（2026-09-28，同纪元二重排）：老档里的 heat 一律
     *    视为没研究过（等价物不存在 ⇒ 折算会凭空造出一个新科技）。 */
    dive: 'deepsea', siegeT: 'skydrill', pick: 'skydrill'  // 旧纪元五 siegeT/工程兵团 已随本轮重做删除，迁到新 key 天穹钻机
  };

  NS.ERAS = ERAS;
  NS.TECHS = TECHS;
  NS.BRANCHES = BRANCHES;
  NS.LEGACY_MAP = LEGACY_MAP;

  /* 配置层的既有引用（habitat / render / 两个 sim）都读 SB.TECHS，
   * 这里补上别名，保证加载顺序上 techs.js 晚于 config.js 也不会断。 */
  SB.ERAS = ERAS;
  SB.TECHS = TECHS;
  SB.BRANCHES = BRANCHES;
  SB.LEGACY_MAP = LEGACY_MAP;

  NS.data = { TECHS: TECHS, ERAS: ERAS, BRANCHES: BRANCHES, LEGACY_MAP: LEGACY_MAP };
})(typeof window !== 'undefined' ? window : globalThis);
