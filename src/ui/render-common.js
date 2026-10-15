/* 天壳 / SHELLBREAK — renderer 的跨 pane 共享展示 helper。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var common = SB.ui.renderCommon || (SB.ui.renderCommon = {});

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
    if (!SB.economy.happyLedger) return '';
    var L = SB.economy.happyLedger(s);
    if (!L.bonusParts || !L.bonusParts.length) return '';
    var want = HAPPY_BONUS_LABELS[which], out = [];
    for (var i = 0; i < L.bonusParts.length; i++) {
      if (L.bonusParts[i].label === want) out.push(L.bonusParts[i].v);
    }
    if (!out.length) return '';   // 这件东西此刻没给幸福度 ⇒ 不摆（别在奇观页给每座都挂一句"无效果"）
    var v = out[0];
    /* ⚠️ 措辞分方向：policy card「工业化配给」是 **−1**（压低），
     *   若统一写「抬高全产乘区档位」，玩家读到「−1 · 抬高」会以为抵消不了。 */
    return '<i class="cap">幸福度 ' + (v > 0 ? '+' : '') + (+v.toFixed(2)) +
      '（常驻，' + (v > 0 ? '抬高' : '压低') + '全产乘区档位）</i>';
  }

  function treeIconHTML(t, lit, cls) {
    if (!t || !t.icon || !lit) return '';
    return '<img class="' + cls + '" src="' + t.icon + '" alt="" aria-hidden="true" loading="lazy">';
  }

  function happyPanelHTML(s) {
    if (!SB.economy.resUnlocked(s, 'luxury') || !SB.economy.happyLedger) return '';
    var L = SB.economy.happyLedger(s);
    var tiers = SB.economy.HAPPY_TIERS || [];
    var low = SB.CFG.HAPPY_FLOOR, high = tiers.length ? tiers[tiers.length - 1].lo : 3;
    var pct = Math.max(0, Math.min(100, (L.H - low) / (high - low) * 100));
    var flow = '奢侈品供给 ' + L.out.toFixed(2) + '/秒 · 居民消耗 ' + L.burn.toFixed(2) + '/秒 · ' +
      (Math.abs(L.net) < 0.0005 ? '幸福度持平' : '幸福度' + (L.net > 0 ? ' +' : ' ') + L.net.toFixed(3) + '/秒');
    var bonus = '';
    if (L.bonusParts && L.bonusParts.length) {
      var parts = [];
      for (var i = 0; i < L.bonusParts.length; i++) {
        var bp = L.bonusParts[i];
        parts.push(bp.label + (bp.v > 0 ? ' +' : ' ') + (+bp.v.toFixed(2)));
      }
      /* ⚠️ 2026-10-06 用户报 bug：消耗的单价里曾把下面这些「固定加成」也算进去
       *   （等于加成自己把居民养贵 ⇒ 政体 +1 幸福真实是负收益）。已修：消耗按 `mechH`
       *   计价。把这句明写出来，玩家才知道加成只是补贴、不会被反向征税。 */
      bonus = '<div class="happy-bonus">固定加成：' + parts.join(' · ') +
        (L.mechH > 0
          ? '　（不计入消耗单价 —— 居民消耗按幸福 ' + L.mechH.toFixed(2) + ' 计）'
          : '　（不计入消耗单价 —— 计价已落到保底）') +
        '</div>';
    }
    var next = L.toNext == null ? '幸福度已达最高档' : L.toNext > 0
      ? '距「' + L.tier.nextName + '」还差 ' + L.toNext.toFixed(2)
      : '再下降 ' + Math.abs(L.toNext).toFixed(2) + ' 将跌至「' + L.tier.nextName + '」';
    return '<section class="happy-panel" id="happyPanel" aria-label="幸福度">' +
      '<div class="happy-head"><div class="happy-reading"><span>幸福度</span> <b id="happyValue">' + L.H.toFixed(2) +
      '</b><i id="happyTier">' + L.tier.name + '</i></div><span class="happy-effect" id="happyEffect">全产 ×' +
      SB.economy.happyMul(s).toFixed(2) + '</span></div>' +
      '<div class="happy-meter" role="meter" aria-label="幸福度等级" aria-valuemin="' + low + '" aria-valuemax="' + high +
      '" aria-valuenow="' + L.H.toFixed(2) + '"><div class="happy-meter-fill"></div>' +
      '<i class="happy-marker" id="happyMarker" style="left:' + pct.toFixed(2) + '%"></i></div>' +
      '<div class="happy-labels"><span>动荡</span><span>不满</span><span>安定</span><span>愉悦</span><span>欢欣</span><span>欣喜若狂</span></div>' +
      '<div class="happy-flow" id="happyFlow">' + flow + '</div>' + bonus +
      '<div class="happy-next" id="happyNext">' + next + '</div></section>';
  }

  function paintHappy(s) {
    var marker = root.document.getElementById('happyMarker');
    if (!marker || !s || !SB.economy.happyLedger) return;
    var L = SB.economy.happyLedger(s);
    var tiers = SB.economy.HAPPY_TIERS || [];
    var low = SB.CFG.HAPPY_FLOOR, high = tiers.length ? tiers[tiers.length - 1].lo : 3;
    marker.style.left = Math.max(0, Math.min(100, (L.H - low) / (high - low) * 100)) + '%';
    var value = root.document.getElementById('happyValue');
    var tier = root.document.getElementById('happyTier');
    var effect = root.document.getElementById('happyEffect');
    if (value) value.textContent = L.H.toFixed(2);
    if (tier) tier.textContent = L.tier.name;
    if (effect) effect.textContent = '全产 ×' + SB.economy.happyMul(s).toFixed(2);
    var flow = root.document.getElementById('happyFlow');
    if (flow) flow.textContent = '奢侈品供给 ' + L.out.toFixed(2) + '/秒 · 居民消耗 ' + L.burn.toFixed(2) + '/秒 · ' +
      (Math.abs(L.net) < 0.0005 ? '幸福度持平' : '幸福度' + (L.net > 0 ? ' +' : ' ') + L.net.toFixed(3) + '/秒');
    var next = root.document.getElementById('happyNext');
    if (next) next.textContent = L.toNext == null ? '幸福度已达最高档' : L.toNext > 0
      ? '距「' + L.tier.nextName + '」还差 ' + L.toNext.toFixed(2)
      : '再下降 ' + Math.abs(L.toNext).toFixed(2) + ' 将跌至「' + L.tier.nextName + '」';
    var meter = root.document.getElementById('happyPanel');
    if (meter) {
      var bar = meter.querySelector('.happy-meter');
      if (bar) bar.setAttribute('aria-valuenow', L.H.toFixed(2));
    }
  }

  common.happyBonusNote = happyBonusNote;
  common.treeIconHTML = treeIconHTML;
  common.happyPanelHTML = happyPanelHTML;
  common.paintHappy = paintHappy;
})(typeof window !== 'undefined' ? window : globalThis);
