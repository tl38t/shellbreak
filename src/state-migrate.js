/* 天壳 / SHELLBREAK — 存档迁移。由 state.js 提供 freshRun 默认模板。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var migrations = SB.stateMigrations || (SB.stateMigrations = {});

  /* 存档迁移：旧档缺新键（如 P1 新增的 weir/warmnest/ballast）时，
   * undefined 会顺着 lvlSum / costOf 污染成 NaN——破壳系数、壳厚、建筑成本全灭，
   * 玩家看到的是「NaN / 200000」和一排 NaN 价格。以 freshRun 为底逐键合并，
   * 非有限数（含 JSON 里的 null）一律回默认值，未知顶层字段丢弃。
   * 旧档永远能安全载入，新加字段不再需要玩家清档。 */
  function migrateRun(raw, freshRun, emptyPerks) {
    var base = freshRun(false);
    if (!raw || typeof raw !== 'object') return base;
    var out = {}, k;
    for (k in base) out[k] = base[k];
    for (k in raw) if (k in base) out[k] = raw[k];
    if (raw.challenge && typeof raw.challenge === 'object' && SB.challenges && SB.challenges.byId(raw.challenge.id)) {
      var challengeDef = SB.challenges.byId(raw.challenge.id);
      out.challenge = { id: raw.challenge.id,
        tier: Math.max(0, Math.min(challengeDef.tiers.length - 1, raw.challenge.tier | 0)),
        startedAt: typeof raw.challenge.startedAt === 'number' && isFinite(raw.challenge.startedAt) && raw.challenge.startedAt > 0
          ? raw.challenge.startedAt : 0 };
    } else out.challenge = null;
    var repairedResources = [];
    function fixTable(obj, ref, repairKeys) {
      var o = {}, key;
      for (key in ref) {
        var v = obj ? obj[key] : undefined;
        if (repairKeys && obj && Object.prototype.hasOwnProperty.call(obj, key)
            && !(typeof v === 'number' && isFinite(v))) repairKeys.push(key);
        o[key] = (typeof v === 'number' && isFinite(v)) ? v : ref[key];
      }
      return o;
    }
    out.res = fixTable(raw.res, base.res, repairedResources);
    /* 旧档破壳后可能已经点过「留在这一局」（broken 被复位）。壳厚为 0
     * 表示本周目已经破壳；补上一次性结算标记，避免读档后重复发轮回奖励。 */
    out.shellOpened = raw.shellOpened === true || (typeof raw.shell === 'number' && raw.shell <= 0);
    /* 旧版壳厚归零时已自动发放结算，因此旧存档归零状态视为已结算；新版本会显式保存 shellOpened。 */
    out.breakSettled = raw.breakSettled === true || (!Object.prototype.hasOwnProperty.call(raw, 'shellOpened') && typeof raw.shell === 'number' && raw.shell <= 0);
    var rawCraft = Array.isArray(raw.spacecraft) ? raw.spacecraft : [];
    out.spacecraft = [];
    var knownBodies = { europa: true, saturn: true };
    if (SB.STAR_MAP_BODIES) for (var bi = 0; bi < SB.STAR_MAP_BODIES.length; bi++)
      knownBodies[SB.STAR_MAP_BODIES[bi].id] = true;
    for (var sci = 0; sci < rawCraft.length && out.spacecraft.length < 200; sci++) {
      var craft = rawCraft[sci];
      if (!craft || typeof craft !== 'object') continue;
      if (craft.type !== 'satellite' && craft.type !== 'station') continue;
      if (!Object.prototype.hasOwnProperty.call(knownBodies, craft.body)) continue;
      if (typeof craft.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(craft.id)) continue;
      out.spacecraft.push({ id: craft.id, type: craft.type, body: craft.body,
        name: typeof craft.name === 'string' ? craft.name.slice(0, 50) : '',
        launchedAt: typeof craft.launchedAt === 'number' && isFinite(craft.launchedAt) ? craft.launchedAt : 0 });
    }
    /* 这是一次性诊断信息，不参与游戏数据，也不落盘。
     * JSON.stringify(NaN) 会把 NaN 写成 null；读档保护只能把它回落到默认值 0，
     * 但玩家需要知道这是旧档损坏的结果，而不是资源产出逻辑主动清零。 */
    Object.defineProperty(out, '_repairedResources', {
      value: repairedResources,
      enumerable: false,
      configurable: true
    });
    out.lvl = fixTable(raw.lvl, base.lvl);
    /* 发射场各自保存帆/节点周期余数。旧版只有共用的 sunSailProc / dysonProc，
     * 将这份余数迁到首个已建发射场，避免升级后丢失已有进度或复制出多份进度。 */
    var _launchIds = [], _launchDefs = SB.BUILDINGS || [];
    for (var _li = 0; _li < _launchDefs.length; _li++)
      if (_launchDefs[_li].launchpad) _launchIds.push(_launchDefs[_li].id);
    if (!_launchIds.length) _launchIds = ['europa_launch', 'terra_launch', 'enceladus_launch'];
    var _legacyLaunchTarget = '';
    for (var _lt = 0; _lt < _launchIds.length; _lt++) {
      if ((out.lvl && out.lvl[_launchIds[_lt]]) > 0) { _legacyLaunchTarget = _launchIds[_lt]; break; }
    }
    if (!_legacyLaunchTarget) _legacyLaunchTarget = _launchIds[0] || '';
    var _rawLaunchProcs = raw.launchProcs && typeof raw.launchProcs === 'object' && !Array.isArray(raw.launchProcs)
      ? raw.launchProcs : null;
    out.launchProcs = {};
    for (var _li2 = 0; _li2 < _launchIds.length; _li2++) {
      var _launchId = _launchIds[_li2], _rawLaunchProc = _rawLaunchProcs && _rawLaunchProcs[_launchId];
      var _sailProc = _rawLaunchProc && typeof _rawLaunchProc.sail === 'number'
        && isFinite(_rawLaunchProc.sail) && _rawLaunchProc.sail >= 0
        ? _rawLaunchProc.sail
        : (!_rawLaunchProcs && _launchId === _legacyLaunchTarget
          && typeof raw.sunSailProc === 'number' && isFinite(raw.sunSailProc) ? Math.max(0, raw.sunSailProc) : 0);
      var _nodeProc = _rawLaunchProc && typeof _rawLaunchProc.node === 'number'
        && isFinite(_rawLaunchProc.node) && _rawLaunchProc.node >= 0
        ? _rawLaunchProc.node
        : (!_rawLaunchProcs && _launchId === _legacyLaunchTarget
          && typeof raw.dysonProc === 'number' && isFinite(raw.dysonProc) ? Math.max(0, raw.dysonProc) : 0);
      out.launchProcs[_launchId] = { sail: _sailProc, node: _nodeProc };
    }
    /* 发射场按场启停：老档缺少此字段时默认全开；非法值按各场等级夹回范围。 */
    var _rawLaunchStops = raw.launchStops && typeof raw.launchStops === 'object' && !Array.isArray(raw.launchStops)
      ? raw.launchStops : {};
    out.launchStops = {};
    for (var _lsi = 0; _lsi < _launchIds.length; _lsi++) {
      var _stopId = _launchIds[_lsi], _stopValue = _rawLaunchStops[_stopId];
      var _stopTotal = Math.max(0, Math.floor(out.lvl[_stopId] || 0));
      if (typeof _stopValue !== 'number' || !isFinite(_stopValue)) _stopValue = 0;
      out.launchStops[_stopId] = Math.max(0, Math.min(_stopTotal, Math.floor(_stopValue)));
    }
    /* 砂矿坑启停（2026-10-21）：保存停用数，与巢穴页其它可开关建筑一致。
     * 将上一版工坊控件保存的 autoDrillCount（运行数）换算为停用数，保留玩家已调好的数量；
     * 没有这个新字段/旧运行数时默认全开，因为旧 autoDrillOn 只控制自动化加成，不代表矿坑停产。 */
    var _pitTotal = Math.max(0, Math.floor(out.lvl.siltpit || 0));
    if (!(typeof raw.siltpitStop === 'number' && isFinite(raw.siltpitStop))) {
      var _oldActive = (raw.upgrades && raw.upgrades.upg_autodrill
        && typeof raw.autoDrillCount === 'number' && isFinite(raw.autoDrillCount))
        ? Math.max(0, Math.min(_pitTotal, Math.floor(raw.autoDrillCount))) : _pitTotal;
      out.siltpitStop = _pitTotal - _oldActive;
    }
    out.siltpitStop = Math.max(0, Math.min(_pitTotal, Math.floor(out.siltpitStop || 0)));
    /* 2026-10-26：未研究《自动化钻探》时巢穴面板不渲染砂矿坑开关（render-pane-village.js
     *   同判据）。旧 UI 允许无升级也停用；开关隐藏后这批存档会「被停产却无法恢复」——
     *   基础矿脉加成持续被扣、玩家既看不到入口也解不开。故无升级一律清零。 */
    if (!(out.upgrades && out.upgrades.upg_autodrill)) out.siltpitStop = 0;
    /* 工坊启停：新字段保存停用数。旧版工业机器人全局开关为 false 时迁成工坊全停，
     * 保持停机且不突然增加热液能消耗；旧版开启或尚无该开关时按正常建筑缺省全开。 */
    var _workshopTotal = Math.max(0, Math.floor(out.lvl.workshop || 0));
    if (!(typeof raw.workshopStop === 'number' && isFinite(raw.workshopStop))) {
      out.workshopStop = (raw.upgrades && raw.upgrades.upg_indrobot && raw.indRobotOn === false)
        ? _workshopTotal : 0;
    }
    out.workshopStop = Math.max(0, Math.min(_workshopTotal, Math.floor(out.workshopStop || 0)));
    /* 2026-10-26：未研究《工业机器人》时巢穴面板不渲染工坊开关（同砂矿坑口径）。
     *   旧 UI 下已停用的工坊数量清零，避免开关消失后工艺效率被永久扣减且无法恢复。 */
    if (!(out.upgrades && out.upgrades.upg_indrobot)) out.workshopStop = 0;
    /* 热泉炉「开几座」迁移（2026-09-30）：旧档只有布尔 `furnaceOn`（见 freshRun 那条注）。
     *   false ⇒ 全部停（停用数 = 当前等级）；true / 缺键 ⇒ 全开（0）。
     *   再夹到 [0, lv]：存了一个比等级还大的停用数时，运行座数会算成负数。
     *   ⚠️ 必须在 fixTable(raw.lvl) 之后——判据要用到迁移后的等级。 */
    if (raw.furnaceOn === false) out.furnaceStop = out.lvl.furnace || 0;
    if (!(typeof out.furnaceStop === 'number' && isFinite(out.furnaceStop))) out.furnaceStop = 0;
    out.furnaceStop = Math.max(0, Math.min(Math.floor(out.furnaceStop), out.lvl.furnace || 0));
    /* 热液汽轮机「开几座」迁移（2026-10-07）：与 furnaceStop 同口径——无旧档布尔，仅夹到 [0, lv]
     *   防存档里写入非法的超大停用数（运行座数会算成负数）。必须在 fixTable(raw.lvl) 之后。 */
    if (!(typeof out.turbineStop === 'number' && isFinite(out.turbineStop))) out.turbineStop = 0;
    out.turbineStop = Math.max(0, Math.min(Math.floor(out.turbineStop), out.lvl.hydroturbine || 0));
    /* 热液工坊「开几座」迁移（2026-10-07）：与 turbineStop 同口径——无旧档布尔，仅夹到 [0, lv]。 */
    if (!(typeof out.hydroshopStop === 'number' && isFinite(out.hydroshopStop))) out.hydroshopStop = 0;
    out.hydroshopStop = Math.max(0, Math.min(Math.floor(out.hydroshopStop), out.lvl.hydroshop || 0));
    /* ERA8：生物材料研究所启停数；老档缺省全开，非法 / 超等级值夹回有效区间。 */
    if (!(typeof out.biomatlabStop === 'number' && isFinite(out.biomatlabStop))) out.biomatlabStop = 0;
    out.biomatlabStop = Math.max(0, Math.min(Math.floor(out.biomatlabStop), out.lvl.biomatlab || 0));
    /* ERA8 B7：机器人分配池。老档（本字段加入前就建了 robotbay 的本局 / 读旧档）缺省 {}；
     * 否则 render-pane-folk 读 s.robotJobs[id] 会抛「Cannot read properties of undefined」⇒
     * 整页 renderAll 崩掉、族民页所有点击（人类＋/机器人＋/×N 步长）看起来全死。
     * 与 render-pane-folk 的 `var rjobs = s.robotJobs || {}` 读侧兜底同源：迁移补种子 + 渲染兜底双闸。 */
    if (!out.robotJobs || typeof out.robotJobs !== 'object') out.robotJobs = {};
    /* ⚠️ 城堡「真升级」老档迁移（2026-10-06）。
     *   背景：`castle` 建筑是 2026-09-30 起的误读实装（把「由议事厅升级而来」做成
     *   need:'hall' 前置 + 一座**独立**建筑），已于本轮从 BUILDINGS 删除。删掉之后
     *   `fixTable(raw.lvl, base.lvl)` 会**静默丢掉**存档里的 `lvl.castle`
     *   ——玩家在那座误造建筑上花掉的石头/珊瑚买来的等级会凭空消失。
     *   所以这里先把它并回 `lvl.hall`（城堡本就是议事厅的升级形态，等级理应归它）。
     *   ⚠️ 幂等：读一次之后存档里 castle=0，重复读档不会二次相加。 */
    var _legacyCastle = (raw.lvl && typeof raw.lvl.castle === 'number' && isFinite(raw.lvl.castle))
      ? Math.max(0, Math.floor(raw.lvl.castle)) : 0;
    if (_legacyCastle > 0) {
      out.lvl.hall = (out.lvl.hall || 0) + _legacyCastle;
      out.lvl.castle = 0;
    }
    out.jobs = fixTable(raw.jobs, base.jobs);
    /* 市政台账加固。⚠️ 这里**不能**用上面的 fixTable：那是按 `ref` 的键遍历的，
     *    而 base.civics 是空表 `{}` ⇒ 遍历出空对象 ⇒ **所有已完成的市政被清空**，
     *    症状是「刷新之后市政树重置了，政体却还在」（政体/政策卡是标量、走的是
     *    上面 173-174 行的直接拷贝，只有这张表整张没了）。2026-09-27 实证复现。
     *   ⇒ 正确做法 = 按**数据定义**（SB.CIVICS）逐个 id 取，缺的补 false。
     *   ⚠️ 顺带兜住「存档里有、数据里已删」的 id：它照原样留下，而不是被静默丢弃
     *    ——那种 id 只影响一次读档，丢掉它换不回任何好处，反而让「存档凭空少东西」。 */
    out.civics = {};
    var rawCivics = (raw.civics && typeof raw.civics === 'object') ? raw.civics : {};
    if (SB.CIVICS && typeof SB.CIVICS.forEach === 'function') {
      /* ⚠️ 值统一归一成布尔：`!!`（且只认**真值**）。
       *    早期 civics.research 写的是 `1`，而这里是 `true` —— 同一个存档里两种值都可能
       *    存在（`if (s.civics[id])` 都算已完，但 `=== 1` / `=== true` 这种逐个比对就会
       *    一半错一半对）。归一之后读回的值域只有一种，别处不必猜。 */
      SB.CIVICS.forEach(function (c) { out.civics[c.id] = !!rawCivics[c.id]; });
    } else {
      out.civics = Object.assign({}, rawCivics);
    }
    for (k in rawCivics) if (!(k in out.civics)) out.civics[k] = !!rawCivics[k];
    /* 政体采用台账：旧档将当前政体视为已采用，避免切走后重复享受免费；
     * 其它政体仍可各自享受首次采用免费。 */
    out.govAdopted = {};
    var rawGovAdopted = (raw.govAdopted && typeof raw.govAdopted === 'object') ? raw.govAdopted : {};
    var _GL = SB.GOVS || [];
    for (var _gi = 0; _gi < _GL.length; _gi++) {
      var _gid = _GL[_gi].id;
      out.govAdopted[_gid] = !!rawGovAdopted[_gid];
    }
    if (out.gov && out.govAdopted[out.gov] !== undefined) out.govAdopted[out.gov] = true;
    /* 奇观买断表加固，口径与上面 civics 那条同源：
     *   ⚠️ 不能用 fixTable(raw.wonders, base.wonders) —— base.wonders 是空表 `{}`，
     *      按 ref 遍历会得出空对象，**所有已建成的奇观被清空**。
     *   按数据定义 SB.WONDERS 逐个 id 取，缺的补 false；存档里多出来的（数据已删的）原样保留。 */
    out.wonders = {};
    var rawWonders = (raw.wonders && typeof raw.wonders === 'object') ? raw.wonders : {};
    var _WL = (SB.WONDERS && SB.WONDERS.length) || [];
    for (var _wi = 0; _wi < _WL; _wi++) out.wonders[SB.WONDERS[_wi].id] = !!rawWonders[SB.WONDERS[_wi].id];
    for (k in rawWonders) if (!(k in out.wonders)) out.wonders[k] = !!rawWonders[k];
    /* 工艺升级项买断表（2026-09-28），与上面 wonders 同口径：
     *   ⚠️ 老档根本没有这个键 —— 但这里不必按 SB.UPGRADES 逐个 id 取（upgrades 只装
     *      「已装」而不表达顺序，且按数据定义逐个取也 OK）：上面那段 `for (k in base)` 的
     *      拷贝已经把 freshRun 的 `{}` 带了过来，缺键的存档落在这里 ⇒ 按没装处理。
     *      需要防御的是另一头：存档里若带了**非对象**的值（旧版本或手工改档），
     *      `s.upgrades[id]` 会读出字符串/数字 ⇒ capOf 里 `matCap * capMul` 变 NaN
     *      ⇒ 整条资源线容量 NaN ⇒ 玩家什么都攒不了。所以非对象一律退回空表。 */
    out.upgrades = (raw.upgrades && typeof raw.upgrades === 'object')
      ? Object.assign({}, raw.upgrades) : (out.upgrades || {});
    /* 工坊自动制作槽：数组逐槽，元素是 null 或 `{id, pct}` / `{id, batch}`。
     *   老档没有这个键 ⇒ freshRun 的 `[]` 已由上面 `for (k in base)` 带过来，不必补默认值；
     *   要防的是另一头：存档里塞了**非数组**或被手改成怪值 ⇒ workshop.autoTick 读到无效档位，
     *   不报错、只是那个槽永远不造（又一条静默断链）。
     *   ⇒ 非数组一律退回空表；元素逐个校验：id 必须是 CRAFTS 里真有的配方、
     *     pct 必须是配置中的比例档位；batch 必须是正安全整数，否则该槽作废。 */
    out.autoSlots = [];
    var _rawSlots = Array.isArray(raw.autoSlots) ? raw.autoSlots : null;
    if (_rawSlots) {
      var _CL = SB.CRAFTS || [], _PL = (SB.CFG && SB.CFG.AUTO && SB.CFG.AUTO.PCTS) || [0.25, 0.5, 0.75, 1];
      var _BMAX = (SB.CFG && SB.CFG.AUTO && SB.CFG.AUTO.BATCH_MAX) || 9007199254740991;
      for (var _ai = 0; _ai < _rawSlots.length; _ai++) {
        var _sl = _rawSlots[_ai];
        if (!_sl || typeof _sl !== 'object') continue;
        var _hit = false, _pi;
        for (_pi = 0; _pi < _CL.length; _pi++) if (_CL[_pi].id === _sl.id) _hit = true;
        if (!_hit) continue;
        var _pOk = false;
        for (_pi = 0; _pi < _PL.length; _pi++) if (_PL[_pi] === _sl.pct) _pOk = true;
        var _bOk = isFinite(_sl.batch) && Math.floor(_sl.batch) === _sl.batch && _sl.batch >= 1 && _sl.batch <= _BMAX;
        if (!_pOk && !_bOk) continue;
        var _cleanSlot = { id: _sl.id };
        if (_pOk) _cleanSlot.pct = _sl.pct;   // 旧档 pct 槽仍兼容；含无上限原料的旧档改按默认批次运行
        if (_bOk) _cleanSlot.batch = _sl.batch;
        out.autoSlots.push(_cleanSlot);
      }
    }
    out.perk = Object.assign(emptyPerks(), (raw.perk && typeof raw.perk === 'object') ? raw.perk : {});
    /* 老档科技名 → 新树 id。2026-09-25 之前只有 8 项平铺科技（calendar/heat/bonework/
     * smelt/pick/ignition/dive/siegeT），不做映射的话玩家研究过的科技会凭空消失、
     * 破壳系数凭空掉一截，看起来像「存档坏了」。映射完再按新树过滤一遍：
     * 指向新树里不存在的 id 直接丢弃，不把垃圾带进运行状态。 */
    out.techs = {};
    var rawTechs = (raw.techs && typeof raw.techs === 'object') ? raw.techs : {};
    var legacy = SB.LEGACY_MAP || {};
    for (k in rawTechs) {
      if (!rawTechs[k]) continue;
      var nid = legacy[k] || k;
      if (SB.TECHS) {
        var hit = false;
        for (var ti = 0; ti < SB.TECHS.length; ti++) if (SB.TECHS[ti].id === nid) hit = true;
        if (!hit) continue;
      }
      out.techs[nid] = true;
    }
    out.techVer = (out.techVer | 0) + 1;   // ⚠️ tech.mul 缓存契约（迁移写入 s.techs 后失效旧缓存）
    /* 政策卡槽升维（2026-09-29）：s.card 单值 → s.cards 数组。
     * ⚠️ 老档只有 `card`（单值）⇒ 迁成 `cards: [card]`（装在第 0 号槽）。
     *    新档直接有 `cards` ⇒ 原样保留。两者都没有 ⇒ 空数组。
     *    s.card 保留为第 0 号槽镜像（与 freshRun 默认一致），方便旧代码读。 */
    if (Array.isArray(raw.cards)) out.cards = raw.cards.map(function (x) { return x || null; });
    else if (raw.card) out.cards = [raw.card];
    else out.cards = [];
    /* 迁移旧存档中的退役卡：新卡说明「取代」但旧档可能仍把两张都留在槽里。
     * 保留槽位索引、只把失效卡清空；效果层也会检查 cardOwned 作第二道防线。 */
    var _policies = SB.POLICIES || [], _pi, _pci;
    for (_pi = 0; _pi < out.cards.length; _pi++) {
      if (!out.cards[_pi]) continue;
      for (_pci = 0; _pci < _policies.length; _pci++) {
        var _policy = _policies[_pci];
        if (_policy.id === out.cards[_pi] && _policy.retiredBy && out.civics[_policy.retiredBy]) {
          out.cards[_pi] = null;
          break;
        }
      }
    }
    out.card = out.cards[0] || null;
    /* 宗教名（2026-09-29）：老档没有这个字段 ⇒ 迁成 ''（未命名）。新档原样保留。 */
    out.religionName = (typeof raw.religionName === 'string') ? raw.religionName : '';
    /* 聚落名（2026-10-17）：老档没有这个字段 ⇒ 迁成 ''（未起名；ERA6+ 沿用「渊海之国」兜底）。
     * 新档原样保留。本轮回有效，轮回 doBreak 后由 state.js 重置为 ''。 */
    out.habitatName = (typeof raw.habitatName === 'string') ? raw.habitatName : '';
    /* 老档没有「科技面板开门」这个机制，玩家的科技页一直是开着的。
     * 于是这里把**缺字段的老档**记账为「弹窗已播」，不回去播一次结绳叙事——
     * 那句话的语境是「第一次知道有今天和明天」，对玩了几小时的老档是废话。
     * ⚠️ 面板开不开仍然由 tech.panelOpen 派生（读结绳的 cond），这里不存那个状态。
     * ⚠️ 必须与下面 civic/faith/workshop/wonder 四个旗同口径：仅当 raw 里**缺**
     *    这个字段（= 真正的老档）才强制 true；现代存档已经正常持久化过 techPopup，
     *    必须保留它自己的值——否则任何一次读档都会把 techPopup 锁成 true，
     *    新玩家重载后永远看不到科技介绍弹窗（实测症状：本地 developed 档
     *    techPopup=true 且 panelOpen=true 却不弹，根因在此）。 */
    if (!Object.prototype.hasOwnProperty.call(raw, 'techPopup'))
      out.techPopup = true;
    /* 其余页签的叙事弹窗也是新加的：老档若已经跨过对应门槛，就视为已经见过，
     * 不把一段「首次发现」的文案倒灌给已经玩过的存档。新档 / 新代码产生的字段
     * 已经在 base 里存在，只有字段缺失时才走这里的兼容判定。 */
    if (!Object.prototype.hasOwnProperty.call(raw, 'civicPopup'))
      out.civicPopup = !!(raw.lvl && raw.lvl.hall > 0);
    if (!Object.prototype.hasOwnProperty.call(raw, 'faithPopup'))
      out.faithPopup = !!(raw.civics && raw.civics.theology);
    if (!Object.prototype.hasOwnProperty.call(raw, 'workshopPopup'))
      out.workshopPopup = !!(raw.lvl && raw.lvl.workshop > 0);
    if (!Object.prototype.hasOwnProperty.call(raw, 'wonderPopup'))
      out.wonderPopup = !!(raw.techs && raw.techs.masonry);

    out.era = (typeof raw.era === 'number' && isFinite(raw.era))
      ? Math.max(1, Math.min(7, Math.floor(raw.era))) : 1;
    /* ⚠️ 尤里卡一律重来：老档根本没有这个字段，而它记录的是「这些条件当时达成了」。
     * 保留一个空壳会让 UI 声称「已揭示」却没揭示。下一 tick 的 discover() 会
     * 按当前真实状态补上，玩家看到的是同一批条件被重新点亮一次。 */
    out.eureka = {};
    /* 达成台账只做类型收口，**不按 eureka 回填**：老档的 eureka 是被 revealEra 整批
     * 刷真的，拿它当「达成过」正是用户指出的那个 bug（条件 0/60、内容却亮着）。
     * 留空之后由 discover() 按真实条件补记，补不上的就该是「未揭露」。 */
    out.eurekaMet = (raw.eurekaMet && typeof raw.eurekaMet === 'object') ? raw.eurekaMet : {};
    /* 补揭示当前纪元。eureka 被清空重来是刻意的（见上面那段注释），
     * 但清空之后若不让当前纪元的节点转可见，回到纪元三的存档打开面板就是一页问号，
     * 玩家会以为存档把科技吃了。条件已达成的不受影响——下一点滴的 discover() 会照常处理。 */
    if (SB.tech && SB.tech.revealEra) SB.tech.revealEra(out, out.era, true);
    out.got = {};
    for (var gk in base.got) {
      out.got[gk] = (raw.got && typeof raw.got[gk] === 'number' && isFinite(raw.got[gk]))
        ? raw.got[gk] : 0;
    }

    /* seen 只收建筑表里真实存在的 id，且值必须是真值——存档手改也进不了坏状态。 */
    out.seen = {};
    for (var si = 0; si < SB.BUILDINGS.length; si++) {
      var bid = SB.BUILDINGS[si].id;
      if (raw.seen && raw.seen[bid]) out.seen[bid] = 1;
    }
    var nums = ['t', 'wallT', 'shell', 'iceShell', 'baseShell', 'pop', 'peak', 'coldTicks',
      'deaths', 'frostDeaths', 'famineDeaths', 'famine', 'happy'];
    for (var i = 0; i < nums.length; i++) {
      var v2 = out[nums[i]];
      if (typeof v2 !== 'number' || !isFinite(v2)) out[nums[i]] = base[nums[i]];
    }

    /* 人口只能按完整个体计数。旧版「公摊面积」给住房上限 +0.5/级，tick 曾把人口
     * 直接钳到这个小数上限，老档因此可能存有 136.5 这类 pop / peak；升级时向上取整，
     * 再遵守当前住房/挑战上限，避免旧存档继续显示小数或越过硬上限。 */
    out.pop = Math.ceil(Math.max(0, out.pop));
    out.peak = Math.ceil(Math.max(0, out.peak));
    if (SB.economy && SB.economy.popCap) out.pop = Math.min(out.pop, SB.economy.popCap(out));
    out.peak = Math.max(out.peak, out.pop);

    /* 人类职业人数也必须是整数，否则 folk.idle = pop - sum(jobs) 会把旧档中的半个人
     * 显示成「闲置 22.5」。旧版自动分配曾留下小数岗位；先四舍五入各职业，再按最终人口
     * 回收超额岗位。仍从尾部职业往前回收，优先保住采集者等早期关键职业。 */
    var _jids = (SB.JOBS || []).map(function (j) { return j.id; });
    var _ji, _jid, _jv, _jcut, _jsum = 0, _jover;
    for (_ji = 0; _ji < _jids.length; _ji++) {
      _jid = _jids[_ji];
      out.jobs[_jid] = Math.max(0, Math.round(out.jobs[_jid] || 0));
      _jsum += out.jobs[_jid];
    }
    _jover = _jsum - out.pop;
    for (_ji = _jids.length - 1; _ji >= 0 && _jover > 0; _ji--) {
      _jid = _jids[_ji]; _jv = out.jobs[_jid] || 0;
      _jcut = Math.min(_jv, _jover);
      out.jobs[_jid] = _jv - _jcut; _jover -= _jcut;
    }

    /* ⚠️⚠️ 壳厚版本迁移（2026-10-07 用户把 ICE_SHELL 从 100000 拍到 500000 时补上）
     * 【为什么必须在这里补，否则改壳厚等于只对新人生效】
     *   上面那段 nums 循环只校验「是不是数字」，**不重算**。而 `game.resumeRun(saved)`
     *   是**无条件拿存档当本局**的 —— 于是任何改配置前创建的存档，会永远跑在旧厚度上
     *   （实测：CFG 已是 500000，但老档 run() 读出来仍是 iceShell=100000 / shell=25000，
     *   上屏显示「25000 / 100000（25.0%）」，看起来像改动没生效）。
     * 【判据：用存档里的 baseShell 当版本戳】
     *   baseShell 是「这局开始时的总厚」，不随破壳进度变化 ⇒ 它与当前 CFG.ICE_SHELL
     *   不等，就说明这份存档是**另一个厚度版本**留下的。相等则原样放过（幂等，
     *   反复迁移不会把壳越翻越厚）。
     * 【等比重算，不是直接赋值】
     *   直接赋 iceShell = 新值会把「已经凿到 25%」的进度重置成满壳 = 白送进度；
     *   按 shell/iceShell 的比例缩放，玩家看到的剩余百分比不变，只是分母变大。
     *   另有 perk.thin（冰壳永久削弱，每级 ×0.9）：它已经体现在存档的 iceShell 里，
     *   所以按比例缩放天然继承，不重复乘。 */
    var curBase = SB.CFG.ICE_SHELL;
    if (typeof out.baseShell === 'number' && out.baseShell > 0 && out.baseShell !== curBase) {
      var keepRatio = out.iceShell > 0 ? out.shell / out.iceShell : 1;
      if (!(keepRatio >= 0 && keepRatio <= 1)) keepRatio = 1;   // 存档被手改成越界值时按满壳处理
      out.iceShell = Math.round(curBase * Math.pow(0.9, (out.perk && out.perk.thin) || 0));
      out.baseShell = curBase;
      out.shell = Math.round(out.iceShell * keepRatio);
    }
    /* G.E.E.K 运行态（ERA9）：与 res/lvl 不同，它是「我新代码整对象写」的字段，但为前向兼容
     * （将来给 geek 加新旗时，旧档只存了老旗会丢失新旗默认值），做一层按 key 的浅合并而非
     * 整对象覆盖——否则 raw.geek={enceladusDone:true} 会把 costOffset 等默认冲没、甚至把 geekOn 弄丢
     * （开关位丢失 = 玩家重进游戏发现 G.E.E.K 自己停了）。布尔旗严格按布尔收口，三个数值非负有限。 */
    var rawGeek = (raw.geek && typeof raw.geek === 'object') ? raw.geek : {};
    /* 旧档兼容：瑞亚星改造曾用 rheaDone/rheaRun，重命名为恩克拉多斯后做一次键迁移（2026-10-21）。 */
    if (typeof rawGeek.rheaDone === 'boolean') rawGeek.enceladusDone = rawGeek.rheaDone;
    if (typeof rawGeek.rheaRun === 'number' && isFinite(rawGeek.rheaRun) && rawGeek.rheaRun >= 0) rawGeek.enceladusRun = rawGeek.rheaRun;
    var _gb = base.geek || { geekOn: false, enceladusDone: false, terraDone: false, costOffset: 0, enceladusRun: 0, terraRun: 0 };
    out.geek = {};
    for (var _gk in _gb) {
      if (typeof _gb[_gk] === 'boolean') out.geek[_gk] = (typeof rawGeek[_gk] === 'boolean') ? rawGeek[_gk] : _gb[_gk];
      else out.geek[_gk] = (typeof rawGeek[_gk] === 'number' && isFinite(rawGeek[_gk]) && rawGeek[_gk] >= 0) ? rawGeek[_gk] : _gb[_gk];
    }

    return out;
  }

  migrations.migrateRun = migrateRun;
})(typeof window !== 'undefined' ? window : globalThis);
