/* e2e suite: 科技「解锁建筑」列表必须把挑战专属建筑标注出来（琥珀角标），
 * 否则基游戏研究普通科技后，在解锁列表看到专属建筑却建不出来（显示解锁、实际没解锁）。
 * 2026-11-08 实装（用户选 B：琥珀角标，与建筑卡/科技树同款视觉）。 */
import fs from 'node:fs';
export function run({ SB, check, noop }) {
  console.log('\n=== 科技解锁列表·挑战专属标注 ===');
  const eff = SB.tech.effectText;
  const byId = SB.tech.byId;

  /* metalrefine（金属精炼，普通科技）unlockBuild 含 tidemachine（水体污染专属）。
   * 断言：效果文案里仅潮汐往复机带 .co-tag 角标（总数=1），且角标紧贴其名。 */
  const t1 = byId('metalrefine');
  const e1 = eff(t1);
  const c1 = (e1.match(/co-tag/g) || []).length;
  check('金属精炼解锁列表：仅潮汐往复机（水体污染专属）带琥珀角标（总数=1、紧贴其名）',
    !!t1 && c1 === 1 && e1.indexOf('潮汐往复机<span class="co-tag"') >= 0,
    'co-tag×' + c1);

  /* alien_eng（外星工程，普通科技）unlockBuild 含 enladofarm（水体污染专属）+ mars_workshop（普通）。 */
  const t2 = byId('alien_eng');
  const e2 = eff(t2);
  const c2 = (e2.match(/co-tag/g) || []).length;
  check('外星工程解锁列表：仅恩拉多克斯阵列风场（专属）带角标（总数=1）',
    !!t2 && c2 === 1 && e2.indexOf('恩拉多克斯阵列风场<span class="co-tag"') >= 0,
    'co-tag×' + c2);

  /* 反验：临时把 tidemachine 的 challengeOnly 摘掉，角标应消失（确保不是误打）。 */
  const B = SB.habitat && SB.habitat.buildingById && SB.habitat.buildingById('tidemachine');
  let saved = B && B.challengeOnly;
  let threw = false;
  try {
    if (B) { B.challengeOnly = undefined; }
    const e1b = eff(t1);
    check('反验：摘掉 tidemachine 的 challengeOnly 后，金属精炼解锁列表不再含角标',
      e1b.indexOf('co-tag') < 0, 'after-strip co-tag@' + e1b.indexOf('co-tag'));
  } catch (e) { threw = true; }
  finally { if (B) B.challengeOnly = saved; }
  check('反验过程未抛错且已还原 tidemachine.challengeOnly', !threw && B && B.challengeOnly === saved);
}
