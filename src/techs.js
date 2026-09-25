/* data.js —— 静态数据表：资源 / 职业 / 建筑 / 科技。仍是纯数据层。
 * 科技总表对齐 docs/TECH_TREE_v0.2.md 的 44 项（11/8/7/9/9），
 * 顺序 = 从根到收尾，render 的纵向长卷按 era 分组堆叠，越往下越先进。 */
(function (root) {
  var NS = (root.TB = root.TB || {});

  /* ── 资源 ──
   * req = 前置科技 id；未研究前该资源完全不出现（设计第 3 条硬规则）。
   * 注意：氧化剂/还原剂/潮汐能属于 P3（与两极耦合系统一起落地），本轮不进 RES。 */
  NS.RES = [
    { id: 'mat',     name: '菌毯',   color: '#5DCAA5', req: null,        desc: '最大的一族，最基础的口粮' },
    { id: 'shell',   name: '壳礁',   color: '#85B7EB', req: 'mining',    desc: '冰壳下层的矿物，构成一切硬物' },
    { id: 'research',name: '研究',   color: '#7F77DD', req: 'writing',   desc: '学者把看见的变成知道的' }
  ];

  /* ── 职业 ──
   * auto = 每秒自动产出。未用的职业一律不给 auto（不分配就不产出，不影响平衡）。 */
  NS.JOBS = [
    { id: 'gatherer',  name: '采集者',   auto: { mat: 0.02 }, req: null,         desc: '开局唯一职业。手动采集效率远高于自动' },
    { id: 'farmer',    name: '菌农',     auto: { mat: 0.10 }, req: 'husbandry',  desc: '照料菌毯田，自动产出菌毯' },
    { id: 'mason',     name: '壳匠',     auto: { shell: 0.04 }, req: 'mining',   desc: '开采壳礁' },
    { id: 'scholar',   name: '学者',     auto: { research: null }, req: 'writing', desc: '产出研究点，科技的燃料' },
    /* 冷焰纪起 */
    { id: 'glowtender',    name: '育光师',   req: 'taming',      desc: '培殖发光藻，把冷光变成可收的产出' },
    { id: 'oxyExtractor',  name: '采氧人',   req: 'oxygenTech',   desc: '从冰壳裂隙里抽氧化剂' },
    /* 硫泉纪起 */
    { id: 'sulfurMiner', name: '采硫人',   req: 'sulfurTech',   desc: '开采热液丘的硫化物结核' },
    { id: 'refiner',     name: '冶炼师',   req: 'guild',        desc: '把硫铁烧成可锻的料' },
    { id: 'diver',       name: '深潜者',   req: 'deepDive',     desc: '下潜到热液层，也下潜到别族的巢' },
    /* 洋流纪起 */
    { id: 'navigator',    name: '航海士',   req: 'tideChart',    desc: '读潮图，把人送到没人去过的地方' },
    /* 破壳纪起 */
    { id: 'cartographer', name: '测绘师',   req: 'astronomy',    desc: '把冰壳量成一个数字' },
    { id: 'tidalEngineer',name: '潮汐技师', req: 'tideEngine',   desc: '维护潮汐共振机组' }
  ];

  /* ── 建筑 ──
   * costStep = 每多建一级成本乘数（线性涨价，避免指数爆炸）。
   * requires = 前置科技 id。 */
  NS.BUILDINGS = [
    { id: 'iceHut',   name: '冰窟',   cost: { mat: 10 }, costStep: 1.18,
      requires: null, eff: { popCap: 1 }, cap: 20, desc: '一族挤在一处的地方。人口上限 +1' },
    { id: 'matFarm',  name: '菌毯田', cost: { mat: 15 }, costStep: 1.20,
      requires: null, eff: { matRate: 0.12 }, cap: 30, desc: '菌毯产出 0.12/秒' },
    { id: 'kiln',     name: '陶窖',   cost: { mat: 40 }, costStep: 1.25,
      requires: 'pottery', eff: { matCap: 50 }, cap: 10, desc: '菌毯上限 +50' },
    { id: 'reefMine', name: '礁矿',   cost: { shell: 20 }, costStep: 1.25,
      requires: 'mining', eff: { shellRate: 0.05 }, cap: 20, desc: '壳礁产出 0.05/秒' },
    { id: 'tideWheel',name: '潮轮',   cost: { mat: 60, shell: 10 }, costStep: 1.28,
      requires: 'wheel', eff: { globalPct: 0.05 }, cap: 12, desc: '全局产出 +5%' },

    /* ── 冷焰纪 ── */
    { id: 'market',      name: '市集',       cost: { mat: 120 }, costStep: 1.22,
      requires: 'currency', eff: { matCap: 80 }, cap: 10, desc: '菌毯上限 +80，各族在此换东西' },
    { id: 'glowFarm',    name: '发光养殖场', cost: { shell: 60 }, costStep: 1.25,
      requires: 'taming', eff: { matRate: 0.10 }, cap: 12, desc: '菌毯产出 0.10/秒' },
    { id: 'oxyWorks',    name: '采氧场',     cost: { shell: 80 }, costStep: 1.25,
      requires: 'oxygenTech', eff: { shellRate: 0.08 }, cap: 12, desc: '壳礁产出 0.08/秒' },
    { id: 'outerPost',   name: '外礁据点',   cost: { shell: 150 }, costStep: 1.30,
      requires: 'reefBoat', eff: { popCap: 2 }, cap: 8, desc: '人口上限 +2，往冰壳边缘挪一步' },
    /* ── 硫泉纪 ── */
    { id: 'guildHall',   name: '行会厅',     cost: { mat: 260, shell: 60 }, costStep: 1.26,
      requires: 'guild', eff: { matCap: 120 }, cap: 8, desc: '菌毯上限 +120' },
    { id: 'sulfurField', name: '采硫场',     cost: { mat: 220 }, costStep: 1.26,
      requires: 'sulfurTech', eff: { matRate: 0.15 }, cap: 15, desc: '菌毯产出 0.15/秒' },
    { id: 'winch',       name: '绞盘工场',   cost: { shell: 220 }, costStep: 1.28,
      requires: 'winch', eff: { shellRate: 0.12 }, cap: 12, desc: '壳礁产出 0.12/秒' },
    { id: 'school',      name: '学塾',       cost: { mat: 300, shell: 90 }, costStep: 1.28,
      requires: 'education', eff: { matCap: 100 }, cap: 8, desc: '菌毯上限 +100' },
    { id: 'smelter',     name: '熔炉',       cost: { shell: 320 }, costStep: 1.30,
      requires: 'boneFuse', eff: { shellRate: 0.16 }, cap: 10, desc: '壳礁产出 0.16/秒' },
    { id: 'sulfurKeep',  name: '硫堡城礁',   cost: { mat: 380, shell: 200 }, costStep: 1.30,
      requires: 'sulfurKeep', eff: { popCap: 3 }, cap: 6, desc: '人口上限 +3' },
    /* ── 洋流纪 ── */
    { id: 'massWorkshop',name: '流水工场',   cost: { mat: 640 }, costStep: 1.30,
      requires: 'massProd', eff: { matCap: 200 }, cap: 8, desc: '菌毯上限 +200' },
    { id: 'pressRig',    name: '压力机组',   cost: { shell: 700 }, costStep: 1.32,
      requires: 'pressureBlast', eff: { shellRate: 0.25 }, cap: 8, desc: '壳礁产出 0.25/秒' },
    { id: 'foundry',     name: '熔铸台',     cost: { shell: 780 }, costStep: 1.32,
      requires: 'metalCasting', eff: { shellRate: 0.30 }, cap: 8, desc: '壳礁产出 0.30/秒' },
    /* ── 破壳纪 ── */
    { id: 'tideFactory', name: '潮汐工厂',   cost: { mat: 1100, shell: 400 }, costStep: 1.32,
      requires: 'industrial', eff: { matRate: 0.60 }, cap: 10, desc: '菌毯产出 0.60/秒' },
    { id: 'tideTower',   name: '潮汐钻塔',   cost: { shell: 1300 }, costStep: 1.34,
      requires: 'tideEngine', eff: { shellRate: 0.55 }, cap: 8, desc: '壳礁产出 0.55/秒' }
  ];

  /* ── 科技 ──
   * era / cost / branch（survive 生存 · live 生计 · know 求知）
   * reqs   —— 前置科技 id，可跨纪元（跨纪元的连线会穿过纪元闸门）
   * cond   —— 揭示条件，未达成则节点保持未知（treeFull 可强览）
   * key    —— 关键节点。本纪元 key 全清 ⇒ 解锁下一纪元
   * eff    —— 研究完成后生效。只使用 actions.rates() 已消费的键，
   *           避免"研究完没反应"的假效果。
   */
  NS.TECH = [
    /* ══ 纪元一 · 暗流（11 项） ══ */
    /* 生计支 */
    { id: 'pottery',    name: '陶窖',   era: 1, cost: 25,  branch: 'live', free: false,
      reqs: [], key: false,
      cond: { t: 'default' },
      eff: { unlockBuild: ['kiln'], matCap: 50 },
      note: 'Civ6: Pottery · 菌毯首次溢出时现身' },
    { id: 'husbandry',  name: '菌圃',   era: 1, cost: 25,  branch: 'live', free: false,
      reqs: [], key: false,
      cond: { t: 'default' },
      eff: { unlockJob: ['farmer'], matPct: 0.30 },
      note: 'Civ6: Animal Husbandry · 建成第一座菌毯田' },
    { id: 'sailing',    name: '浮筏',   era: 1, cost: 50,  branch: 'live', free: false,
      reqs: [], key: false,
      cond: { t: 'built', b: 'iceHut', n: 1 },
      eff: { matPct: 0.15 },
      note: 'Civ6: Sailing · 建成第一座冰窟' },
    { id: 'irrigation', name: '潮渠',   era: 1, cost: 50,  branch: 'live', free: false,
      reqs: ['pottery'], key: true,
      cond: { t: 'count', b: 'matFarm', n: 3 },
      eff: { matPct: 0.20, matFarmPct: 0.25 },
      note: 'Civ6: Irrigation · 菌毯田达到 3 座' },

    /* 生存支 */
    { id: 'mining',     name: '礁凿',   era: 1, cost: 50,  branch: 'survive', free: false,
      reqs: [], key: false,
      cond: { t: 'default' },
      eff: { unlockBuild: ['reefMine'], matPct: 0.10 },
      note: 'Civ6: Mining · 人口达到 3' },
    { id: 'archery',    name: '骨器',   era: 1, cost: 50,  branch: 'survive', free: false,
      reqs: ['husbandry'], key: false,
      cond: { t: 'res', r: 'mat', n: 100 },
      eff: { gatherPct: 0.20 },
      note: 'Civ6: Archery · 菌毯存量首次破 100' },
    { id: 'bronze',     name: '壳锻',   era: 1, cost: 80,  branch: 'survive', free: false,
      reqs: ['mining'], key: true,
      cond: { t: 'gathered', r: 'mat', n: 500 },
      eff: { popCap: 1 },
      note: 'Civ6: Bronze Working · 累计采集 500 菌毯' },

    /* 求知支 */
    { id: 'writing',    name: '结绳',   era: 1, cost: 50,  branch: 'know', free: true,
      reqs: [], key: false,
      cond: { t: 'default' },
      eff: { unlockJob: ['scholar'] },
      note: 'Civ6: Writing · 唯一免费项，防研究资源死锁' },
    { id: 'astrology',  name: '望壳',   era: 1, cost: 50,  branch: 'know', free: false,
      reqs: ['writing'], key: false,
      cond: { t: 'total', n: 4 },
      eff: { globalPct: 0.08 },
      note: 'Civ6: Astrology · 建筑总数达到 4' },
    { id: 'masonry',    name: '石工',   era: 1, cost: 80,  branch: 'know', free: false,
      reqs: ['mining'], key: false,
      cond: { t: 'built', b: 'reefMine', n: 1 },
      eff: { shellPct: 0.20 },
      note: 'Civ6: Masonry · 建成第一座礁矿' },
    { id: 'wheel',      name: '潮轮',   era: 1, cost: 80,  branch: 'know', free: false,
      reqs: ['mining', 'masonry'], key: true,
      cond: { t: 'count', b: 'reefMine', n: 2 },
      eff: { globalPct: 0.10 },
      note: 'Civ6: Wheel · 礁矿达到 2 座' },

    /* ══ 纪元二 · 冷焰（8 项 · 120/200） ══ */
    { id: 'landmark',   name: '航标',   era: 2, cost: 120, branch: 'know', free: false,
      reqs: [], key: false,
      cond: { t: 'default' },
      eff: { shellPct: 0.15 },
      note: 'Civ6: Celestial Navigation · 在冰壳裂缝里插第一根光柱' },
    { id: 'currency',   name: '贝币',   era: 2, cost: 120, branch: 'live', free: false,
      reqs: [], key: false,
      cond: { t: 'default' },
      eff: { globalPct: 0.05, matCap: 60 },
      note: 'Civ6: Currency · 壳缘当钱用，第一次可以"换"' },
    { id: 'oxygenTech', name: '采氧术', era: 2, cost: 120, branch: 'survive', free: false,
      reqs: [], key: false,
      cond: { t: 'default' },
      eff: { unlockBuild: ['oxyWorks'], shellPct: 0.10 },
      note: 'Civ6: Iron Working · 战略资源位给了上位燃料：氧化剂' },
    { id: 'taming',     name: '驯兽',   era: 2, cost: 120, branch: 'live', free: false,
      reqs: ['husbandry'], key: false,
      cond: { t: 'built', b: 'matFarm', n: 4 },
      eff: { unlockJob: ['glowtender'], unlockBuild: ['glowFarm'], matPct: 0.12 },
      note: 'Civ6: Horseback Riding · 驯化对象是磷光鱼与发光藻' },
    { id: 'maths',      name: '算学',   era: 2, cost: 200, branch: 'know', free: false,
      reqs: ['writing'], key: true,
      cond: { t: 'total', n: 6 },
      eff: { researchPct: 0.25 },
      note: 'Civ6: Mathematics · 第一次把"看见的"记成"算得出的"' },
    { id: 'reefBoat',   name: '礁船',   era: 2, cost: 200, branch: 'live', free: false,
      reqs: ['currency'], key: false,
      cond: { t: 'built', b: 'market', n: 1 },
      eff: { unlockBuild: ['outerPost'], shellPct: 0.18 },
      note: 'Civ6: Shipbuilding · 第一次离开主礁' },
    { id: 'shellMason', name: '壳砌',   era: 2, cost: 200, branch: 'survive', free: false,
      reqs: ['oxygenTech'], key: true,
      cond: { t: 'built', b: 'oxyWorks', n: 1 },
      eff: { popCap: 2 },
      note: 'Civ6: Construction · 第一次不只是"挤"，是"砌"' },
    { id: 'pressure',   name: '压力工程', era: 2, cost: 200, branch: 'live', free: false,
      reqs: ['shellMason'], key: true,
      cond: { t: 'count', b: 'iceHut', n: 3 },
      eff: { buildPct: 0.10 },
      note: 'Civ6: Engineering · 建筑效率 +10%' },

    /* ══ 纪元三 · 硫泉（7 项 · 300/390） ══ */
    { id: 'sulfurTech', name: '采硫术', era: 3, cost: 300, branch: 'survive', free: false,
      reqs: ['oxygenTech'], key: false,
      cond: { t: 'sulfur', n: 3 },
      eff: { unlockJob: ['sulfurMiner'], unlockBuild: ['sulfurField'], matPct: 0.10 },
      note: 'Civ6: Military Tactics · 硫铁 = 这个文明的铁' },
    { id: 'guild',      name: '行会',   era: 3, cost: 300, branch: 'live', free: false,
      reqs: ['currency'], key: false,
      cond: { t: 'built', b: 'market', n: 2 },
      eff: { unlockJob: ['refiner'], buildPct: 0.08 },
      note: 'Civ6: Apprenticeship · 技艺第一次变成可传承的规矩' },
    { id: 'deepDive',   name: '深潜术', era: 3, cost: 300, branch: 'survive', free: false,
      reqs: ['sulfurTech'], key: false,
      cond: { t: 'techs', n: 14 },
      eff: { unlockJob: ['diver'], popCap: 1, globalPct: 0.05 },
      note: 'Civ6: Stirrups · 氧化还原电堆第一次真正通电' },
    { id: 'winch',      name: '绞盘',   era: 3, cost: 300, branch: 'live', free: false,
      reqs: ['guild'], key: false,
      cond: { t: 'rate', r: 'mat', n: 1.5 },
      eff: { unlockBuild: ['winch'], globalPct: 0.12 },
      note: 'Civ6: Machinery · 把人从体力里换出来' },
    { id: 'education',  name: '学塾',   era: 3, cost: 390, branch: 'know', free: false,
      reqs: ['maths'], key: true,
      cond: { t: 'rate', r: 'research', n: 4 },
      eff: { unlockBuild: ['school'], researchPct: 0.40 },
      note: 'Civ6: Education · 研究 +40%' },
    { id: 'boneFuse',   name: '硫骨熔铸', era: 3, cost: 390, branch: 'survive', free: false,
      reqs: ['sulfurTech'], key: true,
      cond: { t: 'sulfur', n: 10 },
      eff: { unlockBuild: ['smelter'], popCap: 2, buildPct: 0.10 },
      note: 'Civ6: Military Engineering · 人口上限 +2' },
    { id: 'sulfurKeep', name: '硫堡城礁', era: 3, cost: 390, branch: 'live', free: false,
      reqs: ['guild', 'deepDive'], key: true,
      cond: { t: 'total', n: 9 },
      eff: { unlockBuild: ['sulfurKeep'], popCap: 3 },
      note: 'Civ6: Castles · 人口上限 +3' },

    /* ══ 纪元四 · 洋流（9 项 · 540/660） ══ */
    { id: 'tideChart',   name: '潮汐海图', era: 4, cost: 540, branch: 'know', free: false,
      reqs: ['deepDive'], key: false,
      cond: { t: 'built', b: 'outerPost', n: 2 },
      eff: { unlockJob: ['navigator'], globalPct: 0.08 },
      note: 'Civ6: Cartography · 远征系统的入口' },
    { id: 'massProd',    name: '流水作业', era: 4, cost: 540, branch: 'live', free: false,
      reqs: ['winch'], key: false,
      cond: { t: 'rate', r: 'mat', n: 3 },
      eff: { buildPct: 0.20 },
      note: 'Civ6: Mass Production · 建筑效率 +20%' },
    { id: 'tideStore',   name: '潮汐仓',   era: 4, cost: 540, branch: 'live', free: false,
      reqs: ['massProd'], key: false,
      cond: { t: 'built', b: 'guildHall', n: 2 },
      eff: { matCap: 120 },
      note: 'Civ6: Banking · 存量开始自己生利息' },
    { id: 'pressureBlast',name: '压力爆破', era: 4, cost: 540, branch: 'survive', free: false,
      reqs: ['deepDive'], key: false,
      cond: { t: 'expedition', n: 1 },
      eff: { gatherPct: 0.30, shellPct: 0.20 },
      note: 'Civ6: Gunpowder · 采掘速度 +50%' },
    { id: 'printing',    name: '潮纹印刷', era: 4, cost: 540, branch: 'know', free: false,
      reqs: ['education'], key: false,
      cond: { t: 'built', b: 'school', n: 2 },
      eff: { researchPct: 0.30 },
      note: 'Civ6: Printing · 研究 +30%' },
    { id: 'oceanRig',    name: '远洋帆具', era: 4, cost: 660, branch: 'live', free: false,
      reqs: ['tideChart'], key: true,
      cond: { t: 'expedition', n: 2 },
      eff: { globalPct: 0.15 },
      note: 'Civ6: Square Rigging · 远征收益 +50%' },
    { id: 'astronomy',   name: '测天',     era: 4, cost: 660, branch: 'know', free: false,
      reqs: ['printing', 'tideChart'], key: true,
      cond: { t: 'total', n: 16 },
      eff: { unlockJob: ['cartographer'], researchPct: 0.30 },
      note: 'Civ6: Astronomy · 冰壳第一次被量成一个数字' },
    { id: 'metalCasting',name: '铸件',     era: 4, cost: 660, branch: 'survive', free: false,
      reqs: ['pressureBlast'], key: false,
      cond: { t: 'built', b: 'smelter', n: 2 },
      eff: { unlockBuild: ['foundry'], buildPct: 0.15, matCap: 100 },
      note: 'Civ6: Metal Casting · 建筑效率 +15%' },
    { id: 'siegeShell',  name: '围壳战术', era: 4, cost: 660, branch: 'survive', free: false,
      reqs: ['pressureBlast', 'astronomy'], key: true,
      cond: { t: 'techs', n: 20 },
      eff: { globalPct: 0.10 },
      note: 'Civ6: Siege Tactics · 破壳引擎的前置' },

    /* ══ 纪元五 · 破壳（8 项 + 终局 · 805/925/1200） ══ */
    { id: 'industrial',  name: '工业化',   era: 5, cost: 805, branch: 'live', free: false,
      reqs: ['massProd'], key: false,
      cond: { t: 'built', b: 'winch', n: 4 },
      eff: { unlockBuild: ['tideFactory'], globalPct: 0.25, buildPct: 0.15 },
      note: 'Civ6: Industrialization · 产能 +40%' },
    { id: 'shellTheory', name: '壳体理论', era: 5, cost: 805, branch: 'know', free: false,
      reqs: ['astronomy'], key: false,
      cond: { t: 'eraTechs', era: 4, n: 5 },
      eff: { researchPct: 0.60 },
      note: 'Civ6: Scientific Theory · 破壳从神话变成方程' },
    { id: 'ballistics',  name: '冲击弹道', era: 5, cost: 805, branch: 'survive', free: false,
      reqs: ['pressureBlast'], key: false,
      cond: { t: 'built', b: 'sulfurKeep', n: 2 },
      eff: { globalPct: 0.15 },
      note: 'Civ6: Ballistics · 破壳冲击力 +30%' },
    { id: 'engineeringCorps', name: '工程兵团', era: 5, cost: 805, branch: 'live', free: false,
      reqs: ['industrial'], key: false,
      cond: { t: 'expedition', n: 3 },
      eff: { buildPct: 0.10 },
      note: 'Civ6: Military Science · 建造速度 +50%' },
    { id: 'tideEngine',  name: '潮汐机',   era: 5, cost: 925, branch: 'know', free: false,
      reqs: ['shellTheory'], key: false,
      cond: { t: 'built', b: 'tideFactory', n: 2 },
      eff: { unlockJob: ['tidalEngineer'], unlockBuild: ['tideTower'], globalPct: 0.15 },
      note: 'Civ6: Steam Power · 潮汐共振，造电流' },
    { id: 'sanitation',  name: '水体净化', era: 5, cost: 925, branch: 'live', free: false,
      reqs: ['engineeringCorps'], key: false,
      cond: { t: 'built', b: 'sulfurKeep', n: 3 },
      eff: { popCap: 5 },
      note: 'Civ6: Sanitation · 人口上限 +5' },
    { id: 'economy',     name: '产能经济', era: 5, cost: 925, branch: 'live', free: false,
      reqs: ['tideEngine'], key: true,
      cond: { t: 'total', n: 24 },
      eff: { globalPct: 0.25 },
      note: 'Civ6: Economics · 全局产出 +25%' },
    { id: 'rifling',     name: '膛线',     era: 5, cost: 925, branch: 'survive', free: false,
      reqs: ['ballistics'], key: true,
      cond: { t: 'built', b: 'tideTower', n: 1 },
      eff: { globalPct: 0.20 },
      note: 'Civ6: Rifling · 阵亡率减半（战力键待战争系统落地）' },
    { id: 'shellBreaker',name: '破壳引擎', era: 5, cost: 1200, branch: 'know', free: false,
      reqs: ['economy', 'rifling', 'shellTheory'], key: true,
      cond: { t: 'res', r: 'research', n: 400 },
      eff: { globalPct: 0.30 },
      note: '（Future Tech 位置）· 撞开冰壳，抬头看见木星' }
  ];

  /* ── 纪元 ──
   * gate = 解锁下一纪元的关键节点 id（每支各一，取本纪元收尾项）。
   * 五个纪元的科技堆成一条纵向长卷，越往下越先进。 */
  NS.ERAS = [
    { id: 1, name: '暗流纪', motto: '活下去', color: '#6FE3D2',
      glyph: '一', desc: '吃电势差 · 化能菌毯' },
    { id: 2, name: '冷焰纪', motto: '第一次有光', color: '#7FE9C8',
      glyph: '二', desc: '养电势差 · 生物发光与氧化剂' },
    { id: 3, name: '硫泉纪', motto: '材料革命', color: '#FF7A45',
      glyph: '三', desc: '借热 · 第一次拿到金属' },
    { id: 4, name: '洋流纪', motto: '探索与远征', color: '#4FC3F7',
      glyph: '四', desc: '借力 · 潮汐机械与远征' },
    { id: 5, name: '破壳纪', motto: '工业化', color: '#F2C14E',
      glyph: '五', desc: '造电流 · 撞开冰壳' }
  ];

  /* 分支元信息：颜色决定科技树观感 */
  NS.BRANCHES = [
    { id: 'survive', name: '生存', color: '#D85A30', desc: '采集效率 · 战力 · 人口' },
    { id: 'live',    name: '生计', color: '#5DCAA5', desc: '资源产出 · 上限' },
    { id: 'know',    name: '求知', color: '#7F77DD', desc: '研究 · 全局效率' }
  ];

  /* 统一别名。其它模块一律读 NS.data.*，避免直接去摸具体数组名。 */
  NS.data = {
    RES: NS.RES, JOBS: NS.JOBS, BUILDINGS: NS.BUILDINGS,
    TECH: NS.TECH, ERAS: NS.ERAS, BRANCHES: NS.BRANCHES
  };
})(typeof window !== 'undefined' ? window : globalThis);
