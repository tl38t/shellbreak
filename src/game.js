/* 天壳 / SHELLBREAK — 核心协调层
 * 唯一持有 S（周目状态）与 meta（跨周目状态）的模块。
 * 其它模块一律通过 SB.game.run() / SB.game.meta() 取状态，并由本层负责渲染调度。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  var S = null;
  var meta = SB.state.loadMeta();
  var suppressExitSave = false;
  var speed = 1;
  var tab = 'village';
  var dirty = true;
  var LOG_MAX = 40, logLines = [];

  function run() { return S; }
  function state() { return meta; }
  /* 首座轨道卫星后，星屑商店作为跨周目入口永久开放；不依赖当前周目还保有卫星。 */
  function stardustShopUnlocked() {
    if (meta && meta.stardustShopUnlocked) return true;
    if (S && S.lvl && S.lvl.satellite >= 1) {
      meta.stardustShopUnlocked = true;
      SB.state.saveMeta(meta);
      return true;
    }
    return false;
  }
  function unlockStardustShop() {
    if (meta && !meta.stardustShopUnlocked) {
      meta.stardustShopUnlocked = true;
      SB.state.saveMeta(meta);
      dirty = true;
    }
    return !!(meta && meta.stardustShopUnlocked);
  }
  function getTab() { return tab; }
  function setTab(k) {
    /* 旧版 / 外部入口仍可能请求 star-dome；导向轮回商店内的星屑二级页签。 */
    if (k === 'star-dome') {
      if (!stardustShopUnlocked()) return;
      if (SB.ui.render && SB.ui.render.setMetaShopView) SB.ui.render.setMetaShopView('stardust');
      k = 'meta';
    }
    /* 科技面板的门（SB.tech.panelOpen 读结绳的尤里卡条件，见 tech.js）。
     * 这里与 render 的 tab onclick 是两道闸，同一件事写两遍是刻意的：
     * setTab 是公开 API，弹窗回调之类不经过 tab 的事件委托也能调到它。 */
    if (k === 'tech' && S && SB.tech && !SB.tech.panelOpen(S)) return;
    /* 工坊页的门是「建成工坊」这座建筑。与科技页同一套两道闸的写法，
     * 免得将来某条直达路径（比如工坊建造成功后的提示）绕过 tab onclick 把灰页签点亮。 */
    if (k === 'workshop' && S && !(S.lvl && S.lvl.workshop > 0)) return;
    /* 奇观页的门是「研究过石工」那项科技（用户要的「第一个就让石工解锁」）。
     * ⚠️ 与上面两道闸同理：就算页签已经因为灰态切换被点亮，直达路径也进不去。 */
    if (k === 'wonder' && S && !(S.techs && S.techs.masonry)) return;
    /* 局外商店页（meta 页）：首次合格轮回开放轮回点商店，首座卫星永久开放星屑商店。
     * 直达路径也必须经过同一门；挑战入口仍另行要求真实轮回解锁。 */
    if (k === 'meta' && !meta.shopUnlocked && !stardustShopUnlocked()) return;
    if (k === 'challenges' && !meta.shopUnlocked) return;
    /* 成就页签（2026-10-24 从「挑战与成就」拆出）：与挑战**同一道门**
     * （首次轮回开放），直达路径（弹窗/测试）也必须过它。 */
    if (k === 'achievements' && !meta.shopUnlocked) return;
    /* 信仰页的门 = 完成「神学」（与资源行/产出线的 gate 同源，走 resUnlocked 这一处定义）。
     * 与上面几道闸同一套写法：直达路径（弹窗/测试）走 setTab 也进不去。 */
    if (k === 'faith' && S && !(SB.economy && SB.economy.resUnlocked(S, 'faith'))) return;
    if (k === 'star-map' && S && !(S.shellOpened && S.shell <= 0)) return;
    tab = k; dirty = true;
    var keys = SB.ui.render.PANE_KEYS;
    for (var i = 0; i < keys.length; i++) {
      var node = document.getElementById('pane-' + keys[i]);
      if (node) node.classList.toggle('hidden', keys[i] !== k);
    }
    /* ⚠️ 页签高亮也在这里同步。它原先**只**写在 tab 的 onclick 里，于是任何走
     *    setTab 的路径（最典型的是开门弹窗里那句「去看看」——它直接调 setTab('tech')）
     *    都只换了 pane，把高亮留在「巢穴」上：页签写着巢穴、底下画着科技。
     *    放在这里之后，onclick 那段就只剩「点了谁」这一件事，两边不再各记一份状态。
     *    （2026-09-26 写探针时撞见：截图里科技页是好的，页签却没亮。） */
    var tabs = document.querySelectorAll('.tab');
    for (i = 0; i < tabs.length; i++)
      tabs[i].classList.toggle('on', tabs[i].dataset.tab === k);
    render();
  }
  function setSpeed(v) { speed = v; }
  /* 看广告加速倍率：玩家所选档位（speed）× 这个系数。广告时间银行（S.ad.ms）>0 且开关打开时 = MUL，否则 1。
   * 在线：loop() 里 loop.acc += elapsed*speed*adMul() 实现 2×。
   * 离线：drainCatchUp 对覆盖到的真实秒吃 adMul()（2×）并扣减银行，余额耗尽自动回落 1×；
   *    主循环里的银行扣减段用 !loop.job 守卫，离线不重复 nibble（见 loop 内注释）。
   * 与 config.js:51「墙钟真实时间，关游戏也在走」一致——银行离线也流逝，且离线对应时段按 2× 结算。 */
  function adMul() {
    return (S && S.ad && S.ad.on && S.ad.ms > 0) ? (SB.CFG.AD && SB.CFG.AD.MUL || 2) : 1;
  }
  /* 看完广告发奖：往时间银行累加 BOOST_MIN 分钟，封顶 BOOST_CAP_MIN；发完默认打开开关。
   * 这是「看一次广告 +30min 2×」的落地处，由 src/ad.js 的奖励回调调用。 */
  function grantAdBoost() {
    if (!S) return;
    if (!S.ad) S.ad = { ms: 0, on: true };
    var C = SB.CFG.AD || {};
    var cap = (C.BOOST_CAP_MIN || 360) * 60000;
    var add = (C.BOOST_MIN || 30) * 60000;
    S.ad.ms = Math.min(cap, S.ad.ms + add);
    S.ad.on = true;
    dirty = true; renderAll();
    log('看广告获得 ' + (C.BOOST_MIN || 30) + ' 分钟 2× 加速（累计 ' + fmtDur(S.ad.ms / 1000) + '）。');
  }
  /* 顶栏「2× 加速」开关：只切 S.ad.on，不碰余额。关着时余额冻结（不流逝），等于囤着以后用。 */
  function toggleAdBoost() {
    if (!S || !S.ad) return;
    S.ad.on = !S.ad.on;
    dirty = true; renderAll();
    log('2× 加速已' + (S.ad.on ? '开启' : '关闭') + (S.ad.ms > 0 ? '（剩余 ' + fmtDur(S.ad.ms / 1000) + '）' : '（无剩余时间）') + '。');
  }

  /* 「看广告 +1 轮回点」用的本地日期键（YYYY-M-D），跨天自动重置当日计数。 */
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  /* 取当日已看计数（跨天 / 旧档无键 ⇒ 重置）。直接复用 meta.adRebirth（跨周目保留，只按日期归零）。 */
  function adRebirthState(m) {
    var st = (m && m.adRebirth) || {};
    if (!st || typeof st !== 'object' || st.date !== todayKey()) st = { date: todayKey(), count: 0 };
    if (typeof st.count !== 'number' || st.count < 0) st.count = 0;
    return st;
  }
  /* 看完「+1 轮回点」广告发奖：meta.tide +1，且当日次数 +1 并落盘；达每日上限则拒发。
   * 与 grantAdBoost 同口径——只有 SB.ad.show 判定「看完」才调用，不看白送。
   * 每日上限 AD.REBIRTH_DAILY_MAX（10），按本地日期滑动窗口重置，不随倍速/离线变化。 */
  function grantRebirthAd() {
    if (!S) return false;
    var m = state();
    if (!m) return false;
    var max = (SB.CFG && SB.CFG.AD && SB.CFG.AD.REBIRTH_DAILY_MAX) || 10;
    var st = adRebirthState(m);
    if (st.count >= max) { log('今日「看广告 +1 轮回点」已看满 ' + max + ' 次，明天再来。'); return false; }
    st.count += 1;
    st.date = todayKey();
    m.adRebirth = st;
    m.tide = (m.tide || 0) + 1;          // 累计轮回点 +1（与破壳/挑战同账本，跨周目保留）
    m.tideEarnedTotal = (m.tideEarnedTotal || 0) + 1;
    SB.state.saveMeta(m);
    dirty = true; renderAll();
    log('看广告获得 1 轮回点（今日第 ' + st.count + '/' + max + ' 次，累计 ' + m.tide + '）。');
    return true;
  }

  function log(msg) {
    logLines.push('· ' + msg);
    if (logLines.length > LOG_MAX) logLines.splice(0, logLines.length - LOG_MAX);
    var node = document.getElementById('log');
    if (node) {
      node.innerHTML = logLines.slice().reverse().map(function (x) { return '<div>' + x + '</div>'; }).join('');
    }
  }
  function clearLog() { logLines = []; var n = document.getElementById('log'); if (n) n.innerHTML = ''; }

  function startRun(options) {
    /* 旧版本中尚未写入永久解锁旗的存档，也在离开已建卫星的周目时补记。 */
    if (S && S.lvl && S.lvl.satellite >= 1) unlockStardustShop();
    meta.cycle++;
    /* 轮回商店只在「第一次真正的轮回」后解锁——即【建立宗教】（religionSeen）之后的那次
     * 破冰结算 doBreak。未建立宗教时玩家只能「重开本周目」（普通重置，cycle 同样 +1），
     * 但那不是轮回：doBreak 发 0 点，且 shopUnlocked 保持 false，轮回商店整页锁死。
     * 故 startRun 此处不碰 shopUnlocked；它的解锁由 prestige.doBreak 在真实轮回发生时置位，
     * 旧档（已有跨周目进度）由 loadMeta 迁移补双解锁。 */
    var prev = S;
    S = SB.state.freshRun(true);
    /* 2026-10-24 轻车熟路记账（docs/ACHV_DESIGN_v0.3.md §四·1）：离开本周目前，把本周目
     * 各建筑已购等级增量并入跨周目账本。唯一写入漏斗 = habitat.build 的 s.lvl[id]++，
     * 故这里只合并增量、不碰 lvl 本体；startRun 是周目切换唯一入口（nextCycle /
     * resetRun / 挑战开始三条路都过它），合并不会漏也不会重。 */
    if (prev && prev.buildingLvlRun) {
      var _blt = meta.buildingLvlTotal || (meta.buildingLvlTotal = {});
      for (var _blk in prev.buildingLvlRun) {
        var _blv = prev.buildingLvlRun[_blk];
        if (typeof _blv === 'number' && _blv > 0) _blt[_blk] = (_blt[_blk] || 0) + _blv;
      }
    }
    if (options && options.challenge) S.challenge = { id: options.challenge.id, tier: options.challenge.tier | 0, startedAt: Date.now() };
    if (prev && prev.perk) S.perk = Object.assign(SB.state.emptyPerks(), prev.perk);
    /* 自动点击开关跨周目继承（2026-10-28 用户拍）：freshRun 给的是 true，必须用 meta 偏好盖上，
     * 否则「暂停」在破壳后会被静默重置成开。 */
    applyAutoClickPref(S);
    SB.state.saveMeta(meta);
    clearLog();
    log('第 ' + meta.cycle + ' 周目开始。冰封壳厚度 ' + S.iceShell + '。');
    log('提示：开局 ' + S.pop + ' 名族民、0 资源。在「' + SB.habitat.habitatName(S) + '」页点采集攒 15 藻食建第一座藻场，再回「族民」页雇佣。');
    log('壳薄到 25% 会停手；凿穿最后一段要建成天穹钻机，并在自然环境卡里启动它。');
    dirty = true;
    renderAll();
    if (tab === 'star-map') setTab('village');
    SB.state.saveRun(snapshot(S));   // 新周目必须立刻落盘，否则刷新会丢掉这一局
    if (SB.saveTransfer && SB.saveTransfer.backupSoon) SB.saveTransfer.backupSoon();
  }

  // 继续未完成的上一周目（刷新页面时）
  function resumeRun(saved) {
    S = saved;
    /* 兼容更新前已经建成卫星但尚未记永久解锁旗的存档。 */
    if (S && S.lvl && S.lvl.satellite >= 1) unlockStardustShop();
    /* 2026-10-24 老档补偿（docs/ACHV_DESIGN_v0.3.md §四·1，事项 3 用户拍「要」）：
     * 功能上线前的存档，S.lvl 里的等级从未计入 meta.buildingLvlTotal。首次续档时按
     * 当前周目等级给每座建筑兜底一笔（此前周目的等级早已转化为轮回点与旧日遗产，不追溯）。
     * 幂等二闸（都在才 seed，缺一即跳过）：
     *   ① !meta.bldLvlSeeded——旗随 meta 持久化，刷新/二次续档不重复 seed；
     *   ② buildingLvlRun 为空——新代码跑过的存档该表非空（§四·1 唯一漏斗在记增量），
     *      非空说明这笔等级早已/即将由 startRun 合并计入，不能再按 lvl 兜底（防双计）。
     * ⚠️ 只有 _t 非空才覆盖：新玩家第 2+ 周目（lvl 全 0）续档时 _t 为空，
     *    若无条件覆盖会把上周目已合并进账本的等级抹成 0（数据丢失）。 */
    if (S && S.lvl && meta && !meta.bldLvlSeeded &&
        (!S.buildingLvlRun || Object.keys(S.buildingLvlRun).length === 0)) {
      var _t = {};
      for (var _bid in S.lvl) if (S.lvl[_bid] > 0) _t[_bid] = S.lvl[_bid];
      if (Object.keys(_t).length) {
        meta.buildingLvlTotal = _t;
        log('检测到早期存档：已将现有建筑等级登记入成就进度（共 ' + Object.keys(_t).length + ' 座）。');
      }
      meta.bldLvlSeeded = true;
      SB.state.saveMeta(meta);
    }
    /* 未结算的破壳是一个待玩家选择的持久状态；刷新后必须仍停在结算界面。
     * 已结算的旧档则沿用原行为，恢复为可继续发展的破壳后周目。 */
    if (S.shellOpened && !(S.broken && !S.breakSettled)) S.broken = false;
    if (!S.perk) S.perk = SB.state.emptyPerks();
    /* 自动点击开关跨周目继承（2026-10-28）：
     *   ① 一次性认领 —— meta 里**没有**这个键（= 玩家从未拨过开关，属于「先装开关、后装继承」
     *      的档）而本局存档里有布尔值 ⇒ 认领存档里的值。不认领就会把玩家已设的「暂停」抹成开。
     *   ② 之后 meta 是唯一来源，续档一律按偏好覆盖本局（两边本应相同；不同只可能来自
     *      改过配置的旧档，此时以玩家最后拨过的偏好为准）。 */
    if (meta.autoClickOn === undefined && typeof S.autoClickOn === 'boolean') {
      meta.autoClickOn = S.autoClickOn;
      SB.state.saveMeta(meta);
    }
    applyAutoClickPref(S);
    meta.cycle = Math.max(1, meta.cycle);
    dirty = true;
    if (S._repairedResources && S._repairedResources.length) {
      var repairedNames = S._repairedResources.map(function (id) {
        var def = SB.RESS && SB.RESS[id];
        return def && def.name ? def.name : id;
      });
      log('检测到旧存档中的资源数值损坏，已保护性回落为 0：' + repairedNames.join('、') + '。旧数值无法从存档反推。');
      delete S._repairedResources;
    }
    if (!S.broken) log('已恢复上次进度：' + (S.t / 3600).toFixed(2) + ' 小时，壳厚 ' + Math.round(S.shell) + '。');
    renderAll();
  }

  function nextCycle() {
    SB.ui.render.hideModal();
    SB.state.clearRun();
    startRun();
  }
  /* 软重置「重开本周目」：丢弃当前这局的建筑/资源/族民，但保留 meta——
   * 轮回点、破层层级、已购增益、科技记录都还在。周目计数 +1，因为结构上这已经是新的一周目。 */
  function resetRun() {
    SB.ui.render.hideModal();
    startRun();
  }
  /* 重开按钮的结算分流（2026-10-05 拍板）：本局研究完《神学》⇒ 走真正轮回结算（doBreak），
   * 否则仅软重置。判据与 prestige.qualified 同源，不另写第二份。暴露出来供 e2e 钉住。 */
  function routeReset(s) { return SB.prestige.qualified(s) ? 'break' : 'reset'; }

  /* 硬重置「清空存档」：连 meta 一起抹掉，回第 1 周目的全新档。
   * 这是唯一会毁掉跨周目进度的操作，必须走弹窗 + 显式勾选确认，绝不做静默清空。 */
  function wipeSave() {
    SB.ui.render.hideModal();
    SB.state.clearRun();
    /* 2026-10-29：尸检副本也要一起清。它是自动留的、玩家不知道它的存在，
     * 清档后还留着会让面板显示一份「幽灵旧档」。诊断记录（diag）**不清** —— 它不含
     * 任何进度内容，而清档之后恰恰是最需要它的时候（能证明这次清档发生在什么时候）。 */
    if (SB.store && SB.store.emergencyClear) SB.store.emergencyClear();
    /* 2026-10-27：三处一起清（localStorage + tap.setStorage + tapfile）。
     * 原先只 removeItem(SAVE_KEY)，备份里那份还在 ⇒ 下次启动会把旧档读回来、清档无效。 */
    if (SB.state.clearMeta) SB.state.clearMeta();
    else { try { root.localStorage && root.localStorage.removeItem(SB.CFG.SAVE_KEY); } catch (e) {} }
    meta = SB.state.emptyMeta();
    meta.cycle = 1;
    SB.state.saveMeta(meta);
    S = SB.state.freshRun(false);
    applyAutoClickPref(S);   // meta 已重置 ⇒ 偏好归「开」，这里只是让本局与之一致
    clearLog();
    log('存档已清空，回到第 1 周目。轮回点与破层层级一并抹去。');
    dirty = true;
    renderAll();
    if (tab === 'star-map') setTab('village');
    SB.state.saveRun(snapshot(S));
    if (SB.store && SB.store.flushNativeSync) SB.store.flushNativeSync();
    /* meta 被重置 ⇒ seenVersion 归空 = 逻辑上「未读」。同步一次让红点与状态一致
     * （本会话若已读过更新日志，changelogSigned 仍会把它压住，不会反向点亮）。 */
    syncChangelogDot();
  }

  function stay() {
    if (S) S.broken = false;
    SB.ui.render.hideModal();
    dirty = true;
    renderAll();
    if (S) SB.state.saveRun(snapshot(S));
    /* 破壳待处理时启动会优先展示结算选择，推迟的首次解锁提示在玩家选择留在本局后补播。
     * 更新日志不参与这个队列了（2026-10-28）：红点由 bootUi 统一同步，这里只补一次保证
     * 「破壳局 → 留下 → 页脚可见」这条路红点也是准的。 */
    if (S) { maybeSciencePopup(S); maybeReligionPopup(S); maybeTabUnlockPopups(S); syncChangelogDot(); }
  }

  /* 玩家主动选择轮回时才结算当前最新发展分；留在本局不会调用此入口。 */
  function settleBreak() {
    if (!S || !S.shellOpened || S.shell > 0 || S.breakSettled) return null;
    var report = SB.prestige.doBreak(S, emit, { silent: true });
    if (report) SB.ui.render.showBreakPanel(report);
    return report;
  }

  /* 星图天体清单（萨图恩行星系，与 star-map-frame.html 的 data-id 对齐）。
   * europa 是航天器局部轨道载体（已发射卫星/空间站沿其局部轨道运行，见 frame foot 注释）。
   * 供 recordLaunch 校验、state-migrate 已知天体白名单、星图 iframe 渲染使用。 */
  SB.STAR_MAP_BODIES = [
    { id: 'enceladus', name: '恩克拉多斯' },
    { id: 'rhea', name: '瑞亚' },
    { id: 'titan', name: '泰坦' },
    { id: 'europa', name: '欧罗巴' },
    { id: 'ring', name: '萨图恩环' }
  ];

  /* 星图航天器同步（造即发射）：把 S.spacecraft 幂等对齐到当前运行座数。
   * 轨道卫星/空间站是普通建筑（可叠建多座、用 *Stop「开几座」），其「运行座数」
   * 即本轮回在轨航天器数。未破壳不发射；europa 必须是合法天体（局部轨道载体）。
   * 返回是否发生改变；本函数只改写数组并落盘，渲染由调用方/主循环负责。 */
  function syncSpacecraft(s) {
    if (!s || !s.shellOpened || s.shell > 0) return false;
    var bodies = SB.STAR_MAP_BODIES || [], hasEuropa = false;
    for (var bi = 0; bi < bodies.length; bi++) if (bodies[bi].id === 'europa') hasEuropa = true;
    if (!hasEuropa) return false;
    if (!Array.isArray(s.spacecraft)) s.spacecraft = [];
    var satRun = Math.max(0, ((s.lvl && s.lvl.satellite) || 0) - (s.satelliteStop || 0));
    var staRun = Math.max(0, ((s.lvl && s.lvl.spacestation) || 0) - (s.spacestationStop || 0));
    var existSat = 0, existSta = 0;
    for (var i = 0; i < s.spacecraft.length; i++) {
      var t = s.spacecraft[i] && s.spacecraft[i].type;
      if (t === 'satellite') existSat++; else if (t === 'station') existSta++;
    }
    if (existSat === satRun && existSta === staRun) return false;  // 已对齐，幂等早退
    var seq = s.spacecraft.length || 0, ns = 0, nt = 0, list = [];
    function newId() { return 'craft-' + (++seq); }
    for (var a = 0; a < satRun; a++)
      list.push({ id: newId(), type: 'satellite', body: 'europa', name: '卫星 ' + (++ns), launchedAt: s.t || 0 });
    for (var b = 0; b < staRun; b++)
      list.push({ id: newId(), type: 'station', body: 'europa', name: '空间站 ' + (++nt), launchedAt: s.t || 0 });
    s.spacecraft = list;
    SB.state.saveRun(snapshot(S));
    dirty = true;
    return true;
  }

  /* 发射系统接入点：发射动作完成后登记航天器，由星图展示并随本周目保存。
   * 资源消耗和发射条件由未来的发射玩法决定，这里只接受已完成的发射结果。 */
  function recordLaunch(type, body, name) {
    if (!S || !S.shellOpened || S.shell > 0) return null;
    if (type !== 'satellite' && type !== 'station') return null;
    var bodies = SB.STAR_MAP_BODIES || [], known = false;
    for (var i = 0; i < bodies.length; i++) if (bodies[i].id === body) known = true;
    if (!known) return null;
    if (!Array.isArray(S.spacecraft)) S.spacecraft = [];
    if (S.spacecraft.length >= 200) return null;
    var seq = S.spacecraft.length + 1, id;
    do { id = 'craft-' + seq++; }
    while (S.spacecraft.some(function (x) { return x && x.id === id; }));
    var item = { id: id, type: type, body: body,
      name: (typeof name === 'string' && name.trim() ? name.trim().slice(0, 50)
        : (type === 'station' ? '空间站 ' : '卫星 ') + (seq - 1)), launchedAt: S.t || 0 };
    S.spacecraft.push(item);
    SB.state.saveRun(snapshot(S));
    dirty = true; renderAll();
    return item;
  }

  function render() { if (dirty) { dirty = false; SB.ui.render.renderAll(); } }
  function renderAll() { dirty = false; SB.ui.render.renderAll(); syncAutoClickSetting(); }
  function markDirty() { dirty = true; }

  /* ══ 设置栏「自动点击」开关（2026-10-28 用户要求）════════════════════════════
   * 【为什么需要】自动点击以前只有「买没买」一个维度：买了就永久每秒采 1~3 次，
   *   玩家想暂停（例如就想手点、或想让藻食别涨太快挤掉别的条件）没有任何入口。
   * 【为什么不是 localStorage 偏好】它决定本局每帧要不要执行采集，
   *   必须跟着存档走 —— 换设备 / 云存档恢复后行为得一致（主题、分辨率那类才属于浏览器偏好）。
   * 【两层：s.autoClickOn + meta.autoClickOn】2026-10-28 用户拍「跨周目继承状态」。
   *   s.autoClickOn    = 本局实际行为（autoplay 只认这个，e2e 也只钉这个）；
   *   meta.autoClickOn = 跨周目偏好（startRun 播种进新局；玩家拨开关时两边同写）。
   *   ⇒ 拨成「暂停」后破壳开新周目仍是暂停。破壳不是新安装，玩家刚表达的意图不该被重置。
   *   迁移：meta 里没这个键（= 从未拨过）且当前存档有布尔值 ⇒ 一次性认领存档里的值，
   *   这样「先装了开关、后装了继承」的档不会把玩家已设的暂停抹成开。
   * 【默认值】`s.autoClickOn === false` 才算关，缺字段 = 开。老存档因此零迁移、
   *   行为与改动前完全一致（`migrateRun` 只校验不重算，别指望它补字段，见 JUDGMENTS 五点）。
   * 【为什么 UI 增量更新】开关本身就在这个面板里：整块重写 innerHTML 会把玩家正在点的
   *   那个 checkbox 换掉 ⇒ 这一下点击丢失（与 envWarm / renderAd 同一条纪律）。
   *   syncAutoClickSetting 只写 checked / disabled / textContent / class，从不重建节点。
   */
  function autoClickRate(s) { return (s && s.perk && s.perk.autoClick) || 0; }
  function autoClickOwned(s) { return autoClickRate(s) > 0; }
  /* 对外唯一判据：真的在自动采集吗（拥有 + 没被玩家关掉）。 */
  function autoClickEnabled(s) { return autoClickOwned(s) && !(s && s.autoClickOn === false); }
  /* 跨周目偏好：meta 里没键 = 开（缺字段一律按开，与 s 侧同一条口径）。 */
  function autoClickPref() { return !(meta && meta.autoClickOn === false); }
  /* 把偏好播种进本局（startRun / resumeRun / wipeSave 三处唯一入口都过它）。
   * ⚠️ 只动 s.autoClickOn，不清 autoClickAcc：开关边界由玩家那次拨动负责（见 bindAutoClickSetting）。 */
  function applyAutoClickPref(s) { if (s) s.autoClickOn = autoClickPref(); return s; }
  /* 玩家拨开关：两处同写。meta 侧落盘 ⇒ 下次开新周目仍是他选的那个状态。 */
  function setAutoClickPref(on) {
    if (!meta) return;
    meta.autoClickOn = !!on;
    SB.state.saveMeta(meta);
  }
  /* 轮回商店开没开 —— 与 setTab('meta') 那道门同源，否则会出现
   * 「提示点这里去买」但点了没反应（新手期商店还没开放的阶段正是如此）。 */
  function shopOpen() { return !!(meta && meta.shopUnlocked); }

  function syncAutoClickSetting() {
    if (!document) return;
    var box = document.getElementById('autoClickToggle');
    if (!box) return;
    var s = S, rate = autoClickRate(s), owned = autoClickOwned(s), on = autoClickEnabled(s);
    box.disabled = !owned;
    box.checked = on;
    var row = document.getElementById('autoClickRow');
    if (row) row.classList.toggle('is-locked', !owned);
    var hint = document.getElementById('autoClickHint');
    if (hint) {
      var next = !owned
        ? (shopOpen()
          ? '未拥有 —— 到「轮回商店 · 先人孑遗」购买「潮讯自拾」（点此行直达）'
          : '未拥有 —— 首次破壳后商店开放，届时在「轮回商店 · 先人孑遗」购买「潮讯自拾」')
        : (on
          ? '已拥有「潮讯自拾」· 每秒 ' + rate + ' 次，不受游戏倍速影响'
          /* 暂停态特意点明「跨周目保留」：破壳后新周目仍是关，否则玩家会以为买的东西丢了。 */
          : '已暂停：不再自动采集，手动点「手动采集」照旧可用（跨周目保留）');
      if (hint.textContent !== next) hint.textContent = next;
    }
  }

  function bindAutoClickSetting() {
    if (!document) return;
    var box = document.getElementById('autoClickToggle');
    if (box) box.onchange = function () {
      if (!autoClickOwned(S)) { syncAutoClickSetting(); return; }   // 理论上 disabled，兜一层
      S.autoClickOn = !!box.checked;
      setAutoClickPref(S.autoClickOn);   // 跨周目偏好同步落盘（meta），新周目继承这个值
      /* 预算清零：关掉再打开时不该把停用期间攒下的「欠账」一次补掉
       * （acc 是按 dt×rate 累积的，停用期间不再累加，这里清零只为让开关边界干净）。 */
      S.autoClickAcc = 0;
      dirty = true; renderAll();
      log(S.autoClickOn ? '自动点击已开启。' : '自动点击已暂停（手动采集照旧）。');
    };
    var row = document.getElementById('autoClickRow');
    if (row) row.addEventListener('click', function () {
      /* 未拥有时整行是个「广告位」：点一下直接送到轮回商店，并收起设置浮层。
       * ⚠️ 已拥有时**不要**在这里做任何事 —— 否则点 checkbox 会被这里抢走（事件冒泡）。 */
      if (autoClickOwned(S)) return;
      var det = document.querySelector('.ui-settings');
      if (!shopOpen()) {
        log('「潮讯自拾」在「轮回商店 · 先人孑遗」；首次破壳后商店才会开放。');
        return;
      }
      if (det && det.open) det.open = false;
      setTab('meta');
      log('已跳到轮回商店：在「先人孑遗」里购买「潮讯自拾」即可自动点击。');
    });
  }

  function emit(msg) { log(msg); markDirty(); }

  /* 科技泵：尤里卡揭示 + 纪元推进（实现见 tech.js 的 SB.tech.pump）。
   *
   * 【为什么节流】尤里卡条件里有 `rate` 类（要跑一遍 rates()，含加工限流、地热、祭坛烧燃料），
   * 每 tick 全扫一遍等于把最贵的那部分算 10 次/秒，而揭示结果通常几秒才变一次。
   * 于是按累计逻辑时间每 TECH_PUMP 秒扫一次，并在建造/研究/雇佣/采集后**立刻补一次**——
   * built / total / job 这几类条件正是靠这些动作改变的，让它们等 2 秒等于「点了没反应」。
   * 【为什么 emit 可为 null】离线补算一秒内要跑几千 tick，揭示播报得攒到最后统一发。
   *
   * ⚠️ 置脏（markDirty）**只在这个泵真的改了东西时**（2026-09-26 修）。
   *    以前这里无条件 markDirty()，于是每 2 秒（而且是**逻辑秒** —— 10× 速下就是 0.2 秒）
   *    五个 pane 被整块重建一次。两个后果：
   *      ① 科技长卷的 scrollLeft 归零 —— innerHTML 一重写，滚动容器就换了一个元素，
   *         玩家刚滑到后面的纪元就被拽回最左边（用户 2026-09-26 报的那个现象）；
   *      ② pane 里的按钮都会经历「按下与抬起之间被换掉」，那一次点击整个丢失
   *         （render.js 里那条「每帧重画的容器里不许放按钮」讲的就是这件事，
   *          而无条件的泵等于悄悄把「只在脏标记时重画」变成了「每 0.2 秒重画」）。
   *    面板读数的周期刷新不靠这里，挪到 loop 里的 PANE_REFRESH（**墙钟**，不随倍速放大）。 */
  var TECH_PUMP = 2;
  function pumpTech(s, emit) {
    if (!s || !SB.tech || !SB.tech.pump) return;
    var eraBefore = s.era;
    var revealed = SB.tech.pump(s, emit || null) || 0;
    maybeSciencePopup(s);      // 它自己在真弹的时候置脏
    /* 推进纪元也算「变了」：advanceEra 会把新纪元的节点整批转可见，那一帧必须重画。
     * 用 s.era 前后对比判断，而不是让 pump 返回更多东西 —— 返回值已经是「新揭示条数」，
     * 两件事共用一个返回值，将来只改一处就会漏掉另一处。 */
    if (revealed > 0 || s.era !== eraBefore) markDirty();
  }

  /* 市政泵（2026-09-27）。与技术泵同构、同一节奏（TECH_PUMP 逻辑秒一次），
   * 于是「鼓舞条件达成 → 市政揭示」与「尤里卡达成 → 科技揭示」在玩家眼里是同一件事。
   * ⚠️ 必须**单独**有这一个泵：civics.pump 只扫市政表，塞进 tech 的 pump 里会在
   *    技术表迭代时顺带扫一遍无关数据，将来两边各自加条件就分不清谁该重画了。 */
  function pumpCivic(s, emit) {
    if (!s || !SB.civic || !SB.civic.pump) return;
    if (SB.civic.pump(s, emit || null) > 0) markDirty();
  }

  /* 多个系统可能在同一轮同时跨过门槛（例如离线补算一次完成了议事厅与石工）。
   * 叙事弹窗不能互相覆盖，所以统一进一个小队列；当前卡片关闭后再开下一张。 */
  var storyQueue = [], storyQueueBusy = false;
  function queueStory(o) {
    /* 详情卡、离线面板等旧路径可能直接调用 hideModal()，没有机会经过
     * 叙事按钮的 onOk。看到覆盖层已经关掉，就把队列从这个中间态解开。 */
    var modal = document.getElementById('modal');
    if (storyQueueBusy && modal && modal.classList.contains('hidden')) storyQueueBusy = false;
    storyQueue.push(o);
    openNextStory();
  }
  function openNextStory() {
    if (storyQueueBusy || !storyQueue.length) return;
    storyQueueBusy = true;
    var o = storyQueue.shift(), done = o.onOk;
    o.onOk = function () {
      if (done) done();
      storyQueueBusy = false;
      openNextStory();
    };
    SB.ui.render.storyPanel(o);
  }

  /* 科研面板开门那一刻（docs/TECH_TREE_v0.3.md §2.1，台词由用户 2026-09-25 给定）：
   * 建成第 5 座深海藻场 ⇒ 一个叙事弹窗 + 科技页翻开 + 结绳已在树上（已掌握）。
   * 【为什么挂在 pump 上而不是挂在建造按钮里】门的开合本身是派生的（panelOpen 读结绳的
   * cond），要触发只需「条件一旦跨过就播一次」；pump 恰好每 2 秒跑一次、
   * 玩家动作后又补跑一次，两类情况都覆盖：
   *   ① 玩家自己建到第 5 座 → 建造按钮末尾的那次补跑立刻弹；
   *   ② 离线期间跨过去的 → 补算里的 pump 会弹，不会像离线播报那样被吞掉。
   * 【为什么记账先于弹窗】弹窗回调里要切页、要重渲染，把置位放到回调之后，
   * 同一帧的第二次 pump（构建循环里 2 秒一次 + 动作补跑）就会再弹一遍。 */
  function maybeSciencePopup(s) {
    if (!s || !SB.tech || !SB.tech.panelOpen || SB.tech.popupSeen(s)) return;
    if (!SB.tech.panelOpen(s)) return;
    SB.tech.markPopupSeen(s);
    /* 攒到现在的尤里卡一次性摊开（用户 2026-09-26：「尤里卡等解锁科技之后一起展示」）。
     * 放在弹窗**之前**：玩家被弹窗截住注意力时，日志已经把「这段时间亮了哪些科技」铺好了，
     * 关掉弹窗正好接上按钮那句「进入科技页」。
     * 这条路径同时覆盖在线与离线：离线补算期间 pumpTech 传的是 emit=null（不刷屏），
     * 回来时 finishCatchUp 会走同一个 maybeSciencePopup，攒下的一条都不会丢。 */
    SB.tech.flushEureka(s, emit);
    markDirty();
    /* 【为什么把那段解释性 body 删掉（2026-09-26 用户要求）】
     * 原来那段「分得清今天与明天，就得有人去想明天……」是在替玩家解释这一页是什么，
     * 而按钮、页签名、树上高亮的「结绳（已掌握）」已经把同一件事说了三遍。
     * 用户的原话是「这个不要，就显示『科技页解锁』，按钮是『进入科技页』」。
     * 那两句鲛人打结的台词是用户 2026-09-25 亲自给的（见 TECH_TREE_v0.3.md §2.1），
     * 保留 —— 它们是叙事，不是说明。 */
    queueStory({
      kind: 'tech',
      title: '科技页解锁',
      lines: [
        '鲛人将细小坚韧的深海藻类打了个结，「这代表今天，」他说。',
        '随后，他又打了第二个结，「这代表明天。」'
      ],
      ok: '进入科技页',
      onOk: function () {
        if (S === s) setTab('tech');
        var node = document.getElementById('techrow-writing');
        /* ⚠️ 必须显式写 `inline:'center'`。科技页是**横卷**（树比视口宽得多），
         *    默认 inline 是 'nearest' —— 目标在右侧视口外时它不会把 scrollLeft 推过去，
         *    玩家点「进入科技页」之后看到的还是左边空白，结绳在屏幕外几百像素。 */
        if (node && node.scrollIntoView) {
          node.scrollIntoView({ block: 'center', inline: 'center' });
        }
      }
    });
  }

  /* 其余系统页签的开门叙事。门槛全部复用现有系统判定，弹窗只负责记账与表现。 */
  function maybeCivicPopup(s) {
    if (!s || s.civicPopup || !SB.civic || !SB.civic.panelOpen || !SB.civic.panelOpen(s)) return;
    s.civicPopup = true;
    markDirty();
    queueStory({
      kind: 'civic', icon: '▤', title: '市政页解锁',
      lines: [
        '这是鲛人们第一次围坐在同一张石桌旁。',
        '集中食物、分配任务、解决分歧……文明从这里开始。'
      ],
      unlockTitle: '市政系统已开放',
      unlockCopy: '现在可以研究市政、选择政体，并装配政策卡。',
      ok: '进入市政页',
      onOk: function () { if (S === s) setTab('civic'); }
    });
  }

  function maybeFaithPopup(s) {
    if (!s || s.faithPopup || !SB.economy || !SB.economy.resUnlocked || !SB.economy.resUnlocked(s, 'faith')) return;
    s.faithPopup = true;
    markDirty();
    queueStory({
      kind: 'faith', icon: '✧', title: '信仰页解锁',
      lines: [
        '祭司把潮汐、族民与深海火光刻在同一张薄石板上。',
        '但为何每一位祭司对此都有不同的理解呢？'
      ],
      unlockTitle: '信仰系统已开放',
      unlockCopy: '现在可以查看信仰产出、全局加成，并为你的宗教命名。',
      ok: '进入信仰页',
      onOk: function () { if (S === s) setTab('faith'); }
    });
  }

  /* ══ 更新日志提示（2026-10-28 用户拍板：**不再自动弹窗**，改成红点）════════════════
   * 【形态】meta.seenVersion ≠ CFG.VERSION ⇒ 页脚「更新日志」按钮右上角亮一个红点
   *   （class `.btn.has-new`，样式在 css/00-core.css）。玩家自己点开面板 → 记 seenVersion、
   *   熄红点。「更新日志」按钮本身随时可点，不因为已读就消失。
   * 【为什么不再弹】自动弹窗（2026-10-11 立 / 2026-10-25 删 / 2026-10-27 恢复）会在启动
   *   那一刻抢焦点，与「iOS 玩家卡在更新日志点不动」的事故纠缠难分；红点零打扰、不遮挡、
   *   不参与 #modal 竞争，信息也不丢。
   * ⚠️ 用 === 全等比较，不做版本号大小解析：版本名口径已由 v0.MAJOR.MINOR 改为 Ver1.0.x，
   *   解析比较会跟着格式变，全等「名字变了就亮」最稳。
   * ⚠️ 红点**不写 meta**：只有玩家真的点开面板才算「已读」。不点开就没看过，不该算读过
   *   （旧实现是弹完立刻记，玩家秒关窗也算读，正是这套逻辑让「没读到」变成「永远看不到」）。
   * ⚠️ **刻意不依赖存储判断「本会话是否已读」**：seenVersion 写在 localStorage（meta），
   *   而小游戏容器可能「写进去、重载后读不回来」⇒ 每轮启动都判「该版本首次进入」。所以
   *   额外的 `changelogSigned` 是内存态兜底：本会话点开过就一定熄灯，不等存储生效。
   * ⚠️ 红点与解锁叙事/新手引导**互不影响**：那两项仍是启动自动弹（玩家明确要求恢复），
   *   红点是纯视觉角标、不抢焦点、不进 #modal 队列，两者各走各的。 */
  var changelogSigned = false;   // 本会话是否已读（内存态，防存储回读失败导致红点复活）
  function hasUnreadChangelog() {
    if (changelogSigned) return false;
    if (!meta || !SB.CFG || !SB.CFG.VERSION) return false;
    return meta.seenVersion !== SB.CFG.VERSION;
  }
  /* 红点开关：只切 class，样式全在 CSS 里。每次现取 DOM，不缓存引用 ——
   *   bootUi 之前 pump 也可能补跑（页脚节点是静态的，但引用没必要跨模块持有）。 */
  function syncChangelogDot() {
    var btn = document.getElementById('btnChangelog');
    if (!btn || !btn.classList) return;
    btn.classList.toggle('has-new', hasUnreadChangelog());
  }
  /* 玩家真的打开了面板：此刻才算「已读」。 */
  function markChangelogSeen() {
    changelogSigned = true;
    syncChangelogDot();
    if (!meta || !SB.CFG || !SB.CFG.VERSION) return;
    if (meta.seenVersion === SB.CFG.VERSION) return;
    meta.seenVersion = SB.CFG.VERSION;
    SB.state.saveMeta(meta);
  }

  function maybeWorkshopPopup(s) {
    if (!s || s.workshopPopup || !(s.lvl && s.lvl.workshop > 0)) return;
    s.workshopPopup = true;
    markDirty();
    queueStory({
      kind: 'workshop', icon: '⚒', title: '工坊页解锁',
      lines: [
        '砧、锤、绳索与熟稔运用的匠人。',
        '如果一件工具能替我们重复昨天的动作，是不是也能用来做新的创造？'
      ],
      unlockTitle: '工艺制作已开放',
      unlockCopy: '现在可以制造工艺品、购买职业工具，并安装永久升级。',
      ok: '进入工坊',
      onOk: function () { if (S === s) setTab('workshop'); }
    });
  }

  function maybeWonderPopup(s) {
    if (!s || s.wonderPopup || !(s.techs && s.techs.masonry)) return;
    s.wonderPopup = true;
    markDirty();
    queueStory({
      kind: 'wonder', icon: '✦', title: '奇观页解锁',
      lines: [
        '十余名石工师把蓝图摊在石台上，最终成品的线条一路越过了整座巢穴。'
      ],
      unlockTitle: '奇观蓝图已揭晓',
      unlockCopy: '现在可以查看并建造独特奇观；建成后将永久留存并提供增益。',
      ok: '进入奇观页',
      onOk: function () { if (S === s) setTab('wonder'); }
    });
  }

  /* 星图页开门叙事（2026-10-24 用户补：此前星图虽拆出页签 + 门，却无解锁弹窗）。
   * 门 = syncTabLocks 里 star-map 的同一判据（壳已破、壳归 0）；一次性旗标存 run，
   * 离线/读档靠 maybeTabUnlockPopups 的兜底补播。 */
  function maybeStarMapPopup(s) {
    if (!s || s.starMapPopup) return;
    if (!((s.shellOpened || s.breakSettled) && s.shell <= 0)) return;
    s.starMapPopup = true;
    markDirty();
    queueStory({
      kind: 'star-map', icon: '✦', title: '星图页解锁',
      lines: [
        '自鲛人首次抬头望向头顶的天壳，已经过去了不知多少岁月。',
        '但在今天，他们首次望见了冰层后闪熠的群星。'
      ],
      unlockTitle: '星图系统已开放',
      unlockCopy: '现在可以查看欧罗巴、土星，以及本周目已经发射的卫星和空间站。',
      ok: '进入星图页',
      onOk: function () { if (S === s) setTab('star-map'); }
    });
  }

  /* 公司页开门叙事（2026-10-24 用户补：maybeCompanyFound 只管成立公司、从不弹窗）。
   * 门 = 拥有《宏观经济学》（与 syncTabLocks / companyReqMet 同源）。 */
  function maybeCompanyPopup(s) {
    if (!s || s.companyPopup) return;
    if (!(s.civics && s.civics.macroeconomics)) return;
    s.companyPopup = true;
    markDirty();
    queueStory({
      kind: 'company', icon: '🏢', title: '公司页解锁',
      lines: [
        '我们吃生物合成的鱼卵，吃在实验室里生长的海藻，该死，连光合作用都被注册了！'
      ],
      unlockTitle: '公司系统已开放',
      unlockCopy: '系统自动成立藻食与珊瑚两家公司，随成立时间成长，提供对应资源产出加成。',
      ok: '进入公司页',
      onOk: function () { if (S === s) setTab('company'); }
    });
  }

  function maybeTabUnlockPopups(s) {
    maybeCivicPopup(s);
    maybeFaithPopup(s);
    maybeWorkshopPopup(s);
    maybeWonderPopup(s);
    maybeStarMapPopup(s);
    maybeCompanyPopup(s);
  }

  /* 宗教弹窗（用户 2026-09-29）：建立宗教（神学完成）那一刻播一次叙事弹窗，
   * 并永久解锁「轮回」系统。写法刻意镜像 maybeSciencePopup——挂在泵上、记账先于弹窗、
   * 一次性置脏、离线/读档都靠同样的兜底补播。
   * 【触发点 = 玩家写入宗教名】「建立宗教」= 玩家在命名框敲下第一个名字的那一刻，
   *   而不是神学完成——神学只是点亮命名框的前置。把弹窗挂在对 `s.religionName`
   *   非空的判据上，并在 input.js 的命名框 change 里即时调用，覆盖在线；
   *   泵与读档兜底则保证程序化写入 / 老档也能补播。
   * 【记账先于弹窗】同科技弹窗同理：置位放回调之前，避免同一帧第二次泵又弹一遍。
   * 【永久解锁】religionSeen 写进 meta（跨周目），之后每周目重新命名也不会再弹。 */
  function maybeReligionPopup(s) {
    if (!s || !(s.religionName && s.religionName.trim())) return;
    if (meta.religionSeen) return;
    meta.religionSeen = true;
    /* 2026-10-24 成就「立教」（docs/ACHV_DESIGN_v0.3.md §四·6）：与 religionSeen 首真同点位，
     * 与「最快立教」榜同一判据。记账先于弹窗（同本条注上方纪律）。 */
    if (SB.achv) SB.achv.unlockOnce('religion', meta);
    SB.state.saveMeta(meta);
    markDirty();
    queueStory({
      title: '轮回系统解锁',
      lines: [
        '鲛人的诵经声伴随深海的浪潮传遍王国的角落，',
        '祭司们说周期性的暖流与浪潮象征着文明的轮回……',
        '从此，每一次终结这一局都将开启一段新的轮回——轮回点可在轮回商店换取永恒的增益。'
      ],
      ok: '了解'
    });
    /* 「最快立教」榜（平台榜名「最快建立文明」）：religionSeen 首次置真即快照当前墙钟。
     * ⚠️ 只提交一次 —— religionSeen 是跨周目永久字段，第二次进来直接 return，
     *   所以天然只报「历史最早那一局」，与 calcType='best' 的意图一致。
     * ⚠️ 榜 ID 未回填时submitRun 内部会跳过，线上不产生任何请求。 */
    submitRankFirstFaith(s);
  }

  /* ---- 排行榜提交（2026-10-07）----
   * 全部走 SB.rank 的空值兜底：榜 ID 未回填 ⇒ 内部跳过，不请求、不报错、不显示入口。
   * ⚠️ 提分口径集中在 submitRankOnBreak 一处，改榜单口径只改那里。 */

  /* 建立宗教那一刻：报 firstFaith（墙钟秒，整数）。 */
  function submitRankFirstFaith(s) {
    if (!SB.rank) return;
    SB.rank.submitRun([{ key: 'firstFaith', value: s && s.wallT }]);
  }

  /* 命名政体（ERA6 · 神恩与威权 / 层级理论 / 权责对等）：采用这三个新政体之一且尚未起名时，
   *   弹窗让玩家给政体起名（显示名 = 玩家名 + 后缀：教权国 / 联盟 / 联邦；城堡随之更名）。
   * ⚠️ 无 DOM 环境（e2e 沙箱）直接 return —— 不写 govName、不报错，命名是纯 UI 行为。
   * ⚠️ 复用 #modal / #modalBox 遮罩 + data-modal-close 关闭通道（与排行榜选择面板同款）。 */
  var pendingGovName = null;
  function maybeGovNamingPopup(s, govId) {
    if (!s || (s.govName && s.govName.trim())) return;
    if (typeof document === 'undefined') return;          // e2e / 无 DOM 跳过
    var modal = document.getElementById('modal');
    var box = document.getElementById('modalBox');
    if (!modal || !box) return;
    pendingGovName = { s: s, gov: govId };
    var suf = (SB.civic && SB.civic.govTitleSuffix) ? SB.civic.govTitleSuffix(govId) : '';
    box.innerHTML =
      '<div class="modal-hd"><b>命名你的' + suf + '</b>' +
        '<button type="button" class="modal-x" data-modal-close="1" aria-label="关闭">×</button></div>' +
      '<div class="modal-bd"><p>为你的' + suf + '起一个名字（最多 16 字）：</p>' +
        '<input id="govNameInput" type="text" maxlength="16" placeholder="如：深渊" autocomplete="off" />' +
        '<div class="chg-foot"><button type="button" class="btn" id="govNameOk">确定</button></div></div>';
    var ok = document.getElementById('govNameOk');
    if (ok) ok.onclick = confirmGovName;
    if (SB.ui.render.resetModalChrome) SB.ui.render.resetModalChrome();
    modal.classList.remove('hidden');
    if (document.body) document.body.classList.add('modal-open');   // body.modal-open 复用 tab 禁用规则
    var inp = document.getElementById('govNameInput');
    if (inp) inp.focus();
  }
  function confirmGovName() {
    var t = pendingGovName; pendingGovName = null;
    if (!t) return;
    var inp = document.getElementById('govNameInput');
    var nm = inp ? (inp.value || '').trim() : '';
    if (!nm) {
      var suf = (SB.civic && SB.civic.govTitleSuffix) ? SB.civic.govTitleSuffix(t.gov) : '';
      nm = '无名' + (suf || '之国');
    }
    t.s.govName = nm.slice(0, 16);
    markDirty();
    var modal = document.getElementById('modal');
    if (modal) { modal.classList.add('hidden'); if (document.body) document.body.classList.remove('modal-open'); }
  }

  /* 公司系统（ERA6 市政《宏观经济学》解锁）：宏观经济学完成那一刻自动成立藻食/珊瑚两家公司。
   * 行业池与名字池在 src/companies.js（独立数据层，日后加行业只改那一处）。
   * ⚠️ 2026-10-13 改「单独关闭」：逐家公司独立判定 —— 每家只在「未成立且未被玩家解散」时自动成立，
   *   玩家已解散的那家（companyState[res].closed=true）绝不自动复建，必须手动「重建」。
   * 触发点 = 检测到 s.civics.macroeconomics 为真；泵每 TECH_PUMP 秒扫一次，逐家补成立。
   * 离线补算不跑本系统（与自动升级/自动制作同一道「只在线」闸门），但读档后下一趟泵会补成立。 */
  function maybeCompanyFound(s) {
    if (!s) return;
    if (!(s.civics && s.civics.macroeconomics)) return;
    if (!SB.COMPANIES) return;
    if (!s.companyNames) s.companyNames = {};
    var any = false;
    for (var i = 0; i < SB.COMPANIES.length; i++) {
      var c = SB.COMPANIES[i];
      /* 逐家前置（科技/市政）：公司本身需《宏观经济学》(ERA6) 已解锁，req 须 ERA6 以后。
       * 前置未满足 ⇒ 不自动成立（等玩家研究到该科技/市政，下趟泵再补成立）。 */
      if (SB.companyReqMet && !SB.companyReqMet(s, c)) continue;
      var st = SB.companyState ? SB.companyState(s, c.res) : null;
      if (!st) continue;
      if (st.closed) continue;                // 玩家已解散 ⇒ 不自动复建，等手动「重建」
      if (st.epoch && st.epoch > 0) continue; // 已成立，跳过
      st.epoch = s.t || 0;
      if (!s.companyNames[c.res]) s.companyNames[c.res] = SB.pickCompanyName(c.res);
      any = true;
    }
    if (any) markDirty();
  }

  /* ---- 定期上报（2026-10-11 用户拍板「过一段时间就自动报一次」）----
   * 只报 3 个数值榜：dev / wonder / cycle。它们是「当前快照」，平台 calcType='best'
   * 保留历史最高分 ⇒ 周期重报只会往上走，不会污染。
   * ⛔ 时间榜（fastest / firstFaith）绝不走这条路：重复提交会用更慢的时间覆盖
   *   历史最佳，而平台对 asc+best 的合并语义不可证——冒这个险不值。
   *   它们保持里程碑触发（立教 / 破壳），口径不变。
   * 节流双闸：① RANK_PERIOD 墙钟 5 分钟（主循环只在活跃时跑 ⇒ 后台标签页天然不报）；
   *           ② 值比上次实发的高才发（三个口径都单调不减），零变化不发请求。
   * rankLast 与破壳上报共用：submitRankOnBreak 发出的值也记进来，避免结算后重复发。
   * 口径：dev/wonder 与破壳完全一致（breakReport 复算 / countWonders）；
   *   cycle 用 m.cycle（当前周目编号，= 破壳时上报值 −1 的同一把尺子，玩家破壳后自然对齐）。 */
  var RANK_PERIOD = 5 * 60 * 1000;   // 5 分钟墙钟
  var rankLast = {};                 // key -> 上次实发的整数值（floor 后，与 toScore 同规）

  function submitRankPeriodic() {
    if (!S || !SB.rank || !(SB.rank.available && SB.rank.available())) return;
    var r = (SB.prestige && SB.prestige.breakReport) ? SB.prestige.breakReport(S) : null;
    var m = SB.game.meta ? SB.game.meta() : {};
    var entries = [];
    var dev = r ? Math.floor(r.developmentScore || 0) : 0;
    if (dev > (rankLast.dev || 0)) entries.push({ key: 'dev', value: dev });
    var w = countWonders(S);
    if (w > (rankLast.wonder || 0)) entries.push({ key: 'wonder', value: w });
    var c = m.cycle || 0;
    if (c > (rankLast.cycle || 0)) entries.push({ key: 'cycle', value: c });
    /* 最多轮回点：累计获得量单独记账，兑换往返不会重复计入 ⇒ calcType:best 取历史最大。
     * 入口 4→5 项仍 ≤ submitScores 单次 5 条上限（破壳上报走另一条 5 条专用路径）。 */
    var td = Math.floor(m.tideEarnedTotal || 0);
    if (td > (rankLast.tide || 0)) entries.push({ key: 'tide', value: td });
    var star = Math.floor((m.stardustEarned || 0));
    if (star > (rankLast.star || 0)) entries.push({ key: 'star', value: star });
    if (!entries.length) return;
    for (var i = 0; i < entries.length; i++) rankLast[entries[i].key] = entries[i].value;
    SB.rank.submitRun(entries, function (done, sent) {
      if (root.console && sent > 0) root.console.log('[rank] 定期上报：算得出 ' + done + ' 项，实发 ' + sent + ' 条');
    });
  }

  /* 破壳结算那一刻：一次性提交（fastest/wonder/cycle/star/tide 共 5 项，正好卡在 submitScores 的 5 条上限）。
   * ⛔ 通关口径（用户 2026-10-07 拍板）：**只认「凿穿 + 已建神学」**。
   *   依据 prestige.qualified(s) = !!s.civics.theology —— 壳凿穿但没建神学的局
   *   r.locked=true、轮回点归 0，那种局不该出现在「最快通关」榜首。
   *⚠️ 用 wallT 而非 s.t：s.t 是逻辑秒、吃倍速，广告 2× 会让时间腰斩。
   *⚠️ dev（综合发展分）从本路径移除、改走 submitRankPeriodic（同样单调不减、5 分钟节流），
   *   把第 5 个配额让给 tide（最多轮回点），使破壳即时上榜。 */
  function submitRankOnBreak(s, report) {
    if (!SB.rank || !report) return;
    var m = SB.game.meta ? SB.game.meta() : {};
    /* 2026-10-27：这条注释一直写「只认『凿穿 + 已建神学』」，但判据此前只做了「已建神学」。
     * 于是「研究完神学就提前轮回」（六态里的合法路径，壳可能还剩几十万）也会提交 fastest，
     * 「最快通关」榜能被几分钟一局的提前轮回刷掉。report.wasOpened 由 prestige.doBreak
     * 在改状态**之前**快照（= 当时 shell<=0），正常破壳恒真、提前轮回恒假。 */
    var valid = !report.locked && report.wasOpened === true;
    var entries = [];
    if (valid) {
      entries.push({ key: 'fastest', value: s.wallT });
    }
    /* 这三个不依赖「有效通关」：建成即算，锁不锁都有意义。 */
    entries.push({ key: 'wonder', value: countWonders(s) });
    entries.push({ key: 'cycle', value: (m.cycle || 0) + 1 });
    entries.push({ key: 'star', value: Math.floor((m.stardustEarned || 0)) });   // 最多星屑：累计获得量（与「最多轮回点」用 tideEarnedTotal 同口径）；calcType:best 自动取历史最大
    /* 最多轮回点：累计获得量单独记账，兑出再兑回不改变总获得数。占满第 5 条配额。 */
    entries.push({ key: 'tide', value: Math.floor(m.tideEarnedTotal || 0) });
    /* 记入定期上报的去重表：破壳刚发过的高值，5 分钟后的定期拍就不会重发同值。 */
    for (var i = 0; i < entries.length; i++) rankLast[entries[i].key] = Math.floor(entries[i].value);
    SB.rank.submitRun(entries, function (done, sent) {
      if (root.console && sent > 0) {
        root.console.log('[rank] 破壳提交：算得出' + done + ' 项，实发 ' + sent + ' 条');
      }
    });
  }

  function countWonders(s) {
    var n = 0;
    if (s && s.wonders) for (var k in s.wonders) if (s.wonders[k]) n++;
    return n;
  }

  // ---- 主循环（墙钟驱动）----
  var last = 0;
  var STEP = 0.1;                   // 逻辑步长（秒）。与渲染解耦，保证数值与帧率无关
  var FAST_SPEED_THRESHOLD = 10;    // 高倍速改走既有离线分段积分器，避免每 0.1 秒重算整套经济
  var OFFLINE_STEP = (SB.CFG && SB.CFG.OFFLINE_STEP != null) ? SB.CFG.OFFLINE_STEP : 2;  // 单一来源：只读 src/config.js 的 CFG.OFFLINE_STEP，避免两套常量漂移
  /* 2026-10-24 分级离线（用户拍板）：离开多久以内算「短暂」⇒ 静默补算（不弹闸门 / 结算）。
   * 单一来源同 OFFLINE_STEP：只读 src/config.js 的 CFG.OFFLINE_SETTLE_MIN；
   * e2e 沙箱里 SB.CFG 可能未注入全，兜底 1800 与 config 保持一字不差。 */
  var OFFLINE_SETTLE_MIN = (SB.CFG && SB.CFG.OFFLINE_SETTLE_MIN != null) ? SB.CFG.OFFLINE_SETTLE_MIN : 1800;
  /* 时间真值有两个：
   *   ① 墙钟（Date.now）→ 用来判断「玩家离开过多久」，补算离线收益；
   *   ② 帧钟（performance.now）→ 用来决定这一帧推进多少逻辑时间。
   * 以前只跑「回调次数 × 固定步长」，后台标签页里浏览器把定时器节流到 1 次/秒
   * （Chrome 满 5 分钟进一步降到约 1 次/分），时间就跟着被稀释甚至冻住。 */
  var MAX_STEP = 5;                 // 单次回调最多推进 5 秒逻辑时间，防止切回前台一次算爆
  var CATCHUP_BUDGET = 225;         // 离线补算每帧的毫秒预算（占空比 = 225 ÷ 主循环间隔250ms = 90%，与旧 100ms/90 同比例，补算墙钟耗时不变）
  /* ⚠️ 2026-10-13 50→90（用户拍板「ab一起做」的 A 项）：补算期间整个界面被离线闸门
   *   modal 锁死、无需交互响应，50 当年是保守占位（见 planCatchUp 注的历史：8 时曾 12.5×）。
   *   90 ⇒ 墙钟 ≈ 纯算量 ÷ 0.9，8h 满档桌面从 ~45s 压到 ~25s（叠加 tech.mul 记忆化后更低）。
   * ⚠️ 2026-10-20 B 项省电：主循环 100ms→250ms，CATCHUP_BUDGET 同比例 90→225 保住 90% 占空比。 */
  var PANE_REFRESH = 2000;          // 面板（整块重画那种）的刷新周期，毫秒 **墙钟**
  var TICK_MS = 250;                // 主循环间隔（2026-10-20 B 项省电：10Hz→4Hz）。模拟靠 loop.acc 墙钟累加器驱动，降频不影响推进速度。

  function loop() {
    var now = (root.performance && performance.now) ? performance.now() : Date.now();
    var wall = Date.now();
    var batchStart = now, batchTicks = 0, batchFastTicks = 0;
    var batchGameStart = S && S.t;
    if (!last) last = now;

    /* 浏览器会把后台标签页的 interval 降到每分钟一次。AI 正在运行时，这段间隔
     * 仍应按当前游戏倍速结算；否则页面一隐藏就被误当成普通离线，回到 1×并弹出
     * 离线结算遮罩。只认浏览器内 AI 的运行状态，不改变暂停 AI 时的离线规则。 */
    var aiRunning = !!(SB.aiPlayer && SB.aiPlayer.isRunning && SB.aiPlayer.isRunning());
    var hiddenAI = !!(document && document.hidden && aiRunning);
    var resumedHiddenAI = !!(!document.hidden && loop._lastAiHidden && aiRunning);
    var acceleratedBackgroundAI = hiddenAI || resumedHiddenAI;
    loop._lastAiHidden = hiddenAI;

    /* 离开过的间隙：后台期间定时器基本不跑，这里在下次回调时才算得出来，
     * 于是「离线补算」和「切回前台补算」是同一条路径。 */
    if (S && !S.broken && loop._lastWall) {
      var gap = (wall - loop._lastWall) / 1000;
      /* 2026-10-24 分级离线：gap ≥ OFFLINE_MIN 都要补算（挂机收益一分不少），
       * 但 gap < OFFLINE_SETTLE_MIN（30min，用户拍板）时静默补算——
       * 回个消息、切窗几分钟不该被「离线结算三连」糊脸。 */
      if (gap >= SB.CFG.OFFLINE_MIN && !loop.job && !acceleratedBackgroundAI) {
        planCatchUp(S, gap, gap < OFFLINE_SETTLE_MIN);
      }
    }
    if (loop.job) drainCatchUp(CATCHUP_BUDGET);
    loop._lastWall = wall;

    /* 排行榜墙钟计时（wallT）：**真实流逝秒**，不吃游戏倍速。
     * ⚠️ 为什么不能用上面的 elapsed：它被 MAX_STEP 截断（单帧最多 5 秒），
     *   拿它累加会在卡顿/切后台时少算时间。
     * ⚠️ 为什么不用 s.t：那是逻辑秒，吃倍速（广告 2× 等），拿它当「最快通关」
     *   等于奖励氪金与挂机。
     * ⚠️ 离线也照涨（游戏本就支持离线补算）；要「有效游玩时长」得再扣离线段，那是另一口径。
     * ⚠️ 补算期间（loop.job）同样要涨 —— 墙钟确实在走，且 offlineCap 已封顶。 */
    if (S && !S.broken && loop._wtPrev) {
      var wtGap = (wall - loop._wtPrev) / 1000;
      /* 上限守卫：单次差值超过 1 天基本是机器被挂起/系统休眠了，那段时间不该算成绩。
       * ⚠️ 门槛用字面量 86400而不是 SB.CFG.OFFLINE_MIN —— 后者语义是
       *   「间隙多久才算离线补算」（60秒），拿来当墙钟累加上限是两个不同的东西。
       *   （e2e沙箱里 SB.CFG 可能未注入全，别在首帧热路径上依赖它做除零/比较。） */
      if (wtGap > 0 && wtGap < 86400) S.wallT += wtGap;
    }
    loop._wtPrev = wall;

    /* 定期排行榜上报（见 submitRankPeriodic 注释）：启动后 ~60s 先发一次
     * （_rankWall 预回拨 PERIOD−60s），老玩家的历史轮回数/发展分尽快上榜；
     * 之后每 5 分钟墙钟一拍。离线补算期间（loop.job）跳过——补算完的下一拍马上会报。 */
    if (S && !loop.job) {
      if (!loop._rankWall) loop._rankWall = wall - RANK_PERIOD + 60000;
      if (wall - loop._rankWall >= RANK_PERIOD) { loop._rankWall = wall; submitRankPeriodic(); }
    }

    var rawElapsed = Math.max(0, (now - last) / 1000);
    var elapsed = Math.min(acceleratedBackgroundAI ? SB.CFG.OFFLINE_MIN : MAX_STEP, rawElapsed);
    last = now;
    /* 广告时间银行按**真实墙钟**流逝（不看倍速）：开着开关且还有余额时，这一帧扣掉 elapsed 毫秒。
     * 扣到 0 的那一帧置脏一次，让顶栏立刻从「2× 生效」翻成「无加速」。开关关着时冻结余额 = 囤着不用。 */
    /* 广告时间银行按**真实墙钟**流逝（不看倍速）：开着开关且还有余额时，这一帧扣掉 elapsed 毫秒。
     * 扣到 0 的那一帧置脏一次，让顶栏立刻从「2× 生效」翻成「无加速」。开关关着时冻结余额 = 囤着不用。
     * ⚠️ 只在**在线**扣：离线补算期间（loop.job=true）由 drainCatchUp 按真实离线秒统一扣减（且吃 2×），
     *    这里加 !loop.job 守卫，避免离线时既被 nibble 又不给 2× 进度的双重错账。 */
    if (!loop.job && S && !S.broken && S.ad && S.ad.on && S.ad.ms > 0) {
      var adWas = S.ad.ms > 0;
      S.ad.ms = Math.max(0, S.ad.ms - elapsed * 1000);
      if (adWas && S.ad.ms === 0) dirty = true;
    }
    var frameGameSeconds = elapsed * speed * adMul();
    var backlogCap = acceleratedBackgroundAI
      ? Math.max(SB.CFG.OFFLINE_MIN, frameGameSeconds)
      : Math.max(MAX_STEP, SB.CFG.OFFLINE_MIN);
    loop.acc = Math.min((loop.acc || 0) + frameGameSeconds, backlogCap);
    var fastOnline = speed >= FAST_SPEED_THRESHOLD && SB.offline && SB.offline.integrateFoodPop;
    var fastClock = fastOnline ? { tp: loop._tp || 0 } : null;
    /* 补算进行中时暂停实时推进：这段墙钟时间已经在补算里算过了，
     * 再叠加实时 tick 就是重复计时。 */
    while (!loop.job && loop.acc >= STEP && S && !S.broken) {
      var onlineDt = STEP;
      if (fastOnline) {
        /* 30× 在线要求约 300 个完整 economy.tick/秒；浏览器主线程追不上时，
         * loop.acc 会顶到 60 秒上限并丢掉新增时间。复用离线已在用的事件分段：
         * 每段至多 OFFLINE_STEP，且在季节、生育、饥荒、保温阈值和 2 秒自动化泵处切开；
         * 经济资源仍走同一个 tick，食物/人口走与 0.1 秒参考路径对齐的积分器。
         * 这只在高倍速启用；1×至 9×仍保留逐 0.1 秒精确路径。 */
        onlineDt = offlineStep(S, fastClock, loop.acc);
        var onlineT0 = S.t;
        SB.economy.tick(S, onlineDt, emit, { skipFoodPop: true, skipHappy: true });
        if (!S.broken) SB.offline.integrateFoodPop(S, onlineDt, { t0: onlineT0 }, emit);
        batchFastTicks++;
      } else {
        SB.economy.tick(S, onlineDt, emit);   // 天壳推进在 tick 内完成（基础削壳 + 祭坛削壳）
      }
      batchTicks++;
      /* ERA4（2026-10-01）：换季发放资源。标记在 tick 内由 economy.seasonTurn 置位，
       * 这里在 tick 返回后、状态已自洽处发放——避免在 tick 内 call rates() 触发原生段错误。 */
      if (S._seasonGrantPending) { SB.economy.seasonGrant(S); S._seasonGrantPending = false; }
      loop.acc -= onlineDt;
      if (fastOnline) fastClock.tp += onlineDt;
      else loop._tp = (loop._tp || 0) + onlineDt;
      var pumpDue = fastOnline ? fastClock.tp >= TECH_PUMP - 1e-9 : loop._tp >= TECH_PUMP;
      if (pumpDue) {
        if (fastOnline) fastClock.tp = Math.max(0, fastClock.tp - TECH_PUMP);
        else loop._tp = 0;
        pumpTech(S, emit); pumpCivic(S, emit);
        /* 轮回商店自动研究：沿用两类节点的标准门禁；只在在线逻辑泵运行，离线不替玩家投入科技/市政点。 */
        if (SB.autoResearch && SB.autoResearch.tick) SB.autoResearch.tick(S, meta, emit);
        maybeReligionPopup(S); maybeCompanyFound(S); maybeTabUnlockPopups(S);
        /* 区域建筑自动建造/升级：只挂在线泵——离线补算（line ~363）
         * 不调它，离线只结算产出、不替玩家花资源（与离线闸门同一精神）。 */
        if (SB.habitat && SB.habitat.autoTick) SB.habitat.autoTick(S, emit);
        /* 工坊自动制作槽（2026-10-07）：与生息区自动升级同一拍、同一道「只在线」闸门 ——
         * 离线补算不替玩家把原料转成制品（离线只结算产出）。语义见 workshop.autoTick。 */
        if (SB.workshop && SB.workshop.autoTick) SB.workshop.autoTick(S, emit);
      }
    }
    if (fastOnline) loop._tp = fastClock.tp;
    loop._lastBatchTicks = batchTicks;
    loop._lastBatchFastTicks = batchFastTicks;
    loop._lastBatchMs = Math.max(0, ((root.performance && performance.now) ? performance.now() : Date.now()) - batchStart);
    loop._lastBatchSimSeconds = S && typeof batchGameStart === 'number' ? Math.max(0, S.t - batchGameStart) : 0;

    /* 星空槽推进（2026-10-13 镜像破壳：破壳后由文明推力被动累积到 STAR_CAP）。
     * ⚠️ 不能放 economy.tick 里——tick 在 s.broken 时顶部直接早退（1335 行），破壳后那条路径不跑。
     *   故挂在这里：只要 S 存在就按真实帧时推进；tickStar 内部判 !broken → 早退（破壳前不累积）。
     *   离线补算走 drainCatchUp（同语义、按真实离线秒推进）。 */
    /* 未结算的破壳选择期间冻结星空槽；玩家选择留在本局后才继续推进。 */
    if (S && !(S.broken && S.shellOpened && !S.breakSettled))
      SB.shell.tickStar(S, elapsed * speed * adMul(), emit);

    if (S && !S.broken) {
      /* 点击时间事件（天壳震动等）：只在线推进——离线补算 drainCatchUp 不跑本系统。
       * 用墙钟节流（events.update 内部），不随倍速放大。事件模块自带独立 RNG，不碰 SB.rng。 */
      if (SB.events) SB.events.update(S, emit);
      /* 自动拾取点击事件（轮回商店 autoEvent）：只在线（!loop.job）。出现即领，玩家无需点 #omen 横幅。 */
      if (!loop.job && SB.autoplay) SB.autoplay.autoEventClaim(S, emit);
      /* 面板读数的周期刷新：**墙钟** 2 秒一次，与倍速无关。
       * 【为什么不在泵里顺手置脏】泵按逻辑秒节流，10× 速下等于 0.2 秒一趟，
       * 那是拿「整块重建五个 pane（含 33 个节点的科技长卷）」当代价去刷几个数字，
       * 既把长卷的横向位置冲掉、又会吃掉点击（见 pumpTech 的注释）。
       * 这里用 now（帧钟）而不是逻辑时间：倍速只该加快世界，不该加快 UI 重建。
       * renderTick 仍然是每帧（100ms）走的便宜通道：顶栏、天壳、环境卡、生育条。 */
      if (!dirty && now - (loop._lastPane || 0) >= PANE_REFRESH) {
        loop._lastPane = now; dirty = true;
      }
      if (dirty) renderAll(); else SB.ui.render.renderTick();
      /* 新手引导走查：每帧（或每 2 秒 pane 刷新）评估推进条件并重定位高亮。
       * 无 DOM / 未激活时内部早退，不影响正常循环与 e2e。 */
      if (SB.onboarding && SB.onboarding.tick) SB.onboarding.tick(S);
      /* 自动采集点击（轮回商店 autoClick，N 次/真实秒）：只在线（!loop.job），用帧钟 elapsed 累计，
       * 不随倍速放大——倍速只加快世界、不加快自动点击节奏。 */
      if (!loop.job && SB.autoplay && SB.autoplay.autoClick) SB.autoplay.autoClick(S, elapsed, emit);
    }
    // 存档节流：localStorage 写入较贵，5 秒一次足够
    if (S && !S.broken && now - (loop._lastSave || 0) > 5000) {
      loop._lastSave = now;
      SB.state.saveRun(snapshot(S));
    }
  }

  function offlineCap(s) {
    var step = SB.CFG.OFFLINE_PERK_STEP || 0;
    var lv = (s && s.perk && s.perk.offline) || 0;
    return SB.CFG.OFFLINE_CAP * (1 + step * lv);
  }
  function fmtDur(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h > 0 ? h + ' 小时 ' + m + ' 分' : m + ' 分 ' + Math.floor(sec % 60) + ' 秒';
  }
  function RESS_KEYS() { return SB.RESS ? Object.keys(SB.RESS) : []; }

  /* 离线补算：稳定区间按事件边界批量调用经济 tick，
   * 季节、科技/市政泵、生育、饥饿死亡和食物耗尽处切开；最大步长与泵周期同为 2 秒。
   * 8 小时无暖石低库存段时，tick 调用从 288000 次降至约 14400 次（约 20×）；
   * 结果允许小幅近似误差，随机冻伤也按子步累计概率处理。
   * 仍拆成「计划 → 每帧只花 CATCHUP_BUDGET 毫秒 → 做完发一条播报」。
   * 墙钟耗时 = 纯算量 ÷ 占空比，占空比 = CATCHUP_BUDGET ÷ 主循环间隔(250ms)。
   *   CATCHUP_BUDGET=90 ⇒ 占空比约 90% ⇒ 纯算量摊到约 1.11 倍墙钟。
   * 配合 economy.tick 内聚合缓存（globalMul/gatherMul 等每 tick 只算一次）+
   * tech.mul 按 techVer 记忆化（2026-10-13，省掉每 tick 12 次全表重扫），
   * 当前调用量及与 0.1 秒基准的差异由 sim/offline-fastforward.mjs 对照。 */
  function planCatchUp(s, gap, silent) {
    var cap = offlineCap(s);
    var secs = Math.max(0, Math.min(gap, cap));   // 真实离线秒（已封顶）
    if (secs <= 0) return;
    var before = {}, k;
    for (k in s.res) before[k] = s.res[k];
    var adActive = !!(s.ad && s.ad.on && s.ad.ms > 0);  // 起点若双倍银行在线，整段按覆盖情况吃 2×
    loop.job = {
      s: s, left: secs, total: secs, secs: secs, cap: cap, adActive: adActive,
      uncountedSecs: Math.max(0, gap - secs),
      before: before, bPop: s.pop, bShell: s.shell,
      bFam: s.famineDeaths, bFrost: s.frostDeaths,
      silent: !!silent
    };
    /* 2026-10-24 分级离线（用户拍板 30min）：短暂离开走静默补算——不锁界面、不弹闸门。
     * gap < OFFLINE_SETTLE_MIN 时补算量只有几百毫秒（30min 游戏秒封顶，一帧无感），
     * 玩家回来直接接着玩；日志留一行备查，结算报告也不弹（短暂离开不需要汇报）。
     * ⚠️ 破壳 / 戴森这类终局事件照弹（finishCatchUp 的 breakReport 分支不读 silent）——
     *    那是里程碑时刻，不是「离开汇报」。 */
    if (loop.job.silent) {
      log('离开 ' + fmtDur(secs) + '，正在后台补算…' + (adActive ? '（双倍加速覆盖时段按 2×）' : ''));
      if (secs < gap) log('补算有上限（' + fmtDur(cap) + '），剩余 ' + fmtDur(gap - secs) + ' 不计。');
      return;
    }
    /* 离线闸门：补算期间锁住整个界面（#modal 全屏遮罩挡点击），不给确认按钮，
     * 强制等算完（用户 2026-09-29：「离线回来先算完才能操作」）。 */
    SB.ui.render.showOfflineModal({
      title: '离线进度补算中…',
      body: '<div class="note">正在补算你离开期间的进度（食物 / 饿死 / 生育 / 削壳 / 祭坛都包含，长时段按分段方式近似推进）。</div>' +
            '<div class="note" style="margin-top:8px;color:var(--dim)">离线时长 ' + fmtDur(secs) +
            (secs < gap ? '（封顶 ' + fmtDur(cap) + '，超出部分不计）' : '') +
            (adActive ? '（双倍加速生效中，覆盖时段按 2× 结算）' : '') + '</div>',
      showProgress: true
    });
    log('离线 ' + fmtDur(secs) + '，正在补算…' + (adActive ? '（双倍加速覆盖时段按 2×）' : ''));
    if (secs < gap) log('补算有上限（' + fmtDur(cap) + '），剩余 ' + fmtDur(gap - secs) + ' 不计。');
  }
  /* 分段快进：稳定区间最多跨过一个 2 秒泵周期；事件跨越点提前切开。
   * 暖石还会被熔炉等系统消耗。若本块其他暖石净消耗可能让保温库存跨过阈值，
   * 回到在线步长，使工业消耗与保温按同一时间顺序交错结算。 */
  function offlineStep(s, j, gameLeft) {
    var dt = Math.min(OFFLINE_STEP, gameLeft);
    var seasonLeft = SB.CFG.SEASON_TICKS - (s.t % SB.CFG.SEASON_TICKS);
    // tick 在推进 s.t 后换季，所以跨季的最后一个 0.1s tick 用新季倍率。
    // 留出这一步单独结算，避免整块 dt 在边界处提前套用新季节。
    if (seasonLeft > STEP + 1e-9) dt = Math.min(dt, seasonLeft - STEP);
    else if (seasonLeft > 1e-9) dt = Math.min(dt, STEP);
    var pumpLeft = TECH_PUMP - (j.tp || 0);
    if (pumpLeft > 1e-9) dt = Math.min(dt, pumpLeft);
    if (!SB.economy.isFull(s) && s.res.kelp > SB.CFG.GROW_KEEP) {
      var growLeft = SB.economy.growthDuration(s) - (s._grow || 0);
      if (growLeft > 1e-9) dt = Math.min(dt, growLeft);
    }
    if (s.res.kelp <= 0 && s.pop > 1) {
      var famineLeft = (60 - (s.famine || 0)) * STEP;
      if (famineLeft > 1e-9) dt = Math.min(dt, famineLeft);
    }
    var warmCold = s.warmOn && SB.economy.season(s.t).mult < 1;
    if (warmCold && s.warmOn && s.res.warmstone > 0) {
      var warmstoneRate = SB.economy.rates(s).warmstone || 0;
      var reliefRate = SB.economy.warmBurningNow(s) ? SB.CFG.WARM_RATE : 0;
      var otherDrain = Math.max(0, -(warmstoneRate + reliefRate));
      var warmBuffer = SB.CFG.WARM_RATE * (1 + dt) + otherDrain * dt;
      if (s.res.warmstone <= warmBuffer) dt = Math.min(dt, STEP);
    }
    return dt > 1e-9 ? dt : Math.min(gameLeft, STEP);
  }
  function drainCatchUp(budgetMs) {
    var j = loop.job; if (!j) return;
    if (j.s !== S) { loop.job = null; return; }   // 补算途中重开了周目，作废这一批
    var t0 = Date.now();
    /* 离线补算按「真实秒」记账、按事件块推进：每块最多 OFFLINE_STEP 个游戏秒，
     * 广告银行覆盖时按 2× 换算真实时长，并在余额归零处切段后回落 1×。
     * 旧循环每次只推进 1 个真实秒，导致 1× 时 dt 永远 <=1 秒；现在可跨真实秒批量结算。 */
    while (j.left > 0 && !j.breakReached && Date.now() - t0 < budgetMs) {
      var mul = adMul();
      var realChunk = j.left;
      if (mul > 1) realChunk = Math.min(realChunk, j.s.ad.ms / 1000); // 银行归零处切开
      var gameLeft = realChunk * mul;
      var realDone = 0;
      while (gameLeft > 1e-9 && !j.breakReached) {
        var dt = offlineStep(j.s, j, gameLeft);
        var t0 = j.s.t;
        // 食物/人口积分器在 0.1s 微步内自行推进 happyStep（与食物同栅格重采样），故 tick 侧
        // 同时跳过 food 与 happy（skipFoodPop + skipHappy），避免 happy/奢侈品被双重推进。
        SB.economy.tick(j.s, dt, null, { skipFoodPop: true, skipHappy: true, deferBreakUI: true });   // 其他资源/season/pump/shell 仍走原 tick；food/happy 交给积分器
        SB.offline.integrateFoodPop(j.s, dt, { t0: t0 }, null);  // 食物/人口 + 幸福度：事件边界闭式积分（替代 tick 内联 food/happy 段）
        if (j.s._seasonGrantPending) { SB.economy.seasonGrant(j.s); j.s._seasonGrantPending = false; }
        j.tp = (j.tp || 0) + dt;
        gameLeft -= dt;
        realDone += dt / mul;
        if (mul > 1) j.s.ad.ms = Math.max(0, j.s.ad.ms - dt / mul * 1000);
        if (j.tp >= TECH_PUMP - 1e-9) { j.tp = Math.max(0, j.tp - TECH_PUMP); pumpTech(j.s, null); pumpCivic(j.s, null); }
        if (j.s.broken && j.s.shellOpened && !j.s.breakSettled) {
          j.breakReached = true;
          break;
        }
        /* 星空槽在破壳后独立于 economy.tick 推进；按同一事件块累计，线性速率结果不变。 */
        SB.shell.tickStar(j.s, dt, null);
      }
      j.left = Math.max(0, j.left - realDone);
    }
    if (j.total && !j.silent) SB.ui.render.setOfflineProgress((j.total - j.left) / j.total);   // 静默补算没有闸门 modal 可报，跳过进度条
    if (j.left <= 0 || j.breakReached) finishCatchUp(j);
  }
  function finishCatchUp(j) {
    loop.job = null;
    var breakReport = null;
    if (j.s.broken && j.s.shellOpened && !j.s.breakSettled) {
      /* 破壳就是离线补算的终点：先保存状态并播放破壳动画，之后再进入离线结算。 */
      SB.state.saveRun(snapshot(j.s));
      renderAll();
      breakReport = SB.prestige.breakReport(j.s);
      if (!SB.prestige.qualified(j.s)) { breakReport.tidePoints = 0; breakReport.locked = true; }
    }
    /* 2026-10-24 分级离线：静默补算且无终局事件 ⇒ 不弹结算报告，日志一行交代完事。
     * 有 breakReport（离开期间破壳）时不走这里——破壳动画 + 结算窗照弹，见下。 */
    if (j.silent && !breakReport) { silentCatchUpSummary(j); return; }
    function showSettlement() { showOfflineSettlement(j, breakReport); }
    if (breakReport) SB.game.showBreakAnimation(breakReport, showSettlement);
    else showSettlement();
  }
  /* 静默补算的一句话交代：时长 + 超上限未计入 + 人口 / 饿死 / 冻死异动。
   * 资源明细不进日志——想要明细看面板即可，短暂离开不配一份小作文。
   * 收尾与非静默结算的 onOk 对齐：科研 / 宗教 / 解锁播报与戴森终局在补算期间是挂起状态
   * （drainCatchUp 里 pumpTech/pumpCivic 传 emit=null、dysonPopupPending 只挂旗），
   * 静默模式没有遮罩会盖它们，补算完立即补播，不等下一趟泵自愈。 */
  function silentCatchUpSummary(j) {
    var s = j.s, txt = '后台补算完成（离开 ' + fmtDur(j.secs) + '）';
    if (j.uncountedSecs > 0) txt += '，另有 ' + fmtDur(j.uncountedSecs) + ' 超出补算上限未计入';
    if (s.pop !== j.bPop) txt += ' · 族民 ' + j.bPop + '→' + s.pop;
    if (s.famineDeaths > j.bFam) txt += ' · 饿死 ' + (s.famineDeaths - j.bFam) + ' 人';
    if (s.frostDeaths > j.bFrost) txt += ' · 冻死 ' + (s.frostDeaths - j.bFrost) + ' 人';
    log(txt + '。');
    maybeSciencePopup(s); maybeReligionPopup(s); maybeTabUnlockPopups(s); markDirty(); fireDysonPending(j);
  }
  function fireDysonPending(j) {
    /* 离线补算期间达成的戴森竣工：结算窗关闭后再播胜利窗，避免被共用 #modal 的离线结算覆盖。
     * 见 economy-tick.js dysonDone 块 deferBreakUI 分支（离线只挂 dysonPopupPending，不置 seen）。
     * 破壳与竣工在同一段离线补算里互斥（破壳即终止补算），故不与 breakReport 叠加。 */
    if (!j || !j.s || !j.s.dysonPopupPending) return;
    var s = j.s;
    s.dysonPopupSeen = true;
    s.dysonPopupPending = false;
    var R = (SB.ui && SB.ui.render) ? SB.ui.render : null;
    if (!R) return;
    if (s.civics && s.civics.ascend_void && R.showAscendVoid) R.showAscendVoid(s);
    else if (R.showDysonComplete) R.showDysonComplete(s);
  }
  function showOfflineSettlement(j, breakReport) {
    var lines = [], resourceRows = [], overviewCards = '', incidentRows = '', any = false, rk = RESS_KEYS(), i, k, d;
    for (i = 0; i < rk.length; i++) {
      k = rk[i]; d = j.s.res[k] - j.before[k];
      if (Math.abs(d) >= 0.5) {
        var resourceName = SB.RESS[k].name, resourceDelta = (d >= 0 ? '+' : '') + d.toFixed(0);
        lines.push(resourceName + ' ' + resourceDelta);
        resourceRows.push('<div class="offline-resource-row ' + (d >= 0 ? 'is-gain' : 'is-loss') + '">' +
          '<span class="offline-resource-mark" aria-hidden="true"></span><span class="offline-resource-name">' + resourceName + '</span>' +
          '<strong>' + resourceDelta + '</strong></div>');
        any = true;
      }
    }
    if (j.s.pop !== j.bPop) {
      var popDelta = j.s.pop - j.bPop;
      lines.push('族民 ' + j.bPop + '→' + j.s.pop);
      overviewCards += '<article class="offline-stat-card"><span>族民</span><strong>' + j.s.pop + '</strong>' +
        '<small>离线前 ' + j.bPop + ' <b class="' + (popDelta >= 0 ? 'is-positive' : 'is-negative') + '">' +
        (popDelta >= 0 ? '+' : '') + popDelta + '</b></small></article>';
      any = true;
    }
    if (j.s.shell !== j.bShell) {
      var shellDelta = Math.round(j.s.shell) - Math.round(j.bShell);
      lines.push('壳厚 ' + Math.round(j.bShell) + '→' + Math.round(j.s.shell));
      overviewCards += '<article class="offline-stat-card"><span>壳厚</span><strong>' + Math.round(j.s.shell) + '</strong>' +
        '<small>离线前 ' + Math.round(j.bShell) + ' <b class="' + (shellDelta <= 0 ? 'is-positive' : 'is-negative') + '">' +
        (shellDelta > 0 ? '+' : '') + shellDelta + '</b></small></article>';
      any = true;
    }
    if (!overviewCards) overviewCards = '<div class="offline-stable-card"><span class="offline-stable-mark">✓</span>' +
      '<div><strong>人口与壳体保持稳定</strong><small>离线期间没有明显变化</small></div></div>';
    if (j.s.famineDeaths > j.bFam) {
      var famineDelta = j.s.famineDeaths - j.bFam;
      lines.push('饿死 ' + famineDelta);
      incidentRows += '<span class="offline-incident is-warning">口粮不足 · ' + famineDelta + ' 人</span>';
      any = true;
    }
    if (j.s.frostDeaths > j.bFrost) {
      var frostDelta = j.s.frostDeaths - j.bFrost;
      lines.push('冻死 ' + frostDelta);
      incidentRows += '<span class="offline-incident is-cold">冻死 · ' + frostDelta + ' 人</span>';
      any = true;
    }
    var noteRows = '';
    if (j.uncountedSecs > 0) noteRows += '<div class="offline-footnote">超出单次离线上限的 ' + fmtDur(j.uncountedSecs) + ' 未计入本次结算。</div>';
    var settledSecs = j.breakReached ? Math.max(0, j.secs - j.left) : j.secs;
    if (j.breakReached && j.left > 0) noteRows += '<div class="offline-footnote">破壳后剩余 ' + fmtDur(j.left) + ' 未继续补算。</div>';
    if (j.adActive) noteRows += '<div class="offline-footnote is-boost">双倍加速在离线期间生效，覆盖时段已按 2× 结算。</div>';
    var resourceContent = resourceRows.length ? resourceRows.join('') :
      '<div class="offline-empty-state">资源几乎没有变化</div>';
    var summaryText = any ? lines.join('，') : '资源几乎没变（没人干活，或产出被口粮吃光）';
    var summary = '<div class="offline-report">' +
      '<header class="offline-report-hero"><div class="offline-report-emblem" aria-hidden="true"><span>✦</span></div>' +
      '<div class="offline-report-heading"><span class="offline-report-kicker">ABYSSAL LOG · 离线记录</span>' +
      '<h2>离线结算</h2><p>你离开期间，文明仍在持续运转</p></div>' +
      '<div class="offline-duration-card"><span>离线结算时长</span><strong>' + fmtDur(settledSecs) + '</strong></div></header>' +
      '<div class="offline-report-scroll"><section class="offline-report-section"><div class="offline-section-heading">' +
      '<div><span class="offline-section-kicker">WORLD STATUS</span><h3>世界变化</h3></div>' +
      '<span class="offline-report-badge">' + (any ? '结算完成' : '平稳度过') + '</span></div>' +
      '<div class="offline-stat-grid">' + overviewCards + '</div>' +
      (incidentRows ? '<div class="offline-incidents">' + incidentRows + '</div>' : '') + '</section>' +
      '<section class="offline-report-section"><div class="offline-section-heading">' +
      '<div><span class="offline-section-kicker">RESOURCE FLOW</span><h3>资源变化</h3></div>' +
      '<span class="offline-resource-count">' + resourceRows.length + ' 项</span></div>' +
      '<div class="offline-resource-list">' + resourceContent + '</div></section>' + noteRows +
      '</div></div>';
    log('离线结算：' + summaryText + '。');
    /* 离线闸门第二阶段：把「补算中」换成结算面板，只有点「继续」才解锁界面
     * （否则玩家边补算边点建造，就会看到材料飞快被灌满）。科研 / 宗教开门弹窗
     * 顺延到关掉本面板之后，否则会被本面板覆盖、玩家看不到。 */
    var modalShown = SB.ui.render.showOfflineModal({
      title: '离线结算',
      body: summary,
      summary: true,
      ok: '继续',
      onOk: function () {
        if (breakReport) SB.ui.render.showBreakPanel(breakReport);
        else { maybeSciencePopup(j.s); maybeReligionPopup(j.s); maybeTabUnlockPopups(j.s); markDirty(); fireDysonPending(j); }
      }
    });
    if (modalShown === false && breakReport) SB.ui.render.showBreakPanel(breakReport);
    else if (modalShown === false && j.s.dysonPopupPending) fireDysonPending(j);
  }
  /* 存档字段取舍：`_` 前缀曾被当成「不落盘」的依据，那是错的——
   * `_grow` 是生育计时（进度条读它，刷新后归零就是漏存），
   * `_cutBase` / `_cutMir` 是削壳累计量（漏存会让破壳面板少算刷新前的部分）。
   * 真正需要排除的临时字段请显式写进 TEMP_KEYS；未登记的字段一律落盘
   * （migrateRun 会按 freshRun 的键过滤未知顶层字段，写进去也不会污染下次读取）。 */
  var TEMP_KEYS = ['_ts', '_repairedResources'];   // 诊断字段只在本次读档提示，不进入存档
  function snapshot(s) {
    var o = {}, k;
    for (k in s) if (TEMP_KEYS.indexOf(k) < 0) o[k] = s[k];
    o._ts = Date.now();   // 离线补算的墙钟真值，随存档一起落盘
    return o;
  }

  /* 导入前先完整验证，并在同一个同步事务里保留现有原始存档。 */
  function installImportedSave(bundle) {
    if (!bundle || bundle.format !== 'shellbreak-save' || bundle.version !== 1 || !bundle.save)
      throw new Error('存档文件格式或版本不受支持。');
    var incomingMeta = SB.state.normalizeMeta(bundle.save.meta);
    var incomingRunRaw = bundle.save.run;
    if (!incomingRunRaw || typeof incomingRunRaw !== 'object' || Array.isArray(incomingRunRaw)
        || !incomingRunRaw.res || typeof incomingRunRaw.res !== 'object'
        || !incomingRunRaw.lvl || typeof incomingRunRaw.lvl !== 'object'
        || !incomingRunRaw.jobs || typeof incomingRunRaw.jobs !== 'object'
        || typeof incomingRunRaw.shell !== 'number' || !isFinite(incomingRunRaw.shell))
      throw new Error('周目存档缺少必要数据，未修改本地存档。');
    var oldMeta = meta, incomingRun;
    try { meta = incomingMeta; incomingRun = SB.state.migrateRun(incomingRunRaw); }
    finally { meta = oldMeta; }
    var serializedMeta = JSON.stringify(incomingMeta), serializedRun = JSON.stringify(incomingRun);
    if (!root.localStorage) throw new Error('浏览器本地存储不可用。');
    var oldMetaRaw = root.localStorage.getItem(CFG.SAVE_KEY);
    var oldRunRaw = root.localStorage.getItem(CFG.RUN_KEY);
    try {
      /* 必须先备份两份旧值；任一备份失败时不动主存档。 */
      if (oldMetaRaw !== null) root.localStorage.setItem(CFG.SAVE_BACKUP_KEY, oldMetaRaw);
      if (oldRunRaw !== null) root.localStorage.setItem(CFG.RUN_BACKUP_KEY, oldRunRaw);
    } catch (backupError) {
      throw new Error('无法先备份当前存档，导入已取消：' + (backupError.message || backupError));
    }
    try {
      root.localStorage.setItem(CFG.SAVE_KEY, serializedMeta);
      root.localStorage.setItem(CFG.RUN_KEY, serializedRun);
    } catch (writeError) {
      /* 回滚尽力恢复；原始值仍保存在 backup key，便于手动救援。 */
      try {
        if (oldMetaRaw === null) root.localStorage.removeItem(CFG.SAVE_KEY);
        else root.localStorage.setItem(CFG.SAVE_KEY, oldMetaRaw);
        if (oldRunRaw === null) root.localStorage.removeItem(CFG.RUN_KEY);
        else root.localStorage.setItem(CFG.RUN_KEY, oldRunRaw);
      } catch (rollbackError) {}
      throw new Error('导入写入失败，已尝试恢复当前存档：' + (writeError.message || writeError));
    }
    /* ⚠️⚠️ 2026-10-28 P0：**写完必须读回校验**。
     *   小游戏容器对 localStorage 没有任何持久承诺（官方只对 tapfile://usr 承诺），
     *   可能出现「setItem 不抛错、但读回来不是刚写的」甚至「重载后整块丢失」。
     *   旧代码写完就 location.reload()，于是导入变成「看起来成功 → 重载后进度没变」，
     *   而调用方（尤其云端救援）会一遍遍重试 ⇒ 重载环。
     *   读回不一致就当场中止、把旧值放回去，**绝不 reload**，把真相告诉玩家。 */
    var backMeta = null, backRun = null;
    try {
      backMeta = root.localStorage.getItem(CFG.SAVE_KEY);
      backRun = root.localStorage.getItem(CFG.RUN_KEY);
    } catch (readBackError) { backMeta = null; backRun = null; }
    if (backMeta !== serializedMeta || backRun !== serializedRun) {
      try {
        if (oldMetaRaw === null) root.localStorage.removeItem(CFG.SAVE_KEY);
        else root.localStorage.setItem(CFG.SAVE_KEY, oldMetaRaw);
        if (oldRunRaw === null) root.localStorage.removeItem(CFG.RUN_KEY);
        else root.localStorage.setItem(CFG.RUN_KEY, oldRunRaw);
      } catch (rollbackError2) {}
      throw new Error('本机存储不可靠：写入后读回的内容不一致，导入已中止（原存档未改动）。');
    }
    if (SB.store && SB.store.fsAvailable && SB.store.fsAvailable()) {
      if (!SB.store.writeNativeSaveSync(serializedMeta, serializedRun)) {
        try {
          if (oldMetaRaw === null) root.localStorage.removeItem(CFG.SAVE_KEY);
          else root.localStorage.setItem(CFG.SAVE_KEY, oldMetaRaw);
          if (oldRunRaw === null) root.localStorage.removeItem(CFG.RUN_KEY);
          else root.localStorage.setItem(CFG.RUN_KEY, oldRunRaw);
        } catch (rollbackError3) {}
        throw new Error('TapTap 原生文件未确认写入，导入已中止。');
      }
    }
    suppressExitSave = true;
    root.location.reload();
    return true;
  }

  /* 就地接管一份外部存档（2026-10-28 P0，云端救援专用）。
   * 【为什么不再走 installImportedSave】那条路的末尾是 `location.reload()`，是**全应用唯一
   *   的自动重载点**。云救援一旦命中就 reload ⇒ 若容器对 localStorage 没有持久承诺
   *   （setItem 不报错、重载后读不回来，正是「退出就没存档」的根因），启动就变成
   *   「本机空 → 拉云端 → 写盘 → 重载 → 还是空 → 再拉云端 → …」的**无限重载环**；
   *   而 `meta.seenVersion`（更新日志已读标记）与救援节流键都存在同一个地方 ⇒ 每圈都判
   *   「该版本首次进入」⇒ 每圈重弹更新日志、每次点击都被重载打断。玩家报的
   *   「会再弹一次更新日志但是又不掉、什么都点不动、重启也一样」正是这个环的外在表现。
   * 【本函数的口径】写盘只是**尽力而为**（成功则下次启动直接 resumed），真正的状态直接
   *   进内存 ⇒「本次会话能不能玩」与「存储持不持久」彻底解耦，环在物理上无法形成。
   * ⚠️ 与 startRun 的区别：**不**动 `meta.cycle`（那会平白多算一个周目），也**不**做
   *   startRun 的「建筑等级并入跨周目账本」—— 这是「接管已有的局」，不是「开新局」。
   * ⚠️ 故意**不**设 `loop._lastWall`：恢复路径不该顺手给玩家补一笔离线结算（可能为负），
   *   等同「刚上线」。`_ts` 一并删掉，避免残留在下次快照里。 */
  function adoptBundle(bundle) {
    if (!bundle || bundle.format !== 'shellbreak-save' || bundle.version !== 1 || !bundle.save) {
      throw new Error('云存档格式或版本不受支持。');
    }
    var rawRun = bundle.save.run;
    if (!rawRun || typeof rawRun !== 'object' || Array.isArray(rawRun)
        || !rawRun.res || typeof rawRun.res !== 'object'
        || !rawRun.lvl || typeof rawRun.lvl !== 'object'
        || !rawRun.jobs || typeof rawRun.jobs !== 'object'
        || typeof rawRun.shell !== 'number' || !isFinite(rawRun.shell))
      throw new Error('云存档缺少必要数据。');
    var inMeta = SB.state.normalizeMeta(bundle.save.meta);
    var oldMeta = meta, inRun;
    try { meta = inMeta; inRun = SB.state.migrateRun(rawRun); }
    finally { meta = oldMeta; }
    if (!inRun || typeof inRun !== 'object') throw new Error('云存档迁移失败。');
    delete inRun._ts;
    try {
      if (SB.store && SB.store.writeLocal) {
        var mTxt = JSON.stringify(inMeta), rTxt = JSON.stringify(inRun);
        SB.store.writeLocal(CFG.SAVE_KEY, mTxt);
        SB.store.writeLocal(CFG.RUN_KEY, rTxt);
        if (SB.store.mirrorWrite) {
          SB.store.mirrorWrite(CFG.SAVE_KEY, mTxt);
          SB.store.mirrorWrite(CFG.RUN_KEY, rTxt);
        }
        if (SB.store.writeNativeSaveSync && SB.store.writeNativeSaveSync(mTxt, rTxt)) {
          /* 云端接管已经同步落入后台快照。 */
        } else if (SB.store.writeNativeSave) SB.store.writeNativeSave(mTxt, rTxt, true);
      }
    } catch (e) {}
    meta = inMeta;
    resumeRun(inRun);      /* 内部会 renderAll；随后调用方接 bootUi */
    return true;
  }

  function restoreRawSave(raw) {
    if (!raw || typeof raw !== 'object'
        || !(raw.meta === null || typeof raw.meta === 'string')
        || !(raw.run === null || typeof raw.run === 'string')
        || (raw.meta === null && raw.run === null))
      throw new Error('原始救援包无效，未修改本地存档。');
    if (!root.localStorage) throw new Error('浏览器本地存储不可用。');
    var oldMetaRaw = root.localStorage.getItem(CFG.SAVE_KEY);
    var oldRunRaw = root.localStorage.getItem(CFG.RUN_KEY);
    try {
      if (oldMetaRaw !== null) root.localStorage.setItem(CFG.SAVE_BACKUP_KEY, oldMetaRaw);
      if (oldRunRaw !== null) root.localStorage.setItem(CFG.RUN_BACKUP_KEY, oldRunRaw);
    } catch (backupError) {
      throw new Error('无法先备份当前原始存档，恢复已取消：' + (backupError.message || backupError));
    }
    try {
      if (raw.meta === null) root.localStorage.removeItem(CFG.SAVE_KEY);
      else root.localStorage.setItem(CFG.SAVE_KEY, raw.meta);
      if (raw.run === null) root.localStorage.removeItem(CFG.RUN_KEY);
      else root.localStorage.setItem(CFG.RUN_KEY, raw.run);
    } catch (writeError) {
      try {
        if (oldMetaRaw === null) root.localStorage.removeItem(CFG.SAVE_KEY);
        else root.localStorage.setItem(CFG.SAVE_KEY, oldMetaRaw);
        if (oldRunRaw === null) root.localStorage.removeItem(CFG.RUN_KEY);
        else root.localStorage.setItem(CFG.RUN_KEY, oldRunRaw);
      } catch (rollbackError) {}
      throw new Error('恢复原始存档失败，现有数据已另存到本机备份：' + (writeError.message || writeError));
    }
    suppressExitSave = true;
    root.location.reload();
    return true;
  }

  /* boot 拆两段（2026-10-27，多后端存档）：decideRun() 只负责「本局从哪来」，
   * bootUi() 负责其余全部。拆开是因为 localStorage 读不到时要去 tap.setStorage /
   * tapfile 异步兜底，而 boot 本身是同步的 —— 只能把「决定」做成可重入的小函数，
   * 异步回来再调一次。⚠️ 别把 bootUi 的内容内联回 decide：那会导致异步回来时
   * 重复绑定 btnBreak.onclick / 重复 setInterval(loop)（双倍 tick）。 */
  function decideRun() {
    var saved = SB.state.loadRun();
    var loadProblems = SB.state.loadProblems();
    if (loadProblems.meta || loadProblems.run) {
      if (SB.saveTransfer && SB.saveTransfer.showLoadProblem) SB.saveTransfer.showLoadProblem(loadProblems);
      return 'blocked';   /* 解析失败时绝不 startRun/saveMeta 覆盖原始数据。 */
    }
    /* ⚠️⚠️ 2026-10-29 P0：**周目在、跨周目不在**时绝不许接着玩。
     *    `loadMeta()` 读不到 meta 键时是**静默**返回 emptyMeta()（不设 metaLoadProblem，
     *    那条只给「解析失败」用）⇒ decideRun 照常 resume ⇒ 下一次 saveMeta 就把一份
     *    空 meta 落盘 ⇒ 轮回点 / 已买强化 / 旧日信仰 / 纪念奇观 / 挑战进度**全部归零**，
     *    而且 `wroteMeta` 一过就无从恢复。
     *    真机复现（修这条之前）：删掉 meta 键后重载，meta 键被写成 1561 字节的空档。
     *    ⇒ 现在挂起在存档面板（那里有「重新检查存档」与两次确认的「开新局」两个出口，
     *      也有导入存档 / 云端下载，不会把人关死）。 */
    if (saved) {
      var metaSrcNow = null;
      try {
        metaSrcNow = SB.store ? SB.store.readLocal(CFG.SAVE_KEY)
          : (root.localStorage && root.localStorage.getItem(CFG.SAVE_KEY));
      } catch (e) { metaSrcNow = null; }
      if (!metaSrcNow) {
        if (SB.store && SB.store.diagSet) {
          try { SB.store.diagSet({ boot: 'meta-missing', bootAt: Date.now() }, true); } catch (e) {}
        }
        if (SB.saveTransfer && SB.saveTransfer.showRecoveryPending)
          SB.saveTransfer.showRecoveryPending('本机找到了周目存档，但跨周目存档（轮回点 / 已买强化 / 旧日遗产）缺失。'
            + '为避免把这些成绩清零，已暂停载入 —— 请先「重新检查存档」，或从云端恢复 / 导入你导出的存档文件。');
        return 'blocked';
      }
    }
    if (saved && (!saved.broken || saved.shellOpened || saved.breakSettled) && saved.shell !== undefined) {
      /* 启动时的离线补算：存档里记了墙钟时间戳 _ts（snapshot 写入），
       * 这一次性补完（沿用 economy.tick 同一条路径），随后 _lastWall 对齐到「现在」
       * ——否则接下来每帧都会把这个已被补掉的间隙再补一遍。 */
      /* 把「上次存档的墙钟时刻」直接当作 _lastWall：下一个回调就会算出真实的离线间隙，
       * 于是启动补算与运行期补算共用同一条路径（boot 里不写第二套判定）。 */
      var ts = saved._ts;
      delete saved._ts;
      if (typeof ts === 'number' && ts > 0) loop._lastWall = ts;
      resumeRun(saved);
      return 'resumed';
    }
    if (saved) {
      var invalidRun = { message: '本周目状态不完整，未自动创建新周目。', raw: null };
      if (SB.saveTransfer && SB.saveTransfer.showLoadProblem)
        SB.saveTransfer.showLoadProblem({ meta: null, run: invalidRun });
      return 'blocked';
    }
    return 'empty';   /* localStorage 里没有任何档 —— 但先别急着开新档，见 boot */
  }
  function bootTap() {
    var scan = SB.store.scanSaveCandidates(CFG.RUN_KEY, CFG.SAVE_KEY);
    scan.then(function (result) {
      if (result.best) {
        var best = result.best;
        /* ⚠️ 2026-10-29：候选档**可以只有周目、没有跨周目**（`save-storage.js` 的
         *   `parsedPair(meta.raw || null, run.raw || null, ...)` 对 meta 缺失是放行的）。
         *   原先这里写 `best.metaRaw || JSON.stringify(emptyMeta())` —— 那一句会拿**空 meta
         *   覆盖存档键**，把轮回点 / 已买节点 / 旧日信仰 / 纪念奇观 / 挑战进度**全部归零**，
         *   而且 `wroteMeta` 为真后立刻落盘，事后无从恢复。
         *   ⇒ 现在缺 meta 一律**不接管**、不写盘，挂到恢复界面等玩家手动恢复/导入。 */
        if (!best.metaRaw) {
          if (SB.store.diagSet) SB.store.diagSet({ boot: 'meta-missing:' + best.source, bootAt: Date.now() }, true);
          if (SB.saveTransfer && SB.saveTransfer.showRecoveryPending)
            SB.saveTransfer.showRecoveryPending('本机找到了周目存档，但跨周目存档（轮回点 / 已买强化 / 旧日遗产）缺失。'
              + '为避免把这些数据清零，已暂停载入 —— 请在存档管理里从云端恢复或导入备份。');
          return;
        }
        /* 所有本机落点读完后，才选最新有效快照。只在确认选中后回填浏览器缓存。 */
        var mRaw = best.metaRaw;
        var wroteMeta = SB.store.writeLocal(CFG.SAVE_KEY, mRaw);
        var wroteRun = SB.store.writeLocal(CFG.RUN_KEY, best.runRaw);
        if (wroteMeta && wroteRun && SB.store.readLocal(CFG.RUN_KEY) === best.runRaw
            && SB.store.readLocal(CFG.SAVE_KEY) === mRaw) {
          meta = SB.state.loadMeta();
          var outcome = decideRun();
          if (outcome === 'resumed') {
            if (SB.store.diagSet) SB.store.diagSet({ boot: 'resumed:' + best.source, bootAt: Date.now() }, true);
            bootUi(); return;
          }
          if (outcome === 'blocked') return;
        }
        try {
          adoptBundle({ format: 'shellbreak-save', version: 1,
            save: { meta: JSON.parse(mRaw), run: JSON.parse(best.runRaw) } });
          if (SB.store.diagSet) SB.store.diagSet({ boot: 'memory:' + best.source, bootAt: Date.now() }, true);
          bootUi(); return;
        } catch (e) {
          if (SB.saveTransfer && SB.saveTransfer.showRecoveryPending)
            SB.saveTransfer.showRecoveryPending('本机存档存在，但载入失败：' + (e && e.message || e));
          return;
        }
      }
      if (result.status === 'uncertain') {
        if (SB.saveTransfer && SB.saveTransfer.showRecoveryPending)
          SB.saveTransfer.showRecoveryPending('本机存档读取超时、失败或内容不完整。请重试或从云端手动恢复。');
        return;
      }
      /* 本机已确认「三处都没有有效档」，剩下唯一可能的数据来源是云端。
       * ⚠️ 这里要分清两种「没有云」：
       *   · 运行时**不提供**云存档能力（cloudAvailable=false）⇒ 云端确定不存在，
       *     开新局不会丢任何东西。若也走「暂停」，纯文件版容器里的真新玩家会永远
       *     停在恢复界面（没有任何一条出口），那是把保护做成了死锁。
       *   · 能力存在但调用失败 / 超时 ⇒ **未知**，一律暂停（见下面 error/timeout 分支）。 */
      if (!SB.saveTransfer || !SB.saveTransfer.restoreFromCloudIfAny
          || !(SB.saveTransfer.cloudAvailable && SB.saveTransfer.cloudAvailable())) {
        openFreshRun(); bootUi(); return;
      }
      SB.saveTransfer.restoreFromCloudIfAny(function (cloud) {
        if (cloud && cloud.status === 'found' && cloud.bundle) {
          try { adoptBundle(cloud.bundle); bootUi(); }
          catch (e) {
            if (SB.saveTransfer && SB.saveTransfer.showRecoveryPending)
              SB.saveTransfer.showRecoveryPending('云存档找到但无法载入：' + (e && e.message || e));
          }
          return;
        }
        /* absent = 云端明确答复「没有存档」；unavailable = 运行时没有这条路。
         * 两者都足以判定「设备上确实没有旧档」，可以安全开新局。 */
        if (cloud && (cloud.status === 'absent' || cloud.status === 'unavailable')) {
          openFreshRun(); bootUi(); return;
        }
        if (SB.saveTransfer && SB.saveTransfer.showRecoveryPending)
          SB.saveTransfer.showRecoveryPending((cloud && cloud.error) || '云存档检查失败；为保护旧档，已暂停开新局。');
      });
    }).catch(function (e) {
      if (SB.saveTransfer && SB.saveTransfer.showRecoveryPending)
        SB.saveTransfer.showRecoveryPending('本机存档检查失败：' + (e && e.message || e));
    });
  }
  /* ══ 运行时就绪门（2026-10-30）════════════════════════════════════════
   * 【事故形状】玩家报「更新后第一次打开，存档没了」。根因不在读档逻辑，在**时机**：
   *   `main.js` 在 DOMContentLoaded 里**同步**调 boot，而 TapTap 原生桥注入 `tap`
   *   是异步的，冷启动（刚更新完、要重拉资源）最慢。那一刻三项能力全为假 ⇒
   *   旧代码把这句读成「这台机器没有存档能力」⇒ 走同步分支 ⇒ 本机读不到 ⇒
   *   `rescueGate` 同样全假 ⇒ **startRun() 直接开新档**；而 startRun 末尾立刻
   *   saveRun，5 秒后的自动存档（若此时 tap 已注入）就把新档写进 shellbreak-save-a/b
   *   ⇒ 唯一的好档销毁。而且这一路**不经过尸检副本** —— preserveEmergency 只挂在
   *   finishNew 里，而 finishNew 要求 rescueGate 为真。
   * 【判据】`tap 没来` ≠ `没有存档`。旧代码把这两件事合并成同一个判断，这就是根因。
   *   现在拆三态：
   *     ready = 三项能力任一为真        → 立刻 bootTap()
   *     hint  = tap 对象在 / 容器 UA     → **等**，期间不判定、不落盘
   *     none  = 两者皆无                → 纯网页，走与改造前逐字相同的同步路径
   * ⚠️ hint **只决定「值不值得等」**，绝不可当 ready 用 —— 拿它去读档会读到空，
   *    然后「确认没有旧档」把好档覆盖掉，等于绕回事故原点。
   * ⚠️ 超时（8 秒）的出口是**暂停**，不是开新档。同理：没连上 ≠ 没有。
   * ⚠️ 等待期间必须能逃出去（10-28「卡在更新日志点不动」的教训）：3 秒后出
   *    「跳过等待」，点了走与今天完全相同的路径，且会打开原生槽写保护。 */
  /* ⚠️ 这四个数**每次用到时**才读 CFG，不在加载时定格：回归要注入短超时
   *   （`SB.CFG.BOOT_GATE.WAIT_MS = 150`），定格的话夹具只能干等 8 秒。
   *   顺带也守住「数值只有一个源」——除 CFG 外不该有第二份。 */
  function gateCfg(key, fallback) {
    var g = (SB.CFG && SB.CFG.BOOT_GATE) || {};
    var v = Number(g[key]);
    return (isFinite(v) && v > 0) ? v : fallback;
  }

  function capReady() {
    if (!SB.store || !SB.store.scanSaveCandidates) return false;
    return !!((SB.store.envAvailable && SB.store.envAvailable())
      || (SB.store.fsAvailable && SB.store.fsAvailable())
      || (SB.saveTransfer && SB.saveTransfer.cloudAvailable && SB.saveTransfer.cloudAvailable()));
  }
  function runtimeHinted() {
    /* 强证据：tap 已挂在全局（哪怕只是个空壳 —— 说明桥正在往里灌方法）。 */
    try { if (root.tap) return true; } catch (e) {}
    /* 弱证据：容器 UA。TapTap 的 webview 会带 TapTap 字样。 */
    try {
      var ua = (root.navigator && root.navigator.userAgent) || '';
      if (/TapTap/i.test(ua)) return true;
    } catch (e) {}
    return false;
  }

  var gateEl = null, gateTimer = null, gateSkipBtn = null, gateStartAt = 0, gateDone = true;
  function gateRender(waited) {
    try {
      if (!document || !document.body) return;
      if (!gateEl) {
        gateEl = document.createElement('div');
        gateEl.id = 'bootGate';
        gateEl.setAttribute('role', 'status');
        gateEl.style.cssText = 'position:fixed;inset:0;z-index:100002;display:flex;'
          + 'flex-direction:column;align-items:center;justify-content:center;gap:14px;'
          + 'padding:24px;text-align:center;background:rgba(6,12,20,.94);color:#e8eef6;'
          + 'font:15px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;'
          + 'pointer-events:auto;-webkit-user-select:none;user-select:none;';
        gateEl.innerHTML = '<div id="bootGateMsg">正在连接 TapTap…</div>'
          + '<div id="bootGateSub" style="font-size:13px;opacity:.66;min-height:1.4em"></div>'
          + '<button type="button" id="bootGateSkip" style="display:none;margin-top:6px;'
          + 'padding:9px 18px;border:1px solid rgba(232,238,246,.34);border-radius:8px;'
          + 'background:transparent;color:#e8eef6;font-size:13px;cursor:pointer;">'
          + '跳过等待，直接进入</button>';
        document.body.appendChild(gateEl);
        gateSkipBtn = gateEl.querySelector('#bootGateSkip');
        if (gateSkipBtn) gateSkipBtn.onclick = function () { gateFinish('skip'); };
      }
      var msg = gateEl.querySelector('#bootGateMsg');
      if (msg) msg.textContent = '正在连接 TapTap…';
      var sub = gateEl.querySelector('#bootGateSub');
      if (sub) sub.textContent = '已等待 ' + Math.floor(waited / 1000) + ' 秒';
      if (gateSkipBtn) gateSkipBtn.style.display = waited >= gateCfg('SKIP_MS', 3000) ? 'block' : 'none';
    } catch (e) {
      /* 遮罩画不出来也不能拦住启动 —— 等待逻辑与 UI 必须解耦。 */
    }
  }
  function gateClose() {
    if (gateTimer) { try { root.clearTimeout(gateTimer); } catch (e) {} gateTimer = null; }
    try {
      if (gateEl && gateEl.parentNode) gateEl.parentNode.removeChild(gateEl);
    } catch (e) {}
    gateEl = null; gateSkipBtn = null;
  }
  function gateFinish(how) {
    if (gateDone) return;
    gateDone = true;
    gateClose();
    if (SB.store && SB.store.diagSet) {
      try { SB.store.diagSet({ gate: how, gateMs: Date.now() - gateStartAt }, true); } catch (e) {}
    }
    if (how === 'timeout') {
      /* 兜底出口（2026-10-30）：localStorage 里本来就有可读的档 ⇒ 「tap 没连上」
       *   根本不影响续档（decideRun 走的就是它），直接继续。
       *   这一条把「UA 误判成小游戏容器」的代价压到最低：网页版老玩家不会因为
       *   UA 里带 TapTap 就被卡在恢复界面，更不会点了「开新局」把 local 档碾掉。 */
      var lr = null;
      try { lr = SB.store && SB.store.readLocal ? SB.store.readLocal(CFG.RUN_KEY) : null; } catch (e) { lr = null; }
      if (lr) {
        var lo = null;
        try { lo = JSON.parse(lr); } catch (e) { lo = null; }
        if (lo && lo.res && lo.lvl && lo.jobs) {
          if (SB.store && SB.store.diagSet) {
            try { SB.store.diagSet({ gate: 'timeout-local' }, true); } catch (e) {}
          }
          bootStage2(); return;
        }
      }
      /* 唯一的「不确定」出口：绝不开新档（见上方判据）。给玩家的动作是明确的 —— 
       * 退出重开；连续几次都这样就把诊断信息发给我们。 */
      if (SB.saveTransfer && SB.saveTransfer.showRecoveryPending)
        SB.saveTransfer.showRecoveryPending('没能连上 TapTap 运行环境（已等待 '
          + Math.round(gateCfg('WAIT_MS', 8000) / 1000) + ' 秒）。为保护旧档，已暂停开新局 —— '
          + '请退出游戏重新打开；如果连续几次都这样，请把存档面板里的诊断信息发给我们。');
      return;
    }
    bootStage2();
  }
  function waitRuntime() {
    gateDone = false;
    gateStartAt = Date.now();
    gateRender(0);
    function poll() {
      if (gateDone) return;
      var waited = Date.now() - gateStartAt;
      if (capReady()) { gateFinish('ready'); return; }
      if (waited >= gateCfg('WAIT_MS', 8000)) { gateFinish('timeout'); return; }
      gateRender(waited);
      gateTimer = root.setTimeout(poll, gateCfg('POLL_MS', 100));
    }
    poll();
  }

  function boot() {
    /* 诊断记录（2026-10-29）：读上一次会话留下的那份，并把「启动次数 +1」记下来。
     * ⚠️ 必须在 decideRun 之前读 —— 它同时是「这台设备玩过」的唯一证据（存档可能被清）。 */
    if (SB.store && SB.store.diagLoad) {
      try { SB.store.diagLoad(); SB.store.diagBump('boots', 1, false); } catch (e) {}
    }
    /* ★★ 2026-10-30：先过就绪门。能力齐了直接走；没齐但看着像小游戏容器 ⇒ 等。 */
    if (!capReady() && runtimeHinted()) { waitRuntime(); return; }
    if (SB.store && SB.store.diagSet) {
      /* ⚠️ 必须 immediate：上一句 diagBump('boots') 刚写过盘，非强制写会被 20 秒节流吃掉
       *   ⇒ 诊断里永远看不到 gate 字段。多写一次约 500 字节，代价可忽略。 */
      try { SB.store.diagSet({ gate: 'direct', gateMs: 0 }, true); } catch (e) {}
    }
    bootStage2();
  }
  function bootStage2() {
    /* ⚠️ 就绪门会把启动推迟到 tap 到位之后才继续，而 main.js 里那句
     *   `SB.saveTransfer.boot()` 是在「能力全假」的那一刻就跑完的 ⇒ 云备份定时器
     *   根本没装上（它内部判 cloudAvailable）。这里补一次；boot 内部有 autoPumpTimer
     *   闸，重复调用安全，不会出现两个 30 秒定时器。 */
    if (SB.saveTransfer && SB.saveTransfer.boot) {
      try { SB.saveTransfer.boot(); } catch (e) {}
    }
    if (capReady()) {
      bootTap(); return;
    }
    var r = decideRun();
    if (SB.store && SB.store.diagSet) {
      try { SB.store.diagSet({ boot: r, bootAt: Date.now() }, false); } catch (e) {}
    }
    if (r === 'blocked') return;
    if (r === 'empty') {
      /* ★★ 2026-10-27 核心修复：**不再立刻开新档**。
       * 原先这里直接 startRun()，而 startRun 末尾立刻 saveRun ⇒ 只要 localStorage
       * 被容器清过一次，那份可能完好躺在 tap.setStorage / tapfile://usr 里的旧档
       * 就被新档永久覆盖，玩家看到的是「退出之后存档没了」。
       * 现在先异步问遍另外两处；确实都没有，才认定这是真·新玩家。
       * ⚠️ 浏览器 / node 沙箱里 envAvailable() 为假 ⇒ 走下面同步分支，行为与改造前一致。 */
      /* ★★ 2026-10-29 P0-1：这道门原先只看 `tap.getStorage`，是个错误。
       *   ② tap.setStorage 确实需要它，但 ③ 用户目录文件只需要 getFileSystemManager，
       *   ④ 云存档只需要 getCloudSaveManager。三者来自不同模块，完全可能出现
       *   「文件系统给了、getStorage 没给」的组合 —— 那种容器里 ③ 备份一直在写、
       *   云备份一直在跑，但启动永远不读，每次都判新玩家并把唯一的好档覆盖掉。
       *   现在门锁改成「任一可用即进」，进不去只有一种情况：三者全无（纯浏览器 / 沙箱）。 */
      var rescueGate = !!(SB.store && SB.state.recoverAsync) && !!(
        (SB.store.envAvailable && SB.store.envAvailable())
        || (SB.store.fsAvailable && SB.store.fsAvailable())
        || (SB.saveTransfer && SB.saveTransfer.cloudAvailable && SB.saveTransfer.cloudAvailable()));
      if (rescueGate) {
        try { log('未读到浏览器存档，正在检查本机备份…'); } catch (e) {}
        /* ⚠️⚠️ 2026-10-28 P0：异步恢复必须有**硬超时**，而且超时要**逐段推进**而不是直接放弃。
         *   事故：玩家报「从存档码导入后卡在更新日志，什么都点不动，重启也一样」。
         *   旧写法只靠回调推进 boot：`recoverAsync` 或云端救援任一环**不回调**
         *   （容器 API 静默挂起、返回非预期结构、Promise 永不 settle），boot 就永久停住，
         *   `S` 恒为 null ⇒ 那时候连「关闭弹窗」都点不动（见 input.js 的闸门注释）。
         *   ⚠️ 超时**不能**直接 startRun：那样会把「本机备份挂住但云端有好档」的玩家
         *     直接判成新玩家、用新档把云端覆盖掉。所以分两段：
         *       recoverAsync(8s) → 超时转云端(12s) → 云端也超时才开新档。
         *   任一段成功都立刻 proceeded=true，后面的段不再跑（三条出口严格互斥）。 */
        var proceeded = false;
        var bootTimer = null;
        function stopTimer() { if (bootTimer) { try { root.clearTimeout(bootTimer); } catch (e) {} bootTimer = null; } }
        function arm(ms, fn) {
          stopTimer();
          bootTimer = root.setTimeout(function () { bootTimer = null; if (!proceeded) fn(); }, ms);
        }
        /* 出口 A：三处本机 + 云端都没有 ⇒ 真·新玩家，唯一允许开新档的分支。 */
        function finishNew(why) {
          if (proceeded) return;
          proceeded = true; stopTimer();
          if (why) { try { log(why); } catch (e) {} }
          if (SB.store && SB.store.diagSet) SB.store.diagSet({ boot: 'new', bootAt: Date.now() }, true);
          /* ★★ 2026-10-29 尸检副本：开新档**之前**先把 ②③ 里那份旧档原样抄一份。
           *   过去最痛的不是「没有备份」，而是备份被新档**覆盖**：startRun 末尾立刻
           *   saveRun ⇒ 镜像一写，唯一的好档当场销毁。抄一份之后，即便覆盖照旧发生，
           *   玩家还能在存档面板把原文导出给我们救回来。
           *   ⚠️ 内部 1.5 秒硬超时，绝不让 boot 卡住（10-28「点不动、重启也一样」就是卡死）。
           *   ⚠️ 它读备份**不经过**上面那道门 —— 那道门正是 P0-1 的 bug 所在。 */
          var go = function (pres) {
            if (pres) {
              try { log('已保留一份旧档副本（' + pres.bytes + ' 字节，来源 ' + pres.source + '），可在存档面板导出。'); } catch (e) {}
            }
            openFreshRun();
            bootUi();
          };
          if (SB.store && SB.store.preserveEmergency) {
            SB.store.preserveEmergency(CFG.RUN_KEY, CFG.SAVE_KEY, go);
            return;
          }
          go(null);
        }
        /* 出口 B：拿到了一份可用的档（本机备份恢复 / 云端接管）⇒ 直接进 UI，**不重载**。 */
        function finishResumed(why) {
          if (proceeded) return;
          proceeded = true; stopTimer();
          if (why) { try { log(why); } catch (e) {} }
          if (SB.store && SB.store.diagSet) SB.store.diagSet({ boot: 'resumed', bootAt: Date.now() }, true);
          bootUi();
        }
        function pauseRecovery(why) {
          if (proceeded) return;
          proceeded = true; stopTimer();
          if (SB.saveTransfer && SB.saveTransfer.showRecoveryPending)
            SB.saveTransfer.showRecoveryPending(why || '存档检查没有得到确定结果。');
        }
        /* 第二段：问一次 TapTap 云存档。
         * ★★ 2026-10-28 第四路 —— 本机三层（localStorage / tap.setStorage / tapfile://usr）
         *   是**同生共死**的：清缓存、换设备、容器重建会让三处一起消失。云端那份自动备份
         *   （每 5 分钟）是唯一跨设备还活着的档。
         * ⚠️⚠️ 2026-10-28 P0 改口径：命中后**不再**调 installImportedSave（它末尾
         *   `location.reload()`）。reload 是重载环的唯一发动机 —— 在「localStorage 写进去
         *   读不回来」的容器里会变成「空→拉云端→写→重载→还是空」的无限环，每圈重弹更新日志。
         *   现在改成 game.adoptBundle 就地接管：写盘尽力而为、状态直接进内存，
         *   本次会话必定能玩，环物理上无法形成。 */
        function toCloud() {
          if (proceeded) return;
          if (SB.saveTransfer && SB.saveTransfer.restoreFromCloudIfAny) {
            try { log('本机备份也没有，正在检查 TapTap 云存档…'); } catch (e) {}
            /* 云端自身有 8 秒内部超时；这里给 12 秒外层兜底（含解码/校验耗时）。 */
            arm(12000, function () { pauseRecovery('云端检查超时，请重试。'); });
            SB.saveTransfer.restoreFromCloudIfAny(function (cloud) {
              if (proceeded) return;
              if (cloud && cloud.bundle) {
                try {
                  adoptBundle(cloud.bundle);
                  finishResumed('已从 TapTap 云存档恢复进度：' +
                    ((S && S.t) ? (S.t / 3600).toFixed(2) : '0') + ' 小时。');
                  return;
                } catch (e) {
                  try { log('云存档无法载入：' + (e && e.message ? e.message : e)); } catch (e2) {}
                }
              } else if (cloud && cloud.error) {
                try { log('云存档恢复失败：' + cloud.error); } catch (e) {}
              }
              pauseRecovery('本机或云端没有得到可确认的空档结果，请重试。');
            });
            return;
          }
          pauseRecovery('云存档接口不可用，请稍后重试。');
        }
        arm(8000, function () { toCloud(); });
        SB.state.recoverAsync(function (hit) {
          if (proceeded) return;
          if (hit) {
            var r2 = decideRun();
            if (r2 === 'blocked') { proceeded = true; stopTimer(); return; }
            if (r2 === 'resumed') {
              /* ⚠️ 必须**重新读一遍 meta**：模块变量 meta 是脚本加载那一刻读的（本文件第 11 行），
               * 那时 localStorage 还是空的（否则根本走不到这个分支）—— 不重载等于把刚恢复的
               * 跨周目进度又丢一次；更不能 saveMeta(旧 meta) 反写回去覆盖掉刚恢复的备份。 */
              try { meta = SB.state.loadMeta(); } catch (e) {}
              finishResumed('已从本机备份恢复存档（来源：' + hit + '）。');
              return;
            }
          }
          toCloud();
        });
        return;
      }
      /* 走到这里 = 本机三处与云端都没有可用通道（纯浏览器 / 沙箱），同步开新档。
       * ⚠️ 诊断里的启动出口要记 `new` 而不是 decideRun 返回的 `empty` —— `empty` 只代表
       *   「localStorage 读不到」，而玩家真正经历的是「开了新档」。两者必须分清，否则
       *   遥测里「本机空但逃过了救援」和「真的新玩家」会长得一模一样。 */
      openFreshRun();
      if (SB.store && SB.store.diagSet) {
        try { SB.store.diagSet({ boot: 'new-nogate', bootAt: Date.now() }, true); } catch (e) {}
      }
    }
    bootUi();
  }
  /* 恢复暂停期间的唯一逃生出口（2026-10-29）：由存档面板那颗「确认没有旧档，开新局」
   * 二次确认后调用。**只在一局都没起来时可用** —— S 非空说明已经有一局在跑，
   * 那时「开新局」等于把内存里的进度抹掉，必须走正常的重置/轮回入口（有确认面板）。
   * 与 finishNew 的区别：不写诊断出口、不抄尸检副本 —— 玩家已明确表示「本机与云端都没有」。 */
  function forceFreshBoot() {
    if (S) return false;
    openFreshRun();
    bootUi();
    return true;
  }
  /* ── 开新档统一入口（2026-10-30）────────────────────────────────────
   * 所有「确认没有旧档」的出口都必须走这里，而不是裸调 startRun()。
   * 【它多做的两件事】
   *   ① 记下开档时刻（freshBootAt）—— 晚到补偿的观察窗口从这一刻起算。
   *   ② 如果**此刻 tap 仍未就绪**，打开原生槽写保护：不许 saveRun 把新档写进
   *      shellbreak-save-a/b/hide。这是救回旧档的唯一前提 —— 一旦写进去，
   *      旧档连读都读不到，谈何「让玩家选」。
   * ⚠️ 保护不是永久的：lateRescue 扫完、或超过 LATE_MS，一律 releaseHold()。
   *    忘了放 = 玩家永远没有原生副本（只剩 localStorage 一条命），比不保护更糟。 */
  var freshBootAt = 0;
  function openFreshRun() {
    freshBootAt = Date.now();
    if (!capReady() && SB.store && SB.store.setNativeHold) {
      try { SB.store.setNativeHold(true); } catch (e) {}
      armLateRescue();
    }
    startRun();
  }
  function releaseNativeHold() {
    if (SB.store && SB.store.setNativeHold) { try { SB.store.setNativeHold(false); } catch (e) {} }
  }
  /* ── D. 晚到补偿（2026-10-30）──────────────────────────────────────
   * 【为什么还要它】就绪门堵住了绝大多数情况，但仍有三条路能在 tap 未就绪时开成新档：
   *   ① 玩家自己点了「跳过等待」或存档面板的「确认没有旧档，开新局」；
   *   ② 就绪门误判成 direct（UA 与 tap 都不符合，但容器其实在慢速注入）；
   *   ③ 未来有人又加了一条开新档的出口却忘了走 openFreshRun。
   *   这三条下如果 tap 随后注入，本机原生槽里可能躺着比当前更好的档。
   * 【判据】比对用「周目 → 时长」，**绝不用 seq**：seq 由墙钟派生（见 save-storage.js
   *   的 nextNativeRevision），新档的 seq 必然更大，拿它比等于永远选我们自己 ——
   *   这正是《小区门卫模拟器》作者踩的那个「时间戳判新旧」的坑。
   * 【选之前不写】与 bootTap 里「缺 meta 不接管」同一条纪律：玩家没确认之前，
   *   一个字节都不落盘，否则捞回来的档会被当前这局二次覆盖。 */
  var lateArmed = false, lateScanned = false, lateBarShown = false;
  function armLateRescue() {
    if (lateArmed) return;
    lateArmed = true;
    var deadline = freshBootAt + gateCfg('LATE_MS', 180000);
    function step() {
      if (!S) { releaseNativeHold(); return; }
      if (Date.now() > deadline) { releaseNativeHold(); return; }
      if (!capReady()) { root.setTimeout(step, 500); return; }
      lateScan();
    }
    root.setTimeout(step, 500);
  }
  function lateScan() {
    if (lateScanned) return;
    lateScanned = true;
    var scan;
    try { scan = SB.store.scanSaveCandidates(CFG.RUN_KEY, CFG.SAVE_KEY); }
    catch (e) { releaseNativeHold(); return; }
    scan.then(function (res) {
      /* ⚠️ 不能只看 res.best：best 是按 seq 排的第一名，而当前这局的 seq 最新
       *   ⇒ best 恒等于「我们自己刚写的这份」，永远判不出「有更早但更完整的档」。
       *   必须把**全部候选**按（周目, 时长）取最大，再跟内存档比。 */
      var pick = null;
      (res && res.candidates ? res.candidates : []).forEach(function (c) {
        if (!c || !c.metaRaw) return;          /* 缺 meta 不许接管，见 bootTap 同款判据 */
        var t = 0;
        try { t = Number(JSON.parse(c.runRaw).t) || 0; } catch (e) { return; }
        var rank = (Number(c.cycle) || 0) * 1e9 + t;
        if (!pick || rank > pick.rank) pick = { rank: rank, cand: c, t: t, cycle: Number(c.cycle) || 0 };
      });
      if (!pick) { releaseNativeHold(); return; }
      var myT = (S && typeof S.t === 'number') ? S.t : 0;
      var myCycle = (meta && meta.cycle) || 0;
      /* 「更完整」= 周目更高，或同周目且时长多出 60 秒以上（刚起来那几个 tick 不算）。 */
      var better = pick.cycle > myCycle || (pick.cycle === myCycle && pick.t > myT + 60);
      if (!better) { releaseNativeHold(); return; }
      offerLateRescue(pick.cand, pick.t, pick.cycle);
    }, function () { releaseNativeHold(); });
  }
  function offerLateRescue(hit, hitT, hitCycle) {
    if (lateBarShown) return;
    var bar = null;
    try { bar = document && document.body ? document.createElement('div') : null; } catch (e) { bar = null; }
    if (!bar) { releaseNativeHold(); return; }   /* 画不出条就别把保护卡住 */
    lateBarShown = true;
    var btn = 'padding:7px 14px;border-radius:8px;font-size:13px;cursor:pointer;';
    bar.id = 'lateSaveBar';
    bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:100003;'
      + 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;'
      + 'padding:10px 12px;border-radius:10px;background:rgba(12,22,34,.97);'
      + 'border:1px solid rgba(214,178,94,.55);color:#e8eef6;'
      + 'font:13px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;'
      + 'box-shadow:0 6px 24px rgba(0,0,0,.45);';
    bar.innerHTML = '<span>找到一份更完整的存档（第 ' + (hitCycle || 1) + ' 周目 · '
      + (hitT / 3600).toFixed(2) + ' 小时），要载入吗？</span>'
      + '<button type="button" id="lateSaveUse" style="' + btn
      + 'border:0;background:#d6b25e;color:#10202f;font-weight:600;">载入这份</button>'
      + '<button type="button" id="lateSaveKeep" style="' + btn
      + 'border:1px solid rgba(232,238,246,.34);background:transparent;color:#e8eef6;">继续当前</button>';
    try { document.body.appendChild(bar); } catch (e) { releaseNativeHold(); return; }
    function dismiss(msg) {
      try { if (bar.parentNode) bar.parentNode.removeChild(bar); } catch (e) {}
      releaseNativeHold();
      if (msg) { try { log(msg); } catch (e) {} }
    }
    var keep = document.getElementById('lateSaveKeep');
    if (keep) keep.onclick = function () { dismiss('已忽略本机找到的旧档，继续当前这一局。'); };
    var use = document.getElementById('lateSaveUse');
    if (use) use.onclick = function () {
      /* 先解保护再接管：adoptBundle 会走 writeNativeSaveSync，保护开着等于白写。 */
      releaseNativeHold();
      try {
        adoptBundle({ format: 'shellbreak-save', version: 1,
          save: { meta: JSON.parse(hit.metaRaw), run: JSON.parse(hit.runRaw) } });
      } catch (e) {
        dismiss('旧档载入失败：' + (e && e.message ? e.message : e));
        return;
      }
      /* ⚠️ 这里**不能**再调 bootUi()：主循环已经在跑，重复调用会二次 setInterval(loop)
       *   ⇒ 双倍 tick（见 boot 拆两段那段注释）。adoptBundle → resumeRun 已经 renderAll，
       *   循环读的是模块级 S，自然接手。 */
      if (SB.store && SB.store.diagSet) {
        try { SB.store.diagSet({ boot: 'late-rescue:' + hit.source, bootAt: Date.now() }, true); } catch (e) {}
      }
      dismiss('已载入本机找到的旧档（来源：' + hit.source + '）。');
    };
  }
  /* boot 的第二段：从「S 已就绪」到「主循环起来」的全部 UI 接线。
   * 只在 decideRun/boot 里各调一次，不重复调用（见上面那条重复 setInterval 的警告）。 */
  function bootUi() {
    /* 2026-10-24 成就系统（docs/ACHV_DESIGN_v0.3.md §六）：boot 宽限补发——老玩家跨周目
     * 账本里已达成、但本地成就账本漏记的条件（religionSeen / memorialWonders /
     * buildingLvlTotal 全表）在这里统一复判补记。只补本地账（成就墙真源），平台侧由
     * unlockOnce 的「ID 未回填不请求」兜底自然跳过，不产生任何线上请求。 */
    if (SB.achv && SB.achv.syncMeta) SB.achv.syncMeta(meta);
    SB.ui.render.initTabs();
    SB.ui.render.initSpeeds();
    var pendingBreak = !!(S && S.broken && S.shellOpened && !S.breakSettled);
    if (pendingBreak) {
      var report = SB.prestige.breakReport(S);
      if (!SB.prestige.qualified(S)) { report.tidePoints = 0; report.locked = true; }
      SB.ui.render.showBreakPanel(report);
    } else {
      /* 启动自动弹窗（2026-10-28 恢复原样）：解锁叙事×3 + 新手引导层。
       * ⚠️ 只弹「启动时该弹的那些」，各功能自己的入口（页签、设置里的更新日志按钮）
       *   一律保留；`pendingBreak`（破壳结算）是必须玩家选择的存档节点，不在此列。
       * ⚠️ 顺序不能换：解锁叙事先于引导层 —— 引导的步骤文案按「页签已解锁」写。 */
      maybeSciencePopup(S);   // 兜底：读档 / 硬重置后若门槛已过，仍然把开门那一刻补播
      maybeReligionPopup(S);  // 兜底：读档 / 硬重置后若神学已过，仍然把宗教弹窗补播
      maybeTabUnlockPopups(S); // 兜底：读档 / 硬重置后补播各系统页签的首次解锁叙事
      if (SB.onboarding && SB.onboarding.start) SB.onboarding.start(S);  // 首局新手引导（门控内部：设置关/已播过则早退）
      /* 更新日志红点（2026-10-28 起取代自动弹窗）：纯视觉角标，不抢焦点、不遮挡、
       * 不参与 #modal 竞争。必须排在叙事/引导之后 —— 它们会开 #modal 并清点页脚状态。 */
      syncChangelogDot();
    }
    var _btnBreak = document.getElementById('btnBreak');
    if (_btnBreak) _btnBreak.onclick = function () {
      var S0 = SB.game.run();
      if (!S0) return;
      /* 飞升虚境：重播终局演出（4 帧序列 → 虚境面板 →「轮回」按钮再走 askResetRun）。
       * 用户 2026-10-27 拍板「飞升虚境也是触发飞升虚境动画，然后结算」——这条链
       * showAscendVoid 内部本来就完整，这里只负责把玩家从主控区重新送进去：
       * 否则他在 dysonDone 那一刻点过「继续游玩」之后，就再也没有入口回看终局。 */
      if (S0.dysonDone && S0.civics && S0.civics.ascend_void && SB.ui.render.showAscendVoid) {
        SB.ui.render.showAscendVoid(S0);
        return;
      }
      /* 已结算但留在本局（breakSettled=true，选过「探索壳外的星空」或刷新过）的局：直接重开结算面板
       * （mNext=开始轮回/重开本周目）。否则 askResetRun→doBreak 会因 breakSettled 提前返回而什么都不做，死局。 */
      if (S0.breakSettled) SB.ui.render.showBreakPanel(SB.prestige.breakReport(S0));
      else askResetRun();
    };
    /* 未破壳时的「轮回 / 重开本周目」出口（2026-10-27 补回 2026-10-21 合并双按钮时丢掉的那一半）。
     * 原底栏 btnReset 是**随时可点**的，合并进 btnBreak 后继承了它的 disabled（壳必须归零），
     * 于是「研究完《神学》但还没凿穿」的局没有任何轮回入口，只剩「清空存档」（连 meta 一起抹）。
     * 这里走同一个 askResetRun：qual（= 本局研究完《神学》）决定发不发轮回点，不写第二份判据。 */
    var _btnCycle = document.getElementById('btnCycle');
    if (_btnCycle) _btnCycle.onclick = function () { askResetRun(); };
    document.getElementById('btnWipe').onclick = function () {
      SB.ui.render.confirmPanel({
        title: '清空存档？',
        body: '<div class="warnbox">这会删掉<b>全部跨周目进度</b>：轮回点、破层层级、已购增益、科技记录，以及当前这局的一切。</div>' +
              '<div class="note">页面会回到第 1 周目的全新状态。此操作不可撤销。</div>',
        danger: true,
        requireCheck: '我明白这会抹掉全部轮回点与破层层级，且无法撤销',
        ok: '清空存档',
        onOk: function () { SB.game.wipeSave(); }
      });
    };
    var btnAd = document.getElementById('btnAd');
    if (btnAd) btnAd.onclick = function () {
      /* ⚠️ 不可白送：只有 SB.ad.show 判定「看完」才发奖。
       * 原先这里有 `if (!SB.ad) grantAdBoost()` 的兜底，等于没广告也能拿加速，已删。 */
      if (!SB.ad || !SB.ad.available || !SB.ad.available()) { log('广告暂不可用。'); return; }
      SB.ad.show(
        function () { grantAdBoost(); },
        function (why) { log(why === 'unavailable' ? '广告暂不可用。' : '广告未看完，未发放加速。'); }
      );
    };
    var btnAdTog = document.getElementById('btnAdToggle');
    if (btnAdTog) btnAdTog.onclick = function () { toggleAdBoost(); };
    var btnAdRebirth = document.getElementById('btnAdRebirth');
    if (btnAdRebirth) btnAdRebirth.onclick = function () {
      if (!SB.ad || !SB.ad.available || !SB.ad.available()) { log('广告暂不可用。'); return; }
      SB.ad.show(
        function () { grantRebirthAd(); },
        function (why) { log(why === 'unavailable' ? '广告暂不可用。' : '广告未看完，未发放轮回点。'); }
      );
    };
    var btnRank = document.getElementById('btnRank');
    if (btnRank) btnRank.onclick = function () {
      if (SB.ui && SB.ui.render && SB.ui.render.openRankChooser) SB.ui.render.openRankChooser();
    };
    /* 页脚「更新日志」（2026-10-27 恢复 / 2026-10-28 改为红点驱动）：玩家随时可以回看，
     * 不再是「首入自动弹」。点开的这一刻才记已读并熄红点（见 markChangelogSeen）。 */
    var btnChangelog = document.getElementById('btnChangelog');
    if (btnChangelog) btnChangelog.onclick = function () {
      if (!(SB.ui && SB.ui.render && SB.ui.render.openChangelog)) return;
      SB.ui.render.openChangelog();
      markChangelogSeen();
    };
    /* ⚙ 设置 → 自动点击开关（2026-10-28）：绑定 + 首帧同步。
     * 之后每次 renderAll（2 秒一次 / 任意置脏）都会再同步一次 —— 购买 perks 后
     * 那个 disabled 的 checkbox 就是这么自动解禁的，不需要买家自己去通知 UI。 */
    bindAutoClickSetting();
    syncAutoClickSetting();
    /* 关标签页 / 刷新前立刻落盘：有 5 秒节流在，玩家在这一窗口里刷新就会丢最后几秒，
     * 具体丢掉的是生育计时 _grow 这类累加量——进度条看着像「刷新归零」。 */
    function flush() { if (!suppressExitSave && S && !S.broken) SB.state.saveRun(snapshot(S)); }
    if (root.addEventListener) root.addEventListener('pagehide', flush);
    if (root.tap && typeof root.tap.onHide === 'function') root.tap.onHide(function () {
      flush();
      if (SB.store && SB.store.flushNativeSync && !SB.store.flushNativeSync()) {
        if (SB.store.diagSet) SB.store.diagSet({ err: '后台原生文件同步保存未确认' }, true);
      }
    });
    if (document && document.addEventListener) document.addEventListener('visibilitychange', function () {
      /* A 项省电：切后台/锁屏时给 <html> 打 vis-hidden，CSS 据此暂停所有 infinite 动画
       * （atmosphere-drift / p0-tide 等），GPU 合成线程随之 idle，不再空转发热。 */
      if (document.documentElement) document.documentElement.classList.toggle('vis-hidden', !!document.hidden);
      if (document.hidden) flush();
    });
    /* 初始态同步一次（极端情况：页面在 hidden 状态下完成首次渲染）。 */
    if (document.documentElement) document.documentElement.classList.toggle('vis-hidden', !!(document && document.hidden));
    if (root.setInterval) root.setInterval(loop, TICK_MS);
  }

  /* ERA10（2026-10-20）：轮回确认流程 —— 顶栏「重置/轮回」钮与戴森球通关弹窗的「立即轮回」钮
   * **共用这一份**（确认面板 + 结算预览 + doBreak 分流），不写第二套。
   * ⚠️ 必须住在模块作用域：下面 SB.game 的导出块在 boot() 之外，函数若留在 boot() 里，
   *    `askReset: askResetRun` 在**脚本加载时**就抛 ReferenceError（2026-10-20 首跑 e2e 撞到，
   *    e2e 报「启动即抛错」，整局回归一条都没跑）。 */
  function askResetRun() {
    var S0 = SB.game.run();
    var t = S0 ? (S0.t / 3600).toFixed(2) + ' 小时 · 峰值族民 ' + S0.peak + ' · 建筑 ' + SB.economy.lvlSum(S0) + ' 级' : '';
    /* 结算分流（2026-10-05 拍板）：本局研究完《神学》⇒ 走真正轮回结算 doBreak
     * （发点 + 并入旧日遗产账本）；未研究 ⇒ 仅软重置 resetRun，不结算、不发点。
     * 分流判据与 prestige.qualified 同源（本局 civics.theology 真值），不另写第二份。 */
    var qual = SB.game.routeReset(S0) === 'break';
    var rep = qual ? SB.prestige.breakReport(S0) : null;
    var gained = rep ? rep.tidePoints : 0;
    var stardustGained = rep ? rep.stardust : 0;
    /* 旧日遗产入账预览：与 doBreak ②③④⑤ 完全同口径（剩余信仰 / 未入藏奇观 / 完整件数），
     * 只做展示不落账——真正的写入只发生在 onOk 的 doBreak 里，这里不产生第二份真相。 */
    var faithAmt = 0, artN = 0, steleN = 0, newW = 0;
    if (qual && S0) {
      faithAmt = Math.max(0, (S0.res && S0.res.faith) || 0);
      artN = Math.floor(Math.max(0, (S0.res && S0.res.artwork) || 0));
      steleN = Math.floor(Math.max(0, (S0.res && S0.res.tidalRecord) || 0));
      var meta0 = state();
      if (S0.wonders && meta0.memorialWonders)
        for (var wid in S0.wonders)
          if (S0.wonders[wid] && !meta0.memorialWonders[wid]) newW++;
    }
    SB.ui.render.confirmPanel({
      title: qual ? '轮回（结算并发放轮回点）？' : '重开本周目？',
      body: '<div class="warnbox">当前这局的进度会全部作废：' + t + '。</div>' +
        (qual
          ? '<div class="note">本次轮回将结算并发放：<b>' + gained.toFixed(2) + ' 轮回点</b>、<b>' + stardustGained + ' 星屑</b>' +
            '（轮回点按峰值族民、建筑纪元、工坊解锁项与破壳进度计算；星屑按太空设施、星空探索与戴森球进度计算）。</div>' +
            '<div class="note">旧日遗产入账：剩余信仰 <b>' + SB.economy.fmtAmt(faithAmt) + '</b>' +
            '（并入跨周目总量，按数量级给全产加成）；纪念奇观新入藏 <b>' + newW + '</b> 座' +
            '（每座 +1% 科技/市政获取）；旧日艺术品 <b>' + artN + '</b> 件（固定市政点/秒）；' +
            '旧日潮纹碑石 <b>' + steleN + '</b> 件（固定科技点/秒）。</div>' +
            '<div class="note">已持有的跨周目资产（轮回点、破层层级、已购增益、科技记录）继续保留。周目计数会 +1。</div>'
          : '<div class="note">（未研究《神学》）此次仅重开本周目：不结算、不发放轮回点、不入账旧日遗产。</div>' +
            '<div class="note">已持有的跨周目资产继续保留。周目计数会 +1。</div>'),
      ok: qual ? '轮回' : '重开',
      onOk: function () {
        if (!S0) return;
        /* 已结算但留在本局（breakSettled=true：选过「探索壳外的星空」/ 刷新过 / 戴森竣工窗入口）的局：
         * 结算早在首次破壳时已成并入账，此处若再调 doBreak 会被 breakSettled 提前返回而什么都不做（死局）。
         * 直接走真正的周期切换 nextCycle（clearRun + startRun）。 */
        if (S0.breakSettled) { SB.game.nextCycle(); return; }
        if (qual) SB.prestige.doBreak(S0, emit); else SB.game.resetRun();
      }
    });
  }

  SB.game = {
    run: run, meta: state, getTab: getTab, setTab: setTab, setSpeed: setSpeed,
    stardustShopUnlocked: stardustShopUnlocked, unlockStardustShop: unlockStardustShop,
    getSpeed: function () { return speed; },
    runtimeStatus: function () {
      return {
        speed: speed,
        loopAgeMs: last > 0 && root.performance && root.performance.now
          ? Math.max(0, root.performance.now() - last) : null,
        catchupActive: !!loop.job,
        queuedGameSeconds: Number(loop.acc) || 0,
        tickMs: TICK_MS,
        batchTicks: Number(loop._lastBatchTicks) || 0,
        batchFastTicks: Number(loop._lastBatchFastTicks) || 0,
        batchMs: Number(loop._lastBatchMs) || 0,
        batchSimSeconds: Number(loop._lastBatchSimSeconds) || 0,
      };
    },
    adMul: adMul, grantAdBoost: grantAdBoost, toggleAdBoost: toggleAdBoost,
    grantRebirthAd: grantRebirthAd, adRebirthState: adRebirthState, todayKey: todayKey,
    startRun: startRun, nextCycle: nextCycle, stay: stay, recordLaunch: recordLaunch,
    syncSpacecraft: syncSpacecraft,
    resetRun: resetRun, routeReset: routeReset, wipeSave: wipeSave, settleBreak: settleBreak,
    /* ERA10（2026-10-20）：轮回确认流程导出——戴森球通关弹窗的「立即轮回」钮复用
     * （与顶栏「重置/轮回」按钮同一份 confirmPanel + doBreak 逻辑，不写第二套）。 */
    askReset: askResetRun,
    /* 离线补算核心函数暴露为调试/测试入口（纯接口，逻辑仅在上面定义处）。
     * 供 sim/_probe_offline_ad.mjs 等探针直接驱动离线补算、复用生产路径，
     * 不在任何 UI 调用链上，不影响在线行为。 */
    planCatchUp: planCatchUp, drainCatchUp: drainCatchUp,
    log: log, emit: emit, markDirty: markDirty, pumpTech: pumpTech, pumpCivic: pumpCivic,
    fmtDur: fmtDur,
    maybeReligionPopup: maybeReligionPopup,
    maybeGovNamingPopup: maybeGovNamingPopup, confirmGovName: confirmGovName,
    render: render, renderAll: renderAll, boot: boot, snapshot: snapshot,
    installImportedSave: installImportedSave, restoreRawSave: restoreRawSave,
    /* 2026-10-28 P0：云端救援的就地接管入口（不 reload）。导出供 e2e 直接钉住
     * 「接管后 S/meta 正确、且没有触发 reload」。 */
    adoptBundle: adoptBundle,
    /* 2026-10-29：恢复暂停界面的「确认没有旧档，开新局」出口（面板二次确认后调用）。 */
    forceFreshBoot: forceFreshBoot,
    showBreakPanel: function (r) { SB.ui.render.showBreakPanel(r); },
    showBreakAnimation: function (r, afterAnimation) { SB.ui.render.showBreakAnimation(r, afterAnimation); },
    submitRankOnBreak: submitRankOnBreak,
    submitRankPeriodic: submitRankPeriodic
  };
})(typeof window !== 'undefined' ? window : globalThis);
