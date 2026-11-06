/* e2e suite: 设备级 UI 偏好（2026-11-05）。
 *
 * 钉住的事故：工坊 / 奇观的「隐藏已完成」原来只写裸 localStorage 键；TapTap 只对
 * tapfile://usr 与 tap.setStorage 有持久承诺 ⇒ 容器清缓存 / 重启游戏开关就复位，
 * 玩家每次进来都要重按。现在收进 SB.store 的独立偏好键，写三通道、启动时异步回填。
 *
 * ⚠️ 这里不 mock SB.store：新会话一律用 loadNoDom 重新加载**生产脚本**（NO_DOM 清单
 *    含 src/save-storage.js），只是换一份 localStorage / tap 桩来模拟「同一台设备的
 *    另一次启动」。断言打在真实的 prefGet / prefSet / prefHydrate 上。
 * ⚠️ 本套件不触碰主沙箱的游戏状态（临时塞的那件工具当场还原），可放在 persistence
 *    之后、boot-gate 之前。 */
export async function run({ SB, check, sandbox, loadNoDom, g }) {
  console.log('\n=== 设备级 UI 偏好（隐藏已完成跨重启） ===');
  const PREF_KEY = SB.store.PREF_KEY;
  check('偏好层已挂载且用独立键（不是 meta / run 存档键）',
    PREF_KEY === 'shellbreak.ui.v1' && PREF_KEY !== SB.CFG.SAVE_KEY && PREF_KEY !== SB.CFG.RUN_KEY &&
    typeof SB.store.prefGet === 'function' && typeof SB.store.prefSet === 'function' &&
    typeof SB.store.prefHydrate === 'function', PREF_KEY);

  function mkStorage(seed) {
    const map = new Map(Object.entries(seed || {}));
    return {
      getItem: k => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: k => map.delete(k),
      _map: map
    };
  }
  /* 只装 tap.getStorage / setStorage，**不给** getFileSystemManager：
   * 这是真实设备上最弱的一档（KV 有、文件没有），偏好必须照样能救回来。 */
  function mkTap(kv) {
    return {
      getStorage(a) {
        if (kv[a.key] == null) { if (a.fail) a.fail({ errMsg: 'not found' }); return; }
        if (a.success) a.success({ data: kv[a.key] });
      },
      setStorage(a) { kv[a.key] = a.data; if (a.success) a.success({}); },
      removeStorage(a) { delete kv[a.key]; if (a.success) a.success({}); }
    };
  }
  function bootSession(storage, tap) {
    const sb = {
      console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
      isNaN, parseInt, parseFloat, localStorage: storage,
      _timeouts: [],
      setTimeout(fn) { sb._timeouts.push(fn); return sb._timeouts.length; },
      clearTimeout() {}
    };
    sb.window = sb; sb.globalThis = sb;
    if (tap) sb.tap = tap;
    return { sb, SB: loadNoDom(sb).SB };
  }

  /* ① 默认取向：全新设备两个开关都不隐藏，且不写死任何「默认隐藏」的旧键。 */
  {
    const st = mkStorage();
    const { SB: A } = bootSession(st, null);
    check('全新设备：工坊 / 奇观默认都不隐藏',
      A.store.prefGet('workshopHideDone') === false && A.store.prefGet('wonderHideDone') === false);
    const raw = st.getItem(PREF_KEY);
    check('首次读取即固化权威键（含两个字段、默认 0）',
      !!raw && JSON.parse(raw).workshopHideDone === 0 && JSON.parse(raw).wonderHideDone === 0, raw);
  }

  /* ② 旧键迁移：升级上来的老玩家不该丢掉上次按过的状态。 */
  {
    const st = mkStorage({ 'sb.hideDone.v1': '1', 'sb.wonderHideDone.v1': '0' });
    const { SB: B } = bootSession(st, null);
    check('老版裸键迁移：工坊隐藏保留、奇观未隐藏保留',
      B.store.prefGet('workshopHideDone') === true && B.store.prefGet('wonderHideDone') === false);
    const raw = st.getItem(PREF_KEY);
    check('迁移结果固化进新键（之后只读新键）',
      !!raw && JSON.parse(raw).workshopHideDone === 1, raw);
  }

  /* ③ 写盘走三通道：prefSet 返回的 Promise 落地后，tap.setStorage 里必须也有这份。 */
  const kv = {};
  let prefsRaw = '';
  {
    const st = mkStorage();
    const { SB: C } = bootSession(st, mkTap(kv));
    await C.store.prefSet('workshopHideDone', true);
    await C.store.prefSet('wonderHideDone', true);
    prefsRaw = kv[PREF_KEY];
    check('切换开关后：localStorage 与 tap.setStorage 两处都落了同一份偏好',
      st.getItem(PREF_KEY) === prefsRaw && !!prefsRaw &&
      JSON.parse(prefsRaw).workshopHideDone === 1 && JSON.parse(prefsRaw).wonderHideDone === 1,
      'kv=' + (prefsRaw || '').slice(0, 90));
    check('偏好键带时间戳（备份与本地比新旧用）', Number(JSON.parse(prefsRaw)._at) > 0);
  }

  /* ④ 事故形状：容器把 localStorage 清了，只有 tap KV 里那份还在 ⇒ 启动回填。 */
  {
    const st = mkStorage();
    const { SB: D } = bootSession(st, mkTap({ [PREF_KEY]: prefsRaw }));
    check('清缓存后、回填前：本地确实读不到偏好',
      !st.getItem(PREF_KEY) && D.store.prefGet('workshopHideDone') === false);
    const ok = await D.store.prefHydrate();
    check('启动异步回填：从 tap.setStorage 救回工坊 / 奇观隐藏状态',
      ok === true && D.store.prefGet('workshopHideDone') === true &&
      D.store.prefGet('wonderHideDone') === true, 'hydrate=' + ok);
    check('回填后把值写回本地权威键（下次启动不必再等异步）',
      st.getItem(PREF_KEY) === prefsRaw);
  }

  /* ⑤ 护栏：异步备份慢到时，绝不能把玩家刚按下的状态顶回去。 */
  {
    const st = mkStorage();
    const { SB: F } = bootSession(st, mkTap({ [PREF_KEY]: prefsRaw }));
    await F.store.prefSet('workshopHideDone', false);   // 玩家本会话刚把开关拨回去
    const ok = await F.store.prefHydrate();
    check('玩家本会话已点过开关：慢到的旧备份不许顶掉当前值',
      ok === false && F.store.prefGet('workshopHideDone') === false, 'hydrate=' + ok);
  }

  /* ⑥ 清档不清：state.js / game.js 的清档原语只删 SAVE_KEY / RUN_KEY。 */
  {
    const seed = {};
    seed[PREF_KEY] = prefsRaw;
    seed[SB.CFG.SAVE_KEY] = '{"perks":{}}';
    seed[SB.CFG.RUN_KEY] = '{"res":{}}';
    const st = mkStorage(seed);
    const { SB: E } = bootSession(st, null);
    E.store.removeLocal(SB.CFG.SAVE_KEY);
    E.store.mirrorRemove(SB.CFG.RUN_KEY);
    check('清空存档后：设备级偏好仍在（清档不清）',
      !st.getItem(SB.CFG.SAVE_KEY) && st.getItem(PREF_KEY) === prefsRaw &&
      E.store.prefGet('wonderHideDone') === true);
  }

  /* ⑦ 生产渲染路径：两个开关拨过去之后，工坊 / 奇观面板 HTML 里的按钮文案必须跟着变。
   *    ⚠️ 不用 g('pane-workshop')：假 DOM 的 renderPanes 有状态签名节流，pref 变化不改签名
   *       ⇒ 读到的可能是上一帧的短内容（第一版就是这么误报的，htmlLen=240）。
   *       直接调生产渲染函数 RP.paneWorkshop() / RP.paneWonder()，与 workshop-economy.mjs 同范式。
   *    临时各塞一件「已完成」只为让按钮出现，断言完立刻还原，不污染后续套件。 */
  {
    const RP = SB.ui.renderParts;
    const before = SB.store.prefGet('workshopHideDone');
    const beforeW = SB.store.prefGet('wonderHideDone');
    const s = SB.game.run();
    const toolId = SB.TOOLS && SB.TOOLS[0] && SB.TOOLS[0].id;
    const wonderId = SB.wonder && SB.wonder.list && SB.wonder.list()[0] && SB.wonder.list()[0].id;
    const hadTool = !!(toolId && s.tools && s.tools[toolId]);
    const hadWonder = !!(wonderId && s.wonders && s.wonders[wonderId]);
    if (toolId) { s.tools = s.tools || {}; s.tools[toolId] = true; }
    if (wonderId) { s.wonders = s.wonders || {}; s.wonders[wonderId] = true; }
    /* ⚠️ paneWorkshop() 在 s.lvl.workshop<=0 时直接返回锁定提示（127 字符，没有开关按钮）。
     *    本套件挂在 persistence 的硬重置之后，正是「新局没建工坊」的状态 ⇒ 必须临时解锁。 */
    const hadLvl = Object.prototype.hasOwnProperty.call(s.lvl, 'workshop');
    const oldLvl = s.lvl.workshop;
    s.lvl.workshop = oldLvl > 0 ? oldLvl : 1;

    SB.ui.render.toggleHideDone();
    SB.ui.render.toggleWonderHideDone();
    const wOn = SB.store.prefGet('workshopHideDone'), dOn = SB.store.prefGet('wonderHideDone');
    check('两个「隐藏已完成」生产切换路径都真的改了偏好值',
      wOn === !before && dOn === !beforeW);
    const wHtml = RP.paneWorkshop(), dHtml = RP.paneWonder();
    check('工坊面板 HTML：开关状态写进标题行按钮（不是只改内存值）',
      wHtml.indexOf('data-hidedone="1"') >= 0 &&
      wHtml.indexOf(wOn ? '显示已完成' : '隐藏已完成') >= 0, 'htmlLen=' + wHtml.length);
    check('奇观面板 HTML：开关状态写进标题行按钮',
      dHtml.indexOf('data-wonder-hidedone="1"') >= 0 &&
      dHtml.indexOf(dOn ? '显示已完成' : '隐藏已完成') >= 0, 'htmlLen=' + dHtml.length);

    if (toolId && !hadTool) delete s.tools[toolId];
    if (wonderId && !hadWonder) delete s.wonders[wonderId];
    if (hadLvl) s.lvl.workshop = oldLvl; else delete s.lvl.workshop;
    SB.ui.render.toggleHideDone();
    SB.ui.render.toggleWonderHideDone();
    SB.ui.render.renderPanes();
    check('套件收尾：两个开关值与面板状态都还原',
      SB.store.prefGet('workshopHideDone') === before &&
      SB.store.prefGet('wonderHideDone') === beforeW);
  }
}
