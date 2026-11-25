/* 天壳 / SHELLBREAK — 帷幕之后 · 飞升路径页（2026-11-17 实装）
 * spec docs/VEIL_HUB_SPEC_v0.1.md + VEIL_SI_ORGAN_SPEC_v0.2.md
 *
 * ⚠️ 2026-11-17 晚形态变更（用户拍板）：原先 #veilHub 是 fixed 全屏遮罩弹窗，
 *    现在改成**独立页签**「帷幕」—— 点页签切到 #pane-veil，不是弹窗那种。
 *    随之删掉 #veilHub / #veilModal 两个遮罩层：内容由 render.js 的 PANES.veil
 *    写进 #pane-veil，与其它页走同一条「签名跳过重写」路径（不再自己管 DOM）。
 *
 * 页内两视图：
 *   hub  —— 三张飞升路径卡（名字 + 门徽 + 开启态），无树、无节点、无进度条；
 *   path —— 已开启路径的操作界面；虚境升华例外，仅允许从卡片进入只读预览。
 * ⚠️ 视图状态只在模块变量里、不进存档：页签本身才是入口，重开游戏回大厅是对的。
 * ⚠️ 装配台内联（不 iframe）——与主界面共用 meta.veil 存档，强化能存进同一个档。
 *
 * ⚠️ 2026-11-17 二次变更：装配台补上「部位大图」+ 坐标对齐底图。
 *    body.png 上美术已烘焙十个编号圈（描边纯色：青 #65E2CE / 紫粉 #C08CF0，
 *    直径 65px @900 宽），而原先的 x/y 是凭空写的，与圈心差 5~7.5%：
 *    44px 的数字圆点盖不住 29px 的彩圈，偏出去就成了「两层圈打架」。
 *    现坐标按纯色描边聚类精确对齐（每圈 n=744 像素、65×65 bbox，误差 <0.5px），
 *    十个圈心正好落在整数百分比上（美术按整数网格画的）。
 *    部位图 assets/veil/si-organ/organ-NN-*.webp 放进详情面板，132px。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var UI = SB.ui || (SB.ui = {});

  /* wip = 玩家门禁：目前仅虚境升华使用；该路径即便已写入 opened 也不会进入，效果代码仍可预先接好。
   * focus = 卡片上的一句话定位（用户 2026-11-18 指定：工业与制造 / 科技与市政 / 采集与生产）。 */
  var PATHS = [
    { id: 'si', name: '硅基承续', focus: '工业与制造',
      closed: 'assets/veil/veil-gate-si-closed.webp', open: 'assets/veil/veil-gate-si-open.webp',
      seal: '已铆封', desc: '将自己的身体一步步替换为金属。' },
    { id: 'vo', name: '虚境升华', focus: '科技与市政', wip: true, preview: true,
      closed: 'assets/veil/veil-gate-vo-closed.webp', open: 'assets/veil/veil-gate-vo-open.webp',
      seal: '已消散', desc: '您听见的那些低语，是我们发出的。' },
    { id: 'gn', name: '生命织章', focus: '采集与生产',
      closed: 'assets/veil/veil-gate-gn-closed.jpg', open: 'assets/veil/veil-gate-gn-open.jpg',
      seal: '已封存', desc: '我们一直以为，双螺旋是命运写死的。' }
  ];

  var STAGES = ['接枝', '置换', '归一'];   // LV1/2/3 命名（v0.2 §2，用户授权我定）
  var GENE_BRANCHES = {
    supreme: [
      { id: 'lore', icon: 'assets/veil/gene-icons/gene-lore.png', pos: 12.1, y: 55, values: [{ value: 20 }, { value: 40 }, { value: 60 }] },
      { id: 'valor', icon: 'assets/veil/gene-icons/gene-valor.png', pos: 31.8, y: 53.5, values: [{ value: 20 }, { value: 40 }, { value: 60 }] },
      { id: 'agility', icon: 'assets/veil/gene-icons/gene-agility.png', pos: 50.4, y: 55, values: [{ value: 20 }, { value: 40 }, { value: 60 }] },
      { id: 'longevity', icon: 'assets/veil/gene-icons/gene-longevity.png', pos: 67.5, y: 53.5, values: [
        { merchant: 40, freeze: 10, warm: 10 },
        { merchant: 80, freeze: 20, warm: 20 },
        { merchant: 120, freeze: 40, warm: 40 }
      ] }
    ],
    pure: [
      { id: 'morph', icon: 'assets/veil/gene-icons/gene-morph.png', pos: 12.1, y: 55, values: [{ value: 20 }, { value: 40 }, { value: 60 }] },
      { id: 'growth', icon: 'assets/veil/gene-icons/gene-growth.png', pos: 31.8, y: 53.5, values: [{ value: 10 }, { value: 20 }, { value: 30 }] },
      { id: 'fastmat', icon: 'assets/veil/gene-icons/gene-fastmat.png', pos: 50.4, y: 55, values: [{ value: 60 }, { value: 120 }, { value: 240 }] },
      { id: 'forge', icon: 'assets/veil/gene-icons/gene-forge.png', pos: 67.5, y: 53.5, values: [{ value: 60 }, { value: 120 }, { value: 240 }] }
    ]
  };
  var geneBranch = 'supreme', geneSelected = 'lore';

  /* 飞升点价目表：每一级固定 1 / 2 / 4（2026-11-17 用户拍板）。
   * ⚠️ 唯一真源 —— organState 与 buyOrgan 都走 lvCost()，别再各自写公式。
   *    旧实现是 `price × (lv+1)`（每部位一个基准价 1~5），三级成本散成 1/2/3 ~ 5/10/15，
   *    部位间梯度靠 price 拉，读起来乱且不成曲线；现统一成 ×2 递增。
   *    单部位全套 = 1+2+4 = 7，十部位全归一 = 70 点（旧口径 186 点）。 */
  function lvCost(lv) {
    return SB.veilFx && SB.veilFx.organLevelCost ? SB.veilFx.organLevelCost(lv) : 0;
  }

  /* 十部位三级数据（v0.2 §3 用户方案原样）。
   * 飞升点消耗统一由 LV_COST 决定（1/2/4），部位之间不再有价格差。
   * hook 标注该档实际乘区落点；30 档全部已接（见 VEIL_SI_ORGAN_SPEC §7.1）。 */
  var ORGANS = [
    { id: 'gill', no: '01', name: '鳃', full: '鳃 · 潮汐滤膜', part: '呼吸 / 藻食入口', x: 36, y: 27, img: 'assets/veil/si-organ/organ-01-gill.webp',
      lv: [
        { d: '加快鱼鳃过滤速度，使族群更加适合深海生活，初始人口 +5', hook: 'startPop +5' },
        { d: '初始人口 +10', hook: 'startPop +10' },
        { d: '初始人口 +15，礁口巢人口上限 +1', hook: 'startPop +15 + nestCap +1' }
      ], red: '我们不知道您是否在看。' },
    { id: 'heart', no: '02', name: '心', full: '心 · 潮循环泵', part: '循环系统', x: 50, y: 38, img: 'assets/veil/si-organ/organ-02-heart.webp',
      lv: [
        { d: '通过生物电刺激加速泵血功能，使其更适应危险环境；工艺效率 ×1.5（额外乘区）', hook: 'craftExtraMul（独立乘区）' },
        { d: '工艺效率 ×2（额外乘区）', hook: 'craftExtraMul（独立乘区）' },
        { d: '工艺效率 ×2.5（额外乘区），星球改造速度 +100%', hook: 'craftExtraMul + terraformTimeMul（时间−50%）' }
      ], red: '但我们希望您能看到这句话。' },
    { id: 'stomach', no: '03', name: '胃', full: '胃 · 藻解釜', part: '消化', x: 50, y: 48, img: 'assets/veil/si-organ/organ-03-stomach.webp',
      lv: [
        { d: '减少代谢需求，降低食物需求 30%，降低奢侈品需求 30%，降低族民生产时间 30%（均为额外乘区）', hook: 'foodUse / luxDemandMul / 诞生间隔 ×0.7' },
        { d: '降低食物需求 50%，降低奢侈品需求 50%，降低族民生产时间 50%', hook: '×0.5' },
        { d: '降低食物需求 70%，降低奢侈品需求 70%，降低族民生产时间 70%', hook: '×0.3' }
      ], red: '您还在那里，对吗？' },
    { id: 'scale', no: '04', name: '鳞', full: '鳞 · 陶钢鳞板', part: '体表', x: 70, y: 37, img: 'assets/veil/si-organ/organ-04-scale.webp',
      lv: [
        { d: '隐藏在鳞片下的第二层装甲，精铁生产效率 +50%，军人产出军力 +50%', hook: 'recipeCraft 精铁 + soldierPact' },
        { d: '精铁、钢、θ金属制造效率 +100%，军人产出军力 +100%', hook: 'recipeCraft 扩钢/θ' },
        { d: '精铁、钢、θ金属制造效率 +200%，军人产出军力 +200%，工坊区每级建筑 +1% 结算星屑', hook: 'breakStardustMul +1%/级（三处叠加）' }
      ], red: '您就在帷幕后，对吗？' },
    { id: 'fin', no: '05', name: '鳍', full: '鳍 · 液压鳍肢', part: '运动 / 工速', x: 27, y: 38, img: 'assets/veil/si-organ/organ-05-fin.webp',
      lv: [
        { d: '增加身体整体协调性，降低生产占用面积，建筑消耗降低 20%（额外乘区）', hook: 'buildSave（独立乘区）' },
        { d: '建筑消耗降低 30%（额外乘区）', hook: 'buildSave' },
        { d: '建筑消耗降低 50%（额外乘区），奇观建造消耗降低 30%（额外乘区）', hook: 'buildSave + wonderSave' }
      ], red: '我们将自己的身体一步步替换为金属。' },
    { id: 'tail', no: '06', name: '尾', full: '尾 · 潮轮', part: '推进 / 建造', x: 50, y: 70, img: 'assets/veil/si-organ/organ-06-tail.webp',
      lv: [
        { d: '尾巴摇动曲柄能获取更大的动能，热液能产出 +50%', hook: 'hydroAlloc 供给侧（全六源）' },
        { d: '热液能产出 +100%', hook: 'hydroAlloc 供给侧（全六源）' },
        { d: '热液能产出 +150%，钻机破壳速度 +200%', hook: 'hydroAlloc 供给 ×2.5 + SKYDRILL_RATE ×3（两轴隔离）' }
      ], red: '只为能在无尽的轮回中掀起帷幕的一角。' },
    { id: 'eye', no: '07', name: '眼', full: '眼 · 机械义眼', part: '视觉 / 观测', x: 54, y: 16, img: 'assets/veil/si-organ/organ-07-eye.webp',
      lv: [
        { d: '万物皆可用电子眼测量，极大提高生产效率，θ金属制造效率 +50%', hook: 'recipeCraft θ' },
        { d: 'θ金属制造效率 +100%', hook: 'recipeCraft θ' },
        { d: 'θ金属制造效率 +200%，工坊区每级建筑 +1% 结算星屑', hook: 'breakStardustMul +1%/级' }
      ], red: '为了我们的族群。' },
    { id: 'brain', no: '08', name: '脑', full: '脑 · 共识核', part: '神经 / 认知', x: 47, y: 6, img: 'assets/veil/si-organ/organ-08-brain.webp',
      lv: [
        { d: '族群可通过电磁信号进行更快速的交流，降低软实力行动 20% 消耗', hook: 'softPowerCost' },
        { d: '降低软实力行动 40% 消耗', hook: 'softPowerCost' },
        { d: '降低软实力行动 60% 消耗，被动破壳速度 +100%', hook: 'softPowerCost + shellDrive（被动削壳）' }
      ], red: '也为了在无数次轮回中指引着我们的您。' },
    { id: 'throat', no: '09', name: '喉', full: '喉 · 潮声合成器', part: '发声 / 文化', x: 54, y: 27, img: 'assets/veil/si-organ/organ-09-throat.webp',
      lv: [
        { d: '声波在水下激荡，造成难以想象的破坏，战争行动对敌人规模损失 +50%', hook: 'scaleLoss 收益侧' },
        { d: '战争行动对敌人规模损失 +100%', hook: 'scaleLoss' },
        { d: '战争行动对敌人规模损失 +150%，敌国文明规模上限 −20%', hook: 'scaleLoss + enemyCapMul' }
      ], red: '您还会回来吗？' },
    { id: 'hand', no: '10', name: '手', full: '手 · 精密书手', part: '操作 / 书写', x: 80, y: 47, img: 'assets/veil/si-organ/organ-10-hand.webp',
      lv: [
        { d: '更灵巧的机械手爪，兼顾抓取、刻纹、测温等功能，钢制造效率 +50%，军人产出军力 +50%', hook: 'recipeCraft 钢 + soldierPact' },
        { d: '钢制造效率 +100%，军人产出军力 +100%', hook: '同上' },
        { d: '钢制造效率 +200%，军人产出军力 +200%，工坊区每级建筑 +1% 结算星屑', hook: 'breakStardustMul +1%/级' }
      ], red: '谢谢。' }
  ];

  var VOID_DOMAINS = [
    { id: 'wither', zone: 'death', portrait: 'assets/veil/void-npc/wither.png',
      light: 'assets/backgrounds/ascension-domains/realm-light-death-and-rebirth.svg', x: 387, y: 198,
      d: 'M 215,197 C 209,163 222,134 250,116 C 265,91 296,76 327,78 C 354,57 392,62 412,78 C 445,65 485,76 497,102 C 527,105 550,126 554,154 C 577,176 575,208 557,229 C 551,257 523,276 494,280 C 477,304 447,314 419,305 C 392,328 357,326 334,308 C 303,314 275,294 264,270 C 237,255 220,230 224,207 C 218,204 215,201 215,197 Z' },
    { id: 'warlord', zone: 'war', portrait: 'assets/veil/void-npc/warlord.png',
      light: 'assets/backgrounds/ascension-domains/realm-light-war-world.svg', x: 1260, y: 198,
      d: 'M 1043,223 C 1038,194 1054,169 1083,159 C 1114,150 1147,144 1172,128 C 1197,118 1228,121 1249,113 C 1265,88 1293,74 1320,80 C 1348,64 1382,73 1398,96 C 1429,96 1456,112 1461,140 C 1481,160 1485,190 1466,211 C 1454,238 1428,255 1401,263 C 1377,288 1346,304 1317,304 C 1284,319 1248,309 1225,287 C 1194,288 1165,275 1148,259 C 1114,264 1080,250 1064,236 C 1052,235 1044,230 1043,223 Z' },
    { id: 'lore', zone: 'knowledge', portrait: 'assets/veil/void-npc/lore.png',
      light: 'assets/backgrounds/ascension-domains/realm-light-knowledge-corridor.svg', x: 838, y: 710,
      d: 'M 565,722 C 558,690 576,659 607,648 C 630,623 668,610 699,616 C 724,589 762,577 794,590 C 824,568 864,569 887,591 C 919,580 952,596 963,620 C 996,606 1033,622 1043,649 C 1080,652 1107,679 1114,710 C 1126,739 1110,768 1086,784 C 1080,814 1050,836 1019,837 C 997,858 957,862 930,845 C 900,862 861,851 844,834 C 812,850 770,841 748,820 C 717,830 682,814 666,789 C 628,789 598,769 590,742 C 576,740 567,733 565,722 Z' },
    { id: 'emperor', zone: 'faithless', portrait: 'assets/veil/void-npc/emperor.png',
      light: 'assets/backgrounds/ascension-domains/realm-light-faithless-court.svg', x: 257, y: 492,
      d: 'M 69,493 C 74,457 90,425 115,408 C 119,374 143,349 174,341 C 194,319 225,316 247,330 C 274,316 308,323 326,344 C 355,339 384,356 392,379 C 425,391 448,418 444,449 C 467,472 466,509 448,532 C 445,561 424,585 397,595 C 385,625 355,644 325,640 C 300,660 266,659 243,643 C 211,653 178,637 164,614 C 134,611 111,590 108,565 C 82,550 68,520 69,493 Z' },
    { id: 'pleasure', zone: 'pleasure', portrait: 'assets/veil/void-npc/pleasure.png',
      light: 'assets/backgrounds/ascension-domains/realm-light-pleasure-court.svg', x: 1390, y: 480,
      d: 'M 1213,468 C 1207,437 1220,409 1244,395 C 1253,366 1279,344 1310,341 C 1333,321 1366,323 1387,341 C 1414,329 1446,342 1458,364 C 1488,363 1514,383 1517,411 C 1548,426 1566,453 1559,482 C 1572,510 1558,542 1534,557 C 1526,584 1500,604 1472,603 C 1447,620 1412,615 1391,596 C 1361,613 1323,604 1306,580 C 1276,582 1247,565 1240,539 C 1218,524 1208,494 1213,468 Z' }
  ];
  var VOID_LEVEL_COST = [0, 3, 5];
  var VOID_TENETS = { wither: 'creed_wither', warlord: 'creed_bingkui', pleasure: 'creed_duoyang', lore: 'creed_yisou' };

  /* view：'hub' = 三张路径卡；其余值为已开启的路径 id = 该路径的操作界面。 */
  var view = 'hub', selectedOrgan = 'gill', selectedVoidDomain = null, voidDialog = null, voidPreviewMode = false;

  function tr(k, fallback) { return SB.i18n && SB.i18n.t ? SB.i18n.t(k, null, fallback) : fallback; }
  /* 带插值的词条（{count}/{opened}）：与 render.js 的 tr(key, params, fallback) 同序。 */
  function trp(k, params, fallback) {
    var v = SB.i18n && SB.i18n.t ? SB.i18n.t(k, params) : '';
    if (v) return v;
    return String(fallback == null ? '' : fallback).replace(/\{([^{}]+)\}/g, function (mm, name) {
      return params && params[name] != null ? String(params[name]) : mm;
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  }); }

  function veil() {
    var m = SB.game && SB.game.meta && SB.game.meta();
    return (m && m.veil) || null;
  }
  function points() { var v = veil(); return v ? (v.points || 0) : 0; }
  function opened() { var v = veil(); return (v && v.paths && v.paths.opened) || []; }
  function isOpen(id) { return opened().indexOf(id) >= 0; }

  /* 页签是否可以进：已掀幕（veil 非 null）才可。render.js 的页签灰态与 game.js 的
   * setTab 门都读这一个判据，不各自另写一份。 */
  function available() { return !!veil(); }

  /* ── 视图一：三张路径卡（帷幕主界面）────────────────────────────── */
  function hubMarkup() {
    var v = veil();
    var cnt = v ? (v.count || 1) : 0;
    var openedNum = opened().length;
    var h = '<div class="vh-inner">';
    h += '<header class="vh-hd"><div><h2>' + esc(tr('ui.veil.hub.title', '帷幕之后')) + '</h2>'
      + '<p class="vh-sub">' + esc(trp('ui.veil.hub.meta_line', { count: cnt, opened: openedNum },
          '第 ' + cnt + ' 重帷幕 · 已开启 ' + openedNum + ' / 3 条飞升路径')) + '</p></div>'
      /* 页签形态之后不再需要关闭按钮（页签本身就是导航），原位改为飞升点余额。 */
      + '<div class="vh-points"><span>' + esc(tr('ui.veil.hub.points_balance', '飞升点')) + '</span>'
      + '<b>' + points().toFixed(2) + '</b></div></header>';
    h += '<p class="vh-note">' + esc(tr('ui.veil.hub.note', '点击虚境升华卡片，可查看五个领域的赐福与剧情内容。')) + '</p>';
    h += '<div class="vh-cards">';
    PATHS.forEach(function (p) {
      var op = isOpen(p.id);
      var enterable = op && !p.wip;                 // wip 路径即使已开启也不放行
      var previewable = !!p.preview;
      var img = op && !previewable ? p.open : p.closed; // 预览卡始终保持未开放的门徽状态
      var previewNoticeKey = 'ui.veil.hub.preview.notice';
      var previewActionKey = 'ui.veil.hub.preview.action';
      var state = previewable
        ? '<p class="vh-card-state wip">' + esc(tr(previewNoticeKey, '')) + '</p>'
          + '<span class="vh-card-action">' + esc(tr(previewActionKey, '')) + '</span>'
        : p.wip
        ? '<p class="vh-card-state wip">' + esc(tr('ui.veil.hub.wip', '开发中 · 敬请期待')) + '</p>'
        : (op
            ? '<p class="vh-card-state on">' + esc(tr('ui.veil.hub.entered', '点击进入飞升操作界面')) + '</p>'
            : '<p class="vh-card-state">' + esc(tr('ui.veil.path.seal.' + p.id, p.seal)) + '</p>');
      h += '<button type="button" class="vh-card' + (enterable ? ' open' : (p.wip ? ' wip' : ' sealed')) + (previewable ? ' preview' : '') + '"'
        + (previewable ? ' data-veil-preview="' + p.id + '"' : ' data-veil-path="' + p.id + '"')
        + (enterable || previewable ? '' : ' disabled') + '>'
        + '<div class="vh-card-img" style="background-image:url(\'' + img + '\')"></div>'
        + '<div class="vh-card-body"><h3>' + esc(pathName(p)) + '</h3>'
        + '<p class="vh-card-focus">' + esc(tr('ui.veil.hub.focus.' + p.id, p.focus)) + '</p>'
        + state
        + '</div></button>';
    });
    h += '</div></div>';
    return h;
  }

  /* ── 视图二：某条路径的操作界面 ────────────────────────────────── */
  function organLevel(id) {
    var v = veil();
    return (v && v.paths && v.paths.organ && v.paths.organ[id]) || 0;
  }
  function byId(id) { for (var i = 0; i < ORGANS.length; i++) if (ORGANS[i].id === id) return ORGANS[i]; return null; }
  function pathById(id) { for (var i = 0; i < PATHS.length; i++) if (PATHS[i].id === id) return PATHS[i]; return null; }
  function pathName(p) { return p ? tr('ui.veil.path.name.' + p.id, p.name) : ''; }
  function geneNodeName(node) {
    return node ? tr('ui.veil.gene.node.' + node.id + '.name', '') : '';
  }
  function geneNodeDescription(node) {
    return node ? tr('ui.veil.gene.node.' + node.id + '.description', '') : '';
  }
  function geneNodes(branch) { return GENE_BRANCHES[branch] || GENE_BRANCHES.supreme; }
  function geneLevelCost(level) {
    return SB.veilFx && SB.veilFx.geneLevelCost ? SB.veilFx.geneLevelCost(level) : 0;
  }
  function geneNodeById(id, branch) {
    var nodes = geneNodes(branch || geneBranch);
    for (var i = 0; i < nodes.length; i++) if (nodes[i].id === id) return nodes[i];
    return null;
  }
  function geneNodeIconMarkup(node) {
    return node && node.icon ? '<img src="' + esc(node.icon) + '" alt="" draggable="false">' : '';
  }
  function geneNodeLevel(id, branch) {
    var b = branch || geneBranch, v = veil();
    var values = v && v.paths && v.paths.gene && v.paths.gene[b];
    var level = values && Number(values[id]);
    return isFinite(level) ? Math.max(0, Math.min(3, Math.floor(level))) : 0;
  }
  function geneLevelLabel(level) {
    return trp('ui.veil.gene.level', { level: level }, '');
  }
  function geneEffectText(node, level) {
    var values = node && node.values && node.values[level - 1];
    if (!values) return '';
    var fx = SB.veilFx || {};
    var bonus = fx.geneResonanceBonusPct ? Number(fx.geneResonanceBonusPct()) || 0 : 0;
    var mul = 1 + bonus / 100, effective = {};
    Object.keys(values).forEach(function (key) { effective[key] = Math.round(Number(values[key]) * mul); });
    return trp('ui.veil.gene.effect.' + node.id, effective, '');
  }
  function geneAmpNote(node, level) {
    if (level < 3 || !isOpen('si') || !node || ['valor', 'agility', 'longevity'].indexOf(node.id) < 0) return '';
    var bonus = SB.veilFx && SB.veilFx.geneResonanceBonusPct
      ? Number(SB.veilFx.geneResonanceBonusPct()) || 0 : 0;
    return trp('ui.veil.gene.effect.si_amplification', { value: Math.round(20 * (1 + bonus / 100)) }, '');
  }
  function geneResonanceStateLabel() {
    var fx = SB.veilFx || {};
    var bonus = fx.geneResonanceBonusPct ? Number(fx.geneResonanceBonusPct()) || 0 : 0;
    var state = bonus >= 100 ? 'harmony' : (bonus >= 50 ? 'incomplete' : 'imbalance');
    return tr('ui.veil.gene.resonance.state.' + state, '');
  }
  function geneResonanceStatusText() {
    var fx = SB.veilFx || {};
    var supreme = fx.geneInvestmentPoints ? Number(fx.geneInvestmentPoints('supreme')) || 0 : 0;
    var pure = fx.geneInvestmentPoints ? Number(fx.geneInvestmentPoints('pure')) || 0 : 0;
    var bonus = fx.geneResonanceBonusPct ? Number(fx.geneResonanceBonusPct()) || 0 : 0;
    return trp('ui.veil.gene.resonance.status', {
      state: geneResonanceStateLabel(), supremePoints: supreme, purePoints: pure, bonusPercent: bonus
    }, '');
  }
  function geneResonancePoints(branch) {
    var fx = SB.veilFx || {};
    return fx.geneInvestmentPoints ? Math.max(0, Number(fx.geneInvestmentPoints(branch)) || 0) : 0;
  }
  function geneResonanceVisualState(supreme, pure, bonus) {
    if (supreme > 0 && pure > 0 && Math.abs(supreme - pure) < 0.0001 && bonus >= 100) return 'is-harmony';
    if (supreme > pure) return 'is-supreme-leading';
    if (pure > supreme) return 'is-pure-leading';
    return 'is-dormant';
  }
  function geneBranchIconMarkup(branch) {
    if (branch === 'pure') {
      return '<svg class="gene-branch-icon gene-branch-icon-pure" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
        + '<path d="M13.8 2.2C7.2 2.2 3 5.1 3 9.3c0 2.4 1.6 4.2 3.9 4.2 4 0 6.1-4.2 6.9-11.3Z" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2"></path>'
        + '<path d="M3.4 13.5c2.3-2.6 4.8-4.6 8.7-8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2"></path></svg>';
    }
    return '<svg class="gene-branch-icon gene-branch-icon-supreme" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
      + '<path d="M8 1.8c-3.2 0-5.6 2.3-5.6 5.4 0 2.4 1.4 4.1 3.2 4.9v1.7h4.8v-1.7c1.8-.8 3.2-2.5 3.2-4.9 0-3.1-2.4-5.4-5.6-5.4Z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2"></path>'
      + '<path d="M8 2.4v9.3M5 5.5c1.3.1 2.2.6 3 1.5m3-1.5C9.7 5.6 8.8 6.1 8 7m-3 2.1c1.2 0 2.2.4 3 1.2m3-1.2c-1.2 0-2.2.4-3 1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width=".9"></path></svg>';
  }
  function geneTaijiMarkup(state) {
    var help = tr('ui.intro.help.tooltip', '');
    return '<button type="button" class="gene-resonance-trigger ' + state + '" data-gene-resonance-info'
      + ' aria-label="' + esc(geneResonanceStatusText()) + '" title="' + esc(help) + '" aria-haspopup="dialog" aria-controls="gene-resonance-dialog">'
      + '<svg class="gene-taiji-glyph" viewBox="0 0 32 32" aria-hidden="true" focusable="false">'
      + '<circle class="gene-taiji-pure" cx="16" cy="16" r="14"></circle>'
      + '<path class="gene-taiji-supreme" d="M16 2 A14 14 0 0 0 16 30 A7 7 0 0 0 16 16 A7 7 0 0 1 16 2 Z"></path>'
      + '<circle class="gene-taiji-pure-dot" cx="16" cy="9" r="2"></circle>'
      + '<circle class="gene-taiji-supreme-dot" cx="16" cy="23" r="2"></circle>'
      + '<circle class="gene-taiji-outline" cx="16" cy="16" r="14"></circle></svg></button>';
  }
  function geneNodeMarkup(node) {
    var level = geneNodeLevel(node.id), selected = geneSelected === node.id;
    var name = geneNodeName(node), slots = '';
    for (var i = 1; i <= 3; i++) slots += '<i' + (i <= level ? ' class="is-filled"' : '') + ' aria-hidden="true"></i>';
    var state = level > 0 ? geneLevelLabel(level) : tr('ui.veil.gene.node.unedited', '');
    return '<button type="button" class="gene-locus' + (selected ? ' is-selected' : '') + '"'
      + ' style="--gene-x:' + node.pos + '%;--gene-y:' + node.y + '%" data-gene-node="' + node.id + '" aria-pressed="' + (selected ? 'true' : 'false') + '"'
      + ' aria-label="' + esc(trp('ui.veil.gene.node.aria', { nodeName: name, level: level }, '')) + '">'
      + '<span class="gene-locus-core" aria-hidden="true">' + geneNodeIconMarkup(node) + '</span>'
      + '<span class="gene-locus-name">' + esc(name) + '</span>'
      + '<span class="gene-locus-ranks" aria-hidden="true">' + slots + '</span>'
      + '<span class="gene-locus-state">' + esc(state) + '</span></button>';
  }
  function geneMarkup(p) {
    var branch = geneBranch === 'pure' ? 'pure' : 'supreme';
    var supremePoints = geneResonancePoints('supreme'), purePoints = geneResonancePoints('pure');
    var resonanceBonus = SB.veilFx && SB.veilFx.geneResonanceBonusPct ? Number(SB.veilFx.geneResonanceBonusPct()) || 0 : 0;
    var resonanceVisualState = geneResonanceVisualState(supremePoints, purePoints, resonanceBonus);
    var nodes = geneNodes(branch), selectedNode = geneNodeById(geneSelected, branch) || nodes[0];
    var level = geneNodeLevel(selectedNode.id, branch), cost = level < 3 ? geneLevelCost(level) : 0;
    var branchDescription = tr('ui.veil.gene.branch.' + branch + '.description', '');
    var nodeDescription = geneNodeDescription(selectedNode);
    var level3Description = branch === 'supreme' && level >= 3
      ? tr('ui.veil.gene.node.' + selectedNode.id + '.level3', '') : '';
    var nodeMetaCopy = branch === 'supreme' && level >= 3
      ? tr('ui.veil.gene.node.' + selectedNode.id + '.meta', '') : '';
    var currentEffect = level > 0 ? geneEffectText(selectedNode, level) : tr('ui.veil.gene.node.unedited', '');
    var nextEffect = level < 3 ? geneEffectText(selectedNode, level + 1) : '';
    var currentAmpNote = geneAmpNote(selectedNode, level);
    var nextAmpNote = geneAmpNote(selectedNode, level + 1);
    var loci = '';
    nodes.forEach(function (node) { loci += geneNodeMarkup(node); });
    var h = '<div class="vm-box gene-path-box gene-' + branch + '"><div class="vm-hd">'
      + '<button type="button" class="vm-back" data-veil-action="back">← ' + esc(tr('ui.veil.hub.back', '返回帷幕')) + '</button>'
      + '<h2>' + esc(pathName(p)) + '</h2></div>'
      + '<div class="gene-demo-banner gene-points-banner"><div class="gene-resonance-summary">'
      + '<p class="gene-resonance-status">' + esc(geneResonanceStatusText()) + '</p>'
      + '</div>'
      + '<div class="gene-demo-balance">'
      + '<span>' + esc(tr('ui.veil.hub.points_balance', '')) + '</span><b>' + points().toFixed(2) + '</b></div></div>'
      + '<div class="gene-demo-layout" id="gene-demo-tabpanel" role="tabpanel" aria-labelledby="gene-tab-' + branch + '"><section class="gene-sequence-panel">'
      + '<div class="gene-branch-tabs"><nav class="gene-branch-tablist" role="tablist">'
      + '<button type="button" id="gene-tab-supreme" role="tab" aria-controls="gene-demo-tabpanel" class="gene-branch-tab' + (branch === 'supreme' ? ' is-active' : '') + '"'
      + ' aria-selected="' + (branch === 'supreme' ? 'true' : 'false') + '" data-gene-branch="supreme">'
      + geneBranchIconMarkup('supreme') + esc(tr('ui.veil.gene.branch.supreme', '')) + '</button>'
      + '<button type="button" id="gene-tab-pure" role="tab" aria-controls="gene-demo-tabpanel" class="gene-branch-tab' + (branch === 'pure' ? ' is-active' : '') + '"'
      + ' aria-selected="' + (branch === 'pure' ? 'true' : 'false') + '" data-gene-branch="pure">'
      + geneBranchIconMarkup('pure') + esc(tr('ui.veil.gene.branch.pure', '')) + '</button>'
      + '</nav>' + geneTaijiMarkup(resonanceVisualState) + '</div>'
      + '<p class="gene-branch-description">' + esc(branchDescription) + '</p>'
      + '<div class="gene-sequence" role="group" aria-label="' + esc(trp('ui.veil.gene.track.aria', { count: nodes.length }, '')) + '">'
      + '<img class="gene-sequence-art" src="assets/veil/gene-ascension-bg-v2.png" alt="" aria-hidden="true" draggable="false">'
      + '<div class="gene-loci">' + loci + '</div></div></section>'
      + '<aside class="gene-inspector" aria-live="polite"><div class="gene-inspector-head">'
      + '<span class="gene-inspector-mark" aria-hidden="true">' + geneNodeIconMarkup(selectedNode) + '</span><div><h3>'
      + esc(geneNodeName(selectedNode)) + '</h3><span class="gene-inspector-level">'
      + esc(level > 0 ? geneLevelLabel(level) : tr('ui.veil.gene.node.unedited', '')) + '</span></div></div>'
      + '<div class="gene-node-description"><p>' + esc(nodeDescription) + '</p>'
      + (level3Description ? '<p class="is-level3">' + esc(level3Description) + '</p>' : '') + '</div>'
      + (nodeMetaCopy ? '<p class="gene-node-meta">' + esc(nodeMetaCopy) + '</p>' : '')
      + '<div class="gene-effect-block is-current"><span class="gene-effect-heading">'
      + esc(tr('ui.veil.gene.effect.current', '')) + '</span><div class="gene-effect-row">'
      + '<span class="gene-effect-rank">' + esc(level > 0 ? geneLevelLabel(level) : '—') + '</span>'
      + '<div class="gene-effect-copy"><p>' + esc(currentEffect) + '</p>'
      + (currentAmpNote ? '<p class="gene-effect-note">' + esc(currentAmpNote) + '</p>' : '')
      + '</div></div></div>';
    if (level < 3) {
      h += '<div class="gene-effect-block is-next"><span class="gene-effect-heading">'
        + esc(tr('ui.veil.gene.effect.next', '')) + '</span><div class="gene-effect-row">'
        + '<span class="gene-effect-rank">' + esc(geneLevelLabel(level + 1)) + '</span>'
        + '<div class="gene-effect-copy"><p>' + esc(nextEffect) + '</p>'
        + (nextAmpNote ? '<p class="gene-effect-note">' + esc(nextAmpNote) + '</p>' : '')
        + '</div></div></div>'
        + '<button type="button" class="gene-demo-upgrade" data-gene-action="upgrade"'
        + (points() < cost ? ' disabled' : '') + '>'
        + esc(trp('ui.veil.gene.action.upgrade', { cost: cost }, '')) + '</button>';
    } else {
      h += '<div class="gene-max-state">' + esc(tr('ui.veil.gene.action.max', '')) + '</div>';
    }
    h += '</aside></div>'
      + '<dialog class="gene-resonance-dialog" id="gene-resonance-dialog" aria-labelledby="gene-resonance-title">'
      + '<div class="gene-resonance-dialog-card"><header class="gene-resonance-dialog-head"><h3 id="gene-resonance-title">'
      + esc(geneResonanceStatusText()) + '</h3><form method="dialog"><button type="submit" class="gene-resonance-close" autofocus>'
      + esc(tr('ui.action.close', '')) + '</button></form></header>'
      + '<div class="gene-resonance-dialog-stats ' + resonanceVisualState + '">'
      + '<div class="gene-resonance-stat is-supreme"><span>' + esc(tr('ui.veil.gene.branch.supreme', '')) + '</span><b>' + supremePoints + '</b></div>'
      + '<span class="gene-resonance-divider" aria-hidden="true"></span>'
      + '<div class="gene-resonance-stat is-pure"><span>' + esc(tr('ui.veil.gene.branch.pure', '')) + '</span><b>' + purePoints + '</b></div></div>'
      + '<p class="gene-resonance-dialog-rule">' + esc(tr('ui.veil.gene.resonance.rule', '')) + '</p>'
      + '</div></dialog></div>';
    return h;
  }
  function voidDomainLv(id) {
    return SB.voidFx && SB.voidFx.domainLv ? SB.voidFx.domainLv(id) : 0;
  }
  function voidLitCount() {
    return VOID_DOMAINS.reduce(function (count, domain) { return count + (voidDomainLv(domain.id) > 0 ? 1 : 0); }, 0);
  }
  function voidDomainById(id) {
    for (var i = 0; i < VOID_DOMAINS.length; i++) if (VOID_DOMAINS[i].id === id) return VOID_DOMAINS[i];
    return null;
  }
  function voidEffectParams(id, level) {
    var values;
    if (id === 'wither') {
      values = [30, 50, 70][level - 1];
      return { yieldPercent: values, startTide: values, startStardust: [3, 5, 7][level - 1] };
    }
    if (id === 'warlord') return { soldierPercent: [50, 100, 200][level - 1], fortressPercent: [20, 25, 30][level - 1] };
    if (id === 'pleasure') return { scribePercent: [50, 100, 200][level - 1], costSavePercent: [10, 20, 30][level - 1] };
    if (id === 'lore') return { scholarPercent: [50, 100, 200][level - 1], costSavePercent: [10, 20, 30][level - 1] };
    if (id === 'emperor' && level === 1) return {
      wonderName: tr('wonder.void_stamp_fortress.name'), stoneBeamCost: 1000, civicPercent: 100
    };
    if (id === 'emperor' && level === 2) return {
      wonderName: tr('wonder.void_candle_hall.name'), ironBracketCost: 1000, steelPartCost: 1000, sciencePercent: 100
    };
    return { wonderName: tr('wonder.void_mars_foundry.name'), thetaFilmCost: 1000, craftPercent: 200 };
  }
  function voidEffectText(id, level) {
    var key = id === 'emperor' ? 'domain.emperor.lv' + level + '.effect' : 'domain.' + id + '.effect';
    return trp(key, voidEffectParams(id, level), '');
  }
  function persistVoidMeta(meta) {
    if (meta && SB.state && SB.state.saveMeta) SB.state.saveMeta(meta);
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    if (SB.saveTransfer && SB.saveTransfer.backupSoon) SB.saveTransfer.backupSoon();
  }

  function organState(o) {
    var lv = organLevel(o.id);
    if (lv >= 3) return { k: 'max' };
    var cost = lvCost(lv);
    if (points() < cost) return { k: 'poor', cost: cost, diff: cost - points() };
    return { k: 'ready', cost: cost, lv: lv };
  }

  function organMarkup() {
    var h = '<div class="vo-rig-wrap"><div class="vo-left"><div class="vo-rig">'
      + '<img class="vo-body" src="assets/veil/si-organ/body.png" alt="潮汐机偶身体底图">';
    ORGANS.forEach(function (o) {
      var lv = organLevel(o.id);
      h += '<button type="button" class="vo-pt lv' + lv + (selectedOrgan === o.id ? ' sel' : '') + '"'
        + ' data-organ="' + o.id + '" style="left:' + o.x + '%;top:' + o.y + '%"'
        + ' title="' + esc(o.no + ' ' + o.full + ' · ' + (lv ? STAGES[lv - 1] : '未改造')) + '">'
        + '<span class="pi" style="background-image:url(' + o.img + ')"></span>'
        + '<span class="pn">' + o.no + '</span></button>';
    });
    h += '</div><div class="vo-progress">改造进度 <b>' + ORGANS.reduce(function (n, o) { return n + (organLevel(o.id) ? 1 : 0); }, 0) + ' / 10</b></div></div>';

    var o = byId(selectedOrgan) || ORGANS[0], st = organState(o), lv = organLevel(o.id);
    h += '<div class="vo-detail"><div class="vo-detail-hd"><h3>' + esc(o.no + ' · ' + o.full) + '</h3>'
      + '<span class="vo-part">' + esc(o.part) + '</span></div>';
    h += '<div class="vo-stages">';
    STAGES.forEach(function (s, i) {
      h += '<span class="vo-stage' + (lv > i ? ' done' : (lv === i ? ' cur' : '')) + '">' + s + '</span>';
    });
    h += '</div>';
    /* 三级效果**全部展开**（2026-11-17 用户要求：后面等级也要能看，不能锁住）。
     * 第一级与部位大图同排，其余整行；三种状态：
     *   i <  lv → 「· 已达成」   实线
     *   i === lv → 「· 当前 · 需 N 点」 虚线（next）
     *   i >  lv → 「· 未接枝 · 需 N 点」 虚线 + 淡态（dim，内容一字不少）
     * 价目直接写在卡头，玩家不必点下去才知道下一级多少钱。
     * 部位图 = assets/veil/si-organ/organ-NN-*.webp（512² 原图，132px 显示）。
     * ⚠️ 用 background-image 而不是 <img>：面板每 2 秒可能整块重写，<img> 会闪，背景图走缓存。 */
    var cards = '';
    for (var ci = 0; ci < 3; ci++) {
      var L = o.lv[ci];
      var cls = ci < lv ? '' : (ci === lv ? ' next' : ' dim');
      var tag = ci < lv ? ' · 已达成'
        : (ci === lv ? ' · 当前 · 需 ' + lvCost(ci) + ' 点' : ' · 未接枝 · 需 ' + lvCost(ci) + ' 点');
      var one = '<div class="vo-effect' + cls + '"><div class="vo-effect-hd">' + esc(STAGES[ci] + tag) + '</div>'
        + '<p>' + esc(L.d) + '</p></div>';
      if (ci === 0) {
        cards += '<div class="vo-art-row">'
          + '<div class="org-fig" style="background-image:url(\'' + o.img + '\')" title="' + esc(o.full) + '"></div>'
          + '<div class="vo-art-col">' + one + '</div></div>';
      } else {
        cards += one;
      }
    }
    h += cards;
    /* LV3 红字（v0.2 §4）：单句只在该部位归一（LV3）时显示，一字不改。 */
    if (lv >= 3) h += '<div class="vo-red">' + esc(o.red) + '</div>';
    h += '<div class="vo-actions"><span class="vo-cost">飞升点 <b>' + points().toFixed(2) + '</b></span>';
    var btnTxt = st.k === 'max' ? '已归一'
      : st.k === 'poor' ? ('飞升点不足（需 ' + st.cost + '）')
      : ('铆接 · ' + STAGES[lv] + '（' + st.cost + ' 点）');
    h += '<button type="button" class="vo-commit" data-veil-action="organ-buy"' + (st.k !== 'ready' ? ' disabled' : '') + '>' + esc(btnTxt) + '</button>'
      + '</div></div></div>';   // vo-actions / vo-detail / vo-rig-wrap
    return h;
  }

  function voidMapMarkup() {
    var preview = voidPreviewMode, lit = voidLitCount(), h = '<section class="void-map-panel' + (preview ? ' preview' : '') + '">'
      + '<div class="void-map-canvas">'
      + '<img class="void-map-art" src="assets/backgrounds/ascension-domains/realm-overview-art-v5.webp" alt="" aria-hidden="true" draggable="false">'
      + '<div class="void-map-lights" aria-hidden="true">';
    VOID_DOMAINS.forEach(function (domain) {
      h += '<img class="void-map-light' + (preview ? ' is-preview' : '')
        + ((preview && selectedVoidDomain === domain.id) || (!preview && voidDomainLv(domain.id) > 0) ? ' is-lit' : '')
        + '" src="' + domain.light + '" alt="" draggable="false">';
    });
    h += '</div><div class="void-space-grain" aria-hidden="true"></div>'
      + '<svg class="void-map-regions" viewBox="0 0 1671 941" preserveAspectRatio="none" role="group">';
    VOID_DOMAINS.forEach(function (domain) {
      var level = voidDomainLv(domain.id), active = preview || level > 0;
      var domainName = tr('domain.' + domain.id + '.name', '');
      h += '<path class="void-map-region lv' + level + (preview ? ' preview' : '') + (selectedVoidDomain === domain.id ? ' is-selected' : '') + '" d="' + domain.d + '"'
        + (active ? ' data-' + (preview ? 'void-preview-domain' : 'void-domain') + '="' + domain.id + '" role="button" tabindex="0" aria-pressed="' + (selectedVoidDomain === domain.id ? 'true' : 'false') + '" aria-label="' + esc(trp('ui.veil.void.domain.region.aria', { domainName: domainName }, '')) + '"' : ' aria-hidden="true"') + '>'
        + '</path>';
      if (active) h += '<text class="void-map-label' + (selectedVoidDomain === domain.id ? ' is-selected' : '') + '" x="' + domain.x + '" y="' + domain.y + '" aria-hidden="true">' + esc(domainName) + '</text>';
    });
    h += '</svg></div>';
    if (!preview) h += '<div class="void-map-caption">'
      + '<span>' + esc(trp('ui.veil.void.explore.progress', { lit: lit, total: VOID_DOMAINS.length }, '')) + '</span>'
      + '<span class="void-map-caption-points">' + esc(tr('ui.veil.hub.points_balance', '')) + ' <b>' + points().toFixed(2) + '</b></span>'
      + '</div>';
    h += '</section>';
    return h;
  }

  function voidExploreMarkup() {
    if (voidPreviewMode) return '';
    var lit = voidLitCount(), cost = 1;
    if (lit >= VOID_DOMAINS.length) return '';
    var afford = points() >= cost;
    var h = '<section class="void-explore-panel"><p>' + esc(tr('ui.veil.void.explore.hint', '')) + '</p>'
      + '<button type="button" class="void-explore-button" data-void-action="explore"'
      + (afford ? '' : ' disabled') + '>'
      + esc(trp('ui.veil.void.explore.button', { cost: cost }, '')) + '</button>';
    if (!afford) h += '<div class="void-insufficient">' + esc(trp('ui.veil.void.explore.insufficient', { cost: cost }, '')) + '</div>';
    return h + '</section>';
  }

  function voidDialogMarkup() {
    if (!voidDialog) return '';
    var domain = voidDomainById(voidDialog.domainId);
    if (!domain) return '';
    var id = domain.id, progress = voidDomainLv(id);
    var level = Math.max(1, Math.min(3, Number(voidDialog.viewLevel || voidDialog.level || 1)));
    var inspect = voidDialog.type === 'inspect';
    var metaLocked = level === 3 && progress < 3;
    var domainName = tr('domain.' + id + '.name', ''), npcName = tr('npc.' + id + '.name', '');
    var creedId = VOID_TENETS[id];
    var h = '<div class="void-dialog-scrim"><section class="void-dialog-card" role="dialog" aria-modal="true" aria-labelledby="void-dialog-title">'
      + '<img class="void-dialog-portrait" src="' + domain.portrait + '" alt="' + esc(trp('ui.veil.void.portrait.aria', { npcName: npcName }, '')) + '">'
      + '<div class="void-dialog-copy"><header class="void-dialog-heading"><div class="void-eyebrow">' + esc(domainName) + '</div><h3 id="void-dialog-title">'
      + esc(trp('ui.veil.void.dialog.title', { domainName: domainName, npcName: npcName, level: level }, '')) + '</h3>'
      + '</header>';
    if (inspect) {
      h += '<div class="void-dialog-tiers" role="group" aria-label="' + esc(domainName) + '">';
      for (var i = 1; i <= 3; i++) h += '<button type="button" class="void-dialog-tier' + (level === i ? ' is-active' : '')
        + '" data-void-tier="' + i + '" aria-pressed="' + (level === i ? 'true' : 'false') + '">'
        + esc(trp('ui.veil.void.domain.level', { level: i }, '')) + '</button>';
      h += '</div>';
    }
    h += '<div class="void-dialog-detail"><p class="void-dialog-text' + (metaLocked ? ' is-meta-locked' : (level === 3 ? ' is-meta-copy' : '')) + '">'
      + esc(metaLocked ? tr('ui.status.not_unlocked', '') : tr('domain.' + id + '.lv' + level + '.text', '')) + '</p>'
      + '<div class="void-dialog-effect">' + esc(voidEffectText(id, level)) + '</div>'
      + (level >= 3 && creedId ? '<div class="void-creed-note">' + esc(trp(progress >= 3 ? 'ui.veil.void.tenet.unlocked' : 'ui.veil.void.preview.tenet', {
        tenetName: tr('faith.tenet.' + creedId + '.name', '')
      }, '')) + (progress < 3 ? ' ' + esc(tr('faith.tenet.' + creedId + '.effect', '')) : '') + '</div>' : '')
      + '</div><footer class="void-dialog-actions">';
    if (!voidPreviewMode && inspect) {
      h += '<span class="void-cost-balance">' + esc(tr('ui.veil.hub.points_balance', '')) + ' <b>' + points().toFixed(2) + '</b></span>';
      if (progress >= 3) h += '<span class="void-max-level">' + esc(tr('ui.veil.void.level.max', '')) + '</span>';
      else {
        var nextLevel = progress + 1, cost = VOID_LEVEL_COST[progress], afford = points() >= cost;
        h += '<button type="button" class="void-level-button" data-void-action="upgrade" data-void-domain="' + id + '"' + (afford ? '' : ' disabled') + '>'
          + esc(trp(afford ? 'ui.veil.void.level.button' : 'ui.veil.void.level.insufficient', { level: nextLevel, cost: cost }, '')) + '</button>';
      }
    }
    h += '<button type="button" class="void-dialog-continue" data-void-action="dialog-continue">'
      + esc(tr('ui.veil.void.dialog.continue', '')) + '</button></footer></div></section></div>';
    return h;
  }

  function voidMarkup(p) {
    var h = '<div class="vm-box void-path-box"><div class="vm-hd">'
      + '<button type="button" class="vm-back" data-veil-action="back">← ' + esc(tr('ui.veil.hub.back', '返回帷幕')) + '</button>'
      + '<h2>' + esc(pathName(p)) + '</h2></div>'
      + (voidPreviewMode ? '<div class="void-preview-banner">' + esc(tr('ui.veil.hub.preview.notice', '')) + '</div>' : '')
      + '<div class="void-path-body' + (voidPreviewMode ? ' is-preview' : '') + '">'
      + voidMapMarkup() + '<aside class="void-aside">' + voidExploreMarkup() + '</aside>'
      + '</div>' + voidDialogMarkup() + '</div>';
    return h;
  }

  function pathMarkup(p) {
    var h = '<div class="vm-box"><div class="vm-hd">'
      + '<button type="button" class="vm-back" data-veil-action="back">← ' + esc(tr('ui.veil.hub.back', '返回帷幕')) + '</button>'
      + '<h2>' + esc(pathName(p)) + '</h2></div>';
    h += '<div class="vm-body">';
    if (p.id === 'si') h += organMarkup();
    else if (p.id === 'vo') return voidMarkup(p);
    else if (p.id === 'gn') return geneMarkup(p);
    else h += '<div class="vm-placeholder"><h3>' + esc(pathName(p)) + '</h3>'
      + '<p>' + esc(p.desc) + '</p><p class="vm-todo">该飞升路径的操作界面尚未实装，敬请期待。</p></div>';
    h += '</div></div>';
    return h;
  }

  /* render.js 的 PANES.veil 调这个：只回 HTML，不碰 DOM（写盘与重绘由 render 统一管）。 */
  function markup() {
    var p = view !== 'hub' ? pathById(view) : null;
    /* 视图指向的路径若已不存在/未开启（读档、掀幕重置），退回大厅，免得渲染空白。 */
    var isReadOnlyPreview = !!(p && p.preview && p.id === 'vo' && voidPreviewMode);
    if (view !== 'hub' && (!p || (!isReadOnlyPreview && (!isOpen(p.id) || p.wip)))) {
      view = 'hub'; voidPreviewMode = false; p = null;
    }
    return p ? pathMarkup(p) : hubMarkup();
  }

  /* 重绘：直接走 renderPanes —— 与其它页同一个入口（签名没变时它本身会跳过重写）。 */
  function repaint() { if (SB.ui.render && SB.ui.render.renderPanes) SB.ui.render.renderPanes(); }
  function focusVoidDialog() {
    var dialog = root.document && root.document.querySelector('.void-dialog-card');
    var selectedTier = dialog && dialog.querySelector('.void-dialog-tier.is-active');
    var target = selectedTier || (dialog && dialog.querySelector('.void-dialog-continue'));
    if (target && target.focus) target.focus();
  }
  function focusVoidDomain(id) {
    var region = root.document && id
      ? root.document.querySelector('[data-' + (voidPreviewMode ? 'void-preview-domain' : 'void-domain') + '="' + id + '"]') : null;
    if (region && region.focus) region.focus();
  }

  /* open() 保留原名（game.js 掀幕成功后调用）：现在等价于「切到帷幕页签」。 */
  function open() {
    if (!available()) return;
    view = 'hub'; voidPreviewMode = false; voidDialog = null;
    if (SB.game && SB.game.setTab) SB.game.setTab('veil');
    else repaint();
  }
  function openPath(id) {
    if (!isOpen(id)) return;
    var p = pathById(id);
    if (p && p.wip) return;                  // 开发中的路径禁止进入（卡片也常驻 disabled）
    voidPreviewMode = false;
    view = id;
    voidDialog = null;
    if (id === 'vo') selectedVoidDomain = firstLitVoidDomain();
    else if (id === 'si') selectedOrgan = 'gill';
    else if (id === 'gn' && !geneNodeById(geneSelected, geneBranch)) geneSelected = geneNodes(geneBranch)[0].id;
    repaint();
    if (id === 'vo' && root.document) {
      var target = root.document.querySelector('.void-explore-button:not([disabled])')
        || (selectedVoidDomain && root.document.querySelector('[data-void-domain="' + selectedVoidDomain + '"]'))
        || root.document.querySelector('.void-path-box .vm-back');
      if (target && target.focus) target.focus();
    }
  }
  function openPreview(id) {
    var p = pathById(id);
    if (!p || !p.preview) return;
    view = id; voidDialog = null;
    if (id === 'vo') {
      voidPreviewMode = true;
      selectedVoidDomain = VOID_DOMAINS[0].id;
      repaint();
      focusVoidDomain(selectedVoidDomain);
    }
  }
  function focusGeneNode(id) {
    var target = root.document && id
      ? root.document.querySelector('[data-gene-node="' + id + '"]') : null;
    if (target && target.focus) target.focus();
  }
  function selectGeneBranch(branch) {
    if (view !== 'gn' || (branch !== 'supreme' && branch !== 'pure')) return;
    geneBranch = branch;
    geneSelected = geneNodes(branch)[0].id;
    repaint();
    var target = root.document && root.document.querySelector('[data-gene-branch="' + branch + '"]');
    if (target && target.focus) target.focus();
  }
  function selectGeneNode(id) {
    if (view !== 'gn' || !geneNodeById(id, geneBranch)) return;
    geneSelected = id;
    repaint();
    focusGeneNode(id);
  }
  function buyGeneLevel() {
    if (view !== 'gn' || !isOpen('gn')) return false;
    var node = geneNodeById(geneSelected, geneBranch), v = veil();
    if (!node || !v) return false;
    var level = geneNodeLevel(node.id), cost = geneLevelCost(level);
    if (level >= 3 || points() < cost) return false;
    if (!v.paths.gene || typeof v.paths.gene !== 'object') v.paths.gene = {};
    if (!v.paths.gene[geneBranch] || typeof v.paths.gene[geneBranch] !== 'object') v.paths.gene[geneBranch] = {};
    v.points = Math.max(0, Math.round((Number(v.points) - cost) * 100) / 100);
    if (SB.veilFx && SB.veilFx.recordSpentPoints) SB.veilFx.recordSpentPoints(cost);
    v.paths.gene[geneBranch][node.id] = level + 1;
    var m = SB.game && SB.game.meta && SB.game.meta();
    if (m && SB.state && SB.state.saveMeta) SB.state.saveMeta(m);
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    repaint();
    var action = root.document && root.document.querySelector('[data-gene-action="upgrade"]');
    if (action && action.focus) action.focus();
    return true;
  }
  function back() { view = 'hub'; voidPreviewMode = false; voidDialog = null; repaint(); }
  /* 切走页签时回大厅：下次点「帷幕」总是先看到三条路径，而不是上次停留的装配台。 */
  function leave() { if (view !== 'hub') view = 'hub'; voidPreviewMode = false; voidDialog = null; }

  function buyOrgan() {
    var o = byId(selectedOrgan); if (!o) return;
    var v = veil(); if (!v) return;
    var lv = organLevel(o.id);
    if (lv >= 3) return;
    var cost = lvCost(lv);
    if (points() < cost) return;
    /* 原子：扣点 → 升级 → 立刻落盘。
     * ⚠️ 必须显式 saveMeta：meta 没有「每 tick 自动存」的通道（旧版这里只有 markDirty，
     *    买完器官直接关游戏，飞升点就白花了 —— 花的是跨周目货币，这笔不能靠运气）。 */
    v.points = points() - cost;
    if (SB.veilFx && SB.veilFx.recordSpentPoints) SB.veilFx.recordSpentPoints(cost);
    if (!v.paths.organ) v.paths.organ = {};
    v.paths.organ[o.id] = lv + 1;
    var m = SB.game && SB.game.meta && SB.game.meta();
    if (m && SB.state && SB.state.saveMeta) SB.state.saveMeta(m);
    SB.game.markDirty && SB.game.markDirty();
    repaint();
    SB.game.log && SB.game.log(tr('ui.veil.organ.done', null,
      o.no + ' ' + o.name + ' 已铆接至「' + STAGES[lv] + '」，消耗 ' + cost + ' 飞升点。'));
  }

  function firstLitVoidDomain() {
    for (var i = 0; i < VOID_DOMAINS.length; i++) if (voidDomainLv(VOID_DOMAINS[i].id) > 0) return VOID_DOMAINS[i].id;
    return null;
  }
  function exploreVoid() {
    if (!SB.voidFx || !SB.voidFx.playable || !SB.voidFx.playable() || !isOpen('vo') || points() < 1 || voidLitCount() >= VOID_DOMAINS.length) return false;
    var m = SB.game && SB.game.meta ? SB.game.meta() : null, v = veil();
    if (!m || !v || !v.paths) return false;
    if (!v.paths.void || typeof v.paths.void !== 'object' || Array.isArray(v.paths.void)) v.paths.void = {};
    if (!v.paths.void.domains || typeof v.paths.void.domains !== 'object' || Array.isArray(v.paths.void.domains)) v.paths.void.domains = {};
    var remaining = VOID_DOMAINS.filter(function (domain) { return voidDomainLv(domain.id) === 0; });
    if (!remaining.length) return false;
    var random = SB.rng ? Number(SB.rng()) : Math.random();
    if (!(random >= 0 && random < 1)) random = 0;
    var domain = remaining[Math.floor(random * remaining.length)];
    v.points = points() - 1;
    if (SB.veilFx && SB.veilFx.recordSpentPoints) SB.veilFx.recordSpentPoints(1);
    v.paths.void.domains[domain.id] = 1;
    selectedVoidDomain = domain.id;
    voidDialog = { domainId: domain.id, level: 1, viewLevel: 1, type: 'unlock' };
    persistVoidMeta(m);
    repaint();
    var continueButton = root.document && root.document.querySelector('.void-dialog-continue');
    if (continueButton && continueButton.focus) continueButton.focus();
    return true;
  }
  function buyVoidLevel(id) {
    var domain = voidDomainById(id), v = veil(), m = SB.game && SB.game.meta ? SB.game.meta() : null;
    if (!SB.voidFx || !SB.voidFx.playable || !SB.voidFx.playable() || !domain || !isOpen('vo') || !v || !v.paths || !m) return false;
    var level = voidDomainLv(id);
    if (level < 1 || level >= 3) return false;
    var cost = VOID_LEVEL_COST[level];
    if (points() < cost) return false;
    v.points = points() - cost;
    if (SB.veilFx && SB.veilFx.recordSpentPoints) SB.veilFx.recordSpentPoints(cost);
    if (!v.paths.void || typeof v.paths.void !== 'object' || Array.isArray(v.paths.void)) v.paths.void = {};
    if (!v.paths.void.domains || typeof v.paths.void.domains !== 'object' || Array.isArray(v.paths.void.domains)) v.paths.void.domains = {};
    v.paths.void.domains[id] = level + 1;
    selectedVoidDomain = id;
    voidDialog = { domainId: id, level: level + 1, viewLevel: level + 1, type: 'unlock' };
    persistVoidMeta(m);
    repaint();
    var continueButton = root.document && root.document.querySelector('.void-dialog-continue');
    if (continueButton && continueButton.focus) continueButton.focus();
    return true;
  }
  function closeVoidDialog() {
    if (!voidDialog) return;
    voidDialog = null;
    repaint();
    focusVoidDomain(selectedVoidDomain);
  }
  function inspectVoidDomain(id) {
    var domain = voidDomainById(id), level = domain ? voidDomainLv(id) : 0;
    if (!domain || (!voidPreviewMode && level <= 0)) return false;
    selectedVoidDomain = id;
    voidDialog = { domainId: id, level: level, viewLevel: level || 1, type: 'inspect' };
    repaint();
    focusVoidDialog();
    return true;
  }

  /* 事件委托：绑在 document（pane 每 2 秒可能整块重写，直绑 onclick 会失效）。 */
  function onClick(e) {
    var t = e.target && e.target.closest ? e.target : (e.target && e.target.parentElement);
    if (!t || !t.closest) return;
    var resonanceDialog = t.closest('.gene-resonance-dialog');
    if (resonanceDialog && t === resonanceDialog && resonanceDialog.open) {
      resonanceDialog.close(); e.stopPropagation(); return;
    }
    var act = t.closest('[data-veil-action]');
    if (act) {
      var a = act.getAttribute('data-veil-action');
      if (a === 'back') { back(); e.stopPropagation(); return; }
      if (a === 'organ-buy') { buyOrgan(); e.stopPropagation(); return; }
    }
    var voidAct = t.closest('[data-void-action]');
    if (voidAct) {
      var va = voidAct.getAttribute('data-void-action');
      if (va === 'explore') exploreVoid();
      else if (va === 'upgrade') buyVoidLevel(voidAct.getAttribute('data-void-domain'));
      else if (va === 'dialog-continue') closeVoidDialog();
      e.stopPropagation();
      return;
    }
    var resonanceInfo = t.closest('[data-gene-resonance-info]');
    if (resonanceInfo && view === 'gn') {
      var infoDialog = root.document && root.document.getElementById('gene-resonance-dialog');
      if (infoDialog && !infoDialog.open && infoDialog.showModal) infoDialog.showModal();
      e.stopPropagation();
      return;
    }
    var geneAction = t.closest('[data-gene-action]');
    if (geneAction && view === 'gn') {
      if (geneAction.getAttribute('data-gene-action') === 'upgrade') buyGeneLevel();
      e.stopPropagation();
      return;
    }
    var geneBranch = t.closest('[data-gene-branch]');
    if (geneBranch && view === 'gn') {
      selectGeneBranch(geneBranch.getAttribute('data-gene-branch'));
      e.stopPropagation();
      return;
    }
    var geneNode = t.closest('[data-gene-node]');
    if (geneNode && view === 'gn') {
      selectGeneNode(geneNode.getAttribute('data-gene-node'));
      e.stopPropagation();
      return;
    }
    var tier = t.closest('[data-void-tier]');
    if (tier && voidDialog) {
      var selectedLevel = Number(tier.getAttribute('data-void-tier'));
      if (selectedLevel >= 1 && selectedLevel <= 3) {
        voidDialog.viewLevel = selectedLevel;
        repaint();
        focusVoidDialog();
      }
      e.stopPropagation();
      return;
    }
    var previewDomain = t.closest('[data-void-preview-domain]');
    if (previewDomain && view === 'vo' && voidPreviewMode) {
      inspectVoidDomain(previewDomain.getAttribute('data-void-preview-domain'));
      e.stopPropagation(); return;
    }
    var voidDomain = t.closest('[data-void-domain]');
    if (voidDomain && view === 'vo') {
      var voidId = voidDomain.getAttribute('data-void-domain');
      if (voidDomainLv(voidId) > 0) inspectVoidDomain(voidId);
      e.stopPropagation();
      return;
    }
    var pt = t.closest('[data-organ]');
    if (pt && view !== 'hub') { selectedOrgan = pt.getAttribute('data-organ'); repaint(); e.stopPropagation(); return; }
    var previewCard = t.closest('[data-veil-preview]');
    if (previewCard && view === 'hub') { openPreview(previewCard.getAttribute('data-veil-preview')); e.stopPropagation(); return; }
    var card = t.closest('[data-veil-path]');
    if (card && view === 'hub') { openPath(card.getAttribute('data-veil-path')); e.stopPropagation(); return; }
  }
  function onKeydown(e) {
    if (voidDialog) {
      if (e.key === 'Escape') { e.preventDefault(); closeVoidDialog(); return; }
      if (e.key === 'Tab') {
        var dialog = root.document && root.document.querySelector('.void-dialog-card');
        var focusable = dialog ? dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') : [];
        if (!focusable.length) { e.preventDefault(); return; }
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && (e.target === first || !dialog.contains(e.target))) {
          e.preventDefault(); last.focus(); return;
        }
        if (!e.shiftKey && (e.target === last || !dialog.contains(e.target))) {
          e.preventDefault(); first.focus(); return;
        }
      }
    }
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var t = e.target && e.target.closest ? e.target.closest('[data-void-domain], [data-void-preview-domain]') : null;
    if (!t || view !== 'vo') return;
    e.preventDefault();
    var id = t.getAttribute('data-void-preview-domain') || t.getAttribute('data-void-domain');
    if ((voidPreviewMode && t.hasAttribute('data-void-preview-domain')) || (!voidPreviewMode && voidDomainLv(id) > 0)) {
      inspectVoidDomain(id);
    }
  }

  function install() {
    if (root.__veilHubInstalled) return;
    root.__veilHubInstalled = true;
    document.addEventListener('click', onClick, false);
    document.addEventListener('keydown', onKeydown, false);
    UI.veilHub = {
      available: available, open: open, openPath: openPath, back: back, leave: leave,
      markup: markup, render: repaint,
      isOpen: isOpen, opened: opened, view: function () { return view; },
      PATHS: PATHS, ORGANS: ORGANS
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
