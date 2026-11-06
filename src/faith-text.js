/* Registered faith copy. Steam/Electron may use en-US only with an explicit locale preference; other runtimes stay zh-CN. */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var COPY = {
    "faith.tenet.fertile_rite.name": { "zh-CN": "丰产仪式", "en-US": "Fertile Rite" },
    "faith.tenet.fertile_rite.effect": { "zh-CN": "采集者职业产出提高 {percent}%。", "en-US": "Gatherer output increases by {percent}%." },
    "faith.tenet.coral_labor.name": { "zh-CN": "珊瑚圣工", "en-US": "Coral Labor" },
    "faith.tenet.coral_labor.effect": { "zh-CN": "珊瑚工职业产出提高 {percent}%。", "en-US": "Coralworker output increases by {percent}%." },
    "faith.tenet.stone_circle_rite.name": { "zh-CN": "石圈祭礼", "en-US": "Stone Circle Rite" },
    "faith.tenet.stone_circle_rite.effect": { "zh-CN": "采石工职业产出提高 {percent}%。", "en-US": "Quarryworker output increases by {percent}%." },
    "faith.tenet.vein_covenant.name": { "zh-CN": "矿脉圣约", "en-US": "Vein Covenant" },
    "faith.tenet.vein_covenant.effect": { "zh-CN": "矿工职业产出提高 {percent}%。", "en-US": "Miner output increases by {percent}%." },
    "faith.tenet.divine_doctrine.name": { "zh-CN": "神启学说", "en-US": "Divine Doctrine" },
    "faith.tenet.divine_doctrine.effect": { "zh-CN": "学者职业产出提高 {percent}%。", "en-US": "Scholar output increases by {percent}%." },
    "faith.tenet.scripture_copying.name": { "zh-CN": "圣典传抄", "en-US": "Scripture Copying" },
    "faith.tenet.scripture_copying.effect": { "zh-CN": "书手职业产出提高 {percent}%。", "en-US": "Scribe output increases by {percent}%." },
    "faith.tenet.tithe_offering.name": { "zh-CN": "什一奉献", "en-US": "Tithe Offering" },
    "faith.tenet.tithe_offering.effect": { "zh-CN": "商人职业产出提高 {percent}%。", "en-US": "Merchant output increases by {percent}%." },
    "faith.tenet.workshop_ethic.name": { "zh-CN": "职业道德", "en-US": "Ethic of Labor" },
    "faith.tenet.workshop_ethic.effect": { "zh-CN": "每级神庙使工坊效率提高 {percent}%。", "en-US": "Each Temple level increases Workshop efficiency by {percent}%." },
    "faith.tenet.nourish_world.name": { "zh-CN": "哺育世界", "en-US": "Nourish the World" },
    "faith.tenet.nourish_world.effect": { "zh-CN": "人口上限提高 {amount}。", "en-US": "Population cap increases by {amount}." },
    "faith.tenet.sanctuary_protection.name": { "zh-CN": "圣所庇护", "en-US": "Sanctuary Protection" },
    "faith.tenet.sanctuary_protection.effect": { "zh-CN": "信仰产出提高 {percent}%。", "en-US": "Faith output increases by {percent}%." },
    "faith.tenet.scripture_legacy.name": { "zh-CN": "圣典传承", "en-US": "Scripture Legacy" },
    "faith.tenet.scripture_legacy.effect": { "zh-CN": "每完成一项市政，获得相当于当前 {minutes} 分钟信仰产出的信仰。", "en-US": "Completing a Civic grants Faith equal to {minutes} minutes of current Faith output." },
    "faith.tenet.school_of_revelation.name": { "zh-CN": "神启学派", "en-US": "School of Revelation" },
    "faith.tenet.school_of_revelation.effect": { "zh-CN": "每完成一项科技，获得相当于当前 {minutes} 分钟信仰产出的信仰。", "en-US": "Completing a technology grants Faith equal to {minutes} minutes of current Faith output." },
    "faith.tenet.winter_watch.name": { "zh-CN": "寒流守望", "en-US": "Winter Watch" },
    "faith.tenet.winter_watch.effect": { "zh-CN": "寒流季中，研究保温法后暖石消耗降低 {percent}%。", "en-US": "During the cold season, Warmstone consumption decreases by {percent}% after researching Insulation." },
    "faith.tenet.church_alms.name": { "zh-CN": "教会赈济", "en-US": "Church Alms" },
    "faith.tenet.church_alms.effect": { "zh-CN": "每名族民的奢侈品消耗降低 {percent}%。", "en-US": "Luxury consumption per person decreases by {percent}%." },
    "faith.tenet.ancient_covenant.name": { "zh-CN": "旧日圣约", "en-US": "Covenant of the Ancients" },
    "faith.tenet.ancient_covenant.effect": { "zh-CN": "轮回时，旧日信仰额外获得本周目累计产出信仰的 {percent}%。", "en-US": "At Prestige, Old Faith gains an additional {percent}% of Faith earned this run." },
    "faith.tenet.shellbreaking_covenant.name": { "zh-CN": "破壳圣约", "en-US": "Shellbreaking Covenant" },
    "faith.tenet.shellbreaking_covenant.effect": { "zh-CN": "天穹钻机的破壳速度提高 {percent}%。", "en-US": "The Sky Drill breaks the Shell {percent}% faster." },
    "faith.tenet.furnace_hymn.name": { "zh-CN": "炉火礼赞", "en-US": "Hymn to the Furnace" },
    "faith.tenet.furnace_hymn.effect": { "zh-CN": "热泉炉的精铁产出提高 {percent}%。", "en-US": "Hydrothermal Furnace Iron output increases by {percent}%." },
    "faith.tenet.furnace_tithe_rule.name": { "zh-CN": "炉料清规", "en-US": "Furnace Tithe Rule" },
    "faith.tenet.furnace_tithe_rule.effect": { "zh-CN": "热泉炉的金属消耗降低 {percent}%。", "en-US": "Hydrothermal Furnace Metal consumption decreases by {percent}%." },
    "faith.tenet.iron_altar.name": { "zh-CN": "钢铁圣坛", "en-US": "Iron Altar" },
    "faith.tenet.iron_altar.effect": { "zh-CN": "热液工坊的钢产出提高 {percent}%。", "en-US": "Hydrothermal Workshop Steel output increases by {percent}%." },
    "faith.tenet.star_forge_offering.name": { "zh-CN": "星炉献礼", "en-US": "Offering to the Star Forge" },
    "faith.tenet.star_forge_offering.effect": { "zh-CN": "θ金属产出提高 {percent}%。", "en-US": "Theta-metal output increases by {percent}%." },
    "faith.tenet.turbine_psalm.name": { "zh-CN": "涡轮圣咏", "en-US": "Turbine Psalm" },
    "faith.tenet.turbine_psalm.effect": { "zh-CN": "热液汽轮机的热液能产出提高 {percent}%。", "en-US": "Hydrothermal Turbine output increases by {percent}%." },
    "faith.tenet.artisan_guild.name": { "zh-CN": "工匠修会", "en-US": "Guild of Artisans" },
    "faith.tenet.artisan_guild.effect": { "zh-CN": "自动制作槽位提高 {amount}。", "en-US": "Gain {amount} automatic crafting slot." },
    "faith.tenet.material_exemption.name": { "zh-CN": "祭材豁免", "en-US": "Exemption of Sacred Materials" },
    "faith.tenet.material_exemption.effect": { "zh-CN": "建筑材料消耗降低 {percent}%。", "en-US": "Building material costs decrease by {percent}%." },
    "faith.tenet.scholasticism.name": { "zh-CN": "经院哲学", "en-US": "Scholasticism" },
    "faith.tenet.scholasticism.effect": { "zh-CN": "科技研究消耗降低 {percent}%。", "en-US": "Technology research costs decrease by {percent}%." },
    "faith.tenet.church_codex.name": { "zh-CN": "教会法典", "en-US": "Church Codex" },
    "faith.tenet.church_codex.effect": { "zh-CN": "市政研究消耗降低 {percent}%。", "en-US": "Civic research costs decrease by {percent}%." },
    "faith.tenet.sacred_monument.name": { "zh-CN": "圣迹营造", "en-US": "Sacred Monument" },
    "faith.tenet.sacred_monument.effect": { "zh-CN": "奇观建造资源消耗降低 {percent}%。", "en-US": "Wonder resource costs decrease by {percent}%." },
    "faith.tenet.faith_guard.name": { "zh-CN": "信仰守护", "en-US": "Faith Guard" },
    "faith.tenet.faith_guard.effect": { "zh-CN": "军人职业产出的军力提高 {percent}%。", "en-US": "Military output from the Soldier profession increases by {percent}%." },
    "faith.tenet.holy_see_edict.name": { "zh-CN": "圣座敕令", "en-US": "Edict of the Holy See" },
    "faith.tenet.holy_see_edict.effect": { "zh-CN": "传播信仰以削减敌国规模上限时，信仰消耗降低 {percent}%。", "en-US": "Faith spent to reduce an enemy's scale cap decreases by {percent}%." },
    "faith.tenet.expedition_blessing.name": { "zh-CN": "远征祝祷", "en-US": "Expedition Blessing" },
    "faith.tenet.expedition_blessing.effect": { "zh-CN": "劫掠、入侵与全面战争的军力消耗降低 {percent}%。", "en-US": "Military costs for raids, invasions, and total war decrease by {percent}%." },
    "faith.tenet.martyr_oath.name": { "zh-CN": "殉道者誓言", "en-US": "Martyr's Oath" },
    "faith.tenet.martyr_oath.effect": { "zh-CN": "战争行动失败时，返还已消耗军力的 {percent}%。", "en-US": "On a failed military action, refund {percent}% of the Military actually spent." },
    "faith.tenet.triumph_hymn.name": { "zh-CN": "凯旋赞歌", "en-US": "Hymn of Triumph" },
    "faith.tenet.triumph_hymn.effect": { "zh-CN": "战争行动成功时，额外削减敌国当前规模的 {percent}%。", "en-US": "On a successful military action, reduce the enemy's current scale by an additional {percent}%." },
    "faith.tenets.section_title": { "zh-CN": "信仰信条", "en-US": "Faith Tenets" },
    "faith.tenets.cumulative": { "zh-CN": "本周目累计信仰：{amount}", "en-US": "Faith earned this run: {amount}" },
    "faith.tenets.next_threshold": { "zh-CN": "下一道信仰门槛：{threshold}", "en-US": "Next Faith threshold: {threshold}" },
    "faith.tenets.thresholds_complete": { "zh-CN": "本周目的信仰门槛均已达成。", "en-US": "All Faith thresholds for this run have been reached." },
    "faith.tenets.intro": { "zh-CN": "信仰越过门槛时，教会将呈上教义，择一奉行。", "en-US": "When Faith crosses a threshold, the Church presents tenets for you to choose from." },
    "faith.tenets.pending_title": { "zh-CN": "待你抉择：信仰门槛 {threshold}", "en-US": "Awaiting your choice: Faith threshold {threshold}" },
    "faith.tenets.choose_hint": { "zh-CN": "从 {count} 条教义中择一奉行。", "en-US": "Choose one of the {count} tenets to follow." },
    "faith.tenets.choose_button": { "zh-CN": "奉为正典", "en-US": "Adopt Tenet" },
    "faith.tenets.chosen_title": { "zh-CN": "已确立的信条", "en-US": "Established Tenets" },
    "faith.tenets.empty_chosen": { "zh-CN": "尚未确立信条。", "en-US": "No tenets have been established yet." },
    "faith.tenets.threshold_tag": { "zh-CN": "门槛 {threshold}", "en-US": "Threshold {threshold}" },
  };
  function locale() {
    var platform = null;
    try { platform = root.shellbreakPlatform; } catch (e) {}
    if (!platform || platform.runtime !== "electron" || platform.localizationEnabled !== true) return "zh-CN";
    var requested = root.shellbreakLocale;
    if (!requested) { try { requested = root.localStorage && root.localStorage.getItem("shellbreak.locale"); } catch (e) {} }
    return requested === "en-US" ? "en-US" : "zh-CN";
  }
  function t(key, vars) {
    var item = COPY[key];
    if (!item) return "";
    var value = item[locale()] || item["zh-CN"] || "";
    return value.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, function (whole, name) {
      return vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : "";
    });
  }
  SB.i18n = SB.i18n || {};
  SB.i18n.t = t;
  SB.i18n.locale = locale;
})(typeof window !== "undefined" ? window : globalThis);
