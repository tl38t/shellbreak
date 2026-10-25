/* Shared visual talent-tree renderer for the two meta shops. */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function treeMarkup(tree) {
    var nodes = tree.nodes || [], byId = Object.create(null), children = Object.create(null);
    var roots = [], leavesById = Object.create(null), positions = Object.create(null), i;
    var useExplicitLayers = tree.layout === 'layered';
    function parentIds(node) {
      var ids = Array.isArray(node.nests) ? node.nests.slice() : [];
      if (node.nest && ids.indexOf(node.nest) < 0) ids.push(node.nest);
      return ids;
    }
    for (i = 0; i < nodes.length; i++) byId[nodes[i].id] = nodes[i];
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i], nodeParents = parentIds(node), primaryParent = '';
      for (var ni = 0; ni < nodeParents.length; ni++) {
        if (byId[nodeParents[ni]]) { primaryParent = nodeParents[ni]; break; }
      }
      if (primaryParent) (children[primaryParent] || (children[primaryParent] = [])).push(node);
      else roots.push(node);
    }

    function leafCount(node, trail) {
      if (leavesById[node.id]) return leavesById[node.id];
      trail = trail || Object.create(null);
      if (trail[node.id]) return 1;
      trail[node.id] = true;
      var kids = children[node.id] || [], count = 0;
      for (var ci = 0; ci < kids.length; ci++) count += leafCount(kids[ci], trail);
      delete trail[node.id];
      leavesById[node.id] = count || 1;
      return leavesById[node.id];
    }

    var totalLeaves = 0;
    for (i = 0; i < roots.length; i++) totalLeaves += leafCount(roots[i]);
    totalLeaves = Math.max(1, totalLeaves);

    function place(node, depth, start, end, trail) {
      trail = trail || Object.create(null);
      if (trail[node.id]) return;
      trail[node.id] = true;
      var kids = children[node.id] || [];
      positions[node.id] = {
        x: ((start + end) / 2) / totalLeaves * 1000,
        depth: useExplicitLayers && Number(node.layer) >= 1 ? Number(node.layer) - 1 : depth
      };
      var cursor = start;
      for (var ci = 0; ci < kids.length; ci++) {
        var span = leafCount(kids[ci]);
        place(kids[ci], depth + 1, cursor, cursor + span, trail);
        cursor += span;
      }
      delete trail[node.id];
    }

    var rootRanges = [], leafCursor = 0, maxDepth = 0;
    for (i = 0; i < roots.length; i++) {
      var span = leafCount(roots[i]);
      rootRanges.push({ node: roots[i], start: leafCursor, end: leafCursor + span });
      place(roots[i], 0, leafCursor, leafCursor + span);
      leafCursor += span;
    }
    for (i = 0; i < nodes.length; i++)
      if (positions[nodes[i].id]) maxDepth = Math.max(maxDepth, positions[nodes[i].id].depth);

    var compactViewport = root.matchMedia && root.matchMedia('(max-width: 620px)').matches;
    var rowHeight = compactViewport ? 130 : 142, topPad = 30, mapHeight = topPad + (maxDepth + 1) * rowHeight + 14;
    var svg = '<svg class="talent-graph" viewBox="0 0 1000 ' + mapHeight + '" preserveAspectRatio="none" aria-hidden="true">';
    if (rootRanges.length) {
      var rootXs = [];
      for (i = 0; i < rootRanges.length; i++) rootXs.push(positions[rootRanges[i].node.id].x);
      var minX = Math.min.apply(Math, rootXs), maxX = Math.max.apply(Math, rootXs);
      svg += '<path class="talent-connection talent-root-spine" d="M500 2 V16 H' + minX + (maxX !== minX ? ' H' + maxX : '') + '" />';
      for (i = 0; i < rootRanges.length; i++) {
        var rootNode = rootRanges[i].node, rootPos = positions[rootNode.id];
        svg += '<path class="talent-connection talent-root-link ' + escapeHtml(rootNode.state) + '" d="M' + rootPos.x + ' 16 V' + (topPad + rootPos.depth * rowHeight + 1) + '" />';
      }
    }
    for (i = 0; i < nodes.length; i++) {
      var child = nodes[i], childPos = positions[child.id], childParents = parentIds(child);
      if (!childPos) continue;
      for (var pi = 0; pi < childParents.length; pi++) {
        var parentId = childParents[pi], parentPos = positions[parentId];
        if (!parentPos) continue;
        var x1 = parentPos.x, x2 = childPos.x;
        var y1 = topPad + parentPos.depth * rowHeight + 56;
        var y2 = topPad + childPos.depth * rowHeight + 3;
        var midY = y1 + Math.max(8, (y2 - y1) / 2);
        var parent = byId[parentId];
        svg += '<path class="talent-connection talent-prereq-link' + (parent && Number(parent.rank) > 0 ? ' is-lit' : '') +
          (child.state === 'is-locked' ? ' is-locked' : '') + '" d="M' + x1 + ' ' + y1 + ' V' + midY + ' H' + x2 + ' V' + y2 + '" />';
      }
    }
    svg += '</svg>';

    var emblemHtml = tree.iconSrc
      ? '<img src="' + escapeHtml(tree.iconSrc) + '" alt="" aria-hidden="true" decoding="async">'
      : escapeHtml(tree.icon || '✦');
    var totalRanks = 0, active = 0, html = '<section' + (tree.anchorId ? ' id="' + escapeHtml(tree.anchorId) + '"' : '') +
      ' class="talent-tree ' + escapeHtml(tree.className || '') + '" style="--talent-accent:' +
      escapeHtml(tree.accent || '#d7bd7a') + '"><header class="talent-tree-header"><span class="talent-tree-emblem' + (tree.iconSrc ? ' has-image' : '') + '">' +
      emblemHtml + '</span><div class="talent-tree-heading"><b>' + escapeHtml(tree.title) + '</b><small>' +
      escapeHtml(tree.subtitle || '') + '</small></div><span class="talent-tree-count">';
    for (i = 0; i < nodes.length; i++) {
      totalRanks += Number(nodes[i].rank) || 0;
      if ((Number(nodes[i].rank) || 0) > 0) active++;
    }
    html += active + ' / ' + nodes.length + ' 已点亮 · ' + totalRanks + ' 阶</span></header>' +
      '<div class="talent-map-scroll"' + (tree.scrollKey ? ' data-talent-scroll="' + escapeHtml(tree.scrollKey) + '"' : '') + '><div class="talent-map" style="--talent-leaves:' + totalLeaves + ';height:' + mapHeight + 'px">' + svg;
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i], pos = positions[n.id] || { x: 500, depth: 0 };
      var left = pos.x / 10, top = topPad + pos.depth * rowHeight;
      html += '<article class="talent-slot ' + escapeHtml(n.state || 'is-growing') + '" style="left:' + left + '%;top:' + top + 'px;width:' +
        (100 / totalLeaves).toFixed(4) + '%" data-talent-node="' + escapeHtml(n.id) + '">' +
        '<button type="button" class="talent-node-button" ' + (n.attr || '') + (n.disabled ? ' disabled' : '') +
        ' title="' + escapeHtml(n.title || n.desc || '') + '" aria-label="' + escapeHtml(n.name + '，' + (n.status || '') + '，' + (n.cost || '')) + '">' +
        (n.iconSrc
          ? '<img class="talent-node-icon" src="' + escapeHtml(n.iconSrc) + '" alt="" aria-hidden="true" decoding="async">'
          : '<span class="talent-node-glyph" aria-hidden="true">' + escapeHtml(n.glyph || '✦') + '</span>') +
        '<span class="talent-node-rank">' + escapeHtml(n.rankText || '') + '</span></button>' +
        '<b class="talent-node-name" title="' + escapeHtml(n.name) + '">' + escapeHtml(n.name) + '</b>' +
        '<small class="talent-node-desc" title="' + escapeHtml(n.desc) + '">' + escapeHtml(n.desc) + '</small>' +
        (n.nestName ? '<small class="talent-node-prereq">前置：' + escapeHtml(n.nestName) + '</small>' : '') +
        '<span class="talent-node-state">' + escapeHtml(n.status || '') + '</span>' +
        '<span class="talent-node-cost">' + escapeHtml(n.cost || '') + '</span>' +
        (n.extraHtml || '') + '</article>';
    }
    html += '</div></div></section>';
    return html;
  }

  SB.ui.talentTreeMarkup = treeMarkup;
})(typeof window !== 'undefined' ? window : globalThis);
