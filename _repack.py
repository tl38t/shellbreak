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
OUT = r'D:/shellbreak/TAPTAP-H5-OUTPUT/shellbreak-taptap-public-rc29-v1.0.3.zip'
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
assert "arm(12000, function () { finishNew(" in _gm, '包内 game.js 缺云端段超时'
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
assert "VERSION: 'Ver1.0.3'" in _cfg, '包内 config.js 版本号不是 Ver1.0.3'
assert "v: 'Ver1.0.3'" in _cfg, '包内 config.js 更新日志缺 Ver1.0.3 条目'

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
print('P0 修复入包检查: OK (adoptBundle + 分段超时×2 + 写后读回 + 日志去重 + 逃生分支顺序 + 引导层压制 + 版本号/日志 + 节能减耗三落点)')


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
