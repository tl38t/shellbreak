/* 天壳 / SHELLBREAK — 配置层
 * 核心参数在此；轮回商品、职业与工坊工具表位于 config-catalog.js；
 * 经济内容表与建筑表分别位于 config-content.js / config-buildings.js。
 * sim/balance.mjs 与 sim/e2e.mjs 通过生产加载清单读取真实源码，不复制第二份数值。
 *
 * 节奏定案（2026-09-24）：首局原始时代 → 破冰重置，目标挂机 8-14 小时。
 * 定这个时长靠的是三条结构，不是三个系数：
 *   S1 削壳必须吃资源/燃料（ miracle 工程），玩家在「保障燃料」上做取舍
 *   S2 资源有仓储上限，超上限的部分浪费，逼玩家消费而非囤积
 *   S3 建筑成本指数 STEP 加陡，人口生长放缓，使「系数」的增长有墙
 */
(function (root) {
  'use strict';

  var CFG = {
    /* ---- 版本号与更新日志（2026-10-27 恢复）----
     * VERSION = 当前构建版本号；CHANGELOG = 最新在前，游戏内「更新日志」面板渲染这张表。
     * ⚠️ 2026-11-06 本地化：items 里存的是 i18n 语义 key，不是中文原文。中文基准与英文译文都在 i18n_text_inventory.xlsx / src/locales/zh-CN.js / electron/locales/en-US.js，
     *   由 render.js 的 openChangelog() 经 SB.i18n.t() 取词。改文案先改登记表再重新生成词库，不要在这里写回中文硬编码。
     * ⚠️ 版本号口径（2026-10-27 用户拍板改动）：对外版本名改为 `Ver1.0.1`，
     *   取代此前 `v0.MAJOR.MINOR`（原约定 2026-10-11 立，2026-10-27 废止）。
     *   对外文案 / TapTap 版本描述 / README 三处必须同口径。
     * ⚠️ 更新日志系统 2026-10-25 曾被整体删除（CFG.CHANGELOG、自动弹窗、页脚按钮与面板、
     *   meta.seenVersion）；2026-10-27 用户要求恢复，四处一并重建。 */
    VERSION: 'Ver1.2.1',
    /* ⚠️ 2026-10-28：Ver1.0.4-test 那三个 TEST_* 开关（静默启动 / 触摸水波纹 / 按下即关）
     *   已按用户拍板**整段摘除**，不再以「置 false」形式留在配置里 —— 留在表里就还有被
     *   误开的风险，也会让 `_repack.py` 的版本名一致性断言失去意义。
     *   对应的三段代码（bootUi 的弹窗包一层、installTouchPing、input.js 的按下即关）
     *   一并删除；更新日志**红点**与「更新日志」按钮入口保留。 */
    /* entering（2026-10-28 语义变更）：meta.seenVersion 与之不等 ⇒ 该版本有未读更新
     *   ⇒ 页脚「更新日志」按钮亮**红点**（不再是自动弹窗，见 game.js hasUnreadChangelog）；
     *   玩家点开面板后才写回 seenVersion 熄灯。
     * 老存档 meta 里没有 seenVersion ⇒ 恢复后第一次进入会亮红点，符合预期。 */
    CHANGELOG: [
      /* Ver1.2.1（2026-11-12）：三处玩家直接报障修复 —— 外交页「择取区域」按钮首次关闭/择卡后无反应、
       * 市政面板卷轴闪动、科技面板周期性闪动。升版四步中本次仅做 VERSION / CHANGELOG 两项；
       * index.html ?v= 与 _repack.py 断言待用户授权发布时再做。 */
      { v: 'Ver1.2.1', date: '2026-11-12', items: [
        // —— 修复 ——
        'changelog.fix.heritage_draft_unresponsive',
        'changelog.fix.civic_scroll_flicker',
        'changelog.fix.tech_panel_flicker'
      ] },
      /* Ver1.2.0（2026-11-12）：战争系统整体落地 —— 外交页与七阶敌国战役、三种战争行动与军力系统、
       * 敌国主动入侵、配套军事科技/工坊升级/建筑/奇观、战争与入侵结果提示。升版四步已补齐
       * （VERSION / CHANGELOG / index.html ?v / _repack.py 断言）。 */
      { v: 'Ver1.2.0', date: '2026-11-12', items: [
        // —— 新增：战争系统 ——
        'changelog.war.diplomacy_pane',
        'changelog.war.actions_and_power',
        'changelog.war.enemy_invasion',
        'changelog.war.military_tech_civics',
        'changelog.war.military_buildings_wonders',
        'changelog.war.result_feedback'
      ] },
      /* Ver1.1.1（2026-11-09）：1.1.0 之后的未发布改动合集。两条显示类优化 + 三条真实 bug 修复，
       * 其中「退役市政卡仍在生效」与「挑战竣工分母塌陷」都是玩家直接报过的现象。
       * 升版四步已补齐（VERSION / CHANGELOG / index.html ?v / _repack.py 断言）；2026-11-10 封包。 */
      { v: 'Ver1.1.1', date: '2026-11-09', items: [
        // —— 优化 ——
        'changelog.ui.number_units',
        'changelog.settings.ui_scale',
        // —— 修复 ——
        'changelog.fix.retired_policy_still_active',
        'changelog.fix.challenge_progress_denominator',
        'changelog.fix.pollution_policy_supersede'
      ] },
      /* Ver1.1.0（2026-11-07）：线上从 rc42-v1.0.17 直升。Ver1.0.18 / Ver1.0.19 两个包
       * 只封包、从未上线，故不单独留段；它们与 Ver1.0.17 段里后来补记的 7 条一起收编到本段。
       * Ver1.0.17 段保留线上玩家实际看到过的 3 条，逐字不动。 */
      { v: 'Ver1.1.0', date: '2026-11-07', items: [
        // —— 新增 ——
        'changelog.faith.tenet_system',
        'changelog.talent.stardust_shell_suppression',
        'changelog.talent.prestige_shellbreak_zeal',
        'changelog.talent.drill_overdrive',
        'changelog.challenge.wandering_terra_prerequisite',
        'changelog.ui.track_dock_craft_jump',
        'changelog.art.illustrated_icons',
        // —— 修复 ——
        'changelog.fix.furnace_blank_screen',
        'changelog.fix.ad_boost_carry_over',
        'changelog.fix.cycle_only_on_real_prestige',
        'changelog.fix.save_pick_by_run_count',
        'changelog.fix.wandering_terra_prereq_count',
        'changelog.fix.pollution_building_flavor',
        // —— 优化 ——
        'changelog.ui.help_badge_reposition',
        'changelog.ui.cycle_wording'
      ] },
      { v: 'Ver1.0.17', date: '2026-11-05', items: [
        // —— 修复 ——
        'changelog.fix.geology_threshold_inverted',
        'changelog.fix.hidden_completed_persistence',
        // —— 调整 ——
        'changelog.balance.warmstone_dynamic_rate'
      ] },
      { v: 'Ver1.0.16', date: '2026-11-04', items: [
        // —— 修复 ——
        'changelog.fix.challenge_settlement_no_reward',
        'changelog.fix.auto_workshop_slots',
        'changelog.fix.compound_factory_slot',
        // —— 调整 ——
        'changelog.balance.geology_threshold_25_percent'
      ] },
      { v: 'Ver1.0.15', date: '2026-11-04', items: [
        // —— 新增：四项终局挑战 ——
        'changelog.challenge.anarchy',
        'changelog.challenge.good_old_days',
        'changelog.challenge.three_world_launch_network',
        'changelog.challenge.mastery_eternity_moment',
        'changelog.challenge.endgame_restrictions',
        'changelog.challenge.tiered_prestige_bonus',
        // —— 修复 ——
        'changelog.fix.geek_stuck_post_shellbreak',
        'changelog.fix.geek_idle_energy_drain',
        'changelog.fix.challenge_active_after_shellbreak',
        'changelog.fix.merfolk_hydrothermal_bonus',
        // —— 新增 / 改进 ——
        'changelog.settings.replay_wandering_terra'
      ] },
      { v: 'Ver1.0.14', date: '2026-11-03', items: [
        // —— 修复 ——
        'changelog.fix.post_shellbreak_simulation_stalled',
        'changelog.fix.save_post_shellbreak_progress'
      ] },
      { v: 'Ver1.0.13', date: '2026-11-03', items: [
        // —— 修复 ——
        'changelog.fix.multilevel_tech_load',
        'changelog.fix.water_pollution_completion_label',
        'changelog.fix.water_pollution_active_label',
        'changelog.fix.load_era_rollback',
        // —— 新增 / 改进 ——
        'changelog.shellbreak.post_shellbreak_continuation',
        'changelog.shellbreak.challenge_resolution_choices',
        'changelog.challenge.release_restrictions',
        'changelog.challenge.progress_persists_post_shellbreak',
        'changelog.achievement.clear_waters_of_deep'
      ] },
      { v: 'Ver1.0.12', date: '2026-11-03', items: [
        // —— 修复 ——
        'changelog.fix.happiness_cost_blissful_reign',
        // —— 新增：挑战《水体污染》 ——
        'changelog.challenge.water_pollution',
        'changelog.challenge.water_pollution_content',
        'changelog.challenge.water_pollution_rewards'
      ] },
      { v: 'Ver1.0.11', date: '2026-11-02', items: [
        // —— 修复 ——
        'changelog.fix.sky_drill_post_shellbreak_energy',
        'changelog.fix.university_upgrade_value_refresh',
        'changelog.fix.thin_shell_wisdom_values',
        // —— 新增 / 改进 ——
        'changelog.challenge.replay_highest_tier',
        'changelog.ui.prestige_shop_tab_visible',
        'changelog.ui.clickable_text_links'
      ] },
      { v: 'Ver1.0.10', date: '2026-11-01', items: [
        // —— 修复 ——
        'changelog.fix.prestige_perk_effects',
        // —— 新增 / 改进 ——
        'changelog.ui.auto_study_controls',
        'changelog.audio.new_tracks'
      ] },
      { v: 'Ver1.0.9', date: '2026-10-31', items: [
        // —— 新增：挑战《流浪泰拉》+ 兑换码 ——
        'changelog.challenge.wandering_terra',
        'changelog.challenge.wandering_terra_rules',
        'changelog.challenge.wandering_terra_rewards',
        'changelog.technology.wandering_terra_additions',
        'changelog.wonder.wandering_terra_additions',
        'changelog.building.wandering_terra_additions',
        'changelog.workshop.wandering_terra_upgrades',
        'changelog.achievement.wandering_terra',
        'changelog.settings.redeem_codes',
        // —— 修复 ——
        'changelog.challenge.goal_descriptions'
      ] },
      { v: 'Ver1.0.8', date: '2026-10-30', items: [
        // —— 修复 ——
        'changelog.performance.offline_progress',
        // —— 新增 / 改进 ——
        'changelog.ui.building_tracker',
        'changelog.ui.shellbreak_hint'
      ] },
      { v: 'Ver1.0.7', date: '2026-10-30', items: [
        // —— 修复 ——
        'changelog.fix.taptap_local_save_fallback',
        'changelog.fix.import_save_revision',
        'changelog.fix.background_save',
        'changelog.fix.import_save_code_readback',
        // —— 新增 / 改进 ——
        'changelog.ui.cloud_restore_immediate',
        'changelog.save.diagnostics_api_shape'
      ] },
      { v: 'Ver1.0.6', date: '2026-10-30', items: [
        // —— 修复 ——
        'changelog.fix.taptap_startup_wait',
        'changelog.fix.late_taptap_local_recovery',
        // —— 新增 / 改进 ——
        'changelog.save.diagnostics_startup_wait'
      ] },
      { v: 'Ver1.0.5', date: '2026-10-29', items: [
        // —— 修复 ——
        'changelog.fix.prestige_upgrade_migration',
        'changelog.fix.sky_drill_status_labels',
        'changelog.fix.policy_slot_descriptions',
        // —— 新增 / 改进 ——
        'changelog.save.manual_save',
        'changelog.ui.resource_breakdown',
        'changelog.ui.build_tracker'
      ] },
      { v: 'Ver1.0.4', date: '2026-10-29', items: [
        // —— 修复 ——
        'changelog.fix.auto_recover_saves',
        'changelog.fix.invalid_resource_save_repair',
        'changelog.fix.backup_channels',
        'changelog.fix.readback_verification',
        // —— 新增 / 改进 ——
        'changelog.save.copy_diagnostics',
        'changelog.save.emergency_copy',
        'changelog.save.export_diagnostics'
      ] },
      { v: 'Ver1.0.3', date: '2026-10-28', items: [
        // —— 修复 ——
        'changelog.fix.cloud_startup_timeout',
        'changelog.fix.cloud_restore_reload_loop',
        'changelog.fix.save_import_readback',
        'changelog.fix.modal_tutorial_overlay',
        'changelog.fix.energy_saving_civic',
        // —— 新增 / 改进 ——
        'changelog.ui.changelog_badge',
        'changelog.achievement.second_nature_reward',
        'changelog.ui.silent_autoclick',
        'changelog.settings.autoclick'
      ] },
      { v: 'Ver1.0.2', date: '2026-10-28', items: [
        'changelog.save.cloud_restore_on_start',
        'changelog.save.local_cloud_comparison'
      ] },
      { v: 'Ver1.0.1', date: '2026-10-27', items: [
        'changelog.save.automatic_cloud_backup',
        'changelog.ui.policy_slot_selection',
        'changelog.copy.deep_sea_fish_farm'
      ] }
    ],
    // ---- ERA9 星海终局常量 ----
    /* SUNSAIL_HYDRO：太阳帆（星图累加器，s.sunSails，无限）每帆每秒供给的热液能（用户 2026-10-19 确认：0.1→0.05）。
     *   进 hydro 供给侧，与核热厂/泰坦气云并联相加（economy.hydroAlloc sunSailSupply）。 */
    SUNSAIL_HYDRO: 0.05,
    // ---- 天壳 ----
    // 厚度不是随手填的：扫描得出 rational 10.65h / rush 9.80h，都落在 8-14h 带内中部。
    // 它不是「难度」，是「长度」——砍薄只会让玩家更快看到结局。
    // 去建筑等级上限后系数从 34 涨到 73、时长涨了约 40%，故从上轮的 300000 回调到 200000。
    /* 冰封壳总厚度（一期唯一一层）。上下调这里只改变「一局多长」，不改变任何取舍结构——
     * 它是长度旋钮，不是难度旋钮。
     * ⚠️ **2026-10-07 用户拍板：100000 → 500000（5倍）**，为拉长单局体验。
     * ⚠️ **旧注释里的时长推导已全部作废**（300000→200000→100000 那一串扫描结论都是旧经济下的）：
     *   破壳速率 = BREAK_BASE(0.40) × 系数，**与壳厚完全无关**，所以壳厚 ×5 ⇒ 基础段时长 ×5。
     *   实测「真开局」单局 7.79h@100000 ⇒ **5 倍后基础段约 32h**，已远出8-14h 目标窗。
     *   这一点用户已知悉并接受（不是 bug，是长度旋钮的正常后果）。
     * ⚠️ **两处吃绝对值的逻辑会被 5 倍放大，改壳厚时必须一并看**：
     *   ① `SKYDRILL_RATE = 100 点/秒`（天穹钻机终章）：壳越厚，钻机要凿的绝对量越大
     *      ⇒ 终章从「凿穿最后 25%」变成「凿穿最后 125000 点」，且它吃 `SKYDRILL_DRILL(0.1/s)`
     *      共振钻头 + `SKYDRILL_HYDRO(20/s)` 热液能 ⇒ **资源消耗量随壳厚线性放大**，
     *      这是 5 倍壳厚下最可能被卡住的地方（不是壳厚本身，是配套产能）。
     *   ② `FLOOR_AT = 0.25` 是**比例**、不随壳厚变 ⇒ 自动段与钻机段的分界点仍是 25%，逻辑正确。
     * 结论：本次只改这一个数，不动任何配套常数（数值标定权在用户）。 */
    ICE_SHELL: 500000,
    /* ---- 冰封期（2026-09-27 改成随机触发，用户拍板）----
     * 旧形态：`shell/iceShell ≤ 0.25` 就**恒定**进冰封期，且一旦进去就再也出不来
     *   （壳只会更薄）⇒ 冰封期是「后期的一个永久状态」，不是一件会发生的事。
     * 新形态：**每个寒流季开局掷一次骰子**，中则这一整季是冰封期，季末自动解除。
     *   概率 = FREEZE_MAX × (1 − 壳剩余比例)，**线性**、壳见底时封顶 FREEZE_MAX。
     *   ⇒ 满壳开局 p = 0（不会莫名其妙挨冻）；壳剩一半 p ≈ 16.5%；壳见底 p → 33%。
     * ⚠️ 这条改动的连锁结论：**冰封期从此只在寒流季发生**，与季节轴**重合**了。
     *   旧代码里「轴 A 看壳厚、轴 B 看 t、两时段不重合」的那套论证整体作废
     *   （见 economy.warmRelief 上方那段注，已同步改写）。 */
    FREEZE_MAX: 0.33,     // 冰封期触发概率上限（壳见底时）
    COLD_SEASON_MUL: 0.6,  // 冰封期资源产出倍率（base）。⚠️ 轮回商店「寒潮储备」在其上 +0.02/级。
                           //   方案文档 L248 写「基础 0.25 → 0.33」，与现有 0.6 不一致；此处保留
                           //   现有 0.6 以免静默改动全盘平衡，待用户拍板是否改回 0.25。
    FLOOR_AT: 0.25,       // 基础自动削壳停手线：卡在 25% 由天穹钻机（wonder）凿穿最后一段。
                          // 判定必须用 <=，否则会卡在 25% 的死锁
    /* ⚠️ 2026-10-17 用户拍板：ERA7 开发期占位 1e9（避免太空时代结局中途触发 / 放开「星空探索>阈值」类尤里卡），
     *   ERA7 全部做完再回这里标定。必须与 CAP_BASE.starExplore 保持相等（e2e 有断言盯）。 */
    STAR_CAP: 400000,   // 星空槽满槽目标（太空时代终局资源）：破壳后被动累积至此 ⇒ 太空时代达成。2026-10-18 ERA8 实装：从 1e9 开发占位降到 400k（用户拍板暂定值，待标定）。
    /* ERA10（2026-10-20）：发射场制造节律基准（秒）——欧罗巴冰面发射场每「运行满 1 节律」
     * 产出 1 太阳帆或 1 戴森球节点（按等级并行：N 级 = N 份独立计时）。
     * 《空间矢量控制》eff.launchCycle = −2 ⇒ 实际节律 = max(1, 本值 + T.launchCycle)。
     * tick（economy-tick 2f）与 rates（economy-rates 发射场段）必须同读这一处。 */
    LAUNCH_CYCLE: 10,
    /* ERA10（2026-10-20）：戴森球通关目标——太阳帆 / 戴森球节点各需此数。
     * 进度 = min(帆/DYSON_SAIL_CAP, 节点/DYSON_NODE_CAP)（双达标取小，用户拍 Q4）。 */
    DYSON_SAIL_CAP: 10000,
    DYSON_NODE_CAP: 1000,

  // ---- 广告加速（TapTap 激励视频）----
  // 看一次广告 = 当前所选档位再 ×MUL，持续 BOOST_MIN 分钟（墙钟真实时间，关游戏也在走）。
  // SPACE_ID 每个应用不同，由 MCP `check_ads_status` / `get_ad_integration_guide` 取回。
  // 空串时**不发奖**（控件也隐藏），只有 URL 显式带 ?adtest 才走 dev 直接发放的兜底。
  AD: {
    // 自海渊至群星：深海文明建设（app_id 996563）竖屏激励视频位。
    // 取证：MCP `check_ads_status` 对 996563 返回
    //   ad_config = { status:1, landscape_space_id:"1054323", portrait_space_id:"1054324" }
    // 平台按应用的游戏方向自动匹配，本作 screen_orientation=0（竖屏）⇒ 取竖屏位 1054324。
    SPACE_ID: '1054324',
    BOOST_MIN: 30,           // 每次看完加多少分钟
    BOOST_CAP_MIN: 360,      // 累计上限（6 小时），防一次刷满无限囤
    MUL: 2,                  // 加速倍率（在玩家所选档位上再乘）
    REBIRTH_DAILY_MAX: 10    // 「看广告 +1 轮回点」每日可看次数上限（本地日期跨天自动重置）
  },

  /* ---- 排行榜（2026-10-07）----
   * 榜 ID 由 MCP `create_leaderboard` 在**天壳应用**上创建后回填（现在全是空串）。
   * ⚠️ 建榜必须先有天壳应用，账号「音速工业」下目前只有深空放置 898459 ⇒ 同广告位，
   *    是同一个前置阻塞。
   * ⚠️ `submitScores` 单次上限 5 条 ⇒ 最多 5 个榜。
   *
   * 【时间口径：为什么不直接用 s.t】`s.t` 是**逻辑秒**（economy.js 的 `s.t += dt`，
   *   dt = STEP = 0.1），它**吃游戏倍速** ⇒ 广告 2× 一开榜上时间直接腰斩；
   *   且离线补算走**同一条** economy.tick ⇒ s.t 还**含离线时间**（封顶 offlineCap）。
   *   所以另记 `S.wallT`（墙钟秒，不吃倍速）。离线挂机照算进成绩 —— 游戏本就支持
   *   离线补算，那段时间确实在推进你的文明。
   *
   * 【口径：scoreType / scoreOrder / calcType】来自 MCP `create_leaderboard` 的真实
   *   enum，不是猜的：
   *     scoreType  : 'numeric' | 'time'       （time = 时间榜）
   *     scoreOrder : 'desc'(高→低) | 'asc'(低→高)（asc = 越快越靠前）
   *     calcType   : 'sum' | 'best' | 'latest' （best = 取历史最好一局）
   * ⚠️ `score` 必须是**整数**（平台文档明写 Integer）⇒ 时间榜只能提交整秒。
   * ⚠️ RANK_LB 里的下标是 `submitScores({scores:[...]})` 数组的位置，与 MAP.key 一一对应。 */
  RANK: {
    /* 键名自取，值是榜 ID。任一项为空串 ⇒ 该榜跳过提交（不占5 条配额），
     * 入口按 available() 决定是否显示。
     * ⛔ 必须初始化为**空串**（不是 {} / null / undefined）：rank.js 用 `if (lb[k])` 判
     *   「是否回填」，而 {} 也是 truthy ⇒ 会把未回填的榜当成已回填并发请求，
     *   报出 500001。与广告 SPACE_ID 那次是同构的坑（truthy 占位）。 */
    LB: {
      /* 2026-10-26 于现行发布主体 996563 上重建全部 9 榜，经 MCP create_leaderboard 返回的
         「客户端 ID」回填（旧 963517 的 7 个 ID 已作废——996563 重连后 list 为 0 条）。
         榜参数核对：period 均「不重置」⇔ calc_type:best 语义一致。 */
      fastest: 'wk8s9lkm23g2eihkz8',    // 最快凿穿冰壳   time / asc  / best  (db 12737)
      firstFaith: 'zgq97kctyiqffhcr9p', // 最快立教       time / asc  / best  (db 12738)
      dev: 'riikrs1jp5m6a1nyjy',        // 综合发展分     numeric / desc / best  (db 12739)
      wonder: 'ew5xr8ex1y75ndd9kd',     // 入藏奇观       numeric / desc / best  (db 12740)
      cycle: 'dl64gq9ao80hvnn5j8',      // 轮回次数       numeric / desc / best  (db 12741)
      star: '3o19a9rpfhm8bnbe94',       // 最多星屑       numeric / desc / best  (db 12742)
      tide: 'peq757lhctr3dqzx8j',       // 最多轮回点     numeric / desc / best（累计获得数单独记账，兑换往返不重复计入）(db 12743)
      dyson: 'bvn169c2u30f2xhmqj',      // 最快建立戴森球 time / asc / best  (db 12744)
      void: '6bi4710gm6oswyed0m',        // 最快虚境飞升   time / asc / best  (db 12745)
      /* 2026-10-31 于 996563 新建（db 15061，create_leaderboard 自动发布）：
       * 流浪泰拉达成那一刻的墙钟秒数（50 座行星发动机 + 星核炉芯池灌满 50M）。 */
      drift: 'jqqgofg5g3tvb1uxwz',       // 最快流浪启程   time / asc / best  (db 15061)
      /* 星海竞速（2026-11-07 于 996563 新建，db 17618）：挑战局戴森竣工时的墙钟秒。
       * ⚠️ 不复用 dyson 全局榜 —— 普通局也提交那条，挑战局带额外时限不可能更快，
       *    复用等于永远不上榜。 */
      dysonrush: 'a2bcbiqjfc59e29uel',  // 最快星海竞速   time / asc / best  (db 17618)
      /* 水体污染（2026-11-02 定义 / 2026-11-07 于 996563 新建，db 17617）：
       * 通关瞬间的污染存量，越小越好。空串时 rank.submitRun 用 `if (lb[k])` 自动跳过、
       * 不发请求、不会 500001。 */
      pollution: 'pqfonhv7uvjrdcxl4e'    // 最低污染通关   numeric / asc / best  (db 17617)
    },
    /* 榜 -> 参数表。与 LB 平行维护，键必须对得上。 */
    MAP: {
      fastest:  { title: '最快凿穿冰壳', scoreType: 'time',   scoreOrder: 'asc',  calcType: 'best' },
      firstFaith: { title: '最快立教', scoreType: 'time',   scoreOrder: 'asc',  calcType: 'best' },
      dev:      { title: '综合发展分',   scoreType: 'numeric', scoreOrder: 'desc', calcType: 'best' },
      wonder:   { title: '入藏奇观',scoreType: 'numeric', scoreOrder: 'desc', calcType: 'best' },
      cycle:    { title: '轮回次数',     scoreType: 'numeric', scoreOrder: 'desc', calcType: 'best' },
      star:     { title: '最多星屑',     scoreType: 'numeric', scoreOrder: 'desc', calcType: 'best' },
      tide:     { title: '最多轮回点',   scoreType: 'numeric', scoreOrder: 'desc', calcType: 'best' },
      dyson:    { title: '最快建立戴森球', scoreType: 'time',   scoreOrder: 'asc',  calcType: 'best' },
      void:     { title: '最快虚境飞升', scoreType: 'time',   scoreOrder: 'asc',  calcType: 'best' },
      drift:    { title: '最快流浪启程', scoreType: 'time',   scoreOrder: 'asc',  calcType: 'best' },
      /* 星海竞速：只收录挑战周目的戴森竣工成绩。与 dyson 全局榜同用 s.wallT 这把尺子，
       * 三档时限不同 ⇒ 不按「剩余时间」排（那没法跨档比较）。 */
      dysonrush: { title: '最快星海竞速', scoreType: 'time', scoreOrder: 'asc', calcType: 'best' },
      /* 水体污染：通关瞬间的污染存量（整数、越小越好）。与 dyson/void 的时间榜并列，
       * 但比的是「你把海留得多干净」，所以是 numeric + asc。 */
      pollution: { title: '最低污染通关', scoreType: 'numeric', scoreOrder: 'asc', calcType: 'best' }
    },
    /* 时间榜的显示单位（分数仍是整秒，这里只管 UI 上怎么写）。
     *⛔ 不做「毫秒榜」：score 必须是整数，秒以下精度平台存不了。 */
    SECONDS_PER_DAY: 86400
  },

  /* ---- TapTap 成就（2026-10-15）----
   * ⛔ 与排行榜同一条边界：ID 必须是非空字符串；占位 '0' / '' / 对象都算「未回填」⇒ 跳过解锁。
   *   成就 ID 由 TapTap 后台「游戏服务 → 成就」创建后回填（MCP 无建成就工具，只能后台手建）。
   *   键与 src/achv.js 的 DEFS 一一对应，改键名两处同改。
   *   图标：assets/achievements/achv-*.png（512×512 PNG，后台创建时上传）。 */
  ACHV: {
    cold: 'SHELLBREAK_COLD',                     // 寒流禁火 — 单次挑战通关
    small: 'SHELLBREAK_SMALL',                   // 小国寡民 — 单次挑战通关
    science: 'SHELLBREAK_SCIENCE',               // 忽视科文 — 三档全通
    abyss: 'SHELLBREAK_ABYSS',                   // 深渊重压 — 三档全通
    firstRebirth: 'SHELLBREAK_FIRST_REBIRTH',     // 首次轮回 — 首次合格破壳结算

    /* ---- 2026-10-24 成就扩充（设计稿 docs/ACHV_DESIGN_v0.3.md）：+57 条 ----
     * ⛔ 全部占位 '0'：TapTap 后台建成后逐条回填真 ID（MCP 无建成就工具）。
     *    未回填期间 unlockOnce 只记本地账本（meta.achv，成就墙真源），不发平台请求。
     *    名称/简介来源《assets/achievements/成就文案_v0.1.md》（待评审）；
     *    展示文案在 src/achv.js DEFS_BASE（改键名两处同改）。 */
    /* —— 通用 12 条 —— */
    shellBreak: '0',          // 首次破壳（占位）
    dysonEnd: '0',            // 控星之人（占位）
    voidEnd: '0',             // 虚境飞升（占位）
    speedrun: '0',            // 逐光竞速（占位）
    starComplete: '0',        // 太空时代（占位）
    religion: '0',            // 立教（占位）
    rebirth10: '0',           // 十次轮回（占位）
    relic10: '0',             // 旧日遗珍（占位）
    relic25: '0',             // 遗珍全集（占位）
    techAll: '0',             // 科技大成（占位）
    civicAll: '0',            // 市政大成（占位）
    halfDyson: '0',           // 半程星环（占位）
    driftTerra: '0',          // 流浪泰拉挑战完成
    pollutionClear: '0',      // 水体污染挑战完成（占位）
    /* —— 轻车熟路 45 条（bld_* 从 SB.BUILDINGS 派生，键与建筑 id 一一对应）——
     * 口径：该建筑跨周目累计购买等级 ≥100（唯一购买漏斗 habitat.build 的 s.lvl[id]++）。 */
    bld_kelp: '0',            // 深海藻场：轻车熟路
    bld_nest: '0',            // 礁口巢：轻车熟路
    bld_coralhouse: '0',      // 石屋：轻车熟路
    bld_siltpit: '0',         // 砂矿坑：轻车熟路
    bld_hall: '0',            // 议事厅：轻车熟路
    bld_weir: '0',            // 喷口导流堤：轻车熟路
    bld_warmnest: '0',        // 深海鱼牧场：轻车熟路
    bld_kelpstore: '0',       // 海藻仓：轻车熟路
    bld_ballast: '0',         // 压舱仓：轻车熟路
    bld_lighthouse: '0',      // 灯塔：轻车熟路
    bld_workshop: '0',        // 工坊：轻车熟路
    bld_furnace: '0',         // 热泉炉：轻车熟路
    bld_library: '0',         // 潮纹馆：轻车熟路
    bld_institute: '0',       // 研究所：轻车熟路
    bld_square: '0',          // 广场：轻车熟路
    bld_temple: '0',          // 神庙：轻车熟路
    bld_hydroturbine: '0',    // 热液汽轮机：轻车熟路
    bld_hydroshop: '0',       // 热液工坊：轻车熟路
    bld_canal: '0',           // 王国潮道：轻车熟路
    bld_civichall: '0',       // 公民会堂：轻车熟路
    bld_observatory: '0',     // 天壳观测站：轻车熟路
    bld_coralfarm: '0',       // 速生珊瑚林：轻车熟路
    bld_bank: '0',            // 银行：轻车熟路
    bld_caravanserai: '0',    // 商队驿站：轻车熟路
    bld_museum: '0',          // 博物馆：轻车熟路
    bld_black_monolith: '0',  // 黑色方碑：轻车熟路
    bld_hotforge: '0',        // 热锻工厂：轻车熟路
    bld_school: '0',          // 学校：轻车熟路
    bld_theater: '0',         // 歌剧院：轻车熟路
    bld_tenement: '0',        // 廉租社区：轻车熟路
    bld_researchlab: '0',     // 科研所：轻车熟路
    bld_satellite: '0',       // 轨道卫星：轻车熟路
    bld_spacestation: '0',    // 空间站：轻车熟路
    bld_fissionplant: '0',    // 核热厂：轻车熟路
    bld_stadium: '0',         // 体育场：轻车熟路
    bld_biomatlab: '0',       // 生物材料研究所：轻车熟路
    bld_rheamine: '0',        // 瑞亚星矿井：轻车熟路
    bld_titancloud: '0',      // 泰坦星气云采集站：轻车熟路
    bld_robotbay: '0',        // 机器人充能站：轻车熟路
    bld_mars_workshop: '0',   // 马尔斯工造中心：轻车熟路
    bld_europa_launch: '0',   // 欧罗巴冰面发射场：轻车熟路
    bld_solar_ring: '0',      // 太阳星环：轻车熟路
    bld_terra_launch: '0',    // 泰拉星轨道发射场：轻车熟路
    bld_enceladus_launch: '0',// 恩克拉多斯星轨道发射场：轻车熟路
    bld_void_altar: '0',      // 虚境祭坛：轻车熟路
  },

  // ---- 纪元 ----

  /* ---- 市政（2026-09-27 兑现「议事厅开启市政树」那条欠账）----
   * 【两个来源的比例】用户口径「书手为主、议事厅给少量」——所以书手是 UNIT.culture 那条
   *   绝对值线，议事厅这里只给一个**每级**的小系数。
   * ⚠️ **HALL_RATE 是待拍值，不是标定结果**（用户口径只说了「少量」没给数）。
   *   当前 0.05/级/秒 的含义：议事厅 6 级 ≈ 0.3/s ≈ 2 个书手。改这一个数即可，
   *   别去改别处——产出侧的公式只有 economy.cultureRate 一处。 */
  CIVIC: {
    HALL_RATE: 0.05       // 议事厅每级每秒的市政点（⚠️ 待拍）
  },

  // ---- 建筑成本 ----
  // 没有全局统一系数，也没有等级上限：每建筑自带 `ratio`，成本是唯一的刹车。
  // 这条对齐猫国建设者——官方源码里 maxLevel/levelCap/buildMax 全仓库零匹配，
  // 它压住人口的手段是木屋 priceRatio 2.5（"贵"，不是"上限"）。

    // ---- 背景音乐 BGM（2026-10-31 新增 / 2026-11-07 改为按纪元分段）----
    // 单一数据源：曲名 / 作者 / 资源路径 / 播放阶段。设置面板「音乐」段只读取这里，不写死字符串。
    // ⚠️ 2026-11-07 用户拍板：不再按 s.broken 二分「破壳前/后」，改按 s.era 三段分池，
    //    每段两首、池内播完随机换下一首（shuffle，不是每局抽定一首）：
    //      era 1-4  → 01 冰壳之下 / 02 向着天穹
    //      era 5-7  → 03 初见群星 / 04 星间徜徉
    //      era 8-10 → 05 以星为局 / 06 光辉纪元
    //    ERA5 仍是壳内「破壳纪」、ERA6 才是壳外「初生纪」（见 techs.js），所以破壳瞬间
    //    **不单独换曲**，《向着天穹》也会在壳内响 —— 这是有意推翻 docs/BGM_BRIEF_v0.1.md
    //    的「两首 = 破壳前后」叙事设定，别再拿旧 brief 当判据。
    // ⚠️ 05 用专门的 Loop 轨（首尾可接），不用含 13.91s 引子 + 9.48s 尾巴的完整曲；
    //    03/04/06 暂时只有完整曲，loop 接缝由 audio.js 的 0.8s 交叉淡变遮盖。
    // file 走相对路径，与 index.html 的脚本/资源同根；文件名一律 ASCII
    //（中文名 + ~ 在 WebView 相对路径有编码风险）。author 统一「百景乐团」。
    AUDIO: {
      enabled: true,                  // 总开关：false 时连 Audio 元素都不创建（极端低端机可关）
      defaultVolume: 1,               // 默认音量（0~1）；静音由 s.audioMuted / meta.audioMuted 控制
      crossfadeMs: 800,               // 跨段 / 池内换曲 / 手动切换的交叉淡入淡出时长
      /* ⚠️ 手动选曲（2026-11-07 用户拍板）：s.audioTrack / meta.audioTrack 存曲目 id，
       *    空串 / 非法 id = 自动（按纪元分池）；非空且合法 = **锁定该曲**，优先级高于一切自动逻辑：
       *    跨纪元、破壳、轮回、播完轮换全部短路，直到玩家把下拉改回「自动」或改选另一首。
       *    两层模型照抄 audioMuted / audioVolume（本局行为 + 跨周目偏好），freshRun 必须登记。
       * 曲名保留中文基准供未加载词库时兜底；玩家实际看到的曲名、设置标签和阶段名均由 i18n key 提供。 */
      pools: [
        { id: 'under_ice',   label: '纪元 1–4', eras: [1, 2, 3, 4], tracks: ['underIce', 'firmament'] },
        { id: 'first_stars', label: '纪元 5–7', eras: [5, 6, 7],    tracks: ['glance', 'waltz'] },
        { id: 'star_sea',    label: '纪元 8–10', eras: [8, 9, 10],   tracks: ['celestial', 'radiance'] }
      ],
      tracks: {
        underIce:  { id: 'underIce',  name: '冰壳之下', author: '百景乐团', file: 'assets/audio/under_ice_depth_loop_20261030_v9_cq128.m4a' },
        firmament: { id: 'firmament', name: '向着天穹', author: '百景乐团', file: 'assets/audio/toward_the_firmament_loop_20261030_v2_cq128.m4a' },
        glance:    { id: 'glance',    name: '初见群星', author: '百景乐团', file: 'assets/audio/bgm_03_glance_to_the_stars_cq128.m4a' },
        waltz:     { id: 'waltz',     name: '星间徜徉', author: '百景乐团', file: 'assets/audio/bgm_04_waltz_among_the_stars_cq128.m4a' },
        celestial: { id: 'celestial', name: '以星为局', author: '百景乐团', file: 'assets/audio/bgm_05_celestial_game_loop_cq128.m4a' },
        radiance:  { id: 'radiance',  name: '光辉纪元', author: '百景乐团', file: 'assets/audio/bgm_06_age_of_radiance_cq128.m4a' }
      }
    },

    // ---- 破壳系数（玩家的破壳主指标）----
    // 系数 = Σ 各项贡献，破壳速率 = BREAK_BASE × 系数（点/秒）。
    // 每项都有自己的墙：人口受住房卡、级数受成本卡、研究要科技。
    // 系数因此不会无限涨，也不会一开局就满顶。
    COEF: {
      POP: 0.26, POP_POW: 0.62,   // 鱼群规模
      LVL: 0.14, LVL_POW: 0.72,   // 建筑总级数
      TECH: 0.80,                 // 每个已研究科技
      PERK: 0.10,                 // 每层轮回增益
      COLD: 1.35                  // 冰封期系数加成：壳越薄，文明越拼命
    },
    BREAK_BASE: 0.40,             // 点/秒 = BREAK_BASE × 系数
    /* 万众热忱（2026-11-05 用户拍板）：每级给基础自动削壳 +20%，加算（1 + 0.2×级数）。
     * ⚠️ 只乘在 shell.js autoRate 的独立乘区上，不进 breakCoef —— 后者还被暖石费率、
     *    星空槽、coef 型尤里卡与建造日志共用，且带 COLD / 总动员令乘区。 */
    SHELL_DRIVE_STEP: 0.2,
    STAR_BASE: 0.1,               // 星空槽被动累积速率 = STAR_BASE × breakCoef（点/秒）；较原值下调 15 倍
    STAR_UPG_BONUS: 1,            // 每装一级星空观测站升级（upg_starscope）额外 +1/s（保留旧升级语义）

    // ---- 旅行者1号（ERA8 奇观，2026-10-18 · spec §4）----
    // 星空进度两档条件效果的阈值与两档速率（wonder.js voyagerStarRate/voyagerScholarMul 读）。
    // 25% @ STAR_CAP 400k = 100k 星空探索；未满档 +100/秒（追赶），满后 +25/秒（巡航）+ 学者 +10%。
    VOYAGER_PCT: 0.25,
    VOYAGER_STAR_FULL: 100,
    VOYAGER_STAR_AFTER: 25,
    VOYAGER_SCHOLAR: 0.10,

    // ---- 哈'利法宇宙望远镜 / 魔鱼世界VR（ERA8 市政奇观，2026-10-18 · 用户市政表）----
    // 哈利法：星空两档 + 学者 +10%（与旅行者1号独立叠加，wonder.khalifa* 读）。
    // 魔鱼VR：运转持续耗热液能（hydroAlloc vrDraw 读；幸福度 +1 走 effect.happyBonus 既有通道）。
    KHALIFA_PCT: 0.25,
    KHALIFA_STAR_FULL: 100,
    KHALIFA_STAR_AFTER: 25,
    KHALIFA_SCHOLAR: 0.10,
    FISHVR_HYDRO: 5,
    /* ERA10（2026-10-20 · 用户 ERA10 表「引力弹弓」）：朱庇特质量加速站每秒耗热液能。
     * ⚠️ 奇观的运行耗流常量一直住在 CFG（对照 FISHVR_HYDRO:5 / SKYDRILL_HYDRO:20 /
     *    GEEK_HYDRO:40），建筑级耗流才住 UNIT（launchSailHydro / dysonNodeHydro / robotbayHydro）。
     *    本轮曾把这条误写进 SB.UNIT.jupitorHydro 而 wonder.js 读 CFG ⇒ 读不存在的键
     *    恒得 0，奇观建成一滴热液能都不耗（e2e era10-content 已钉住这个读数）。 */
    JUPITOR_HYDRO: 20,

    // ---- 天穹钻机（ERA5 破壳终章，2026-10-02 实装）----
    // 基础自动削壳卡在 FLOOR_AT（25%）；凿穿最后 25% 的终章交给天穹钻机：
    // 2026-10-07 改手动启动（自然环境卡「启动钻机」按钮），吃共振钻头 + 热液能，破壳 100/s。
    SKYDRILL_RATE: 100,         // 每秒削壳点数（不受系数缩放，终章一刀）
    SKYDRILL_DRILL: 0.1,        // 每秒消耗的共振钻头（= 每 tick 0.1×dt；机器总设计待拍板前的占位速率）
    /* 天元突破（2026-11-05 用户拍板 2× / 40 轮回点）：2× 档把【钻头耗率】与【削壳速率】
     * 同倍线性放大 ⇒ 凿完同一段壳的钻头总消耗不变，代价是产能要供得上 0.2/秒。
     * ⚠️ 热液能 SKYDRILL_HYDRO 不随倍率放大（用户只说「投入两倍钻头」）。
     * 档位只允许 1 / 2（校验在 state.normalizeMeta），唯一读数口 = SB.shell.skydrillMul。 */
    SKYDRILL_OVERDRIVE_MUL: 2,
    SKYDRILL_HYDRO: 20,         // 每秒消耗的热液能
    SKYDRILL_CIVIC: 100,        // 破壳完成后（奇观态）：每秒市政点 +100
    SKYDRILL_HAPPY_RUN: 1,      // 运行态：幸福度 −1（机器轰鸣）
    SKYDRILL_HAPPY_WONDER: 1,   // 破壳完成后（奇观态）：幸福度 +1

    // ---- 星球重构机 G.E.E.K（ERA9 · 生态重塑解锁奇观，2026-10-19 实装）----
    // 运行态：每 s 吃热液能流（geekHydro，走 hydroAlloc 取剩流）+ 库存 kelp(藻食)/silt(金属)/stone(石头)/coral(珊瑚)；
    // ⚠️ 资源键对照（2026-10-21 修 bug）：「金属」在 RESS 里的键是 **silt**（config-content.js:41），不是 metal！
    //   旧代码读 s.res.metal（不存在 → 0）⇒ GEEK 永远判金属不足而**永久停摆**；现已改正读 s.res.silt。
    // 缺料/断流暂停、进度保留（enceladusRun/terraRun 累加，绝不回拨开关）。无幸福度副作用（用户拍板）。
    // 恩克拉多斯 1800s → 覆盖建筑造价等级偏移 +3；泰拉 3600s → 叠加 +5（合计 +8，costOf 单一落点）。
    GEEK_HYDRO: 40,             // 每秒消耗的热液能（flow，hydroAlloc 取剩流）
    GEEK_KELP: 1500,            // 每秒消耗的藻食（库存）——2026-10-21 用户拍：1500
    GEEK_METAL: 500,            // 每秒消耗的「金属」，键 = silt（非 metal！）——2026-10-21 用户拍：500
    GEEK_STONE: 500,            // 每秒消耗的石头（库存）——2026-10-21 用户拍：500
    GEEK_CORAL: 500,            // 每秒消耗的珊瑚（库存）——2026-10-21 用户拍：500
    GEEK_ENCELADUS_SECONDS: 1800,    // 恩克拉多斯星改造耗时（游戏内秒，受 10×/离线影响）
    GEEK_TERRA_SECONDS: 3600,   // 泰拉星改造耗时（游戏内秒）

    // ---- 仓储（S2）----
    // 超上限的部分直接浪费。囤积不再是无收益的，玩家必须把产出导向消费。
    /* 【2026-09-26 第三轮：改成猫国形态】上限 = 起步容量 + **专门的仓库建筑**。
     * 旧的「每建筑级给一点全局容量」那一轴（`CAP_PER_LVL`）已整块删除。
     *   ① CAP_BASE[k]       起步容量（0 在这里是**真的 0**，见 economy.capOf 的判空）
     *   ② 海藻仓 kelpstore   藻食上限（对标猫国 barn 管 catnip），era1「种植」解锁
     *   ③ 压舱仓 ballast     其余资源上限（对标猫国 warehouse 管材料），era2 解锁
     *
     * 【为什么删 CAP_PER_LVL · 用户拍板】它让「盖任何一座建筑」都等于盖仓 ——
     * 「储」这个旋钮成了一个全局副产品，玩家没有「我该在哪座建筑上花料」的取舍。
     * 猫国的容量 100% 来自专门的仓库建筑（resources.js:792
     * `var maxValue = game.getEffect(res.name + "Max") || 0;`，一座容量建筑都没有时
     * 上限就是 0）。本作保留 CAP_BASE 当开局底数（自有设计，猫国没有这一项）。
     *
     * 【上一轮留下的教训，别丢】旧 CAP_PER_LVL 全资源共用标量 400 ⇒ 上限一律 18k+，
     * 而各资源产出速率差 8 倍（珊瑚 0.50/s vs 精铁 0.06/s）：珊瑚 1.1 小时填满、
     * 精铁 8.5 小时填不满，上限对慢的资源等于不存在。那时靠「逐资源给系数」压量级；
     * 现在这个量级由**仓库建筑的逐资源给量表**承担（猫国正是这么做的：
     * barn 给 catnip 5000 / wood 200 / minerals 250，量级差本身就是在说重要性）。
     *
     * ⚠️ 藻食只认海藻仓与藻食扩容；其余有上限资源由压舱仓和通用扩容升级增加容量，互不串线。
     * ⚠️ warmstone 的 base 600 是**开局仓储底数**。旧口径「保温法固定烧 1.0/秒 ×
     *    SEASON_TICKS 600 秒 = 一季正好 600」在 2026-11-05 改动态费率后**整段作废**：
     *    现在每秒烧石 = WARM_COEF_RATE × 破壳系数，随文明规模涨，600 不再等于「一季的量」，
     *    也不再与 SEASON_TICKS 强耦合。⚠️ 别按旧公式回头调 CAP_BASE.warmstone。
     *    断火判据改看净额：N(s) = P(s) − r(s) − D(s)，需 K(s) ≥ max(0, −N(s)) × SEASON_TICKS。
     * ⚠️ 表外资源（science）不给键 ⇒ 走 Infinity。科技不吃仓储是设计决定，
     *   capOf 用 `=== undefined` 判表外，所以「明写 0」与「缺键」是两件事。 */
    CAP_BASE: { kelp: 200, coral: 600, stone: 400, silt: 200, warmstone: 600, iron: 200, titanium: 200, thetaMetal: 200, fuel: 300,
      /* 星空探索走通用 matCap 路径；所有 kind:'craft' 工艺资源均不设 CAP_BASE。
       * ERA8（2026-10-18 · spec §0-B4 用户拍暂定）：星空探索上限从 ERA7 的 1e9 占位降回 **400k**
       *   （与下方 CFG.STAR_CAP 一致——两处必须同步，civics e2e 有断言钉；starPct 尤里卡 10% = 4 万可达）。
       *   ⚠️ 历史注：ERA7 开发期曾抬 1e9 防「星空探索>阈值」类尤里卡提前触发；
       *      现 starPct（异星建筑工程 进度>10%）就是设计内的触发点，占位口径作废，结局阈值待标定回填。 */
      starExplore: 400000,
      /* ERA7（2026-10-17 · spec §2 提议值）：铀 200（对齐 iron/silt 档）。
       *   ⚠️ 星屑 stardust 故意不给键 —— 跨周目局外资源，同 science/culture 口径（capOf 恒 Infinity）。 */
      uranium: 200 },

    // ---- 族民 ----
    // 对齐猫国开局（js/village.js:3 kittens:0 / jobs 全 0，叙事上是 1 只猫）：
    // 本作开局 1 名族民、职业全 0，唯一起步手段是手动采集（见 paneVillage 的采集按钮）。
    POP_START: 1,
    /* 每人每秒吃的藻食。这里是 **比例对齐** 而不是抄绝对值：
     * 只看 dimensionless 的关系——「一个采集者养几个人」= UNIT.kelp / FOOD_PER。
     * 猫国是 1.0 / 0.85 = 1.176 人（farmer vs catnipPerKitten）。
     * ⚠️ 2026-10-05 用户拍板 1.50 → **2.00**（对标猫国那轮）：本作用 2.50 / 2.00 = **1.25 人**，
     *   基础比值从「宽松 1.42×」收到「宽松 1.06×」，基本贴住猫国的 1.176。
     *   连带效应（有意为之）：藻场 0.45/2.00 = **0.225 人/田**（原 0.30），海藻仓那条线
     *   也跟着变紧 —— 上一轮对标已确认「藻场 宽松 2×、海藻仓 ratio 1.15 vs 猫国 1.75」，
     *   三者同向收紧，比例关系不变，不产生新的量纲断层。
     * ⚠️ 满乘叠乘后（种植 ×1.5 × 三把镰 ×3.6）仍是 2.50×1.5×3.6/2.00 = **6.75 人/农民**，
     *   那部分宽松来自**本作特有的 4 层乘区**（farm 科技 / 三把镰 / weir / globalMul），
     *   猫国 farmer 没有 per-job 工具乘区 ⇒ 属结构性差异，不是这个常数能补的（要动就是改乘区结构）。
     * 原先取 0.06 时一块藻场能养 9 人，食物从头到尾不是约束，开局循环等于不存在；
     * 直接照抄猫国 0.85 又会让口粮相对采集产出贵 14 倍，没人当得起采集者，整局卡死。 */
    FOOD_PER: 2.00,
    /* 信仰基础产出 = 人口 × 此值 / 秒（2026-09-28 用户规格 · 宗教系统落地）。
     * 与 FOOD_PER 同语义（都挂在「每人」上），但方向是产出不是消耗。
     * 用户原话「每个人口基础 0.02/s」。**这是宗教落地的标定起点，不是终值**——
     * 信仰全产加成是另一回事（见 economy.faithAllMul，按存量对数刻度给），这里只管基础进项。
     * ⚠️ 反自指纪律：economy.faithRate 不调 globalMul，故信仰自身产出**不吃**自己的全产加成，
     *    全产加成只作用于珊瑚/石头/金属/暖石/精铁/科技/市政/藻食/地热/奢侈品这些 tick 产出。 */
    FAITH_PER_POP: 0.02,
    /* 幸福度（陆地贸易，2026-09-28 落地）：民生轴，独立于信仰轴（信仰=增益条，幸福=维护条）。
     * 消耗面：每人每秒烧 happyCost(H) 奢侈品，H 越高越贵（恒温器收敛）。
     * 效果面：台阶式全产乘区 happyMul（排除 luxury 自身，防「幸福高→luxury多→幸福更高」自激）。
     * ⚠️ 2026-09-29 用户拍板「开始实装」：以下即为**定案值**，不再是草案
     *    （原「全部为标定草案，终值待用户拍板」作废；再调数值 = 新一轮标定，须用户重拍）。 */
    HAPPY_COST_BASE: 0.005,   // H≤0 时每人每秒保底消耗；锚点 ÷10 对齐 UNIT.luxury=0.05/商人/s
    HAPPY_COST_SLOPE: 0.010,  // H>0 后每人每秒增量：c(H)=0.005+0.010·H（3× 跨度，H=1→0.015）
    HAPPY_FLOOR: -2,          // 硬底（动荡档=[-2,-1)，否则该档永远落空）
    HAPPY_K: 0.02,            // 恒温器系数：dH/dt=K·(supply−demand)，收敛快慢标定用
    /* ── 水体污染挑战（2026-11-02 用户逐条给定数值，`docs/challenge-ocean-pollution-design.md` v11）──
     * ⚠️ 全部数值视为**用户权威值**：再调 = 新一轮标定，须用户重拍。
     * ⚠️ 只在 `s.challenge.id === 'waterpollution'` 的周目里生效；基游戏 pollution 恒 0。
     * 口径速查：
     *   · 存量 `s.pollution`，每 tick += (脏源排放 − 净化) × dt，夹 ≥0；
     *   · 脏源 = 汽轮机 / 高压热机管道 / 气态巨行星轨道工厂 / 核热厂 / 泰坦气云站（五源，k=1 等值）；
     *   · 洁净源（潮汐往复机 / 太阳能基站 / 恩拉多克斯风场 / 太阳帆）产热液但**不进**排放；
     *   · 阶段按**绝对阈值**判，只决定 debuff 强度，不参与评分（挑战是单档）。 */
    POLLUTION: {
      K: 1,                                   // 污染系数：1 热液能/s 脏产出 = 1 污染/s（用户定 1:1）
      /* 五阶段：`at` = 进入该阶段的最低存量。阶段 0 无任何效果。 */
      STAGES: [
        { name: '澄海', at: 0,       happy: 0,  kelpMul: 1.00, coralMul: 1.00, deathP: 0 },
        { name: '浊流', at: 1000,    happy: -1, kelpMul: 0.70, coralMul: 1.00, deathP: 0.0005 },
        { name: '赤潮', at: 40000,   happy: -2, kelpMul: 0.55, coralMul: 0.55, deathP: 0.0010 },
        { name: '死区', at: 160000,  happy: -4, kelpMul: 0.30, coralMul: 0.30, deathP: 0.0050 },
        { name: '腐渊', at: 6400000, happy: -8, kelpMul: 0.05, coralMul: 0.05, deathP: 0.0200 }
      ],
      /* 污染死亡 → 幸福消耗加成（C 定案）：死亡**永久累积**，但按**当前墓地配额**逐帧重算，
       *   配额内的死按 IN_CAP、超出的按 OVER_CAP —— 扩建墓地后超额部分自动降档。 */
      BURIAL: {
        PER_GRAVE: 4,        // 每座墓地 +4 限额
        PER_TEMPLE: 1,       // 政策卡《告解圣事》：每座神庙 +1 限额
        IN_CAP: 0.003,       // 限额内每个污染死亡 → 幸福消耗 +0.3%
        OVER_CAP: 0.03       // 限额外每个污染死亡 → 幸福消耗 +3%
      },
      /* 医院：污染死亡概率 −p_hosp(L)，`p_hosp = 1 − HOSP_BASE^(L/HOSP_MAX_LVL)`。
       * L=15 恰好 = 0.4（顶），全程递减无空转等级（用户拍「15 级到顶」，替代原 1-0.94^L）。 */
      HOSP_BASE: 0.6,
      HOSP_MAX_LVL: 15,
      HOSP_MAX_REDUCE: 0.4,
      /* 减死亡率（政策卡，二者互斥、只取更高的一张）：隔离病患 15% / 疾控防治 30%。 */
      CARD_QUARANTINE: 0.15,
      CARD_DISEASE: 0.30,
      /* 排放乘区（政策卡，二者互斥）：污染治理 −20% / 绿色运动 −40%。
       * 装罐填埋是**独立因子**，只乘汽轮机那一枝（不是全局 rateMul，见 §1.2）。 */
      RATE_MUL_CONTROL: 0.8,
      RATE_MUL_GREEN: 0.6,
      /* 装罐填埋（科技）：汽轮机排放 ×0.5，同时**额外**吃 5 金属/秒（暖石照旧，G 定案）。 */
      CANFILL_TURBINE_MUL: 0.5,
      CANFILL_METAL_PER_LVL: 5,
      /* 净化（每秒从存量里扣，不分源）：保护区 −8/座；保护星球卡 −0.1/鲛人；
       * 最终手段卡 −0.5/异星建筑等级；奇观「星球气候调节卫星网」−15（固定、无等级）。 */
      CLEAN_RESERVE: 8,
      CLEAN_PER_POP: 0.1,
      CLEAN_PER_ALIEN_LVL: 0.5,
      CLEAN_WONDER: 15
    },
    GROW_NEED: 40,                 // 连续盈余多少秒生一个（2026-09-30 用户拍：100 → 40，繁殖太慢）
    GROW_KEEP: 20,                // 藻食余量高于此才开始生育
    /* 人口超过上限后的离场速率（2026-10-31 用户拍：「上限立刻降，人口缓慢降低」）。
     * 口径 = **每秒离开「超额人数 × 本系数」人，至少 1 人**，按整数秒结算（累加器 s._overT）。
     * 为什么不是每 tick 扣：tick 的 dt 有 0.1 / 1 / 离线补算多种，按 tick 扣会让 0.1 步长变成 10 倍速。
     * 为什么留 5%：超额 40 人时 2 人/秒（约 20 秒走完），超额 2 人时 1 人/秒（2 秒），
     *   两端都是「看得见在掉但不瞬间蒸发」；比「一次钳到上限」多给玩家反应时间。 */
    POP_OVER_LEAVE: 0.05,
    /* ---- 住房（2026-09-26：软饱和 → 真硬上限）----
     * ⟨2026-09-25～09-26 曾改成软饱和（每超住 1 人，下一胎耗时 ×(1 + CROWD×超住数)）：
     *   当时的诉求是「满仓却不长人、原因读不出来」，于是把墙换成减速。
     *   实测那个减速没有意义 —— 一座住房都不建（上限 0）41 分钟也能养到 18 人，
     *   比建 1 座礁口巢只慢 7%；而屏幕上同时写着「族民 7（人口上限 2）」，
     *   玩家读到的只能是 bug（用户 2026-09-26 原话：「上限不是 2 吗，怎么会有七个人」）。⟩
     * 现在是硬上限：`pop >= popCap` 即停止生育（economy.isFull / tick 第 6 步），
     * 上限 100% 由住房给（礁口巢 +2、石屋 +4），科技只负责解锁下一档。
     * 于是「堆珊瑚巢就是养人口」从文案变成事实，轮回点门槛（TIDE.POP_GATE）
     * 也重新挂在住房线上。
     * ⚠️ 开局 0 住房 ⇒ 上限 0 ⇒ 那 1 名族民在盖起第一座礁口巢之前不会增加：
     *   这是硬上限的直接后果，不是 bug。珊瑚 5 由手动采集（+0.1/次）
     *   或「凿珊瑚 → 珊瑚匠」拿到。 */
    FREEZE_CHANCE: 0.003,         // 冰封期每秒冻伤概率基数
    /* 暖石正在烧时，冻伤概率被打到多少（结算里是 `1 - warmCap × 2`，所以 0.5 = 归零）。
     * ⚠️ 取值是「满减免」而不是「减一部分」：开关是玩家显式拨的，而暖石供给只有
     *   矿工伴生 0.05/s per 矿工、烧石费率又随破壳系数上涨（见 WARM_COEF_RATE），
     *   「开得起就等于真的安全」比「减 99% 还要继续掉人」读得懂；
     *   真正的约束是石量与费率，不是这条系数。 */
    WARM_FREEZE_CAP: 0.5,
    /* ---- 离线 / 后台补算（2026-09-25 实现）----
     * 主循环此前只按「回调次数 × 固定步长」推进，完全不看真实经过时间，
     * 于是关掉页面、刷新、切到后台标签页都会让时间蒸发。这里引入墙钟真值。
     * ⚠️ 这两个数是**保守占位值**，不是标定结果：离线收益到底该给多少属于经济时长债，
     * 与 BURN / 地热产能 / 时长窗那批一起最后统一算。改动前勿当成既定设计。 */
    OFFLINE_MIN: 60,              // 间隙小于 1 分钟不补算，免得刷新一下就补一大截
    /* 2026-10-24 分级离线（用户拍板 30min）：gap ≥ OFFLINE_MIN 一律补算（挂机收益一秒不丢），
     * 但只有 ≥ 本值才值得弹「离线闸门 + 结算报告」；更短的离开（回消息 / 切窗 / 锁屏一小会儿）
     * 走静默补算——不锁界面、不弹报告，日志留一行。
     * ⚠️ 这是 UX 门槛不是经济常数：不影响任何产出速率与 8-14h 时长窗核算，
     *    别和上面两个「保守占位值」混为一谈。 */
    OFFLINE_SETTLE_MIN: 1800,     // 离开 30 分钟以内算「短暂」，静默补算不弹离线结算
    OFFLINE_CAP: 8 * 3600,        // 单次补算上限 8 小时（超出部分按 0 计）
    OFFLINE_PERK_STEP: 0.25,      // 轮回商店「离潮计时」每级给单次离线上限 +25%（ perk.offline 由商店购买）
    OFFLINE_STEP: 2,              // 离线分段快进最大步长（逻辑秒）。单一来源：game.js / 离线调度器均只读此处，避免两套常量漂移

    // ---- 季节 ----
    /* 【2026-10-06 用户拍板：一季 = 10 分钟】SEASON_TICKS 由 6000 改为 **600 逻辑秒**。
     * ⚠️ **单位订正（此处注释原为全仓最误导的一段，已改）**：
     *   常量名叫 TICKS，但 `s.t += dt`（economy.js:1063）、dt = `STEP = 0.1` **逻辑秒**
     *   ⇒ `s.t` 的单位是**逻辑秒、不是 tick 数**。所有 `t / SEASON_TICKS` 的算式
     *   读的都是「逻辑秒」，故本值 = 每季的**逻辑秒数**（真叫 SEASON_SECS 更准，
     *   但改名要动 economy/game/e2e 多处，且本轮有并发写入风险，暂留旧名 + 本注释）。
     *   → 1 潮日 = SEASON_SECS / 100 = **6 逻辑秒**（面板换算 `left/60` 仍是
     *     「距下季剩多少潮日」那个口径，不受本值影响）。
     *   → 现实秒 = 逻辑秒 ÷ 倍速（`loop.acc += elapsed * speed`）：
     *     **1 季 @1× = 600 秒 = 10 分钟**；@20× = 30 秒。1 潮日 @1× = 6 秒。
     * ⚠️ 2026-09-27 删掉浊流季（用户拍板：它与平流季数值完全相同、且全仓无读者，
     *   是个空季）⇒ 四季变三季 ⇒ 寒流季占比从 1/4 升到 **1/3**（减产更频繁、
     *   暖石更吃紧）。这是删它的真正代价，不是「少了一个名字」。 */
    SEASON_TICKS: 600,            // 每季 = 10 分钟（逻辑秒；@20× = 30 秒）

    /* ---- 暖石开关（「保温法」那半未接线的部分，2026-09-26 补上）----
     * 玩家规格：「采矿同时伴生暖石，弄个开关，休眠期消耗暖石抵消产出降低效果」。
     * ⚠️【2026-11-05 用户拍板】烧石费率改成**随文明规模变化**，不再是固定每秒 1.0：
     *    r(s) = WARM_COEF_RATE × SB.shell.breakCoef(s)，唯一落点 = economy.warmRate(s)。
     *    ⚠️ 旧的 `WARM_RATE` 常数已删；任何读点都不许再拿常数当费率，否则又变成
     *       「面板用 A、门禁用 B」的面板撒谎家族。纯查询、无副作用，可在渲染路径调用。
     *    ⚠️ breakCoef 内含冰封期 × COEF.COLD(1.35) 与「总动员令」乘区，且不读 s.broken
     *       ⇒ 费率也会随冰封 / 闲置鲛人 / 破壳后继续增长。这是直接复用该系数的后果；
     *       若要把这两个「非规模」乘区剔出去，须另拍一个规模量，别在这里偷偷改。
     *    ⚠️ 对照 UNIT.warmstone 0.05/人/秒（暖季 4 矿工约 0.2/秒）：费率早期很低、
     *       随文明规模追上来，「雇几个矿工」重新决定这道开关能不能常开。
     *   WARM_RELIEF 开关顶回来多少「季节减产」。寒流季裸奔 0.4375（历法之后），
     *               顶住后回到 0.76，也就是把 −56% 削成 −24%——抵消**大部分**但不是全部：
     *               留一点残余，玩家才有理由继续攒暖石 / 继续研究海潮占卜。
     * ⚠️【2026-09-27 用户拍板：改回「只在寒流季烧」】历史三步：
     *    ① 原本就是季节闸（理由：暖石只顶回减产一个用途）；
     *    ② 2026-09-26 放开成一开就烧——当时冻伤看壳厚（轴 A）、减产看 t（轴 B），
     *       两条轴不重合，开关只烧一季的话冰封期那路一份暖石都吃不到；
     *    ③ 冰封期改成寒流季随机触发后**两条轴重合**，季节闸重新自洽 ⇒ 改回来。
     *    现在的行为：寒流季烧，一份暖石同时办两件事（顶回减产 + 冰封冻伤归零）；
     *    其余季不耗石，平流季囤的暖石不再凭空消失。
     *    ⚠️ 闸的判据是 `mult < 1`（economy.warmBurningNow），不写死季名/季数。 */
    WARM_COEF_RATE: 0.03,         // 每秒烧石 = 0.03 × 破壳系数（2026-11-05 用户拍板）
    WARM_RELIEF: 0.5,             // 开关顶回的季节 relief

    /* ---- 轮回点结算（周目层的唯一收益来源）----
     * 对齐猫国「重置收益 = 人口」——源码 game.js 里只有两行决定你能拿多少：
     *   if (kittens > 35) karmaKittens += ...; if (kittens > 70) paragonPoints = kittens - 70;
     * 所以猫国第一阶段的真正目标不是「打通什么」，而是「养出多少人」。
     * 本作原先按 shellScore（建筑存量占 99.9%）算，三档策略轮回点 15.40/14.82/15.73
     * 几乎无差别，玩家这一局打得好不好在重置时完全感觉不到。改成人口锚定：
     *   ① 门槛：峰值族民 ≤ POP_GATE 不发点（半吊子奖励等于没有奖励，玩家看不出门槛存在）
     *   ② 主指标：门槛以上按 POP_SLOPE 线性积累，斜率足够陡，让「多养 10 个人」
     *      明显优于「多盖 10 级建筑」
     *   ③ 副项：建筑存量只按 B_W 折算，防止「堆建筑」重新取代「养人口」
     */
    TIDE: {
      /* 峰值族民不高于此值，破冰不发轮回点。
       * ⚠️ 这个门槛是跟着人口天花板走的，不是随手定的常数：
       * 食物体系按猫国比例重做后（一块藻场养 0.30 人、一个采集者养 1.67 人），
       * ⟨2026-09-26：住房是**硬上限**（礁口巢 +2 / 石屋 +4，见 CFG 的住房注），
       *   所以 18 人 = 9 座礁口巢，或 5 座石屋（20 人，且要求先掌握石工）。
       *   门槛能不能达到 = 住房成本能不能被材料线撑住，标定那轮要正面核这件事。⟩
       * 门槛若沿用旧时代的 35，正常通关也发 0 点——整套周目收益在实机里不可达。
       * 取 18：留出 4 人余量（冻死一两个不跌破），实测通关约 4 点，
       * 刚好对应轮回商店首档（1~4 点），「一局打得好不好」玩家能直接感觉到。 */
      POP_GATE: 18,
      POP_SLOPE: 36,         // 门槛以上每 1 名族民 36 分（标定：54 人 ≈ 6.5 点 / 100 人 ≈ 11 点 / 200 人 ≈ 20 点）
      POP_ESC: { at: 150, k: 54 },  // 150 人以上斜率再抬到 54——猫国的「全力」段（一期到不了）
      LAYER: 200,            // 每破一层的固定分（旧口径，结算已不读）
      B_W: 0.02,             // 建筑存量的折算权重（旧口径，结算已不读）
      LINEAR_K: 0.04,        // 线性系数：轮回点 = 1 + floor(发展分 × K × 破壳系数)
      CRAFT_W: 4             // 每个已解锁工坊项目（配方/工具/升级）计入发展分的权重
    },

    /* 跨周目遗产（旧日艺术品 / 旧日潮纹碑石）的产出系数。
     *   产出 = RATE_PER_ITEM × H(n)，H = 调和级数，n = meta.oldArtworkEarnedTotal / oldTideStelesEarnedTotal。
     *   ⚠️ 这个数与 UNIT.sci / UNIT.culture 是**同一量纲**（都是「一人每秒」那一档，均为 0.15）
     *   ⇒ 系数 0.15 的语义恰好是「**1 件遗产 = 1 个学者（或 1 个书手）**」，
     *      1.5 即「1 件 = 10 个学者」。以后调这个数，先换算成「等效几个学者」再判断，
     *      否则很容易和 UNIT 那边各自漂移、失去可比性（2026-10-29 才发现两者同源却无人记录）。
     * ⚠️ 2026-10-29 用户拍板 0.15 → **1.5（×10）**，目的明说为「让第二周目开局更快」：
     *      POP_START=1 ⇒ 每次轮回人口归 1，遗产是**开局唯一存在的产出**。
     *      原值时带 5000 件进新周目只有 1.36/s（≈9 个幽灵学者），前期照旧要手动磨一遍；
     *      ×10 后 13.6/s，开局前几分钟被跳过 —— 这是想要的。
     * ⚠️ 遗产是**跨周目、无上限、不消耗**的绝对量：不吃灯塔/幸福/政体/奇观乘区，
     *      只吃挑战乘区。H(n) 增长极慢 ⇒ 后期依然偏钝（10 万件也只等于 121 个学者）。
     *      若哪天要解决「后期钝」，那是改曲线形状的事，**别在这里继续加系数**。
     * ⚠️ 标定状态：1.5 是用户拍板值，未做长局验证；旧值 0.15 曾是硬编码在 prestige.js 里的。 */
    LEGACY: {
      RATE_PER_ITEM: 1.5
    },

    SAVE_KEY: 'shellbreak.meta.v2',
    RUN_KEY: 'shellbreak.run.v2',
    SAVE_BACKUP_KEY: 'shellbreak.meta.backup.v1',
    RUN_BACKUP_KEY: 'shellbreak.run.backup.v1',
    /* 上次成功写盘的时刻（2026-10-28）。存档管理面板要摆「本地 5 分钟前保存 vs 云端 12 分钟前备份」
     * 让玩家自己选，而 saveHealth.lastOkAt 是内存值、重开游戏就归零 ⇒ 必须持久化一份。
     * 写入节流 30 秒（saveRun 每 5 秒一次，不能每次都多写一个 key）。 */
    SAVE_AT_KEY: 'shellbreak.save-at.v1',

    /* ── 运行时就绪门（2026-10-30）─────────────────────────────────────
     * 【为什么需要】`main.js` 在 DOMContentLoaded 里**同步**调 boot，而 TapTap 原生桥
     *   注入 `tap` 是异步的，冷启动（刚更新完）最慢。旧代码把「tap 还没注入」当成
     *   「这台机器没有存档能力」⇒ 走同步分支 ⇒ 本机读不到 ⇒ 直接 startRun 并立刻落盘
     *   ⇒ 5 秒后自动存档把新档写进 shellbreak-save-a/b，唯一的好档销毁。
     *   形状与《小区门卫模拟器》2026-10-24 的公告逐字一致。
     * 【三个数】
     *   WAIT_MS   持续轮询能力位的上限。到点仍不就绪 ⇒ **暂停**（保护性），绝不开新档。
     *   POLL_MS   轮询间隔。100ms 对启动延迟无感，又够快接住注入。
     *   SKIP_MS   「跳过等待」按钮出现时刻。留 3 秒是为了让玩家先看到「正在连接」，
     *             否则手快的会直接点掉，等于回到修之前。
     *   LATE_MS   晚到补偿的观察窗口：开新档后这段时间内 tap 才注入，就重扫本机原生槽。
     * ⚠️ 这四个都是**超时/节奏**，不是游戏数值，不参与标定；但也别随手调大 ——
     *   WAIT_MS 每加 1 秒，真·新玩家的首屏就多等 1 秒。 */
    BOOT_GATE: {
      WAIT_MS: 8000,
      POLL_MS: 100,
      SKIP_MS: 3000,
      LATE_MS: 180000
    },
  };


  /* ⚠️ 旧的 8 项平铺科技已删除（2026-09-25 五纪元改造）。原表在 src/techs.js 里
   * 被替换成挂到现有经济上的 28 项五纪元树，SB.TECHS 由 techs.js 提供。
   * 旧 id 到新 id 的映射在 techs.js 的 LEGACY_MAP，存档迁移会走它。
   * 这里若同时留着旧数组，SB.TECHS 就成了两套树，按 id 查找会拿到错的那一棵。 */

  /* ── 工坊自动制作槽（2026-10-07 用户拍板 · 2026-11-04 改「不设上限」）──────
   * 【来源】① 工坊升级项「自动工坊」`upg_autoshop` **自带 1 个槽**（装了就有）；
   *   ② 轮回商店 `autoCraft1/2/3` 每级 +1；③ ERA6 科技 `hotforge_hammer` +1；
   *   ④ ERA7 科技 `complexf` +1；⑤ ERA7 升级项 `upg_complexf` +1。
   *   ⇒ 槽数 = 各来源之和，**不设硬上限**（2026-11-04 用户拍板）。
   *   实际上限由工坊配方总数天然约束：一个配方最多占一槽（setSlot 拒绝重复 id），
   *   装不出比配方还多的槽，所以不需要在配置里再写一道夹子。
   *   ⚠️ 旧版有 `AUTO.SLOT_MAX = 4` 的夹死：晚期玩家靠 ①③④⑤ 就吃满 4 槽，再买
   *      autoCraft2/3 共 35 轮回点换来 0 个槽（玩家报「买的自动槽不起效」）。该常数已删除，
   *      **别在实现里补回 Math.min 夹子**，也别把「之位」三件数进来。
   *   ⚠️ 2026-11-01：轮回商店的 `slotCraft/slotEcon/slotSci`（「之位」三件）**不是**这里的来源，
   *      它们给的是**政策卡槽**（`civic.slotList`），历史上错接到本表口径上，已摘除。
   * 【阈值语义】每个槽 = 「配方 + 自动方式」：
   *   ① 全部原料有上限：任一原料满仓后，转制可造量的 25/50/75/100%（AUTO.PCTS）；
   *   ② 含任一无上限原料：沿用批次档，库存够造指定数量时制造，额外材料保留。
   *      默认批次数会按有限原料仓库容量夹小，防止混合配方永远等不到。 */
  CFG.AUTO = {
    SLOT_BASE: 1,                       // 自动工坊升级自带的槽数
    PCTS: [0.25, 0.5, 0.75, 1],         // 有上限原料：玩家可选的「满仓后转制多少」档位
    BATCH_DEFAULT: 80,                   // 默认批次上限；含有限原料的配方会再按仓库容量夹小
    BATCH_MAX: 9007199254740991          // 只接受安全整数，避免超出 JS 精确整数范围
  };

  /* ── 兑换码（2026-11-07 起：仅本地礼包码）──────────────────────────────
   * 平台 TDS 通兑码通道已整体下线，当前唯一通道 = `LOCAL_GRANTS`：
   *   命中即本地入账，全程在本机完成、不访问任何外部接口。
   *   ⚠️ 代价：后台已上架的活动「深海补偿1030」（通兑码 / 总 500）作废。
   *
   * ⚠️ CLIENT_ID / ACTIVITY_ID **刻意留空且不许填回**：填回也不会生效
   *   （`src/redeem.js` 的 `platformReady()` 恒 false），留着只是让回归能钉住
   *   「平台通道没有偷偷复活」。要恢复平台通道必须同时改四处，清单见 redeem.js 文件头。
   *
   *   入账必须同时写 tide 与 tideEarnedTotal，否则定损方程失衡会把补偿误判成新缺口。 */
  CFG.REDEEM = {
    CLIENT_ID: '',
    ACTIVITY_ID: '',
    /* 历史补偿档位（TDS 时代每次 120 轮回点）。本地 tide 码不读它、直接读条目的 tide 字段；
     * `SB.redeem.reward()` 仍导出供回归断言用，别删。 */
    REWARD_NUM: 120,

    /* ── 本地礼包码（2026-11-04）：不经过 TapTap 平台，命中即本地入账 ──────────
     * 为什么需要：平台路径要求先在开发者后台建活动、再把活动 ID 填进 ACTIVITY_ID，
     *   临时给单个玩家补一笔奖励时走不通（后台建活动 + 配置 + 库存都要时间）。
     *   这里给一条「改配置就能发」的直通车。
     *
     * 每项字段：
     *   code      明文码（大小写不敏感、忽略空格/连字符，同平台码的归一化规则）
     *   h         或改成 sha1('sb:' + 大写码) —— 只存哈希，**包里看不到明文码**
     *   tide      发放轮回点（走 credit()，会同时写 tideEarnedTotal，别绕开）
     *   stardust  发放星屑（只加余额，不加 stardustEarned，理由见 redeem.js 的 creditStar）
     *   label     成功提示里的名字
     *
     * ⚠️ 明文码 = 全服可领：包是明文 JS，任何人解包就能读到 code。
     *   只有「发给所有人也无所谓」的福利才用明文；只给某一个人的码必须用 h。
     *   生成哈希：`node tmp/_mkcode.mjs <你的码>`
   * ⚠️ 本地码与平台码共用 meta.redeemed 防重表 ⇒ 同一个码每档存档只能领一次，
   *   离线也能领（纯本地入账）。 */
    LOCAL_GRANTS: [
      /* 2026-11-04「星屑礼包」= 星屑 ×50。这里存的是**哈希**，明文码不在包里：
       * 包是明文 JS，写 code 就等于把码印发给所有会解包的人。
       * 明文码由开发者自行保管；要换码就跑 `node tmp/_mkcode.mjs <新码>` 换掉这个 h。
       * 明文写法（仅供本地调试，**发版前必须换回 h**）：
       *   { code: 'YOUR-CODE-HERE', stardust: 50, label: '星屑礼包' } */
      { h: 'fe97c807f70f509ea85b8f3b3a340535951baede', stardust: 50, label: '星屑礼包' },
      /* 2026-11-12 追加三条 100 星屑乱码码（仅开发者私下持有明文，包内只存哈希）。
       * 明文码：XQ7K-2MP9-D4RT-V8LZ / B6NH-3WC8-Y1F5-S2KE / V9ZR-4TD7-L6QM-5XPB
       * 换码就跑 `node tmp/_mkcode.mjs <新码>` 把对应 h 换掉即可。 */
      { h: '5e26a421982e561596e1eddd85c0aa5b41af6920', stardust: 100, label: '星屑礼包' },
      { h: '3dbd9f2adb8016eeaabaaeca34a51da00e4f8dab', stardust: 100, label: '星屑礼包' },
      { h: 'f6ff4232fc87ea28e07da661c6ded4878f2a08f4', stardust: 100, label: '星屑礼包' }
    ]

    /* ⚠️ 这里**故意不设 CHARACTER_ID**：TDS 的 character_id 是「游戏用户 ID」，平台按
     *   (活动, character_id) 记每人兑换次数（错误码 100017 就是「同一用户超次数」）。
     *   写死一个常量 ⇒ 全服被视为同一个人 ⇒ 通兑码只有第一个玩家能领，其余人报 100017。
     *   正确的值由 redeem.js 在**每个存档**里生成一次并持久化（meta.installId）。
     *   别为了「省事」把它加回来。 */
  };

  // 必须复用同一 SB 命名空间：其余模块在加载期就读取 SB.CFG 等，另起一个对象会拿到 undefined
  var NS = (root.SB = root.SB || {});
  NS.CFG = CFG;
  /* NS.TECHS / NS.ERAS 不再在这里赋值——它们由 src/techs.js 提供（加载顺序在 config 之后）。 */


  /* ⚠️ 工艺升级表的导出顺序有讲究：workshop.js 读 SB.UPGRADES，而它是在
   *    config.js **之后**才执行的（script 加载顺序），所以这里提前挂好即可。 */
})(typeof window !== 'undefined' ? window : globalThis);
