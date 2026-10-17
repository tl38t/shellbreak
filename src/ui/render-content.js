/* 天壳 / SHELLBREAK — 纯展示文案与素材路径
 * 不包含玩法数值，也不依赖渲染闭包；由 render.js 在运行时读取。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};

  SB.ui.renderContent = {
    BUILDING_FLAVOR: {
      kelp:        '海底热泉泛着微红的光，有暗青的海藻在其旁飘荡…',
      nest:        '热泉水流过珊瑚缝隙，流过两名鲛人的家。',
      coralhouse:  '更牢固的材料足以支撑起更大的空间。',
      siltpit:     '幽深的海床上裸露着可用的金属矿物，将其收集起来或许能派上用场。',
      hall:        '鲛人们需要一栋独立的建筑用来议事，协调事宜。',
      weir:        '用金属构成的导流槽可以将热泉附近的温暖海水导向更远的地方。',
      warmnest:    '鲛人引导着深海的鱼群，作为藻食之外的补充。',
      kelpstore:   '将藻食固定在珊瑚架上整齐摆放，可以存储更多。',
      ballast:     '正因是在水中，才更应让囤积的物资都各有归处。',
      workshop:    '敲打与锻铸声自此不断，一条条加工线在此汇成工业的雏形。',
      furnace:     '热即文明，若能将散发光热的暖石进一步加以利用……',
      library:     '「热泉利藻」、「存藻耐寒」……零散的知识刻上壁面，供代代鲛人记诵。',
      lighthouse:  '灯火刺穿深海的黑潮，鲛人的文明不必再局限于热泉周边。',
      institute:   '旧日的知识，将之串联，再加以研究。',
      square:      '广场中心的石碑上不只有书手们刻录的政令，也有二手房售卖信息。',
      temple:      '虔诚的鲛人在此吟唱敬神的潮歌，希冀不受不受俗世的烦忧。',
      hydroturbine:'热力让管道内低沸点的生物流质迅速沸腾起来，推动钢铁连杆，可用于各式机器。',
      hydroshop:   '依赖于高炉的热量与热液能推动的锻锤，可以生产比精铁更坚硬的钢材。',
      canal:       '人工潮道把家乡与远方连成一线，水流推动着旅人与货物前行。',
      observatory: '鲛人将楔钉深深打入天壳之中，将轻便的钢架建筑固定在天壳上，以便随时观测记录天壳的状态。',
      coralfarm:   '特殊选育的珊瑚虫能够在合适的区域快速构造可用于生产的珊瑚林。',
      bank:        '信用，商人，与资本的美好时光。',
      caravanserai:'依赖于越来越多的灯塔与维护良好的潮道，鲛人商队已不再局限于一日可达的距离。',
      museum:      '旧日文明的造物被陈列在架上。',
      hotforge:    '依靠热液能运行的自动设备为传统工艺带来了变革之风。',
      school:      '教育大众化的标志，从此知识不再永远为血统与幸运所把控。',
      theater:     '穹顶之下，歌声回荡。',
      tenement:    '层层叠起的居所塞进更多鲛人，但，代价是什么呢？'
    },
    TECH_FLAVOR: {
      writing:    '「Ⅰ代表今天，Ⅰ•代表明天，•Ⅰ则是昨天，这就是我们最早的文字。」——后世的教科书',
      coralcut:   '「我们必须假设在漆黑的海底采凿珊瑚是幸福的，不然又哪来如今的文明？」',
      quarry:     '「西\'西弗斯将石头在海床上滚啊滚……」——鲛人神话',
      plant:      '「仓廪实而知礼节。」——《史记》',
      calendar:   '「此处记述了如何，一切处于悬止，一切平静，处于静默，一切静止，寂静。而天穹的领域是空洞的。」——《波波尔•乌》',
      scholarT:   '「历史自此始。」',
      herd:       '「如果天壳之上没有鱼群，那我死后想到鱼群洄游的地方去。」',
      tiddivine:  '「……占潮师们被认为是最早的学者……」——《鲛人科学史》',
      mining:     '「矿镐敲击在岩石上，发出喀锵、喀锵的声音……」<br>「导演，那时还没有金属工具。」',
      masonry:    '「幸好，暗流纪还不存在公摊面积这个概念。」——联邦笑话一则',
      bronze:     '「武器交击，发出喀锵、喀锵的声音……」<br>「导演，都说了那时还没有金属工具。」',
      thermal:    '「渊海水暖藻先知。」',
      lighting:   '「啊啊，法的世界充满光芒。」',
      ironwork:   '「……利用热泉的热量，我们用散落在海床上的金属矿石炼出了铁……」',
      navigation: '「他离开了灯塔所能照亮的范围，从此再也没有任何人见过他。」',
      horsemanship:'「白马非马，海马亦马。」',
      engineeringT:'「东西没坏，就别去修它。」',
      mathematics:'「我想到了一个美妙的证法，但我手酸了，实在刻不动潮纹了……」——费\'洛萨马',
      scaffoldT:  '「修建圣泰坦尼克修道院，足足历时三百年，而毁坏，却不过只是按下发射电钮的一瞬间。」',
      apprentice: '「一年打杂，三年帮师，十年功成。」',
      horseshoe:  '「夹紧马腹，皇帝陛下！」——鲛人喜剧《最后之日》',
      metalrefine:'「瓦\'特拉欧看到热泉周边的海水沸腾，腾起的气泡甚至冲开了岩石……」——《鲛人科学史》',
      education:  '「论文可以发表，但切记勿要署老师我的名。」',
      castle:     '「故上兵伐谋，其次伐兵，其下攻城。」',
      shellwatch: '「上至天壳，下至海渊。」',
      printing:   '「……而太阳报的读者，他们只关心第三版……」',
      physics:    '「……物理学的先咸们首次发现，存在着一种没有水的真空状态，而他们为此感到恐惧……」——《鲛人科学史》',
      banking:    '「……若银行控制了国家，便会撕下『服务生产』的面具，体现出高利贷的野蛮本性……」',
      thermo:     '「生命以负熵为食。」',
      invert:     '「逆向而行的两个世界。」',
      industrialize:'「工业不是老师傅与几个小学徒的童话故事，它是一门复杂的学问。」',
      pubedu:     '「学校里的学生？还是流水线上的产品？抱歉，工业更青睐后者。」',
      abyssgeo:   '「矿镐敲击在钛矿上，发出喀锵、喀锵的声音……」<br>「导演，那时候已经不用矿镐了。」',
      highthermo: '「嗡嗡——」',
      shellgeo:   '「地质学是关于压力与时间的研究，简而言之就是如此。」',
      skydrill:   '「永别了，牢笼。」'
    },
    /* 市政文案：与 TECH_FLAVOR 同口径，放在同一份纯展示文案文件里，
     * 由 render-info.js 的 showTreeDetail 在市政详情「效果」段之后渲染（class=b-flavor）。
     * 文案格式沿用「」引文，与科技文案视觉一致；不碰任何数值/平衡。 */
    CIVIC_FLAVOR: {
      laws:         '「无有规矩，不成方圆。」',
      craft:        '「如果没有一份丰厚的家产在等你继承，那你最好还是学一门手艺。」',
      mystic:       '「……那时的鲛人通常将无法理解的事物当作神明的意志……」——《鲛人科学史》',
      trade:        '「……商人既不创造价值，也不创造剩余价值，只是对它们的实现起中介作用……」',
      drama:        '「……如果天命攸归，出于对国家与国民的责任感，我不得不登上王位……」——鲛人喜剧《最后之日》',
      theology:     '「天壳之外的神明见水是好的，便用水包裹住了整个世界……」——《创湿纪》',
      records:      '「历史是由胜利者书写的，至少是当下的胜利者。」',
      political:    '「政治是可能性的艺术。」',
      sovereign:    '「世俗之城源于爱自己，上帝之城源于爱上帝。」',
      feudalism:    '「我封臣的封臣不是我的封臣，我……」',
      market:       '「让你父亲带你到集市上去看看吧，有吉普赛人的摊位在展览冰块。」',
      guild:        '「……同业行会的精神，如嫉妒陌生人，厌恶招收学徒，不愿透露本行业的秘密……」——《国富论》',
      department:   '「不好意思，这个事情不归我们部门负责。」',
      explore:      '「热泉、矿井、珊瑚林……他们现在与将来，都是卡\'嘶蒂利亚国王的财产。」',
      reformed:     '「圣座若要建筑他的教堂，为何不用自己的钱，而要用贫穷信徒的钱呢？」',
      mercantilism: '「金银生于天地之间，若以人作比，就如同骨骼一般……金银就是天地的骨骼。」',
      enlightenment:'「我们应当尊敬的，是凭真理的力量统治人心的人，而不是依靠暴力奴役的人。」',
      historiography:'「鲛人从历史中学到的唯一教训，就是鲛人不可能从历史中学到任何教训。」',
      sharksong:    '「啦——啦——啦唻耶——当天壳破碎之时——」',
      rationing:    '「不，不，导演，那个时候还没有外卖——我是说，你不能让一个冷焰纪的贵族点外卖。」',
      socialscience:'「鲛人的本质是与之相关的一切社会关系的总和。」',
      urbanization: '「大都市是人类邪恶本性的渊薮。」',
      mobilization: '「任何人不得找人顶替自己被征发的服役，公职人员须坚守岗位。」——《全民皆兵法令》'
    }
  };
  SB.ui.renderContent.WONDER_ART = {
    wonder_tide_stele: 'assets/wonders/icons-demo-v1/tide-stele.png',
    wonder_great_lighthouse: 'assets/wonders/icons-demo-v1/great-lighthouse.png',
    wonder_great_library: 'assets/wonders/icons-demo-v1/great-tide-archive.png',
    /* generated-v2 这批详情图已转webp（1254² → 880²，q=0.85）：
     * 原 PNG 10 张共 31.7MB ⇒ webp 10 张共 2.5MB，省 29MB。
     * 降采样依据：详情浮层 max-width 440px（css/10-tech-tree.css:109），880 = 2× 高清屏已足。
     * 画质已用 headless Chrome 在 420px 实际显示尺寸下左右对比验收，肉眼无差异。*/
    wonder_albada: 'assets/wonders/generated-v2/wonder-albada.webp',
    wonder_stt_abbey: 'assets/wonders/generated-v2/wonder-stt-abbey.webp',
    wonder_grand_bazaar: 'assets/wonders/generated-v2/wonder-grand-bazaar.webp',
    wonder_grand_exchange: 'assets/wonders/generated-v2/wonder-grand-exchange.webp',
    wonder_shellcutter: 'assets/wonders/generated-v2/wonder-shellcutter.webp',
    wonder_luluka: 'assets/wonders/generated-v2/wonder-luluka.webp',
    wonder_presspipe: 'assets/wonders/generated-v2/wonder-presspipe.webp',
    wonder_skydrill: 'assets/wonders/icons-demo-v1/sky-drill.png',
    wonder_olo_wa_cathedral: 'assets/wonders/generated-v2/wonder-olo-wa-cathedral.webp',
    wonder_shadow_theater: 'assets/wonders/generated-v2/wonder-shadow-theater.webp',
    wonder_congress: 'assets/wonders/generated-v2/wonder-congress.webp'
  };
  SB.ui.renderContent.WONDER_FLAVOR = {
    wonder_tide_stele: '第一道潮纹被刻进石碑，也把工匠们共同的尺度留给了后来者。',
    wonder_great_lighthouse: '灯火穿过深海的黑潮，为远礁航线标出一条不会熄灭的路。',
    wonder_great_library: '每一道潮纹都是一次记忆，散落在各巢穴的知识终于重新汇成文明。',
    wonder_albada: '热液喷口旁的学者记录矿脉、人口与压力，第一次把经验写成定律。',
    wonder_stt_abbey: '在最深的静水里，诵唱声让每一项新知识都有了回响。',
    wonder_grand_bazaar: '来自不同巢穴的商队在这里交换盐、光与故事，价格也开始拥有方向。',
    wonder_grand_exchange: '一座真正的城市，需要一张能让远方货物汇流的桌面。',
    wonder_shellcutter: '天壳不再只是头顶的禁忌，它被测量、标记，最后被当成工程来处理。',
    wonder_luluka: '卢卢卡的炉火昼夜不熄，旧工艺在这里被拆开，再装成更大的机器。',
    wonder_presspipe: '高压热液沿着管道奔涌，把深海最猛烈的热量送到每一座工坊。',
    wonder_skydrill: '当钻头第一次触到天壳，所有关于终点的传说都变成了倒计时。',
    wonder_shadow_theater: '舞台让城市学会共同想象；散落的声音，终于有了同一片穹顶。',
    wonder_congress: '争论被写进石墙，决定被交给所有愿意留下的人。'
  };

  /* 2026-10-05 系统指引：页签「?」按钮点击后弹出的简介（def=定义，step=第一步）。
   * 内容覆盖全部页签（village/folk/tech/civic/faith/workshop/wonder/meta）。
   * ⚠️ 纯 UI 文案，不碰任何数值/平衡；钥匙 key 与 index.html 里 onclick="SB.ui.openIntro('KEY')" 一一对应。 */
  SB.ui.renderContent.INTRO = {
    village: { icon:'🏝️', ttl:'这是什么 · 巢穴',
      def:'你的居所与基础产能中心：手点采集<b>藻食</b>/<b>珊瑚</b>，建<b>住房</b>扩人口，建解锁后续系统的关键建筑（议事厅/工坊/藻场）。',
      step:'第一步：先手点「采珊瑚」攒够资源，建起礁口巢——人口上限从 1 升到 3，才有空位生人。' },
    folk: { icon:'👥', ttl:'这是什么 · 族民',
      def:'人口与职业层：族民吃<b>藻食</b>、住<b>住房</b>，被分配去采集/建造/科研等职业线，驱动各类产出。',
      step:'第一步：人口顶到上限就建更多住房；藻食见底先扩藻场，否则会饿死。' },
    tech: { icon:'🔬', ttl:'这是什么 · 科技',
      def:'文明的科技树：按纪元推进，研究项解锁<b>建筑</b>、<b>资源线</b>与后续系统；每清完一个纪元的关键节点就推进到下一纪元。',
      step:'第一步：攒够科技点，研究最左边已揭示的项；右侧暗着的是本纪元尚未到时点的科技。' },
    civic: { icon:'📜', ttl:'这是什么 · 市政',
      def:'文明的「规则层」：<b>政体</b>决定被动与卡槽配方，<b>政策卡</b>填进卡槽给即时增益，<b>市政树</b>解锁更多卡与建筑。',
      step:'第一步：先研究《法典》开启「酋邦制」政体；完成市政树条目解锁对应政策卡。' },
    faith: { icon:'🕯️', ttl:'这是什么 · 信仰',
      def:'信仰系统：研究《神学》后开放，<b>信仰点</b>（存量/速率）驱动宗教加成与鼓舞效果。',
      step:'第一步：研究《神学》开启本页；之后靠赞美/仪式累积信仰点来驱动加成。' },
    workshop: { icon:'🔨', ttl:'这是什么 · 工坊',
      def:'把原料加工成进阶物资：<b>青铜工具</b>是买断的永久增益，<b>工艺制作</b>是反复制造的产出线。',
      step:'第一步：先在「巢穴」页把工坊建起来；建成后在「青铜工具」里挑第一条线买下。' },
    wonder: { icon:'🏛️', ttl:'这是什么 · 奇观',
      def:'大型工程项目：耗巨量资源建成，给<b>全局强增益</b>或解锁终局机制（如天穹钻机）。',
      step:'第一步：攒齐奇观所需石梁/精铁等，在巢穴页动工；建成后效果全局生效。' },
    'star-map': { icon:'✦', ttl:'这是什么 · 星图',
      def:'破壳后解锁的本周目探索视图。这里展示欧罗巴、土星，以及本周目已经发射的卫星和空间站。',
      step:'凿穿天壳后打开星图。开启新周目时，星图重新锁定，发射记录清空。' },
    'star-dome': { icon:'🌌', ttl:'这是什么 · 星穹商店',
      def:'跨周目局外资源层（ERA7）：<b>星屑</b>只在周目结算时发放，攒够可在本店换超古代科技等奖励（商品设计中）。',
      step:'第一步：先建成首座太空建筑（轨道卫星）开启本页；之后每个周目结算都会进账星屑。' },
    meta: { icon:'♻️', ttl:'这是什么 · 轮回商店',
      def:'跨周目成长层：<b>破壳结算</b>给轮回点，在商店换永久增益（起始／门槛／效率三类）。',
      step:'第一步：先推进到第一次破壳结算；拿到轮回点后回到本页挑最贵的「门槛减免」类。' },
    company: { icon:'🏢', ttl:'这是什么 · 公司',
      def:'文明的经济实体层（ERA6 市政《宏观经济学》解锁）：系统<b>自动成立</b>藻食与珊瑚两家公司，' +
        '随成立时间从<b>乡镇</b>成长为<b>地方</b>、<b>全国</b>企业，提供对应资源产出加成，' +
        '同时恒增 10% 奢侈品消耗。',
      step:'第一步：研究《宏观经济学》开启本页；之后看两家公司随时间自动升级，无需手动操作。' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
