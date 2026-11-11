# Steam 上架准备清单

更新日期：2026-11-04  
状态：准备阶段；商店素材 v1 已制作，Steam 桌面包尚未完成。

## 项目现状

- 当前入口是纯前端网页 `index.html`，README 描述为双击运行、无构建步骤；尚未看到 Steam 可上传的桌面发行包。
- 已生成本地化开发用 Electron Windows x64 安装器 `dist/electron/Shellbreak-Desktop-1.0.17-Setup.exe`。当前接入首批 en-US 静态界面、设置内语言切换与 Steam 游戏语言读取；其余游戏文本仍在迁移，Steam 功能适配与发行验收未完成。
- 代码中接有 TapTap 专属能力：激励广告、排行榜、成就、兑换码、TapTap 云存档。Steam 版需要决定逐项替换成 Steamworks、本地功能，还是从该版本移除。
- Steam 素材按「渊海群星：深海文明建设」制作；`index.html` 浏览器标题与页头主标题已同步为新名。README、TapTap 物料和部分历史文档仍保留旧名，后续如统一改名需逐项核对。
- 用户确认首发包含全部当前可玩内容，后续不计划追加游戏内容；商店描述按完整单人作品表述，不承诺未来扩展。
- 已有一套 TapTap 宣传物料和 25 秒实机录屏；当前 Steam 候选截图只有 3 张，尺寸均为 1600×900，不符合 Steam 截图最低尺寸和数量要求。
- 现有素材索引与提交说明：`assets/store/2026-relaunch/TapTap-上架物料/README-提交清单.md`。

## 先定下来的产品决策

- [x] Steam 素材工作名：按「渊海群星：深海文明建设」制作；在 Steam 商店页进入预发行审核前作最终确认。Steamworks 文档说明，进入预发行审核后不能更改游戏名。
- [ ] 英文商店名，以及首发语言和后续本地化范围。
- [x] 首发内容边界：全部当前可玩内容在首发开放，后续不计划新增游戏内容；商店页只承诺当前构建实际可玩的功能。
- [ ] 首发方式：完整发行或抢先体验；免费或付费；目标价格、折扣与大致发行窗口。
- [ ] 首发平台：建议先确定 Windows，再决定是否承诺 macOS/Linux。

## Steam 发行包与功能适配

- [x] 建立独立 Electron 桌面壳和 Windows x64 NSIS 打包命令，供本地化开发使用；TapTap 上传包不包含 `electron/`。
- [x] 接入首批 en-US 运行时词典；语言选择位于设置内，默认跟随 Steam 游戏语言；未知运行时和 TapTap 固定简体中文。
- [ ] 为当前网页游戏制作稳定的桌面发行包，并明确启动程序、支持系统与最低配置。
- [ ] 在干净 Windows 环境验证首次启动、重启、存档读写、窗口缩放、分辨率和退出恢复。
- [ ] 明确 TapTap 专属功能在 Steam 版的行为：
  - 激励广告加速 / 奖励：移除或改为无需广告的游戏内机制。
  - **首发硬门槛：成就迁移并接入 Steamworks。** 配置正式成就，在发行构建中验证解锁、重复启动后的状态同步及 Steam 客户端展示。
  - **首发硬门槛：排行榜迁移并接入 Steamworks。** 配置排行榜，在发行构建中验证成绩提交、读取和 Steam 客户端展示。
  - TapTap 兑换码：移除或设计 Steam 版可用的发放方式。
  - **首发硬门槛：实现 Steam 云存档。** 使用正式 Steam 存档路径，验证上传、下载、跨设备同步及冲突处理；不得只依赖浏览器缓存或本地存档。
- [ ] **发行阻断项：Steam 成就、Steam 云存档、Steam 排行榜均须在最终发行构建中完成并通过验收，缺一不可。** Steamworks 商店页的对应功能标记只在构建实际包含并验证功能后勾选。
- [ ] 统一桌面版存档位置与备份/导入方案，确保不会只依赖浏览器缓存。
- [ ] 为发行包准备版本号、更新日志、崩溃/问题反馈入口和隐私说明（如涉及个人数据或联网服务）。

## 商店页文案与设置

- [ ] 一句话介绍、短描述、完整描述、核心特色、系统需求、标签、语言、开发者/发行者信息。
- [ ] 确认商店页所有描述、截图、视频与首发构建一致，特别是「从深海到群星」的实际可玩范围。
- [ ] 完成 Steam 内容调查问卷；按实际内容填写，不照搬 TapTap 或旧版答案。
- 游戏内部分美术素材与 Steam 宣传图均使用生成式 AI 预先生成；内容调查问卷应如实披露两者。目前没有实时生成 AI 内容。[Steam Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey?l=english&pubDate=20260708)
- [ ] 确定价格、发行日期/窗口、是否抢先体验及对应说明。
- [ ] 准备简体中文商店文案，并决定英文文案；胶囊图与商店标题按 Steam 要求单独制作。

## Steam 商店素材

- [x] 首批视觉 v1 已放入 `assets/store/steam/2026-11-04/upload/`：四种商店胶囊、库封面/Logo/背景、图标。
- [x] 简体中文商店页文案、截图顺序与 30 秒预告片节奏草稿已放入同一素材目录。

- [ ] 商店胶囊：Header 920×430、Small 462×174、Main 1232×706、Vertical 748×896。
- [ ] 至少 5 张新标题实机截图；每张至少 1920×1080、16:9，画面展示首发构建，不加宣传口号或概念图。
- [ ] 至少 1 支预告片；第一支优先剪成实机玩法片，静音观看也能看懂主要循环。
- [ ] 确认 Logo、胶囊文字遵守 Steam 图像规则；主胶囊只放游戏名/正式副标题与游戏美术。
- [ ] 从当前版本重新截取截图并重新校对封面。已有的 3 张 TapTap 截图（1600×900）可作构图参考，不能直接作为 Steam 最终截图。

## Steamworks 账户与时间线

- [ ] 以实际收款/签约主体完成 Steamworks 入驻：法定姓名或实体名称、身份验证、税务信息、银行收款信息。
- [ ] 每款产品支付 100 美元 Steam Direct 费用；产品达到 1,000 美元调整后总收入后，该费用可在后续付款中回收。
- [ ] 首批产品需留出缴费后的 30 天等待期；商店页公开为 Coming Soon 至少 2 周。两项时间要求都满足后，才能安排首发。
- [ ] 商店页先送审并通过，再送游戏构建审核；官方建议商店页至少在计划公开前 7 天提交审核，并预留修改时间。
- [ ] 页面上线后持续更新公告、演示版/试玩计划和愿望单转化素材。

## 官方依据

- [Steam Direct 费用与入驻](https://partner.steamgames.com/doc/gettingstarted/appfee?language=english)
- [商店页制作与名称限制](https://partner.steamgames.com/doc/store/page?l=tchinese&language=english)
- [Steam 图形素材规格](https://partner.steamgames.com/doc/store/assets?l=english&language=english)
- [商店截图要求](https://partner.steamgames.com/doc/store/assets/standard?language=japanese)
- [预告片要求](https://partner.steamgames.com/doc/store/trailer)
- [发行流程与审核](https://partner.steamgames.com/doc/store/releasing?l=polish&language=english)
