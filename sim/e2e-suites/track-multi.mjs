/* e2e suite: 多目标追踪（2026-10-30）
 *
 * 背景：追踪态 `s.track` 原来只存**单条** `kind:id[@lv]`，2026-10-30 扩成
 *   「多条用 `|` 连接、上限 4 个」，并新增 `tech:`（尤里卡）/ `civic:`（鼓舞）两种 kind。
 *
 * 这里钉四件事：
 *   ① **老存档兼容**：`s.track` 仍是字符串，旧档那条单记录必须原样能读；字段仍在
 *      `state.freshRun` 里（`migrateRun` 是 `for (k in raw) if (k in base)` 的白名单，
 *      掉一条就静默丢档 —— 同 `_saveSeq` / `_ts` 那条纪律）。
 *   ② **读写往返**：多条进出不得变形；重复去重；超过 4 条按位置截断。
 *   ③ **尤里卡 / 鼓舞**：未达成 → 有行；达成 / 已掌握 → 自动解除；未揭示时**不许泄露真名**。
 *   ④ **建筑带 `@lv` 的识别**：`isTracked('bld', id)` 不能因为后缀而恒 false
 *      （否则按钮永远显示「未追踪」，点了也看不出变化）。
 */
export async function run({ SB, check }) {
  console.log('\n=== 多目标追踪（建筑 / 奇观 / 配方 / 尤里卡 / 鼓舞）===');
  const T = SB.ui && SB.ui.track;
  if (!T) { check('ui.track 已在页面脚本里', false, 'SB.ui.track 不存在'); return; }
  check('ui.track 已在页面脚本里', true);

  const s = SB.state.freshRun();

  /* ── ① 存档字段与老档兼容 ── */
  check('freshRun 里 s.track 是空字符串（迁移白名单必须有它）',
    typeof s.track === 'string' && s.track === '', String(s.track));

  s.track = 'bld:workshop@0';
  check('老档单条串解析为 1 条', T.keys(s).length === 1 && T.keys(s)[0] === 'bld:workshop@0',
    JSON.stringify(T.keys(s)));

  /* ── ② 往返 / 去重 / 截断 ── */
  s.track = 'bld:a@0|tech:writing|civic:craft';
  check('三条不同 kind 的串解析为 3 条', T.keys(s).length === 3, JSON.stringify(T.keys(s)));

  s.track = 'bld:a@0|bld:a@0|tech:writing';
  check('重复 key 去重', T.keys(s).length === 2, JSON.stringify(T.keys(s)));

  s.track = 'a:1|a:2|a:3|a:4|a:5|a:6';
  check('超过上限截断到 4 条（顺序保持）',
    T.keys(s).length === 4 && T.keys(s)[0] === 'a:1' && T.keys(s)[3] === 'a:4', JSON.stringify(T.keys(s)));
  check('上限常量 = 4（用户 2026-10-30 拍板）', T.MAX === 4, String(T.MAX));

  /* ── ③ 尤里卡：未达成 / 达成 / 已掌握 / 未揭示不泄露 ── */
  const tech = SB.tech.byId('writing');
  check('writing 存在且有尤里卡条件', !!tech && !!tech.cond, tech ? JSON.stringify(tech.cond) : 'none');
  if (tech && tech.cond) {
    s.era = Math.max(s.era || 1, tech.era || 1);
    if (tech.cond.t === 'built') s.lvl[tech.cond.b] = 0;
    delete s.techs.writing;
    const r = T.resolve(s, 'tech:writing');
    check('尤里卡未达成 → 解得一行且标红',
      !!r && r.rows.length === 1 && r.rows[0].short === true && !!r.rows[0].txt,
      JSON.stringify(r && r.rows));
    check('标题带「尤里卡 · 」前缀', !!r && /^尤里卡 · /.test(r.title), r && r.title);
    check('未揭示时标题是「未揭露的科技」，不泄露真名',
      !!r && r.title.indexOf('未揭露的科技') >= 0, r && r.title);
    check('尤里卡行永远不是 ready（达成即解除）', !!r && r.ready === false);

    if (tech.cond.t === 'built') {
      s.lvl[tech.cond.b] = tech.cond.n;
      check('达成后自动解除（resolve = null）', T.resolve(s, 'tech:writing') === null,
        JSON.stringify(T.resolve(s, 'tech:writing')));
      s.lvl[tech.cond.b] = 0;
    }
    s.techs.writing = true;
    check('已掌握的科技不再可追', T.resolve(s, 'tech:writing') === null);
    delete s.techs.writing;
  }

  /* ── ④ 鼓舞 ── */
  const civic = (SB.CIVICS || []).find(c => c.boost && c.boost.t !== 'default');
  check('存在带鼓舞条件的市政', !!civic, civic && civic.id);
  if (civic) {
    s.era = Math.max(s.era || 1, civic.era || 1);
    delete s.civics[civic.id];
    const r2 = T.resolve(s, 'civic:' + civic.id);
    check('鼓舞未达成 → 解得一行', !!r2 && r2.rows.length === 1, JSON.stringify(r2 && r2.rows));
    check('标题带「鼓舞 · 」前缀', !!r2 && /^鼓舞 · /.test(r2.title), r2 && r2.title);
    s.civics[civic.id] = true;
    check('市政完成后自动解除', T.resolve(s, 'civic:' + civic.id) === null);
    delete s.civics[civic.id];
  }

  /* ── ⑤ 建筑带 @lv 的识别 ── */
  s.track = 'bld:workshop@3';
  check('isTracked 能认出带 @lv 的建筑（不能恒 false）', T.isTracked('bld', 'workshop', s) === true,
    s.track);
  check('isTracked 不会把别的建筑认成自己', T.isTracked('bld', 'nest', s) === false);

  /* ── ⑥ 脏值一律返回 null（不许抛、不许印假进度） ── */
  check('不存在的科技 id → null', T.resolve(s, 'tech:__nope__') === null);
  check('不存在的市政 id → null', T.resolve(s, 'civic:__nope__') === null);
  check('未知 kind → null', T.resolve(s, 'weird:x') === null);
  check('空串 → null', T.resolve(s, '') === null);

  s.track = '';
}
