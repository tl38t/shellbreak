# ERA11 / ERA12 实装计划 v0.1 · 分阶段依赖顺序

> 上位稿：`docs/ERA11_12_SPEC_v0.1.md`（结构、拍板、pending）。本稿只排**做的方法与顺序**，不重复规格内容。
> ⚠️ 三条硬纪律贯穿全程：
> ① **标定权在用户**——成本/产量/加成/比例一律用原表值做占位并注「待标定」，**不自行调数**；「算」（含探针扫参数、临时 bot）也要等拍板，`sim/balance.mjs` 已删、任何形式都不许跑。
> ② **唯一回归 = `node --max-old-space-size=8192 sim/e2e.mjs`，须用户当次明说「跑」才跑**；连跑 3 次看分布，崩溃那遍无结论；判新旧红用失败清单 comm（按断言名归一化），不看总数。
> ③ **发版动作（commit/push/打包/上传/建榜）一律等用户当次明说**；报 bug ≠ 授权发布。
>
> ⚠️ 同一文件多处修改**必须串行下发**，全部改完回盘 grep 终值才算好。

---

## 阶段依赖图

```
P0 存档地基（era 上限 / 新字段白名单 / meta 预留）
   ↓
P1 资源层（暗物质 RESS + 八处接线）  ←── P0 的 CAP_BASE
   ↓
P2 内容数据层（科技 9 / 建筑 2 / 奇观 3 / 升级 4 / 工艺 2）
   ↓
P3 效果接线层（产出/容量/战争/太阳星环/人口上限/跨轮回状态机）
   ↓
P4 门控与 cond（3 类新 cond + pending 恒假 + 隐藏进度）
   ↓
P5 UI 与 i18n（面板/图接口/清单登记）
   ↓
P6 验收（静态自查 → 用户说「跑」→ e2e ×3 → 发版决定）
```

---

## P0 · 存档地基（必须先做，否则新东西全留不住）

| 改动 | 文件 / 函数 | 验收点 |
|---|---|---|
| ~~era 死上限放开~~ **不需要**（已修） | `state-migrate.js:537` 现为 `SB.ERAS.length`（下限 11） | 确认即可，别改 |
| **新增 ERA11 / ERA12 的 ERAS 数据记录**（id/name/motto/color/glyph/desc）+ 相关解锁元数据 | `techs.js:84` `ERAS` 数组 | 数组长度 12、era12 科技不被夹掉；迁移自动跟到 12 |
| ⚠️ `civics.js:964` 的 `Math.min(10, ERAS.length)` **保持不动** | `civics.js:962-964` | 有意写死：ERA11 无市政树，放开会渲染空页 |
| `freshRun` 加**本局派生态**（暗物质 got、`s.chrono.{disabled,reactivated}`、`s.armadaNo`）——**不加重叠计数** | `state.js` `freshRun` | 归属见规格 §0 状态归属表；局内态可随时从 meta 重建 |
| `emptyMeta` 加**跨局权威账本**（`meta.chrono.carried`、`meta.armada.{count,bonusTenths}`、`meta.veil.ascendBaseline`、升维预留） | `state.js:24` `emptyMeta` | 唯一真源在 meta；老 meta 缺字段按默认补，不崩 |
| meta 迁移清洗（新字段类型校验；`ascendBaseline` 缺失按 null） | `state.js` meta migrate 段 | 脏值（NaN/负数/错类型）被丢弃而非污染计算 |

**为什么第一**：`migrateRun` 只校验不重算、`resumeRun` 无条件用存档 ⇒ 改配置对老档无效，新字段不进 `freshRun` 就留不住。这是已知反复咬人的坑。

**状态归属铁律**（规格 §0 状态归属表）：跨局权威**只有 meta 一份**；局内字段全是派生缓存。**唯一写 meta 的地方是 `doBreak`**；激活逆时屋/建船团只写局内态，软重置两者都不写 meta。禁止两个字段各自计数或互相覆盖。

---

## P1 · 资源层（暗物质）

| 改动 | 文件 / 函数 | 验收点 |
|---|---|---|
| `RESS.darkmatter` + `CAP_BASE.darkmatter=10` | `config.js` 资源定义 / `config.js:743` 附近 | `capOf` 有值、非 Infinity |
| 接 `costOf`/`canAfford`/`pay` | `economy.js` | 造价能扣、不够时按钮灰 |
| 接 `rates`/`tick`（探针 0.005/s ×dt） | `economy-rates.js`、`economy-tick.js` | 存量按 `STEP=0.1` 累加，不出现 0.005/tick 的量纲错 |
| 接 UI 资源条 / 存档 | `ui/render*`、`state.js` | 上屏与落盘一致 |
| `ballastPerLvl(darkmatter)=10` 已实装确认 | `economy.js` | 大灯塔后灯塔 +5/级，遗留 §5 |

⚠️ 容量其它来源**全部屏蔽**（方碑白名单不含 / 物流仓 era≤7 / 城堡 era≤3 / 扩容 capEra≤6）——见规格 P6，别顺手接上。

---

## P2 · 内容数据层（先结构、后文案）

| 改动 | 文件 | 数量 |
|---|---|---|
| 科技条目（era11 六项 + era12 三项） | `techs.js` | 9 |
| 建筑条目（探针、逆时屋） | `config-buildings.js` | 2 |
| 奇观条目（船团、透孔仪、时隙殖民地） | `config-content.js` `WONDERS` | 3 |
| 工坊升级（锻炉、大炮、因果律、自然对数） | `config-content.js` `UPGRADES` | 4 |
| 工艺（冷冻仓、相对论引擎） | `config-content.js:236` `CRAFTS` | 2 |

**i18n 先行（AGENTS.md 硬要求）**：所有玩家可见新文案先在 `outputs/.../i18n_text_inventory.xlsx` 登记语义 key + 上下文，再写代码引用 key，禁止在 UI/render 里直接加字面量。包含现象：按钮、tooltip、aria-label、弹窗、日志、onboarding、changelog、玩家可见错误兜底。

⚠️ 数据层还涉及：朱庇特奇观**改写显示名**（质量加速站 → 小行星投射器）但 id 不变，避免存档断链；`kelp_prod` flavor 最终定案（2026-11-23 用户「那句话除了 kelp_prod 的部分也要翻译」后修正，**覆盖早前「走非译文通道、不建 i18n key」的旧拍板**）——用 `{codeVar}` 占位符方案：`kelp_prod` 字面值不进译文串（符合 AGENTS.md），其余文字中英双语都翻；落 `src/ui/render-content.js` 的 `TECH_FLAVOR_PARAMS.constant_edit={codeVar:'kelp_prod'}` + 中英词典各一条 `ui.content.tech_flavor.constant_edit`。详见 `ERA11_12_SPEC_v0.1.md` §2「flavor 双落点机制」。8 条新引文均已登记 i18n 清单并补进双语词典。

---

## P3 · 效果接线层（最 heavy，按效果类型分批）

| 效果 | 落点 | 复用先例 |
|---|---|---|
| 暗物质产量 +10%（船团，跨轮回累加）/ +30%（透孔仪） | `economy-rates.js` 乘区 | 现有 matterMul 乘区 |
| 对敌规模伤害 +150% / +100% / 5%上限打击 | `war.js:985-996` | `enemyScaleDamageBonus` **加算**通道，星屑树同款 |
| 全产 +20%（自然对数） | 全局乘区 | 现有 globalMul |
| 人口上限 +1（建筑级） | `economy.js` `popCap` | 新建落点；`popCapFlat`/`popCapPerPopBldg` 是政策卡，别混用 |
| 太阳星环可开关（100 热液+200θ/s → 0.01 暗物质） | `economy-tick.js` 2f 段、`input.js` | 发射场 `launchMode` 双模式切换 |
| 逆时屋消耗 −30%（额外乘区） | `costOf` 建筑分支 | 额外乘区，别叠进已有减价 |
| **逆时屋跨轮回状态机**（§0 拍板 3 四步） | `state.js` meta、`prestige.js doBreak`、`game.js askResetRun` 弹窗 | 参照破壳 9 处拆门的教训：**调用方每个读点都要拆**，只改一处等于零效果 |
| **船团幕后累计 + 16 进制编号** | `state.js` meta、`prestige.js doBreak`、显示名函数 | 玩家只见加成与编号，面板不列建筑实体 |
| 探针产出 + 累计台账 `got.darkmatter` | `economy-tick.js` | 单轮回，随 `startRun` 归零 |

**P3 出口验收（未过不得进入 P4）**：静态代入 `capOf` 公式，核对暗物质容量能否覆盖四项大额造价——透孔仪 3000、时隙殖民地 5000、因果律打击 5000、自然对数 5000。规格 §5.1 算得：政策卡+公司+挑战全满时压舱仓 37 级可达 5000；**这只是算式，不含造价曲线与产能节奏的实测**。核实前 era12 链路标"未验证"，不得据此调数值（标定权在用户）。

---

## P4 · 门控与 cond（三类新 cond + pending）

| cond 类型 | 语义 | 判定落点 | 状态 |
|---|---|---|---|
| `probes`（新） | 探针累计发射 ≥ n 枚 | 读局内发射计数器（随轮回清零） | 真 cond，`condMet`/`condShort`/`condText` 三处同接。替代原表 `built {b:'probe',n:4}`（探针改发射场模式后无建筑等级，原写法断链） |
| `pathOpened`（新） | 已开启一条飞升路径 | 读 `meta.veil.paths.opened` | 真 cond，`condMet`/`condShort`/`condText` 三处同接（`tech.js:392-601`） |
| `cataclysm`（新） | 已击败天灾 | **恒假 + 写死理由** | **pending P1**，断链时明确显示「尚未实装」，不要给可点的假门 |
| 隐藏 10 次飞升（新） | 造完透孔仪后飞升 10 次 | **恒假 + 写死理由** | **pending P2**，UI 只给 10 张图进度 |
| `pop {n:400}` / `gathered {r:'darkmatter',n:50}` / `wonders {ids:[...]}` | 现成 cond | 不改 | 复用 |

⚠️ `challenges.active()` 的 goal 分支**不许读 `s.broken`**（已知坑），本批新 cond 同理别碰终局旗。

---

## P5 · UI 与美术接口

| 项 | 落点 | 说明 |
|---|---|---|
| 科技/建筑/奇观面板新条目 | `ui/render*` | 文案走 i18n key |
| 逆时屋失能态改名 + 轮回确认弹窗警告行 | `game.js:3218` `resetBody` | 玩家可见文案登记清单 |
| 船团编号显示（16 进制） | 显示名函数 | 只显示编号与加成，不列实体 |
| 10 张帷幕图进度接口 | `ui/veil*` + `assets/veil/` | **只给进度数据，不出图**（pending P3）；进度 = `clamp(meta.veil.count − meta.veil.ascendBaseline, 0, 10)`，基准为 null 时显示 0；图位按 `docs/ERA11_12_ART_PROMPTS_v0.1.md` 留 |
| 本批 i18n 平台验收（**P5 必测**） | `src/i18n.js:5-12`、`mountLanguageSelector():184` | ① TapTap/未知平台固定 **zh-CN**，忽略存档与系统 locale；② 语言切换器隐藏（`block.hidden=true`）；③ 仅当 `shellbreakPlatform.runtime==='electron' && localizationEnabled===true` 才启用翻译；④ 未识别平台一律回退 zh-CN。**这三条是 AGENTS.md 硬约束，不是可选优化** |
| 结局动图触发点 | `game.js` 通关演出段 | 只留 hook（pending P4） |
| 升维 meta 预留字段 | `state.js` | 注释写清「以后接」，不接线（pending P5） |

---

## P6 · 验收与发版（两次独立授权）

**第一次授权：跑回归。** 用户明说「跑」才执行；静态 grep / 语法检查 / 只读探针**不算回归，也不许拿来下结论**。

```
node --max-old-space-size=8192 sim/e2e.mjs     # ×3，看分布
```

- 本机随机 `0xC0000005` 崩（bash 报 139）那遍**无任何结论**，用 `bash tmp/_e2e_retry.sh [次数]` 重跑到拿完整结果。
- 判「有没有引入新红」= 跑前日志按**断言名归一化**后 comm 失败清单；现行基线 1941✓/2020 总/79✗/1 挂起/7 阻塞（Ver1.3.1 三遍一致，日志 `tmp/_e2e_v131_run{1,2,3}_a1.log`）。只看总数会把「海潮方碑」那种数字漂移误判。
- 静态自查：`node --check` 所有改动 js；回盘 grep 终值；i18n 清单反向校验「被改写 == 0」。

**第二次授权：发版。** 用户明说才做，四步升版：

1. `CFG.VERSION` → `Ver1.0.x`
2. `CFG.CHANGELOG` 头部插一条
3. `index.html` 的 `?v=` bump（改过的 js/CSS 各自 bump，`main.css` 的 `@import` 别漏）
4. 重跑 `_repack.py`（第 149 行有**硬编码版本断言**，每版必改）+ `tmp/_md5check.py` 新包 vs 上一版逐文件 md5 + `?v` 校验

---

## 本轮不做（范围外，避免蔓延）

- 天灾系统本体（P1 pending 只留 cond 名）。
- 升维真终局迁移（9 类消费方全部不动）。
- 10 张帷幕图与结局动图的实际出图/动画。
- 任何数值标定与「算」。
- 游戏名两处不一致、`.xlsx/.ref` gitignore、herd/writing cond 四选一等历史遗留——与 ERA11/12 无关，不在此计划内顺手修。
