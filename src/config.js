/* 天壳 / SHELLBREAK — 配置层
 * 所有可调数值集中在此。sim/balance.mjs 与 sim/e2e.mjs 通过 vm 加载本文件背后的
 * 真实源码，不复制第二份数值——改数值只需改这里，再跑回归。
 *
 * 节奏定案（2026-09-24）：首局原始时代 → 破冰重置，目标挂机 8-14 小时。
 * 定这个时长靠的是三条结构，不是三个系数：
 *   S1 削壳必须吃资源/燃料（ miracle 工程），玩家在「保障燃料」上做取舍
 *   S2 资源有仓储上限，超上限的部分浪费，逼玩家消费而非囤积
 *   S3 建筑成本指数 STEP 加陡，人口生长放缓，使「系数」的增长有墙
 */
(function (root) {
  'use strict';

  var CFG = {
    // ---- 天壳 ----
    // 厚度不是随手填的：扫描得出 rational 10.65h / rush 9.80h，都落在 8-14h 带内中部。
    // 它不是「难度」，是「长度」——砍薄只会让玩家更快看到结局。
    // 去建筑等级上限后系数从 34 涨到 73、时长涨了约 40%，故从上轮的 300000 回调到 200000。
    ICE_SHELL: 200000,     // 冰封壳总厚度（一期唯一一层）
    FRAGILE_AT: 0.25,     // 低于此比例进入「冰封期」：产出 ×0.6 + 冻伤
    FLOOR_AT: 0.25,       // 基础自动削壳停手线：卡在 25% 必须建祭坛才凿得穿。
                          // 判定必须用 <=，否则会卡在 25% 的死锁

  // ---- 建筑成本 ----
  // 没有全局统一系数，也没有等级上限：每建筑自带 `ratio`，成本是唯一的刹车。
  // 这条对齐猫国建设者——官方源码里 maxLevel/levelCap/buildMax 全仓库零匹配，
  // 它压住人口的手段是木屋 priceRatio 2.5（"贵"，不是"上限"）。

    // ---- 破壳系数（玩家的破壳主指标）----
    // 系数 = Σ 各项贡献，破壳速率 = BREAK_BASE × 系数（点/秒）。
    // 每项都有自己的墙：人口受住房卡、级数受成本卡、科技要学问、
    // 祭坛等级受 iron/bone 卡。系数因此不会无限涨，也不会一开局就满顶。
    COEF: {
      POP: 0.26, POP_POW: 0.62,   // 鱼群规模
      LVL: 0.14, LVL_POW: 0.72,   // 建筑总级数
      TECH: 0.80,                 // 每个已研究科技
      MIR: 1.30,                  // 每个祭坛等级——刻意不划算：
                                  // 它是最后手段，一旦比研究还便宜，玩家就不用做取舍了
      PERK: 0.10,                 // 每层洋流增益
      COLD: 1.35                  // 冰封期系数加成：壳越薄，文明越拼命
    },
    BREAK_BASE: 0.40,             // 点/秒 = BREAK_BASE × 系数

    // ---- 奇迹工程（破冰祭坛）----
    // 基础自动削壳只能到 FLOOR_AT；凿穿最后那 25% 只能靠祭坛，
    // 而祭坛要吃燃料——这就是 S1 的取舍点。
    MIRACLE_RATE: 1.10,           // 每级每秒额外削壳点数（不受系数缩放）
    // 燃料要真的不够用，这扇门才存在。实测 0.022 时地热产出恒定高于消耗 3/s，
    // 祭坛从不停摆，「供燃料 vs 保采集」的取舍等于不存在；降到 0.010 后燃料
    // 全程见底、祭坛周期性停摆——末段才真正变成一场资源战而不是干等。
    MIRACLE_BURN: 0.55,
    MIRACLE_ESCALATE: 0.35,  // 每升一级，燃料消耗再 +35%：堆祭坛不是免费的           // 每级每秒燃料消耗
    MIRACLE_START: 0.60,          // 每级烧掉前需要的启动燃料储备 × 等级

    // ---- 仓储（S2）----
    // 超上限的部分直接浪费。囤积不再是无收益的，玩家必须把产出导向消费。
    // 地热刻意不设上限：它是纯流量资源，产多少烧多少，缺口就是缺口。
    // 卡住它的不是仓储，而是「采集 vs 供能」的人力取舍。
    /* 仓储（S2）。菌毯的 1200 是「食物永远吃不完」的元凶：
     * 一块菌圃养 9 人，上限 200 才让爆仓成为真事——压舱仓（储旋钮）因此才有意义。
     * 下限之外的容量只由压舱仓给，不吃 CAP_PER_LVL 的全局增量（见 economy.capOf）。 */
    CAP_BASE: { coral: 1000, silt: 700, bone: 500, iron: 400, kelp: 200, fuel: 800 },
    CAP_PER_LVL: 400,              // 每 1 建筑级提供的仓储容量（菌毯除外）

    // ---- 族民 ----
    // 对齐猫国开局（js/village.js:3 kittens:0 / jobs 全 0，叙事上是 1 只猫）：
    // 本作开局 1 名族民、职业全 0，唯一起步手段是手动采集（见 paneVillage 的采集按钮）。
    POP_START: 1,
    FOOD_PER: 0.06,               // 每人每秒吃的菌毯
    GROW_NEED: 100,                // 连续盈余多少秒生一个（S3：从 10 放慢到 45）
    GROW_KEEP: 20,                // 菌毯余量高于此才开始生育
    FREEZE_CHANCE: 0.003,         // 冰封期每秒冻伤概率基数

    // ---- 季节 ----
    SEASON_TICKS: 6000,           // 每季 = 100 潮日 × 60 秒

    /* ---- 洋流点结算（周目层的唯一收益来源）----
     * 对齐猫国「重置收益 = 人口」——源码 game.js 里只有两行决定你能拿多少：
     *   if (kittens > 35) karmaKittens += ...; if (kittens > 70) paragonPoints = kittens - 70;
     * 所以猫国第一阶段的真正目标不是「打通什么」，而是「养出多少人」。
     * 本作原先按 shellScore（建筑存量占 99.9%）算，三档策略洋流点 15.40/14.82/15.73
     * 几乎无差别，玩家这一局打得好不好在重置时完全感觉不到。改成人口锚定：
     *   ① 门槛：峰值族民 ≤ POP_GATE 不发点（半吊子奖励等于没有奖励，玩家看不出门槛存在）
     *   ② 主指标：门槛以上按 POP_SLOPE 线性积累，斜率足够陡，让「多养 10 个人」
     *      明显优于「多盖 10 级建筑」
     *   ③ 副项：建筑存量只按 B_W 折算，防止「堆建筑」重新取代「养人口」
     */
    TIDE: {
      POP_GATE: 35,          // 峰值族民不高于此值，破冰不发洋流点
      POP_SLOPE: 36,         // 门槛以上每 1 名族民 36 分（标定：54 人 ≈ 6.5 点 / 100 人 ≈ 11 点 / 200 人 ≈ 20 点）
      POP_ESC: { at: 150, k: 54 },  // 150 人以上斜率再抬到 54——猫国的「全力」段
      LAYER: 200,            // 每破一层的固定分
      B_W: 0.02              // 建筑存量的折算权重（副项）
    },

    SAVE_KEY: 'shellbreak.meta.v2',
    RUN_KEY: 'shellbreak.run.v2',
  };

  var SEASONS = [
    { name: '暖流季', mult: 1.50 },
    { name: '平流季', mult: 1.00 },
    { name: '浊流季', mult: 1.00 },
    { name: '寒流季', mult: 0.25 }
  ];

  // 资源表。get 用于渲染层读值（渲染不得直接摸 s.res）。
  var RESS = {
    kelp:    { name: '菌毯', short: '菌' },
    coral:   { name: '珊瑚', short: '珊' },
    silt:    { name: '矿砂', short: '砂' },
    bone:    { name: '骨材', short: '骨' },
    iron:    { name: '精铁', short: '铁' },
    science: { name: '学问', short: '学' },
    fuel:    { name: '地热', short: '热' }
  };

  // 每采集者每秒基础产出
  var UNIT = { coral: 0.12, silt: 0.09, bone: 0.08, iron: 0.06, sci: 0.03 };

  /* 每建筑每级的效果。food 系列是食物三旋钮，照抄猫国建设者的四条食物路径
   * （js/game2.js:3666 calcResourcePerTick("catnip")）里的「产 / 增 / 省 / 储」：
   *   产 = catnipPerTickBase        ← kelp 菌圃（本作唯一产食物处）
   *   增 = aqueduct catnipRatio +0.03
   *   省 = pasture catnipDemandRatio −0.005
   *   储 = barn catnipMax +7500
   * 猫国省耗是 −0.5%/级，本作 −2%/级起步更快，因为我们的 FOOD_PER(0.06) 只有猫国的 1/14。 */
  var BLD = {
    food: 0.55,        // 菌圃：菌毯 +0.55/级/秒
    foodWeir: 0.03,    // 喷口导流堤：菌毯产出 +3%/级
    foodSave: 0.02,    // 保温巢：族口粮 −2%/级
    foodSaveCap: 0.60, // 保温巢：口粮最多省 60%
    kelpCap: 800,      // 压舱仓：菌毯上限 +800/级
    sci: 0.05, reefMul: 0.08, warm: 0.10, house: 6, houseBase: 6, fuel: 0.010
  };

  /* 建筑表。四条字段照抄猫国建设者（github.com/nuclear-unicorn/kittensgame，js/buildings.js）：
   *   ratio              每建筑自己的成本递增系数（猫国叫 priceRatio，在官方 Spec 里标为 MANDATORY，
   *                      且没有全局统一值——猫薄荷田 1.12、木屋 2.5、谷仓 1.75、酿造厂 1.5）。
   *                      本作分工：产能建筑走低 ratio（鼓励铺开），住房 2.5（靠贵压住人口）。
   *   defaultUnlockable   true = 永远可建。开局只有 kelp 挂着它，对应猫国「只有猫薄荷田」。
   *   unlockRatio         库存达到首级价格这个比例时建筑才出现（猫国典型 0.3）。
   *   unlockScheme        {name, threshold}：某资源持有量达阈值才解锁（猫国判定在 game.js:6119）。
   *   requiredTech        必须已研究这些科技。
   *   need                建筑前置。属于加工链的物理依赖，不是解锁手段，所以与上面四项并存。
   *
   * 没有等级上限（同猫国）：升到买不动为止，成本是唯一刹车。 */
  var BUILDINGS = [
    { id: 'kelp',     name: '深海菌圃', ratio: 1.12, cost: {coral: 15},    desc: '菌毯 +0.55/秒 × 季节系数',
      defaultUnlockable: true, unlockRatio: 0.3 },
    /* ---- 食物三旋钮（猫国 pasture / aqueduct / barn 的对应物）----
     * 顺序照猫国的调用顺序排：产（kelp）→ 增（weir）→ 省（warmnest）→ 储（ballast）。
     * 三个 id 都是新的，零存档成本。 */
    { id: 'weir',     name: '喷口导流堤', ratio: 1.15, cost: {silt: 60},   desc: '菌毯产出 +3%/级',
      unlockRatio: 0.3 },
    { id: 'warmnest', name: '保温巢',   ratio: 1.15, cost: {coral: 150},  desc: '族口粮 −2%/级（最高 −60%）',
      unlockRatio: 0.3 },
    { id: 'ballast',  name: '压舱仓',   ratio: 1.15, cost: {coral: 120},  desc: '菌毯上限 +800/级',
      unlockRatio: 0.3 },
    { id: 'reef',     name: '礁石平台', ratio: 1.15, cost: {coral: 87},    desc: '采集产出 +8%/级',
      unlockRatio: 0.3 },
    { id: 'nest',     name: '珊瑚巢',   ratio: 2.50, cost: {coral: 112},   desc: '住房 +6',
      unlockScheme: { name: 'bone', threshold: 60 } },
    { id: 'siltpit',  name: '砂矿坑',   ratio: 1.15, cost: {coral: 225},   desc: '采集者开采矿砂',
      unlockRatio: 0.3 },
    { id: 'workshop', name: '骨材工坊', ratio: 1.15, cost: {coral: 400},   desc: '解锁 珊瑚→骨材',
      unlockRatio: 0.3 },
    { id: 'hearth',   name: '取暖石',   ratio: 1.15, cost: {bone: 87},     desc: '抗寒，冻伤概率上限 −0.5',
      need: 'workshop', unlockRatio: 0.3 },
    { id: 'furnace',  name: '熔炉',     ratio: 1.15, cost: {bone: 112},    desc: '解锁 矿砂→精铁',
      need: 'workshop', requiredTech: ['smelt'] },
    { id: 'library',  name: '聆听巢',   ratio: 1.15, cost: {bone: 150},    desc: '学问 +0.05/级/秒',
      need: 'workshop', requiredTech: ['calendar'] },
    { id: 'geyser',   name: '热泉井',   ratio: 1.15, cost: {bone: 175, iron: 62}, desc: '地热 +0.05/级 × 匠人数',
      need: 'workshop', unlockScheme: { name: 'iron', threshold: 60 } },
    { id: 'miracle',  name: '破冰祭坛', ratio: 1.15, cost: {iron: 300, bone: 400}, desc: '凿穿最后 25% 壳厚，耗地热',
      need: 'geyser', unlockScheme: { name: 'iron', threshold: 300 } }
  ];

  var TECHS = [
    { id: 'calendar', name: '历法',       cost: 150, desc: '季节减产 −25%' },
    { id: 'heat',     name: '热力学',     cost: 300, desc: '抗寒上限 +0.15' },
    { id: 'bonework', name: '骨工法',     cost: 500, desc: '骨材转化 ×1.3' },
    { id: 'smelt',    name: '冶炼术',     cost: 800, desc: '精铁转化 ×1.4' },
    { id: 'pick',     name: '冰镐',       cost: 1250, desc: '破壳系数 +0.45' },
    { id: 'ignition', name: '点火术',     cost: 1950, desc: '地热产出 ×1.4' },
    { id: 'dive',     name: '深潜',       cost: 2750, desc: '采集产出 ×1.2' },
    { id: 'siegeT',   name: '破冰工程学', cost: 4000, desc: '祭坛效果 ×1.25' }
  ];

  /* 洋流增益（跨周目）。cost 单位 = 洋流点。
   * 三类：起始资源 / 产出效率 / 系数减免（门槛减免最贵——它砍掉一局的重复劳动）。
   * 价格按 2026-09-24 重标定后的量级排：首局（54 人）约 6.5 点，只够买 1–2 项便宜的；
   * 一条 nest 链要跑 3–5 周目才吃满。相对关系照旧：起始 < 效率 < 门槛。 */
  var PERKS = [
    { id: 'food',  name: '前朝菌席',  cost: 1,  desc: '开局菌毯 +200',                kind: 'start' },
    { id: 'coral', name: '沉船残骸',  cost: 2,  desc: '开局珊瑚 +150',                kind: 'start' },
    { id: 'g1',    name: '异族鳍肢',  cost: 3,  desc: '采集产出 +10%',                kind: 'rate', n: 3, apply: { gather: 1 } },
    { id: 'g2',    name: '深鳃',      cost: 6,  desc: '采集产出再 +10%',              kind: 'rate', n: 3, apply: { gather: 1 }, nest: 'g1' },
    { id: 'g3',    name: '流线体形',  cost: 12, desc: '采集产出再 +10%',              kind: 'rate', n: 3, apply: { gather: 1 }, nest: 'g2' },
    { id: 'c1',    name: '祖先之热',  cost: 3,  desc: '破壳系数 +0.20',               kind: 'coef', n: 2, apply: { coef: 1 } },
    { id: 'c2',    name: '脉息',      cost: 7,  desc: '破壳系数再 +0.20',             kind: 'coef', n: 2, apply: { coef: 1 }, nest: 'c1' },
    { id: 'd1',    name: '薄壳一代',  cost: 4,  desc: '冰壳厚度 −10%（每级）',        kind: 'thin', n: 3, apply: { thin: 1 } },
    { id: 'd2',    name: '裂脉',      cost: 9,  desc: '冰壳再薄 10%（每级）',         kind: 'thin', n: 3, apply: { thin: 1 }, nest: 'd1' },
    { id: 'd3',    name: '内生热泉',  cost: 18, desc: '冰壳再薄 10%（每级）',         kind: 'thin', n: 3, apply: { thin: 1 }, nest: 'd2' }
  ];

  var JOBS = [
    { id: 'gather',  name: '采集者', desc: '采珊瑚 / 矿砂' },
    { id: 'craft',   name: '匠人',   desc: '驱动加工、地热与祭坛' },
    { id: 'scholar', name: '学者',   desc: '产出学问' }
  ];

  // 必须复用同一 SB 命名空间：其余模块在加载期就读取 SB.CFG 等，另起一个对象会拿到 undefined
  var NS = (root.SB = root.SB || {});
  NS.CFG = CFG; NS.SEASONS = SEASONS; NS.RESS = RESS; NS.UNIT = UNIT;
  NS.BLD = BLD; NS.BUILDINGS = BUILDINGS; NS.TECHS = TECHS;
  NS.PERKS = PERKS; NS.JOBS = JOBS;
})(typeof window !== 'undefined' ? window : globalThis);
