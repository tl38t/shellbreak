# Steam 成就填报清单 v0.1

> 状态：Steamworks 已保存 85 项成就；英语、简体中文、繁体中文各 170/170 个名称与说明。56 项建筑成就都已关联独立的 0–100 进度统计。本次只保存草稿，尚未发布。目标 AppID：`5568210`。
>
> 来源：当前 `src/achv.js`、`src/config-buildings.js`、`src/challenges.js` 与语言资源。当前定义 **85 项 = 29 项静态成就（17 项挑战专属 + 12 项轮回/文明里程碑）+ 56 项建筑成就**。旧文档写的 62 项已过时；此前这份清单漏了军营、要塞、王立士官学院三个运行时自动生成的建筑成就，现已补入。
> 上传包：`outputs/steamworks/5568210-achievement-upload.zip` 已更新为 85 项版，含定义、本地化 CSV 与 85 张彩色图标。

## Steamworks 共用字段

以下值适用于每一项；每项特殊可见性和图标状态见下方明细。

| Steamworks 字段 | 填写值 |
|---|---|
| 成就集合（In Set） | `Base Game`（基础游戏） |
| Set By | `Client`（客户端） |
| Progress Stat | 56 项建筑成就关联各自的 `SHELLBREAK_BLD_<ID>_PROGRESS`；其他成就留空 / `None` |
| Stat Range | 建筑成就为 `0–100`；其他成就留空 / `None` |
| Optional Status | `Available` |
| 未解锁图标 | 在编辑器点 `Generate`，由 Steam 生成灰度图 |
| 支持语言 | English、简体中文、繁体中文 |

Steamworks 要求每项有唯一 API Name、可本地化的显示名称和说明、已解锁/未解锁图标、Set By、Visibility、状态及所属集合；Progress Stat/Range 是可选项。建筑成就各自读取跨周目累计建造等级，达到 100 级即解锁。图标建议为方形 256×256 PNG；也可上传更大方图让编辑器缩放。所有成就先归入 Base Game。

**Steamworks 可见性**：`Visible` 为普通显示；`Spoiler` 会在解锁前隐藏详细信息。此清单将戴森球终局及污染挑战终局设为 `Spoiler`。

## 原有静态成就（19 项）

### 01. 寒流禁火

- **内部 key：** `cold`
- **API Name：** `SHELLBREAK_COLD`
- **解锁条件（核对用）：** 在“寒流禁火”挑战中完成这一轮（单档）。
- **显示名称 en-US：** Cold Snap: No Heating
- **显示名称 zh-CN：** 寒流禁火
- **显示名称 zh-TW：** 寒流禁火
- **说明 en-US：** Complete a Prestige run with the Cold Snap: No Heating restrictions active.
- **说明 zh-CN：** 在「寒流禁火」的限制下完成一次轮回。
- **说明 zh-TW：** 在「寒流禁火」的限制下完成一次輪迴。
- **已解锁图标：** `assets/achievements/achv-cold.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 02. 小国寡民

- **内部 key：** `small`
- **API Name：** `SHELLBREAK_SMALL`
- **解锁条件（核对用）：** 在“小国寡民”挑战中完成这一轮（单档）。
- **显示名称 en-US：** Small Country, Few People
- **显示名称 zh-CN：** 小国寡民
- **显示名称 zh-TW：** 小國寡民
- **说明 en-US：** Complete a Prestige run under the Small Country, Few People restrictions.
- **说明 zh-CN：** 在「小国寡民」的限制下完成一次轮回。
- **说明 zh-TW：** 在「小國寡民」的限制下完成一次輪迴。
- **已解锁图标：** `assets/achievements/achv-small.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 03. 忽视科文

- **内部 key：** `science`
- **API Name：** `SHELLBREAK_SCIENCE`
- **解锁条件（核对用）：** 完成“忽视科文”挑战全部 3 档，并遵守每档的学者与书手人数上限。
- **显示名称 en-US：** Neglect of Science and Civics
- **显示名称 zh-CN：** 忽视科文
- **显示名称 zh-TW：** 忽視科文
- **说明 en-US：** Clear all three tiers while keeping the number of Scholars and Scribes at the minimum throughout.
- **说明 zh-CN：** 三档全通——把学者与抄写员的人数一路压到最低。
- **说明 zh-TW：** 三檔全通——把學者與抄寫員的人數一路壓到最低。
- **已解锁图标：** `assets/achievements/achv-science.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 04. 深渊重压

- **内部 key：** `abyss`
- **API Name：** `SHELLBREAK_ABYSS`
- **解锁条件（核对用）：** 完成“深渊重压”挑战全部 3 档。
- **显示名称 en-US：** Abyssal Pressure
- **显示名称 zh-CN：** 深渊重压
- **显示名称 zh-TW：** 深淵重壓
- **说明 en-US：** Complete all three tiers while all production is heavily reduced.
- **说明 zh-CN：** 三档全通——在全产出大幅削减下走完整局。
- **说明 zh-TW：** 三檔全通——在全產出大幅削減下走完整局。
- **已解锁图标：** `assets/achievements/achv-abyss.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 05. 首次轮回

- **内部 key：** `firstRebirth`
- **API Name：** `SHELLBREAK_FIRST_REBIRTH`
- **解锁条件（核对用）：** 首次完成合格的轮回结算。
- **显示名称 en-US：** First Prestige
- **显示名称 zh-CN：** 首次轮回
- **显示名称 zh-TW：** 首次輪迴
- **说明 en-US：** Complete your first true Prestige settlement. Starting over is a rite of passage for a deep-sea civilization.
- **说明 zh-CN：** 第一次完成真正的轮回结算——推倒重来，是深渊文明的成人礼。
- **说明 zh-TW：** 第一次完成真正的輪迴結算——推倒重來，是深淵文明的成人禮。
- **已解锁图标：** `assets/achievements/achv-first-rebirth.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 06. 首次破壳

- **内部 key：** `shellBreak`
- **API Name：** `SHELLBREAK_SHELL_BREAK`
- **解锁条件（核对用）：** 首次凿穿天壳。
- **显示名称 en-US：** First Shellbreak
- **显示名称 zh-CN：** 首次破壳
- **显示名称 zh-TW：** 首次破殼
- **说明 en-US：** Break through the Shell for the first time. As the ice gives way, starlight reaches the deep sea.
- **说明 zh-CN：** 第一次真正凿穿天壳。冰层崩塌的那一刻，深海之上第一次照进星光。
- **说明 zh-TW：** 第一次真正鑿穿天殼。冰層崩塌的那一刻，深海之上第一次照進星光。
- **已解锁图标：** `assets/achievements/achv-shell-break.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 07. 控星之人

- **内部 key：** `dysonEnd`
- **API Name：** `SHELLBREAK_DYSON_END`
- **解锁条件（核对用）：** 戴森球竣工，且未完成“飞升虚境”。
- **显示名称 en-US：** Master of the Stars
- **显示名称 zh-CN：** 控星之人
- **显示名称 zh-TW：** 控星之人
- **说明 en-US：** Complete a Dyson Sphere and hold an entire star in your grasp. For a civilization that never ascends to the Verge, this is the pinnacle.
- **说明 zh-CN：** 建成完整的戴森球，把整颗恒星纳入掌心——在未飞升虚境的那条路上，这就是文明的顶点。
- **说明 zh-TW：** 建成完整的戴森球，把整顆恆星納入掌心——在未飛昇虛境的那條路上，這就是文明的頂點。
- **已解锁图标：** `assets/achievements/achv-dyson-end.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Spoiler`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 08. 虚境飞升

- **内部 key：** `voidEnd`
- **API Name：** `SHELLBREAK_VOID_END`
- **解锁条件（核对用）：** 完成“飞升虚境”后让戴森球竣工。
- **显示名称 en-US：** Ascension to the Verge
- **显示名称 zh-CN：** 虚境飞升
- **显示名称 zh-TW：** 虛境飛昇
- **说明 en-US：** Complete a Dyson Sphere after mastering Ascension to the Verge. Your civilization didn't stop at the stars—it leapt into the Verge.
- **说明 zh-CN：** 掌握《飞升虚境》之后竣工戴森球——文明没有停步星海，而是跃入了虚境之中。
- **说明 zh-TW：** 掌握《飛昇虛境》之後竣工戴森球——文明沒有停步星海，而是躍入了虛境之中。
- **已解锁图标：** `assets/achievements/achv-void-end.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Spoiler`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 09. 逐光竞速

- **内部 key：** `speedrun`
- **API Name：** `SHELLBREAK_SPEEDRUN`
- **解锁条件（核对用）：** 完成“逐光竞速”最高档（4 小时档），并在时限内破壳。
- **显示名称 en-US：** Race the Light
- **显示名称 zh-CN：** 逐光竞速
- **显示名称 zh-TW：** 逐光競速
- **说明 en-US：** Break through the Shell within the 4-hour tier of the Race the Light challenge. Race against time—and win.
- **说明 zh-CN：** 在「逐光竞速」挑战的 4 小时档内凿穿天壳——与时间赛跑，并且跑赢。
- **说明 zh-TW：** 在「逐光競速」挑戰的 4 小時檔內鑿穿天殼——與時間賽跑，並且跑贏。
- **已解锁图标：** `assets/achievements/achv-speedrun.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 10. 流浪泰拉

- **内部 key：** `driftTerra`
- **API Name：** `SHELLBREAK_DRIFT_TERRA`
- **解锁条件（核对用）：** 完成“流浪泰拉”挑战：建成 50 座行星发动机，并将星核炉芯池充至 50M 热液能。
- **显示名称 en-US：** Terra Drifter
- **显示名称 zh-CN：** 流浪泰拉
- **显示名称 zh-TW：** 流浪泰拉
- **说明 en-US：** Build 50 Planetary Engines and fill the Stellar Core Reactor's reservoir with 50M Hydrothermal Energy.
- **说明 zh-CN：** 建成 50 座行星发动机，并把星核炉芯池灌满 50M 热液能。
- **说明 zh-TW：** 建成 50 座行星發動機，並把星核爐芯池灌滿 50M 熱液能。
- **已解锁图标：** `assets/achievements/achv-drift-terra.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 11. 海渊澄明

- **内部 key：** `pollutionClear`
- **API Name：** `SHELLBREAK_POLLUTION_CLEAR`
- **解锁条件（核对用）：** 在“水体污染”挑战中完成戴森球工程。
- **显示名称 en-US：** Clear Waters of the Deep
- **显示名称 zh-CN：** 海渊澄明
- **显示名称 zh-TW：** 海淵澄明
- **说明 en-US：** Complete a Dyson Sphere in the Water Pollution challenge. Even the dirtiest sea couldn't keep you from reaching the stars.
- **说明 zh-CN：** 在「水体污染」挑战里让戴森球竣工——带着最脏的海，走到了群星之间。
- **说明 zh-TW：** 在「水體汙染」挑戰裡讓戴森球竣工——帶著最髒的海，走到了群星之間。
- **已解锁图标：** `assets/challenges/challenge-waterpollution-illustrated.webp` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Spoiler`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 12. 太空时代

- **内部 key：** `starComplete`
- **API Name：** `SHELLBREAK_STAR_COMPLETE`
- **解锁条件（核对用）：** 破壳后填满全部星空探索槽位。
- **显示名称 en-US：** Space Age
- **显示名称 zh-CN：** 太空时代
- **显示名称 zh-TW：** 太空時代
- **说明 en-US：** After breaking through the Shell, fill every Starfield slot. At last, your people turn their gaze to the whole galaxy.
- **说明 zh-CN：** 破壳之后把星空槽完全填满——深海的族民，终于把目光投向了整片星海。
- **说明 zh-TW：** 破殼之後把星空槽完全填滿——深海的族民，終於把目光投向了整片星海。
- **已解锁图标：** `assets/achievements/achv-star-complete.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 13. 立教

- **内部 key：** `religion`
- **API Name：** `SHELLBREAK_RELIGION`
- **解锁条件（核对用）：** 首次为文明命名。
- **显示名称 en-US：** Founding a Faith
- **显示名称 zh-CN：** 立教
- **显示名称 zh-TW：** 立教
- **说明 en-US：** Name your civilization for the first time, and the gate to Prestige will open.
- **说明 zh-CN：** 第一次为你的文明命名——从这一刻起，轮回之门为之开启。
- **说明 zh-TW：** 第一次為你的文明命名——從這一刻起，輪迴之門為之開啟。
- **已解锁图标：** `assets/achievements/achv-religion.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 14. 十次轮回

- **内部 key：** `rebirth10`
- **API Name：** `SHELLBREAK_REBIRTH_10`
- **解锁条件（核对用）：** 累计完成 10 次合格轮回结算。
- **显示名称 en-US：** Ten Prestiges
- **显示名称 zh-CN：** 十次轮回
- **显示名称 zh-TW：** 十次輪迴
- **说明 en-US：** Complete ten true Prestige settlements. Every fresh start takes you farther than the last.
- **说明 zh-CN：** 完成十次真正的轮回结算——每一次推倒重来，都比上一次走得更远。
- **说明 zh-TW：** 完成十次真正的輪迴結算——每一次推倒重來，都比上一次走得更遠。
- **已解锁图标：** `assets/achievements/achv-rebirth-10.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 15. 旧日遗珍

- **内部 key：** `relic10`
- **API Name：** `SHELLBREAK_RELIC_10`
- **解锁条件（核对用）：** 跨周目将 10 座独特奇观收入博物馆。
- **显示名称 en-US：** Relics of the Past
- **显示名称 zh-CN：** 旧日遗珍
- **显示名称 zh-TW：** 舊日遺珍
- **说明 en-US：** Place 10 unique Wonders in the Museum across multiple runs. The glories of the past live on.
- **说明 zh-CN：** 让十座独特奇观跨周目入藏纪念馆——旧日的辉煌，没有被遗忘。
- **说明 zh-TW：** 讓十座獨特奇觀跨週目入藏紀念館——舊日的輝煌，沒有被遺忘。
- **已解锁图标：** `assets/achievements/achv-relic-10.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 16. 遗珍全集

- **内部 key：** `relic25`
- **API Name：** `SHELLBREAK_RELIC_25`
- **解锁条件（核对用）：** 跨周目将全部 25 座独特奇观收入博物馆。
- **显示名称 en-US：** A Complete Collection
- **显示名称 zh-CN：** 遗珍全集
- **显示名称 zh-TW：** 遺珍全集
- **说明 en-US：** Place all 25 unique Wonders in the Museum. The entire history of your civilization is gathered here.
- **说明 zh-CN：** 二十五座独特奇观全部入藏——整部文明史，都收进了这座纪念馆。
- **说明 zh-TW：** 二十五座獨特奇觀全部入藏——整部文明史，都收進了這座紀念館。
- **已解锁图标：** `assets/achievements/achv-relic-25.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 17. 科技大成

- **内部 key：** `techAll`
- **API Name：** `SHELLBREAK_TECH_ALL`
- **解锁条件（核对用）：** 在同一周目掌握全部 83 项非挑战科技。
- **显示名称 en-US：** Technological Mastery
- **显示名称 zh-CN：** 科技大成
- **显示名称 zh-TW：** 科技大成
- **说明 en-US：** Research all 83 technologies in a single run—from Cordage to the Grand Unified Equation.
- **说明 zh-CN：** 在同一个周目内掌握全部 83 项科技——从结绳记事到大统一方程，一条路走到头。
- **说明 zh-TW：** 在同一個週目內掌握全部 83 項科技——從結繩記事到大統一方程，一條路走到頭。
- **已解锁图标：** `assets/achievements/achv-tech-all.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 18. 市政大成

- **内部 key：** `civicAll`
- **API Name：** `SHELLBREAK_CIVIC_ALL`
- **解锁条件（核对用）：** 在同一周目完成全部 69 项市政。
- **显示名称 en-US：** Civic Mastery
- **显示名称 zh-CN：** 市政大成
- **显示名称 zh-TW：** 市政大成
- **说明 en-US：** Complete all 69 Civics in a single run—from the Code of Laws to the Gods Themselves.
- **说明 zh-CN：** 在同一个周目内完成全部 69 项市政——从法典到神们自己，一个都不落下。
- **说明 zh-TW：** 在同一個週目內完成全部 69 項市政——從法典到神們自己，一個都不落下。
- **已解锁图标：** `assets/achievements/achv-civic-all.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 19. 半程星环

- **内部 key：** `halfDyson`
- **API Name：** `SHELLBREAK_HALF_DYSON`
- **解锁条件（核对用）：** 戴森球工程进度达到 50%。
- **显示名称 en-US：** Halfway to a Dyson Sphere
- **显示名称 zh-CN：** 半程星环
- **显示名称 zh-TW：** 半程星環
- **说明 en-US：** Reach 50% Dyson Sphere completion. Half the star is yours already; the rest is only a matter of time.
- **说明 zh-CN：** 戴森球进度达到 50%——半个恒星已经属于你，剩下的只是时间问题。
- **说明 zh-TW：** 戴森球進度達到 50%——半個恆星已經屬於你，剩下的只是時間問題。
- **已解锁图标：** `assets/achievements/achv-half-dyson.png` — 仓库已有 PNG，按 Steamworks 编辑器预览确认。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

## 挑战专属成就（新增 10 项）

多档挑战只在最高档首次完成时解锁；单档挑战在首次完成时解锁。图标复用对应挑战徽章，Steamworks 上传前需准备方形 PNG。

### 20. 星海竞速

- **内部 key：** `challengeDysonRush`
- **API Name：** `SHELLBREAK_CHALLENGE_DYSON_RUSH`
- **解锁条件（核对用）：** 完成全部三档，并在 4 小时档内竣工戴森球。
- **显示名称 en-US：** Race the Stars
- **显示名称 zh-CN：** 星海竞速
- **显示名称 zh-TW：** 星海競速
- **说明 en-US：** Complete all three tiers of Race the Stars by building a Dyson Sphere within the 4-hour limit.
- **说明 zh-CN：** 完成「星海竞速」全部三档，并在 4 小时档内竣工戴森球。
- **说明 zh-TW：** 完成「星海競速」全部三檔，並在 4 小時檔內竣工戴森球。
- **已解锁图标：** `assets/challenges/challenge-speedrun.svg` — 导出 256×256 方形 PNG 后上传。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 21. 安那其主义

- **内部 key：** `challengeAnarchy`
- **API Name：** `SHELLBREAK_CHALLENGE_ANARCHY`
- **解锁条件（核对用）：** 不装备政策卡（《轮回之终末》除外），完成戴森球工程。
- **显示名称 en-US：** Anarchy
- **显示名称 zh-CN：** 安那其主义
- **显示名称 zh-TW：** 安那其主義
- **说明 en-US：** Complete the Anarchy challenge without equipping Policy Cards. The End of Prestige is the sole exception.
- **说明 zh-CN：** 不装备政策卡（《轮回之终末》除外），完成戴森球工程。
- **说明 zh-TW：** 不裝備政策卡（《輪迴之終末》除外），完成戴森球工程。
- **已解锁图标：** `assets/challenges/challenge-anarchy.png` — 导出 256×256 方形 PNG 后上传。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 22. 美好旧日

- **内部 key：** `challengeGoodOldDays`
- **API Name：** `SHELLBREAK_CHALLENGE_GOOD_OLD_DAYS`
- **解锁条件（核对用）：** 全程保持酋邦制，完成戴森球工程。
- **显示名称 en-US：** The Good Old Days
- **显示名称 zh-CN：** 美好旧日
- **显示名称 zh-TW：** 美好舊日
- **说明 en-US：** Complete the Good Old Days challenge while keeping Chiefdom throughout the run.
- **说明 zh-CN：** 全程保持酋邦制，完成戴森球工程。
- **说明 zh-TW：** 全程維持酋邦制，完成戴森球工程。
- **已解锁图标：** `assets/challenges/challenge-good-old-days.png` — 导出 256×256 方形 PNG 后上传。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 23. 三地发射网

- **内部 key：** `challengeThreeLaunchSites`
- **API Name：** `SHELLBREAK_CHALLENGE_THREE_LAUNCH_SITES`
- **解锁条件（核对用）：** 戴森球竣工时，欧罗巴、泰拉和恩克拉多斯发射场都达到 11 级。
- **显示名称 en-US：** Three Launch Sites
- **显示名称 zh-CN：** 三地发射网
- **显示名称 zh-TW：** 三地發射網
- **说明 en-US：** Complete the Three Launch Sites challenge with the Europa, Terra, and Enceladus launch sites all at level 11.
- **说明 zh-CN：** 完成戴森球工程时，让欧罗巴、泰拉和恩克拉多斯发射场都达到 11 级。
- **说明 zh-TW：** 完成戴森球工程時，讓歐羅巴、泰拉和恩克拉多斯發射場都達到 11 級。
- **已解锁图标：** `assets/challenges/challenge-three-launch-sites.png` — 导出 256×256 方形 PNG 后上传。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 24. 永恒与须臾

- **内部 key：** `challengeEternityMoment`
- **API Name：** `SHELLBREAK_CHALLENGE_ETERNITY_MOMENT`
- **解锁条件（核对用）：** 完成全部三档，并分别在 5、10、20 倍目标倍率下竣工戴森球。
- **显示名称 en-US：** Eternity and the Instantaneous
- **显示名称 zh-CN：** 永恒与须臾
- **显示名称 zh-TW：** 永恆與須臾
- **说明 en-US：** Complete all three tiers, building a Dyson Sphere at the 5×, 10×, and 20× objective multipliers.
- **说明 zh-CN：** 完成全部三档，并分别在 5、10、20 倍目标倍率下竣工戴森球。
- **说明 zh-TW：** 完成全部三檔，並分別在 5、10、20 倍目標倍率下竣工戴森球。
- **已解锁图标：** `assets/challenges/challenge-eternity-moment.png` — 导出 256×256 方形 PNG 后上传。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 25. 批判的武器

- **内部 key：** `challengePacifist`
- **API Name：** `SHELLBREAK_CHALLENGE_PACIFIST`
- **解锁条件（核对用）：** 不进行劫掠、入侵或全面战争，完成戴森球工程。
- **显示名称 en-US：** The Weapon of Critique
- **显示名称 zh-CN：** 批判的武器
- **显示名称 zh-TW：** 批判的武器
- **说明 en-US：** Complete the Dyson Sphere without raiding, invading, or starting a full-scale war.
- **说明 zh-CN：** 不进行劫掠、入侵或全面战争，完成戴森球工程。
- **说明 zh-TW：** 不進行劫掠、入侵或全面戰爭，完成戴森球工程。
- **已解锁图标：** `assets/challenges/challenge-pacifist-illustrated.webp` — 转成 256×256 方形 PNG 后上传。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 26. 武器的批判

- **内部 key：** `challengeWeaponCritique`
- **API Name：** `SHELLBREAK_CHALLENGE_WEAPON_CRITIQUE`
- **解锁条件（核对用）：** 不传播文化或信仰，也不建立贸易路线，完成戴森球工程。
- **显示名称 en-US：** The Critique of Weapons
- **显示名称 zh-CN：** 武器的批判
- **显示名称 zh-TW：** 武器的批判
- **说明 en-US：** Complete the Dyson Sphere without using cultural or religious Soft Power or establishing Trade Routes.
- **说明 zh-CN：** 不传播文化或信仰，也不建立贸易路线，完成戴森球工程。
- **说明 zh-TW：** 不傳播文化或信仰，也不建立貿易路線，完成戴森球工程。
- **已解锁图标：** `assets/challenges/challenge-weapon-critique-illustrated.webp` — 转成 256×256 方形 PNG 后上传。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 27. 核战教条

- **内部 key：** `challengeTotalWarDoctrine`
- **API Name：** `SHELLBREAK_CHALLENGE_TOTALWAR_DOCTRINE`
- **解锁条件（核对用）：** 全程只发动全面战争，不劫掠或入侵，并完成戴森球工程。
- **显示名称 en-US：** Fight Early, Fight Big, Go Nuclear
- **显示名称 zh-CN：** 核战教条
- **显示名称 zh-TW：** 核戰教條
- **说明 en-US：** Complete the Dyson Sphere using only Total War actions; Raids and Invasions are forbidden.
- **说明 zh-CN：** 全程只发动全面战争，不劫掠或入侵，并完成戴森球工程。
- **说明 zh-TW：** 全程只發動全面戰爭，不劫掠或入侵，並完成戴森球工程。
- **已解锁图标：** `assets/challenges/challenge-totalwar-doctrine-illustrated.webp` — 转成 256×256 方形 PNG 后上传。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 28. 劫掠成性

- **内部 key：** `challengeRaider`
- **API Name：** `SHELLBREAK_CHALLENGE_RAIDER`
- **解锁条件（核对用）：** 只发动劫掠，不入侵或发动全面战争，并完成戴森球工程。
- **显示名称 en-US：** Loot and Leave
- **显示名称 zh-CN：** 劫掠成性
- **显示名称 zh-TW：** 劫掠成性
- **说明 en-US：** Complete the challenge using Raids alone; Invasions and Total War are forbidden.
- **说明 zh-CN：** 只发动劫掠，不入侵或发动全面战争，并完成戴森球工程。
- **说明 zh-TW：** 只發動劫掠，不入侵或發動全面戰爭，並完成戴森球工程。
- **已解锁图标：** `assets/challenges/challenge-raider-illustrated.webp` — 转成 256×256 方形 PNG 后上传。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### 29. 征服者

- **内部 key：** `challengeConqueror`
- **API Name：** `SHELLBREAK_CHALLENGE_CONQUEROR`
- **解锁条件（核对用）：** 完成全部三档，并在每档戴森球竣工前吞并全部七个敌国。
- **显示名称 en-US：** Conqueror of Seven
- **显示名称 zh-CN：** 征服者
- **显示名称 zh-TW：** 征服者
- **说明 en-US：** Complete all three tiers, annexing all seven rival nations before each Dyson Sphere is complete.
- **说明 zh-CN：** 完成全部三档，并在每档戴森球竣工前吞并全部七个敌国。
- **说明 zh-TW：** 完成全部三檔，並在每檔戴森球竣工前吞併全部七個敵國。
- **已解锁图标：** `assets/challenges/challenge-conqueror-illustrated.webp` — 转成 256×256 方形 PNG 后上传。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

## 建筑成就（53 项）

所有建筑成就共用以下实际判定：**该建筑跨周目累计建造等级达到 100 级**。达成后，后续每个轮回首次建造该建筑免费。建筑表随当前 `SB.BUILDINGS` 生成；每项单独创建，不能在 Steamworks 里使用占位符模板。

### B01. 深海藻场：轻车熟路

- **内部 key：** `bld_kelp`
- **API Name：** `SHELLBREAK_BLD_KELP`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Deep-Sea Kelp Farm: Second Nature
- **显示名称 zh-CN：** 深海藻场：轻车熟路
- **显示名称 zh-TW：** 深海藻場：輕車熟路
- **说明 en-US：** Build up 100 total levels of Deep-Sea Kelp Farm across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把深海藻场的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把深海藻場的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-1/era1-kelp.png` — 已整理为上传包中的 `SHELLBREAK_BLD_KELP_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B02. 礁口巢：轻车熟路

- **内部 key：** `bld_nest`
- **API Name：** `SHELLBREAK_BLD_NEST`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Reef Nest: Second Nature
- **显示名称 zh-CN：** 礁口巢：轻车熟路
- **显示名称 zh-TW：** 礁口巢：輕車熟路
- **说明 en-US：** Build up 100 total levels of Reef Nest across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把礁口巢的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把礁口巢的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-1/era1-nest.png` — 已整理为上传包中的 `SHELLBREAK_BLD_NEST_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B03. 石屋：轻车熟路

- **内部 key：** `bld_coralhouse`
- **API Name：** `SHELLBREAK_BLD_CORALHOUSE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Stone House: Second Nature
- **显示名称 zh-CN：** 石屋：轻车熟路
- **显示名称 zh-TW：** 石屋：輕車熟路
- **说明 en-US：** Build up 100 total levels of Stone House across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把石屋的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把石屋的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-1/era1-coralhouse.png` — 已整理为上传包中的 `SHELLBREAK_BLD_CORALHOUSE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B04. 砂矿坑：轻车熟路

- **内部 key：** `bld_siltpit`
- **API Name：** `SHELLBREAK_BLD_SILTPIT`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Silt Pit: Second Nature
- **显示名称 zh-CN：** 砂矿坑：轻车熟路
- **显示名称 zh-TW：** 砂礦坑：輕車熟路
- **说明 en-US：** Build up 100 total levels of Silt Pit across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把砂矿坑的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把砂礦坑的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-1/era1-siltpit.png` — 已整理为上传包中的 `SHELLBREAK_BLD_SILTPIT_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B05. 议事厅：轻车熟路

- **内部 key：** `bld_hall`
- **API Name：** `SHELLBREAK_BLD_HALL`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Council Hall: Second Nature
- **显示名称 zh-CN：** 议事厅：轻车熟路
- **显示名称 zh-TW：** 議事廳：輕車熟路
- **说明 en-US：** Build up 100 total levels of Council Hall across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把议事厅的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把議事廳的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-1/era1-hall.png` — 已整理为上传包中的 `SHELLBREAK_BLD_HALL_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B06. 喷口导流堤：轻车熟路

- **内部 key：** `bld_weir`
- **API Name：** `SHELLBREAK_BLD_WEIR`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Vent Weir: Second Nature
- **显示名称 zh-CN：** 喷口导流堤：轻车熟路
- **显示名称 zh-TW：** 噴口導流堤：輕車熟路
- **说明 en-US：** Build up 100 total levels of Vent Weir across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把喷口导流堤的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把噴口導流堤的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-1/era1-weir.png` — 已整理为上传包中的 `SHELLBREAK_BLD_WEIR_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B07. 深海鱼牧场：轻车熟路

- **内部 key：** `bld_warmnest`
- **API Name：** `SHELLBREAK_BLD_WARMNEST`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Deep-Sea Fish Farm: Second Nature
- **显示名称 zh-CN：** 深海鱼牧场：轻车熟路
- **显示名称 zh-TW：** 深海魚牧場：輕車熟路
- **说明 en-US：** Build up 100 total levels of Deep-Sea Fish Farm across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把深海鱼牧场的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把深海魚牧場的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-1/era1-warmnest.png` — 已整理为上传包中的 `SHELLBREAK_BLD_WARMNEST_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B08. 海藻仓：轻车熟路

- **内部 key：** `bld_kelpstore`
- **API Name：** `SHELLBREAK_BLD_KELPSTORE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Kelp Store: Second Nature
- **显示名称 zh-CN：** 海藻仓：轻车熟路
- **显示名称 zh-TW：** 海藻倉：輕車熟路
- **说明 en-US：** Build up 100 total levels of Kelp Store across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把海藻仓的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把海藻倉的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-1/era1-kelpstore.png` — 已整理为上传包中的 `SHELLBREAK_BLD_KELPSTORE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B09. 压舱仓：轻车熟路

- **内部 key：** `bld_ballast`
- **API Name：** `SHELLBREAK_BLD_BALLAST`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Ballast Warehouse: Second Nature
- **显示名称 zh-CN：** 压舱仓：轻车熟路
- **显示名称 zh-TW：** 壓艙倉：輕車熟路
- **说明 en-US：** Build up 100 total levels of Ballast Warehouse across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把压舱仓的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把壓艙倉的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-2/era2-ballast.png` — 已整理为上传包中的 `SHELLBREAK_BLD_BALLAST_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B10. 灯塔：轻车熟路

- **内部 key：** `bld_lighthouse`
- **API Name：** `SHELLBREAK_BLD_LIGHTHOUSE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Lighthouse: Second Nature
- **显示名称 zh-CN：** 灯塔：轻车熟路
- **显示名称 zh-TW：** 燈塔：輕車熟路
- **说明 en-US：** Build up 100 total levels of Lighthouse across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把灯塔的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把燈塔的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-2/era2-lighthouse.png` — 已整理为上传包中的 `SHELLBREAK_BLD_LIGHTHOUSE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B11. 工坊：轻车熟路

- **内部 key：** `bld_workshop`
- **API Name：** `SHELLBREAK_BLD_WORKSHOP`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Workshop: Second Nature
- **显示名称 zh-CN：** 工坊：轻车熟路
- **显示名称 zh-TW：** 工坊：輕車熟路
- **说明 en-US：** Build up 100 total levels of Workshop across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把工坊的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把工坊的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-1/era1-workshop.png` — 已整理为上传包中的 `SHELLBREAK_BLD_WORKSHOP_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B12. 热泉炉：轻车熟路

- **内部 key：** `bld_furnace`
- **API Name：** `SHELLBREAK_BLD_FURNACE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Hot Spring Furnace: Second Nature
- **显示名称 zh-CN：** 热泉炉：轻车熟路
- **显示名称 zh-TW：** 熱泉爐：輕車熟路
- **说明 en-US：** Build up 100 total levels of Hot Spring Furnace across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把热泉炉的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把熱泉爐的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-2/era2-furnace.png` — 已整理为上传包中的 `SHELLBREAK_BLD_FURNACE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B13. 潮纹馆：轻车熟路

- **内部 key：** `bld_library`
- **API Name：** `SHELLBREAK_BLD_LIBRARY`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Tidal Library: Second Nature
- **显示名称 zh-CN：** 潮纹馆：轻车熟路
- **显示名称 zh-TW：** 潮紋館：輕車熟路
- **说明 en-US：** Build up 100 total levels of Tidal Library across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把潮纹馆的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把潮紋館的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-1/era1-library.png` — 已整理为上传包中的 `SHELLBREAK_BLD_LIBRARY_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B14. 研究所：轻车熟路

- **内部 key：** `bld_institute`
- **API Name：** `SHELLBREAK_BLD_INSTITUTE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Research Institute: Second Nature
- **显示名称 zh-CN：** 研究所：轻车熟路
- **显示名称 zh-TW：** 研究所：輕車熟路
- **说明 en-US：** Build up 100 total levels of Research Institute across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把研究所的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把研究所的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-2/era2-institute.png` — 已整理为上传包中的 `SHELLBREAK_BLD_INSTITUTE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B15. 广场：轻车熟路

- **内部 key：** `bld_square`
- **API Name：** `SHELLBREAK_BLD_SQUARE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Plaza: Second Nature
- **显示名称 zh-CN：** 广场：轻车熟路
- **显示名称 zh-TW：** 廣場：輕車熟路
- **说明 en-US：** Build up 100 total levels of Plaza across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把广场的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把廣場的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-2/era2-square.png` — 已整理为上传包中的 `SHELLBREAK_BLD_SQUARE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B16. 神庙：轻车熟路

- **内部 key：** `bld_temple`
- **API Name：** `SHELLBREAK_BLD_TEMPLE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Temple: Second Nature
- **显示名称 zh-CN：** 神庙：轻车熟路
- **显示名称 zh-TW：** 神廟：輕車熟路
- **说明 en-US：** Build up 100 total levels of Temple across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把神庙的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把神廟的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-2/era2-temple.png` — 已整理为上传包中的 `SHELLBREAK_BLD_TEMPLE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B17. 热液汽轮机：轻车熟路

- **内部 key：** `bld_hydroturbine`
- **API Name：** `SHELLBREAK_BLD_HYDROTURBINE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Hydrothermal Turbine: Second Nature
- **显示名称 zh-CN：** 热液汽轮机：轻车熟路
- **显示名称 zh-TW：** 熱液汽輪機：輕車熟路
- **说明 en-US：** Build up 100 total levels of Hydrothermal Turbine across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把热液汽轮机的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把熱液汽輪機的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-3/era3-hydroturbine.png` — 已整理为上传包中的 `SHELLBREAK_BLD_HYDROTURBINE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B18. 热液工坊：轻车熟路

- **内部 key：** `bld_hydroshop`
- **API Name：** `SHELLBREAK_BLD_HYDROSHOP`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Hydrothermal Workshop: Second Nature
- **显示名称 zh-CN：** 热液工坊：轻车熟路
- **显示名称 zh-TW：** 熱液工坊：輕車熟路
- **说明 en-US：** Build up 100 total levels of Hydrothermal Workshop across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把热液工坊的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把熱液工坊的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-3/era3-hydroshop.png` — 已整理为上传包中的 `SHELLBREAK_BLD_HYDROSHOP_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B19. 王国潮道：轻车熟路

- **内部 key：** `bld_canal`
- **API Name：** `SHELLBREAK_BLD_CANAL`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Royal Canal: Second Nature
- **显示名称 zh-CN：** 王国潮道：轻车熟路
- **显示名称 zh-TW：** 王國潮道：輕車熟路
- **说明 en-US：** Build up 100 total levels of Royal Canal across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把王国潮道的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把王國潮道的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-3/era3-canal.png` — 已整理为上传包中的 `SHELLBREAK_BLD_CANAL_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B20. 公民会堂：轻车熟路

- **内部 key：** `bld_civichall`
- **API Name：** `SHELLBREAK_BLD_CIVICHALL`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Civic Hall: Second Nature
- **显示名称 zh-CN：** 公民会堂：轻车熟路
- **显示名称 zh-TW：** 公民會堂：輕車熟路
- **说明 en-US：** Build up 100 total levels of Civic Hall across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把公民会堂的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把公民會堂的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-3/era3-civichall.svg` — 已整理为上传包中的 `SHELLBREAK_BLD_CIVICHALL_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B21. 天壳观测站：轻车熟路

- **内部 key：** `bld_observatory`
- **API Name：** `SHELLBREAK_BLD_OBSERVATORY`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Shell Observatory: Second Nature
- **显示名称 zh-CN：** 天壳观测站：轻车熟路
- **显示名称 zh-TW：** 天殼觀測站：輕車熟路
- **说明 en-US：** Build up 100 total levels of Shell Observatory across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把天壳观测站的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把天殼觀測站的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-4/era4-observatory.png` — 已整理为上传包中的 `SHELLBREAK_BLD_OBSERVATORY_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B22. 速生珊瑚林：轻车熟路

- **内部 key：** `bld_coralfarm`
- **API Name：** `SHELLBREAK_BLD_CORALFARM`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Fast-Growing Coral Grove: Second Nature
- **显示名称 zh-CN：** 速生珊瑚林：轻车熟路
- **显示名称 zh-TW：** 速生珊瑚林：輕車熟路
- **说明 en-US：** Build up 100 total levels of Fast-Growing Coral Grove across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把速生珊瑚林的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把速生珊瑚林的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-4/era4-coralfarm.png` — 已整理为上传包中的 `SHELLBREAK_BLD_CORALFARM_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B23. 银行：轻车熟路

- **内部 key：** `bld_bank`
- **API Name：** `SHELLBREAK_BLD_BANK`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Bank: Second Nature
- **显示名称 zh-CN：** 银行：轻车熟路
- **显示名称 zh-TW：** 銀行：輕車熟路
- **说明 en-US：** Build up 100 total levels of Bank across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把银行的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把銀行的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-4/era4-bank.png` — 已整理为上传包中的 `SHELLBREAK_BLD_BANK_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B24. 商队驿站：轻车熟路

- **内部 key：** `bld_caravanserai`
- **API Name：** `SHELLBREAK_BLD_CARAVANSERAI`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Caravanserai: Second Nature
- **显示名称 zh-CN：** 商队驿站：轻车熟路
- **显示名称 zh-TW：** 商隊驛站：輕車熟路
- **说明 en-US：** Build up 100 total levels of Caravanserai across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把商队驿站的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把商隊驛站的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-4/era4-caravanserai.png` — 已整理为上传包中的 `SHELLBREAK_BLD_CARAVANSERAI_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B25. 博物馆：轻车熟路

- **内部 key：** `bld_museum`
- **API Name：** `SHELLBREAK_BLD_MUSEUM`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Museum: Second Nature
- **显示名称 zh-CN：** 博物馆：轻车熟路
- **显示名称 zh-TW：** 博物館：輕車熟路
- **说明 en-US：** Build up 100 total levels of Museum across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把博物馆的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把博物館的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-4/era4-museum.png` — 已整理为上传包中的 `SHELLBREAK_BLD_MUSEUM_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B26. 黑色方碑：轻车熟路

- **内部 key：** `bld_black_monolith`
- **API Name：** `SHELLBREAK_BLD_BLACK_MONOLITH`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Black Obelisk: Second Nature
- **显示名称 zh-CN：** 黑色方碑：轻车熟路
- **显示名称 zh-TW：** 黑色方碑：輕車熟路
- **说明 en-US：** Build up 100 total levels of Black Obelisk across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把黑色方碑的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把黑色方碑的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-9/era9-black-monolith-v2.png` — 已整理为上传包中的 `SHELLBREAK_BLD_BLACK_MONOLITH_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B27. 热锻工厂：轻车熟路

- **内部 key：** `bld_hotforge`
- **API Name：** `SHELLBREAK_BLD_HOTFORGE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Hot Forge: Second Nature
- **显示名称 zh-CN：** 热锻工厂：轻车熟路
- **显示名称 zh-TW：** 熱鍛工廠：輕車熟路
- **说明 en-US：** Build up 100 total levels of Hot Forge across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把热锻工厂的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把熱鍛工廠的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-5/era5-hotforge.png` — 已整理为上传包中的 `SHELLBREAK_BLD_HOTFORGE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B28. 学校：轻车熟路

- **内部 key：** `bld_school`
- **API Name：** `SHELLBREAK_BLD_SCHOOL`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** School: Second Nature
- **显示名称 zh-CN：** 学校：轻车熟路
- **显示名称 zh-TW：** 學校：輕車熟路
- **说明 en-US：** Build up 100 total levels of School across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把学校的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把學校的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-5/era5-school.png` — 已整理为上传包中的 `SHELLBREAK_BLD_SCHOOL_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B29. 歌剧院：轻车熟路

- **内部 key：** `bld_theater`
- **API Name：** `SHELLBREAK_BLD_THEATER`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Opera House: Second Nature
- **显示名称 zh-CN：** 歌剧院：轻车熟路
- **显示名称 zh-TW：** 歌劇院：輕車熟路
- **说明 en-US：** Build up 100 total levels of Opera House across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把歌剧院的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把歌劇院的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-5/era5-theater.png` — 已整理为上传包中的 `SHELLBREAK_BLD_THEATER_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B30. 廉租社区：轻车熟路

- **内部 key：** `bld_tenement`
- **API Name：** `SHELLBREAK_BLD_TENEMENT`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Low-Rent Community: Second Nature
- **显示名称 zh-CN：** 廉租社区：轻车熟路
- **显示名称 zh-TW：** 廉租社群：輕車熟路
- **说明 en-US：** Build up 100 total levels of Low-Rent Community across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把廉租社区的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把廉租社群的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-5/era5-tenement.png` — 已整理为上传包中的 `SHELLBREAK_BLD_TENEMENT_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B31. 科研所：轻车熟路

- **内部 key：** `bld_researchlab`
- **API Name：** `SHELLBREAK_BLD_RESEARCHLAB`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Research Lab: Second Nature
- **显示名称 zh-CN：** 科研所：轻车熟路
- **显示名称 zh-TW：** 科研所：輕車熟路
- **说明 en-US：** Build up 100 total levels of Research Lab across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把科研所的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把科研所的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-6/era6-researchlab.png` — 已整理为上传包中的 `SHELLBREAK_BLD_RESEARCHLAB_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B32. 轨道卫星：轻车熟路

- **内部 key：** `bld_satellite`
- **API Name：** `SHELLBREAK_BLD_SATELLITE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Orbital Satellite: Second Nature
- **显示名称 zh-CN：** 轨道卫星：轻车熟路
- **显示名称 zh-TW：** 軌道衛星：輕車熟路
- **说明 en-US：** Build up 100 total levels of Orbital Satellite across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把轨道卫星的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把軌道衛星的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-7/era7-satellite.png` — 已整理为上传包中的 `SHELLBREAK_BLD_SATELLITE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B33. 空间站：轻车熟路

- **内部 key：** `bld_spacestation`
- **API Name：** `SHELLBREAK_BLD_SPACESTATION`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Space Station: Second Nature
- **显示名称 zh-CN：** 空间站：轻车熟路
- **显示名称 zh-TW：** 空間站：輕車熟路
- **说明 en-US：** Build up 100 total levels of Space Station across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把空间站的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把空間站的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-7/era7-spacestation.png` — 已整理为上传包中的 `SHELLBREAK_BLD_SPACESTATION_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B34. 核热厂：轻车熟路

- **内部 key：** `bld_fissionplant`
- **API Name：** `SHELLBREAK_BLD_FISSIONPLANT`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Nuclear Heat Plant: Second Nature
- **显示名称 zh-CN：** 核热厂：轻车熟路
- **显示名称 zh-TW：** 核熱廠：輕車熟路
- **说明 en-US：** Build up 100 total levels of Nuclear Heat Plant across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把核热厂的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把核熱廠的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-7/era7-fissionplant.png` — 已整理为上传包中的 `SHELLBREAK_BLD_FISSIONPLANT_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B35. 体育场：轻车熟路

- **内部 key：** `bld_stadium`
- **API Name：** `SHELLBREAK_BLD_STADIUM`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Stadium: Second Nature
- **显示名称 zh-CN：** 体育场：轻车熟路
- **显示名称 zh-TW：** 體育場：輕車熟路
- **说明 en-US：** Build up 100 total levels of Stadium across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把体育场的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把體育場的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-7/era7-stadium.png` — 已整理为上传包中的 `SHELLBREAK_BLD_STADIUM_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B36. 生物材料研究所：轻车熟路

- **内部 key：** `bld_biomatlab`
- **API Name：** `SHELLBREAK_BLD_BIOMATLAB`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Biomaterials Research Institute: Second Nature
- **显示名称 zh-CN：** 生物材料研究所：轻车熟路
- **显示名称 zh-TW：** 生物材料研究所：輕車熟路
- **说明 en-US：** Build up 100 total levels of Biomaterials Research Institute across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把生物材料研究所的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把生物材料研究所的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-8/era8-biomatlab.png` — 已整理为上传包中的 `SHELLBREAK_BLD_BIOMATLAB_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B37. 瑞亚星矿井：轻车熟路

- **内部 key：** `bld_rheamine`
- **API Name：** `SHELLBREAK_BLD_RHEAMINE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Rhea Mine: Second Nature
- **显示名称 zh-CN：** 瑞亚星矿井：轻车熟路
- **显示名称 zh-TW：** 瑞亞星礦井：輕車熟路
- **说明 en-US：** Build up 100 total levels of Rhea Mine across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把瑞亚星矿井的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把瑞亞星礦井的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-8/era8-rheamine.png` — 已整理为上传包中的 `SHELLBREAK_BLD_RHEAMINE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B38. 泰坦星气云采集站：轻车熟路

- **内部 key：** `bld_titancloud`
- **API Name：** `SHELLBREAK_BLD_TITANCLOUD`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Titan Cloud Harvester: Second Nature
- **显示名称 zh-CN：** 泰坦星气云采集站：轻车熟路
- **显示名称 zh-TW：** 泰坦星氣雲採集站：輕車熟路
- **说明 en-US：** Build up 100 total levels of Titan Cloud Harvester across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把泰坦星气云采集站的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把泰坦星氣雲採集站的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-8/era8-titancloud.png` — 已整理为上传包中的 `SHELLBREAK_BLD_TITANCLOUD_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B39. 机器人充能站：轻车熟路

- **内部 key：** `bld_robotbay`
- **API Name：** `SHELLBREAK_BLD_ROBOTBAY`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Robot Charging Station: Second Nature
- **显示名称 zh-CN：** 机器人充能站：轻车熟路
- **显示名称 zh-TW：** 機器人充能站：輕車熟路
- **说明 en-US：** Build up 100 total levels of Robot Charging Station across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把机器人充能站的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把機器人充能站的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-8/era8-robotbay.png` — 已整理为上传包中的 `SHELLBREAK_BLD_ROBOTBAY_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B40. 马尔斯工造中心：轻车熟路

- **内部 key：** `bld_mars_workshop`
- **API Name：** `SHELLBREAK_BLD_MARS_WORKSHOP`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Mars Foundry: Second Nature
- **显示名称 zh-CN：** 马尔斯工造中心：轻车熟路
- **显示名称 zh-TW：** 馬爾斯工造中心：輕車熟路
- **说明 en-US：** Build up 100 total levels of Mars Foundry across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把马尔斯工造中心的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把馬爾斯工造中心的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-9/era9-mars-workshop.png` — 已整理为上传包中的 `SHELLBREAK_BLD_MARS_WORKSHOP_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B41. 欧罗巴冰面发射场：轻车熟路

- **内部 key：** `bld_europa_launch`
- **API Name：** `SHELLBREAK_BLD_EUROPA_LAUNCH`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Europa Ice Launch Site: Second Nature
- **显示名称 zh-CN：** 欧罗巴冰面发射场：轻车熟路
- **显示名称 zh-TW：** 歐羅巴冰面發射場：輕車熟路
- **说明 en-US：** Build up 100 total levels of Europa Ice Launch Site across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把欧罗巴冰面发射场的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把歐羅巴冰面發射場的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-9/era9-europa-launch-v2.png` — 已整理为上传包中的 `SHELLBREAK_BLD_EUROPA_LAUNCH_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B42. 太阳星环：轻车熟路

- **内部 key：** `bld_solar_ring`
- **API Name：** `SHELLBREAK_BLD_SOLAR_RING`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Solar Ring: Second Nature
- **显示名称 zh-CN：** 太阳星环：轻车熟路
- **显示名称 zh-TW：** 太陽星環：輕車熟路
- **说明 en-US：** Build up 100 total levels of Solar Ring across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把太阳星环的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把太陽星環的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-10/era10-solar-ring-v2.png` — 已整理为上传包中的 `SHELLBREAK_BLD_SOLAR_RING_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B43. 泰拉星轨道发射场：轻车熟路

- **内部 key：** `bld_terra_launch`
- **API Name：** `SHELLBREAK_BLD_TERRA_LAUNCH`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Terra Orbital Launch Site: Second Nature
- **显示名称 zh-CN：** 泰拉星轨道发射场：轻车熟路
- **显示名称 zh-TW：** 泰拉星軌道發射場：輕車熟路
- **说明 en-US：** Build up 100 total levels of Terra Orbital Launch Site across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把泰拉星轨道发射场的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把泰拉星軌道發射場的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-10/era10-terra-launch.png` — 已整理为上传包中的 `SHELLBREAK_BLD_TERRA_LAUNCH_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B44. 恩克拉多斯星轨道发射场：轻车熟路

- **内部 key：** `bld_enceladus_launch`
- **API Name：** `SHELLBREAK_BLD_ENCELADUS_LAUNCH`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Enceladus Orbital Launch Site: Second Nature
- **显示名称 zh-CN：** 恩克拉多斯星轨道发射场：轻车熟路
- **显示名称 zh-TW：** 恩克拉多斯星軌道發射場：輕車熟路
- **说明 en-US：** Build up 100 total levels of Enceladus Orbital Launch Site across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把恩克拉多斯星轨道发射场的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把恩克拉多斯星軌道發射場的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-10/era10-enceladus-launch.png` — 已整理为上传包中的 `SHELLBREAK_BLD_ENCELADUS_LAUNCH_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B45. 虚境祭坛：轻车熟路

- **内部 key：** `bld_void_altar`
- **API Name：** `SHELLBREAK_BLD_VOID_ALTAR`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Verge Altar: Second Nature
- **显示名称 zh-CN：** 虚境祭坛：轻车熟路
- **显示名称 zh-TW：** 虛境祭壇：輕車熟路
- **说明 en-US：** Build up 100 total levels of Verge Altar across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把虚境祭坛的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把虛境祭壇的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-10/era10-void-altar-v2.png` — 已整理为上传包中的 `SHELLBREAK_BLD_VOID_ALTAR_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B46. 泰拉地壳密闭水舱巨构：轻车熟路

- **内部 key：** `bld_terra_vat`
- **API Name：** `SHELLBREAK_BLD_TERRA_VAT`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Terra Crust-Sealed Water Vat Megastructure: Second Nature
- **显示名称 zh-CN：** 泰拉地壳密闭水舱巨构：轻车熟路
- **显示名称 zh-TW：** 泰拉地殼密閉水艙巨構：輕車熟路
- **说明 en-US：** Build up 100 total levels of Terra Crust-Sealed Water Vat Megastructure across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把泰拉地壳密闭水舱巨构的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把泰拉地殼密閉水艙巨構的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-10/era10-terra-vat.png` — 已整理为上传包中的 `SHELLBREAK_BLD_TERRA_VAT_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B47. 行星发动机：轻车熟路

- **内部 key：** `bld_terra_engine`
- **API Name：** `SHELLBREAK_BLD_TERRA_ENGINE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Planetary Engine: Second Nature
- **显示名称 zh-CN：** 行星发动机：轻车熟路
- **显示名称 zh-TW：** 行星發動機：輕車熟路
- **说明 en-US：** Build up 100 total levels of Planetary Engine across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把行星发动机的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把行星發動機的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-10/era10-terra-engine.png` — 已整理为上传包中的 `SHELLBREAK_BLD_TERRA_ENGINE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B48. 潮汐往复机：轻车熟路

- **内部 key：** `bld_tidemachine`
- **API Name：** `SHELLBREAK_BLD_TIDEMACHINE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Tidal Engine: Second Nature
- **显示名称 zh-CN：** 潮汐往复机：轻车熟路
- **显示名称 zh-TW：** 潮汐往復機：輕車熟路
- **说明 en-US：** Build up 100 total levels of Tidal Engine across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把潮汐往复机的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把潮汐往復機的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-3/era3-tidemachine.png` — 已整理为上传包中的 `SHELLBREAK_BLD_TIDEMACHINE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B49. 太阳能基站：轻车熟路

- **内部 key：** `bld_solarstation`
- **API Name：** `SHELLBREAK_BLD_SOLARSTATION`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Solar Power Station: Second Nature
- **显示名称 zh-CN：** 太阳能基站：轻车熟路
- **显示名称 zh-TW：** 太陽能基站：輕車熟路
- **说明 en-US：** Build up 100 total levels of Solar Power Station across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把太阳能基站的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把太陽能基站的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-6/era6-solarstation.png` — 已整理为上传包中的 `SHELLBREAK_BLD_SOLARSTATION_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B50. 恩拉多克斯阵列风场：轻车熟路

- **内部 key：** `bld_enladofarm`
- **API Name：** `SHELLBREAK_BLD_ENLADOFARM`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Enladox Array Wind Farm: Second Nature
- **显示名称 zh-CN：** 恩拉多克斯阵列风场：轻车熟路
- **显示名称 zh-TW：** 恩拉多克斯陣列風場：輕車熟路
- **说明 en-US：** Build up 100 total levels of Enladox Array Wind Farm across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把恩拉多克斯阵列风场的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把恩拉多克斯陣列風場的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-9/era9-enladofarm.png` — 已整理为上传包中的 `SHELLBREAK_BLD_ENLADOFARM_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B51. 墓地：轻车熟路

- **内部 key：** `bld_grave`
- **API Name：** `SHELLBREAK_BLD_GRAVE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Graveyard: Second Nature
- **显示名称 zh-CN：** 墓地：轻车熟路
- **显示名称 zh-TW：** 墓地：輕車熟路
- **说明 en-US：** Build up 100 total levels of Graveyard across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把墓地的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把墓地的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-3/era3-grave.png` — 已整理为上传包中的 `SHELLBREAK_BLD_GRAVE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B52. 医院：轻车熟路

- **内部 key：** `bld_hospital`
- **API Name：** `SHELLBREAK_BLD_HOSPITAL`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Hospital: Second Nature
- **显示名称 zh-CN：** 医院：轻车熟路
- **显示名称 zh-TW：** 醫院：輕車熟路
- **说明 en-US：** Build up 100 total levels of Hospital across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把医院的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把醫院的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-4/era4-hospital.png` — 已整理为上传包中的 `SHELLBREAK_BLD_HOSPITAL_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B53. 保护区：轻车熟路

- **内部 key：** `bld_reserve`
- **API Name：** `SHELLBREAK_BLD_RESERVE`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Nature Reserve: Second Nature
- **显示名称 zh-CN：** 保护区：轻车熟路
- **显示名称 zh-TW：** 保護區：輕車熟路
- **说明 en-US：** Build up 100 total levels of Nature Reserve across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把保护区的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把保護區的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-7/era7-reserve.png` — 已整理为上传包中的 `SHELLBREAK_BLD_RESERVE_ACHIEVED.png`（256×256 PNG）；未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B54. 军营：轻车熟路

- **内部 key：** `bld_barracks`
- **API Name：** `SHELLBREAK_BLD_BARRACKS`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Barracks: Second Nature
- **显示名称 zh-CN：** 军营：轻车熟路
- **显示名称 zh-TW：** 軍營：輕車熟路
- **说明 en-US：** Build up 100 total levels of Barracks across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把军营的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把軍營的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-2/era2-barracks.png` — 已整理为上传包中的 `SHELLBREAK_BLD_BARRACKS_ACHIEVED.png`（256×256 PNG）；已保存到 Steamworks，未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B55. 要塞：轻车熟路

- **内部 key：** `bld_fortress`
- **API Name：** `SHELLBREAK_BLD_FORTRESS`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Fortress: Second Nature
- **显示名称 zh-CN：** 要塞：轻车熟路
- **显示名称 zh-TW：** 要塞：輕車熟路
- **说明 en-US：** Build up 100 total levels of Fortress across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把要塞的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把要塞的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-3/era3-fortress.png` — 已整理为上传包中的 `SHELLBREAK_BLD_FORTRESS_ACHIEVED.png`（256×256 PNG）；已保存到 Steamworks，未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

### B56. 王立士官学院：轻车熟路

- **内部 key：** `bld_military_academy`
- **API Name：** `SHELLBREAK_BLD_MILITARY_ACADEMY`
- **解锁条件（核对用）：** 跨周目累计建造等级达到 100 级。
- **显示名称 en-US：** Royal Military Academy: Second Nature
- **显示名称 zh-CN：** 王立士官学院：轻车熟路
- **显示名称 zh-TW：** 王立士官學院：輕車熟路
- **说明 en-US：** Build up 100 total levels of Royal Military Academy across all runs. Afterward, your first build of this structure in each new run is free.
- **说明 zh-CN：** 把王立士官学院的等级累计建到 100 级（跨周目合计）。达成后，每个轮回首次建造这座建筑不花材料。
- **说明 zh-TW：** 把王立士官學院的等級累計建到 100 級（跨週目合計）。達成後，每個輪迴首次建造這座建築不花材料。
- **已解锁图标：** `assets/building-icons/era-5/era5-military-academy.png` — 已整理为上传包中的 `SHELLBREAK_BLD_MILITARY_ACADEMY_ACHIEVED.png`（256×256 PNG）；已保存到 Steamworks，未达成灰度图由 Steam 自动生成。
- **Visibility：** `Visible`
- **其他字段：** 使用本文件“Steamworks 共用字段”。

## Steamworks 填报前检查

- [ ] 在 Steamworks 为应用启用 English、简体中文、繁体中文成就语言。
- [ ] Steamworks 录入前，将最终确认的三语成就文案同步登记到 i18n 文本清单。
- [x] 创建 85 条，API Name 与清单一致；Steam API Name 一旦在代码中使用就视为稳定 ID，不要随意改名。
- [x] 填入三种语言的名称与说明；85 项各 170 个名称/说明字段完整。
- [ ] 上传每项已解锁图标；在编辑器生成灰度未解锁图标。
- [ ] 验证普通条目为 `Visible`，`dysonEnd`、`voidEnd`、`pollutionClear` 为 `Spoiler`。
- [ ] 代码接入 Steamworks 后，按 API Name 调用解锁，并验证读档补发、重启同步及 Steam 客户端弹窗/成就页。
- [ ] 最终发行商店页的“Steam 成就”功能标记只在发行构建完成并验证后勾选。

## 当前状态与范围

- 此清单是 Steamworks 后台录入草案。Steamworks 现有 85 项条目和 56 个建筑进度关联均已保存为未发布草稿；Electron 代码已为 85 项成就映射 Steam API Name，并会把建筑累计等级同步至独立 Steam Stat。Steamworks 草稿需发布，含同步代码的新 Electron 版本也需随游戏发行，进度条才会开始更新。
- 本次新增的军营、要塞、王立士官学院已补入 Steamworks，并沿用建筑图标；它们的三语名称和说明已登记在本清单、i18n 文本清单和本地化 CSV。`SHELLBREAK_DRIFT_TERRA` 名称仍标记待校对。
- 上传包现含 85 张彩色 PNG（256×256）；Steamworks 可从彩色图自动生成灰度未达成图。此轮只上传了上述 3 张新增图标；其余现有条目的图标上传状态仍需在 Steamworks 继续核对。
- 当前 85 项低于 Steamworks 未完成审核应用的 100 项额度。

## 依据

- Steamworks 官方字段、成就集合、可见性、图标和本地化说明：[Step by Step: Achievements](https://partner.steamgames.com/doc/features/achievements/ach_guide)
- 当前定义与触发逻辑：`src/achv.js`、`src/challenges.js`、`src/shell.js`、`src/economy-tick.js`、`src/prestige.js`。


