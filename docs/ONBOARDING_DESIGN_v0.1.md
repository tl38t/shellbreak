# 天壳 / SHELLBREAK — 新手引导设计文档 v0.1（B 档定稿方案 · 走查脚本版）

> 状态:**已实装**(2026-10-25)。档位 = **B**;欢迎语 + 首局 10 步走查脚本按用户口述定稿落地。
> 关联:现有「解锁叙事」`src/game.js` `maybeTabUnlockPopups`(581) / `queueStory`(395)。
> 决策(2026-10-25):**做 B**;**设置里可关闭**;**欢迎语 + 首局走查脚本由用户口述定稿**。

---

## 〇、决策记录

- 档位:**B**(首入欢迎 + 首局走查脚本:按真实操作顺序逐步高亮关键 UI + 标签文案 + 跳过确认)。
- **设置可关闭**:开关走 `localStorage['shellbreak.onboarding']`('1'/'0',默认开),与 `uiTheme`/`uiResolution` 同模式,不进周目存档;另 `meta.onboardSeen`(跨周目一次性)记「已播过」。
- A(极简无脚本)、C(含数值微调)暂不做。

---

## 一、设计原则(铁律)

1. **引导 ≠ 解锁叙事,职责分离。** 现有 `maybeXxxPopup` 是系统解锁那一刻的鲛人 lore(用户 2026-09-26 删解释正文,game.js:435)。本走查脚本是首局操作教学层,两者并存、互不调用。
2. **非阻塞 + 可跳过。** 每步高亮是浮层标签(带 ✕),点 ✕ 弹「是否跳过新手教程?」确认后整体终止并置 `meta.onboardSeen`。不暂停产出、不强制点。
3. **两个「关闭」概念分离**(§2.1)。
4. **移动端优先(390px + 触屏)**:高亮环 / 标签零 hover 依赖;标签用常显浮层或底部 sheet;✕ 常显。
5. **B 不动 `config.js` / 科技 / 市政 / 数值** ⇒ 无需标定。
6. **e2e 不漂。** `node --max-old-space-size=8192 sim/e2e.mjs` 1230/1243。脚本引擎:无 DOM 早退;`meta.onboardSeen` e2e 默认真 ⇒ 零影响;推进条件是纯字段读取,可单测。

---

## 二、B 档完整方案

### 2.1 两个「关闭」概念

| 概念 | 存储 | 语义 | 谁写 |
|---|---|---|---|
| **设置开关** `onboardingEnabled` | `localStorage['shellbreak.onboarding']` | 玩家偏好:要不要引导 | 设置页开关 |
| **已展示标记** `meta.onboardSeen` | `meta.onboardSeen`(跨周目永久,参照 `religionSeen` game.js:601) | 本安装已完整播过,二周目不 nag | 脚本结束 / 跳过时 |

**门控**:`start()` 先查 `!onboardingEnabled()` 再查 `meta.onboardSeen`,都不拦才从步骤 1 开始;任一步的 ✕ → 确认跳过 → 置 `meta.onboardSeen` 并终止。

### 2.2 首局走查脚本(用户定稿流程)

> 状态机:当前步 `step` + 每步「推进条件」(纯状态读取)。主循环泵(2s)与关键动作回调后各评估一次推进条件;条件满足即前进到下一步并重新高亮。
> **健壮性**:推进条件都是幂等状态检查,玩家若乱序操作(如先建礁口巢),脚本仍按真实状态流动,只是高亮顺序可能跳过已满足步——不会卡死。
> **每步标签**均带 ✕ 关闭钮 → 点 ✕ 弹确认「是否跳过新手教程?」。

| # | 触发(进入此步) | 高亮目标(选择器) | 标签文案 | 推进条件(离开此步) |
|---|---|---|---|---|
| 1 | 欢迎层点「开始探索」 | 采藻食按钮 `[data-gather="kelp"]`(render-pane-village.js:63) | 手动采集一些藻食 | 藻食高于进入本步时的基线快照(`kelpBase`,初始库存可能非 0,点一次即过;乱序建成藻场也会自然推进) |
| 2 | 步1达成 | 深海藻场 `[data-build="kelp"]`(整行 `.bld-row`) | 建造深海藻场，自动生产藻食 | `s.lvl.kelp >= 1`(升 1 级) |
| 3 | 步2达成 | 族民页签 `[data-tab="folk"]` | 分配族民工作 | 玩家点开族民页(或 `setTab('folk')`) |
| 4 | 步3达成(族民页已开) | 采集者加号 `.folk-job-row[data-job-row="gather"] .folk-job-controls button:last-child` | 将族民分配至采集工作，快速获取藻食 | `s.jobs.gather > 0` |
| 5 | 步4达成 | 巢穴页签 `[data-tab="village"]` + 采珊瑚 `[data-gather="coral"]` | 暂时手动采集一些珊瑚 | 玩家点开巢穴页 且 点过采珊瑚(或 `s.res.coral` 开始涨) |
| 6 | 步5达成(`s.res.coral >= 5`) | 礁口巢 `[data-build="nest"]` | 建造一个礁口巢，提高人口上限 | `s.lvl.nest >= 1`(升 1 级)。**完成态先行**:进本步先查巢是否已建成,建成即放行——否则建巢花掉 5 珊瑚后存量回落 <5,会卡死在「继续采集珊瑚」段(2026-10-25 用户实测踩中后修复) |
| 7 | 步6达成 | 族民页签 `[data-tab="folk"]` + 深海藻场 `[data-build="kelp"]`(同屏两处) | 生产新的族民需要一些时间，你可以趁这个时间再升级一下深海藻场 | `s.pop > 1`(新族民生出)或 `s.lvl.kelp >= 2`(玩家照建议升级) |
| 8 | 步7达成(`s.lvl.kelp >= 5`) | 科技解锁弹窗「进入科技页面」按钮(见 §2.2 注①) | 建造五座深海藻场，触发了结绳科技的尤里卡 | 玩家点「进入科技页」(`setTab('tech')`) |
| 9 | 步8达成(科技页已开) | 结绳科技节点 `#techrow-writing` | 研究结绳科技，解锁学者职业 | `s.techs.writing`(结绳掌握) |
| 10 | 步9达成 | 族民页签 `[data-tab="folk"]` | (同步骤3语境,引导回族民页) | 玩家点开族民页 |
| 11 | 步10达成(族民页已开) | 学者加号 `.folk-job-row[data-job-row="scholar"] .folk-job-controls button:last-child` | 分配族民，获取科技点 | `s.jobs.scholar > 0` ⇒ **脚本结束**,置 `meta.onboardSeen` |

> **注① 科技解锁弹窗确认钮选择器**:`maybeSciencePopup`(game.js:424)复用 `SB.ui.render.storyPanel`,ok 按钮文案「进入科技页」(game.js:448)。实现时给该 ok 钮加稳定选择器(如 `data-story-ok` 或 id),走查脚本据此高亮 + 标签。详见 §2.6 / §2.8。
> **注② 选择器依据**:`kelp`/`nest` 建筑 id(config-buildings.js:293/303);`village`/`folk`/`tech` 页签(index.html:128/129/130);`[data-gather="coral"]`(render-pane-village.js:64);`[data-build="b.id"]`(render-pane-village.js:398);`[data-job-row="j.id"]` + 末子 `+` 钮(render-pane-folk.js:71/84);`#techrow-writing`(game.js:451);**职业 id 以 config-catalog.js 为准——采集者=`gather`(非 gatherer)、学者=`scholar`**(2026-10-25 实装踩坑:写 `gatherer` 致选择器查无节点、高亮回退到页签)。

### 2.3 欢迎语文案(**用户定稿**,采用此版)

```
你是深海无光海渊中的一只鲛人。
你抬起头来,幽深的重重海水之上,头顶的「天壳」隔绝了群星,也挡住了文明向上的途径。
你的目标只有一个:一路向上,凿穿天壳,带文明升上星空。

── 具体怎么做 ──
· 建造建筑 —— 它们有的会自动产出资源,有的能提高人口上限,有的能提高资源产出,有的能用低级资源制造高级资源;
· 为族民分配工作,生产所需的资源;
· 研究科技、市政,获取加成,解锁新的建筑、新的奇观、新的政体、新的政策卡;
· 政体具有政策槽,可以选择需要的政策卡加入政策槽中,获取加成;越后期解锁的政体,拥有越多的政策槽;
· 某些奇观会提供永久政策槽;
· 某些政策卡将会在研究市政后得到升级;
· 游戏中期的目标是打破冰壳,你需要建设奇观钻机,将之击碎;
· 游戏的最终目标是建设戴森球——当然,你还有另一个选择…

注意:如果您觉得进度推进有些困难,那可以在研究完「神学」市政后选择重启轮回,
通过获取的轮回点与星屑购买局外加成,并投身新的轮回。
另外,您还可以在新的轮回中启用带着各式限制条件的挑战模式,
一旦挑战成功,您在之后的轮回中也会获得相应的加成。

那么,就让我们从建造第一个深海藻场开始吧…
【按钮】开始探索
```

### 2.4 设置开关(用户要求「设置里可关闭」)

- **存储**:`localStorage['shellbreak.onboarding']`,`'1'`(开,默认)/`'0'`(关)。与 `shellbreak.uiTheme` 同模式。
- **设置页**:`index.html` 的 `ui-settings` 弹层新增一行「新手引导」+ 开关控件(复用现有 toggle 样式,`css/40-atmosphere-theme.css`)。
- **接线**:`src/ui/theme.js` boot 读初始化;change 委托写 localStorage + 调 `SB.onboarding.setEnabled(bool)`(同时控制当前运行中的脚本/标签显隐)。
- **`src/onboarding.js` 暴露**:`isEnabled()` / `setEnabled()` / `start()`(欢迎 + 走查状态机) / `hideAll()`。无 DOM 环境早退。

### 2.5 移动端(390px + 触屏)

- 高亮环用 `getBoundingClientRect` 绝对定位覆盖目标;标签用底部 sheet 或锚定气泡,**零 hover 依赖**;✕ 常显。
- 390px 用 iframe 壳 + headless Chrome 验(`--window-size=390` 得 512 假溢出图,须套 iframe 壳;截图路径写 Windows 绝对路径)。

### 2.6 文件改动清单(B 档)

| 文件 | 改动 |
|---|---|
| `src/onboarding.js`(**新建**) | 走查状态机(`step` + 推进条件表 + 高亮/标签渲染 + ✕→跳过确认);`isEnabled`/`setEnabled`/`start`/`hideAll`;无 DOM 早退。 |
| `src/game.js` | 启动处(:274 同位)调 `SB.onboarding.start(S)`;主循环泵评估 `SB.onboarding.tick(S)`(推进条件)。 |
| `src/state.js` | `freshRun` 登记 `meta.onboardSeen`(参照 state.js:420)。 |
| `src/ui/render.js`(或 storyPanel) | 科技解锁弹窗 ok 钮加稳定选择器 `data-story-ok`(供步7 高亮)。 |
| `index.html` | `ui-settings` 弹层加「新手引导」开关行;走查浮层/标签容器(或纯 JS 注入)。 |
| `css/40-atmosphere-theme.css` | + 高亮环 / 标签气泡 / ✕ 钮 / 跳过确认框 / 设置开关行样式(移动端零 hover)。 |
| `src/ui/theme.js` | boot 读 `shellbreak.onboarding` 初始化;change 委托写 + `setEnabled`。 |
| `sim/e2e.mjs`(或 harness) | `meta.onboardSeen` 默认真 + 加单测探针验推进条件谓词 + 门控。 |

> **不动**:`techs/civics/config.js`、现有 `maybeTabUnlockPopups` 各 `maybeXxxPopup`、解锁叙事文案。

### 2.7 e2e / 回归边界

- `start`/`tick` 无 DOM 早退;`meta.onboardSeen` e2e 默认真 ⇒ 1230/1243 零漂移。
- 推进条件全是纯字段读取(`s.lvl`/`s.jobs`/`s.res`/`s.techs`/`s.pop`)⇒ 单测探针可验。
- 落地后先跑 `node --max-old-space-size=8192 sim/e2e.mjs` 确认三连无漂,再加定向探针。

### 2.8 实现步骤(拍「实装」后执行,本稿不执行)

1. 建 `src/onboarding.js`:状态机 + 高亮/标签 + ✕→跳过确认 + `isEnabled`/`setEnabled`/`start`/`tick`/`hideAll`。
2. `state.js` `freshRun` 登记 `meta.onboardSeen`。
3. `game.js` 启动接入(:274)+ 主循环泵挂 `tick`。
4. `render.js` 科技解锁 ok 钮加 `data-story-ok`。
5. `index.html` 设置行 + `theme.js` 接线(读/写 `shellbreak.onboarding` + `setEnabled`)。
6. `css/40-atmosphere-theme.css` 加高亮/标签/✕/确认框/开关样式(移动端零 hover)。
7. e2e harness 默认真 + 加单测探针(推进条件 + 门控)。
8. headless Chrome 390px 视觉核验 + 真机 TapTap 点一次。
9. 报改动清单 → 问「要不要发版」→ 停。

---

## 五、实现记录（2026-10-25 实装）

### 5.1 改动文件
| 文件 | 改动 |
|---|---|
| `src/onboarding.js`（新建） | 走查状态机（10 步 `STEPS` + `resolve` 推进条件 + 高亮环/标签渲染 + ✕→`confirmPanel` 跳过确认）；`isEnabled`/`setEnabled`/`start`/`tick`/`hideAll`；**全部 DOM 访问包防御，无 DOM 早退**。 |
| `src/game.js` | `boot()` 末尾（`maybeChangelogPopup` 后）调 `SB.onboarding.start(S)`；主循环 `loop()` 渲染后调 `SB.onboarding.tick(S)`。均 `if (SB.onboarding && …)` 守卫。 |
| `src/state.js` | `emptyMeta()` 登记 `onboardSeen: false`（跨周目永久，二周目不 nag）。 |
| `src/ui/theme.js` | `boot()` 读 `shellbreak.onboarding`（默认开）初始化开关；change 委托写 localStorage + 调 `SB.onboarding.setEnabled`。 |
| `index.html` | `ui-settings` 加「新手引导」开关行（`data-onboarding-toggle`）；`<head>` 引 `css/main.css?v=245`；`<body>` 在 `render.js` 后、`game.js` 前加 `<script src="src/onboarding.js?v=1">`；`css/onboarding.css` 经 `main.css` `@import`。 |
| `css/onboarding.css`（新建） | 高亮环（呼吸光晕）/ 标签气泡（常显 ✕、零 hover 依赖）/ 欢迎层（非阻塞幕布）/ 移动端 `@media(max-width:520px)` 放宽。变量用 `--panel/--txt/--cyan/--dim/--line/--red`（见 `00-core.css`）。 |
| `sim/e2e.mjs` | 启动校验后加探针：模块已挂载 / 默认开启 / `start`+`tick` 无干预下不抛错 / 清理欢迎层。 |

### 5.2 回归结论
- 新手引导探针三项全绿；`node --max-old-space-size=8192 sim/e2e.mjs` 无「启动即抛错」。
- 本改动**零回归**：基线（暂存本任务全部跟踪改动后重跑）与含本改动跑出的失败集**完全一致**（6 个 ✗ + `civics.mjs:1034` `toggleGovDetail is not a function` 硬崩溃）——均为 ERA10 市政/奇观进行中的**前置问题**，与引导无关（`toggleGovDetail` 在 `src/` 中从未定义）。
- 真实浏览器冒烟（headless Chrome `file://`）：欢迎层 `ob-welcome`、标题「天壳 · 从深海望向群星」、「开始探索」钮、`ob-layer` 均渲染，**控制台零报错**。

### 5.3 增补一轮（2026-10-25 晚，用户两点反馈）
1. **步1 前插「采藻食」**：欢迎层点「开始探索」后先高亮 `[data-gather="kelp"]`（「采藻食 +1」按钮，巢穴页开局可见），标签「手动采集一些藻食」；推进条件 = 藻食高于**进入本步时的基线快照** `kelpBase`（初始库存可能非 0，如挑战模式；乱序建成藻场也会自然推进）。`start()` 时重置 `kelpBase=null`。走查从 10 步变 11 步，§2.2 表已重编号。
2. **配套机制：首名族民免口粮**（用户拍板，`src/economy.js` `foodUse` 单一落点）：计费人口 = `Math.max(0, s.pop − 1)`。目的 = 开局 pop=1 且藻场未建时不饿死。波及与处理：
   - e2e 新钉子：pop=1 foodUse==0 / pop=3 ==2×FOOD_PER / pop=0 ==0（`sim/e2e.mjs`）。
   - `ironWill` 断言按新口径重写：pop=1 免口粮后连饿都不饿（famine 恒 0）；饿死链路用 pop=2 验证——**须先抬 `s.lvl.nest` 再设 pop=2**（无巢穴 cap=1，tick 第 6 步会把超额人口直接钳回 1，走不到饥荒），饿死一人后 pop 回 1、famine 归零不再减员；夹具快照还原 pop/famineDeaths/nest。
   - `civics.mjs` 藻食净额断言改读 `SB.economy.foodUse(gi)`（不再写死 `FOOD_PER×pop`）。
   - `food-economy.mjs` 商队驿站夹具 `kelpstore=2` 抬上限（免口粮后 r0 0.5→2.5，5 级发放 750 撞 CAP_BASE 200 被截断；该断言验线性接线不是验截断）。
   - **回归结论（连跑 3 次分布）**：失败集稳定 = 基线前置 5 条（海潮方碑×2 / faith 三同源 / data-remove / 政体面板）+ `toggleGovDetail` 硬崩溃；本两改动引入的漂移全部修复，新增断言全绿（✓=535）。海潮方碑那条的数值逐跑自漂（石梁余 617→864→1098→2099），红因是前置的 count=0。
   - ⚠️ 语义边界：免口粮是**全局**规则（任意人口都只付 pop−1 份），不是「仅开局」；要改成仅开局需另立字段，未做。
   - headless Chrome 冒烟：欢迎层与「采藻食 +1」按钮渲染在位，控制台零报错。

### 5.4 待办（未做，按纪律需你拍板）
- 真机 TapTap 点一次（设置开关/欢迎层/高亮手感）——设计文档 §2.8 第 8 步。
- 发布类动作（commit/push/封包/排行榜回填）等你说「发版」才动。
- 设计文档 §四 开放项：① 步6 推进取 `pop>1` 或 `kelp>=2`（已取任一）；② 步4 取 `coral>0` 代理「点过采珊瑚」（已取）；③ 跳过确认单次（已取）；④ 常驻目标面板（已不保留，走查脚本覆盖）；⑤ 学者解锁顺序已保证。

---

## 三、A / C 参考(不做)

- **A 极简**:本走查脚本的「欢迎层 + 单步高亮」即 A 的进化版;B = A + 顺序化操作引导。
- **C 完整**:B + 新手保护数值(`config.js` 单一可标定常量,需用户标定,动 config 让 e2e 早期口径漂)。等上线观测留存后再议。

---

## 四、待确认开放项

1. **步6 推进条件**:取 `s.pop > 1`(真生出新人)还是 `s.lvl.kelp >= 2`(玩家照建议升级)?本文取前者为主、后者兜底;可简化为任一。
2. **步4 推进条件**:「点过采珊瑚」难精确判定,改取 `s.res.coral` 开始 >0(首次手动采集)即可推进;是否需严格「点过」?
3. **跳过确认文案**:「是否跳过新手教程?」(确定/继续引导)。是否要二次确认或仅一次?
4. **原 B 档「首局四步目标追踪器」**(早期草稿的常驻面板):本走查脚本已覆盖引导功能,是否还要保留常驻面板?(建议不保留,避免重复打扰;若想要可后续加。)
5. **学者加号高亮前提**:学者职业需研究结绳后才解锁(render-pane-folk.js:60 守卫),步10 必在步8(结绳掌握)之后,顺序已保证。
