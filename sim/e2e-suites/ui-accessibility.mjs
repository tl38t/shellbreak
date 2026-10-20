/* e2e suite: tech-panel unlock flow, modal/tab behavior, and UI readouts. */
export function run({ SB, check, noop, doc, g, fs, path, ROOT, drainStoryModals }) {
console.log('\n=== 科研面板开门 ===');
drainStoryModals();
{
  const s = SB.game.run();
  check('开局：科技 tab 灰着，点了也翻不过去',
    SB.ui.render.techTabOpen() === false &&
    (SB.game.setTab('tech'), SB.game.getTab() !== 'tech'), 'tab=' + SB.game.getTab());
  check('开局：科技面板渲染「未翻开」空态而不是空白',
    g('pane-tech').indexOf('未翻开') !== -1, g('pane-tech').slice(0, 50).replace(/\n/g, ' '));

  /* 尤里卡播报的**时机**（用户 2026-09-26：尤里卡等解锁科技之后一起展示）。
   * 三条断言分别钉「不开门不播」「但揭示照常」「开了门一次性摊开且相邻」。 */
  s.res.kelp = 60;                     // 「种植」的尤里卡条件（藻食存量 60）已达成
  SB.game.pumpTech(s, noop);
  const eur = () => (g('log').match(/尤里卡：[^<]*/g) || []);
  check('科技页解锁前，尤里卡不写进日志（那时玩家手里还没有科技页）',
    eur().length === 0, '日志里的尤里卡=' + JSON.stringify(eur().slice(0, 3)));
  check('但揭示照常记账：条件达成了就该亮（开关只挡播报，不挡揭示）',
    SB.tech.isRevealed(s, 'plant') === true && SB.tech.isRevealed(s, 'coralcut') === true,
    'plant=' + SB.tech.isRevealed(s, 'plant') + ' coralcut=' + SB.tech.isRevealed(s, 'coralcut'));
  check('未达成的仍然不揭示（对照：采石要珊瑚 40，此刻珊瑚 0）',
    SB.tech.isRevealed(s, 'quarry') === false, 'quarry=' + SB.tech.isRevealed(s, 'quarry'));

  s.lvl.kelp = 5;                      // 等价于玩家建成第 5 座藻场
  SB.game.pumpTech(s, noop);           // 与线上同一条触发路径（建造动作后补跑的那一趟）
  const m = doc.getElementById('modal');
  check('第 5 座：弹出结绳叙事窗（两句台词都在）',
    !m.classList.contains('hidden') &&
    g('modalBox').indexOf('这代表今天') !== -1 && g('modalBox').indexOf('这代表明天') !== -1);
  check('叙事窗只播一次（记账后才弹，重跑 pump 不重播）',
    SB.tech.popupSeen(s) === true && (SB.game.pumpTech(s, noop), true));
  check('弹窗给出「进入科技页」的动作', typeof doc.getElementById('mStoryOk').onclick === 'function');
  /* 2026-09-30 玩家反馈「弹窗一出人口进度条就停了」：根因是全屏覆盖层把 tab 栏连
   * #growbar 一起盖住（循环没停，纯视觉）。修法 = tab 栏抬到覆盖层之上（css z-index:60）
   * + body.modal-open 时禁点 tab。这两条断言钉 JS 侧的类开关；CSS 侧靠 headless 截图取证。 */
  check('弹窗开着时 body.modal-open 已置位（tab 栏可见但禁点，人口条不再被误读为停摆）',
    doc.body.classList.contains('modal-open') === true);

  /* 开门那一刻，攒下的尤里卡一起摊开。 */
  const lg0 = g('log');
  check('开门那一刻：攒下的尤里卡一起摊开（凿珊瑚 + 种植都在）',
    /尤里卡：凿珊瑚/.test(lg0) && /尤里卡：种植/.test(lg0),
    JSON.stringify(eur().slice(-4)));
  check('它们相邻展示，不被别的播报夹在中间',
    /<div>· 尤里卡：[^<]*<\/div><div>· 尤里卡：[^<]*<\/div>/.test(lg0),
    JSON.stringify(eur().slice(-2)));
  check('默认条件的尤里卡不再留一个空破折号',
    lg0.indexOf('——  已达成') === -1 && /尤里卡：凿珊瑚 已达成/.test(lg0),
    JSON.stringify(eur().filter(x => x.indexOf('凿珊瑚') >= 0)));
  /* 反向对照：上面那三条只证明「不开门不播」，证明不了「开了门会播」。
   * 少了这一条，把播报整个删掉也能全绿。 */
  s.res.coral = 40;                    // 「采石」的尤里卡条件（珊瑚存量 40）
  SB.game.pumpTech(s, SB.game.emit);
  check('开门之后，新达成的尤里卡立刻写进日志（不是从此静音）',
    /尤里卡：采石/.test(g('log')), JSON.stringify(eur().slice(0, 2)));
  s.res.coral = 0;

  doc.getElementById('mStoryOk').onclick();
  check('关掉弹窗即翻到科技页', SB.game.getTab() === 'tech', 'tab=' + SB.game.getTab());
  /* 反向对照：关窗必须把 modal-open 摘干净 —— 残留会让 tab 永久 pointer-events:none。
   * （离线闸门的 OK 回调不走 hideModal，是这条断言要抓的另一处出口。） */
  check('关窗后 body.modal-open 已摘除（tab 恢复可点，不残留）',
    doc.body.classList.contains('modal-open') === false);
  const paneT = g('pane-tech'), at = paneT.indexOf('id="techrow-writing"');
  check('科技页展开在结绳那一项上，且它是已掌握态',
    at !== -1 && /已掌握/.test(paneT.slice(at, at + 400)),
    at === -1 ? '找不到 #techrow-writing' : JSON.stringify(paneT.slice(at, at + 60)));
  check('开门后 tab 解除灰态且可以正常翻页',
    SB.ui.render.techTabOpen() === true && (SB.game.setTab('tech'), SB.game.getTab() === 'tech'));
}

/* ---------------- 剥壳工程页签开门（2026-10-05 用户：开局不开，挂「天壳观测」）----------------
 * 2026-10-07 用户：「这个标签不需要保留」⇒ dig 页签 / pane / 闸门整链删除，
 * 钻机入口收进自然环境卡的启动行（render.renderDrill）。本段随之撤销。 */

/* ---------------- 奇观未解锁不显示（2026-10-05 用户拍板）----------------
 * 改前 `paneWonder` 无条件遍历 `SB.wonder.list()` ⇒ 14 座奇观从开局就全列在奇观页。
 * 现在只显示：① 已建成的（玩家拆档/读档后仍要看到自己建过什么）
 *             ② 门已开的（need 科技门 / needCivic 市政门 / 无门的）
 * 判据复用 `wonderBlocked` 返回值的 `/^需要先/` 前缀 —— 那是同文件里按钮文案
 * 区分「未解锁 / 建不起」时**已经在用**的判据，render 不另立一套。
 * ⚠️ 大图书馆（wonder_great_library）在「通识」删除后**既无 need 也无 needCivic**
 *    ⇒ 它必须仍显示，否则玩家永远看不到它（它那 1000 精铁本来就超基础容量）。 */
console.log('\n=== 奇观未解锁不显示 ===');
{
  const names = html => (html.match(/data-wonder="[a-z_]+"/g) || [])
    .map(x => x.slice(13, -1));

  /* 开局：石工没研究 ⇒ 大图书馆也不再露头（2026-10-05 补了 `needCivic:'records'` 门）。
   * ⚠️ 改前这里是「无门奇观必须仍显示」——那条断言的前提（存在裸奔奇观）已被
   *    「大图书馆的市政门」那段修掉，现在**全库 14 座都有门**，裸奔奇观已不存在。
   *    保留一个「无门时必显示」的守卫仍有价值（防止将来又写出裸奔奇观），
   *    但它不能再拿大图书馆当例子 —— 改成纯逻辑检查（表里若出现无门项，过滤器必须放过）。 */
  const lib = SB.WONDERS.find(w => w.id === 'wonder_great_library');
  check('大图书馆已挂市政门（`needCivic=records`；此前无门 ⇒ 裸奔，已修）',
    !!lib && lib.needCivic === 'records' && !lib.need,
    'need=' + (lib && lib.need) + ' needCivic=' + (lib && lib.needCivic));
  {
    /* 无门项 ⇒ 过滤器必须放行。用**构造的**假条目验，不依赖表里真有这样一座
     * （表里若真有，说明又出现裸奔奇观，那该由下面那条「全库都已挂门」去红）。 */
    const naked = SB.WONDERS.filter(w => !w.need && !w.needCivic);
    check('全库奇观都已挂门（不该再有裸奔奇观，否则这里会有条目）',
      naked.length === 0, '裸奔=' + (naked.map(w => w.id).join(',') || '无'));
  }

  /* 逐座验：门未开 ⇒ 该座不出现；门开 ⇒ 必出现。
   * 走真实活局并**逐项显式置真**，避免前面的断言已研究过某科技而造成假绿。 */
  const s = SB.game.run();
  const bakTech = Object.assign({}, s.techs);
  const bakCiv = Object.assign({}, s.civics);
  const bakWon = Object.assign({}, s.wonders || {});
  const bakBroken = s.broken;
  const bakShell = s.shell;
  const bakShellOpened = s.shellOpened;
  const bakBreakSettled = s.breakSettled;
  const bakSkydrillOn = s.skydrillOn;
  let allHiddenOk = true, allOpenOk = true, badHidden = [], badOpen = [];

  for (const w of SB.WONDERS) {
    /* 未解锁态：清掉所有门 */
    s.techs = {}; s.civics = {}; s.wonders = {};
    let blocked = null;
    if (w.need) blocked = '需要先研究「x」';
    else if (w.needCivic) blocked = '需要先完成市政「x」';
    if (!blocked) continue;                       // 无门 ⇒ 永远显示，单独验
    const shownUnlocked = names(SB.ui.render.paneWonder());
    /* paneWonder 读的是活局，直接看该行在不在渲染结果里 */
    if (shownUnlocked.indexOf(w.id) >= 0) { allHiddenOk = false; badHidden.push(w.id); }

    /* 解锁态：把这座自己的门打开 */
    s.techs = Object.assign({}, bakTech);
    s.civics = Object.assign({}, bakCiv);
    s.wonders = {};
    if (w.need) s.techs[w.need] = true;
    if (w.needCivic) s.civics[w.needCivic] = true;
    if (names(SB.ui.render.paneWonder()).indexOf(w.id) < 0) {
      allOpenOk = false; badOpen.push(w.id);
    }
  }
  check('🚨 门未开的奇观一律不显示（改前 14 座全列）', allHiddenOk,
    '漏显示=' + (badHidden.join(',') || '无'));
  check('门打开后对应奇观必定显示（过滤器不能把有门的也一起吞掉）', allOpenOk,
    '漏显示=' + (badOpen.join(',') || '无'));

  /* ⚠️ 2026-10-05：大图书馆补了 `needCivic:'records'` 之后，「无门奇观在裸奔局里仍显示」
   *   这条**原本拿它当例子**的断言已失去前提（表里不该再有裸奔奇观，改由上面那条
   *   「全库都已挂门」钉）。这里换成**真正需要守的那条例外**：门未开的奇观在
   *   「已建成」状态下仍要显示 —— 也就是 `done` 优先于过滤那条纪律。 */
  s.techs = {}; s.civics = {}; s.wonders = {};
  check('门未开的奇观在裸奔局里一律不显示（裸奔奇观已绝迹，全库 14 座都有门）',
    names(SB.ui.render.paneWonder()).length === 0,
    '仍显示=' + (names(SB.ui.render.paneWonder()).join(',') || '无'));

  /* 已建成 ⇒ 即使门后来没了也必须仍显示（否则读档后看不到自己建过什么） */
  s.techs = {}; s.civics = {}; s.wonders = { wonder_tide_stele: true };
  check('已建成的奇观即使门未开也仍显示（不能因门消失而丢档）',
    names(SB.ui.render.paneWonder()).indexOf('wonder_tide_stele') >= 0);

  /* 幸福度就地说明必须绑定当前奇观：账本里的「王国大交易所」来源不能
   * 被复用到海潮方碑等其它已建成奇观上。 */
  s.techs = {}; s.civics = {}; s.wonders = { wonder_tide_stele: true };
  const steleMarkup = SB.ui.render.paneWonder();
  check('非幸福度奇观不显示幸福度 +1 提示', steleMarkup.indexOf('幸福度 +1') < 0);
  s.wonders = { wonder_grand_exchange: true };
  const exchangeMarkup = SB.ui.render.paneWonder();
  check('王国大交易所显示幸福度 +1 提示', exchangeMarkup.indexOf('幸福度 +1') >= 0);

  /* 天穹钻机破壳前是凿壳机器，破壳后转为奇观属性；奇观页的摘要也标明生效阶段。 */
  /* 已结算后刷新时 broken 会被清成 false；持久阶段由 shellOpened / breakSettled 保留。 */
  s.broken = false; s.shell = 0; s.shellOpened = true; s.breakSettled = true;
  s.wonders = { wonder_skydrill: true };
  s.skydrillOn = true;
  check('破壳后常驻加成跨刷新保留，不再按运行态惩罚计算',
    SB.wonder.skydrillCivic(s) === 100 && SB.wonder.skydrillHappyOffset(s) === 1);
  check('已破壳的钻机不能再次启动', SB.ui.input.toggleSkydrill(s) === false && s.skydrillOn);
  SB.ui.renderParts.renderDrill(s);
  const postBreakDrill = doc.getElementById('envDrill').innerHTML;
  check('破壳后自然环境页显示天穹钻机奇观属性且不再显示启动按钮',
    postBreakDrill.indexOf('破壳后奇观效果') >= 0 && postBreakDrill.indexOf('市政点 +100/秒') >= 0 &&
    postBreakDrill.indexOf('幸福度 +1') >= 0 && postBreakDrill.indexOf('data-skydrill') < 0);
  const postBreakWonderMarkup = SB.ui.render.paneWonder();
  check('奇观页明确天穹钻机的效果在破壳后生效',
    postBreakWonderMarkup.indexOf('破壳后效果：每秒 +100 市政点，幸福度 +1。') >= 0);

  s.techs = bakTech; s.civics = bakCiv; s.wonders = bakWon; s.broken = bakBroken;
  s.shell = bakShell; s.shellOpened = bakShellOpened; s.breakSettled = bakBreakSettled;
  s.skydrillOn = bakSkydrillOn;
  SB.ui.renderParts.renderDrill(s);
}

/* ---------------- 工坊页：未解锁不显示（2026-10-05 用户拍板）----------------
 * 与奇观同一拍：工坊页三段（青铜工具 / 工艺制作 / 工艺升级项）改前**全列**，
 * 现在只显示「已买下/已装上」+「门已开的」。判据同样复用各 blocked 返回的
 * `/^需要先/` 前缀（未解锁）vs「还缺…」（买不起）—— 那是按钮文案已在用的判据。
 *
 * ⚠️【为什么断言必须自己建夹具、不能读活局】上面奇观那段已经把 `s.techs` 备份还原，
 *    而工坊三段的门在科技（ironwork / metalrefine / engineeringT…）上；
 *    活局里那些科技可能已被研究过 ⇒ 「未解锁时不显示」会因夹具脏而恒绿。
 * 下面每段都**显式清空** techs 再逐项打开，方向都要验。 */
console.log('\n=== 工坊页：未解锁不显示 ===');
{
  const s = SB.game.run();
  const bakTech = Object.assign({}, s.techs);
  const bakTools = Object.assign({}, s.tools || {});
  const bakUpg = Object.assign({}, s.upgrades || {});
  const bakCiv2 = Object.assign({}, s.civics || {});
  const bakWs = s.lvl.workshop;
  const ids = (h, attr) => (h.match(new RegExp(attr + '="[a-zA-Z_0-9]+"', 'g')) || [])
    .map(x => x.slice(attr.length + 2, -1));
  s.lvl = s.lvl || {}; s.lvl.workshop = 1;   // 先建成，否则整页是「工坊尚未建成」

  /* ① 工具：TOOLS[].need 是真门（workshop.js:315 起 blocked 才真读它） */
  {
    s.techs = {}; s.tools = {};
    const gated = SB.TOOLS.filter(t => t.need);
    const shownAll = ids(SB.ui.render.paneToolRows(s), 'data-tool');
    const leaked = gated.filter(t => shownAll.indexOf(t.id) >= 0).map(t => t.id);
    check('🚨 工具：门未开的一律不显示', leaked.length === 0, '漏显示=' + (leaked.join(',') || '无'));

    s.techs = {}; s.tools = {};
    gated.forEach(t => { s.techs[t.need] = true; });
    const shownOpen = ids(SB.ui.render.paneToolRows(s), 'data-tool');
    const missing = gated.filter(t => shownOpen.indexOf(t.id) < 0).map(t => t.id);
    check('工具：门打开后必定显示（过滤器不能把有门的也吞掉）', missing.length === 0,
      '漏显示=' + (missing.join(',') || '无'));

    /* 已买下的必须仍显示（哪怕门未开） */
    s.techs = {}; s.tools = {}; s.tools[SB.TOOLS[0].id] = true;
    check('工具：已买下的即使门未开也仍显示（不能因门消失而丢档）',
      ids(SB.ui.render.paneToolRows(s), 'data-tool').indexOf(SB.TOOLS[0].id) >= 0,
      SB.TOOLS[0].id);
  }

  /* ② 配方：门 = `c.need`（科技）/ `c.needCivic`（市政） */
  {
    s.techs = {}; s.civics = {}; s.tools = {};
    const gated = SB.CRAFTS.filter(c => c.need || c.needCivic);
    const shownAll = ids(SB.ui.render.paneCraftRows(s), 'data-craft');
    const leaked = gated.filter(c => shownAll.indexOf(c.id) >= 0).map(c => c.id);
    check('🚨 配方：门未开的一律不显示', leaked.length === 0, '漏显示=' + (leaked.join(',') || '无'));

    s.techs = {}; s.civics = {};
    gated.forEach(c => { if (c.need) s.techs[c.need] = true; if (c.needCivic) s.civics[c.needCivic] = true; });
    const shownOpen = ids(SB.ui.render.paneCraftRows(s), 'data-craft');
    const missing = gated.filter(c => shownOpen.indexOf(c.id) < 0).map(c => c.id);
    check('配方：门打开后必定显示', missing.length === 0, '漏显示=' + (missing.join(',') || '无'));
    check('配方：无门配方（石梁）在裸奔局里仍显示',
      SB.CRAFTS.some(c => !c.need && !c.needCivic) &&
      ids(SB.ui.render.paneCraftRows(s), 'data-craft').length > 0);
  }

  /* ③ 升级项：门 = `u.need` */
  {
    s.techs = {}; s.upgrades = {};
    const gated = SB.UPGRADES.filter(u => u.need);
    const shownAll = ids(SB.ui.render.paneUpgradeRows(s), 'data-upgrade');
    const leaked = gated.filter(u => shownAll.indexOf(u.id) >= 0).map(u => u.id);
    check('🚨 升级项：门未开的一律不显示', leaked.length === 0, '漏显示=' + (leaked.join(',') || '无'));

    s.techs = {}; s.upgrades = {};
    gated.forEach(u => { s.techs[u.need] = true; });
    const shownOpen = ids(SB.ui.render.paneUpgradeRows(s), 'data-upgrade');
    const missing = gated.filter(u => shownOpen.indexOf(u.id) < 0).map(u => u.id);
    check('升级项：门打开后必定显示', missing.length === 0, '漏显示=' + (missing.join(',') || '无'));
  }

  /* ⚠️ 还原必须**逐项**做，且包含 `lvl.workshop` —— 漏掉它会让后面第 4529 行那条
   * 「没建工坊时面板写着尚未建成」读到「已建成」那一页而红（它读的是活局，不是局部夹具）。
   * 这与「共享夹具被前序断言污染」是同一个病的**反方向**：这次是**我留了脏状态给后面**。 */
  s.techs = bakTech; s.tools = bakTools; s.upgrades = bakUpg; s.civics = bakCiv2;
  s.lvl.workshop = bakWs;
}

/* ---------------- 大图书馆的市政门（2026-10-05 用户报 bug）----------------
 * 病根：`civics.js` 的《历史记录》明写「解锁奇观『大图书馆』」，但那一行只是**登记**
 * （`wonder:'wonder_great_library'`），奇观的门只由 `workshop.wonderBlocked` 读
 * `need` / `needCivic` 两个字段 ⇒ 大图书馆两个字段都没写 ⇒ **裸奔**：
 * 没研究《历史记录》就能建，而且它 1000 精铁的成本远低于「潮纹馆 6 级」那个真条件。
 * 修法：加 `needCivic: 'records'`（与另两座市政奇观同构）。
 * ⚠️ 这条断言同时替掉上一轮「无门奇观必须仍显示」那个前提 —— 补上门之后
 *    全库 14 座奇观**全部**有门，所以这里要钉「不再有裸奔奇观」这条新不变量。 */
console.log('\n=== 大图书馆的市政门 ===');
{
  const s = SB.game.run();
  const bakCiv = Object.assign({}, s.civics);
  const bakTech = Object.assign({}, s.techs);
  s.civics = {}; s.techs = {};
  const lib = SB.WONDERS.find(w => w.id === 'wonder_great_library');
  check('大图书馆现在挂着市政门（needCivic=records，之前是裸奔）',
    !!lib && lib.needCivic === 'records' && !lib.need,
    'need=' + (lib && lib.need) + ' needCivic=' + (lib && lib.needCivic));
  check('🚨 大图书馆未完成《历史记录》时不可建（bug 已修）',
    SB.workshop.wonderBlocked(s, 'wonder_great_library') !== null,
    SB.workshop.wonderBlocked(s, 'wonder_great_library') || '（无阻挡 ← bug 还在）');
  s.civics = { records: true };
  const why2 = SB.workshop.wonderBlocked(s, 'wonder_great_library');
  check('完成《历史记录》后大图书馆不再被门挡住（剩下的是成本，不是锁）',
    why2 === null || !/^需要先/.test(why2), why2 || 'null（可建）');
  s.civics = bakCiv; s.techs = bakTech;

  /* 新不变量：14 座奇观**全部**有门 ⇒ 「无门奇观必须仍显示」那条断言的前提已消失。
   * 钉住它是为了防止以后又出现一座裸奔奇观（那类 bug 就是从「字段缺失」开始的）。 */
  const naked = SB.WONDERS.filter(w => !w.need && !w.needCivic).map(w => w.id);
  check('🚨 全库奇观都已挂门（不应再有「无门 ⇒ 恒显示」的裸奔奇观）',
    naked.length === 0, '裸奔=' + (naked.join(',') || '无'));
}

/* ---------------- 幸福度：把「在被消耗」摆到面板上（2026-10-05 用户报）----------------
 * 病根：幸福度是**恒温器状态量**（dH/dt = K·(供给−需求)），面板原先只给一个静态数字。
 * 而奢侈品行的净速率在需求压倒产能时**恒为 0**（tick 是 `+=_S` 后 `-=min(_S,_D)`，
 * min 取满 ⇒ 差额永远 0）⇒ 从任何现有读数都看不出消耗，玩家完全不知道它在掉。
 * 修法：面板直接摆**平衡式的两项**（供给 / 需求）+ 净值 + 每人消耗。
 * ⚠️ `happySupply` 必须与 tick 的 _S 逐项同式（漏一项 = 面板撒谎），
 *    所以这里用**比值**钉：供给 / (每商人物品毛产出) 应当等于那一串乘区之积。 */
console.log('\n=== 幸福度：供给/需求上屏 ===');
{
  const s = SB.game.run();
  const bakPop = s.pop, bakMer = s.jobs.merchant;
  s.pop = 10; s.jobs.merchant = 1;
  const supply = SB.economy.happySupply(s);
  const need = SB.economy.happyBurn(s);
  const per = SB.economy.happyCostPer(s);
  check('happySupply > 0（派了商人就有产能；此前面板无从显示）', supply > 0,
    'supply=' + supply.toFixed(5));
  check('happyBurn = 人口 × 每人消耗（与 tick/rates 同源）',
    Math.abs(need / 10 - per) < 1e-9,
    'need=' + need.toFixed(5) + ' per=' + per.toFixed(5) + '（pop=10）');
  /* 🚨 钉住「面板说的供给 = tick 里 luxury 的毛产出」——
   * 用「无消耗的隔离态」验：把 pop 设为 0，此时 tick 的净增量应恰等于供给。
   * （若 happySupply 漏了某个乘子，这里就会比出来。） */
  s.pop = 0;
  const before = s.res.luxury;
  SB.economy.tick(s, 1, noop);
  const gross = s.res.luxury - before;
  check('🚨 面板供给与 tick 实际毛产出同源（漏一个乘子就红）',
    Math.abs(gross - supply) < 1e-9,
    'tick毛产出=' + gross.toFixed(8) + ' happySupply=' + supply.toFixed(8));
  s.pop = bakPop; s.jobs.merchant = bakMer;
}

/* ---------------- 幸福度消耗不该把「政体/奇观/卡的固定加成」算进单价 ----------------
 * 用户 2026-10-06 报 bug：奢侈品行「产 1.05 · 耗 1.46」——问消耗是不是把市政加的那些
 * 额外幸福度也算上去了。**答案是「是」，而且是真 bug。**
 * 【根因】`s.happy` 里含政体/奇观/政策卡/天穹钻机的**常驻偏移量**，而
 *   `happyBurn` / `happyCostPer` / `rates` 的 D 侧都拿 `happyCost(s.happy)` 当单价
 *   ⇒ 每 +1 加成 = 每人每秒多扣 `HAPPY_COST_SLOPE(0.010) × 人口`。
 *   于是「古典共和 +1 幸福」这种**纯增益**，真实效果是把居民养贵 ⇒ 净收益为负。
 * 【真正的结算一直是对的】tick 的 `_D` 早就在用 `_Hmech = s.happy − _gb`（剥离偏移）
 *   ——**只有给 UI/顶栏用的这三个读数函数漏剥了** ⇒ 面板显示的「耗」比真实扣的多。
 * 【本组钉的】① 单价只用机制值 ② 加成不再抬高消耗 ③ 面板读数 = tick 实际扣费
 *   ④ 加成改为负（工业化配给卡 −1）时也不抬高 ⑤ mechH 与 bonus 的口径自洽。 */
console.log('\n=== 幸福度：消耗单价剔除固定加成 ===');
{
  /* 帧长取趋零。⚠️ 原因：tick 内部**先用帧初的 H 算需求 `_D`，之后才更新 `s.happy`**，
   *   所以「tick 实际扣掉的量」与「tick 之后读到的 burn」天然差一个**帧内 H 增量**
   *   （dt=1 时实测差 0.018）。要验「面板与结算同源」，必须让那个增量可忽略。
   *   DT=1e-6 ⇒ 增量 ~1e-8，远低于 1e-9 的判据阈值之外还有两个数量级余量。 */
  const DT = 1e-6;
  const s = SB.state.freshRun(false);
  /* ⚠️ 政体选「酋邦制」而不是乱写一个 id：它不带 happyBonus、也不带任何消耗减免
   *   ⇒ 干净的基准。写 `gov:'democracy'`（不存在的 id）虽然 happyBonus 读成 0，
   *   但那不是「无加成」的干净态，断言一旦对比就会把别的乘区算进差值里。
   *   ⇒ ② 的对照组必须与实验组**同一个政体**，只差 happyBonus 这一项。 */
  s.civics = { trade: true }; s.gov = 'tribe'; s.cards = [];
  s.pop = 20; s.jobs.merchant = 2; s.happy = 1.0;
  const SLOPE = SB.CFG.HAPPY_COST_SLOPE;

  /* ① 基准：无任何加成时，机制值 == s.happy，单价 = 0.005 + 0.010·H。 */
  const noBonus = SB.economy.happyBonusTotal(s);
  check('无加成时 happyBonusTotal = 0', Math.abs(noBonus) < 1e-9, '=' + noBonus);
  check('无加成时 mechH == s.happy', Math.abs(SB.economy.happyMech(s) - 1.0) < 1e-9,
    'mechH=' + SB.economy.happyMech(s));

  /* ② 采用「古典共和」政体（happyBonus +1）⇒ 加成 = 1，但**消耗单价必须不变**。
   *   这条是本 bug 的核心：改前 burn 会多 0.010×20 = 0.20/s。
   * ⚠️ 判据必须是「**同一个 H 下，加成只改 H 不改单价**」—— 拿两个不同政体的 burn 直接比是错的，
   *   政体还各带别的乘区（古典共和没有、别政体有），差值会把那些乘区算进来。
   *   正确写法：固定 H，比较 mechH 有没有被加成改变（已由下一条覆盖），
   *   以及**同 H 加成下 burn 的解析值** = pop × (BASE + SLOPE×mechH)。 */
  const s2 = SB.state.freshRun(false);
  s2.civics = { trade: true }; s2.cards = []; s2.gov = 'classical_republic';
  s2.pop = 20; s2.jobs.merchant = 2; s2.happy = 1.0;
  const bonus2 = SB.economy.happyBonusTotal(s2);
  check('幸福度加成来源生效（古典共和 happyBonus=+1）', bonus2 > 0.5, 'bonus=' + bonus2);
  const burnNo = SB.economy.happyBurn(s);
  const burnWith = SB.economy.happyBurn(s2);
  /* 解析预期：mechH = 1 − 1 = 0 ⇒ c = BASE = 0.005 ⇒ burn = 20 × 0.005 = 0.10。
   * 改前 c 会用 s.happy=1 ⇒ 0.015 ⇒ burn=0.30，正好差 0.010×20。 */
  check('🚨 +1 加成时 burn = 人口×(BASE+SLOPE×mechH) = 20×0.005 = 0.10（改前会是 0.30）',
    Math.abs(burnWith - 0.10) < 1e-9, 'burn=' + burnWith.toFixed(5) + ' 预期 0.10');
  check('🚨 加成不把消耗推高：burnWith ≤ 基准 burn（改前差 +0.20/s）',
    burnWith <= burnNo + 1e-9,
    '基准=' + burnNo.toFixed(5) + ' 有加成=' + burnWith.toFixed(5));
  check('加成只作用在 H 上、不进单价（mechH = H − 加成）',
    Math.abs(SB.economy.happyMech(s2) - (1.0 - bonus2)) < 1e-9,
    'mechH=' + SB.economy.happyMech(s2) + ' H=' + s2.happy + ' bonus=' + bonus2);

  /* ③ 顶栏 rates 的净速率与 happyBurn 同口径（两者都在「无加成」态下比）。 */
  const r1 = SB.economy.rates(s2);
  check('rates 的奢侈品净速率 = 供给 − happyBurn（同一口径）',
    Math.abs(r1.luxury - (SB.economy.happySupply(s2) - burnWith)) < 1e-9,
    'rates=' + r1.luxury.toFixed(6) + ' 手算=' + (SB.economy.happySupply(s2) - burnWith).toFixed(6));

  /* ④ 面板 happyLedger 的 burn 必须与 tick 实际扣费一致。
   *   ⚠️ 场景要选对：**必须供给 < 需求**，tick 才会真的烧掉奢侈品
   *   （`s.res.luxury -= min(_S,_D)*dt`，取 min ⇒ 供给为 0 时实扣恒 0，
   *     拿那种状态去比只会得到「0 = 0」的假通过）。
   *   这里用 pop=20（需求 0.2/s）+ merchant=1（供给 0.05/s）⇒ 供给不足、真的扣。 */
  const s3 = SB.state.freshRun(false);
  s3.civics = { trade: true }; s3.cards = []; s3.gov = 'classical_republic';
  s3.pop = 20; s3.jobs.merchant = 1; s3.happy = 1.0; s3.res.luxury = 10;
  const b3 = s3.res.luxury;
  SB.economy.tick(s3, DT, noop);
  const netDelta = s3.res.luxury - b3;
  /* ⚠️ happyLedger 必须在 tick **之后**取：tick 是恒温器，它会改 `s.happy`。
   *   先取 ledger 再跑 tick 的话，快照里的 H 与跑完的 s.happy 差一个 K·(S−D)·dt，
   *   于是「mechH == happyMech(s)」这类断言会假红（实测差 0.001）。
   *   ⇒ **同一个状态量上的读数必须全部在同一个时刻取**。 */
  const L3 = SB.economy.happyLedger(s3);
  const S3 = SB.economy.happySupply(s3);
  check('供给不足场景成立（供给 < 需求，才能看出 D 那一项）', S3 < L3.burn,
    '供给=' + S3.toFixed(4) + ' 需求=' + L3.burn.toFixed(4));
  /* ⚠️ tick 的实扣是 `min(供给, 需求)`，且**产出与消耗在同一帧内抵消**
   *   （`+= S` 后 `-= min(S,D)`）。所以「存量的净变化」= `S − min(S,D)`，
   *   供给不足时 = 0 ⇒ 拿存量差去比 burn 永远是 0，是**测不出东西**的假判据。
   *   真正能验口径的是「**净变化 = 供给 − 面板 burn**」：供给不足时 burn 恰好等于
   *   供给，净值 0；供给充足时 burn 才是需求。两态都成立 ⇒ 口径同源。 */
  check('🚨 净变化 = (供给 − 面板 burn) × dt（tick 的 min(S,D) 口径 ⇒ 供给不足时净值恒 0）',
    Math.abs(netDelta - (S3 - Math.min(S3, L3.burn)) * DT) < 1e-9,
    '净变化=' + netDelta.toFixed(12) + ' 手算=' + ((S3 - Math.min(S3, L3.burn)) * DT).toFixed(12));
  check('🚨 供给不足 ⇒ 实扣恰为供给、净变化为 0（此时 burn 只反映 min 取满，不反映 D）',
    Math.abs(netDelta) < 1e-9 && L3.burn > S3,
    '净变化=' + netDelta.toFixed(12) + ' 供给=' + S3.toFixed(6) + ' burn=' + L3.burn.toFixed(6));
  /* ⚠️⚠️ 下面所有涉及 happyLedger / happySupply / happyBurn 的读数，
   *   **必须在 tick 之后重新取**，不能混用 tick 前后的快照。
   *   原因：`happy` 是恒温器状态量，tick 会按 K·(S−D)·dt 改它。
   *
   * ⚠️⚠️【更隐蔽的一层】即便都在 tick 之后取，仍然对不上：tick 内部**先用 tick 开始时的
   *   H 算 `_D`（需求），之后才更新 `s.happy`**。于是
   *     · tick 实际扣的 D  = pop × c(H_进) − 0.001
   *     · tick 之后读到的 burn = pop × c(H_出)  且 H_出 > H_进
   *   两者的差就是这一帧的 H 增量。**这不是 bug，是恒温器的正常语义**（需求随本帧的
   *   幸福度走，H 在帧内单调爬）—— 但它意味着「净变化 == 供给 − 事后 burn」这条等式
   *   **在任何非零 dt 下都不严格成立**。
   *   ⇒ 要验「面板 burn 与 tick 同源」，判据必须让帧内 H 增量可忽略：**dt 趋零**。
   *   （本组先前用 dt=1，H 一帧涨 0.018，差值就正好是这个量级 —— 实测 0.90000 vs
   *     0.89640，差 0.0036 = pop × 0.010 × ΔH。）
   */
  const s3c = SB.state.freshRun(false);
  s3c.civics = { trade: true }; s3c.cards = []; s3c.gov = 'classical_republic';
  s3c.pop = 20; s3c.jobs.merchant = 20; s3c.happy = 1.0; s3c.res.luxury = 10;
  const b3c = s3c.res.luxury;
  SB.economy.tick(s3c, DT, noop);
  const L3c = SB.economy.happyLedger(s3c), S3c = SB.economy.happySupply(s3c);
  check('供给充足场景成立（供给 > 需求）', S3c > L3c.burn,
    '供给=' + S3c.toFixed(4) + ' 需求=' + L3c.burn.toFixed(4));
  check('🚨 供给充足 ⇒ tick 净变化 = (供给 − 面板 burn) × dt（dt→0 消除帧内 H 增量）',
    Math.abs((s3c.res.luxury - b3c) - (S3c - L3c.burn) * DT) < 1e-9,
    '净变化=' + (s3c.res.luxury - b3c).toFixed(12) + ' 手算=' + ((S3c - L3c.burn) * DT).toFixed(12));
  /* 守卫：帧内 H 增量 ΔH = K×(S−D)×dt。它对「净变化」比较式的影响还要**再乘一次 dt**
   *   （burn 是速率，tick 的净变化是 dt 秒的量）⇒ 误差 ≈ pop × SLOPE × ΔH × dt。
   *   DT=1e-6 时这个量在 1e-15 量级，远低于 1e-9 的判据阈值。 */
  const dH = Math.abs(SB.CFG.HAPPY_K * (S3c - L3c.burn) * DT);
  const err = s3c.pop * SB.CFG.HAPPY_COST_SLOPE * dH * DT;
  check('dt 取得够小：帧内 H 增量 <1e-6，且它对净变化比较式的影响 <1e-9',
    dH < 1e-6 && err < 1e-9,
    'ΔH=' + dH.toExponential(2) + ' 影响=' + err.toExponential(2));
  /* 断供侧也要覆盖：tick 的实扣是 `min(供给, 需求)` —— 供给为 0 时实扣恒 0，
   *   那时 ledger 的 burn 是「若供给充足会烧多少」。两者**本就不同**，
   *   所以「面板 burn == 实扣」这条只成立在**供给 > 0** 的场景。
   *   这里补一条断供断言，把这个前提写成代码而不是留给记忆。 */
  const s3b = SB.state.freshRun(false);
  s3b.civics = { trade: true }; s3b.cards = []; s3b.gov = 'classical_republic';
  s3b.pop = 20; s3b.jobs.merchant = 0; s3b.happy = 1.0; s3b.res.luxury = 10;
  SB.economy.tick(s3b, DT, noop);
  const Lb = SB.economy.happyLedger(s3b);
  check('断供（商人=0）⇒ 实扣恒 0，而面板仍报需求（两个数含义不同，不是错）',
    Math.abs((10 - s3b.res.luxury) - 0) < 1e-9 && Lb.burn > 0,
    '实扣=' + (10 - s3b.res.luxury).toFixed(6) + ' 面板需求=' + Lb.burn.toFixed(6));
  check('面板 mechH = H − bonus（口径自洽，可验「人口×mechH单价=burn」）',
    Math.abs(L3c.mechH - (L3c.H - L3c.bonus)) < 1e-9,
    'mechH=' + L3c.mechH.toFixed(5) + ' H=' + L3c.H.toFixed(5) + ' bonus=' + L3c.bonus.toFixed(5));
  /* 「mechH == happyMech(s)」这类**同源**断言必须用**静态态**（不跑 tick）：
   *   跑过 tick 之后 s.happy 已被恒温器改动，而 L3c 里的 H 是 tick 过程中算出来的那个
   *   旧值（tick 先算需求再更新 H）⇒ 两者天然差一个帧内增量（DT=1e-6 时约 1.8e-8），
   *   卡在 1e-9 的阈值上就会假红。口径自洽这件事不需要时间推进，用静态态验才干净。 */
  const s6 = SB.state.freshRun(false);
  s6.civics = { trade: true }; s6.cards = []; s6.gov = 'classical_republic';
  s6.pop = 20; s6.jobs.merchant = 2; s6.happy = 1.0;
  const L6 = SB.economy.happyLedger(s6);
  check('mechH 与导出函数同值（面板不许自己另算一份；静态态）',
    Math.abs(L6.mechH - SB.economy.happyMech(s6)) < 1e-9,
    L6.mechH + ' vs ' + SB.economy.happyMech(s6));
  check('「人口 × 每人(mechH) = burn」在加成存在时仍成立',
    Math.abs(L6.pop * L6.per - L6.burn) < 1e-9,
    'pop×per=' + (L6.pop * L6.per).toFixed(8) + ' burn=' + L6.burn.toFixed(8));

  /* ⑤ 反向：加成允许为负（工业化配给卡 happyOffset −1）。
   *   ⚠️ 方向别搞反：`c(H)=0.005+0.010·H` 是**幸福度越高越贵**（住得越舒服越奢侈），
   *   所以 bonus=−1 ⇒ mechH 变**大** ⇒ 单价变**贵**。这是正确语义（日子苦→花在生存上的更多）。
   *   本条真正要钉的是「**加成只进 H、绝不被反向征税**」：
   *   改前 `happyCost(s.happy)` 会让 −1 加成把消耗**变便宜**（等于白送福利），
   *   那才是 bug。现在 burn 由 mechH 决定 ⇒ 变贵，方向与 H 同步。 */
  const s4 = SB.state.freshRun(false);
  s4.civics = { trade: true, rationing: true }; s4.gov = 'tribe'; s4.cards = ['card_rationing'];
  s4.pop = 20; s4.jobs.merchant = 2; s4.happy = 1.0;
  const b4 = SB.economy.happyBonusTotal(s4);
  check('负加成来源生效（工业化配给卡 happyOffset=−1）', Math.abs(b4 + 1) < 1e-9, 'bonus=' + b4);
  check('负加成 ⇒ mechH = H + 1（加成真的压低了幸福度）',
    Math.abs(SB.economy.happyMech(s4) - 2.0) < 1e-9, 'mechH=' + SB.economy.happyMech(s4));
  check('负加成 ⇒ 消耗变**贵**（H 越低越贵；改前会变便宜，那才是反向征税的 bug）',
    SB.economy.happyBurn(s4) > burnNo,
    '负加成=' + SB.economy.happyBurn(s4).toFixed(5) + ' 基准=' + burnNo.toFixed(5));
  /* ⑥ 单价的解析值：加成大于当前幸福度 ⇒ mechH 为负 ⇒ 走 HAPPY_COST_BASE 保底（不是负单价）。 */
  const s5 = SB.state.freshRun(false);
  s5.civics = { trade: true }; s5.cards = []; s5.gov = 'classical_republic';
  s5.pop = 10; s5.happy = 0.5;   // 加成 +1 ⇒ mechH = −0.5 ⇒ 走 HAPPY_COST_BASE 保底
  check('加成大于当前幸福度 ⇒ mechH 为负', SB.economy.happyMech(s5) < 0,
    'mechH=' + SB.economy.happyMech(s5));
  check('加成大于当前幸福度 ⇒ 单价落到保底 0.005（不是负数）',
    Math.abs(SB.economy.happyCostPer(s5) - SB.CFG.HAPPY_COST_BASE) < 1e-9,
    'per=' + SB.economy.happyCostPer(s5) + ' mechH=' + SB.economy.happyMech(s5));
  check('SLOPE 仍为 0.010（这条断言引用它，改常数必红）', SLOPE === 0.010, 'SLOPE=' + SLOPE);
}

/* ---------------- 断供：幸福度渐降而非瞬零（2026-10-05 用户报 bug）----------------
 * 病根：tick 里 `if (_S <= 0) { s.happy = _gb; }` 是**一次性赋值**（_gb 通常 0），
 * 而 else 分支是**积分器**（`H += K·(S−D)·dt`）⇒ 同一个状态量两条更新规则，
 * 玩家把商人拉到 0 的瞬间攒了几小时的幸福度**一秒蒸发**。
 * 修法（用户拍板方案 A）：删掉那条分支，让 `_S = 0` 自然落进积分器。
 *
 * ⚠️ 这几条必须用**渐进式**判据，不能只验「最终值」：
 *   旧实现下 tick 一次就归零（dt=1 就能看出），新实现是按 K·D·dt 连续掉。
 *   只断言「掉到某个值」的话，两者都可能通过 ⇒ 验的是**单 tick 掉多少**。 */
console.log('\n=== 断供：幸福度渐降而非瞬零 ===');
{
  const s = SB.state.freshRun(false);
  s.pop = 10; s.jobs.merchant = 0;
  s.happy = 2;                       // 先攒到一个可见的正档
  s.civics = { trade: true }; s.wonders = {};
  /* ⚠️ 2026-10-05 民生轴跟 trade 解锁走：断供语义只存在于解锁之后 ⇒ 夹具开 civics.trade。 */
  /* ⚠️ 喂饱人口：本夹具 pop=10、商人=0、无粮产 ⇒ 不补给的话藻食耗尽、每 60 tick 饿死 1 人，
   *    D=pop×happyCost 随人口塌缩 ⇒ H 滑不到 HAPPY_FLOOR（实测卡在 0.154）。
   *    给足藻场（暖流季 cold=1、seasonMul=1.5 ⇒ 200×0.45×1.5=135/s ≫ 消耗 10×2=20/s），
   *    kelp 恒为正 ⇒ 人口稳定在 10 ⇒ D 恒定 ⇒ H 一路滑到硬底。popCap=houseBase=1，
   *    人口已满，不会因有余粮额外生育（那样会改 pop、污染 D）。 */
  s.lvl.kelp = 200;
  const h0 = s.happy;
  const need0 = SB.economy.happyBurn(s);

  SB.economy.tick(s, 1, noop);
  const h1 = s.happy;
  const drop1 = h0 - h1;
  /* 单 tick 的降幅必须**很小**：`K·D·dt`（K=0.02，H=2 时 D=10×0.025=0.25 ⇒ 降 0.005）。
   * 旧实现这里会是 2.0（整段清零）。
   * ⚠️ 判据用**相对量**（降幅 < 需求的 5%）而不是写死阈值：drop1 与需求同式 =
   *   K·need0·dt（K=0.02）= 需求的 2%，故「2% < 5%」恒成立、且边界留 2.5 倍余量；
   *   写死 0.01（1%）会恒假（2% 永远不小于 1%）⇒ 这条断言本身写错了，不是生产代码 bug。 */
  check('🚨 断供时幸福度是**渐降**（单 tick 不清零）', drop1 > 0 && drop1 < need0 * 0.05,
    '2.00 → ' + h1.toFixed(5) + '（单 tick 降 ' + drop1.toFixed(5) + '，需求 ' + need0.toFixed(5) +
    '；旧实现会是 2.0 = 整段清零）');
  check('断供降幅 = HAPPY_K × 需求（与积分器同式，不是拍出来的数）',
    Math.abs(drop1 - SB.CFG.HAPPY_K * need0 * 1) < 1e-6,
    '降 ' + drop1.toFixed(6) + ' 期望 ' + (SB.CFG.HAPPY_K * need0).toFixed(6));
  check('断供时**不烧任何奢侈品**（min(S,D)=0，库存不被扣成负数）',
    s.res.luxury === 0, 'luxury=' + s.res.luxury);

  /* 连续跑应当**持续下降并停在硬底**（HAPPY_FLOOR），不是无限掉。 */
  for (let i = 0; i < 4000; i++) SB.economy.tick(s, 1, noop);
  check('长时间断供 ⇒ 幸福度停在硬底 HAPPY_FLOOR（不无限下滑）',
    Math.abs(s.happy - SB.CFG.HAPPY_FLOOR) < 1e-9,
    'H=' + s.happy + ' floor=' + SB.CFG.HAPPY_FLOOR);

  /* 重新雇回商人 ⇒ 幸福度**重新爬升**（不是从 0 开始，也证明它没被写死）。 */
  s.jobs.merchant = 5;
  const hBefore = s.happy;
  for (let i = 0; i < 400; i++) SB.economy.tick(s, 1, noop);
  check('重新雇回商人 ⇒ 幸福度回升（恒温器可逆，不是单向惩罚）',
    s.happy > hBefore, hBefore + ' → ' + s.happy.toFixed(5));
}

/* ---------------- 顶栏读数 & 自然环境卡（用户 2026-09-26 的两条要求）----------------
 *   ① 顶栏的**存量**要带一位小数 —— 珊瑚有 0.1/次 的入口，取整显示时点十下都不动一格；
 *   ② 海底火山与天壳归到同一张「自然环境」卡（两者都是「外面现在什么样」）。
 * 两条都是**显示层**的改动，所以判据也落在显示层：读渲染出来的 HTML，不看数据。 */
console.log('\n=== 顶栏读数与自然环境卡 ===');
{
  /* ① 存量一位小数。夹具借用活的那一局 —— 假渲染层画的永远是 SB.game.run()，
   *    另开一份 freshRun 再渲染 = 测「A 状态渲染出来的 B 状态」。改完立刻还原。 */
  const s = SB.game.run();
  const bakKelp = s.res.kelp, bakCoral = s.res.coral;
  s.res.kelp = 18.04; s.res.coral = 10.36;
  SB.game.markDirty(); SB.game.render();
  const R = g('res');
  const amtOf = k => (R.match(new RegExp('data-res="' + k + '"[^>]*>([^<]*)<')) || [])[1] || '';
  check('存量带一位小数（0.1 量级的手动采集不再「点了没反应」）',
    amtOf('kelp') === '18.0' && amtOf('coral') === '10.4',
    '藻食=' + amtOf('kelp') + '　珊瑚=' + amtOf('coral'));
  check('星空探索与局外星屑不显示在材料资源网格中',
    !/data-res="starExplore"/.test(R) && !/data-res="stardust"/.test(R) &&
      R.indexOf('星空探索') < 0 && R.indexOf('星屑') < 0,
    '星空探索=' + /data-res="starExplore"/.test(R) + ' 星屑=' + /data-res="stardust"/.test(R));
  check('进位正确（9.96 → 10.0，而不是 9.10）',
    SB.economy.fmtAmt(9.96) === '10.0' && SB.economy.fmtAmt(0.04) === '0.0',
    SB.economy.fmtAmt(9.96) + ' / ' + SB.economy.fmtAmt(0.04));
  check('千分位还在（一位小数不影响 2,600 这种写法）',
    SB.economy.fmtAmt(2600.44) === '2,600.4', SB.economy.fmtAmt(2600.44));
  check('上限仍是整数（只有存量带小数，成本/上限不跟着长尾巴）',
    SB.economy.fmt(2600.44) === '2,600' && /<i class="cap[^"]*">\/ [\d,]+<\/i>/.test(R),
    '格子里那半截=' + ((R.match(/<i class="cap[^"]*">[^<]*<\/i>/) || [''])[0]));
  s.res.kelp = bakKelp; s.res.coral = bakCoral;
  SB.game.markDirty(); SB.game.render();

  /* ② 同卡：判据从 index.html 的静态结构读 —— 假 DOM 的 getElementById 是平铺的，
   *    它没有父子关系，"同一张卡" 这件事只在源码里可观测。 */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const card = (html.split('<div class="card"').find(c => c.indexOf('envVolcano') >= 0) || '');
  check('自然环境卡：天壳与海底火山在同一张卡里',
    !!card && card.indexOf('自然环境') >= 0 && card.indexOf('shellTxt') >= 0 &&
    card.indexOf('shellFill') >= 0 && card.indexOf('envVolcano') >= 0, '');
  check('自然环境卡标题可折叠（带 data-fold="env" 的 cardhd）',
    html.indexOf('data-fold="env"') >= 0, '');
  check('主页面分区均带可折叠 cardhd 标题（res / env / faith）',
    html.indexOf('data-fold="res"') >= 0 &&
    html.indexOf('data-fold="env"') >= 0 &&
    html.indexOf('data-fold="faith"') >= 0, '');
}

/* ---------------- 历法的信息型奖励 & 暖石开关 ----------------
 * 2026-09-26 暗流纪重排里这两件是**写了注释但没接线**的半成品：
 *   「历法」只在 techs.js 的 note 里说过「seasonMeta 掌握后才返回周期名」,
 *   「保温法」原本的 eff 只有抗寒上限, 用户规格里的「消耗暖石抵消减产」那一半没有任何代码。
 * 空效果是最难发现的债——玩家研究完一项什么都没发生, 而且没人会去查注释。
 * ⚠️ 抗寒上限随后随「御寒术」整项删除（2026-09-26 用户要求删掉规格外的东西），
 *    保温法现在**故意没有 eff**，全部兑现物是暖石开关。
 *    ⇒ 这条断言必须改成「证伪 tech 侧的抗寒」：谁要是哪天把 eff.warm 加回来，这里要红。
 * 这一节把两条线锁住。 */

/* 空 eff 的科技详情不得再把旧 note/Civ6 对标文案塞进「效果」栏；
 * 实际解锁独立显示，研究条件达成前仍按揭示规则隐藏。 */
{
  const s = SB.game.run();
  const bak = { techs: s.techs, lvl: s.lvl, era: s.era };
  const modal = doc.getElementById('modal');
  const bodyWasOpen = doc.body.classList.contains('modal-open');
  const modalClasses = ['hidden', 'tree-modal', 'tree-tech', 'tree-civic']
    .reduce((out, name) => { out[name] = modal.classList.contains(name); return out; }, {});
  s.techs = Object.assign({}, s.techs, { lighting: true });
  s.lvl = Object.assign({}, s.lvl, { warmnest: 8, workshop: 1 });
  s.era = 2;
  SB.ui.renderParts.info.showTreeDetail('tech', 'horsemanship');
  const detail = g('modalBox');
  check('马术详情将无数值加成与马具解锁分栏显示，不再显示 Civ6 残留文案',
    detail.indexOf('无直接数值加成。') >= 0 && detail.indexOf('解锁内容') >= 0 &&
    detail.indexOf('马具') >= 0 && detail.indexOf('Civ6: Horseback Riding') < 0,
    detail.replace(/<[^>]+>/g, ' ').slice(0, 180));
  check('科技解锁文案中的工坊入口指向工坊页，而非工坊建筑详情',
    detail.indexOf('data-workshop-tab="workshop"') >= 0 &&
    detail.indexOf('data-build-info="workshop"') < 0,
    detail.match(/<span[^>]*data-workshop-tab[^>]*>工坊<\/span>/)?.[0] || '未找到工坊页入口');
  const oldTab = SB.game.getTab();
  SB.ui.render.openWorkshopFromInfo();
  check('点击详情里的工坊入口会关闭详情并打开工坊页',
    SB.game.getTab() === 'workshop' && modal.classList.contains('hidden'), 'tab=' + SB.game.getTab());
  SB.game.setTab(oldTab);
  SB.ui.renderParts.info.showTreeDetail('tech', 'scaffoldT');
  const scaffoldDetail = g('modalBox');
  const scaffoldText = scaffoldDetail.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  check('构架术详情明确写出绳的工坊配方，效率以百分比显示',
    scaffoldText.indexOf('工坊配方「绳」') >= 0 &&
    scaffoldText.indexOf('工艺制作效率+15%') >= 0 &&
    scaffoldDetail.indexOf('data-workshop-tab="workshop"') >= 0,
    scaffoldDetail.replace(/<[^>]+>/g, ' ').slice(0, 180));
  check('市政里的工坊配方也生成工坊页入口',
    SB.ui.renderParts.info.linkInfoNames('解锁工坊配方「艺术品」', true)
      .indexOf('data-workshop-tab="workshop"') >= 0, '历史哲学配方入口');
  const renameSnapshot = { civics: s.civics, jobs: s.jobs };
  s.civics = Object.assign({}, s.civics, { department: 1 });
  s.jobs = Object.assign({}, s.jobs, { scribe: 1 });
  const folkPane = SB.ui.renderParts.paneFolk();
  const scribeRowAt = folkPane.indexOf('data-job-row="scribe"');
  const nextJobRowAt = folkPane.indexOf('<div class="row folk-job-row"', scribeRowAt + 1);
  const scribeRow = scribeRowAt >= 0
    ? folkPane.slice(scribeRowAt, nextJobRowAt >= 0 ? nextJobRowAt : undefined) : '';
  check('行政部门完成后族民页的书手行实际显示为官员',
    scribeRow.indexOf('官员') >= 0 && scribeRow.indexOf('书手') < 0, scribeRow);
  s.civics = renameSnapshot.civics;
  s.jobs = renameSnapshot.jobs;
  const steelSchool = SB.civic.byId('civ_steelschool');
  const civicSnapshot = {
    civics: s.civics, civShown: s.civShown, culture: s.res.culture
  };
  s.civics = Object.assign({}, s.civics, { guild: 1 });
  delete s.civics.civ_steelschool;
  s.civShown = Object.assign({}, s.civShown, { civ_steelschool: 1 });
  s.era = 4; /* ERA7 前 civ_steelschool 是 era 4，套件本函数 s.era=2 会触发纪元门挡住文化点不足块；
               * 抬到 4 让纪元放行，才能测到「市政点不足」显示（bak 在 :641 捕获、:704 还原）。 */
  s.res.culture = 19000;
  SB.ui.renderParts.info.showTreeDetail('civic', 'civ_steelschool');
  const civicDetail = g('modalBox');
  check('市政点不足时详情明确显示市政点余额与需求',
    !!steelSchool && civicDetail.indexOf('市政点不足') >= 0 &&
    civicDetail.indexOf('现有 19.0k / 需求 30.0k') >= 0,
    civicDetail.replace(/<[^>]+>/g, ' ').slice(0, 220));
  s.civics = civicSnapshot.civics;
  s.civShown = civicSnapshot.civShown;
  s.res.culture = civicSnapshot.culture;
  s.techs = bak.techs; s.lvl = bak.lvl; s.era = bak.era;
  modalClasses.hidden ? modal.classList.add('hidden') : modal.classList.remove('hidden');
  ['tree-modal', 'tree-tech', 'tree-civic'].forEach(name =>
    modalClasses[name] ? modal.classList.add(name) : modal.classList.remove(name));
  bodyWasOpen ? doc.body.classList.add('modal-open') : doc.body.classList.remove('modal-open');
}

}
