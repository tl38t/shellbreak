/* 探针：验证工坊「升级项可购买」红点核心逻辑 SB.workshop.hasPurchasable(s)。
 * 与科技/市政页签红点同源：活指示，每次 PANE_REFRESH 重算（render.js:550）。 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();

function chk(name, cond, info) {
  console.log((cond ? 'PASS' : 'FAIL') + ' · ' + name + (info ? ' · ' + info : ''));
  if (!cond) process.exitCode = 1;
}

/* ── 假态构造 ──────────────────────────────────────────────── */
function baseState(over) {
  const s = {
    lvl: { workshop: 0 }, techs: {}, civics: {}, res: {}, upgrades: {}, tools: {},
  };
  if (over) Object.assign(s, over);
  return s;
}

/* 工具/升级是否有可买：遍历 + canBuy/upgradeCanBuy（同源门禁）。 */
const has = SB.workshop.hasPurchasable;

/* 1) 工坊没建：所有工具/升级 canBuy 必 false（「需要先建成工坊」门）→ 红点不亮 */
const s0 = baseState();
chk('工坊未建 ⇒ 无可购买（红点灭）', has(s0) === false, 'hasPurchasable=' + has(s0));

/* 2) 工坊已建，但无任何科技/资源 ⇒ 升级被 need/材料门挡 ⇒ 不亮 */
const s1 = baseState({ lvl: { workshop: 1 } });
chk('工坊已建但零科技零资源 ⇒ 不亮', has(s1) === false, 'hasPurchasable=' + has(s1));

/* 3) 工坊已建 + 满足 boomcraft 前置(crewed) + 材料充足 ⇒ 该升级可买 ⇒ 亮 */
const s2 = baseState({
  lvl: { workshop: 1 },
  techs: { crewed: true },
  res: { tiplate: 999999, resonantDrill: 999999, science: 99999999 },
  upgrades: {},
});
const upgBuy = SB.workshop.upgradeCanBuy(s2, 'upg_boomcraft');
chk('boomcraft 在 crewed+材料足时 可购买', upgBuy === true, 'upgradeCanBuy=' + upgBuy);
chk('工坊已建且有可买升级 ⇒ 红点亮', has(s2) === true, 'hasPurchasable=' + has(s2));

/* 4) 已买下 boomcraft 后：owned ⇒ upgradeCanBuy false ⇒ 仍亮取决于是否还有别的 */
SB.workshop.upgradeBuy(s2, 'upg_boomcraft');
chk('买下后 owned ⇒ 该升级不再可买', SB.workshop.upgradeCanBuy(s2, 'upg_boomcraft') === false, 'after buy');
/* 此时若没有其他可买项，红点应灭（验证 owned 项不会卡在「亮」） */
const others = SB.workshop.upgrades().filter(u => u.id !== 'upg_boomcraft');
let anyOther = false;
for (const u of others) { if (SB.workshop.upgradeCanBuy(s2, u.id)) { anyOther = true; break; } }
chk('仅 boomcraft 可买且已买 ⇒ 红点灭（无残留假亮）', has(s2) === anyOther, 'hasPurchasable=' + has(s2) + ' anyOther=' + anyOther);

/* 5) 工坊主标签红点亮的条件是「已解锁 && hasPurchasable」——与 syncTabResearchDots 同式
 * （用独立可买态 s2b，避免被第 4 步买掉 boomcraft 影响） */
const s2b = baseState({
  lvl: { workshop: 1 },
  techs: { crewed: true },
  res: { tiplate: 999999, resonantDrill: 999999, science: 99999999 },
  upgrades: {},
});
const wkUnlocked = !!(s2b && s2b.lvl && s2b.lvl.workshop > 0);
chk('主标签亮条件（解锁 && 可购买）', wkUnlocked && has(s2b) === true, 'wkUnlocked=' + wkUnlocked + ' has=' + has(s2b));

/* 6) 二级标签 avail 仅当「不在 upgrades 子页」——逻辑在 render-pane-workshop.js，这里仅校验 hasPurchasable 作为成分 */
chk('可购买态可作为二级标签 avail 成分', has(s2b) === true);

console.log('---- done ----');
