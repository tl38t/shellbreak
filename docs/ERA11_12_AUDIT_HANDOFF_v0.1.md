# ERA11 / ERA12 实装工作全清单 · GPT 审查 + 帷幕图交接 v0.1

> 生成时间：2026-11-23。用途：① 把本轮 ERA11/12 **全部实装改动**写明，交 GPT 独立审查；② 把 10 张帷幕图的**出图 + 进度接口**移交 GPT。
> 本稿只记录**已完成的事实**与**待验的风险**，不拍板、不改数值、不跑 e2e、不发布。数值标定权在用户。
> 关联稿：`ERA11_12_SPEC_v0.1.md`（规格/拍板）、`ERA11_12_IMPL_PLAN_v0.1.md`（阶段顺序）、`ERA11_12_ART_PROMPTS_v0.1.md`（出图要求）。

### 审核基准（固定代码快照，2026-11-23 19:06 核对）

> ⚠️ **本稿描述的是一份未提交的工作树快照，不是一个 commit**。接手者请按下面的基准核对，不要假设它对应某个已发布版本。

| 项 | 值 |
|---|---|
| 基准 commit（HEAD） | `00b5a2a01cb89513ed70332dfb302f95cf4672ce` |
| 工作树状态 | **未提交**；本稿初核时（19:06）git status 为 **91 条变更**，二次审查时（21:22）为 **103 条**——增量来自期间新增的未跟踪资产（10 张 `veil-progress-{01..10}.webp` + 母图 + 3 奇观图等，非本轮代码改动）。**条数会随资产落盘变化，不作复核锚点；以 HEAD SHA 为准。** |
| 纳入本稿审核的改动范围 | 仅 §2 P0–P5 列出的 ERA11/12 相关文件（见下表），**不含**工作树里与 ERA11/12 无关的历史改动 |
| §6 检查对应的代码快照 | 上述 HEAD + 本轮工作树改动；`node --check` 与三份冒烟均在 2026-11-23 于该快照上执行 |
| 复核方法 | `git rev-parse HEAD` 应为上值（**硬锚点**）；工作树条数只参考、不作判据（见上条）；若 SHA 已变，§6 的检查结论需重新验证 |
| 工作簿 SHA 留存（2026-11-23） | HEAD 版（7588 行）`b6371ee447bf9b0e4510b7eedac9799c41f89748bfdf1350429409455ece9ee0`；首轮补登后（7609 行）`db8946264a1e21076669716ab72fe2ec7a3b2adb5619d2457f1a992303310ea2`；二次补登后（7610 行，含进度 key）`de7d98704ffa0b059e09ee58cab10d7672ffe9e795405981969a9099d78e258f`；本轮英文校对后（7610 行，`SB-007633` en-US 状态已校对）`f50fd5680aeb137719ba9585c656840462f764c991c4493f88f56a646a5cdc4b`。四版 SHA 均留存；同编号行的译文/状态变化可逐格复核。 |

**ERA11/12 相关文件清单（本稿审核范围）**：`src/{config,config-buildings,config-content,state,state-migrate,economy,economy-tick,economy-rates,prestige,war,tech,techs,wonder,workshop,game}.js`、`src/ui/{input,render-content,render-info,render-pane-wonder,render-pane-village,render-pane-research,veil-hub-ui}.js`、`src/locales/zh-CN.js`、`electron/locales/en-US.js`、`src/i18n.js`、`docs/ERA11_12_*.md`、`assets/{building-icons/era-11,resource-icons,tech-icons/era-{11,12},wonders/generated-v2}`、`outputs/.../i18n_text_inventory.xlsx`。

---

## 0. 给审查者（GPT）的 60 秒背景

- 项目：浏览器增量游戏《天壳 SHELLBREAK》，纯前端多文件 IIFE + `window.SB` 命名空间，无打包器。
- 本轮目标：在已发版的「掀幕/飞升」机制之后，追加 ERA11（掀幕后新局重爬）与 ERA12（升维终局）的科技—建筑—奇观链。
- **三条铁律**（审查时请据此判对错）：
  1. **标定权在用户**：成本/产量/加成/比例一律照用户原表占位，标「待标定」；审查者**不要调数值**，也不要「算」（含探针扫参数、临时 bot）。
  2. **唯一回归 = `node --max-old-space-size=8192 sim/e2e.mjs`**，须用户当次明说「跑」才跑。本轮**做过局部静态检查和逻辑冒烟，但 e2e 未跑，因此没有整体回归结论**（见 §6）；日后获准运行时按计划要求**连跑 3 次看分布**（`ERA11_12_IMPL_PLAN_v0.1.md` P6）。静态检查/冒烟既不代替回归，也不用于下「无回归」结论。
  3. **发版动作（commit/push/打包/上传）等用户明说**。发布闸门 `CFG.UNRELEASED_TECHS` 仍列全部 9 条新科技，玩家暂时看不到。
- 工程判据全在 `docs/JUDGMENTS.md`；动手/审查前先读它。核心判据：「改常数让断言变绿=标定→停；改代码让 NaN/死锁/永远建不起来消失=bug→可做」。

---

## 1. 六轮用户拍板（不可反悔，审查者勿「优化」）

| # | 议题 | 拍板 |
|---|---|---|
| 1 | 掀幕 | 学《掀起帘幕》只揭幕、不清档；只有点底栏 `btnVeil` 才 `doVeil` 清档。**原代码本就这样，未改** |
| 2 | 暗物质 | 有容量上限：基础 10；压舱仓 +10/级；灯塔本身 0、大灯塔建成后灯塔 +5/级（历史 bug 修复） |
| 3 | 跨轮回 | 只认真轮回 `doBreak`；软重置/重开一律不带 |
| 4 | 飞升 | 不改语义：点 `btnVeil` = 一次飞升，读 `meta.veil.count` |
| 5 | 天灾 | cond 名与文案写好，`condMet` **恒假** + 写死理由（pending P1） |
| 6 | 升维 | 纯演出占位 + 预留 meta 字段；`dysonDone` 及 9 类消费方一字不动；10 张帷幕图只留接口与进度数据 |

**状态归属铁律**：跨局权威只有 `meta` 一份（`meta.chrono.carried`、`meta.armada.{count,bonusTenths}`、`meta.veil.ascendBaseline`）；局内字段全是派生缓存。`doBreak` 写跨轮回累计；`ascendBaseline` 由 §4.3 的唯一幂等入口写入。

---

## 2. 逐阶段实装清单（按 P0→P5）

### P0 · 存档地基（`src/state.js`, `src/techs.js`）
- `ERAS` 数组补 ERA11/ERA12 两条记录（id/name/motto/color/glyph/desc），数组长度 12；`state-migrate.js:537` 的 era 上限本就按 `SB.ERAS.length`，无需改。
- ⚠️ `civics.js:964` 的 `Math.min(10, ERAS.length)` **有意写死**（ERA11 无市政树），保持不动。
- `emptyMeta()` 加权威账本：`chrono.carried`（bool）、`armada:{count,bonusTenths}`、升维预留字段。meta 迁移做类型校验（NaN/负数/错类型丢弃）。
  - ⚠️ **纠正（2026-11-23 审查）**：`ascendBaseline` **不在 `emptyMeta()` 初始化**——`emptyMeta().veil` 默认是 `null`（未掀幕无账本，`state.js:51`），字段只有在 veil 对象建立后才存在。`doVeil` 首次建 `meta.veil` 时对象里没有该键（`prestige.js:506-510`）；`normalizeMeta` 清洗时仅当 `m.veil` 存在才把它归一为 `number|null`（`state.js:916-925`）。首次写入已由 §4.3 的统一幂等入口处理。
- `freshRun()` 加本局派生态：`chrono.{disabled,reactivated}`（disabled 从 `meta.chrono.carried` 派生）、`armadaNo`（显示用）、`probes=0`、`launchProcs.*.probe`、`solarRingOn`、`apertureStrikeAcc`、`s.res.darkmatter=0`、`s.got.darkmatter=0`。
- 白名单 `for (k in raw) if (k in base)` 已同步新字段，否则读档丢失。

### P1 · 资源层暗物质（`src/config.js`, `src/economy.js`, `src/economy-rates.js`, `src/economy-tick.js`）
- `RESS.darkmatter` + `CAP_BASE.darkmatter=10`（`config.js:797`）；`capOf` 有值非 Infinity。
- 接入 `costOf`/`canAfford`/`pay`（扣费/灰按钮）、`rates`/`tick`（按 `STEP=0.1` ×dt 写池）、UI 资源条、存档。
- 容量其它来源**全部屏蔽**：海潮方碑白名单不含、物流仓库 era≤7 失效、城堡 era≤3 失效、三条扩容 capEra≤6 失效（规格 pending P6）。

### P2 · 内容数据层
- 科技 9 项（`src/techs.js`）：`deep_space`/`omnitemporal_freeze`/`stellar_smelting`/`near_light_speed`/`reverse_time`/`relativistic_weapon`/`starfrontier`/`constant_edit`/`ascend_dimension`。成本原表占位 1E10→1E14。
- 建筑 2 项（`src/config-buildings.js`）：`probe`（深空探针，实为发射场第三模式，**非独立建筑等级**）、`chrono_house`（逆时屋，人口上限 +1，持续耗热液能 100/秒占位）。
- 奇观 3 项（`src/config-content.js` `WONDERS`）：`starship_armada`（暗物质 +10% 跨轮回累加）、`reality_aperture`（+30% + 每 30 分钟对敌规模上限 5% 打击）、`timeslip_colony`（逆时屋造价 −30% 额外乘区）。
- 工坊升级 4 项（`UPGRADES`）：`upg_stellar_forge`（开太阳星环暗物质档）、`upg_jupiter_cannon`（朱庇特奇观改名「小行星投射器」，id 不变 `wonder_jupitor_mas`）、`upg_causality_strike`（对敌 +100%）、`upg_ln_constant`（全产 +20%）。
- 工艺 2 项（`CRAFTS`）：`cryo_pod`、`relativistic_engine`（引擎含暗物质，**仅作奇观/科技终端消费**，绝不进探针耗材——见 §5 死锁）。

### P3 · 效果接线层（核心函数，审查重点）
| 函数 | 文件 | 作用 / 判据 |
|---|---|---|
| `ballastPerLvl(k)` | `economy.js:346` | 压舱仓每级容量；暗物质默认 10；大灯塔项按 `ballastPerLvl(k)/2` 派生（历史 bug：旧代码把「一半」错挂灯塔本身 +120/级，已修） |
| `darkmatterOutMul(s)` | `economy.js:1500` | = `(1 + meta.armada.bonusTenths/1000) × (1 + aperture?0.30:0)`。⚠️ 曾误写 `SB.wonder.owned(s,'id')`（第二参被忽略、返回对象恒 truthy ⇒ 无条件 +30%），已改 `owned(s).reality_aperture` 并全局扫描无第三处 |
| `popCap` 建筑级 +1 | `economy.js:154` | 新建落点，未复用政策卡通道 `popCapFlat`/`popCapPerPopBldg` |
| `launchModeOf/launchNextMode` | `economy.js:1441/1450` | 三态归一（probe>node>sail）；下一档单一定义，点击与按钮文案共用；顺序 sail→node→probe→sail，probe 需 `deep_space` |
| `solarRingDarkFlowing(s,HF)` | `economy.js:2813` | 单一判据 = 开关亮 + `HF.ringRate≥100` + θ库存≥200。`solarRingOut` 与 `solarRingDarkRate` 共用它 |
| `globalMul` 全产 +20% | `economy.js` | 接 `upg_ln_constant` |
| `hydroAlloc` 星环耗流 | `economy.js` | 加 `ringNeed/ringDraw/ringRate`，最低优先级整额判据 |
| 战争加算通道 | `war.js` | 透孔仪每 1800s 对 active 敌人按 `effectiveMaxScale*0.05` 打击；朱庇特/因果律走 `enemyScaleDamageBonus` 加算（非乘算） |
| 跨轮回账 | `prestige.js:336` `doBreak` | 写入跨轮回累计：船团 +1 座 / +100 tenths、逆时屋 carried 判定。**升维基准不在此写**（见 §4.3） |

**探针产出（economy-tick.js 2f/2f2 段）**：`probe` 档竣工后照常发射（帆/节点停机），每枚持续产 `PROBE_DARK=0.005/s`，`addRes(s,'darkmatter', probes*0.005*mul*dt)`；耗材按 600s/枚摊（铀16.7+强工质10+薄膜10 /秒，= 2000 片帆同量）。跨轮回随 `startRun` 清零。

### P4 · 门控 cond（`src/tech.js`）
- 真 cond：`probes{n:4}`（读 `s.probes`，替代原表会断链的 `built{probe,n:4}`）、`pathOpened`（读 `meta.veil.paths.opened`）。两者 `condMet`/`condShort`/`condText` 三处同接。
- pending 恒假 + 写死理由：`cataclysm`（天灾）、`ascendReady`（升维 10 次飞升）。⚠️ 都没读 `s.broken`（已知坑：goal 分支读终局旗会假「挑战被清除」）。

### P5 · UI / i18n
- **发射场三态**：复用现成 `launch-mode-toggle` 单钮（`render-pane-village.js:460`），双态翻转扩成三态循环；按钮只显示当前档名 + ⇄，tooltip 显示下一档。零新增 CSS。
- **太阳星环开关**：复用现成 `btn tog`（暖石/天穹钻机同款），装了恒星锻炉且有星环等级才出现，`data-solar-ring` → `toggleSolarRing`（`input.js`，已导出）。零新增 CSS。
- **船团编号徽标**（2026-11-23 最后一项）：`wonder.armadaNoOf(s)`（`wonder.js:56`）从 meta 实时派生 `hex(meta.armada.count + 本局已建?1:0)`，回写 `s.armadaNo` 缓存；奇观页已建船团行显示「第 N 号船团」tag（`render-pane-wonder.js:104`，复用 `.tag`）。⚠️ 显示只认函数返回值，不读缓存字段（老档/软重置字段可能落后）。
- **逆时屋失能警告**：轮回确认弹窗 `resetBody` 加行（`game.js:3203-3204`）。
- **科技 flavor**：8 条新引文中英双语齐全；`constant_edit` 用 `{codeVar}` 占位（不把 `kelp_prod` 字面写进译文串），`localizedStaticText` 加第 3 参 params。
- i18n 三平台门控（既有，`i18n.js:5-12`）：TapTap/未知平台固定 zh-CN、切换器隐藏、仅 electron+localizationEnabled 启用翻译。
- i18n 清单：**两轮补登，共 16 个新 key**，全部进 `outputs/.../i18n_text_inventory.xlsx`「文案底表」：
  - 第一轮（`SB-007618`–`SB-007632`，15 条）：8 条科技 flavor（`ui.content.tech_flavor.{deep_space,omnitemporal_freeze,stellar_smelting,near_light_speed,reverse_time,relativistic_weapon,starfrontier,constant_edit}`）+ 7 条探针/星环/船团文案（`village.launch.target.probes.name`、`village.launch.mode.probe.tooltip`、`ui.log.launch_mode.probe`、`village.solar_ring.dark.toggle.tooltip`、`ui.log.solar_ring.dark.started`、`ui.log.solar_ring.dark.stopped`、`wonder.armada.no.tag`）。
  - 第二轮（`SB-007633`，1 条）：`ui.veil.hub.ascend.progress`（帷幕进度文案「第 {current}/{total} 次」，占位符 `{current}`/`{total}`），2026-11-23 二次审查 GPT P1-2 指出漏登记后补。
  - **零改写的可验证依据**：sheet-agent 每轮回读均报「旧行被改写数 = 0」，且三版工作簿 SHA 已留存（见审核基准表），可逐格 diff；HEAD 版 7588 行、首轮后 7609 行、二次后 7610 行，行数增量与补登条数一致（+15/+1）。⚠️ 旧版"原 7594 行零改写"的表述缺前置校验基准（7594 = 工作树在 HEAD 7588 之上已有的 6 行改动，未留存文件），已按本条改为可比对口径。

---

## 3. 深空探针实施口径（覆盖原表建筑方案）

- **引擎不换**：用现有强工质 `strongProp`（燃料500+θ金属10，**不含暗物质**）。原定相对论引擎含暗物质 ⇒ 探针耗材死锁（造探针要引擎→引擎要暗物质→暗物质只有探针产），用户拍「不换」。
- 节律：600 秒/枚（`PROBE_CYCLE`）；耗材对标 2000 片太阳帆总量；每枚产 0.005/s，`×dt` 写池。
- 累计枚数：局内 `s.probes`，每成功发射 +1，随轮回清零；cond `probes{n:4}` 读它。
- **未验风险**：耗材吞吐 = 帆模式 33×（16.7/10/10 每秒），铀为稀有采集、强工质/薄膜靠合成，产能能否长期喂饱**未验**（见 §6）。

---

## 4. 跨轮回状态机（审查重点，破壳 9 处拆门的教训）

- 逆时屋携带一局、只续一次：本局建成→轮回带到下局（改「失能逆时屋」，人口上限 +1 保留、不耗热液）→下局《逆时技术》后花 1/3 资源重激活（允许建新 + 能再带一局）→再轮回未激活则丢失。
- 船团：幕后写 meta，玩家只见加成与 16 进制编号；每轮回 +1 座 / +10% 累加，**建成立即生效**（读 `meta.armada.bonusTenths`）。
- 状态机落点：`state.js`（清洗/派生/升维基准入口）、`prestige.js doBreak`（轮回写跨局累计；不写 `ascendBaseline`）、`game.js`（轮回弹窗警告）。参照破壳拆门教训——调用方每个读点都拆，只改一处=零效果。

### 4.3 升维基准快照（`meta.veil.ascendBaseline`）
- 首次建成现实透孔仪那一 tick 写 `ascendBaseline = meta.veil.count`，之后不改；重复开局/挑战不重置。
- 进度 = `clamp(meta.veil.count − ascendBaseline, 0, 10)`；baseline 为 null 时 = 0。
- 老档缺 baseline 按 null；若老档已建透孔仪，首次读到按当时 `veil.count` 补写（写死理由：无法追溯历史）。
- ✅ **2026-11-23 已实装**：`src/state.js:1218` 的 `ensureAscendBaseline(s, meta)` 是唯一幂等入口；`src/workshop.js:745` 在本局建成现实透孔仪后调用，科技卡片的进度读取也调用同一入口，为符合契约的老档惰性补写。写入后只保存一次；`prestige.doBreak` 不写此字段。

---

## 5. 本轮已修的真 bug（审查者请确认修法）

1. **`wonder.owned(s,id)` 误用**：`owned` 只收一个参数、返回整个 wonders 对象，第二参被忽略 ⇒ 恒 truthy ⇒ 暗物质无条件 +30%、逆时屋恒打折。改为 `owned(s).id`，全局扫描无第三处。
2. **星环缺料「两边都不产」**：旧 `solarRingOut` 只看开关亮就停 θ，而 `solarRingDarkRate` 才判满供满料 ⇒ 缺料时 θ 被前者归零、暗物质被后者归零。改为两者共用 `solarRingDarkFlowing(s,HF)`（开关亮 + 热液满供 + θ够）：缺料→θ照产、暗物质0；满供满料→θ停、暗物质产。HF 由 tick 传 `s._hydroFlow`、面板传 `_sr`，同源。
3. **灯塔仓储历史 bug**（2026-11-21）：旧代码把规格「大灯塔上限为其一半」的「其」误读为灯塔，给灯塔 +120/级。改 `ballastPerLvl(k)` 派生，暗物质 +10/级、大灯塔后灯塔 +5/级。

---

## 6. 验证状态（本轮实际跑了什么）

| 项 | 状态 |
|---|---|
| 全部改动 JS `node --check` | ✅ 通过（含 economy/tick/rates/state/wonder/workshop/war/tech/techs/config/content/buildings/prestige/input/render-*/locales） |
| P3 逻辑冒烟 `tmp/_p3_smoke.mjs` | ✅ 19 项通过 |
| 星环缺料/三态/开关冒烟 `tmp/_ui_smoke.mjs` | ✅ 23 项通过（断热液/θ不足/门槛恢复/三态顺序/改档归一） |
| 船团编号冒烟 `tmp/_armada_no_smoke.mjs` | ✅ 6/6（0→0/建成→1/9→A/10→A/建成→B/15→10） |
| 关键改动回盘 grep 终值 | ✅ 全部落盘、无重复/残留 |
| **e2e 全量回归** | ❌ **未跑**（等用户明说「跑」；旧基线 1941✓/2020/79✗/1挂起/7阻塞，判新红须按断言名 comm） |
| UI 真机渲染（新按钮） | ⚠️ 仅 demo 视觉核验 + 代码审查；游戏内 ERA11 状态需存档才能到，未做真机上屏断言 |

### 6.1 2026-11-23 升维卡片帷幕实现

| 项 | 状态 |
|---|---|
| `state.js`、`workshop.js`、`render-pane-research.js`、zh-CN locale 的 `node --check` | ✅ 通过 |
| `git diff --check` | ✅ 通过 |
| e2e / 游戏内全流程 | ❌ 未运行；仍等用户明确授权 |

---

## 7. 遗留风险 / 待用户拍板（审查者请重点挑错）

1. **数值全部待标定**：9 科技成本、探针 0.005 产率、11 项造价、暗物质容量可达性（37 级压舱仓才攒到 5000）、逆时屋/透孔仪持续耗电 100/300 每秒量级。**不得调、不得算**。
2. **探针 33× 耗材吞吐未验**：需用真实经济链验证铀/强工质/薄膜能否长期喂饱，不得凭假设判可玩。
3. **AI `thetaRate(probe)` 不传 HF**：在新判据下退回 θ 照产（偏乐观），不崩、不影响结算，只是 AI 提示数值略偏。是否修待用户定。
4. **升维基准快照 `ascendBaseline`**：✅ 已按 §8.2 A 实装。新档建造与老档进度读取共用幂等入口；旧存档基准为空时，只在本局已建现实透孔仪的前提下补写。
5. **e2e 未跑**：本轮只做过局部静态检查与逻辑冒烟，**没有整体回归结论**；获准运行时按 P6 要求连跑 3 次看分布。
6. **闸门仍关**：`CFG.UNRELEASED_TECHS` 9 条全列，玩家看不到；何时开放待用户拍。
7. **进度文案 key**：`ui.veil.hub.ascend.progress`（`SB-007633`）已登记并接入科技卡片；zh-CN 词典已有该条，en-US 译文「Ascensions: {current}/{total}」已校对并加入 Electron 词典；繁中仍待校对。全量 locale 导出被既存词典漂移挡住（13 个源码 key 未登记、33 个 en-US 词条无注册行、52 个仍被源码引用但缺已批准译文、187 个词条仍为未批准状态）；本轮只对本 key 定点同步，没有清理这些无关条目。

---

## 8. 帷幕图与进度接口

### 8.1 用户确认的升维卡片帷幕（2026-11-23）
- 用户确认的是**整张科技卡片被布帘遮住，再由中缝向两侧收拢**；褶皱沿高度不齐，下缘稍后显露。此前“直上直下裂隙”方案已被替换。
- 唯一母图为 `assets/veil/ascend-card-curtain-master.png`，来自已确认的演示图 `docs/ERA11_12_FINAL_ENDING/tech_card_curtain_closed_master.png`。不覆盖旧的 `veil-progress-*` 资源，也不另行生图。
- `src/ui/render-pane-research.js` 在卡片 canvas 上按进度从母图绘制布帘：0/10 完全闭合，10/10 完全收至两侧；中间步骤有逐行开合差异，变化时用 1.25 秒缓慢过渡。母图加载失败时绘制渐变褶皱兜底，不出现破图或露底。
- 结局底图 `assets/veil/ascend-ending-bg.png` 是另一项资源，不属于本次科技卡片帷幕实现。

### 8.2 进度接口（代码，已实装）

> 2026-11-23 审查确定了新档建造与老档惰性补写共用的单一入口；下列契约现已落入源码。

**A. 单一幂等写入口（新档/老档共用）——已落 `src/state.js`**
```
ensureAscendBaseline(s, meta) -> number|null
  ① 读 s.wonders.reality_aperture（本局是否建成透孔仪）；未建 ⇒ return meta.veil?.ascendBaseline ?? null（不改账）
  ② 读 meta.veil：非对象（未掀幕）⇒ return null
  ③ 若 meta.veil.ascendBaseline == null（首次达成，含老档惰性补写）：
       meta.veil.ascendBaseline = Math.max(0, Math.floor(meta.veil.count || 0))
       SB.state.saveMeta(meta)          // 只写这一处，doBreak 不碰此字段
  ④ return meta.veil.ascendBaseline     // 已非 null 时幂等返回，绝不改写（基准是"第一次达成"的永久快照）
```
- **为什么必须在"本局已建透孔仪"前提之下**：否则玩家还没建透孔仪，读取口就把 baseline 写成当前 veil.count，之后再建透孔仪时基准被锁死在旧值，进度凭空多算（规格 §2 首次完成规则）。
- **老档口径**：老档若已建透孔仪而 baseline 缺失，首次读进度时以**当时** `veil.count` 补写（`state.js:916` 注释已写死理由：无法追溯历史，取当前是唯一可复现口径）。重复开局/挑战再建不重置（步骤 ④ 幂等保证）。
- **调用点（两处，共用同一入口）**：
  1. `src/workshop.js:745`：本局建成 `reality_aperture` 后调用（新档即时快照）。
  2. `src/ui/render-pane-research.js:702`：科技卡片读取进度时调用（符合条件的老档惰性补写）。
- ⚠️ `normalizeMeta` 的清洗（`state.js:919-925`）**只归一类型、不赋值**，不要在里面做首次写入——它会被反复调用，且未必有 `s` 上下文判断"本局已建"。

**B. 升维科技卡片**：落点 `src/ui/render-pane-research.js` + `assets/veil/ascend-card-curtain-master.png`。每次渲染先调 A 的 `ensureAscendBaseline`，再算 `progress = clamp(meta.veil.count − meta.veil.ascendBaseline, 0, 10)`（baseline null → 0）。canvas 从唯一母图逐行绘制渐进收拢效果；10 个进度画面由程序派生，不逐张出图、不生成或覆盖旧 `veil-progress-*` 资源。
- **文案**：`tr('ui.veil.hub.ascend.progress', { current: progress, total: 10 })` → 「第 {current}/{total} 次」（清单 `SB-007633`；zh-CN 与 Electron en-US 词典已接入，繁中尚待校对）。
- 该进度仅作为卡片显示与帷幕开合量，不参与科技解锁；`ascendReady` 仍由 `src/tech.js` 固定返回 false。
- **进度画面（0 也有落点）**：`progress === 0` 时母图完整遮住整张卡片；`1..10` 时 canvas 从中缝向两侧逐步收拢母图，进度 10 完全显露卡片。母图加载失败时使用同一局部渐变褶皱兜底，不显示破图或空画布；不依赖闭幕底图或 `veil-progress-{01..10}.webp` 文件。
- **边界（2026-11-23 二次审查 GPT P2-2 定稿）**：本任务**只显示进度数字 + 帷幕画面**，不加任何"可解/已达成"标记、不动 `ascendReady`（cond 仍 pending 恒假）、不改解锁链。旧稿"进度 ≥10 且本局透孔仪已建 ⇒ 标记升维可解"一句作废——与"本次不解锁"的边界冲突。

**C. 图像派生（已实装）**：只使用一张母图，由 canvas 按进度程序绘制 10 个显露状态；不逐张生成图片，也不做 10 张图的并排播放。

> ✅ 本节 A/B/C 已按用户确认的方案实装。未运行 e2e；整体回归仍无结论。后续改动仍须遵循本稿前述边界，不改数值、不动 `ascendReady`，不发布。

---

## 9. 审查者交付物期望

请 GPT 按编号逐条审查，输出：
1. **真 bug / 断链 / 死锁 / 量纲错**（能导致 NaN、永远建不起来、面板与结算分叉）——这类优先，附 file:line + 修法。
2. **与规格/拍板不符**的地方（尤其 §1 六条、§4 状态归属铁律）。
3. **未接线 / 半接线**的落点（例如 ERA12 科技仍保留的锁定前置）。
4. **不要**给数值标定建议、「算」产能、或提议改 e2e 断言；这些不在本轮审查范围。
