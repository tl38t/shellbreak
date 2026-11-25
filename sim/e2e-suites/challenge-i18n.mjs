import { loadLocalizedGame } from '../load-sb.mjs';

export function run({ check }) {
  const SB = loadLocalizedGame(['src/ui/render-pane-challenges.js']);
  const s = SB.state.freshRun();
  SB.game.run = () => s;
  const api = SB.challenges;
  const conqueror = api.byId('conqueror');
  const labels = () => Array.from(conqueror.tiers, (_, i) => api.displayText(conqueror, 'tierLabel', i));
  for (const [locale, expected] of [['zh-CN', '一档|二档|三档'], ['zh-TW', '一檔|二檔|三檔'], ['en-US', 'Tier I|Tier II|Tier III']]) {
    SB.i18n.setLocale(locale);
    check(locale + ' 征服者三个档位均使用对应译名', labels().join('|') === expected);
  }
  const untranslated = api.list().flatMap(def => def.tiers.filter((_, i) => {
    const label = api.displayText(def, 'tierLabel', i);
    return !label || /[{}\p{Script=Han}]/u.test(label);
  }).map(t => def.id + ' ' + t.label));
  check('挑战库所有英文档位名均可解析', !untranslated.length, untranslated.join(', '));
  check('征服者通关条件包含吞并七国', api.displayText(conqueror, 'goalText').includes('annex all 7'));
  const prompts = [];
  SB.ui.render = { confirmPanel(options) { prompts.push(options.body); } };
  const meta = SB.game.meta();
  meta.challenges = { completed: {} };
  for (const [tier, expected] of labels().entries()) {
    meta.challenges.completed.conqueror = tier;
    api.prepareStart('conqueror');
    const body = prompts[tier] || '';
    check('征服者开始确认显示 ' + expected, body.includes('Conqueror · ' + expected) && !/\p{Script=Han}/u.test(body));
  }
  const scribeCivic = SB.CIVICS.find(c => c.scribeRename);
  for (const [promoted, job] of [[false, 'Scribe'], [true, 'Official']]) {
    s.civics[scribeCivic.id] = promoted;
    api.prepareStart('science');
    const body = prompts.at(-1);
    check('忽视科文的英文挑战规则使用当前职业 ' + job,
      body.includes(job) && !/\p{Script=Han}/u.test(body));
  }
}
