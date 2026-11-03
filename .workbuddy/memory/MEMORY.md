# 天壳 SHELLBREAK — 活问题与索引

> ⚠️ 工程判据**不在这**，全在 `docs/JUDGMENTS.md`，动手前先 Read 它。
> 本文件只留「硬纪律 + 当前未决 + 索引」。末尾哨兵 `<<<SB-EOF>>>`：看不到它 = 本文件被吃了。

## 一、硬纪律（不可协商）

- **顺序铁律**：「单局总时长 / 8-14h 窗」最后统一算，中途不为它调常数。
- **标定权在用户**：数值倍率 / 成本调档 / 参数扫描一律等拍板；我只定**结构**与**落点**。⚠️「算」本身也要等拍板：`sim/balance.mjs` 已删、**任何形式都不许跑**（含探针扫参数、临时 bot）；回归照跑但不读核算段。
- **唯一回归 = `node --max-old-space-size=8192 sim/e2e.mjs`**（4096 会 EXIT=139）。⚠️ 单次红绿不是结论，**连跑 3 次看分布**。
- **判据：改常数让断言变绿 = 标定→停；改代码让 NaN/死锁/永远建不起来消失 = bug→可做。**
- ⚠️ **`defer` ≠ `pending`**：defer=最后统一算；pending=当前设计下不可能成立，挂起+写死理由，**绝不改断言迁就现状**。
- ⚠️ **破壳 ≠ 本局结束**（2026-11-03 定案，推翻 2026-10-15 旧假设）：ERA10 全在破壳之后，破壳只弹「破壳结果」+ 当场判定破壳型挑战（读 `challengeSeal` 快照），**结算只在玩家主动点底栏「轮回」**；`s.broken` 从破壳起一直 true 到换局，`stay()` 已删。⚠️ **停摆要在调用方拆门**：只删 `economy-tick` 首行早退是零效果（1.0.13 就这么漏的），`game.js` 的主循环/离线补算/UI 刷新/自动存档/退出 flush + `save-transfer` 的手动与云存档共 9 处 `!broken` 必须一起拆（2026-11-03 已修，未发版；回归锁 `sim/e2e-suites/break-continue.mjs`）。
- ⚠️ **`s.upgrades.<id>` 只有两态**（`workshop.js upgradeBuy` 只写 `= true`），绝不可当数量做乘算；等级一律读 `s.lvl.<建筑>`（对标 `castleCapBonus`）。
- ⚠️ **夹具口径必须与生产写入路径逐字一致**：曾用 `upgrades.x = 2`（当等级）而生产只写 `true` ⇒ 假绿掩盖真 bug 两周。造夹具前先回查「哪个函数写这个字段、写什么类型」。
- **同一文件多处修改必须串行下发**：并行 Edit 互相覆盖（都回成功、回归照样绿）。改完**回盘 grep 终值**才算改好。
- **先证「数学上可能吗」再问「为什么」**；⚠️ **静态 grep 判据先剥注释**，探针假警报也是 bug，别改被测代码迎合。
- ⚠️ **清空式缓存字段必须能从权威态重建**（2026-11-03「科技升不了」）：`state-migrate` 每次读档 `out.eureka = {}`，而重建的两条路（`revealEra` / `discover`）守卫都是「已掌握跳过」⇒ **已掌握节点的 eureka 永久缺失**，多级科技从第 2 级起被 `studyBlocked` 判「未揭露」，按钮灰且不写原因。判据：凡「清空再从状态重建」的字段，每个读它的地方都要有第二兜底（此处 `metOf` 三档 = techs‖eurekaMet‖condMet），否则 UI 用 A、门禁用 B ⇒ 面板正常、按钮灰。同类坑：`out.era = Math.min(7,…)` 写过死上限（ERAS 已 10）。
- ⚠️ **改游戏代码前必须用户明确同意**（含纪元·科技·市政·奇观·建筑·资源）。
- ⚠️ **改全局量/上限类常数前先想存档迁移**：`resumeRun` 无条件用存档、`migrateRun` 只校验不重算 ⇒ 改配置对老档无效；新字段不进 `freshRun` 就留不住（白名单 `for (k in raw) if (k in base)`）。
- ⚠️ **发布类动作（commit/push/上传/建榜/封包传）一律等用户当次明说**；报 bug ≠ 授权发布。
- **版本号 `Ver1.0.x`**，升版四步：①`CFG.VERSION` ②`CFG.CHANGELOG` 头部插一条 ③`index.html` 的 `?v=` bump（改过的 js/CSS 各自 bump、`main.css` 的 `@import` 别漏）④重跑 `_repack.py`（第 149 行有**硬编码版本断言**，每版必改）。
- ⚠️ **派生表合并：旧稿「文案」列非空即保留一字不动**，不许拿「等于源码说明」当丢弃理由；补空白先读 `desc`/`effectDesc`/`unlockDesc`（`note` 是内部批注不算）；重生成后反向校验「被改写 == 0」。见 JUDGMENTS 五点二十三。
- 数值只改 `src/config.js`；UI/DOM 与断言坑见 skill `shellbreak-from-prototype` §四·五；vm 沙箱五坑见 §二·七。

## 二、当前未决

- ⚠️ **e2e 长期红：HEAD 本身 45 条失败**（**现行基线 = 1494 ✓ / 84 ✗ / 14 挂起**，2026-11-03 科技门禁修复后两遍一致；上版 1490/84 = goal 型挑战展示面补齐，1486/84 = 破壳门禁 B 方案，1464/1510 = `tmp/_e2e_v1012b.log`）。**判「有没有引入新红」只能拿跑前日志按失败清单 comm 对比，不看总数**；⚠️「海潮方碑」那条红着但数字每轮漂，comm 会误判，需按**断言名**归一化。已定性假红：`sunSailRate=0` 簇 8 条（夹具漏设 `res.uranium`）、`data-remove`、`era10 icon 死链`。**仍待处理**：`refreshDysonPanel` 不存在、旧档进度不保留、迁移超编、#13/#18 数值表分歧。发版前先决定清不清。
- **水体污染**：已实装、已发 Ver1.0.12（`V-20261103`）。`pollutionSplit` 是唯一脏源算式；内容挂 `challengeOnly:'waterpollution'`；suite 51 条（`--pollution-only`）。⚠️ **TapTap 未建 `pollution` 榜**（`RANK.LB.pollution` 空串 ⇒ 通关不上榜）。⚠️ **成就「海渊澄明」2026-11-03 才补**（`achv.js` 定义 + `CFG.ACHV.pollutionClear='0'` + 定义里 `onComplete`），平台 ID 待后台建，现在只记本地账本。goal 型展示面同日补齐：完成面板标题读 `outcome.name`、四段分镜只对 `drift_terra` 播、挑战页进度走 `progressLine` 单一落点、破壳后补 `.challenge-active.is-readonly` 只读进度。⚠️ 待标定：6 建筑造价、5 市政 600/800/1000 万、五阶段死亡率。见 JUDGMENTS 五点三十三。
- **ERA10（戴森纪）**：已实装入库（`4d64aaf`/`ac647f6`）。落点 = `launchLvl/launchCycleOf/launchHydroPer`，发射场清单由 `BUILDINGS[].launchpad` 反推；`pop` 非 RESS 键 ⇒ costOf/canAfford/pay/costOwnedTxt 四处必须跳过。待标定：戴森可达性（现 1 帆/10s/级）、市政成本、两座发射场造价。
- **兑换码**：代码全、入口隐藏（`ready()` 假 ⇒ 整块连标题一起隐藏）。入账必须**同时**写 `tide` 与 `tideEarnedTotal`+`compensationTotal`；`character_id` **绝不可写常量**（用 `meta.installId`）。**待办**：`CFG.REDEEM.CLIENT_ID`/`ACTIVITY_ID` 只能后台拿；容器能否直连 `poster-api.xd.cn` 未验证。见 JUDGMENTS 五点三十二。
- **版本线（2026-11-03 17:33 实测）**：线上 `V-20261103` = **Ver1.0.12 已过审上线**；**审核中 `V-20261103-1` = Ver1.0.13**（commit `bbe69e68` 已 push，包 `rc40-v1.0.13.zip` 479 文件 / 55,714.6 KB，SHA-256 `592f6f83…d3c0b0` 全断言 PASS：破壳体验重做 + 挑战门禁二选一 + 多级科技读档修复 + goal 型展示补齐）。⚠️ **发版前必跑「工作区 vs 上一版 zip 逐文件 md5」对比脚本**：本轮抓到 `economy.js` 内容变了但 ?v 漏 bump。⚠️ **判审没审过只认 `get_current_app_info` 草稿段**（`get_app_status` 无视 `app_id`）。⚠️ 试上传不能拿真应用当靶子（曾误传 898459）。
- **TapTap 发布**：**963517 已弃用，全部更新走 996563**。广告位 `SPACE_ID:'1054324'`（996563 竖屏，接对了）。⚠️ 封包必须**单文件夹** `shellbreak/`，必跑两条判据（顶层唯一 + 真解压复查）。⚠️ `taptap-minigame` MCP cwd=`D:\EVE-IDLE`，`gamePath` 只收相对路径 ⇒ 写 `../shellbreak/TAPTAP-H5-OUTPUT/...`。
- **排行榜**：9 个榜已在 996563 建齐（旧 963517 的 7 个 ID 全废）。⚠️ 本宿主 MCP 自带 `start→complete` 永远失败（`pendingState` 纯内存 + `uA()` 轮询上限 120s）；掉线用 `tmp/_tt_a_devcode.mjs` + `tmp/_tt_b_poll.mjs`，token 落 `cache/local/oauth-token.json`。`TAPTAP_MCP_MAC_TOKEN` 不可用。
- **历史遗留阻塞（用户曾拍「暂时先不管」）**：地热线恒 0（`fuelRate` 首行 return 0）⇒ 破冰/跨周目走不到；覆盖洞 bot 凿料阈值饿死大图书馆链；成本跨仓储上限（大灯塔/大图书馆精铁 > `CAP_BASE.iron`）。
- **议事厅/城堡议价**：等比递减 `eff(n)=lim(1−ρⁿ)`，议事厅 2.5%、城堡 ×1.5、渐近 60%（`HALL_DR_MAX 0.75` 是死余量）。三数均提议值。⚠️ 渐近曲线下所有 `x < limit` 判据恒真，判据要改「边际是否还值得」。见 JUDGMENTS 五点二十七。
- 其它待拍：游戏名两处不一致（顶栏 `SHELLBREAK` vs README「渊海天壳 TIDEBREAK」）；内容清单 `.xlsx`/`.ref/` 在 gitignore 里（文案资产只在本地）；`herd/writing` cond 四选一 + `writing n:5`；单局 7.79h vs 8-14h 窗（defer）。
- **存储事实（2026-10-27 定性的根因）**：TapTap 只对 `tapfile://usr` 与 `tap.setStorage` 有持久承诺，**`localStorage` 无** ⇒ 清缓存即丢；更致命的是读不到时静默开新局。三后端 + 三态扫描「**不确定一律不开新局**」即由此而来。细节见 `2026-10-29.md`。
- **核验手段**：视觉首选 CDP（`_cdp.mjs` 的 `connect` + `Runtime.evaluate` / `Emulation.setDeviceMetricsOverride` / `Page.captureScreenshot({clip,scale:2})`；target 取 `127.0.0.1:9333/json/list` 里 `type==='page'`；chrome 必须 `run_in_background:true` 起；`Page.reload {ignoreCache:true}` 否则拿旧脚本）。⚠️ 引导层 class 前缀是 **`ob-`**。手机横拖判据 = `docEl.scrollWidth > clientWidth`（`overflow-x:hidden` 挡不住），根因多为 nowrap flex 被压 < min-content ⇒ 从源头 `flex-wrap:wrap`。

## 三、索引（动手前 Read）

| 内容 | 文件 |
|---|---|
| **全部工程判据**（断链/量纲/死锁/数值/UI 断言/已死文档） | `docs/JUDGMENTS.md` ← 默认先读 |
| 结构事实：资源线/人口/科技树/仓储三轴/解锁权 | `docs/CURRENT_FACTS.md` |
| 猫国对照基准（数值 per tick，**×5=每秒**） | `docs/KITTENS_BASELINE.md` §二 |
| 逐日决策过程 | `.workbuddy/memory/YYYY-MM-DD.md`，早于当天的 `mv` archive/ |

## 四、写入纪律

**进一出一**（加一条须外迁一节，净零增长）；**Tier 1 才留**（5 秒内定位那个 bug 的判据），其余外迁；按天批量写，日志次日 `mv` 进 `archive/`；容量只在自己动笔前算一次，不写进回答。

---
<<<SB-EOF>>>
