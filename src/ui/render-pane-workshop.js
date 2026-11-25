/* 天壳 / SHELLBREAK — 工坊 pane 与行渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});
  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || fallback || '';
  }
  /* 属性值转义：whyText 可能带 & / " / <，直接拼进 title 会截断标签。 */
  function escAttr(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function englishLocale() {
    return !!(SB.i18n && SB.i18n.getLocale && SB.i18n.getLocale() === 'en-US');
  }
  function nonDefaultLocale() {
    return !!(SB.i18n && SB.i18n.getLocale && SB.i18n.getLocale() !== 'zh-CN');
  }
  function infoParts() { return SB.ui && SB.ui.renderParts && SB.ui.renderParts.info; }
  function localizedItemName(type, item) {
    var info = infoParts();
    return info && info.localizedWorkshopItemName
      ? info.localizedWorkshopItemName(type, item.id, item.name) : item.name;
  }
  function localizedItemDescription(type, item) {
    var info = infoParts();
    return info && info.localizedWorkshopItemDescription
      ? info.localizedWorkshopItemDescription(type, item) : (item.desc || '');
  }
  function localizedWhy(type, item, s, why) {
    var info = infoParts();
    return info && info.localizedWorkshopRequirement
      ? info.localizedWorkshopRequirement(item, s, type, why) : (why || '');
  }
  function requirementBlocked(type, item, s) {
    var info = infoParts();
    return info && info.workshopHasRequirementBlock
      ? info.workshopHasRequirementBlock(item, s, type)
      : !!(item && item.need && !(s.techs && s.techs[item.need]));
  }
  function localizedResourceName(id) {
    var fallback = SB.RESS && SB.RESS[id] ? SB.RESS[id].name : id;
    return SB.i18n && SB.i18n.resourceName ? SB.i18n.resourceName(id, fallback) : fallback;
  }

  /* 跨周目保存设备偏好。每次读取以便异步回填后及时更新。 */
  var HIDE_DONE_KEY = 'workshopHideDone';
  function hideDone() {
    var S = SB.store;
    return !!(S && S.prefGet && S.prefGet(HIDE_DONE_KEY, false));
  }
  function toggleHideDone() {
    var v = !hideDone(), S = SB.store;
    if (S && S.prefSet) S.prefSet(HIDE_DONE_KEY, v);
    return v;
  }
  /* 可反复制作的配方不参与买断项目计数。 */
  function doneCount(s) {
    var n = 0, i;
    for (i = 0; i < SB.TOOLS.length; i++) if (s.tools && s.tools[SB.TOOLS[i].id]) n++;
    var U = SB.workshop ? SB.workshop.upgrades() : [];
    for (i = 0; i < U.length; i++) if (s.upgrades && s.upgrades[U[i].id]) n++;
    return n;
  }
  function hideDoneBtn(s) {
    var n = doneCount(s);
    if (!n) return '';
    return '<button class="tgl" data-hidedone="1" aria-pressed="' + (hideDone() ? 'true' : 'false') +
      '" title="' + tr('ui.workshop.hide_completed.tooltip', null, '点击切换是否显示已完成的项目（工具与升级项）') + '">' +
      tr(hideDone() ? 'ui.workshop.hide_completed.show_button' : 'ui.workshop.hide_completed.hide_button', {
        completedCount: n
      }, (hideDone() ? '显示已完成（' : '隐藏已完成（') + n + '）') + '</button>';
  }

  /* 已读跨周目保存。旧版第一次离开就记下了全目录，迁移时只承认当前已揭示的旧记录。 */
  var SEEN_KEY = 'sb.wsSeen.v2';
  var pendingNew = null;

  function loadSeen(revealed) {
    var seen = Object.create(null);
    try {
      var raw = root.localStorage.getItem(SEEN_KEY);
      var legacy = raw === null && root.localStorage.getItem('sb.wsSeen.v1');
      var keys = JSON.parse(raw || legacy || '[]');
      if (Array.isArray(keys)) keys.forEach(function (key) {
        if (!legacy || revealed.indexOf(key) >= 0) seen[key] = true;
      });
      if (legacy) saveSeen(seen);
    } catch (e) {}
    return seen;
  }
  function saveSeen(seen) {
    try { root.localStorage.setItem(SEEN_KEY, JSON.stringify(Object.keys(seen))); } catch (e) {}
  }
  function itemRevealed(s, kind, item) {
    if (kind === 'tool') return !!(s.tools && s.tools[item.id]) || !SB.workshop.toolHasPrereqBlock(s, item);
    return !!(s.upgrades && s.upgrades[item.id]) || !SB.workshop.upgradeHasPrereqBlock(s, item);
  }
  function isNewItem(kind, id) { return !!(pendingNew && pendingNew[kind + ':' + id]); }
  function upgradeTabMeta(s, presentingRows) {
    var revealed = [], visible = [], hidingDone = hideDone();
    function collect(items, kind, prefix, owned) {
      items.forEach(function (item) {
        if (!itemRevealed(s, kind, item)) return;
        var key = prefix + item.id;
        revealed.push(key);
        if (!hidingDone || !owned || !owned[item.id]) visible.push(key);
      });
    }
    collect(SB.TOOLS, 'tool', 't:', s.tools);
    collect(SB.workshop.upgrades(), 'upgrade', 'u:', s.upgrades);
    var seen = loadSeen(revealed), unseen = 0;
    visible.forEach(function (key) {
      if (!seen[key]) {
        unseen++;
        if (presentingRows && pendingNew) pendingNew[key] = true;
      }
    });
    var done = doneCount(s), total = revealed.length;
    var purchasable = SB.workshop.hasPurchasable(s);
    return {
      done: done, total: total, unseen: unseen,
      cnt: tr('ui.workshop.tab.upgrade_progress', { completedCount: done, revealedCount: total }, '已完成 ' + done + ' / 已揭晓 ' + total),
      fresh: unseen > 0 && workshopView !== 'upgrades',
      purchasable: purchasable, avail: purchasable && workshopView !== 'upgrades'
    };
  }
  /* 制造页顶部显示通用制作效率，配方行另计本配方的加成。 */
  var craftOnlyReady = false;
  function toggleCraftOnlyReady() { craftOnlyReady = !craftOnlyReady; return craftOnlyReady; }

  function revealCraft(s, recipe) {
    if (craftOnlyReady && SB.workshop.craftBlocked(s, recipe.id)) craftOnlyReady = false;
  }

  function workshopOverview(s, sideHtml) {
    return '<div class="workshop-overview"><div class="workshop-efficiency">' +
      '<span class="workshop-mark" aria-hidden="true">⚒</span><div><small>' + tr('ui.workshop.crafting.eyebrow', null, 'CRAFT · 工坊') + '</small>' +
      '<strong>' + tr('ui.workshop.crafting.efficiency_label', null, '工艺制作效率') + ' <b>+' + (((SB.workshop.craftMul(s, {id:'__global__'}) || 1) - 1) * 100).toFixed(0) + '%</b></strong></div>' +
      (sideHtml ? '<div class="workshop-done-toggle">' + sideHtml + '</div>' : '') + '</div></div>';
  }

  function paneWorkshopCraft() {
    var s = SB.game.run();
    if (!s || !s.lvl || !(s.lvl.workshop > 0)) return paneWorkshopLocked();
    var ret = (SB.ui.track && SB.ui.track.getReturnTarget) ? SB.ui.track.getReturnTarget() : null;
    var retBar = '';
    if (ret) {
      var retText = ret.label
        ? tr('ui.workshop.craft.return_to_named', { target: ret.label }, '← 返回「' + ret.label + '」')
        : tr('ui.workshop.craft.return_to_prev', null, '← 返回刚才的建筑');
      retBar = '<div class="craft-return-bar">' +
        '<button type="button" class="craft-return-btn" data-craft-return="1">' + escAttr(retText) + '</button>' +
        '<button type="button" class="craft-return-dismiss" data-craft-return-dismiss="1" aria-label="' + escAttr(tr('ui.action.close', null, '关闭')) + '">×</button>' +
        '</div>';
    }
    var overview = workshopOverview(s, '');
    return retBar + overview + '<section class="workshop-section"><header class="workshop-section-title">' +
      '<div class="workshop-section-head-copy"><b>' + tr('ui.workshop.crafting.section_title', null, '工艺制作') + '</b>' +
      '<small>' + tr('ui.workshop.crafting.section_note', null, '查看每次投入、当前产出与批量选项。') + '</small></div>' +
      '<button type="button" class="pane-pill' + (craftOnlyReady ? ' on' : '') + '" data-craft-only-ready="1" aria-pressed="' + (craftOnlyReady ? 'true' : 'false') + '">' +
      tr('ui.workshop.crafting.only_ready', null, '只看可造') + '</button></header>' +
      autoSlotSummary(s) + '<div class="workshop-grid workshop-crafts">' + paneCraftRows(s) + '</div></section>' +
      '<div class="note">' + tr('ui.workshop.crafting.context_note', null, '这里的配方可以反复制造，石梁是当前奇观的主要建材。工具与永久升级请前往「工坊升级」页签。') + '</div>';
  }

  function paneWorkshopUpgrades() {
    var s = SB.game.run();
    if (!s || !s.lvl || !(s.lvl.workshop > 0)) return paneWorkshopLocked();
    var tm = upgradeTabMeta(s, true);
    var side = '<span class="workshop-progress-pill">' + escAttr(tm.cnt) + '</span>' + hideDoneBtn(s);
    var overview = workshopOverview(s, side);
    return overview + '<section class="workshop-section"><header class="workshop-section-title"><b>' + tr('ui.workshop.tools.section_title', null, '职业工具') + '</b>' +
      '<small>' + tr('ui.workshop.tools.section_note', null, '买断后持续生效；每件工具只作用于对应职业。') + '</small></header><div class="workshop-grid">' + paneToolRows(s) + '</div></section>' +
      '<section class="workshop-section"><header class="workshop-section-title"><b>' + tr('ui.workshop.upgrades.section_title', null, '工坊升级') + '</b>' +
      '<small>' + tr('ui.workshop.upgrades.section_note', null, '一次装填，永久生效。') + '</small></header><div class="workshop-grid">' + paneUpgradeRows(s) + '</div></section>' +
      (hideDone() ? '<div class="note">' + tr('ui.workshop.hide_completed.upgrades_note', null, '已完成项目当前被隐藏。点上方「显示已完成」可显示其余项目。') + '</div>' : '') +
      '<div class="note">' + tr('ui.workshop.upgrades.management_note', null, '工具、职业加成与容量等升级都在这里统一管理；已买断/装填的效果会持续生效。') + '</div>';
  }

  function paneWorkshop() {
    return paneWorkshopCraft();
  }

  var workshopView = 'making';
  function setWorkshopView(view) {
    if (view !== 'making' && view !== 'upgrades') return false;
    if (view === workshopView) return true;
    if (view === 'upgrades') {
      pendingNew = Object.create(null);
    } else if (pendingNew) {
      var keys = Object.keys(pendingNew);
      if (keys.length) {
        var seen = loadSeen(keys);
        keys.forEach(function (key) { seen[key] = true; });
        saveSeen(seen);
      }
      pendingNew = null;
    }
    workshopView = view;
    return true;
  }

  /* ── 下半区：工艺制作 ───────────────────────────────────────────────
   * 形参照猫国 `js/jsx/left.jsx.js:502-505` 的四颗按钮
   * （craftFixed 1/25/100 + craftPercent 0.01/0.05/0.1/1，取大）。 */
  function paneCraftRows(s) {
    var L = SB.workshop.crafts(), h = '', i, j, shown = 0;
    if (!L.length) return '<div class="row"><div class="nm">' + tr('ui.workshop.crafting.empty', null, '（还没有配方）') + '</div></div>';
    for (i = 0; i < L.length; i++) {
      var c = L[i];
      var why = SB.workshop.craftBlocked(s, c.id);
      if (SB.workshop.craftHasPrereqBlock(s, c)) continue;
      if (craftOnlyReady && why) continue;
      shown++;
      var mul = SB.workshop.craftMul(s, c);
      /* 「已有数量」= 该配方产物的当前库存（s.res[c.res]，见 workshop.js:299 addRes 落点）。
       * ⚠️ 是**存量**不是累计（做过多少不代表库里还有多少）；无 c.res 的配方（理论不存在）保 0。 */
      var owned = c.res ? ((s.res && s.res[c.res]) || 0) : 0;
      var productIcon = c.res ? '<img class="craft-icon" src="assets/resource-icons/' + c.res + '.png?v=2" alt="" aria-hidden="true" width="36" height="36" decoding="async">' : '';
      var costParts = [], costKey;
      for (costKey in c.in) costParts.push(SB.RESS[costKey].name + ' ' + c.in[costKey]);
      var cost = nonDefaultLocale() ? SB.economy.costTxt(c.in) : costParts.join(' + ');
      h += '<div class="row" data-craft-res="' + escAttr(c.res) + '"><div class="nm">' + productIcon + '<button type="button" class="building-name" data-info-item="craft" data-info-id="' + c.id + '" aria-haspopup="dialog">' + localizedItemName('craft', c) + '</button></div>' +
        '<div class="ds">' + tr('ui.workshop.crafting.cost_label', null, '每次：') + ' ' + cost +
        ' ⇒ <b>' + SB.economy.fmtAmt(c.out * mul) + '</b>' +
        tr('ui.workshop.craft.efficiency_bonus', {
          efficiencyBonusPercent: ((mul - 1) * 100).toFixed(0)
        }, '（效率 +' + ((mul - 1) * 100).toFixed(0) + '%）') +
        ' <span class="craft-owned" title="' + tr('ui.workshop.crafting.owned_stock_tooltip', null, '该配方产物当前的库存数量') + '">' +
        tr('ui.workshop.crafting.owned_stock', { amount: SB.economy.fmtAmt(owned) }, '已有 ' + SB.economy.fmtAmt(owned)) + '</span>' + '</div>';
      h += '<div class="craftbtns">';
      for (j = 0; j < SB.workshop.steps.length; j++) {
        var st = SB.workshop.steps[j];
        var amt = why ? 0 : SB.workshop.stepAmt(s, c, st);
        /* MAX 档（「100%」）光写个百分比看不出到底会造多少（2026-10-16 用户）。
         * 在它后面标出**这一档实际到手的成品量** —— 数值由 workshop.stepOut 给，
         * 与 craft() 同源同取整（见该函数注）；UI 只负责拼字符串，不算游戏逻辑。
         * ⚠️ 灰态（why，材料不够）/ 造不出（amt≤0）时保持纯文案，与 +1/+25/+100 的灰态一致。 */
        var lbl = st.label;
        if (st.fixed <= 0 && amt > 0) lbl += ' →' + SB.economy.fmtAmt(SB.workshop.stepOut(s, c, st));
        h += '<button class="btn' + (why ? ' buy' : '') + '" data-craft="' + c.id + '"' +
          ' data-craft-amt="' + amt + '"' + (why ? ' disabled' : '') + '>' + lbl + '</button>';
      }
      /* 建造追踪（2026-10-29）：材料不足的配方给一个「追踪」。
       * ⚠️ 配方是**可反复制造**的，所以 craft 类目标**不**在制造成功后自动解除
       *    （与「建成即解除」的建筑/奇观不同）——玩家要的是「能造了就叫我」，
       *    造完一批还想继续造，钉着更顺手。
       * ⚠️ 未解锁的配方在上面的 `continue` 已经整行跳过了，这里 `why` 只剩「材料不足」。
       * ⚠️ 必须拼进 `.craftbtns` 内部（四颗数量钮那一组）：本行是两列 grid，
       *    往外插一个节点会掉进隐式列、把卡片挤变形。 */
      if (why) {
        /* 多目标串（`a|b`）不能全等比较，见 render-pane-village.js 同处注释（2026-11-18）。 */
        var _cton = (SB.ui.track && SB.ui.track.isTracked) ? SB.ui.track.isTracked('craft', c.id, s)
          : (s.track === 'craft:' + c.id);
        h += '<button type="button" class="btn track-toggle' + (_cton ? ' on' : '') + '"' +
          ' data-track="craft:' + c.id + '" aria-pressed="' + (_cton ? 'true' : 'false') + '"' +
          ' title="' + (_cton
            ? tr('ui.workshop.crafting.track.tracked_tooltip', null, '已追踪：材料够了会在屏幕角落提示')
            : tr('ui.workshop.crafting.track.action_tooltip', null, '追踪这个配方：材料够了在屏幕角落提示你')) + '">' +
          tr(_cton ? 'wonder.track.tracked.button' : 'village.building.track.action.button', null, _cton ? '已追踪' : '追踪') + '</button>';
      }
      h += '</div>' + autoSlotCtl(s, c) + '</div>';
    }
    if (!shown) return '<div class="row"><div class="nm">' + (craftOnlyReady
      ? tr('ui.workshop.crafting.only_ready.empty', null, '（当前没有材料足够的配方，关闭「只看可造」查看全部）')
      : tr('ui.workshop.crafting.empty', null, '（还没有配方）')) + '</div></div>';
    var steps = SB.workshop.steps || [], smallOption = steps[0] ? steps[0].label : '+1';
    var largeOption = steps[2] ? steps[2].label : '+100';
    var fullOption = steps.length ? steps[steps.length - 1].label : '100%';
    var help = nonDefaultLocale() ? tr('ui.workshop.craft.amount_help', {
      smallBatchOption: smallOption,
      largeBatchOption: largeOption,
      fullMaterialsPercent: fullOption
    }, '') : '四颗按钮是**同一份材料换不同份数**：+1 就是造 1 份，' +
      '+100 就是造 100 份（不是「库存的 100%」）；「100%」是把当前材料**全造完**，' +
      '按钮后面的 → 就是按当前材料与效率实际到手的成品量。效率和材料够了就更划算。';
    return h + '<div class="note">' + help + '</div>';
  }

  /* ── 自动制作槽控件 ────────────────────────────────────────────────
   * 全部原料有上限时走满仓档；含任一无上限原料时沿用批次档。
   * ⚠️ 数字输入框放在独立弹窗，不放在 pane 内：本 pane 每 2 秒整块重画，输入会丢焦点/丢值。
   * ⚠️ 没解锁自动工坊时**整行不画**（不是画成灰按钮）：那升级项还没装，
   *    槽数就是 0，画一堆点不动的按钮等于预告一个玩家拿不到的功能。
   *    拿得到之后（slotCap > 0）才出现「＋自动」。 */
  function autoSlotCtl(s, c) {
    var cap = SB.workshop.slotCap(s);
    if (cap <= 0) return '';
    var pct = SB.workshop.slotPct(s, c.id);
    var batchRequired = SB.workshop.hasUnboundedInput(s, c);
    var batch = SB.workshop.slotBatch(s, c.id);
    var idx = SB.workshop.slotIndexOf(s, c.id);
    var assigned = idx >= 0;
    var batchMode = assigned && batchRequired;
    var limitedInputs = [], unlimitedInputs = [], inputId;
    for (inputId in c.in) {
      var inputCap = SB.economy.capOf(s, inputId);
      var inputName = localizedResourceName(inputId);
      (isFinite(inputCap) ? limitedInputs : unlimitedInputs).push(inputName);
    }
    var mixedInputs = limitedInputs.length > 0 && unlimitedInputs.length > 0;
    var on = assigned;
    var h = '<div class="craftauto"><span class="asl">' + tr('ui.workshop.automation.label', null, '自动') + '</span>';
    if (!on) {
      var full = !assigned && ((s.autoSlots && s.autoSlots.length) || 0) >= cap;
      h += '<button class="btn tog" data-aslot="' + c.id + '" ' + (batchRequired ? 'data-abatch="' + batch + '"' : 'data-apct="0.5"') +
        (full ? ' disabled title="' + (nonDefaultLocale() ? tr('ui.workshop.automation_slots.full_tooltip', {
          autoSlotCapacity: cap
        }, '') : '自动槽已用完（' + cap + '/' + cap + '）') + '"' : '') + '>' +
        tr(full ? 'ui.workshop.automation_slots.full_button' : 'ui.workshop.automation_slots.add_button', null, full ? '槽位已满' : '＋自动') + '</button>';
    } else {
      if (!batchRequired) {
        var P = SB.workshop.pcts(), i;
        for (i = 0; i < P.length; i++) {
          var p = P[i];
          var selectedPct = !batchMode && p === pct;
          h += '<button class="btn tog' + (selectedPct ? ' on' : '') + '" aria-pressed="' + selectedPct + '" data-aslot="' + c.id + '"' +
            ' data-apct="' + p + '" title="' + (nonDefaultLocale() ? tr('ui.workshop.automation_slots.percent_tooltip', {
              conversionPercent: p * 100
            }, '') : '任一有上限原料攒到「上限 × ' + (p * 100) + '%」时自动转制，转制当时可造量的 ' + (p * 100) + '%；转完会跌到该档位以下再重新攒，所以不会保持满仓（100% = 满仓才转）') + '">' +
            (p * 100) + '%</button>';
        }
      }
      if (batchRequired) {
        h += '<button class="btn tog' + (batchMode ? ' on' : '') + '" data-abatch-edit="' + c.id + '"' +
          ' title="' + tr('ui.workshop.automation_slots.batch_tooltip', null, '库存够造一整批时自动制造；多出的材料保留') + '">' +
          (nonDefaultLocale() ? tr('ui.workshop.automation_slots.batch_button', { batchCount: batch }, '')
            : '批次 ' + batch + ' 次 · 点击填写次数') + '</button>';
      }
      h += '<button class="btn tog" data-aoff="' + c.id + '" title="' + tr('ui.workshop.automation_slots.disable.tooltip', null, '腾出这个自动槽') + '">' +
        tr('ui.workshop.automation_slots.disable.button', null, '停用') + '</button>';
    }
    if (mixedInputs) {
      h += '<small class="craftauto-hint" role="note">' + tr('ui.workshop.automation_slots.mixed_inputs_note', {
        limitedInputs: limitedInputs.join(englishLocale() ? ', ' : '、'),
        unlimitedInputs: unlimitedInputs.join(englishLocale() ? ', ' : '、')
      }, '本配方含有上限原料（' + limitedInputs.join('、') + '）和无上限原料（' + unlimitedInputs.join('、') + '），因此沿用批次自动制造：所有原料够一批时制造。') + '</small>';
    }
    if (c.id === 'craft_rocketfuel') {
      var pctLabels = SB.workshop.pcts().map(function (percent) { return percent * 100 + '%'; });
      h += '<small class="craftauto-hint" role="note">' + tr('ui.workshop.automation_slots.warmstone_warning', {
        recommendedPercentages: pctLabels.slice(0, pctLabels.length - 1).join(' / '),
        maxPercent: pctLabels[pctLabels.length - 1] || '100%'
      }, '暖石会被保温法、熔炉和热液汽轮机消耗；自动制造需等暖石攒到所选档位（100% = 满仓）。') + '</small>';
    }
    return h + '</div>';
  }

  /* 自动槽的存量提示（挂在「工艺制作」段标题下）：玩家得先知道**有几个槽、从哪来的**。 */
  function autoSlotSummary(s) {
    var cap = SB.workshop.slotCap(s);
    var slots = s.autoSlots || [];
    if (cap <= 0 && !slots.length) {
      var lockedSummary = nonDefaultLocale() ? tr('ui.workshop.automation_slots.locked_summary', {
        automaticWorkshopSlots: 1, prestigeShopSlots: 3
      }, '') : '自动制作槽：未解锁。装上工坊升级项「自动工坊」自带 1 个，轮回商店可再买 3 个。';
      return '<div class="note">' + lockedSummary + '</div>';
    }
    var used = slots.length;
    var percentageOptions = SB.workshop.pcts().map(function (percent) { return percent * 100 + '%'; }).join(' / ');
    var summary = nonDefaultLocale() ? tr('ui.workshop.automation_slots.summary', {
      usedSlots: used, slotCapacity: cap, percentageOptions: percentageOptions
    }, '') : '自动制作槽 <b>' + used + '/' + cap + '</b>：' +
      '全部原料有上限的配方：任一原料攒到「上限 × 所选档位」时自动转制，转制当时可造量的该档位%（25 / 50 / 75 / 100%），转完跌回档位以下再攒；' +
      '含无上限原料的配方：沿用批次自动制造，库存够造指定数量时造一整批，多出的材料保留。';
    var html = '<div class="note">' + summary + '</div>';
    var lockedRows = '';
    for (var i = 0; i < used; i++) {
      var slot = slots[i], recipe = SB.workshop.craftById(slot.id);
      if (!SB.workshop.craftHasPrereqBlock(s, recipe)) continue;
      var name = recipe ? localizedItemName('craft', recipe) : tr('workshop.craft.recipe.unavailable');
      lockedRows += '<li><span>' + escAttr(name) + '</span><small>' + tr('ui.workshop.automation_slots.locked_this_run') +
        '</small><button type="button" class="btn tog" data-aoff="' + escAttr(slot.id) + '" aria-label="' +
        escAttr(tr('ui.workshop.automation_slots.disable_named', { recipe: name })) + '">' +
        tr('ui.workshop.automation_slots.disable.button') + '</button></li>';
    }
    if (!lockedRows) return html;
    return html + '<section class="assigned-crafts"><strong>' + tr('ui.workshop.automation_slots.assigned') +
      '</strong><ul>' + lockedRows + '</ul></section>';
  }

  function paneWorkshopLocked() {
    return '<div class="secttl">' + tr('ui.workshop.title', null, '工坊') + '</div>' +
      '<div class="row"><div class="nm">' + tr('ui.workshop.not_built.heading', null, '工坊尚未建成') + '</div>' +
      '<div class="ds">' + (nonDefaultLocale() ? tr('ui.workshop.locked.description', null, '')
        : '先把工坊立起来（' + SB.habitat.habitatName(SB.game.run()) + '页那一座），这里才会给出加工线。') + '</div></div>';
  }

  function paneToolRows(s) {
    var W = SB.workshop, h = '', i, shown = 0;
    for (i = 0; i < SB.TOOLS.length; i++) {
      var t = SB.TOOLS[i];
      var owned = !!(s.tools && s.tools[t.id]);
      var why = owned ? null : W.blocked(s, t.id);
      /* ⚠️ 2026-10-05 用户拍板：「工坊要能隐藏显示已经完成项目」。
       *   开关开着时跳过已买下的行。⚠️ 顺序要点：**先判开关、再判解锁**——
       *   反过来的话开关一开，「未解锁」与「已完成」两种行会一起消失，
       *   玩家会以为「连没解锁的东西都藏了」，而设置项该只管完成态。
       *   ⚠️ 计数在 doneCount(s) 里现算（不受这里的循环影响），不另记一份。 */
      if (hideDone() && owned) continue;
      /* ⚠️ 2026-10-05 用户拍板：**未解锁的条目不显示**（改前七件工具全列）。
       *   判据复用按钮文案已在用的 `/^需要先/` 前缀（未解锁 vs 买不起），不新立一套。
       *   例外：已买下的永远显示（否则玩家看不到自己买过什么）——
       *   ⚠️ 但 hideDone 开着时上面已经把「已买下」过滤掉了，这条例外在隐藏态不生效。 */
      if (!itemRevealed(s, 'tool', t)) continue;
      shown++;
      /* 按钮的文案要说清「现在是什么状态」，而不只是「买」——
       * 灰着还写「买」会让玩家以为点了会发生什么，实际什么都没发生。 */
      var ctxt = SB.economy.costOwnedTxt(s, t.cost);
      var whyText = localizedWhy('tool', t, s, why);
      var reqBlocked = requirementBlocked('tool', t, s);
      var label = nonDefaultLocale()
        ? owned ? tr('ui.workshop.tool.status.owned', null, '')
          : why ? (t.wip ? tr('workshop.tool.work_in_progress', null, '')
            : reqBlocked ? tr('ui.status.not_unlocked', null, '')
              : tr('ui.workshop.tool.buy.unaffordable', { costSummary: ctxt }, ''))
            : tr('ui.workshop.tool.buy', { costSummary: ctxt }, '')
        : owned ? '已拥有'
          : why ? (/^需要先/.test(why) ? '未解锁' : '买不起 ' + ctxt)
            : '买下 ' + ctxt;
      h += '<div class="row"' + (owned ? ' data-owned="1"' : '') + '>' +
        '<div class="nm"><button type="button" class="building-name" data-info-item="tool" data-info-id="' + t.id + '" aria-haspopup="dialog">' + localizedItemName('tool', t) + '</button>' + (isNewItem('t', t.id) ? ' <span class="tag new">NEW</span>' : '') + (owned ? ' <span class="tag ok">' + tr('ui.workshop.tool.status.purchased', null, '已买下') + '</span>' : '') + '</div>' +
        '<div class="ds">' + localizedItemDescription('tool', t) + tr('ui.workshop.item.cost_note', {
          costSummary: SB.economy.costTxt(t.cost)
        }, '（成本 ' + SB.economy.costTxt(t.cost) + '）') + '</div>' +
        '<button class="btn' + (owned || why ? '' : ' buy') + '" data-tool="' + t.id + '"' +
        (owned || why ? ' disabled' : '') + ' title="' + (whyText || '') + '">' + label + '</button></div>';
    }
    if (!shown) return '<div class="row"><div class="nm">' +
      tr(hideDone() && doneCount(s) > 0 ? 'ui.workshop.tool.empty.completed' : 'ui.workshop.tool.empty.available', null,
        hideDone() && doneCount(s) > 0 ? '（可买的都买完了）' : '（还没有可买的工具）') + '</div></div>';
    return h + '<div class="note">' + (nonDefaultLocale() ? tr('ui.workshop.tools.requirement_note', null, '')
      : '门槛是建成工坊本身，不是青铜术——青铜术是纪元一最贵的科技，等它解锁工具就晚到了。') + '</div>';
  }

  /* ── 工坊的**第三块**：工艺升级项（2026-09-28 · era2 第三层）──────────
   * ⚠️ 这块曾经**完全不存在**：capOf 里那条 `upg_ballast_1` 的乘区早就通了，
   *    e2e 也绿，但面板上没有任何一处能点到它 —— 玩家得去翻存档改 `s.upgrades`
   *    才吃得到那 ×1.5。与「系数加了没接线」是同一类病，只是这次缺的是**入口**。
   *    判据：**一个效果如果玩家点不到，就等于它不存在**，UI 少了那一行不算「以后再加」。
   * ⚠️ 形态与上半区的工具最像（一次性装填、装完永久生效），但**存的地方不同**：
   *    工具存 s.tools、升级项存 s.upgrades —— 按「买断」这一语义分别归类，
   *    不共用一个键，将来查「这东西到底买没买」才不会串。 */
  function paneUpgradeRows(s) {
    var W = SB.workshop, L = W.upgrades(), h = '', i, shown = 0;
    for (i = 0; i < L.length; i++) {
      var u = L[i];
      var on = !!(s.upgrades && s.upgrades[u.id]);
      var why = on ? null : W.upgradeBlocked(s, u.id);
      /* ⚠️ 2026-10-05：与工具同口径 —— ① hideDone 开着时跳过已装上的（先判开关）；
       *   ② 未解锁不显示，已装上的在显示态永远显示。 */
      if (hideDone() && on) continue;
      if (!itemRevealed(s, 'upgrade', u)) continue;
      shown++;
      /* 与工具同口径：灰着还写「装上」会让玩家以为点了会怎样，实际什么都没有。 */
      var cost = W.upgradeCost(s, u.id);
      var ctxt = SB.economy.costOwnedTxt(s, cost);
      var whyText = localizedWhy('upgrade', u, s, why);
      var reqBlocked = requirementBlocked('upgrade', u, s);
      var label = nonDefaultLocale()
        ? on ? tr('ui.workshop.upgrade.status.installed', null, '')
          : why ? (reqBlocked ? tr('ui.status.not_unlocked', null, '')
            : tr('ui.workshop.upgrade.install.unaffordable', { costSummary: ctxt }, ''))
            : tr('ui.workshop.upgrade.install', { costSummary: ctxt }, '')
        : on ? '已装上'
          /* ⚠️ 2026-11-14 玩家反馈「材料够了点不了」：requiresTools / requiresUpgrades
           *    这道门的文案不以「需要先」开头，改前会被一律套成「材料不够」，真因只藏在
           *    hover title（手机端没有 hover ⇒ 玩家永远看不到）。这里与英文分支已有的
           *    reqBlocked 判据对齐，把前置门单独报出来；材料门仍走原「材料不够 + 已/需」。 */
          : why ? (/^需要先/.test(why) ? '未解锁'
            : reqBlocked ? tr('ui.workshop.upgrade.install.requirement_blocked', null, '前置未完成')
              : '材料不够 ' + ctxt)
            : '装上 ' + ctxt;
      var _ds = localizedItemDescription('upgrade', u) + tr('ui.workshop.item.cost_note', {
        costSummary: SB.economy.costTxt(cost)
      }, '（成本 ' + SB.economy.costTxt(cost) + '）');
      var _buyBtn = '<button class="btn' + (on || why ? '' : ' buy') + '" data-upgrade="' + u.id + '"' +
        (on || why ? ' disabled' : '') + ' title="' + escAttr(whyText) + '">' + label + '</button>';
      /* 前置门的完整原因只挂在 hover title 上 ⇒ 手机端按跨端约定补 ⓘ 点按等价物。
       * 文本只写一份（ⓘ 的 title），浮层由 render.js showHoverInfo 读它，不复制第二份。 */
      var _reqTip = (why && reqBlocked && whyText)
        ? '<i class="hover-info-btn" title="' + escAttr(whyText) + '">ⓘ</i>' : '';
      /* 建造追踪（2026-10-29 同族）：材料不足的升级项给一个「追踪」。
       * ⚠️ 未解锁项已被 itemRevealed（upgradeBlocked 以「需要先」开头）整行跳过，
       *    这里 `why` 只剩「材料不够」，与 craft 那段同构。
       * ⚠️ 升级项是买断一次，装上即自动解除（track-dock.resolve 里查 s.upgrades[id]）。 */
      var _uton = (SB.ui.track && SB.ui.track.isTracked) ? SB.ui.track.isTracked('upgrade', u.id) : false;
      var _trackBtn = why ? '<button type="button" class="btn track-toggle' + (_uton ? ' on' : '') + '"' +
        ' data-track="upgrade:' + u.id + '" aria-pressed="' + (_uton ? 'true' : 'false') + '"' +
        ' title="' + (_uton
          ? tr('ui.workshop.crafting.track.tracked_tooltip', null, '已追踪：材料够了会在屏幕角落提示')
          : tr('ui.workshop.upgrades.track.action_tooltip', null, '追踪这个升级项：材料够了在屏幕角落提示你')) + '">' +
        tr(_uton ? 'wonder.track.tracked.button' : 'village.building.track.action.button', null, _uton ? '已追踪' : '追踪') + '</button>' : '';
      h += '<div class="row"' + (on ? ' data-owned="1"' : '') + '>' +
        '<div class="nm"><button type="button" class="building-name" data-info-item="upgrade" data-info-id="' + u.id + '" aria-haspopup="dialog">' + localizedItemName('upgrade', u) + '</button>' + (isNewItem('u', u.id) ? ' <span class="tag new">NEW</span>' : '') + (on ? ' <span class="tag ok">' + tr('ui.workshop.upgrade.status.installed', null, '已装填') + '</span>' : '') +
          (SB.ui.renderCommon.challengeTag ? SB.ui.renderCommon.challengeTag(s, u) : '') + '</div>' +
        '<div class="ds">' + _ds + '</div>' +
        '<div class="upgrade-actions">' + _buyBtn + _reqTip + _trackBtn + '</div></div>';
    }
    if (!shown) return '<div class="row"><div class="nm">' +
      tr(hideDone() && doneCount(s) > 0 ? 'ui.workshop.upgrade.empty.completed' : 'ui.workshop.upgrade.empty.available', null,
        hideDone() && doneCount(s) > 0 ? '（可装的都装完了）' : '（还没有可装的升级项）') + '</div></div>';
    return h;
  }

  parts.paneWorkshop = paneWorkshop;
  parts.paneWorkshopCraft = paneWorkshopCraft;
  parts.paneWorkshopUpgrades = paneWorkshopUpgrades;
  parts.upgradeTabMeta = upgradeTabMeta;
  parts.setWorkshopView = setWorkshopView;
  parts.toggleHideDone = toggleHideDone;
  parts.toggleCraftOnlyReady = toggleCraftOnlyReady;
  parts.revealCraft = revealCraft;
  parts.paneToolRows = paneToolRows;
  parts.paneCraftRows = paneCraftRows;
  parts.paneUpgradeRows = paneUpgradeRows;
})(typeof window !== 'undefined' ? window : globalThis);
