/* ───────────────────────────────────────────────────────────────────────────
 * 公司系统 · 数据层（ERA6 市政：宏观经济学解锁的「公司」标签）
 * 2026-10-12
 *
 * 设计要点（用户拍板）：
 *  · 与科技/市政并列的独立标签；拥有市政「宏观经济学」后自动成立，玩家无手动操作。
 *  · 每家公司绑定一个**行业**（加成一种资源）。初期两家：藻食(kelp) / 珊瑚(coral)。
 *  · 公司成立后的游戏内时长决定其等级（乡镇→地方→全国），产出加成随之提升；
 *    奢侈品消耗恒 +10%，不随等级变。
 *  · 公司名从**本行业专属名字池**随机抽取，写进存档后固定不刷新。
 *
 * 以后加行业：往 SB.COMPANIES 里再加一项即可（id/res/label/luxBonus/namePool）。
 * 三级成长是**全行业通用**的，要统一调就改 SB.COMPANY_TIERS。
 * ─────────────────────────────────────────────────────────────────────────── */
(function (root) {
  var SB = root.SB || (root.SB = {});

  /* 三级成长：按公司成立后的游戏内秒数解锁。bonus 是对绑定资源的产出加成。 */
  SB.COMPANY_TIERS = [
    { key: 'town',     name: '乡镇企业',   bonus: 0.10, unlockSec: 0 },
    { key: 'local',    name: '地方企业',   bonus: 0.20, unlockSec: 3600 },   // 满 1h
    { key: 'national', name: '全国性企业', bonus: 0.30, unlockSec: 10800 }   // 满 3h
  ];

  /* 行业定义。namePool 为该行业专属名字库（不与其他行业共用，避免撞名）。 */
  SB.COMPANIES = [
    {
      id: 'algae',
      res: 'kelp',          // 加成资源：藻食
      label: '藻食',
      luxBonus: 0.10,       // 奢侈品消耗额外 +10%（恒，不随级变）
      namePool: [
        '深海藻业', '碧渊工造', '洛瓦藻业', '赛琳藻食', '维拉商行'
      ]
    },
    {
      id: 'coral',
      res: 'coral',         // 加成资源：珊瑚
      label: '珊瑚',
      luxBonus: 0.10,
      namePool: [
        '珊瑚商会', '渊海渔坊', '沧溟商行', '卡里昂海产', '瑞文珊瑚'
      ]
    }
    /* 以后加行业示例：
    {
      id: 'iron', res: 'iron', label: '铁矿',
      luxBonus: 0.10,
      namePool: [ '...', '...' ]
    },
    */
  ];

  /* 给定公司成立后的游戏内秒数，返回当前等级索引（0/1/2）。 */
  SB.companyTierIndex = function (elapsedSec) {
    var tiers = SB.COMPANY_TIERS, i, best = 0;
    for (i = 0; i < tiers.length; i++) {
      if ((elapsedSec || 0) >= tiers[i].unlockSec) best = i;
    }
    return best;
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

})(typeof window !== 'undefined' ? window : globalThis);
