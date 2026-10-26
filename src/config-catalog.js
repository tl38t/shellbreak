/* 天壳 / SHELLBREAK — 配置目录表
 * 轮回商品、职业与工坊工具的静态定义；由 config.js 先建立 CFG 后加载。
 */
(function (root) {
  'use strict';
  var NS = (root.SB = root.SB || {});

  /* 轮回增益（跨周目）。cost 单位 = 轮回点。
   * 三类：起始资源 / 产出效率 / 系数减免（门槛减免最贵——它砍掉一局的重复劳动）。
   * 价格按 2026-09-24 重标定后的量级排：首局（54 人）约 6.5 点，只够买 1–2 项便宜的；
   * 一条 nest 链要跑 3–5 周目才吃满。相对关系照旧：起始 < 效率 < 门槛。 */
  /* 轮回商店商品（方案文档 §轮回点 全量目录）。
   * 字段：id / name / desc / kind（分组显示用）/ n（最大等级，默认 1）/ apply（写入 s.perk 的累加键）
   *      / cost（单级价）/ costs（分级独立价数组，价目表 3/6/12 即各单级价、不累计）/ nest（前置 perk id）。
   * ⚠️ 数值为接入真实结算前的首轮报价，待实跑校准；标定只改 cost/costs/apply，结构不动。
   * ⚠️ apply 键必须与 state.emptyPerks 的键一致（economy 按这些键读数）。 */
  var TIDE_TREE = [
    /* 潮汐之树（2026-10-23 实装）：用 轮回点 购买的跨周目分层树，整树替换旧 PERKS。
     * 字段：id / name / desc / subtree（8 子树：remnant 先人孑遗 / shelter 安得广厦 /
     *   forge 铁血工造 / mineral 金石为开 / food 唯食与犁 / steel 百炼成钢 /
     *   politics 政经往来 / vision 远见之人）/ layer（1~5 层）/ cost（首级价）/
     *   costs（分级独立价数组，价目表即各单级价、不累计，等差外推）/ scale（无上限尾节点
     *   几何涨价：末级价 × scale^(k-1) 向下取整）/ n（最大等级，默认 1，Infinity=无上限）/
     *   apply（写入 s.perk 的累加键，纯加法系数）/ mode:'max'（聚合取最高档而非累加，
     *   用于 人口上限 互斥档位）/ give（每局开局资源 grants，键=资源键）/ recipe（配方 id，
     *   折进 s.perk.recipeCraft，rmul=每级加成）/ dyn:'loop5'（效果=5%×轮回次数×等级，
     *   每轮回 freshRun 重算、无上限）/ nest 或 nests（前置节点 id，可多项）/ layer（显示层级）。
     * ⚠️ 成本为首轮报价，待实跑校准；标定只改 cost/costs/scale，结构不动。
     * ⚠️ apply 键必须与 state.emptyPerks 的键一致（economy 按这些键读数）。 */
    /* ── 先人孑遗 ── */
    { id: 'startKelp', name: '先祖藻仓', subtree: 'remnant', layer: 1, cost: 1, give: { kelp: 200 }, desc: '每局开局 +200 藻食' },
    { id: 'autoClick', name: '潮讯自拾', subtree: 'remnant', layer: 1, n: 3, costs: [1, 3, 5], apply: { autoClick: 1 }, desc: '自动点击藻食+珊瑚（1/2/3 次·秒，仅取最高档）' },
    { id: 'startCoral', name: '先祖珊瑚', subtree: 'remnant', layer: 2, cost: 1, give: { coral: 200 }, nest: 'startKelp', desc: '每局开局 +200 珊瑚' },
    { id: 'startStone', name: '先祖石料', subtree: 'remnant', layer: 2, cost: 1, give: { stone: 200 }, nest: 'startKelp', desc: '每局开局 +200 石料' },
    { id: 'startMetal', name: '先祖金属', subtree: 'remnant', layer: 2, cost: 1, give: { silt: 200 }, nest: 'startKelp', desc: '每局开局 +200 金属' },
    { id: 'startScience', name: '先祖科技', subtree: 'remnant', layer: 3, cost: 2, give: { science: 200 }, desc: '每局开局 +200 科技' },
    { id: 'startCivic', name: '先祖市政', subtree: 'remnant', layer: 3, cost: 2, give: { culture: 200 }, nests: ['startStone', 'startMetal'], desc: '每局开局 +200 市政' },
    { id: 'autoEvent', name: '潮讯自拾II', subtree: 'remnant', layer: 4, cost: 30, apply: { autoEvent: 1 }, nests: ['autoClick', 'startScience', 'startCivic'], desc: '天壳震动等点击事件出现即自动拾取' },
    /* ── 安得广厦 ── */
    { id: 'startPop1', name: '繁衍生息 I', subtree: 'shelter', layer: 1, cost: 2, apply: { startPop: 1 }, mode: 'max', desc: '开局人口上限 +1（与同系高阶互斥，仅取最高 +3）' },
    { id: 'matStore1', name: '总仓奠基', subtree: 'shelter', layer: 1, cost: 4, apply: { matStore: 2 }, desc: '所有普通资源容量 +10%' },
    { id: 'startPop2', name: '繁衍生息 II', subtree: 'shelter', layer: 2, cost: 4, apply: { startPop: 2 }, mode: 'max', nest: 'startPop1', desc: '开局人口上限 +2（与同系互斥，仅取最高）' },
    { id: 'wonderBlueprint1', name: '遗址图样 I', subtree: 'shelter', layer: 2, cost: 5, apply: { wonderBlueprint: 2 }, nest: 'matStore1', desc: '奇观建造成本 −10%' },
    { id: 'matStore2', name: '总仓扩建 I', subtree: 'shelter', layer: 2, cost: 8, apply: { matStore: 2 }, nest: 'matStore1', desc: '资源容量再 +10%' },
    { id: 'startPop3', name: '繁衍生息 III', subtree: 'shelter', layer: 3, cost: 6, apply: { startPop: 3 }, mode: 'max', nest: 'startPop2', desc: '开局人口上限 +3（与同系互斥，仅取最高）' },
    { id: 'wonderBlueprint2', name: '遗址图样 II', subtree: 'shelter', layer: 3, cost: 15, apply: { wonderBlueprint: 2 }, nest: 'wonderBlueprint1', desc: '奇观建造成本再 −10%（共 −20%）' },
    { id: 'matStore3', name: '总仓扩建 II', subtree: 'shelter', layer: 3, cost: 12, apply: { matStore: 2 }, nest: 'matStore2', desc: '资源容量再 +10%' },
    { id: 'housePlan', name: '生息规划', subtree: 'shelter', layer: 4, cost: 20, apply: { housePlan: 1 }, nest: 'startPop3', desc: '巢/石屋/廉租 每级各 +1 人口上限' },
    { id: 'matStoreTail', name: '仓储通汇', subtree: 'shelter', layer: 4, cost: 16, scale: 1.5, n: Infinity, apply: { matStore: 1 }, nest: 'matStore3', desc: '资源容量再 +5%/级（无上限，每级 ×1.5 向下取整）' },
    /* ── 铁血工造 ── */
    { id: 'craftQuota1', name: '工坊定额 I', subtree: 'forge', layer: 1, cost: 2, apply: { craftQuota: 1 }, desc: '工坊制作产出 +10%' },
    { id: 'craftQuota2', name: '工坊定额 II', subtree: 'forge', layer: 2, cost: 4, apply: { craftQuota: 1 }, nest: 'craftQuota1', desc: '工坊制作产出再 +10%' },
    { id: 'autoCraft1', name: '自动工坊 I', subtree: 'forge', layer: 2, cost: 10, apply: { autoCraft: 1 }, nest: 'craftQuota1', desc: '额外 +1 自动制作槽' },
    { id: 'craftQuota3', name: '工坊定额 III', subtree: 'forge', layer: 3, cost: 8, apply: { craftQuota: 1 }, nest: 'craftQuota2', desc: '工坊制作产出再 +10%' },
    { id: 'autoCraft2', name: '自动工坊 II', subtree: 'forge', layer: 3, cost: 15, apply: { autoCraft: 1 }, nest: 'autoCraft1', desc: '额外 +1 自动制作槽（累计 +2）' },
    { id: 'craftQuotaTail', name: '工坊通汇', subtree: 'forge', layer: 4, cost: 10, scale: 1.5, n: Infinity, apply: { craftQuota: 0.5 }, nest: 'craftQuota3', desc: '工坊制作产出再 +5%/级（无上限，每级 ×1.5）' },
    { id: 'craftLoop', name: '轮回工巧', subtree: 'forge', layer: 4, cost: 15, dyn: 'loop5', apply: { craftLoop: 1 }, nest: 'craftQuota3', desc: '工坊制作产出 +5%×轮回次数（每轮回重算，无上限）' },
    { id: 'autoCraft3', name: '自动工坊 III', subtree: 'forge', layer: 4, cost: 20, apply: { autoCraft: 1 }, nest: 'autoCraft2', desc: '额外 +1 自动制作槽（累计 +3）' },
    /* ── 金石为开 ── */
    { id: 'minerPact1', name: '矿工契约 I', subtree: 'mineral', layer: 1, cost: 2, apply: { minerPact: 1 }, desc: '矿工系（泥沙+暖石）产出 +10%' },
    { id: 'quarryPact1', name: '采石契约 I', subtree: 'mineral', layer: 1, cost: 2, apply: { quarryPact: 1 }, desc: '采石工系（石料）产出 +10%' },
    { id: 'minerPact2', name: '矿工契约 II', subtree: 'mineral', layer: 2, cost: 5, apply: { minerPact: 1 }, nest: 'minerPact1', desc: '矿工系产出再 +10%' },
    { id: 'furnaceEff1', name: '炉心调谐 I', subtree: 'mineral', layer: 2, cost: 5, apply: { furnaceEff: 1 }, nest: 'minerPact1', desc: '热泉炉（精铁）效率 +20%' },
    { id: 'quarryPact2', name: '采石契约 II', subtree: 'mineral', layer: 2, cost: 5, apply: { quarryPact: 1 }, nest: 'quarryPact1', desc: '采石工系产出再 +10%' },
    { id: 'minerPact3', name: '矿工契约 III', subtree: 'mineral', layer: 3, cost: 8, apply: { minerPact: 1 }, nest: 'minerPact2', desc: '矿工系产出再 +10%' },
    { id: 'hydroshopEff1', name: '热液调谐 I', subtree: 'mineral', layer: 3, cost: 10, apply: { hydroshopEff: 1 }, nest: 'minerPact2', desc: '热液工坊（钢）效率 +20%' },
    { id: 'quarryPact3', name: '采石契约 III', subtree: 'mineral', layer: 3, cost: 8, apply: { quarryPact: 1 }, nest: 'quarryPact2', desc: '采石工系产出再 +10%' },
    { id: 'stoneBeam', name: '石梁巧工', subtree: 'mineral', layer: 3, cost: 8, recipe: 'craft_stonebeam', rmul: 0.30, nest: 'quarryPact2', desc: '石梁工艺效率 +30%' },
    { id: 'minerPactTail', name: '矿工通汇', subtree: 'mineral', layer: 4, cost: 10, scale: 1.5, n: Infinity, apply: { minerPact: 0.5 }, nest: 'minerPact3', desc: '矿工系产出再 +5%/级（无上限，每级 ×1.5）' },
    { id: 'furnaceHydroLoop', name: '轮回炉火', subtree: 'mineral', layer: 4, cost: 15, dyn: 'loop5', apply: { furnaceLoop: 1, hydroLoop: 1 }, nest: 'minerPact3', desc: '热泉炉/热液工坊效率 +5%×轮回次数（每轮回重算）' },
    { id: 'quarryPactTail', name: '采石通汇', subtree: 'mineral', layer: 4, cost: 10, scale: 1.5, n: Infinity, apply: { quarryPact: 0.5 }, nest: 'quarryPact3', desc: '采石工系产出再 +5%/级（无上限，每级 ×1.5）' },
    /* ── 唯食与犁 ── */
    { id: 'algaeCrop1', name: '潮田 I', subtree: 'food', layer: 1, cost: 2, apply: { algaeCrop: 1 }, desc: '采集者藻食产出 +10%' },
    { id: 'coralPact1', name: '珊瑚契 I', subtree: 'food', layer: 1, cost: 2, apply: { coralPact: 1 }, desc: '珊瑚匠系产出 +10%' },
    { id: 'algaeCrop2', name: '潮田 II', subtree: 'food', layer: 2, cost: 5, apply: { algaeCrop: 1 }, nest: 'algaeCrop1', desc: '采集者藻食产出再 +10%' },
    { id: 'workSpeed1', name: '勤耕 I', subtree: 'food', layer: 2, cost: 1, apply: { workSpeed: 0.10 }, nest: 'algaeCrop1', desc: '族民生产时间 −10%' },
    { id: 'coralPact2', name: '珊瑚契 II', subtree: 'food', layer: 2, cost: 5, apply: { coralPact: 1 }, nest: 'coralPact1', desc: '珊瑚匠系产出再 +10%' },
    { id: 'hardcoral', name: '硬珊巧工', subtree: 'food', layer: 2, cost: 8, recipe: 'craft_hardcoral', rmul: 0.30, nest: 'coralPact1', desc: '硬化珊瑚工艺效率 +30%' },
    { id: 'algaeCrop3', name: '潮田 III', subtree: 'food', layer: 3, cost: 8, apply: { algaeCrop: 1 }, nest: 'algaeCrop2', desc: '采集者藻食产出再 +10%' },
    { id: 'workSpeed2', name: '勤耕 II', subtree: 'food', layer: 3, cost: 2, apply: { workSpeed: 0.20 }, nest: 'workSpeed1', desc: '族民生产时间再 −20%（共 −30%）' },
    { id: 'coralPact3', name: '珊瑚契 III', subtree: 'food', layer: 3, cost: 8, apply: { coralPact: 1 }, nest: 'coralPact2', desc: '珊瑚匠系产出再 +10%' },
    { id: 'scaffold', name: '脚手架巧工', subtree: 'food', layer: 3, cost: 25, recipe: 'craft_scaffold', rmul: 0.30, nest: 'coralPact2', desc: '脚手架工艺效率 +30%' },
    { id: 'algaeCropTail', name: '潮田通汇', subtree: 'food', layer: 4, cost: 10, scale: 1.5, n: Infinity, apply: { algaeCrop: 0.5 }, nest: 'algaeCrop3', desc: '采集者藻食产出再 +5%/级（无上限，每级 ×1.5）' },
    { id: 'coldPenalty', name: '御寒之智', subtree: 'food', layer: 4, cost: 10, apply: { coldPenalty: 1 }, nest: 'algaeCrop3', desc: '寒潮季减产效果 −50%' },
    { id: 'coralPactTail', name: '珊瑚通汇', subtree: 'food', layer: 4, cost: 10, scale: 1.5, n: Infinity, apply: { coralPact: 0.5 }, nest: 'coralPact3', desc: '珊瑚匠系产出再 +5%/级（无上限，每级 ×1.5）' },
    /* ── 百炼成钢 ── */
    { id: 'furnaceBoost1', name: '炉压 I', subtree: 'steel', layer: 1, cost: 6, apply: { furnaceBoost: 1 }, desc: '热泉炉（精铁）产出 +10%' },
    { id: 'hydroshopBoost1', name: '热坊 I', subtree: 'steel', layer: 1, cost: 10, apply: { hydroshopBoost: 1 }, desc: '热液工坊（钢）产出 +10%' },
    { id: 'furnaceBoost2', name: '炉压 II', subtree: 'steel', layer: 2, cost: 12, apply: { furnaceBoost: 1 }, nest: 'furnaceBoost1', desc: '热泉炉产出再 +10%' },
    { id: 'ironbracket', name: '铁支架巧工', subtree: 'steel', layer: 2, cost: 15, recipe: 'craft_ironbracket', rmul: 0.30, nest: 'furnaceBoost1', desc: '铁制支架工艺效率 +30%' },
    { id: 'hydroshopBoost2', name: '热坊 II', subtree: 'steel', layer: 2, cost: 15, apply: { hydroshopBoost: 1 }, nest: 'hydroshopBoost1', desc: '热液工坊产出再 +10%' },
    { id: 'furnaceBoost3', name: '炉压 III', subtree: 'steel', layer: 3, cost: 18, apply: { furnaceBoost: 1 }, nest: 'furnaceBoost2', desc: '热泉炉产出再 +10%' },
    { id: 'steelpart', name: '钢零件巧工', subtree: 'steel', layer: 3, cost: 25, recipe: 'craft_steelpart', rmul: 0.30, nest: 'hydroshopBoost2', desc: '钢制零件工艺效率 +30%' },
    { id: 'hydroshopBoost3', name: '热坊 III', subtree: 'steel', layer: 3, cost: 20, apply: { hydroshopBoost: 1 }, nest: 'hydroshopBoost2', desc: '热液工坊产出再 +10%' },
    { id: 'furnaceBoostTail', name: '炉压通汇', subtree: 'steel', layer: 4, cost: 20, scale: 1.5, n: Infinity, apply: { furnaceBoost: 0.5 }, nest: 'furnaceBoost3', desc: '热泉炉产出再 +5%/级（无上限，每级 ×1.5）' },
    { id: 'slotCraft', name: '工造之位', subtree: 'steel', layer: 4, cost: 50, apply: { slotCraft: 1 }, nests: ['furnaceBoost3', 'hydroshopBoost3'], desc: '任意政体额外 +1 工造槽' },
    { id: 'hydroshopBoostTail', name: '热坊通汇', subtree: 'steel', layer: 4, cost: 25, scale: 1.5, n: Infinity, apply: { hydroshopBoost: 0.5 }, nest: 'hydroshopBoost3', desc: '热液工坊产出再 +5%/级（无上限，每级 ×1.5）' },
    /* ── 政经往来 ── */
    { id: 'luxuryPact1', name: '商契 I', subtree: 'politics', layer: 1, cost: 2, apply: { luxuryPact: 1 }, desc: '商人系产出 +10%' },
    { id: 'scribePact1', name: '书契 I', subtree: 'politics', layer: 1, cost: 3, apply: { scribePact: 1 }, desc: '书手系产出 +10%' },
    { id: 'luxuryPact2', name: '商契 II', subtree: 'politics', layer: 2, cost: 5, apply: { luxuryPact: 1 }, nest: 'luxuryPact1', desc: '商人系产出再 +10%' },
    { id: 'luxDrain1', name: '节流 I', subtree: 'politics', layer: 2, cost: 5, apply: { luxDrain: 1 }, nest: 'luxuryPact1', desc: '族民奢侈品消耗 −5%' },
    { id: 'scribePact2', name: '书契 II', subtree: 'politics', layer: 2, cost: 6, apply: { scribePact: 1 }, nest: 'scribePact1', desc: '书手系产出再 +10%' },
    { id: 'artwork1', name: '艺巧 I', subtree: 'politics', layer: 2, cost: 5, recipe: 'craft_artwork', rmul: 0.10, nest: 'scribePact1', desc: '艺术品工艺效率 +10%' },
    { id: 'luxuryPact3', name: '商契 III', subtree: 'politics', layer: 3, cost: 8, apply: { luxuryPact: 1 }, nest: 'luxuryPact2', desc: '商人系产出再 +10%' },
    { id: 'luxDrain2', name: '节流 II', subtree: 'politics', layer: 3, cost: 10, apply: { luxDrain: 1 }, nest: 'luxuryPact2', desc: '族民奢侈品消耗再 −5%（共 −10%）' },
    { id: 'scribePact3', name: '书契 III', subtree: 'politics', layer: 3, cost: 9, apply: { scribePact: 1 }, nest: 'scribePact2', desc: '书手系产出再 +10%' },
    { id: 'artwork2', name: '艺巧 II', subtree: 'politics', layer: 3, cost: 10, recipe: 'craft_artwork', rmul: 0.10, nest: 'artwork1', desc: '艺术品工艺效率再 +10%（共 +20%）' },
    { id: 'luxuryPactTail', name: '商通汇', subtree: 'politics', layer: 4, cost: 10, scale: 1.5, n: Infinity, apply: { luxuryPact: 0.5 }, nest: 'luxuryPact3', desc: '商人系产出再 +5%/级（无上限，每级 ×1.5）' },
    { id: 'happiness', name: '安乐之治', subtree: 'politics', layer: 4, cost: 20, apply: { happiness: 1 }, nests: ['luxuryPact3', 'scribePact3'], desc: '幸福度 +1' },
    { id: 'scribePactTail', name: '书通汇', subtree: 'politics', layer: 4, cost: 12, scale: 1.5, n: Infinity, apply: { scribePact: 0.5 }, nest: 'scribePact3', desc: '书手系产出再 +5%/级（无上限，每级 ×1.5）' },
    { id: 'autoCivic', name: '市政自转', subtree: 'politics', layer: 4, cost: 20, apply: { autoCivic: 1 }, nest: 'scribePact3', desc: '解锁市政自动研究器（默认关闭）' },
    { id: 'slotEcon', name: '经济之位', subtree: 'politics', layer: 5, cost: 50, apply: { slotEcon: 1 }, nest: 'happiness', desc: '任意政体额外 +1 经济槽' },
    /* ── 远见之人 ── */
    { id: 'scholarPact1', name: '学契 I', subtree: 'vision', layer: 1, cost: 3, apply: { scholarPact: 1 }, desc: '学者系产出 +10%' },
    { id: 'shellSurvey1', name: '钻机测绘 I', subtree: 'vision', layer: 1, cost: 6, apply: { shellSurvey: 4 }, desc: '天穹钻机效率 +20%' },
    { id: 'scholarPact2', name: '学契 II', subtree: 'vision', layer: 2, cost: 6, apply: { scholarPact: 1 }, nest: 'scholarPact1', desc: '学者系产出再 +10%' },
    { id: 'tidalRecord1', name: '潮纹巧工 I', subtree: 'vision', layer: 2, cost: 5, recipe: 'craft_tidal_record', rmul: 0.10, nest: 'scholarPact1', desc: '潮纹石板工艺效率 +10%' },
    { id: 'shellSurvey2', name: '钻机测绘 II', subtree: 'vision', layer: 2, cost: 12, apply: { shellSurvey: 4 }, nest: 'shellSurvey1', desc: '天穹钻机效率再 +20%' },
    { id: 'scholarPact3', name: '学契 III', subtree: 'vision', layer: 3, cost: 9, apply: { scholarPact: 1 }, nest: 'scholarPact2', desc: '学者系产出再 +10%' },
    { id: 'tidalRecord2', name: '潮纹巧工 II', subtree: 'vision', layer: 3, cost: 10, recipe: 'craft_tidal_record', rmul: 0.10, nest: 'scholarPact2', desc: '潮纹石板工艺效率再 +10%（共 +20%）' },
    { id: 'shellSurvey3', name: '钻机测绘 III', subtree: 'vision', layer: 3, cost: 18, apply: { shellSurvey: 4 }, nest: 'shellSurvey2', desc: '天穹钻机效率再 +20%' },
    { id: 'thinShell', name: '薄壳之智', subtree: 'vision', layer: 3, cost: 15, apply: { thin: 2 }, nest: 'shellSurvey2', desc: '天壳厚度 −20%' },
    { id: 'scholarPactTail', name: '学通汇', subtree: 'vision', layer: 4, cost: 12, scale: 1.5, n: Infinity, apply: { scholarPact: 0.5 }, nest: 'scholarPact3', desc: '学者系产出再 +5%/级（无上限，每级 ×1.5）' },
    { id: 'autoStudy', name: '科技自转', subtree: 'vision', layer: 4, cost: 20, apply: { autoStudy: 1 }, nest: 'scholarPact3', desc: '解锁科技自动研究器（默认关闭）' },
    { id: 'vibrodrill', name: '钻头巧工', subtree: 'vision', layer: 4, cost: 20, recipe: 'craft_drill', rmul: 0.30, nest: 'shellSurvey3', desc: '震动钻头工艺效率 +30%' },
    { id: 'slotSci', name: '科技之位', subtree: 'vision', layer: 5, cost: 50, apply: { slotSci: 1 }, nest: 'autoStudy', desc: '任意政体额外 +1 科技槽' }
  ];

  /* 星屑商店：星之至宝节点等级写入 meta.starPerks；apply 与 recipe 分别提供数值和工艺效果。 */
  var STAR_PERKS = [
    { id: 'starFolk1', name: '繁星劳作 I', desc: '族民岗位产出 +10%', kind: 'folk', layer: 1, n: 1, cost: 1, apply: { starFolk: 0.10 } },
    { id: 'starFolk2', name: '繁星劳作 II', desc: '族民岗位产出额外 +10%（累计 +20%）', kind: 'folk', layer: 2, nest: 'starFolk1', n: 1, cost: 2, apply: { starFolk: 0.10 } },
    { id: 'starFolk3', name: '繁星劳作 III', desc: '族民岗位产出再额外 +10%（累计 +30%）', kind: 'folk', layer: 3, nest: 'starFolk2', n: 1, cost: 4, apply: { starFolk: 0.10 } },
    { id: 'starInfinite', name: '轮回共鸣', desc: '轮回商店无限等级商品的每级效果 +100%；可重复强化', kind: 'infinite', layer: 4, nest: 'starFolk3', n: Infinity, cost: 8, apply: { starInfinite: 1 } },
    { id: 'starModuleHousing', name: '模块住房', desc: '每级廉租社区额外提供 +1 人口上限', kind: 'housing', layer: 3, nest: 'starFolk2', n: 1, cost: 5, apply: { starModuleHousing: 1 } },
    { id: 'starFoldableStructure', name: '可折叠结构', desc: '每级机器人充能站额外维持 +1 机器人，并额外消耗 2 热液能/秒', kind: 'robot', layer: 4, nest: 'starModuleHousing', n: 1, cost: 5, apply: { starFoldableStructure: 1 } },

    { id: 'starCompanyMaturity1', name: '快速扩张 I', desc: '公司升级所需时间 −10%', kind: 'company', layer: 1, n: 1, cost: 1, apply: { starCompanyMaturity: 0.10 } },
    { id: 'starCompanyMaturity2', name: '快速扩张 II', desc: '公司升级时间额外 −10%（累计 −20%）', kind: 'company', layer: 2, nest: 'starCompanyMaturity1', n: 1, cost: 2, apply: { starCompanyMaturity: 0.10 } },
    { id: 'starCompanyMaturity3', name: '快速扩张 III', desc: '公司升级时间再额外 −10%（累计 −30%）', kind: 'company', layer: 3, nest: 'starCompanyMaturity2', n: 1, cost: 4, apply: { starCompanyMaturity: 0.10 } },
    { id: 'starCompanyResearchSynergy', name: '产学协同', desc: '每家公司按当前等级使所有科技消耗 −1%、−1.5%、−2%、−2.5% 或 −3%；各公司加算', kind: 'company', layer: 4, nest: 'starCompanyMaturity3', n: 1, cost: 8, apply: { starCompanyResearchSynergy: 1 } },
    { id: 'starSmelt1', name: '星炉淬炼 I', desc: '精铁、钢与生物材料研究所产出的 θ金属 +10%', kind: 'industry', layer: 1, n: 1, cost: 2, apply: { starSmelt: 0.10 } },
    { id: 'starSmelt2', name: '星炉淬炼 II', desc: 'θ金属产出额外 +10%（累计 +20%）', kind: 'industry', layer: 2, nest: 'starSmelt1', n: 1, cost: 4, apply: { starSmelt: 0.10 } },
    { id: 'starSmelt3', name: '星炉淬炼 III', desc: 'θ金属产出再额外 +10%（累计 +30%）', kind: 'industry', layer: 3, nest: 'starSmelt2', n: 1, cost: 8, apply: { starSmelt: 0.10 } },
    { id: 'starLaunchSpeed1', name: '快速装配', desc: '所有发射器制造周期 −1 秒', kind: 'industry', layer: 2, nest: 'starSmelt1', n: 1, cost: 10, apply: { starLaunchSpeed: 1 } },
    { id: 'starNuclearHydro1', name: '核电，轻而易举啊 I', desc: '核热厂热液能产出 +10%', kind: 'industry', layer: 1, n: 1, cost: 1, apply: { starNuclearHydro: 0.10 } },
    { id: 'starNuclearHydro2', name: '核电，轻而易举啊 II', desc: '核热厂热液能产出额外 +10%（累计 +20%）', kind: 'industry', layer: 2, nest: 'starNuclearHydro1', n: 1, cost: 2, apply: { starNuclearHydro: 0.10 } },
    { id: 'starNuclearHydro3', name: '核电，轻而易举啊 III', desc: '核热厂热液能产出再额外 +10%（累计 +30%）', kind: 'industry', layer: 3, nest: 'starNuclearHydro2', n: 1, cost: 4, apply: { starNuclearHydro: 0.10 } },
    { id: 'starSailHydro1', name: '帆阵 I', desc: '太阳帆提供的热液能 +20%', kind: 'industry', layer: 2, nest: 'starNuclearHydro1', n: 1, cost: 5, apply: { starSailHydro: 0.20 } },
    { id: 'starSailHydro2', name: '帆阵 II', desc: '太阳帆提供的热液能额外 +20%（累计 +40%）', kind: 'industry', layer: 3, nest: 'starSailHydro1', n: 1, cost: 5, apply: { starSailHydro: 0.20 } },
    { id: 'starSolarRing1', name: '星环共振 I', desc: '太阳星环 θ金属产出 +10%', kind: 'industry', layer: 1, n: 1, cost: 2, apply: { starSolarRing: 0.10 } },
    { id: 'starSolarRing2', name: '星环共振 II', desc: '太阳星环 θ金属产出额外 +10%（累计 +20%）', kind: 'industry', layer: 2, nest: 'starSolarRing1', n: 1, cost: 4, apply: { starSolarRing: 0.10 } },
    { id: 'starSolarRing3', name: '星环共振 III', desc: '太阳星环 θ金属产出再额外 +10%（累计 +30%）', kind: 'industry', layer: 3, nest: 'starSolarRing2', n: 1, cost: 8, apply: { starSolarRing: 0.10 } },
    { id: 'starRingRocketEngineCraft', name: '火箭引擎工艺增效', desc: '火箭引擎工艺效率 +30%', kind: 'industry', layer: 2, nest: 'starSolarRing1', n: 1, cost: 2, recipe: 'craft_rocketengine', rmul: 0.30 },
    { id: 'starRingThetaFilmCraft', name: '西塔金属薄膜工艺增效', desc: 'θ金属自适应薄膜工艺效率 +30%', kind: 'industry', layer: 3, nest: 'starSolarRing2', n: 1, cost: 4, recipe: 'craft_thinafilm', rmul: 0.30 },
    { id: 'starRingStrongPropellantCraft', name: '强工质火箭工艺增效', desc: '强工质火箭引擎工艺效率 +30%', kind: 'industry', layer: 4, nest: 'starSolarRing3', n: 1, cost: 8, recipe: 'craft_strongprop', rmul: 0.30 },

    { id: 'starExplore1', name: '深空观测阵列 I', desc: '卫星与空间站提供的星空探索 +10%', kind: 'frontier', layer: 1, n: 1, cost: 1, apply: { starExplore: 0.10 } },
    { id: 'starExplore2', name: '深空观测阵列 II', desc: '卫星与空间站探索额外 +10%（累计 +20%）', kind: 'frontier', layer: 2, nest: 'starExplore1', n: 1, cost: 2, apply: { starExplore: 0.10 } },
    { id: 'starExplore3', name: '深空观测阵列 III', desc: '卫星与空间站探索再额外 +10%（累计 +30%）', kind: 'frontier', layer: 3, nest: 'starExplore2', n: 1, cost: 4, apply: { starExplore: 0.10 } },
    { id: 'starExploreScholar1', name: '轨道学术协同 I', desc: '卫星和空间站每级使学者、书手系产出 +5%', kind: 'frontier', layer: 2, nest: 'starExplore1', n: 1, cost: 5, apply: { starExploreScholar: 0.05 } },
    { id: 'starExploreScholar2', name: '轨道学术协同 II', desc: '卫星和空间站每级使学者、书手系产出额外 +5%（累计 +10%）', kind: 'frontier', layer: 3, nest: 'starExploreScholar1', n: 1, cost: 5, apply: { starExploreScholar: 0.05 } },
    { id: 'starAlienOutput1', name: '异星工造网 I', desc: '异星建筑产出 +10%', kind: 'frontier', layer: 1, n: 1, cost: 2, apply: { starAlienOutput: 0.10 } },
    { id: 'starAlienOutput2', name: '异星工造网 II', desc: '异星建筑产出额外 +10%（累计 +20%）', kind: 'frontier', layer: 2, nest: 'starAlienOutput1', n: 1, cost: 4, apply: { starAlienOutput: 0.10 } },
    { id: 'starAlienOutput3', name: '异星工造网 III', desc: '异星建筑产出再额外 +10%（累计 +30%）', kind: 'frontier', layer: 3, nest: 'starAlienOutput2', n: 1, cost: 8, apply: { starAlienOutput: 0.10 } },
    { id: 'starTerraform1', name: '行星重构加速 I', desc: '恩克拉多斯与泰拉改造时间 −10%', kind: 'frontier', layer: 2, nest: 'starAlienOutput1', n: 1, cost: 5, apply: { starTerraform: 0.10 } },
    { id: 'starTerraform2', name: '行星重构加速 II', desc: '恩克拉多斯与泰拉改造时间额外 −10%（累计 −20%）', kind: 'frontier', layer: 3, nest: 'starTerraform1', n: 1, cost: 5, apply: { starTerraform: 0.10 } },

    /* 先行建造按八个分区独立解锁；星海区保留在商店。 */
    { id: 'earlyAutoBuildCore', name: '礁栖核心·先行建造', desc: '提前开放礁栖核心的自动建造开关（默认关闭）', kind: 'automation', layer: 1, n: 1, cost: 4, apply: { earlyAutoBuildCore: 1 } },
    { id: 'earlyAutoBuildFood', name: '生息区·先行建造', desc: '提前开放生息区的自动建造开关（默认关闭）', kind: 'automation', layer: 2, nest: 'earlyAutoBuildCore', n: 1, cost: 4, apply: { earlyAutoBuildFood: 1 } },
    { id: 'earlyAutoBuildWorkshop', name: '工坊区·先行建造', desc: '提前开放工坊区的自动建造开关（默认关闭）', kind: 'automation', layer: 2, nest: 'earlyAutoBuildCore', n: 1, cost: 4, apply: { earlyAutoBuildWorkshop: 1 } },
    { id: 'earlyAutoBuildTrade', name: '贸易区域·先行建造', desc: '提前开放贸易区域的自动建造开关（默认关闭）', kind: 'automation', layer: 2, nest: 'earlyAutoBuildCore', n: 1, cost: 4, apply: { earlyAutoBuildTrade: 1 } },
    { id: 'earlyAutoBuildAcademy', name: '学术区·先行建造', desc: '提前开放学术区的自动建造开关（默认关闭）', kind: 'automation', layer: 3, nest: 'earlyAutoBuildWorkshop', n: 1, cost: 4, apply: { earlyAutoBuildAcademy: 1 } },
    { id: 'earlyAutoBuildCivic', name: '市政区·先行建造', desc: '提前开放市政区的自动建造开关（默认关闭）', kind: 'automation', layer: 3, nest: 'earlyAutoBuildTrade', n: 1, cost: 4, apply: { earlyAutoBuildCivic: 1 } },
    { id: 'earlyAutoBuildFaith', name: '信仰区·先行建造', desc: '提前开放信仰区的自动建造开关（默认关闭）', kind: 'automation', layer: 4, nest: 'earlyAutoBuildCivic', n: 1, cost: 4, apply: { earlyAutoBuildFaith: 1 } },
    { id: 'earlyAutoBuildSpace', name: '星海区·先行建造', desc: '提前开放星海区的自动建造开关（默认关闭）', kind: 'automation', layer: 5, nests: ['earlyAutoBuildAcademy', 'earlyAutoBuildFaith'], n: 1, cost: 4, apply: { earlyAutoBuildSpace: 1 } }
  ];

  /* 职业表。对齐 docs/DESIGN_v0.3.md §4「开局 **1 名族民，职业 = 采集者，资源 = 藻食**」：
   *   「采集者 gatherer | 藻食（手动也能点） | **开局唯一**」
   * 所以本表开局只有 gather 挂着（其余在 UI 里不露头，靠 habitat 的解锁判定），
   * 它产的是藻食而非珊瑚——珊瑚是「礁凿」科技那条线的产物。
   * 上一轮自创的 `planter 圃丁` 已删除：文档里 farmer 是「藻食 +40%（采集者降级为保底）」、
   * 靠「藻圃」科技解锁的**第二条**职业，让它在开局就产 0.5/秒等于越级，
   * 且与采集者产同一资源，玩家无从取舍。
   * 猫国 master 参照（2026-09-25 实拉官方源码）：
   *   woodcutter  defaultUnlocked，wood 0.018/tick
   *   farmer      研究 agriculture(100 science) 解锁，catnip 1.0/tick
   *   scholar     建筑 library(25 wood) 解锁，science 0.035/tick
   *   miner       建筑 mine(100 wood) 解锁，minerals 0.05/tick
   * ⚠️ 上列一律是 **per tick**，猫国 `ticksPerSecond: 5`（game.js:2289）⇒ 每秒要 **×5**
   *   （scholar 实为 **0.175/s**，UI 显示的就是这个数）。
   *   2026-09-26 曾把 0.035 读成「/秒」去比本作的每秒值，判「0.03 = 86%，正常档」——**错**（实 17.1%）。
   *   但**比产出必须配成本**：本作 era1 12 项共 510 点、猫国同期 13430 点 ⇒ 1 学者跑完
   *   4.72h vs 21.3h，本作反而**快 4.5 倍**。完整对照见 `docs/KITTENS_BASELINE.md` §二。 */
  var JOBS = [
    /* 珊瑚匠 = 猫国 woodcutter（樵夫）的对位。猫国 js/village.js 里 wood **只有职业能产**，
     * 没有任何产木材的建筑；本作原先拿「礁口采石场」建筑顶替，等于给木材线加了一个
     * 原作没有的产能建筑，材料线也从「靠人」变成了「靠地」。2026-09-25 用户拍板改回职业。
     * 开局即可雇佣（猫国 woodcutter 就是 defaultUnlocked），所以前期唯一的一名族民
     * 要在「当采集者攒粮」和「当珊瑚匠攒料」之间选——这与猫国「一只猫只能干一份活」同源。 */
    /* ⚠️ 2026-09-26「种植」改判：采集者**不是被替换成另一个职业**，而是**进阶为农民**。
     *   所以这里不新增 farmer 职业 id，走的是 `jobName(s,'gather')` 的随科技改称
     *   （见 folk.js）+ 产出乘区 farm（默认 1，种植给 1.5）。
     *   【为什么不另开一个 farmer id】那会让「种植」变成「多一个产同一资源的职业」，
     *   玩家在两个都产藻食的职业之间无从取舍；而用户要的是**同一个人换了身份**。 */
    { id: 'gather',     name: '采集者', desc: '获取藻食' },
    { id: 'coralwright', name: '珊瑚匠', desc: '获取珊瑚' },
    /* ---- 暗流纪重排新增的两个职业（2026-09-26 用户拍板）----
     * 采石工：产「石头」（材料线第三格，由「采石」科技解锁）。
     * 矿工：产「金属」（silt 这个 **id** 对应的显示名，2026-09-26 由「矿砂」改称），
     *       **并伴生「暖石」**——暖石不是矿工的产出主线，是采矿时的附带收获
     *       （量小是故意的：它只在保温法那道开关里被消耗，见 techs.js 保温法那项）。 */
    { id: 'quarrier',   name: '采石工', desc: '获取石头' },
    { id: 'miner',      name: '矿工',   desc: '获取各式矿物' },
    /* ⚠️ 2026-10-04 用户指令：**「匠人」这一项已删除**（原话「根本没有这个职业，删掉」）。
     *   它是 2026-09-28 删掉「匠作」科技后遗留的幽灵行：
     *   ① `jobs.craft` 在全树**没有任何解锁口**（craftT 已删，唯一解锁通路 eff.unlockJob 空了）；
     *   ② 但 folk.jobUnlocked 对「既无科技声明也无市政声明」的职业返回 true（`return !tid`）
     *      ⇒ 它被当成「开局无条件解锁」⇒ 族民页永远渲染「匠人 0 / 驱动加工、地热」，
     *      玩家点 ＋ 还真雇得到人 —— 而**雇了零产出**：加工早改「建筑自动」（见 economy 那条注）、
     *      地热唯一产出口（热泉井）已删 ⇒ economy.fuelRate 恒 0。
     *   ⇒ 一个看得见、雇得动、却什么都不产的职业，就是用户说的「根本没有」。
     * ⚠️ 删职业不是只删这一行，同步点：state.js 的 jobs 字面量、folk.js autoAssign 的 craft 兜底、
     *    sim/e2e.mjs 的夹具与断言。老档里的 `jobs.craft` 由 migrateRun 的 fixTable 按 ref 键遍历
     *    自动丢弃（那个人退回闲置池），无需单独写迁移。 */
    { id: 'scholar',    name: '学者',   desc: '产出科技点' },
    /* 书手 = 市政点的主来源（2026-09-27 用户拍板「新增书手这个职业，可以获得市政点」）。
     * ⚠️ 它**不是**学者的分身：书手走的是市政树那条线，与科技树互不牵连——
     *    这正是当初否决「学者分流」方案（CIVICS §3 方案 A）的理由。
     * ⚠️ 代价说在前面：era1 的瓶颈是人口（CIVICS §2 约束 4），多一个职业就是多一道
     *    从采集者/珊瑚匠手里抽人的压力。它会压慢整局，但**不等于 bug**——
     *    判据是「让断言变绿」还是「让 NaN/死锁消失」，见 docs/JUDGMENTS.md。 */
    { id: 'scribe',     name: '书手',   desc: '产出市政点' },
    /* 商人 = 市政《对外贸易》解锁的职业（2026-09-28 用户规格）。
     * ⚠️【它不是第 8 个「随便产点什么」的职业】它是**奢侈品这条资源线的唯一进项**，
     *    而奢侈品此刻没有开销渠道（贸易系统待设计），所以这名职业在贸易落地前
     *    纯粹存在感稀薄。这是刻意的：先把「谁产奢侈品」钉对，贸易规则之后再挂上去。
     * ⚠️【解锁来源不在科技树上】其余职业都靠 `eff.unlockJob` 反查科技解锁，商人
     *    例外——它的解锁权写在**市政**《对外贸易》的 `job` 字段上（folk.jobUnlocked
     *    同时反查两侧）。写在这里是为了让「谁解锁它」一眼能看见，与职业表并列。 */
    { id: 'merchant',   name: '商人',   desc: '产出奢侈品' }
  ];

  /* ── 工坊：青铜工具三件（2026-09-27 用户拍板）───────────────────────
   * 用户原话：「首先肯定是青铜镰、青铜斧和青铜镐，各 +80% 农民、珊瑚匠和
   *   采石工/矿工的工作效率」；映射由用户当次确认：**镰 = 采集者（藻食），
   *   斧 = 珊瑚匠，镐 = 采石工 + 矿工**。
   *
   * ⚠️ 落点必须分两条函数，因为它们本来就是分开的：
   *   · `gatherMul`（economy.js）管 珊瑚匠 / 采石工 / 矿工 ⇒ 斧、镐挂这里。
   *   · `farmMul`（economy.js）管 采集者（藻食），注释明写「别把 gatherMul
   *     乘进来」⇒ 镰挂这里。当初错乘那条让食物虚高到 38/秒糊掉仓储上限，
   *     这条纪律是有血的，别顺手把镰并进 gatherMul。
   *
   * 【bonus 0.8 是加法档位，落点是乘法】三项各买一次 ⇒ gatherMul 上连乘
   *   (1.8)×(1.8)=3.24（镰不在此列）。两个工具都在手时是 3.24 倍，不是 +160%。
   *   ⚠️ 暂不给递减/封顶：用户尚未拍叠加约束（见 sim/e2e.mjs「工坊工具」那节）。
   *      这个数是标定权，等用户拍完再动，别自己顺手加。
   *
   * 【为什么前置是「建成工坊」而不是科技】青铜术(bronze) 是 era1 最贵的科技
   *   （cost 600，按 1 学者 0.15/s 要攒约 67 分钟）。拿它当前置，工具会晚到
   *   玩家已经打完 era1 的一半。用户拍板「建成工坊开工坊界面」⇒ 门槛 = 工坊等级 ≥ 1
   *   （工坊首级 coral 400），即珊瑚线自身的进度，不需要科学。
   *
   * 【成本量级怎么定的】参照同期同类：礁石平台 coral 87（采集 +8%/级）、
   *   砂矿坑 coral 200（金属 +20%/级）。工具是**一次性买断的效率提升**，
   *   比「等级可叠的建筑」贵是对的：镰 150（最早、最便宜，采集者开局就有）、
   *   斧 200（珊瑚匠是材料线主）、镐 200 + 金属 50（矿工 UNIT.silt 仅 0.09/s，
   *   是四条采集线里最贵的 ⇒ 多收一份合理）。
   * ⚠️ 以上均为**待标定**的提议值，改之前先跑 e2e 看「工坊工具」那节是否仍绿。 */
  /* ⚠️ `target` 是本工具**绑在哪个职业上**，一个数组 = 同时绑多个职业。
   *    「绑到哪些产出行上去」由 economy.js 的 JOB_SINK 那张表回答 —— 工具认的是**人**，
   *    不是资源行（用户 2026-09-27 拍）。改之前先读 economy.js toolMul 上那段注释。
   *    当初斧和镐都写同一个落点（同一条线叠两个数 ⇒ 买斧头石头也涨），已被用户否决。
   *    三件各绑一个职业，买齐是三条线各 +80%，不是「全局 +583%」。 */
  /* ⚠️ 2026-09-28 重排：`need` 这个键**只有铁质三件才有**，且值必须是**真实存在的科技 id**
   *    —— 由 workshop.blocked() 真读（读之前它一直是死字段，见 workshop.js 的 blocked）。
   * ⚠️ 为什么青铜三件不写 need：它们原来的 `need:'workshop'` 是个**歧义字段** ——
   *    workshop 既是**建筑 id**（工坊）也是 era1 那项**科技 id**，一个值两种解释；
   *    而 blocked 从不读它（门槛是硬编码「建成工坊」）⇒ 那个字段一个作用是零。
   *    留着它只会让人以为「买工具要先研究工坊科技」。⇒ 青铜三件的门槛就只有「建成工坊」。
   * ⚠️ 铁质三件的 need 指向「铁器」⇒ 没研究铁器，铁质工具在工坊里**买不到**（而不是灰着）。 */
  var TOOLS = [
    { id: 'tool_sickle', name: '青铜镰', target: ['gather'],
      bonus: 0.80, cost: { coral: 150 },
      desc: '采集者（种植后称农民）采藻食 +80%' },
    { id: 'tool_axe', name: '青铜斧', target: ['coralwright'],
      bonus: 0.80, cost: { coral: 200 },
      desc: '珊瑚匠凿珊瑚 +80%（不影响石头与金属）' },
    { id: 'tool_pick', name: '青铜镐', target: ['quarrier', 'miner'],
      bonus: 0.80, cost: { coral: 200, silt: 50 },
      desc: '采石工采石头、矿工采金属并伴生暖石，三项各 +80%（不影响珊瑚）' },

    /* ── 铁质三件（2026-09-28 纪元二重排新增） ──
     * 形参照猫国 `js/workshop.js:1-95` 的成对结构（mineralHoes→ironHoes / mineralAxes→ironAxes）：
     *   mineralHoes  +0.5 (minerals 275 + science 100) ⇒ ironHoes  +0.3 (iron 25 + science 200)
     *   mineralAxes  +0.7 (minerals 500 + science 100) ⇒ ironAxes  +0.5 (iron 50 + science 200)
     * ⚠️ 猫国的一个反直觉点：铁质的**数值比矿质低**（0.3 < 0.5）。那不是负升级 ——
     *    猫国 core.js 的 effects 合并是 `globalEffects[name] += effect`（**同一 key 相加**），
     *    `registerMeta("research", upgrades, null)` ⇒ 矿锄+铁锄一起 = catnipJobRatio 0.8
     *    ⇒ 农民 ×1.8，两份都买才划算。铁质卖的是「解锁下一层 + 换材料」，不是「变强」。
     * ⚠️ 本作对齐的是**合并语义**（同职业相加，见 economy.toolMul），数值另定：
     *    用户拍的范围 +0.80~1.00，这里取 0.80 —— 与青铜平级。若也压到 0.3 那档，
     *    买齐镰+镰只等于 +0.3（相对青铜是**负升级**，没人会买）。
     *    真正的代价在**材料**：精铁要热泉炉产（UNIT.iron 0.06/份），比珊瑚贵一个量级。
     * ⚠️ `need: 'ironwork'` 是**真字段**：workshop.blocked() 会读它去拦「没研究铁器」。
     * ⚠️ 成本（精铁 25/50/75）按猫国铁质工具的价格比例照搬，量纲对得上，数值待标定。 */
    { id: 'tool_ironSickle', name: '铁镰', need: 'ironwork', target: ['gather'],
      bonus: 0.80, cost: { iron: 25 },
      desc: '农民采藻食 +80%（与青铜镰同档，材料换成精铁）' },
    { id: 'tool_ironAxe', name: '铁斧', need: 'ironwork', target: ['coralwright'],
      bonus: 0.80, cost: { iron: 50 },
      desc: '珊瑚匠凿珊瑚 +80%（与青铜斧同档，材料换成精铁）' },
    { id: 'tool_ironPick', name: '铁镐', need: 'ironwork', target: ['quarrier', 'miner'],
      bonus: 0.80, cost: { iron: 75 },
      desc: '采石工采石头、矿工采金属并伴生暖石，三项各 +80%（与青铜镐同档）' },

    /* ── 钢质三件（2026-09-30 用户拍板：金属精炼线延伸）──
     * 与铁质同构：门挂 TOOLS[].need（metalrefine——钢资源本身就是它解锁的），
     * 不写 eff.unlockTool（techs.js:319 判据：两个解锁口 = 断链）。
     * ⚠️ 与铁质「纯换材料」不同：bonus 取用户拍过的上限档 1.00 —— 钢层卖「真强度」，
     *    镰线全买 = 1 + 0.8(青铜) + 0.8(铁) + 1.0(钢) = **×3.6**（加法合并，见 economy.toolMul）。
     *    代价在材料：钢走 steelFlow（热液工坊 × steelPerHydro 0.05，无上限但产能慢），
     *    且与潮道(5/座)、钢制零件(25/件)、大巴扎(50)抢钢。三件共 105 钢 ≈ 中期 12~17 分钟专职产能。 */
    { id: 'tool_steelSickle', name: '钢镰', need: 'metalrefine', target: ['gather'],
      bonus: 1.00, cost: { steel: 20 },
      desc: '农民采藻食 +100%（与青铜/铁镰相加合并，三件全买 = ×3.6）' },
    { id: 'tool_steelAxe', name: '钢斧', need: 'metalrefine', target: ['coralwright'],
      bonus: 1.00, cost: { steel: 35 },
      desc: '珊瑚匠凿珊瑚 +100%（不影响石头与金属）' },
    { id: 'tool_steelPick', name: '钢镐', need: 'metalrefine', target: ['quarrier', 'miner'],
      bonus: 1.00, cost: { steel: 50 },
      desc: '采石工采石头、矿工采金属并伴生暖石，三项各 +100%（不影响珊瑚）' },

    /* ── 马具（2026-09-29 用户拍板实装：商人奢侈品产出 +50%）──
     * ⚠️ 2026-09-28 它曾是 wip 占位（「不能点的占位」），2026-09-29 用户拍
     *    「马术 +50% 商人奢侈品产出」⇒ 摘掉 `wip: true` 即上线。
     *    workshop.blocked 的 wip 门机制保留，将来再有占位件仍走它。
     * ⚠️ 通道 = `economy.toolMul(s, 'merchant')`（JOB_SINK 里 merchant 绑 ['luxury']）：
     *    tick 与 rates 两处 luxury 产出行**都要**乘它，只改一处 = 面板撒谎。
     *    合并语义是**加法**（1 + 0.5），与青铜三件同口径。
     * ⚠️ `need: 'horsemanship'`：没研究马术 → blocked 返回「需要先研究「马术」」。
     * ⚠️ cost 珊瑚 300 沿用占位时的价（用户未改价）。 */
    { id: 'tool_harnes', name: '马具', need: 'horsemanship',
      target: ['merchant'], bonus: 0.5,
      cost: { coral: 300 },
      desc: '商人产奢侈品 +50%' },

    /* ── θ生物金属工具三件套（2026-10-18 ERA8 实装 · spec §4）──
     * 与青铜/铁/钢三件同构：target 逐件绑职业、加法合并（economy.toolMul）。
     * ⚠️ bonus = 2.00（spec §4 用户拍：上一级钢质 1.00 的 2 倍）
     *    ⇒ 镰线全买 = 1 + 0.8(青铜) + 0.8(铁) + 1.0(钢) + 2.0(θ) = **×5.6**。
     * 【need: 'biomat'】真字段（workshop.blocked 读）；生物材料的尤里卡是「藻食上限 30000」，
     *    与产线无关，无死锁。cost 用 θ金属（θ 由生物材料研究所产），
     *    数量 30/40/50 对齐 θ 是「era8 建筑造价主料」的稀缺定位（三件共 120 θ）。 */
    { id: 'tool_thetaSickle', name: 'θ镰', need: 'biomat', target: ['gather'],
      bonus: 2.00, cost: { thetaMetal: 30 },
      desc: '农民采藻食 +200%（与青铜/铁/钢镰相加合并，四件全买 = ×5.6）' },
    { id: 'tool_thetaAxe', name: 'θ斧', need: 'biomat', target: ['coralwright'],
      bonus: 2.00, cost: { thetaMetal: 40 },
      desc: '珊瑚匠凿珊瑚 +200%（不影响石头与金属）' },
    { id: 'tool_thetaPick', name: 'θ镐', need: 'biomat', target: ['quarrier', 'miner'],
      bonus: 2.00, cost: { thetaMetal: 50 },
      desc: '采石工采石头、矿工采金属并伴生暖石，三项各 +200%（不影响珊瑚）' }
  ];

  NS.TIDE_TREE = TIDE_TREE;
  NS.STAR_PERKS = STAR_PERKS;
  NS.JOBS = JOBS;
  NS.TOOLS = TOOLS;
})(typeof window !== 'undefined' ? window : globalThis);
