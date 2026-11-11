# i18n 文案录入规范

本规范与 `outputs/01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9/i18n_text_inventory.xlsx` 的「文案底表」配套使用。该表是可见文案的登记与翻译基底；代码运行时读取语言资源，不直接读取 Excel。

首轮盘点按源码出现位置保留记录，因此相同字符串可能有多行；「重复文本指纹」可用于筛选候选重复项。迁移时先确认语义与上下文，再决定是否共用一个运行时 key。以后新增的一条语义文案只登记一行；同一个 key 在多处使用时更新「源文件/行号」定位即可，不为每个调用点重复建行。

## 新增文案的顺序

1. **先登记，再写代码。** 在底表新增一行并分配从未使用过的稳定 key；代码只能引用 key。暂未完成翻译时标成「待翻译」，不得因此把中文直接硬编码进渲染器。
2. 填完整中文基准文案、所在功能、出现条件、上下文、源文件，以及全部变量占位符。按钮、标题、tooltip、错误提示、无障碍标签、更新日志、引导文案、平台错误的本地化兜底都算用户可见文本。
3. 新增/调整代码后更新源文件与行号；删除文案时把记录状态标成「已废弃」，不要删除或复用 key。
4. 提交前确认代码里使用的 key 已登记，登记表里的 key 也能在语言资源中找到；缺少目标语言译文时使用中文回退，不显示裸 key。

## 平台范围

- 翻译文案只在 Steam/Electron 构建中启用。Steam/Electron 可以选择已支持的目标语言。
- TapTap 端始终显示简体中文：忽略系统语言和其他端保存的语言偏好，不显示语言切换入口。TapTap 专用提示也保持中文。
- 平台判断必须使用明确的构建/运行时标记；不能只靠浏览器语言或 UA 推断。平台缺失、未知或无法确认时一律回退简体中文，不能误把翻译带到 TapTap。
- 文案底表里的译文列是 Steam/Electron 资源；规则和回归检查要覆盖「Steam/Electron 可切换、TapTap 固定中文」两种路径。
- TapTap 专属且 Steam/Electron 不提供的功能不需要英文译文：英文单元格留空，英文状态标为「平台不适用」，并在上下文注明 TapTap 专属；Steam/Electron 界面不得引用这类文案。

## 英文风格与首轮术语

- 首个目标语言按美式英语（en-US）处理。按玩家实际看到的意思翻译，优先自然、简洁的界面表达；按钮用清楚的动词，提示语保留必要信息，不照搬中文语序。
- 以下是首轮工作译名，后续全项目保持一致；世界观标题和专名仍需项目方复核后定稿：

  | 中文 | en-US 工作译名 | 用法 |
  | --- | --- | --- |
  | 轮回 | Prestige | 用作游戏循环/按钮名；不译作 reincarnation |
  | 轮回点 | Prestige Points | 货币名 |
  | 轮回商店 | Prestige Shop | 商店页签 |
  | 潮讯自拾 | Tidal Auto-Click | 轮回天赋名工作译名；按自动点击功能暂译，需校对世界观语气 |
  | 藻食 | Kelp | 基础食物资源名 |
  | 珊瑚 | Coral | 基础建筑资源名 |
  | 深海藻场 | Deep-Sea Kelp Farm | 建筑名 |
  | 深海鱼牧场 | Deep-Sea Fish Farm | 畜牧科技解锁的食物建筑名；每级降低族民藻食消耗 |
  | 深海菌圃 | Deep-Sea Bacterial Farm | 开局引导中提到的建筑名工作译名，需与内容表核对 |
  | 灯塔 | Lighthouse | 建筑名工作译名 |
  | 礁口巢 | Reef Nest | 建筑名 |
  | 结绳 | Cordage | 纪元一科技名 |
  | 尤里卡 | Eureka | 科技揭示/加成条件用语；市政对应项使用 Inspiration |
  | 鼓舞 | Inspiration | 市政揭示/加成条件用语；与科技尤里卡（Eureka）区分 |
  | 科技点 | Research Points | 科技资源 |
  | 市政点 | Civic Points | 独立的市政研究资源（代码资源 ID 为 culture）；不译作 Culture |
  | 市政 | Civics | 市政系统中的一项研究或市政内容；作类别名时按语境用 Civic |
  | 市政树 | Civic Tree | 市政研究树页面 |
  | 政策卡 | Policy Card | 可装备至政体槽位的卡片 |
  | 议事厅 | Council Hall | 建筑名工作译名；可能随政体升级更名 |
  | 石工 | Masonry | 科技名工作译名 |
  | 轮回天赋 | Prestige perk | 轮回商店中的永久解锁项 |
  | 科技自转 | Auto Study | 轮回天赋名工作译名 |
  | 市政自转 | Auto Civics | 轮回天赋名工作译名 |
  | 远见之人 | Visionaries | 轮回商店分支名工作译名，需与该分支其他内容统一 |
| 政经往来 | Political and Economic Ties | 轮回商店分支名；与政策卡「政治经济学」(Political Economy) 区分 |
  | 科技纪元 | Science Era | 与市政树研究门槛关联的科技时代 |
  | 太阳帆 | Solar Sail | 科技条件统计对象；工作译名，需与内容名称核对 |
  | 手动采集 | Manual gathering | 玩家手动采集藻食或珊瑚的面板小节名 |
  | 大潮纹馆 | Great Tidal Library | 奇观名；建筑等级提示中的虚级来源 |
  | 戴森球节点 | Dyson Node | 与简称「戴森节点」使用同一译名；复数 Dyson Nodes |
  | 钛板 | Titanium Plate | 钛合金板在紧凑资源列表中的短称 |
  | θ薄膜 | θ-Metal Film | θ金属自适应薄膜在紧凑资源列表中的短称 |
  | 引擎 | Engine | 强工质火箭引擎在紧凑资源列表中的短称 |
  | 铀 | Uranium | 发射场消耗资源名 |
  | 戴森球 | Dyson Sphere | 科技/奇观条件名 |
  | 戴森节点 | Dyson Node | 星空探索挑战目标；复数写作 Dyson Nodes |
  | 强工质火箭引擎 | Strong Propellant Rocket Engine | 工坊资源名工作译名；需校对正式名称 |
  | θ金属自适应薄膜 | θ-Metal Adaptive Film | 工坊资源名工作译名；需校对专名与连字符写法 |
  | 钛合金板 | Titanium Alloy Plate | 发射场节点模式消耗资源名工作译名；需校对正式名称 |
  | 幸福度 | Happiness | 幸福状态与乘区指标名；UI 名称统一使用 Happiness |
  | 黄金时代 | Golden Age | 幸福度等级名称；按低到高的固定档位顺序使用 |
  | 繁荣 | Prosperous | 幸福度等级名称；按低到高的固定档位顺序使用 |
  | 兴盛 | Thriving | 幸福度等级名称；按低到高的固定档位顺序使用 |
  | 欣喜若狂 | Ecstatic | 幸福度等级名称；按低到高的固定档位顺序使用 |
  | 欢欣 | Joyful | 幸福度等级名称；按低到高的固定档位顺序使用 |
  | 愉悦 | Content | 幸福度等级名称；按低到高的固定档位顺序使用 |
  | 安定 | Stable | 幸福度等级名称；按低到高的固定档位顺序使用 |
  | 不满 | Discontent | 幸福度等级名称；按低到高的固定档位顺序使用 |
  | 动荡 | Turmoil | 幸福度等级名称；按低到高的固定档位顺序使用 |
  | 全产 | Global production | 全局产出乘区简称；完整效果标签使用 Global production multiplier |
  | 热液能总产出 | Total Hydrothermal Energy output | Eureka 条件中使用的热液能总产出速率名 |
  | 发射场制造节律 | Launch cycle time | 发射场产出周期效果分类标签 |
  | 生物材料研究所效率 | Biomaterials Lab efficiency | 建筑效率效果分类标签 |
  | 生物材料研究所产出 | Biomaterials Lab output | 建筑产出效果分类标签 |
  | 卫星星空探索 | Satellite Star Exploration | 卫星提供的星空探索效果分类标签 |
  | 工坊工艺效率 | Workshop crafting efficiency | 工坊工艺制作效率效果分类；与 Processing output 区分 |
  | 原料消耗 | Input consumption | 加工或生产所需输入资源消耗分类标签 |
  | 钢产出 | Steel production | 钢资源产出的效果分类标签 |
  | 异星建筑产出 | Alien building output | 异星建筑产出效果分类标签 |
  | 脚手架需求减免 | Scaffolding requirement reduction | 建造需求减少效果分类标签 |
  | 钛产出 | Titanium production | 钛资源产出的效果分类标签 |
  | 藻食上限 | Kelp storage cap | 藻食资源库存容量效果 |
  | 采集者藻食产出 | Gatherer Kelp production | 采集职业产出的分类标签 |
  | 金属→精铁 | Metal → Iron | 金属加工为精铁的效果分类标签 |
  | 地热产出 | Geothermal production | 科技效果产出分类标签 |
  | 加工产出 | Processing output | 金属加工等产出的分类名；与工艺制作效率区分 |
  | 采集产出 | Gathering output | 科技效果的通用采集产出分类标签 |
  | 固定加成 | Fixed bonuses | 幸福度账本中的常驻加成分类名 |
  | 石梁 | Stone Beam | 工坊工艺制作资源名；工作译名，需与正式资源名核对 |
  | 礁石平台 | Reef Platform | 旧版建筑名；在工坊泛采集加成说明中出现，已从现行内容删除，需确认是否仍应显示 |
  | 深潜 | Deep Diving | 工坊泛采集加成说明中引用的旧科技名；已从现行科技树删除，需确认是否仍应显示 |
  | 自动制作槽 | Automation slot | 工坊自动制造功能的专用槽位 |
  | 自动工坊 | Automatic Workshop | 提供工艺效率加成和自动制作槽的工坊升级名称 |
  | 批次 | batch | 自动制造中一次性生产的一批配方产物 |
  | 无上限原料 | uncapped input | 自动制造中没有库存上限的配方原料 |
  | 上限原料 | capped input | 自动制造中存在库存上限的配方原料 |
  | 青铜术 | Bronze Working | 前期科技名 |
  | 熔炉 | Furnace | 自动加工铁材的建筑；与热泉炉区分 |
  | 热液汽轮机 | Hydrothermal Turbine | 产出热液能并消耗暖石的建筑 |
  | 配方 | Recipe | 可反复制作的工艺条目 |
  | 工坊 | Workshop | 建筑名和主界面页签名 |
  | 轮回之终末 | The End of Prestige | 无政府挑战中允许装备的例外政策卡 |
  | 欧罗巴 | Europa | 挑战中的发射场名称组成部分 |
  | 泰拉 | Terra | 挑战中的发射场名称组成部分 |
  | 恩克拉多斯 | Enceladus | 挑战中的发射场名称组成部分 |
  | 政策卡槽 | Policy card slot | 政策卡装备位置 |
  | 污染 | Pollution | 挑战系统指标名 |
  | 旧日信仰 | Old Faith | 轮回相关属性名；工作译名 |
  | 星空探索 | Star Exploration | 科技条件进度名；工作译名 |
  | 星空槽 | Starfield slot | 破壳后的星空探索进度槽 |
  | 星屑 | Stardust | 局外货币 |
  | 天壳 | the Shell | 世界观中的冰壳；句首或标题按英语大小写规则处理 |
  | 冰壳 | the Ice Shell | 明确强调冰层时使用 |
  | 破壳 | Shellbreak / break through the Shell | 前者指事件或阶段，后者指玩家动作 |
  | 暗流纪 | Undercurrent Era | 纪元名，大小写固定 |
  | 天穹钻机 | Sky Drill | 奇观名 |
  | 共振钻头 | Resonant Drill | 天穹钻机消耗材料；复数按语境写作 Resonant Drills |
  | 壳层勘探 | Shell Survey | 轮回强化名；工作译名，需与强化名称表核对 |
  | 星球重构机 G.E.E.K | G.E.E.K. Planetary Terraformer | 奇观机器名；工作译名，需校对 |
  | 星球改造 | Planetary Terraforming | G.E.E.K 阶段科技名；工作译名 |
  | 巢穴 | Habitat | 主界面面板名 |
  | 国度 | realm | 聚落自定义名称的输入提示；玩家输入的名称本身不翻译 |
  | 族民 | People | 主界面人口页签 |
  | 采珊瑚 | Gather Coral | 手动采集珊瑚的操作按钮；说明文案引用时沿用此动作名称 |
  | 峰值族民 | Peak Population | 轮回点发展分公式中的人口指标 |
  | 人口上限 | Population cap | 当前存档可容纳的族民数量上限 |
  | 发展分 | Development Score | 轮回点奖励公式中的计分值 |
  | 建筑纪元分 | Building Era Score | 轮回点发展分中的建筑纪元计分项 |
  | 破壳系数 | Shell Break Factor | 轮回点公式中的破壳进度系数 |
  | 金属 | Metal | 基础金属加工资源名；与精铁（Iron）区分 |
  | 精铁 | Iron | 由金属与暖石加工得到的资源名；不要与 Steel 混用 |
  | 钛 | Titanium | 采集类资源名 |
  | 暖石 | Warmstone | 资源名；本批工作译名，需校对后全项目统一 |
  | 保温法 | Insulation | 挑战规则用语；本批工作译名，需确认是否为科技/机制正式名 |
  | 寒流季 | Cold Season | 季节名；与挑战文本现有译法统一 |
  | 冻伤 | Frostbite | 寒流季/冰封期状态与效果用语 |
  | 学者 | Scholar | 职业名；沿用引导文案工作译名 |
  | 书手／抄写员 | Scribe | 职业名；本批工作译名，需校对 |
  | 科文 | Science and Civics | 挑战奖励合称；需与资源及系统术语核对 |
  | 虚境 | the Verge | 世界观专名工作译名，需项目方审定 |
  | 虚境信仰 | Verge Faith | 政策/信仰专名工作译名，需项目方审定 |
  | 酋邦制 | Chiefdom | 政体名工作译名，需与政体名称表核对 |
  | 法典 | Code of Laws | 市政名；在政体解锁提示中说明其解锁酋邦制 |
  | 国会 | Parliament | 联邦制政体下的城堡/议事厅显示名 |
  | 人民大厅 | People's Hall | 平等主义政体下的城堡/议事厅显示名 |
  | 圣座居所 | Seat of the Holy See | 教权国政体下的城堡/议事厅显示名 |
  | 寰宇教会 | Universal Church | 政体名 |
  | 星海共同体 | Starsea Collective | 政体名及标题后缀 |
  | 星际联邦 | Interstellar Federation | 政体名 |
  | 联邦 | Federation | 联邦制政体的标题后缀；注意与 Federalism 区分 |
  | 联盟 | Alliance | 平等主义政体的标题后缀 |
  | 行星发动机 | Planetary Engine | 建筑名工作译名，需与正式英文名称核对 |
  | 星核炉芯 | Stellar Core Reactor | 建筑名工作译名，需与正式英文名称核对 |
  | 泰拉中央星核炉芯 | Terra's Central Stellar Core Reactor | 自然环境卡显示名；沿用 Stellar Core Reactor 术语 |
  | 水舱 | Water Vat | 泰拉水舱建筑名工作译名，需与正式建筑名表核对 |
  | 热液能 | Hydrothermal Energy | 资源名工作译名，需与正式英文名称核对 |
  | 寒流禁火 | Cold Snap: No Heating | 挑战名工作译名 |
  | 小国寡民 | Small Country, Few People | 挑战名工作译名 |
  | 忽视科文 | Neglect of Science and Civics | 挑战名工作译名 |
  | 深渊重压 | Abyssal Pressure | 挑战名工作译名 |
  | 逐光竞速 | Race the Light | 挑战名工作译名 |
  | 流浪泰拉 | Wandering Terra | 挑战名；与现有「回看《流浪泰拉》」译法统一 |
  | 水体污染 | Water Pollution | 挑战名工作译名 |
  | 海渊澄明 | Clear Waters of the Deep | 成就／挑战名工作译名 |
  | 天壳震动 | Shell Tremor | 随机事件名称；工作译名 |
  | 深海火喷泉 | Deep-Sea Fire Fountain | 随机事件名称；工作译名 |
  | 信仰显圣 | Manifestation of Faith | 随机事件名称；工作译名 |
  | 潮信石 | Tidal Stone | 随机事件名称；工作译名 |
  | 乡镇企业 | Local Enterprise | 公司成长链条的初始等级名称；工作译名 |
  | 宏观经济学 | Macroeconomics | 解锁公司网络的市政名称 |
  | 轻车熟路 | Second Nature | 建筑成就名与首建奖励机制；达成该建筑成就后，每轮首次建造免费 |
  | 地方企业 | Regional Enterprise | 公司成长链条中的第二级名称；工作译名 |
  | 全国性企业 | National Corporation | 公司成长链条中的第三级名称；工作译名 |
  | 星球命脉 | Planetary Lifeline | 公司成长链条中的第四级名称；工作译名 |
  | 寰宇巨企 | Cosmic Megacorp | 公司成长链条中的最高级名称；工作译名 |
  | 工艺 | Crafting | 公司行业标签；公司加成提高工艺制作效率 |
  | θ金属／θ生物金属 | θ-Metal | 公司行业与高纪元资源名；短称和长称使用同一译名，需与正式资源译名统一 |
  | 王权神授 | Divine Right | 政策卡名称；工作译名，需与政策卡名称表统一 |
  | 自然环境 | Natural Environment | 泰拉环境改造卡名称；工作译名 |
  | 廉租社区 | Low-Rent Community | 建筑名工作译名，需与正式建筑译名统一 |
  | 信仰 | Faith | 文明发展轴资源名；不替代玩家自定义的 Faith 显示名 |
  | 神庙 | Temple | 信仰产出的建筑乘区来源；建筑名 |
  | 神学 | Theology | 解锁信仰页的市政名称；工作译名 |
  | 地球系 | Terra System | 星空总览中的行星系名称；项目将地球称为 Terra |
  | 火星系 | Mars System | 星空总览中的行星系名称 |
  | 木星系 | Jupiter System | 星空总览中的行星系名称 |
  | 萨图恩行星系 | Saturn System | 星空地图中的行星系名称；工作译名 |
  | 萨图恩 | Saturn | 星空地图中的行星名；工作译名 |
  | 瑞亚 | Rhea | 卫星/天体名 |
  | 泰坦 | Titan | 卫星/天体名 |
  | 太阳 | Sun | 太阳系中心恒星名 |
  | 冰卫星 | Icy Moon | 欧罗巴星图说明中的类别标签 |
  | 泰拉星轨道发射场 | Terra Orbital Launch Site | 建筑名工作译名；与简称「泰拉发射场」统一 |
  | 火星工造中心 | Mars Foundry | 火星系地标名工作译名 |
  | 朱庇特质量加速站 | Jupiter Mass Accelerator | 木星系地标名工作译名 |
  | 土星环／萨图恩环 | Saturn Ring | 星图中的可选地点名；两种中文显示共用同一译名 |
  | 萨图恩环 · 工厂 | Saturn Ring Factory | 星图中的设施名称工作译名 |
  | 钛合金 | Titanium Alloy | 星图资源名；工作译名 |
  | 硬化珊瑚 | Hardened Coral | 星图资源名；工作译名 |
  | 人口消耗 | Population upkeep | 奢侈品需求来源标签 |
  | 海潮基准 | Tidal baseline | 奢侈品基准乘区 |
  | 旅行者1号 | Voyager 1 | 奇观名工作译名 |
  | 大巴扎 | Grand Bazaar | 奇观名工作译名 |
  | 奢侈品契 | Luxury Pact | 商人奢侈品产出加成来源 |
  | 马镫工坊 | Stirrup Workshop | 商人产出升级名称 |
  | 老潮石碑 | Ancient Tide Stele | 遗产资源来源标签 |
  | 联邦制 | Federalism | 政体名；至高圣座科技加成对应分支 |
  | 平等主义 | Egalitarianism | 政体名；至高圣座工艺加成对应分支 |
  | 教权国 | Theocracy | 政体名；至高圣座信仰加成对应分支 |
  | 国际空间站 | International Space Station | 至高圣座在联邦制政体下显示的名称变体 |
  | 太空共同体 | Space Collective | 至高圣座在平等主义政体下显示的名称变体 |
  | 奢侈品 | Luxury Goods | 幸福度消耗与商人系统中的消费品类别 |
  | 渊海信仰 | Abyssal Faith | 自动游玩策略在信仰名称为空时使用的默认名称；玩家自定义名称不翻译 |
  | 官员 | Official | 行政部门效果将书手职业改称时的显示名称 |
  | 太空时代 | Space Age | 星空探索完成后达成的时代里程碑 |
  | 本周目存档 | Current-run save | 当前轮回进度存档；与跨周目存档区分 |
  | 渊海之国 | Abyssal Realm | 纪元五及之后未自定义名称时的聚落默认名 |
  | 潮机城 | Tideworks City | 纪元四的自动聚落名称 |
  | 锻火镇 | Forgefire Town | 纪元三的自动聚落名称 |
  | 灯火山厝 | Lamplit Mountain Homes | 纪元二的自动聚落名称 |
  | 跨周目存档 | Meta-progression save | 跨轮回保留的元进度存档；与本周目存档区分 |
  | 科学家 | Scientist | 掌握化学科技后学者职业的显示名称 |
  | 农民 | Farmer | 掌握种植科技后采集者职业的显示名称 |
  | 热液工坊 | Hydrothermal Workshop | 工艺设施名称工作译名 |
  | 国家物流 | National Logistics | 奇观提供的铁矿产出乘区 |
  | 热泉炉 | Hot Spring Furnace | 建筑名 |
  | 重核聚变 | Heavy Nuclei Fusion | 科技/工艺名称工作译名 |
  | 板块加固 | Crust reinforcement | 地壳/矿脉升级名称 |
  | 星际物流 | Interstellar Logistics | 行星物流乘区来源 |
  | 自动钻机 | Auto Drill | 自动钻机产出乘区 |
  | 地壳钻井伴生 | Crust drilling by-products | 地壳钻井副产物来源 |
  | 奇观矿脉 | Wonder Mining Bonus | 奇观提供的采矿加成 |
  | 矿工契 | Miner Pact | 矿工产出加成来源 |
  | 矿工镐 | Miner’s Pickaxe | 矿工职业工具 |
  | 矿脉升级 | Vein upgrades | 矿物产出乘区名称 |
  | 珊瑚契 | Coral Pact | 珊瑚匠产出加成来源 |
  | 珊瑚林 | Coral Grove | 珊瑚匠职业专精 |
  | 珊瑚匠斧 | Coralworker’s Axe | 珊瑚匠职业工具 |
  | 珊瑚匠 | Coralworkers | 职业名 |
  | 启蒙沙龙 | Enlightenment Salon | 政策卡名 |
  | 生物材料研究所 | Biomaterials Research Institute | 建筑名 |
  | 泰坦气云采集站 | Titan Cloud Harvester | 建筑名 |
  | 瑞亚星矿井 | Rhea Mine | 建筑名 |
  | 砂矿坑 | Sand Pit | 建筑名 |
  | 马尔斯工造中心 | Mars Foundry | 建筑名；与星图中的简称统一 |
  | 至高圣座 | Supreme Throne | 奇观名工作译名 |
  | 哈'利法宇宙望远镜 | Khalifa Space Telescope | 奇观名工作译名 |
  | 阿尔巴达热液大学 | Albada Hydrothermal University | 奇观名工作译名 |
  | 安乐之治 | Blissful Reign | 轮回政治天赋名工作译名 |
  | 王国大交易所 | Kingdom Grand Exchange | 奇观名工作译名 |
  | 人口 | Population | 建造成本中表示可消耗族民数量的资源标签；与页面名 People 区分 |
  | 空间站 | Space Station | 建筑名与星图图例中的单体标签 |
  | 奇观 | Wonder | 可建造一次且永久留存的独特建筑；复数 Wonders |
  | 海潮方碑 | Tidal Monument | 奇观名；工作译名，需与正式内容名称核对 |
  | 先人孑遗 | Ancient Remnants | 轮回商店中的永久天赋树标题；工作译名 |
  | 安得广厦 | Shelter for All | 轮回商店中的永久天赋树标题；工作译名 |
  | 铁血工造 | Ironworks | 轮回商店中的工坊天赋树标题；工作译名 |
  | 金石为开 | Mineral Mastery | 轮回商店中的矿物天赋树标题；工作译名 |
  | 唯食与犁 | Food and the Plow | 轮回商店中的食物与御寒天赋树标题；工作译名 |
  | 百炼成钢 | Forged in Steel | 轮回商店中的钢铁天赋树标题；工作译名 |
  | 潮汐之树 | Tide Tree | 轮回天赋总览页的天赋树名称；工作译名 |
  | 纪念奇观 | Legacy Wonders | 首次建成的独特奇观跨周目收藏；工作译名 |
  | 旧日艺术品 | Ancient Artworks | 轮回遗产收藏项；提供持续市政点 |
  | 旧日潮纹碑石 | Ancient Tide Steles | 轮回遗产收藏项；提供持续科技点；工作译名 |
  | 薄壳 | Thin Shell | 远见之人天赋树副主题；工作译名 |
  | 存档管理 | Save Manager | 管理本机存档、导入导出和云端对比的面板名 |
  | 存档文件 | Save File | 可导入导出的文件形式存档 |
  | 存档码 | Save Code | 可复制、粘贴或分享的文本存档 |
  | 原始存档 | Raw Save | 不经当前版本重新序列化的存档原文 |
  | 救援包 | Recovery Bundle | 包含原始主档和备份、用于恢复的救援数据包 |
  | 旧档副本 | Emergency Recovery Copy | 读档异常后自动保留、只能手动导出的本机副本 |
  | 本机存档 | Local Save | 当前设备上的存档 |
  | 云存档 | Cloud Save | TapTap 云端保存的存档 |
  | 当前周目 | Current Run | 当前这一局的进度 |
  | 跨周目 | Meta-Progression | 轮回之间保留的进度；作存档名称时用 Meta-Progression Save |
  | 诊断信息 | Diagnostics | 用于复制并发送给开发者的存储状态信息 |
  | 主档 | Primary Save | 当前生效的主存档，与本机备份区分 |
  | 挑战 | Challenge | 可重复游玩的独立挑战内容；复数 Challenges |
  | 挑战档位 | Challenge tier | 每项挑战内部必须依序完成的档位 |
  | 通关 | clear | 挑战目标完成并结算奖励；作状态时依上下文用 cleared / complete |
  | 排行榜 | Leaderboard | 记录挑战成绩的榜单 |
  | 成就墙 | Achievement Wall | 展示已获得与未获得成就的页面标题 |
  | 挑战与轮回 | Challenges & Prestige | 成就分组名 |
  | 文明里程碑 | Civilization Milestones | 成就分组名 |
  | 轮回挑战 | Prestige Trials | 挑战面板的小标题 |
  | 安那其主义 | Anarchy | 终局挑战名称 |
  | 三地发射网 | Three-World Launch Network | 终局挑战名称 |
  | 掌控永远与须臾程度的能力 | Mastery of Eternity and the Moment | 三档终局挑战名称 |
  | 澄海 | Clear Sea | 水体污染挑战的最低污染阶段 |
  | 浊流 | Turbid Flow | 水体污染阶段名 |
  | 赤潮 | Red Tide | 水体污染阶段名 |
  | 死区 | Dead Zone | 水体污染阶段名 |
  | 腐渊 | Blighted Deep | 水体污染挑战的最高污染阶段 |
  | 暖流季 | Warm Season | 与寒流季相对的季节名 |
  | 虚境祭坛 | Verge Altar | 挑战限制中的建筑名 |
  | 行星发射场 | Planetary Launch Site | 欧罗巴、泰拉和恩克拉多斯上的发射场 |
  | 装罐填埋 | Canned Landfill | 水体污染挑战专属科技名 |
  | 星球气候调节卫星网 | Planetary Climate Regulation Satellite Network | 减少污染的奇观名 |
  | 大陆板块加固构件 | Continental Plate Reinforcement Array | 提供矿产产出加成的奇观名 |
  | 泰拉地壳密闭水舱巨构 | Terra Crust-Sealed Water Vat Megastructure | 提供人口上限并消耗热液能的建筑名 |
  | 星际远航 | Interstellar Voyage | 流浪泰拉挑战档位名称 |
  | 严冬计划 | Plan for Winter | 流浪泰拉专属科技名 |
  | 超临界致密材料 | Supercritical Dense Materials | 科技名 |
  | 微波收敛研究 | Microwave Convergence Research | 可多级研究的科技名 |
  | 星核炉芯池 | Stellar Core Reactor reservoir | 储存热液能的设施显示名 |
  | 核热厂 | Nuclear Heat Plant | 工坊升级影响的建筑名 |
  | θ生物材料 | θ-Biomaterial | 工坊副产物资源名 |
  | 薄壳之智 | Wisdom of the Thin Shell | 轮回强化名称 |
  | 百景乐团 | Baijing Ensemble | 两首背景音乐的作者名 |
  | 星屑礼包 | Stardust Pack | 兑换码奖励包名称 |
  | 墓位 | Burial slot | 水体污染挑战中的死亡人口安置容量 |
  | 壳外时代 | Beyond-the-Shell Era | 破壳后的时代名称 |
  | 探索壳外的星空 | Explore the Stars Beyond the Shell | 破壳结算面板的按钮名 |
  | 石屋 | Stone House | 人口建筑名 |
  | 喷口导流堤 | Vent Weir | 藻食产出建筑名 |
  | 海藻仓 | Kelp Store | 藻食容量建筑名 |
  | 压舱仓 | Ballast Warehouse | 资源容量建筑名 |
  | 潮纹馆 | Tidal Library | 科技产出建筑名 |
  | 研究所 | Research Institute | 建筑名；与科研所区分 |
  | 王国潮道 | Royal Canal | 降低居民奢侈品消耗的建筑名 |
  | 公民会堂 | Civic Hall | 增加议事厅或城堡市政点产出的建筑名 |
  | 天壳观测站 | Shell Observatory | 按削壳进度增加科技产出的建筑名 |
  | 速生珊瑚林 | Fast-Growing Coral Grove | 珊瑚匠职业专精建筑名 |
  | 商队驿站 | Caravanserai | 提供季节性资源收益的建筑名 |
  | 黑色方碑 | Black Obelisk | 信仰产出建筑名 |
  | 热锻工厂 | Hot Forge | 提高工艺制作效率的建筑名 |
  | 轨道卫星 | Orbital Satellite | 星空探索建筑名 |
  | 机器人充能站 | Robot Charging Station | 维持机器人岗位人口的建筑名 |
  | 欧罗巴冰面发射场 | Europa Ice Launch Site | 欧罗巴上的太阳帆与戴森球节点发射设施 |
  | 太阳星环 | Solar Ring | 近恒星轨道建筑名 |
  | 恩克拉多斯星轨道发射场 | Enceladus Orbital Launch Site | 恩克拉多斯上的太阳帆与戴森球节点发射设施 |
  | 潮汐往复机 | Tidal Engine | 水体污染挑战专属清洁能源建筑名 |
  | 太阳能基站 | Solar Power Station | 水体污染挑战专属清洁能源建筑名 |
  | 恩拉多克斯阵列风场 | Enladox Array Wind Farm | 挑战专属建筑名；中文名与其他位置的恩克拉多斯不同，需核实 |
  | 墓地 | Graveyard | 水体污染挑战中安置污染死者的建筑名 |
  | 保护区 | Nature Reserve | 水体污染挑战专属净化建筑名 |
  | 钛金板件 | Titanium Components | 马尔斯工造中心的加工资源名工作译名 |
  | 强人工智能 | Strong AI | 工坊升级名 |
  | 绝热材料 | Thermal Insulation | 解锁发射场戴森球节点模式的科技名 |
  | 鲛人 | Merfolk | 人口种族称呼；单复数均使用 merfolk |
  | 礁栖核心 | Reef Core | 建筑分区名称 |
  | 生息区 | Habitat Zone | 建筑分区名称 |
  | 工坊区 | Workshop Zone | 建筑分区名称 |
  | 贸易区域 | Trade Zone | 建筑分区名称 |
  | 学术区 | Academic Zone | 建筑分区名称 |
  | 市政区 | Civic Zone | 建筑分区名称 |
  | 信仰区 | Faith Zone | 建筑分区名称 |
  | 星海区 | Starfield Zone | 建筑分区名称 |
  | 破界区 | Beyond-the-Shell Zone | 建筑分区名称 |
  | 海底火山 | Undersea Volcano | 自然环境卡中的周期信息标题 |
  | 历法 | Calendar | 显示海底火山周期信息的科技名；本批工作译名 |
  | 减产季 | Reduced-output season | 深海藻场当季产出倍率低于正常值时的状态标签 |
  | 热液能流 | Hydrothermal Energy Flow | 即时供给与需求面板标题 |
  | 高压热机管道 | High-Pressure Thermal Pipe | 奇观名；工作译名 |
  | 自动化钻探 | Automated Drilling | 科技、工坊升级和热液能流设备短称共用名称 |
  | 魔鱼世界VR | Magic Fish World VR | 奇观名；工作译名，待项目方复核专名 |
  | 海洋污染 | Water Pollution | 水体污染挑战自然环境面板标题；沿用挑战名译名 |
  | 净污染存量 | Pollution stock | 水体污染面板中的当前污染总量指标 |
  | 墓地安息位 | Burial capacity | 水体污染挑战中可安置污染死亡人口的容量 |
  | 脏源 | Polluting source | 水体污染面板中会排放污染的来源类别 |
  | 技艺 | Craftsmanship | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 神秘主义 | Mysticism | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 乡镇集会 | Town Meeting | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 珊瑚培育 | Coral Cultivation | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 戏剧与诗歌 | Drama and Poetry | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 历史记录 | Historical Records | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 修道院 | Monastery | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 农奴制 | Serfdom | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 中世纪集市 | Medieval Market | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 职业行会 | Guilds | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 钢铁公会 | Steel Guild | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 三角贸易 | Triangular Trade | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 矿物章程 | Mineral Charter | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 天赋神权 | Gifted Theocracy | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 重商主义 | Mercantilism | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 启蒙运动 | Enlightenment | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 工业化配给 | Industrial Rationing | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 政治经济学 | Political Economy | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 基础物流建设 | Basic Logistics | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 城市供给 | City Supply | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 热能优先 | Thermal Energy First | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 总动员令 | General Mobilization | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 大众传媒 | Mass Media | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 博物馆管理 | Museum Management | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 国家凝聚力 | National Solidarity | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 公摊面积 | Shared Space | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 延长工时 | Overtime | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 直播竞技 | Live Competition | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 旅游观光 | Tourism | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 太空竞赛 | Space Race | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 神不在此 | No God Here | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 跨国经济 | Transnational Economy | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 未来主义神学 | Futurist Theology | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 星际广播 | Interstellar Broadcast | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 洲际物流 | Intercontinental Logistics | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 我们在此 | We Are Here | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 社交网络 | Social Network | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 虚拟现实 | Virtual Reality | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 星际物流网 | Interstellar Logistics Network | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 星际探索热潮 | Interstellar Exploration Fever | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 上上善道 | The Greater Good | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 联邦枢密院 | Federal Privy Council | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 血肉苦弱 | The Flesh Is Weak | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 各员一层奋力努力 | Everyone Gives Their All | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 心胜于物 | Mind Over Matter | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 超凡入圣 | Transcendence | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
| 星际后勤保障 | Interstellar Logistics Support | 政策卡名称；与资源速率标签「星际物流」(Interstellar Logistics) 区分。 |
  | 璀璨星图 | Brilliant Star Map | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 至高指令 | Supreme Directive | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 节能减耗 | Energy Conservation | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 我们的海 | Our Sea | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 征夫发役 | Corvée | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 王室特许 | Royal Charter | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 五年计划 | Five-Year Plan | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 庄园制 | Manorialism | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 公司税 | Corporate Tax | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 考古发掘 | Archaeological Dig | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 质量效应 | Mass Effect | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 隔离病患 | Quarantine | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 告解圣事 | Sacrament of Confession | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 保护星球 | Protect the Planet | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 最终手段 | Last Resort | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 疾控防治 | Disease Control | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 污染治理 | Pollution Control | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 绿色运动 | Green Movement | 政策卡名称；工作译名，后续校对须与效果说明及卡牌交叉引用统一。 |
  | 仓储区 | Storage Zone | 仓储容量效果所指向的建筑分区；工作译名。 |
  | 星空观测站 | Star Observatory | 「神不在此」卡效果的产出来源；建筑名工作译名，待项目维护者复核。 |
  | 大学 | University | 启蒙类政策卡效果引用的科研建筑；工作译名。 |
  | 广场 | Plaza | 市政点乘区效果引用的建筑名；工作译名。 |
  | 歌剧院 | Opera House | 提供官员市政点的建筑名；工作译名。 |
  | 城堡 | Castle | 政体和信仰政策卡引用的建筑名；具体政体下的显示名可能变化。 |
  | 珊瑚屋 | Coral House | 人口建筑名工作译名；需与正式建筑名称统一。 |
  | 牧场 | Pasture | 农奴制卡效果引用的建筑名；工作译名。 |
  | 藻场 | Kelp Farm | 农奴制卡效果引用的建筑简称；与 Deep-Sea Kelp Farm 术语统一。 |
  | 发射场 | Launch Site | 发射场政策卡效果中的通用建筑名称；具体设施按平台/行星使用完整建筑名。 |
  | 大工程师 | Great Engineer | 王室特许卡操作说明中消耗的伟人单位；工作译名。 |
  | 建造者 | Builder | 征夫发役卡操作说明中消耗使用次数的建造单位；工作译名。 |
  | 空间矢量控制 | Space Vector Control | 调整发射场制造周期的科技名；工作译名。 |
  | 川陀 | Trantor | 政策卡风味句中引用的科幻城市专名；沿用常见英译。 |
  | 伦尼姆 | Rhenium | 污染治理卡风味句中的城市专名；暂用工作拼写，需核对项目世界观。 |
  | 阿克西斯 | Axis | 最终手段卡风味句中的专名；暂用工作拼写，需核对项目世界观。 |
  | 德罗丽丝 | Deloris | 隔离病患卡风味句中的女王名；暂用工作拼写，需核对项目世界观。 |
  | 泥沙 | Silt | 矿工系产出的资源名；与金属（Metal）区分。 |
  | 事件视界 | Event Horizon | 戴森球终局演出中的天体物理术语。 |
  | 星之至宝 | Treasures of the Stars | 星屑商店升级树标题。 |
  | 星屑炼金 | Stardust Exchange | 星屑商店中的星屑与轮回点兑换区标题。 |
  | 旧日艺术品 | Old Artwork | 轮回结算后继承的收藏品类别。 |
  | 旧日潮纹碑石 | Old Tidal Steles | 轮回结算后继承的科技产出收藏品类别。 |
  | 破壳终章动画 | Shellbreak Finale | 凿穿天壳后的终章演出标题。 |
  | 戴森球终局演出 | Dyson Sphere Finale | 戴森球完工时的终局演出标题。 |

- 游戏标题首轮暂译为「From the Abyss to the Stars: A Deep-Sea Civilization Builder」；在商店页或正式发布前需单独做标题与营销文案校对。

## Key 命名

- 格式：`模块.对象.用途[.状态]`，全小写英文、点分段、语义稳定，例如 `ui.settings.audio.mute`、`resource.kelp.name`、`challenge.cold.goal`、`save.import.failed`。
- key 描述**用途**，不描述当前句子、页面行号、语言或翻译结果。改文案但用途不变时保留 key；一个 key 只对应一个完整语义单元。
- 不用中文原文、数组下标、源文件行号、版本号作 key；废弃 key 不复用。
- 同样的字在不同语境或功能中含义不同，应拆成不同 key。完全相同且语义相同的固定标签可以共用 key。

## 文案与占位符

- 每条记录写完整、可独立翻译的短句。不要把句子拆成「前缀 + 动态值 + 后缀」再靠字符串拼接；使用命名占位符，例如 `进度：{current}/{total}`，并填写占位符的类型、示例和语法要求。
- 首轮自动扫描发现的拼接片段保留原始行作源码审计，不逐段翻译。另建完整模板行，用命名占位符表达变量；片段行的目标语言状态标为「已废弃」，并在备注中链接完整模板编号。这表示片段不再作为独立翻译单元，不代表它不在界面显示。不同分支显示不同意思时分别建模板行。
- 占位符名字使用含义明确的英文名（`count`、`resource`、`duration`），不使用 `{0}`、`{1}`。变量值先按语言格式化；译文不得改变占位符名称。
- 文案含富文本/图标/换行时，在「标记与限制」注明允许的标记和不可移动的变量；能把结构与文案分开时，不把整段 HTML 登记成一条文案。
- 文案按界面实际可用空间写；有字符上限时登记长度。按钮用动词开头，错误提示说明发生了什么和玩家能做什么；避免依赖颜色、图标或位置表达唯一信息。
- 使用一致术语；新术语先查游戏内术语表，再决定是否新增。世界观专名由项目维护者统一，不让各译者自行音译/意译。

## 表格字段与状态

- 每行一条可独立翻译的文本；`文本 Key` 永久唯一。按功能筛选，不用合并单元格，不在数据行插空行。
- 语言列是宽表的主内容列。默认 `zh-CN` 是源文；每个目标语言有对应的翻译状态列。新增语言时按 `译文 + 状态` 成对增加整列。
- 状态仅用：`待翻译`、`草稿`、`待校对`、`已校对`、`语言无关`、`已废弃`、`平台不适用`、`非玩家可见`。译文为空不能标「已校对」；「语言无关」只用于玩家可见但由固定数字、运算符或符号组成、所有语言原样一致且不进入翻译资源的标签；「平台不适用」用于目标发行端不包含的专属功能，「非玩家可见」只用于确认过的扫描误报。修改源文后，所有目标语言状态回到「待翻译」或「待校对」。
- 「上下文」写页面/控件、触发时机和必要语气；「占位符」写名称、含义、格式示例；「备注」写术语、长度、标记、复数/性别/敬语等翻译约束。

## 语言无关的可见数字标签

只由固定数值、运算符或符号组成的玩家可见控件值（如 `+1`、`+25`、`100%`）仍保留在文案底表中，但英文译文留空、状态标为「语言无关」，不进入任何语言资源。用语义稳定的设置 ID 表示选项，数值从规则/数据读取；句子中的可变数值则使用命名占位符。不要把「语言无关」用于完整提示、错误消息或扫描误报。

## 不登记为 UI 文案的内容

稳定 ID、资源/科技/建筑键、存档键、API 字段、CSS/DOM 事件协议、算法常量、源代码注释、玩家自己输入并保存的名称不进入译文列。它们如果被展示给玩家，展示部分仍要登记；开发者专用诊断若可能出现在玩家界面，也按用户可见文案处理。

自动扫描发现的 HTML 标签、CSS 类名等结构字符串若确认不会显示给玩家，保留盘点行用于审计，译文留空、状态标为「非玩家可见」。

## 当前迁移期

现有源码尚未全部改为 `t(key)`，底表中的 `SB-xxxxx` 是盘点期稳定编号，用于定位和去重，不代表最终运行时 key。迁移某条文案时，先为它确定语义 key、补入代码资源，并在底表记录最终 key；不要直接把盘点编号当成永久 API。新写文案从一开始就用语义 key。




