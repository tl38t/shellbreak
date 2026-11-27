/* e2e suite: 升维终局演出 + 轮回商店节点详情气泡（2026-11-25）
 *
 * ⚠️ 为什么单独立这个 suite：Ver1.4.0/1.4.1 两次发版都漏了这里——
 *    ① 升维结局 16 条文案只补中文，英文/繁中玩家看到 key 名；
 *    ② 星屑商店改「点节点看详情」时轮回商店没跟上，满级/锁前置节点被 disabled。
 *    两条都不是数值问题，是「文案/接线没同步」的硬伤，只有行为断言能拦住。
 *
 * 本 suite 只读：不真触发演出、不改 meta.ascendDone；用 DOM 桩让它可重复跑。 */

export function run({ SB, check, fs, path, ROOT, sandbox }) {
  console.log('\n=== 升维终局演出 + 轮回商店详情气泡 ===');

  /* ---------- ① 11 幕文案 key 三语齐全（防「只补中文」复发） ---------- */
  const SCENE_KEYS = [
    'ui.finale.ascension.scene.play_time',
    'ui.finale.ascension.scene.incremental_game',
    'ui.finale.ascension.scene.restless',
    'ui.finale.ascension.scene.first_bubble',
    'ui.finale.ascension.scene.flash',
    'ui.finale.ascension.scene.new_star',
    'ui.finale.ascension.scene.back_to_bed',
    'ui.finale.ascension.scene.star_of_bethlehem',
    'ui.finale.ascension.scene.heat_death',
    'ui.finale.ascension.scene.last_words',
    'ui.finale.cosmic_congratulations'
  ];
  const ACTION_KEYS = [
    'ui.finale.ascension.action.next',
    'ui.finale.ascension.action.skip',
    'ui.finale.ascension.action.finish',
    'ui.finale.ascension.aria_label'
  ];
  const LOCALES = [
    ['zh-CN', 'src/locales/zh-CN.js'],
    ['en-US', 'electron/locales/en-US.js'],
    ['zh-TW', 'electron/locales/zh-TW.js']
  ];
  const dicts = {};
  for (const [code, rel] of LOCALES) {
    const p = path.join(ROOT, rel);
    let text = '';
    try { text = fs.readFileSync(p, 'utf8'); } catch (e) { text = ''; }
    dicts[code] = text;
    check('升维文案词库可读：' + rel, text.length > 1000, '字节=' + text.length);
  }
  for (const key of SCENE_KEYS.concat(ACTION_KEYS)) {
    for (const [code] of LOCALES) {
      const quoted = '"' + key + '":';
      const ok = dicts[code].indexOf(quoted) >= 0 &&
        !/^\s*"+.*:\s*""\s*,?\s*$/m.test(
          dicts[code].slice(dicts[code].indexOf(quoted), dicts[code].indexOf(quoted) + 200).split('\n')[0]
        );
      check('升维文案 ' + code + ' 有非空译文：' + key.slice(key.lastIndexOf('.') + 1),
        ok, code + ' / ' + key);
    }
  }

  /* ---------- ② 动画引擎导出 + 背景素材到位 ---------- */
  check('星空动画引擎已挂载 SB.ui.cosmicFinale.mount',
    !!(SB.ui && SB.ui.cosmicFinale && typeof SB.ui.cosmicFinale.mount === 'function'),
    'SB.ui.cosmicFinale=' + (SB.ui && SB.ui.cosmicFinale ? Object.keys(SB.ui.cosmicFinale).join(',') : '缺失'));
  const bg = path.join(ROOT, 'assets/backgrounds/finale/cosmic-ending-background.png');
  let bgOk = false;
  try { bgOk = fs.existsSync(bg) && fs.statSync(bg).size > 10000; } catch (e) { bgOk = false; }
  check('最后一幕背景图存在且非空', bgOk, bg);
  const cosmicJs = path.join(ROOT, 'src/ui/cosmic-finale.js');
  let jsOk = false;
  try { jsOk = fs.readFileSync(cosmicJs, 'utf8').indexOf('window.ShellbreakUI') >= 0 ||
    fs.readFileSync(cosmicJs, 'utf8').indexOf('SB.ui.cosmicFinale') >= 0; } catch (e) { jsOk = false; }
  check('星空动画脚本真实导出（非死文件）', jsOk, cosmicJs);

  /* ---------- ③ 演出入口与触发链接线 ---------- */
  check('render 导出 showAscensionEnding',
    !!(SB.ui && SB.ui.render && typeof SB.ui.render.showAscensionEnding === 'function'), '');
  check('game 导出 completeAscensionEnding（幂等记账）',
    !!(SB.game && typeof SB.game.completeAscensionEnding === 'function'), '');
  const meta0 = SB.game && SB.game.meta ? SB.game.meta() : null;
  check('升维结局记账字段 meta.ascendDone 已在 freshRun/meta 默认值中',
    !!(meta0 && typeof meta0.ascendDone === 'boolean'),
    'ascendDone=' + (meta0 ? meta0.ascendDone : '无 meta'));

  /* ---------- ④ 轮回商店节点详情气泡双入口接线 ---------- */
  check('render 导出 metaPerkInfo（轮回商店详情数据真源）',
    !!(SB.ui && SB.ui.renderParts && typeof SB.ui.renderParts.metaPerkInfo === 'function'),
    Object.keys((SB.ui && SB.ui.renderParts) || {}).filter(k => /perk/i.test(k)).join(','));
  check('render 导出 showTidePerkInfo（轮回商店详情弹窗）',
    !!(SB.ui && SB.ui.render && typeof SB.ui.render.showTidePerkInfo === 'function'), '');

  /* ---------- ⑤ 更新日志两条 key 三语齐全 ---------- */
  for (const key of ['changelog.finale.ascension_open', 'changelog.fix.tide_perk_detail']) {
    for (const [code] of LOCALES) {
      check('更新日志 ' + code + ' 含 ' + key.slice(key.lastIndexOf('.') + 1),
        dicts[code].indexOf('"' + key + '":') >= 0, code);
    }
  }

  /* ---------- ⑥ 详情弹窗开关两态（2026-11-25，一个开关管两个商店） ---------- */
  const KEY = SB.uiPrefs && SB.uiPrefs.PERK_POPUP_KEY;
  check('SB.uiPrefs 导出 perkDetailPopupsEnabled 与 storage key',
    !!(KEY && typeof SB.uiPrefs.perkDetailPopupsEnabled === 'function'), 'key=' + KEY);
  const st = sandbox && sandbox.localStorage;
  if (st && KEY) {
    const had = st.getItem(KEY);
    try {
      st.setItem(KEY, '0');
      check('开关写 0 ⇒ 关闭（两个商店回到一击购买）',
        SB.uiPrefs.perkDetailPopupsEnabled() === false, '');
      st.setItem(KEY, '1');
      check('开关写 1 ⇒ 打开（点节点看详情）',
        SB.uiPrefs.perkDetailPopupsEnabled() === true, '');
      st.removeItem(KEY);
      check('开关未设置 ⇒ 默认开（老玩家升级后行为不变）',
        SB.uiPrefs.perkDetailPopupsEnabled() === true, '');
    } finally {
      if (had === null) st.removeItem(KEY); else st.setItem(KEY, had);
    }
  } else {
    check('测试环境提供 localStorage 桩以验证开关两态', false, '无 sandbox.localStorage');
  }
  check('设置面板有天赋节点详情弹窗开关行',
    fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').indexOf('id="perkDetailPopupsToggle"') >= 0, '');
  for (const [code] of LOCALES) {
    check('设置开关文案 ' + code + ' 齐全',
      dicts[code].indexOf('"ui.settings.perk_detail_popups.label":') >= 0 &&
      dicts[code].indexOf('"ui.settings.perk_detail_popups.hint":') >= 0, code);
  }

  /* ---------- ⑦ 基因飞升数值下调回归锁（2026-11-25 用户拍板） ----------
   * 口径：基础表砍半，共鸣规则不变（半和谐 +50% / 满和谐 +100%）。
   *   ⇒ 满和谐时实际收益 = 改前卡牌标值；零共鸣 = 改前标值的一半。
   * 夹具严格按生产写入路径造：v.paths.gene[branch][node.id] = 0..3，
   * 节点成本 [1,3,5] ⇒ LV3 = 9 点（见 veil-effects.js GENE_LEVEL_COSTS）。
   * ⚠️ meta.veil 是跨周目账本，测完必须原样放回，避免污染后续 suite。 */
  const fx = SB.veilFx;
  check('SB.veilFx 已挂载基因飞升只读访问器',
    !!(fx && typeof fx.geneScholarMul === 'function' && typeof fx.geneFastmatMul === 'function' &&
      typeof fx.geneForgeCraft === 'function' && typeof fx.geneAmp === 'function' &&
      typeof fx.geneResonanceBonusPct === 'function'), '');
  const meta = SB.game && SB.game.meta ? SB.game.meta() : null;
  if (meta && fx && typeof fx.geneScholarMul === 'function') {
    const savedVeil = meta.veil;
    const pct = (n) => Math.round(n * 1e9) / 1e9;
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    /* supreme 两节点 LV3 = 9+9 = 18 点；pure 同理。 */
    const veilOf = (supreme, pure) => ({
      points: 0,
      paths: {
        opened: ['gn', 'si'],
        gene: {
          supreme: { lore: supreme, valor: supreme },
          pure: { fastmat: pure, forge: pure }
        }
      }
    });
    try {
      /* 满和谐：18 vs 18 ⇒ +100% ⇒ 基础表 ×2，回到改前标值。 */
      meta.veil = veilOf(3, 3);
      const hBonus = fx.geneResonanceBonusPct();
      check('满和谐共鸣仍为 +100%（共鸣规则没被改动）', hBonus === 100, 'bonus=' + hBonus);
      const hScholar = pct((fx.geneScholarMul() - 1) * 100);
      const hFast = pct((fx.geneFastmatMul() - 1) * 100);
      const hForge = pct(fx.geneForgeCraft('craft_iron') * 100);
      const hAmp = pct((fx.geneAmp('scale') - 1) * 100);
      check('满和谐·学者 = 改前标值 60%（不是 120%）', near(hScholar, 60), '实测 ' + hScholar + '%');
      check('满和谐·速成 = 改前标值 240%（不是 480%）', near(hFast, 240), '实测 ' + hFast + '%');
      check('满和谐·锻造 = 改前标值 240%（不是 480%）', near(hForge, 240), '实测 ' + hForge + '%');
      check('满和谐·基因→义体联动 = 改前标值 +20%（不是 +40%）', near(hAmp, 20), '实测 +' + hAmp + '%');

      /* 零共鸣 A：清 pure 但保留 supreme 节点等级 ⇒ 同节点收益恰好减半。 */
      meta.veil = veilOf(3, 0);
      const zBonus = fx.geneResonanceBonusPct();
      check('零共鸣共鸣为 +0%', zBonus === 0, 'bonus=' + zBonus);
      const zScholar = pct((fx.geneScholarMul() - 1) * 100);
      const zAmp = pct((fx.geneAmp('scale') - 1) * 100);
      check('零共鸣·学者 = 改前标值的一半 30%', near(zScholar, 30), '实测 ' + zScholar + '%');
      check('零共鸣·基因→义体联动 = 改前标值的一半 +10%', near(zAmp, 10), '实测 +' + zAmp + '%');

      /* 零共鸣 B：清 supreme 但保留 pure 节点等级，否则节点本身被清零会假绿。 */
      meta.veil = veilOf(0, 3);
      const zFast = pct((fx.geneFastmatMul() - 1) * 100);
      const zForge = pct(fx.geneForgeCraft('craft_iron') * 100);
      check('零共鸣·速成 = 改前标值的一半 120%', near(zFast, 120), '实测 ' + zFast + '%');
      check('零共鸣·锻造 = 改前标值的一半 120%', near(zForge, 120), '实测 ' + zForge + '%');

      /* 半和谐：high=18 / low=10（9+1）> 0.5 ⇒ +50%，确认三档规则整体未动。 */
      meta.veil = {
        points: 0,
        paths: { opened: ['gn'], gene: {
          supreme: { lore: 3, valor: 3 }, pure: { fastmat: 3, forge: 1 }
        } }
      };
      const mBonus = fx.geneResonanceBonusPct();
      check('半和谐共鸣仍为 +50%（三档规则未改）', mBonus === 50, 'bonus=' + mBonus);
    } finally {
      meta.veil = savedVeil;
    }
  } else {
    check('测试环境能取到 meta 与 veilFx 以验证基因数值', false,
      'meta=' + !!meta + ' veilFx=' + !!fx);
  }

  /* 展示表必须与生效表同步砍半，否则面板标的数字和真收益脱节。 */
  const uiSrc = fs.readFileSync(path.join(ROOT, 'src/ui/veil-hub-ui.js'), 'utf8');
  const geneUiAt = uiSrc.indexOf('var GENE_BRANCHES');
  const geneBlock = geneUiAt >= 0 ? uiSrc.slice(geneUiAt, uiSrc.indexOf('var geneBranch', geneUiAt)) : '';
  /* ⚠️ 长寿 LV2 改后恰好是 merchant:40/freeze:10/warm:10（等于改前 LV1），
   * 不能拿它当「旧值残留」标志，否则断言假红。旧值标志只取改前 LV2/LV3 独有的档。 */
  check('面板展示表无遗留旧值 20/40/60 与 60/120/240',
    geneBlock.length > 200 &&
    geneBlock.indexOf('{ value: 20 }, { value: 40 }, { value: 60 }') < 0 &&
    geneBlock.indexOf('{ value: 60 }, { value: 120 }, { value: 240 }') < 0 &&
    geneBlock.indexOf('merchant: 80, freeze: 20, warm: 20') < 0 &&
    geneBlock.indexOf('merchant: 120, freeze: 40, warm: 40') < 0,
    '基因展示块字节=' + geneBlock.length);
  check('面板展示表已写入砍半后的新值',
    geneBlock.indexOf('{ value: 10 }, { value: 20 }, { value: 30 }') >= 0 &&
    geneBlock.indexOf('{ value: 5 }, { value: 10 }, { value: 15 }') >= 0 &&
    geneBlock.indexOf('{ value: 30 }, { value: 60 }, { value: 120 }') >= 0 &&
    geneBlock.indexOf('merchant: 20, freeze: 5, warm: 5') >= 0,
    '');
  check('面板联动说明文字同步为 +10% 基础值',
    uiSrc.indexOf('Math.round(10 * (1 + bonus / 100))') >= 0, '');
}
