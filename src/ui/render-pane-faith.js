/* 天壳 / SHELLBREAK — 信仰页渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  /* ── 信仰页（2026-09-30 用户：「单独起一个信仰面板」）────────────────────
   * 原先信仰在主页面上只是一张小卡（#religionBox），里面孤零零一个命名输入框 ——
   * 玩家看得见框、看不见「信仰这条轴在做什么」。现在收成一个正式页签，
   * 与巢穴 / 科技 / 市政 并列。
   * ⚠️ 命名输入框**不在本函数的返回值里**：它必须留在持久节点 #religionBox
   *    （写进正文就会被每 2 秒的 PANE_REFRESH 换掉、丢焦点）。本页的静态标题与那个框
   *    都写在 index.html 的 #pane-faith 里，这里的正文写进 #pane-faith-body
   *    （renderPanes 认这个 body 容器）。
   * 门 = 完成《神学》，与资源行的 gate 同源（resUnlocked(s,'faith') ⇔ s.civics.theology），
   *    未开门时给一张说明卡而不是空白页。 */
  function paneFaith() {
    var s = SB.game.run();
    if (!s || !SB.economy.resUnlocked(s, 'faith')) return paneFaithLocked();
    var h = '';
    var f = s.res.faith || 0;
    var fr = SB.economy.faithRate(s) || 0;
    var fam = SB.economy.faithAllMul(s);
    var fm = SB.economy.faithMul(s);
    /* ERA9 虚境信仰卡：装填后信仰名强制「虚境」并锁死（覆盖玩家自定义名）。 */
    var rn = (SB.civic && SB.civic.faithDisplayName) ? SB.civic.faithDisplayName(s) : ((s.religionName || '').trim());
    var rnLocked = !!(SB.civic && SB.civic.faithNameLocked && SB.civic.faithNameLocked(s));
    /* 读数三件同框才叫「一条轴」：存量 / 每秒 / 它换来的全局加成。 */
    h += '<div class="row"><div><div class="nm">' + rn + ' <b>' + SB.economy.fmtAmt(f) + '</b>' +
      (fr > 0 ? '<i class="rate up">+' + fr.toFixed(3) + '/s</i>' : '') + '</div>' +
      '<div class="ds">每个族民每秒产 ' + SB.CFG.FAITH_PER_POP + ' 信仰，再乘神庙与政策的乘区' +
      '（现值 ×' + fm.toFixed(2) + '）。信仰不占仓储，也不会被花掉。</div></div></div>';
    h += '<div class="row"><div><div class="nm">全产加成 <b>+' +
      ((fam - 1) * 100).toFixed(0) + '%</b> <span class="tag">按存量</span></div>' +
      '<div class="ds">按信仰<b>存量</b>的对数刻度给：10 → +1%、100 → +2%、1000 → +3%……' +
      '每高一个数量级多 1%。这条加成推的是珊瑚 / 石头 / 藻食等全部资源，' +
      '但<b>不推信仰自己</b>（否则会自激）。</div></div></div>';
    h += '<div class="row"><div><div class="nm">你的信仰</div>' +
      '<div class="ds">' + (rn ? '当前名为「<b>' + rn + '</b>」，' : '尚未命名，') +
      (rnLocked ? '已由<b>虚境信仰</b>永恒锚定，不可更改。'
        : '名字就写在上面那个框里，改名随时可改、无消耗。它会显示在顶栏的信仰资源格上。') +
      '</div></div></div>';
    /* 来源与出口：说清信仰从哪来、通往哪里（轮回系统的门就是「建立宗教」）。 */
    h += '<div class="row"><div><div class="nm">信仰从哪来</div>' +
      '<div class="ds">人口是它唯一的来源（每人 ' + SB.CFG.FAITH_PER_POP + '/s）——' +
      '养的人越多、攒得越快；神庙每级 +' +
      (((SB.BLD && SB.BLD.templeFaithRatio) || 0) * 100).toFixed(0) +
      '% 是它唯一的建筑乘区。</div></div></div>';
    return h;
  }
  function paneFaithLocked() {
    return '<div class="row"><div><div class="nm">信仰页未开启</div>' +
      '<div class="ds">信仰是第三条文明轴：族民越多、信仰攒得越快，' +
      '存量按数量级给你全局产出加成。</div></div></div>' +
      '<div class="note">完成「神学」之后这一页才打开——神学是纪元二的关键节点之一。' +
      '在那之前，顶栏也不会显示信仰这一格。</div>';
  }

  parts.paneFaith = paneFaith;
})(typeof window !== 'undefined' ? window : globalThis);
