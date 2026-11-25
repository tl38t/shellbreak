import { loadLocalizedGame } from '../load-sb.mjs';

export function run({ check }) {
  const SB = loadLocalizedGame(['src/war.js', 'src/ui/render-pane-research.js', 'src/ui/render-pane-war.js',
    'src/ui/heritage-draft.js', 'src/ui/war-toast.js']);
  const s = SB.state.freshRun();
  SB.game.run = () => s;
  s.techs.navigation = s.civics.military_training = true;
  s.pop = 42;
  const ids = ['card_vr', 'card_archaeology', 'card_overseas_advertising'];
  const heritage = SB.heritage.ensure(s);
  heritage.pending.push({ stage: 6, options: ids });
  const { paneWar, research } = SB.ui.renderParts;
  const pool = SB.heritage.poolIds();
  const han = /\p{Script=Han}/u;
  const unresolved = /[{}]/;
  for (const [locale, names] of [
    ['zh-CN', ['虚拟现实', '考古发掘', '海外宣传']],
    ['zh-TW', ['虛擬現實', '考古發掘', '海外宣傳']],
    ['en-US', ['Virtual Reality', 'Archaeological Dig', 'Overseas Advertising']],
  ]) {
    SB.i18n.setLocale(locale);
    const draft = SB.ui.showHeritageDraft(s);
    check(locale + ' 第六阶传承弹窗显示对应语言的三张原卡',
      draft.stage === 6 && draft.options.every((c, i) => c.id === ids[i] && c.name === names[i]));
    const missing = pool.filter(id => {
      const card = research.heritageCard(s, id);
      return !card.name || card.name === id || !card.desc || unresolved.test(card.desc) ||
        (locale === 'en-US' && han.test(card.name + card.desc));
    });
    check(locale + ' 整个传承卡池的名称、效果和数值占位符均已解析', !missing.length, missing.join(', '));
  }
  const [vr, dig, ads] = SB.ui.lastHeritageDraft().options;
  check('英文传承三张示例的效果与卡牌定义一致',
    vr.desc.includes('−1% per Merfolk') && vr.desc.includes('−60%') &&
    dig.desc.includes('+25%') && ads.desc.includes('1%'));
  const stale = Object.keys(SB.heritage.HERITAGE_DESC).filter(id =>
    /\b(retire[sd]?|replaces?|equipped|unequip)\b/i.test(research.heritageCard(s, id).desc));
  check('传承专属效果省去政策卡的装卸和退役条件，政策卡仍显示自身条件',
    !stale.length && /Retires/.test(research.policyDesc(SB.heritage.policyById('card_craft'), s)), stale.join(', '));
  check('星际探索热潮区分每名鲛人的比例和本局总加成',
    research.heritageCard(s, 'card_fever').desc.includes('1%') &&
    research.policyDesc(SB.heritage.policyById('card_fever'), s).includes('+42%'));
  const pick = SB.heritage.choose(s, 0, 'card_vr');
  heritage.owned.push('card_craft');
  const wall = paneWar();
  check('外交收藏墙按当前语言显示新收录卡和旧档中仅有 ID 的卡',
    pick && heritage.pending.length === 0 && wall.includes(vr.name) && wall.includes(vr.desc) &&
    wall.includes(research.heritageCard(s, 'card_craft').desc) && !han.test(wall));
  s.religionName = '潮汐';
  check('外交保留玩家自取的信仰名', paneWar().includes('Converted to 潮汐'));
  s.cards = ['card_cycle_terminus'];
  check('外交按语言显示系统锚定名并保留存档字段',
    paneWar().includes('Converted to the Verge') && s.religionName === '潮汐');
  const enemy = SB.war.currentEnemy(s);
  SB.i18n.setLocale('zh-CN');
  SB.ui.showWarToast('invasion', { type: 'repelled', enemyNameKey: enemy.nameKey, scaleLoss: 100 }, { offline: true });
  const chinese = SB.ui.lastWarResult().text;
  SB.i18n.setLocale('en-US');
  const english = SB.ui.lastWarResult().text;
  check('离线入侵结果在切换语言后按同一场战斗重新显示',
    han.test(chinese) && !han.test(english) && english.includes(SB.i18n.t(enemy.nameKey)) &&
    english.includes(SB.i18n.t('ui.war.toast.repel_title')) &&
    paneWar().includes(english.replace(/'/g, '&#39;')));
  s.war.campaignStage = SB.war.ENEMIES.length;
  check('战役结束后的收藏墙仍使用英文', paneWar().includes(vr.desc) && !han.test(paneWar()));
}
