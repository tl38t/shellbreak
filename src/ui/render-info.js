/* 天壳 / SHELLBREAK — 可点击详情卡渲染。
 * 数据与门槛由各玩法模块提供；本文件只生成详情 UI，不修改游戏状态。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  function res() { return SB.game.run(); }
  function el(id) { return root.document.getElementById(id); }
  function bodyModalClass(on) {
    var b = root.document && root.document.body;
    if (b && b.classList) { if (on) b.classList.add('modal-open'); else b.classList.remove('modal-open'); }
  }

  /* 在效果文案中把已解锁内容转成内联入口。逐段匹配并优先长名称，
   * 避免「大灯塔」被较短的「灯塔」再次切坏。 */
  function linkInfoNames(text) {
    text = String(text || '');
    var names = [], i, list = SB.BUILDINGS || [], wonders = SB.wonder ? SB.wonder.list() : [], policies = SB.POLICIES || [];
    for (i = 0; i < list.length; i++) names.push({ name: list[i].name, id: list[i].id, type: 'build' });
    for (i = 0; i < wonders.length; i++) names.push({ name: wonders[i].name, id: wonders[i].id, type: 'wonder' });
    for (i = 0; i < policies.length; i++) names.push({ name: policies[i].name, id: policies[i].id, type: 'policy' });
    names.sort(function (a, b) { return b.name.length - a.name.length; });
    var out = '', cursor = 0;
    while (cursor < text.length) {
      var bestAt = -1, best = null, at;
      for (i = 0; i < names.length; i++) {
        at = text.indexOf(names[i].name, cursor);
        if (at >= 0 && (bestAt < 0 || at < bestAt)) { bestAt = at; best = names[i]; }
        else if (at === bestAt && best && names[i].name.length > best.name.length) best = names[i];
      }
      if (!best) break;
      out += text.slice(cursor, bestAt);
      out += '<span role="button" tabindex="0" class="inline-info-link" ' +
        (best.type === 'build' ? 'data-build-info' : best.type === 'wonder' ? 'data-wonder-info' : 'data-policy-info') +
        '="' + best.id + '" aria-haspopup="dialog">' + best.name + '</span>';
      cursor = bestAt + best.name.length;
    }
    return out + text.slice(cursor);
  }

  /* 科技 / 市政节点详情：树图节点只负责展示路径与状态，效果、条件和研究操作
   * 收进这张卡片。判据继续复用各自玩法模块，避免 UI 另算一次门槛。 */
  function showTreeDetail(type, id) {
    var s = res(), tech = type === 'tech', item = null, i;
    if (!s) return;
    if (tech) {
      item = SB.tech && SB.tech.byId ? SB.tech.byId(id) : null;
    } else {
      for (i = 0; SB.CIVICS && i < SB.CIVICS.length; i++) {
        if (SB.CIVICS[i].id === id) { item = SB.CIVICS[i]; break; }
      }
    }
    if (!item) return;

    var done = tech ? !!s.techs[id] : !!s.civics[id];
    var revealed = tech ? SB.tech.metOf(s, item) : SB.civic.isRevealed(s, id);
    var blocked = done ? null : tech ? SB.tech.studyBlocked(s, id) : SB.civic.blocked(s, item);
    var short = SB.tech.condShort(s, tech ? item.cond : item.boost);
    var title = revealed ? item.name : '未揭露的' + (tech ? '科技' : '市政');
    var detailReqsMet = true;
    if (tech && item.reqs) {
      for (i = 0; i < item.reqs.length; i++) {
        if (!s.techs[item.reqs[i]]) { detailReqsMet = false; break; }
      }
    }
    var blockKind = '';
    if (tech && !done && blocked) {
      if (!revealed) blockKind = 'unrevealed';
      else if (item.era > (s.era || 1)) blockKind = 'era';
      else if (!SB.tech.metOf(s, item)) blockKind = 'eureka';
      else if (!detailReqsMet) blockKind = 'prereq';
      else if (!SB.economy.enough(s.res.science, item.cost || 0)) blockKind = 'science';
    }
    var state = done ? (tech ? '已掌握' : '已完成') : !revealed ? '未揭露' :
      !blocked ? '可研究' : blockKind === 'science' ? '科技点不足' :
      blockKind === 'prereq' ? '缺少前置' : blockKind === 'era' ? '纪元未到' :
      blockKind === 'eureka' ? '尤里卡未达成' : '暂不可研究';
    var currency = tech ? 'science' : 'culture';
    var currencyName = tech ? '科技点' : '市政点';
    var reqs = item.reqs || [], reqHtml = '', reqDone, parent, parentDone, parentName;
    for (i = 0; i < reqs.length; i++) {
      parent = tech ? SB.tech.byId(reqs[i]) : null;
      if (!tech) {
        for (var ci = 0; SB.CIVICS && ci < SB.CIVICS.length; ci++) {
          if (SB.CIVICS[ci].id === reqs[i]) { parent = SB.CIVICS[ci]; break; }
        }
      }
      parentDone = tech ? !!s.techs[reqs[i]] : !!s.civics[reqs[i]];
      parentName = parent ? parent.name : reqs[i];
      reqHtml += '<span class="tree-req' + (parentDone ? ' met' : '') + '">' +
        (parentDone ? '✓ ' : '· ') + parentName + '</span>';
    }
    if (!reqHtml) reqHtml = '<span class="tree-req met">无 · 起始节点</span>';

    /* 科技详情必须展示数据里的真实尤里卡条件（item.cond）。
     * item.note 只是 Civ6 对标/氛围备注，不能在揭示后拿来替换条件；否则同一项科技
     * 会从「实际门槛」变成一段看似合理但游戏根本不判定的自编文案。 */
    var condition = tech
      ? (item.cond ? (SB.tech.condText(item.cond) || '尤里卡条件') : '无需尤里卡')
      : SB.civic.boostText(s, item);
    var conditionProgress = tech && !revealed && short ? short.txt : '';
    var progress = short && short.need > 0 && !done
      ? Math.max(0, Math.min(100, short.now / short.need * 100)) : 0;
    var showProgress = !revealed && short && short.need > 0;
    var effect = tech ? SB.tech.effectText(item) : item.desc;
    if (tech && effect.indexOf('（无直接效果）') === 0 && item.note) effect = item.note.split('\n')[0];
    var cost = item.cost || 0;
    var blockDetail = '';
    if (tech && !done && blocked) {
      if (blockKind === 'unrevealed') {
        blockDetail = '<div class="tree-detail-blocked unrevealed"><b>未揭露</b><span>先达成尤里卡条件，才能看到这项科技的完整信息。</span></div>';
      } else if (blockKind === 'eureka') {
        blockDetail = '<div class="tree-detail-blocked eureka"><b>尤里卡未达成</b><span>完成上方条件后，才能投入科技点研究。</span></div>';
      } else if (blockKind === 'science') {
        blockDetail = '<div class="tree-detail-blocked science"><b>科技点不足</b><span>现有 ' + SB.economy.fmtAmt(s.res.science) + ' / 需求 ' + SB.economy.fmtAmt(cost) + '</span></div>';
      } else if (blockKind === 'prereq') {
        blockDetail = '<div class="tree-detail-blocked prereq"><b>缺少前置科技</b><span>' + blocked.replace(/^缺少前置科技：/, '') + '</span></div>';
      } else if (blockKind === 'era') {
        blockDetail = '<div class="tree-detail-blocked era"><b>纪元未到</b><span>' + blocked.replace(/^纪元未到：/, '') + '</span></div>';
      }
    }
    var buttonText = done ? state : blocked ? (blockKind === 'science' ? '科技点不足' : state) : cost
      ? '研究　' + SB.economy.costOwnedTxt(s, (function () { var c = {}; c[currency] = cost; return c; })())
      : '免费研究';
    var box = el('modalBox'), modal = el('modal');
    box.classList.add('tree-detail-box');
    var detailIcon = SB.ui.renderCommon.treeIconHTML(item, revealed, 'tree-detail-icon');
    box.innerHTML =
      '<div class="tree-detail-head"><div class="tree-detail-mark' + (detailIcon ? ' has-image' : '') + '">' + (detailIcon || (item.key ? '✦' : tech ? '⌘' : '§')) +
      '</div><div class="tree-detail-title"><h3 id="treeDetailTitle">' + title + (item.key && revealed ? ' <span class="tree-key">关键节点</span>' : '') +
      '</h3><span class="tree-detail-state ' + (done ? 'done' : blocked ? 'locked' : 'ready') + '">' + state + '</span></div>' +
      '<button class="tree-detail-close" type="button" data-modal-close="1" aria-label="关闭详情">×</button></div>' +
      '<div class="tree-cost"><span>研究成本</span><b>' + (cost ? cost + ' ' + currencyName : '免费') + '</b></div>' + blockDetail +
      '<section class="tree-detail-section"><h4>' + (tech ? '尤里卡' : '鼓舞') + '</h4><p>' +
      linkInfoNames(condition) + '</p>' +
      (conditionProgress ? '<small class="tree-eureka-progress">当前进度：' + conditionProgress + '</small>' : '') +
      (showProgress ? '<div class="tree-progress"><i style="width:' + progress.toFixed(1) + '%"></i></div>' : '') +
      (showProgress ? '<small>进度 ' + progress.toFixed(0) + '%</small>' : '') + '</section>' +
      '<section class="tree-detail-section"><h4>效果</h4><p>' +
      (revealed ? linkInfoNames(effect) : '达成揭示条件后显示。') + '</p></section>' +
      '<section class="tree-detail-section"><h4>前置节点</h4><div class="tree-reqs">' + reqHtml + '</div></section>' +
      (tech && revealed && TECH_FLAVOR[id] ? '<p class="b-flavor">' + TECH_FLAVOR[id] + '</p>' : '') +
      '<div class="tree-detail-actions"><button class="btn buy" type="button" data-tree-study="' + (tech ? 'tech' : 'civic') + '" data-' + (tech ? 'tech' : 'civic') + '="' + id + '"' +
      (done || blocked ? ' disabled' : '') + (blocked ? ' title="' + blocked + '"' : '') + '>' + buttonText + '</button>' +
      '<button class="btn tree-back" type="button" data-modal-close="1">返回树图</button></div>';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'treeDetailTitle');
    modal.classList.add('tree-modal');
    modal.classList.remove('tree-tech');
    modal.classList.remove('tree-civic');
    modal.classList.add(tech ? 'tree-tech' : 'tree-civic');
    modal.classList.remove('hidden');
    bodyModalClass(true);
  }

  function openInfoCard(title, mark, state, body, actions) {
    var box = el('modalBox'), modal = el('modal');
    box.classList.add('tree-detail-box');
    box.innerHTML = '<div class="tree-detail-head"><div class="tree-detail-mark">' + mark +
      '</div><div class="tree-detail-title"><h3 id="treeDetailTitle">' + title + '</h3>' +
      '<span class="tree-detail-state ' + state.cls + '">' + state.text + '</span></div>' +
      '<button class="tree-detail-close" type="button" data-modal-close="1" aria-label="关闭详情">×</button></div>' +
      body + '<div class="tree-detail-actions">' + (actions || '') +
      '<button class="btn tree-back" type="button" data-modal-close="1">关闭</button></div>';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'treeDetailTitle');
    modal.classList.add('tree-modal');
    modal.classList.remove('hidden');
    bodyModalClass(true);
  }

  /* 建筑信息卡「效果」段：把每座建筑的「每级基础量 × 当前等级 = 当前总量」写清楚，
   * 与住房那一支（人口上限 +X/级（当前 +Y））同构。所有带每级效果的产出 / 容量 / 减耗建筑都走这里；
   * 一次性效果（炉 / 城堡 / 观测站 / 博物馆 / 工坊产钢）无「每级」概念，回退到 desc。
   * ⚠️「当前」= 基础每级量 × 当前等级，不含科技 / 奇观 / 政策等外部乘区——
   *   与住房那条保持一致（housePerLevel×lv 也不含 perk 外的乘区），避免面板与结算两套口径。 */
  function buildingEffectText(s, b, lv) {
    var B = SB.BLD, U = SB.UNIT || {}, id = b.id, L = lv;
    function add(label, perVal, curVal, unit, dec) {
      var d = dec == null ? 0 : dec;
      return label + ' +' + perVal.toFixed(d) + '/级' + unit + '（当前 +' + curVal.toFixed(d) + '）';
    }
    function pct(label, perPct, curPct, dec, sign) {
      var d = dec == null ? 1 : dec; sign = sign || '+';
      return label + ' ' + sign + perPct.toFixed(d) + '%/级（当前 ' + sign + curPct.toFixed(d) + '%）';
    }
    switch (id) {
      case 'kelp':         return add('自动产藻食', B.food, B.food * L, '/秒', 2) + '；吃季节减产';
      case 'weir':         return pct('藻食产出', B.foodWeir * 100, B.foodWeir * 100 * L);
      case 'warmnest':     return pct('族口粮', B.foodSave * 100, B.foodSave * 100 * L, 1, '−');
      case 'kelpstore':    return add('藻食上限', B.kelpCap, B.kelpCap * L, '', 0);
      case 'ballast':      return add('其余资源上限', B.ballastCap, B.ballastCap * L, '', 0);
      case 'lighthouse':   return pct('全资源产出', B.lighthouseProd * 100, B.lighthouseProd * 100 * L, 0) +
                                 '；' + add('其余资源上限', B.lighthouseCap, B.lighthouseCap * L, '', 0);
      case 'workshop':     return pct('工艺制作效率', (b.craftRatio || 0) * 100, (b.craftRatio || 0) * 100 * L, 0);
      case 'siltpit':      return pct('矿工与采石工产出', B.siltBonus * 100, B.siltBonus * 100 * L, 0);
      case 'library':      return pct('科技产出（仅学者）', B.sciRatio * 100, B.sciRatio * 100 * L, 0);
      case 'institute':    return pct('科技产出（仅学者）', B.instituteSci * 100, B.instituteSci * 100 * L, 0) +
                                 '；升级为大学后变 ×100%/级';
      case 'square':       return pct('市政点产出（仅书手）', B.squareCivRatio * 100, B.squareCivRatio * 100 * L, 0) +
                                 '；装《戏剧与诗歌》后翻倍';
      case 'temple':       return pct('信仰产出', B.templeFaithRatio * 100, B.templeFaithRatio * 100 * L, 0) +
                                 '；宗教系统落地后生效';
      case 'hydroturbine': return add('热液能', U.hydroOut || 0, (U.hydroOut || 0) * L, '/秒', 0) +
                                 '；耗暖石 ' + ((U.hydroWarm || 0) * L) + '/秒';
      case 'coralfarm':    return pct('珊瑚匠产出', B.coralFarmCW * 100, B.coralFarmCW * 100 * L, 0);
      case 'bank':         return pct('商人产出', B.bankLux * 100, B.bankLux * 100 * L, 0);
      case 'school':       return add('每名商人科技产出', B.schoolMerchantSci, B.schoolMerchantSci * L, '/秒', 1);
      case 'theater':      return pct('官员（书手）市政点产出', B.theaterCivRatio * 100, B.theaterCivRatio * 100 * L, 0);
      case 'hotforge':     return pct('工艺制作效率', B.hotforgeCraft * 100, B.hotforgeCraft * 100 * L, 0);
      case 'canal':        return pct('居民奢侈品消耗', B.canalLuxSave * 100, B.canalLuxSave * 100 * L, 1, '−') +
                                 '；等级最高不超过灯塔等级';
      case 'caravanserai': return pct('居民奢侈品消耗', B.caravanseraiLuxSave * 100, B.caravanseraiLuxSave * 100 * L, 0, '−') +
                                 '；每季节额外获得「等级 × 1 分钟」产量的任意时产资源';
      case 'museum':       return '官员（书手）市政点产出 +20%（建成即生效，不随等级递增）';
      case 'hydroshop':    return '每级耗 ' + (U.hydroShopLvl || 0) + ' 热液能/秒，吃金属产钢（产钢量随热液能供给浮动）';
      case 'furnace':      return '解锁 金属 → 精铁（一次性效果，不随等级递增）';
      case 'observatory':  return '科技产出 +x%（x 与冰壳厚度成反比，最高 +' + (B.obsMaxBonus || 0) + '%，与建筑等级无关）';
      case 'hall':         return '随等级降低所有建筑下一级成本；升级为城堡后议价效果 +50%、并额外给所有有上限资源 +50 容量/级';
      default:             return b.desc || '';
    }
  }

  // 展示文案由 render-content.js 提供，集中维护且不进入存档。
  var BUILDING_FLAVOR = SB.ui.renderContent.BUILDING_FLAVOR;
  var TECH_FLAVOR = SB.ui.renderContent.TECH_FLAVOR;

  function showBuildingInfo(id) {
    var s = res(), b = SB.habitat && SB.habitat.buildingById ? SB.habitat.buildingById(id) : null;
    if (!s || !b) return;
    var name = b.name, desc = b.desc || '';
    for (var i = 0; SB.UPGRADES && i < SB.UPGRADES.length; i++) {
      var u = SB.UPGRADES[i];
      if (u.upgradesBuilding === b.id && s.upgrades && s.upgrades[u.id]) {
        name = u.name;
        desc = u.buildingDesc || u.desc || desc;
      }
    }
    var lv = (s.lvl && s.lvl[id]) || 0;
    var blocked = !SB.habitat.needMet(s, b), canalCap = id === 'canal' &&
      (s.lvl.canal || 0) >= (s.lvl.lighthouse || 0);
    var cost = SB.economy.costOf(s, id), state = blocked || canalCap
      ? { cls: 'locked', text: '前置条件未满足' }
      : { cls: lv ? 'done' : 'ready', text: lv ? '已建造 · 等级 ' + lv : '可建造' };
    var housePlan = (s.perk && s.perk.housePlan) || 0;
    var housePerLevel = id === 'nest' ? SB.BLD.house
      : id === 'coralhouse' ? SB.BLD.house2
        : id === 'tenement' ? SB.BLD.tenementPop : 0;
    var effectText;
    if (housePerLevel) {
      effectText = '人口上限 +' + housePerLevel + '/级（当前 +' + (housePerLevel * lv) + '）';
      if (housePlan) effectText += ' · 生息建筑规划额外 +' + housePlan + '/级（当前 +' + (housePlan * lv) + '）';
      if (id === 'nest') effectText += '。住满后不再生育。';
      if (id === 'tenement') effectText += '；每级额外 +' + ((SB.BLD.tenementLuxAdd || 0) * 100).toFixed(0) + '% 居民奢侈品消耗（当前 +' + ((SB.BLD.tenementLuxAdd || 0) * lv * 100).toFixed(0) + '%）。';
    } else {
      effectText = buildingEffectText(s, b, lv);
    }
    var requirement = b.need ? SB.habitat.buildingById(b.need) : null;
    var reqText = requirement
      ? '需先建成「' + requirement.name + '」' + ((s.lvl && s.lvl[b.need]) ? ' · 已满足' : ' · 未满足')
      : '无额外建筑前置';
    if (canalCap) reqText = '潮道等级不能超过灯塔等级；先升级灯塔。';
    var body = '<div class="tree-cost"><span>当前等级</span><b>' + lv + '</b></div>' +
      '<section class="tree-detail-section"><h4>效果</h4><p>' + linkInfoNames(effectText) + '</p></section>' +
      '<section class="tree-detail-section"><h4>下一次建造 / 升级</h4><p>' +
      SB.economy.costOwnedTxt(s, cost) + '</p></section>' +
      '<section class="tree-detail-section"><h4>建造条件</h4><p>' + reqText + '</p></section>' +
      (BUILDING_FLAVOR[b.id] ? '<p class="b-flavor">' + BUILDING_FLAVOR[b.id] + '</p>' : '');
    openInfoCard(name, '⌂', state, body, '');
  }

  var WONDER_ART = SB.ui.renderContent.WONDER_ART;
  var WONDER_FLAVOR = SB.ui.renderContent.WONDER_FLAVOR;
  function wonderArt(w) {
    var src = WONDER_ART[w.id];
    if (src) return '<div class="wonder-art has-image"><img src="' + src + '" alt="' + w.name + '"></div>';
    return '<div class="wonder-art placeholder"><span>✦</span><small>奇观视觉稿 · 待补</small></div>';
  }
  function showWonderInfo(id) {
    var s = res(), w = SB.wonder && SB.wonder.byId(id);
    if (!s || !w) return;
    var done = !!(s.wonders && s.wonders[id]);
    var why = done ? null : SB.workshop.wonderBlocked(s, id);
    var cost = SB.wonder.discountedCost(s, id);
    var state = done ? { cls: 'done', text: '已建成 · 永久效果' }
      : why ? { cls: 'locked', text: /^需要先/.test(why) ? '条件未满足' : '材料不足' }
        : { cls: 'ready', text: '可建造' };
    var reqs = [], i, t, c;
    if (w.need) {
      t = SB.tech.byId(w.need);
      reqs.push((s.techs && s.techs[w.need] ? '✓ ' : '· ') + (t ? t.name : w.need) + '（科技）');
    }
    if (w.needCivic) {
      c = null;
      for (i = 0; SB.CIVICS && i < SB.CIVICS.length; i++) if (SB.CIVICS[i].id === w.needCivic) c = SB.CIVICS[i];
      reqs.push((s.civics && s.civics[w.needCivic] ? '✓ ' : '· ') + (c ? c.name : w.needCivic) + '（市政）');
    }
    var reqHtml = reqs.length
      ? '<div class="tree-reqs">' + reqs.map(function (x) { return '<span class="tree-req' + (x.indexOf('✓') === 0 ? ' met' : '') + '">' + x + '</span>'; }).join('') + '</div>'
      : '<p>无额外解锁条件</p>';
    var flavor = WONDER_FLAVOR[id] || '这座奇观正在等待一段属于它自己的历史。';
    var body = wonderArt(w) +
      '<div class="tree-cost"><span>建造成本</span><b>' + SB.economy.costTxt(cost) + '</b></div>' +
      '<section class="tree-detail-section"><h4>效果</h4><p>' + linkInfoNames(w.desc) + '</p>' +
      (done ? SB.ui.renderCommon.happyBonusNote(s, 'wonder', w.id) : '') + '</section>' +
      '<section class="tree-detail-section"><h4>解锁条件</h4>' + reqHtml + '</section>' +
      (why && !/^需要先/.test(why) ? '<section class="tree-detail-section"><h4>资源情况</h4><p>' + why + '</p></section>' : '') +
      '<section class="tree-detail-section wonder-copy"><h4>奇观文案</h4><p>' + flavor + '</p></section>';
    var action = done ? '' : '<button class="btn buy" type="button" data-wonder="' + id + '"' +
      (why ? ' disabled title="' + why + '"' : '') + '>建成　' + SB.economy.costOwnedTxt(s, cost) + '</button>';
    openInfoCard(w.name, '✦', state, body, action);
  }

  function showPolicyInfo(id) {
    var s = res(), p = SB.civic && SB.civic.policyById(id);
    if (!s || !p) return;
    var owned = SB.civic.cardOwned(s, id), slotted = !!(s.cards && s.cards.indexOf(id) >= 0);
    var state = slotted ? { cls: 'done', text: '已装填 · 正在生效' }
      : owned ? { cls: 'ready', text: '已解锁 · 尚未装填' }
        : { cls: 'locked', text: p.retiredBy ? '已退役' : '尚未解锁' };
    var slot = p.type ? SB.civic.slotTypeName(p.type) : '万能槽';
    var body = '<section class="tree-detail-section"><h4>效果</h4><p>' + linkInfoNames(p.desc) + '</p></section>' +
      '<section class="tree-detail-section"><h4>适配槽位</h4><p>' + slot + '</p></section>' +
      '<section class="tree-detail-section"><h4>生效方式</h4><p>' +
      (p.retiredBy ? '此卡已退役，不能再装填。' : '研究解锁后，还需装填到适配槽位才会生效。') + '</p></section>';
    openInfoCard(p.name, '▤', state, body, '');
  }

  function showWorkshopInfo(type, id) {
    var s = res(), W = SB.workshop, item = null, list = [], i;
    if (!s || !W) return;
    if (type === 'tool') list = SB.TOOLS || [];
    else if (type === 'upgrade') list = W.upgrades();
    else if (type === 'craft') list = W.crafts();
    for (i = 0; i < list.length; i++) if (list[i].id === id) { item = list[i]; break; }
    if (!item) return;
    var owned = type === 'tool' ? !!(s.tools && s.tools[id])
      : type === 'upgrade' ? !!(s.upgrades && s.upgrades[id]) : false;
    var why = type === 'tool' ? (owned ? null : W.blocked(s, id))
      : type === 'upgrade' ? (owned ? null : W.upgradeBlocked(s, id)) : W.craftBlocked(s, id);
    var state = owned ? { cls: 'done', text: type === 'tool' ? '已拥有' : '已装上' }
      : why ? { cls: 'locked', text: /^需要先/.test(why) ? '条件未满足' : '材料不足' }
        : { cls: 'ready', text: type === 'craft' ? '可制作' : '可购买' };
    var cost = type === 'craft' ? item.in : item.cost;
    var desc = item.desc || '';
    if (type === 'craft') {
      var mul = W.craftMul(s);
      desc += ' 每次消耗 ' + SB.economy.costTxt(item.in) + '，产出 ' +
        SB.economy.fmtAmt(item.out * mul) + ' ' + (SB.RESS[item.res] ? SB.RESS[item.res].name : item.res) +
        '（含当前工艺效率 +' + ((mul - 1) * 100).toFixed(0) + '%）。';
    }
    var label = type === 'tool' ? '买下' : type === 'upgrade' ? '装上' : '制作 +1';
    var action = '';
    if (type === 'tool' && !owned) action = '<button class="btn buy" data-tool="' + id + '"' + (why ? ' disabled' : '') + '>' + label + '　' + SB.economy.costOwnedTxt(s, cost) + '</button>';
    if (type === 'upgrade' && !owned) action = '<button class="btn buy" data-upgrade="' + id + '"' + (why ? ' disabled' : '') + '>' + label + '　' + SB.economy.costOwnedTxt(s, cost) + '</button>';
    if (type === 'craft') action = '<button class="btn buy" data-craft="' + id + '" data-craft-amt="1"' + (why ? ' disabled' : '') + '>' + label + '</button>';
    var body = '<div class="tree-cost"><span>' + (type === 'craft' ? '每次投入' : '所需材料') + '</span><b>' + SB.economy.costTxt(cost) + '</b></div>' +
      '<section class="tree-detail-section"><h4>效果 / 产出</h4><p>' + linkInfoNames(desc) + '</p></section>' +
      (why ? '<section class="tree-detail-section"><h4>当前条件</h4><p>' + why + '</p></section>' : '');
    openInfoCard(item.name, type === 'craft' ? '⚒' : '⌘', state, body, action);
  }

  SB.ui = SB.ui || {};
  SB.ui.renderParts = SB.ui.renderParts || {};
  SB.ui.renderParts.info = {
    linkInfoNames: linkInfoNames,
    showTreeDetail: showTreeDetail,
    showBuildingInfo: showBuildingInfo,
    showWonderInfo: showWonderInfo,
    showPolicyInfo: showPolicyInfo,
    showWorkshopInfo: showWorkshopInfo
  };
})(typeof window !== 'undefined' ? window : globalThis);
