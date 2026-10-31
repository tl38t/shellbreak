/* 天壳 / SHELLBREAK — 可点击详情卡渲染。
 * 数据与门槛由各玩法模块提供；本文件只生成详情 UI，不修改游戏状态。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  function res() { return SB.game.run(); }
  function el(id) { return root.document.getElementById(id); }
  /* 弹窗外壳归一化（2026-10-29）：本文件的详情卡与树图共用 render.js 的 #modal/#modalBox。
   * 上一张面板的变体类（尤其 offline-summary-modal 的报表 flex 布局、break-modal 的 padding:0）
   * 残留会把详情卡一起压塌 —— 判据与清单只有一处，在 render.js 的 resetModalChrome。
   * 这里只做转发（不另写一份 remove 列表）；render 模块尚未加载时静默跳过。 */
  function primeModal() {
    var R = SB.ui && SB.ui.render;
    if (R && R.resetModalChrome) R.resetModalChrome();
  }
  function bodyModalClass(on) {
    var b = root.document && root.document.body;
    if (b && b.classList) { if (on) b.classList.add('modal-open'); else b.classList.remove('modal-open'); }
  }

  /* 在效果文案中把已解锁内容转成内联入口。逐段匹配并优先长名称，
   * 避免「大灯塔」被较短的「灯塔」再次切坏。 */
  function linkInfoNames(text, linkWorkshopTab) {
    text = String(text || '');
    var names = [], i, list = SB.BUILDINGS || [], wonders = SB.wonder ? SB.wonder.list() : [], policies = SB.POLICIES || [];
    if (linkWorkshopTab) names.push({ name: '工坊', id: 'workshop', type: 'workshopTab' });
    for (i = 0; i < list.length; i++) names.push({ name: list[i].name, id: list[i].id, type: 'build' });
    for (i = 0; i < wonders.length; i++) names.push({
      name: SB.wonder.displayName(res(), wonders[i].id), id: wonders[i].id, type: 'wonder'
    });
    for (i = 0; i < policies.length; i++) names.push({ name: policies[i].name, id: policies[i].id, type: 'policy' });
    names.sort(function (a, b) { return b.name.length - a.name.length; });
    var out = '', cursor = 0;
    while (cursor < text.length) {
      var bestAt = -1, best = null, at;
      for (i = 0; i < names.length; i++) {
        at = text.indexOf(names[i].name, cursor);
        if (at >= 0 && (bestAt < 0 || at < bestAt)) { bestAt = at; best = names[i]; }
        else if (at === bestAt && best && (names[i].name.length > best.name.length ||
          (names[i].name.length === best.name.length && names[i].type === 'workshopTab'))) best = names[i];
      }
      if (!best) break;
      out += text.slice(cursor, bestAt);
      out += '<span role="button" tabindex="0" class="inline-info-link" ' +
        (best.type === 'workshopTab' ? 'data-workshop-tab' : best.type === 'build' ? 'data-build-info' : best.type === 'wonder' ? 'data-wonder-info' : 'data-policy-info') +
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

    var techLevel = tech ? SB.tech.level(s, id) : 0;
    var techMaxLevel = tech ? SB.tech.maxLevel(item) : 1;
    var done = tech ? techLevel >= techMaxLevel : !!s.civics[id];
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
    /* cost 必须先于 blockKind 算（2026-10-17 用户拍板实装折扣断链）：
     * 科技侧走唯一折扣口 researchCost（科研所 researchLabSave，与 canStudy/study 同源）；
     * 市政侧无折扣，走原价。旧版判定/显示各裸读 item.cost ⇒ 卡面显示原价、实扣折后价。 */
    var cost = tech
      ? (SB.tech.researchCost ? SB.tech.researchCost(s, item) : (item.cost || 0))
      : (item.cost || 0);
    var blockKind = '';
    if (tech && !done && blocked) {
      if (!revealed) blockKind = 'unrevealed';
      else if (item.era > (s.era || 1)) blockKind = 'era';
      else if (!SB.tech.metOf(s, item)) blockKind = 'eureka';
      else if (!detailReqsMet) blockKind = 'prereq';
      else if (!SB.economy.enough(s.res.science, cost)) blockKind = 'science';
    } else if (!tech && !done && blocked && revealed) {
      if (item.era && item.era > (s.era || 1)) blockKind = 'era';
      else if (SB.civic.reqsMet(s, item) && !SB.economy.enough(s.res.culture, item.cost || 0)) blockKind = 'culture';
    }
    var state = done ? (tech ? '已掌握' : '已完成') : tech && techLevel > 0 ? '等级 ' + techLevel + '/' + techMaxLevel : !revealed ? '未揭露' :
      !blocked ? '可研究' : blockKind === 'science' ? '科技点不足' :
      blockKind === 'culture' ? '市政点不足' :
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
     * 玩家效果与解锁说明走独立字段，不用设计备注或第三方对标文案兜底。 */
    var condition = tech
      ? (item.cond ? (SB.tech.condText(item.cond) || '尤里卡条件') : '无需尤里卡')
      : SB.civic.boostText(s, item);
    var conditionProgress = tech && !revealed && short ? short.txt : '';
    var progress = short && short.need > 0 && !done
      ? Math.max(0, Math.min(100, short.now / short.need * 100)) : 0;
    var showProgress = !revealed && short && short.need > 0;
    /* 追踪尤里卡 / 鼓舞（2026-10-30）：入口之二。只在「未达成」时给 ——
     * 达成那一刻 track-dock 自己会把这条剔掉，按钮也就没意义了。
     * `data-track-kind="btn"` 是给 syncButtons 看的：树节点那颗是纯图标，只有这颗要换文案。 */
    var trackKind = tech ? 'tech' : 'civic';
    var canTrack = !done && !revealed &&
      (tech ? (item.cond && item.cond.t !== 'default') : (item.boost && item.boost.t !== 'default'));
    var trackOn = (canTrack && SB.ui.track && SB.ui.track.isTracked)
      ? SB.ui.track.isTracked(trackKind, id) : false;
    var effect = tech ? SB.tech.effectText(item) : item.desc;
    if (tech && effect === '（无直接效果）') effect = item.effectDesc || '无直接数值加成。';
    var unlockSection = tech && item.unlockDesc
      ? '<section class="tree-detail-section"><h4>解锁内容</h4><p>' +
        (revealed ? linkInfoNames(item.unlockDesc, true) : '达成揭示条件后显示。') + '</p></section>'
      : '';
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
    } else if (!tech && !done && (blockKind === 'culture' || blockKind === 'era')) {
      if (blockKind === 'era') {
        blockDetail = '<div class="tree-detail-blocked era"><b>纪元未到</b><span>' + blocked.replace(/^纪元未到：/, '') + '</span></div>';
      } else {
        blockDetail = '<div class="tree-detail-blocked culture"><b>市政点不足</b><span>现有 ' + SB.economy.fmtAmt(s.res.culture) + ' / 需求 ' + SB.economy.fmtAmt(cost) + '</span></div>';
      }
    }
    var buttonText = done ? state : blocked ? (blockKind === 'science' ? '科技点不足' : blockKind === 'culture' ? '市政点不足' : state) : cost
      ? '研究　' + SB.economy.costOwnedTxt(s, (function () { var c = {}; c[currency] = cost; return c; })())
      : '免费研究';
    var box = el('modalBox'), modal = el('modal');
    primeModal();
    box.classList.add('tree-detail-box');
    var detailIcon = SB.ui.renderCommon.treeIconHTML(item, revealed, 'tree-detail-icon');
    var civicFlavor = !tech && revealed ? SB.ui.renderContent.CIVIC_FLAVOR[id] : '';
    var voidCivics = { void_faith: 101, void_explore: 107, ascend_void: 113 };
    var voidCivic = Object.prototype.hasOwnProperty.call(voidCivics, id);
    if (voidCivic && civicFlavor && SB.ui.render && typeof SB.ui.render.voidCorrupt === 'function') {
      civicFlavor = SB.ui.render.voidCorrupt(civicFlavor, voidCivics[id], 1);
    }
    box.innerHTML =
      '<div class="tree-detail-head"><div class="tree-detail-mark' + (detailIcon ? ' has-image' : '') + '">' + (detailIcon || (item.key ? '✦' : tech ? '⌘' : '§')) +
      '</div><div class="tree-detail-title"><h3 id="treeDetailTitle">' + title + (item.key && revealed ? ' <span class="tree-key">关键节点</span>' : '') +
      '</h3><span class="tree-detail-state ' + (done ? 'done' : blocked ? 'locked' : 'ready') + '">' + state + '</span></div>' +
      '<button class="tree-detail-close" type="button" data-modal-close="1" aria-label="关闭详情">×</button></div>' +
      (tech && techMaxLevel > 1 ? '<div class="tree-cost"><span>当前等级</span><b>' + techLevel + ' / ' + techMaxLevel + '</b></div>' : '') +
      '<div class="tree-cost"><span>本次研究成本</span><b>' + (cost ? SB.economy.fmtAmt(cost) + ' ' + currencyName : '免费') + '</b></div>' + blockDetail +
      '<section class="tree-detail-section"><h4>' + (tech ? '尤里卡' : '鼓舞') + '</h4><p>' +
      linkInfoNames(condition) + '</p>' +
      (conditionProgress ? '<small class="tree-eureka-progress">当前进度：' + conditionProgress + '</small>' : '') +
      (showProgress ? '<div class="tree-progress"><i style="width:' + progress.toFixed(1) + '%"></i></div>' : '') +
      (showProgress ? '<small>进度 ' + progress.toFixed(0) + '%</small>' : '') +
      (canTrack ? '<button type="button" class="btn tree-track-btn' + (trackOn ? ' on' : '') +
        '" data-track-kind="btn" data-track-toggle="' + trackKind + ':' + id + '">' +
        (trackOn ? '取消追踪' : '追踪' + (tech ? '尤里卡' : '鼓舞')) + '</button>' : '') + '</section>' +
      '<section class="tree-detail-section"><h4>效果</h4><p>' +
      (revealed ? linkInfoNames(effect, !tech && /工坊配方/.test(effect)) : '达成揭示条件后显示。') + '</p></section>' +
      unlockSection +
      '<section class="tree-detail-section"><h4>前置节点</h4><div class="tree-reqs">' + reqHtml + '</div></section>' +
      (tech && revealed && TECH_FLAVOR[id] ? '<p class="b-flavor">' + TECH_FLAVOR[id] + '</p>' : '') +
      (civicFlavor ? '<p class="b-flavor' + (voidCivic ? ' void-flavor' : '') + '">' + civicFlavor + '</p>' : '') +
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
    modal.classList.remove('void-civic-modal');
    modal.classList.remove('void-ending-modal');
    if (voidCivic) modal.classList.add('void-civic-modal');
    modal.classList.remove('hidden');
    bodyModalClass(true);
  }

  function openInfoCard(title, mark, state, body, actions, markClass) {
    var box = el('modalBox'), modal = el('modal');
    primeModal();
    box.classList.add('tree-detail-box');
    box.innerHTML = '<div class="tree-detail-head"><div class="tree-detail-mark' + (markClass ? ' ' + markClass : '') + '">' + mark +
      '</div><div class="tree-detail-title"><h3 id="treeDetailTitle">' + title + '</h3>' +
      '<span class="tree-detail-state ' + state.cls + '">' + state.text + '</span></div>' +
      '<button class="tree-detail-close" type="button" data-modal-close="1" aria-label="关闭详情">×</button></div>' +
      body + '<div class="tree-detail-actions">' + (actions || '') +
      '<button class="btn tree-back" type="button" data-modal-close="1">关闭</button></div>';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'treeDetailTitle');
    modal.classList.add('tree-modal');
    modal.classList.remove('void-civic-modal');
    modal.classList.remove('void-ending-modal');
    modal.classList.remove('hidden');
    bodyModalClass(true);
  }

  /* 建筑「一行描述」的**单一出口**（卡面 default 兜底 / 巢穴页建筑行 / 星图建筑行）。
   * 2026-10-21（用户拍板）：描述里**不许出现「如果研究了 X 就是多少」的条件句**——
   *   凡「科技会改写数值」的建筑，一律读本局实际状态出数。目前只有核热厂属这一类：
   *   核聚变（s.techs.nuclear_fusion）改两处（产出 ×5 / 铀耗 ×2，判据与结算逐字同源）。
   * 其余建筑退回静态 `b.desc`（那些 desc 本来就是「每级基础量」，不含条件分支）。
   * ⚠️ 调用点必须传当前局内状态 `s`；传 null 会按「未研究」出数（= 基础值）。 */
  function buildingDescText(s, b) {
    if (!b) return '';
    /* ⚠️ 2026-10-27 这里曾有一段 warmnest 的动态出数（按等级算「当前 N 级 = −X%」），
     *   用户当天先要「说清楚」、看完又说「0.5% 之后的全部删掉」⇒ 已整体撤掉，
     *   现在 warmnest 直接回退到 config 里那句最短的 desc。
     *   要看当前实际减免，信息卡的「效果」段仍按统一格式给（buildingEffectText 的
     *   case 'warmnest' →「族民口粮消耗 −0.5%/级（当前 −2.5%）」），那里是**所有建筑通用**
     *   的「每级 / 当前」结构，不是这条建筑专属的冗长解释，所以保留。 */
    if (b.id === 'fissionplant') {
      var _nfz = !!(s && s.techs && s.techs.nuclear_fusion);
      var _h = (SB.BLD.fissionHydro || 0) * (_nfz ? 5 : 1) * (SB.economy.starNuclearHydroMul ? SB.economy.starNuclearHydroMul(s || { perk: {} }) : 1);
      var _u = (SB.BLD.fissionUranium || 0) * (_nfz ? 2 : 1);
      var _lx = (SB.BLD.fissionLuxAdd || 0) * 100;
      return '热液能 +' + _h + '/秒/级（不烧暖石）；耗铀 ' + _u.toFixed(2) +
        '/秒/级；居民奢侈品消耗 +' + _lx.toFixed(0) + '%/级（负面）。' +
        (_nfz ? '核聚变已研究，上列数已含其加成。' : '');
    }
    if (b.id === 'researchlab') {
      var _researchPct = (SB.BLD.researchLabSci || 0) * 100;
      return '学者科技产出 +' + _researchPct.toFixed(1) + '%/级；研究科技消耗 −' +
        (((SB.BLD.researchLabSave || 0) * 100).toFixed(0)) + '%/级。';
    }
    if (b.id === 'robotbay') {
      var _foldable = (s && s.perk && s.perk.starFoldableStructure) || 0;
      var _robotsPerBay = 4 + _foldable;
      var _robotBayHydro = (SB.UNIT.robotbayHydro || 0) + 2 * _foldable;
      return '维持 ' + _robotsPerBay + ' 机器人人口/级：仅担任非书手/学者岗位，产出 +20%。工坊升级「强人工智能」后产出 +50%，且按人口数量产出信仰。耗热液能 ' +
        _robotBayHydro + '/秒/级（含星之至宝加成）。';
    }
    return b.desc || '';
  }

  /* 建筑信息卡「效果」段：把每座建筑的「每级基础量 × 当前等级 = 当前总量」写清楚，
   * 与住房那一支（人口上限 +X/级（当前 +Y））同构。所有带每级效果的产出 / 容量 / 减耗建筑都走这里；
   * 一次性效果（炉 / 城堡 / 观测站 / 工坊产钢）无「每级」概念，回退到 desc。
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
    /* 大学（upg_university）在 BLD.instituteSci 之上再加一份 instituteSci ⇒ 面板这句
     * 必须**现读配置**。2026-10-30 之前这里写死「×100%」，而 BLD 从 0.50 降到 0.30 后
     * 合计只有 0.80 ⇒ 写死的数会立刻变成假话。凡「合计值 = 基础值 + 升级值」一律现算，
     * 不许留第二份真源。 */
    function uniSciTotal() {
      var t = (B.instituteSci || 0), i;
      for (i = 0; SB.UPGRADES && i < SB.UPGRADES.length; i++) {
        if (SB.UPGRADES[i].id === 'upg_university') t += (SB.UPGRADES[i].instituteSci || 0);
      }
      return t;
    }
    switch (id) {
      case 'kelp':         return add('自动产藻食', B.food, B.food * L, '/秒', 2) + '；吃季节减产';
      case 'weir':         return pct('藻食产出', B.foodWeir * 100, B.foodWeir * 100 * L);
      case 'warmnest':     return pct('族民口粮消耗', B.foodSave * 100, B.foodSave * 100 * L, 1, '−');
      case 'kelpstore':    return add('藻食上限', B.kelpCap, B.kelpCap * L, '', 0);
      case 'ballast':      return add('其余资源上限', B.ballastCap, B.ballastCap * L, '', 0);
      case 'lighthouse':   return pct('全资源产出', B.lighthouseProd * 100, B.lighthouseProd * 100 * L, 0) +
                                 '；' + add('其余资源上限', B.lighthouseCap, B.lighthouseCap * L, '', 0);
      case 'workshop':     return pct('工艺制作效率', (b.craftRatio || 0) * 100, (b.craftRatio || 0) * 100 * L, 0);
      case 'siltpit':      return pct('矿工与采石工产出', B.siltBonus * 100, B.siltBonus * 100 * L, 0);
      case 'library':      return pct('学者科技产出', B.sciRatio * 100, B.sciRatio * 100 * L, 0);
      case 'institute':    return pct('学者科技产出', B.instituteSci * 100, B.instituteSci * 100 * L, 0) +
                                 '；升级为大学后变 +' + (uniSciTotal() * 100).toFixed(0) + '%/级';
      case 'square':       return pct('市政点产出（仅' + SB.folk.jobName(s, 'scribe') + '）', B.squareCivRatio * 100, B.squareCivRatio * 100 * L, 0) +
                                 '；装《戏剧与诗歌》后翻倍';
      case 'temple':       return pct('信仰产出', B.templeFaithRatio * 100, B.templeFaithRatio * 100 * L, 0) +
                                 '；装《神学》后翻倍';
      case 'hydroturbine': return add('热液能', U.hydroOut || 0, (U.hydroOut || 0) * L, '/秒', 0);
      case 'coralfarm':    return pct('珊瑚匠产出', B.coralFarmCW * 100, B.coralFarmCW * 100 * L, 0);
      case 'bank':         return pct('商人产出', B.bankLux * 100, B.bankLux * 100 * L, 0);
      case 'school':       return add('每名鲛人科技产出', B.schoolMermanSci, B.schoolMermanSci * L, '/秒', 1) + '；' + add('每名鲛人市政产出', B.schoolMermanCivic, B.schoolMermanCivic * L, '/秒', 1);
      case 'theater':      return pct(SB.folk.jobName(s, 'scribe') + '市政点产出', B.theaterCivRatio * 100, B.theaterCivRatio * 100 * L, 0);
      case 'hotforge':     return pct('工艺制作效率', B.hotforgeCraft * 100, B.hotforgeCraft * 100 * L, 0);
      case 'canal':        return pct('居民奢侈品消耗', B.canalLuxSave * 100, B.canalLuxSave * 100 * L, 1, '−') +
                                 '；等级最高不超过灯塔等级';
      case 'caravanserai': return pct('居民奢侈品消耗', B.caravanseraiLuxSave * 100, B.caravanseraiLuxSave * 100 * L, 0, '−') +
                                 '；每季节额外获得「等级 × 1 分钟」产量的任意时产资源';
      case 'museum':       return pct(SB.folk.jobName(s, 'scribe') + '市政点产出',
                                 (B.museumCivRatio || 0.20) * 100, (B.museumCivRatio || 0.20) * 100 * L, 0);
      case 'civichall':    return pct('议事厅／城堡市政点产出', (B.civicHallRatio || 0.50) * 100,
                                 (B.civicHallRatio || 0.50) * 100 * L, 0);
      /* 2026-10-21（用户拍板）：核热厂卡面**按本局实际状态出数**——不再写「（核聚变后×2）」
       *   这种「如果你研究了会是多少」的条件句，该是多少就是多少。
       *   核聚变（s.techs.nuclear_fusion）在结算里只改两个量，这里逐字照抄那个判据：
       *     ① economy.js hydroAlloc：热液能产出 ×5（`_nf`）
       *     ② economy-tick.js 直扣：铀耗 ×2（`_nfu`）
       *   两态只有「已研究 / 未研究」，与结算同源 ⇒ 卡面数 = 结算数（面板撒谎家族纪律）。
       *   ⚠️ 别在这里另写一份「×5/×2」的乘区表：将来若结算改了字面量，这里必须同步改
       *      （与 rates 的 _fissionUraniumMul 同性质，属「同一乘区三处读数」）。 */
      case 'fissionplant': {
        var _nfz = !!(s && s.techs && s.techs.nuclear_fusion);
        var _fHyd = (B.fissionHydro || 0) * (_nfz ? 5 : 1);
        var _fUr = (B.fissionUranium || 0) * (_nfz ? 2 : 1);
        var _fLux = (B.fissionLuxAdd || 0) * 100;
        /* 手工拼串（不走 add()）：它的模板是「+X/级 + 单位」，对本条会拼成
         * 「热液能 +10/级/秒」；这里要的是「+10/秒/级」。
         * 奢侈品那句也没走 pct()：pct 自带「（当前 +Y%）」，再接「（负面）」会套两层括号。 */
        var _luxPer = Math.round(_fLux * 100) / 100, _luxCur = Math.round(_fLux * L * 100) / 100;
        return '热液能 +' + _fHyd + '/秒/级（当前 +' + (_fHyd * L) + '/秒，不烧暖石）' +
          '；耗铀 ' + _fUr.toFixed(2) + '/秒/级（当前 −' + (_fUr * L).toFixed(2) + '/秒）' +
          '；居民奢侈品消耗 +' + _luxPer + '%/级（当前 +' + _luxCur + '%，负面）' +
          (_nfz ? '。核聚变已研究，上列数已含其加成。' : '');
      }
      case 'hydroshop':    return '吃金属产钢（产钢量随热液能供给浮动）';
      case 'furnace':      return '解锁 金属 → 精铁（一次性效果，不随等级递增）';
      case 'observatory': {
        var _ob = (L > 0 ? '当前' : '建成后可得') + '学者科技产出 +' +
          (SB.economy.observatoryBonusPct ? SB.economy.observatoryBonusPct(s).toFixed(1) : '0.0') +
          '%（本局壳体每削薄 5% 增加 1 个百分点，最高 +' + (B.obsMaxBonus || 0) + '%；观测站等级不叠加）';
        /* 星空观测站升级（upg_starscope）额外加成：+40% 科技产出（obsSciBoost）+ 每 tick +1 星空探索
         * （starExplore，破壳后被动累积）。数值直接走 economy.upgSum 读 UPGRADES 表，与结算同口径，
         * 不硬编码，避免数值改了文案不跟。纯展示、不进存档、不被 e2e 读值。 */
        if (s.upgrades && s.upgrades.upg_starscope) {
          var _boost = SB.economy.upgSum(s, 'obsSciBoost') * 100;
          var _star = SB.economy.upgSum(s, 'starExplore');
          _ob += '；星空观测站升级额外 +' + _boost.toFixed(0) + '% 科技产出' +
            (_star > 0 ? '，每 tick +' + _star.toFixed(0) + ' 星空探索（破壳后累积）' : '');
        }
        return _ob;
      }
      /* 2026-10-29（用户拍板「改成真边际效益」）：议价曲线换成**等比递减**
       *   （每级增量 = rate × ρ^(n−1)），从第 1 级起每级都在少省，且**永远差一点**到渐近上限。
       *   ⚠️ 2026-10-29 之前那句「约 N 级到顶」必须彻底删掉：旧曲线（getLimitedDR）确实有
       *     25 级/17 级硬到顶，但它的末段是凸的（18~24 级每级增量会回升到 3.16%），写
       *     「越升越少」会与玩家观察打架。现在两个问题一起解决：全程递减 + 没有假到顶。
       *   ⚠️ 文案里的每个数都走 SB.economy.hallInfo（与 costOf 同一段公式）——绝不在这里
       *     复刻 rate/limit/ρ，否则「面板说还能省、结算其实不是」就是下一个撒谎点。
       *   ⚠️ 2026-10-29 用户二次拍板：**面板上不许出现设计语汇**。
       *     「渐近上限 60%」「约每 N 级增量减半」「只能逼近不能到达」这类是设计文档的话，
       *     玩家读不懂也不需要——他要的是「我现在省多少、再升一级还能多省多少」。
       *     所以这里只留两个玩家能直接验算的数：当前 −X%、下一级 +Y%。
       *     「越升越少」由这两个数的序列本身体现，不再补任何参数说明。
       *     rate / limit / ρ / halfLvl 一律不进文案（只活在 hallInfo 的返回值里）。 */
      case 'hall': {
        var _hi = (SB.economy.hallInfo ? SB.economy.hallInfo(s) : null);
        if (!_hi) return '随等级降低所有建筑下一级造价，但越升省得越少；升级为城堡后减得更多，并额外给纪元三及之前有上限资源 +50 容量/级';
        var _txt;
        if (_hi.lvl <= 0) {
          _txt = '建成后每级降低所有建筑下一级造价，第 1 级省 ' + (_hi.nextGain * 100).toFixed(1) +
            '%，之后越升省得越少';
        } else if (_hi.nextGain > 0.0002) {
          _txt = '所有建筑下一级造价 −' + (_hi.discount * 100).toFixed(1) + '%；再升 1 级多省 ' +
            (_hi.nextGain * 100).toFixed(2) + '%';
        } else {
          _txt = '所有建筑下一级造价 −' + (_hi.discount * 100).toFixed(1) + '%，再升级几乎不再降低造价';
        }
        return _txt + '；另给纪元三及之前有上限资源 +50 容量/级';
      }
      default:             return buildingDescText(s, b);
    }
  }

  /* 建筑信息卡「运行消耗」段：把每座**持续消耗资源**的建筑吃掉的东西逐项写明，
   * 与 earlier「直接在消耗暖石的地方写明消耗多少」（2026-10-16，仅 furnace/turbine 行内标暖石）
   * 一脉相承，但把口径扩到**所有有消耗的建筑**、且**不只写暖石**——
   * 例如热泉炉除暖石外还吃金属、热液工坊吃热液能+金属，这些此前在卡面上都没写。
   * 【口径纪律】这里只列「资源名 + 可用速率」，不再重复写「产出」；产出归 buildingEffectText。
   *   ① 三个数一律走 economy.consumeRates（金属/暖石/热液能一次给齐，与结算同式的额定每秒）
   *      —— 巢穴页「开几座」控件行读同一函数，卡面与面板不会再各说一套（面板撒谎家族）。
   *      停产（运转座数=0）时它自然归 0，文案自动转「停产时为 0」避免写死一个过时数。
   *   ② 金属不再是「每份扣 1」这种模糊话：consumeRates 已把它折成每秒（含 bldEff 效率折扣），
   *      与 tick 实扣同式，所以卡面给的数就是玩家真的会看到的扣减速率。
   *   ③ 不进存档、不被 e2e 读值，纯展示——改它 = 改文案，不需要标定。 */
  /* 每种建筑**真吃哪几样**（顺序=效果描述的语序）。不在表里 = 不吃料、不出现「运行消耗」段。
   * ⚠️ 别用「有值就列」来推：汽轮机完全不吃金属，而它的 metal 恰好是 0，靠值判断会漏；
   *   反过来热泉炉停产时金属也是 0，靠值判断会把整段吞掉。**吃什么是静态事实，写死在表里**。 */
  var BUILDING_CONSUME = {
    furnace: ['metal', 'warm'],        // 金属 + 暖石 → 精铁
    hydroturbine: ['warm'],            // 暖石 → 热液能
    hydroshop: ['hydro', 'metal'],     // 热液能 + 金属 → 钢
    spacestation: ['hydro'],           // 热液能 → 星空探索（每级 2/s）
    satellite: ['hydro'],             // 热液能 → 星空探索（每级 1/s）
    biomatlab: ['kelp', 'iron', 'titanium', 'uranium', 'hydro'] // θ产线原料 + 热液能
  };
  var CONSUME_LABEL = {
    metal: '金属', warm: '暖石', hydro: '热液能',
    kelp: '藻食', iron: '精铁', titanium: '钛', uranium: '铀'
  };
  /* 停产/未建成时的口径说明：不给数字 0，否则玩家会读成「这东西不要料」。 */
  var CONSUME_IDLE = {
    metal: '金属（按转制份数扣，停产时为 0）',
    warm: '暖石（按运转座数扣，停产时为 0）',
    hydro: '热液能（按等级需求，停产时为 0）',
    kelp: '藻食（按等级需求，缺料时按比例降产）',
    iron: '精铁（按等级需求，缺料时按比例降产）',
    titanium: '钛（按等级需求，缺料时按比例降产）',
    uranium: '铀（按等级需求，缺料时按比例降产）'
  };
  /* 2026-10-17：把「这座建筑吃哪几样」静态表与 IDLE 文案挂到 SB.ui.consumeMeta，
   * 供巢穴页控件行、信息卡与星图建筑管理（SB.ui.drawTag，原 render-pane-village.js 局部函数，
   * 2026-10-21 提升为共享）共用同一份事实——避免多处各写一份、改一处漏一处（单一数据源）。 */
  SB.ui.consumeMeta = { BUILDING_CONSUME: BUILDING_CONSUME, CONSUME_LABEL: CONSUME_LABEL, CONSUME_IDLE: CONSUME_IDLE };

  /* 2026-10-21：把「建筑运行消耗标注」抽成共享函数 SB.ui.drawTag（原 render-pane-village.js
   * 局部函数），巢穴页控件行、信息卡、星图建筑管理三处共用同一份口径/格式/tooltip——
   * 与 consumeMeta 同源，彻底消灭「面板撒谎 / 各写一份」。星图原本硬编码
   * 「热液能 −1/秒·座」这种脱离真实建筑定义的字面量，现已并入单源。 */
  function drawTag(sp, id) {
    var meta = SB.ui && SB.ui.consumeMeta;
    var cr = (SB.economy && SB.economy.consumeRates) ? SB.economy.consumeRates(sp, id) : null;
    if (!cr || !meta) return '';
    var eats = meta.BUILDING_CONSUME[id];
    if (!eats || !eats.length) return '';
    var ps = [];
    for (var k = 0; k < eats.length; k++) {
      var key = eats[k];
      ps.push(cr[key] > 0
        ? meta.CONSUME_LABEL[key] + ' −' + cr[key].toFixed(2) + '/秒'
        : meta.CONSUME_IDLE[key]);
    }
    /* 缺料状态（2026-10-28，用户：「热泉炉那种需要原料制造的建筑，缺料要显示」）。
     * 【为什么必须放在最前面】上面那几个数永远是**额定**值（「这几座开满要烧多少」），
     *   缺料时它们一个都不变 ⇒ 玩家读到的是「炉子在烧」，实际一点铁都没产。
     *   把「缺暖石 · 停产」摆在数字左侧，是先给结论再给账。
     *   判据一律来自 economy.runStatus（单一判据：比例与「缺哪一样」都在引擎侧算好了），
     *   ⚠️ 这里**不许**再自己比较库存 —— 否则就是「面板撒谎」的第二个式子。 */
    var lackTxt = '', lackTip = '';
    var st = (SB.economy && SB.economy.runStatus) ? SB.economy.runStatus(sp, id) : null;
    if (st) {
      var lackName = meta.CONSUME_LABEL[st.lack] || st.lack;
      if (st.ratio <= 0.001) {
        lackTxt = '<b class="lack-tag is-stop">缺' + lackName + ' · 停产</b>';
        lackTip = '当前状态：缺' + lackName + '，这几座已停止运转（产出为 0）。';
      } else {
        lackTxt = '<b class="lack-tag is-short">缺' + lackName + ' · 开工 ' +
          Math.round(st.ratio * 100) + '%</b>';
        lackTip = '当前状态：缺' + lackName + '，只能按 ' + Math.round(st.ratio * 100) +
          '% 的负荷运转（产出同比例下降）。';
      }
    }
    return '<span class="fdraw" title="' + lackTip +
      '满负荷运转时：这几座每秒消耗 ' +
      ps.map(function (x) { return x.replace(' −', ' ').replace('/秒', ''); }).join('、') +
      '（与结算同式，缺料时会按比例降产）">' + lackTxt + (lackTxt ? ' ' : '') + ps.join(' · ') + '</span>';
  }
  SB.ui.drawTag = drawTag;
  /* 2026-10-21：建筑行描述也提成共享出口（巢穴页 / 星图 / 卡面 default 三处同源），
   * 免得「条件句描述」在某一处被修好、另一处还写着「核聚变后×2」。 */
  SB.ui.buildingDescText = buildingDescText;

  function buildingConsumeText(s, b, lv) {
    /* ⚠️ 2026-10-17 改口径：三个数一律走 economy.consumeRates（与结算同式的**额定每秒**），
     *   不再在这里各写「每份扣 1 / 随等级」这类模糊话。理由：巢穴页「开几座」控件行
     *   也读同一个函数 ⇒ 卡面与面板不会再各说一套（面板撒谎家族）。 */
    var order = BUILDING_CONSUME[b.id];
    if (!order) return null;
    var cr = (SB.economy && SB.economy.consumeRates) ? SB.economy.consumeRates(s, b.id) : null;
    if (!cr) return null;
    var parts = [];
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      parts.push(cr[k] > 0 ? CONSUME_LABEL[k] + ' −' + cr[k].toFixed(2) + '/秒' : CONSUME_IDLE[k]);
    }
    /* 缺料实况（2026-10-28）：卡面此前只写「缺料按比例降产」这种**条件句**，玩家点开卡
     *   仍然不知道现在到底停没停。这里把 runStatus 的**当前**结论直接续在后面，
     *   与行内角标同源（同一个函数、同一个比例），不会出现「行内说停产、卡面说正常」。
     *   ⚠️ 正常时一个字都不加 —— 条件句已经解释过规则了，不缺料就别占版面。 */
    var st = (SB.economy && SB.economy.runStatus) ? SB.economy.runStatus(s, b.id) : null;
    var stateTxt = '';
    if (st) {
      var lackName = CONSUME_LABEL[st.lack] || st.lack;
      stateTxt = st.ratio <= 0.001
        ? '。当前状态：缺' + lackName + '，已停产（产出为 0）'
        : '。当前状态：缺' + lackName + '，只能按 ' + Math.round(st.ratio * 100) + '% 负荷运转';
    }
    return parts.join('；') + '（满负荷运转：按当前开着的座数折算，缺料按比例降产）' + stateTxt;
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
    var moduleHousing = (s.perk && s.perk.starModuleHousing) || 0;
    var housePerLevel = id === 'nest' ? SB.BLD.house
      : id === 'coralhouse' ? SB.BLD.house2
        : id === 'tenement' ? SB.BLD.tenementPop : 0;
    var effectText;
    if (housePerLevel) {
      effectText = '人口上限 +' + housePerLevel + '/级（当前 +' + (housePerLevel * lv) + '）';
      if (housePlan) effectText += ' · 生息建筑规划额外 +' + housePlan + '/级（当前 +' + (housePlan * lv) + '）';
      if (id === 'tenement' && moduleHousing) effectText += ' · 模块住房额外 +' + moduleHousing + '/级（当前 +' + (moduleHousing * lv) + '）';
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
    var consumeText = buildingConsumeText(s, b, lv);
    var consumeSection = consumeText
      ? '<section class="tree-detail-section"><h4>运行消耗</h4><p>' + linkInfoNames(consumeText) + '</p></section>'
      : '';
    var maxed = b.maxLvl && lv >= b.maxLvl;
    /* 轻车熟路首建免费（2026-10-28）：costOwnedTxt 对 0 值全部跳过 ⇒ 免费态这一节会是空白，
     *   玩家看不出是「不要钱」还是「渲染坏了」。这里换成一句能解释因果的话。
     *   ⚠️ 判据与 costOf / build 同一个函数（SB.habitat.freeFirstBuild），不另写一份。 */
    var freeBuild = !maxed && lv === 0 && !blocked && !canalCap &&
      SB.habitat.freeFirstBuild && SB.habitat.freeFirstBuild(s, id);
    var nextLevelSection = maxed
      ? '<section class="tree-detail-section"><h4>等级上限</h4><p>已达最高等级（' + lv + '/' + b.maxLvl + '）</p></section>'
      : '<section class="tree-detail-section"><h4>下一次建造 / 升级</h4><p>' +
        (freeBuild ? '材料全免 —— 你已达成「' + b.name + '：轻车熟路」，每个轮回首次建造这座建筑不花材料'
          + ((typeof cost.pop === 'number' && cost.pop > 0) ? '（人口要求照常：仍需 ' + cost.pop + ' 人）。' : '。')
          : SB.economy.buildCostTxt(s, id, cost)) + '</p></section>';
    var buildingFlavor = BUILDING_FLAVOR[b.id] || '';
    var voidBuilding = b.id === 'void_altar';
    if (voidBuilding && buildingFlavor && SB.ui.render && typeof SB.ui.render.voidCorrupt === 'function') {
      buildingFlavor = SB.ui.render.voidCorrupt(buildingFlavor, 137, 1);
    }
    var body = '<div class="tree-cost"><span>当前等级</span><b>' + lv + '</b></div>' +
      '<section class="tree-detail-section"><h4>效果</h4><p>' + linkInfoNames(effectText) + '</p></section>' +
      consumeSection +
      nextLevelSection +
      '<section class="tree-detail-section"><h4>建造条件</h4><p>' + reqText + '</p></section>' +
      (buildingFlavor ? '<p class="b-flavor' + (voidBuilding ? ' void-flavor' : '') + '">' + buildingFlavor + '</p>' : '');
    var buildingMark = b.icon
      ? '<img class="tree-detail-icon" src="' + b.icon + '" alt="" aria-hidden="true">'
      : '⌂';
    openInfoCard(name, buildingMark, state, body, '', b.icon ? 'has-image' : '');
  }

  var WONDER_ART = SB.ui.renderContent.WONDER_ART;
  var WONDER_FLAVOR = SB.ui.renderContent.WONDER_FLAVOR;
  function wonderArt(w, s) {
    var src = WONDER_ART[w.id];
    if (src) return '<div class="wonder-art has-image"><img src="' + src + '" alt="' + SB.wonder.displayName(s, w.id) + '"></div>';
    return '<div class="wonder-art placeholder"><span>✦</span></div>';
  }
  function showWonderInfo(id) {
    var s = res(), w = SB.wonder && SB.wonder.byId(id);
    if (!s || !w) return;
    var wonderName = SB.wonder.displayName(s, id);
    var wonderDesc = SB.wonder.displayDesc(s, id);
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
    var body = wonderArt(w, s) +
      '<div class="tree-cost"><span>建造成本</span><b>' + SB.economy.costTxt(cost) + '</b></div>' +
      '<section class="tree-detail-section"><h4>效果</h4><p>' + linkInfoNames(wonderDesc) + '</p>' +
      (done ? SB.ui.renderCommon.happyBonusNote(s, 'wonder', w.id) : '') + '</section>' +
      '<section class="tree-detail-section"><h4>解锁条件</h4>' + reqHtml + '</section>' +
      (why && !/^需要先/.test(why) ? '<section class="tree-detail-section"><h4>资源情况</h4><p>' + why + '</p></section>' : '') +
      '<section class="tree-detail-section wonder-copy"><h4>奇观文案</h4><p>' + flavor + '</p></section>';
    var action = done ? '' : '<button class="btn buy" type="button" data-wonder="' + id + '"' +
      (why ? ' disabled title="' + why + '"' : '') + '>建成　' + SB.economy.costOwnedTxt(s, cost) + '</button>';
    openInfoCard(wonderName, '✦', state, body, action);
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
    var cost = type === 'craft' ? item.in
      : type === 'upgrade' ? W.upgradeCost(s, id) : item.cost;
    var desc = item.desc || '';
    if (type === 'craft') {
      var mul = W.craftMul(s, item);
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
