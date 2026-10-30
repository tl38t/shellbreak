"""重打 TapTap 上传包 rc03（壳厚 10w → 50w 后）。

包结构硬规范（rc01 解析失败实证）：
  解压后必须**只有一个文件夹**，index.html 在那一层里。
判据两条：
  ① 顶层条目数 == 1，且下一层有 index.html
  ② **真解压到 %TEMP% 再 listdir** —— 不信任 zip 目录表
"""
import os
import shutil
import zipfile

SRC = r'D:/shellbreak/TAPTAP-H5-OUTPUT/rc01-upload/shellbreak'
OUT = os.environ.get('SB_TAPTAP_OUT',
    r'D:/shellbreak/TAPTAP-H5-OUTPUT/shellbreak-taptap-public-rc34-v1.0.7.zip')
TOP = 'shellbreak'

# ---------- 打包前：自动同步源码 → 包目录 ----------
#⚠️ 2026-10-07 教训：包目录是**拷贝**，只改 src/ 会打出旧代码（壳厚 500000 那次差点踩）。
#   封包前无条件从仓库根重新同步，不靠人记得手动 cp。
REPO = r'D:/shellbreak'
os.makedirs(SRC, exist_ok=True)
def _sync_tree(src, dst):
    """增量同步：逐文件删除 dst 中源已不存在的文件(规避 safe-delete 批量删除阈值)，再覆盖复制。"""
    if os.path.isdir(dst):
        for root, dirs, files in os.walk(dst, topdown=False):
            for fn in files:
                rel = os.path.relpath(os.path.join(root, fn), dst)
                if not os.path.exists(os.path.join(src, rel)):
                    try: os.remove(os.path.join(root, fn))
                    except OSError: pass
            for d in dirs:
                try:
                    if not os.listdir(os.path.join(root, d)):
                        os.rmdir(os.path.join(root, d))
                except OSError: pass
    if os.path.isdir(src):
        shutil.copytree(src, dst, dirs_exist_ok=True)

for rel in ['index.html']:
    shutil.copy2(os.path.join(REPO, rel), os.path.join(SRC, rel))
_sync_tree(os.path.join(REPO, 'css'), os.path.join(SRC, 'css'))
_sync_tree(os.path.join(REPO, 'src'), os.path.join(SRC, 'src'))
print('已自动同步 index.html / css / src -> 包目录')

# ---------- 运行时素材 ----------
# ⚠️ 2026-10-26 修复（严重的静默缺图）：原脚本只同步 tech-icons / civic-icons 两个子树，
#   导致包内 assets 只有 4 个目录（backgrounds/tech-icons/civic-icons/wonders），
#   而实际被引用的还有 fonts（标题字体 Ma_Shan_Zheng）、building-icons（69 处）、
#   resource-icons（34 处）、achievements（22 处）、ui-era、talent-icons、challenges、
#   company-icons、brand、dyson —— 线上是 404 缺图，而封包断言只查 config.js 文本、
#   完全查不出来。改为按白名单遍历，**排除 assets/store（66M 本地商店素材，不上传）**。
ASSET_DIRS = ['achievements', 'backgrounds', 'brand', 'building-icons', 'challenges',
              'civic-icons', 'company-icons', 'dyson', 'fonts', 'resource-icons',
              'talent-icons', 'tech-icons', 'ui-era', 'wonders']
for _d in ASSET_DIRS:
    _sync_tree(os.path.join(REPO, 'assets', _d), os.path.join(SRC, 'assets', _d))
print('已自动同步 assets/ 的 %d 个子树 -> 包目录（store 本地素材除外）' % len(ASSET_DIRS))

# ---------- 打包前：确认包内源码已是新壳厚 ----------
cfg = os.path.join(SRC, 'src', 'config.js')
with open(cfg, encoding='utf-8') as f:
    body = f.read()
assert 'ICE_SHELL: 500000' in body, '包内 config.js 不是 500000，先同步源码再打包'
with open(os.path.join(SRC, 'index.html'), encoding='utf-8') as f:
    idx = f.read()
#版本号跟着实际值走，别写死（写死过 ?v=134，每次 bump 都要改脚本，必然漏）
assert '?v=' in idx, '包内 index.html 缺 cache-buster 版本号'
# 手动倍速按钮已下线（用户 2026-10-07拍板：只留看广告 2×）
assert 'data-spd' not in idx, '包内 index.html 仍有手动倍速按钮，源码没同步'
assert 'id="btnAd"' in idx, '包内 index.html 缺广告按钮'
# 壳厚迁移逻辑必须与 config 一起进包（不同步 = 老存档永远跑旧厚度）
# 2026-10-07 后迁移逻辑已从 state.js 拆到 state-migrate.js（SB.stateMigrations.migrateRun）
sm = os.path.join(SRC, 'src', 'state-migrate.js')
with open(sm, encoding='utf-8') as f:
    smbody = f.read()
assert '壳厚版本迁移' in smbody, '包内 state-migrate.js 缺壳厚迁移逻辑，先同步源码再打包'
# 广告位必须已回填（2026-10-07 用户开通后由 MCP 取回 1054324）
# ⚠️ 空串≠占位：ad.js 在无 ID 时不发奖且隐藏控件 ⇒ 打成空串 = 包里没有广告功能，
#   而玩家在真机上完全看不出来（按钮就没了，不是报错）。
assert "SPACE_ID: '1054324'" in body, '包内 config.js 的 AD.SPACE_ID 未回填（自海渊至群星竖屏位1054324），先同步源码'
# dev 兜底口必须是 `adtest` 整词；写成 ad(test)? 会让 ?ad 也命中 = 白送加速
adjs = os.path.join(SRC, 'src', 'ad.js')
with open(adjs, encoding='utf-8') as f:
    abody = f.read()
assert 'adtest\\b(?!=)' in abody, '包内 ad.js 的 devMode 判定被改宽了（应为 adtest 整词 + (?!=)），先同步源码'
# 排行榜 9 个 ID 必须已回填（2026-10-26 于现行主体 996563 全部重建；
#   旧 963517 的 7 个 ID 已作废——996563 上 list_leaderboards 曾返回 0 条）
# ⚠️ 同广告位坑：rank.js 无 ID 时不提交且入口隐藏 ⇒ 空串包 = 榜功能静默消失。
LB_IDS = ('wk8s9lkm23g2eihkz8', 'zgq97kctyiqffhcr9p', 'riikrs1jp5m6a1nyjy',
          'ew5xr8ex1y75ndd9kd', 'dl64gq9ao80hvnn5j8', '3o19a9rpfhm8bnbe94',
          'peq757lhctr3dqzx8j', 'bvn169c2u30f2xhmqj', '6bi4710gm6oswyed0m')
missing = [i for i in LB_IDS if i not in body]
assert not missing, f'包内 config.js 的 RANK.LB 缺榜 ID: {missing}，先同步源码'
print('打包前置检查: OK (500000 + cache-buster + 无手动倍速 + 广告按钮 + 壳厚迁移 + 广告位1054324 + dev口收紧 + 排行榜9ID)')

# ---------- 打包前置检查 ②：Ver1.0.3 的四条 P0 修复必须真的在包里 ----------
# ⚠️ 2026-10-07 教训的同类：包目录是**拷贝**，只改仓库不改包 = 打出一份没修的版本，
#   而玩家侧表现与修复前一模一样（会再被当成"没修好"）。这四条都是本版的核心修复，
#   少任何一条这个包就等于白打，故逐条断言，宁可打不出来也不要打出假的。
def _read(rel):
    with open(os.path.join(SRC, rel), encoding='utf-8') as f:
        return f.read()

_gm = _read('src/game.js')
# ① 云端救援就地接管（存在即说明没回退到 installImportedSave + reload）
assert 'function adoptBundle(bundle)' in _gm, '包内 game.js 缺 adoptBundle（云端救援仍会 reload）'
# ② 分段超时：三条出口必须都在，且 proceeded 互斥旗在
assert 'var proceeded = false;' in _gm and 'function finishResumed(' in _gm, '包内 game.js 缺 boot 分段超时出口'
assert "arm(8000, function () { toCloud(); });" in _gm, '包内 game.js 缺 recoverAsync 段超时'
assert "arm(12000, function () { pauseRecovery(" in _gm, '包内 game.js 云端超时仍会开新档'
# ③ 写入后读回校验（本机存储不可靠时当场中止，而不是 reload 成重载环）
assert '本机存储不可靠：写入后读回的内容不一致' in _gm, '包内 game.js 缺导入写后读回校验'
# ④ 更新日志本会话内存去重（2026-10-28 起改红点驱动，旗名 changelogShown → changelogSigned）
assert 'var changelogSigned = false;' in _gm, '包内 game.js 缺更新日志会话去重'

_inp = _read('src/ui/input.js')
# ⑤ 逃生分支必须排在 `var s = run(); if (!s) return;` 之前 —— 顺序错了等于没修。
# ⚠️ 按**行号**比较，不按字符偏移：源码是 CRLF，写 `'a;\n  b;'` 这种跨行子串永远找不到，
#   而且注释里也有同名片段（第 81 行的纪律注释），子串匹配会命中错的那一处。
_il = _inp.split('\n')
_esc_line = next((i for i, ln in enumerate(_il) if ln.strip().startswith('if (d.modalClose !== undefined)')), -1)
_gate_line = next((i for i, ln in enumerate(_il)
                   if ln.strip() == 'var s = run();'
                   and i + 1 < len(_il) and _il[i + 1].strip() == 'if (!s) return;'), -1)
assert _esc_line > 0 and _gate_line > 0, \
    f'包内 input.js 找不到关弹窗分支或 S 判空闸门（esc_line={_esc_line}, gate_line={_gate_line}）'
assert _esc_line < _gate_line, \
    f'包内 input.js 的关弹窗分支又被挪到 S 判空之后了（esc_line={_esc_line} 应小于 gate_line={_gate_line}）'

_ob = _read('css/onboarding.css')
# ⑥ 弹窗期间压住引导层（它是 pointer-events:auto + z-index:100001，会吃掉所有点击）
assert 'body.modal-open .ob-welcome' in _ob, '包内 onboarding.css 缺「弹窗期间隐藏引导层」规则'

# ⑦ Ver1.0.4-test 那三个测试开关（静默启动 / 触摸水波纹 / 按下即关）必须**不在**包里。
#   2026-10-28 用户拍板：新手引导与解锁叙事恢复启动自动弹，测试开关整段摘除（不是置 false）。
#   ⚠️ 这条反过来锁：一旦有人把测试代码带回来，打包当场失败，不会漏发出去。
assert 'installTouchPing' not in _gm, '包内 game.js 仍残留触摸诊断层 installTouchPing（测试开关未摘净）'
assert 'TEST_QUIET_BOOT' not in _gm, '包内 game.js 仍残留 TEST_QUIET_BOOT 判定（启动弹窗被静默了）'
assert 'onClosePointerDown' not in _inp, '包内 input.js 仍残留「按下即关」通路 onClosePointerDown'
# 反向护栏：解锁叙事 + 新手引导的自动弹必须真的在 bootUi 里（摘开关别把功能一起摘了）
assert 'if (SB.onboarding && SB.onboarding.start) SB.onboarding.start(S);' in _gm, \
    '包内 game.js 的新手引导自动弹没接回去'
assert 'maybeTabUnlockPopups(S);' in _gm, '包内 game.js 的解锁叙事自动弹没接回去'

_cfg = _read('src/config.js')
assert "VERSION: 'Ver1.0.8'" in _cfg, '包内 config.js 版本号不是 Ver1.0.8'
assert "v: 'Ver1.0.8'" in _cfg, '包内 config.js 更新日志缺 Ver1.0.8 条目'
# Ver1.0.8 玩家可见 3 条：1 修（补算活锁）+ 2 新增/改进（追踪多目标 / 壳 25% 下限提示）。
# 逐条钉死，漏一条这次等于白改。
for _kw in ['卡好几分钟', '最多能同时追踪 4 个目标', '被动削壳到 25%']:
    assert _kw in _cfg, '包内 config.js 的 Ver1.0.8 更新日志缺条目：' + _kw
assert "v: 'Ver1.0.7'" in _cfg, '包内 config.js 更新日志缺 Ver1.0.7 条目'
# Ver1.0.7 玩家可见 6 条（存档接口兜底）：4 修 + 2 改进。逐条钉死，漏一条这次等于白改。
for _kw in ['用云端覆盖本地', '存档编号', '最后几分钟', '同步文件接口可用',
            '当场生效', '「接口」一行']:
    assert _kw in _cfg, '包内 config.js 的 Ver1.0.7 更新日志缺条目：' + _kw
assert "v: 'Ver1.0.6'" in _cfg, '包内 config.js 更新日志缺 Ver1.0.6 条目'
# Ver1.0.6 玩家可见 3 条（就绪门）：2 修 + 1 诊断。逐条钉死，漏一条这次等于白改。
for _kw in ['还没准备好', '一个字节都不会动', '启动等待']:
    assert _kw in _cfg, '包内 config.js 的 Ver1.0.6 更新日志缺条目：' + _kw
assert "v: 'Ver1.0.5'" in _cfg, '包内 config.js 更新日志缺 Ver1.0.5 条目'
# Ver1.0.5 玩家可见 6 条（用户 2026-10-29 21:02 拍板清单）逐条钉死：3 修 + 3 新增。
for _kw in ['轮回商店里买过的强化', '天穹钻机明明在转', '商人共和国是 5 个卡槽',
            '立即保存', '顶栏的资源格现在可以点开看明细', '建造追踪']:
    assert _kw in _cfg, '包内 config.js 的 Ver1.0.5 更新日志缺条目：' + _kw

# ---------- 存档诊断 + 三个 P0（2026-10-29 / Ver1.0.4）----------
# 这一批全是「玩家报存档没了」的对策，任何一条漏进包里都等于白改，所以逐条钉死。
_ss = _read('src/save-storage.js')
_st = _read('src/state.js')
_stf = _read('src/save-transfer.js')
assert "shellbreak.diag.v1" in _ss, '包内 save-storage.js 缺独立诊断 key（遥测会再次消失）'
assert "shellbreak.emergency.v1" in _ss, '包内 save-storage.js 缺尸检副本 key'
assert 'function preserveEmergency(' in _ss, '包内 save-storage.js 缺 preserveEmergency（旧档会在开新档时被覆盖）'
assert 'function diagText(' in _ss and 'function diagBrief(' in _ss, '包内 save-storage.js 缺诊断文本出口'
# P0-1：门锁必须是「任一可用即进」，且仍要能看到三个探针
_gm2 = _read('src/game.js')
assert 'var rescueGate' in _gm2, '包内 game.js 缺救援门锁变量'
assert 'SB.store.fsAvailable && SB.store.fsAvailable()' in _gm2, '包内 game.js 救援门锁没接 fsAvailable（P0-1 未修）'
assert 'SB.saveTransfer.cloudAvailable && SB.saveTransfer.cloudAvailable()' in _gm2, \
    '包内 game.js 救援门锁没接 cloudAvailable（P0-1 未修）'
assert 'SB.store.preserveEmergency(CFG.RUN_KEY, CFG.SAVE_KEY, go);' in _gm2, \
    '包内 game.js 开新档前没留尸检副本'
# P0-2 / P0-3
assert 'lastFailMirrorAt' in _st, '包内 state.js 缺「主通道失败仍写镜像」的限速状态（P0-2 未修）'
assert 'function patchBadRes(' in _st, '包内 state.js 缺坏键条件补位（P0-3 未修）'
assert 'function verifyLastWrite(' in _st, '包内 state.js 缺写后读回校验'
# 面板出口
assert 'data-save-action="copy-diag"' in _stf, '包内 save-transfer.js 缺「复制诊断信息」按钮'
assert 'data-save-action="export-emergency"' in _stf, '包内 save-transfer.js 缺「导出旧档副本」按钮'
assert 'diagnosticsText: diagnosticsText' in _stf, '包内 save-transfer.js 没导出诊断文本（存档文件里带不上）'
print('存档诊断入包检查: OK (diag key + 尸检副本 + 门锁解耦 + 补位 + 读回校验 + 两个面板出口)')

# ---------- 跨周目遗产系数（2026-10-29 标定）----------
# 用户把旧日艺术品/潮纹碑石的产出系数 0.15 → 1.5（×10，让第二周目开局更快），
# 并把常数从 prestige.js 挪进 CFG.LEGACY.RATE_PER_ITEM。
# 断言只钉「结构」，不钉标定值本身（标定会再调，钉死会逼人改断言）：
#   ★ 常数必须还住在 config.js（否则又变成业务代码里的硬编码魔法数）
#   ★ prestige.js 必须真的读它，且不许残留 `0.15 * harmonic` 的回退写法
_cfgjs = _read('src/config.js')
_pj = _read('src/prestige.js')
assert 'RATE_PER_ITEM' in _cfgjs and 'LEGACY' in _cfgjs, \
    '包内 config.js 缺 LEGACY.RATE_PER_ITEM（遗产系数应只住在这里）'
assert 'CFG.LEGACY.RATE_PER_ITEM' in _pj, '包内 prestige.js 没读 CFG.LEGACY.RATE_PER_ITEM'
assert '0.15 * harmonic(' not in _pj, \
    '包内 prestige.js 仍有硬编码 0.15 × harmonic（遗产系数回退成魔法数了）'
print('遗产系数入包检查: OK (住 config + prestige 在读 + 无 0.15 回退)')

# ---------- TapTap 持久化主链路（2026-10-29）----------
# 四件事必须同时存在，缺任何一条都会退回「关掉就没了」：
#   ① 原生完整快照双版本（a/b）+ 后台快照（hide）—— 每份都同时含 meta/run，
#      否则轮回时 run 与 meta 会来自不同周目；
#   ② 写队列只保留最新一笔（旧档不可能晚于新档落盘）+ 写后读回比对；
#   ③ onHide 走同步写入（异步回调在进程被冻/被杀时不会回来）；
#   ④ 启动扫描分三态：found / uncertain / absent，「不确定」绝不开新局。
assert 'function scanSaveCandidates(' in _ss, '包内 save-storage.js 缺启动扫描'
assert "'/shellbreak-save-' + slot" in _ss, '包内原生存档没有双版本+后台快照三个落点'
assert 'function writeNativeNext(' in _ss and 'nativePending = rec' in _ss, \
    '包内原生写入没有「失败保留、按 seq 追最新」的队列'
assert '原生文件写后读回不一致' in _ss, '包内原生写入缺写后读回校验'
assert 'function flushNativeSync(' in _ss and 'function writeNativeSaveSync(' in _ss, \
    '包内缺 onHide 用的同步原生存档写入'
assert 'tap.onHide(' in _gm2, '包内 game.js 没接 tap.onHide（后台保存不触发）'
assert 'flushNativeSync()' in _gm2, '包内 onHide 没有同步落盘'
assert "cloud.status === 'absent' || cloud.status === 'unavailable'" in _gm2, \
    '启动分支把「云端明确没有」也当成了不确定（会死锁新玩家）'
assert 'function forceFreshBoot(' in _gm2 and 'forceFreshBoot: forceFreshBoot' in _gm2, \
    '恢复暂停界面缺显式出口或被藏进闭包'
assert 'function showRecoveryPending(' in _stf, '包内 save-transfer.js 缺恢复暂停界面'
assert "CLOUD_PREVIOUS = 'shellbreak_previous'" in _stf, '包内云端没有上一版本槽'
assert '云端存档较新，已停止自动覆盖' in _stf, '包内云端防倒退守卫缺失'
assert "_saveSeq: 0," in _st, '包内 freshRun 没登记 _saveSeq（读档会被 migrateRun 丢掉）'
print('TapTap 持久化入包检查: OK (双版本快照 + 写队列 + 读回校验 + onHide 同步 + 三态扫描 + 云端双槽)')

# ---------- 手动「立即保存」（2026-10-29 用户「给玩家一个我保存了的感觉」）----------
# 三件事必须一起进包，缺一个这个功能就是残的：
#   ① 两处入口（存档管理面板 + 设置栏）—— 只做一处的话，玩家在另一个界面里找不到；
#   ② 写后读回**必须比对 _ts** —— 只 JSON.parse 会把「容器假成功、读回的是上一份旧档」
#      判成保存成功（本版实现时探针 C/D 分支就是这么抓到的），那等于面板撒谎；
#   ③ saveNow 必须导出 —— 设置栏按钮与 CDP 探针都靠它，藏在闭包里等于没实现。
assert 'id="btnSettingsSaveNow"' in idx, '包内 index.html 缺设置栏「立即保存」按钮'
assert 'id="saveNowHint"' in idx, '包内 index.html 缺手动保存的反馈位（点完没结论）'
assert 'data-save-action="save-now"' in _stf, '包内 save-transfer.js 缺面板「立即保存」按钮'
assert 'function saveNow(' in _stf, '包内 save-transfer.js 缺 saveNow 实现'
assert 'Number(back._ts) !== Number(snap._ts)' in _stf, \
    '包内 saveNow 的写后读回退化成「只 parse 了」（容器假成功会被判成已保存）'
assert 'saveNow: saveNow' in _stf, '包内 save-transfer.js 没导出 saveNow'
print('手动保存入包检查: OK (两处入口 + 读回比对 _ts + 已导出)')

# ---------- 打包前置检查 ③：正式包不许带任何 -test 痕迹 ----------
# ⚠️ 2026-10-28 教训：测试包（Ver1.0.4-test）是用来给 iOS 玩家做二分实验的，开关会把自动弹窗
#   和新手引导全关掉、还挂一个诊断浮层。既然已拍板摘除，就用「版本名 / 更新日志 / 开关」三处
#   同时不含 `-test` 与 `TEST_` 来锁死，任何一处漏网都打不出包。
#   取行用 startswith('VERSION:')：注释里也有 "VERSION =" 之类的字样，裸 in 会命中错的行。
_vline = [ln for ln in _cfg.split('\n') if ln.strip().startswith('VERSION:')][0]
assert '-test' not in _vline, '包内 config.js 版本名仍带 -test：%s' % _vline.strip()
assert 'TEST_QUIET_BOOT:' not in _cfg and 'TEST_TOUCH_PING:' not in _cfg \
    and 'TEST_CLOSE_ON_POINTERDOWN:' not in _cfg, '包内 config.js 仍残留 TEST_* 开关定义'
assert "-test'" not in _cfg, '包内 config.js 的 CHANGELOG 仍残留 -test 版本条目'
print('正式版洁净度: OK (版本名无 -test / 无 TEST_* 开关 / 无 test 日志条目 / 引导与叙事自动弹在位)')
# ⑧ 节能减耗三处同源：tick / rates 都必须乘 cardHappyConsumeMul
_base = _read('src/economy.js')
_rates = _read('src/economy-rates.js')
assert _base.count('cardHappyConsumeMul') >= 2, '包内 economy.js 的节能减耗乘区缺失（tick 侧）'
assert 'cardHappyConsumeMul' in _rates, '包内 economy-rates.js 的节能减耗乘区缺失（面板侧）'
# ⑨ 议价曲线必须是**等比递减**（2026-10-29 用户拍板「改成真边际效益」，上限 60%）。
#   ① 形状：`lim*(1-ρ^n)` 里的 Math.pow(rho, _n) 必须在
#   ② 分家：hallMulAt 不许再调 getLimitedDR —— 那条曲线 0.75 次幂末段会回升
#      （议事厅曾 19 级 +1.55%、24 级 +3.16%），与「越升越少」正好相反
#   ③ 字段：topLvl 已删除，UI 若还引用会显示 undefined 或假的「N 级到顶」
assert 'var HALL_SAVE = 0.025;' in _base, '包内议价首级省耗率不是 0.025'
assert 'var HALL_DR_BASE = 0.60;' in _base, '包内议价渐近上限不是 60%'
assert 'Math.pow(rho, _n)' in _base, '包内议价不是等比递减公式（可能被改回 DR 曲线）'
_mul_seg = _base.split('function hallMulAt')[1].split('function hallDiscount')[0]
assert 'getLimitedDR' not in _mul_seg, '议价又调回 getLimitedDR 了（该曲线末段回升，与「越升越少」相反）'
for _ui in ('src/ui/render-info.js', 'src/ui/render-pane-village.js'):
    assert 'topLvl' not in _read(_ui), _ui + ' 仍引用已删除的 hallInfo.topLvl（会渲染出假「到顶」）'
print('P0 修复入包检查: OK (adoptBundle + 分段超时×2 + 写后读回 + 日志去重 + 逃生分支顺序 + 引导层压制 + 版本号/日志 + 节能减耗三落点 + 议价等比曲线)')


# ---------- 运行时就绪门（2026-10-30 / Ver1.0.6）----------
# 事故：`main.js` 在 DOMContentLoaded 里**同步** boot，那一刻 TapTap 原生桥可能还没
#   注入 `tap` ⇒ 三项能力全假 ⇒ 被读成「这台机器没有存档能力」⇒ startRun 并立刻落盘
#   ⇒ 5 秒后自动存档把新档写进 shellbreak-save-a/b，唯一的好档销毁。
# 形状与《小区门卫模拟器》2026-10-24 的公告逐字一致（玩家报「更新后第一次打开没档」）。
# 下面五条缺任何一条，这个洞就还开着：
#   ① 三态判别：capReady（能力齐）与 runtimeHinted（像小游戏容器）必须分开；
#      hint 只决定「值不值得等」，绝不可当 ready 用。
#   ② 超时出口是**暂停**，不是 startRun。
#   ③ 超时时若 localStorage 本来就有可读档 ⇒ 直接放行（否则 UA 误判会把网页版卡死）。
#   ④ 原生槽写保护：tap 未就绪时开的新档不许覆盖还没被看见的旧档。
#   ⑤ 晚到补偿：tap 晚到后重扫本机，把更完整的旧档提出来让玩家选，选之前不落盘。
_gm3 = _read('src/game.js')
assert 'function capReady(' in _gm3 and 'function runtimeHinted(' in _gm3, \
    '包内 game.js 缺就绪门三态判别（tap 慢注入仍会被当新玩家）'
assert 'if (!capReady() && runtimeHinted()) { waitRuntime(); return; }' in _gm3, \
    '包内 boot 没过就绪门'
assert "gateFinish('timeout')" in _gm3, '包内就绪门缺超时出口'
assert 'timeout-local' in _gm3, \
    '包内就绪门超时没区分「localStorage 已有档」（网页版会被误卡在恢复界面）'
assert 'function openFreshRun(' in _gm3, '包内 game.js 缺开新档统一入口'
assert 'function armLateRescue(' in _gm3 and 'function offerLateRescue(' in _gm3, \
    '包内缺晚到补偿（tap 晚到后旧档无法捞回）'
assert 'setNativeHold(true)' in _gm3, '包内开新档时没打开原生槽写保护'
assert 'setNativeHold(false)' in _gm3, \
    '包内写保护没有解除点（玩家会永远只剩 localStorage 一条命）'
_ss3 = _read('src/save-storage.js')
assert 'function setNativeHold(' in _ss3, '包内 save-storage.js 缺 setNativeHold'
# ⚠️ 不要数 `nativeHold ||` 的字符串出现次数（2026-10-30 改）：三处判据的结构本来就不一样，
#    flushNativeSync 改成分支式之后计数直接从 3 掉到 2，那是断言脆、不是代码坏。
#    改成逐函数检查「函数体里确实读了写保护」，与写法无关。
for _fn in ['function writeNativeSave(', 'function flushNativeSync(', 'function writeNativeSaveSync(']:
    _i = _ss3.find(_fn)
    assert _i >= 0, '包内 save-storage.js 缺 ' + _fn
    assert 'nativeHold' in _ss3[_i:_i + 1400], '包内 ' + _fn + ' 没接原生槽写保护'
# Ver1.0.7 兜底：没有同步文件接口时必须能退到 tap.setStorageSync，且门槛不能把兜底一起掐掉。
assert 'function shapeText(' in _ss3, '包内 save-storage.js 缺接口形态探测（玩家诊断看不出缺哪条通道）'
assert "syncLastState = 'kv'" in _ss3, '包内同步落盘没有 kv 兜底分支'
assert 'setStorageSync' in _ss3, '包内没有用 tap.setStorageSync（官方承诺长期保留的唯一通道）'
# 三条落点：门槛拆掉 / 导入打新号 / 云端覆盖就地接管。缺任何一条，玩家那台机器上仍然救不回来。
_gm7 = _read('src/game.js')
assert '原生文件未确认写入，导入已中止' not in _gm7, \
    '包内导入仍挂着原生硬门槛（没有同步文件 API 的机型上「云端覆盖本地」会 100% 中止）'
assert '_saveSeq = SB.store.nextNativeRevision()' in _gm7, \
    '包内导入没打本机新 seq（导完重启会输给刚被顶掉的那一份）'
assert 'adoptBundle' in _read('src/save-transfer.js'), \
    '包内「用云端覆盖本地」没走就地接管'
# 反向护栏：writeNativeSave 不许再因为「没有文件系统」整个早退 —— 那会把 kv 兜底一起掐死。
assert "if (!fsAvailable()) {\n      if (!syncStorageAvailable()) return Promise.resolve(false);" in _ss3, \
    '包内 writeNativeSave 仍因无文件系统早退（kv 兜底永远不会被触发）'
assert 'autoPumpTimer' in _read('src/save-transfer.js'), \
    '包内云备份定时器不是幂等的（就绪门重入会装出两个 30 秒定时器）'
print('就绪门入包检查: OK (三态判别 + 超时暂停/local 放行 + 写保护 + 晚到补偿 + 定时器幂等)')

# 包内素材必须齐全（2026-10-26 补：rc15 及之前只同步两个 icons 子树，
# 线上缺 fonts / building-icons / resource-icons / achievements 等 ⇒ 静默 404 缺图）
_missing_assets = []
for _d in ASSET_DIRS:
    _p = os.path.join(SRC, 'assets', _d)
    if not os.path.isdir(_p) or not os.listdir(_p):
        _missing_assets.append(_d)
assert not _missing_assets, f'包内 assets 缺目录或为空: {_missing_assets}，先同步素材'
assert os.path.isfile(os.path.join(SRC, 'assets', 'fonts', 'Ma_Shan_Zheng.woff2')), '包内缺标题字体 Ma_Shan_Zheng.woff2'
print('素材检查: OK (%d 个子树齐全 + 标题字体在位)' % len(ASSET_DIRS))

# ---------- 打包 ----------
n = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, files in os.walk(SRC):
        dirs.sort()
        files.sort()
        for fn in files:
            p = os.path.join(root, fn)
            rel = os.path.relpath(p, SRC).replace(os.sep, '/')
            z.write(p, f'{TOP}/{rel}')
            n += 1
print(f'files = {n}  sizeKB = {round(os.path.getsize(OUT) / 1024, 1)}')

# ---------- 判据 ①：zip 目录表 ----------
with zipfile.ZipFile(OUT) as z:
    names = z.namelist()
    tops = sorted({x.split('/')[0] for x in names})
    print('①顶层 =', tops, 'count =', len(tops), '->', 'PASS' if len(tops) == 1 else 'FAIL')
    print('  index.html =', [x for x in names if x.endswith('/index.html')])
    print('  根下游离文件 =', [x for x in names if '/' not in x.rstrip('/')])
    junk = [x for x in names if any(s in x for s in ('.DS_Store', 'assets/store/', 'shots/', '__MACOSX'))]
    print('  垃圾条目 =', junk)

# ---------- 判据 ②：真解压 ----------
TMP = os.path.join(os.environ['TEMP'], 'sb-rc03-unzip-verify')
if os.path.isdir(TMP):
    shutil.rmtree(TMP)
os.makedirs(TMP)
with zipfile.ZipFile(OUT) as z:
    z.extractall(TMP)
entries = os.listdir(TMP)
dirs = [e for e in entries if os.path.isdir(os.path.join(TMP, e))]
files = [e for e in entries if os.path.isfile(os.path.join(TMP, e))]
print('② 解压根下 =', entries, '文件夹 =', dirs, '游离文件 =', files)
print('  ->', 'PASS' if len(dirs) == 1 and not files else 'FAIL')

root = os.path.join(TMP, dirs[0])
inner = sorted(os.listdir(root))
print('  该层内容 =', inner)
print('  index.html 在里面 ->', 'PASS' if 'index.html' in inner else 'FAIL')

total = sum(len(f) for _, _, f in os.walk(root))
print('  解压后文件总数 =', total, '(打包写入 %d)' % n, '->', 'PASS' if total == n else 'FAIL')

# ---------- 判据 ③：解压出来的壳厚必须是 50 万、广告位必须已回填 ----------
with open(os.path.join(root, 'src', 'config.js'), encoding='utf-8') as f:
    lines = [ln.strip() for ln in f]
got = [ln for ln in lines if 'ICE_SHELL:' in ln]
print('③ 解压后 config.js 壳厚 =', got, '->', 'PASS' if 'ICE_SHELL: 500000' in got[0] else 'FAIL')
sid = [ln for ln in lines if 'SPACE_ID:' in ln]
print('   解压后 AD.SPACE_ID   =', sid,
      '->', 'PASS' if sid and "'1054324'" in sid[0] else 'FAIL')

# ---------- 判据 ④：解压后的 index.html 不能带手动倍速、必须带广告控件 ----------
with open(os.path.join(root, 'index.html'), encoding='utf-8') as f:
    idx2 = f.read()
print('④ 解压后 data-spd 数量  =', idx2.count('data-spd'), '->', 'PASS' if 'data-spd' not in idx2 else 'FAIL')
print('   解压后广告控件 btnAd  =', 'PASS' if 'id="btnAd"' in idx2 else 'FAIL')
print('   解压后 config 版本号  =',
      [ln.strip() for ln in idx2.split('\n') if 'src/config.js?v=' in ln])

shutil.rmtree(TMP)
print('\n临时验证目录已清理')
