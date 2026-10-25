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
      'src="src/ui/star-map-frame.html?v=5" title="壳外星图" ' +
      'style="width:100%;height:780px;border:0;border-radius:12px;background:#07111d"></iframe></div>' +
      '<div id="star-map-buildings" class="star-map-buildings"></div>';
  }

  parts.paneStarMap = paneStarMap;
  parts.refreshStarMapBuildings = renderSelectedBody;
})(typeof window !== 'undefined' ? window : globalThis);
