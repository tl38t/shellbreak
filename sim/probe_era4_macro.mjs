/* 《宏观经济学》提前到 ERA4 的定向探针（2026-10-30）。
 *
 * 只读、不写档：验证
 *   A 数据契约（era/layer/reqs/cost/鼓舞）
 *   B 前置链在 ERA4 内闭合（重商主义 → 探索 → 中世纪集市）
 *   C ERA4 玩家真的能研究到（blocked===null / canResearch===true）
 *   D 反向：ERA3 必须被纪元闸拦住（否则等于把门开到没人守）
 *   E 反向：缺《重商主义》必须报「需先完成」
 *   F 开门后实际能成立几家公司（这是「提前」的真实收益，不是 7 家全给）
 *   G 等级门槛未被顺手放宽（仍是 ERA8/ERA9 市政）
 *   H 仓储公司乘区（2026-10-31 新增）：capOf 接线 / starExplore 排除 / 公司税卡 / 解散复原 /
 *     数据形状 / 名字池键 / 7 张图标齐全
 *
 * ⚠️ 为什么单独写探针而不只靠 e2e：e2e 的 civics 段只钉数据形状，不跑
 *   「一个 ERA4 状态到底能不能点下去」。而 blocked() 有三道闸（揭示 / 纪元 / 前置 / 文化），
 *   只改 era 不改 reqs 时 e2e 会全绿但玩家一步也走不了 —— 这类假绿必须靠定向探针挡。
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadNoDom, ROOT } from './load-sb.mjs';

const { SB } = loadNoDom();
const C = SB.civic;

let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) {
  if (c) { pass++; console.log('  PASS ' + n); }
  else { fail++; fails.push(n + (e ? ' :: ' + e : '')); console.log('  FAIL ' + n + (e ? ' :: ' + e : '')); }
}

/* 造一个 ERA4 状态的档：只给市政与科技，不跑任何 tick。 */
function era4State(civics, techs) {
  const s = SB.state.freshRun(false);
  s.era = 4;
  s.civics = Object.assign({}, civics);
  s.techs = Object.assign({}, techs || {});
  s.civShown = {};
  return s;
}

console.log('=== A. 数据契约 ===');
const mc = C.byId('macroeconomics');
ok('《宏观经济学》存在', !!mc);
ok('era = 4（原 6）', mc.era === 4, 'era=' + mc.era);
ok('layer = 3（ERA4 收尾列，与《矿物章程》同列）', mc.layer === 3, 'layer=' + mc.layer);
ok('reqs = [mercantilism]（原 [massmedia]，ERA6 前置在 ERA4 走不到）',
  (mc.reqs || []).join() === 'mercantilism', JSON.stringify(mc.reqs));
ok('cost 落在 ERA4 量级（≤90000，旧值 320000 属 ERA6 档）', mc.cost <= 90000, 'cost=' + mc.cost);
ok('鼓舞仍是 built/bank/3 且 bank 是真实建筑',
  mc.boost && mc.boost.t === 'built' && mc.boost.b === 'bank' && mc.boost.n === 3 &&
  SB.BUILDINGS.some(b => b.id === 'bank'),
  JSON.stringify(mc.boost));

console.log('=== B. 前置链在 ERA4 内闭合 ===');
for (const id of ['mercantilism', 'explore', 'market']) {
  const c = C.byId(id);
  ok(id + ' 存在且 era ≤ 4', !!c && (c.era || 1) <= 4, c ? 'era=' + c.era : 'missing');
}
for (const id of ['mercantilism', 'explore']) {
  const c = C.byId(id);
  ok(id + '.reqs 全部命中库内市政', (c.reqs || []).every(r => !!C.byId(r)), JSON.stringify(c.reqs));
}
/* 银行鼓舞的可达性：银行由 ERA4《银行业》解锁，故 ERA4 内能建到 3 级。 */
const banking = (SB.TECHS || []).filter(t => t.id === 'banking')[0];
ok('银行鼓舞在 ERA4 可达（《银行业》era=4 且解锁 bank）',
  !!banking && banking.era === 4 && (banking.eff && (banking.eff.unlockBuild || []).indexOf('bank') >= 0),
  banking ? JSON.stringify({ era: banking.era, unlockBuild: banking.eff && banking.eff.unlockBuild }) : 'missing tech');

console.log('=== C. ERA4 玩家真的能研究到 ===');
const s4 = era4State({ market: true, explore: true, mercantilism: true }, { banking: true });
s4.civShown.macroeconomics = true;
s4.res.culture = mc.cost;
s4.lvl.bank = 3;
ok('blocked === null（揭示✓ 纪元✓ 前置✓ 文化✓）', C.blocked(s4, mc) === null, String(C.blocked(s4, mc)));
ok('canResearch === true', C.canResearch(s4, 'macroeconomics') === true);
ok('鼓舞（银行 3 级）判定成立', C.boostMet(s4, mc) === true);

console.log('=== D. 反向：ERA3 必须被纪元闸拦住 ===');
const s3 = era4State({ market: true, explore: true, mercantilism: true }, { banking: true });
s3.era = 3;
s3.civShown.macroeconomics = true;
s3.res.culture = 1e9;
s3.lvl.bank = 3;
ok('ERA3 blocked 报「纪元未到」', /纪元未到/.test(String(C.blocked(s3, mc))), String(C.blocked(s3, mc)));
ok('ERA3 canResearch === false', C.canResearch(s3, 'macroeconomics') === false);

console.log('=== E. 反向：缺《重商主义》必须报缺 ===');
const s4b = era4State({ market: true, explore: true }, { banking: true });
s4b.civShown.macroeconomics = true;
s4b.res.culture = 1e9;
s4b.lvl.bank = 3;
ok('缺前置 blocked 报「需先完成」', /需先完成/.test(String(C.blocked(s4b, mc))), String(C.blocked(s4b, mc)));

console.log('=== F. 开门后实际能成立几家公司（提前的真实收益）===');
/* ERA4 末的科技姿态：拿到《银行业》，但 ERA6/ERA8 的工业科技一个都没有。 */
const era4Techs = { banking: true, printing: true, masonry: true };
const sf = era4State({ market: true, explore: true, mercantilism: true, macroeconomics: true }, era4Techs);
const found = [], gated = [];
for (const c of (SB.COMPANIES || [])) {
  (SB.companyReqMet(sf, c) ? found : gated).push(c.label);
}
ok('藻食 / 珊瑚 在 ERA4 即成立（零额外前置）',
  found.indexOf('藻食') >= 0 && found.indexOf('珊瑚') >= 0, 'found=' + found.join(','));
ok('只完成《宏观经济学》时可见公司数 = 2（不是 7）', found.length === 2, 'found=' + found.join(','));
ok('钢铁 / 仓储 / 科研 / θ金属 / 工艺 此时全被前置挡住（5 家）',
  gated.length === 5, 'gated=' + gated.join(','));

/* 2026-10-31：钢铁改挂《工坊学校》(civ_steelschool, ERA4·L2，早于母门 L3) —— 这是「开局 3 家」的来源。
 * ⚠️ 注意它**不是必然**：玩家可以跳过 L2 直接走 mercantilism → 宏观经济学，所以探针分两态钉。 */
const sf2 = era4State({ market: true, explore: true, mercantilism: true, macroeconomics: true, civ_steelschool: true }, era4Techs);
const f2 = (SB.COMPANIES || []).filter(c => SB.companyReqMet(sf2, c)).map(c => c.label);
ok('ERA4 完成《工坊学校》后钢铁公司成立 ⇒ 开局 3 家',
  f2.length === 3 && f2.indexOf('钢铁') >= 0, 'found=' + f2.join(','));

/* 仓储公司：ERA5《城市化》(urbanization, ERA5·L2) 才成立。 */
const sf3 = era4State({ market: true, explore: true, mercantilism: true, macroeconomics: true,
  civ_steelschool: true, rationing: true, urbanization: true }, era4Techs);
const f3 = (SB.COMPANIES || []).filter(c => SB.companyReqMet(sf3, c)).map(c => c.label);
ok('ERA5 完成《城市化》后仓储公司成立（第 4 家）',
  f3.length === 4 && f3.indexOf('仓储') >= 0, 'found=' + f3.join(','));
ok('科研 / θ金属 / 工艺 此时仍被挡住（3 家）',
  ['科研', 'θ金属', '工艺'].every(l => f3.indexOf(l) < 0), 'found=' + f3.join(','));

/* 逐家打印门（tech 型与 civic 型都要打，改挂市政后旧打印会漏掉钢铁/仓储）。 */
console.log('    — 逐家门：');
for (const c of (SB.COMPANIES || [])) {
  if (!c.req) { console.log('    · ' + c.label + ' 公司 ← 无额外前置（母门直开）'); continue; }
  if (c.req.tech) {
    const t = (SB.TECHS || []).filter(x => x.id === c.req.tech)[0];
    console.log('    · ' + c.label + ' 公司 ← 科技《' + (t ? t.name : c.req.tech) + '》ERA' + (t ? t.era : '?') + '·L' + (t ? t.layer : '?'));
  } else if (c.req.civic) {
    const v = (SB.CIVICS || []).filter(x => x.id === c.req.civic)[0];
    console.log('    · ' + c.label + ' 公司 ← 市政《' + (v ? v.name : c.req.civic) + '》ERA' + (v ? v.era : '?') + '·L' + (v ? v.layer : '?'));
  }
}

console.log('=== G. 公司等级门槛不受影响（仍是 ERA8/ERA9 市政）===');
const tiers = SB.COMPANY_TIERS;
ok('星球命脉仍要《全球化》', tiers[3].unlockCivic === 'globalization', tiers[3].unlockCivic);
ok('寰宇巨企仍要《太阳系后勤保障》', tiers[4].unlockCivic === 'solar_logistics', tiers[4].unlockCivic);

console.log('=== H. 仓储公司乘区（capOf 接线，2026-10-31 新增）===');
/* ⚠️ 这一段的判据是**比值**，与 CAP_BASE 具体值无关（数值待标定，不在此钉）。
 *   唯一钉死的绝对值是 starExplore：它是结局阈值，必须恒等于 CFG.STAR_CAP。 */
const sS = SB.state.freshRun(false);
sS.era = 8;
sS.civics.macroeconomics = true;
const capIron0 = SB.economy.capOf(sS, 'iron');
const capKelp0 = SB.economy.capOf(sS, 'kelp');
const star0 = SB.economy.capOf(sS, 'starExplore');
ok('未成立时仓储乘区 = 1', SB.companyStorageMul(sS) === 1, 'mul=' + SB.companyStorageMul(sS));
ok('未成立时精铁上限 = CAP_BASE（无乘区泄漏）',
  capIron0 === SB.CFG.CAP_BASE.iron, capIron0 + ' base=' + SB.CFG.CAP_BASE.iron);

/* 只把 storage 推到「全国性企业」(3h，+30%) */
SB.companyState(sS, 'storage').epoch = 1;
sS.t = 1 + 10800;
ok('全国性档乘区 = 1.30', Math.abs(SB.companyStorageMul(sS) - 1.3) < 1e-9, 'mul=' + SB.companyStorageMul(sS));
const capIron1 = SB.economy.capOf(sS, 'iron');
const capKelp1 = SB.economy.capOf(sS, 'kelp');
ok('精铁上限按 ×1.30 抬升（材料分支接线）', Math.abs(capIron1 / capIron0 - 1.3) < 1e-9, capIron0 + ' → ' + capIron1);
ok('藻食上限按 ×1.30 抬升（kelp 分支同样接线）', Math.abs(capKelp1 / capKelp0 - 1.3) < 1e-9, capKelp0 + ' → ' + capKelp1);
ok('starExplore 不受影响（结局阈值不可动）',
  SB.economy.capOf(sS, 'starExplore') === star0, star0 + ' → ' + SB.economy.capOf(sS, 'starExplore'));
ok('starExplore 恒等于 CFG.STAR_CAP', SB.economy.capOf(sS, 'starExplore') === SB.CFG.STAR_CAP,
  SB.economy.capOf(sS, 'starExplore') + ' vs ' + SB.CFG.STAR_CAP);
ok('companyMul("storage") 恒 1（storage 型不进资源产出乘区）',
  SB.companyMul(sS, 'storage') === 1, 'mul=' + SB.companyMul(sS, 'storage'));

/* 公司税卡 ×1.3 作用在**加成本身**：1 + 0.30 × 1.3 = 1.39 */
sS.cards = ['card_corp_tax'];
ok('装《公司税》后乘区 = 1.39', Math.abs(SB.companyStorageMul(sS) - 1.39) < 1e-9, 'mul=' + SB.companyStorageMul(sS));
ok('装卡后精铁上限 = ×1.39', Math.abs(SB.economy.capOf(sS, 'iron') / capIron0 - 1.39) < 1e-9,
  SB.economy.capOf(sS, 'iron'));
sS.cards = [];
ok('撤卡复原到 1.30', Math.abs(SB.companyStorageMul(sS) - 1.3) < 1e-9, 'mul=' + SB.companyStorageMul(sS));

/* 解散后必须整体复原（closeCompany 需要母门，已在上面置真） */
SB.closeCompany(sS, 'storage');
ok('解散后乘区回 1、精铁上限复原',
  SB.companyStorageMul(sS) === 1 && Math.abs(SB.economy.capOf(sS, 'iron') - capIron0) < 1e-9,
  'mul=' + SB.companyStorageMul(sS) + ' cap=' + SB.economy.capOf(sS, 'iron'));

/* 数据契约 */
const stc = (SB.COMPANIES || []).filter(c => c.id === 'storeco')[0];
ok('storeco 数据形状完整（res/label/outLabel/luxBonus/storage/req/tiers/namePool）',
  !!stc && stc.res === 'storage' && stc.storage === true && stc.luxBonus === 0.10 &&
  !!stc.req && stc.req.civic === 'urbanization' &&
  Array.isArray(stc.tiers) && stc.tiers.length === 5 && (stc.namePool || []).length >= 5,
  stc ? JSON.stringify(stc) : 'missing');
ok('storeco 后两档低于生产类公司（0.45 / 0.60 vs 0.50 / 0.70）',
  !!stc && stc.tiers[3].bonus === 0.45 && stc.tiers[4].bonus === 0.60,
  stc ? stc.tiers.map(t => t.bonus).join('/') : 'missing');
ok('storeco 后两档仍受 ERA8/ERA9 市政门控（不只是时长）',
  !!stc && stc.tiers[3].unlockCivic === 'globalization' && stc.tiers[4].unlockCivic === 'solar_logistics',
  stc ? [stc.tiers[3].unlockCivic, stc.tiers[4].unlockCivic].join('/') : 'missing');

/* 名字池接线：键必须用 res（'storage'），不是行业 id（'storeco'）。
 * ⚠️ 历史坑：曾用行业 id 当键 ⇒ 藻食公司永远查不到名字、显示「（未命名）」。 */
const nmS = SB.pickCompanyName('storage');
ok('pickCompanyName("storage") 命中自有名字池（不是回退成「storage公司」）',
  !!nmS && nmS !== 'storage公司' && (stc.namePool || []).indexOf(nmS) >= 0, nmS);

/* 图标资产：每家公司都必须有一张 128×128 PNG，漏图 = 卡片裂图。
 * 读 PNG 的 IHDR（宽高各在固定偏移），不引第三方库。 */
let iconBad = [];
for (const c of (SB.COMPANIES || [])) {
  const p = path.join(ROOT, 'assets', 'company-icons', c.id + '.png');
  if (!fs.existsSync(p)) { iconBad.push(c.id + ':缺文件'); continue; }
  const b = fs.readFileSync(p);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (w !== 128 || h !== 128) iconBad.push(c.id + ':' + w + 'x' + h);
}
ok('7 家公司的图标都在且为 128×128 PNG',
  iconBad.length === 0 && (SB.COMPANIES || []).length === 7, iconBad.join(',') || 'all ok');

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  pass=' + pass + ' fail=' + fail);
if (fail) { console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
