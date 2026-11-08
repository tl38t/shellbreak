/* 天壳 / SHELLBREAK — renderer 的跨 pane 共享展示 helper。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var common = SB.ui.renderCommon || (SB.ui.renderCommon = {});

  function formatFallback(value, params) {
    return String(value == null ? '' : value).replace(/\{([^{}]+)\}/g, function (match, name) {
      return params && params[name] !== undefined && params[name] !== null ? String(params[name]) : match;
    });
  }
  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || formatFallback(fallback, params);
  }

  var HAPPY_TIER_KEYS = {
    '动荡': 'happiness.tier.turmoil',
    '不满': 'happiness.tier.discontent',
    '安定': 'happiness.tier.stable',
    '愉悦': 'happiness.tier.content',
    '欢欣': 'happiness.tier.joyful',
    '欣喜若狂': 'happiness.tier.ecstatic',
    '兴盛': 'happiness.tier.thriving',
    '繁荣': 'happiness.tier.prosperous',
    '黄金时代': 'happiness.tier.golden_age'
  };
  var HAPPY_BONUS_DISPLAY_KEYS = {
    '政体': 'civic.government.heading',
    '王国大交易所': 'wonder.kingdom_grand_exchange.name',
    '政策卡': 'ui.economy.rate.source.policy_cards',
    '天穹钻机': 'content.wonder_skydrill.name',
    '安乐之治': 'prestige.perk.blissful_reign.name',
    '水体污染': 'challenge.water_pollution.name'
  };
  function localizedHappyTier(name) {
    var key = HAPPY_TIER_KEYS[name];
    return key ? tr(key, null, name) : name;
  }

  /* ── 幸福度常驻偏移量的「就地说明」（2026-10-05 用户「都补上」）──
   * 【为什么顶栏已经列了还要在各自面板再列一遍】顶栏那行给的是**汇总**（谁给了多少一目了然），
   *   但玩家是在**奇观页/政策卡页/钻机页**做决策的 —— 那一页不写「它 +1 幸福度」，
   *   他就看不出这件东西买来干什么。⇒ 汇总归顶栏、说明归各面板，两处都要有。
   * ⚠️ **唯一数据源是 economy.happyLedger 的 bonusParts**，这里只做「按 label 过滤 + 摆文字」，
   *   绝不自己算一遍偏移量 —— 重算就是第二份口径，与 tick 的 _gb 会漂。
   * ⚠️ 逐字匹配 label（'王国大交易所' 等）**要防改名漂移**：label 改了这里会静默失效
   *   （显示"该来源无效果"而不是报错）。所以找不到时**不显示这一行**、让顶栏去暴露那个变化，
   *   而不是在这里打一个自造的提示。 */
  var HAPPY_BONUS_LABELS = {
    gov: '政体', wonder: '王国大交易所', card: '政策卡', skydrill: '天穹钻机'
  };
  function happyBonusNote(s, which, sourceId) {
    /* 奇观页的提示必须绑定当前奇观；幸福度账本是汇总口径，不能把
     * 「王国大交易所」这一项的标签复用到所有已建成奇观上。 */
    if (which === 'wonder' && sourceId !== 'wonder_grand_exchange') return '';
    var v;
    if (which === 'card') {
      /* 卡库按**单张卡**说明效果；幸福账本的「政策卡」是所有已装卡的合计，
       * 若把合计贴到每张卡上，就会让一张 -1 的卡看起来像多张都在扣。 */
      if (!sourceId || !SB.civic || !SB.civic.cardHappyOffsetFor) return '';
      v = SB.civic.cardHappyOffsetFor(s, sourceId);
      if (!v) return '';
    } else {
      if (!SB.economy || !SB.economy.happyLedger) return '';
      var L = SB.economy.happyLedger(s);
      if (!L.bonusParts || !L.bonusParts.length) return '';
      var want = HAPPY_BONUS_LABELS[which], out = [];
      for (var i = 0; i < L.bonusParts.length; i++) {
        if (L.bonusParts[i].label === want) out.push(L.bonusParts[i].v);
      }
      if (!out.length) return '';   // 这件东西此刻没给幸福度 ⇒ 不摆（别在奇观页给每座都挂一句"无效果"）
      v = out[0];
    }
    /* ⚠️ 措辞分方向：policy card「工业化配给」是 **−1**（压低），
     *   若统一写「抬高全产乘区档位」，玩家读到「−1 · 抬高」会以为抵消不了。 */
    var locale = SB.i18n && SB.i18n.getLocale ? SB.i18n.getLocale() : 'zh-CN';
    var direction = locale === 'en-US'
      ? (v > 0 ? 'raises' : 'lowers')
      : (v > 0 ? '抬高' : '压低');
    return '<i class="cap">' + tr('ui.happiness.bonus_offset', {
      happinessOffset: (v > 0 ? '+' : '') + (+v.toFixed(2)),
      effectDirection: direction
    }, '幸福度效果 {happinessOffset}（常驻，{effectDirection}全产乘区档位）') + '</i>';
  }

  function treeIconHTML(t, lit, cls) {
    if (!t || !t.icon || !lit) return '';
    return '<img class="' + cls + '" src="' + t.icon + '" alt="" aria-hidden="true" loading="lazy">';
  }

  /* 幸福度面板上的「?」按钮（2026-10-27 用户要求「幸福度后面弄一个小问号，跟页签那种一样」）。
   * ⚠️ 复用页签的 openIntro 通道：文案统一挂在 renderContent.INTRO.happy 里，这里只放按钮。
   *   若把说明文字直接写进面板，就是第二份文案（改一处漏一处），而且每 tick 重绘都要重排。
   * ⚠️ onclick 里必须 stopPropagation：面板挂在族民页，冒泡会触发卡片的点击逻辑。 */
  function happyHelpBtnHTML() {
    return '<button type="button" class="qbtn happy-help"' +
      ' onclick="event.stopPropagation();SB.ui.openIntro(\'happy\')"' +
      ' title="' + tr('ui.happiness.help.title', null, '幸福度是怎么变化的') + '">?</button>';
  }

  function happyPanelHTML(s) {
    if (!SB.economy.resUnlocked(s, 'luxury') || !SB.economy.happyLedger) return '';
    var L = SB.economy.happyLedger(s);
    /* ⚠️ 档位表必须走门控口 happyTierList(s)（2026-10-17 用户报「黄金时代都有了条没改」）：
     *   原先这里直接拿全表，且下方标签行手抄 6 个旧档名 —— ERA6 大众传媒新增三档后
     *   标签行没跟着变，比例尺上限也被拉到全表末档 lo=6（未研究时永远够不着）。
     *   标签行改为由表生成，杜绝第三份手抄。 */
    var tiers = SB.economy.happyTierList ? SB.economy.happyTierList(s) : (SB.economy.HAPPY_TIERS || []);
    var low = SB.CFG.HAPPY_FLOOR, high = tiers.length ? tiers[tiers.length - 1].lo : 3;
    var pct = Math.max(0, Math.min(100, (L.H - low) / (high - low) * 100));
    var flow = Math.abs(L.net) < 0.0005
      ? tr('ui.happiness.flow.stable', {
        luxurySupplyRate: L.out.toFixed(2), residentConsumptionRate: L.burn.toFixed(2)
      }, '奢侈品供给 {luxurySupplyRate}/秒 · 居民消耗 {residentConsumptionRate}/秒 · 幸福度持平')
      : tr('ui.happiness.flow.net_change', {
        luxurySupplyRate: L.out.toFixed(2), residentConsumptionRate: L.burn.toFixed(2),
        netHappinessRate: (L.net > 0 ? '+' : '') + L.net.toFixed(3)
      }, '奢侈品供给 {luxurySupplyRate}/秒 · 居民消耗 {residentConsumptionRate}/秒 · 幸福度净变化 {netHappinessRate}/秒');
    var bonus = '';
    if (L.bonusParts && L.bonusParts.length) {
      var parts = [];
      for (var i = 0; i < L.bonusParts.length; i++) {
        var bp = L.bonusParts[i];
        var labelKey = HAPPY_BONUS_DISPLAY_KEYS[bp.label];
        var label = labelKey ? tr(labelKey, null, bp.label) : bp.label;
        parts.push(label + (bp.v > 0 ? ' +' : ' ') + (+bp.v.toFixed(2)));
      }
      /* ⚠️ 2026-10-06 用户报 bug：消耗的单价里曾把下面这些「固定加成」也算进去
       *   （等于加成自己把居民养贵 ⇒ 政体 +1 幸福真实是负收益）。已修：消耗按 `mechH`
       *   计价。把这句明写出来，玩家才知道加成只是补贴、不会被反向征税。 */
      var note = L.mechH > 0
        ? tr('ui.happiness.fixed_bonus.excluded_mechanic_cost', {
          mechanicHappinessRate: L.mechH.toFixed(2)
        }, '（不计入消耗单价；居民消耗按幸福度 {mechanicHappinessRate} 计）')
        : tr('ui.happiness.fixed_bonus.excluded_floor_cost', null, '（不计入消耗单价；幸福度计价已降至保底）');
      bonus = '<div class="happy-bonus">' + tr('ui.happiness.fixed_bonus_list', {
        bonusList: parts.join(' · ')
      }, '固定加成：{bonusList}') + note + '</div>';
    }
    var next = L.toNext == null
      ? tr('ui.happiness.next_tier.max', null, '幸福度已达最高档')
      : L.toNext > 0
        ? tr('ui.happiness.next_tier.remaining', {
          nextTierName: localizedHappyTier(L.tier.nextName), happinessToNext: L.toNext.toFixed(2)
        }, '距「{nextTierName}」还差 {happinessToNext}')
        : tr('ui.happiness.next_tier.drop_to', {
          nextTierName: localizedHappyTier(L.tier.nextName), happinessDrop: Math.abs(L.toNext).toFixed(2)
        }, '再下降 {happinessDrop} 将跌至「{nextTierName}」');
    var happinessName = tr('ui.happiness.name', null, '幸福度');
    return '<section class="happy-panel" id="happyPanel" aria-label="' + happinessName + '">' +
      '<div class="happy-head"><div class="happy-reading"><span>' + happinessName + '</span> <b id="happyValue">' + L.H.toFixed(2) +
      '</b><i id="happyTier">' + localizedHappyTier(L.tier.name) + '</i>' + happyHelpBtnHTML() +
      '</div><span class="happy-effect" id="happyEffect">' + tr('ui.happiness.global_production_multiplier', {
        globalProductionMultiplier: SB.economy.happyMul(s).toFixed(2)
      }, '全产 ×{globalProductionMultiplier}') + '</span></div>' +
      '<div class="happy-meter" role="meter" aria-label="' + tr('ui.happiness.meter.aria_label', null, '幸福度等级') + '" aria-valuemin="' + low + '" aria-valuemax="' + high +
      '" aria-valuenow="' + L.H.toFixed(2) + '"><div class="happy-meter-fill"></div>' +
      '<i class="happy-marker" id="happyMarker" style="left:' + pct.toFixed(2) + '%"></i></div>' +
      '<div class="happy-labels">' + tiers.map(function (t) { return '<span>' + localizedHappyTier(t.name) + '</span>'; }).join('') + '</div>' +
      '<div class="happy-flow" id="happyFlow">' + flow + '</div>' + bonus +
      '<div class="happy-next" id="happyNext">' + next + '</div></section>';
  }

  function paintHappy(s) {
    var marker = root.document.getElementById('happyMarker');
    if (!marker || !s || !SB.economy.happyLedger) return;
    var L = SB.economy.happyLedger(s);
    /* ⚠️ 与 happyPanelHTML 同一条门控：比例尺上限 = 门控表末档 lo（大众传媒未拥有时 = 3）。
     *   两处若不同源，重建面板与逐 tick 刷标记就会各画各的。 */
    var tiers = SB.economy.happyTierList ? SB.economy.happyTierList(s) : (SB.economy.HAPPY_TIERS || []);
    var low = SB.CFG.HAPPY_FLOOR, high = tiers.length ? tiers[tiers.length - 1].lo : 3;
    marker.style.left = Math.max(0, Math.min(100, (L.H - low) / (high - low) * 100)) + '%';
    var value = root.document.getElementById('happyValue');
    var tier = root.document.getElementById('happyTier');
    var effect = root.document.getElementById('happyEffect');
    if (value) value.textContent = L.H.toFixed(2);
    if (tier) tier.textContent = localizedHappyTier(L.tier.name);
    if (effect) effect.textContent = tr('ui.happiness.global_production_multiplier', {
      globalProductionMultiplier: SB.economy.happyMul(s).toFixed(2)
    }, '全产 ×{globalProductionMultiplier}');
    var flow = root.document.getElementById('happyFlow');
    if (flow) flow.textContent = Math.abs(L.net) < 0.0005
      ? tr('ui.happiness.flow.stable', {
        luxurySupplyRate: L.out.toFixed(2), residentConsumptionRate: L.burn.toFixed(2)
      }, '奢侈品供给 {luxurySupplyRate}/秒 · 居民消耗 {residentConsumptionRate}/秒 · 幸福度持平')
      : tr('ui.happiness.flow.net_change', {
        luxurySupplyRate: L.out.toFixed(2), residentConsumptionRate: L.burn.toFixed(2),
        netHappinessRate: (L.net > 0 ? '+' : '') + L.net.toFixed(3)
      }, '奢侈品供给 {luxurySupplyRate}/秒 · 居民消耗 {residentConsumptionRate}/秒 · 幸福度净变化 {netHappinessRate}/秒');
    var next = root.document.getElementById('happyNext');
    if (next) next.textContent = L.toNext == null
      ? tr('ui.happiness.next_tier.max', null, '幸福度已达最高档')
      : L.toNext > 0
        ? tr('ui.happiness.next_tier.remaining', {
          nextTierName: localizedHappyTier(L.tier.nextName), happinessToNext: L.toNext.toFixed(2)
        }, '距「{nextTierName}」还差 {happinessToNext}')
        : tr('ui.happiness.next_tier.drop_to', {
          nextTierName: localizedHappyTier(L.tier.nextName), happinessDrop: Math.abs(L.toNext).toFixed(2)
        }, '再下降 {happinessDrop} 将跌至「{nextTierName}」');
    var meter = root.document.getElementById('happyPanel');
    if (meter) {
      var bar = meter.querySelector('.happy-meter');
      if (bar) bar.setAttribute('aria-valuenow', L.H.toFixed(2));
    }
  }

  /* ── 挑战专属内容角标（2026-11-08 · 方案 B）──────────────────────────────
   * 背景：challengeOnly 内容在挑战周目里**静默混入**主线条目，玩家看不出它们
   *   是「本局临时工具」（habitat.js:135-137：通关回基游戏就该消失），容易砸满
   *   资源后换局发现全没了，第一反应是「存档丢了」。信息必须落在决策点。
   * ⚠️ 三态归一化抄 JUDGMENTS 五点三十三现有六处（habitat / civics / tech /
   *   workshop / ai-strategy / render-pane-wonder），**不新增第 7 份独立判定**。
   *   字符串形态必须先包成数组，否则 'waterpollution' 会被按字符拆成
   *   「w / a / t / e / r… 限定」——2026-11-02 那次事故的原件。
   * ⚠️ 间接专属：6 项（2 工艺升级 / 2 建筑 / 2 奇观）自己没有 challengeOnly，
   *   靠解锁门挂在流浪泰拉专属科技上。这里**反查门背后的科技/市政**，绝不
   *   给它们补字段 —— 补 'drift_terra' 会撞上 workshop.js:660 硬编码的
   *   「仅限水体污染挑战期间建造」错误文案，并改动既有 lockReason 口径。
   *   探针 tmp/_probe_challenge_tag_resolve.mjs 实证：恰好 6 项，零误伤零漏。
   * ⚠️ 基游戏（s.challenge=null）不挂角标：专属条目在该周目整行不出现。
   * ⚠️ ⓘ 复用 render.js showHoverInfo + 00-core.css 的 @media (hover:none)
   *   既有约定；内联 onclick 里 stopPropagation 是必须的 —— 科技/市政节点本身
   *   是 <button>，点 ⓘ 会冒泡成「打开节点详情」（render-common.js:99 同款写法）。 */
  function challengeTagResolve(item) {
    if (!item) return null;
    if (item.challengeOnly) return item.challengeOnly;
    var gates = [];
    function add(v) {
      if (!v) return;
      if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) gates.push(v[i]); }
      else gates.push(v);
    }
    add(item.requiredTech); add(item.requiredCivic); add(item.need); add(item.needCivic);
    for (var g = 0; g < gates.length; g++) {
      var T = SB.TECHS || [], k;
      for (k = 0; k < T.length; k++)
        if (T[k] && T[k].id === gates[g] && T[k].challengeOnly) return T[k].challengeOnly;
      var C = SB.CIVICS || [];
      for (k = 0; k < C.length; k++)
        if (C[k] && C[k].id === gates[g] && C[k].challengeOnly) return C[k].challengeOnly;
    }
    return null;
  }
  /* 归一化只有一个落点：角标文案与科技树 CSS 分类都读它，不各写一份。 */
  function challengeTagIds(item) {
    var co = challengeTagResolve(item);
    if (!co) return [];
    return (co === true) ? ['drift_terra'] : (typeof co === 'string' ? [co] : co);
  }
  function challengeTag(s, item) {
    var list = challengeTagIds(item);
    if (!list.length) return '';
    var cur = s && s.challenge && s.challenge.id;
    if (!cur) return '';
    var allowed = false, i;
    for (i = 0; i < list.length; i++) if (list[i] === cur) allowed = true;
    if (!allowed) return '';
    var names = [];
    for (i = 0; i < list.length; i++) {
      var c = (SB.challenges && SB.challenges.byId) ? SB.challenges.byId(list[i]) : null;
      names.push(c ? c.name : list[i]);
    }
    var name = names.join(' / '), p = { challengeName: name };
    var badge = tr('content.tag.challenge_only', p, '{challengeName}限定');
    var tip = tr('content.tag.challenge_only.tip', p,
      '{challengeName} · 挑战专属内容，仅在当前周目出现；通关或重开后不再保留。');
    function esc(v) {
      return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    var t = esc(tip);
    return '<span class="co-tag" title="' + t + '">' + esc(badge) + '</span>' +
      '<i class="hover-info-btn co-info" title="' + t + '"' +
      ' onclick="event.preventDefault();event.stopPropagation();SB.ui.showHoverInfo(this.getAttribute(\'title\'))">ⓘ</i>';
  }

  /* 静态角标：与 challengeTag 同款视觉/文案，但**不判当前周目**。
   * 用于科技「解锁建筑」等跨上下文列表 —— 基游戏（没打挑战）也要提示「此建筑还需先打某挑战」，
   * 否则研究普通科技后在解锁列表看到专属建筑却建不出来。复用本模块 tr（正确查 zh-CN 并替换 {challengeName}）。 */
  function challengeTagStatic(item) {
    var list = challengeTagIds(item);
    if (!list.length) return '';
    var names = [], i;
    for (i = 0; i < list.length; i++) {
      var c = (SB.challenges && SB.challenges.byId) ? SB.challenges.byId(list[i]) : null;
      names.push(c ? c.name : list[i]);
    }
    var name = names.join(' / '), p = { challengeName: name };
    var badge = tr('content.tag.challenge_only', p, '{challengeName}限定');
    var tip = tr('content.tag.challenge_only.tip', p,
      '{challengeName} · 挑战专属内容，仅在对应挑战周目可在建筑页建造；通关或重开后不再保留。');
    function esc(v) {
      return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    var t = esc(tip);
    return '<span class="co-tag" title="' + t + '">' + esc(badge) + '</span>' +
      '<i class="hover-info-btn co-info" title="' + t + '"' +
      ' onclick="event.preventDefault();event.stopPropagation();SB.ui.showHoverInfo(this.getAttribute(\'title\'))">ⓘ</i>';
  }
  common.challengeTag = challengeTag;
  common.challengeTagStatic = challengeTagStatic;
  common.challengeTagIds = challengeTagIds;
  common.challengeTagResolve = challengeTagResolve;
  common.happyBonusNote = happyBonusNote;
  common.treeIconHTML = treeIconHTML;
  common.happyPanelHTML = happyPanelHTML;
  common.paintHappy = paintHappy;
})(typeof window !== 'undefined' ? window : globalThis);
