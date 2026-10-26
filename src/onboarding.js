/* 天壳 / SHELLBREAK — 新手引导（B 档：首入欢迎层 + 首局走查脚本）
 * 设计文档：docs/ONBOARDING_DESIGN_v0.1.md（§2.2 走查脚本为权威流程）。
 *
 * 职责铁律（与现有「解锁叙事」彻底分离）：
 *   1. 引导 ≠ 解锁叙事：互不调用、互不影响。
 *   2. 非阻塞 + 可跳过：高亮是浮层标签，点 ✕ 弹「是否跳过新手教程？」确认后整体终止。
 *   3. 两个「关闭」概念分离：
 *        · 设置开关 shellbreak.onboarding('1'/'0', 默认开) = 玩家偏好，不进周目存档；
 *        · 已展示标记 meta.onboardSeen(跨周目永久) = 本安装播过一次，二周目不 nag。
 *   4. 纯字段推进条件（s.lvl / s.jobs / s.res / s.techs / s.pop）+ 当前页签态，
 *      乱序操作也按真实状态流动，不会卡死。
 *   5. 无 DOM 早退：e2e 假 DOM 下 start/tick 必须不抛错（所有 DOM 访问都包防御）。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  var KEY = 'shellbreak.onboarding';
  var active = false;     // 引导是否进行中（含欢迎层）
  var cur = 0;            // 0 = 欢迎层已显示；1..11 = 走查步；>11 = 完成
  var layer = null, welcomeEl = null, spotEl = null, tipEl = null, tipText = null, listenersOn = false;
  var kelpBase = null;    // 步1「采藻食」进入时的藻食基线（初始库存可能非 0，如挑战模式）

  /* ---------------- 安全 DOM 工具（e2e 假 DOM 不抛错） ---------------- */
  function hasDom() {
    return typeof document !== 'undefined' && document && typeof document.getElementById === 'function';
  }
  function qs(sel) {
    try { return document.querySelector(sel); } catch (e) { return null; }
  }
  function getRect(el) {
    try { if (el && typeof el.getBoundingClientRect === 'function') return el.getBoundingClientRect(); } catch (e) {}
    return null;
  }
  function removeEl(e) {
    if (!e) return;
    try {
      if (e.remove) e.remove();
      else if (e.parentNode && e.parentNode.removeChild) e.parentNode.removeChild(e);
    } catch (_) {}
  }
  function state() {
    try { if (SB.game && SB.game.run) return SB.game.run(); } catch (e) {}
    return null;
  }
  function curTab() {
    try {
      var t = qs('.tab.on');
      return (t && t.dataset) ? t.dataset.tab : '';
    } catch (e) { return ''; }
  }

  /* ---------------- 设置开关 / 已展示标记 ---------------- */
  function isEnabled() {
    try {
      var v = root.localStorage && root.localStorage.getItem(KEY);
      return v !== '0';
    } catch (e) { return true; }
  }
  function setEnabled(on) {
    try { if (root.localStorage) root.localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    if (!on) hideAll();
  }
  function seen() {
    try {
      var m = SB.game && SB.game.meta && SB.game.meta();
      return !!(m && m.onboardSeen);
    } catch (e) { return true; }
  }
  function markSeen() {
    try {
      var m = SB.game && SB.game.meta && SB.game.meta();
      if (m) m.onboardSeen = true;
      /* ⚠️ 落盘：meta 只有特定事件才 saveMeta，onboarding 改了标记若不存，
       * 刷新后 loadMeta 读回旧值 ⇒ 欢迎层每次重弹（问题1）。 */
      if (SB.state && SB.state.saveMeta) SB.state.saveMeta(m);
    } catch (e) {}
  }

  /* ---------------- 欢迎层文案（用户定稿，2026-10-25） ---------------- */
  var WELCOME =
    '<p>你是深海无光海渊中的一只鲛人。</p>' +
    '<p>你抬起头来，幽深的重重海水之上，头顶的「天壳」隔绝了群星，也挡住了文明向上的途径。</p>' +
    '<p>你的目标只有一个：一路向上，凿穿天壳，带文明升上星空。</p>' +
    '<div class="ob-howto"><span class="ob-howto-h">── 具体怎么做 ──</span><ul>' +
      '<li>建造建筑 —— 它们有的会自动产出资源，有的能提高人口上限，有的能提高资源产出，有的能用低级资源制造高级资源；</li>' +
      '<li>为族民分配工作，生产所需的资源；</li>' +
      '<li>研究科技、市政，获取加成，解锁新的建筑、新的奇观、新的政体、新的政策卡；</li>' +
      '<li>政体具有政策槽，可以选择需要的政策卡加入政策槽中，获取加成；越后期解锁的政体，拥有越多的政策槽；</li>' +
      '<li>某些奇观会提供永久政策槽；</li>' +
      '<li>某些政策卡将会在研究市政后得到升级；</li>' +
      '<li>游戏中期的目标是打破冰壳，你需要建设奇观钻机，将之击碎；</li>' +
      '<li>游戏的最终目标是建设戴森球——当然，你还有另一个选择…</li>' +
    '</ul></div>' +
    '<p class="ob-note">注意：如果您觉得进度推进有些困难，那可以在研究完「神学」市政后选择重启轮回，通过获取的轮回点与星屑购买局外加成，并投身新的轮回。</p>' +
    '<p class="ob-note">另外，您还可以在新的轮回中启用带着各式限制条件的挑战模式，一旦挑战成功，您在之后的轮回中也会获得相应的加成。</p>' +
    '<p class="ob-cta">那么，就让我们从建造第一个深海藻场开始吧…</p>';

  /* ---------------- 走查步（§2.2，1 基） ----------------
   * 每步 resolve(S) 返回：
   *   targets : 选择器数组（高亮目标；优先选非页签的那个动作元素）
   *   tip     : 标签文案
   *   fallback: 当目标不在当前 pane 时，标签回退锚定的选择器（通常是对应页签）
   *   advance : 离开此步的条件（纯字段 / 页签态）
   * 选择器依据见设计文档 §2.2 注②。 */
  var STEPS = [
    null, // 占位：索引 0 不用
    { // 1 采藻食（手动采集教学：点一次即过）
      resolve: function (S) {
        if (kelpBase === null) kelpBase = S.res.kelp || 0;
        return {
          targets: ['[data-gather="kelp"]'],
          tip: '手动采集一些藻食',
          advance: (S.res.kelp || 0) > kelpBase + 1e-9
        };
      }
    },
    { // 2 深海藻场
      resolve: function (S) {
        return {
          targets: ['[data-build="kelp"]'],
          fallback: '[data-tab="village"]',
          tip: '建造深海藻场，自动生产藻食',
          advance: (S.lvl.kelp || 0) >= 1
        };
      }
    },
    { // 3 族民页签
      resolve: function (S) {
        return {
          targets: ['[data-tab="folk"]'],
          tip: '分配族民工作',
          advance: curTab() === 'folk'
        };
      }
    },
    { // 4 采集者加号
      resolve: function (S) {
        return {
          targets: ['.folk-job-row[data-job-row="gather"] .folk-job-controls button:last-child'],
          fallback: '[data-tab="folk"]',
          tip: '将族民分配至采集工作，快速获取藻食',
          advance: (S.jobs.gather || 0) > 0
        };
      }
    },
    { // 5 采珊瑚（动作在巢穴页；不在本页时整条隐藏，不硬凑页签）
      resolve: function (S) {
        return {
          targets: ['[data-gather="coral"]'],
          fallback: '[data-tab="village"]',
          tip: '暂时手动采集一些珊瑚',
          advance: (S.res.coral || 0) > 0
        };
      }
    },
    { // 6 礁口巢（需先攒 5 珊瑚）
      resolve: function (S) {
        /* ⚠️ 完成态先行：礁口巢一旦建成（无论玩家何时建的），本步立即放行。
         * 旧版先判珊瑚再判巢——建巢花掉 5 珊瑚后存量回落 <5，
         * 会永远卡回「继续采集珊瑚」段（2026-10-25 用户实测踩中）。 */
        if ((S.lvl.nest || 0) >= 1) {
          return { targets: ['[data-build="nest"]'], fallback: '[data-tab="village"]', tip: '', advance: true };
        }
        var coral = S.res.coral || 0;
        if (coral < 5) {
          return {
            targets: ['[data-gather="coral"]'],
            fallback: '[data-tab="village"]',
            tip: '继续采集珊瑚，攒够 5 个建造礁口巢',
            advance: false
          };
        }
        return {
          targets: ['[data-build="nest"]'],
          fallback: '[data-tab="village"]',
          tip: '建造一个礁口巢，提高人口上限',
          advance: (S.lvl.nest || 0) >= 1
        };
      }
    },
    { // 7 升级深海藻场（动作在巢穴页；不在本页时整条隐藏）
      resolve: function (S) {
        return {
          targets: ['[data-build="kelp"]'],
          fallback: '[data-tab="folk"]',
          tip: '生产新的族民需要一些时间，你可以趁这个时间再升级一下深海藻场',
          /* ⚠️ 放行条件：新族民已产出（pop>1，本步设计的「等族民」意图）为主；
           *    藻场数量兜底从旧版 >=2 提到 >=5——旧版 ==2 会在「才建第 2 座藻场」时
           *    就放行第 7 步，导致第 8 步提前激活、引导高亮被顶到科技页
           *    （用户 2026-10-26 实测：到两个藻场高亮就跳到科技标签）。>=5 与科技
           *    事件(panelOpen)对齐，届时第 8 步本就激活，不会提前跳戏。 */
          advance: (S.pop > 1) || (S.lvl.kelp || 0) >= 5
        };
      }
    },
    { // 8 科技解锁弹窗「进入科技页」钮
      resolve: function (S) {
        var panelOpen = !!(SB.tech && SB.tech.panelOpen && SB.tech.panelOpen(S));
        var writing = !!S.techs.writing;
        var seen = !!(SB.tech && SB.tech.popupSeen && SB.tech.popupSeen(S));
        /* ⚠️ 科技事件尚未发生（未达 5 藻场 / 未掌握结绳 / 弹窗从未播过）时，第 8 步休眠：
         * 引导整体不显示——避免「才 2~4 座藻场就高亮科技页」的跳戏（用户 2026-10-26 实测）。
         * 一旦 panelOpen(5 藻场) / writing / 已看过弹窗，再亮出科技页引导。 */
        if (!panelOpen && !writing && !seen) return null;
        /* 放行仅当玩家真正接触了科技：① 已切到科技页（点了弹窗的「进入科技页」）；
         * ② 结绳已掌握（writing 在 kelp>=5 时由 discover 的 free 分支自动掌握）。
         * ⚠️ 删掉旧的 (seen && !modalOpen) 宽松分支：techPopup 被置真（老档/重载/被吞）
         * 不代表玩家接触过科技，它会让第 8 步在「还在村落实体建藻场」时提前放行跳到第 9 步，
         * 把高亮顶到科技页。旧分支原想防死锁，但 fallback[data-tab=tech] 已能正确引导玩家
         * 点科技页（点了 curTab()==='tech' 即放行），不存在死锁，故删。 */
        var done = curTab() === 'tech' || writing;
        return {
          targets: ['#mStoryOk'],
          fallback: '[data-tab="tech"]',
          tip: '建造五座深海藻场，触发了结绳科技的尤里卡',
          advance: done
        };
      }
    },
    { // 9 结绳科技：先点开详情，再点「免费研究」
      resolve: function (S) {
        /* ⚠️ 用户 2026-10-26 要求：点开「结绳」详情后，高亮应跳到「免费研究」钮，
         * 而不是停在科技树节点上（节点被详情弹窗盖住，飘着没有意义）。
         * 判据：结绳详情面板是否打开 = 面板里是否出现[data-tree-study="tech"][data-tech="writing"]这个研究钮
         * （仅在打开结绳详情时存在于 DOM，见 render-info.js:173）。 */
        var detailOpen = !!qs('[data-tree-study="tech"][data-tech="writing"]');
        if (detailOpen) {
          return {
            targets: ['[data-tree-study="tech"][data-tech="writing"]'],
            tip: '点击「免费研究」，正式掌握结绳、解锁学者职业',
            /* 掌握即放行（writing 写入 = 点了免费研究）。 */
            advance: !!S.techs.writing
          };
        }
        return {
          targets: ['#techrow-writing'],
          fallback: '[data-tab="tech"]',
          tip: '点开「结绳」科技，看看它的尤里卡与效果',
          /* 详情已打开（下一步跳到免费研究钮）或已掌握（异常路径）即放行。 */
          advance: !!S.techs.writing
        };
      }
    },
    { // 10 回族民页
      resolve: function (S) {
        return {
          targets: ['[data-tab="folk"]'],
          tip: '结绳已研究，回去分配学者吧',
          advance: curTab() === 'folk'
        };
      }
    },
    { // 11 学者加号
      resolve: function (S) {
        return {
          targets: ['.folk-job-row[data-job-row="scholar"] .folk-job-controls button:last-child'],
          fallback: '[data-tab="folk"]',
          tip: '分配族民，获取科技点',
          advance: (S.jobs.scholar || 0) > 0
        };
      }
    }
  ];

  function isTabSel(sel) { return /^\[data-tab=/.test(sel); }
  function isVisible(e) {
    var r = getRect(e);
    return !!(r && r.width > 0 && r.height > 0);
  }

  /* ---------------- 浮层渲染 ---------------- */
  function ensureLayer() {
    if (layer || !hasDom()) return;
    try {
      layer = document.createElement('div');
      layer.id = 'obLayer';
      layer.className = 'ob-layer';
      document.body.appendChild(layer);
      if (!listenersOn) {
        listenersOn = true;
        root.addEventListener('scroll', place, true);
        root.addEventListener('resize', place);
      }
    } catch (e) { layer = null; }
  }
  function showSpot(rect) {
    if (!layer) return;
    if (!spotEl) {
      spotEl = document.createElement('div');
      spotEl.className = 'ob-spot';
      layer.appendChild(spotEl);
    }
    spotEl.style.display = 'block';
    spotEl.style.left = (rect.left - 6) + 'px';
    spotEl.style.top = (rect.top - 6) + 'px';
    spotEl.style.width = (rect.width + 12) + 'px';
    spotEl.style.height = (rect.height + 12) + 'px';
  }
  function hideSpot() { if (spotEl) spotEl.style.display = 'none'; }
  function showTip(text, rect) {
    if (!layer) return;
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'ob-tip';
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'ob-tip-x';
      x.setAttribute('aria-label', '跳过新手教程');
      x.textContent = '×';
      x.onclick = askSkip;
      tipEl.appendChild(x);
      tipText = document.createElement('span');
      tipText.className = 'ob-tip-txt';
      tipEl.appendChild(tipText);
      layer.appendChild(tipEl);
    }
    if (tipText) tipText.textContent = text;
    tipEl.style.display = 'block';
    var vw = root.innerWidth || 360, vh = root.innerHeight || 640;
    var box = (tipEl.getBoundingClientRect ? tipEl.getBoundingClientRect() : null);
    var th = box ? box.height : 56, tw = box ? box.width : 260;
    var top = rect.bottom + 8;
    if (top + th > vh - 8) top = rect.top - 8 - th;
    if (top < 8) top = 8;
    var left = rect.left + rect.width / 2 - tw / 2;
    if (left < 8) left = 8;
    if (left + tw > vw - 8) left = vw - 8 - tw;
    tipEl.style.top = top + 'px';
    tipEl.style.left = left + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

  function place() {
    if (!active || cur < 1 || cur > STEPS.length) { hideSpot(); hideTip(); return; }
    var S = state();
    if (!S) { hideSpot(); hideTip(); return; }
    var step = STEPS[cur];
    if (!step) { hideSpot(); hideTip(); return; }
    var r = step.resolve(S);
    if (!r) { hideSpot(); hideTip(); return; }
    /* 2026-10-25 用户拍板：动作目标（非页签元素）不在当前页时，引导整体不显示，
     * 不再拿页签当锚点硬凑——那会让「采集珊瑚」的标签飘在族民页顶上指着页签，
     * 玩家误以为要点页签。目标元素在 DOM 里但被隐藏（rect 为 0）= 不在本页；
     * 切到目标页后 tick 每 2s 自动恢复显示。 */
    var sels = r.targets || [];
    var i, e, actionEl = null, actionHidden = false, tabEl = null;
    for (i = 0; i < sels.length; i++) {
      e = qs(sels[i]);
      if (!e) continue;
      if (isTabSel(sels[i])) { if (!tabEl) tabEl = e; continue; }  // 页签只当兜底锚（步3/10 本就引导切页）
      if (isVisible(e)) { actionEl = e; break; }
      actionHidden = true;
    }
    /* 锚点优先级：① 本页可见的动作元素（如「建造藻场」¨「采集珊瑚」）；
     * ② 没有动作元素时锚页签（步3/10：目标就是「点族民页签」，应高亮页签引导切页，不能整条消失）；
     * ③ 动作元素存在但隐藏（= 不在本页）：整体隐藏（用户 2026-10-25 拍板，别拿页签硬凑）；
     * ④ 以上都没有才回退到 fallback。 */
    var anchor = actionEl || tabEl;
    if (!anchor && !actionHidden) anchor = r.fallback ? qs(r.fallback) : null;
    if (!anchor) { hideSpot(); hideTip(); return; }
    var rect = getRect(anchor);
    if (!rect || rect.width <= 0 || rect.height <= 0) { hideSpot(); hideTip(); return; }
    showSpot(rect);
    showTip(r.tip, rect);
  }

  function showWelcome() {
    ensureLayer();
    if (!layer || welcomeEl) return;
    welcomeEl = document.createElement('div');
    welcomeEl.className = 'ob-welcome';
    welcomeEl.innerHTML =
      '<div class="ob-welcome-card">' +
        '<div class="ob-welcome-hd">天壳 · 从深海望向群星</div>' +
        '<div class="ob-welcome-bd">' + WELCOME + '</div>' +
        '<div class="ob-welcome-ft"><button type="button" class="btn buy ob-start" id="obStart">开始探索</button></div>' +
      '</div>';
    layer.appendChild(welcomeEl);
    var btn = null;
    try { btn = document.getElementById('obStart'); } catch (e) {}
    if (btn) btn.onclick = function () {
      removeEl(welcomeEl); welcomeEl = null;
      markSeen();   // 欢迎层已展示过：标记本安装「已播」，刷新不再重弹（问题1）
      cur = 1; place();
    };
  }

  function askSkip() {
    if (SB.ui && SB.ui.render && SB.ui.render.confirmPanel) {
      SB.ui.render.confirmPanel({
        title: '是否跳过新手教程？',
        body: '<div class="note">跳过后将不再显示首局引导；可在「设置 → 新手引导」中重新开启。</div>',
        ok: '跳过教程',
        onOk: function () { finish(); }
      });
    } else { finish(); }
  }

  function finish() {
    markSeen();
    hideAll();
  }

  /* ---------------- 对外 API ---------------- */
  function start(S) {
    if (!hasDom()) return;          // e2e 假 DOM：直接早退，不影响回归
    if (!isEnabled()) return;
    if (seen()) return;
    S = S || state();
    if (!S) return;
    active = true; cur = 0; kelpBase = null;
    showWelcome();
  }

  function tick(S) {
    if (!active || !hasDom()) return;
    S = S || state();
    if (!S) return;
    /* 连续推进所有已满足的步（乱序操作也能一次追平）。 */
    var guard = 0;
    while (guard++ < 16) {
      if (cur < 1 || cur > STEPS.length) break;
      var step = STEPS[cur];
      var r = step && step.resolve(S);
      if (r && r.advance) { cur++; continue; }
      break;
    }
    if (cur > STEPS.length) { finish(); return; }
    place();
  }

  function hideAll() {
    active = false;
    removeEl(welcomeEl); welcomeEl = null;
    hideSpot(); hideTip();
  }

  SB.onboarding = {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    start: start,
    tick: tick,
    hideAll: hideAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
