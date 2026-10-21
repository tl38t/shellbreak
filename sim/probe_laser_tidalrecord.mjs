// 验证：激光技术解锁「激光快速雕版」升级；购买后潮纹记录(craft_tidal_record)产出 +50%，不影响成本。
// 覆盖：升级解锁 / recipeCraft 配方专属 / 文案 / ERA10 全局轴回归。
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
function check(name, cond, extra) {
  const ok = !!cond;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ('  ' + extra) : ''));
  ok ? pass++ : fail++;
}
function baseS() {
  return { techs: {}, civics: {}, wonders: {}, upgrades: {}, cards: [],
    lvl: {}, runBuffs: {}, workshopStop: 0, res: {}, pop: 0 };
}

// ① 激光只解锁升级，不直接加成；购买升级后加成才生效
const s1 = baseS(); s1.techs.laser = true;
const m1 = SB.tech.mul(s1);
check('激光科技不直接加 recipeCraft', !m1.recipeCraft || !m1.recipeCraft['craft_tidal_record'], 'got=' + JSON.stringify(m1.recipeCraft));
check('激光不再给全局 workshopEff（应为 0）', m1.workshopEff === 0, 'workshopEff=' + m1.workshopEff);
const sUpg = baseS(); sUpg.techs.laser = true; sUpg.upgrades.upg_laserengrave = true;

// ② 未研究激光：recipeCraft 为空
const s0 = baseS();
const m0 = SB.tech.mul(s0);
check('未研究激光：recipeCraft 为空', !m0.recipeCraft || Object.keys(m0.recipeCraft).length === 0, JSON.stringify(m0.recipeCraft));

// ③ craftMul 只在购买升级后对潮纹记录 +50%，其他配方不受影响
const tidal = SB.workshop.craftById('craft_tidal_record');
const artwork = SB.workshop.craftById('craft_artwork');
check('购买激光快速雕版后 craftMul(tidal) = 1.5', Math.abs(SB.workshop.craftMul(sUpg, tidal) - 1.5) < 1e-9, 'got=' + SB.workshop.craftMul(sUpg, tidal));
check('激光未购买升级：craftMul(tidal) = 1.0', Math.abs(SB.workshop.craftMul(s1, tidal) - 1.0) < 1e-9, 'got=' + SB.workshop.craftMul(s1, tidal));
check('craftMul(artwork) 不受升级影响 = 1.0', Math.abs(SB.workshop.craftMul(sUpg, artwork) - 1.0) < 1e-9, 'got=' + SB.workshop.craftMul(sUpg, artwork));

// ④ 文案与升级定义
const laser = SB.tech.byId('laser');
const engrave = SB.workshop.upgradeById('upg_laserengrave');
check('激光科技解锁文案指向激光快速雕版', laser.unlockDesc.indexOf('激光快速雕版') >= 0, laser.unlockDesc);
check('升级对潮纹记录设置 +50%', !!engrave && engrave.recipeCraft.craft_tidal_record === 0.5, JSON.stringify(engrave));

// ⑤ 回归：ERA10 仍给全局 workshopEff = 1.2（不与激光升级冲突）
const era10 = SB.TECHS.find(t => t.eff && typeof t.eff.workshopEff === 'number' && t.eff.workshopEff === 1.2);
check('找到 ERA10 workshopEff+120% 科技', !!era10, era10 && era10.id);
if (era10) {
  const s2 = baseS(); s2.techs[era10.id] = true;
  const m2 = SB.tech.mul(s2);
  check('ERA10 workshopEff === 1.2（全局）', m2.workshopEff === 1.2, 'got=' + m2.workshopEff);
  check('ERA10 使 craftMul(tidal) 全局 +120% = 2.2', Math.abs(SB.workshop.craftMul(s2, tidal) - 2.2) < 1e-9, 'got=' + SB.workshop.craftMul(s2, tidal));
  const s3 = baseS(); s3.techs.laser = true; s3.techs[era10.id] = true; s3.upgrades.upg_laserengrave = true;
  check('激光升级+ERA10 tidal = (1+1.2+0.5) = 2.7', Math.abs(SB.workshop.craftMul(s3, tidal) - 2.7) < 1e-9, 'got=' + SB.workshop.craftMul(s3, tidal));
  const s3a = baseS(); s3a.techs.laser = true; s3a.techs[era10.id] = true;
  check('激光+ERA10 artwork = (1+1.2+0) = 2.2（配方专属不波及）', Math.abs(SB.workshop.craftMul(s3a, artwork) - 2.2) < 1e-9, 'got=' + SB.workshop.craftMul(s3a, artwork));
}

console.log('\n' + pass + '/' + (pass + fail) + ' PASS');
if (fail) process.exit(1);
