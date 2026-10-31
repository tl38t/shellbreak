/* 天壳 / SHELLBREAK — TapTap 成就封装 + 游戏内成就墙数据层
 *
 * 环境内置全局对象 `tap`（TapTap 运行时自带，无需引入 SDK）。
 * 关键 API：tap.createAchievementManager({ toastEnable }) → 实例；
 *   mgr.registerListener({ onAchievementSuccess, onAchievementFailure })；
 *   mgr.unlockAchievement({ achievementId }) —— 解锁（平台侧幂等，重复调用不报错）。
 *
 * 成就 ID 由 TapTap 后台「游戏服务 → 成就」创建后回填到 SB.CFG.ACHV
 *   （MCP 无建成就工具，只能后台手建；见 assets/achievements/ 的填报清单）。
 *
 * ── 与 rank.js / ad.js 同一套边界纪律（2026-10-15）──────────────────────
 *   生产环境**无 tap 或成就 ID 为空 ⇒ 不调用、绝不"假装成功"**。
 *   降级只发生在 URL 显式带 ?achvtest 时（与 ?ranktest / ?adtest 同一约定）。
 *
 * ── 两层记账（2026-10-24 成就墙实装，设计稿 docs/ACHV_DESIGN_v0.3.md）────
 *   meta.achv        **本地账本**：游戏内成就墙的唯一真源。条件达成即写，
 *                    与平台 ID 是否回填无关（无 tap 的 Web/开发构建也照常记账）。
 *   meta.achievements 平台账本：只有 unlock() 真的向 tap 发出请求才写。
 *                    ⇒ 「ID 未回填不假装成功」纪律原样保留；ID 回填后由
 *                    boot 的 syncMeta 逐个补发（老玩家宽限）。
 *   解锁一律走 unlockOnce(key, meta)：本地记账 + 平台尝试 + 按需落盘，一处收口。
 *
 * ── 解锁时机（判定只在本模块与各钩子落点，不散落第二份口径）────────────────
 *   ① 首次轮回 / 挑战最高档：prestige.doBreak 合格分支 → onBreak（meta 级兜底 sweep 同跑）。
 *   ② 事件型：破壳 shell.js / 双结局+半程 economy-tick.js / 星空满槽 shell.js /
 *             立教 game.js / 双 capstone tech.js·civics.js —— 各自落点调 unlockOnce。
 *   ③ 累计型：bld_* 在 habitat.build 唯一购买漏斗实时判；rebirths/relic 在 doBreak 判；
 *             跨周目账本合并（startRun）与老档 seed（resumeRun）后复判补发。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG || {};
  var mgr = null;
  var inited = false;
  var derivedCache = null;

  /* 17 条静态成就定义（5 旧 + 12 新）。键必须与 SB.CFG.ACHV 一致（改键名两处同改）。
   * name / desc 是**游戏内成就墙**的展示文案（平台侧名称/简介以 TapTap 后台为准，
   *   来源《assets/achievements/成就文案_v0.1.md》，待用户评审）。
   * icon 为 assets/achievements/ 下 512×512 PNG；12 条文明里程碑均已配置专属图标。
   *   后续新定义若没有 icon，成就墙才会显示徽记占位（render-pane-challenges.js）。 */
  var DEFS_BASE = [
    { key: 'cold',         name: '寒流禁火', icon: 'assets/achievements/achv-cold.png',
      desc: '在「寒流禁火」的限制下完成一次轮回。' },
    { key: 'small',        name: '小国寡民', icon: 'assets/achievements/achv-small.png',
      desc: '在「小国寡民」的限制下完成一次轮回。' },
    { key: 'science',      name: '忽视科文', icon: 'assets/achievements/achv-science.png',
      desc: '三档全通——把学者与抄写员的人数一路压到最低。' },
    { key: 'abyss',        name: '深渊重压', icon: 'assets/achievements/achv-abyss.png',
      desc: '三档全通——在全产出大幅削减下走完整局。' },
    { key: 'firstRebirth', name: '首次轮回', icon: 'assets/achievements/achv-first-rebirth.png',
      desc: '第一次完成真正的轮回结算——推倒重来，是深渊文明的成人礼。' },
    { key: 'shellBreak',   name: '首次破壳', icon: 'assets/achievements/achv-shell-break.png',
      desc: '第一次真正凿穿天壳。冰层崩塌的那一刻，深海之上第一次照进星光。' },
    { key: 'dysonEnd',     name: '控星之人', icon: 'assets/achievements/achv-dyson-end.png',
      desc: '建成完整的戴森球，把整颗恒星纳入掌心——在未飞升虚境的那条路上，这就是文明的顶点。' },
    { key: 'voidEnd',      name: '虚境飞升', icon: 'assets/achievements/achv-void-end.png',
      desc: '掌握《飞升虚境》之后竣工戴森球——文明没有停步星海，而是跃入了虚境之中。' },
    { key: 'speedrun',     name: '逐光竞速', icon: 'assets/achievements/achv-speedrun.png',
      desc: '在「逐光竞速」挑战的 4 小时档内凿穿天壳——与时间赛跑，并且跑赢。' },
    { key: 'driftTerra',   name: '流浪泰拉', icon: 'assets/achievements/achv-drift-terra.png?v=2',
      desc: '建成 50 座行星发动机，并把星核炉芯池灌满 50M 热液能。' },
    { key: 'starComplete', name: '太空时代', icon: 'assets/achievements/achv-star-complete.png',
      desc: '破壳之后把星空槽完全填满——深海的族民，终于把目光投向了整片星海。' },
    { key: 'religion',     name: '立教', icon: 'assets/achievements/achv-religion.png',
      desc: '第一次为你的文明命名——从这一刻起，轮回之门为之开启。' },
    { key: 'rebirth10',    name: '十次轮回', icon: 'assets/achievements/achv-rebirth-10.png',
      desc: '完成十次真正的轮回结算——每一次推倒重来，都比上一次走得更远。' },
    { key: 'relic10',      name: '旧日遗珍', icon: 'assets/achievements/achv-relic-10.png',
      desc: '让十座独特奇观跨周目入藏纪念馆——旧日的辉煌，没有被遗忘。' },
    { key: 'relic25',      name: '遗珍全集', icon: 'assets/achievements/achv-relic-25.png',
      desc: '二十五座独特奇观全部入藏——整部文明史，都收进了这座纪念馆。' },
    { key: 'techAll',      name: '科技大成', icon: 'assets/achievements/achv-tech-all.png',
      desc: '在同一个周目内掌握全部 83 项科技——从结绳记事到大统一方程，一条路走到头。' },
    { key: 'civicAll',     name: '市政大成', icon: 'assets/achievements/achv-civic-all.png',
      desc: '在同一个周目内完成全部 69 项市政——从法典到神们自己，一个都不落下。' },
    { key: 'halfDyson',    name: '半程星环', icon: 'assets/achievements/achv-half-dyson.png',
      desc: '戴森球进度达到 50%——半个恒星已经属于你，剩下的只是时间问题。' }
  ];

  /* 45 条「<建筑名>：轻车熟路」从 SB.BUILDINGS 自动派生——新增建筑自动获得成就槽位，
   * ID 未回填则自动跳过（idOf 防线），不必改本文件。
   * ⚠️ config-buildings.js 先于本文件加载（index.html 顺序控制），SB.BUILDINGS 在此可用；
   *    派生结果缓存，_reset 时清（测试重建用）。
   * ⚠️ `desc` 里那句「达成后每个轮回首次建造免材料」不是装饰（2026-10-28 用户要求
   *    「在成就页面说明」）：它是**唯一会把这条福利讲给玩家听的地方**——首建免费在游戏里
   *    只表现为按钮变成「免费」，不解释成因，玩家会当成显示 bug。改福利口径时两处一起改
   *    （判据在 SB.habitat.freeFirstBuild）。 */
  function allDefs() {
    if (derivedCache) return derivedCache;
    var out = DEFS_BASE.slice();
    var B = SB.BUILDINGS || [];
    for (var i = 0; i < B.length; i++) {
      out.push({ key: 'bld_' + B[i].id, name: B[i].name + '：轻车熟路', bld: B[i].id, bldName: B[i].name,
        zone: B[i].zone, icon: B[i].icon,
        desc: '把' + B[i].name + '的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。' });
    }
    derivedCache = out;
    return out;
  }
  function defOf(key) {
    var d = allDefs();
    for (var i = 0; i < d.length; i++) if (d[i].key === key) return d[i];
    return null;
  }

  function achvCfg() { return (CFG && CFG.ACHV) || {}; }

  /* dev 兜底开关：只有 URL 显式带裸 flag `achvtest` 才为真（取最严一侧）。 */
  function devMode() {
    try { return !!(root.location && /[?&]achvtest\b(?!=)/.test(root.location.search)); }
    catch (e) { return false; }
  }
  function haveTap() {
    var t = root.tap;
    return !!(t && typeof t.createAchievementManager === 'function');
  }

  /* ID 合法性：必须是非空字符串且不等于 '0'（与 rank.idOf 同一条防线）。
   * 占位值（'' / '0' / 对象 / 数字）一律视为「未回填」⇒ 跳过解锁。 */
  function idOf(key) {
    var v = achvCfg()[key];
    if (typeof v !== 'string' || !v || v === '0') return '';
    return v;
  }
  function readyKeys() {
    var out = [], d = allDefs();
    for (var i = 0; i < d.length; i++) if (idOf(d[i].key)) out.push(d[i].key);
    return out;
  }
  function missingKeys() {
    var out = [], d = allDefs();
    for (var i = 0; i < d.length; i++) if (!idOf(d[i].key)) out.push(d[i].key);
    return out;
  }

  function getMgr() {
    if (!haveTap()) return null;
    if (!mgr) {
      try {
        mgr = root.tap.createAchievementManager({ toastEnable: true });
        if (mgr && typeof mgr.registerListener === 'function') {
          mgr.registerListener({
            onAchievementSuccess: function (res) { if (root.console) root.console.log('[achv] 解锁成功', res); },
            onAchievementFailure: function (code, msg) { if (root.console) root.console.warn('[achv] 解锁失败', code, msg); }
          });
        }
      } catch (e) { return null; }
    }
    return mgr;
  }

  function init() {
    if (inited) return;
    inited = true;
    if (root.console && devMode()) {
      var m = missingKeys();
      if (m.length) root.console.warn('[achv] 未回填成就ID（这些会被跳过）:', m.join(', '));
      else root.console.log('[achv] 已回填成就:', readyKeys().join(', '));
    }
  }

  /* 控件/上报是否可用：dev 恒真；生产环境需 tap + 至少一个合法 ID。 */
  function available() {
    if (devMode()) return true;
    return !!(haveTap() && readyKeys().length > 0);
  }

  /* 解锁单条成就（只发平台，不碰本地账本）。
   * 返回 true = 本次真的发出（或 dev 模拟发出）；false = 未回填 / 无 SDK / 异常 ⇒ 调用方可重试。 */
  function unlock(key) {
    var id = idOf(key);
    if (!id) return false;
    if (devMode()) { if (root.console) root.console.log('[achv] (?achvtest) 模拟解锁', key, id); return true; }
    var m = getMgr();
    if (!m || typeof m.unlockAchievement !== 'function') return false;
    try {
      m.unlockAchievement({ achievementId: id });
      if (root.console) root.console.log('[achv] 请求解锁', key);
      return true;
    } catch (e) { if (root.console) root.console.warn('[achv] 解锁异常', key, e); return false; }
  }

  function saveMeta(meta) {
    if (meta && SB.state && SB.state.saveMeta) SB.state.saveMeta(meta);
  }

  /* 解锁单条成就并记本地账（全库统一入口）。
   * ① meta.achv[key] = true（本地账本，成就墙真源；条件达成即记，与 ID 无关）；
   * ② 若平台尚未发过且 unlock() 真发出 ⇒ meta.achievements[key] = true（平台账本）；
   * ③ 任一发生变化才 saveMeta（无 ID 时后续重复调用零写盘）。
   * 返回 true = 本次是首次记本地账（调用方可据此弹提示/计数）。 */
  function unlockOnce(key, meta) {
    if (!key || !meta) return false;
    var local = meta.achv || (meta.achv = {});
    var fresh = !local[key];
    if (fresh) local[key] = true;
    var fired = meta.achievements || (meta.achievements = {});
    var platformNew = false;
    if (!fired[key] && unlock(key)) { fired[key] = true; platformNew = true; }
    if (fresh || platformNew) saveMeta(meta);
    return fresh;
  }

  /* boot 同步（game.js boot 唯一调用点）：
   * ① 老档迁移——平台账本里已有的（ID 回填前挣的）⇒ 本地账本补记，成就墙不空白；
   * ② 宽限补发——本地已挣但平台没发的（当时无 ID/无 SDK）⇒ 逐个再试；
   * ③ meta 级兜底清扫（religionSeen / rebirths / memorialWonders）。 */
  function syncMeta(meta) {
    if (!meta) return;
    var local = meta.achv || (meta.achv = {});
    var fired = meta.achievements || (meta.achievements = {});
    var migrated = false;
    for (var k in fired) if (!local[k]) { local[k] = true; migrated = true; }
    if (migrated) saveMeta(meta);
    var retried = false;
    for (var k2 in local) {
      if (fired[k2]) continue;
      if (unlock(k2)) { fired[k2] = true; retried = true; }
    }
    if (retried) saveMeta(meta);
    sweepMeta(meta);
  }

  /* meta 级累计条件的兜底复判（doBreak / boot 都过一遍，防任何单点漏账）。
   * ⚠️ 只读 meta 的量：religionSeen / rebirths / memorialWonders / buildingLvlTotal。
   *    本周目 buildingLvlRun 的增量不在此列——它由 habitat.build 实时判 +
   *    startRun 合并后 recheckBuildings 覆盖（doBreak 发生在 startRun 之前）。 */
  function sweepMeta(meta) {
    if (!meta) return;
    if (meta.religionSeen) unlockOnce('religion', meta);
    if ((meta.rebirths || 0) >= 10) unlockOnce('rebirth10', meta);
    var rw = meta.memorialWonders ? Object.keys(meta.memorialWonders).length : 0;
    if (rw >= 10) unlockOnce('relic10', meta);
    if (rw >= 25) unlockOnce('relic25', meta);
    recheckBuildings(meta);
  }

  /* 跨周目账本里累计 ≥100 的建筑逐个补发（startRun 合并后 / resumeRun seed 后调用）。
   * 只对未记过账的调 unlockOnce——已记账的零写盘。 */
  function recheckBuildings(meta) {
    if (!meta || !SB.BUILDINGS) return;
    var t = meta.buildingLvlTotal || {};
    for (var i = 0; i < SB.BUILDINGS.length; i++) {
      var id = SB.BUILDINGS[i].id;
      if ((t[id] || 0) >= 100) unlockOnce('bld_' + id, meta);
    }
  }

  /* 单周目 capstone 复判（tech.js study / civics.js research 完成时调用，habitat 兜底
     * 路径同调）：数当前周目已掌握项 vs 全表长度，满了才解锁。判定收在本模块，
     * 钩子落点只转发——不散落第二份口径。
     * ⚠️ 跨周目硬门（尤里卡/鼓舞条件读 cycle/星屑/oldFaith，tech.js canStudy 与
     *   civics.js 揭示门会永久拒绝未达标者）⇒ 纯新档一局全清不可能，第 15 周目起
     *   才可达（设计稿 §五·2）。语义成立，阈值不改。 */
  function checkTechAll(s, meta) {
    if (!s || !meta || !SB.TECHS || !SB.TECHS.length) return false;
    var n = 0, T = SB.TECHS;
    var eligible = 0;
    for (var i = 0; i < T.length; i++) {
      if (T[i].challengeOnly) continue;
      eligible++;
      if (s.techs && s.techs[T[i].id]) n++;
    }
    if (eligible > 0 && n >= eligible) return unlockOnce('techAll', meta);
    return false;
  }
  function checkCivicAll(s, meta) {
    if (!s || !meta || !SB.CIVICS || !SB.CIVICS.length) return false;
    var n = 0, C = SB.CIVICS;
    for (var i = 0; i < C.length; i++) if (s.civics && s.civics[C[i].id]) n++;
    if (n >= C.length) return unlockOnce('civicAll', meta);
    return false;
  }

  /* 成就墙进度读数（纯函数，不改状态）：
   * bld_*   ⇒ 跨周目累计等级（meta.buildingLvlTotal + 本周目 buildingLvlRun）/ 100
   * rebirth10 ⇒ meta.rebirths / 10；relic10|relic25 ⇒ 入藏奇观数 / 10|25
   * 其余（事件型/挑战型）无进度 ⇒ null。 */
  function progressOf(key, meta, run) {
    if (key && key.indexOf('bld_') === 0) {
      var id = key.slice(4);
      var cur = ((meta && meta.buildingLvlTotal && meta.buildingLvlTotal[id]) || 0)
        + ((run && run.buildingLvlRun && run.buildingLvlRun[id]) || 0);
      return { cur: cur, max: 100, label: '跨周目累计 ' + cur + ' / 100 级' };
    }
    if (key === 'rebirth10') {
      var rb = (meta && meta.rebirths) || 0;
      return { cur: rb, max: 10, label: '合格轮回 ' + rb + ' / 10 次' };
    }
    if (key === 'relic10' || key === 'relic25') {
      var rw2 = (meta && meta.memorialWonders) ? Object.keys(meta.memorialWonders).length : 0;
      var mx = key === 'relic10' ? 10 : 25;
      return { cur: rw2, max: mx, label: '入藏奇观 ' + rw2 + ' / ' + mx + ' 座' };
    }
    return null;
  }

  /* 破壳结算钩子：由 prestige.doBreak 在「合格轮回」分支调用。
   * ⛔ 平台账本只在 unlock 真的发出时才写（见 unlockOnce）——「ID 尚未回填」不会把
   *   已解锁状态错记成已完成，玩家回填 ID 后的下一次破壳/boot 仍能补发（对老玩家宽限）。 */
  function onBreak(report, meta) {
    if (!meta) return;
    unlockOnce('firstRebirth', meta);
    var clr = report && report.challengeClear;
    if (clr && SB.challenges) {
      var d = SB.challenges.byId(clr.id);
      if (d && clr.tier === d.tiers.length - 1) unlockOnce(clr.id, meta);
    }
    sweepMeta(meta);
  }

  SB.achv = {
    init: init, unlock: unlock, unlockOnce: unlockOnce, onBreak: onBreak,
    syncMeta: syncMeta, sweepMeta: sweepMeta, recheckBuildings: recheckBuildings,
    checkTechAll: checkTechAll, checkCivicAll: checkCivicAll,
    available: available, readyKeys: readyKeys, missingKeys: missingKeys, devMode: devMode,
    allDefs: allDefs, defOf: defOf, progressOf: progressOf,
    _reset: function () { mgr = null; inited = false; derivedCache = null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
