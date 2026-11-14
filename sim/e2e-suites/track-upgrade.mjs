/* e2e suite: 追踪坞支持「工坊升级项」（UPGRADES，买断一次）
 *
 * 2026-11-14 补：工坊「升级项」子页里的升级项原先既没挂追踪按钮、track-dock.resolve
 * 也不认 `upgrade` 这种 kind。本套件钉住新行为：
 *   ① resolve 升级项：材料不足 → 出造价行；已装上 / 未解锁（需求未达成）→ 自动解除（null）。
 *   ② isTracked 认得 `upgrade:` 串（不能恒 false，否则按钮永远显示「未追踪」）。
 *   ③ jump 升级项：切到工坊页 → 切到「升级项」子视图 → 按 data-upgrade 锚点滚动。
 *
 * ⚠️ 不 mock SB：走 SB.workshop.upgradeCost / upgradeBlocked / SB.state.freshRun 生产路径；
 *   setTab / setWorkshopView / renderPanes / requestAnimationFrame / document 用 try/finally 临时替换并还原。
 */
export function run({ SB, check, sandbox }) {
  console.log('\n=== 追踪坞：工坊升级项（upgrade kind）===');
  const T = SB.ui && SB.ui.track;
  if (!T) { check('ui.track 已加载', false, 'SB.ui.track 不存在'); return; }
  check('ui.track 已加载', true);

  const ups = (SB.workshop && SB.workshop.upgrades) ? SB.workshop.upgrades() : [];
  check('SB.workshop.upgrades() 有数据', ups.length > 0, 'n=' + ups.length);
  if (!ups.length) return;

  function satisfy(s, u) {
    if (u.need) { s.techs = s.techs || {}; s.techs[u.need] = true; }
    if (u.needCivic) { s.civics = s.civics || {}; s.civics[u.needCivic] = true; }
    if (u.requiresTools) u.requiresTools.forEach(t => { s.tools = s.tools || {}; s.tools[t] = true; });
    if (u.requiresUpgrades) u.requiresUpgrades.forEach(x => { s.upgrades = s.upgrades || {}; s.upgrades[x] = true; });
  }
  function zeroRes(s) { for (const k in s.res) s.res[k] = 0; }

  /* ① resolve：材料不足 → 出造价行；已装上 → 自动解除 */
  const matU = ups[0];
  {
    const s = SB.state.freshRun();
    satisfy(s, matU);
    zeroRes(s);                       // 资源清空 ⇒ 必走「还缺」分支（非「需要先」）
    const r = T.resolve(s, 'upgrade:' + matU.id);
    check('升级项材料不足 → resolve 出造价行（title 非空、rows>0）',
      !!r && typeof r.title === 'string' && r.title.length > 0 && r.rows.length > 0,
      JSON.stringify(r && { title: r.title, rows: r.rows }));
    check('升级项未装上 → ready 是布尔且为 false', !!r && r.ready === false, 'ready=' + (r && r.ready));

    s.upgrades = s.upgrades || {};
    s.upgrades[matU.id] = true;       // 模拟「装上」
    check('升级项已装上 → 自动解除（resolve === null）', T.resolve(s, 'upgrade:' + matU.id) === null,
      JSON.stringify(T.resolve(s, 'upgrade:' + matU.id)));
  }

  /* ① 续：未解锁（需求未达成）→ 自动解除 */
  const needU = ups.find(u => u.need);
  if (needU) {
    const s = SB.state.freshRun();
    if (s.techs && s.techs[needU.need]) delete s.techs[needU.need];  // 撤掉前置科技
    s.civics = {}; s.tools = {}; s.upgrades = {};
    zeroRes(s);
    const r = T.resolve(s, 'upgrade:' + needU.id);
    check('升级项未解锁（需求未达成）→ 自动解除（resolve === null）', r === null, 'r=' + JSON.stringify(r));
  } else {
    check('（无带前置科技的升级项，跳过未解锁路径）', true, '');
  }

  /* ② isTracked 认得 upgrade 串 */
  {
    const s = SB.state.freshRun();
    s.track = 'upgrade:' + matU.id;
    check('isTracked 认出 upgrade 类', T.isTracked('upgrade', matU.id, s) === true, s.track);
    s.track = '';
    check('isTracked 空串 → false', T.isTracked('upgrade', matU.id, s) === false);
  }

  /* ③ jump：切工坊页 → 升级项子视图 → 按 data-upgrade 锚点滚动 */
  {
    const ROOT = sandbox || (typeof window !== 'undefined' ? window : globalThis);
    const saved = {
      run: SB.game && SB.game.run,
      setTab: SB.game && SB.game.setTab,
      setWorkshopView: SB.ui.render && SB.ui.render.setWorkshopView,
      renderPanes: SB.ui.render && SB.ui.render.renderPanes,
      raf: ROOT.requestAnimationFrame,
      doc: ROOT.document
    };
    const s = SB.state.freshRun();
    satisfy(s, matU);
    zeroRes(s);                       // 让 resolve 非 null，jump 才会真正执行
    const captured = { setTab: null, view: null, panes: 0, sel: null };
    try {
      if (SB.game) {
        SB.game.run = () => s;
        SB.game.setTab = (t) => { captured.setTab = t; };
      }
      if (SB.ui.render) {
        SB.ui.render.setWorkshopView = (v) => { captured.view = v; };
        SB.ui.render.renderPanes = () => { captured.panes++; };
      }
      ROOT.requestAnimationFrame = (cb) => { cb(); return 0; };
      ROOT.document = {
        querySelector: (sel) => { captured.sel = sel; return { scrollIntoView() {}, closest() { return this; } }; }
      };
      T.jump('upgrade:' + matU.id);
    } finally {
      if (SB.game) {
        if (saved.run) SB.game.run = saved.run; else delete SB.game.run;
        if (saved.setTab) SB.game.setTab = saved.setTab; else delete SB.game.setTab;
      }
      if (SB.ui.render) {
        if (saved.setWorkshopView) SB.ui.render.setWorkshopView = saved.setWorkshopView; else delete SB.ui.render.setWorkshopView;
        if (saved.renderPanes) SB.ui.render.renderPanes = saved.renderPanes; else delete SB.ui.render.renderPanes;
      }
      ROOT.requestAnimationFrame = saved.raf;
      ROOT.document = saved.doc;
    }
    check('jump 切到工坊页（setTab=workshop）', captured.setTab === 'workshop', 'setTab=' + captured.setTab);
    check('jump 切到「升级项」子视图（setWorkshopView=upgrades）', captured.view === 'upgrades', 'view=' + captured.view);
    check('jump 触发了面板重画（renderPanes 被调用）', captured.panes >= 1, 'panes=' + captured.panes);
    check('jump 按 data-upgrade 锚点定位升级项行',
      captured.sel === '#pane-workshop [data-upgrade="' + matU.id + '"]', 'sel=' + captured.sel);
  }

  /* ④ 脏值稳妥：未知 kind / 不存在的升级 id → null，绝不抛 */
  check('未知 kind → null', T.resolve(SB.state.freshRun(), 'weird:x') === null);
  check('不存在的升级 id → null', T.resolve(SB.state.freshRun(), 'upgrade:__nope__') === null);
}
