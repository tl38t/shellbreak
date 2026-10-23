/* ───────────────────────────────────────────────────────────────────────────
 * 公司系统 · 数据层（ERA6 市政：宏观经济学解锁的「公司」标签）
 * 2026-10-12
 *
 * 设计要点（用户拍板）：
 *  · 与科技/市政并列的独立标签；拥有市政「宏观经济学」后自动成立，玩家无手动操作。
 *  · 每家公司绑定一个**行业**（加成一种资源）。初期两家：藻食(kelp) / 珊瑚(coral)。
 *  · 公司成立后的游戏内时长决定其等级（乡镇→地方→全国→星球命脉→寰宇巨企），产出加成随之提升；
 *    奢侈品消耗恒 +10%，不随等级变。
 *  · 公司名从**本行业专属名字池**随机抽取，写进存档后固定不刷新。
 *
 * 以后加行业：往 SB.COMPANIES 里再加一项即可（id/res/label/luxBonus/namePool）。
 * 通用行业的等级成长是**全行业通用**的，要统一调就改 SB.COMPANY_TIERS。
 * ─────────────────────────────────────────────────────────────────────────── */
(function (root) {
  var SB = root.SB || (root.SB = {});

  /* 五级成长：按公司成立后的游戏内时长解锁；后两级还受 ERA8/ERA9 市政门槛约束。
   * bonus 是对绑定资源的产出加成；解锁时间从各公司成立时起算。 */
  SB.COMPANY_TIERS = [
    { key: 'town',     name: '乡镇企业',   bonus: 0.10, unlockSec: 0 },
    { key: 'local',    name: '地方企业',   bonus: 0.20, unlockSec: 3600 },   // 满 1h
    { key: 'national', name: '全国性企业', bonus: 0.30, unlockSec: 10800 }, // 满 3h
    { key: 'planetary', name: '星球命脉', bonus: 0.50, unlockSec: 21600, unlockCivic: 'globalization' }, // 满 6h + 全球化
    { key: 'cosmic', name: '寰宇巨企', bonus: 0.70, unlockSec: 43200, unlockCivic: 'solar_logistics' } // 满 12h + 太阳系后勤保障
  ];

  /* 行业定义。namePool 为该行业专属名字库（不与其他行业共用，避免撞名）。
   * 2026-10-20 扩展字段：
   *   · tiers：可覆盖通用 SB.COMPANY_TIERS 的行业加成（工艺/科研公司的全国性企业为 +40%）。
   *   · req：解锁前置（{tech:id} / {civic:id}）。公司本身由《宏观经济学》(ERA6) 解锁，
   *           req 必须 ERA6 及以后（用户硬约束），否则门早过、等于没门。
   *   · craft:true：加成进 workshop.craftRatio 加法乘区（非资源产出），由 SB.companyCraftRatio 喂入。
   *   · outLabel：公司页描述用（替代原先硬编码的 kelp/coral 文案）。 */
  SB.COMPANIES = [
    {
      id: 'algae',
      res: 'kelp',          // 加成资源：藻食
      label: '藻食',
      outLabel: '藻食产出',
      luxBonus: 0.10,       // 奢侈品消耗额外 +10%（恒，不随级变）
      namePool: [
        '深海藻业', '碧渊工造', '洛瓦藻业', '赛琳藻食', '维拉商行'
      ]
    },
    {
      id: 'coral',
      res: 'coral',         // 加成资源：珊瑚
      label: '珊瑚',
      outLabel: '珊瑚产出',
      luxBonus: 0.10,
      namePool: [
        '珊瑚商会', '渊海渔坊', '沧溟商行', '卡里昂海产', '瑞文珊瑚'
      ]
    },
    /* 2026-10-20 新增四家行业公司（用户拍板）。挂点均在公司时代(ERA6)之后。 */
    {
      id: 'craftco',
      res: 'craft',         // 非资源键，仅作 companyState/名字 的索引键
      label: '工艺',
      outLabel: '工艺制作效率',
      luxBonus: 0.10,
      craft: true,          // 加成进 craftRatio 加法乘区（SB.companyCraftRatio）
      req: { tech: 'robotics' },   // ERA8 机器人技术
      tiers: [
        { key: 'town',     name: '乡镇企业',   bonus: 0.10, unlockSec: 0 },
        { key: 'local',    name: '地方企业',   bonus: 0.20, unlockSec: 3600 },
        { key: 'national', name: '全国性企业', bonus: 0.40, unlockSec: 10800 },
        { key: 'planetary', name: '星球命脉', bonus: 0.60, unlockSec: 21600, unlockCivic: 'globalization' },
        { key: 'cosmic', name: '寰宇巨企', bonus: 0.80, unlockSec: 43200, unlockCivic: 'solar_logistics' }
      ],
      namePool: [
        '精工联合', '匠造实业', '恒锐制造', '熔铸工业', '磐石工坊集团',
        '锐锋工艺', '千锤联合', '铸元实业', '匠心智造', '铁腕工业'
      ]
    },
    {
      id: 'steelco',
      res: 'steel',         // 加成资源：钢
      label: '钢铁',
      outLabel: '钢产出',
      luxBonus: 0.10,
      req: { tech: 'hotforge_hammer' },  // ERA6 热力锻锤
      tiers: [
        { key: 'town',     name: '乡镇企业',   bonus: 0.10, unlockSec: 0 },
        { key: 'local',    name: '地方企业',   bonus: 0.20, unlockSec: 3600 },
        { key: 'national', name: '全国性企业', bonus: 0.30, unlockSec: 10800 },
        { key: 'planetary', name: '星球命脉', bonus: 0.50, unlockSec: 21600, unlockCivic: 'globalization' },
        { key: 'cosmic', name: '寰宇巨企', bonus: 0.70, unlockSec: 43200, unlockCivic: 'solar_logistics' }
      ],
      namePool: [
        '瀚海钢铁', '玄铁冶炼', '锋钢实业', '熔渊钢业', '钢渊集团',
        '砺锋钢铁', '渊钢联合', '千锻钢业', '玄钢工造', '潮汐钢铁'
      ]
    },
    {
      id: 'thetaco',
      res: 'thetaMetal',    // 加成资源：θ生物金属
      label: 'θ金属',
      outLabel: 'θ生物金属产出',
      luxBonus: 0.10,
      req: { tech: 'biomat' },   // ERA8 生物材料
      tiers: [
        { key: 'town',     name: '乡镇企业',   bonus: 0.10, unlockSec: 0 },
        { key: 'local',    name: '地方企业',   bonus: 0.20, unlockSec: 3600 },
        { key: 'national', name: '全国性企业', bonus: 0.30, unlockSec: 10800 },
        { key: 'planetary', name: '星球命脉', bonus: 0.50, unlockSec: 21600, unlockCivic: 'globalization' },
        { key: 'cosmic', name: '寰宇巨企', bonus: 0.70, unlockSec: 43200, unlockCivic: 'solar_logistics' }
      ],
      namePool: [
        '碧渊生物金属', '纳米星材', 'θ基联合', '微构金属', '生材工研',
        '晶膜实业', '渊纳米科技', '自适应金属', '碧核材料', '星膜工造'
      ]
    },
    {
      id: 'scico',
      res: 'sci',           // 加成资源：科技
      label: '科研',
      outLabel: '科技产出',
      luxBonus: 0.10,
      req: { tech: 'chemistry' },  // ERA6 化学
      tiers: [
        { key: 'town',     name: '乡镇企业',   bonus: 0.10, unlockSec: 0 },
        { key: 'local',    name: '地方企业',   bonus: 0.20, unlockSec: 3600 },
        { key: 'national', name: '全国性企业', bonus: 0.40, unlockSec: 10800 },
        { key: 'planetary', name: '星球命脉', bonus: 0.60, unlockSec: 21600, unlockCivic: 'globalization' },
        { key: 'cosmic', name: '寰宇巨企', bonus: 0.80, unlockSec: 43200, unlockCivic: 'solar_logistics' }
      ],
      namePool: [
        '启明研究院', '求真科学', '星图学术', '智海研究', '格物联合',
        '渊知科技', '明理研究院', '探微科学', '知微学术', '寰宇研究'
      ]
    }
  ];

  /* 给定公司成立后的游戏内秒数和存档市政，返回当前可用等级索引。
   * 自定义 tiers 覆盖通用档位；tier.unlockCivic 负责 ERA8/ERA9 的全局晋级门槛。 */
  SB.companyTierIndex = function (elapsedSec, tiers, s) {
    tiers = tiers || SB.COMPANY_TIERS;
    var i, best = 0;
    for (i = 0; i < tiers.length; i++) {
      var tier = tiers[i];
      if ((elapsedSec || 0) < tier.unlockSec) break;
      if (tier.unlockCivic && !(s && s.civics && s.civics[tier.unlockCivic])) break;
      best = i;
    }
    return best;
  };

  /* 公司页显示等级晋升所需的市政名称；未知 ID 退回原始键，便于发现数据断链。 */
  SB.companyTierUnlockName = function (tier) {
    if (!tier || !tier.unlockCivic) return '';
    var civics = SB.CIVICS || [], i;
    for (i = 0; i < civics.length; i++) if (civics[i].id === tier.unlockCivic) return civics[i].name;
    return tier.unlockCivic;
  };

  /* 给每个行业抽一个名字（各自从自己的池里随机），返回 { res: name }。
   * ⚠️ 键必须用**资源名 res**（'kelp' / 'coral'），与公司加成（companyMul 按 res 查）、
   *   公司页展示（paneCompany 按 c.res 查）同源 —— 之前错用行业 id（'algae'/'coral'）做键，
   *   导致藻食公司（res='kelp'）永远查不到名字、显示「（未命名）」。 */
  SB.pickCompanyNames = function () {
    var out = {}, i, list = SB.COMPANIES || [];
    for (i = 0; i < list.length; i++) {
      var pool = (list[i].namePool || []);
      out[list[i].res] = pool.length
        ? pool[Math.floor(Math.random() * pool.length)]
        : list[i].label + '公司';
    }
    return out;
  };

  /* ⚠️ 每家公司独立状态（2026-10-13 改「单独关闭」）：旧版是全局 companyEpoch / companiesClosed
   *   （两家共用），关闭按钮一按全关。现在改成 { res: {epoch, closed} } 逐家存。
   * 该 accessor 同时承担**旧档迁移**：旧档只有 companyEpoch / companiesClosed 两个全局字段，
   *   读时把旧值摊到每家，保证旧档不丢状态（migrateRun 只校验不重算，迁移只能放这里）。 */
  SB.companyState = function (s, res) {
    if (!s) return null;
    if (!s.companyState) s.companyState = {};
    if (!s.companyState[res]) {
      if (s.companyEpoch && s.companyEpoch > 0) {
        s.companyState[res] = { epoch: s.companyEpoch, closed: false };
      } else if (s.companiesClosed) {
        s.companyState[res] = { epoch: 0, closed: true };
      } else {
        s.companyState[res] = { epoch: 0, closed: false };
      }
    }
    return s.companyState[res];
  };

  /* 给单个行业抽一个固定名字（从本行业专属池，不与其他行业共用，避免撞名）。 */
  SB.pickCompanyName = function (res) {
    var list = SB.COMPANIES || [], i;
    for (i = 0; i < list.length; i++) {
      if (list[i].res === res) {
        var pool = (list[i].namePool || []);
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : (list[i].label + '公司');
      }
    }
    return res + '公司';
  };

  /* 玩家单独关闭（解散）**一家公司**：清掉它的成立时刻、置 closed=true。
   * 不影响其他公司；关闭后该公司不再提供产出/奢侈加成（companyMul/companyLuxMul 判 closed）。
   * 关闭后不自动复建（maybeCompanyFound 见 closed 跳过），需玩家单独「重建」。
   * ⚠️ 闸门 = 拥有《宏观经济学》（与自动成立同源）；未解锁时关闭无意义，直接 return。 */
  SB.closeCompany = function (s, res) {
    if (!s || !(s.civics && s.civics.macroeconomics)) return false;
    if (!res) return false;
    var st = SB.companyState(s, res);
    st.closed = true;
    st.epoch = 0;
    return true;
  };

  /* 玩家单独重建**一家公司**：重设成立时刻为当前 s.t ⇒ 等级归零、从乡镇企业（tier 0）重新开始成长；
   * 重新随机名字（若缺）。不影响其他公司。 */
  SB.rebuildCompany = function (s, res) {
    if (!s || !(s.civics && s.civics.macroeconomics)) return false;
    if (!res) return false;
    var st = SB.companyState(s, res);
    st.closed = false;
    st.epoch = s.t || 0;
    if (!s.companyNames) s.companyNames = {};
    if (!s.companyNames[res]) s.companyNames[res] = SB.pickCompanyName(res);
    return true;
  };

  /* 逐家公司解锁前置（科技/市政）。无 req ⇒ 老行为（由 macroeconomics 闸门统一管）。
   * ⚠️ 前置必须 ERA6 及以后（公司 ERA6 才开），否则门早过等于没门（用户硬约束）。 */
  SB.companyReqMet = function (s, c) {
    if (!c || !c.req) return true;
    if (c.req.tech) return !!(s.techs && s.techs[c.req.tech]);
    if (c.req.civic) return !!(s.civics && s.civics[c.req.civic]);
    return true;
  };

  /* 公司页「未解锁」文案用的前置描述（研究/完成市政名）。找不到名就退化成 id。 */
  SB.companyReqText = function (c) {
    if (!c || !c.req) return '解锁前置';
    if (c.req.tech) {
      var t = (SB.TECHS || []).filter(function (x) { return x.id === c.req.tech; })[0];
      return t ? ('研究「' + t.name + '」') : ('研究 ' + c.req.tech);
    }
    if (c.req.civic) {
      var v = (SB.CIVICS || []).filter(function (x) { return x.id === c.req.civic; })[0];
      return v ? ('完成市政「' + v.name + '」') : ('完成市政 ' + c.req.civic);
    }
    return '解锁前置';
  };

})(typeof window !== 'undefined' ? window : globalThis);
