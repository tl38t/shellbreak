# 天壳 SHELLBREAK — 活问题与索引

> ⚠️ 工程判据**不在这**，全在 `docs/JUDGMENTS.md`，动手前先 Read 它。
> 本文件只留「硬纪律 + 当前未决 + 索引」。末尾哨兵 `<<<SB-EOF>>>`：看不到它 = 本文件被吃了。

## 一、硬纪律（不可协商，全部现行有效）

- **顺序铁律**：「单局总时长 / 8-14h 窗」最后统一算，中途不为它调常数（那叫标定不是修 bug）。
- **标定权在用户**：数值倍率 / 成本调档 / 参数扫描一律等拍板；我只能定**结构**与**落点**。
- ⚠️ **「算」本身也要等拍板**：`sim/balance.mjs` 已被下令删除，**任何形式都不许跑**（含写探针扫参数、临时造 bot）。回归照跑但不要读核算段输出。
- **唯一回归 = `node --max-old-space-size=8192 sim/e2e.mjs`**（本机 EXIT=139 是堆压力，4096 也崩，必须 8192）。
- ⚠️ **e2e 单次红绿不是结论**：同码连跑会漂（806/811 ↔ 811/811）。**连跑 3 次看分布**再下结论。
- ⚠️ **`defer` ≠ `pending`**：`defer`=能测但要最后统一算；`pending`=该性质当前设计下不可能成立，挂起+写死理由，**绝不改断言迁就**现状。
- **判据：改常数让断言变绿 = 标定→停；改代码让 NaN/死锁/永远建不起来消失 = bug→可做。**
- ⚠️ **派生表（`docs/天壳内容清单_待填文案.*.xlsx`）合并：旧稿「文案」列非空即保留，一字不动**；不许拿「等于源码说明」当丢弃理由（文案定稿后会落进 desc，下次重生成两列天然相等）。补空白先读源码里已是成品文案的字段（`desc`/`effectDesc`/`unlockDesc`），`note` 是内部批注不算。重生成后必须反向校验「被改写 == 0」。详见 `docs/JUDGMENTS.md` 五点二十三。
- ⚠️ **`s.upgrades.<id>` 只有「装没装」两态（`workshop.js` 的 `upgradeBuy` 只写 `= true`），绝不可当数量做乘算**；等级一律从 `s.lvl.<建筑>` 读（对标 `castleCapBonus`：布尔当开关 + `coreLvl(s)` 取等级）。反例：物流仓库「+200/级」曾写成 `(s.upgrades.upg_logiware || 0) * 200` ⇒ `true*200` 恒 200，v0.1.6→v0.1.9 全程只给 1 级（2026-10-27 修）。
- ⚠️ **夹具口径必须与生产写入路径逐字一致**：e2e 曾用 `upgrades.upg_logiware = 2`（当等级）而生产只写 `true` ⇒ 断言测的是玩家到不了的状态，**假绿掩盖真 bug 两周**。造夹具前先回查「哪个函数写这个字段、写什么类型」。
- **先证「数学上可能吗」再问「为什么」**：红时先算目标值到底能不能达到，别直接归因口径/欠账。
- **同一文件多处修改必须串行下发**：并行 Edit 会互相覆盖（都回成功，回归照样绿）。改完**回盘 grep 终值**才算改好。
- ⚠️ **改游戏代码前必须用户明确同意**：含新增/改纪元·科技·市政·奇观·建筑·资源（techs/civics/config.js）。设计阶段只出方案，用户拍「实装」才落代码。
- ⚠️ **改全局量/上限类常数前先想存档迁移**：`game.resumeRun()` 无条件用存档，`migrateRun` 只校验不重算 ⇒ 改配置对老存档无效。e2e 对迁移零断言，须自带定向探针。
- ⚠️ **发布类动作（commit/push/上传/建榜/封包传）一律等用户当次明说**；报 bug ≠ 授权发布。
- **版本号约定（2026-10-27 变更）**：对外版本名改用 **`Ver1.0.1`** 口径（原 `v0.MAJOR.MINOR` 约定废止），三处必须同口径：`CFG.VERSION` / TapTap 版本描述 / README。⚠️ 升版**四步**：①`CFG.VERSION` ②`CFG.CHANGELOG` 头部插一条（**更新日志 2026-10-27 已恢复**，面板读这张表）③`index.html` 的 `?v=` bump（**改过的 js/CSS 模块也要各自 bump**，`main.css` 的 `@import` 版本号别漏）④重跑 `_repack.py`。
- 数值只改 `src/config.js`；UI/DOM 与断言坑见 skill `shellbreak-from-prototype` §四·五；vm 沙箱五坑见 §二·七。

## 二、当前未决（开工先看，仅留未关闭项）

- **ERA10 科技+市政（戴森纪）已实装并已入库**（2026-10-20，commit `4d64aaf`/`ac647f6` 已 push master；未 bump 版本、未重封包）：科技侧 7 科技 + 太阳星环 + 朱庇特奇观 + 强人工智能升级 + 发射场帆/节点双模式 + 戴森终局面板；市政侧 5 市政 + 3 建筑（泰拉·瑞亚发射场带 `launchpad` 标记 / 虚境祭坛 `cost.pop`+`maxLvl:3`）+ 3 政策卡 + `card` 条件类型 + 飞升虚境乱码终局。关键结构：`launchLvl/launchCycleOf/launchHydroPer` 单一落点，发射场清单由 `BUILDINGS[].launchpad` 反推；`pop` 非 RESS 键，costOf/canAfford/pay/costOwnedTxt 四处必须跳过。e2e **1230/1243 三连无漂移**。踩坑与判据见 `docs/JUDGMENTS.md` **五点二十一 / 五点二十二**。**未决**：戴森可达性标定（现 1 帆/10s/级）；市政成本（600万/800万/1000万）与两座发射场造价全为**提议值待标定**。
- ⚠️ **e2e 长期红：HEAD 本身就是 57 条失败**（2026-10-26 用 `git worktree` 干净对照实测；**现行基线 = 1218/1273 / 55 条**，2026-10-28 三连逐字复核）。旧记忆「1230/1243 三连无漂移」**已作废**——当时 `civics.mjs` 的 `toggleGovDetail is not a function` 硬崩**屏蔽了其后全部断言**（政体面板早重构为「当前卡 + `openGovPicker` 弹窗」，旧行式 `govrow-*`/展开机制整体废弃）。55 条分簇：ERA10 发射场/戴森 13、AI 策略 10、神学/轮回 5、口粮供给幸福 5、挑战 4、鼓舞人口门槛 3、零散 15；⚠️ **这 55 条已定性一半（2026-10-26 23:00 探针复核，见当天日志）**：`sunSailRate=0` 那一簇 8 条是**夹具漏设 `res.uranium`**（帆模式每级耗铀 0.5/s，铀=0 ⇒ `_elRunR=false`），补一行即 6 条转绿，**零代码 bug**；`data-remove` 与 `era10 icon 死链` 皆**假红**（前者 class 多了 `slot-eject`、后者拿带 `?v=2` 的串去 `existsSync`，7 个 png 全在）。**仍待处理**：`refreshDysonPanel` 确实不存在、旧档进度不保留、迁移超编、以及 #13/#18（节点耗料 1/1/3 vs 3/3/30、热液耗流 2 vs 4）属**数值表新旧分歧、须用户拍**。**发版前必须先决定清不清这批。**
- **内容清单「待填文案」已补全**（2026-10-20）：338 行、文案空 0（旧稿沿用 115 + 新写 223）。工具链在 `docs/.天壳内容清单_待填文案.ref/`。⚠️ **`.xlsx` 与 `.ref/` 都在 .gitignore 里 ⇒ 文案资产没进仓库，只活在本地**；要入库须动 .gitignore —— 待拍。

- **游戏名两处不一致**：顶栏 `<h1>` 后英文 `SHELLBREAK` 没改，README 写「渊海天壳 TIDEBREAK」⇒ 待拍。
- **排行榜已建并就绪（修正 2026-10-26 过时记忆）**：`config.js` RANK.LB **9 个榜已在 996563 建齐并自动发布**（旧 963517 的 7 个 ID 全废；996563 曾读出 0 条），`dyson`/`void` 补齐，`_repack.py`/`rank-probe.mjs` 已同步（探针 112/112），rc16 包已含新 ID。⚠️ **本宿主下 MCP 自带 `start→complete` 永远失败**：`pendingState` 纯内存单例（跨轮次进程重启即丢），且 `uA()` 轮询硬上限 `60×2s=120s`。掉线时复用 `tmp/_tt_a_devcode.mjs`（native `getClientId()`=`cadxxoz247zw0ug5i2` → POST `accounts.tapapis.cn/oauth2/v1/device/code`）+ `tmp/_tt_b_poll.mjs`（轮询 `/oauth2/v1/token`，`grant_type=device_token&secret_type=hmac-sha-1`，吃满 `expires_in`=300s），token 落 `cache/local/oauth-token.json`（stdio 下 `userId` 恒 `local`；`g8()` 实时读文件，写完即生效）。`TAPTAP_MCP_MAC_TOKEN` 环境变量**不可用**（`Vt()` 不 JSON.parse，代码却要求 `.kid`/`.mac_key` 对象）。
- **手机端横拖判据**：`docEl.scrollWidth > clientWidth` 即用户可横拖（`body{overflow-x:hidden}` 挡不住）。根因多为 nowrap flex 被压到 < min-content ⇒ **只能从源头 `flex-wrap:wrap`**（2026-10-26 `73310f1e`）。
- ★ **兑换码（TDS 通兑码）已实装、未发（2026-10-30）**：`src/redeem.js` + 设置页 `#redeemSettingBlock`（`ready()` 为假时**整块连标题一起隐藏**）。入账必须**同时**写 `tide` 与 `tideEarnedTotal`+`compensationTotal`，判据锁「残差 `earned−tide−spent` 不变」。⚠️ `character_id` **绝不可写常量**（平台按 (活动,id) 记每人次数，常量 ⇒ 除首位玩家外全员 100017），用 `meta.installId`。**待办**：`CFG.REDEEM.CLIENT_ID` / `ACTIVITY_ID` 只能后台拿（无服务器礼包 + 通兑码 + 每用户 1 次 + 库存足），拿到前按钮不显示；**容器能否直连 `poster-api.xd.cn` 是唯一未验证环节**，须真机点一次。判据见 `docs/JUDGMENTS.md` 五点三十二。
- **视觉核验首选 CDP**（`_cdp.mjs` 的 `connect(wsUrl)` + `Runtime.evaluate` / `Emulation.setDeviceMetricsOverride` / `Page.captureScreenshot({clip,scale:2})`；target 从 `127.0.0.1:9333/json/list` 取 `type==='page'`；chrome 必须 `run_in_background:true` 起）。范本 `tmp/_cdp_qbtn_ba.mjs`、`tmp/_cdp_qbtn_mobile.mjs`。iframe 探针只适合取数值。⚠️ 新手引导层 class 前缀是 **`ob-`**（`.ob-layer/.ob-welcome/.ob-tip/.ob-spot`），写 `[class*="onboarding"]` 一条也命中不了。
- ★ **小游戏容器的存储事实（2026-10-27 定性的根因，已全部落地修复）**：TapTap 只对 **`tapfile://usr`** 标「持久化」、`tap.setStorage` 有独立「长期保留」承诺（1MB/key、总 10MB），而 **`localStorage` 在小游戏容器里没有任何持久承诺** ⇒ 清缓存/容器重建即丢。⚠️ 比丢档更致命的是**读不到时静默开新局**（`loadRun` null → `startRun()` → 立刻 `saveRun`）⇒ 玩家看到的不是「丢了」而是「变成新档」。这两条就是现在三后端 + 三态扫描的全部由来，改存档相关代码前先读这段。
  - ✅ **2026-10-28 已发 Ver1.0.3 洁净版**（commit `f5da1b6f`，rc29 上传 996563）：三后端 + `recoverAsync` 落地；同日「卡在更新日志/点不动」定性为**云端救援 `location.reload()` 重载环**（四条 P0：逃生分支上提 / `adoptBundle` 就地接管不 reload / 导入写后读回校验 / `boot` 分段超时）+ **引导层 `pointer-events:auto`+z-index 100001 压住 `#modal`**。（草稿 9 条玩家文案仍未进 `CFG.CHANGELOG`，见 `docs/RELEASE_NOTES_DRAFT.md`）
  - ⚠️ **rc31 已过审上线（2026-10-29 21:07 实测 `V-20261029` 状态 4），含**：①议价改等比递减 + 面板设计语汇全删（`HALL_SAVE 0.025` / `HALL_DR_BASE 0.60`）；②手动**「立即保存」**（写后读回**比对 `_ts`** 防容器假成功）；③`resetModalChrome()` 弹窗归一化（判据 JUDGMENTS 五点二十八）；④**TapTap 持久化重做**（原生 `shellbreak-save-{a,b,hide}.json` 双版本快照 + `tap.onHide` 同步写读回 + 启动三源三态扫描「**不确定一律不开新局**」、`forceFreshBoot` 唯一出口 + 云端 `main/previous` 双槽 `_saveSeq` 防倒退），真机清单 `docs/TAPTAP_SAVE_CHECKLIST.md`。逐条细节见 `2026-10-29.md`。**这批没写更新日志条目**（当时用户拍「不加版本号不写日志」）⇒ 玩家已在体验但无说明。⚠️ 判「审没审过」看 `get_current_app_info` 的草稿段。
  - ⚠️ **遗产系数 0.15 → 1.5（已随 rc32 发出）**：2026-10-29 15:40 用户拍板 ×10 ⇒ `CFG.LEGACY.RATE_PER_ITEM = 1.5`（原先硬编码在 `prestige.js` 两处，已归位 config；语义锚点 = `UNIT.sci`/`UNIT.culture` 同量纲，0.15 即「1 件 = 1 个学者」。e2e 断言改读 CFG）。
  - ★ **Ver1.0.5 已发（2026-10-29 21:07，审核版本 `V-20261029-1` 状态 1）**：`CFG.VERSION = Ver1.0.5`，CHANGELOG **只 6 条**（用户拍板：修复 3 = 轮回点强化消失 / 天穹钻机停摆原因 / 商人共和国卡槽文案；新增 3 = 立即保存 / 资源格明细 / 建造追踪），`config.js?v=193`；commit `c72fc778` 已 push；包 `rc32-v1.0.5.zip`（442 文件 / 42254.9KB，九组断言 PASS）。内容主体 = 玩家「掉轮回点」两条 P0：①`migratePerks` 幂等哨兵撞名（判据五点二十九 + 五点三十·四，回归锁 `sim/e2e-suites/save-migrate.mjs` 11 条）；②`decideRun` / `bootTap` 在「周目在、跨周目缺失」时**不许拿空 meta 覆盖**（判据五点三十）。e2e **1244/1297，107 行 ✗ 与基线逐字相同**。
    ⚠️ **玩家侧补救**：必须先发修复版，再让玩家把 19:36 那份码导回去 —— 否则导回去重启一次又蒸掉 6 个节点。已被删且不在这份码里的购买无法自动补偿（无购买流水）。
- **⚠️ TapTap 发布主体（2026-10-25 用户拍板）**：**963517 已弃用**，**之后所有更新都走 996563《自海渊至群星：深海文明建设》**（已选为 MCP 当前应用）。`config.js` 广告位 `SPACE_ID:'1054324'` 即 996563 的**竖屏**激励视频位（`check_ads_status(996563)`=已生效，横屏 1054323 / 竖屏 1054324，游戏竖屏⇒匹配 1054324）——**接对了，无需改**。云存档 `save-transfer.js` 代码已全（手动上传/下载/恢复），但依赖 TapTap 运行时 `tap` 全局，浏览器验不了、需真机点一次。⚠️ **`taptap-minigame` MCP 的 cwd = `D:\EVE-IDLE`**：`gamePath` 只收相对路径（绝对路径被拒），写 `TAPTAP-H5-OUTPUT/...` 会解析到 EVE-IDLE 下报「目录不存在」⇒ 必须写 `../shellbreak/TAPTAP-H5-OUTPUT/rc01-upload/shellbreak`。
- **历史遗留阻塞（挂起，用户曾拍「暂时先不管」）**：地热线恒 0（economy.fuelRate 首行 return 0）⇒ 破冰/跨周目走不到；覆盖洞 bot 凿料阈值饿死大图书馆链；成本跨仓储上限（大灯塔/大图书馆精铁 > CAP_BASE.iron）。重设后须改回 check()。
- **议事厅/城堡议价已改「等比递减」（2026-10-29 用户选 60% 档）**：`eff(n)=lim(1−ρⁿ)`，`ρ=1−rate/lim`；议事厅 rate 2.5%、城堡 ×1.5、渐近上限 60%（`HALL_DR_MAX 0.75` 仍是死余量）。三个数全是**提议值待标定**。旧曲线（`getLimitedDR` 的 0.75 次幂）末段会**回升**（24 级 +3.16%），是这次换掉的原因；该函数现在只服务城堡容量轴，别再塞回来。⚠️ 换渐近曲线后**所有 `x < limit` 判据都恒为真**（AI 曾因此退化），判据要改「边际是否还值得」。判据见 `docs/JUDGMENTS.md` 五点二十七。
- **herd/writing 的 cond 四选一 + writing n:5** 级联 —— 待拍。
- **单局总时长 7.79h（真开局口径）vs 8-14h 窗，差 0.21h** —— 按纪律 defer，未拍板未核算。
- ⚠️ **静态扫雷/grep 判据必须先剥注释**（game.js:694 注释记「兜底已删」，裸 grep 命中本身=误报）；探针假警报也是 bug，别改被测代码迎合。
- ⚠️ **TapTap 封包必须「单文件夹」形**：`zip → shellbreak/{index.html, assets, css, src}`，否则解析失败。封包必跑两条判据：①`{n.split('/')[0]}.length==1` 且下层有 index.html；②真解压到 %TEMP% `os.listdir` 复查。`_repack.py` 自动同步源码+跑断言。
- ⚠️ **常驻 headless Chrome 必须 `run_in_background:true` 起**；dev 兜底口正则是 `[?&]adtest\b(?!=)`（不能写 `ad(test)?`）。

## 三、判据库索引（动手前 Read）

| 内容 | 文件 |
|---|---|
| **全部工程判据**（断链/量纲/死锁/数值/UI 断言/已死文档） | `docs/JUDGMENTS.md` ← 默认先读 |
| 结构事实：资源线/人口/科技树/仓储三轴/解锁权 | `docs/CURRENT_FACTS.md` |
| 猫国对照基准（数值 per tick，**×5=每秒**） | `docs/KITTENS_BASELINE.md` §二 |
| 逐日决策过程 | `.workbuddy/memory/YYYY-MM-DD.md`，早于当天的 `mv` archive/ |

## 四、写入纪律

- **进一出一**：加一条必须同时外迁一节，净零增长。
- **Tier 1 才留**：5 秒内定位那个 bug 的判据，其余外迁。
- **按天批量写**，不逐次动笔；日志次日 `mv` 进 `archive/`。
- 容量只在自己动笔前算一次，当内部判据，不写进回答。

---
<<<SB-EOF>>>
