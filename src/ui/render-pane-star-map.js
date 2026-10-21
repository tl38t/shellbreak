/* 星图面板：动画星图在 iframe 中；选择天体后，父页面在 iframe 下方渲染该星球的建筑，
 * 建造 / 升级 / 启停直接复用巢穴建筑列表的 data-build 与 data-*-inc/dec 委托动作。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});
  var selectedBody = 'europa';
  var starMapView = 'phase1';
  var BODY_BUILDINGS = {
    europa: ['satellite', 'spacestation'],
    rhea: ['rheamine'],
    titan: ['titancloud'],
    ring: [],
    enceladus: ['enceladus_launch']
  };
  var BODY_NAMES = { europa: '欧罗巴', rhea: '瑞亚', titan: '泰坦', ring: '土星环', enceladus: '恩克拉多斯' };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function bodyBuildingCounts(s, id) {
    var level = (s.lvl && s.lvl[id]) || 0;
    var running = level;
    if (id === 'satellite') running = Math.max(0, level - (s.satelliteStop || 0));
    if (id === 'spacestation') running = Math.max(0, level - (s.spacestationStop || 0));
    return { level: level, running: running };
  }

  function drawBodyBuilding(s, id) {
    var b = SB.habitat.buildingById(id);
    if (!b) return '';
    var count = bodyBuildingCounts(s, id);
    var unlocked = SB.habitat.unlocked(s, b);
    var blocked = !SB.habitat.needMet(s, b);
    var cost = SB.economy.costOf(s, id);
    var canBuy = unlocked && !blocked && SB.economy.canAfford(s, cost);
    var label = !unlocked ? '尚未解锁' : (blocked ? '需先建成' : (count.level > 0 ? '升级 ' : '建造 ') + SB.economy.costOwnedTxt(s, cost));
    if (blocked) {
      var need = SB.habitat.buildingById(b.need);
      label = '需先建成' + (need ? need.name : '前置建筑');
    }
    var operating = '';
    if (id === 'satellite' && count.level > 0) {
      operating = '<span class="furnctl' + (count.running ? ' on' : '') + '">' +
        '<button class="fbtn" data-satellite-dec="1" title="少开一颗"' + (count.running <= 0 ? ' disabled' : '') + '>−</button>' +
        '<b class="fnum">运行 ' + count.running + '/' + count.level + '</b>' +
        '<button class="fbtn" data-satellite-inc="1" title="多开一颗"' + (count.running >= count.level ? ' disabled' : '') + '>＋</button>' +
        SB.ui.drawTag(s, 'satellite') + '</span>';
    }
    if (id === 'spacestation' && count.level > 0) {
      operating = '<span class="furnctl' + (count.running ? ' on' : '') + '">' +
        '<button class="fbtn" data-spacestation-dec="1" title="停一座"' + (count.running <= 0 ? ' disabled' : '') + '>−</button>' +
        '<b class="fnum">运行 ' + count.running + '/' + count.level + '</b>' +
        '<button class="fbtn" data-spacestation-inc="1" title="开一座"' + (count.running >= count.level ? ' disabled' : '') + '>＋</button>' +
        SB.ui.drawTag(s, id) + '</span>';
    }
    return '<div class="row bld-row' + (count.level ? ' is-owned' : '') + '"><div>' +
      '<div class="nm"><span class="bld-label"><button type="button" class="building-name" data-build-info="' + id + '">' + escapeHtml(b.name) +
      '</button> <span class="tag">' + count.level + ' 座</span></span><span class="bld-ops">' + operating + '</span></div>' +
      '<div class="ds">' + escapeHtml((SB.ui && SB.ui.buildingDescText) ? SB.ui.buildingDescText(s, b) : b.desc) + (!unlocked ? '（尚未解锁）' : '') + '</div></div>' +
      '<button class="btn buy" data-build="' + id + '"' + (canBuy ? '' : ' disabled') + '>' + escapeHtml(label) + '</button></div>';
  }

  function renderSelectedBody(s) {
    var panel = root.document && root.document.getElementById('star-map-buildings');
    if (!panel || !s) return;
    if (starMapView === 'phase2') { panel.style.display = 'none'; return; }
    panel.style.display = '';
    var ids = BODY_BUILDINGS[selectedBody] || [];
    var owned = ids.reduce(function (sum, id) { return sum + ((s.lvl && s.lvl[id]) || 0); }, 0);
    var active = ids.reduce(function (sum, id) { return sum + bodyBuildingCounts(s, id).running; }, 0);
    var html = '<div class="cardhd" style="--hc:#87a7ff"><span>' + escapeHtml(BODY_NAMES[selectedBody] || '天体') +
      ' · 建筑管理</span><span class="hcsub">在轨 / 建成 ' + owned + ' · 运转中 ' + active + '</span></div>';
    if (ids.length) {
      html += ids.map(function (id) { return drawBodyBuilding(s, id); }).join('');
    } else {
      html += '<div class="note">这个天体目前还没有接入可建造的游戏建筑。</div>';
    }
    panel.innerHTML = html;
  }

  function onStarMapMessage(event) {
    var iframe = root.document && root.document.querySelector('#pane-star-map iframe.starmap-frame');
    var data = event && event.data;
    if (!iframe || event.source !== iframe.contentWindow || !data) return;
    if (data.type === 'sb-star-map-height') {
      iframe.style.height = Math.max(600, Math.min(1200, Number(data.height) || 780)) + 'px';
      return;
    }
    if (data.type === 'sb-star-map-view') {
      starMapView = data.view === 'phase2' ? 'phase2' : 'phase1';
      var dysonPanel = root.document.getElementById('dyson-panel');
      if (dysonPanel) dysonPanel.style.display = starMapView === 'phase2' ? 'none' : '';
      if (starMapView === 'phase2') {
        var panel = root.document.getElementById('star-map-buildings');
        if (panel) panel.style.display = 'none';
      } else renderSelectedBody(SB.game && SB.game.run ? SB.game.run() : null);
      return;
    }
    if (data.type !== 'sb-star-map-select-body') return;
    if (!Object.prototype.hasOwnProperty.call(BODY_BUILDINGS, data.body)) return;
    selectedBody = data.body;
    renderSelectedBody(SB.game && SB.game.run ? SB.game.run() : null);
  }
  if (root.addEventListener) root.addEventListener('message', onStarMapMessage);

  function paneStarMap() {
    var s = SB.game && SB.game.run ? SB.game.run() : null;
    if (!s || !(s.shellOpened || s.breakSettled) || s.shell > 0)
      return '<div class="note">凿穿天壳后，本周目的星图将在这里解锁。</div>';
    return '<div class="starmap-frame-wrap">' +
      '<iframe class="starmap-frame" sandbox="allow-scripts" ' +
      'src="src/ui/star-map-frame.html?v=3" title="壳外星图" ' +
      'style="width:100%;height:780px;border:0;border-radius:12px;background:#07111d"></iframe></div>' +
      /* ERA10（2026-10-20）：戴森球终局面板容器。⚠️ 只放**空壳**在这里——实时数字
       * （帆数/节点数/进度）由 refreshDysonPanel 单独写，原因见 render.js 的
       * lastStarMapHTML 签名：pane HTML 里嵌实时值会让 iframe 每 2 秒被重载。 */
      '<div id="dyson-panel" class="dyson-panel"></div>' +
      '<div id="star-map-buildings" class="star-map-buildings"></div>';
  }

  /* ERA10（2026-10-20 · 用户 ERA10 表「绝热材料」解锁2）：戴森球终局面板内容。
   * 门 = 完成《绝热材料》（与发射场模式切换钮同源）；没完成 ⇒ 容器清空。
   * 进度 = economy.dysonPct（**双达标取小**，用户拍 Q4）：min(帆/10000, 节点/1000)。
   * 五档背景图 20/40/60/80/100（assets/dyson/stage-*.png，占位资产，见 gen 脚本注释）。 */
  function renderDysonPanel(s) {
    var panel = root.document && root.document.getElementById('dyson-panel');
    if (!panel) return;
    if (!s || !(s.techs && s.techs.adiabatic)) { panel.innerHTML = ''; panel.className = 'dyson-panel'; return; }
    var pct = (SB.economy && SB.economy.dysonPct) ? SB.economy.dysonPct(s) : 0;
    var pc = Math.max(0, Math.min(1, pct)) * 100;
    var stage = 0;
    if (s.dysonDone || pc >= 100) stage = 100;
    else if (pc >= 80) stage = 80;
    else if (pc >= 60) stage = 60;
    else if (pc >= 40) stage = 40;
    else if (pc >= 20) stage = 20;
    var sailCap = SB.CFG.DYSON_SAIL_CAP || 10000, nodeCap = SB.CFG.DYSON_NODE_CAP || 1000;
    var sails = s.sunSails || 0, nodes = s.dysonNodes || 0;
    var bg = stage > 0 ? "assets/dyson/stage-" + stage + ".png" : '';
    panel.className = 'dyson-panel dyson-stage-' + stage + (s.dysonDone ? ' is-done' : '');
    panel.style.backgroundImage = bg ? "url('" + bg + "')" : '';
    panel.innerHTML =
      '<div class="cardhd" style="--hc:#4FD1C9"><span>戴森球 · 终局工程</span>' +
      '<span class="hcsub">' + (s.dysonDone ? '★ 已竣工' : pc.toFixed(2) + '%') + '</span></div>' +
      '<div class="dyson-bar"><div class="dyson-fill" style="width:' + pc.toFixed(2) + '%"></div></div>' +
      '<div class="dyson-counts">太阳帆 <b>' + sails.toLocaleString() + '</b> / ' + sailCap.toLocaleString() +
      ' ＋ 戴森球节点 <b>' + nodes.toLocaleString() + '</b> / ' + nodeCap.toLocaleString() + ' 即可完成</div>' +
      '<div class="ds">进度取两项中<b>较慢</b>的一侧（双达标取小）：帆与节点都到位才算通关。' +
      '发射场在《绝热材料》完成后可切换制造太阳帆或戴森球节点；达到 100% 即戴森球竣工。</div>';
  }

  parts.paneStarMap = paneStarMap;
  parts.refreshStarMapBuildings = renderSelectedBody;
  /* ERA10（2026-10-20）：戴森面板独立刷新入口（render.js 的星图分支与 star-map
   * 消息回调都调它——progress 变化不重写 pane HTML，iframe 不被重载）。 */
  parts.refreshDysonPanel = renderDysonPanel;
})(typeof window !== 'undefined' ? window : globalThis);
